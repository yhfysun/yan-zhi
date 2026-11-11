<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';

type ExamType = '考研' | '高考';
type ExamFilter = '全部' | ExamType;
type ExamSummary = {
  id: string; title: string; examType: ExamType; year: number; region: string;
  section: string; difficulty: string; durationMinutes: number; tags: string[];
  questionCount: number;
};
type ExamQuestion = { id: string; stem: string; options: string[] };
type ExamPaper = Omit<ExamSummary, 'questionCount'> & { passage: string; questions: ExamQuestion[] };
type ExamResult = {
  paperId: string; title: string; correct: number; total: number; score: number;
  details: Array<{
    questionId: string; stem: string; picked: number | null; answer: number;
    correct: boolean; explanation: string;
  }>;
};

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

const filter = ref<ExamFilter>('全部');
const papers = ref<ExamSummary[]>([]);
const loading = ref(false);
const activePaper = ref<ExamPaper | null>(null);
const answers = ref<Record<string, number>>({});
const submitting = ref(false);
const result = ref<ExamResult | null>(null);
const elapsedSeconds = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const filteredPapers = computed(() => filter.value === '全部'
  ? papers.value
  : papers.value.filter((p) => p.examType === filter.value));
const answeredCount = computed(() => activePaper.value
  ? activePaper.value.questions.filter((q) => Number.isInteger(answers.value[q.id])).length
  : 0);
const elapsedText = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0');
  const s = (elapsedSeconds.value % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

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
    result.value = null;
    startTimer();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '试卷加载失败');
  }
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
      { answers: answers.value },
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
  activePaper.value = null;
  answers.value = {};
  result.value = null;
  elapsedSeconds.value = 0;
}

onMounted(loadPapers);
onBeforeUnmount(stopTimer);
</script>

<template>
  <section class="lp-exam">
    <template v-if="!activePaper">
      <div class="lp-exam-head">
        <div>
          <h3>历年真题</h3>
          <p class="lp-exam-sub">考研与高考英语客观题精练，交卷后按题计分并给出逐题解析。</p>
        </div>
        <div class="lp-exam-filters" aria-label="真题类型筛选">
          <button
            v-for="f in (['全部', '考研', '高考'] as ExamFilter[])" :key="f"
            class="lp-chip" :class="{ active: filter === f }"
            @click="filter = f"
          >{{ f }}</button>
        </div>
      </div>
      <div v-if="filteredPapers.length" class="lp-exam-grid">
        <article v-for="p in filteredPapers" :key="p.id" class="lp-exam-card">
          <div class="lp-exam-card-top">
            <span class="lp-exam-type" :class="p.examType === '考研' ? 'postgrad' : 'gaokao'">{{ p.examType }}</span>
            <span class="lp-exam-year">{{ p.year }}</span>
          </div>
          <h4>{{ p.title }}</h4>
          <p class="lp-exam-meta">{{ p.region }} · {{ p.section }} · {{ p.difficulty }}</p>
          <p class="lp-exam-tags">{{ p.tags.join(' / ') }}</p>
          <div class="lp-exam-card-foot">
            <span>{{ p.questionCount }} 题 · 建议 {{ p.durationMinutes }} 分钟</span>
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
            <span class="lp-exam-type" :class="activePaper.examType === '考研' ? 'postgrad' : 'gaokao'">{{ activePaper.examType }}</span>
            <h3>{{ result.title }}</h3>
            <p class="lp-exam-meta">用时 {{ elapsedText }} · 答对 {{ result.correct }} / {{ result.total }}</p>
          </div>
          <div class="lp-exam-score">
            <b>{{ result.score }}</b><span>分</span>
          </div>
        </div>
        <div class="lp-exam-review-list">
          <article
            v-for="(d, i) in result.details" :key="d.questionId"
            class="lp-exam-review" :class="{ wrong: !d.correct }"
          >
            <p class="lp-exam-review-title">
              <b>{{ i + 1 }}. {{ d.correct ? '答对' : '答错' }}</b>
              <span>{{ d.stem }}</span>
            </p>
            <p class="lp-exam-answer-line">
              你的答案：
              <b>{{ d.picked == null ? '未作答' : activePaper.questions.find((q) => q.id === d.questionId)?.options[d.picked] }}</b>
            </p>
            <p class="lp-exam-answer-line">
              正确答案：
              <b>{{ activePaper.questions.find((q) => q.id === d.questionId)?.options[d.answer] }}</b>
            </p>
            <p class="lp-exam-explanation">{{ d.explanation }}</p>
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
            <b>{{ activePaper.title }}</b>
            <span class="lp-exam-meta">{{ activePaper.examType }} · {{ activePaper.year }} · {{ activePaper.difficulty }}</span>
          </div>
          <span class="lp-exam-timer">⏱ {{ elapsedText }}</span>
        </div>
        <div class="lp-exam-layout">
          <article class="lp-exam-passage">
            <h4>阅读材料</h4>
            <p>{{ activePaper.passage }}</p>
          </article>
          <div class="lp-exam-questions">
            <article
              v-for="(q, qi) in activePaper.questions" :key="q.id"
              class="lp-exam-question"
            >
              <h4>{{ qi + 1 }}. {{ q.stem }}</h4>
              <div class="lp-exam-options">
                <button
                  v-for="(opt, oi) in q.options" :key="oi"
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
.lp-chip { border: 1px solid #e5e6eb; background: #fafbfc; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-chip.active { border-color: #3370ff; background: #f0f5ff; color: #3370ff; }
.lp-exam-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.lp-exam-card { border: 1px solid #e5e6eb; border-radius: 10px; background: #fafbfc; padding: 12px; display: flex; flex-direction: column; gap: 7px; }
.lp-exam-card-top { display: flex; align-items: center; justify-content: space-between; }
.lp-exam-type { display: inline-flex; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; margin-right: 6px; }
.lp-exam-type.postgrad { color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; }
.lp-exam-type.gaokao { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
.lp-exam-year { color: #646a73; font-size: 12px; font-weight: 600; }
.lp-exam-card h4 { margin: 0; font-size: 14px; line-height: 1.45; }
.lp-exam-tags { color: #646a73; }
.lp-exam-card-foot { margin-top: auto; padding-top: 5px; font-size: 12px; color: #8f959e; }
.lp-mini, .lp-primary { border: 1px solid #d0d3d9; background: #f5f6f7; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #1f2329; }
.lp-primary { background: #3370ff; color: #fff; border-color: #3370ff; padding: 8px 14px; font-size: 13px; }
.lp-primary:disabled { opacity: .5; cursor: default; }
.lp-exam-runner-head { align-items: flex-start; padding-bottom: 10px; border-bottom: 1px solid #f0f1f3; }
.lp-exam-runner-head > div { flex: 1; min-width: 0; }
.lp-exam-runner-head b { display: block; font-size: 14px; margin-bottom: 3px; }
.lp-exam-timer { color: #3370ff; background: #f0f5ff; border-radius: 6px; padding: 4px 8px; font-size: 12px; white-space: nowrap; }
.lp-exam-layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 14px; margin-top: 14px; align-items: start; }
.lp-exam-passage, .lp-exam-question { border: 1px solid #e5e6eb; border-radius: 10px; padding: 12px; background: #fafbfc; }
.lp-exam-passage { position: sticky; top: 0; max-height: 68vh; overflow-y: auto; }
.lp-exam-passage h4, .lp-exam-question h4 { margin: 0 0 8px; font-size: 13px; line-height: 1.5; }
.lp-exam-passage p { margin: 0; white-space: pre-wrap; font-size: 13px; line-height: 1.75; color: #4e5469; }
.lp-exam-questions { display: flex; flex-direction: column; gap: 10px; }
.lp-exam-options { display: grid; gap: 6px; }
.lp-opt { text-align: left; border: 1px solid #e5e6eb; border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; background: var(--glass-bg); color: #1f2329; line-height: 1.45; }
.lp-opt:hover { border-color: #3370ff; }
.lp-opt.picked { border-color: #3370ff; background: #f0f5ff; }
.lp-exam-submit { position: sticky; bottom: 0; margin-top: 14px; padding-top: 10px; border-top: 1px solid #f0f1f3; background: var(--glass-bg); font-size: 12px; color: #646a73; }
.lp-exam-result-head { align-items: flex-start; border-bottom: 1px solid #f0f1f3; padding-bottom: 14px; margin-bottom: 12px; }
.lp-exam-score { color: #3370ff; white-space: nowrap; }
.lp-exam-score b { font-size: 36px; line-height: 1; }
.lp-exam-score span { margin-left: 3px; font-size: 13px; }
.lp-exam-review-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.lp-exam-review { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 9px 11px; font-size: 12px; }
.lp-exam-review.wrong { border-color: #fecaca; background: #fff7f7; }
.lp-exam-review-title { display: flex; gap: 7px; margin: 0 0 5px; line-height: 1.5; }
.lp-exam-review-title b { color: #166534; white-space: nowrap; }
.lp-exam-review.wrong .lp-exam-review-title b { color: #b91c1c; }
.lp-exam-answer-line { margin: 2px 0; color: #4e5469; }
.lp-exam-explanation { margin: 6px 0 0; color: #646a73; line-height: 1.55; }
.lp-hint { color: #8f959e; font-size: 12px; margin: 8px 0 0; }
@media (max-width: 900px) {
  .lp-exam-layout { grid-template-columns: 1fr; }
  .lp-exam-passage { position: static; max-height: none; }
  .lp-exam-head, .lp-exam-runner-head, .lp-exam-card-foot, .lp-exam-submit, .lp-exam-result-head { flex-wrap: wrap; }
}
</style>
