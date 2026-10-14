// Python 工具链失败分类 + 自愈钩子（2026-10-14）。
//
// ★ 动机：python 工具（novel_tuiwen 等）失败时，只会把原始 stderr 丢回用户/agent，修复全靠人。
//   这里把「常见**可自愈**失败」分类出来，交给 server 注入的 repairer 自动修（装缺失模块 /
//   升级 edge-tts / 补系统代理），成功后再把脚本**重跑一次** —— 让应用具备「出问题换法子修」的能力，
//   而不是把球踢回用户。
//
// core 是纯逻辑包（不能 import child_process），真正的 pip 执行在 server 侧（python-self-heal.ts），
// 通过 setPythonRepairer 注入 —— 与 setCustomToolDepPreparer 同款模式。

export type PythonFailureKind = 'missing-module' | 'pip-proxy' | 'edge-tts-403';

export interface PythonFailure {
  kind: PythonFailureKind;
  /** missing-module 时的模块名（如 edge_tts） */
  module?: string;
}

/**
 * 识别**可自愈**的 python 失败（纯函数，可单测）。识别不出返回 null（调用方按普通失败处理）。
 */
export function classifyPythonFailure(stderr: string): PythonFailure | null {
  if (!stderr) return null;
  // edge-tts 端点 403（版本过旧、令牌被轮换）—— 优先判：其 stderr 也可能含 pip/代理字样
  if (/edge[-_]tts/i.test(stderr) && /403|Handshake|Invalid response status/.test(stderr)) {
    return { kind: 'edge-tts-403' };
  }
  const miss = /No module named ['"]?([A-Za-z0-9_.]+)/.exec(stderr);
  if (miss) return { kind: 'missing-module', module: miss[1].split('.')[0] };
  // pip 走系统代理但代理值无 scheme → ProxyError: Cannot connect to proxy
  if (/Cannot connect to proxy|ProxyError/i.test(stderr)) return { kind: 'pip-proxy' };
  return null;
}

export interface PythonRepairRequest {
  failure: PythonFailure;
  scriptPath: string;
  cwd?: string;
  /** 首次失败时的原始 stderr（供 repairer 进一步判断） */
  stderr: string;
}

export interface PythonRepairResult {
  /** true = 已修复，调用方可重试脚本 */
  repaired: boolean;
  /** 人话说明（会进工具输出，让用户/agent 知道自动做了什么） */
  detail?: string;
}

export type PythonRepairer = (req: PythonRepairRequest) => Promise<PythonRepairResult>;

let repairer: PythonRepairer | null = null;

export function setPythonRepairer(fn: PythonRepairer | null): void {
  repairer = fn;
}

export function getPythonRepairer(): PythonRepairer | null {
  return repairer;
}