import { describe, expect, it } from 'vitest';
import {
  createNote,
  createNoteDictionary,
  createNoteTemplate,
  deleteNoteDictionary,
  deleteNoteTemplate,
  getNote,
  listNoteDictionaries,
  listNoteTemplates,
  updateNoteDictionary,
  updateNoteTemplate,
  updateNote,
} from '../src/notes/service';
import { NOTE_BUILTIN_DICTIONARIES, NOTE_BUILTIN_TEMPLATES } from '@yan-zhi/shared';

const uid = `note-template-user-${Date.now()}`;

describe('记录模板与字典', () => {
  it('内置模板与字典按用户合并返回，且不可被用户删除', () => {
    const templates = listNoteTemplates(uid);
    const dictionaries = listNoteDictionaries(uid);
    expect(templates.some((item) => item.id === NOTE_BUILTIN_TEMPLATES[0].id)).toBe(true);
    expect(dictionaries.some((item) => item.id === NOTE_BUILTIN_DICTIONARIES[0].id)).toBe(true);
    expect(() => deleteNoteTemplate(uid, NOTE_BUILTIN_TEMPLATES[0].id)).toThrow(/内置/);
    expect(() => deleteNoteDictionary(uid, NOTE_BUILTIN_DICTIONARIES[0].id)).toThrow(/内置/);
  });

  it('自定义模板保留字段、字典绑定和列表摘要字段', () => {
    const dictionary = createNoteDictionary(uid, {
      name: '进货渠道',
      description: '我的供应商来源',
      items: [{ id: 'market', label: '批发市场' }],
    });
    const template = createNoteTemplate(uid, {
      name: '补货记录',
      description: '自定义补货模板',
      icon: 'PackagePlus',
      tone: 'orange',
      kind: 'custom',
      titleField: 'item',
      fields: [
        { key: 'item', label: '商品', type: 'text', required: true },
        {
          key: 'channel',
          label: '渠道',
          type: 'select',
          dictionaryId: dictionary.id,
          list: true,
        },
        { key: 'amount', label: '金额', type: 'amount', list: true, aggregate: 'sum' },
      ],
    });
    const read = listNoteTemplates(uid).find((item) => item.id === template.id);
    expect(read?.fields[1].dictionaryId).toBe(dictionary.id);
    expect(read?.fields[2].aggregate).toBe('sum');
    expect(read?.builtin).toBe(false);
  });

  it('删除字典项采用停用，不丢历史枚举值，也不允许空名称', () => {
    const dictionary = createNoteDictionary(uid, {
      name: '客户类型',
      description: '',
      items: [
        { id: 'old', label: '老客户' },
        { id: 'new', label: '新客户' },
      ],
    });
    const updated = updateNoteDictionary(uid, dictionary.id, {
      items: [{ id: 'old', label: '老客户', archived: true }, { id: 'new', label: '新客户' }],
    });
    expect(updated.items.find((item) => item.id === 'old')?.archived).toBe(true);
    expect(() => createNoteDictionary(uid, { name: '   ', description: '', items: [] })).toThrow(/名称/);
  });

  it('删除自定义模板后，历史记录仍按快照保留字段与值', () => {
    const template = createNoteTemplate(uid, {
      name: '临时模板',
      description: '',
      icon: 'NotebookPen',
      tone: 'slate',
      kind: 'custom',
      titleField: 'name',
      fields: [{ key: 'name', label: '名称', type: 'text' }, { key: 'score', label: '评分', type: 'number' }],
    });
    const note = createNote(uid, {
      title: '历史快照样本',
      templateId: template.id,
      data: { name: '历史快照样本', score: 8 },
    });
    deleteNoteTemplate(uid, template.id);
    const read = getNote(uid, note.id);
    expect(read?.templateId).toBe(template.id);
    expect(read?.data.score).toBe(8);
    expect(read?.templateSnapshot?.fields.length).toBe(2);
  });

  it('更新记录可修改模板数据与发生时间', () => {
    const note = createNote(uid, {
      title: '支出记录',
      templateId: 'template.expense',
      occurredAt: Date.now(),
      data: { amount: 18, category: 'food' },
    });
    const updated = updateNote(uid, note.id, {
      data: { amount: 28, category: 'groceries' },
      occurredAt: 1_700_000_000_000,
    });
    expect(updated.data.amount).toBe(28);
    expect(updated.data.category).toBe('groceries');
    expect(updated.occurredAt).toBe(1_700_000_000_000);
  });

  it('自定义模板字段 key 重复时拒绝保存', () => {
    expect(() => createNoteTemplate(uid, {
      name: '重复字段',
      description: '',
      icon: 'NotebookPen',
      tone: 'slate',
      kind: 'custom',
      titleField: 'title',
      fields: [
        { key: 'title', label: '标题', type: 'text' },
        { key: 'title', label: '重复标题', type: 'text' },
      ],
    })).toThrow(/字段 key/);
  });

  it('自定义模板与内置模板重名时给出明确错误', () => {
    expect(() => createNoteTemplate(uid, {
      name: '记支出',
      description: '',
      icon: 'WalletCards',
      tone: 'rose',
      kind: 'expense',
      titleField: 'title',
      fields: [{ key: 'title', label: '标题', type: 'text' }],
    })).toThrow(/内置名称/);
  });

  it('分类级字段必须引用一个绑定字典的单选/多选字段', () => {
    const valid = createNoteTemplate(uid, {
      name: '分类联动模板',
      description: '',
      icon: 'NotebookPen',
      tone: 'slate',
      kind: 'custom',
      titleField: 'title',
      fields: [
        { key: 'title', label: '标题', type: 'text' },
        {
          key: 'category',
          label: '业务分类',
          type: 'select',
          dictionaryId: 'dict.expense_category',
        },
        {
          key: 'supplier',
          label: '供应商',
          type: 'text',
          visibleWhen: { field: 'category', equals: 'food' },
        },
      ],
    });
    expect(valid.fields.find((field) => field.key === 'supplier')?.visibleWhen)
      .toEqual({ field: 'category', equals: 'food' });

    expect(() => createNoteTemplate(uid, {
      name: '无效分类联动',
      description: '',
      icon: 'NotebookPen',
      tone: 'slate',
      kind: 'custom',
      titleField: 'title',
      fields: [
        { key: 'title', label: '标题', type: 'text' },
        { key: 'category', label: '分类', type: 'text' },
        {
          key: 'supplier',
          label: '供应商',
          type: 'text',
          visibleWhen: { field: 'category', equals: 'food' },
        },
      ],
    })).toThrow(/显示条件/);
  });
});
