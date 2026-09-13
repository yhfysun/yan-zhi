/**
 * 皮肤深色壁纸变体生成脚本
 * ------------------------------------------------------------------
 * 用途：为 apps/server/assets/plugin-assets/<skinId>/ 下的每套皮肤，
 *       从 wallpaper.webp（浅色）派生一张压暗降饱和的 wallpaper-dark.webp，
 *       供暗色主题使用（skins.ts 里 wallpaper.dark 指向它）。
 *       之前深浅色共用一张图，暗色下全靠黑色 scrim 硬压 —— 图像发灰、细节全糊。
 *
 * 用法：
 *   node scripts/build-skin-dark-variants.mjs              # 处理全部 skin-* 包
 *   node scripts/build-skin-dark-variants.mjs <skinId>...  # 只处理指定包
 *
 * 依赖：根目录 node_modules/sharp（仅构建期，运行时不需要）
 *
 * 参数说明：brightness 0.58 —— 深色模式下还有 patternScrim(≈0.35) 与壁纸遮罩叠加，
 * 最终亮度约 0.35~0.4，够暗且保留结构；saturation 0.72 防止暗色下色彩发闷。
 */
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const require = createRequire(`${ROOT}/package.json`);
const sharp = require('sharp');

const ASSETS_BASE = join(ROOT, 'apps', 'server', 'assets', 'plugin-assets');
const only = process.argv.slice(2);

const dirs = readdirSync(ASSETS_BASE, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('skin-'))
  .map((e) => e.name)
  .filter((d) => (only.length ? only.includes(d) : true));

let built = 0;
for (const dir of dirs) {
  const src = join(ASSETS_BASE, dir, 'wallpaper.webp');
  const out = join(ASSETS_BASE, dir, 'wallpaper-dark.webp');
  try {
    await sharp(src)
      .modulate({ brightness: 0.58, saturation: 0.72 })
      .webp({ quality: 80 })
      .toFile(out);
    built += 1;
    console.log(`OK ${dir}`);
  } catch (err) {
    console.error(`FAIL ${dir}: ${err?.message || err}`);
  }
}
console.log(`ALL DONE (${built}/${dirs.length})`);
