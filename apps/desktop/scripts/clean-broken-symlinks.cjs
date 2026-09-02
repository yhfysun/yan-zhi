const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..', '..');

const pnpmNodeModules = path.join(rootDir, 'node_modules', '.pnpm', 'node_modules');

if (!fs.existsSync(pnpmNodeModules)) {
  console.log('[clean-broken-symlinks] pnpm 虚拟存储不存在，跳过:', pnpmNodeModules);
  process.exit(0);
}

let removed = 0;
let checked = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    checked++;
    if (entry.isSymbolicLink()) {
      try {
        fs.statSync(p);
      } catch {
        fs.rmSync(p, { recursive: true, force: true });
        removed++;
      }
    } else if (entry.isDirectory()) {
      walk(p);
    }
  }
}

walk(pnpmNodeModules);

console.log(
  `[clean-broken-symlinks] 扫描 ${checked} 项，删除断链 symlink ${removed} 个` +
    (removed > 0 ? `（于 ${pnpmNodeModules}）` : ''),
);