/**
 * vitest 全局 setup —— 测试期的环境隔离（**所有**测试文件之前执行）。
 *
 * ★★★ 为什么必须有（2026-10-08 真实故障）：
 *   `db.ts` 在**模块顶层**就 `fs.mkdirSync(dataDir)` + 建库，而
 *   `dataDir = process.env.DATA_DIR || path.join(__dirname, '..')`。
 *   绝大多数测试没有设 DATA_DIR（100 个里只有 13 个设了），于是任何一个
 *   直接或间接 import 到 `src/db.js` 的测试（如 empty-args-and-compress.test.ts
 *   → llm-task-manager.js → db.js）都会在**源码目录** `apps/server/` 里建出一个
 *   `data.db`。后果：
 *     ① 源码树里常年躺着一个数据库文件，`git status` 脏、易被误打包；
 *     ② 更严重的是**污染真实数据**：dev 模式的 DB 一度就是这个路径，
 *        测试跑一次就会去打开/改动它（2026-10-08 该库发生 B 树损坏，
 *        表现正是「会话列表 500 / database disk image is malformed」）。
 *
 * ★ 为什么用全局 setup 而不是逐个测试补 DATA_DIR：
 *   逐个补是「每个新测试都要记得写」的约定，必漏（已经有 87 个漏了）。
 *   全局 setup 是**在入口处一次收口** —— 与「路径类入参必须有唯一解析出口」同理。
 *   已显式设了 DATA_DIR 的测试不受影响（这里只在未设时兜底）。
 *
 * ★ 每个测试文件独立进程/独立环境（vitest 默认 isolate），所以这里设的是
 *   该文件进程的 DATA_DIR，天然按文件隔离；目录在 afterAll 清理。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// 仅当调用方没有显式指定时才兜底 —— 已隔离的测试（自己 mkdtemp 并设 DATA_DIR）
// 保持原样，避免把它们的预期目录改掉。
if (!process.env.DATA_DIR || !process.env.DATA_DIR.trim()) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-test-data-'));
  process.env.DATA_DIR = tmp;

  afterAll(() => {
    // 清理失败不该让测试失败（与项目既有约定一致：清理必须 try/catch）
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  });
}

// ★ 同时拦一道更隐晦的路径：有些模块用 `process.env.DATA_DIR ? join(DATA_DIR,x) : resolve(x)`
//   这种「未设就落到 cwd」的写法（见 apps/server/src/index.ts / api-tool-executor.ts）。
//   DATA_DIR 设上之后这些分支也会走临时目录，不再污染仓库。