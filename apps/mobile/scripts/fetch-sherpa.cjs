#!/usr/bin/env node
/**
 * 下载内置离线 TTS 的二进制（sherpa-onnx AAR + piper 英语模型）到真相源目录。
 *
 * ★ 国内源优先（2026-11-16 实测：GitHub 直连 ~50KB/s 且常断，npmmirror 稳定快）：
 *   - AAR：从 react-native-sherpa-onnx-offline-tts@0.2.6（npmmirror）里抽
 *     package/android/libs/sherpa-onnx-1.10.35.aar（= 官方 1.10.35 全量 AAR，
 *     jni 4 ABI + classes.jar）；
 *   - 模型：vits-piper-en_US-amy-medium-int8（GitHub tts-models release，
 *     GitHub 直连不稳定，按 gh-proxy → GitHub → ghproxy.net 顺序回退）。
 *
 * ★ 二进制不入库（.gitignore native/android-sherpa/libs、assets）：
 *   换机器重建时先跑本脚本，再跑 build:android。
 * 用法：node scripts/fetch-sherpa.cjs
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ROOT = path.resolve(__dirname, '..');
const SHERPA_DIR = path.join(ROOT, 'native', 'android-sherpa');
const LIB_DEST = path.join(SHERPA_DIR, 'libs', 'sherpa-onnx-android.aar');
const ASSETS_DEST = path.join(SHERPA_DIR, 'assets', 'sherpa-en');
const TMP = path.join(ROOT, '..', '..', 'tmp');

const RN_PKG_URL = 'https://registry.npmmirror.com/react-native-sherpa-onnx-offline-tts/-/react-native-sherpa-onnx-offline-tts-0.2.6.tgz';
const AAR_IN_PKG = 'package/android/libs/sherpa-onnx-1.10.35.aar';
const MODEL_URLS = [
  'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium-int8.tar.bz2',
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium-int8.tar.bz2',
  'https://ghproxy.net/https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium-int8.tar.bz2',
];
const TAR = process.platform === 'win32' ? 'tar.exe' : 'tar';

async function download(url, dest) {
  console.log('[fetch-sherpa] 下载:', url);
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 (HTTP ${response.status}): ${url}`);
  }
  const partial = `${dest}.part`;
  await fsp.rm(partial, { force: true });
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    await fsp.rm(dest, { force: true });
    await fsp.rename(partial, dest);
  } finally {
    await fsp.rm(partial, { force: true });
  }
}

async function downloadModel(dest) {
  let lastError = null;
  for (const url of MODEL_URLS) {
    try {
      await download(url, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 10 * 1024 * 1024) return;
      throw new Error(`下载产物过小: ${dest}`);
    } catch (error) {
      lastError = error;
      console.warn('[fetch-sherpa] 镜像失败，尝试下一个:', String(error));
    }
  }
  throw lastError || new Error('模型下载失败');
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.dirname(LIB_DEST), { recursive: true });

  // ── 1. AAR（npmmirror，国内快）──
  if (fs.existsSync(LIB_DEST) && fs.statSync(LIB_DEST).size > 10 * 1024 * 1024) {
    console.log('[fetch-sherpa] AAR 已存在，跳过:', LIB_DEST);
  } else {
    const tgz = path.join(TMP, 'rntts.tgz');
    await download(RN_PKG_URL, tgz);
    const aarDir = path.join(TMP, 'rntts-extract');
    fs.rmSync(aarDir, { recursive: true, force: true });
    fs.mkdirSync(aarDir, { recursive: true });
    const ex = spawnSync(TAR, ['-xf', tgz, '-C', aarDir, AAR_IN_PKG], { stdio: 'inherit', shell: false });
    if (ex.status !== 0) throw new Error('tar 解包失败');
    const aarSrc = path.join(aarDir, AAR_IN_PKG);
    if (!fs.existsSync(aarSrc)) throw new Error('tgz 内未找到 ' + AAR_IN_PKG);
    fs.copyFileSync(aarSrc, LIB_DEST);
    console.log('[fetch-sherpa] AAR 已就位:', LIB_DEST);
  }

  // ── 2. 模型（GitHub release，一次性）──
  const modelMarker = path.join(ASSETS_DEST, 'en_US-amy-medium.onnx');
  if (fs.existsSync(modelMarker) && fs.statSync(modelMarker).size > 10 * 1024 * 1024) {
    console.log('[fetch-sherpa] 模型已存在，跳过:', modelMarker);
  } else {
    const tb = path.join(TMP, 'vits-amy.tar.bz2');
    if (!fs.existsSync(tb) || fs.statSync(tb).size <= 10 * 1024 * 1024) await downloadModel(tb);
    const exDir = path.join(ASSETS_DEST);
    fs.mkdirSync(exDir, { recursive: true });
    const ex = spawnSync(TAR, ['-xjf', tb, '-C', exDir], { stdio: 'inherit', shell: false });
    if (ex.status !== 0) throw new Error('模型解包失败');
    // tarball 包了一层目录 vits-piper-en_US-amy-medium-int8/，拍平
    const inner = path.join(exDir, 'vits-piper-en_US-amy-medium-int8');
    if (fs.existsSync(inner)) {
      for (const e of fs.readdirSync(inner)) {
        const target = path.join(exDir, e);
        fs.rmSync(target, { recursive: true, force: true });
        fs.renameSync(path.join(inner, e), target);
      }
      fs.rmdirSync(inner);
    }
    const phontab = path.join(exDir, 'espeak-ng-data', 'phontab');
    const tokens = path.join(exDir, 'tokens.txt');
    if (!fs.existsSync(modelMarker) || fs.statSync(modelMarker).size <= 10 * 1024 * 1024
      || !fs.existsSync(tokens) || !fs.existsSync(phontab)) {
      throw new Error('模型解包后完整性校验失败');
    }
    console.log('[fetch-sherpa] 模型已就位:', ASSETS_DEST);
  }
  console.log('[fetch-sherpa] 完成');
}

main().catch((error) => {
  console.error('[fetch-sherpa]', error);
  process.exitCode = 1;
});
