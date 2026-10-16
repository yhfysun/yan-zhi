import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '.json'],
  },
  // ★ 依赖/SSR 缓存固定到项目内 tmp/（2026-10-16）。
  //   默认 vitest 会把缓存写到系统临时目录（%TEMP%\<随机>\ssr\...）；
  //   本机沙箱对该路径只有读权限 ⇒ 写缓存 EPERM，**正在 transform 的测试文件被静默丢掉**，
  //   表现为「同一份代码每次跑出不同文件数」（164/163/165 files），极易误判成回归。
  //   显式指定后 EPERM 归零，全量 165 files / 2611 passed 稳定复现。
  cacheDir: './tmp/vitest-cache',
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