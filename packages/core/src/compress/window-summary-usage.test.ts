import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ContextWindow } from './window.js';
import { setPlatformAdapter } from '../platform/types.js';

/**
 * 压缩摘要记账回调 —— **真跑验证**（2026-10-18，方案 §8 记录的缺口之二）。
 *
 * ★ 为什么必须有真跑：`ContextWindow.summarize` 内部调 LLM 这件事只有
 *   `compress()` 真跑才会发生 —— 单测喂假 client 根本到不了那一行。
 *   这里用仓库现成的 mock LLM server（真 HTTP），断言：
 *   ① 摘要真调了 LLM 且 usage（{600,400,0,200}）真回调到了 hook；
 *   ② 回调拿到摘要的输入/输出原文（估算兜底要用）；
 *   ③ hook 抛错不炸压缩（记账是旁路）。
 *
 * ★ 变异验证：把 summarize 里的 `onUsage` 捕获删掉 ⇒ 用例 ① 打红；
 *   把 `try/catch` 去掉 ⇒ 用例 ③ 打红。
 */
const require = createRequire(import.meta.url);
const { createMockLlmServer, MOCK_MODEL_ID, MOCK_USAGE } = require('../../../../tools/mock-llm-server.cjs') as {
  createMockLlmServer: () => Server;
  MOCK_MODEL_ID: string;
  MOCK_USAGE: { normalized: { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number } };
};

let server: Server;
let base = '';

beforeAll(async () => {
  server = createMockLlmServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // LlmClient 构造时会读 keyring（mock 不校验 Key，给个非空即可）
  setPlatformAdapter({
    platform: 'web',
    db: {} as any,
    fs: {} as any,
    keyring: { get: async () => 'mock-key', set: async () => {}, delete: async () => {} },
  } as any);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** ★ 必须是函数：`base` 在 beforeAll 里才确定，模块求值时还是空串（空 apiUrl ⇒ 请求必败走降级） */
function mkPlatform() {
  return { id: 'p_sum', apiUrl: base, protocol: 'openai', headers: {} } as any;
}
const MODEL = { modelId: MOCK_MODEL_ID } as any;

/** 一批足够长的历史（估算 token 远超 forBudget 的极小阈值 ⇒ 必然触发整段摘要） */
function longMessages() {
  const msgs: any[] = [];
  for (let i = 0; i < 20; i++) {
    msgs.push({ id: `m${i}`, conversationId: 'c', role: i % 2 ? 'assistant' : 'user', content: `第${i}轮：${'压缩摘要记账测试内容。'.repeat(20)}`, createdAt: i });
  }
  return msgs;
}

describe('ContextWindow 摘要记账回调（setSummaryUsageHook）', () => {
  it('★ 摘要真调 LLM，usage 与输入/输出原文真回调（mock 固定用量 {600,400,0,200}）', async () => {
    const cw = ContextWindow.forBudget(100); // 阈值极小 ⇒ 必然超限触发摘要
    const seen: Array<{ detail: any; info: { inputText: string; outputText: string } }> = [];
    cw.setSummaryModel(mkPlatform(), MODEL);
    cw.setSummaryUsageHook((detail, info) => seen.push({ detail, info }));

    const messages = longMessages();
    const out = await cw.compress(messages, { summaryCache: { ids: [], summary: '' } });

    // 压缩确实发生
    expect(out.length).toBeLessThan(messages.length);
    // 回调恰好一次，usage 殊途同归（钉住归一化口径）
    expect(seen.length).toBe(1);
    expect(seen[0].detail).toMatchObject(MOCK_USAGE.normalized);
    // 估算兜底要用的原文都在
    expect(seen[0].info.inputText).toContain('压缩摘要记账测试内容');
    expect(typeof seen[0].info.outputText).toBe('string');
    expect(seen[0].info.outputText.length).toBeGreaterThan(0);
  });

  it('★ hook 抛错不炸压缩（记账是旁路，不是主链路）', async () => {
    const cw = ContextWindow.forBudget(100);
    cw.setSummaryModel(mkPlatform(), MODEL);
    cw.setSummaryUsageHook(() => { throw new Error('boom'); });
    const messages = longMessages();
    const out = await cw.compress(messages, { summaryCache: { ids: [], summary: '' } });
    expect(out.length).toBeGreaterThan(0);
  });

  it('不挂 hook（undefined）行为与旧版完全一致', async () => {
    const cw = ContextWindow.forBudget(100);
    cw.setSummaryModel(mkPlatform(), MODEL);
    const messages = longMessages();
    const out = await cw.compress(messages, { summaryCache: { ids: [], summary: '' } });
    expect(out.length).toBeLessThan(messages.length);
  });
});
