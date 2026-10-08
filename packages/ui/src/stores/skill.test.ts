/**
 * skills 存储的 JSON 字段解析守门测试。
 *
 * ★★★ 为什么必须钉住（2026-10-07 真实缺陷）：
 *   `db.ts` 落库 `NOVEL_TUIWEN_FILES` 时漏了 `JSON.stringify`，驱动把数组写成 blob；
 *   前端 `rowToSkill` 的 `JSON.parse` 收到非字符串**抛 SyntaxError** →
 *   `.map(rowToSkill)` 整体中断 → `loadSkills()` 失败。
 *   表象是「技能列表空 + 每次进应用一条 Uncaught (in promise)」，**零用户可见提示**，
 *   而根因在**远端另一条内置 skill 的书写错误**上 —— 没有测试根本定位不到。
 *
 * 两条边界缺一不可：
 *   ① 脏数据（blob/对象）只让**那一条**降级，不能让整个列表消失；
 *   ② `loadSkills` 自身不能把异常逃逸出去（否则就是又一条未捕获拒绝）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// ---- 轻量桩：本测试只关心 rowToSkill / loadSkills 的健壮性，不拉真实 pinia 依赖链 ----
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { api } from '../api/client';

/** useSkillStore 是 setup store，必须先激活 pinia 实例（否则 store 初始化即抛）。 */
async function freshStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./skill');
  return mod.useSkillStore();
}

describe('skill store · 脏 JSON 字段的降级', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('★★ blob/非字符串 files_json 只降级该条，不中断整个列表', async () => {
    // 第一条脏（模拟 blob 落库），第二条正常 —— 两条都必须活下来
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'bad_one', name: '脏数据技能', body: 'x', files_json: { 0: 0 } as unknown as string },
        { id: 'good_one', name: '正常技能', body: 'y', files_json: JSON.stringify([{ path: 'a.md', content: 'c' }]) },
      ],
    });
    const st = await freshStore();
    await st.loadSkills();
    const list = st.skills as unknown as Array<{ id: string; files?: unknown }>;
    expect(list.length).toBe(2);                       // ★ 关键：列表没被整条打没
    expect(list.find((s) => s.id === 'bad_one')!.files).toBeUndefined();
    expect(list.find((s) => s.id === 'good_one')!.files).toHaveLength(1);
  });

  it('★★ 非法 JSON 字符串降级为 undefined（不抛）', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'broken', name: '坏串', body: 'x', files_json: '{不是 JSON' }],
    });
    const st = await freshStore();
    await st.loadSkills();
    const list = st.skills as unknown as Array<{ files?: unknown; id: string }>;
    expect(list).toHaveLength(1);
    expect(list[0].files).toBeUndefined();
  });

  it('★ triggers_json 非法同样降级为空数组（不影响技能本身可用）', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 't1', name: '触发词坏了', body: 'x', triggers_json: 'oops' }],
    });
    const st = await freshStore();
    await st.loadSkills();
    const list = st.skills as unknown as Array<{ frontmatter: { triggers: string[] } }>;
    expect(list[0].frontmatter.triggers).toEqual([]);
  });

  it('★★ loadSkills 不得把异常逃逸出去（否则 = 一条未捕获 promise 拒绝）', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('后端挂了'));
    const st = await freshStore();
    // 不 reject 才算过：原实现只有 try/finally，异常会一路冒到 window
    await expect(st.loadSkills()).resolves.toBeUndefined();
  });

  it('正常数据完整保留（防过度防御把好数据也吞掉）', async () => {
    const files = [{ path: 'references/a.md', content: '# A' }];
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'ok', name: '正常', body: '# body', triggers_json: '["剪辑"]', files_json: JSON.stringify(files) }],
    });
    const st = await freshStore();
    await st.loadSkills();
    const s = (st.skills as unknown as Array<{ frontmatter: { triggers: string[] }; files: unknown; bodyMd: string }>)[0];
    expect(s.bodyMd).toBe('# body');
    expect(s.frontmatter.triggers).toEqual(['剪辑']);
    expect(s.files).toEqual(files);
  });
});