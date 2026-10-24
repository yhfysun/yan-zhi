import { createHash } from 'node:crypto';
import { decrypt, encrypt } from '../../../utils/crypto.js';
import { ImMessagingError } from '../validate.js';
import type {
  ImChatSummary,
  ImContactSearchResult,
  ImDirectoryOptions,
  ImFeishuUserToken,
  ImUserSummary,
} from '../types.js';

const FEISHU_API = 'https://open.feishu.cn/open-apis';
const FEISHU_AUTHORIZE = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_TOKEN_ENDPOINT = `${FEISHU_API}/authen/v2/oauth/token`;

/** 授权用户态时要申请的最小权限：找人 + 列会话 + 刷新令牌 */
export const FEISHU_USER_SCOPES = 'contact:user:search im:chat:read offline_access';

/** 连接器 config 里存加密后的用户态凭据 */
export const FEISHU_USER_TOKEN_KEY = 'feishuUserTokenEnc';

const PAGE_SIZE = 50;
const MAX_DEPARTMENTS = 200;
const MAX_USERS = 5000;
const MAX_PARALLEL = 4;
const TRAVERSE_DEADLINE_MS = 8_000;
const INDEX_TTL_MS = 5 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_MAX_RESULTS = 20;
const MAX_MAX_RESULTS = 50;

interface DirectoryIndex {
  at: number;
  users: ImUserSummary[];
  truncated: boolean;
  /** 遍历是否完整（有失败/截断时为 false，不写缓存） */
  complete: boolean;
  note?: string;
}

const indexCache = new Map<string, DirectoryIndex>();
const tenantTokenCache = new Map<string, { token: string; expiresAt: number }>();

if (typeof setInterval === 'function') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of indexCache) {
      if (now - value.at > INDEX_TTL_MS) indexCache.delete(key);
    }
    for (const [key, value] of tenantTokenCache) {
      if (value.expiresAt < now) tenantTokenCache.delete(key);
    }
  }, 60_000);
  if (typeof (cleanup as any).unref === 'function') (cleanup as any).unref();
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function feishuError(action: string, res: Response, data: any): ImMessagingError {
  const detail = data?.msg || data?.message || data?.error_description || data?.error || res.status;
  return new ImMessagingError('directory_failed', `${action}失败: ${detail}`);
}

/** 应用身份 token（tenant_access_token），带进程内缓存；缓存键含 secret 指纹，换密钥即失效 */
export async function getTenantToken(
  appId: string,
  appSecret: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<string> {
  const cacheKey = `${appId}:${createHash('sha256').update(String(appSecret)).digest('hex').slice(0, 12)}`;
  const cached = tenantTokenCache.get(cacheKey);
  if (!opts.forceRefresh && cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return cached.token;
  }
  const res = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await readJson(res);
  if (!res.ok || !data?.tenant_access_token) {
    throw new ImMessagingError(
      'not_linked',
      `获取飞书 access_token 失败: ${data?.msg || data?.message || res.status}`,
    );
  }
  const ttlSeconds = Number(data.expire) > 0 ? Number(data.expire) : 7200;
  tenantTokenCache.set(cacheKey, {
    token: String(data.tenant_access_token),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return String(data.tenant_access_token);
}

// ───────────────────────── 用户态凭据 ─────────────────────────

export function readFeishuUserToken(config: Record<string, any>): ImFeishuUserToken | null {
  const payload = config?.[FEISHU_USER_TOKEN_KEY];
  if (typeof payload !== 'string' || !payload) return null;
  try {
    const parsed = JSON.parse(decrypt(payload));
    if (!parsed?.accessToken || !parsed?.expiresAt) return null;
    return parsed as ImFeishuUserToken;
  } catch {
    // 主密钥变更 / 密文损坏：当成未授权，让用户重新授权
    return null;
  }
}

export function writeFeishuUserToken(
  config: Record<string, any>,
  token: ImFeishuUserToken | null,
): Record<string, any> {
  const next = { ...(config || {}) };
  if (!token) delete next[FEISHU_USER_TOKEN_KEY];
  else next[FEISHU_USER_TOKEN_KEY] = encrypt(JSON.stringify(token));
  return next;
}

export function buildFeishuAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: input.scope || FEISHU_USER_SCOPES,
  });
  return `${FEISHU_AUTHORIZE}?${params.toString()}`;
}

function tokenFromResponse(data: any): ImFeishuUserToken | null {
  if (!data?.access_token) return null;
  const now = Date.now();
  const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 7200;
  const token: ImFeishuUserToken = {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
    expiresAt: now + expiresIn * 1000,
    refreshExpiresAt:
      Number(data.refresh_token_expires_in) > 0
        ? now + Number(data.refresh_token_expires_in) * 1000
        : undefined,
    scope: typeof data.scope === 'string' ? data.scope : undefined,
  };
  return token;
}

/** 用授权码换 user_access_token（v2，RFC6749） */
export async function completeFeishuOAuth(
  config: Record<string, any>,
  code: string,
  redirectUri: string,
): Promise<ImFeishuUserToken> {
  if (!config.appId || !config.appSecret) {
    throw new ImMessagingError('not_linked', '飞书连接器缺少 appId/appSecret');
  }
  const res = await fetch(FEISHU_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await readJson(res);
  const token = tokenFromResponse(data);
  if (!res.ok || !token) {
    throw new ImMessagingError(
      'oauth_failed',
      `飞书授权失败: ${data?.error_description || data?.msg || data?.error || res.status}`,
    );
  }
  const profile = await fetchFeishuUserInfo(token.accessToken);
  return { ...token, ...(profile || {}) };
}

async function fetchFeishuUserInfo(
  accessToken: string,
): Promise<Pick<ImFeishuUserToken, 'openId' | 'name'> | null> {
  try {
    const res = await fetch(`${FEISHU_API}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await readJson(res);
    const info = data?.data;
    if (!info) return null;
    return { openId: info.open_id, name: info.name };
  } catch {
    return null;
  }
}

async function refreshUserToken(
  config: Record<string, any>,
  token: ImFeishuUserToken,
): Promise<ImFeishuUserToken | null> {
  if (!token.refreshToken) return null;
  if (token.refreshExpiresAt && token.refreshExpiresAt < Date.now()) return null;
  const res = await fetch(FEISHU_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      refresh_token: token.refreshToken,
    }),
  });
  const data = await readJson(res);
  const next = tokenFromResponse(data);
  if (!res.ok || !next) return null;
  return { ...next, openId: token.openId, name: token.name };
}

async function ensureUserToken(
  config: Record<string, any>,
  opts?: ImDirectoryOptions,
): Promise<ImFeishuUserToken> {
  const stored = readFeishuUserToken(config);
  if (!stored) {
    throw new ImMessagingError(
      'not_linked',
      '尚未授权飞书用户身份；请先完成 OAuth 授权，或改用 strategy=contacts',
    );
  }
  if (stored.expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) return stored;
  const refreshed = await refreshUserToken(config, stored);
  if (!refreshed) {
    throw new ImMessagingError('not_linked', '飞书用户授权已过期，请重新授权');
  }
  opts?.onUserToken?.(refreshed);
  return refreshed;
}

// ───────────────────────── 用户态搜索 ─────────────────────────

function mapSearchUsers(data: any): ImUserSummary[] {
  const list = data?.data?.users || data?.users || [];
  if (!Array.isArray(list)) return [];
  return list
    .map((u: any) => ({
      openId: String(u.open_id || ''),
      name: String(u.name || u.localized_name || u.display_name || ''),
      matchedQuery: u.matched_query ? String(u.matched_query) : undefined,
    }))
    .filter((u: ImUserSummary) => !!u.openId);
}

async function requestUserSearch(
  accessToken: string,
  query: string,
  maxResults: number,
): Promise<ImUserSummary[]> {
  const res = await fetch(
    `${FEISHU_API}/search/v1/user?user_id_type=open_id&page_size=${maxResults}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, page_size: maxResults }),
    },
  );
  const data = await readJson(res);
  if (!res.ok || (data?.code != null && data.code !== 0)) {
    throw feishuError('飞书用户搜索', res, data);
  }
  return mapSearchUsers(data).slice(0, maxResults);
}

async function searchWithUserToken(
  config: Record<string, any>,
  query: string,
  maxResults: number,
  opts?: ImDirectoryOptions,
): Promise<ImUserSummary[]> {
  const token = await ensureUserToken(config, opts);
  try {
    return await requestUserSearch(token.accessToken, query, maxResults);
  } catch (error) {
    // 令牌被服务端判定失效（过期/注销）时刷新一次再试
    const refreshed = await refreshUserToken(config, token);
    if (!refreshed) throw error;
    opts?.onUserToken?.(refreshed);
    return requestUserSearch(refreshed.accessToken, query, maxResults);
  }
}

// ───────────────────────── 通讯录遍历 ─────────────────────────

interface DepartmentSlice {
  users: ImUserSummary[];
  children: string[];
  usersError?: unknown;
  childrenError?: unknown;
}

async function fetchAllPages(
  baseUrl: string,
  token: string,
  maxPages = 40,
): Promise<any[]> {
  const items: any[] = [];
  let pageToken = '';
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set('page_size', String(PAGE_SIZE));
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const data = await readJson(res);
    if (!res.ok || (data?.code != null && data.code !== 0)) {
      throw feishuError('获取飞书通讯录', res, data);
    }
    const pageItems = data?.data?.items;
    if (Array.isArray(pageItems)) items.push(...pageItems);
    pageToken = data?.data?.page_token || '';
    if (!data?.data?.has_more || !pageToken) break;
  }
  return items;
}

async function loadDepartment(deptId: string, token: string): Promise<DepartmentSlice> {
  const usersUrl =
    `${FEISHU_API}/contact/v3/users/find_by_department` +
    `?department_id=${encodeURIComponent(deptId)}&department_id_type=open_department_id&user_id_type=open_id`;
  const childrenUrl =
    `${FEISHU_API}/contact/v3/departments/${encodeURIComponent(deptId)}/children` +
    `?department_id_type=open_department_id&user_id_type=open_id`;

  // 用户与子部门分开取：一边失败不能连累另一边（否则整棵子树静默丢失）
  const [usersRes, childrenRes] = await Promise.allSettled([
    fetchAllPages(usersUrl, token),
    fetchAllPages(childrenUrl, token),
  ]);

  const users: ImUserSummary[] = [];
  if (usersRes.status === 'fulfilled') {
    for (const u of usersRes.value) {
      const openId = String(u?.open_id || '');
      if (openId) users.push({ openId, name: String(u.name || u.en_name || '') });
    }
  }
  const children =
    childrenRes.status === 'fulfilled'
      ? childrenRes.value
          .map((d) => String(d?.open_department_id || ''))
          .filter((id) => !!id && id !== deptId)
      : [];
  return {
    users,
    children,
    usersError: usersRes.status === 'rejected' ? usersRes.reason : undefined,
    childrenError: childrenRes.status === 'rejected' ? childrenRes.reason : undefined,
  };
}

async function buildDirectoryIndex(
  config: Record<string, any>,
  token: string,
): Promise<DirectoryIndex> {
  const queue: string[] = ['0'];
  const seen = new Set<string>();
  const users = new Map<string, ImUserSummary>();
  const deadline = Date.now() + TRAVERSE_DEADLINE_MS;
  let truncated = false;
  let failures = 0;

  while (queue.length) {
    if (seen.size >= MAX_DEPARTMENTS || users.size >= MAX_USERS || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const batch = queue.splice(0, MAX_PARALLEL).filter((id) => !seen.has(id));
    if (!batch.length) break;
    for (const id of batch) seen.add(id);

    const slices = await Promise.all(batch.map((deptId) => loadDepartment(deptId, token)));

    for (let i = 0; i < slices.length; i++) {
      const deptId = batch[i];
      const slice = slices[i];
      const failed = !!(slice.usersError || slice.childrenError);
      if (deptId === '0' && failed) {
        // 根部门取不到 = 应用没有通讯录权限/接口不可用，整体失败而不是返回空
        const reason = (slice.usersError || slice.childrenError) as Error;
        throw new ImMessagingError(
          'directory_failed',
          `${reason?.message || '读取通讯录失败'}。请确认应用已开通通讯录权限并设置可见范围（至少 contact:contact.base:readonly + contact:user.base:readonly）`,
        );
      }
      if (failed) {
        failures++;
        // 子部门没取到 = 该子树整体丢失，结果必然不完整
        if (slice.childrenError) truncated = true;
      }
      for (const u of slice.users) {
        if (users.size >= MAX_USERS) {
          truncated = true;
          break;
        }
        if (!users.has(u.openId)) users.set(u.openId, u);
      }
      for (const child of slice.children) {
        if (!seen.has(child)) queue.push(child);
      }
    }
  }

  return {
    at: Date.now(),
    users: [...users.values()],
    truncated,
    complete: !truncated && failures === 0,
    note: failures ? `${failures} 个部门读取失败，结果可能不完整` : undefined,
  };
}

function matchUsers(users: ImUserSummary[], query: string, maxResults: number): ImUserSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: ImUserSummary[] = [];
  const prefix: ImUserSummary[] = [];
  const contains: ImUserSummary[] = [];
  for (const u of users) {
    const name = (u.name || '').toLowerCase();
    if (!name) continue;
    if (name === q) exact.push(u);
    else if (name.startsWith(q)) prefix.push(u);
    else if (name.includes(q)) contains.push(u);
  }
  return [...exact, ...prefix, ...contains].slice(0, maxResults);
}

async function searchWithDirectory(
  config: Record<string, any>,
  query: string,
  maxResults: number,
): Promise<Omit<ImContactSearchResult, 'elapsedMs'>> {
  const cacheKey = String(config.appId || 'default');
  let index = indexCache.get(cacheKey);
  if (!index || Date.now() - index.at > INDEX_TTL_MS) {
    const token = await getTenantToken(config.appId, config.appSecret);
    index = await buildDirectoryIndex(config, token);
    // 残缺索引（部分部门失败/触达上限）不写缓存，下次重试完整遍历
    if (index.complete) indexCache.set(cacheKey, index);
  }
  return {
    strategy: 'contacts',
    items: matchUsers(index.users, query, maxResults),
    scannedUsers: index.users.length,
    truncated: index.truncated,
    note: index.note,
  };
}

/** 供测试/诊断清理进程内缓存 */
export function clearFeishuDirectoryCache(): void {
  indexCache.clear();
  tenantTokenCache.clear();
}

export async function searchFeishuUsers(
  config: Record<string, any>,
  query: string,
  opts: { strategy?: 'auto' | 'oauth' | 'contacts'; maxResults?: number } & ImDirectoryOptions = {},
): Promise<ImContactSearchResult> {
  const started = Date.now();
  const q = (query || '').trim();
  if (!q) throw new ImMessagingError('validation_failed', 'query 不能为空');
  const maxResults = Math.max(1, Math.min(opts.maxResults || DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS));
  const strategy = opts.strategy || 'auto';
  if (!config.appId || !config.appSecret) {
    throw new ImMessagingError('not_linked', '飞书连接器缺少 appId/appSecret');
  }

  if (strategy === 'oauth' || (strategy === 'auto' && readFeishuUserToken(config))) {
    try {
      const items = await searchWithUserToken(config, q, maxResults, opts);
      return { strategy: 'oauth', items, elapsedMs: Date.now() - started };
    } catch (error) {
      if (strategy === 'oauth') throw error;
      const fallback = await searchWithDirectory(config, q, maxResults);
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ...fallback,
        elapsedMs: Date.now() - started,
        note: [fallback.note, `OAuth 搜索失败已回退通讯录：${reason}`].filter(Boolean).join('；'),
      };
    }
  }

  const result = await searchWithDirectory(config, q, maxResults);
  return { ...result, elapsedMs: Date.now() - started };
}

export async function listFeishuChats(
  config: Record<string, any>,
  types?: string,
  opts?: ImDirectoryOptions,
): Promise<ImChatSummary[]> {
  if (!config.appId || !config.appSecret) {
    throw new ImMessagingError('not_linked', '飞书连接器缺少 appId/appSecret');
  }
  let accessToken = '';
  if (readFeishuUserToken(config)) {
    try {
      accessToken = (await ensureUserToken(config, opts)).accessToken;
    } catch {
      accessToken = ''; // 用户态失效时退回应用态（只能看到机器人所在群）
    }
  }
  if (!accessToken) accessToken = await getTenantToken(config.appId, config.appSecret);

  const baseUrl = `${FEISHU_API}/im/v1/chats?user_id_type=open_id${
    types ? `&types=${encodeURIComponent(types)}` : ''
  }`;
  const rows = await fetchAllPages(baseUrl, accessToken, 10);
  return rows
    .map((c: any) => ({
      chatId: String(c?.chat_id || ''),
      name: String(c?.name || ''),
      chatMode: c?.chat_mode ? String(c.chat_mode) : undefined,
      description: c?.description ? String(c.description) : undefined,
    }))
    .filter((c) => !!c.chatId);
}
