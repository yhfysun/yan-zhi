<script setup lang="ts">
// 学习模式工作区（P0 最小版）：词书关卡闯关 + 错误本 + AI 陪练入口。
// 方案：docs/英语学习模式方案-2026-11-08.md。形象舞台（Performer/Pet2D/Pet3D）P0 下一步接入。
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { useChatStore } from '../stores/chat';
import LearnStage from '../components/learning/LearnStage.vue';

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
type Book = { id: string; name: string; kind: string; course: string; wordCount: number; levelCount: number; maxLevelCleared: number; dueCount?: number };
type Level = { levelNo: number; wordCount: number; stars: number; passed: boolean; unlocked: boolean };
type Question = { kind: 'choice' | 'spelling' | 'dictation' | 'cloze'; qid: string; wordId: string; prompt: string; phonetic?: string | null; options?: string[]; hint?: string; gloss?: string; audio?: string };
type ErrorRow = { id: string; wrong: string; right: string; reason: string | null };

const profile = ref<Profile>({ cefr: null, goals: null, streakDays: 0 });
const books = ref<Book[]>([]);
const errors = ref<ErrorRow[]>([]);
const activeBook = ref<Book | null>(null);
const levels = ref<Level[]>([]);
const loading = ref(true);

// ── 工作区 Tab：闯关 / 场景 / 语法 / 阅读 ──
const tab = ref<'drill' | 'scenes' | 'grammar' | 'reading'>('drill');
const tabDefs = [
  { key: 'drill', label: '单词闯关' },
  { key: 'scenes', label: '场景卡' },
  { key: 'grammar', label: '语法微课' },
  { key: 'reading', label: '范文阅读' },
] as const;
function switchTab(k: typeof tab.value) {
  tab.value = k;
  if (k === 'scenes' && !scenes.value.length) loadScenes();
  if (k === 'grammar' && !grammarList.value.length) loadGrammar();
  if (k === 'reading' && !readings.value.length) loadReadings();
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

// ── 语法微课（P1-B）──
type GrammarBrief = { id: string; title: string; cefr: string; group: string; rule: string };
type GrammarDetail = GrammarBrief & { examples: Array<{ en: string; zh: string }>; pairs: Array<{ wrong: string; right: string; why: string }> };
const grammarList = ref<GrammarBrief[]>([]);
const grammarActive = ref<GrammarDetail | null>(null);
async function loadGrammar() {
  const r = await api.get<{ data: GrammarBrief[] }>('/learning/grammar');
  grammarList.value = unwrap<GrammarBrief[]>(r) || [];
}
async function openGrammar(id: string) {
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

// ── 口语跟读（P0 尾巴：whisper EN 转写，说→看识别结果自查）──
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

// ── 闯关状态 ──
type DrillResult = { stars: number; passed: boolean; pct: number; results: Array<{ qid: string; word: string; correct: boolean; expected: string }> };
const drillLevel = ref<number | null>(null);
const questions = ref<Question[]>([]);
/** 听写题需要 TTS 念词——无语音包时整卷过滤掉听写（判分只按提交的题） */
const activeQuestions = computed(() => (ttsPackId.value ? questions.value : questions.value.filter((q) => q.kind !== 'dictation')));
const answers = ref<Record<string, string>>({}); // qid → 选项/输入
const submitting = ref(false);
const result = ref<DrillResult | null>(null);

// ── 建词书 ──
const showCreate = ref(false);
const bookName = ref('');
const bookText = ref(''); // 每行: 单词 | 释义 | 例句(可选)

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
    await loadDueCount();
  } catch { /* 后端未就绪时静默，页面仍可渲染骨架 */ }
  loading.value = false;
}

// ── 到期复习（对标 Duolingo"练习恢复"环） ──
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
  activeBook.value = null;
  reviewMode.value = true;
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

async function openBook(book: Book) {
  activeBook.value = book;
  drillLevel.value = null;
  result.value = null;
  reviewMode.value = false;
  const r = await api.get<{ data: Level[] }>(`/learning/books/${book.id}/levels`);
  levels.value = unwrap<Level[]>(r) || [];
}

async function startDrill(levelNo: number) {
  if (!activeBook.value) return;
  const r = await api.get<{ data: { questions: Question[] } }>(`/learning/books/${activeBook.value.id}/levels/${levelNo}/drill`);
  questions.value = unwrap<{ questions: Question[] }>(r)?.questions || [];
  answers.value = {};
  result.value = null;
  drillLevel.value = levelNo;
}

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
  const r = await api.post<{ data: { id: string } }>('/learning/books', { name: bookName.value.trim(), words });
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
      await api.post<{ data: { id: string } }>('/learning/books', { name: bookName.value.trim(), words }),
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
    const r = await api.post<{ data: { id: string; name: string; wordCount: number } }>('/learning/books/import', { url: importUrl.value });
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

// ── AI 陪练：创建学习会话（上下文注入在服务端 buildSystemPromptForBackend 收口）──
const startingChat = ref(false);
async function startCoaching() {
  if (startingChat.value) return;
  startingChat.value = true;
  try {
    const convId = await chat.createConversation('英语陪练', { agentId: LEARNING_AGENT_ID, source: 'learning' });
    await router.push({ name: 'chat-detail', params: { convId } });
  } finally {
    startingChat.value = false;
  }
}

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
    const r = await api.get<{ data: { items: TtsItem[] } }>('/tts-packs');
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

onMounted(loadAll);
onMounted(loadTtsPack);
</script>

<template>
  <div class="learning-page">
    <header class="lp-header">
      <div>
        <h1>学习模式</h1>
        <p class="lp-sub">
          <template v-if="profile.cefr">当前等级 <b>{{ profile.cefr }}</b><span v-if="profile.goals"> · 目标：{{ profile.goals }}</span></template>
          <template v-else>还没有定级——点「开始陪练」，先做个 3 分钟摸底对话</template>
          <span v-if="profile.streakDays" class="lp-streak">🔥 连续 {{ profile.streakDays }} 天</span>
        </p>
      </div>
      <LearnStage ref="stageRef" class="lp-stage" />
      <button class="lp-coach" :disabled="startingChat" @click="startCoaching">
        {{ startingChat ? '正在创建会话…' : '开始陪练 · 和 AI 用英语聊' }}
      </button>
    </header>

    <nav class="lp-tabs">
      <button
        v-for="t in tabDefs" :key="t.key"
        class="lp-tab" :class="{ active: tab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</button>
    </nav>

    <div v-if="tab === 'drill'" class="lp-grid">
      <!-- 左：词书与关卡 -->
      <section class="lp-card">
        <div class="lp-card-head">
          <h2>单词闯关</h2>
          <button class="lp-mini" @click="showCreate = !showCreate">{{ showCreate ? '收起' : '+ 自定义词单' }}</button>
        </div>

        <div v-if="showCreate" class="lp-create">
          <input v-model="bookName" placeholder="词单名称（如：面试词汇）" />
          <textarea v-model="bookText" rows="5" placeholder="每行一个词：单词 | 中文释义 | 例句(可选)&#10;例如：resume | 简历；重新开始 | Please send your resume." />
          <button class="lp-primary" @click="createBook">创建词单</button>
          <textarea v-model="extractText" rows="4" placeholder="（可选）粘贴英文文章，AI 自动收词并建词单——不用手动填上面" />
          <button class="lp-mini" :disabled="extracting || !bookName.trim() || extractText.trim().length < 10" @click="extractAndCreate">
            {{ extracting ? 'AI 收词中…' : '🤖 AI 收词并创建' }}
          </button>
          <input v-model="importUrl" placeholder="（可选）词书内容包 URL（JSON：name + words[{word,gloss}]）" />
          <button class="lp-mini" :disabled="importing || !importUrl.startsWith('http')" @click="importBookUrl">
            {{ importing ? '下载导入中…' : '📥 从 URL 导入词书' }}
          </button>
          <p class="lp-hint">AI 收词需已配置可用模型；词书包与内置同格式（方案 §2.3 词书来源三档）</p>
        </div>

        <div class="lp-books">
          <button
            v-for="b in books" :key="b.id"
            class="lp-book" :class="{ active: activeBook?.id === b.id }"
            @click="openBook(b)"
          >
            <span class="lp-book-name">{{ b.name }}<i v-if="(b.dueCount || 0) > 0" class="lp-due-badge" title="有到期词待复习">🟡 {{ b.dueCount }}</i></span>
            <span class="lp-book-meta">{{ b.wordCount }} 词 · {{ b.levelCount }} 关 · 已通 {{ b.maxLevelCleared }} 关</span>
          </button>
          <p v-if="!books.length && !loading" class="lp-hint">暂无词书</p>
        </div>

        <div v-if="activeBook" class="lp-levels">
          <h3>{{ activeBook.name }} · 关卡</h3>
          <div class="lp-level-grid">
            <button
              v-for="l in levels" :key="l.levelNo"
              class="lp-level" :class="{ locked: !l.unlocked, cleared: l.passed }"
              :title="l.unlocked ? '' : '跳关考试：通过即解锁下一关'"
              @click="startDrill(l.levelNo)"
            >
              <span class="lp-no">{{ l.unlocked ? l.levelNo : '🎯' }}</span>
              <span class="lp-stars">{{ starText(l.stars) }}</span>
              <span class="lp-words">{{ l.wordCount }} 词{{ l.unlocked ? '' : ' · 跳考' }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 中：答题面板 -->
      <section class="lp-card">
        <div class="lp-card-head"><h2>答题</h2></div>
        <template v-if="(drillLevel != null || reviewMode) && activeQuestions.length">
          <p class="lp-drill-title">
            {{ reviewMode ? `到期复习（${activeQuestions.length} 题，跨词书）` : `${activeBook?.name} · 第 ${drillLevel} 关（${activeQuestions.length} 题）` }}
          </p>
          <div v-for="(q, qi) in activeQuestions" :key="q.qid" class="lp-q">
            <p class="lp-q-prompt">
              <b>{{ qi + 1 }}.</b>
              <template v-if="q.kind === 'choice'">
                {{ q.prompt }} <i v-if="q.phonetic">{{ q.phonetic }}</i><span class="lp-kind">选释义</span>
                <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" title="朗读单词" @click="speak(q.prompt)">🔊</button>
              </template>
              <template v-else-if="q.kind === 'dictation'">
                🔊 听音拼写<span class="lp-kind">听写</span>
                <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" title="播放单词" @click="speak(q.audio || '')">🔊 播放</button>
                <i class="lp-hint">{{ q.hint }}</i>
              </template>
              <template v-else-if="q.kind === 'cloze'">
                {{ q.prompt }}<span class="lp-kind">例句填空</span>
                <i class="lp-hint">{{ q.hint }}</i>
              </template>
              <template v-else>{{ q.prompt }}<span class="lp-kind">拼写</span></template>
            </p>
            <div v-if="q.kind === 'choice'" class="lp-opts">
              <button
                v-for="opt in q.options" :key="opt"
                class="lp-opt" :class="{ picked: answers[q.qid] === opt }"
                @click="answers[q.qid] = opt"
              >{{ opt }}</button>
            </div>
            <input
              v-else
              v-model="answers[q.qid]"
              class="lp-input" :placeholder="q.kind === 'dictation' ? `听音拼写（${q.hint}）` : q.kind === 'cloze' ? `填入目标词（${q.hint}）` : `拼写单词（提示：${q.hint}）`"
              @keyup.enter="reviewMode ? submitReview() : submitDrill()"
            />
          </div>
          <button class="lp-primary" :disabled="submitting || Object.keys(answers).length < activeQuestions.length" @click="reviewMode ? submitReview() : submitDrill()">
            {{ submitting ? '判分中…' : '交卷' }}
          </button>
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
          </div>
        </template>
        <p v-else class="lp-hint">左侧选一本书、点一个解锁的关卡开始答题；答错的词自动进 SRS 复习队列。</p>
      </section>

      <!-- 右：到期复习 + 口语跟读 + 错误本 -->
      <section class="lp-card">
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
          <p class="lp-hint">说一句英语 → 看识别结果自查发音清晰度（whisper 本地转写，需在设置安装语音识别模型）。</p>
        </div>
        <div class="lp-card-head" style="margin-top:14px;"><h2>错误本</h2></div>
        <ul v-if="errors.length" class="lp-errors">
          <li v-for="e in errors" :key="e.id">
            <p><s>{{ e.wrong }}</s> → <b>{{ e.right }}</b></p>
            <p v-if="e.reason" class="lp-hint">{{ e.reason }}</p>
          </li>
        </ul>
        <p v-else class="lp-hint">还没有记录。陪练纠过的表达会自动进这里（P1 由对话结束抽取）。</p>
      </section>
    </div>

    <!-- 场景卡（P1-A） -->
    <div v-if="tab === 'scenes'" class="lp-scene-grid">
      <button v-for="s in scenes" :key="s.id" class="lp-scene" :disabled="!!startingScene" @click="startScene(s)">
        <span class="lp-scene-title">{{ s.title }} <i class="lp-kind">{{ s.cefr }}</i></span>
        <span class="lp-scene-desc">{{ s.scene }}</span>
        <span class="lp-scene-meta">你演：{{ s.roles[1] }} · 完成：{{ s.exitHint }}</span>
        <span class="lp-scene-go">{{ startingScene === s.id ? '创建会话中…' : '开始场景 →' }}</span>
      </button>
      <p v-if="!scenes.length" class="lp-hint">场景卡加载中…</p>
    </div>

    <!-- 语法微课（P1-B）：左列表右详情 -->
    <div v-if="tab === 'grammar'" class="lp-grid">
      <section class="lp-card">
        <div class="lp-card-head"><h2>语法点目录（离线预写，不靠 AI 现编）</h2></div>
        <ul class="lp-grammar-list">
          <li v-for="g in grammarList" :key="g.id">
            <button class="lp-grammar-item" :class="{ active: grammarActive?.id === g.id }" @click="openGrammar(g.id)">
              <b>{{ g.title }}</b>
              <span class="lp-kind">{{ g.group }} · {{ g.cefr }}</span>
              <p class="lp-hint">{{ g.rule }}</p>
            </button>
          </li>
        </ul>
      </section>
      <section class="lp-card lp-grammar-detail">
        <template v-if="grammarActive">
          <h2>{{ grammarActive.title }}</h2>
          <p class="lp-g-rule">{{ grammarActive.rule }}</p>
          <h3>例句</h3>
          <ul class="lp-g-ex">
            <li v-for="(e, i) in grammarActive.examples" :key="i">
              <p>{{ e.en }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(e.en)">🔊</button></p>
              <p class="lp-hint">{{ e.zh }}</p>
            </li>
          </ul>
          <h3>正误对照</h3>
          <ul class="lp-g-pairs">
            <li v-for="(p, i) in grammarActive.pairs" :key="i">
              <p class="wrong"><s>{{ p.wrong }}</s></p>
              <p class="right">✅ {{ p.right }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(p.right)">🔊</button></p>
              <p class="lp-hint">为什么：{{ p.why }}</p>
            </li>
          </ul>
        </template>
        <p v-else class="lp-hint">左侧点一个语法点看微课卡：规则 + 例句朗读 + 正误对照。</p>
      </section>
    </div>

    <!-- 范文阅读（P1-C）：中英逐段对照 + 段落朗读 + 划词收词 -->
    <div v-if="tab === 'reading'" class="lp-grid">
      <section class="lp-card">
        <div class="lp-card-head"><h2>范文库（内置）</h2></div>
        <ul class="lp-grammar-list">
          <li v-for="r in readings" :key="r.id">
            <button class="lp-grammar-item" :class="{ active: readingActive?.id === r.id }" @click="openReading(r.id)">
              <b>{{ r.title }}</b>
              <span class="lp-kind">{{ r.cefr }} · {{ r.topic }}</span>
              <p class="lp-hint">{{ r.paraCount }} 段 · 中英对照 · 可朗读</p>
            </button>
          </li>
        </ul>
      </section>
      <section class="lp-card lp-reader">
        <template v-if="readingActive">
          <h2>{{ readingActive.title }} <span class="lp-kind">{{ readingActive.cefr }}</span></h2>
          <p class="lp-hint">🔊 逐段朗读；划选英文单词后点「收词」进词本（AI 查释义，进「阅读生词」词单）。</p>
          <div v-for="(p, i) in readingActive.paras" :key="i" class="lp-para">
            <p class="lp-para-en" @mouseup="collectSelection">{{ p.en }} <button class="lp-speak" :disabled="ttsSpeaking || !ttsPackId" @click="speak(p.en)">🔊</button></p>
            <p class="lp-para-zh">{{ p.zh }}</p>
          </div>
          <button class="lp-mini" :disabled="!!collecting" @click="collectSelection">
            {{ collecting ? `查询「${collecting}」中…` : '📥 收词（先划选一个英文词）' }}
          </button>
        </template>
        <p v-else class="lp-hint">左侧选一篇范文开始阅读。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.learning-page { padding: 20px 24px; max-width: 1280px; margin: 0 auto; color: #1f2329; }
.lp-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.lp-header h1 { font-size: 22px; margin: 0 0 4px; }
.lp-sub { margin: 0; color: #646a73; font-size: 13px; }
.lp-coach { border: none; background: #3370ff; color: #fff; padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; }
.lp-coach:disabled { opacity: .6; cursor: default; }
.lp-grid { display: grid; grid-template-columns: 1.1fr 1fr .8fr; gap: 14px; align-items: start; }
.lp-card { background: #fff; border: 1px solid #e5e6eb; border-radius: 10px; padding: 14px; }
.lp-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.lp-card-head h2 { font-size: 15px; margin: 0; }
.lp-mini, .lp-primary { border: 1px solid #d0d3d9; background: #f5f6f7; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-primary { background: #3370ff; color: #fff; border-color: #3370ff; padding: 8px 14px; font-size: 13px; }
.lp-primary:disabled { opacity: .5; cursor: default; }
.lp-create { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.lp-create input, .lp-create textarea, .lp-input { border: 1px solid #d0d3d9; border-radius: 6px; padding: 7px 9px; font-size: 13px; width: 100%; box-sizing: border-box; }
.lp-hint { color: #8f959e; font-size: 12px; margin: 6px 0 0; }
.lp-books { display: flex; flex-direction: column; gap: 6px; }
.lp-book { text-align: left; border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 8px; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; color: #1f2329; }
.lp-book.active { border-color: #3370ff; background: #f0f5ff; }
.lp-book-name { font-size: 13px; font-weight: 600; }
.lp-due-badge { font-style: normal; font-size: 10px; color: #e8590c; background: #fff4e6; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
.lp-book-meta { font-size: 11px; color: #8f959e; }
.lp-levels { margin-top: 12px; }
.lp-levels h3 { font-size: 13px; margin: 0 0 8px; color: #4e5469; }
.lp-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; }
.lp-level { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px 4px; cursor: pointer; background: #fafbfc; color: #1f2329; }
.lp-level.locked { opacity: .5; cursor: not-allowed; }
.lp-level.cleared { background: #f0fff4; border-color: #b7ebc9; }
.lp-no { font-size: 16px; font-weight: 700; }
.lp-stars { color: #f7b500; font-size: 12px; letter-spacing: 1px; }
.lp-words { font-size: 10px; color: #8f959e; }
.lp-drill-title { font-size: 13px; color: #4e5469; margin: 0 0 10px; }
.lp-q { margin-bottom: 12px; }
.lp-q-prompt { font-size: 13px; margin: 0 0 6px; }
.lp-q-prompt i { color: #8f959e; font-style: normal; margin-left: 4px; }
.lp-kind { margin-left: 6px; font-size: 10px; color: #3370ff; background: #f0f5ff; border-radius: 4px; padding: 1px 6px; }
.lp-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.lp-opt { text-align: left; border: 1px solid #e5e6eb; border-radius: 6px; padding: 6px 9px; font-size: 12px; cursor: pointer; background: #fafbfc; color: #1f2329; }
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
.lp-stage { width: 150px; min-height: 110px; }
.lp-speak { border: none; background: transparent; cursor: pointer; font-size: 13px; padding: 0 4px; }
.lp-speak:disabled { opacity: .4; cursor: default; }
.lp-streak { margin-left: 10px; color: #e8590c; font-weight: 600; }
.lp-review { text-align: left; }
.lp-review-count { font-size: 14px; margin: 4px 0 10px; }
.lp-review .lp-primary { width: 100%; }
.lp-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.lp-tab { border: 1px solid #e5e6eb; background: #fff; color: #4e5469; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.lp-tab.active { background: #3370ff; border-color: #3370ff; color: #fff; }
.lp-scene-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.lp-scene { text-align: left; border: 1px solid #e5e6eb; background: #fff; border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; color: #1f2329; }
.lp-scene:hover { border-color: #3370ff; }
.lp-scene:disabled { opacity: .6; }
.lp-scene-title { font-size: 14px; font-weight: 700; }
.lp-scene-desc { font-size: 12px; color: #4e5469; }
.lp-scene-meta { font-size: 11px; color: #8f959e; }
.lp-scene-go { font-size: 12px; color: #3370ff; font-weight: 600; }
.lp-grammar-list { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow: auto; }
.lp-grammar-item { display: block; width: 100%; text-align: left; border: 1px solid transparent; background: #fafbfc; border-radius: 8px; padding: 8px 10px; cursor: pointer; color: #1f2329; }
.lp-grammar-item:hover { background: #f0f5ff; }
.lp-grammar-item.active { border-color: #3370ff; background: #f0f5ff; }
.lp-grammar-detail h2 { margin: 0 0 8px; font-size: 16px; }
.lp-grammar-detail h3 { font-size: 13px; color: #4e5469; margin: 14px 0 6px; }
.lp-g-rule { font-size: 13px; background: #f6f8fc; border-left: 3px solid #3370ff; padding: 8px 10px; border-radius: 0 6px 6px 0; }
.lp-g-ex, .lp-g-pairs { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.lp-g-ex li, .lp-g-pairs li { padding: 5px 0; border-bottom: 1px dashed #eee; }
.lp-g-ex p, .lp-g-pairs p { margin: 0 0 2px; }
.lp-g-pairs .wrong { color: #d4380d; }
.lp-g-pairs .right { color: #0f8a3d; }
.lp-reader h2 { margin: 0 0 6px; font-size: 16px; }
.lp-para { margin-bottom: 12px; }
.lp-para-en { font-size: 14px; line-height: 1.7; margin: 0; cursor: text; }
.lp-para-zh { font-size: 12px; color: #8f959e; margin: 2px 0 0; }
.lp-transcript { font-size: 13px; background: #f6f8fc; border-radius: 6px; padding: 8px 10px; }
.lp-primary.rec { background: #d4380d; border-color: #d4380d; }
</style>
