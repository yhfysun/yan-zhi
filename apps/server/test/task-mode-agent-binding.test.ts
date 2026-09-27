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
  const sources = [DB, read('src/builtin-office-agents.ts'), TASK_MODE_AGENTS];
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

/** 内置 skill id（db.ts 的 builtinSkillDefaults；含字面量与 _SKILL_ID 常量两种写法） */
function builtinSkillIds(): Set<string> {
  const ids = new Set<string>();
  for (const m of DB.matchAll(/(?:id:\s*|_SKILL_ID\s*=\s*)'(skill_[a-z0-9_]+)'/g)) ids.add(m[1]);
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
      if (t.id === 'general') continue;
      expect(t.agentId, `★★ ${t.id} 没登记 agentId（选了类型但智能体不变 = 专属纪律丢失）`).toBeTruthy();
      mapped++;
      if (!known.has(t.agentId!)) bad.push(`${t.id} → ${t.agentId}`);
    }
    expect(mapped, '★ 一个类型都没登记 agentId').toBeGreaterThanOrEqual(9);
    expect(bad, `★★ agentId 指向不存在的智能体（切类型后智能体不会变，且不报错）:\n${bad.join('\n')}`).toEqual([]);
  });

  it('★ 通用类型不指定专属智能体（用用户当前选的）', async () => {
    const { getTaskType } = await import('@yan-zhi/shared');
    expect(getTaskType('general').agentId, '★ 通用类型不该绑死智能体').toBeUndefined();
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