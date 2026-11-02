// 办公三件套 AI 工具（2026-11-02）
import { describe, it, expect } from 'vitest';
import { OfficeCreateTool, OfficeReadTool } from './office-docs';

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
  });
});
