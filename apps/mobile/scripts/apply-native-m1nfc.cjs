#!/usr/bin/env node
/**
 * 把「M1 NFC 读卡插件」幂等地铺进 Android 工程。
 *
 * ★ 为什么单独一个目录：apps/mobile/native/android/ 里的 .java 会被
 *   apply-native-sms.cjs **整目录复制**到 com/yanzhi/mobile/sms/ 包下。
 *   本插件的 package 是 com.yanzhi.mobile.m1nfc，混进去必然编译失败，
 *   所以真相源放在 native/android-m1nfc/（与 android-immersive 同款独立目录）。
 *
 * ★ android/ 是 Capacitor 生成目录（gitignore），重建后手工改动全丢，
 *   因此每次 build:android 都由本脚本重新铺 java / 权限 / MainActivity 注册。
 *
 * 用法：node scripts/apply-native-m1nfc.cjs（幂等，重复执行不重复插入）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_DIR = path.join(ROOT, 'native', 'android-m1nfc');
const JAVA_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'm1nfc');
const MANIFEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const MAIN_ACTIVITY = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'MainActivity.java');

const PKG_IMPORT = 'import com.yanzhi.mobile.m1nfc.M1NfcPlugin;';
const NFC_PERM = '<uses-permission android:name="android.permission.NFC" />';
const NFC_FEATURE = '<uses-feature android:name="android.hardware.nfc" android:required="false" />';

function copyJavaSources() {
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  const files = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.java'));
  for (const f of files) fs.copyFileSync(path.join(NATIVE_DIR, f), path.join(JAVA_DIR, f));
  return files.length;
}

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`未找到 AndroidManifest.xml: ${MANIFEST}`);
  let xml = fs.readFileSync(MANIFEST, 'utf8');
  let changed = false;

  if (!xml.includes('android.permission.NFC')) {
    const anchor = '<uses-permission android:name="android.permission.INTERNET" />';
    if (xml.includes(anchor)) {
      xml = xml.replace(anchor, `${anchor}\n    ${NFC_PERM}`);
    } else {
      xml = xml.replace('</manifest>', `    ${NFC_PERM}\n</manifest>`);
    }
    changed = true;
  }
  // 声明为可选硬件：没有 NFC 的设备仍能安装（课程模拟器照样可用）
  if (!xml.includes('android.hardware.nfc')) {
    xml = xml.replace('</manifest>', `    ${NFC_FEATURE}\n</manifest>`);
    changed = true;
  }
  if (changed) fs.writeFileSync(MANIFEST, xml, 'utf8');
  return changed;
}

function patchMainActivity() {
  if (!fs.existsSync(MAIN_ACTIVITY)) throw new Error(`未找到 MainActivity.java: ${MAIN_ACTIVITY}`);
  let src = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
  if (src.includes('M1NfcPlugin')) return false;

  if (!src.includes(PKG_IMPORT)) {
    src = src.replace(
      /^import com\.getcapacitor\.BridgeActivity;$/m,
      `import com.getcapacitor.BridgeActivity;\n${PKG_IMPORT}`,
    );
  }

  if (/registerPlugin\(/.test(src) || /void\s+onCreate/.test(src)) {
    // 已有 onCreate（短信 / 沉浸式插件）：在 super.onCreate 之前追加一行注册
    src = src.replace(
      /(\n\s*)super\.onCreate\(/,
      '$1registerPlugin(M1NfcPlugin.class);$1super.onCreate(',
    );
  } else {
    src = src.replace(
      /public class MainActivity extends BridgeActivity \{\}/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // 本地插件：必须在 super.onCreate 之前注册
        registerPlugin(M1NfcPlugin.class);
        super.onCreate(savedInstanceState);
    }
}`,
    );
  }
  fs.writeFileSync(MAIN_ACTIVITY, src, 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.log('[apply-native-m1nfc] 跳过：android/ 工程还没生成（先 npx cap add android）');
    return;
  }
  const n = copyJavaSources();
  const manifestPatched = patchManifest();
  const activityPatched = patchMainActivity();
  console.log(`[apply-native-m1nfc] java ${n} 个 · NFC 权限 ${manifestPatched ? '已补齐' : '已存在'} · MainActivity 注册 ${activityPatched ? '已补齐' : '已存在'}`);
}

main();
