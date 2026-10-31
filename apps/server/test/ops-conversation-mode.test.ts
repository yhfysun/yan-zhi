/**
 * 存量修正守门：运维助手会话的模式归属（2026-10-21）。
 *
 * 实据（用户本机 data.db 只读查询）：
 *   `SELECT mode, count(*) FROM conversation WHERE agent_id='a_builtin_ops_agent'`
 *   → [{"m":"office","n":2}]  —— 全部落在 office。
 *
 * 后果：运维任务列表按 activeMode='ops' 过滤 → 历史运维任务「发完就没了，列表也看不到」。
 * 修正两处，本测试把两处都钉住：
 *   ① 新建会话显式带 mode:'ops'（前后端各一处断言）；
 *   ② 存量行在启动时一次性归位（只改 mode，可重复执行）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..', 'src');
const dbSrc = readFileSync(resolve(SERVER_SRC, 'db.ts'), 'utf8');
const routeSrc = readFileSync(resolve(SERVER_SRC, 'routes/conversations.ts'), 'utf8');

describe('存量运维会话归位', () => {
  it('db.ts 有一次性迁移：ops 助手的会话 mode 收敛为 ops', () => {
    expect(dbSrc, '★ 缺存量迁移，用户升级后历史运维任务仍在 office 里查不到')
      .toMatch(/UPDATE conversation SET mode = 'ops' WHERE agent_id = 'a_builtin_ops_agent'/);
  });

  it('迁移是幂等的（已正确的行零写入）', () => {
    const idx = dbSrc.indexOf("UPDATE conversation SET mode = 'ops' WHERE agent_id = 'a_builtin_ops_agent'");
    const stmt = dbSrc.slice(idx, idx + 260);
    // 条件里排除已经是 ops 的行，否则每次启动都会刷一遍 updated_at（排序会乱）
    expect(stmt).toMatch(/<> 'ops'|!= 'ops'/);
  });

  it('迁移失败不阻断启动', () => {
    const idx = dbSrc.indexOf("UPDATE conversation SET mode = 'ops' WHERE agent_id = 'a_builtin_ops_agent'");
    const around = dbSrc.slice(Math.max(0, idx - 400), idx + 400);
    expect(around).toMatch(/catch\s*\{/);
  });

  it('迁移只改 mode，不动标题/消息/绑定', () => {
    const idx = dbSrc.indexOf("UPDATE conversation SET mode = 'ops' WHERE agent_id = 'a_builtin_ops_agent'");
    const stmt = dbSrc.slice(idx, idx + 200);
    expect(stmt).not.toMatch(/title|deleted_at|archived_at|release_project_id/);
  });
});

describe('新建会话的模式由调用方显式声明', () => {
  it("后端默认值：不传 mode 落 'office'（前端必须自己传）", () => {
    // 2026-10-31 同步：合法判定收敛到 isValidMode()（内置白名单 ∪ 运行时插件模式），
    //   默认回落仍是 'office'。
    expect(routeSrc).toMatch(/isValidMode\(String\(mode\)\)\s*\?\s*String\(mode\)\s*:\s*'office'/);
  });

  it("'ops' 在合法 mode 白名单里（否则传了也会被降级成 office）", () => {
    const m = routeSrc.match(/VALID_MODES = new Set\(\[([^\]]*)\]\)/);
    expect(m, '★ 找不到 VALID_MODES 白名单').toBeTruthy();
    expect(m![1]).toContain("'ops'");
  });
});
