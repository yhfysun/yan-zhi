// 本体语义召回 + 摘要组装（P4.2）：
// 选择列（命名查询列组：名称+描述/召回关键字+字段列表）与过滤器按 keywords 规则评分，
// 命中的标分数进摘要；未命中的选择列只列名称与描述（紧凑）。
// score 函数独立可替换：后续可无缝切 embedding 召回。
import type { OntologyInfo } from './ontology.js';
import type { OntologyFilter, OntologyRelation, OntologySelection } from './ontology-compiler.js';

export interface RecallConfig {
  /** 最低分数，低于丢弃（0~1） */
  threshold: number;
  /** 每类召回 topK 上限 */
  maxItems: number;
}

export function recallConfigFromEnv(): RecallConfig {
  const threshold = Number(process.env.ONTOLOGY_RECALL_THRESHOLD);
  const maxItems = Number(process.env.ONTOLOGY_RECALL_MAX);
  return {
    threshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 1 ? threshold : 0.6,
    maxItems: Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 8,
  };
}

/** 问题切分：按空白/标点切段，用于整段相等判定 */
function splitSegments(question: string): string[] {
  return question.split(/[\s,，。;；、!！?？\n\r\t]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * 关键词评分（v1 纯规则）：
 * - 问题某一段与关键词整段相等 → 1.0
 * - 问题包含关键词（子串）→ 0.8
 * - 未命中 → 0
 * 多关键词取最高分。
 */
export function scoreKeywords(keywords: string[] | undefined, question: string): number {
  if (!keywords?.length) return 0;
  const q = question.trim();
  if (!q) return 0;
  const segments = new Set(splitSegments(q));
  let best = 0;
  for (const kwRaw of keywords) {
    const kw = (kwRaw || '').trim();
    if (!kw) continue;
    if (segments.has(kw)) best = Math.max(best, 1.0);
    else if (q.includes(kw)) best = Math.max(best, 0.8);
    if (best === 1.0) break;
  }
  return best;
}

export interface RecallHit<T> {
  item: T;
  score: number;
}

/** 对带 keywords 的候选集召回：score ≥ threshold，按分数降序，截 topK */
export function recallByKeywords<T extends { keywords?: string[] }>(
  items: T[],
  question: string,
  cfg: RecallConfig,
): RecallHit<T>[] {
  const hits: RecallHit<T>[] = [];
  for (const item of items) {
    const score = scoreKeywords(item.keywords, question);
    if (score >= cfg.threshold) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, cfg.maxItems);
}

// ===== 摘要组装 =====

interface DigestField { name: string; keywords?: string[]; isDefault?: boolean; description?: string }

function fieldText(f: DigestField, withDesc: boolean): string {
  const kws = f.keywords?.length ? `; 命中词:${f.keywords.join('/')}` : '';
  const desc = withDesc && f.description ? `(${f.description})` : '';
  return `${f.name}${desc}${kws}`;
}

function filterText(f: OntologyFilter): string {
  const kws = f.keywords?.length ? `; 命中词:${f.keywords.join('/')}` : '';
  return `${f.name} → ${f.expr}${kws}`;
}

function relationText(r: OntologyRelation): string {
  const via = r.via ? ` — via ${r.via.table}(${r.via.sourceColumn},${r.via.targetColumn})` : '';
  const desc = r.description ? `(${r.description})` : '';
  return `${r.source}.${r.sourceAttr} ${r.type} → ${r.target}.${r.targetAttr}${via}${desc}`;
}

/** 选择列引用的字段描述（维度/度量/时间维度）回退，让摘要带上业务口径 */
function fieldDescOf(o: OntologyInfo, name: string): string | undefined {
  return (
    o.dimensions.find((d) => d.name === name)?.description ||
    o.measures.find((m) => m.name === name)?.description ||
    o.timeDimensions.find((t) => t.name === name)?.description
  );
}

/**
 * 组装本体语义摘要（喂大模型的紧凑文本）：
 * - 选择列（命名查询列组）：未命中的只列名称与描述；命中 question 的展开字段列表并标分数
 * - 过滤器：默认直拼 + 非默认召回（同构）
 * - 关联关系数量少，全量拼入
 * - 没有任何默认项且无命中的本体整条省略（控制上下文体积）
 */
export function buildOntologyDigest(
  ontologies: OntologyInfo[],
  question: string,
  cfg: RecallConfig = recallConfigFromEnv(),
): string {
  const blocks: string[] = [];
  for (const o of ontologies) {
    if (o.status !== 'published') continue;
    const lines: string[] = [];

    // 选择列（命名查询列组）：名称（描述; 命中词）→ 字段列表；按问题召回，命中的标分数
    const selText = (s: OntologySelection, score?: number) => {
      const kws = s.keywords?.length ? `; 命中词:${s.keywords.join('/')}` : '';
      const desc = s.description ? `(${s.description})` : '';
      const sc = score !== undefined ? ` [${score}]` : '';
      return `${s.name}${desc}${kws} → ${(s.fields || []).join('/')}${sc}`;
    };
    const recSels = recallByKeywords(o.selections, question, cfg);
    const plainSels = o.selections.filter((s) => !recSels.some((h) => h.item === s));
    if (recSels.length) lines.push(`  选择列(命中): ${recSels.map((h) => selText(h.item, h.score)).join(' / ')}`);
    if (plainSels.length) lines.push(`  选择列: ${plainSels.map((s) => selText(s)).join(' / ')}`);

    const defFilters = o.filters.filter((f) => f.isDefault).map(filterText);
    if (defFilters.length) lines.push(`  过滤器(默认): ${defFilters.join(' / ')}`);
    const recFilters = recallByKeywords(o.filters, question, cfg);
    if (recFilters.length) lines.push(`  过滤器(命中): ${recFilters.map((h) => `${filterText(h.item)} [${h.score}]`).join(' / ')}`);

    if (o.relations.length) lines.push(`  关联: ${o.relations.map(relationText).join('；')}`);
    if (o.policies.length) lines.push(`  行级策略(强制): ${o.policies.join(' AND ')}`);

    // 整条省略：无选择列、无命中、无关联（策略是安全语义，有策略仍要展示）
    const hasContent = o.selections.length || recFilters.length || defFilters.length
      || o.relations.length || o.policies.length;
    if (!hasContent) continue;
    blocks.push(`- ${o.code}（${o.name}）:\n${lines.join('\n')}`);
  }
  return blocks.join('\n');
}
