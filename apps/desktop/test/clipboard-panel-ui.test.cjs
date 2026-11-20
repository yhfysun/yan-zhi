const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

test('剪贴板独立面板：单层可读玻璃、固定与八向缩放接线完整', () => {
  const main = read('apps/desktop/main.cjs');
  const preload = read('apps/desktop/preload.cjs');
  const panel = read('packages/ui/src/views/ClipPanel.vue');
  const gameBar = read('packages/ui/src/components/browser/GameControlBar.vue');
  const topBar = read('packages/ui/src/components/WebTopBar.vue');
  const clipMain = main.slice(
    main.indexOf('function createClipPanelWindow'),
    main.indexOf('function setClipHotkey'),
  );
  const clipPreload = preload.slice(
    preload.indexOf('clipboardPanel: {'),
    preload.indexOf('  electron: {', preload.indexOf('clipboardPanel: {')),
  );

  assert.match(clipMain, /resizable:\s*true/);
  assert.match(clipMain, /minimizable:\s*true/);
  assert.match(main, /const CLIP_MIN_WIDTH = 380/);
  assert.match(main, /const CLIP_MIN_HEIGHT = 460/);
  assert.match(clipMain, /minWidth:\s*CLIP_MIN_WIDTH/);
  assert.match(clipMain, /minHeight:\s*CLIP_MIN_HEIGHT/);
  assert.match(clipMain, /hasShadow:\s*false/);
  assert.match(clipMain, /roundedCorners:\s*false/);
  assert.match(clipMain, /thickFrame:\s*false/);
  assert.match(clipMain, /alwaysOnTop:\s*cfg\.pinned/);
  assert.doesNotMatch(clipMain, /win\.on\('blur'[\s\S]*hideClipPanel\(\)/);
  assert.match(clipMain, /setAlwaysOnTop\(cfg\.pinned/);
  assert.match(main, /'clipboard:panel-get-bounds'/);
  assert.match(main, /'clipboard:panel-set-bounds'/);
  assert.match(main, /'clipboard:panel-set-pinned'/);

  assert.match(clipPreload, /getBounds:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('clipboard:panel-get-bounds'\)/);
  assert.match(clipPreload, /setBounds:\s*\(bounds\)\s*=>\s*ipcRenderer\.send\('clipboard:panel-set-bounds', bounds\s*\|\|\s*\{\}\)/);
  assert.match(clipPreload, /setPinned:\s*\(pinned\)/);
  assert.match(clipPreload, /minimize:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('clipboard:panel-minimize'\)/);

  for (const handle of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    assert.match(panel, new RegExp(`cp-resize-${handle}`));
  }
  assert.match(panel, /panelPinned/);
  assert.match(panel, /togglePanelPinned/);
  assert.match(panel, /minimizePanel/);
  assert.match(panel, /title="最小化"/);
  assert.match(panel, /backdrop-filter:\s*blur\(22px\)/);
  assert.match(panel, /background-color:\s*color-mix\(in srgb, var\(--skin-surface, #f8f9fc\) 92%, transparent\) !important/);
  assert.match(panel, /background-image:[\s\S]*var\(--skin-dialog-pattern, none\) !important/);
  assert.match(panel, /border:\s*0;/);
  assert.match(panel, /border-radius:\s*28px;/);
  assert.match(panel, /\.clip-root\s*\{[^}]*padding:\s*0;/s);
  assert.doesNotMatch(panel, /多选（|关闭\(Esc\)|显示原文（|复制（Enter|交给 AI 处理（|按分组筛选（|删除分组（/);
  assert.doesNotMatch(gameBar, /开跑前也会自动关|（长按）|（斜向）|页面不会被关闭/);
  assert.match(topBar, /title="游戏窗"/);
  assert.match(topBar, /Gamepad2/);
  assert.doesNotMatch(topBar, /<VideoPlay \/>/);
});
