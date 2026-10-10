// 本机内嵌后端地址解析 —— 「一个实例监听哪个端口」的唯一判据，三端共用。
//
// ★★★ 为什么必须有这个模块（2026-09-27 用户报障：
//   「我都安装好了这个软件了，但是你在修改代码的时候这个软件还会变化？」）：
//   安装包本体是静态的（app.asar 自带 dist），源码改不动它。真因是**两个实例共用运行期资源**：
//   开发编排器把「正在运行的正式版」列入可杀名单并强杀、再用自己的后端占用同一个 3001，
//   于是安装版窗口前端虽旧，所有 /api 请求却打到了开发版后端。
//
// ★★★ 2026-10-10 口径变更（用户诉求：「我直接 dev 启动就能测试」）：
//   原本的解法是「两个实例各占一个端口」（生产 3001 / 开发 3002），代价是两套库、数据互不可见。
//   用户实测后要求**共用同一套数据** → 现在**开发与生产同为 3001**，且共用同一 userData：
//   · dev 启动即可直接对着真实 data.db 测试；
//   · 两实例**不能同时运行**（会抢端口与单实例锁），启动 dev 前请退出安装版；
//   · 真需要临时并存时，用环境变量 `YANZHI_API_PORT=3xxx` 覆盖（dev 编排器会下发）。
//
// 仍然守住的老约束：**前端不得把端口写死** —— 一律经
//   ① `window.electronAPI.apiPort`（主进程 additionalArguments 下发，权威）
//   ② 环境变量 `YANZHI_API_PORT`（Node 侧 / 预渲染场景）
//   ③ 3001（兜底：Web 端同源、移动端内嵌单实例、纯 Node 脚本）
//
// ⚠️ 本模块只做「地址推导」，不发起请求；也不 import 任何 Electron/DOM 专有 API
//   （typeof 守卫），以便服务端与测试环境同样能 import。

/** 生产默认端口（与 apps/server/src/index.ts 的 PORT 默认值一致） */
export const DEFAULT_API_PORT = 3001;
/** 开发实例默认端口 —— 2026-10-10 起与生产**相同**（共用一套库；临时并存用 YANZHI_API_PORT 覆盖） */
export const DEV_API_PORT = DEFAULT_API_PORT;

function normalizePort(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

/**
 * 解析本端应请求的 API 端口。
 *
 * 非法值一律**回落默认**而非透传 —— 写错端口不能变成"请求随机端口"这种更难查的故障
 * （与后端 YZ_INSTALL_SILENT_MAX_MB、desktop instance.cjs 的处理口径一致）。
 */
export function resolveLocalApiPort(win?: any): number {
  const w = win ?? (typeof window !== 'undefined' ? (window as any) : undefined);
  const fromBridge = normalizePort(w?.electronAPI?.apiPort);
  if (fromBridge) return fromBridge;
  // Node 侧（无 window）读 env。shared 是跨端包（不引 @types/node，浏览器也可能 polyfill process）
  // → 走 globalThis 取值，不用全局 process 标识符。
  const env = (globalThis as any)?.process?.env?.YANZHI_API_PORT;
  const fromEnv = normalizePort(env);
  if (fromEnv) return fromEnv;
  return DEFAULT_API_PORT;
}

/** 本端 API 基址（**已含 /api 前缀**，与 UI 的 API_BASE 约定一致） */
export function localApiBase(win?: any): string {
  return `http://127.0.0.1:${resolveLocalApiPort(win)}/api`;
}

/** 本端站点根（不含 /api）——供回调地址、媒体地址等场景使用 */
export function localApiOrigin(win?: any): string {
  return `http://127.0.0.1:${resolveLocalApiPort(win)}`;
}