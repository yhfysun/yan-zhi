/**
 * 平台 API 签名工具（2026-10-22）：淘宝 TOP / 拼多多 / 1688 / TikTok Shop / 万邑通 共用。
 * 纯函数，不碰网络与凭据存储。
 *
 * ★ 各平台签名差异很大，必须按官方文档逐平台实现，禁止"一个 md5 套所有"：
 *   - 淘宝 TOP：md5(secret + 排序后的 k+v 串 + secret)，大写
 *   - 拼多多：md5(client_secret + 排序后的 k+v 串 + client_secret)，大写（官方 docs 与第三方示例一致）
 *   - 1688：md5(appSecret + 排序后的 k+v 串 + appSecret)，大写
 *   - TikTok Shop：HMAC-SHA256(secret, 路径+query+body 包裹 secret)，hex（小写）
 *   - 万邑通：md5(token/client_secret + 排序后的 k+v 串 + token/client_secret)，大写
 */
import crypto from 'node:crypto';

export function md5Upper(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hmacSha1Base64(secret: string, data: string): string {
  return crypto.createHmac('sha1', secret).update(data, 'utf8').digest('base64');
}

export function hmacSha256Hex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** 把参数按 key 字典序排成 k1v1k2v2…（空值跳过） */
export function sortedParamConcat(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}${String(params[k])}`)
    .join('');
}

/** 把参数按 key 字典序排成 k1=v1&k2=v2（空值跳过），供 HMAC 系列使用 */
export function sortedQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

/** 淘宝 TOP 签名：md5(secret + sorted(k+v) + secret) 大写 */
export function topSign(params: Record<string, unknown>, appSecret: string): string {
  return md5Upper(`${appSecret}${sortedParamConcat(params)}${appSecret}`);
}

/** 拼多多签名：与 TOP 同构，md5(client_secret + sorted(k+v) + client_secret) 大写 */
export function pddSign(params: Record<string, unknown>, clientSecret: string): string {
  return md5Upper(`${clientSecret}${sortedParamConcat(params)}${clientSecret}`);
}

/** 1688 签名：与 TOP 同构（appSecret 前后包裹），大写 */
export function ali1688Sign(params: Record<string, unknown>, appSecret: string): string {
  return topSign(params, appSecret);
}
