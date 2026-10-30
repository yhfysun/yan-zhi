// 扫描结果脱敏：密钥 / 令牌 / Cookie 一律只留少量字符。
//
// ★ 为什么放在输出层（jobToOutput）而不是各规则里：规则是新加的、以后还会加，
//   只要有一条忘了脱敏，密钥就会进运行卡、审计和对话。输出层是唯一必经之路。
// ★ 脱敏必须**确定**：同样的输入永远得到同样输出，便于人工复核与基线指纹稳定。
//   （指纹在 finding 生成时已算好，脱敏只改展示文本，不影响 fingerprint。）

const KEY_PREFIX = /\b(sk-[A-Za-z0-9]{4}|AKIA[0-9A-Z]{4}|AIza[0-9A-Za-z_-]{4}|ghp_[A-Za-z0-9]{4}|github_pat_[A-Za-z0-9_]{4}|xox[abprs]-[A-Za-z0-9-]{2})[A-Za-z0-9_-]{6,}\b/g;

/** 长串字面量：保留前 4 后 2，中间打码 */
function maskLiteral(s: string): string {
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

export function maskSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(KEY_PREFIX, (_m, head: string) => `${head}…`);
  // 引号里的长令牌（含 base64 / hex / 随机串）
  out = out.replace(/(['"])([A-Za-z0-9_\-+/=]{20,})\1/g, (_m, q: string, body: string) => `${q}${maskLiteral(body)}${q}`);
  // PEM 私钥块：只留头尾标记
  out = out.replace(/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, '$1…$2');
  // 常见键值对：token=xxxx / password: xxxx
  out = out.replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token)\b(\s*[=:]\s*)([^\s,;'"]{6,})/gi,
    (_m, k: string, sep: string, v: string) => `${k}${sep}${maskLiteral(v)}`);
  return out;
}

const SENSITIVE_KEY = /^(auth|adminauth|authorization|cookie|set-cookie|token|access[_-]?token|password|passwd|pwd|secret|api[_-]?key|apikey|session|credential|credentials)$/i;

/**
 * 工具参数的按键脱敏（审计 argsSummary 用）。
 *
 * ★ 为什么不能只靠 maskSecrets：那是**值模式**匹配，`{"auth":"Bearer abc"}` 这种
 *   带空格的值匹配不上；而鉴权矩阵的凭证恰恰就长这样。
 * ★ 只做浅层递归（depth ≤ 2）：参数是模型/前端给的一层 JSON，不需要也不该遍历任意深度。
 */
export function maskSensitiveArgs(args: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = v ? '***' : v;
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
      out[k] = maskSensitiveArgs(v as Record<string, unknown>, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}
