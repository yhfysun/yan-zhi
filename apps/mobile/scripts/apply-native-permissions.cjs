#!/usr/bin/env node
/**
 * 把「明文流量放行 + 预测返回 + 相机权限」幂等地应用到 Android 工程清单。
 *
 * ★ 为什么需要这个脚本：
 *   apps/mobile/android/ 是 Capacitor 生成目录（**被 gitignore**），重建后手工改动全丢。
 *   目标形态：WebView 通过 http://127.0.0.1:3001 访问内嵌后端 —— targetSdk 36 下
 *   Android 9+ 默认禁止明文 HTTP，缺 usesCleartextTraffic 会导致所有 /api 请求
 *   被 ERR_CLEARTEXT_NOT_PERMITTED 拦截（启动页等满 30s、所有列表为空）。
 *   CAMERA 权限同理：清单不声明，系统权限页就没有这一项，用户想授权都无从下手。
 *
 * 用法：node scripts/apply-native-permissions.cjs
 * 幂等：重复执行不会重复插入。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`未找到 AndroidManifest.xml: ${MANIFEST}`);
  let xml = fs.readFileSync(MANIFEST, 'utf8');
  let changed = false;

  // 1) application 加 usesCleartextTraffic（放行到内嵌后端 127.0.0.1:3001 的明文 HTTP）
  if (!xml.includes('android:usesCleartextTraffic')) {
    if (!/<application\b/.test(xml)) throw new Error('manifest 中未找到 <application> 标签');
    xml = xml.replace(/<application\b/, '<application\n        android:usesCleartextTraffic="true"');
    changed = true;
  }

  // 2) Android 16 预测返回：Capacitor 8 使用 OnBackPressedCallback，
  //    显式开启可避免不同厂商把缺省值解释成旧式 onBackPressed。
  if (!xml.includes('android:enableOnBackInvokedCallback')) {
    if (!/<application\b/.test(xml)) throw new Error('manifest 中未找到 <application> 标签');
    xml = xml.replace(
      /<application\b/,
      '<application\n        android:enableOnBackInvokedCallback="true"',
    );
    changed = true;
  } else if (/android:enableOnBackInvokedCallback\s*=\s*"false"/.test(xml)) {
    xml = xml.replace(
      /android:enableOnBackInvokedCallback\s*=\s*"false"/,
      'android:enableOnBackInvokedCallback="true"',
    );
    changed = true;
  }

  // 3) CAMERA 权限（清单不声明 ⇒ MIUI 等权限页不出现"相机"项）
  if (!xml.includes('android.permission.CAMERA')) {
    const anchor = '<uses-permission android:name="android.permission.RECEIVE_SMS" />';
    if (xml.includes(anchor)) {
      xml = xml.replace(anchor, `${anchor}\n    <uses-permission android:name="android.permission.CAMERA" />`);
    } else {
      xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.CAMERA" />\n</manifest>');
    }
    changed = true;
  }

  // 3b) 麦克风权限（2026-11-15 用户实报「麦克风打不开」）：口语陪练 getUserMedia
  //     需要 RECORD_AUDIO（清单声明）+ 运行时申请（Capacitor BridgeWebChromeClient
  //     的 onPermissionRequest 会自动弹系统授权框，见 @capacitor/android 8.5 源码）——
  //     清单缺声明时 WebView 直接拒绝，连授权框都不弹。MODIFY_AUDIO_SETTINGS 同组。
  if (!xml.includes('android.permission.RECORD_AUDIO')) {
    const anchor = '<uses-permission android:name="android.permission.CAMERA" />';
    if (xml.includes(anchor)) {
      xml = xml.replace(
        anchor,
        `${anchor}\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`,
      );
    } else {
      xml = xml.replace(
        '</manifest>',
        '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n</manifest>',
      );
    }
    changed = true;
  }

  // 4) 相机硬件声明为可选（无摄像头设备仍可安装）
  if (!xml.includes('android.hardware.camera')) {
    xml = xml.replace(
      '</manifest>',
      '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>',
    );
    changed = true;
  }

  if (changed) fs.writeFileSync(MANIFEST, xml, 'utf8');
  return changed;
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.log('[apply-native-permissions] 未找到 android/ 目录，跳过（先生成 Android 工程：npx cap add android）');
    return;
  }
  const changed = patchManifest();
  console.log(`[apply-native-permissions] usesCleartextTraffic + predictive-back + CAMERA + uses-feature: ${changed ? '已补齐' : '已存在'}`);
}

main();
