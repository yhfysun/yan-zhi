export type LearningV2PageKey =
  | 'overview'
  | 'roadmap'
  | 'books'
  | 'lesson'
  | 'studio'
  | 'practice'
  | 'review'
  | 'coach';

export type LearningV2Course = {
  readonly name: string;
  readonly meta: string;
};

export type LearningV2Track = {
  readonly name: string;
  readonly note: string;
  readonly courses: readonly LearningV2Course[];
};

export type LearningV2BookNote = {
  readonly term: string;
  readonly text: string;
};

export type LearningV2Book = {
  readonly shelf: readonly string[];
  readonly title: string;
  readonly unit: string;
  readonly kind: string;
  readonly original: string;
  readonly translation: string;
  readonly notes: readonly LearningV2BookNote[];
  readonly annotation: string;
  readonly source: string;
};

export type LearningV2Studio = {
  readonly type: string;
  readonly title: string;
  readonly task: string;
  readonly steps: readonly string[];
  readonly output: string;
  readonly boundary: string;
  readonly features: readonly string[];
};

export type LearningV2CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'go';

export type LearningV2LessonExample = {
  readonly title: string;
  readonly language: string;
  readonly code: string;
  /** 命令或程序的预期输出；用于对照，不参与自动判分。 */
  readonly output?: string;
};

export type LearningV2StudyPoint = {
  readonly label: '重点' | '必背' | '易错' | '考点';
  readonly text: string;
  /** 绑定到五步教案中的 0-based 步骤下标。 */
  readonly stepIndex: number;
};

export type LearningV2EventSource = {
  readonly id: string;
  readonly title: string;
  readonly issuer: string;
  readonly date?: string;
  readonly url: string;
  /** 该来源在事件档案中具体用于核对什么。 */
  readonly usedFor: string;
};

export type LearningV2EventTimelineEntry = {
  readonly date: string;
  readonly title: string;
  readonly body: string;
  readonly sourceIds: readonly string[];
};

/**
 * 重大事件的独立阅读档案。课程正文只承担当前教学步骤，
 * 完整始末和材料出处由事件详情覆盖层展示。
 */
export type LearningV2EventDetail = {
  readonly id: string;
  /** 事件、制度、概念、实验或案例；未填时按重大事件处理。 */
  readonly kind?: 'event' | 'institution' | 'concept' | 'experiment' | 'case';
  readonly title: string;
  readonly period: string;
  readonly summary: string;
  readonly background: string;
  readonly timeline: readonly LearningV2EventTimelineEntry[];
  readonly outcome: string;
  readonly significance: string;
  readonly sourceCards: readonly LearningV2EventSource[];
};

export type LearningV2LessonStep = {
  readonly title: string;
  readonly body: string;
  readonly note: string;
  readonly objective?: string;
  readonly practice?: string;
  readonly checkpoint?: string;
  /** 手写命令、源码或追踪样例，在学习步骤正文之后原样展示。 */
  readonly example?: LearningV2LessonExample;
};

export type LearningV2CodeLabTask = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly defaultLanguage: LearningV2CodeLanguage;
  readonly starterCode: Partial<Record<LearningV2CodeLanguage, string>>;
  readonly stdin?: string;
  readonly checkpoint: string;
};

export type LearningV2CodeLab = {
  readonly title: string;
  readonly description: string;
  readonly requiredRuntime?: 'java' | 'python' | 'node' | 'c' | 'cpp' | 'go';
  readonly runtimeLabel: string;
  readonly downloadUrl?: string;
  readonly docsUrl?: string;
  readonly installSteps: readonly string[];
  readonly languages: readonly LearningV2CodeLanguage[];
  readonly practice: LearningV2CodeLabTask;
  readonly apply: LearningV2CodeLabTask;
};

export type LearningV2Lesson = {
  readonly labels: readonly string[];
  readonly eyebrow: string;
  readonly title: string;
  readonly goal: string;
  readonly minutes: number;
  readonly steps: readonly LearningV2LessonStep[];
};

export type LearningV2Practice = {
  readonly prompt: string;
  readonly options: readonly string[];
  readonly answer: number;
  readonly explanation: string;
  readonly focus: string;
};

export type LearningV2Review = {
  readonly due: number;
  readonly mastery: number;
  readonly items: readonly string[];
};

export type LearningV2Coach = {
  readonly opening: string;
  readonly prompts: readonly string[];
};

export type LearningV2Subject = {
  readonly key: string;
  readonly name: string;
  readonly short: string;
  readonly accent: string;
  readonly tint: string;
  readonly line: string;
  readonly current: {
    readonly stage: string;
    readonly course: string;
    readonly step: string;
    readonly progress: number;
    readonly minutes: number;
  };
  readonly stats: readonly (readonly [string, string])[];
  readonly tracks: readonly LearningV2Track[];
  readonly lesson: LearningV2Lesson;
  readonly practice: LearningV2Practice;
  readonly review: LearningV2Review;
  readonly coach: LearningV2Coach;
  readonly book: LearningV2Book;
  readonly studio: LearningV2Studio;
};

export type LearningV2CatalogData = {
  readonly pages: readonly { readonly key: LearningV2PageKey; readonly label: string }[];
  readonly subjects: readonly LearningV2Subject[];
};

export type LearningV2CourseRef = LearningV2Course & {
  readonly id: string;
  readonly subjectKey: string;
  readonly subjectName: string;
  readonly trackName: string;
};

export type LearningV2ExpertNote = {
  /** 条目性质：'公版古注'（逐字原文）或 '整理笔记'（依公开资料整理，非逐字引文）。 */
  readonly label: string;
  /** 真实出处：书名 + 篇目（古注），或公开资料名称/链接（整理笔记）。 */
  readonly source: string;
  /** 笔记正文：古注为逐字摘录，整理笔记为可执行的记法/方法。 */
  readonly quote: string;
};

export type LearningV2CoursePlan = {
  readonly subjectKey: string;
  readonly courseName: string;
  readonly trackName: string;
  readonly title: string;
  readonly prerequisite: string;
  readonly plainLanguageGoal: string;
  readonly guidedPractice: string;
  readonly independentPractice: string;
  readonly commonErrors: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly studyPoints?: readonly LearningV2StudyPoint[];
  /** 重大事件的完整始末、关键节点和逐条来源；没有则不显示事件档案入口。 */
  readonly eventDetails?: readonly LearningV2EventDetail[];
  readonly qualityStatus: 'curated' | 'generated' | 'draft';
  /** reviewed = 已进入章节重写覆盖层并通过专项验收；structured = 仍待全量重写。 */
  readonly reviewStatus: 'reviewed' | 'structured';
  readonly steps: LearningV2Lesson['steps'];
  readonly expertNotes: readonly LearningV2ExpertNote[];
  /** 本课章节题库（选择题）；未配置时练习页回退科目综合题 + 步骤自测清单。 */
  readonly quiz: readonly LearningV2Practice[];
  /** 本课可真实编辑、运行并保存证据的代码任务。 */
  readonly codeLab?: LearningV2CodeLab;
};

export type LearningV2CuratedCoursePlan = Pick<
  LearningV2CoursePlan,
  | 'prerequisite'
  | 'plainLanguageGoal'
  | 'guidedPractice'
  | 'independentPractice'
  | 'commonErrors'
  | 'sourceRefs'
  | 'steps'
> & {
  /** reviewed = 已进入章节重写覆盖层并通过专项验收；structured = 仍待全量重写。 */
  readonly contentStatus?: 'reviewed' | 'structured';
  readonly studyPoints?: readonly LearningV2StudyPoint[];
  /** 课程级真实注解/笔记；不填则回退到科目池（v2-curated/expert-notes.ts）。 */
  readonly expertNotes?: readonly LearningV2ExpertNote[];
  readonly eventDetails?: readonly LearningV2EventDetail[];
  /** 本课章节题库；不填则练习页回退科目综合题 + 步骤自测清单。 */
  readonly quiz?: readonly LearningV2Practice[];
  /** 本课代码实验室；仅在手写并核对任务后挂接。 */
  readonly codeLab?: LearningV2CodeLab;
};

export type LearningV2SubjectView = LearningV2Subject & {
  readonly courses: readonly LearningV2CourseRef[];
};

export type LearningV2LibraryEntry = {
  readonly id: string;
  readonly subjectKey: string;
  readonly subjectName: string;
  readonly title: string;
  readonly kind: string;
  readonly original: string;
  readonly translation: string;
  readonly source: string;
  readonly readable: boolean;
};

export type LearningV2ReadingCategoryKey =
  | 'classics'
  | 'zhiguai'
  | 'web-novel'
  | 'comics'
  | 'science'
  | 'common-sense'
  | 'world-records'
  | 'trivia'
  | 'course';

export type LearningV2ReadingCollectionKey =
  | 'youth'
  | 'adult'
  | 'subject'
  | 'red'
  | 'history'
  | 'vision'
  | 'knowledge'
  | 'science'
  | 'trivia';

export type LearningV2ReadingMode = 'builtin' | 'external' | 'platform' | 'import' | 'source';

export type LearningV2ReadingLanguage = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'mixed';

export type LearningV2ReadingAnnotation = {
  readonly term: string;
  readonly gloss: string;
  readonly kind?: 'term' | 'person' | 'place' | 'concept';
};

export type LearningV2ReaderBook = {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly language: LearningV2ReadingLanguage;
  readonly readingMode: LearningV2ReadingMode;
  readonly contentKind?: 'text' | 'comic';
  readonly assetKey?: string;
  readonly importedBookId?: string;
  readonly url?: string;
  readonly sourceId?: string;
  readonly source?: LearningV2BookSource;
  readonly bookUrl?: string;
  readonly contentUrl?: string;
  readonly sourceName: string;
  readonly license: string;
  readonly annotations: readonly LearningV2ReadingAnnotation[];
  readonly collectionLabels?: readonly string[];
};

export type LearningV2BookSourceAccess =
  | 'public-domain'
  | 'library'
  | 'authorized-platform';

export type LearningV2BookSourceProvider = 'gutendex' | 'mediawiki';

export type LearningV2BookSourceFieldRule = {
  readonly bookList?: string;
  readonly name?: string;
  readonly author?: string;
  readonly intro?: string;
  readonly coverUrl?: string;
  readonly bookUrl?: string;
  readonly kind?: string;
  readonly wordCount?: string;
  readonly lastChapter?: string;
  readonly tocUrl?: string;
};

export type LearningV2BookSourceRule = {
  readonly searchUrl: string;
  readonly exploreUrl?: string;
  readonly ruleSearch: LearningV2BookSourceFieldRule & { readonly bookList: string };
  readonly ruleExplore?: LearningV2BookSourceFieldRule;
  readonly ruleBookInfo?: LearningV2BookSourceFieldRule;
  readonly ruleToc: {
    readonly chapterList: string;
    readonly chapterName: string;
    readonly chapterUrl: string;
  };
  readonly ruleContent: {
    readonly content: string;
    readonly replaceRegex?: string;
  };
};

export type LearningV2BookSource = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly category: LearningV2ReadingCategoryKey;
  readonly access: LearningV2BookSourceAccess;
  readonly license: string;
  readonly description: string;
  readonly provider?: LearningV2BookSourceProvider;
  readonly rule?: LearningV2BookSourceRule;
  readonly insecure?: boolean;
};

export type LearningV2ReadingEntry = {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly category: LearningV2ReadingCategoryKey;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly url: string;
  readonly license: string;
  readonly description: string;
  readonly collections: readonly LearningV2ReadingCollectionKey[];
  readonly subjects: readonly string[];
  readonly readingMode: LearningV2ReadingMode;
  readonly language: LearningV2ReadingLanguage;
  readonly assetKey?: string;
  readonly annotations: readonly LearningV2ReadingAnnotation[];
  readonly chapterCount?: number;
  readonly edition?: string;
};
