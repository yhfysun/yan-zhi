/**
 * 站点配方执行器行为测试（2026-10-19，P1）
 *
 * 锁三件事：
 *   ① 配方按固定步骤执行，模型不需要在页面上反复试错；
 *   ② 填表失败/安全验证时**立即停止**，不会继续点发布；
 *   ③ submit=false 时只做前置步骤，绝不误发布。
 */
import { describe, it, expect } from 'vitest';
import {
  DOUYIN_PUBLISH_RECIPE,
  getRecipe,
  listRecipes,
  runRecipe,
  type RecipeApi,
} from './recipes';

interface FakeState {
  pageText: string;
  fillResult?: any;
  clickResult?: (selector: string) => any;
  afterClickText?: string;
}

function makeApi(state: FakeState) {
  const calls: Array<{ action: string; args: any }> = [];
  const api: RecipeApi = {
    async navigate(url: string) {
      calls.push({ action: 'navigate', args: { url } });
      return { ok: true };
    },
    async action(action: string, args: Record<string, unknown>) {
      calls.push({ action, args });
      if (action === 'get_page_content') {
        return {
          text: state.pageText,
          url: 'https://creator.douyin.com/creator-micro/content/upload',
          title: '抖音创作者中心',
          formFields: [],
        };
      }
      if (action === 'upload') return { via: 'filechooser' };
      if (action === 'fill_form') {
        if (state.fillResult) return state.fillResult;
        const fields = Array.isArray((args as any).fields) ? (args as any).fields : [];
        return {
          filled: fields.length,
          failed: [],
          state: fields.map((f: any) => ({ selector: f.selector, value: f.value })),
        };
      }
      if (action === 'click') {
        const custom = state.clickResult?.(String((args as any).selector || ''));
        if (custom) return custom;
        const sel = String((args as any).selector || '');
        if ((args as any).index != null) {
          if (state.afterClickText) state.pageText = state.afterClickText;
          return { success: true, clicked: (args as any).index };
        }
        if (sel.includes('发布')) {
          if (state.afterClickText) state.pageText = state.afterClickText;
          return { success: true };
        }
        return { success: true };
      }
      return { ok: true };
    },
  };
  return { api, calls };
}

const BASE_PARAMS = {
  videoPath: 'C:/novels/骨债阴阳_第4集.mp4',
  title: '骨债阴阳·第4集｜师父递的黑茶，喝下去才算入门',
  description: '拜师那天，师父递给我一杯黑茶……打开番茄小说搜「骨债阴阳」看全文。#番茄小说',
};

/** 生产配方等成功判据 90s；测试里缩到 20ms，避免用例等满超时 */
function fastSubmitWait(recipe: typeof DOUYIN_PUBLISH_RECIPE = DOUYIN_PUBLISH_RECIPE) {
  return {
    ...recipe,
    steps: recipe.steps.map((s) =>
      s.kind === 'waitText' && s.when === 'submit' ? { ...s, timeoutMs: 20 } : s,
    ),
  };
}

describe('① 配方注册表', () => {
  it('抖音发布配方可枚举、必填参数齐全', () => {
    expect(listRecipes()).toContain('douyin-publish-video');
    const r = getRecipe('douyin-publish-video')!;
    expect(r).toBe(DOUYIN_PUBLISH_RECIPE);
    expect(r.params.videoPath.required).toBe(true);
    expect(r.params.title.required).toBe(true);
    expect(r.params.description.required).toBe(true);
    expect(r.params.submit.type).toBe('boolean');
  });

  it('填表锚点包含标题与 Draft.js 描述框', () => {
    const fill = DOUYIN_PUBLISH_RECIPE.steps.find((s) => s.kind === 'fill')!;
    const sels = fill.kind === 'fill' ? fill.fields.map((f) => f.selector) : [];
    expect(sels).toContain('input[placeholder*="填写作品标题"]');
    expect(sels).toContain('.zone-container.editor-kit-container');
  });
});

describe('② 执行流程', () => {
  it('submit=false：完成上传+填表，但不点发布，返回 readyToSubmit', async () => {
    const { api, calls } = makeApi({ pageText: '上传成功 重新上传' });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, BASE_PARAMS, api);
    expect(res.ok).toBe(true);
    expect(res.submitted).toBe(false);
    expect(res.readyToSubmit).toBe(true);
    expect(calls.some((c) => c.action === 'navigate')).toBe(true);
    expect(calls.some((c) => c.action === 'upload')).toBe(true);
    expect(calls.some((c) => c.action === 'fill_form')).toBe(true);
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('发布'))).toBe(false);
  });

  it('submit=true：点发布并在页面出现成功判据时 verified=true', async () => {
    const { api, calls } = makeApi({ pageText: '上传成功 重新上传', afterClickText: '发布成功' });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(true);
    expect(res.submitted).toBe(true);
    expect(res.verified).toBe(true);
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('发布'))).toBe(true);
  });

  it('点发布后没有成功判据：不谎报成功（verified=false）', async () => {
    const { api } = makeApi({ pageText: '上传成功 重新上传' });
    const res = await runRecipe(fastSubmitWait(), { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(true);
    expect(res.submitted).toBe(true);
    expect(res.verified).toBe(false);
  });

  it('填表失败 → 立即停止，不进入点发布', async () => {
    const { api, calls } = makeApi({
      pageText: '上传成功',
      fillResult: { filled: 1, failed: [{ selector: '.zone-container.editor-kit-container', reason: '富文本值未生效' }], state: [] },
    });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('填写失败');
    expect(res.submitted).toBe(false);
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('发布'))).toBe(false);
  });

  it('回读值不匹配 → 失败（不因"填过"就放行）', async () => {
    const { api } = makeApi({
      pageText: '上传成功',
      fillResult: {
        filled: 2,
        failed: [],
        state: [{ selector: 'input[placeholder*="填写作品标题"]', value: '' }],
      },
    });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, BASE_PARAMS, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('回读核验未通过');
  });

  it('点击歧义时按"精确文本"选候选，而不是盲点最后一个', async () => {
    const { api, calls } = makeApi({
      pageText: '上传成功',
      clickResult: (sel) => {
        if (!sel.includes('发布')) return null;
        return {
          ambiguous: true,
          candidates: [
            { index: 11, tag: 'div', text: '发布设置' },
            { index: 12, tag: 'button', text: '发布' },
          ],
        };
      },
    });
    const res = await runRecipe(fastSubmitWait(), { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(true);
    const indexed = calls.filter((c) => c.action === 'click' && (c.args as any).index != null);
    expect(indexed.map((c) => (c.args as any).index)).toContain(12);
  });

  it('页面出现安全验证 → 失败并要求用户处理', async () => {
    const { api } = makeApi({ pageText: '上传成功', afterClickText: '请完成安全验证' });
    const res = await runRecipe(fastSubmitWait(), { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('安全验证');
  });

  it('上传迟迟不成功 → 失败并返回现场（不会继续填表）', async () => {
    const recipe = {
      ...DOUYIN_PUBLISH_RECIPE,
      steps: DOUYIN_PUBLISH_RECIPE.steps.map((s) =>
        s.kind === 'upload' ? { ...s, timeoutMs: 10 } : s,
      ),
    };
    const { api, calls } = makeApi({ pageText: '上传中 剩余时间 10s' });
    const res = await runRecipe(recipe, BASE_PARAMS, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未出现成功标志');
    expect(calls.some((c) => c.action === 'fill_form')).toBe(false);
  });
});
