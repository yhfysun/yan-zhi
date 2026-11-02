// 桌面管理插件后端：桌面围栏 / 悬浮组件 / 待办提醒 / 一键整理（scan→plan→apply→undo）
//
// ★ 三条硬规矩（改之前先读）：
//   ① **插件不碰主库**：要读宿主数据（今日任务等）一律走 `runReadContract` 只读契约。
//   ② **整理默认走规则、不调模型**；AI 只补规则没覆盖的那部分，且失败静默回落规则并标注原因。
//   ③ **所有写操作先落 oplog 再动手**，且 `desktop_apply` 必须带 confirmed —— 智能体
//      批量移动用户桌面文件是高危动作，宁可多问一句也不能自动执行。
//
// 持久化全部走 ctx.storage（宿主按插件 id 隔离），本模块不自己建表、不写文件到别处。

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { buildItems, INBOX_ID } from '../shared/fences.js';
import { layoutPlan, snapWidth } from '../shared/layout.js';
import { validateWidgets, dedupeWidgets, widgetCatalog } from '../shared/widgets.js';
import { computeDue, describeDue } from '../shared/reminders.js';
import { normalizeCfg, buildPlan, validateAiPlan, mergeAiPlan, isKept } from './rules.js';

/** 围栏数据结构版本：结构变了就 +1，触发一次性重建（见 ensureFences） */
const SCHEMA_VERSION = 2;
const DEFAULT_RECT = { x: 40, y: 40, w: 400, h: 320 };
const COL_GAP = 16;

let ctxRef = null;
let storage = null;
let revRef = 0;
/** 一次性方案（organize / 文件整理）：执行过就作废，防止重复执行 */
const plans = new Map();
const sseClients = new Set();
let heartbeat = null;

/** 桌面目录：测试用 YZ_DESKTOP_DIR 指向临时目录，真实环境走系统桌面 */
function desktopDir() {
  return process.env.YZ_DESKTOP_DIR || path.join(os.homedir(), 'Desktop');
}

function host() {
  return globalThis.__YZ_SERVER_HOST__ || null;
}

function log(...args) {
  if (ctxRef && typeof ctxRef.log === 'function') ctxRef.log(...args);
}

/* ---------------- 围栏默认结构 ---------------- */

const EXT_FENCES = [
  { id: 'f-doc', kind: 'ext', label: '文档', exts: ['doc', 'docx', 'pdf', 'txt', 'md', 'ppt', 'pptx', 'rtf', 'odt'] },
  { id: 'f-sheet', kind: 'ext', label: '表格', exts: ['xls', 'xlsx', 'csv', 'ods'] },
  { id: 'f-image', kind: 'ext', label: '图片', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'heic'] },
  { id: 'f-installer', kind: 'ext', label: '安装包', exts: ['exe', 'msi', 'dmg', 'pkg', 'apk', 'deb'] },
  { id: 'f-archive', kind: 'ext', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz'] },
];

function defaultFences(hasDirs) {
  const list = [];
  // ★ 落位必须换行：默认栏若一路向右排到屏幕外，"整理"反而会把它们塞回屏幕内变成多行，
  //   表现为「越整理越占地方」。初始就按可视宽度排好，整理前后占用高度才不会变大。
  const put = (f) => {
    list.push({ sort: 'name', ...f, rect: placeFence(list) });
  };
  // 桌面上有目录才建「文件夹」栏：没有目录却空着一栏，用户只会觉得占了地方
  if (hasDirs) put({ id: 'f-folders', kind: 'folders', label: '文件夹' });
  for (const f of EXT_FENCES) put({ ...f });
  put({ id: INBOX_ID, kind: 'inbox', label: '待归类' });
  return list;
}

/* ---------------- 桌面扫描 ---------------- */

async function scanDir(dir) {
  const out = [];
  let ents = [];
  try {
    ents = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    try {
      const st = await fsp.stat(p);
      out.push({ name: e.name, rel: e.name, path: p, mtimeMs: st.mtimeMs, isDir: e.isDirectory() });
    } catch {
      // 打不开的（权限/正在写入）跳过，不让整个列表失败
    }
  }
  return out;
}

/** 桌面顶层条目（文件夹不展开：一个目录 = 一个图标） */
async function scanDesktop() {
  return scanDir(desktopDir());
}

async function loadFences() {
  const raw = await storage.get('fences');
  return Array.isArray(raw) ? raw : null;
}

/**
 * 围栏的读取 + 一次性迁移。
 * ★ 迁移只做一次：schema 标记写进去之后，用户后来改的栏不会被下一次请求覆盖
 *   （早期版本每次 /state 都重建，用户自己建的栏会莫名消失）。
 */
async function ensureFences() {
  const existing = await loadFences();
  const schema = await storage.get('fencesSchema');
  if (Array.isArray(existing) && schema === SCHEMA_VERSION) return existing;

  const entries = await scanDesktop();
  const fences = defaultFences(entries.some((e) => e.isDir));
  await storage.set('fences', fences);
  await storage.set('fencesSchema', SCHEMA_VERSION);
  // 旧指派指向的是旧栏 id，重建后全部失效 —— 清空让用户重新拖，比留一堆孤儿指派直观
  await storage.set('assign', {});
  return fences;
}

async function buildState() {
  const fences = await ensureFences();
  const entries = await scanDesktop();

  // 传送门分组：镜像真实目录（条目路径指向目录内，不复制文件）
  const portalEntries = [];
  for (const f of fences) {
    if (f.kind === 'portal' && f.portal) {
      const inner = await scanDir(f.portal);
      for (const e of inner) portalEntries.push({ ...e, portalOf: f.id });
    }
  }

  const assign = (await storage.get('assign')) || {};
  const all = [...portalEntries, ...entries];
  const items = buildItems(all, fences, assign).map((it, i) => {
    const { portalOf, ...rest } = it;
    return portalOf ? { ...rest, fenceId: portalOf } : rest;
  });
  return { fences, items };
}

/* ---------------- 配置 ---------------- */

const DEFAULT_CONFIG = {
  strategy: 'rules',
  timeCluster: { enabled: true, windowDays: 7 },
  projects: [],
  rules: [],
  keep: [],
  maxGroups: 8,
  workEnd: '18:00',
  city: '',
};

async function loadConfig() {
  const raw = (await storage.get('config')) || {};
  return { ...DEFAULT_CONFIG, ...raw, timeCluster: { ...DEFAULT_CONFIG.timeCluster, ...(raw.timeCluster || {}) } };
}

async function bumpRev() {
  revRef += 1;
  await storage.set('rev', revRef);
  return revRef;
}

/* ---------------- 布局 ---------------- */

/** 围栏 → layout.js 的输入形状（它只认扁平的 x/y/w/h） */
function toLayoutInput(fences, items) {
  const count = new Map();
  for (const it of items || []) {
    const k = it && it.fenceId;
    if (k) count.set(k, (count.get(k) || 0) + 1);
  }
  return (fences || []).map((f) => {
    const r = f.rect && typeof f.rect === 'object' ? f.rect : DEFAULT_RECT;
    return {
      id: f.id,
      x: Number(r.x) || 0,
      y: Number(r.y) || 0,
      w: Number(r.w) || DEFAULT_RECT.w,
      h: Number(r.h) || DEFAULT_RECT.h,
      items: new Array(count.get(f.id) || 0).fill(0),
    };
  });
}

/** 方案对外形状：stats 里的计数平铺一层，调用方（工具/前端）不必再去 stats 里掏 */
function planShape(base, planId) {
  return { planId, ...base, kept: base.stats.kept, total: base.stats.total, grouped: base.stats.grouped };
}

function bottomOf(list) {
  return list.reduce((m, r) => Math.max(m, (Number(r.y) || 0) + (Number(r.h) || 0)), 0);
}

/** 新分组落位：向右找空位，找不到就往下换行（不让新卡片压住已有卡片） */
function placeFence(fences) {
  const rects = (fences || []).map((f) => f.rect || DEFAULT_RECT).filter(Boolean);
  if (rects.length === 0) return { ...DEFAULT_RECT };
  let x = DEFAULT_RECT.x;
  let y = DEFAULT_RECT.y;
  let guard = 0;
  const hits = (r) => rects.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
  while (hits({ ...DEFAULT_RECT, x, y }) && guard < 200) {
    x += DEFAULT_RECT.w + COL_GAP;
    if (x + DEFAULT_RECT.w > 1920) { x = DEFAULT_RECT.x; y += DEFAULT_RECT.h + COL_GAP; }
    guard += 1;
  }
  return { ...DEFAULT_RECT, x, y };
}

/* ---------------- 文件移动 / 回滚 ---------------- */

function uniqueTarget(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base} (${i})${ext}`))) i += 1;
  return path.join(dir, `${base} (${i})${ext}`);
}

async function pushOplog(ops) {
  const log = (await storage.get('oplog')) || [];
  const opId = randomUUID();
  log.push({ id: opId, ts: Date.now(), ops });
  await storage.set('oplog', log.slice(-50));
  return opId;
}

/* ---------------- AI 增强（可选） ---------------- */

/**
 * 只把「规则没覆盖的文件名 + 已有组名」交给模型，让它补归组建议。
 * 任何一步不成就返回 null，由调用方回落规则 —— 不弹错框、不中断整理。
 */
async function aiSuggest(unclassified, groupNames, files) {
  const h = host();
  // ★ 宿主桥暴露的是 llmJson（apps/server/src/host-bridge.ts:149），不是 llm.json。
  //   写错名字不会报错 —— 只会永远走 no-model 回落，表现为"AI 增强从来没生效过"。
  const llmJson = h && (h.llmJson || (h.llm && h.llm.json));
  if (typeof llmJson !== 'function') return { error: { code: 'no-model' } };
  if (unclassified.length === 0) return { groups: [] };
  try {
    const out = await llmJson({
      system: '你是桌面整理助手。只输出 JSON：{"groups":[{"name":"分组名","files":["文件名"]}]}。只能使用给定的文件名与已存在的分组名，不得编造。',
      user: `已有分组：${groupNames.join('、') || '（无）'}\n待归类文件：${unclassified.slice(0, 200).join('、')}`,
      maxTokens: 2000,
      timeoutMs: 20000,
    });
    if (!out || typeof out !== 'object') return { error: { code: 'bad-json' } };
    const v = validateAiPlan(out, unclassified, { maxGroups: DEFAULT_CONFIG.maxGroups });
    if (!v.ok) return { error: { code: 'invalid', reason: v.error } };
    return { groups: v.groups };
  } catch (e) {
    return { error: { code: 'timeout', reason: e instanceof Error ? e.message : String(e) } };
  }
}

/* ---------------- 路由 ---------------- */

const BAD_NAME = /[\\/:*?"<>|]/;

function mountRoutes(app) {
  const ok = (res, data) => res.json({ data });
  const fail = (res, code, error) => res.status(code).json({ error });

  app.get('/state', async (_req, res) => {
    try {
      const { fences, items } = await buildState();
      ok(res, { fences, items, rev: revRef });
    } catch (e) {
      fail(res, 500, e instanceof Error ? e.message : String(e));
    }
  });

  app.get('/rev', async (_req, res) => ok(res, { rev: revRef }));

  app.get('/config', async (_req, res) => ok(res, await loadConfig()));

  app.put('/config', async (req, res) => {
    const patch = (req.body && typeof req.body === 'object') ? req.body : {};
    const cur = await loadConfig();
    const next = {
      ...cur,
      ...patch,
      timeCluster: { ...cur.timeCluster, ...(patch.timeCluster || {}) },
    };
    await storage.set('config', next);
    await bumpRev();
    ok(res, next);
  });

  app.post('/assign', async (req, res) => {
    const { name, fenceId } = (req.body || {});
    if (!name || BAD_NAME.test(String(name))) return fail(res, 400, '非法文件名');
    const fences = await ensureFences();
    if (!fences.some((f) => f.id === fenceId)) return fail(res, 404, '围栏不存在');
    const assign = (await storage.get('assign')) || {};
    assign[String(name)] = fenceId;
    await storage.set('assign', assign);
    await bumpRev();
    return ok(res, { name, fenceId });
  });

  app.post('/fences', async (req, res) => {
    const { label, portal } = (req.body || {});
    const name = String(label || '').trim();
    if (!name || BAD_NAME.test(name)) return fail(res, 400, '非法分组名');
    const fences = await ensureFences();
    if (fences.some((f) => f.label === name)) return fail(res, 409, '分组名已存在');
    let kind = 'custom';
    if (portal) {
      const p = String(portal);
      let st = null;
      try { st = await fsp.stat(p); } catch { st = null; }
      if (!st || !st.isDirectory()) return fail(res, 400, 'portal 目录不存在');
      kind = 'portal';
    }
    const fence = {
      id: `f-${randomUUID().slice(0, 8)}`,
      kind,
      label: name,
      sort: 'name',
      rect: placeFence(fences),
      ...(portal ? { portal: String(portal) } : {}),
    };
    fences.push(fence);
    await storage.set('fences', fences);
    await bumpRev();
    return ok(res, fence);
  });

  app.patch('/fences/:id', async (req, res) => {
    const fences = await ensureFences();
    const f = fences.find((x) => x.id === req.params.id);
    if (!f) return fail(res, 404, '围栏不存在');
    const b = req.body || {};
    if (b.label !== undefined) {
      const name = String(b.label).trim();
      if (!name || BAD_NAME.test(name)) return fail(res, 400, '非法分组名');
      f.label = name;
    }
    if (b.rect && typeof b.rect === 'object') f.rect = { ...(f.rect || DEFAULT_RECT), ...b.rect };
    if (b.sort !== undefined) f.sort = String(b.sort);
    // 折叠只记状态：rect.h 保持原值，展开时按原高度复原
    if (b.collapsed !== undefined) f.collapsed = b.collapsed === true;
    await storage.set('fences', fences);
    await bumpRev();
    return ok(res, f);
  });

  app.delete('/fences/:id', async (req, res) => {
    if (req.params.id === INBOX_ID) return fail(res, 400, '「待归类」不可删除');
    const fences = await ensureFences();
    const idx = fences.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return fail(res, 404, '围栏不存在');
    fences.splice(idx, 1);
    await storage.set('fences', fences);
    // 指向已删围栏的指派必须清掉，否则条目会静默落回待归类（表现为"我拖过但没记住"）
    const assign = (await storage.get('assign')) || {};
    for (const k of Object.keys(assign)) if (assign[k] === req.params.id) delete assign[k];
    await storage.set('assign', assign);
    await bumpRev();
    return ok(res, { id: req.params.id });
  });

  app.get('/widgets', async (_req, res) => ok(res, { widgets: (await storage.get('widgets')) || [] }));

  app.put('/widgets', async (req, res) => {
    const bounds = (req.body && req.body.bounds) || { w: 1920, h: 1080 };
    const v = validateWidgets((req.body || {}).widgets, bounds);
    if (!v.ok) return fail(res, 400, v.error);
    await storage.set('widgets', dedupeWidgets(v.widgets));
    await bumpRev();
    return ok(res, { widgets: v.widgets });
  });

  app.get('/widgets/data', async (req, res) => {
    const contract = String((req.query || {}).contract || '');
    const params = { ...(req.query || {}) };
    delete params.contract;
    try {
      if (contract === 'desktop.recent') {
        const files = await scanDesktop();
        return ok(res, { files: files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 12) });
      }
      if (contract === 'fences.summary') {
        const { fences, items } = await buildState();
        const count = new Map();
        for (const it of items) count.set(it.fenceId, (count.get(it.fenceId) || 0) + 1);
        return ok(res, { fences: fences.map((f) => ({ id: f.id, label: f.label, count: count.get(f.id) || 0 })) });
      }
      if (contract === 'todos.list') {
        const items = (await storage.get('todos')) || [];
        const max = Number(params.max) || 6;
        return ok(res, { items: items.filter((t) => !t.done).slice(0, max) });
      }
      if (contract === 'memo.text') {
        const id = String(params.id || 'memo-1');
        return ok(res, { text: ((await storage.get('memo')) || {})[id] || '' });
      }
      if (contract === 'folder.items') {
        const rel = String(params.rel || '').trim();
        if (!rel) return fail(res, 500, '未指定文件夹');
        const base = desktopDir();
        const target = path.resolve(base, rel);
        if (target !== base && !target.startsWith(base + path.sep)) return fail(res, 500, '路径越界');
        const entries = await scanDir(target);
        entries.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'zh'));
        return ok(res, { items: entries, total: entries.length });
      }
      if (contract === 'weather.current') {
        const cfg = await loadConfig();
        const city = String(params.city || cfg.city || '').trim();
        // ★ 没配城市必须明确报错：静默返回空会让天气组件白屏，用户不知道该去哪里配
        if (!city) return fail(res, 500, '未配置城市（在设置里填写后重试）');
        const h = host();
        if (!h || typeof h.runReadContract !== 'function') return fail(res, 500, '宿主未提供取数契约');
        const r = await h.runReadContract('weather.current', currentUserId(), { city });
        if (!r || r.ok === false) return fail(res, 500, (r && r.error) || '天气取数失败');
        return ok(res, r.data);
      }
      if (contract.startsWith('tasks.')) {
        const h = host();
        if (!h || typeof h.runReadContract !== 'function') return fail(res, 500, '宿主未提供取数契约');
        const r = await h.runReadContract(contract, currentUserId(), params);
        if (!r || r.ok === false) return fail(res, 500, (r && r.error) || '取数失败');
        return ok(res, r.data);
      }
      return fail(res, 500, `未知取数契约: ${contract}`);
    } catch (e) {
      return fail(res, 500, e instanceof Error ? e.message : String(e));
    }
  });

  app.get('/memo/:id', async (req, res) => {
    const memos = (await storage.get('memo')) || {};
    return ok(res, { id: req.params.id, text: memos[req.params.id] || '' });
  });

  app.put('/memo/:id', async (req, res) => {
    const memos = (await storage.get('memo')) || {};
    const text = String((req.body || {}).text || '');
    memos[req.params.id] = text;
    await storage.set('memo', memos);
    // ★ 不 bump rev：便签在组件页里一边打字一边保存，bump 会让前端重建组件、输入框丢焦点
    return ok(res, { id: req.params.id, text });
  });

  app.get('/todos', async (_req, res) => ok(res, { items: (await storage.get('todos')) || [] }));

  app.post('/todos', async (req, res) => {
    const b = req.body || {};
    const text = String(b.text || '').trim();
    if (!text) return fail(res, 400, '待办内容不能为空');
    const todo = {
      id: randomUUID(),
      text,
      startAt: Number(b.startAt) || 0,
      done: false,
      createdAt: Date.now(),
    };
    const items = (await storage.get('todos')) || [];
    items.push(todo);
    await storage.set('todos', items);
    await bumpRev();
    return ok(res, todo);
  });

  app.patch('/todos/:id', async (req, res) => {
    const items = (await storage.get('todos')) || [];
    const t = items.find((x) => x.id === req.params.id);
    if (!t) return fail(res, 404, '待办不存在');
    if (req.body && req.body.done !== undefined) t.done = req.body.done === true;
    if (req.body && req.body.text !== undefined) t.text = String(req.body.text);
    if (req.body && req.body.startAt !== undefined) t.startAt = Number(req.body.startAt) || 0;
    await storage.set('todos', items);
    await bumpRev();
    return ok(res, t);
  });

  app.delete('/todos/:id', async (req, res) => {
    const items = (await storage.get('todos')) || [];
    const idx = items.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return fail(res, 404, '待办不存在');
    items.splice(idx, 1);
    await storage.set('todos', items);
    await bumpRev();
    return ok(res, { id: req.params.id });
  });

  app.post('/reminders/scan', async (_req, res) => {
    const todos = (await storage.get('todos')) || [];
    const cfg = await loadConfig();
    const fired = (await storage.get('reminderFired')) || {};
    const { due, fired: nextFired } = computeDue(todos, Date.now(), { fired, workEnd: cfg.workEnd });
    await storage.set('reminderFired', nextFired);
    const queue = (await storage.get('reminderQueue')) || [];
    for (const d of due) {
      const key = d.kind === 'start' ? `start:${d.todo.id}` : 'batch';
      if (queue.some((q) => q.key === key)) continue;
      queue.push({ key, kind: d.kind, text: describeDue(d), at: Date.now() });
    }
    await storage.set('reminderQueue', queue);
    return ok(res, { queued: due.length });
  });

  app.post('/reminders/drain', async (_req, res) => {
    const queue = (await storage.get('reminderQueue')) || [];
    await storage.set('reminderQueue', []);
    // 取走即清空：提醒不做"补送"，漏了就是漏了，反复弹同一条更烦
    return ok(res, { items: queue });
  });

  app.post('/organize/plan', async (req, res) => {
    const b = req.body || {};
    const modes = { files: true, layout: true, neat: true, ...(b.modes || {}) };
    const width = Number(b.width) || 1440;
    const height = Number(b.height) || 900;
    const { fences, items } = await buildState();
    const cfg = await loadConfig();
    const planId = randomUUID();

    let layout = null;
    if (modes.layout) {
      const input = toLayoutInput(fences, items);
      const before = input.map((f) => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h }));
      const map = layoutPlan(input, { width, height, neat: modes.neat !== false });
      const changes = [];
      for (const f of before) {
        const to = map.get(f.id);
        if (!to) continue;
        const target = modes.neat === false ? { ...to, w: f.w } : { ...to, w: snapWidth(to.w) };
        if (target.x === f.x && target.y === f.y && target.w === f.w && target.h === f.h) continue;
        changes.push({ id: f.id, from: { x: f.x, y: f.y, w: f.w, h: f.h }, to: target });
      }
      const after = before.map((f) => {
        const c = changes.find((x) => x.id === f.id);
        return c ? { ...f, ...c.to } : f;
      });
      layout = { before: { bottom: bottomOf(before) }, after: { bottom: bottomOf(after) }, changes };
    }

    let files = null;
    if (modes.files) {
      const entries = await scanDesktop();
      const base = buildPlan(entries.map((e) => ({ name: e.name, mtimeMs: e.mtimeMs })), normalizeCfg(cfg), Date.now());
      files = planShape(base, planId);
    }

    plans.set(planId, { layout, files, createdAt: Date.now() });
    return ok(res, { planId, layout: layout || { changes: [] }, files });
  });

  app.post('/organize/apply', async (req, res) => {
    const { planId, confirmed } = (req.body || {});
    if (confirmed !== true) return fail(res, 400, '需要 confirmed=true 才会执行');
    const plan = plans.get(planId);
    if (!plan) return fail(res, 400, '方案不存在或已执行过');
    plans.delete(planId);

    const fences = await ensureFences();
    const ops = [];
    const changes = (plan.layout && plan.layout.changes) || [];
    for (const c of changes) {
      const f = fences.find((x) => x.id === c.id);
      if (!f) continue;
      ops.push({ type: 'layout', fenceId: f.id, prevRect: { ...(f.rect || DEFAULT_RECT) }, nextRect: { ...c.to } });
      f.rect = { ...c.to };
    }
    await storage.set('fences', fences);

    const opId = ops.length ? await pushOplog(ops) : randomUUID();
    await bumpRev();
    return ok(res, { ok: true, opId, applied: ops.length });
  });

  app.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    // 先推一次当前 rev：前端拿到就能判断要不要拉全量，避免首帧重复请求
    res.write(`retry: 3000\n\n`);
    res.write(`event: rev\ndata: ${revRef}\n\n`);
    const client = { res };
    sseClients.add(client);
    if (typeof req.on === 'function') {
      req.on('close', () => {
        sseClients.delete(client);
      });
    }
  });
}

function currentUserId() {
  const h = host();
  try {
    if (h && h.db && typeof h.db.prepare === 'function') {
      const row = h.db.prepare('SELECT id FROM user LIMIT 1').get();
      return (row && row.id) || '';
    }
  } catch {
    return '';
  }
  return '';
}

/* ---------------- 智能体工具 ---------------- */

async function toolScan() {
  const entries = await scanDesktop();
  const cfg = await loadConfig();
  const plan = buildPlan(entries.map((e) => ({ name: e.name, mtimeMs: e.mtimeMs })), normalizeCfg(cfg), Date.now());
  return {
    files: entries.length,
    rulePreview: { ...plan, kept: plan.stats.kept },
    strategy: cfg.strategy,
  };
}

async function toolPlan(args) {
  const cfg = await loadConfig();
  const strategy = String((args && args.strategy) || cfg.strategy || 'rules');
  const entries = await scanDesktop();
  const files = entries.map((e) => ({ name: e.name, mtimeMs: e.mtimeMs }));
  const norm = normalizeCfg(cfg);
  const base = buildPlan(files, norm, Date.now());
  const planId = randomUUID();

  if (strategy !== 'ai') {
    plans.set(planId, { files: base, layout: null, createdAt: Date.now() });
    return { mode: 'rules', ...planShape(base, planId) };
  }

  const ai = await aiSuggest(base.unclassified, base.groups.map((g) => g.name), files);
  const merged = ai && ai.groups ? mergeAiPlan(base, ai.groups, norm) : base;
  plans.set(planId, { files: merged, layout: null, createdAt: Date.now() });
  const out = { mode: ai && ai.groups ? 'ai' : 'rules', ...planShape(merged, planId) };
  if (!ai || !ai.groups) {
    out.fallback = (ai && ai.error) || { code: 'no-model' };
    out.note = 'AI 不可用，已按规则生成';
  }
  return out;
}

async function toolApply(args) {
  const { planId, confirmed } = args || {};
  if (confirmed !== true) return { ok: false, reason: '需要 confirmed=true 才会移动文件' };
  const plan = plans.get(planId);
  if (!plan || !plan.files) return { ok: false, reason: '方案不存在或已执行过' };
  plans.delete(planId);

  const root = desktopDir();
  const ops = [];
  let moved = 0;
  for (const g of plan.files.groups || []) {
    const targetDir = path.join(root, g.name);
    try {
      await fsp.mkdir(targetDir, { recursive: true });
    } catch {
      continue;
    }
    for (const name of g.files || []) {
      const from = path.join(root, name);
      if (!fs.existsSync(from)) continue;
      const to = uniqueTarget(targetDir, name);
      try {
        await fsp.rename(from, to);
        ops.push({ type: 'move', from, to });
        moved += 1;
      } catch {
        // 单个文件失败（被占用/权限）不中断整批，跳过并在结果里体现
      }
    }
  }
  const opId = await pushOplog(ops);
  await bumpRev();
  return { ok: true, opId, moved };
}

async function toolUndo(args) {
  const { opId, confirmed } = args || {};
  if (confirmed !== true) return { ok: false, reason: '需要 confirmed=true 才会回滚' };
  const log = (await storage.get('oplog')) || [];
  const entry = log.find((e) => e.id === opId);
  if (!entry) return { ok: false, reason: '未找到该批次记录' };

  let reverted = 0;
  const ops = [...(entry.ops || [])].reverse();
  for (const op of ops) {
    try {
      if (op.type === 'move') {
        // 用户已改动过的文件不猜：源不在就跳过，如实回报
        if (!fs.existsSync(op.to)) continue;
        if (fs.existsSync(op.from)) continue;
        await fsp.rename(op.to, op.from);
        reverted += 1;
      } else if (op.type === 'layout') {
        const fences = await ensureFences();
        const f = fences.find((x) => x.id === op.fenceId);
        if (!f) continue;
        f.rect = { ...op.prevRect };
        await storage.set('fences', fences);
        reverted += 1;
      }
    } catch {
      // 继续回滚其余项
    }
  }
  await bumpRev();
  return { ok: true, opId, reverted, skipped: ops.length - reverted };
}

function textResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

/* ---------------- 组件工具 ---------------- */

function withGeneratedIds(list) {
  if (!Array.isArray(list)) return list;
  return list.map((w) => {
    if (!w || typeof w !== 'object' || w.id) return w;
    return { ...w, id: `w-${w.type || 'widget'}-${randomUUID().slice(0, 8)}` };
  });
}

async function toolWidgetList() {
  return {
    widgets: dedupeWidgets((await storage.get('widgets')) || []),
    catalog: widgetCatalog(),
  };
}

async function toolWidgetSet(args) {
  const bounds = args && args.bounds && typeof args.bounds === 'object'
    ? { w: Number(args.bounds.w) || 1920, h: Number(args.bounds.h) || 1080 }
    : { w: 1920, h: 1080 };
  const v = validateWidgets(withGeneratedIds(args && args.widgets), bounds);
  if (!v.ok) return { ok: false, error: v.error };
  const widgets = dedupeWidgets(v.widgets);
  await storage.set('widgets', widgets);
  await bumpRev();
  return { ok: true, widgets };
}

const TOOLS = [
  {
    name: 'desktop_scan',
    description: '扫描桌面顶层文件，给出规则方案的预览（不移动任何文件）',
    inputSchema: { type: 'object', properties: {} },
    execute: async (_args, _ctx) => textResult(await toolScan()),
  },
  {
    name: 'desktop_plan',
    description: '生成桌面整理方案（strategy: rules 默认 / ai 增强），只出方案不移动',
    inputSchema: { type: 'object', properties: { strategy: { type: 'string', enum: ['rules', 'ai'] } } },
    execute: async (args, _ctx) => textResult(await toolPlan(args || {})),
  },
  {
    name: 'desktop_apply',
    description: '按方案移动桌面文件（必须 confirmed=true），同名自动改名，可整批回滚',
    inputSchema: { type: 'object', properties: { planId: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['planId', 'confirmed'] },
    execute: async (args, _ctx) => textResult(await toolApply(args || {})),
  },
  {
    name: 'desktop_undo',
    description: '按 opId 逆序回滚一批整理动作（必须 confirmed=true）',
    inputSchema: { type: 'object', properties: { opId: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['opId', 'confirmed'] },
    execute: async (args, _ctx) => textResult(await toolUndo(args || {})),
  },
  {
    name: 'desktop_widget_list',
    description: '列出桌面悬浮组件，并返回可创建的类型目录（types / layers / contracts / configSchema / 数量与尺寸上限）',
    inputSchema: { type: 'object', properties: {} },
    execute: async (_args, _ctx) => textResult(await toolWidgetList()),
  },
  {
    name: 'desktop_widget_set',
    description: '整体覆盖桌面悬浮组件（先 widget_list 再改再 set）。组件缺 id 时自动生成；位置越界会被钳制到屏幕内，校验失败整组不落盘',
    inputSchema: {
      type: 'object',
      properties: {
        widgets: { type: 'array', items: { type: 'object' }, description: '组件数组（最多 12 个）' },
        bounds: { type: 'object', properties: { w: { type: 'number' }, h: { type: 'number' } }, description: '屏幕尺寸，默认 1920×1080' },
      },
      required: ['widgets'],
    },
    execute: async (args, _ctx) => textResult(await toolWidgetSet(args || {})),
  },
];

/* ---------------- 插件生命周期 ---------------- */

export const desktopManagerModule = {
  id: 'desktop-manager',

  activate(ctx) {
    ctxRef = ctx;
    storage = ctx.storage;
    plans.clear();
    sseClients.clear();
    if (typeof ctx.registerTool === 'function') {
      for (const t of TOOLS) ctx.registerTool(t);
    }
    if (typeof ctx.registerBackendRoute === 'function') {
      ctx.registerBackendRoute(mountRoutes);
    }
    // rev 从持久化恢复：进程重启后前端拿到的 rev 必须是递增的，否则永远拉不到新状态
    storage.get('rev').then((v) => { revRef = Number(v) || 0; }).catch(() => { revRef = 0; });
    heartbeat = setInterval(() => {
      for (const c of sseClients) {
        try { c.res.write(': ping\n\n'); } catch { sseClients.delete(c); }
      }
    }, 30000);
    // 心跳定时器不能阻止进程退出（测试/prod 关闭时都要干净）
    if (heartbeat && typeof heartbeat.unref === 'function') heartbeat.unref();
    log('desktop-manager 已激活');
  },

  deactivate() {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    for (const c of sseClients) {
      try { c.res.end(); } catch { /* ignore */ }
    }
    sseClients.clear();
    plans.clear();
    ctxRef = null;
    storage = null;
  },
};

export default desktopManagerModule;
