#!/usr/bin/env node
/**
 * 把「短信验证码转发」原生代码幂等地应用到 Android 工程。
 *
 * ★ 为什么需要这个脚本：
 *   apps/mobile/android/ 是 Capacitor 生成目录（**被 gitignore**），残缺时只能删掉重建，
 *   重建后所有手工改动（本插件的 java/manifest/MainActivity 注册）都会丢。
 *   所以原生改动的**唯一真相源**放在 apps/mobile/native/android/（tracked），
 *   由本脚本每次 cap sync 前重新铺进 android/ —— 与「重建后必补的两处副作用」同思路。
 *
 * 用法：node scripts/apply-native-sms.cjs
 * 幂等：重复执行不会重复插入权限/注册行。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_DIR = path.join(ROOT, 'native', 'android');
const JAVA_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'sms');
const MANIFEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const MAIN_ACTIVITY = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'MainActivity.java');

const PKG_IMPORT = 'import com.yanzhi.mobile.sms.SmsForwardPlugin;';
const MANIFEST_PERM = '<uses-permission android:name="android.permission.RECEIVE_SMS" />';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyJavaSources() {
  ensureDir(JAVA_DIR);
  const files = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.java'));
  for (const f of files) {
    fs.copyFileSync(path.join(NATIVE_DIR, f), path.join(JAVA_DIR, f));
  }
  return files.length;
}

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`未找到 AndroidManifest.xml: ${MANIFEST}`);
  let xml = fs.readFileSync(MANIFEST, 'utf8');
  if (xml.includes('android.permission.RECEIVE_SMS')) return false;
  // 插在 INTERNET 权限之后（同一权限区块），保持既有排版习惯
  const anchor = '<uses-permission android:name="android.permission.INTERNET" />';
  if (xml.includes(anchor)) {
    xml = xml.replace(anchor, `${anchor}\n    ${MANIFEST_PERM}`);
  } else {
    xml = xml.replace('</manifest>', `    ${MANIFEST_PERM}\n</manifest>`);
  }
  fs.writeFileSync(MANIFEST, xml, 'utf8');
  return true;
}

function patchMainActivity() {
  if (!fs.existsSync(MAIN_ACTIVITY)) throw new Error(`未找到 MainActivity.java: ${MAIN_ACTIVITY}`);
  let src = fs.readFileSync(MAIN_ACTIVITY, 'utf8');

  // 已是目标形态（含 registerPlugin）则跳过
  if (src.includes('SmsForwardPlugin')) return false;

  // 1) 补 import
  if (!src.includes(PKG_IMPORT)) {
    src = src.replace(
      /^import com\.getcapacitor\.BridgeActivity;$/m,
      `import com.getcapacitor.BridgeActivity;\n${PKG_IMPORT}`,
    );
  }

  // 2) 补 onCreate + registerPlugin（必须在 super.onCreate 之前注册本地插件）
  if (!/void\s+onCreate/.test(src)) {
    src = src.replace(
      /public class MainActivity extends BridgeActivity \{\}/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // 本地插件（非 npm 包）：必须在 super.onCreate 之前注册，否则 Bridge 初始化时看不到它
        registerPlugin(SmsForwardPlugin.class);
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
    console.log('[apply-native-sms] 未找到 android/ 目录，跳过（先生成 Android 工程：npx cap add android）');
    return;
  }
  const n = copyJavaSources();
  const manifestPatched = patchManifest();
  const activityPatched = patchMainActivity();
  console.log(`[apply-native-sms] 已复制 ${n} 个 java 源文件到 android/`);
  console.log(`[apply-native-sms] AndroidManifest.xml RECEIVE_SMS 权限: ${manifestPatched ? '已添加' : '已存在'}`);
  console.log(`[apply-native-sms] MainActivity 插件注册: ${activityPatched ? '已添加' : '已存在'}`);
}

main();