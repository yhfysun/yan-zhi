// CVE 情报与利用线索（sec-lab P2，2026-10-17）。
//
// ★ 定位：**离线快照**，不联网。渗透现场常常没有外网，而"这个版本对应哪个 CVE、
//   要不要当天修"是决定下一步的关键。
// ★★ 关于 EPSS：刻意**不硬编码** EPSS 数值 —— 它是随利用态势每天变的概率值，
//   写死在代码里第二天就是错的，而且会让人以为"这就是最新"。需要时请现查。
// ★ CVSS 与 KEV（CISA 已知被利用目录）相对稳定，这里只收**广为人知**的条目；
//   未收录就明确告诉用户"本地库没有"，不编。
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface CveEntry {
  id: string;
  title: string;
  /** CVSS v3.1 基础分（NVD 公开值） */
  cvss: number;
  /** 是否在 CISA KEV（已知被利用）目录 */
  kev: boolean;
  /** 匹配的产品关键词（小写） */
  products: string[];
  detail: string;
  remediation: string;
}

/**
 * 本地 CVE 快照（只收广为人知、且 CVSS/KEV 状态稳定的条目）。
 * ★ 新增条目时请注明来源；不确定的宁可不收 —— 错的情报比没有情报更糟。
 */
export const CVE_DB: CveEntry[] = [
  {
    id: 'CVE-2021-44228', title: 'Log4Shell（Apache Log4j2 JNDI 注入）', cvss: 10.0, kev: true,
    products: ['log4j', 'log4j2', 'log4shell'],
    detail: '通过可控字符串触发 JNDI lookup，可远程执行代码。影响 2.0-beta9 ~ 2.14.1。',
    remediation: '升级到 2.17.1+；临时缓解可设 log4j2.formatMsgNoLookups=true。',
  },
  {
    id: 'CVE-2022-22965', title: 'Spring4Shell（Spring Framework 数据绑定 RCE）', cvss: 9.8, kev: true,
    products: ['spring', 'spring-framework', 'spring4shell'],
    detail: '特定部署形态（Tomcat + WAR）下可通过数据绑定改写 AccessLogValve 写 shell。影响 5.3.0-5.3.17 / 5.2.0-5.2.19。',
    remediation: '升级 Spring Framework 到 5.3.18+ / 5.2.20+。',
  },
  {
    id: 'CVE-2021-41773', title: 'Apache HTTP Server 路径穿越', cvss: 7.5, kev: true,
    products: ['apache', 'httpd', 'apache http server'],
    detail: '2.4.49 的路径归一化缺陷可读取 DocumentRoot 之外的文件；2.4.50 可 RCE。',
    remediation: '升级到 2.4.51+；确认 require all denied 默认配置未被改成 granted。',
  },
  {
    id: 'CVE-2017-0144', title: 'EternalBlue（SMBv1 远程代码执行）', cvss: 8.1, kev: true,
    products: ['smb', 'smbv1', 'windows server 2008', 'windows 7'],
    detail: 'SMBv1 处理特制请求时越界写，可远程执行代码；蠕虫化传播（WannaCry）。',
    remediation: '禁用 SMBv1；安装 MS17-010；445 端口不对公网开放。',
  },
  {
    id: 'CVE-2020-1472', title: 'Zerologon（Netlogon 加密缺陷）', cvss: 10.0, kev: true,
    products: ['netlogon', 'domain controller', 'windows server'],
    detail: 'Netlogon 认证使用全零挑战，可把域控机器账户口令置空并接管域。',
    remediation: '安装 2020-08 及以后补丁；启用强制模式并确认非 Windows 设备已兼容。',
  },
  {
    id: 'CVE-2019-0708', title: 'BlueKeep（RDP 预认证 RCE）', cvss: 9.8, kev: true,
    products: ['rdp', 'remote desktop', 'windows 7', 'windows server 2008'],
    detail: 'RDP 预认证阶段处理特制请求时 UAF，可远程执行代码且可能蠕虫化。',
    remediation: '安装补丁；启用 NLA；3389 不对公网开放。',
  },
  {
    id: 'CVE-2021-3156', title: 'sudo Baron Samedit（堆溢出提权）', cvss: 7.8, kev: false,
    products: ['sudo'],
    detail: 'sudoedit -s 处理反斜杠结尾参数时堆溢出，本地用户可提权到 root。',
    remediation: '升级 sudo 到 1.9.5p2+。',
  },
  {
    id: 'CVE-2022-0847', title: 'Dirty Pipe（Linux 内核任意文件写）', cvss: 7.8, kev: false,
    products: ['linux kernel', 'dirty pipe'],
    detail: '管道缓冲区标志未初始化，可覆写只读文件页缓存（含 /etc/passwd），本地提权。影响 5.8+。',
    remediation: '升级内核到 5.16.11 / 5.15.25 / 5.10.102 及以后。',
  },
  {
    id: 'CVE-2023-44487', title: 'HTTP/2 Rapid Reset（拒绝服务）', cvss: 7.5, kev: true,
    products: ['http2', 'http/2', 'nginx', 'envoy', 'apache'],
    detail: '快速创建并重置 HTTP/2 流，放大资源消耗导致服务不可用。',
    remediation: '升级到各厂商修复版本；在网关侧限制并发流与 RST 速率。',
  },
];

function summarize(e: CveEntry): string {
  return `${e.id}  CVSS ${e.cvss.toFixed(1)}${e.kev ? '  ★KEV(已知被利用)' : ''}\n${e.title}\n${e.detail}`;
}

/** 按 CVE id 或产品关键词查本地库。查不到就明说，不编。 */
export function lookupCve(keyword: string): ToolOutput {
  const k = String(keyword || '').trim();
  if (!k) throw new Error('要给 CVE 编号或产品关键词（如 CVE-2021-44228 / log4j）');
  const lower = k.toLowerCase();
  const isId = /^cve-\d{4}-\d{3,}$/i.test(k);
  const hits = isId
    ? CVE_DB.filter((e) => e.id.toLowerCase() === lower)
    : CVE_DB.filter((e) => e.id.toLowerCase().includes(lower) || e.title.toLowerCase().includes(lower) || e.products.some((p) => p.includes(lower) || lower.includes(p)));

  if (!hits.length) {
    return {
      tool: 'cve_intel', target: '', risk: 'passive',
      summary: `本地快照（${CVE_DB.length} 条）没有匹配「${k}」。\n` +
        '本工具**不联网**：需要最新信息请用 /web_search 或到 NVD / 厂商公告核实；不要凭猜测下结论。',
      findings: [{
        title: '本地库未收录该条目', severity: 'info',
        detail: '这不是"没有漏洞"，只是"离线快照里没有"。请以官方来源为准。',
      }],
      raw: { query: k, localSize: CVE_DB.length },
    };
  }

  return {
    tool: 'cve_intel', target: '', risk: 'passive',
    summary: hits.map(summarize).join('\n\n') +
      '\n\n注：CVSS/KEV 取自公开的稳定信息；EPSS 每日变化，本工具**不硬编码**，请现查。',
    findings: hits.map((e) => ({
      title: `${e.id} ${e.title}`,
      severity: e.cvss >= 9 ? 'critical' : e.cvss >= 7 ? 'high' : e.cvss >= 4 ? 'medium' : 'low',
      detail: `CVSS ${e.cvss.toFixed(1)}${e.kev ? '，CISA KEV（已被在野利用）' : ''}\n${e.detail}`,
      remediation: e.remediation,
    })),
    raw: hits,
  };
}

/** 利用线索：只给"是否有公开利用"的提示，不提供利用代码。 */
export function searchExploit(keyword: string): ToolOutput {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) throw new Error('要给产品/组件关键词');
  const hits = CVE_DB.filter((e) => e.products.some((p) => p.includes(k) || k.includes(p)) || e.title.toLowerCase().includes(k));
  return {
    tool: 'exploit_search', target: '', risk: 'passive',
    summary: hits.length
      ? `与「${k}」相关的已知漏洞 ${hits.length} 条（有公开利用信息的标 KEV）：\n` +
        hits.map((e) => `${e.id}  CVSS ${e.cvss.toFixed(1)}${e.kev ? '  KEV' : ''}  ${e.title}`).join('\n') +
        '\n\n本工具**不提供利用代码**；需要 PoC 请用 /templates 的只读检测，或在隔离靶场里验证。'
      : `与「${k}」相关的本地条目：无。\n本工具离线，不联网检索 ExploitDB；装了 searchsploit 可用 /toolchain 探测。`,
    findings: hits.map((e) => ({
      title: `${e.id} 有公开利用（KEV=${e.kev}）`,
      severity: e.kev ? 'high' : 'medium',
      detail: e.detail,
      remediation: e.remediation,
    })),
    raw: hits,
  };
}
