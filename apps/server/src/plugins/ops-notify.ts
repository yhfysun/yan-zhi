import {
  buildMonitorNotificationText,
  webhookUrlError,
  type OpsAlertEvent,
  type OpsMonitorConfig,
} from './ops-monitor.js';

export interface OpsNotifyResult {
  attempted: number;
  failed: number;
  skipped: boolean;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendOpsMonitorNotifications(
  connectionName: string,
  config: OpsMonitorConfig,
  alerts: OpsAlertEvent[],
  kind: 'alert' | 'recovery' = 'alert',
  now = Date.now(),
): Promise<OpsNotifyResult> {
  if (config.silenceUntil && config.silenceUntil > now) {
    return { attempted: 0, failed: 0, skipped: true };
  }
  const text = buildMonitorNotificationText(connectionName, alerts, config, kind);
  if (!text) return { attempted: 0, failed: 0, skipped: false };
  const boundedText = text.length > 1800 ? `${text.slice(0, 1800)}\n…（已截断）` : text;
  const targets = [
    { channel: 'feishu' as const, url: config.feishuWebhook },
    { channel: 'wecom' as const, url: config.wecomWebhook },
  ].filter((target) => !!target.url && !webhookUrlError(target.url, target.channel));
  const results = await Promise.allSettled(targets.map(async (target) => {
      if (target.channel === 'feishu') {
        await postJson(target.url!, { msg_type: 'text', content: { text: boundedText } });
      } else {
        await postJson(target.url!, { msgtype: 'text', text: { content: boundedText } });
      }
  }));
  const failed = results.filter((result) => result.status === 'rejected').length;
  return { attempted: targets.length, failed, skipped: false };
}
