// 同步内置插件源码模板：把插件源码转义后嵌入 templates/index.ts 的 generated 区块。
// 用途：内置插件导出功能（GET /api/plugins/:id/export）的数据源必须与源码保持一致。
// 用法：node scripts/sync-plugin-templates.mjs  （在仓库根目录执行）
// 修改插件源码后重跑本脚本即可，勿手改 generated 区块。
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_FILE = path.join(ROOT, 'apps/server/src/plugins/templates/index.ts');

// id → 源码文件 + 生成常量名。新增内置插件时在此登记一行。
const ENTRIES = [
  { id: 'computer-use', file: 'apps/server/src/plugins/computer-use.ts', constName: 'COMPUTER_USE_CODE' },
];

function escapeTemplateLiteral(src) {
  return src.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const tpl = readFileSync(TEMPLATES_FILE, 'utf8');
let out = tpl;

for (const e of ENTRIES) {
  const src = readFileSync(path.join(ROOT, e.file), 'utf8');
  const start = `// === generated:${e.id}:start（由 scripts/sync-plugin-templates.mjs 生成，勿手改） ===`;
  const end = `// === generated:${e.id}:end ===`;
  const block = `${start}\nconst ${e.constName} = \`${escapeTemplateLiteral(src)}\`;\n${end}`;

  const startRe = new RegExp(`^// === generated:${e.id}:start[^\\n]* ===$`, 'm');
  const endRe = new RegExp(`^// === generated:${e.id}:end ===$`, 'm');
  if (startRe.test(out) && endRe.test(out)) {
    out = out.replace(new RegExp(`${startRe.source}[\\s\\S]*?${endRe.source}`), block);
  } else if (!startRe.test(out)) {
    const anchor = 'export const PLUGIN_TEMPLATES';
    const idx = out.indexOf(anchor);
    if (idx < 0) throw new Error(`templates/index.ts 中找不到锚点: ${anchor}`);
    out = out.slice(0, idx) + block + '\n\n' + out.slice(idx);
  } else {
    throw new Error(`${e.id} 的 start/end 标记不完整，请手工检查 templates/index.ts`);
  }
  console.log(`✓ ${e.id} ← ${e.file} (${src.length} chars)`);
}

writeFileSync(TEMPLATES_FILE, out, 'utf8');
console.log('已写入', TEMPLATES_FILE);
