// Web 平台适配器 - 使用 Dexie (IndexedDB) 模拟 SQLite，keyring 持久化到 Dexie
import type { PlatformAdapter, DatabaseAdapter, FsAdapter, KeyringAdapter } from '@yan-zhi/core';
import Dexie from 'dexie';

/** 浏览器端明确的能力边界错误，用于替代裸 throw */
class WebPlatformNotSupportedError extends Error {
  override name = 'NotSupportedError';
}

/** Web 端数据库（用 Dexie 模拟 SQL 接口） */
class WebDatabase extends Dexie implements DatabaseAdapter {
  _tables: Record<string, Dexie.Table<any, string>>;
  keyring!: Dexie.Table<{ key: string; value: string }, string>;

  constructor() {
    super('yan-zhi');
    this.version(1).stores({
      platform: 'id, name, status, created_at',
      model: 'id, platform_id, model_id, type, enabled, is_default',
      conversation: 'id, agent_id, platform_id, pinned, updated_at',
      message: 'id, conversation_id, created_at',
      tool_call: 'id, message_id',
      mcp_server: 'id, name, transport, status',
      mcp_tool: 'id, mcp_server_id, name',
      agent: 'id, parent_agent_id, updated_at',
      agent_node: 'id, agent_id',
      memory: 'id, agent_id, last_used_at',
      skill: 'id, name, source, enabled',
      model_call: 'id, platform_id, created_at',
      keyring: 'key',
    });
    this.version(2).stores({
      agent_profile: 'id, name, is_default, created_at',
    });
    this._tables = {
      platform: this.table('platform'),
      model: this.table('model'),
      conversation: this.table('conversation'),
      message: this.table('message'),
      tool_call: this.table('tool_call'),
      mcp_server: this.table('mcp_server'),
      mcp_tool: this.table('mcp_tool'),
      agent: this.table('agent'),
      agent_node: this.table('agent_node'),
      memory: this.table('memory'),
      skill: this.table('skill'),
      model_call: this.table('model_call'),
      agent_profile: this.table('agent_profile'),
    };
    this.keyring = this.table('keyring');
  }

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    // Web 端用 Dexie ORM，DDL 通过 version() 声明，这里只实现 INSERT/UPDATE/DELETE
    const trimmed = sql.trim();

    // INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
    const ins = trimmed.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (ins) {
      const [, tableName, colsRaw, phRaw] = ins;
      const table = this._tables[tableName];
      if (!table) throw new Error(`未知表: ${tableName}`);
      const cols = colsRaw.split(',').map((c) => c.trim());
      const phCount = phRaw.split(',').length;
      if (phCount !== cols.length || phCount !== params.length) {
        throw new Error(`INSERT 参数数量不匹配: cols=${cols.length}, placeholders=${phCount}, params=${params.length}`);
      }
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = params[i]));
      await table.add(row);
      return;
    }

    // UPDATE table SET col1=?, col2=? WHERE col=?
    const upd = trimmed.match(/^UPDATE\s+(\w+)\s+SET\s+([^]+?)\s+WHERE\s+([^]+)$/i);
    if (upd) {
      const [, tableName, setRaw, whereRaw] = upd;
      const table = this._tables[tableName];
      if (!table) throw new Error(`未知表: ${tableName}`);
      const setCols = setRaw.split(',').map((s) => s.trim().split('=')[0].trim());
      // 简化：SET 部分按顺序消耗 params，WHERE 部分剩余的 params 用于过滤
      const setValues = params.slice(0, setCols.length);
      const whereValues = params.slice(setCols.length);
      const patch: Record<string, unknown> = {};
      setCols.forEach((c, i) => (patch[c] = setValues[i]));
      // 简化 WHERE：仅支持 col=? 形式，取最后一个作为主键过滤
      const whereMatch = whereRaw.match(/(\w+)\s*=\s*\?/);
      if (whereMatch) {
        const [, whereCol] = whereMatch;
        const whereVal = whereValues[whereValues.length - 1];
        await table.where(whereCol).equals(whereVal as never).modify(patch);
      } else {
        await table.toCollection().modify(patch);
      }
      return;
    }

    // DELETE FROM table WHERE col=?
    const del = trimmed.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+([^]+)$/i);
    if (del) {
      const [, tableName, whereRaw] = del;
      const table = this._tables[tableName];
      if (!table) throw new Error(`未知表: ${tableName}`);
      const whereMatch = whereRaw.match(/(\w+)\s*=\s*\?/);
      if (whereMatch) {
        const [, whereCol] = whereMatch;
        await table.where(whereCol).equals(params[params.length - 1] as never).delete();
      }
      return;
    }

    // DDL（CREATE TABLE / CREATE INDEX / CREATE VIRTUAL TABLE）：Dexie 已通过 version() 声明，忽略
    if (/^(CREATE|DROP|ALTER)\s/i.test(trimmed)) return;

    // 非 DDL 的未知语句不再静默吞掉，显式失败并记录结构化能力告警
    const err = new Error(`[WebDatabase] 不支持的 SQL: ${sql.slice(0, 120)}`);
    console.warn('[WebDatabase] capability: unsupported-sql', { sql: sql.slice(0, 200) });
    throw err;
  }

  async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
    // 支持：SELECT * FROM table [WHERE col=?] [ORDER BY col1 ASC|DESC, col2 ASC|DESC, ...]
    const m = sql.match(/^SELECT\s+\*\s+FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?)?(?:\s+ORDER\s+BY\s+(.+?))?$/i);
    if (!m) {
      console.warn('[WebDatabase] capability: unsupported-query', { sql: sql.slice(0, 200) });
      throw new Error(`[WebDatabase] 不支持的查询: ${sql.slice(0, 120)}`);
    }
    const [, tableName, whereCol, orderByRaw] = m;
    const table = this._tables[tableName];
    if (!table) {
      throw new Error(`[WebDatabase] 未知表: ${tableName}`);
    }
    let collection: Dexie.Collection<any, string>;
    if (whereCol && _params && _params.length > 0) {
      collection = table.where(whereCol).equals(_params[0] as never);
    } else {
      collection = table.toCollection();
    }
    // 解析多字段排序：col1 DESC, col2 ASC
    const orderCols: Array<{ col: string; dir: 'ASC' | 'DESC' }> = [];
    if (orderByRaw) {
      for (const part of orderByRaw.split(',')) {
        const tm = part.trim().match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
        if (tm) orderCols.push({ col: tm[1], dir: (tm[2] || 'ASC').toUpperCase() as 'ASC' | 'DESC' });
      }
    }
    if (orderCols.length > 0) {
      const rows = await collection.toArray();
      rows.sort((a, b) => {
        for (const { col, dir } of orderCols) {
          const av = a[col];
          const bv = b[col];
          if (av === bv) continue;
          const cmp = av > bv ? 1 : -1;
          return dir === 'DESC' ? -cmp : cmp;
        }
        return 0;
      });
      return rows as T[];
    }
    return (await collection.toArray()) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return super.transaction('rw', Object.values(this._tables), fn);
  }
}

/** Web 文件系统（受浏览器沙箱约束）
 *  网页端无法直接访问本地文件系统，统一通过显式 NotSupportedError 降级，
 *  避免把“平台限制”伪装成普通的运行时异常。 */
class WebFs implements FsAdapter {
  private unsupported(action: string, path: string): WebPlatformNotSupportedError {
    return new WebPlatformNotSupportedError(
      `[WebFs] ${action}（${path}）在浏览器网页端不可用。请改用文件上传/下载能力，或切换到桌面端。`,
    );
  }

  async readFile(path: string): Promise<string> {
    throw this.unsupported('读取文件', path);
  }
  async readFileBase64(path: string): Promise<string> {
    throw this.unsupported('读取文件', path);
  }
  async writeFile(path: string, _content: string): Promise<void> {
    throw this.unsupported('写入文件', path);
  }
  async exists(_path: string): Promise<boolean> { return false; }
  async mkdir(path: string): Promise<void> {
    throw this.unsupported('创建目录', path);
  }
  async remove(path: string): Promise<void> {
    throw this.unsupported('删除文件', path);
  }
  async readDir(path: string): Promise<string[]> {
    throw this.unsupported('读取目录', path);
  }
}

/** Web 钥匙串 - 持久化到 Dexie（IndexedDB）
 *  MVP 阶段：明文存储，刷新不丢失。
 *  后续可接入 Web Crypto API 用主密码派生密钥加密 */
class WebKeyring implements KeyringAdapter {
  constructor(private db: WebDatabase) {}

  async set(key: string, value: string): Promise<void> {
    await this.db.keyring.put({ key, value });
  }
  async get(key: string): Promise<string | null> {
    const row = await this.db.keyring.get(key);
    return row?.value || null;
  }
  async delete(key: string): Promise<void> {
    await this.db.keyring.delete(key);
  }
}

// 单例：先实例化 DB，再用 DB 实例化 keyring
const webDb = new WebDatabase();

export const webAdapter: PlatformAdapter = {
  platform: 'web',
  db: webDb,
  fs: new WebFs(),
  keyring: new WebKeyring(webDb),
  // Web 端不支持 MCP stdio
};
