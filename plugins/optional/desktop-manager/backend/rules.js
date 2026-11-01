// 桌面整理规则引擎（纯函数：不碰文件系统、不调模型，可单测、可复现）
//
// ★ 定位：**默认策略**。整理桌面的第一选择永远是它 —— 零模型调用、同输入同输出、
//   用户能预期结果。AI 增强只在规则没覆盖到的文件上补一刀（见 validateAiPlan / mergeAiPlan）。
//
// ★ 判定顺序（唯一出口，别在别处重写）：
//     用户规则(priority 降序) → 项目关键词 → 时间簇 → 内置扩展名表 → 未归类(null)

/** 内置扩展名表：只认常见类型，认不出的**返回 null 让用户自己决定**，不猜 */
const EXT_GROUPS = [
  { group: '文档', exts: ['doc', 'docx', 'pdf', 'txt', 'md', 'ppt', 'pptx', 'rtf', 'odt'] },
  { group: '表格', exts: ['xls', 'xlsx', 'csv', 'ods'] },
  { group: '图片', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'heic'] },
  { group: '安装包', exts: ['exe', 'msi', 'dmg', 'pkg', 'apk', 'deb'] },
  { group: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz'] },
  { group: '音视频', exts: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'flac'] },
];

/** 只有这些类目参与时间簇（按时间给照片/视频分堆才有意义；文档按时间分没意义） */
const TIME_CLUSTER_GROUPS = new Set(['图片', '音视频']);

const DEFAULT_KEEP = ['*.lnk', 'desktop.ini', '.*'];
const DEFAULT_MAX_GROUPS = 8;
const DAY_MS = 86400000;

function extOf(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return '';
  return s.slice(i + 1).toLowerCase();
}

/** glob → 正则：支持 * 与 ?，大小写不敏感（Windows 文件系统本身不敏感） */
export function globToRegExp(pattern) {
  const src = String(pattern || '')
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${src}$`, 'i');
}

/**
 * 配置归一化：所有默认值在这里补齐，下游不必再写 `x || default`。
 * 规则项同时支持 { match: '*.pdf' } 与 { ext: 'png' } 两种写法。
 */
export function normalizeCfg(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const rules = (Array.isArray(c.rules) ? c.rules : [])
    .filter((r) => r && (r.match || r.ext) && r.group)
    .map((r) => ({
      pattern: String(r.match || (r.ext ? `*.${String(r.ext).replace(/^\./, '')}` : '')),
      group: String(r.group),
      priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 0,
    }))
    .sort((a, b) => b.priority - a.priority);

  return {
    rules,
    projects: Array.isArray(c.projects) ? c.projects.map(String).filter(Boolean) : [],
    timeCluster: {
      enabled: c.timeCluster ? c.timeCluster.enabled !== false : true,
      windowDays: Number(c.timeCluster && c.timeCluster.windowDays) || 7,
    },
    keep: Array.isArray(c.keep) ? [...DEFAULT_KEEP, ...c.keep.map(String)] : [...DEFAULT_KEEP],
    maxGroups: Number(c.maxGroups) || DEFAULT_MAX_GROUPS,
    targetRoot: c.targetRoot ? String(c.targetRoot) : '',
  };
}

/** 保留名单：快捷方式 / 隐藏文件 / desktop.ini 永不动（动了桌面会"丢图标"） */
export function isKept(name, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : normalizeCfg(cfg);
  const n = String(name || '');
  const keep = Array.isArray(c.keep) ? c.keep : DEFAULT_KEEP;
  if (keep.some((p) => globToRegExp(p).test(n))) return true;
  if (n.toLowerCase() === 'desktop.ini') return true;
  return false;
}

function extGroupOf(name) {
  const ext = extOf(name);
  if (!ext) return null;
  for (const g of EXT_GROUPS) {
    if (g.exts.includes(ext)) return g.group;
  }
  return null;
}

/**
 * 给单个文件判定归组。
 * @returns {{group:string, by:'rule'|'project'|'time'|'ext'}|null} null = 交给人（未归类）
 */
export function classifyFile(file, cfg, rules, now) {
  const c = cfg && typeof cfg === 'object' ? cfg : normalizeCfg(cfg);
  const name = String((file && file.name) || '');
  const list = Array.isArray(rules) && rules.length ? rules : (c.rules || []);

  // 1) 用户规则（已按 priority 降序）
  for (const r of list) {
    if (r && r.pattern && globToRegExp(r.pattern).test(name)) return { group: r.group, by: 'rule' };
  }

  // 2) 项目关键词：文件名里出现项目名就归到该项目的堆
  for (const p of c.projects || []) {
    if (p && name.includes(p)) return { group: p, by: 'project' };
  }

  const group = extGroupOf(name);

  // 3) 时间簇：窗口内的图片/视频单独成堆（"最近7天"比"图片"更好用）
  if (group && TIME_CLUSTER_GROUPS.has(group) && c.timeCluster && c.timeCluster.enabled) {
    const days = c.timeCluster.windowDays || 7;
    const mtime = Number(file && file.mtimeMs) || 0;
    const nowMs = Number(now) || Date.now();
    if (mtime && nowMs - mtime <= days * DAY_MS && nowMs >= mtime) {
      return { group: `${group}·最近${days}天`, by: 'time' };
    }
  }

  // 4) 内置扩展名表
  if (group) return { group, by: 'ext' };

  return null;
}

/**
 * 组内文件按名称排序：保证同输入两次结果逐字段相等（幂等）。
 * ★ 拉丁字母开头的排中文前面：Node 的 zh collation 会把汉字排在拉丁字母前，
 *   而用户习惯是"文件名/英文名在前、中文名在后"（合并 AI 分组时尤其明显）。
 */
function sortNames(names) {
  const isAscii = (s) => /^[\x20-\x7f]/.test(String(s));
  return [...names].sort((a, b) => {
    const aa = isAscii(a);
    const bb = isAscii(b);
    if (aa !== bb) return aa ? -1 : 1;
    return String(a).localeCompare(String(b), 'zh');
  });
}

function emptyStats(total) {
  return { total, kept: 0, grouped: 0 };
}

/**
 * 生成整理方案（只算不移动）。
 * @param {Array} files [{ name, mtimeMs }]
 * @returns {{groups:Array, unclassified:string[], stats:object}}
 */
export function buildPlan(files, cfg, now) {
  const c = cfg && typeof cfg === 'object' ? cfg : normalizeCfg(cfg);
  const list = Array.isArray(files) ? files : [];
  const nowMs = Number(now) || Date.now();
  const rules = c.rules || [];

  const buckets = new Map();
  const unclassified = [];
  let kept = 0;

  for (const f of list) {
    const name = String((f && f.name) || '');
    if (!name) continue;
    if (isKept(name, c)) { kept += 1; continue; }
    const hit = classifyFile(f, c, rules, nowMs);
    if (!hit) { unclassified.push(name); continue; }
    if (!buckets.has(hit.group)) buckets.set(hit.group, []);
    buckets.get(hit.group).push(name);
  }

  let groups = [...buckets.entries()].map(([name, names]) => ({ name, files: sortNames(names), by: 'rule' }));

  // 组数超限：把成员最少的组依次并入「其他」，**一个文件都不丢**
  const max = c.maxGroups || DEFAULT_MAX_GROUPS;
  while (groups.length > max) {
    const others = groups.filter((g) => g.name !== '其他');
    if (others.length === 0) break;
    const smallest = others.reduce((a, b) => (b.files.length < a.files.length ? b : a));
    const rest = groups.filter((g) => g !== smallest);
    let other = rest.find((g) => g.name === '其他');
    if (!other) { other = { name: '其他', files: [], by: 'merge' }; rest.push(other); }
    other.files = sortNames([...other.files, ...smallest.files]);
    groups = rest;
  }

  groups.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const grouped = groups.reduce((n, g) => n + g.files.length, 0);
  return {
    groups,
    unclassified: sortNames(unclassified),
    stats: { total: list.length, kept, grouped },
  };
}

const BAD_GROUP_NAME = /[\\/:*?"<>|]/;

/**
 * AI 方案的五道校验（失败即回落规则，不弹错框）。
 * @param {object} plan AI 返回的 { groups: [{ name, files }] }
 * @param {string[]} allowedFiles 允许出现的文件（= 规则未覆盖的清单）
 * @param {object} cfg 归一化配置
 */
export function validateAiPlan(plan, allowedFiles, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : normalizeCfg(cfg);
  const groups = plan && Array.isArray(plan.groups) ? plan.groups : [];
  const allowed = new Set(Array.isArray(allowedFiles) ? allowedFiles.map(String) : []);
  const max = c.maxGroups || DEFAULT_MAX_GROUPS;
  const seen = new Set();

  if (groups.length > max) return { ok: false, error: `分组数超过上限 ${max}` };

  for (const g of groups) {
    const name = String((g && g.name) || '').trim();
    if (!name || BAD_GROUP_NAME.test(name)) return { ok: false, error: `非法组名: ${name}` };
    const files = Array.isArray(g && g.files) ? g.files.map(String) : [];
    for (const f of files) {
      if (!allowed.has(f)) return { ok: false, error: `AI 编造了不存在的文件: ${f}` };
      if (seen.has(f)) return { ok: false, error: `文件被重复归组: ${f}` };
      seen.add(f);
    }
  }

  return { ok: true, groups: groups.map((g) => ({ name: String(g.name).trim(), files: sortNames((g.files || []).map(String)) })) };
}

/** 把通过校验的 AI 分组并进规则方案：同名组合并，未归类里被点名的移除 */
export function mergeAiPlan(base, aiGroups, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : normalizeCfg(cfg);
  const plan = base && typeof base === 'object'
    ? { groups: [...(base.groups || [])], unclassified: [...(base.unclassified || [])], stats: { ...(base.stats || {}) } }
    : { groups: [], unclassified: [], stats: emptyStats(0) };

  const taken = new Set();
  for (const g of Array.isArray(aiGroups) ? aiGroups : []) {
    const name = String((g && g.name) || '').trim();
    if (!name) continue;
    const files = Array.isArray(g && g.files) ? g.files.map(String) : [];
    let target = plan.groups.find((x) => x.name === name);
    if (!target) { target = { name, files: [], by: 'ai' }; plan.groups.push(target); }
    target.files = sortNames([...new Set([...target.files, ...files])]);
    for (const f of files) taken.add(f);
  }

  plan.unclassified = sortNames(plan.unclassified.filter((n) => !taken.has(n)));
  plan.groups.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const grouped = plan.groups.reduce((n, g) => n + g.files.length, 0);
  plan.stats = { ...plan.stats, grouped };
  return plan;
}
