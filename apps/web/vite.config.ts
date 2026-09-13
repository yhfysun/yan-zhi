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
    extensions: ['.ts', '.mjs', '.js', '.vue', '.json'],
    alias: {
      '@yan-zhi/ui': resolve(__dirname, '../../packages/ui/src'),
      '@yan-zhi/core': resolve(__dirname, '../../packages/core/src'),
      '@yan-zhi/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  // workspace 包为源码软链：排除预打包，使改 packages/* 源码后前端实时热更。
  optimizeDeps: {
    exclude: ['@yan-zhi/ui', '@yan-zhi/core', '@yan-zhi/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
