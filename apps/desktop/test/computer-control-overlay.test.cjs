const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createComputerControlOverlay, toDipRect } = require('../computer-control-overlay.cjs');

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
    this.listeners = new Map();
    this.destroyed = false;
    this.shown = false;
    this.ignoredMouse = null;
    this.alwaysOnTop = false;
    this.webContents = {
      scripts: [],
      executeJavaScript: async (script) => {
        this.webContents.scripts.push(script);
        return true;
      },
    };
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  emit(event, payload) {
    for (const cb of this.listeners.get(event) || []) cb(payload);
  }

  async loadFile(file, options) {
    this.loadedFile = file;
    this.loadOptions = options;
  }

  showInactive() {
    this.shown = true;
  }

  setIgnoreMouseEvents(ignore, options) {
    this.ignoredMouse = { ignore, options };
  }

  setAlwaysOnTop(value, level) {
    this.alwaysOnTop = { value, level };
  }

  setBounds(bounds) {
    this.bounds = { ...bounds };
  }

  getBounds() {
    return { ...this.bounds };
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('closed');
  }
}

function createHarness(options = {}) {
  let now = 10_000;
  let nextTimer = 1;
  const timers = new Map();
  const windows = [];
  let foreground = options.foreground || {
    ok: true,
    hwnd: 101,
    rect: { x: 100, y: 80, width: 900, height: 600 },
  };
  let cursor = options.cursor || { x: 0, y: 0 };
  const screen = {
    screenToDipPoint(point) {
      return { x: point.x / 2, y: point.y / 2 };
    },
    getCursorScreenPoint() {
      return cursor;
    },
  };
  const BrowserWindow = class extends FakeWindow {
    constructor(opts) {
      super(opts);
      windows.push(this);
    }
  };
  const controller = createComputerControlOverlay({
    BrowserWindow,
    screen,
    overlayFile: 'C:/tmp/computer-control-overlay.html',
    resolveForeground: async () => foreground,
    now: () => now,
    ttlMs: 1_800,
    watchdogMs: 250,
    setIntervalFn: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearIntervalFn: (id) => timers.delete(id),
    registerEscape: options.registerEscape,
  });
  return {
    controller,
    windows,
    timers,
    advance(ms) {
      now += ms;
      for (const fn of [...timers.values()]) fn();
    },
    setForeground(next) {
      foreground = next;
    },
    setCursor(next) {
      cursor = next;
    },
  };
}

test('toDipRect converts physical window pixels to Electron DIP bounds', () => {
  const screen = {
    screenToDipPoint(point) {
      return { x: point.x * 1.5, y: point.y * 1.5 };
    },
  };
  assert.deepEqual(
    toDipRect(screen, { x: 10, y: 20, width: 200, height: 100 }),
    { x: 15, y: 30, width: 300, height: 150 },
  );
});

test('pulse creates one click-through yellow frame around the foreground window', async () => {
  const h = createHarness();
  const result = await h.controller.pulse({ sessionId: 'conv-1', toolName: 'computer_mouse_click' });

  assert.equal(result.ok, true);
  assert.equal(h.windows.length, 1);
  const win = h.windows[0];
  assert.deepEqual(win.bounds, { x: 50, y: 40, width: 450, height: 300 });
  assert.equal(win.options.focusable, false);
  assert.equal(win.options.alwaysOnTop, true);
  assert.equal(win.options.skipTaskbar, true);
  assert.equal(win.options.transparent, true);
  assert.equal(win.ignoredMouse.ignore, true);
  assert.equal(win.alwaysOnTop.level, 'screen-saver');
  assert.equal(win.shown, true);

  await h.controller.pulse({ sessionId: 'conv-1', toolName: 'computer_scroll' });
  assert.equal(h.windows.length, 1, 'heartbeat must not create a second overlay');
});

test('preview setting hides the compact status text while retaining the yellow frame', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1', preview: false });
  assert.equal(h.windows[0].loadOptions.query.preview, '0');
  assert.match(h.windows[0].webContents.scripts.join('\n'), /dataset\.preview="0"/);
});

test('pulse retargets an existing frame when foreground window changes', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.setForeground({
    ok: true,
    hwnd: 202,
    rect: { x: 300, y: 200, width: 800, height: 500 },
  });
  await h.controller.pulse({ sessionId: 'conv-1' });

  assert.equal(h.windows.length, 1);
  assert.deepEqual(h.windows[0].bounds, { x: 150, y: 100, width: 400, height: 250 });
});

test('pulse renders the AI cursor at the latest action point', async () => {
  const h = createHarness();
  await h.controller.pulse({
    sessionId: 'conv-1',
    cursor: { x: 300, y: 200 },
    click: true,
  });
  const scripts = h.windows[0].webContents.scripts.join('\n');
  assert.match(scripts, /__setControlCursor/);
  assert.match(scripts, /"x":100/);
  assert.match(scripts, /"y":60/);
  assert.match(scripts, /"click":true/);
});

test('stop destroys the frame immediately', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.controller.stop('conv-1');

  assert.equal(h.windows[0].destroyed, true);
  assert.equal(h.controller.state().active, false);
});

test('watchdog removes a frame when the lease expires without another action', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.advance(1_799);
  assert.equal(h.windows[0].destroyed, false);

  h.advance(1);
  assert.equal(h.windows[0].destroyed, true, 'expired frame must be destroyed at the 2 second limit');
  assert.equal(h.controller.state().active, false);
});

test('renderer crash tears down the frame and releases the lease', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.windows[0].emit('render-process-gone', { reason: 'crashed' });

  assert.equal(h.windows[0].destroyed, true);
  assert.equal(h.controller.state().active, false);
});

test('registers Escape for the active lease and releases it during teardown', async () => {
  let escapeHandler = null;
  let unregistered = 0;
  const h = createHarness({
    registerEscape(handler) {
      escapeHandler = handler;
      return () => { unregistered += 1; };
    },
  });
  await h.controller.pulse({ sessionId: 'conv-1' });
  assert.equal(typeof escapeHandler, 'function');
  escapeHandler();
  assert.equal(h.windows[0].destroyed, true);
  assert.equal(unregistered, 1);
});

test('only the compact control strip becomes interactive, the rest stays click-through', async () => {
  const h = createHarness({ cursor: { x: 50, y: 40 } });
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.advance(100);
  assert.equal(h.windows[0].ignoredMouse.ignore, true);

  h.setCursor({ x: 490, y: 45 });
  h.advance(100);
  assert.equal(h.windows[0].ignoredMouse.ignore, false);
});

test('paused state is rendered without removing the frame', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.controller.setPaused(true);
  const scripts = h.windows[0].webContents.scripts.join('\n');
  assert.match(scripts, /__setControlPaused/);
  assert.match(scripts, /true/);
  assert.equal(h.windows[0].destroyed, false);
});

test('missing foreground target does not leave an old frame alive', async () => {
  const h = createHarness();
  await h.controller.pulse({ sessionId: 'conv-1' });
  h.setForeground({ ok: false, error: 'foreground-unavailable' });
  const result = await h.controller.pulse({ sessionId: 'conv-1' });

  assert.equal(result.ok, false);
  assert.equal(h.windows[0].destroyed, true);
});

test('电脑控制 overlay 与桥接文件进入全部桌面安装包', () => {
  const desktopDir = path.resolve(__dirname, '..');
  const required = [
    'computer-control-overlay.cjs',
    'computer-control-overlay.html',
    'computer-control-preload.cjs',
    'computer-control-bridge.cjs',
  ];
  for (const name of ['electron-builder.full.yml', 'electron-builder.lite.yml', 'electron-builder.mac.yml']) {
    const source = fs.readFileSync(path.join(desktopDir, name), 'utf8');
    for (const file of required) assert.match(source, new RegExp(`- ${file.replace(/[.]/g, '\\.')}`), `${name} 缺少 ${file}`);
  }
});
