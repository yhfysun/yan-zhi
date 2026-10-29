/**
 * 剪贴板历史的纯数据变换(2026-10-29,P2 分组与标签 + P1 保留时长)。
 *
 * 单独成模块只为一件事:这些逻辑会**删数据**(超期清理)或**改用户输入**(分组名/标签归一化),
 * 放进 14000 行的 main.cjs 里既没法测也没法审。这里不碰 fs / Electron,
 * node --test 可以直接覆盖;main.cjs 负责读写文件与删图片资产。
 */

const MAX_TAG_LEN = 20;      // 单个标签长度上限(超出截断,避免条目行被撑爆)
const MAX_TAGS = 8;          // 单条最多标签数
const MAX_GROUP_NAME = 24;   // 分组名长度上限

/** 分组名:去首尾空白、折叠内部连续空白、超长截断;空串表示无效 */
function normalizeGroupName(name) {
  const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  if (!n) return '';
  return n.slice(0, MAX_GROUP_NAME);
}

/**
 * 标签归一化:支持数组或「逗号/空格分隔的字符串」,去掉前导 #,
 * 大小写不敏感去重,限制数量与长度。返回新数组(不改入参)。
 */
function normalizeTags(input) {
  const arr = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[,，、\s]+/);
  const out = [];
  for (const raw of arr) {
    const t = String(raw == null ? '' : raw).replace(/^#+/, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const v = t.slice(0, MAX_TAG_LEN);
    if (out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    out.push(v);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * 超期清理:只清理**非置顶**条目,置顶永久保留。
 * retentionDays <= 0 表示「永久」(不做任何清理)。
 * 边界:createdAt 恰好等于截止时间 → 保留(用 < 而不是 <=,避免定时器抖动误删当天的条目)。
 * 返回 { kept, removed },removed 交给调用方删图片资产与注销快捷键。
 */
function pruneByAge(items, retentionDays, now) {
  const days = Number(retentionDays) || 0;
  const list = Array.isArray(items) ? items : [];
  if (days <= 0) return { kept: list.slice(), removed: [] };
  const cutoff = (Number(now) || Date.now()) - days * 86400000;
  const kept = [];
  const removed = [];
  for (const it of list) {
    if (!it) continue;
    // createdAt 缺失/非法(NaN)时 `NaN < cutoff` 为 false → 保留:时间未知不替用户删数据
    if (it.pinned || !(Number(it.createdAt) < cutoff)) kept.push(it);
    else removed.push(it);
  }
  return { kept, removed };
}

module.exports = {
  normalizeGroupName,
  normalizeTags,
  pruneByAge,
  MAX_TAG_LEN,
  MAX_TAGS,
  MAX_GROUP_NAME,
};
