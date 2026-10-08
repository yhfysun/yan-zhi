import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    // 关键：<webview> 是 Electron 提供的自定义元素（custom element），
    // 不在 HTML 标准标签集里，Vue 默认会尝试当组件解析 → "Failed to resolve component: webview"。
    // 注册到 isCustomElement 后编译器跳过它、走原生 createElement，渲染层才能拿到 Electron 提供的 webview 实例。
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview',
        },
      },
    }),
  ],
  resolve: {
    // 关键：packages/*/src 下有 tsc 编译残留 .js（8月24日旧产物）。Vite 默认 .js 优先于 .ts，
    // 会导致前端加载旧 .js（缺新功能导出，如 localAddDoc → SyntaxError）。让 .ts 优先。
    extensions: ['.ts', '.mjs', '.js', '.vue', '.json'],
    alias: {
      '@yan-zhi/ui': resolve(__dirname, '../../packages/ui/src'),
      '@yan-zhi/core': resolve(__dirname, '../../packages/core/src'),
      '@yan-zhi/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  // 关键：workspace 包是源码软链（非预构建 dist），默认会被 Vite 预打包进 .vite 缓存且不监听 HMR。
  // 排除后改为按需编译并监听源码，改 packages/* 后桌面前端实时热更，无需手动重启。
  optimizeDeps: {
    exclude: ['@yan-zhi/ui', '@yan-zhi/core', '@yan-zhi/shared'],
  },
  base: './',
  // 桌面端共享 web 的 public 目录（纹理图片、GeoJSON 等静态资源）
  publicDir: resolve(__dirname, '../web/public'),
  server: {
    port: 1420,
    strictPort: true,
    // 本机 chokidar 监听会静默挂掉（改 packages/ui 不触发 HMR，实测 2026-09-15）：
    // 轮询兜底，保证 packages/* 源码改动一定能被看到。
    watch: {
      usePolling: true,
      interval: 500,
    },
    // 代理后端 API（/api → 本机内嵌后端）
    // ★ 端口随实例：dev 实例 3002 / 生产 3001。写死 3001 会让开发实例的**相对路径**请求
    //   （未走 apiFetch 的那些，如 SSE 直连）落到正式版后端上。
    //   优先读 dev 编排器下发的 YANZHI_API_PORT。
    proxy: {
      '/api': {
        // ★★ 必须用 127.0.0.1 而不是 localhost（与 apps/web 同口径，2026-10-07）：
        //   Node 18+ 会把 localhost 优先解析到 ::1，而本机 IPv6 是黑洞 →
        //   代理 `AggregateError [ECONNREFUSED]` → 界面全部 /api 500，
        //   但直连 127.0.0.1 正常，症状极易被误判成"后端没起"。
        target: `http://127.0.0.1:${process.env.YANZHI_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
  },
});
