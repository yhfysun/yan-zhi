const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOBILE_DIR = path.resolve(__dirname, '..', '..');
const SIGNING_DIR = path.join(MOBILE_DIR, 'signing');
const PROPERTIES_FILE = path.join(SIGNING_DIR, 'keystore.properties');
const CERT_SHA256_FILE = path.join(SIGNING_DIR, 'cert-sha256.txt');
const BUILD_GRADLE_FILE = path.join(MOBILE_DIR, 'android', 'app', 'build.gradle');
const START_MARKER = '// YZ_ANDROID_SIGNING_START';
const END_MARKER = '// YZ_ANDROID_SIGNING_END';
const REQUIRED_KEYS = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'];

function parseProperties(text) {
  const out = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function loadSigningMaterial({ propertiesPath = PROPERTIES_FILE } = {}) {
  if (!fs.existsSync(propertiesPath)) {
    throw new Error(
      `缺少 Android 固定签名配置: ${propertiesPath}\n`
      + '请从另一台已配置的电脑复制 signing/yan-zhi-release.jks 与 signing/keystore.properties，'
      + '或在 CI 中配置 ANDROID_KEYSTORE_BASE64 / ANDROID_SIGNING_PROPERTIES_BASE64。',
    );
  }
  const properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'));
  const missing = REQUIRED_KEYS.filter((key) => !properties[key]);
  if (missing.length) throw new Error(`Android 签名配置缺少字段: ${missing.join(', ')}`);
  const storeFile = path.resolve(path.dirname(propertiesPath), properties.storeFile);
  if (!fs.existsSync(storeFile)) throw new Error(`Android 签名 keystore 不存在: ${storeFile}`);
  return { ...properties, storeFile, propertiesPath };
}

function signingGradleBlock() {
  return [
    START_MARKER,
    'def yzSigningProperties = new Properties()',
    "def yzSigningPropertiesFile = rootProject.file('../signing/keystore.properties')",
    'if (!yzSigningPropertiesFile.isFile()) {',
    "    throw new GradleException('缺少 Android 固定签名配置: apps/mobile/signing/keystore.properties')",
    '}',
    'yzSigningPropertiesFile.withInputStream { yzSigningProperties.load(it) }',
    'def yzSigningStoreFile = new File(',
    "    yzSigningPropertiesFile.parentFile,",
    "    yzSigningProperties.getProperty('storeFile'),",
    ')',
    'if (!yzSigningStoreFile.isFile()) {',
    "    throw new GradleException('缺少 Android 固定签名 keystore: ' + yzSigningStoreFile)",
    '}',
    'android {',
    '    signingConfigs {',
    '        yanzhiRelease {',
    '            storeFile yzSigningStoreFile',
    "            storePassword yzSigningProperties.getProperty('storePassword')",
    "            keyAlias yzSigningProperties.getProperty('keyAlias')",
    "            keyPassword yzSigningProperties.getProperty('keyPassword')",
    '            enableV1Signing true',
    '            enableV2Signing true',
    '            enableV3Signing true',
    '        }',
    '    }',
    '    buildTypes {',
    '        debug {',
    '            signingConfig signingConfigs.yanzhiRelease',
    '        }',
    '        release {',
    '            signingConfig signingConfigs.yanzhiRelease',
    '        }',
    '    }',
    '}',
    END_MARKER,
  ].join('\n');
}

function applySigningConfig(source) {
  const marker = new RegExp(`\\n?${START_MARKER}[\\s\\S]*?${END_MARKER}\\s*`, 'g');
  const clean = String(source || '').replace(marker, '').trimEnd();
  return `${clean}\n\n${signingGradleBlock()}\n`;
}

function applyAndroidSigning({ buildGradlePath = BUILD_GRADLE_FILE } = {}) {
  loadSigningMaterial();
  if (!fs.existsSync(buildGradlePath)) {
    throw new Error(`Android build.gradle 不存在: ${buildGradlePath}（先运行 cap add android）`);
  }
  const current = fs.readFileSync(buildGradlePath, 'utf8');
  const next = applySigningConfig(current);
  if (next !== current) fs.writeFileSync(buildGradlePath, next, 'utf8');
  return { buildGradlePath, changed: next !== current };
}

function readExpectedFingerprint(file = CERT_SHA256_FILE) {
  if (!fs.existsSync(file)) throw new Error(`缺少 APK 证书指纹文件: ${file}`);
  const fingerprint = fs.readFileSync(file, 'utf8').replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (fingerprint.length !== 64) throw new Error(`APK 证书指纹格式错误: ${file}`);
  return fingerprint;
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    'C:/Android/Sdk',
  ].filter(Boolean);
  const sdk = candidates.find((dir) =>
    fs.existsSync(path.join(dir, 'platform-tools'))
    && fs.existsSync(path.join(dir, 'build-tools')),
  );
  if (!sdk) throw new Error('未找到 Android SDK，无法校验 APK 签名');
  return sdk;
}

function findApkSignerJar(sdk = findAndroidSdk()) {
  const buildTools = path.join(sdk, 'build-tools');
  const versions = fs.readdirSync(buildTools).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
  for (const version of versions) {
    const candidate = path.join(buildTools, version, 'lib', 'apksigner.jar');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`未找到 apksigner.jar: ${buildTools}`);
}

function findJavaExecutable() {
  const names = process.platform === 'win32' ? ['java.exe', 'java'] : ['java'];
  const candidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '',
    ...['C:/APP/Java', 'C:/Program Files/Java', 'C:/Program Files/Eclipse Adoptium']
      .flatMap((root) => {
        if (!fs.existsSync(root)) return [];
        return fs.readdirSync(root)
          .sort()
          .reverse()
          .map((name) => path.join(root, name, 'bin'));
      }),
    ...String(process.env.PATH || '').split(path.delimiter),
  ].filter(Boolean);
  for (const dir of candidates) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error('未找到 java，无法校验 APK 签名');
}

function verifyApkSignature(apkPath, { expectedFingerprint = readExpectedFingerprint() } = {}) {
  if (!fs.existsSync(apkPath)) throw new Error(`APK 不存在: ${apkPath}`);
  const result = spawnSync(
    findJavaExecutable(),
    ['-jar', findApkSignerJar(), 'verify', '--print-certs', apkPath],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status !== 0) throw new Error(`apksigner 校验失败: ${output}`);
  const match = /certificate SHA-256 digest:\s*([0-9a-f]+)/i.exec(output);
  if (!match) throw new Error(`无法从 apksigner 输出读取证书指纹: ${output}`);
  const actual = match[1].toLowerCase();
  if (actual !== expectedFingerprint) {
    throw new Error(
      `APK 签名证书不一致\n  期望: ${expectedFingerprint}\n  实际: ${actual}\n`
      + '请确认 signing/yan-zhi-release.jks 与 keystore.properties 在公司/家里电脑完全一致。',
    );
  }
  return actual;
}

module.exports = {
  MOBILE_DIR,
  SIGNING_DIR,
  PROPERTIES_FILE,
  CERT_SHA256_FILE,
  parseProperties,
  loadSigningMaterial,
  signingGradleBlock,
  applySigningConfig,
  applyAndroidSigning,
  readExpectedFingerprint,
  findAndroidSdk,
  findApkSignerJar,
  findJavaExecutable,
  verifyApkSignature,
};
