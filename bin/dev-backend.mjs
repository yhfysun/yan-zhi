#!/usr/bin/env node
/**
 * 纯后端启动入口。
 *
 * 完整桌面/壳开发都会拉起自己的本机执行环境；这个入口只跑 server，
 * 用于另一台机器作为远程 AI 后端，或单独调试 API/插件。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(
  process.execPath,
  [path.join(here, 'dev.mjs'), 'server', ...process.argv.slice(2)],
  {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      // 纯后端作为完整节点，允许 computer-use 在该机执行；轻量壳远程节点不设此标记。
      YZ_DESKTOP_LOCAL_EXECUTION: '1',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 0));
