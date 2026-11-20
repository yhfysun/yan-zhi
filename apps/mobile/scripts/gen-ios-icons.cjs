#!/usr/bin/env node
/**
 * 把 approved 品牌图标铺进 Capacitor 生成的 iOS 工程。
 *
 * 必须在 `cap add ios` / `cap sync ios` 之后执行；`ios/` 是生成目录，不提交。
 * iOS 不接受透明 AppIcon，因此统一压到应用浅色底板后输出 1024x1024 PNG。
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SOURCE = path.join(ROOT, 'assets', 'icons', 'icon.png');
const IOS_DIR = path.join(ROOT, 'apps', 'mobile', 'ios');
const TARGET = path.join(
  IOS_DIR,
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png',
);

async function main() {
  if (!fs.existsSync(IOS_DIR)) {
    console.log('[ios-icons] 未找到 ios/，跳过');
    return;
  }
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`品牌图标不存在: ${SOURCE}`);
  }
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  await sharp(SOURCE)
    .resize(1024, 1024, { fit: 'cover' })
    .flatten({ background: '#f8fafc' })
    .png({ compressionLevel: 9 })
    .toFile(TARGET);
  console.log('[ios-icons] 已生成:', path.relative(ROOT, TARGET));
}

main().catch((error) => {
  console.error('[ios-icons]', error);
  process.exitCode = 1;
});
