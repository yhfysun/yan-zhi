"""system_prompt_snapshot 瘦身：把每个会话的快照裁到最近 KEEP 条（与 pruneOldSnapshots 同 SQL 口径）。

默认只读预演（dry-run）；加 --apply 才真正执行 UPDATE。
★ 执行前请先停掉 yan-zhi（dev/安装版），否则与应用并发写同一库有风险。
★ --apply 之后建议 VACUUM 真正回收磁盘（见文末提示）。
"""
import sqlite3, sys

db = sys.argv[1]
apply = '--apply' in sys.argv
KEEP = 200  # 与 apps/server/src/services/context-snapshot.ts 的 SNAPSHOT_KEEP_PER_CONV 对齐

con = sqlite3.connect(db) if apply else sqlite3.connect('file:' + db + '?mode=ro&immutable=1', uri=True)
cur = con.cursor()

cur.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(system_prompt_snapshot)),0) FROM message WHERE system_prompt_snapshot IS NOT NULL")
n0, b0 = cur.fetchone()
print(f"当前: {n0} 条有快照, {b0/1048576:.1f} MB")
print(f"模式: {'APPLY（真实执行）' if apply else 'DRY-RUN（只读预演）'}\n")

convs = cur.execute("""SELECT conversation_id, COUNT(*)
                       FROM message WHERE system_prompt_snapshot IS NOT NULL
                       GROUP BY conversation_id HAVING COUNT(*) > ? ORDER BY 2 DESC""", (KEEP,)).fetchall()
print(f"超过 {KEEP} 条的会话: {len(convs)} 个")

SQL = """UPDATE message SET system_prompt_snapshot = NULL
         WHERE conversation_id = ? AND system_prompt_snapshot IS NOT NULL
           AND id NOT IN (SELECT id FROM message WHERE conversation_id = ? AND system_prompt_snapshot IS NOT NULL
                          ORDER BY created_at DESC LIMIT ?)"""

tot_rows = tot_bytes = 0
for cid, c in convs:
    # 预演：算出将被清空的那些行的字节数
    lost = cur.execute("""SELECT COALESCE(SUM(LENGTH(system_prompt_snapshot)),0) FROM message
                          WHERE conversation_id = ? AND system_prompt_snapshot IS NOT NULL
                            AND id NOT IN (SELECT id FROM message WHERE conversation_id = ? AND system_prompt_snapshot IS NOT NULL
                                           ORDER BY created_at DESC LIMIT ?)""", (cid, cid, KEEP)).fetchone()[0]
    tot_rows += c - KEEP; tot_bytes += lost
    print(f"  {cid[:8]}  {c:4d} → {KEEP}  省 {(lost or 0)/1048576:6.1f} MB")
    if apply:
        cur.execute(SQL, (cid, cid, KEEP))

print(f"\n合计可清: 约 {tot_rows} 条, {tot_bytes/1048576:.1f} MB（文件层还要 VACUUM 才真正回收）")
if apply:
    con.commit()
    print("已提交。请停掉应用后执行:  VACUUM;  （或用 sqlite3 CLI: sqlite3 data.db 'VACUUM;'）")
else:
    print("（这是预演，未改动数据库。确认无误后加 --apply 执行。）")
con.close()
