// 文档类型（D1/D2）：校验口径 + YAML 往返 + 用户隔离。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-doctype-'));

type Svc = typeof import('../src/services/document-type.js');
let svc: Svc;

beforeAll(async () => {
  svc = await import('../src/services/document-type.js');
});

const DEF = {
  code: 'sales-weekly',
  name: '销售周报',
  description: '按周汇总销售',
  category: '报告',
  sections: [
    { kind: 'heading', label: '概览', required: true },
    { kind: 'metrics', label: '关键指标' },
  ],
  variables: [
    { key: 'week', label: '周次', type: 'text', default: '第 1 周' },
    { key: 'region', label: '区域', type: 'select', options: ['华东', '华南'] },
  ],
};

describe('normalizeDocumentType', () => {
  it('合法定义原样通过并补默认值', () => {
    const def = svc.normalizeDocumentType(DEF);
    expect(def.code).toBe('sales-weekly');
    expect(def.output).toBe('docx');
    expect(def.sections).toHaveLength(2);
    expect(def.variables).toHaveLength(2);
  });

  it('拒绝非法 code / 空 sections / 非法 kind', () => {
    expect(() => svc.normalizeDocumentType({ ...DEF, code: 'Bad Code' })).toThrow(/code/);
    expect(() => svc.normalizeDocumentType({ ...DEF, sections: [] })).toThrow(/sections/);
    expect(() => svc.normalizeDocumentType({ ...DEF, sections: [{ kind: 'video', label: 'X' }] })).toThrow(/kind/);
  });

  it('变量 key 重复 / select 无选项被拒绝', () => {
    expect(() => svc.normalizeDocumentType({
      ...DEF,
      variables: [{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }],
    })).toThrow(/重复/);
    expect(() => svc.normalizeDocumentType({
      ...DEF,
      variables: [{ key: 'a', label: 'A', type: 'select' }],
    })).toThrow(/options/);
  });
});

describe('存储与 YAML', () => {
  it('保存后能列出/读取；同 code 覆盖而不是新增', () => {
    svc.saveDocumentType('u1', DEF);
    svc.saveDocumentType('u1', { ...DEF, name: '销售周报 v2' });
    const list = svc.listDocumentTypes('u1');
    expect(list.filter((t) => t.code === 'sales-weekly')).toHaveLength(1);
    expect(svc.getDocumentType('u1', 'sales-weekly')!.name).toBe('销售周报 v2');
  });

  it('用户隔离', () => {
    expect(svc.getDocumentType('u-other', 'sales-weekly')).toBeNull();
    expect(svc.listDocumentTypes('u-other')).toEqual([]);
  });

  it('导出 YAML → 导入回同构定义', () => {
    svc.saveDocumentType('u2', DEF);
    const yaml = svc.exportDocumentTypeYaml('u2', 'sales-weekly');
    expect(yaml).toContain('code: sales-weekly');
    expect(yaml).toContain('version: 1');

    const imported = svc.importDocumentTypeYaml('u3', yaml);
    expect(imported.code).toBe('sales-weekly');
    expect(imported.sections.map((s) => s.kind)).toEqual(['heading', 'metrics']);
    expect(imported.variables?.[1].options).toEqual(['华东', '华南']);
  });

  it('坏 YAML / 高版本被拒绝', () => {
    expect(() => svc.importDocumentTypeYaml('u3', 'a: [')).toThrow(/YAML/);
    expect(() => svc.importDocumentTypeYaml('u3', 'version: 9\ncode: x\nname: x\nsections: []')).toThrow(/版本/);
  });

  it('删除后读不到', () => {
    svc.deleteDocumentType('u2', 'sales-weekly');
    expect(svc.getDocumentType('u2', 'sales-weekly')).toBeNull();
  });
});
