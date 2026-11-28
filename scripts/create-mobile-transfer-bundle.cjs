#!/usr/bin/env node
/**
 * 生成家庭电脑迁移目录。
 *
 * 该目录含正式签名私钥和密码属性，只能通过加密移动存储、受控局域网或公司网盘传输。
 * dist-release/ 已被 gitignore，不能把生成目录提交到仓库。
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobileDir = path.join(root, 'apps', 'mobile');
const signingDir = path.join(mobileDir, 'signing');
const version = JSON.parse(fs.readFileSync(path.join(mobileDir, 'package.json'), 'utf8')).version;
const apkDir = path.join(root, 'dist-release', 'android', version);
const transferDir = path.join(root, 'dist-release', 'mobile-transfer', version);
const apkNames = [
  `yan-zhi-${version}-arm64-v8a.apk`,
  `yan-zhi-${version}-armeabi-v7a.apk`,
];
const signingNames = ['yan-zhi-release.jks', 'keystore.properties', 'cert-sha256.txt'];
const docName = '安卓正式签名与上架备案操作手册.md';

function copyRequired(source, destinationDir) {
  if (!fs.existsSync(source)) throw new Error(`缺少迁移文件: ${source}`);
  fs.mkdirSync(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, path.basename(source));
  fs.copyFileSync(source, destination);
  return destination;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  if (fs.existsSync(transferDir)) fs.rmSync(transferDir, { recursive: true, force: true });
  const files = [];
  for (const name of apkNames) files.push(copyRequired(path.join(apkDir, name), path.join(transferDir, 'apk')));
  for (const name of signingNames) {
    files.push(copyRequired(path.join(signingDir, name), path.join(transferDir, 'signing')));
  }
  files.push(copyRequired(
    path.join(root, 'docs', docName),
    path.join(transferDir, 'docs'),
  ));

  const readme = [
    '# 言智 Android 正式发行迁移包',
    '',
    `版本：${version}`,
    '',
    '此目录包含正式签名私钥，只能通过加密移动存储、受控局域网或公司网盘传输。',
    '不要上传 GitHub、公开网盘、微信群或普通邮件。',
    '',
    '## 家里电脑安装',
    '',
    '1. 安装 Node.js 24、pnpm 11、JDK 21、Android SDK 36。',
    '2. 克隆仓库并检出 `dev0.1-mobile`。',
    '3. 把本目录 `signing/` 下的全部文件复制到 `apps/mobile/signing/`。',
    '4. 执行 `pnpm install`。',
    '5. 执行 `pnpm package:android`。',
    '6. 用 `docs/安卓正式签名与上架备案操作手册.md` 第 3 节核对证书 SHA-256。',
    '',
    '签名密码保存在 `signing/keystore.properties`，不要在终端、聊天或日志中重复粘贴。',
    '',
    '## 校验',
    '',
    '执行 `Get-FileHash -Algorithm SHA256` 后与 `SHA256SUMS.txt` 比较。',
    '',
  ].join('\n');
  const readmePath = path.join(transferDir, 'README.md');
  fs.writeFileSync(readmePath, readme, 'utf8');
  files.push(readmePath);

  const checksums = files
    .map((file) => `${sha256(file)}  ${path.relative(transferDir, file).replace(/\\/g, '/')}`)
    .join('\n') + '\n';
  fs.writeFileSync(path.join(transferDir, 'SHA256SUMS.txt'), checksums, 'utf8');
  console.log(`[transfer-bundle] ${path.relative(root, transferDir)}`);
}

try {
  main();
} catch (error) {
  console.error(`[transfer-bundle][ERROR] ${error.message}`);
  process.exit(1);
}
