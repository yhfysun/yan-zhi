import {
  getCoursePracticeTask,
  getLearningV2CoursePlan,
} from '../packages/shared/src/learning/v2.ts';

const courseNames = process.argv.slice(2);

if (courseNames.length === 0) {
  console.error('Usage: pnpm exec tsx tools/audit-learning-courses.ts <course-name> [...course-name]');
  process.exit(2);
}

const bannedPhrases = [
  '学完这一步，必须记录输入、状态变化、失败方式和可验证证据',
  '本步的可复核产出是',
  '写出这个知识点的',
  '三行记录',
  '主张—依据—边界',
];

type Issue = {
  course: string;
  field: string;
  problem: string;
};

const issues: Issue[] = [];
const rows = courseNames.map((courseName) => {
  const plan = getLearningV2CoursePlan('programming', courseName);
  const practice = getCoursePracticeTask('programming', courseName);

  if (!plan) {
    issues.push({ course: courseName, field: 'course', problem: 'not found' });
    return {
      course: courseName,
      steps: 0,
      examples: 0,
      quiz: 0,
      quizIssues: 0,
      practice: false,
    };
  }

  const bodies = plan.steps.map((step) => step.body.trim());
  const duplicateBodies = [...new Set(
    bodies.filter((body, index) => bodies.indexOf(body) !== index),
  )];
  const quizIssues = plan.quiz.filter((question) =>
    question.options.length < 3
    || new Set(question.options).size !== question.options.length
    || question.answer < 0
    || question.answer >= question.options.length
    || question.explanation.trim().length < 25
    || question.focus.trim().length === 0,
  ).length;

  if (plan.steps.length !== 5) {
    issues.push({ course: courseName, field: 'steps', problem: `expected 5, got ${plan.steps.length}` });
  }
  for (const step of plan.steps) {
    const body = step.body.trim();
    if (body.length < 100) {
      issues.push({ course: courseName, field: step.title, problem: `body ${body.length} < 100` });
    }
    for (const phrase of bannedPhrases) {
      if (body.includes(phrase)) {
        issues.push({ course: courseName, field: step.title, problem: `banned phrase: ${phrase}` });
      }
    }
    if (!step.example?.code.trim()) {
      issues.push({ course: courseName, field: step.title, problem: 'missing code or command example' });
    } else {
      if (step.example.code.trim().length < 80) {
        issues.push({ course: courseName, field: step.title, problem: 'example code < 80 chars' });
      }
      if ((step.example.output?.trim().length || 0) < 30) {
        issues.push({ course: courseName, field: step.title, problem: 'expected output < 30 chars' });
      }
    }
  }
  for (const body of duplicateBodies) {
    issues.push({ course: courseName, field: 'body', problem: `duplicate: ${body.slice(0, 36)}` });
  }
  if (plan.quiz.length !== 4) {
    issues.push({ course: courseName, field: 'quiz', problem: `expected 4, got ${plan.quiz.length}` });
  }
  if (quizIssues > 0) {
    issues.push({ course: courseName, field: 'quiz', problem: `${quizIssues} malformed questions` });
  }
  if (plan.guidedPractice.trim().length < 30 || plan.independentPractice.trim().length < 30) {
    issues.push({ course: courseName, field: 'practice', problem: 'guided/independent practice too short' });
  }
  if (!practice || practice.output.trim().length <= 8 || practice.boundary.trim().length <= 8) {
    issues.push({ course: courseName, field: 'practice', problem: 'missing output or boundary' });
  }

  return {
    course: courseName,
    steps: plan.steps.length,
    examples: plan.steps.filter((step) => Boolean(step.example?.code.trim())).length,
    quiz: plan.quiz.length,
    quizIssues,
    practice: Boolean(practice),
  };
});

console.table(rows);

if (issues.length > 0) {
  console.table(issues);
  console.error(`FAIL ${issues.length} content issue(s) in ${courseNames.length} course(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${courseNames.length} courses: content, examples, quizzes and practice are complete.`);
}
