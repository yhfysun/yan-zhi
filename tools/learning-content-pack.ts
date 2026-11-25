import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLearningContentSelectionManifest,
  createLearningSubjectPack,
  learningSubjectPackFileName,
  listLearningContentSubjects,
  parseLearningSubjectPack,
  serializeLearningSubjectPack,
  validateLearningSubjectPack,
  type LearningContentDistribution,
  type LearningSubjectContentPack,
} from '../packages/shared/src/learning/learning-content-pack.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command = 'list', ...argv] = process.argv.slice(2);

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function list(value: string | undefined): string[] {
  return value?.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function rootPath(value: string | undefined, fallback: string): string {
  return resolve(ROOT, value || fallback);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function allSubjectKeys(): string[] {
  return listLearningContentSubjects().map((subject) => subject.key);
}

function buildSelection(): Map<string, LearningContentDistribution> {
  const all = allSubjectKeys();
  const known = new Set(all);
  const fallback = (option('default') ?? 'ondemand') as LearningContentDistribution;
  if (!['bundled', 'ondemand', 'excluded'].includes(fallback)) {
    throw new Error(`--default 必须是 bundled / ondemand / excluded，收到 ${fallback}`);
  }

  const result = new Map<string, LearningContentDistribution>(all.map((key) => [key, fallback]));
  const apply = (keys: string[], distribution: LearningContentDistribution) => {
    for (const key of keys) {
      if (!known.has(key)) throw new Error(`未知科目：${key}`);
      result.set(key, distribution);
    }
  };

  apply(list(option('subjects')), 'bundled');
  apply(list(option('ondemand')), 'ondemand');
  apply(list(option('excluded')), 'excluded');
  return result;
}

function exportPacks(outDir: string): void {
  const distribution = buildSelection();
  const generatedAt = option('generated-at') ?? new Date().toISOString();
  const contentVersion = option('content-version') ?? '2026.11.23.1';
  const subjects = listLearningContentSubjects();
  const packs: LearningSubjectContentPack[] = [];

  for (const entry of createLearningContentSelectionManifest(
    subjects.map((subject) => ({
      subjectKey: subject.key,
      distribution: distribution.get(subject.key) ?? 'ondemand',
    })),
    generatedAt,
  ).entries) {
    if (entry.distribution === 'excluded') continue;
    const pack = createLearningSubjectPack(entry.subjectKey, {
      distribution: entry.distribution,
      contentVersion,
      generatedAt,
    });
    packs.push(pack);
    const distributionDir = resolve(outDir, entry.distribution);
    mkdirSync(distributionDir, { recursive: true });
    writeFileSync(resolve(distributionDir, learningSubjectPackFileName(entry.subjectKey)), serializeLearningSubjectPack(pack), 'utf8');
  }

  writeJson(
    resolve(outDir, 'selection.manifest.json'),
    createLearningContentSelectionManifest(
      subjects.map((subject) => ({
        subjectKey: subject.key,
        distribution: distribution.get(subject.key) ?? 'ondemand',
      })),
      generatedAt,
    ),
  );

  console.table(packs.map((pack) => ({
    subject: pack.subject.name,
    distribution: pack.distribution,
    courses: pack.counts.courses,
    steps: pack.counts.steps,
    quizzes: pack.counts.quizQuestions,
  })));
  console.log(`已导出 ${packs.length} 个科目包与 selection.manifest.json 到 ${outDir}`);
}

function verifyPack(file: string): void {
  const pack = parseLearningSubjectPack(JSON.parse(readFileSync(file, 'utf8')));
  console.table([{
    subject: pack.subject.name,
    distribution: pack.distribution,
    courses: pack.counts.courses,
    steps: pack.counts.steps,
    quizzes: pack.counts.quizQuestions,
  }]);
  console.log(`PASS ${file}`);
}

function createCustomPackTemplate(key: string, name: string): LearningSubjectContentPack {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(key) || key.startsWith('learning-')) {
    throw new Error('--key 必须是 2-64 位小写字母、数字或短横线，且不能以 learning- 开头');
  }
  const courseName = `${name}：第一讲`;
  const trackName = '自定义课程';
  const steps = [
    {
      title: '问题、输入与完成标准',
      body: '先说明这一讲要解决的具体问题、学习者已有输入和可观察完成标准。把术语替换成本领域真实对象，写清一个正确样例和一个错误样例；不要只写“理解概念”。',
      note: '完成标准必须可观察',
    },
    {
      title: '核心机制与边界',
      body: '解释这个方法为什么有效、依赖哪些前提、在哪些条件下失效。至少给出一个真实案例、一个反例和一条来源；读者应能据此判断何时使用、何时停止。',
      note: '机制、前提与失败边界一起写',
    },
    {
      title: '跟做案例',
      body: '提供最小可执行案例、代码、操作命令或材料清单，再给出预期输出或观察结果。案例中的路径、版本、单位和权限必须明确，不能使用无法复现的占位内容。',
      note: '案例必须有输入和预期结果',
    },
    {
      title: '独立练习',
      body: '设计一个改变输入或约束的独立任务，要求学习者提交结果、证据和一次失败复盘。练习不能只是重复跟做，应至少改变一个条件并包含验收标准。',
      note: '练习要能独立验收',
    },
    {
      title: '复盘与迁移',
      body: '让学习者解释本讲方法在新场景中的适用范围，比较一个替代方案，并记录仍需查证的问题。最后给出下一次复习动作和可分享的产出。',
      note: '复盘要产出可迁移结论',
    },
  ];
  const quiz = [1, 2, 3, 4].map((number) => ({
    prompt: `第 ${number} 题：本讲哪项做法最符合可复核学习？`,
    options: ['记录输入、结果和失败边界', '只摘抄一句结论', '跳过案例直接背答案'],
    answer: 0,
    explanation: '可复核学习必须保留输入、操作、结果、失败边界和来源，而不是只保留一句结论。',
    focus: '证据与边界',
  }));
  const course = {
    id: `${key}:0:0`,
    name: courseName,
    trackName,
    plan: {
      subjectKey: key,
      courseName,
      trackName,
      title: courseName,
      prerequisite: '说明进入本讲前需要掌握的最小知识。',
      plainLanguageGoal: '完成真实案例、一次独立练习，并提交可复核证据。',
      guidedPractice: '按步骤完成最小案例，记录输入、输出与失败边界。',
      independentPractice: '改变一个条件重做案例，提交结果、证据与复盘。',
      commonErrors: ['只写结论，没有输入和验证证据。', '案例无法在另一台机器或另一份材料上复现。'],
      sourceRefs: ['https://example.com/replace-with-your-source'],
      qualityStatus: 'draft' as const,
      steps,
      expertNotes: [],
      quiz,
    },
  };

  return {
    format: 'yan-zhi.learning-subject-pack',
    formatVersion: 1,
    packageId: `learning.subject.${key}`,
    contentVersion: '0.1.0',
    generatedAt: new Date().toISOString(),
    distribution: 'ondemand',
    scope: 'subject',
    subject: {
      key,
      name,
      short: name.slice(0, 4),
      accent: '#2f6d54',
      tint: '#e7f1eb',
      line: '用户自定义课程包，请在导入前完成全部占位内容。',
      current: {
        stage: trackName,
        course: courseName,
        step: steps[0].title,
        progress: 0,
        minutes: 30,
      },
      stats: [['课程', '1'], ['步骤', '5']],
      tracks: [{ name: trackName, note: '替换为真实学习路径说明', courses: [{ name: courseName, meta: '30 分钟' }] }],
      lesson: {
        labels: ['自定义'],
        eyebrow: 'DRAFT',
        title: courseName,
        goal: course.plan.plainLanguageGoal,
        minutes: 30,
        steps: steps.map((step) => ({ ...step, objective: step.note, practice: course.plan.guidedPractice, checkpoint: step.note })),
      },
      practice: { prompt: quiz[0].prompt, options: quiz[0].options, answer: 0, explanation: quiz[0].explanation, focus: quiz[0].focus },
      review: { due: 0, mastery: 0, items: ['完成第一讲后安排复习'] },
      coach: { opening: '先说明输入和完成标准。', prompts: ['你的证据是什么？', '失败边界在哪里？'] },
      book: {
        shelf: ['自定义课程资料'],
        title: '自定义课程资料',
        unit: '讲',
        kind: '课程资料',
        original: '',
        translation: '',
        notes: [],
        annotation: '',
        source: '由课程包作者填写真实来源',
      },
      studio: {
        type: '自定义实践',
        title: '完成可复核案例',
        task: course.plan.independentPractice,
        steps: ['准备输入', '执行操作', '记录结果', '复盘失败边界'],
        output: '结果、证据、来源与复盘',
        boundary: '只使用作者有权分享的材料，不包含个人数据与密钥。',
        features: ['可复现案例', '独立练习', '来源卡'],
      },
    },
    courses: [course],
    counts: {
      courses: 1,
      steps: 5,
      quizQuestions: 4,
      codeLabs: 0,
    },
  };
}

function initPack(): void {
  const key = option('key');
  const name = option('name');
  if (!key || !name) throw new Error('init 需要 --key=<subject-key> 与 --name=<显示名称>');
  const pack = createCustomPackTemplate(key, name);
  const issues = validateLearningSubjectPack(pack);
  if (issues.length > 0) throw new Error(`模板校验失败：${issues[0].path} ${issues[0].message}`);
  const out = rootPath(option('file'), `tmp/learning-content/${key}.yzcourse.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serializeLearningSubjectPack(pack), 'utf8');
  console.log(`已创建 ${out}`);
  console.log('请替换示例来源、课程正文、题库和许可信息，再运行 verify。');
}

try {
  if (command === 'list') {
    console.table(listLearningContentSubjects());
  } else if (command === 'export') {
    const outDir = rootPath(option('out'), 'tmp/learning-content-packs');
    mkdirSync(outDir, { recursive: true });
    exportPacks(outDir);
  } else if (command === 'verify') {
    const file = option('file');
    if (!file) throw new Error('verify 需要 --file=<yzcourse.json>');
    verifyPack(resolve(ROOT, file));
  } else if (command === 'init') {
    initPack();
  } else {
    throw new Error(`未知命令：${command}。可用 list / export / verify / init`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
