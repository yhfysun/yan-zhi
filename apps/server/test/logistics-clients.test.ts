// 物流客户端单测：**不依赖真实凭据**，只验证三件事 ——
//   ① 签名/Token 算法与官方文档一致（固定向量）；
//   ② 响应解析（轨迹节点顺序、字段映射）；
//   ③ 错误码能被翻译成可定位的失败步骤。
// 真机联调仍然需要 appKey/checkword；这里不假装验证过连通性。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signSf, sfClient } from '../src/services/logistics/sf.js';
import { yunExpressClient, yunExpressToken } from '../src/services/logistics/yunexpress.js';
import { jdClient } from '../src/services/logistics/jd.js';
import { cainiaoClient, cainiaoDigest, cainiaoEndpointOf } from '../src/services/logistics/cainiao.js';
import { fourpxClient, fourpxSign } from '../src/services/logistics/fourpx.js';
import { topSign } from '../src/services/platform-api/sign.js';
import { logisticsClientOf } from '../src/services/logistics/index.js';

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

// ===== 2026-10-23 新增：京东 / 菜鸟 / 4PX =====
const JD_CREDS = { appKey: 'jd-key', appSecret: 'jd-secret', accessToken: 'jd-token', customerCode: '010K001' };
const CN_CREDS = { logisticProviderId: 'edi_test', secretKey: 'cn-secret' };
const FPX_CREDS = { appKey: '4px-key', appSecret: '4px-secret', accessToken: '4px-token', env: 'sandbox' };

describe('京东物流', () => {
  it('★ 轨迹请求：TOP 签名 + 360buy_param_json；响应解析为事件', async () => {
    const fn = mockFetch(JSON.stringify({
      jingdong_ldop_receive_trace_get_responce: {
        querytrace_result: { data: [{ opeTitle: '已揽收', opeTime: '2026-10-22 10:00:00', opeRemark: '北京市朝阳区' }] },
      },
    }));
    const r = await jdClient.track(JD_CREDS, { trackingNo: 'JDV123456' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ time: '2026-10-22 10:00:00', description: '北京市朝阳区', status: '已揽收' });

    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get('method')).toBe('jingdong.ldop.receive.trace.get');
    expect(form.get('app_key')).toBe('jd-key');
    expect(form.get('access_token')).toBe('jd-token');
    expect(form.get('v')).toBe('2.0');
    expect(JSON.parse(String(form.get('360buy_param_json')))).toEqual({ customerCode: '010K001', waybillCode: 'JDV123456' });
    const all: Record<string, string> = {};
    form.forEach((v, k) => { if (k !== 'sign') all[k] = v; });
    expect(form.get('sign')).toBe(topSign(all, 'jd-secret'));
  });

  it('★ token 过期（code 19）→ auth；HTML 登录页 → 失败', async () => {
    mockFetch(JSON.stringify({ error_response: { code: '19', zh_desc: 'token 已过期' } }));
    const expired = await jdClient.track(JD_CREDS, { trackingNo: 'JDV1' });
    expect(expired.ok).toBe(false);
    expect(expired.step).toBe('auth');

    mockFetch('<html>login</html>');
    const html = await jdClient.track(JD_CREDS, { trackingNo: 'JDV1' });
    expect(html.ok).toBe(false);
  });
});

describe('菜鸟速递', () => {
  it('★★ data_digest = Base64(MD5(body + secret))，并解析 operationDetails', async () => {
    const fn = mockFetch(JSON.stringify({
      success: true,
      operationDetails: [{ operateTime: '2026-10-22 11:00:00', orgName: '杭州转运中心', operateDescription: '已到达', status: '03' }],
    }));
    const r = await cainiaoClient.track(CN_CREDS, { trackingNo: 'CN123' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ time: '2026-10-22 11:00:00', description: '已到达', location: '杭州转运中心' });

    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    const li = String(form.get('logistics_interface'));
    expect(JSON.parse(li)).toEqual({ mailNo: 'CN123' });
    expect(form.get('logistic_provider_id')).toBe('edi_test');
    expect(form.get('data_digest')).toBe(cainiaoDigest(li, 'cn-secret'));
  });

  it('★ 网关白名单：只接受 *.cainiao.com（防 SSRF）', () => {
    expect(cainiaoEndpointOf({ endpoint: 'https://evil.com/x' })).toBeNull();
    expect(cainiaoEndpointOf({ endpoint: 'http://edi-daily.xpm.cainiao.com/x' })).toContain('cainiao.com');
  });

  it('★ 签名失败如实报 auth', async () => {
    mockFetch(JSON.stringify({ success: false, errorCode: '401', errorMsg: 'sign error' }));
    const r = await cainiaoClient.track(CN_CREDS, { trackingNo: 'CN1' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('auth');
  });
});

describe('4PX 递四方', () => {
  it('★★ 签名 = MD5(sorted(k+v)+body+secret) 小写；query 带 access_token', async () => {
    const fn = mockFetch(JSON.stringify({
      result: '1',
      data: { trackingList: [{ trackingTime: '2026-10-22 12:00:00', trackingDesc: '已出库', location: '深圳', trackingStatus: 'IN_TRANSIT' }] },
    }));
    const r = await fourpxClient.track(FPX_CREDS, { trackingNo: '4PX123' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ time: '2026-10-22 12:00:00', description: '已出库', location: '深圳' });

    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.hostname).toBe('open.sandbox.4px.com');
    expect(u.searchParams.get('method')).toBe('tr.order.tracking.get');
    expect(u.searchParams.get('app_key')).toBe('4px-key');
    expect(u.searchParams.get('access_token')).toBe('4px-token');
    const sign = String(u.searchParams.get('sign'));
    expect(sign).toMatch(/^[0-9a-f]{32}$/);
    const body = String(init.body);
    expect(JSON.parse(body)).toEqual({ trackingNo: '4PX123' });
    const params: Record<string, string> = {};
    for (const k of ['method', 'app_key', 'v', 'timestamp', 'format']) params[k] = String(u.searchParams.get(k));
    expect(sign).toBe(fourpxSign(params, body, '4px-secret'));
  });

  it('★ result=0 且提示签名错误 → auth', async () => {
    mockFetch(JSON.stringify({ result: '0', msg: 'sign invalid' }));
    const r = await fourpxClient.track(FPX_CREDS, { trackingNo: '4PX1' });
    expect(r.ok).toBe(false);
    expect(r.step).toBe('auth');
  });
});

describe('物流注册表', () => {
  it('★ 三家新客户端已注册，凭据字段由客户端声明', () => {
    expect(logisticsClientOf('jd-logistics')?.id).toBe('jd-logistics');
    expect(logisticsClientOf('cainiao')?.credentials.some((f) => f.key === 'secretKey' && f.secret)).toBe(true);
    expect(logisticsClientOf('4px')?.credentials.some((f) => f.key === 'accessToken' && f.secret)).toBe(true);
  });
});
