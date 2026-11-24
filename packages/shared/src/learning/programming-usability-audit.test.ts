import { expect, it } from 'vitest';
import { getCoursePracticeTask, getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

it('audits programming lesson, quiz, and practice usability', () => {
  const subject = getLearningV2Subject('programming');
  expect(subject).toBeTruthy();
  const rows = subject!.courses.map((course) => {
    const plan = getLearningV2CoursePlan('programming', course.name);
    const practice = getCoursePracticeTask('programming', course.name);
    const quizIssues = plan.quiz.filter((question) =>
      question.options.length < 3
      || new Set(question.options).size !== question.options.length
      || question.answer < 0
      || question.answer >= question.options.length
      || question.explanation.length < 25
      || question.focus.length === 0,
    ).length;
    return {
      name: course.name,
      lesson: plan.steps.length === 5
        && plan.steps.every((step) =>
          step.body.length >= 60
          && !step.body.includes('本步的可复核产出是')
          && !step.body.includes('三行记录'),
        ),
      quizCount: plan.quiz.length,
      quizIssues,
      practice: plan.guidedPractice.length >= 30
        && plan.independentPractice.length >= 30
        && practice.output.length > 8
        && practice.boundary.length > 8
        && practice.studio.steps.length > 0,
      codeLab: Boolean(plan.codeLab),
      exampleSteps: plan.steps.filter((step) => Boolean(step.example?.code.trim())).length,
    };
  });
  const summary = {
    courses: rows.length,
    lessonReady: rows.filter((row) => row.lesson).length,
    quizCourses: rows.filter((row) => row.quizCount >= 3).length,
    quizQuestions: rows.reduce((sum, row) => sum + row.quizCount, 0),
    quizIssues: rows.reduce((sum, row) => sum + row.quizIssues, 0),
    practiceReady: rows.filter((row) => row.practice).length,
    codeLabs: rows.filter((row) => row.codeLab).length,
    coursesWithExamples: rows.filter((row) => row.exampleSteps > 0).length,
    exampleSteps: rows.reduce((sum, row) => sum + row.exampleSteps, 0),
  };
  console.table(summary);
  console.table(rows.filter((row) =>
    !row.lesson || row.quizCount < 3 || row.quizIssues > 0 || !row.practice || row.exampleSteps === 0,
  ).slice(0, 30));
  expect(summary.lessonReady).toBe(rows.length);
  expect(summary.practiceReady).toBe(rows.length);
  expect(summary.quizIssues).toBe(0);
  expect(summary.quizCourses).toBe(797);
  expect(summary.codeLabs).toBe(13);
  expect(summary.coursesWithExamples).toBe(290);
  expect(summary.exampleSteps).toBe(1330);
});
