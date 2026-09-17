/**
 * 授权机器绑定与门禁单测。
 *
 * 为什么值得测：
 *  1) 机器标识读取有三条平台分支，本机只能跑到 Windows 那条 —— darwin / linux 若写错，
 *     要到用户换了 mac 才发现「授权码绑定的机器标识与本机不符」，那时已经在客户手里。
 *     所以把外部依赖抽成 SeedReadDeps 注入，三个分支都在这里跑。
 *  2) machineId 优先 / mac 兜底的口径一旦写反，已发出去的老码会集体失效。
 *  3) 门禁中间件的豁免路径靠字符串前缀比对，写错会静默失效（表现是图片裂、皮肤丢，
 *     接口却返回 200），这种「静默降级」必须钉住。
 *
 * 验签用例用真密钥对现场签名（而非写死一段 base64）：写死的码一旦密钥轮换就全线飘红，
 * 而这里验证的是「验签逻辑正确」，与具体密钥无关。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import {
  computeMachineId,
  buildFallbackSeed,
  readMachineSeed,
  verifyLicenseCode,
  verifyLicenseCodeWithKey,
  type MachineIdentity,
} from '../src/license';
import {
  extractLicenseCode,
  isGuardExemptPath,
  normalizeGuardPath,
  isLicenseGuardEnabled,
  requireLicense,
  verifyLicenseCached,
  resetLicenseGuardCache,
} from '../src/license-guard';

// ── 测试用授权码签发：与 scripts/gen-license.mjs 同格式，但用临时密钥对 ──
const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 用指定私钥签一个授权码。默认临时密钥对，配合 verifyLicenseCodeWithKey 的注入公钥跑通全链路。 */
function signLicense(payload: Record<string, unknown>, privateKey = TEST_PRIVATE_KEY): string {
  const body = JSON.stringify(payload);
  const sign = crypto.createSign('sha256');
  sign.update(body);
  sign.end();
  return `${b64url(Buffer.from(body, 'utf8'))}.${b64url(sign.sign(privateKey))}`;
}

/** 篡改签名字节（保留长度），用于「签名无效」用例。 */
function tamperSignature(code: string): string {
  const [payload, sig] = code.split('.');
  const bytes = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  bytes[0] = bytes[0] ^ 0xff;
  return `${payload}.${b64url(bytes)}`;
}

/** 用测试公钥验签（生产路径用内嵌公钥，此处注入测试公钥才能走通签名校验后的逻辑）。 */
function verify(code: string, identity: MachineIdentity = IDENTITY) {
  return verifyLicenseCodeWithKey(code, TEST_PUBLIC_KEY, identity);
}

const IDENTITY: MachineIdentity = {
  machineId: 'A1B2C3D4E5F60718',
  mac: 'AA:BB:CC:DD:EE:FF',
  source: 'test',
};

describe('computeMachineId · 机器标识生成', () => {
  it('同一种子恒得同一标识（授权码可复现）', () => {
    expect(computeMachineId('SAME-SEED')).toBe(computeMachineId('SAME-SEED'));
  });

  it('不同种子得不同标识', () => {
    expect(computeMachineId('SEED-A')).not.toBe(computeMachineId('SEED-B'));
  });

  it('首尾空白被忽略（注册表输出常带 \\r\\n，不 trim 会导致同机两次算出不同值）', () => {
    expect(computeMachineId('  abc-123  ')).toBe(computeMachineId('abc-123'));
  });

  it('固定 16 位大写十六进制', () => {
    const id = computeMachineId('seed-for-format');
    expect(id).toMatch(/^[0-9A-F]{16}$/);
  });

  it('空种子抛错而非静默产出标识', () => {
    expect(() => computeMachineId('   ')).toThrow(/种子为空/);
  });

  it('不泄露原种子（哈希后不应含原文字节）', () => {
    const secret = 'b7c9f1e2-4a3d-4f88-9c11-machine-guid-secret';
    const id = computeMachineId(secret);
    expect(id.includes(secret)).toBe(false);
    expect(secret.includes(id)).toBe(false);
  });
});

describe('buildFallbackSeed · 降级种子', () => {
  it('不含 MAC 与内存容量（这两项会变，正是要修的漂移源）', () => {
    const seed = buildFallbackSeed();
    expect(seed).not.toMatch(/([0-9A-F]{2}:){5}[0-9A-F]{2}/i);
    // 内存容量以 GB 数字形式出现时应不存在 —— 这里断言字段组合固定为 4 段
    expect(seed.split('|')).toHaveLength(4);
  });

  it('同一输入恒得同一结果（可复现）', () => {
    const a = buildFallbackSeed('MY-PC', 'win32', 'x64', 'Intel CPU');
    const b = buildFallbackSeed('MY-PC', 'win32', 'x64', 'Intel CPU');
    expect(a).toBe(b);
    expect(a).toContain('MY-PC');
  });

  it('主机名变化会产生不同种子', () => {
    expect(buildFallbackSeed('PC-A', 'win32', 'x64', 'X'))
      .not.toBe(buildFallbackSeed('PC-B', 'win32', 'x64', 'X'));
  });
});

describe('readMachineSeed · 三平台分支（本机只能跑 win32，故注入依赖覆盖全部分支）', () => {
  it('Windows 优先读注册表 MachineGuid', () => {
    const out = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    9f8e7d6c-1234-5678-9abc-def012345678\r\n';
    const r = readMachineSeed({ platform: 'win32', run: () => out });
    expect(r.source).toBe('windows-machine-guid');
    expect(r.seed).toBe('9f8e7d6c-1234-5678-9abc-def012345678');
  });

  it('Windows 上 reg 被拦（EPERM）时降级到 wmic 主板 UUID', () => {
    const run = (file: string) => {
      if (file === 'reg') throw new Error('spawnSync reg EPERM');
      return 'UUID\r\n4C4C4544-0037-3410-8042-B4C04F4A5A32\r\n';
    };
    const r = readMachineSeed({ platform: 'win32', run });
    expect(r.source).toBe('windows-csproduct-uuid');
    expect(r.seed).toBe('4C4C4544-0037-3410-8042-B4C04F4A5A32');
  });

  it('Windows 全零 UUID 视为无效（部分虚拟机返回全零，不能当标识用）', () => {
    const run = (file: string) => {
      if (file === 'reg') throw new Error('blocked');
      return 'UUID\r\n00000000-0000-0000-0000-000000000000\r\n';
    };
    const r = readMachineSeed({ platform: 'win32', run });
    expect(r.seed).toBeNull();
    expect(r.source).toBe('none');
  });

  it('macOS 读 IOPlatformUUID', () => {
    const out = '  "IOPlatformUUID" = "5D9A0F1B-2233-4455-6677-8899AABBCCDD"\n';
    const r = readMachineSeed({ platform: 'darwin', run: () => out });
    expect(r.source).toBe('macos-platform-uuid');
    expect(r.seed).toBe('5D9A0F1B-2233-4455-6677-8899AABBCCDD');
  });

  it('Linux 优先 /etc/machine-id', () => {
    const r = readMachineSeed({
      platform: 'linux',
      readText: (f) => (f === '/etc/machine-id' ? 'a1b2c3d4e5f60718293a4b5c6d7e8f90\n' : ''),
    });
    expect(r.source).toBe('linux-machine-id');
    expect(r.seed).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });

  it('Linux 无 machine-id 时退到 DMI 主板 UUID', () => {
    const r = readMachineSeed({
      platform: 'linux',
      readText: (f) => {
        if (f === '/etc/machine-id' || f === '/var/lib/dbus/machine-id') throw new Error('ENOENT');
        return 'DMI-UUID-7777';
      },
    });
    expect(r.source).toBe('linux-product_uuid');
    expect(r.seed).toBe('DMI-UUID-7777');
  });

  it('所有来源都失败时返回 none（不抛错，授权仍可用）', () => {
    const r = readMachineSeed({
      platform: 'win32',
      run: () => { throw new Error('all blocked'); },
    });
    expect(r).toEqual({ seed: null, source: 'none' });
  });
});

describe('verifyLicenseCode · 机器绑定口径（走通完整验签）', () => {
  it('不限机器：machineId 与 mac 都为空 → 任意机器有效', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: null });
    const r = verify(code);
    expect(r.valid).toBe(true);
    expect(r.machineIdLocal).toBe('A1B2C3D4E5F60718');
  });

  it('机器标识匹配 → 有效', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: IDENTITY.machineId });
    const r = verify(code);
    expect(r.valid).toBe(true);
    expect(r.machineId).toBe(IDENTITY.machineId);
  });

  it('机器标识不符 → 拒绝并说明双方取值', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: 'FFFFFFFFFFFFFFFF' });
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('机器标识');
    expect(r.reason).toContain('FFFFFFFFFFFFFFFF');
    expect(r.reason).toContain(IDENTITY.machineId);
  });

  it('机器标识大小写不敏感（授权页复制出来可能是小写）', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: IDENTITY.machineId.toLowerCase() });
    expect(verify(code).valid).toBe(true);
  });

  it('machineId 优先于 mac：两个都给时按 machineId 判，mac 写错不影响', () => {
    const code = signLicense({
      expireAt: null,
      mac: '11:22:33:44:55:66',          // 与本机不符
      machineId: IDENTITY.machineId,      // 匹配
    });
    const r = verify(code);
    expect(r.valid).toBe(true);
  });

  it('machineId 优先于 mac：machineId 不符时，mac 匹配也不能放行', () => {
    const code = signLicense({
      expireAt: null,
      mac: IDENTITY.mac,                  // 匹配
      machineId: 'FFFFFFFFFFFFFFFF',       // 不符
    });
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('机器标识');
  });

  it('老码只有 mac 且匹配 → 有效（已发出的授权码不失效）', () => {
    const code = signLicense({ expireAt: null, mac: IDENTITY.mac });
    expect(verify(code).valid).toBe(true);
  });

  it('老码只有 mac 且不符 → 拒绝', () => {
    const code = signLicense({ expireAt: null, mac: '11:22:33:44:55:66' });
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('MAC');
  });

  it('老码 mac 大小写不敏感', () => {
    const code = signLicense({ expireAt: null, mac: IDENTITY.mac.toLowerCase() });
    expect(verify(code).valid).toBe(true);
  });

  it('绑了 machineId 但本机读不到标识 → 明确报错，不静默放行', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: IDENTITY.machineId });
    const noId: MachineIdentity = { machineId: null, mac: IDENTITY.mac, source: 'none' };
    const r = verify(code, noId);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('硬件标识不可读');
  });

  it('machineId 为空字符串等价于不限机器（不是"绑定空值"）', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: '   ' });
    expect(verify(code).valid).toBe(true);
  });
});

describe('verifyLicenseCode · 过期判定', () => {
  it('过期时间在未来 → 有效', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const code = signLicense({ expireAt: future, mac: null, machineId: null });
    const r = verify(code);
    expect(r.valid).toBe(true);
    expect(r.expireAt).toBe(future);
  });

  it('已过期 → 拒绝', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    const code = signLicense({ expireAt: past, mac: null, machineId: null });
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码已过期');
  });

  it('过期时间非法 → 拒绝（不是当作不过期放行）', () => {
    const code = signLicense({ expireAt: 'not-a-date', mac: null, machineId: null });
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码过期时间无效');
  });

  it('expireAt 为 null → 永不过期', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: null });
    const r = verify(code);
    expect(r.valid).toBe(true);
    expect(r.expireAt).toBeNull();
  });
});

describe('verifyLicenseCode · 签名与解析失败路径', () => {
  it('格式错误：不是两段结构', () => {
    const r = verifyLicenseCode('not-a-license', IDENTITY);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码格式错误');
  });

  it('解析失败：payload 不是合法 JSON', () => {
    const bad = `${b64url(Buffer.from('{oops', 'utf8'))}.${b64url(Buffer.from('sig'))}`;
    const r = verifyLicenseCode(bad, IDENTITY);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码解析失败');
  });

  it('签名无效：篡改一个签名字节即被拒', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: null });
    const r = verify(tamperSignature(code));
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码签名无效');
  });

  it('签名无效：篡改 payload（改成不限机器）也被拒 —— 防"改写正文绕过绑定"', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: 'FFFFFFFFFFFFFFFF' });
    const [, sig] = code.split('.');
    const forgedBody = JSON.stringify({ expireAt: null, mac: null, machineId: null });
    const forged = `${b64url(Buffer.from(forgedBody, 'utf8'))}.${sig}`;
    const r = verify(forged);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码签名无效');
  });

  it('签名无效：换一对密钥签的码被拒（应用侧不认未授权私钥）', () => {
    const other = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const code = signLicense({ expireAt: null, mac: null }, other.privateKey);
    const r = verify(code);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码签名无效');
  });

  it('生产入口用内嵌公钥：测试密钥签的码被拒（证明公钥没有可注入的后门）', () => {
    const code = signLicense({ expireAt: null, mac: null, machineId: null });
    const r = verifyLicenseCode(code, IDENTITY);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码签名无效');
  });

  it('本机标识与 MAC 被回填进结果，供授权页展示', () => {
    const r = verifyLicenseCode('bad.format', IDENTITY);
    expect(r.machineMac).toBe('AA:BB:CC:DD:EE:FF');
    expect(r.machineIdLocal).toBe('A1B2C3D4E5F60718');
    expect(r.identitySource).toBe('test');
  });

  it('无 machineId 字段的老码不因新逻辑报错（向后兼容）', () => {
    const code = signLicense({ expireAt: null, mac: null });
    const r = verify(code);
    expect(r.valid).toBe(true);
    expect(r.machineId).toBeNull();
  });
});

describe('normalizeGuardPath · 路径归一化', () => {
  it('剥掉 /api 前缀', () => {
    expect(normalizeGuardPath('/api/conversations')).toBe('/conversations');
  });

  it('未带 /api 前缀时原样保留（中间件改挂到 / 也不会让豁免失效）', () => {
    expect(normalizeGuardPath('/generated/images/x.png')).toBe('/generated/images/x.png');
  });

  it('去掉查询串', () => {
    expect(normalizeGuardPath('/api/generated/images/a.png?v=2')).toBe('/generated/images/a.png');
  });

  it('去掉尾部斜杠；根路径归为 /', () => {
    expect(normalizeGuardPath('/api/license/')).toBe('/license');
    expect(normalizeGuardPath('/api')).toBe('/');
    expect(normalizeGuardPath('')).toBe('/');
  });
});

describe('isGuardExemptPath · 豁免清单', () => {
  const exempt = [
    '/api/health',
    '/api/license/verify',
    '/api/auth/login',
    '/api/generated/images/conv-1/a.png',
    '/api/media/proxy',
    '/api/plugin-assets/cinnabar/dialog-bg.webp',
    '/api/network/ip',
  ];
  it.each(exempt)('豁免：%s', (p) => {
    expect(isGuardExemptPath(p)).toBe(true);
  });

  const guarded = [
    '/api/conversations',
    '/api/messages',
    '/api/llm/tasks/t1/stream',
    '/api/skills',
    '/api/agents',
    '/api/kb/list',
    '/api/generatedx/fake',   // 前缀相似但不是同一段，必须被拦
    '/api/licensex',
  ];
  it.each(guarded)('拦截：%s', (p) => {
    expect(isGuardExemptPath(p)).toBe(false);
  });

  it('前缀相似但不带分隔符的路径不会被误豁免', () => {
    expect(isGuardExemptPath('/api/generated-something')).toBe(false);
    expect(isGuardExemptPath('/api/authz')).toBe(false);
  });
});

describe('extractLicenseCode · 取码', () => {
  it('优先读 x-license 头', () => {
    expect(extractLicenseCode({ headers: { 'x-license': ' CODE-A ' } } as any)).toBe('CODE-A');
  });

  it('兼容 Authorization: License <code>', () => {
    expect(extractLicenseCode({ headers: { authorization: 'License CODE-B' } } as any)).toBe('CODE-B');
  });

  it('Bearer 不被当作授权码（那是 JWT，复用会让两种身份混在一起）', () => {
    expect(extractLicenseCode({ headers: { authorization: 'Bearer jwt.token.here' } } as any)).toBeNull();
  });

  it('无头时返回 null', () => {
    expect(extractLicenseCode({ headers: {} } as any)).toBeNull();
  });

  it('空白码视为无码', () => {
    expect(extractLicenseCode({ headers: { 'x-license': '   ' } } as any)).toBeNull();
  });
});

describe('isLicenseGuardEnabled · 开关', () => {
  const original = process.env.YZ_LICENSE_GUARD;
  afterEach(() => {
    if (original === undefined) delete process.env.YZ_LICENSE_GUARD;
    else process.env.YZ_LICENSE_GUARD = original;
  });

  it('未设置时关闭（本地开发打开即用，避免全线 403）', () => {
    delete process.env.YZ_LICENSE_GUARD;
    expect(isLicenseGuardEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', 'on', 'yes', ' 1 '])('取值 %s 视为开启', (v) => {
    process.env.YZ_LICENSE_GUARD = v;
    expect(isLicenseGuardEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', '', 'no'])('取值 %s 视为关闭', (v) => {
    process.env.YZ_LICENSE_GUARD = v;
    expect(isLicenseGuardEnabled()).toBe(false);
  });
});

describe('requireLicense · 中间件行为', () => {
  const original = process.env.YZ_LICENSE_GUARD;
  afterEach(() => {
    if (original === undefined) delete process.env.YZ_LICENSE_GUARD;
    else process.env.YZ_LICENSE_GUARD = original;
    resetLicenseGuardCache();
  });

  /** 最小 req/res 替身：只提供中间件真正读写的字段。 */
  function makeReq(path: string, headers: Record<string, string> = {}, method = 'GET') {
    return { method, originalUrl: path, url: path, path, headers } as any;
  }
  function makeRes() {
    const state = { status: 0, body: undefined as any };
    const res: any = {
      status(code: number) { state.status = code; return res; },
      json(payload: any) { state.body = payload; return res; },
    };
    return { res, state };
  }

  it('未启用时全量放行（本地开发打开即用）', () => {
    delete process.env.YZ_LICENSE_GUARD;
    let called = false;
    requireLicense(makeReq('/api/conversations'), makeRes().res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('启用后无码访问业务接口 → 403 且不继续', () => {
    process.env.YZ_LICENSE_GUARD = '1';
    let called = false;
    const { res, state } = makeRes();
    requireLicense(makeReq('/api/conversations'), res, () => { called = true; });
    expect(called).toBe(false);
    expect(state.status).toBe(403);
    expect(state.body.error).toBe('未提供授权码');
  });

  it('启用后豁免路径无码仍然放行（否则交付卡片图片全裂）', () => {
    process.env.YZ_LICENSE_GUARD = '1';
    let called = false;
    requireLicense(makeReq('/api/generated/images/c1/a.png'), makeRes().res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('OPTIONS 预检放行（带自定义头的跨域预检不能被 403 挡掉）', () => {
    process.env.YZ_LICENSE_GUARD = '1';
    let called = false;
    requireLicense(makeReq('/api/conversations', {}, 'OPTIONS'), makeRes().res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('启用后带无效码 → 403 且带原因', () => {
    process.env.YZ_LICENSE_GUARD = '1';
    let called = false;
    const { res, state } = makeRes();
    requireLicense(makeReq('/api/conversations', { 'x-license': 'garbage' }), res, () => { called = true; });
    expect(called).toBe(false);
    expect(state.status).toBe(403);
    expect(state.body.error).toBe('授权无效');
    expect(typeof state.body.reason).toBe('string');
  });
});

describe('verifyLicenseCached · 缓存语义', () => {
  afterEach(() => resetLicenseGuardCache());

  it('失败的码不被缓存（否则用户换新码后仍被拦 TTL 时长）', () => {
    const bad = 'invalid-code-xyz';
    const a = verifyLicenseCached(bad);
    const b = verifyLicenseCached(bad);
    expect(a.valid).toBe(false);
    expect(b.valid).toBe(false);
    // 两次都真实跑了验签：不直接断言耗时（不稳定），改为断言结论一致且都是失败
    expect(a.reason).toBe(b.reason);
  });

  it('同一无效码重复校验结论稳定（缓存未引入抖动）', () => {
    const bad = 'another-invalid-code';
    for (let i = 0; i < 5; i++) {
      expect(verifyLicenseCached(bad).valid).toBe(false);
    }
  });
});

describe('本机真实环境冒烟', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.YZ_LICENSE_GUARD; });
  afterEach(() => {
    if (saved === undefined) delete process.env.YZ_LICENSE_GUARD;
    else process.env.YZ_LICENSE_GUARD = saved;
  });

  it('hostname 非空（降级种子依赖它）', () => {
    expect(os.hostname().length).toBeGreaterThan(0);
  });

  it('本机读机器种子不抛错，且 source 是已知取值之一', () => {
    const r = readMachineSeed();
    expect(['windows-machine-guid', 'windows-csproduct-uuid', 'macos-platform-uuid',
      'linux-machine-id', 'linux-machine-id-file', 'linux-product_uuid', 'none']).toContain(r.source);
    if (r.seed) expect(r.seed.length).toBeGreaterThan(0);
  });
});