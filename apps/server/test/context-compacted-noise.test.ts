/**
 * 「已压缩历史上下文 · 0 条」刷屏回归（2026-10-26 用户实报：「这个怎么一直出来啊」）。
 *
 * 现场：任务跑一步，聊天区就多一行「已压缩历史上下文 · 0 条 → 摘要（当前 399 条）」，
 *   连续十几条，且 coveredCount 恒为 0（说明摘要**一次都没真压**）。
 *
 * 根因：`buildContextView` 里 ③ 的两道**每步常态归一化**（enforceBudget / enforceMessageCount）
 *   也把 `compacted` 置真。compress 被 tool 配对挡回时每轮都会走到它们 ⇒ 每步上报一次
 *   `context:compacted`（coveredCount=0）⇒ 前端每步插一条"已压缩"标记。
 *
 * 判据：`compacted` 只代表「摘要覆盖段真的增长了」。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const SRC = readFileSync(resolve(REPO, 'apps/server/src/services/context-view.ts'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('压缩事件不得由每步归一化产生', () => {
  it('★ compacted 只随摘要覆盖段增长', () => {
    expect(CODE, '★ 未按覆盖段增长判定 → 压缩被挡回时每步都上报一次')
      .toMatch(/mergedCovered\.length\s*>\s*covered\.length/);
  });

  it('★ enforceBudget / enforceMessageCount 之后不得再置 compacted', () => {
    const at = CODE.indexOf('enforceBudget(payload');
    expect(at, '缺少 enforceBudget 调用').toBeGreaterThanOrEqual(0);
    const tail = CODE.slice(at);
    expect(tail, '★ 硬降/条数闸门仍在置 compacted → 聊天区会被「已压缩 0 条」刷屏')
      .not.toMatch(/compacted\s*=\s*true/);
  });
});
