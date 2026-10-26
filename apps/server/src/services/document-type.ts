// 自定义文档类型（文档 D1/D2）
//
// 存储口径：只存用户自定义类型；内置 3 个模板仍由前端常量提供（代码即产品定义）。
// 校验口径：code/name 必填，sections 只允许既有 kind，变量 key 只允许字母数字下划线。
// YAML 只是同一份结构的文本形态 —— 导入导出都过这里的 validate，不做两套判断。
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { db } from '../db.js';

export const DOCUMENT_SECTION_KINDS = [
  'heading', 'paragraph', 'metrics', 'table', 'chart', 'infographic', 'image', 'pageBreak',
] as const;
export type DocumentSectionKind = typeof DOCUMENT_SECTION_KINDS[number];

export interface DocumentTypeSectionSpec {
  kind: DocumentSectionKind;
  label: string;
  hint?: string;
  required?: boolean;
}

export interface DocumentVariableSpec {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select';
  default?: string;
  options?: string[];
}

export interface DocumentTypeDef {
  code: string;
  name: string;
  description: string;
  category: string;
  output: 'docx';
  sections: DocumentTypeSectionSpec[];
  variables?: DocumentVariableSpec[];
  usage?: string;
}

const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;
const VAR_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
const MAX_SECTIONS = 30;
const MAX_NAME = 60;
const KIND_SET = new Set<string>(DOCUMENT_SECTION_KINDS);

function str(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max);
}

/** 校验并规整（导入、保存共用同一入口） */
export function normalizeDocumentType(raw: unknown): DocumentTypeDef {
  if (!raw || typeof raw !== 'object') throw new Error('文档类型必须是对象');
  const r = raw as Record<string, unknown>;

  const code = str(r.code, 41);
  if (!CODE_RE.test(code)) throw new Error('code 只能是小写字母/数字/下划线/短横线，2–41 位');
  const name = str(r.name, MAX_NAME);
  if (!name) throw new Error('名称不能为空');

  if (!Array.isArray(r.sections) || r.sections.length === 0) throw new Error('sections 必须是非空数组');
  if (r.sections.length > MAX_SECTIONS) throw new Error(`sections 最多 ${MAX_SECTIONS} 段`);

  const sections: DocumentTypeSectionSpec[] = r.sections.map((s, i) => {
    const sec = s as Record<string, unknown> | undefined;
    if (!sec || typeof sec !== 'object') throw new Error(`第 ${i + 1} 段不是对象`);
    const kind = String(sec.kind || '');
    if (!KIND_SET.has(kind)) throw new Error(`第 ${i + 1} 段的 kind 非法：${kind}`);
    const label = str(sec.label, 60);
    if (!label) throw new Error(`第 ${i + 1} 段缺少 label`);
    return {
      kind: kind as DocumentSectionKind,
      label,
      ...(str(sec.hint) ? { hint: str(sec.hint) } : {}),
      ...(sec.required === true ? { required: true } : {}),
    };
  });

  let variables: DocumentVariableSpec[] | undefined;
  if (Array.isArray(r.variables) && r.variables.length) {
    const seen = new Set<string>();
    variables = r.variables.map((v, i) => {
      const item = v as Record<string, unknown> | undefined;
      if (!item || typeof item !== 'object') throw new Error(`第 ${i + 1} 个变量不是对象`);
      const key = str(item.key, 31);
      if (!VAR_KEY_RE.test(key)) throw new Error(`变量 key 非法：${key}（字母/数字/下划线，字母或下划线开头）`);
      if (seen.has(key)) throw new Error(`变量 key 重复：${key}`);
      seen.add(key);
      const type = String(item.type || 'text') as DocumentVariableSpec['type'];
      if (type !== 'text' && type !== 'date' && type !== 'select') throw new Error(`变量 ${key} 的 type 非法`);
      const options = Array.isArray(item.options)
        ? item.options.map((o) => str(o, 60)).filter(Boolean)
        : undefined;
      if (type === 'select' && (!options || !options.length)) throw new Error(`select 变量 ${key} 需要 options`);
      return {
        key,
        label: str(item.label, 60) || key,
        type,
        ...(str(item.default) ? { default: str(item.default, 200) } : {}),
        ...(options?.length ? { options } : {}),
      };
    });
  }

  return {
    code,
    name,
    description: str(r.description, 300),
    category: str(r.category, 30) || '自定义',
    output: 'docx',
    sections,
    ...(variables ? { variables } : {}),
    ...(str(r.usage, 300) ? { usage: str(r.usage, 300) } : {}),
  };
}

interface TypeRow {
  code: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  usage_text: string | null;
  sections_json: string;
  variables_json: string | null;
  created_at: number;
  updated_at: number;
}

function toDef(row: TypeRow): DocumentTypeDef {
  return {
    code: row.code,
    name: row.name,
    description: row.description || '',
    category: row.category || '自定义',
    output: 'docx',
    sections: JSON.parse(row.sections_json) as DocumentTypeSectionSpec[],
    ...(row.variables_json ? { variables: JSON.parse(row.variables_json) as DocumentVariableSpec[] } : {}),
    ...(row.usage_text ? { usage: row.usage_text } : {}),
  };
}

export function listDocumentTypes(userId: string): DocumentTypeDef[] {
  const rows = db
    .prepare('SELECT * FROM document_type WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as TypeRow[];
  return rows.map((r) => {
    try { return toDef(r); } catch { return null; }
  }).filter((t): t is DocumentTypeDef => !!t);
}

export function getDocumentType(userId: string, code: string): DocumentTypeDef | null {
  const row = db
    .prepare('SELECT * FROM document_type WHERE user_id = ? AND code = ?')
    .get(userId, code) as TypeRow | undefined;
  return row ? toDef(row) : null;
}

/** 新建或覆盖（按 user_id + code） */
export function saveDocumentType(userId: string, raw: unknown): DocumentTypeDef {
  const def = normalizeDocumentType(raw);
  const now = Date.now();
  db.prepare(`
    INSERT INTO document_type (code, user_id, name, description, category, usage_text, sections_json, variables_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      usage_text = excluded.usage_text,
      sections_json = excluded.sections_json,
      variables_json = excluded.variables_json,
      updated_at = excluded.updated_at
  `).run(
    def.code, userId, def.name, def.description || null, def.category || null, def.usage || null,
    JSON.stringify(def.sections), def.variables ? JSON.stringify(def.variables) : null, now, now,
  );
  return def;
}

export function deleteDocumentType(userId: string, code: string): void {
  db.prepare('DELETE FROM document_type WHERE user_id = ? AND code = ?').run(userId, code);
}

/** 导出 YAML（源文件态；与导入同构） */
export function exportDocumentTypeYaml(userId: string, code: string): string {
  const def = getDocumentType(userId, code);
  if (!def) throw new Error('文档类型不存在');
  return stringifyYaml({ version: 1, ...def });
}

/** 导入 YAML：解析 → 校验 → upsert */
export function importDocumentTypeYaml(userId: string, text: string): DocumentTypeDef {
  let data: unknown;
  try {
    data = parseYaml(String(text || ''));
  } catch (e) {
    throw new Error(`YAML 解析失败：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!data || typeof data !== 'object') throw new Error('YAML 内容必须是对象');
  const v = Number((data as Record<string, unknown>).version);
  if (Number.isFinite(v) && v > 1) throw new Error(`版本 ${v} 高于当前支持的 1`);
  return saveDocumentType(userId, data);
}
