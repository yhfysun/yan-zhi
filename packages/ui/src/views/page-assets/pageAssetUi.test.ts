import { describe, expect, it } from 'vitest';
import {
  clonePageAssetSpec,
  copyPageAssetSpec,
  createBlankPageAssetSpec,
  parsePageAssetSpecJson,
  pageAssetStatusMeta,
} from './pageAssetUi';

describe('page asset UI helpers', () => {
  it('creates an editable blank draft with a stable default shape', () => {
    const spec = createBlankPageAssetSpec();
    expect(spec.apiVersion).toBe('page-asset/v1');
    expect(spec.kind).toBe('PageAsset');
    expect(spec.status).toBe('draft');
    expect(spec.version).toBe(1);
    expect(spec.operations).toEqual([]);
  });

  it('clones a builtin into a private draft without colliding on id', () => {
    const cloned = clonePageAssetSpec({
      ...createBlankPageAssetSpec(),
      id: 'social.douyin.creator',
      title: '抖音创作者中心',
      status: 'active',
      scope: 'public',
    });
    expect(cloned.id).toBe('social.douyin.creator.copy');
    expect(cloned.title).toContain('副本');
    expect(cloned.status).toBe('draft');
    expect(cloned.scope).toBe('private');
    expect(cloned.version).toBe(1);
  });

  it('copies only PageAssetSpec fields from a detail view', () => {
    const spec = {
      ...createBlankPageAssetSpec(),
      ownerUserId: 'user-a',
      source: 'user',
      draft: { version: 4 },
    } as any;
    const copied = copyPageAssetSpec(spec);
    expect(copied.id).toBe(spec.id);
    expect((copied as any).ownerUserId).toBeUndefined();
    expect((copied as any).source).toBeUndefined();
    expect((copied as any).draft).toBeUndefined();
  });

  it('parses JSON only when the result is an object with a PageAsset id', () => {
    expect(parsePageAssetSpecJson(JSON.stringify(createBlankPageAssetSpec())).ok).toBe(true);
    expect(parsePageAssetSpecJson('[]').ok).toBe(false);
    expect(parsePageAssetSpecJson('{bad json').ok).toBe(false);
  });

  it('maps status to explicit label and tag type', () => {
    expect(pageAssetStatusMeta('active')).toMatchObject({ label: '已启用', type: 'success' });
    expect(pageAssetStatusMeta('draft')).toMatchObject({ label: '草稿', type: 'warning' });
    expect(pageAssetStatusMeta('deprecated')).toMatchObject({ label: '已停用', type: 'info' });
  });
});
