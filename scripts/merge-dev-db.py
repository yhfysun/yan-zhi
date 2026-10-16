#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 dev 遗留库（apps/server/data.db，schema 已损坏）的数据并入生产库。

用法：
    python merge-dev-db.py [--dry-run] [--dev <path>] [--prod <path>]

设计（用户 2026-10-10 拍板口径）：
  · 目标：dev 与安装版共用一套库 + 同一端口
  · 模型 / 平台等冲突域：**以生产为准**（生产已有的行跳过）
  · 迁移前必须已备份生产库（本脚本只写生产库，不做备份 —— 备份是调用方的事）

损坏处理：
  dev 库有 4 个孤儿索引（idx_kb_base_user / idx_kb_doc_base / idx_kb_visibility /
  sqlite_autoindex_knowledge_doc_1）指向不存在的表，导致 schema 解析失败。
  以 `PRAGMA writable_schema=ON` + 删索引的方式绕过（仅内存视图，不动原库）。
  另有 chat_peer 表页面级损坏（且为空表）→ 跳过。

合并策略（逐表）：
  1. 生产缺的表 → 用 dev 的 schema 建表后整表插入
  2. 共有的表 → 按**列交集**取数，逐行 INSERT OR IGNORE（生产已有主键则跳过）
  3. 无法读取的表 → 跳过并记录
  4. 收尾自检 → 比对两份库的主密钥指纹并统计生产库的加密凭证（见 check_credentials）

★★ 为什么第 4 步必须做（2026-10-10 事故）：

  第 2 步的「生产已有主键则跳过」对 `app_config` 是**致命的** —— 两份库都有
  `saved_password_master_key` 这一行，于是 dev 那把主密钥被**跳过**，生产侧那把胜出。
  但 `plugin_storage` / `saved_password` 等表里**用 dev 主密钥加密过的密文却被搬了过来**，
  它们用生产主密钥永远解不开。AES-GCM 是认证加密，症状不是乱码而是抛
  `Unsupported state or unable to authenticate data`，一路透传到运维「测试连接」的 ❌ 文案。
  当时只能靠人工逐库比对指纹才定位（详见 docs/db-merge-dev-prod.md 与
  apps/server/src/services/credential-audit.ts）。故本脚本收尾必须自己报一次。
"""
import argparse
import base64
import hashlib
import os
import re
import sqlite3
import sys

DEV_DEFAULT = os.path.join(os.path.expanduser('~'), 'Desktop', 'ai-assistant', 'apps', 'server', 'data.db')
PROD_DEFAULT = os.path.join(os.environ.get('APPDATA', ''), 'yan-zhi', 'server-data', 'data.db')

# 已知读不了且为空 → 直接跳过（避免脚本噪音）
SKIP_TABLES = {'chat_peer'}


def open_dev(path):
    """打开 dev 库并绕过孤儿索引（仅作用于本连接的内存 schema 视图）。"""
    con = sqlite3.connect('file:%s?mode=ro' % path.replace('\\', '/'), uri=True, timeout=15)
    con.execute('PRAGMA writable_schema=ON')
    cur = con.cursor()
    for idx in ('idx_kb_base_user', 'idx_kb_doc_base', 'idx_kb_visibility',
                'sqlite_autoindex_knowledge_doc_1'):
        try:
            cur.execute("DELETE FROM sqlite_master WHERE type='index' AND name=?", (idx,))
        except sqlite3.DatabaseError:
            pass
    return con


def table_names(con):
    cur = con.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    return [r[0] for r in cur.fetchall()]


def table_cols(con, t):
    cur = con.cursor()
    cur.execute('PRAGMA table_info("%s")' % t)
    return [r[1] for r in cur.fetchall()]


def table_sql(con, t):
    cur = con.cursor()
    cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (t,))
    r = cur.fetchone()
    return r[0] if r else None


def read_rows(dv, t, cols):
    """容错读取：整表 SELECT 失败时退化为**逐行**读过（页级损坏下能抢多少是多少）。

    为什么需要：dev 库有页面级损坏，同一张表（实测 skill）有时能整表读、有时报
    `database disk image is malformed`。整表失败不代表全丢 —— 用 rowid 范围逐行取，
    坏页只影响落在该页上的行。
    """
    cur = dv.cursor()
    sel = 'SELECT %s FROM "%s"' % (','.join('"%s"' % c for c in cols), t)
    try:
        cur.execute(sel)
        return cur.fetchall(), None
    except sqlite3.DatabaseError as e:
        first_err = str(e)

    # 逐行抢：以 rowid 递增扫描
    out = []
    try:
        cur.execute('SELECT MIN(rowid), MAX(rowid) FROM "%s"' % t)
        lo, hi = cur.fetchone()
    except sqlite3.DatabaseError:
        return [], '整表与 rowid 范围均不可读: %s' % first_err
    if lo is None:
        return [], first_err
    bad = 0
    for rid in range(lo, (hi or lo) + 1):
        try:
            cur.execute('SELECT %s FROM "%s" WHERE rowid=?' % (','.join('"%s"' % c for c in cols), t), (rid,))
            r = cur.fetchone()
            if r:
                out.append(r)
        except sqlite3.DatabaseError:
            bad += 1
    note = '整表失败已逐行抢回 %d 行（坏 %d 行）: %s' % (len(out), bad, first_err)
    return out, note


# 依赖顺序：被引用的表先插（避免悬空引用；本脚本已关外键，但顺序正确更利于排查）
TABLE_ORDER = [
    'user', 'space', 'platform', 'model', 'agent', 'skill', 'custom_tool',
    'data_source', 'ontology_group', 'ontology', 'mcp_server', 'mcp_tool',
    'plugin_storage', 'plugin', 'remote_marketplace', 'marketplace_config',
    'platform_api_key', 'app_config',
    'conversation', 'message', 'memory', 'memory_dream_log', 'knowledge_chunk',
]


def order_key(t):
    try:
        return (0, TABLE_ORDER.index(t), t)
    except ValueError:
        return (1, 0, t)


# ── 加密凭证收尾自检（2026-10-16）────────────────────────────────────────────
# 只比指纹、不做解密：Python stdlib 没有 AES-GCM，而**也不需要** ——
# 只要「两份库主密钥不同」且「生产库里有加密行」，被搬过来的那些密文就必然解不开。
# 这个判据比试解密更直接，且零依赖。

# 已知存加密凭证的列（与 apps/server/src/services/credential-audit.ts 同集，改一处要改两处）
ENC_COLUMNS = (
    ('saved_password', 'password_enc'),
    ('mcp_credential', 'secret_enc'),
    ('data_source', 'password_enc'),
)

# plugin_storage 里的密文藏在 JSON 里（如 ops-shell 连接的 secretEnc），没有固定列名 → 按形状认：
# 键名以 Enc 结尾、值是三段 base64。按形状认就不会因为改字段名而漏。
ENC_JSON_RE = re.compile(r'"[A-Za-z_]*[Ee]nc"\s*:\s*"[^"]+:[^"]+:[^"]*"')


def master_key_fp(con):
    """主密钥指纹（sha256 前 16 位 hex）；无密钥行或读不了 → None。不打印密钥本身。"""
    try:
        row = con.execute(
            "SELECT value FROM app_config WHERE key='saved_password_master_key'").fetchone()
    except sqlite3.DatabaseError:
        return None
    if not row or not row[0]:
        return None
    try:
        return hashlib.sha256(base64.b64decode(row[0])).hexdigest()[:16]
    except Exception:
        return None


def count_encrypted(con):
    """生产库里仍存活的加密凭证计数 [(位置, 条数)]。读不了的表跳过。"""
    out = []
    for t, c in ENC_COLUMNS:
        try:
            n = con.execute(
                'SELECT COUNT(*) FROM "%s" WHERE "%s" IS NOT NULL AND "%s" <> \'\'' % (t, c, c)
            ).fetchone()[0]
        except sqlite3.DatabaseError:
            continue
        if n:
            out.append(('%s.%s' % (t, c), n))
    try:
        rows = con.execute('SELECT value FROM plugin_storage').fetchall()
    except sqlite3.DatabaseError:
        rows = []
    n = sum(len(ENC_JSON_RE.findall(v)) for (v,) in rows if isinstance(v, str))
    if n:
        out.append(('plugin_storage(JSON)', n))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dev', default=DEV_DEFAULT)
    ap.add_argument('--prod', default=PROD_DEFAULT)
    ap.add_argument('--dry-run', action='store_true', help='只统计不写入')
    args = ap.parse_args()

    for p in (args.dev, args.prod):
        if not os.path.exists(p):
            print('✗ 找不到库:', p); sys.exit(2)
    print('dev 库 :', args.dev)
    print('生产库 :', args.prod)
    print('模式   :', 'DRY-RUN（不写入）' if args.dry_run else '实际写入')
    print('=' * 70)

    dv = open_dev(args.dev)
    pd = sqlite3.connect(args.prod, timeout=30)
    pd.execute('PRAGMA foreign_keys=OFF')

    dev_tabs = sorted(table_names(dv), key=order_key)
    prod_tabs = set(table_names(pd))

    stat = {'created': [], 'inserted': [], 'skipped': [], 'failed': [], 'recovered': []}

    for t in dev_tabs:
        if t in SKIP_TABLES:
            stat['skipped'].append((t, '已知损坏/空表，跳过'))
            continue
        try:
            cols = table_cols(dv, t)
            if not cols:
                continue
            rows, note = read_rows(dv, t, cols)
            if note:
                stat['recovered'].append((t, note))
            if not rows:
                continue
        except sqlite3.DatabaseError as e:
            stat['failed'].append((t, '读取失败: %s' % e))
            continue

        if not rows:
            continue

        if t not in prod_tabs:
            # 生产缺表 → 建表 + 全量插
            ddl = table_sql(dv, t)
            if not ddl:
                stat['failed'].append((t, '缺 DDL')); continue
            if not args.dry_run:
                try:
                    pd.execute(ddl)
                except sqlite3.DatabaseError as e:
                    stat['failed'].append((t, '建表失败: %s' % e)); continue
            stat['created'].append((t, len(rows)))

        # 列交集（生产 schema 可能与 dev 不同）
        pcols = set(table_cols(pd, t))
        use = [c for c in cols if c in pcols]
        if not use:
            stat['failed'].append((t, '无公共列')); continue

        idx = {c: i for i, c in enumerate(cols)}
        payload = [tuple(r[idx[c]] for c in use) for r in rows]
        ph = ','.join('?' * len(use))
        sql = 'INSERT OR IGNORE INTO "%s" (%s) VALUES (%s)' % (
            t, ','.join('"%s"' % c for c in use), ph)

        if args.dry_run:
            stat['inserted'].append((t, len(payload), 'dry-run'))
            continue
        try:
            before = pd.total_changes
            pd.executemany(sql, payload)
            pd.commit()
            added = pd.total_changes - before
            stat['inserted'].append((t, added, '%d 行候选' % len(payload)))
        except sqlite3.DatabaseError as e:
            stat['failed'].append((t, '插入失败: %s' % e))

    print('\n=== 新建表（生产原本没有）===')
    for t, n in stat['created']:
        print('  + %-26s %d 行' % (t, n))
    print('\n=== 插入结果 ===')
    for row in stat['inserted']:
        t, added = row[0], row[1]
        extra = row[2] if len(row) > 2 else ''
        print('  ✓ %-26s 新增 %-6d %s' % (t, added, extra))
    if stat['recovered']:
        print('\n=== 损坏恢复（逐行抢回）===')
        for t, note in stat['recovered']:
            print('  ~ %-26s %s' % (t, note))
    if stat['skipped']:
        print('\n=== 跳过 ===')
        for t, why in stat['skipped']:
            print('  - %-26s %s' % (t, why))
    if stat['failed']:
        print('\n=== 失败 ===')
        for t, why in stat['failed']:
            print('  ✗ %-26s %s' % (t, why))

    print('\n=== 生产库最终计数 ===')
    cur = pd.cursor()
    for t in ('conversation', 'message', 'model', 'platform', 'skill', 'agent', 'ontology'):
        try:
            cur.execute('SELECT COUNT(*) FROM "%s"' % t)
            print('  %-16s %d' % (t, cur.fetchone()[0]))
        except sqlite3.DatabaseError:
            pass

    # ── 加密凭证自检（★ 新增 2026-10-16，见文件头「为什么第 4 步必须做」）──
    print('\n=== 加密凭证自检 ===')
    dev_fp, prod_fp = master_key_fp(dv), master_key_fp(pd)
    print('  dev 主密钥指纹  : %s' % (dev_fp or '（无密钥行）'))
    print('  生产主密钥指纹  : %s' % (prod_fp or '（无密钥行）'))
    enc = count_encrypted(pd)
    if enc:
        for where, n in enc:
            print('  生产库加密凭证  : %-26s %d 条' % (where, n))
    else:
        print('  生产库加密凭证  : 无')
    if dev_fp and prod_fp and dev_fp == prod_fp:
        print('  ✓ 两份库主密钥一致，不存在「跨库密文解不开」的风险。')
    elif dev_fp and prod_fp and enc:
        print()
        print('  ⚠️  两份库主密钥**不同**，且生产库存在加密凭证。')
        print('     若上面「插入结果」里含 saved_password / mcp_credential / data_source / plugin_storage，')
        print('     则**由 dev 带入的密文用生产主密钥永远解不开**（app_config 的密钥行被')
        print('     INSERT OR IGNORE 跳过了）。症状：运维「测试连接」报')
        print('     Unsupported state or unable to authenticate data。')
        print('     只能在应用里逐个重新填写这些凭证；启动时的 credential-audit 自检也会报同一件事。')

    dv.close(); pd.close()


if __name__ == '__main__':
    main()
