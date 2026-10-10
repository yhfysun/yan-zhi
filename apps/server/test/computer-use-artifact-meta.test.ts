/**
 * computer-use 截图产物登记（C5 的 _meta 部分，2026-10-10）守门测试。
 *
 * 背景（实测缺陷）：`textResult(data)` 此前**只产 `content`、从不产 `_meta`** ——
 *   于是走通用钩子 `artifact:meta_path`（`artifact-hooks.ts:60`，读 `ctx.meta.path`）时
 *   **登记不进 `conversation_file`** ⇒ **文件管理里永远看不到截图**（静默、不报错）。
 *
 * 修法：`textResult` 新增可选 `meta`（**一处扩展覆盖本文件 17 处调用**），
 *   并在 `computer_screenshot` 的**全部三个返回分支**传入 `_meta`。
 *
 * 本测试钉：
 *   ① `textResult` 支持 `_meta`；
 *   ② `computer_screenshot` **三个返回分支全覆盖**（按窗口 / MAC 全屏 / Windows 全屏）——
 *      ★ 漏任一个都会让"那条路径的截图"在文件管理里看不到（本次就差点漏掉 Windows 全屏那条）；
 *   ③ `_meta.path` 必须取 `keptTo || file`（有工作目录副本时登记副本，否则临时区）；
 *   ④ `category` 必须是 `intermediate`（截图是中间产物，不是交付物）；
 *   ⑤ 与钩子期望的字段名**逐字一致**（`path`/`name`/`category`）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const CU = read('apps/server/src/plugins/computer-use.ts');
const HOOKS = read('apps/server/src/services/artifact-hooks.ts');

describe('① textResult 支持 _meta', () => {
  it('★★★ 必须接受可选 meta 并在有值时产出 _meta', () => {
    const i = CU.indexOf('function textResult(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = CU.slice(i, i + 700);
    expect(body, '★ textResult 未接受 meta 参数').toMatch(/meta\?:\s*Record<string,\s*unknown>/);
    expect(body, '★ 未产出 _meta（有 meta 时必须带上）').toMatch(/_meta:\s*meta/);
  });

  it('★★ 无 meta 时不得产出 _meta（避免空对象污染下游）', () => {
    const i = CU.indexOf('function textResult(');
    const body = CU.slice(i, i + 700);
    expect(body, '★ 无条件产出 _meta（应仅在有值时）').toMatch(/\.\.\.\s*\(meta\s*\?\s*\{/);
  });
});

describe('② computer_screenshot 三个返回分支全覆盖', () => {
  /** 取 computer_screenshot 的注册块（到下一个 ctx.registerTool 为止） */
  function screenshotBlock(): string {
    const i = CU.indexOf("name: 'computer_screenshot'");
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const next = CU.indexOf('ctx.registerTool({', i);
    return next > 0 ? CU.slice(i, next) : CU.slice(i, i + 12000);
  }

  it('★★★ 全部返回路径都必须最终带上 _meta', () => {
    const blk = screenshotBlock();
    // ★ 实测结构（4 个 return，3 个"终点"）：
    //   · `return done({...})` ×2 → 走 `done()`，而 `done` 定义里已带 _meta（1 处）
    //   · `return textResult({...})` ×2 → MAC 全屏、Windows 全屏（各带 _meta）
    //   ⇒ _meta 出现处数应为 **3**（done 定义 1 + textResult 两个分支 2），
    //     恰好覆盖全部 4 条 return 路径。
    const returnDone = (blk.match(/return done\(\{/g) || []).length;
    const returnText = (blk.match(/return textResult\(\{/g) || []).length;
    const doneDef = (blk.match(/=> textResult\(\{/g) || []).length;
    const metas = (blk.match(/category:\s*'intermediate'/g) || []).length;
    expect(doneDef, '★ `done` 定义缺失（winKey 分支的两条 return 就没有 _meta 了）').toBe(1);
    expect(returnDone, '★ return done 数变了').toBe(2);
    expect(returnText, '★ return textResult 数变了（MAC/Windows 两条）').toBe(2);
    // _meta 覆盖：done 定义 1 处（覆盖那 2 条 return done）+ 2 条 return textResult 各 1 处
    expect(metas, `★ _meta 覆盖不足（${metas}）→ 有返回路径的截图登记不进文件管理`).toBe(1 + returnText);
  });

  it('★★★ Windows 全屏分支（最后一个 return）必须带 _meta', () => {
    // ★ 这条是**本次真实踩到的遗漏**：MAC 分支与 winKey 分支都加了，
    //   Windows 全屏那条（`return textResult({ file, screenshotUrl, offsetX: Number(ox) ...`）差点漏掉。
    const blk = screenshotBlock();
    const i = blk.lastIndexOf('return textResult({');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const tail = blk.slice(i, i + 1200);
    expect(tail, '★ Windows 全屏分支未带 _meta → 那条路径的截图登记不进文件管理')
      .toMatch(/category:\s*'intermediate'/);
  });

  it('★★★ _meta.path 必须取 keptTo || file（有工作目录副本时登记副本）', () => {
    const blk = screenshotBlock();
    const metas = blk.match(/\{\s*path:\s*keptTo\s*\|\|\s*file/g) || [];
    expect(metas.length, '★ path 未优先取 keptTo（有工作目录副本时会登记临时区路径 → 30 分钟后失效）')
      .toBeGreaterThanOrEqual(3);
  });

  it('★★ category 必须是 intermediate（截图是中间产物）', () => {
    const blk = screenshotBlock();
    expect(blk, '★ category 不是 intermediate').toMatch(/category:\s*'intermediate'/);
    expect(blk, '★ category 写成了 deliverable（截图不是交付物）').not.toMatch(/category:\s*'deliverable'/);
  });
});

describe('③ 与钩子字段名逐字一致（否则静默不登记）', () => {
  it('★★★ 钩子读 ctx.meta 的 path/name/category/bytes', () => {
    const i = HOOKS.indexOf("registerAfterToolHook('artifact:meta_path'");
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = HOOKS.slice(i, i + 900);
    expect(body, '★ 钩子读了 path').toMatch(/m\?\.path/);
    expect(body, '★ 钩子读了 category').toMatch(/m\?\.category/);
  });

  it('★★ computer-use 的 _meta 必须提供 path 与 name（钩子会用 name 作文件名）', () => {
    const blk = (() => {
      const i = CU.indexOf("name: 'computer_screenshot'");
      const next = CU.indexOf('ctx.registerTool({', i);
      return CU.slice(i, next > 0 ? next : i + 12000);
    })();
    expect(blk, '★ _meta 缺 name（钩子会退化成用路径尾名，通常也可，但显式更稳）')
      .toMatch(/name:\s*path\.basename\(keptTo\s*\|\|\s*file\)/);
  });
});