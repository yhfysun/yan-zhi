// 平台抽象层 - 三端差异通过 adapter 注入
import type { RuntimePlatform } from '@yan-zhi/shared';

/** 数据库适配器 */
export interface DatabaseAdapter {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** 目录条目信息（结构化） */
export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
}

/** 文件系统适配器 */
export interface FsAdapter {
  /** 读取文本文件内容（UTF-8）。二进制文件会返回乱码，请勿用于图片/PDF 预览 */
  readFile(path: string): Promise<string>;
  /** 以 base64 读取文件原始字节（用于图片/PDF 等二进制内容的预览） */
  readFileBase64(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  readDir(path: string): Promise<string[]>;
  /** 可选：返回结构化目录条目（含 is_dir）。桌面端用 Rust 命令一次获取，避免 N+1 调用 */
  listDirEntries?(path: string): Promise<DirEntryInfo[]>;
}

/** 钥匙串适配器（安全存储 API Key） */
export interface KeyringAdapter {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

/** MCP 子进程适配器（仅桌面端） */
export interface McpProcessAdapter {
  start(command: string, args: string[], env: Record<string, string>): Promise<string>; // 返回 childId
  call(childId: string, method: string, params: unknown): Promise<unknown>;
  kill(childId: string): Promise<void>;
  /** 是否真正实现 stdio JSON-RPC。Electron 主壳为 true；未实现的最小壳应设为 false，UI 据此禁用 stdio。 */
  supportsStdio?: boolean;
}

/** Shell 命令执行适配器（仅桌面端支持长时间运行的命令） */
export interface ShellAdapter {
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/** 平台适配器聚合 */
export interface PlatformAdapter {
  platform: RuntimePlatform;
  db: DatabaseAdapter;
  fs: FsAdapter;
  keyring: KeyringAdapter;
  mcp?: McpProcessAdapter; // 仅桌面端有
  shell?: ShellAdapter;    // 仅桌面端有
}

/** 当前平台适配器（由各端入口注入） */
let currentAdapter: PlatformAdapter | null = null;

export function setPlatformAdapter(adapter: PlatformAdapter): void {
  currentAdapter = adapter;
}

export function getPlatformAdapter(): PlatformAdapter {
  if (!currentAdapter) {
    throw new Error('PlatformAdapter 未初始化，请在应用入口调用 setPlatformAdapter()');
  }
  return currentAdapter;
}
