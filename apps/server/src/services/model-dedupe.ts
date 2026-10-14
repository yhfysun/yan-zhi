// model 表去重（启动自愈，独立模块以便单测——不自动开库，由调用方注入 db）。
//
// ★ 2026-10-14：跨库合并在 2026-10-11 用 `INSERT OR IGNORE`（**只按主键 id 去重**），而同一平台的
//   模型存在**多种 id 形态**（旧拼写前缀 `agnes-<mid>` / 新前缀 `agens-<mid>` / 迁移带进来的 uuid），
//   id 各异 → 全部照插 ⇒ 实测 `agens-guest` 下 12 个 model_id 各两份。服务端 model 表没有
//   UNIQUE(platform_id, model_id)，SQLite 无从拦截。此处启动时去重，并补唯一索引防复发。
import type { YzSqliteDb } from './sqlite-driver.js';

/**
 * 同一 (platform_id, model_id) 出现多行时只保留一条，其余删除并把引用重指过去。
 * 保留口径：优先确定性 id `${platformId}-${modelId}`，否则取最早创建（created_at 升序）。
 * 幂等（无重复即空跑）。返回删除的重复行数。
 */
export function dedupeDuplicateModelRows(database: YzSqliteDb): number {
  let removed = 0;
  try {
    const groups = database
      .prepare('SELECT platform_id, model_id, COUNT(*) n FROM model GROUP BY platform_id, model_id HAVING n > 1')
      .all() as { platform_id: string; model_id: string; n: number }[];
    if (!groups.length) return 0;

    const pickKeep = database.prepare(
      `SELECT id FROM model WHERE platform_id = ? AND model_id = ?
       ORDER BY (id = ?) DESC, created_at ASC, id ASC LIMIT 1`,
    );
    const listDups = database.prepare(
      'SELECT id FROM model WHERE platform_id = ? AND model_id = ? AND id != ?',
    );
    // 引用模型的行分散在多张表（scheduled_task.model_id 是后续 ALTER 补的列）——
    // 逐表 prepare，缺表/缺列则跳过，避免一处不存在把整个去重拖垮。
    const repoints: { run: (keepId: string, dupId: string) => unknown }[] = [];
    for (const t of ['conversation', 'agent', 'task_plan_item', 'scheduled_task']) {
      try { repoints.push(database.prepare(`UPDATE ${t} SET model_id = ? WHERE model_id = ?`) as never); }
      catch { /* 表/列不存在 → 跳过 */ }
    }
    const delModel = database.prepare('DELETE FROM model WHERE id = ?');

    database.transaction(() => {
      for (const g of groups) {
        const canonical = `${g.platform_id}-${g.model_id}`;
        const keep = pickKeep.get(g.platform_id, g.model_id, canonical) as { id: string } | undefined;
        if (!keep) continue;
        const dups = listDups.all(g.platform_id, g.model_id, keep.id) as { id: string }[];
        for (const d of dups) {
          for (const rp of repoints) { try { rp.run(keep.id, d.id); } catch { /* 忽略单表失败 */ } }
          delModel.run(d.id);
          removed++;
        }
      }
    })();
  } catch (e) {
    console.warn('[model-dedupe] dedupeDuplicateModelRows 失败（忽略，不阻断启动）:', (e as Error)?.message || e);
  }
  return removed;
}

/** 补 (platform_id, model_id) 唯一索引防复发。必须在去重之后调用：库里仍有重复时建索引会被静默吞掉。 */
export function ensureModelDedupeIndex(database: YzSqliteDb): void {
  try {
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_model_platform_model ON model(platform_id, model_id)');
  } catch (e) {
    console.warn('[model-dedupe] 建立唯一索引失败（库内可能仍有重复行）:', (e as Error)?.message || e);
  }
}