/**
 * 窗口声明可辨识（D7，2026-10-10）守门测试。
 *
 * ★ 背景（我的原描述**不准确**，已按核实结果修正）：
 *   我原先写"`n === 1M → 退 32K` 是**误判**（真 1M 用户被误算）"。
 *   核实后：`resolveContextWindow` 的注释**明确论证过**这是"误判成本不对称"的**有意设计**
 *   （判错只是压得早，判对避免 400）—— 所以**不是疏忽**，判据**不改**。
 *
 * ★ 但真凶在**另一个地方**（实测）：
 *   `PlatformDetail.vue` 新增模型表单**默认预填 `contextWindowK: 1024`（=1M）**
 *   ⇒ "用户没填"与"真 1M"在数据层**完全同形**（都是 1048576）
 *   ⇒ 实测生产库 **561 个模型全是 1048576**（含 `glm-5.3-prime`、`deepseek-v4.1-flash`
 *     等**确实 1M** 的模型）⇒ **全部被按 32K 估算**（不是"极少数误判"，是普遍过度保守）。
 *
 * ★ 修法：新增时**留空**（→ 提交 `null`），后端**保留 `null`**（不 `||` 兜成 1M）
 *   ⇒ "未声明"（NULL）与"真 1M"（1048576）可区分，两边判据都恢复准确。
 *   ★ **不改** `resolveContextWindow` 的判据本体（它服务的 sentinel 语义被
 *     `effectiveWindowOf` 依赖，改了会**破坏两层折扣的分工**）。
 *
 * 本测试钉：
 *   ① 前端新增表单**不得**预填 1M；
 *   ② 前端提交时留空 → `null`（不是 `|| 1024` 兜回 1M）；
 *   ③ 后端 **保留 null**（`|| DEFAULT_CONTEXT_WINDOW` 会把它兜回去，使① ② 白做）；
 *   ④ `resolveContextWindow` 的判据**不动**（防有人"顺手"改坏 sentinel 语义）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const PAGE = read('packages/ui/src/views/PlatformDetail.vue');
const ROUTE = read('apps/server/src/routes/platforms.ts');
const CONSTS = read('apps/server/src/constants.ts');

describe('① 前端新增表单不得预填 1M', () => {
  it('★★★ 表单初始值必须留空（不是 1024）', () => {
    const i = PAGE.indexOf('const form = ref({');
    expect(i, '★ 锚点缺失：form 初始值').toBeGreaterThan(-1);
    const body = PAGE.slice(i, i + 500);
    // 剥注释后看：contextWindowK 的初始值不得是 1024
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, '★ 新增表单仍预填 1024K(=1M) → "没填"与"真 1M"在数据层同形').not.toMatch(/contextWindowK:\s*1024/);
  });

  it('★★★ 提交时必须"留空 → null"（不得 || 兜回 1M）', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, '★ 提交时仍 `|| 1024` 兜回 1M → 留空失效').not.toMatch(/contextWindowK \|\| 1024/);
    expect(code, '★ 未按"有值才乘 1024、否则 null"提交').toMatch(/contextWindowK \? form\.value\.contextWindowK \* 1024 : null/);
  });
});

describe('② 后端必须保留 null（否则前端改动白做）', () => {
  it('★★★ 不得再用 `|| DEFAULT_CONTEXT_WINDOW` 兜底', () => {
    const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, '★ 后端把 null 兜成 1M → 前端"留空"完全失效（两处必须都改）')
      .not.toMatch(/contextWindow \|\| DEFAULT_CONTEXT_WINDOW/);
  });

  it('★★★ 必须显式保留 null（两个写入路径都要）', () => {
    const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const n = (code.match(/contextWindow === null \|\| .*contextWindow === undefined\) \? null :/g) || []).length;
    expect(n, `★ 只改了 ${n} 处（应 ≥2：单模型 INSERT + 批量导入）→ 另一条路径仍会把 null 兜成 1M`)
      .toBeGreaterThanOrEqual(2);
  });

  it('★★ schema 必须允许 NULL（否则存 null 会失败）', () => {
    const DB = read('apps/server/src/db.ts');
    const i = DB.indexOf('CREATE TABLE IF NOT EXISTS model (');
    const body = DB.slice(i, i + 700);
    expect(body, '★ context_window 变成了 NOT NULL → 存 null 会报错').not.toMatch(/context_window INTEGER.*NOT NULL/);
  });
});

describe('③ 判据本身不得动（防"顺手"改坏 sentinel 语义）', () => {
  it('★★★ resolveContextWindow 必须仍按"恰好等于默认值"判不可信', () => {
    const i = CONSTS.indexOf('export function resolveContextWindow');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = CONSTS.slice(i, i + 400);
    expect(body, '★ 判据被改了 —— 它服务的 sentinel 语义被 effectiveWindowOf 依赖（改了会破坏两层折扣分工）')
      .toMatch(/n === DEFAULT_CONTEXT_WINDOW\) return SAFE_CONTEXT_WINDOW/);
  });

  it('★★ effectiveWindowOf 的 sentinel 依赖仍在（配套约束）', () => {
    const CV = read('apps/server/src/services/context-view.ts');
    expect(CV, '★ effectiveWindowOf 不再依赖 SAFE sentinel → 两层折扣可能被叠加（双重保守）')
      .toMatch(/declared === SAFE_CONTEXT_WINDOW \? declared/);
  });

  it('★★ 前端同值常量不得被单独改动（两处必须同值）', () => {
    const UI_CW = read('packages/ui/src/utils/context-window.ts');
    expect(UI_CW, '★ 前端 DEFAULT_CONTEXT_WINDOW 被改（与后端必须同值）').toMatch(/DEFAULT_CONTEXT_WINDOW = 1048576/);
    expect(CONSTS, '★ 后端 DEFAULT_CONTEXT_WINDOW 与前端不一致').toMatch(/DEFAULT_CONTEXT_WINDOW = 1048576/);
  });
});