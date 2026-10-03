/**
 * 「目录即任务」守门测试 —— 任务类型注册表 + 资源目录骨架 + 文件面板两段式。
 *
 * 用户需求（2026-09-27 拍板）：
 *   给目录选好任务类型后，系统引导用户把资源上传/拷进对应目录，模型按流程一步步完成，
 *   每步让用户确认；同一目录可多次进行任务（跨会话）。
 *
 * 为什么必须钉：
 *   ① 类型注册表是**前后端共用**的 SOP 来源 —— 漂移会让提示词与 UI 说两套流程；
 *   ② 骨架创建必须**幂等且不覆盖** —— 用户反复切类型不能丢已放进去的素材（数据安全底线）；
 *   ③ 两段式面板必须真的分「本任务」（会话级）/「项目资源」（目录级）——
 *      混在一起正是"跨会话看不到资源"的根因。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 不碰真库（与 task-memory-and-pending.test.ts 同款手法）
vi.mock('../src/db.js', () => ({
  db: { prepare: () => ({ get: () => undefined, all: () => [], run: () => {} }) },
  // 2026-10-02：补齐 db.js 导出（手写白名单 mock 必须与生产代码同步，否则报
  //   `No "X" export is defined on the "../src/db.js" mock`，表象却是「任务 failed」）。
  MESSAGE_LIST_COLS:
  'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  // 2026-10-02：services/context-view.ts（上下文组装唯一出口）新增依赖。
  // ★ 手写白名单 mock 必须同步补，否则 ESM 直接报 "does not provide an export"，
  //   表现为"任务 failed"，看不出真因（本文件此前已记录过同类教训）。
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => "sum_test",
  hasSqliteVec: false,
}));
vi.mock('../src/state.js', () => ({ serverState: { workspaceDir: undefined } }));

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const TASK_TYPES = readRepo('packages/shared/src/utils/task-types.ts');
const SPACE_RES = read('src/services/space-resources.ts');
const SPACES_ROUTE = read('src/routes/spaces.ts');
const PANEL = readRepo('packages/ui/src/components/chat/ChatFilePanel.vue');
const LTM = read('src/llm-task-manager.ts');
const SCHEMA = readRepo('packages/core/src/db/schema.ts');
const SERVER_DB = read('src/db.ts');

describe('① 任务类型注册表（shared，前后端共用）', () => {
  it('★ 必须包含用户点名的类型：小说改写/翻译/脚本文案/短剧 + 追加的配音/有声小说/漫画绘本/PPT/长文', async () => {
    const { TASK_TYPES: T } = await import('@yan-zhi/shared');
    const ids = T.map((t) => t.id);
    for (const want of ['short_drama', 'novel_rewrite', 'translate', 'audiobook', 'dubbing', 'script_copy', 'comic', 'ppt_deck', 'longform']) {
      expect(ids, `★ 缺少任务类型 ${want}`).toContain(want);
    }
    // 通用类型必须存在且排在首位（未知类型 fail-safe 回落到它）
    expect(ids[0], '★ general 必须是第一项（fail-safe 回落目标）').toBe('general');
  });

  it('★★ 任务模式规则：每个确认步骤必须写明用哪个工具确认（否则模型只在正文问一句就往下跑）', async () => {
    const { TASK_TYPES: T } = await import('@yan-zhi/shared');
    let confirmSteps = 0;
    for (const t of T) {
      for (const s of t.steps) {
        if (!s.confirmTool) continue;
        confirmSteps++;
        expect(['confirm', 'ask'], `★ ${t.id}/${s.title} 的 confirmTool 非法`).toContain(s.confirmTool);
        expect(s.confirmAbout, `★ ${t.id}/${s.title} 没写确认什么（模型不知道向导该问哪些页）`).toBeTruthy();
      }
    }
    expect(confirmSteps, '★ 一条确认步骤都找不到（任务模式规则退化成无确认的流程）').toBeGreaterThan(10);
  });

  it('★★ 成批步骤要标 batchable（否则要么一次问到底、要么一段一问）', async () => {
    const { TASK_TYPES: T } = await import('@yan-zhi/shared');
    // 这四类是典型长任务，必须有成批步骤
    for (const id of ['novel_rewrite', 'translate', 'audiobook', 'dubbing', 'script_copy', 'comic', 'short_drama']) {
      const t = T.find((x) => x.id === id)!;
      expect(t.steps.some((s) => s.batchable), `★★ ${id} 没有任何成批步骤（长任务没法分批确认）`).toBe(true);
    }
  });

  it('★★ 产出必须标落点（02-work / 03-output），否则产物只留在对话里、跨会话找不到', async () => {
    const { TASK_TYPES: T } = await import('@yan-zhi/shared');
    for (const t of T) {
      if (!t.steps.length) continue;
      expect(t.steps.some((s) => s.output === '03-output'), `★★ ${t.id} 没有最终交付落点（03-output）`).toBe(true);
      for (const s of t.steps) {
        if (s.output === undefined) continue;
        expect(['01-reference', '02-work', '03-output', 'none'], `★ ${t.id}/${s.title} 的 output 落点非法`).toContain(s.output);
      }
    }
  });

  it('★ 短剧 SOP 必须含「逐个人物分析」且为确认点（用户明确要求逐个确认人物形象）', async () => {
    const { getTaskType } = await import('@yan-zhi/shared');
    const sd = getTaskType('short_drama');
    const human = sd.steps.find((s) => s.title.includes('人物'));
    expect(human, '★ 短剧 SOP 缺人物分析步骤').toBeTruthy();
    expect(human!.confirmTool, '★ 人物分析未标为确认步骤（用户要求逐个确认形象）').toBeTruthy();
    expect(human!.detail || '', '★ 人物步骤未要求文字+图像描述').toMatch(/文字|图像/);
    // 分镜与格式确认也必须存在
    expect(sd.steps.some((s) => s.title.includes('分镜') && s.confirmTool), '★ 缺分镜确认点').toBe(true);
    expect(sd.steps.some((s) => s.title.includes('格式') && s.confirmTool), '★ 缺响应格式确认点').toBe(true);
  });

  it('★ 有声小说必须带视频（素材含视频、交付落到 03-output）', async () => {
    const { getTaskType } = await import('@yan-zhi/shared');
    const ab = getTaskType('audiobook');
    expect(ab.steps.some((s) => /视频/.test(s.detail || '')), '★ 有声小说 SOP 未提视频素材').toBe(true);
    expect(ab.steps.some((s) => s.title.includes('合成') && s.output === '03-output'), '★ 有声小说缺成片交付落点').toBe(true);
  });

  it('★ 未知/空类型必须 fail-safe 回落到「通用」，且通用不注入 SOP', async () => {
    const { getTaskType, formatTaskTypeContext } = await import('@yan-zhi/shared');
    expect(getTaskType('nonexistent_type').id).toBe('general');
    expect(getTaskType(null).id).toBe('general');
    expect(getTaskType(undefined).id).toBe('general');
    expect(formatTaskTypeContext('general'), '★ 通用类型不该注入流程约束').toBe('');
  });

  it('★★ 规则文本要写明「必须真的发起确认工具调用」+「不要凭空造素材」', async () => {
    const { formatTaskTypeContext } = await import('@yan-zhi/shared');
    const text = formatTaskTypeContext('novel_rewrite');
    expect(text, '★★ 未写明要用 confirm_user 发起真实调用（模型会只在正文问一句）').toMatch(/confirm_user/);
    expect(text, '★ 未禁止"正文里问一句就当确认"').toMatch(/只在正文里问一句|等于没确认/);
    expect(text, '★★ 未禁止凭空编造素材（缺素材时模型会自己造一份）').toMatch(/不要为了"有素材"就自己造一个/);
    // 视频素材来源三条要写全（有声小说）
    const ab = formatTaskTypeContext('audiobook');
    expect(ab, '★ 有声小说未给出视频素材获取路径（模型会干等用户上传）').toMatch(/另开一个会话生成视频/);
  });

  it('★ 资源目录四段必须存在且带数字前缀（用户拍板：英文数字前缀）', async () => {
    const { RESOURCE_DIRS } = await import('@yan-zhi/shared');
    expect(RESOURCE_DIRS.map((d) => d.dir)).toEqual(['00-source', '01-reference', '02-work', '03-output']);
    for (const d of RESOURCE_DIRS) {
      expect(d.label, `★ ${d.dir} 缺中文说明`).toBeTruthy();
      expect(d.hint, `★ ${d.dir} 缺用途引导（用户不知道该放什么）`).toBeTruthy();
    }
  });

  it('★ 批次确认默认 3（用户拍板）', async () => {
    const { DEFAULT_CONFIRM_BATCH_SIZE } = await import('@yan-zhi/shared');
    expect(DEFAULT_CONFIRM_BATCH_SIZE).toBe(3);
  });
});

describe('② 资源目录骨架：幂等 + 绝不覆盖（数据安全底线）', () => {
  it('★★ 只允许 mkdir，不得出现删除/覆盖类调用', () => {
    // 危险调用在白名单外一律禁止（骨架服务只负责"建"，绝不"清"）
    for (const danger of [/\brm\(/, /rmSync/, /rmdir/, /unlink/, /fsp\.rm\b/, /existsSync.*unlink/]) {
      expect(SPACE_RES, `★ 骨架服务出现危险删除调用 ${danger}`).not.toMatch(danger);
    }
    // writeFile 只能出现在 task.json（元信息）上，不得写用户资源文件
    const writeCalls = SPACE_RES.match(/writeFile\([^)]*/g) || [];
    for (const w of writeCalls) {
      expect(w, '★ 存在对非 task.json 的写入（可能覆盖用户文件）').toMatch(/file|TASK_META/);
    }
  });

  it('★ createdDirs 必须"先判定后创建"（mkdir 后再 stat 恒存在，会永远报空）', () => {
    const fn = SPACE_RES.slice(SPACE_RES.indexOf('export async function ensureResourceDirs'), SPACE_RES.indexOf('export interface SetTaskTypeResult'));
    // 判定必须出现在 mkdir 之前
    const statIdx = fn.indexOf('existed');
    const mkdirIdx = fn.indexOf('mkdir(target');
    expect(statIdx, '★ 缺"是否已存在"的判定').toBeGreaterThan(-1);
    expect(mkdirIdx, '★ 缺 mkdir').toBeGreaterThan(-1);
    expect(statIdx, '★★ 判定在 mkdir 之后 → createdDirs 永远为空（回执骗人）').toBeLessThan(mkdirIdx);
  });

  it('★ task.json 必须合并语义（保住已有字段），且类型落库走专用服务', () => {
    const fn = SPACE_RES.slice(SPACE_RES.indexOf('async function mergeTaskMeta'), SPACE_RES.indexOf('export interface SetTaskTypeResult'));
    expect(fn, '★ 未先读已有内容就写（会清掉别的字段）').toMatch(/readTaskMeta/);
    expect(fn, '★ 未做展开合并').toMatch(/\{\s*\.\.\.existing/);
    // 路由：不能裸改 task_type 列（那样不建目录）
    expect(SPACES_ROUTE, '★ 路由未调用 setSpaceTaskType（裸改列 = 不建资源目录）').toMatch(/setSpaceTaskType\(/);
    expect(SPACES_ROUTE, '★ 路由出现了裸改 task_type 的 UPDATE').not.toMatch(/task_type\s*=\s*\?/);
  });

  it('★ 未绑定目录的空间也要能用（回落 workspace/spaces/<id>）', () => {
    expect(SPACE_RES, '★ 未绑定目录时没有回落根').toMatch(/spaces['"]\s*,\s*space\.id|spaces\/<spaceId>|'spaces'/);
    expect(SPACE_RES, '★ isSpaceDirBound 未实现（前端无法区分"可直接放文件"）').toMatch(/export function isSpaceDirBound/);
  });
});

describe('③ 接线：DB 字段 + 提示词注入 + 面板两段式', () => {
  it('★ space 表必须有 task_type / task_config_json（新库 DEFAULT + 旧库 ALTER 双处）', () => {
    expect(SCHEMA, '★ schema 缺 task_type 列').toMatch(/task_type TEXT/);
    expect(SCHEMA, '★ schema 缺 task_config_json 列').toMatch(/task_config_json TEXT/);
    expect(SCHEMA, '★ schema 缺旧库 ALTER 迁移').toMatch(/ALTER TABLE space ADD COLUMN task_type/);
    expect(SERVER_DB, '★ server db.ts 缺 ALTER 迁移（打包版旧库会报 no column）').toMatch(/ALTER TABLE space ADD COLUMN task_type/);
  });

  it('★ 绑定了类型的目录必须把 SOP 注入系统提示词', () => {
    expect(LTM, '★ 未导入任务类型注册表').toMatch(/formatTaskTypeContext/);
    expect(LTM, '★ 提示词组装处未调用 formatTaskTypeContext').toMatch(/formatTaskTypeContext\(\s*taskType/);
    expect(LTM, '★ 未注入资源目录现状（模型不知道用户放了什么）').toMatch(/summarizeResourceDirsSync\(spaceId\)/);
    // 批次大小可覆盖
    expect(LTM, '★ confirmBatchSize 覆盖配置未生效').toMatch(/confirmBatchSize/);
  });

  it('★ 文件面板必须是两段式（本任务 / 项目资源）', () => {
    expect(PANEL, '★ 缺「本任务」段').toMatch(/本任务/);
    expect(PANEL, '★ 缺「项目资源」段').toMatch(/项目资源/);
    expect(PANEL, '★ 未从 shared 取资源目录定义（自写一套会漂移）')
      .toMatch(/import\s*\{[^}]*RESOURCE_DIRS[^}]*\}\s*from\s*'@yan-zhi\/shared'/);
    // 资源段的渲染必须基于 RESOURCE_DIRS 循环，不能写死四段
    expect(PANEL, '★ 资源段未按 RESOURCE_DIRS 循环渲染').toMatch(/v-for="d in resourceDirs"/);
    // 懒加载 + 打开时刷新
    expect(PANEL, '★ 缺懒加载（一次拉四段目录会白等）').toMatch(/loadResourceSection/);
  });

  it('★ 空间编辑必须有任务类型下拉，且写明会生成资源目录', () => {
    const SIDEBAR = readRepo('packages/ui/src/components/chat/ChatSidebar.vue');
    expect(SIDEBAR, '★ 空间弹窗缺任务类型下拉').toMatch(/spaceEditForm\.taskType/);
    expect(SIDEBAR, '★ 缺类型说明展示').toMatch(/pickedTaskType/);
    expect(SIDEBAR, '★ 下拉未用注册表循环').toMatch(/v-for="t in taskTypes"/);
    // useChat 里设置类型后应有资源目录已就绪的提示（让用户知道目录建好了）
    const USE_CHAT = readRepo('packages/ui/src/composables/chat/useChat.ts');
    expect(USE_CHAT, '★ 设置类型后未提示资源目录').toMatch(/资源目录/);
  });

  it('★★ 创建后必须能改任务模式（弹窗双模式 + 入口好找）', () => {
    const SIDEBAR = readRepo('packages/ui/src/components/chat/ChatSidebar.vue');
    const USE_CHAT = readRepo('packages/ui/src/composables/chat/useChat.ts');

    // ① 弹窗双模式：同一个弹窗既能新建也能编辑（标题随 id 变）
    expect(SIDEBAR, '★★ 弹窗标题未区分新建/编辑（用户以为只能新建）').toMatch(/spaceEditForm\.id \? '编辑空间' : '新建空间'/);
    // ② 编辑入口回填当前类型（否则下拉是空的，看着像没设过）
    expect(USE_CHAT, '★★ 打开编辑时未回填当前 taskType（下拉显示空 = 用户以为没设）').toMatch(/taskType: space\.taskType \|\| ''/);
    // ③ 保存时类型变化单独发一次请求（否则改类型不落库）
    expect(USE_CHAT, '★★ 保存时未处理 taskType 变更').toMatch(/taskType: spaceEditForm\.value\.taskType \|\| null/);
    // ④ 清空类型的提示要说清"不再注入任务流程"（让用户知道发生了什么）
    expect(USE_CHAT, '★ 清空类型时未给出可读提示').toMatch(/不再注入任务流程/);
    // ⑤ ★ 菜单项名要指向"任务模式"，叫"编辑空间"时用户想改模式找不到
    expect(SIDEBAR, '★★ 右键菜单项只叫"编辑空间"（改模式的用户找不到入口）').toMatch(/spaceMenuTarget\.space\.taskType \? '更改任务模式' : '设置任务模式'/);
    // ⑥ ★ 徽标可点击直接改（高频动作，只藏右键菜单里不好找）
    expect(SIDEBAR, '★★ 任务模式徽标不可点击（改模式只能靠右键菜单）').toMatch(/tree-task-badge-click/);
    expect(SIDEBAR, '★ 徽标点击未阻止冒泡（会触发行的"选中空间"）').toMatch(/@click\.stop="openSpaceEdit\(sp\)"/);
  });
});
/**
 * 默认目录骨架的边界 + 模型可改任务模式（2026-09-27 用户两条明确要求）。
 *
 * ① 「没有任务类型默认目录不需要建立」—— 我一度加错（建空间就建目录），已撤回。
 *    目录骨架**只在设任务类型时**建；没绑类型的空间是零散任务容器。
 * ② 「大模型自己都能改目录的任务模式」—— 新增 `api_space_set_task_type`：
 *    模型能直接把"这个目录以后都按配音来"落到库 + 建出资源目录。
 */
describe('④ 默认目录骨架的边界（只在设类型时建）', () => {
  // ★ 必须剥注释再断言：本轮注释里写了「见 setSpaceTaskType」「ensureResourceDirs」等正确写法，
  //   不剥注释就会命中注释本身 → 断言假绿/假红（项目里踩过多次）。
  const ROUTE = read('src/routes/spaces.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  it('★★ 建空间不得建资源目录（没设类型就不该有空目录）', () => {
    const post = ROUTE.slice(ROUTE.indexOf("router.post('/'"), ROUTE.indexOf("router.patch('/:id'"));
    expect(post, '★★ 建空间时调了 ensureResourceDirs（用户明确"没有任务类型不需要建立"）')
      .not.toMatch(/ensureResourceDirs/);
    expect(post, '★ 建空间时调了 setSpaceTaskType').not.toMatch(/setSpaceTaskType/);
  });

  it('★★ 列举空间也不得自愈建目录（否则一切到列表就冒出空目录）', () => {
    const get = ROUTE.slice(ROUTE.indexOf("router.get('/'"), ROUTE.indexOf("router.post('/'"));
    expect(get, '★★ 列表接口自愈建目录（所有空间都会被塞进 00-source 等空目录）')
      .not.toMatch(/ensureResourceDirs/);
  });

  it('★ 设任务类型仍然要建目录（这条不能一起撤掉）', () => {
    expect(ROUTE, '★★ 设类型不建目录了（任务模式失去"往哪放"的前提）').toMatch(/setSpaceTaskType\(/);
  });
});

describe('⑤ 模型可改任务模式（api_space_set_task_type）', () => {
  const EXECUTOR = read('src/mcp/api-tool-executor.ts');
  const SPACE_TOOL = readRepo('packages/core/src/tool/builtin/api-tools/space.ts');
  const PERM = read('src/tool-permission.ts');

  it('★★ 工具必须存在且已登记进可执行集合', () => {
    expect(EXECUTOR, '★ 缺 case 实现').toMatch(/case 'api_space_set_task_type'/);
    expect(EXECUTOR, '★★ 未登记进 SUPPORTED_API_TOOLS（注册了也执行不到）')
      .toMatch(/'api_space_update', 'api_space_delete', 'api_space_set_task_type'/);
    expect(SPACE_TOOL, '★ 缺 schema（模型看不到这个工具）').toMatch(/name: 'api_space_set_task_type'/);
  });

  it('★★ 必须走 setSpaceTaskType（不裸改列，否则"类型设了目录没建"）', () => {
    const fn = EXECUTOR.slice(EXECUTOR.indexOf("case 'api_space_set_task_type'"));
    expect(fn.slice(0, 1600), '★★ 裸改 task_type 列（资源目录不会建）').toMatch(/await setSpaceTaskType\(/);
    expect(fn.slice(0, 1600), '★ 自己拼 UPDATE space SET task_type').not.toMatch(/UPDATE space SET task_type/);
  });

  it('★★ 未知类型要明确报错并给出可选值，不能静默回落成通用', () => {
    const fn = EXECUTOR.slice(EXECUTOR.indexOf("case 'api_space_set_task_type'")).slice(0, 1600);
    expect(fn, '★★ 未知类型静默当成通用（用户以为设成功了）').toMatch(/TASK_TYPE_IDS\.includes\(raw\)/);
    expect(fn, '★ 报错未给可选值').toMatch(/可选值/);
  });

  it('★ spaceId 缺省时取当前会话空间（模型不必知道空间 id）', () => {
    const fn = EXECUTOR.slice(EXECUTOR.indexOf("case 'api_space_set_task_type'")).slice(0, 1600);
    expect(fn, '★ 未回落当前会话空间').toMatch(/resolveTaskSpaceId\(conversationId\)/);
  });

  it('★★ 必须挂到智能体上（只注册不挂载 = 模型看不到）', () => {
    expect(read('src/db.ts'), '★★ 默认助手未挂 api_space_set_task_type')
      .toMatch(/'api_space_list', 'api_space_set_task_type'/);
    expect(read('src/builtin-task-mode-agents.ts'), '★★ 任务模式智能体未挂空间工具')
      .toMatch(/COMMON_SPACE_TOOLS/);
  });

  it('★★ 只读会话必须拦住它（会改配置 + 在磁盘建目录）', () => {
    expect(PERM, '★★ 未列进写工具黑名单（只读会话会放行一次磁盘写）')
      .toMatch(/'api_space_set_task_type'/);
    const writeBlock = PERM.slice(PERM.indexOf('const WRITE_TOOLS'), PERM.indexOf('const UNCONTROLLABLE_PREFIXES'));
    expect(writeBlock, '★★ 写清单里没有它').toMatch(/api_space_set_task_type/);
  });
});
