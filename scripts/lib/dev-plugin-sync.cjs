/**
 * Dev 内置插件产物新鲜度检查。
 *
 * 背景：内置插件运行时优先加载 `apps/server/plugins/builtin/<id>/backend/index.js`。
 * 只改 `apps/server/src/plugins/*` 而不重建插件包时，dev 会继续跑旧提示词/旧工具，
 * 源码和实际行为静默分叉。这里只负责判断“源码是否比产物新”，构建由调用方执行。
 */
const fsDefault = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FINGERPRINT_FILE = '.yz-source-hash';

function latestMtimeMs(target, fs = fsDefault) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (stat.isFile()) return stat.mtimeMs;
  if (!stat.isDirectory()) return 0;

  let latest = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return latest;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    latest = Math.max(latest, latestMtimeMs(path.join(target, entry.name), fs));
  }
  return latest;
}

function sourceTargets(root, id, backendEntry) {
  const targets = [];
  if (typeof backendEntry === 'string' && backendEntry.trim()) {
    const entry = path.resolve(root, backendEntry);
    targets.push(entry);
    targets.push(path.join(path.dirname(entry), path.basename(entry, path.extname(entry))));
  }
  targets.push(path.join(root, 'apps', 'server', 'src', 'plugins', id));
  targets.push(path.join(root, 'apps', 'server', 'src', 'plugins', `${id}.ts`));
  return [...new Set(targets)];
}

function collectSourceFiles(target, fs = fsDefault, out = []) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return out;
  }
  if (stat.isFile()) {
    out.push(target);
    return out;
  }
  if (!stat.isDirectory()) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    collectSourceFiles(path.join(target, entry.name), fs, out);
  }
  return out;
}

function hashPluginSource({ root, id, backendEntry, fs = fsDefault }) {
  const files = [...new Set(
    sourceTargets(root, id, backendEntry)
      .flatMap((target) => collectSourceFiles(target, fs))
      .map((file) => path.resolve(file)),
  )].sort((a, b) => a.localeCompare(b));
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    try {
      hash.update(fs.readFileSync(file));
    } catch {
      hash.update('<missing>');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

function writePluginFingerprint({ root, id, backendEntry, artifactDir, fs = fsDefault }) {
  const fingerprint = hashPluginSource({ root, id, backendEntry, fs });
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, FINGERPRINT_FILE), fingerprint, 'utf8');
  return fingerprint;
}

function isPluginArtifactStale({ root, id, backendEntry, artifactDir, fs = fsDefault }) {
  const artifact = path.join(artifactDir, 'backend', 'index.js');
  const artifactMtime = latestMtimeMs(artifact, fs);
  if (!artifactMtime) return true;
  let recordedFingerprint = '';
  try {
    recordedFingerprint = fs.readFileSync(path.join(artifactDir, FINGERPRINT_FILE), 'utf8').trim();
  } catch { /* 旧产物没有标记，回退 mtime */ }
  if (recordedFingerprint) {
    return hashPluginSource({ root, id, backendEntry, fs }) !== recordedFingerprint;
  }
  const sourceMtime = Math.max(
    0,
    ...sourceTargets(root, id, backendEntry).map((target) => latestMtimeMs(target, fs)),
  );
  return sourceMtime > artifactMtime;
}

function findStaleBuiltinPlugins({ root, builtinDir, catalog, fs = fsDefault }) {
  let entries = [];
  try {
    entries = fs.readdirSync(builtinDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const stale = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const artifactDir = path.join(builtinDir, entry.name);
    if (!fs.existsSync(path.join(artifactDir, 'manifest.json'))) continue;
    const def = catalog?.plugins?.[entry.name];
    if (!def?.backendEntry) continue;
    if (isPluginArtifactStale({
      root,
      id: entry.name,
      backendEntry: def.backendEntry,
      artifactDir,
      fs,
    })) {
      stale.push(entry.name);
    }
  }
  return stale.sort();
}

module.exports = {
  FINGERPRINT_FILE,
  findStaleBuiltinPlugins,
  hashPluginSource,
  isPluginArtifactStale,
  latestMtimeMs,
  sourceTargets,
  writePluginFingerprint,
};
