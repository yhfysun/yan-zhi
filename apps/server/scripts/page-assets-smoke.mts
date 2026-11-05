import {
  activatePageAsset,
  createPageAssetDraft,
  ensurePageAssetsSchema,
  getPageAsset,
  listPageAssets,
  preparePageAssetRun,
  probePageAsset,
  rollbackPageAssetDraft,
} from '../src/services/page-assets.ts';
import { executeApiTool } from '../src/mcp/api-tool-executor.ts';

ensurePageAssetsSchema();

const before = listPageAssets('guest', { includeDrafts: true, pageSize: 200 });
console.log('seeded', before.data.map((asset) => `${asset.id}:${asset.status}`).join(','));

const spec = {
  apiVersion: 'page-asset/v1',
  kind: 'PageAsset',
  id: 'smoke.test.page',
  title: 'Smoke Page',
  platform: 'test',
  scope: 'private',
  status: 'draft',
  version: 1,
  capabilities: ['social.content.list'],
  match: { hosts: ['example.com'], routes: ['/'] },
  operations: [{
    id: 'ping',
    title: 'Ping',
    confirmation: 'required',
    inputSchema: { type: 'object', properties: {} },
    executor: { kind: 'recipe', recipeId: 'form-fill' },
  }],
} as const;

const created = createPageAssetDraft('guest', { spec, changeSummary: 'smoke' });
const active = activatePageAsset('guest', created.id, created.version, 'smoke activate');
const loaded = getPageAsset('guest', 'smoke.test.page');
console.log('created', active.id, active.status, active.version);
console.log('loaded', loaded?.id, loaded?.status);

const nextDraft = createPageAssetDraft('guest', {
  spec: { ...spec, title: 'Smoke Page v2' },
  expectedVersion: active.version,
  changeSummary: 'next draft while active stays live',
});
console.log(
  'dual-track',
  nextDraft.status,
  nextDraft.version,
  nextDraft.draft?.version,
  nextDraft.spec.title,
  nextDraft.draft?.spec.title,
);
if (nextDraft.status !== 'active' || nextDraft.draft?.spec.title !== 'Smoke Page v2') {
  throw new Error('active/draft dual-track failed');
}
const draftFiltered = listPageAssets('guest', {
  includeDrafts: true,
  status: 'draft',
  pageSize: 200,
});
if (!draftFiltered.data.some((asset) => asset.id === nextDraft.id)) {
  throw new Error('draft status filter must include active assets with a pending draft');
}

const promoted = activatePageAsset(
  'guest',
  nextDraft.id,
  nextDraft.draft!.version,
  'promote draft',
);
console.log('promoted', promoted.status, promoted.version, promoted.draft?.version ?? 'none');

const prepared = preparePageAssetRun({
  userId: 'guest',
  assetId: 'social.douyin.creator',
  operationId: 'publish-video',
  params: {
    mediaPaths: ['C:/media/video.mp4'],
    title: 'Smoke title',
    body: 'Smoke body',
    submit: false,
  },
});
console.log('prepared', prepared.recipeId, JSON.stringify(prepared.recipeParams));

const listTool = await executeApiTool('api_page_asset_list', { includeDrafts: true }, 'guest');
console.log('api-tool', listTool.isError ? 'error' : 'ok', listTool.content[0]?.text?.slice(0, 120));

const probe = probePageAsset('guest', 'social.douyin.creator', 'publish-video', {
  mediaPaths: ['C:/media/video.mp4'],
  title: 'Smoke title',
  body: 'Smoke body',
}, 'https://creator.douyin.com/creator-micro/content/upload');
console.log('probe', probe.inputValid, probe.hostMatches, probe.recipeId);
const draftProbe = probePageAsset(
  'guest',
  'social.xiaohongshu.creator',
  undefined,
  {},
  'https://creator.xiaohongshu.com/publish/publish',
);
console.log('draft-probe', draftProbe.status, draftProbe.hostMatches);

const rollback = rollbackPageAssetDraft('guest', active.id, 1);
console.log('rollback-draft', rollback.status, rollback.version, rollback.draft?.version);
if (rollback.status !== 'active' || rollback.version !== 4 || rollback.draft?.version !== 5) {
  throw new Error('rollback must create a draft without taking active offline');
}

process.exit(0);
