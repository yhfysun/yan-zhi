// 服务端资源地址解析 —— 前端多处要把服务端返回的相对地址补成可请求地址，规则集中在这里。
//
// 背景：API_BASE 的约定是「已含 /api 前缀」——Electron 下是 http://127.0.0.1:3001/api，
// Web 下是 /api；而服务端返回的媒体地址是「站点根相对路径」且自身也带 /api：
//   /api/generated/images/<conversationId>/<name>.png   （生图/生视频产物）
//   /api/plugin/computer-use/screenshots/<name>.png     （临时截图）
// 于是 API_BASE + 路径 会拼出 /api/api/... 而 404。正确做法是先取「站点根」（去掉尾部的
// /api）再拼路径。历史上 absoluteMediaSrc / normalizeMediaSrc 各写了一套，两处都踩了这个坑。

/** 从 API_BASE 得到站点根：仅剥掉结尾的 /api（其余路径前缀一律保留） */
export function serverOrigin(apiBase: string): string {
  const base = (apiBase || '').trim().replace(/\/+$/, '');
  return base.endsWith('/api') ? base.slice(0, -'/api'.length) : base;
}

/**
 * 服务端返回的地址 → 可请求地址。
 * - http(s) / data: / blob: —— 已是完整地址，原样返回
 * - 以 / 开头 —— 站点根相对路径（如 /api/xxx、/screenshots/xxx）：站点根 + 路径
 * - 其余（裸文件名 / 文档相对路径）—— 保持原样，交给浏览器按当前文档解析
 */
export function resolveServerUrl(apiBase: string, path: string): string {
  const p = (path || '').trim();
  if (!p) return '';
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  if (!p.startsWith('/')) return p;
  return serverOrigin(apiBase) + p;
}
