#!/usr/bin/env node
/**
 * 把「远控沉浸式全屏」原生插件幂等地铺进 Android 工程。
 *
 * 与 apply-native-sms.cjs 同一套路：apps/mobile/android/ 是 cap 生成目录（gitignore），
 * 重建就丢，所以真相源在 apps/mobile/native/android-immersive/，每次构建前重新铺。
 *
 * 用法：node scripts/apply-native-immersive.cjs（幂等）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NATIVE_DIR = path.join(ROOT, 'native', 'android-immersive');
const JAVA_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'immersive');
const MAIN_ACTIVITY = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'yanzhi', 'mobile', 'MainActivity.java');
const PKG_IMPORT = 'import com.yanzhi.mobile.immersive.RcImmersivePlugin;';

function main() {
  if (!fs.existsSync(MAIN_ACTIVITY)) {
    console.log('[apply-native-immersive] 跳过：android/ 工程还没生成');
    return;
  }
  fs.mkdirSync(JAVA_DIR, { recursive: true });
  const files = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith('.java'));
  for (const f of files) {
    fs.copyFileSync(path.join(NATIVE_DIR, f), path.join(JAVA_DIR, f));
  }

  let src = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
  if (src.includes('RcImmersivePlugin')) {
    console.log(`[apply-native-immersive] 已复制 ${files.length} 个 java 源文件；MainActivity 注册已存在`);
    return;
  }
  if (!src.includes(PKG_IMPORT)) {
    src = src.replace(
      /^import com\.getcapacitor\.BridgeActivity;$/m,
      `import com.getcapacitor.BridgeActivity;\n${PKG_IMPORT}`,
    );
  }
  if (/registerPlugin\(/.test(src)) {
    // 已有注册行（短信插件）：插在 super.onCreate 之前
    src = src.replace(/(\n\s*)super\.onCreate\(/, '$1registerPlugin(RcImmersivePlugin.class);$1super.onCreate(');
  } else {
    src = src.replace(
      /public class MainActivity extends BridgeActivity \{\}/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // 本地插件：必须在 super.onCreate 之前注册，否则 Bridge 初始化时看不到它
        registerPlugin(RcImmersivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}`,
    );
  }
  fs.writeFileSync(MAIN_ACTIVITY, src, 'utf8');
  console.log(`[apply-native-immersive] 已复制 ${files.length} 个 java 源文件并注册 RcImmersivePlugin`);
}

main();
