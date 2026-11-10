import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

function resolveChromiumExecutable(): string {
  const preferred = chromium.executablePath();
  if (preferred && fs.existsSync(preferred)) return preferred;
  const cache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(cache)) return '';
  const versions = fs.readdirSync(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const dir of versions) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(cache, dir, sub, 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return '';
}

const executablePath = resolveChromiumExecutable();
const hasChromium = !!executablePath;

describe.skipIf(!hasChromium)('真实 Chromium 文件拖放与 Shadow DOM input', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let filePath = '';

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, executablePath });
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    filePath = path.join(os.tmpdir(), `yz-drop-${Date.now()}.txt`);
    fs.writeFileSync(filePath, 'yan-zhi drop test', 'utf8');
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    try { fs.rmSync(filePath, { force: true }); } catch { /* ignore */ }
  });

  it('Input.dispatchDragEvent 能把真实本地文件交给自定义 drop zone', async () => {
    await page.setContent(`<!doctype html><div id="drop" style="width:320px;height:180px;background:#eee">drop</div>
      <script>
        window.__dropped = null;
        const zone = document.getElementById('drop');
        for (const type of ['dragenter','dragover','drop']) {
          zone.addEventListener(type, (e) => {
            e.preventDefault();
            if (type === 'drop') {
              window.__dropped = {
                files: [...e.dataTransfer.files].map(f => ({ name: f.name, size: f.size })),
                items: [...e.dataTransfer.items].map(i => ({ kind: i.kind, type: i.type })),
              };
            }
          });
        }
      </script>`);
    const box = await page.locator('#drop').boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const cdp = await context.newCDPSession(page);
    const data = { items: [], files: [filePath], dragOperationsMask: 1 };
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
    await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
    await expect.poll(() => page.evaluate(() => (window as any).__dropped)).toEqual({
      files: [{ name: path.basename(filePath), size: Buffer.byteLength('yan-zhi drop test') }],
      items: [{ kind: 'file', type: 'text/plain' }],
    });
  });

  it('flattened DOM 能找到 Shadow DOM 里的 input[type=file] 并注入文件', async () => {
    await page.setContent(`<!doctype html><div id="host"></div>
      <script>
        window.__picked = '';
        const root = document.getElementById('host').attachShadow({ mode: 'open' });
        root.innerHTML = '<input id="f" type="file">';
        root.querySelector('#f').addEventListener('change', (e) => {
          window.__picked = e.target.files[0]?.name || '';
        });
      </script>`);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    const { nodes } = await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
    let target = null as any;
    for (const node of nodes) {
      const attrs = node.attributes || [];
      const typeAt = attrs.indexOf('type');
      if (String(node.nodeName || '').toUpperCase() === 'INPUT' && typeAt >= 0 && attrs[typeAt + 1] === 'file') {
        target = node;
        break;
      }
    }
    expect(target, 'flattened DOM 未找到 Shadow DOM file input').toBeTruthy();
    await cdp.send('DOM.setFileInputFiles', { files: [filePath], nodeId: target.nodeId });
    await expect.poll(() => page.evaluate(() => (window as any).__picked)).toBe(path.basename(filePath));
  });

  it('延迟创建的 blob 下载仍能被 download 事件捕获并落盘', async () => {
    await page.setContent(`<!doctype html><button id="go">download</button>
      <script>
        document.getElementById('go').onclick = () => setTimeout(() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['delayed download body'], { type: 'text/plain' }));
          a.download = 'delayed-blob.txt';
          a.click();
        }, 120);
      </script>`);
    const event = page.waitForEvent('download', { timeout: 5000 });
    await page.click('#go');
    const download = await event;
    const saved = path.join(os.tmpdir(), `yz-download-${Date.now()}-${download.suggestedFilename()}`);
    await download.saveAs(saved);
    expect(download.suggestedFilename()).toBe('delayed-blob.txt');
    expect(fs.readFileSync(saved, 'utf8')).toBe('delayed download body');
    fs.rmSync(saved, { force: true });
  });

  it('iframe 里创建的 blob 下载也能被页面外层的 download 事件捕获', async () => {
    await page.setContent(`<!doctype html><iframe id="f" srcdoc="
      <button id='go'>download in frame</button>
      <script>
        document.getElementById('go').onclick = () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['iframe download body'], { type: 'text/plain' }));
          a.download = 'iframe-blob.txt';
          a.click();
        };
      </script>"></iframe>`);
    const event = page.waitForEvent('download', { timeout: 5000 });
    await page.frameLocator('#f').locator('#go').click();
    const download = await event;
    expect(download.suggestedFilename()).toBe('iframe-blob.txt');
  });
});
