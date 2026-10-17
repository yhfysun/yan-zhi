/**
 * 任务模式 → 专属智能体 → skill 绑定链 —— 守门测试（2026-09-27，用户拍板 A 方案）。
 *
 * 链路有三段，**任何一段写错都不报错**，只是静默不生效：
 *   ① 任务类型注册表登记 `agentId`（写错 id = 切了类型但智能体没变）；
 *   ② 后端 seed 里必须有那个 id 的智能体（老库未 seed = 找不到，静默沿用当前）；
 *   ③ 智能体挂的 `skill_ids` 必须真实存在于 skill 表（写错 = 技能不注入，静默）。
 *
 * 所以本测试的核心不是"字段有没有填"，而是**三条 id 链必须首尾闭合**：
 *   TASK_TYPES[].agentId  ⊆  智能体定义 id
 *   TASK_TYPES[].skillIds ⊆  智能体定义的 skill_ids  ⊆  内置 skill id
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const TASK_MODE_AGENTS = read('src/builtin-task-mode-agents.ts');
// 抖音运营智能体单独一个 defs 模块（builtin-douyin-agents.ts，见文件头"纯数据模块"的理由）。
// ★ 2026-10-14：抖音引流/带货两个任务类型复用它，seededAgentIds 不读这个文件就会把
//   a_builtin_douyin_agent 误判成"不存在的智能体"——而实际链路是好的（假红比漏报更贵）。
const DOUYIN_AGENTS = read('src/builtin-douyin-agents.ts');
// 店铺运营智能体同样是独立 defs 模块（builtin-shop-agents.ts）。★ 2026-10-16：shop_ops /
//   shop_selection 两个任务类型复用 a_builtin_shop_agent，不读这个文件会把它误判成"不存在"。
const SHOP_AGENTS = read('src/builtin-shop-agents.ts');
const DB = read('src/db.ts');
const USE_CHAT = readRepo('packages/ui/src/composables/chat/useChat.ts');

/**
 * 后端 seed 里出现的全部智能体 id。
 *
 * ★ 两类来源都要抓（踩过）：
 *   · 字面量 `id: 'a_xxx'`（db.ts 内联定义）；
 *   · 常量 `export const XXX_AGENT_ID = 'a_xxx'`（defs 模块的写法，defs 里用 `id: XXX_AGENT_ID`）。
 *   只抓字面量会漏掉整个 defs 模块 —— 断言就会误报"agentId 指向不存在的智能体"。
 */
function seededAgentIds(): Set<string> {
  const ids = new Set<string>();
  const sources = [DB, read('src/builtin-office-agents.ts'), TASK_MODE_AGENTS, DOUYIN_AGENTS, SHOP_AGENTS];
  for (const src of sources) {
    for (const m of src.matchAll(/(?:id:\s*|_AGENT_ID\s*=\s*)'(a_[a-z0-9_]+)'/g)) ids.add(m[1]);
  }
  return ids;
}

/** 取某个智能体定义块：先由 id 找到常量名，再在 defs 数组里切出该条目 */
function agentBlock(id: string): string {
  // 常量声明（如 export const NOVEL_AGENT_ID = 'a_builtin_novel_agent';）
  const constRe = new RegExp(`export const ([A-Z_]+) = '${id}'`);
  const cm = TASK_MODE_AGENTS.match(constRe);
  expect(cm, `★ ${id} 没有对应的常量声明（defs 里无法引用它）`).toBeTruthy();
  const start = TASK_MODE_AGENTS.indexOf(`id: ${cm![1]},`);
  expect(start, `★ defs 里找不到 id: ${cm![1]}`).toBeGreaterThan(-1);
  // 下一条：从当前位置之后再找 `\n    id: `（defs 数组每条以它开头）
  const next = TASK_MODE_AGENTS.indexOf('\n    id: ', start + 1);
  return TASK_MODE_AGENTS.slice(start, next > 0 ? next : undefined);
}

/** 内置 skill id（db.ts 的 builtinSkillDefaults）。
 *  2026-10-08 补第三种写法：`const skillId = 'skill_xxx'`（脚本式局部常量，全小写 skillId，
 *  既不匹配 `id:` 也不匹配 `_SKILL_ID =` → 曾导致 novel_tuiwen 被误报「技能不存在」）。 */
function builtinSkillIds(): Set<string> {
  const ids = new Set<string>();
  for (const m of DB.matchAll(/(?:id:\s*|_SKILL_ID\s*=\s*|skillId\s*=\s*)'(skill_[a-z0-9_]+)'/g)) ids.add(m[1]);
  return ids;
}

/** useChat 里某个函数的源码体（起点函数名，终点下一个 `  function ` 或 `  async function `） */
function useChatFn(name: string): string {
  const start = USE_CHAT.indexOf(name);
  expect(start, `★ useChat 里找不到 ${name}`).toBeGreaterThan(-1);
  const after = USE_CHAT.slice(start + name.length);
  const nextIdx = after.search(/\n  (?:async )?function /);
  return after.slice(0, nextIdx > 0 ? nextIdx : undefined);
}

describe('① 任务类型 → 专属智能体：id 必须真实存在', () => {
  it('★★ 每个非通用类型的 agentId 都必须能对上一个真实的内置智能体', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const known = seededAgentIds();
    const bad: string[] = [];
    let mapped = 0;
    for (const t of TASK_TYPES) {
      // general = 通用（用户当前选的智能体）；parent = 独立父任务容器（子目录各选类型，
      // 父目录本身没有"专属纪律"可言）—— 两者都不绑专属智能体
      if (t.id === 'general' || t.id === 'parent') continue;
      expect(t.agentId, `★★ ${t.id} 没登记 agentId（选了类型但智能体不变 = 专属纪律丢失）`).toBeTruthy();
      mapped++;
      if (!known.has(t.agentId!)) bad.push(`${t.id} → ${t.agentId}`);
    }
    expect(mapped, '★ 一个类型都没登记 agentId').toBeGreaterThanOrEqual(9);
    expect(bad, `★★ agentId 指向不存在的智能体（切类型后智能体不会变，且不报错）:\n${bad.join('\n')}`).toEqual([]);
  });

  it('★ 通用/父任务类型不指定专属智能体（用用户当前选的）', async () => {
    const { getTaskType } = await import('@yan-zhi/shared');
    expect(getTaskType('general').agentId, '★ 通用类型不该绑死智能体').toBeUndefined();
    expect(getTaskType('parent').agentId, '★ 独立父任务类型不该绑死智能体（容器没有专属纪律）').toBeUndefined();
  });

  it('★★ 四个新建的专属智能体必须真的进了 seed', () => {
    for (const id of ['a_builtin_novel_agent', 'a_builtin_script_agent', 'a_builtin_audiobook_agent', 'a_builtin_dubbing_agent']) {
      expect(TASK_MODE_AGENTS, `★ 缺智能体定义 ${id}`).toContain(`'${id}'`);
    }
    // 必须被 db.ts 展开进 seedAgents（只写模块不接进 seed = 库里查不到）
    expect(DB, '★★ builtinTaskModeAgentDefs 未接入 seedAgents（智能体不落库）').toMatch(/\.\.\.builtinTaskModeAgentDefs/);
  });

  it('★ 四个智能体都是 main 类 + force_sync（可在会话选中 / 提示词可下发）', () => {
    for (const id of ['a_builtin_novel_agent', 'a_builtin_script_agent', 'a_builtin_audiobook_agent', 'a_builtin_dubbing_agent']) {
      const blk = agentBlock(id);
      expect(blk, `★ ${id} 不是 main（会话里选不到）`).toMatch(/agent_kind: 'main'/);
      expect(blk, `★ ${id} 缺 force_sync（改了提示词用户拿不到新版）`).toMatch(/force_sync: true/);
      expect(blk, `★ ${id} 缺 category（列表里分不出是任务模式智能体）`).toMatch(/category: '任务模式'/);
    }
  });
});

describe('② 任务类型 → skill：必须真实存在，且挂到了智能体上', () => {
  it('★★ 每个类型的 skillIds 都必须是真实内置 skill', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const known = builtinSkillIds();
    const bad: string[] = [];
    for (const t of TASK_TYPES) {
      for (const sk of t.skillIds || []) {
        if (!known.has(sk)) bad.push(`${t.id} → ${sk}`);
      }
    }
    expect(bad, `★★ skillIds 指向不存在的技能（技能不注入且不报错）:\n${bad.join('\n')}`).toEqual([]);
  });

  it('★★ 智能体挂的 skill_ids 必须覆盖该类型的 skillIds（否则登记了却不生效）', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const missing: string[] = [];
    for (const t of TASK_TYPES) {
      if (!t.agentId || !t.skillIds?.length) continue;
      // 只校验自建的任务模式智能体（翻译/短剧/设计等复用既有智能体，其挂载清单是它们的既有约定）
      if (!TASK_MODE_AGENTS.includes(`'${t.agentId}'`)) continue;
      // ★ defs 里写的是 `skill_ids: JSON.stringify(NOVEL_AGENT_SKILL_IDS)`（常量引用），
      //   所以必须去解析那个常量，而不是在 defs 块里找字面量（我第一版就写错了）。
      const constName = TASK_MODE_AGENTS.match(new RegExp(`const ([A-Z_]*SKILL_IDS) = \\[([\\s\\S]*?)\\];`));
      const block = agentBlock(t.agentId);
      const refName = block.match(/skill_ids: JSON\.stringify\(([A-Z_]+)\)/)?.[1];
      expect(refName, `★ ${t.agentId} 的 skill_ids 不是常量引用，测试需另取`).toBeTruthy();
      const declRe = new RegExp(`export const ${refName} = \\[([\\s\\S]*?)\\];`);
      const decl = TASK_MODE_AGENTS.match(declRe);
      expect(decl, `★★ 找不到常量 ${refName} 的定义`).toBeTruthy();
      const attached = decl![1];
      for (const sk of t.skillIds) {
        if (!attached.includes(`'${sk}'`)) missing.push(`${t.id}: ${refName} 未挂 ${sk}`);
      }
      void constName;
    }
    expect(missing, `★★ 任务类型登记了技能但智能体没挂（登记形同虚设）:\n${missing.join('\n')}`).toEqual([]);
  });

  it('★ 四个新 skill 必须进了内置 skill 定义（否则 id 悬空）', () => {
    for (const sk of ['skill_novel_rewrite', 'skill_script_copy', 'skill_audiobook_production', 'skill_dubbing_production']) {
      expect(DB, `★ 缺 skill 定义 ${sk}`).toContain(`id: '${sk}'`);
    }
  });

  it('★★ 新建 skill 的 body 里不得出现反引号（模板串会被截断）', () => {
    // body 是反引号模板串；正文里再写反引号会提前结束字符串 —— 项目铁律
    const start = DB.indexOf("id: 'skill_novel_rewrite'");
    const end = DB.indexOf('// 批量 upsert 内置 skill');
    const seg = DB.slice(start, end);
    const bodies = seg.match(/body: `([\s\S]*?)`,\n\s*\},/g) || [];
    expect(bodies.length, '★ 没抓到 skill body（切分逻辑要复核）').toBeGreaterThanOrEqual(4);
    for (const b of bodies) {
      const inner = b.replace(/^body: `/, '').replace(/`,\n\s*\},$/, '');
      expect(inner.includes('`'), '★★ body 内含反引号（模板串会被截断成语法错误）').toBe(false);
    }
  });
});

/**
 * ⑤ 抖音引流 / 图文带货两个任务类型（2026-10-14 用户要求补进「任务类型」下拉）。
 *
 * 设计（用户拍板）：**一个智能体两线**——引流线与带货线共用 a_builtin_douyin_agent，
 * 区别在 SOP 与 skill。所以这里除了通用链路闭合，还要钉住"共用 agent 但 skill 不混"：
 * 一旦两条线登记成同一个 skill，选类型时注入的方法论就是错的，且不报错。
 */
describe('⑤ 抖音引流 / 图文带货任务类型：共用智能体、不混 skill', () => {
  it('★★ 两个类型都已登记，且各自动到 a_builtin_douyin_agent', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const traffic = TASK_TYPES.find((t) => t.id === 'douyin_traffic');
    const sell = TASK_TYPES.find((t) => t.id === 'douyin_sell');
    expect(traffic, '★ 缺 douyin_traffic（新建空间下拉里看不到「抖音引流」）').toBeTruthy();
    expect(sell, '★ 缺 douyin_sell（新建空间下拉里看不到「抖音图文带货」）').toBeTruthy();
    expect(traffic!.agentId).toBe('a_builtin_douyin_agent');
    expect(sell!.agentId).toBe('a_builtin_douyin_agent');
    // 一个智能体两线：两条线的 agentId 必须相同（拆成两个 agent 会让用户来回切）
    expect(traffic!.agentId).toBe(sell!.agentId);
  });

  it('★★ 共用的智能体真实存在于 seed，且被 db.ts 展开进 seedAgents', () => {
    expect(DOUYIN_AGENTS, '★ builtin-douyin-agents.ts 里没有该 id').toContain("'a_builtin_douyin_agent'");
    // 只写模块不接进 seed = 库里查不到 → applyTaskTypeAgent 会提示"专属智能体未安装"
    expect(DB, '★★ builtinDouyinAgentDefs 未接入 seedAgents').toMatch(/\.\.\.builtinDouyinAgentDefs/);
    expect(DOUYIN_AGENTS, '★ 抖音运营助手不是 main（会话里选不到）').toMatch(/agent_kind: 'main'/);
    expect(DOUYIN_AGENTS, '★ 缺 force_sync（改了提示词用户拿不到新版）').toMatch(/force_sync: true/);
  });

  it('★★ 两条线的 skill 不混：各挂各的，且都在智能体挂载清单里', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const traffic = TASK_TYPES.find((t) => t.id === 'douyin_traffic')!;
    const sell = TASK_TYPES.find((t) => t.id === 'douyin_sell')!;
    expect(traffic.skillIds).toEqual(['skill_douyin_traffic']);
    expect(sell.skillIds).toEqual(['skill_douyin_sell']);
    // 智能体挂载清单（常量引用，必须解析常量而不是在 defs 块里找字面量）
    const decl = DOUYIN_AGENTS.match(/export const DOUYIN_AGENT_SKILL_IDS = \[([\s\S]*?)\];/);
    expect(decl, '★★ 找不到 DOUYIN_AGENT_SKILL_IDS 定义').toBeTruthy();
    for (const sk of [...traffic.skillIds!, ...sell.skillIds!]) {
      expect(decl![1], `★★ 智能体没挂 ${sk}（登记了却不注入）`).toContain(`'${sk}'`);
    }
    // 两个 skill 的本体必须在内置 skill 定义里（id 悬空 = 注入失败且不报错）
    for (const sk of ['skill_douyin_traffic', 'skill_douyin_sell']) {
      expect(DB, `★ 缺 skill 定义 ${sk}`).toContain(`id: '${sk}'`);
    }
  });

  it('★ SOP 步骤完整，落点都在合法资源目录', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const legal: Array<string> = ['01-reference', '02-work', '03-output', 'none'];
    for (const id of ['douyin_traffic', 'douyin_sell']) {
      const t = TASK_TYPES.find((x) => x.id === id)!;
      expect(t.steps.length, `★ ${id} 的 SOP 是空的（选了类型但没有分步引导）`).toBeGreaterThanOrEqual(5);
      expect(t.guide, `★ ${id} 缺 guide（用户选类型时没有引导文案）`).toBeTruthy();
      for (const s of t.steps) {
        if (s.output !== undefined) {
          expect(legal, `★ ${id} 的步骤「${s.title}」落点非法：${s.output}`).toContain(s.output);
        }
      }
      // 关键步骤必须有确认点（纯提示词的"请确认"不阻塞，模型会边说边跑）
      const confirmed = t.steps.filter((s) => s.confirmTool);
      expect(confirmed.length, `★ ${id} 没有确认点（会一路跑完不停下来）`).toBeGreaterThanOrEqual(2);
    }
  });

  it('★ 两条线都不承诺收益/不代发布（合规红线必须写进 SOP）', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    for (const id of ['douyin_traffic', 'douyin_sell']) {
      const t = TASK_TYPES.find((x) => x.id === id)!;
      const text = JSON.stringify(t);
      expect(text, `★ ${id} 的 SOP 里没有"不代发布"红线`).toMatch(/不代发布/);
      expect(text, `★ ${id} 的 SOP 里没有"不承诺"红线`).toMatch(/不承诺/);
    }
  });
});

/**
 * ⑥ 父任务层（2026-10-14）：一个目录绑父类型，每条任务各选一条子线。
 *
 * 要钉的是三件会静默错的事：
 *   ① 父类型自己被当成普通类型注入 → formatTaskTypeContext 返回空，模型没有任何流程约束；
 *   ② 子类型的 parentId 指向不存在的父 → 下拉分组塌掉，父类型的"选线"引导列不出子线；
 *   ③ 任务级 task_type 没被注入侧读取 → 用户在任务里选的线不生效（仍按目录级跑）。
 */
describe('⑥ 父任务层：父类型分组 + 任务级优先', () => {
  it('★★ douyin_ops 是父类型：无自身 SOP，两个子线都挂在它下面', async () => {
    const { TASK_TYPES, getChildTaskTypes, isParentTaskType, getTaskTypeParent, getRootTaskTypes } = await import('@yan-zhi/shared');
    const parent = TASK_TYPES.find((t) => t.id === 'douyin_ops');
    expect(parent, '★ 缺父任务类型 douyin_ops（一个目录就管不了多种任务）').toBeTruthy();
    expect(parent!.steps, '★ 父类型不该有自身 SOP（它只分组与绑定智能体；有 SOP 会被当成普通类型注入）').toEqual([]);
    expect(isParentTaskType('douyin_ops'), '★ isParentTaskType 不认 douyin_ops').toBe(true);
    expect(isParentTaskType('douyin_traffic'), '★ 子类型被误判成父类型').toBe(false);
    const children = getChildTaskTypes('douyin_ops').map((c) => c.id).sort();
    expect(children, '★ 父类型下的子线不对（选线引导会列错）').toEqual(['douyin_sell', 'douyin_traffic']);
    for (const id of ['douyin_traffic', 'douyin_sell']) {
      expect(getTaskTypeParent(id)?.id, `★ ${id} 的 parentId 没指到 douyin_ops`).toBe('douyin_ops');
    }
    // 父类型不出现在子层，子类型不出现在顶层（否则下拉里会出现两遍）
    expect(getRootTaskTypes().some((t) => t.parentId), '★ 有子类型漏进了顶层').toBe(false);
  });

  it('★★ 独立「父任务」类型（2026-10-17 用户拍板：父任务是一个单独的类型）', async () => {
    const { TASK_TYPES, isParentTaskType, getChildTaskTypes, getTaskType } = await import('@yan-zhi/shared');
    const parent = TASK_TYPES.find((t) => t.id === 'parent');
    expect(parent, '★ 缺独立「父任务」类型（用户要的是单独选项，不是分组格式）').toBeTruthy();
    // 排序：通用第一、父任务第二（在注册表里定序，不在 UI 硬编码）
    expect(TASK_TYPES[0].id, '★ 通用必须是第一项').toBe('general');
    expect(TASK_TYPES[1].id, '★ 父任务必须是第二项（用户拍板"通用第一，父任务第二"）').toBe('parent');
    expect(parent!.steps, '★ 父任务类型不该有自身 SOP（它只是容器）').toEqual([]);
    expect(isParentTaskType('parent'), '★ isParentTaskType 不认独立父任务类型').toBe(true);
    // 子目录可选工作类型 = 全部具体类型（排除父任务本身与业务父类型）
    const lines = getChildTaskTypes('parent').map((c) => c.id);
    expect(lines.length, '★ 父任务下没有任何可选工作类型').toBeGreaterThan(0);
    expect(lines, '★ 父任务的可选项里混进了父类型/父任务本身').not.toContain('parent');
    expect(lines, '★ 父任务的可选项里混进了业务父类型 douyin_ops').not.toContain('douyin_ops');
    expect(lines, '★ 父任务的可选项里混进了业务父类型 shop_ops').not.toContain('shop_ops');
    expect(getTaskType('parent').label, '★ 父任务类型的显示名不对').toBe('父任务');
  });

  it('★★ 配置表化：task_type 表 + 种子 + 路由 + 注入全部闭环', () => {
    // ① 建表（含为插件化预留的 source 列）
    expect(read('src/db.ts'), '★ db.ts 没建 task_type 表').toMatch(/CREATE TABLE IF NOT EXISTS task_type \(/);
    expect(read('src/db.ts'), '★ 没有 source 列（插件行将来无法按来源清理）').toMatch(/source TEXT DEFAULT 'builtin'/);
    // ② 种子来源必须是 shared 的 TASK_TYPES（单一数据源，不另抄一份）
    expect(read('src/builtin-task-type-defs.ts'), '★★ 种子没有直接 re-export shared（会与前端兜底漂移）')
      .toMatch(/export \{ TASK_TYPES as builtinTaskTypeDefs \} from '@yan-zhi\/shared'/);
    expect(read('src/db.ts'), '★★ 种子没接进 db.ts（库里空 = 下拉只剩兜底）').toMatch(/builtinTaskTypeDefs\.forEach/);
    expect(read('src/db.ts'), '★ 缺 resetBuiltinTaskType（内置类型改坏了无法恢复）').toMatch(/export function resetBuiltinTaskType/);
    // ③ 路由注册
    expect(read('src/index.ts'), '★★ /api/task-types 未注册（前端与模型都拿不到）').toMatch(/app\.use\('\/api\/task-types'/);
    const routes = read('src/routes/task-types.ts');
    expect(routes, '★ 路由缺 CRUD').toMatch(/router\.post\('\/'/);
    expect(routes, '★ 路由缺 reset').toMatch(/router\.post\('\/reset'/);
    expect(routes, '★★ 内置行没有保护（用户改坏内置类型无法恢复）').toMatch(/row\.is_builtin\)/);
    expect(routes, '★★ 删父类型会级联删掉子线（用户的子线被一起毁掉）')
      .toMatch(/UPDATE task_type SET parent_key = NULL[\s\S]{0,80}WHERE parent_key = \?/);
    // ④ 注入读库（库行为准），并保留内置兜底
    const ltm = read('src/llm-task-manager.ts');
    expect(ltm, '★★ 注入侧没读库（用户在库里改的 SOP 不生效）').toMatch(/const effective = loadEffectiveTaskTypes\(\)/);
    // 2026-10-17 起两种父：独立 parent 类型 + 有注册子线的业务父类型（都读库行）
    expect(ltm, '★★ 父类型判定没走库行（库里建的父子关系不生效）')
      .toMatch(/const childTypes = taskType === 'parent'\s*\?\s*effective\.filter\(isConcrete\)\s*:\s*effective\.filter\(\(t\) => t\.parentId === taskType\)/);
    expect(read('src/db.ts'), '★ 缺 loadEffectiveTaskTypes').toMatch(/export function loadEffectiveTaskTypes/);
  });

  it('★★ 大模型能自建任务类型（工具 + 执行分支都登记了）', () => {
    const tools = readRepo('packages/core/src/tool/builtin/api-tools/task-type.ts');
    for (const t of ['api_task_type_list', 'api_task_type_create', 'api_task_type_update', 'api_task_type_delete']) {
      expect(tools, `★ 工具 ${t} 未定义`).toContain(`name: '${t}'`);
    }
    const idx = readRepo('packages/core/src/tool/builtin/api-tools/index.ts');
    expect(idx, '★★ 工具模块未注册（模型看不到这套工具）').toMatch(/registerTaskTypeTools\(registry\)/);
    expect(idx, '★ 模块名未登记').toMatch(/'task-type'/);
    const exec = read('src/mcp/api-tool-executor.ts');
    for (const t of ['api_task_type_list', 'api_task_type_create', 'api_task_type_update', 'api_task_type_delete']) {
      expect(exec, `★★ ${t} 不在 SUPPORTED_API_TOOLS（挂载了也调用不了）`).toContain(`'${t}'`);
      expect(exec, `★★ ${t} 没有执行分支`).toContain(`case '${t}':`);
    }
  });

  it('★★ 注入侧必须读任务级 task_type，且父类型走「选线」引导', () => {
    const ltm = read('src/llm-task-manager.ts');
    // ① 任务级优先于目录级（顺序反了 → 目录换类型会悄悄改掉老任务的线）
    expect(ltm, '★★ 注入侧没读 conversation.task_type（任务里选的线不生效）')
      .toMatch(/SELECT space_id, task_type FROM conversation/);
    expect(ltm, '★★ 生效类型没有按「任务级 ?? 目录级」取（顺序反了会静默改掉老任务的线）')
      .toMatch(/convRow\?\.task_type \|\| tRow\?\.task_type/);
    // ② 父类型不得走进 formatTaskTypeContext（父类型 steps 为空 → 注入空，模型没有任何约束）
    //    2026-10-17 起独立 parent 类型同样走「选线」引导（子线 = 全部具体类型）
    expect(ltm, '★★ 父类型没有分支到选线引导（模型会自己猜一条线跑完）')
      .toMatch(/const parent = hit && \(taskType === 'parent' \|\| childTypes\.length > 0\)/);
    expect(ltm, '★★ 选线引导没吃库行（库里建的子线列不出来）')
      .toMatch(/formatParentTaskTypeSpecContext\(hit, childTypes\)/);
    expect(ltm, '★★ 子线 SOP 没吃库行（用户在库里改的步骤不生效）')
      .toMatch(/formatTaskTypeSpecContext\(hit, batchSize\)/);
  });

  it('★★ api_space_set_task_type 不得写死任务类型 enum（否则自建类型设不上）', async () => {
    const { TASK_TYPES } = await import('@yan-zhi/shared');
    const spaceTool = readRepo('packages/core/src/tool/builtin/api-tools/space.ts');
    // ① 类型搬进库后，工具参数必须是自由串 + 服务端校验：
    //    写死 enum 的后果是"用户在库里/让模型建的类型永远传不进这个工具"。
    const seg = spaceTool.slice(spaceTool.indexOf("name: 'api_space_set_task_type'"), spaceTool.indexOf("name: 'api_space_set_task_type'") + 2600);
    expect(seg, '★★ api_space_set_task_type 还写着 enum（自建类型会被 JSON Schema 挡在门外）')
      .not.toMatch(/enum:\s*\[[^\]]*'(novel_rewrite|douyin_ops)/);
    // ② 描述里仍要列出内置可选值（模型没有 enum 提示时靠它知道有哪些）
    const missing = TASK_TYPES.filter((t) => t.id !== 'general' && !seg.includes(t.id)).map((t) => t.id);
    expect(missing, `★★ 内置类型在工具描述里缺名（模型不知道有这些可选值）：\n${missing.join('\n')}`).toEqual([]);
    // ③ 服务端按「库行 ∪ 内置」校验，且未知值要回可选清单（不静默回落通用）
    const exec = read('src/mcp/api-tool-executor.ts');
    expect(exec, '★★ 校验还只认内置 TASK_TYPE_IDS（自建类型会被判未知）').toMatch(/knownTypes\.some\(\(t\) => t\.id === raw\)/);
    expect(exec, '★★ 校验没走 loadEffectiveTaskTypes（读不到库行）').toMatch(/const knownTypes = loadEffectiveTaskTypes\(\)/);
  });

  it('★★ conversation 必须有任务级 task_type 列与写入路径（否则选了线没地方存）', () => {
    expect(read('src/db.ts'), '★ db.ts 缺 conversation.task_type 迁移')
      .toMatch(/ALTER TABLE conversation ADD COLUMN task_type TEXT/);
    expect(readRepo('packages/core/src/db/schema.ts'), '★ schema.ts 缺 conversation.task_type 迁移')
      .toMatch(/ALTER TABLE conversation ADD COLUMN task_type TEXT/);
    const routes = read('src/routes/conversations.ts');
    expect(routes, '★★ 建会话没接 taskType（前端传了也被丢）').toMatch(/taskType \? String\(taskType\) : null/);
    expect(routes, '★★ PATCH 会话没接 taskType（任务里换不了线）').toMatch(/sets\.push\('task_type = \?'\)/);
  });

  it('★★ 父目录新建任务必须先选线（不选就不建会话）', () => {
    const chat = readRepo('packages/ui/src/composables/chat/useChat.ts');
    // ① 识别"目标是父类型目录且没带子线"→ 弹选线框并 return（不建会话）
    //    2026-10-17 起目标是子目录（子空间）时也会上溯父目录判定（lineSpace = targetSpace ?? 其父），
    //    但选线框的 spaceId 仍是 targetSpace —— 任务落在子目录而不是父目录。
    expect(chat, '★★ startNewChat 没有父目录选线分支（会建出没有 SOP 的空任务）')
      .toMatch(/taskTypeStore\.isParent\(lineSpace\.taskType\) && !taskType\)/);
    expect(chat, '★★ 子目录未选线时没有上溯父目录取子线（选线框永远弹不出来）')
      .toMatch(/lineSpace = spaceStore\.spaces\.find\(\(s\) => s\.id === \(lineSpace as any\)\.parentId\)/);
    expect(chat, '★★ 选线分支没有 return（会接着把空会话建出来）')
      .toMatch(/taskLinePicker\.value = \{[\s\S]{0,200}?\n\s*return;/);
    // ② 生效类型按「子线 ?? 目录」取（顺序反了 → 选了的线被目录级覆盖）
    expect(chat, '★★ applyTaskTypeAgent 调用点没让子线优先')
      .toMatch(/applyTaskTypeAgent\(taskType \|\| targetSpace\.taskType\)/);
    // ③ 选线确认后带着子线重建会话
    expect(chat, '★★ confirmTaskLine 没把子线传回 startNewChat').toMatch(/await startNewChat\(p\.spaceId, childId\)/);
    // ④ 建会话时把子线落库（只切智能体不落库 = 下次刷新丢了）
    expect(chat, '★★ 建会话没带 taskType（子线不落库，注入侧读不到）')
      .toMatch(/taskType: pendingTaskType\.value/);
    // ⑤ 前端 store 两侧（server / 本地）都要写 task_type
    const store = readRepo('packages/ui/src/stores/chat.ts');
    expect(store, '★★ store 建会话没带 taskType').toMatch(/taskType: opts\?\.taskType \|\| null/);
    expect(store, '★★ store PATCH 没接 taskType（任务里换不了线）').toMatch(/if \(patch\.taskType !== undefined\)/);
    // ⑥ 侧栏要有选线框 + 下拉分组（顺序由注册表定：通用第一、独立父任务第二；
    //    有注册子线的父类型渲染成分组；分组标题写明"父任务目录"）
    const sidebar = readRepo('packages/ui/src/components/chat/ChatSidebar.vue');
    expect(sidebar, '★★ 侧栏没有选线框（父目录下新建任务没有选择入口）').toMatch(/taskLinePickerOpen/);
    expect(sidebar, '★★ 下拉缺父任务类型分组（看不出哪个目录能管多条任务线）')
      .toMatch(/父任务目录 · 一套目录管多条任务线/);
    expect(sidebar, '★★ 独立「父任务」类型没有按普通选项渲染（用户拍板：父任务是单独的类型）')
      .toMatch(/t\.id !== 'parent' && taskTypeStore\.childrenOf\(t\.id\)\.length > 0/);
  });
});

describe('③ 前端接线：选类型要切智能体，且不静默失败', () => {
  it('★★ 保存任务类型后必须切到专属智能体', () => {
    expect(USE_CHAT, '★★ 缺 applyTaskTypeAgent（选了类型但智能体不变）').toMatch(/function applyTaskTypeAgent\(/);
    // 两处保存路径（新建空间带类型 / 编辑空间改类型）都要调
    const calls = USE_CHAT.match(/applyTaskTypeAgent\(spaceEditForm\.value\.taskType\)/g) || [];
    expect(calls.length, `★★ 只有 ${calls.length} 处调用（新建与编辑两条路径都要覆盖）`).toBeGreaterThanOrEqual(2);
  });

  it('★★ 智能体不存在时要如实提示，不能静默沿用', () => {
    const fn = useChatFn('function applyTaskTypeAgent');
    expect(fn, '★★ agentId 找不到时静默返回（用户以为切成功）').toMatch(/专属智能体未安装/);
    expect(fn, '★ 用 warning 提示而非静默').toMatch(/ElMessage\.warning/);
  });

  it('★ 通用类型不切智能体（用户自己选的不能被顶掉）', () => {
    const fn = useChatFn('function applyTaskTypeAgent');
    expect(fn, '★★ 通用类型也去切智能体（会顶掉用户选择）').toMatch(/if \(!target\) return false/);
  });

  it('★ 选中已绑定类型的空间时也要对齐智能体（否则过一会再点进来就回到默认助手）', () => {
    const fn = useChatFn('async function selectSpaceAndSyncDir');
    expect(fn, '★ 选空间时未对齐智能体').toMatch(/applyTaskTypeAgent\(sp\.taskType\)/);
  });
});

/**
 * ★★★ 「新增任务」路径必须也吃任务模式（2026-09-27 用户报的真实 bug）。
 *
 * 用户原话：「有 bug 我在有声小说目录模式下面新增任务，还会挂载代码的 skill？」
 *
 * 三条独立缺陷叠在一起，**每一条单独都能造成这个现象**，所以三条都要钉住：
 *   ① `startNewChat` 从不调 `applyTaskTypeAgent`（只有点空间"头部"才调）
 *      → 在空间里点「+ 新增任务」时智能体不切，仍是上一个任务用的那个（如代码编写助手）；
 *   ② `applyTaskTypeAgent` 只调 `onAgentSwitch`，而它**不碰 mountedSkillIds**
 *      → + 菜单 / 上下文栏显示的还是上一个任务残留的挂载（代码 skill 就是这么冒出来的）；
 *   ③ `sceneMode` 是 localStorage 全局单键（不带模式前缀）→ 开发模式激活过「代码开发」
 *      场景后切到有声小说目录，发消息时 `sysPrompt = [agent.systemPrompt, currentScene.prompt]`
 *      会把**代码开发场景提示词**注进有声小说任务。
 */
describe('④ 新增任务路径：目标目录的 taskType 必须接管「智能体 + 技能挂载 + 场景」', () => {
  it('★★ startNewChat 必须按目标空间的 taskType 对齐（新增任务的主要入口）', () => {
    const fn = useChatFn('async function startNewChat');
    expect(fn, '★★ startNewChat 未调 applyTaskTypeAgent（在有声小说目录点「+ 新增任务」不切智能体）')
      .toMatch(/applyTaskTypeAgent\(/);
    // 无参调用（侧栏/工作台「+」）要回落当前选中空间，否则这条路径永远拿不到任务模式
    expect(fn, '★★ 未回落 currentSpaceId（无参 startNewChat 拿不到目录的 taskType）')
      .toMatch(/spaceStore\.currentSpaceId/);
    expect(fn, '★ 未读取目标空间的 taskType').toMatch(/taskType/);
  });

  it('★★ 任务模式接管时不能顶掉 dev/wf 模式自己的智能体契约', () => {
    const fn = useChatFn('async function startNewChat');
    // dev 固定代码编写助手、wf 固定工作流助手（App.vue 切模式时设的）；
    // 任务模式若无条件接管，会把模式本身的人格顶掉。
    expect(fn, '★★ 未限定模式（dev/wf 的智能体会被任务模式顶掉）').toMatch(/activeMode\.value === 'office'/);
  });

  it('★★ applyTaskTypeAgent 必须同时对齐技能挂载（只换智能体不够）', () => {
    const fn = useChatFn('function applyTaskTypeAgent');
    expect(fn, '★★ 切任务模式后未重算 mountedSkillIds（+ 菜单里还是上个任务的代码 skill）')
      .toMatch(/syncMountsToAgent\(/);
    // 已有会话的挂载归该会话所有，不能顺手改
    expect(fn, '★★ 未限定草稿态（会把用户当前会话的挂载顶掉）').toMatch(/store\.currentConvId/);
  });

  it('★★ syncMountsToAgent 取的是目标智能体自带 skill，且 skillStore 未就绪时不清空', () => {
    const fn = useChatFn('function syncMountsToAgent');
    expect(fn, '★ 未从 agent.skillIds 取挂载').toMatch(/agent\?\.skillIds|agent\.skillIds/);
    expect(fn, '★★ skillStore 未加载时把挂载清成 []（表现为"切了类型技能全没了"）')
      .toMatch(/!skillStore\.skills\.length/);
  });

  it('★★ 任务模式接管要清掉残留的场景标记（代码开发场景提示词会被注进有声小说任务）', () => {
    const fn = useChatFn('function applyTaskTypeAgent');
    expect(fn, '★★ 未清场景标记（sceneMode 是全局单键，跨模式残留）').toMatch(/resetSceneForTaskMode\(/);
    const reset = useChatFn('function resetSceneForTaskMode');
    // 只清标记 —— 不能顺手把智能体改回默认助手（那会把刚切好的任务模式智能体顶掉）
    expect(reset, '★★ resetSceneForTaskMode 里改了智能体（会把刚切的任务模式智能体顶掉）')
      .not.toMatch(/onAgentSwitch\(/);
  });
});