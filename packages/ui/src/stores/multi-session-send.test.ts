/**
 * 多会话并发发送「消息消失」守门测试（2026-10-09，P0 实据修复）。
 *
 * ★★★ 背景（用户实报，现场在公司电脑）：
 *   「多个会话发送任务有 bug：A 会话的大模型在运行，B 会话的消息发送出去页面上没有这个消息，
 *     但是输入框显示任务运行中，内容区没反应。」
 *
 * 真因链（两处叠加，都是**无声吞掉**用户消息）：
 *   ① `stores/chat.ts` callLlm 的同会话守卫此前是裸 `if (runningConvIds.value.has(convId)) return;`
 *      —— 不落库、不发 SSE、不给提示。消息凭空消失。
 *   ② `composables/chat/useChat.ts` 的 `send()` 里 `input.value` 要等「建空间 → 建会话 →
 *      落附件」多个 await 之后才清空 → 连按 Enter / 双击会并发进入第二次，命中①。
 *   ③ `runningConvIds` 残留（SSE 终态事件丢失）会让该会话**永久**发不出消息，且「任务运行中」
 *      挂不掉；原有的 sweepStaleBrowserTakeover 又被 `browserTaskConvs` 前置条件把**纯文本会话**
 *      整个排除在自愈之外。
 *
 * 本测试钉**用户可感知的语义**（不是"代码里有没有这段"），并做**变异验证**：
 *   把实现退回旧形态 → 必须变红。
 *
 * ⚠️ 源码结构断言必须先**剥注释**（项目既有坑：注释里写着旧代码字样会把 not.toMatch 误伤）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// —— store 级行为测试所需的最小 mock ——
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001',
  buildRequestHeaders: () => ({}),
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('./auth', () => ({ useAuthStore: () => ({ useServerApi: true }) }));
vi.mock('./agent', () => ({ useAgentStore: () => ({ selectedAgent: null, selectedId: '' }) }));
vi.mock('./settings', () => ({ useSettingsStore: () => ({ settings: {} }) }));

import { api } from '../api/client';

const UI_SRC = resolve(__dirname, '..');
const CHAT_SRC = readFileSync(resolve(UI_SRC, 'stores/chat.ts'), 'utf8');
const USE_CHAT_SRC = readFileSync(resolve(UI_SRC, 'composables/chat/useChat.ts'), 'utf8');

/** 剥掉块注释与行注释（源码结构断言的**唯一正确姿势**：注释里的旧代码字样不算实现） */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** 取某个声明起的函数体窗口（够覆盖头部守卫即可） */
function bodyOf(src: string, decl: string, len = 6000): string {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('找不到声明: ' + decl);
  return stripComments(src.slice(i, i + len));
}

const PLATFORM = { id: 'p1', name: 'P', protocol: 'openai', apiUrl: 'http://x' } as any;
const MODEL = { id: 'm1', modelId: 'gpt', type: 'chat', platformId: 'p1' } as any;

async function freshChatStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./chat');
  return mod.useChatStore();
}

describe('多会话发送 · callLlm 同会话守卫（核心根因）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('★★★ 假运行态：UI 认为在跑但服务端无活动任务 → 清残留并继续，**不静默吞**', async () => {
    const st = await freshChatStore();
    const convId = 'conv_stale';
    // 构造假运行态：UI 侧记账说"在跑"，但服务端查活动任务为空
    (st.runningConvIds as Set<string>).add(convId);
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    // 起新任务必然打 POST /llm/tasks；让它**失败**（避免真跑 ReAct），
    // 我们只关心"有没有走到起任务这一步"（= 没被静默吞）。
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ error: 'STOP_AFTER_PROBE' });

    let threw = false;
    try {
      await st.sendMessage('hello', PLATFORM, MODEL, undefined, undefined, convId);
    } catch { threw = true; }

    // ① 确实去查了服务端活动任务（判据：不是无脑 return）
    const getCalls = (api.get as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(getCalls.some((u) => u.includes('/llm/tasks/active') && u.includes(convId)),
      '★ 命中 runningConvIds 后必须查服务端活动任务，而不是直接丢消息').toBe(true);
    // ② 确实继续走了 → 尝试起新任务（POST /llm/tasks）
    const postCalls = (api.post as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(postCalls.some((u) => u === '/llm/tasks'),
      '★ 假运行态残留必须被清掉并继续发送（不能因为死记账让会话永久发不出消息）').toBe(true);
    // ③ 残留已被清理
    expect(st.runningConvIds.has(convId), '★ 残留运行态未清除').toBe(false);
    void threw;
  });

  it('★★ 真在跑：服务端确有活动任务 → 只注入复用，**不重复起任务**', async () => {
    const st = await freshChatStore();
    const convId = 'conv_running';
    (st.runningConvIds as Set<string>).add(convId);
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'task_x', conversationId: convId, status: 'running' }],
    });
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { status: 'injected', msgId: 'msg_inj', duplicate: false },
    });

    await st.sendMessage('追加要求', PLATFORM, MODEL, undefined, undefined, convId);

    const urls = (api.post as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/llm/tasks/inject')),
      '★ 真在跑时必须走注入复用，消息才会落库并回显').toBe(true);
    expect(urls.includes('/llm/tasks'),
      '★ 注入成功却又起了新任务（会双跑）').toBe(false);
  });

  it('★ 结构：runningConvIds 守卫不再是裸 return，且必须查服务端活动任务', () => {
    const fn = bodyOf(CHAT_SRC, 'async function callLlm');
    // 旧形态（裸 return 静默吞）必须消失
    expect(fn, '★ 仍是裸 `if (runningConvIds.value.has(convId)) return;` —— 会静默吞消息')
      .not.toMatch(/if\s*\(\s*runningConvIds\.value\.has\(convId\)\s*\)\s*return\s*;/);
    // 必须体现"不静默"：查活动任务
    expect(fn, '★ 未查服务端活动任务，无法区分真在跑 / 假运行态')
      .toMatch(/\/llm\/tasks\/active\?conversationId=/);
    // 假运行态要清残留
    expect(fn, '★ 未清残留运行态').toMatch(/runningConvIds\.value\.delete\(convId\)/);
  });
});

describe('多会话发送 · 假运行态自愈巡检', () => {
  it('★★★ 结构：巡检不得再用 browserTaskConvs 前置 continue 排除纯文本会话', () => {
    const fn = bodyOf(CHAT_SRC, 'async function sweepStaleBrowserTakeover');
    expect(fn, '★ 纯文本会话仍被排除在自愈之外（`if (!browserTaskConvs.value.has(convId)) continue;`）')
      .not.toMatch(/if\s*\(\s*!\s*browserTaskConvs\.value\.has\(convId\)\s*\)\s*continue\s*;/);
    // 浏览器会话仍应有活性宽限（不能把这条安全阀一起删掉）
    expect(fn, '★ 浏览器会话的活性宽限被误删').toMatch(/lastBrowserToolAt/);
  });

  it('★ 结构：单会话查询失败只跳过本会话（不得 return 拖垮整轮自愈）', () => {
    const fn = bodyOf(CHAT_SRC, 'async function sweepStaleBrowserTakeover');
    expect(fn, '★ 查询失败用 return 会中断其余会话的自愈')
      .not.toMatch(/'error'\s+in\s+\(r\s+as\s+any\)\s*\|\|\s*!\(r\s+as\s+any\)\.data\)\s*return;/);
  });
});

describe('多会话发送 · input 清空时机', () => {
  it('★★★ 结构：`input.value=\'\'` 必须紧跟在取内容之后（任何 await 之前）', () => {
    const i = USE_CHAT_SRC.indexOf('const content = input.value;');
    expect(i, '★ 找不到取内容的语句').toBeGreaterThan(-1);
    const window = stripComments(USE_CHAT_SRC.slice(i, i + 200));
    expect(window, '★ 取内容后未立即清空输入框（await 窗口期可被二次发送 → 命中同会话守卫吞消息）')
      .toMatch(/const content = input\.value;\s*\n\s*input\.value = '';/);
  });
});