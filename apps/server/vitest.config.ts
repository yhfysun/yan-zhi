import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '.json'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    // ★ 全局环境隔离：给未显式设 DATA_DIR 的测试兜一个临时目录。
    //   没有它的话，任何 import 到 src/db.js 的测试（db.ts 顶层就 mkdir + 建库）
    //   都会在**源码目录** apps/server/ 里建 data.db —— 实测正是它污染了 dev 的真实库
    //   （2026-10-08 该库 B 树损坏 → 会话接口 500）。详见 setup 文件注释。
    setupFiles: ['./test/setup-env-isolation.ts'],
  },
});