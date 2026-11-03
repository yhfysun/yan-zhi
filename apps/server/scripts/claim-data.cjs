#!/usr/bin/env node
/**
 * 数据过户脚本（2026-11-02）：把某个用户名下的全部数据迁给另一个账号。
 *
 * 典型场景：单机时期（guest 身份）积累的会话/智能体/技能，切到 multi 多用户登录后
 * 按 owner 过滤看不见了 —— 把这些数据过户给当前账号即可恢复可见。
 *
 * 用法（先彻底退出言智，再在 apps/server 下跑）：
 *   node scripts/claim-data.cjs --to yanZhiPower --dry-run     # 先看会迁多少
 *   node scripts/claim-data.cjs --to yanZhiPower               # 真的迁（默认 from=guest）
 *   node scripts/claim-data.cjs --to admin --from guest --db D:\path\data.db
 *
 * 只迁「带 user_id 列」的表；带复合主键的表可能因目标已有同键行冲突，脚本会逐表报告跳过原因。
 */
const fs = require('node:fs');
const path = require('node:path');

function readArg(name) {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(inline.indexOf('=') + 1);
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : undefined;
}

const dry = process.argv.includes('--dry-run');
const dbPath = (() => {
  const explicit = readArg('db');
  if (explicit) return path.resolve(explicit);
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.env.APPDATA || path.join(require('node:os').homedir(), 'AppData', 'Roaming'), 'yan-zhi', 'server-data');
  return path.join(dataDir, 'data.db');
})();
if (!fs.existsSync(dbPath)) {
  console.error(`[claim-data] 数据库不存在: ${dbPath}`);
  process.exit(1);
}

const Database = require('better-sqlite3');
let db;
try {
  db = new Database(dbPath, dry ? { readonly: true } : {});
} catch (err) {
  console.error(`[claim-data] 打开数据库失败（应用是否还在运行？先彻底退出）: ${err.message}`);
  process.exit(1);
}
if (!dry) db.pragma('busy_timeout = 5000');
console.log(`[claim-data] 库: ${dbPath}${dry ? '（dry-run，只读）' : ''}`);

const toKey = readArg('to') || 'yanZhiPower';
const fromKey = readArg('from') || 'guest';
const target = db.prepare('SELECT id, username FROM user WHERE username = ? OR id = ?').get(toKey, toKey);
if (!target) {
  console.error(`[claim-data] 目标账号不存在: ${toKey}（可用 reset-admin.cjs 先建）`);
  process.exit(1);
}
const source = db.prepare('SELECT id, username FROM user WHERE username = ? OR id = ?').get(fromKey, fromKey);
const sourceId = source ? source.id : fromKey;
console.log(`[claim-data] ${source ? `从 ${source.username}(${source.id})` : `从 id=${sourceId}（不在 user 表，按 id 处理）`} → ${target.username}(${target.id})`);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((t) => t.name)
  .filter((t) => t !== 'user')
  .filter((t) => db.prepare(`PRAGMA table_info(${JSON.stringify(t)})`).all().some((c) => c.name === 'user_id'));

let total = 0;
const skipped = [];
for (const t of tables) {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM ${JSON.stringify(t)} WHERE user_id = ?`).get(sourceId).c;
  if (!n) continue;
  if (dry) {
    console.log(`  [dry-run] ${t}: ${n} 行`);
    total += n;
    continue;
  }
  try {
    const r = db.prepare(`UPDATE ${JSON.stringify(t)} SET user_id = ? WHERE user_id = ?`).run(target.id, sourceId);
    console.log(`  ${t}: 迁 ${r.changes} 行`);
    total += r.changes;
  } catch (err) {
    skipped.push(`${t}: ${err.message}`);
  }
}

console.log('');
if (skipped.length) {
  console.warn('[claim-data] 以下表未迁（多为复合主键冲突，目标账号已有同键行）：');
  for (const s of skipped) console.warn('  - ' + s);
}
console.log(dry ? `[claim-data] dry-run 结束：共 ${total} 行待迁。` : `[claim-data] 完成：共迁移 ${total} 行。`);
if (!dry) console.log('[claim-data] 重启应用后用该账号登录即可看到这些数据。');
