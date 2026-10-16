// 浏览器「页面指令」CRUD（2026-10-16 · 页面内对话与页面指令方案 §5，P1）
//
// 定位：一条指令 = 站点匹配 + 一段"任务描述"，命中后由页面内对话面板一键发出
//   （执行通道就是 POST /llm/tasks，与手输一条消息完全同源，不新造执行面）。
//
// ★ 只做 kind='task'：脚本型（kind='script'）在 P2，默认权限口径（每次确认 / 导入来源强制确认 /
//   审计留痕）没拍板前，**服务端直接拒绝写入** —— 权限闸门必须在执行侧，不能只靠 UI 不给入口。
//
// ★ 本模块加载时自己建表 + 灌内置种子：服务端不跑 initSchema（schema 一直是客户端启动时建的），
//   若这张表只靠客户端建，纯服务端部署下就是"接口 500、且只在真机上暴露"。
//   DDL 与种子文本都取自 @yan-zhi/core（单一来源，避免两处各写一份 DDL 的经典漂移）。

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  PAGE_COMMAND_DDL, PAGE_COMMAND_RUN_DDL, sanitizeImportedCommands, seedBuiltinPageCommands, toExportPayload,
} from '@yan-zhi/core';

const router = Router();
router.use(authMiddleware);

// 建表 + 内置种子（幂等；失败只告警不炸服务：面板会显示"暂无匹配指令"，不会静默做错事）
try {
  db.exec(PAGE_COMMAND_DDL);
  db.exec(PAGE_COMMAND_RUN_DDL);   // P2：脚本执行审计表
  void seedBuiltinPageCommands((sql: string, params?: any[]) => {
    db.prepare(sql).run(...((params || []) as any[]));
    return Promise.resolve();
  });
} catch (e) {
  console.warn('[page-commands] 建表/内置种子失败（指令功能将为空）:', e);
}

const MAX_NAME = 60;
const MAX_DESC = 200;
const MAX_TASK_BODY = 4000;     // 任务描述上限
const MAX_SCRIPT_BODY = 64000;  // 脚本上限：与 browser_run_script 同口径（超了那边也会拒）
const MAX_URL_PATTERN = 200;

/** 可见范围：内置（user_id IS NULL）+ 自己建的。P1 不做团队共享（方案 §P3）。 */
function visibleRows(uid: string) {
  return db.prepare(
    `SELECT * FROM browser_page_command
      WHERE user_id IS NULL OR user_id = ?
      ORDER BY (match_host = '*') ASC, created_at ASC`,
  ).all(uid) as any[];
}

/** 站点匹配串归一：'*' / 'example.com' / '*.example.com'（大小写不敏感；端口不写进来） */
function normalizeHost(raw: unknown): string {
  const h = String(raw ?? '*').trim().toLowerCase();
  return h || '*';
}

function isValidHost(h: string): boolean {
  if (h === '*') return true;
  return /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h);
}

/** 校验并归一「新建/编辑」入参；返回 error 时消息可直接给用户看 */
function normalizeInput(input: any): {
  error?: string;
  data?: {
    name: string; description: string | null; kind: 'task' | 'script'; body: string;
    match_host: string; match_url: string | null;
    /** 0 = 执行前不再确认（"信任此指令"）；仅当显式传 trust:true 时才会是 0 */
    need_confirm: number;
  };
} {
  const name = String(input?.name ?? '').trim();
  if (!name) return { error: '指令名称必填' };
  if (name.length > MAX_NAME) return { error: `指令名称最多 ${MAX_NAME} 个字符` };

  const kind = String(input?.kind ?? 'task').trim() || 'task';
  if (kind !== 'task' && kind !== 'script') return { error: `未知的指令类型：${kind}` };

  const bodyLimit = kind === 'script' ? MAX_SCRIPT_BODY : MAX_TASK_BODY;
  const text = String(input?.body ?? '').trim();
  if (!text) return { error: kind === 'script' ? '脚本内容必填' : '指令内容必填（要 AI 在这一页做什么）' };
  if (text.length > bodyLimit) return { error: `内容最多 ${bodyLimit} 个字符` };

  // ★ 免确认（"信任此指令"）的判据必须**显式**：只有传了 trust:true 才认 ——
  //   默认（不传 / 传 need_confirm:0 但没传 trust）一律 1，即"每次执行都要确认"（用户拍板口径）。
  //   另一条线上约束在 handler：内置/非本人指令走的是"只允许改 enabled"的分支，
  //   根本没有机会把 need_confirm 改成 0（内置脚本内容随版本更新，信任的应是当时那段脚本）。
  const needConfirm = kind === 'script' && input?.trust === true ? 0 : 1;

  const description = input?.description === undefined || input?.description === null
    ? null : String(input.description).trim().slice(0, MAX_DESC);

  const matchHost = normalizeHost(input?.match_host);
  if (!isValidHost(matchHost)) {
    return { error: `站点匹配不合法：${matchHost}（只支持 * 或域名/子域通配，如 *.fanqieopen.com）` };
  }

  let matchUrl: string | null = null;
  const rawPattern = input?.match_url === undefined || input?.match_url === null ? '' : String(input.match_url).trim();
  if (rawPattern) {
    if (rawPattern.length > MAX_URL_PATTERN) return { error: `URL 正则最多 ${MAX_URL_PATTERN} 个字符` };
    try { new RegExp(rawPattern); } catch (e: any) {
      return { error: `URL 正则不合法：${e?.message || e}` };
    }
    matchUrl = rawPattern;
  }

  return {
    data: {
      name, description, kind: kind as 'task' | 'script', body: text,
      match_host: matchHost, match_url: matchUrl, need_confirm: needConfirm,
    },
  };
}

// GET /api/page-commands —— 内置 + 自己建的（站点专属在前、全局在后，UI 直接用）
router.get('/', (req: Request, res: Response) => {
  try {
    res.json({ data: visibleRows(req.user!.userId) });
  } catch (e: any) {
    // 表缺失/库异常也返回空列表 + 原因：面板据此提示"指令库不可用"，而不是把整个面板搞崩
    console.warn('[page-commands] 读取失败:', e);
    res.json({ data: [], warning: `指令库读取失败：${e?.message || e}` });
  }
});

// POST /api/page-commands —— 新建（用户自己的）
router.post('/', (req: Request, res: Response) => {
  const v = normalizeInput(req.body);
  if (!v.data) { res.status(400).json({ error: v.error || '参数不合法' }); return; }
  const uid = req.user!.userId;
  const id = `pc_${uuid()}`;
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO browser_page_command
         (id, user_id, name, description, kind, body, match_host, match_url, source,
          enabled, need_confirm, run_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', 1, ?, 0, ?, ?)`,
    ).run(id, uid, v.data.name, v.data.description, v.data.kind, v.data.body,
          v.data.match_host, v.data.match_url, v.data.need_confirm, now, now);
    res.json({ data: db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(id) });
  } catch (e: any) {
    res.status(500).json({ error: `新建指令失败：${e?.message || e}` });
  }
});

// PATCH /api/page-commands/:id —— 编辑；内置指令只允许改 enabled（停用/启用）
router.patch('/:id', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const row = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: '指令不存在' }); return; }
  const isBuiltin = row.user_id === null || row.user_id === undefined;
  if (!isBuiltin && row.user_id !== uid) { res.status(403).json({ error: '无权修改该指令' }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body?.enabled !== undefined) { sets.push('enabled = ?'); vals.push(req.body.enabled ? 1 : 0); }

  if (!isBuiltin) {
    // 内置指令的内容以代码种子为准（改了也会被下次启动的 upsert 覆盖回内置定义），故不允许改内容
    const v = normalizeInput({ ...row, ...req.body });
    if (!v.data) { res.status(400).json({ error: v.error || '参数不合法' }); return; }
    sets.push('name = ?', 'description = ?', 'kind = ?', 'body = ?', 'match_host = ?', 'match_url = ?', 'need_confirm = ?');
    vals.push(v.data.name, v.data.description, v.data.kind, v.data.body,
              v.data.match_host, v.data.match_url, v.data.need_confirm);
  }
  if (!sets.length) { res.status(400).json({ error: '没有可更新的字段' }); return; }

  sets.push('updated_at = ?');
  vals.push(Date.now(), req.params.id);
  db.prepare(`UPDATE browser_page_command SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ data: db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(req.params.id) });
});

// DELETE /api/page-commands/:id —— 只能删自己建的；内置指令请用 enabled 停用
router.delete('/:id', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const row = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: '指令不存在' }); return; }
  if (row.user_id === null || row.user_id === undefined) {
    res.status(400).json({ error: '内置指令不能删除，可停用（关掉开关）' });
    return;
  }
  if (row.user_id !== uid) { res.status(403).json({ error: '无权删除该指令' }); return; }
  db.prepare('DELETE FROM browser_page_command WHERE id = ?').run(req.params.id);
  res.json({ data: { deleted: req.params.id } });
});

// POST /api/page-commands/:id/used —— 使用计数（P3 的成功率 / 最近使用排序用）
router.post('/:id/used', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const row = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: '指令不存在' }); return; }
  if (row.user_id !== null && row.user_id !== undefined && row.user_id !== uid) {
    res.status(403).json({ error: '无权使用该指令' });
    return;
  }
  db.prepare('UPDATE browser_page_command SET run_count = run_count + 1, last_used_at = ? WHERE id = ?')
    .run(Date.now(), req.params.id);
  res.json({ data: { ok: true } });
});

// ── 脚本执行审计（P2 · 方案 §5.4 硬约束③）──────────────────────────────────────
// 脚本在**页面主世界**执行，能读到登录态/表单值/页面正文 —— 这些**一律不落库**。
// 这里只记元信息：什么时候、哪条指令、哪个页、成没成、耗时、结果多大（摘要）。
// UI 在脚本跑完后调一次；写不进库也不影响用户拿结果（审计不该阻断执行）。
router.post('/:id/runs', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const row = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: '指令不存在' }); return; }
  if (row.user_id !== null && row.user_id !== undefined && row.user_id !== uid) {
    res.status(403).json({ error: '无权记录该指令的执行' });
    return;
  }
  const body = req.body || {};
  const startedAt = Number(body.started_at) || Date.now();
  const endedAt = Number(body.ended_at) || Date.now();
  const status = ['ok', 'error', 'aborted'].includes(String(body.status)) ? String(body.status) : 'ok';
  try {
    db.prepare(
      `INSERT INTO browser_command_run
         (id, command_id, command_name, command_kind, user_id, tab_id, url, host,
          started_at, ended_at, duration_ms, status, result_digest, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `run_${uuid()}`, row.id, row.name, row.kind || 'script', uid,
      String(body.tab_id || '') || null, String(body.url || '') || null, String(body.host || '') || null,
      startedAt, endedAt, Math.max(0, endedAt - startedAt), status,
      String(body.result_digest || '') || null, String(body.error || '') || null,
    );
    res.json({ data: { ok: true } });
  } catch (e: any) {
    // 审计失败不抛给用户（脚本结果才是他要的），但服务端日志要留痕
    console.warn('[page-commands] 审计写入失败:', e);
    res.status(500).json({ error: `审计写入失败：${e?.message || e}` });
  }
});

// GET /api/page-commands/runs?commandId=&limit= —— 执行记录（UI 的「执行记录」面板）
router.get('/runs', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
  const cmdId = String(req.query.commandId || '').trim();
  try {
    const rows = cmdId
      ? db.prepare('SELECT * FROM browser_command_run WHERE command_id = ? ORDER BY started_at DESC LIMIT ?').all(cmdId, limit)
      : db.prepare('SELECT * FROM browser_command_run WHERE user_id = ? ORDER BY started_at DESC LIMIT ?').all(uid, limit);
    res.json({ data: rows });
  } catch (e: any) {
    res.json({ data: [], warning: `执行记录读取失败：${e?.message || e}` });
  }
});

// ── 导入 / 导出（P3-2）────────────────────────────────────────────────────────
// 导出：只导**自己建的**指令（内置随版本走，导出副本只会造成"改了不生效"）；
//   只带可移植字段（无 id / 归属 / 统计 / need_confirm），便于分享给同事。
router.get('/export', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  try {
    const rows = db.prepare('SELECT * FROM browser_page_command WHERE user_id = ? ORDER BY created_at ASC').all(uid);
    res.json({ data: toExportPayload(rows as any[]) });
  } catch (e: any) {
    res.status(500).json({ error: `导出失败：${e?.message || e}` });
  }
});

// 导入：**外部数据入口**。逐条校验（坏条目跳过并回报原因，不整份拒绝）；
//   ★ 导入的脚本一律 `need_confirm=1` —— 由 core 的 sanitizeImportedCommands 保证，
//     这里 INSERT 也硬写 1（双保险）：别人给的文件不能把 P2 的双层门控绕掉。
router.post('/import', (req: Request, res: Response) => {
  const uid = req.user!.userId;
  const result = sanitizeImportedCommands(req.body);
  const now = Date.now();
  let imported = 0;
  for (const c of result.commands) {
    try {
      db.prepare(
        `INSERT INTO browser_page_command
           (id, user_id, name, description, kind, body, match_host, match_url, source,
            enabled, need_confirm, run_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', 1, 1, 0, ?, ?)`,
      ).run(`pc_${uuid()}`, uid, c.name, c.description, c.kind, c.body, c.match_host, c.match_url, now, now);
      imported += 1;
    } catch (e: any) {
      result.skipped.push({ name: c.name, reason: `写入失败：${e?.message || e}` });
    }
  }
  res.json({ data: { imported, skipped: result.skipped } });
});

export default router;
