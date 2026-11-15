import { describe, expect, it } from 'vitest';
import { judgeCouplet, type CoupletCandidate } from './couplet';

const c = (ch: string, pos: CoupletCandidate['pos'], tone: CoupletCandidate['tone']): CoupletCandidate => ({ ch, pos, tone });

// 出句「风来花自舞」（平平平仄仄）→ 期望对句 仄仄仄平平，词性 名/动/名/副/形
const EXPECT_POS: CoupletCandidate['pos'][] = ['名', '动', '名', '副', '形'];
const EXPECT_TONE: CoupletCandidate['tone'][] = ['仄', '仄', '仄', '平', '平'];
const SNOW_LINE = [c('雪', '名', '仄'), c('尽', '动', '仄'), c('柳', '名', '仄'), c('初', '副', '平'), c('新', '形', '平')];

describe('judgeCouplet 对句三项判卷', () => {
  it('范本「雪尽柳初新」三项全过', () => {
    const r = judgeCouplet(EXPECT_POS, EXPECT_TONE, SNOW_LINE);
    expect(r.pass).toBe(true);
    expect(r.lengthOk).toBe(true);
    expect(r.posAllOk).toBe(true);
    expect(r.toneAllOk).toBe(true);
    expect(r.firstToneIssue).toBeNull();
    expect(r.firstPosIssue).toBeNull();
  });

  it('平仄错给出首个具体问题（第 1 字「春」应仄）', () => {
    const r = judgeCouplet(EXPECT_POS, EXPECT_TONE, [c('春', '名', '平'), ...SNOW_LINE.slice(1)]);
    expect(r.pass).toBe(false);
    expect(r.toneOkCount).toBe(4);
    expect(r.firstToneIssue).toBe('第 1 字「春」应仄');
  });

  it('词性错给出首个具体问题', () => {
    // 「语」标为动，但期望第 5 位是形
    const r = judgeCouplet(EXPECT_POS, EXPECT_TONE, [c('雪', '名', '仄'), c('尽', '动', '仄'), c('柳', '名', '仄'), c('初', '副', '平'), c('语', '动', '仄')]);
    expect(r.pass).toBe(false);
    expect(r.firstPosIssue).toBe('第 5 字「语」应为形词');
    // 平仄这一位（仄 vs 期望平）也应报
    expect(r.firstToneIssue).toBe('第 5 字「语」应平');
  });

  it('未填满：字数不过，pass 为 false，且不产生虚假 issue', () => {
    const r = judgeCouplet(EXPECT_POS, EXPECT_TONE, [SNOW_LINE[0], null, SNOW_LINE[2], null, SNOW_LINE[4]]);
    expect(r.filled).toBe(3);
    expect(r.lengthOk).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.firstToneIssue).toBeNull();
    expect(r.firstPosIssue).toBeNull();
  });

  it('逐位判定随结果返回（供 UI 逐格高亮）', () => {
    const r = judgeCouplet(EXPECT_POS, EXPECT_TONE, SNOW_LINE);
    expect(r.slots).toHaveLength(5);
    expect(r.slots.every((s) => s.posOk && s.toneOk)).toBe(true);
  });

  it('超长输入按期望截断，不崩溃', () => {
    const r = judgeCouplet(['名'] as CoupletCandidate['pos'][], ['仄'] as CoupletCandidate['tone'][], [c('雪', '名', '仄'), c('尽', '动', '仄')]);
    expect(r.required).toBe(1);
    expect(r.pass).toBe(true);
  });

  it('一字对：天(平) 对 地(仄) —— 名词位', () => {
    const r = judgeCouplet(['名'], ['仄'], [c('地', '名', '仄')]);
    expect(r.pass).toBe(true);
    const wrong = judgeCouplet(['名'], ['仄'], [c('海', '名', '仄')]);
    expect(wrong.pass).toBe(true); // 海也是仄声名词，判卷只看口径不看意境
  });
});
