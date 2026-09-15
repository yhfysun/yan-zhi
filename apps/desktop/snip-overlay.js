(function () {
  var img = document.getElementById('shot');
  var sel = document.getElementById('sel');
  var badge = document.getElementById('badge');
  var hint = document.getElementById('hint');
  var ink = document.getElementById('ink');
  var preview = document.getElementById('preview');
  var toolbar = document.getElementById('toolbar');
  var textEdit = document.getElementById('textEdit');
  var ictx = ink.getContext('2d');
  var pctx = preview.getContext('2d');

  var startX = 0, startY = 0, dragging = false, hasSel = false;
  var lastUpAt = 0;
  var imgLoaded = false;
  // ===== 标注状态 =====
  var tool = null;            // null=调整选区 | 'rect'|'ellipse'|'arrow'|'pen'|'mosaic'|'text'
  var color = '#ff4d4f';      // 当前画笔颜色（QQ 默认红）
  var ops = [];               // 已提交的标注操作（支持撤销）
  var annotate = null;        // 进行中的标注 {type, points|...}
  var editing = false;        // 文字编辑中
  var mosaicBase = null;      // 马赛克底图（物理分辨率像素化）

  var COLORS = ['#ff4d4f', '#1677ff', '#faad14', '#52c41a', '#111111'];
  var ICONS = {
    rect:   '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/>',
    ellipse:'<ellipse cx="8" cy="8" rx="5.5" ry="4.5"/>',
    arrow:  '<path d="M3 13 L12 4 M12 4 H7.5 M12 4 V8.5"/>',
    pen:    '<path d="M3 13 L3.8 9.8 L10.5 3.1 L12.9 5.5 L6.2 12.2 Z"/>',
    mosaic: '<path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM6 6h4v4H6zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z"/>',
    text:   '<path d="M3.5 4h9 M8 4v8.5 M5.8 12.5h4.4"/>',
    undo:   '<path d="M3.5 7.5h6.5a3.25 3.25 0 1 1 0 6.5H6.5 M3.5 7.5l2.8-2.8 M3.5 7.5l2.8 2.8"/>',
    save:   '<path d="M8 2.5v7 M5.2 6.8L8 9.5l2.8-2.7 M3 10.5v2.5h10v-2.5"/>',
    ok:     '<path d="M3 8.5 L6.5 12 L13 4.5"/>',
    cancel: '<path d="M4 4 L12 12 M12 4 L4 12"/>'
  };

  // 物理像素 / 逻辑像素 比例：冻结图铺满窗口，canvas 与冻结图同分辨率
  function R() { return img.naturalWidth && window.innerWidth ? img.naturalWidth / window.innerWidth : 1; }
  function insideSel(x, y) {
    return x >= sel.offsetLeft && x <= sel.offsetLeft + sel.offsetWidth &&
           y >= sel.offsetTop  && y <= sel.offsetTop + sel.offsetHeight;
  }

  function valid() { return hasSel && sel.offsetWidth >= 2 && sel.offsetHeight >= 2; }

  function showSel(x, y, w, h) {
    hasSel = true;
    sel.style.display = 'block';
    sel.style.left = x + 'px'; sel.style.top = y + 'px';
    sel.style.width = Math.max(0, w) + 'px'; sel.style.height = Math.max(0, h) + 'px';
    badge.style.display = 'block';
    badge.textContent = w + ' × ' + h;
    var bh = 26;
    badge.style.left = x + 'px';
    badge.style.top = (y + h + 6 + bh > window.innerHeight ? y - bh - 6 : y + h + 6) + 'px';
    // 拖拽进行中不显示工具条（松手后再浮出），避免跟随闪烁
    if (dragging) toolbar.style.display = 'none';
  }
  function clearSel() {
    hasSel = false; dragging = false;
    sel.style.display = 'none'; badge.style.display = 'none';
    ops = []; redraw();
    toolbar.style.display = 'none';
  }

  // ===== 工具条 =====
  function buildToolbar() {
    function btn(name, tip, cmd) {
      var b = document.createElement('button');
      b.className = 'tb-btn'; b.title = tip; b.dataset.cmd = cmd || name;
      b.innerHTML = '<svg viewBox="0 0 16 16">' + ICONS[name] + '</svg>';
      return b;
    }
    function sep() { var s = document.createElement('div'); s.className = 'tb-sep'; return s; }
    toolbar.appendChild(btn('undo', '撤销'));
    toolbar.appendChild(sep());
    ['rect', 'ellipse', 'arrow', 'pen', 'mosaic', 'text'].forEach(function (t) {
      var b = btn(t, { rect: '矩形', ellipse: '椭圆', arrow: '箭头', pen: '画笔', mosaic: '马赛克', text: '文字' }[t]);
      b.classList.add('tool');
      toolbar.appendChild(b);
    });
    toolbar.appendChild(sep());
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tb-color'; b.style.background = c; b.dataset.color = c; b.title = '颜色';
      toolbar.appendChild(b);
    });
    toolbar.appendChild(sep());
    toolbar.appendChild(btn('save', '保存到本地'));
    toolbar.appendChild(btn('ok', '确认 (Enter)'));
    toolbar.appendChild(btn('cancel', '取消 (Esc)'));
    COLORS[0] && (toolbar.querySelector('[data-color="' + COLORS[0] + '"]').classList.add('active'));
    // 阻断工具条上的鼠标事件外溢（否则点按钮会触发选区/标注/取消逻辑）
    ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'].forEach(function (ev) {
      toolbar.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    toolbar.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    toolbar.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('tool')) {
        tool = (tool === t.dataset.cmd) ? null : t.dataset.cmd;
        toolbar.querySelectorAll('.tool').forEach(function (x) { x.classList.toggle('active', x.dataset.cmd === tool); });
        if (tool === 'text') commitTextEdit(); // 切工具时收起文字编辑
      } else if (t.dataset.color) {
        color = t.dataset.color;
        toolbar.querySelectorAll('.tb-color').forEach(function (x) { x.classList.toggle('active', x === t); });
      } else if (t.dataset.cmd === 'undo') {
        if (commitTextEdit()) { /* 只是收起文字 */ }
        else if (ops.length) { ops.pop(); redraw(); }
      } else if (t.dataset.cmd === 'save') {
        save();
      } else if (t.dataset.cmd === 'ok') {
        confirm();
      } else if (t.dataset.cmd === 'cancel') {
        cancel();
      }
    });
  }
  /** 工具条跟随选区：贴选区下方，靠底翻转，水平夹在屏内 */
  function positionToolbar() {
    if (!valid()) { toolbar.style.display = 'none'; return; }
    toolbar.style.display = 'inline-flex';
    var tw = toolbar.offsetWidth || 380, th = toolbar.offsetHeight || 42;
    var x = Math.min(Math.max(6, sel.offsetLeft), window.innerWidth - tw - 6);
    var y = sel.offsetTop + sel.offsetHeight + 8;
    if (y + th > window.innerHeight - 4) y = sel.offsetTop - th - 8;
    toolbar.style.left = x + 'px';
    toolbar.style.top = Math.max(4, y) + 'px';
  }

  // ===== 渲染 =====
  function redraw() {
    ictx.clearRect(0, 0, ink.width, ink.height);
    ops.forEach(function (op) { renderOp(ictx, op); });
  }
  function renderOp(ctx, op) {
    var r = R();
    ctx.save();
    ctx.strokeStyle = op.color; ctx.fillStyle = op.color;
    ctx.lineWidth = 3 * r; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var i;
    if (op.type === 'rect') {
      ctx.strokeRect(op.x, op.y, op.w, op.h);
    } else if (op.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(op.x + op.w / 2, op.y + op.h / 2, Math.abs(op.w / 2), Math.abs(op.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (op.type === 'arrow') {
      var dx = op.w, dy = op.h, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ex = op.x + dx, ey = op.y + dy, head = Math.max(14 * r, len * 0.18);
      ctx.beginPath(); ctx.moveTo(op.x, op.y); ctx.lineTo(ex, ey); ctx.stroke();
      var ang = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - head * Math.cos(ang - 0.42), ey - head * Math.sin(ang - 0.42));
      ctx.lineTo(ex - head * Math.cos(ang + 0.42), ey - head * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
    } else if (op.type === 'pen') {
      ctx.beginPath();
      for (i = 0; i < op.points.length; i++) {
        if (i === 0) ctx.moveTo(op.points[i][0], op.points[i][1]);
        else ctx.lineTo(op.points[i][0], op.points[i][1]);
      }
      ctx.stroke();
    } else if (op.type === 'mosaic') {
      var tile = Math.max(8, 12 * r);
      ctx.fillStyle = '#fff';
      for (i = 1; i < op.points.length; i++) {
        stampMosaic(ctx, op.points[i - 1], op.points[i], tile);
      }
      if (op.points.length === 1) stampMosaic(ctx, op.points[0], op.points[0], tile);
    } else if (op.type === 'text') {
      ctx.font = '500 ' + Math.round(16 * r) + 'px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'top';
      var lines = op.text.split('\n');
      for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], op.x, op.y + i * 22 * r);
    }
    ctx.restore();
  }
  /** 马赛克：沿线段每 tile/2 步从像素化底图上抠一块贴过来 */
  function stampMosaic(ctx, p1, p2, tile) {
    if (!mosaicBase) return;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var steps = Math.max(1, Math.ceil(dist / (tile / 2)));
    for (var s = 0; s <= steps; s++) {
      var x = p1[0] + dx * (s / steps), y = p1[1] + dy * (s / steps);
      ctx.drawImage(mosaicBase, x - tile / 2, y - tile / 2, tile, tile, x - tile / 2, y - tile / 2, tile, tile);
    }
  }

  // ===== 确认 / 保存 / 取消 =====
  /** 合成最终图（冻结图裁剪 + 标注层裁剪），返回 { dataUrl } 或 null（失败/无效） */
  function buildFinalImage() {
    if (!imgLoaded || !valid()) return null;
    try {
      var r = R();
      var sx = Math.max(0, Math.round(sel.offsetLeft * r));
      var sy = Math.max(0, Math.round(sel.offsetTop * r));
      var sw = Math.min(img.naturalWidth - sx, Math.round(sel.offsetWidth * r));
      var sh = Math.min(img.naturalHeight - sy, Math.round(sel.offsetHeight * r));
      var out = document.createElement('canvas');
      out.width = sw; out.height = sh;
      var octx = out.getContext('2d');
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      octx.drawImage(ink, sx, sy, sw, sh, 0, 0, sw, sh);
      return out.toDataURL('image/png');
    } catch (err) {
      console.error('[snip-page] composite failed: ' + (err && err.message));
      return null;
    }
  }
  function confirm() {
    if (editing) { commitTextEdit(); return; }
    var dataUrl = buildFinalImage();
    if (!dataUrl) return;
    try {
      window.snipAPI.confirm({
        x: sel.offsetLeft, y: sel.offsetTop,
        width: sel.offsetWidth, height: sel.offsetHeight,
        dataUrl: dataUrl
      });
    } catch (err) {
      console.error('[snip-page] confirm failed: ' + (err && err.message));
      // 合成失败退回主进程自行裁剪的旧通道
      window.snipAPI.confirm({ x: sel.offsetLeft, y: sel.offsetTop, width: sel.offsetWidth, height: sel.offsetHeight });
    }
  }
  /** 保存到本地：弹系统保存框（默认图片文件夹+时间戳名），保存后框选窗保留可继续编辑 */
  function save() {
    if (editing) commitTextEdit();
    var dataUrl = buildFinalImage();
    if (!dataUrl) return;
    var tip = showTip('正在保存…');
    window.snipAPI.save(dataUrl).then(function (r) {
      if (r && r.ok) { showTip('已保存：' + r.path, 3200); }
      else if (r && r.cancelled) { tip.remove(); }
      else { showTip('保存失败：' + ((r && r.error) || '未知错误'), 3200); }
    }).catch(function (e) {
      showTip('保存失败：' + (e && e.message || e), 3200);
    });
  }
  /** 工具条上方的轻提示，duration 毫秒后自动消失 */
  function showTip(text, duration) {
    var t = document.getElementById('saveTip');
    if (!t) {
      t = document.createElement('div');
      t.id = 'saveTip';
      t.style.cssText = 'position:absolute;z-index:15;background:rgba(24,24,27,0.95);color:#e5e7eb;' +
        'font:12px/1.4 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:7px 12px;' +
        'border-radius:8px;pointer-events:none;white-space:nowrap;max-width:70vw;overflow:hidden;' +
        'text-overflow:ellipsis;display:none;';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.display = 'block';
    var tw = toolbar.offsetWidth || 380;
    t.style.left = Math.min(Math.max(6, parseFloat(toolbar.style.left) || sel.offsetLeft), window.innerWidth - tw - 6) + 'px';
    t.style.top = (Math.max(4, parseFloat(toolbar.style.top) || sel.offsetTop) - 32) + 'px';
    if (t._timer) clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.display = 'none'; }, duration || 1800);
    return t;
  }
  function cancel() { window.snipAPI.cancel(); }

  // ===== 文字标注 =====
  function openTextEdit(lx, ly) {
    editing = true;
    textEdit.value = '';
    textEdit.style.display = 'block';
    textEdit.style.left = lx + 'px';
    textEdit.style.top = ly + 'px';
    textEdit.style.color = color;
    setTimeout(function () { textEdit.focus(); }, 0);
  }
  /** 提交文字编辑，返回是否确实在编辑状态 */
  function commitTextEdit() {
    if (!editing) return false;
    editing = false;
    textEdit.style.display = 'none';
    var text = textEdit.value.replace(/\s+$/, '');
    if (text) {
      ops.push({ type: 'text', x: parseFloat(textEdit.dataset.px) * R(), y: parseFloat(textEdit.dataset.py) * R(), text: text, color: textEdit.style.color });
      redraw();
    }
    return true;
  }
  textEdit.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); editing = false; textEdit.style.display = 'none'; }
  });

  // ===== 鼠标主逻辑 =====
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (editing) { editing = false; textEdit.style.display = 'none'; return; }
    cancel();
  });
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (editing) { commitTextEdit(); return; }
    // 双击的第二下按下不重置选区，让随后的 dblclick 完成确认
    if (valid() && Date.now() - lastUpAt < 350) return;
    var r = R();
    // 已选工具且按在选区内 → 开始标注；否则（含未选工具）走选区拖拽
    if (tool && hasSel && insideSel(e.clientX, e.clientY)) {
      if (tool === 'text') return; // 文字在 mouseup 的单击里开启编辑
      annotate = { type: tool, points: [[e.clientX * r, e.clientY * r]], color: color };
      if (tool === 'rect' || tool === 'ellipse' || tool === 'arrow') {
        annotate.x = e.clientX * r; annotate.y = e.clientY * r; annotate.w = 0; annotate.h = 0;
      }
      return;
    }
    // 选区外重新框选：清掉旧标注
    dragging = true; hasSel = false;
    if (ops.length) { ops = []; redraw(); }
    startX = e.clientX; startY = e.clientY;
    showSel(startX, startY, 0, 0);
  });
  window.addEventListener('mousemove', function (e) {
    if (dragging) {
      var x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
      var w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      showSel(x, y, w, h);
      return;
    }
    if (!annotate) return;
    var r = R();
    var px = e.clientX * r, py = e.clientY * r;
    if (annotate.type === 'pen' || annotate.type === 'mosaic') {
      annotate.points.push([px, py]);
    } else {
      annotate.w = px - annotate.x; annotate.h = py - annotate.y;
    }
    // 实时预览画在 preview 层，提交时才落到 ink 层
    pctx.clearRect(0, 0, preview.width, preview.height);
    renderOp(pctx, annotate);
  });
  window.addEventListener('mouseup', function (e) {
    if (dragging) {
      dragging = false; lastUpAt = Date.now();
      // 单击（选区过小）视为重新开始，不保留误触的小框
      if (!valid()) clearSel();
      else positionToolbar();
      return;
    }
    if (annotate) {
      if (annotate.type === 'pen' || annotate.type === 'mosaic') {
        annotate.points.push([e.clientX * R(), e.clientY * R()]);
      }
      // 形状类：单击（几乎零尺寸）不入栈，免得撤销一整次才能清掉误触
      var zeroShape = annotate.type !== 'pen' && annotate.type !== 'mosaic' &&
        Math.abs(annotate.w) + Math.abs(annotate.h) < 6;
      if (!zeroShape) ops.push(annotate);
      annotate = null;
      pctx.clearRect(0, 0, preview.width, preview.height);
      redraw();
      return;
    }
    // 文字工具：单击选区内空白处开启编辑框
    if (tool === 'text' && hasSel && insideSel(e.clientX, e.clientY)) {
      textEdit.dataset.px = String(e.clientX);
      textEdit.dataset.py = String(e.clientY);
      openTextEdit(e.clientX, e.clientY);
    }
  });
  document.addEventListener('dblclick', function () { if (!editing && !tool) confirm(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) { editing = false; textEdit.style.display = 'none'; return; }
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  });

  // ===== 拉取冻结画面并初始化画布 =====
  // 主进程（GDI/desktopCapturer）已完成抓帧并验黑，页面直接使用。
  window.snipAPI.getImage().then(function (info) {
    if (!info || !info.dataUrl) { cancel(); return; }
    img.onload = function () {
      imgLoaded = true;
      hint.style.opacity = '1';
      console.log('[snip-page] frozen image loaded, ' + Math.round(info.dataUrl.length / 1024) + 'KB');
      try {
        ink.width = img.naturalWidth; ink.height = img.naturalHeight;
        preview.width = img.naturalWidth; preview.height = img.naturalHeight;
        // 马赛克底图：缩到 1/8 再放大（关平滑）= 经典像素化
        mosaicBase = document.createElement('canvas');
        mosaicBase.width = Math.max(1, Math.round(img.naturalWidth / 8));
        mosaicBase.height = Math.max(1, Math.round(img.naturalHeight / 8));
        var mctx = mosaicBase.getContext('2d');
        mctx.drawImage(img, 0, 0, mosaicBase.width, mosaicBase.height);
        var up = document.createElement('canvas');
        up.width = img.naturalWidth; up.height = img.naturalHeight;
        var uctx = up.getContext('2d');
        uctx.imageSmoothingEnabled = false;
        uctx.drawImage(mosaicBase, 0, 0, up.width, up.height);
        mosaicBase = up;
      } catch (err) {
        console.error('[snip-page] canvas init failed: ' + (err && err.message));
      }
      buildToolbar();
      window.snipAPI.ready();
    };
    img.onerror = function () { console.error('[snip-page] frozen image load error'); cancel(); };
    img.src = info.dataUrl;
  }).catch(function () { cancel(); });
})();
