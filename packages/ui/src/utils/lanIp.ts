/**
 * 本机局域网 IP 管理（2026-10-17，用户报障「连接地址怎么都是 localhost」）。
 *
 * 背景铁证：后端 `apps/server/src/index.ts` 的 HOST 默认就是 `0.0.0.0`（绑定所有网卡），
 * `/api/network/ip` 也正常返回 IPv4 清单 —— 但设置页「商城服务端 / 短信验证码」展示的
 * 连接地址恒为 `localhost`。根因在**前端解析**：`apiFetch`（api/client.ts）已把后端
 * `{ data: X, ...meta }` 解包成 `{ data: X, ...meta }`（单层），调用方却又按 `data.data`
 * 多解一层 → `Array.isArray(undefined)` = false → `lanIps` 恒空 → 兜底链落到
 * `window.location.hostname || 'localhost'`。
 *
 * 本文件收口三件事（单一实现，避免各处再各写一套）：
 *   ① 响应解析 —— 兼容 apiFetch 单层解包后的形态，也兜住后端原始形态；
 *   ② 虚拟网卡判定 —— vEthernet(Hyper-V) / VMware / VirtualBox / WSL / Docker / VPN
 *      这类地址给了别人也连不通（或不是用户想暴露的那个网段），必须可识别；
 *   ③ 默认 IP 选定 + 排序 —— 用户显式选的置顶；未选则优先物理网卡。
 */

/** 一条本机 IPv4（name = 网卡名，address = IPv4 地址） */
export interface LanIp {
  name: string;
  address: string;
  family?: string;
}

/**
 * 虚拟网卡判定。
 *
 * ★ 为什么需要：`os.networkInterfaces()` 在 Windows 上会把 Hyper-V 虚拟交换机
 *   （vEthernet (Default Switch) / vEthernet (hyper)）、WSL、VMware、VirtualBox、
 *   Docker、各类 VPN 虚拟网卡一并返回，且顺序不稳定。把这类地址当成"本机 IP"
 *   复制给别人 → 对方根本连不上（NAT 网段 / 仅宿主可见），表现为"功能有但不可用"。
 * ★ 判定口径：只按**网卡名**匹配（地址段各家重叠严重，按名判最稳），大小写不敏感。
 */
export function isVirtualNic(name: string): boolean {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  // 先放行常见物理网卡名，避免误伤（如 Intel Wireless-AC 9560 含 "wireless" 但非虚拟）
  if (/^(wlan|wi-fi|wireless|ethernet|eth|en\d)/.test(n)) return false;
  return (
    n.includes('vethernet') ||      // Hyper-V 虚拟交换机
    n.includes('hyper-v') ||
    n.includes('vmware') ||
    n.includes('virtualbox') ||
    n.includes('vbox') ||
    n.includes('wsl') ||            // Windows Subsystem for Linux
    n.includes('docker') ||
    n.includes('vethernet') ||
    n.includes('loopback') ||
    n.includes('bluetooth') ||
    n.includes('tap') ||            // OpenVPN / TAP 适配器
    n.includes('tun') ||            // WireGuard / OpenVPN TUN
    n.includes('wg') ||             // WireGuard
    n.includes('zerotier') ||
    n.includes('tailscale') ||
    n.includes('openvpn') ||
    n.includes('nord') ||
    n.includes('pseudo') ||
    n.includes('tunnel') ||
    n.includes('virtual')
  );
}

/** 稳定排序键：同优先级内按 IPv4 数字序，保证多次刷新顺序一致（不跳动）。 */
function ipSortKey(address: string): string {
  const parts = String(address || '').split('.');
  if (parts.length !== 4) return String(address || '');
  return parts.map((p) => String(Number(p) || 0).padStart(3, '0')).join('.');
}

/**
 * 排序：用户选定的默认 IP 置顶 → 物理网卡 → 虚拟网卡。
 *
 * ★ 为什么默认 IP 要置顶（而不是单独一个字段）：设置页「局域网访问」「本机 IP」
 *   两处都渲染同一个清单，`openLanFirst()` 又取 `lanIps[0]` —— 若只改 connectUrl
 *   不改排序，"打开浏览器"按钮仍会开到虚拟网卡地址上，等于修了一半。
 *   排序即贯通：所有取 `[0]` 的地方自动跟着默认 IP 走。
 */
export function sortLanIps(list: readonly LanIp[], preferred?: string): LanIp[] {
  const arr = Array.isArray(list) ? list.slice() : [];
  const pref = String(preferred || '').trim();
  const rank = (x: LanIp): number => {
    if (pref && x.address === pref) return 0;
    return isVirtualNic(x.name) ? 2 : 1;
  };
  return arr.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return ipSortKey(a.address).localeCompare(ipSortKey(b.address));
  });
}

/**
 * 选定"默认 IP"。
 *
 * 优先级：用户在设置里显式选的（且**必须仍在当前清单里** —— 换网/断网后旧地址会失效，
 * 若 stale 值仍被采用，连接地址会指向一个不存在的地址，比回落更糟）→ 第一个物理网卡
 * → 第一个（全是虚拟网卡的极端场景，总比 localhost 强）。
 */
export function pickDefaultLanIp(list: readonly LanIp[], stored: string): string {
  const arr = Array.isArray(list) ? list : [];
  const s = String(stored || '').trim();
  if (s && arr.some((x) => x.address === s)) return s;
  const physical = arr.find((x) => !isVirtualNic(x.name));
  return (physical || arr[0])?.address || '';
}

/**
 * 解析 `/api/network/ip` 的响应。
 *
 * ★ 兼容三种形态（按真实数据流排序）：
 *   ① `{ data: [...], port }` —— **apiFetch 解包后的实际形态**（最常见，曾因多解一层而恒空）；
 *   ② `[...]` —— 已取出的裸数组；
 *   ③ `{ data: { data: [...], port } }` —— 后端原始 JSON（直连后端/测试）。
 * 解析不出来时返回空清单，由调用方走"未检测到"提示，不抛异常。
 */
export function parseNetworkIpResponse(r: unknown): { ips: LanIp[]; port?: number } {
  const body: any = r && typeof r === 'object' ? r : {};
  const raw: unknown[] = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body)
      ? body
      : Array.isArray(body?.data?.data)
        ? body.data.data
        : [];
  const ips: LanIp[] = raw
    .filter((x: any) => x && typeof x.address === 'string' && x.address)
    .map((x: any) => ({ name: String(x.name || ''), address: x.address, family: x.family }));
  const portRaw = body?.port ?? body?.data?.port;
  const port = Number(portRaw);
  return { ips, port: Number.isFinite(port) && port > 0 ? port : undefined };
}
