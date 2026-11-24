import { describe, expect, it, vi } from 'vitest';
import { initSchema, VECTOR_SCHEMA_SQL } from '@yan-zhi/core';
import {
  WebDatabase,
  classifyWebSqlStatement,
  splitWebSqlStatements,
  stripLeadingWebSqlComments,
} from '../../../../apps/web/src/platform';

describe('WebDatabase SQL compatibility', () => {
  it('splits multi-statement SQL without breaking quoted semicolons', () => {
    const sql = `
      -- 注释里的分号;不影响拆分
      CREATE TABLE IF NOT EXISTS sample (id TEXT PRIMARY KEY, note TEXT DEFAULT 'a;b');
      CREATE INDEX IF NOT EXISTS idx_sample ON sample(id);
      /* block; comment */
      INSERT INTO sample (id, note) VALUES (?, ?);
    `;

    const statements = splitWebSqlStatements(sql);
    expect(statements).toHaveLength(3);
    expect(stripLeadingWebSqlComments(statements[0])).toMatch(/^CREATE TABLE/);
    expect(statements[0]).toContain("'a;b'");
  });

  it('accepts every statement emitted during schema initialization', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kinds: string[] = [];

    await initSchema(async (sql) => {
      for (const statement of splitWebSqlStatements(sql)) {
        const kind = classifyWebSqlStatement(statement);
        kinds.push(kind);
        if (kind === 'unsupported') {
          throw new Error(`未兼容的初始化 SQL: ${stripLeadingWebSqlComments(statement).slice(0, 160)}`);
        }
      }
    });

    for (const statement of splitWebSqlStatements(VECTOR_SCHEMA_SQL)) {
      expect(classifyWebSqlStatement(statement)).toBe('ddl');
    }
    expect(kinds).toContain('ddl');
    expect(kinds).not.toContain('unsupported');
    warn.mockRestore();
  });

  it('backfills COALESCE expressions with row values instead of storing SQL text', async () => {
    const rows: Array<Record<string, unknown>> = [
      { id: 'a', updated_at: 10, last_activity_at: null },
      { id: 'b', updated_at: 20, last_activity_at: 18 },
    ];
    const conversation = {
      toCollection: () => ({
        modify: async (apply: (row: Record<string, unknown>) => void) => {
          rows.forEach(apply);
        },
      }),
    };
    const db = Object.create(WebDatabase.prototype) as WebDatabase;
    db._tables = { conversation } as unknown as WebDatabase['_tables'];

    await db.exec(`
      UPDATE conversation
      SET last_activity_at = COALESCE(last_activity_at, updated_at)
      WHERE last_activity_at IS NULL
    `);

    expect(rows[0].last_activity_at).toBe(10);
    expect(rows[1].last_activity_at).toBe(18);
  });
});
