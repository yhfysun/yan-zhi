#!/usr/bin/env node
// 预置授权码「构建时现签」（2026-10-03 拍板，docs/预置授权码-构建时现签-方案.md）
//
// 用法：node ./scripts/pre-sign-license.cjs [--days 90]
//
// 做三件事：
//   1. 校验私钥 scripts/license-private-key.pem 存在 —— 缺失**明确报错中止打包**
//      （与 python 运行时缺失同口径：不再静默降级出"无试用码"的包）；
//      逃生舱 YZ_SKIP_LICENSE_SIGN=1 显式跳过（同时**删除**残留的旧 codes 文件，
//      防止把过期的码静默打进包里）。
//   2. 调 scripts/gen-license.mjs --out 现签三档（lite/basic/pro，默认 90 天）。
//   3. 产物写到 apps/desktop/resources/license/default-codes.json
//      （electron-builder.yml 的 extraResources 已把 resources/license → 包内 license/）。
//
// 运行时：main.cjs 给 server 传 YZ_LICENSE_CODES_FILE 指向包内 JSON；
//         license.ts 优先读它，缺失回退源码常量（存量包向后兼容）。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..', '..');
const privateKeyPath = path.join(rootDir, 'scripts', 'license-private-key.pem');
const genLicensePath = path.join(rootDir, 'scripts', 'gen-license.mjs');
const outDir = path.join(desktopDir, 'resources', 'license');
const outFile = path.join(outDir, 'default-codes.json');

const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 90;

const skip = process.env.YZ_SKIP_LICENSE_SIGN === '1';

if (skip) {
  // 显式跳过：删除残留 codes，避免"忘了现签还把过期码打进包"
  if (fs.existsSync(outFile)) {
    fs.rmSync(path.dirname(outFile), { recursive: true, force: true });
    console.warn('[pre-sign-license] YZ_SKIP_LICENSE_SIGN=1：已移除残留的 default-codes.json（本包不含预置试用码）');
  } else {
    console.warn('[pre-sign-license] YZ_SKIP_LICENSE_SIGN=1：跳过预置码现签');
  }
  process.exit(0);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error('[pre-sign-license] 未找到签发私钥: ' + privateKeyPath);
  console.error('  预置试用码需要构建时现签（源码不再存码）。请把私钥放到上述路径后重试；');
  console.error('  确认要出无预置码的包，用 YZ_SKIP_LICENSE_SIGN=1 显式跳过。');
  process.exit(1);
}
// 签发脚本与私钥同机（仓库策略：两者都不入库，见 .gitignore 授权码签发侧注释）
const genLicenseHint = '[pre-sign-license] 未找到签发脚本: ' + genLicensePath + ' —— 签发工具与私钥同机维护（不入库），请从签发者本机同步 scripts/gen-license.mjs';
if (!fs.existsSync(genLicensePath)) {
  console.error(genLicenseHint);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
execFileSync(
  process.execPath,
  [genLicensePath, '--out', outFile, '--days', String(days)],
  { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } },
);

// 快速自检：JSON 可解析且三档齐全（签名有效性由运行时验签兜底）
const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
for (const e of ['lite', 'basic', 'pro']) {
  if (!j.codes || !j.codes[e]) {
    console.error(`[pre-sign-license] 签发产物缺 ${e} 档，中止打包`);
    process.exit(1);
  }
}
console.log(`[pre-sign-license] OK: 预置码已现签（${j.days} 天，到期 ${j.expireAt}）`);
