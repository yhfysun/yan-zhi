import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db';
import { sendImMessageUnified, getImStatus } from '../src/services/im';
import { executeApiTool } from '../src/mcp/api-tool-executor';
import {
  ImMessagingError,
  parseRecipientKind,
  resolveContent,
  validateRecipient,
} from '../src/services/im/validate';
import type { ImCapabilities } from '../src/services/im/types';

const ORIGINAL_FETCH = globalThis.fetch;

const CAPS: Record<string, ImCapabilities> = {
  feishu: { platform: 'feishu', sendingMode: 'APP_PROXY', supportsDirect: true, supportsGroup: true, supportsFile: true },
  wechat: { platform: 'wechat', sendingMode: 'APP_PROXY', supportsDirect: true, supportsGroup: false, supportsFile: true },
  'wechat-personal': { platform: 'wechat-personal', sendingMode: 'USER_NATIVE', supportsDirect: true, supportsGroup: true, supportsFile: true },
  dingtalk: { platform: 'dingtalk', sendingMode: 'APP_PROXY', supportsDirect: true, supportsGroup: true, supportsFile: false },
};

function expectImError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ImMessagingError);
    expect((error as ImMessagingError).code).toBe(code);
    return;
  }
  throw new Error('expected ImMessagingError but nothing was thrown');
}

describe('parseRecipientKind：默认私聊，非法值拒绝', () => {
  it('★ 缺省为 direct，大小写不敏感', () => {
    expect(parseRecipientKind(undefined)).toBe('direct');
    expect(parseRecipientKind('')).toBe('direct');
    expect(parseRecipientKind('GROUP')).toBe('group');
  });

  it('★ 其他取值直接拒绝，不猜', () => {
    expectImError(() => parseRecipientKind('chat'), 'validation_failed');
  });
});

describe('validateRecipient：只认平台原生 ID 形态', () => {
  it('★ 飞书私聊必须 ou_，群必须 oc_', () => {
    expect(validateRecipient(CAPS.feishu, 'direct', ' ou_abc ')).toBe('ou_abc');
    expect(validateRecipient(CAPS.feishu, 'group', 'oc_xyz')).toBe('oc_xyz');
    expectImError(() => validateRecipient(CAPS.feishu, 'direct', '张三'), 'validation_failed');
    expectImError(() => validateRecipient(CAPS.feishu, 'group', 'ou_abc'), 'validation_failed');
  });

  it('★ 钉钉群必须 cid 开头，私聊不限形态', () => {
    expect(validateRecipient(CAPS.dingtalk, 'group', 'cid123')).toBe('cid123');
    expectImError(() => validateRecipient(CAPS.dingtalk, 'group', 'oc_abc'), 'validation_failed');
    expect(validateRecipient(CAPS.dingtalk, 'direct', 'user123')).toBe('user123');
  });

  it('★ 企微暂不支持群聊，个人微信不限形态', () => {
    expectImError(() => validateRecipient(CAPS.wechat, 'group', 'g1'), 'validation_failed');
    expect(validateRecipient(CAPS['wechat-personal'], 'group', 'g1')).toBe('g1');
  });

  it('★ 空 ID 拒绝', () => {
    expectImError(() => validateRecipient(CAPS.feishu, 'direct', '   '), 'validation_failed');
  });
});

describe('resolveContent：text 与 filePath 二选一', () => {
  it('★ 只给 text → 文本消息', () => {
    expect(resolveContent(CAPS.feishu, { text: ' 你好 ' })).toEqual({ kind: 'text', text: '你好' });
  });

  it('★ 只给 filePath → 文件消息', () => {
    expect(resolveContent(CAPS.feishu, { filePath: '/tmp/a.pdf' })).toEqual({
      kind: 'file',
      filePath: '/tmp/a.pdf',
    });
  });

  it('★ 同时给 / 都不给 → 拒绝', () => {
    expectImError(
      () => resolveContent(CAPS.feishu, { text: 'hi', filePath: '/tmp/a.pdf' }),
      'validation_failed',
    );
    expectImError(() => resolveContent(CAPS.feishu, {}), 'validation_failed');
  });

  it('★ 钉钉不支持文件 → unsupported_content', () => {
    expectImError(
      () => resolveContent(CAPS.dingtalk, { filePath: '/tmp/a.pdf' }),
      'unsupported_content',
    );
  });
});

describe('sendImMessageUnified：按平台选连接器 + 审计', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      userId,
      `im-test-${userId}`,
      'x',
      Date.now(),
    );
  });

  afterEach(() => {
    (globalThis as any).fetch = ORIGINAL_FETCH;
    db.prepare('DELETE FROM im_outbound_audit WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM im_connector WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);
  });

  function addConnector(provider: string, name: string, config: Record<string, unknown> = {}) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO im_connector (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, userId, provider, name, JSON.stringify(config), Date.now(), Date.now());
    return id;
  }

  function mockFeishuOk() {
    let sentUrl = '';
    let sentBody: any = null;
    (globalThis as any).fetch = vi.fn(async (url: string, init: any) => {
      if (url.includes('tenant_access_token')) {
        return new Response(JSON.stringify({ tenant_access_token: 't-1' }), { status: 200 });
      }
      sentUrl = url;
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ code: 0, data: { message_id: 'om_1' } }), {
        status: 200,
      });
    });
    return () => ({ sentUrl, sentBody });
  }

  it('★ 没有该平台连接器 → platform_unavailable', async () => {
    await expect(
      sendImMessageUnified(userId, { platform: 'feishu', recipientId: 'ou_x', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'platform_unavailable' });
  });

  it('★ 同平台多个连接器 → ambiguous_connector', async () => {
    addConnector('feishu', 'A');
    addConnector('feishu', 'B');
    await expect(
      sendImMessageUnified(userId, { platform: 'feishu', recipientId: 'ou_x', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'ambiguous_connector' });
  });

  it('★★ 单个连接器 → 自动选中并按群聊 chat_id 发送，写成功审计', async () => {
    const connectorId = addConnector('feishu', '主飞书', { appId: 'a', appSecret: 's' });
    const capture = mockFeishuOk();

    const res = await sendImMessageUnified(userId, {
      platform: 'feishu',
      recipientKind: 'group',
      recipientId: 'oc_123',
      text: '周报已就绪',
    });

    const { sentUrl, sentBody } = capture();
    expect(sentUrl).toContain('receive_id_type=chat_id');
    expect(sentBody.receive_id).toBe('oc_123');
    expect(res).toMatchObject({
      ok: true,
      platform: 'feishu',
      connectorId,
      recipientKind: 'group',
      messageId: 'om_1',
    });

    const rows = db
      .prepare('SELECT * FROM im_outbound_audit WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      connector_id: connectorId,
      provider: 'feishu',
      recipient_kind: 'group',
      recipient: 'oc_123',
      content_kind: 'text',
      ok: 1,
      message_id: 'om_1',
    });
  });

  it('★ 平台接口失败 → 写失败审计并抛错', async () => {
    addConnector('feishu', '主飞书', { appId: 'a', appSecret: 's' });
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('tenant_access_token')) {
        return new Response(JSON.stringify({ tenant_access_token: 't-1' }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 99991, msg: 'bot not in chat' }), { status: 200 });
    });

    await expect(
      sendImMessageUnified(userId, { platform: 'feishu', recipientId: 'ou_1', text: 'hi' }),
    ).rejects.toThrow(/bot not in chat/);

    const row = db
      .prepare('SELECT * FROM im_outbound_audit WHERE user_id = ? ORDER BY created_at DESC')
      .get(userId) as any;
    expect(row).toMatchObject({ ok: 0, error_code: 'send_failed' });
    expect(row.error_message).toContain('bot not in chat');
  });

  it('★ 收件人 ID 形态不对时在发请求前就拒绝，且不留审计', async () => {
    addConnector('feishu', '主飞书', { appId: 'a', appSecret: 's' });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    await expect(
      sendImMessageUnified(userId, { platform: 'feishu', recipientId: '张三', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(fetchMock).not.toHaveBeenCalled();
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM im_outbound_audit WHERE user_id = ?')
      .get(userId) as any;
    expect(count.n).toBe(0);
  });
});

describe('getImStatus：探测失败不抛异常', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      userId,
      `im-status-${userId}`,
      'x',
      Date.now(),
    );
  });

  afterEach(() => {
    (globalThis as any).fetch = ORIGINAL_FETCH;
    db.prepare('DELETE FROM im_connector WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);
  });

  it('★ 凭据不可用时 ready=false 并带原因，而不是抛错', async () => {
    db.prepare(
      `INSERT INTO im_connector (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
       VALUES (?, ?, 'feishu', '坏连接器', '{}', 1, ?, ?)`,
    ).run(randomUUID(), userId, Date.now(), Date.now());
    (globalThis as any).fetch = vi.fn(async () =>
      new Response(JSON.stringify({ code: 10003, msg: 'invalid param' }), { status: 200 }),
    );

    const statuses = await getImStatus(userId, 'feishu');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      platform: 'feishu',
      ready: false,
      sendingMode: 'APP_PROXY',
    });
    expect(statuses[0].error).toContain('缺少 appId/appSecret');
  });

  it('★ 不支持的平台直接抛 platform_unavailable', async () => {
    await expect(getImStatus(userId, 'telegram')).rejects.toMatchObject({
      code: 'platform_unavailable',
    });
  });
});

describe('api_im_send_message：filePath 先过路径闸门', () => {
  const userId = randomUUID();

  beforeEach(() => {
    db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      userId,
      `im-path-${userId}`,
      'x',
      Date.now(),
    );
  });

  afterEach(() => {
    db.prepare('DELETE FROM user WHERE id = ?').run(userId);
  });

  it('★★ 非字符串 filePath（数组）直接拒绝，不能被 String() 强转绕过', async () => {
    const res = await executeApiTool(
      'api_im_send_message',
      { platform: 'feishu', recipientId: 'ou_x', filePath: ['C:/Users/x/.ssh/id_rsa'] },
      userId,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('filePath 必须是字符串路径');
  });

  it('★★ 无工作目录时相对路径拒绝（否则按进程 cwd 解析，能读出仓外文件）', async () => {
    const res = await executeApiTool(
      'api_im_send_message',
      { platform: 'feishu', recipientId: 'ou_x', filePath: '../../.ssh/id_rsa' },
      userId,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('必须是绝对路径');
  });

  it('★ 工作目录只有空白字符时按"无工作目录"处理，不能借此放行相对路径', async () => {
    const res = await executeApiTool(
      'api_im_send_message',
      { platform: 'feishu', recipientId: 'ou_x', filePath: '../../.ssh/id_rsa' },
      userId,
      undefined,
      undefined,
      undefined,
      '   ',
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('必须是绝对路径');
  });
});
