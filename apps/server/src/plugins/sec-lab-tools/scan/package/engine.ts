// 安装包扫描引擎：按文件类型分派到 APK / asar / ZIP / EXE。
//
// ★ 能力边界写清楚：APK 做清单 + DEX 字符串 + 签名；asar 做打包后 JS 规则扫描；
//   ZIP 做明文条目扫描；EXE 只做有限检查（不做安装器解包）。
//   结果里必须带上"哪些是降级能力"，不能让人以为做了动态分析。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ScanContext, ScanFinding, ScanResult, Scanner } from '../types.js';
import { fingerprintOf } from '../types.js';
import { analyzeApk } from './apk.js';
import { scanAsar } from './asar.js';
import { rulesForExt, type RuleFile } from '../source/rules.js';

type PackageKind = 'apk' | 'asar' | 'zip' | 'exe' | 'unknown';

async function sniff(file: string): Promise<PackageKind> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.apk' || ext === '.aab') return 'apk';
  if (ext === '.asar') return 'asar';
  if (ext === '.zip' || ext === '.jar') return 'zip';
  if (ext === '.exe' || ext === '.msi') return 'exe';
  const head = Buffer.alloc(4);
  const fh = await fs.open(file, 'r');
  try { await fh.read(head, 0, 4, 0); } finally { await fh.close(); }
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (head[0] === 0x4d && head[1] === 0x5a) return 'exe';
  return 'unknown';
}

const TEXT_IN_ZIP = new Set(['.js', '.cjs', '.mjs', '.json', '.ts', '.env', '.properties', '.xml', '.html', '.yml', '.yaml', '.txt', '.sh', '.ps1']);

async function scanZip(file: string): Promise<{ findings: ScanFinding[]; notes: string[]; meta: Record<string, unknown> }> {
  const zip = new AdmZip(file);
  const entries = zip.getEntries();
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  let scanned = 0;
  for (const e of entries) {
    if (scanned >= 300) { notes.push('已达文件上限 300'); break; }
    const ext = e.entryName.slice(e.entryName.lastIndexOf('.')).toLowerCase();
    if (!TEXT_IN_ZIP.has(ext)) continue;
    if ((e.header.size || 0) > 512 * 1024) continue;
    const text = e.getData().toString('utf8');
    scanned++;
    const ruleFile: RuleFile = { rel: e.entryName, ext, text, lines: text.split(/\r?\n/) };
    for (const rule of rulesForExt(ext)) {
      for (const h of rule.scan(ruleFile)) {
        const location = `${e.entryName}:${h.line}`;
        findings.push({
          ruleId: rule.id, title: `${rule.title}${rule.cwe ? `（${rule.cwe}）` : ''}`,
          severity: rule.severity, detail: `${rule.why}\n证据：${h.evidence}`,
          remediation: rule.fix, evidence: h.evidence, location,
          fingerprint: fingerprintOf(rule.id, location, h.evidence),
        });
        if (findings.length >= 200) break;
      }
      if (findings.length >= 200) break;
    }
    if (findings.length >= 200) break;
  }
  notes.push(`ZIP：${entries.length} 个条目，扫描 ${scanned} 个文本文件`);
  return { findings, notes, meta: { entries: entries.length, scanned } };
}

async function scanExe(file: string): Promise<{ findings: ScanFinding[]; notes: string[]; meta: Record<string, unknown> }> {
  const st = await fs.stat(file);
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const dir = path.dirname(file);
  const asar = path.join(dir, 'resources', 'app.asar');
  const hasAsar = await fs.stat(asar).then((s) => s.isFile()).catch(() => false);
  if (hasAsar) {
    const r = await scanAsar(asar);
    findings.push(...r.findings);
    notes.push(`EXE：发现同目录 resources/app.asar，已按 asar 扫描（${r.fileCount} 条目）`);
  } else {
    notes.push('EXE：仅做有限检查（不做安装器解包）；未发现同目录 resources/app.asar');
  }
  findings.push({
    ruleId: 'exe-limited-analysis', title: 'Windows 安装包仅做有限分析', severity: 'info',
    detail: `当前版本不解包 NSIS/MSI 安装器，仅检查同目录 asar 与文件基本信息（${Math.round(st.size / 1048576)}MB）。需要更深分析请提供 win-unpacked 目录或 app.asar。`,
    evidence: file,
    location: file,
    fingerprint: fingerprintOf('exe-limited-analysis', file, String(st.size)),
  });
  return { findings, notes, meta: { bytes: st.size, hasAsar } };
}

export function createPackageScanner(): Scanner {
  return {
    id: 'package',
    kinds: ['package'],
    stages: ['安全解包', '清单解析', 'DEX 与资源', '签名校验', '汇总'],

    async run(ctx: ScanContext): Promise<ScanResult> {
      const file = path.resolve(ctx.target);
      const st = await fs.stat(file).catch(() => null);
      if (!st) throw new Error(`文件不存在：${file}`);
      if (!st.isFile()) throw new Error(`安装包扫描需要一个文件：${file}`);

      ctx.beginStage('安全解包');
      const kind = await sniff(file);
      ctx.endStage('安全解包', `${kind} · ${Math.round(st.size / 1024)}KB`);

      let findings: ScanFinding[] = [];
      let notes: string[] = [];
      let meta: Record<string, unknown> = { file, kind, bytes: st.size };

      if (kind === 'apk') {
        ctx.beginStage('清单解析');
        const r = await analyzeApk(file);
        findings = r.findings;
        notes = r.notes;
        meta = { ...meta, ...r.meta };
        ctx.endStage('清单解析', notes.find((n) => n.startsWith('清单')) || '完成');
        ctx.beginStage('DEX 与资源');
        ctx.endStage('DEX 与资源', notes.find((n) => n.startsWith('DEX')) || '完成');
        ctx.beginStage('签名校验');
        ctx.endStage('签名校验', notes.find((n) => n.startsWith('签名')) || '完成');
      } else if (kind === 'asar') {
        ctx.beginStage('清单解析');
        const r = await scanAsar(file);
        findings = r.findings;
        notes = r.notes;
        ctx.endStage('清单解析', `${r.fileCount} 个条目`);
        ctx.beginStage('DEX 与资源');
        ctx.endStage('DEX 与资源', '不适用（asar）');
        ctx.beginStage('签名校验');
        ctx.endStage('签名校验', '不适用（asar 无签名块）');
      } else if (kind === 'zip') {
        ctx.beginStage('清单解析');
        const r = await scanZip(file);
        findings = r.findings;
        notes = r.notes;
        ctx.endStage('清单解析', `${(r.meta.entries as number) || 0} 个条目`);
        ctx.beginStage('DEX 与资源');
        ctx.endStage('DEX 与资源', '不适用（通用 ZIP）');
        ctx.beginStage('签名校验');
        ctx.endStage('签名校验', '不适用（通用 ZIP）');
      } else if (kind === 'exe') {
        ctx.beginStage('清单解析');
        const r = await scanExe(file);
        findings = r.findings;
        notes = r.notes;
        ctx.endStage('清单解析', '有限分析');
        ctx.beginStage('DEX 与资源');
        ctx.endStage('DEX 与资源', '不适用（EXE）');
        ctx.beginStage('签名校验');
        ctx.endStage('签名校验', '未校验 Authenticode（当前版本不支持）');
      } else {
        throw new Error(`无法识别的文件类型：${path.basename(file)}（支持 APK/AAB、asar、ZIP、EXE）`);
      }

      ctx.beginStage('汇总');
      const summary = `安装包扫描（${ctx.profile}）：${path.basename(file)}\n${notes.join('\n')}\n` +
        `命中 ${findings.length} 处。\n★ 静态分析只给线索：清单判定的导出组件与 DEX 字符串都需要人工确认。`;
      ctx.endStage('汇总');
      return { findings, summary, raw: meta };
    },
  };
}
