import { describe, expect, it } from 'vitest';
import { convertRecordedBrowserEvents } from '../src/services/automation-recording.js';

describe('convertRecordedBrowserEvents', () => {
  it('自动加导航步骤并合并连续输入', () => {
    const draft = convertRecordedBrowserEvents('https://example.com/login', [
      {
        type: 'type',
        at: 100,
        target: { by: 'label', label: '用户名' },
        text: 'demo',
      },
      {
        type: 'type',
        at: 300,
        target: { by: 'label', label: '用户名' },
        text: 'demo-user',
      },
      {
        type: 'click',
        at: 600,
        target: { by: 'role', role: 'button', name: '登录' },
      },
    ]);

    expect(draft.steps[0]).toMatchObject({ type: 'browser.navigate', url: 'https://example.com/login' });
    expect(draft.steps[1]).toMatchObject({ type: 'browser.type', text: 'demo-user' });
    expect(draft.steps[2]).toMatchObject({ type: 'browser.click' });
    expect(draft.steps).toHaveLength(3);
  });

  it('Enter 紧跟在输入后时合并为 pressEnter', () => {
    const draft = convertRecordedBrowserEvents('https://example.com', [
      { type: 'type', at: 100, target: { by: 'css', selector: '#q' }, text: '报表' },
      { type: 'key', at: 200, key: 'Enter' },
    ]);

    expect(draft.steps[1]).toMatchObject({ type: 'browser.type', text: '报表', pressEnter: true });
  });

  it('密码字段生成 secret 参数，不保存明文', () => {
    const draft = convertRecordedBrowserEvents('https://example.com', [
      {
        type: 'type',
        at: 100,
        target: { by: 'label', label: '密码' },
        text: 'super-secret',
        sensitive: true,
      },
    ]);

    expect(JSON.stringify(draft)).not.toContain('super-secret');
    expect(draft.params).toContainEqual(expect.objectContaining({
      key: 'secret_1',
      secret: true,
    }));
    expect(draft.steps[1]).toMatchObject({ type: 'browser.type', text: '{{secret_1}}' });
  });

  it('忽略连续重复点击', () => {
    const draft = convertRecordedBrowserEvents('https://example.com', [
      { type: 'click', at: 100, target: { by: 'text', text: '保存' } },
      { type: 'click', at: 180, target: { by: 'text', text: '保存' } },
    ]);

    expect(draft.steps.filter((step) => step.type === 'browser.click')).toHaveLength(1);
  });
});
