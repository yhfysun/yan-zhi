// 移动平台适配器（Capacitor）
import type { PlatformAdapter, DatabaseAdapter, FsAdapter, KeyringAdapter } from '@yan-zhi/core';
import { decodeTextBytes, base64ToBytes, localApiBase } from '@yan-zhi/shared';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
// 路径归一化：绝对路径 vs Directory.Data 相对路径（见 path-utils.ts 说明）
import { toFsArg } from './path-utils';
// 授权码读取：与 apiFetch 的 x-license 头共用同一来源，避免两条路径口径漂移。
import { getLicenseCodeSync } from '@yan-zhi/ui/api/license-code';

/**
 * LLM 代理基址：远程模式代理到远程节点的 /api/llm，内嵌模式代理到本机内嵌后端。
 * 与 packages/ui/src/api/client.ts 的 API_BASE 同口径（mobile_api_base 优先，回退内嵌）。
 * 不设的话 LlmClient 会从 WebView 直连上游 —— 除了把 API Key 暴露在端上直连请求里，
 * Anthropic 直连还要求浏览器专用头，Token 池/熔断也全部绕过。改地址靠 reload 重算，
 * 模块加载时取一次即可。
 * ★ 内嵌端口走 shared 的 localApiBase()（移动端单实例，回落 3001），不写死常量。
 */
function resolveLlmProxyBase(): string {
  try {
    const remote = localStorage.getItem('mobile_api_base') || '';
    if (remote) return remote.replace(/\/+$/, '') + '/api/llm';
  } catch { /* ignore */ }
  return `${localApiBase()}/llm`;
}

/** 移动端 SQLite 数据库（Capacitor SQLite 插件） */
class MobileDatabase implements DatabaseAdapter {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const dbConnection = await this.sqlite.createConnection(
      'yan-zhi',
      false,
      'no-encryption',
      1,
      false,
    );
    this.db = dbConnection;
    await this.db.open();
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.ready;
    await this.db.run(sql, (params || []) as any[]);
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.ready;
    const result = await this.db.query(sql, (params || []) as any[]);
    return (result.values || []) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready;
    await this.db.beginTransaction();
    try {
      const result = await fn();
      await this.db.commitTransaction();
      return result;
    } catch (e) {
      await this.db.rollbackTransaction();
      throw e;
    }
  }
}

/**
 * 移动端文件系统（Capacitor Filesystem 插件）
 *
 * ★★ 路径归一化见 `./path-utils.ts` 的 `toFileUri`（附详细根因说明）：
 * `Directory.Data` 下的 `path` 必须是**相对路径**，而后端产出的是**绝对路径** ——
 * 直接混用会让 Capacitor 二次拼接根目录，得到
 * `/data/user/0/<pkg>/files/data/data/<pkg>/files/...`（路径重复、文件不存在）。
 * 所以绝对路径一律走 `file://` 直连。
 */
class MobileFs implements FsAdapter {
  /** 统一入参：绝对路径 → file://（不传 directory）；相对路径 → Directory.Data。 */
  private arg(path: string): { path: string; directory?: Directory } {
    return toFsArg(path, Directory.Data);
  }

  async readFile(path: string): Promise<string> {
    // ★ 不能用 Encoding.UTF8（GBK/ANSI 中文 txt 会解成乱码）。
    //   读原始字节（base64）后走 shared 的自动识别。
    const b64 = await this.readFileBase64(path);
    return decodeTextBytes(base64ToBytes(b64)).text;
  }
  async readFileBase64(path: string): Promise<string> {
    const result = await Filesystem.readFile(this.arg(path));
    return result.data as string;
  }
  async writeFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({ ...this.arg(path), data: content, encoding: Encoding.UTF8, recursive: true });
  }
  async writeFileBase64(path: string, b64: string): Promise<void> {
    // 不传 encoding：Capacitor 将 data 按 base64 解码写入二进制
    await Filesystem.writeFile({ ...this.arg(path), data: b64, recursive: true });
  }
  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat(this.arg(path));
      return true;
    } catch {
      return false;
    }
  }
  async mkdir(_path: string): Promise<void> {
    // Capacitor mkdir 递归创建在 writeFile 时已处理
  }
  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile(this.arg(path));
  }
  async readDir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir(this.arg(path));
    return result.files.map((f) => f.name);
  }
}

/** 移动端钥匙串（Capacitor Preferences） */
class MobileKeyring implements KeyringAdapter {
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key: `keyring:${key}`, value });
  }
  async get(key: string): Promise<string | null> {
    const result = await Preferences.get({ key: `keyring:${key}` });
    return result.value;
  }
  async delete(key: string): Promise<void> {
    await Preferences.remove({ key: `keyring:${key}` });
  }
}

export const mobileAdapter: PlatformAdapter = {
  platform: 'mobile',
  db: new MobileDatabase(),
  fs: new MobileFs(),
  keyring: new MobileKeyring(),
  // LLM 请求统一走后端代理（内嵌 127.0.0.1:3001 或远程节点），见 resolveLlmProxyBase
  llmProxyBase: resolveLlmProxyBase(),
  // 移动端不支持 MCP stdio（仅支持远程 sse/http）
  // 授权码读取器：内嵌后端同样会开授权门禁，走代理的 LLM 请求需带 x-license。
  // 与 apiFetch 共用同一来源（UI 的 license-code 内存缓存）。
  getLicenseCode: () => getLicenseCodeSync(),
};
