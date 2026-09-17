// API 客户端 —— 自动附带 JWT Token
// Electron file:// 协议下 /api 会失效，需用 http://127.0.0.1:3001/api
import { getLicenseCodeSync } from './license-code';

export const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
export const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform;
// 移动端支持用户配置远程后端地址（方案 A：连远程节点）；未配置时走内嵌本地后端（方案 B）
const mobileRemoteBase = typeof window !== 'undefined' ? (localStorage.getItem('mobile_api_base') || '') : '';
export const API_BASE = isElectron
  ? 'http://127.0.0.1:3001/api'
  : isCapacitor
    ? (mobileRemoteBase ? mobileRemoteBase.replace(/\/$/, '') + '/api' : 'http://127.0.0.1:3001/api')
    : '/api';
const BASE_URL = API_BASE;

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

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T } | { error: string }> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string> | undefined) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const licenseCode = getLicenseCode();
  if (licenseCode) headers['x-license'] = licenseCode;

  const res = await fetch(BASE_URL + path, { ...options, headers });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    // 本地模式已屏蔽鉴权，401 不再清 token 跳登录
    return { error: (json as any).error || `请求失败 (${res.status})` };
  }
  if (json.error) return { error: json.error };
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
