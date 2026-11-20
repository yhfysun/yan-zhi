import { describe, expect, it } from 'vitest';
import {
  buildRecordPayload,
  computeNoteTotals,
  initialTemplateData,
  inputValueToTimestamp,
  noteListChips,
  timestampToInputValue,
  type NoteViewItem,
} from './notes-view-model';
import {
  NOTE_BUILTIN_DICTIONARIES,
  NOTE_BUILTIN_TEMPLATES,
  noteTemplateById,
} from '@yan-zhi/shared';

const now = new Date(2026, 10, 19, 12, 0).getTime();

function note(partial: Partial<NoteViewItem>): NoteViewItem {
  return {
    id: 'n1',
    kind: 'note',
    categoryId: null,
    categoryName: null,
    templateId: null,
    templateSnapshot: null,
    title: '',
    content: '',
    data: {},
    source: 'manual',
    pinned: false,
    starred: false,
    occurredAt: now,
    planAt: null,
    remindAt: null,
    remindDone: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('记录模板视图模型', () => {
  it('today/now 默认值生成可提交的时间戳，日期输入无损转换', () => {
    const journal = noteTemplateById('template.journal')!;
    const data = initialTemplateData(journal, now);
    expect(data.date).toBe(now);
    expect(timestampToInputValue({ key: 'date', label: '日期', type: 'date' }, data.date)).toBe('2026-11-19');
    const parsed = inputValueToTimestamp({ key: 'date', label: '日期', type: 'date' }, '2026-11-19');
    expect(new Date(parsed!).getHours()).toBe(0);
  });

  it('支出列表显示金额和分类名称，而不是字典 id', () => {
    const template = noteTemplateById('template.expense')!;
    const chips = noteListChips(note({
      templateId: template.id,
      data: { amount: 28.5, category: 'groceries' },
    }), template, NOTE_BUILTIN_DICTIONARIES);
    expect(chips).toContain('¥28.50');
    expect(chips).toContain('买菜');
  });

  it('任务模板自动生成 plan、计划时间和提醒', () => {
    const task = noteTemplateById('template.task')!;
    const payload = buildRecordPayload(task, {
      title: '整理货架',
      planAt: now,
      priority: 'high',
      remind: true,
      content: '先把临期商品移到前排',
    }, '经营');
    expect(payload.kind).toBe('plan');
    expect(payload.planAt).toBe(now);
    expect(payload.remindAt).toBe(now);
    expect(payload.categoryName).toBe('经营');
  });

  it('今日汇总分别计算支出、进货、出货与时间，不把进货混进日常支出', () => {
    const templates = NOTE_BUILTIN_TEMPLATES;
    const totals = computeNoteTotals([
      note({ id: 'expense', templateId: 'template.expense', data: { amount: 30 } }),
      note({ id: 'income', templateId: 'template.income', data: { amount: 100 } }),
      note({ id: 'purchase', templateId: 'template.purchase', data: { total: 200 } }),
      note({ id: 'sale', templateId: 'template.sale', data: { total: 500 } }),
      note({ id: 'time', templateId: 'template.time', data: { durationMinutes: 90 } }),
      note({ id: 'old', templateId: 'template.expense', occurredAt: now - 86400_000, data: { amount: 999 } }),
    ], templates, now);
    expect(totals).toMatchObject({
      expense: 30,
      income: 100,
      purchase: 200,
      sale: 500,
      minutes: 90,
      net: 370,
    });
  });
});
