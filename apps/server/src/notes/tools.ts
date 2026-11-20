// 笔记智能体工具（docs/笔记功能方案-2026-11-14.md §3）：挂全部聊天智能体，按需调用。
//
// ★ 用户拍板（2026-11-14）：**不做摘要注入** —— 不往 system prompt 加任何笔记块，token 零
//   开销；只有当用户明确问到（"我的 XX 笔记"、"记成笔记"、"我有什么计划"）才通过工具读写。
//   工具 description 写明边界：仅用户明确要求时使用，不要主动记录对话内容。
// ★ 用户态注入收口：与 learning/tools.ts 同款解法 —— registry.execute 唯一出口旁
//   setNoteToolUser(task.userId)（llm-task-manager 两处调用点旁各一行），每次调用前都设置。
import type { BuiltInTool, ToolRegistry } from '@yan-zhi/core';
import type { NoteTemplateData } from '@yan-zhi/shared';
import {
  createNote, updateNote, getNote, listNotes, getNoteAnalytics,
  listCategories, ensureCategory, renameCategory, deleteCategory, moveCategory,
  type NoteKind,
} from './service.js';

// toolOk/toolError 在 core 的 tool/result.ts，但未随包导出 —— 本地同构实现（形状一致，照 learning/tools.ts）
function toolOk(text: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { content: [{ type: 'text', text }], isError: false };
}
function toolError(msg: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

let currentUserId = '';
export function setNoteToolUser(userId: string): void {
  currentUserId = userId || '';
}

/** 解析模型给的时间入参：支持 epoch ms、'YYYY-MM-DD HH:mm'、'YYYY-MM-DD'（按本地时区）；非法返回 null */
export function parseNoteTimeInput(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{12,14}$/.test(s)) { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : null; }
  // 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DD'：按本地时区构造（模型最常给的自然格式）
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s);
  if (m) {
    const [, y, mo, d, h = '00', mi = '00'] = m;
    const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
    return Number.isFinite(t) ? t : null;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

const KIND_DESC = "kind：'note' 笔记（默认）或 'plan' 计划；计划可带 plan_at/remind_at 时间";
const TIME_DESC = "时间格式支持 epoch 毫秒或 'YYYY-MM-DD HH:mm'（本地时间）";

class NotesAddTool implements BuiltInTool {
  name = 'notes_add';
  description = '创建笔记、账本记录、进货出货、时间记录或计划。**仅当用户明确要求记录时调用**——不要主动记录对话内容。可传 template_id + data 使用结构化模板；category_name 直传字符串，不存在自动创建。';
  inputSchema = {
    type: 'object',
    properties: {
      title: { type: 'string', description: '标题（简短一句话）' },
      content: { type: 'string', description: '正文 Markdown（可选）' },
      category_name: { type: 'string', description: '分类名（可选，不存在自动创建；按用户口述选择或创建）' },
      kind: { type: 'string', enum: ['note', 'plan'], description: KIND_DESC },
      template_id: { type: 'string', description: '结构化模板 id（例如 template.expense / template.purchase / template.task）' },
      data: { type: 'object', description: '模板字段值对象，例如支出 {amount:28.5,category:"food"}' },
      occurred_at: { type: 'string', description: `业务发生时间（可选），${TIME_DESC}` },
      plan_at: { type: 'string', description: `计划时间（kind=plan 时），${TIME_DESC}` },
      remind_at: { type: 'string', description: `提醒时间（可选），${TIME_DESC}；到点桌面端会智能提醒` },
    },
    required: ['title'],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const planAt = parseNoteTimeInput(args.plan_at);
      const remindAt = parseNoteTimeInput(args.remind_at);
      const occurredAt = parseNoteTimeInput(args.occurred_at);
      const kind: NoteKind = args.kind === 'plan' ? 'plan' : 'note';
      if (planAt === null && args.plan_at != null && args.plan_at !== '') return toolError(`plan_at 无法解析：${String(args.plan_at)}（支持 epoch 毫秒或 'YYYY-MM-DD HH:mm'）`);
      if (remindAt === null && args.remind_at != null && args.remind_at !== '') return toolError(`remind_at 无法解析：${String(args.remind_at)}（支持 epoch 毫秒或 'YYYY-MM-DD HH:mm'）`);
      if (occurredAt === null && args.occurred_at != null && args.occurred_at !== '') return toolError(`occurred_at 无法解析：${String(args.occurred_at)}`);
      const item = createNote(currentUserId, {
        title: String(args.title || ''),
        content: args.content != null ? String(args.content) : '',
        kind,
        templateId: args.template_id != null ? String(args.template_id) : undefined,
        data: args.data && typeof args.data === 'object' && !Array.isArray(args.data)
          ? args.data as NoteTemplateData
          : undefined,
        occurredAt,
        categoryName: args.category_name != null ? String(args.category_name) : undefined,
        planAt: planAt,
        remindAt: remindAt,
        source: 'chat',
      });
      // 写前口述给用户看（方案 §5：无需额外弹窗，返回摘要即可）
      return toolOk(JSON.stringify({
        ok: true,
        id: item.id,
        title: item.title,
        kind: item.kind,
        templateId: item.templateId,
        data: item.data,
        category: item.categoryName,
        occurredAt: item.occurredAt,
        planAt: item.planAt,
        remindAt: item.remindAt,
      }));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

class NotesUpdateTool implements BuiltInTool {
  name = 'notes_update';
  description = '修改一条已有的笔记、结构化记录或计划（标题/内容/字段数据/分类/时间/收藏）。**仅当用户明确要求修改时调用**；不指定 id 时先用 notes_search 找到目标。';
  inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: '笔记 id（notes_search 返回的 id）' },
      title: { type: 'string', description: '新标题（可选）' },
      content: { type: 'string', description: '新正文 Markdown（可选）' },
      category_name: { type: 'string', description: '新分类名（可选，空串 = 移到未分类）' },
      starred: { type: 'boolean', description: '是否收藏（可选）' },
      data: { type: 'object', description: '覆盖或合并模板字段值（可选）' },
      occurred_at: { type: 'string', description: `新业务发生时间（传空串清除），${TIME_DESC}` },
      plan_at: { type: 'string', description: `新计划时间（传空串清除），${TIME_DESC}` },
      remind_at: { type: 'string', description: `新提醒时间（传空串清除），${TIME_DESC}` },
    },
    required: ['id'],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const id = String(args.id || '');
      if (!id) return toolError('缺少 id（先用 notes_search 找到目标）');
      const planAt = args.plan_at !== undefined ? parseNoteTimeInput(args.plan_at) : undefined;
      const remindAt = args.remind_at !== undefined ? parseNoteTimeInput(args.remind_at) : undefined;
      const occurredAt = args.occurred_at !== undefined ? parseNoteTimeInput(args.occurred_at) : undefined;
      if (args.plan_at != null && args.plan_at !== '' && planAt === null) return toolError(`plan_at 无法解析：${String(args.plan_at)}`);
      if (args.remind_at != null && args.remind_at !== '' && remindAt === null) return toolError(`remind_at 无法解析：${String(args.remind_at)}`);
      if (args.occurred_at != null && args.occurred_at !== '' && occurredAt === null) return toolError(`occurred_at 无法解析：${String(args.occurred_at)}`);
      const existing = getNote(currentUserId, id);
      const data = args.data && typeof args.data === 'object' && !Array.isArray(args.data)
        ? { ...(existing?.data || {}), ...args.data as NoteTemplateData }
        : undefined;
      const item = updateNote(currentUserId, id, {
        title: args.title != null ? String(args.title) : undefined,
        content: args.content != null ? String(args.content) : undefined,
        categoryName: args.category_name !== undefined ? String(args.category_name ?? '') : undefined,
        starred: typeof args.starred === 'boolean' ? args.starred : undefined,
        data,
        occurredAt,
        planAt: planAt,
        remindAt: remindAt,
      });
      return toolOk(JSON.stringify({
        ok: true,
        id: item.id,
        title: item.title,
        templateId: item.templateId,
        data: item.data,
        category: item.categoryName,
        occurredAt: item.occurredAt,
        planAt: item.planAt,
        remindAt: item.remindAt,
      }));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

/** 给模型的行摘要：内容截断，别把整篇灌回上下文 */
function noteSummaryLine(n: {
  id: string;
  kind: NoteKind;
  title: string;
  content: string;
  templateId: string | null;
  data: NoteTemplateData;
  categoryName: string | null;
  starred: boolean;
  occurredAt: number | null;
  planAt: number | null;
  remindAt: number | null;
}): Record<string, unknown> {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    templateId: n.templateId,
    data: n.data,
    category: n.categoryName,
    starred: n.starred,
    occurredAt: n.occurredAt,
    planAt: n.planAt,
    remindAt: n.remindAt,
    contentPreview: n.content.length > 300 ? n.content.slice(0, 300) + '…' : n.content,
  };
}

class NotesSearchTool implements BuiltInTool {
  name = 'notes_search';
  description = '查询用户的笔记/计划（按关键词/分类/收藏过滤）。**仅当用户明确问到自己的笔记或计划时调用**（如"我之前记过 XX 吗"、"我有什么计划"）；返回 id 供 notes_update 使用。';
  inputSchema = {
    type: 'object',
    properties: {
      q: { type: 'string', description: '关键词（搜标题+正文，可选）' },
      kind: { type: 'string', enum: ['note', 'plan'], description: '只看笔记或计划（可选）' },
      category_name: { type: 'string', description: '按分类名过滤（可选）' },
      starred: { type: 'boolean', description: '只看收藏（可选）' },
      limit: { type: 'number', description: '最多返回几条（默认 10，上限 30）' },
    },
    required: [],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const limit = Math.min(30, Math.max(1, typeof args.limit === 'number' ? args.limit : 10));
      let rows = listNotes(currentUserId, {
        kind: args.kind === 'plan' ? 'plan' : args.kind === 'note' ? 'note' : undefined,
        starred: args.starred === true,
        q: args.q != null ? String(args.q) : undefined,
      });
      const catName = args.category_name != null ? String(args.category_name).trim() : '';
      if (catName) rows = rows.filter((r) => (r.categoryName || '') === catName);
      // 全文兜底：LIKE 命中标题/正文已覆盖；再按内容前缀保证空 q 时也有合理排序（按更新时间）
      const data = rows.slice(0, limit).map(noteSummaryLine);
      return toolOk(JSON.stringify({ total: rows.length, items: data }));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

class NotesManageCategoriesTool implements BuiltInTool {
  name = 'notes_manage_categories';
  description = '管理笔记目录：list 列出（含路径和计数）/ create 创建 / rename 重命名 / move 移动层级 / delete 删除（子目录上移、笔记迁到未分类）。**仅当用户明确要求整理目录时调用**。';
  inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'rename', 'move', 'delete'], description: '操作类型' },
      name: { type: 'string', description: '分类名（create 用；rename 用旧名或配合 id）' },
      id: { type: 'string', description: '分类 id（rename/delete 用，list 返回的 id）' },
      new_name: { type: 'string', description: '新分类名（rename 用）' },
      parent_id: { type: 'string', description: '父目录 id（create/move 用；空串 = 根目录）' },
    },
    required: ['action'],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const action = String(args.action || 'list');
      if (action === 'list') return toolOk(JSON.stringify({ categories: listCategories(currentUserId) }));
      if (action === 'create') {
        return toolOk(JSON.stringify({
          ok: true,
          category: ensureCategory(
            currentUserId,
            String(args.name || ''),
            args.parent_id ? String(args.parent_id) : null,
          ),
        }));
      }
      if (action === 'rename') {
        const id = String(args.id || '');
        const name = String(args.new_name || '');
        if (!id) {
          // 只给了旧名：先查回 id（不给 id 的调用更自然）
          const cats = listCategories(currentUserId).filter((c) => c.id !== '__none__');
          const hit = cats.find((c) => c.name === String(args.name || ''));
          if (!hit) return toolError(`分类「${String(args.name || '')}」不存在`);
          return toolOk(JSON.stringify({ ok: true, category: renameCategory(currentUserId, hit.id, name) }));
        }
        return toolOk(JSON.stringify({ ok: true, category: renameCategory(currentUserId, id, name) }));
      }
      if (action === 'delete') {
        const id = String(args.id || '');
        if (!id) {
          const cats = listCategories(currentUserId).filter((c) => c.id !== '__none__');
          const hit = cats.find((c) => c.name === String(args.name || ''));
          if (!hit) return toolError(`分类「${String(args.name || '')}」不存在`);
          deleteCategory(currentUserId, hit.id);
          return toolOk(JSON.stringify({ ok: true, deleted: hit.name }));
        }
        deleteCategory(currentUserId, id);
        return toolOk(JSON.stringify({ ok: true, deleted: id }));
      }
      if (action === 'move') {
        const id = String(args.id || '');
        if (!id) return toolError('move 操作需要 id');
        return toolOk(JSON.stringify({
          ok: true,
          category: moveCategory(currentUserId, id, args.parent_id ? String(args.parent_id) : null),
        }));
      }
      return toolError(`未知 action：${action}`);
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

class NotesAnalyticsTool implements BuiltInTool {
  name = 'notes_analytics';
  description = '汇总用户的账本、进货出货、时间记录和任务状态。**仅当用户明确询问花了多少钱、进货出货多少、时间花在哪里或任务统计时调用**。';
  inputSchema = {
    type: 'object',
    properties: {
      range: { type: 'string', enum: ['today', 'week', 'month'], description: '默认 today' },
      from: { type: 'string', description: `自定义开始时间（可选），${TIME_DESC}` },
      to: { type: 'string', description: `自定义结束时间（可选），${TIME_DESC}` },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const range = String(args.range || 'today');
      if (range === 'week') start.setDate(start.getDate() - 6);
      if (range === 'month') start.setDate(1);
      const parsedFrom = parseNoteTimeInput(args.from);
      const parsedTo = parseNoteTimeInput(args.to);
      if (parsedFrom === null && args.from != null && args.from !== '') return toolError(`from 无法解析：${String(args.from)}`);
      if (parsedTo === null && args.to != null && args.to !== '') return toolError(`to 无法解析：${String(args.to)}`);
      const report = getNoteAnalytics(
        currentUserId,
        parsedFrom ?? start.getTime(),
        parsedTo ?? Date.now(),
      );
      return toolOk(JSON.stringify({ ok: true, range, ...report }));
    } catch (e) {
      return toolError(e instanceof Error ? e.message : String(e));
    }
  }
}

export function registerNotesTools(registry: ToolRegistry): void {
  registry.register(new NotesAddTool());
  registry.register(new NotesUpdateTool());
  registry.register(new NotesSearchTool());
  registry.register(new NotesManageCategoriesTool());
  registry.register(new NotesAnalyticsTool());
}

export const NOTE_TOOL_NAMES = [
  'notes_add',
  'notes_update',
  'notes_search',
  'notes_manage_categories',
  'notes_analytics',
] as const;
