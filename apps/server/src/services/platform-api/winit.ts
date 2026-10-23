/**
 * WINIT（万邑通）开放平台客户端（2026-10-22）。
 *
 * 形态与电商平台不同：单一 POST 入口 + `action` 字段；双签名（卖家 token + 应用 client_secret）。
 * 官方文档：https://developer.winit.com.cn/document/detail/id/6.html（签名）
 *          https://developer.winit.com.cn/document/detail/id/307.html（API 字典）
 *
 * 签名（MD5 大写）：
 *   参与签名：action / app_key / data / format / platform / sign_method / timestamp / version
 *   sign        = md5(token + sorted(k+v) + token)
 *   client_sign = md5(client_secret + sorted(k+v) + client_secret)
 *   timestamp 固定格式 yyyy-MM-dd HH:mm:ss；data 内部 JSON 递归按 key 排序。
 *
 * 能力：test / product.list / product.stock（库存查询）/ order.list（出库单）/ order.ship（创建出库单）。
 * 不适用：改价、上下架（万邑通不管理销售平台的价格与 listing）。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { md5Upper, sortedParamConcat } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const PROD_BASE = 'https://openapi.winit.com.cn/openapi/service';
const SANDBOX_BASE = 'https://sandboxopenapi.winit.com.cn/openapi/service';

export const WINIT_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App Key（卖家账号）', required: true,
    hint: '万邑联账号（通常是登录邮箱）；在 developer.winit.com.cn 创建应用后按文档填写。',
  },
  {
    key: 'token', label: '授权 Token', required: true, secret: true,
    hint: '卖家登录万邑联个人中心完成应用授权后获得的 token（有效期约 18 个月；卖家刷新会使旧 token 失效）。',
  },
  {
    key: 'platform', label: '应用 Code（platform）', required: true,
    hint: '创建应用时生成的 platform 字段。',
  },
  {
    key: 'clientId', label: 'Client ID', required: true,
    hint: '开发者控制台 → 应用详情里的 client_id（参与请求，不参与签名）。',
  },
  {
    key: 'clientSecret', label: 'Client Secret', required: true, secret: true,
    hint: '应用详情里的 client_secret，仅用于计算 client_sign，不会随请求发出。',
  },
  {
    key: 'baseUrl', label: 'API 环境',
    options: [
      { label: '生产 openapi.winit.com.cn', value: PROD_BASE },
      { label: '沙箱 sandboxopenapi.winit.com.cn', value: SANDBOX_BASE },
    ],
    defaultValue: PROD_BASE,
    hint: '联调用沙箱；正式用生产。',
  },
];

export function parseWinitCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const token = String(o.token ?? '').trim();
  const platform = String(o.platform ?? '').trim();
  const clientId = String(o.clientId ?? '').trim();
  const clientSecret = String(o.clientSecret ?? '').trim();
  if (!appKey || !token || !platform || !clientId || !clientSecret) return null;
  return {
    appKey, token, platform, clientId, clientSecret,
    baseUrl: String(o.baseUrl ?? PROD_BASE).trim() || PROD_BASE,
  };
}

/** 递归按 key 排序的 JSON 序列化（万邑通要求 data 内部字段也排序，且签名串与实际发送一致） */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function timestampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface WinitCallResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

export async function winitRequest(
  creds: PlatformCredentialValues,
  action: string,
  data: Record<string, unknown> = {},
): Promise<WinitCallResult> {
  const appKey = String(creds.appKey || '').trim();
  const token = String(creds.token || '').trim();
  const platform = String(creds.platform || '').trim();
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  if (!appKey || !token || !platform || !clientId || !clientSecret) {
    return { ok: false, step: 'creds', message: '缺少 appKey / token / platform / clientId / clientSecret —— 按表单提示到万邑通开发者控制台获取' };
  }
  const dataStr = stableStringify(data);
  const signed: Record<string, unknown> = {
    action,
    app_key: appKey,
    data: dataStr,
    format: 'json',
    platform,
    sign_method: 'md5',
    timestamp: timestampNow(),
    version: '1.0',
  };
  const base = sortedParamConcat(signed);
  const sign = md5Upper(`${token}${base}${token}`);
  const clientSign = md5Upper(`${clientSecret}${base}${clientSecret}`);
  const body = { ...signed, client_id: clientId, sign, client_sign: clientSign };

  const url = String(creds.baseUrl || '') === SANDBOX_BASE ? SANDBOX_BASE : PROD_BASE;
  const r = await fetchJson(url, { method: 'POST', body });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  // ★ 成功必须由平台明确给出：`success:true` 或 `code:'0'`。
  //   之前 `code === ''` 也算成功，网关返回 200 + HTML/空 JSON 时会谎报“已连接/已创建”。
  const code = String(json.code ?? json.error_code ?? '');
  const success = json.success === true || code === '0';
  if (!success) {
    if (!code && json.success === undefined) {
      return { ok: false, step: 'api', message: '万邑通返回了无法识别的响应（缺少 success/code），不能确认结果' };
    }
    const msg = errorDetail(json, `错误码 ${code || '未知'}`);
    const step = /token|auth|sign/i.test(msg) ? 'auth' : 'api';
    return { ok: false, step, message: `万邑通错误（${code || '未知'}）：${msg}` };
  }
  const payload = (json.data as Record<string, unknown>) || (json.result as Record<string, unknown>) || {};
  return { ok: true, data: payload };
}

export async function winitTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  // queryWarehouse 无必填业务参数，是最轻的只读探针
  const r = await winitRequest(creds, 'queryWarehouse', {});
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const payload = (r.data as { warehouseList?: unknown[]; list?: unknown[] } | undefined);
  const n = Array.isArray(payload?.warehouseList)
    ? payload!.warehouseList!.length
    : Array.isArray(payload?.list) ? payload!.list!.length : 0;
  return { ok: true, message: `已连接万邑通${n ? `（可见 ${n} 个仓库）` : ''}` };
}

// ---------- 业务能力 ----------
export async function winitListProducts(creds: PlatformCredentialValues, opts: { pageNo?: number; pageSize?: number; skuCode?: string } = {}) {
  return winitRequest(creds, 'winit.mms.item.list', {
    pageNo: opts.pageNo ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 200),
    ...(opts.skuCode ? { skuCode: opts.skuCode } : {}),
  });
}

export async function winitInventory(creds: PlatformCredentialValues, opts: { productCode?: string; warehouseCode?: string; pageNum?: number; pageSize?: number } = {}) {
  return winitRequest(creds, 'queryProductInventoryList4Page', {
    inventoryType: 'Warehouse',
    pageNum: opts.pageNum ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 200),
    ...(opts.productCode ? { productCode: opts.productCode } : {}),
    ...(opts.warehouseCode ? { warehouseCode: opts.warehouseCode } : {}),
  });
}

export async function winitListOutbound(creds: PlatformCredentialValues, opts: { pageNum?: number; pageSize?: number; status?: string; trackingNo?: string } = {}) {
  return winitRequest(creds, 'queryOutboundOrderList', {
    pageNum: opts.pageNum ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 200),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.trackingNo ? { trackingNo: opts.trackingNo } : {}),
  });
}

/** 创建出库单（发货）：字段较多，调用方传入履约明细（productList / 收件人 / 仓库等） */
export async function winitCreateOutbound(creds: PlatformCredentialValues, order: Record<string, unknown>) {
  return winitRequest(creds, 'wh.outbound.createSubmittedOrder', order);
}

/** 轨迹：支持万邑通单号或跟踪号，最多 30 个 */
export async function winitTrack(creds: PlatformCredentialValues, trackingNos: string[]) {
  return winitRequest(creds, 'tracking.getOrderVerdorTracking', { trackingnos: trackingNos.slice(0, 30).join(',') });
}

export const winitPlatformClient: PlatformApiClient = {
  id: 'winit',
  label: 'WINIT 开放平台',
  credentialFields: WINIT_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'inventory.get', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseWinitCreds(raw),
  test: winitTest,
};
