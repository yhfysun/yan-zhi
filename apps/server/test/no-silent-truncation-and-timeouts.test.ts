/**
 * 「不静默断流」+「前端工具分档超时」守门测试（2026-10-09，P0/P1 实据修复）。
 *
 * 背景（见 .workbuddy/memory/2026-10-09.md 与 docs/会话卡死与流式断流-根因与修复方案-20261009.md）：
 *   · 上游/代理用 TCP FIN 半途关 SSE 时 `reader.read()` 是**正常结束**而非抛错 →
 *     旧代码把半截流当"本轮完成"落库（content 空、reasoning 一半），emit task:completed。
 *     修复：core parseSSE 吐 `terminated` 标记，任务循环据此**续写 / 落可见提示**，绝不静默留白。
 *   · 前端工具（尤其 browser_*）此前**一刀切** 2 分钟超时，慢站/代理下频繁误杀。
 *     修复：按工具分档 + 串行排队宽限。
 *
 * 本测试钉：
 *   ① 超时解析器分档正确（browser_navigate 远高于旧的 2 分钟；只读快档更短；未知 browser_ 走慢档）；
 *   ② 源码层：2 分钟硬编码已从超时处移除，续写/可见提示/分档解析器都真实存在（防回退）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 轻量 mock：llm-task-manager 顶层会拉起 db / core / mcp 等重依赖 ──
const noopStmt = () => ({ get: () => undefined, all: () => [], run: () => {} });
vi.mock('../src/db.js', () => ({
  db: { prepare: () => noopStmt(), exec: () => {}, pragma: () => {} },
  MESSAGE_LIST_COLS:
    'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  hasSqliteVec: false,
}));
vi.mock('@yan-zhi/core', () => ({
  runCodeDiagnostics: async () => ({ ran: [], projectRoot: null, problems: [], notes: [], durationMs: 0, text: '' }),
  invalidateDiagnosticsCache: () => {},
  SYNTHETIC_MESSAGE_IDS: new Set(['sys', 'summary', '__summary__']),
  isSyntheticMessageId: (id: string) => ['sys', 'summary', '__summary__'].includes(id),
  adviceForTruncatedArgs: () => ({ truncated: false, message: '' }),
  LlmClient: class { constructor() {} },
  getToolRegistry: () => ({ has: () => false, get: () => undefined, names: () => [], execute: async () => '', set: () => {} }),
  getApiToolRegistry: () => new Map(),
  ContextWindow: class {
    static forContextWindow() { return new this(); }
    static forBudget() { return new this(); }
    tokenCount() { return 0; }
    needsCompression() { return false; }
    compress(m: any[]) { return m; }
    setSummaryModel() {}
  },
  resolveToolPath: (input: unknown, ws?: string | null) => (typeof input === 'string' && input.trim()) || ws || '.',
  isAbsolutePath: (p: string) => /^([a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(String(p || '')),
  visibleMessages: (ms: any[]) => ms || [],
  resolveContextWindow: (n: any) => (typeof n === 'number' && n > 0 ? n : 32768),
}));
vi.mock('../src/mcp/index.js', () => ({ ensureToolsInitialized: () => {} }));
vi.mock('../src/mcp/api-tool-executor.js', () => ({
  executeApiTool: vi.fn(), SUPPORTED_API_TOOLS: [],
  isApiExecutableTool: (n: string) => typeof n === 'string' && n.startsWith('api_'),
}));
vi.mock('../src/services/ollama-embed.js', () => ({ embedText: vi.fn().mockResolvedValue([]) }));

import {
  resolveFrontendToolTimeout,
  FRONTEND_TOOL_TIMEOUT_MS,
  BROWSER_SLOW_TIMEOUT_MS,
  BROWSER_FAST_TIMEOUT_MS,
  BROWSER_QUEUE_GRACE_MS,
  STREAM_TRUNCATE_MAX_RETRY,
  TRUNCATED_STREAM_NOTICE,
} from '../src/llm-task-manager.js';

const MGR_SRC = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');

describe('P1 前端工具分档超时', () => {
  it('★★ browser_navigate 的委托超时**远高于**旧的 2 分钟（慢站/代理不再误杀）', () => {
    const t = resolveFrontendToolTimeout('browser_navigate');
    expect(t, '★ 导航类仍卡在 2 分钟附近 —— 慢站必被误杀').toBeGreaterThan(FRONTEND_TOOL_TIMEOUT_MS);
    expect(t).toBe(BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
    expect(t).toBeGreaterThanOrEqual(7 * 60 * 1000);
  });

  it('只读/轻交互（get_page_content / screenshot）走快档，且**短于**导航档', () => {
    const fast = resolveFrontendToolTimeout('browser_get_page_content');
    const nav = resolveFrontendToolTimeout('browser_navigate');
    expect(fast).toBe(BROWSER_FAST_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
    expect(fast).toBeLessThan(nav);
    expect(resolveFrontendToolTimeout('browser_screenshot')).toBe(fast);
  });

  it('未登记的 browser_* 走慢档（宁可等久也不误杀新工具）', () => {
    expect(resolveFrontendToolTimeout('browser_some_future_tool')).toBe(BROWSER_SLOW_TIMEOUT_MS + BROWSER_QUEUE_GRACE_MS);
  });

  it('非浏览器工具仍用默认超时（分档不误伤普通前端委托工具）', () => {
    expect(resolveFrontendToolTimeout('some_frontend_tool')).toBe(FRONTEND_TOOL_TIMEOUT_MS);
  });

  it('★ 源码层：超时处不再裸用 2 分钟魔数，改走解析器', () => {
    // 旧的 `? timeoutMsOverride : FRONTEND_TOOL_TIMEOUT_MS` 必须被解析器取代
    expect(MGR_SRC, '★ 超时处仍在裸用 2 分钟常量（分档未生效）')
      .not.toMatch(/:\s*FRONTEND_TOOL_TIMEOUT_MS\s*\)/);
    expect(MGR_SRC, '★ 缺分档解析器').toMatch(/function resolveFrontendToolTimeout/);
  });
});

describe('P0 断流不静默', () => {
  it('★ 定义了续写重试上限与可见提示文案', () => {
    expect(STREAM_TRUNCATE_MAX_RETRY).toBeGreaterThanOrEqual(1);
    expect(TRUNCATED_STREAM_NOTICE).toMatch(/中断/);
  });

  it('★ 源码层：消费流时跟踪收尾标记，且截断会触发续写', () => {
    expect(MGR_SRC, '★ 未跟踪流收尾标记（terminated）').toMatch(/chunk\.terminated/);
    expect(MGR_SRC, '★ 缺续写重试循环').toMatch(/STREAM_TRUNCATE_MAX_RETRY/);
  });

  it('★ 源码层：断流且无正文时落可见提示（不留空气泡）', () => {
    expect(MGR_SRC, '★ 缺"断流且无正文 → 落可见提示"的兜底')
      .toMatch(/fullContent\s*=\s*TRUNCATED_STREAM_NOTICE/);
  });

  it('★ 源码层：截断时 lastFinishReason 标为 truncated（供下游正确归因）', () => {
    expect(MGR_SRC).toMatch(/'truncated'/);
  });
});