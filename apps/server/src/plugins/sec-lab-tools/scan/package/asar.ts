// Electron asar 读取（P1）。
//
// ★ asar 不是 ZIP：格式是「4 字节 pickle 头 + JSON 文件表 + 顺序存放的原始文件」。
//   因此不能拿 adm-zip 打开；这里按格式手拆，只读，不落盘。
import { promises as fs } from 'node:fs';
import type { ScanFinding } from '../types.js';
import { fingerprintOf } from '../types.js';
import { rulesForExt, type RuleFile } from '../source/rules.js';

export interface AsarEntry {
  name: string;
  size: number;
  offset: number;
  unpacked?: boolean;
}

export interface AsarArchive {
  entries: AsarEntry[];
  dataOffset: number;
  buffer: Buffer;
}

const MAX_ARCHIVE_BYTES = 400 * 1024 * 1024;

export async function readAsar(file: string): Promise<AsarArchive> {
  const st = await fs.stat(file);
  if (st.size > MAX_ARCHIVE_BYTES) throw new Error(`asar 超过 ${Math.round(MAX_ARCHIVE_BYTES / 1048576)}MB 上限`);
  const buffer = await fs.readFile(file);
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) throw new Error('不是有效的 asar（头部长度标记不符）');
  const headerSize = buffer.readUInt32LE(4);
  if (headerSize <= 0 || 8 + headerSize > buffer.length) throw new Error('asar 头部长度异常');
  const jsonSize = buffer.readUInt32LE(8);
  if (jsonSize <= 0 || 12 + jsonSize > 8 + headerSize) throw new Error('asar 文件表长度异常');
  let table: { files?: Record<string, AsarNode> };
  try {
    table = JSON.parse(buffer.toString('utf8', 12, 12 + jsonSize));
  } catch {
    throw new Error('asar 文件表不是合法 JSON');
  }
  const entries: AsarEntry[] = [];
  const walk = (prefix: string, node: AsarNode): void => {
    if (node.files) {
      for (const [name, child] of Object.entries(node.files)) walk(prefix ? `${prefix}/${name}` : name, child);
    } else if (typeof node.offset === 'number') {
      entries.push({ name: prefix, size: node.size || 0, offset: node.offset, unpacked: node.unpacked });
    }
  };
  walk('', { files: table.files });
  return { entries, dataOffset: 8 + headerSize, buffer };
}

interface AsarNode {
  size?: number;
  offset?: number;
  unpacked?: boolean;
  files?: Record<string, AsarNode>;
}

const SCAN_EXTS = new Set(['.js', '.cjs', '.mjs', '.json', '.html', '.htm', '.ts', '.map']);

export interface AsarScanResult {
  findings: ScanFinding[];
  notes: string[];
  fileCount: number;
}

export async function scanAsar(file: string, maxFiles = 300, maxFileBytes = 1024 * 1024): Promise<AsarScanResult> {
  const arc = await readAsar(file);
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  let scanned = 0;
  let bytes = 0;

  for (const e of arc.entries) {
    if (scanned >= maxFiles) { notes.push(`已达文件上限 ${maxFiles}，结果不完整`); break; }
    if (e.unpacked) continue;
    const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
    if (!SCAN_EXTS.has(ext)) continue;
    if (e.size <= 0 || e.size > maxFileBytes) continue;
    if (bytes + e.size > 20 * 1024 * 1024) { notes.push('已达读取总量上限 20MB，结果不完整'); break; }
    const start = arc.dataOffset + e.offset;
    if (start < 0 || start + e.size > arc.buffer.length) continue;
    const text = arc.buffer.toString('utf8', start, start + e.size);
    bytes += e.size;
    scanned++;
    const ruleFile: RuleFile = { rel: e.name, ext, text, lines: text.split(/\r?\n/) };
    for (const rule of rulesForExt(ext)) {
      for (const h of rule.scan(ruleFile)) {
        const location = `${e.name}:${h.line}`;
        findings.push({
          ruleId: rule.id,
          title: `${rule.title}${rule.cwe ? `（${rule.cwe}）` : ''}`,
          severity: rule.severity,
          detail: `${rule.why}\n证据：${h.evidence}`,
          remediation: rule.fix,
          evidence: h.evidence,
          location,
          fingerprint: fingerprintOf(rule.id, location, h.evidence),
        });
        if (findings.length >= 200) break;
      }
      if (findings.length >= 200) break;
    }
    if (findings.length >= 200) break;
  }
  notes.push(`asar：${arc.entries.length} 个条目，扫描 ${scanned} 个文本文件`);
  return { findings, notes, fileCount: arc.entries.length };
}
