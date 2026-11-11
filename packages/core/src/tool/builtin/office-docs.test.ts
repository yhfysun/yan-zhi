// 办公三件套 AI 工具（2026-11-02）
import { describe, it, expect } from 'vitest';
import { OfficeCreateTool, OfficeReadTool, OfficeWriteTool } from './office-docs';

describe('office_create / office_read', () => {
  it('office_create：类型限定 doc/sheet/slides，名称必填', () => {
    const t = new OfficeCreateTool();
    expect(t.name).toBe('office_create');
    const props = (t.inputSchema as any).properties;
    expect(props.kind.enum).toEqual(['doc', 'sheet', 'slides']);
    expect((t.inputSchema as any).required).toContain('name');
  });

  it('office_read：只需 path', () => {
    const t = new OfficeReadTool();
    expect(t.name).toBe('office_read');
    expect((t.inputSchema as any).required).toEqual(['path']);
    expect((t.inputSchema as any).properties.sheet).toBeDefined();
    expect(t.description).toContain('真实使用范围');
    expect(t.description).toContain('列字母');
  });

  it('office_write：Excel 明确列范围可直接删除整列', () => {
    const t = new OfficeWriteTool();
    expect(t.name).toBe('office_write');
    expect((t.inputSchema as any).properties.deleteColumns).toBeDefined();
    expect((t.inputSchema as any).properties.deleteColumns.description).toContain('EV:FV');
    expect(t.description).toContain('已给出明确列范围时直接执行');
    expect(t.description).toContain('删除后范围');
  });
});
