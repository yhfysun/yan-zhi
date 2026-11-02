// 文档型连接器（P5.1）：Elasticsearch（HTTP，无驱动）与 MongoDB（可选 mongodb 驱动）。
//
// ★ 两者都**不提供 SQL**：query() 明确报错并引导到文档查询（projection/filter）。
// ★ schema 用「映射/采样」推导：ES 读 _mapping；Mongo 采样 50 条文档拍平嵌套字段。
import type { Connector, ParamQueryResult, QueryResult, SchemaColumn, SchemaTable, TestResult } from './connector.js';
import { inferDocSchema } from './doc-schema.js';

export interface DocConnectorConfig {
  url: string;
  username?: string | null;
  password?: string | null;
  /** 默认集合 / 索引 */
  index?: string | null;
  database?: string | null;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 15_000;
const SAMPLE_SIZE = 50;
const MAX_COLLECTIONS = 50;

function timeoutSignal(ms: number): AbortSignal {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), Math.max(1000, ms)).unref?.();
  return ctl.signal;
}

function authHeader(cfg: DocConnectorConfig): Record<string, string> {
  if (!cfg.username) return {};
  const raw = `${cfg.username}:${cfg.password || ''}`;
  return { Authorization: `Basic ${Buffer.from(raw).toString('base64')}` };
}

// ===== Elasticsearch =====

interface EsMappingProperty {
  type?: string;
  properties?: Record<string, EsMappingProperty>;
}

function esFlattenMapping(props: Record<string, EsMappingProperty>, prefix = '', depth = 0, out: SchemaColumn[] = []): SchemaColumn[] {
  for (const [name, p] of Object.entries(props || {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (p?.properties && depth < 4) {
      esFlattenMapping(p.properties, path, depth + 1, out);
      continue;
    }
    const t = p?.type || 'object';
    const type = /^(long|integer|short|byte|double|float|half_float|scaled_float)$/.test(t) ? 'number'
      : t === 'boolean' ? 'boolean'
        : t === 'date' ? 'date'
          : (t === 'text' || t === 'keyword' || t === 'ip' || t === 'constant_keyword') ? 'string'
            : 'json';
    out.push({ name: path, type, pk: path === '_id', nullable: true });
  }
  return out;
}

export class ElasticConnector implements Connector {
  readonly type = 'elasticsearch' as const;
  private cfg: DocConnectorConfig;
  constructor(cfg: DocConnectorConfig) { this.cfg = cfg; }

  private async request(pathname: string, init: RequestInit = {}): Promise<any> {
    const r = await fetch(`${this.cfg.url.replace(/\/+$/, '')}${pathname}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeader(this.cfg), ...(init.headers as any || {}) },
      signal: timeoutSignal(this.cfg.timeoutMs || DEFAULT_TIMEOUT),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Elasticsearch HTTP ${r.status}: ${text.slice(0, 300)}`);
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    try {
      const r = await this.request('/');
      return { ok: true, latencyMs: Date.now() - start, version: String(r?.version?.number || 'elasticsearch').slice(0, 60) };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskDocError(err) };
    }
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    if (!this.cfg.index) {
      const r = await this.request('/_cat/indices?format=json&h=index');
      return (Array.isArray(r) ? r : [])
        .slice(0, MAX_COLLECTIONS)
        .map((x: any) => ({ name: String(x.index), kind: 'table' as const, columns: [] }));
    }
    const mapping = await this.request(`/${encodeURIComponent(this.cfg.index)}/_mapping`);
    const first = Object.values(mapping || {})[0] as any;
    const props = first?.mappings?.properties || {};
    return [{ name: this.cfg.index, kind: 'table', columns: esFlattenMapping(props) }];
  }

  async query(): Promise<QueryResult> {
    throw new Error('Elasticsearch 数据源不支持 SQL；请使用文档查询接口（projection/filter）');
  }
  async queryParam(): Promise<ParamQueryResult> {
    throw new Error('Elasticsearch 数据源不支持参数化 SQL；请使用文档查询接口');
  }

  /** 文档查询：只做 _source 投影与 query DSL 筛选（只读） */
  async searchDocs(opts: { collection?: string; projection?: string[]; filter?: unknown; limit?: number }): Promise<{ rows: Record<string, unknown>[]; latencyMs: number; truncated: boolean }> {
    const index = opts.collection || this.cfg.index;
    if (!index) throw new Error('缺少索引名（数据源的 database 或查询里的 collection）');
    const limit = Math.max(1, Math.min(opts.limit || 100, 500));
    const body: Record<string, unknown> = { size: limit };
    if (opts.projection?.length) body._source = opts.projection;
    if (opts.filter && typeof opts.filter === 'object') body.query = opts.filter;
    const start = Date.now();
    const r = await this.request(`/${encodeURIComponent(index)}/_search`, { method: 'POST', body: JSON.stringify(body) });
    const rows = (r?.hits?.hits || []).map((h: any) => h._source || {});
    const total = Number(r?.hits?.total?.value ?? rows.length);
    return { rows, latencyMs: Date.now() - start, truncated: total > rows.length };
  }

  close(): void { /* HTTP 无连接池需关闭 */ }
}

// ===== MongoDB =====

export class MongoConnector implements Connector {
  readonly type = 'mongo' as const;
  private cfg: DocConnectorConfig;
  private client: Promise<any> | null = null;

  constructor(cfg: DocConnectorConfig) { this.cfg = cfg; }

  private async getClient(): Promise<any> {
    if (!this.client) {
      this.client = (async () => {
        let mongodb: any;
        try {
          // @ts-ignore 可选依赖：未安装时给出明确安装指引
          mongodb = await import('mongodb');
        } catch {
          throw new Error('mongodb 驱动未安装。请执行：pnpm add mongodb --filter @yan-zhi/server');
        }
        const auth = this.cfg.username
          ? `${encodeURIComponent(this.cfg.username)}:${encodeURIComponent(this.cfg.password || '')}@`
          : '';
        const uri = `mongodb://${auth}${this.cfg.url.replace(/^mongodb:\/\//, '')}`;
        const client = new mongodb.MongoClient(uri, { serverSelectionTimeoutMS: this.cfg.timeoutMs || DEFAULT_TIMEOUT });
        await client.connect();
        return client;
      })();
    }
    return this.client;
  }

  private dbName(): string {
    return this.cfg.database || 'admin';
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      await client.db(this.dbName()).command({ ping: 1 });
      return { ok: true, latencyMs: Date.now() - start, version: 'mongodb' };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskDocError(err) };
    }
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    const client = await this.getClient();
    const db = client.db(this.dbName());
    const collections = await db.listCollections().toArray();
    const out: SchemaTable[] = [];
    for (const c of collections.slice(0, MAX_COLLECTIONS)) {
      const samples = await db.collection(c.name).find({}).limit(SAMPLE_SIZE).toArray();
      out.push({ name: c.name, kind: 'table', columns: inferDocSchema(samples as Record<string, unknown>[]) });
    }
    return out;
  }

  async query(): Promise<QueryResult> {
    throw new Error('MongoDB 数据源不支持 SQL；请使用文档查询接口（projection/filter）');
  }
  async queryParam(): Promise<ParamQueryResult> {
    throw new Error('MongoDB 数据源不支持参数化 SQL；请使用文档查询接口');
  }

  async searchDocs(opts: { collection?: string; projection?: string[]; filter?: unknown; limit?: number }): Promise<{ rows: Record<string, unknown>[]; latencyMs: number; truncated: boolean }> {
    const collection = opts.collection || this.cfg.index;
    if (!collection) throw new Error('缺少集合名（数据源的 database 或查询里的 collection）');
    const limit = Math.max(1, Math.min(opts.limit || 100, 500));
    const client = await this.getClient();
    const proj = opts.projection?.length
      ? Object.fromEntries(opts.projection.map((p) => [p, 1]))
      : undefined;
    const start = Date.now();
    let cursor = client.db(this.dbName()).collection(collection).find(opts.filter && typeof opts.filter === 'object' ? opts.filter : {});
    if (proj) cursor = cursor.project(proj);
    const docs = await cursor.limit(limit + 1).toArray();
    const truncated = docs.length > limit;
    return { rows: docs.slice(0, limit), latencyMs: Date.now() - start, truncated };
  }

  close(): void {
    if (this.client) { this.client.then((c) => c.close()).catch(() => { /* ignore */ }); this.client = null; }
  }
}

function maskDocError(err: unknown): string {
  const m = String((err as Error)?.message || err);
  return m.replace(/\/\/[^@/]+@/g, '//***@').slice(0, 300);
}
