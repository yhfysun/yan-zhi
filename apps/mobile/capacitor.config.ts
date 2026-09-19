import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yanzhi.mobile',
  appName: '言智',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // androidScheme 是 https（存储 origin 稳定、可进安全上下文），但 WebView 默认拦截
    // https → http 的混合内容：局域网节点后端恰恰是 http://192.168.x.x:3001。
    // allowMixedContent 放行后，「设为后端」指向的局域网节点才真正可达；
    // 纯 http 的 API 请求不涉及用户敏感凭据跨网明文之外的风险面（token 本就随请求走）。
    allowMixedContent: true,
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
