/**
 * LLM Token 池轮换 —— 守门测试（2026-10-13）。
 *
 * ★★★ 背景（用户实报「401 Unauthorized（API Key 无效或未配置）…Incorrect API key provided」，
 *   并追问「不是有两个 Token 换着用这个功能没了？」）：
 *   `PlatformAdapter.llmKeyPool`（platform/types.ts:80）声明"设置后 LlmClient 直连失败会
 *   自动换 Key 重试并回写失败记录"，`node-adapter.ts` 的 llmKeyPoolAdapter 也实现了
 *   acquire/reportSuccess/reportFailure —— 但 **LlmClient 从未调用过它**。
 *   于是 keyring 只剩"从池里随机取一把"当初始 Key：取到死 Key 就直接 401 收场，
 *   `platform_api_key.fail_count` 恒为 0（实测 agens-guest 池 11 把全是 0），
 *   死 Key 每轮仍按权重发出去 ⇒ 「偶发 401 打死长任务」（10-10 ~ 10-13 共 5 次）。
 *
 * 本测试钉住三件事：
 *   ① 401/403 必须换下一把 Key 重发（且不重复试同一把）
 *   ② 失败/成功必须回写池（否则权重永不衰减，池学不到哪把是死的）
 *   ③ **无池时行为完全不变**（桌面/浏览器端走代理，core 手里没有 Key 可换）
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LlmClient, MAX_KEY_SWAPS } from './client';
import { setPlatformAdapter } from '../platform/types';

const PLATFORM = { id: 'p1', apiUrl: 'https://up.example', protocol: 'openai', headers: {} } as any;
const MODEL = { modelId: 'm1' } as any;

/** 组装一个只带 keyring + llmKeyPool 的最小适配器（其余字段本用例不触达） */
function adapterWith(tokens: Array<{ id: string; apiKey: string }>, log: { acquire: string[][]; success: string[]; failure: string[] }) {
  return {
    platform: 'web',
    db: {} as any,
    fs: {} as any,
    keyring: { async get() { return 'keyring-key'; }, async set() {}, async delete() {} },
    llmKeyPool: {
      async acquire(_platformId: string, excludeIds: string[]) {
        log.acquire.push(excludeIds.slice());
        const t = tokens.find((x) => !excludeIds.includes(x.id));
        return t ? { id: t.id, apiKey: t.apiKey } : null;
      },
      reportSuccess(id: string) { log.success.push(id); },
      reportFailure(id: string) { log.failure.push(id); },
    },
  } as any;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const OK_BODY = { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
const USER_MSG = [{ id: 'm', conversationId: 'c', role: 'user', content: 'hi', createdAt: 0 }] as any;

/** 取第 n 次 fetch 的 Authorization 头 */
function authOf(fetchMock: any, n: number): string {
  const call = fetchMock.mock.calls[n];
  const headers = call[1]?.headers || {};
  return headers.Authorization || headers.authorization || '';
}

let log: { acquire: string[][]; success: string[]; failure: string[] };
const realFetch = globalThis.fetch;

beforeEach(() => {
  log = { acquire: [], success: [], failure: [] };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('LlmClient Token 池轮换（2026-10-13）', () => {
  it('★★★ 401 换下一把 Key 重发，并回写失败/成功（本次实报场景）', async () => {
    const tokens = [{ id: 't1', apiKey: 'sk-dead' }, { id: 't2', apiKey: 'sk-alive' }];
    setPlatformAdapter(adapterWith(tokens, log));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'Incorrect API key provided' } }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    globalThis.fetch = fetchMock as any;

    const client = new LlmClient(PLATFORM, MODEL);
    const out = await client.chat(USER_MSG, {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock, 0)).toBe('Bearer sk-dead');
    expect(authOf(fetchMock, 1)).toBe('Bearer sk-alive'); // ← 换成了另一把
    expect(log.failure).toEqual(['t1']);                  // ← 死的被回写（此后按权重衰减）
    expect(log.success).toEqual(['t2']);
    expect(out.delta?.content).toBe('hi');
  });

  it('★ 同一次请求内不重复试同一把 Key（excludeIds 生效）', async () => {
    const tokens = [{ id: 't1', apiKey: 'sk-1' }, { id: 't2', apiKey: 'sk-2' }];
    setPlatformAdapter(adapterWith(tokens, log));
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY)) as any;

    // 两把都试过仍是 401 → 如实抛出（池已空，无可再换）
    await expect(new LlmClient(PLATFORM, MODEL).chat(USER_MSG, {})).rejects.toThrow(/401/);

    // 第 3 次 acquire 必须排除前两把；池已空 → 返回 null，不再发第 3 次请求
    expect(log.acquire[2]).toEqual(['t1', 't2']);
    expect(log.failure).toEqual(['t1', 't2']);
  });

  it('★ 池里全是死 Key：换到上限就如实返回 401（不无限重试）', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, apiKey: `sk-${i}` }));
    setPlatformAdapter(adapterWith(many, log));
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(401, {}));
    globalThis.fetch = fetchMock as any;

    await expect(new LlmClient(PLATFORM, MODEL).chat(USER_MSG, {})).rejects.toThrow(/401/);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_KEY_SWAPS + 1); // 首发 1 次 + 换 Key 上限次
    expect(log.failure).toHaveLength(MAX_KEY_SWAPS + 1);
  });

  it('★ 无 Token 池（桌面/浏览器端走代理）→ 401 不轮换，行为与改动前一致', async () => {
    const adapter = adapterWith([], log) as any;
    delete adapter.llmKeyPool;
    setPlatformAdapter(adapter);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    globalThis.fetch = fetchMock as any;

    await expect(new LlmClient(PLATFORM, MODEL).chat(USER_MSG, {})).rejects.toThrow(/401/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.acquire).toHaveLength(0);
    expect(authOf(fetchMock, 0)).toBe('Bearer keyring-key'); // 仍走 keyring 主 Key
  });

  it('★ 400 不回写失败（请求问题不该把好 Key 冤枉降权）', async () => {
    const tokens = [{ id: 't1', apiKey: 'sk-good' }];
    setPlatformAdapter(adapterWith(tokens, log));
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: 'messages 参数非法' } })) as any;

    await expect(new LlmClient(PLATFORM, MODEL).chat(USER_MSG, {})).rejects.toThrow(/400/);

    expect(log.failure).toEqual([]);
    expect(log.success).toEqual([]);
  });
});