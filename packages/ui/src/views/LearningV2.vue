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
  Library, NotebookPen, Play, Sparkles, Wrench, X,
} from 'lucide-vue-next';
import {
  LEARNING_V2_PAGES,
  getCoursePracticeTask,
  getLearningV2CoursePlan,
  getLearningV2Library,
  getLearningV2Subject,
  getLearningV2Subjects,
  isLearningV2CourseReady,
  PROGRAMMING_COURSE_PACKAGES,
  PROGRAMMING_PROJECTS,
  SUBJECT_EXPERT_NOTES,
  type LearningV2ExpertNote,
  type LearningV2LibraryEntry,
  type LearningV2PageKey,
  type LearningV2Practice,
  type LearningV2ReaderBook,
} from '@yan-zhi/shared';
import { api } from '../api/client';
import NoteQuickCreateDialog from '../components/notes/NoteQuickCreateDialog.vue';
import AlgorithmWorkbench from '../components/learning/AlgorithmWorkbench.vue';
import LearningCoachPanel from '../components/learning/v2/LearningCoachPanel.vue';
import LearningLibrary from '../components/learning/v2/LearningLibrary.vue';
import LearningBookReader from '../components/learning/v2/LearningBookReader.vue';
import LearningPracticeStudio from '../components/learning/v2/LearningPracticeStudio.vue';
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
import { activeMode, leadOf, setLead, type LeadMode } from '../stores/mode';
import { useAgentStore } from '../stores/agent';
import { useChat } from '../composables/chat/useChat';

const SESSION_KEY = 'yz.learning.v2.session.v1';
const PROGRESS_KEY = 'yz.learning.v2.progress.v1';
const STUDY_RAIL_PREF_KEY = 'yz.learning.v2.study-rail.v1';
const SUBJECTS_COLLAPSED_KEY = 'yz.learning.v2.subjects-collapsed.v1';
const STUDY_RAIL_DEFAULT_WIDTH = 216;
const STUDY_RAIL_MIN_WIDTH = 188;
const STUDY_RAIL_MAX_WIDTH = 320;
const STUDY_RAIL_COLLAPSED_WIDTH = 42;
const LEARNING_AGENT_ID = 'a_builtin_learning_subject_coach';
const LEGACY_ENGLISH_AGENT_ID = 'a_builtin_learning_coach';
const subjects = getLearningV2Subjects();
const selectedSubjectKey = ref(subjects[0]?.key || 'party');
const selectedCourseName = ref(subjects[0]?.current.course || '');
const subjectsCollapsed = ref(false);
const openTrackNames = ref<string[]>([]);
const activePage = ref<LearningV2PageKey>('overview');
const lessonStep = ref(0);
/* 完成本课后的就地选择状态：做练习 / 下一课 / 留在复习（声明提前供 immediate watch 复位） */
const lessonFinished = ref(false);
const bookLayer = ref<'notes' | 'annotation' | 'translation' | 'source'>('notes');
const quizCourseName = ref('');
const quizIndex = ref(0);
const quizPicks = ref<Record<number, number | null>>({});
const quizSubmitted = ref<Record<number, boolean>>({});
const completedCourseIds = ref<string[]>([]);
const libraryOpen = ref(false);
const readerOpen = ref(false);
const readerBook = ref<LearningV2ReaderBook | null>(null);
const mobileSubjectsOpen = ref(false);
const learningAiInput = ref<{
  fillInput: (text: string) => void;
  fillAndSend: (text: string) => Promise<void>;
} | null>(null);
const libraryPage = ref<HTMLElement | null>(null);
const workspaceRoot = ref<HTMLElement | null>(null);
const mobileSubjectSheet = ref<HTMLElement | null>(null);
const lessonRoot = ref<HTMLElement | null>(null);
const specializedStudyRoot = ref<HTMLElement | null>(null);
const studioRoot = ref<HTMLElement | null>(null);
const noteVisible = ref(false);
const noteTitle = ref('');
const noteContent = ref('');
const studyRailWidth = ref(STUDY_RAIL_DEFAULT_WIDTH);
const studyRailCollapsed = ref(false);
const legacySecurityPathId = ref('');
const isCompactLayout = ref(
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px)')?.matches,
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
let mobileSheetBodyOverflow = '';
let railResizeStartX = 0;
let railResizeStartWidth = STUDY_RAIL_DEFAULT_WIDTH;

const subject = computed(() => getLearningV2Subject(selectedSubjectKey.value) || subjects[0]);
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
const chat = useChat();
const agentStore = useAgentStore();
const courses = computed(() => subject.value?.courses || []);
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
const upNextCourses = computed(() =>
  readyCourses.value.filter((course) => course.name !== selectedCourseName.value).slice(0, 4),
);
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
const lessonSteps = computed(() => coursePlan.value.steps || []);
const currentLessonStep = computed(() => lessonSteps.value[lessonStep.value] || lessonSteps.value[0]);
const subjectExpertNotes = computed(() => SUBJECT_EXPERT_NOTES[selectedSubjectKey.value] ?? []);
const lessonExpertNotes = computed(() => coursePlan.value.expertNotes ?? []);

/* ===== 练习测评：分章节课程题库（2026-11-21）=====
   · 默认选中当前课程，可切换到本科目任意课程（章节）
   · 题目来源：课程教案 quiz 题库 → 无题库时回退科目综合题
   · 另附课程步骤自测清单（checkpoint），保证每门课都有多题内容 */
const quizPlan = computed(() => {
  if (!quizCourseName.value) return null;
  try {
    return getLearningV2CoursePlan(selectedSubjectKey.value, quizCourseName.value);
  } catch {
    return null;
  }
});
const quizItems = computed<LearningV2Practice[]>(() => {
  const banked = quizPlan.value?.quiz ?? [];
  return banked.length ? [...banked] : [subject.value.practice];
});
const quizTotal = computed(() => quizItems.value.length);
const quizStepIndex = computed(() => Math.min(quizIndex.value, quizTotal.value - 1));
const currentQuiz = computed(() => quizItems.value[quizStepIndex.value]);
const quizScore = computed(() =>
  quizItems.value.reduce((sum, item, index) => sum + (quizPicks.value[index] === item.answer ? 1 : 0), 0),
);
const quizAllSubmitted = computed(() =>
  quizTotal.value > 0 && quizItems.value.every((_, index) => quizSubmitted.value[index]),
);
const quizCheckpoints = computed(() =>
  (quizPlan.value?.steps ?? []).map((step) => ({
    title: step.title,
    checkpoint: step.checkpoint || '',
  })),
);
function resetQuizProgress() {
  quizIndex.value = 0;
  quizPicks.value = {};
  quizSubmitted.value = {};
}
function pickQuizOption(index: number) {
  if (quizSubmitted.value[quizStepIndex.value]) return;
  quizPicks.value[quizStepIndex.value] = index;
}
function submitCurrentQuiz() {
  if (quizPicks.value[quizStepIndex.value] == null) return;
  quizSubmitted.value[quizStepIndex.value] = true;
}
function nextQuizQuestion() {
  if (quizIndex.value < quizTotal.value - 1) quizIndex.value += 1;
}
function prevQuizQuestion() {
  if (quizIndex.value > 0) quizIndex.value -= 1;
}
watch(selectedSubjectKey, () => {
  quizCourseName.value = '';
  resetQuizProgress();
});
watch(selectedCourseName, (name) => {
  // 全局课程切换时，练习页跟随（仅在用户没有手动选择过章节时）
  if (!quizCourseName.value) quizCourseName.value = name;
  lessonFinished.value = false;
}, { immediate: true });
watch(quizCourseName, () => resetQuizProgress());
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
const studyRailWidthCss = computed(() =>
  studyRailCollapsed.value ? `${STUDY_RAIL_COLLAPSED_WIDTH}px` : `${studyRailWidth.value}px`,
);
const studios = computed(() => practice.value);
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
  const pageText: Record<LearningV2PageKey, string> = {
    overview: `${subject.value.name}。${subject.value.line}。当前课程：${selectedCourseName.value}。`,
    roadmap: `${subject.value.name}课程地图。零基础到进阶。当前课程：${selectedCourseName.value}。`,
    books: `${subject.value.book.title}。${subject.value.book.unit}。原文：${subject.value.book.original}。来源：${subject.value.book.source}。`,
    lesson: `${coursePlan.value.title}。${currentLessonStep.value?.title || ''}。${currentLessonStep.value?.body || ''}。本步练习：${currentLessonStep.value?.practice || ''}。完成检查：${currentLessonStep.value?.checkpoint || ''}。${currentLessonStep.value?.note || ''}。`,
    studio: `${studios.value.studio.title}。${studios.value.task}。操作边界：${studios.value.boundary}。`,
    practice: `练习测评 · ${quizCourseName.value || selectedCourseName.value}。${currentQuiz.value.prompt}。选项：${currentQuiz.value.options.join('；')}。`,
    review: `复习巩固。${subject.value.review.items.join('；')}。`,
    coach: `${subject.value.coach.opening}。${subject.value.coach.prompts.join('；')}。`,
  };
  return pageText[activePage.value];
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
  if (studyRailCollapsed.value || event.button !== 0) return;
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
  selectedSubjectKey.value = key;
  selectedCourseName.value = next.current.course;
  const currentTrack = next.courses.find((course) => course.name === next.current.course)?.trackName
    || next.tracks[0]?.name
    || '';
  openTrackNames.value = currentTrack ? [currentTrack] : [];
  lessonStep.value = 0;
  quizCourseName.value = '';
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
  quizCourseName.value = '';
  resetQuizProgress();
  /* 本课练习是「这一课」的：换课一律关闭并重置，避免上一课的练习留在页尾 */
  lessonQuizOpen.value = false;
  resetLessonQuiz();
  return true;
}

function openCourse(name: string) {
  if (selectCourse(name)) selectPage('lesson');
}

function openProgrammingLesson(courseName: string): void {
  if (selectCourse(courseName)) selectPage('lesson');
}

function selectPage(page: LearningV2PageKey) {
  if (page === 'lesson' && !courseReady(selectedCourseName.value)) {
    activePage.value = 'overview';
    return;
  }
  activePage.value = page;
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

function exitLesson() {
  lessonQuizOpen.value = false;
  selectPage('overview');
}

function exitStudio() {
  selectPage('overview');
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

/* 完成本课后不再直接跳练习页：就地给出「做练习 / 下一课」选择，学习动线由学习者决定（2026-11-22） */
const nextCourseName = computed(() => {
  const trackName = selectedCourse.value?.trackName;
  if (!trackName) return null;
  const list = courses.value.filter((course) => course.trackName === trackName);
  const index = list.findIndex((course) => course.name === selectedCourse.value?.name);
  for (let i = index + 1; i < list.length; i++) {
    if (isLearningV2CourseReady(subject.value.key, list[i].name)) return list[i].name;
  }
  return null;
});

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

function goLessonPractice() {
  /* 2026-11-22：做本课练习不再跳出沉浸页——在课程内就地展开练习卡，关闭回到完成面板继续「下一课」 */
  lessonQuizOpen.value = true;
  resetLessonQuiz();
  void nextTick(scrollLessonQuizIntoView);
}

function goNextLessonCourse() {
  const next = nextCourseName.value;
  lessonFinished.value = false;
  if (next) {
    selectCourse(next);
    selectPage('lesson');
  } else {
    // 已是本阶段最后一课：留在课程内，就地开练习层
    lessonQuizOpen.value = true;
    resetLessonQuiz();
  }
}

/* ===== 课程内练习（2026-11-22）=====
   · 顶栏常驻「本课练习」入口，任何步骤都能打开，不离开课程
   · 内容始终来自本课教案：有 quiz 题库 → 选择题；没有 → 逐步骤完成确认自测
     （题目即该步 checkpoint，可展开参考要点）——保证与章节严格匹配 */
const lessonQuizOpen = ref(false);
const lessonQuizStep = ref(0);
const lessonQuizPicks = ref<Record<number, number | null>>({});
const lessonQuizSubmitted = ref<Record<number, boolean>>({});
const lessonCheckRevealed = ref<Record<number, boolean>>({});
/* 自测题型作答框（2026-11-22 用户反馈）：仅本地草稿，不评分不入库 */
const lessonCheckDrafts = ref<Record<number, string>>({});
const lessonQuizSection = ref<HTMLElement | null>(null);
type LessonQuizMcqItem = { kind: 'mcq'; practice: LearningV2Practice };
type LessonQuizCheckItem = { kind: 'check'; title: string; prompt: string; note: string; practice: string };
const lessonQuizItems = computed<readonly (LessonQuizMcqItem | LessonQuizCheckItem)[]>(() => {
  const banked = coursePlan.value.quiz ?? [];
  if (banked.length) return banked.map((practice) => ({ kind: 'mcq' as const, practice }));
  return coursePlan.value.steps.map((step) => ({
    kind: 'check' as const,
    title: step.title,
    prompt: step.checkpoint || `合上提示，用自己的话复述「${step.title}」的要点，并给出一个可能的反例。`,
    note: step.note,
    practice: step.practice || '',
  }));
});
const lessonQuizTotal = computed(() => lessonQuizItems.value.length);
const lessonQuizIdx = computed(() => Math.min(lessonQuizStep.value, lessonQuizTotal.value - 1));
const currentLessonQuizItem = computed(() => lessonQuizItems.value[lessonQuizIdx.value]);
const lessonQuizMcq = computed(() =>
  currentLessonQuizItem.value.kind === 'mcq' ? currentLessonQuizItem.value.practice : null,
);
const lessonQuizCheck = computed(() =>
  currentLessonQuizItem.value.kind === 'check' ? currentLessonQuizItem.value : null,
);
const lessonQuizScore = computed(() =>
  lessonQuizItems.value.reduce((sum, item, index) =>
    item.kind === 'mcq' && lessonQuizPicks.value[index] === item.practice.answer ? sum + 1 : sum, 0),
);
function resetLessonQuiz() {
  lessonQuizStep.value = 0;
  lessonQuizPicks.value = {};
  lessonQuizSubmitted.value = {};
  lessonCheckRevealed.value = {};
  lessonCheckDrafts.value = {};
}
function scrollLessonQuizIntoView() {
  /* jsdom 等测试环境未实现 scrollIntoView，防护避免 unhandled rejection */
  const section = lessonQuizSection.value;
  if (section && typeof section.scrollIntoView === 'function') {
    try {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* 忽略 */
    }
  }
}
function toggleLessonQuiz() {
  lessonQuizOpen.value = !lessonQuizOpen.value;
  if (lessonQuizOpen.value) {
    resetLessonQuiz();
    void nextTick(scrollLessonQuizIntoView);
  }
}
function pickLessonQuizOption(index: number) {
  if (lessonQuizSubmitted.value[lessonQuizIdx.value]) return;
  lessonQuizPicks.value[lessonQuizIdx.value] = index;
}
function submitLessonQuiz() {
  if (lessonQuizPicks.value[lessonQuizIdx.value] == null) return;
  lessonQuizSubmitted.value[lessonQuizIdx.value] = true;
}
function toggleLessonCheckReveal() {
  lessonCheckRevealed.value = { ...lessonCheckRevealed.value, [lessonQuizIdx.value]: !lessonCheckRevealed.value[lessonQuizIdx.value] };
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

function onKeydown(event: KeyboardEvent) {
  if (mobileSubjectsOpen.value && event.key === 'Escape') {
    mobileSubjectsOpen.value = false;
    return;
  }
  if (libraryOpen.value && event.key === 'Escape') {
    closeLibrary();
    return;
  }
  if (activePage.value === 'lesson' && event.key === 'Escape') {
    exitLesson();
    return;
  }
  if (activePage.value === 'studio' && event.key === 'Escape') {
    exitStudio();
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
watch(isStudySurface, (active) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('yz-learning-study', active);
}, { immediate: true });
watch([selectedSubjectKey, selectedCourseName, activePage, lessonStep], saveSession);
watch(selectedSubjectKey, () => void loadProgress());
watch(lead, (next, previous) => {
  if (next === 'ai' && previous !== 'ai') {
    ensureLearningAgent();
  }
});
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
  if (isStudyPage(page) && mineOpen.value) mineOpen.value = false;
  await nextTick();
  if (page === 'lesson') (specializedStudyRoot.value || lessonRoot.value)?.focus();
  if (page === 'studio') studioRoot.value?.focus();
});
watch(mobileSubjectsOpen, async (open) => {
  if (open) {
    mobileSheetBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    mobileSubjectSheet.value?.querySelector<HTMLElement>('button.active, button')?.focus();
  } else {
    document.body.style.overflow = mobileSheetBodyOverflow;
  }
});
onMounted(() => {
  if (lead.value === 'ai') {
    ensureLearningAgent();
  }
  restoreStudyRailPreferences();
  restoreSession();
  subjectsCollapsed.value = localStorage.getItem(SUBJECTS_COLLAPSED_KEY) === '1';
  openTrackNames.value = currentTrackName.value ? [currentTrackName.value] : [];
  void loadProgress();
  window.addEventListener('keydown', onKeydown);
  compactMediaQuery = window.matchMedia?.('(max-width: 900px)') || null;
  if (compactMediaQuery) {
    compactMediaListener = (event: MediaQueryListEvent) => { isCompactLayout.value = event.matches; };
    compactMediaQuery.addEventListener?.('change', compactMediaListener);
    compactMediaQuery.addListener?.(compactMediaListener);
  }
});
onBeforeUnmount(() => {
  document.documentElement.classList.remove('yz-learning-study');
  window.removeEventListener('keydown', onKeydown);
  if (compactMediaQuery && compactMediaListener) {
    compactMediaQuery.removeEventListener?.('change', compactMediaListener);
    compactMediaQuery.removeListener?.(compactMediaListener);
  }
  compactMediaQuery = null;
  compactMediaListener = null;
  stopStudyRailResize();
  if (mobileSubjectsOpen.value) document.body.style.overflow = mobileSheetBodyOverflow;
});
</script>

<template>
  <div
    v-if="subject"
    class="lv2"
    :class="{ 'study-full': isStudySurface, 'study-lesson': activePage === 'lesson', 'subjects-collapsed': subjectsCollapsed, 'is-learning-ai': lead === 'ai', 'is-library-open': libraryOpen }"
    :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
    :data-yz-annotate-id="activePage === 'lesson' ? 'learning-v2-lesson' : `learning-v2-${activePage}`"
    data-yz-annotate-label="学习"
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
      <aside class="lv2-ai-context">
        <header class="lv2-ai-brand">
          <span><Sparkles :size="17" /></span>
          <div><b>学习教练</b><small>只围绕你的课程与进度</small></div>
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
      </aside>

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
            <button type="button" class="lv2-ai-head-button icon-only" title="新建学习会话" aria-label="新建学习会话" @click="newLearningConversation">
              <Sparkles :size="15" />
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

        <div class="lv2-ai-quick-strip" aria-label="学习快捷指令">
          <button v-for="item in aiQuickPrompts" :key="item.key" type="button" @click="fillLearningPrompt(item.prompt)">
            {{ item.label }}
          </button>
        </div>
        <div class="lv2-ai-composer">
          <ChatInputArea ref="learningAiInput" />
        </div>
      </main>
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
        <button
          class="lv2-subjects-toggle"
          type="button"
          :aria-label="subjectsCollapsed ? '展开学习科目栏' : '收起学习科目栏'"
          :aria-expanded="!subjectsCollapsed"
          @click="toggleSubjects"
        >
          <ChevronLeft :size="16" :class="{ reversed: subjectsCollapsed }" />
        </button>
      </header>
      <nav class="lv2-subject-list">
        <button
          v-for="item in subjects"
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
          <button class="lv2-library-button" type="button" aria-label="打开公共图书馆" @click="libraryOpen = true">
            <Library :size="17" /><span>图书馆</span>
          </button>
        </div>
      </header>

      <header v-else-if="!isStudySurface" class="lv2-mobile-topbar">
        <button
          type="button"
          class="lv2-mobile-subject"
          aria-label="切换学习科目"
          :aria-expanded="mobileSubjectsOpen"
          @click="mobileSubjectsOpen = true"
        >
          <span>{{ subject.name }}</span><ChevronDown :size="16" />
        </button>
        <div class="lv2-topbar-actions">
          <LearningSpeechButton :text="narrationText" :compact="true" />
          <button class="lv2-tool-chip" type="button" @click="selectPage('studio')">实践</button>
          <button class="lv2-tool-chip" type="button" @click="selectPage('practice')">练习</button>
          <button class="lv2-tool-chip" type="button" @click="selectPage('coach')">陪练</button>
          <button class="lv2-library-button" type="button" aria-label="打开公共图书馆" @click="libraryOpen = true">
            <Library :size="17" /><span>图书馆</span>
          </button>
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
        <div v-if="isCompactLayout && activePage !== 'overview' && activePage !== 'studio'" class="lv2-mobile-pagebar">
          <button data-action="back-to-subject" type="button" @click="selectPage('overview')">
            <ChevronLeft :size="14" />返回学科
          </button>
          <b>{{ currentPageLabel }}</b>
        </div>
        <nav v-if="activePage === 'practice' || activePage === 'coach'" class="lv2-subview-bar" aria-label="学习工具">
          <button type="button" class="lv2-subview-exit" @click="selectPage('overview')">返回教材</button>
          <button type="button" @click="selectPage('lesson')">课程</button>
          <button type="button" @click="selectPage('studio')">实践</button>
          <button type="button" :class="{ active: activePage === 'practice' }" @click="selectPage('practice')">练习</button>
          <button type="button" :class="{ active: activePage === 'coach' }" @click="selectPage('coach')">陪练</button>
        </nav>
        <template v-if="activePage === 'overview'">
          <!-- 2026-11-21：编程/算法科目此前在总览与课程地图渲染同一个 Hub，两个页签内容完全重复。
               2026-11-22：Hub 只留在「课程地图」，通用总览（继续学习 + 统计 + 接下来）对所有科目生效——
               否则编程/算法的总览会整页空白（用户截图实报）。 -->
          <div v-if="isCompactLayout" class="lv2-mobile-overview">
            <label class="lv2-mobile-course-select">
              <el-select
                :model-value="selectedCourseName"
                class="lv2-ai-select"
                popper-class="lv2-ai-select-popper lv2-ai-course-popper"
                aria-label="选择阶段与课程"
                filterable
                @change="onMobileCourseChange"
              >
                <el-option-group v-for="track in subject.tracks" :key="track.name" :label="track.name">
                  <el-option
                    v-for="course in track.courses"
                    :key="course.name"
                    :value="course.name"
                    :label="courseReady(course.name) ? course.name : `${course.name}（建设中）`"
                    :disabled="!courseReady(course.name)"
                  />
                </el-option-group>
              </el-select>
            </label>

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
              <button v-for="course in upNextCourses" :key="course.id" type="button" @click="openCourse(course.name)">
                <i class="lv2-course-order">{{ courseOrderLabel(course.name) }}</i>
                <span>{{ course.trackName }}</span><b>{{ course.name }}</b><small>{{ courseProgressLabel(course) }}</small>
              </button>
            </div>
          </template>
        </template>

        <template v-else-if="activePage === 'roadmap'">
          <ProgrammingCourseHub
            v-if="selectedSubjectKey === 'programming'"
            :courses="PROGRAMMING_COURSE_PACKAGES"
            :projects="PROGRAMMING_PROJECTS"
            @open-lesson="openProgrammingLesson"
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

        <template v-else-if="activePage === 'lesson'">
            <div
              v-if="usesSpecializedLessonWorkbench"
              ref="specializedStudyRoot"
              class="lv2-specialized-study inline"
              tabindex="-1"
              :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
            >
            <header class="lv2-specialized-study-bar">
              <button data-action="exit-lesson" type="button" @click="exitLesson">
                <ChevronLeft :size="16" />返回学习
              </button>
              <b>{{ subject.name }} · 完整课程内容</b>
              <span>{{ selectedCourseName }}</span>
              <span class="lv2-head-tools">
                <button class="lv2-tool-chip" type="button" @click="selectPage('studio')">实践</button>
                <button class="lv2-tool-chip" type="button" @click="selectPage('practice')">练习</button>
              </span>
              <button type="button" aria-label="关闭课程" @click="exitLesson"><X :size="16" /></button>
            </header>
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
            <header>
              <button class="lv2-lesson-back" data-action="exit-lesson" type="button" @click="exitLesson"><ChevronLeft :size="16" />返回路线</button>
              <b>{{ coursePlan.title }}</b>
              <span class="lv2-lesson-head-tools">
                <i>{{ lessonStep + 1 }}/{{ lessonSteps.length }}</i>
                <button class="lv2-tool-chip" type="button" @click="selectPage('studio')">实践</button>
                <button class="lv2-tool-chip" type="button" @click="selectPage('practice')">练习</button>
              </span>
              <button class="lv2-lesson-close" type="button" aria-label="关闭课程" @click="exitLesson"><X :size="16" /></button>
            </header>
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
                {{ coursePlan.qualityStatus === 'curated' ? '完整教案 · 人工审校' : '完整教案 · 系统整理' }}
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
                <button type="button" @click="openNote(coursePlan.title, currentLessonStep?.body || '')"><NotebookPen :size="14" />自由笔记</button>
              </div>
              <!-- 课程内练习（2026-11-22）：仅学完后出现；内联卡片，页脚「下一课」始终可见，不跳出课程。
                   内容严格来自本课教案：有 quiz 题库 → 选择题；否则逐步骤完成确认自测 -->
              <section v-if="lessonQuizOpen" ref="lessonQuizSection" class="lv2-lesson-quiz" aria-label="本课练习">
                <header class="lv2-lesson-quiz-bar">
                  <b>本课练习 · {{ coursePlan.title }}</b>
                  <button type="button" class="lv2-lesson-quiz-close" @click="lessonQuizOpen = false">收起</button>
                </header>
                <template v-if="lessonQuizMcq">
                  <header class="lv2-quiz-meta">
                    <span>{{ lessonQuizMcq.focus }}</span>
                    <small>第 {{ lessonQuizIdx + 1 }} / {{ lessonQuizTotal }} 题 · 已得 {{ lessonQuizScore }} 分</small>
                  </header>
                  <h2>{{ lessonQuizMcq.prompt }}</h2>
                  <button
                    v-for="(option, index) in lessonQuizMcq.options"
                    :key="option"
                    type="button"
                    :disabled="lessonQuizSubmitted[lessonQuizIdx]"
                    :aria-pressed="lessonQuizPicks[lessonQuizIdx] === index"
                    :class="{ picked: lessonQuizPicks[lessonQuizIdx] === index, correct: lessonQuizSubmitted[lessonQuizIdx] && index === lessonQuizMcq.answer, wrong: lessonQuizSubmitted[lessonQuizIdx] && lessonQuizPicks[lessonQuizIdx] === index && index !== lessonQuizMcq.answer }"
                    @click="pickLessonQuizOption(index)"
                  >
                    <span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}<Check v-if="lessonQuizSubmitted[lessonQuizIdx] && index === lessonQuizMcq.answer" :size="15" />
                  </button>
                  <p v-if="lessonQuizSubmitted[lessonQuizIdx]" class="lv2-quiz-explanation">{{ lessonQuizMcq.explanation }}</p>
                  <div class="lv2-quiz-actions">
                    <button class="lv2-quiz-nav" type="button" :disabled="lessonQuizIdx === 0" @click="lessonQuizStep > 0 && lessonQuizStep--">上一题</button>
                    <button
                      v-if="!lessonQuizSubmitted[lessonQuizIdx]"
                      class="lv2-quiz-submit"
                      type="button"
                      :disabled="lessonQuizPicks[lessonQuizIdx] == null"
                      @click="submitLessonQuiz"
                    >提交判断</button>
                    <button
                      v-else-if="lessonQuizIdx < lessonQuizTotal - 1"
                      class="lv2-quiz-submit"
                      type="button"
                      @click="lessonQuizStep += 1"
                    >下一题</button>
                    <button v-else class="lv2-quiz-submit" type="button" @click="resetLessonQuiz">重新练习</button>
                  </div>
                </template>
                <template v-else-if="lessonQuizCheck">
                  <header class="lv2-quiz-meta">
                    <span>步骤自测 · {{ lessonQuizCheck.title }}</span>
                    <small>第 {{ lessonQuizIdx + 1 }} / {{ lessonQuizTotal }} 步</small>
                  </header>
                  <h2>{{ lessonQuizCheck.prompt }}</h2>
                  <textarea
                    v-model="lessonCheckDrafts[lessonQuizIdx]"
                    class="lv2-lesson-quiz-answer"
                    placeholder="用自己的话作答"
                    rows="3"
                    aria-label="自测作答区"
                  ></textarea>
                  <button type="button" class="lv2-lesson-quiz-reveal" @click="toggleLessonCheckReveal">
                    {{ lessonCheckRevealed[lessonQuizIdx] ? '收起参考要点' : '先自己作答，再看参考要点' }}
                  </button>
                  <div v-if="lessonCheckRevealed[lessonQuizIdx]" class="lv2-lesson-quiz-reference">
                    <b>参考要点</b>
                    <p>{{ lessonQuizCheck.note }}</p>
                    <p v-if="lessonQuizCheck.practice">练习建议：{{ lessonQuizCheck.practice }}</p>
                  </div>
                  <div class="lv2-quiz-actions">
                    <button class="lv2-quiz-nav" type="button" :disabled="lessonQuizIdx === 0" @click="lessonQuizStep > 0 && lessonQuizStep--">上一步</button>
                    <button v-if="lessonQuizIdx < lessonQuizTotal - 1" class="lv2-quiz-submit" type="button" @click="lessonQuizStep += 1">下一步</button>
                    <button v-else class="lv2-quiz-submit" type="button" @click="lessonQuizOpen = false">完成自测</button>
                  </div>
                </template>
              </section>
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
                <p>接下来去哪里？</p>
                <div class="lv2-lesson-done-actions">
                  <button type="button" @click="goLessonPractice"><ClipboardCheck :size="14" />做本课练习</button>
                  <button v-if="nextCourseName" type="button" @click="goNextLessonCourse">下一课：{{ nextCourseName }}</button>
                  <button v-else type="button" disabled>已是本阶段最后一课</button>
                  <button type="button" class="lv2-lesson-done-stay" @click="lessonFinished = false">留在本课复习</button>
                </div>
              </div>
              <footer v-else><button type="button" :disabled="lessonStep === 0" @click="lessonStep--">上一步</button><button type="button" @click="lessonStep < lessonSteps.length - 1 ? lessonStep++ : finishLesson()">{{ lessonStep < lessonSteps.length - 1 ? '下一步' : '完成本课' }}</button></footer>
            </div>
        </template>

        <template v-else-if="activePage === 'studio'">
            <div ref="studioRoot" class="lv2-studio-immersive inline" tabindex="-1" :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }">
              <header class="lv2-studio-immersive-bar">
                <button data-action="exit-studio" type="button" @click="exitStudio">
                  <ChevronLeft :size="16" />返回学习
                </button>
                <b>{{ selectedCourseName }}</b>
                <span>实践 · {{ studios.studio.type }}</span>
                <span class="lv2-head-tools">
                  <button class="lv2-tool-chip" type="button" @click="selectPage('lesson')">课程</button>
                  <button class="lv2-tool-chip" type="button" @click="selectPage('practice')">练习</button>
                </span>
                <button class="lv2-studio-immersive-close" type="button" aria-label="关闭实践" @click="exitStudio">
                  <X :size="16" />
                </button>
              </header>
              <div class="lv2-studio-immersive-body" :class="{ embedded: usesEmbeddedStudioPractice }">
                <div class="lv2-studio-immersive-content" :class="{ embedded: usesEmbeddedStudioPractice }">
                  <!-- 页头「实践」标题已删除：顶部信息条已含「实践 · 类型」与课程名，重复且占空间（2026-11-21） -->
                  <LearningPracticeStudio
                    :subject-key="selectedSubjectKey"
                    :course-name="selectedCourseName"
                    :practice="studios"
                    @goto-lesson="selectPage('lesson')"
                  />
                </div>
              </div>
            </div>
        </template>

        <template v-else-if="activePage === 'practice'">
          <!-- 章节课程选择：默认当前课程，可切换本科目任意课程（2026-11-21 用户要求） -->
          <div class="lv2-quiz-picker">
            <el-select
              v-model="quizCourseName"
              class="lv2-quiz-course-select"
              filterable
              aria-label="选择章节课程"
              placeholder="选择章节课程"
            >
              <el-option-group v-for="track in subject.tracks" :key="track.name" :label="track.name">
                <el-option
                  v-for="course in track.courses"
                  :key="course.name"
                  :value="course.name"
                  :label="courseReady(course.name) ? course.name : `${course.name}（建设中）`"
                  :disabled="!courseReady(course.name)"
                />
              </el-option-group>
            </el-select>
          </div>
          <article class="lv2-quiz">
            <header class="lv2-quiz-meta">
              <span>{{ currentQuiz.focus }}</span>
              <small>第 {{ quizStepIndex + 1 }} / {{ quizTotal }} 题 · 已得 {{ quizScore }} 分</small>
            </header>
            <h2>{{ currentQuiz.prompt }}</h2>
            <button
              v-for="(option, index) in currentQuiz.options"
              :key="option"
              type="button"
              :disabled="quizSubmitted[quizStepIndex]"
              :aria-pressed="quizPicks[quizStepIndex] === index"
              :class="{ picked: quizPicks[quizStepIndex] === index, correct: quizSubmitted[quizStepIndex] && index === currentQuiz.answer, wrong: quizSubmitted[quizStepIndex] && quizPicks[quizStepIndex] === index && index !== currentQuiz.answer }"
              @click="pickQuizOption(index)"
            >
              <span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}<Check v-if="quizSubmitted[quizStepIndex] && index === currentQuiz.answer" :size="15" />
            </button>
            <p v-if="quizSubmitted[quizStepIndex]" class="lv2-quiz-explanation">{{ currentQuiz.explanation }}</p>
            <div class="lv2-quiz-actions">
              <button class="lv2-quiz-nav" type="button" :disabled="quizStepIndex === 0" @click="prevQuizQuestion">上一题</button>
              <button
                v-if="!quizSubmitted[quizStepIndex]"
                class="lv2-quiz-submit"
                type="button"
                :disabled="quizPicks[quizStepIndex] == null"
                @click="submitCurrentQuiz"
              >提交判断</button>
              <button
                v-else-if="quizStepIndex < quizTotal - 1"
                class="lv2-quiz-submit"
                type="button"
                @click="nextQuizQuestion"
              >下一题</button>
              <button v-else class="lv2-quiz-submit" type="button" @click="resetQuizProgress">重新练习</button>
            </div>
            <p v-if="quizAllSubmitted" class="lv2-quiz-score">本章完成：{{ quizScore }} / {{ quizTotal }} 题正确。错题解析已标出，可用「上一题」回看。</p>
            <p v-if="!quizPlan?.quiz?.length" class="lv2-quiz-fallback">本科目章节题库建设中：先用综合题练习，下面的自测清单覆盖本课每个步骤。</p>
          </article>
          <section class="lv2-quiz-checkpoints">
            <header>
              <b>本课自测清单 · {{ quizCourseName || selectedCourseName }}</b>
              <small>来自课程每一步的完成确认：先自己作答，再对照课程内容核对。</small>
            </header>
            <ol>
              <li v-for="(item, index) in quizCheckpoints" :key="index">
                <b>{{ String(index + 1).padStart(2, '0') }} · {{ item.title }}</b>
                <span>{{ item.checkpoint }}</span>
              </li>
            </ol>
          </section>
        </template>

        <template v-else-if="activePage === 'review'">
          <div class="lv2-stats"><div><b>{{ subject.review.due }}</b><span>今日到期</span></div><div><b>{{ subject.review.mastery }}%</b><span>掌握度</span></div><div><b>7</b><span>连续天数</span></div></div>
          <div class="lv2-review"><div v-for="(item, index) in subject.review.items" :key="item"><i>{{ String(index + 1).padStart(2, '0') }}</i><b>{{ item }}</b><button type="button" @click="selectPage('practice')">复习</button></div></div>
        </template>

        <template v-else>
          <LearningCoachPanel
            :subject-key="selectedSubjectKey"
            :subject-name="subject.name"
            :course-name="selectedCourseName"
            :opening="subject.coach.opening"
            :prompts="subject.coach.prompts"
            :reference="`${subject.book.title} · ${subject.book.source}`"
          />
        </template>
      </section>
      <aside
        v-if="!isCompactLayout && !isStudySurface"
        class="lv2-study-rail"
        :class="{ collapsed: studyRailCollapsed }"
        aria-label="今日学习概览"
      >
        <button
          class="lv2-rail-collapse"
          type="button"
          :aria-label="studyRailCollapsed ? '展开今日学习侧栏' : '收起今日学习侧栏'"
          :aria-expanded="!studyRailCollapsed"
          @click="toggleStudyRail"
        >
          <ChevronLeft v-if="studyRailCollapsed" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>
        <div v-if="!studyRailCollapsed" class="lv2-rail-content">
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
          v-if="!studyRailCollapsed"
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
      <div v-if="mobileSubjectsOpen" class="lv2-mobile-sheet-mask" :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }" @click.self="mobileSubjectsOpen = false">
        <section ref="mobileSubjectSheet" class="lv2-mobile-subject-sheet" role="dialog" aria-modal="true" aria-labelledby="lv2-mobile-subject-title">
          <header>
            <div><span>学习科目</span><h2 id="lv2-mobile-subject-title">选择一门课</h2></div>
            <button type="button" aria-label="关闭科目选择" @click="mobileSubjectsOpen = false"><X :size="17" /></button>
          </header>
          <div>
            <button
              v-for="item in subjects"
              :key="item.key"
              type="button"
              :class="{ active: item.key === selectedSubjectKey }"
              @click="selectSubject(item.key); mobileSubjectsOpen = false"
            >
              <i :style="{ '--dot': item.accent }">{{ item.short.slice(0, 1) }}</i>
              <span><b>{{ item.name }}</b><small>{{ item.tracks.length }} 阶段 · {{ item.courses.length }} 门</small></span>
              <Check v-if="item.key === selectedSubjectKey" :size="16" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="./learning-v2.css"></style>
