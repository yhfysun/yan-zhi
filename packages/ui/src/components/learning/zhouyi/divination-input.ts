// 测算台表单 → 推演引擎 input 的唯一转换实现。
//
// 为什么从 DivinationWorkbench.vue 抽出来：字段名曾经两边各写一套（表单叫
// tosses/zuo/xiang/element1/element2/date，引擎读 coins/sitting/facing/a,b/year,month,day），
// 结果六爻、玄空、五行、择日四法用户填了不生效，五行还直接抛错；UI 挂载测试只覆盖梅花，
// 靠源码锚点又证明不了「值真的传进去」。抽成纯函数后宿主与测试都调用同一份真实现。
//
// 字段名以 packages/shared/src/zhouyi/divination.ts 各 divXxx() 实际读取的键为准。
import type { DivinationMethod } from '@yan-zhi/shared';
import { zhouyiCaseSearch } from '@yan-zhi/shared';

export type DivinationFormState = {
  year: string;
  month: string;
  day: string;
  hour: string;
  tosses: string[];
  birthYear: string;
  gender: string;
  yun: string;
  zuo: string;
  xiang: string;
  element1: string;
  element2: string;
  date: string;
  seed: string;
  /** 事类 id（cases.ts）：命中事类后随推演入参下发，引擎按事类取白名单断语 */
  caseId: string;
  // —— 杂占三法表单 ——
  /** 测字：待测的字（命中内置笔画表时自动取笔画） */
  ceziChars: string;
  /** 测字：直接给笔画数（覆盖内置表） */
  ceziStrokes: string;
  /** 解梦：梦象关键词 */
  dream: string;
  /** 姓名学：姓名（命中内置康熙笔画表时自动取笔画） */
  personName: string;
  /** 姓名学：直接给各字笔画（逗号分隔，优先于姓名） */
  nameStrokes: string;
};

// Vue 对 <input type="number" v-model> 会自动转成 number，所以实参运行时可能是数；
// 表单初值与文本 seed 又是 string。两种都收，别假设只有一种。
export function toInt(v: string | number): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  // Number('') === 0：空输入会被当成 0，导致「时」(0–23) 这类字段空着也能过校验。
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** input 只在内存中组装并交给引擎，绝不落 localStorage、绝不进导出 JSON（caseId 不是隐私，但同样不落盘）。 */
export function buildDivinationInput(
  method: DivinationMethod,
  f: DivinationFormState,
): Record<string, string | number> {
  // 事类命中后随推演下发：引擎 divXxx 按事类取「用神 → 白名单断语」口径；未传则走各法默认断语
  const withCase = (o: Record<string, string | number>): Record<string, string | number> => {
    const cid = f.caseId.trim();
    return cid ? { ...o, caseId: cid } : o;
  };
  switch (method) {
    case 'meihua':
      return withCase({ year: toInt(f.year) ?? 0, month: toInt(f.month) ?? 0, day: toInt(f.day) ?? 0, hour: toInt(f.hour) ?? 0 });
    case 'dayan':
      return withCase({});
    // 6 位「背/字」简记串：引擎 divLiuyao 的 /^[背字]{6}$/ 分支
    case 'liuyao':
      return withCase({ coins: f.tosses.join('') });
    case 'sizhu':
      return withCase({ year: toInt(f.year) ?? 0, month: toInt(f.month) ?? 0, day: toInt(f.day) ?? 0, hour: toInt(f.hour) ?? 0 });
    case 'bazhai':
      return withCase({ year: toInt(f.birthYear) ?? 0, gender: f.gender });
    case 'xuankong':
      return withCase({ yun: toInt(f.yun) ?? 0, sitting: f.zuo, facing: f.xiang });
    case 'wuxing':
      return withCase({ a: f.element1, b: f.element2 });
    case 'zari': {
      const [y, m, d] = f.date.split('-').map(Number);
      return withCase({ year: y, month: m, day: d });
    }
    case 'cezi':
      return withCase({ chars: f.ceziChars.trim(), strokes: toInt(f.ceziStrokes) ?? 0 });
    case 'jiemeng':
      return withCase({ dream: f.dream.trim() });
    case 'xingming':
      return withCase({ name: f.personName.trim(), strokes: f.nameStrokes.trim() });
  }
}

// ===== 输入脱敏（记录详情展示用：生辰打码，非敏感参数全显） =====

/**
 * 生成可落盘展示的脱敏输入摘要。
 * ★ 口径：只有「生辰类」字段打码（月/日/时 → **，年保留；姓名只留首字），
 *   起卦参数类（铜钱背字、梦象、测字、日期、五行、坐向）不属于隐私，全显。
 *   与隐私契约一致：原始 input 永不落盘，这里生成的是**派生摘要**。
 */
export function maskDivinationInput(
  method: DivinationMethod,
  input: Record<string, string | number>,
): string {
  const s = (k: string): string => String(input[k] ?? '');
  switch (method) {
    case 'meihua':
    case 'sizhu': {
      const y = s('year') || '****';
      return `${y}-**-** **时`;
    }
    case 'bazhai':
      return `${s('year')} 年 · ${s('gender') || '**'}`;
    case 'dayan':
      return '无输入（seed 起卦）';
    case 'liuyao':
      return `铜钱：${s('coins') || '（seed 模拟摇卦）'}`;
    case 'xuankong':
      return `${s('yun')} 运 · ${s('sitting') || '**'}坐${s('facing') || '**'}向`;
    case 'wuxing':
      return `${s('a') || '**'} × ${s('b') || '**'}`;
    case 'zari': {
      const y = s('year'), m = s('month').padStart(2, '0'), d = s('day').padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    case 'cezi':
      return s('chars') ? `测「${s('chars')}」` : `笔画 ${s('strokes')} 画`;
    case 'jiemeng':
      return `梦象「${s('dream')}」`;
    case 'xingming': {
      const name = s('name');
      const maskedName = name ? `${[...name][0] ?? ''}${'*'.repeat(Math.max(0, [...name].length - 1))}` : '';
      return maskedName ? `${maskedName}（${s('strokes') || '内置笔画表'}）` : `笔画 ${s('strokes')}`;
    }
  }
}

// ===== 一句话解析（自然语言 → 表单预填；本地纯函数，不交给模型编数据） =====

export type DivinationParseResult = {
  method: DivinationMethod;
  /** 事类 id（命中口语同义词时带回） */
  caseId?: string;
  /** 预填进表单的字段 */
  patch: Partial<DivinationFormState>;
  /** 给用户看的解析说明 */
  matched: string;
};

/** 一句话解析：覆盖「梦见X / 测X字 / 生辰数字 / 事类口语」四类典型说法；解析不了返回 null。
 *  ★ 数字口径只认「年.月.日 时」的显式表达，不猜农历（农历换算是另一门手艺，别硬猜）。 */
export function parseDivinationUtterance(text: string): DivinationParseResult | null {
  const raw = text.trim();
  if (!raw) return null;

  // 1) 解梦：梦见…
  const dreamMatch = raw.match(/梦见(.{1,12}?)(?:[，。,.！!？?\s]|$)/);
  if (dreamMatch) {
    const dream = dreamMatch[1].trim() || raw.replace('梦见', '').trim();
    return { method: 'jiemeng', patch: { dream }, matched: `解梦 · 梦象「${dream}」` };
  }
  if (/^(解梦|周公解梦)/.test(raw)) {
    const dream = raw.replace(/^(周公)?解梦[：:，,]?/, '').trim();
    return { method: 'jiemeng', patch: { dream }, matched: `解梦 · 梦象「${dream || '待填'}」` };
  }

  // 2) 测字：测X字 / 「X」字
  const ceziMatch = raw.match(/测(?:个|一下)?[「"]?([\u4e00-\u9fff]{1,4})[」"]?字?/);
  if (ceziMatch) {
    return { method: 'cezi', patch: { ceziChars: ceziMatch[1] }, matched: `测字 · 测「${ceziMatch[1]}」` };
  }

  // 3) 姓名五格
  if (/五格|姓名|名字.{0,4}(算|测|分析)|取.{0,2}名/.test(raw)) {
    const nameMatch = raw.match(/(?:叫|名叫|名字|姓名)[：:是]?([\u4e00-\u9fff]{2,4})/);
    return {
      method: 'xingming',
      patch: nameMatch ? { personName: nameMatch[1] } : {},
      matched: nameMatch ? `姓名五格 · ${nameMatch[1]}` : '姓名五格 · 请填姓名或笔画',
    };
  }

  // 4) 生辰数字：完整「年.月.日」一次匹配（点/横/年月日字混合都认），不猜农历
  const dateMatch = raw.match(/(\d{4})\s*[年.\-./]\s*(\d{1,2})\s*[月.\-./]\s*(\d{1,2})/);
  const h = raw.match(/(\d{1,2})\s*(?:点|时|:|：)/);
  if (dateMatch) {
    const patch: Partial<DivinationFormState> = {
      year: dateMatch[1], month: dateMatch[2], day: dateMatch[3], hour: h ? h[1] : '12',
    };
    const gender = raw.match(/(男|女)/);
    if (gender) patch.gender = gender[1];
    const isBazi = /八字|生辰|命|四柱/.test(raw);
    return {
      method: isBazi ? 'sizhu' : 'meihua',
      patch,
      matched: `${isBazi ? '四柱排盘' : '梅花易数'} · ${dateMatch[1]}年${dateMatch[2]}月${dateMatch[3]}日${h ? ` ${h[1]}时` : ''}${gender ? ` ${gender[1]}` : ''}`,
    };
  }

  // 5) 事类口语：搬家哪天好 / 求财 / 前程…
  const caseHits = zhouyiCaseSearch(raw);
  if (caseHits.length) {
    const first = caseHits[0];
    return {
      method: first.methods[0],
      caseId: first.id,
      patch: {},
      matched: `${first.name} · ${first.plain}（推荐占法：${first.methods[0]}）`,
    };
  }
  return null;
}
