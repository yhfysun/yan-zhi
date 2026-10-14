// Python 工具链自愈（server 侧实现，2026-10-14）。
//
// ★ 动机（用户原话）："应用缺少你这个出问题了不断通过别的方式修复的功能，比如代理啊这些"。
//   常见 python 工具失败可以**自动修**：缺依赖 → 装上；edge-tts 端点 403（令牌轮换）→ 升级；
//   而本机 pip 走系统代理常报 `ProxyError: Cannot connect to proxy`（代理值缺 scheme）→
//   自动探测代理并在**第二次尝试**带上 `--proxy` 重试。修好后 core 会重跑脚本一次。
//
// core 不能 import child_process，故 pip 执行都放这里，经 setPythonRepairer 注入给 core。
import { execFile, execSync } from 'node:child_process';
import { findPython, setPythonRepairer, type PythonFailure, type PythonRepairRequest, type PythonRepairResult } from '@yan-zhi/core';

/** 给代理值补 scheme（本机注册表里是 `127.0.0.1:7890`，缺 scheme 正是 pip 报 ProxyError 的根因）。 */
export function withProxyScheme(p: string): string {
  const v = p.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`;
}

/**
 * 探测可用 HTTP 代理：env 优先，其次 Windows WinINET 注册表（ProxyEnable=1 时的 ProxyServer）。
 * 返回**带 scheme** 的 URL 或 null。
 */
export function detectHttpProxy(): string | null {
  const env = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (env && env.trim()) return withProxyScheme(env);
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"',
        { encoding: 'utf8', windowsHide: true, timeout: 5000 },
      );
      const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/.test(out);
      const srv = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(out);
      if (enabled && srv && srv[1]) return withProxyScheme(srv[1]);
    } catch { /* 读不到就当作无代理 */ }
  }
  return null;
}

/** 纯函数：由失败类型决定要跑的 pip 动作（便于单测）。不支持的类型返回 null。 */
export function planRepair(failure: PythonFailure): { pipArgs: string[]; note: string } | null {
  if (failure.kind === 'missing-module' && failure.module) {
    return { pipArgs: ['install', failure.module], note: `安装缺失依赖 ${failure.module}` };
  }
  if (failure.kind === 'edge-tts-403') {
    return { pipArgs: ['install', '--upgrade', 'edge-tts'], note: '升级 edge-tts（微软端点令牌已轮换）' };
  }
  return null;
}

function runPip(pipArgs: string[], extra: string[] = [], timeoutMs = 180000): Promise<{ exitCode: number; out: string }> {
  return findPython().then(
    (py) =>
      new Promise<{ exitCode: number; out: string }>((resolve) => {
        execFile(
          py,
          ['-m', 'pip', ...pipArgs, ...extra],
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout, stderr) => {
            const code = err ? (typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : 1) : 0;
            resolve({ exitCode: code, out: `${stdout || ''}${stderr || ''}` });
          },
        );
      }),
  );
}

/**
 * 执行一次 pip（自动代理回退）：
 *   ① 先按原样跑；② 若失败且疑似代理问题 → 探测代理并带 `--proxy` 重跑一次。
 */
async function pipInstallWithProxyFallback(pipArgs: string[]): Promise<{ ok: boolean; log: string }> {
  let r = await runPip(pipArgs);
  if (r.exitCode === 0) return { ok: true, log: `pip ${pipArgs.join(' ')} 成功` };
  if (/Cannot connect to proxy|ProxyError|proxy/i.test(r.out)) {
    const proxy = detectHttpProxy();
    if (proxy) {
      const r2 = await runPip(pipArgs, ['--proxy', proxy]);
      return r2.exitCode === 0
        ? { ok: true, log: `pip ${pipArgs.join(' ')} 首次因代理失败，改用 --proxy ${proxy} 成功` }
        : { ok: false, log: `pip ${pipArgs.join(' ')} 带代理 ${proxy} 仍失败（exit ${r2.exitCode}）` };
    }
    return { ok: false, log: `pip ${pipArgs.join(' ')} 因代理失败，且未探测到可用代理` };
  }
  return { ok: false, log: `pip ${pipArgs.join(' ')} 失败（exit ${r.exitCode}）` };
}

/** repairer 主入口：把失败分类映射成 pip 动作并执行。 */
export async function repairPythonFailure(req: PythonRepairRequest): Promise<PythonRepairResult> {
  const plan = planRepair(req.failure);
  if (!plan) return { repaired: false, detail: `未支持的失败类型：${req.failure.kind}` };
  const { ok, log } = await pipInstallWithProxyFallback(plan.pipArgs);
  return { repaired: ok, detail: ok ? `${plan.note}（${log}）` : `${plan.note} 未成功（${log}）` };
}

/** 启动时注入 python 自愈能力（与 setCustomToolDepPreparer 同款注入模式）。 */
export function registerPythonSelfHeal(): void {
  setPythonRepairer(repairPythonFailure);
}