<script setup lang="ts">
// 学习模式工作区（learning 模式主界面）。
// 布局契约：三栏骨架**任何 Tab 下都不变**（左=课程 / 中=工作区 / 右=状态）——
// 此前 Tab 切换时中栏整块换布局导致"样式跳来跳去"，已废弃。
// 选中课程后关卡地图直接出现在中栏（此前藏在左栏滚动区外，用户感知"点了没用"）。
// 科目架构：科目分段预留（日语/数学/物理筹备中），课程目录按科目过滤（服务端 ?subject=）。
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client';
import { useChatStore } from '../stores/chat';
import { usePlatformStore } from '../stores/platform';
import { setMode, activeMode } from '../stores/mode';
import LearnStage from '../components/learning/LearnStage.vue';
import { stripSceneResultBlocks } from '../utils/scene-result';

/** ★ 与 apps/server/src/builtin-learning-agents.ts 的 LEARNING_AGENT_ID 成对维护（服务端有契约单测） */
const LEARNING_AGENT_ID = 'a_builtin_learning_coach';

const router = useRouter();
const chat = useChatStore();

/** api.get/post 返回 ApiError | { data }：统一收窄取 data（失败给 null，页面走静默降级） */
function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

// ── 数据 ──
type Profile = { cefr: string | null; goals: string | null; streakDays?: number };
type Book = { id: string; name: string; kind: string; course: string; subject?: string; wordCount: number; levelCount: number; maxLevelCleared: number; dueCount?: number };
type Level = { levelNo: number; wordCount: number; stars: number; passed: boolean; unlocked: boolean };
type Question = { kind: 'choice' | 'spelling' | 'dictation' | 'cloze'; qid: string; wordId: string; prompt: string; phonetic?: string | null; options?: string[]; hint?: string; gloss?: string; audio?: string };
type DrillResult = { stars: number; passed: boolean; pct: number; results: Array<{ qid: string; word: string; correct: boolean; expected: string }> };
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
async function loadSubjects() {
  const r = await api.get<SubjectDef[]>('/learning/subjects');
  const list = unwrap<SubjectDef[]>(r);
  if (list?.length) SUBJECTS.value = list;
}
async function switchSubject(key: string) {
  if (!SUBJECTS.value.find((s) => s.key === key)?.ready) return;
  subject.value = key;
  activeBook.value = null;
  levels.value = [];
  await loadCourses();
}

// ── 工作区 Tab：陪练对话 / 闯关 / 词汇表 / 场景 / 语法 / 阅读（只切中栏内容，骨架不动）──
const tab = ref<'coach' | 'drill' | 'words' | 'scenes' | 'grammar' | 'reading'>('drill');
const tabDefs = [
  { key: 'drill', label: '单词闯关' },
  { key: 'coach', label: '陪练对话' },
  { key: 'words', label: '词汇表' },
  { key: 'scenes', label: '场景卡' },
  { key: 'grammar', label: '语法微课' },
  { key: 'reading', label: '范文阅读' },
] as const;
function switchTab(k: typeof tab.value) {
  tab.value = k;
  if (k === 'coach') void ensureCoachConv(); // 复用/创建陪练会话（不跳路由，内嵌对话）
  if (k === 'words' && activeBook.value) void loadBookWords(true);
  if (k === 'scenes' && !scenes.value.length) loadScenes();
  if (k === 'grammar' && !grammarList.value.length) loadGrammar();
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
type CourseView = { id: string; name: string; stage: string; bookId: string; bookName: string; wordCount: number; levelCount: number; clearedLevels: number; totalLevels: number; dueCount: number; progressPct: number };
type CourseGroup = { stage: string; courses: CourseView[] };
const courses = ref<CourseGroup[]>([]);
async function loadCourses() {
  const r = await api.get<{ data: CourseGroup[] }>(`/learning/courses?subject=${encodeURIComponent(subject.value)}`);
  courses.value = unwrap<CourseGroup[]>(r) || [];
}
function openCourse(c: CourseView) {
  // 选中课程 → 中栏立即出现该课关卡地图（修"点了没用"）；
  // 但用户正在词汇表通读时保持当前 Tab（换书词汇表跟着换，不把人踢回闯关）
  if (tab.value !== 'words') tab.value = 'drill';
  void openBook({ id: c.bookId, name: c.bookName, kind: 'builtin', course: c.name, wordCount: c.wordCount, levelCount: c.totalLevels, maxLevelCleared: c.clearedLevels, dueCount: c.dueCount });
}
const customBooks = computed(() => books.value.filter((b) => b.kind === 'custom' && (b.subject || '英语') === subject.value));

// ── 闯关状态 ──
const drillLevel = ref<number | null>(null);
const questions = ref<Question[]>([]);
/** 听写题需要 TTS 念词——无语音包时整卷过滤掉听写（判分只按提交的题） */
const activeQuestions = computed(() => (ttsPackId.value ? questions.value : questions.value.filter((q) => q.kind !== 'dictation')));
const answers = ref<Record<string, string>>({}); // qid → 选项/输入
const submitting = ref(false);
const result = ref<DrillResult | null>(null);

// ── 单题聚焦模式（对标 Duolingo：一次只答一题 + 进度条，替代 10 题平铺长列表）──
const qIndex = ref(0);
const currentQ = computed(() => activeQuestions.value[qIndex.value] ?? null);
const answeredCount = computed(() => activeQuestions.value.filter((q) => String(answers.value[q.qid] ?? '').trim() !== '').length);
function isAnswered(q: Question): boolean {
  return String(answers.value[q.qid] ?? '').trim() !== '';
}
const KIND_LABELS: Record<Question['kind'], string> = { choice: '选释义', spelling: '拼写', dictation: '听写', cloze: '例句填空' };
function goQ(delta: number) {
  qIndex.value = Math.max(0, Math.min(activeQuestions.value.length - 1, qIndex.value + delta));
}
/** 输入框回车：非末题 → 跳下一题；末题且答满 → 交卷 */
function nextOrSubmit() {
  if (qIndex.value < activeQuestions.value.length - 1) { goQ(1); return; }
  if (answeredCount.value >= activeQuestions.value.length) {
    if (reviewMode.value) void submitReview(); else void submitDrill();
  }
}
// 听写题自动念一遍（进入题目即播，不用手点）；输入框每题自动聚焦
const focusInput = ref<HTMLInputElement | null>(null);
watch(qIndex, async () => {
  const q = currentQ.value;
  if (q?.kind === 'dictation' && ttsPackId.value) void speak(q.audio || '');
  await nextTick();
  focusInput.value?.focus();
});

async function openBook(book: Book) {
  activeBook.value = book;
  drillLevel.value = null;
  result.value = null;
  reviewMode.value = false;
  levelPage.value = 0;
  const r = await api.get<{ data: Level[] }>(`/learning/books/${book.id}/levels`);
  levels.value = unwrap<Level[]>(r) || [];
  if (tab.value === 'words') void loadBookWords(true); // 换书后词汇表跟着换（修"词汇表还是上一本的"）
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
    result.value = unwrap<DrillResult>(r) ?? null;
    if (result.value) react(result.value); // 形象反应：过关跳一跳 / 没过歪头看
    await openBook(activeBook.value); // 刷新星级/解锁态
    drillLevel.value = null;
    questions.value = [];
  } finally {
    submitting.value = false;
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

// ── 场景卡（P1-A）──
type SceneCard = { id: string; title: string; scene: string; roles: [string, string]; keyPhrases: string[]; exitHint: string; cefr: string };
const scenes = ref<SceneCard[]>([]);
const startingScene = ref<string | null>(null);
async function loadScenes() {
  const r = await api.get<{ data: SceneCard[] }>('/learning/scenes');
  scenes.value = unwrap<SceneCard[]>(r) || [];
}
async function startScene(scene: SceneCard) {
  if (startingScene.value) return;
  startingScene.value = scene.id;
  try {
    const convId = await chat.createConversation(`场景：${scene.title}`, {
      agentId: LEARNING_AGENT_ID, source: 'learning',
      // learningScene 经 source_meta 透传，服务端 buildSystemPromptForBackend 注入场景块
      sourceMeta: { learningScene: scene.id } as unknown as { url?: string; host?: string; scope?: string },
    });
    await router.push({ name: 'chat-detail', params: { convId } });
  } finally {
    startingScene.value = null;
  }
}

// ── 语法微课（P1-B）：列表行内展开，不跳页 ──
type GrammarBrief = { id: string; title: string; cefr: string; group: string; rule: string };
type GrammarDetail = GrammarBrief & { examples: Array<{ en: string; zh: string }>; pairs: Array<{ wrong: string; right: string; why: string }> };
const grammarList = ref<GrammarBrief[]>([]);
const grammarActive = ref<GrammarDetail | null>(null);
async function loadGrammar() {
  const r = await api.get<{ data: GrammarBrief[] }>('/learning/grammar');
  grammarList.value = unwrap<GrammarBrief[]>(r) || [];
}
async function openGrammar(id: string) {
  if (grammarActive.value?.id === id) { grammarActive.value = null; return; } // 再点收起
  const r = await api.get<{ data: GrammarDetail }>(`/learning/grammar/${id}`);
  grammarActive.value = unwrap<GrammarDetail>(r) || null;
}

// ── 范文阅读（P1-C）──
type ReadingBrief = { id: string; title: string; cefr: string; topic: string; paraCount: number };
type ReadingDetail = ReadingBrief & { paras: Array<{ en: string; zh: string }> };
const readings = ref<ReadingBrief[]>([]);
const readingActive = ref<ReadingDetail | null>(null);
const collecting = ref('');
async function loadReadings() {
  const r = await api.get<{ data: ReadingBrief[] }>('/learning/readings');
  readings.value = unwrap<ReadingBrief[]>(r) || [];
}
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

// ── 口语跟读（whisper EN 转写，说→看识别结果自查）──
const recording = ref(false);
const transcribing = ref(false);
const transcript = ref('');
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
        const r = await api.post<{ data: { text: string } }>('/learning/voice', { audioBase64: b64, mime: blob.type });
        transcript.value = unwrap<{ text: string }>(r)?.text || '（未识别到内容）';
      } catch (e) {
        transcript.value = `识别失败：${e instanceof Error ? e.message : String(e)}`;
      } finally {
        transcribing.value = false;
      }
    };
    mediaRecorder.start();
    recording.value = true;
    transcript.value = '';
  } catch {
    transcript.value = '无法访问麦克风（请检查浏览器/应用权限）';
  }
}

// ── AI 陪练：创建学习会话（learning 模式下归属=learning；上下文注入在服务端收口）──
const startingChat = ref(false);
async function startCoaching() {
  if (startingChat.value) return;
  startingChat.value = true;
  try {
    await ensureCoachConv();
    tab.value = 'coach'; // ★ 内嵌对话：留在学习模式，不跳聊天页（用户实报"又跳到办公模式"）
    if (!coachMsgs.value.length) {
      await sendCoach('Hi! I want to practice English. Please start with a few easy questions.');
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

// ── 陪练对话（内嵌中栏：复用 chat store 的会话/消息/SSE 链路，AI 输出英文后自动朗读）──
const platformStore = usePlatformStore();
const coachConvId = ref('');
const coachInput = ref('');
const coachSending = ref(false);
const coachVoiceOn = ref(true);
const coachMsgs = computed(() => (coachConvId.value ? chat.messagesByConv[coachConvId.value] || [] : []));
const coachStreaming = computed(() => !!coachConvId.value && chat.isConvStreaming(coachConvId.value));

/** 复用最近的 learning 陪练会话（刷新不丢对话），没有才建新的 */
async function ensureCoachConv(): Promise<string> {
  if (coachConvId.value) return coachConvId.value;
  const r = await api.get<any[]>('/conversations?mode=learning&limit=1');
  const list = unwrap<any[]>(r) || [];
  if (list.length) {
    coachConvId.value = String(list[0].id);
  } else {
    coachConvId.value = await chat.createConversation('英语陪练', { agentId: LEARNING_AGENT_ID, source: 'learning' });
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
    await chat.sendMessage(content, resolved.platform, resolved.model, undefined, {}, convId);
    speakLastCoachReply(); // AI 说完 → 宠物读出来（浏览器本地 TTS，离线可用）
  } catch (e) {
    console.error('[learning] 陪练发送失败', e);
    ElMessage.error(e instanceof Error ? `发送失败：${e.message}` : '发送失败，请稍后重试');
  } finally {
    coachSending.value = false;
  }
}

function coachTextOf(m: { role: string; content?: string }): string {
  if (m.role !== 'assistant') return String(m.content || '');
  return stripSceneResultBlocks(String(m.content || ''));
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
    u.lang = 'en-US';
    u.rate = 0.95;
    u.onend = () => stageRef.value?.play('wave');
    speechSynthesis.speak(u);
    stageRef.value?.play('pet');
  } catch { /* 环境无 TTS（如旧 jsdom）→ 静默 */ }
}
function stopCoachSpeak() { try { speechSynthesis.cancel(); } catch { /* 同上 */ } }
function toggleCoachVoice() {
  coachVoiceOn.value = !coachVoiceOn.value;
  if (!coachVoiceOn.value) stopCoachSpeak();
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

// ── 单词朗读（P0-6）：复用既有 tts-packs 的 preview 合成端点，零 server 改动 ──
type TtsItem = { id: string; name: string; installed: boolean };
const ttsPackId = ref<string | null>(null);
const ttsSpeaking = ref(false);
const ttsPlaying = ref<HTMLAudioElement | null>(null);
async function loadTtsPack() {
  try {
    const r = await api.get<{ items: TtsItem[] }>('/tts-packs');
    const items = unwrap<{ items: TtsItem[] }>(r)?.items || [];
    ttsPackId.value = items.find((t) => t.installed)?.id || null;
  } catch { /* 语音包接口不可用则隐藏朗读按钮 */ }
}
async function speak(text: string) {
  if (!ttsPackId.value || ttsSpeaking.value || !text.trim()) return;
  ttsSpeaking.value = true;
  try {
    const r = await api.post<{ url?: string }>(`/tts-packs/${ttsPackId.value}/preview`, { text });
    const url = unwrap<{ url?: string }>(r)?.url;
    if (!url) return;
    ttsPlaying.value?.pause();
    const audio = new Audio(url);
    ttsPlaying.value = audio;
    audio.addEventListener('ended', () => (ttsSpeaking.value = false));
    audio.addEventListener('error', () => (ttsSpeaking.value = false));
    await audio.play();
  } catch {
    ttsSpeaking.value = false;
  }
}

onMounted(() => {
  // ★ 从首页快捷入口/直接输 URL 进学习页时，activeMode 仍是上一个模式 ——
  //   不切就会话被记到办公任务列表（用户实报：「点了陪练跑到办公里面还创建了任务」）。
  //   页面挂载即把模式切到 learning（与顶栏模式切换器同一函数，幂等）。
  if (activeMode.value !== 'learning') setMode('learning');
  void loadSubjects();
});
onMounted(loadAll);
onMounted(loadTtsPack);
</script>

<template>
  <div class="learning-page">
    <header class="lp-header">
      <div class="lp-head-left">
        <h1>学习模式</h1>
        <p class="lp-sub">
          <template v-if="profile.cefr">当前等级 <b>{{ profile.cefr }}</b><span v-if="profile.goals"> · 目标：{{ profile.goals }}</span></template>
          <template v-else>还没有定级——点「开始陪练」，先做个 3 分钟摸底对话</template>
          <span v-if="profile.streakDays" class="lp-streak">🔥 连续 {{ profile.streakDays }} 天</span>
        </p>
        <div class="lp-subjects">
          <button
            v-for="s in SUBJECTS" :key="s.key"
            class="lp-subject" :class="{ active: subject === s.key }"
            :disabled="!s.ready" :title="s.ready ? '' : '筹备中'"
            @click="switchSubject(s.key)"
          >{{ s.label }}<i v-if="!s.ready" class="lp-soon">筹备中</i></button>
        </div>
      </div>
      <LearnStage ref="stageRef" class="lp-stage" />
      <button class="lp-coach" :disabled="startingChat" @click="startCoaching">
        {{ startingChat ? '正在创建会话…' : '开始陪练 · 和 AI 用英语聊' }}
      </button>
    </header>

    <!-- 稳定三栏骨架：所有 Tab 共用，切换只改中栏内容，不跳布局 -->
    <div class="lp-grid">
      <!-- 左：科目课程地图 + 我的词单 -->
      <section class="lp-card lp-col-left">
        <div class="lp-card-head">
          <h2>课程</h2>
          <button class="lp-mini" @click="showCreate = !showCreate">{{ showCreate ? '收起' : '+ 自定义词单' }}</button>
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

        <div class="lp-courses">
          <div v-for="grp in courses" :key="grp.stage" class="lp-stage">
            <h4 class="lp-stage-name">{{ grp.stage }}</h4>
            <button
              v-for="c in grp.courses" :key="c.id"
              class="lp-course" :class="{ active: activeBook?.id === c.bookId, done: c.progressPct === 100 }"
              @click="openCourse(c)"
            >
              <span class="lp-course-row">
                <span class="lp-course-name">{{ c.name }}<i v-if="c.dueCount > 0" class="lp-due-badge" title="有到期词待复习">🟡 {{ c.dueCount }}</i></span>
                <span class="lp-course-pct">{{ c.progressPct }}%</span>
              </span>
              <span class="lp-course-bar"><span class="lp-course-fill" :style="{ width: c.progressPct + '%' }"></span></span>
              <span class="lp-course-meta">{{ c.clearedLevels }}/{{ c.totalLevels }} 关 · {{ c.wordCount }} 词</span>
            </button>
          </div>
          <p v-if="!courses.length && !loading" class="lp-hint">课程加载中…</p>
        </div>
      </section>

      <!-- 中：工作区（Tab 只切这里） -->
      <section class="lp-card lp-col-mid">
        <div class="lp-tabs">
          <button
            v-for="t in tabDefs" :key="t.key"
            class="lp-tab" :class="{ active: tab === t.key }"
            @click="switchTab(t.key)"
          >{{ t.label }}</button>
        </div>

        <!-- 陪练对话：内嵌中栏（不跳路由），AI 输出英文 + 自动朗读 -->
        <template v-if="tab === 'coach'">
          <div class="lp-coach-chat">
            <div class="lp-chat-msgs">
              <template v-for="(m, mi) in coachMsgs" :key="m.id || mi">
                <div v-if="m.role === 'user' || (m.role === 'assistant' && coachTextOf(m).trim())" class="lp-chat-row" :class="m.role">
                  <div class="lp-chat-bubble">
                    <p class="lp-chat-text">{{ coachTextOf(m) }}</p>
                    <button v-if="m.role === 'assistant' && coachTextOf(m).trim()" class="lp-speak" title="朗读这句" @click="speakCoachText(coachTextOf(m))">🔊</button>
                  </div>
                </div>
              </template>
              <div v-if="coachStreaming" class="lp-chat-typing">陪练正在输入…</div>
              <div v-if="!coachMsgs.length && !coachStreaming" class="lp-empty">
                <p class="lp-empty-title">和英语陪练开聊吧</p>
                <p class="lp-hint">AI 每句 ≤3 句英文，说错的地方用「你说 → 母语者会说 → 为什么」轻纠；回复会自动朗读（右上角 🔇 可关）。</p>
                <button class="lp-mini" @click="sendCoach('Hi! I want to practice English. Please start with a few easy questions.')">
                  Hi, let's start! 👋
                </button>
              </div>
            </div>
            <div class="lp-chat-input">
              <button class="lp-mini" :title="coachVoiceOn ? '自动朗读：开' : '自动朗读：关'" @click="toggleCoachVoice">{{ coachVoiceOn ? '🔊' : '🔇' }}</button>
              <input
                v-model="coachInput" class="lp-chat-entry"
                placeholder="用英语说点什么…（回车发送）"
                @keyup.enter="sendCoach()"
              />
              <button v-if="coachStreaming" class="lp-primary lp-stop" @click="chat.stop(coachConvId)">⏹ 停止</button>
              <button v-else class="lp-primary" :disabled="coachSending || !coachInput.trim()" @click="sendCoach()">
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
              <div class="lp-drill-bar"><span :style="{ width: (answeredCount / activeQuestions.length) * 100 + '%' }"></span></div>
              <span class="lp-drill-count">已答 {{ answeredCount }}/{{ activeQuestions.length }}</span>
            </div>
            <div class="lp-focus">
              <p class="lp-focus-kind"><b>第 {{ qIndex + 1 }} 题</b><span class="lp-kind">{{ KIND_LABELS[currentQ.kind] }}</span></p>
              <!-- 题干 -->
              <div v-if="currentQ.kind === 'choice'" class="lp-focus-body">
                <p class="lp-focus-word">{{ currentQ.prompt }}<i v-if="currentQ.phonetic" class="lp-focus-pho">{{ currentQ.phonetic }}</i>
                  <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" title="朗读单词" @click="speak(currentQ.prompt)">🔊</button>
                </p>
                <p class="lp-focus-hint">选出正确的中文释义</p>
              </div>
              <div v-else-if="currentQ.kind === 'dictation'" class="lp-focus-body">
                <button class="lp-bigplay" :disabled="ttsSpeaking || !ttsPackId" title="播放单词" @click="speak(currentQ.audio || '')">🔊 播放单词</button>
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
                  class="lp-opt" :class="{ picked: answers[currentQ.qid] === opt }"
                  @click="answers[currentQ.qid] = opt"
                >{{ opt }}</button>
              </div>
              <input
                v-else
                ref="focusInput"
                v-model="answers[currentQ.qid]"
                class="lp-input lp-focus-input" :placeholder="currentQ.kind === 'dictation' ? `听音拼写（${currentQ.hint}）` : currentQ.kind === 'cloze' ? `填入目标词（${currentQ.hint}）` : `拼写单词（提示：${currentQ.hint}）`"
                @keyup.enter="nextOrSubmit"
              />
            </div>
            <!-- 导航：上一题 / 题号圆点 / 下一题或交卷 -->
            <div class="lp-focus-nav">
              <button class="lp-mini" :disabled="qIndex === 0" @click="goQ(-1)">‹ 上一题</button>
              <div class="lp-dots">
                <button
                  v-for="(q, i) in activeQuestions" :key="q.qid"
                  class="lp-dot" :class="{ done: isAnswered(q), cur: i === qIndex }"
                  :title="`第 ${i + 1} 题${isAnswered(q) ? '（已答）' : ''}`"
                  @click="qIndex = i"
                >{{ i + 1 }}</button>
              </div>
              <button v-if="qIndex < activeQuestions.length - 1" class="lp-primary" @click="goQ(1)">下一题 ›</button>
              <button v-else class="lp-primary" :disabled="submitting || answeredCount < activeQuestions.length" @click="reviewMode ? submitReview() : submitDrill()">
                {{ submitting ? '判分中…' : '交卷' }}
              </button>
            </div>
          </template>
          <template v-else-if="result">
            <div class="lp-result" :class="{ pass: result.passed }">
              <p class="lp-result-stars">{{ starText(result.stars) }}（{{ result.pct }}%）</p>
              <p>{{ result.passed ? '过关！✅' : '没过，再练一轮 —— 错的词已回复习盒' }}</p>
              <ul>
                <li v-for="r in result.results" :key="r.qid" :class="{ wrong: !r.correct }">
                  <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(r.word)">🔊</button>
                  <b>{{ r.word }}</b> · {{ r.correct ? '✔' : `应为「${r.expected}」` }}
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
                class="lp-level" :class="{ locked: !l.unlocked, cleared: l.passed }"
                :title="l.unlocked ? '' : '跳关考试：通过即解锁下一关'"
                @click="startDrill(l.levelNo)"
              >
                <span class="lp-no">{{ l.unlocked ? l.levelNo : '🎯' }}</span>
                <span class="lp-stars">{{ starText(l.stars) }}</span>
                <span class="lp-words">{{ l.wordCount }} 词{{ l.unlocked ? '' : ' · 跳考' }}</span>
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
                <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" title="朗读单词" @click="speak(w.word)">🔊</button>
                <b class="lp-wt-word">{{ w.word }}</b>
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
            <p class="lp-hint">词汇表支持中英搜索与分页浏览；点 🔊 可听发音（需配置语音包）。</p>
          </div>
        </template>

        <!-- 场景卡 -->
        <template v-else-if="tab === 'scenes'">
          <div class="lp-scene-list">
            <button v-for="s in scenes" :key="s.id" class="lp-scene" :disabled="!!startingScene" @click="startScene(s)">
              <span class="lp-scene-title">{{ s.title }} <i class="lp-kind">{{ s.cefr }}</i></span>
              <span class="lp-scene-desc">{{ s.scene }}</span>
              <span class="lp-scene-meta">你演：{{ s.roles[1] }} · 完成：{{ s.exitHint }}</span>
              <span class="lp-scene-go">{{ startingScene === s.id ? '创建会话中…' : '开始场景 →' }}</span>
            </button>
            <p v-if="!scenes.length" class="lp-hint">场景卡加载中…</p>
          </div>
        </template>

        <!-- 语法微课：行内展开 -->
        <template v-else-if="tab === 'grammar'">
          <div class="lp-grammar-list">
            <div v-for="g in grammarList" :key="g.id" class="lp-grammar-item">
              <button class="lp-grammar-row" @click="openGrammar(g.id)">
                <b>{{ g.title }}</b>
                <span class="lp-kind">{{ g.group }} · {{ g.cefr }}</span>
                <span class="lp-grammar-rule">{{ g.rule }}</span>
              </button>
              <div v-if="grammarActive?.id === g.id" class="lp-grammar-detail">
                <h3>例句</h3>
                <ul class="lp-g-ex">
                  <li v-for="(e, i) in grammarActive.examples" :key="i">
                    <p>{{ e.en }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(e.en)">🔊</button></p>
                    <p class="lp-hint">{{ e.zh }}</p>
                  </li>
                </ul>
                <h3>正误对照</h3>
                <ul class="lp-g-pairs">
                  <li v-for="(pt, i) in grammarActive.pairs" :key="i">
                    <p class="wrong"><s>{{ pt.wrong }}</s></p>
                    <p class="right">✅ {{ pt.right }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(pt.right)">🔊</button></p>
                    <p class="lp-hint">为什么：{{ pt.why }}</p>
                  </li>
                </ul>
              </div>
            </div>
            <p v-if="!grammarList.length" class="lp-hint">语法点加载中…</p>
          </div>
        </template>

        <!-- 范文阅读：列表 chips + 阅读器 -->
        <template v-else>
          <div class="lp-reading-chips">
            <button
              v-for="r in readings" :key="r.id"
              class="lp-chip" :class="{ active: readingActive?.id === r.id }"
              @click="openReading(r.id)"
            >{{ r.title }} <i>{{ r.cefr }}</i></button>
          </div>
          <div v-if="readingActive" class="lp-reader">
            <h3>{{ readingActive.title }} <span class="lp-kind">{{ readingActive.cefr }}</span></h3>
            <p class="lp-hint">🔊 逐段朗读；划选英文单词后点「收词」进词本（进「阅读生词」词单）。</p>
            <div v-for="(p, i) in readingActive.paras" :key="i" class="lp-para">
              <p class="lp-para-en" @mouseup="collectSelection">{{ p.en }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(p.en)">🔊</button></p>
              <p class="lp-para-zh">{{ p.zh }}</p>
            </div>
            <button class="lp-mini" :disabled="!!collecting" @click="collectSelection">
              {{ collecting ? `查询「${collecting}」中…` : '📥 收词（先划选一个英文词）' }}
            </button>
          </div>
          <p v-else class="lp-hint">上方选一篇范文开始阅读。</p>
        </template>
      </section>

      <!-- 右：状态栏（始终可见） -->
      <section class="lp-card lp-col-right">
        <div class="lp-card-head"><h2>今日复习</h2></div>
        <div class="lp-review">
          <p class="lp-review-count">🔥 <b>{{ dueCount }}</b> 个词到期</p>
          <button class="lp-primary" :disabled="!dueCount || submitting" @click="startReview">开始复习</button>
          <p class="lp-hint">到期词按 SRS 排程（1/3/7/14/30 天），优先清到期，再闯新关。</p>
        </div>
        <div class="lp-card-head" style="margin-top:14px;"><h2>口语跟读</h2></div>
        <div class="lp-review">
          <button class="lp-primary" :class="{ rec: recording }" :disabled="transcribing" @click="toggleRecord">
            {{ transcribing ? '识别中…' : recording ? '⏹ 停止录音' : '🎙 点我录音说英语' }}
          </button>
          <p v-if="transcript" class="lp-transcript">{{ transcript }}</p>
          <p class="lp-hint">说一句英语 → 看识别结果自查发音清晰度（whisper 本地转写，需安装语音识别模型）。</p>
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
    </div>
  </div>
</template>

<style scoped>
/* ★ 高度用 flex 撑满 main-content（视口 − 顶栏 − 底部状态栏），绝不能写 100vh ——
   100vh 是视口全高，会把学习页底部压到状态栏底下（用户实报：左栏最后一项永远被裁一半）。 */
.learning-page { padding: 20px 24px; max-width: 1400px; width: 100%; margin: 0 auto; color: #1f2329; flex: 1; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; }
.lp-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; flex-shrink: 0; }
.lp-head-left { flex: 1; min-width: 0; }
.lp-header h1 { font-size: 22px; margin: 0 0 4px; }
.lp-sub { margin: 0; color: #646a73; font-size: 13px; }
.lp-streak { margin-left: 10px; color: #e8590c; font-weight: 600; }
.lp-subjects { display: flex; gap: 6px; margin-top: 8px; }
.lp-subject { border: 1px solid #d0d3d9; background: var(--glass-bg); color: #4e5469; border-radius: 999px; padding: 3px 14px; font-size: 12px; cursor: pointer; }
.lp-subject.active { background: #1f2329; border-color: #1f2329; color: #fff; }
.lp-subject:disabled { opacity: .5; cursor: not-allowed; }
.lp-soon { font-style: normal; font-size: 10px; margin-left: 3px; opacity: .8; }
.lp-coach { border: none; background: #3370ff; color: #fff; padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; white-space: nowrap; }
.lp-coach:disabled { opacity: .6; cursor: default; }
.lp-stage { width: 150px; min-height: 110px; flex-shrink: 0; }
/* ★ 每栏独立滚动（用户实报「答题卷看不全/滚动没有」「最后一个显示不完整」）：
   此前用 max-height: calc(100vh - 180px) 魔法数估头部高度，估不准 ⇒ 最后一项被视口裁半。
   改为 flex 精确贴合：页面占满视口，grid 弹性吃掉 header 之外的剩余高度，三栏 stretch 等高，
   栏内滚动 —— 高度永远正好，不依赖任何估算常数。 */
.lp-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr) 280px; gap: 14px; flex: 1; min-height: 0; }
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
.lp-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.lp-tab { border: 1px solid #e5e6eb; background: var(--glass-bg); color: #4e5469; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.lp-tab.active { background: #3370ff; border-color: #3370ff; color: #fff; }
.lp-courses { display: flex; flex-direction: column; gap: 10px; }
.lp-stage { display: flex; flex-direction: column; }
.lp-stage-name { font-size: 12px; color: #8f959e; margin: 0 0 6px; letter-spacing: 2px; }
.lp-course { text-align: left; border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 8px; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; color: #1f2329; }
.lp-course:hover { border-color: #3370ff; }
.lp-course.active { border-color: #3370ff; background: #f0f5ff; }
.lp-course.done { background: #f0fff4; border-color: #b7ebc9; }
.lp-course-row { display: flex; justify-content: space-between; align-items: center; }
.lp-course-name { font-size: 13px; font-weight: 600; }
.lp-course-pct { font-size: 11px; color: #3370ff; font-weight: 600; }
.lp-course-bar { height: 5px; border-radius: 3px; background: #eef0f3; overflow: hidden; }
.lp-course-fill { display: block; height: 100%; background: linear-gradient(90deg, #3370ff, #69b1ff); border-radius: 3px; }
.lp-course-meta { font-size: 11px; color: #8f959e; }
.lp-due-badge { font-style: normal; font-size: 10px; color: #e8590c; background: #fff4e6; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
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
.lp-wt-row { display: flex; align-items: baseline; gap: 8px; padding: 7px 4px; border-bottom: 1px solid #f0f1f2; font-size: 13px; line-height: 1.5; }
.lp-wt-row:hover { background: #f7f8fa; }
.lp-wt-word { min-width: 110px; color: #1f2329; }
.lp-wt-pho { font-size: 11px; color: #8f959e; white-space: nowrap; }
.lp-wt-gloss { color: #4e5460; }
.lp-pager { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: #646a73; }
.lp-empty { text-align: center; padding: 48px 12px; }
.lp-empty-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
/* 陪练对话（内嵌）：气泡列表 + 底部输入条 */
/* 中栏在陪练 Tab 下改为纵向 flex（tabs 固定 + 对话区吃满剩余），关闭外层滚动让气泡区独立滚 */
.lp-col-mid:has(> .lp-coach-chat) { overflow: hidden; display: flex; flex-direction: column; }
.lp-coach-chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lp-chat-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 2px 12px; }
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
.lp-stop { background: #d4380d; border-color: #d4380d; }

.lp-drill-title { font-size: 13px; color: #4e5469; margin: 0 0 10px; }
/* 单题聚焦模式：进度条 + 大题卡 + 圆点导航（替代 10 题平铺） */
.lp-drill-meter { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
.lp-drill-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--color-border, #e5e6eb); overflow: hidden; }
.lp-drill-bar span { display: block; height: 100%; background: var(--color-primary, #3370ff); border-radius: 3px; transition: width 0.2s; }
.lp-drill-count { font-size: 12px; color: #8f959e; white-space: nowrap; }
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
.lp-focus-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
.lp-dots { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
.lp-dot { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--color-border, #e5e6eb); background: var(--glass-bg); font-size: 11px; cursor: pointer; color: #8f959e; padding: 0; }
.lp-dot.done { background: #3370ff; border-color: #3370ff; color: #fff; }
.lp-dot.cur { border-color: #3370ff; color: #3370ff; font-weight: 600; box-shadow: 0 0 0 2px #3370ff22; }
.lp-kind { margin-left: 6px; font-size: 10px; color: #3370ff; background: #f0f5ff; border-radius: 4px; padding: 1px 6px; }
.lp-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
.lp-opt { text-align: left; border: 1px solid var(--color-border, #e5e6eb); border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer; background: var(--glass-bg); color: var(--color-text, #1f2329); transition: border-color 0.15s; }
.lp-opt:hover { border-color: #3370ff; }
.lp-opt.picked { border-color: #3370ff; background: #f0f5ff; }
.lp-result { font-size: 13px; }
.lp-result.pass { color: #0f8a3d; }
.lp-result-stars { font-size: 20px; color: #f7b500; letter-spacing: 2px; margin: 4px 0; }
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
.lp-scene-list { display: flex; flex-direction: column; gap: 10px; }
.lp-scene { text-align: left; border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; color: #1f2329; }
.lp-scene:hover { border-color: #3370ff; }
.lp-scene:disabled { opacity: .6; }
.lp-scene-title { font-size: 14px; font-weight: 700; }
.lp-scene-desc { font-size: 12px; color: #4e5469; }
.lp-scene-meta { font-size: 11px; color: #8f959e; }
.lp-scene-go { font-size: 12px; color: #3370ff; font-weight: 600; }
.lp-grammar-list { display: flex; flex-direction: column; gap: 6px; }
.lp-grammar-item { border: 1px solid #eef0f3; border-radius: 8px; overflow: hidden; }
.lp-grammar-row { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: #fafbfc; padding: 9px 10px; cursor: pointer; color: #1f2329; font-size: 13px; }
.lp-grammar-row:hover { background: #f0f5ff; }
.lp-grammar-rule { flex: 1; color: #8f959e; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-grammar-detail { padding: 10px 12px; border-top: 1px solid #f0f1f3; background: var(--glass-bg); }
.lp-grammar-detail h3 { font-size: 13px; color: #4e5469; margin: 10px 0 6px; }
.lp-g-ex, .lp-g-pairs { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.lp-g-ex li, .lp-g-pairs li { padding: 5px 0; border-bottom: 1px dashed #eee; }
.lp-g-ex p, .lp-g-pairs p { margin: 0 0 2px; }
.lp-g-pairs .wrong { color: #d4380d; }
.lp-g-pairs .right { color: #0f8a3d; }
.lp-reading-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.lp-chip { border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-chip.active { border-color: #3370ff; background: #f0f5ff; color: #3370ff; }
.lp-chip i { font-style: normal; font-size: 10px; color: #8f959e; margin-left: 4px; }
.lp-reader h3 { margin: 0 0 6px; font-size: 16px; }
.lp-para { margin-bottom: 12px; }
.lp-para-en { font-size: 14px; line-height: 1.7; margin: 0; cursor: text; }
.lp-para-zh { font-size: 12px; color: #8f959e; margin: 2px 0 0; }
</style>
