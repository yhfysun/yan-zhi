// 局域网言智节点发现。
// ------------------------------------------------------------------
// 用途：设置页「局域网访问」一键扫描本机所在 /24 网段内、监听 yz 端口的其他
// 言智节点，供移动端「设为后端」与桌面/Web「复制地址」（商城源 / Peers）使用。
//
// 实现取舍：
//  1) 扫描经**本端后端**发出（客户端不直接扫）：移动端 WebView 是 https origin，
//     直接 fetch http://192.168.x.x 属混合内容会被拦；后端 Node fetch 无此限制，
//     且 /24 × 超时 的连接数也适合在后端做并发控制。
//  2) 端口探测复用 core 内置工具 lan_scan 的 probeHost / expandTargets ——
//     同一件事两处实现必然漂移（台账教训）。
//  3) 识别：端口 open 只说明「有服务」，再 GET / 取首页 HTML 匹配言智特征
//     （<title>言智 或 构建产物里的 yan-zhi 标识），防止把同端口的其他应用认进来。
//  4) 护栏：只扫 RFC1918 私网段、最多 4 个网段、单网段 /24、连接超时短、并发受限 ——
//     定位是「发现自有节点」，不是通用端口扫描器（那是 lan_scan 工具的事）。
import * as os from 'node:os';
import { expandTargets, probeHost } from '@yan-zhi/core';

/** RFC1918 私网地址（扫描目标只允许私网，不做公网探测） */
export function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 172) return b >= 16 && b <= 31;
  if (a === 192) return b === 168;
  return false;
}

/** /24 网段规格：192.168.1.23 → 192.168.1.0/24 */
export function subnetOf(ip: string): string | null {
  const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return m ? `${m[1]}.0/24` : null;
}

/** 首页 HTML 是否具备言智节点特征（built index.html 的 title 与产物路径） */
export function looksLikeYzNode(html: string): boolean {
  if (!html) return false;
  return /<title>[^<]*言智|yan-?zhi/i.test(html.slice(0, 4096));
}

export interface LanYzNode {
  ip: string;
  port: number;
  /** 是否本机自身节点 */
  isSelf: boolean;
}

export interface LanNodeScanResult {
  nodes: LanYzNode[];
  /** 实际扫描的网段 */
  subnets: string[];
  /** 端口 open 的候选数（含未通过言智特征识别的） */
  openCount: number;
  durationMs: number;
}

function localIpv4s(): Array<{ name: string; address: string }> {
  const out: Array<{ name: string; address: string }> = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name] || []) {
      if (it.family === 'IPv4' && !it.internal && isPrivateIp(it.address)) {
        out.push({ name, address: it.address });
      }
    }
  }
  return out;
}

/** GET http://ip:port/ 取首页前几 KB 判断是否言智节点（1.5s 超时，失败视为非节点） */
async function probeYzMarker(ip: string, port: number): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    const res = await fetch(`http://${ip}:${port}/`, { signal: ac.signal });
    if (!res.ok) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    await reader.cancel().catch(() => {});
    return looksLikeYzNode(new TextDecoder().decode(value || new Uint8Array()));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 扫描本机所有私网 /24 网段上的言智节点。
 * @param port   目标端口（默认 3001，与 yz 服务端默认端口一致）
 * @param timeoutMs 单连接探测超时（默认 500ms；/24 × 128 并发约 1-2s/网段）
 */
export async function discoverLanNodes(opts?: { port?: number; timeoutMs?: number }): Promise<LanNodeScanResult> {
  const port = Math.min(Math.max(Number(opts?.port) || 3001, 1), 65535);
  const timeoutMs = Math.min(Math.max(Number(opts?.timeoutMs) || 500, 100), 3000);
  const start = Date.now();

  const locals = localIpv4s();
  const localIps = new Set(locals.map((l) => l.address));
  // 多网卡去重同一网段；上限 4 个网段（虚拟网卡一堆的场景别把扫描拖成分钟级）
  const subnets = [...new Set(locals.map((l) => subnetOf(l.address)).filter((s): s is string => !!s))].slice(0, 4);

  const hosts = subnets.flatMap((s) => expandTargets(s));
  const openIps: string[] = [];
  let idx = 0;
  const concurrency = Math.min(128, hosts.length);
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < hosts.length) {
      const ip = hosts[idx++];
      if ((await probeHost(await import('node:net'), ip, port, timeoutMs)) === 'open') openIps.push(ip);
    }
  });
  await Promise.all(workers);

  const nodes: LanYzNode[] = [];
  for (const ip of openIps) {
    if (await probeYzMarker(ip, port)) {
      nodes.push({ ip, port, isSelf: localIps.has(ip) });
    }
  }
  nodes.sort((a, b) => (a.isSelf === b.isSelf ? a.ip.localeCompare(b.ip, undefined, { numeric: true }) : a.isSelf ? -1 : 1));

  return { nodes, subnets, openCount: openIps.length, durationMs: Date.now() - start };
}
