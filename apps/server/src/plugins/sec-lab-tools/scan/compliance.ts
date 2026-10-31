// 合规映射（P4 收尾，方案 6.4）：把体检发现项对照到等保 2.0 三级 / OWASP Top 10 2021 子集。
//
// ★ 只做**启发式对照**，不做合规判定：一条发现可能同时落在多个控制项，最终结论仍由测评机构给出。
// ★ 映射是静态表：新增规则要在这里补一条，否则报告会把它列进「未映射规则」——
//   这是有意的：新规则不补映射会在报告里显眼，避免悄悄漏掉合规口径。
// ★ ruleId 后缀 `-asset`（安装包资源里的命中）按主规则映射；前缀兜底只用于同类新增规则。
import type { ScanFinding } from './types.js';

export type ComplianceStandard = 'dengbao' | 'owasp';

export interface ComplianceRef {
  standard: ComplianceStandard;
  id: string;
  title: string;
}

export const STANDARD_LABEL: Record<ComplianceStandard, string> = {
  dengbao: '等保 2.0 三级',
  owasp: 'OWASP Top 10 2021',
};

const D = (id: string, title: string): ComplianceRef => ({ standard: 'dengbao', id, title });
const O = (id: string, title: string): ComplianceRef => ({ standard: 'owasp', id, title });

// 等保 2.0 第三级安全要求 · 应用安全（GB/T 22239-2019 8.1.4）
const DB_AUTH = D('8.1.4.1', '身份鉴别');
const DB_ACCESS = D('8.1.4.2', '访问控制');
const DB_INTRUSION = D('8.1.4.4', '入侵防范');
const DB_INTEGRITY = D('8.1.4.7', '数据完整性');
const DB_CONFIDENTIAL = D('8.1.4.8', '数据保密性');

// OWASP Top 10 2021
const A01 = O('A01:2021', '访问控制失效');
const A02 = O('A02:2021', '加密机制失效');
const A03 = O('A03:2021', '注入');
const A05 = O('A05:2021', '安全配置错误');
const A06 = O('A06:2021', '自带缺陷和过时的组件');
const A07 = O('A07:2021', '身份识别和身份验证错误');
const A08 = O('A08:2021', '软件和数据完整性故障');

/** ruleId → 控制项（新增规则必须在这里登记，否则报告会列为未映射） */
export const RULE_COMPLIANCE: Record<string, ComplianceRef[]> = {
  // 源码：凭据与密钥
  'hardcoded-secret': [DB_CONFIDENTIAL, A02],
  'private-key-block': [DB_CONFIDENTIAL, A02],
  'cloud-credential': [DB_CONFIDENTIAL, A02],
  'high-entropy-secret': [DB_CONFIDENTIAL, A02],
  // 源码：注入与执行
  'sql-concat': [DB_INTRUSION, A03],
  'command-injection': [DB_INTRUSION, A03],
  'eval': [DB_INTRUSION, A03],
  'innerhtml': [DB_INTRUSION, A03],
  'dangerous-html': [DB_INTRUSION, A03],
  'unsafe-deserialize': [DB_INTRUSION, A08],
  // 源码：访问控制与配置
  'path-traversal': [DB_ACCESS, A01],
  'cors-wildcard': [DB_ACCESS, A05],
  'debug-route': [DB_INTRUSION, A05],
  'default-credential': [DB_AUTH, A07],
  // 源码：传输与加密
  'disabled-tls-check': [DB_INTEGRITY, A02],
  'weak-crypto': [DB_CONFIDENTIAL, A02],
  'weak-random-secret': [DB_CONFIDENTIAL, A02],
  'plain-http-endpoint': [DB_INTEGRITY, A02],
  // 源码：依赖
  'vulnerable-dependency': [DB_INTRUSION, A06],
  // 源码规则里的 Electron 单项检查（结构级审计见 self-electron-*）
  'electron-node-integration': [DB_INTRUSION, A05],
  'electron-context-isolation-off': [DB_INTRUSION, A05],
  'electron-web-security-off': [DB_INTRUSION, A05],
  'electron-insecure-content': [DB_INTRUSION, A05],
  'csp-unsafe-eval': [DB_INTRUSION, A05],

  // Electron 结构审计
  'self-electron-node-integration': [DB_INTRUSION, A05],
  'self-electron-context-isolation-off': [DB_INTRUSION, A05],
  'self-electron-web-security-off': [DB_INTRUSION, A05],
  'self-electron-permission-handler-missing': [DB_ACCESS, A05],
  'self-electron-csp-missing': [DB_INTRUSION, A05],
  'self-electron-csp-unsafe-eval': [DB_INTRUSION, A05],
  'self-electron-csp-no-script-src': [DB_INTRUSION, A05],
  'self-electron-webview-hardening-missing': [DB_INTRUSION, A05],

  // 运行时探测
  'self-runtime-cors-credentials': [DB_ACCESS, A01],
  'self-runtime-cors-wildcard': [DB_ACCESS, A05],
  'self-runtime-local-api-anonymous': [DB_AUTH, A07],

  // 安装包 / 制品
  'apk-cloud-credential': [DB_CONFIDENTIAL, A02],
  'apk-private-key': [DB_CONFIDENTIAL, A02],
  'apk-plain-http': [DB_INTEGRITY, A02],
  'apk-weak-crypto-mode': [DB_CONFIDENTIAL, A02],
  'apk-webview-bridge': [DB_INTRUSION, A05],
  'apk-test-host': [DB_INTRUSION, A05],
  'apk-debuggable': [DB_INTRUSION, A05],
  'apk-unsigned': [DB_INTRUSION, A08],
  'apk-debug-signature': [DB_INTRUSION, A08],
  'apk-no-signature': [DB_INTRUSION, A08],
};

/** 单条 ruleId 的映射：精确表 → `-asset` 后缀 → 同类前缀兜底 → 未映射（空） */
export function mapCompliance(ruleId: string): ComplianceRef[] {
  const id = String(ruleId || '').trim();
  if (!id) return [];
  const exact = RULE_COMPLIANCE[id];
  if (exact) return exact;
  if (id.endsWith('-asset')) {
    const base = RULE_COMPLIANCE[id.slice(0, -'-asset'.length)];
    if (base) return base;
  }
  // 兜底只覆盖已知前缀，新规则仍应显式登记
  if (id.startsWith('self-electron-')) return [DB_INTRUSION, A05];
  if (id.startsWith('self-runtime-')) return [DB_ACCESS, A05];
  return [];
}

export interface ComplianceRow {
  standard: ComplianceStandard;
  standardLabel: string;
  controlId: string;
  controlTitle: string;
  ruleIds: string[];
  count: number;
}

export interface ComplianceReport {
  rows: ComplianceRow[];
  /** 不在本期子集内的规则（报告里显式列出，按普通修复项处理） */
  unmapped: string[];
}

/** 汇总：标准 → 控制项 → 命中规则与条数（等保在前，同标准按控制项编号排序） */
export function complianceReport(findings: Array<Pick<ScanFinding, 'ruleId'>>): ComplianceReport {
  const rows = new Map<string, ComplianceRow>();
  const unmapped = new Set<string>();

  for (const f of findings) {
    const refs = mapCompliance(f.ruleId);
    if (!refs.length) { unmapped.add(f.ruleId); continue; }
    for (const ref of refs) {
      const key = `${ref.standard}|${ref.id}`;
      const prev = rows.get(key);
      rows.set(key, {
        standard: ref.standard,
        standardLabel: STANDARD_LABEL[ref.standard],
        controlId: ref.id,
        controlTitle: ref.title,
        ruleIds: prev ? [...new Set([...prev.ruleIds, f.ruleId])] : [f.ruleId],
        count: (prev?.count || 0) + 1,
      });
    }
  }

  const order = (s: ComplianceStandard): number => (s === 'dengbao' ? 0 : 1);
  const sorted = [...rows.values()].sort(
    (a, b) => order(a.standard) - order(b.standard) || a.controlId.localeCompare(b.controlId),
  );
  return { rows: sorted, unmapped: [...unmapped].sort() };
}
