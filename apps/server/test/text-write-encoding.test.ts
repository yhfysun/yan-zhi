/**
 * 落盘编码决策回归（2026-10-21 用户实报：「修改文件肯定要根据文件编码类型啊」）。
 *
 * 守住的语义：
 *   1) 已知编码（文件读过/盘上探测过）→ **原样写回**，绝不偷偷转 UTF-8；
 *   2) 原文件带 BOM → 写回补 BOM；换编码则不补（BOM 属于旧编码）；
 *   3) Windows 批处理：CRLF；含中文且未声明 chcp 65001 → GB18030（cmd 默认 ANSI 936）。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeTextBytes, encodeTextBytes } from '@yan-zhi/shared';
import { decideWriteEncoding, isWindowsBatchPath } from '../src/services/text-write-encoding.js';
import { writeTextFilePreservingEncoding } from '../src/services/text-file-write.js';

describe('decideWriteEncoding', () => {
  it('已知 GBK 文件 → 仍写 GBK（不转 UTF-8）', () => {
    const plan = decideWriteEncoding('D:/proj/build.bat', 'set "ANDROID_HOME=C:\\Android\\Sdk"\n', { encoding: 'gb18030' }, 'win32');
    expect(plan.encoding).toBe('gb18030');
    expect(plan.crlf).toBe(true);
    expect(plan.converted).toBe(false);
  });

  it('原文件带 UTF-8 BOM → 写回补 BOM', () => {
    const plan = decideWriteEncoding('D:/proj/a.txt', '中文', { encoding: 'utf-8', bom: 'utf-8' }, 'win32');
    expect(plan.encoding).toBe('utf-8');
    expect(plan.withBom).toBe(true);
    expect(plan.crlf).toBe(false);
  });

  it('UTF-16LE 文件 → 仍是 UTF-16LE + BOM', () => {
    const plan = decideWriteEncoding('D:/proj/legacy.txt', '中文', { encoding: 'utf-16le', bom: 'utf-16le' }, 'win32');
    expect(plan.encoding).toBe('utf-16le');
    expect(plan.withBom).toBe(true);
  });

  it('新 .bat 含中文 → GB18030 + CRLF', () => {
    const plan = decideWriteEncoding('D:/proj/run.bat', 'echo 中文\n', undefined, 'win32');
    expect(plan.encoding).toBe('gb18030');
    expect(plan.crlf).toBe(true);
  });

  it('新 .bat 显式 chcp 65001 → UTF-8 + CRLF', () => {
    const plan = decideWriteEncoding('D:/proj/run.bat', '@echo off\nchcp 65001 >nul\necho 中文\n', undefined, 'win32');
    expect(plan.encoding).toBe('utf-8');
    expect(plan.crlf).toBe(true);
  });

  it('新普通文件 → UTF-8，不动换行', () => {
    const plan = decideWriteEncoding('D:/proj/a.ts', 'const a = 1;\n', undefined, 'win32');
    expect(plan).toEqual({ encoding: 'utf-8', withBom: false, crlf: false, converted: false });
  });

  it('已存在的 UTF-8 .bat 含中文却没声明 chcp → 转 GB18030 并标记 converted', () => {
    const plan = decideWriteEncoding('D:/proj/run.bat', 'echo 中文\n', { encoding: 'utf-8' }, 'win32');
    expect(plan.encoding).toBe('gb18030');
    expect(plan.converted).toBe(true);
  });

  it('macOS/Linux 的 .bat 不套 Windows 规则', () => {
    expect(isWindowsBatchPath('D:/proj/run.bat', 'darwin')).toBe(false);
    const plan = decideWriteEncoding('/tmp/run.bat', 'echo 中文\n', { encoding: 'utf-8' }, 'darwin');
    expect(plan.encoding).toBe('utf-8');
    expect(plan.crlf).toBe(false);
  });
});

// ── 落盘出口的端到端验证：真文件、真字节（不是只测决策函数）───────────────
describe('writeTextFilePreservingEncoding（真文件往返）', () => {
  const mk = () => mkdtempSync(join(tmpdir(), 'yz-enc-'));
  const read = (p: string) => decodeTextBytes(new Uint8Array(readFileSync(p)));

  it('★★ GBK 文件被编辑后仍是 GBK（这是用户实报的核心场景）', () => {
    const dir = mk();
    try {
      const p = join(dir, 'legacy.bat');
      writeFileSync(p, Buffer.from(encodeTextBytes('echo 中文\r\n', 'gb18030')));
      writeTextFilePreservingEncoding(p, 'echo 中文改过了\n');
      const back = read(p);
      expect(back.encoding).toBe('gb18030');
      expect(back.text).toBe('echo 中文改过了\r\n'); // 批处理统一 CRLF
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('UTF-8 BOM 保留（不能悄悄丢 BOM）', () => {
    const dir = mk();
    try {
      const p = join(dir, 'a.txt');
      writeFileSync(p, Buffer.from(encodeTextBytes('中文', 'utf-8', { withBom: true })));
      writeTextFilePreservingEncoding(p, '中文改了');
      const bytes = readFileSync(p);
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(read(p).text).toBe('中文改了');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('新文件默认 UTF-8', () => {
    const dir = mk();
    try {
      const p = join(dir, 'new.ts');
      writeTextFilePreservingEncoding(p, 'const a = 1;\n');
      expect(read(p).encoding).toBe('utf-8');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
