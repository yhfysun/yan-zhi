// 同步内置插件源码模板：把插件源码转义后嵌入 templates/index.ts 的 generated 区块。
// 用途：内置插件导出功能（GET /api/plugins/:id/export）的数据源必须与源码保持一致。
// 用法：node scripts/sync-plugin-templates.mjs  （在仓库根目录执行）
// 修改插件源码后重跑本脚本即可，勿手改 generated 区块。
//
// ★ 要同步哪个插件 = templates/index.ts 里已有 `// === generated:<id>:start ===` 区块的插件。
//   源码路径自动解析（catalog.backendEntry → plugins/<id>/index.ts → plugins/<id>.ts），
//   不再维护手写清单：加一个插件只需在模板文件里加一对标记（并给 PLUGIN_TEMPLATES 补一条
//   manifest + code 引用），脚本会自动认出它。
//   为什么不做「枚举 plugins/ 全部目录、全量生成」：ops-shell/shop-ops 等大插件源码各有数千行，
//   全量抄一遍会让本文件与后端起包膨胀约 700KB，且把所有内置插件变相变成源码分发出口。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_FILE = path.join(ROOT, 'apps/server/src/plugins/templates/index.ts');
const PLUGINS_SRC = path.join(ROOT, 'apps/server/src/plugins');
const CATALOG_FILE = path.join(ROOT, 'build/plugins.catalog.json');

function escapeTemplateLiteral(src) {
  return src.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** 模板文件里已声明要同步的插件 id（按出现顺序） */
function discoverGeneratedIds(tpl) {
  const re = /^\/\/ === generated:([a-z][a-z0-9-]*):start[^\n]* ===$/gm;
  return [...tpl.matchAll(re)].map((m) => m[1]);
}

/** 源码路径：catalog 是真相源，其次是插件目录形态 / 单文件形态 */
function resolveSourceFile(id, catalog) {
  const candidates = [];
  const declared = catalog?.plugins?.[id]?.backendEntry;
  if (typeof declared === 'string' && declared) candidates.push(path.join(ROOT, declared));
  candidates.push(path.join(PLUGINS_SRC, id, 'index.ts'));
  candidates.push(path.join(PLUGINS_SRC, `${id}.ts`));
  for (const file of candidates) if (existsSync(file)) return file;
  throw new Error(
    `插件 ${id} 的源码找不到。试过：${candidates.map((c) => path.relative(ROOT, c)).join('、')}`,
  );
}

/** 保留区块里已有的常量名（避免改名导致 PLUGIN_TEMPLATES 引用断裂）；缺失时按 id 推导 */
function constNameFor(tpl, id) {
  const re = new RegExp(`^// === generated:${id}:start[^\\n]* ===\\nconst ([A-Za-z0-9_$]+) = `, 'm');
  const found = re.exec(tpl);
  if (found) return found[1];
  return `${id.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_CODE`;
}

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
const tpl = readFileSync(TEMPLATES_FILE, 'utf8');
const ids = discoverGeneratedIds(tpl);
if (!ids.length) {
  throw new Error('templates/index.ts 里没有任何 generated 区块，拒绝写入（先加 `// === generated:<id>:start ===` 标记）');
}

let out = tpl;
for (const id of ids) {
  const srcFile = resolveSourceFile(id, catalog);
  const src = readFileSync(srcFile, 'utf8');
  const constName = constNameFor(out, id);
  const start = `// === generated:${id}:start（由 scripts/sync-plugin-templates.mjs 生成，勿手改） ===`;
  const end = `// === generated:${id}:end ===`;
  const block = `${start}\nconst ${constName} = \`${escapeTemplateLiteral(src)}\`;\n${end}`;

  const startRe = new RegExp(`^// === generated:${id}:start[^\\n]* ===$`, 'm');
  const endRe = new RegExp(`^// === generated:${id}:end ===$`, 'm');
  if (!startRe.test(out) || !endRe.test(out)) {
    throw new Error(`${id} 的 start/end 标记不完整，请手工检查 templates/index.ts`);
  }
  // ★ 组合正则必须带 'm'：source 里含 ^/$ 锚点，非多行模式下 $ 只匹配串尾，
  //   replace 会**静默无操作**（症状：改了插件源码重跑本脚本，模板却不变）。
  // ★ 替换串必须走函数形式：block 里含源码原文，`$'`/`` $` ``/$& 等序列会被
  //   replace 当替换模式解释（实测 `'^wechat$')` 把模板块截断并注入文件尾部）。
  out = out.replace(new RegExp(`${startRe.source}[\\s\\S]*?${endRe.source}`, 'm'), () => block);
  console.log(`✓ ${id} ← ${path.relative(ROOT, srcFile)} (${src.length} chars, ${constName})`);
}

writeFileSync(TEMPLATES_FILE, out, 'utf8');
console.log('已写入', TEMPLATES_FILE);
