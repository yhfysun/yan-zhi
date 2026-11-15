// 典籍文库数据层回归（learning/culture/canon-store.ts）。
// ★ 钉死两类「静默失效」：① 导入不幂等 → 重启后文库翻倍/FTS 串行；
//   ② assisted 覆盖 verified → AI 输出污染人工注解（用户拍板硬约束）。
// 另钉 B1/B2：传统文化课程必须能从 getCourses 出来（漏学段/漏 kind 分支 = 整组静默消失）。
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import {
  ensureCanonSeedImported, upsertCanonWorks, searchCanonWorks, getCanonWork,
  canonCollections, dailyCanonWork, upsertCanonGloss, listCanonGloss,
} from '../src/learning/culture/canon-store';
import { CANON_SEED_WORKS } from '../src/learning/culture/canon-data';
import { getCourses } from '../src/learning/service';

beforeEach(() => {
  db.prepare('DELETE FROM canon_gloss').run();
  db.prepare('DELETE FROM canon_work').run();
});

describe('canon 导入与检索', () => {
  it('首启导精选集，幂等可重跑（总量不翻倍）', () => {
    const first = ensureCanonSeedImported();
    expect(first.imported).toBe(true);
    expect(first.total).toBe(CANON_SEED_WORKS.length);
    const second = ensureCanonSeedImported();
    expect(second.imported).toBe(false);
    expect(second.total).toBe(CANON_SEED_WORKS.length);
  });

  it('upsertCanonWorks 重跑全走 UPDATE，行数与 FTS 行数一致', () => {
    upsertCanonWorks(CANON_SEED_WORKS);
    const r2 = upsertCanonWorks(CANON_SEED_WORKS);
    expect(r2.inserted).toBe(0);
    expect(r2.updated).toBe(CANON_SEED_WORKS.length);
    const workRows = (db.prepare('SELECT COUNT(*) AS c FROM canon_work').get() as { c: number }).c;
    const ftsRows = (db.prepare("SELECT COUNT(*) AS c FROM canon_fts").get() as { c: number }).c;
    expect(ftsRows).toBe(workRows);
  });

  it('★ FTS5 名句反查：「粒粒皆辛苦」命中悯农；「千磨万击还坚劲」命中竹石（unicode61 按标点分段，整句口径）', () => {
    upsertCanonWorks(CANON_SEED_WORKS);
    const r1 = searchCanonWorks({ q: '粒粒皆辛苦' });
    expect(r1.total).toBeGreaterThanOrEqual(1);
    expect(r1.items.some((w) => w.title.includes('悯农'))).toBe(true);
    const r2 = searchCanonWorks({ q: '千磨万击还坚劲' });
    expect(r2.items.some((w) => w.title.includes('竹石'))).toBe(true);
    const r3 = searchCanonWorks({ q: '竹石' });
    expect(r3.items.some((w) => w.title.includes('竹石'))).toBe(true);
  });

  it('★ 五维筛选：朝代聚合后先秦到明清九段都有内容（用户拍板：不只唐诗）', () => {
    upsertCanonWorks(CANON_SEED_WORKS);
    const cols = canonCollections();
    const dynasties = new Set(cols.dynasties.map((d) => d.key));
    for (const d of ['先秦', '两汉', '魏晋南北朝', '唐', '五代', '宋', '元', '明', '清']) {
      expect(dynasties.has(d), `文库缺朝代段：${d}`).toBe(true);
    }
    expect(cols.total).toBe(CANON_SEED_WORKS.length);
  });

  it('分页：page/pageSize 有效，total 不随分页变化', () => {
    upsertCanonWorks(CANON_SEED_WORKS);
    const p1 = searchCanonWorks({ page: 1, pageSize: 10 });
    const p2 = searchCanonWorks({ page: 2, pageSize: 10 });
    expect(p1.items).toHaveLength(10);
    expect(p1.total).toBe(CANON_SEED_WORKS.length);
    expect(p1.items[0].id).not.toBe(p2.items[0]?.id ?? '');
  });

  it('getCanonWork 返回 tags 数组；daily 当天两次调用同一篇', () => {
    upsertCanonWorks(CANON_SEED_WORKS);
    const w = getCanonWork('canon_tang_jingyesi');
    expect(w).toBeTruthy();
    expect(w!.tags).toContain('思乡');
    const d1 = dailyCanonWork();
    const d2 = dailyCanonWork();
    expect(d1?.id).toBe(d2?.id);
  });
});

describe('canon_gloss 注解缓存', () => {
  const workId = 'canon_tang_jingyesi';

  it('★ assisted 不覆盖 verified（用户拍板：精读层注解全人工）', () => {
    upsertCanonGloss({ workId, term: '疑', plain: '人工：恍惚间当成', origin: 'verified' });
    upsertCanonGloss({ workId, term: '疑', plain: 'AI 生成：大概是怀疑', origin: 'assisted' });
    const glosses = listCanonGloss(workId);
    expect(glosses).toHaveLength(1);
    expect(glosses[0].origin).toBe('verified');
    expect(glosses[0].plain).toBe('人工：恍惚间当成');
  });

  it('verified 可以覆写 assisted；同源更新照常生效', () => {
    upsertCanonGloss({ workId, term: '霜', plain: 'AI 草稿', origin: 'assisted' });
    upsertCanonGloss({ workId, term: '霜', plain: '人工定稿', origin: 'verified' });
    expect(listCanonGloss(workId)[0].origin).toBe('verified');
    upsertCanonGloss({ workId, term: '霜', plain: '人工定稿 v2', origin: 'verified' });
    expect(listCanonGloss(workId)[0].plain).toBe('人工定稿 v2');
  });
});

describe('★ 传统文化课程接线（B1/B2 钉子：漏学段/漏 kind 分支 = 整组静默消失）', () => {
  it("getCourses('传统文化') 返回 4 门课且学段在列", () => {
    const groups = getCourses('user_b1', '传统文化');
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const courses = groups.flatMap((g) => g.courses);
    expect(courses).toHaveLength(4);
    expect(courses.every((c) => c.kind === 'culture')).toBe(true);
    expect(courses.map((c) => c.name)).toContain('蒙学 · 对韵起步');
  });
});

describe('★ 精选集扩量（§4.8 遗留②：随包语料 45 → ≥180，九段均衡）', () => {
  const works = CANON_SEED_WORKS;
  const DYNASTIES = ['先秦', '两汉', '魏晋南北朝', '唐', '五代', '宋', '元', '明', '清'] as const;

  it('总量 ≥180；id 唯一且全部带 canon_ 前缀', () => {
    expect(works.length).toBeGreaterThanOrEqual(180);
    const ids = new Set(works.map((w) => w.id));
    expect(ids.size, '存在重复 id').toBe(works.length);
    expect(works.every((w) => w.id.startsWith('canon_'))).toBe(true);
  });

  it('九个朝代段每段 ≥10 篇', () => {
    for (const d of DYNASTIES) {
      const n = works.filter((w) => w.dynasty === d).length;
      expect(n, `${d} 段仅 ${n} 篇`).toBeGreaterThanOrEqual(10);
    }
  });

  it('notable 冷门佳作 ≥25；genre 六类（经/诗/词/曲/文/蒙学）各有内容', () => {
    expect(works.filter((w) => w.popularity === 'notable').length).toBeGreaterThanOrEqual(25);
    for (const g of ['经', '诗', '词', '曲', '文', '蒙学']) {
      expect(works.some((w) => w.genre === g), `缺体裁：${g}`).toBe(true);
    }
  });

  it('每篇 text 长度 ≥4、不含换行符以外控制字符、source 非空', () => {
    for (const w of works) {
      expect(w.text.length, `${w.id} text 过短`).toBeGreaterThanOrEqual(4);
      expect(/[\u0000-\u0009\u000B-\u001F\u007F]/.test(w.text), `${w.id} 含非法控制字符`).toBe(false);
      expect(w.source.trim().length, `${w.id} source 为空`).toBeGreaterThan(0);
    }
  });
});
