import {
  noteDictionaryById,
  noteTemplateById,
  type NoteDictionaryDefinition,
  type NoteTemplateData,
  type NoteTemplateDefinition,
  type NoteTemplateField,
  type NoteTemplateKind,
} from '@yan-zhi/shared';

export interface NoteViewItem {
  id: string;
  kind: 'note' | 'plan';
  categoryId: string | null;
  categoryName: string | null;
  templateId: string | null;
  templateSnapshot: NoteTemplateDefinition | null;
  title: string;
  content: string;
  data: NoteTemplateData;
  source: string | null;
  pinned: boolean;
  starred: boolean;
  occurredAt: number | null;
  planAt: number | null;
  remindAt: number | null;
  remindDone: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NoteTotals {
  expense: number;
  income: number;
  purchase: number;
  sale: number;
  minutes: number;
  net: number;
}

export function templateForNote(
  note: Pick<NoteViewItem, 'templateId' | 'templateSnapshot' | 'kind'>,
  templates: readonly NoteTemplateDefinition[],
): NoteTemplateDefinition | undefined {
  if (note.templateSnapshot) return note.templateSnapshot;
  if (note.templateId) {
    return noteTemplateById(note.templateId, templates) || noteTemplateById(note.templateId);
  }
  return noteTemplateById(note.kind === 'plan' ? 'template.task' : 'template.note', templates);
}

export function templateKindForNote(
  note: Pick<NoteViewItem, 'templateId' | 'templateSnapshot' | 'kind'>,
  templates: readonly NoteTemplateDefinition[],
): NoteTemplateKind {
  return templateForNote(note, templates)?.kind || (note.kind === 'plan' ? 'task' : 'note');
}

function localDateValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateTimeValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateValue(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function inputValueToTimestamp(field: NoteTemplateField, value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = new Date(field.type === 'date' ? `${text}T00:00:00` : text).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function timestampToInputValue(field: NoteTemplateField, value: unknown): string {
  if (field.type !== 'date' && field.type !== 'datetime') return String(value ?? '');
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return field.type === 'date' ? localDateValue(ms) : localDateTimeValue(ms);
}

export function initialTemplateData(
  template: NoteTemplateDefinition,
  nowMs = Date.now(),
): NoteTemplateData {
  const data: NoteTemplateData = {};
  for (const field of template.fields) {
    if (field.defaultValue === 'today' && (field.type === 'date' || field.type === 'datetime')) {
      data[field.key] = nowMs;
    } else if (field.defaultValue === 'now' && field.type === 'datetime') {
      data[field.key] = nowMs;
    } else if (field.defaultValue !== undefined) {
      data[field.key] = field.defaultValue;
    } else {
      data[field.key] = field.type === 'checkbox'
        ? false
        : field.type === 'multiselect' || field.type === 'tags'
          ? []
          : '';
    }
  }
  return data;
}

export function dictionaryLabel(
  dictionaryId: string | undefined,
  value: unknown,
  dictionaries: readonly NoteDictionaryDefinition[],
): string {
  if (!dictionaryId) return String(value ?? '');
  const dictionary = noteDictionaryById(dictionaryId, dictionaries);
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => dictionary?.items.find((option) => option.id === String(item))?.label || String(item || ''))
    .filter(Boolean)
    .join('、');
}

export function fieldDisplayValue(
  field: NoteTemplateField,
  value: unknown,
  dictionaries: readonly NoteDictionaryDefinition[],
): string {
  if (value === null || value === undefined || value === '') return '';
  if (field.type === 'select' || field.type === 'multiselect') {
    return dictionaryLabel(field.dictionaryId, value, dictionaries);
  }
  if (field.type === 'checkbox') return value === true ? '是' : '否';
  if (field.type === 'amount') {
    const number = Number(value);
    return Number.isFinite(number) ? `¥${number.toFixed(2)}` : String(value);
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return field.type === 'date'
      ? `${d.getMonth() + 1}-${pad(d.getDate())}`
      : `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (Array.isArray(value)) return value.join('、');
  return `${String(value)}${field.unit ? ` ${field.unit}` : ''}`;
}

export function noteListChips(
  note: NoteViewItem,
  template: NoteTemplateDefinition | undefined,
  dictionaries: readonly NoteDictionaryDefinition[],
): string[] {
  if (!template) return [];
  const fields = template.fields.filter((field) => field.list);
  return fields
    .map((field) => fieldDisplayValue(field, note.data[field.key], dictionaries))
    .filter(Boolean)
    .slice(0, 3);
}

export function noteDisplayTitle(
  note: NoteViewItem,
  template: NoteTemplateDefinition | undefined,
): string {
  const fromField = template ? note.data[template.titleField] : '';
  return String(fromField || note.title || template?.name || '未命名记录');
}

export function noteDisplayContent(
  note: NoteViewItem,
  template: NoteTemplateDefinition | undefined,
): string {
  const fromField = template?.contentField ? note.data[template.contentField] : '';
  return String(fromField || note.content || '');
}

function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function noteBusinessTime(note: NoteViewItem): number {
  return note.occurredAt || note.planAt || note.createdAt;
}

export function computeNoteTotals(
  notes: readonly NoteViewItem[],
  templates: readonly NoteTemplateDefinition[],
  nowMs = Date.now(),
): NoteTotals {
  const today = startOfLocalDay(nowMs);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const totals: NoteTotals = { expense: 0, income: 0, purchase: 0, sale: 0, minutes: 0, net: 0 };
  for (const note of notes) {
    const at = noteBusinessTime(note);
    if (at < today || at >= tomorrow.getTime()) continue;
    const kind = templateKindForNote(note, templates);
    if (kind === 'expense') totals.expense += numeric(note.data.amount);
    else if (kind === 'income') totals.income += numeric(note.data.amount);
    else if (kind === 'purchase') totals.purchase += numeric(note.data.total);
    else if (kind === 'sale') totals.sale += numeric(note.data.total);
    else if (kind === 'time') totals.minutes += numeric(note.data.durationMinutes);
  }
  totals.net = totals.income + totals.sale - totals.expense - totals.purchase;
  return totals;
}

export function buildRecordPayload(
  template: NoteTemplateDefinition,
  data: NoteTemplateData,
  categoryName = '',
): {
  title: string;
  content: string;
  kind: 'note' | 'plan';
  categoryName: string;
  occurredAt: number | null;
  planAt: number | null;
  remindAt: number | null;
  templateId: string;
  data: NoteTemplateData;
} {
  const titleValue = String(data[template.titleField] ?? '').trim();
  const amount = numeric(data.amount || data.total);
  const fallback = template.kind === 'expense' || template.kind === 'income'
    ? `${template.name.replace(/^记/, '')} ${amount ? `¥${amount.toFixed(2)}` : ''}`.trim()
    : template.name;
  const planAtRaw = data.planAt;
  const planAt = typeof planAtRaw === 'number' && Number.isFinite(planAtRaw) ? planAtRaw : null;
  const occurredAt = typeof data.occurredAt === 'number'
    ? data.occurredAt
    : planAt || Date.now();
  return {
    title: titleValue || fallback,
    content: String(template.contentField ? data[template.contentField] ?? '' : ''),
    kind: template.kind === 'task' ? 'plan' : 'note',
    categoryName: categoryName.trim(),
    occurredAt,
    planAt,
    remindAt: template.kind === 'task' && data.remind === true ? planAt : null,
    templateId: template.id,
    data,
  };
}

export function groupNotesByDay(notes: readonly NoteViewItem[]): Array<{ day: string; items: NoteViewItem[] }> {
  const groups = new Map<string, NoteViewItem[]>();
  for (const note of notes) {
    const d = new Date(noteBusinessTime(note));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const list = groups.get(key) || [];
    list.push(note);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({ day, items }));
}

export function dateGroupLabel(day: string, nowMs = Date.now()): string {
  const today = localDateValue(nowMs);
  const yesterdayDate = new Date(nowMs);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateValue(yesterdayDate.getTime());
  if (day === today) return '今天';
  if (day === yesterday) return '昨天';
  const [, month, date] = day.split('-');
  return `${Number(month)}月${Number(date)}日`;
}
