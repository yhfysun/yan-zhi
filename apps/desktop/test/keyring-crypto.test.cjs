/**
 * Keyring 敏感值加解密单测。
 *
 * 为什么值得测：这里最容易写错的是「兼容语义」，而它在真机上几乎无法构造验证 ——
 *   1) 升级前的旧明文文件必须照常读出（写成只认密文 → 老用户 API Key 全丢）；
 *   2) 密文解密失败必须**显式失败**而不是把 enc:v1:xxx 当 API Key 返回
 *      （返回密文 → 上游 401，错误信息毫无指向性，极难排查）；
 *   3) safeStorage 不可用时（Linux 缺 libsecret）要降级明文，而不是让保存整个失败。
 *
 * safeStorage 由调用方注入，本测试用假实现，故可在裸 Node 下跑（无需 Electron 运行时）。
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  KEYRING_ENC_PREFIX,
  isSensitiveKeyringKey,
  encryptKeyringValue,
  isEncryptedKeyringValue,
  decryptKeyringValue,
} = require('../keyring-crypto.cjs');

/** 可控的假 safeStorage：encryptString 做成「明文反转 + 前缀」，便于断言真实参与了运算。 */
function fakeSafeStorage(opts = {}) {
  const { available = true, throwOnEncrypt = false, throwOnDecrypt = false } = opts;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => {
      if (throwOnEncrypt) throw new Error('encrypt boom');
      return Buffer.from('SEALED<' + s + '>', 'utf8');
    },
    decryptString: (buf) => {
      if (throwOnDecrypt) throw new Error('decrypt boom');
      const raw = buf.toString('utf8');
      const m = /^SEALED<([\s\S]*)>$/.exec(raw);
      if (!m) throw new Error('bad ciphertext');
      return m[1];
    },
  };
}

describe('isSensitiveKeyringKey · 敏感键判定', () => {
  test('授权码与平台 API Key 是敏感键', () => {
    assert.equal(isSensitiveKeyringKey('license_code'), true);
    assert.equal(isSensitiveKeyringKey('platform:abc:apikey'), true);
    assert.equal(isSensitiveKeyringKey('platform:agnes-main:apikey'), true);
  });

  test('界面偏好不是敏感键（加密后无法人工排查配置问题）', () => {
    assert.equal(isSensitiveKeyringKey('settings:app'), false);
    assert.equal(isSensitiveKeyringKey('settings:workspaceDir'), false);
    assert.equal(isSensitiveKeyringKey('theme'), false);
  });

  test('形似但不同的键不误判', () => {
    assert.equal(isSensitiveKeyringKey('license'), false);
    assert.equal(isSensitiveKeyringKey('license_code_backup'), false);
    assert.equal(isSensitiveKeyringKey('platform:abc:apikey2'), false);
    assert.equal(isSensitiveKeyringKey('platform:abc:token'), false);
    assert.equal(isSensitiveKeyringKey('platform::apikey'), false);
  });
});

describe('encryptKeyringValue · 加密', () => {
  test('可用时产出带 enc:v1: 前缀的密文', () => {
    const out = encryptKeyringValue(fakeSafeStorage(), 'sk-secret');
    assert.ok(out.startsWith(KEYRING_ENC_PREFIX));
    assert.ok(out.includes('SEALED<sk-secret>') === false, '密文不应含明文');
    // 经 base64 后原文不可直接读出
    const b64 = out.slice(KEYRING_ENC_PREFIX.length);
    assert.ok(!b64.includes('sk-secret'));
  });

  test('safeStorage 不可用时返回 null（调用方降级明文）', () => {
    assert.equal(encryptKeyringValue(fakeSafeStorage({ available: false }), 'v'), null);
  });

  test('未注入 safeStorage 时返回 null 而不抛错', () => {
    assert.equal(encryptKeyringValue(null, 'v'), null);
    assert.equal(encryptKeyringValue(undefined, 'v'), null);
    assert.equal(encryptKeyringValue({}, 'v'), null);
  });

  test('加密抛错（Linux 缺密钥环）时返回 null 而非中断保存', () => {
    assert.equal(encryptKeyringValue(fakeSafeStorage({ throwOnEncrypt: true }), 'v'), null);
  });

  test('非字符串值不加密（保持原类型语义）', () => {
    assert.equal(encryptKeyringValue(fakeSafeStorage(), 123), null);
    assert.equal(encryptKeyringValue(fakeSafeStorage(), null), null);
  });

  test('空字符串可加密（不因 falsy 被跳过）', () => {
    const out = encryptKeyringValue(fakeSafeStorage(), '');
    assert.ok(out && out.startsWith(KEYRING_ENC_PREFIX));
    assert.equal(decryptKeyringValue(fakeSafeStorage(), out).value, '');
  });
});

describe('isEncryptedKeyringValue · 格式判定', () => {
  test('识别密文标记', () => {
    assert.equal(isEncryptedKeyringValue(KEYRING_ENC_PREFIX + 'AAA'), true);
    assert.equal(isEncryptedKeyringValue('plain-value'), false);
    assert.equal(isEncryptedKeyringValue(null), false);
    assert.equal(isEncryptedKeyringValue(undefined), false);
  });

  test('大小写敏感：ENC:V1: 不算密文（避免误判后解密失败）', () => {
    assert.equal(isEncryptedKeyringValue('ENC:V1:AAA'), false);
  });
});

describe('decryptKeyringValue · 解密与兼容', () => {
  test('★ 旧明文值原样返回（升级后老用户配置不丢）', () => {
    const r = decryptKeyringValue(fakeSafeStorage(), 'sk-plain-old');
    assert.equal(r.ok, true);
    assert.equal(r.value, 'sk-plain-old');
  });

  test('★ 密文解密成功返回原文', () => {
    const s = fakeSafeStorage();
    const enc = encryptKeyringValue(s, 'sk-round-trip');
    const r = decryptKeyringValue(s, enc);
    assert.equal(r.ok, true);
    assert.equal(r.value, 'sk-round-trip');
  });

  test('★ 密文解密失败必须 ok:false，绝不能把密文当值返回', () => {
    const r = decryptKeyringValue(fakeSafeStorage({ throwOnDecrypt: true }), KEYRING_ENC_PREFIX + 'AAA');
    assert.equal(r.ok, false);
    assert.equal(r.value, null);
    assert.ok(/boom/.test(r.reason));
    // 关键断言：返回值里不能出现密文本身（否则会被当 API Key 发到上游 → 401）
    assert.notEqual(r.value, KEYRING_ENC_PREFIX + 'AAA');
  });

  test('safeStorage 不可用时解不开密文 → ok:false 带原因', () => {
    const s = fakeSafeStorage();
    const enc = encryptKeyringValue(s, 'x');
    const r = decryptKeyringValue(fakeSafeStorage({ available: false }), enc);
    assert.equal(r.ok, false);
    assert.match(r.reason, /不可用/);
  });

  test('未注入 safeStorage 时解密文 → ok:false', () => {
    const r = decryptKeyringValue(null, KEYRING_ENC_PREFIX + 'AAA');
    assert.equal(r.ok, false);
    assert.match(r.reason, /未注入/);
  });

  test('非字符串值直接透传（数字/布尔/对象）', () => {
    assert.deepEqual(decryptKeyringValue(fakeSafeStorage(), 42), { ok: true, value: 42 });
    assert.deepEqual(decryptKeyringValue(fakeSafeStorage(), null), { ok: true, value: null });
  });

  test('跨机器场景：用另一台机器的 safeStorage 解不开 → ok:false', () => {
    const machineA = fakeSafeStorage();
    // B 机器的 decryptString 只认自己的格式
    const machineB = {
      isEncryptionAvailable: () => true,
      encryptString: (x) => Buffer.from('B<' + x + '>'),
      decryptString: () => { throw new Error('DPAPI: 数据无效'); },
    };
    const enc = encryptKeyringValue(machineA, 'sk-secret');
    const r = decryptKeyringValue(machineB, enc);
    assert.equal(r.ok, false);
    assert.equal(r.value, null);
  });
});

describe('端到端往返', () => {
  test('多类型值加密后再解密完全一致', () => {
    const s = fakeSafeStorage();
    const cases = [
      'sk-abcdef1234567890',
      'eyJleHBpcmVBdCI6IjIwMjYtMTEtMjdUMTU6NTk6NTkuMDAwWiIsIm1hYyI6bnVsbH0.sig-part',
      '含中文的密钥说明-token',
      JSON.stringify({ nested: true, arr: [1, 2, 3] }),
      'a'.repeat(5000),
    ];
    for (const v of cases) {
      const enc = encryptKeyringValue(s, v);
      assert.ok(enc, '应能加密: ' + v.slice(0, 20));
      assert.equal(decryptKeyringValue(s, enc).value, v);
    }
  });

  test('相同明文两次加密结果一致（假实现确定性；真实 DPAPI 不同但都能解回）', () => {
    const s = fakeSafeStorage();
    assert.equal(encryptKeyringValue(s, 'same'), encryptKeyringValue(s, 'same'));
  });
});