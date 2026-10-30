// 依赖安全核对（P1）。
//
// ★ 这是**离线快照**，不是实时漏洞库：只覆盖少量影响面大、修复明确的条目。
//   报告里必须写清"快照日期与覆盖范围"，不能让人以为是完整 SCA。
// ★ 只看声明版本的下限：`^4.17.15` 视为 4.17.15 起；实际安装版本以 lockfile 为准，
//   这里宁可保守（下限安全就不报），避免天天误报。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Severity } from '../../../sec-lab-types.js';
import type { ScanFinding } from '../types.js';
import { fingerprintOf } from '../types.js';

export const DEP_SNAPSHOT_DATE = '2026-10';

interface KnownVuln {
  name: string;
  fixed: string;
  severity: Severity;
  cve?: string;
  note: string;
}

export const KNOWN_VULNS: KnownVuln[] = [
  { name: 'lodash', fixed: '4.17.21', severity: 'high', cve: 'CVE-2021-23337', note: '模板函数可注入命令' },
  { name: 'minimist', fixed: '1.2.6', severity: 'high', cve: 'CVE-2021-44906', note: '原型链污染' },
  { name: 'node-fetch', fixed: '2.6.7', severity: 'high', cve: 'CVE-2022-0235', note: '重定向时泄露敏感头' },
  { name: 'json5', fixed: '2.2.2', severity: 'high', cve: 'CVE-2022-46175', note: '原型链污染' },
  { name: 'vm2', fixed: '3.9.11', severity: 'critical', cve: 'CVE-2023-29017', note: '沙箱逃逸可执行任意代码' },
  { name: 'ejs', fixed: '3.1.10', severity: 'high', cve: 'CVE-2022-29078', note: '模板注入导致 RCE' },
  { name: 'serialize-javascript', fixed: '3.1.0', severity: 'high', cve: 'CVE-2020-7660', note: '反序列化 XSS' },
  { name: 'tough-cookie', fixed: '4.1.3', severity: 'high', cve: 'CVE-2023-26136', note: '原型链污染' },
  { name: 'semver', fixed: '7.5.2', severity: 'medium', cve: 'CVE-2022-25883', note: 'ReDoS' },
  { name: 'word-wrap', fixed: '1.2.4', severity: 'medium', cve: 'CVE-2023-26115', note: 'ReDoS' },
  { name: 'crypto-js', fixed: '4.2.0', severity: 'critical', cve: 'CVE-2023-46233', note: 'PBKDF2 强度不足，口令可被快速破解' },
  { name: 'axios', fixed: '1.6.0', severity: 'medium', cve: 'CVE-2023-45857', note: '跨站请求时泄露 XSRF token' },
  { name: 'ws', fixed: '8.17.1', severity: 'high', cve: 'CVE-2024-37890', note: 'DoS（大量头字段）' },
  { name: 'braces', fixed: '3.0.3', severity: 'high', cve: 'CVE-2024-4068', note: 'ReDoS' },
];

/** 从 semver range 里取最小版本；无法解析返回 null */
export function minVersion(range: string): string | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(range || '').replace(/[\^~<>=v\s]/g, ''));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface DepAuditResult {
  findings: ScanFinding[];
  packages: number;
  manifests: string[];
}

/** 只扫根目录与一层 workspace 包，避免遍历 node_modules */
export async function auditDependencies(root: string, maxManifests = 20): Promise<DepAuditResult> {
  const manifests: string[] = [];
  const candidates = [root];
  for (const sub of ['apps', 'packages']) {
    const dir = path.join(root, sub);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) if (e.isDirectory()) candidates.push(path.join(dir, e.name));
  }

  let packages = 0;
  const findings: ScanFinding[] = [];
  for (const dir of candidates.slice(0, maxManifests)) {
    const file = path.join(dir, 'package.json');
    let raw: string;
    try { raw = await fs.readFile(file, 'utf8'); } catch { continue; }
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try { pkg = JSON.parse(raw); } catch { continue; }
    const rel = path.relative(root, file);
    manifests.push(rel);
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    packages += Object.keys(all).length;
    for (const [name, range] of Object.entries(all)) {
      const known = KNOWN_VULNS.find((v) => v.name === name);
      if (!known) continue;
      const min = minVersion(range);
      if (!min || compareVersion(min, known.fixed) >= 0) continue;
      const location = `${rel}:${name}@${range}`;
      findings.push({
        ruleId: 'vulnerable-dependency',
        title: `依赖 ${name} 版本偏低${known.cve ? `（${known.cve}）` : ''}`,
        severity: known.severity,
        detail: `声明范围 ${range}，修复版本为 ${known.fixed}。${known.note}。`,
        remediation: `升级 ${name} 到 ${known.fixed} 或以上。`,
        evidence: `${name}@${range}`,
        location,
        fingerprint: fingerprintOf('vulnerable-dependency', location, name),
      });
    }
  }
  return { findings, packages, manifests };
}
