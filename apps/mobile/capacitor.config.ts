import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yanzhi.mobile',
  appName: '言智',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // androidScheme 是 https（存储 origin 稳定、可进安全上下文）。混合内容放行见 android 段。
  },
  android: {
    // ★ 混合内容放行：WebView 壳是 https://localhost，远程控制/局域网节点后端是
    //   http://192.168.x.x:3001 —— https→http 会被 Mixed Content 策略拦截（127.0.0.1
    //   有回环豁免，局域网 IP 没有）。放行后局域网节点才真正可达。
    // ★★ Capacitor 8 的 CapConfig 只读 android.allowMixedContent / 顶层 allowMixedContent，
    //   **不读 server.allowMixedContent**（Bridge.java:594 → MIXED_CONTENT_ALWAYS_ALLOW）——
    //   放 server 段会静默无效（2026-10-26 手机实测实锤，此前一直被拦）。
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
