export type PageAssetStatus = 'draft' | 'active' | 'deprecated';
export type PageAssetScope = 'private' | 'team' | 'public';
export type PageAssetConfirmation = 'none' | 'required';

export type PageAssetJsonValue =
  | string
  | number
  | boolean
  | null
  | PageAssetJsonValue[]
  | { [key: string]: PageAssetJsonValue };

export interface PageAssetJsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  required?: string[];
  properties?: Record<string, PageAssetJsonSchema>;
  items?: PageAssetJsonSchema;
  enum?: PageAssetJsonValue[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

export interface PageAssetRecipeExecutor {
  kind: 'recipe';
  recipeId: string;
  /**
   * Maps operation input to recipe params.
   * Supported references: `$input.field`, `$input.items[0]`, `$input`.
   */
  paramMap?: Record<string, PageAssetJsonValue>;
  /** Optional safety stop for partial test runs. */
  stopBeforeStepId?: string;
}

export interface PageAssetOperation {
  id: string;
  title: string;
  description?: string;
  capability?: string;
  confirmation: PageAssetConfirmation;
  inputSchema?: PageAssetJsonSchema;
  outputSchema?: PageAssetJsonSchema;
  executor: PageAssetRecipeExecutor;
  assertions?: string[];
}

export interface PageAssetMatch {
  hosts: string[];
  routes?: string[];
}

export interface PageAssetHealth {
  successRate?: number;
  runCount?: number;
  successCount?: number;
  failureCount?: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: string;
}

export interface PageAssetSpec {
  apiVersion: 'page-asset/v1';
  kind: 'PageAsset';
  id: string;
  title: string;
  platform: string;
  scope: PageAssetScope;
  status: PageAssetStatus;
  version: number;
  capabilities: string[];
  match: PageAssetMatch;
  operations: PageAssetOperation[];
  instructions?: string[];
  health?: PageAssetHealth;
}

export interface PageAssetRecord extends PageAssetSpec {
  ownerUserId?: string | null;
  source?: 'builtin' | 'user';
  createdAt: number;
  updatedAt: number;
}

export interface PageAssetVersionRecord {
  assetId: string;
  version: number;
  spec: PageAssetSpec;
  contractHash: string;
  changeSummary?: string | null;
  createdBy?: string | null;
  createdAt: number;
}

export interface PageAssetRunResult {
  runId: string;
  assetId: string;
  assetVersion: number;
  operationId: string;
  status: 'success' | 'failed';
  recipeId: string;
  params: Record<string, unknown>;
  result?: unknown;
  errorCode?: string;
  error?: string;
  startedAt: number;
  endedAt: number;
}

export const PAGE_ASSET_CAPABILITIES = {
  publishVideo: 'social.content.publish.video',
  publishNote: 'social.content.publish.note',
  saveDraft: 'social.content.draft.save',
  listContent: 'social.content.list',
  readMetrics: 'social.content.metrics.read',
  createComment: 'social.comment.create',
} as const;
