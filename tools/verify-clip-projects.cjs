// 剪辑项目管理 CDP 验证：
//  ① 进 /clip 默认是项目列表（不是空白时间轴）
//  ② 点「新建项目」→ 选画幅 → 创建 → 进编辑视图，且规格落库
//  ③ 返回列表 → 卡片显示段数/时长/规格/时间
//  ④ 规格在编辑页**不可改**（只读展示）
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const ORIGIN = 'http://127.0.0.1:5188'; const PORT = 9381;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/clip-verify';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const udd = path.join(os.tmpdir(), 'yz-pj-' + Date.now());
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
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 300) };
      return r.result.value; };
    const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); };

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){}` });

    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4000);
    let arrived = false;
    for (let i = 0; i < 5; i++) {
      await send('Page.navigate', { url: ORIGIN + '/#/clip' }); await sleep(2200 + i * 700);
      const ok = await evalJs(`(async()=>{try{
        const lic=await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/license.ts');
        const s=lic.useLicenseStore(); s.verified=true; s.initialized=true;
        const md=await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/mode.ts');
        md.setLicensedModes(['office','wf','dev','clip']); return location.hash;}catch(e){return 'E'+e.message}})()`);
      await sleep(1800);
      if (ok === '#/clip') { arrived = true; break; }
    }

    // ② 进模式默认视图
    await sleep(1800);
    const initial = await evalJs(`(() => ({
      projectsVisible: !!document.querySelector('.cp-projects') && getComputedStyle(document.querySelector('.cp-projects')).display !== 'none',
      editorVisible: (() => { const el = document.querySelector('.cp-body'); return !!el && getComputedStyle(el).display !== 'none'; })(),
      headTitle: document.querySelector('.cp-pj-title')?.textContent?.trim(),
      cardCount: document.querySelectorAll('.cp-pj-card').length,
      newBtn: [...document.querySelectorAll('.cp-btn')].some(b => b.textContent.includes('新建项目')),
    }))()`);
    await shot('pj-1-list.png');

    // ③ 打开新建对话框并选横屏
    const dlg = await evalJs(`(async () => {
      const b = [...document.querySelectorAll('.cp-btn')].find(x => x.textContent.includes('新建项目'));
      if (!b) return 'no-btn';
      b.click();
      await new Promise(r=>setTimeout(r,900));
      const presets = [...document.querySelectorAll('.cp-preset')].map(p => p.textContent.trim().replace(/\\s+/g,' '));
      // 选「横屏 16:9」
      const target = [...document.querySelectorAll('.cp-preset')].find(p => p.textContent.includes('横屏'));
      target && target.click();
      await new Promise(r=>setTimeout(r,300));
      const nameInput = document.querySelector('.el-dialog .cp-input');
      if (nameInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(nameInput, '横屏项目A');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise(r=>setTimeout(r,300));
      return { presetCount: presets.length, presets, chosen: [...document.querySelectorAll('.cp-preset.on')].map(p=>p.textContent.trim().replace(/\\s+/g,' '))[0],
        dialogTitle: document.querySelector('.el-dialog__title')?.textContent?.trim() };
    })()`);
    await shot('pj-2-newdialog.png');

    // ④ 创建
    const created = await evalJs(`(async () => {
      const b = [...document.querySelectorAll('.el-dialog .cp-btn')].find(x => x.textContent.includes('创建并开始剪辑'));
      if (!b) return 'no-create-btn';
      b.click();
      await new Promise(r=>setTimeout(r,4500));
      const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      const saved = cid ? await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(r=>r.json()).catch(e=>({err:String(e)})) : null;
      return { convId: cid, savedSize: saved?.project?.output?.size, savedFps: saved?.project?.output?.fps, savedName: saved?.project?.name,
        editorVisible: getComputedStyle(document.querySelector('.cp-body')).display !== 'none',
        projectsVisible: getComputedStyle(document.querySelector('.cp-projects') || document.createElement('div')).display !== 'none',
        topTag: document.querySelector('.cp-tag')?.textContent?.trim(),
        propRows: [...document.querySelectorAll('.cp-prop')].map(r=>r.textContent.trim().replace(/\\s+/g,' ')),
        hasSpecSelect: !!document.querySelector('.cp-left select'),
      };
    })()`);
    await shot('pj-3-editor.png');

    // ⑤ 返回列表看卡片
    const list = await evalJs(`(async () => {
      const b = [...document.querySelectorAll('.cp-btn')].find(x => x.textContent.includes('项目'));
      if (!b) return 'no-back';
      b.click();
      await new Promise(r=>setTimeout(r,3000));
      return { cardCount: document.querySelectorAll('.cp-j-card').length || document.querySelectorAll('.cp-pj-card').length,
        cards: [...document.querySelectorAll('.cp-pj-card')].map(c => ({
          name: c.querySelector('.cp-pj-name')?.textContent,
          meta: c.querySelector('.cp-pj-meta')?.textContent?.trim().replace(/\\s+/g,' '),
          time: c.querySelector('.cp-pj-time')?.textContent?.trim().replace(/\\s+/g,' '),
          cover: c.querySelector('.cp-pj-cover')?.getBoundingClientRect().width > 0 })),
        dirLabel: document.querySelector('.cp-pj-dir')?.textContent?.trim().replace(/\\s+/g,' '),
        hasDirBtn: [...document.querySelectorAll('.cp-btn')].some(x => x.textContent.includes('项目目录')),
        backOnList: !!document.querySelector('.cp-projects') && getComputedStyle(document.querySelector('.cp-projects')).display !== 'none' };
    })()`);
    await shot('pj-4-list-with-card.png');

    // ⑥ 手动剪辑闭环：加素材 → 播放头处加字幕 → 断言真的落库且被选中
    const manual = await evalJs(`(async () => {
      const out = {};
      // 打开第一个项目
      const card = document.querySelector('.cp-pj-card');
      if (card) { card.click(); await new Promise(r=>setTimeout(r,3000)); }
      // 拖一个素材入轨
      const track = document.querySelector('.cp-tl-scroll');
      if (track) {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'C:/tmp/manual-a.mp4');
        track.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer: dt }));
        await new Promise(r=>setTimeout(r,3000));
      }
      out.domClips = document.querySelectorAll('.cp-clip').length;
      // 点「添加字幕」按钮
      const addBtn = [...document.querySelectorAll('.cp-mini')].find(b => (b.getAttribute('title')||'').includes('添加一条字幕'));
      out.hasAddTextBtn = !!addBtn;
      if (addBtn) { addBtn.click(); await new Promise(r=>setTimeout(r,3000)); }
      out.domTexts = document.querySelectorAll('.cp-text').length;
      out.selectedIsText = !!document.querySelector('.cp-text.active');
      out.inspectorTitle = document.querySelector('.cp-ins-title')?.textContent?.trim();
      out.textareaVal = document.querySelector('.cp-textarea')?.value;
      // 属接口复核（真落库）
      const cst = await import('/@fs/C:/Users/Administrator/Desktop/github/yan-zhi-master/packages/ui/src/stores/chat.ts');
      const cid = cst.useChatStore().currentConvId;
      const saved = cid ? await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(r=>r.json()).catch(e=>({err:String(e)})) : null;
      out.savedTexts = saved?.project?.texts?.length;
      out.savedText0 = saved?.project?.texts?.[0] ? { text: saved.project.texts[0].text, start: saved.project.texts[0].start, end: saved.project.texts[0].end } : null;
      return out;
    })()`);
    await shot('pj-5-manual-subtitle.png');

    console.log(JSON.stringify({ arrived, initial, dlg, created, list, manual, exceptions: exceptions.slice(0,5) }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();