// 本体语义召回 + 摘要组装（P4.2 第一版）：
// 「默认直拼 + 非默认召回」两级组装——默认选择列/过滤器无条件进本体 YAML，
// 非默认项按问题与 keywords 规则评分（阈值/topK 可配），命中才进。
// score 函数独立可替换：后续可无缝切 embedding 召回。
import type { OntologyInfo } from './ontology.js';
import type { OntologyFilter, OntologyRelation } from './ontology-compiler.js';

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
 * - 默认选择列（本体级契约）：无条件直拼进摘要，作为「未指定列时的兜底 SELECT」
 * - 非默认选择列：按 question 与 keywords 召回（阈值/topK），命中才拼入
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

    // 默认选择列：无条件直拼
    const defaults = o.selections
      .filter((s) => s.isDefault)
      .map((s) => fieldText({ name: s.name, keywords: s.keywords, description: s.description || fieldDescOf(o, s.name) }, true));
    if (defaults.length) lines.push(`  选择列(默认): ${defaults.join(' / ')}`);

    // 非默认选择列：按问题关键字召回
    const recalled = recallByKeywords(o.selections, question, cfg).map(
      (h) => `${fieldText({ name: h.item.name, keywords: h.item.keywords, description: h.item.description || fieldDescOf(o, h.item.name) }, true)} [${h.score}]`,
    );
    if (recalled.length) lines.push(`  选择列(命中): ${recalled.join(' / ')}`);

    const defFilters = o.filters.filter((f) => f.isDefault).map(filterText);
    if (defFilters.length) lines.push(`  过滤器(默认): ${defFilters.join(' / ')}`);
    const recFilters = recallByKeywords(o.filters, question, cfg);
    if (recFilters.length) lines.push(`  过滤器(命中): ${recFilters.map((h) => `${filterText(h.item)} [${h.score}]`).join(' / ')}`);

    if (o.relations.length) lines.push(`  关联: ${o.relations.map(relationText).join('；')}`);
    if (o.policies.length) lines.push(`  行级策略(强制): ${o.policies.join(' AND ')}`);

    // 整条省略：无默认、无命中、无关联（策略是安全语义，有策略仍要展示）
    const hasContent = defaults.length || recalled.length || defFilters.length || recFilters.length
      || o.relations.length || o.policies.length;
    if (!hasContent) continue;
    blocks.push(`- ${o.code}（${o.name}）:\n${lines.join('\n')}`);
  }
  return blocks.join('\n');
}
