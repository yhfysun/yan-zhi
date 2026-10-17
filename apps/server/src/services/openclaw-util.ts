/**
 * OpenClaw 托管 —— 纯函数层（无 db / 无副作用，可被测试直接导入）。
 * 判据（记忆 #3）：同一语义只能有一处实现 —— 版本比较 / 登录输出解析 /
 * 配置合并只在这里，manager 与测试都从这里取。
 */

export const OPENCLAW_MIN_NODE = '24.16.0';

export type LoginPhase = 'idle' | 'waiting_scan' | 'verifying' | 'success' | 'error';

export interface LoginParseState {
  qrUrl: string;
  phase: LoginPhase;
  message: string;
  /** 内部：跨 chunk 的半个行缓冲（子进程写入会分片，标记行/URL 行都可能被切开） */
  _buf: string;
  /** 内部：已见「备用链接」标记但 URL 行尚未到达 */
  _awaitUrl: boolean;
}

export const INITIAL_LOGIN_STATE: LoginParseState = { qrUrl: '', phase: 'idle', message: '', _buf: '', _awaitUrl: false };

/** semver 数字段比较，返回 >0 / 0 / <0；非法段按 0 处理 */
export function compareNodeVersion(a: string, b: string): number {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * 从 `openclaw channels login` 的增量输出里提取二维码 URL 与阶段。
 * 标记全部来自 @tencent-weixin/openclaw-weixin 插件源码 login-qr.js 的真实
 * process.stdout.write（2026-10-17 逐字核对，勿凭记忆改）：
 *   - 二维码 URL：跟在「你可以访问以下链接以继续：」后的首个非空行（每次刷新重打，取最新）
 *   - 刷新：「⏳ 正在刷新二维码...(n/3)」/「🔄 二维码已更新，请重新扫描。」/「⏳ 二维码已过期，正在刷新...」
 *   - 验证中：「正在验证」
 *   - 失败：「⛔」行（多次输入错误等）
 *   - 成功：「✅」行（含「已连接过此 OpenClaw，无需重复连接。」）
 */
export function parseLoginOutput(prev: LoginParseState, chunk: string): LoginParseState {
  const st: LoginParseState = {
    qrUrl: prev.qrUrl,
    phase: prev.phase,
    message: prev.message,
    _buf: prev._buf || '',
    _awaitUrl: prev._awaitUrl || false,
  };
  const text = st._buf + chunk;
  // chunk 不以换行结尾时，最后一段可能是半行 → 留回缓冲，等下一个 chunk 拼完整再判
  const endsWithNewline = /\r?\n$/.test(text);
  const lines = text.split(/\r?\n/);
  const partial = endsWithNewline ? '' : (lines.pop() || '');
  for (const line of lines) processLoginLine(st, line);
  st._buf = partial;
  return st;
}

function processLoginLine(st: LoginParseState, line: string): void {
  const trimmed = line.trim();
  // 标记已见：下一个非空行就是二维码 URL（displayQRCode 紧跟提示行打印 URL 行）
  if (st._awaitUrl) {
    if (trimmed) {
      st.qrUrl = trimmed;
      st.phase = 'waiting_scan';
      st._awaitUrl = false;
    }
    return;
  }
  if (line.includes('你可以访问以下链接以继续')) {
    st._awaitUrl = true;
    return;
  }
  if (line.includes('正在验证')) {
    st.phase = 'verifying';
    st.message = line.trim();
    return;
  }
  if (line.includes('正在刷新二维码') || line.includes('二维码已更新') || line.includes('二维码已过期')) {
    if (st.phase !== 'verifying') st.phase = 'waiting_scan';
    st.message = line.trim();
    return;
  }
  if (line.includes('⛔')) {
    st.phase = 'error';
    st.message = line.replace(/⛔/g, '').trim();
    return;
  }
  if (line.includes('✅')) {
    st.phase = 'success';
    st.message = line.replace(/✅/g, '').trim();
    return;
  }
}

/** 合并 plugins.entries.<pluginId>，保留其余配置与其余键；返回新对象不改入参 */
export function mergePluginEntry(
  config: Record<string, any>,
  pluginId: string,
  entry: Record<string, any>,
): Record<string, any> {
  const out = JSON.parse(JSON.stringify(config ?? {}));
  out.plugins = out.plugins || {};
  out.plugins.entries = out.plugins.entries || {};
  const prev = out.plugins.entries[pluginId] || {};
  out.plugins.entries[pluginId] = {
    ...prev,
    ...entry,
    config: { ...(prev.config || {}), ...(entry.config || {}) },
  };
  return out;
}
