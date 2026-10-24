import fs from 'node:fs';
import type { ImCapabilities, ImProvider, ImSendInput, ImTestResult } from '../types.js';
import { resolveFile } from '../shared.js';
import { resolveOpenclawGatewayToken } from '../../openclaw-manager.js';

const capabilities: ImCapabilities = {
  platform: 'wechat-personal',
  // OpenClaw 持有已登录的微信会话，消息以用户本人身份发出
  sendingMode: 'USER_NATIVE',
  supportsDirect: true,
  supportsGroup: true,
  supportsFile: true,
  supportsContactSearch: false,
  supportsChatList: false,
};

/**
 * 个人微信（OpenClaw）主动外发：让 AI / 手动入口能把文本或文件推给指定微信好友或群。
 *
 * 路径（2026-10-17 扒 openclaw 源码 + 文档核实）：微信会话由 OpenClaw Gateway 进程持有，
 * 另起 CLI 会被 SQLite 锁（EBUSY）挡住，因此出站唯一可靠入口是 Gateway 的 HTTP RPC：
 *   POST http://127.0.0.1:18789/tools/invoke
 *   Authorization: Bearer <gateway.auth.token>
 *   body: { tool: "message", args: { action: "send", channel: "weixin", target, message, media|buffer, filename, mimeType } }
 * `message` 是核心工具且不在 /tools/invoke 的 deny list 中，支持显式 channel+target 直发。
 */
export async function sendWechatPersonal(_config: any, input: ImSendInput) {
  const CTRL = 'http://127.0.0.1:18789/tools/invoke';
  const GATEWAY_ROOT = 'http://127.0.0.1:18789/';

  // 1. 网关可达性
  try {
    const probe = await fetch(GATEWAY_ROOT, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok && probe.status >= 500) {
      throw new Error('gateway_internal');
    }
  } catch {
    throw new Error('OpenClaw Gateway 未在本机运行（127.0.0.1:18789 不可达），请先在连接器向导完成「一键安装并连接」，或手动 openclaw gateway start');
  }

  // 2. 鉴权令牌（assembleBridge 已写入 openclaw.json 的 gateway.auth.token）
  const token = resolveOpenclawGatewayToken();
  if (!token) {
    throw new Error('OpenClaw Gateway 未配置鉴权令牌：请重新执行连接器「装配桥接」以写入 gateway.auth.token');
  }

  // 3. 组装 message 工具参数
  const args: Record<string, unknown> = {
    action: 'send',
    channel: 'weixin',
    target: input.to,
  };
  if (input.content) args.message = input.content;

  if (input.file) {
    const { name, buffer } = await resolveFile(input.file);
    const filePath = input.file.path;
    if (filePath && fs.existsSync(filePath)) {
      // 优先传本地路径：weixin 通道直接读盘上传，规避 /tools/invoke 2MB body 限制
      args.media = filePath;
    } else {
      // 仅 base64 时走 data URL（受 2MB body 限制，适合小文件）
      args.buffer = `data:${input.file.mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
    }
    args.filename = name;
    if (input.file.mimeType) args.mimeType = input.file.mimeType;
  }

  // 4. 调用 Gateway RPC
  const res = await fetch(CTRL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tool: 'message', args }),
    signal: AbortSignal.timeout(60_000),
  });

  const raw = await res.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* 非 JSON 也照常处理 */ }

  if (!res.ok) {
    const msg = body?.error?.message || raw.slice(0, 200);
    if (res.status === 401) {
      throw new Error('OpenClaw Gateway 鉴权失败（令牌不匹配），请重新执行连接器「装配桥接」');
    }
    throw new Error(`个人微信发送失败：HTTP ${res.status} ${msg}`);
  }
  if (body && body.ok === false) {
    throw new Error(`个人微信发送失败：${body?.error?.message || '未知错误'}`);
  }
  return body?.result ?? body ?? { ok: true };
}

async function test(config: any): Promise<ImTestResult> {
  // 真校验：OpenClaw Gateway 必须在本机运行（桥接消息经它进出），
  // 且连接器必须已带桥接令牌（一键装配后自动写入）
  if (!config.bridgeToken) {
    throw new Error('个人微信连接器缺少桥接令牌，请先在向导里完成「一键安装并连接」');
  }
  const ctrl = 'http://127.0.0.1:18789/';
  try {
    const res = await fetch(ctrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Gateway 返回 ${res.status}`);
  } catch {
    throw new Error('OpenClaw Gateway 未在本机运行（127.0.0.1:18789 不可达），请重新运行一键安装或手动 `openclaw gateway start`');
  }
  return { provider: 'wechat-personal', ok: true, note: 'OpenClaw Gateway 运行中' };
}

export const wechatPersonalProvider: ImProvider = {
  platform: 'wechat-personal',
  capabilities,
  send: sendWechatPersonal,
  test,
};
