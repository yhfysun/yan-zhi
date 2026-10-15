// skill_draft 写入原语（2026-10-15，P2-13 自动蒸馏入库）
// ─────────────────────────────────────────────────────────────
// 唯一的 INSERT 入口：HTTP 路由（routes/skill-drafts.ts）与自动蒸馏（llm-task-manager.ts）
// 都走这里。为什么必须收口：`skill_draft` 是 core 的 schema.ts 与服务端 db.ts **双份 DDL**，
// 列清单一旦在某一处漂移（少写一列 / 拼错列名），better-sqlite3 只会在运行时抛 "no such column"，
// 而两条写入路径都是 fail-safe 的，表现就是"草稿悄无声息没落库"。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

export interface SkillDraftInsert {
  userId: string;
  title: string;
  /** 默认 'overview'（蒸馏工作台的两段式起点）；自动蒸馏用 'draft' */
  status?: string;
  sourceConvId?: string | null;
  sourceMsgIds?: string[] | null;
  /** 技能概览对象；序列化后进 overview_json */
  overview?: unknown;
  /** SKILL.md 正文 */
  resultMd?: string;
  error?: string;
}

/** 落库后的原始行（列名与 DDL 一致，调用方按需映射为驼峰）。 */
export interface SkillDraftRow {
  id: string;
  user_id: string | null;
  title: string;
  status: string;
  source_conv_id: string | null;
  source_msg_ids_json: string | null;
  overview_json: string | null;
  result_md: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

/** 插入一行草稿并返回落库后的行。字段收敛规则与路由 POST 完全一致（非字符串一律降级为默认值）。 */
export function insertSkillDraft(input: SkillDraftInsert): SkillDraftRow {
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO skill_draft (id, user_id, title, status, source_conv_id, source_msg_ids_json, overview_json, result_md, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.userId,
    input.title,
    typeof input.status === 'string' ? input.status : 'overview',
    typeof input.sourceConvId === 'string' ? input.sourceConvId : null,
    Array.isArray(input.sourceMsgIds) ? JSON.stringify(input.sourceMsgIds) : null,
    input.overview != null ? JSON.stringify(input.overview) : null,
    typeof input.resultMd === 'string' ? input.resultMd : '',
    typeof input.error === 'string' ? input.error : '',
    now,
    now,
  );
  return db.prepare('SELECT * FROM skill_draft WHERE id = ?').get(id) as SkillDraftRow;
}
