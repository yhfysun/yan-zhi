// API 客户端 —— 自动附带 JWT Token
// Electron file:// 协议下 /api 会失效，需用本机内嵌后端绝对地址（端口随实例：生产 3001 / 开发 3002）
import { resolveLocalApiPort, localApiBase } from '@yan-zhi/shared';
import { getLicenseCodeSync } from './license-code';

export const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
export const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform;

/**
 * 本机单机端的内嵌后端基址。
 *
 * ★★★ 端口**不能硬编码**（2026-09-27）：开发实例监听 3002、安装版监听 3001，
 *   两个实例可同时运行。前端若写死 3001，开发实例界面会去请求**安装版的后端**
 *   （数据串台），而安装版界面也会被开发版后端接管（用户报的"改代码软件就变了"）。
 *
 * 端口解析统一走 `@yan-zhi/shared` 的 `resolveLocalApiPort`（读 preload 下发的 apiPort），
 * 不在本文件另写一套 —— 否则又是一处会漂移的硬编码。
 */
export const LOCAL_API_PORT: number = resolveLocalApiPort();
export const LOCAL_API_BASE = localApiBase();

/**
 * 是否「本机单机端」—— Electron 桌面端 / Capacitor 移动端。
 *
 * ★★★ 为什么两端必须同判（2026-09-27 用户：「移动端不应该也是默认登录？」）：
 *   这两端都跑**内嵌后端**（`@capawesome/capacitor-nodejs` 起的 127.0.0.1:3001），
 *   而后端 `authMiddleware` 恒定把身份置为 guest（全库 seed 数据 user_id 都是 guest）。
 *   即身份是**本地自带的**，不是用户登进来的 —— 所以两端都不该有"登录"概念。
 *
 * ★ 为什么不能直接用 `isElectron`：`auth.ts` 的 loadUser 只对桌面端取 guest token，
 *   移动端 `user` 恒为 null → 所有「未登录 → 登录入口」的 v-else 分支在**移动端稳定出现**，
 *   渲染出一个点了没用的「登录」死入口（Web 端才是真有登录需求的那一端）。
 */
export const isLocalClient = isElectron || isCapacitor;

// 移动端支持用户配置远程后端地址（方案 A：连远程节点）；未配置时走内嵌本地后端（方案 B）
const mobileRemoteBase = getMobileApiBase();
export const API_BASE = isElectron
  ? LOCAL_API_BASE
  : isCapacitor
    ? (mobileRemoteBase ? mobileRemoteBase.replace(/\/$/, '') + '/api' : LOCAL_API_BASE)
    : '/api';
const BASE_URL = API_BASE;

const MOBILE_API_BASE_KEY = 'mobile_api_base';

/** 当前配置的移动端远程后端地址；未配置返回 ''（走 APK 内嵌本地后端） */
export function getMobileApiBase(): string {
  try {
    return localStorage.getItem(MOBILE_API_BASE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * 写入移动端远程后端地址；传空串 = 清除配置，回落内嵌本地后端。
 * 只校验 http(s) 形态并去尾斜杠，不做连通性探测（探测交给「测试」入口或用户）。
 * ⚠️ BASE_URL 是模块级常量：本函数写完后**新值不会自动作用于已建立的请求**，
 * 设置页保存后需 location.reload() 一次性重载生效（免用户手动重启 App）。
 */
export function setMobileApiBase(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('API 地址必须以 http:// 或 https:// 开头');
  }
  try {
    if (trimmed) localStorage.setItem(MOBILE_API_BASE_KEY, trimmed);
    else localStorage.removeItem(MOBILE_API_BASE_KEY);
  } catch { /* ignore */ }
  return trimmed;
}

function getToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

/** 本地已存授权码。授权门禁（后端 YZ_LICENSE_GUARD=1）开启时所有业务接口都要带上。
 *
 *  取值走 license-code 模块的内存缓存：授权码已改为存 keyring（桌面端 DPAPI 加密），
 *  异步 IO 不适合放在同步的请求头构造里。缓存由授权 store 在启动时填充。 */
export function getLicenseCode(): string | null {
  return getLicenseCodeSync();
}

/**
 * 给直连（不走 apiFetch）的请求补上鉴权与授权头。
 *
 * 为什么需要：SSE 流、tool-result 这类请求直接用 fetch，各自重复拼 Authorization；
 * 授权门禁上线后如果漏补 x-license，会表现为「界面正常但聊天流 403」这种局部故障。
 * 统一走这里，新增直连请求不再需要各自记住两套头。
 * 传 undefined 的 value 会被跳过，便于调用方保留自己的 Content-Type（如 SSE 不设 JSON）。
 */
export function buildRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getToken();
  if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;
  const license = getLicenseCode();
  if (license && !headers['x-license']) headers['x-license'] = license;
  return headers;
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem('auth_token', t);
    else localStorage.removeItem('auth_token');
  } catch {}
}

/**
 * 接口错误。除了一句 error，还要能把后端附带的结构化明细带出来。
 *
 * 为什么需要 details：后端在 400 时会把「为什么不让你跑」的清单放在响应 data 里
 * （典型是工作流预检 issues）。若只返回 error，前端就只能显示笼统的「启动失败」，
 * 用户不知道该改什么 —— 实测踩到过（预检面板显示成「启动失败 / 运行前检查未通过」）。
 *
 * ⚠️ 字段名**必须叫 details 不能叫 data**：成功分支是 `{ data }`，调用方普遍用
 * `'data' in r` 区分成功/失败。错误分支若也叫 data，这个判别对两边都成立，
 * TypeScript 会把 data 推成 `T | unknown` = unknown，连带 15+ 处调用方全部类型报错。
 */
export interface ApiError {
  error: string;
  status?: number;
  details?: unknown;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T } | ApiError> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string> | undefined) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const licenseCode = getLicenseCode();
  if (licenseCode) headers['x-license'] = licenseCode;

  const res = await fetch(BASE_URL + path, { ...options, headers }).catch((e: unknown) => {
    // ★★★ 网络层错误**必须转成 ApiError 返回，绝不能抛出去**。
    //
    // 背景（2026-09-22 定位到的移动端"数据不初始化"根因）：
    //   Capacitor 真机的启动顺序是「WebView 先加载前端 → 内嵌 Node 后端后启动」，
    //   于是**首个请求必然打在一个还没监听的后端上** → `ERR_CONNECTION_REFUSED`
    //   → `fetch` 抛 `TypeError: Failed to fetch`。
    //   而本函数原先没有 catch，异常直接冒泡：
    //     ① `licenseStore.init()` 挂掉 → 路由守卫 `await init()` 抛错 →
    //        **`[Vue Router] Unexpected error when starting the router`** →
    //        `.chat-page` 从未挂载 → `useChat.onMounted()` 根本没执行 →
    //        **平台/模型/智能体/技能全是空的**（用户："数据初始化不行"）；
    //     ② 任何一处调用方（如 mounted hook）也会被这一下打死
    //        （`Unhandled error during execution of mounted hook`）。
    //   ★ 这与 ApiError 的设计意图一致：**失败是返回值，不是异常** ——
    //     只有"网络层没接住"这个漏洞让异常漏了出去。
    //   返回 status: 0 作为"未拿到 HTTP 响应"的哨兵值，调用方据此区分
    //   「后端不可达（可重试）」与「后端明确拒绝（4xx/5xx）」。
    void e;
    return null;
  });
  if (!res) {
    return { error: 'NETWORK_UNREACHABLE', status: 0 };
  }
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    // 本地模式已屏蔽鉴权，401 不再清 token 跳登录
    return {
      error: (json as any).error || `请求失败 (${res.status})`,
      status: res.status,
      details: (json as any).data,
    };
  }
  if (json.error) return { error: json.error, status: res.status, details: (json as any).data };
  // 认证接口返回 { token, user }，其他接口返回 { data: ... }
  if (json.token) return { data: json as T };
  return { data: json.data ?? json };
}

export const api = {
  get<T = any>(path: string) {
    return apiFetch<T>(path);
  },
  post<T = any>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
  },
  patch<T = any>(path: string, body: unknown) {
    return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  put<T = any>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
  },
  delete<T = any>(path: string) {
    return apiFetch<T>(path, { method: 'DELETE' });
  },
};
