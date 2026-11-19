// 周易独立学科接线回归（B1–B7，docs/周易课程方案-2026-11-15.md §3.0）。
// 「注册了 ≠ 生效」的主战场：漏 COURSE_STAGES → 课程静默消失（B1）；
// 漏 getCourses 无词书分支 → 被 `if (!c.bookId) continue` 静默丢弃（B2）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COURSE_CATALOG, COURSE_STAGES, LEARNING_SUBJECTS,
} from '../src/learning/curriculum';
import { getCourses } from '../src/learning/service';
import {
  ZHOUYI_COACH_AGENT_ID, builtinLearningAgentDefs, learningSubjectOfAgentId,
} from '../src/builtin-learning-agents';

const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const uid = `zy-wiring-${Date.now()}`;

describe('B1/B2 课程目录与课程视图接线', () => {
  it('科目清单含「周易」且 ready=true；COURSE_STAGES 含「周易」（漏了整组课静默消失）', () => {
    expect(LEARNING_SUBJECTS.find((s) => s.key === '周易')?.ready).toBe(true);
    expect(COURSE_STAGES).toContain('周易');
  });

  it('48 门课程注册、id 唯一、8 条路径全被覆盖且每门带 zhouyiTrack', () => {
    const zy = COURSE_CATALOG.filter((c) => c.kind === 'zhouyi');
    expect(zy).toHaveLength(48);
    expect(new Set(zy.map((c) => c.id)).size).toBe(48);
    for (const t of ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
      expect(zy.some((c) => c.zhouyiTrack === t), `缺路径 ${t}`).toBe(true);
    }
    expect(zy.every((c) => c.subject === '周易')).toBe(true);
  });

  it('★ B2：getCourses("周易") 真返回 48 门（无词书分支放行 zhouyi，否则全被丢弃）', () => {
    const groups = getCourses(uid, '周易');
    const all = groups.flatMap((g) => g.courses);
    const zy = all.filter((c) => c.kind === 'zhouyi');
    expect(zy).toHaveLength(48);
    // 其他科目不受影响（写入 ≠ 读取的另一半：别把英语弄丢）
    expect(getCourses(uid, '英语').flatMap((g) => g.courses).filter((c) => c.kind === 'vocab').length).toBeGreaterThanOrEqual(20);
  });

  it('B7：周易课程全部无 bookId（不复用词书，规避 word_book.subject 默认英语）', () => {
    for (const c of COURSE_CATALOG.filter((x) => x.kind === 'zhouyi')) {
      expect(c.bookId, c.id).toBeUndefined();
    }
  });
});

describe('B5 陪练智能体接线', () => {
  it('ZHOUYI_COACH_AGENT_ID 契约值；subjectOfAgentId 归属周易；seed 条目在 builtinLearningAgentDefs 里', () => {
    expect(ZHOUYI_COACH_AGENT_ID).toBe('a_builtin_zhouyi_coach');
    expect(learningSubjectOfAgentId(ZHOUYI_COACH_AGENT_ID)).toBe('周易');
    expect(builtinLearningAgentDefs.some((d) => d.id === ZHOUYI_COACH_AGENT_ID)).toBe(true);
  });

  it('context/tools 收口到周易（科目分块注入 + 非英语词本口径），源码级断言', () => {
    expect(src('../src/learning/context.ts')).toContain("'传统文化' | '音乐' | '周易'");
    expect(src('../src/learning/tools.ts')).toContain("currentSubject === '周易'");
    expect(src('../src/learning/service.ts')).toContain("subject === '传统文化' || subject === '音乐' || subject === '周易'");
  });
});

describe('B4 前端接线（源码级断言，ui 包测试另有 mount）', () => {
  const learning = src('../../../packages/ui/src/views/LearningV2.vue');
  const shared = src('../../../packages/shared/src/learning/v2-catalog.ts');

  it('LearningV2：周易主线挂载 Workbench，并保留测算实践学科入口', () => {
    expect(learning).toContain("import ZhouyiWorkbench from '../components/learning/zhouyi/ZhouyiWorkbench.vue'");
    expect(learning).toContain("selectedSubjectKey === 'zhouyi'");
    expect(shared).toContain('"key": "zhouyi"');
    expect(shared).toContain('"key": "divination"');
  });
});

describe('B3 路由挂载 / 边界', () => {
  it('routes/learning-zhouyi.ts 存在并挂载 /api/learning/zhouyi；/paths 下发术语/书目/文库（死数据 = 断言拦下）', () => {
    const routeSrc = src('../src/routes/learning-zhouyi.ts');
    expect(routeSrc).toContain("router.get('/paths'");
    expect(routeSrc).toContain("router.get('/lessons/:id'");
    expect(routeSrc).toContain('canon: ZHOUYI_CANON_WORKS');
    expect(routeSrc).toContain('terms: ZHOUYI_TERMS');
    expect(src('../src/index.ts')).toContain("app.use('/api/learning/zhouyi', learningZhouyiRoutes)");
    // canon-data 只经 curriculum 唯一 re-export 口（不直连）
    expect(src('../src/learning/zhouyi/curriculum.ts')).toContain("export { ZHOUYI_CANON_WORKS } from './canon-data.js'");
  });

  it('B3：/tts 英文限制不动（周易中文诵读走前端 useZhSpeech），routes/learning.ts 无周易字样', () => {
    expect(src('../src/routes/learning.ts')).not.toContain('周易');
  });
});
