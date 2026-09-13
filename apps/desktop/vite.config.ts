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
    // 代理后端 API（与 apps/web 对齐：/api -> http://localhost:3001）
    // 否则桌面端 /api/auth/login 等请求会落到 vite dev server 上返回 404
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
  },
});
