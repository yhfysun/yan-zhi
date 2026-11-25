#!/usr/bin/env node
const { applyAndroidSigning, loadSigningMaterial } = require('./lib/android-signing.cjs');

try {
  const material = loadSigningMaterial();
  const result = applyAndroidSigning();
  console.log(
    `[android-signing] 已${result.changed ? '写入' : '确认'}固定签名配置：`
    + `alias=${material.keyAlias}, keystore=${material.storeFile}`,
  );
} catch (error) {
  console.error(`[android-signing][ERROR] ${error.message}`);
  process.exit(1);
}
