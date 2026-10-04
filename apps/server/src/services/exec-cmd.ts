// execFile 统一出口（P6 遗留收口，2026-10-04）。
//
// ★ 背景：此前 server 内有 9+ 份手写 execFile 包装，返回形状各异
//   （{ok,out} / {ok,stderr} / {code,out,err} / {stdout,stderr,code} / Promise<void>），
//   语义大同小异（timeout + windowsHide + maxBuffer + 永不 reject），只差返回映射。
//   本模块提供**唯一底层实现** runCmd（永不 reject，完整带回 stdout/stderr/code/
//   超时标记），各调用方的差异只保留为**薄适配**（一两行映射），不再各自 new Promise。
//
// ★ 设计约束：
// - 零重依赖（不 import db 等），可被 ffmpeg-runtime 这类"纯路径解析器"安全引用；
// - 永不 reject：进程级错误（spawn 失败/超时）落在 result.error / result.ok 上；
// - 超时用 execFile 内置 timeout（到点 SIGTERM），timedOut=true 供上层还原
//   「超时→code:-1 + [超时] 标注」这类既有语义（cicd-pipeline）。

export interface RunCmdOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** 毫秒；到点 SIGTERM 杀进程 → timedOut=true。不传 = 不限时 */
  timeoutMs?: number;
  maxBuffer?: number;
  shell?: boolean;
  windowsVerbatimArguments?: boolean;
}

export interface RunCmdResult {
  /** 退出码 === 0 且无进程级错误 */
  ok: boolean;
  /** 退出码；spawn 失败（如 ENOENT）时为 null */
  code: number | null;
  stdout: string;
  stderr: string;
  /** 进程级错误消息（spawn 失败 / 超时被杀），正常退出时为空串 */
  error: string;
  /** 是否因 timeout 被杀 */
  timedOut: boolean;
}

/** execFile 唯一出口：永不 reject，行为与此前各手写包装一致（windowsHide 默认开）。 */
export function runCmd(
  file: string,
  args: string[],
  opts: RunCmdOptions = {},
): Promise<RunCmdResult> {
  return new Promise((resolve) => {
    // 延迟 require：让纯路径解析类模块（ffmpeg-runtime 等）在不起子进程的场景零开销
    void import('node:child_process').then(({ execFile }) => {
      execFile(
        file,
        args,
        {
          cwd: opts.cwd,
          env: opts.env,
          timeout: opts.timeoutMs,
          maxBuffer: opts.maxBuffer ?? 4 * 1024 * 1024,
          shell: opts.shell,
          windowsHide: true,
          windowsVerbatimArguments: opts.windowsVerbatimArguments,
        },
        (err, stdout, stderr) => {
          const out = String(stdout || '');
          const errOut = String(stderr || '');
          if (!err) {
            resolve({ ok: true, code: 0, stdout: out, stderr: errOut, error: '', timedOut: false });
            return;
          }
          const code = typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code)
            : null;
          resolve({
            ok: false,
            code,
            stdout: out,
            stderr: errOut,
            error: err.message || String(err),
            timedOut: err.killed === true,
          });
        },
      );
    });
  });
}

const WHERE_CMD = process.platform === 'win32' ? 'where' : 'which';

/**
 * 在 PATH 上查命令（where / which），返回第一个真实存在的绝对路径，查不到返回 null。
 * 此前在 ffmpeg-runtime / ytdlp-runtime 各有一份逐字复刻 + runtime-installer 一份变体，现收口。
 */
export async function lookupOnPath(file: string): Promise<string | null> {
  const r = await runCmd(WHERE_CMD, [file], { timeoutMs: 5000, maxBuffer: 1024 * 1024 });
  if (!r.ok) return null;
  const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  // 延迟 import 保持本模块零静态重依赖
  const { existsSync } = await import('node:fs');
  return first && existsSync(first) ? first : null;
}
