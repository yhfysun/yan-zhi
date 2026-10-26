import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@yan-zhi/ui': resolve(__dirname, 'src'),
    },
    // 让 .ts 优先于 .js，避免误解析到 dist 下残留的 tsc 编译产物
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '.json'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // jsdom 用例的前置补丁（matchMedia 等浏览器 API），node 环境自动跳过
    setupFiles: ['./test-setup.ts'],
  },
});