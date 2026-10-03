/**
 * 会话删除时的**关联状态清理** —— 静态链路守卫（2026-10-03）。
 *
 * ★ 为什么单独钉这条：
 *   本仓库已经**反复**踩同一类坑 ——「新增了带 conversation_id 的状态，却没在删除路径上一起收」：
 *     · `message_summary`（2026-10-02 压缩落库新增）：会话删了摘要行还留着 = 孤儿数据，
 *       且同一个 conversation_id 若被复用，下条会话会读到上条的前文摘要（串味）；
 *     · `path-guard` 的会话级越界授权白名单（2026-10-01 新增）：纯内存 Map，不删只是泄漏一小块
 *       （key 是 conversationId，不会串权），但属"写了 export 从来没人调"的死接线。
 *   两者都**不报错**，只在长跑/删会话后慢慢体现 —— 属静态型缺陷，必须用断言钉住。
 *
 * ★ 手法：读源码断言（与 media-fetch-tools / tool-permission 的守门测试同一套路）。
 *   删除路由本身是 3 行，写集成测试要拉起 express + 鉴权 + sqlite，收益不成正比；
 *   这里守的是**「接线没被后人顺手删掉」**这个真实回归面。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..', 'src');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

/** 剥掉行注释与块注释（断源码前必做：注释撞词会假红/假绿） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('会话删除 · 关联状态清理（防"新增状态漏接线"复发）', () => {
  const CONV = stripComments(read('routes/conversations.ts'));

  it('DELETE /:id 里同时清了压缩摘要与越界授权白名单', () => {
    const start = CONV.indexOf("router.delete('/:id'");
    expect(start, '找不到 DELETE /:id 路由').toBeGreaterThan(-1);
    // ★ 切到**下一个 router.** 前（不要用 indexOf('});')：路由内部的
    //   `res.status(404).json({ … });` 也含 `});`，会提前截断 body 导致假红）。
    const nextRouter = CONV.indexOf('\nrouter.', start + 1);
    const body = CONV.slice(start, nextRouter > 0 ? nextRouter : undefined);

    // ① 压缩摘要（message_summary 是 message 的派生物，必须随会话一起清）
    expect(body, 'DELETE 未清 message_summary（孤儿摘要 + 复用 conversation_id 会串味）')
      .toMatch(/clearMessageSummaries\(/);
    // ② 越界授权白名单（path-guard 的会话级内存状态）
    expect(body, 'DELETE 未清 path-guard 会话授权（内存泄漏 + 授权残留）')
      .toMatch(/clearAuthorization\(/);
    // ③ 顺序：清理必须在删 conversation 行**之前**（之后再拿 cid 做任何关联清理都无意义）
    const delConv = body.indexOf('DELETE FROM conversation');
    expect(body.indexOf('clearMessageSummaries(')).toBeLessThan(delConv);
  });

  it('两个清理函数都确实被 import（否则是"写了调用但没有符号"）', () => {
    expect(CONV).toMatch(/import\s*\{[^}]*clearAuthorization[^}]*\}\s*from\s*'\.\.\/services\/path-guard\.js'/);
    expect(CONV).toMatch(/import\s*\{[^}]*clearMessageSummaries[^}]*\}\s*from\s*'\.\.\/db\.js'/);
  });

  it('两个被调函数都真实导出（防"名字拼错 = 静默不会执行"）', () => {
    expect(stripComments(read('services/path-guard.ts'))).toMatch(/export function clearAuthorization\(/);
    expect(stripComments(read('db.ts'))).toMatch(/export function clearMessageSummaries\(/);
  });
});