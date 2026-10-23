/**
 * 平台 API 通用 HTTP（2026-10-22）：超时、错误分步、JSON 解析。
 * ★ 失败必须能区分网络 / 鉴权 / 限流 / 接口错误，界面与工具才能如实回报。
 */
import type { PlatformProbeStep } from './types.js';

export interface JsonResponse {
  ok: boolean;
  status: number;
  json?: Record<string, unknown>;
  text?: string;
  error?: string;
  step?: PlatformProbeStep;
}

export async function fetchJson(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    /** 某些写接口成功时可能返回空 body；默认不接受空响应，避免把网关错误页当成功 */
    allowEmpty?: boolean;
  } = {},
): Promise<JsonResponse> {
  const timeoutMs = init.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      signal: controller.signal,
      // ★ 不跟随重定向：平台域名被劫持/网关跳登录页时，不能把凭据带到另一个地址
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
      ...(init.body !== undefined
        ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }
        : {}),
    });
    const text = await res.text();
    let json: Record<string, unknown> | undefined;
    try { json = text ? JSON.parse(text) as Record<string, unknown> : undefined; } catch { /* 非 JSON */ }
    if (res.ok) {
      // ★ 2xx 但空 body / HTML（登录页、WAF、代理错误页）不是成功：
      //   之前这里直接 ok:true，各客户端再把 undefined 当 {}，自检会谎报“已连接”。
      if (!text.trim()) {
        if (init.allowEmpty) return { ok: true, status: res.status, text };
        return { ok: false, status: res.status, text, step: 'api', error: '平台返回空响应（可能被网关或登录页拦截），无法确认执行结果' };
      }
      if (!json) {
        return { ok: false, status: res.status, text, step: 'api', error: '平台返回非 JSON 响应（可能被网关或登录页拦截）' };
      }
      return { ok: true, status: res.status, json, text };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, json, text, step: 'auth', error: `鉴权失败（HTTP ${res.status}）：凭据无效或缺少接口权限` };
    }
    if (res.status === 429) {
      return { ok: false, status: res.status, json, text, step: 'rate', error: '触发平台限流（HTTP 429），稍后重试或降低频率' };
    }
    return { ok: false, status: res.status, json, text, step: 'api', error: `平台返回 HTTP ${res.status}：${text.slice(0, 300) || '未知错误'}` };
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? `请求超时（${timeoutMs / 1000}s）` : (e as Error).message;
    return { ok: false, status: 0, step: 'network', error: `网络不可达：${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/** 从常见的错误字段里捞出可读信息（各平台错误结构不同） */
export function errorDetail(json: Record<string, unknown> | undefined, fallback = '未知错误'): string {
  if (!json) return fallback;
  const candidates = ['error_response', 'error_msg', 'errorMessage', 'message', 'msg', 'error_description', 'error', 'sub_msg', 'code'];
  for (const k of candidates) {
    const v = json[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>;
      const s = nested.msg ?? nested.message ?? nested.sub_msg ?? nested.code;
      if (typeof s === 'string' && s.trim()) return s;
    }
  }
  return fallback;
}
