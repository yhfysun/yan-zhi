import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
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
