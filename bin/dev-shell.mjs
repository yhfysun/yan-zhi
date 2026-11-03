#!/usr/bin/env node
/**
 * 轻量壳开发启动入口。
 *
 * 与 dev-backend 相反：强制 SHELL_MODE，不启动本机 server，连接指定远程后端。
 * 服务器地址优先级：--server-url > YZ_SERVER_BASE > resources/server-base.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);

function argValue(name) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(inline.indexOf('=') + 1);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : '';
}

function bakedServer() {
  try {
    const file = path.join(root, 'apps', 'desktop', 'resources', 'server-base.json');
    return String(JSON.parse(fs.readFileSync(file, 'utf8')).serverBase || '');
  } catch {
    return '';
  }
}

const serverBase = String(
  argValue('server-url')
  || process.env.YZ_SERVER_BASE
  || bakedServer()
  || '',
).trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s]+/i.test(serverBase)) {
  console.error(
    '[dev-shell] 缺少远程后端地址。用法:\n'
    + '  pnpm dev:shell --server-url=http://192.168.1.100:3001\n'
    + '  或设置 YZ_SERVER_BASE',
  );
  process.exit(1);
}

const hostPort = String(argValue('host-port') || process.env.YZ_SHELL_HOST_PORT || '3001');
const forwardArgs = argv.filter((a, i) => {
  if (a.startsWith('--server-url') || a.startsWith('--host-port')) return false;
  if ((argv[i - 1] === '--server-url' || argv[i - 1] === '--host-port') && !a.startsWith('--')) return false;
  return true;
});

console.log(`[dev-shell] 远程后端: ${serverBase}`);
console.log(`[dev-shell] 本机被控端端口: ${hostPort}`);
const child = spawn(
  process.execPath,
  [path.join(here, 'dev.mjs'), 'shell', ...forwardArgs],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      YZ_SHELL_DEV: '1',
      YZ_SERVER_BASE: serverBase,
      YZ_SHELL_HOST_PORT: hostPort,
      // 壳的数据只用于本机 UI/能力服务，不启动本机 server。
      YZ_AUTH_MODE: process.env.YZ_AUTH_MODE || 'multi',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 0));
