const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createComputerControlOverlay } = require('../apps/desktop/computer-control-overlay.cjs');

const outDir = path.join(__dirname, '..', 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const activeShot = path.join(outDir, 'computer-control-overlay-active.png');
const stoppedShot = path.join(outDir, 'computer-control-overlay-stopped.png');

async function capturePrimary(name) {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: display.size,
  });
  const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
  if (!source) throw new Error('no screen capture source');
  fs.writeFileSync(name, source.thumbnail.toPNG());
}

app.whenReady().then(async () => {
  const targetBounds = { x: 180, y: 140, width: 960, height: 620 };
  const target = new BrowserWindow({
    ...targetBounds,
    title: 'AI Control Target',
    show: true,
    backgroundColor: '#f4f1e8',
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await target.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <!doctype html><html><body style="margin:0;font-family:'Microsoft YaHei UI',sans-serif;background:#f4f1e8;color:#1f2933">
      <div style="padding:28px">
        <h1 style="margin:0 0 8px;font-size:26px">电脑控制目标窗口</h1>
        <p style="margin:0;color:#5f6b76">黄色边框应在控制期间可见，停止后立即消失。</p>
        <div style="margin-top:28px;display:flex;gap:16px">
          <div style="width:220px;height:120px;border:1px solid #d6d0c2;background:#fff"></div>
          <div style="width:220px;height:120px;border:1px solid #d6d0c2;background:#fff"></div>
          <div style="width:220px;height:120px;border:1px solid #d6d0c2;background:#fff"></div>
        </div>
      </div>
    </body></html>
  `));
  target.showInactive();

  const controller = createComputerControlOverlay({
    BrowserWindow,
    screen,
    overlayFile: path.join(__dirname, '..', 'apps', 'desktop', 'computer-control-overlay.html'),
    preloadFile: path.join(__dirname, '..', 'apps', 'desktop', 'computer-control-preload.cjs'),
    resolveForeground: async () => {
      const bounds = target.getBounds();
      const physical = screen.dipToScreenRect(null, bounds);
      return {
        ok: true,
        hwnd: 123,
        pid: process.pid,
        title: target.getTitle(),
        rect: {
          x: physical.x,
          y: physical.y,
          width: physical.width,
          height: physical.height,
        },
      };
    },
    log: (...args) => console.log(...args),
  });

  await controller.pulse({
    sessionId: 'visual-check',
    preview: true,
    cursor: { x: targetBounds.x + 300, y: targetBounds.y + 260 },
    click: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await capturePrimary(activeShot);

  controller.stop('visual-check');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await capturePrimary(stoppedShot);

  controller.dispose();
  target.destroy();
  console.log(JSON.stringify({ activeShot, stoppedShot }, null, 2));
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
