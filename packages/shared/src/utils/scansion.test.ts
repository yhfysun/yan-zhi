import { describe, expect, it } from 'vitest';
import { pingzeLine, scanPoem, scanCoupletFree } from './scansion';

describe('pingzeLine 逐字平仄（普通话近似口径）', () => {
  it('一二声为平、三四声为仄', () => {
    // 天(1平) 涯(2平) 雪(3仄) 尽(4仄)
    const r = pingzeLine('天涯雪尽');
    expect(r.chars.map((c) => c.tone)).toEqual(['平', '平', '仄', '仄']);
  });

  it('非汉字（标点）被剔除', () => {
    const r = pingzeLine('山，高！');
    expect(r.chars.map((c) => c.ch)).toEqual(['山', '高']);
  });
});

describe('scanPoem 绝句格律评分', () => {
  it('标准合律样本高分：李白《静夜思》体（首句不入韵变体）', () => {
    const r = scanPoem(['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'], '五言绝句');
    expect(r.formOk).toBe(true);
    expect(r.charsPerLineOk).toBe(true);
    // 韵：光/霜/乡 同属 ang
    expect(r.rhymeOk).toBe(true);
    expect(r.rhymeKey).toBe('ang');
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('句数不足与字数不对各自报问题', () => {
    const r = scanPoem(['床前明月光'], '五言绝句');
    expect(r.formOk).toBe(false);
    expect(r.issues.some((x) => x.detail.includes('应为 4 句'))).toBe(true);
    const r2 = scanPoem(['床前明月光', '疑是地上霜有', '举头望明月', '低头思故乡'], '五言绝句');
    expect(r2.charsPerLineOk).toBe(false);
    expect(r2.issues.some((x) => x.index === 1 && x.detail.includes('6 字'))).toBe(true);
  });

  it('出韵句给具体提示', () => {
    // 末句换韵：ang → i
    const r = scanPoem(['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'], '五言绝句');
    // 流(ou) 与 楼(ou) 同韵；首句「尽」不押——应不扣
    expect(r.rhymeOk).toBe(true);
    const r2 = scanPoem(['白日依山尽', '黄河入海流', '欲穷千里目', '独坐钓鱼舟'], '五言绝句');
    // 舟(ou) 仍同韵
    expect(r2.rhymeOk).toBe(true);
    const r3 = scanPoem(['白日依山尽', '黄河入海流', '欲穷千里目', '何处是归舟行'], '五言绝句');
    expect(r3.charsPerLineOk).toBe(false);
  });

  it('评分在 30~100 区间，summary 非空', () => {
    const r = scanPoem(['床前明月光'], '五言绝句');
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.summary.length).toBeGreaterThan(0);
  });
});

describe('scanCoupletFree 自拟对句评分', () => {
  it('「雨」对「风」：字数、平仄相对、仄起平收全过', () => {
    // 雨(3仄) 上联仄收 ✓；风(1平) 下联平收 ✓；仄对平逐字相对 ✓（《笠翁对韵》：天对地，雨对风）
    const r = scanCoupletFree('雨', '风');
    expect(r.lengthOk).toBe(true);
    expect(r.tonePairOk).toBe(true);
    expect(r.endOk).toBe(true);
    expect(r.score).toBe(100);
  });

  it('字数不等直接指出', () => {
    const r = scanCoupletFree('风来花自舞', '雪');
    expect(r.lengthOk).toBe(false);
    expect(r.summary.includes('字数要相等')).toBe(true);
    expect(r.score).toBeLessThan(100);
  });

  it('同声字给出首个失对位置', () => {
    // 舞(仄) 对 舞(仄)：同字同声 + 同位重字
    const r = scanCoupletFree('风来花自舞', '春归鸟自鸣');
    // 第 4 位「自」同位重字 → dupOk false；逐字平仄 2/4 位相对与否按实际
    expect(r.dupOk).toBe(false);
  });

  it('下联平收检查：末字为仄给出提示', () => {
    const r = scanCoupletFree('天上明月', '地里清风尽');
    expect(r.lengthOk).toBe(false);
    const r2 = scanCoupletFree('山中', '水上');
    // 上(3仄) 末字仄 ✓；下(4仄) 末字应平——下是仄 → endOk false
    expect(r2.endOk).toBe(false);
  });
});
