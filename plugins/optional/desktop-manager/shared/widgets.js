// 桌面悬浮组件的校验器（纯函数，前后端共用）
//
// ★ 为什么要校验：组件实例是**模型生成或用户手填**的 JSON，直接拿去开窗会出各种
//   "窗口开在屏幕外 / 宽 99999 / 契约不存在导致组件白屏"。这里统一：
//   类型白名单 → 契约存在性 → 配置按 schema 填默认 → 位置边界钳制。
//   原则：**不抛异常**，一律返回 { ok: false, error }，让调用方能直接把错误说给用户听。

/** 取数契约白名单：组件只能声明这里列出的契约，宿主按名字分派 */
export const CONTRACTS = [
  'desktop.recent',
  'fences.summary',
  'tasks.today',
  'weather.current',
  'folder.items',
  'todos.list',
  'memo.text',
];

const TYPES = ['clock', 'list', 'metric', 'status', 'text', 'link', 'weather', 'todos', 'memo', 'folder'];
const LAYERS = ['desktop', 'overlay'];
const MAX_WIDGETS = 12;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** 这些类型必须声明取数契约，否则组件没有数据源（等于白屏） */
const NEEDS_SOURCE = new Set(['list', 'metric', 'status', 'weather', 'todos', 'memo', 'folder']);

/** 配置 schema：默认值 + 必填项 + 取值域 */
const CONFIG_SCHEMA = {
  clock: { showSeconds: false },
  list: { max: 6, title: '' },
  metric: { max: 1, title: '' },
  status: { max: 5, title: '' },
  text: { text: '', size: 'md' },
  link: { label: '', path: '' },
  weather: { city: '', title: '天气', days: 2 },
  todos: { max: 6, title: '待办' },
  memo: { title: '便签' },
  folder: { rel: '', max: 8, title: '' },
};

const TEXT_SIZES = ['sm', 'md', 'lg'];
const MAX_TEXT_LEN = 200;
const MIN_H = 60;
const MAX_W = 1200;
const DEFAULT_POS = { x: 40, y: 76, w: 320, h: 200 };

const clamp = (v, lo, hi) => Math.min(Math.max(Number(v) || 0, lo), hi);

function fail(error) {
  return { ok: false, error };
}

/** 按 schema 填默认并校验；返回 { ok, config } 或 { ok:false, error } */
function applyConfig(type, raw) {
  const schema = CONFIG_SCHEMA[type] || {};
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = { ...schema, ...input };

  if (type === 'text') {
    if (typeof out.text !== 'string' || out.text.trim() === '') return fail('text 组件必填 config.text');
    if (out.text.length > MAX_TEXT_LEN) return fail(`config.text 超长（最多 ${MAX_TEXT_LEN} 字）`);
    if (!TEXT_SIZES.includes(out.size)) return fail(`config.size 只能是 ${TEXT_SIZES.join(' / ')}`);
  }
  if (type === 'link' && (typeof out.path !== 'string' || out.path.trim() === '')) {
    return fail('link 组件必填 config.path');
  }
  if (typeof out.max === 'number' && (!Number.isFinite(out.max) || out.max < 1 || out.max > 20)) {
    return fail('config.max 需在 1~20 之间');
  }
  if (type === 'weather') {
    out.days = clamp(out.days, 1, 7);
    if (typeof out.title !== 'string' || !out.title) out.title = '天气';
  }
  return { ok: true, config: out };
}

/** 位置钳制：宽高有上下限，整块必须留在屏幕内（模型爱给 9999 这种值） */
function clampPos(pos, bounds) {
  const b = { w: Number(bounds && bounds.w) || 1280, h: Number(bounds && bounds.h) || 800 };
  const p = pos && typeof pos === 'object' ? pos : {};
  const w = clamp(p.w || DEFAULT_POS.w, MIN_H, Math.min(MAX_W, b.w));
  const h = clamp(p.h || DEFAULT_POS.h, MIN_H, b.h);
  return {
    x: clamp(p.x === undefined ? DEFAULT_POS.x : p.x, 0, Math.max(0, b.w - w)),
    y: clamp(p.y === undefined ? DEFAULT_POS.y : p.y, 0, Math.max(0, b.h - h)),
    w,
    h,
  };
}

/**
 * 校验单个组件。
 * @returns {{ok:true, widget:object}|{ok:false, error:string}}
 */
export function validateWidget(raw, bounds) {
  if (!raw || typeof raw !== 'object') return fail('组件必须是对象');
  const id = String(raw.id || '');
  if (!ID_RE.test(id)) return fail('组件 id 只能是字母/数字/下划线/短横线');
  if (!TYPES.includes(raw.type)) return fail(`未知组件类型: ${raw.type}`);
  const layer = raw.layer || 'desktop';
  if (!LAYERS.includes(layer)) return fail(`未知层级: ${layer}`);

  const cfg = applyConfig(raw.type, raw.config);
  if (!cfg.ok) return fail(cfg.error);

  let source = null;
  if (NEEDS_SOURCE.has(raw.type)) {
    const contract = raw.source && raw.source.contract;
    if (!contract || !CONTRACTS.includes(contract)) return fail('缺少或非法的 source.contract');
    source = { ...raw.source, contract };
  }

  return {
    ok: true,
    widget: {
      id,
      type: raw.type,
      layer,
      pos: clampPos(raw.pos, bounds),
      source,
      config: cfg.config,
    },
  };
}

/** 全局唯一性：这类组件多开没有意义，且会让桌面层互相压 */
const UNIQUE_TYPES = { clock: '时钟', todos: '待办' };

function uniquenessError(widgets) {
  const seenType = new Set();
  const seenCity = new Set();
  for (const w of widgets) {
    if (UNIQUE_TYPES[w.type]) {
      if (seenType.has(w.type)) return `${UNIQUE_TYPES[w.type]}组件只能有一个`;
      seenType.add(w.type);
    }
    if (w.type === 'weather') {
      const city = String((w.config && w.config.city) || '').trim() || '__default__';
      if (seenCity.has(city)) return `同一个城市（${city === '__default__' ? '未指定' : city}）的天气组件只能有一个`;
      seenCity.add(city);
    }
  }
  return null;
}

/** 校验整组：非数组 / 超量 / id 重复 / 唯一性冲突 */
export function validateWidgets(list, bounds) {
  if (!Array.isArray(list)) return fail('widgets 必须是数组');
  if (list.length > MAX_WIDGETS) return fail(`组件数量上限 ${MAX_WIDGETS} 个`);

  const out = [];
  const ids = new Set();
  for (const raw of list) {
    const r = validateWidget(raw, bounds);
    if (!r.ok) return fail(r.error);
    if (ids.has(r.widget.id)) return fail(`组件 id 重复: ${r.widget.id}`);
    ids.add(r.widget.id);
    out.push(r.widget);
  }
  const err = uniquenessError(out);
  if (err) return fail(err);
  return { ok: true, widgets: out };
}

/** 老数据去重：按唯一性规则保留先出现的（修历史脏数据，不报错） */
export function dedupeWidgets(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const ids = new Set();
  const seenType = new Set();
  const seenCity = new Set();
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue;
    const id = String(w.id || '');
    if (!id || ids.has(id)) continue;
    if (UNIQUE_TYPES[w.type]) {
      if (seenType.has(w.type)) continue;
      seenType.add(w.type);
    }
    if (w.type === 'weather') {
      const city = String((w.config && w.config.city) || '').trim() || '__default__';
      if (seenCity.has(city)) continue;
      seenCity.add(city);
    }
    ids.add(id);
    out.push(w);
  }
  return out;
}

/** 给模型/前端看的目录：能生成什么类型、能放哪层、有哪些契约、每项配置的形状 */
export function widgetCatalog() {
  return {
    types: [...TYPES],
    layers: [...LAYERS],
    contracts: CONTRACTS,
    configSchema: JSON.parse(JSON.stringify(CONFIG_SCHEMA)),
    limits: { maxWidgets: MAX_WIDGETS, minH: MIN_H, maxW: MAX_W, textSizes: [...TEXT_SIZES], maxTextLen: MAX_TEXT_LEN },
  };
}
