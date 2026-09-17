import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
  /** 旧绑定字段：网卡 MAC。新授权码优先用 machineId，此字段仅作向后兼容。 */
  mac: string | null;
  /** 新绑定字段：稳定机器指纹（见 computeMachineId），不填=不限机器。 */
  machineId?: string | null;
}

/** 本机标识：machineId 为主（跨网卡变化稳定），mac 保留用于展示与老码校验。 */
export interface MachineIdentity {
  machineId: string | null;
  mac: string;
  /** machineId 的来源，便于排障时判断走了哪条读取路径。 */
  source: string;
}

export interface VerifyResult {
  valid: boolean;
  expireAt: string | null;
  mac: string | null;
  machineId: string | null;
  machineMac: string;
  /** 本机实际机器标识，供授权页展示给签发方绑定用。 */
  machineIdLocal: string | null;
  identitySource: string;
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

/**
 * 把硬件种子哈希成 16 位大写十六进制机器标识。
 *
 * 为什么哈希而不用原始种子：Windows MachineGuid / IOPlatformUUID 会被部分 DRM 与
 * 统计软件当作设备追踪 ID，不应该经接口吐给前端；哈希后既能做绑定比对，又不泄露原值。
 *
 * 为什么固定截 16 位（64 bit）：碰撞概率对「几百台授权机器」这个量级完全够用，
 * 且授权码可读性远好于 64 位全量十六进制。
 */
export function computeMachineId(seed: string): string {
  const normalized = seed.trim();
  if (!normalized) throw new Error('机器标识种子为空');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16).toUpperCase();
}

/** readMachineSeed 的外部依赖。抽成参数是为了让三个平台分支都能在单测里跑
 *  —— 本机是 Windows，darwin/linux 分支靠真实环境永远覆盖不到。 */
export interface SeedReadDeps {
  platform: NodeJS.Platform;
  /** 执行外部命令取 stdout；抛错 = 该命令不可用（被策略拦截 / 不存在）。 */
  run: (file: string, args: string[]) => string;
  /** 读文本文件；抛错 = 文件不存在或不可读。 */
  readText: (file: string) => string;
}

const defaultSeedDeps: SeedReadDeps = {
  platform: process.platform,
  run: (file, args) =>
    execFileSync(file, args, { encoding: 'utf8', timeout: 3000, windowsHide: true }),
  readText: (file) => fs.readFileSync(file, 'utf8'),
};

/**
 * 读取硬件种子。任何一步失败都不抛错：硬件信息读不到时授权仍需可用，
 * 只是绑定强度降到合成种子 —— 绝不因读不到硬件信息而阻断启动或验签。
 */
export function readMachineSeed(deps: Partial<SeedReadDeps> = {}): { seed: string | null; source: string } {
  const { platform, run, readText } = { ...defaultSeedDeps, ...deps };

  if (platform === 'win32') {
    // 注册表 MachineGuid：Windows 安装时生成，重装系统才变，换网卡/加内存都不受影响。
    // 备选 wmic 主板 UUID：部分企业策略会拦 reg.exe（EPERM），此时仍有稳定来源可用。
    try {
      const out = run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(out);
      if (m) return { seed: m[1].trim(), source: 'windows-machine-guid' };
    } catch {
      // 落到下一候选，不中断
    }
    try {
      const out = run('wmic', ['csproduct', 'get', 'uuid']);
      // 输出形如 "UUID\nXXXX-...\n"，首行是表头，取第一个像 UUID 的值。
      const m = /([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/.exec(out);
      if (m && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(m[1])) {
        return { seed: m[1].toUpperCase(), source: 'windows-csproduct-uuid' };
      }
    } catch {
      // 继续降级
    }
  } else if (platform === 'darwin') {
    try {
      const out = run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
      const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
      if (m) return { seed: m[1].trim(), source: 'macos-platform-uuid' };
    } catch {
      // 继续降级
    }
  } else {
    // Linux：machine-id 优先（systemd 提供、跨重启稳定），再退 DMI 主板 UUID。
    const candidates = ['/etc/machine-id', '/var/lib/dbus/machine-id', '/sys/class/dmi/id/product_uuid'];
    for (const file of candidates) {
      try {
        const value = readText(file).trim();
        if (value) return { seed: value, source: `linux-${path.basename(file)}` };
      } catch {
        // 单个候选缺失属正常（不同发行版路径不同），继续试下一个。
      }
    }
  }

  return { seed: null, source: 'none' };
}

/**
 * 硬件种子读不到时的降级种子。**刻意不含 MAC 与内存容量**：插拔网卡会换 MAC、
 * 加内存条会变 totalmem，二者都会让授权无理由失效 —— 正是本次要修的漂移问题，
 * 不能在兜底路径里重犯。
 */
export function buildFallbackSeed(
  hostname: string = os.hostname(),
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  cpuModel: string = os.cpus()[0]?.model || '',
): string {
  return [hostname, platform, arch, cpuModel].join('|');
}

let identityCache: MachineIdentity | null = null;

/** 取本机标识（进程内缓存：硬件标识恒定，没必要重复起子进程读注册表）。 */
export function getMachineIdentity(): MachineIdentity {
  if (identityCache) return identityCache;
  const mac = getMachineMac();
  const { seed, source } = readMachineSeed();
  identityCache = seed
    ? { machineId: computeMachineId(seed), mac, source }
    : { machineId: computeMachineId(buildFallbackSeed()), mac, source: 'fallback-composite' };
  return identityCache;
}

/** 清空本机标识缓存（仅供测试；真实机器上标识恒定，无需失效）。 */
export function resetMachineIdentityCache(): void {
  identityCache = null;
}

/** 校验授权码：公钥验签 + 过期 + 机器绑定。应用端只有此解密/验签，无私钥签名。
 *
 *  绑定口径：payload.machineId 存在则比 machineId，否则回退比 mac，两者都空 = 不限机器。
 *  这样新码用更稳的 machineId，已经发出去的老码（只有 mac）不失效。 */
export function verifyLicenseCode(
  code: string,
  identity: MachineIdentity = getMachineIdentity(),
): VerifyResult {
  return verifyLicenseCodeWithKey(code, LICENSE_PUBLIC_KEY, identity);
}

/**
 * 与 verifyLicenseCode 同逻辑，但公钥可注入。
 *
 * 为什么单独拆一个：生产路径写死内嵌公钥后，单测就永远只能测到「签名无效」这一条分支
 * —— 而 machineId 优先 / mac 兜底 / 过期判断这些真正容易写错的逻辑全在签名校验**之后**，
 * 用真公钥根本走不进去。拆出来后测试可以用临时密钥对签真码，把整条路径跑通。
 * 生产代码只走 verifyLicenseCode，注入能力不对外暴露。
 */
export function verifyLicenseCodeWithKey(
  code: string,
  publicKey: string,
  identity: MachineIdentity = getMachineIdentity(),
): VerifyResult {
  const { mac: machineMac, machineId: machineIdLocal, source: identitySource } = identity;
  const parts = code.split('.');
  if (parts.length !== 2) {
    return {
      valid: false, expireAt: null, mac: null, machineId: null,
      machineMac, machineIdLocal, identitySource, reason: '授权码格式错误',
    };
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
    return {
      valid: false, expireAt: null, mac: null, machineId: null,
      machineMac, machineIdLocal, identitySource, reason: '授权码解析失败',
    };
  }

  const invalid = (reason: string): VerifyResult => ({
    valid: false, expireAt: payload.expireAt ?? null, mac: payload.mac ?? null,
    machineId: payload.machineId ?? null, machineMac, machineIdLocal, identitySource, reason,
  });

  const verify = crypto.createVerify('sha256');
  verify.update(payloadStr);
  verify.end();
  if (!verify.verify(publicKey, signature)) {
    return invalid('授权码签名无效');
  }

  if (payload.expireAt !== null && payload.expireAt !== undefined) {
    const expire = new Date(payload.expireAt);
    if (isNaN(expire.getTime())) return invalid('授权码过期时间无效');
    if (expire.getTime() < Date.now()) return invalid('授权码已过期');
  }

  const boundMachineId = typeof payload.machineId === 'string' && payload.machineId.trim()
    ? payload.machineId.trim().toUpperCase()
    : null;
  const boundMac = typeof payload.mac === 'string' && payload.mac.trim()
    ? payload.mac.trim().toUpperCase()
    : null;

  if (boundMachineId) {
    // 新码优先按机器指纹校验：machineId 读不到时明确报错，不静默放行（否则绑定形同虚设）
    if (!machineIdLocal) return invalid('本机硬件标识不可读，无法校验机器绑定');
    if (boundMachineId !== machineIdLocal) {
      return invalid(`授权码绑定的机器标识(${boundMachineId}) 与本机(${machineIdLocal}) 不符`);
    }
  } else if (boundMac) {
    if (boundMac !== machineMac.toUpperCase()) {
      return invalid(`授权码绑定的 MAC(${boundMac}) 与本机(${machineMac}) 不符`);
    }
  }

  return {
    valid: true, expireAt: payload.expireAt ?? null, mac: payload.mac ?? null,
    machineId: payload.machineId ?? null, machineMac, machineIdLocal, identitySource,
  };
}

// GET /api/license/machine-info —— 返回本机机器标识与主机名，供前端展示给签发方绑定
router.get('/machine-info', (_req: Request, res: Response) => {
  const identity = getMachineIdentity();
  res.json({
    data: {
      mac: identity.mac,
      machineId: identity.machineId,
      source: identity.source,
      hostname: os.hostname(),
    },
  });
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