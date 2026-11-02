import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeMonitorConfig, type OpsAlertEvent } from '../src/plugins/ops-monitor.js';
import { sendOpsMonitorNotifications } from '../src/plugins/ops-notify.js';

const alert: OpsAlertEvent = {
  id: 'a1', fingerprint: 'c1:disk', connectionId: 'c1', connectionName: 'prod-web',
  metric: 'disk', severity: 'critical', status: 'active', value: 96, threshold: 85,
  title: '磁盘使用率偏高', detail: '当前 96%，阈值 85%', firstSeen: 1, lastSeen: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ops notify', () => {
  it('按飞书 / 企业微信协议发送，成功后返回无失败', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const config = normalizeMonitorConfig('c1', {
      enabled: true,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/fake',
      wecomWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fake',
      notifyMinSeverity: 'warning',
    });
    const result = await sendOpsMonitorNotifications('prod-web', config, [alert], 'alert', 10);
    expect(result).toEqual({ attempted: 2, failed: 0, skipped: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0]).toMatchObject({ msg_type: 'text' });
    expect(bodies[1]).toMatchObject({ msgtype: 'text' });
  });

  it('静默期间不发通知；单通道失败会返回 failed 供调用方重试', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const config = normalizeMonitorConfig('c1', {
      enabled: true,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/fake',
      silenceUntil: 9999,
      notifyMinSeverity: 'critical',
    }, 10);
    expect(await sendOpsMonitorNotifications('prod-web', config, [alert], 'alert', 10))
      .toEqual({ attempted: 0, failed: 0, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();

    const active = normalizeMonitorConfig('c1', {
      enabled: true,
      feishuWebhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/fake',
      notifyMinSeverity: 'critical',
    });
    expect(await sendOpsMonitorNotifications('prod-web', active, [alert], 'alert', 10))
      .toEqual({ attempted: 1, failed: 1, skipped: false });
  });
});
