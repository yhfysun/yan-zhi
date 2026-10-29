// 设置页（P0-C）：整理配置 + 围栏管理 + 打开围栏窗口
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
        if (!window.confirm('移除围栏「' + f.label + '」？只移除围栏，不删除文件。')) return;
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

async function load() {
  const cfg = await request('/config');
  $('strategy').value = cfg.strategy === 'ai' ? 'ai' : 'rules';
  $('targetRoot').value = cfg.targetRoot || '';
  $('tcEnabled').checked = cfg.timeCluster.enabled !== false;
  $('tcDays').value = cfg.timeCluster.windowDays || 7;
  $('rules').value = rulesToText(cfg.rules);
  $('projects').value = (cfg.projects || []).join(', ');
  $('keep').value = (cfg.keep || []).join('\n');
  await loadFences();
}

async function save() {
  const body = {
    strategy: $('strategy').value,
    targetRoot: $('targetRoot').value.trim(),
    timeCluster: { enabled: $('tcEnabled').checked, windowDays: Number($('tcDays').value) || 7 },
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
  const label = window.prompt('围栏名称（也是对应文件夹名）');
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
