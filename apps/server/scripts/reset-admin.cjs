#!/usr/bin/env node
/**
 * 管理员自救脚本（2026-11-02）：库里已有账号、但没人记得密码 / 想要一个可登录的管理员时用。
 *
 * ★ 为什么需要它：`ensureDefaultAdmin` 只在**零用户**时种默认管理员；一旦库里已有
 *   test1/admin/... 这些历史测试账号，就不会再种，用户对着登录页只能报 401。
 *
 * 用法（先彻底退出言智，再在 apps/server 下跑）：
 *   node scripts/reset-admin.cjs --list
 *   node scripts/reset-admin.cjs --username admin --password 新密码
 *   node scripts/reset-admin.cjs --username admin            # 不传密码则生成随机密码并打印
 *   node scripts/reset-admin.cjs --username admin --password xxx --db D:\path\data.db
 *
 * 默认库：%APPDATA%/yan-zhi/server-data/data.db（可用 --db 或 DATA_DIR 覆盖）。
 * 改完直接启动应用用这个账号登录即可（must_change_password 会清零，不再强制改密）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ADMIN_ROLE_ID = 'role_admin';
const ROOT_ORG_ID = 'org_root';

function readArg(name) {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(inline.indexOf('=') + 1);
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : undefined;
}

function resolveDbPath() {
  const explicit = readArg('db');
  if (explicit) return path.resolve(explicit);
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.env.APPDATA || path.join(require('node:os').homedir(), 'AppData', 'Roaming'), 'yan-zhi', 'server-data');
  return path.join(dataDir, 'data.db');
}

function loadDb(p) {
  try {
    return require('better-sqlite3')(p);
  } catch (err) {
    console.error(`[reset-admin] 打开数据库失败: ${p}`);
    console.error(`  ${err && err.message}`);
    console.error('  · 路径不对？用 --db 指定；· ABI 不匹配？在 apps/server 下跑（依赖装在这里）');
    process.exit(1);
  }
}

const dbPath = resolveDbPath();
if (!fs.existsSync(dbPath)) {
  console.error(`[reset-admin] 数据库不存在: ${dbPath}`);
  process.exit(1);
}
const db = loadDb(dbPath);
console.log(`[reset-admin] 库: ${dbPath}`);

const users = db.prepare("SELECT id, username, (password_hash IS NULL OR password_hash = '') AS noPassword FROM user WHERE id <> 'guest' ORDER BY created_at").all();
if (process.argv.includes('--list')) {
  if (!users.length) console.log('  （没有任何用户）');
  for (const u of users) console.log(`  ${u.username}${u.noPassword ? '（空密码）' : ''}  id=${u.id}`);
  process.exit(0);
}

const username = readArg('username');
if (!username) {
  console.error('[reset-admin] 需要 --username <用户名>（或用 --list 先看有哪些账号）');
  console.error(`  当前用户: ${users.map((u) => u.username).join(', ') || '（无）'}`);
  process.exit(1);
}
const password = readArg('password') || crypto.randomBytes(9).toString('base64url');

const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync(password, 10);
const now = Date.now();

const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(username);
const id = existing?.id || crypto.randomUUID();
if (existing) {
  db.prepare('UPDATE user SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, id);
  console.log(`[reset-admin] 已重置密码: ${username}`);
} else {
  db.prepare('INSERT INTO user (id, username, email, password_hash, must_change_password, created_at) VALUES (?, ?, NULL, ?, 0, ?)')
    .run(id, username, hash, now);
  console.log(`[reset-admin] 已创建账号: ${username}`);
}

const hasRole = db.prepare('SELECT 1 FROM role WHERE id = ?').get(ADMIN_ROLE_ID);
if (hasRole) {
  db.prepare('INSERT OR IGNORE INTO user_role (user_id, role_id, created_at) VALUES (?, ?, ?)').run(id, ADMIN_ROLE_ID, now);
  const hasOrg = db.prepare('SELECT 1 FROM org WHERE id = ?').get(ROOT_ORG_ID);
  if (hasOrg) {
    db.prepare('INSERT OR IGNORE INTO user_org (user_id, org_id, created_at) VALUES (?, ?, ?)').run(id, ROOT_ORG_ID, now);
  }
} else {
  console.warn('[reset-admin] 注意：库里没有 role_admin，账号已建但未绑定管理员角色（RBAC 未初始化？）');
}

console.log(`[reset-admin] 密码: ${password}`);
console.log('[reset-admin] 完成。启动应用后用该账号登录。');
