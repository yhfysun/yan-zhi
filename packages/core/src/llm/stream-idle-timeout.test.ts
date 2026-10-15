/**
 * 上游流「静默」超时（2026-10-15，稳定性）。
 *
 * ★★★ 现场：`parseSSE` 的 `reader.read()` 是裸调用，**没有空闲计时器**。若上游接了连接、
 *   之后既不吐数据也不关连接（网关挂起 / 中间设备静默丢包），`read()` 会一直 pending：
 *   `consumeStream` 永不返回 → 该步既不失败也不结束 → 整个任务卡死，唯一逃生口是用户
 *   手动中止或 2 小时看门狗。这正是"任务跑不完、也不报错"的一类成因。
 *
 * 修法：给每次读加**空闲超时**（默认 10 分钟，任何正常上游都不会这么久不发一个字节；
 *   可用 `YANZHI_LLM_IDLE_TIMEOUT_MS` 覆盖，0 = 关闭）。超时时必须 `reader.cancel()`
 *   释放连接，否则那个 pending 的读会一直挂着。
 *
 * 本测试是**真实行为测试**（不是源码匹配）：用永不吐数据的流验证"会抛错而不是挂住"，
 * 并验证正常流不会被误杀。
 */
import { describe, it, expect } from 'vitest';
import { parseSSE, resolveLlmIdleTimeoutMs, DEFAULT_LLM_IDLE_TIMEOUT_MS } from './stream';

/** 一个**永不出数据、也永不关闭**的流 —— 模拟上游静默挂起。 */
function stallingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start() { /* 故意什么都不做 */ } });
}

/** 先吐一段合法 SSE、然后停住不关（半途静默）。 */
function dataThenStall(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      // 故意不 close：此后 read() 会 pending
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>, idleTimeoutMs: number) {
  const out: any[] = [];
  for await (const c of parseSSE(stream, { idleTimeoutMs })) out.push(c);
  return out;
}

describe('上游流静默超时（2026-10-15）', () => {
  it('★★ 静默流会**抛错**而不是无限挂起（本次修复的核心）', async () => {
    const t0 = Date.now();
    let err: any = null;
    try {
      await drain(stallingStream(), 60);
    } catch (e) { err = e; }
    const dt = Date.now() - t0;
    expect(err, '静默流没有抛错 —— 任务仍会挂死').toBeTruthy();
    expect(String(err.message)).toMatch(/无数据/);
    // 必须在超时附近返回，而不是挂住
    expect(dt, `超时后应立即返回，实际用了 ${dt}ms`).toBeLessThan(3000);
  });

  it('★★ 半途静默（已收到帧后上游停住）同样会抛错', async () => {
    const frames = ['data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'];
    let err: any = null;
    try { await drain(dataThenStall(frames), 60); } catch (e) { err = e; }
    expect(err, '半途静默未被兜住').toBeTruthy();
  });

  it('★ 正常流不会被误杀（收到终态即正常收尾）', async () => {
    const s = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const out = await drain(s, 60);
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1]).toMatchObject({ terminated: true });
  });

  it('idleTimeoutMs=0 → 关闭兜底（保持旧行为，不引入新失败点）', async () => {
    // 关闭时应能正常读完（此处用会 close 的流，避免测试真的挂住）
    const s = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); },
    });
    const out = await drain(s, 0);
    expect(out[out.length - 1]).toMatchObject({ terminated: true });
  });

  it('超时解析：显式传参 > 环境变量 > 默认', () => {
    expect(resolveLlmIdleTimeoutMs(1234)).toBe(1234);
    expect(resolveLlmIdleTimeoutMs(0)).toBe(0); // 0 = 关闭
    const prev = process.env.YANZHI_LLM_IDLE_TIMEOUT_MS;
    try {
      process.env.YANZHI_LLM_IDLE_TIMEOUT_MS = '4321';
      expect(resolveLlmIdleTimeoutMs()).toBe(4321);
      delete process.env.YANZHI_LLM_IDLE_TIMEOUT_MS;
      expect(resolveLlmIdleTimeoutMs()).toBe(DEFAULT_LLM_IDLE_TIMEOUT_MS);
    } finally {
      if (prev === undefined) delete process.env.YANZHI_LLM_IDLE_TIMEOUT_MS;
      else process.env.YANZHI_LLM_IDLE_TIMEOUT_MS = prev;
    }
  });

  it('默认值足够长 —— 绝不能误杀"首 token 慢"的正常请求', () => {
    expect(DEFAULT_LLM_IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});