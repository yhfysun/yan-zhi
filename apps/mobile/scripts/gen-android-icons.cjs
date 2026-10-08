/**
 * 生成 Android 应用图标（从言智 logo）。
 *
 * ★★★ 为什么需要这个脚本（2026-09-22 用户反馈「打包后的应用图标不对」）：
 *
 *   项目里**从来没有**任何图标生成脚本 —— `apps/mobile/android/.../res/mipmap-*`
 *   一直是 Capacitor 脚手架默认产物：
 *     · 位图（09-05 用旧的蓝色大脑图生成过一次，之后言智 logo 换成书法「言」字，
 *       但没人重新生成）；
 *   · `mipmap-anydpi-v26` 下的 ic_launcher 与 ic_launcher_round 描述文件，
 *     以及 `drawable` / `drawable-v24` 下的前景背景 vector
 *     还是 2025-03-31 的脚手架默认（青绿底 `#26A69A` + 默认 vector 前景）。
 *   结果 APK 装上后是"蓝色大脑 + 青绿底"，与 `assets/icons/icon.png`（言智「言」字 logo）
 *   完全不是一回事。
 *
 * ★ 与 @capacitor/assets 的关系：官方工具能做这事，但它不在本仓依赖里（离线装不上）。
 *   本项目用 `sharp`（已在依赖树里：sharp@0.35.4）自己生成，规则与官方一致：
 *     · legacy 位图 ic_launcher.png / ic_launcher_round.png：
 *       mdpi 48 / hdpi 72 / xhdpi 96 / xxhdpi 144 / xxxhdpi 192
 *     · adaptive icon 前景层 ic_launcher_foreground.png：108dp 画布，
 *       内容占中间 **66dp 安全区**（Android 会按 72dp 裁切并做视差），
 *       所以源图要缩到 **约 61%** 再居中，四周留透明。
 *     · 背景：用纯色（品牌色）—— `values/ic_launcher_background.xml`
 *     · `monochrome`（Android 13+ 主题图标）也指向同一前景层。
 *
 * 用法：
 *   node apps/mobile/scripts/gen-android-icons.cjs
 *   node apps/mobile/scripts/gen-android-icons.cjs --source assets/icons/icon.png
 */
const fs = require('fs');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(MOBILE_DIR, '..', '..');
const RES_DIR = path.join(MOBILE_DIR, 'android', 'app', 'src', 'main', 'res');

/** 源图：言智 logo（1024×1024 RGBA，米白底 + 黑「言」字） */
const DEFAULT_SOURCE = path.join(REPO_ROOT, 'assets', 'icons', 'icon.png');

/** legacy 启动图标尺寸（Android 官方 mipmap 密度表） */
const LEGACY_SIZES = {
  mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
};
/** adaptive icon 前景层尺寸（108dp 画布） */
const ADAPTIVE_SIZES = {
  mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432,
};
/**
 * adaptive 前景里 logo 占画布的比例。
 * Android 只保证中间 66/108 ≈ 61% 不被裁切；留一点余量取 0.60，
 * 避免「言」字的书法笔画尖角被圆角遮罩切掉。
 */
const ADAPTIVE_CONTENT_RATIO = 0.60;

/** 品牌背景色（与 logo 的米白底一致，保证圆角裁剪处颜色连续） */
const BRAND_BG = '#F5F2EC';

function resolveSharp() {
  // sharp 在 pnpm 虚拟 store 里，不能直接 require('sharp')。
  const base = path.join(REPO_ROOT, 'node_modules', '.pnpm');
  let dirs = [];
  try {
    dirs = fs.readdirSync(base).filter((d) => /^sharp@/.test(d));
  } catch {
    /* .pnpm 不可读 → 走下面统一报错 */
  }
  for (const d of dirs) {
    const p = path.join(base, d, 'node_modules', 'sharp');
    if (fs.existsSync(path.join(p, 'package.json'))) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(p);
      // ★ sharp 是「带平台二进制的包」：装不全时 require 能过、**首次调用才抛**
      //   （`Could not load the "sharp" module using the ... runtime`）。
      //   在校验阶段把这个问题提前，报错直接指向处置办法。
      if (typeof mod !== 'function' && typeof mod?.default !== 'function') {
        throw new Error('[icons] sharp 已装但不可用（缺平台二进制）。处置：重装根依赖 pnpm install sharp');
      }
      return mod;
    }
  }
  throw new Error(
    '[icons] 未找到 sharp（本项目用 pnpm，sharp 在 node_modules/.pnpm/sharp@*/node_modules/sharp）。\n' +
      '         处置：在仓库根执行 pnpm install（sharp 是根 package.json 的 dependencies）。',
  );
}

/** 圆形遮罩用 SVG（legacy round 图标） */
function circleMaskSvg(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
}

(async () => {
  const argv = process.argv.slice(2);
  const srcIdx = argv.indexOf('--source');
  const source = srcIdx >= 0 ? path.resolve(argv[srcIdx + 1]) : DEFAULT_SOURCE;

  // ★ 目标 res/ 目录在 Android 工程内（apps/mobile/android/…），而该目录被 gitignore，
  //   干净 checkout 下不存在 —— 此时没东西可画，**跳过而不是失败**，
  //   免得在 CI / 新克隆环境把整条打包链拦死。缺图标的补法见文件末尾提示。
  if (!fs.existsSync(RES_DIR)) {
    console.log('[icons] 未找到 Android res/ 目录，跳过（属正常：工程尚未 cap add）');
    console.log('[icons]   生成工程: npx cap add android（随后重跑本脚本即可补图标）');
    return;
  }

  if (!fs.existsSync(source)) {
    console.error('[icons] 源图不存在:', source);
    process.exit(1);
  }
  // ★ 本地跑（无 android 工程）根本用不到 sharp —— 官方 sharp 是带原生二进制的可选依赖，
  //   受限网络下 pnpm install 很可能只装了骨架。所以「先判 res/ 存在，再解析 sharp」：
  //   有工程（真打包）时才要求 sharp，缺了就给出可操作的提示。
  const sharp = resolveSharp();
  const meta = await sharp(source).metadata();
  console.log(`[icons] 源图 ${path.relative(REPO_ROOT, source)} → ${meta.width}x${meta.height} ${meta.channels}ch`);
  if (!meta.width || meta.width < 512) {
    console.error('[icons] 源图边长建议 >= 512，否则高档密度会糊');
  }

  let written = 0;
  const write = (p, buf) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); written++; };

  // ---------- 1. legacy 位图（方形 + 圆形） ----------
  for (const [dens, size] of Object.entries(LEGACY_SIZES)) {
    const dir = path.join(RES_DIR, `mipmap-${dens}`);
    // 方形：直接缩放到目标尺寸
    const square = await sharp(source)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    write(path.join(dir, 'ic_launcher.png'), square);

    // 圆形：缩放后用圆形遮罩裁切（legacy round 图标）
    const base = await sharp(source)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .ensureAlpha()
      .png()
      .toBuffer();
    const round = await sharp(base)
      .composite([{ input: circleMaskSvg(size), blend: 'dest-in' }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    write(path.join(dir, 'ic_launcher_round.png'), round);

    // adaptive 前景层：108dp 画布，内容缩到 ADAPTIVE_CONTENT_RATIO 居中，四周透明
    const canvas = ADAPTIVE_SIZES[dens];
    const inner = Math.round(canvas * ADAPTIVE_CONTENT_RATIO);
    const fgInner = await sharp(source)
      .resize(inner, inner, { fit: 'cover', position: 'centre' })
      .ensureAlpha()
      .png()
      .toBuffer();
    const offset = Math.round((canvas - inner) / 2);
    const foreground = await sharp({
      create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: fgInner, top: offset, left: offset }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    write(path.join(dir, 'ic_launcher_foreground.png'), foreground);
  }

  // ---------- 2. adaptive icon 描述（anydpi-v26） ----------
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <!-- Android 13+ 主题图标（Monet）：直接复用前景层 -->
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  write(path.join(RES_DIR, 'mipmap-anydpi-v26', 'ic_launcher.xml'), Buffer.from(adaptiveXml, 'utf8'));
  write(path.join(RES_DIR, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), Buffer.from(adaptiveXml, 'utf8'));

  // ---------- 3. 背景色 ----------
  // ★ 覆盖脚手架默认的 #000000 / 青绿 #26A69A，与 logo 米白底一致。
  const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 言智 logo 底色（米白）。adaptive icon 的 background 层。 -->
    <color name="ic_launcher_background">${BRAND_BG}</color>
</resources>
`;
  write(path.join(RES_DIR, 'values', 'ic_launcher_background.xml'), Buffer.from(bgXml, 'utf8'));

  // ---------- 4. 清掉会"盖住"位图的脚手架 XML ----------
  // ★ 关键：`drawable/ic_launcher_background.xml`（青绿 vector）与
  //   `drawable-v24/ic_launcher_foreground.xml`（默认 vector 前景）是脚手架的，
  //   若留着，某些密度/API 组合下仍可能被优先解析。删掉，只保留位图 + 颜色背景。
  const removals = [
    path.join(RES_DIR, 'drawable', 'ic_launcher_background.xml'),
    path.join(RES_DIR, 'drawable-v24', 'ic_launcher_foreground.xml'),
  ];
  for (const f of removals) {
    if (fs.existsSync(f)) { fs.rmSync(f); console.log('[icons] 已移除脚手架默认:', path.relative(REPO_ROOT, f)); }
  }
  if (fs.existsSync(path.join(RES_DIR, 'drawable-v24')) && fs.readdirSync(path.join(RES_DIR, 'drawable-v24')).length === 0) {
    fs.rmdirSync(path.join(RES_DIR, 'drawable-v24'));
    console.log('[icons] 已移除空目录 drawable-v24');
  }

  console.log(`[icons] 完成：写入 ${written} 个文件（5 密度 × 3 种 + 2 个 XML + 1 个颜色）`);
  console.log('[icons] 背景色 ' + BRAND_BG + ' | adaptive 内容占比 ' + (ADAPTIVE_CONTENT_RATIO * 100) + '%');
  console.log('[icons] 下一步：重新 cap sync + gradlew assembleDebug，应用图标才会更新');
})().catch((e) => { console.error('[icons] 失败:', e && e.message || e); process.exit(1); });