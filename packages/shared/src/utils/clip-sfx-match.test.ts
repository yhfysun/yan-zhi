/**
 * 音效匹配单测（按描述找音效）。
 * ★ 锁的是"常见剪辑意图能搜到对的那条"，以及"搜不到时不要硬凑"。
 */
import { describe, it, expect } from 'vitest';
import { matchSfx, normalizeSfxText, SFX_INTENT_HINTS, type SfxMatchItem } from './clip-sfx-match';

const ITEMS: SfxMatchItem[] = [
  { id: 'whoosh', label: '呼——', desc: '转场风声，最通用的镜头切换音', group: '转场' },
  { id: 'swish', label: '唰', desc: '短促掠过的切片感，适合快剪', group: '转场' },
  { id: 'impact', label: '撞击', desc: '低频重击，硬切/爆点收尾', group: '转场' },
  { id: 'hit', label: '鼓点', desc: '低频重击，卡点用', group: '节奏' },
  { id: 'kick', label: '底鼓', desc: '短促低频鼓，卡点主力', group: '节奏' },
  { id: 'heartbeat', label: '心跳', desc: '两声低频搏动，紧张/悬疑', group: '节奏' },
  { id: 'hum', label: '电流嗡鸣', desc: '低频持续嗡声，机房/紧张感', group: '氛围' },
  { id: 'ding', label: '叮', desc: '上扬提示音，强调信息点', group: '提示' },
  { id: 'notify', label: '提示', desc: '双音提示，用于要点罗列', group: '提示' },
  { id: 'success', label: '完成', desc: '轻快上扬，任务完成/达成', group: '提示' },
  { id: 'coin', label: '金币', desc: '高频双颤，奖励/得分', group: '提示' },
  { id: 'room', label: '室内底噪', desc: '极轻的房间环境音', group: '氛围' },
  { id: 'rain', label: '雨声', desc: '连续雨幕，外景/情绪铺垫', group: '氛围' },
  { id: 'fire', label: '篝火', desc: '噼啪低频，温暖/野外', group: '氛围' },
  { id: 'space', label: '太空', desc: '极低频缓慢起伏，科幻/未知', group: '氛围' },
  { id: 'tick', label: '滴答', desc: '轻微记拍声，倒数/计时感', group: '节奏' },
];

describe('normalizeSfxText', () => {
  it('去标点/空白并小写', () => {
    expect(normalizeSfxText(' 紧张 / 悬疑！ ')).toBe('紧张悬疑');
    expect(normalizeSfxText('Whoosh-01')).toBe('whoosh01');
  });
});

describe('matchSfx · 常见意图', () => {
  it('★ 紧张 → 心跳优先（意图词典 + 描述重叠）', () => {
    const r = matchSfx('紧张', ITEMS);
    expect(r.matched).toBe(true);
    expect(r.hits[0].item.id).toBe('heartbeat');
    expect(r.hits[0].reason).toContain('紧张氛围');
  });

  it('★ 转场 → 风声类优先', () => {
    const r = matchSfx('转场音', ITEMS);
    expect(r.hits[0].item.id).toBe('whoosh');
  });

  it('★ 卡点鼓 → 鼓点类优先（意图内按优先级）', () => {
    const r = matchSfx('卡点鼓', ITEMS);
    expect(r.hits[0].item.id).toBe('hit');
    expect(r.hits.map((h) => h.item.id)).toContain('kick');
  });

  it('「提示」先命中间名条目，其次同意图其它条目', () => {
    const r = matchSfx('提示', ITEMS);
    expect(r.hits[0].item.id).toBe('notify');
    expect(r.hits.map((h) => h.item.id)).toContain('ding');
  });

  it('中文口语「奖励」→ 金币', () => {
    const r = matchSfx('奖励动画', ITEMS);
    expect(r.hits[0].item.id).toBe('coin');
  });

  it('英文 id 也能搜（impact / heartbeat）', () => {
    expect(matchSfx('impact', ITEMS).hits[0].item.id).toBe('impact');
    expect(matchSfx('heartbeat', ITEMS).hits[0].item.id).toBe('heartbeat');
  });
});

describe('matchSfx · 边界', () => {
  it('★ 搜不到就返回 matched=false（不硬凑无关音效）', () => {
    const r = matchSfx('量子纠缠', ITEMS);
    expect(r.matched).toBe(false);
    expect(r.hits).toEqual([]);
  });

  it('空查询 / 空库 → 空结果', () => {
    expect(matchSfx('', ITEMS)).toMatchObject({ hits: [], matched: false });
    expect(matchSfx('紧张', [])).toMatchObject({ hits: [], matched: false });
  });

  it('limit 生效且同分保持库内顺序（确定性）', () => {
    const r = matchSfx('低频', ITEMS, { limit: 2 });
    expect(r.hits.length).toBe(2);
    const all = matchSfx('低频', ITEMS, { limit: 99 }).hits;
    expect(all.slice(0, 2).map((h) => h.item.id)).toEqual(r.hits.map((h) => h.item.id));
  });

  it('意图词典结构合法（每条都有词/推荐/原因）', () => {
    for (const h of SFX_INTENT_HINTS) {
      expect(h.words.length).toBeGreaterThan(0);
      expect(h.ids.length).toBeGreaterThan(0);
      expect(h.reason).toBeTruthy();
    }
  });
});
