import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 「完全模拟人的操作」—— 浏览器输入链路防回归测试（2026-10-08）。
 *
 * 用户诉求：「评论填写能否完全模拟人的操作？现在应该是有的动作没触发」
 *
 * 根因（实据）：
 *   `typeIn`（JS 实现）是**程序化改值** —— contenteditable 走 `textContent = 值`
 *   → 富文本编辑器（ProseMirror/Slate/Draft.js）内部 model 不同步；
 *   全程无 `keydown`/`keyup`/`composition*` 事件 → 中文 IME、提交拦截、字数统计全失灵。
 *   而 `browser_type` 的工具描述却写着 "Uses real keyboard input (per-character)" —— 与实现不符。
 *
 * 三档修法（A 主 / B 兜底 / C 对齐），本文件逐项钉住。
 * ★ 断言基于真实源码。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const mainSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/desktop/main.cjs'), 'utf8');
const toolSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/core/src/tool/builtin/browser/index.ts'), 'utf8');

/**
 * 从 `startMarker` 起取**整个函数体**（到下一个顶层声明为止）。
 *
 * ★★★ 2026-10-10 修（原实现 `src.slice(i, i + 4000)` 是**固定窗口**，会随函数变长而假红）：
 *   `cdpTypeText` 已长到 **5429 字符**，而 `via:` 在 5002、`dbg.detach()` 在 5382 —— 都掉出 4000 窗口
 *   → 测试报"缺 via 标识 / 未 detach"，但源码里其实都有。**这是测试脆弱，不是代码缺陷。**
 *
 * ★ 实现刻意**不做花括号配对**：函数体里有正则字面量（如 `/^https:\/\//`），其中的 `//`
 *   会被朴素扫描误判成行注释 → 状态机跑偏 → 取不到结尾（本文件实测踩到）。
 *   改为"截到**下一个顶层声明**（`\nasync function` / `\nfunction` / `\nconst xxx = ` 等）之前"：
 *   `main.cjs` 是**扁平**的 CommonJS 脚本，顶层声明都在列首，这个边界稳定且不受内容干扰。
 */
function sliceFrom(src: string, startMarker: string, maxLen = 30000): string {
  const i = src.indexOf(startMarker);
  if (i < 0) return '';
  // 从 marker 的**下一行**开始，找第一个列首的顶层声明
  const afterFirstLine = src.indexOf('\n', i);
  if (afterFirstLine < 0) return src.slice(i, i + maxLen);
  const rest = src.slice(afterFirstLine + 1);
  const m = /^(?:async\s+function|function|const|let|var|class|\/\*\*)/m.exec(rest);
  const end = m ? afterFirstLine + 1 + m.index : i + maxLen;
  return src.slice(i, Math.min(end, i + maxLen));
}

/**
 * 取 `browserView:action` handler 内 `case 'type'` 的实现段。
 * ★ 必须精确定位：`main.cjs` 里 `case 'type'` 出现**两次** ——
 *   第一次在已废弃的 `browser:call` 通道里（保留仅为兼容 preload），
 *   真正在用的是 `browserView:action` 里的那个。用 indexOf 会拿到废弃的那份。
 */
function activeTypeCase(): string {
  const viewIdx = mainSrc.indexOf("ipcMain.handle('browserView:action'");
  const from = mainSrc.indexOf("case 'type': {", viewIdx);
  expect(from, '未找到 browserView:action 的 type 分支').toBeGreaterThan(-1);
  return mainSrc.slice(from, from + 2500);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('A. CDP 真键盘通道（主路径）', () => {
  it('存在 cdpTypeText 真键盘实现', () => {
    expect(mainSrc).toMatch(/async function cdpTypeText\(wc, target, text, pressEnter\)/);
  });

  it('必须用 Input.insertText 注入文本（走真实编辑管线，派发 beforeinput/input）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn, '未使用 Input.insertText').toContain("'Input.insertText'");
  });

  it('pressEnter 必须用 Input.dispatchKeyEvent 真实按键（不是 JS 合成事件）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toContain("'Input.dispatchKeyEvent'");
    // keyDown / char / keyUp 三件套
    expect(fn).toMatch(/type:\s*'keyDown'/);
    expect(fn).toMatch(/type:\s*'char'/);
    expect(fn).toMatch(/type:\s*'keyUp'/);
  });

  it('必须先聚焦目标元素（否则键盘事件路由不到它）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toMatch(/el\.focus\(\)/);
  });

  it('注入前必须清空已有内容（text 是替换语义）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    // 富文本走 Range+execCommand('delete')，表单走 select()
    expect(fn).toMatch(/execCommand\('delete'/);
    expect(fn).toMatch(/\.select\(\)/);
  });

  it('必须有回读核验并带上 via 标识（供排查走的是哪条路径）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toContain('via:');
    expect(fn).toContain("'cdp-keyboard'");
    expect(fn).toMatch(/applied/);
  });

  it('CDP 不可用必须返回 null 让调用方回落（不能抛错中断输入）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toMatch(/return null/);
  });

  it('cdp.attach 后必须 detach（避免长期占用调试器）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toMatch(/dbg\.detach\(\)/);
    expect(fn).toMatch(/attachedHere/);
  });

  it('元素定位失败必须与"CDP 不可用"区分（locateError 不回落到 JS 重复失败）', () => {
    const fn = sliceFrom(mainSrc, 'async function cdpTypeText(');
    expect(fn).toContain('locateError');
  });

  it("case 'type' 必须优先走 CDP，失败才回落 JS", () => {
    const fn = activeTypeCase();
    const cdpIdx = fn.indexOf('cdpTypeText(wc');
    const jsIdx = fn.indexOf('executeJavaScript');
    expect(cdpIdx, '未调用 CDP 真键盘').toBeGreaterThan(-1);
    expect(jsIdx, '未保留 JS 兜底').toBeGreaterThan(-1);
    expect(cdpIdx, 'CDP 必须在 JS 兜底之前').toBeLessThan(jsIdx);
  });

  it('JS 兜底结果必须带 via 标识（区分走了哪条路）', () => {
    const fn = activeTypeCase();
    expect(fn).toContain("via:'js-fallback'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. JS 兜底路径必须补齐"人的输入"事件序列', () => {
  it('typeIn 必须发 compositionstart/update/end（中文 IME 必经链路）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn, '缺 compositionstart').toMatch(/CompositionEvent\('compositionstart'/);
    expect(fn, '缺 compositionupdate').toMatch(/CompositionEvent\('compositionupdate'/);
    expect(fn, '缺 compositionend').toMatch(/CompositionEvent\('compositionend'/);
  });

  it('必须发 keydown/keyup（提交拦截、字数统计、快捷键）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn).toMatch(/KeyboardEvent\('keydown'/);
    expect(fn).toMatch(/KeyboardEvent\('keyup'/);
  });

  it('input 事件必须带 inputType（富文本/组件按它分支）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn).toMatch(/InputEvent\('input'/);
    expect(fn).toContain('inputType');
  });

  it('必须发 focusin（部分组件靠它初始化）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn).toMatch(/FocusEvent\('focusin'/);
  });

  it('contenteditable 必须走 execCommand(\'insertText\')（富文本 model 同步的唯一途径）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn, '富文本未走编辑管线').toMatch(/execCommand\('insertText'/);
  });

  it('不再用"逐字符 setter 循环"的旧写法（那是无事件的程序化改值）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    // 旧写法特征：for 循环里 put(text.slice(0,i+1))
    expect(fn).not.toMatch(/text\.slice\(0,i\+1\)/);
  });

  it('必须保留 apply 核验（回读值与期望比对）', () => {
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn).toMatch(/applied:got===t/);
  });

  it('原生 value setter 仍在使用（受控组件 compatible）', () => {
    expect(mainSrc).toMatch(/function nativeValueSetter\(el\)/);
    const fn = sliceFrom(mainSrc, 'function typeIn(el,text){');
    expect(fn).toMatch(/nativeValueSetter\(el\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. 工具描述与实现对齐', () => {
  it('browser_type 描述不得再声称未实现的 per-character 行为', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn, '仍留着与实现不符的 per-character 描述').not.toContain('Uses real keyboard input (per-character)');
  });

  it('browser_type 描述必须写明走 CDP 真实键盘', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn).toContain('Input.insertText');
    expect(fn).toMatch(/真实键盘|real keyboard/i);
  });

  it('描述必须说明"替换语义"（避免模型误以为是追加）', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn).toMatch(/替换/);
  });

  it('描述必须提示 applied:false 时的正确处置（别盲目重试）', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn).toMatch(/applied/);
    expect(fn).toMatch(/不要盲目重复调用|核验/);
  });

  it('text 参数的 schema 描述也标注替换语义', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn).toMatch(/替换语义（先清空再输入）/);
  });

  it('pressEnter 描述说明是真实按键事件', () => {
    const fn = sliceFrom(toolSrc, 'export class BrowserTypeTool', 2200);
    expect(fn).toMatch(/真实的 Enter 按键事件|不是 JS 合成/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('废弃通道标注（防误导）', () => {
  it("browser:call 的 case 'type' 必须标注已废弃", () => {
    // 取 browser:call handler 内的 type 分支（第一个出现的位置）
    const callIdx = mainSrc.indexOf("ipcMain.handle('browser:call'");
    const viewIdx = mainSrc.indexOf("ipcMain.handle('browserView:action'");
    const seg = mainSrc.slice(callIdx, viewIdx);
    const typeIdx = seg.indexOf("case 'type': {");
    expect(typeIdx, '未找到 browser:call 的 type 分支').toBeGreaterThan(-1);
    const branch = seg.slice(typeIdx, typeIdx + 600);
    expect(branch, '未标注废弃').toMatch(/已废弃|deprecated/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('★ 陷阱防护：注入页面的 JS 块必须语法正确', () => {
  /**
   * ★★★ 为什么单列一组（2026-10-08 实际踩到，`node --check` 拦不住）：
   *   `cdpTypeText` / `typeIn` 的代码是写在**反引号模板字符串内部**的（要注入到页面执行）。
   *   在那种位置的注释里写一个反引号（例如 `` `textContent = 值` ``）会**提前结束外层字符串**
   *   → 整个 main.cjs 语法崩（`missing ) after argument list`）。
   *   `node --check main.cjs` 能发现语法崩，但**发现不了"外层没崩、注入到页面的代码本身有错"**
   *   （插值未求值、运行期才炸）。所以这里把注入块抠出来单独做一次语法检查。
   */

  it('所有 executeJavaScript 注入块语法正确（还原插值后 new Function 可编译）', () => {
    const segStart = mainSrc.indexOf('async function injectYzAssistant(');
    const segEnd = mainSrc.indexOf('// 通用 action handler', segStart);
    const seg = mainSrc.slice(segStart, segEnd > 0 ? segEnd : segStart + 30000);
    const blocks: string[] = [];
    const re = /executeJavaScript\(`([\s\S]*?)`\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) blocks.push(m[1]);
    expect(blocks.length, '未抠到任何注入块（正则失效？）').toBeGreaterThan(0);
    for (const [i, raw] of blocks.entries()) {
      // 还原插值：模板字面量里的 ${...} 在提取后被还原成占位符，否则 new Function 报语法错
      const code = raw.replace(/\$\{[^}]*\}/g, '"PLACEHOLDER"');
      expect(() => new Function(code), `注入块 #${i + 1} 语法错误`).not.toThrow();
    }
  });

  it('cdpTypeText 的两个注入块同样语法正确', () => {
    const start = mainSrc.indexOf('async function cdpTypeText(');
    const seg = mainSrc.slice(start, start + 9000);
    const blocks: string[] = [];
    const re = /executeJavaScript\(`([\s\S]*?)`\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) blocks.push(m[1]);
    expect(blocks.length, 'cdpTypeText 未抠到注入块').toBeGreaterThan(0);
    for (const [i, raw] of blocks.entries()) {
      const code = raw.replace(/\$\{[^}]*\}/g, '"PLACEHOLDER"');
      expect(() => new Function(code), `cdpTypeText 注入块 #${i + 1} 语法错误`).not.toThrow();
    }
  });
});
