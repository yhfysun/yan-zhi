// 数据产物契约单测：行归一、截断、落盘/读回、文件名净化。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeRows, safeArtifactName, writeDataEnvelope, readDataEnvelope, summarizeEnvelope,
} from './data-artifact';

let dir = '';

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-data-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('normalizeRows', () => {
  it('对象数组按列名取值，列自动推导', () => {
    const r = normalizeRows({ rows: [{ a: 1, b: 'x' }, { a: 2, b: null }] });
    expect(r.columns).toEqual(['a', 'b']);
    expect(r.rows).toEqual([[1, 'x'], [2, null]]);
  });

  it('二维数组按 columns 顺序，对象单元格转 JSON', () => {
    const r = normalizeRows({ columns: ['a', 'b'], rows: [[{ k: 1 }, undefined]] });
    expect(r.rows).toEqual([['{"k":1}', null]]);
  });

  it('无列名时用 c1..cn 兜底', () => {
    const r = normalizeRows({ rows: [[1, 2]] });
    expect(r.columns).toEqual(['c1', 'c2']);
  });

  it('rows 非数组 → 空结果', () => {
    expect(normalizeRows({ rows: null }).rows).toEqual([]);
  });
});

describe('safeArtifactName', () => {
  it('去掉路径分隔符与非法字符', () => {
    expect(safeArtifactName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeArtifactName('a/b\\c:d*e')).toBe('a_b_c_d_e');
  });

  it('空名回退 data', () => {
    expect(safeArtifactName('   ')).toBe('data');
  });
});

describe('writeDataEnvelope / readDataEnvelope', () => {
  it('截断首屏但保留全量 total，落点在工作目录', () => {
    const rows = Array.from({ length: 10 }, (_, i) => [i]);
    const { dataPath, envelope } = writeDataEnvelope(dir, '明细', { columns: ['v'], rows, total: 99 }, 3);
    expect(path.dirname(dataPath)).toBe(dir);
    expect(envelope.rows).toHaveLength(3);
    expect(envelope.total).toBe(99);
    const back = readDataEnvelope(dataPath);
    expect(back.columns).toEqual(['v']);
    expect(back.total).toBe(99);
    expect(back.rows).toHaveLength(3);
  });

  it('没有工作目录直接报错', () => {
    expect(() => writeDataEnvelope('', 'x', { rows: [] })).toThrow();
  });

  it('读回非法文件报错（不猜结构）', () => {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{"a":1}', 'utf-8');
    expect(() => readDataEnvelope(bad)).toThrow(/columns\/rows/);
    expect(() => readDataEnvelope(path.join(dir, 'missing.json'))).toThrow(/不存在/);
  });

  it('摘要只给路径/条数/列名，不含行数据', () => {
    const { dataPath, envelope } = writeDataEnvelope(dir, 'x', { columns: ['a'], rows: [[1]] });
    const text = summarizeEnvelope(envelope, dataPath, 'x_1.py');
    expect(text).toContain('data_path:');
    expect(text).toContain('total: 1');
    expect(text).toContain('columns: a');
    expect(text).toContain('script_file: x_1.py');
    expect(text).not.toContain('[[1]]');
  });
});
