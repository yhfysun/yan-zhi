#!/usr/bin/env node
/**
 * 幂等修正 Android 状态栏/导航栏与窗口底色。
 *
 * 背景：Capacitor 模板和旧主题把 windowBackground 固定为黑色，浅色页面进入
 * edge-to-edge 后会在顶部状态栏区域露出一条很粗的黑带。android/ 是生成目录，
 * 所以改在这里，并挂进 build:android 链路。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const VALUES = path.join(RES, 'values');
const VALUES_V35 = path.join(RES, 'values-v35');
const COLORS = path.join(VALUES, 'colors.xml');
const STYLES = path.join(VALUES, 'styles.xml');

function ensureColor() {
  if (!fs.existsSync(COLORS)) {
    fs.mkdirSync(path.dirname(COLORS), { recursive: true });
    fs.writeFileSync(
      COLORS,
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="appBackground">#F8FAFC</color>\n</resources>\n',
      'utf8',
    );
    return;
  }
  let xml = fs.readFileSync(COLORS, 'utf8');
  if (xml.includes('name="appBackground"')) return;
  xml = xml.replace(
    /<\/resources>/,
    '    <color name="appBackground">#F8FAFC</color>\n</resources>',
  );
  fs.writeFileSync(COLORS, xml, 'utf8');
}

function patchBaseStyles() {
  if (!fs.existsSync(STYLES)) return false;
  let xml = fs.readFileSync(STYLES, 'utf8');
  xml = xml
    .replace(/<item name="android:windowBackground">@android:color\/black<\/item>/g,
      '<item name="android:windowBackground">@color/appBackground</item>')
    .replace(
      /(<style name="AppTheme\.NoActionBar"[^>]*>)([\s\S]*?)(<\/style>)/,
      (_, open, body, close) => {
        const additions = [
          '<item name="android:statusBarColor">@color/appBackground</item>',
          '<item name="android:navigationBarColor">@color/appBackground</item>',
          '<item name="android:windowLightStatusBar">true</item>',
          '<item name="android:windowLightNavigationBar">true</item>',
        ].filter((line) => !body.includes(line.match(/name="([^"]+)"/)?.[1] || '__never__'));
        return `${open}${body}\n        ${additions.join('\n        ')}\n    ${close}`;
      },
    );
  fs.writeFileSync(STYLES, xml, 'utf8');
  return true;
}

function writeV35Styles() {
  fs.mkdirSync(VALUES_V35, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/appBackground</item>
        <item name="android:statusBarColor">@color/appBackground</item>
        <item name="android:navigationBarColor">@color/appBackground</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar">true</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowBackground">@color/appBackground</item>
        <item name="android:statusBarColor">@color/appBackground</item>
        <item name="android:navigationBarColor">@color/appBackground</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar">true</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>
</resources>
`;
  fs.writeFileSync(path.join(VALUES_V35, 'styles.xml'), xml, 'utf8');
}

function main() {
  if (!fs.existsSync(RES)) {
    console.log('[apply-native-system-bars] 跳过：android/ 工程还没生成');
    return;
  }
  ensureColor();
  if (!patchBaseStyles()) {
    console.log('[apply-native-system-bars] 跳过：styles.xml 不存在');
    return;
  }
  writeV35Styles();
  console.log('[apply-native-system-bars] 已设置浅色系统栏与窗口底色');
}

main();
