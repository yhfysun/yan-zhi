import type { PageAssetJsonValue, PageAssetOperation, PageAssetSpec } from './types';

export interface PageAssetSelection {
  capability?: string;
  platform?: string;
  url?: string;
}

function getByPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts: Array<string | number> = [];
  for (const token of path.split('.')) {
    if (!token) continue;
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(token))) {
      parts.push(match[2] !== undefined ? Number(match[2]) : match[1]);
    }
  }
  let current: any = root;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part as any];
  }
  return current;
}

function resolveValue(value: PageAssetJsonValue, input: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    if (value === '$input') return input;
    if (value.startsWith('$input.')) return getByPath(input, value.slice('$input.'.length));
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, input));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = resolveValue(item, input);
    return out;
  }
  return value;
}

export function resolvePageAssetParams(
  paramMap: Record<string, PageAssetJsonValue> | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!paramMap) return { ...input };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(paramMap)) out[key] = resolveValue(value, input);
  return out;
}

export function pageAssetHostMatches(asset: PageAssetSpec, url: string): boolean {
  let host = '';
  let pathname = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
  } catch {
    return false;
  }
  const hostHit = asset.match.hosts.some((pattern) => {
    const normalized = String(pattern || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('*.')) {
      const base = normalized.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === normalized;
  });
  if (!hostHit) return false;
  const routes = asset.match.routes || [];
  return routes.length === 0 || routes.some((route) => pathname.startsWith(route));
}

export function matchPageAssetUrl(asset: PageAssetSpec, url: string): boolean {
  return asset.status === 'active' && pageAssetHostMatches(asset, url);
}

export function selectPageAssets(
  assets: PageAssetSpec[],
  selection: PageAssetSelection = {},
): PageAssetSpec[] {
  const capability = String(selection.capability || '').trim();
  const platform = String(selection.platform || '').trim().toLowerCase();
  return assets.filter((asset) => {
    if (asset.status !== 'active') return false;
    if (platform && asset.platform.toLowerCase() !== platform) return false;
    if (capability && !asset.capabilities.includes(capability)) return false;
    if (selection.url && !matchPageAssetUrl(asset, selection.url)) return false;
    return true;
  });
}

export function findPageAssetOperation(
  asset: PageAssetSpec,
  operationId: string,
): PageAssetOperation | undefined {
  return asset.operations.find((operation) => operation.id === operationId);
}
