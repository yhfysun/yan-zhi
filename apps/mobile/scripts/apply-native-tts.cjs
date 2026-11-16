#!/usr/bin/env node
/**
 * 把「系统语音合成插件」幂等地铺进 Android 工程（2026-11-15）。
 *
 * ★ 背景：WebView 的 speechSynthesis 在国产 ROM 上不可靠（voices 空/只有中文），
 *   移动端朗读统一走原生 TextToSpeech（所有 ROM 自带，支持中英文）。
 *   参照 apply-native-m1nfc.cjs 的「真相源 + 幂等铺设」模式：
 *   真相源 native/android-tts/（独立目录，避免与整目录复制的 native/android/ 混包）。
 *
 * ★ 无需 manifest 权限：系统 TTS 是普通 API，不涉危险权限；也不需要 NFC 那样的
 *   uses-feature 声明。
 * ★ MainActivity 的本地插件注册统一走 safeRegisterPlugin：任一插件类加载失败只禁用
 *   该插件并写 crash.log，不能让应用启动直接闪退。
 *
 * 用法：node scripts/apply-native-tts.cjs（幂等，重复执行不重复插入）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_DIR = path.join(ROOT, 'native', 'android-tts');
const JAVA_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'tts');
const MAIN_ACTIVITY = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'MainActivity.java');

const PKG_IMPORT = 'import com.yanzhi.mobile.tts.TtsPlugin;';
const CRASH_IMPORT = 'import com.yanzhi.mobile.tts.CrashLogger;';

function copyJavaSources() {
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  const files = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.java'));
  for (const f of files) fs.copyFileSync(path.join(NATIVE_DIR, f), path.join(JAVA_DIR, f));
  return files.length;
}

/** 幂等 patch MainActivity：import + onCreate 里 super.onCreate 之前注册（Bridge 初始化前必须可见） */
function patchMainActivity() {
  if (!fs.existsSync(MAIN_ACTIVITY)) throw new Error(`未找到 MainActivity.java: ${MAIN_ACTIVITY}`);
  let src = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
  let changed = false;
  if (!src.includes(PKG_IMPORT)) {
    src = src.replace(
      'import com.getcapacitor.BridgeActivity;',
      `import com.getcapacitor.BridgeActivity;\n${PKG_IMPORT}`,
    );
    changed = true;
  }
  if (!src.includes(CRASH_IMPORT)) {
    src = src.replace(
      'import com.getcapacitor.BridgeActivity;',
      `import com.getcapacitor.BridgeActivity;\n${CRASH_IMPORT}`,
    );
    changed = true;
  }
  if (!src.includes('CrashLogger.install(this);')) {
    src = src.replace(
      /(public void onCreate\(android\.os\.Bundle savedInstanceState\)\s*\{)/,
      '$1\n        CrashLogger.install(this);',
    );
    changed = true;
  }
  const imports = [...src.matchAll(/^import\s+([\w.]+);$/gm)].map((m) => m[1]);
  const next = src.replace(
    /^(\s*)registerPlugin\(([A-Za-z0-9_]+)\.class\);\s*$/gm,
    (_line, indent, className) => {
      const fullName = imports.find((name) => name.endsWith(`.${className}`));
      if (!fullName) throw new Error(`无法解析本地插件完整类名: ${className}`);
      return `${indent}safeRegisterPlugin("${fullName}", "${className}");`;
    },
  );
  if (next !== src) {
    src = next;
    changed = true;
  }
  if (!src.includes('private void safeRegisterPlugin(')) {
    const helper = [
      '',
      '    @SuppressWarnings("unchecked")',
      '    private void safeRegisterPlugin(String className, String label) {',
      '        try {',
      '            Class<?> raw = Class.forName(className);',
      '            registerPlugin((Class<? extends com.getcapacitor.Plugin>) raw);',
      '        } catch (Throwable error) {',
      '            CrashLogger.record("MainActivity.registerPlugin:" + label, error);',
      '        }',
      '    }',
    ].join('\n');
    src = src.replace(/\n}\s*$/, `${helper}\n}\n`);
    changed = true;
  }
  if (changed) fs.writeFileSync(MAIN_ACTIVITY, src, 'utf8');
  return changed;
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.log('[apply-native-tts] 未找到 android/ 目录，跳过（先生成 Android 工程）');
    return;
  }
  const n = copyJavaSources();
  const mChanged = patchMainActivity();
  console.log(
    `[apply-native-tts] java 文件 ${n} 个已铺；MainActivity 注册: ${mChanged ? '已插入' : '已存在'}`,
  );
}

main();
