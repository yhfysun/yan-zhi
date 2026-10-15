/**
 * pending 工具定时器：重连**不得**解除工具超时（2026-10-15 修，根因）。
 *
 * ★★★ 现场（代码走读 + 10-14 单日 84 次流断连）：`PendingToolCall` 此前只有**一个**
 *   `timer` 字段，被两类定时器共用：
 *     · 工具**原始超时**（`resolveFrontendToolTimeout` 定的 15s/90s/7min…，在
 *       executeToolViaFrontend 里设置）；
 *     · 「最后一个订阅者断开」时的 **15 秒断连宽限期**。
 *   于是 `subscribe()`（前端重连）里那句"清除断连宽限期"实际把**原始超时也一起清掉了**，
 *   而且**不恢复** ⇒ 任何一次 SSE 重连之后，这个 pending 工具就**永久没有超时**。
 *   若它委托的前端结果又因故没回来（渲染层 POST 重试 3 次后静默放弃），这一步只能等
 *   用户手动中止或 2 小时看门狗 —— 表现为"任务卡住、既不失败也不结束"。
 *
 * 修法：把宽限期拆成独立字段 `graceTimer`；重连只清 `graceTimer`，永不碰 `timer`；
 *   清理收口到 `clearPendingTimers()` 一处（防"拆分后各处漏清一半"）。
 *
 * 本测试是**源码级守门**（该行为需要真实任务 + 断连才能跑，成本过高），钉住四件事：
 *   ① 两个字段并存；② 重连只清 graceTimer；③ 不再出现"重连清 timer"的旧写法；
 *   ④ 清理收口一处。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');

/** 取一段可执行代码（剥掉注释行，避免注释里的旧实现名字造成误判）。 */
function codeBlock(fromMarker: string, len: number): string {
  const at = SRC.indexOf(fromMarker);
  expect(at, `找不到锚点：${fromMarker}`).toBeGreaterThan(-1);
  return SRC.slice(at, at + len)
    .split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    .join('\n');
}

describe('pending 工具定时器：重连不得解除超时（2026-10-15）', () => {
  it('两个定时器字段必须并存（原始超时 timer / 断连宽限 graceTimer）', () => {
    const iface = codeBlock('interface PendingToolCall {', 1200);
    expect(iface, '缺原始超时字段').toMatch(/timer\?:\s*ReturnType<typeof setTimeout>/);
    expect(iface, '缺断连宽限字段 —— 与 timer 共用会重现"重连解除超时"').toMatch(/graceTimer\?:\s*ReturnType<typeof setTimeout>/);
  });

  it('★★ 重连（subscribe）只清 graceTimer，绝不碰 timer', () => {
    const sub = codeBlock('export function subscribe(', 2600);
    expect(sub, '重连必须清 graceTimer').toMatch(/clearTimeout\(pending\.graceTimer\)/);
    // 关键防回退：重连分支里不得出现对原始超时的清理
    expect(sub, '★ 重连又清原始超时了 —— 会重现"重连后工具永久无超时"')
      .not.toMatch(/clearTimeout\(pending\.timer\)/);
    expect(sub, '★ 重连不得把 timer 置空').not.toMatch(/pending\.timer\s*=\s*undefined/);
  });

  it('宽限期定时器只写进 graceTimer（写错字段等于没有宽限语义）', () => {
    const sub = codeBlock('export function subscribe(', 2600);
    expect(sub, '15s 宽限必须写 graceTimer').toMatch(/pending\.graceTimer\s*=\s*setTimeout\(/);
    expect(sub, '15s 宽限不得再写进 timer').not.toMatch(/pending\.timer\s*=\s*setTimeout\(/);
  });

  it('★ 定时器清理必须收口一处（防拆分后各处只清一半）', () => {
    expect(SRC, '缺统一清理函数').toMatch(/function clearPendingTimers\(pending: PendingToolCall\)/);
    const helper = codeBlock('function clearPendingTimers(', 400);
    expect(helper, '统一清理必须同时清两个定时器').toMatch(/clearTimeout\(pending\.timer\)/);
    expect(helper, '统一清理必须同时清两个定时器').toMatch(/clearTimeout\(pending\.graceTimer\)/);
    // abortTask / resolveToolResult 必须走统一函数，而不是各写一半
    expect(SRC, '未走统一清理').toMatch(/clearPendingTimers\(pending\);/);
    expect(SRC, 'resolveToolResult 未走统一清理').toMatch(/clearPendingTimers\(pending\);\n\s*syncPendingToolsJson\(task\);/);
  });

  it('原始超时仍在 executeToolViaFrontend 里设置（未被改动）', () => {
    expect(SRC, '工具原始超时设置点消失').toMatch(/pendingToolCalls\.set\(callId,\s*\{[^}]*timer/);
  });
});