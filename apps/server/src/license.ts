import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import os from 'node:os';

const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAudaPf8W9lEYSASD8ZeAd
gHjDrN/DLpJbQLn3DrpNeKdqa2FkAIs5UuuoY7aCfjOSsnyO6gpIo3ZVTPsE2Fyw
OB43b3NsfElR7CY7sGiRB+X/SmOPiEStLpBnvI6yZCtl98GVyPZlxPxPgFk9FRxP
TYqes1L2jRu2D+wNmJNAwYTOKB5vo1lAfPyK8j/43wkzftRhGTlIuxmGBJMnIrBv
efa/AXMxFjukBEfzQ5EmewMT43sV2TAy3AstjPaPmsJfJ3arTWFnM0CcdLOj6yIo
cInEgmQ8Gf7Wfg9hHLpr7aoWMM6jJGrPmtj6SONg8GW6SPXg9O3BuS5AN8azgevF
gQIDAQAB
-----END PUBLIC KEY-----`;

/** 预置试用授权码：90 天有效、不限 MAC。打包进 exe，首次运行自动填充激活。
 *  过期后用户需在授权页输入新码（用 scripts/gen-license.mjs 重新生成并替换此处）。 */
const DEFAULT_LICENSE = 'eyJleHBpcmVBdCI6IjIwMjYtMTEtMjdUMTU6NTk6NTkuMDAwWiIsIm1hYyI6bnVsbH0.tCYpMoarqyDNAwA-LYaLJHejyAzfLa7yJI7SE_TlDSSzaEUlHQEY47lGY4NbUMXjSLIRkJhfbruwyUL01ZcsSid52N94JEysBXQkDhH2eWsZTWVMasclFv5xVUPne8GYOcODLBRjrMNmokyAlimyPHltk_FRITkagWSU7vP07xXd2rT-1jK0SGQaWlxcAQwdCTMnoFvSxeGYR-TDTb0SCy6_D8bUcu-CL6yIH2gZWJFsc_dC-sU4TzGuwVwPR1QVusVjiLFbBys6ekU-Vgt6Z4cy3QXjGoJUgyutPYeoicktDjdvnUMQFppX64VQrdXiU196SuVJZiaDE2Mup1aUjw';

const router = Router();

export interface LicensePayload {
  expireAt: string | null;
  mac: string | null;
}

export interface VerifyResult {
  valid: boolean;
  expireAt: string | null;
  mac: string | null;
  machineMac: string;
  reason?: string;
}

function base64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** 获取本机首个非零非内部 MAC 地址，格式 XX:XX:XX:XX:XX:XX 大写。 */
export function getMachineMac(): string {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const item of list) {
      if (item.internal) continue;
      if (!item.mac || item.mac === '00:00:00:00:00:00') continue;
      return item.mac.toUpperCase();
    }
  }
  return '00:00:00:00:00:00';
}

/** 校验授权码：公钥验签 + 过期 + MAC 绑定。应用端只有此解密/验签，无私钥签名。 */
export function verifyLicenseCode(code: string, machineMac: string = getMachineMac()): VerifyResult {
  const parts = code.split('.');
  if (parts.length !== 2) {
    return { valid: false, expireAt: null, mac: null, machineMac, reason: '授权码格式错误' };
  }
  const [payloadB64, sigB64] = parts;

  let payloadStr: string;
  let signature: Buffer;
  let payload: LicensePayload;
  try {
    payloadStr = base64urlDecode(payloadB64).toString('utf8');
    signature = base64urlDecode(sigB64);
    payload = JSON.parse(payloadStr) as LicensePayload;
  } catch {
    return { valid: false, expireAt: null, mac: null, machineMac, reason: '授权码解析失败' };
  }

  const verify = crypto.createVerify('sha256');
  verify.update(payloadStr);
  verify.end();
  if (!verify.verify(LICENSE_PUBLIC_KEY, signature)) {
    return { valid: false, expireAt: payload.expireAt, mac: payload.mac, machineMac, reason: '授权码签名无效' };
  }

  if (payload.expireAt !== null) {
    const expire = new Date(payload.expireAt);
    if (isNaN(expire.getTime())) {
      return { valid: false, expireAt: payload.expireAt, mac: payload.mac, machineMac, reason: '授权码过期时间无效' };
    }
    if (expire.getTime() < Date.now()) {
      return { valid: false, expireAt: payload.expireAt, mac: payload.mac, machineMac, reason: '授权码已过期' };
    }
  }

  if (payload.mac !== null) {
    if (payload.mac.toUpperCase() !== machineMac.toUpperCase()) {
      return { valid: false, expireAt: payload.expireAt, mac: payload.mac, machineMac, reason: `授权码绑定的 MAC(${payload.mac}) 与本机(${machineMac}) 不符` };
    }
  }

  return { valid: true, expireAt: payload.expireAt, mac: payload.mac, machineMac };
}

// GET /api/license/machine-info —— 返回本机 MAC 与主机名，供前端展示
router.get('/machine-info', (_req: Request, res: Response) => {
  res.json({ data: { mac: getMachineMac(), hostname: os.hostname() } });
});

// GET /api/license/default —— 返回预置试用授权码及当前校验状态（前端首次启动自动填充用）
router.get('/default', (_req: Request, res: Response) => {
  const result = verifyLicenseCode(DEFAULT_LICENSE);
  res.json({ data: { code: DEFAULT_LICENSE, ...result } });
});

// POST /api/license/verify —— 校验授权码，body: { code }
router.post('/verify', (req: Request, res: Response) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: '请提供授权码' });
    return;
  }
  const result = verifyLicenseCode(code);
  res.json({ data: result });
});

export default router;