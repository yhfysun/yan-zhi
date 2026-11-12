<script setup lang="ts">
// 学习模式工作区（learning 模式主界面）。
// 布局契约：三栏骨架**任何 Tab 下都不变**（左=课程 / 中=工作区 / 右=状态）——
// 此前 Tab 切换时中栏整块换布局导致"样式跳来跳去"，已废弃。
// 选中课程后关卡地图直接出现在中栏（此前藏在左栏滚动区外，用户感知"点了没用"）。
// 科目架构：科目分段预留（日语/数学/物理筹备中），课程目录按科目过滤（服务端 ?subject=）。
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, History, Keyboard, Lightbulb, LoaderCircle, MapPin, Mic, MicOff, Target, Volume2, X } from 'lucide-vue-next';
import { api } from '../api/client';
import { useChatStore } from '../stores/chat';
import { usePlatformStore } from '../stores/platform';
import { setMode, activeMode } from '../stores/mode';
import LearnStage from '../components/learning/LearnStage.vue';
import ExamTrainer from '../components/learning/ExamTrainer.vue';
import CyberSecurityWorkbench from '../components/learning/CyberSecurityWorkbench.vue';
import SubjectPicker from '../components/learning/SubjectPicker.vue';
import LearningAvatarPicker from '../components/learning/LearningAvatarPicker.vue';
import EnglishPathWorkbench from '../components/learning/EnglishPathWorkbench.vue';
import GrammarWorkbench from '../components/learning/GrammarWorkbench.vue';
import SceneResultCard from '../components/chat/SceneResultCard.vue';
import { extractSceneResultBlocks, stripSceneResultBlocks } from '../utils/scene-result';

/** ★ 与 apps/server/src/builtin-learning-agents.ts 的 LEARNING_AGENT_ID 成对维护（服务端有契约单测） */
const LEARNING_AGENT_ID = 'a_builtin_learning_coach';

const chat = useChatStore();

/** api.get/post 返回 ApiError | { data }：统一收窄取 data（失败给 null，页面走静默降级） */
function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

// ── 数据 ──
type Profile = { cefr: string | null; goals: string | null; streakDays?: number };
type Book = { id: string; name: string; kind: string; course: string; subject?: string; wordCount: number; levelCount: number; maxLevelCleared: number; dueCount?: number };
type Level = { levelNo: number; wordCount: number; stars: number; passed: boolean; unlocked: boolean; dueCount: number };
type Question = { kind: 'choice' | 'spelling' | 'dictation' | 'cloze'; qid: string; wordId: string; prompt: string; phonetic?: string | null; options?: string[]; hint?: string; gloss?: string; audio?: string };
type AnswerFeedback = { correct: boolean; word: string; expected: string; gloss: string; explanation: string };
type DrillResult = { correct: number; total: number; stars: number; passed: boolean; pct: number; results: Array<{ qid: string; word: string; correct: boolean; expected: string; given?: string | null }> };
type ErrorRow = { id: string; wrong: string; right: string; reason: string | null };

const profile = ref<Profile>({ cefr: null, goals: null, streakDays: 0 });
const books = ref<Book[]>([]);
const errors = ref<ErrorRow[]>([]);
const activeBook = ref<Book | null>(null);
const levels = ref<Level[]>([]);
const loading = ref(true);

// ── 科目（服务端清单驱动：以后加科目只改服务端 curriculum.ts，UI 自动出现）──
type SubjectDef = { key: string; label: string; ready: boolean };
const SUBJECTS = ref<SubjectDef[]>([{ key: '英语', label: '英语', ready: true }]);
const subject = ref<string>('英语');
const softExamSpecialty = ref('');
type SoftKnowledgeDomain = { title: string; chapters: string[] };
type SoftOfficialBook = {
  kind: '考试大纲' | '教程' | '试题解析';
  title: string;
  publisher: string;
  isbn: string;
  officialUrl: string;
  note: string;
};
type SoftFreeResource = {
  id: string;
  title: string;
  kind: '官方入口' | '开源题库' | '开源笔记' | '视频检索';
  provider: string;
  url: string;
  license: string;
  description: string;
  howToUse: string;
};
type SoftMaterial = {
  id: string; title: string; level: '中级' | '高级'; specialty: string;
  yearRange: string; description: string; fileName: string;
  format: 'markdown'; chapterCount: number; knowledgeDomains: SoftKnowledgeDomain[];
  books: SoftOfficialBook[]; freeResources: SoftFreeResource[];
  officialBooksUrl: string; coverageNote: string;
};
const softMaterials = ref<SoftMaterial[]>([]);
const securityPathId = ref('');
const securityFocusing = ref(false);
const pathFocusing = ref(false);
const grammarFocusing = ref(false);
type SoftRegion = { name: string; officialUrl: string; registrationUrl: string };
type SoftLiveNotice = { title: string; url: string; source: '全国' | '地区' };
type SoftLiveInfo = {
  region: string; registrationUrl: string; officialUrl: string; nationalUrl: string;
  fetchedAt: number; status: 'live' | 'partial' | 'fallback'; notices: SoftLiveNotice[];
};
const softRegions = ref<SoftRegion[]>([]);
const softExamRegion = ref('北京');
const softExamSession = ref('');
const softExamDate = ref('');
const softRegistrationDeadline = ref('');
const softSideTab = ref<'exam' | 'materials' | 'knowledge'>('exam');
const softLiveInfo = ref<SoftLiveInfo | null>(null);
const softLiveLoading = ref(false);
const softLiveError = ref('');
const SOFT_PLAN_KEY = 'yz_soft_exam_plan_v1';
const visibleSoftMaterials = computed(() => {
  if (!softExamSpecialty.value || softExamSpecialty.value === '全部') return softMaterials.value;
  return softMaterials.value.filter((m) => m.specialty === softExamSpecialty.value);
});
const focusedSoftMaterial = computed(() => visibleSoftMaterials.value[0] || null);
const softSessionOptions = computed(() => {
  const now = new Date();
  const year = now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;
  return [`${year}年上半年`, `${year}年下半年`, `${year + 1}年上半年`, `${year + 1}年下半年`];
});
const softDaysToExam = computed(() => {
  if (!softExamDate.value) return null;
  const target = new Date(`${softExamDate.value}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
});
const softCountdownText = computed(() => {
  if (softDaysToExam.value == null) return '选择考试日期后生成倒计时';
  if (softDaysToExam.value < 0) return '考试日期已过，请更新';
  if (softDaysToExam.value === 0) return '今天考试';
  return `距考试 ${softDaysToExam.value} 天`;
});
const softKnowledgePoints = computed(() => {
  const description = visibleSoftMaterials.value[0]?.description || '';
  return description.split(/[；;]/)[0].split('、').map((item) => item.trim()).filter(Boolean);
});
const softStudyPlan = computed(() => {
  if (!softExamDate.value) return [];
  const days = Math.max(1, softDaysToExam.value ?? 1);
  const weekCount = Math.min(12, Math.max(1, Math.ceil(days / 7)));
  const points = softKnowledgePoints.value.length ? softKnowledgePoints.value : ['综合知识', '上机实操', '错题复盘'];
  return Array.from({ length: weekCount }, (_, index) => {
    const start = new Date(`${softExamDate.value}T00:00:00`);
    start.setDate(start.getDate() - (weekCount - index) * 7);
    const focus = points[index % points.length];
    return {
      week: index + 1,
      date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      title: `第 ${index + 1} 周 · ${focus}`,
      task: index === 0 ? '梳理知识点 + 20 道客观题' : index === weekCount - 1 ? '整套模考 + 上机题复盘' : `复习 ${focus} + 20 道题 + 1 道上机`,
    };
  });
});
function softPlanStorageValue() {
  return {
    region: softExamRegion.value,
    session: softExamSession.value,
    examDate: softExamDate.value,
    registrationDeadline: softRegistrationDeadline.value,
  };
}
function restoreSoftPlan() {
  try {
    const raw = localStorage.getItem(SOFT_PLAN_KEY);
    if (!raw) {
      softExamSession.value = softSessionOptions.value[0];
      return;
    }
    const saved = JSON.parse(raw) as Partial<ReturnType<typeof softPlanStorageValue>>;
    if (saved.region) softExamRegion.value = saved.region;
    if (saved.session) softExamSession.value = saved.session;
    if (saved.examDate) softExamDate.value = saved.examDate;
    if (saved.registrationDeadline) softRegistrationDeadline.value = saved.registrationDeadline;
  } catch { /* ignore */ }
}
function persistSoftPlan() {
  try { localStorage.setItem(SOFT_PLAN_KEY, JSON.stringify(softPlanStorageValue())); } catch { /* ignore */ }
}
async function loadSoftExamRegions() {
  const r = await api.get<{ data: SoftRegion[] }>('/learning/soft-exam/regions');
  softRegions.value = unwrap<SoftRegion[]>(r) || [];
  if (!softRegions.value.some((item) => item.name === softExamRegion.value)) {
    softExamRegion.value = softRegions.value[0]?.name || '北京';
  }
}
async function loadSoftExamLive() {
  if (!softExamRegion.value) return;
  softLiveLoading.value = true;
  softLiveError.value = '';
  softLiveInfo.value = null;
  try {
    const r = await api.get<{ data: SoftLiveInfo }>(`/learning/soft-exam/live?region=${encodeURIComponent(softExamRegion.value)}`);
    softLiveInfo.value = unwrap<SoftLiveInfo>(r);
  } catch (e) {
    softLiveError.value = e instanceof Error ? e.message : '官方动态获取失败';
  } finally {
    softLiveLoading.value = false;
  }
}
function openOfficialUrl(url: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
function icsDate(value: string) {
  return value.replace(/-/g, '');
}
function icsEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function downloadExamReminder() {
  if (!softExamDate.value) {
    ElMessage.warning('请先选择考试日期');
    return;
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YanZhi//Soft Exam Planner//CN', 'CALSCALE:GREGORIAN',
  ];
  const event = (uid: string, date: string, title: string, description: string, alarmDays: number[] = []) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@yanzhi.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(date)}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
    );
    for (const days of alarmDays) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-P${days}D`, `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  };
  const specialty = visibleSoftMaterials.value[0]?.specialty || softExamRegion.value;
  if (softRegistrationDeadline.value) {
    event('registration-deadline', softRegistrationDeadline.value, `软考报名截止 · ${specialty}`, `地区：${softExamRegion.value}`, [7, 1]);
  }
  event('soft-exam', softExamDate.value, `软考考试 · ${specialty}`, `地区：${softExamRegion.value} · ${softExamSession.value}`, [30, 7, 1]);
  for (const plan of softStudyPlan.value) {
    event(`study-${plan.week}`, plan.date, plan.title, plan.task);
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `软考-${softExamRegion.value}-${softExamDate.value}-提醒.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
async function showRegistrationGuide() {
  const specialty = visibleSoftMaterials.value[0]?.specialty || '软考';
  const live = softLiveInfo.value;
  const latest = live?.notices.slice(0, 3).map((item) => `· ${item.title}`).join('\n') || '· 请先刷新官方动态';
  const guide = [
    `${softExamRegion.value} · ${specialty} · ${softExamSession.value}`,
    `考试日期：${softExamDate.value || '未设置'}`,
    `报名截止：${softRegistrationDeadline.value || '未设置'}`,
    '',
    '报名前检查：',
    '1. 身份证件、学历/工作年限证明、符合要求的电子照片',
    '2. 核对所选地区报名条件与属地要求',
    '3. 登录官方报名入口，本人完成信息填报、资格审核与缴费',
    '',
    '最新官方动态：',
    latest,
    '',
    '安全说明：验证码、支付和最终提交必须由本人操作，AI 不代填敏感身份信息。',
  ].join('\n');
  try { await navigator.clipboard?.writeText(guide); } catch { /* clipboard may be unavailable */ }
  await ElMessageBox.alert(guide, 'AI 报名检查清单', {
    confirmButtonText: '打开官方报名入口',
    cancelButtonText: '关闭',
    showCancelButton: true,
    customStyle: { whiteSpace: 'pre-wrap', maxWidth: '560px' },
  }).then(() => openOfficialUrl(live?.registrationUrl || 'https://bm.ruankao.org.cn/sign/welcome')).catch(() => {});
}
const softMaterialLoading = ref('');
async function loadSoftMaterials() {
  const r = await api.get<{ data: SoftMaterial[] }>('/learning/soft-exam/materials');
  softMaterials.value = unwrap<SoftMaterial[]>(r) || [];
}
async function downloadSoftMaterial(material: SoftMaterial) {
  if (softMaterialLoading.value) return;
  softMaterialLoading.value = material.id;
  try {
    const r = await api.get<{ data: SoftMaterial & { content: string } }>(`/learning/soft-exam/materials/${encodeURIComponent(material.id)}`);
    const detail = unwrap<SoftMaterial & { content: string }>(r);
    if (!detail) throw new Error('资料内容为空');
    const fileName = detail.fileName || material.fileName;
    const saveDirect = (window as any).electronAPI?.softExam?.saveMaterial as
      | ((name: string, content: string) => Promise<{ ok: boolean; path?: string; error?: string }>)
      | undefined;
    if (saveDirect) {
      const saved = await saveDirect(fileName, detail.content);
      if (!saved?.ok || !saved.path) throw new Error(saved?.error || '保存失败');
      ElMessage.success({ message: `已保存到 ${saved.path}`, duration: 4500 });
      return;
    }
    const blob = new Blob([detail.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('学习清单已交给浏览器下载');
  } catch (e) {
    ElMessage.error(e instanceof Error ? `下载失败：${e.message}` : '下载失败');
  } finally {
    softMaterialLoading.value = '';
  }
}
async function loadSubjects() {
  const r = await api.get<SubjectDef[]>('/learning/subjects');
  const list = unwrap<SubjectDef[]>(r);
  if (list?.length) SUBJECTS.value = list;
}
async function switchSubject(key: string) {
  if (!SUBJECTS.value.find((s) => s.key === key)?.ready) return;
  const wasSoft = subject.value === '软考';
  const wasSecurity = subject.value === '网络安全';
  subject.value = key;
  activeBook.value = null;
  levels.value = [];
  if (key === '软考') {
    tab.value = 'exam';
    softSideTab.value = 'exam';
    rightCollapsed.value = false;
    rightWidth.value = Math.max(rightWidth.value, 360);
    void loadSoftMaterials();
    void loadSoftExamRegions();
    void loadSoftExamLive();
  } else if (wasSoft) {
    tab.value = 'path';
  } else if (key === '网络安全') {
    tab.value = 'security';
    securityFocusing.value = false;
  } else if (wasSecurity) {
    tab.value = 'path';
    securityFocusing.value = false;
  }
  pathFocusing.value = false;
  grammarFocusing.value = false;
  await loadCourses();
}
// ── 工作区 Tab：陪练对话 / 闯关 / 词汇表 / 场景 / 语法 / 阅读（只切中栏内容，骨架不动）──
const tab = ref<'path' | 'coach' | 'drill' | 'words' | 'scenes' | 'grammar' | 'reading' | 'exam' | 'security'>('path');
const leftWidth = ref(300);
const rightWidth = ref(280);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
let stopColumnResize: (() => void) | null = null;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function startColumnResize(side: 'left' | 'right', event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  stopColumnResize?.();
  const startX = event.clientX;
  const startWidth = side === 'left' ? leftWidth.value : rightWidth.value;
  const onMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    if (side === 'left') leftWidth.value = clamp(startWidth + delta, 220, 520);
    else rightWidth.value = clamp(startWidth - delta, 240, 520);
  };
  const onUp = () => stopColumnResize?.();
  stopColumnResize = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    stopColumnResize = null;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}
const gridStyle = computed(() => {
  if (subject.value === '网络安全') {
    return {
      '--lp-left-w': '0px',
      '--lp-right-w': '0px',
    } as Record<string, string>;
  }
  const rightVisibleWidth = rightCollapsed.value
    ? 0
    : tab.value === 'coach' && !coachHistoryOpen.value
      ? 44
      : rightWidth.value;
  return {
    '--lp-left-w': `${leftCollapsed.value ? 0 : leftWidth.value}px`,
    '--lp-right-w': `${rightVisibleWidth}px`,
  } as Record<string, string>;
});
const gridClasses = computed(() => ({
  'coach-mode': tab.value === 'coach',
  'history-collapsed': tab.value === 'coach' && !coachHistoryOpen.value,
  'left-collapsed': leftCollapsed.value,
  'right-collapsed': rightCollapsed.value,
  'security-workspace': subject.value === '网络安全',
}));
const ENGLISH_TAB_DEFS = [
  { key: 'path', label: '零基础主线' },
  { key: 'drill', label: '单词闯关' },
  { key: 'coach', label: '陪练对话' },
  { key: 'words', label: '词汇表' },
  { key: 'scenes', label: '场景卡' },
  { key: 'grammar', label: '语法微课' },
  { key: 'reading', label: '范文阅读' },
  { key: 'exam', label: '历年真题' },
] as const;
const SOFT_TAB_DEFS = [{ key: 'exam', label: '软考备考' }] as const;
const SECURITY_TAB_DEFS = [{ key: 'security', label: '安全路线' }] as const;
const tabDefs = computed(() => subject.value === '软考'
  ? SOFT_TAB_DEFS
  : subject.value === '网络安全'
    ? SECURITY_TAB_DEFS
    : ENGLISH_TAB_DEFS);
function switchTab(k: typeof tab.value) {
  tab.value = k;
  if (k === 'coach') void ensureCoachConv(); // 复用/创建陪练会话（不跳路由，内嵌对话）
  if (k === 'words' && activeBook.value) void loadBookWords(true);
  if (k === 'scenes') void ensureSceneCourse();
  if (k === 'reading' && !readings.value.length) loadReadings();
}

async function loadAll() {
  loading.value = true;
  try {
    const [p, b, e] = await Promise.all([
      api.get<{ data: Profile }>('/learning/profile'),
      api.get<{ data: Book[] }>('/learning/books'),
      api.get<{ data: ErrorRow[] }>('/learning/errors'),
    ]);
    const pv = unwrap<Profile>(p);
    const bv = unwrap<Book[]>(b);
    const ev = unwrap<ErrorRow[]>(e);
    if (pv) profile.value = pv;
    if (bv) books.value = bv;
    if (ev) errors.value = ev;
    await loadCourses();
    await loadDueCount();
  } catch { /* 后端未就绪时静默，页面仍可渲染骨架 */ }
  loading.value = false;
}

// ── 课程地图（P1-D）：学段分组，点课即选中（关卡出现在中栏）──
type CourseView = {
  id: string; name: string; stage: string; bookId: string; bookName: string;
  wordCount: number; levelCount: number; clearedLevels: number; totalLevels: number;
  dueCount: number; progressPct: number; kind: 'vocab' | 'exam' | 'security';
  examLevel?: '中级' | '高级'; examSpecialty?: string;
  securityPathId?: string;
};
type CourseGroup = { stage: string; courses: CourseView[] };
const courses = ref<CourseGroup[]>([]);
const activeCourseId = ref('');
async function loadCourses() {
  const requestedSubject = subject.value;
  const r = await api.get<{ data: CourseGroup[] }>(`/learning/courses?subject=${encodeURIComponent(requestedSubject)}`);
  // 快速切换科目时，旧请求晚到不能覆盖新科目课程目录。
  if (subject.value !== requestedSubject) return;
  courses.value = unwrap<CourseGroup[]>(r) || [];
  if (subject.value === '软考') {
    const options = courses.value.flatMap((g) => g.courses).filter((c) => c.kind === 'exam');
    if (!softExamSpecialty.value || !options.some((c) => c.examSpecialty === softExamSpecialty.value)) {
      softExamSpecialty.value = options[0]?.examSpecialty || '全部';
    }
  }
  if (subject.value === '网络安全') {
    const options = courses.value.flatMap((g) => g.courses).filter((c) => c.kind === 'security');
    if (!securityPathId.value || !options.some((c) => c.securityPathId === securityPathId.value)) {
      securityPathId.value = options[0]?.securityPathId || '';
    }
  }
  if (!sceneCourseId.value) {
    sceneCourseId.value = activeCourseId.value || courses.value[0]?.courses[0]?.id || '';
  }
  if (tab.value === 'scenes' && sceneCourseId.value) void loadScenes();
}
function openCourse(c: CourseView) {
  if (c.kind === 'exam') {
    softExamSpecialty.value = c.examSpecialty || '全部';
    tab.value = 'exam';
    return;
  }
  if (c.kind === 'security') {
    securityPathId.value = c.securityPathId || '';
    tab.value = 'security';
    return;
  }
  // 选中课程 → 中栏立即出现该课关卡地图（修"点了没用"）；
  // 但用户正在词汇表通读时保持当前 Tab（换书词汇表跟着换，不把人踢回闯关）
  if (tab.value !== 'words' && tab.value !== 'scenes') tab.value = 'drill';
  activeCourseId.value = c.id;
  sceneCourseId.value = c.id;
  if (tab.value === 'scenes') void loadScenes();
  void openBook({ id: c.bookId, name: c.bookName, kind: 'builtin', course: c.name, wordCount: c.wordCount, levelCount: c.totalLevels, maxLevelCleared: c.clearedLevels, dueCount: c.dueCount }, c.id);
}
const customBooks = computed(() => books.value.filter((b) => b.kind === 'custom' && (b.subject || '英语') === subject.value));

// ── 闯关状态 ──
const drillLevel = ref<number | null>(null);
const questions = ref<Question[]>([]);
/** 听写题需要可用的朗读能力：本地语音包或浏览器/Electron 系统语音均可。 */
const canReadAloud = computed(() =>
  !!ttsPackId.value || (typeof window !== 'undefined' && 'speechSynthesis' in window),
);
const activeQuestions = computed(() => (canReadAloud.value ? questions.value : questions.value.filter((q) => q.kind !== 'dictation')));
const answers = ref<Record<string, string>>({}); // qid → 选项/输入
const submitting = ref(false);
const result = ref<DrillResult | null>(null);
const feedback = ref<Record<string, AnswerFeedback>>({});
const revealedAnswer = ref<Record<string, boolean>>({});
const checking = ref(false);

// ── 单题聚焦模式（对标 Duolingo：一次只答一题 + 进度条，替代 10 题平铺长列表）──
const qIndex = ref(0);
const currentQ = computed(() => activeQuestions.value[qIndex.value] ?? null);
const answeredCount = computed(() => activeQuestions.value.filter((q) => String(answers.value[q.qid] ?? '').trim() !== '').length);
const completedCount = computed(() => activeQuestions.value.filter((q) => !!feedback.value[q.qid]).length);
const correctCount = computed(() => activeQuestions.value.filter((q) => feedback.value[q.qid]?.correct).length);
const liveScore = computed(() => Math.round((correctCount.value / Math.max(1, activeQuestions.value.length)) * 100));
const currentFeedback = computed(() => currentQ.value ? feedback.value[currentQ.value.qid] ?? null : null);
const isAnswerRevealed = computed(() => currentQ.value ? !!revealedAnswer.value[currentQ.value.qid] : false);
function isAnswered(q: Question): boolean {
  return String(answers.value[q.qid] ?? '').trim() !== '';
}
function isChecked(q: Question): boolean {
  return !!feedback.value[q.qid];
}
const KIND_LABELS: Record<Question['kind'], string> = { choice: '选释义', spelling: '拼写', dictation: '听写', cloze: '例句填空' };
function goQ(delta: number) {
  qIndex.value = Math.max(0, Math.min(activeQuestions.value.length - 1, qIndex.value + delta));
}
function selectOption(opt: string) {
  if (!currentQ.value || isChecked(currentQ.value)) return;
  answers.value[currentQ.value.qid] = opt;
}
function goNextIncomplete() {
  const i = activeQuestions.value.findIndex((q) => !feedback.value[q.qid]);
  if (i >= 0) qIndex.value = i;
}
function toggleAnswerReveal() {
  if (!currentQ.value) return;
  revealedAnswer.value = {
    ...revealedAnswer.value,
    [currentQ.value.qid]: !revealedAnswer.value[currentQ.value.qid],
  };
}
/** 回车先确认当前题；已确认后按顺序推进，全部完成才交卷。 */
function nextOrSubmit() {
  const q = currentQ.value;
  if (!q) return;
  if (!isChecked(q)) { void checkCurrentAnswer(); return; }
  if (qIndex.value < activeQuestions.value.length - 1) { goQ(1); return; }
  if (completedCount.value >= activeQuestions.value.length) {
    if (reviewMode.value) void submitReview(); else void submitDrill();
  } else {
    goNextIncomplete();
  }
}
// 听写题自动念一遍（进入题目即播，不用手点）；输入框每题自动聚焦
const focusInput = ref<HTMLInputElement | null>(null);
watch(qIndex, async () => {
  const q = currentQ.value;
  if (q?.kind === 'dictation' && canReadAloud.value) void speak(q.audio || '');
  await nextTick();
  focusInput.value?.focus();
});

async function openBook(book: Book, courseId = '') {
  activeCourseId.value = courseId;
  activeBook.value = book;
  drillLevel.value = null;
  result.value = null;
  feedback.value = {};
  revealedAnswer.value = {};
  reviewMode.value = false;
  levelPage.value = 0;
  await loadLevelsForBook(book);
  if (tab.value === 'words') void loadBookWords(true); // 换书后词汇表跟着换（修"词汇表还是上一本的"）
}
async function loadLevelsForBook(book: Book) {
  const r = await api.get<{ data: Level[] }>(`/learning/books/${book.id}/levels`);
  levels.value = unwrap<Level[]>(r) || [];
}

// ── 词汇表（全量浏览：分页 + 中英搜索，修"看不全/不完整"）──
type BookWordRow = { word: string; phonetic: string | null; gloss: string; example: string | null };
type BookWordsPage = { total: number; page: number; size: number; words: BookWordRow[] };
const WORD_PAGE_SIZE = 50;
const wordRows = ref<BookWordRow[]>([]);
const wordTotal = ref(0);
const wordPage = ref(0);
const wordQ = ref('');
const wordLoading = ref(false);
const wordPageCount = computed(() => Math.max(1, Math.ceil(wordTotal.value / WORD_PAGE_SIZE)));
async function loadBookWords(reset = false) {
  if (!activeBook.value) return;
  if (reset) { wordPage.value = 0; }
  wordLoading.value = true;
  try {
    const r = await api.get<{ data: BookWordsPage }>(
      `/learning/books/${activeBook.value.id}/words?page=${wordPage.value}&size=${WORD_PAGE_SIZE}&q=${encodeURIComponent(wordQ.value)}`,
    );
    const p = unwrap<BookWordsPage>(r);
    if (p) { wordRows.value = p.words; wordTotal.value = p.total; }
  } catch { /* 静默：保留上一页数据 */ }
  wordLoading.value = false;
}
function setWordPage(delta: number) {
  wordPage.value = Math.max(0, Math.min(wordPageCount.value - 1, wordPage.value + delta));
  void loadBookWords();
}

/** 删除自定义词单（确认后连词与闯关进度一起清；内置课程无此按钮不可删） */
async function removeBook(b: Book, ev: Event) {
  ev.stopPropagation();
  try {
    await ElMessageBox.confirm(`删除词单「${b.name}」？里面的单词和闯关进度会一起清掉，不可恢复。`, '删除词单', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
  } catch { return; }
  try {
    const r = await api.delete<{ data: unknown }>(`/learning/books/${b.id}`);
    if (r && 'error' in (r as object)) { ElMessage.error(String((r as { error: string }).error)); return; }
    ElMessage.success('词单已删除');
    if (activeBook.value?.id === b.id) { activeBook.value = null; levels.value = []; drillLevel.value = null; }
    await loadAll();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  }
}

// ── 关卡分页（全量词书可达 200 关：整页铺开不可用，按 12 关一页翻）──
const LEVEL_PAGE_SIZE = 12;
const levelPage = ref(0);
const levelPageCount = computed(() => Math.max(1, Math.ceil(levels.value.length / LEVEL_PAGE_SIZE)));
const pagedLevels = computed(() => levels.value.slice(levelPage.value * LEVEL_PAGE_SIZE, (levelPage.value + 1) * LEVEL_PAGE_SIZE));
function setLevelPage(delta: number) {
  levelPage.value = Math.max(0, Math.min(levelPageCount.value - 1, levelPage.value + delta));
}

async function startDrill(levelNo: number) {
  if (!activeBook.value) return;
  const r = await api.get<{ data: { questions: Question[] } }>(`/learning/books/${activeBook.value.id}/levels/${levelNo}/drill`);
  questions.value = unwrap<{ questions: Question[] }>(r)?.questions || [];
  answers.value = {};
  feedback.value = {};
  revealedAnswer.value = {};
  result.value = null;
  drillLevel.value = levelNo;
  qIndex.value = 0;
}

// ── 建词书（手动 / AI 收词 / URL 导入共用表单）──
const showCreate = ref(false);
const bookName = ref('');
const bookText = ref('');

async function submitDrill() {
  if (!activeBook.value || drillLevel.value == null || submitting.value) return;
  submitting.value = true;
  try {
    const payloadAnswers = activeQuestions.value.map((q) => ({
      qid: q.qid, kind: q.kind,
      picked: q.kind === 'choice' ? answers.value[q.qid] : undefined,
      typed: q.kind === 'choice' ? undefined : answers.value[q.qid],
    }));
    const r = await api.post<{ data: DrillResult }>(
      `/learning/books/${activeBook.value.id}/levels/${drillLevel.value}/drill/submit`,
      { questions: activeQuestions.value, answers: payloadAnswers },
    );
    const graded = unwrap<DrillResult>(r);
    if (!graded) return;
    result.value = graded;
    react(graded); // 形象反应：过关跳一跳 / 没过歪头看
    const book = activeBook.value;
    await loadLevelsForBook(book); // 只刷新关卡数据，不能把刚拿到的成绩卡清掉
    drillLevel.value = null;
    questions.value = [];
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '交卷失败');
  } finally {
    submitting.value = false;
  }
}

/** 逐题确认：服务端握答案，返回对错、正确答案与解析；确认后才计入实时分数。 */
async function checkCurrentAnswer() {
  const q = currentQ.value;
  if (!q || checking.value || isChecked(q) || !isAnswered(q)) return;
  checking.value = true;
  try {
    const answer = {
      qid: q.qid,
      kind: q.kind,
      picked: q.kind === 'choice' ? answers.value[q.qid] : undefined,
      typed: q.kind === 'choice' ? undefined : answers.value[q.qid],
    };
    const r = await api.post<{ data: AnswerFeedback }>('/learning/answer/check', {
      question: q,
      answer,
      bookId: activeBook.value?.id,
      review: reviewMode.value,
    });
    const checked = unwrap<AnswerFeedback>(r);
    if (!checked) throw new Error('判题结果为空');
    feedback.value = { ...feedback.value, [q.qid]: checked };
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '判题失败，请重试');
  } finally {
    checking.value = false;
  }
}

async function createBook() {
  const words = bookText.value.split('\n')
    .map((l) => l.split('|').map((s) => s.trim()))
    .filter((p) => p[0] && p[1])
    .map((p) => ({ word: p[0], gloss: p[1], example: p[2] }));
  if (!bookName.value.trim() || !words.length) return;
  const r = await api.post<{ data: { id: string } }>('/learning/books', { name: bookName.value.trim(), subject: subject.value, words });
  const created = unwrap<{ id: string }>(r);
  showCreate.value = false;
  bookName.value = '';
  bookText.value = '';
  await loadAll();
  const book = books.value.find((b) => b.id === created?.id);
  if (book) await openBook(book);
}

// AI 收词：粘贴文章 → LLM 抽词补释义 → 直接建词书
const extractText = ref('');
const extracting = ref(false);
async function extractAndCreate() {
  if (extracting.value || !bookName.value.trim() || extractText.value.trim().length < 10) return;
  extracting.value = true;
  try {
    const r = await api.post<{ data: Array<{ word: string; gloss: string; phonetic?: string; example?: string }> }>(
      '/learning/words/extract', { text: extractText.value },
    );
    const words = unwrap<Array<{ word: string; gloss: string; phonetic?: string; example?: string }>>(r) || [];
    if (!words.length) return;
    const created = unwrap<{ id: string }>(
      await api.post<{ data: { id: string } }>('/learning/books', { name: bookName.value.trim(), subject: subject.value, words }),
    );
    extractText.value = '';
    showCreate.value = false;
    bookName.value = '';
    await loadAll();
    const book = books.value.find((b) => b.id === created?.id);
    if (book) await openBook(book);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  } finally {
    extracting.value = false;
  }
}

// 词书内容包 URL 导入（方案 §2.3 词书来源三档之「下载」）
const importUrl = ref('');
const importing = ref(false);
async function importBookUrl() {
  if (importing.value || !importUrl.value.startsWith('http')) return;
  importing.value = true;
  try {
    const r = await api.post<{ data: { id: string; name: string; wordCount: number } }>('/learning/books/import', { url: importUrl.value, subject: subject.value });
    const d = unwrap<{ id: string; name: string; wordCount: number }>(r);
    if (!d) return;
    importUrl.value = '';
    showCreate.value = false;
    await loadAll();
    const book = books.value.find((b) => b.id === d.id);
    if (book) await openBook(book);
  } catch (e) {
    window.alert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    importing.value = false;
  }
}

// ── 到期复习（对标 Duolingo"练习恢复"环）──
const dueCount = ref(0);
const reviewMode = ref(false);
async function loadDueCount() {
  const r = await api.get<{ data: { due: number } }>('/learning/review?limit=3');
  dueCount.value = unwrap<{ due: number }>(r)?.due ?? 0;
}
async function startReview() {
  const r = await api.get<{ data: { questions: Question[]; due: number } }>('/learning/review');
  const d = unwrap<{ questions: Question[]; due: number }>(r);
  if (!d?.questions?.length) { dueCount.value = 0; return; }
  questions.value = d.questions;
  answers.value = {};
  feedback.value = {};
  revealedAnswer.value = {};
  result.value = null;
  drillLevel.value = null;
  qIndex.value = 0;
  activeBook.value = null;
  reviewMode.value = true;
  tab.value = 'drill';
}
async function submitReview() {
  if (submitting.value || !reviewMode.value) return;
  submitting.value = true;
  try {
    const payloadAnswers = activeQuestions.value.map((q) => ({
      qid: q.qid, kind: q.kind,
      picked: q.kind === 'choice' ? answers.value[q.qid] : undefined,
      typed: q.kind === 'choice' ? undefined : answers.value[q.qid],
    }));
    const r = await api.post<{ data: DrillResult }>('/learning/review/submit', { questions: activeQuestions.value, answers: payloadAnswers });
    result.value = unwrap<DrillResult>(r) ?? null;
    if (result.value) react(result.value);
    reviewMode.value = false;
    questions.value = [];
    await loadDueCount();
    await loadAll();
  } finally {
    submitting.value = false;
  }
}

// ── 课程专属场景卡（场景任务全程留在学习模式内）──
type SceneGuide = {
  coachEn: string;
  coachZh: string;
  userEn: string;
  userPhonetic: string;
  userZh: string;
};
type SceneCard = {
  id: string;
  courseId: string;
  courseName: string;
  stage: string;
  title: string;
  theme: string;
  scene: string;
  setting: string;
  roles: [string, string];
  missions: string[];
  keyPhrases: string[];
  exitHint: string;
  cefr: string;
  level: '热身' | '挑战' | '实战';
  minutes: number;
  tags: string[];
  guide: SceneGuide;
};
const scenes = ref<SceneCard[]>([]);
const sceneCourseId = ref('');
const sceneLoading = ref(false);
const sceneError = ref('');
const startingScene = ref<string | null>(null);
const activeScene = ref<SceneCard | null>(null);
const sceneCourseOptions = computed(() =>
  courses.value.flatMap((g) => g.courses.map((c) => ({ id: c.id, name: c.name, stage: g.stage }))),
);
const sceneCourseName = computed(() => sceneCourseOptions.value.find((c) => c.id === sceneCourseId.value)?.name || '课程场景');
const sceneLevelText = (level: SceneCard['level']) => (level === '热身' ? '简单' : level === '挑战' ? '中级' : '高级');
const sceneScriptMode = computed(() => {
  if (!activeScene.value) return '';
  return activeScene.value.level === '热身' ? 'simple' : activeScene.value.level === '挑战' ? 'medium' : 'advanced';
});
function sceneMinimumRoundsFor(scene: SceneCard): number {
  return Math.max(3, scene.missions.length + 1);
}
function sceneStartPrompt(scene: SceneCard): string {
  const minimumRounds = sceneMinimumRoundsFor(scene);
  return [
    `I am ready. Please start the "${scene.title}" scenario as ${scene.roles[0]}.`,
    '[Current scene contract - follow this and nothing unrelated]',
    `Setting: ${scene.setting}`,
    `Situation: ${scene.scene}`,
    `AI role: ${scene.roles[0]}. My role: ${scene.roles[1]}.`,
    `Your opening line: "${scene.guide.coachEn}"`,
    `My target answer is "${scene.guide.userEn}" (${scene.guide.userZh}). Do not say that answer for me; prompt me to produce it.`,
    `Missions: ${scene.missions.join(' / ')}`,
    `Minimum learner rounds before finishing: ${minimumRounds}. Do not output [SCENE_END] or scene_result before I have answered at least ${minimumRounds} times.`,
    'Teach it like a textbook unit, not a one-question quiz:',
    '1. Give one compact sentence pattern or useful words before asking.',
    '2. Ask only one question per turn.',
    '3. After my answer, briefly recast or correct it, then connect it to the next mission.',
    '4. Cover every mission across separate rounds, then add one transfer question using the same pattern in a new situation.',
    '5. Only after all missions and the transfer round, summarize the lesson and emit [SCENE_END] with scene_result.',
    'Stay in this exact scene. Do not reuse another scenario, another opening, or unrelated conversation history.',
  ].join('\n');
}
function sceneContinuationPrompt(scene: SceneCard, round: number): string {
  const mission = scene.missions[Math.min(round, scene.missions.length - 1)] || scene.missions[0] || '';
  return [
    `Continue the current scene "${scene.title}".`,
    `We have completed ${round} of ${sceneMinimumRoundsFor(scene)} required learner rounds.`,
    'Do not score or output scene_result yet.',
    `Continue with mission: ${mission}.`,
    'Give one short sentence pattern, ask one question, and wait for my answer.',
  ].join('\n');
}

async function ensureSceneCourse() {
  if (!sceneCourseId.value) {
    sceneCourseId.value = activeCourseId.value || sceneCourseOptions.value[0]?.id || '';
  }
  if (sceneCourseId.value) await loadScenes();
}

async function loadScenes() {
  if (!sceneCourseId.value) {
    scenes.value = [];
    sceneError.value = '请先从左侧选择一门课程';
    return;
  }
  sceneLoading.value = true;
  sceneError.value = '';
  try {
    const r = await api.get<{ data: SceneCard[] }>(`/learning/scenes?courseId=${encodeURIComponent(sceneCourseId.value)}`);
    scenes.value = unwrap<SceneCard[]>(r) || [];
    if (!scenes.value.length) sceneError.value = '这门课的场景任务还在准备中';
  } catch (e) {
    scenes.value = [];
    sceneError.value = e instanceof Error ? e.message : '场景加载失败';
  } finally {
    sceneLoading.value = false;
  }
}

function sceneResultsOf(m: { role: string; content?: string }) {
  return m.role === 'assistant' ? extractSceneResultBlocks(String(m.content || '')) : [];
}

async function startScene(scene: SceneCard) {
  if (startingScene.value) return;
  clearSceneContinuation();
  startingScene.value = scene.id;
  try {
    // 点击按钮本身是用户手势：先申请麦克风权限，等陪练说完第一轮再自动录音。
    practiceMicEnabled.value = true;
    await primeCoachMic();
    const convId = await chat.createConversation(`场景：${scene.title}`, {
      agentId: LEARNING_AGENT_ID,
      source: 'learning',
      sourceMeta: {
        learningKind: 'scene',
        learningScene: scene.id,
        learningCourseId: scene.courseId,
      },
    });
    coachConvId.value = convId;
    coachConversationKind.value = 'scene';
    coachConversationSceneId.value = scene.id;
    activeScene.value = scene;
    sceneContinuationGuard = '';
    sceneAutoContinueCount = 0;
    await chat.loadMessages(convId);
    tab.value = 'coach';
    await nextTick();
    await sendCoach(sceneStartPrompt(scene));
  } catch (e) {
    ElMessage.error(e instanceof Error ? `场景启动失败：${e.message}` : '场景启动失败，请稍后重试');
  } finally {
    startingScene.value = null;
  }
}

function askSceneHint() {
  if (!activeScene.value || coachSending.value) return;
  const target = sceneScriptMode.value === 'advanced'
    ? '请根据当前场景和我上一句的意思，给我一句自然、可直接跟读的英文'
    : `请提示我怎么说“${activeScene.value.guide.userEn}”`;
  void sendCoach(`${target}。先给英文，再给一句中文解释，然后继续角色对话。`);
}

// ── 范文阅读（P1-C）──
type ReadingBrief = { id: string; title: string; cefr: string; topic: string; paraCount: number };
type ReadingDetail = ReadingBrief & { paras: Array<{ en: string; zh: string }> };
const readings = ref<ReadingBrief[]>([]);
const readingActive = ref<ReadingDetail | null>(null);
const collecting = ref('');
const readingLevel = ref<'全部' | '简单' | '中级' | '困难'>('全部');
const readingTopic = ref('全部');
const READING_LEVELS = ['全部', '简单', '中级', '困难'] as const;
function readingLevelOf(cefr: string): '简单' | '中级' | '困难' {
  if (cefr === 'A1' || cefr === 'A2') return '简单';
  if (cefr === 'B1') return '中级';
  return '困难';
}
const readingTopics = computed(() => ['全部', ...new Set(readings.value.map((r) => r.topic))]);
const filteredReadings = computed(() =>
  readings.value.filter((r) =>
    (readingLevel.value === '全部' || readingLevelOf(r.cefr) === readingLevel.value) &&
    (readingTopic.value === '全部' || r.topic === readingTopic.value),
  ),
);
async function loadReadings() {
  const r = await api.get<{ data: ReadingBrief[] }>('/learning/readings');
  readings.value = unwrap<ReadingBrief[]>(r) || [];
  if (!readingActive.value && readings.value.length) await openReading(readings.value[0].id);
}
watch([readingLevel, readingTopic], () => {
  if (readingActive.value && filteredReadings.value.some((r) => r.id === readingActive.value?.id)) return;
  if (filteredReadings.value.length) void openReading(filteredReadings.value[0].id);
});
async function openReading(id: string) {
  if (readingActive.value?.id === id) return;
  const r = await api.get<{ data: ReadingDetail }>(`/learning/readings/${id}`);
  readingActive.value = unwrap<ReadingDetail>(r) || null;
}
/** 划词收集：选中文本取最后一个词 → AI 查释义 → 收进「阅读生词」词书 */
async function collectSelection() {
  if (!readingActive.value) return;
  const sel = window.getSelection()?.toString().trim() || '';
  const word = sel.split(/\s+/).filter((w) => /^[A-Za-z'’-]+$/.test(w)).pop() || '';
  if (!word) return;
  collecting.value = word;
  try {
    const r = await api.post<{ data: { entry: { word: string; gloss: string } } }>(`/learning/readings/${readingActive.value.id}/collect`, { word });
    const entry = unwrap<{ entry: { word: string; gloss: string } }>(r)?.entry;
    if (entry) window.alert(`已收进词本：${entry.word} — ${entry.gloss}`);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  } finally {
    collecting.value = '';
  }
}

// ── 口语跟读（whisper EN 转写 + P2 发音打分：目标句词级对齐）──
type PronWordMatch = { expected: string; spoken: string | null; status: 'ok' | 'wrong' | 'missing'; sim: number };
type PronunciationScore = { score: number; words: PronWordMatch[]; extraWords: string[] };
const recording = ref(false);
const transcribing = ref(false);
const transcript = ref('');
const shadowTarget = ref('');
const pronResult = ref<PronunciationScore | null>(null);
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
async function toggleRecord() {
  if (recording.value) {
    mediaRecorder?.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recording.value = false;
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      if (blob.size < 2000) { transcript.value = '（录音太短）'; return; }
      transcribing.value = true;
      try {
        const b64 = await new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
          fr.readAsDataURL(blob);
        });
        const expected = shadowTarget.value.trim();
        const r = await api.post<{ data: { text: string; pronunciation?: PronunciationScore } }>(
          '/learning/voice', { audioBase64: b64, mime: blob.type, ...(expected ? { expected } : {}) },
        );
        const d = unwrap<{ text: string; pronunciation?: PronunciationScore }>(r);
        transcript.value = d?.text || '（未识别到内容）';
        pronResult.value = d?.pronunciation ?? null;
      } catch (e) {
        transcript.value = `识别失败：${e instanceof Error ? e.message : String(e)}`;
        pronResult.value = null;
      } finally {
        transcribing.value = false;
      }
    };
    mediaRecorder.start();
    recording.value = true;
    transcript.value = '';
    pronResult.value = null;
  } catch {
    transcript.value = '无法访问麦克风（请检查浏览器/应用权限）';
  }
}

// ── AI 陪练：创建学习会话（learning 模式下归属=learning；上下文注入在服务端收口）──
const startingChat = ref(false);
async function startCoaching() {
  if (startingChat.value) return;
  clearSceneContinuation();
  startingChat.value = true;
  try {
    coachTypingMode.value = false;
    coachHistoryOpen.value = false;
    coachSceneInfoOpen.value = false;
    // 自由陪练不沿用上一个场景会话，确保两种任务各自独立。
    if (activeScene.value) {
      activeScene.value = null;
      coachConvId.value = '';
      coachConversationKind.value = '';
      coachConversationSceneId.value = '';
    }
    coachConversationKind.value = 'free';
    coachConversationSceneId.value = '';
    practiceMicEnabled.value = true;
    await primeCoachMic();
    await ensureCoachConv();
    tab.value = 'coach'; // ★ 内嵌对话：留在学习模式，不跳聊天页（用户实报"又跳到办公模式"）
    if (!coachMsgs.value.length) {
      await sendCoach([
        'Hi! I want to practice English freely, without a fixed scene.',
        'Start with one short question about what I want to talk about today.',
        'Then continue naturally one question at a time, follow my topic, and recast important mistakes briefly.',
        'Do not use scene missions, role-play scripts, or scene_result unless I ask for a scene.',
      ].join('\n'));
    } else {
      speakLastCoachReply();
    }
  } catch (e) {
    // ★ 失败必须有反馈（此前异常静默：后端拒了/网络挂了用户只看到"按钮没用"）
    console.error('[learning] 开始陪练失败', e);
    ElMessage.error(e instanceof Error ? `开始陪练失败：${e.message}` : '开始陪练失败，请稍后重试');
  } finally {
    startingChat.value = false;
  }
}
async function startFreePractice() {
  clearSceneContinuation();
  stopCoachMic();
  stopCoachSpeak();
  activeScene.value = null;
  coachConvId.value = '';
  coachConversationKind.value = 'free';
  coachConversationSceneId.value = '';
  coachSceneInfoOpen.value = false;
  coachHistoryOpen.value = false;
  tab.value = 'coach';
  await startCoaching();
}

// ── 陪练对话（内嵌中栏：复用 chat store 的会话/消息/SSE 链路，AI 输出英文后自动朗读）──
const platformStore = usePlatformStore();
const coachConvId = ref('');
const coachConversationKind = ref<'free' | 'scene' | ''>('');
const coachConversationSceneId = ref('');
const coachInput = ref('');
const coachSending = ref(false);
const coachVoiceOn = ref(true);
const practiceMicEnabled = ref(false);
const coachMicState = ref<'idle' | 'requesting' | 'ready' | 'recording' | 'transcribing'>('idle');
const coachTypingMode = ref(false);
const coachHistoryOpen = ref(false);
const coachSceneInfoOpen = ref(false);
const coachEntryRef = ref<HTMLInputElement | null>(null);
const coachMsgs = computed(() => (coachConvId.value ? chat.messagesByConv[coachConvId.value] || [] : []));
const coachStreaming = computed(() => !!coachConvId.value && chat.isConvStreaming(coachConvId.value));
const isCoachPresetPrompt = (text: string) =>
  /^(I am ready\. Please start|Continue the current scene|Hi! I want to practice English\.|请根据当前场景|请提示我怎么说)/.test(text.trim());
const coachUserLines = computed(() =>
  coachMsgs.value
    .filter((m) => m.role === 'user')
    .map((m) => String(m.content || '').trim())
    .filter((text) => text && !isCoachPresetPrompt(text)),
);
const latestCoachUserLine = computed(() => coachUserLines.value[coachUserLines.value.length - 1] || '');
const coachRound = computed(() => coachUserLines.value.length);
const sceneTargetRounds = computed(() =>
  activeScene.value ? sceneMinimumRoundsFor(activeScene.value) : 0,
);
const sceneCurrentMission = computed(() => {
  const scene = activeScene.value;
  if (!scene) return '';
  return scene.missions[Math.min(coachRound.value, scene.missions.length - 1)] || '';
});
const sceneProgressPct = computed(() => {
  if (!sceneTargetRounds.value) return 0;
  return Math.min(100, Math.round((coachRound.value / sceneTargetRounds.value) * 100));
});
const coachCurrentReply = computed(() => {
  const last = [...coachMsgs.value].reverse().find((m) => m.role === 'assistant' && coachTextOf(m).trim());
  if (last) return coachTextOf(last);
  if (activeScene.value) return activeScene.value.guide.coachEn;
  return "Hi, I'm ready. What would you like to practice today?";
});
const rawLatestCoachSceneResult = computed(() => {
  for (let i = coachMsgs.value.length - 1; i >= 0; i -= 1) {
    const message = coachMsgs.value[i];
    const rows = sceneResultsOf(message);
    if (rows.length) {
      return {
        block: rows[rows.length - 1],
        messageKey: String(message.id || `${i}:${message.content || ''}`),
      };
    }
  }
  return null;
});
const latestCoachSceneResult = computed(() => {
  const result = rawLatestCoachSceneResult.value?.block || null;
  if (!activeScene.value || coachRound.value < sceneTargetRounds.value) return null;
  return result;
});
watch(latestCoachSceneResult, (value) => {
  if (value) coachHistoryOpen.value = true;
});
let sceneContinuationGuard = '';
let sceneAutoContinueCount = 0;
let sceneContinuationTimer = 0;
function clearSceneContinuation() {
  window.clearTimeout(sceneContinuationTimer);
  sceneContinuationTimer = 0;
}
watch(rawLatestCoachSceneResult, (value) => {
  const scene = activeScene.value;
  if (!value || !scene || coachRound.value >= sceneTargetRounds.value) return;
  const marker = `${scene.id}:${value.messageKey}`;
  if (marker === sceneContinuationGuard || sceneAutoContinueCount >= 2) return;
  sceneContinuationGuard = marker;
  sceneAutoContinueCount += 1;
  stopCoachMic();
  clearSceneContinuation();
  let attempts = 0;
  const continueScene = () => {
    const current = activeScene.value;
    if (!current || coachRound.value >= sceneTargetRounds.value) return;
    if ((coachSending.value || coachStreaming.value) && attempts < 20) {
      attempts += 1;
      sceneContinuationTimer = window.setTimeout(continueScene, 250);
      return;
    }
    void sendCoach(sceneContinuationPrompt(current, coachRound.value));
  };
  sceneContinuationTimer = window.setTimeout(continueScene, 350);
});
const coachTalkLabel = computed(() => {
  if (coachMicState.value === 'recording') return '正在听你说';
  if (coachMicState.value === 'transcribing') return '正在识别';
  if (coachMicState.value === 'requesting') return '正在打开麦克风';
  if (coachStreaming.value) return '言言正在回答';
  if (coachSending.value) return '正在发送';
  return '点一下，开始说';
});
const coachTalkHint = computed(() => {
  if (coachMicState.value === 'recording') return '说完再点一下，我会自动发送';
  if (coachMicState.value === 'transcribing') return '请稍等，我在听写你的句子';
  if (coachStreaming.value) return '先听言言说完，或者点「停止」打断';
  return activeScene.value ? '直接说英语，中英混说也可以' : '不用打字，开口和言言聊';
});
let coachMicStream: MediaStream | null = null;
let coachMicRecorder: MediaRecorder | null = null;
let coachMicChunks: Blob[] = [];
let coachResumeTimer = 0;

function clearCoachResumeTimer() {
  window.clearTimeout(coachResumeTimer);
  coachResumeTimer = 0;
}

/** TTS 结束到重新开麦之间留出回声尾音，避免把自己的扬声器声音识别成用户输入。 */
function scheduleCoachRecording(delayMs = 550) {
  clearCoachResumeTimer();
  if (!practiceMicEnabled.value || coachMicState.value !== 'ready') return;
  coachResumeTimer = window.setTimeout(() => {
    coachResumeTimer = 0;
    if (
      !coachSending.value
      && !coachStreaming.value
      && coachMicState.value === 'ready'
    ) {
      startCoachRecording();
    }
  }, delayMs);
}

/** 打开麦克风但先不录音：用户点击场景时完成权限申请，等 AI 说完再自动录。 */
async function primeCoachMic(): Promise<boolean> {
  if (coachMicStream?.active) {
    if (coachMicState.value !== 'recording') coachMicState.value = 'ready';
    return true;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    coachMicState.value = 'idle';
    ElMessage.warning('当前环境无法录音，可以直接打字继续练习');
    return false;
  }
  coachMicState.value = 'requesting';
  try {
    coachMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    coachMicState.value = 'ready';
    return true;
  } catch {
    coachMicState.value = 'idle';
    ElMessage.warning('麦克风未打开，可以直接打字继续练习');
    return false;
  }
}

function startCoachRecording() {
  if (!practiceMicEnabled.value || coachMicState.value !== 'ready' || !coachMicStream?.active) return;
  if (coachSending.value || coachStreaming.value) return;
  try {
    coachMicChunks = [];
    coachMicRecorder = new MediaRecorder(coachMicStream);
    coachMicRecorder.ondataavailable = (e) => { if (e.data.size) coachMicChunks.push(e.data); };
    coachMicRecorder.onstop = () => { void recognizeCoachRecording(); };
    coachMicRecorder.start();
    coachMicState.value = 'recording';
    stageRef.value?.play('look');
  } catch {
    coachMicState.value = 'ready';
    ElMessage.warning('录音启动失败，可以直接打字继续');
  }
}

function stopCoachRecording() {
  if (coachMicState.value !== 'recording') return;
  coachMicRecorder?.stop();
}

async function recognizeCoachRecording() {
  if (!coachMicChunks.length) {
    coachMicState.value = 'ready';
    return;
  }
  const mime = coachMicRecorder?.mimeType || 'audio/webm';
  const blob = new Blob(coachMicChunks, { type: mime });
  coachMicChunks = [];
  if (blob.size < 2000) {
    coachMicState.value = 'ready';
    ElMessage.warning('录音太短，再说一句试试');
    return;
  }
  coachMicState.value = 'transcribing';
  try {
    const b64 = await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.readAsDataURL(blob);
    });
    const r = await api.post<{ data: { text: string } }>('/learning/voice', {
      audioBase64: b64,
      mime,
      language: 'auto',
    });
    const text = unwrap<{ text: string }>(r)?.text?.trim() || '';
    if (!text) throw new Error('没有识别到语音内容');
    coachInput.value = text;
    coachMicState.value = 'ready';
    await sendCoach(text);
  } catch (e) {
    coachMicState.value = 'ready';
    ElMessage.error(`语音识别失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

async function toggleCoachMic() {
  if (coachMicState.value === 'recording') {
    stopCoachRecording();
    return;
  }
  if (coachMicState.value === 'transcribing' || coachMicState.value === 'requesting') return;
  if (coachMicState.value === 'idle' && !(await primeCoachMic())) return;
  practiceMicEnabled.value = true;
  startCoachRecording();
}

async function toggleCoachTyping() {
  coachTypingMode.value = !coachTypingMode.value;
  if (!coachTypingMode.value) return;
  await nextTick();
  coachEntryRef.value?.focus();
}

function stopCoachMic() {
  clearCoachResumeTimer();
  try {
    if (coachMicRecorder?.state === 'recording') {
      coachMicRecorder.onstop = null;
      coachMicRecorder.stop();
    }
  } catch { /* ignore */ }
  try { coachMicStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
  coachMicStream = null;
  coachMicRecorder = null;
  coachMicChunks = [];
  coachMicState.value = 'idle';
}

function learningMetaOf(row: any): Record<string, unknown> {
  const direct = row?.sourceMeta;
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  try {
    const parsed = row?.source_meta_json ? JSON.parse(String(row.source_meta_json)) : null;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** 只复用自由陪练会话；场景会话必须按场景独立创建，不能串进“自由发挥”。 */
async function ensureCoachConv(): Promise<string> {
  if (coachConvId.value) {
    const current = chat.conversations.find((row) => row.id === coachConvId.value);
    const meta = learningMetaOf(current);
    const kind = meta.learningKind || coachConversationKind.value;
    const sceneId = String(meta.learningScene || coachConversationSceneId.value || '');
    const stillValid = activeScene.value
      ? kind === 'scene' && sceneId === activeScene.value.id
      : kind === 'free';
    if (stillValid) return coachConvId.value;
    coachConvId.value = '';
    coachConversationKind.value = '';
    coachConversationSceneId.value = '';
  }
  const r = await api.get<any[]>('/conversations?mode=learning&limit=20');
  const list = unwrap<any[]>(r) || [];
  const freeCoach = activeScene.value ? null : list.find((row) => learningMetaOf(row).learningKind === 'free');
  if (freeCoach) {
    coachConvId.value = String(freeCoach.id);
    coachConversationKind.value = 'free';
    coachConversationSceneId.value = '';
  } else {
    coachConvId.value = await chat.createConversation(`场景：${activeScene.value?.title || '英语陪练'}`, {
      agentId: LEARNING_AGENT_ID,
      source: 'learning',
      sourceMeta: activeScene.value
        ? { learningKind: 'scene', learningScene: activeScene.value.id, learningCourseId: activeScene.value.courseId }
        : { learningKind: 'free' },
    });
    coachConversationKind.value = activeScene.value ? 'scene' : 'free';
    coachConversationSceneId.value = activeScene.value?.id || '';
  }
  await chat.loadMessages(coachConvId.value);
  return coachConvId.value;
}

/** 发送用的平台/模型：优先会话已绑模型，否则取平台列表第一个可用模型。
 *  ★ 学习模式是独立页面，挂载时不会走聊天页的平台初始化 —— 必须自己幂等预热，
 *    否则首次点陪练必然落到「还没有可用的 AI 模型」提示，AI 根本调不通。
 *    ensureModels() 走 /platforms/all-models 全量清单，不会把共享缓存替换成单平台清单。 */
async function resolveCoachModel(): Promise<{ platform: any; model: any } | null> {
  await platformStore.ensurePlatforms();
  await platformStore.ensureModels();
  const conv = chat.conversations.find((c) => c.id === coachConvId.value);
  let model = conv?.modelId ? platformStore.models.find((m: any) => m.id === conv.modelId) : undefined;
  if (!model) model = platformStore.models[0] as any;
  if (!model) return null;
  const platform = platformStore.platforms.find((p: any) => p.id === (model as any).platformId);
  return platform ? { platform, model } : null;
}

async function sendCoach(preset?: string) {
  const content = (preset ?? coachInput.value).trim();
  if (!content || coachSending.value) return;
  coachSending.value = true;
  try {
    const convId = await ensureCoachConv();
    const resolved = await resolveCoachModel();
    if (!resolved) {
      ElMessage.error('还没有可用的 AI 模型 —— 请先在对话页配置平台与模型');
      return;
    }
    if (!preset) coachInput.value = '';
    coachHistoryOpen.value = false;
    stageRef.value?.play('hop');
    await chat.sendMessage(content, resolved.platform, resolved.model, undefined, {}, convId);
    // AI 说完 → 宠物读出来；朗读结束后自动重新开麦，形成「用户一句、模型一句」的轮次。
    if (coachVoiceOn.value) speakLastCoachReply();
    else scheduleCoachRecording();
  } catch (e) {
    console.error('[learning] 陪练发送失败', e);
    ElMessage.error(e instanceof Error ? `发送失败：${e.message}` : '发送失败，请稍后重试');
  } finally {
    coachSending.value = false;
  }
}

function coachTextOf(m: { role: string; content?: string }): string {
  if (m.role !== 'assistant') return String(m.content || '');
  return stripSceneResultBlocks(String(m.content || ''))
    .replace(/\*\*/g, '')
    .replace(/^---+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 浏览器本地 TTS（en-US）：长句朗读用它（单词朗读走 tts-packs 合成，场景结算卡同款思路）
function speakLastCoachReply() {
  if (!coachVoiceOn.value) return;
  const last = [...coachMsgs.value].reverse().find((m) => m.role === 'assistant' && coachTextOf(m).trim());
  if (!last) return;
  speakCoachText(coachTextOf(last));
}
function speakCoachText(text: string) {
  const t = text.trim().slice(0, 600);
  if (!t) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = /[\u3400-\u9fff]/.test(t) ? 'zh-CN' : 'en-US';
    u.rate = 0.95;
    const finish = () => {
      stageRef.value?.play('wave');
      const finished = coachMsgs.value.some((m) => sceneResultsOf(m).some((r) => r.ok));
      if (coachVoiceOn.value && practiceMicEnabled.value && !finished) scheduleCoachRecording();
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    stageRef.value?.play('pet');
  } catch { /* 环境无 TTS（如旧 jsdom）→ 静默 */ }
}
function stopCoachSpeak() {
  clearCoachResumeTimer();
  try { speechSynthesis.cancel(); } catch { /* 同上 */ }
}
function toggleCoachVoice() {
  coachVoiceOn.value = !coachVoiceOn.value;
  if (!coachVoiceOn.value) {
    stopCoachSpeak();
    if (practiceMicEnabled.value) startCoachRecording();
  }
}
// 流式输出时消息区跟到底部
watch(() => coachMsgs.value.map((m) => m.content?.length || 0).join(','), async () => {
  await nextTick();
  const el = document.querySelector('.lp-chat-msgs');
  if (el) el.scrollTop = el.scrollHeight;
});

const starText = computed(() => (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n));

// ── 形象舞台（P0-5）：教学事件 → 宠物动作（hop=过关庆祝 / look=答错思考） ──
const stageRef = ref<InstanceType<typeof LearnStage> | null>(null);
function react(r: DrillResult) {
  stageRef.value?.play(r.passed ? 'hop' : 'look');
}

// ── 单词朗读（P0-6）：优先本地语音包，缺失时回退系统 en-US 语音 ──
type TtsItem = { id: string; name: string; installed: boolean };
const ttsPackId = ref<string | null>(null);
const ttsSpeaking = ref(false);
const ttsActiveWord = ref('');
const ttsPlaying = ref<HTMLAudioElement | null>(null);
let ttsRequestSeq = 0;
async function loadTtsPack() {
  try {
    const r = await api.get<{ items: TtsItem[] }>('/tts-packs');
    const items = unwrap<{ items: TtsItem[] }>(r)?.items || [];
    ttsPackId.value = items.find((t) => t.installed)?.id || null;
  } catch { /* 语音包接口不可用不影响系统语音兜底 */ }
}

function stopWordSpeech() {
  ttsRequestSeq += 1;
  try { window.speechSynthesis?.cancel(); } catch { /* 系统语音不可用时忽略 */ }
  try { ttsPlaying.value?.pause(); } catch { /* 音频尚未加载时忽略 */ }
  ttsPlaying.value = null;
  ttsSpeaking.value = false;
  ttsActiveWord.value = '';
}

function speakWithSystemVoice(text: string, word: string): boolean {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.86;
    u.pitch = 1;
    const finish = () => {
      ttsSpeaking.value = false;
      ttsActiveWord.value = '';
    };
    u.onend = finish;
    u.onerror = finish;
    ttsSpeaking.value = true;
    ttsActiveWord.value = word;
    synth.speak(u);
    return true;
  } catch {
    ttsSpeaking.value = false;
    ttsActiveWord.value = '';
    return false;
  }
}

async function speak(text: string) {
  const word = text.trim();
  if (!word) return;
  if (ttsSpeaking.value) stopWordSpeech();
  const seq = ++ttsRequestSeq;

  // 没有安装语音包也能点：直接使用系统语音，避免按钮变成永远不可点。
  if (!ttsPackId.value) {
    if (!speakWithSystemVoice(word, word)) ElMessage.warning('当前系统没有可用的英语语音');
    return;
  }

  ttsSpeaking.value = true;
  ttsActiveWord.value = word;
  try {
    const r = await api.post<{ url?: string }>(`/tts-packs/${ttsPackId.value}/preview`, { text });
    const url = unwrap<{ url?: string }>(r)?.url;
    if (seq !== ttsRequestSeq) return;
    if (!url) throw new Error('语音合成未返回音频地址');
    ttsPlaying.value?.pause();
    const audio = new Audio(url);
    ttsPlaying.value = audio;
    const finish = () => {
      if (seq !== ttsRequestSeq) return;
      ttsSpeaking.value = false;
      ttsActiveWord.value = '';
      ttsPlaying.value = null;
    };
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    await audio.play();
  } catch {
    if (seq !== ttsRequestSeq) return;
    ttsSpeaking.value = false;
    ttsActiveWord.value = '';
    if (!speakWithSystemVoice(word, word)) ElMessage.warning('朗读失败，请检查系统语音');
  }
}

onMounted(() => {
  // ★ 从首页快捷入口/直接输 URL 进学习页时，activeMode 仍是上一个模式 ——
  //   不切就会话被记到办公任务列表（用户实报：「点了陪练跑到办公里面还创建了任务」）。
  //   页面挂载即把模式切到 learning（与顶栏模式切换器同一函数，幂等）。
  if (activeMode.value !== 'learning') setMode('learning');
  void loadSubjects();
  restoreSoftPlan();
  void loadSoftExamRegions();
});
onMounted(loadAll);
onMounted(loadTtsPack);
onBeforeUnmount(() => {
  clearSceneContinuation();
  stopColumnResize?.();
  stopCoachMic();
  stopCoachSpeak();
  stopWordSpeech();
});
watch(
  [softExamRegion, softExamSession, softExamDate, softRegistrationDeadline],
  () => persistSoftPlan(),
);
watch(softExamRegion, () => {
  if (subject.value === '软考') void loadSoftExamLive();
});
watch(softExamDate, (value) => {
  if (!value) return;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return;
  softExamSession.value = `${date.getFullYear()}年${date.getMonth() < 6 ? '上' : '下'}半年`;
});
</script>

<template>
  <div class="learning-page">
    <div class="lp-topbar" :inert="securityFocusing || pathFocusing || grammarFocusing || undefined">
      <SubjectPicker :value="subject" :options="SUBJECTS" @select="switchSubject" />
      <div class="lp-top-status">
        <template v-if="subject === '软考'">软考中高级备考 · 近三年资料可下载</template>
        <template v-else-if="subject === '网络安全'">网络安全 · 专注学习 · 仅授权靶场实验</template>
        <template v-else-if="profile.cefr">等级 <b>{{ profile.cefr }}</b><span v-if="profile.goals"> · {{ profile.goals }}</span></template>
        <template v-else>先和言言聊 3 分钟，自动完成定级</template>
        <span v-if="profile.streakDays" class="lp-streak">🔥 连续 {{ profile.streakDays }} 天</span>
      </div>
    </div>

    <!-- 稳定三栏骨架：所有 Tab 共用，切换只改中栏内容，不跳布局 -->
    <div class="lp-grid" :class="gridClasses" :style="gridStyle">
      <!-- 左：科目课程地图 + 我的词单 -->
      <section v-if="subject !== '网络安全' && !leftCollapsed" class="lp-card lp-col-left">
        <div class="lp-card-head">
          <h2>课程</h2>
          <div class="lp-card-actions">
            <button v-if="subject === '英语'" class="lp-mini" @click="showCreate = !showCreate">{{ showCreate ? '收起' : '+ 自定义词单' }}</button>
            <button class="lp-collapse-btn" title="收起左侧栏" aria-label="收起左侧栏" @click="leftCollapsed = true">
              <ChevronLeft :size="14" />
            </button>
          </div>
        </div>

        <div v-if="showCreate" class="lp-create">
          <input v-model="bookName" placeholder="词单名称（如：面试词汇）" />
          <textarea v-model="bookText" rows="4" placeholder="每行一个词：单词 | 中文释义 | 例句(可选)&#10;例如：resume | 简历；重新开始 | Please send your resume." />
          <button class="lp-primary" @click="createBook">创建词单</button>
          <textarea v-model="extractText" rows="4" placeholder="（可选）粘贴英文文章，AI 自动收词并建词单" />
          <button class="lp-mini" :disabled="extracting || !bookName.trim() || extractText.trim().length < 10" @click="extractAndCreate">
            {{ extracting ? 'AI 收词中…' : '🤖 AI 收词并创建' }}
          </button>
          <input v-model="importUrl" placeholder="（可选）词书内容包 URL（JSON：name + words[{word,gloss}]）" />
          <button class="lp-mini" :disabled="importing || !importUrl.startsWith('http')" @click="importBookUrl">
            {{ importing ? '下载导入中…' : '📥 从 URL 导入词书' }}
          </button>
          <p class="lp-hint">AI 收词需已配置可用模型；完整词书用 URL 导入</p>
        </div>

        <!-- 我的词单放顶部（个人资产优先于课程目录；此前埋在课程列表底部被裁半，用户两次圈红框） -->
        <div v-if="customBooks.length" class="lp-custom-books">
          <h3 class="lp-stage-name">我的词单</h3>
          <div class="lp-books">
            <button
              v-for="b in customBooks" :key="b.id"
              class="lp-book" :class="{ active: activeBook?.id === b.id }"
              @click="openBook(b)"
            >
              <span class="lp-book-name">{{ b.name }}<i v-if="(b.dueCount || 0) > 0" class="lp-due-badge">🟡 {{ b.dueCount }}</i></span>
              <span class="lp-book-meta">{{ b.wordCount }} 词 · {{ b.levelCount }} 关</span>
              <i class="lp-book-del" role="button" title="删除词单" @click.stop="removeBook(b, $event)">×</i>
            </button>
          </div>
        </div>

        <div class="lp-courses" :class="{ 'lp-courses-security-mobile': subject === '网络安全' }">
          <div v-for="grp in courses" :key="grp.stage" class="lp-stage">
            <h4 class="lp-stage-name">{{ grp.stage }}</h4>
            <template v-for="c in grp.courses" :key="c.id">
              <button
                v-if="c.kind === 'exam'"
                class="lp-course lp-course-exam"
                :class="{ active: softExamSpecialty === c.examSpecialty }"
                @click="openCourse(c)"
              >
                <span class="lp-course-row">
                  <span class="lp-course-name">{{ c.name }}</span>
                  <span class="lp-soft-course-state">
                    <Check v-if="softExamSpecialty === c.examSpecialty" :size="13" />
                    <span class="lp-soft-course-level">{{ c.examLevel }}</span>
                  </span>
                </span>
                <span class="lp-course-meta">综合知识 · 上机题 · 2023–2025</span>
              </button>
              <button
                v-else-if="c.kind === 'security'"
                class="lp-course lp-course-security"
                :class="{ active: securityPathId === c.securityPathId }"
                @click="openCourse(c)"
              >
                <span class="lp-course-row">
                  <span class="lp-course-name">{{ c.name }}</span>
                  <span class="lp-security-course-state">
                    <Check v-if="securityPathId === c.securityPathId" :size="13" />
                    <span class="lp-security-course-level">路线</span>
                  </span>
                </span>
                <span class="lp-course-meta">方法论 · 示例代码 · 授权靶场</span>
              </button>
              <button
                v-else
                class="lp-course" :class="{ active: activeBook?.id === c.bookId || sceneCourseId === c.id, done: c.progressPct === 100 }"
                @click="openCourse(c)"
              >
                <span class="lp-course-row">
                  <span class="lp-course-name">{{ c.name }}<i v-if="c.dueCount > 0" class="lp-due-badge" title="有到期词待复习">🟡 {{ c.dueCount }}</i></span>
                  <span class="lp-course-pct">{{ c.progressPct }}%</span>
                </span>
                <span class="lp-course-bar"><span class="lp-course-fill" :style="{ width: c.progressPct + '%' }"></span></span>
                <span class="lp-course-meta">{{ c.clearedLevels }}/{{ c.totalLevels }} 关 · {{ c.wordCount }} 词</span>
              </button>
            </template>
          </div>
          <p v-if="!courses.length && !loading" class="lp-hint">课程加载中…</p>
        </div>
      </section>

      <div v-if="subject !== '网络安全' && !leftCollapsed" class="lp-column-resizer" title="拖动调整左侧宽度" @pointerdown="startColumnResize('left', $event)"></div>

      <!-- 中：工作区（Tab 只切这里） -->
      <section class="lp-card lp-col-mid" :class="{ 'lp-security-stage': subject === '网络安全' }">
        <div v-if="tabDefs.length > 1" class="lp-tabs">
          <button
            v-for="t in tabDefs" :key="t.key"
            class="lp-tab" :class="{ active: tab === t.key }"
            @click="switchTab(t.key)"
          >{{ t.label }}</button>
        </div>

        <template v-if="tab === 'path'">
          <EnglishPathWorkbench
            @practice="startCoaching"
            @scenes="tab = 'scenes'; ensureSceneCourse()"
            @focus-change="pathFocusing = $event"
          />
        </template>

        <!-- 陪练：宠物是对话主体，文本框只作为降级输入 -->
        <template v-else-if="tab === 'coach'">
          <div class="lp-coach-chat lp-voice-studio">
            <div class="lp-practice-head">
              <div class="lp-practice-title">
                <p class="lp-eyebrow">{{ activeScene ? `${activeScene.courseName} · ${activeScene.theme}` : '自由口语陪练' }}</p>
                <h2>{{ activeScene ? activeScene.title : '和言言聊聊今天' }}</h2>
                <p>{{ activeScene ? activeScene.scene : '不用准备台词，直接开口。说错了也没关系，言言会顺着你的意思继续聊。' }}</p>
                <div v-if="activeScene" class="lp-scene-round-progress">
                  <span>第 {{ Math.min(coachRound + 1, sceneTargetRounds) }}/{{ sceneTargetRounds }} 轮</span>
                  <div><i :style="{ width: sceneProgressPct + '%' }"></i></div>
                  <small>{{ coachRound >= sceneTargetRounds ? '等待复盘结算' : sceneCurrentMission }}</small>
                </div>
              </div>
              <div class="lp-practice-tools">
                <button class="lp-tool-button" :title="coachVoiceOn ? '自动朗读：开' : '自动朗读：关'" @click="toggleCoachVoice">
                  <Volume2 :size="15" />
                </button>
                <LearningAvatarPicker />
                <button v-if="activeScene" class="lp-tool-button" :class="{ active: coachSceneInfoOpen }" @click="coachSceneInfoOpen = !coachSceneInfoOpen">
                  <Lightbulb :size="15" /> 场景提示
                </button>
                <button v-if="activeScene" class="lp-tool-button" @click="startFreePractice">自由发挥</button>
                <button class="lp-tool-button" @click="tab = 'scenes'">换场景</button>
              </div>
            </div>

            <section v-if="activeScene && coachSceneInfoOpen" class="lp-scene-compact">
              <header class="lp-scene-compact-head">
                <b>{{ activeScene.title }} · 场景提示</b>
                <button type="button" aria-label="关闭场景提示" @click="coachSceneInfoOpen = false">
                  <X :size="14" />
                </button>
              </header>
              <div class="lp-scene-compact-roles">
                <span><b>AI</b> {{ activeScene.roles[0] }}</span>
                <span><b>你</b> {{ activeScene.roles[1] }}</span>
                <span><Target :size="12" /> {{ activeScene.exitHint }}</span>
              </div>
              <div class="lp-scene-mission-track" aria-label="场景任务进度">
                <span
                  v-for="(mission, index) in activeScene.missions"
                  :key="mission"
                  :class="{ done: coachRound > index, active: coachRound === index }"
                >
                  <b>{{ index + 1 }}</b>{{ mission }}
                </span>
              </div>
              <div v-if="sceneScriptMode !== 'advanced'" class="lp-scene-lines">
                <div>
                  <span>AI 先说</span>
                  <p>{{ activeScene.guide.coachEn }}</p>
                  <button class="lp-speak" title="朗读 AI 开场" @click="speakCoachText(activeScene.guide.coachEn)">
                    <Volume2 :size="13" />
                  </button>
                </div>
                <div>
                  <span>轮到你</span>
                  <p>{{ activeScene.guide.userEn }}</p>
                  <small v-if="sceneScriptMode === 'simple'">{{ activeScene.guide.userZh }}</small>
                  <button class="lp-speak" title="朗读示范" @click="speakCoachText(activeScene.guide.userEn)">
                    <Volume2 :size="13" />
                  </button>
                </div>
              </div>
              <p v-else class="lp-hint">高级模式已隐藏台本。可以直接说，或点下方「给我提示」。</p>
            </section>

            <div class="lp-pet-stage" :class="{ listening: coachMicState === 'recording', thinking: coachStreaming }">
              <LearnStage ref="stageRef" class="lp-coach-stage" :view-scale="2.8" />
              <div class="lp-speech-column">
                <div class="lp-pet-speech">
                  <div class="lp-pet-speech-head">
                    <span>言言</span>
                    <i v-if="activeScene">{{ activeScene.roles[0] }}</i>
                    <i v-else>英语陪练</i>
                  </div>
                  <p>{{ coachCurrentReply }}</p>
                  <button
                    v-if="!coachMsgs.length && !coachStreaming"
                    class="lp-coach-start"
                    :disabled="startingChat"
                    @click="startCoaching"
                  >
                    <Mic :size="14" /> {{ startingChat ? '正在准备…' : '让言言先开场' }}
                  </button>
                  <button class="lp-speak" title="再听一遍" @click="speakCoachText(coachCurrentReply)">
                    <Volume2 :size="15" />
                  </button>
                </div>
                <div v-if="latestCoachUserLine" class="lp-user-echo">
                  <span>你刚说</span>
                  <p>{{ latestCoachUserLine }}</p>
                </div>
              </div>
              <div class="lp-mic-radar" :class="coachMicState" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
              </div>
            </div>

            <SceneResultCard
              v-if="latestCoachSceneResult?.ok"
              :result="latestCoachSceneResult.result"
              :can-retry="!!activeScene"
              :retrying="startingScene === activeScene?.id"
              @retry="activeScene && startScene(activeScene)"
            />
            <div v-else-if="latestCoachSceneResult && !latestCoachSceneResult.ok" class="lp-scene-result-error">
              场景结算数据有误：{{ latestCoachSceneResult.error }}
            </div>

            <div class="lp-voice-dock">
              <button
                class="lp-talk-button"
                :class="{ recording: coachMicState === 'recording', busy: coachMicState === 'transcribing' || coachMicState === 'requesting' || coachStreaming }"
                :disabled="coachMicState === 'transcribing' || coachMicState === 'requesting' || coachStreaming"
                :aria-label="coachMicState === 'recording' ? '结束录音并发送' : '开始说话'"
                @click="toggleCoachMic"
              >
                <LoaderCircle v-if="coachMicState === 'transcribing' || coachMicState === 'requesting'" :size="26" class="lp-spin" />
                <MicOff v-else-if="coachMicState === 'recording'" :size="26" />
                <Mic v-else :size="26" />
              </button>
              <div class="lp-talk-copy" role="status">
                <strong>{{ coachTalkLabel }}</strong>
                <span>{{ coachTalkHint }}</span>
              </div>
              <div class="lp-dock-actions">
                <button class="lp-tool-button" :class="{ active: coachTypingMode }" @click="toggleCoachTyping">
                  <Keyboard :size="15" /> 打字
                </button>
                <button v-if="activeScene" class="lp-tool-button" :disabled="coachSending" @click="askSceneHint">
                  <Lightbulb :size="15" /> 给我提示
                </button>
                <button v-if="coachStreaming" class="lp-tool-button danger" @click="chat.stop(coachConvId)">停止</button>
              </div>
            </div>

            <div v-if="coachTypingMode" class="lp-text-fallback">
              <input
                ref="coachEntryRef"
                v-model="coachInput"
                class="lp-chat-entry"
                :placeholder="activeScene ? '说英语或中文都可以…' : '不方便开口时，在这里打字…'"
                @keyup.enter="sendCoach()"
              />
              <button class="lp-primary" :disabled="coachSending || !coachInput.trim()" @click="sendCoach()">
                {{ coachSending ? '发送中…' : '发送' }}
              </button>
            </div>

          </div>
        </template>

        <!-- 单词闯关 -->
        <template v-else-if="tab === 'drill'">
          <!-- 单题聚焦模式：一次只答一题（此前 10 题平铺成一条长列表，又密又乱） -->
          <template v-if="(drillLevel != null || reviewMode) && currentQ">
            <p class="lp-drill-title">
              {{ reviewMode ? `到期复习（${activeQuestions.length} 题，跨词书）` : `${activeBook?.name} · 第 ${drillLevel} 关（${activeQuestions.length} 题）` }}
            </p>
            <div class="lp-drill-meter">
              <div class="lp-drill-bar"><span :style="{ width: (completedCount / Math.max(1, activeQuestions.length)) * 100 + '%' }"></span></div>
              <span class="lp-drill-count">已完成 {{ completedCount }}/{{ activeQuestions.length }}</span>
              <span class="lp-score-live">得分 {{ liveScore }} / 100</span>
            </div>
            <div class="lp-focus">
              <p class="lp-focus-kind"><b>第 {{ qIndex + 1 }} 题</b><span class="lp-kind">{{ KIND_LABELS[currentQ.kind] }}</span></p>
              <!-- 题干 -->
              <div v-if="currentQ.kind === 'choice'" class="lp-focus-body">
                <p class="lp-focus-word">{{ currentQ.prompt }}<i v-if="currentQ.phonetic" class="lp-focus-pho">{{ currentQ.phonetic }}</i>
                  <button class="lp-speak" :disabled="ttsSpeaking" title="朗读单词" @click="speak(currentQ.prompt)">🔊</button>
                </p>
                <p class="lp-focus-hint">选出正确的中文释义</p>
              </div>
              <div v-else-if="currentQ.kind === 'dictation'" class="lp-focus-body">
                <button class="lp-bigplay" :disabled="ttsSpeaking" title="播放单词" @click="speak(currentQ.audio || '')">🔊 播放单词</button>
                <p class="lp-focus-hint">听发音拼写（{{ currentQ.hint }}）</p>
              </div>
              <div v-else-if="currentQ.kind === 'cloze'" class="lp-focus-body">
                <p class="lp-focus-word lp-focus-cloze">{{ currentQ.prompt }}</p>
                <p class="lp-focus-hint">填入画线处的单词 · 提示：{{ currentQ.hint }}</p>
              </div>
              <div v-else class="lp-focus-body">
                <p class="lp-focus-word">{{ currentQ.prompt }}</p>
                <p class="lp-focus-hint">根据释义拼写单词 · 提示：{{ currentQ.hint }}</p>
              </div>
              <!-- 作答区 -->
              <div v-if="currentQ.kind === 'choice'" class="lp-opts">
                <button
                  v-for="opt in currentQ.options" :key="opt"
                  class="lp-opt"
                  :class="{
                    picked: answers[currentQ.qid] === opt,
                    correct: isChecked(currentQ) && (
                      (currentFeedback?.correct && answers[currentQ.qid] === opt)
                      || (isAnswerRevealed && currentFeedback?.expected === opt)
                    ),
                    wrong: isChecked(currentQ) && answers[currentQ.qid] === opt && currentFeedback && !currentFeedback.correct,
                  }"
                  :disabled="isChecked(currentQ)"
                  @click="selectOption(opt)"
                >{{ opt }}</button>
              </div>
              <input
                v-else
                ref="focusInput"
                v-model="answers[currentQ.qid]"
                class="lp-input lp-focus-input"
                :class="{
                  correct: isChecked(currentQ) && currentFeedback?.correct,
                  wrong: isChecked(currentQ) && currentFeedback && !currentFeedback.correct,
                }"
                :disabled="isChecked(currentQ)"
                :placeholder="currentQ.kind === 'dictation' ? `听音拼写（${currentQ.hint}）` : currentQ.kind === 'cloze' ? `填入目标词（${currentQ.hint}）` : `拼写单词（提示：${currentQ.hint}）`"
                @keyup.enter="nextOrSubmit"
              />
              <div
                v-if="currentFeedback"
                class="lp-answer-feedback"
                :class="{ correct: currentFeedback.correct, wrong: !currentFeedback.correct }"
                role="status"
                aria-live="polite"
              >
                <p class="lp-answer-feedback-title">
                  <b>{{ currentFeedback.correct ? '答对了' : '还不对' }}</b>
                  <span>{{ currentFeedback.word }}</span>
                </p>
                <template v-if="currentFeedback.correct">
                  <p>{{ currentFeedback.explanation }}</p>
                </template>
                <template v-else>
                  <p v-if="!isAnswerRevealed">先想一想，需要时再查看正确答案和解析。</p>
                  <template v-else>
                    <p>{{ currentFeedback.explanation }}</p>
                    <p class="lp-answer-expected">正确答案：<b>{{ currentFeedback.expected }}</b></p>
                  </template>
                  <button class="lp-answer-reveal" @click="toggleAnswerReveal">
                    {{ isAnswerRevealed ? '收起答案' : '查看正确答案' }}
                  </button>
                </template>
              </div>
            </div>
            <!-- 导航：上一题 / 题号圆点 / 下一题或交卷 -->
            <div class="lp-focus-nav">
              <button class="lp-mini" :disabled="qIndex === 0" @click="goQ(-1)">‹ 上一题</button>
              <div class="lp-dots">
                <button
                  v-for="(q, i) in activeQuestions" :key="q.qid"
                  class="lp-dot"
                  :class="{
                    done: isChecked(q),
                    draft: isAnswered(q) && !isChecked(q),
                    cur: i === qIndex,
                    wrong: isChecked(q) && !feedback[q.qid]?.correct,
                  }"
                  :title="`第 ${i + 1} 题${isChecked(q) ? (feedback[q.qid]?.correct ? '（正确）' : '（错误）') : isAnswered(q) ? '（待确认）' : ''}`"
                  @click="qIndex = i"
                >{{ i + 1 }}</button>
              </div>
              <button
                v-if="!isChecked(currentQ)"
                class="lp-primary"
                :disabled="checking || !isAnswered(currentQ)"
                @click="checkCurrentAnswer"
              >
                {{ checking ? '判定中…' : '确认答案' }}
              </button>
              <button v-else-if="qIndex < activeQuestions.length - 1" class="lp-primary" @click="goQ(1)">下一题 ›</button>
              <button v-else-if="completedCount < activeQuestions.length" class="lp-primary" @click="goNextIncomplete">
                继续未完成
              </button>
              <button v-else class="lp-primary" :disabled="submitting" @click="reviewMode ? submitReview() : submitDrill()">
                {{ submitting ? '判分中…' : '交卷' }}
              </button>
            </div>
          </template>
          <template v-else-if="result">
            <div class="lp-result" :class="{ pass: result.passed }">
              <p class="lp-result-stars">{{ starText(result.stars) }} <b>{{ result.pct }} 分</b></p>
              <p>答对 {{ result.correct }} / {{ result.total }} · {{ result.passed ? '过关！✅' : '没过，再练一轮 —— 错的词已回复习盒' }}</p>
              <ul>
                <li v-for="r in result.results" :key="r.qid" :class="{ wrong: !r.correct }">
                  <button class="lp-speak" :disabled="ttsSpeaking" @click="speak(r.word)">🔊</button>
                  <b>{{ r.word }}</b> · {{ r.correct ? '✔ 正确' : `你的答案「${r.given || '未作答'}」 · 正确答案「${r.expected}」` }}
                </li>
              </ul>
              <button class="lp-mini" style="margin-top:10px;" @click="result = null">← 返回关卡</button>
            </div>
          </template>
          <template v-else-if="activeBook">
            <h3 class="lp-levels-title">{{ activeBook.name }} · 选一关开始（共 {{ levels.length }} 关）</h3>
            <div class="lp-level-grid">
              <button
                v-for="l in pagedLevels" :key="l.levelNo"
                class="lp-level" :class="{ locked: !l.unlocked, cleared: l.passed, due: l.dueCount > 0 }"
                :title="l.unlocked ? '' : '跳关考试：通过即解锁下一关'"
                @click="startDrill(l.levelNo)"
              >
                <span class="lp-no">{{ l.unlocked ? l.levelNo : '🎯' }}</span>
                <span class="lp-stars">{{ starText(l.stars) }}</span>
                <span class="lp-words">{{ l.wordCount }} 词{{ l.unlocked ? '' : ' · 跳考' }}</span>
                <i v-if="l.dueCount > 0" class="lp-due-badge" title="已学词到期，该复习了">🟡 {{ l.dueCount }}</i>
              </button>
            </div>
            <div v-if="levelPageCount > 1" class="lp-pager">
              <button class="lp-mini" :disabled="levelPage === 0" @click="setLevelPage(-1)">‹ 上一页</button>
              <span>第 {{ levelPage + 1 }} / {{ levelPageCount }} 页（{{ pagedLevels[0]?.levelNo }}–{{ pagedLevels[pagedLevels.length - 1]?.levelNo }} 关）</span>
              <button class="lp-mini" :disabled="levelPage >= levelPageCount - 1" @click="setLevelPage(1)">下一页 ›</button>
            </div>
          </template>
          <div v-else class="lp-empty">
            <p class="lp-empty-title">从左侧选一门课程开始闯关</p>
            <p class="lp-hint">课程按学段排列（启蒙 → 初中 → 高中 → 大学 → 出国）；答错的词自动进 SRS 复习队列，右栏「开始复习」优先清到期。</p>
          </div>
        </template>

        <!-- 词汇表：整本词书通读（分页 + 中英搜索） -->
        <template v-else-if="tab === 'words'">
          <template v-if="activeBook">
            <div class="lp-wt-head">
              <h3 class="lp-levels-title">{{ activeBook.name }} · 词汇表</h3>
              <input
                v-model="wordQ" class="lp-input lp-wt-search"
                placeholder="搜索单词或释义（如：apple / 苹果）"
                @keyup.enter="loadBookWords(true)"
              />
              <button class="lp-mini" :disabled="wordLoading" @click="loadBookWords(true)">搜索</button>
            </div>
            <p class="lp-hint">共 {{ wordTotal }} 词{{ wordQ ? '（搜索结果）' : '' }} · 第 {{ wordPage + 1 }} / {{ wordPageCount }} 页</p>
            <div class="lp-wt-list">
              <div v-for="w in wordRows" :key="w.word" class="lp-wt-row">
                <button
                  class="lp-wt-pronounce"
                  :class="{ active: ttsSpeaking && ttsActiveWord === w.word }"
                  :aria-label="`播放 ${w.word} 的英语发音`"
                  title="播放英语发音"
                  @click="speak(w.word)"
                >
                  <Volume2 :size="15" />
                </button>
                <button
                  class="lp-wt-word"
                  :class="{ speaking: ttsSpeaking && ttsActiveWord === w.word }"
                  :aria-label="`朗读单词 ${w.word}`"
                  title="点击朗读"
                  @click="speak(w.word)"
                >{{ w.word }}</button>
                <i v-if="w.phonetic" class="lp-wt-pho">{{ w.phonetic }}</i>
                <span class="lp-wt-gloss">{{ w.gloss }}</span>
              </div>
              <p v-if="!wordRows.length && !wordLoading" class="lp-hint">没有匹配的单词</p>
              <p v-if="wordLoading" class="lp-hint">加载中…</p>
            </div>
            <div v-if="wordPageCount > 1" class="lp-pager">
              <button class="lp-mini" :disabled="wordPage === 0" @click="setWordPage(-1)">‹ 上一页</button>
              <span>第 {{ wordPage + 1 }} / {{ wordPageCount }} 页</span>
              <button class="lp-mini" :disabled="wordPage >= wordPageCount - 1" @click="setWordPage(1)">下一页 ›</button>
            </div>
          </template>
          <div v-else class="lp-empty">
            <p class="lp-empty-title">从左侧选一门课程后查看整本词汇表</p>
            <p class="lp-hint">词汇表支持中英搜索与分页浏览；点单词或扬声器即可听发音。</p>
          </div>
        </template>

        <!-- 场景卡 -->
        <template v-else-if="tab === 'scenes'">
          <div class="lp-scene-head">
            <div>
              <p class="lp-eyebrow">当前课程场景</p>
              <h3>{{ sceneCourseName }}</h3>
              <p class="lp-hint">每个场景都围绕本课词汇与表达设计，进入后直接在学习页内语音对练。</p>
            </div>
            <label class="lp-scene-filter">
              <span>切换课程</span>
              <select v-model="sceneCourseId" @change="loadScenes">
                <option v-for="c in sceneCourseOptions" :key="c.id" :value="c.id">{{ c.stage }} · {{ c.name }}</option>
              </select>
            </label>
          </div>

          <div v-if="sceneLoading" class="lp-scene-loading" role="status">
            <LoaderCircle :size="18" class="lp-spin" /> 正在准备课程场景…
          </div>
          <div v-else-if="sceneError" class="lp-scene-empty">
            <MapPin :size="22" />
            <p>{{ sceneError }}</p>
            <button class="lp-mini" @click="loadScenes">重新加载</button>
          </div>
          <div v-else class="lp-scene-grid">
            <article v-for="s in scenes" :key="s.id" class="lp-scene">
              <div class="lp-scene-top">
                <span class="lp-scene-theme">{{ s.theme }}</span>
                <span class="lp-scene-level" :class="`level-${s.level}`">{{ sceneLevelText(s.level) }}</span>
              </div>
              <h3 class="lp-scene-title">{{ s.title }}</h3>
              <p class="lp-scene-desc">{{ s.scene }}</p>
              <div class="lp-scene-facts">
                <span><Clock3 :size="13" /> {{ s.minutes }} 分钟</span>
                <span><Target :size="13" /> {{ s.cefr }}</span>
                <span><MapPin :size="13" /> {{ s.setting }}</span>
              </div>
              <div class="lp-scene-missions">
                <p>你的任务</p>
                <ol>
                  <li v-for="m in s.missions" :key="m">{{ m }}</li>
                </ol>
              </div>
              <div class="lp-scene-phrases">
                <span v-for="p in s.keyPhrases.slice(0, 3)" :key="p">{{ p }}</span>
              </div>
              <div class="lp-scene-role">
                <span>AI 演 {{ s.roles[0] }}</span>
                <span>你演 {{ s.roles[1] }}</span>
              </div>
              <div class="lp-scene-foot">
                <span class="lp-scene-exit">{{ s.exitHint }}</span>
                <button class="lp-scene-action" :disabled="!!startingScene" @click="startScene(s)">
                  <LoaderCircle v-if="startingScene === s.id" :size="15" class="lp-spin" />
                  <Mic v-else :size="15" />
                  {{ startingScene === s.id ? '正在进入…' : '进入场景对练' }}
                  <ChevronRight v-if="startingScene !== s.id" :size="15" />
                </button>
              </div>
            </article>
          </div>
        </template>

        <!-- 语法微课：总览列表和全屏三步微课分离 -->
        <template v-else-if="tab === 'grammar'">
          <GrammarWorkbench @focus-change="grammarFocusing = $event" />
        </template>

        <!-- 范文阅读：左侧素材库，右侧阅读器 -->
        <template v-else-if="tab === 'reading'">
          <div class="lp-reading-layout">
            <aside class="lp-reading-library">
              <div class="lp-reading-library-head">
                <h3>范文库</h3>
                <span>{{ filteredReadings.length }} 篇</span>
              </div>
              <div class="lp-reading-levels" role="group" aria-label="按难度筛选">
                <button
                  v-for="level in READING_LEVELS" :key="level"
                  :class="{ active: readingLevel === level }"
                  @click="readingLevel = level"
                >{{ level }}</button>
              </div>
              <label class="lp-reading-topic">主题
                <select v-model="readingTopic">
                  <option v-for="topic in readingTopics" :key="topic" :value="topic">{{ topic }}</option>
                </select>
              </label>
              <div class="lp-reading-list">
                <button
                  v-for="r in filteredReadings" :key="r.id"
                  class="lp-reading-card" :class="{ active: readingActive?.id === r.id }"
                  @click="openReading(r.id)"
                >
                  <span class="lp-reading-card-top">
                    <b>{{ r.title }}</b>
                    <i class="lp-reading-difficulty" :class="`level-${readingLevelOf(r.cefr)}`">{{ readingLevelOf(r.cefr) }}</i>
                  </span>
                  <span class="lp-reading-card-meta">{{ r.topic }} · {{ r.paraCount }} 段 · {{ r.cefr }}</span>
                </button>
                <p v-if="!filteredReadings.length" class="lp-hint">这个分类还没有范文。</p>
              </div>
            </aside>

            <article v-if="readingActive" class="lp-reader">
              <header class="lp-reader-head">
                <div>
                  <div class="lp-reader-badges">
                    <span>{{ readingActive.topic }}</span>
                    <span>{{ readingLevelOf(readingActive.cefr) }}</span>
                    <span>{{ readingActive.cefr }}</span>
                  </div>
                  <h3>{{ readingActive.title }}</h3>
                </div>
                <BookOpen :size="20" />
              </header>
              <p class="lp-reader-tip">读音、点词、跟读和收词都在原文里完成。</p>
              <div v-for="(p, i) in readingActive.paras" :key="i" class="lp-para">
                <p class="lp-para-en" @mouseup="collectSelection">
                  {{ p.en }}
                  <span class="lp-para-actions">
                    <button class="lp-speak" :disabled="ttsSpeaking" title="朗读这一段" @click="speak(p.en)"><Volume2 :size="13" /></button>
                    <button class="lp-speak" title="设为跟读目标" @click="shadowTarget = p.en"><Mic :size="13" /></button>
                  </span>
                </p>
                <p class="lp-para-zh">{{ p.zh }}</p>
              </div>
              <button class="lp-reader-collect" :disabled="!!collecting" @click="collectSelection">
                {{ collecting ? `查询「${collecting}」中…` : '收词（先划选一个英文词）' }}
              </button>
            </article>

            <div v-else class="lp-reader-empty">
              <BookOpen :size="28" />
              <p>从左侧选一篇范文</p>
              <span>可以按难度和主题筛选。</span>
            </div>
          </div>
        </template>

        <!-- 网络安全：独立分支路线与授权靶场 -->
        <template v-else-if="tab === 'security'">
          <CyberSecurityWorkbench
            :path-id="securityPathId"
            @select-path="securityPathId = $event"
            @focus-change="securityFocusing = $event"
          />
        </template>

        <!-- 历年真题：考研 / 高考客观题训练 -->
        <template v-else-if="tab === 'exam'">
          <ExamTrainer
            :initial-filter="subject === '软考' ? '软考' : '全部'"
            :initial-soft-specialty="subject === '软考' ? softExamSpecialty : '全部'"
            :scoped-subject="subject === '软考' ? '软考' : '全部'"
          />
        </template>
      </section>

      <div
        v-show="subject !== '网络安全' && !rightCollapsed && !(tab === 'coach' && !coachHistoryOpen)"
        class="lp-column-resizer"
        title="拖动调整右侧宽度"
        @pointerdown="startColumnResize('right', $event)"
      ></div>

      <!-- 右：状态栏（始终可见） -->
      <section v-show="tab !== 'coach' && subject === '英语' && !rightCollapsed" class="lp-card lp-col-right">
        <button class="lp-collapse-btn lp-collapse-right" title="收起右侧栏" aria-label="收起右侧栏" @click="rightCollapsed = true">
          <ChevronRight :size="14" />
        </button>
        <div class="lp-card-head"><h2>今日复习</h2></div>
        <div class="lp-review">
          <p class="lp-review-count">🔥 <b>{{ dueCount }}</b> 个词到期</p>
          <button class="lp-primary" :disabled="!dueCount || submitting" @click="startReview">开始复习</button>
          <p class="lp-hint">到期词按 SRS 排程（1/3/7/14/30 天），优先清到期，再闯新关。</p>
        </div>
        <div class="lp-card-head" style="margin-top:14px;"><h2>口语跟读</h2></div>
        <div class="lp-review">
          <input v-model="shadowTarget" class="lp-input" placeholder="跟读目标句（留空则只转写）" />
          <button class="lp-primary" :class="{ rec: recording }" :disabled="transcribing" @click="toggleRecord">
            {{ transcribing ? '识别中…' : recording ? '⏹ 停止录音' : '🎙 点我录音说英语' }}
          </button>
          <p v-if="transcript" class="lp-transcript">{{ transcript }}</p>
          <div v-if="pronResult" class="lp-pron">
            <p class="lp-pron-score">
              发音得分 <b :class="{ good: pronResult.score >= 80, mid: pronResult.score >= 60 && pronResult.score < 80 }">{{ pronResult.score }}</b> 分
              <span v-if="pronResult.extraWords.length" class="lp-hint">多说：{{ pronResult.extraWords.join(' ') }}</span>
            </p>
            <p class="lp-pron-words">
              <span v-for="(w, i) in pronResult.words" :key="i" class="lp-pron-w" :class="w.status">
                {{ w.expected }}<i v-if="w.status === 'wrong'" class="lp-pron-heard">（听到 {{ w.spoken }}）</i>
              </span>
            </p>
          </div>
          <p class="lp-hint">填目标句（阅读段点 🎙 可一键填入）→ 录音 → 看逐词比对与得分（whisper 本地转写，需安装语音识别模型）。</p>
        </div>
        <div class="lp-card-head" style="margin-top:14px;"><h2>错误本</h2></div>
        <ul v-if="errors.length" class="lp-errors">
          <li v-for="e in errors" :key="e.id">
            <p><s>{{ e.wrong }}</s> → <b>{{ e.right }}</b></p>
            <p v-if="e.reason" class="lp-hint">{{ e.reason }}</p>
          </li>
        </ul>
        <p v-else class="lp-hint">还没有记录。陪练纠过的表达会自动进这里。</p>
      </section>

      <aside v-if="subject === '软考' && !rightCollapsed" class="lp-card lp-col-right lp-soft-materials">
        <button v-show="!rightCollapsed" class="lp-collapse-btn lp-collapse-right" title="收起右侧栏" aria-label="收起右侧栏" @click="rightCollapsed = true">
          <ChevronRight :size="14" />
        </button>
        <div class="lp-soft-side-tabs">
          <button :class="{ active: softSideTab === 'exam' }" @click="softSideTab = 'exam'">考试信息</button>
          <button :class="{ active: softSideTab === 'materials' }" @click="softSideTab = 'materials'">学习清单</button>
          <button :class="{ active: softSideTab === 'knowledge' }" @click="softSideTab = 'knowledge'">知识体系</button>
        </div>

        <div v-if="softSideTab === 'exam'" class="lp-soft-exam-panel">
          <div class="lp-soft-plan-form">
            <label>
              <span><MapPin :size="12" /> 地区</span>
              <select v-model="softExamRegion" @change="loadSoftExamLive">
                <option v-for="region in softRegions" :key="region.name" :value="region.name">{{ region.name }}</option>
              </select>
            </label>
            <label>
              <span>期次</span>
              <select v-model="softExamSession">
                <option v-for="session in softSessionOptions" :key="session" :value="session">{{ session }}</option>
              </select>
            </label>
            <label>
              <span>考试日期</span>
              <input v-model="softExamDate" type="date" />
            </label>
            <label>
              <span>报名截止</span>
              <input v-model="softRegistrationDeadline" type="date" />
            </label>
          </div>
          <div class="lp-soft-countdown"><Clock3 :size="15" />{{ softCountdownText }}</div>
          <div class="lp-soft-actions">
            <button class="lp-primary" @click="openOfficialUrl(softLiveInfo?.registrationUrl || 'https://bm.ruankao.org.cn/sign/welcome')">官方报名入口</button>
            <button class="lp-mini" @click="downloadExamReminder">下载考试提醒</button>
            <button class="lp-mini" @click="showRegistrationGuide">AI 报名检查</button>
          </div>

          <div class="lp-soft-section-head">
            <h3>官方动态</h3>
            <button class="lp-mini" :disabled="softLiveLoading" @click="loadSoftExamLive">{{ softLiveLoading ? '获取中…' : '刷新' }}</button>
          </div>
          <p v-if="softLiveError" class="lp-soft-live-error">{{ softLiveError }}</p>
          <p v-else-if="softLiveInfo" class="lp-soft-live-time">
            {{ softLiveInfo.region }} · {{ softLiveInfo.status === 'live' ? '已获取官方页面' : '部分信息使用官方入口兜底' }} ·
            {{ new Date(softLiveInfo.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
          </p>
          <div v-if="softLiveInfo?.notices.length" class="lp-soft-notices">
            <button v-for="notice in softLiveInfo.notices.slice(0, 8)" :key="notice.url" @click="openOfficialUrl(notice.url)">
              <span>{{ notice.source }}</span>
              <b>{{ notice.title }}</b>
            </button>
          </div>
          <p v-else-if="!softLiveLoading && !softLiveError" class="lp-hint">暂时没有提取到通知，请使用官方入口查看最新公告。</p>

          <div class="lp-soft-section-head">
            <h3>复习计划</h3>
            <span>{{ softStudyPlan.length }} 周</span>
          </div>
          <div v-if="softStudyPlan.length" class="lp-soft-study-plan">
            <article v-for="plan in softStudyPlan" :key="plan.week">
              <span>W{{ plan.week }}</span>
              <div><b>{{ plan.title }}</b><p>{{ plan.task }}</p></div>
            </article>
          </div>
          <p v-else class="lp-hint">选择考试日期后自动生成复习计划。</p>
        </div>

        <div v-else-if="softSideTab === 'materials'" class="lp-soft-material-panel">
          <div class="lp-card-head">
            <h2>{{ focusedSoftMaterial?.specialty || '软考学习清单' }}</h2>
            <span class="lp-soft-material-range">Markdown</span>
          </div>
          <p class="lp-hint">这里下载的是言智整理的学习清单，不是官方教材或官方原题。保存后可在清单中定位章节，再阅读官方最新版教程。</p>
          <div v-if="visibleSoftMaterials.length" class="lp-soft-material-list">
            <article v-for="m in visibleSoftMaterials" :key="m.id" class="lp-soft-material">
              <div class="lp-soft-material-badges">
                <span>{{ m.level }}</span>
                <span>{{ m.specialty }}</span>
                <span>{{ m.chapterCount }} 个章节</span>
              </div>
              <h3>{{ m.title }}</h3>
              <p>{{ m.description }}</p>
              <button class="lp-mini" :disabled="softMaterialLoading === m.id" @click="downloadSoftMaterial(m)">
                {{ softMaterialLoading === m.id ? '正在保存…' : '下载学习清单（.md）' }}
              </button>
            </article>
          </div>
          <p v-else class="lp-hint">资料加载中…</p>
          <div v-if="focusedSoftMaterial?.freeResources?.length" class="lp-soft-free-resources">
            <div class="lp-soft-section-head">
              <h3>免费自学资料</h3>
              <span>{{ focusedSoftMaterial.freeResources.length }} 个入口</span>
            </div>
            <p>正式教材受版权保护，这里提供可合法免费使用的官方入口、开源仓库和公开视频检索。</p>
            <ol class="lp-soft-free-steps">
              <li>先看官方大纲，确认当前专业和级别要考什么。</li>
              <li>再用开源笔记按知识域学习，每章写下“原因 → 影响 → 结论”。</li>
              <li>最后用开源题库刷章节题，错题回到笔记和本页知识体系定位原因。</li>
            </ol>
            <article v-for="resource in focusedSoftMaterial.freeResources" :key="resource.id" class="lp-soft-free-card">
              <div class="lp-soft-free-card-head">
                <span>{{ resource.kind }}</span>
                <b>{{ resource.title }}</b>
              </div>
              <p>{{ resource.description }}</p>
              <small>{{ resource.provider }} · {{ resource.license }}</small>
              <p class="lp-soft-free-usage"><b>怎么用：</b>{{ resource.howToUse }}</p>
              <button class="lp-mini" @click="openOfficialUrl(resource.url)">打开资料</button>
            </article>
          </div>
          <div class="lp-soft-official-books">
            <div class="lp-soft-section-head">
              <h3>官方考试用书</h3>
              <span>非 Markdown</span>
            </div>
            <p>考试大纲、教程和试题解析由官方出版，需通过官方考试用书页查看版本与购买渠道。</p>
            <button class="lp-primary" @click="openOfficialUrl(focusedSoftMaterial?.officialBooksUrl || 'https://www.ruankao.org.cn/book/main.html')">
              打开官方考试用书页
            </button>
          </div>
        </div>

        <div v-else class="lp-soft-knowledge-panel">
          <div v-if="focusedSoftMaterial" class="lp-soft-knowledge">
            <div class="lp-card-head">
              <h2>{{ focusedSoftMaterial.specialty }} · 知识体系</h2>
              <span class="lp-soft-material-range">{{ focusedSoftMaterial.chapterCount }} 章节</span>
            </div>
            <p class="lp-hint">{{ focusedSoftMaterial.coverageNote }}</p>
            <section v-for="(domain, di) in focusedSoftMaterial.knowledgeDomains" :key="domain.title" class="lp-soft-knowledge-domain">
              <h3><span>{{ String(di + 1).padStart(2, '0') }}</span>{{ domain.title }}</h3>
              <div class="lp-soft-knowledge-chapters">
                <span v-for="chapter in domain.chapters" :key="chapter">{{ chapter }}</span>
              </div>
            </section>
            <div class="lp-soft-official-books">
              <div class="lp-soft-section-head">
                <h3>对应官方教材</h3>
                <span>最新版</span>
              </div>
              <button
                v-for="book in focusedSoftMaterial.books"
                :key="book.kind"
                class="lp-soft-book"
                @click="openOfficialUrl(book.officialUrl)"
              >
                <span>{{ book.kind }}</span>
                <b>{{ book.title }}</b>
                <small>{{ book.publisher }} · ISBN {{ book.isbn }}</small>
                <small>{{ book.note }}</small>
              </button>
            </div>
          </div>
          <p v-else class="lp-hint">知识体系加载中…</p>
        </div>
      </aside>

      <aside v-if="tab === 'coach' && !rightCollapsed" class="lp-card lp-col-right lp-coach-side" :class="{ collapsed: !coachHistoryOpen }">
        <div class="lp-side-head">
          <div class="lp-side-title">
            <History :size="15" />
            <span>{{ coachHistoryOpen ? '对话记录' : '记录' }}</span>
          </div>
          <button
            class="lp-side-toggle"
            :title="coachHistoryOpen ? '收起对话记录' : '展开对话记录'"
            :aria-expanded="coachHistoryOpen"
            @click="coachHistoryOpen = !coachHistoryOpen"
          >
            <ChevronRight v-if="coachHistoryOpen" :size="15" />
            <ChevronLeft v-else :size="15" />
          </button>
        </div>
        <div v-show="coachHistoryOpen" class="lp-side-body">
          <p class="lp-side-meta">{{ coachRound }} 轮 · 只保留这次陪练</p>
          <div class="lp-chat-msgs">
            <template v-for="(m, mi) in coachMsgs" :key="m.id || mi">
              <div v-if="(m.role === 'user' && !isCoachPresetPrompt(String(m.content || ''))) || (m.role === 'assistant' && coachTextOf(m).trim())" class="lp-chat-row" :class="m.role">
                <div class="lp-chat-bubble">
                  <p class="lp-chat-text">{{ coachTextOf(m) }}</p>
                  <button v-if="m.role === 'assistant' && coachTextOf(m).trim()" class="lp-speak" title="朗读这句" @click="speakCoachText(coachTextOf(m))">
                    <Volume2 :size="14" />
                  </button>
                </div>
              </div>
              <template v-for="(sr, si) in sceneResultsOf(m)" :key="`${m.id || mi}-sr-${si}`">
                <SceneResultCard
                  v-if="sr.ok"
                  :result="sr.result"
                  :can-retry="!!activeScene"
                  :retrying="startingScene === activeScene?.id"
                  @retry="activeScene && startScene(activeScene)"
                />
                <div v-else class="lp-scene-result-error">场景结算数据有误：{{ sr.error }}</div>
              </template>
            </template>
            <div v-if="!coachMsgs.length && !coachStreaming" class="lp-empty">
              <p class="lp-empty-title">还没有对话</p>
              <p class="lp-hint">和言言开口后，文字会出现在这里。</p>
            </div>
          </div>
        </div>
      </aside>

      <button v-if="leftCollapsed && subject !== '网络安全'" class="lp-expand-rail left" title="展开左侧栏" aria-label="展开左侧栏" @click="leftCollapsed = false">
        <ChevronRight :size="15" />
      </button>
      <button v-if="rightCollapsed && subject !== '网络安全'" class="lp-expand-rail right" title="展开右侧栏" aria-label="展开右侧栏" @click="rightCollapsed = false">
        <ChevronLeft :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ★ 高度用 flex 撑满 main-content（视口 − 顶栏 − 底部状态栏），绝不能写 100vh ——
   100vh 是视口全高，会把学习页底部压到状态栏底下（用户实报：左栏最后一项永远被裁一半）。 */
.learning-page { padding: 10px 16px 14px; max-width: none; width: 100%; margin: 0; color: #1f2329; flex: 1; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; }
.lp-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-shrink: 0; min-height: 32px; }
.lp-top-status { color: var(--color-text-secondary); font-size: 12px; text-align: right; }
.lp-top-status b { color: var(--color-text); }
.lp-streak { margin-left: 10px; color: #e8590c; font-weight: 600; }
/* ★ 每栏独立滚动（用户实报「答题卷看不全/滚动没有」「最后一个显示不完整」）：
   此前用 max-height: calc(100vh - 180px) 魔法数估头部高度，估不准 ⇒ 最后一项被视口裁半。
   改为 flex 精确贴合：页面占满视口，grid 弹性吃掉 header 之外的剩余高度，三栏 stretch 等高，
   栏内滚动 —— 高度永远正好，不依赖任何估算常数。 */
.lp-grid { position: relative; display: grid; grid-template-columns: var(--lp-left-w, 300px) 8px minmax(0, 1fr) 8px var(--lp-right-w, 280px); gap: 0; flex: 1; min-height: 0; }
.lp-grid.coach-mode { grid-template-columns: var(--lp-left-w, 300px) 8px minmax(0, 1fr) 8px var(--lp-right-w, 300px); }
.lp-grid.security-workspace { grid-template-columns: minmax(0, 1fr); }
.lp-grid.security-workspace .lp-column-resizer { display: none; }
.lp-grid.security-workspace .lp-security-stage { border: 0; background: transparent; padding: 0; overflow-y: auto; }
.lp-column-resizer { position: relative; width: 8px; cursor: col-resize; touch-action: none; }
.lp-column-resizer::after { content: ""; position: absolute; top: 8px; bottom: 8px; left: 3px; width: 2px; border-radius: 2px; background: var(--color-border); transition: background .15s ease; }
.lp-column-resizer:hover::after, .lp-column-resizer:active::after { background: #3370ff; }
.lp-grid.left-collapsed .lp-column-resizer:first-of-type { display: none; }
.lp-card-actions { display: flex; align-items: center; gap: 6px; }
.lp-collapse-btn { width: 26px; height: 26px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.lp-collapse-btn:hover { border-color: #9dbcf7; color: #245bdb; }
.lp-collapse-right { position: absolute; top: 10px; right: 10px; z-index: 2; }
.lp-col-right { position: relative; }
.lp-expand-rail { position: absolute; top: 50%; z-index: 5; width: 26px; height: 64px; transform: translateY(-50%); border: 1px solid var(--color-border); background: var(--glass-bg); color: var(--color-text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .08); }
.lp-expand-rail.left { left: 0; border-left: 0; border-radius: 0 8px 8px 0; }
.lp-expand-rail.right { right: 0; border-right: 0; border-radius: 8px 0 0 8px; }
.lp-expand-rail:hover { color: #245bdb; background: #f0f5ff; }
.lp-col-left, .lp-col-mid, .lp-col-right { height: 100%; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
/* 细滚动条：让「内容可滚」有明确视觉暗示（用户实报过"滚动没有/显示不完整"） */
.lp-col-left::-webkit-scrollbar, .lp-col-mid::-webkit-scrollbar, .lp-col-right::-webkit-scrollbar { width: 6px; }
.lp-col-left::-webkit-scrollbar-thumb, .lp-col-mid::-webkit-scrollbar-thumb, .lp-col-right::-webkit-scrollbar-thumb { background: #c9cdd4; border-radius: 3px; }
.lp-col-left::-webkit-scrollbar-thumb:hover, .lp-col-mid::-webkit-scrollbar-thumb:hover, .lp-col-right::-webkit-scrollbar-thumb:hover { background: #a9adb5; }
.lp-card { background: var(--glass-bg); border: 1px solid #e5e6eb; border-radius: 10px; padding: 14px; }
.lp-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.lp-card-head h2 { font-size: 15px; margin: 0; }
.lp-mini, .lp-primary { border: 1px solid #d0d3d9; background: #f5f6f7; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-primary { background: #3370ff; color: #fff; border-color: #3370ff; padding: 8px 14px; font-size: 13px; }
.lp-primary:disabled { opacity: .5; cursor: default; }
.lp-create { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f0f1f3; }
.lp-create input, .lp-create textarea, .lp-input { border: 1px solid #d0d3d9; border-radius: 6px; padding: 7px 9px; font-size: 13px; width: 100%; box-sizing: border-box; }
.lp-hint { color: #8f959e; font-size: 12px; margin: 6px 0 0; }
.lp-tabs { display: flex; gap: 5px; margin-bottom: 14px; flex-shrink: 0; overflow-x: auto; scrollbar-width: thin; }
.lp-tab { flex: 0 0 auto; white-space: nowrap; border: 1px solid #e5e6eb; background: var(--glass-bg); color: #4e5469; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; }
.lp-tab.active { background: #3370ff; border-color: #3370ff; color: #fff; }
.lp-courses { display: flex; flex-direction: column; gap: 10px; }
.lp-stage { display: flex; flex-direction: column; }
.lp-stage-name { font-size: 12px; color: #8f959e; margin: 0 0 6px; letter-spacing: 2px; }
.lp-course { text-align: left; border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 8px; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; color: #1f2329; }
.lp-course:hover { border-color: #3370ff; }
.lp-course.active { border-color: #3370ff; background: #f0f5ff; }
.lp-course.done { background: #f0fff4; border-color: #b7ebc9; }
.lp-course-exam { background: var(--glass-bg); border-color: var(--color-border); }
.lp-course-exam:hover { border-color: #a855f7; }
.lp-course-exam.active { border-color: #9333ea; background: #f3e8ff; box-shadow: inset 3px 0 0 #9333ea; }
.lp-soft-course-state { display: inline-flex; align-items: center; gap: 5px; color: #7e22ce; }
.lp-soft-course-state .lucide-check { color: #9333ea; }
.lp-course-security { background: var(--glass-bg); border-color: var(--color-border); }
.lp-course-security:hover { border-color: #0f766e; }
.lp-course-security.active { border-color: #0f766e; background: #ecfdf5; box-shadow: inset 3px 0 0 #0f766e; }
.lp-security-course-level { color: #0f766e; background: #ccfbf1; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 600; }
.lp-security-course-state { display: inline-flex; align-items: center; gap: 5px; color: #0f766e; }
.lp-soft-course-level { color: #7e22ce; background: #f3e8ff; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 600; }
.lp-course-row { display: flex; justify-content: space-between; align-items: center; }
.lp-course-name { font-size: 13px; font-weight: 600; }
.lp-course-pct { font-size: 11px; color: #3370ff; font-weight: 600; }
.lp-course-bar { height: 5px; border-radius: 3px; background: #eef0f3; overflow: hidden; }
.lp-course-fill { display: block; height: 100%; background: linear-gradient(90deg, #3370ff, #69b1ff); border-radius: 3px; }
.lp-course-meta { font-size: 11px; color: #8f959e; }
.lp-due-badge { font-style: normal; font-size: 10px; color: #e8590c; background: #fff4e6; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
/* 金色复习节点：该关有已学词到期（对标 Duolingo 衰减提醒） */
.lp-level.due { background: #fff8e1; border-color: #f7b500; }
.lp-custom-books { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0f1f3; }
.lp-books { display: flex; flex-direction: column; gap: 6px; }
.lp-book { text-align: left; border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 8px; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; color: #1f2329; position: relative; }
.lp-book.active { border-color: #3370ff; background: #f0f5ff; }
.lp-book-name { font-size: 13px; font-weight: 600; }
.lp-book-meta { font-size: 11px; color: #8f959e; }
.lp-book-del { position: absolute; top: 4px; right: 6px; width: 18px; height: 18px; line-height: 16px; text-align: center; border-radius: 50%; font-style: normal; font-size: 13px; color: #8f959e; cursor: pointer; }
.lp-book-del:hover { background: #fee2e2; color: #d4380d; }
.lp-levels-title { font-size: 14px; margin: 0 0 10px; color: #1f2329; }
.lp-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.lp-level { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid #e5e6eb; border-radius: 10px; padding: 12px 4px; cursor: pointer; background: #fafbfc; color: #1f2329; }
.lp-level:hover { border-color: #3370ff; background: #f0f5ff; }
.lp-level.locked { opacity: .6; }
.lp-level.cleared { background: #f0fff4; border-color: #b7ebc9; }
.lp-no { font-size: 18px; font-weight: 700; }
.lp-stars { color: #f7b500; font-size: 12px; letter-spacing: 1px; }
.lp-words { font-size: 10px; color: #8f959e; }
.lp-wt-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lp-wt-search { max-width: 280px; }
.lp-wt-list { display: flex; flex-direction: column; }
.lp-wt-row { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px solid #f0f1f2; font-size: 13px; line-height: 1.5; }
.lp-wt-row:hover { background: #f7f8fa; }
.lp-wt-pronounce { display: inline-grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); color: var(--color-primary); cursor: pointer; }
.lp-wt-pronounce:hover, .lp-wt-pronounce.active { border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 14%, var(--glass-bg)); }
.lp-wt-pronounce.active svg { animation: lp-sound-pulse .75s ease-in-out infinite alternate; }
.lp-wt-word { min-width: 110px; border: 0; background: transparent; padding: 3px 0; color: var(--color-text); font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.lp-wt-word:hover, .lp-wt-word.speaking { color: var(--color-primary); text-decoration: underline; text-underline-offset: 3px; }
.lp-wt-pho { font-size: 11px; color: #8f959e; white-space: nowrap; }
.lp-wt-gloss { color: #4e5460; }
.lp-pager { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: #646a73; }
.lp-empty { text-align: center; padding: 48px 12px; }
.lp-empty-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
/* 陪练对话（内嵌）：气泡列表 + 底部输入条 */
/* 中栏在陪练 Tab 下改为纵向 flex（tabs 固定 + 对话区吃满剩余），关闭外层滚动让气泡区独立滚 */
.lp-col-mid:has(> .lp-coach-chat) { overflow: hidden; display: flex; flex-direction: column; }
.lp-coach-chat { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lp-live-scene { flex-shrink: 0; border: 1px solid #dbe5f5; background: linear-gradient(180deg, #f8fbff 0%, var(--glass-bg) 100%); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.lp-live-scene-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.lp-live-scene-head h3 { margin: 1px 0 0; font-size: 16px; color: #1f2329; }
.lp-live-scene-badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.lp-live-scene-badges span { border: 1px solid #d6e4ff; background: #f0f5ff; color: #245bdb; border-radius: 999px; padding: 2px 8px; font-size: 10px; white-space: nowrap; }
.lp-live-scene-desc { margin: 7px 0 0; color: #4e5469; font-size: 12px; line-height: 1.55; }
.lp-live-roles { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; font-size: 11px; color: #646a73; }
.lp-live-roles span { display: inline-flex; align-items: center; gap: 4px; }
.lp-live-roles b { color: #1f2329; }
.lp-scene-guide { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.lp-guide-line { display: grid; grid-template-columns: 58px minmax(0, 1fr) 28px; align-items: flex-start; gap: 8px; border: 1px solid #e5e6eb; border-radius: 8px; background: var(--glass-bg); padding: 8px 9px; }
.lp-guide-line.coach { border-color: #d6e4ff; background: #f5f9ff; }
.lp-guide-line.user { border-color: #b7ebc9; background: #f6fff8; }
.lp-guide-who { color: #3370ff; font-size: 11px; font-weight: 700; padding-top: 2px; white-space: nowrap; }
.lp-guide-line.user .lp-guide-who { color: #0f8a3d; }
.lp-guide-line p { margin: 0; color: #1f2329; font-size: 13px; line-height: 1.55; }
.lp-guide-line small { display: block; margin-top: 2px; color: #646a73; font-size: 11px; line-height: 1.5; }
.lp-guide-line .lp-guide-phonetic { color: #3370ff; font-family: "Segoe UI", sans-serif; }
.lp-guide-line .lp-speak { justify-self: end; }
.lp-guide-hidden { display: flex; gap: 9px; align-items: flex-start; border: 1px dashed #d0d3d9; border-radius: 8px; padding: 10px; background: #fafbfc; color: #646a73; }
.lp-guide-hidden p { margin: 0; font-size: 13px; font-weight: 600; color: #1f2329; }
.lp-guide-hidden small { display: block; margin-top: 2px; font-size: 11px; line-height: 1.5; }
.lp-live-scene-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
.lp-live-scene-actions .lp-mini { display: inline-flex; align-items: center; gap: 4px; }
.lp-mic-status { display: inline-flex; align-items: center; gap: 5px; flex: 1; min-width: 180px; color: #646a73; font-size: 11px; }
.lp-mic-status.recording { color: #d4380d; font-weight: 600; }
.lp-mic-status.transcribing, .lp-mic-status.requesting { color: #3370ff; }
.lp-chat-msgs { flex: 1; min-height: 120px; overflow-y: auto; padding: 4px 2px 12px; }
.lp-chat-row { display: flex; margin-bottom: 12px; }
.lp-chat-row.user { justify-content: flex-end; }
.lp-chat-row.assistant { justify-content: flex-start; }
.lp-chat-bubble { max-width: 78%; background: color-mix(in srgb, var(--color-primary) 9%, var(--glass-bg)); border-radius: 12px; padding: 10px 14px; position: relative; }
.lp-chat-row.user .lp-chat-bubble { background: color-mix(in srgb, var(--color-primary) 16%, var(--glass-bg)); }
.lp-chat-row.assistant .lp-chat-bubble { background: var(--glass-bg-hover); }
.lp-chat-text { margin: 0; font-size: 14px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; color: var(--color-text); }
.lp-chat-bubble .lp-speak { position: absolute; right: 6px; bottom: -14px; }
.lp-chat-typing { font-size: 12px; color: var(--color-text-tertiary); padding: 4px 8px; }
.lp-chat-input { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--color-border); padding-top: 10px; }
.lp-chat-entry { flex: 1; }
.lp-input-icon { width: 34px; height: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lp-muted-icon { opacity: .35; }

/* 宠物主舞台：陪练时只保留一个说话入口，对话文字默认收起。 */
.lp-voice-studio { gap: 0; }
.lp-practice-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; padding: 0 2px 10px; }
.lp-practice-title { min-width: 0; }
.lp-practice-title h2 { margin: 2px 0 3px; font-size: 18px; line-height: 1.35; color: var(--color-text); }
.lp-practice-title > p:last-child { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.55; max-width: 680px; }
.lp-scene-round-progress { display: grid; grid-template-columns: auto minmax(100px, 220px) minmax(0, 1fr); align-items: center; gap: 7px; margin-top: 7px; color: var(--color-text-tertiary); font-size: 9px; }
.lp-scene-round-progress > div { height: 4px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-text) 10%, transparent); }
.lp-scene-round-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width .2s ease; }
.lp-scene-round-progress small { overflow: hidden; color: var(--color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.lp-practice-tools { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.lp-tool-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 30px; border: 1px solid var(--color-border); background: var(--glass-bg); color: var(--color-text-secondary); border-radius: 7px; padding: 4px 9px; font-size: 11px; cursor: pointer; white-space: nowrap; }
.lp-tool-button:hover { border-color: #9dbcf7; color: #245bdb; }
.lp-tool-button.active { border-color: #9dbcf7; background: #f0f5ff; color: #245bdb; }
.lp-tool-button.danger { border-color: #fecaca; background: #fff7f7; color: #b91c1c; }
.lp-tool-button:disabled { opacity: .5; cursor: default; }
.lp-scene-compact {
  position: absolute;
  top: 54px;
  right: 0;
  z-index: 70;
  width: min(620px, calc(100% - 16px));
  max-height: min(360px, calc(100vh - 220px));
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  border-left: 3px solid var(--color-primary);
  border-radius: 9px;
  background: var(--skin-popover-veil, var(--glass-bg-panel-sm, #f8fbff));
  background-image: none;
  padding: 10px 12px;
  margin: 0;
  box-shadow: 0 16px 40px color-mix(in srgb, #000 32%, transparent);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.lp-scene-compact-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.lp-scene-compact-head b { color: var(--color-text); font-size: 12px; }
.lp-scene-compact-head button { display: inline-grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text-secondary); cursor: pointer; }
.lp-scene-compact-roles { display: flex; flex-wrap: wrap; gap: 5px 14px; color: #646a73; font-size: 11px; }
.lp-scene-compact-roles span { display: inline-flex; align-items: center; gap: 4px; }
.lp-scene-compact-roles b { color: #1f2329; }
.lp-scene-mission-track { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.lp-scene-mission-track span { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 2px 7px 2px 3px; font-size: 9px; }
.lp-scene-mission-track b { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: color-mix(in srgb, var(--color-text) 10%, transparent); color: var(--color-text); font-size: 8px; }
.lp-scene-mission-track span.active { border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border)); color: var(--color-primary); }
.lp-scene-mission-track span.active b { background: var(--color-primary); color: #fff; }
.lp-scene-mission-track span.done { opacity: .72; }
.lp-scene-lines { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
.lp-scene-lines > div { position: relative; border: 1px solid #e5e6eb; border-radius: 7px; background: var(--glass-bg); padding: 7px 28px 7px 9px; }
.lp-scene-lines span { color: #3370ff; font-size: 10px; font-weight: 700; }
.lp-scene-lines > div:last-child span { color: #0f8a3d; }
.lp-scene-lines p { margin: 2px 0 0; color: #1f2329; font-size: 12px; line-height: 1.5; }
.lp-scene-lines small { display: block; margin-top: 2px; color: #8f959e; font-size: 10px; }
.lp-scene-lines .lp-speak { position: absolute; top: 5px; right: 4px; }
.lp-pet-stage { position: relative; flex: 1; min-height: 380px; max-height: 480px; display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); grid-template-areas: "pet speech"; align-items: stretch; gap: 20px; padding: 10px 18px 0; border: 1px solid #e3e8f2; border-radius: 12px; background: #f7f9fc; overflow: hidden; }
.lp-coach-stage { grid-area: pet; align-self: stretch; justify-self: center; width: min(380px, 100%); height: 100%; min-height: 0; border: 0; border-radius: 0; background: transparent !important; overflow: hidden; }
.lp-speech-column { grid-area: speech; display: flex; flex-direction: column; justify-content: center; gap: 10px; min-width: 0; min-height: 0; max-height: 100%; overflow: hidden; }
.lp-pet-speech { position: relative; max-height: min(300px, 46vh); overflow-y: auto; border: 1px solid #dbe5f5; border-radius: 12px; background: var(--glass-bg); padding: 12px 42px 12px 14px; box-sizing: border-box; }
.lp-pet-speech::after { content: ""; position: absolute; left: -7px; top: 42px; width: 12px; height: 12px; border-left: 1px solid #dbe5f5; border-bottom: 1px solid #dbe5f5; background: var(--glass-bg); transform: rotate(45deg); }
.lp-pet-speech-head { display: flex; align-items: center; gap: 7px; color: #245bdb; font-size: 11px; font-weight: 700; }
.lp-pet-speech-head i { font-style: normal; color: #8f959e; font-weight: 400; }
.lp-pet-speech p { margin: 4px 0 0; color: var(--color-text); font-size: 14px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.lp-pet-speech > .lp-speak { position: absolute; right: 8px; bottom: 8px; }
.lp-coach-start { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; border: 1px solid #3370ff; border-radius: 7px; background: #3370ff; color: #fff; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
.lp-coach-start:disabled { opacity: .55; cursor: default; }
.lp-user-echo { border: 1px solid #b7ebc9; border-radius: 9px; background: #f3fff6; padding: 7px 10px; }
.lp-user-echo span { display: block; color: #0f8a3d; font-size: 10px; font-weight: 700; }
.lp-user-echo p { margin: 2px 0 0; color: #1f2329; font-size: 12px; line-height: 1.45; }
.lp-mic-radar { position: absolute; left: 170px; bottom: 20px; display: none; align-items: flex-end; gap: 4px; transform: translateX(-50%); }
.lp-mic-radar.recording { display: flex; }
.lp-mic-radar i { width: 3px; height: 10px; border-radius: 2px; background: #d4380d; animation: lp-wave 1s ease-in-out infinite; }
.lp-mic-radar i:nth-child(2) { height: 18px; animation-delay: .12s; }
.lp-mic-radar i:nth-child(3) { height: 14px; animation-delay: .24s; }
.lp-mic-radar i:nth-child(4) { height: 8px; animation-delay: .36s; }
@keyframes lp-wave { 0%, 100% { transform: scaleY(.55); } 50% { transform: scaleY(1.35); } }
@keyframes lp-sound-pulse { from { transform: scale(.88); opacity: .72; } to { transform: scale(1.08); opacity: 1; } }
.lp-voice-dock { display: flex; align-items: center; gap: 12px; padding: 12px 2px 8px; }
.lp-talk-button { width: 62px; height: 62px; flex: 0 0 62px; border: 0; border-radius: 50%; background: #3370ff; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(51, 112, 255, .22); }
.lp-talk-button:hover { background: #2861d9; }
.lp-talk-button.recording { background: #d4380d; animation: lp-mic-pulse 1.3s ease-in-out infinite; }
.lp-talk-button.busy { opacity: .72; cursor: default; }
.lp-talk-copy { display: flex; flex-direction: column; gap: 2px; min-width: 180px; flex: 1; }
.lp-talk-copy strong { color: var(--color-text); font-size: 15px; }
.lp-talk-copy span { color: var(--color-text-secondary); font-size: 12px; }
.lp-dock-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.lp-text-fallback { display: flex; gap: 8px; padding: 0 2px 10px; }
.lp-text-fallback .lp-chat-entry { min-width: 0; }
.lp-coach-side { display: flex; flex-direction: column; overflow: hidden; padding: 12px; transition: padding .18s ease; }
.lp-coach-side.collapsed { padding: 12px 5px; align-items: center; }
.lp-side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; }
.lp-side-title { display: flex; align-items: center; gap: 7px; color: var(--color-text); font-size: 12px; font-weight: 600; min-width: 0; }
.lp-side-toggle { width: 26px; height: 26px; flex: 0 0 26px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.lp-side-toggle:hover { border-color: #9dbcf7; color: #245bdb; }
.lp-coach-side.collapsed .lp-side-head { flex-direction: column; gap: 8px; }
.lp-coach-side.collapsed .lp-side-title { flex-direction: column; gap: 7px; }
.lp-coach-side.collapsed .lp-side-title span { writing-mode: vertical-rl; text-orientation: mixed; letter-spacing: 1px; }
.lp-side-body { display: flex; flex-direction: column; flex: 1; min-height: 0; margin-top: 8px; }
.lp-side-meta { margin: 0 0 7px; color: var(--color-text-tertiary); font-size: 10px; flex-shrink: 0; }
.lp-side-body .lp-chat-msgs { flex: 1; min-height: 0; max-height: none; overflow-y: auto; padding: 2px 2px 8px; }
.lp-side-body .lp-chat-row { margin-bottom: 9px; }
.lp-side-body .lp-chat-bubble { max-width: 94%; padding: 8px 10px; }
.lp-side-body .lp-chat-text { font-size: 12px; line-height: 1.55; }
.lp-soft-materials { overflow-y: auto; }
.lp-soft-side-tabs { display: flex; gap: 3px; margin: 0 32px 10px 0; padding: 3px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg-hover); }
.lp-soft-side-tabs button { flex: 1; min-width: 0; white-space: nowrap; border: 0; border-radius: 6px; background: transparent; color: var(--color-text-secondary); padding: 5px 4px; font-size: 10px; cursor: pointer; }
.lp-soft-side-tabs button.active { background: var(--glass-bg); color: #7e22ce; font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
.lp-soft-exam-panel { display: flex; flex-direction: column; gap: 9px; }
.lp-soft-plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.lp-soft-plan-form label { display: flex; flex-direction: column; gap: 3px; color: var(--color-text-tertiary); font-size: 10px; }
.lp-soft-plan-form label > span { display: inline-flex; align-items: center; gap: 3px; }
.lp-soft-plan-form select, .lp-soft-plan-form input { width: 100%; box-sizing: border-box; height: 30px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text); padding: 0 7px; font-size: 11px; }
.lp-soft-countdown { display: flex; align-items: center; gap: 6px; border: 1px solid #e9d5ff; border-radius: 8px; background: #faf5ff; color: #7e22ce; padding: 8px 10px; font-size: 13px; font-weight: 600; }
.lp-soft-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.lp-soft-actions .lp-primary { flex: 1 1 100%; }
.lp-soft-actions .lp-mini { flex: 1; }
.lp-soft-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; padding-top: 9px; border-top: 1px solid var(--color-border); }
.lp-soft-section-head h3 { margin: 0; color: var(--color-text); font-size: 12px; }
.lp-soft-section-head > span { color: var(--color-text-tertiary); font-size: 10px; }
.lp-soft-live-time { margin: 0; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
.lp-soft-live-error { margin: 0; color: #b91c1c; font-size: 11px; }
.lp-soft-notices { display: flex; flex-direction: column; gap: 5px; }
.lp-soft-notices button { width: 100%; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); color: var(--color-text); padding: 7px 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.lp-soft-notices button:hover { border-color: #a855f7; background: #fdfbff; }
.lp-soft-notices span { color: #7e22ce; font-size: 9px; font-weight: 700; }
.lp-soft-notices b { font-size: 11px; line-height: 1.45; font-weight: 500; }
.lp-soft-study-plan { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
.lp-soft-study-plan article { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 7px; border-bottom: 1px dashed var(--color-border); padding: 5px 0; }
.lp-soft-study-plan article > span { color: #7e22ce; font-size: 10px; font-weight: 700; }
.lp-soft-study-plan b { color: var(--color-text); font-size: 11px; }
.lp-soft-study-plan p { margin: 2px 0 0; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.45; }
.lp-soft-material-panel, .lp-soft-knowledge-panel, .lp-soft-knowledge { display: flex; flex-direction: column; gap: 5px; }
.lp-soft-material-range { color: var(--lp-primary); background: var(--lp-primary-soft); border: 1px solid color-mix(in srgb, var(--lp-primary) 30%, var(--lp-border)); border-radius: 999px; padding: 2px 7px; font-size: 10px; }
.lp-soft-material-list { display: flex; flex-direction: column; gap: 9px; margin-top: 9px; }
.lp-soft-material { border: 1px solid color-mix(in srgb, var(--lp-primary) 24%, var(--lp-border)); border-radius: 8px; background: color-mix(in srgb, var(--lp-primary) 7%, var(--lp-surface)); padding: 9px; }
.lp-soft-material-badges { display: flex; gap: 4px; flex-wrap: wrap; }
.lp-soft-material-badges span { border: 1px solid color-mix(in srgb, var(--lp-primary) 30%, var(--lp-border)); border-radius: 4px; background: var(--lp-primary-soft); color: var(--lp-primary); padding: 1px 5px; font-size: 9px; }
.lp-soft-material h3 { margin: 5px 0 3px; color: var(--color-text); font-size: 12px; line-height: 1.45; }
.lp-soft-material p { margin: 0 0 7px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
.lp-soft-material .lp-mini { width: 100%; }
.lp-soft-free-resources { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; padding: 10px; border: 1px solid color-mix(in srgb, var(--lp-primary) 28%, var(--lp-border)); border-radius: 8px; background: color-mix(in srgb, var(--lp-primary) 6%, var(--lp-surface)); }
.lp-soft-free-resources > p { margin: 0; color: var(--lp-text-tertiary); font-size: 10px; line-height: 1.55; }
.lp-soft-free-steps { margin: 0; padding-left: 17px; color: var(--lp-text-secondary); font-size: 10px; line-height: 1.65; }
.lp-soft-free-card { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--lp-border); border-radius: 7px; background: var(--lp-surface); }
.lp-soft-free-card-head { display: flex; align-items: flex-start; gap: 5px; color: var(--lp-text); }
.lp-soft-free-card-head > span { flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--lp-primary) 32%, var(--lp-border)); border-radius: 4px; background: var(--lp-primary-soft); color: var(--lp-primary); padding: 1px 5px; font-size: 8px; font-weight: 700; }
.lp-soft-free-card-head b { font-size: 10px; line-height: 1.45; }
.lp-soft-free-card p { margin: 0; color: var(--lp-text-tertiary); font-size: 9px; line-height: 1.55; }
.lp-soft-free-card small { color: var(--lp-text-tertiary); font-size: 8px; line-height: 1.45; }
.lp-soft-free-card .lp-soft-free-usage { color: var(--lp-text-secondary); }
.lp-soft-free-usage b { color: var(--lp-primary); }
.lp-soft-free-card .lp-mini { width: 100%; margin-top: 2px; }
.lp-soft-official-books { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; padding: 10px; border: 1px solid var(--lp-border); border-radius: 8px; background: var(--lp-surface-hover); }
.lp-soft-official-books .lp-soft-section-head { margin: 0; padding: 0; border: 0; }
.lp-soft-official-books p { margin: 0; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.55; }
.lp-soft-official-books .lp-primary { width: 100%; box-sizing: border-box; }
.lp-soft-knowledge-domain { padding: 8px 0; border-bottom: 1px dashed var(--color-border); }
.lp-soft-knowledge-domain h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; color: var(--color-text); font-size: 12px; }
.lp-soft-knowledge-domain h3 span { color: var(--lp-primary); font-size: 9px; font-weight: 700; }
.lp-soft-knowledge-chapters { display: flex; flex-wrap: wrap; gap: 4px; }
.lp-soft-knowledge-chapters span { border: 1px solid var(--color-border); border-radius: 5px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 2px 5px; font-size: 9px; line-height: 1.4; }
.lp-soft-book { width: 100%; border: 1px solid var(--lp-border); border-radius: 7px; background: var(--lp-surface); color: var(--lp-text); padding: 7px 8px; display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; }
.lp-soft-book:hover { border-color: var(--lp-primary); background: var(--lp-surface-hover); }
.lp-soft-book > span { color: var(--lp-primary); font-size: 9px; font-weight: 700; }
.lp-soft-book b { font-size: 11px; line-height: 1.45; }
.lp-soft-book small { color: var(--color-text-tertiary); font-size: 9px; line-height: 1.45; }
.lp-security-boundary { overflow-y: auto; }
.lp-security-warning { display: flex; align-items: flex-start; gap: 8px; border-left: 3px solid var(--color-warning); border-radius: 0 8px 8px 0; background: color-mix(in srgb, var(--color-warning) 10%, var(--lp-surface)); padding: 9px 10px; color: var(--color-warning); }
.lp-security-warning svg { flex-shrink: 0; }
.lp-security-warning p { margin: 0; font-size: 10px; line-height: 1.55; }
.lp-security-rule { border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 9px; }
.lp-security-rule h3 { margin: 0 0 4px; color: var(--color-text); font-size: 12px; }
.lp-security-rule ul { margin: 0; padding-left: 17px; color: var(--color-text-secondary); font-size: 10px; line-height: 1.65; }
.lp-security-rule p { margin: 0; color: var(--color-text-secondary); font-size: 10px; line-height: 1.55; }
.lp-mic-button { width: 38px; height: 38px; border: 1px solid #d6e4ff; border-radius: 50%; background: #f0f5ff; color: #3370ff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.lp-mic-button:hover { border-color: #3370ff; background: #e8f1ff; }
.lp-mic-button.recording { color: #fff; background: #d4380d; border-color: #d4380d; animation: lp-mic-pulse 1.3s ease-in-out infinite; }
.lp-mic-button.busy { opacity: .7; cursor: default; }
.lp-scene-result-error { border: 1px solid #fecaca; background: #fff7f7; color: #b91c1c; border-radius: 8px; padding: 8px 10px; font-size: 12px; margin-bottom: 10px; }
.lp-spin { animation: lp-spin .85s linear infinite; }
@keyframes lp-spin { to { transform: rotate(360deg); } }
@keyframes lp-mic-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(212, 56, 13, .25); } 50% { box-shadow: 0 0 0 6px rgba(212, 56, 13, 0); } }
.lp-stop { background: #d4380d; border-color: #d4380d; }

.lp-drill-title { font-size: 13px; color: #4e5469; margin: 0 0 10px; }
/* 单题聚焦模式：进度条 + 大题卡 + 圆点导航（替代 10 题平铺） */
.lp-drill-meter { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
.lp-drill-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--color-border, #e5e6eb); overflow: hidden; }
.lp-drill-bar span { display: block; height: 100%; background: var(--color-primary, #3370ff); border-radius: 3px; transition: width 0.2s; }
.lp-drill-count { font-size: 12px; color: #8f959e; white-space: nowrap; }
.lp-score-live { font-size: 12px; font-weight: 700; color: #3370ff; background: #f0f5ff; border: 1px solid #d6e4ff; border-radius: 6px; padding: 3px 7px; white-space: nowrap; }
.lp-focus { border: 1px solid var(--color-border, #e5e6eb); border-radius: 12px; padding: 22px 24px; text-align: center; background: var(--glass-bg); }
.lp-focus-kind { margin: 0 0 12px; font-size: 12px; color: #8f959e; }
.lp-focus-kind b { color: #4e5469; margin-right: 8px; }
.lp-focus-body { min-height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.lp-focus-word { font-size: 26px; font-weight: 600; color: var(--color-text, #1f2329); margin: 0; line-height: 1.4; }
.lp-focus-cloze { font-size: 17px; font-weight: 500; }
.lp-focus-pho { font-size: 14px; color: #8f959e; font-style: normal; font-weight: 400; margin-left: 8px; }
.lp-focus-hint { font-size: 13px; color: #8f959e; margin: 0; }
.lp-bigplay { border: 1px solid var(--color-border, #e5e6eb); background: var(--glass-bg-hover, #f0f2f7); border-radius: 999px; padding: 10px 22px; font-size: 15px; cursor: pointer; color: var(--color-text, #1f2329); }
.lp-bigplay:hover { border-color: #3370ff; color: #3370ff; }
.lp-focus-input { max-width: 340px; margin: 16px auto 0; display: block; text-align: center; font-size: 16px; padding: 9px 12px; }
.lp-focus-input.correct { border-color: #22c55e; background: #f0fdf4; }
.lp-focus-input.wrong { border-color: #ef4444; background: #fff7f7; }
.lp-focus-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
.lp-dots { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
.lp-dot { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--color-border, #e5e6eb); background: var(--glass-bg); font-size: 11px; cursor: pointer; color: #8f959e; padding: 0; }
.lp-dot.done { background: #3370ff; border-color: #3370ff; color: #fff; }
.lp-dot.done.wrong { background: #fff1f0; border-color: #ef4444; color: #b91c1c; }
.lp-dot.draft { border-color: #f7b500; color: #b45309; background: #fffbeb; }
.lp-dot.cur { border-color: #3370ff; color: #3370ff; font-weight: 600; box-shadow: 0 0 0 2px #3370ff22; }
.lp-kind { margin-left: 6px; font-size: 10px; color: #3370ff; background: #f0f5ff; border-radius: 4px; padding: 1px 6px; }
.lp-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
.lp-opt { text-align: left; border: 1px solid var(--color-border, #e5e6eb); border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer; background: var(--glass-bg); color: var(--color-text, #1f2329); transition: border-color 0.15s; }
.lp-opt:hover { border-color: #3370ff; }
.lp-opt.picked { border-color: #3370ff; background: #f0f5ff; }
.lp-opt.correct { border-color: #22c55e; background: #f0fdf4; color: #166534; }
.lp-opt.wrong { border-color: #ef4444; background: #fff7f7; color: #b91c1c; }
.lp-opt:disabled { cursor: default; }
.lp-answer-feedback { margin: 14px auto 0; max-width: 520px; text-align: left; border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #166534; line-height: 1.55; }
.lp-answer-feedback.wrong { border-color: #fecaca; background: #fff7f7; color: #991b1b; }
.lp-answer-feedback p { margin: 0; }
.lp-answer-feedback p + p { margin-top: 4px; }
.lp-answer-feedback-title { display: flex; align-items: center; gap: 7px; font-size: 13px; }
.lp-answer-feedback-title span { color: #4e5469; font-weight: 600; }
.lp-answer-expected { padding-top: 5px; border-top: 1px dashed currentColor; }
.lp-answer-reveal { margin-top: 8px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 6px; padding: 4px 9px; font-size: 12px; cursor: pointer; }
.lp-answer-reveal:hover { background: var(--glass-bg-hover, #f5f6f7); }
.lp-result { font-size: 13px; }
.lp-result.pass { color: #0f8a3d; }
.lp-result-stars { font-size: 20px; color: #f7b500; letter-spacing: 2px; margin: 4px 0; }
.lp-result-stars b { color: #3370ff; font-size: 16px; margin-left: 6px; }
.lp-result ul { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12px; }
.lp-result li { padding: 3px 0; border-bottom: 1px dashed #eee; }
.lp-result li.wrong { color: #d4380d; }
.lp-errors { list-style: none; padding: 0; margin: 0; font-size: 12px; }
.lp-errors li { padding: 6px 0; border-bottom: 1px dashed #eee; }
.lp-errors p { margin: 0 0 2px; }
.lp-speak { border: none; background: transparent; cursor: pointer; font-size: 13px; padding: 0 4px; }
.lp-speak:disabled { opacity: .4; cursor: default; }
.lp-review { text-align: left; }
.lp-review-count { font-size: 14px; margin: 4px 0 10px; }
.lp-review .lp-primary { width: 100%; }
.lp-primary.rec { background: #d4380d; border-color: #d4380d; }
.lp-transcript { font-size: 13px; background: #f6f8fc; border-radius: 6px; padding: 8px 10px; }
/* P2 发音打分：逐词比对（绿=读对 / 红=读错 / 灰删除线=漏读） */
.lp-pron { margin-top: 6px; }
.lp-pron-score { font-size: 13px; margin: 0 0 4px; }
.lp-pron-score b.good { color: #0f8a3d; }
.lp-pron-score b.mid { color: #e8590c; }
.lp-pron-words { display: flex; flex-wrap: wrap; gap: 4px 8px; margin: 0; }
.lp-pron-w { font-size: 12px; border-radius: 4px; padding: 1px 5px; background: #f0fff4; color: #0f8a3d; }
.lp-pron-w.wrong { background: #fff1f0; color: #d4380d; }
.lp-pron-w.missing { background: #f2f3f5; color: #8f959e; text-decoration: line-through; }
.lp-pron-heard { font-style: normal; font-size: 11px; opacity: .85; }
.lp-eyebrow { margin: 0; color: #3370ff; font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
.lp-scene-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; margin-bottom: 12px; }
.lp-scene-head h3 { margin: 2px 0 0; font-size: 17px; color: #1f2329; }
.lp-scene-filter { display: flex; flex-direction: column; gap: 4px; color: #8f959e; font-size: 10px; flex-shrink: 0; }
.lp-scene-filter select { min-width: 180px; border: 1px solid #d0d3d9; border-radius: 6px; background: var(--glass-bg); color: #1f2329; padding: 7px 9px; font-size: 12px; }
.lp-scene-loading, .lp-scene-empty { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 180px; border: 1px dashed #d0d3d9; border-radius: 8px; color: #8f959e; font-size: 12px; }
.lp-scene-empty { flex-direction: column; }
.lp-scene-empty p { margin: 0; }
.lp-scene-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; align-items: stretch; }
.lp-scene { text-align: left; border: 1px solid #e5e6eb; background: var(--glass-bg); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; color: #1f2329; min-width: 0; }
.lp-scene:hover { border-color: #9dbcf7; }
.lp-scene-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.lp-scene-theme { color: #646a73; font-size: 10px; font-weight: 600; }
.lp-scene-level { border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 600; white-space: nowrap; }
.lp-scene-level.level-热身 { background: #eefaf2; color: #0f8a3d; border: 1px solid #b7ebc9; }
.lp-scene-level.level-挑战 { background: #f0f5ff; color: #245bdb; border: 1px solid #d6e4ff; }
.lp-scene-level.level-实战 { background: #fff7e8; color: #ad6800; border: 1px solid #ffe2a8; }
.lp-scene-title { font-size: 15px; font-weight: 700; line-height: 1.35; margin: 0; }
.lp-scene-desc { font-size: 12px; color: #4e5469; line-height: 1.55; margin: 0; min-height: 38px; }
.lp-scene-facts { display: flex; flex-wrap: wrap; gap: 5px 10px; color: #8f959e; font-size: 10px; min-width: 0; }
.lp-scene-facts span { display: inline-flex; align-items: center; gap: 3px; min-width: 0; }
.lp-scene-facts span:last-child { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-scene-missions { border-top: 1px dashed #e5e6eb; padding-top: 7px; }
.lp-scene-missions > p { margin: 0 0 4px; color: #646a73; font-size: 10px; font-weight: 700; }
.lp-scene-missions ol { margin: 0; padding-left: 17px; color: #4e5469; font-size: 11px; line-height: 1.55; }
.lp-scene-missions li::marker { color: #3370ff; font-weight: 700; }
.lp-scene-phrases { display: flex; flex-wrap: wrap; gap: 4px; }
.lp-scene-phrases span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 4px; background: #f3f6fb; color: #4e5469; padding: 2px 6px; font-size: 10px; }
.lp-scene-role { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #646a73; font-size: 10px; }
.lp-scene-role span:first-child { color: #3370ff; }
.lp-scene-role span:last-child { color: #0f8a3d; }
.lp-scene-foot { margin-top: auto; padding-top: 7px; border-top: 1px solid #f0f1f3; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lp-scene-exit { color: #8f959e; font-size: 10px; line-height: 1.45; }
.lp-scene-action { border: 1px solid #3370ff; border-radius: 6px; background: #3370ff; color: #fff; padding: 6px 9px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.lp-scene-action:hover { background: #2861d9; }
.lp-scene-action:disabled { opacity: .65; cursor: default; }
@media (max-width: 900px) {
  :global(.main-content:has(.learning-page)) { overflow-y: auto; overscroll-behavior: contain; }
  .learning-page { padding: 12px; min-height: 0; height: auto; flex: none; }
  .lp-topbar { align-items: flex-start; flex-direction: column; gap: 5px; }
  .lp-top-status { text-align: left; }
  .lp-grid { display: flex; flex-direction: column; gap: 10px; min-height: 0; height: auto; flex: none; }
  .lp-column-resizer { display: none; }
  .lp-col-left, .lp-col-mid, .lp-col-right { width: 100%; height: auto; max-height: none; overflow: visible; }
  .lp-courses-security-mobile { flex-direction: row; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .lp-courses-security-mobile .lp-stage { flex-direction: row; gap: 6px; }
  .lp-courses-security-mobile .lp-stage-name { display: none; }
  .lp-courses-security-mobile .lp-course-security { flex: 0 0 188px; }
  .lp-courses-security-mobile .lp-course-meta { display: none; }
  .lp-col-mid:has(> .lp-coach-chat) { overflow: visible; min-height: 70vh; }
  .lp-coach-chat { min-height: 70vh; }
  .lp-chat-msgs { min-height: 260px; max-height: 50vh; }
  .lp-practice-head { flex-direction: column; }
  .lp-practice-tools { justify-content: flex-start; }
  .lp-scene-lines { grid-template-columns: 1fr; }
  .lp-pet-stage { min-height: 0; grid-template-columns: 1fr; grid-template-areas: "speech" "pet"; gap: 10px; padding: 12px; }
  .lp-speech-column { grid-area: speech; }
  .lp-pet-speech::after { left: 50%; top: auto; bottom: -7px; border: 0; border-right: 1px solid #dbe5f5; border-bottom: 1px solid #dbe5f5; transform: translateX(-50%) rotate(45deg); }
  .lp-coach-stage { grid-area: pet; justify-self: center; width: 330px; height: 340px; }
  .lp-scene-compact { position: fixed; top: 92px; right: 12px; left: 12px; width: auto; max-height: calc(100vh - 160px); }
  .lp-mic-radar { left: 50%; bottom: 12px; }
  .lp-coach-side.collapsed { min-height: 40px; padding: 7px 12px; align-items: stretch; }
  .lp-coach-side.collapsed .lp-side-head { flex-direction: row; }
  .lp-coach-side.collapsed .lp-side-title { flex-direction: row; }
  .lp-coach-side.collapsed .lp-side-title span { writing-mode: horizontal-tb; letter-spacing: 0; }
  .lp-voice-dock { align-items: flex-start; flex-wrap: wrap; }
  .lp-dock-actions { width: 100%; justify-content: flex-start; }
  .lp-tabs { overflow-x: auto; padding-bottom: 3px; scrollbar-width: thin; }
  .lp-tab { flex-shrink: 0; }
  .lp-scene-head { align-items: stretch; flex-direction: column; }
  .lp-scene-filter select { width: 100%; }
  .lp-scene-grid { grid-template-columns: 1fr; }
  .lp-live-scene-head { flex-direction: column; }
  .lp-live-scene-badges { justify-content: flex-start; }
  .lp-guide-line { grid-template-columns: 52px minmax(0, 1fr) 24px; }
  .lp-chat-input { flex-wrap: wrap; }
  .lp-chat-entry { min-width: 180px; }
}
.lp-col-mid:has(> .lp-reading-layout) { overflow: hidden; display: flex; flex-direction: column; }
.lp-reading-layout { flex: 1; min-height: 0; width: 100%; display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: stretch; }
.lp-reading-library { min-height: 0; overflow-y: auto; border-right: 1px solid var(--color-border); padding-right: 14px; }
.lp-reading-library-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.lp-reading-library-head h3 { margin: 0; color: var(--color-text); font-size: 14px; }
.lp-reading-library-head span { color: var(--color-text-tertiary); font-size: 10px; }
.lp-reading-levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.lp-reading-levels button { border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 5px 2px; font-size: 10px; cursor: pointer; }
.lp-reading-levels button:hover { border-color: #9dbcf7; color: #245bdb; }
.lp-reading-levels button.active { border-color: #3370ff; background: #3370ff; color: #fff; }
.lp-reading-topic { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 9px 0; color: var(--color-text-tertiary); font-size: 10px; }
.lp-reading-topic select { min-width: 120px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text); padding: 5px 7px; font-size: 11px; }
.lp-reading-list { display: flex; flex-direction: column; gap: 6px; }
.lp-reading-card { width: 100%; text-align: left; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text); padding: 8px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.lp-reading-card:hover { border-color: #9dbcf7; background: #f8fbff; }
.lp-reading-card.active { border-color: #3370ff; background: #f0f5ff; }
.lp-reading-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.lp-reading-card-top b { font-size: 12px; line-height: 1.4; }
.lp-reading-card-meta { color: var(--color-text-tertiary); font-size: 10px; }
.lp-reading-difficulty { flex: 0 0 auto; border-radius: 4px; padding: 1px 5px; font-size: 9px; font-style: normal; font-weight: 600; }
.lp-reading-difficulty.level-简单 { color: #0f8a3d; background: #eefaf2; }
.lp-reading-difficulty.level-中级 { color: #245bdb; background: #eef4ff; }
.lp-reading-difficulty.level-困难 { color: #b45309; background: #fff7e8; }
.lp-reader { min-height: 0; overflow-y: auto; padding-right: 8px; }
.lp-reader-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.lp-reader-head h3 { margin: 5px 0 0; color: var(--color-text); font-size: 19px; line-height: 1.35; }
.lp-reader-head > svg { color: #3370ff; flex-shrink: 0; }
.lp-reader-badges { display: flex; gap: 5px; flex-wrap: wrap; }
.lp-reader-badges span { border: 1px solid var(--color-border); border-radius: 999px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 2px 7px; font-size: 10px; }
.lp-reader-tip { margin: 7px 0 14px; color: var(--color-text-tertiary); font-size: 11px; }
.lp-para { margin-bottom: 12px; }
.lp-para-en { font-size: 15px; line-height: 1.8; margin: 0; cursor: text; color: var(--color-text); }
.lp-para-zh { font-size: 12px; color: var(--color-text-tertiary); margin: 4px 0 0; line-height: 1.65; }
.lp-para-actions { display: inline-flex; align-items: center; gap: 1px; margin-left: 3px; }
.lp-para-actions .lp-speak { width: 22px; height: 22px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; color: var(--color-text-secondary); }
.lp-para-actions .lp-speak:hover { background: #f0f5ff; color: #245bdb; }
.lp-reader-collect { margin-top: 4px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 6px 10px; font-size: 11px; cursor: pointer; }
.lp-reader-collect:hover { border-color: #9dbcf7; color: #245bdb; }
.lp-reader-collect:disabled { opacity: .55; cursor: default; }
.lp-reader-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 260px; color: var(--color-text-tertiary); }
.lp-reader-empty p { margin: 0; color: var(--color-text-secondary); font-size: 13px; }
.lp-reader-empty span { font-size: 11px; }
@media (max-width: 900px) {
  .lp-col-mid:has(> .lp-reading-layout) { overflow: visible; }
  .lp-reading-layout { grid-template-columns: 1fr; min-height: 0; }
  .lp-reading-library { border-right: 0; border-bottom: 1px solid var(--color-border); padding: 0 0 12px; overflow: visible; }
  .lp-reading-list { max-height: 320px; overflow-y: auto; }
  .lp-reader { overflow: visible; padding-right: 0; }
}
</style>
