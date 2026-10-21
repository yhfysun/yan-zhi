// 顺丰丰桥（SF Express Open Platform）物流轨迹客户端。
//
// 文档依据（2026-10-21 查证）：
//   · 接口：EXP_RECE_SEARCH_ROUTES（路由查询），POST form-urlencoded
//   · 生产：https://bspgw.sf-express.com/std/service
//     沙箱：https://sfapi-sbox.sf-express.com/std/service
//   · 公共参数：partnerID / requestID / serviceCode / timestamp / msgData / msgDigest
//   · 签名：msgDigest = Base64( MD5( msgData + timestamp + checkword ) )
//   · 业务报文 msgData（JSON 字符串）：trackingType=1 按顺丰运单号、=2 按客户订单号；
//     trackingNumber 为号码数组；可选 checkPhoneNo（收寄人手机号后四位，逗号分隔）
//   · 响应：{ success, errorCode, errorMsg, msgData }，其中 msgData 是字符串，
//     解析后 routeResps[].routes[] 为轨迹节点
//
// ★ 未验证声明：本客户端按官方文档实现，但**没有在真实丰桥账号上跑通过** —— 需要
//   partnerID + checkword（丰桥控制台申请）。跑不通时 probe/track 会给出具体错误码
//   （A1006 签名错 / A1003 IP 未放行 / A1004 无接口权限），不会假装成功。
import crypto from 'node:crypto';
import {
  missingFields, netFailure,
  type CredentialField, type LogisticsClient, type LogisticsCredentials,
  type ProbeResult, type TrackEvent, type TrackInput, type TrackResult,
} from './types.js';

const URL_PROD = 'https://bspgw.sf-express.com/std/service';
const URL_SANDBOX = 'https://sfapi-sbox.sf-express.com/std/service';
const SERVICE_ROUTES = 'EXP_RECE_SEARCH_ROUTES';
const TIMEOUT_MS = 15_000;

const credentials: CredentialField[] = [
  {
    key: 'partnerID', label: '顾客编码 partnerID', required: true,
    placeholder: '丰桥控制台分配的 clientCode',
    hint: '丰桥控制台 → 应用详情里获取。',
  },
  {
    key: 'checkword', label: '校验码 checkword', required: true, secret: true,
    placeholder: '丰桥控制台分配的 checkword',
    hint: '只用于本地计算 msgDigest，加密存储、永不回显。',
  },
  {
    key: 'env', label: '环境', defaultValue: 'prod',
    options: [{ label: '生产环境', value: 'prod' }, { label: '沙箱环境', value: 'sandbox' }],
  },
  {
    key: 'baseUrl', label: '自定义接口地址（可选）',
    placeholder: '留空使用官方地址',
    hint: '丰桥下发的地址与文档不一致时再填。',
  },
];

function baseUrlOf(creds: LogisticsCredentials): string {
  const custom = String(creds.baseUrl || '').trim();
  if (custom) return custom;
  return String(creds.env || 'prod') === 'sandbox' ? URL_SANDBOX : URL_PROD;
}

/** 文档规定的签名：Base64(MD5(msgData + timestamp + checkword)) */
export function signSf(msgData: string, timestamp: string, checkword: string): string {
  return crypto.createHash('md5').update(msgData + timestamp + checkword, 'utf8').digest('base64');
}

interface SfEnvelope {
  success?: boolean | string;
  errorCode?: string;
  errorMsg?: string;
  msgData?: string;
}

async function callSf(
  creds: LogisticsCredentials,
  serviceCode: string,
  business: Record<string, unknown>,
): Promise<{ ok: true; envelope: SfEnvelope } | { ok: false; result: TrackResult }> {
  const timestamp = String(Date.now());
  const msgData = JSON.stringify(business);
  const form = new URLSearchParams({
    partnerID: String(creds.partnerID || '').trim(),
    requestID: crypto.randomUUID().replace(/-/g, ''),
    serviceCode,
    timestamp,
    msgData,
    msgDigest: signSf(msgData, timestamp, String(creds.checkword || '')),
  });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(baseUrlOf(creds), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        result: {
          ok: false, provider: '顺丰丰桥', trackingNo: '', events: [], step: 'network',
          message: `HTTP ${res.status}：${text.slice(0, 300)}`,
        },
      };
    }
    try {
      return { ok: true, envelope: JSON.parse(text) as SfEnvelope };
    } catch {
      return {
        ok: false,
        result: {
          ok: false, provider: '顺丰丰桥', trackingNo: '', events: [], step: 'parse',
          message: `响应不是 JSON：${text.slice(0, 300)}`,
        },
      };
    }
  } catch (e) {
    return { ok: false, result: netFailure('顺丰丰桥', '', e) };
  } finally {
    clearTimeout(timer);
  }
}

function isSuccess(env: SfEnvelope): boolean {
  return env.success === true || env.success === 'true';
}

/** 把丰桥错误码翻译成"该去改什么" */
function stepOfCode(code: string): 'auth' | 'api' {
  if (code === 'A1006' || code === 'A1003' || code === 'A1004' || code === 'A1011') return 'auth';
  return 'api';
}

const client: LogisticsClient = {
  id: 'sf-express',
  credentials,

  async probe(creds): Promise<ProbeResult> {
    const missing = missingFields(client, creds);
    if (missing.length) return { ok: false, step: 'creds', message: `缺少：${missing.join('、')}` };

    // 用一个不存在的运单号探活：签名/权限正确时接口整体 success=true（路由为空是正常的）
    const r = await callSf(creds, SERVICE_ROUTES, {
      language: 'zh-CN', trackingType: 1, trackingNumber: ['000000000000'], methodType: 1,
    });
    if (!r.ok) return { ok: false, step: r.result.step, message: r.result.message || '请求失败' };
    const env = r.envelope;
    if (isSuccess(env)) return { ok: true, message: '签名与接口权限校验通过（探活查询未返回路由属正常）' };
    const code = String(env.errorCode || '');
    return {
      ok: false,
      step: stepOfCode(code),
      message: `${code || '未知错误'}：${env.errorMsg || '接口返回失败'}`,
    };
  },

  async track(creds, input: TrackInput): Promise<TrackResult> {
    const missing = missingFields(client, creds);
    if (missing.length) {
      return { ok: false, provider: '顺丰丰桥', trackingNo: input.trackingNo, events: [], step: 'creds', message: `缺少凭据：${missing.join('、')}` };
    }
    if (!input.trackingNo.trim()) {
      return { ok: false, provider: '顺丰丰桥', trackingNo: '', events: [], step: 'api', message: '运单号为空' };
    }

    const business: Record<string, unknown> = {
      language: 'zh-CN',
      trackingType: input.orderNo ? 2 : 1,
      trackingNumber: [input.orderNo || input.trackingNo],
      methodType: 1,
    };
    if (input.phone) business.checkPhoneNo = input.phone;

    const r = await callSf(creds, SERVICE_ROUTES, business);
    if (!r.ok) return { ...r.result, trackingNo: input.trackingNo };

    const env = r.envelope;
    if (!isSuccess(env)) {
      const code = String(env.errorCode || '');
      return {
        ok: false, provider: '顺丰丰桥', trackingNo: input.trackingNo, events: [],
        step: stepOfCode(code),
        message: `${code || '未知错误'}：${env.errorMsg || '接口返回失败'}`,
      };
    }

    let parsed: { routeResps?: Array<{ mailNo?: string; routes?: Array<Record<string, unknown>>; reasonRemark?: string }> };
    try {
      parsed = JSON.parse(String(env.msgData || '{}')) as typeof parsed;
    } catch {
      return { ok: false, provider: '顺丰丰桥', trackingNo: input.trackingNo, events: [], step: 'parse', message: 'msgData 不是合法 JSON' };
    }

    const routeResp = parsed.routeResps?.[0];
    const routes = routeResp?.routes || [];
    const events: TrackEvent[] = routes.map((n) => ({
      time: String(n.acceptTime ?? ''),
      description: String(n.remark ?? ''),
      location: n.acceptAddress ? String(n.acceptAddress) : undefined,
      status: n.secondaryStatusName ? String(n.secondaryStatusName) : undefined,
    }));

    if (!events.length) {
      return {
        ok: true, provider: '顺丰丰桥', trackingNo: input.trackingNo, events: [],
        message: routeResp?.reasonRemark
          ? `暂无路由：${routeResp.reasonRemark}`
          : '暂无路由（可查近 3 个月；月结运单需 partnerID 与月结卡号绑定）',
      };
    }
    return { ok: true, provider: '顺丰丰桥', trackingNo: input.trackingNo, events };
  },
};

export const sfClient = client;
