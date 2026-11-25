<script setup lang="ts">
/**
 * Learning V2: unified, content-first learning surface.
 *
 * Framework references:
 * - Vue 3 Composition API: https://vuejs.org/guide/extras/composition-api-faq.html
 * - Vue Teleport: https://vuejs.org/guide/built-ins/teleport.html
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BookOpen, Brain, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck,
  Ellipsis, Library, ListChecks, NotebookPen, PackageOpen, Play, Sparkles, Wrench, X,
} from 'lucide-vue-next';
import {
  LEARNING_V2_PAGES,
  configureLearningContentDistribution,
  getCoursePracticeTask,
  getLearningV2CoursePlan,
  getLearningV2Library,
  getLearningV2Subject,
  getLearningV2Subjects,
  isLearningV2CourseReady,
  registerLearningContentPacks,
  unregisterLearningContentPack,
  PROGRAMMING_COURSE_PACKAGES,
  PROGRAMMING_CURRICULUM_PHASES,
  PROGRAMMING_PROJECTS,
  SUBJECT_EXPERT_NOTES,
  type LearningV2ExpertNote,
  type LearningV2LibraryEntry,
  type LearningV2PageKey,
  type LearningV2Practice,
  type LearningV2ReaderBook,
  type LearningSubjectContentPack,
} from '@yan-zhi/shared';
import { api } from '../api/client';
import NoteQuickCreateDialog from '../components/notes/NoteQuickCreateDialog.vue';
import AlgorithmWorkbench from '../components/learning/AlgorithmWorkbench.vue';
import LearningCoachPanel from '../components/learning/v2/LearningCoachPanel.vue';
import LearningCodeLab from '../components/learning/v2/LearningCodeLab.vue';
import LearningConversationRail from '../components/learning/v2/LearningConversationRail.vue';
import LearningLibrary from '../components/learning/v2/LearningLibrary.vue';
import LearningBookReader from '../components/learning/v2/LearningBookReader.vue';
import LearningPracticeStudio from '../components/learning/v2/LearningPracticeStudio.vue';
import LearningSessionShell from '../components/learning/v2/LearningSessionShell.vue';
import LearningContentManager from '../components/learning/v2/LearningContentManager.vue';
import ResizablePane from '../components/learning/v2/ResizablePane.vue';
import LearningSpeechButton from '../components/learning/v2/LearningSpeechButton.vue';
import ProgrammingCourseHub from '../components/learning/ProgrammingCourseHub.vue';
import EnglishPathWorkbench from '../components/learning/EnglishPathWorkbench.vue';
import CyberSecurityWorkbench from '../components/learning/CyberSecurityWorkbench.vue';
import CultureWorkbench from '../components/learning/CultureWorkbench.vue';
import MusicWorkbench from '../components/learning/MusicWorkbench.vue';
import ZhouyiWorkbench from '../components/learning/zhouyi/ZhouyiWorkbench.vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import { listStoredLearningContentPacks } from '../components/learning/v2/content-packs-storage';
import { activeMode, leadOf, setLead, type LeadMode } from '../stores/mode';
import { useAgentStore } from '../stores/agent';
import { useChat } from '../composables/chat/useChat';
import {
  registerWorkspaceSidebar,
  unregisterWorkspaceSidebar,
  updateWorkspaceSidebar,
} from '../stores/workspaceSidebar';

const SESSION_KEY = 'yz.learning.v2.session.v1';
const PROGRESS_KEY = 'yz.learning.v2.progress.v1';
const CODE_EVIDENCE_KEY = 'yz.learning.v2.code-evidence.v1';
const STUDY_RAIL_PREF_KEY = 'yz.learning.v2.study-rail.v1';
const SUBJECTS_COLLAPSED_KEY = 'yz.learning.v2.subjects-collapsed.v1';
const STUDY_RAIL_DEFAULT_WIDTH = 216;
const STUDY_RAIL_MIN_WIDTH = 188;
const STUDY_RAIL_MAX_WIDTH = 320;
const STUDY_RAIL_COLLAPSED_WIDTH = 42;
const LEARNING_AGENT_ID = 'a_builtin_learning_subject_coach';
const LEGACY_ENGLISH_AGENT_ID = 'a_builtin_learning_coach';
const subjects = ref(getLearningV2Subjects());
const contentManagerOpen = ref(false);
const registeredContentPacks = ref<LearningSubjectContentPack[]>([]);
const learningReady = ref(false);

function refreshLearningSubjects(): void {
  subjects.value = getLearningV2Subjects();
  let currentSubject = subjects.value.find((item) => item.key === selectedSubjectKey.value);
  if (!currentSubject) {
    currentSubject = subjects.value[0];
    selectedSubjectKey.value = currentSubject?.key || 'party';
  }
  const hasCurrentCourse = currentSubject?.courses.some(
    (course) => course.name === selectedCourseName.value,
  );
  if (!hasCurrentCourse) {
    selectedCourseName.value = currentSubject?.current.course
      || currentSubject?.courses[0]?.name
      || '';
  }
  openTrackNames.value = currentTrackName.value ? [currentTrackName.value] : [];
}

async function initializeStoredContentPacks(): Promise<void> {
  const packs = await listStoredLearningContentPacks();
  if (packs.length === 0) return;
  registeredContentPacks.value = packs;
  registerLearningContentPacks(packs);
  refreshLearningSubjects();
}

async function initializeLearningContent(): Promise<void> {
  try {
    const response = await api.get('/learning/content-distribution');
    const bundled = (response as { data?: { bundledSubjects?: unknown } }).data?.bundledSubjects;
    if (Array.isArray(bundled)) configureLearningContentDistribution(bundled);
  } catch {
    // 旧后端或开发环境没有清单时按全量科目运行。
  }
  await initializeStoredContentPacks();
  refreshLearningSubjects();
}

function handleContentPackImported(pack: LearningSubjectContentPack): void {
  registeredContentPacks.value = [
    ...registeredContentPacks.value.filter((item) => item.subject.key !== pack.subject.key),
    pack,
  ];
  registerLearningContentPacks([pack]);
  selectedSubjectKey.value = pack.subject.key;
  refreshLearningSubjects();
  ensureSubjectCategoryOpen(pack.subject.key);
}

function handleContentPackRemoved(subjectKey: string): void {
  registeredContentPacks.value = registeredContentPacks.value.filter(
    (item) => item.subject.key !== subjectKey,
  );
  unregisterLearningContentPack(subjectKey);
  refreshLearningSubjects();
}
const SUBJECT_CATEGORY_DEFS = [
  { key: 'humanities', label: '人文社科', subjects: ['history', 'party', 'politics', 'economics', 'military', 'schools'] },
  { key: 'language', label: '语言文学', subjects: ['english', 'japanese', 'culture'] },
  { key: 'science', label: '数理医学', subjects: ['math', 'physics', 'medicine'] },
  { key: 'arts', label: '艺术思维', subjects: ['calligraphy', 'music', 'memory', 'thinking'] },
  { key: 'technology', label: '编程算法', subjects: ['programming', 'algorithms'] },
  { key: 'career', label: '职业安全', subjects: ['soft', 'security'] },
  { key: 'folk', label: '易学民俗', subjects: ['zhouyi', 'divination'] },
] as const;
const selectedSubjectKey = ref(subjects.value[0]?.key || 'party');
const selectedCourseName = ref(subjects.value[0]?.current.course || '');
const subjectsCollapsed = ref(false);
const initialSubjectCategory = SUBJECT_CATEGORY_DEFS.find((category) =>
  (category.subjects as readonly string[]).includes(selectedSubjectKey.value),
)?.key;
const openSubjectCategoryKeys = ref<string[]>(initialSubjectCategory ? [initialSubjectCategory] : []);
const openTrackNames = ref<string[]>([]);
const activePage = ref<LearningV2PageKey>('overview');
const sessionReturnPage = ref<LearningV2PageKey>('overview');
const lessonStep = ref(0);
/* 完成本课后的就地选择状态：做练习 / 下一课 / 留在复习（声明提前供 immediate watch 复位） */
const lessonFinished = ref(false);
const studioPracticeCompleted = ref(false);
const bookLayer = ref<'notes' | 'annotation' | 'translation' | 'source'>('notes');
const quizIndex = ref(0);
const quizPicks = ref<Record<number, number | null>>({});
const quizSubmitted = ref<Record<number, boolean>>({});
const quizListOpen = ref(false);
const quizHeading = ref<HTMLElement | null>(null);
const completedCourseIds = ref<string[]>([]);
type StoredLearningCodeEvidence = {
  id: string;
  courseName: string;
  mode: 'practice' | 'apply';
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  savedAt: string;
};
const codeEvidence = ref<Record<string, StoredLearningCodeEvidence>>({});
const libraryOpen = ref(false);
const readerOpen = ref(false);
const readerBook = ref<LearningV2ReaderBook | null>(null);
const mobileSubjectsOpen = ref(false);
const mobileMoreOpen = ref(false);
const mobileCoursePickerOpen = ref(false);
const mobileSubjectButton = ref<HTMLButtonElement | null>(null);
const learningAiInput = ref<{
  fillInput: (text: string) => void;
  fillAndSend: (text: string) => Promise<void>;
} | null>(null);
const learningCoachPane = ref<{ toggle: () => void } | null>(null);
const learningCoachCollapsed = ref(false);
const libraryPage = ref<HTMLElement | null>(null);
const workspaceRoot = ref<HTMLElement | null>(null);
const mobileSubjectSheet = ref<HTMLElement | null>(null);
const mobileMoreButton = ref<HTMLButtonElement | null>(null);
const mobileMoreMenu = ref<HTMLElement | null>(null);
const lessonRoot = ref<HTMLElement | null>(null);
const specializedStudyRoot = ref<HTMLElement | null>(null);
const studioRoot = ref<HTMLElement | null>(null);
const noteVisible = ref(false);
const noteTitle = ref('');
const noteContent = ref('');
const studyRailWidth = ref(STUDY_RAIL_DEFAULT_WIDTH);
const studyRailCollapsed = ref(false);
const denseRailExpanded = ref(false);
const legacySecurityPathId = ref('');
const programmingPackageId = ref('');
const isCompactLayout = ref(
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px)')?.matches,
);
const isDenseLayout = ref(
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1360px)')?.matches,
);
const usesEmbeddedStudioPractice = computed(() =>
  ['zhouyi', 'divination', 'culture', 'medicine', 'music'].includes(selectedSubjectKey.value),
);
const usesSpecializedLessonWorkbench = computed(() =>
  ['english', 'security', 'culture', 'music', 'zhouyi'].includes(selectedSubjectKey.value),
);
let progressRequestId = 0;
let compactMediaQuery: MediaQueryList | null = null;
let compactMediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let denseMediaQuery: MediaQueryList | null = null;
let denseMediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let mobileSheetBodyOverflow = '';
let railResizeStartX = 0;
let railResizeStartWidth = STUDY_RAIL_DEFAULT_WIDTH;
let studyHistoryPushed = false;
let studyIgnoreNextPop = false;

const subject = computed(() => getLearningV2Subject(selectedSubjectKey.value) || subjects.value[0]);
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
const chat = useChat();
const agentStore = useAgentStore();
const learningConversations = computed(() =>
  chat.store.conversations.filter((conversation) =>
    conversation.mode === 'learning'
    && !conversation.archivedAt
    && !conversation.deletedAt,
  ),
);
const courses = computed(() => subject.value?.courses || []);
const customSubjects = computed(() => {
  const known = new Set<string>(SUBJECT_CATEGORY_DEFS.flatMap((category) => category.subjects));
  return subjects.value.filter((item) => !known.has(item.key));
});
const subjectCategoryGroups = computed(() => [
  ...SUBJECT_CATEGORY_DEFS.map((category) => ({
    ...category,
    items: category.subjects
      .map((key) => subjects.value.find((item) => item.key === key))
      .filter((item): item is NonNullable<typeof item> => !!item),
  })).filter((category) => category.items.length > 0),
  ...(customSubjects.value.length > 0
    ? [{ key: 'custom', label: '自定义内容', subjects: [], items: customSubjects.value }]
    : []),
]);
const programmingTocGroups = computed(() =>
  PROGRAMMING_CURRICULUM_PHASES.map((phase) => ({
    ...phase,
    courses: phase.courses.flatMap((entry) => {
      const course = PROGRAMMING_COURSE_PACKAGES.find((item) => item.id === entry.courseId);
      if (!course) return [];
      return [{
        ...entry,
        course,
        order: PROGRAMMING_COURSE_PACKAGES.findIndex((item) => item.id === course.id) + 1,
      }];
    }),
  })).filter((phase) => phase.courses.length > 0),
);
const isStudyPage = (page: LearningV2PageKey): boolean =>
  page === 'lesson' || page === 'studio' || page === 'practice' || page === 'coach';
const isStudySurface = computed(() => isStudyPage(activePage.value));
const showTextbookToc = computed(() =>
  !isCompactLayout.value && !isStudySurface.value && activePage.value === 'overview',
);
const mineOpen = ref(false);
const currentTrackName = computed(() =>
  courses.value.find((course) => course.name === selectedCourseName.value)?.trackName
  || subject.value?.tracks[0]?.name
  || '',
);
const readyCourses = computed(() =>
  courses.value.filter((course) => isLearningV2CourseReady(subject.value.key, course.name)),
);
const selectedCourseOrder = computed(() => {
  const index = courses.value.findIndex((course) => course.name === selectedCourseName.value);
  return index >= 0 ? index + 1 : 0;
});
const upNextCourses = computed(() => {
  const currentIndex = readyCourses.value.findIndex(
    (course) => course.name === selectedCourseName.value,
  );
  if (currentIndex < 0) {
    return readyCourses.value.slice(0, 4).map((course, index) => ({
      ...course,
      relation: index === 0 ? 'next' as const : 'later' as const,
    }));
  }

  const previous = currentIndex > 0 ? readyCourses.value[currentIndex - 1] : null;
  const forward = readyCourses.value
    .slice(currentIndex + 1, currentIndex + 5)
    .map((course, index) => ({
      ...course,
      relation: index === 0 ? 'next' as const : 'later' as const,
    }));

  return [
    ...(previous ? [{ ...previous, relation: 'previous' as const }] : []),
    ...forward,
  ].slice(0, 4);
});
function courseOrder(name: string): number {
  const index = courses.value.findIndex((course) => course.name === name);
  return index >= 0 ? index + 1 : 0;
}
function courseOrderLabel(name: string): string {
  const order = courseOrder(name);
  return order ? `第 ${String(order).padStart(2, '0')} 课` : '待排课';
}
function trackOrderLabel(trackName: string): string {
  const index = subject.value?.tracks.findIndex((track) => track.name === trackName) ?? -1;
  return index >= 0 ? String(index + 1).padStart(2, '0') : '--';
}
function isTrackOpen(trackName: string): boolean {
  return openTrackNames.value.includes(trackName);
}
function toggleTrack(trackName: string) {
  openTrackNames.value = isTrackOpen(trackName)
    ? openTrackNames.value.filter((name) => name !== trackName)
    : [...openTrackNames.value, trackName];
}
function paragraphs(value?: string): string[] {
  return (value || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}
function toggleSubjects() {
  subjectsCollapsed.value = !subjectsCollapsed.value;
  localStorage.setItem(SUBJECTS_COLLAPSED_KEY, subjectsCollapsed.value ? '1' : '0');
  updateWorkspaceSidebar('learning');
}
function subjectCategoryFor(subjectKey: string): string {
  if (customSubjects.value.some((item) => item.key === subjectKey)) return 'custom';
  return SUBJECT_CATEGORY_DEFS.find((category) =>
    (category.subjects as readonly string[]).includes(subjectKey),
  )?.key || '';
}
function isSubjectCategoryOpen(categoryKey: string): boolean {
  return openSubjectCategoryKeys.value.includes(categoryKey);
}
function ensureSubjectCategoryOpen(subjectKey: string): void {
  const categoryKey = subjectCategoryFor(subjectKey);
  if (categoryKey && !isSubjectCategoryOpen(categoryKey)) {
    openSubjectCategoryKeys.value = [...openSubjectCategoryKeys.value, categoryKey];
  }
}
function toggleSubjectCategory(categoryKey: string): void {
  openSubjectCategoryKeys.value = isSubjectCategoryOpen(categoryKey)
    ? openSubjectCategoryKeys.value.filter((key) => key !== categoryKey)
    : [...openSubjectCategoryKeys.value, categoryKey];
}
function programmingCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    foundation: '通识',
    frontend: '前端',
    backend: '后端',
    systems: '系统',
    middleware: '中间件',
    ai: 'AI',
    engineering: '工程',
  };
  return labels[category] || category;
}
const programmingNavigationEntries = computed(() =>
  programmingTocGroups.value.flatMap((phase) =>
    phase.courses.map((entry) => ({
      ...entry,
      phaseTitle: phase.title,
      accent: subjects.value.find((item) => item.key === 'programming')?.accent || '#256a50',
    })),
  ),
);
function categoryNavigationCount(category: {
  key: string;
  items: readonly { key: string }[];
}): number {
  if (category.key !== 'technology') return category.items.length;
  return programmingNavigationEntries.value.length
    + category.items.filter((item) => item.key === 'algorithms').length;
}
type MobileSubjectNavigationEntry = {
  kind: 'subject' | 'programming';
  key: string;
  name: string;
  short: string;
  accent: string;
  meta: string;
};
const mobileSubjectEntriesByCategory = computed<Record<string, MobileSubjectNavigationEntry[]>>(() => {
  const byCategory: Record<string, MobileSubjectNavigationEntry[]> = {};
  for (const category of subjectCategoryGroups.value) {
    const entries: MobileSubjectNavigationEntry[] = [];
    for (const key of category.subjects as readonly string[]) {
      const item = subjects.value.find((subjectItem) => subjectItem.key === key);
      if (!item) continue;
      if (category.key === 'technology' && key === 'programming') {
        entries.push(...programmingNavigationEntries.value.map((entry) => ({
          kind: 'programming' as const,
          key: entry.course.id,
          name: entry.course.shortTitle,
          short: entry.course.shortTitle.slice(0, 1),
          accent: item.accent,
          meta: `${programmingCategoryLabel(entry.course.category)} · ${entry.course.readyLessons} 课时`,
        })));
        continue;
      }
      entries.push({
        kind: 'subject',
        key: item.key,
        name: item.name,
        short: item.short,
        accent: item.accent,
        meta: `${item.tracks.length} 阶段 · ${item.courses.length} 门`,
      });
    }
    byCategory[category.key] = entries;
  }
  return byCategory;
});
const mobileSubjectEntries = computed<MobileSubjectNavigationEntry[]>(() =>
  subjectCategoryGroups.value.flatMap((category) =>
    mobileSubjectEntriesByCategory.value[category.key] || [],
  ),
);
function openProgrammingPackage(packageId: string): void {
  programmingPackageId.value = packageId;
  selectPage('roadmap');
}
function selectProgrammingPackage(packageId: string, openMap = true): void {
  const coursePackage = PROGRAMMING_COURSE_PACKAGES.find((item) => item.id === packageId);
  if (!coursePackage) return;
  selectedSubjectKey.value = 'programming';
  ensureSubjectCategoryOpen('programming');
  programmingPackageId.value = packageId;
  const firstReadyLesson = coursePackage.stages
    .flatMap((stage) => stage.lessons)
    .find((lesson) => lesson.status === 'ready' && !!lesson.courseName);
  if (firstReadyLesson?.courseName) {
    selectCourse(firstReadyLesson.courseName);
  }
  if (openMap) selectPage('roadmap');
}
function selectMobileSubjectEntry(entry: (typeof mobileSubjectEntries.value)[number]): void {
  if (entry.kind === 'programming') selectProgrammingPackage(entry.key);
  else selectSubject(entry.key);
  mobileSubjectsOpen.value = false;
  void nextTick(() => mobileSubjectButton.value?.focus());
}
function closeMobileSubjects(restoreFocus = false): void {
  mobileSubjectsOpen.value = false;
  if (restoreFocus) void nextTick(() => mobileSubjectButton.value?.focus());
}
const selectedCourse = computed(() =>
  courses.value.find((course) =>
    course.name === selectedCourseName.value
    && isLearningV2CourseReady(subject.value.key, course.name),
  ) || readyCourses.value[0] || courses.value[0],
);
const practice = computed(() =>
  getCoursePracticeTask(selectedSubjectKey.value, selectedCourse.value?.name || ''),
);
const coursePlan = computed(() =>
  getLearningV2CoursePlan(selectedSubjectKey.value, selectedCourse.value?.name || ''),
);
const courseCodeLab = computed(() => coursePlan.value.codeLab || null);
const lessonSteps = computed(() => coursePlan.value.steps || []);
const currentLessonStep = computed(() => lessonSteps.value[lessonStep.value] || lessonSteps.value[0]);
const subjectExpertNotes = computed(() => SUBJECT_EXPERT_NOTES[selectedSubjectKey.value] ?? []);
const lessonExpertNotes = computed(() => coursePlan.value.expertNotes ?? []);

function hasCodeEvidence(mode: 'practice' | 'apply'): boolean {
  return Object.values(codeEvidence.value).some((item) =>
    item.courseName === selectedCourseName.value && item.mode === mode && item.ok,
  );
}

function handleLearningCodeCompleted(evidence: StoredLearningCodeEvidence): void {
  codeEvidence.value = {
    ...codeEvidence.value,
    [evidence.id]: evidence,
  };
  if (evidence.mode === 'apply') studioPracticeCompleted.value = true;
}

function restoreCodeEvidence(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(CODE_EVIDENCE_KEY) || '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    codeEvidence.value = raw as Record<string, StoredLearningCodeEvidence>;
  } catch {
    codeEvidence.value = {};
  }
}

/* ===== 练习测评：当前课程题目组成一场连续 quiz session =====
   · 题目来源只取当前 coursePlan.quiz，不读取当前 lesson step，也不跨课程
   · 课程题库为空时才回退本科目综合题；此时没有第二门课程的数据被混入
   · 另附课程步骤自测清单（checkpoint），与课程题目列表分开展示 */
const quizItems = computed<LearningV2Practice[]>(() => {
  const banked = coursePlan.value.quiz ?? [];
  return banked.length ? [...banked] : [subject.value.practice];
});
const quizTotal = computed(() => quizItems.value.length);
const quizQuestionIndex = computed(() => Math.min(quizIndex.value, quizTotal.value - 1));
const currentQuiz = computed(() => quizItems.value[quizQuestionIndex.value]);
const quizScore = computed(() =>
  quizItems.value.reduce((sum, item, index) =>
    sum + (quizSubmitted.value[index] && quizPicks.value[index] === item.answer ? 1 : 0),
  0),
);
const quizAllSubmitted = computed(() =>
  quizTotal.value > 0 && quizItems.value.every((_, index) => quizSubmitted.value[index]),
);
const quizCheckpoints = computed(() =>
  (coursePlan.value.steps ?? []).map((step) => ({
    title: step.title,
    checkpoint: step.checkpoint || '',
  })),
);
function resetQuizProgress() {
  quizIndex.value = 0;
  quizPicks.value = {};
  quizSubmitted.value = {};
  quizListOpen.value = false;
}
function pickQuizOption(index: number) {
  if (quizSubmitted.value[quizQuestionIndex.value]) return;
  quizPicks.value[quizQuestionIndex.value] = index;
}
function submitCurrentQuiz() {
  if (quizPicks.value[quizQuestionIndex.value] == null) return;
  quizSubmitted.value[quizQuestionIndex.value] = true;
  if (quizQuestionIndex.value === quizTotal.value - 1) quizListOpen.value = true;
}
function quizQuestionStatus(index: number): '正确' | '错误' | '作答中' | '未作答' {
  if (!quizSubmitted.value[index]) return index === quizQuestionIndex.value ? '作答中' : '未作答';
  return quizPicks.value[index] === quizItems.value[index]?.answer ? '正确' : '错误';
}
function focusCurrentQuiz() {
  quizHeading.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  quizHeading.value?.focus({ preventScroll: true });
}
function selectQuizQuestion(index: number) {
  if (index < 0 || index >= quizTotal.value) return;
  quizIndex.value = index;
  quizListOpen.value = false;
  void nextTick(focusCurrentQuiz);
}
function nextQuizQuestion() {
  selectQuizQuestion(Math.min(quizIndex.value + 1, quizTotal.value - 1));
}
function prevQuizQuestion() {
  selectQuizQuestion(Math.max(quizIndex.value - 1, 0));
}
watch(selectedSubjectKey, () => {
  resetQuizProgress();
});
watch(selectedCourseName, () => {
  // 整场 quiz 绑定当前课程；换课必须从该课程第一题重新开始。
  lessonFinished.value = false;
  studioPracticeCompleted.value = false;
  resetQuizProgress();
}, { immediate: true });
function expertNotesMarkdown(title: string, notes: readonly LearningV2ExpertNote[]): string {
  return [
    `# ${title} · 名家注解摘录`,
    '',
    ...notes.flatMap((note) => [`## ${note.label}｜${note.source}`, `> ${note.quote}`, '']),
  ].join('\n');
}
const currentPageLabel = computed(() =>
  LEARNING_V2_PAGES.find((page) => page.key === activePage.value)?.label || '学习',
);
const effectiveStudyRailCollapsed = computed(() =>
  isDenseLayout.value
    ? !denseRailExpanded.value
    : studyRailCollapsed.value,
);
const studyRailWidthCss = computed(() =>
  effectiveStudyRailCollapsed.value
    ? `${STUDY_RAIL_COLLAPSED_WIDTH}px`
    : isDenseLayout.value
      ? '280px'
      : `${studyRailWidth.value}px`,
);
const studios = computed(() => {
  const base = practice.value;
  const courseSteps = Array.from(new Set([
    coursePlan.value.guidedPractice,
    currentLessonStep.value?.practice || '',
    coursePlan.value.independentPractice,
    coursePlan.value.commonErrors[0] || '',
    `记录并复盘：${coursePlan.value.title} 的产出、失败边界和下一步。`,
  ].filter(Boolean)));
  return {
    ...base,
    task: `围绕“${coursePlan.value.title}”完成本课可验收产出：${coursePlan.value.independentPractice}`,
    output: coursePlan.value.independentPractice,
    features: courseSteps.slice(0, 3),
    studio: {
      ...base.studio,
      title: `本课实践 · ${coursePlan.value.title}`,
      steps: courseSteps,
    },
  };
});
const libraryRecords = getLearningV2Library();
const completedCourseCount = computed(() =>
  courses.value.filter((course) => completedCourseIds.value.includes(course.id)).length,
);
const courseProgressPercent = computed(() =>
  courses.value.length ? Math.round((completedCourseCount.value / courses.value.length) * 100) : 0,
);
const currentCourseCompleted = computed(() => {
  const current = courses.value.find((course) => course.name === selectedCourseName.value);
  return !!current && completedCourseIds.value.includes(current.id);
});
const sessionStage = computed<'learn' | 'practice' | 'apply' | 'coach'>(() => {
  if (activePage.value === 'practice') return 'practice';
  if (activePage.value === 'studio') return 'apply';
  if (activePage.value === 'coach') return 'coach';
  return 'learn';
});
const quizSubmittedCount = computed(() =>
  quizItems.value.filter((_, index) => quizSubmitted.value[index]).length,
);
const sessionStepLabel = computed(() =>
  `${Math.min(lessonStep.value + 1, lessonSteps.value.length)}/${lessonSteps.value.length} 步`,
);
const sessionPracticeLabel = computed(() => `${quizSubmittedCount.value}/${quizTotal.value} 题`);
const sessionApplyLabel = computed(() =>
  studioPracticeCompleted.value ? '已完成' : `${studios.value.studio.steps.length} 步`,
);
const sessionObjective = computed(() => {
  if (sessionStage.value === 'practice') return currentQuiz.value?.focus || '用一组本课判断检查理解。';
  if (sessionStage.value === 'apply') return studios.value.studio.title;
  if (sessionStage.value === 'coach') return subject.value.coach.opening;
  return currentLessonStep.value?.objective || coursePlan.value.plainLanguageGoal;
});
const sessionEvidence = computed(() => {
  if (sessionStage.value === 'practice') {
    if (!quizAllSubmitted.value) return `完成本课 ${quizTotal.value} 道判断，并查看每题反馈。`;
    if (courseCodeLab.value && !hasCodeEvidence('practice')) {
      return `判断题已完成 ${quizScore.value}/${quizTotal.value}；还需要运行一次代码跟做。`;
    }
    return courseCodeLab.value
      ? `判断题已完成 ${quizScore.value}/${quizTotal.value}，代码跟做已留下运行证据。`
      : `已完成 ${quizTotal.value} 题，答对 ${quizScore.value} 题；错题可回原文复习。`;
  }
  if (sessionStage.value === 'apply') {
    if (courseCodeLab.value && hasCodeEvidence('apply')) {
      return '课程代码已运行通过，退出码、输出与运行环境已记入本课证据。';
    }
    return studioPracticeCompleted.value
      ? '实践产出已提交，并回到本课继续。'
      : `完成 ${studios.value.studio.steps.length} 个实践步骤并提交产出。`;
  }
  if (sessionStage.value === 'coach') return '围绕当前知识点提问、复盘或整理笔记。';
  return currentLessonStep.value?.checkpoint || '能用自己的话解释本步机制，并指出一个常见偏差。';
});
const sessionOutput = computed(() =>
  sessionStage.value === 'practice'
    ? `本课程题库 ${quizTotal.value} 题`
    : courseCodeLab.value
      ? `${courseCodeLab.value.apply.title} · 可运行源码与运行证据`
      : studios.value.output,
);
const sessionLearnDone = computed(() => lessonFinished.value || currentCourseCompleted.value);
const sessionPracticeDone = computed(() =>
  quizAllSubmitted.value
  && (!courseCodeLab.value || hasCodeEvidence('practice')),
);
const sessionApplyDone = computed(() =>
  studioPracticeCompleted.value
  || (!!courseCodeLab.value && hasCodeEvidence('apply')),
);
const todayPlanItems = computed(() => [
  {
    key: 'lesson',
    label: currentCourseCompleted.value ? `已完成：${selectedCourseName.value}` : `完成一节：${selectedCourseName.value}`,
    page: 'lesson' as LearningV2PageKey,
    done: currentCourseCompleted.value,
  },
  {
    key: 'review',
    label: `复习 ${subject.value.review.due} 个薄弱点`,
    page: 'review' as LearningV2PageKey,
    done: false,
  },
  {
    key: 'studio',
    label: `完成实践：${practice.value.output}`,
    page: 'studio' as LearningV2PageKey,
    done: false,
  },
]);
const overviewStats = computed(() => [
  [String(readyCourses.value.length), '已开放课程'],
  [String(completedCourseCount.value), '已完成'],
  [`${courseProgressPercent.value}%`, '本地进度'],
] as const);
const aiQuickPrompts = computed(() => [
  {
    key: 'explain',
    label: '讲解当前课',
    detail: '从已学内容切入，讲清机制和例子',
    prompt: `我在学习《${subject.value.name}》的《${selectedCourseName.value}》。请结合当前课程，先用一句话讲清核心结论，再分三步讲解机制，并给一个能马上做的例子。`,
  },
  {
    key: 'practice',
    label: '出练习题',
    detail: '由浅入深，附带答案与错因',
    prompt: `请围绕《${selectedCourseName.value}》给我出 5 道由浅入深的小练习。先不要给答案，等我作答后再逐题讲解错因。`,
  },
  {
    key: 'review',
    label: '整理薄弱点',
    detail: '汇总待复习概念与易错点',
    prompt: `请根据《${subject.value.name}》当前进度和待复习内容，整理我最近的薄弱点，按优先级排好，并给出今天 15 分钟内能完成的复习安排。`,
  },
  {
    key: 'plan',
    label: '规划今日学习',
    detail: '按剩余时间安排学习与复习',
    prompt: `请基于当前科目《${subject.value.name}》和课程《${selectedCourseName.value}》，给我安排今天的学习计划，明确先学什么、练什么、如何检查是否掌握。`,
  },
]);
const narrationText = computed(() => {
  if (activePage.value === 'overview') {
    return `${subject.value.name}。${subject.value.line}。当前课程：${selectedCourseName.value}。`;
  }
  if (activePage.value === 'roadmap') {
    return `${subject.value.name}课程地图。零基础到进阶。当前课程：${selectedCourseName.value}。`;
  }
  if (activePage.value === 'books') {
    const book = subject.value.book;
    return `${book?.title || subject.value.name}。${book?.unit || ''}。原文：${book?.original || ''}。来源：${book?.source || ''}。`;
  }
  if (activePage.value === 'lesson') {
    return `${coursePlan.value.title}。${currentLessonStep.value?.title || ''}。${currentLessonStep.value?.body || ''}。本步练习：${currentLessonStep.value?.practice || ''}。完成检查：${currentLessonStep.value?.checkpoint || ''}。${currentLessonStep.value?.note || ''}。`;
  }
  if (activePage.value === 'studio') {
    return `${studios.value.studio.title}。${studios.value.task}。操作边界：${studios.value.boundary}。`;
  }
  if (activePage.value === 'practice') {
    const quiz = currentQuiz.value;
    return `练习测评 · ${selectedCourseName.value}。${quiz?.prompt || ''}。选项：${(quiz?.options ?? []).join('；')}。`;
  }
  if (activePage.value === 'review') {
    return `复习巩固。${(subject.value.review?.items ?? []).join('；')}。`;
  }
  if (activePage.value === 'coach') {
    const coach = subject.value.coach;
    return `${coach?.opening || ''}。${(coach?.prompts ?? []).join('；')}。`;
  }
  return '学习';
});
function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      subject: selectedSubjectKey.value,
      course: selectedCourseName.value,
      page: activePage.value,
      step: lessonStep.value,
    }));
  } catch { /* local progress is optional */ }
}

function saveStudyRailPreferences() {
  try {
    localStorage.setItem(STUDY_RAIL_PREF_KEY, JSON.stringify({
      width: studyRailWidth.value,
      collapsed: studyRailCollapsed.value,
    }));
  } catch { /* layout preferences are optional */ }
}

function restoreStudyRailPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDY_RAIL_PREF_KEY) || '{}') as {
      width?: number;
      collapsed?: boolean;
    };
    const width = Number(saved.width);
    if (Number.isFinite(width)) {
      studyRailWidth.value = Math.max(STUDY_RAIL_MIN_WIDTH, Math.min(STUDY_RAIL_MAX_WIDTH, width));
    }
    studyRailCollapsed.value = !!saved.collapsed;
  } catch { /* use the compact default */ }
}

function toggleStudyRail() {
  if (isDenseLayout.value) {
    denseRailExpanded.value = !denseRailExpanded.value;
    return;
  }
  studyRailCollapsed.value = !studyRailCollapsed.value;
  saveStudyRailPreferences();
}

function setStudyRailWidth(width: number) {
  studyRailWidth.value = Math.max(STUDY_RAIL_MIN_WIDTH, Math.min(STUDY_RAIL_MAX_WIDTH, width));
}

function onStudyRailResize(event: PointerEvent) {
  setStudyRailWidth(railResizeStartWidth + railResizeStartX - event.clientX);
}

function stopStudyRailResize() {
  window.removeEventListener('pointermove', onStudyRailResize);
  window.removeEventListener('pointerup', stopStudyRailResize);
  window.removeEventListener('pointercancel', stopStudyRailResize);
  saveStudyRailPreferences();
}

function startStudyRailResize(event: PointerEvent) {
  if (effectiveStudyRailCollapsed.value || isDenseLayout.value || event.button !== 0) return;
  event.preventDefault();
  railResizeStartX = event.clientX;
  railResizeStartWidth = studyRailWidth.value;
  window.addEventListener('pointermove', onStudyRailResize);
  window.addEventListener('pointerup', stopStudyRailResize, { once: true });
  window.addEventListener('pointercancel', stopStudyRailResize, { once: true });
}

function resizeStudyRailWithKeyboard(event: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.preventDefault();
  if (event.key === 'ArrowLeft') setStudyRailWidth(studyRailWidth.value + 16);
  if (event.key === 'ArrowRight') setStudyRailWidth(studyRailWidth.value - 16);
  if (event.key === 'Home') setStudyRailWidth(STUDY_RAIL_MIN_WIDTH);
  if (event.key === 'End') setStudyRailWidth(STUDY_RAIL_MAX_WIDTH);
  saveStudyRailPreferences();
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') as {
      subject?: string;
      course?: string;
      page?: LearningV2PageKey;
      step?: number;
    };
    const restoredSubject = saved.subject ? getLearningV2Subject(saved.subject) : undefined;
    if (restoredSubject) {
      selectedSubjectKey.value = restoredSubject.key;
      const savedCourse = restoredSubject.courses.find((course) =>
        course.name === saved.course
        && isLearningV2CourseReady(restoredSubject.key, course.name),
      );
      selectedCourseName.value = savedCourse?.name || restoredSubject.current.course;
      const maxStep = Math.max(0, restoredSubject.lesson.steps.length - 1);
      lessonStep.value = Math.max(0, Math.min(Number(saved.step) || 0, maxStep));
    }
    if (saved.page === 'lesson' && !isLearningV2CourseReady(selectedSubjectKey.value, selectedCourseName.value)) {
      activePage.value = 'overview';
    } else if (saved.page && LEARNING_V2_PAGES.some((page) => page.key === saved.page)) {
      activePage.value = saved.page;
    }
  } catch { /* ignore invalid persisted state */ }
}

function selectSubject(key: string) {
  const next = getLearningV2Subject(key);
  if (!next) return;
  mobileCoursePickerOpen.value = false;
  selectedSubjectKey.value = key;
  ensureSubjectCategoryOpen(key);
  programmingPackageId.value = '';
  selectedCourseName.value = next.current.course;
  const currentTrack = next.courses.find((course) => course.name === next.current.course)?.trackName
    || next.tracks[0]?.name
    || '';
  openTrackNames.value = currentTrack ? [currentTrack] : [];
  sessionReturnPage.value = 'overview';
  lessonStep.value = 0;
  resetQuizProgress();
}

function courseReady(name: string): boolean {
  return isLearningV2CourseReady(selectedSubjectKey.value, name);
}

function courseProgressLabel(course: { name: string; meta: string }): string {
  if (!courseReady(course.name)) return '建设中';
  const courseRef = courses.value.find((item) => item.name === course.name);
  if (courseRef && completedCourseIds.value.includes(courseRef.id)) return '已完成';
  if (course.name === selectedCourseName.value) return '进行中';
  return course.meta && !['已完成', '进行中'].includes(course.meta) ? course.meta : '未开始';
}

function selectCourse(name: string): boolean {
  if (!courseReady(name)) return false;
  selectedCourseName.value = name;
  const trackName = courses.value.find((course) => course.name === name)?.trackName;
  if (trackName && !openTrackNames.value.includes(trackName)) {
    openTrackNames.value = [...openTrackNames.value, trackName];
  }
  lessonStep.value = 0;
  resetQuizProgress();
  return true;
}

function openCourse(name: string) {
  if (selectCourse(name)) selectPage('lesson');
}

function openProgrammingLesson(courseName: string): void {
  if (selectCourse(courseName)) selectPage('lesson');
}

function selectPage(page: LearningV2PageKey) {
  mobileMoreOpen.value = false;
  if (isStudyPage(page) && !isStudyPage(activePage.value)) {
    sessionReturnPage.value = activePage.value;
  }
  if (page === 'lesson' && !courseReady(selectedCourseName.value)) {
    activePage.value = 'overview';
    return;
  }
  activePage.value = page;
}

function handleSessionStageChange(stage: 'learn' | 'practice' | 'apply'): void {
  if (stage === 'learn') selectPage('lesson');
  if (stage === 'practice') selectPage('practice');
  if (stage === 'apply') selectPage('studio');
}

function handleSessionExit(): void {
  const destination = isStudyPage(sessionReturnPage.value)
    ? 'overview'
    : sessionReturnPage.value;
  selectPage(destination);
}

function studyHistoryState(): Record<string, unknown> {
  const state = typeof window === 'undefined' ? null : window.history.state;
  return state && typeof state === 'object' ? { ...state } : {};
}

function pushStudyHistory(): void {
  if (typeof window === 'undefined' || studyHistoryPushed) return;
  window.history.pushState(
    { ...studyHistoryState(), yzLearningStudy: true },
    '',
    window.location.href,
  );
  studyHistoryPushed = true;
}

function clearStudyHistoryMarker(): void {
  if (typeof window === 'undefined' || !studyHistoryPushed) return;
  const { yzLearningStudy: _study, ...state } = studyHistoryState();
  window.history.replaceState(state, '', window.location.href);
  studyHistoryPushed = false;
}

/** 系统侧滑/浏览器后退先退出当前课时，不离开学习总览。 */
function onStudyPopState(): void {
  if (studyIgnoreNextPop) {
    studyIgnoreNextPop = false;
    return;
  }
  if (!studyHistoryPushed || !isStudySurface.value) return;
  studyHistoryPushed = false;
  handleSessionExit();
}

/** Android 原生返回与预测返回共用入口；先关最上层页内界面。 */
function onMobileBack(event: Event): void {
  if (contentManagerOpen.value) {
    event.preventDefault();
    contentManagerOpen.value = false;
    return;
  }
  if (libraryOpen.value) {
    event.preventDefault();
    closeLibrary();
    return;
  }
  if (mobileSubjectsOpen.value) {
    event.preventDefault();
    closeMobileSubjects(true);
    return;
  }
  if (mobileMoreOpen.value) {
    event.preventDefault();
    closeMobileMore(true);
    return;
  }
  if (isStudySurface.value) {
    event.preventDefault();
    handleSessionExit();
  }
}

function handleSessionCoach(): void {
  selectPage('coach');
}

function completeStudioPractice(): void {
  studioPracticeCompleted.value = true;
  selectPage('lesson');
}

function goPrimary(page: 'overview' | 'review'): void {
  mineOpen.value = false;
  selectPage(page);
}

function switchLearningLead(next: LeadMode): void {
  setLead(activeMode.value, next);
  ensureLearningAgent();
}

function ensureLearningAgent(): void {
  if (lead.value !== 'ai' || agentStore.selectedId !== LEGACY_ENGLISH_AGENT_ID) return;
  if (!agentStore.agents.some((agent) => agent.id === LEARNING_AGENT_ID)) return;
  chat.onAgentSwitch(LEARNING_AGENT_ID, true);
}

function openLearningPage(page: LearningV2PageKey): void {
  switchLearningLead('human');
  selectPage(page);
}

function onAiSubjectChange(key: string): void {
  selectSubject(key);
}

function onAiCourseChange(name: string): void {
  selectCourse(name);
}

function fillLearningPrompt(prompt: string): void {
  learningAiInput.value?.fillInput(prompt);
}

async function sendLearningPrompt(prompt: string): Promise<void> {
  await learningAiInput.value?.fillAndSend(prompt);
}

async function newLearningConversation(): Promise<void> {
  await chat.startNewChat();
}

async function selectLearningConversation(conversationId: string): Promise<void> {
  if (!learningConversations.value.some((conversation) => conversation.id === conversationId)) return;
  await chat.selectConv(conversationId);
}

let learningConversationRestoreToken = 0;
async function restoreLearningConversation(): Promise<void> {
  if (lead.value !== 'ai') return;
  const token = ++learningConversationRestoreToken;
  const currentIsLearning = learningConversations.value.some(
    (conversation) => conversation.id === chat.store.currentConvId,
  );
  if (currentIsLearning) return;

  const latest = [...learningConversations.value].sort((left, right) => {
    if (!!left.pinned !== !!right.pinned) return left.pinned ? -1 : 1;
    return (right.lastActivityAt || right.updatedAt || 0)
      - (left.lastActivityAt || left.updatedAt || 0);
  })[0];
  if (!latest) {
    if (chat.store.currentConvId) await chat.startNewChat();
    return;
  }
  await chat.selectConv(latest.id);
  if (token !== learningConversationRestoreToken) return;
}

function progressSubjectName(subjectKey: string, displayName: string): string {
  // 易学只升级用户可见名称；服务端历史进度仍以“周易”存储，避免已有学习记录失联。
  return subjectKey === 'zhouyi' ? '周易' : displayName;
}

async function loadProgress() {
  const requestId = ++progressRequestId;
  const targetSubject = subject.value;
  const local = readLocalProgress(targetSubject.key);
  completedCourseIds.value = local;
  try {
    const response = await api.get<{ lessonIds: string[] }>(
      `/learning/lesson-progress?subject=${encodeURIComponent(progressSubjectName(targetSubject.key, targetSubject.name))}`,
    );
    if (!response || typeof response !== 'object' || !('data' in response)) return;
    const merged = [...new Set([
      ...local,
      ...((response as { data: { lessonIds: string[] } }).data.lessonIds || []),
    ])];
    writeLocalProgress(targetSubject.key, merged);
    if (requestId === progressRequestId && selectedSubjectKey.value === targetSubject.key) {
      completedCourseIds.value = merged;
    }
  } catch {
    if (requestId === progressRequestId && selectedSubjectKey.value === targetSubject.key) {
      completedCourseIds.value = local;
    }
  }
}

function readLocalProgress(subjectKey: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, string[]>;
    return Array.isArray(raw[subjectKey]) ? raw[subjectKey] : [];
  } catch {
    return [];
  }
}

function writeLocalProgress(subjectKey: string, lessonIds: string[]) {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, string[]>;
    raw[subjectKey] = lessonIds;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(raw));
  } catch { /* progress persistence is best-effort offline */ }
}

async function finishLesson() {
  const completedCourse = selectedCourse.value;
  const completedSubject = subject.value;
  if (completedCourse && !completedCourseIds.value.includes(completedCourse.id)) {
    completedCourseIds.value = [...completedCourseIds.value, completedCourse.id];
    writeLocalProgress(completedSubject.key, completedCourseIds.value);
    void api.post('/learning/lesson-progress', {
      subject: progressSubjectName(completedSubject.key, completedSubject.name),
      lessonIds: [completedCourse.id],
    }).catch(() => { /* local completion remains usable while backend is offline */ });
  }
  lessonFinished.value = true;
}

const nextCourseName = computed(() => {
  const trackName = selectedCourse.value?.trackName;
  if (!trackName) return '';
  const list = courses.value.filter((course) => course.trackName === trackName);
  const index = list.findIndex((course) => course.name === selectedCourse.value?.name);
  for (let i = index + 1; i < list.length; i += 1) {
    if (isLearningV2CourseReady(subject.value.key, list[i].name)) return list[i].name;
  }
  return '';
});

function goNextLessonCourse(): void {
  if (!nextCourseName.value) return;
  selectCourse(nextCourseName.value);
  selectPage('lesson');
}

function goLessonPractice() {
  resetQuizProgress();
  selectPage('practice');
}

function openNote(title: string, content: string) {
  noteTitle.value = title;
  noteContent.value = content;
  noteVisible.value = true;
}

function openLibraryBook(entry: LearningV2LibraryEntry) {
  if (!entry?.readable) return;
  switchLearningLead('human');
  selectSubject(entry.subjectKey);
  selectedCourseName.value = getLearningV2Subject(entry.subjectKey)?.current.course || '';
  activePage.value = 'books';
  bookLayer.value = 'notes';
  libraryOpen.value = false;
}

function openReadingBook(book: LearningV2ReaderBook) {
  readerBook.value = book;
  readerOpen.value = true;
}

function closeReadingBook() {
  readerOpen.value = false;
  readerBook.value = null;
}

function selectMobileCourse(name: string) {
  if (selectCourse(name)) selectPage('lesson');
}

function onMobileCourseChange(name: string) {
  if (name) selectCourse(name);
}

function toggleMobileCoursePicker(): void {
  mobileCoursePickerOpen.value = !mobileCoursePickerOpen.value;
  if (mobileCoursePickerOpen.value && currentTrackName.value && !isTrackOpen(currentTrackName.value)) {
    openTrackNames.value = [...openTrackNames.value, currentTrackName.value];
  }
}

function chooseMobileCourse(name: string): void {
  if (!courseReady(name)) return;
  onMobileCourseChange(name);
  mobileCoursePickerOpen.value = false;
}

function sourceSegments(source: string): Array<{ text: string; href?: string }> {
  const urlPattern = /https?:\/\/[^\s；。]+/g;
  const segments: Array<{ text: string; href?: string }> = [];
  let cursor = 0;
  for (const match of source.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: source.slice(cursor, index) });
    segments.push({ text: match[0], href: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor) });
  return segments.length ? segments : [{ text: source }];
}

function closeLibrary() {
  libraryOpen.value = false;
}

type MobileLearningAction = 'studio' | 'practice' | 'coach' | 'content' | 'library';

function closeMobileMore(restoreFocus = false): void {
  mobileMoreOpen.value = false;
  if (restoreFocus) mobileMoreButton.value?.focus();
}

function toggleMobileMore(): void {
  mobileMoreOpen.value = !mobileMoreOpen.value;
}

function openMobileSubjects(): void {
  closeMobileMore();
  mobileCoursePickerOpen.value = false;
  ensureSubjectCategoryOpen(selectedSubjectKey.value);
  mobileSubjectsOpen.value = true;
}

function runMobileLearningAction(action: MobileLearningAction): void {
  mobileMoreOpen.value = false;
  if (action === 'studio') selectPage('studio');
  if (action === 'practice') selectPage('practice');
  if (action === 'coach') selectPage('coach');
  if (action === 'content') contentManagerOpen.value = true;
  if (action === 'library') libraryOpen.value = true;
}

function onMobileMoreOutside(event: PointerEvent): void {
  if (!mobileMoreOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (mobileMoreButton.value?.contains(target) || mobileMoreMenu.value?.contains(target)) return;
  closeMobileMore();
}

function stopMobileMoreOutsideListener(): void {
  document.removeEventListener('pointerdown', onMobileMoreOutside, true);
}

function onKeydown(event: KeyboardEvent) {
  if (mobileMoreOpen.value && event.key === 'Escape') {
    event.preventDefault();
    closeMobileMore(true);
    return;
  }
  if (mobileSubjectsOpen.value && event.key === 'Escape') {
    event.preventDefault();
    closeMobileSubjects(true);
    return;
  }
  if (libraryOpen.value && event.key === 'Escape') {
    closeLibrary();
    return;
  }
  if (isStudySurface.value && event.key === 'Escape') {
    handleSessionExit();
    return;
  }
  if (libraryOpen.value && event.key === 'Tab') {
    const focusable = [...(libraryPage.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
    ) || [])].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (mobileSubjectsOpen.value && event.key === 'Tab') {
    const focusable = [...(mobileSubjectSheet.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href]',
    ) || [])].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  // 页内学习面板不劫持 Tab：顶栏、目录、笔记抽屉都在同一视图树里，应可正常切换焦点。
  if (activePage.value !== 'lesson') return;
  if (event.key === 'ArrowLeft') lessonStep.value = Math.max(0, lessonStep.value - 1);
  if (event.key === 'ArrowRight') lessonStep.value = Math.min(lessonSteps.value.length - 1, lessonStep.value + 1);
}

// 学习态让整个应用让位给学习面板：隐藏 Web 顶栏与底部状态栏，学习区占满整个视口。
// 同时压入同路由历史哨兵，让系统侧滑/浏览器后退只退出当前课时。
watch(isStudySurface, (active, previous) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('yz-learning-study', active);
  if (active && !previous) {
    pushStudyHistory();
    return;
  }
  if (!active && previous && studyHistoryPushed) {
    studyHistoryPushed = false;
    studyIgnoreNextPop = true;
    window.history.back();
  }
}, { immediate: true });
watch([selectedSubjectKey, selectedCourseName, activePage, lessonStep], saveSession);
watch(selectedSubjectKey, () => void loadProgress());
watch(lead, (next, previous) => {
  if (next === 'ai' && previous !== 'ai') {
    ensureLearningAgent();
  }
  updateWorkspaceSidebar('learning');
});
watch([learningCoachCollapsed, subjectsCollapsed], () => updateWorkspaceSidebar('learning'));
watch(
  [lead, () => chat.store.conversations.length, () => chat.store.currentConvId],
  () => { void restoreLearningConversation(); },
  { immediate: true },
);
watch(() => agentStore.agents.length, ensureLearningAgent);
watch(() => agentStore.selectedId, ensureLearningAgent);
watch(() => chat.store.currentConvId, ensureLearningAgent);
watch(libraryOpen, async (open) => {
  if (open) {
    await nextTick();
    libraryPage.value?.querySelector<HTMLElement>('[data-library-search], button')?.focus();
  }
});
// 2026-11-22 评审：学习面板改为页内视图切换，不再 Teleport 到 body / 锁 body / 给应用层加 inert。
// 总览层与学习层是同一视图树里的二选一，不会同时渲染，因此不需要遮罩式隔离。
watch(activePage, async (page, previous) => {
  // 学习态内互跳（课程/实践/练习/陪练）不重置滚动，避免页面「跳来跳去」
  if (page !== previous && !(isStudyPage(page) && isStudyPage(previous)) && workspaceRoot.value) {
    workspaceRoot.value.scrollTop = 0;
  }
  if (isStudyPage(page)) {
    if (mineOpen.value) mineOpen.value = false;
    closeMobileMore();
  }
  await nextTick();
  if (page === 'lesson') (specializedStudyRoot.value || lessonRoot.value)?.focus();
  if (page === 'studio') studioRoot.value?.focus();
});
watch(mobileMoreOpen, async (open) => {
  stopMobileMoreOutsideListener();
  if (open) {
    document.addEventListener('pointerdown', onMobileMoreOutside, true);
    await nextTick();
    mobileMoreMenu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }
});
watch(mobileSubjectsOpen, async (open) => {
  if (open) {
    mobileMoreOpen.value = false;
    mobileSheetBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    mobileSubjectSheet.value?.querySelector<HTMLElement>('button.active, button')?.focus();
  } else {
    document.body.style.overflow = mobileSheetBodyOverflow;
  }
});
onMounted(async () => {
  registerWorkspaceSidebar({
    key: 'learning',
    label: '学习侧栏',
    getCollapsed: () => lead.value === 'ai' ? learningCoachCollapsed.value : subjectsCollapsed.value,
    toggle: () => {
      if (lead.value === 'ai') learningCoachPane.value?.toggle();
      else toggleSubjects();
    },
  });
  // Local UI state and keyboard controls must work before remote content-pack
  // discovery finishes; otherwise an immediate lesson cannot be exited.
  restoreStudyRailPreferences();
  restoreCodeEvidence();
  subjectsCollapsed.value = localStorage.getItem(SUBJECTS_COLLAPSED_KEY) === '1';
  openTrackNames.value = currentTrackName.value ? [currentTrackName.value] : [];
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onStudyPopState);
  document.addEventListener('yz:mobile-back', onMobileBack);
  compactMediaQuery = window.matchMedia?.('(max-width: 900px)') || null;
  if (compactMediaQuery) {
    compactMediaListener = (event: MediaQueryListEvent) => { isCompactLayout.value = event.matches; };
    compactMediaQuery.addEventListener?.('change', compactMediaListener);
    compactMediaQuery.addListener?.(compactMediaListener);
  }
  denseMediaQuery = window.matchMedia?.('(max-width: 1360px)') || null;
  if (denseMediaQuery) {
    denseMediaListener = (event: MediaQueryListEvent) => {
      isDenseLayout.value = event.matches;
      if (!event.matches) denseRailExpanded.value = false;
    };
    denseMediaQuery.addEventListener?.('change', denseMediaListener);
    denseMediaQuery.addListener?.(denseMediaListener);
  }
  try {
    await initializeLearningContent();
  } finally {
    // Imported packs can change available subjects, so session restoration
    // still waits until discovery has completed.
    restoreSession();
    ensureSubjectCategoryOpen(selectedSubjectKey.value);
    openTrackNames.value = currentTrackName.value ? [currentTrackName.value] : [];
    if (lead.value === 'ai') {
      ensureLearningAgent();
    }
    void loadProgress();
    learningReady.value = true;
  }
});
onBeforeUnmount(() => {
  unregisterWorkspaceSidebar('learning');
  document.documentElement.classList.remove('yz-learning-study');
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('popstate', onStudyPopState);
  document.removeEventListener('yz:mobile-back', onMobileBack);
  clearStudyHistoryMarker();
  if (compactMediaQuery && compactMediaListener) {
    compactMediaQuery.removeEventListener?.('change', compactMediaListener);
    compactMediaQuery.removeListener?.(compactMediaListener);
  }
  if (denseMediaQuery && denseMediaListener) {
    denseMediaQuery.removeEventListener?.('change', denseMediaListener);
    denseMediaQuery.removeListener?.(denseMediaListener);
  }
  compactMediaQuery = null;
  compactMediaListener = null;
  denseMediaQuery = null;
  denseMediaListener = null;
  stopStudyRailResize();
  stopMobileMoreOutsideListener();
  if (mobileSubjectsOpen.value) document.body.style.overflow = mobileSheetBodyOverflow;
});
</script>

<template>
  <div
    v-if="subject"
    class="lv2"
    :class="{ 'study-full': isStudySurface, 'study-lesson': activePage === 'lesson', 'subjects-collapsed': subjectsCollapsed, 'dense-layout': isDenseLayout, 'is-learning-ai': lead === 'ai', 'is-library-open': libraryOpen }"
    :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
    :data-yz-annotate-id="activePage === 'lesson' ? 'learning-v2-lesson' : `learning-v2-${activePage}`"
    data-yz-annotate-label="学习"
    :data-learning-ready="learningReady ? 'true' : 'false'"
  >
    <section
      v-if="libraryOpen"
      ref="libraryPage"
      class="lv2-library-page lv2-library-shell"
      :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
      aria-label="图书馆"
    >
      <LearningLibrary
        :records="libraryRecords"
        :accent="subject.accent"
        :tint="subject.tint"
        @close="closeLibrary"
        @open-book="openLibraryBook"
        @read-book="openReadingBook"
      />
    </section>

    <section v-else-if="lead === 'ai'" class="lv2-ai-shell" aria-label="学习 AI 工作区">
      <ResizablePane
        ref="learningCoachPane"
        class="lv2-ai-context-pane"
        label="学习教练"
        storage-key="yz.learning.v2.ai-context.v1"
        :default-width="248"
        :min-width="220"
        :max-width="360"
        :collapsed-width="42"
        hide-fold
        @collapsed-change="learningCoachCollapsed = $event"
      >
      <div class="lv2-ai-context">
        <header class="lv2-ai-brand">
          <span><Sparkles :size="17" /></span>
          <div class="lv2-ai-brand-copy"><b>学习教练</b><small>只围绕你的课程与进度</small></div>
        </header>

        <section class="lv2-ai-context-block">
          <label>
            <span>当前科目</span>
            <el-select
              :model-value="selectedSubjectKey"
              class="lv2-ai-select"
              popper-class="lv2-ai-select-popper"
              aria-label="切换 AI 学习科目"
              @change="onAiSubjectChange"
            >
              <el-option v-for="item in subjects" :key="item.key" :value="item.key" :label="item.name" />
            </el-select>
          </label>
          <label>
            <span>当前课程</span>
            <el-select
              :model-value="selectedCourseName"
              class="lv2-ai-select"
              popper-class="lv2-ai-select-popper lv2-ai-course-popper"
              aria-label="切换 AI 学习课程"
              filterable
              @change="onAiCourseChange"
            >
              <el-option-group v-for="track in subject.tracks" :key="track.name" :label="track.name">
                <el-option
                  v-for="course in track.courses"
                  :key="course.name"
                  :value="course.name"
                  :label="course.name"
                  :disabled="!courseReady(course.name)"
                />
              </el-option-group>
            </el-select>
          </label>
        </section>

        <section class="lv2-ai-progress">
          <header><span>课程进度</span><b>{{ courseProgressPercent }}%</b></header>
          <i><span :style="{ width: `${courseProgressPercent}%` }"></span></i>
          <p>{{ completedCourseCount }} / {{ courses.length }} 门已学 · {{ subject.review.due }} 项待复习</p>
        </section>

        <nav class="lv2-ai-actions" aria-label="学习工具">
          <button type="button" @click="openLearningPage('overview')">
            <BookOpen :size="15" /><span><b>学习台</b><small>课程、路线与进度</small></span><ChevronRight :size="14" />
          </button>
          <button type="button" @click="libraryOpen = true">
            <Library :size="15" /><span><b>图书馆</b><small>小说、名著、漫画与书架</small></span><ChevronRight :size="14" />
          </button>
          <button type="button" @click="openLearningPage('review')">
            <Brain :size="15" /><span><b>复习</b><small>{{ subject.review.due }} 个薄弱点到期</small></span><ChevronRight :size="14" />
          </button>
          <button type="button" @click="openLearningPage('studio')">
            <Wrench :size="15" /><span><b>实践</b><small>{{ studios.studio.type }}</small></span><ChevronRight :size="14" />
          </button>
        </nav>

        <section class="lv2-ai-next">
          <header><span>下一步</span><button type="button" @click="openLearningPage('lesson')">沉浸学习</button></header>
          <button class="lv2-ai-continue" type="button" @click="openLearningPage('lesson')">
            <span>{{ selectedCourse?.trackName }}</span>
            <b>{{ selectedCourseName }}</b>
            <small>{{ courseProgressPercent }}% · 继续当前学习步骤</small>
            <Play :size="16" />
          </button>
        </section>
      </div>
      </ResizablePane>

      <main class="lv2-ai-main">
        <header class="lv2-ai-chat-head">
          <div>
            <span>学习 · AI 陪学</span>
            <b>{{ subject.name }} / {{ selectedCourseName }}</b>
          </div>
          <div class="lv2-ai-head-actions">
            <button type="button" class="lv2-ai-mobile-subject" @click="mobileSubjectsOpen = true">
              {{ subject.name }}<ChevronDown :size="14" />
            </button>
            <button type="button" class="lv2-ai-head-button" @click="libraryOpen = true">
              <Library :size="15" /><span>图书馆</span>
            </button>
          </div>
        </header>

        <div class="lv2-ai-mobile-context">
          <label>
            <span>课程</span>
            <el-select
              :model-value="selectedCourseName"
              class="lv2-ai-select"
              popper-class="lv2-ai-select-popper lv2-ai-course-popper"
              aria-label="切换 AI 学习课程"
              filterable
              @change="onAiCourseChange"
            >
              <el-option v-for="course in readyCourses" :key="course.id" :value="course.name" :label="course.name" />
            </el-select>
          </label>
          <span><b>{{ courseProgressPercent }}%</b> 掌握进度</span>
          <button type="button" @click="openLearningPage('lesson')"><Play :size="14" />继续学习</button>
        </div>

        <div class="lv2-ai-messages">
          <ChatMessageList>
            <template #welcome>
              <section class="lv2-ai-welcome">
                <span class="lv2-ai-welcome-mark"><Sparkles :size="22" /></span>
                <h1>今天想把哪一块学明白？</h1>
                <p>我会结合《{{ subject.name }}》和《{{ selectedCourseName }}》当前进度来讲解、出题与复盘。</p>
                <div class="lv2-ai-welcome-prompts">
                  <button
                    v-for="item in aiQuickPrompts"
                    :key="item.key"
                    type="button"
                    @click="sendLearningPrompt(item.prompt)"
                  >
                    <span>{{ item.label }}</span>
                    <small>{{ item.detail }}</small>
                    <ChevronRight :size="14" />
                  </button>
                </div>
                <div class="lv2-ai-welcome-foot">
                  <button type="button" @click="openLearningPage('lesson')"><NotebookPen :size="14" />直接进入沉浸学习</button>
                  <button type="button" @click="openLearningPage('practice')"><ClipboardCheck :size="14" />先做一组练习</button>
                </div>
              </section>
            </template>
          </ChatMessageList>
        </div>

        <div class="lv2-ai-composer">
          <ChatInputArea ref="learningAiInput" />
        </div>
      </main>

      <ResizablePane
        v-if="!isCompactLayout"
        class="lv2-ai-conversation-pane"
        label="学习会话"
        storage-key="yz.learning.v2.ai-conversations.v1"
        side="right"
        :default-width="236"
        :min-width="188"
        :max-width="360"
        :collapsed-width="42"
      >
        <LearningConversationRail
          :conversations="learningConversations"
          :current-id="chat.store.currentConvId"
          @create="newLearningConversation"
          @select="selectLearningConversation"
        />
      </ResizablePane>
    </section>

    <template v-else>
    <aside
      v-if="!isCompactLayout && !isStudySurface"
      class="lv2-subjects"
      :class="{ collapsed: subjectsCollapsed }"
      aria-label="学习科目"
    >
      <header class="lv2-brand">
        <span>学</span>
        <div class="lv2-brand-copy"><b>学习</b><small>{{ subjects.length }} 个科目</small></div>
      </header>
      <nav class="lv2-subject-list">
        <section
          v-for="category in subjectCategoryGroups"
          :key="category.key"
          class="lv2-subject-group"
          :class="{
            active: subjectCategoryFor(selectedSubjectKey) === category.key,
            open: isSubjectCategoryOpen(category.key),
          }"
        >
          <button
            class="lv2-subject-group-head"
            type="button"
            :aria-expanded="isSubjectCategoryOpen(category.key)"
            @click="toggleSubjectCategory(category.key)"
          >
            <b>{{ category.label }}</b>
            <small>{{ categoryNavigationCount(category) }}</small>
            <ChevronDown :size="13" :class="{ reversed: !isSubjectCategoryOpen(category.key) }" />
          </button>
          <div v-show="isSubjectCategoryOpen(category.key)" class="lv2-subject-group-items">
            <template v-if="category.key === 'technology'">
              <button
                v-for="entry in programmingNavigationEntries"
                :key="entry.course.id"
                type="button"
                class="lv2-subject lv2-programming-subject"
                :class="{
                  active: selectedSubjectKey === 'programming'
                    && programmingPackageId === entry.course.id,
                }"
                :data-programming-subject-package="entry.course.id"
                :title="entry.course.title"
                :aria-label="`${entry.course.shortTitle}，${entry.course.readyLessons} 课时`"
                @click="selectProgrammingPackage(entry.course.id)"
              >
                <i :style="{ '--dot': entry.accent }">{{ entry.course.shortTitle.slice(0, 1) }}</i>
                <span>
                  <b>{{ entry.course.shortTitle }}</b>
                  <small>{{ programmingCategoryLabel(entry.course.category) }} · {{ entry.course.readyLessons }} 课时</small>
                </span>
              </button>
              <button
                v-for="item in category.items.filter((entry) => entry.key !== 'programming')"
                :key="item.key"
                type="button"
                class="lv2-subject"
                :class="{ active: item.key === selectedSubjectKey }"
                :data-subject="item.key"
                :title="item.name"
                :aria-label="`${item.name}，${item.tracks.length} 阶段，${item.courses.length} 门课程`"
                @click="selectSubject(item.key)"
              >
                <i :style="{ '--dot': item.accent }">{{ item.short.slice(0, 1) }}</i>
                <span><b>{{ item.name }}</b><small>{{ item.tracks.length }} 阶段 · {{ item.courses.length }} 门</small></span>
              </button>
            </template>
            <template v-else>
              <button
                v-for="item in category.items"
                :key="item.key"
                type="button"
                class="lv2-subject"
                :class="{ active: item.key === selectedSubjectKey }"
                :data-subject="item.key"
                :title="item.name"
                :aria-label="`${item.name}，${item.tracks.length} 阶段，${item.courses.length} 门课程`"
                @click="selectSubject(item.key)"
              >
                <i :style="{ '--dot': item.accent }">{{ item.short.slice(0, 1) }}</i>
                <span><b>{{ item.name }}</b><small>{{ item.tracks.length }} 阶段 · {{ item.courses.length }} 门</small></span>
              </button>
            </template>
          </div>
        </section>
      </nav>
    </aside>

    <main class="lv2-main">
      <header v-if="!isCompactLayout && !isStudySurface" class="lv2-topbar">
        <div class="lv2-subject-trigger">
          <b>{{ subject.name }}</b>
          <span>{{ subject.line }}</span>
        </div>
        <div class="lv2-topbar-actions">
          <LearningSpeechButton :text="narrationText" :compact="true" />
          <button class="lv2-tool-chip" type="button" @click="selectPage('studio')">实践</button>
          <button class="lv2-tool-chip" type="button" @click="selectPage('practice')">练习</button>
          <button class="lv2-tool-chip" type="button" @click="selectPage('coach')">陪练</button>
          <button class="lv2-library-button" type="button" title="管理科目数据" aria-label="管理科目数据" @click="contentManagerOpen = true">
            <PackageOpen :size="17" /><span>科目数据</span>
          </button>
          <button class="lv2-library-button" type="button" title="打开公共图书馆" aria-label="打开公共图书馆" @click="libraryOpen = true">
            <Library :size="17" /><span>图书馆</span>
          </button>
        </div>
      </header>

      <header v-else-if="!isStudySurface" class="lv2-mobile-topbar">
        <button
          ref="mobileSubjectButton"
          type="button"
          class="lv2-mobile-subject"
          aria-label="切换学习科目"
          :aria-expanded="mobileSubjectsOpen"
          @click="openMobileSubjects"
        >
          <span>{{ subject.name }}</span><ChevronDown :size="16" />
        </button>
        <div class="lv2-topbar-actions">
          <LearningSpeechButton :text="narrationText" :compact="true" />
          <button
            ref="mobileMoreButton"
            class="lv2-mobile-more"
            type="button"
            aria-label="更多学习工具"
            aria-haspopup="menu"
            aria-controls="lv2-mobile-more-menu"
            :aria-expanded="mobileMoreOpen"
            data-mobile-more-trigger
            @click="toggleMobileMore"
          >
            <Ellipsis :size="20" />
          </button>
          <section
            v-if="mobileMoreOpen"
            id="lv2-mobile-more-menu"
            ref="mobileMoreMenu"
            class="lv2-mobile-more-menu"
            role="menu"
            aria-label="更多学习工具"
            data-mobile-more-menu
          >
            <button type="button" role="menuitem" data-mobile-action="studio" @click="runMobileLearningAction('studio')">
              <Wrench :size="17" /><span>实践</span>
            </button>
            <button type="button" role="menuitem" data-mobile-action="practice" @click="runMobileLearningAction('practice')">
              <ClipboardCheck :size="17" /><span>练习</span>
            </button>
            <button type="button" role="menuitem" data-mobile-action="coach" @click="runMobileLearningAction('coach')">
              <NotebookPen :size="17" /><span>陪练</span>
            </button>
            <button type="button" role="menuitem" data-mobile-action="content" @click="runMobileLearningAction('content')">
              <PackageOpen :size="17" /><span>科目数据</span>
            </button>
            <button type="button" role="menuitem" data-mobile-action="library" @click="runMobileLearningAction('library')">
              <Library :size="17" /><span>图书馆</span>
            </button>
          </section>
        </div>
      </header>

      <!-- 2026-11-22 评审：8 个一级 tab → 教材 / 今日复习 / 我的 三个入口；图书馆走顶栏独立入口。 -->
      <nav v-if="!isStudySurface" class="lv2-pages" :class="{ mobile: isCompactLayout }" aria-label="学习页面">
        <button type="button" data-nav="textbook" :class="{ active: activePage === 'overview' && !mineOpen }" @click="goPrimary('overview')">教材</button>
        <button type="button" data-nav="review" :class="{ active: activePage === 'review' && !mineOpen }" @click="goPrimary('review')">今日复习</button>
        <button type="button" data-nav="mine" :class="{ active: mineOpen }" @click="mineOpen = !mineOpen">我的</button>
        <div v-if="!isStudySurface" v-show="false" class="lv2-legacy-nav" aria-hidden="true">
          <button
            v-for="page in LEARNING_V2_PAGES"
            :key="page.key"
            type="button"
            :data-page="page.key"
            @click="selectPage(page.key)"
          >{{ page.label }}</button>
        </div>
      </nav>

      <div
        ref="workspaceRoot"
        class="lv2-workspace"
        :class="{ 'has-textbook-toc': showTextbookToc, 'is-study-surface': isStudySurface }"
        :style="{ '--lv2-study-rail-width': studyRailWidthCss }"
      >
      <ResizablePane
        v-if="showTextbookToc"
        label="教材目录"
        storage-key="yz.learning.v2.textbook-toc.v1"
        :default-width="210"
        :min-width="34"
        :max-width="340"
      >
        <div class="lv2-textbook-toc">
          <header><b>教材目录</b><small>{{ subject.name }}</small></header>
          <template v-if="selectedSubjectKey === 'programming'">
            <section v-for="phase in programmingTocGroups" :key="phase.id">
              <b>{{ String(phase.step).padStart(2, '0') }} · {{ phase.title }}</b>
              <button
                v-for="entry in phase.courses"
                :key="entry.course.id"
                type="button"
                :class="{ active: entry.course.id === programmingPackageId }"
                :title="entry.course.title"
                :data-programming-package="entry.course.id"
                @click="openProgrammingPackage(entry.course.id)"
              >
                <i>第 {{ String(entry.order).padStart(2, '0') }} 门</i>
                <span>{{ entry.course.shortTitle }}</span>
                <small>{{ programmingCategoryLabel(entry.course.category) }} · {{ entry.course.readyLessons }} 课时</small>
              </button>
            </section>
          </template>
          <template v-else>
            <section v-for="track in subject.tracks" :key="track.name">
              <b>阶段 {{ trackOrderLabel(track.name) }} · {{ track.name }}</b>
              <button
                v-for="course in track.courses"
                :key="course.name"
                type="button"
                :class="{ active: course.name === selectedCourseName }"
                :title="course.name"
                :disabled="!courseReady(course.name)"
                @click="openCourse(course.name)"
              >
                <i>{{ courseOrderLabel(course.name) }}</i><span>{{ course.name }}</span>
              </button>
            </section>
          </template>
        </div>
      </ResizablePane>
      <section v-if="mineOpen && !isStudySurface" class="lv2-mine-panel" aria-label="我的学习">
        <header><h2>我的学习</h2><button type="button" @click="mineOpen = false">关闭</button></header>
        <div class="lv2-mine-stats">
          <div><b>{{ completedCourseCount }}</b><span>已完成课时</span></div>
          <div><b>{{ courseProgressPercent }}%</b><span>当前科目进度</span></div>
          <div><b>{{ subject.review.due }}</b><span>今日待复习</span></div>
        </div>
        <div class="lv2-mine-actions">
          <button type="button" @click="openNote(selectedCourseName, currentLessonStep?.body || '')">写笔记</button>
          <button type="button" @click="goPrimary('review')">去复习</button>
          <button type="button" @click="mineOpen = false; selectPage('practice')">做练习</button>
          <button type="button" @click="mineOpen = false; selectPage('roadmap')">完整课程地图</button>
        </div>
      </section>
      <section class="lv2-content" v-show="!mineOpen || isStudySurface">
        <div v-if="isCompactLayout && !isStudySurface && activePage !== 'overview'" class="lv2-mobile-pagebar">
          <button data-action="back-to-subject" type="button" @click="selectPage('overview')">
            <ChevronLeft :size="14" />返回学科
          </button>
          <b>{{ currentPageLabel }}</b>
        </div>
        <template v-if="activePage === 'overview'">
          <!-- 2026-11-21：编程/算法科目此前在总览与课程地图渲染同一个 Hub，两个页签内容完全重复。
               2026-11-22：Hub 只留在「课程地图」，通用总览（继续学习 + 统计 + 接下来）对所有科目生效——
               否则编程/算法的总览会整页空白（用户截图实报）。 -->
          <div v-if="isCompactLayout" class="lv2-mobile-overview">
            <div class="lv2-mobile-course-select" data-mobile-course-picker>
              <span>选择阶段与课程</span>
              <button
                type="button"
                class="lv2-mobile-course-trigger"
                aria-controls="lv2-mobile-course-menu"
                :aria-expanded="mobileCoursePickerOpen"
                @click="toggleMobileCoursePicker"
              >
                <span><small>{{ selectedCourse?.trackName }}</small><b>{{ selectedCourseName }}</b></span>
                <ChevronDown :size="16" :class="{ reversed: !mobileCoursePickerOpen }" />
              </button>
              <section
                v-if="mobileCoursePickerOpen"
                id="lv2-mobile-course-menu"
                class="lv2-mobile-course-menu"
                aria-label="阶段与课程"
              >
                <div
                  v-for="track in subject.tracks"
                  :key="track.name"
                  class="lv2-mobile-course-track"
                  :class="{ open: isTrackOpen(track.name) }"
                >
                  <button
                    type="button"
                    class="lv2-mobile-course-track-head"
                    :aria-expanded="isTrackOpen(track.name)"
                    :data-mobile-course-track="track.name"
                    @click="toggleTrack(track.name)"
                  >
                    <span>
                      <small>阶段 {{ trackOrderLabel(track.name) }}</small>
                      <b>{{ track.name }}</b>
                    </span>
                    <em>{{ track.courses.length }}</em>
                    <ChevronDown :size="15" :class="{ reversed: !isTrackOpen(track.name) }" />
                  </button>
                  <div
                    v-show="isTrackOpen(track.name)"
                    class="lv2-mobile-course-track-items"
                    :data-mobile-course-track-items="track.name"
                  >
                    <button
                      v-for="course in track.courses"
                      :key="course.name"
                      type="button"
                      :class="{ active: course.name === selectedCourseName }"
                      :disabled="!courseReady(course.name)"
                      :data-mobile-course="course.name"
                      @click="chooseMobileCourse(course.name)"
                    >
                      <span>{{ courseOrderLabel(course.name) }}</span>
                      <b>{{ course.name }}</b>
                      <small>{{ courseReady(course.name) ? courseProgressLabel(course) : '建设中' }}</small>
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <!-- 2026-11-21 用户要求：移动端首页不再放独占一行的图书馆入口卡片（顶栏已有
                 「图书馆」按钮，卡片整行占竖向空间，重复入口只浪费空间）。 -->

            <button class="lv2-mobile-continue" type="button" @click="selectPage('lesson')">
              <span>继续学习 · {{ selectedCourse?.trackName }}<em>第 {{ selectedCourseOrder }} / {{ courses.length }} 课</em></span>
              <b>{{ selectedCourseName }}</b>
              <small>{{ courseProgressPercent }}% · {{ completedCourseCount }}/{{ courses.length }} 已学</small>
              <i><Play :size="17" />开始本节</i>
            </button>

            <div class="lv2-mobile-tools" aria-label="学习工具">
              <button type="button" data-page="studio" @click="selectPage('studio')"><Wrench :size="16" />实践</button>
              <button type="button" data-page="practice" @click="selectPage('practice')"><ClipboardCheck :size="16" />练习</button>
              <button type="button" data-page="books" @click="selectPage('books')"><BookOpen :size="16" />书籍</button>
              <button type="button" data-page="review" @click="selectPage('review')"><Brain :size="16" />复习</button>
              <button type="button" data-page="coach" @click="selectPage('coach')"><NotebookPen :size="16" />陪练</button>
            </div>

            <section class="lv2-mobile-course-strip">
              <header><b>接下来</b><button type="button" @click="selectPage('roadmap')">完整地图</button></header>
              <div>
                <button
                  v-for="course in readyCourses.slice(0, 8)"
                  :key="course.id"
                  type="button"
                  :class="{ active: course.name === selectedCourseName }"
                  @click="selectMobileCourse(course.name)"
                >
                  <i class="lv2-course-order">{{ courseOrderLabel(course.name) }}</i>
                  <span>{{ course.trackName }}</span><b>{{ course.name }}</b><small>{{ courseProgressLabel(course) }}</small>
                </button>
              </div>
            </section>

            <section class="lv2-mobile-review-preview">
              <header><b>今日复习</b><span>{{ subject.review.due }} 项到期</span></header>
              <button v-for="item in subject.review.items.slice(0, 3)" :key="item" type="button" @click="selectPage('review')">
                <i></i><span>{{ item }}</span><ChevronRight :size="15" />
              </button>
            </section>

          </div>
          <template v-else>
            <button class="lv2-continue" type="button" @click="selectPage('lesson')">
              <div>
                <span>继续学习 · {{ selectedCourse?.trackName }}<em>第 {{ selectedCourseOrder }} / {{ courses.length }} 课</em></span>
                <b>{{ selectedCourseName }}</b>
                <small>{{ courseProgressPercent }}% · {{ completedCourseCount }}/{{ courses.length }} 已学</small>
              </div>
              <Play :size="18" />
            </button>
            <div class="lv2-stats">
              <div v-for="stat in overviewStats" :key="stat[1]"><b>{{ stat[0] }}</b><span>{{ stat[1] }}</span></div>
            </div>
            <div class="lv2-section-head"><h2>接下来</h2><button type="button" @click="selectPage('roadmap')">全部课程</button></div>
            <div class="lv2-upnext">
              <button
                v-for="course in upNextCourses"
                :key="course.id"
                type="button"
                :class="{
                  'is-previous': course.relation === 'previous',
                  'is-next': course.relation === 'next',
                }"
                :data-course-relation="course.relation"
                :aria-label="course.relation === 'previous'
                  ? `上一课：${course.name}`
                  : course.relation === 'next'
                    ? `下一课：${course.name}`
                    : `后续课程：${course.name}`"
                @click="openCourse(course.name)"
              >
                <div class="lv2-upnext-meta">
                  <em class="lv2-course-relation">
                    {{ course.relation === 'previous'
                      ? '上一课'
                      : course.relation === 'next'
                        ? '下一课 · 默认'
                        : '后续' }}
                  </em>
                  <i class="lv2-course-order">{{ courseOrderLabel(course.name) }}</i>
                </div>
                <span>{{ course.trackName }}</span>
                <b>{{ course.name }}</b>
                <small>{{ courseProgressLabel(course) }}</small>
              </button>
            </div>
          </template>
        </template>

        <template v-else-if="activePage === 'roadmap'">
          <ProgrammingCourseHub
            v-if="selectedSubjectKey === 'programming'"
            :courses="PROGRAMMING_COURSE_PACKAGES"
            :projects="PROGRAMMING_PROJECTS"
            :initial-course-id="programmingPackageId"
            @open-lesson="openProgrammingLesson"
            @select-course="programmingPackageId = $event"
          />
          <AlgorithmWorkbench
            v-else-if="selectedSubjectKey === 'algorithms'"
            @open-lesson="openProgrammingLesson"
          />
          <template v-if="selectedSubjectKey !== 'programming' && selectedSubjectKey !== 'algorithms'">
          <div class="lv2-roadmap">
            <section
              v-for="track in subject.tracks"
              :key="track.name"
              :class="{ collapsed: !isTrackOpen(track.name) }"
            >
              <button
                class="lv2-roadmap-track"
                type="button"
                :aria-expanded="isTrackOpen(track.name)"
                @click="toggleTrack(track.name)"
              >
                <i>阶段 {{ trackOrderLabel(track.name) }}</i>
                <span><b>{{ track.name }}</b><small>{{ track.note }} · {{ track.courses.length }} 节</small></span>
                <ChevronDown :size="16" :class="{ reversed: !isTrackOpen(track.name) }" />
              </button>
              <div v-show="isTrackOpen(track.name)" class="lv2-roadmap-list">
                <button
                  v-for="course in track.courses"
                  :key="course.name"
                  type="button"
                  :disabled="!courseReady(course.name)"
                  :class="{ active: course.name === selectedCourseName }"
                  @click="openCourse(course.name)"
                >
                  <i class="lv2-course-order">{{ courseOrderLabel(course.name) }}</i>
                  <span>{{ course.name }}</span><small>{{ courseProgressLabel(course) }}</small>
                </button>
              </div>
            </section>
          </div>
          </template>
        </template>

        <template v-else-if="activePage === 'books'">
          <div class="lv2-book-layout">
            <aside>
              <span>本科书库</span>
              <div v-for="(title, index) in subject.book.shelf" :key="title" :class="{ active: index === 0 }">
                <i>{{ String(index + 1).padStart(2, '0') }}</i><b>{{ title }}</b>
              </div>
            </aside>
            <article>
              <header><div><span>{{ subject.book.kind }}</span><h2>{{ subject.book.title }}</h2></div><small>原文收录</small></header>
              <div class="lv2-book-layers">
                <button v-for="layer in [{ k: 'notes', l: '注释' }, { k: 'annotation', l: '注解' }, { k: 'translation', l: '译文' }, { k: 'source', l: '来源' }]" :key="layer.k" type="button" :class="{ active: bookLayer === layer.k }" @click="bookLayer = layer.k as typeof bookLayer">{{ layer.l }}</button>
              </div>
              <div class="lv2-original"><span>原文</span><blockquote>{{ subject.book.original }}</blockquote></div>
              <div class="lv2-book-layer">
                <template v-if="bookLayer === 'annotation'">{{ subject.book.annotation }}</template>
                <template v-else-if="bookLayer === 'translation'">{{ subject.book.translation }}</template>
                <template v-else-if="bookLayer === 'source'"><span class="lv2-source">来源：</span>{{ subject.book.source }}</template>
                <dl v-else><div v-for="note in subject.book.notes" :key="note.term"><dt>{{ note.term }}</dt><dd>{{ note.text }}</dd></div></dl>
              </div>
              <section v-if="subjectExpertNotes.length" class="lv2-expert-notes" data-expert-notes>
                <header><span>名家注解 · 真实笔记</span><h3>注明出处的原文摘录与记法，可直接抄进你的笔记</h3></header>
                <article v-for="note in subjectExpertNotes" :key="note.quote.slice(0, 12)">
                  <b>{{ note.label }}</b>
                  <blockquote>{{ note.quote }}</blockquote>
                  <small>出处：{{ note.source }}</small>
                </article>
                <button type="button" @click="openNote(`${subject.book.title} · 名家注解摘录`, expertNotesMarkdown(subject.book.title, subjectExpertNotes))">
                  <NotebookPen :size="14" />抄进我的笔记
                </button>
              </section>
              <p class="lv2-source">来源：{{ subject.book.source }}</p>
            </article>
          </div>
        </template>

        <template v-else-if="isStudySurface">
          <LearningSessionShell
            :subject-name="subject.name"
            :course-name="selectedCourseName"
            :course-title="coursePlan.title"
            :stage="sessionStage"
            :step-label="sessionStepLabel"
            :practice-label="sessionPracticeLabel"
            :apply-label="sessionApplyLabel"
            :objective="sessionObjective"
            :evidence="sessionEvidence"
            :output="sessionOutput"
            :learn-done="sessionLearnDone"
            :practice-done="sessionPracticeDone"
            :apply-done="sessionApplyDone"
            :next-course-name="sessionLearnDone ? nextCourseName : ''"
            @exit="handleSessionExit"
            @stage-change="handleSessionStageChange"
            @coach="handleSessionCoach"
            @next-lesson="goNextLessonCourse"
          >
        <template v-if="activePage === 'lesson'">
            <div
              v-if="usesSpecializedLessonWorkbench"
              ref="specializedStudyRoot"
              class="lv2-specialized-study inline"
              tabindex="-1"
              :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
            >
            <div class="lv2-specialized-study-surface">
              <EnglishPathWorkbench
                v-if="selectedSubjectKey === 'english'"
                @practice="selectPage('practice')"
                @scenes="selectPage('practice')"
              />
              <CyberSecurityWorkbench
                v-else-if="selectedSubjectKey === 'security'"
                :path-id="legacySecurityPathId"
                @select-path="legacySecurityPathId = $event"
              />
              <CultureWorkbench v-else-if="selectedSubjectKey === 'culture'" />
              <MusicWorkbench
                v-else-if="selectedSubjectKey === 'music'"
                @open-studio="selectPage('studio')"
              />
              <ZhouyiWorkbench v-else-if="selectedSubjectKey === 'zhouyi'" />
            </div>
            </div>
            <div
              v-else
              ref="lessonRoot"
              class="lv2-lesson inline"
              tabindex="-1"
              :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
              data-yz-annotate-id="learning-v2-lesson"
              data-yz-annotate-label="沉浸学习台"
            >
            <nav><button v-for="(step, index) in lessonSteps" :key="step.title" type="button" :class="{ active: lessonStep === index, done: index < lessonStep }" @click="lessonStep = index">{{ step.title }}</button></nav>
            <div class="lv2-lesson-body">
            <ResizablePane
              label="章节目录"
              storage-key="yz.learning.v2.lesson-toc.v1"
              :default-width="190"
              :min-width="34"
              :max-width="340"
            >
              <div class="lv2-lesson-toc">
                <header class="ltoc-header">
                  <div>
                    <b>章节目录</b>
                    <small>共 {{ subject.tracks.length }} 阶段 · {{ readyCourses.length }} 节</small>
                  </div>
                </header>
                <section v-for="track in subject.tracks" :key="track.name">
                  <b>阶段 {{ trackOrderLabel(track.name) }} · {{ track.name }}</b>
                  <button
                    v-for="course in track.courses"
                    :key="course.name"
                    type="button"
                    :class="{ active: course.name === selectedCourseName }"
                    :title="course.name"
                    :disabled="!courseReady(course.name)"
                    @click="openCourse(course.name)"
                  >
                    <i>{{ courseOrderLabel(course.name) }}</i><span>{{ course.name }}</span>
                  </button>
                </section>
              </div>
            </ResizablePane>
            <article>
              <span>{{ coursePlan.trackName }} · {{ subject.lesson.labels[lessonStep] }}</span>
              <em class="lv2-quality">
                {{ coursePlan.reviewStatus === 'reviewed' ? '完整教案 · 人工审校' : '完整教案 · 系统整理' }}
              </em>
              <h1>{{ currentLessonStep?.title }}</h1>
              <p class="lv2-goal">课程目标：{{ coursePlan.plainLanguageGoal }}</p>
              <p class="lv2-prerequisite">前置知识：{{ coursePlan.prerequisite }}</p>
              <p v-if="currentLessonStep?.objective" class="lv2-step-objective"><b>本步目标</b>{{ currentLessonStep.objective }}</p>
              <div
                class="lv2-lesson-copy"
                data-yz-annotate-id="learning-v2-lesson-copy"
                data-yz-annotate-label="当前学习步骤"
              >
                <p v-for="(paragraph, paragraphIndex) in paragraphs(currentLessonStep?.body)" :key="paragraphIndex">{{ paragraph }}</p>
              </div>
              <section
                v-if="currentLessonStep?.example"
                class="lv2-step-example"
                data-yz-annotate-label="手写例题"
              >
                <header>
                  <span>手写例题</span>
                  <b>{{ currentLessonStep.example.title }}</b>
                  <small>{{ currentLessonStep.example.language }}</small>
                </header>
                <pre><code>{{ currentLessonStep.example.code }}</code></pre>
                <div v-if="currentLessonStep.example.output" class="lv2-step-example-output">
                  <span>预期输出 / 观察证据</span>
                  <pre>{{ currentLessonStep.example.output }}</pre>
                </div>
              </section>
              <small>{{ currentLessonStep?.note }}</small>
              <section v-if="currentLessonStep?.practice" class="lv2-step-lab">
                <header><span>本步怎么做</span><b>跟做与记录</b></header>
                <p>{{ currentLessonStep.practice }}</p>
              </section>
              <!-- 完成检查（checkpoint）不再逐步展示：归入学完后的「本课练习」逐题自测（2026-11-22 用户要求：学完才能看习题） -->
              <div class="lv2-errors"><b>常见错误</b><ul><li v-for="error in coursePlan.commonErrors" :key="error">{{ error }}</li></ul></div>
              <section
                v-if="lessonStep === lessonSteps.length - 1"
                class="lv2-lesson-practice"
                aria-labelledby="lv2-lesson-practice-title"
                data-yz-annotate-id="learning-v2-lesson-practice"
                data-yz-annotate-label="本课产出"
              >
                <header><span>本课产出</span><h2 id="lv2-lesson-practice-title">跟做与独立练习</h2></header>
                <div>
                  <article>
                    <b>引导练习</b>
                    <p>{{ coursePlan.guidedPractice }}</p>
                  </article>
                  <article>
                    <b>独立练习</b>
                    <p>{{ coursePlan.independentPractice }}</p>
                  </article>
                </div>
              </section>
              <section
                v-if="lessonStep === lessonSteps.length - 1"
                class="lv2-lesson-sources"
                aria-labelledby="lv2-lesson-sources-title"
                data-yz-annotate-id="learning-v2-lesson-sources"
                data-yz-annotate-label="课程来源"
              >
                <header><span>可追溯材料</span><h2 id="lv2-lesson-sources-title">出处与来源</h2></header>
                <ul>
                  <li v-for="(source, sourceIndex) in coursePlan.sourceRefs" :key="`${sourceIndex}-${source}`">
                    <template v-for="(segment, segmentIndex) in sourceSegments(source)" :key="`${sourceIndex}-${segmentIndex}`">
                      <a v-if="segment.href" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a>
                      <template v-else>{{ segment.text }}</template>
                    </template>
                  </li>
                </ul>
              </section>
              <section
                v-if="lessonStep === lessonSteps.length - 1 && lessonExpertNotes.length"
                class="lv2-expert-notes"
                data-expert-notes
              >
                <header><span>名家注解 · 真实笔记</span><h3>注明出处的原文摘录与记法，可直接抄进你的笔记</h3></header>
                <article v-for="note in lessonExpertNotes" :key="note.quote.slice(0, 12)">
                  <b>{{ note.label }}</b>
                  <blockquote>{{ note.quote }}</blockquote>
                  <small>出处：{{ note.source }}</small>
                </article>
                <button type="button" @click="openNote(`${coursePlan.title} · 名家注解摘录`, expertNotesMarkdown(coursePlan.title, lessonExpertNotes))">
                  <NotebookPen :size="14" />抄进我的笔记
                </button>
              </section>
              <div class="lv2-lesson-actions">
                <LearningSpeechButton
                  :text="`${currentLessonStep?.title || ''}。${currentLessonStep?.body || ''}。${currentLessonStep?.practice || ''}。${currentLessonStep?.checkpoint || ''}。${currentLessonStep?.note || ''}`"
                  label="朗读本步"
                />
                <button class="lv2-lesson-note-action" type="button" @click="openNote(coursePlan.title, currentLessonStep?.body || '')"><NotebookPen :size="14" />自由笔记</button>
              </div>
            </article>
            <ResizablePane
              side="right"
              label="笔记抽屉"
              storage-key="yz.learning.v2.lesson-notes.v1"
              :default-width="260"
              :min-width="34"
              :max-width="420"
            >
              <div class="lv2-lesson-notes">
                <header><b>笔记与来源</b><small>{{ coursePlan.title }}</small></header>
                <section class="ln-block">
                  <h4>本步要点</h4>
                  <p>{{ currentLessonStep?.objective || coursePlan.plainLanguageGoal }}</p>
                </section>
                <section v-if="lessonExpertNotes.length" class="ln-block">
                  <h4>来源摘录</h4>
                  <blockquote v-for="note in lessonExpertNotes.slice(0, 2)" :key="note.quote.slice(0, 12)">
                    {{ note.quote }}<small>出处：{{ note.source }}</small>
                  </blockquote>
                </section>
                <section class="ln-block">
                  <h4>我的笔记</h4>
                  <button type="button" class="ln-write" @click="openNote(coursePlan.title, currentLessonStep?.body || '')">写一条笔记</button>
                  <p class="ln-hint">在本页就地编辑，不会弹出窗口。</p>
                </section>
                <!-- 页内面板：就地展开笔记编辑器，不再弹全屏 modal -->
                <NoteQuickCreateDialog
                  v-model:visible="noteVisible"
                  :title="noteTitle"
                  :content="noteContent"
                  category-name="学习"
                  inline
                />
              </div>
            </ResizablePane>
            </div>
              <div v-if="lessonFinished" class="lv2-lesson-done" role="status">
                <b>本课已完成</b>
                <p>沿着本课课脉继续：用一组判断检查刚才的理解。</p>
                <div class="lv2-lesson-done-actions">
                  <button type="button" @click="goLessonPractice"><ClipboardCheck :size="14" />继续练习</button>
                  <button v-if="nextCourseName" type="button" @click="goNextLessonCourse">
                    下一课：{{ nextCourseName }}<ChevronRight :size="14" />
                  </button>
                  <button type="button" class="lv2-lesson-done-stay" @click="lessonFinished = false">留在本课复习</button>
                </div>
              </div>
              <footer v-else><button type="button" :disabled="lessonStep === 0" @click="lessonStep--">上一步</button><button type="button" @click="lessonStep < lessonSteps.length - 1 ? lessonStep++ : finishLesson()">{{ lessonStep < lessonSteps.length - 1 ? '下一步' : '完成本课' }}</button></footer>
            </div>
        </template>

        <template v-else-if="activePage === 'studio'">
          <div class="lv2-session-stage-layout lv2-session-apply-layout">
            <aside class="lv2-session-stage-rail lv2-session-apply-rail">
              <header>
                <span>本课实践</span>
                <b>{{ studios.studio.title }}</b>
              </header>
              <ol class="lv2-session-apply-steps">
                <li v-for="(step, index) in studios.studio.steps" :key="`${index}-${step}`">
                  <i>{{ index + 1 }}</i><span>{{ step }}</span>
                </li>
              </ol>
              <section>
                <small>验收产出</small>
                <p>{{ studios.output }}</p>
              </section>
              <section>
                <small>操作边界</small>
                <p>{{ studios.boundary }}</p>
              </section>
            </aside>
            <div class="lv2-session-stage-main lv2-session-apply-main">
            <div ref="studioRoot" class="lv2-studio-immersive inline" tabindex="-1" :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }">
              <div class="lv2-studio-immersive-body" :class="{ embedded: usesEmbeddedStudioPractice }">
                <div class="lv2-studio-immersive-content" :class="{ embedded: usesEmbeddedStudioPractice }">
                  <!-- 页头「实践」标题已删除：顶部信息条已含「实践 · 类型」与课程名，重复且占空间（2026-11-21） -->
                  <LearningCodeLab
                    v-if="courseCodeLab"
                    :lab="courseCodeLab"
                    mode="apply"
                    :course-name="selectedCourseName"
                    @completed="handleLearningCodeCompleted"
                  />
                  <LearningPracticeStudio
                    v-else
                    :subject-key="selectedSubjectKey"
                    :course-name="selectedCourseName"
                    :practice="studios"
                    @goto-lesson="completeStudioPractice"
                  />
                </div>
              </div>
            </div>
            </div>
          </div>
        </template>

        <template v-else-if="activePage === 'practice'">
          <div class="lv2-session-practice-surface">
          <header class="lv2-session-practice-head">
            <div>
              <span>练习 · 本课即时反馈</span>
              <b>{{ selectedCourseName }}</b>
              <small>答错可回到本课原文，提交反馈后再进入实践。</small>
            </div>
            <button
              class="lv2-quiz-bank-toggle"
              type="button"
              aria-controls="lv2-quiz-bank"
              :aria-expanded="quizListOpen"
              @click="quizListOpen = !quizListOpen"
            >
              <ListChecks :size="15" />
              题库列表
            </button>
          </header>
          <div class="lv2-session-practice-layout">
          <div class="lv2-session-practice-main">
          <article ref="quizHeading" class="lv2-quiz" tabindex="-1">
            <header class="lv2-quiz-meta">
              <span>{{ currentQuiz.focus }}</span>
              <small>第 {{ quizQuestionIndex + 1 }} / {{ quizTotal }} 题 · 已得 {{ quizScore }} 分</small>
            </header>
            <h2 tabindex="-1" @click="focusCurrentQuiz">{{ currentQuiz.prompt }}</h2>
            <button
              v-for="(option, index) in currentQuiz.options"
              :key="option"
              type="button"
              :disabled="quizSubmitted[quizQuestionIndex]"
              :aria-pressed="quizPicks[quizQuestionIndex] === index"
              :class="{ picked: quizPicks[quizQuestionIndex] === index, correct: quizSubmitted[quizQuestionIndex] && index === currentQuiz.answer, wrong: quizSubmitted[quizQuestionIndex] && quizPicks[quizQuestionIndex] === index && index !== currentQuiz.answer }"
              @click="pickQuizOption(index)"
            >
              <span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}<Check v-if="quizSubmitted[quizQuestionIndex] && index === currentQuiz.answer" :size="15" />
            </button>
            <p
              v-if="quizSubmitted[quizQuestionIndex]"
              class="lv2-quiz-explanation"
              :class="{ correct: quizPicks[quizQuestionIndex] === currentQuiz.answer, wrong: quizPicks[quizQuestionIndex] !== currentQuiz.answer }"
              data-quiz-feedback
              role="status"
              aria-live="polite"
            >
              <b>{{ quizPicks[quizQuestionIndex] === currentQuiz.answer ? '回答正确' : '需要复习' }}</b>
              <span>{{ currentQuiz.explanation }}</span>
            </p>
            <div class="lv2-quiz-actions">
              <button
                class="lv2-quiz-nav"
                type="button"
                :disabled="quizQuestionIndex === 0"
                :aria-label="quizQuestionIndex === 0 ? '已经是第一题' : `上一题：第 ${quizQuestionIndex} 题`"
                @click="prevQuizQuestion"
              >上一题</button>
              <button
                v-if="!quizSubmitted[quizQuestionIndex]"
                class="lv2-quiz-submit"
                type="button"
                :disabled="quizPicks[quizQuestionIndex] == null"
                @click="submitCurrentQuiz"
              >提交判断</button>
              <button
                v-else-if="quizQuestionIndex < quizTotal - 1"
                class="lv2-quiz-submit"
                type="button"
                @click="nextQuizQuestion"
              >下一题</button>
              <button v-else class="lv2-quiz-submit" type="button" @click="quizListOpen = true">查看题库</button>
            </div>
            <p v-if="quizAllSubmitted" class="lv2-quiz-score">本章完成：{{ quizScore }} / {{ quizTotal }} 题正确。错题解析已标出，可用「上一题」回看。</p>
            <p v-if="!coursePlan.quiz?.length" class="lv2-quiz-fallback">本课程题库暂未拆分：先用当前课程综合题练习，下面的自测清单覆盖本课每个步骤。</p>
          </article>
          <section
            v-show="quizListOpen"
            id="lv2-quiz-bank"
            class="lv2-question-bank"
            data-quiz-bank
            :data-quiz-course="selectedCourseName"
            aria-labelledby="lv2-question-bank-title"
          >
            <header>
              <div>
                <span>本课程题库</span>
                <b id="lv2-question-bank-title">{{ selectedCourseName }}</b>
              </div>
              <small>{{ quizSubmittedCount }} / {{ quizTotal }} 已完成 · 点题号直接跳转</small>
            </header>
            <ol>
              <li v-for="(item, index) in quizItems" :key="`${item.focus}-${index}`">
                <button
                  type="button"
                  :data-quiz-bank-item="index"
                  :class="{
                    current: quizQuestionIndex === index,
                    correct: quizSubmitted[index] && quizPicks[index] === item.answer,
                    wrong: quizSubmitted[index] && quizPicks[index] !== item.answer,
                  }"
                  :aria-current="quizQuestionIndex === index ? 'step' : undefined"
                  @click="selectQuizQuestion(index)"
                >
                  <span class="lv2-question-number">第 {{ String(index + 1).padStart(2, '0') }} 题</span>
                  <span class="lv2-question-focus">{{ item.focus }}</span>
                  <span class="lv2-question-status" data-quiz-bank-status>{{ quizQuestionStatus(index) }}</span>
                </button>
              </li>
            </ol>
            <footer v-if="quizAllSubmitted">
              <button type="button" @click="resetQuizProgress">重新练习本课题库</button>
            </footer>
          </section>
          <LearningCodeLab
            v-if="courseCodeLab"
            :lab="courseCodeLab"
            mode="practice"
            :course-name="selectedCourseName"
            @completed="handleLearningCodeCompleted"
          />
          </div>
          <aside class="lv2-session-practice-side lv2-session-stage-rail">
          <section class="lv2-quiz-checkpoints">
            <header>
              <b>本课自测清单 · {{ selectedCourseName }}</b>
              <small>来自课程每一步的完成确认：先自己作答，再对照课程内容核对。</small>
            </header>
            <ol>
              <li v-for="(item, index) in quizCheckpoints" :key="index">
                <b>{{ String(index + 1).padStart(2, '0') }} · {{ item.title }}</b>
                <span>{{ item.checkpoint }}</span>
              </li>
            </ol>
          </section>
          <div v-if="quizAllSubmitted && courseCodeLab && !hasCodeEvidence('practice')" class="lv2-session-bridge-pending" role="status">
            <b>判断题已完成，还差代码跟做</b>
            <p>在右侧运行本课起始代码并记录运行证据，练习阶段才算完成。</p>
          </div>
          <div v-if="sessionPracticeDone" class="lv2-session-bridge" role="status">
            <div>
              <b>判断完成，去把它用起来</b>
              <p>
                你已经检查了本课判断{{ courseCodeLab ? '并留下代码运行证据' : '' }}。
                下一步用同一个知识点完成 {{ courseCodeLab?.apply.title || studios.studio.title }}。
              </p>
            </div>
            <button type="button" @click="selectPage('studio')">带着判断去实践</button>
          </div>
          </aside>
          </div>
          </div>
        </template>

        <template v-else>
          <div class="lv2-session-coach-surface">
            <LearningCoachPanel
              :subject-key="selectedSubjectKey"
              :subject-name="subject.name"
              :course-name="selectedCourseName"
              :opening="subject.coach.opening"
              :prompts="subject.coach.prompts"
              :reference="`${subject.book.title} · ${subject.book.source}`"
            />
          </div>
        </template>
          </LearningSessionShell>
        </template>

        <template v-else-if="activePage === 'review'">
          <div class="lv2-stats"><div><b>{{ subject.review.due }}</b><span>今日到期</span></div><div><b>{{ subject.review.mastery }}%</b><span>掌握度</span></div><div><b>7</b><span>连续天数</span></div></div>
          <div class="lv2-review"><div v-for="(item, index) in subject.review.items" :key="item"><i>{{ String(index + 1).padStart(2, '0') }}</i><b>{{ item }}</b><button type="button" @click="selectPage('practice')">复习</button></div></div>
        </template>
      </section>
      <aside
        v-if="!isCompactLayout && !isStudySurface"
        class="lv2-study-rail"
        :class="{ collapsed: effectiveStudyRailCollapsed }"
        aria-label="今日学习概览"
      >
        <button
          class="lv2-rail-collapse"
          type="button"
          :aria-label="effectiveStudyRailCollapsed ? '展开今日学习侧栏' : '收起今日学习侧栏'"
          :aria-expanded="!effectiveStudyRailCollapsed"
          @click="toggleStudyRail"
        >
          <ChevronLeft v-if="effectiveStudyRailCollapsed" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>
        <div v-if="!effectiveStudyRailCollapsed" class="lv2-rail-content">
        <section>
          <header><h2>今天</h2></header>
          <div class="lv2-rail-goal">
            <div><b>今日目标</b><span>{{ completedCourseCount }} / {{ Math.max(1, readyCourses.length) }} 节</span></div>
            <i><span :style="{ width: `${courseProgressPercent}%` }"></span></i>
          </div>
          <div class="lv2-rail-plan">
            <button
              v-for="item in todayPlanItems"
              :key="item.key"
              type="button"
              :class="{ done: item.done }"
              @click="selectPage(item.page)"
            >
              <i><Check v-if="item.done" :size="11" /></i>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </section>
        <section>
          <header><h2>掌握度</h2><span>{{ courseProgressPercent }}%</span></header>
          <i class="lv2-rail-mastery"><span :style="{ width: `${courseProgressPercent}%` }"></span></i>
          <p>{{ courseProgressPercent ? '按已完成课程计算，复习记录会继续更新掌握度。' : '完成第一节课后开始记录。' }}</p>
        </section>
        <section>
          <header><h2>最近记录</h2><span>{{ completedCourseIds.length }} 条</span></header>
          <button type="button" @click="selectPage('lesson')">
            <BookOpen :size="14" />
            <span><b>{{ selectedCourseName }}</b><small>{{ currentCourseCompleted ? '已完成' : '进行中' }}</small></span>
          </button>
          <button type="button" @click="selectPage('review')">
            <Brain :size="14" />
            <span><b>待复习 {{ subject.review.due }} 项</b><small>{{ subject.review.items[0] }}</small></span>
          </button>
        </section>
        </div>
        <div v-else class="lv2-rail-collapsed-label">
          <span>今天</span>
          <b>{{ courseProgressPercent }}%</b>
        </div>
        <button
          v-if="!effectiveStudyRailCollapsed && !isDenseLayout"
          class="lv2-rail-resize"
          type="button"
          role="separator"
          aria-label="调整今日学习侧栏宽度"
          aria-orientation="vertical"
          :aria-valuemin="STUDY_RAIL_MIN_WIDTH"
          :aria-valuemax="STUDY_RAIL_MAX_WIDTH"
          :aria-valuenow="studyRailWidth"
          @pointerdown="startStudyRailResize"
          @keydown="resizeStudyRailWithKeyboard"
        />
      </aside>
      </div>
    </main>
    </template>

    <Teleport to="body">
      <LearningBookReader
        v-if="readerOpen && readerBook"
        :key="readerBook.id"
        :book="readerBook"
        @close="closeReadingBook"
      />
    </Teleport>

    <Teleport to="body">
      <div v-if="mobileSubjectsOpen" class="lv2-mobile-sheet-mask" :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }" @click.self="closeMobileSubjects(true)">
        <section ref="mobileSubjectSheet" class="lv2-mobile-subject-sheet" role="dialog" aria-modal="true" aria-labelledby="lv2-mobile-subject-title">
          <header>
            <div><span>学习科目</span><h2 id="lv2-mobile-subject-title">选择一门课</h2></div>
            <button type="button" aria-label="关闭科目选择" @click="closeMobileSubjects(true)"><X :size="17" /></button>
          </header>
          <div class="lv2-mobile-subject-groups">
            <section
              v-for="category in subjectCategoryGroups"
              :key="category.key"
              class="lv2-mobile-subject-group"
              :class="{ active: subjectCategoryFor(selectedSubjectKey) === category.key }"
              :data-mobile-subject-category="category.key"
            >
              <button
                type="button"
                class="lv2-mobile-subject-group-head"
                :aria-expanded="isSubjectCategoryOpen(category.key)"
                @click="toggleSubjectCategory(category.key)"
              >
                <b>{{ category.label }}</b>
                <small>{{ categoryNavigationCount(category) }}</small>
                <ChevronDown :size="15" :class="{ reversed: !isSubjectCategoryOpen(category.key) }" />
              </button>
              <div
                v-show="isSubjectCategoryOpen(category.key)"
                class="lv2-mobile-subject-group-items"
                :data-mobile-subject-category-items="category.key"
              >
                <button
                  v-for="item in mobileSubjectEntriesByCategory[category.key] || []"
                  :key="`${item.kind}:${item.key}`"
                  type="button"
                  class="lv2-mobile-subject-entry"
                  :class="{
                    active: item.kind === 'programming'
                      ? selectedSubjectKey === 'programming' && programmingPackageId === item.key
                      : item.key === selectedSubjectKey,
                  }"
                  :data-mobile-programming-package="item.kind === 'programming' ? item.key : undefined"
                  :data-mobile-subject="item.kind === 'subject' ? item.key : undefined"
                  @click="selectMobileSubjectEntry(item)"
                >
                  <i :style="{ '--dot': item.accent }">{{ item.short.slice(0, 1) }}</i>
                  <span><b>{{ item.name }}</b><small>{{ item.meta }}</small></span>
                  <Check
                    v-if="item.kind === 'programming'
                      ? selectedSubjectKey === 'programming' && programmingPackageId === item.key
                      : item.key === selectedSubjectKey"
                    :size="16"
                  />
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Teleport>

    <LearningContentManager
      :open="contentManagerOpen"
      :subjects="subjects"
      :registered-packs="registeredContentPacks"
      :current-subject-key="selectedSubjectKey"
      @close="contentManagerOpen = false"
      @imported="handleContentPackImported"
      @removed="handleContentPackRemoved"
    />
  </div>
</template>

<style scoped src="./learning-v2.css"></style>
