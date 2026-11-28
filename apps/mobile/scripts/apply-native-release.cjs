#!/usr/bin/env node
/**
 * 把 apps/mobile/package.json 的版本同步到 Capacitor 生成的 build.gradle。
 *
 * versionCode 规则：major * 10000 + minor * 100 + patch。
 * 0.1.1 -> 101，0.1.2 -> 102，1.0.0 -> 10000。
 * android/ 是 cap 生成目录，因此每次 cap sync 后都必须重新执行本脚本。
 */
const fs = require('node:fs');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const packageFile = path.join(mobileDir, 'package.json');
const buildGradleFile = path.join(mobileDir, 'android', 'app', 'build.gradle');

function versionCodeFor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || '').trim());
  if (!match) throw new Error(`移动端版本号不是 major.minor.patch: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  if (minor > 99 || patch > 99) {
    throw new Error(`versionCode 规则要求 minor/patch <= 99，实际 ${version}`);
  }
  const code = major * 10000 + minor * 100 + patch;
  if (!Number.isSafeInteger(code) || code < 1) throw new Error(`versionCode 非法: ${code}`);
  return code;
}

function applyReleaseVersion(source, { version, versionCode }) {
  const codePattern = /^(\s*versionCode\s+)\d+(\s*)$/m;
  const namePattern = /^(\s*versionName\s+)"[^"]*"(\s*)$/m;
  if (!codePattern.test(source)) throw new Error('build.gradle 未找到 versionCode');
  if (!namePattern.test(source)) throw new Error('build.gradle 未找到 versionName');
  return source
    .replace(codePattern, `$1${versionCode}$2`)
    .replace(namePattern, `$1"${version}"$2`);
}

function main() {
  if (!fs.existsSync(packageFile)) throw new Error(`缺少 ${packageFile}`);
  if (!fs.existsSync(buildGradleFile)) {
    throw new Error(`缺少 ${buildGradleFile}，请先执行 cap sync android`);
  }
  const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
  const versionCode = versionCodeFor(version);
  const current = fs.readFileSync(buildGradleFile, 'utf8');
  const next = applyReleaseVersion(current, { version, versionCode });
  if (next !== current) fs.writeFileSync(buildGradleFile, next, 'utf8');
  console.log(`[native-release] versionName=${version} versionCode=${versionCode}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[native-release][ERROR] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { versionCodeFor, applyReleaseVersion };
