// 快捷键截图「确认后可直接粘贴」的守门测试（2026-10-24 用户实报：
// 「截图我选了勾不能粘贴出来…我用快捷键截图啊」）。
//
// 根因两条：
//   ① 确认后只把图加进聊天输入框，从不写系统剪贴板 → 在别的应用里 Ctrl+V 粘不出来；
//   ② 快捷键触发后收尾把主窗口抢到前台 → 焦点离开用户原来的应用，粘贴对象也被切走。
// 现在：确认即写剪贴板；快捷键来源只进剪贴板不加附件；从别的应用触发时用 showInactive 回窗。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const INPUT = readFileSync(resolve(REPO, 'packages/ui/src/components/chat/ChatInputArea.vue'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');
const SNIP_PRELOAD = readFileSync(resolve(REPO, 'apps/desktop/snip-preload.cjs'), 'utf8');
const SNIP_PAGE = readFileSync(resolve(REPO, 'apps/desktop/snip-overlay.js'), 'utf8');

describe('截图确认 → 系统剪贴板', () => {
  it('确认成功后写剪贴板（不再只塞进输入框）', () => {
    expect(INPUT).toContain('clipboard?.writeImage?.(res.dataUrl)');
  });

  it('快捷键来源只进剪贴板、不追加附件；按钮来源仍走原附件流程', () => {
    const at = INPUT.indexOf('async function startScreenshot');
    const body = INPUT.slice(at, at + 2200);
    const copyAt = body.indexOf('writeImage');
    const hotkeyBranch = body.indexOf('if (fromHotkey)');
    const addAt = body.indexOf('addFiles(');
    expect(copyAt, '必须先写剪贴板').toBeGreaterThanOrEqual(0);
    expect(hotkeyBranch, '快捷键分支缺失').toBeGreaterThan(copyAt);
    expect(addAt, '附件路径必须排在快捷键分支之后').toBeGreaterThan(hotkeyBranch);
  });

  it('按钮点击不能把 MouseEvent 当成 fromHotkey 传进来', () => {
    expect(INPUT).toContain('@click="startScreenshot()"');
    expect(INPUT).not.toContain('@click="startScreenshot"');
    expect(INPUT).toContain('onHotkey(() => { void startScreenshot(true); })');
  });
});

describe('快捷键截图不抢焦点', () => {
  it('记录触发时是否在本应用，并从别的应用触发时 showInactive 回窗', () => {
    expect(MAIN).toContain('snipHotkeyContext = { wasFocused: win.isFocused() }');
    expect(MAIN).toMatch(/s\.hotkey && s\.hotkey\.wasFocused === false\) s\.win\.showInactive\(\)/);
  });
});

describe('冻结帧：hover 弹窗也能截进去', () => {
  it('亮窗之前先抓一帧，作为遮罩背景与裁剪来源', () => {
    // 抓帧必须在亮出遮罩（snip:new-session / show）之前 —— 遮罩一出现 hover 就没了
    const capAt = MAIN.indexOf('captureFrameClean(targetDisplay)');
    const freezeAt = MAIN.indexOf("send('snip:freeze'");
    const showAt = MAIN.indexOf('overlay.show(); overlay.focus();');
    expect(capAt, '缺少亮窗前抓帧').toBeGreaterThanOrEqual(0);
    expect(freezeAt, '缺少冻结帧下发').toBeGreaterThanOrEqual(0);
    expect(capAt).toBeLessThan(freezeAt);
    expect(freezeAt).toBeLessThan(showAt);
  });

  it('确认时从冻结帧裁剪，而不是重新抓实时屏幕', () => {
    const at = MAIN.indexOf('function requestCompose');
    const body = MAIN.slice(at, at + 900);
    expect(body).toContain('s.baseImage');
    expect(body).toMatch(/if \(!cap\)/);
  });

  it('遮罩页把冻结帧铺成最底层背景（不改变挖洞/暗幕层级）', () => {
    expect(SNIP_PRELOAD).toContain("ipcRenderer.on('snip:freeze'");
    expect(SNIP_PAGE).toContain("id = 'freeze'");
    expect(SNIP_PAGE).toContain('z-index:0');
    expect(SNIP_PAGE).toContain('snipAPI.onFreeze');
  });
});
