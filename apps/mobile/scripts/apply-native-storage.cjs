#!/usr/bin/env node
/**
 * 幂等应用 Android 真实文件访问插件与权限声明。
 * android/ 是生成目录；native/android-storage/ 是唯一可重建的源码真相源。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_DIR = path.join(ROOT, 'native', 'android-storage');
const JAVA_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'storage');
const MANIFEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const MAIN_ACTIVITY = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'MainActivity.java');
const IMPORT_LINE = 'import com.yanzhi.mobile.storage.YzStoragePlugin;';

const PERMISSIONS = [
  '<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
];

function patchManifest() {
  let xml = fs.readFileSync(MANIFEST, 'utf8');
  const missing = PERMISSIONS.filter((p) => !xml.includes(p));
  if (!missing.length) return 0;
  xml = xml.replace('</manifest>', `    ${missing.join('\n    ')}\n</manifest>`);
  fs.writeFileSync(MANIFEST, xml, 'utf8');
  return missing.length;
}

function patchMainActivity() {
  let src = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
  if (src.includes('YzStoragePlugin')) return false;
  src = src.replace(
    /^import com\.getcapacitor\.BridgeActivity;$/m,
    `import com.getcapacitor.BridgeActivity;\n${IMPORT_LINE}`,
  );
  const register = '        registerPlugin(YzStoragePlugin.class);\n';
  if (src.includes('registerPlugin(SmsForwardPlugin.class);')) {
    src = src.replace(
      '        registerPlugin(SmsForwardPlugin.class);\n',
      '        registerPlugin(SmsForwardPlugin.class);\n' + register,
    );
  } else if (/super\.onCreate\(savedInstanceState\);/.test(src)) {
    src = src.replace('        super.onCreate(savedInstanceState);', register + '        super.onCreate(savedInstanceState);');
  } else {
    src = src.replace(/public class MainActivity extends BridgeActivity \{\}/, `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(YzStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}`);
  }
  fs.writeFileSync(MAIN_ACTIVITY, src, 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'android'))) {
    console.log('[apply-native-storage] android/ 不存在，跳过');
    return;
  }
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  const files = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.java'));
  for (const file of files) fs.copyFileSync(path.join(NATIVE_DIR, file), path.join(JAVA_DIR, file));
  const perms = patchManifest();
  const registered = patchMainActivity();
  console.log(`[apply-native-storage] java ${files.length} 个；新增权限 ${perms} 条；MainActivity 注册 ${registered ? '已添加' : '已存在'}`);
}

main();
