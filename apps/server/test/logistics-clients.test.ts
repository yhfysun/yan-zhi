// 物流客户端单测：**不依赖真实凭据**，只验证三件事 ——
//   ① 签名/Token 算法与官方文档一致（固定向量）；
//   ② 响应解析（轨迹节点顺序、字段映射）；
//   ③ 错误码能被翻译成可定位的失败步骤。
// 真机联调仍然需要 appKey/checkword；这里不假装验证过连通性。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signSf, sfClient } from '../src/services/logistics/sf.js';
import { yunExpressClient, yunExpressToken } from '../src/services/logistics/yunexpress.js';

const SF_CREDS = { partnerID: 'TEST_PARTNER', checkword: 'checkword', env: 'prod' };
const YUN_CREDS = { baseUrl: 'https://oms.example.com', customerNo: 'ITC0893791', apiSecret: 'axzc2utvPbfc9UbJDOh+7w==' };

function mockFetch(body: string, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('顺丰丰桥', () => {
  it('msgDigest = Base64(MD5(msgData + timestamp + checkword))（固定向量）', () => {
    // 期望值由独立脚本算出：md5('{"a":1}1700000000000checkword') → base64
    expect(signSf('{"a":1}', '1700000000000', 'checkword')).toBe('QGIZzMD3VXouXeIRZRUF/Q==');
  });

  it('轨迹响应按 routeResps[].routes[] 映射为事件', async () => {
    const envelope = {
      success: true,
      errorCode: 'S0000',
      errorMsg: '',
      msgData: JSON.stringify({
        routeResps: [{
          mailNo: 'SF1234567890',
          routes: [
            { acceptTime: '2026-10-20 09:00:00', acceptAddress: '深圳', remark: '已揽收', secondaryStatusName: '揽收' },
            { acceptTime: '2026-10-21 10:00:00', acceptAddress: '上海', remark: '派送中', secondaryStatusName: '派送' },
          ],
        }],
      }),
    };
    mockFetch(JSON.stringify(envelope));

    const r = await sfClient.track(SF_CREDS, { trackingNo: 'SF1234567890' });
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toMatchObject({ time: '2026-10-20 09:00:00', location: '深圳', description: '已揽收' });
    expect(r.events[1].status).toBe('派送');
  });

  it('签名错误（A1006）被归类为 auth，而不是笼统的 api 失败', async () => {
    mockFetch(JSON.stringify({ success: false, errorCode: 'A1006', errorMsg: '数字签名无效' }));
    const r = await sfClient.track(SF_CREDS, { trackingNo: 'SF1234567890' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('auth');
    expect(r.message).toContain('A1006');
  });

  it('缺 checkword 时直接判凭据不全，不发请求', async () => {
    const fn = mockFetch('{}');
    const r = await sfClient.track({ partnerID: 'TEST_PARTNER' }, { trackingNo: 'SF1' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('creds');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('云途物流', () => {
  it('Token = Base64(客户编号&ApiSecret)（固定向量）', () => {
    expect(yunExpressToken('ITC0893791', 'axzc2utvPbfc9UbJDOh+7w=='))
      .toBe('SVRDMDg5Mzc5MSZheHpjMnV0dlBiZmM5VWJKRE9oKzd3PT0=');
  });

  it('按 Authorization: Basic 调 GetTrackAllInfo，并把轨迹倒序成"最新在前"', async () => {
    const envelope = {
      Code: '0000',
      Message: '提交成功!',
      Item: {
        WaybillNumber: 'YT2207711010000002',
        PackageState: 2,
        OrderTrackingDetails: [
          { ProcessDate: '2026-10-20T08:00:00', ProcessContent: 'Shipment information received', ProcessCountry: 'CN', ProcessCity: '深圳' },
          { ProcessDate: '2026-10-21T09:00:00', ProcessContent: 'Departed facility', ProcessCountry: 'CN', ProcessCity: '香港' },
        ],
      },
    };
    const fn = mockFetch(JSON.stringify(envelope));

    const r = await yunExpressClient.track(YUN_CREDS, { trackingNo: 'YT2207711010000002' });
    expect(r.ok).toBe(true);
    expect(r.events.map((e) => e.description)).toEqual(['Departed facility', 'Shipment information received']);
    expect(r.message).toContain('运输中');

    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oms.example.com/api/Tracking/GetTrackAllInfo?OrderNumber=YT2207711010000002');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${yunExpressToken('ITC0893791', 'axzc2utvPbfc9UbJDOh+7w==')}`);
  });

  it('HTTP 401 归类为 auth', async () => {
    mockFetch('{"Message":"unauthorized"}', 401);
    const r = await yunExpressClient.track(YUN_CREDS, { trackingNo: 'YT1' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('auth');
  });

  it('缺少接口地址时不发请求（云途的 ADDR 由客户各自下发，不能猜）', async () => {
    const fn = mockFetch('{}');
    const r = await yunExpressClient.track({ customerNo: 'ITC1', apiSecret: 's' }, { trackingNo: 'YT1' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('creds');
    expect(fn).not.toHaveBeenCalled();
  });
});
