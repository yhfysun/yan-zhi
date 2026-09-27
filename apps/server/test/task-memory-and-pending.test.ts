/**
 * 任务决策记录（task-memory）+ pending 持久化的守门测试。
 *
 * 背景（2026-09-27 用户拍板「确认好的要记录到空间记忆」= 硬性验收项）：
 *   用户在 ask_user / confirm_user 确认过的内容（人物形象、响应格式、风格…）
 *   必须落盘到 <空间目录>/.yan-zhi/task-memory/decisions.md，且注入后续会话的
 *   系统提示词 —— 同目录新开会话时模型不再重复询问已确认的事项。
 *
 * 同时钉住 pending 交互的存活语义：
 *   ask_user/confirm_user 没有"超时"语义（用户隔天回来也要能回答），
 *   不得被 2 分钟创建超时 / 15 秒断连宽限杀掉。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ★ 不能让导入链碰到真实 dev 库（data.db 被运行中的后端锁定 → flush EPERM，且测试不该写用户数据）
vi.mock('../src/db.js', () => ({
  db: { prepare: () => ({ get: () => undefined, all: () => [], run: () => {} }) },
  hasSqliteVec: false,
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/state.js', () => ({ serverState: { workspaceDir: undefined } }));

const SERVER_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');

const LTM = read('src/llm-task-manager.ts');
const SPACE_MEM = read('src/services/space-memory.ts');
const ROUTES = read('src/routes/llm-tasks.ts');

describe('任务决策记录（task-memory）', () => {
  it('★ resolveToolResult 必须把交互类工具的回答写入决策记录', () => {
    const fn = LTM.slice(LTM.indexOf('export function resolveToolResult'), LTM.indexOf('export function extractPendingQuestion'));
    expect(fn, '★ 回答提交后未调用 appendTaskDecision').toMatch(/appendTaskDecision\(/);
    expect(fn, '★ 未按 INTERACTIVE_TOOLS 过滤（非交互工具也会被记）').toMatch(/INTERACTIVE_TOOLS\.has\(pending\.toolName/);
  });

  it('★ extractPendingQuestion：ask_user 取 question；confirm_user 取标题+各页问题', async () => {
    const { extractPendingQuestion } = await import('../src/llm-task-manager');
    expect(extractPendingQuestion({ question: '主角叫什么？' })).toBe('主角叫什么？');
    expect(extractPendingQuestion({ title: '人物确认', pages: [{ question: '形象 OK？' }, { question: '服装 OK？' }] }))
      .toBe('人物确认 / 形象 OK？ / 服装 OK？');
    expect(extractPendingQuestion({})).toBe('');
    expect(extractPendingQuestion(null)).toBe('');
  });

  it('★ appendTaskDecision：会话未挂空间时静默跳过（不抛错）', () => {
    const fn = SPACE_MEM;
    expect(fn, '★ 未实现 appendTaskDecision').toMatch(/export async function appendTaskDecision/);
    expect(fn, '★ 未处理 space_id 为空（未挂空间会话会抛错/写错位置）').toMatch(/space_id/);
    expect(fn, '★ 决策文件路径不对（应为 .yan-zhi/task-memory/decisions.md）').toMatch(/task-memory/);
    expect(fn, '★ 缺少 decisions.md 文件名').toMatch(/decisions\.md/);
  });

  it('★ 决策记录必须注入系统提示词（loadTaskMemoryForConversation + formatTaskMemoryContext）', () => {
    expect(LTM, '★ 未导入决策记录模块').toMatch(/loadTaskMemoryForConversation|formatTaskMemoryContext/);
    // 提示词组装处必须真的调用（不是只 import）
    expect(LTM, '★ 注入点未调用 loadTaskMemoryForConversation').toMatch(/loadTaskMemoryForConversation\(convId\)/);
    expect(SPACE_MEM, '★ formatTaskMemoryContext 未声明"不要重复询问"语义（注入的意义就在此）')
      .toMatch(/不要重复询问/);
  });
});

describe('pending 交互持久化与存活语义', () => {
  it('★ ask_user/confirm_user 不得被 2 分钟超时杀掉', () => {
    const fn = LTM.slice(LTM.indexOf('async function executeToolViaFrontend'), LTM.indexOf('async function runWorkflowSubAgent'));
    expect(fn, '★ 未区分交互类工具的创建超时').toMatch(/INTERACTIVE_TOOLS\.has\(toolName\)/);
    // 交互类：timer = undefined；非交互才有 2min timer
    expect(fn, '★ 交互类工具仍会设置超时 timer').toMatch(/interactive\s*\?\s*undefined\s*:\s*setTimeout/);
  });

  it('★ 15 秒断连宽限必须跳过交互类工具', () => {
    const fn = LTM.slice(LTM.indexOf('export function subscribe'), LTM.indexOf('export function abortTask'));
    expect(fn, '★ 断连宽限未跳过 ask_user/confirm_user（关一下应用问题就没了）')
      .toMatch(/INTERACTIVE_TOOLS\.has\(pending\.toolName/);
  });

  it('★ pending_tool_json 必须写库（列存在但此前从未写入 → 重启后查不到）', () => {
    expect(LTM, '★ 缺少 syncPendingToolsJson 写库函数').toMatch(/function syncPendingToolsJson/);
    expect(LTM, '★ syncPendingToolsJson 未 UPDATE llm_task').toMatch(/UPDATE llm_task SET pending_tool_json/);
    // 设置 / 提交 / 终止三个生命周期点都要同步
    const setSite = LTM.slice(LTM.indexOf('task.pendingToolCalls.set(callId'), LTM.indexOf('task.pendingToolCalls.set(callId') + 400);
    expect(setSite, '★ 设置 pending 后未同步 json').toMatch(/syncPendingToolsJson\(task\)/);
    const resolveFn = LTM.slice(LTM.indexOf('export function resolveToolResult'), LTM.indexOf('/** 获取用户的活动任务'));
    expect(resolveFn, '★ 提交结果后未同步 json（残留指向已回答的调用）').toMatch(/syncPendingToolsJson\(task\)/);
    const abortFn = LTM.slice(LTM.indexOf('export function abortTask'), LTM.indexOf('export function pauseTask'));
    expect(abortFn, '★ 终止任务后未同步 json').toMatch(/syncPendingToolsJson\(task\)/);
  });

  it('★ /llm/tasks/active 必须回显 pendingTools（前端判断会话卡在等谁）', () => {
    expect(ROUTES, '★ /tasks/:id 未回显 pendingTools').toMatch(/pendingTools/);
    expect(ROUTES, '★ 恢复路径未从 pending_tool_json 解析 pendingTools').toMatch(/pending_tool_json/);
  });
});

// ========================================================================
// ⑨ 2026-09-27 补漏：空间归属 / 资源读取 / 决策记录漏记路径
// ========================================================================
const REPO_ROOT = resolve(SERVER_SRC, '..', '..');
const readRepo = (p: string) => readFileSync(resolve(REPO_ROOT, p), 'utf8');
const USE_CHAT_RAW = readRepo('packages/ui/src/composables/chat/useChat.ts');
// ★ 先剥注释再断言：本轮踩到 —— 说明性注释里写着反例代码
//   （`// 原实现直接 let spaceId = await ensureWorkspaceSpace()`），
//   不剥注释会让「不得出现该写法」的断言**假红**（本轮实测：断言抓的是注释，不是代码）。
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
const USE_CHAT = stripJsComments(USE_CHAT_RAW);
const CHAT_SIDEBAR = readRepo('packages/ui/src/components/chat/ChatSidebar.vue');
const SPACES_ROUTE_RAW = read('src/routes/spaces.ts');
const SPACE_RES_RAW = read('src/services/space-resources.ts');
// ★★ 剥注释后再断言（本轮实测两次踩到同一坑）：
//   说明性注释里会写出「正确写法」或「反例」，直接 toMatch 会命中注释 → 断言漏网。
//   实例：`// GET /api/spaces/:id/resources/:dir/raw?name=xxx` 让「路由被改名」变异仍绿；
//         `// …禁 ..` 让「去掉防穿越校验」变异仍绿。
const stripJsComments2 = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
const SPACES_ROUTE = stripJsComments2(SPACES_ROUTE_RAW);
const SPACE_RES = stripJsComments2(SPACE_RES_RAW);
const FILE_PREVIEW = readRepo('packages/ui/src/components/FilePreview.vue');
const CHAT_STORE = readRepo('packages/ui/src/stores/chat.ts');
const PANEL = readRepo('packages/ui/src/components/chat/ChatFilePanel.vue');

describe('⑨ 空间归属：任务类型必须真的生效（修「选了跟没选一样」）', () => {
  it('★★ send() 不得用 ensureWorkspaceSpace 覆盖用户选中的空间', () => {
    // 反例：let spaceId = await ensureWorkspaceSpace() —— 它只按 workspaceDir 匹配空间，
    // 匹配不到还会自动新建并 selectSpace，完全不看 currentSpaceId
    expect(USE_CHAT, '★★ 仍在用 ensureWorkspaceSpace 决定归属（会覆盖用户选择）')
      .not.toMatch(/let spaceId = await ensureWorkspaceSpace\(\)/);
    expect(USE_CHAT, '★ 缺少 resolveSpaceForNewConv').toMatch(/async function resolveSpaceForNewConv/);
    // 新函数必须优先读 currentSpaceId
    const fn = USE_CHAT.slice(USE_CHAT.indexOf('async function resolveSpaceForNewConv'), USE_CHAT.indexOf('async function ensureWorkspaceSpace'));
    expect(fn, '★ 未优先采用用户选中的空间').toMatch(/spaceStore\.currentSpaceId/);
    expect(fn, '★ 未校验选中空间仍存在（删除后残留 id 会绑到不存在的空间）')
      .toMatch(/spaces\.some\(/);
    // 两处建会话都要走新函数
    const calls = (USE_CHAT.match(/resolveSpaceForNewConv\(\)/g) || []).length;
    expect(calls, '★ 建会话路径未全部改用新解析（漏一处就会串空间）').toBeGreaterThanOrEqual(3); // 定义 1 + 调用 2
  });

  it('★ 点空间节点要能选中（否则用户没有入口指定归属）', () => {
    expect(CHAT_SIDEBAR, '★ 空间节点头未接选中处理').toMatch(/onSpaceHeadClick/);
    expect(CHAT_SIDEBAR, '★ 缺选中态的视觉标识').toMatch(/tree-node-active/);
    // ★ 必须真的调用选中（只写函数不接上 = 摆设）：
    const clickFn = CHAT_SIDEBAR.slice(CHAT_SIDEBAR.indexOf('function onSpaceHeadClick'), CHAT_SIDEBAR.indexOf('function taskTypeLabel'));
    expect(clickFn, '★★ onSpaceHeadClick 未调用 selectSpaceAndSyncDir（点了不选中）')
      .toMatch(/selectSpaceAndSyncDir\(/);
    // 选中要同步工作目录，否则面板显示 A 空间资源、工具往 B 目录写
    const fn = USE_CHAT.slice(USE_CHAT.indexOf('async function selectSpaceAndSyncDir'), USE_CHAT.indexOf('function selectSpace('));
    expect(fn, '★ selectSpaceAndSyncDir 未同步 workspaceDir').toMatch(/workspaceDir/);
    expect(fn, '★★ selectSpaceAndSyncDir 未真正 selectSpace（选中无效）')
      .toMatch(/spaceStore\.selectSpace\(id\)/);
  });
});

describe('⑨ 资源文件读取：Web 端必须能打开', () => {
  it('★★ 必须有「按空间+资源目录+文件名」的服务端直读接口', () => {
    expect(SPACES_ROUTE, '★ 缺资源直读路由').toMatch(/resources\/:dir\/raw/);
    expect(SPACE_RES, '★ 缺 resolveResourceFilePath').toMatch(/export function resolveResourceFilePath/);
    // 安全：必须防穿越（文件名只允许单段）
    const fn = SPACE_RES.slice(SPACE_RES.indexOf('export function resolveResourceFilePath'), SPACE_RES.indexOf('export async function summarizeResourceDirs('));
    expect(fn, '★ 未校验目录名白名单').toMatch(/RESOURCE_DIR_NAMES\.includes/);
    expect(fn, '★ 未过滤路径分隔符/.. 与首尾长度校验（可穿越读任意文件）')
      .toMatch(/name\.length\s*>\s*180/);
    expect(fn, '★ 未校验目标是文件').toMatch(/isFile\(\)/);
    // ★ 精确锚定"那一行校验语句本身"（去掉它必红）：必须同时出现分隔符类与 '..'
    expect(fn, '★ 分隔符/.. 过滤语句被删除').toMatch(/\btest\(name\)[\s\S]{0,80}?name\.includes\('\.\.'\)/);
  });

  it('★ 前端资源项必须带上 spaceId + resourceDir（否则 Web 端读不到）', () => {
    expect(PANEL, '★ previewResource 未接收目录名').toMatch(/previewResource\(f,\s*d\.dir\)/);
    expect(PANEL, '★ openTab 未带 spaceId/resourceDir').toMatch(/spaceId:.*currentSpaceId[\s\S]{0,120}?resourceDir:/);
    // 预览 tab 类型要支持这两个字段
    expect(CHAT_STORE, '★ PreviewTab 缺 spaceId/resourceDir').toMatch(/resourceDir\?: string/);
    // FilePreview 要有资源直读兜底
    expect(FILE_PREVIEW, '★ 缺 readViaResourceApi 兜底').toMatch(/async function readViaResourceApi/);
    expect(FILE_PREVIEW, '★ 兜底未按空间+目录+文件名请求').toMatch(/resources\/\$\{encodeURIComponent\(resourceDir\)\}\/raw/);
    // ★ 关键：必须接进两个读取函数，否则各类型分支（PDF/Excel/CSV/文本）仍读不到
    const b64Fn = FILE_PREVIEW.slice(FILE_PREVIEW.indexOf('async function readFileWithFallback'), FILE_PREVIEW.indexOf('async function readTextWithFallback'));
    const txtFn = FILE_PREVIEW.slice(FILE_PREVIEW.indexOf('async function readTextWithFallback'), FILE_PREVIEW.indexOf('async function resolveServerSidePath'));
    expect(b64Fn, '★★ 二进制读取未接资源兜底（图片/PDF/docx 会失败）').toMatch(/readViaResourceApi\(\)/);
    expect(txtFn, '★★ 文本读取未接资源兜底（txt/md/csv 会失败）').toMatch(/readViaResourceApi\(\)/);
  });
});

describe('⑨ 决策记录：终止与中途关闭不得丢已答内容', () => {
  it('★ 后端必须能从 JSON 字符串形态的结果里取出答案', async () => {
    expect(LTM, '★ 缺 extractAnswerText').toMatch(/export function extractAnswerText/);
    // ★ 行为断言（不是"词出现过"）：直接喂真实形状，验证真的解析出来了。
    //   前端 POST 的是 JSON.stringify 后的字符串 —— 不还原就会把整个 JSON 串写进决策记录。
    const { extractAnswerText } = await import('../src/llm-task-manager');
    const asString = JSON.stringify({ cancelled: false, summary: 'Q: 主角叫什么？\nA: 林昭' });
    expect(extractAnswerText(asString), '★★ 未从 JSON 字符串里取出 summary（会把 JSON 串原样记进决策）')
      .toBe('Q: 主角叫什么？\nA: 林昭');
    expect(extractAnswerText({ summary: 'Q: a\nA: b' }), '★ 对象形态未取 summary').toBe('Q: a\nA: b');
    // 没有 summary 时从 answers 兜底拼装
    const fromAnswers = extractAnswerText({ answers: [{ question: '形象 OK？', answer: 'OK' }] });
    expect(fromAnswers, '★ 无 summary 时未从 answers 兜底').toContain('形象 OK？');
    expect(fromAnswers).toContain('OK');
    // 纯文本原样返回（ask_user 的回答就是纯文本）
    expect(extractAnswerText(' 日式禅意风格 ')).toBe('日式禅意风格');
    expect(extractAnswerText(null)).toBe('');
  });

  it('★ 写入决策记录必须用取出的答案文本，而不是裸 result', () => {
    const fn = LTM.slice(LTM.indexOf('export function resolveToolResult'), LTM.indexOf('/** 从交互工具的入参提取'));
    expect(fn, '★ 仍把裸 result 当答案记录（会写入 JSON 串）').not.toMatch(/appendTaskDecision\([^)]*,\s*result\)/);
    expect(fn, '★ 未用 extractAnswerText').toMatch(/extractAnswerText\(result\)/);
  });

  it('★ 任务被终止时也要留下痕迹（否则该确认点彻底无痕）', () => {
    const fn = LTM.slice(LTM.indexOf('export function abortTask'), LTM.indexOf('export function pauseTask'));
    expect(fn, '★ abort 未记录交互类工具').toMatch(/INTERACTIVE_TOOLS\.has\(pending\.toolName/);
    expect(fn, '★ abort 未调用 appendTaskDecision').toMatch(/appendTaskDecision\(/);
  });

  it('★ 中途关闭向导要回传已作答部分（前端）', () => {
    const fn = CHAT_STORE.slice(CHAT_STORE.indexOf('function cancelPendingConfirmation'), CHAT_STORE.indexOf('function submitPlatformConfig'));
    // ★ 必须真的产出 summary 文本（只声明 answered 数组不拼进结果 = 摆设）
    expect(fn, '★ 未把已作答内容拼进 summary').toMatch(/const summary = answered/);
    expect(fn, '★★ summary 未随结果回传（后端拿不到已答内容）').toMatch(/summary\s*:/);
    // 必须过滤掉空答案（未作答的页不该记成"用户确认了空"）
    expect(fn, '★ 未过滤空答案').toMatch(/\.filter\(/);
  });
});
