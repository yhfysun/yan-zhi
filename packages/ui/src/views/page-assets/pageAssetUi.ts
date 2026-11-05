import type { PageAssetSpec, PageAssetStatus } from '@yan-zhi/shared';

export function copyPageAssetSpec(spec: PageAssetSpec): PageAssetSpec {
  return JSON.parse(JSON.stringify({
    apiVersion: spec.apiVersion,
    kind: spec.kind,
    id: spec.id,
    title: spec.title,
    platform: spec.platform,
    scope: spec.scope,
    status: spec.status,
    version: spec.version,
    capabilities: spec.capabilities,
    match: spec.match,
    operations: spec.operations,
    instructions: spec.instructions,
    health: spec.health,
  })) as PageAssetSpec;
}

export function createBlankPageAssetSpec(): PageAssetSpec {
  return {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: 'social.new.page',
    title: '新页面资产',
    platform: 'douyin',
    scope: 'private',
    status: 'draft',
    version: 1,
    capabilities: [],
    match: {
      hosts: ['example.com'],
      routes: ['/'],
    },
    instructions: [],
    operations: [],
  };
}

export function clonePageAssetSpec(spec: PageAssetSpec): PageAssetSpec {
  const cloned = copyPageAssetSpec(spec);
  return {
    ...cloned,
    id: `${cloned.id}.copy`,
    title: `${cloned.title} 副本`,
    scope: 'private',
    status: 'draft',
    version: 1,
    health: undefined,
  };
}

export function parsePageAssetSpecJson(
  value: string,
): { ok: true; spec: PageAssetSpec } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'JSON 根节点必须是对象' };
    }
    if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
      return { ok: false, error: '缺少稳定的资产 id' };
    }
    return { ok: true, spec: parsed as PageAssetSpec };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function pageAssetStatusMeta(status: PageAssetStatus): {
  label: string;
  type: 'success' | 'warning' | 'info';
} {
  if (status === 'active') return { label: '已启用', type: 'success' };
  if (status === 'draft') return { label: '草稿', type: 'warning' };
  return { label: '已停用', type: 'info' };
}

export function platformLabel(platform: string): string {
  const key = String(platform || '').toLowerCase();
  if (key === 'douyin') return '抖音';
  if (key === 'kuaishou') return '快手';
  if (key === 'xiaohongshu') return '小红书';
  return platform || '未命名平台';
}

export function formatHealthRate(health: { successRate?: number; runCount?: number } | undefined): string {
  if (!health || !health.runCount) return '暂无运行';
  return `${Math.round((health.successRate || 0) * 100)}%`;
}

export function formatAssetTime(value: number | string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
}
