/**
 * 通用填表配方 form-fill 的真跑测试（2026-10-24，P2-2）。
 *
 * 为什么值得真跑：这条配方的价值全在"模型只出一轮、重试在代码里"，
 * 如果字段解析或提交分支写错，模型会以为一次就完成了 —— 比逐字段试错还危险。
 */
import { describe, it, expect } from 'vitest';
import { runRecipe, FORM_FILL_RECIPE } from '../../../packages/core/src/tool/builtin/browser/recipes.js';

function makeApi() {
  const calls: Array<{ name: string; args: any }> = [];
  const api = {
    navigate: async () => ({}),
    action: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === 'fill_form') {
        const fields = (args.fields || []) as any[];
        return {
          filled: fields.length,
          fields: fields.map((f) => f.selector),
          failed: [],
          deferred: [],
          skipped: [],
          state: fields.map((f) => ({ selector: f.selector, value: f.value })),
        };
      }
      if (name === 'click') return { status: 'ok' };
      if (name === 'get_visible_text') return { text: '' };
      if (name === 'get_page_content') return { text: '', url: 'https://example.com', title: 't' };
      return {};
    },
  };
  return { api, calls };
}

describe('form-fill 配方（通用批量填表）', () => {
  it('首选选择器未命中 → 自动换备用选择器重试（模型不用管）', async () => {
    // 第一轮 #desc 报"元素未找到"，第二轮应改用 selectors 里的备用选择器
    const calls: Array<{ name: string; args: any }> = [];
    const api = {
      navigate: async () => ({}),
      action: async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === 'fill_form') {
          const fields = (args.fields || []) as any[];
          const missing = fields.some((f) => f.selector === '#desc');
          return {
            filled: missing ? fields.length - 1 : fields.length,
            fields: fields.map((f) => f.selector),
            failed: missing ? [{ selector: '#desc', reason: '元素未找到' }] : [],
            deferred: [],
            skipped: [],
            state: fields.filter((f) => !(missing && f.selector === '#desc'))
              .map((f) => ({ selector: f.selector, value: f.value })),
          };
        }
        if (name === 'get_visible_text') return { text: '' };
        return {};
      },
    };
    const fields = JSON.stringify([
      { selector: '#title', value: '标题' },
      { selector: '#desc', selectors: ['textarea[name=desc]'], value: '描述' },
    ]);

    const r = await runRecipe(FORM_FILL_RECIPE, { fields }, api as any);

    expect(r.ok, JSON.stringify(r)).toBe(true);
    const fills = calls.filter((c) => c.name === 'fill_form');
    expect(fills.length, '没有发生第二轮重试').toBe(2);
    expect(fills[1].args.fields[1].selector).toBe('textarea[name=desc]');
  });

  it('submit=true + submitText → 填完点该按钮', async () => {
    const { api, calls } = makeApi();
    const fields = JSON.stringify([{ selector: '#a', value: '1' }]);

    const r = await runRecipe(FORM_FILL_RECIPE, { fields, submit: true, submitText: '保存' }, api as any);

    expect(r.ok, JSON.stringify(r)).toBe(true);
    const click = calls.find((c) => c.name === 'click');
    expect(click, 'submit=true 但没有点提交按钮').toBeTruthy();
    expect(String(click!.args.selector)).toContain('保存');
    expect(r.submitted).toBe(true);
  });

  it('submit 未传 → 只填不点（发布类动作不得被默认触发）', async () => {
    const { api, calls } = makeApi();
    const r = await runRecipe(FORM_FILL_RECIPE, { fields: JSON.stringify([{ selector: '#a', value: '1' }]) }, api as any);

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(calls.some((c) => c.name === 'click')).toBe(false);
  });

  it('字段 JSON 非法 → 明确报错且不提交', async () => {
    const { api, calls } = makeApi();
    const r = await runRecipe(FORM_FILL_RECIPE, { fields: '{不是数组}', submit: true, submitText: '保存' }, api as any);

    expect(r.ok).toBe(false);
    expect(String(r.error || '')).toMatch(/fields|JSON|数组/);
    expect(calls.some((c) => c.name === 'fill_form')).toBe(false);
    expect(calls.some((c) => c.name === 'click')).toBe(false);
  });
});
