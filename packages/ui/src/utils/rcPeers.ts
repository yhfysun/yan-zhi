/**
 * 控制端「已保存的被控端」（2026-10-26，用户要求「授权码也要记录啊，还有多个能下拉选择」）。
 *
 * 背景：控制电脑页此前只把上次的地址记进 localStorage（rc:lastHost），授权码每次都要重敲；
 *   家里 / 公司 / 测试机几台常用被控端也切不了，只能手打 IP。
 * 口径：地址 + 授权码**成对**保存，最近用的排最前，下拉里选一个就自动填好地址和码。
 *
 * ★ 授权码是共享密钥：只落本机 localStorage（与 deviceToken 同处），不进日志、不写邀请文案，
 *   下拉展示也不显示码值（防肩窥），选中的时候才填进输入框。
 */

export interface RcPeer {
  /** 被控端地址（含协议与端口，如 http://192.168.1.100:3001） */
  host: string;
  /** 授权码；'' = 只记过地址，还没成功配对过 */
  code: string;
  /** 毫秒时间戳，用于排序（最近的在前） */
  lastUsed: number;
}

export const RC_PEERS_KEY = 'rc:peers';
/** 旧版本的「上次地址」键：只在没有新清单时用来迁移一条，避免升级后历史丢失 */
export const RC_LAST_HOST_KEY = 'rc:lastHost';
/** 上限：下拉太长反而难选，常用几台足够 */
export const RC_PEERS_MAX = 8;

/** 统一地址形态：去空白、去尾部斜杠（同一个地址手敲多一个 `/` 不该变成两条记录） */
export function normalizeRcHost(host: unknown): string {
  return String(host ?? '').trim().replace(/\/+$/, '');
}

function sortPeers(list: readonly RcPeer[]): RcPeer[] {
  return list.slice().sort((a, b) => b.lastUsed - a.lastUsed || a.host.localeCompare(b.host));
}

/**
 * 解析本地存的清单。宽容脏数据（换版本 / 手改过 / 非数组一律当空），
 * 并按地址去重（大小写不敏感）。`legacyHost` 用于旧版 rc:lastHost 的迁移。
 */
export function parseRcPeers(raw: unknown, legacyHost = ''): RcPeer[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: RcPeer[] = [];
  for (const item of arr) {
    const p = (item || {}) as Partial<RcPeer>;
    const host = normalizeRcHost(p.host);
    const key = host.toLowerCase();
    if (!host || seen.has(key)) continue;
    seen.add(key);
    out.push({ host, code: String(p.code ?? '').trim(), lastUsed: Number(p.lastUsed) || 0 });
  }
  const legacy = normalizeRcHost(legacyHost);
  if (legacy && !seen.has(legacy.toLowerCase())) {
    out.push({ host: legacy, code: '', lastUsed: 0 });
  }
  return sortPeers(out).slice(0, RC_PEERS_MAX);
}

/**
 * 记录一次（地址, 授权码）。已存在同一地址时就地更新授权码并提到最前；
 * 传入的 code 为空时保留旧码（例如只改端口/换了协议）。
 */
export function upsertRcPeer(list: readonly RcPeer[], host: unknown, code: unknown, now: number): RcPeer[] {
  const h = normalizeRcHost(host);
  if (!h) return list.slice();
  const key = h.toLowerCase();
  const prev = list.find((x) => normalizeRcHost(x.host).toLowerCase() === key);
  const next: RcPeer = {
    host: prev?.host || h,
    code: String(code ?? '').trim() || prev?.code || '',
    lastUsed: Number(now) || 0,
  };
  const rest = list.filter((x) => normalizeRcHost(x.host).toLowerCase() !== key);
  return sortPeers([next, ...rest]).slice(0, RC_PEERS_MAX);
}

export function removeRcPeer(list: readonly RcPeer[], host: unknown): RcPeer[] {
  const key = normalizeRcHost(host).toLowerCase();
  return list.filter((x) => normalizeRcHost(x.host).toLowerCase() !== key);
}

/** 下拉文案：去掉协议前缀；存过码的标一句（码值本身不显示） */
export function peerLabel(p: RcPeer): string {
  const host = normalizeRcHost(p.host).replace(/^https?:\/\//i, '');
  return p.code ? `${host}（已存授权码）` : host;
}
