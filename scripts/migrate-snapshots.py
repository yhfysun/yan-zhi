"""存量提示词快照迁移（2026-10-12 P2）—— 老格式 → “内容哈希引用”去重格式。

★ 按 `message.rowid` 分批游标推进 + 进度落盘（<db>.migprogress）：
  每行只读一次、每批提交，可被任意中断后续跑（不受单次命令时长限制）。
★ 哈希与 Node 侧 `internSnapshotBlob` 逐字一致：
  sha1( (kind + '\u0000' + content).encode('utf-8') ).hexdigest()

用法：
  python migrate-snapshots.py <db> --apply     # 迁移（分批，可反复跑直到 progress 跑完）
  python migrate-snapshots.py <db> --vacuum    # 迁移完成后回收文件空间
"""
import sqlite3, sys, os, json, hashlib, time

DB = sys.argv[1]
APPLY = '--apply' in sys.argv
VACUUM = '--vacuum' in sys.argv
INLINE_MAX, BATCH = 400, 300
PROG = DB + '.migprogress'

def blob_hash(kind, content):
    return hashlib.sha1((kind + '\u0000' + content).encode('utf-8')).hexdigest()

con = sqlite3.connect(DB, timeout=30)
cur = con.cursor()

if VACUUM:
    print('[vacuum] checkpoint + VACUUM …', flush=True)
    cur.execute('PRAGMA wal_checkpoint(TRUNCATE)'); cur.execute('VACUUM'); cur.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    con.close(); print(f'[vacuum] done. data.db = {os.path.getsize(DB)/1048576:.1f} MB'); sys.exit(0)

now_ms = int(time.time() * 1000)
con.execute('PRAGMA journal_mode=WAL')
cur.execute("""CREATE TABLE IF NOT EXISTS snapshot_blob (
    hash TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)""")

start = int(open(PROG).read().strip()) if os.path.exists(PROG) else 0
seen = set()
def intern(kind, content):
    h = blob_hash(kind, content)
    if h not in seen:
        cur.execute("INSERT OR IGNORE INTO snapshot_blob VALUES (?,?,?,?)", (h, kind, content, now_ms)); seen.add(h)
    return h

t0 = time.time()
while True:
    if time.time() - t0 > 150:           # 留足时间给本批收尾，避免被外部超时打断在半途
        print(f'[pause] 本段到时间，rowid 进度已存 {start}。再跑一次自动续。', flush=True); break
    rows = cur.execute(
        "SELECT rowid, id, system_prompt_snapshot FROM message "
        "WHERE system_prompt_snapshot IS NOT NULL AND rowid > ? ORDER BY rowid LIMIT ?", (start, BATCH)).fetchall()
    if not rows:
        print('[done] 迁移完成。', flush=True); break
    batch = []; n_changed = 0
    for rid, mid, raw in rows:
        try: o = json.loads(raw)
        except Exception: continue
        if not isinstance(o, dict) or not isinstance(o.get('messages'), list): continue
        changed = False
        if isinstance(o.get('tools'), list) and 'toolsRef' not in o:
            o['toolsRef'] = intern('tools', json.dumps(o['tools'], ensure_ascii=False)); del o['tools']; changed = True
        sys_ok = False
        for m in o['messages']:
            if not isinstance(m, dict) or 'id' in m: continue
            if m.get('role') == 'system' and (m.get('content') or m.get('contentRef')): sys_ok = True
            c = m.get('content')
            if isinstance(c, str) and len(c) > INLINE_MAX and 'contentRef' not in m:
                m['contentRef'] = intern('msg', c); del m['content']; changed = True
        if isinstance(o.get('systemPrompt'), str) and o['systemPrompt'] and sys_ok:
            o['systemPrompt'] = ''; o['systemPromptOmitted'] = True; changed = True
        if changed: batch.append((json.dumps(o, ensure_ascii=False), mid)); n_changed += 1
    if batch:
        cur.executemany("UPDATE message SET system_prompt_snapshot = ? WHERE id = ?", batch)
    start = rows[-1][0]
    con.commit()
    open(PROG, 'w').write(str(start))
    print(f'rowid≤{start}  本批 {len(rows)} 行(重写 {n_changed})', flush=True)

b = cur.execute("SELECT COUNT(*) FROM message WHERE system_prompt_snapshot IS NOT NULL").fetchone()[0]
mb = cur.execute("SELECT COALESCE(SUM(LENGTH(system_prompt_snapshot)),0) FROM message WHERE system_prompt_snapshot IS NOT NULL").fetchone()[0]/1048576
nb = cur.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(content)),0) FROM snapshot_blob").fetchone()
print(f'[state] 快照 {b} 条 / {mb:.1f} MB ; blob {nb[0]} 行 / {nb[1]/1048576:.2f} MB ; progress={start}', flush=True)
con.close()
