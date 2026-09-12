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
  /** 以 base64 写入二进制文件（用于上传图片/PDF/Office 文档的原始字节落盘） */
  writeFileBase64(path: string, b64: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** 文件元信息（可选）：预览面板展示大小/修改时间；未实现端（如 Web OPFS）可省略 */
  stat?(path: string): Promise<{ size: number; mtimeMs: number; isDir: boolean }>;
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

/** LLM Token 池适配（仅 server 端注入）：供 LlmClient 直连时换 Key 重试与失败回写。
 *  浏览器端走后端代理（llmProxyBase），轮换逻辑在后端 llm-proxy 内实现，无需注入。 */
export interface LlmKeyPoolAdapter {
  /** 取一个可用 Key（排除已试过的）。返回 null 表示池为空/耗尽，调用方回退 keyring 主 Key */
  acquire(platformId: string, excludeIds: string[]): Promise<{ id: string; apiKey: string } | null>;
  /** 请求成功回写（衰减失败计数） */
  reportSuccess(id: string): void;
  /** 请求失败回写（任何错误：网络异常或非 2xx），下次 acquire 自动避开 */
  reportFailure(id: string): void;
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
  /** LLM 代理基址（如 '/api/llm'）。设置后 LlmClient 走后端代理转发，避免浏览器 CORS 并隐藏 API Key。
   *  浏览器端（web/desktop 渲染进程）注入；server 端不注入（直连上游）。 */
  llmProxyBase?: string;
  /** LLM Token 池适配（仅 server 端注入）。设置后 LlmClient 直连失败会自动换 Key 重试并回写失败记录。 */
  llmKeyPool?: LlmKeyPoolAdapter;
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
