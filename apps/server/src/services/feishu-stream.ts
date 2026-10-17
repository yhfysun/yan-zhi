import * as Lark from '@larksuiteoapi/node-sdk';
import { db } from '../db.js';
import { handleImInbound } from './im.js';
import { createLogger } from './logger.js';
const logger = createLogger('feishu-stream');

/**
 * 飞书长连接客户端（官方 SDK WSClient，零公网回调）。
 * 与 dingtalk-stream.ts 同口径：启用的 feishu 连接器各建一条长连接，
 * 收到 im.message.receive_v1 直接喂现有 handleImInbound（webhook 解析
 * 与长连接事件同为 v2 形状 {header, event}，复用同一闭环）。
 * 配置变更时按 clientKey 幂等重建；webhook 路由保留兼容。
 */

class FeishuStreamClient {
  private client: Lark.WSClient | null = null;
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private retries = 0;

  constructor(
    private connectorId: string,
    private userId: string,
    private appId: string,
    private appSecret: string,
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.client) {
      try {
        this.client.close({ force: true });
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  private async connect() {
    if (this.stopped) return;
    try {
      const dispatcher = new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: any) => {
          try {
            const r = handleImInbound(this.connectorId, this.userId, 'feishu', data);
            if (!r.handled && r.reason && r.reason !== 'duplicate') {
              logger.warn(`[im-feishu] 入站跳过 (connector=${this.connectorId}): ${r.reason}`);
            }
          } catch (e) {
            logger.error(`[im-feishu] 入站处理异常 (connector=${this.connectorId}):`, e);
          }
        },
      });
      const client = new Lark.WSClient({
        appId: this.appId,
        appSecret: this.appSecret,
        autoReconnect: true,
        loggerLevel: Lark.LoggerLevel.warn,
        source: 'yan-zhi',
      });
      this.client = client;
      await client.start({ eventDispatcher: dispatcher });
      this.retries = 0;
      logger.info(`[im-feishu] 长连接已建立 (connector=${this.connectorId})`);
    } catch (e) {
      logger.warn(
        `[im-feishu] 建连失败 (connector=${this.connectorId}):`,
        e instanceof Error ? e.message : e,
      );
      this.client = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.retryTimer) return;
    const delay = Math.min(30_000, 2_000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }
}

// ===== 连接器生命周期管理 =====

interface StreamClientEntry {
  client: FeishuStreamClient;
  key: string;
}

const clients = new Map<string, StreamClientEntry>();

/** 以连接器配置为 key；配置变更自动重建连接 */
function clientKey(userId: string, appId: string, appSecret: string) {
  return `${userId}|${appId}|${appSecret}`;
}

/**
 * 同步飞书长连接客户端：启用的 feishu 连接器各建一条长连接，
 * 停用 / 删除 / 改配置的自动停掉或重建。幂等，可在启动时和每次变更后调用。
 */
export function syncFeishuStreamClients() {
  const rows = db.prepare(
    "SELECT id, user_id, config_json, enabled FROM im_connector WHERE provider = 'feishu'",
  ).all() as any[];

  const want = new Map<string, { key: string }>();
  for (const r of rows) {
    if (!r.enabled) continue;
    const cfg = r.config_json ? JSON.parse(r.config_json) : {};
    if (!cfg.appId || !cfg.appSecret) continue;
    want.set(r.id, { key: clientKey(r.user_id, String(cfg.appId), String(cfg.appSecret)) });
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
    const client = new FeishuStreamClient(id, row.user_id, String(cfg.appId), String(cfg.appSecret));
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
