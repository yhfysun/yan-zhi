/**
 * 真图样例皮肤资源构建脚本
 * ------------------------------------------------------------------
 * 用途：把一张壁纸原图加工成一套完整皮肤包资源（同一系列、各部位取景不同）：
 *   wallpaper.webp      主壁纸
 *   dialog-bg.webp      弹窗 / 菜单 / 代码模式底图
 *   task-list-bg.webp   列表底图 / 浏览器外壳底图
 *   input-bg.webp       输入框底图
 *   button-bg.webp      按钮底图
 *
 * 用法：
 *   node scripts/build-skin-samples.mjs                     # 用 dev/skin_samples_raw 下的原图，按文件名关键字匹配皮肤包
 *   node scripts/build-skin-samples.mjs <源图目录>          # 指定源图目录
 *
 * 依赖：根目录 node_modules/sharp（仅构建期，运行时不需要）
 * 产物：apps/server/assets/plugin-assets/<skinId>/（与 skins.ts 的 SKIN_MANIFESTS 一一对应）
 *
 * 坑备忘：sharp().clone() 不继承已排队的操作 —— 必须先 .png().toBuffer() 物化，
 * 再用 buffer 重建 sharp 实例，否则 extract 会按原图尺寸取景（bad extract area）。
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const require = createRequire(`${ROOT}/package.json`);
const sharp = require('sharp');

const SRC_DIR = process.argv[2] || join(ROOT, 'dev', 'skin_samples_raw');
const OUT_BASE = join(ROOT, 'apps', 'server', 'assets', 'plugin-assets');

/** 源图文件名关键字 → 皮肤包 id（新增样例皮肤时在此补一行即可） */
const MAPPING = [
  // 2026-09-13 重生成批次：dev/skin_regenerated/<skinId>.source.png（ImageGen 出图，部分带右下角水印，靠裁底去掉）。
  // key 带 .source 后缀且必须排在旧关键字前面——旧 key 'aurora' 是 'aurora.source' 的子串，顺序反了会误匹配。
  { key: 'ink-mono.source', skinId: 'skin-ink-mono' },
  { key: 'mountain-dawn.source', skinId: 'skin-mountain-dawn' },
  { key: 'aurora.source', skinId: 'skin-aurora' },
  { key: 'grand-line.source', skinId: 'skin-grand-line' },
  { key: 'ninja-village.source', skinId: 'skin-ninja-village' },
  { key: 'landscape', skinId: 'skin-sample-dawn' },
  { key: 'anime', skinId: 'skin-sample-sakura' },
  { key: 'ink_wash', skinId: 'skin-sample-ink' },
  { key: 'aurora', skinId: 'skin-sample-aurora' },
];

/** 部件取景区域（基于归一化到 1600×1067 后的壁纸） */
const PARTS = [
  { file: 'dialog-bg.webp', box: { left: 700, top: 120, width: 900, height: 620 }, size: [760, 520], q: 80 },
  { file: 'task-list-bg.webp', box: { left: 60, top: 380, width: 700, height: 500 }, size: [420, 300], q: 78 },
  { file: 'input-bg.webp', box: { left: 200, top: 60, width: 1200, height: 260 }, size: [320, 72], q: 82 },
  { file: 'button-bg.webp', box: { left: 400, top: 700, width: 900, height: 240 }, size: [180, 44], q: 82 },
];

async function build(srcPath, skinId) {
  const outDir = join(OUT_BASE, skinId);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  // 源图右下角带「AI生成 WORKBUDDY」水印（约占底部 10%）——先裁掉再归一化，
  // 否则主壁纸会把水印原样带进皮肤包（部件取景避开角落所以不受影响）。
  const meta = await sharp(srcPath).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW < 400 || srcH < 400) throw new Error(`源图尺寸异常 ${srcW}x${srcH}: ${srcPath}`);
  const cropH = Math.round(srcH * 0.1);
  const croppedBuf = await sharp(srcPath)
    .extract({ left: 0, top: 0, width: srcW, height: srcH - cropH })
    .png()
    .toBuffer();
  const baseBuf = await sharp(croppedBuf).resize(1600, 1067, { fit: 'cover' }).png().toBuffer();
  const base = sharp(baseBuf);
  await base.clone().webp({ quality: 82 }).toFile(join(outDir, 'wallpaper.webp'));
  for (const p of PARTS) {
    await base.clone().extract(p.box).resize(p.size[0], p.size[1], { fit: 'cover' }).webp({ quality: p.q }).toFile(join(outDir, p.file));
  }
  console.log(`OK ${skinId}`);
}

if (!existsSync(SRC_DIR)) {
  console.error(`源图目录不存在：${SRC_DIR}`);
  process.exit(1);
}
const files = readdirSync(SRC_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) {
  console.error('源图目录中没有图片');
  process.exit(1);
}
let built = 0;
for (const f of files) {
  const lower = f.toLowerCase();
  const hit = MAPPING.find((m) => lower.includes(m.key));
  if (!hit) { console.log(`SKIP 未映射 ${f}`); continue; }
  await build(join(SRC_DIR, f), hit.skinId);
  built += 1;
}
console.log(`ALL DONE (${built}/${files.length})`);
