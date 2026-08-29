// API 客户端 —— 自动附带 JWT Token
// Electron file:// 协议下 /api 会失效，需用 http://127.0.0.1:3001/api
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
export const API_BASE = isElectron ? 'http://127.0.0.1:3001/api' : '/api';
const BASE_URL = API_BASE;

function getToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
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
