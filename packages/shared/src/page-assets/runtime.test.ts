import { describe, expect, it } from 'vitest';
import { BUILTIN_PAGE_ASSETS } from './builtins';
import {
  matchPageAssetUrl,
  resolvePageAssetParams,
  selectPageAssets,
} from './runtime';

describe('page asset runtime helpers', () => {
  it('resolves nested input references inside recipe param maps', () => {
    expect(resolvePageAssetParams({
      videoPath: '$input.mediaPaths[0]',
      title: '$input.content.title',
      submit: '$input.submit',
      fallback: 'literal',
    }, {
      mediaPaths: ['C:/video.mp4'],
      content: { title: '测试标题' },
      submit: true,
    })).toEqual({
      videoPath: 'C:/video.mp4',
      title: '测试标题',
      submit: true,
      fallback: 'literal',
    });
  });

  it('returns undefined for missing references instead of stringifying them', () => {
    expect(resolvePageAssetParams({ title: '$input.title' }, {})).toEqual({ title: undefined });
  });

  it('selects active assets by capability and platform', () => {
    const hits = selectPageAssets(BUILTIN_PAGE_ASSETS, {
      capability: 'social.content.publish.video',
      platform: 'kuaishou',
    });
    expect(hits.map((asset) => asset.id)).toEqual(['social.kuaishou.creator']);
  });

  it('matches exact hosts and subdomains only', () => {
    const douyin = BUILTIN_PAGE_ASSETS.find((asset) => asset.platform === 'douyin')!;
    expect(matchPageAssetUrl(douyin, 'https://creator.douyin.com/creator-micro/content/upload')).toBe(true);
    expect(matchPageAssetUrl(douyin, 'https://evil-creator.douyin.com/creator-micro/content/upload')).toBe(false);
    expect(matchPageAssetUrl(douyin, 'https://example.com/creator-micro/content/upload')).toBe(false);
  });
});
