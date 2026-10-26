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
