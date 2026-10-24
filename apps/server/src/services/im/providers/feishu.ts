import type { ImCapabilities, ImProvider, ImSendInput, ImTestResult } from '../types.js';
import { resolveFile } from '../shared.js';
import { getTenantToken, listFeishuChats, searchFeishuUsers } from './feishu-client.js';

const capabilities: ImCapabilities = {
  platform: 'feishu',
  // 连接器持有 app 凭证（tenant_access_token），消息以应用身份发出
  sendingMode: 'APP_PROXY',
  supportsDirect: true,
  supportsGroup: true,
  supportsFile: true,
  supportsContactSearch: true,
  supportsChatList: true,
};

async function uploadFile(token: string, buffer: Buffer, name: string): Promise<string> {
  const form = new FormData();
  form.append('file_type', 'stream');
  form.append('file_name', name || 'file');
  form.append('file', new Blob([buffer as unknown as BlobPart]), name || 'file');
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0 || !data.data?.file_key) {
    throw new Error(`飞书文件上传失败: ${data.msg || data.message || res.status}`);
  }
  return data.data.file_key;
}

async function send(config: any, input: ImSendInput) {
  if (!config.appId || !config.appSecret) {
    throw new Error('飞书连接器缺少 appId/appSecret');
  }
  const token = await getTenantToken(config.appId, config.appSecret);
  const receiveIdType = input.receiveIdType || 'open_id';
  let fileKey: string | null = null;
  if (input.file) {
    const { name, buffer } = await resolveFile(input.file);
    fileKey = await uploadFile(token, buffer, name);
  }

  const payload: Record<string, unknown> = {
    receive_id: input.to,
    msg_type: fileKey ? 'file' : 'text',
    content: fileKey
      ? JSON.stringify({ file_key: fileKey })
      : JSON.stringify({ text: input.content || '' }),
  };
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || data.code !== 0) {
    throw new Error(`飞书发送失败: ${data.msg || data.message || res.status}`);
  }
  return data.data || data;
}

async function test(config: any): Promise<ImTestResult> {
  if (!config.appId || !config.appSecret) {
    throw new Error('飞书连接器缺少 appId/appSecret');
  }
  // 测试连接必须真打一次 token 接口：不能吃缓存（改坏 secret 也要立刻暴露）
  await getTenantToken(config.appId, config.appSecret, { forceRefresh: true });
  return { provider: 'feishu', ok: true };
}

export const feishuProvider: ImProvider = {
  platform: 'feishu',
  capabilities,
  send,
  test,
  searchUsers: (config, query, opts) => searchFeishuUsers(config, query, opts),
  listChats: (config, types, opts) => listFeishuChats(config, types, opts),
};
