import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import {
  BUILTIN_PAGE_ASSETS,
  findPageAssetOperation,
  pageAssetHostMatches,
  resolvePageAssetParams,
  selectPageAssets,
  validateJsonSchemaValue,
  validatePageAssetSpec,
  type PageAssetOperation,
  type PageAssetScope,
  type PageAssetSpec,
  type PageAssetStatus,
} from '@yan-zhi/shared';
import {
  PAGE_ASSET_DDL,
  PAGE_ASSET_DRAFT_DDL,
  PAGE_ASSET_RUN_DDL,
  PAGE_ASSET_VERSION_DDL,
} from '@yan-zhi/core';
import { db } from '../db.js';

export interface StoredPageAsset {
  id: string;
  userId: string | null;
  title: string;
  platform: string;
  scope: PageAssetScope;
  status: PageAssetStatus;
  version: number;
  capabilities: string[];
  spec: PageAssetSpec;
  draft: PageAssetDraft | null;
  source: 'builtin' | 'user';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PageAssetDraft {
  spec: PageAssetSpec;
  baseVersion: number;
  version: number;
  contractHash: string;
  createdBy?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PageAssetListOptions {
  query?: string;
  platform?: string;
  status?: PageAssetStatus;
  capability?: string;
  includeDrafts?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PageAssetMutationInput {
  spec: unknown;
  expectedVersion?: number;
  changeSummary?: string;
}

export interface PreparedPageAssetRun {
  asset: StoredPageAsset;
  operation: PageAssetOperation;
  params: Record<string, unknown>;
  recipeId: string;
  recipeParams: Record<string, unknown>;
}

let schemaReady = false;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function pageAssetContractHash(spec: PageAssetSpec): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(spec))).digest('hex');
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToAsset(row: any): StoredPageAsset | null {
  const spec = parseJson<PageAssetSpec | null>(row?.spec_json, null);
  if (!spec || typeof spec !== 'object') return null;
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    title: String(row.title || spec.title || ''),
    platform: String(row.platform || spec.platform || ''),
    scope: String(row.scope || spec.scope || 'private') as PageAssetScope,
    status: String(row.status || spec.status || 'draft') as PageAssetStatus,
    version: Number(row.version || spec.version || 1),
    capabilities: parseJson<string[]>(row.capabilities_json, spec.capabilities || []),
    spec,
    draft: null,
    source: String(row.source || 'user') === 'builtin' ? 'builtin' : 'user',
    enabled: Number(row.enabled ?? 1) !== 0,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function getRow(id: string): any {
  return db.prepare('SELECT * FROM page_asset WHERE id = ?').get(id);
}

function getDraft(assetId: string): PageAssetDraft | null {
  const row = db.prepare('SELECT * FROM page_asset_draft WHERE asset_id = ?').get(assetId) as any;
  if (!row) return null;
  const spec = parseJson<PageAssetSpec | null>(row.spec_json, null);
  if (!spec) return null;
  return {
    spec,
    baseVersion: Number(row.base_version || 1),
    version: Number(row.version || spec.version || 1),
    contractHash: String(row.contract_hash || pageAssetContractHash(spec)),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function withDraft(asset: StoredPageAsset | null): StoredPageAsset | null {
  if (!asset) return null;
  asset.draft = getDraft(asset.id);
  return asset;
}

function insertVersion(input: {
  assetId: string;
  version: number;
  spec: PageAssetSpec;
  createdBy?: string | null;
  changeSummary?: string | null;
  createdAt: number;
}): void {
  db.prepare(
    `INSERT INTO page_asset_version
       (id, asset_id, version, spec_json, contract_hash, change_summary, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id, version) DO NOTHING`,
  ).run(
    uuid(),
    input.assetId,
    input.version,
    JSON.stringify(input.spec),
    pageAssetContractHash(input.spec),
    input.changeSummary || null,
    input.createdBy || null,
    input.createdAt,
  );
}

export function ensurePageAssetsSchema(): void {
  if (schemaReady) return;
  db.exec(PAGE_ASSET_DDL);
  db.exec(PAGE_ASSET_VERSION_DDL);
  db.exec(PAGE_ASSET_DRAFT_DDL);
  db.exec(PAGE_ASSET_RUN_DDL);
  const now = Date.now();
  for (const spec of BUILTIN_PAGE_ASSETS) {
    db.prepare(
      `INSERT INTO page_asset
         (id, user_id, title, platform, scope, status, version, capabilities_json,
          spec_json, source, enabled, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'builtin', 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         platform = excluded.platform,
         scope = excluded.scope,
         status = excluded.status,
         version = excluded.version,
         capabilities_json = excluded.capabilities_json,
         spec_json = excluded.spec_json,
         enabled = 1,
         updated_at = excluded.updated_at`,
    ).run(
      spec.id,
      spec.title,
      spec.platform,
      spec.scope,
      spec.status,
      spec.version,
      JSON.stringify(spec.capabilities),
      JSON.stringify(spec),
      now,
      now,
    );
    insertVersion({
      assetId: spec.id,
      version: spec.version,
      spec,
      createdBy: 'builtin',
      changeSummary: 'builtin seed',
      createdAt: now,
    });
  }
  schemaReady = true;
}

function isVisible(row: any, userId: string): boolean {
  return row.user_id == null || String(row.user_id) === userId || String(row.scope) === 'public';
}

export function listPageAssets(userId: string, opts: PageAssetListOptions = {}): {
  data: StoredPageAsset[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
} {
  ensurePageAssetsSchema();
  const page = Math.max(1, Math.floor(opts.page || 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(opts.pageSize || 50)));
  const query = String(opts.query || '').trim().toLowerCase();
  const platform = String(opts.platform || '').trim().toLowerCase();
  const capability = String(opts.capability || '').trim();
  const rows = (db.prepare(
    'SELECT * FROM page_asset WHERE user_id IS NULL OR user_id = ? OR scope = ? ORDER BY source DESC, updated_at DESC',
  ).all(userId, 'public') as any[])
    .filter((row) => isVisible(row, userId))
    .map((row) => withDraft(rowToAsset(row)))
    .filter((asset): asset is StoredPageAsset => !!asset && asset.enabled)
    .filter((asset) => opts.includeDrafts ? true : asset.status === 'active')
    .filter((asset) =>
      !opts.status
      || asset.status === opts.status
      || (opts.status === 'draft' && !!asset.draft),
    )
    .filter((asset) => !platform || asset.platform.toLowerCase() === platform)
    .filter((asset) => !capability || asset.capabilities.includes(capability))
    .filter((asset) => {
      if (!query) return true;
      return [asset.id, asset.title, asset.platform, asset.capabilities.join(' ')]
        .some((value) => value.toLowerCase().includes(query));
    });
  const totalItems = rows.length;
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

export function getPageAsset(userId: string, reference: string): StoredPageAsset | null {
  ensurePageAssetsSchema();
  const ref = String(reference || '').trim();
  if (!ref) return null;
  const direct = getRow(ref);
  if (direct && isVisible(direct, userId)) return withDraft(rowToAsset(direct));
  const candidates = (db.prepare('SELECT * FROM page_asset WHERE user_id IS NULL OR user_id = ? OR scope = ?').all(userId, 'public') as any[])
    .filter((row) => isVisible(row, userId))
    .map((row) => withDraft(rowToAsset(row)))
    .filter((asset): asset is StoredPageAsset => !!asset && asset.enabled);
  const byTitle = candidates.filter((asset) => asset.title === ref);
  if (byTitle.length === 1) return byTitle[0];
  const byCapability = candidates.filter((asset) => asset.capabilities.includes(ref));
  return byCapability.length === 1 ? byCapability[0] : null;
}

export function resolvePageAssets(
  userId: string,
  selection: { capability?: string; platform?: string; url?: string },
): StoredPageAsset[] {
  ensurePageAssetsSchema();
  const { data } = listPageAssets(userId, {
    capability: selection.capability,
    platform: selection.platform,
    pageSize: 200,
  });
  const specs = data.map((asset) => asset.spec);
  const selectedIds = new Set(selectPageAssets(specs, selection).map((spec) => spec.id));
  return data.filter((asset) => selectedIds.has(asset.id));
}

function requireOwnedUserAsset(userId: string, id: string): StoredPageAsset {
  const asset = getPageAsset(userId, id);
  if (!asset) throw new Error(`PAGE_ASSET_NOT_FOUND: ${id}`);
  if (asset.source === 'builtin' || asset.userId !== userId) {
    throw new Error(`PAGE_ASSET_READ_ONLY: ${id} 是内置或他人资产，请先创建自己的草稿`);
  }
  return asset;
}

function normalizeDraftSpec(spec: PageAssetSpec, userId: string): PageAssetSpec {
  return {
    ...spec,
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    scope: spec.scope === 'public' ? 'private' : (spec.scope || 'private'),
    status: 'draft',
    version: Math.max(1, Math.floor(Number(spec.version) || 1)),
    operations: Array.isArray(spec.operations) ? spec.operations : [],
    capabilities: Array.isArray(spec.capabilities) ? spec.capabilities : [],
    match: {
      hosts: Array.isArray(spec.match?.hosts) ? spec.match.hosts : [],
      routes: Array.isArray(spec.match?.routes) ? spec.match.routes : [],
    },
    instructions: Array.isArray(spec.instructions) ? spec.instructions : [],
  };
}

function saveDraftRow(
  asset: StoredPageAsset,
  spec: PageAssetSpec,
  userId: string,
  changeSummary?: string,
): StoredPageAsset {
  const next = normalizeDraftSpec(spec, userId);
  const validation = validatePageAssetSpec(next, { requireActive: false });
  if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
  const now = Date.now();
  const contractHash = pageAssetContractHash(next);
  db.prepare(
    `INSERT INTO page_asset_draft
       (asset_id, base_version, version, spec_json, contract_hash, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET
       base_version = excluded.base_version,
       version = excluded.version,
       spec_json = excluded.spec_json,
       contract_hash = excluded.contract_hash,
       created_by = excluded.created_by,
       updated_at = excluded.updated_at`,
  ).run(
    asset.id,
    asset.version,
    next.version,
    JSON.stringify(next),
    contractHash,
    userId,
    asset.draft?.createdAt || now,
    now,
  );
  insertVersion({
    assetId: asset.id,
    version: next.version,
    spec: next,
    createdBy: userId,
    changeSummary: changeSummary || `draft from active v${asset.version}`,
    createdAt: now,
  });
  return getPageAsset(userId, asset.id)!;
}

export function createPageAssetDraft(userId: string, input: PageAssetMutationInput): StoredPageAsset {
  ensurePageAssetsSchema();
  const normalized = normalizeDraftSpec(input.spec as PageAssetSpec, userId);
  const existingRow = getRow(normalized.id);
  if (existingRow) {
    const existing = rowToAsset(existingRow);
    if (!existing || existing.source === 'builtin' || existing.userId !== userId) {
      throw new Error(`PAGE_ASSET_ALREADY_EXISTS: ${normalized.id} 是内置或他人资产，请更换 id`);
    }
    if (input.expectedVersion === undefined) {
      throw new Error(`PAGE_ASSET_VERSION_REQUIRED: 已存在资产 ${normalized.id}，创建下一版草稿必须传 expectedVersion`);
    }
    if (existing.status !== 'draft') {
      const workingVersion = existing.draft?.version ?? existing.version;
      if (Number(input.expectedVersion) !== workingVersion) {
        throw new Error(`PAGE_ASSET_VERSION_CONFLICT: expected=${input.expectedVersion} current=${workingVersion}`);
      }
      return saveDraftRow(
        existing,
        {
          ...normalized,
          version: workingVersion + 1,
        },
        userId,
        input.changeSummary || `new draft from active v${existing.version}`,
      );
    }
    if (Number(input.expectedVersion) !== existing.version) {
      throw new Error(`PAGE_ASSET_VERSION_CONFLICT: expected=${input.expectedVersion} current=${existing.version}`);
    }
    const next = normalizeDraftSpec({
      ...normalized,
      version: existing.version + 1,
    }, userId);
    const validation = validatePageAssetSpec(next, { requireActive: false });
    if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
    const now = Date.now();
    db.prepare(
      `UPDATE page_asset
          SET title = ?, platform = ?, scope = ?, status = 'draft', version = ?,
              capabilities_json = ?, spec_json = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      next.title,
      next.platform,
      next.scope,
      next.version,
      JSON.stringify(next.capabilities),
      JSON.stringify(next),
      now,
      normalized.id,
    );
    insertVersion({
      assetId: normalized.id,
      version: next.version,
      spec: next,
      createdBy: userId,
      changeSummary: input.changeSummary || `new draft from v${existing.version}`,
      createdAt: now,
    });
    return getPageAsset(userId, normalized.id)!;
  }
  const validation = validatePageAssetSpec(normalized, { requireActive: false });
  if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
  const now = Date.now();
  db.prepare(
    `INSERT INTO page_asset
       (id, user_id, title, platform, scope, status, version, capabilities_json,
        spec_json, source, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'user', 1, ?, ?)`,
  ).run(
    normalized.id,
    userId,
    normalized.title,
    normalized.platform,
    normalized.scope,
    normalized.version,
    JSON.stringify(normalized.capabilities),
    JSON.stringify(normalized),
    now,
    now,
  );
  insertVersion({
    assetId: normalized.id,
    version: normalized.version,
    spec: normalized,
    createdBy: userId,
    changeSummary: input.changeSummary || 'create draft',
    createdAt: now,
  });
  return getPageAsset(userId, normalized.id)!;
}

export function updatePageAssetDraft(
  userId: string,
  id: string,
  input: PageAssetMutationInput,
): StoredPageAsset {
  ensurePageAssetsSchema();
  const current = requireOwnedUserAsset(userId, id);
  const incoming = input.spec as PageAssetSpec;
  if (incoming.id !== id) throw new Error('PAGE_ASSET_ID_IMMUTABLE');
  if (current.status !== 'draft' || current.draft) {
    const workingVersion = current.draft?.version ?? current.version;
    if (input.expectedVersion !== undefined && Number(input.expectedVersion) !== workingVersion) {
      throw new Error(`PAGE_ASSET_VERSION_CONFLICT: expected=${input.expectedVersion} current=${workingVersion}`);
    }
    return saveDraftRow(
      current,
      { ...incoming, version: workingVersion + 1 },
      userId,
      input.changeSummary || 'update draft',
    );
  }
  if (input.expectedVersion !== undefined && Number(input.expectedVersion) !== current.version) {
    throw new Error(`PAGE_ASSET_VERSION_CONFLICT: expected=${input.expectedVersion} current=${current.version}`);
  }
  const next = normalizeDraftSpec({ ...incoming, version: current.version + 1 }, userId);
  const validation = validatePageAssetSpec(next, { requireActive: false });
  if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
  const now = Date.now();
  db.prepare(
    `UPDATE page_asset
        SET title = ?, platform = ?, scope = ?, status = 'draft', version = ?,
            capabilities_json = ?, spec_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    next.title,
    next.platform,
    next.scope,
    next.version,
    JSON.stringify(next.capabilities),
    JSON.stringify(next),
    now,
    id,
  );
  insertVersion({
    assetId: id,
    version: next.version,
    spec: next,
    createdBy: userId,
    changeSummary: input.changeSummary || 'update draft',
    createdAt: now,
  });
  return getPageAsset(userId, id)!;
}

export function validateStoredPageAsset(userId: string, id: string): {
  ok: boolean;
  errors: string[];
  contractHash: string;
  version: number;
} {
  const asset = getPageAsset(userId, id);
  if (!asset) throw new Error(`PAGE_ASSET_NOT_FOUND: ${id}`);
  const workingSpec = asset.draft?.spec || asset.spec;
  const candidate: PageAssetSpec = { ...workingSpec, status: 'active' };
  const result = validatePageAssetSpec(candidate, { requireActive: true });
  return {
    ok: result.ok,
    errors: result.errors,
    contractHash: pageAssetContractHash(workingSpec),
    version: asset.draft?.version ?? asset.version,
  };
}

export function activatePageAsset(
  userId: string,
  id: string,
  expectedVersion?: number,
  changeSummary?: string,
): StoredPageAsset {
  const current = requireOwnedUserAsset(userId, id);
  const workingVersion = current.draft?.version ?? current.version;
  if (expectedVersion !== undefined && Number(expectedVersion) !== workingVersion) {
    throw new Error(`PAGE_ASSET_VERSION_CONFLICT: expected=${expectedVersion} current=${workingVersion}`);
  }
  const sourceSpec = current.draft?.spec || current.spec;
  const activeSpec: PageAssetSpec = {
    ...sourceSpec,
    status: 'active',
    version: workingVersion + 1,
  };
  const validation = validatePageAssetSpec(activeSpec, { requireActive: true });
  if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `UPDATE page_asset
          SET title = ?, platform = ?, scope = ?, status = 'active', version = ?,
              capabilities_json = ?, spec_json = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      activeSpec.title,
      activeSpec.platform,
      activeSpec.scope,
      activeSpec.version,
      JSON.stringify(activeSpec.capabilities),
      JSON.stringify(activeSpec),
      now,
      id,
    );
    db.prepare('DELETE FROM page_asset_draft WHERE asset_id = ?').run(id);
    insertVersion({
      assetId: id,
      version: activeSpec.version,
      spec: activeSpec,
      createdBy: userId,
      changeSummary: changeSummary || 'activate',
      createdAt: now,
    });
  })();
  return getPageAsset(userId, id)!;
}

export function archivePageAsset(userId: string, id: string): StoredPageAsset {
  const current = requireOwnedUserAsset(userId, id);
  const next: PageAssetSpec = {
    ...current.spec,
    status: 'deprecated',
    version: current.version + 1,
  };
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `UPDATE page_asset SET status = 'deprecated', version = ?, spec_json = ?, updated_at = ? WHERE id = ?`,
    ).run(next.version, JSON.stringify(next), now, id);
    db.prepare('DELETE FROM page_asset_draft WHERE asset_id = ?').run(id);
    insertVersion({
      assetId: id,
      version: next.version,
      spec: next,
      createdBy: userId,
      changeSummary: 'archive',
      createdAt: now,
    });
  })();
  return getPageAsset(userId, id)!;
}

export function preparePageAssetRun(input: {
  userId: string;
  assetId: string;
  operationId: string;
  params?: Record<string, unknown>;
}): PreparedPageAssetRun {
  const asset = getPageAsset(input.userId, input.assetId);
  if (!asset) throw new Error(`PAGE_ASSET_NOT_FOUND: ${input.assetId}`);
  if (asset.status !== 'active') throw new Error(`PAGE_ASSET_NOT_ACTIVE: ${asset.id}`);
  const operation = findPageAssetOperation(asset.spec, input.operationId);
  if (!operation) throw new Error(`PAGE_OPERATION_NOT_FOUND: ${input.operationId}`);
  const params = input.params && typeof input.params === 'object' ? input.params : {};
  const schemaErrors = validateJsonSchemaValue(operation.inputSchema, params, 'input');
  if (schemaErrors.length) throw new Error(`PAGE_OPERATION_PARAM_INVALID: ${schemaErrors.join('; ')}`);
  return {
    asset,
    operation,
    params,
    recipeId: operation.executor.recipeId,
    recipeParams: resolvePageAssetParams(operation.executor.paramMap, params),
  };
}

export function recordPageAssetRun(input: {
  prepared: PreparedPageAssetRun;
  userId: string;
  agentId?: string | null;
  conversationId?: string | null;
  status: 'success' | 'failed';
  result?: unknown;
  errorCode?: string | null;
  error?: string | null;
  startedAt: number;
  endedAt: number;
}): string {
  ensurePageAssetsSchema();
  const runId = `par_${uuid()}`;
  db.prepare(
    `INSERT INTO page_asset_run
       (id, asset_id, asset_version, user_id, agent_id, conversation_id, operation_id,
        status, params_json, result_json, error_code, error, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    input.prepared.asset.id,
    input.prepared.asset.version,
    input.userId,
    input.agentId || null,
    input.conversationId || null,
    input.prepared.operation.id,
    input.status,
    JSON.stringify(input.prepared.params),
    input.result === undefined ? null : JSON.stringify(input.result).slice(0, 24000),
    input.errorCode || null,
    input.error || null,
    input.startedAt,
    input.endedAt,
  );
  const successDelta = input.status === 'success' ? 1 : 0;
  const failureDelta = input.status === 'success' ? 0 : 1;
  const current = getRow(input.prepared.asset.id);
  if (current) {
    const spec = parseJson<PageAssetSpec>(current.spec_json, input.prepared.asset.spec);
    const previous = spec.health || {};
    const runCount = Number(previous.runCount || 0) + 1;
    const successCount = Number(previous.successCount || 0) + successDelta;
    const failureCount = Number(previous.failureCount || 0) + failureDelta;
    spec.health = {
      runCount,
      successCount,
      failureCount,
      successRate: runCount ? successCount / runCount : 0,
      lastRunAt: new Date(input.endedAt).toISOString(),
      ...(input.status === 'success'
        ? { lastSuccessAt: new Date(input.endedAt).toISOString() }
        : { lastErrorCode: input.errorCode || 'PAGE_OPERATION_FAILED' }),
    };
    db.prepare('UPDATE page_asset SET spec_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(spec), Date.now(), input.prepared.asset.id);
  }
  return runId;
}

export function listPageAssetVersions(userId: string, id: string): any[] {
  const asset = getPageAsset(userId, id);
  if (!asset) throw new Error(`PAGE_ASSET_NOT_FOUND: ${id}`);
  return (db.prepare(
    'SELECT version, contract_hash, change_summary, created_by, created_at FROM page_asset_version WHERE asset_id = ? ORDER BY version DESC',
  ).all(id) as any[]).map((row) => ({
    version: row.version,
    contractHash: row.contract_hash,
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export function probePageAsset(
  userId: string,
  id: string,
  operationId?: string,
  params: Record<string, unknown> = {},
  url?: string,
): Record<string, unknown> {
  const asset = getPageAsset(userId, id);
  if (!asset) throw new Error(`PAGE_ASSET_NOT_FOUND: ${id}`);
  const workingSpec = asset.draft?.spec || asset.spec;
  const operation = operationId ? findPageAssetOperation(workingSpec, operationId) : undefined;
  if (operationId && !operation) throw new Error(`PAGE_OPERATION_NOT_FOUND: ${operationId}`);
  const schemaErrors = operation
    ? validateJsonSchemaValue(operation.inputSchema, params, 'input')
    : [];
  return {
    assetId: asset.id,
    assetVersion: workingSpec.version,
    activeVersion: asset.version,
    draftVersion: asset.draft?.version ?? null,
    status: asset.status,
    active: asset.status === 'active',
    operationId: operation?.id || null,
    operationIds: workingSpec.operations.map((item) => item.id),
    capability: operation?.capability || null,
    confirmation: operation?.confirmation || null,
    inputValid: schemaErrors.length === 0,
    inputErrors: schemaErrors,
    hostMatches: url ? pageAssetHostMatches(workingSpec, url) : null,
    recipeId: operation?.executor.recipeId || null,
    recipeParams: operation ? resolvePageAssetParams(operation.executor.paramMap, params) : null,
  };
}

export function rollbackPageAssetDraft(
  userId: string,
  id: string,
  targetVersion: number,
): StoredPageAsset {
  const current = requireOwnedUserAsset(userId, id);
  const row = db.prepare(
    'SELECT spec_json FROM page_asset_version WHERE asset_id = ? AND version = ?',
  ).get(id, targetVersion) as any;
  if (!row) throw new Error(`PAGE_ASSET_VERSION_NOT_FOUND: ${id}@${targetVersion}`);
  const targetSpec = parseJson<PageAssetSpec | null>(row.spec_json, null);
  if (!targetSpec) throw new Error(`PAGE_ASSET_VERSION_INVALID: ${id}@${targetVersion}`);
  if (current.status !== 'draft' || current.draft) {
    const workingVersion = Math.max(current.version, current.draft?.version || 0);
    return saveDraftRow(
      current,
      { ...targetSpec, id, version: workingVersion + 1 },
      userId,
      `rollback to v${targetVersion}`,
    );
  }
  const next = normalizeDraftSpec({
    ...targetSpec,
    id,
    version: current.version + 1,
  }, userId);
  const validation = validatePageAssetSpec(next, { requireActive: false });
  if (!validation.ok) throw new Error(`PAGE_ASSET_INVALID: ${validation.errors.join('; ')}`);
  const now = Date.now();
  db.prepare(
    `UPDATE page_asset
        SET title = ?, platform = ?, scope = ?, status = 'draft', version = ?,
            capabilities_json = ?, spec_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    next.title,
    next.platform,
    next.scope,
    next.version,
    JSON.stringify(next.capabilities),
    JSON.stringify(next),
    now,
    id,
  );
  insertVersion({
    assetId: id,
    version: next.version,
    spec: next,
    createdBy: userId,
    changeSummary: `rollback to v${targetVersion}`,
    createdAt: now,
  });
  return getPageAsset(userId, id)!;
}
