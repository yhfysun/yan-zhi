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
  type LearningV2LibraryEntry,
  type LearningV2PageKey,
  type LearningV2ReaderBook,
} from '@yan-zhi/shared';
import { api } from '../api/client';
import NoteQuickCreateDialog from '../components/notes/NoteQuickCreateDialog.vue';
import LearningCoachPanel from '../components/learning/v2/LearningCoachPanel.vue';
import LearningLibrary from '../components/learning/v2/LearningLibrary.vue';
import LearningBookReader from '../components/learning/v2/LearningBookReader.vue';
import LearningPracticeStudio from '../components/learning/v2/LearningPracticeStudio.vue';
import LearningSpeechButton from '../components/learning/v2/LearningSpeechButton.vue';
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
const bookLayer = ref<'notes' | 'annotation' | 'translation' | 'source'>('notes');
const practiceAnswer = ref<number | null>(null);
const practiceSubmitted = ref(false);
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
const scholarNoteOpen = ref(false);
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
  ['zhouyi', 'divination', 'culture', 'music'].includes(selectedSubjectKey.value),
);
const usesSpecializedLessonWorkbench = computed(() =>
  ['english', 'security', 'culture', 'music', 'zhouyi'].includes(selectedSubjectKey.value),
);
let progressRequestId = 0;
let compactMediaQuery: MediaQueryList | null = null;
let compactMediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let lessonBodyOverflow = '';
let studioBodyOverflow = '';
let mobileSheetBodyOverflow = '';
let railResizeStartX = 0;
let railResizeStartWidth = STUDY_RAIL_DEFAULT_WIDTH;

const subject = computed(() => getLearningV2Subject(selectedSubjectKey.value) || subjects[0]);
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
const chat = useChat();
const agentStore = useAgentStore();
const courses = computed(() => subject.value?.courses || []);
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
const exemplaryNoteMarkdown = computed(() => {
  const outline = lessonSteps.value
    .map((step, index) => `${index + 1}. **${step.title}**：${step.note}`)
    .join('\n');
  const errors = coursePlan.value.commonErrors.map((error) => `- ${error}`).join('\n');
  const sources = coursePlan.value.sourceRefs.map((source) => `- ${source}`).join('\n');
  return [
    `# ${coursePlan.value.title} · 优秀笔记示范`,
    '',
    '## 一句话概括',
    coursePlan.value.plainLanguageGoal,
    '',
    '## 学习结构',
    outline,
    '',
    '## 跟做任务',
    coursePlan.value.guidedPractice,
    '',
    '## 独立产出',
    coursePlan.value.independentPractice,
    '',
    '## 易错点',
    errors,
    '',
    '## 可追溯来源',
    sources,
  ].join('\n');
});
const exemplaryBookNoteMarkdown = computed(() =>
  [
    `# ${subject.value.book.title} · 优秀读书笔记`,
    '',
    '## 原文',
    `> ${subject.value.book.original}`,
    '',
    '## 字词注释',
    ...subject.value.book.notes.map((note) => `- **${note.term}**：${note.text}`),
    '',
    '## 注解',
    subject.value.book.annotation,
    '',
    '## 白话转述',
    subject.value.book.translation,
    '',
    '## 来源',
    subject.value.book.source,
  ].join('\n'),
);
const exemplaryBookAnnotations = computed(() => [
  {
    label: '原文层',
    text: subject.value.book.original,
  },
  {
    label: '字词注释',
    text: subject.value.book.notes.map((note) => `${note.term}：${note.text}`).join('；'),
  },
  {
    label: '章旨注解',
    text: subject.value.book.annotation,
  },
  {
    label: '白话转述',
    text: subject.value.book.translation,
  },
  {
    label: '来源与边界',
    text: subject.value.book.source,
  },
]);
const currentLessonStep = computed(() => lessonSteps.value[lessonStep.value] || lessonSteps.value[0]);
const currentScholarNoteRows = computed(() => {
  const step = currentLessonStep.value;
  if (!step) return [];
  return [
    {
      label: '一句话结论',
      text: step.objective || step.note,
    },
    {
      label: '核心知识',
      text: step.body,
    },
    {
      label: '解题与操作模板',
      text: step.practice || coursePlan.value.guidedPractice,
    },
    {
      label: '高频坑',
      text: coursePlan.value.commonErrors[lessonStep.value % Math.max(1, coursePlan.value.commonErrors.length)]
        || '只记结论，不说明条件和证据。',
    },
    {
      label: '闭卷自测',
      text: step.checkpoint || `合上资料，用三句话解释“${step.note}”。`,
    },
  ];
});
const currentScholarNoteMarkdown = computed(() => {
  const step = currentLessonStep.value;
  const lines = [
    `# ${coursePlan.value.title} · ${step?.title || '学霸笔记'}`,
    '',
    ...currentScholarNoteRows.value.flatMap((row) => [`## ${row.label}`, row.text, '']),
    '## 整章索引',
    ...lessonSteps.value.map((item, index) => `${index + 1}. **${item.title}**：${item.note}`),
    '',
    '## 来源',
    ...coursePlan.value.sourceRefs.map((source) => `- ${source}`),
  ];
  return lines.join('\n');
});
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
    practice: `${subject.value.practice.prompt}。选项：${subject.value.practice.options.join('；')}。`,
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
  practiceAnswer.value = null;
  practiceSubmitted.value = false;
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
  practiceAnswer.value = null;
  practiceSubmitted.value = false;
  return true;
}

function openCourse(name: string) {
  if (selectCourse(name)) selectPage('lesson');
}

function selectPage(page: LearningV2PageKey) {
  if (page === 'lesson' && !courseReady(selectedCourseName.value)) {
    activePage.value = 'overview';
    return;
  }
  activePage.value = page;
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
  selectPage('overview');
  if (!libraryOpen.value) document.body.style.overflow = lessonBodyOverflow;
}

function exitStudio() {
  selectPage('overview');
  if (!libraryOpen.value) document.body.style.overflow = studioBodyOverflow;
}

async function loadProgress() {
  const requestId = ++progressRequestId;
  const targetSubject = subject.value;
  const local = readLocalProgress(targetSubject.key);
  completedCourseIds.value = local;
  try {
    const response = await api.get<{ lessonIds: string[] }>(
      `/learning/lesson-progress?subject=${encodeURIComponent(targetSubject.name)}`,
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
      subject: completedSubject.name,
      lessonIds: [completedCourse.id],
    }).catch(() => { /* local completion remains usable while backend is offline */ });
  }
  selectPage('practice');
}

function openNote(title: string, content: string) {
  noteTitle.value = title;
  noteContent.value = content;
  noteVisible.value = true;
}

function applyScholarNote() {
  openNote(`${coursePlan.value.title} · ${currentLessonStep.value?.title || '学霸笔记'}`, currentScholarNoteMarkdown.value);
  scholarNoteOpen.value = false;
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

function submitPractice() {
  if (practiceAnswer.value == null) return;
  practiceSubmitted.value = true;
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
  if (scholarNoteOpen.value && event.key === 'Escape') {
    scholarNoteOpen.value = false;
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
  if (activePage.value === 'studio' && event.key === 'Tab') {
    const focusable = [...(studioRoot.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]',
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
  if (activePage.value !== 'lesson') return;
  if (event.key === 'ArrowLeft') lessonStep.value = Math.max(0, lessonStep.value - 1);
  if (event.key === 'ArrowRight') lessonStep.value = Math.min(lessonSteps.value.length - 1, lessonStep.value + 1);
}

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
watch(activePage, async (page, previous) => {
  if (page === 'lesson') {
    lessonBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (previous === 'lesson' && !libraryOpen.value) {
    document.body.style.overflow = lessonBodyOverflow;
  }
  if (page === 'studio') {
    studioBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (previous === 'studio' && !libraryOpen.value) {
    document.body.style.overflow = studioBodyOverflow;
  }
  if (page !== previous && workspaceRoot.value) workspaceRoot.value.scrollTop = 0;
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
  window.removeEventListener('keydown', onKeydown);
  if (compactMediaQuery && compactMediaListener) {
    compactMediaQuery.removeEventListener?.('change', compactMediaListener);
    compactMediaQuery.removeListener?.(compactMediaListener);
  }
  compactMediaQuery = null;
  compactMediaListener = null;
  stopStudyRailResize();
  if (activePage.value === 'lesson') document.body.style.overflow = lessonBodyOverflow;
  if (activePage.value === 'studio') document.body.style.overflow = studioBodyOverflow;
  if (mobileSubjectsOpen.value) document.body.style.overflow = mobileSheetBodyOverflow;
});
</script>

<template>
  <div
    v-if="subject"
    class="lv2"
    :class="{ 'subjects-collapsed': subjectsCollapsed, 'is-learning-ai': lead === 'ai', 'is-library-open': libraryOpen }"
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
      v-if="!isCompactLayout"
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
      <header v-if="!isCompactLayout && activePage !== 'lesson' && activePage !== 'studio'" class="lv2-topbar">
        <div class="lv2-subject-trigger">
          <b>{{ subject.name }}</b>
          <span>{{ subject.line }}</span>
        </div>
        <div class="lv2-topbar-actions">
          <LearningSpeechButton :text="narrationText" :compact="true" />
          <button class="lv2-library-button" type="button" aria-label="打开公共图书馆" @click="libraryOpen = true">
            <Library :size="17" /><span>图书馆</span>
          </button>
        </div>
      </header>

      <header v-else-if="activePage !== 'lesson' && activePage !== 'studio'" class="lv2-mobile-topbar">
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
          <button class="lv2-library-button" type="button" aria-label="打开公共图书馆" @click="libraryOpen = true">
            <Library :size="17" /><span>图书馆</span>
          </button>
        </div>
      </header>

      <nav v-if="activePage !== 'lesson' && activePage !== 'studio'" class="lv2-pages" :class="{ mobile: isCompactLayout }" aria-label="学习页面">
        <button
          v-for="page in LEARNING_V2_PAGES"
          :key="page.key"
          type="button"
          :class="{ active: activePage === page.key }"
          :data-page="page.key"
          @click="selectPage(page.key)"
        >
          {{ page.label }}
        </button>
      </nav>

      <div ref="workspaceRoot" class="lv2-workspace" :style="{ '--lv2-study-rail-width': studyRailWidthCss }">
      <section class="lv2-content">
        <div v-if="isCompactLayout && activePage !== 'overview' && activePage !== 'studio'" class="lv2-mobile-pagebar">
          <button data-action="back-to-subject" type="button" @click="selectPage('overview')">
            <ChevronLeft :size="14" />返回学科
          </button>
          <b>{{ currentPageLabel }}</b>
        </div>
        <template v-if="activePage === 'overview'">
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

            <button class="lv2-mobile-library-entry" type="button" @click="libraryOpen = true">
              <span><Library :size="18" /></span>
              <b>图书馆</b>
              <small>小说、名著、漫画与书架</small>
              <ChevronRight :size="16" />
            </button>

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
            <header class="lv2-page-head">
              <div><span>零基础起点</span><h1>{{ subject.name }}</h1><p>{{ subject.line }}</p></div>
              <small>{{ readyCourses.length }} / {{ courses.length }} 门已开放</small>
            </header>
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
          <header class="lv2-page-head">
            <div><h1>课程地图</h1></div>
            <small>{{ readyCourses.length }} 门已开放</small>
          </header>
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

        <template v-else-if="activePage === 'books'">
          <header class="lv2-page-head">
            <div><span>原文与出处</span><h1>书籍研读</h1><p>原文、注释、注解、译文和来源分层显示。</p></div>
            <button v-if="!isCompactLayout" class="lv2-page-back" data-action="back-to-subject" type="button" @click="selectPage('overview')">
              <ChevronLeft :size="14" />返回学科
            </button>
          </header>
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
              <section class="lv2-exemplary-annotation" data-exemplary-annotation>
                <header><span>优秀注解示范</span><h3>五层阅读卡</h3></header>
                <div>
                  <article v-for="layer in exemplaryBookAnnotations" :key="layer.label">
                    <b>{{ layer.label }}</b>
                    <p>{{ layer.text }}</p>
                  </article>
                </div>
              </section>
              <p class="lv2-source">来源：{{ subject.book.source }}</p>
              <button class="lv2-note-button" type="button" @click="openNote(`${subject.book.title} · 优秀读书笔记`, exemplaryBookNoteMarkdown)"><NotebookPen :size="14" />套用优秀读书笔记</button>
            </article>
          </div>
        </template>

        <template v-else-if="activePage === 'lesson'">
          <Teleport to="body">
            <div
              v-if="usesSpecializedLessonWorkbench"
              ref="specializedStudyRoot"
              class="lv2-specialized-study"
              tabindex="-1"
            >
            <header class="lv2-specialized-study-bar">
              <button data-action="exit-lesson" type="button" @click="exitLesson">
                <ChevronLeft :size="16" />返回学习
              </button>
              <b>{{ subject.name }} · 完整课程内容</b>
              <span>{{ selectedCourseName }}</span>
              <button data-action="open-scholar-note" type="button" @click="scholarNoteOpen = true">
                <NotebookPen :size="15" />学霸笔记
              </button>
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
              class="lv2-lesson"
              tabindex="-1"
              data-yz-annotate-id="learning-v2-lesson"
              data-yz-annotate-label="沉浸学习台"
            >
            <header>
              <button class="lv2-lesson-back" data-action="exit-lesson" type="button" @click="exitLesson"><ChevronLeft :size="16" />返回路线</button>
              <b>{{ coursePlan.title }}</b>
              <span>{{ lessonStep + 1 }}/{{ lessonSteps.length }}</span>
              <button class="lv2-lesson-close" type="button" aria-label="关闭课程" @click="exitLesson"><X :size="16" /></button>
            </header>
            <nav><button v-for="(step, index) in lessonSteps" :key="step.title" type="button" :class="{ active: lessonStep === index, done: index < lessonStep }" @click="lessonStep = index">{{ step.title }}</button></nav>
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
              <section v-if="currentLessonStep?.checkpoint" class="lv2-step-check">
                <header><span>完成检查</span><b>合上提示再回答</b></header>
                <p>{{ currentLessonStep.checkpoint }}</p>
              </section>
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
              <section class="lv2-exemplary-note" data-exemplary-note>
                <header>
                  <div><span>优秀笔记示范</span><h2>按“结论—结构—任务—易错点”整理</h2></div>
                  <button type="button" @click="openNote(`${coursePlan.title} · 优秀笔记示范`, exemplaryNoteMarkdown)">
                    <NotebookPen :size="14" />套用示范
                  </button>
                </header>
                <p class="lv2-exemplary-summary">{{ coursePlan.plainLanguageGoal }}</p>
                <ol>
                  <li v-for="(step, index) in lessonSteps" :key="`note-${step.title}`">
                    <span>{{ String(index + 1).padStart(2, '0') }}</span>
                    <div><b>{{ step.title }}</b><small>{{ step.note }}</small></div>
                  </li>
                </ol>
                <div class="lv2-exemplary-bottom">
                  <p><b>完成产出</b>{{ coursePlan.independentPractice }}</p>
                  <p><b>重点避免</b>{{ coursePlan.commonErrors[0] }}</p>
                </div>
              </section>
              <div class="lv2-lesson-actions">
                <LearningSpeechButton
                  :text="`${currentLessonStep?.title || ''}。${currentLessonStep?.body || ''}。${currentLessonStep?.practice || ''}。${currentLessonStep?.checkpoint || ''}。${currentLessonStep?.note || ''}`"
                  label="朗读本步"
                />
                <button data-action="open-scholar-note" type="button" @click="scholarNoteOpen = true"><NotebookPen :size="14" />学霸笔记</button>
                <button type="button" @click="openNote(coursePlan.title, currentLessonStep?.body || '')"><NotebookPen :size="14" />自由笔记</button>
              </div>
            </article>
              <footer><button type="button" :disabled="lessonStep === 0" @click="lessonStep--">上一步</button><button type="button" @click="lessonStep < lessonSteps.length - 1 ? lessonStep++ : finishLesson()">{{ lessonStep < lessonSteps.length - 1 ? '下一步' : '完成本课' }}</button></footer>
            </div>
          </Teleport>
        </template>

        <template v-else-if="activePage === 'studio'">
          <Teleport to="body">
            <div ref="studioRoot" class="lv2-studio-immersive" tabindex="-1">
              <header class="lv2-studio-immersive-bar">
                <button data-action="exit-studio" type="button" @click="exitStudio">
                  <ChevronLeft :size="16" />返回学习
                </button>
                <b>{{ selectedCourseName }}</b>
                <span>实践 · {{ studios.studio.type }}</span>
                <button class="lv2-studio-immersive-close" type="button" aria-label="关闭实践" @click="exitStudio">
                  <X :size="16" />
                </button>
              </header>
              <div class="lv2-studio-immersive-body" :class="{ embedded: usesEmbeddedStudioPractice }">
                <div class="lv2-studio-immersive-content" :class="{ embedded: usesEmbeddedStudioPractice }">
                  <header v-if="!usesEmbeddedStudioPractice" class="lv2-page-head">
                    <div><span>{{ studios.studio.type }}</span><h1>实践</h1><p>当前只保留实践工作区；离开后回到原课程进度。</p></div>
                  </header>
                  <LearningPracticeStudio
                    :subject-key="selectedSubjectKey"
                    :course-name="selectedCourseName"
                    :practice="studios"
                    @goto-lesson="selectPage('lesson')"
                  />
                </div>
              </div>
            </div>
          </Teleport>
        </template>

        <template v-else-if="activePage === 'practice'">
          <header class="lv2-page-head">
            <div><span>{{ subject.practice.focus }}</span><h1>练习测评</h1><p>先解释，再选择；错因进入复习队列。</p></div>
            <button v-if="!isCompactLayout" class="lv2-page-back" data-action="back-to-subject" type="button" @click="selectPage('overview')">
              <ChevronLeft :size="14" />返回学科
            </button>
          </header>
          <article class="lv2-quiz">
            <h2>{{ subject.practice.prompt }}</h2>
            <button v-for="(option, index) in subject.practice.options" :key="option" type="button" :disabled="practiceSubmitted" :aria-pressed="practiceAnswer === index" :class="{ picked: practiceAnswer === index, correct: practiceSubmitted && index === subject.practice.answer, wrong: practiceSubmitted && practiceAnswer === index && index !== subject.practice.answer }" @click="practiceAnswer = index">
              <span>{{ String.fromCharCode(65 + index) }}</span>{{ option }}<Check v-if="practiceSubmitted && index === subject.practice.answer" :size="15" />
            </button>
            <p v-if="practiceSubmitted">{{ subject.practice.explanation }}</p>
            <button type="button" :disabled="practiceAnswer == null || practiceSubmitted" @click="submitPractice">提交判断</button>
          </article>
        </template>

        <template v-else-if="activePage === 'review'">
          <header class="lv2-page-head"><div><span>主动提取</span><h1>复习巩固</h1><p>按到期、薄弱和最近出错排序。</p></div></header>
          <div class="lv2-stats"><div><b>{{ subject.review.due }}</b><span>今日到期</span></div><div><b>{{ subject.review.mastery }}%</b><span>掌握度</span></div><div><b>7</b><span>连续天数</span></div></div>
          <div class="lv2-review"><div v-for="(item, index) in subject.review.items" :key="item"><i>{{ String(index + 1).padStart(2, '0') }}</i><b>{{ item }}</b><button type="button" @click="selectPage('practice')">复习</button></div></div>
        </template>

        <template v-else>
          <header class="lv2-page-head"><div><span>苏格拉底式追问</span><h1>AI 陪练</h1><p>只使用当前科目、课程和引用材料。</p></div></header>
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
        v-if="!isCompactLayout && activePage !== 'lesson' && activePage !== 'studio'"
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

    <Teleport to="body">
      <div
        v-if="scholarNoteOpen"
        class="lv2-scholar-mask"
        :style="{ '--lv2-accent': subject.accent, '--lv2-tint': subject.tint }"
        @click.self="scholarNoteOpen = false"
      >
        <aside class="lv2-scholar-panel" data-scholar-note-panel role="dialog" aria-modal="true" aria-labelledby="lv2-scholar-title">
          <header>
            <div>
              <span>{{ coursePlan.title }} · 第 {{ lessonStep + 1 }} / {{ lessonSteps.length }} 步</span>
              <h2 id="lv2-scholar-title">{{ currentLessonStep?.title }}</h2>
            </div>
            <button type="button" aria-label="关闭学霸笔记" @click="scholarNoteOpen = false"><X :size="17" /></button>
          </header>
          <div class="lv2-scholar-body">
            <article v-for="row in currentScholarNoteRows" :key="row.label">
              <b>{{ row.label }}</b>
              <p>{{ row.text }}</p>
            </article>
            <section class="lv2-scholar-chapter">
              <b>整章索引</b>
              <ol>
                <li v-for="(item, index) in lessonSteps" :key="`scholar-${item.title}`">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <div><b>{{ item.title }}</b><small>{{ item.note }}</small></div>
                </li>
              </ol>
            </section>
          </div>
          <footer>
            <button type="button" @click="applyScholarNote"><NotebookPen :size="14" />套用到我的笔记</button>
          </footer>
        </aside>
      </div>
    </Teleport>

    <NoteQuickCreateDialog v-model:visible="noteVisible" :title="noteTitle" :content="noteContent" category-name="学习" />
  </div>
</template>

<style scoped src="./learning-v2.css"></style>
