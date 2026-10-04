import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 本模块所在目录（ESM 无 __dirname；构建时现签的预置码文件按它定位开发期候选路径）
const licenseModuleDir = path.dirname(fileURLToPath(import.meta.url));

const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAudaPf8W9lEYSASD8ZeAd
gHjDrN/DLpJbQLn3DrpNeKdqa2FkAIs5UuuoY7aCfjOSsnyO6gpIo3ZVTPsE2Fyw
OB43b3NsfElR7CY7sGiRB+X/SmOPiEStLpBnvI6yZCtl98GVyPZlxPxPgFk9FRxP
TYqes1L2jRu2D+wNmJNAwYTOKB5vo1lAfPyK8j/43wkzftRhGTlIuxmGBJMnIrBv
efa/AXMxFjukBEfzQ5EmewMT43sV2TAy3AstjPaPmsJfJ3arTWFnM0CcdLOj6yIo
cInEgmQ8Gf7Wfg9hHLpr7aoWMM6jJGrPmtj6SONg8GW6SPXg9O3BuS5AN8azgevF
gQIDAQAB
-----END PUBLIC KEY-----`;

// ───────────────────────────── 版本档（edition） ─────────────────────────────

/** 能力档位。写在授权码 payload 里（参与签名，客户端改不了）。 */
export type Edition = 'lite' | 'basic' | 'pro';

/** 档位 → 放行的模式。**这是全仓库唯一的模式清单** —— 前端只消费接口下发的 modes，
 *  不自己维护一份，否则迟早两处漂移（改了一边忘了另一边，表现为「码升了但界面没放开」）。 */
export const EDITION_MODES: Record<Edition, readonly string[]> = {
  lite: ['office'],
  basic: ['office', 'wf', 'dev'],
  pro: ['office', 'wf', 'dev', 'ops', 'sec'],
};

export const EDITIONS: readonly Edition[] = ['lite', 'basic', 'pro'];

/**
 * 授权码里缺失或非法 edition 时的兜底档位。
 *
 * ★ 必须是 pro，不能是 lite/basic：本字段是后加的，已经发出去的存量码全都没有它。
 *   若兜底成低档，客户升级客户端后模式会集体消失 —— 这是最不可接受的回归。
 *   宁可让无字段的老码保持全量，也不能让它掉权限。
 */
export const FALLBACK_EDITION: Edition = 'pro';

/** 解析授权码 payload 里的 edition：非法/缺失一律回落到 FALLBACK_EDITION（保护存量码）。 */
export function resolveEdition(raw: unknown): Edition {
  return typeof raw === 'string' && (EDITIONS as readonly string[]).includes(raw)
    ? (raw as Edition)
    : FALLBACK_EDITION;
}

/**
 * 构建档（这个包本身是什么档）与授权档是两个维度，不要混：
 *  - 构建档决定「包里有没有对应功能的入口」，由打包脚本经 YZ_EDITION 注入；
 *  - 授权档决定「这张码允许开到几档」，写在码里。
 *  实际放行 = 两者取交集（见 allowedModes）。
 *
 * 非法/缺失值的兜底与 resolveEdition **刻意相反**：构建档回落到最保守的 lite 而不是 pro。
 * 理由：构建档来自打包环境的 env，写错属于工程事故，此时按最小权限跑比按全量跑安全。
 * （dev 模式没有 env，会落到 lite —— 但 html 端默认按 basic 走，见 DEFAULT_BUILD_EDITION。）
 */
export const DEFAULT_BUILD_EDITION: Edition = 'basic';

export function resolveBuildEdition(raw: unknown): Edition {
  return typeof raw === 'string' && (EDITIONS as readonly string[]).includes(raw)
    ? (raw as Edition)
    : DEFAULT_BUILD_EDITION;
}

/** 构建档 ∩ 授权档 → 实际放行的模式。两个维度任一不放行，该模式就不出现。 */
export function allowedModes(build: Edition, licensed: Edition): string[] {
  const buildSet = new Set(EDITION_MODES[build]);
  return EDITION_MODES[licensed].filter((m) => buildSet.has(m));
}

/** 预置试用授权码：按档位各一份，打包进 exe，首次运行自动填充激活。
 *
 *  每档带自己档位的码，这样「阉割版开箱只有办公」「基础版开箱三模式」天然成立，
 *  不依赖界面去猜。高级版（pro 构建档）默认也带 basic 码 —— 用户拍板：默认携带基础版，
 *  要让高级功能生效需换成 pro 码。
 *
 *  过期后用户需在授权页输入新码（用 scripts/gen-license.mjs --edition <档> 重新签发）。 */
const DEFAULT_LICENSE_BY_EDITION: Record<Edition, string> = {
  lite: 'eyJleHBpcmVBdCI6IjIwMjYtMTItMThUMTU6NTk6NTkuMDAwWiIsIm1hYyI6bnVsbCwibWFjaGluZUlkIjpudWxsLCJlZGl0aW9uIjoibGl0ZSJ9.BESuCh5F6m8ttjqhucCRfStWXC4lNgbIuhMLkP6VW5AyZ9NIzzx4UTFsfm4taxFOEqRVJ5O0N5cSmz31jK63I_HeNdEEUyrG8mGVvGrbSx8jxF3tV3kcCEJR8rML_fJG0B7EtpKu6M-4xL7qAIFuP6tcbvLZXsET1bkSKud3vDUPRDNX6ZOxFvVJheWhYoRaWzNqHYpYoqvTQ_ctKG9g15rGXdYkdoZsCS8S42_j71uu9srX1XKMk4EgHgMQRqjEMjpIKF0E5ejfzkcVxY9V0rnvwR98x88Vo1IFyIpTCqIau9R-E80rD8P2jzZ8qqPQ4OqfELG9ecGRydv6cc57OA',
  basic: 'eyJleHBpcmVBdCI6IjIwMjYtMTItMThUMTU6NTk6NTkuMDAwWiIsIm1hYyI6bnVsbCwibWFjaGluZUlkIjpudWxsLCJlZGl0aW9uIjoiYmFzaWMifQ.BJ00-OFzQ3Oi1SIdA0MI6XqH3535RAiEFdoXpPnGP5ptQnlpTBf7BTOYTcRm06YZI8WmEPAAioDyHLJr4hEIM0yC2Y8u8r0kilNeKh85JW7PeW35rQJBL8y14SmwSUOQpiZDq4QgRugIGmEqOKwnI9NZ6GA1DColAr2MR_aZzZ6lRl36WLfWv4EwHVKV7fPIma-vnkNyqIF90VLjeyR0MEcdz1g9xbV3iUnDOCMXTdDoKmp8jDTW2iL4ix2rzFyVB-A1mpfilOy_hXNpCMTBjsTsAufRZ_V8OUMQEOwVTZH6xNYz4zSRTn7_ut2DyYbbuoXnybGRIRii3fnhie0ajA',
  pro: 'eyJleHBpcmVBdCI6IjIwMjYtMTItMThUMTU6NTk6NTkuMDAwWiIsIm1hYyI6bnVsbCwibWFjaGluZUlkIjpudWxsLCJlZGl0aW9uIjoicHJvIn0.LRzfq_pI_3gnAdwCCanblHWNMnYMmG8qgNL8alvrwsyWWkInesU8VqtRHEjkcWN1bB2VXTNJRvhj-uVdgJssSbMuidNFAJG4ouRUJWr6K1CTc5jJbZUicG25J7czBzqlI8Y-kqdS9eB6yg4LcRM1zCM7_2knS2jjmiEih7nbTQEHAROHHKQPKSbE4FlmNn3X4N9-kF5HF2bESm7b0g46r2hhDh8vw6-7VTuuowgR98dipv9WIB-8Crl-4Wk_4ekXEQrJQiGxzuniL5TZSEgJYflSpmx0G_XiBtk_BQb1SbplIb6XBMK8dPKTrJjGC_a9MXAfu9jXiIs7zXVXmOFCgg',
};

/** 本包预置的授权码。
 *
 *  ★ 预置码档位与构建档**是两个独立设置**，不要合并：
 *    用户拍板「高级版全量包默认携带基础版授权码」—— 即 pro 构建档 + basic 预置码。
 *    若这里直接取构建档，高级包开箱就成了全量档，与产品口径不符。
 *
 *  优先级：YZ_DEFAULT_LICENSE（整码覆盖，人工兜底）> YZ_DEFAULT_EDITION（档位）> basic。 */

// ─────────────── 构建时现签的预置码（2026-10-03，docs/预置授权码-构建时现签-方案.md）───────────────
// 打包链路（apps/desktop/scripts/pre-sign-license.cjs）现场签发三档写入
// resources/license/default-codes.json；启动时优先读它（expireAt ≈ 打包日 + 90 天），
// 读不到（dev 环境/存量包/显式跳过）回退上面的源码常量 —— 存量包行为不变。
{
  const candidates: string[] = [];
  if (process.env.YZ_LICENSE_CODES_FILE) candidates.push(process.env.YZ_LICENSE_CODES_FILE);
  // electron-builder extraResources：包内 <resources>/license/default-codes.json
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (rp) candidates.push(path.join(rp, 'license', 'default-codes.json'));
  // 开发兜底：desktop 仓库内直接读（prepare 后的文件）
  candidates.push(path.resolve(licenseModuleDir, '../../../desktop/resources/license/default-codes.json'));
  for (const f of candidates) {
    try {
      if (!f || !fs.existsSync(f)) continue;
      const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { signedAt?: string; codes?: Record<string, string> };
      if (j.codes && typeof j.codes === 'object') {
        for (const e of Object.keys(DEFAULT_LICENSE_BY_EDITION) as Edition[]) {
          if (typeof j.codes[e] === 'string' && j.codes[e]) DEFAULT_LICENSE_BY_EDITION[e] = j.codes[e];
        }
        console.log('[license] 预置码来源: 构建时现签 (signedAt=' + (j.signedAt || '未知') + ', ' + f + ')');
      }
      break;
    } catch { /* 任一候选损坏 → 尝试下一个/回退常量 */ }
  }
  // 到期告警（兜底：有人手工重签/旧流程打包时能看见）
  try {
    const exp = JSON.parse(Buffer.from(getDefaultLicenseCode().split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).expireAt;
    if (exp) {
      const remainDays = (new Date(exp).getTime() - Date.now()) / 86400000;
      if (remainDays < 14) console.warn(`[license] ⚠ 预置试用码仅剩 ${Math.round(remainDays)} 天到期（${exp}）—— 请重新构建现签或发新码`);
    }
  } catch { /* 非法码由验签路径报错 */ }
}
export function getDefaultLicenseCode(): string {
  const envCode = process.env.YZ_DEFAULT_LICENSE;
  if (envCode && envCode.trim()) return envCode.trim();
  const envEdition = process.env.YZ_DEFAULT_EDITION;
  const edition = typeof envEdition === 'string' && (EDITIONS as readonly string[]).includes(envEdition)
    ? (envEdition as Edition)
    : DEFAULT_BUILD_EDITION;
  return DEFAULT_LICENSE_BY_EDITION[edition];
}

const router = Router();

export interface LicensePayload {
  expireAt: string | null;
  /** 旧绑定字段：网卡 MAC。新授权码优先用 machineId，此字段仅作向后兼容。 */
  mac: string | null;
  /** 新绑定字段：稳定机器指纹（见 computeMachineId），不填=不限机器。 */
  machineId?: string | null;
  /** 能力档位。缺失 → FALLBACK_EDITION（pro），保证存量码不掉权限。 */
  edition?: string | null;
  /** 签发时刻 ISO（2026-10-03 起 gen-license 一律携带；存量码无此字段照常验签）。
   *  预置码"构建时现签"链路用它做时间不变量断言（expireAt − signedAt ≈ 授权天数）。 */
  signedAt?: string | null;
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
  /** 本包构建档（这个包本身是什么档）。 */
  buildEdition: Edition;
  /** 授权码档位（非法/缺失已回落到 pro）。 */
  edition: Edition;
  /** 实际放行的模式（构建档 ∩ 授权档）。前端直接消费，不自己维护清单。 */
  modes: string[];
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
  buildEdition: Edition = resolveBuildEdition(process.env.YZ_EDITION),
): VerifyResult {
  return verifyLicenseCodeWithKey(code, LICENSE_PUBLIC_KEY, identity, buildEdition);
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
  /** 本包构建档。默认从 env 解析；抽成参数是为了让单测能跑「三档构建 × 三档授权」的组合。 */
  buildEdition: Edition = resolveBuildEdition(process.env.YZ_EDITION),
): VerifyResult {
  const { mac: machineMac, machineId: machineIdLocal, source: identitySource } = identity;

  // 早期失败分支（还没解析出 payload）用兜底档：此时 valid=false，前端会停在授权页，
  // modes 取什么都不会真的放行，取兜底档只是让返回结构统一，便于前端与排障。
  const earlyFail = (reason: string): VerifyResult => ({
    valid: false, expireAt: null, mac: null, machineId: null,
    machineMac, machineIdLocal, identitySource,
    buildEdition, edition: FALLBACK_EDITION,
    modes: allowedModes(buildEdition, FALLBACK_EDITION), reason,
  });

  const parts = code.split('.');
  if (parts.length !== 2) return earlyFail('授权码格式错误');
  const [payloadB64, sigB64] = parts;

  let payloadStr: string;
  let signature: Buffer;
  let payload: LicensePayload;
  try {
    payloadStr = base64urlDecode(payloadB64).toString('utf8');
    signature = base64urlDecode(sigB64);
    payload = JSON.parse(payloadStr) as LicensePayload;
  } catch {
    return earlyFail('授权码解析失败');
  }

  // payload 已解析：失败分支也能带上真实档位，排障时能直接看出「这码是什么档」。
  const edition = resolveEdition(payload.edition);

  const invalid = (reason: string): VerifyResult => ({
    valid: false, expireAt: payload.expireAt ?? null, mac: payload.mac ?? null,
    machineId: payload.machineId ?? null, machineMac, machineIdLocal, identitySource,
    buildEdition, edition, modes: allowedModes(buildEdition, edition), reason,
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
    buildEdition, edition, modes: allowedModes(buildEdition, edition),
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
  const code = getDefaultLicenseCode();
  const result = verifyLicenseCode(code);
  res.json({ data: { code, ...result } });
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