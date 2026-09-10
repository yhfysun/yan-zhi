// 验证：Electron 运行时（ELECTRON_RUN_AS_NODE=1）能加载当前 better-sqlite3 绑定
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..', '..');
const sqliteDir = fs.realpathSync(path.join(repo, 'apps', 'server', 'node_modules', 'better-sqlite3'));
const electron = require(path.join(repo, 'apps', 'desktop', 'node_modules', 'electron'));
const script = 'const D=require(process.argv[1]); console.log("electron-sqlite-ok", new D(":memory:").prepare("select 1 as x").get().x)';

try {
  const out = execFileSync(
    electron,
    ['-e', script, path.join(sqliteDir, 'lib', 'index.js')],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }, cwd: sqliteDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  console.log('[verify]', out.trim());
} catch (e) {
  console.error('[verify] FAILED');
  console.error('stdout:', (e.stdout || '').trim());
  console.error('stderr:', (e.stderr || '').trim().slice(0, 800));
  process.exit(1);
}
