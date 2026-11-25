import { expect, it } from 'vitest';
import {
  getCoursePracticeTask,
  getLearningV2CoursePlan,
  getLearningV2Subject,
  getLearningV2Subjects,
} from './v2.js';

function contentSkeleton(value: string): string {
  return value.replace(/[“”‘’"'`、，。；：！？,.!?;:()[\]{}<>《》\s]/g, '');
}

it('prints runtime content quality by subject', () => {
  const rows = getLearningV2Subjects().map((subject) => {
    const plans = subject.courses.map((course) =>
      getLearningV2CoursePlan(subject.key, course.name),
    );
    return {
      subject: subject.name,
      total: plans.length,
      curated: plans.filter((plan) => plan.qualityStatus === 'curated').length,
      generated: plans.filter((plan) => plan.qualityStatus === 'generated').length,
      expanded: plans.reduce(
        (sum, plan) => sum + plan.steps.filter((step) =>
          step.body.includes('本步的可复核产出是'),
        ).length,
        0,
      ),
    };
  });
  const bodyOwners = new Map<string, string[]>();
  const sentenceOwners = new Map<string, string[]>();
  const quizPromptOwners = new Map<string, string[]>();
  const guidedPracticeOwners = new Map<string, string[]>();
  const semanticFragmentOwners = new Map<string, Set<string>>();
  for (const subject of getLearningV2Subjects()) {
    for (const item of subject.courses) {
      const plan = getLearningV2CoursePlan(subject.key, item.name);
      const courseLabel = `${subject.name}/${item.name}`;
      const courseSkeleton = contentSkeleton(item.name);
      for (const step of plan.steps) {
        const body = step.body.trim();
        if (body.length < 40) continue;
        bodyOwners.set(body, [...(bodyOwners.get(body) ?? []), `${courseLabel}/${step.title}`]);
        for (const sentence of body.split(/[。！？；]/).map((item) => item.trim())) {
          if (sentence.length < 18) continue;
          sentenceOwners.set(sentence, [
            ...(sentenceOwners.get(sentence) ?? []),
            courseLabel,
          ]);
        }
        const skeleton = contentSkeleton(step.body).replaceAll(courseSkeleton, '');
        for (let index = 0; index + 24 <= skeleton.length; index += 4) {
          const fragment = skeleton.slice(index, index + 24);
          const owners = semanticFragmentOwners.get(fragment) ?? new Set<string>();
          owners.add(courseLabel);
          semanticFragmentOwners.set(fragment, owners);
        }
      }
      for (const quiz of plan.quiz) {
        const prompt = quiz.prompt.trim();
        if (prompt.length < 8) continue;
        quizPromptOwners.set(prompt, [...(quizPromptOwners.get(prompt) ?? []), courseLabel]);
      }
      const guided = plan.guidedPractice.trim();
      if (guided.length >= 20) {
        guidedPracticeOwners.set(guided, [
          ...(guidedPracticeOwners.get(guided) ?? []),
          courseLabel,
        ]);
      }
    }
  }
  const duplicateBodies = [...bodyOwners.entries()].filter(([, owners]) => owners.length > 1);
  const duplicateSentences = [...sentenceOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1);
  const duplicateQuizPrompts = [...quizPromptOwners.entries()]
    .filter(([, owners]) => owners.length > 1);
  const duplicateGuidedPractice = [...guidedPracticeOwners.entries()]
    .filter(([, owners]) => owners.length > 1);
  const repeatedSemanticFragments = [...semanticFragmentOwners.entries()]
    .filter(([, owners]) => owners.size >= 5)
    .sort((left, right) => right[1].size - left[1].size);
  console.table(rows);
  console.log('duplicate step bodies', duplicateBodies.length, duplicateBodies.slice(0, 10));
  console.log('duplicate cross-course sentences', duplicateSentences.length, duplicateSentences.slice(0, 10));
  console.log('duplicate quiz prompts', duplicateQuizPrompts.length, duplicateQuizPrompts.slice(0, 10));
  console.log(
    'duplicate guided practice',
    duplicateGuidedPractice.length,
    duplicateGuidedPractice.slice(0, 10),
  );
  console.log(
    'repeated 24-character semantic fragments across 5+ courses',
    repeatedSemanticFragments.length,
    repeatedSemanticFragments.slice(0, 10),
  );
  const usability = getLearningV2Subjects().map((subject) => {
    const plans = subject.courses.map((course) => ({
      course,
      plan: getLearningV2CoursePlan(subject.key, course.name),
      practice: getCoursePracticeTask(subject.key, course.name),
    }));
    return {
      subject: subject.name,
      courses: plans.length,
      fiveSteps: plans.filter(({ plan }) => plan.steps.length === 5).length,
      shortBodies: plans.reduce((sum, { plan }) =>
        sum + plan.steps.filter((step) => step.body.trim().length < 60).length, 0),
      under100Bodies: plans.reduce((sum, { plan }) =>
        sum + plan.steps.filter((step) => step.body.trim().length < 100).length, 0),
      quizFour: plans.filter(({ plan }) => plan.quiz.length >= 4).length,
      quizBalanced: plans.filter(({ plan }) =>
        new Set(plan.quiz.slice(0, 4).map((question) => question.answer)).size === 4,
      ).length,
      quizAllSameAnswer: plans.filter(({ plan }) =>
        plan.quiz.length >= 4
        && new Set(plan.quiz.slice(0, 4).map((question) => question.answer)).size === 1,
      ).length,
      quizThreeOptionQuestions: plans.reduce((sum, { plan }) =>
        sum + plan.quiz.filter((question) => question.options.length === 3).length, 0),
      quizIssues: plans.reduce((sum, { plan }) =>
        sum + plan.quiz.filter((question) =>
          question.options.length !== 4
          || new Set(question.options).size !== question.options.length
          || question.answer < 0
          || question.answer >= question.options.length
          || question.explanation.trim().length < 25
          || !question.focus.trim(),
        ).length, 0),
      practiceReady: plans.filter(({ plan, practice }) =>
        plan.guidedPractice.trim().length >= 20
        && plan.independentPractice.trim().length >= 20
        && practice.output.trim().length >= 4
        && practice.boundary.trim().length > 8
        && practice.studio.steps.length > 0,
      ).length,
      sourcesReady: plans.filter(({ plan }) =>
        plan.sourceRefs.length >= 2
        && plan.sourceRefs.some((source) => source.includes('https://')),
      ).length,
      errorsReady: plans.filter(({ plan }) => plan.commonErrors.length >= 2).length,
      reviewed: plans.filter(({ plan }) => plan.reviewStatus === 'reviewed').length,
      structured: plans.filter(({ plan }) => plan.reviewStatus === 'structured').length,
      templateGuidance: plans.reduce((sum, { plan }) =>
        sum + plan.steps.filter((step) =>
          [
            '掌握先',
            '并能说明其适用边界',
            '对照本步要点',
            '完成引导练习并记录运行证据',
            '能向他人讲清',
            '当场完成一次对应操作',
          ].some((phrase) =>
            `${step.objective || ''} ${step.practice || ''} ${step.checkpoint || ''}`.includes(phrase),
          ),
        ).length, 0),
    };
  });
  console.table(usability);
  const usabilityTotals = {
    subjects: usability.length,
    courses: usability.reduce((sum, row) => sum + row.courses, 0),
    fiveStepCourses: usability.reduce((sum, row) => sum + row.fiveSteps, 0),
    quizCourses: usability.reduce((sum, row) => sum + row.quizFour, 0),
    quizQuestions: getLearningV2Subjects().reduce((sum, subject) =>
      sum + subject.courses.reduce((courseSum, course) =>
        courseSum + getLearningV2CoursePlan(subject.key, course.name).quiz.length, 0), 0),
    balancedQuizCourses: usability.reduce((sum, row) => sum + row.quizBalanced, 0),
    allSameAnswerCourses: usability.reduce((sum, row) => sum + row.quizAllSameAnswer, 0),
    threeOptionQuestions: usability.reduce(
      (sum, row) => sum + row.quizThreeOptionQuestions,
      0,
    ),
    quizIssues: usability.reduce((sum, row) => sum + row.quizIssues, 0),
    practiceCourses: usability.reduce((sum, row) => sum + row.practiceReady, 0),
    sourceCourses: usability.reduce((sum, row) => sum + row.sourcesReady, 0),
    errorCourses: usability.reduce((sum, row) => sum + row.errorsReady, 0),
    shortStepBodies: usability.reduce((sum, row) => sum + row.shortBodies, 0),
    under100StepBodies: usability.reduce((sum, row) => sum + row.under100Bodies, 0),
    templateGuidance: usability.reduce((sum, row) => sum + row.templateGuidance, 0),
    reviewedCourses: usability.reduce((sum, row) => sum + row.reviewed, 0),
    structuredCourses: usability.reduce((sum, row) => sum + row.structured, 0),
  };
  console.log('usability totals', usabilityTotals);
  const security = getLearningV2Subject('security');
  const generatedSecurity = security?.courses.filter((course) =>
    getLearningV2CoursePlan('security', course.name).qualityStatus === 'generated',
  ) ?? [];
  console.log('security generated courses', generatedSecurity.map((course) => course.name));
  expect(generatedSecurity).toHaveLength(0);
  for (const courseName of [
    '授权渗透测试',
    '自动化攻防靶场',
    '多语言安全编码',
    '攻击防御与蓝队运营',
    'AI 与 LLM 安全',
  ]) {
    expect(getLearningV2CoursePlan('security', courseName).quiz.length, courseName)
      .toBeGreaterThanOrEqual(4);
  }
  const party = getLearningV2Subject('party');
  console.log('party generated courses', party?.courses
    .filter((course) => getLearningV2CoursePlan('party', course.name).qualityStatus === 'generated')
    .map((course) => course.name));
  const politics = getLearningV2Subject('politics');
  console.log('politics generated courses', politics?.courses
    .filter((course) => getLearningV2CoursePlan('politics', course.name).qualityStatus === 'generated')
    .map((course) => course.name));
  expect(rows.length).toBe(22);
  expect(duplicateBodies).toHaveLength(0);
  expect(duplicateSentences).toHaveLength(0);
  expect(duplicateQuizPrompts).toHaveLength(0);
  expect(duplicateGuidedPractice).toHaveLength(0);
  expect(repeatedSemanticFragments).toHaveLength(0);
  expect(rows.reduce((sum, row) => sum + row.generated, 0)).toBe(0);
  expect(rows.reduce((sum, row) => sum + row.expanded, 0)).toBe(0);
  for (const row of usability) {
    expect(row.quizFour, row.subject).toBe(row.courses);
    expect(row.quizBalanced, row.subject).toBe(row.courses);
    expect(row.quizAllSameAnswer, row.subject).toBe(0);
    expect(row.quizIssues, row.subject).toBe(0);
    expect(row.practiceReady, row.subject).toBe(row.courses);
    expect(row.sourcesReady, row.subject).toBe(row.courses);
    expect(row.errorsReady, row.subject).toBe(row.courses);
  }
  expect(usabilityTotals.courses).toBe(1387);
  expect(usabilityTotals.quizCourses).toBe(usabilityTotals.courses);
  expect(usabilityTotals.practiceCourses).toBe(usabilityTotals.courses);
  expect(usabilityTotals.shortStepBodies).toBe(0);
  expect(usabilityTotals.templateGuidance).toBe(0);
  expect(usabilityTotals.reviewedCourses + usabilityTotals.structuredCourses)
    .toBe(usabilityTotals.courses);
  expect(usabilityTotals.reviewedCourses).toBe(usabilityTotals.courses);
  expect(usabilityTotals.structuredCourses).toBe(0);
});
