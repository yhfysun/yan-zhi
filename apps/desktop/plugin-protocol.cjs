/**
 * yz:// 协议目标解析（纯函数，无 electron 依赖，有单测）。
 *
 * main.cjs 用它服务插件前端 bundle 装载（mode-pluginization）：
 *   yz://shared/<file>.mjs                     → apps/desktop/host-shims/（构建期生成的共享依赖 shim）
 *   yz://plugin/<id>/<path>                    → 插件目录（内置 → 已安装，dev/打包双布局）
 *
 * 与 instance.cjs / url-guard.cjs 同类：main.cjs require 本模块，漏登记进
 * electron-builder files = 打包版启动即崩（由 packaged-entry-modules.test.cjs 守门）。
 */
const path = require('path');
const fs = require('fs');

const YZ_SCHEME_PRIVILEGES = {
  scheme: 'yz',
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
};

const MIME = {
  // ★ .html 必须在表里：缺了就回落 application/octet-stream，Chromium 把插件窗口页
  //   当"下载"处理，loadURL 直接 ERR_FAILED(-2)（2026-10-29 插件桌面窗口实测）。
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** 插件 id 白名单（与 PluginManifest id 同规则）：防路径穿越的第一道闸 */
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]*$/;

/**
 * 解析插件目录候选（按序探测）。dev 与打包布局不同：
 *  · dev      builtin: apps/server/plugins/builtin     installed: apps/server/plugins/installed
 *  · 打包     builtin: resources/server/dist/plugins/builtin
 *             installed: resources/server/dist/apps/plugins/installed（与服务端 PLUGINS_DIR 一致）
 */
function pluginDirCandidates({ mainDir, resourcesPath, isPackaged }) {
  const serverRoot = isPackaged
    ? path.join(resourcesPath, 'server', 'dist')
    : path.join(mainDir, '..', 'server');
  return isPackaged
    ? {
        builtin: path.join(serverRoot, 'plugins', 'builtin'),
        installed: path.join(serverRoot, 'apps', 'plugins', 'installed'),
      }
    : {
        builtin: path.join(serverRoot, 'plugins', 'builtin'),
        installed: path.join(serverRoot, 'plugins', 'installed'),
      };
}

/**
 * 解析 yz:// 请求到磁盘文件。
 * @returns {{ok:true, filePath:string, mime:string} | {ok:false, status:number}}
 */
function resolveYzTarget(rawUrl, ctx) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400 };
  }
  if (u.protocol !== 'yz:') return { ok: false, status: 400 };

  if (u.host === 'shared') {
    const rel = safeJoin(ctx.shimsDir, u.pathname);
    if (!rel || !fs.existsSync(rel)) return { ok: false, status: 404 };
    return { ok: true, filePath: rel, mime: mimeOf(rel) };
  }
  if (u.host === 'plugin') {
    // pathname 形如 /<id>/<rest...>
    const seg = decodeURIComponent(u.pathname).replace(/^\/+/, '').split('/');
    const id = seg.shift();
    if (!id || !PLUGIN_ID_RE.test(id)) return { ok: false, status: 400 };
    const rest = seg.join('/');
    if (!rest) return { ok: false, status: 404 };
    const roots = ctx.pluginRoots || pluginDirCandidates(ctx);
    // 内置优先、已安装兜底（同名时内置为随包基线）；文件不存在才轮询下一个根
    for (const root of [roots.builtin, roots.installed]) {
      const p = safeJoin(path.join(root, id), rest);
      if (p && fs.existsSync(p)) return { ok: true, filePath: p, mime: mimeOf(p) };
    }
    return { ok: false, status: 404 };
  }
  return { ok: false, status: 404 };
}

/** 在 root 内拼接子路径：越界（../ 穿越 / 绝对路径注入）一律返回 null */
function safeJoin(root, sub) {
  if (!sub) return null;
  const clean = sub.replace(/^\/+/, '');
  if (path.isAbsolute(clean)) return null;
  const resolved = path.normalize(path.join(root, clean));
  const normalizedRoot = path.normalize(root + path.sep);
  if (!resolved.startsWith(normalizedRoot)) return null;
  return resolved;
}

function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

module.exports = { YZ_SCHEME_PRIVILEGES, pluginDirCandidates, resolveYzTarget, safeJoin, mimeOf, PLUGIN_ID_RE };
