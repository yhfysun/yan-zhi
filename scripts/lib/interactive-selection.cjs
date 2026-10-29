/**
 * 交互选择的**纯决策**（不碰终端）：把「勾了哪些」翻译成「构建选择集」。
 *
 * 为什么要单独一层：交互菜单本身是 I/O（rawMode 逐键），但"默认=预设、只勾基座=不带、
 * 与预设一致=不额外裁剪"这些判定一旦写错，产出的包与用户勾的完全不是一回事，
 * 而终端的键位路径无法在单测里跑。把判定抽成纯函数，ask* 只负责显示与收集。
 */
const NONE_ROW_ID = '__none__';

/** 「不带」与具体条目互斥：勾「不带」清掉其它，勾其它清掉「不带」。 */
function exclusiveWithNone(list, index) {
  const row = list[index];
  if (row.id === NONE_ROW_ID && row.checked) {
    for (const it of list) if (it.id !== NONE_ROW_ID && !it.locked) it.checked = false;
  } else if (row.id !== NONE_ROW_ID && row.checked) {
    const noneRow = list.find((it) => it.id === NONE_ROW_ID);
    if (noneRow) noneRow.checked = false;
  }
}

/**
 * 插件勾选 → 决策。
 *
 * ★ 不再有「与预设相同 ⇒ 不裁剪」的捷径：多档同时构建时，预设是**逐档**的，
 *   而用户勾的是一份并集；把它降级成"按档位预设"会让每档各自裁剪（与勾选不符）。
 *   只有 Esc/未确认才回落到档位预设。
 *
 * @param {object} p
 * @param {object} p.catalog plugins.catalog.json（保留参数：依赖闭包在解析层做）
 * @param {string[]|null} p.picked 勾中的 id（null = Esc/未确认）
 * @param {string} [p.officeId]
 * @returns {{kind:'preset'}|{kind:'none'}|{kind:'explicit', ids:string[]}}
 */
function decidePlugins({ catalog, picked, officeId = 'office-core' }) {
  void catalog;
  if (picked === null) return { kind: 'preset' };
  if (picked.includes(NONE_ROW_ID)) return { kind: 'none' };

  const rest = picked.filter((id) => id !== officeId);
  if (!rest.length) return { kind: 'none' }; // 只留基座 = 所有插件都不带
  return { kind: 'explicit', ids: picked };
}

/**
 * 宠物勾选 → 决策。
 * @param {object} p
 * @param {object} p.catalog 宠物 catalog（packs + vrms）
 * @param {string[]|null} p.picked 勾中的 id（null = Esc/未确认）
 * @returns {{kind:'all'}|{kind:'none'}|{kind:'explicit', ids:string[]}}
 */
function decidePets({ catalog, picked }) {
  const allIds = [...(catalog.packs || []), ...(catalog.vrms || [])].map((e) => e.id);
  if (picked === null) return { kind: 'all' };
  if (picked.includes(NONE_ROW_ID)) return { kind: 'none' };

  const rest = picked.filter((id) => id !== NONE_ROW_ID);
  if (rest.length === allIds.length && rest.every((id) => allIds.includes(id))) return { kind: 'all' };
  if (!rest.length) return { kind: 'none' };
  return { kind: 'explicit', ids: rest };
}

module.exports = { NONE_ROW_ID, exclusiveWithNone, decidePlugins, decidePets };
