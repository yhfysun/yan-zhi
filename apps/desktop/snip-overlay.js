(function () {
  var dimEl = document.getElementById('dim');
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
  // ===== 微信式窗口识别状态 =====
  var winRects = [];        // 可见窗口矩形（逻辑像素），主进程 EnumWindows 产出
  var hoverWin = null;      // 光标下命中的窗口（未按下时的高亮预览）
  var movedSinceDown = false; // 按下后是否移动过（区分单击选窗与拖拽框选）
  // ===== 标注状态 =====
  var tool = null;            // null=调整选区 | 'rect'|'ellipse'|'arrow'|'pen'|'mosaic'|'text'
  var color = '#ff4d4f';      // 当前画笔颜色（QQ 默认红）
  var ops = [];               // 已提交的标注操作（支持撤销）
  var annotate = null;        // 进行中的标注 {type, points|...}
  var editing = false;        // 文字编辑中
  var mosaicBase = null;      // 马赛克底图（仅合成阶段有干净帧时非 null）
  var winHi, winTitle;        // 窗口识别高亮层
  // ===== 微信式选区移动/缩放 =====
  var mode = null;            // null | 'move' | 'resize'（选区调整中的交互模式）
  var resizeDir = '';         // 'n','s','e','w','ne','nw','se','sw'
  var grabX = 0, grabY = 0;   // 按下时光标位置
  var grabRect = null;        // 按下时的选区矩形 {left,top,width,height}
  var handles = [];           // 8 个手柄 DOM

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

  // 物理像素 / 逻辑像素 比例：透明窗无冻结图，canvas 与屏幕物理分辨率对齐
  function R() { return window.devicePixelRatio || 1; }
  function insideSel(x, y) {
    return x >= sel.offsetLeft && x <= sel.offsetLeft + sel.offsetWidth &&
           y >= sel.offsetTop  && y <= sel.offsetTop + sel.offsetHeight;
  }

  function valid() { return hasSel && sel.offsetWidth >= 2 && sel.offsetHeight >= 2; }

  // ===== 微信式窗口识别 =====
  /**
   * 纯几何命中测试（可测试、无 DOM 依赖）：
   * 返回包含 (px,py) 的最小面积窗口（嵌套时取最上层小窗，对齐微信体感）。
   * @param rects [{x,y,width,height,...}] 逻辑像素
   */
  function hitWindow(rects, px, py) {
    var best = null, bestArea = Infinity;
    for (var i = 0; i < rects.length; i++) {
      var w = rects[i];
      if (px < w.x || py < w.y || px >= w.x + w.width || py >= w.y + w.height) continue;
      var area = w.width * w.height;
      if (area < bestArea) { bestArea = area; best = w; }
    }
    return best;
  }
  /** hover 高亮框 + 标题气泡（跟随窗口顶边；贴顶时放窗内） */
  function showHover(win) {
    if (!win || !winHi) { hideHover(); return; }
    winHi.style.display = 'block';
    winHi.style.left = win.x + 'px'; winHi.style.top = win.y + 'px';
    winHi.style.width = win.width + 'px'; winHi.style.height = win.height + 'px';
    winTitle.style.display = 'block';    winTitle.textContent = win.title || '窗口';
    var tx = win.x + 2, ty = win.y + 6;
    if (win.width < 160) tx = Math.min(Math.max(4, win.x + win.width / 2 - 80), window.innerWidth - 168);
    if (win.y < 40) ty = win.y + win.height - 30;
    winTitle.style.left = tx + 'px';
    winTitle.style.top = ty + 'px';
  }
  function hideHover() {
    if (winHi) winHi.style.display = 'none';
    if (winTitle) winTitle.style.display = 'none';
  }
  /** 刷新窗口清单：进入框选时一次 + 长时间空闲时懒刷新（防 Alt+Tab 后位置过期） */
  var refreshing = false;
  function refreshWindows() {
    if (refreshing || !window.snipAPI || !window.snipAPI.listWindows) return;
    refreshing = true;
    window.snipAPI.listWindows().then(function (list) {
      if (Array.isArray(list)) winRects = list;
    }).catch(function () {}).then(function () { refreshing = false; });
  }

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
    // 选区一旦存在，压暗交给选区自带的全屏阴影
    setDim(false);
    positionHandles();
  }
  /** 8 向手柄跟随选区边框中点/角点 */
  function positionHandles() {
    if (!hasSel) { handles.forEach(function (h) { h.style.display = 'none'; }); return; }
    var L = sel.offsetLeft, T = sel.offsetTop, W = sel.offsetWidth, H = sel.offsetHeight;
    var pts = {
      nw: [L, T], n: [L + W / 2, T], ne: [L + W, T],
      w: [L, T + H / 2], e: [L + W, T + H / 2],
      sw: [L, T + H], s: [L + W / 2, T + H], se: [L + W, T + H]
    };
    handles.forEach(function (h) {
      var p = pts[h.dataset.dir];
      h.style.display = dragging ? 'none' : 'block';
      h.style.left = (p[0] - 5) + 'px';
      h.style.top = (p[1] - 5) + 'px';
      h.style.cursor = CURSORS[h.dataset.dir];
    });
  }
  var CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
  /** 全屏暗幕：无 hover 窗口且无选区时压暗实时屏幕；hover/选区出现时由其自带阴影接管 */
  function setDim(on) { if (dimEl) dimEl.style.display = on ? 'block' : 'none'; }
  function clearSel() {
    hasSel = false; dragging = false; mode = null;
    sel.style.display = 'none'; badge.style.display = 'none';
    ops = []; redraw();
    toolbar.style.display = 'none';
    positionHandles();
    setDim(true);
  }
  // ===== 标注 ops 随选区平移/缩放（物理像素坐标） =====
  function translateOps(dx, dy) {
    ops.forEach(function (op) {
      if (op.points) op.points = op.points.map(function (p) { return [p[0] + dx, p[1] + dy]; });
      if (typeof op.x === 'number') { op.x += dx; op.y += dy; }
    });
  }
  function scaleOps(ox, oy, sx, sy) {
    ops.forEach(function (op) {
      if (op.points) op.points = op.points.map(function (p) { return [ox + (p[0] - ox) * sx, oy + (p[1] - oy) * sy]; });
      if (typeof op.x === 'number') {
        op.x = ox + (op.x - ox) * sx; op.y = oy + (op.y - oy) * sy;
        if (op.type === 'rect' || op.type === 'ellipse' || op.type === 'arrow') { op.w *= sx; op.h *= sy; }
      }
    });
  }
  /** 拖拽/调整中把 ink 层做 CSS 变换做实时预览（origin/位移为 CSS 逻辑像素，比例逻辑/物理一致）；提交时重设为恒等 */
  function inkTransform(ox, oy, sx, sy, tx, ty) {
    ink.style.transformOrigin = ox + 'px ' + oy + 'px';
    ink.style.transform = 'translate(' + (tx || 0) + 'px,' + (ty || 0) + 'px) scale(' + sx + ',' + sy + ')';
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
  /**
   * 马赛克：沿线段每 tile/2 步取一块。合成阶段 mosaicBase = 干净全屏帧，做真像素化；
   * 框选阶段无底图（窗口透明、实时屏幕），先画半透明灰块示意，最终成品以合成为准。
   */
  function stampMosaic(ctx, p1, p2, tile) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var steps = Math.max(1, Math.ceil(dist / (tile / 2)));
    for (var s = 0; s <= steps; s++) {
      var x = p1[0] + dx * (s / steps), y = p1[1] + dy * (s / steps);
      if (mosaicBase) {
        ctx.drawImage(mosaicBase, x - tile / 2, y - tile / 2, tile, tile, x - tile / 2, y - tile / 2, tile, tile);
      } else {
        ctx.fillStyle = 'rgba(128, 128, 128, 0.55)';
        ctx.fillRect(x - tile / 2, y - tile / 2, tile, tile);
      }
    }
  }

  // ===== 确认 / 保存 / 取消 =====
  /** 确认：只交选区矩形，主进程 hide 遮罩后抓干净帧，页面在 onCompose 里裁剪+重绘标注 */
  function confirm() {
    if (editing) { commitTextEdit(); return; }
    if (!valid()) return;
    hideHover();
    window.snipAPI.confirm({
      x: sel.offsetLeft, y: sel.offsetTop,
      width: sel.offsetWidth, height: sel.offsetHeight
    });
  }
  /** 保存到本地：同样走主进程合成管线；保存后框选窗恢复，可继续编辑 */
  function save() {
    if (editing) commitTextEdit();
    if (!valid()) return;
    showTip('正在保存…', 60000);
    window.snipAPI.save({
      x: sel.offsetLeft, y: sel.offsetTop,
      width: sel.offsetWidth, height: sel.offsetHeight
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
    hideHover();
    movedSinceDown = false;
    grabX = e.clientX; grabY = e.clientY;
    // 1. 手柄：8 向调整选区大小（比标注工具优先）
    if (valid() && e.target && e.target.classList && e.target.classList.contains('handle')) {
      mode = 'resize'; resizeDir = e.target.dataset.dir;
      grabRect = { left: sel.offsetLeft, top: sel.offsetTop, width: sel.offsetWidth, height: sel.offsetHeight };
      toolbar.style.display = 'none';
      return;
    }
    // 2. 选区内（未选标注工具）：按住拖动 = 移动选区（微信式），单击不再误确认
    if (valid() && !tool &&
        e.clientX >= sel.offsetLeft && e.clientX <= sel.offsetLeft + sel.offsetWidth &&
        e.clientY >= sel.offsetTop && e.clientY <= sel.offsetTop + sel.offsetHeight) {
      mode = 'move';
      grabRect = { left: sel.offsetLeft, top: sel.offsetTop, width: sel.offsetWidth, height: sel.offsetHeight };
      document.body.style.cursor = 'move';
      toolbar.style.display = 'none';
      return;
    }
    mode = null;
    document.body.style.cursor = '';
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
    // 选区移动（微信式：按住选区内拖动平移选区，标注跟手）
    if (mode === 'move' && grabRect) {
      var mdx = e.clientX - grabX, mdy = e.clientY - grabY;
      var nl = Math.min(Math.max(0, grabRect.left + mdx), window.innerWidth - grabRect.width);
      var nt = Math.min(Math.max(0, grabRect.top + mdy), window.innerHeight - grabRect.height);
      showSel(nl, nt, grabRect.width, grabRect.height);
      inkTransform(0, 0, 1, 1, nl - grabRect.left, nt - grabRect.top);
      return;
    }
    // 选区 8 向缩放：锚住不动的那条边，ink 层做等比预览
    if (mode === 'resize' && grabRect) {
      var g = grabRect;
      var dxr = e.clientX - grabX, dyr = e.clientY - grabY;
      var l = g.left, t = g.top, w = g.width, h = g.height;
      if (resizeDir.indexOf('w') >= 0) l = g.left + dxr;
      if (resizeDir.indexOf('e') >= 0) w = g.width + dxr;
      if (resizeDir.indexOf('n') >= 0) t = g.top + dyr;
      if (resizeDir.indexOf('s') >= 0) h = g.height + dyr;
      if (w < 2) { l = l + w - 2; w = 2; }
      if (h < 2) { t = t + h - 2; h = 2; }
      if (l < 0) { w += l; l = 0; }
      if (t < 0) { h += t; t = 0; }
      if (l + w > window.innerWidth) w = window.innerWidth - l;
      if (t + h > window.innerHeight) h = window.innerHeight - t;
      showSel(l, t, Math.max(2, w), Math.max(2, h));
      // 变换锚点 = 不动的对角/对边（CSS 逻辑像素；比例逻辑/物理一致）
      var ox = resizeDir.indexOf('w') >= 0 ? g.left + g.width : g.left;
      var oy = resizeDir.indexOf('n') >= 0 ? g.top + g.height : g.top;
      inkTransform(ox, oy, sel.offsetWidth / g.width, sel.offsetHeight / g.height, 0, 0);
      return;
    }
    if (dragging) {
      var x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
      var w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      if (w * h > 36) movedSinceDown = true; // 超过 ~6px 的位移才算真拖拽（排除手抖）
      showSel(x, y, w, h);
      return;
    }
    if (!annotate) {
      // 空闲态：hover 微信式窗口识别 + 暗幕切换（有选区时选区优先，不再高亮窗口）
      if (!editing && !valid()) {
        var hw = hitWindow(winRects, e.clientX, e.clientY);
        if (hw) { if (hw !== hoverWin) { hoverWin = hw; } showHover(hw); setDim(false); }
        else { hoverWin = null; hideHover(); setDim(true); }
      } else if (hoverWin) { hoverWin = null; hideHover(); }
      return;
    }
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
    // 结束移动/缩放：提交 ops 变换，恢复 ink 层恒等变换
    if (mode === 'move' || mode === 'resize') {
      var r = R();
      if (mode === 'move') {
        translateOps((sel.offsetLeft - grabRect.left) * r, (sel.offsetTop - grabRect.top) * r);
      } else {
        var sx = sel.offsetWidth / grabRect.width, sy = sel.offsetHeight / grabRect.height;
        var ox = resizeDir.indexOf('w') >= 0 ? grabRect.left + grabRect.width : grabRect.left;
        var oy = resizeDir.indexOf('n') >= 0 ? grabRect.top + grabRect.height : grabRect.top;
        scaleOps(ox * r, oy * r, sx, sy);
      }
      ink.style.transform = ''; ink.style.transformOrigin = '';
      mode = null; grabRect = null; lastUpAt = Date.now();
      document.body.style.cursor = '';
      redraw();
      positionToolbar();
      return;
    }
    if (dragging) {
      dragging = false; lastUpAt = Date.now();
      var w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      // 按下后没怎么动：单击选中光标下的整窗（微信式窗口识别），无窗则清掉误触小框
      if (!movedSinceDown) {
        var target = hitWindow(winRects, e.clientX, e.clientY);
        if (target && (target.width > 40 || target.height > 40)) {
          // 选整窗：选区即窗口矩形（clip 到屏幕内）
          var wx = Math.max(0, Math.min(target.x, window.innerWidth - 2));
          var wy = Math.max(0, Math.min(target.y, window.innerHeight - 2));
          var ww = Math.min(target.width, window.innerWidth - wx);
          var wh = Math.min(target.height, window.innerHeight - wy);
          ops = []; redraw();
          showSel(wx, wy, ww, wh);
          positionToolbar();
          hideHover();
          return;
        }
        clearSel();
        return;
      }
      // 真拖拽：常规选区完成
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
  document.addEventListener('dblclick', function () { if (!editing && !tool && valid()) confirm(); });
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

  // ===== 初始化（透明实时遮罩：无冻结图，状态重置完即回报 ready）=====
  winHi = document.getElementById('winHi');
  winTitle = document.getElementById('winTitle');
  ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].forEach(function (dir) {
    var h = document.createElement('div');
    h.className = 'handle'; h.dataset.dir = dir;
    document.body.appendChild(h);
    handles.push(h);
  });

  /** 画布与窗口物理分辨率对齐（显示器切换 / setBounds 后由 resize 触发重设） */
  function syncCanvas() {
    var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight), r = R();
    ink.width = Math.round(w * r); ink.height = Math.round(h * r);
    preview.width = ink.width; preview.height = ink.height;
    redraw();
  }
  window.addEventListener('resize', function () {
    syncCanvas();
    // 尺寸变了（换显示器），旧选区/标注坐标失配，整体复位
    if (hasSel || ops.length) clearSel();
  });

  /** 单轮会话初始化：清掉上一轮的选区/标注/高亮/文字编辑/手柄残留 → 回报 ready */
  function resetSession() {
    tool = null; annotate = null; editing = false; hoverWin = null;
    dragging = false; hasSel = false; mode = null; grabRect = null;
    ops = []; sel.style.display = 'none'; badge.style.display = 'none';
    toolbar.style.display = 'none';
    handles.forEach(function (h) { h.style.display = 'none'; });
    if (winHi) winHi.style.display = 'none';
    if (winTitle) winTitle.style.display = 'none';
    textEdit.style.display = 'none';
    document.body.style.cursor = '';
    ink.style.transform = ''; ink.style.transformOrigin = '';
    syncCanvas();
    refreshWindows();
    setDim(true);
    // 就绪回报：主进程收到后才 show 框选窗（无黑屏时序的关键帧）
    window.snipAPI.ready();
  }
  buildToolbar();
  if (window.snipAPI.onNewSession) window.snipAPI.onNewSession(resetSession);

  // ===== 成品图合成：主进程确认/保存时抓干净帧回发，页面裁剪 + 重绘标注 =====
  window.snipAPI.onCompose(function (info) {
    var settledFlag = false;
    var im = new Image();
    im.onload = function () {
      if (settledFlag) return; settledFlag = true;
      try {
        var out = document.createElement('canvas');
        out.width = info.w; out.height = info.h;
        var octx = out.getContext('2d');
        octx.drawImage(im, info.x, info.y, info.w, info.h, 0, 0, info.w, info.h);
        // 重绘标注（物理坐标 → 减去裁剪偏移）；马赛克用干净帧做真像素化
        octx.save();
        octx.translate(-info.x, -info.y);
        mosaicBase = im;
        ops.forEach(function (op) { renderOp(octx, op); });
        mosaicBase = null;
        octx.restore();
        window.snipAPI.composed({ action: info.action, dataUrl: out.toDataURL('image/png') });
      } catch (err) {
        console.error('[snip-page] compose failed: ' + (err && err.message));
        window.snipAPI.composed({ action: info.action, dataUrl: null });
      }
    };
    im.onerror = function () {
      if (settledFlag) return; settledFlag = true;
      window.snipAPI.composed({ action: info.action, dataUrl: null }); // 主进程超时兜底
    };
    im.src = info.frameUrl;
  });

  // 保存结果（保存对话框关闭后，框选窗已恢复显示）
  window.snipAPI.onSaveResult(function (r) {
    if (r && r.ok) showTip('已保存：' + r.path, 3200);
    else if (r && r.cancelled) showTip('', 1);
    else showTip('保存失败：' + ((r && r.error) || '未知错误'), 3200);
  });
})();
