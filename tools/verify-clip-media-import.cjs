// 验证素材导入闭环：登记真实路径 → 落库 → 素材栏出现 → 拖入时间轴可用。
// 桌面端有 dialog.showOpenFiles（原生选择器），Web/headless 下没有 → 也无法自动点原生框。
// 因此：① 断言 UI 入口与文案正确；② 直接调接口验证「登记链路」；③ 断言素材栏能渲染出来。
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const ORIGIN = 'http://127.0.0.1:5188'; const PORT = 9384;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/clip-verify';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 造一个真实存在的素材文件（导入登记要求路径真实可用）
  const mediaDir = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/_verify_data/demo-media';
  fs.mkdirSync(mediaDir, { recursive: true });
  const demoMp4 = path.join(mediaDir, 'demo-clip.mp4').replace(/\\/g, '/');
  if (!fs.existsSync(demoMp4)) fs.writeFileSync(demoMp4, Buffer.alloc(2048, 7));

  const udd = path.join(os.tmpdir(), 'yz-imp-' + Date.now());
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let ws; const pend = new Map(); let seq = 0; const exceptions = [];
  const send = (m, p) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
  try {
    let page = null;
    for (let i = 0; i < 40; i++) { await sleep(500);
      try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find((t) => t.type === 'page'); if (page) break; } catch {} }
    if (!page) throw new Error('CDP 未就绪');
    if (/app\.asar|^file:/.test(page.url)) throw new Error('误连壳窗口：' + page.url);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.text || 'ex'); };
    const evalJs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 250) };
      return r.result.value; };
    const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); };

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){}` });

    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4200);
    let arrived = false;
    for (let i = 0; i < 5; i++) {
      await send('Page.navigate', { url: ORIGIN + '/#/clip' }); await sleep(2200);
      const ok = await evalJs(`(async()=>{try{
        const lic=await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/license.ts');
        const s=lic.useLicenseStore(); s.verified=true; s.initialized=true;
        const md=await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/mode.ts');
        md.setLicensedModes(['office','wf','dev','clip']); return location.hash;}catch(e){return 'E'+e.message}})()`);
      await sleep(1600);
      if (ok === '#/clip') { arrived = true; break; }
    }

    // 建项目 → 进编辑视图 → 检查素材栏入口
    const setup = await evalJs(`(async () => {
      const out = {};
      const nb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('新建项目'));
      if (nb) { nb.click(); await new Promise(r=>setTimeout(r,900));
        const cb = [...document.querySelectorAll('.el-dialog .cp-btn')].find(x=>x.textContent.includes('创建并开始剪辑'));
        if (cb) { cb.click(); await new Promise(r=>setTimeout(r,4200)); } }
      out.editorVisible = !!document.querySelector('.cp-body') && getComputedStyle(document.querySelector('.cp-body')).display !== 'none';
      // 素材栏导入按钮
      const impBtn = [...document.querySelectorAll('.cp-left .cp-mini')].find(b=>(b.getAttribute('title')||'').includes('导入素材'));
      out.hasImportBtn = !!impBtn;
      out.emptyText = document.querySelector('.cp-left .cp-empty')?.textContent?.trim().replace(/\\s+/g,' ') || null;
      out.hasNoFakePlus = !(out.emptyText||'').includes('用「+」上传');
      // 编辑视图的项目目录标签
      out.dirTag = document.querySelector('.cp-dir-tag')?.textContent?.trim().replace(/\\s+/g,' ') || null;
      out.dirTitle = document.querySelector('.cp-dir-tag')?.getAttribute('title')?.slice(0, 60) || null;
      const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
      out.convId = cst.useChatStore().currentConvId;
      return out;
    })()`);
    await shot('imp-1-editor-left.png');

    // 走登记链路（模拟选择器返回路径后的那段）——验证素材真的进库并出现在素材栏
    const registered = await evalJs(`(async () => {
      const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      if (!cid) return 'no-conv';
      const r = await fetch('/api/conversations/'+encodeURIComponent(cid)+'/files', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:'demo-clip.mp4', path:${JSON.stringify(demoMp4)}, category:'upload', source:'user' }) });
      const j = await r.json().catch(()=>({}));
      // 触发页面刷新素材（等价于点刷新按钮）
      const rb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('刷新'));
      if (rb) { rb.click(); await new Promise(x=>setTimeout(x,3200)); }
      const items = [...document.querySelectorAll('.cp-media-item')].map(e=>e.querySelector('.cp-media-name')?.textContent);
      const cnt = document.querySelector('.cp-left .cp-count')?.textContent;
      return { putStatus: r.status, savedId: j?.data?.id || null, savedCategory: j?.data?.category || null,
        mediaItems: items, mediaCountLabel: cnt };
    })()`);
    await shot('imp-2-media-imported.png');

    // 双击素材 → 应进入时间轴
    const toTimeline = await evalJs(`(async () => {
      const it = document.querySelector('.cp-media-item');
      if (!it) return 'no-item';
      it.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true, view:window }));
      await new Promise(r=>setTimeout(r,3200));
      return { domClips: document.querySelectorAll('.cp-clip').length,
        meta: document.querySelector('.cp-meta')?.textContent?.trim().replace(/\\s+/g,' ') };
    })()`);
    await shot('imp-3-on-timeline.png');

    console.log(JSON.stringify({ arrived, setup, registered, toTimeline, exceptions: exceptions.slice(0,4) }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();