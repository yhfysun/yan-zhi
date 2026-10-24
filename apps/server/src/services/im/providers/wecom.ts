import type { ImCapabilities, ImProvider, ImSendInput, ImTestResult } from '../types.js';
import { resolveFile } from '../shared.js';

const capabilities: ImCapabilities = {
  platform: 'wechat',
  // 企业微信只能用应用身份（corp token + agentId）发消息
  sendingMode: 'APP_PROXY',
  supportsDirect: true,
  // 现有发送只走 touser，群聊接口未接
  supportsGroup: false,
  supportsFile: true,
  supportsContactSearch: false,
  supportsChatList: false,
};

async function getToken(corpId: string, secret: string): Promise<string> {
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    throw new Error(`获取企业微信 access_token 失败: ${data.errmsg || data.message || res.status}`);
  }
  return data.access_token;
}

async function uploadMedia(token: string, buffer: Buffer, name: string, type: string): Promise<string> {
  const form = new FormData();
  form.append('media', new Blob([buffer as unknown as BlobPart]), name || 'file');
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${type}`,
    {
      method: 'POST',
      body: form,
    },
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0 || !data.media_id) {
    throw new Error(`企业微信文件上传失败: ${data.errmsg || data.message || res.status}`);
  }
  return data.media_id;
}

async function send(config: any, input: ImSendInput) {
  if (!config.corpId || !config.secret || !config.agentId) {
    throw new Error('企业微信连接器缺少 corpId/secret/agentId');
  }
  const token = await getToken(config.corpId, config.secret);
  let mediaId: string | null = null;
  if (input.file) {
    const { name, buffer } = await resolveFile(input.file);
    mediaId = await uploadMedia(token, buffer, name, 'file');
  }

  const payload: Record<string, unknown> = {
    touser: input.to,
    msgtype: mediaId ? 'file' : 'text',
    agentid: Number(config.agentId),
  };
  if (mediaId) {
    payload.file = { media_id: mediaId };
  } else {
    payload.text = { content: input.content || '' };
  }
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    throw new Error(`企业微信发送失败: ${data.errmsg || data.message || res.status}`);
  }
  return data;
}

async function test(config: any): Promise<ImTestResult> {
  if (!config.corpId || !config.secret) {
    throw new Error('企业微信连接器缺少 corpId/secret');
  }
  await getToken(config.corpId, config.secret);
  return { provider: 'wechat', ok: true };
}

export const wecomProvider: ImProvider = { platform: 'wechat', capabilities, send, test };
