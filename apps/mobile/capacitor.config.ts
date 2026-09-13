import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yanzhi.mobile',
  appName: '言智',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#f8fafc',
    },
    // 内嵌 Node.js 运行时（Capawesome 插件，需 Capacitor 8+）
    // nodeDir: 相对于 webDir（dist/）的 Node.js 工程目录，构建脚本会把
    // apps/mobile/nodejs/ 内容同步到 dist/nodejs/，插件启动时从该目录加载 index.js
    Nodejs: {
      nodeDir: 'nodejs',
      startMode: 'auto',
    },
  },
};

export default config;
