import WebSocket from 'ws';
import { db } from '../db.js';
import { handleDingtalkInbound } from './im.js';

/**
 * 钉钉 Stream 模式客户端（零 SDK，直接对接开放协议）。
 * 协议：POST /v1.0/gateway/connections/open 换 endpoint+ticket →
 * WebSocket 连 endpoint（header 带 ticket）→ 收推送帧按 messageId 回 ACK。
 * 机器人回调 topic 固定为 /v1.0/im/bot/messages/get。
 */

const GATEWAY_OPEN_URL = 'https://api.dingtalk.com/v1.0/gateway/connections/open';
const ROBOT_TOPIC = '/v1.0/im/bot/messages/get';

interface StreamFrame {
  specVersion?: string;
  type?: 'SYSTEM' | 'EVENT' | 'CALLBACK';
  headers?: { topic?: string; contentType?: string; messageId?: string; time?: number };
  data?: string;
}

class DingtalkStreamClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private retries = 0;

  constructor(
    private connectorId: string,
    private userId: string,
    private clientId: string,
    private clientSecret: string,
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private async connect() {
    if (this.stopped) return;
    try {
      const res = await fetch(GATEWAY_OPEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          subscriptions: [{ type: 'CALLBACK', topic: ROBOT_TOPIC }],
          ua: 'yan-zhi-server/0.1',
          localIp: '127.0.0.1',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.endpoint || !data?.ticket) {
        throw new Error(data?.message || `gateway/connections/open ${res.status}`);
      }
      const ws = new WebSocket(String(data.endpoint), { headers: { ticket: String(data.ticket) } });
      this.ws = ws;
      ws.on('open', () => {
        this.retries = 0;
        console.log(`[im-dingtalk] Stream 已连接 (connector=${this.connectorId})`);
      });
      ws.on('message', (buf: unknown) => this.onFrame(String(buf)));
      ws.on('close', () => this.scheduleReconnect());
      ws.on('error', () => {
        /* error 后必然触发 close，由 close 统一重连 */
      });
    } catch (e) {
      console.warn(`[im-dingtalk] 建连失败 (connector=${this.connectorId}):`, e instanceof Error ? e.message : e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 2_000 * 2 ** this.retries++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private onFrame(raw: string) {
    let frame: StreamFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    const messageId = String(frame?.headers?.messageId || '');
    const topic = String(frame?.headers?.topic || '');

    let ackCode = 200;
    let ackMessage = 'OK';
    if (frame?.type === 'CALLBACK' && topic === ROBOT_TOPIC) {
      try {
        const msg = JSON.parse(String(frame.data || '{}'));
        const r = handleDingtalkInbound(this.connectorId, this.userId, msg);
        if (!r.handled && r.reason === 'no_default_model') {
          ackMessage = 'NO_MODEL';
        }
      } catch (e) {
        ackCode = 500;
        ackMessage = e instanceof Error ? e.message.slice(0, 200) : 'INTERNAL_ERROR';
      }
    }
    // SYSTEM（keepalive）/ EVENT：统一按 OK 回执
    this.sendAck(messageId, ackCode, ackMessage, '{}');
  }

  private sendAck(messageId: string, code: number, message: string, data: string) {
    if (!this.ws || !messageId) return;
    try {
      this.ws.send(
        JSON.stringify({
          code,
          headers: { contentType: 'application/json', messageId },
          message,
          data,
        }),
      );
    } catch {
      /* ignore */
    }
  }
}

// ===== 连接器生命周期管理 =====

interface StreamClientEntry {
  client: DingtalkStreamClient;
  key: string;
}

const clients = new Map<string, StreamClientEntry>();

/** 以连接器配置为 key；配置变更自动重建连接 */
function clientKey(userId: string, clientId: string, clientSecret: string) {
  return `${userId}|${clientId}|${clientSecret}`;
}

/**
 * 同步钉钉 Stream 客户端：启用的 dingtalk 连接器各建一条长连接，
 * 停用 / 删除 / 改配置的自动停掉或重建。幂等，可在启动时和每次变更后调用。
 */
export function syncDingtalkStreamClients() {
  const rows = db.prepare(
    "SELECT id, user_id, config_json, enabled FROM im_connector WHERE provider = 'dingtalk'",
  ).all() as any[];

  const want = new Map<string, { key: string }>();
  for (const r of rows) {
    if (!r.enabled) continue;
    const cfg = r.config_json ? JSON.parse(r.config_json) : {};
    if (!cfg.clientId || !cfg.clientSecret) continue;
    want.set(r.id, { key: clientKey(r.user_id, String(cfg.clientId), String(cfg.clientSecret)) });
  }

  for (const [id, info] of want) {
    const existing = clients.get(id);
    if (existing && existing.key === info.key) continue;
    if (existing) {
      existing.client.stop();
      clients.delete(id);
    }
    const row = rows.find((r) => r.id === id)!;
    const cfg = JSON.parse(row.config_json);
    const client = new DingtalkStreamClient(id, row.user_id, String(cfg.clientId), String(cfg.clientSecret));
    client.start();
    clients.set(id, { client, key: info.key });
  }

  for (const [id, entry] of clients) {
    if (!want.has(id)) {
      entry.client.stop();
      clients.delete(id);
    }
  }
}
