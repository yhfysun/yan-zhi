/**
 * Android 移动发行配置解析（唯一真相源 = build/mobile.catalog.json）。
 *
 * 这里刻意不使用插件选择器的 requires 闭包：
 * 桌面插件可以把 CICD / Java 作为强依赖，手机端只发行运维基础工作台，
 * 不应因为桌面依赖自动把这两个桌面功能塞回 APK。
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILE_PATH = path.join(REPO_ROOT, 'build', 'mobile.catalog.json');
const SUPPORTED_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86_64']);

function parseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function uniqueStrings(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`[mobile-profile] ${field} 必须是非空数组`);
  }
  const out = value.map((item) => String(item || '').trim()).filter(Boolean);
  if (out.length !== value.length) throw new Error(`[mobile-profile] ${field} 不能包含空值`);
  if (new Set(out).size !== out.length) throw new Error(`[mobile-profile] ${field} 不能重复`);
  return out;
}

function loadMobileProfile({ profilePath = PROFILE_PATH } = {}) {
  const profile = parseJson(profilePath);
  profile.modes = uniqueStrings(profile.modes, 'modes');
  profile.plugins = uniqueStrings(profile.plugins, 'plugins');
  profile.abis = uniqueStrings(profile.abis, 'abis');
  for (const abi of profile.abis) {
    if (!SUPPORTED_ABIS.has(abi)) {
      throw new Error(`[mobile-profile] 不支持的 ABI: ${abi}（支持 ${[...SUPPORTED_ABIS].join(', ')}）`);
    }
  }
  if (!profile.plugins.includes('office-core')) {
    throw new Error('[mobile-profile] office-core 是应用基座，不能裁掉');
  }
  if (profile.keepSkins !== true || !profile.plugins.includes('skins')) {
    throw new Error('[mobile-profile] 当前产品口径要求随包提供皮肤库');
  }
  if (profile.keepOfflineTts !== true) {
    throw new Error('[mobile-profile] 当前产品口径要求随包提供离线 TTS');
  }
  return profile;
}

function resolveMobilePlugins(profile, catalog) {
  const entries = catalog?.plugins || {};
  const picked = new Set(profile.plugins);
  for (const id of picked) {
    if (!entries[id]) throw new Error(`[mobile-profile] 未知插件: ${id}`);
  }
  return Object.keys(entries).filter((id) => picked.has(id));
}

function assertMobileProfile({ profile, catalog, modesCatalog }) {
  const modes = modesCatalog?.modes || {};
  for (const mode of profile.modes) {
    if (!modes[mode]) throw new Error(`[mobile-profile] 未知模式: ${mode}`);
    const provider = profile.plugins.find((id) => catalog?.plugins?.[id]?.modeKey === mode);
    if (!provider) throw new Error(`[mobile-profile] 模式 ${mode} 缺少对应插件`);
  }

  for (const [id, entry] of Object.entries(catalog?.plugins || {})) {
    if (!entry?.modeKey || profile.modes.includes(entry.modeKey)) continue;
    if (profile.plugins.includes(id)) {
      throw new Error(`[mobile-profile] 桌面模式插件 ${id} 不应进入手机发行包`);
    }
  }

  resolutionAssertions(profile);
  return profile;
}

function resolutionAssertions(profile) {
  for (const id of ['git-explorer', 'cicd-pipeline', 'java-suite']) {
    if (profile.plugins.includes(id)) throw new Error(`[mobile-profile] ${id} 是桌面能力，不应进入手机包`);
  }
  if (!profile.plugins.includes('remote-control')) {
    throw new Error('[mobile-profile] 手机作为远程控制端，必须保留 remote-control 插件');
  }
}

function androidArtifactName(version, abi, profile = loadMobileProfile()) {
  return `${profile.artifactPrefix}-${version}-${abi}.apk`;
}

module.exports = {
  REPO_ROOT,
  PROFILE_PATH,
  SUPPORTED_ABIS,
  loadMobileProfile,
  resolveMobilePlugins,
  assertMobileProfile,
  androidArtifactName,
};
