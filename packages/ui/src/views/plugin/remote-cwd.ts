/**
 * 远端 shell 的「当前目录」解析（2026-10-21 用户实报「服务器当前路径没有显示啊，也没有切换的地方」）。
 *
 * ★ 为什么必须从提示符里取：
 *   `client.shell()` 开的是一个交互式 PTY，用户 `cd` 之后**服务端无从得知** ——
 *   SFTP 的路径、连接配置里的目录都和 shell 的 cwd 是两回事。唯一可靠来源是
 *   shell 自己打出来的提示符（PS1）。
 *
 * ★ 为什么不做成"发一条 `pwd`"：
 *   每次都能拿到绝对路径，但会在终端里留下一条用户没敲过的命令和一行输出，
 *   还会与用户正在输入的内容打架（打断正在编辑的命令行）。提示符解析是零侵入的。
 *
 * 覆盖的常见形态（已按实际发行版默认配置排优先级）：
 *   `[root@host ~]#`            → ~（家目录）
 *   `app@web-01:/opt/app$`      → /opt/app        （Debian/Ubuntu 默认）
 *   `[app@web-01 opt]$`         → 相对目录 opt，需结合上一次已知路径拼接
 *   `bash-5.1$`                 → 无路径信息（返回 null，保持上一次的值）
 *   `app@web-01:/opt/app# mysql` → 尾随命令不影响解析
 */

/** 家目录/根目录的显式缩写：提示符里 `~` 表示家目录 */
export interface PromptCwd {
  /** 提示符里出现的路径文本（未展开 `~`） */
  raw: string;
  /** 是否为绝对路径（以 / 开头或 ~ 开头）；相对路径需要调用方拼接 */
  absolute: boolean;
}

/**
 * 从一段终端输出里取**最后一行**提示符的路径。
 *
 * 只看最后一行：历史输出里的提示符不代表当前状态。
 * 返回 null = 这行不是可识别的提示符（例如纯输出行、`bash-5.1$` 这类无路径的 PS1）。
 */
export function parsePromptCwd(text: string): PromptCwd | null {
  if (!text) return null;
  // 去掉 ANSI 转义（颜色码会把提示符切碎），再去掉行尾空白
  const clean = stripAnsi(text).replace(/[\r]+/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  return parsePromptLine(lines[lines.length - 1]);
}

/** 单行提示符解析（导出便于单测逐形态验证） */
export function parsePromptLine(line: string): PromptCwd | null {
  const s = (line || '').trim();
  if (!s) return null;

  // 形态 A：user@host:path$ / user@host:path#  （Debian/Ubuntu 默认）
  //   路径里可能有空格（/opt/my app），因此取到行尾的最后一段（$/#/»）之前
  const at = s.lastIndexOf('@');
  if (at >= 0) {
    const rest = s.slice(at + 1);
    const colon = rest.indexOf(':');
    if (colon >= 0) {
      const after = rest.slice(colon + 1);
      // 去掉尾随的提示符符号与用户已输入的命令：
      //   提示符符号（$ # > » %）之后的内容是用户正在敲/已敲的命令，不属于路径
      const m = after.match(/^(.*?)(?:\s*[$#>»%](?:\s|$))/);
      const path = (m ? m[1] : after).trim();
      if (path) return { raw: path, absolute: path.startsWith('/') || path.startsWith('~') };
    }
  }

  // 形态 B：[user@host dir]#  /  [user@host ~]$  （CentOS/RHEL 默认，路径是相对家目录的）
  const bracket = s.match(/^\[[^\]]*?@[^\]]*?\s+([^\]]+)\]\s*[$#>]/);
  if (bracket) {
    const path = bracket[1].trim();
    if (path) {
      // `~` 或 `~/x` 绝对；其余（如 `opt`、`/opt`）按原文，`/` 开头算绝对
      return { raw: path, absolute: path.startsWith('/') || path.startsWith('~') };
    }
  }

  // 形态 C：只给路径的提示符（PS1='\w$ ' / '\W$ '）
  const plain = s.match(/^([/~][^\s$#>»%]*|\S+)\s*[$#>»%]\s*$/);
  if (plain) {
    const path = plain[1].trim();
    if (path && (path.includes('/') || path === '~')) {
      return { raw: path, absolute: path.startsWith('/') || path.startsWith('~') };
    }
  }
  return null;
}

/** ANSI 序列剥离（与视图层同一套规则；放这里是为了纯函数可单测） */
export function stripAnsi(s: string): string {
  return (s || '')
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '');
}

/**
 * 把解析结果落到"当前目录"：
 *   - 绝对路径 → 直接采用；
 *   - `~` 开头但不知道家目录 → 原样显示（用户看得懂，且不编造）；
 *   - 相对路径（CentOS 的 `opt`）→ 拼到上一次已知的绝对路径上；
 *   - 无路径信息 → 保持上一次的值（返回 undefined 表示"不变"）。
 */
export function applyPromptCwd(prev: string, next: PromptCwd | null): string | undefined {
  if (!next) return undefined;
  const raw = next.raw.replace(/\/+$/, '') || '/';
  if (next.absolute) return raw === '' ? '/' : raw;
  if (!prev) return raw; // 没有基准，原样显示相对目录（不编造 /home/xxx）
  const base = prev.replace(/\/+$/, '');
  return `${base}/${raw}`.replace(/\/+/g, '/');
}

/**
 * 从"要执行的命令"推断 cd 后的目标目录（用于命令执行后即时更新显示，不等下一行提示符）。
 * 只在命令**就是** cd（可带 && 链）时推断，别的情况一律返回 null（交给提示符解析）。
 */
export function cwdFromCdCommand(command: string, prev: string): string | null {
  const cmd = (command || '').trim();
  if (!cmd) return null;
  // 只认 `cd xxx`（允许 cd 之后接 && 链，取第一段）
  const first = cmd.split('&&')[0].trim();
  const m = first.match(/^cd(?:\s+(.*))?$/);
  if (!m) return null;
  let target = (m[1] || '').trim().replace(/^['"]|['"]$/g, '');
  if (!target || target === '~') return '~';
  if (target.startsWith('/')) return target.replace(/\/+$/, '') || '/';
  const base = (prev || '~').replace(/\/+$/, '');
  // `cd ..` 独立处理（避免出现 /a/b/.. 这种看着别扭的路径）
  if (target === '..') {
    const parts = base.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }
  return `${base}/${target}`.replace(/\/+/g, '/');
}
