import { describe, expect, it } from 'vitest';
import {
  LEARNING_V2_PAGES,
  SUBJECT_EXPERT_NOTES,
  getCoursePracticeTask,
  getLearningV2CoursePlan,
  getLearningV2Catalog,
  getLearningV2Library,
  getLearningV2Subject,
  getLearningV2Subjects,
  isLearningV2CourseReady,
} from './v2.js';
import { LEARNING_V2_CURATED_PLANS } from './v2-curated/index.js';
import { PROGRAMMING_COURSE_QUIZ } from './v2-curated/programming/quiz.js';

describe('Learning V2 course quiz banks (章节题库)', () => {
  it('only banks questions for courses that exist in the curated plans', () => {
    for (const courseName of Object.keys(PROGRAMMING_COURSE_QUIZ)) {
      expect(LEARNING_V2_CURATED_PLANS[`programming:${courseName}`], courseName).toBeTruthy();
    }
  });

  it('keeps every banked question answerable and explained', () => {
    for (const [courseName, items] of Object.entries(PROGRAMMING_COURSE_QUIZ)) {
      expect(items.length, courseName).toBeGreaterThanOrEqual(3);
      for (const item of items) {
        expect(item.prompt.trim().length, courseName).toBeGreaterThan(8);
        expect(item.options.length, courseName).toBeGreaterThanOrEqual(2);
        expect(item.answer, courseName).toBeGreaterThanOrEqual(0);
        expect(item.answer, courseName).toBeLessThan(item.options.length);
        expect(item.explanation.trim().length, courseName).toBeGreaterThan(12);
        expect(new Set(item.options).size, courseName).toBe(item.options.length);
      }
    }
  });

  it('exposes the quiz through the merged course plan', () => {
    const plan = getLearningV2CoursePlan('programming', 'Java 零基础：JDK、IDE 与第一个程序');
    expect(plan.quiz.length).toBeGreaterThan(0);
    const partySubject = getLearningV2Subjects().find((subject) => subject.key === 'party');
    const partyPlan = getLearningV2CoursePlan('party', partySubject!.current.course);
    expect(partyPlan.quiz).toHaveLength(0);
  });
});

describe('Learning V2 expert notes (名家注解 · 真实笔记)', () => {
  it('every public-domain commentary entry is a verbatim quote with a book-level source', () => {
    for (const [subjectKey, notes] of Object.entries(SUBJECT_EXPERT_NOTES)) {
      expect(notes.length, subjectKey).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.quote.trim(), `${subjectKey}:${note.label}`).not.toBe('');
        expect(note.source.trim(), subjectKey).not.toBe('');
        if (note.label === '公版古注') {
          expect(note.source, subjectKey).toContain('《');
        }
        if (note.label === '整理笔记') {
          expect(note.source, subjectKey).not.toMatch(/^朱熹|王弼/);
        }
      }
    }
  });

  it('every registered subject has at least one sourced expert note', () => {
    const subjectKeys = getLearningV2Subjects().map((subject) => subject.key);
    for (const key of subjectKeys) {
      expect(SUBJECT_EXPERT_NOTES[key]?.length ?? 0, key).toBeGreaterThan(0);
    }
    expect(getLearningV2CoursePlan('party', '建党与初心').expertNotes.length).toBeGreaterThan(0);
    expect(getLearningV2CoursePlan('security', getLearningV2Subject('security')!.current.course).expertNotes.length).toBeGreaterThan(0);
  });
});

describe('Learning V2 catalog', () => {
  it('covers all 22 subjects and every registered course', () => {
    const subjects = getLearningV2Subjects();
    const catalog = getLearningV2Catalog();

    expect(subjects).toHaveLength(22);
    expect(subjects.map((subject) => subject.key)).toEqual([
      'party', 'politics', 'economics', 'military', 'history', 'calligraphy',
      'memory', 'thinking', 'math', 'physics', 'schools', 'english', 'japanese',
      'soft', 'security', 'culture', 'music', 'zhouyi', 'divination', 'programming', 'algorithms', 'medicine',
    ]);
    // 课程总数随手写教案包（programming/handwritten）扩展而增长；新增课程包后同步更新：
    expect(catalog.courses).toHaveLength(1387);
    expect(new Set(catalog.courses.map((course) => course.id)).size).toBe(1387);
  });

  it('ships eight learning surfaces in both desktop and mobile', () => {
    expect(LEARNING_V2_PAGES.map((page) => page.key)).toEqual([
      'overview', 'roadmap', 'books', 'lesson', 'studio', 'practice', 'review', 'coach',
    ]);
  });

  it('every subject has a sourced book, layered annotations, and a zero-base path', () => {
    for (const subject of getLearningV2Subjects()) {
      expect(subject.book.original.trim(), subject.key).not.toBe('');
      expect(subject.book.translation.trim(), subject.key).not.toBe('');
      expect(subject.book.annotation.trim(), subject.key).not.toBe('');
      expect(subject.book.source.trim(), subject.key).not.toBe('');
      expect(subject.book.notes.length, subject.key).toBeGreaterThan(0);
      expect(subject.book.notes.every((note) =>
        note.term.trim().length > 0 && note.text.trim().length >= 12,
      ), subject.key).toBe(true);
      expect(subject.tracks[0]?.courses[0]?.name.trim(), subject.key).not.toBe('');
      expect(subject.lesson.steps.length, subject.key).toBeGreaterThanOrEqual(4);
    }
  });

  it('every course resolves to a course-specific practice task with output and boundary', () => {
    for (const course of getLearningV2Catalog().courses) {
      const practice = getCoursePracticeTask(course.subjectKey, course.name);
      expect(practice.courseName, course.id).toBe(course.name);
      expect(practice.task, course.id).toContain(course.name);
      expect(practice.output.trim(), course.id).not.toBe('');
      expect(practice.boundary.trim(), course.id).not.toBe('');
      expect(practice.features.length, course.id).toBeGreaterThan(0);
    }
  });

  it('exposes a global library spanning every subject', () => {
    const library = getLearningV2Library();
    expect(library.length).toBe(66);
    expect(new Set(library.map((entry) => entry.subjectKey)).size).toBe(22);
    expect(library.filter((entry) => entry.readable).length).toBe(22);
    expect(library.every((entry) => entry.source.trim().length > 0)).toBe(true);
  });

  it('keeps the latest Yixue, medicine and divination content visible', () => {
    expect(getLearningV2Subject('zhouyi')?.name).toBe('易学');
    expect(getLearningV2Subject('zhouyi')?.courses).toHaveLength(53);
    expect(getLearningV2Subject('medicine')?.name).toBe('医学');
    expect(getLearningV2Subject('medicine')?.courses).toHaveLength(50);
    expect(getLearningV2Subject('divination')?.courses).toHaveLength(20);
    expect(getCoursePracticeTask('security', 'Web 漏洞与攻击防御').features).toContain('卡/NFC安全');
    expect(getCoursePracticeTask('zhouyi', '乾卦精读').features).toContain('星图与节气');
  });

  it('turns every course into a zero-base lesson blueprint with sources and checks', () => {
    for (const subject of getLearningV2Subjects()) {
      for (const course of subject.courses) {
        const plan = getLearningV2CoursePlan(subject.key, course.name);
        expect(plan.title).toBe(course.name);
        expect(plan.prerequisite.length).toBeGreaterThan(0);
        expect(plan.plainLanguageGoal.length).toBeGreaterThan(0);
        expect(plan.guidedPractice.length).toBeGreaterThan(0);
        expect(plan.independentPractice.length).toBeGreaterThan(0);
        expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
        expect(plan.sourceRefs.length).toBeGreaterThan(0);
        expect(plan.steps).toHaveLength(subject.lesson.steps.length);
        expect(['curated', 'generated', 'draft']).toContain(plan.qualityStatus);
      }
    }
  });

  it('publishes explicit reviewed plans for the first priority-course batch', () => {
    const priorityCourses = [
      ['calligraphy', '坐姿、执笔与运腕'],
      ['calligraphy', '中锋与侧锋：线条的骨肉'],
      ['economics', '稀缺、选择与机会成本'],
      ['economics', '弹性：价格变化影响多大'],
      ['physics', '测量、单位与数量级'],
      ['physics', '力与牛顿运动定律'],
      ['japanese', '日语文字系统'],
      ['japanese', '五十音：片假名与外来语'],
      ['security', '安全基础与威胁建模'],
      ['security', '密码学与 PKI'],
      ['zhouyi', '易学导论'],
      ['zhouyi', '三易与成书'],
      ['zhouyi', '清与近现代易学'],
      ['medicine', '中医 · 医学通识与安全边界'],
      ['medicine', '西医 · 人体系统总图'],
      ['party', '建党与初心'],
      ['politics', '权力与权威：服从从哪里来'],
      ['military', '战略、战役、战术的三层尺度'],
      ['history', '史料类型：文本、实物与记忆'],
      ['memory', '注意力不是意志力'],
      ['thinking', '事实与观点的分界'],
      ['math', '数感与估算'],
      ['schools', '儒家：仁、礼与君子'],
      ['english', '动词全本'],
      ['soft', '网络工程师'],
      ['culture', '蒙学 · 对韵起步'],
      ['music', '现代通用乐理'],
      ['divination', '世界占卜文化导论'],
      ['party', '全民族抗战：统一战线如何运转'],
      ['politics', '民主与法治：两套常被混淆的尺度'],
      ['economics', '市场效率与外部性'],
      ['military', '地形、后勤与行动半径'],
      ['history', '辨伪：作者、时间与传播链'],
      ['calligraphy', '起笔、行笔、收笔'],
      ['memory', '工作记忆的容量限制'],
      ['thinking', '相关不等于因果'],
      ['math', '分数：从分割到运算'],
      ['physics', '功、能量与能量守恒'],
      ['schools', '道家：无为与自然'],
      ['english', '名词分类'],
      ['japanese', '浊音、半浊音与拗音'],
      ['soft', '系统架构设计师'],
      ['soft', '系统分析师'],
      ['security', '身份与访问管理'],
      ['culture', '诗词歌赋入门'],
      ['zhouyi', '卦序与序卦'],
      ['divination', '象征、隐喻与解释'],
      ['party', '解放战争：战略态势如何翻转'],
      ['politics', '权利与义务：自由如何划界'],
      ['politics', '联邦制与单一制'],
      ['economics', '信息不对称与市场失灵'],
      ['economics', '劳动、工资与人力资本'],
      ['military', '情报、欺骗与决策速度'],
      ['history', '如何写一段有证据的论证'],
      ['calligraphy', '九成宫：左右结构的避让'],
      ['memory', '编码：让信息变得可区分'],
      ['thinking', '证据强度与结论强度'],
      ['math', '方程：把未知量变成关系'],
      ['physics', '动量、碰撞与守恒'],
      ['schools', '墨家：兼爱、非攻与尚同'],
      ['english', '食物与饮品'],
      ['japanese', '名词句：A 是 B'],
      ['security', 'API 与移动安全'],
      ['culture', '五经选读'],
      ['zhouyi', '系辞上精读'],
      ['divination', '概率、心理与确认偏误'],
      ['party', '新中国成立与秩序重建'],
      ['politics', '议会制与总统制'],
      ['politics', '公平与效率如何权衡'],
      ['economics', '消费者选择与预算约束'],
      ['economics', '企业成本与规模经济'],
      ['military', '牧野之战：联盟与倒戈'],
      ['history', '先秦：礼制与列国竞争'],
      ['calligraphy', '颜勤礼碑：宽博与筋力'],
      ['memory', '联想链：从荒诞到稳定'],
      ['thinking', '演绎：前提如何推出结论'],
      ['math', '几何直观与证明'],
      ['physics', '电荷、电场与电势'],
      ['schools', '法家：法、术、势'],
      ['english', '身体与健康'],
      ['japanese', '动词分类与ます形'],
      ['security', '云与容器安全'],
      ['zhouyi', '系辞下与说卦'],
      ['divination', '星座的文化史'],
      ['party', '十一届三中全会：工作重心转移'],
      ['history', '大航海与全球贸易'],
      ['security', '安全开发与 DevSecOps'],
      ['zhouyi', '谦卦精读示范：五层阅读法入门'],
    ] as const;

    for (const [subjectKey, courseName] of priorityCourses) {
      const plan = getLearningV2CoursePlan(subjectKey, courseName);
      expect(plan.qualityStatus, `${subjectKey}/${courseName}`).toBe('curated');
      expect(plan.steps.length, `${subjectKey}/${courseName}`).toBeGreaterThanOrEqual(4);
      expect(plan.commonErrors.length, `${subjectKey}/${courseName}`).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.some((source) => source.includes('https://')), `${subjectKey}/${courseName}`).toBe(true);
      expect(plan.steps.every((step) => step.body.length >= 30), `${subjectKey}/${courseName}`).toBe(true);
    }
  });

  it('keeps every catalog course learnable while distinguishing reviewed and generated plans', () => {
    const plans = getLearningV2Catalog().courses.map((course) =>
      getLearningV2CoursePlan(course.subjectKey, course.name),
    );
    expect(plans.filter((plan) => plan.qualityStatus === 'curated').length).toBeGreaterThanOrEqual(120);
    expect(plans.filter((plan) => plan.qualityStatus === 'generated').length).toBeGreaterThan(0);
    expect(plans.every((plan) => plan.qualityStatus !== 'draft')).toBe(true);
    expect(getLearningV2CoursePlan('security', '多语言安全编码').qualityStatus).toBe('generated');
    expect(getLearningV2CoursePlan('security', '多语言安全编码').sourceRefs.join(' ')).not.toContain('verified');
  });

  it('opens every registered course from the course map', () => {
    for (const course of getLearningV2Catalog().courses) {
      expect(isLearningV2CourseReady(course.subjectKey, course.name), course.id).toBe(true);
    }
  });

  it('keeps every reviewed course complete and traceable', () => {
    const reviewed = getLearningV2Catalog().courses
      .map((course) => getLearningV2CoursePlan(course.subjectKey, course.name))
      .filter((plan) => plan.qualityStatus === 'curated');

    expect(reviewed).toHaveLength(Object.keys(LEARNING_V2_CURATED_PLANS).length);
    expect(reviewed.length).toBeGreaterThanOrEqual(120);
    for (const plan of reviewed) {
      expect(plan.sourceRefs.some((source) => source.includes('https://')), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => step.body.length >= 30), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => !step.body.includes('把这一步放回整课任务')), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => !step.body.includes('本步要主动避开的偏差')), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => (step.objective?.length || 0) >= 12), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => (step.practice?.length || 0) >= 24), plan.courseName).toBe(true);
      expect(plan.steps.every((step) => (step.checkpoint?.length || 0) >= 24), plan.courseName).toBe(true);
      expect(plan.commonErrors.length, plan.courseName).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps lesson bodies as subject content instead of writing-process commentary', () => {
    const first = getLearningV2CoursePlan('party', '建党与初心');

    expect(first.steps[0].body).toContain('1919 年爆发的五四运动');
    expect(first.steps[0].body).toContain('1921 年 7 月');
    expect(first.steps[0].body).not.toContain('党史不是一串孤立结论');
    expect(first.steps[0].body).not.toContain('时间轴的任务');
    expect(first.steps[4].body).toContain('早期组织和工人运动材料');
    expect(first.steps[4].body).not.toContain('完成本课时，不要求');
  });

  it('opens at least two reviewed courses in every subject', () => {
    for (const subject of getLearningV2Subjects()) {
      const reviewed = subject.courses.filter((course) =>
        getLearningV2CoursePlan(subject.key, course.name).qualityStatus === 'curated',
      );
      expect(reviewed.length, subject.key).toBeGreaterThanOrEqual(2);
    }
  });

  it('opens complete zero-base through advanced paths for math, physics, and English', () => {
    for (const subjectKey of ['math', 'physics', 'english'] as const) {
      const subject = getLearningV2Subject(subjectKey);
      expect(subject, subjectKey).toBeTruthy();
      const ready = subject!.courses.filter((course) =>
        isLearningV2CourseReady(subjectKey, course.name),
      );
      expect(ready, subjectKey).toHaveLength(subject!.courses.length);
    }
  });
});
