import { describe, expect, it } from 'vitest';
import {
  createNote,
  createNoteDictionary,
  createNoteTemplate,
  deleteCategory,
  deleteNote,
  ensureCategory,
  getNoteAnalytics,
  listCategories,
  moveCategory,
  toggleTaskDone,
  updateNote,
} from '../src/notes/service';

const uid = `note-records-${Date.now()}`;
const other = `note-records-other-${Date.now()}`;
const now = new Date(2026, 10, 19, 12, 0).getTime();

describe('目录树', () => {
  it('支持父子目录、路径和循环移动保护', () => {
    const root = ensureCategory(uid, '经营', null);
    const purchase = ensureCategory(uid, '采购', root.id);
    const suppliers = ensureCategory(uid, '供应商', purchase.id);
    const listed = listCategories(uid);
    expect(listed.find((item) => item.id === suppliers.id)?.path).toEqual(['经营', '采购', '供应商']);
    expect(() => moveCategory(uid, root.id, suppliers.id)).toThrow(/循环/);
  });

  it('删除父目录时，子目录上移到父级，记录不丢', () => {
    const root = ensureCategory(uid, '生活', null);
    const child = ensureCategory(uid, '餐饮', root.id);
    deleteCategory(uid, root.id);
    expect(listCategories(uid).find((item) => item.id === child.id)?.parentId).toBeNull();
  });
});

describe('账本、库存与时间投影', () => {
  it('支出和收入落到金额分表，并计入区间汇总与分类汇总', () => {
    createNote(uid, {
      title: '午餐',
      templateId: 'template.expense',
      occurredAt: now,
      data: { amount: 28.5, category: 'food', account: 'wechat' },
    });
    createNote(uid, {
      title: '门店收入',
      templateId: 'template.income',
      occurredAt: now,
      data: { amount: 120, category: 'shop-income', account: 'cash' },
    });
    const report = getNoteAnalytics(uid, now - 3600_000, now + 3600_000);
    expect(report.totals.expense).toBe(28.5);
    expect(report.totals.income).toBe(120);
    expect(report.expenseByCategory).toEqual([
      expect.objectContaining({ key: 'food', amount: 28.5 }),
    ]);
  });

  it('进货与出货生成库存流水，结余按数量汇总', () => {
    const purchase = createNote(uid, {
      title: '苹果进货',
      templateId: 'template.purchase',
      occurredAt: now,
      data: {
        item: '红富士苹果',
        category: 'fresh',
        quantity: 10,
        unitPrice: 5,
        total: 50,
        occurredAt: now,
      },
    });
    createNote(uid, {
      title: '苹果出货',
      templateId: 'template.sale',
      occurredAt: now,
      data: {
        item: '红富士苹果',
        quantity: 3,
        unitPrice: 8,
        total: 24,
        occurredAt: now,
      },
    });
    let report = getNoteAnalytics(uid, now - 3600_000, now + 3600_000);
    expect(report.inventory.find((item) => item.product === '红富士苹果')?.quantityOnHand).toBe(7);

    updateNote(uid, purchase.id, {
      data: {
        item: '红富士苹果',
        category: 'fresh',
        quantity: 12,
        unitPrice: 5,
        total: 60,
        occurredAt: now,
      },
    });
    report = getNoteAnalytics(uid, now - 3600_000, now + 3600_000);
    expect(report.inventory.find((item) => item.product === '红富士苹果')?.quantityOnHand).toBe(9);
  });

  it('时间记录按场景汇总分钟数', () => {
    createNote(uid, {
      title: '整理货架',
      templateId: 'template.time',
      occurredAt: now,
      data: { activity: '整理货架', category: 'business', durationMinutes: 90, occurredAt: now },
    });
    const report = getNoteAnalytics(uid, now - 3600_000, now + 3600_000);
    expect(report.totals.minutes).toBe(90);
    expect(report.timeByCategory).toEqual([
      expect.objectContaining({ key: 'business', minutes: 90 }),
    ]);
  });

  it('自定义支出模板的字典分类会随报表返回，界面可直接显示中文标签', () => {
    const dictionary = createNoteDictionary(uid, {
      name: '自定义支出分类',
      description: '',
      items: [{ id: 'pet', label: '宠物' }],
    });
    const template = createNoteTemplate(uid, {
      name: '宠物开销',
      description: '',
      icon: 'WalletCards',
      tone: 'rose',
      kind: 'expense',
      titleField: 'merchant',
      fields: [
        { key: 'amount', label: '金额', type: 'amount', required: true },
        { key: 'category', label: '分类', type: 'select', dictionaryId: dictionary.id },
        { key: 'merchant', label: '商家', type: 'text' },
      ],
    });
    createNote(uid, {
      title: '宠物用品',
      templateId: template.id,
      occurredAt: now,
      data: { merchant: '宠物店', amount: 88, category: 'pet', occurredAt: now },
    });
    const report = getNoteAnalytics(uid, now - 1000, now + 1000);
    expect(report.expenseByCategory.find((item) => item.key === 'pet')?.dictionaryId)
      .toBe(dictionary.id);
  });

  it('任务模板支持完成状态切换，并在汇总中区分完成和逾期', () => {
    // 用当前时间而不是模块加载时的固定日期：完成时间由实际 update 写入，
    // 固定日期跨天后会把 completed_at 排除在查询窗口外，制造假红。
    const taskNow = Date.now();
    const task = createNote(uid, {
      title: '补货',
      templateId: 'template.task',
      planAt: taskNow - 60_000,
      remindAt: taskNow - 60_000,
      data: { title: '补货', planAt: taskNow - 60_000, priority: 'high', remind: true, done: false },
    });
    let report = getNoteAnalytics(uid, taskNow - 86400_000, taskNow + 86400_000);
    expect(report.totals.tasksOpen).toBe(1);
    expect(report.totals.tasksOverdue).toBe(1);

    const done = toggleTaskDone(uid, task.id);
    expect(done.data.done).toBe(true);
    report = getNoteAnalytics(uid, taskNow - 86400_000, taskNow + 86400_000);
    expect(report.totals.tasksDone).toBe(1);
    expect(report.totals.tasksOverdue).toBe(0);
  });

  it('删除记录同步删除领域投影，且不影响其他用户', () => {
    const note = createNote(uid, {
      title: '待删支出',
      templateId: 'template.expense',
      occurredAt: now,
      data: { amount: 9.9, category: 'food' },
    });
    deleteNote(uid, note.id);
    const report = getNoteAnalytics(uid, now - 1000, now + 1000);
    expect(report.totals.expense).toBeGreaterThanOrEqual(28.5);
    expect(getNoteAnalytics(other, now - 1000, now + 1000).totals.expense).toBe(0);
  });
});
