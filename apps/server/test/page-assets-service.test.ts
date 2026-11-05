import { afterEach, describe, expect, it } from 'vitest';
import {
  activatePageAsset,
  createPageAssetDraft,
  ensurePageAssetsSchema,
  getPageAsset,
  listPageAssets,
  preparePageAssetRun,
  rollbackPageAssetDraft,
  updatePageAssetDraft,
} from '../src/services/page-assets.js';
import { db } from '../src/db.js';

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `page_asset_test_${suffix}`;
const assetId = `test.page.${suffix}`;

function spec(title: string) {
  return {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: assetId,
    title,
    platform: 'test',
    scope: 'private',
    status: 'draft',
    version: 1,
    capabilities: ['test.page.run'],
    match: { hosts: ['example.com'], routes: ['/publish'] },
    operations: [{
      id: 'run',
      title: 'Run',
      capability: 'test.page.run',
      confirmation: 'none',
      inputSchema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
      executor: {
        kind: 'recipe',
        recipeId: 'form-fill',
        paramMap: { value: '$input.value' },
      },
    }],
  } as const;
}

afterEach(() => {
  db.prepare('DELETE FROM page_asset_run WHERE asset_id = ?').run(assetId);
  db.prepare('DELETE FROM page_asset_version WHERE asset_id = ?').run(assetId);
  db.prepare('DELETE FROM page_asset_draft WHERE asset_id = ?').run(assetId);
  db.prepare('DELETE FROM page_asset WHERE id = ?').run(assetId);
});

describe('page asset active/draft dual-track service', () => {
  it('keeps active online while editing and promoting a draft', () => {
    ensurePageAssetsSchema();

    createPageAssetDraft(userId, {
      spec: spec('Active title'),
      changeSummary: 'create',
    });
    activatePageAsset(userId, assetId, 1, 'activate initial');

    const withDraft = createPageAssetDraft(userId, {
      spec: spec('Next title'),
      expectedVersion: 2,
      changeSummary: 'next',
    });
    expect(withDraft.status).toBe('active');
    expect(withDraft.version).toBe(2);
    expect(withDraft.spec.title).toBe('Active title');
    expect(withDraft.draft?.version).toBe(3);
    expect(withDraft.draft?.spec.title).toBe('Next title');

    const draftRows = listPageAssets(userId, {
      includeDrafts: true,
      status: 'draft',
      pageSize: 200,
    });
    expect(draftRows.data.some((asset) => asset.id === assetId)).toBe(true);

    const updated = updatePageAssetDraft(userId, assetId, {
      spec: spec('Edited title'),
      expectedVersion: 3,
      changeSummary: 'edit',
    });
    expect(updated.status).toBe('active');
    expect(updated.version).toBe(2);
    expect(updated.draft?.version).toBe(4);

    const promoted = activatePageAsset(userId, assetId, 4, 'promote');
    expect(promoted.status).toBe('active');
    expect(promoted.version).toBe(5);
    expect(promoted.spec.title).toBe('Edited title');
    expect(promoted.draft).toBeNull();

    const rolledBack = rollbackPageAssetDraft(userId, assetId, 1);
    expect(rolledBack.status).toBe('active');
    expect(rolledBack.version).toBe(5);
    expect(rolledBack.spec.title).toBe('Edited title');
    expect(rolledBack.draft?.version).toBe(6);
    expect(rolledBack.draft?.spec.title).toBe('Active title');

    const prepared = preparePageAssetRun({
      userId,
      assetId,
      operationId: 'run',
      params: { value: 'ready' },
    });
    expect(prepared.asset.version).toBe(5);
    expect(prepared.recipeId).toBe('form-fill');
    expect(getPageAsset(userId, assetId)?.spec.title).toBe('Edited title');
  });
});
