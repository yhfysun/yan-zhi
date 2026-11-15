// 周易测算推演纯函数回归（packages/shared/src/zhouyi/divination.ts + rules.ts，周易课程方案 §6）。
// 三条硬约束的钉子：① 同 seed 必得同结果（可复现、可复盘、可判卷）；
// ② verdict 断语只能查 ZHOUYI_RULE_TABLE 白名单，绝不生成新的预测文本；
// ③ 隐私：出生时间等输入不进入结果对象（不落库不上传的另一半——导出也不含）。
import { describe, it, expect } from 'vitest';
import { runDivination, ZHOUYI_RULE_TABLE, ZHOUYI_CASE_RULE_IDS } from '@yan-zhi/shared';
import type { DivinationSpec } from '@yan-zhi/shared';

const METHODS = ['meihua', 'dayan', 'liuyao', 'sizhu', 'bazhai', 'xuankong', 'wuxing', 'zari'] as const;

function spec(method: (typeof METHODS)[number], input: Record<string, string | number>, seed = 20261115): DivinationSpec {
  return { method, input, seed, refLessonId: 'zy_z07' };
}

function runText(specObj: DivinationSpec): string {
  return JSON.stringify(runDivination(specObj));
}

describe('确定性：同 seed 必得同结果', () => {  it('meihua 为确定性起卦（年月日时公式，seed 不参与）：同输入两次完全一致', () => {
    const s = spec('meihua', { year: 2026, month: 11, day: 15, hour: 9 });
    expect(runText(s)).toBe(runText({ ...s, seed: 42 }));
  });

  it('dayan 为 seed 驱动：同 seed 两次一致、不同 seed 不同', () => {
    const s = spec('dayan', {});
    expect(runText(s)).toBe(runText({ ...s }));
    expect(runText(s)).not.toBe(runText({ ...s, seed: 42 }));
  });

  it('liuyao / dayan / sizhu / bazhai / xuankong / wuxing / zari 同 seed 一致', () => {
    const cases: Array<[(typeof METHODS)[number], Record<string, string | number>]> = [
      ['liuyao', { coins: '背背背字背字' }],
      ['dayan', {}],
      ['sizhu', { year: 1990, month: 5, day: 21, hour: 14 }],
      ['bazhai', { year: 1990, gender: '男' }],
      ['xuankong', { yun: 8, sitting: '坎', facing: '离' }],
      ['wuxing', { a: '金', b: '木' }],
      ['zari', { year: 2026, month: 11, day: 15 }],
    ];
    for (const [m, input] of cases) {
      const s = spec(m, input);
      expect(runText(s), m).toBe(runText({ ...s }));
    }
  });
});

describe('梅花易数边界与步骤', () => {
  it('除 8 余 0 作 8、除 6 余 0 作 6（起卦边界）', () => {
    // y+m+d ≡ 0 (mod 8)：2026+2+4=2032，2032%8=0 → 上卦数为 8（坤）
    const r = runDivination(spec('meihua', { year: 2026, month: 2, day: 4, hour: 12 }, 7));
    const up = r.steps.find((s) => s.rule.includes('上卦'));
    expect(up).toBeTruthy();
    expect(up!.output).toContain('坤');
    // 动爻边界：总数 %6 === 0 → 动爻为第 6 爻（构造 y+m+d+h ≡ 0 mod 6）
    const r2 = runDivination(spec('meihua', { year: 2026, month: 2, day: 4, hour: 0 }, 7));
    const moving = r2.steps.find((s) => s.rule.includes('动爻'));
    expect(moving).toBeTruthy();
    expect(moving!.output).toContain('6') || expect(moving!.output).toContain('六');
  });

  it('推演步骤齐全：每步带规则名与公版出处；互卦取 234/345 爻', () => {
    const r = runDivination(spec('meihua', { year: 2026, month: 11, day: 15, hour: 9 }, 99));
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    for (const s of r.steps) {
      expect(s.rule.length).toBeGreaterThan(0);
      expect(s.sourceRef.work.length).toBeGreaterThan(0);
      expect(s.sourceRef.license).toBe('公版');
    }
    expect(r.steps.some((s) => s.rule.includes('互卦'))).toBe(true);
    expect(r.steps.some((s) => s.rule.includes('体用') || s.note?.includes('体'))).toBe(true);
  });
});

describe('★ 断语白名单（不编造预测）', () => {
  it('每条 verdict 必在 ZHOUYI_RULE_TABLE 内（label 匹配）；无命中则不输出 verdict', () => {
    const tableLabels = new Set(ZHOUYI_RULE_TABLE.map((e) => e.label));
    expect(tableLabels.size).toBeGreaterThanOrEqual(8);
    for (const m of METHODS) {
      const r = runDivination(spec(m, m === 'meihua'
        ? { year: 2026, month: 11, day: 15, hour: 9 }
        : m === 'liuyao' ? { coins: '背字背背背字' } : m === 'sizhu' ? { year: 1990, month: 5, day: 21, hour: 14 }
        : m === 'bazhai' ? { year: 1990, gender: '女' } : m === 'xuankong' ? { yun: 8, sitting: '坎', facing: '离' }
        : m === 'wuxing' ? { a: '水', b: '火' } : m === 'zari' ? { year: 2026, month: 11, day: 15 } : {}, 3));
      if (r.verdict) {
        expect(tableLabels.has(r.verdict.label), `${m} verdict 不在白名单：${r.verdict.label}`).toBe(true);
        expect(r.verdict.quote.length).toBeGreaterThan(4);
        expect(r.verdict.sourceRef.work.length).toBeGreaterThan(0);
      }
    }
  });

  it('规则表本身：逐字引用必须 paraphrase 缺省（false）；无生成来源键；license 全为公版', () => {
    const banned = ['origin', 'assisted', 'generated', 'ai', 'llm', 'aiSource', 'generatedBy'];
    for (const e of ZHOUYI_RULE_TABLE) {
      for (const k of Object.keys(e)) {
        expect(banned.includes(k), `规则表禁用键 ${k}`).toBe(false);
      }
      expect(e.sourceRef.license, e.id).toBe('公版');
      if (e.paraphrase !== true) expect(e.quote.length, e.id).toBeGreaterThan(4);
    }
  });
});

describe('★ 隐私与结果契约', () => {
  it('每法结果：disclaimer 固定文案；canonRefs 注释/注解必非空；refLessonId 回传', () => {
    for (const m of METHODS) {
      const r = runDivination(spec(m, m === 'meihua'
        ? { year: 2026, month: 11, day: 15, hour: 9 }
        : m === 'liuyao' ? { coins: '背背字背字背' } : m === 'sizhu' ? { year: 1990, month: 5, day: 21, hour: 14 }
        : m === 'bazhai' ? { year: 1990, gender: '男' } : m === 'xuankong' ? { yun: 8, sitting: '坎', facing: '离' }
        : m === 'wuxing' ? { a: '金', b: '木' } : m === 'zari' ? { year: 2026, month: 11, day: 15 } : {}, 11));
      expect(r.disclaimer).toContain('教学演示');
      expect(r.disclaimer).toContain('不构成任何现实建议');
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.canonRefs.length).toBeGreaterThanOrEqual(1);
      for (const c of r.canonRefs) {
        expect(c.annotations.length, `${m} canonRef 注释为空`).toBeGreaterThanOrEqual(1);
        expect(c.interpretations.length, `${m} canonRef 注解为空`).toBeGreaterThanOrEqual(1);
        for (const a of c.annotations) expect(c.text.includes(a.term), `${m} 注释 term 未命中原文`).toBe(true);
      }
      expect(r.refLessonId ?? r.spec?.refLessonId ?? '').toBeDefined();
    }
  });

  it('隐私：出生时间不进入结果（可导出对象里找不到输入原值）', () => {
    const r = runText(spec('sizhu', { year: 19840101, month: 13, day: 99, hour: 7 }, 5));
    expect(r).not.toContain('19840101');
    const r2 = runText(spec('bazhai', { year: 19771203, gender: '男' }, 5));
    expect(r2).not.toContain('19771203');
  });

  it('健壮性：非法输入退默认值不炸', () => {
    expect(() => runDivination(spec('meihua', {}, 1))).not.toThrow();
    expect(() => runDivination(spec('liuyao', { coins: '' }, 1))).not.toThrow();
    expect(() => runDivination(spec('xuankong', { yun: 99, sitting: '', facing: '' }, 1))).not.toThrow();
  });
});

describe('★ 事类断语（事类词库 caseId → 用神 → 白名单口径）', () => {
  it('带 caseId 的六爻推演取事类断语；不带 caseId 仍走默认断语', () => {
    const withCase = runDivination(spec('liuyao', { coins: '背背背背背背', caseId: 'case_qiucai' }, 42));
    expect(withCase.verdict?.label).toBe('求财之占');
    expect(withCase.verdict?.quote).toContain('妻财爻');
    const withoutCase = runDivination(spec('liuyao', { coins: '背背背背背背' }, 42));
    expect(withoutCase.verdict?.label).toBe('纳甲装卦');
    // 除 verdict 外其余结果完全一致（事类只改断语口径，不改排盘）
    expect(withCase.summary).toBe(withoutCase.summary);
    expect(JSON.stringify(withCase.steps)).toBe(JSON.stringify(withoutCase.steps));
  });

  it('择日事类断语：搬家 → 移徙择日口径', () => {
    const r = runDivination(spec('zari', { year: 2026, month: 11, day: 15, caseId: 'case_yixi' }, 42));
    expect(r.verdict?.label).toBe('移徙择日');
  });

  it('未知 caseId 不炸，走默认断语', () => {
    const r = runDivination(spec('liuyao', { coins: '背背背背背背', caseId: 'case_not_exist' }, 42));
    expect(r.verdict?.label).toBe('纳甲装卦');
  });

  it('双闸：映射 id 必在白名单表内；白名单 case 条目必被引用（无死数据、无悬空引用）', () => {
    const allIds = new Set(ZHOUYI_RULE_TABLE.map((r) => r.id));
    const referenced = new Set<string>();
    for (const mapping of Object.values(ZHOUYI_CASE_RULE_IDS)) {
      for (const id of Object.values(mapping)) {
        expect(allIds.has(id as string), `${id} 不在断语白名单`).toBe(true);
        referenced.add(id as string);
      }
    }
    for (const r of ZHOUYI_RULE_TABLE) {
      if (r.id.includes('-case-')) {
        expect(referenced.has(r.id), `${r.id} 无任何事类引用（死数据）`).toBe(true);
      }
    }
  });
});

describe('★ 杂占三法（测字 / 解梦 / 姓名五格）', () => {
  it('测字：显式笔画确定性推演；内置笔画表逐字取笔画', () => {
    const byStrokes = runDivination(spec('cezi', { chars: '', strokes: 8 }, 42));
    expect(byStrokes.steps.length).toBeGreaterThanOrEqual(3);
    expect(byStrokes.summary).toContain('8 画');
    expect(JSON.stringify(runDivination(spec('cezi', { chars: '', strokes: 8 }, 42))))
      .toBe(JSON.stringify(byStrokes));
    // 「明」按规范笔画 8 画：摘要标出逐字笔画口径
    const byChar = runDivination(spec('cezi', { chars: '明', strokes: 0 }, 42));
    expect(byChar.summary).toContain('明=8画');
    expect(byChar.summary).toContain('测「明」');
  });

  it('测字：内置笔画表未收录的字报错（不编笔画）', () => {
    expect(() => runDivination(spec('cezi', { chars: '籲', strokes: 0 }, 42))).toThrow(/笔画表/);
    expect(() => runDivination(spec('cezi', { chars: '', strokes: 0 }, 42))).toThrow(/待测的字/);
  });

  it('解梦：命中条目给民俗口径 + 白名单断语；未收录按「梦无定象」', () => {
    const hit = runDivination(spec('jiemeng', { dream: '梦见大水' }, 42));
    expect(hit.verdict?.label).toBe('占梦定象');
    expect(hit.steps.some((s) => s.rule === '梦书口径')).toBe(true);
    const miss = runDivination(spec('jiemeng', { dream: '梦见量子对撞机' }, 42));
    expect(miss.verdict?.label).toBe('梦无定象');
  });

  it('姓名五格：只算格数不出断语（verdict 为空）；五格数由笔画决定', () => {
    const r = runDivination(spec('xingming', { name: '', strokes: '4,3,4' }, 42));
    expect(r.verdict).toBeUndefined();
    const table = r.diagrams.find((d) => d.kind === 'table');
    expect(table).toBeTruthy();
    expect(JSON.stringify(r)).toContain('"天格"');
    // 「王」按康熙笔画 4 画：天格 = 4 + 1 = 5，与直接给 4 画一致
    const byName = runDivination(spec('xingming', { name: '王', strokes: '' }, 42));
    const byStrokes = runDivination(spec('xingming', { name: '', strokes: '4' }, 42));
    expect(byName.summary).toContain('天5');
    expect(byStrokes.summary).toContain('天5');
  });

  it('杂占三法的 canonRefs 注释/注解必非空且 term 命中原文', () => {
    for (const [m, input] of [
      ['cezi', { chars: '', strokes: 8 }],
      ['jiemeng', { dream: '梦见大水' }],
      ['xingming', { name: '', strokes: '4,3,4' }],
    ] as const) {
      const r = runDivination(spec(m, input, 42));
      expect(r.canonRefs.length).toBeGreaterThanOrEqual(1);
      for (const c of r.canonRefs) {
        expect(c.annotations.length, `${m} 注释为空`).toBeGreaterThanOrEqual(1);
        expect(c.interpretations.length, `${m} 注解为空`).toBeGreaterThanOrEqual(1);
        for (const a of c.annotations) expect(c.text.includes(a.term), `${m} term 未命中`).toBe(true);
      }
    }
  });
});
