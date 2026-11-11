<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Code2, Headphones, Pause, Play, RotateCcw, Volume2 } from 'lucide-vue-next';
import { api } from '../../api/client';

type ExamType = '考研' | '高考' | '软考';
type ExamFilter = '全部' | ExamType;
type ExamSummary = {
  id: string; title: string; examType: ExamType; year: number; region: string;
  section: string; difficulty: string; durationMinutes: number; tags: string[];
  questionCount: number; hasListening: boolean; hasPractice: boolean;
  examLevel?: '中级' | '高级'; examFormat?: '综合知识' | '上机实操';
  softSpecialty?: string; knowledgePoints?: string[];
};
type ExamQuestion = {
  id: string; stem: string; kind?: 'choice' | 'practice';
  options?: string[]; language?: string; starterCode?: string;
};
type ExamPaper = Omit<ExamSummary, 'questionCount' | 'hasListening'> & {
  passage: string;
  listeningScript?: string;
  questions: ExamQuestion[];
};
type ExamResult = {
  paperId: string; title: string; correct: number; total: number; score: number;
  details: Array<{
    questionId: string; stem: string; kind: 'choice' | 'practice';
    picked: number | null; pickedText?: string | null; answer: number | null;
    reference?: string; correct: boolean | null; explanation: string;
  }>;
};

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

const props = withDefaults(defineProps<{
  initialFilter?: ExamFilter;
  initialSoftSpecialty?: string;
  scopedSubject?: '全部' | ExamType;
}>(), {
  initialFilter: '全部',
  initialSoftSpecialty: '全部',
  scopedSubject: '全部',
});

const filter = ref<ExamFilter>(props.initialFilter);
const softLevel = ref<'全部' | '中级' | '高级'>('全部');
const softFormat = ref<'全部' | '综合知识' | '上机实操'>('全部');
const softSpecialty = ref(props.initialSoftSpecialty || '全部');
const papers = ref<ExamSummary[]>([]);
const loading = ref(false);
const activePaper = ref<ExamPaper | null>(null);
const answers = ref<Record<string, number>>({});
const textAnswers = ref<Record<string, string>>({});
const submitting = ref(false);
const result = ref<ExamResult | null>(null);
const elapsedSeconds = ref(0);
const listeningPlaying = ref(false);
const listeningRate = ref(0.9);
let timer: ReturnType<typeof setInterval> | null = null;

const softSpecialties = computed(() => {
  const rows = papers.value.filter((p) => p.examType === '软考' &&
    (softLevel.value === '全部' || p.examLevel === softLevel.value));
  return ['全部', ...new Set(rows.map((p) => p.softSpecialty).filter(Boolean) as string[])];
});
const filteredPapers = computed(() => papers.value.filter((p) => {
  if (filter.value !== '全部' && p.examType !== filter.value) return false;
  if (p.examType !== '软考') return true;
  if (softLevel.value !== '全部' && p.examLevel !== softLevel.value) return false;
  if (softFormat.value !== '全部' && p.examFormat !== softFormat.value) return false;
  if (softSpecialty.value !== '全部' && p.softSpecialty !== softSpecialty.value) return false;
  return true;
}));
const answeredCount = computed(() => activePaper.value
  ? activePaper.value.questions.filter((q) => q.kind === 'practice'
    ? !!String(textAnswers.value[q.id] || '').trim()
    : Number.isInteger(answers.value[q.id])).length
  : 0);
const elapsedText = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0');
  const s = (elapsedSeconds.value % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});
const isListening = computed(() => !!activePaper.value?.listeningScript);
const subjectScoped = computed(() => props.scopedSubject === '软考');
const softTheoryQuestionCount = computed(() => Math.max(
  0,
  ...filteredPapers.value
    .filter((paper) => paper.examType === '软考' && paper.examFormat === '综合知识')
    .map((paper) => paper.questionCount),
));
const resultObjectiveTotal = computed(() =>
  result.value ? result.value.details.filter((d) => d.kind !== 'practice').length : 0,
);
function displayPaperTitle(title: string) {
  if (!subjectScoped.value) return title;
  const parts = title.split(' · ');
  if (parts.length < 3) return title;
  return parts[parts.length - 1];
}
function questionKind(q: ExamQuestion) { return q.kind === 'practice' ? 'practice' : 'choice'; }
function examTypeClass(type: ExamType) {
  return type === '考研' ? 'postgrad' : type === '高考' ? 'gaokao' : 'ruankao';
}
watch([filter, softLevel, softFormat], () => {
  if (softSpecialty.value !== '全部' && !softSpecialties.value.includes(softSpecialty.value)) {
    softSpecialty.value = '全部';
  }
});
watch(() => props.initialFilter, (value) => { filter.value = value || '全部'; });
watch(() => props.initialSoftSpecialty, (value) => { softSpecialty.value = value || '全部'; });

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  elapsedSeconds.value = 0;
  timer = setInterval(() => { elapsedSeconds.value += 1; }, 1000);
}

async function loadPapers() {
  loading.value = true;
  try {
    const r = await api.get<{ data: ExamSummary[] }>('/learning/exams');
    papers.value = unwrap<ExamSummary[]>(r) || [];
  } catch {
    ElMessage.error('真题目录加载失败');
  } finally {
    loading.value = false;
  }
}

async function openPaper(id: string) {
  try {
    const r = await api.get<{ data: ExamPaper }>(`/learning/exams/${encodeURIComponent(id)}`);
    const paper = unwrap<ExamPaper>(r);
    if (!paper) throw new Error('试卷数据为空');
    activePaper.value = paper;
    answers.value = {};
    textAnswers.value = {};
    result.value = null;
    stopListening();
    startTimer();
    await nextTick();
    const pane = document.querySelector<HTMLElement>('.lp-col-mid');
    if (typeof pane?.scrollTo === 'function') pane.scrollTo({ top: 0 });
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '试卷加载失败');
  }
}

function stopListening() {
  listeningPlaying.value = false;
  try { window.speechSynthesis?.cancel(); } catch { /* 无语音引擎时静默 */ }
}

function playListening() {
  const script = String(activePaper.value?.listeningScript || '').trim();
  if (!script) return;
  if (listeningPlaying.value) {
    stopListening();
    return;
  }
  if (!('speechSynthesis' in window)) {
    ElMessage.warning('当前环境不支持语音播放，请使用支持语音的系统浏览器');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(script);
    u.lang = 'en-US';
    u.rate = listeningRate.value;
    u.onend = () => { listeningPlaying.value = false; };
    u.onerror = () => { listeningPlaying.value = false; };
    listeningPlaying.value = true;
    window.speechSynthesis.speak(u);
  } catch {
    listeningPlaying.value = false;
    ElMessage.warning('听力播放失败，请检查系统语音引擎');
  }
}

function replayListening() {
  stopListening();
  playListening();
}

function choose(questionId: string, index: number) {
  if (result.value) return;
  answers.value[questionId] = index;
}

async function submit() {
  if (!activePaper.value || submitting.value) return;
  submitting.value = true;
  try {
    const r = await api.post<{ data: ExamResult }>(
      `/learning/exams/${encodeURIComponent(activePaper.value.id)}/submit`,
      { answers: answers.value, texts: textAnswers.value },
    );
    const graded = unwrap<ExamResult>(r);
    if (!graded) throw new Error('判分结果为空');
    result.value = graded;
    stopTimer();
    ElMessage.success(`交卷完成：${graded.score} 分`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '交卷失败');
  } finally {
    submitting.value = false;
  }
}

function backToList() {
  stopTimer();
  stopListening();
  activePaper.value = null;
  answers.value = {};
  textAnswers.value = {};
  result.value = null;
  elapsedSeconds.value = 0;
}

onMounted(loadPapers);
onBeforeUnmount(() => {
  stopTimer();
  stopListening();
});
</script>

<template>
  <section class="lp-exam">
    <template v-if="!activePaper">
      <div class="lp-exam-head">
        <div>
          <h3>{{ subjectScoped ? '软考综合知识题库' : '历年真题' }}</h3>
          <p class="lp-exam-sub">
            {{ subjectScoped
              ? `2023–2025 年高频综合训练${softTheoryQuestionCount ? `，每套 ${softTheoryQuestionCount} 题` : ''}；另含上机与案例题。`
              : '覆盖 2021–2025 考研英语与高考全国卷。' }}
          </p>
        </div>
        <div v-if="!subjectScoped" class="lp-exam-filters" aria-label="真题类型筛选">
          <button
            v-for="f in (['全部', '考研', '高考'] as ExamFilter[])" :key="f"
            class="lp-chip" :class="{ active: filter === f }"
            @click="filter = f"
          >{{ f }}</button>
        </div>
      </div>
      <div v-if="subjectScoped" class="lp-exam-soft-filters scoped-soft">
        <div class="lp-exam-soft-row">
          <span>题型</span>
          <button v-for="format in (['全部', '综合知识', '上机实操'] as const)" :key="format" :class="{ active: softFormat === format }" @click="softFormat = format">{{ format }}</button>
        </div>
      </div>
      <div v-else-if="filter === '软考'" class="lp-exam-soft-filters">
        <div class="lp-exam-soft-row">
          <span>级别</span>
          <button v-for="level in (['全部', '中级', '高级'] as const)" :key="level" :class="{ active: softLevel === level }" @click="softLevel = level">{{ level }}</button>
        </div>
        <div class="lp-exam-soft-row">
          <span>专业</span>
          <select v-model="softSpecialty" aria-label="软考专业资格">
            <option v-for="specialty in softSpecialties" :key="specialty" :value="specialty">{{ specialty }}</option>
          </select>
        </div>
        <div class="lp-exam-soft-row">
          <span>科目</span>
          <button v-for="format in (['全部', '综合知识', '上机实操'] as const)" :key="format" :class="{ active: softFormat === format }" @click="softFormat = format">{{ format }}</button>
        </div>
      </div>
      <div v-if="filteredPapers.length" class="lp-exam-grid">
        <article v-for="p in filteredPapers" :key="p.id" class="lp-exam-card">
          <div class="lp-exam-card-top">
            <div class="lp-exam-card-types">
              <span v-if="!subjectScoped" class="lp-exam-type" :class="examTypeClass(p.examType)">{{ p.examType }}</span>
              <span v-if="p.examLevel" class="lp-exam-soft-level">{{ p.examLevel }}</span>
              <span v-if="p.softSpecialty && !subjectScoped" class="lp-exam-soft-specialty">{{ p.softSpecialty }}</span>
            </div>
            <div class="lp-exam-card-badges">
              <span v-if="p.hasListening" class="lp-exam-listening-badge"><Headphones :size="11" /> 听力</span>
              <span v-if="p.hasPractice" class="lp-exam-practice-badge"><Code2 :size="11" /> 上机</span>
              <span class="lp-exam-year">{{ p.year }}</span>
            </div>
          </div>
          <h4>{{ displayPaperTitle(p.title) }}</h4>
          <p class="lp-exam-meta">{{ subjectScoped ? `${p.examFormat || p.section} · ${p.difficulty}` : `${p.region} · ${p.section} · ${p.difficulty}` }}</p>
          <p class="lp-exam-tags">{{ p.tags.join(' / ') }}</p>
          <p v-if="p.knowledgePoints?.length" class="lp-exam-points">知识点：{{ p.knowledgePoints.join(' · ') }}</p>
          <div class="lp-exam-card-foot">
            <span>{{ p.questionCount }} 题 · {{ p.section }} · 建议 {{ p.durationMinutes }} 分钟</span>
            <button class="lp-primary" @click="openPaper(p.id)">开始训练</button>
          </div>
        </article>
      </div>
      <p v-else-if="!loading" class="lp-hint">这个分类暂时没有试卷。</p>
    </template>

    <template v-else-if="result">
      <div class="lp-exam-result">
        <div class="lp-exam-result-head">
          <div>
            <span class="lp-exam-type" :class="examTypeClass(activePaper.examType)">{{ activePaper.examType }}</span>
            <h3>{{ displayPaperTitle(result.title) }}</h3>
            <p class="lp-exam-meta">用时 {{ elapsedText }} · 客观题答对 {{ result.correct }} / {{ resultObjectiveTotal }}</p>
          </div>
          <div class="lp-exam-score">
            <b>{{ result.score }}</b><span>分</span>
          </div>
        </div>
        <details v-if="isListening && activePaper.listeningScript" class="lp-exam-listening-review">
          <summary><Volume2 :size="14" /> 查看听力原文</summary>
          <p>{{ activePaper.listeningScript }}</p>
        </details>
        <div class="lp-exam-review-list">
          <article
            v-for="(d, i) in result.details" :key="d.questionId"
            class="lp-exam-review" :class="{ wrong: d.correct === false, practice: d.kind === 'practice' }"
          >
            <p class="lp-exam-review-title">
              <b>{{ i + 1 }}. {{ d.kind === 'practice' ? (d.pickedText?.trim() ? '已提交' : '未作答') : d.correct ? '答对' : '答错' }}</b>
              <span>{{ d.stem }}</span>
            </p>
            <template v-if="d.kind === 'practice'">
              <div class="lp-exam-practice-review">
                <span>你的作答</span>
                <pre>{{ d.pickedText || '未作答' }}</pre>
                <span>参考要点</span>
                <pre>{{ d.reference || '无' }}</pre>
              </div>
              <p class="lp-exam-explanation">{{ d.explanation }}</p>
            </template>
            <template v-else>
              <p class="lp-exam-answer-line">
                你的答案：
                <b>{{ d.picked == null ? '未作答' : activePaper.questions.find((q) => q.id === d.questionId)?.options?.[d.picked] }}</b>
              </p>
              <p class="lp-exam-answer-line">
                正确答案：
                <b>{{ d.answer == null ? '' : activePaper.questions.find((q) => q.id === d.questionId)?.options?.[d.answer] }}</b>
              </p>
              <p class="lp-exam-explanation">{{ d.explanation }}</p>
            </template>
          </article>
        </div>
        <button class="lp-primary" @click="backToList">← 返回真题目录</button>
      </div>
    </template>

    <template v-else>
      <div class="lp-exam-runner">
        <div class="lp-exam-runner-head">
          <button class="lp-mini" @click="backToList">‹ 真题目录</button>
          <div>
            <b>{{ displayPaperTitle(activePaper.title) }}</b>
            <span class="lp-exam-meta">{{ activePaper.examType }} · {{ activePaper.year }} · {{ activePaper.difficulty }}</span>
          </div>
          <span class="lp-exam-timer">⏱ {{ elapsedText }}</span>
        </div>
        <div class="lp-exam-layout">
          <div class="lp-exam-material">
            <article v-if="isListening" class="lp-exam-listening-panel">
              <div class="lp-exam-listening-icon"><Headphones :size="28" /></div>
              <div>
                <h4>听力部分</h4>
                <p>原文在交卷前隐藏。建议先完整听一遍，再开始作答。</p>
              </div>
              <div class="lp-exam-audio-controls">
                <button class="lp-exam-play" @click="playListening">
                  <Pause v-if="listeningPlaying" :size="18" />
                  <Play v-else :size="18" />
                  {{ listeningPlaying ? '停止播放' : '播放听力' }}
                </button>
                <button class="lp-mini" :disabled="listeningPlaying" @click="replayListening">
                  <RotateCcw :size="13" /> 重播
                </button>
                <label class="lp-exam-rate">
                  语速
                  <select v-model.number="listeningRate" :disabled="listeningPlaying">
                    <option :value="0.75">0.75×</option>
                    <option :value="0.9">0.9×</option>
                    <option :value="1">1×</option>
                  </select>
                </label>
              </div>
            </article>
            <article class="lp-exam-passage">
              <h4>{{ activePaper.examType === '软考' ? '考点与作答说明' : activePaper.examType === '高考' ? '阅读部分' : '阅读与作答材料' }}</h4>
              <p>{{ activePaper.passage }}</p>
              <div v-if="activePaper.knowledgePoints?.length" class="lp-exam-knowledge">
                <span v-for="point in activePaper.knowledgePoints" :key="point">{{ point }}</span>
              </div>
            </article>
          </div>
          <div class="lp-exam-questions">
            <article
              v-for="(q, qi) in activePaper.questions" :key="q.id"
              class="lp-exam-question" :class="{ practice: questionKind(q) === 'practice' }"
            >
              <h4>{{ qi + 1 }}. {{ q.stem }}</h4>
              <div v-if="questionKind(q) === 'practice'" class="lp-exam-practice">
                <div class="lp-exam-practice-meta">
                  <Code2 :size="14" />
                  <span>{{ q.language || 'text' }}</span>
                  <i>主观题 · 交卷后参考要点自评</i>
                </div>
                <details v-if="q.starterCode" class="lp-exam-starter">
                  <summary>查看代码模板</summary>
                  <pre>{{ q.starterCode }}</pre>
                </details>
                <textarea
                  v-model="textAnswers[q.id]"
                  class="lp-exam-code"
                  rows="9"
                  :aria-label="`第 ${qi + 1} 题作答区`"
                  placeholder="在这里写 SQL / 代码 / 架构方案或关键步骤…"
                ></textarea>
              </div>
              <div v-else class="lp-exam-options">
                <button
                  v-for="(opt, oi) in (q.options || [])" :key="oi"
                  class="lp-opt" :class="{ picked: answers[q.id] === oi }"
                  @click="choose(q.id, oi)"
                >{{ String.fromCharCode(65 + oi) }}. {{ opt }}</button>
              </div>
            </article>
          </div>
        </div>
        <div class="lp-exam-submit">
          <span>已答 {{ answeredCount }} / {{ activePaper.questions.length }}</span>
          <button class="lp-primary" :disabled="submitting" @click="submit">
            {{ submitting ? '判分中…' : '交卷判分' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.lp-exam { color: #1f2329; }
.lp-exam-head, .lp-exam-runner-head, .lp-exam-card-foot, .lp-exam-submit, .lp-exam-result-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.lp-exam-head { align-items: flex-start; margin-bottom: 14px; }
.lp-exam-head h3, .lp-exam-runner h3, .lp-exam-result h3 { margin: 0 0 4px; font-size: 16px; }
.lp-exam-sub, .lp-exam-meta, .lp-exam-tags { color: #8f959e; font-size: 12px; margin: 0; }
.lp-exam-filters { display: flex; gap: 6px; }
.lp-exam-soft-filters { display: flex; flex-wrap: wrap; gap: 8px 18px; border: 1px solid #dbe5f5; border-radius: 9px; background: #f8fbff; padding: 9px 11px; margin-bottom: 12px; }
.lp-exam-soft-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; color: #646a73; font-size: 11px; }
.lp-exam-soft-row > span { min-width: 28px; font-weight: 600; }
.lp-exam-soft-row button { border: 1px solid #d6e4ff; border-radius: 5px; background: var(--glass-bg); color: #4e5469; padding: 3px 7px; font-size: 10px; cursor: pointer; }
.lp-exam-soft-row button.active { border-color: #3370ff; background: #3370ff; color: #fff; }
.lp-exam-soft-row select { min-width: 150px; border: 1px solid #d6e4ff; border-radius: 5px; background: var(--glass-bg); color: #1f2329; padding: 4px 6px; font-size: 11px; }
.lp-chip { border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-chip.active { border-color: #3370ff; background: #f0f5ff; color: #3370ff; }
.lp-exam-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.lp-exam-card { border: 1px solid #e5e6eb; border-radius: 10px; background: #fafbfc; padding: 12px; display: flex; flex-direction: column; gap: 7px; }
.lp-exam-card-top { display: flex; align-items: center; justify-content: space-between; }
.lp-exam-card-types { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.lp-exam-card-badges { display: flex; align-items: center; gap: 6px; }
.lp-exam-type { display: inline-flex; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; margin-right: 6px; }
.lp-exam-type.postgrad { color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; }
.lp-exam-type.gaokao { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
.lp-exam-type.ruankao { color: #6b21a8; background: #faf5ff; border: 1px solid #e9d5ff; }
.lp-exam-soft-level { border: 1px solid #e9d5ff; background: #faf5ff; color: #7e22ce; border-radius: 4px; padding: 1px 6px; font-size: 10px; }
.lp-exam-soft-specialty { color: #646a73; font-size: 10px; }
.lp-exam-listening-badge { display: inline-flex; align-items: center; gap: 3px; border: 1px solid #d6e4ff; background: #f0f5ff; color: #245bdb; border-radius: 999px; padding: 2px 7px; font-size: 10px; }
.lp-exam-practice-badge { display: inline-flex; align-items: center; gap: 3px; border: 1px solid #fde68a; background: #fffbeb; color: #b45309; border-radius: 999px; padding: 2px 7px; font-size: 10px; }
.lp-exam-year { color: #646a73; font-size: 12px; font-weight: 600; }
.lp-exam-card h4 { margin: 0; font-size: 14px; line-height: 1.45; }
.lp-exam-tags { color: #646a73; }
.lp-exam-points { margin: 0; color: #245bdb; font-size: 10px; line-height: 1.5; }
.lp-exam-card-foot { margin-top: auto; padding-top: 5px; font-size: 12px; color: #8f959e; }
.lp-mini, .lp-primary { border: 1px solid #d0d3d9; background: #f5f6f7; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-primary { background: #3370ff; color: #fff; border-color: #3370ff; padding: 8px 14px; font-size: 13px; }
.lp-primary:disabled { opacity: .5; cursor: default; }
.lp-exam-runner-head { align-items: flex-start; padding-bottom: 10px; border-bottom: 1px solid #f0f1f3; }
.lp-exam-runner-head > div { flex: 1; min-width: 0; }
.lp-exam-runner-head b { display: block; font-size: 14px; margin-bottom: 3px; }
.lp-exam-timer { color: #3370ff; background: #f0f5ff; border-radius: 6px; padding: 4px 8px; font-size: 12px; white-space: nowrap; }
.lp-exam-layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 14px; margin-top: 14px; align-items: start; }
.lp-exam-passage, .lp-exam-question, .lp-exam-listening-panel { border: 1px solid #e5e6eb; border-radius: 10px; padding: 12px; background: #fafbfc; }
.lp-exam-material { position: sticky; top: 0; max-height: 72vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.lp-exam-listening-panel { display: flex; flex-direction: column; gap: 12px; background: #f7faff; border-color: #d6e4ff; }
.lp-exam-listening-panel h4 { margin: 0 0 4px; font-size: 14px; }
.lp-exam-listening-panel p { margin: 0; color: #646a73; font-size: 12px; line-height: 1.6; }
.lp-exam-listening-icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #e8f1ff; color: #3370ff; }
.lp-exam-audio-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lp-exam-play { border: 1px solid #3370ff; background: #3370ff; color: #fff; border-radius: 999px; padding: 7px 14px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.lp-exam-audio-controls .lp-mini { display: inline-flex; align-items: center; gap: 4px; }
.lp-exam-rate { display: inline-flex; align-items: center; gap: 5px; color: #646a73; font-size: 11px; }
.lp-exam-rate select { border: 1px solid #d0d3d9; border-radius: 5px; background: var(--glass-bg); padding: 4px 5px; font-size: 11px; }
.lp-exam-passage h4, .lp-exam-question h4 { margin: 0 0 8px; font-size: 13px; line-height: 1.5; }
.lp-exam-passage p { margin: 0; white-space: pre-wrap; font-size: 13px; line-height: 1.75; color: #4e5469; }
.lp-exam-knowledge { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.lp-exam-knowledge span { border: 1px solid #e9d5ff; border-radius: 999px; background: #faf5ff; color: #7e22ce; padding: 2px 7px; font-size: 10px; }
.lp-exam-questions { display: flex; flex-direction: column; gap: 10px; }
.lp-exam-question.practice { border-color: #fde68a; background: #fffdf5; }
.lp-exam-practice { display: flex; flex-direction: column; gap: 8px; }
.lp-exam-practice-meta { display: flex; align-items: center; gap: 5px; color: #b45309; font-size: 11px; }
.lp-exam-practice-meta i { color: #8f959e; font-style: normal; }
.lp-exam-starter { border: 1px dashed #fde68a; border-radius: 7px; background: #fffbeb; padding: 7px 9px; }
.lp-exam-starter summary { cursor: pointer; color: #b45309; font-size: 11px; }
.lp-exam-starter pre, .lp-exam-practice-review pre { margin: 7px 0 0; padding: 9px; border-radius: 6px; background: #111827; color: #e5e7eb; font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-x: auto; }
.lp-exam-code { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid #d0d3d9; border-radius: 8px; background: #111827; color: #e5e7eb; padding: 10px; font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
.lp-exam-code:focus { outline: 2px solid #fbbf24; outline-offset: 1px; }
.lp-exam-options { display: grid; gap: 6px; }
.lp-opt { text-align: left; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; background: var(--glass-bg); color: #1f2329; line-height: 1.45; }
.lp-opt:hover { border-color: #3370ff; }
.lp-opt.picked { border-color: #3370ff; background: #f0f5ff; }
.lp-exam-submit {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin: 14px -14px -14px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-border, #e5e6eb);
  border-radius: 0 0 9px 9px;
  background: var(--color-bg, #fff);
  box-shadow: 0 -8px 16px rgba(31, 35, 41, .08);
  font-size: 12px;
  color: var(--color-text-secondary, #646a73);
}
.lp-exam-result-head { align-items: flex-start; border-bottom: 1px solid #f0f1f3; padding-bottom: 14px; margin-bottom: 12px; }
.lp-exam-score { color: #3370ff; white-space: nowrap; }
.lp-exam-score b { font-size: 36px; line-height: 1; }
.lp-exam-score span { margin-left: 3px; font-size: 13px; }
.lp-exam-review-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.lp-exam-listening-review { margin-bottom: 12px; border: 1px solid #d6e4ff; border-radius: 8px; background: #f7faff; padding: 9px 11px; font-size: 12px; }
.lp-exam-listening-review summary { cursor: pointer; display: flex; align-items: center; gap: 5px; color: #245bdb; font-weight: 600; }
.lp-exam-listening-review p { margin: 8px 0 0; color: #4e5469; line-height: 1.7; white-space: pre-wrap; }
.lp-exam-review { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 9px 11px; font-size: 12px; }
.lp-exam-review.wrong { border-color: #fecaca; background: #fff7f7; }
.lp-exam-review.practice { border-color: #fde68a; background: #fffdf5; }
.lp-exam-review-title { display: flex; gap: 7px; margin: 0 0 5px; line-height: 1.5; }
.lp-exam-review-title b { color: #166534; white-space: nowrap; }
.lp-exam-review.wrong .lp-exam-review-title b { color: #b91c1c; }
.lp-exam-answer-line { margin: 2px 0; color: #4e5469; }
.lp-exam-explanation { margin: 6px 0 0; color: #646a73; line-height: 1.55; }
.lp-exam-practice-review { display: flex; flex-direction: column; gap: 3px; margin-top: 7px; }
.lp-exam-practice-review > span { color: #b45309; font-size: 11px; font-weight: 600; }
.lp-hint { color: #8f959e; font-size: 12px; margin: 8px 0 0; }
@media (max-width: 900px) {
  .lp-exam-layout { grid-template-columns: 1fr; }
  .lp-exam-material { position: static; max-height: none; overflow: visible; }
  .lp-exam-head, .lp-exam-runner-head, .lp-exam-card-foot, .lp-exam-submit, .lp-exam-result-head { flex-wrap: wrap; }
  .lp-exam-submit { position: static; margin: 14px 0 0; padding: 10px 0 0; border-radius: 0; box-shadow: none; }
}
</style>
