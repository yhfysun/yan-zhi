'use strict';

const path = require('path');

const DEFAULT_TTL_MS = 1_800;
const DEFAULT_WATCHDOG_MS = 100;

function toDipRect(screen, rect) {
  const x = Number(rect && rect.x) || 0;
  const y = Number(rect && rect.y) || 0;
  const width = Math.max(1, Number(rect && rect.width) || 0);
  const height = Math.max(1, Number(rect && rect.height) || 0);
  const topLeft = screen.screenToDipPoint({ x, y });
  const bottomRight = screen.screenToDipPoint({ x: x + width, y: y + height });
  return {
    x: Math.round(topLeft.x),
    y: Math.round(topLeft.y),
    width: Math.max(1, Math.round(bottomRight.x - topLeft.x)),
    height: Math.max(1, Math.round(bottomRight.y - topLeft.y)),
  };
}

function createComputerControlOverlay(options = {}) {
  const BrowserWindow = options.BrowserWindow;
  const screen = options.screen;
  const resolveForeground = options.resolveForeground;
  const overlayFile = options.overlayFile || path.join(__dirname, 'computer-control-overlay.html');
  const preloadFile = options.preloadFile || path.join(__dirname, 'computer-control-preload.cjs');
  const ttlMs = Math.max(250, Math.min(2_000, Number(options.ttlMs) || DEFAULT_TTL_MS));
  const watchdogMs = Math.max(50, Number(options.watchdogMs) || DEFAULT_WATCHDOG_MS);
  const now = options.now || Date.now;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const registerEscape = options.registerEscape;
  const onEscape = options.onEscape;
  const log = options.log || (() => {});
  if (!BrowserWindow) throw new Error('BrowserWindow is required');
  if (!screen || typeof screen.screenToDipPoint !== 'function') throw new Error('screen is required');
  if (typeof resolveForeground !== 'function') throw new Error('resolveForeground is required');

  let active = null;
  let watchdog = null;
  let releaseEscape = null;

  function stopWatchdog() {
    if (watchdog == null) return;
    clearIntervalFn(watchdog);
    watchdog = null;
  }

  function ensureWatchdog() {
    if (watchdog != null) return;
    watchdog = setIntervalFn(() => {
      if (!active) {
        stopWatchdog();
        return;
      }
      updateInteraction();
      if (now() >= active.expiresAt) teardown('lease-expired');
    }, watchdogMs);
    watchdog.unref?.();
  }

  function teardown(reason) {
    const previous = active;
    active = null;
    stopWatchdog();
    try { releaseEscape?.(); } catch { /* shortcut may already be gone */ }
    releaseEscape = null;
    if (!previous) return false;
    const win = previous.win;
    try {
      if (win && !win.isDestroyed()) {
        try { win.hide(); } catch { /* renderer may already be gone */ }
        try { win.destroy(); } catch { /* closed event may race teardown */ }
      }
    } catch { /* never let cleanup escape */ }
    log(`[computer-control-overlay] closed reason=${reason} session=${previous.sessionId}`);
    return true;
  }

  function attachWindowEvents(win, sessionId) {
    const cleanup = (reason) => {
      if (!active || active.win !== win || active.sessionId !== sessionId) return;
      teardown(reason);
    };
    win.on('closed', () => cleanup('window-closed'));
    win.on('render-process-gone', () => cleanup('renderer-gone'));
    win.on('unresponsive', () => cleanup('renderer-unresponsive'));
  }

  function applyRendererState(win, rect, preview, input) {
    if (!win?.webContents || typeof win.webContents.executeJavaScript !== 'function') return;
    let script = `document.documentElement.dataset.preview=${JSON.stringify(preview ? '1' : '0')};`;
    if (input?.toolName) {
      script += `window.__setControlAction?.(${JSON.stringify(String(input.toolName))});`;
    }
    const cx = Number(input?.cursor?.x);
    const cy = Number(input?.cursor?.y);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      const dip = screen.screenToDipPoint({ x: cx, y: cy });
      const point = {
        x: Math.round(dip.x - rect.x),
        y: Math.round(dip.y - rect.y),
        click: input?.click === true,
      };
      script += `window.__setControlCursor?.(${JSON.stringify(point)});`;
    }
    try {
      Promise.resolve(win.webContents.executeJavaScript(script)).catch(() => undefined);
    } catch { /* renderer may be loading */ }
  }

  function updateInteraction() {
    if (!active?.win || active.win.isDestroyed()) return;
    if (!active.preview || typeof screen.getCursorScreenPoint !== 'function') {
      try { active.win.setIgnoreMouseEvents(true, { forward: true }); } catch { /* ignore */ }
      return;
    }
    let point;
    let bounds;
    try {
      point = screen.getCursorScreenPoint();
      bounds = active.win.getBounds();
    } catch {
      return;
    }
    const relX = point.x - bounds.x;
    const relY = point.y - bounds.y;
    const insideControl = relX >= Math.max(0, bounds.width - 250) && relY >= 0 && relY <= 48;
    try { active.win.setIgnoreMouseEvents(!insideControl, { forward: true }); } catch { /* ignore */ }
  }

  async function pulse(input = {}) {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return { ok: false, error: 'missing-session-id' };

    const foreground = await resolveForeground();
    if (!foreground || foreground.ok === false || !foreground.rect) {
      teardown('foreground-unavailable');
      return { ok: false, error: String(foreground?.error || 'foreground-unavailable') };
    }

    const rect = toDipRect(screen, foreground.rect);
    const hwnd = String(foreground.hwnd || '');
    const expiresAt = now() + ttlMs;
    const preview = input.preview !== false;

    if (active && active.sessionId !== sessionId) teardown('session-replaced');
    if (active && active.win && active.win.isDestroyed()) active = null;

    if (!active) {
      const win = new BrowserWindow({
        ...rect,
        title: '言智电脑控制',
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        show: false,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        focusable: false,
        alwaysOnTop: true,
        type: 'toolbar',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          preload: preloadFile,
        },
      });
      active = { sessionId, hwnd, rect, win, expiresAt, preview, paused: false };
      attachWindowEvents(win, sessionId);
      if (typeof registerEscape === 'function' && !releaseEscape) {
        const cleanup = registerEscape(() => {
          teardown('escape');
          try { onEscape?.(); } catch { /* callback must not block cleanup */ }
        });
        releaseEscape = typeof cleanup === 'function' ? cleanup : () => {};
      }
      try {
        win.setIgnoreMouseEvents(true, { forward: true });
        win.setAlwaysOnTop(true, 'screen-saver');
        await win.loadFile(overlayFile, { query: { preview: preview ? '1' : '0' } });
        if (!active || active.win !== win) return { ok: false, error: 'overlay-superseded' };
        win.showInactive();
        applyRendererState(win, rect, preview, input);
      } catch (err) {
        teardown('load-failed');
        throw err;
      }
    } else {
      active.hwnd = hwnd;
      active.rect = rect;
      active.expiresAt = expiresAt;
      active.preview = preview;
      active.win.setBounds(rect);
      applyRendererState(active.win, rect, preview, input);
      try { active.win.showInactive(); } catch { /* already visible */ }
    }

    ensureWatchdog();
    if (typeof input.paused === 'boolean') setPaused(input.paused);
    updateInteraction();
    return { ok: true, sessionId, hwnd, rect, expiresAt };
  }

  function stop(sessionId = '') {
    if (!active) return { ok: true, stopped: false };
    const wanted = String(sessionId || '');
    if (wanted && wanted !== '*' && active.sessionId !== wanted) return { ok: true, stopped: false };
    const stoppedSession = active.sessionId;
    teardown('stop-requested');
    return { ok: true, stopped: true, sessionId: stoppedSession };
  }

  function state() {
    return active
      ? {
        active: true,
        sessionId: active.sessionId,
        hwnd: active.hwnd,
        rect: { ...active.rect },
        expiresAt: active.expiresAt,
        paused: active.paused === true,
      }
      : { active: false };
  }

  function setPaused(paused) {
    if (!active?.win || active.win.isDestroyed() || !active.win.webContents) return { ok: false };
    try {
      active.paused = paused === true;
      Promise.resolve(active.win.webContents.executeJavaScript(
        `window.__setControlPaused?.(${paused === true ? 'true' : 'false'});`,
      )).catch(() => undefined);
      return { ok: true, paused: active.paused };
    } catch {
      return { ok: false };
    }
  }

  function ownsWebContents(contents) {
    return !!active?.win && !active.win.isDestroyed() && active.win.webContents === contents;
  }

  return {
    pulse,
    stop,
    state,
    setPaused,
    ownsWebContents,
    dispose: () => teardown('disposed'),
  };
}

module.exports = {
  createComputerControlOverlay,
  toDipRect,
  DEFAULT_TTL_MS,
  DEFAULT_WATCHDOG_MS,
};
