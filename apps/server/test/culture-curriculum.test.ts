// 传统文化精读层内容包回归（新模型：注释 Annotation / 注解 Interpretation 分层）。
// ★ 硬约束（用户拍板）：精读层 100% 人工预写；注解防编造——paraphrase=false 的逐字引文
//   只允许出自白名单注本（可考的著名注语），其余必须 paraphrase=true 标「大意转述」。
import { describe, it, expect } from 'vitest';
import {
  CULTURE_LEVELS, CULTURE_LESSONS, CULTURE_COUPLET_LESSONS,
} from '../src/learning/culture/curriculum';
import { judgeCouplet } from '@yan-zhi/shared';
import type { Annotation, Interpretation } from '../src/learning/culture/types';

const PUNCT_RE = /[，。？！、；：「」『』（）\s]/g;
const stripPunct = (s: string) => s.replace(PUNCT_RE, '');

/** 逐字引文白名单：这些注本的注语才允许 paraphrase=false（防 LLM 编造注文的关键闸门） */
const QUOTED_SCHOOLS = [
  '朱熹《四书章句集注》',
  '朱熹《论语集注》',
  '朱熹《中庸章句》',
  '朱熹《孟子集注》',
  '朱熹《诗集传》',
  '毛传',
  '毛诗序',
  '《左传》',
  '刘勰《文心雕龙·诠赋》',
];

describe('传统文化课程体系（一书一教程）', () => {
  it('课时 id 唯一；四阶齐备；四书 8 课、五经 10 课，每本书讲义+精读两课', () => {
    expect(new Set(CULTURE_LESSONS.map((l) => l.id)).size).toBe(CULTURE_LESSONS.length);
    for (const level of CULTURE_LEVELS) {
      expect(CULTURE_LESSONS.filter((l) => l.level === level).length, `${level} 无课时`).toBeGreaterThanOrEqual(1);
    }
    const sishu = CULTURE_LESSONS.filter((l) => l.level === '四书');
    const wujing = CULTURE_LESSONS.filter((l) => l.level === '五经');
    expect(sishu.length).toBe(8);
    expect(wujing.length).toBe(10);
    for (const book of ['大学', '中庸', '论语', '孟子']) {
      expect(sishu.filter((l) => l.title.includes(`《${book}》`)).length, `《${book}》应有讲义+精读两课`).toBeGreaterThanOrEqual(2);
    }
    for (const book of ['诗经', '尚书', '礼记', '周易', '春秋']) {
      expect(wujing.filter((l) => l.title.includes(`《${book}》`)).length, `五经《${book}》应有讲义+精读两课`).toBeGreaterThanOrEqual(2);
    }
  });

  it('讲义课（lecture）不设诵读步；精读课（read）必有诵读步与 gloss 步', () => {
    for (const l of CULTURE_LESSONS) {
      if (l.kind === 'lecture') expect(l.steps, l.id).not.toContain('recite');
      if (l.kind === 'read') expect(l.steps, l.id).toContain('recite');
      expect(l.steps, l.id).toContain('gloss');
    }
  });
});

describe('注释（Annotation · 训诂层）', () => {
  it('★ 注释 key（term）必在原文行中（防错位）', () => {
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        for (const a of line.annotations) {
          expect(
            line.text.includes(a.term),
            `${l.id}/${line.id} 注释「${a.term}」不在原文「${line.text}」中`,
          ).toBe(true);
        }
      }
    }
  });

  it('每条注释 gloss 非空；type 合法', () => {
    const legal = ['释词', '注音', '通假', '典故', '名物', '句式', '比喻'];
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        for (const a of line.annotations as Annotation[]) {
          expect(a.gloss.trim(), `${l.id} ${a.term} gloss 空`).not.toBe('');
          if (a.type) expect(legal, `${l.id} ${a.term} type 非法 ${a.type}`).toContain(a.type);
        }
      }
    }
  });

  it('每课至少一行有注释（讲义课也必须落到术语上）', () => {
    for (const l of CULTURE_LESSONS) {
      const count = l.lines.reduce((n, line) => n + line.annotations.length, 0);
      expect(count, `${l.id} 全课无注释`).toBeGreaterThanOrEqual(1);
    }
  });

  it('★ 精读层 100% 人工预写：注释对象不含生成来源字段（用户拍板硬约束）', () => {
    const banned = ['origin', 'assisted', 'generated', 'ai', 'llm', 'aisource', 'generatedby'];
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        for (const a of line.annotations as Annotation[]) {
          for (const k of Object.keys(a).map((x) => x.toLowerCase())) {
            expect(banned.includes(k), `${l.id} 注释含禁用字段 ${k}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('注解（Interpretation · 历代大家层）', () => {
  it('每条注解 school/dynasty/text/plain 齐全', () => {
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        for (const itp of line.interpretations as Interpretation[]) {
          expect(itp.school.trim(), `${l.id} school 空`).not.toBe('');
          expect(itp.dynasty.trim(), `${l.id} dynasty 空`).not.toBe('');
          expect(itp.text.trim(), `${l.id} text 空`).not.toBe('');
          expect(itp.plain.trim(), `${l.id} 注解白话空`).not.toBe('');
        }
      }
    }
  });

  it('★ 防编造闸门：paraphrase=false（逐字引文）的注本必须在白名单内', () => {
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        for (const itp of line.interpretations as Interpretation[]) {
          if (!itp.paraphrase) {
            expect(
              QUOTED_SCHOOLS.includes(itp.school),
              `${l.id} 注本「${itp.school}」逐字引文不在白名单，应改 paraphrase=true`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('★ 每课（讲义/精读）至少一行有历代注解——注释与注解两样都必须有（用户拍板）', () => {
    for (const l of CULTURE_LESSONS) {
      const count = l.lines.reduce((n, line) => n + line.interpretations.length, 0);
      expect(count, `${l.id} 全课无历代注解`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('词牌格式课（cul_cipai_intro）', () => {
  const lesson = CULTURE_LESSONS.find((l) => l.id === 'cul_cipai_intro')!;

  it('≥10 行，八个经典词牌齐备', () => {
    expect(lesson.lines.length).toBeGreaterThanOrEqual(10);
    for (const name of ['水调歌头', '念奴娇', '虞美人', '如梦令', '浣溪沙', '蝶恋花', '卜算子', '清平乐']) {
      expect(lesson.lines.some((line) => line.text.includes(`《${name}》`)), `词牌课缺《${name}》`).toBe(true);
    }
  });

  it('每个词牌行都讲格式：必须含「字」与「韵」', () => {
    const rows = lesson.lines.filter((line) => line.text.startsWith('《'));
    for (const line of rows) {
      expect(line.text.includes('字'), `${line.id} 未讲字数`).toBe(true);
      expect(line.text.includes('韵'), `${line.id} 未讲用韵`).toBe(true);
    }
  });
});

describe('通识校验', () => {
  it('平仄串与去标点原文逐字等长（有标注的行）', () => {
    for (const l of CULTURE_LESSONS) {
      for (const line of l.lines) {
        if (!line.pingze) continue;
        expect(line.pingze.length, `${l.id}/${line.id} 平仄长度不符`).toBe(stripPunct(line.text).length);
        for (const ch of line.pingze) expect(ch === '平' || ch === '仄').toBe(true);
      }
    }
  });

  it('每课 3 句白话总览、脉络指向真实行、自测答案在选项中、source 非空', () => {
    for (const l of CULTURE_LESSONS) {
      expect(l.plainSummary).toHaveLength(3);
      for (const s of l.structure) {
        expect(s.lineIndex, `${l.id} 脉络指向越界`).toBeLessThan(l.lines.length);
      }
      if (l.quickCheck) {
        expect(l.quickCheck.options).toContain(l.quickCheck.answer);
        expect(l.quickCheck.explanation.trim()).not.toBe('');
      }
      expect(l.source.trim(), `${l.id} source 空`).not.toBe('');
    }
  });
});

describe('对句题内容包', () => {
  it('题目 id 唯一，口径逐位等长，候选含范本全部字', () => {
    expect(new Set(CULTURE_COUPLET_LESSONS.map((c) => c.id)).size).toBe(CULTURE_COUPLET_LESSONS.length);
    for (const c of CULTURE_COUPLET_LESSONS) {
      expect(c.promptTone.length).toBe(c.prompt.length);
      expect(c.expectPos.length).toBe(c.expectTone.length);
      expect(c.expectPos.length).toBe(c.prompt.length);
      for (const ch of c.sampleAnswer) {
        expect(c.candidates.find((x) => x.ch === ch), `${c.id} 范本字「${ch}」不在候选中`).toBeTruthy();
      }
    }
  });

  it('★ 每道题的范本用 shared judgeCouplet 真跑三项全过', () => {
    for (const c of CULTURE_COUPLET_LESSONS) {
      const picked = [...c.sampleAnswer].map((ch) => {
        const cand = c.candidates.find((x) => x.ch === ch);
        expect(cand, `${c.id} 范本字「${ch}」缺失`).toBeTruthy();
        return cand!;
      });
      const r = judgeCouplet(c.expectPos, c.expectTone, picked);
      expect(r.pass, `${c.id} 范本「${c.sampleAnswer}」判卷未过：${r.firstToneIssue ?? r.firstPosIssue ?? ''}`).toBe(true);
    }
  });

  it('干扰项有区分度：每个槽位都有候选会被判卷拒掉', () => {
    for (const c of CULTURE_COUPLET_LESSONS) {
      const eachSlotHasReject = c.expectPos.every((pos, i) =>
        c.candidates.some((cand) => cand.pos !== pos || cand.tone !== c.expectTone[i]),
      );
      expect(eachSlotHasReject, `${c.id} 有槽位无判卷区分度`).toBe(true);
    }
  });
});
