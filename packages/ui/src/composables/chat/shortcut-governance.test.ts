/**
 * 快捷键管理守门测试（2026-10-17，方案 docs/快捷键管理-方案-20261017.md）。
 *
 * 覆盖三条链路的结构契约（依赖 Electron/组件挂载太重，不适合整体挂载，仿
 * input-send-affordance.test.ts 的源码正则手法）：
 *   ① main.cjs：setGlobalHotkey 唯一实现；急停不可禁用（空值回退默认键）；
 *      急停不再硬编码 globalShortcut.register。
 *   ② Settings.vue：急停行存在且**无「禁用」入口**（安全阀不可拆，用户拍板）；
 *      发送键三态切换数据源为 settings.sendKeyMode。
 *   ③ ChatInputArea.vue：onEnter/onCtrlEnter 按 sendKeyMode 分派；
 *      IME 组合态拦截在两个 handler 里都在 preventDefault 之前；
 *      发送动作收口 handleSendIntent（单一实现）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');
const MAIN = readFileSync(resolve(ROOT, 'apps/desktop/main.cjs'), 'utf8');
const SETTINGS = readFileSync(resolve(ROOT, 'packages/ui/src/views/Settings.vue'), 'utf8');
const INPUT = readFileSync(resolve(ROOT, 'packages/ui/src/components/chat/ChatInputArea.vue'), 'utf8');
const strip = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

describe('全局热键（main.cjs）', () => {
  it('★ setGlobalHotkey 是唯一注册实现，截图/急停都走它', () => {
    const src = strip(MAIN);
    expect(src, '★ 缺 setGlobalHotkey 唯一实现').toMatch(/function setGlobalHotkey\(holder, accel, handler, label\)/);
    const regCount = (src.match(/globalShortcut\.register\(/g) || []).length;
    expect(regCount, `★ globalShortcut.register 只允许出现在 setGlobalHotkey 内（实测 ${regCount} 处）`).toBe(1);
    expect(src, '★ 截图热键未走公共实现').toMatch(/function setScreenshotHotkey\(accel\)\s*\{\s*return setGlobalHotkey\(shotHotkey/);
    expect(src, '★ 急停热键未走公共实现').toMatch(/function setPanicHotkey\(accel\)\s*\{/);
  });

  it('★ 急停不可禁用：空值一律回退默认键（安全阀不可拆）', () => {
    const src = strip(MAIN);
    expect(src, '★ 急停空值未回退默认键').toMatch(/function setPanicHotkey\(accel\)\s*\{[\s\S]*?const target = String\(accel \|\| ''\)\.trim\(\) \|\| DEFAULT_PANIC_ACCEL/);
    // 急停注册链路上不允许出现"disabled"放行（截图可以禁用，急停不行）
    const panicFn = src.slice(src.indexOf('function setPanicHotkey'), src.indexOf('function setPanicHotkey') + 300);
    expect(panicFn, '★ 急停允许了空串禁用').not.toMatch(/disabled: true/);
  });

  it('★ 启动即注册默认急停键（渲染层未就绪也无真空期），IPC 成对暴露', () => {
    const src = strip(MAIN);
    expect(src, '★ 启动未兜底注册默认急停键').toMatch(/setPanicHotkey\(DEFAULT_PANIC_ACCEL\)/);
    expect(src).toMatch(/'shortcut:getPanic'/);
    expect(src).toMatch(/'shortcut:setPanic'/);
  });
});

describe('设置页（Settings.vue）', () => {
  it('★ 急停行存在、可恢复默认，但不含「禁用」入口', () => {
    expect(SETTINGS).toMatch(/label="AI 急停快捷键"/);
    const row = SETTINGS.slice(SETTINGS.indexOf('label="AI 急停快捷键"'), SETTINGS.indexOf('label="AI 急停快捷键"') + 900);
    expect(row, '★ 急停行缺恢复默认按钮').toMatch(/resetPanicAccel/);
    expect(row, '★ 急停行不得出现禁用按钮（安全阀不可拆）').not.toMatch(/禁用/);
  });

  it('★ 急停数据源为 settings.panicAccelerator，与截图键冲突有前置自检', () => {
    expect(SETTINGS).toMatch(/settingsStore\.update\(\{ panicAccelerator: panicAccel\.value \}\)/);
    expect(SETTINGS).toMatch(/与截图快捷键相同，请换一个组合/);
  });

  it('★ 发送键三态切换：数据源 settings.sendKeyMode，两个选项', () => {
    expect(SETTINGS).toMatch(/settingsStore\.update\(\{ sendKeyMode: v \}\)/);
    expect(SETTINGS).toMatch(/<el-radio value="enter">Enter 发送/);
    expect(SETTINGS).toMatch(/<el-radio value="ctrlEnter">Ctrl\+Enter 发送/);
  });
});

describe('聊天输入区（ChatInputArea.vue）', () => {
  it('★ 发送动作收口 handleSendIntent，onEnter / onCtrlEnter 只做键分派', () => {
    expect(INPUT, '★ 缺 handleSendIntent 收口').toMatch(/function handleSendIntent\(\)/);
    expect(INPUT).toMatch(/@keydown\.enter\.exact="onEnter"/);
    expect(INPUT).toMatch(/@keydown\.enter\.ctrl="onCtrlEnter"/);
  });

  it('★ ctrlEnter 模式：无修饰 Enter 直接放行换行（不 preventDefault）', () => {
    const src = strip(INPUT);
    const i = src.indexOf('function onEnter(');
    const body = src.slice(i, i + 900);
    const modeCheck = body.indexOf("sendKeyMode.value === 'ctrlEnter'");
    const prevent = body.indexOf('e.preventDefault()');
    expect(modeCheck, '★ onEnter 缺模式分派').toBeGreaterThan(-1);
    expect(prevent, '★ onEnter 缺 preventDefault').toBeGreaterThan(-1);
    expect(modeCheck, '★ 模式分派必须排在 preventDefault 之前（否则 ctrlEnter 模式 Enter 也被拦成发送）').toBeLessThan(prevent);
  });

  it('★ enter 模式：Ctrl+Enter 保持历史行为（不发送），仅 ctrlEnter 模式放行', () => {
    const src = strip(INPUT);
    const i = src.indexOf('function onCtrlEnter(');
    const body = src.slice(i, i + 600);
    const modeCheck = body.indexOf("sendKeyMode.value !== 'ctrlEnter'");
    const prevent = body.indexOf('e.preventDefault()');
    expect(modeCheck, '★ onCtrlEnter 缺 enter 模式放行判断').toBeGreaterThan(-1);
    expect(prevent, '★ onCtrlEnter 缺 preventDefault').toBeGreaterThan(-1);
    expect(modeCheck).toBeLessThan(prevent);
  });

  it('★ IME 组合态拦截在两个 handler 里都在最前（isComposing / keyCode 229）', () => {
    const src = strip(INPUT);
    for (const fn of ['function onEnter(', 'function onCtrlEnter(']) {
      const i = src.indexOf(fn);
      const body = src.slice(i, i + 700);
      const ime = body.search(/isComposing \|\| e\.keyCode === 229/);
      const firstBrace = body.indexOf('{');
      expect(ime, `${fn} 缺 IME 组合态拦截`).toBeGreaterThan(firstBrace);
      const bodyAfterIme = body.slice(ime);
      expect(bodyAfterIme.slice(0, 120), `${fn} IME 拦截后必须紧跟 return`).toMatch(/return/);
    }
  });

  it('★ 文案联动：placeholder 与发送 tooltip 引用 sendKeyHint', () => {
    expect(INPUT.includes('，${sendKeyHint.value} 发送，Shift+Enter 换行'), '★ placeholder 未联动发送键文案').toBe(true);
    expect(INPUT.includes('`发送 (${sendKeyHint})`'), '★ 发送按钮 tooltip 未联动发送键文案').toBe(true);
  });
});
