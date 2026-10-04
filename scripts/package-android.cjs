#!/usr/bin/env node
/**
 * package-android.cjs — Android APK 打包入口（独立脚本）
 *
 * 实际打包逻辑集中在 scripts/package.cjs（图标 → vite → mobile-server → cap sync →
 * gradle → APK 校验等踩坑逻辑单点维护），本文件只做参数转发：
 * 等价于 `node scripts/package.cjs android`。
 *
 * 常用透传参数：--dry-run（演练） / --no-verify（跳过产物校验）
 * 产物输出：dist-release/android/<版本>/app-debug.apk
 */
process.argv = [process.execPath, __filename, 'android', ...process.argv.slice(2)];
require('./package.cjs');
