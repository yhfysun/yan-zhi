#!/usr/bin/env node
/**
 * 构建轻量壳本机能力运行时。
 *
 * 直接复用服务端 remote-control 插件的配对/会话/输入逻辑，只把插件宿主依赖替换成
 * 桌面端最小实现。产物是单文件 CJS，随轻量壳进入 app.asar；壳运行时不需要携带
 * 完整 server/dist、数据库或 license 服务。
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const DESKTOP = path.resolve(__dirname, '..');
const ENTRY = path.join(DESKTOP, 'local-capabilities.entry.mjs');
const DEFAULT_OUTFILE = path.join(DESKTOP, 'local-capabilities.bundle.cjs');

const CORE_SHIM = `
let state = 'enabled';
export function getPluginManager() {
  return {
    get() { return { state }; },
    async disable() { state = 'disabled'; },
  };
}
`;

const HOST_BRIDGE_SHIM = `
import path from 'node:path';

export async function pushPluginAudit(storage, entry, cap = 200) {
  const list = (await storage.get('audit')) || [];
  list.unshift(entry);
  await storage.set('audit', list.slice(0, cap));
}

export function isWithinRoot(child, root) {
  const rel = path.relative(path.resolve(root), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export const serverState = { workspaceDir: '' };
export const db = {
  prepare() {
    return { get() { return undefined; }, all() { return []; }, run() { return { changes: 0 }; } };
  },
};
`;

const DESKTOP_CAPABILITY_NOOP = `
export function desktopCapabilityAvailable() { return false; }
export async function callDesktopCapability() {
  throw new Error('本机运行时不能递归调用桌面能力桥');
}
`;

function hostShimPlugin() {
  return {
    name: 'yz-local-capabilities-host-shims',
    setup(build) {
      build.onResolve({ filter: /^@yan-zhi\/core$/ }, () => ({
        path: 'yz-core',
        namespace: 'yz-local-shim',
      }));
      build.onResolve({ filter: /(^|[/\\\\])host-bridge\.js$/ }, (args) => {
        if (!args.importer.includes(`${path.sep}server${path.sep}src${path.sep}plugins${path.sep}`)) {
          return undefined;
        }
        return { path: 'yz-host-bridge', namespace: 'yz-local-shim' };
      });
      build.onResolve({ filter: /^\.\/desktop-capability\.js$/ }, (args) => {
        if (!args.importer.endsWith(`${path.sep}computer-use.ts`)) return undefined;
        return { path: 'yz-desktop-capability-noop', namespace: 'yz-local-shim' };
      });
      build.onLoad({ filter: /.*/, namespace: 'yz-local-shim' }, (args) => {
        const contents = args.path === 'yz-core'
          ? CORE_SHIM
          : args.path === 'yz-desktop-capability-noop'
            ? DESKTOP_CAPABILITY_NOOP
            : HOST_BRIDGE_SHIM;
        return { contents, loader: 'js', resolveDir: DESKTOP };
      });
    },
  };
}

async function buildLocalCapabilities(options = {}) {
  const outfile = path.resolve(options.outfile || DEFAULT_OUTFILE);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    plugins: [hostShimPlugin()],
  });
  return outfile;
}

module.exports = { buildLocalCapabilities, DEFAULT_OUTFILE };

if (require.main === module) {
  buildLocalCapabilities()
    .then((outfile) => console.log(`[local-capabilities] 已构建: ${outfile}`))
    .catch((err) => {
      console.error('[local-capabilities] 构建失败:', err);
      process.exit(1);
    });
}
