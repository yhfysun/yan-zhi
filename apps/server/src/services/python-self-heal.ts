// Python 工具链自愈（server 侧实现，2026-10-14）。
//
// ★ 动机（用户原话）："应用缺少你这个出问题了不断通过别的方式修复的功能，比如代理啊这些"。
//   常见 python 工具失败可以**自动修**：缺依赖 → 装上；edge-tts 端点 403（令牌轮换）→ 升级；
//   而本机 pip 走系统代理常报 `ProxyError: Cannot connect to proxy`（代理值缺 scheme）→
//   自动探测代理并在**第二次尝试**带上 `--proxy` 重试。修好后 core 会重跑脚本一次。
//
// core 不能 import child_process，故 pip 执行都放这里，经 setPythonRepairer 注入给 core。
import { exec, execSync } from 'node:child_process';
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
    // ★ 模块名 ≠ pip 包名（2026-10-17 实报：anim_compose 缺 PIL，`pip install PIL` 装到的是
    //   一个 2010 年的占位假包，照样 ModuleNotFoundError）。常见别名在此收敛，新坑随手补。
    const aliases: Record<string, string> = {
      PIL: 'pillow',
      cv2: 'opencv-python',
      yaml: 'pyyaml',
      bs4: 'beautifulsoup4',
      sklearn: 'scikit-learn',
     Crypto: 'pycryptodome',
    };
    const pkg = aliases[failure.module] || failure.module;
    return { pipArgs: ['install', pkg], note: `安装缺失依赖 ${pkg}（模块 ${failure.module}）` };
  }
  if (failure.kind === 'edge-tts-403') {
    return { pipArgs: ['install', '--upgrade', 'edge-tts'], note: '升级 edge-tts（微软端点令牌已轮换）' };
  }
  return null;
}

/**
 * pip 子进程 env：**强制绕过系统代理**（直连尝试）。
 *
 * ★ 为什么必须（2026-10-17 实报）：Windows 上 pip 经 urllib.getproxies() **读注册表代理**
 *   （ProxyServer=127.0.0.1:7890 而 Clash 没在跑）→ 即使 shell env 干净，pip 也会去连一个
 *   死代理并报 ProxyError —— "直连"从来就没直连过。requests 系尊重 NO_PROXY，注入
 *   `NO_PROXY=*` + 清空 HTTP(S)_PROXY 即可真直连；真需要代理的场景走下面 --proxy 回退。
 */
function directEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v;
  env.NO_PROXY = '*';
  env.no_proxy = '*';
  delete env.HTTP_PROXY;
  delete env.http_proxy;
  delete env.HTTPS_PROXY;
  delete env.https_proxy;
  return env;
}

function runPip(pipArgs: string[], extra: string[] = [], timeoutMs = 180000): Promise<{ exitCode: number; out: string }> {
  return findPython().then(
    (py) =>
      new Promise<{ exitCode: number; out: string }>((resolve) => {
        // ★ 必须 shell 执行（2026-10-17）：PATH 命中的 `python` 可能是 **shim**（pyenv-win 的
        //   python.bat / WindowsApps 占位 exe）。execFile 不走 PATHEXT → 命中商店占位 alias，
        //   exit 9009"命令未识别"（这正是代言官任务里自愈装包失败的最后一环）；cmd（shell:true）
        //   才与工具执行通道（adapter shell.exec）同一解析口径。pipArgs 是内部常量，无注入面。
        exec(
          `"${py}" -m pip ${[...pipArgs, ...extra].join(' ')}`,
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: directEnv() },
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