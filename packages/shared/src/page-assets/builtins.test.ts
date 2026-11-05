import { describe, expect, it } from 'vitest';
import { BUILTIN_PAGE_ASSETS } from './builtins';
import { validatePageAssetSpec } from './validate';

describe('BUILTIN_PAGE_ASSETS', () => {
  it('only ships validated assets and keeps XHS as a disabled draft', () => {
    for (const asset of BUILTIN_PAGE_ASSETS) {
      const result = validatePageAssetSpec(asset, { requireActive: false });
      expect(result.ok, `${asset.id}: ${result.ok ? '' : result.errors.join('; ')}`).toBe(true);
    }
    const xhs = BUILTIN_PAGE_ASSETS.find((asset) => asset.platform === 'xiaohongshu');
    expect(xhs?.status).toBe('draft');
    expect(xhs?.operations).toEqual([]);
    expect(xhs?.instructions?.join('\n')).toContain('风控');
  });

  it('exposes the same publish capability for Douyin and Kuaishou', () => {
    const douyin = BUILTIN_PAGE_ASSETS.find((asset) => asset.platform === 'douyin')!;
    const kuaishou = BUILTIN_PAGE_ASSETS.find((asset) => asset.platform === 'kuaishou')!;
    const capability = 'social.content.publish.video';
    expect(douyin.capabilities).toContain(capability);
    expect(kuaishou.capabilities).toContain(capability);
    expect(douyin.operations.find((op) => op.capability === capability)?.executor.recipeId)
      .toBe('douyin-publish-video');
    expect(kuaishou.operations.find((op) => op.capability === capability)?.executor.recipeId)
      .toBe('kuaishou-publish-video');
  });

  it('keeps Douyin preparation and current-page submission as separate operations', () => {
    const douyin = BUILTIN_PAGE_ASSETS.find((asset) => asset.platform === 'douyin')!;
    const submit = douyin.operations.find((op) => op.id === 'submit-current');
    expect(submit?.executor.recipeId).toBe('douyin-submit-current');
    expect(submit?.executor.paramMap).toEqual({ submit: true });
    expect(submit?.inputSchema?.properties).toEqual({});
  });
});
