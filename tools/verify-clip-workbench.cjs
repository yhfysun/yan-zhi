// 剪辑工作台最终验证：
//  1) 草稿态（无会话）→ 模拟真实拖放投素材 → 断言自动建会话 + 片段落库（验证 ensureConversation 修复）
//  2) 非空态时间轴元素真实渲染（片段/字幕/BGM/播放头/刻度）
//  3) 响应式多宽度扫描 + 截图
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:5188';
const PORT = 9379;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/clip-verify';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'yz-cdp-v-' + Date.now());
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
  let ws; const pending = new Map(); let seq = 0;
  const exceptions = []; const consoleErrs = [];
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    let page = null;
    for (let i = 0; i < 40; i++) { await sleep(500);
      try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        page = l.find((t) => t.type === 'page'); if (page) break; } catch {} }
    if (!page) throw new Error('CDP 未就绪');
    if (/app\.asar|^file:/.test(page.url)) throw new Error('误连壳窗口，中止：' + page.url);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
        if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.text || 'ex');
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        consoleErrs.push((m.params.args || []).map((a) => a.value ?? '').join(' ').slice(0, 150)); };
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 300) };
      return r.result.value;
    };
    const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); };

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){}` });

    // 进应用 → 直达 /clip（草稿态：清掉 ctx）
    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4000);
    let arrived = false;
    for (let i = 0; i < 5; i++) {
      await send('Page.navigate', { url: ORIGIN + '/#/clip' }); await sleep(2200 + i * 700);
      const ok = await evalJs(`(async()=>{try{
        const lic = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/license.ts');
        const s = lic.useLicenseStore(); s.verified = true; s.initialized = true;
        const md = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/mode.ts');
        md.setLicensedModes(['office','wf','dev','clip']);
        return location.hash; }catch(e){return 'ERR'+e.message}})()`);
      await sleep(1800);
      if (ok === '#/clip') { arrived = true; break; }
    }

    // 等挂载后重置为草稿态
    const draft = await evalJs(`(async () => {
      try {
        const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
        const st = cst.useChatStore();
        st.currentConvId = '';
        try { const f = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/file.ts');
          f.useFileStore().clear?.(); } catch {}
        return { draftConvId: st.currentConvId, domClips: document.querySelectorAll('.cp-clip').length };
      } catch(e){ return { err: e.message }; }
    })()`);
    await sleep(1500);
    await shot('clip-empty.png');

    // ★ 模拟真实拖放：往时间轴 drop 一个素材路径（走 onDropTrack → appendClip → ensureConversation）
    const dropped = await evalJs(`(async () => {
      try {
        const track = document.querySelector('.cp-tl-scroll');
        if (!track) return 'no-track';
        const dt = new DataTransfer();
        dt.setData('text/plain', 'C:/tmp/clip-a.mp4');
        track.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await new Promise(r=>setTimeout(r,3000));
        const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
        const st = cst.useChatStore();
        const cid = st.currentConvId;
        let saved = null;
        if (cid) saved = await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(r=>r.json()).catch(e=>({err:String(e)}));
        return { convIdAfterDrop: cid, savedExists: saved?.exists, savedClips: saved?.project?.clips?.length,
          domClips: document.querySelectorAll('.cp-clip').length };
      } catch(e){ return { err: e.message }; }
    })()`);
    await sleep(800);

    // 再补两段 + 字幕 + BGM（直接写工程，模拟剪辑师在对话里补齐），然后重载看渲染
    const seeded = await evalJs(`(async () => {
      try {
        const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
        const cid = cst.useChatStore().currentConvId;
        if (!cid) return 'no-conv';
        const proj = { version:1, name:'验证片', updatedAt: Date.now(), output:{size:'1080x1920',fps:30},
          clips:[{id:'c1',file:'C:/tmp/clip-a.mp4',label:'开场',trimStart:0,trimEnd:4},
                 {id:'c2',file:'C:/tmp/clip-b.mp4',label:'中段',speed:2,colorPreset:'cool'},
                 {id:'c3',file:'C:/tmp/pic-c.png',label:'收尾图',kenburns:{direction:'in',duration:3}}],
          texts:[{id:'t1',text:'片头标题',start:0,end:2.5,animation:'zoom'},
                 {id:'t2',text:'中段解说词',start:3,end:6,animation:'karaoke',safeArea:true}],
          bgm:{file:'C:/tmp/bgm.mp3',volume:0.3,duck:true} };
        const r = await fetch('/api/clip/project', { method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ conversationId: cid, project: proj }) });
        return 'put-'+r.status;
      } catch(e){ return 'ERR:'+e.message; }
    })()`);
    await sleep(1000);
    // SPA 内点刷新按钮（走组件的 reloadAll，验证"刷新读取"这条路径）
    await evalJs(`(() => { const b=[...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('刷新')); if(b) b.click(); return !!b; })()`);
    await sleep(2500);

    const filled = await evalJs(`(() => {
      const cnt = (s) => document.querySelectorAll(s).length;
      return {
        clips: [...document.querySelectorAll('.cp-clip')].map(e => ({
          name: e.querySelector('.cp-clip-name')?.textContent,
          w: Math.round(e.getBoundingClientRect().width),
          tags: [...e.querySelectorAll('.cp-clip-tags em')].map(t=>t.textContent) })),
        texts: [...document.querySelectorAll('.cp-text')].map(e => ({
          txt: e.querySelector('.cp-text-txt')?.textContent,
          anim: e.querySelector('.cp-text-anim')?.textContent,
          w: Math.round(e.getBoundingClientRect().width) })),
        audioBar: cnt('.cp-audio'), playhead: cnt('.cp-playhead'), ticks: cnt('.cp-tick'), labels: cnt('.cp-tl-label'),
        nameInput: document.querySelector('.cp-name-input')?.value,
        meta: document.querySelector('.cp-meta')?.textContent?.trim(),
        monitorW: Math.round(document.querySelector('.cp-monitor-stage')?.getBoundingClientRect().width||0),
        monitorH: Math.round(document.querySelector('.cp-monitor-stage')?.getBoundingClientRect().height||0),
        tlH: Math.round(document.querySelector('.cp-tl')?.getBoundingClientRect().height||0),
        leftEmptyText: document.querySelector('.cp-left .cp-empty')?.textContent?.trim().slice(0,40),
      };
    })()`);
    await shot('clip-filled.png');

    // 选中一个片段 → 属性面板应切到片段参数
    const inspector = await evalJs(`(async () => {
      const el = document.querySelector('.cp-clip');
      if (!el) return 'no-clip';
      el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
      await new Promise(r=>setTimeout(r,700));
      const ins = document.querySelector('.cp-ins');
      return { title: ins?.querySelector('.cp-ins-title')?.textContent?.trim(),
        fields: [...ins.querySelectorAll('.cp-field > label')].map(l=>l.textContent.trim().split(' ')[0]),
        activeTab: document.querySelector('.cp-tab.on')?.textContent?.trim() };
    })()`);
    await shot('clip-inspector.png');

    // 响应式扫描
    const resp = [];
    for (const w of [1600, 1100, 900, 768, 640, 400]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(900);
      resp.push(await evalJs(`(() => {
        const overflowing = [];
        for (const el of document.querySelectorAll('.cp-top *,.cp-left *,.cp-center *,.cp-right *')) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.right > innerWidth + 3) {
            let p = el.parentElement, inSc = false;
            while (p && p !== document.body) { const cs = getComputedStyle(p);
              if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { inSc = true; break; } p = p.parentElement; }
            if (!inSc) overflowing.push((el.className||el.tagName)+':'+Math.round(b.right));
          }
        }
        const squished = [];
        for (const el of document.querySelectorAll('.cp-top span,.cp-left span,.cp-left div,.cp-hint,.cp-track-label,.cp-clip-name')) {
          const b = el.getBoundingClientRect();
          const hasText = [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim().length>3);
          if (hasText && b.width>0 && b.width<70 && b.height>b.width*3) squished.push(el.textContent.trim().slice(0,18));
        }
        return { w: innerWidth, pageOver: document.body.scrollWidth > innerWidth+2,
          overflowing: overflowing.slice(0,5), squished: squished.slice(0,5),
          leftVisible: getComputedStyle(document.querySelector('.cp-left')).display !== 'none',
          monitorW: Math.round(document.querySelector('.cp-monitor-stage')?.getBoundingClientRect().width||0) };
      })()`));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(800);

    console.log(JSON.stringify({ arrived, draft, dropped, seeded, filled, inspector, responsive: resp,
      exceptions: exceptions.slice(0,6), consoleErrs: consoleErrs.slice(0,6) }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e), exceptions: exceptions.slice(0,5) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();