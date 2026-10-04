#!/usr/bin/env node
/**
 * package-desktop-lite.cjs — Lite 档桌面版打包入口（独立脚本，满足「每档一个脚本」）
 *
 * 实际打包逻辑集中在 scripts/package.cjs（EBUSY 备份 / 校验 / 清单等踩坑逻辑单点维护），
 * 本文件只做参数转发：等价于 `node scripts/package.cjs desktop:lite`。
 *
 * 常用透传参数：--dry-run（演练） / --no-verify（跳过产物校验） / --keep-tmp（保留临时备份）
 */
process.argv = [process.execPath, __filename, 'desktop:lite', ...process.argv.slice(2)];
require('./package.cjs');
