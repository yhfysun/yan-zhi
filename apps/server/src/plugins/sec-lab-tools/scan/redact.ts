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
