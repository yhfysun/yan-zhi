/**
 * 版本档（edition）单测。
 *
 * 为什么值得测：
 *  1) `edition` 是后加到授权码 payload 里的字段，**存量码全都没有它**。兜底档一旦写错成
 *     lite/basic，客户升级客户端后模式会集体消失 —— 这是最不可接受的回归。所以
 *     「无字段 → pro」必须有用例钉死，不能只靠注释。
 *  2) 构建档与授权档是两个维度，实际放行 = 两者交集。交集写反（比如误用并集）会表现为
 *     「阉割版包里能开出运维模式」，而单测不覆盖组合的话，只有真机跑阉割包才会发现。
 *  3) 三个构建档 × 三个授权档 = 9 种组合，人工验证成本高，必须穷举。
 *
 * 验签用例沿用 license-machine.test.ts 的做法：用临时密钥对现场签名，不写死码 ——
 * 写死的码一旦密钥轮换就全线飘红，而这里验证的是「档位解析逻辑」，与具体密钥无关。
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  EDITION_MODES,
  EDITIONS,
  FALLBACK_EDITION,
  DEFAULT_BUILD_EDITION,
  resolveEdition,
  resolveBuildEdition,
  allowedModes,
  verifyLicenseCodeWithKey,
  getDefaultLicenseCode,
  verifyLicenseCode,
  type Edition,
  type MachineIdentity,
} from '../src/license';

// ── 测试用授权码签发：与 scripts/gen-license.mjs 同格式，但用临时密钥对 ──
const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signLicense(payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload);
  const sign = crypto.createSign('sha256');
  sign.update(body);
  sign.end();
  return `${b64url(Buffer.from(body, 'utf8'))}.${b64url(sign.sign(TEST_PRIVATE_KEY))}`;
}

const IDENTITY: MachineIdentity = {
  machineId: 'A1B2C3D4E5F60718',
  mac: 'AA:BB:CC:DD:EE:FF',
  source: 'test',
};

/** 不限机器、永不过期、指定档位的码（排除绑定与过期对档位用例的干扰）。 */
function codeOf(edition?: string): string {
  const payload: Record<string, unknown> = { expireAt: null, mac: null, machineId: null };
  if (edition !== undefined) payload.edition = edition;
  return signLicense(payload);
}

function verify(code: string, buildEdition: Edition) {
  return verifyLicenseCodeWithKey(code, TEST_PUBLIC_KEY, IDENTITY, buildEdition);
}

describe('resolveEdition · 授权码档位解析', () => {
  it('三个合法档位原样返回', () => {
    for (const e of EDITIONS) expect(resolveEdition(e)).toBe(e);
  });

  it('★ 缺失字段回落到 pro —— 存量码不掉权限（本文件最重要的一条）', () => {
    // 这个字段是后加的，已发给客户的码全都没有它。兜底成低档会让客户升级后模式消失。
    expect(resolveEdition(undefined)).toBe('pro');
    expect(resolveEdition(null)).toBe('pro');
    expect(FALLBACK_EDITION).toBe('pro');
  });

  it('非法值回落到 pro（不因脏数据把用户降级）', () => {
    for (const v of ['', 'LITE', 'Basic', 'ultimate', 'premium', 123, {}, []]) {
      expect(resolveEdition(v)).toBe('pro');
    }
  });

  it('大小写敏感：大写不算合法档位', () => {
    // 刻意不做 toLowerCase 放宽：签发侧写入的是固定小写枚举，放宽只会掩盖签发侧的笔误。
    expect(resolveEdition('PRO')).toBe('pro');
    expect(resolveEdition('pro')).toBe('pro');
  });
});

describe('resolveBuildEdition · 构建档解析', () => {
  it('三个合法档位原样返回', () => {
    for (const e of EDITIONS) expect(resolveBuildEdition(e)).toBe(e);
  });

  it('★ 缺失/非法回落到 basic（dev 无 env 时的默认档）', () => {
    expect(DEFAULT_BUILD_EDITION).toBe('basic');
    expect(resolveBuildEdition(undefined)).toBe('basic');
    expect(resolveBuildEdition('nonsense')).toBe('basic');
  });

  it('★ 构建档兜底与授权档兜底刻意不同（一个保守、一个宽松）', () => {
    // 授权码兜底成 pro：保护存量客户不掉权限。
    // 构建档兜底成 basic：env 写错属工程事故，此时按最小可用权限跑。
    // 两者若写成同一个值，必然有一边的场景是错的 —— 这条断言把差异钉住。
    expect(FALLBACK_EDITION).toBe('pro');
    expect(DEFAULT_BUILD_EDITION).toBe('basic');
    expect(FALLBACK_EDITION).not.toBe(DEFAULT_BUILD_EDITION);
  });
});

describe('EDITION_MODES · 档位到模式的映射', () => {
  it('阉割版只有办公模式', () => {
    expect(EDITION_MODES.lite).toEqual(['office']);
  });

  it('基础版是办公 + 工作流 + 开发', () => {
    expect(EDITION_MODES.basic).toEqual(['office', 'wf', 'dev']);
  });

  it('高级版是全部五个模式', () => {
    expect(EDITION_MODES.pro).toEqual(['office', 'wf', 'dev', 'ops', 'sec']);
  });

  it('档位单调递增：低档的模式是高哋的子集（不会出现「升级后功能反而少了」）', () => {
    const isSubset = (a: readonly string[], b: readonly string[]) => a.every((m) => b.includes(m));
    expect(isSubset(EDITION_MODES.lite, EDITION_MODES.basic)).toBe(true);
    expect(isSubset(EDITION_MODES.basic, EDITION_MODES.pro)).toBe(true);
  });

  it('每个档位都含办公模式（任何档位都不能把最基础的入口关掉）', () => {
    for (const e of EDITIONS) expect(EDITION_MODES[e]).toContain('office');
  });
});

describe('allowedModes · 构建档 ∩ 授权档', () => {
  it('★ 穷举 3×3 组合 —— 实际放行是交集，不是并集', () => {
    const expected: Record<string, Record<Edition, string[]>> = {
      lite: {
        lite: ['office'],
        basic: ['office'],
        pro: ['office'],
      },
      basic: {
        lite: ['office'],
        basic: ['office', 'wf', 'dev'],
        pro: ['office', 'wf', 'dev'],
      },
      pro: {
        lite: ['office'],
        basic: ['office', 'wf', 'dev'],
        pro: ['office', 'wf', 'dev', 'ops', 'sec'],
      },
    };
    for (const build of EDITIONS) {
      for (const licensed of EDITIONS) {
        expect(allowedModes(build, licensed), `build=${build} licensed=${licensed}`)
          .toEqual(expected[build][licensed]);
      }
    }
  });

  it('★ 高级包 + 基础码 = 三模式（用户拍板：高级包默认带基础码）', () => {
    expect(allowedModes('pro', 'basic')).toEqual(['office', 'wf', 'dev']);
  });

  it('★ 构建档是硬上限：pro 码在阉割包里也只能开出办公模式', () => {
    // 这是「阉割版的包里就没有别的模式」这条需求的落点。
    expect(allowedModes('lite', 'pro')).toEqual(['office']);
  });

  it('兜底档参与交集时不会意外放大权限', () => {
    expect(allowedModes('lite', FALLBACK_EDITION)).toEqual(['office']);
    expect(allowedModes(DEFAULT_BUILD_EDITION, 'pro')).toEqual(['office', 'wf', 'dev']);
  });
});

describe('验签结果携带档位与放行模式', () => {
  it('三档码在各自构建档下返回正确 modes', () => {
    expect(verify(codeOf('lite'), 'lite').modes).toEqual(['office']);
    expect(verify(codeOf('basic'), 'basic').modes).toEqual(['office', 'wf', 'dev']);
    expect(verify(codeOf('pro'), 'pro').modes).toEqual(['office', 'wf', 'dev', 'ops', 'sec']);
  });

  it('★ 老码（payload 无 edition 字段）在高级包里放行全量', () => {
    const r = verify(codeOf(undefined), 'pro');
    expect(r.valid).toBe(true);
    expect(r.edition).toBe('pro');
    expect(r.modes).toEqual(['office', 'wf', 'dev', 'ops', 'sec']);
  });

  it('★ 老码在阉割包里仍被构建档收住（构建档是硬上限）', () => {
    const r = verify(codeOf(undefined), 'lite');
    expect(r.valid).toBe(true);
    expect(r.edition).toBe('pro');
    expect(r.modes).toEqual(['office']);
  });

  it('合法码上 buildEdition 与 edition 各自独立返回，便于排障区分', () => {
    const r = verify(codeOf('basic'), 'pro');
    expect(r.edition).toBe('basic');
    expect(r.buildEdition).toBe('pro');
  });

  it('★ 验签失败的分支也带档位信息（排障时能看出「这码是什么档」）', () => {
    const tampered = codeOf('pro').replace(/^(.{20})/, (m) => m.slice(0, 19) + 'X');
    const r = verify(tampered, 'pro');
    expect(r.valid).toBe(false);
    // payload 已解析出来 → 能报出真实档位
    expect(r.edition).toBe('pro');
    expect(r.modes).toEqual(['office', 'wf', 'dev', 'ops', 'sec']);
  });

  it('格式错误（无法解析 payload）的分支结构完整，不抛异常', () => {
    const r = verify('not-a-license', 'basic');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码格式错误');
    expect(r.buildEdition).toBe('basic');
    expect(Array.isArray(r.modes)).toBe(true);
  });

  it('过期码不放行任何档位（modes 仍带值但 valid=false，前端以 valid 为准）', () => {
    const expired = signLicense({ expireAt: '2020-01-01T00:00:00.000Z', mac: null, machineId: null, edition: 'pro' });
    const r = verify(expired, 'pro');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('授权码已过期');
    expect(r.edition).toBe('pro');
  });

  it('机器不匹配时同样带档位（便于判断「是码错还是机器错」）', () => {
    const bound = signLicense({
      expireAt: null, mac: null, machineId: 'FFFFFFFFFFFFFFFF', edition: 'basic',
    });
    const r = verify(bound, 'pro');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('不符');
    expect(r.edition).toBe('basic');
  });
});

describe('预置授权码 · 按档各一份', () => {
  it('YZ_DEFAULT_LICENSE 整码覆盖优先（人工兜底口子）', () => {
    const prev = process.env.YZ_DEFAULT_LICENSE;
    const prevEd = process.env.YZ_DEFAULT_EDITION;
    try {
      process.env.YZ_DEFAULT_EDITION = 'lite';
      process.env.YZ_DEFAULT_LICENSE = 'ENV_CODE_WINS';
      expect(getDefaultLicenseCode()).toBe('ENV_CODE_WINS');
      process.env.YZ_DEFAULT_LICENSE = '   ';
      // 纯空白视同未设置，回落到档位选择而不是返回空串
      expect(getDefaultLicenseCode()).not.toBe('');
      expect(getDefaultLicenseCode()).not.toBe('ENV_CODE_WINS');
    } finally {
      if (prev === undefined) delete process.env.YZ_DEFAULT_LICENSE;
      else process.env.YZ_DEFAULT_LICENSE = prev;
      if (prevEd === undefined) delete process.env.YZ_DEFAULT_EDITION;
      else process.env.YZ_DEFAULT_EDITION = prevEd;
    }
  });

  it('YZ_DEFAULT_EDITION 选择用哪一档的预置码', () => {
    const prev = process.env.YZ_DEFAULT_LICENSE;
    const prevEd = process.env.YZ_DEFAULT_EDITION;
    try {
      delete process.env.YZ_DEFAULT_LICENSE;
      const byEdition: Record<string, string> = {};
      for (const e of EDITIONS) {
        process.env.YZ_DEFAULT_EDITION = e;
        byEdition[e] = getDefaultLicenseCode();
      }
      // 三档必须各是不同的码，否则说明环境变量没被读到（都回落到同一个兜底值）
      expect(new Set(Object.values(byEdition)).size).toBe(3);
    } finally {
      if (prev === undefined) delete process.env.YZ_DEFAULT_LICENSE;
      else process.env.YZ_DEFAULT_LICENSE = prev;
      if (prevEd === undefined) delete process.env.YZ_DEFAULT_EDITION;
      else process.env.YZ_DEFAULT_EDITION = prevEd;
    }
  });

  it('★ 高级版（pro 构建档）默认携带**基础版**码 —— 用户拍板的产品口径', () => {
    // 这条钉的是「预置码档位 ≠ 构建档」：高级包开箱应当只有三模式，
    // 要用全量必须换成 pro 码。若有人图省事把两者合并，这条会红。
    const prevEd = process.env.YZ_DEFAULT_EDITION;
    const prevCode = process.env.YZ_DEFAULT_LICENSE;
    try {
      delete process.env.YZ_DEFAULT_LICENSE;
      process.env.YZ_DEFAULT_EDITION = 'basic';
      const r = verifyLicenseCode(getDefaultLicenseCode(), IDENTITY, 'pro');
      expect(r.valid).toBe(true);
      expect(r.buildEdition).toBe('pro');
      expect(r.edition).toBe('basic');
      expect(r.modes).toEqual(['office', 'wf', 'dev']);
    } finally {
      if (prevEd === undefined) delete process.env.YZ_DEFAULT_EDITION;
      else process.env.YZ_DEFAULT_EDITION = prevEd;
      if (prevCode === undefined) delete process.env.YZ_DEFAULT_LICENSE;
      else process.env.YZ_DEFAULT_LICENSE = prevCode;
    }
  });

  it('★ 三个内置预置码都能通过生产公钥验签，且档位与声明一致', () => {
    // 这条是「占位符没被替换 / 码签错档位」的守门用例：内置码是手工签好粘进来的，
    // 粘错一个字符、或签的时候忘了 --edition，都会让阉割版开箱变成全量档。
    for (const e of EDITIONS) {
      const prev = process.env.YZ_DEFAULT_LICENSE;
      const prevEdition = process.env.YZ_DEFAULT_EDITION;
      try {
        delete process.env.YZ_DEFAULT_LICENSE;
        process.env.YZ_DEFAULT_EDITION = e;
        const code = getDefaultLicenseCode();
        expect(code).not.toContain('PLACEHOLDER');
        const r = verifyLicenseCode(code, IDENTITY, e);
        expect(r.valid, `内置 ${e} 码验签失败: ${r.reason}`).toBe(true);
        expect(r.edition).toBe(e);
        expect(r.modes).toEqual([...EDITION_MODES[e]]);
      } finally {
        if (prev === undefined) delete process.env.YZ_DEFAULT_LICENSE;
        else process.env.YZ_DEFAULT_LICENSE = prev;
        if (prevEdition === undefined) delete process.env.YZ_DEFAULT_EDITION;
        else process.env.YZ_DEFAULT_EDITION = prevEdition;
      }
    }
  });

  it('★ 内置预置码为 90 天口径（防止被误签成 365 天）', () => {
    // 为什么钉这条：预置码的时长是产品口径（90 天试用），而 --days 是个随手就能填错的参数。
    // 实测踩过 —— 重签时顺手写了 --days 365，把 90 天试用变成了一年，
    // 而所有既有测试都是绿灯（它们只验「码有效」，不验「有效期多长」）。
    // 这个用例把口径本身钉住：900 天/365 天这类手滑会立刻变红。
    // ★ 2026-10-03 修复时间依赖缺陷：原断言"从**今天**算剩余 85~95 天"随真实时间流逝必然变红
    //   （实测 09-19 签的码到 10-03 只剩 76 天）。改为**时间不变量**：expireAt − 签发日 ≈ 90 天。
    //   签发日与预置码常量一起维护（src/license.ts 的 DEFAULT_LICENSE_BY_EDITION）：
    //   每次重签预置码时必须同步更新 LICENSE_SIGNED_AT，否则本测试会指出口径对不上。
    // ★ signedAt（gen-license 2026-10-03 起携带）优先：构建时现签的码用自身签发时刻，
    //   断言与运行日期彻底无关；存量码（无 signedAt）回退下面的历史签发日常量。
    const LICENSE_SIGNED_AT_FALLBACK = Date.parse('2026-09-19T15:59:59.000Z'); // 90 天前 = expire 2026-12-18T15:59:59Z
    const EXPECT_MIN_DAYS = 89;
    const EXPECT_MAX_DAYS = 91;
    const prev = process.env.YZ_DEFAULT_LICENSE;
    try {
      for (const e of EDITIONS) {
        delete process.env.YZ_DEFAULT_LICENSE;
        process.env.YZ_DEFAULT_EDITION = e;
        const payloadB64 = getDefaultLicenseCode().split('.')[0];
        const pad = payloadB64.length % 4 ? '='.repeat(4 - (payloadB64.length % 4)) : '';
        const payload = JSON.parse(
          Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8'),
        );
        expect(payload.expireAt, `${e} 码 expireAt 应为具体时间（试用码不该永不过期）`).toBeTruthy();
        const signedAt = payload.signedAt ? Date.parse(payload.signedAt) : LICENSE_SIGNED_AT_FALLBACK;
        expect(signedAt, `${e} 码签发时刻不可解析`).not.toBeNaN();
        const days = (new Date(payload.expireAt).getTime() - signedAt) / 86400000;
        expect(days, `${e} 码有效期 ${Math.round(days)} 天，超出 90 天口径（${EXPECT_MIN_DAYS}~${EXPECT_MAX_DAYS}）—— 重签时同步更新 LICENSE_SIGNED_AT`)
          .toBeGreaterThanOrEqual(EXPECT_MIN_DAYS);
        expect(days).toBeLessThanOrEqual(EXPECT_MAX_DAYS);
      }
    } finally {
      if (prev === undefined) delete process.env.YZ_DEFAULT_LICENSE;
      else process.env.YZ_DEFAULT_LICENSE = prev;
    }
  });

  it('★ 内置预置码不绑机器（绑了会让所有用户的包失效）', () => {
    // 预置码是打进**每个**安装包的：一旦绑上某台机器的指纹，除那台之外所有用户开箱即失效。
    // 要按机器绑定应当由签发方针对具体客户单独签发，不能动预置码。
    const prev = process.env.YZ_DEFAULT_LICENSE;
    try {
      for (const e of EDITIONS) {
        delete process.env.YZ_DEFAULT_LICENSE;
        process.env.YZ_DEFAULT_EDITION = e;
        const payloadB64 = getDefaultLicenseCode().split('.')[0];
        const pad = payloadB64.length % 4 ? '='.repeat(4 - (payloadB64.length % 4)) : '';
        const payload = JSON.parse(
          Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8'),
        );
        expect(payload.machineId, `${e} 预置码不应绑 machineId`).toBeNull();
        expect(payload.mac, `${e} 预置码不应绑 mac`).toBeNull();
      }
    } finally {
      if (prev === undefined) delete process.env.YZ_DEFAULT_LICENSE;
      else process.env.YZ_DEFAULT_LICENSE = prev;
    }
  });
});