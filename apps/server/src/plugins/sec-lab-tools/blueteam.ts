// 蓝队：检测规则库（Sigma / Suricata 子集）+ 日志狩猎。
//
// 定位：这是防御侧资产。C2 这块我们做的是**检测**而不是搭建——
// 即识别 beacon 心跳、DNS 隧道、可疑 UA 等流量特征，帮助防守方看见攻击，
// 而不是提供一套控制端去操控别人机器。
import fs from 'node:fs';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface DetectRule {
  id: string;
  name: string;
  /** sigma=主机/日志侧；suricata=网络侧 */
  kind: 'sigma' | 'suricata';
  /** MITRE ATT&CK 技术编号 */
  technique: string;
  severity: Finding['severity'];
  desc: string;
  /** 简化的匹配模式（真实部署时可导出为完整 Sigma/Suricata YAML） */
  patterns: RegExp[];
  remediation: string;
}

/** 内置检测规则子集（可继续扩充；完整生态建议对接 Atomic Red Team / SigmaHQ） */
export const RULES: DetectRule[] = [
  {
    id: 'YZ-001', name: '可疑 PowerShell 编码命令', kind: 'sigma', technique: 'T1059.001', severity: 'high',
    desc: 'PowerShell 使用 -enc / EncodedCommand / IEX 执行，常见于无文件攻击',
    patterns: [/powershell[^\n]*\s-(e|en|enc|encodedcommand)\b/i, /powershell[^\n]*\b(iex|invoke-expression)\b/i, /FromBase64String/i],
    remediation: '启用 PowerShell 模块日志与脚本块日志（Script Block Logging），对编码命令告警',
  },
  {
    id: 'YZ-002', name: '计划任务/持久化创建', kind: 'sigma', technique: 'T1053', severity: 'medium',
    desc: 'schtasks / crontab 创建计划任务，需确认是否为运维正常行为',
    patterns: [/schtasks[^\n]*\/create/i, /crontab\s+-[elr]/i, /systemctl\s+enable/i],
    remediation: '对计划任务创建做基线比对，非变更窗口内的创建一律告警',
  },
  {
    id: 'YZ-003', name: '凭据存储访问（LSASS）', kind: 'sigma', technique: 'T1003.001', severity: 'critical',
    desc: '访问 LSASS 进程内存或 SAM 数据库，典型凭据窃取行为',
    patterns: [/lsass\.exe/i, /procdump[^\n]*lsass/i, /\/etc\/shadow/i, /SAM\\SAM/i],
    remediation: '开启 Credential Guard / 保护 LSASS（RunAsPPL），监控对 lsass 的句柄访问',
  },
  {
    id: 'YZ-004', name: '临时目录执行程序', kind: 'sigma', technique: 'T1036', severity: 'high',
    desc: '从 %TEMP% / /tmp / 下载目录直接执行可执行文件，典型伪装与落地手法',
    patterns: [/[\\/](temp|tmp)[\\/][^\s]*\.(exe|dll|ps1|bat|vbs|js)\b/i, /\/tmp\/[^\s]*\.(sh|elf|bin)\b/i],
    remediation: '限制临时目录执行权限（AppLocker / 挂载 noexec），监控该路径下的进程创建',
  },
  {
    id: 'YZ-005', name: '日志清理行为', kind: 'sigma', technique: 'T1070.001', severity: 'high',
    desc: '清除事件日志或历史命令，典型反取证动作',
    patterns: [/wevtutil[^\n]*\bcl\b/i, /clear\s+(eventlog|\/var\/log)/i, /rm\s+-rf?\s+\/var\/log/i, /history\s+-c/i, /shred[^\n]*log/i],
    remediation: '日志外送到独立服务器；对日志服务停止与清理动作告警',
  },
  {
    id: 'YZ-006', name: '利用系统工具下载（Living off the Land）', kind: 'sigma', technique: 'T1105', severity: 'medium',
    desc: 'certutil / bitsadmin / curl 下载远程文件',
    patterns: [/certutil[^\n]*(-urlcache|-f)\b/i, /bitsadmin[^\n]*\/transfer/i, /wget\s+http[^\n]*\s+-O\s+/i],
    remediation: '对 certutil/bitsadmin 的网络行为做监控，限制出网白名单',
  },
  {
    id: 'YZ-007', name: 'C2 beacon 心跳特征', kind: 'suricata', technique: 'T1071.001', severity: 'high',
    desc: '同一源 IP 对同一 URI 以固定间隔周期性请求，是 beacon 的典型特征',
    patterns: [/(GET|POST)\s+\/(api|beacon|gate|ping|status|update)\b[^\n]*HTTP\/1\.[01]/i],
    remediation: '对周期性请求的 (src_ip, uri, interval) 做统计建模，抖动极低的会话重点核查',
  },
  {
    id: 'YZ-008', name: 'DNS 隧道可疑特征', kind: 'suricata', technique: 'T1071.004', severity: 'medium',
    desc: '超长标签、高熵子域、异常 TXT 查询，常见于 DNS 隧道',
    patterns: [/query:\s+[a-z0-9]{30,}\./i, /\.(txt|NULL)\s+IN\s+/i, /[a-f0-9]{40,}\.[a-z0-9-]+\./i],
    remediation: '监控 DNS 查询长度与熵值，限制内部主机直连外部 DNS',
  },
  {
    id: 'YZ-009', name: '可疑客户端 UA 访问管理入口', kind: 'suricata', technique: 'T1190', severity: 'medium',
    desc: '脚本化 UA（curl/wget/python-requests/nuclei）访问后台或管理路径',
    patterns: [/(curl|wget|python-requests|nuclei|sqlmap|nikto)\/[\d.]*/i],
    remediation: '对管理后台限定 UA 白名单与来源 IP；WAF 阻断扫描器指纹',
  },
  {
    id: 'YZ-010', name: '明文凭据传输', kind: 'suricata', technique: 'T1071', severity: 'high',
    desc: 'HTTP 明文请求中携带 password/token 等字段',
    patterns: [/POST\s+[^\s]+\s+HTTP\/1\.[01][\s\S]{0,400}(password|passwd|pwd|token|secret)=[^\s&]{3,}/i],
    remediation: '全站强制 HTTPS；对含敏感字段的明文请求直接阻断并告警',
  },
];

/** 导出为可直接使用的 Sigma / Suricata 规则文本（简化版，够落地再精修） */
export function exportRule(r: DetectRule): string {
  if (r.kind === 'suricata') {
    const sid = 9000000 + Number(r.id.replace(/\D/g, ''));
    const pat = r.patterns[0].source.replace(/^\^|\$$/g, '').slice(0, 180);
    return [
      `# ${r.name}（${r.id} / ${r.technique}）`,
      `alert http any any -> any any (msg:"YANZHI ${r.name}"; http.uri; pcre:"/${pat}/i";`,
      `  classtype:misc-activity; sid:${sid}; rev:1; metadata:attack_target ${r.technique};)`,
    ].join('\n');
  }
  const pats = r.patterns.map((p) => `      - '${p.source.replace(/^\^|\$$/g, '').replace(/'/g, "''").slice(0, 180)}'`).join('\n');
  return [
    `title: ${r.name}`,
    `id: ${r.id}`,
    `status: experimental`,
    `description: ${r.desc}`,
    `references:`,
    `  - https://attack.mitre.org/techniques/${r.technique.replace('.', '/')}/`,
    `tags:`,
    `  - attack.${r.technique.split('.')[0].toLowerCase()}`,
    `logsource:`,
    `  category: process_creation`,
    `detection:`,
    `  selection:`,
    `    CommandLine|re:`,
    pats,
    `  condition: selection`,
    `level: ${r.severity}`,
  ].join('\n');
}

/** 在一段日志文本上跑规则，返回命中 */
export function matchRules(text: string, rules: DetectRule[] = RULES) {
  const hits: Array<{ rule: string; name: string; severity: string; technique: string; count: number; sample: string }> = [];
  for (const r of rules) {
    let count = 0;
    let sample = '';
    for (const p of r.patterns) {
      const m = text.match(new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g'));
      if (m) {
        count += m.length;
        if (!sample) sample = m[0].slice(0, 200);
      }
    }
    if (count) hits.push({ rule: r.id, name: r.name, severity: r.severity, technique: r.technique, count, sample });
  }
  return hits.sort((a, b) => b.count - a.count);
}

// ---------- 工具入口 ----------

export interface RuleParams {
  action: 'list' | 'get' | 'match';
  /** get：规则 id；match：待检测文本 */
  id?: string;
  text?: string;
  kind?: 'sigma' | 'suricata';
}

export function runDetectRules(p: RuleParams): ToolOutput {
  const target = p.id || p.kind || 'all';
  if (p.action === 'list') {
    const list = RULES.filter((r) => !p.kind || r.kind === p.kind);
    return {
      tool: 'detect_rules', target, risk: 'passive',
      summary: `内置检测规则 ${list.length} 条（Sigma ${list.filter((r) => r.kind === 'sigma').length} / Suricata ${list.filter((r) => r.kind === 'suricata').length}）。`,
      findings: list.map((r) => ({
        title: `${r.id} ${r.name}`,
        severity: r.severity,
        detail: `${r.kind.toUpperCase()} · ${r.technique} · ${r.desc}`,
        remediation: r.remediation,
      })),
      raw: { rules: list.map((r) => ({ id: r.id, name: r.name, kind: r.kind, technique: r.technique, severity: r.severity })) },
    };
  }
  if (p.action === 'get') {
    const r = RULES.find((x) => x.id === p.id);
    if (!r) throw new Error(`未找到规则 ${p.id}`);
    return {
      tool: 'detect_rules', target: r.id, risk: 'passive',
      summary: `${r.id} ${r.name}（${r.kind} / ${r.technique}）`,
      findings: [{ title: r.name, severity: r.severity, detail: r.desc, remediation: r.remediation }],
      raw: { rule: exportRule(r) },
    };
  }
  // match
  if (!p.text) throw new Error('match 需要提供 text（日志内容）');
  const hits = matchRules(p.text);
  return {
    tool: 'detect_rules', target: 'match', risk: 'passive',
    summary: hits.length ? `命中 ${hits.length} 条规则，累计 ${hits.reduce((a, b) => a + b.count, 0)} 次匹配。` : '未命中任何内置规则。',
    findings: hits.map((h) => ({
      title: `${h.rule} ${h.name} × ${h.count}`,
      severity: h.severity as Finding['severity'],
      detail: `技术 ${h.technique}；样例：${h.sample}`,
      evidence: h.sample,
      remediation: RULES.find((r) => r.id === h.rule)?.remediation,
    })),
    raw: { hits },
  };
}

export interface HuntParams {
  /** 日志文件路径（本地绝对路径） */
  path: string;
  /** 额外 IOC 关键词（逗号分隔或数组） */
  iocs?: string[];
  /** 最大读取字节数，默认 8MB */
  maxBytes?: number;
}

/** 日志狩猎：读文件 → 跑内置规则 + 自定义 IOC → 输出命中摘要 */
export async function runLogHunt(p: HuntParams): Promise<ToolOutput> {
  if (!p.path) throw new Error('需要提供日志文件路径 path');
  let st: fs.Stats;
  try {
    st = fs.statSync(p.path);
  } catch {
    throw new Error(`无法访问文件：${p.path}`);
  }
  if (st.isDirectory()) throw new Error('path 需为文件，不支持目录');
  const maxBytes = Math.max(1024, Math.min(p.maxBytes || 8 * 1024 * 1024, 64 * 1024 * 1024));
  const fd = fs.openSync(p.path, 'r');
  try {
    const size = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    const text = buf.toString('utf8');

    const hits = matchRules(text);
    const iocs = p.iocs?.length ? p.iocs : [];
    const iocHits: Array<{ ioc: string; count: number; sample: string }> = [];
    for (const ioc of iocs) {
      if (!ioc.trim()) continue;
      const re = new RegExp(ioc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const m = text.match(re);
      if (m?.length) {
        const idx = text.search(re);
        iocHits.push({ ioc, count: m.length, sample: text.slice(Math.max(0, idx - 60), idx + 120).replace(/\s+/g, ' ').trim() });
      }
    }

    const findings: Finding[] = hits.map((h) => ({
      title: `${h.rule} ${h.name} × ${h.count}`,
      severity: h.severity as Finding['severity'],
      detail: `技术 ${h.technique}；样例：${h.sample}`,
      evidence: h.sample,
      remediation: RULES.find((r) => r.id === h.rule)?.remediation,
    }));
    for (const i of iocHits) {
      findings.push({ title: `IOC 命中：${i.ioc} × ${i.count}`, severity: 'high', detail: i.sample, evidence: i.sample });
    }

    return {
      tool: 'log_hunt', target: p.path, risk: 'passive',
      summary: `分析 ${(size / 1024).toFixed(0)} KB 日志：规则命中 ${hits.length} 条，IOC 命中 ${iocHits.length} 个。${st.size > maxBytes ? `（文件 ${(st.size / 1024 / 1024).toFixed(1)}MB，仅读取前 ${(maxBytes / 1024 / 1024).toFixed(0)}MB）` : ''}`,
      findings: findings.length ? findings : [{ title: '未命中任何规则或 IOC', severity: 'info', detail: '可补充自定义 IOC 关键词后重试' }],
      raw: { fileSize: st.size, readBytes: size, hits, iocHits },
    };
  } finally {
    fs.closeSync(fd);
  }
}
