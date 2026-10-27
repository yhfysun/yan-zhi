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
  DOUYIN_POST_COMMENT_RECIPE,
  DOUYIN_SET_COVER_RECIPE,
  DOUYIN_INSERT_TOPICS_RECIPE,
  getRecipe,
  listRecipes,
  parseTopicList,
  runRecipe,
  type RecipeApi,
} from './recipes';

interface FakeState {
  pageText: string;
  fillResult?: any;
  clickResult?: (selector: string) => any;
  afterClickText?: string;
  /** 执行 fill_form 时把页面切换成该文本（模拟填写时弹出验证） */
  fillText?: string;
  /** 这些选择器的 fill_form 回「元素未找到」（验证备用选择器回退） */
  failFillSelectors?: string[];
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
      if (action === 'get_visible_text') {
        return { text: state.pageText };
      }
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
        if (state.fillText) state.pageText = state.fillText;
        if (state.fillResult) return state.fillResult;
        const fields = Array.isArray((args as any).fields) ? (args as any).fields : [];
        const failed = fields
          .filter((f: any) => (state.failFillSelectors || []).includes(String(f.selector)))
          .map((f: any) => ({ selector: f.selector, reason: '元素未找到' }));
        return {
          filled: fields.length - failed.length,
          failed,
          state: fields
            .filter((f: any) => !failed.some((x: any) => x.selector === f.selector))
            .map((f: any) => ({ selector: f.selector, value: f.value })),
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

  it('页面出现安全验证 → 返回 blockedByVerification 与续跑步骤（不要求重跑全流程）', async () => {
    const { api } = makeApi({ pageText: '上传成功', afterClickText: '请完成安全验证' });
    const res = await runRecipe(fastSubmitWait(), { ...BASE_PARAMS, submit: true }, api);
    expect(res.ok).toBe(false);
    expect(res.blockedByVerification).toBe(true);
    expect(res.verificationText).toContain('安全验证');
    expect(res.submitted, '发布已点过，续跑不应重复点').toBe(true);
    // 续跑起点必须是"等成功判据"那一步，而不是发布点击那一步
    expect(res.resumeStep).toBeGreaterThan(0);
    expect(res.blockedAtStep).toBe(res.resumeStep);
  });

  it('用户完成验证后带 resumeStep 续跑：不重新导航/上传/填表，直接验证结果', async () => {
    const first = makeApi({ pageText: '上传成功', afterClickText: '请完成安全验证' });
    const blocked = await runRecipe(fastSubmitWait(), { ...BASE_PARAMS, submit: true }, first.api);
    expect(blocked.blockedByVerification).toBe(true);

    // 用户已在浏览器面板完成滑块；页面现在显示发布成功
    const second = makeApi({ pageText: '发布成功' });
    const res = await runRecipe(
      fastSubmitWait(),
      { ...BASE_PARAMS, submit: true },
      second.api,
      { resumeStep: blocked.resumeStep },
    );
    expect(res.ok).toBe(true);
    expect(res.submitted).toBe(true);
    expect(res.verified).toBe(true);
    // 关键：续跑不能重新上传/填表
    expect(second.calls.some((c) => c.action === 'navigate')).toBe(false);
    expect(second.calls.some((c) => c.action === 'upload')).toBe(false);
    expect(second.calls.some((c) => c.action === 'fill_form')).toBe(false);
    expect(res.steps[0].step).toBe('resume');
  });

  it('填写阶段被验证拦住 → resumeStep 指向填写那一步（验证后补填，不重传）', async () => {
    const { api } = makeApi({
      pageText: '上传成功',
      fillText: '请完成安全验证',
      fillResult: { filled: 0, failed: [{ selector: '.zone-container.editor-kit-container', reason: '被验证遮挡' }], state: [] },
    });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, BASE_PARAMS, api);
    expect(res.ok).toBe(false);
    expect(res.blockedByVerification).toBe(true);
    const fillStepIndex = DOUYIN_PUBLISH_RECIPE.steps.findIndex((s) => s.kind === 'fill');
    expect(res.resumeStep).toBe(fillStepIndex);
    expect(res.submitted).toBe(false);
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

describe('④ 评论/封面配方（2026-10-23，替代手工逐页点）', () => {
  it('配方注册表同时暴露发布/封面/评论', () => {
    expect(listRecipes()).toEqual(expect.arrayContaining([
      'douyin-publish-video', 'douyin-set-cover', 'douyin-post-comment',
    ]));
    expect(getRecipe('douyin-post-comment')).toBe(DOUYIN_POST_COMMENT_RECIPE);
    expect(getRecipe('douyin-set-cover')).toBe(DOUYIN_SET_COVER_RECIPE);
  });

  it('评论配方：主选择器漂移时自动回退到备用锚点，仍然只填一次有效值', async () => {
    const { api, calls } = makeApi({
      pageText: '互动评论 有爱评论，说点好听的~ 打开番茄小说搜「骨债阴阳」可直达本书',
      failFillSelectors: ['div[contenteditable="true"][data-placeholder*="有爱评论"]'],
    });
    const res = await runRecipe(DOUYIN_POST_COMMENT_RECIPE, {
      videoTitle: '骨债阴阳·第4集',
      comment: '打开番茄小说搜「骨债阴阳」可直达本书',
    }, api);
    expect(res.ok, JSON.stringify({ err: res.error, steps: res.steps })).toBe(true);
    const fills = calls.filter((c) => c.action === 'fill_form');
    expect(fills.length).toBe(2);
    expect(JSON.stringify(fills[0].args)).toContain('data-placeholder');
    expect(JSON.stringify(fills[1].args)).toContain('div.input-d24X73');
    // 只发一次：发送按钮只点一次，不进入重填循环
    const sends = calls.filter((c) => c.action === 'click' && JSON.stringify(c.args).includes('发送'));
    expect(sends.length).toBe(1);
  });

  it('评论配方：作品标题点不到 → 失败并提示不要重复点发送', async () => {
    const { api, calls } = makeApi({
      pageText: '互动评论',
      clickResult: (sel) => (sel.includes('骨债阴阳') ? { error: 'not found' } : null),
    });
    const res = await runRecipe(DOUYIN_POST_COMMENT_RECIPE, {
      videoTitle: '骨债阴阳·第4集', comment: '打开番茄小说搜「骨债阴阳」',
    }, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('作品列表里没找到该标题');
    expect(calls.some((c) => c.action === 'fill_form')).toBe(false);
  });

  it('封面配方：把 coverPath 投递给上传动作，并走完确定', async () => {
    const { api, calls } = makeApi({ pageText: '上传成功 选择封面' });
    const res = await runRecipe(DOUYIN_SET_COVER_RECIPE, { coverPath: 'C:/covers/e04.jpg' }, api);
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.action === 'upload' && (c.args as any).filePath === 'C:/covers/e04.jpg')).toBe(true);
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('选择封面'))).toBe(true);
  });

  it('封面入口不存在 → 快速失败，并明确「不要重跑发布配方」', async () => {
    const { api, calls } = makeApi({
      pageText: '上传成功',
      clickResult: (sel) => (sel.includes('封面') ? { error: 'not found' } : null),
    });
    const res = await runRecipe(DOUYIN_SET_COVER_RECIPE, { coverPath: 'C:/covers/e04.jpg' }, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('不要重跑发布配方');
    expect(calls.some((c) => c.action === 'upload')).toBe(false);
  });

  it('等待类步骤用廉价可见文本轮询，不再每次整页读取', async () => {
    const { api, calls } = makeApi({ pageText: '上传成功 重新上传' });
    await runRecipe(DOUYIN_PUBLISH_RECIPE, BASE_PARAMS, api);
    expect(calls.some((c) => c.action === 'get_visible_text')).toBe(true);
  });
});

describe('③ 系列任务首集必先建合集（2026-10-23）', () => {
  const SERIES_PARAMS = { ...BASE_PARAMS, collectionName: '骨债阴阳', submit: true };

  it('发布页找不到合集入口 → 停在发布前，绝不静默跳过', async () => {
    const { api, calls } = makeApi({
      pageText: '上传成功 重新上传',
      clickResult: (sel) => (sel.includes('合集') ? { error: 'not found' } : null),
    });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, SERIES_PARAMS, api);
    expect(res.ok).toBe(false);
    expect(res.submitted).toBe(false);
    expect(res.error).toContain('创建新合集');
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('发布'))).toBe(false);
  });

  it('合集名不在列表（还没建）→ 停止，并提示先建合集再发布', async () => {
    const { api, calls } = makeApi({
      pageText: '上传成功 重新上传',
      clickResult: (sel) => (sel.includes('骨债阴阳') ? { error: 'not found' } : null),
    });
    const res = await runRecipe(DOUYIN_PUBLISH_RECIPE, SERIES_PARAMS, api);
    expect(res.ok).toBe(false);
    expect(res.submitted).toBe(false);
    expect(res.error).toContain('创建新合集');
    expect(calls.some((c) => c.action === 'click' && JSON.stringify(c.args).includes('发布'))).toBe(false);
  });

  it('合集选中后正常走到发布（verified=true）', async () => {
    const { api } = makeApi({ pageText: '上传成功 重新上传 骨债阴阳', afterClickText: '发布成功' });
    const res = await runRecipe(fastSubmitWait(), SERIES_PARAMS, api);
    expect(res.ok).toBe(true);
    expect(res.submitted).toBe(true);
    expect(res.verified).toBe(true);
  });
});

describe('⑤ 话题 chip 配方（2026-10-27，替代反复清空重填）', () => {
  function makeTopicApi(scriptResult: any) {
    const calls: Array<{ action: string; args: any }> = [];
    const api: RecipeApi = {
      async navigate(url: string) {
        calls.push({ action: 'navigate', args: { url } });
        return { ok: true };
      },
      async action(action: string, args: Record<string, unknown>) {
        calls.push({ action, args });
        if (action === 'get_page_content' || action === 'get_visible_text') {
          return { text: '', url: 'https://creator.douyin.com/creator-micro/content/post/video?mid=1', title: '', formFields: [] };
        }
        if (action === 'run_script') return { result: JSON.stringify(scriptResult) };
        return {};
      },
    };
    return { api, calls };
  }

  it('话题列表支持 JSON 数组 / 空格 / 逗号 / 顿号，并去掉 # 前缀与重复', () => {
    expect(parseTopicList('["周报","#Excel技巧","周报"]')).toEqual(['周报', 'Excel技巧']);
    expect(parseTopicList('#周报，Excel技巧、职场 打工人')).toEqual(['周报', 'Excel技巧', '职场', '打工人']);
    expect(parseTopicList('')).toEqual([]);
  });

  it('配方已注册', () => {
    expect(listRecipes()).toContain('douyin-insert-topics');
    expect(getRecipe('douyin-insert-topics')).toBe(DOUYIN_INSERT_TOPICS_RECIPE);
  });

  it('一次 run_script 完成：脚本里带话题与下拉选择器，不整段清空', async () => {
    const { api, calls } = makeTopicApi({
      ok: true, added: ['周报', 'Excel技巧'], skipped: [], failed: [], leftover: [], chipCount: 2, chips: ['#周报', '#Excel技巧'],
    });
    const res = await runRecipe(DOUYIN_INSERT_TOPICS_RECIPE, {
      editUrl: 'https://creator.douyin.com/creator-micro/content/post/video?mid=1&enter_from=edit_item',
      topics: '["周报","Excel技巧"]',
    }, api);
    expect(res.ok).toBe(true);
    const scripts = calls.filter((c) => c.action === 'run_script');
    expect(scripts).toHaveLength(1);
    const script = String((scripts[0].args as any).script);
    expect(script).toContain('"周报"');
    expect(script).toContain('mention-suggest');
    expect(script).toContain('data-mention');
    // 只替换目标 token（findRange），不做"整段选中再删"
    expect(script).toContain('findRange');
    expect(script).not.toContain("selectNodeContents(ed); document.execCommand('delete')");
    expect(res.steps.some((s) => s.step === 'insertTopic' && s.ok)).toBe(true);
  });

  it('已有 chip 的话题跳过（幂等提示）', async () => {
    const { api } = makeTopicApi({
      ok: true, added: [], skipped: ['周报'], failed: [], leftover: [], chipCount: 1, chips: ['#周报'],
    });
    const res = await runRecipe(DOUYIN_INSERT_TOPICS_RECIPE, {
      editUrl: 'https://creator.douyin.com/creator-micro/content/post/video?mid=1',
      topics: '周报',
    }, api);
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res.steps)).toContain('跳过 1 个');
  });

  it('下拉未出现/未生成 chip → 立即失败，并明确禁止保存', async () => {
    const { api } = makeTopicApi({
      ok: false, added: [], skipped: [], failed: [{ topic: '周报', reason: '话题联想下拉未出现' }], leftover: [], chipCount: 0, chips: [],
    });
    const res = await runRecipe(DOUYIN_INSERT_TOPICS_RECIPE, {
      editUrl: 'https://creator.douyin.com/creator-micro/content/post/video?mid=1',
      topics: '周报',
    }, api);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('不要点保存');
    expect(res.error).toContain('话题联想下拉未出现');
  });
});
