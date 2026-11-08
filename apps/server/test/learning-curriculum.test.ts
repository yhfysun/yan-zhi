// 课程内容包回归（learning/curriculum.ts）。
// 为什么值得测：内容包是「离线预写」承诺的载体——场景块要被注入提示词（标记/角色/句型齐全）、
// 语法点要能支撑微课卡（字段非空、正误对照不重复）、范文要逐段对齐（en/zh 段数一致）。
// 数据被改坏（比如段落错位）会让阅读页静默变乱且不报错。
import { describe, it, expect } from 'vitest';
import {
  SCENE_CARDS, GRAMMAR_POINTS, READING_PASSAGES,
  getSceneCard, renderScenePrompt,
} from '../src/learning/curriculum';
import { LEARNING_AGENT_ID } from '../src/builtin-learning-agents';

describe('场景卡', () => {
  it('12 张且 id 唯一（id 是 source_meta 注入的锚点，重复会串场景）', () => {
    expect(SCENE_CARDS.length).toBe(12);
    expect(new Set(SCENE_CARDS.map((s) => s.id)).size).toBe(SCENE_CARDS.length);
  });

  it('每张卡字段齐全：场景/双角色/≥3 句型/完成条件/CEFR', () => {
    for (const s of SCENE_CARDS) {
      expect(s.scene.length, s.id).toBeGreaterThan(5);
      expect(s.roles.length, s.id).toBe(2);
      expect(s.roles[0].length, s.id).toBeGreaterThan(0);
      expect(s.keyPhrases.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.exitHint.length, s.id).toBeGreaterThan(2);
      expect(s.cefr, s.id).toMatch(/^A[12]|^B1$/);
    }
  });

  it('getSceneCard 按 id 命中；未知 id 返回 null（注入分支按无场景降级）', () => {
    expect(getSceneCard('sc_airport')?.title).toBe('机场值机');
    expect(getSceneCard('sc_not_exist')).toBeNull();
  });

  it('★ renderScenePrompt：含场景段标记 + 角色 + 句型 + [SCENE_END] 收尾指引', () => {
    const s = getSceneCard('sc_interview')!;
    const text = renderScenePrompt(s);
    expect(text).toContain('## 当前场景');
    expect(text).toContain(s.roles[0]);
    expect(text).toContain(s.roles[1]);
    for (const k of s.keyPhrases) expect(text).toContain(k);
    expect(text).toContain('[SCENE_END]');
    expect(text).toContain(s.cefr);
  });
});

describe('语法点目录', () => {
  it('≥24 点且 id 唯一（id 是错因归因的字段值，重复会串点）', () => {
    expect(GRAMMAR_POINTS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(GRAMMAR_POINTS.map((g) => g.id)).size).toBe(GRAMMAR_POINTS.length);
  });

  it('每点微课卡要素齐全：分组/CEFR/规则/≥1 例句/≥1 正误对照', () => {
    for (const g of GRAMMAR_POINTS) {
      expect(g.group.length, g.id).toBeGreaterThan(0);
      expect(g.rule.length, g.id).toBeGreaterThan(5);
      expect(g.examples.length, g.id).toBeGreaterThanOrEqual(1);
      expect(g.pairs.length, g.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('★ 正误对照必须真的「有错可纠」：wrong ≠ right 且都非空', () => {
    for (const g of GRAMMAR_POINTS) {
      for (const p of g.pairs) {
        expect(p.wrong.length, `${g.id} wrong`).toBeGreaterThan(0);
        expect(p.right.length, `${g.id} right`).toBeGreaterThan(0);
        expect(p.wrong, `${g.id}`).not.toBe(p.right);
        expect(p.why.length, `${g.id} why`).toBeGreaterThan(3);
      }
    }
  });

  it('关键高频点必须在场（第三人称单数 / 现在完成时 / 冠词）', () => {
    const ids = GRAMMAR_POINTS.map((g) => g.id);
    for (const must of ['g_present_3rd', 'g_present_perfect', 'g_articles']) {
      expect(ids, `缺 ${must}`).toContain(must);
    }
  });
});

describe('分级范文', () => {
  it('≥8 篇且 id 唯一，A2/B1 两级都有', () => {
    expect(READING_PASSAGES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(READING_PASSAGES.map((r) => r.id)).size).toBe(READING_PASSAGES.length);
    expect(READING_PASSAGES.some((r) => r.cefr === 'A2')).toBe(true);
    expect(READING_PASSAGES.some((r) => r.cefr === 'B1')).toBe(true);
  });

  it('★ 中英逐段对齐：每段 en/zh 都非空（错位 = 阅读页静默串段）', () => {
    for (const r of READING_PASSAGES) {
      expect(r.paras.length, r.id).toBeGreaterThanOrEqual(3);
      for (const [i, p] of r.paras.entries()) {
        expect(p.en.length, `${r.id}#${i} en`).toBeGreaterThan(10);
        expect(p.zh.length, `${r.id}#${i} zh`).toBeGreaterThan(4);
      }
    }
  });
});

describe('与教学智能体的关系', () => {
  it('学习陪练 id 仍为契约值（场景卡经它注入，改 id 必须同步前端）', () => {
    expect(LEARNING_AGENT_ID).toBe('a_builtin_learning_coach');
  });
});
