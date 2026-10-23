/**
 * 从本机 Chromium 系浏览器（Chrome / Edge）导入书签。
 *
 * 只读：解析 `<User Data>/<Profile>/Bookmarks`，不写任何文件、不改浏览器数据。
 * 这里只做「文件 → 归一化树」，id/持久化由渲染层的 browserBookmarks.ts 负责。
 * 放在主进程是因为渲染层拿不到 fs；纯函数部分（parseChromeBookmarks）可在单测里直接跑。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_DEPTH = 12;

const BROWSERS = [
  {
    id: 'chrome',
    name: 'Chrome',
    userDataDirs: {
      win32: ['Google', 'Chrome', 'User Data'],
      darwin: ['Library', 'Application Support', 'Google', 'Chrome'],
      linux: ['.config', 'google-chrome'],
    },
  },
  {
    id: 'edge',
    name: 'Edge',
    userDataDirs: {
      win32: ['Microsoft', 'Edge', 'User Data'],
      darwin: ['Library', 'Application Support', 'Microsoft Edge'],
      linux: ['.config', 'microsoft-edge'],
    },
  },
];

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

function convertNode(node, depth) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return null;
  const title = String(node.name ?? node.title ?? '').trim();
  const hasChildren = Array.isArray(node.children);
  if (node.type === 'url' || (!hasChildren && typeof node.url === 'string')) {
    if (!isHttpUrl(node.url)) return null;
    return { title, url: node.url.trim() };
  }
  if (!hasChildren) return null;
  const children = node.children.map((c) => convertNode(c, depth + 1)).filter(Boolean);
  return { title: title || '未命名文件夹', children };
}

function countUrls(nodes) {
  let n = 0;
  for (const node of nodes || []) {
    if (Array.isArray(node.children)) n += countUrls(node.children);
    else if (node.url) n += 1;
  }
  return n;
}

/**
 * 解析 Bookmarks 文件内容。
 * Chrome 的根节点固定挂在 roots.bookmark_bar / other / synced 下。
 */
function parseChromeBookmarks(text) {
  let json;
  try {
    json = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { roots: [], count: 0 };
  }
  const roots = json && json.roots && typeof json.roots === 'object' ? json.roots : null;
  if (!roots) return { roots: [], count: 0 };
  const out = [];
  for (const key of ['bookmark_bar', 'other', 'synced']) {
    const root = roots[key];
    if (!root || !Array.isArray(root.children)) continue;
    const children = root.children.map((c) => convertNode(c, 0)).filter(Boolean);
    if (!children.length) continue;
    out.push({ key, title: String(root.name || key).trim() || key, children });
  }
  const count = countUrls(out);
  return { roots: count ? out : [], count };
}

function userDataDir(browser, platform = process.platform, env = process.env, home = os.homedir()) {
  const segs = browser.userDataDirs[platform];
  if (!segs) return '';
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(base, ...segs);
  }
  return path.join(home, ...segs);
}

function readProfileName(profileDir, fallback) {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(profileDir, 'Preferences'), 'utf8'));
    const name = prefs && prefs.profile && prefs.profile.name;
    return typeof name === 'string' && name.trim() ? name.trim() : fallback;
  } catch {
    return fallback;
  }
}

const SKIP_PROFILES = new Set(['Guest Profile', 'System Profile', 'Snapshot']);

/** 扫描浏览器目录，返回 `{ profiles: [...], errors: [...] }`；单个 profile 读失败不影响其它。 */
function discoverChromeBookmarks(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const profiles = [];
  const errors = [];
  for (const browser of BROWSERS) {
    const base = userDataDir(browser, platform, env, home);
    if (!base) continue;
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue; // 未安装该浏览器
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_PROFILES.has(entry.name)) continue;
      const profileDir = path.join(base, entry.name);
      const file = path.join(profileDir, 'Bookmarks');
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue; // 不是 profile 目录
      }
      const parsed = parseChromeBookmarks(text);
      if (!parsed.count) continue;
      profiles.push({
        browser: browser.id,
        browserName: browser.name,
        profile: entry.name,
        profileName: readProfileName(profileDir, entry.name),
        path: file,
        count: parsed.count,
        roots: parsed.roots,
      });
    }
  }
  return { profiles, errors };
}

module.exports = {
  BROWSERS,
  parseChromeBookmarks,
  discoverChromeBookmarks,
  convertNode,
  countUrls,
  userDataDir,
};
