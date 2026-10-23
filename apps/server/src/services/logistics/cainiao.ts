/**
 * 菜鸟速递（EDI 轨迹）客户端（2026-10-23）。
 *
 * 菜鸟速递开放平台的轨迹接口是 EDI 形态：
 *   POST form：logistic_provider_id / data_digest / logistics_interface
 *   data_digest = Base64(MD5(logistics_interface + secretKey))（原始 MD5 字节再 base64）
 *   logistics_interface = {"mailNo":"..."}
 * 响应：{ success, errorCode, errorMsg, operationDetails:[{operateTime,orgName,operateDescription,status}] }
 *
 * ★ 网关地址由菜鸟线下提供（文档只给出测试环境 edi-daily.xpm.cainiao.com）；这里把
 *   endpoint 做成凭据字段并只允许 *.cainiao.com，避免用户填成任意主机（SSRF）。
 * ★ 尚未在真实账号联调；probe 只报接口是否响应与鉴权结果，不伪造“已连通”。
 */
import crypto from 'node:crypto';
import { fetchJson, errorDetail } from '../platform-api/http.js';
import type { CredentialField, LogisticsClient, LogisticsCredentials, TrackEvent, TrackResult, ProbeResult } from './types.js';

const PROD_ENDPOINT = 'https://edi.xpm.cainiao.com/ext/gateway/ediPracticeTrace/ediStandardPracticeTrace/api';
const TEST_ENDPOINT = 'http://edi-daily.xpm.cainiao.com/ext/gateway/ediPracticeTrace/ediStandardPracticeTrace/api';

export const CAINIAO_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'logisticProviderId', label: '对接码 logistic_provider_id', required: true,
    hint: '菜鸟速递开放平台线下提供（测试环境示例 edi_test_json）。',
  },
  {
    key: 'secretKey', label: '密钥 secretKey', required: true, secret: true,
    hint: '菜鸟提供的签名密钥，只用于计算 data_digest。',
  },
  {
    key: 'endpoint', label: '网关地址',
    options: [
      { label: '生产 edi.xpm.cainiao.com', value: PROD_ENDPOINT },
      { label: '测试 edi-daily.xpm.cainiao.com', value: TEST_ENDPOINT },
    ],
    defaultValue: PROD_ENDPOINT,
    hint: '菜鸟可能给不同客户分配不同网关；只接受 *.cainiao.com 地址。',
  },
];

/** 只允许菜鸟域名，避免把凭据发到任意主机 */
export function cainiaoEndpointOf(creds: LogisticsCredentials): string | null {
  const raw = String(creds.endpoint || PROD_ENDPOINT).trim();
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.endsWith('.cainiao.com')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Base64(MD5(content + secretKey))，取原始 16 字节再 base64 */
export function cainiaoDigest(content: string, secretKey: string): string {
  return crypto.createHash('md5').update(`${content}${secretKey}`, 'utf8').digest('base64');
}

interface CainiaoResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: 'creds' | 'network' | 'auth' | 'api';
}

export async function cainiaoTrackRequest(
  creds: LogisticsCredentials,
  mailNo: string,
): Promise<CainiaoResult> {
  const providerId = String(creds.logisticProviderId || '').trim();
  const secretKey = String(creds.secretKey || '').trim();
  if (!providerId || !secretKey) {
    return { ok: false, step: 'creds', message: '缺少 logistic_provider_id / secretKey —— 按表单提示向菜鸟速递开放平台申请' };
  }
  const endpoint = cainiaoEndpointOf(creds);
  if (!endpoint) return { ok: false, step: 'creds', message: '网关地址不合法：只接受 *.cainiao.com 的 http(s) 地址' };

  const logisticsInterface = JSON.stringify({ mailNo });
  const body = new URLSearchParams({
    logistic_provider_id: providerId,
    data_digest: cainiaoDigest(logisticsInterface, secretKey),
    logistics_interface: logisticsInterface,
  }).toString();
  const r = await fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) return { ok: false, step: r.step === 'rate' || r.step === 'enterprise' ? 'api' : r.step, message: r.error };
  const json = r.json || {};
  const message = String(json.errorMsg ?? json.errorMessage ?? json.msg ?? '');
  if (json.success === false) {
    const auth = /provider|secret|sign|auth|鉴权|签名/i.test(message);
    return { ok: false, step: auth ? 'auth' : 'api', message: `菜鸟错误（${String(json.errorCode ?? '未知')}）：${message || errorDetail(json)}` };
  }
  if (json.success !== true) {
    return { ok: false, step: 'api', message: '菜鸟返回了无法识别的响应（缺少 success），不能确认结果' };
  }
  return { ok: true, data: json };
}

function normEvents(data: Record<string, unknown> | undefined): TrackEvent[] {
  const list = (data?.operationDetails as Array<Record<string, unknown>> | undefined) || [];
  return list.map((x) => ({
    time: String(x.operateTime ?? ''),
    description: String(x.operateDescription ?? ''),
    location: x.orgName ? String(x.orgName) : undefined,
    status: x.status ? String(x.status) : undefined,
  }));
}

export const cainiaoClient: LogisticsClient = {
  id: 'cainiao',
  credentials: CAINIAO_CREDENTIAL_FIELDS,
  async probe(creds: LogisticsCredentials): Promise<ProbeResult> {
    const r = await cainiaoTrackRequest(creds, 'YZ-CONN-CHECK-0000');
    if (r.ok) return { ok: true, message: '菜鸟轨迹接口已响应（测试单号无轨迹属正常）' };
    if (r.step === 'auth' || r.step === 'creds') return { ok: false, message: r.message || '鉴权失败', step: r.step };
    if (r.step === 'network') return { ok: false, message: r.message || '网络不可达', step: 'network' };
    return { ok: false, message: r.message || '菜鸟轨迹接口返回错误', step: 'api' };
  },
  async track(creds: LogisticsCredentials, input): Promise<TrackResult> {
    try {
      const r = await cainiaoTrackRequest(creds, input.trackingNo);
      if (!r.ok) {
        return { ok: false, provider: '菜鸟', trackingNo: input.trackingNo, events: [], step: r.step === 'creds' ? 'creds' : r.step, message: r.message };
      }
      const events = normEvents(r.data);
      return {
        ok: true, provider: '菜鸟', trackingNo: input.trackingNo, events,
        ...(events.length ? {} : { message: '接口已响应，但该运单暂无可展示轨迹' }),
      };
    } catch (e) {
      return { ok: false, provider: '菜鸟', trackingNo: input.trackingNo, events: [], step: 'network', message: `请求失败：${(e as Error).message}` };
    }
  },
};
