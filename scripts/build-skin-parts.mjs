/**
 * 皮肤部件图重生成脚本（2026-09-13 用户反馈"输入框和侧栏很亮很白，只能模糊看到图片"）
 * ------------------------------------------------------------------
 * 背景：此前 27 套皮肤的部件图（task-list-bg / input-bg / button-bg / dialog-bg）
 * 是「整张壁纸 + 重白化」的产物 —— 实测平均亮度 226+、对比度极低，
 * 铺到侧栏/输入框上就是一片白，用户评价"很亮很白，只能模糊看到图片"。
 *
 * 现在改为：从壁纸**裁切局部取景**（各部位取不同的画面区域），保留原图饱和度与对比度，
 * 不做任何白化；同时为暗色主题派生一份暗色变体（* -dark.webp）。
 *
 * 产物（每套皮肤包内）：
 *   task-list-bg.webp / task-list-bg-dark.webp   侧栏列表（竖向大图，取左/中景）
 *   input-bg.webp     / input-bg-dark.webp       输入框（横向条带，取上部天空/远景）
 *   button-bg.webp    / button-bg-dark.webp      按钮（小方块，取有细节的一角）
 *   dialog-bg.webp    / dialog-bg-dark.webp      弹窗/菜单/代码模式（大面积中部取景）
 *
 * 用法：node scripts/build-skin-parts.mjs [--only <skinId>]
 * 依赖：根目录 node_modules/sharp
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const require = createRequire(`${ROOT}/package.json`);
const sharp = require('sharp');

const ASSETS = join(ROOT, 'apps', 'server', 'assets', 'plugin-assets');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? process.argv[onlyArg + 1] : null;

/**
 * 部件取景 —— 【2026-09-13 用户明确要求："输入框应该是一张整图，不要 4 张不同的图"】
 *
 * 前几版做法与本版对比：
 *   · 最初：整张壁纸重白化 → 一片白，"很亮很白，只能模糊看到图片"
 *   · 中间：按部位裁不同区域出 4 张不同的图 → 各部位图案对不上，观感碎
 *   · 现在：**所有部位共用同一张整图**（壁纸原图等比缩放），只按各部位需要的
 *     尺寸输出，铺到界面上由 CSS 的 cover 统一裁切 —— 即"一张大图"直接复用。
 *
 * 尺寸选择原则：给足像素（CSS cover 只放大不缩小观感最好），且不改变宽高比
 * （等比缩放，不拉伸、不挤压）。
 */
const PARTS = [
  // 侧栏列表：竖向容器 → 输出竖版整图
  { file: 'task-list-bg', size: [640, 960], q: 82 },
  // 输入框：横向容器 → 输出横版整图（同一张，转横版比例，不做夸张的细长条）
  { file: 'input-bg', size: [960, 640], q: 84 },
  // 按钮：小尺寸容器 → 输出方形整图
  { file: 'button-bg', size: [320, 320], q: 84 },
  // 弹窗/菜单/代码模式：大面积 → 输出接近原比例的整图
  { file: 'dialog-bg', size: [960, 640], q: 82 },
];

/**
 * 卡片变体取景（2026-09-13 用户反馈："卡片样式可以设置多点啊，然后随机多好。。。"）
 * ------------------------------------------------------------------------------
 * 需求：同一类卡片（会话行 / 空间条目 / 任务行 / 玻璃卡片 / 消息卡片）不要长得一模一样，
 * 要有**多套样式**并**随机**分配，形成错落的"卡片墙"观感。
 *
 * 做法：从**同一张壁纸的 4 个不同区域**取景（不同方位 + 不同缩放），
 * 每套皮肤产出 card-1~4-bg.webp 共 4 张卡片底图。
 *   · 取景方位错开（左中 / 右上 / 右下 / 中左下）→ 每张卡片露出壁纸的不同局部
 *   · 缩放不同（1.0 / 1.35 / 1.8 / 1.15）→ 纹理疏密不同，进一步拉开差异
 *   · 尺寸统一 480×320（卡片相对容器小、像素密度够即可）
 * CSS 侧按 nth-child 循环取图，天然就是"随机感"（且稳定可复现，不用 JS 记状态）。
 */
const CARD_VARIANTS = [
  // [left%, top%, zoom]  —— extract 的 left/top 是像素，下面按壁纸实际尺寸换算
  { file: 'card-1-bg', left: 0.00, top: 0.10, zoom: 1.0 },
  { file: 'card-2-bg', left: 0.55, top: 0.00, zoom: 1.35 },
  { file: 'card-3-bg', left: 0.45, top: 0.50, zoom: 1.8 },
  { file: 'card-4-bg', left: 0.12, top: 0.42, zoom: 1.15 },
];
/** 卡片图输出尺寸（横版小卡） */
const CARD_SIZE = [480, 320];

/** 暗色变体参数：压暗 + 略降饱和，保证暗色主题下文字（浅色）可读 */
const DARK_VARIANT = { brightness: 0.62, saturation: 0.85 };

/** 整图等比缩放（不裁切，保持完整画面；cover 的裁切交给 CSS 按容器做） */
async function partFromBase(baseBuf, size, q) {
  return sharp(baseBuf)
    .resize(size[0], size[1], { fit: 'cover' })
    .webp({ quality: q })
    .toBuffer();
}

/**
 * 卡片变体：从壁纸的指定区域**取景裁切**后缩放。
 * left/top 是 0~1 的相对比例（相对"先按 zoom 放大后的图"）；
 * zoom 越大 = 取景窗口越小 = 局部被放得越大、纹理越疏。
 */
async function cardFromBase(baseBuf, variant) {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width ?? 1280;
  const H = meta.height ?? 720;
  // 放大后再取窗口：窗口尺寸 = 原图 / zoom
  const winW = Math.max(64, Math.round(W / variant.zoom));
  const winH = Math.max(64, Math.round(H / variant.zoom));
  // 相对比例 × 放大后的可用范围，保证窗口不越界
  const left = Math.min(Math.max(0, variant.left), 1) * Math.max(0, W - winW);
  const top = Math.min(Math.max(0, variant.top), 1) * Math.max(0, H - winH);
  return sharp(baseBuf)
    .extract({
      left: Math.round(left),
      top: Math.round(top),
      width: winW,
      height: winH,
    })
    .resize(CARD_SIZE[0], CARD_SIZE[1], { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
}

async function build(skinDir) {
  const skinId = skinDir.split(/[\\/]/).pop();
  const wpLight = join(skinDir, 'wallpaper.webp');
  if (!existsSync(wpLight)) {
    console.log(`SKIP ${skinId}: 无 wallpaper.webp`);
    return false;
  }
  // 暗色壁纸优先用已有的 wallpaper-dark.webp，缺失则由浅色派生（与 build-skin-dark-variants 一致）
  const wpDarkPath = join(skinDir, 'wallpaper-dark.webp');
  let darkBaseBuf;
  if (existsSync(wpDarkPath)) {
    darkBaseBuf = await sharp(wpDarkPath).png().toBuffer();
  } else {
    darkBaseBuf = await sharp(wpLight)
      .modulate({ brightness: DARK_VARIANT.brightness, saturation: DARK_VARIANT.saturation })
      .png()
      .toBuffer();
  }
  const lightBaseBuf = await sharp(wpLight).png().toBuffer();

  for (const p of PARTS) {
    // 浅色版：壁纸原图等比缩放（不做任何提亮/压暗，保持画面完整）
    const light = await partFromBase(lightBaseBuf, p.size, p.q);
    await sharp(light).toFile(join(skinDir, `${p.file}.webp`));
    // 暗色版：同一张壁纸的暗色变体等比缩放
    const dark = await partFromBase(darkBaseBuf, p.size, p.q);
    await sharp(dark).toFile(join(skinDir, `${p.file}-dark.webp`));
  }
  // 卡片变体：4 张不同取景（浅/暗各一套）
  for (const cv of CARD_VARIANTS) {
    const light = await cardFromBase(lightBaseBuf, cv);
    await sharp(light).toFile(join(skinDir, `${cv.file}.webp`));
    const dark = await cardFromBase(darkBaseBuf, cv);
    await sharp(dark).toFile(join(skinDir, `${cv.file}-dark.webp`));
  }
  console.log(`OK ${skinId}`);
  return true;
}

const dirs = readdirSync(ASSETS)
  .filter((d) => d.startsWith('skin-'))
  .map((d) => join(ASSETS, d))
  .filter((d) => statSync(d).isDirectory())
  .filter((d) => !ONLY || d.endsWith(ONLY));

let n = 0;
for (const d of dirs) {
  if (await build(d)) n += 1;
}
console.log(`ALL DONE (${n}/${dirs.length})`);
