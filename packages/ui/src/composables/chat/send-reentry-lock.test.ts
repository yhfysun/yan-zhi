/**
 * 发送重入锁守门测试（2026-10-09，P0 实据修复；2026-10-11 追加入队提前）。
 *
 * 背景：`useChat.send()` 取走内容后要跨多个 `await`（建空间/建会话/落附件），
 *   期间 `input.value` 未清空 → 连发/连按 Enter 会**并发进入多次** → 同一句话落库多条。
 *   实测铁证：生产库同一秒写进 **11 条一模一样的 user 消息**。
 *
 * ★ 2026-10-11 新增契约：任务运行中的「追加入队」判断必须在重入锁**之前** ——
 *   因为正常路径 sendInner 尾部 `await store.sendMessage` 等**整个任务 SSE 流结束**，
 *   锁会覆盖整个任务时长；入队若在锁后，任务运行中点发送会被锁**静默吞掉**
 *   （用户实报「追加功能失效、输入框残留原文」的直接根因）。
 *   入队分支零 await（同步判断+入队+清输入框），提前不破坏防连发语义。
 *
 * 本测试钉住结构契约（composable 依赖太重，不适合整体挂载）：
 *   ① 存在 sending 锁，且在**任何 await 之前**置位、在 finally 释放；
 *   ② 锁已随 return 暴露，供 UI 置灰发送键；
 *   ③ 入队判断在锁之前。
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
    // send() 里先判后置位（窗口放宽到 2600：入队块在前）
    const i = SRC.indexOf('async function send()');
    expect(i, '★ 找不到 send()').toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 2600);
    expect(body, '★ send() 未做重入判断').toMatch(/if\s*\(\s*sending\.value\s*\)\s*return/);
    expect(body, '★ send() 未置位重入锁').toMatch(/sending\.value\s*=\s*true/);
    expect(body, '★ send() 未在 finally 释放锁（异常后永久卡死发送）').toMatch(/finally\s*\{[\s\S]*?sending\.value\s*=\s*false/);
  });

  it('★ 源码层：锁随 return 暴露（UI 据此置灰发送键）', () => {
    expect(SRC, '★ sending 未随 return 暴露').toMatch(/send,\s*sending,/);
  });

  it('★★★ 源码层：任务运行中入队判断必须在重入锁之前（否则整个任务时长内点发送被锁吞）', () => {
    const i = SRC.indexOf('async function send()');
    const body = SRC.slice(i, i + 2600);
    const enqueueAt = body.search(/store\.isConvStreaming\(runningConvEarly\)/);
    const lockAt = body.search(/if\s*\(\s*sending\.value\s*\)\s*return/);
    expect(enqueueAt, '★ send() 里找不到运行中入队判断（runningConvEarly 分支）').toBeGreaterThan(-1);
    expect(lockAt, '★ send() 里找不到重入锁判断').toBeGreaterThan(-1);
    expect(enqueueAt, '★ 入队判断必须排在重入锁之前（锁覆盖整个任务 SSE 时长）').toBeLessThan(lockAt);
    // 入队块自身零 await（同步完成判断+入队+清输入框）。窗口从入队判断行起（避开前置注释），
    // 到锁为止；同时剥掉行注释（// ...）再查，防止文案里的 "await" 干扰。
    const enqueueSeg = body.slice(enqueueAt, lockAt)
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(enqueueSeg, '★ 入队判断到锁之间出现 await —— 会被网络/落盘拖住').not.toMatch(/\bawait\b/);
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