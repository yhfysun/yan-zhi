// 移动端免激活（MOBILE_MODE）分支测试（2026-10-25 移动端打包问题修复）。
//
// 背景：移动端内置完整本地后端，但打包不带预置码文件 → GET /license/default 返回
// valid:false → 前端死路授权页（实测截图：App 停在「版本档位 读取中…」）。
// 产品拍板：移动端免激活恒全量。这里钉住三件事：
//   1. MOBILE_MODE 下**任意**授权码（含垃圾串/空串）都 valid 且是 pro 全量档；
//   2. 非 MOBILE_MODE 行为分毫不变（垃圾码仍然拒绝）——移动分支绝不能泄漏到桌面；
//   3. MOBILE_MODE 结果里 modes = EDITION_MODES.pro（模式门禁按它收敛）。
import { describe, it, expect, afterEach } from 'vitest';
import { EDITION_MODES, verifyLicenseCodeWithKey, type MachineIdentity } from '../src/license';

const IDENTITY: MachineIdentity = { machineId: 'A1B2C3D4E5F60718', mac: 'AA:BB:CC:DD:EE:FF', source: 'test' };
const MOBILE_KEY = process.env.MOBILE_MODE;

afterEach(() => {
  if (MOBILE_KEY === undefined) delete process.env.MOBILE_MODE;
  else process.env.MOBILE_MODE = MOBILE_KEY;
});

describe('verifyLicenseCodeWithKey · MOBILE_MODE 免激活', () => {
  it('MOBILE_MODE：任意码（垃圾串/空串）都 valid 且为 pro 全量', () => {
    process.env.MOBILE_MODE = '1';
    for (const code of ['garbage', '', 'not.a.code']) {
      const r = verifyLicenseCodeWithKey(code, 'no-key-needed', IDENTITY, 'lite');
      expect(r.valid, `code=${code}`).toBe(true);
      expect(r.edition).toBe('pro');
      expect(r.buildEdition).toBe('pro');
      expect(r.modes).toEqual([...EDITION_MODES.pro]);
      expect(r.reason).toBe('mobile-full');
      expect(r.expireAt).toBeNull();
    }
  });

  it('非 MOBILE_MODE：行为不变（垃圾码拒绝，不泄漏移动分支）', () => {
    delete process.env.MOBILE_MODE;
    const r = verifyLicenseCodeWithKey('garbage', 'no-key-needed', IDENTITY, 'pro');
    expect(r.valid).toBe(false);
  });
});
