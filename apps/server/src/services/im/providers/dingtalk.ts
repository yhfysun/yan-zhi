import type { ImCapabilities, ImProvider, ImSendInput, ImTestResult } from '../types.js';

const capabilities: ImCapabilities = {
  platform: 'dingtalk',
  // 钉钉走机器人接口，消息以应用身份发出
  sendingMode: 'APP_PROXY',
  supportsDirect: true,
  supportsGroup: true,
  supportsFile: false,
  supportsContactSearch: false,
  supportsChatList: false,
};

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
  });
  const data = await res.json();
  if (!res.ok || !data?.accessToken) {
    throw new Error(`获取钉钉 access_token 失败: ${data?.message || res.status}`);
  }
  return String(data.accessToken);
}

/**
 * 钉钉发送：to 为群会话 openConversationId（cid 开头）走群聊接口，
 * 否则视为用户 userid 走单聊批量接口。仅支持文本。
 */
async function send(config: any, input: ImSendInput) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('钉钉连接器缺少 clientId/clientSecret');
  }
  if (input.file) {
    throw new Error('钉钉发送暂仅支持文本消息');
  }
  const token = await getToken(config.clientId, config.clientSecret);
  const robotCode = config.robotCode || config.clientId;
  const to = input.to;
  // openConversationId 以 cid 开头（钉钉约定），据此区分群聊 / 单聊目标
  const isGroup = to.startsWith('cid');
  const body = isGroup
    ? {
        robotCode,
        openConversationId: to,
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: input.content || '' }),
      }
    : {
        robotCode,
        userIds: [to],
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: input.content || '' }),
      };
  const url = isGroup
    ? 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
    : 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': token,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data?.code) {
    throw new Error(`钉钉发送失败: ${data?.message || res.status}`);
  }
  return data;
}

async function test(config: any): Promise<ImTestResult> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('钉钉连接器缺少 clientId/clientSecret');
  }
  await getToken(config.clientId, config.clientSecret);
  return { provider: 'dingtalk', ok: true };
}

export const dingtalkProvider: ImProvider = { platform: 'dingtalk', capabilities, send, test };
