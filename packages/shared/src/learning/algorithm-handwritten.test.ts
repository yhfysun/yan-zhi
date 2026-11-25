import { describe, expect, it } from 'vitest';
import { ALGORITHM_HANDWRITTEN_TOPIC_PLANS } from './algorithm-handwritten/index.js';
import { ALGORITHM_HANDWRITTEN_QUIZ } from './algorithm-quiz/index.js';
import { ALGORITHM_LESSONS, ALGORITHM_TRACKS } from './algorithms.js';
import { getLearningV2CoursePlan } from './v2.js';

const BANNED = [
  '把这一步放回整课任务',
  '本步要主动避开的偏差',
  '完成本课时，不要求',
  '这不是一节',
  '先说明为什么',
  '这一页',
  '本页',
  '写出这个知识点',
  '三行记录',
  '主张—依据—边界',
  '本步要能说清',
  '运行环境是',
  '先建立可运行基线',
  '学完后，能围绕',
  '源码/规范锚点',
  '接入企业项目与运行边界',
];

// algorithmPlan() 模板的签名短语：手写正文里不得再出现
const TEMPLATE_PHRASES = ['放进一个小故事', '不能靠代码跑通后才补解释', '建立“看到什么条件选什么方法”的索引'];

const CURLY = /[“”‘’]/;

describe('algorithm handwritten lesson plans', () => {
  it('covers every algorithm lesson with a handwritten plan', () => {
    expect(ALGORITHM_LESSONS).toHaveLength(64);
    const topics = ALGORITHM_TRACKS.flatMap((track) => [...track.topics]);
    expect(new Set(topics).size).toBe(64);
    for (const lesson of ALGORITHM_LESSONS) {
      expect(ALGORITHM_HANDWRITTEN_TOPIC_PLANS[lesson.title], lesson.courseName).toBeTruthy();
    }
    expect(Object.keys(ALGORITHM_HANDWRITTEN_TOPIC_PLANS)).toHaveLength(64);
  });

  it('keeps handwritten plan steps substantive, distinct and free of template phrases', () => {
    for (const lesson of ALGORITHM_LESSONS) {
      const plan = getLearningV2CoursePlan('algorithms', lesson.courseName);
      expect(plan.steps, lesson.courseName).toHaveLength(6);
      const bodies = new Set<string>();
      for (const step of plan.steps) {
        const tag = `${lesson.courseName}/${step.title}`;
        expect(step.body.length, tag).toBeGreaterThanOrEqual(60);
        expect(step.objective?.length ?? 0, tag).toBeGreaterThanOrEqual(12);
        expect(step.practice?.length ?? 0, tag).toBeGreaterThanOrEqual(24);
        expect(step.checkpoint?.length ?? 0, tag).toBeGreaterThanOrEqual(24);
        for (const phrase of [...BANNED, ...TEMPLATE_PHRASES]) {
          expect(step.body, tag).not.toContain(phrase);
        }
        expect(CURLY.test(step.body), tag).toBe(false);
        bodies.add(step.body);
      }
      expect(bodies.size, lesson.courseName).toBe(6);
    }
  });

  it('attaches a handwritten per-course quiz to every algorithm lesson', () => {
    expect(Object.keys(ALGORITHM_HANDWRITTEN_QUIZ)).toHaveLength(64);
    for (const lesson of ALGORITHM_LESSONS) {
      const plan = getLearningV2CoursePlan('algorithms', lesson.courseName);
      const quiz = plan.quiz;
      expect(quiz?.length, lesson.courseName).toBeGreaterThanOrEqual(4);
      const answers = new Set<number>();
      for (const [index, question] of (quiz ?? []).entries()) {
        const tag = `${lesson.courseName}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BANNED, '正确答案是']) {
          expect(question.explanation, tag).not.toContain(phrase);
          expect(question.prompt, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${lesson.courseName} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the runnable algorithm code-lab expansion wired to real lessons', () => {
    const codeLabLessons = ALGORITHM_LESSONS.filter((lesson) =>
      Boolean(getLearningV2CoursePlan('algorithms', lesson.courseName).codeLab),
    );
    console.table(ALGORITHM_TRACKS.map((track) => {
      const lessons = ALGORITHM_LESSONS.filter((lesson) => lesson.trackId === track.id);
      const covered = lessons.filter((lesson) =>
        Boolean(getLearningV2CoursePlan('algorithms', lesson.courseName).codeLab),
      );
      return {
        track: `${track.id} · ${track.title}`,
        courses: lessons.length,
        codeLabs: covered.length,
        remaining: lessons.length - covered.length,
      };
    }));
    expect(codeLabLessons).toHaveLength(64);
    for (const lesson of codeLabLessons) {
      const lab = getLearningV2CoursePlan('algorithms', lesson.courseName).codeLab;
      expect(lab?.practice.id, lesson.courseName).toBeTruthy();
      expect(lab?.apply.id, lesson.courseName).toBeTruthy();
      expect(lab?.practice.id, lesson.courseName).not.toBe(lab?.apply.id);
    }
  });
});
