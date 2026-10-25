/**
 * 裸路径 → hash 引导判定（纯函数，供单测；由 router/index.ts 在建路由前调用）。
 *
 * ★ 为什么需要：本应用是 hash 路由，但远控「复制邀请 / 设置页地址 / 二维码」给的
 *   都是 `http://ip:port/remote` 形态的裸路径 —— 服务端 SPA fallback 把它回退成
 *   index.html 后 location.hash 为空，vue-router 会落到首页而**不是**远程控制页
 *   （2026-10-25 修：此前手机扫码/点链接进来看到的是应用首页，远控页根本没打开）。
 *   这里把对外公布的裸路径入口映射成对应 hash，其余路径不动。
 */
export function barePathHashTarget(pathname: string, hash: string): string | null {
  if (hash) return null; // 已带 hash：交给 vue-router
  const p = pathname.replace(/\/+$/, '');
  if (p !== '/remote') return null;
  return '/remote';
}
