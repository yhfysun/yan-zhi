// 编辑器基础三件套 CDP 验证：撤销/重做 / 拖拽移动 / 吸附。
// ★ 撤销必须验「真的回退了」—— 用工程数据（片段数/顺序）做断言，不看 UI 文案。
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const PORT = 9391; const ORIGIN = 'http://127.0.0.1:5173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master';
const MEDIA = `${ROOT}/tmp/_verify_data/demo-probe`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const udd = path.join(os.tmpdir(), 'yz-base-' + Date.now());
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
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text, desc: String(r.exceptionDetails.exception?.description || '').slice(0, 250) };
      return r.result.value; };

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('yz:mode:ctx');localStorage.setItem('yz:mode','clip');}catch(e){}` });
    await send('Page.navigate', { url: ORIGIN + '/' }); await sleep(4500);

    // 进剪辑模式
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

    // 建项目 + 上两个素材
    const setup = await evalJs(`(async () => {
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
      if (!cid) return { err: 'no-conv' };
      for (const [n, f] of [['one.mp4', '${MEDIA}/ten.mp4'], ['two.mp4', '${MEDIA}/three.mp4']]) {
        await fetch('/api/conversations/'+encodeURIComponent(cid)+'/files', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name:n, path:f, category:'upload', source:'user' }) });
      }
      const rb = [...document.querySelectorAll('.cp-btn')].find(x=>x.textContent.includes('刷新'));
      if (rb) { rb.click(); await new Promise(r=>setTimeout(r,3600)); }
      const items = [...document.querySelectorAll('.cp-media-item')];
      for (const it of items) { it.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,2200)); }
      return { convId: cid };
    })()`);
    await sleep(3000);

    // ===== 撤销/重做验证 =====
    const undoTest = await evalJs(`(async () => {
      const out = {};
      const snap = async () => {
        const cst = await import('/@fs/${ROOT}/packages/ui/src/stores/chat.ts');
        const cid = cst.useChatStore().currentConvId;
        const j = await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(r=>r.json());
        return { clips: (j.project?.clips||[]).length, labels: (j.project?.clips||[]).map(c=>c.label) };
      };
      out.before = await snap();
      out.undoDisabledBefore = [...document.querySelectorAll('.cp-mini')].find(b=>(b.getAttribute('title')||'').includes('撤销'))?.disabled;
      // ① 删掉一个片段（用工具条删除按钮）
      const clip = document.querySelector('.cp-clip');
      if (clip) { clip.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); await new Promise(r=>setTimeout(r,800)); }
      const delBtn = [...document.querySelectorAll('.cp-mini')].find(b=>(b.getAttribute('title')||'').includes('删除选中片段'));
      if (delBtn) { delBtn.click(); await new Promise(r=>setTimeout(r,2600)); }
      out.afterDelete = await snap();
      out.undoEnabled = ![...document.querySelectorAll('.cp-mini')].find(b=>(b.getAttribute('title')||'').includes('撤销'))?.disabled;
      // ② 撤销
      const undoBtn = [...document.querySelectorAll('.cp-mini')].find(b=>(b.getAttribute('title')||'').includes('撤销'));
      if (undoBtn) { undoBtn.click(); await new Promise(r=>setTimeout(r,2800)); }
      out.afterUndo = await snap();
      // ③ 重做
      const redoBtn = [...document.querySelectorAll('.cp-mini')].find(b=>(b.getAttribute('title')||'').includes('重做'));
      if (redoBtn) { redoBtn.click(); await new Promise(r=>setTimeout(r,2800)); }
      out.afterRedo = await snap();
      // ④ 快捷键 Ctrl+Z（点时间轴确保焦点不在输入框）
      document.querySelector('.cp-tl-scroll')?.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles:true }));
      await new Promise(r=>setTimeout(r,2800));
      out.afterCtrlZ = await snap();
      return out;
    })()`);

    // ===== 拖拽移动验证 =====
    const dragTest = await evalJs(`(async () => {
      const snap = async () => {
        const cst = await import('/@fs/${ROOT}/packages/ui/src/stores/chat.ts');
        const cid = cst.useChatStore().currentConvId;
        const j = await fetch('/api/clip/project?conversationId='+encodeURIComponent(cid)).then(r=>r.json());
        return (j.project?.clips||[]).map(c=>c.label);
      };
      const before = await snap();
      const clips = [...document.querySelectorAll('.cp-clip')];
      if (clips.length < 2) return { skipped: '片段不足 2 个', before };
      const first = clips[0], last = clips[clips.length-1];
      const r1 = first.getBoundingClientRect(), r2 = last.getBoundingClientRect();
      // 按住第一段，拖到最后一段右半侧
      first.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window, button:0, clientX: r1.left+20, clientY: r1.top+20 }));
      await new Promise(r=>setTimeout(r,200));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, clientX: r1.left+40, clientY: r1.top+20 }));
      await new Promise(r=>setTimeout(r,200));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, clientX: r2.left + r2.width*0.8, clientY: r2.top+20 }));
      await new Promise(r=>setTimeout(r,500));
      const midOrder = [...document.querySelectorAll('.cp-clip')].map(e=>e.querySelector('.cp-clip-name')?.textContent);
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
      await new Promise(r=>setTimeout(r,2600));
      return { before, midOrder, after: await snap() };
    })()`);

    // ===== 吸附验证 =====
    const snapTest = await evalJs(`(async () => {
      const ruler = document.querySelector('.cp-ruler');
      if (!ruler) return { err: 'no-ruler' };
      const rect = ruler.getBoundingClientRect();
      // 先取一个"非吸附点"的位置，再取一个"接近段边界"的位置
      const timeText = () => document.querySelector('.cp-time')?.textContent?.trim().replace(/\\s+/g,' ');
      // 点在片段边界附近（第 1 段约 10s，按当前缩放估算像素）
      const clip = document.querySelector('.cp-clip');
      const cr = clip.getBoundingClientRect();
      const boundaryX = cr.right - 3;   // 距段尾 3px（应被吸附到 10.0s）
      ruler.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window, clientX: boundaryX, clientY: rect.top+8 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
      await new Promise(r=>setTimeout(r,900));
      return { seeked: timeText(), snapPoints: document.querySelectorAll('.cp-tick').length };
    })()`);

    console.log(JSON.stringify({ nav, setup, undoTest, dragTest, snapTest, exceptions: exceptions.slice(0,4) }, null, 2));
  } catch (e) { console.log(JSON.stringify({ fatal: String(e) }, null, 2)); }
  finally { try { ws && ws.close(); } catch {} try { chrome.kill(); } catch {} }
})();