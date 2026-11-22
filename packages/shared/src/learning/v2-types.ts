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

export type LearningV2LessonStep = {
  readonly title: string;
  readonly body: string;
  readonly note: string;
  readonly objective?: string;
  readonly practice?: string;
  readonly checkpoint?: string;
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
  readonly qualityStatus: 'curated' | 'generated' | 'draft';
  readonly steps: LearningV2Lesson['steps'];
  readonly expertNotes: readonly LearningV2ExpertNote[];
  /** 本课章节题库（选择题）；未配置时练习页回退科目综合题 + 步骤自测清单。 */
  readonly quiz: readonly LearningV2Practice[];
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
  /** 课程级真实注解/笔记；不填则回退到科目池（v2-curated/expert-notes.ts）。 */
  readonly expertNotes?: readonly LearningV2ExpertNote[];
  /** 本课章节题库；不填则练习页回退科目综合题 + 步骤自测清单。 */
  readonly quiz?: readonly LearningV2Practice[];
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
