// 一次性脚本：把 db.ts 的建表/迁移/seed 部分抽到 db/seed.ts，并转换 db.xxx → await driver.xxx
const fs = require('fs');

const SRC = 'C:/Users/Administrator/AppData/Local/Temp/db.ts.original';
const OUT = 'apps/server/src/db/seed.ts';

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

const schema = lines.slice(49, 2585).join('\n');

// ===== 1. 简单替换
let s = schema;
s = s.replace(/\bdb\.exec\(/g, 'await driver.exec(');
s = s.replace(/\bdb\.pragma\(/g, 'await driver.pragma(');

// ===== 2. 状态机转换 db.prepare(SQL).run/.all/.get/iterate(args) → await driver.xxx(SQL, args)
function convertPrepare(content) {
  let out = '';
  let i = 0;
  let conversions = 0;
  let leftUnconverted = 0;

  while (i < content.length) {
    const start = content.indexOf('db.prepare(', i);
    if (start < 0) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, start);
    i = start + 'db.prepare('.length;

    // 解析 SQL
    let depth = 0;
    let inStr = null;
    let escape = false;
    let sqlBuf = '';
    let sqlEnd = i;
    for (let k = i; k < content.length; k++) {
      const c = content[k];
      if (escape) { sqlBuf += c; escape = false; continue; }
      if (inStr) {
        // 在字符串内：只有 inStr 字符才能结束，其它引号是内容
        sqlBuf += c;
        if (c === '\\') { escape = true; continue; }
        if (c === inStr) { inStr = null; }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        sqlBuf += c;
        inStr = c;
        continue;
      }
      if (c === '(') { depth++; sqlBuf += c; continue; }
      if (c === ')') {
        if (depth === 0) {
          sqlEnd = k;
          break;
        }
        depth--;
        sqlBuf += c;
        continue;
      }
      sqlBuf += c;
    }

    let j = sqlEnd + 1;  // 跳过 db.prepare 的 ）
    while (j < content.length && /\s/.test(content[j])) j++;

    let method = null;
    if (content.slice(j, j + 5) === '.run(') method = 'run';
    else if (content.slice(j, j + 5) === '.all(') method = 'all';
    else if (content.slice(j, j + 5) === '.get(') method = 'get';
    else if (content.slice(j, j + 10) === '.iterate(') method = 'iterate';

    if (!method) {
      // 没有 .run/.all/.get/.iterate，保持原文（用户可能后续手动处理）
      out += 'db.prepare(' + sqlBuf + ')';
      i = sqlEnd;
      leftUnconverted++;
      continue;
    }

    // 找 args 结束：跳过 method( 的开括号，初始 argDepth=1 计入开括号
    // 注意：args 解析也需跳过 SQL/字符串内容，避免把 'SQL', 当成 args
    const argsStart = j + method.length + 2;  // 跳过 .xxx(
    let argDepth = 1;
    let argInStr = null;
    let argEscape = false;
    let argsEnd = argsStart;
    let argsBuf = '';
    for (let k = argsStart; k < content.length; k++) {
      const c = content[k];
      if (argEscape) { argsBuf += c; argEscape = false; continue; }
      if (argInStr) {
        // 字符串内容：只有 inStr 字符才能结束
        argsBuf += c;
        if (c === '\\') { argEscape = true; continue; }
        if (c === argInStr) argInStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { argInStr = c; argsBuf += c; continue; }
      if (c === '(') { argDepth++; argsBuf += c; continue; }
      if (c === ')') {
        argDepth--;
        if (argDepth === 0) { argsEnd = k; break; }
        argsBuf += c;
        continue;
      }
      argsBuf += c;
    }

    // 去掉跨行 args 末尾的 trailing comma（如 [arg1,\n] 这种风格）
    const argsRaw = argsBuf.trim().replace(/,\s*$/, '');
    const argsJs = argsRaw.length === 0 ? '[]' : '[' + argsRaw + ']';

    // SQL 用 trim 后的 sqlBuf（去掉换行和空白；外层引号完整保留）
    out += 'await driver.' + method + '(' + sqlBuf.trim() + ', ' + argsJs + ')';
    i = argsEnd + 1;
    conversions++;
  }
  console.log('convertPrepare 转换次数:', conversions, '| 未转换的 db.prepare:', leftUnconverted);
  return out;
}

const sConv = convertPrepare(s);

let final = sConv;

const header = `// apps/server/src/db/seed.ts
// 从 db.ts 自动抽取的建表/迁移/seed。两个 driver (sqlite-driver / capacitor-driver)
// 都通过这个函数跑初始化，保证两个平台 schema 一致。

import type { DbDriver } from './driver.js';

/**
 * 跑全部建表、迁移、seed 数据。
 * driver 必须是已经 init 过的实例（SqliteDriver init 时已开 WAL + vec 扩展，
 * CapacitorDriver init 时已开数据库连接）。
 */
export async function runSchemaMigrationsAndSeed(driver: DbDriver): Promise<void> {
`;

const out = header + final + '\n}\n';

fs.writeFileSync(OUT, out);
console.log('seed.ts 写入成功，长度:', out.length);

const residualPrepare = (out.match(/\bdb\.prepare\(/g) || []).length;
const residualDbCalls = (out.match(/\bdb\.(exec|pragma|transaction)\(/g) || []).length;
const awaitDriver = (out.match(/await driver\.(run|all|get|exec|pragma|transaction)\(/g) || []).length;
console.log('残留 db.prepare:', residualPrepare, '| db.exec/pragma/transaction:', residualDbCalls);
console.log('await driver.xxx 次数:', awaitDriver);