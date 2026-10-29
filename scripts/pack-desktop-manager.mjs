// 打包 .yzp（zip 根目录必须是 manifest.json，服务端 parseManifestFromZip 只认这个形态）
// 用服务端已依赖的 adm-zip：条目是正斜杠路径，且能排除测试文件。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const srcDir = path.join(root, 'plugins', 'optional', 'desktop-manager');
const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const outDir = path.join(root, 'dist');
const out = path.join(outDir, `${manifest.id}-${manifest.version}.yzp`);

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(out)) fs.rmSync(out, { force: true });

const EXCLUDE = (name) => name.endsWith('.test.mjs') || name === 'README.md' || name === 'package-lock.json';

const requireFromServer = createRequire(path.join(root, 'apps', 'server', 'package.json'));
let AdmZip = null;
try {
  AdmZip = requireFromServer('adm-zip');
} catch {
  AdmZip = null;
}

if (!AdmZip) {
  console.error('未找到 adm-zip（请先在仓库根执行依赖安装）');
  process.exit(1);
}

const zip = new AdmZip();
function addDir(dir, prefix) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE(e.name)) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) addDir(full, rel);
    else zip.addLocalFile(full, prefix, e.name);
  }
}
addDir(srcDir, '');
zip.writeZip(out);
console.log('[desktop-manager] packed →', out);
