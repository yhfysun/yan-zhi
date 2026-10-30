/**
 * 远控扫码载荷解析（纯函数，供单测）。
 *
 * 被控端二维码内容是 `http://ip:port/remote?code=授权码`（hash 路由引导后 query 保留）；
 * 也容忍把 code 编在 hash 里（`#/remote?code=`）或直接扫到一串纯授权码文本。
 */
export interface RcScanTarget {
  /** 被控端 origin（URL 形态载荷才有） */
  host?: string;
  /** 授权码 */
  code?: string;
}

export function parseRcScanPayload(text: string): RcScanTarget {
  const t = String(text || '').trim();
  if (!t) return {};
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) return { code: t };
    const fromQuery = u.searchParams.get('code') || '';
    const fromHash = (/[?&]code=([^&]*)/.exec(u.hash || '') || [])[1] || '';
    const raw = fromQuery || fromHash;
    const code = (raw ? decodeURIComponent(raw) : '').trim();
    return { host: u.origin, ...(code ? { code } : {}) };
  } catch {
    // 不是 URL：整串当授权码（防手滑只截了码）
    return { code: t.replace(/\s+/g, '') };
  }
}

/** 裸主机：带点（192.168.1.100 / host.local）或带端口（nas:3001）。
 *  纯授权码形如 `hc9c-hfba` 两点都不占，因此不会被误当成地址。 */
const BARE_HOST = /^(?:[\w-]+(?:\.[\w-]+)+(?::\d+)?|[\w-]+:\d+)(?:\/|$)/;

/**
 * 「被控端地址」输入框规范化（粘贴邀请链接的入口）。
 *
 * 用户常把整条邀请链接 `http://ip:port/remote?code=授权码` 直接粘进地址框：
 * 解析成 origin + 授权码，避免再手填授权码；裸 ip[:port] 补 http://（fetch 要绝对 URL）。
 * 认不出来（纯授权码等）返回空对象，调用方保持输入框原样。
 */
export function normalizeHostInput(text: string): RcScanTarget {
  const t = String(text || '').trim();
  if (!t) return {};
  const parsed = parseRcScanPayload(t);
  if (parsed.host) return parsed;
  if (BARE_HOST.test(t)) return { host: `http://${t.replace(/\/+$/, '')}` };
  return {};
}
