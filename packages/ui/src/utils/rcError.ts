/**
 * 远控连接错误分类（纯函数，供单测）。
 *
 * 目的：`fetch` 失败时浏览器只给 `TypeError: Failed to fetch` 这类英文，
 * 用户分不清是「地址写错 / 没开机 / 超时 / 被控端拒绝」，这里按原因分类成中文。
 */
export type RcErrorKind = 'timeout' | 'unreachable' | 'bad-response' | 'server';

export interface RcConnectError {
  kind: RcErrorKind;
  message: string;
}

export function describeConnectError(
  err: unknown,
  opts: { host: string; timeoutMs: number },
): RcConnectError {
  const host = String(opts.host || '').trim() || '被控端';
  const secs = Math.max(1, Math.round(opts.timeoutMs / 1000));
  const e = err as { name?: string; message?: string } | null | undefined;
  const name = String(e?.name || '');
  const raw = String(e?.message || '').trim();

  if (name === 'TimeoutError' || name === 'AbortError') {
    return {
      kind: 'timeout',
      message: `连接超时：${host} 在 ${secs} 秒内没有响应（检查 IP/端口、防火墙，或被控端是否开着言智）`,
    };
  }
  if (name === 'SyntaxError') {
    return {
      kind: 'bad-response',
      message: `被控端返回异常：${host} 的响应不像言智远控服务（确认地址指向被控端，而不是别的网站）`,
    };
  }
  if (name === 'TypeError' || /failed to fetch|networkerror|load failed|network error/i.test(raw)) {
    return {
      kind: 'unreachable',
      message: `连接不上被控端（${host}）：IP 或端口不通、被控端没开言智，或两台设备不在同一网络`,
    };
  }
  return { kind: 'server', message: `配对失败：${raw || '未知错误'}` };
}
