/**
 * 远程地址里是否内嵌明文凭据（`https://user:token@host/…`）。
 *
 * ★ 为什么要单独一个判定（2026-10-16）：远程地址弹窗会把 origin 的完整地址显示出来，
 *   还能一键复制到剪贴板 —— 而本仓实际配置里就带着 `https://ghp_…@github.com/owner/repo.git`
 *   这种形态。地址本身必须可读可改（否则用户没法修正它），所以不做拦截，
 *   但值得给一句提醒：它会出现在界面、剪贴板和截图里，建议改用凭据管理器。
 *
 * 口径（按协议分两种，别一刀切）：
 *   · http / https：userinfo 出现就按凭据算 —— GitHub PAT 就是这么传的
 *     （`https://ghp_xxx@github.com/owner/repo.git` 里没有冒号，但它确实是密钥）；
 *   · 其它协议（ssh://…、git+ssh://…）：只有 `user:password@` 这种**带冒号**的形态才算，
 *     否则 `ssh://git@host:2222/app.git` 会被误报 —— 那只是用户名，SSH 远程会被整片标红。
 * 另外 scp 形式（`git@github.com:owner/repo.git`）没有 scheme，一律不算。
 */
const SCHEME_WITH_USERINFO = /^([a-z][a-z0-9+.-]*):\/\/([^/@\s]+)@/i;

export function hasInlineCredential(url: string): boolean {
  const m = SCHEME_WITH_USERINFO.exec(String(url || '').trim());
  if (!m) return false;
  const scheme = m[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https') return true;
  return m[2].includes(':');
}
