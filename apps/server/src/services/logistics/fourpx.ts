/**
 * 4PX 递四方轨迹客户端（2026-10-23）。
 *
 * 官方开放平台（4PX 4.0）：
 *   POST https://open.4px.com/router/api/service?method=...&app_key=...&v=1.0&timestamp=...&format=json&sign=...&access_token=...
 *   sign = MD5(sorted(k+v，不含 access_token/language) + body 紧凑 JSON + appSecret) 32 位小写
 * 轨迹方法：tr.order.tracking.get；响应 { result, msg, data }，result='1' 成功。
 *
 * ★ 请求体字段按方法语义使用 { trackingNo }；不同客户/版本若有差异，以 4PX 控制台
 *   文档与联调结果为准（没有真实凭据时只做 mock 测试，不宣称已连通）。
 */
import crypto from 'node:crypto';
import { fetchJson, errorDetail } from '../platform-api/http.js';
import { sortedParamConcat } from '../platform-api/sign.js';
import type { CredentialField, LogisticsClient, LogisticsCredentials, TrackEvent, TrackResult, ProbeResult } from './types.js';

const PROD_GATEWAY = 'https://open.4px.com/router/api/service';
const SANDBOX_GATEWAY = 'https://open.sandbox.4px.com/router/api/service';
const TRACK_METHOD = 'tr.order.tracking.get';

export const FOURPX_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '4PX 开放平台 → 访问管理 → 我的 APP 里获取。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一 APP 的 App Secret，只用于本地签名。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '通过 OAuth 授权获得（客户授权给服务商/ERP）。',
  },
  {
    key: 'env', label: '环境',
    options: [
      { label: '生产 open.4px.com', value: 'prod' },
      { label: '沙箱 open.sandbox.4px.com', value: 'sandbox' },
    ],
    defaultValue: 'prod',
    hint: '联调先用沙箱；生产环境需要客户账号与 App 审核。',
  },
];

export function fourpxGatewayOf(creds: LogisticsCredentials): string {
  return String(creds.env || '') === 'sandbox' ? SANDBOX_GATEWAY : PROD_GATEWAY;
}

/** MD5(sorted(k+v) + body + appSecret) 小写 */
export function fourpxSign(params: Record<string, unknown>, body: string, appSecret: string): string {
  return crypto.createHash('md5').update(`${sortedParamConcat(params)}${body}${appSecret}`, 'utf8').digest('hex');
}

interface FourPxResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: 'creds' | 'network' | 'auth' | 'api';
}

export async function fourpxRequest(
  creds: LogisticsCredentials,
  method: string,
  bodyObj: Record<string, unknown>,
): Promise<FourPxResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!appKey || !appSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / accessToken —— 按表单提示到 4PX 开放平台获取' };
  }
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    v: '1.0',
    timestamp: String(Date.now()),
    format: 'json',
  };
  const body = JSON.stringify(bodyObj);
  const sign = fourpxSign(params, body, appSecret);
  const qs = new URLSearchParams({ ...params, sign, access_token: accessToken }).toString();
  const r = await fetchJson(`${fourpxGatewayOf(creds)}?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok) return { ok: false, step: r.step === 'rate' || r.step === 'enterprise' ? 'api' : r.step, message: r.error };
  const json = r.json || {};
  const result = String(json.result ?? '');
  if (result === '1' || result === '2') {
    return { ok: true, data: (json.data as Record<string, unknown>) || {}, ...(result === '2' ? { message: '4PX 部分成功' } : {}) };
  }
  if (result === '0') {
    const msg = String(json.msg ?? errorDetail(json));
    const auth = /auth|token|sign|permission|鉴权|签名|授权/i.test(msg);
    return { ok: false, step: auth ? 'auth' : 'api', message: `4PX 错误：${msg}` };
  }
  return { ok: false, step: 'api', message: '4PX 返回了无法识别的响应（缺少 result），不能确认结果' };
}

function normEvents(data: Record<string, unknown> | undefined): TrackEvent[] {
  const list = (
    (data?.trackingList as Array<Record<string, unknown>> | undefined)
    || (data?.trackList as Array<Record<string, unknown>> | undefined)
    || (data?.list as Array<Record<string, unknown>> | undefined)
    || []
  );
  return list.map((x) => ({
    time: String(x.trackingTime ?? x.trackingDate ?? x.time ?? ''),
    description: String(x.trackingDesc ?? x.description ?? x.desc ?? ''),
    location: x.location ? String(x.location) : undefined,
    status: x.trackingStatus ?? x.status ? String(x.trackingStatus ?? x.status) : undefined,
  }));
}

export const fourpxClient: LogisticsClient = {
  id: '4px',
  credentials: FOURPX_CREDENTIAL_FIELDS,
  async probe(creds: LogisticsCredentials): Promise<ProbeResult> {
    const r = await fourpxRequest(creds, TRACK_METHOD, { trackingNo: 'YZ-CONN-CHECK-0000' });
    if (r.ok) return { ok: true, message: '4PX 轨迹接口已响应（测试单号无轨迹属正常）' };
    if (r.step === 'auth' || r.step === 'creds') return { ok: false, message: r.message || '鉴权失败', step: r.step };
    if (r.step === 'network') return { ok: false, message: r.message || '网络不可达', step: 'network' };
    return { ok: false, message: r.message || '4PX 轨迹接口返回错误', step: 'api' };
  },
  async track(creds: LogisticsCredentials, input): Promise<TrackResult> {
    try {
      const r = await fourpxRequest(creds, TRACK_METHOD, { trackingNo: input.trackingNo });
      if (!r.ok) {
        return { ok: false, provider: '4PX', trackingNo: input.trackingNo, events: [], step: r.step === 'creds' ? 'creds' : r.step, message: r.message };
      }
      const events = normEvents(r.data);
      return {
        ok: true, provider: '4PX', trackingNo: input.trackingNo, events,
        ...(events.length ? {} : { message: r.message || '接口已响应，但该运单暂无可展示轨迹' }),
      };
    } catch (e) {
      return { ok: false, provider: '4PX', trackingNo: input.trackingNo, events: [], step: 'network', message: `请求失败：${(e as Error).message}` };
    }
  },
};
