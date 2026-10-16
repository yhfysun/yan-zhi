// 亚马逊 SP-API（Selling Partner API）最小客户端：LWA 换 token + SigV4 签名 + 一次真调用。
//
// ★ 为什么要有它：店铺运营的写操作目前靠 pageAgent 驱动浏览器 —— 能用，但脆弱（页面改版/风控/
//   频率限制全踩）。亚马逊提供官方 API，拿到凭据后调它远比点 DOM 稳。本模块把「凭据能不能用」
//   做成一次真实的连通性检查：配置错了立刻报错，而不是等某次抓数失败才发现。
//
// ★★ 未验证声明（必须说清）：本模块的代码路径**没有在真实卖家账号上跑通过** —— 需要
//   LWA 应用（clientId/clientSecret/refreshToken）+ 一个已授权的 IAM 用户（AK/SK）。
//   拿到凭据后 spApiCheck 会走完整链路（换 token → 签名 → 调 marketplaceParticipations），
//   任何一步失败都会给出**具体是哪一步**，不会假装成功。
//
// 凭据存放：加密后存在店铺连接的 secretEnc 里（JSON 字符串，经 utils/crypto 加密）。
//   本模块不碰数据库、不落盘、不打印凭据。
import crypto from 'node:crypto';

/** SP-API 凭据（写进店铺连接的 secretEnc，整体加密） */
export interface AmazonSpApiCreds {
  /** LWA 应用的 client id（形如 amzn1.application-oa2-client.xxx） */
  clientId: string;
  clientSecret: string;
  /** 授权得到的 refresh token（形如 Atzr|...） */
  refreshToken: string;
  /** SigV4 用的 IAM 凭据（SP-API 调用必需） */
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  /** 分区：na（北美）/ eu（欧洲）/ fe（远东） */
  region?: 'na' | 'eu' | 'fe';
}

/** 检查失败的步骤：creds=凭据没配 / lwa=换 token 失败 / sigv4=缺 IAM 凭据或签名错 / api=调用被拒 */
export type SpApiCheckStep = 'creds' | 'lwa' | 'sigv4' | 'api';
export type SpApiCheck =
  | { ok: true; marketplaces: string[]; note: string }
  | { ok: false; step: SpApiCheckStep; reason: string };

const HOSTS: Record<string, string> = {
  na: 'sellingpartnerapi-na.amazon.com',
  eu: 'sellingpartnerapi-eu.amazon.com',
  fe: 'sellingpartnerapi-fe.amazon.com',
};
const LWA_URL = 'https://api.amazon.com/auth/o2/token';
const SPAPI_SERVICE = 'execute-api';

/** 解析店铺连接里存的凭据 JSON；缺必填项返回 null（调用方据此提示"未配置"） */
export function parseSpApiCreds(raw: string): AmazonSpApiCreds | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<AmazonSpApiCreds>;
    if (!o.clientId || !o.clientSecret || !o.refreshToken) return null;
    return {
      clientId: String(o.clientId),
      clientSecret: String(o.clientSecret),
      refreshToken: String(o.refreshToken),
      awsAccessKeyId: o.awsAccessKeyId ? String(o.awsAccessKeyId) : undefined,
      awsSecretAccessKey: o.awsSecretAccessKey ? String(o.awsSecretAccessKey) : undefined,
      awsSessionToken: o.awsSessionToken ? String(o.awsSessionToken) : undefined,
      region: o.region === 'eu' || o.region === 'fe' ? o.region : 'na',
    };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** LWA：用 refresh token 换 access token（这步能过，说明 clientId/secret/refreshToken 是对的） */
export async function lwaAccessToken(creds: AmazonSpApiCreds): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const res = await fetchWithTimeout(LWA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LWA ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error(`LWA 返回里没有 access_token: ${text.slice(0, 200)}`);
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

const sha256Hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmacBuf = (key: crypto.BinaryLike, data: string) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const hmacHex = (key: crypto.BinaryLike, data: string) => crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');

/** 派生 SigV4 签名密钥（AWS 文档标准四步） */
function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacBuf(`AWS4${secret}`, date);
  const kRegion = hmacBuf(kDate, region);
  const kService = hmacBuf(kRegion, service);
  return hmacBuf(kService, 'aws4_request');
}

/**
 * 对 SP-API 发一个 SigV4 签名的 GET。
 * ★ 只支持 GET + 查询串（本模块只需要 marketplaceParticipations 这一支），
 *   不假装是通用客户端；要扩展写操作再说。
 */
export async function spApiGet(
  creds: AmazonSpApiCreds,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
    const e = new Error('缺少 IAM 凭据（awsAccessKeyId / awsSecretAccessKey）—— SP-API 调用必须用 SigV4 签名');
    (e as Error & { step?: SpApiCheckStep }).step = 'sigv4';
    throw e;
  }
  const region = creds.region || 'na';
  const host = HOSTS[region];
  const { accessToken } = await lwaAccessToken(creds);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');

  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-access-token': accessToken,
  };
  if (creds.awsSessionToken) headers['x-amz-security-token'] = creds.awsSessionToken;

  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(';');
  const canonicalHeaders = `${sortedKeys.map((k) => `${k}:${headers[k].trim()}`).join('\n')}\n`;
  const canonicalRequest = ['GET', path, canonicalQuery, canonicalHeaders, signedHeaders, sha256Hex('')].join('\n');

  const scope = `${dateStamp}/${region}/${SPAPI_SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmacHex(signingKey(creds.awsSecretAccessKey, dateStamp, region, SPAPI_SERVICE), stringToSign);

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${creds.awsAccessKeyId}/${scope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  const res = await fetchWithTimeout(url, { method: 'GET', headers: { ...headers, authorization: authHeader } });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`SP-API ${res.status}: ${text.slice(0, 300)}`);
    (e as Error & { step?: SpApiCheckStep }).step = 'api';
    throw e;
  }
  return text ? JSON.parse(text) : {};
}

/**
 * 连通性检查：换 token → 签名 → 调一次 marketplaceParticipations。
 * 任一环节失败都返回**具体是哪一步**失败，便于用户定位（而不是笼统的"连接失败"）。
 */
export async function spApiCheck(creds: AmazonSpApiCreds): Promise<SpApiCheck> {
  try {
    const data = (await spApiGet(creds, '/sellers/v1/marketplaceParticipations')) as {
      payload?: Array<{ marketplace?: { id?: string; countryCode?: string; name?: string } }>;
    };
    const marketplaces = (data.payload || [])
      .map((p) => [p.marketplace?.countryCode, p.marketplace?.name].filter(Boolean).join(' '))
      .filter(Boolean);
    return {
      ok: true,
      marketplaces,
      note: marketplaces.length
        ? `已授权的站点：${marketplaces.join('、')}`
        : '凭据可用，但该应用尚未授权任何站点（去卖家中心完成授权）',
    };
  } catch (e) {
    const err = e as Error & { step?: SpApiCheckStep };
    const msg = err.message || String(e);
    if (err.step === 'sigv4' || /缺少 IAM 凭据/.test(msg)) return { ok: false, step: 'sigv4', reason: msg };
    if (/LWA /.test(msg)) return { ok: false, step: 'lwa', reason: msg };
    return { ok: false, step: 'api', reason: msg };
  }
}
