/**
 * 事类词库契约测试（姻缘 / 前程 / 搬家 / 开业 / 出行…这套骨架的数据质量闸）。
 * 词库是用户「算事情」入口的唯一数据源：id 重复、出处缺失、易错对丢失、
 * 搜索词失灵，任何一条坏了都会变成「点了没反应」或「数据是编的」。
 */
import { describe, it, expect } from 'vitest'
import {
  ZHOUYI_CASES, zhouyiCaseSearch, zhouyiCaseById, ZHOUYI_CASE_HOT,
} from './cases'
import type { DivinationMethod } from './types'

const VALID_METHODS: DivinationMethod[] = ['meihua', 'dayan', 'liuyao', 'sizhu', 'bazhai', 'xuankong', 'wuxing', 'zari'];

describe('周易事类词库', () => {
  it('条目结构完整：id 唯一、名称与白话非空、出处为公版', () => {
    const ids = new Set<string>();
    for (const e of ZHOUYI_CASES) {
      expect(ids.has(e.id), `id 重复：${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.plain.length).toBeGreaterThan(0);
      expect(e.methods.length).toBeGreaterThan(0);
      for (const m of e.methods) expect(VALID_METHODS, `${e.id} 推荐占法 ${m} 不合法`).toContain(m);
      expect(e.sourceRef.work.length).toBeGreaterThan(0);
      expect(e.sourceRef.license).toBe('公版');
    }
    expect(ZHOUYI_CASES.length).toBeGreaterThanOrEqual(45);
  });

  it('易错对必须写清：动土≠破土、入宅≠移徙', () => {
    const dongtu = ZHOUYI_CASES.find((e) => e.name === '动土');
    const potu = ZHOUYI_CASES.find((e) => e.name === '破土');
    const ruzhai = ZHOUYI_CASES.find((e) => e.name === '入宅');
    const yixi = ZHOUYI_CASES.find((e) => e.name === '移徙');
    expect(dongtu?.note).toContain('阳宅');
    expect(dongtu?.note).toContain('破土');
    expect(potu?.note).toContain('阴宅');
    expect(potu?.note).toContain('动土');
    expect(ruzhai?.note).toContain('移徙');
    expect(yixi?.yongshen).toContain('鬼爻乱动');
  });

  it('六爻用神口径带《卜筮正宗》出处；命理口径不生成个人化断语', () => {
    const gongming = zhouyiCaseById('case_gongming');
    expect(gongming?.yongshen).toContain('官鬼爻');
    expect(gongming?.sourceRef.work).toBe('卜筮正宗');
    for (const e of ZHOUYI_CASES) {
      // 用神是规则口径，不得出现面向用户个人的预测句式
      expect(e.yongshen ?? '').not.toMatch(/你(该|会|近期)/);
    }
  });

  it('口语搜索命中：姻缘 / 前程 / 搬家 / 吉凶 / 算事情', () => {
    const names = (q: string) => zhouyiCaseSearch(q).map((e) => e.name);
    expect(names('姻缘')).toContain('婚姻');
    expect(names('前程')).toContain('功名');
    expect(names('前程')).toContain('仕宦');
    expect(names('搬家')).toContain('移徙');
    expect(names('吉凶')).toContain('占事');
    expect(names('算事情')).toContain('占事');
    expect(names('开业')).toContain('开市');
    expect(names('丢东西')).toContain('失物');
  });

  it('搜索空查询返回空；未命中返回空且不抛错', () => {
    expect(zhouyiCaseSearch('')).toEqual([]);
    expect(zhouyiCaseSearch('   ')).toEqual([]);
    expect(zhouyiCaseSearch('不存在的词xyz')).toEqual([]);
  });

  it('热门 chips 的 caseId 都真实存在（防「点了没反应」）', () => {
    for (const h of ZHOUYI_CASE_HOT) {
      expect(zhouyiCaseById(h.caseId), `${h.word} → ${h.caseId} 不存在`).toBeTruthy();
    }
  });
});
