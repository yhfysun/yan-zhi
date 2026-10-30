// 设置页（P0-C）：整理配置 + 围栏管理 + 组件管理 + 打开窗口
import { openWidgetMenu, removeWidget, WIDGET_PRESETS } from './widget-create.mjs';

const api = window.electronAPI || null;
const API_BASE = (api && api.apiBase) || (location.origin + '/api');
const PLUGIN = '/plugin/desktop-manager';
const $ = (id) => document.getElementById(id);

async function request(path, opts) {
  const r = await fetch(API_BASE + PLUGIN + path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data;
}

function status(msg, isErr) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (isErr ? ' err' : '');
  clearTimeout(status._t);
  status._t = setTimeout(() => { el.textContent = ''; }, 3000);
}

/* ---------------- 自绘下拉（默认策略） ---------------- */

const STRATEGIES = [
  { value: 'rules', name: '规则整理', desc: '纯本地规则，不调用大模型' },
  { value: 'ai', name: 'AI 整理', desc: '规则打底，判断不了的交给模型' },
];

function createStrategySelect(initial) {
  const root = $('strategySel');
  const btn = $('strategyBtn');
  const menu = $('strategyMenu');
  const nameEl = $('strategyName');
  const descEl = $('strategyDesc');
  let value = initial || 'rules';

  menu.textContent = '';
  for (const s of STRATEGIES) {
    const opt = document.createElement('div');
    opt.className = 'sel-opt';
    opt.dataset.value = s.value;
    opt.setAttribute('role', 'option');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = s.name;
    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = s.desc;
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = '✓';
    opt.append(t, d, tick);
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      set(s.value);
      closeMenu();
    });
    menu.appendChild(opt);
  }

  function render() {
    const cur = STRATEGIES.find((x) => x.value === value) || STRATEGIES[0];
    nameEl.textContent = cur.name;
    descEl.textContent = cur.desc;
    for (const o of menu.children) {
      o.setAttribute('aria-selected', o.dataset.value === value ? 'true' : 'false');
    }
  }
  function openMenu() {
    root.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function set(v) {
    value = STRATEGIES.some((x) => x.value === v) ? v : 'rules';
    render();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (root.classList.contains('open')) closeMenu();
    else openMenu();
  });
  btn.addEventListener('keydown', (e) => {
    const i = STRATEGIES.findIndex((x) => x.value === value);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? i + 1 : i - 1;
      set(STRATEGIES[(n + STRATEGIES.length) % STRATEGIES.length].value);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (root.classList.contains('open')) closeMenu();
      else openMenu();
    }
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  render();
  return { get value() { return value; }, set };
}

const strategySelect = createStrategySelect('rules');

function parseRules(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const parts = line.split('=>');
    if (parts.length !== 2) return;
    const match = parts[0].trim();
    const group = parts[1].trim();
    if (match && group) out.push({ match, group, priority: 1000 - i });
  });
  return out;
}

function rulesToText(rules) {
  return (rules || []).map((r) => (r.match || (r.ext ? '*.' + r.ext : '')) + ' => ' + r.group).join('\n');
}

async function loadFences() {
  const { fences, items } = await request('/state');
  const counts = {};
  for (const it of items) counts[it.fenceId] = (counts[it.fenceId] || 0) + 1;
  const list = $('fenceList');
  list.textContent = '';
  for (const f of fences) {
    const row = document.createElement('div');
    row.className = 'item';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = f.color || '#8ea3c4';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = f.label;
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = (counts[f.id] || 0) + ' 个';
    row.append(dot, n, c);
    if (f.id !== 'inbox') {
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = '移除';
      del.addEventListener('click', async () => {
        const okay = await askConfirm({
          title: '移除围栏「' + f.label + '」？',
          sub: '只移除这个分组，不删除任何文件。',
        });
        if (!okay) return;
        try {
          await request('/fences/' + f.id, { method: 'DELETE' });
          await loadFences();
        } catch (e) { status('移除失败：' + e.message, true); }
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  }
}

/* ---------------- 输入对话框（Electron 不支持 window.prompt） ---------------- */

function askText({ title, sub, placeholder, value }) {
  return new Promise((resolve) => {
    const mask = $('askMask');
    const ok = $('askOk');
    const cancel = $('askCancel');
    const input = $('askInput');
    $('askTitle').textContent = title || '';
    $('askSub').textContent = sub || '';
    input.value = value || '';
    input.placeholder = placeholder || '';
    mask.classList.add('show');
    setTimeout(() => input.focus(), 30);

    const finish = (v) => {
      mask.classList.remove('show');
      ok.onclick = null;
      cancel.onclick = null;
      input.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim()); }
      if (e.key === 'Escape') finish('');
    };
    ok.onclick = () => finish(input.value.trim());
    cancel.onclick = () => finish('');
    input.addEventListener('keydown', onKey);
  });
}

/** 确认框（同样不用 window.confirm）：返回 true/false */
function askConfirm({ title, sub }) {
  return new Promise((resolve) => {
    const mask = $('askMask');
    const ok = $('askOk');
    const cancel = $('askCancel');
    const input = $('askInput');
    $('askTitle').textContent = title || '确认';
    $('askSub').textContent = sub || '';
    input.style.display = 'none';
    mask.classList.add('show');
    const finish = (v) => {
      mask.classList.remove('show');
      input.style.display = '';
      ok.onclick = null;
      cancel.onclick = null;
      resolve(v);
    };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
  });
}

/* ---------------- 组件管理 ---------------- */

function typeLabel(type) {
  const p = WIDGET_PRESETS.find((x) => x.type === type);
  return p ? p.label : type;
}

async function loadWidgets() {
  const data = await request('/widgets');
  const list = $('widgetList');
  list.textContent = '';
  const widgets = (data && data.widgets) || [];
  if (!widgets.length) {
    const empty = document.createElement('div');
    empty.className = 'item';
    empty.style.color = '#7d889c';
    empty.textContent = '还没有组件 —— 点下面「新建组件」，或在桌面层工具条上右键';
    list.appendChild(empty);
    return;
  }
  for (const w of widgets) {
    const row = document.createElement('div');
    row.className = 'item';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = (w.config && w.config.title) || typeLabel(w.type);
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = `${w.type} · ${w.layer === 'overlay' ? '悬浮层' : '桌面层'}`;
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = `${Math.round(w.pos.x)},${Math.round(w.pos.y)}`;
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '移除';
    del.addEventListener('click', async () => {
      try {
        await removeWidget(request, w.id);
        await loadWidgets();
        status('已移除组件');
      } catch (e) { status('移除失败：' + e.message, true); }
    });
    row.append(n, k, c, del);
    list.appendChild(row);
  }
}

$('btnAddWidget').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  openWidgetMenu({
    request,
    x: r.left,
    y: r.bottom + 6,
    onDone: () => { void loadWidgets(); status('已新建组件'); },
    onError: (err) => status('新建失败：' + (err && err.message ? err.message : err), true),
  });
});

async function load() {
  const cfg = await request('/config');
  strategySelect.set(cfg.strategy === 'ai' ? 'ai' : 'rules');
  $('targetRoot').value = cfg.targetRoot || '';
  $('tcEnabled').checked = cfg.timeCluster.enabled !== false;
  $('tcDays').value = cfg.timeCluster.windowDays || 7;
  $('city').value = cfg.city || '';
  $('workEnd').value = cfg.workEnd || '18:00';
  $('rules').value = rulesToText(cfg.rules);
  $('projects').value = (cfg.projects || []).join(', ');
  $('keep').value = (cfg.keep || []).join('\n');
  await loadFences();
  await loadWidgets();
}

async function save() {
  const body = {
    strategy: strategySelect.value,
    targetRoot: $('targetRoot').value.trim(),
    timeCluster: { enabled: $('tcEnabled').checked, windowDays: Number($('tcDays').value) || 7 },
    city: $('city').value.trim(),
    workEnd: $('workEnd').value.trim(),
    rules: parseRules($('rules').value),
    projects: $('projects').value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
    keep: $('keep').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  };
  try {
    await request('/config', { method: 'PUT', body: JSON.stringify(body) });
    status('已保存');
  } catch (e) {
    status('保存失败：' + e.message, true);
  }
}

$('btnSave').addEventListener('click', save);

$('btnNewFence').addEventListener('click', async () => {
  const label = await askText({
    title: '新建围栏',
    sub: '只改显示位置，不移动任何文件。',
    placeholder: '围栏名称，如：工作 / 截图',
  });
  if (!label) return;
  try {
    await request('/fences', { method: 'POST', body: JSON.stringify({ label }) });
    await loadFences();
  } catch (e) {
    status('新建失败：' + e.message, true);
  }
});

async function openWindow(entry, placement, rect) {
  if (!api || !api.pluginWindow) { status('仅桌面端可用', true); return; }
  try {
    const r = await api.pluginWindow.open({ pluginId: 'desktop-manager', entry, placement, rect });
    if (!r.ok) status('打开失败：' + r.error, true);
    else status('已打开');
  } catch (e) {
    status('打开失败：' + e.message, true);
  }
}

$('btnOpenFence').addEventListener('click', () => openWindow('frontend/fence.html', 'desktop'));
$('btnOpenWidgets').addEventListener('click', () => openWindow('frontend/widgets.html?layer=desktop', 'desktop'));
$('btnOpenWidgetsOverlay').addEventListener('click', () => openWindow('frontend/widgets.html?layer=overlay', 'overlay'));

$('btnClose').addEventListener('click', () => window.close());

load().catch((e) => status('加载失败：' + e.message, true));
