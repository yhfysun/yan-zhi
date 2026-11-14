// 笔记服务层回归（notes/service.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离到临时目录）。
// 覆盖方案 §6 声明的验收面：分类唯一索引幂等 / 自动创建语义 / 删除分类迁移笔记 / 收藏置顶切换 /
// drain 幂等（两次 drain 不重复）/ 用户隔离（A 的笔记 B 查不到）。
// 这是「写入 ≠ 生效」的主战场：表里必须真的长出预期的行。
import { describe, it, expect } from 'vitest';
import {
  ensureCategory, listCategories, renameCategory, deleteCategory,
  createNote, updateNote, listNotes, toggleStar, togglePin, deleteNote,
  dueReminders, drainReminders, ackReminders,
} from '../src/notes/service';

const uidA = `note-user-a-${Date.now()}`;
const uidB = `note-user-b-${Date.now()}`;

describe('笔记分类 · 唯一索引与自动创建', () => {
  it('★ 同名分类幂等创建：INSERT OR IGNORE 后查回同一行（不炸不重复）', () => {
    const c1 = ensureCategory(uidA, '英语');
    const c2 = ensureCategory(uidA, '英语');
    expect(c2.id).toBe(c1.id);
    // 表里真的只有一行
    const cats = listCategories(uidA).filter((c) => c.id !== '__none__');
    expect(cats.filter((c) => c.name === '英语').length).toBe(1);
  });

  it('同名不同用户不冲突：(user_id, name) 唯一索引按用户隔离', () => {
    const a = ensureCategory(uidA, '工作');
    const b = ensureCategory(uidB, '工作');
    expect(a.id).not.toBe(b.id);
  });

  it('重命名撞名给明确错误，不静默合并', () => {
    ensureCategory(uidA, '工作');
    const target = ensureCategory(uidA, '阅读');
    expect(() => renameCategory(uidA, target.id, '工作')).toThrow(/已存在/);
  });

  it('★ 删除分类：该分类下的笔记迁到「未分类」（category_id=NULL），不丢数据', () => {
    const cat = ensureCategory(uidA, '将删分类');
    const note = createNote(uidA, { title: '迁移样本', categoryName: '将删分类' });
    deleteCategory(uidA, cat.id);
    const after = listNotes(uidA, { categoryId: 'none' });
    expect(after.some((n) => n.id === note.id)).toBe(true);
    expect(after.find((n) => n.id === note.id)!.categoryName).toBeNull();
  });
});

describe('笔记 CRUD · 收藏/置顶分离', () => {
  it('创建：category_name 直传自动建分类；kind 缺省 note', () => {
    const n = createNote(uidA, { title: '带分类创建', content: '# 正文', categoryName: '自动建类' });
    expect(n.kind).toBe('note');
    expect(n.categoryName).toBe('自动建类');
    // 分类真的建出来了（自动创建语义，方案 §2 用户拍板）
    expect(listCategories(uidA).some((c) => c.name === '自动建类')).toBe(true);
  });

  it('★ 收藏与置顶互不干扰（两个独立维度）', () => {
    const n = createNote(uidA, { title: '维度样本' });
    expect(toggleStar(uidA, n.id)).toBe(true);
    let row = listNotes(uidA).find((x) => x.id === n.id)!;
    expect(row.starred).toBe(true);
    expect(row.pinned).toBe(false);
    expect(togglePin(uidA, n.id)).toBe(true);
    row = listNotes(uidA).find((x) => x.id === n.id)!;
    expect(row.starred).toBe(true);   // 置顶不动收藏
    expect(row.pinned).toBe(true);
  });

  it('置顶项排在列表前面（pinned DESC）', () => {
    const plain = createNote(uidA, { title: '普通排序项' });
    const pin = createNote(uidA, { title: '置顶排序项' });
    togglePin(uidA, pin.id);
    const rows = listNotes(uidA, { q: '排序项' });
    expect(rows.some((r) => r.id === pin.id)).toBe(true);
    expect(rows.some((r) => r.id === plain.id)).toBe(true);
    expect(rows.findIndex((r) => r.id === pin.id)).toBeLessThan(rows.findIndex((r) => r.id === plain.id));
  });

  it('全文搜索命中标题与正文，LIKE 通配符不注入', () => {
    createNote(uidA, { title: '搜索标题甲', content: '正文里有独特词 quasi-unique-token' });
    expect(listNotes(uidA, { q: '搜索标题甲' }).length).toBeGreaterThan(0);
    expect(listNotes(uidA, { q: 'quasi-unique' }).length).toBeGreaterThan(0);
    // 用户输入 % 不应匹配全部
    expect(listNotes(uidA, { q: '%' }).length).toBe(0);
  });

  it('删除笔记后查不到；更新不存在 id 报错', () => {
    const n = createNote(uidA, { title: '待删除' });
    deleteNote(uidA, n.id);
    expect(listNotes(uidA, { q: '待删除' }).length).toBe(0);
    expect(() => updateNote(uidA, 'nt_not_exist', { title: 'x' })).toThrow(/不存在/);
  });
});

describe('★ 用户隔离', () => {
  it('A 的笔记 B 查不到（列表/搜索双路径）', () => {
    createNote(uidA, { title: 'A 的私密笔记-unique-isolation' });
    expect(listNotes(uidB, { q: 'unique-isolation' }).length).toBe(0);
    expect(listNotes(uidB, { q: 'unique-isolation' })).toEqual([]);
  });

  it('A 的分类列表里没有 B 的分类', () => {
    ensureCategory(uidB, 'B 独有分类');
    expect(listCategories(uidA).some((c) => c.name === 'B 独有分类')).toBe(false);
  });
});

describe('★ 到期提醒 · drain 幂等', () => {
  it('两次 drain 第二次必为空（取走即标记，桌面轮询绝不重复提醒）', () => {
    const n = createNote(uidA, { title: '到期的计划', kind: 'plan', planAt: Date.now() - 60_000, remindAt: Date.now() - 60_000 });
    const first = drainReminders();
    expect(first.some((r) => r.id === n.id)).toBe(true);
    const second = drainReminders();
    expect(second.some((r) => r.id === n.id)).toBe(false);
    // 库里标记生效
    const row = listNotes(uidA).find((x) => x.id === n.id)!;
    expect(row.remindDone).toBe(true);
  });

  it('未到期的不 drain（remind_at > now 不取）', () => {
    const n = createNote(uidA, { title: '未来的计划', remindAt: Date.now() + 3600_000 });
    expect(drainReminders().some((r) => r.id === n.id)).toBe(false);
    expect(dueReminders().some((r) => r.id === n.id)).toBe(false);
  });

  it('due（只读）→ ack 显式确认：ack 后 due 清空', () => {
    const n = createNote(uidA, { title: 'Web 红点样本', remindAt: Date.now() - 120_000 });
    expect(dueReminders().some((r) => r.id === n.id)).toBe(true);
    expect(ackReminders([n.id])).toBe(1);
    expect(dueReminders().some((r) => r.id === n.id)).toBe(false);
    // drain 与 due/ack 互不干扰：已 ack 的 drain 也不取
    expect(drainReminders().some((r) => r.id === n.id)).toBe(false);
  });
});
