// Web 平台适配器 - 使用 Dexie (IndexedDB) 模拟 SQLite，keyring 持久化到 Dexie
import type { PlatformAdapter, DatabaseAdapter, FsAdapter, KeyringAdapter, DirEntryInfo } from '@yan-zhi/core';
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
    this.version(3).stores({
      scheduled_task: 'id, enabled, created_at',
    });
    // 改动③：message 表新增子智能体关联字段索引（parent_tool_call_id / sub_agent_id），
    // 子智能体中间消息持久化后可按父工具调用/子智能体查询；sub_agent_name/sub_agent_depth 为非索引字段，Dexie 自动存储。
    this.version(4).stores({
      message: 'id, conversation_id, created_at, parent_tool_call_id, sub_agent_id',
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
      scheduled_task: this.table('scheduled_task'),
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

  // @ts-expect-error - DatabaseAdapter.transaction 与 Dexie.transaction 签名冲突，此处有意覆盖
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return (Dexie.prototype.transaction as any).call(this, 'rw', Object.values(this._tables), fn);
  }
}

/** Web 文件系统 —— 优先使用 File System Access API（Chromium 系浏览器支持）。
 *  用户授权一个根目录后，所有路径相对于该根解析。
 *  Safari/Firefox 不支持时降级为 NotSupportedError，引导用户用桌面端或上传/下载。 */
class WebFs implements FsAdapter {
  private rootHandle: any = null;
  private rootName = '';

  private unsupported(action: string, path: string): WebPlatformNotSupportedError {
    return new WebPlatformNotSupportedError(
      `[WebFs] ${action}（${path}）在浏览器网页端不可用。请先授权工作区目录，或改用桌面端。`,
    );
  }

  private isSupported(): boolean {
    return typeof (window as any).showDirectoryPicker === 'function';
  }

  /** 规范化路径：去掉前导 / 和 ./，按 / 分割，过滤空段 */
  private parsePath(path: string): string[] {
    return path.replace(/^\.?\//, '').split('/').filter(Boolean);
  }

  /** 遍历到目标文件的父目录，返回 (父目录 handle, 文件名) */
  private async resolveFile(path: string): Promise<{ dir: any; name: string }> {
    const segs = this.parsePath(path);
    if (segs.length === 0) throw new Error(`[WebFs] 路径无效: ${path}`);
    const name = segs.pop()!;
    let dir = this.rootHandle;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg);
    }
    return { dir, name };
  }

  /** 遍历到目标目录 handle */
  private async resolveDir(path: string): Promise<any> {
    const segs = this.parsePath(path);
    let dir = this.rootHandle;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg);
    }
    return dir;
  }

  async readFile(path: string): Promise<string> {
    if (!this.rootHandle) throw this.unsupported('读取文件', path);
    const { dir, name } = await this.resolveFile(path);
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return file.text();
  }

  async readFileBase64(path: string): Promise<string> {
    if (!this.rootHandle) throw this.unsupported('读取文件', path);
    const { dir, name } = await this.resolveFile(path);
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.rootHandle) throw this.unsupported('写入文件', path);
    const { dir, name } = await this.resolveFile(path);
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async writeFileBase64(path: string, b64: string): Promise<void> {
    if (!this.rootHandle) throw this.unsupported('写入文件', path);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const { dir, name } = await this.resolveFile(path);
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async exists(path: string): Promise<boolean> {
    if (!this.rootHandle) return false;
    const segs = this.parsePath(path);
    if (segs.length === 0) return true;
    try {
      let dir = this.rootHandle;
      for (let i = 0; i < segs.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segs[i]);
      }
      const last = segs[segs.length - 1];
      try { await dir.getFileHandle(last); return true; } catch { /* not a file */ }
      try { await dir.getDirectoryHandle(last); return true; } catch { /* not a dir */ }
      return false;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    if (!this.rootHandle) throw this.unsupported('创建目录', path);
    const segs = this.parsePath(path);
    let dir = this.rootHandle;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
  }

  async remove(path: string): Promise<void> {
    if (!this.rootHandle) throw this.unsupported('删除文件', path);
    const segs = this.parsePath(path);
    if (segs.length === 0) throw new Error(`[WebFs] 不能删除根目录`);
    let dir = this.rootHandle;
    for (let i = 0; i < segs.length - 1; i++) {
      dir = await dir.getDirectoryHandle(segs[i]);
    }
    await dir.removeEntry(segs[segs.length - 1]);
  }

  async readDir(path: string): Promise<string[]> {
    if (!this.rootHandle) throw this.unsupported('读取目录', path);
    const dir = await this.resolveDir(path);
    const names: string[] = [];
    for await (const [name] of dir.entries()) names.push(name);
    return names;
  }

  async listDirEntries(path: string): Promise<DirEntryInfo[]> {
    if (!this.rootHandle) throw this.unsupported('读取目录', path);
    const dir = await this.resolveDir(path);
    const entries: DirEntryInfo[] = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push({ name, path: this.joinPath(path, name), isDir: handle.kind === 'directory' });
    }
    return entries;
  }

  private joinPath(base: string, name: string): string {
    const b = base.replace(/^\.?\//, '').replace(/\/$/, '');
    return b ? `${b}/${name}` : name;
  }

  // ── 授权与持久化 ──
  /** 弹出目录选择器，授权根目录。返回根目录名。不支持 FSA API 时 throw NotSupported。 */
  async authorize(): Promise<string> {
    if (!this.isSupported()) {
      throw new WebPlatformNotSupportedError('[WebFs] 当前浏览器不支持 File System Access API，请使用 Chrome/Edge 或桌面端。');
    }
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    this.rootHandle = handle;
    this.rootName = handle.name || 'workspace';
    await saveFsRootHandle(handle);
    return this.rootName;
  }

  /** 从 IndexedDB 恢复已授权的根目录 handle（刷新后自动恢复） */
  async restore(): Promise<boolean> {
    if (this.rootHandle) return true;
    try {
      const handle = await loadFsRootHandle();
      if (handle) {
        this.rootHandle = handle;
        this.rootName = handle.name || 'workspace';
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  getAuthorized(): boolean { return !!this.rootHandle; }
  getRootName(): string { return this.rootName; }
}

/** 用原生 IndexedDB 持久化 FSA directory handle（结构化克隆兼容） */
const FS_IDB_DB = 'yan-zhi-fs';
const FS_IDB_STORE = 'handles';
const FS_IDB_KEY = 'root';

function loadFsRootHandle(): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(FS_IDB_DB, 1);
      req.onupgradeneeded = (e: any) => {
        e.target.result.createObjectStore(FS_IDB_STORE);
      };
      req.onsuccess = (e: any) => {
        const idb = e.target.result;
        try {
          const tx = idb.transaction(FS_IDB_STORE, 'readonly');
          const get = tx.objectStore(FS_IDB_STORE).get(FS_IDB_KEY);
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function saveFsRootHandle(handle: any): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(FS_IDB_DB, 1);
      req.onupgradeneeded = (e: any) => {
        e.target.result.createObjectStore(FS_IDB_STORE);
      };
      req.onsuccess = (e: any) => {
        const idb = e.target.result;
        try {
          const tx = idb.transaction(FS_IDB_STORE, 'readwrite');
          tx.objectStore(FS_IDB_STORE).put(handle, FS_IDB_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      };
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

// 模块级单例的 WebFs，供授权 API 引用
const webFs = new WebFs();
// 启动时尝试恢复已授权的根目录
webFs.restore().catch(() => undefined);

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
  fs: webFs,
  keyring: new WebKeyring(webDb),
  // LLM 走后端代理（/api/llm/*）：API Key 不暴露给前端，后端从库读配置转发。
  llmProxyBase: '/api/llm',
  // Web 端不支持 MCP stdio
};

// ── Web 文件系统授权 API（供 UI 调用）──
export async function authorizeWebFs(): Promise<string> {
  return webFs.authorize();
}
export function isWebFsAuthorized(): boolean {
  return webFs.getAuthorized();
}
export function getWebFsRootName(): string {
  return webFs.getRootName();
}
