/**
 * 发送重入锁守门测试（2026-10-09，P0 实据修复）。
 *
 * 背景：`useChat.send()` 取走内容后要跨多个 `await`（建空间/建会话/落附件），
 *   期间 `input.value` 未清空 → 连发/连按 Enter 会**并发进入多次** → 同一句话落库多条。
 *   实测铁证：生产库同一秒写进 **11 条一模一样的 user 消息**。
 *
 * 本测试钉住结构契约（composable 依赖太重，不适合整体挂载）：
 *   ① 存在 sending 锁，且在**任何 await 之前**置位、在 finally 释放；
 *   ② 锁已随 return 暴露，供 UI 置灰发送键。
 * 并在测试内**复刻锁的语义**做行为验证（同步重入只放行一次）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'useChat.ts'), 'utf8');

describe('send() 重入锁', () => {
  it('★ 源码层：send 入口同步置位重入锁，且用 try/finally 释放', () => {
    // 锁声明
    expect(SRC, '★ 缺 sending 锁声明').toMatch(/const\s+sending\s*=\s*ref\(false\)/);
    // send() 里先判后置位
    const i = SRC.indexOf('async function send()');
    expect(i, '★ 找不到 send()').toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 600);
    expect(body, '★ send() 未做重入判断').toMatch(/if\s*\(\s*sending\.value\s*\)\s*return/);
    expect(body, '★ send() 未置位重入锁').toMatch(/sending\.value\s*=\s*true/);
    expect(body, '★ send() 未在 finally 释放锁（异常后永久卡死发送）').toMatch(/finally\s*\{[\s\S]*?sending\.value\s*=\s*false/);
  });

  it('★ 源码层：锁随 return 暴露（UI 据此置灰发送键）', () => {
    expect(SRC, '★ sending 未随 return 暴露').toMatch(/send,\s*sending,/);
  });

  it('行为语义：同步重入只放行一次（复刻锁逻辑）', async () => {
    let sending = false;
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    async function send() {
      if (sending) return;
      sending = true;
      try { calls++; await gate; } finally { sending = false; }
    }
    const p1 = send();
    const p2 = send(); // 同步重入：应被挡下
    const p3 = send();
    release();
    await Promise.all([p1, p2, p3]);
    expect(calls, '★ 同步连发被放行了多次 —— 正是"同秒 11 条重复消息"的成因').toBe(1);
  });
});