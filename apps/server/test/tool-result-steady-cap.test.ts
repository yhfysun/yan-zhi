/**
 * 工具结果「常态裁剪」（D4，2026-10-09）守门测试。
 *
 * 背景（实测）：`capLongText` 此前**唯一调用点**在 `compress` 内部 —— 只有超阈值触发压缩时才裁。
 *   低于阈值时，老的大工具输出（python_exec 长 stdout / file_read 长文件 / 长正文）
 *   **全量进上下文**，逐条推高 token、更早撞阈值。
 * ⇒ 提升为**每步常态**（在 `buildContextView` 里无条件做一次），逼近 microcompact。
 *
 * 本测试钉（以行为断言为主 —— 裁剪逻辑静态查字符串证明不了）：
 *   ① 函数存在且被 `buildContextView` 常态调用；
 *   ② **只改 content 长度、不动消息结构**（结构一动就可能破 tool 配对）；
 *   ③ **幂等**（重复裁是 no-op）；
 *   ④ **只裁保留窗口之外**（最近 N 条保原文 —— 否则"刚读到就没了"）；
 *   ⑤ 未超限的不动、非 tool 消息不动、无变化时返回**原引用**。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CV = strip(read('apps/server/src/services/context-view.ts'));
const WIN = strip(read('packages/core/src/compress/window.ts'));

const toolMsg = (id: string, len: number) => ({
  id, conversationId: 'c1', role: 'tool' as const, content: 'x'.repeat(len), createdAt: 0,
});
const asstMsg = (id: string, len = 10) => ({
  id, conversationId: 'c1', role: 'assistant' as const, content: 'y'.repeat(len), createdAt: 0,
});

describe('① 接线：常态裁剪必须存在且被组装出口调用', () => {
  it('★★ 导出 capStaleToolResults', () => {
    expect(WIN, '★ 缺 capStaleToolResults —— 老工具输出仍只会在压缩时才裁')
      .toMatch(/export function capStaleToolResults/);
  });

  it('★★ buildContextView 必须**无条件**调用它（不是只在压缩分支里）', () => {
    expect(CV, '★ 未在组装出口常态裁剪').toMatch(/capStaleToolResults\(/);
    // ★ 必须在 `needsCompression` 判定**之前**（先温和裁剪，可能就不用走有损摘要）
    const i = CV.indexOf('capStaleToolResults(');
    const j = CV.indexOf('needsCompression(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    expect(j, '★ 锚点缺失').toBeGreaterThan(-1);
    expect(i, '★ 常态裁剪放在了压缩之后（那还是"只在压缩时裁"）').toBeLessThan(j);
  });
});

describe('② 行为断言（真跑 —— 裁剪逻辑必须真验）', () => {
  it('★★★ 只裁「保留窗口之外」的老工具结果，最近 N 条保原文', async () => {
    const mod = await import('@yan-zhi/core').catch(() => null);
    const fn = (mod as any)?.capStaleToolResults;
    expect(typeof fn, '★ 无法从 @yan-zhi/core 取到 capStaleToolResults').toBe('function');
    const big = 20_000;
    const msgs = [
      asstMsg('a1'),
      toolMsg('t1', big),   // 老 → 应裁
      asstMsg('a2'),
      toolMsg('t2', big),   // 老 → 应裁
      asstMsg('a3'),
      toolMsg('t3', big),   // 最近（keepRecent=3 内）→ 保原文
      asstMsg('a4'),
    ] as any[];
    const out = fn(msgs, 3) as any[];
    expect(out.length, '★ 消息条数被改变（结构被动过，可能破 tool 配对）').toBe(msgs.length);
    expect(out[1].content.length, '★ 老工具结果未裁剪').toBeLessThan(9 * 1024);
    expect(out[3].content.length, '★ 老工具结果未裁剪').toBeLessThan(9 * 1024);
    expect(out[5].content, '★ 最近一条被裁了（"刚读到就没了"）').toBe(msgs[5].content);
  });

  it('★★ 幂等：重复裁剪是 no-op', async () => {
    const mod = await import('@yan-zhi/core').catch(() => null);
    const fn = (mod as any)?.capStaleToolResults;
    if (typeof fn !== 'function') return;
    const msgs = [toolMsg('t1', 20_000), asstMsg('a1'), asstMsg('a2'), asstMsg('a3')] as any[];
    const once = fn(msgs, 3) as any[];
    const twice = fn(once, 3) as any[];
    expect(twice[0].content, '★ 非幂等（第二次又改了内容）').toBe(once[0].content);
  });

  it('★★ 无变化时返回原引用（避免无谓的响应式/比对开销）', async () => {
    const mod = await import('@yan-zhi/core').catch(() => null);
    const fn = (mod as any)?.capStaleToolResults;
    if (typeof fn !== 'function') return;
    const small = [toolMsg('t1', 100), asstMsg('a1'), asstMsg('a2'), asstMsg('a3')] as any[];
    expect(fn(small, 3), '★ 未超限时返回了新数组（应返回原引用）').toBe(small);
    expect(fn([], 3), '★ 空数组应原样返回').toEqual([]);
  });

  it('★★ 非 tool 消息一律不动（含超长的 assistant 正文）', async () => {
    const mod = await import('@yan-zhi/core').catch(() => null);
    const fn = (mod as any)?.capStaleToolResults;
    if (typeof fn !== 'function') return;
    const msgs = [asstMsg('a1', 20_000), asstMsg('a2'), asstMsg('a3'), asstMsg('a4')] as any[];
    const out = fn(msgs, 2) as any[];
    expect(out[0].content.length, '★ 动了非 tool 消息（assistant 正文不该被裁）').toBe(20_000);
  });

  it('★★ 裁剪必须保留头尾（结论/错误常在末尾）', async () => {
    const mod = await import('@yan-zhi/core').catch(() => null);
    const fn = (mod as any)?.capStaleToolResults;
    if (typeof fn !== 'function') return;
    const text = 'HEAD' + '-'.repeat(20_000) + 'TAIL_ERROR';
    const msgs = [{ ...toolMsg('t1', 0), content: text }, asstMsg('a1'), asstMsg('a2'), asstMsg('a3')] as any[];
    const out = fn(msgs, 3) as any[];
    expect(out[0].content, '★ 未保留头部').toContain('HEAD');
    expect(out[0].content, '★ 未保留尾部（错误/结论在末尾，丢了就不可恢复）').toContain('TAIL_ERROR');
  });
});