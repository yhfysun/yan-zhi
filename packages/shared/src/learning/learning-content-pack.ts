import {
  getLearningV2BuiltinSubjects,
  getLearningV2CoursePlan,
  getLearningV2Subject,
} from './v2.js';
import type {
  LearningV2CoursePlan,
  LearningV2Subject,
  LearningV2SubjectView,
} from './v2-types.js';

export const LEARNING_CONTENT_PACK_FORMAT = 'yan-zhi.learning-subject-pack' as const;
export const LEARNING_CONTENT_SELECTION_FORMAT = 'yan-zhi.learning-content-selection' as const;
export const LEARNING_CONTENT_FORMAT_VERSION = 1 as const;

export type LearningContentDistribution = 'bundled' | 'ondemand' | 'excluded';

export type LearningContentPackCourse = {
  readonly id: string;
  readonly name: string;
  readonly trackName: string;
  readonly plan: LearningV2CoursePlan;
};

export type LearningContentPackSubject = Omit<LearningV2SubjectView, 'courses'>;

export type LearningContentPackCounts = {
  readonly courses: number;
  readonly steps: number;
  readonly quizQuestions: number;
  readonly codeLabs: number;
};

export type LearningSubjectContentPack = {
  readonly format: typeof LEARNING_CONTENT_PACK_FORMAT;
  readonly formatVersion: typeof LEARNING_CONTENT_FORMAT_VERSION;
  readonly packageId: string;
  readonly contentVersion: string;
  readonly generatedAt: string;
  readonly distribution: LearningContentDistribution;
  readonly scope: 'subject';
  readonly subject: LearningContentPackSubject;
  readonly courses: readonly LearningContentPackCourse[];
  readonly counts: LearningContentPackCounts;
};

export type LearningContentSelectionEntry = {
  readonly subjectKey: string;
  readonly subjectName: string;
  readonly packageId: string;
  readonly contentVersion: string;
  readonly distribution: LearningContentDistribution;
};

export type LearningContentSelectionManifest = {
  readonly format: typeof LEARNING_CONTENT_SELECTION_FORMAT;
  readonly formatVersion: typeof LEARNING_CONTENT_FORMAT_VERSION;
  readonly generatedAt: string;
  readonly entries: readonly LearningContentSelectionEntry[];
};

export type LearningContentPackIssue = {
  readonly path: string;
  readonly message: string;
};

type CreatePackOptions = {
  readonly distribution?: LearningContentDistribution;
  readonly contentVersion?: string;
  readonly generatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPack(message: string): never {
  throw new Error(`学习科目数据包无效：${message}`);
}

function normalizeDistribution(value: unknown): LearningContentDistribution {
  return value === 'bundled' || value === 'ondemand' || value === 'excluded'
    ? value
    : 'ondemand';
}

export function learningSubjectPackageId(subjectKey: string): string {
  return `learning.subject.${subjectKey}`;
}

export function learningSubjectPackFileName(subjectKey: string): string {
  return `${subjectKey}.yzcourse.json`;
}

function subjectWithoutCourses(subject: LearningV2SubjectView): LearningContentPackSubject {
  const { courses: _courses, ...metadata } = subject;
  return metadata;
}

function countPack(courses: readonly LearningContentPackCourse[]): LearningContentPackCounts {
  return {
    courses: courses.length,
    steps: courses.reduce((total, course) => total + course.plan.steps.length, 0),
    quizQuestions: courses.reduce((total, course) => total + course.plan.quiz.length, 0),
    codeLabs: courses.filter((course) => Boolean(course.plan.codeLab)).length,
  };
}

export function createLearningSubjectPack(
  subjectKey: string,
  options: CreatePackOptions = {},
): LearningSubjectContentPack {
  const subject = getLearningV2Subject(subjectKey);
  if (!subject) invalidPack(`找不到科目 ${subjectKey}`);

  const courses = subject.courses.map((course) => ({
    id: course.id,
    name: course.name,
    trackName: course.trackName,
    plan: getLearningV2CoursePlan(subjectKey, course.name),
  }));

  return {
    format: LEARNING_CONTENT_PACK_FORMAT,
    formatVersion: LEARNING_CONTENT_FORMAT_VERSION,
    packageId: learningSubjectPackageId(subjectKey),
    contentVersion: options.contentVersion ?? '2026.11.23.1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    distribution: options.distribution ?? 'bundled',
    scope: 'subject',
    subject: subjectWithoutCourses(subject),
    courses,
    counts: countPack(courses),
  };
}

export function createLearningContentSelectionManifest(
  entries: readonly {
    readonly subjectKey: string;
    readonly distribution: LearningContentDistribution;
    readonly subjectName?: string;
    readonly packageId?: string;
    readonly contentVersion?: string;
  }[],
  generatedAt = new Date().toISOString(),
): LearningContentSelectionManifest {
  const seen = new Set<string>();
  const normalized = entries.map((entry) => {
    if (seen.has(entry.subjectKey)) {
      throw new Error(`学习内容打包清单存在重复科目：${entry.subjectKey}`);
    }
    seen.add(entry.subjectKey);
    const subject = getLearningV2BuiltinSubjects().find(
      (item) => item.key === entry.subjectKey,
    );
    if (!subject && !entry.subjectName) {
      throw new Error(`学习内容打包清单包含未知科目：${entry.subjectKey}`);
    }
    return {
      subjectKey: entry.subjectKey,
      subjectName: subject?.name ?? entry.subjectName!,
      packageId: entry.packageId ?? learningSubjectPackageId(entry.subjectKey),
      contentVersion: entry.contentVersion ?? '2026.11.23.1',
      distribution: entry.distribution,
    };
  });

  return {
    format: LEARNING_CONTENT_SELECTION_FORMAT,
    formatVersion: LEARNING_CONTENT_FORMAT_VERSION,
    generatedAt,
    entries: normalized,
  };
}

export function validateLearningSubjectPack(input: unknown): LearningContentPackIssue[] {
  const issues: LearningContentPackIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(input)) return [{ path: '$', message: '顶层必须是对象' }];
  if (input.format !== LEARNING_CONTENT_PACK_FORMAT) add('$.format', '不是学习科目数据包');
  if (input.formatVersion !== LEARNING_CONTENT_FORMAT_VERSION) add('$.formatVersion', '不支持的数据包版本');
  if (input.scope !== 'subject') add('$.scope', '当前只支持 subject 范围');
  if (typeof input.packageId !== 'string' || !input.packageId.startsWith('learning.subject.')) {
    add('$.packageId', 'packageId 格式无效');
  }
  if (typeof input.contentVersion !== 'string' || input.contentVersion.trim() === '') {
    add('$.contentVersion', '缺少内容版本');
  }
  if (typeof input.generatedAt !== 'string' || Number.isNaN(Date.parse(input.generatedAt))) {
    add('$.generatedAt', '生成时间无效');
  }
  const distribution = normalizeDistribution(input.distribution);
  if (input.distribution !== distribution) add('$.distribution', 'distribution 必须是 bundled / ondemand / excluded');
  if (distribution === 'excluded') add('$.distribution', 'excluded 数据包不可导入');

  if (!isRecord(input.subject)) {
    add('$.subject', '缺少科目元数据');
    return issues;
  }
  const subject = input.subject;
  if (
    typeof subject.key !== 'string'
    || !/^[a-z][a-z0-9-]{1,63}$/.test(subject.key)
  ) {
    add('$.subject.key', '科目 key 必须为 2-64 位小写字母、数字或短横线');
  }
  if (typeof subject.name !== 'string' || subject.name.trim() === '') add('$.subject.name', '科目名称无效');
  if (
    typeof subject.key === 'string'
    && input.packageId !== learningSubjectPackageId(subject.key)
  ) {
    add('$.packageId', 'packageId 必须与 subject.key 对应');
  }
  if (!Array.isArray(subject.tracks)) add('$.subject.tracks', '缺少课程轨道');

  const courses = Array.isArray(input.courses) ? input.courses : [];
  if (courses.length === 0) add('$.courses', '至少需要一门课程');
  const names = new Set<string>();
  const ids = new Set<string>();
  const planNames = new Set<string>();
  let computedSteps = 0;
  let computedQuizQuestions = 0;
  let computedCodeLabs = 0;

  courses.forEach((rawCourse, index) => {
    const path = `$.courses[${index}]`;
    if (!isRecord(rawCourse)) {
      add(path, '课程必须是对象');
      return;
    }
    if (typeof rawCourse.id !== 'string' || rawCourse.id.trim() === '') add(`${path}.id`, '缺少稳定课程 id');
    if (typeof rawCourse.name !== 'string' || rawCourse.name.trim() === '') add(`${path}.name`, '缺少课程名称');
    if (typeof rawCourse.trackName !== 'string' || rawCourse.trackName.trim() === '') add(`${path}.trackName`, '缺少轨道名称');
    if (typeof rawCourse.id === 'string') {
      if (ids.has(rawCourse.id)) add(`${path}.id`, '课程 id 重复');
      ids.add(rawCourse.id);
    }
    if (typeof rawCourse.name === 'string') {
      if (names.has(rawCourse.name)) add(`${path}.name`, '课程名称重复');
      names.add(rawCourse.name);
      planNames.add(rawCourse.name);
    }
    if (!isRecord(rawCourse.plan)) {
      add(`${path}.plan`, '缺少课程教案');
      return;
    }
    if (rawCourse.plan.subjectKey !== subject.key) add(`${path}.plan.subjectKey`, '与科目 key 不一致');
    if (rawCourse.plan.courseName !== rawCourse.name) add(`${path}.plan.courseName`, '与课程名称不一致');
    const steps = Array.isArray(rawCourse.plan.steps) ? rawCourse.plan.steps : [];
    if (steps.length === 0) add(`${path}.plan.steps`, '教案没有学习步骤');
    computedSteps += steps.length;
    steps.forEach((step, stepIndex) => {
      if (
        !isRecord(step)
        || typeof step.title !== 'string'
        || typeof step.body !== 'string'
        || step.body.trim().length === 0
      ) {
        add(`${path}.plan.steps[${stepIndex}]`, '步骤缺少标题或正文');
      }
    });
    const quiz = Array.isArray(rawCourse.plan.quiz) ? rawCourse.plan.quiz : [];
    computedQuizQuestions += quiz.length;
    quiz.forEach((question, questionIndex) => {
      if (!isRecord(question)) {
        add(`${path}.plan.quiz[${questionIndex}]`, '题目必须是对象');
        return;
      }
      const options = Array.isArray(question.options) ? question.options : [];
      if (options.length < 3 || new Set(options).size !== options.length) {
        add(`${path}.plan.quiz[${questionIndex}].options`, '至少 3 个且不重复的选项');
      }
      if (
        typeof question.answer !== 'number'
        || !Number.isInteger(question.answer)
        || question.answer < 0
        || question.answer >= options.length
      ) {
        add(`${path}.plan.quiz[${questionIndex}].answer`, '答案下标越界');
      }
    });
    if (!Array.isArray(rawCourse.plan.commonErrors) || rawCourse.plan.commonErrors.length < 2) {
      add(`${path}.plan.commonErrors`, '至少需要两个常见错误');
    }
    if (!Array.isArray(rawCourse.plan.sourceRefs) || rawCourse.plan.sourceRefs.length < 1) {
      add(`${path}.plan.sourceRefs`, '至少需要一个来源');
    }
    if (rawCourse.plan.studyPoints !== undefined) {
      if (!Array.isArray(rawCourse.plan.studyPoints)) {
        add(`${path}.plan.studyPoints`, '重点标记必须是数组');
      } else {
        rawCourse.plan.studyPoints.forEach((point, pointIndex) => {
          const pointPath = `${path}.plan.studyPoints[${pointIndex}]`;
          if (
            !isRecord(point)
            || !['重点', '必背', '易错', '考点'].includes(String(point.label))
            || typeof point.text !== 'string'
            || point.text.trim() === ''
            || !Number.isInteger(point.stepIndex)
            || Number(point.stepIndex) < 0
            || Number(point.stepIndex) >= steps.length
          ) {
            add(pointPath, '重点标记需要合法标签、正文和步骤下标');
          }
        });
      }
    }
    if (rawCourse.plan.eventDetails !== undefined) {
      if (!Array.isArray(rawCourse.plan.eventDetails)) {
        add(`${path}.plan.eventDetails`, '事件档案必须是数组');
      } else {
        rawCourse.plan.eventDetails.forEach((eventDetail, eventIndex) => {
          const eventPath = `${path}.plan.eventDetails[${eventIndex}]`;
          if (!isRecord(eventDetail)) {
            add(eventPath, '事件档案必须是对象');
            return;
          }
          for (const field of ['id', 'title', 'period', 'summary', 'background', 'outcome', 'significance']) {
            if (typeof eventDetail[field] !== 'string' || eventDetail[field].trim() === '') {
              add(`${eventPath}.${field}`, '事件档案字段不能为空');
            }
          }
          const sourceCards = Array.isArray(eventDetail.sourceCards) ? eventDetail.sourceCards : [];
          if (sourceCards.length < 1) add(`${eventPath}.sourceCards`, '至少需要一张来源卡');
          const sourceIds = new Set<string>();
          sourceCards.forEach((source, sourceIndex) => {
            if (
              !isRecord(source)
              || typeof source.id !== 'string'
              || typeof source.title !== 'string'
              || typeof source.url !== 'string'
              || !/^https:\/\//.test(source.url)
            ) {
              add(`${eventPath}.sourceCards[${sourceIndex}]`, '来源卡缺少 id、标题或 HTTPS URL');
              return;
            }
            if (sourceIds.has(source.id)) add(`${eventPath}.sourceCards[${sourceIndex}].id`, '来源 id 重复');
            sourceIds.add(source.id);
          });
          const timeline = Array.isArray(eventDetail.timeline) ? eventDetail.timeline : [];
          if (timeline.length < 1) add(`${eventPath}.timeline`, '至少需要一个时间线节点');
          timeline.forEach((entry, entryIndex) => {
            const entryPath = `${eventPath}.timeline[${entryIndex}]`;
            if (
              !isRecord(entry)
              || typeof entry.date !== 'string'
              || typeof entry.title !== 'string'
              || typeof entry.body !== 'string'
            ) {
              add(entryPath, '时间线节点缺少日期、标题或正文');
              return;
            }
            const entrySourceIds = Array.isArray(entry.sourceIds) ? entry.sourceIds : [];
            if (entrySourceIds.length < 1) add(`${entryPath}.sourceIds`, '时间线节点至少绑定一条来源');
            for (const sourceId of entrySourceIds) {
              if (typeof sourceId !== 'string' || !sourceIds.has(sourceId)) {
                add(`${entryPath}.sourceIds`, `未知来源 id：${String(sourceId)}`);
              }
            }
          });
        });
      }
    }
    if (rawCourse.plan.codeLab) computedCodeLabs += 1;
  });

  if (!isRecord(input.counts)) {
    add('$.counts', '缺少汇总计数');
  } else {
    const expected = {
      courses: courses.length,
      steps: computedSteps,
      quizQuestions: computedQuizQuestions,
      codeLabs: computedCodeLabs,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (input.counts[key] !== value) {
        add(`$.counts.${key}`, `声明值 ${String(input.counts[key])} 与重算值 ${value} 不一致`);
      }
    }
  }

  if (Array.isArray(subject.tracks)) {
    const trackCourses = subject.tracks.flatMap((track) =>
      isRecord(track) && Array.isArray(track.courses)
        ? track.courses
          .filter(isRecord)
          .map((course) => course.name)
          .filter((name): name is string => typeof name === 'string')
        : [],
    );
    const missingFromPack = trackCourses.filter((name) => !planNames.has(name));
    const missingFromTracks = [...planNames].filter((name) => !trackCourses.includes(name));
    if (missingFromPack.length > 0) add('$.subject.tracks', `轨道课程缺少教案：${missingFromPack.slice(0, 5).join('、')}`);
    if (missingFromTracks.length > 0) add('$.courses', `课程未登记到轨道：${missingFromTracks.slice(0, 5).join('、')}`);
  }

  return issues;
}

export function parseLearningSubjectPack(input: unknown): LearningSubjectContentPack {
  const issues = validateLearningSubjectPack(input);
  if (issues.length > 0) {
    const summary = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`学习科目数据包校验失败：\n${summary}`);
  }
  return input as LearningSubjectContentPack;
}

export function serializeLearningSubjectPack(pack: LearningSubjectContentPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export function listLearningContentSubjects(): readonly Pick<
  LearningV2Subject,
  'key' | 'name' | 'short'
>[] {
  return getLearningV2BuiltinSubjects().map(({ key, name, short }) => ({ key, name, short }));
}
