#!/usr/bin/env node
/**
 * 把「内置离线 TTS（sherpa-onnx）」幂等铺进 Android 工程（2026-11-16）。
 *
 * ★ 背景：一加等国产 ROM 整机无 TTS 引擎（tts_default_synth=null，真机实锤），
 *   系统 TextToSpeech 必死；用户拍板「APK 打包自带一个引擎，能发音就行」。
 *   sherpa-onnx 1.10.35 AAR（jni .so + Kotlin API）+ piper en_US-amy-medium int8
 *   英语模型（~35MB assets）随包内置，系统引擎失败时由 TtsPlugin.java 兜底。
 *
 * ★ 真相源 native/android-sherpa/（libs/*.aar + assets/sherpa-en/）：
 *   二进制不入库，由 scripts/fetch-sherpa.cjs 从国内源（npmmirror 等）下载缓存。
 *   本脚本只做铺设：复制 AAR / 模型 assets / patch build.gradle。
 *   真相源缺失时直接失败，避免打出一个「编译得过但永远无声」的 APK。
 *
 * 用法：node scripts/apply-native-sherpa.cjs（幂等，重复执行不重复插入）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_LIB = path.join(ROOT, 'native', 'android-sherpa', 'libs', 'sherpa-onnx-android.aar');
const SRC_ASSETS = path.join(ROOT, 'native', 'android-sherpa', 'assets', 'sherpa-en');
const LIBS_DIR = path.join(ROOT, 'android', 'app', 'libs');
const DEST_LIB = path.join(LIBS_DIR, 'sherpa-onnx-android.aar');
const DEST_ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'sherpa-en');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const DEP_LINE = "    implementation files('libs/sherpa-onnx-android.aar')";
const KOTLIN_LINE = '    implementation "org.jetbrains.kotlin:kotlin-stdlib:1.9.24"';

function copyLib() {
  if (!fs.existsSync(SRC_LIB)) {
    console.warn('[apply-native-sherpa] 未找到 AAR 真相源，先跑: node scripts/fetch-sherpa.cjs');
    return false;
  }
  fs.mkdirSync(LIBS_DIR, { recursive: true });
  fs.copyFileSync(SRC_LIB, DEST_LIB);
  return true;
}

/** 模型 assets 增量同步（espeak-ng-data 数百个小文件，按大小跳过未变化的）。 */
function copyAssets() {
  if (!fs.existsSync(SRC_ASSETS)) {
    console.warn('[apply-native-sherpa] 未找到模型 assets 真相源，先跑: node scripts/fetch-sherpa.cjs');
    return false;
  }
  let copied = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) walk(s, d);
      else {
        const sSize = fs.statSync(s).size;
        const dSize = fs.existsSync(d) ? fs.statSync(d).size : -1;
        if (sSize !== dSize) { fs.copyFileSync(s, d); copied++; }
      }
    }
  };
  walk(SRC_ASSETS, DEST_ASSETS);
  return copied;
}

function patchGradle() {
  if (!fs.existsSync(GRADLE)) return false;
  let src = fs.readFileSync(GRADLE, 'utf8');
  let changed = false;
  if (!src.includes('sherpa-onnx-android.aar')) {
    // 插在 capacitor-android 工程依赖之前（dependencies 块内恒存在锚点）
    const anchor = "    implementation project(':capacitor-android')";
    if (!src.includes(anchor)) {
      console.warn('[apply-native-sherpa] build.gradle 缺少 capacitor-android 锚点，跳过 patch');
      return false;
    }
    src = src.replace(anchor, `${DEP_LINE}\n${KOTLIN_LINE}\n${anchor}`);
    changed = true;
  }
  if (changed) fs.writeFileSync(GRADLE, src, 'utf8');
  return changed;
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.log('[apply-native-sherpa] 未找到 android/ 目录，跳过');
    return;
  }
  const lib = copyLib();
  const assets = copyAssets();
  const gradle = patchGradle();
  const targetReady = fs.existsSync(path.join(DEST_ASSETS, 'en_US-amy-medium.onnx'))
    && fs.existsSync(path.join(DEST_ASSETS, 'tokens.txt'))
    && fs.existsSync(path.join(DEST_ASSETS, 'espeak-ng-data', 'phontab'));
  console.log(
    `[apply-native-sherpa] AAR: ${lib ? '已铺' : '缺失'} · assets 增量 ${assets === false ? '缺失' : assets + ' 文件'} · gradle 依赖: ${gradle ? '已插入' : '已存在'}`,
  );
  if (!lib || !targetReady) {
    console.error('[apply-native-sherpa] 内置 TTS 资源不完整；先运行 node scripts/fetch-sherpa.cjs');
    process.exitCode = 1;
  }
}

main();
