// 等待后端就绪（移动端内嵌 Node 后端的冷启动竞态兜底）。
//
// ★★★ 为什么必须有这个（2026-09-22 定位到的「数据不初始化」根因）：
//
//   Capacitor 真机的启动顺序是 **WebView 先加载前端 → 内嵌 Node 后端后启动**
//   （`@capawesome/capacitor-nodejs` 的 `startMode: 'auto'` 是异步拉起的，
//    前端资源是打包在 APK 里的本地文件，毫秒级就加载完了）。
//
//   于是「首个请求」**必然**打在一个还没开始监听的端口上 → `ERR_CONNECTION_REFUSED`。
//   链路崩坏过程（实测 console 原文）：
//     · NETFAIL net::ERR_CONNECTION_REFUSED
//     · EXC TypeError: Failed to fetch  at apiFetch (api/client.ts)
//     · [Vue warn] Unhandled error during execution of mounted hook  at <App>
//     · [Vue Router] Unexpected error when starting the router
//     · → `.chat-page` 从未挂载 → `useChat.onMounted()` 根本没执行
//     · → 平台/模型/智能体/技能**全空**，用户必须手动进「模型平台」「智能体平台」页
//         触发那两个页面自己的 onMounted 才有数据。
//
//   两道修复缺一不可：
//     ① `apiFetch` 把网络层错误转成 `ApiError{status:0}` 返回（不再抛异常）→ 不击穿路由；
//     ② **本模块**：在授权校验（路由守卫的第一步）之前等后端就绪 → 后续请求都有后端可打。
//
// ★ 为什么放在 license 而不是各 store：授权校验是**路由守卫里的第一道**，
//   它过了才会挂载页面、才会跑各 store 的 onMounted。把等待放在这里，
//   等于"一次等待，全局受益"，不需要给每个 store 都加重试。
//
// ★ 为什么不用 getWithRetry：那是"请求级的重试"，治标；这里是"启动期的就绪门"，
//   治本 —— 且能保证首个业务请求就打在后端上，避免留下半初始化的状态。
import { API_BASE } from './client';

/** 探测路径：挑一个**免授权**的接口，避免等待期间被授权门禁拦成 401 而误判成"后端没起"。 */
const PROBE_PATH = '/license/default';
/** 默认最长等待：移动端内嵌后端冷启动实测 ~1~3s，给 30s 上限足够宽容（低端机也够）。 */
export const BACKEND_READY_TIMEOUT_MS = 30_000;
const FIRST_DELAY_MS = 250;
const MAX_DELAY_MS = 2_000;

/**
 * 等待后端可响应 HTTP。就绪返回 true；超时返回 false。
 *
 * 幂等且有记忆：一旦确认就绪，后续调用**立即返回**，不会引入任何额外延迟
 * （所以可以放心放在启动关键路径上）。
 */
let ready = false;

export async function waitForBackend(timeoutMs = BACKEND_READY_TIMEOUT_MS): Promise<boolean> {
  if (ready) return true;
  const started = Date.now();
  let delay = FIRST_DELAY_MS;

  for (;;) {
    try {
      // 用原生 fetch 而不是 apiFetch：这里只关心"端口有没有人应答"，
      // 不需要 Authorization / x-license 头，也不该把失败记成业务错误。
      const res = await fetch(API_BASE + PROBE_PATH, { method: 'GET' });
      // ★ 拿到任何 HTTP 响应（含 401/403）都说明后端在监听 —— 门禁是"后端活着"之后的另一层问题。
      if (res && typeof res.status === 'number' && res.status > 0) {
        ready = true;
        return true;
      }
    } catch {
      // 连接被拒 / DNS / 超时 → 后端还没起来，继续等
    }
    if (Date.now() - started >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, delay));
    // 退避但有上限：250 → 500 → 1000 → 2000 → 2000 …
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }
}

/** 是否已确认过后端就绪（供需要"同步判断"的场景使用，不触发探测）。 */
export function isBackendReady(): boolean {
  return ready;
}

/** 仅供测试：复位就绪标记。 */
export function resetBackendReadyForTest(): void {
  ready = false;
}