/**
 * 会话删除时的**关联状态清理** —— 静态链路守卫（2026-10-03 建，2026-10-16 随
 * 「归档 + 回收站」改造更新到新收口）。
 *
 * ★ 为什么单独钉这条：
 *   本仓库已经**反复**踩同一类坑 ——「新增了带 conversation_id 的状态，却没在删除路径上一起收」：
 *     · `message_summary`（2026-10-02 压缩落库新增）：会话删了摘要行还留着 = 孤儿数据，
 *       且同一个 conversation_id 若被复用，下条会话会读到上条的前文摘要（串味）；
 *     · `path-guard` 的会话级越界授权白名单（2026-10-01 新增）：纯内存 Map，不删只是泄漏一小块；
 *     · `task_plan_item`（2026-10-08）：同上，漏了会被 get_plan_status 读到旧计划。
 *   三者都**不报错**，只在长跑/删会话后慢慢体现 —— 属静态型缺陷，必须用断言钉住。
 *
 * ★ 2026-10-16 收口变更：清理清单从「每个删除点各写一遍」上移到
 *   `services/conversation-lifecycle.ts: hardDeleteRow()` 唯一出口。
 *   本测试随之改为断言：
 *     ① 各删除点**都不再手写** DELETE FROM conversation（散写必漏）；
 *     ② 唯一出口 hardDeleteRow 内部清单完整（message / summary / 授权 / task_plan_item）；
 *     ③ 出口里被调的符号都真实存在且已导出（防"写了调用但符号拼错 = 静默不执行"）。
 *   行为级覆盖见同目录 conversation-lifecycle.test.ts（真删后消息/计划项确实为 0）。
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

const LIFE = stripComments(read('services/conversation-lifecycle.ts'));

describe('会话删除 · 关联状态清理（防"新增状态漏接线"复发）', () => {
  it('★ 各删除点都不再手写 DELETE FROM conversation（收口到唯一出口）', () => {
    // 历史上 4 处各自手写（conversations.ts /clear + /:id、clip.ts、mcp/api-tool-executor.ts），
    // 每处清理清单都不全。现在只允许 lifecycle service 里出现。
    // ★ 正则必须锚 `conversation WHERE`：`conversation_file` 是另一张表（删单个文件），
    //   用宽松前缀会把它一起判红（2026-10-16 实测踩到）。
    for (const f of ['routes/conversations.ts', 'routes/clip.ts', 'mcp/api-tool-executor.ts']) {
      const body = stripComments(read(f));
      expect(body, `${f} 里又出现了手写 DELETE FROM conversation —— 请改走 hardDeleteRow()`)
        .not.toMatch(/DELETE\s+FROM\s+conversation\s+WHERE/i);
    }
  });

  it('唯一出口 hardDeleteRow 内部清单完整（message/summary/授权/计划项/会话行）', () => {
    const start = LIFE.indexOf('export function hardDeleteRow(');
    expect(start, '找不到 hardDeleteRow').toBeGreaterThan(-1);
    const next = LIFE.indexOf('\nexport function', start + 1);
    const body = LIFE.slice(start, next > 0 ? next : undefined);

    expect(body).toMatch(/DELETE FROM message/);
    expect(body).toMatch(/clearMessageSummaries\(/);
    expect(body).toMatch(/clearAuthorization\(/);
    expect(body).toMatch(/DELETE FROM task_plan_item/);
    expect(body).toMatch(/DELETE FROM conversation/);
    // 顺序：会话行必须是**最后**删的（之前还要拿 cid 做关联清理）
    expect(body.indexOf('DELETE FROM message')).toBeLessThan(body.indexOf('DELETE FROM conversation'));
  });

  it('出口里被调的三个清理符号都真实导出（防"名字拼错 = 静默不会执行"）', () => {
    expect(stripComments(read('db.ts'))).toMatch(/export function clearMessageSummaries\(/);
    expect(stripComments(read('services/path-guard.ts'))).toMatch(/export function clearAuthorization\(/);
    // hardDeleteRow 自己必须导出，否则调用点拿不到唯一出口
    expect(LIFE).toMatch(/export function hardDeleteRow\(/);
  });

  it('路由与工具的删除都改走 lifecycle 出口（而不是各写一套）', () => {
    const conv = stripComments(read('routes/conversations.ts'));
    expect(conv, 'DELETE /:id 未走 softDeleteRow/hardDeleteRow').toMatch(/softDeleteRow\(|hardDeleteRow\(/);
    expect(stripComments(read('routes/clip.ts'))).toMatch(/hardDeleteRow\(/);
    expect(stripComments(read('mcp/api-tool-executor.ts'))).toMatch(/softDeleteRow\(/);
  });
});
