export interface RcLocalCapabilityInfo {
  ok?: boolean;
  baseUrl?: string;
  hostKey?: string;
  port?: number;
  code?: string;
  mode?: string;
  addresses?: Array<{ name: string; address: string; family?: string }>;
}

export interface RcHostEndpoint {
  apiBase: string;
  hostKey: string;
  isLocal: boolean;
}

/** 被控端信令 endpoint：轻量壳本机服务存在时，绝不跟随远程后端 API_BASE。 */
export function resolveRcHostEndpoint(
  fallbackApiBase: string,
  local?: RcLocalCapabilityInfo | null,
): RcHostEndpoint {
  const raw = String(local?.baseUrl || '').trim().replace(/\/+$/, '');
  if (local?.ok && /^https?:\/\//i.test(raw)) {
    return {
      apiBase: `${raw}/api`,
      hostKey: String(local.hostKey || ''),
      isLocal: true,
    };
  }
  return {
    apiBase: String(fallbackApiBase || '').replace(/\/+$/, ''),
    hostKey: '',
    isLocal: false,
  };
}

/** 用与 API 相同的 origin 派生 WebSocket 地址。 */
export function rcHostWsUrl(apiBase: string, path: string): string {
  const raw = String(apiBase || '').trim();
  const absolute = /^https?:\/\//i.test(raw)
    ? raw
    : `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
  const url = new URL(absolute);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const prefix = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${prefix}${path.startsWith('/') ? path : `/${path}`}`;
}
