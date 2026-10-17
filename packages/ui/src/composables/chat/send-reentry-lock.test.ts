/**
 * 发送重入锁守门测试（2026-10-09，P0 实据修复；2026-10-11 追加入队提前；
 * 2026-10-17 锁粒度改「按会话」）。
 *
 * 背景：`useChat.send()` 取走内容后要跨多个 `await`（建空间/建会话/落附件），
 *   期间 `input.value` 未清空 → 连发/连按 Enter 会**并发进入多次** → 同一句话落库多条。
 *   实测铁证：生产库同一秒写进 **11 条一模一样的 user 消息**。
 *
 * ★ 2026-10-11 契约：任务运行中的「追加入队」判断必须在重入锁**之前** ——
 *   因为正常路径 sendInner 尾部 `await store.sendMessage` 等**整个任务 SSE 流结束**，
 *   锁会覆盖整个任务时长；入队若在锁后，任务运行中点发送会被锁**静默吞掉**
 *   （用户实报「追加功能失效、输入框残留原文」的直接根因）。
 *   入队分支零 await（同步判断+入队+清输入框），提前不破坏防连发语义。
 *
 * ★ 2026-10-17 契约（用户实报「会话 A 跑任务时切到会话 B 回车发不出消息，刷新才好」）：
 *   锁粒度从全局一把改为**按会话 key**（`sendingConvs: Set<convId | '__draft__'>`）。
 *   全局锁覆盖整个任务时长 ⇒ A 跑任务期间 B 的发送在锁处被静默吞掉，与
 *   ChatInputArea onEnter 注释宣称的「切到别的会话则正常发送」矛盾。
 *   锁命中必须给用户可见提示（ElMessage），不得静默 return。
 *
 * 本测试钉住结构契约（composable 依赖太重，不适合整体挂载）：
 *   ① 存在按会话的 sendingConvs 锁，且在**任何 await 之前**置位、在 finally 释放；
 *   ② sending 仍随 return 暴露（语义 = 当前会话是否在发送中），供 UI 消费；
 *   ③ 入队判断在锁之前；
 *   ④ 锁命中带用户可见提示，不静默。
 * 并在测试内**复刻锁的语义**做行为验证（同会话互斥 / 跨会话放行 / 草稿态互斥）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'useChat.ts'), 'utf8');

describe('send() 重入锁', () => {
  it('★ 源码层：send 入口同步置位按会话重入锁，且用 try/finally 释放', () => {
    // 锁声明：按会话粒度（Set）+ 导出语义（当前会话是否在发送中）
    expect(SRC, '★ 缺 sendingConvs 按会话锁声明').toMatch(/const\s+sendingConvs\s*=\s*ref<Set<string>>\(new Set\(\)\)/);
    expect(SRC, '★ sending 未退化为 computed（UI 侧「当前会话是否发送中」语义）')
      .toMatch(/const\s+sending\s*=\s*computed\(\(\)\s*=>\s*sendingConvs\.value\.has\(store\.currentConvId\s*\|\|\s*'__draft__'\)\)/);
    // send() 里先判后置位（窗口放宽到 2600：入队块在前）
    const i = SRC.indexOf('async function send()');
    expect(i, '★ 找不到 send()').toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 2600);
    expect(body, '★ send() 未做重入判断').toMatch(/if\s*\(\s*sendingConvs\.value\.has\(lockKey\)\)\s*\{/);
    expect(body, '★ send() 未置位重入锁').toMatch(/sendingConvs\.value\.add\(lockKey\)/);
    expect(body, '★ send() 未在 finally 释放锁（异常后永久卡死发送）').toMatch(/finally\s*\{[\s\S]*?sendingConvs\.value\.delete\(lockKey\)/);
    // 锁 key 在进入时冻结：sendInner 建会话后 currentConvId 变化不影响锁的归属
    expect(body, '★ lockKey 未在置位前冻结（草稿态建会话后锁会挂错会话）').toMatch(/const\s+lockKey\s*=\s*store\.currentConvId\s*\|\|\s*'__draft__'/);
  });

  it('★ 源码层：锁命中必须给用户可见提示，不得静默 return（用户实报「回车毫无反应」）', () => {
    const i = SRC.indexOf('async function send()');
    const body = SRC.slice(i, i + 2600);
    const lockAt = body.search(/if\s*\(\s*sendingConvs\.value\.has\(lockKey\)\)/);
    const lockBlock = body.slice(lockAt, lockAt + 200);
    expect(lockBlock, '★ 锁命中静默 return —— 用户会以为回车坏了').toMatch(/ElMessage\.warning\(/);
  });

  it('★ 源码层：sending 随 return 暴露（UI 据此消费）', () => {
    expect(SRC, '★ sending 未随 return 暴露').toMatch(/send,\s*sending,/);
  });

  it('★★★ 源码层：任务运行中入队判断必须在重入锁之前（否则整个任务时长内点发送被锁吞）', () => {
    const i = SRC.indexOf('async function send()');
    const body = SRC.slice(i, i + 2600);
    const enqueueAt = body.search(/store\.isConvStreaming\(runningConvEarly\)/);
    const lockAt = body.search(/if\s*\(\s*sendingConvs\.value\.has\(lockKey\)\)/);
    expect(enqueueAt, '★ send() 里找不到运行中入队判断（runningConvEarly 分支）').toBeGreaterThan(-1);
    expect(lockAt, '★ send() 里找不到重入锁判断').toBeGreaterThan(-1);
    expect(enqueueAt, '★ 入队判断必须排在重入锁之前（锁覆盖整个任务 SSE 时长）').toBeLessThan(lockAt);
    // 入队块自身零 await（同步完成判断+入队+清输入框）。窗口从入队判断行起（避开前置注释），
    // 到锁为止；同时剥掉注释再查，防止文案里的 "await" 干扰。
    //
    // ★★★ 2026-10-12 修两个**假失败源**（此前偶然为绿，源码位移后暴露）：
    //   ① **CRLF**：`src` 是工作区文件，行尾是 `\r\n`。`l.replace(/\/\/.*$/, '')` 里
    //      `.` 不匹配 `\r` 且 `$` 无 `m` 标志 ⇒ 含 `\r` 的行**匹配失败、整行不剥**
    //      ⇒ 注释里的 "await" 被当成真代码 ⇒ 假报"入队块有 await"。
    //      ⇒ 先 `replace(/\r\n?/g, '\n')` 统一行尾。
    //   ② **块注释** `/** ... */`：跨多行，逐行剥 `//` 处理不了 ⇒ 一并剥掉块注释。
    const stripped = body.slice(enqueueAt, lockAt)
      .replace(/\r\n?/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(stripped, '★ 入队判断到锁之间出现 await —— 会被网络/落盘拖住').not.toMatch(/\bawait\b/);
  });

  it('行为语义：同一会话同步重入只放行一次（复刻锁逻辑）', async () => {
    const sendingConvs = new Set<string>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let currentConvId = 'conv-A';
    async function send() {
      const lockKey = currentConvId || '__draft__';
      if (sendingConvs.has(lockKey)) return;
      sendingConvs.add(lockKey);
      try { calls++; await gate; } finally { sendingConvs.delete(lockKey); }
    }
    const p1 = send();
    const p2 = send(); // 同步重入（同会话）：应被挡下
    const p3 = send();
    release();
    await Promise.all([p1, p2, p3]);
    expect(calls, '★ 同步连发被放行了多次 —— 正是"同秒 11 条重复消息"的成因').toBe(1);
  });

  it('★★★ 行为语义（2026-10-17 回归主判据）：会话 A 在发送中，切到会话 B 不被锁吞', async () => {
    const sendingConvs = new Set<string>();
    const sent: string[] = [];
    let currentConvId = 'conv-A';
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    async function send() {
      const lockKey = currentConvId || '__draft__';
      if (sendingConvs.has(lockKey)) return;
      sendingConvs.add(lockKey);
      try { sent.push(lockKey); await gate; } finally { sendingConvs.delete(lockKey); }
    }
    const pA = send(); // 会话 A 进入发送（锁覆盖整个任务时长）
    currentConvId = 'conv-B';
    const pB = send(); // 切到会话 B 再发：必须放行（全局锁时代此处被静默吞掉）
    release();
    await Promise.all([pA, pB]);
    expect(sent, '★ 会话 B 的发送被会话 A 的锁吞掉（跨会话互踩回归）').toContain('conv-B');
  });

  it('行为语义：草稿态（currentConvId 为空）连发仍互斥，建会话后锁不漂移', async () => {
    const sendingConvs = new Set<string>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let currentConvId = ''; // 草稿态：sendInner 里才会建会话
    let input = '一句话'; // ★ 真实链路的第二道防线：sendInner 取走内容即清空（任何 await 之前同步完成）
    async function send() {
      const lockKey = currentConvId || '__draft__'; // 进入时冻结
      if (sendingConvs.has(lockKey)) return;
      sendingConvs.add(lockKey);
      try {
        // 复刻 sendInner 头部：同步取走内容（真实代码在 hasModel 判断后、首个 await 前）
        if (!input.trim()) return;
        input = '';
        // 模拟建会话（真实代码在 await createConversation 之后更新 currentConvId）
        currentConvId = 'conv-new';
        calls++;
        await gate;
      } finally { sendingConvs.delete(lockKey); }
    }
    const p1 = send();
    const p2 = send(); // 第一发建会话后 currentConvId 已变：第二发要么撞 '__draft__' 锁、
                       // 要么（锁绕过窗口）撞「input 已空」防线 —— 两道任一兜住，不重复落库
    release();
    await Promise.all([p1, p2]);
    expect(calls, '★ 草稿态连发重复落库').toBe(1);
    expect(sendingConvs.has('__draft__'), '★ finally 未释放草稿锁').toBe(false);
    expect(sendingConvs.has('conv-new'), '★ finally 未释放迁移后的会话锁').toBe(false);
  });
});
