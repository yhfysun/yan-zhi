/**
 * 打包产物校验（APK / electron exe 通用）
 *
 * 为什么单独写脚本而不是临时命令：
 *   · 校验要读 APK 的 ZIP 中央目录 + 解压 assets/public/**，逻辑比一行命令复杂；
 *   · 特征串含中文与模板串，经 shell heredoc 会被展开（Bad substitution）→ 必须落文件再跑。
 *
 * 用法：
 *   node scripts/verify-package-artifacts.cjs apk <path-to-apk>
 *   node scripts/verify-package-artifacts.cjs asar <path-to-app.asar>
 *   node scripts/verify-package-artifacts.cjs apk <path> --needles "串1,串2"
 *
 * ★ `--needles` 会**替换**默认特征串。要证明「本轮改动进了包」必须传本轮独有的
 *   文案（默认那几条只作回归基线，证明不了新改动）。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/**
 * 默认特征串（回归基线）。
 * 本轮改动请用 `--needles` 覆盖（默认串证明不了新改动）。
 *
 * ★★ 只放**会出现在编译产物里**的串（2026-09-29 修正）：
 *   原来第一条是 `智能体列表未加载` —— 它在前端源码里**只存在于注释**
 *   （`packages/ui/src/stores/platform.ts` 的说明注释），注释**不会进产物** →
 *   必定扫不到 → 每次打包都误报 FAIL。这是**校验器自身的问题，不是打包缺陷**。
 *   → 教训：特征串要选**代码里的字面量**（用户可见文案 / 标识符 / 工具名），
 *     不能选注释里的措辞 —— 后者编译即消失。
 *   （同理 `后端未就绪` 也只是注释措辞，已移除。）
 */
const DEFAULT_NEEDLES = [
  // 用户可见文案（出现在 UI 源码的字符串字面量里）
  '专属智能体未安装',
  // 业务标识符（内置智能体 id，出现在种子数据里）
  'a_builtin_audiobook_agent',
];

// ─────────────────── ZIP（APK）───────────────────
function readZipEntries(buf) {
  // 定位 End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('未找到 ZIP EOCD');
  let cdCount = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64：值全为 0xFFFF/0xFFFFFFFF 时需读 ZIP64 EOCD
  if (cdCount === 0xffff || cdOffset === 0xffffffff) {
    let z64 = -1;
    for (let i = eocd - 20; i >= Math.max(0, eocd - 66000); i--) {
      if (buf.readUInt32LE(i) === 0x06064b50) { z64 = i; break; }
    }
    if (z64 >= 0) {
      cdCount = Number(buf.readBigUInt64LE(z64 + 32));
      cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // ZIP64 extra 字段
    if (localOffset === 0xffffffff || compSize === 0xffffffff) {
      const ex = p + 46 + nameLen;
      let q = ex, end = ex + extraLen;
      while (q < end) {
        const tag = buf.readUInt16LE(q), sz = buf.readUInt16LE(q + 2);
        if (tag === 0x0001) {
          if (compSize === 0xffffffff) compSize = Number(buf.readBigUInt64LE(q + 4));
        }
        q += 4 + sz;
      }
    }
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf, e) {
  const nameLen = buf.readUInt16LE(e.localOffset + 26);
  const extraLen = buf.readUInt16LE(e.localOffset + 28);
  const dataStart = e.localOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + e.compSize);
  return e.method === 0 ? raw : zlib.inflateRawSync(raw);
}

function verifyApk(apkPath, NEEDLES) {
  const buf = fs.readFileSync(apkPath);
  const entries = readZipEntries(buf);
  console.log(`[verify] APK: ${apkPath}`);
  console.log(`[verify] 大小: ${(buf.length / 1024 / 1024).toFixed(1)} MB, ZIP 条目: ${entries.length}`);

  // 只扫 assets/public 下的 js（前端与内嵌后端都在这里）
  const jsEntries = entries.filter((e) => /^assets\/public\/.*\.js$/i.test(e.name));
  console.log(`[verify] assets/public JS 文件: ${jsEntries.length}`);

  const hits = Object.fromEntries(NEEDLES.map((n) => [n, 0]));
  let totalJs = 0;
  for (const e of jsEntries) {
    let text;
    try { text = extractEntry(buf, e).toString('utf8'); } catch { continue; }
    totalJs++;
    for (const n of NEEDLES) if (text.includes(n)) hits[n]++;
  }
  console.log(`[verify] 已扫描 JS 文件: ${totalJs}`);
  console.log('[verify] 特征串命中:');
  let allOk = true;
  for (const n of NEEDLES) {
    const ok = hits[n] > 0;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✓' : '✗'} ${n}  (${hits[n]} 个文件)`);
  }

  // 内嵌后端入口必须存在
  const hasEntry = entries.some((e) => e.name === 'assets/public/nodejs/dist/apps/server/src/index.js');
  console.log(`  ${hasEntry ? '✓' : '✗'} 内嵌后端入口 assets/public/nodejs/dist/apps/server/src/index.js`);
  const nodeModulesCount = entries.filter((e) => /^assets\/public\/nodejs\/node_modules\//.test(e.name)).length;
  console.log(`  ${nodeModulesCount > 100 ? '✓' : '✗'} 内嵌依赖 node_modules 文件数: ${nodeModulesCount}`);

  return allOk && hasEntry && nodeModulesCount > 100;
}

// ─────────────────── asar（electron）───────────────────
function verifyAsar(asarPath, NEEDLES) {
  const fd = fs.openSync(asarPath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonSize = head.readUInt32LE(12);
  const jbuf = Buffer.alloc(jsonSize);
  fs.readSync(fd, jbuf, 0, jsonSize, 16);
  const idx = JSON.parse(jbuf.toString('utf8'));
  const HEADER = 16 + jsonSize;

  function walk(node, prefix) {
    const out = [];
    for (const [k, v] of Object.entries(node.files || {})) {
      const p = prefix + '/' + k;
      if (v.files) out.push(...walk(v, p));
      else out.push({ path: p, size: v.size, offset: Number(v.offset) });
    }
    return out;
  }
  const all = walk(idx, '');
  const js = all.filter((f) => /^\/dist\/assets\/.*\.js$/.test(f.path));
  console.log(`[verify] asar: ${asarPath}`);
  console.log(`[verify] dist/assets JS: ${js.length}`);

  const hits = Object.fromEntries(NEEDLES.map((n) => [n, 0]));
  for (const f of js) {
    const b = Buffer.alloc(f.size);
    fs.readSync(fd, b, 0, f.size, HEADER + f.offset);
    const text = b.toString('utf8');
    for (const n of NEEDLES) if (text.includes(n)) hits[n]++;
  }
  console.log('[verify] 特征串命中:');
  let allOk = true;
  for (const n of NEEDLES) {
    const ok = hits[n] > 0;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✓' : '✗'} ${n}  (${hits[n]} 个文件)`);
  }
  fs.closeSync(fd);
  return allOk;
}

// ─────────────── asar-deps（主进程运行时依赖冒烟）───────────────
/**
 * 校验打出的 app.asar 里**主进程真要用到的包一个不少**。
 *
 * ★★ 为什么需要：`apps/desktop/package.json` 的 dependencies 决定哪些包进 asar。
 *   2026-10-30 把渲染层依赖（vue / element-plus / @yan-zhi/ui …）挪进 devDependencies 后，
 *   asar 从 334MB 降到 78MB —— 但这类裁剪一旦漏掉主进程真 require 的包，
 *   **开发与构建都不会报错，只有装上才崩**（Cannot find module）。
 *   所以打包后必须直接对产物验一次，而不是相信配置。
 *
 * 判据：随包 .cjs 里的每个裸包名 require，都能在 asar 的 node_modules/ 或
 *      app.asar.unpacked/node_modules/ 里找到。
 */
function verifyAsarDeps(asarPath) {
  const { builtinModules } = require('node:module');
  const builtins = new Set([...builtinModules, ...builtinModules.map((m) => 'node:' + m), 'electron']);
  const desktopDir = path.join(__dirname, '..', 'apps', 'desktop');

  // 随包模块 = yml files: 段里登记的 .cjs（三份 yml 取并集）
  const ymls = ['electron-builder.full.yml', 'electron-builder.lite.yml', 'electron-builder.mac.yml'];
  const modules = new Set();
  for (const yml of ymls) {
    const lines = fs.readFileSync(path.join(desktopDir, yml), 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => /^files:\s*$/.test(l));
    if (start < 0) continue;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[A-Za-z_]/.test(lines[i])) break;
      const m = lines[i].match(/^\s*-\s+(.+?)\s*$/);
      if (!m || m[1].startsWith('#') || m[1].includes('*')) continue;
      let v = m[1];
      if (v.length >= 2 && ((v[0] === "'" && v.at(-1) === "'") || (v[0] === '"' && v.at(-1) === '"'))) v = v.slice(1, -1);
      if (v.endsWith('.cjs')) modules.add(v);
    }
  }

  // 整行注释先剔掉（main.cjs 里有 `// … require('@yan-zhi/shared')` 这种说明性文字）
  const required = new Map(); // 包名 -> 首次出现它的文件
  for (const f of modules) {
    const p = path.join(desktopDir, f);
    if (!fs.existsSync(p)) continue;
    const src = fs
      .readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    for (const m of src.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)) {
      const name = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (builtins.has(name)) continue;
      if (!required.has(name)) required.set(name, f);
    }
  }

  const fd = fs.openSync(asarPath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonSize = head.readUInt32LE(12);
  const jbuf = Buffer.alloc(jsonSize);
  fs.readSync(fd, jbuf, 0, jsonSize, 16);
  const idx = JSON.parse(jbuf.toString('utf8'));
  fs.closeSync(fd);

  const nm = (idx.files.node_modules && idx.files.node_modules.files) || {};
  const packed = new Set(Object.keys(nm));
  const hasNode = (name) => {
    const scope = nm[name.split('/')[0]];
    return !!(scope && scope.files && scope.files[name.split('/')[1]]);
  };
  const present = (name) => packed.has(name) || hasNode(name);
  const unpackedDir = path.join(path.dirname(asarPath), 'app.asar.unpacked', 'node_modules');
  const presentUnpacked = (name) => fs.existsSync(path.join(unpackedDir, name));

  console.log(`[verify] asar-deps: ${asarPath}`);
  console.log(`[verify] 随包 .cjs 模块: ${modules.size}，主进程外部依赖: ${required.size}`);
  console.log(`[verify] asar 体积: ${(fs.statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB`);
  let ok = true;
  for (const [name, from] of [...required].sort((a, b) => a[0].localeCompare(b[0]))) {
    const found = present(name) || presentUnpacked(name);
    if (!found) ok = false;
    console.log(`  ${found ? '✓' : '✗'} ${name}  (${from})`);
  }
  return ok;
}

const argv = process.argv.slice(2);
const mode = argv[0];
const target = argv.find((a, i) => i > 0 && !a.startsWith('--'));
if (!mode || !target) {
  console.error('用法: node scripts/verify-package-artifacts.cjs <apk|asar|asar-deps> <path> [--needles "串1,串2"]');
  process.exit(2);
}
// --needles 替换默认特征串（本轮改动独有文案）
let needles = DEFAULT_NEEDLES;
const nIdx = argv.indexOf('--needles');
if (nIdx >= 0 && argv[nIdx + 1]) {
  needles = argv[nIdx + 1].split(',').map((s) => s.trim()).filter(Boolean);
  console.log(`[verify] 自定义特征串: ${needles.join(' | ')}`);
}
if (!fs.existsSync(target)) {
  console.error(`[verify] 文件不存在: ${target}`);
  process.exit(2);
}
const ok =
  mode === 'apk' ? verifyApk(target, needles)
  : mode === 'asar-deps' ? verifyAsarDeps(target)
  : verifyAsar(target, needles);
console.log(ok ? '\n[verify] 结论: PASS' : '\n[verify] 结论: FAIL');
process.exit(ok ? 0 : 1);