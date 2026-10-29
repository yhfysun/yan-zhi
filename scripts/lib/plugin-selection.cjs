/**
 * 打包可选插件：选择集解析（纯逻辑，无副作用 —— 可单测、可被 package.cjs / 构建器 / 断言共用）。
 *
 * 输入三选一（优先级从高到低）：
 *   · --plugins=a,b / mode,feature / all   ← P5 新增，按**插件 id** 选
 *   · --modes=office,dev                   ← 兼容旧参数，按**模式 key** 映射到插件
 *   · --edition=lite 的 catalog.editionPresets（build-all-editions 多档取并集）
 *
 * 三条硬规则：
 *   1) office-core 恒在 —— 办公是应用基座，任何选择集都不允许裁掉（与 catalog 契约一致）；
 *   2) requires 自动闭包 —— 选 ops-shell 会自动带上 cicd-pipeline / java-suite；
 *   3) 未知 id / 未知分组一律抛错 —— 静默忽略会打出「名字是精简、内容是全量/缺件」的包。
 *
 * ★ 两种特殊输入：
 *   · `none`：只保留 office-core（"一个插件都不带"的唯一合法形态 —— 办公基座不可裁）；
 *   · 可选插件（plugins/optional/*，可后装）：由调用方以 `optional` 传入。它们是**点名才带**，
 *     不参加 all / 默认全量 / 档位预设 —— 否则每个包都会莫名其妙多出可后装插件。
 */
const NONE_TOKEN = 'none';

const GROUP_KEYWORDS = {
  // all = 清单里的内置插件；可选插件（可后装）不在其内，必须点名
  all: (id, e) => !e.optional,
  mode: (id, e) => e.kind === 'mode',
  feature: (id, e) => e.kind === 'feature',
  resource: (id, e) => e.kind === 'resource',
  skins: (id) => id === 'skins',
  skin: (id) => id === 'skins',
};

const OFFICE_ID = 'office-core';

function parseList(raw) {
  if (raw === undefined || raw === null) return null;
  const list = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : null;
}

/** 可选插件入参归一：接受数组或 {id: entry} 映射。 */
function normalizeOptional(optional) {
  if (!optional) return [];
  const list = Array.isArray(optional) ? optional : Object.entries(optional).map(([id, e]) => ({ id, ...e }));
  return list.filter((e) => e && typeof e.id === 'string' && e.id);
}

/**
 * 解析选择集。
 * @param {object} opts
 * @param {object} opts.catalog     plugins.catalog.json（内置插件真相源）
 * @param {Array|object} [opts.optional] 可选插件（plugins/optional/*），点名才带
 * @returns {{ ids: string[], excluded: string[], source: 'plugins'|'modes'|'editions'|'all' }}
 */
function resolvePluginSelection({ catalog, optional, plugins, modes, editions } = {}) {
  const catalogEntries = (catalog && catalog.plugins) || {};
  const catalogIds = Object.keys(catalogEntries);
  if (!catalogIds.length) throw new Error('catalog.plugins 为空');

  // 合并可选插件：catalog 已声明的 id 以 catalog 为准（不重复、不覆盖）
  const entries = { ...catalogEntries };
  const optionalIds = [];
  for (const opt of normalizeOptional(optional)) {
    if (entries[opt.id]) continue;
    entries[opt.id] = { ...opt, kind: opt.kind || 'optional', optional: true };
    optionalIds.push(opt.id);
  }
  const allIds = [...catalogIds, ...optionalIds];

  const picked = new Set();
  const add = (id, via) => {
    if (!entries[id]) throw new Error(`未知插件: ${id}${via ? `（来自 ${via}）` : ''}`);
    if (picked.has(id)) return;
    picked.add(id);
    for (const dep of entries[id].requires || []) add(dep, `${id}.requires`);
  };

  const pluginTokens = parseList(plugins);
  const modeTokens = parseList(modes);
  let source;

  if (pluginTokens) {
    source = 'plugins';
    const noneTokens = pluginTokens.filter((t) => t.toLowerCase() === NONE_TOKEN);
    if (noneTokens.length) {
      // none 表达的是"只留基座"，与任何具体插件并列都是自相矛盾的输入
      if (pluginTokens.length > 1) {
        throw new Error('--plugins=none 不能与其他插件同时使用（它表示只保留 office-core）');
      }
    } else {
      for (const token of pluginTokens) {
        const group = GROUP_KEYWORDS[token.toLowerCase()];
        if (group) {
          const hit = allIds.filter((id) => group(id, entries[id]));
          if (!hit.length) throw new Error(`分组 ${token} 未匹配到任何插件`);
          for (const id of hit) add(id, `分组 ${token}`);
          continue;
        }
        add(token, '--plugins');
      }
    }
  } else if (modeTokens) {
    source = 'modes';
    const byMode = new Map();
    for (const [id, e] of Object.entries(entries)) {
      if (!e.modeKey) continue;
      // 一个 modeKey 只应对应一个插件；重复说明 catalog 有问题，早报比打包时发现好
      if (byMode.has(e.modeKey)) throw new Error(`modeKey 重复: ${e.modeKey}（${byMode.get(e.modeKey)} / ${id}）`);
      byMode.set(e.modeKey, id);
    }
    for (const m of modeTokens) {
      const id = byMode.get(m);
      if (!id) throw new Error(`未知模式: ${m}（可用: ${[...byMode.keys()].join(' / ')}）`);
      add(id, `--modes=${m}`);
    }
  } else if (Array.isArray(editions) && editions.length) {
    source = 'editions';
    const presets = (catalog && catalog.editionPresets) || {};
    for (const ed of editions) {
      const preset = presets[ed];
      if (!preset) throw new Error(`未知构建档: ${ed}（可选: ${Object.keys(presets).join(' / ')}）`);
      for (const id of preset) add(id, `档位 ${ed}`);
    }
  } else {
    source = 'all';
    // 默认全量 = catalog 全部内置插件；可选插件（可后装）不随默认包分发
    for (const id of catalogIds) add(id, '默认全量');
  }

  // 规则 1：办公基座锁定
  add(OFFICE_ID, 'office-core 恒在');

  const ids = allIds.filter((id) => picked.has(id));
  const excluded = allIds.filter((id) => !picked.has(id));
  return { ids, excluded, source };
}

module.exports = { resolvePluginSelection, parseList, GROUP_KEYWORDS, NONE_TOKEN, OFFICE_ID };
