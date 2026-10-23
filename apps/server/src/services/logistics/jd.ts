/**
 * 京东物流轨迹客户端（2026-10-23）。
 *
 * 走京东宙斯开放平台（Jos）网关，与淘宝 TOP 同构的 MD5 签名：
 *   sign = MD5(appSecret + sorted(k+v，空值跳过) + appSecret) 大写
 * 轨迹接口：jingdong.ldop.receive.trace.get，业务参数放在 `360buy_param_json`。
 * 官方要求先用 code 换 access_token；token 过期会返回 error_response（常见 code 19）。
 *
 * ★ 诚实边界：接口方法/字段按公开资料实现，尚未在真实账号上联调；没有凭据时
 *   probe 只会如实报鉴权/网络错误，绝不返回“已连通”。
 */
import { fetchJson, errorDetail } from '../platform-api/http.js';
import { topSign } from '../platform-api/sign.js';
import type { CredentialField, LogisticsClient, LogisticsCredentials, TrackEvent, TrackResult, ProbeResult } from './types.js';

const GATEWAY = 'https://api.jd.com/routerjson';
const TRACE_METHOD = 'jingdong.ldop.receive.trace.get';

export const JD_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '京东宙斯开放平台（jos.jd.com）创建应用后获得。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一应用的 App Secret，只用于本地签名，不会随请求发出。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '应用授权后换取（open-oauth.jd.com）。过期后轨迹接口会返回 error_response（常见 code 19）。',
  },
  {
    key: 'customerCode', label: '商家编码 customerCode', required: true,
    hint: '京东物流给商家的客户编码（如 010Kxxxx），轨迹查询必填。',
  },
];

function timestampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function jdSign(params: Record<string, unknown>, appSecret: string): string {
  return topSign(params, appSecret);
}

interface JdResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: 'creds' | 'network' | 'auth' | 'api';
}

export async function jdRequest(
  creds: LogisticsCredentials,
  method: string,
  paramJson: Record<string, unknown>,
): Promise<JdResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!appKey || !appSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / accessToken —— 按表单提示到京东宙斯开放平台获取' };
  }
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    access_token: accessToken,
    timestamp: timestampNow(),
    v: '2.0',
    '360buy_param_json': JSON.stringify(paramJson),
  };
  params.sign = jdSign(params, appSecret);
  const r = await fetchJson(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!r.ok) return { ok: false, step: r.step === 'rate' || r.step === 'enterprise' ? 'api' : r.step, message: r.error };
  const json = r.json || {};
  const err = json.error_response as Record<string, unknown> | undefined;
  if (err) {
    const code = String(err.code ?? err.error_code ?? '');
    const detail = errorDetail({ error_response: err }, `错误码 ${code || '未知'}`);
    const auth = code === '19' || /token|sign|auth|授权|过期/i.test(detail);
    return { ok: false, step: auth ? 'auth' : 'api', message: `京东错误（${code || '未知'}）：${detail}` };
  }
  // 京东返回键是 `*_responce`（官方历史拼写），也兼容 `_response`
  const key = Object.keys(json).find((k) => k.endsWith('_responce') || k.endsWith('_response'));
  if (!key) return { ok: false, step: 'api', message: '京东返回了无法识别的响应（缺少业务响应字段），不能确认结果' };
  return { ok: true, data: (json[key] as Record<string, unknown>) || {} };
}

function normEvents(data: Record<string, unknown> | undefined): TrackEvent[] {
  const q = (data?.querytrace_result as Record<string, unknown> | undefined) || {};
  const list = (q.data as Array<Record<string, unknown>> | undefined) || [];
  return list.map((x) => ({
    time: String(x.opeTime ?? ''),
    description: String(x.opeRemark ?? x.opeTitle ?? ''),
    status: x.opeTitle ? String(x.opeTitle) : undefined,
  }));
}

export const jdClient: LogisticsClient = {
  id: 'jd-logistics',
  credentials: JD_CREDENTIAL_FIELDS,
  async probe(creds: LogisticsCredentials): Promise<ProbeResult> {
    if (!String(creds.customerCode || '').trim()) {
      return { ok: false, message: '缺少商家编码 customerCode', step: 'creds' };
    }
    // 用明显的测试单号探测：能拿到业务响应就说明凭据可用；无数据属正常
    const r = await jdRequest(creds, TRACE_METHOD, {
      customerCode: String(creds.customerCode || '').trim(),
      waybillCode: 'YZ-CONN-CHECK-0000',
    });
    if (r.ok) return { ok: true, message: '京东轨迹接口已响应（测试单号无轨迹属正常）' };
    if (r.step === 'auth' || r.step === 'creds') return { ok: false, message: r.message || '鉴权失败', step: r.step };
    if (r.step === 'network') return { ok: false, message: r.message || '网络不可达', step: 'network' };
    // 业务错误（单号格式/商家编码/权限）也是真失败，不能包装成“已响应”
    return { ok: false, message: r.message || '京东轨迹接口返回错误', step: 'api' };
  },
  async track(creds: LogisticsCredentials, input): Promise<TrackResult> {
    const customerCode = String(creds.customerCode || '').trim();
    if (!customerCode) {
      return { ok: false, provider: '京东物流', trackingNo: input.trackingNo, events: [], step: 'creds', message: '缺少商家编码 customerCode' };
    }
    try {
      const r = await jdRequest(creds, TRACE_METHOD, { customerCode, waybillCode: input.trackingNo });
      if (!r.ok) {
        return { ok: false, provider: '京东物流', trackingNo: input.trackingNo, events: [], step: r.step === 'creds' ? 'creds' : r.step === 'auth' ? 'auth' : r.step === 'network' ? 'network' : 'api', message: r.message };
      }
      const events = normEvents(r.data);
      return {
        ok: true, provider: '京东物流', trackingNo: input.trackingNo, events,
        ...(events.length ? {} : { message: '接口已响应，但该运单暂无可展示轨迹' }),
      };
    } catch (e) {
      return { ok: false, provider: '京东物流', trackingNo: input.trackingNo, events: [], step: 'network', message: `请求失败：${(e as Error).message}` };
    }
  },
};
