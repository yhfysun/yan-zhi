// 云途物流（YunExpress）物流轨迹客户端 —— OMS 接口版。
//
// 文档依据（官方《云途物流 API 接口开发规范（OMS 版）》PDF，2026-10-21 查证）：
//   · 鉴权：Token = Base64(客户编号 + "&" + ApiSecret)
//     请求头 Authorization: Basic <Token>（Basic 与 Token 之间有空格）
//   · 轨迹：GET {ADDR}/api/Tracking/GetTrackAllInfo?OrderNumber=<运单号或跟踪号>
//   · 响应：{ Item: { WaybillNumber, TrackingNumber, PackageState, OrderTrackingDetails[] },
//            Code, Message, RequestId, TimeStamp }，Code="0000" 为成功
//   · PackageState：0 未知 / 1 已提交 / 2 运输中 / 3 已签收 / 4 已收货 /
//                   5 订单取消 / 6 投递失败 / 7 已退回
//
// ★ 关于 ADDR：云途的接口地址由业务方按客户下发（测试/生产不同），文档里写作 http://ADDR，
//   所以这里**必须由用户填写 baseUrl**，不给默认值，避免把请求打到别人的环境。
// ★ 未验证声明：按文档实现，未在真实云途账号上跑通过；错误会如实返回 Code/Message。
import {
  missingFields, netFailure,
  type CredentialField, type LogisticsClient, type LogisticsCredentials,
  type ProbeResult, type TrackEvent, type TrackInput, type TrackResult,
} from './types.js';

const TIMEOUT_MS = 15_000;

const PACKAGE_STATE: Record<number, string> = {
  0: '未知', 1: '已提交', 2: '运输中', 3: '已签收', 4: '已收货', 5: '订单取消', 6: '投递失败', 7: '已退回',
};

const credentials: CredentialField[] = [
  {
    key: 'baseUrl', label: '接口地址', required: true,
    placeholder: '云途下发的 ADDR，如 https://oms.example.com',
    hint: '不要带结尾斜杠；测试环境与生产环境由云途分别下发。',
  },
  {
    key: 'customerNo', label: '客户编号', required: true,
    placeholder: '如 ITC0893791',
    hint: '云途业务部门开通 API 后提供的客户身份编号。',
  },
  {
    key: 'apiSecret', label: 'ApiSecret', required: true, secret: true,
    placeholder: '云途下发的接口密钥',
    hint: '与客户编号拼接后 Base64 生成 Token；加密存储、永不回显。',
  },
];

/** 文档规定的 Token：Base64(客户编号 + "&" + ApiSecret)，请求头 Authorization: Basic <Token> */
export function yunExpressToken(customerNo: string, apiSecret: string): string {
  return Buffer.from(`${customerNo}&${apiSecret}`, 'utf8').toString('base64');
}

function tokenOf(creds: LogisticsCredentials): string {
  return yunExpressToken(String(creds.customerNo || '').trim(), String(creds.apiSecret || ''));
}

function apiBase(creds: LogisticsCredentials): string {
  return String(creds.baseUrl || '').trim().replace(/\/+$/, '');
}

interface YunItem {
  WaybillNumber?: string;
  TrackingNumber?: string;
  PackageState?: number;
  OrderTrackingDetails?: Array<Record<string, unknown>>;
  ProviderName?: string;
  ProviderSite?: string;
}

interface YunEnvelope {
  Item?: YunItem;
  Code?: string;
  Message?: string;
  RequestId?: string;
  TimeStamp?: string;
}

async function callYun(
  creds: LogisticsCredentials,
  orderNumber: string,
): Promise<{ ok: true; envelope: YunEnvelope; httpStatus: number } | { ok: false; result: TrackResult }> {
  const url = `${apiBase(creds)}/api/Tracking/GetTrackAllInfo?OrderNumber=${encodeURIComponent(orderNumber)}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${tokenOf(creds)}`,
      },
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        result: {
          ok: false, provider: '云途物流', trackingNo: orderNumber, events: [],
          step: res.status === 401 || res.status === 403 ? 'auth' : 'network',
          message: `HTTP ${res.status}：${text.slice(0, 300)}`,
        },
      };
    }
    try {
      return { ok: true, envelope: JSON.parse(text) as YunEnvelope, httpStatus: res.status };
    } catch {
      return {
        ok: false,
        result: {
          ok: false, provider: '云途物流', trackingNo: orderNumber, events: [], step: 'parse',
          message: `响应不是 JSON：${text.slice(0, 300)}`,
        },
      };
    }
  } catch (e) {
    return { ok: false, result: netFailure('云途物流', orderNumber, e) };
  } finally {
    clearTimeout(timer);
  }
}

const client: LogisticsClient = {
  id: 'yunexpress',
  credentials,

  async probe(creds): Promise<ProbeResult> {
    const missing = missingFields(client, creds);
    if (missing.length) return { ok: false, step: 'creds', message: `缺少：${missing.join('、')}` };

    // 不存在的单号：鉴权通过时通常返回 Code=0000（Item 为空）；鉴权失败会返回错误码或 401
    const r = await callYun(creds, 'PROBE0000000000');
    if (!r.ok) return { ok: false, step: r.result.step, message: r.result.message || '请求失败' };
    const code = String(r.envelope.Code ?? '');
    if (code === '0000') return { ok: true, message: 'Token 认证通过（探活单号无轨迹属正常）' };
    return {
      ok: false,
      step: 'auth',
      message: `${code || '未知错误'}：${r.envelope.Message || '接口返回失败'}`,
    };
  },

  async track(creds, input: TrackInput): Promise<TrackResult> {
    const missing = missingFields(client, creds);
    if (missing.length) {
      return { ok: false, provider: '云途物流', trackingNo: input.trackingNo, events: [], step: 'creds', message: `缺少凭据：${missing.join('、')}` };
    }
    const no = (input.orderNo || input.trackingNo).trim();
    if (!no) {
      return { ok: false, provider: '云途物流', trackingNo: '', events: [], step: 'api', message: '运单号为空' };
    }

    const r = await callYun(creds, no);
    if (!r.ok) return { ...r.result, trackingNo: input.trackingNo };

    const env = r.envelope;
    const code = String(env.Code ?? '');
    if (code !== '0000') {
      return {
        ok: false, provider: '云途物流', trackingNo: input.trackingNo, events: [],
        step: code === '1001' || code === '1002' ? 'auth' : 'api',
        message: `${code || '未知错误'}：${env.Message || '接口返回失败'}`,
      };
    }

    const item = env.Item;
    if (!item) {
      return { ok: true, provider: '云途物流', trackingNo: input.trackingNo, events: [], message: '暂无轨迹（单号可能尚未被云途接收）' };
    }

    const details = item.OrderTrackingDetails || [];
    const events: TrackEvent[] = details.map((d) => {
      const locationBits = [d.ProcessCountry, d.ProcessProvince, d.ProcessCity]
        .map((x) => (x ? String(x) : ''))
        .filter(Boolean);
      return {
        time: String(d.ProcessDate ?? ''),
        description: String(d.ProcessContent ?? d.TrackCodeDescription ?? ''),
        location: locationBits.length ? locationBits.join(' ') : undefined,
      };
    });
    // 接口按时间正序返回；控制台按"最新在前"阅读更顺
    events.reverse();

    const state = typeof item.PackageState === 'number' ? PACKAGE_STATE[item.PackageState] : undefined;
    return {
      ok: true,
      provider: '云途物流',
      trackingNo: String(item.TrackingNumber || item.WaybillNumber || input.trackingNo),
      events,
      message: state ? `当前状态：${state}${item.ProviderName ? ` · 末端：${item.ProviderName}` : ''}` : undefined,
    };
  },
};

export const yunExpressClient = client;
