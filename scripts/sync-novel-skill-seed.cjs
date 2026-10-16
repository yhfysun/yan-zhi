// 从 `.claude/skills/novel-tuiwen/`（唯一真相源）生成两份内置 skill 种子：
//   C = apps/server/src/db.ts 的 NOVEL_TUIWEN_BODY / NOVEL_TUIWEN_FILES
//   B = packages/core/src/db/schema.ts 的 BUILTIN_SKILLS_SEED[skill_novel_tuiwen].bodyMd / files
// 生成后回读校验（解模板 + 解析 JSON + 逐字比对），任一步不符即非零退出。
//
// ★ 两个踩过的坑（勿改回）：
//   ① 换行/反斜杠必须**逐字保留**：A 树是 CRLF，归一化成 LF 会让回读对不上；
//   ② 找正文结束的闭引号**不能用 `indexOf('`;')`** —— 正文里本身会出现「反引号+分号」
//      （被转义成 \`; 后仍含 `; 子串）⇒ 会提前截断，把后半段正文删掉。必须找**未被转义**的反引号。
const fs = require('fs');
const path = require('path');

const BS = String.fromCharCode(92);
const BT = String.fromCharCode(96);
const A = '.claude/skills/novel-tuiwen';

/** 模板字面量转义（逐字保留字节：\r 与 \n 各自转义） */
function escTemplate(s) {
  return s
    .split(BS).join(BS + BS)
    .split(BT).join(BS + BT)
    .split('$' + '{').join(BS + '$' + '{')
    .split('\r').join(BS + 'r')
    .split('\n').join(BS + 'n');
}

/** 从 from 起找第一个**未被转义**的反引号（前面连续反斜杠数为偶数） */
function unescapedBacktickFrom(s, from) {
  for (let i = from; i < s.length; i++) {
    if (s[i] !== BT) continue;
    let n = 0;
    while (i - 1 - n >= 0 && s[i - 1 - n] === BS) n++;
    if (n % 2 === 0) return i;
  }
  return -1;
}

/** 从 from（指向 '['）起找 JSON 数组的闭合 ']'——带字符串状态，内容里的 `}]` 不会误判 */
function jsonArrayEnd(s, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === BS) { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 换行统一成 LF —— git 入库时本就会把 CRLF 归一成 LF，种子必须与**入库后的**内容一致，
 *  否则在 Linux/CI（autocrlf=false）检出时「逐字一致」会失败；Windows 上两边又都是 CRLF。
 *  统一成 LF 是唯一跨平台稳定的口径。 */
function toLF(s) { return s.split('\r\n').join('\n'); }

/** 去掉 YAML frontmatter（name/description 另有专门的种子字段承载） */
function stripFrontmatter(s) {
  const m = s.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return m ? s.slice(m[0].length) : s;
}

/** 收 A 树里的 references 文件（路径相对 skill 根），按路径排序保证输出稳定 */
function collectFiles() {
  const out = [];
  (function walk(dir, rel) {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, r);
      else if (name.endsWith('.md')) out.push({ path: 'references/' + r, content: toLF(fs.readFileSync(abs, 'utf8')) });
    }
  })(path.join(A, 'references'), '');
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const body = stripFrontmatter(toLF(fs.readFileSync(path.join(A, 'SKILL.md'), 'utf8')));
const files = collectFiles();
const filesJson = JSON.stringify(files);
const bodyLit = escTemplate(body);

function must(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } }
function evalTemplate(source) { return Function('return ' + BT + source + BT)(); }

// ── C: apps/server/src/db.ts ─────────────────────────────────────────────
{
  const p = 'apps/server/src/db.ts';
  let src = fs.readFileSync(p, 'utf8');
  const BODY_KEY = 'const NOVEL_TUIWEN_BODY = ' + BT;
  const FILES_KEY = 'const NOVEL_TUIWEN_FILES = ';
  const li = src.indexOf(BODY_KEY);
  must(li > -1, 'db.ts 找不到 NOVEL_TUIWEN_BODY');
  const bodyStart = li + BODY_KEY.length;
  const bodyEnd = unescapedBacktickFrom(src, bodyStart);
  must(bodyEnd > bodyStart, 'db.ts NOVEL_TUIWEN_BODY 闭引号定位失败');
  const fi = src.indexOf(FILES_KEY);
  must(fi > -1, 'db.ts 找不到 NOVEL_TUIWEN_FILES');
  const filesStart = fi + FILES_KEY.length;
  must(src[filesStart] === '[', 'db.ts files 起点不是数组');
  const filesEnd = jsonArrayEnd(src, filesStart);
  must(filesEnd > filesStart, 'db.ts files 结束锚点异常');
  const shift = bodyLit.length - (bodyEnd - bodyStart);
  src = src.slice(0, bodyStart) + bodyLit + src.slice(bodyEnd);
  src = src.slice(0, filesStart + shift) + filesJson + src.slice(filesEnd + 1 + shift);
  fs.writeFileSync(p, src);
  console.log('✓ db.ts 已重写（body ' + body.length + ' 字 / files ' + files.length + ' 个）');
}

// ── B: packages/core/src/db/schema.ts ────────────────────────────────────
{
  const p = 'packages/core/src/db/schema.ts';
  let src = fs.readFileSync(p, 'utf8');
  const ei = src.indexOf("id: 'skill_novel_tuiwen'");
  must(ei > -1, 'schema.ts 找不到 novel 条目');
  const bodyKey = src.indexOf('bodyMd: ' + BT, ei);
  must(bodyKey > -1, 'schema.ts 找不到 bodyMd');
  const bodyStart = bodyKey + ('bodyMd: ' + BT).length;
  const filesKey = src.indexOf('files: [', bodyStart);
  must(filesKey > -1, 'schema.ts 找不到 files');
  const bodyEnd = src.lastIndexOf(BT, filesKey);
  must(bodyEnd > bodyStart, 'schema.ts bodyMd 闭引号定位失败');
  const filesStart = filesKey + 'files: '.length;
  const filesEnd = jsonArrayEnd(src, filesStart);
  must(filesEnd > filesStart, 'schema.ts files 结束锚点异常');
  const shift = bodyLit.length - (bodyEnd - bodyStart);
  src = src.slice(0, bodyStart) + bodyLit + src.slice(bodyEnd);
  src = src.slice(0, filesStart + shift) + filesJson + src.slice(filesEnd + 1 + shift);
  fs.writeFileSync(p, src);
  console.log('✓ schema.ts 已重写');
}

// ── 回读校验：两份种子解出来的东西必须与 A 树逐字一致 ────────────────────
{
  const db = fs.readFileSync('apps/server/src/db.ts', 'utf8');
  const BODY_KEY = 'const NOVEL_TUIWEN_BODY = ' + BT;
  const li = db.indexOf(BODY_KEY) + BODY_KEY.length;
  const be = unescapedBacktickFrom(db, li);
  must(evalTemplate(db.slice(li, be)) === body, 'db.ts body 回读不一致');
  const fs0 = db.indexOf('const NOVEL_TUIWEN_FILES = ') + 'const NOVEL_TUIWEN_FILES = '.length;
  const rtFiles = JSON.parse(db.slice(fs0, jsonArrayEnd(db, fs0) + 1));
  must(JSON.stringify(rtFiles) === filesJson, 'db.ts files 回读不一致');

  const sc = fs.readFileSync('packages/core/src/db/schema.ts', 'utf8');
  const ei = sc.indexOf("id: 'skill_novel_tuiwen'");
  const bk = sc.indexOf('bodyMd: ' + BT, ei) + ('bodyMd: ' + BT).length;
  const fk = sc.indexOf('files: [', bk);
  const be2 = sc.lastIndexOf(BT, fk);
  must(evalTemplate(sc.slice(bk, be2)) === body, 'schema.ts bodyMd 回读不一致');
  const fs2 = fk + 'files: '.length;
  const rtFiles2 = JSON.parse(sc.slice(fs2, jsonArrayEnd(sc, fs2) + 1));
  must(JSON.stringify(rtFiles2) === filesJson, 'schema.ts files 回读不一致');

  for (const f of rtFiles) {
    must(f.content === toLF(fs.readFileSync(path.join(A, f.path), 'utf8')), '文件内容与 A 树不符: ' + f.path);
  }
  console.log('✓ 回读校验通过：B/C 两份种子的 body 与 files 均与 A 树逐字一致（' + files.length + ' 个参考文件）');
}
