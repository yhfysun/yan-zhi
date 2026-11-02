// 文档型数据查询（P5.1）：投影 + 筛选，只读；行结果拍平成 a.b.c 便于表格展示。
import { db } from '../db.js';
import { getConnector, type DataSourceRow } from './connector.js';
import { flattenDocuments } from './doc-schema.js';

export interface DocQueryInput {
  collection?: string;
  /** 投影字段（拍平后的路径，如 ["user.name", "amount"]） */
  projection?: string[];
  /** 原生查询 DSL（ES query / Mongo filter），只读语义由引擎保证 */
  filter?: unknown;
  limit?: number;
}

export async function queryDocuments(userId: string, datasourceId: string, input: DocQueryInput = {}) {
  const ds = db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(datasourceId, userId) as DataSourceRow | undefined;
  if (!ds) throw new Error('数据源不存在');
  if (ds.type !== 'mongo' && ds.type !== 'elasticsearch') {
    throw new Error('该数据源不是文档型（仅 mongo / elasticsearch 支持文档查询）');
  }
  const conn = getConnector(ds) as any;
  if (typeof conn.searchDocs !== 'function') throw new Error('连接器不支持文档查询');
  const r = await conn.searchDocs(input);
  const { columns, rows } = flattenDocuments(r.rows, input.projection);
  return {
    mode: 'doc' as const,
    datasourceId: ds.id,
    collection: input.collection || (ds as any).database || '',
    columns,
    rows,
    rowCount: rows.length,
    truncated: r.truncated,
    latencyMs: r.latencyMs,
  };
}
