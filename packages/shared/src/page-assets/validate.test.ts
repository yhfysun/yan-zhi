import { describe, expect, it } from 'vitest';
import { validatePageAssetSpec } from './validate';

function baseSpec() {
  return {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: 'social.douyin.creator',
    title: '抖音创作者中心',
    platform: 'douyin',
    scope: 'public',
    status: 'active',
    version: 1,
    capabilities: ['social.content.publish.video'],
    match: {
      hosts: ['creator.douyin.com'],
      routes: ['/creator-micro/content/upload'],
    },
    operations: [
      {
        id: 'publish-video',
        title: '发布视频',
        capability: 'social.content.publish.video',
        confirmation: 'required',
        inputSchema: {
          type: 'object',
          required: ['mediaPaths', 'title'],
          properties: {
            mediaPaths: { type: 'array' },
            title: { type: 'string', minLength: 1 },
          },
        },
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-publish-video',
          paramMap: {
            videoPath: '$input.mediaPaths[0]',
            title: '$input.title',
          },
        },
      },
    ],
  };
}

describe('validatePageAssetSpec', () => {
  it('accepts a valid recipe-backed page asset', () => {
    const result = validatePageAssetSpec(baseSpec());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.id).toBe('social.douyin.creator');
  });

  it('rejects duplicate capability and operation ids', () => {
    const spec = baseSpec();
    spec.operations.push({ ...spec.operations[0] });
    spec.capabilities.push('social.content.publish.video');
    const result = validatePageAssetSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('capabilities 不能重复');
      expect(result.errors.join('\n')).toContain('operations.id 不能重复');
    }
  });

  it('rejects unsafe hosts and missing recipe ids', () => {
    const spec = baseSpec();
    spec.match.hosts = ['*'];
    spec.operations[0].executor.recipeId = '';
    const result = validatePageAssetSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('hosts 不允许通配');
      expect(result.errors.join('\n')).toContain('executor.recipeId 必填');
    }
  });

  it('requires an input schema when executor has a param map', () => {
    const spec = baseSpec();
    delete (spec.operations[0] as any).inputSchema;
    const result = validatePageAssetSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('inputSchema 必填');
  });

  it('allows draft assets but blocks activating them without operations', () => {
    const spec = baseSpec();
    spec.operations = [];
    expect(validatePageAssetSpec(spec, { requireActive: false }).ok).toBe(true);
    const result = validatePageAssetSpec(spec, { requireActive: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('active 资产至少需要 1 个 operation');
  });
});
