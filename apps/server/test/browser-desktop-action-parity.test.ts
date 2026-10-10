/**
 * 桌面端浏览器 action 能力清单一致性（B5，2026-10-10）守门测试。
 *
 * 背景（实测缺口）：主进程 action 分发是 `switch`（无法枚举），而渲染层 `chat.ts` 的
 *   `actionMap` 是**另一份硬编码清单** ⇒ 两份必然失同步：
 *   实测主进程已实现 **40 个 action**，`actionMap` 只映射 27 个 →
 *   11 个**明明已实现**的能力落到兜底、报「桌面端暂不支持 XX」（**能力在、入口断**）。
 *
 * 修法：主进程新增 `DESKTOP_BROWSER_ACTIONS`（**单一真相源**）+ `browserView:actions` IPC；
 *   渲染层优先用清单推导（`browser_xxx` → `xxx`），`actionMap` 退为兜底。
 *
 * 本测试钉：
 *   ① 清单与 `switch` 的 case **逐项一致**（漏一处即红 —— 这是防漂移的核心）；
 *   ② IPC + preload 暴露齐备（少了任一段，渲染层拿不到清单 → 退回会漂移的硬编码）；
 *   ③ 渲染层必须**优先用清单推导**（而不是只用 actionMap）；
 *   ④ `actionMap` 的值必须是清单的子集（不许出现"主进程没有"的映射）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const MAIN = read('apps/desktop/main.cjs');
const PRELOAD = read('apps/desktop/preload.cjs');
const CHAT = read('packages/ui/src/stores/chat.ts');

/** 从主进程的 `switch (action)` 里抽出全部一级 case 名 */
function switchCases(): string[] {
  // 只取 `browserView:action` 那个 handler 内的一级 switch（缩进 6 空格的 case）
  const start = MAIN.indexOf("ipcMain.handle('browserView:action'");
  expect(start, '★ 锚点缺失：action handler').toBeGreaterThan(-1);
  const seg = MAIN.slice(start);
  const cases = new Set<string>();
  // 一级 case：6 空格缩进；fall-through 形如 `case 'next_page':` 后面直接跟下一个 case
  const re = /^ {6}case '([a-z_]+)':/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) cases.add(m[1]);
  return Array.from(cases).sort();
}

/** 从主进程抽出 DESKTOP_BROWSER_ACTIONS 数组 */
function declaredActions(): string[] {
  const i = MAIN.indexOf('const DESKTOP_BROWSER_ACTIONS = [');
  expect(i, '★ 锚点缺失：DESKTOP_BROWSER_ACTIONS').toBeGreaterThan(-1);
  const end = MAIN.indexOf('];', i);
  const body = MAIN.slice(i, end);
  return (body.match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')).sort();
}

describe('① 清单 vs switch case 必须逐项一致（防漂移核心）', () => {
  it('★★★ 两者集合完全相同', () => {
    const declared = declaredActions();
    const cases = switchCases();
    expect(cases.length, '★ switch case 数变了（需复核解析）').toBeGreaterThan(30);
    const missingInDecl = cases.filter((c) => !declared.includes(c));
    const missingInSwitch = declared.filter((c) => !cases.includes(c));
    expect(missingInDecl, `★ 这些 case 没进能力清单 → 渲染层无从得知（能力在、入口断）：${missingInDecl.join(', ')}`)
      .toEqual([]);
    expect(missingInSwitch, `★ 清单里有但 switch 没实现（会报"暂不支持"）：${missingInSwitch.join(', ')}`)
      .toEqual([]);
  });

  it('★★ 清单必须无重复项', () => {
    const d = declaredActions();
    expect(new Set(d).size, '★ 清单里有重复项').toBe(d.length);
  });
});

describe('② IPC + preload 暴露齐备', () => {
  it('★★★ 主进程必须注册 browserView:actions', () => {
    expect(MAIN, '★ 未注册 IPC → 渲染层拿不到清单').toMatch(/ipcMain\.handle\('browserView:actions'/);
  });

  it('★★★ preload 必须暴露 browserView.actions', () => {
    expect(PRELOAD, '★ preload 未暴露 → 渲染层仍看不到清单').toMatch(/actions:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('browserView:actions'\)/);
  });
});

describe('③ 渲染层必须优先用清单推导', () => {
  it('★★★ 必须有"按清单推导"的逻辑（而非只用 actionMap）', () => {
    expect(CHAT, '★ 渲染层未用主进程清单推导 → 两份硬编码仍会漂移').toMatch(/browserView\?\.actions\?\.\(\)/);
    expect(CHAT, '★ 未按 `browser_` 前缀推导 action 名').toMatch(/slice\('browser_'\.length\)/);
  });

  it('★★ 必须有"清单里包含才采用"的判定（不能盲推）', () => {
    expect(CHAT, '★ 未校验推导出的 action 是否真被支持 → 会调用主进程没有的 action')
      .toMatch(/supported\.includes\(derived\)/);
  });

  it('★★ 拿不到清单时必须退回 actionMap（不破坏既有行为）', () => {
    expect(CHAT, '★ 未保留 actionMap 兜底（非桌面端/旧 preload 会全挂）').toMatch(/let action = actionMap\[fullName\]/);
  });
});

describe('④ actionMap 的值必须是清单的子集', () => {
  it('★★★ 不许出现"主进程没有"的映射', () => {
    const declared = declaredActions();
    const i = CHAT.indexOf('const actionMap: Record<string, string> = {');
    expect(i, '★ 锚点缺失：actionMap').toBeGreaterThan(-1);
    const end = CHAT.indexOf('};', i);
    const body = CHAT.slice(i, end);
    const values = (body.match(/:\s*'([a-z_]+)'/g) || []).map((s) => s.replace(/:\s*'/, '').replace(/'$/, ''));
    expect(values.length, '★ actionMap 解析失败').toBeGreaterThan(20);
    const bad = values.filter((v) => !declared.includes(v));
    expect(bad, `★ 这些映射主进程没实现（会报"暂不支持"）：${bad.join(', ')}`).toEqual([]);
  });
});