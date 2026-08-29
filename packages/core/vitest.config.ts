import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 让 .ts 优先于 .js，避免误解析到 src 下残留的 tsc 编译产物（.js）
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '.json'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/tool/builtin/web-search.ts'],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
