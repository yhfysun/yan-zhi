#!/usr/bin/env node
/**
 * package-desktop-shell.cjs — 轻量壳（无后端）打包入口。
 *
 * 等价于 `node apps/desktop/scripts/build-shell.cjs`，透传参数：
 *   pnpm package:desktop:shell -- --server-url http://192.168.10.222:3001
 *   pnpm package:desktop:shell -- --skip-builder     # 只出前端 dist，不打包
 *
 * ★ 与 desktop:lite/basic/pro 的区别：壳包**不含后端**（不跑 server build / 插件暂存 /
 *   预置码签名），前端开箱直连 --server-url 指定的后端；所以不走 scripts/package.cjs 那套编排。
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'apps', 'desktop', 'scripts', 'build-shell.cjs');
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
