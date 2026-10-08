// 验证剪辑工作台：素材时长真实化 + 效果库接入 + 项目目录/素材导入入口。
// 连的是用户 dev 实例（Electron 1420），用其自身的远程调试端口。
const fs = require('node:fs');
const path = require('node:path');
const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/clip-verify';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 自 spawn 独立 Chrome 连 web 实例（skill 铁律：不复用别人的调试端口）
  const { spawn } = require('node:child_process');
  const os = require('node:os');
  const PORT = 9386; const ORIGIN = 'http://127.0.0.1:5173';
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const udd = path.join(os.tmpdir(), 'yz-clipv-' + Date.now());
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 40; i++) { await sleep(500);
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find((t) => t.type === 'page'); if (page) break; } catch {} }
  if (!page) { console.log(JSON.stringify({ fatal: 'CDP 未就绪' })); try{chrome.kill();}catch{} return; }
  if (/app\.asar|^file:/.test(page.url)) { console.log(JSON.stringify({ fatal: '误连壳窗口' })); try{chrome.kill();}catch{} return; }

  let ws; const pend = new Map(); let seq = 0; const exceptions = [];
  const send = (m, p) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      exceptions.push({ text: d.text, desc: String(d.exception?.description || '').slice(0, 400),
        at: (d.stackTrace?.callFrames || []).slice(0, 4).map(f => `${f.functionName || '(anon)'}@${String(f.url).split('/').pop()}:${f.lineNumber}`) });
    } };
  const evalJs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 200) };
    return r.result.value; };
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); };

  try {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){};window.__unh=[];addEventListener('unhandledrejection',e=>{try{window.__unh.push(String((e.reason&&(e.reason.stack||e.reason.message))||e.reason).slice(0,500));}catch(x){}});` });
    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4500);

    // ★ 绕过授权门禁（与既有 UI 验证脚本同一手法）+ 切剪辑模式
    //   门禁在 router.beforeEach 里 await licenseStore.init()，必须把 verified 置真。
    let nav = null;
    for (let i = 0; i < 6; i++) {
      nav = await evalJs(`(async () => {
        try {
          const lic = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/license.ts');
          const ls = lic.useLicenseStore(); ls.verified = true; ls.initialized = true;
          const md = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/mode.ts');
          md.setLicensedModes(['office','wf','dev','clip']);
          md.setMode('clip');
          location.hash = '#/clip';
          await new Promise(r=>setTimeout(r,2200));
          return { hash: location.hash, hasPage: !!document.querySelector('.clip-page') };
        } catch (e) { return { err: e.message }; }
      })()`);
      if (nav && nav.hasPage) break;
      await sleep(1800);
    }
    await sleep(2000);

    // 建项目 → 导入素材 → 检查时间轴时长
    const flow = await evalJs(`(async () => {
      const out = {};
      // 等项目列表渲染出「新建项目」（列表数据是异步拉的）
      let nb = null;
      for (let i = 0; i < 12 && !nb; i++) {
        nb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('新建项目'));
        if (!nb) await new Promise(r=>setTimeout(r,600));
      }
      out.foundNewBtn = !!nb;
      if (nb) {
        nb.click(); await new Promise(r=>setTimeout(r,1200));
        const cb = [...document.querySelectorAll('.el-dialog .cp-btn')].find(x=>x.textContent.includes('创建并开始剪辑'));
        out.foundCreateBtn = !!cb;
        if (cb) { cb.click(); await new Promise(r=>setTimeout(r,5000)); }
      }
      out.dialogSeen = !!document.querySelector('.el-dialog');
      // ★ 直接复现 createConversation 的那次 POST，拿到接口真实返回
      try {
        const probe = await fetch('/api/conversations', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ title:'探针', mode:'clip' }) });
        const pj = await probe.json().catch(()=>({}));
        out.rawStatus = probe.status;
        out.rawKeys = Object.keys(pj);
        out.rawErr = pj.error || null;
        out.rawHasId = !!(pj?.data?.id || pj?.id);
      } catch (e) { out.rawThrown = String(e.message); }
      out.toast = document.querySelector('.cp-toast')?.textContent?.trim() || null;
      out.elMessage = [...document.querySelectorAll('.el-message')].map(e=>e.textContent.trim()).slice(0,3);
      out.editorVisible = !!document.querySelector('.cp-body') && getComputedStyle(document.querySelector('.cp-body')).display!=='none';
      const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      out.convId = cid;
      if (!cid) return out;
      // 素材：引用式登记（与「导入素材」同路径）
      await fetch('/api/conversations/'+encodeURIComponent(cid)+'/files', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:'ten.mp4', path:'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/_verify_data/demo-probe/ten.mp4', category:'upload', source:'user' }) });
      await fetch('/api/conversations/'+encodeURIComponent(cid)+'/files', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:'three.mp4', path:'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/_verify_data/demo-probe/three.mp4', category:'upload', source:'user' }) });
      const rb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('刷新'));
      if (rb) { rb.click(); await new Promise(r=>setTimeout(r,3600)); }
      out.mediaCount = document.querySelectorAll('.cp-media-item').length;
      // 双击两个素材上轨
      const items = [...document.querySelectorAll('.cp-media-item')];
      for (const it of items) { it.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,2200)); }
      return out;
    })()`);
    await sleep(3500);

    // ★ 核心断言：时间轴总时长应约 13.5s（10 + 3.5），而不是 10s（2×5）
    const timeline = await evalJs(`(() => {
      const clips = [...document.querySelectorAll('.cp-clip')].map(e=>({
        name: e.querySelector('.cp-clip-name')?.textContent,
        w: Math.round(e.getBoundingClientRect().width),
        dur: e.querySelector('.cp-seg-dur')?.textContent || e.textContent.match(/[\\d.]+s/)?.[0] }));
      return { clipCount: clips.length, clips,
        meta: document.querySelector('.cp-meta')?.textContent?.trim().replace(/\\s+/g,' '),
        left: document.querySelector('.cp-prop')?.textContent?.trim() };
    })()`);
    await shot('fix-1-timeline-duration.png');

    // ★ 蒙版面板 + 字幕样式模板（用户问「蒙版/字幕不能建立？」的核心验证）
    const maskPanel = await evalJs(`(async () => {
      const clip = document.querySelector('.cp-clip');
      if (clip) { clip.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,900)); }
      // 展开蒙版分组
      const grp = [...document.querySelectorAll('.cp-grp-head')].find(h=>h.textContent.includes('蒙版'));
      if (grp) { grp.click(); await new Promise(r=>setTimeout(r,600)); }
      const body = document.querySelector('.cp-grp-body');
      const shapeBtns = [...document.querySelectorAll('.cp-grp-body .cp-preset')].map(b=>b.textContent.trim());
      return { grpFound: !!grp, opened: !!body && getComputedStyle(body).display!=='none',
        presetCount: shapeBtns.length, hasCircle: shapeBtns.includes('圆形'), hasHeart: shapeBtns.includes('心形'),
        hasGreenKey: shapeBtns.includes('绿幕抠像'), hasKeyBlue: shapeBtns.includes('蓝幕抠像') };
    })()`);
    await shot('fix-3-mask-panel.png');

    const textStyles = await evalJs(`(async () => {
      // 先用工具条按钮加一条字幕（这也是"字幕能否建立"的直接验证）
      let txt = document.querySelector('.cp-text');
      if (!txt) {
        const addBtn = [...document.querySelectorAll('.cp-mini')].find(b => (b.getAttribute('title')||'').includes('添加一条字幕'));
        if (addBtn) { addBtn.click(); await new Promise(r=>setTimeout(r,2800)); }
        txt = document.querySelector('.cp-text');
      }
      if (!txt) return { noText: true, added: false };
      txt.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      await new Promise(r=>setTimeout(r,900));
      const labels = [...document.querySelectorAll('.cp-ins .cp-preset')].map(b=>b.textContent.trim());
      return { added: true, textCount: document.querySelectorAll('.cp-text').length, styleCount: labels.length,
        samples: labels.slice(0,8), hasVlog: labels.includes('Vlog 大字'), hasTag: labels.includes('标签底板') };
    })()`);
    await shot('fix-4-text-styles.png');

    // 效果库接入：调色下拉应按分组列出全部效果
    const effects = await evalJs(`(async () => {
      const it = document.querySelector('.cp-clip');
      if (it) { it.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,900)); }
      const sel = [...document.querySelectorAll('.cp-ins select')].find(s=>[...s.options].some(o=>o.value==='cinema'));
      if (!sel) return { found: false, options: [...document.querySelectorAll('.cp-ins option')].map(o=>o.value) };
      return { found: true, optionCount: sel.options.length,
        groups: [...sel.querySelectorAll('optgroup')].map(g=>g.label),
        samples: [...sel.options].slice(0,10).map(o=>o.value+':'+o.textContent) };
    })()`);
    await shot('fix-2-effects.png');

    const unh = await evalJs('window.__unh || []');
    console.log(JSON.stringify({ nav, flow, timeline, maskPanel, textStyles, effects, unhandled: unh, exceptions: exceptions.slice(0,5) }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();