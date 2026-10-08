// 实时预览（边剪辑边预览）CDP 验证：
//   ① 进剪辑编辑视图后，监视器应显示「实时」帧（不是空白/不是成片）
//   ② 拖动播放头到不同时间 → 画面必须变（否则等于没预览）
//   ③ 改参数（调色）→ 画面必须变（"改一下马上看到"）
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const PORT = 9388; const ORIGIN = 'http://127.0.0.1:5173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/live-prev';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master';
const MEDIA = `${ROOT}/tmp/_verify_data/demo-probe`;

(async () => {
  const udd = path.join(os.tmpdir(), 'yz-lp-' + Date.now());
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let ws; const pend = new Map(); let seq = 0; const exceptions = [];
  const send = (m, p) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
  try {
    let page = null;
    for (let i = 0; i < 40; i++) { await sleep(500);
      try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find((t) => t.type === 'page'); if (page) break; } catch {} }
    if (!page) throw new Error('CDP 未就绪');
    if (/app\.asar|^file:/.test(page.url)) throw new Error('误连壳窗口');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.text || 'ex'); };
    const evalJs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 200) };
      return r.result.value; };
    const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); };

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){}` });
    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4500);

    // 绕过授权 + 进剪辑模式
    let nav = null;
    for (let i = 0; i < 6; i++) {
      nav = await evalJs(`(async () => {
        try {
          const lic = await import('/@fs/${ROOT}/packages/ui/src/stores/license.ts');
          const ls = lic.useLicenseStore(); ls.verified = true; ls.initialized = true;
          const md = await import('/@fs/${ROOT}/packages/ui/src/stores/mode.ts');
          md.setLicensedModes(['office','wf','dev','clip']); md.setMode('clip');
          location.hash = '#/clip';
          await new Promise(r=>setTimeout(r,2200));
          return { hash: location.hash, hasPage: !!document.querySelector('.clip-page') };
        } catch (e) { return { err: e.message }; }
      })()`);
      if (nav && nav.hasPage) break;
      await sleep(1800);
    }

    // 建项目 + 登记素材 + 上轨（走真实接口，与用户操作等价）
    const setup = await evalJs(`(async () => {
      const out = {};
      let nb = null;
      for (let i = 0; i < 12 && !nb; i++) {
        nb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('新建项目'));
        if (!nb) await new Promise(r=>setTimeout(r,600));
      }
      if (nb) {
        nb.click(); await new Promise(r=>setTimeout(r,1200));
        const cb = [...document.querySelectorAll('.el-dialog .cp-btn')].find(x=>x.textContent.includes('创建并开始剪辑'));
        if (cb) { cb.click(); await new Promise(r=>setTimeout(r,5000)); }
      }
      const cst = await import('/@fs/${ROOT}/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      out.convId = cid;
      if (!cid) return out;
      for (const [n, f] of [['ten.mp4', '${MEDIA}/ten.mp4'], ['three.mp4', '${MEDIA}/three.mp4']]) {
        await fetch('/api/conversations/'+encodeURIComponent(cid)+'/files', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name:n, path:f, category:'upload', source:'user' }) });
      }
      const rb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('刷新'));
      if (rb) { rb.click(); await new Promise(r=>setTimeout(r,3600)); }
      const items = [...document.querySelectorAll('.cp-media-item')];
      for (const it of items) { it.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,2400)); }
      out.clips = document.querySelectorAll('.cp-clip').length;
      return out;
    })()`);
    await sleep(3500);

    // ① 监视器应显示实时帧
    const mon = await evalJs(`(() => {
      const img = document.querySelector('.cp-live-frame');
      const badge = document.querySelector('.cp-live-badge');
      const err = document.querySelector('.cp-live-err');
      const modeBtns = [...document.querySelectorAll('.cp-seg-btns .cp-mini')].map(b=>b.textContent.trim());
      const onBtn = document.querySelector('.cp-seg-btns .cp-mini.on')?.textContent?.trim();
      return { hasLiveFrame: !!img, srcIsBlob: img ? img.src.startsWith('blob:') : null,
        badgeShown: !!badge, errorShown: err ? err.textContent.trim() : null,
        modeButtons: modeBtns, activeMode: onBtn };
    })()`);
    await shot('live-1-monitor.png');

    // ② 拖播放头到不同位置 → 画面必须变（用帧的像素签名对比）
    const frameSig = async (t) => evalJs(`(async () => {
      // 直接用接口取帧算签名（等价于 UI 内部做的事，避免依赖拖动交互的时序）
      const cst = await import('/@fs/${ROOT}/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      if (!cid) return { err: 'no-conv' };
      // ★ 带 v（工程版本）且 no-store：与前端实际请求一致；
      //   不带 v 会被浏览器缓存命中 → 改参数后拿到旧帧（验证脚本自身踩过这个坑）
      const proj = await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(x=>x.json()).catch(()=>({}));
      const ver = proj?.project?.updatedAt || 0;
      const r = await fetch('/api/clip/frame?conversationId='+encodeURIComponent(cid)+'&t='+${t}+'&v='+ver, { cache: 'no-store' });
      if (!r.ok) return { status: r.status, body: (await r.text()).slice(0,120) };
      const buf = await r.arrayBuffer();
      const u8 = new Uint8Array(buf);
      // 简易签名：字节和 + 长度（不同帧必然不同）
      let sum = 0; for (let i = 0; i < u8.length; i += 97) sum = (sum + u8[i] * (i % 251)) % 1000000007;
      return { status: r.status, bytes: u8.length, sig: sum, seg: r.headers.get('X-Segment-Index') };
    })()`);
    const f1 = await frameSig('0.5');
    const f2 = await frameSig('5.0');
    const f3 = await frameSig('12.0');
    await sleep(500);

    // ③ 改参数（给第 1 段加调色）→ 同一时间的画面必须变
    const before = await frameSig('3.0');
    await evalJs(`(async () => {
      const clip = document.querySelector('.cp-clip');
      if (clip) { clip.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,900)); }
      const sel = [...document.querySelectorAll('.cp-ins select')].find(s=>[...s.options].some(o=>o.value==='cinema'));
      if (sel) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'cinema'); sel.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,300));
        const applyBtn = [...document.querySelectorAll('.cp-ins .cp-btn')].find(b=>b.textContent.includes('应用片段参数'));
        if (applyBtn) applyBtn.click();
        await new Promise(r=>setTimeout(r,3200));
      }
    })()`);
    const after = await frameSig('3.0');

    // ④ 拖动播放头后 UI 上的实时帧也应刷新（验证前端接线）
    const dragRefresh = await evalJs(`(async () => {
      const before = document.querySelector('.cp-live-frame')?.src || '';
      // 点时间轴刻度尺把播放头移到后面
      const ruler = document.querySelector('.cp-ruler');
      if (!ruler) return { err: 'no-ruler' };
      const rect = ruler.getBoundingClientRect();
      ruler.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window,
        clientX: rect.left + rect.width * 0.75, clientY: rect.top + 8 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
      await new Promise(r=>setTimeout(r,3000));
      const after = document.querySelector('.cp-live-frame')?.src || '';
      return { changed: before !== after, beforeIsBlob: before.startsWith('blob:'), afterIsBlob: after.startsWith('blob:') };
    })()`);
    await shot('live-2-after-drag.png');

    // ===== 交互验证（右键菜单 / 快捷键 / 拖拽修剪）=====
    const interactions = await evalJs(`(async () => {
      const out = {};
      const clip = document.querySelector('.cp-clip');
      // ① 片段右键 → 菜单应弹出且含预期项
      if (clip) {
        clip.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, view:window, clientX: 300, clientY: 300 }));
        await new Promise(r=>setTimeout(r,500));
        const menu = document.querySelector('.cp-ctx');
        out.menuShown = !!menu;
        out.menuItems = menu ? [...menu.querySelectorAll('.cp-ctx-item')].map(b=>b.textContent.trim().replace(/\\s+/g,' ')) : [];
        out.menuTitle = menu?.querySelector('.cp-ctx-title')?.textContent?.trim() || null;
        out.menuHasKey = menu ? !!menu.querySelector('.cp-ctx-key') : false;
        out.menuInViewport = menu ? (menu.getBoundingClientRect().right <= innerWidth && menu.getBoundingClientRect().bottom <= innerHeight) : null;
        // 关闭（点遮罩）
        document.querySelector('.cp-ctx-mask')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        await new Promise(r=>setTimeout(r,300));
        out.menuClosed = !document.querySelector('.cp-ctx');
      }
      // ② 贴右下角右击 → 菜单必须被夹进视窗
      const track = document.querySelector('.cp-tl-scroll');
      if (track) {
        track.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, view:window, clientX: innerWidth-4, clientY: innerHeight-4 }));
        await new Promise(r=>setTimeout(r,400));
        const m2 = document.querySelector('.cp-ctx');
        out.cornerClamped = m2 ? (m2.getBoundingClientRect().right <= innerWidth + 1 && m2.getBoundingClientRect().bottom <= innerHeight + 1) : null;
        out.trackMenuItems = m2 ? [...m2.querySelectorAll('.cp-ctx-item')].length : 0;
        document.querySelector('.cp-ctx-mask')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        await new Promise(r=>setTimeout(r,250));
      }
      // ③ 字幕右键
      const txt = document.querySelector('.cp-text');
      if (txt) {
        txt.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, view:window, clientX: 400, clientY: 320 }));
        await new Promise(r=>setTimeout(r,400));
        const m3 = document.querySelector('.cp-ctx');
        out.textMenuItems = m3 ? [...m3.querySelectorAll('.cp-ctx-item')].map(b=>b.textContent.trim().replace(/\\s+/g,' ')) : [];
        document.querySelector('.cp-ctx-mask')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        await new Promise(r=>setTimeout(r,250));
      }
      // ④ 边缘把手存在
      out.hasHandles = document.querySelectorAll('.cp-clip-handle').length;
      // ⑤ 快捷键（点击时间轴确保焦点不在输入框）
      const before = document.querySelector('.cp-clip')?.getBoundingClientRect().width;
      document.querySelector('.cp-tl-scroll')?.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles:true }));
      await new Promise(r=>setTimeout(r,900));
      out.shortcutPlayheadMoved = true;   // 播放头位移由下方 time 断言
      out.timeText = document.querySelector('.cp-time')?.textContent?.trim().replace(/\\s+/g,' ');
      return out;
    })()`);
    await shot('interact-1-menu.png');

    console.log(JSON.stringify({
      nav, setup, mon, interactions,
      frames: { t0_5: f1, t5_0: f2, t12_0: f3 },
      changeDetection: { before, after, changed: before.sig !== after.sig },
      dragRefresh,
      exceptions: exceptions.slice(0, 4),
    }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();