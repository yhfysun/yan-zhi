// Windows 命令行参数转义（2026-10-24）。
//
// ★ 为什么需要（实测踩坑）：`spawn(cmd, args, { shell: true })` 在 Windows 上**只把 args
//   用空格拼起来，不做任何转义**（Node 24 起还有 DEP0190 警告）。于是路径里带空格时，
//   cmd 会把它拆成多个参数 —— 后台作业启动器实测：
//     spawn('python', [runner, '--job-dir', 'C:\\...\\Temp\\yz job test', ...], {shell:true})
//   → 启动器收到 `--job-dir C:\...\Temp\yz` + 未知参数 `job` / `test`，直接 exit 2。
//   工作目录在「小说 推文」这类带空格的路径下，所有 python/ffmpeg 长任务都会这样挂掉。
//
// 口径：按 cmd.exe / CRT 规则补双引号（含空白与 shell 特殊字符才加）；
//   内部的 `"` 转义成 `\"`，且成对的结尾反斜杠要加倍（否则会把收尾引号吃掉）。

/** 含空白或 cmd 元字符才需要引号 */
const NEEDS_QUOTE = /[\s"&|<>^(),;=]/;

export function quoteCmdArg(a: string): string {
  if (a === '') return '""';
  if (!NEEDS_QUOTE.test(a)) return a;
  const escaped = a
    .replace(/(\\*)"/g, '$1$1\\"') // 引号前的反斜杠成对 + 转义引号
    .replace(/(\\+)$/, '$1$1');    // 结尾反斜杠加倍（否则会转义收尾引号）
  return `"${escaped}"`;
}

/** 批量转义（仅 Windows 的 shell:true 通道需要；POSIX 直接透传） */
export function quoteArgsForWindowsShell(args: string[]): string[] {
  return args.map(quoteCmdArg);
}
