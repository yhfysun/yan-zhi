// 课程内容包回归（learning/curriculum.ts）。
// 为什么值得测：内容包是「离线预写」承诺的载体——场景块要被注入提示词（标记/角色/句型齐全）、
// 语法点要能支撑微课卡（字段非空、正误对照不重复）、范文要逐段对齐（en/zh 段数一致）。
// 数据被改坏（比如段落错位）会让阅读页静默变乱且不报错。
import { describe, it, expect } from 'vitest';
import {
  SCENE_CARDS, GRAMMAR_POINTS, READING_PASSAGES,
  COURSE_CATALOG, COURSE_STAGES, LEARNING_SUBJECTS,
  getSceneCard, listSceneCards, renderScenePrompt,
} from '../src/learning/curriculum';
import { BUILTIN_WORDBOOKS } from '../src/learning/data/wordbooks';
import { LEARNING_AGENT_ID } from '../src/builtin-learning-agents';

describe('课程学段目录', () => {
  it('36 门课且 id 唯一；词书、软考和安全路线边界清晰', () => {
    expect(COURSE_CATALOG.length).toBe(36);
    expect(new Set(COURSE_CATALOG.map((c) => c.id)).size).toBe(COURSE_CATALOG.length);
    const vocab = COURSE_CATALOG.filter((c) => !c.kind || c.kind === 'vocab');
    expect(new Set(vocab.map((c) => c.bookId)).size).toBe(vocab.length);
    expect(COURSE_CATALOG.filter((c) => c.kind === 'exam')).toHaveLength(4);
    expect(COURSE_CATALOG.filter((c) => c.kind === 'security')).toHaveLength(12);
  });

  it('★ 每门课的 bookId 都有真实内容包（指空 = 选课拿不到词）', () => {
    const bookIds = new Set(BUILTIN_WORDBOOKS.map((b) => b.id));
    for (const c of COURSE_CATALOG) {
      if (c.kind === 'exam' || c.kind === 'security') continue;
      expect(bookIds.has(c.bookId), `${c.id} 的 ${c.bookId} 不存在`).toBe(true);
    }
  });

  it('学段覆盖用户拍板的全部学段，目录顺序 = 建议学程', () => {
    expect(COURSE_STAGES).toEqual(['启蒙', '必背专题', '初中', '高中', '大学', '出国', '软考', '网络安全']);
    const names = COURSE_CATALOG.map((c) => c.name);
    expect(names[0]).toBe('字母与音标');
    expect(names).toContain('动词全本');
    expect(names).toContain('名词分类');
    expect(names).toContain('动植物分类');
    expect(names).toContain('生活物品');
    expect(names).toContain('食物与饮品');
    expect(names).toContain('身体与健康');
    expect(names).toContain('口语高频句');
    expect(names).toContain('英语习语');
    expect(names).toContain('时态必背');
    expect(names).toContain('软件设计师');
    expect(names).toContain('系统架构设计师');
    expect(names).toContain('授权渗透测试');
    expect(names).toContain('密码学与 PKI');
    expect(names).toContain('身份与访问管理');
    expect(names).toContain('API 与移动安全');
    expect(names).toContain('云与容器安全');
    expect(names).toContain('AI 与 LLM 安全');
    expect(names).toContain('多语言安全编码');
    expect(names).toContain('自动化攻防靶场');
    expect(names).toContain('安全开发与 DevSecOps');
    expect(names).toContain('初一');
    expect(names).toContain('初三');
    expect(names).toContain('高三 · 高考冲刺');
    expect(names).toContain('大学英语四级');
    expect(names).toContain('大学英语六级');
    expect(names).toContain('雅思');
    expect(names).toContain('托福');
    // 目录序与学段序一致（启蒙最前、出国最后）
    const firstIdx = COURSE_STAGES.indexOf(COURSE_CATALOG[0].stage);
    const lastIdx = COURSE_STAGES.indexOf(COURSE_CATALOG[COURSE_CATALOG.length - 1].stage);
    expect(firstIdx).toBeLessThan(lastIdx);
  });

  it('★ 科目架构：清单含英语（ready）+ 预留日语/数学/物理（未就绪）；课程都有 subject', () => {
    expect(LEARNING_SUBJECTS.find((s) => s.key === '英语')?.ready).toBe(true);
    expect(LEARNING_SUBJECTS.find((s) => s.key === '软考')?.ready).toBe(true);
    expect(LEARNING_SUBJECTS.find((s) => s.key === '网络安全')?.ready).toBe(true);
    for (const k of ['日语', '数学', '物理']) {
      expect(LEARNING_SUBJECTS.find((s) => s.key === k)?.ready).toBe(false);
    }
    expect(COURSE_CATALOG.filter((c) => c.subject === '英语').length).toBe(20);
    expect(COURSE_CATALOG.filter((c) => c.subject === '软考').length).toBe(4);
    expect(COURSE_CATALOG.filter((c) => c.subject === '网络安全').length).toBe(12);
  });

  it('★ 全量词书：常规课程 >= 200 词，必背专题 >= 80 词，词条无空值、无重复', () => {
    for (const c of COURSE_CATALOG) {
      if (c.kind === 'exam' || c.kind === 'security') continue;
      const b = BUILTIN_WORDBOOKS.find((x) => x.id === c.bookId)!;
      const minWords = c.stage === '必背专题' ? 80 : 200;
      expect(b.words.length, c.id).toBeGreaterThanOrEqual(minWords);
      const seen = new Set<string>();
      for (const w of b.words) {
        expect(w.word.length, `${c.bookId}:${w.word}`).toBeGreaterThan(0);
        expect(w.gloss.length, `${c.bookId}:${w.word}`).toBeGreaterThan(0);
        const k = w.word.toLowerCase();
        expect(seen.has(k), `${c.bookId} 重复词 ${w.word}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it('重点考试词库规模真实（高考 >=3000 / 四级 >=2000 / 托福 >=4000）', () => {
    const count = (id: string) => BUILTIN_WORDBOOKS.find((b) => b.id === id)!.words.length;
    expect(count('wb_gaokao_sample')).toBeGreaterThanOrEqual(3000);
    expect(count('wb_cet4_sample')).toBeGreaterThanOrEqual(2000);
    expect(count('wb_toefl_sample')).toBeGreaterThanOrEqual(4000);
  });
});

describe('场景卡', () => {
  it('每门课都有 3 个专属场景，且 id 唯一（重复会串 source_meta 注入）', () => {
    const sceneCourses = COURSE_CATALOG.filter((c) => !c.kind || c.kind === 'vocab');
    expect(SCENE_CARDS.length).toBe(sceneCourses.length * 3);
    expect(new Set(SCENE_CARDS.map((s) => s.id)).size).toBe(SCENE_CARDS.length);
    for (const course of sceneCourses) {
      expect(listSceneCards(course.id), course.id).toHaveLength(3);
    }
  });

  it('每张卡字段齐全：课程/场景/双角色/三步任务/≥3 句型/完成条件/CEFR', () => {
    for (const s of SCENE_CARDS) {
      expect(COURSE_CATALOG.some((c) => c.id === s.courseId), s.id).toBe(true);
      expect(s.courseName.length, s.id).toBeGreaterThan(0);
      expect(s.scene.length, s.id).toBeGreaterThan(5);
      expect(s.roles.length, s.id).toBe(2);
      expect(s.roles[0].length, s.id).toBeGreaterThan(0);
      expect(s.missions.length, s.id).toBe(3);
      expect(s.keyPhrases.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.exitHint.length, s.id).toBeGreaterThan(2);
      expect(s.cefr, s.id).toMatch(/^(A[12]|B[12])$/);
      expect(s.minutes, s.id).toBeGreaterThanOrEqual(8);
      expect(s.tags.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('★ 每个场景都有首轮台本：简单模式可显示英文/音标/中文，中级/高级由前端按级别隐藏', () => {
    for (const s of SCENE_CARDS) {
      const view = getSceneCard(s.id)!;
      expect(view.guide.coachEn.length, s.id).toBeGreaterThan(5);
      expect(view.guide.coachZh.length, s.id).toBeGreaterThan(2);
      expect(view.guide.userEn.length, s.id).toBeGreaterThan(3);
      expect(view.guide.userPhonetic.length, s.id).toBeGreaterThan(3);
      expect(view.guide.userZh.length, s.id).toBeGreaterThan(2);
    }
  });

  it('getSceneCard 按 id 命中；未知 id 返回 null（注入分支按无场景降级）', () => {
    expect(getSceneCard('sc_cet4_course')?.title).toBe('选课咨询');
    expect(getSceneCard('sc_not_exist')).toBeNull();
  });

  it('★ renderScenePrompt：含场景段标记 + 角色 + 句型 + [SCENE_END] 收尾指引', () => {
    const s = getSceneCard('sc_cet6_interview')!;
    const text = renderScenePrompt(s);
    expect(text).toContain('## 当前场景');
    expect(text).toContain(s.roles[0]);
    expect(text).toContain(s.roles[1]);
    expect(text).toContain(s.missions[0]);
    expect(text).toContain('一次只输出一轮');
    expect(text).toContain('中英混说');
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
  it('≥14 篇且 id 唯一，简单/中级/困难与日常主题都有', () => {
    expect(READING_PASSAGES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(READING_PASSAGES.map((r) => r.id)).size).toBe(READING_PASSAGES.length);
    expect(READING_PASSAGES.some((r) => /^A[12]$/.test(r.cefr))).toBe(true);
    expect(READING_PASSAGES.some((r) => r.cefr === 'B1')).toBe(true);
    expect(READING_PASSAGES.some((r) => /^B2$/.test(r.cefr))).toBe(true);
    expect(READING_PASSAGES.some((r) => r.topic === '日常生活')).toBe(true);
    expect(READING_PASSAGES.filter((r) => r.topic === '寓言').length).toBeGreaterThanOrEqual(3);
    expect(READING_PASSAGES.some((r) => r.topic === '长篇连载' && r.paras.length >= 4)).toBe(true);
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
