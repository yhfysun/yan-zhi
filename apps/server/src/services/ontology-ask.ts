// L3 查询生成 + dry-run + 结构化错误自纠（P4.7 后半）。
//
// ★ 循环语义：模型产出 intent → 编译+限行试跑 → 失败把 {stage, errors} 原样回喂 →
//   最多再纠 2 轮。成功即视为「已验证」，可沉淀为 ontology_example。
// ★ 编排与 IO 分离：askWithSelfCorrection 只做循环，生成器与 dryRun 由外部注入，便于单测。
import { llmJson } from '../host-bridge.js';
import { digestOntologies, runOntologyIntent } from './ontology.js';
import { saveExample } from './ontology-example.js';

export interface AskDeps {
  generate: (prompt: { system: string; user: string }) => Promise<unknown>;
  dryRun: (intent: any) => Promise<{ sql: string; warnings?: string[] }>;
}

export interface AskResult {
  intent: any | null;
  sql: string;
  attempts: number;
  errors: string[];
  warnings: string[];
}

const SYSTEM_PROMPT = [
  '你是本体查询 DSL 生成器。只输出 JSON，不要解释。',
  '格式：{"intent":{"dimensions":["字段"],"timeDimension":{"name":"字段","grain":"day|month|..."},"measures":[{"name":"字段"}],"filters":["过滤器名或裸条件"],"selections":["选择列名"],"orderBy":[{"name":"输出列","dir":"asc|desc"}],"limit":100}}',
  '只用下面本体摘要里出现的字段名/过滤器名；不要编造。拿不准时参考「已验证问答」的写法。',
].join('\n');

function extractIntent(raw: unknown): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as any;
  const intent = obj.intent && typeof obj.intent === 'object' ? obj.intent : obj;
  return intent && typeof intent === 'object' && Object.keys(intent).length ? intent : null;
}

function buildPrompt(schema: string, question: string, prev: string, errors: string[], warnings: string[]): { system: string; user: string } {
  const parts = [`问题：${question}`, `本体摘要：\n${schema}`];
  if (prev) parts.push(`上一轮 intent：${prev}`);
  if (errors.length) {
    parts.push(`上一轮失败（请修正后重试）：${errors.join('；')}`);
  }
  if (warnings.length) parts.push(`提示：${warnings.join('；')}`);
  return { system: SYSTEM_PROMPT, user: parts.join('\n\n') };
}

/** 自纠主循环：最多 1 次首答 + maxRetries 次修正（默认 2） */
export async function askWithSelfCorrection(
  input: { question: string; schema: string },
  deps: AskDeps,
  maxRetries = 2,
): Promise<AskResult> {
  let prev = '';
  let errors: string[] = [];
  let warnings: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let raw: unknown;
    try {
      raw = await deps.generate(buildPrompt(input.schema, input.question, prev, errors, warnings));
    } catch (e) {
      errors = [`生成失败：${(e as Error).message}`];
      return { intent: null, sql: '', attempts: attempt + 1, errors, warnings: [] };
    }
    const intent = extractIntent(raw);
    if (!intent) {
      errors = ['输出不是合法的 intent JSON'];
      prev = JSON.stringify(raw ?? null).slice(0, 800);
      continue;
    }
    try {
      const r = await deps.dryRun(intent);
      return { intent, sql: r.sql, attempts: attempt + 1, errors: [], warnings: r.warnings || [] };
    } catch (e: any) {
      const structured = e?.structured as { stage: string; errors: string[] } | undefined;
      errors = structured?.errors?.length ? structured.errors : [e?.message || String(e)];
      if (structured?.stage) errors = [`[${structured.stage}] ${errors.join('；')}`];
      prev = JSON.stringify(intent).slice(0, 800);
    }
  }
  return { intent: null, sql: '', attempts: maxRetries + 1, errors, warnings: [] };
}

export interface AskOntologyOptions {
  /** true（默认）= 只 dry-run；false = 成功后按数据集真实返回 */
  dryRun?: boolean;
  limit?: number;
}

/**
 * 真实链路：本体摘要（含已验证问答）→ LLM 产出 intent → dry-run/执行 → 成功沉淀示例。
 */
export async function askOntology(userId: string, ontologyId: string, question: string, opts: AskOntologyOptions = {}): Promise<AskResult & { rows?: Record<string, unknown>[]; columns?: string[] }> {
  const q = String(question || '').trim();
  if (!q) throw new Error('question 不能为空');
  const schema = digestOntologies(userId, { question: q });
  const dryRun = opts.dryRun !== false;

  const result = await askWithSelfCorrection({ question: q, schema }, {
    generate: async (prompt) => {
      const r = await llmJson({ userId, system: prompt.system, user: prompt.user, maxTokens: 1200, timeoutMs: 45000 });
      if (!r.ok) throw new Error(`LLM 生成失败：${r.code}${r.error ? ` ${r.error}` : ''}`);
      return r.data ?? null;
    },
    dryRun: async (intent) => {
      const r = await runOntologyIntent(userId, ontologyId, intent, 1);
      return { sql: r.compiledSql, warnings: r.warnings };
    },
  });

  if (!result.intent) return result;

  try {
    saveExample(userId, { ontologyId, question: q, intent: result.intent, sql: result.sql, rowCount: 1 });
  } catch { /* 沉淀失败不影响查询 */ }

  if (dryRun) return result;

  const full = await runOntologyIntent(userId, ontologyId, result.intent, Math.max(1, Math.min(opts.limit || 100, 1000)));
  try {
    saveExample(userId, { ontologyId, question: q, intent: result.intent, sql: full.compiledSql, rowCount: full.rowCount });
  } catch { /* ignore */ }
  return { ...result, sql: full.compiledSql, rows: full.rows, columns: full.columns };
}
