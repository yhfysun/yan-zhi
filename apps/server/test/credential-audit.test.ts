// 加密凭证自检（apps/server/src/services/credential-audit.ts）的守门测试。
//
// 这个自检要防的是一类**静默**故障：dev→生产库逐表合并只搬数据行、主密钥行被跳过，
// 于是搬过来的密文用生产主密钥永远解不开 —— AES-GCM 认证失败会抛
// `Unsupported state or unable to authenticate data`，而不是解出乱码。
// 2026-10-10 那次是靠人工比对密钥指纹才定位的，本文件钉住「以后自动报出来」。
//
// ★ 与 db-integrity 一样，判定函数可注入（`opts.canDecrypt`），因此这里不需要真密钥、
//   也不需要真加密 —— 测的是「收集对了没」「分类对了没」「坏库不炸」。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import {
  auditCredentials,
  collectEncryptedValues,
  ENCRYPTED_COLUMNS,
  type AuditDb,
} from '../src/services/credential-audit.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 形状合法的三段 base64（内容虚构）：iv:tag:ciphertext */
const triple = (body = 'ZW5jcnlwdGVk') => `aXYxMmJ5dGVzMTI=:dGFnMTZieXRlcyEhISEhIQ==:${body}`;

async function mkDb(withTables = true): Promise<YzSqliteDb> {
  const { db } = await openSqlite(':memory:');
  if (withTables) {
    db.exec(`
      CREATE TABLE saved_password (id TEXT PRIMARY KEY, password_enc TEXT);
      CREATE TABLE mcp_credential (id TEXT PRIMARY KEY, secret_enc TEXT);
      CREATE TABLE data_source (id TEXT PRIMARY KEY, password_enc TEXT);
      CREATE TABLE plugin_storage (plugin_id TEXT, key TEXT, value TEXT);
    `);
  }
  return db;
}

const asAuditDb = (db: YzSqliteDb) => db as unknown as AuditDb;

describe('collectEncryptedValues · 收集加密凭证', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('三张加密列里的密文都被收集，并带上表.列与 rowid', () => {
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p1', triple());
    db.prepare('INSERT INTO mcp_credential (id, secret_enc) VALUES (?, ?)').run('m1', triple());
    db.prepare('INSERT INTO data_source (id, password_enc) VALUES (?, ?)').run('d1', triple());

    const refs = collectEncryptedValues(asAuditDb(db));
    expect(refs.map((r) => r.where).sort()).toEqual([
      'data_source.password_enc',
      'mcp_credential.secret_enc',
      'saved_password.password_enc',
    ]);
    expect(refs.every((r) => typeof r.rowId === 'number')).toBe(true);
  });

  it('★ plugin_storage 的 JSON 里藏着的密文也认得出（如 ops-shell 连接的 secretEnc）', () => {
    db.prepare('INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?)').run(
      'ops-shell',
      'connections',
      JSON.stringify([
        { id: 'ops-1', name: '42', secretEnc: triple() },
        { id: 'ops-2', name: '43', secretEnc: triple('YW5vdGhlcg==') },
      ]),
    );

    const refs = collectEncryptedValues(asAuditDb(db));
    expect(refs).toHaveLength(2);
    expect(refs[0].where).toBe('plugin_storage(ops-shell).connections[0].secretEnc');
    expect(refs[1].where).toBe('plugin_storage(ops-shell).connections[1].secretEnc');
  });

  it('非三段值、空值与非 JSON 值都不算凭证（不产生噪音）', () => {
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p1', 'plaintext');
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p2', '');
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p3', 'a:b');
    db.prepare('INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?)')
      .run('__app__', 'flag', '1789358024641'); // 不是 JSON

    expect(collectEncryptedValues(asAuditDb(db))).toEqual([]);
  });

  it('库是干净的（表都不存在）→ 不抛错，返回空', async () => {
    const bare = await mkDb(false);
    expect(collectEncryptedValues(asAuditDb(bare))).toEqual([]);
    bare.close();
  });
});

describe('auditCredentials · 分类与不炸', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('★ 解不开的密文被列出（含位置），可解开的被放过', () => {
    const bad = triple('YmFk');
    const good = triple('Z29vZA==');
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('bad', bad);
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('good', good);

    // 注入判定：只有 good 那条算解得开 —— 模拟"另一把主密钥加密的密文"
    const r = auditCredentials(asAuditDb(db), { canDecrypt: (p) => p === good });

    expect(r.total).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].where).toBe('saved_password.password_enc');
    expect(r.failures[0].payload).toBe(bad);
  });

  it('全部可解 → ok=true 且 failures 为空', () => {
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p1', triple());
    const r = auditCredentials(asAuditDb(db), { canDecrypt: () => true });
    expect(r).toMatchObject({ ok: true, total: 1, failures: [] });
  });

  it('判定函数自己抛错 → 计为解不开，不把自检带崩', () => {
    db.prepare('INSERT INTO saved_password (id, password_enc) VALUES (?, ?)').run('p1', triple());
    const r = auditCredentials(asAuditDb(db), {
      canDecrypt: () => { throw new Error('boom'); },
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
  });

  it('库是空的 → ok=true / total=0（自检对全新安装不产生噪音）', async () => {
    const bare = await mkDb(false);
    const r = auditCredentials(asAuditDb(bare), { canDecrypt: () => true });
    expect(r).toMatchObject({ ok: true, total: 0 });
    bare.close();
  });
});

describe('守门：自检清单必须与 crypto.decrypt 的调用点同步', () => {
  it('★★ 每个 decrypt(x.<列>) 的列，要么在 ENCRYPTED_COLUMNS 里，要么是被形状扫描覆盖的 secretEnc', () => {
    // 判据（与 conversation-mode.test.ts 抽 VALID_MODES 同一思路）：清单从实现源码抽，
    // 而不是手写第二份 —— 新增一处 decrypt 调用却忘了登记进自检清单，这条会红。
    const CALLERS = [
      'routes/browser.ts',
      'routes/mcp-credentials.ts',
      'mcp/client-manager.ts',
      'services/connector.ts',
      'plugins/ops-shell.ts',
    ];
    const cols = new Set<string>();
    for (const rel of CALLERS) {
      const src = readFileSync(path.join(HERE, '..', 'src', rel), 'utf8');
      for (const m of src.matchAll(/decrypt\(\s*\w+\.(\w+)\s*\)/g)) cols.add(m[1]);
    }
    expect(cols.size, '★ 未从调用方源码里抽到任何 decrypt 列名 —— 抽取正则失效，请同步本测试')
      .toBeGreaterThan(0);

    const known = new Set(ENCRYPTED_COLUMNS.map((c) => c.column));
    // secretEnc 存在 plugin_storage 的 JSON 里，由「按形状认」覆盖，不在列清单里
    const unregistered = [...cols].filter((c) => c !== 'secretEnc' && !known.has(c));
    expect(unregistered, `★ 以下加密列未登记进 ENCRYPTED_COLUMNS，自检会漏掉它们：${unregistered.join(', ')}`)
      .toEqual([]);
  });
});
