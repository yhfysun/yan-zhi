// ops-shell 护栏（纯函数，可独立测试）
// 危险命令黑名单 / 生产连接确认策略 / 输出截断 —— 对齐 computer-use 的护栏标准。

/** 危险命令正则黑名单：命中即拒绝执行（不区分大小写，容忍路径与引号变体） */
export const DANGEROUS_PATTERNS: RegExp[] = [
  // rm 递归+强制（rf/fr 同旗标，或分离旗标 -r ... -f / -f ... -r）
  /\brm\s+(?:-\S+\s+)*-\w*r\w*f\w*\b/i,
  /\brm\s+(?:-\S+\s+)*-\w*f\w*r\w*\b/i,
  /\brm\s+-\w*r\w*\s+(?:-\S+\s+)*-\w*f/i,
  /\brm\s+-\w*f\w*\s+(?:-\S+\s+)*-\w*r/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+[^|]*\bof=/i,
  /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b|\binit\s+[06]\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/, // fork bomb（':' 非单词字符，不能用 \b 起头）
  /\bchmod\s+-R?\s*777\s+\/(\s|$)/i,
  /\bchown\s+-R\s+\S+\s+\/(\s|$)/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bcrontab\b[^&]*\brm\b/i,
  /\bwipefs\b/i,
  /\biptables\s+-F\b/i,
  /\bufw\s+disable\b/i,
  /\bkill(all)?\s+-?\d?\s*-?\s*1\b|\bkillall\b/i,
  /\bsystemctl\s+(stop|disable|mask)\s+(sshd|network|firewall)/i,
];

/** 只读命令白名单：生产连接上这些命令无需 confirmed（前缀匹配，按首个 token 判定） */
export const READONLY_PREFIXES = [
  'ls', 'pwd', 'cat', 'head', 'tail', 'grep', 'find', 'ps', 'top', 'df', 'du', 'free',
  'uptime', 'whoami', 'hostname', 'uname', 'date', 'which', 'echo', 'wc', 'stat', 'id',
  'systemctl status', 'systemctl list', 'journalctl', 'docker ps', 'docker images',
  'docker inspect', 'docker logs', 'docker stats', 'docker version', 'docker top', 'docker port',
];

/** 判断命令是否命中危险黑名单 */
export function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
}

/** 判断命令是否只读（生产连接免确认放行依据） */
export function isReadonly(command: string): boolean {
  const c = command.trim().toLowerCase().replace(/\s+/g, ' ');
  return READONLY_PREFIXES.some((p) => c === p || c.startsWith(p + ' ') || c.startsWith(p + '|') || c.startsWith(p + ';') || c.startsWith(p + '&&'));
}

/** 生产连接的写操作必须显式 confirmed=true */
export function checkConfirm(command: string, isProduction: boolean, confirmed: boolean): string | null {
  if (!isProduction || confirmed) return null;
  if (isReadonly(command)) return null;
  return `目标连接标记为生产环境，命令「${command.slice(0, 80)}」非常读操作。请确认后带 confirmed=true 重新调用（或在运维控制台命令模式下手动执行）`;
}

/** 护栏总检查：返回错误消息或 null（放行） */
export function guard(command: string, opts: { isProduction: boolean; confirmed: boolean }): string | null {
  if (!command || !command.trim()) return '命令不能为空';
  if (isDangerous(command)) return `命令命中危险黑名单，已拒绝执行：${command.slice(0, 120)}`;
  return checkConfirm(command, opts.isProduction, opts.confirmed);
}

/** 输出截断：超长 stdout/stderr 掐头留尾，标注截断标记 */
export const MAX_OUTPUT = 16 * 1024;
export function capOutput(text: string, max = MAX_OUTPUT): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const half = Math.floor(max / 2);
  return {
    text: `${text.slice(0, half)}\n\n...[输出过长，已截断 ${text.length - max} 字符]...\n\n${text.slice(-half)}`,
    truncated: true,
  };
}

/** 连接是否标记为生产环境（tag 含"生产"/"prod"/"production"） */
export function isProductionTag(tag?: string): boolean {
  if (!tag) return false;
  const t = tag.toLowerCase();
  return t.includes('生产') || t.includes('prod');
}
