// Web 平台适配器 - 使用 Dexie (IndexedDB) 模拟 SQLite，keyring 持久化到 Dexie
import type { PlatformAdapter, DatabaseAdapter, FsAdapter, KeyringAdapter, DirEntryInfo } from '@yan-zhi/core';
import { decodeTextBytes } from '@yan-zhi/shared';
import Dexie from 'dexie';
// 授权码读取：走 UI 的 license-code 模块（keyring 加载 + 同步内存缓存），
// 与 apiFetch 的 x-license 头共用同一来源，避免两条路径口径漂移。
import { getLicenseCodeSync } from '@yan-zhi/ui/api/license-code';

/** 浏览器端明确的能力边界错误，用于替代裸 throw */
class WebPlatformNotSupportedError extends Error {
  override name = 'NotSupportedError';
}

export type WebSqlStatementKind =
  | 'empty'
  | 'ddl'
  | 'insert'
  | 'insert-select'
  | 'update'
  | 'delete'
  | 'noop'
  | 'unsupported';

/**
 * 去掉语句前面的 SQL 注释。`initSchema` 的 DDL 片段通常以
 * `-- 平台\nCREATE TABLE...` 开头；如果直接按首关键字判断，会把合法 DDL
 * 误判成不支持语句并阻断 Web 启动。
 */
export function stripLeadingWebSqlComments(sql: string): string {
  let rest = sql.trimStart();
  while (rest.startsWith('--') || rest.startsWith('/*')) {
    if (rest.startsWith('--')) {
      const newline = rest.indexOf('\n');
      rest = newline < 0 ? '' : rest.slice(newline + 1).trimStart();
      continue;
    }
    const end = rest.indexOf('*/', 2);
    rest = end < 0 ? '' : rest.slice(end + 2).trimStart();
  }
  return rest.trim();
}

/** 按 SQLite 语句边界拆分，忽略字符串、标识符和注释里的分号。 */
export function splitWebSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | ']' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (quote === ']' && char === ']') {
        quote = null;
      } else if (quote !== ']' && char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === '-' && next === '-') {
      current += `${char}${next}`;
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      current += `${char}${next}`;
      index += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[') {
      quote = ']';
      current += char;
      continue;
    }
    if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** 对 Web 端支持范围做单一分类，运行时与回归测试共用同一口径。 */
export function classifyWebSqlStatement(raw: string): WebSqlStatementKind {
  const sql = stripLeadingWebSqlComments(raw);
  if (!sql) return 'empty';
  if (/^(?:CREATE|DROP|ALTER)\b/i.test(sql)) return 'ddl';
  if (/^(?:BEGIN|COMMIT|END|PRAGMA|VACUUM|ANALYZE)\b/i.test(sql)) return 'noop';
  if (/^INSERT\s+(?:OR\s+\w+\s+)?INTO\b/i.test(sql)) {
    return /\bSELECT\b/i.test(sql) ? 'insert-select' : 'insert';
  }
  if (/^UPDATE\b/i.test(sql)) return 'update';
  if (/^DELETE\s+FROM\b/i.test(sql)) return 'delete';
  return 'unsupported';
}

/** Web 端数据库（用 Dexie 模拟 SQL 接口） */
export class WebDatabase extends Dexie implements DatabaseAdapter {
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
    // Web 端用 Dexie ORM，DDL 通过 version() 声明，语句执行器负责吸收 SQLite 方言差异。
    for (const rawStatement of splitWebSqlStatements(sql)) {
      const trimmed = stripLeadingWebSqlComments(rawStatement);
      const kind = classifyWebSqlStatement(trimmed);
      if (kind === 'empty' || kind === 'ddl' || kind === 'noop' || kind === 'insert-select') {
        continue;
      }

      // INSERT [OR IGNORE|REPLACE] INTO table (col1, col2, ...) VALUES (?, ?, ...)
      const ins = trimmed.match(
        /^INSERT\s+(?:OR\s+(IGNORE|REPLACE)\s+)?INTO\s+["`[]?(\w+)["`\]]?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
      if (ins) {
        const [, conflictMode, tableName, colsRaw, phRaw] = ins;
        const table = this._tables[tableName];
        if (!table) throw new Error(`未知表: ${tableName}`);
        const cols = colsRaw.split(',').map((c) => c.trim().replace(/^["`[]|["`\]]$/g, ''));
        const phCount = phRaw.split(',').length;
        if (phCount !== cols.length || phCount !== params.length) {
          throw new Error(`INSERT 参数数量不匹配: cols=${cols.length}, placeholders=${phCount}, params=${params.length}`);
        }
        const row: Record<string, unknown> = {};
        cols.forEach((c, i) => (row[c] = params[i]));
        if (conflictMode?.toUpperCase() === 'REPLACE') {
          await table.put(row);
        } else if (conflictMode?.toUpperCase() === 'IGNORE' && row.id != null) {
          if (!(await table.get(row.id))) await table.add(row);
        } else {
          await table.add(row);
        }
        continue;
      }

      // UPDATE table SET col1=?, col2=? WHERE col=?
      const upd = trimmed.match(/^UPDATE\s+["`[]?(\w+)["`\]]?\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
      if (upd) {
        const [, tableName, setRaw, whereRaw] = upd;
        const table = this._tables[tableName];
        if (!table) throw new Error(`未知表: ${tableName}`);
        const whereEq = whereRaw.match(/^["`[]?(\w+)["`\]]?\s*=\s*\?$/i);
        const whereNull = whereRaw.match(/^["`[]?(\w+)["`\]]?\s+IS\s+NULL$/i);
        const coalesceSet = setRaw.match(
          /^["`[]?(\w+)["`\]]?\s*=\s*COALESCE\(\s*["`[]?(\w+)["`\]]?\s*,\s*["`[]?(\w+)["`\]]?\s*\)$/i,
        );
        if (coalesceSet && whereNull) {
          const [, targetColumn, firstColumn, fallbackColumn] = coalesceSet;
          const nullColumn = whereNull[1];
          await table.toCollection().modify((row: Record<string, unknown>) => {
            if (row[nullColumn] == null) {
              row[targetColumn] = row[firstColumn] ?? row[fallbackColumn];
            }
          });
          continue;
        }
        const setParts = setRaw.split(',').map((part) => part.trim());
        const patch: Record<string, unknown> = {};
        let paramIndex = 0;
        for (const part of setParts) {
          const assignment = part.match(/^["`[]?(\w+)["`\]]?\s*=\s*(.*)$/s);
          if (!assignment) {
            throw new Error(`[WebDatabase] 不支持的 UPDATE 赋值: ${part.slice(0, 80)}`);
          }
          const [, column, expression] = assignment;
          if (expression.trim() === '?') {
            patch[column] = params[paramIndex];
            paramIndex += 1;
          } else if (/^NULL$/i.test(expression.trim())) {
            patch[column] = null;
          } else {
            patch[column] = expression.trim();
          }
        }

        if (whereEq) {
          const whereVal = params[paramIndex];
          await table.where(whereEq[1]).equals(whereVal as never).modify(patch);
        } else if (whereNull) {
          const column = whereNull[1];
          await table.toCollection().modify((row: Record<string, unknown>) => {
            if (row[column] == null) {
              Object.assign(row, patch);
            }
          });
        } else if (params.length === 0) {
          // schema.ts 的 SQLite 数据回填使用表达式而非绑定参数；Web 端保留调用时的数据，
          // 不把表达式字符串写进 Dexie 行。
          continue;
        } else {
          throw new Error(`[WebDatabase] 不支持的 UPDATE 条件: ${whereRaw.slice(0, 100)}`);
        }
        continue;
      }

      // DELETE FROM table WHERE col=?
      const del = trimmed.match(/^DELETE\s+FROM\s+["`[]?(\w+)["`\]]?\s+WHERE\s+([\s\S]+)$/i);
      if (del) {
        const [, tableName, whereRaw] = del;
        const table = this._tables[tableName];
        if (!table) throw new Error(`未知表: ${tableName}`);
        const whereMatch = whereRaw.match(/^["`[]?(\w+)["`\]]?\s*=\s*\?$/i);
        if (whereMatch) {
          await table.where(whereMatch[1]).equals(params[params.length - 1] as never).delete();
        }
        continue;
      }

      // 非 DDL 的未知语句不再静默吞掉，显式失败并记录结构化能力告警
      const err = new Error(`[WebDatabase] 不支持的 SQL: ${trimmed.slice(0, 120)}`);
      console.warn('[WebDatabase] capability: unsupported-sql', { sql: trimmed.slice(0, 200) });
      throw err;
    }
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
    // ★ 不能直接 file.text()（写死 UTF-8）——GBK/ANSI 中文 txt 会解成乱码。
    //   取字节后走 shared 的自动识别。
    const buf = await file.arrayBuffer();
    return decodeTextBytes(new Uint8Array(buf)).text;
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
    // 容错：若误传 data URL 则剥出纯 base64（契约是已剥前缀的 base64）
    const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
    const bin = atob(raw.replace(/\s/g, ''));
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
  hasWorkspaceRoot(): boolean { return this.getAuthorized(); }
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
  // 授权码读取器：走代理的 LLM 请求必须带 x-license，否则开启门禁的部署一律 403。
  // 与 apiFetch 共用同一来源（UI 的 license-code 内存缓存），避免两条路径口径漂移。
  getLicenseCode: () => getLicenseCodeSync(),
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
