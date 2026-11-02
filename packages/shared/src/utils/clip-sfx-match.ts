// 音效匹配（"按描述找音效"）。
//
// ★ 为什么不是向量检索：音效库是**程序化合成**的固定几十条，每条都有人写的
//   label/desc/group。在这个规模上，意图词典 + 文本重叠比 embedding 更可解释、
//   零依赖、零下载；调不准时加一行词典即可（向量模型反而要重跑索引）。
//   诚实边界：它不是"任意语义理解"（比如"像电影预告片那种"），而是常见剪辑意图覆盖。
//
// ★ 单一实现：服务端工具 sfx.search、/library?q= 与前端工作台共用这一份 ——
//   各写一套必然出现"工具搜得到、界面搜不到"的漂移。

export interface SfxMatchItem {
  id: string;
  label: string;
  desc: string;
  group: string;
  maxSec?: number;
}

export interface SfxIntentHint {
  /** 命中任一关键词即视为该意图 */
  words: string[];
  /** 该意图下推荐音效（按优先级排序，越靠前加权越高） */
  ids: string[];
  reason: string;
}

/**
 * 剪辑意图词典（中文口语优先）。
 * ★ 加词的门槛很低，但**只有真正常用**的意图才值得加：词典越长，
 *   误命中的概率越高（例如"紧张"不该匹配到"完成"）。
 */
export const SFX_INTENT_HINTS: SfxIntentHint[] = [
  { words: ['紧张', '悬疑', '恐怖', '压迫', '惊悚', '不安'], ids: ['heartbeat', 'hum', 'impact'], reason: '紧张氛围' },
  { words: ['转场', '切换', '过渡', '镜头'], ids: ['whoosh', 'swish', 'whoosh_hard', 'transition_sweep', 'riser'], reason: '转场' },
  { words: ['卡点', '鼓点', '节奏', '踩点', '节拍', '律动'], ids: ['hit', 'kick', 'clap', 'shaker', 'tick'], reason: '节奏卡点' },
  { words: ['提示', '提醒', '通知'], ids: ['ding', 'notify', 'alert'], reason: '提示音' },
  { words: ['成功', '完成', '达成', '通过'], ids: ['success', 'coin'], reason: '完成反馈' },
  { words: ['失败', '错误', '警告', '警报', '危险'], ids: ['error', 'alert'], reason: '警告' },
  { words: ['点击', '按钮', '选择'], ids: ['click', 'pop'], reason: '点击反馈' },
  { words: ['奖励', '得分', '金币', '积分'], ids: ['coin', 'ding'], reason: '奖励' },
  { words: ['上升', '铺垫', '高潮', '起势', '上扬', '爆发'], ids: ['riser', 'impact'], reason: '上扬铺垫' },
  { words: ['重击', '冲击', '爆点', '打击', '重音'], ids: ['impact', 'whoosh_hard', 'hit'], reason: '重击' },
  { words: ['快剪', '快速', '切片', '利落', '闪过'], ids: ['swish', 'transition_sweep'], reason: '快剪' },
  { words: ['氛围', '环境', '背景', '底噪'], ids: ['pad_soft', 'room', 'wind', 'rain', 'cafe', 'space', 'fire'], reason: '环境氛围' },
  { words: ['安静', '干净', '贴脸'], ids: ['room', 'pad_soft'], reason: '环境底噪' },
  { words: ['温暖', '篝火', '野外'], ids: ['fire', 'pad_soft'], reason: '温暖' },
  { words: ['科幻', '未来', '未知', '太空', '宇宙'], ids: ['space', 'hum'], reason: '科幻' },
  { words: ['雨', '下雨'], ids: ['rain'], reason: '雨声' },
  { words: ['风', '户外', '空旷'], ids: ['wind', 'whoosh'], reason: '风声' },
  { words: ['咖啡', '餐厅', '嘈杂', '人声'], ids: ['cafe'], reason: '人声底' },
  { words: ['电流', '机房', '嗡'], ids: ['hum'], reason: '电流声' },
  { words: ['倒数', '计时', '秒表'], ids: ['tick'], reason: '计时' },
  { words: ['气泡', '弹出', '贴纸'], ids: ['pop'], reason: '弹出' },
];

export interface SfxMatchHit<T extends SfxMatchItem = SfxMatchItem> {
  item: T;
  score: number;
  /** 命中原因（UI tooltip / 工具返回给模型看） */
  reason: string;
}

export interface SfxMatchResult<T extends SfxMatchItem = SfxMatchItem> {
  hits: Array<SfxMatchHit<T>>;
  /** 是否有足够可信的结果（空查询 / 只命中零碎字时 false） */
  matched: boolean;
  query: string;
}

const MIN_SCORE = 2;

/** 归一化：去空白/标点、转小写（中英文都适用）。 */
export function normalizeSfxText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]…—\-~～+/|]+/g, '');
}

/** 双字组（中文查询没有分词器时做重叠打分；单字查询退化为单字）。 */
function grams(s: string): Set<string> {
  const t = normalizeSfxText(s);
  const out = new Set<string>();
  if (!t) return out;
  if (t.length === 1) { out.add(t); return out; }
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n;
}

/**
 * 按描述匹配音效。
 * 排序：分数降序；同分保持**库内原顺序**（确定性，便于测试与 UI 稳定）。
 */
export function matchSfx<T extends SfxMatchItem>(
  query: string,
  items: readonly T[],
  opts: { limit?: number; minScore?: number } = {},
): SfxMatchResult<T> {
  const q = normalizeSfxText(query);
  const limit = Math.max(1, Math.round(Number(opts.limit ?? 5)));
  const minScore = Number(opts.minScore ?? MIN_SCORE);
  if (!q || !items?.length) return { hits: [], matched: false, query: String(query || '') };

  const qGrams = grams(query);
  const intents = SFX_INTENT_HINTS.filter((h) => h.words.some((w) => q.includes(normalizeSfxText(w))));

  const scored = items.map((item, idx) => {
    const label = normalizeSfxText(item.label);
    const id = normalizeSfxText(item.id);
    // ★ 语料只用 id/label/desc：group（如「氛围」「提示」）是**泛词**，
    //   算进重叠会让"紧张的氛围"把整组氛围垫抬上来、盖过真正相关的心跳。
    //   分组类需求由意图词典负责（氛围 → pad_soft/room/wind/…）。
    const corpus = normalizeSfxText(`${item.id}${item.label}${item.desc}`);
    let score = 0;
    const reasons: string[] = [];

    // 1) 意图词典（优先级越高加权越大）
    for (const h of intents) {
      const at = h.ids.indexOf(item.id);
      if (at >= 0) {
        score += Math.max(1, 6 - at);
        reasons.push(h.reason);
      }
    }

    // 2) 文本匹配：id / label 精确更强，描述重叠较弱
    if (id && (id === q || (q.length >= 3 && id.includes(q)))) {
      score += 4;
      reasons.push('名称匹配');
    }
    if (label && label === q) {
      score += 6;
      reasons.push('同名');
    } else if (label && (label.includes(q) || q.includes(label))) {
      score += 3;
      reasons.push('名称包含');
    }
    const ov = overlapCount(qGrams, grams(corpus));
    if (ov > 0) {
      score += Math.min(6, ov * 1.5);
      if (!reasons.length) reasons.push('描述匹配');
    }

    return { item, score: Math.round(score * 100) / 100, reason: [...new Set(reasons)].join(' / '), idx };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .slice(0, limit)
    .map(({ item, score, reason }) => ({ item, score, reason }));

  return { hits, matched: hits.length > 0 && hits[0].score >= minScore, query: String(query || '') };
}
