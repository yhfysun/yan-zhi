import { describe, expect, it, vi } from 'vitest';
import { createExecutionReceipt, summarizeExecutionReceipt } from './execution';

describe('execution receipt', () => {
  it('normalizes evidence and keeps before/after revisions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const receipt = createExecutionReceipt({
      target: 'desktop',
      action: 'click_element',
      ok: true,
      startedAt: 100,
      beforeRevision: 'uia:1',
      afterRevision: 'uia:2',
      changed: true,
      evidence: [
        { kind: 'ui_tree', summary: '点击后重新读取控件树', ref: 'tree-2' },
        { kind: 'note', summary: '按钮已展开' },
      ],
    });
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      target: 'desktop',
      action: 'click_element',
      ok: true,
      beforeRevision: 'uia:1',
      afterRevision: 'uia:2',
      changed: true,
    });
    expect(receipt.evidence).toHaveLength(2);
    expect(summarizeExecutionReceipt(receipt)).toContain('状态有变化');
    vi.restoreAllMocks();
  });

  it('caps evidence count and rejects empty evidence rows', () => {
    const evidence = Array.from({ length: 60 }, (_, i) => ({
      kind: 'note' as const,
      summary: i === 0 ? '' : `证据 ${i}`,
    }));
    const receipt = createExecutionReceipt({
      target: 'browser',
      action: 'click',
      ok: false,
      error: '未找到元素',
      evidence,
    });
    expect(receipt.evidence).toHaveLength(50);
    expect(receipt.error).toBe('未找到元素');
  });
});
