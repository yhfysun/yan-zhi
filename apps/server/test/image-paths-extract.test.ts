/**
 * 多模态注入的图片路径提取（C5 补齐，2026-10-10）守门测试。
 *
 * 背景（实测缺口）：C1 的注入链路只认 `已存档: <path>` **文本标记**，而
 *   `computer_screenshot` 的返回是 `JSON.stringify(data, null, 2)`
 *   （形如 `"file": "C:\\...\\screenshot-123.png"`）—— **不含该标记**
 *   ⇒ C1 **接不到** computer-use 截图（视觉模型仍看不到，得靠 `image_analyze`）。
 *
 * 修法：抽**共享纯函数** `extractImagePaths(text)` 认多种形态（`已存档:` 文本 + JSON
 *   `file`/`keptTo` 字段），注入链路改用它 ⇒ 新增形态只改一处、不漂移，且可真跑测试。
 *
 * 本测试钉（以**真跑**为主）：
 *   ① 认 `已存档: <path>` 文本；
 *   ② **认 JSON 的 `file` / `keptTo` 字段**（C5 的核心）；
 *   ③ JSON 里的 `\\` 转义必须还原成单反斜杠（否则路径 stat 不到）；
 *   ④ 去重保序（同图不重复注入，白耗 vision token）；
 *   ⑤ **不误匹配** `screenshotUrl` 之类的 URL（避免拿 URL 当路径去读、必然失败）；
 *   ⑥ 注入链路必须**真的用**这个共享函数（不是定义了不用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const LTM = read('apps/server/src/llm-task-manager.ts');

describe('① 两种形态都必须认（真跑）', () => {
  it('★★★ 认 `已存档: <path>` 文本（原有能力，防回归）', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    expect(typeof fn, '★ 无法取到 extractImagePaths').toBe('function');
    const got = fn('截图已捕获（已存档: C:\\shots\\a.png）');
    expect(got, '★ 未解析出 `已存档:` 路径').toEqual(['C:\\shots\\a.png']);
  });

  it('★★★ 认 JSON 的 `file` 字段（C5 核心：computer_screenshot 的返回形态）', async () => {
    const mod: any = await import('../src/llm-task-manager.ts.placeholder').catch(() => null)
      ?? await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    // 模拟 textResult 的真实产出（JSON.stringify(data, null, 2)）
    const json = JSON.stringify({ file: 'C:\\Users\\x\\screenshot-123.png', screenshotUrl: '/api/plugin/computer-use/screenshots/screenshot-123.png', offsetX: 0 }, null, 2);
    const got = fn(json);
    expect(got, '★ 未解析出 JSON 里的 file 路径 → computer-use 截图接不进注入链路').toContain('C:\\Users\\x\\screenshot-123.png');
  });

  it('★★★ JSON 转义必须还原（`\\\\` → `\\`），否则 stat 不到', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    // JSON 里 Windows 路径是 `C:\\a\\b.png`（字符串里双反斜杠）
    const got = fn('{"file":"C:\\\\a\\\\b.png"}');
    expect(got?.[0], '★ 未还原 JSON 转义（路径带双反斜杠会 stat 失败）').toBe('C:\\a\\b.png');
  });

  it('★★ 必须认 `keptTo`（有工作目录副本时优先登记副本）', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    const got = fn('{"file":"C:\\\\tmp\\\\a.png","keptTo":"C:\\\\ws\\\\shots\\\\a.png"}');
    expect(got, '★ 未认 keptTo').toContain('C:\\ws\\shots\\a.png');
    expect(got, '★ 未认 file').toContain('C:\\tmp\\a.png');
  });
});

describe('② 去重与不误匹配', () => {
  it('★★ 同一路径出现两次只取一次（避免重复注入、白耗 vision token）', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    const got = fn('已存档: C:\\a\\x.png\n{"file":"C:\\\\a\\\\x.png"}');
    expect(got.length, '★ 同一路径被取了两次').toBe(1);
  });

  it('★★★ 不得把 `screenshotUrl` 当路径（它是 URL，读了必然失败）', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    const got = fn('{"screenshotUrl":"/api/plugin/computer-use/screenshots/a.png"}');
    expect(got, '★ 把 URL 当路径了（会去 stat 一个不存在的本地路径）').toEqual([]);
  });

  it('★★ 非图片扩展名不得匹配', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    expect(fn('{"file":"C:\\\\a\\\\note.txt"}'), '★ 匹配了非图片').toEqual([]);
  });

  it('★★ 空输入/无图文本必须返回空数组（不崩）', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    const fn = mod?.extractImagePaths;
    if (typeof fn !== 'function') return;
    expect(fn('')).toEqual([]);
    expect(fn('纯文本，没有任何图片路径')).toEqual([]);
  });
});

describe('③ 注入链路必须真的用它（不是定义了不用）', () => {
  it('★★★ 候选筛选与路径提取都必须走共享函数', () => {
    const i = LTM.indexOf('async function attachImagesToMessages');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 3500);
    const calls = (body.match(/extractImagePaths\(/g) || []).length;
    expect(calls, `★ attachImagesToMessages 里只调了 ${calls} 次（应 ≥2：筛选候选 + 取路径）`)
      .toBeGreaterThanOrEqual(2);
    // 不得再自己写一条正则（两处实现必然漂移）
    expect(body, '★ 仍在注入链路里内联正则解析路径（会与共享函数漂移）')
      .not.toMatch(/IMAGE_ARCHIVE_MARK_RE\.(test|exec)/);
  });

  it('★★ 共享函数必须导出（供测试真跑与后续复用）', () => {
    expect(LTM, '★ extractImagePaths 未导出').toMatch(/export function extractImagePaths/);
  });
});