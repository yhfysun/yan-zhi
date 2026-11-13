import { describe, expect, it } from 'vitest';
import type { AutomationScriptDraft } from './types';
import { validateAutomationScriptDraft } from './validate';

function validDraft(): AutomationScriptDraft {
  return {
    schemaVersion: 1 as const,
    name: '每日报表同步',
    description: '导出报表并检查文件存在',
    kind: 'browser' as const,
    params: [
      {
        key: 'date',
        label: '日期',
        type: 'string' as const,
        required: true,
        defaultValue: '2026-11-13',
      },
    ],
    steps: [
      {
        id: 's1',
        type: 'browser.navigate' as const,
        url: 'https://example.com/reports',
      },
      {
        id: 's2',
        type: 'browser.click' as const,
        target: { by: 'role' as const, role: 'button', name: '导出' },
      },
      {
        id: 's3',
        type: 'browser.waitFor' as const,
        text: '下载完成',
        timeoutMs: 30000,
      },
    ],
  };
}

describe('validateAutomationScriptDraft', () => {
  it('接受合法浏览器脚本并保留参数与步骤', () => {
    const result = validateAutomationScriptDraft(validDraft());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('每日报表同步');
    expect(result.value.params[0].key).toBe('date');
    expect(result.value.steps).toHaveLength(3);
  });

  it('拒绝空名称、重复步骤 id 和非 http 导航地址', () => {
    const draft = validDraft();
    draft.name = '   ';
    draft.steps[0] = { id: 's1', type: 'browser.navigate', url: 'javascript:alert(1)' };
    draft.steps[1] = {
      id: 's1',
      type: 'browser.click',
      target: { by: 'role', role: 'button', name: '导出' },
    };

    const result = validateAutomationScriptDraft(draft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('脚本名称不能为空');
    expect(result.errors.join('\n')).toContain('步骤 id 重复');
    expect(result.errors.join('\n')).toContain('仅支持 http/https');
  });

  it('拒绝没有定位方式的 click 和超出范围的等待时间', () => {
    const draft = validDraft();
    draft.steps[1] = { id: 's2', type: 'browser.click' } as any;
    draft.steps.push({ id: 's4', type: 'browser.wait', ms: 0 } as any);

    const result = validateAutomationScriptDraft(draft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('click 步骤缺少 target');
    expect(result.errors.join('\n')).toContain('等待时间');
  });

  it('拒绝明文密码参数并提示改用 secret', () => {
    const draft = validDraft();
    draft.params.push({
      key: 'password',
      label: '密码',
      type: 'string',
      required: true,
      defaultValue: 'plain-text',
    } as any);

    const result = validateAutomationScriptDraft(draft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('必须声明 secret: true');
  });

  it('接受复制和移动文件步骤并保留覆盖标记', () => {
    const draft = validDraft();
    draft.kind = 'hybrid';
    draft.steps = [
      { id: 'copy', type: 'file.copy', from: '{{source}}', to: '{{target}}', overwrite: true },
      { id: 'move', type: 'file.move', from: '{{target}}', to: '{{archive}}' },
    ];

    const result = validateAutomationScriptDraft(draft);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toMatchObject([
      { type: 'file.copy', overwrite: true },
      { type: 'file.move' },
    ]);
  });
});
