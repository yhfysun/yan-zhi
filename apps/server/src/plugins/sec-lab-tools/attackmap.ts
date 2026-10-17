// ATT&CK 映射（sec-lab P3，2026-10-17）。
//
// ★ 解决什么：一堆零散的发现项（缺安全头、开放端口、弱口令…）很难让人判断
//   "我们到底覆盖了攻击链的哪几段、漏了哪几段"。这里把发现项按关键词映射到
//   ATT&CK 技术，输出"已覆盖 / 未覆盖"，作为检测与加固的优先级参考。
// ★ 这是**启发式映射**，不是精确归属：同一条发现可能对应多种技术。
//   输出里明确写"启发式"，避免被当成审计结论。
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface Technique {
  id: string;
  name: string;
  /** 命中该技术的关键词（匹配发现项标题 + 详情） */
  patterns: RegExp[];
  /** 未覆盖时的建议 */
  advice: string;
}

export const ATTACK_TECHNIQUES: Technique[] = [
  {
    id: 'T1595', name: 'Active Scanning', patterns: [/portscan|端口|扫描/i],
    advice: '对外暴露面做持续测绘，并对扫描行为做告警。',
  },
  {
    id: 'T1592', name: 'Gather Victim Host Information', patterns: [/recon|banner|server|x-powered-by|指纹|版本/i],
    advice: '隐藏版本号、关闭不必要的 banner。',
  },
  {
    id: 'T1590', name: 'Gather Victim Network Information', patterns: [/dns|子域|subdomain|ctlog|whois/i],
    advice: '收紧 DNS 记录与证书透明度暴露面，建立子域台账。',
  },
  {
    id: 'T1190', name: 'Exploit Public-Facing Application', patterns: [/sql|注入|xss|ssrf|rce|lfi|反序列化/i],
    advice: '对公网应用做输入校验与 WAF 规则，优先修复可远程利用的注入类问题。',
  },
  {
    id: 'T1078', name: 'Valid Accounts', patterns: [/口令|credential|密码|弱口令|brute/i],
    advice: '强制多因素、禁用默认口令、限制管理面来源 IP。',
  },
  {
    id: 'T1552', name: 'Unsecured Credentials', patterns: [/\.env|secret|密钥|api[_-]?key|凭据/i],
    advice: '密钥进密钥管理服务，禁止配置文件被 Web 直接返回。',
  },
  {
    id: 'T1608', name: 'Stage Capabilities', patterns: [/swagger|actuator|暴露|目录遍历|\.git/i],
    advice: '关闭调试端点与接口文档的公网匿名访问。',
  },
  {
    id: 'T1070', name: 'Indicator Removal', patterns: [/日志|audit|清理/i],
    advice: '日志集中化并设置防篡改；本工具的审计流水也要定期导出。',
  },
  {
    id: 'T1046', name: 'Network Service Discovery', patterns: [/udp|service|开放端口/i],
    advice: '默认拒绝出/入站，只放行必要端口。',
  },
];

export interface AttackMapResult {
  covered: Array<{ id: string; name: string; hits: number }>;
  uncovered: Array<{ id: string; name: string; advice: string }>;
}

/** 纯函数：把 findings 映射到 ATT&CK 技术（便于单测）。 */
export function mapFindings(findings: Array<{ title?: string; detail?: string }>): AttackMapResult {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const text = `${f.title || ''} ${f.detail || ''}`;
    for (const t of ATTACK_TECHNIQUES) {
      if (t.patterns.some((re) => re.test(text))) counts.set(t.id, (counts.get(t.id) || 0) + 1);
    }
  }
  return {
    covered: ATTACK_TECHNIQUES.filter((t) => counts.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, hits: counts.get(t.id) || 0 })),
    uncovered: ATTACK_TECHNIQUES.filter((t) => !counts.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, advice: t.advice })),
  };
}

export function runAttackMap(findings: Finding[]): ToolOutput {
  const r = mapFindings(findings);
  return {
    tool: 'attack_map', target: '', risk: 'passive',
    summary:
      `发现项 ${findings.length} 条，映射到 ${r.covered.length}/${ATTACK_TECHNIQUES.length} 个 ATT&CK 技术（启发式）：\n` +
      (r.covered.length ? r.covered.map((c) => `✓ ${c.id} ${c.name}（${c.hits} 条）`).join('\n') : '（无）') +
      (r.uncovered.length ? `\n\n未覆盖（可作为下一步评估方向）：\n` + r.uncovered.map((u) => `· ${u.id} ${u.name}——${u.advice}`).join('\n') : ''),
    findings: [],
    raw: r,
  };
}
