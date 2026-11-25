import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applySigningConfig,
  parseProperties,
  readExpectedFingerprint,
} = require('../scripts/lib/android-signing.cjs') as {
  applySigningConfig: (source: string) => string;
  parseProperties: (source: string) => Record<string, string>;
  readExpectedFingerprint: () => string;
};

describe('Android 固定签名', () => {
  it('解析 keystore.properties，并保留值中的等号', () => {
    expect(parseProperties('storeFile=a.jks\nstorePassword=p=a==\n# ignored\nkeyAlias=yan-zhi')).toEqual({
      storeFile: 'a.jks',
      storePassword: 'p=a==',
      keyAlias: 'yan-zhi',
    });
  });

  it('将同一签名配置幂等写入 debug/release 构建', () => {
    const source = "apply plugin: 'com.android.application'\n\nandroid {}\n";
    const once = applySigningConfig(source);
    const twice = applySigningConfig(once);

    expect(once.match(/YZ_ANDROID_SIGNING_START/g)).toHaveLength(1);
    expect(twice.match(/YZ_ANDROID_SIGNING_START/g)).toHaveLength(1);
    expect(twice).toContain('signingConfig signingConfigs.yanzhiRelease');
    expect(twice).toContain("keyAlias yzSigningProperties.getProperty('keyAlias')");
    expect(twice).toContain('storeFile yzSigningStoreFile');
  });

  it('仓库内只保存公开证书指纹', () => {
    const source = readFileSync(
      resolve(__dirname, '../signing/cert-sha256.txt'),
      'utf8',
    );
    expect(source).toMatch(/^[0-9a-f]{64}\s*$/);
    expect(readExpectedFingerprint()).toBe(source.trim());
  });
});
