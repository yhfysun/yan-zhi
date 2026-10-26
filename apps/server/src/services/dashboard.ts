// 看板存取服务（数据查询 P1）
//
// 看板 = 标题 + 若干 widget；widget 只存取数契约/图表定义/网格位置，不存行数据。
// 所有查询强制 user_id 过滤：看板是「我的」，不做共享。
import crypto from 'node:crypto';
import { db } from '../db.js';
import type { Dashboard, DashboardWidget, DashboardWidgetKind } from '@yan-zhi/shared';

export const MAX_DASH_WIDGETS = 40;
const MAX_TITLE = 100;
const KINDS = new Set<DashboardWidgetKind>(['chart', 'table', 'metric', 'text', 'infographic']);

interface DashRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

interface WidgetRow {
  id: string;
  dashboard_id: string;
  widget_json: string;
  sort_order: number;
}

function toDashboard(row: DashRow): Dashboard {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanTitle(raw: unknown): string {
  const title = String(raw ?? '').trim();
  if (!title) throw new Error('看板标题不能为空');
  if (title.length > MAX_TITLE) throw new Error(`看板标题不能超过 ${MAX_TITLE} 字`);
  return title;
}

function assertPos(pos: unknown): asserts pos is DashboardWidget['pos'] {
  const p = pos as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') throw new Error('widget 缺少 pos');
  const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w) && Number.isFinite(p.h)
    && Number(p.x) >= 0 && Number(p.y) >= 0 && Number(p.w) >= 1 && Number(p.w) <= 12 && Number(p.h) >= 1;
  if (!ok) throw new Error('widget pos 非法：x/y ≥ 0，1 ≤ w ≤ 12，h ≥ 1');
}

/** 校验并规整一个 widget（id 缺省时生成；kind/pos 必填） */
export function normalizeWidget(raw: unknown): DashboardWidget {
  if (!raw || typeof raw !== 'object') throw new Error('widget 必须是对象');
  const w = raw as Record<string, unknown>;
  const kind = w.kind as DashboardWidgetKind;
  if (!KINDS.has(kind)) throw new Error(`widget kind 非法：${String(w.kind)}`);
  assertPos(w.pos);
  if (kind === 'chart') {
    const spec = w.spec as Record<string, unknown> | undefined;
    if (!spec || typeof spec.dim !== 'string' || typeof spec.measure !== 'string') {
      throw new Error('chart widget 需要 spec.dim 与 spec.measure');
    }
  }
  if (kind === 'infographic' && (typeof w.syntax !== 'string' || !w.syntax.trim())) {
    throw new Error('infographic widget 缺少 syntax');
  }
  const id = typeof w.id === 'string' && w.id.trim() ? w.id.trim() : `dw_${crypto.randomUUID()}`;
  return {
    id,
    kind,
    ...(typeof w.title === 'string' && w.title.trim() ? { title: w.title.trim() } : {}),
    ...(w.contract && typeof w.contract === 'object' ? { contract: w.contract as DashboardWidget['contract'] } : {}),
    ...(w.spec && typeof w.spec === 'object' ? { spec: w.spec as Record<string, unknown> } : {}),
    ...(typeof w.syntax === 'string' ? { syntax: w.syntax } : {}),
    ...(typeof w.text === 'string' ? { text: w.text } : {}),
    ...(Array.isArray(w.metrics) ? { metrics: w.metrics as DashboardWidget['metrics'] } : {}),
    pos: w.pos as DashboardWidget['pos'],
  };
}

function ownDashboard(userId: string, id: string): DashRow {
  const row = db
    .prepare('SELECT * FROM dashboard WHERE id = ? AND user_id = ?')
    .get(id, userId) as DashRow | undefined;
  if (!row) throw new Error('看板不存在或无权访问');
  return row;
}

function touch(dashboardId: string): void {
  db.prepare('UPDATE dashboard SET updated_at = ? WHERE id = ?').run(Date.now(), dashboardId);
}

export function listDashboards(userId: string): Array<Dashboard & { widgetCount: number }> {
  const rows = db
    .prepare('SELECT * FROM dashboard WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as DashRow[];
  const counts = db
    .prepare('SELECT dashboard_id, COUNT(*) AS n FROM dashboard_widget WHERE user_id = ? GROUP BY dashboard_id')
    .all(userId) as Array<{ dashboard_id: string; n: number }>;
  const map = new Map(counts.map((c) => [c.dashboard_id, c.n]));
  return rows.map((r) => ({ ...toDashboard(r), widgetCount: map.get(r.id) || 0 }));
}

export function getDashboard(userId: string, id: string): Dashboard {
  const row = ownDashboard(userId, id);
  const widgets = db
    .prepare('SELECT * FROM dashboard_widget WHERE dashboard_id = ? AND user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(id, userId) as WidgetRow[];
  return {
    ...toDashboard(row),
    widgets: widgets.map((w) => {
      try {
        return JSON.parse(w.widget_json) as DashboardWidget;
      } catch {
        return null;
      }
    }).filter((w): w is DashboardWidget => !!w),
  };
}

export function createDashboard(
  userId: string,
  input: { title?: unknown; description?: unknown },
): Dashboard {
  const now = Date.now();
  const id = `dash_${crypto.randomUUID()}`;
  const title = cleanTitle(input?.title);
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  db.prepare(
    'INSERT INTO dashboard (id, user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, title, description || null, now, now);
  return { id, title, description: description || undefined, createdAt: now, updatedAt: now, widgets: [] };
}

export function updateDashboard(
  userId: string,
  id: string,
  patch: { title?: unknown; description?: unknown },
): Dashboard {
  ownDashboard(userId, id);
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  if (patch?.title !== undefined) {
    sets.push('title = ?');
    vals.push(cleanTitle(patch.title));
  }
  if (patch?.description !== undefined) {
    const desc = String(patch.description ?? '').trim();
    sets.push('description = ?');
    vals.push(desc || null);
  }
  if (!sets.length) return getDashboard(userId, id);
  sets.push('updated_at = ?');
  vals.push(Date.now(), id);
  db.prepare(`UPDATE dashboard SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getDashboard(userId, id);
}

export function deleteDashboard(userId: string, id: string): void {
  ownDashboard(userId, id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dashboard_widget WHERE dashboard_id = ? AND user_id = ?').run(id, userId);
    db.prepare('DELETE FROM dashboard WHERE id = ? AND user_id = ?').run(id, userId);
  });
  tx();
}

/** 新增或更新单个 widget（按 widget.id 幂等） */
export function saveWidget(userId: string, dashboardId: string, raw: unknown): Dashboard {
  ownDashboard(userId, dashboardId);
  let widget = normalizeWidget(raw);
  // widget.id 是全局主键：同一份 .ydash 钉进第二个看板时 id 会撞，
  // 换发新 id 而不是覆盖别的看板里的组件。
  const owner = db
    .prepare('SELECT dashboard_id FROM dashboard_widget WHERE id = ?')
    .get(widget.id) as { dashboard_id: string } | undefined;
  if (owner && owner.dashboard_id !== dashboardId) {
    widget = { ...widget, id: `dw_${crypto.randomUUID()}` };
  }
  const now = Date.now();
  const exists = db
    .prepare('SELECT id FROM dashboard_widget WHERE id = ? AND dashboard_id = ? AND user_id = ?')
    .get(widget.id, dashboardId, userId) as { id: string } | undefined;

  if (exists) {
    db.prepare(
      'UPDATE dashboard_widget SET kind = ?, title = ?, widget_json = ?, updated_at = ? WHERE id = ? AND dashboard_id = ? AND user_id = ?',
    ).run(widget.kind, widget.title || null, JSON.stringify(widget), now, widget.id, dashboardId, userId);
  } else {
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM dashboard_widget WHERE dashboard_id = ? AND user_id = ?')
      .get(dashboardId, userId) as { n: number };
    if (count.n >= MAX_DASH_WIDGETS) throw new Error(`单个看板最多 ${MAX_DASH_WIDGETS} 个 widget`);
    const nextOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM dashboard_widget WHERE dashboard_id = ? AND user_id = ?')
      .get(dashboardId, userId) as { n: number };
    db.prepare(
      'INSERT INTO dashboard_widget (id, dashboard_id, user_id, kind, title, widget_json, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(widget.id, dashboardId, userId, widget.kind, widget.title || null, JSON.stringify(widget), nextOrder.n, now, now);
  }
  touch(dashboardId);
  return getDashboard(userId, dashboardId);
}

export function deleteWidget(userId: string, dashboardId: string, widgetId: string): Dashboard {
  ownDashboard(userId, dashboardId);
  db.prepare('DELETE FROM dashboard_widget WHERE id = ? AND dashboard_id = ? AND user_id = ?')
    .run(widgetId, dashboardId, userId);
  touch(dashboardId);
  return getDashboard(userId, dashboardId);
}

/** 拖拽后按前端给出的顺序整体重排（只影响 sort_order，不动 widget 内容） */
export function reorderWidgets(userId: string, dashboardId: string, ids: unknown): Dashboard {
  ownDashboard(userId, dashboardId);
  if (!Array.isArray(ids)) throw new Error('ids 必须是数组');
  const known = db
    .prepare('SELECT id FROM dashboard_widget WHERE dashboard_id = ? AND user_id = ?')
    .all(dashboardId, userId) as Array<{ id: string }>;
  const knownIds = new Set(known.map((r) => r.id));
  const clean = ids.map(String).filter((id) => knownIds.has(id));
  if (clean.length !== knownIds.size) throw new Error('排序列表与看板中的 widget 不一致，请刷新后重试');

  const tx = db.transaction(() => {
    const stmt = db.prepare(
      'UPDATE dashboard_widget SET sort_order = ?, updated_at = ? WHERE id = ? AND dashboard_id = ? AND user_id = ?',
    );
    const now = Date.now();
    clean.forEach((id, i) => stmt.run(i, now, id, dashboardId, userId));
  });
  tx();
  touch(dashboardId);
  return getDashboard(userId, dashboardId);
}
