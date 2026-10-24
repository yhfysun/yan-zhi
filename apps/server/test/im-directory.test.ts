import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db';
import {
  clearFeishuDirectoryCache,
  FEISHU_USER_TOKEN_KEY,
  getTenantToken,
  listFeishuChats,
  searchFeishuUsers,
  writeFeishuUserToken,
} from '../src/services/im/providers/feishu-client';
import {
  completeFeishuOAuthCallback,
  disconnectFeishuOAuth,
  getFeishuOAuthStatus,
  listImConnectors,
  searchImContacts,
  startFeishuOAuth,
  updateImConnector,
} from '../src/services/im';

const ORIGINAL_FETCH = globalThis.fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const CFG = { appId: 'cli_test', appSecret: 'secret_test' };

function mockFeishu(overrides: (url: string, init: any) => Response | null = () => null) {
  const calls: Array<{ url: string; init: any }> = [];
  (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    const custom = overrides(String(url), init);
    if (custom) return custom;
    if (String(url).includes('tenant_access_token')) {
      return json({ tenant_access_token: 'tenant-token', expire: 7200 });
    }
    if (String(url).includes('/contact/v3/users/find_by_department')) {
      const dept = new URL(String(url)).searchParams.get('department_id');
      const items =
        dept === '0'
          ? [{ open_id: 'ou_root', name: '张三丰' }]
          : dept === 'od_child'
            ? [{ open_id: 'ou_child', name: '李四' }]
            : [];
      return json({ code: 0, data: { items, has_more: false } });
    }
    if (String(url).includes('/departments/0/children')) {
      return json({ code: 0, data: { items: [{ open_department_id: 'od_child' }], has_more: false } });
    }
    if (String(url).includes('/departments/od_child/children')) {
      return json({ code: 0, data: { items: [], has_more: false } });
    }
    if (String(url).includes('/search/v1/user')) {
      return json({ code: 0, data: { users: [{ open_id: 'ou_oauth', name: '王五' }] } });
    }
    if (String(url).includes('/im/v1/chats')) {
      return json({
        code: 0,
        data: { items: [{ chat_id: 'oc_1', name: '项目群', chat_mode: 'group' }], has_more: false },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return calls;
}

beforeEach(() => {
  clearFeishuDirectoryCache();
});

afterEach(() => {
  (globalThis as any).fetch = ORIGINAL_FETCH;
  clearFeishuDirectoryCache();
});

describe('通讯录遍历：找人与缓存', () => {
  it('★★ 从根部门递归子部门，按姓名命中并返回 open_id', async () => {
    mockFeishu();
    const result = await searchFeishuUsers(CFG, '张', { strategy: 'contacts' });
    expect(result.strategy).toBe('contacts');
    expect(result.items).toEqual([
      { openId: 'ou_root', name: '张三丰' },
    ]);
    expect(result.scannedUsers).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('★ 遍历结果缓存：第二次查询不再重复拉通讯录', async () => {
    const calls = mockFeishu();
    await searchFeishuUsers(CFG, '张', { strategy: 'contacts' });
    const firstCount = calls.length;
    const second = await searchFeishuUsers(CFG, '李', { strategy: 'contacts' });
    expect(calls.length).toBe(firstCount);
    expect(second.items[0]).toMatchObject({ openId: 'ou_child', name: '李四' });
  });

  it('★★ 根部门无权限 → directory_failed 并给出 scope 提示，而不是返回空', async () => {
    mockFeishu((url) =>
      url.includes('/contact/v3/users/find_by_department')
        ? json({ code: 99991672, msg: 'no permission' })
        : null,
    );
    await expect(searchFeishuUsers(CFG, '张', { strategy: 'contacts' })).rejects.toMatchObject({
      code: 'directory_failed',
    });
    await expect(searchFeishuUsers(CFG, '张', { strategy: 'contacts' })).rejects.toThrow(
      /contact:contact\.base:readonly/,
    );
  });

  it('★★ 单个部门的子级请求失败：该部门用户保留、标记不完整、且不写缓存', async () => {
    let childChildrenCalls = 0;
    mockFeishu((url) => {
      if (url.includes('/departments/od_child/children')) {
        childChildrenCalls++;
        return json({ code: 1, msg: 'transient' }, 500);
      }
      return null;
    });
    const first = await searchFeishuUsers(CFG, '李', { strategy: 'contacts' });
    expect(first.items[0]).toMatchObject({ openId: 'ou_child', name: '李四' });
    expect(first.truncated).toBe(true);
    expect(first.note).toContain('读取失败');

    await searchFeishuUsers(CFG, '李', { strategy: 'contacts' });
    expect(childChildrenCalls).toBe(2); // 残缺索引没进缓存，第二次会重试
  });

  it('★★ tenant token 缓存按 secret 指纹隔离；forceRefresh 绕过缓存', async () => {
    const calls = mockFeishu();
    const tokenCalls = () => calls.filter((c) => c.url.includes('tenant_access_token')).length;

    await getTenantToken('cli_cache', 's1');
    await getTenantToken('cli_cache', 's1');
    expect(tokenCalls()).toBe(1);

    await getTenantToken('cli_cache', 's1', { forceRefresh: true });
    expect(tokenCalls()).toBe(2);

    await getTenantToken('cli_cache', 's2');
    expect(tokenCalls()).toBe(3);
  });
});

describe('用户态 OAuth 搜索', () => {
  it('★ 有有效用户 token → 走 search/v1/user，带 Bearer 用户令牌', async () => {
    const config = writeFeishuUserToken(
      { ...CFG },
      {
        accessToken: 'user-token',
        expiresAt: Date.now() + 3600_000,
        refreshToken: 'rt',
      },
    );
    const calls = mockFeishu();
    const result = await searchFeishuUsers(config, '王', { strategy: 'oauth' });
    expect(result.strategy).toBe('oauth');
    expect(result.items[0]).toMatchObject({ openId: 'ou_oauth', name: '王五' });
    const searchCall = calls.find((c) => c.url.includes('/search/v1/user'));
    expect(searchCall?.init.headers.Authorization).toBe('Bearer user-token');
  });

  it('★ 未授权却强制 oauth → not_linked（提示改用 contacts）', async () => {
    mockFeishu();
    await expect(searchFeishuUsers({ ...CFG }, '王', { strategy: 'oauth' })).rejects.toMatchObject({
      code: 'not_linked',
    });
  });

  it('★★ token 将过期 → 自动刷新，并把新令牌交给回调落盘', async () => {
    const config = writeFeishuUserToken(
      { ...CFG },
      {
        accessToken: 'old-token',
        refreshToken: 'rt-old',
        expiresAt: Date.now() - 1000,
        refreshExpiresAt: Date.now() + 600_000,
      },
    );
    const calls = mockFeishu((url, init) => {
      if (url.includes('authen/v2/oauth/token')) {
        expect(JSON.parse(init.body).grant_type).toBe('refresh_token');
        return json({
          code: 0,
          access_token: 'new-token',
          expires_in: 7200,
          refresh_token: 'rt-new',
          refresh_token_expires_in: 600000,
        });
      }
      return null;
    });
    const onUserToken = vi.fn();
    const result = await searchFeishuUsers(config, '王', { strategy: 'oauth', onUserToken });

    expect(result.items).toHaveLength(1);
    expect(onUserToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-token', refreshToken: 'rt-new' }),
    );
    const searchCall = calls.find((c) => c.url.includes('/search/v1/user'));
    expect(searchCall?.init.headers.Authorization).toBe('Bearer new-token');
  });

  it('★★ auto 模式：OAuth 失败且刷新不了 → 回退通讯录并标注原因', async () => {
    const config = writeFeishuUserToken(
      { ...CFG },
      {
        accessToken: 'stale-token',
        refreshToken: 'rt-dead',
        expiresAt: Date.now() + 3600_000,
        refreshExpiresAt: Date.now() + 600_000,
      },
    );
    mockFeishu((url) => {
      if (url.includes('/search/v1/user')) return json({ code: 99991677, msg: 'token invalid' });
      if (url.includes('authen/v2/oauth/token')) return json({ error: 'invalid_grant' }, 400);
      return null;
    });
    const result = await searchFeishuUsers(config, '张', { strategy: 'auto' });
    expect(result.strategy).toBe('contacts');
    expect(result.items[0].openId).toBe('ou_root');
    expect(result.note).toContain('回退通讯录');
  });
});

describe('飞书会话列表', () => {
  it('★ 未授权用户态 → 用应用身份列机器人所在群', async () => {
    const calls = mockFeishu();
    const chats = await listFeishuChats({ ...CFG }, 'group');
    expect(chats).toEqual([
      { chatId: 'oc_1', name: '项目群', chatMode: 'group', description: undefined },
    ]);
    const listCall = calls.find((c) => c.url.includes('/im/v1/chats'));
    expect(listCall?.url).toContain('types=group');
    expect(listCall?.init.headers.Authorization).toBe('Bearer tenant-token');
  });

  it('★ 已授权 → 用用户令牌列会话', async () => {
    const config = writeFeishuUserToken(
      { ...CFG },
      { accessToken: 'user-token', expiresAt: Date.now() + 3600_000, refreshToken: 'rt' },
    );
    const calls = mockFeishu();
    await listFeishuChats(config);
    const listCall = calls.find((c) => c.url.includes('/im/v1/chats'));
    expect(listCall?.init.headers.Authorization).toBe('Bearer user-token');
  });
});

describe('服务层：配置脱敏、凭据保留、OAuth 流程', () => {
  const userId = randomUUID();
  let connectorId = '';

  beforeEach(() => {
    db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      userId,
      `im-dir-${userId}`,
      'x',
      Date.now(),
    );
    connectorId = randomUUID();
    const tokenCfg = writeFeishuUserToken(
      { ...CFG },
      { accessToken: 'user-token', expiresAt: Date.now() + 3600_000, refreshToken: 'rt', name: '张三' },
    );
    db.prepare(
      `INSERT INTO im_connector (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
       VALUES (?, ?, 'feishu', '测试飞书', ?, 1, ?, ?)`,
    ).run(connectorId, userId, JSON.stringify(tokenCfg), Date.now(), Date.now());
  });

  afterEach(() => {
    db.prepare('DELETE FROM im_connector WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);
  });

  it('★★ 连接器列表不回传用户态 token，只回授权状态', () => {
    const connectors = listImConnectors(userId);
    const feishu = connectors.find((c: any) => c.id === connectorId) as any;
    expect(feishu.config.feishuUserTokenEnc).toBeUndefined();
    expect(feishu.feishuUserAuth).toEqual({ linked: true, name: '张三' });
  });

  it('★★ 编辑连接器时不会把已授权的 token 冲掉', () => {
    updateImConnector(userId, connectorId, { config: { ...CFG, note: '改个名字' } });
    const row = db.prepare('SELECT config_json FROM im_connector WHERE id = ?').get(connectorId) as any;
    const config = JSON.parse(row.config_json);
    expect(config.note).toBe('改个名字');
    expect(typeof config.feishuUserTokenEnc).toBe('string');
  });

  it('★★ 客户端伪造 feishuUserTokenEnc 会被忽略（服务端专属字段）', () => {
    updateImConnector(userId, connectorId, {
      config: { ...CFG, [FEISHU_USER_TOKEN_KEY]: 'forged-ciphertext' },
    });
    expect(getFeishuOAuthStatus(userId, connectorId)).toMatchObject({
      linked: true,
      name: '张三',
    });
  });

  it('★ searchImContacts 在服务层自动带上落盘回调，刷新后的 token 会写回连接器', async () => {
    const row = db.prepare('SELECT config_json FROM im_connector WHERE id = ?').get(connectorId) as any;
    const expired = writeFeishuUserToken(JSON.parse(row.config_json), {
      accessToken: 'old',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
      refreshExpiresAt: Date.now() + 600_000,
    });
    db.prepare('UPDATE im_connector SET config_json = ? WHERE id = ?').run(
      JSON.stringify(expired),
      connectorId,
    );
    mockFeishu((url, init) => {
      if (url.includes('authen/v2/oauth/token')) {
        expect(JSON.parse(init.body).grant_type).toBe('refresh_token');
        return json({ code: 0, access_token: 'rotated', expires_in: 7200, refresh_token: 'rt2' });
      }
      return null;
    });

    const result = await searchImContacts(userId, {
      platform: 'feishu',
      query: '王',
      strategy: 'oauth',
    });
    expect(result.items).toHaveLength(1);

    const after = getFeishuOAuthStatus(userId, connectorId);
    expect(after.linked).toBe(true);
    expect(after.refreshable).toBe(true);
  });

  it('★★ OAuth：开始授权返回可打开的 URL，回调换 token 后状态变为已授权', async () => {
    const start = startFeishuOAuth(userId, connectorId, 'http://127.0.0.1:3000/api/im/feishu/oauth/callback');
    expect(start.url).toContain('accounts.feishu.cn/open-apis/authen/v1/authorize');
    expect(start.url).toContain('client_id=cli_test');
    expect(start.url).toContain('scope=contact%3Auser%3Asearch');

    mockFeishu((url, init) => {
      if (url.includes('authen/v2/oauth/token')) {
        const body = JSON.parse(init.body);
        expect(body.grant_type).toBe('authorization_code');
        expect(body.code).toBe('auth-code');
        return json({ code: 0, access_token: 'fresh', expires_in: 7200, refresh_token: 'rt' });
      }
      if (url.includes('/authen/v1/user_info')) {
        return json({ code: 0, data: { open_id: 'ou_me', name: '我' } });
      }
      return null;
    });

    const completed = await completeFeishuOAuthCallback(start.state, 'auth-code');
    expect(completed).toMatchObject({ connectorId, name: '我', openId: 'ou_me' });
    expect(getFeishuOAuthStatus(userId, connectorId)).toMatchObject({ linked: true, name: '我' });

    disconnectFeishuOAuth(userId, connectorId);
    expect(getFeishuOAuthStatus(userId, connectorId).linked).toBe(false);
  });

  it('★ 无效 state 的回调被拒绝', async () => {
    await expect(completeFeishuOAuthCallback('bogus', 'code')).rejects.toMatchObject({
      code: 'oauth_failed',
    });
  });
});
