<script setup lang="ts">
// 传统文化 · 典籍精读台（主组件）。
// 结构对齐英语主线（EnglishPathWorkbench）：总览层四阶课时列表 + 全屏沉浸台；
// 沉浸台骨架契约照抄：position:fixed; inset:0; z-index:3000、锁 body 滚动、
// Escape 退出 / ←→ 切步 / Tab 焦点陷阱；配色用独立 --cul-* 前缀（深色低饱和外层 + 宣纸阅读面）。
// 交互宪法：一次只显示一个学习步骤；注解走右侧抽屉不用行内折叠；顶栏只留四项信息。
// 进度写独立 localStorage key（英语主线与安全科的进度 key 一概不碰）。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, X } from 'lucide-vue-next';
import { api } from '../../api/client';
import { useZhSpeech } from '../../composables/useZhSpeech';
import AnnotationDrawer from './culture/AnnotationDrawer.vue';
import CoupletBoard from './culture/CoupletBoard.vue';
import NoteQuickCreateDialog from '../notes/NoteQuickCreateDialog.vue';
import type {
  CanonLine, CoupletLesson, CultureLesson, CulturePathStage, CultureStepKind,
} from './culture/culture-types';

const emit = defineEmits<{ 'focus-change': [active: boolean] }>();
const props = defineProps<{ focusLevel?: string }>();

const COMPLETED_KEY = 'yz.learning.culture.completed.v1';
const POSITION_KEY = 'yz.learning.culture.position.v1';

const STEP_LABELS: Record<CultureStepKind, string> = {
  recite: '诵读',
  gloss: '逐字注',
  plain: '白话',
  structure: '脉络',
  check: '自测',
  couplet: '对句',
};
type Depth = '初学' | '进阶' | '原文';
const DEPTHS: Depth[] = ['初学', '进阶', '原文'];

// ===== 总览层 =====
const stages = ref<CulturePathStage[]>([]);
const stageIndex = ref(0);
const loading = ref(true);
const error = ref('');
const completedIds = ref<string[]>([]);

// 左栏课程地图点击 → 聚焦到对应阶（props.focusLevel 由 openCourse 传入）
function applyFocusLevel(level: string | undefined) {
  if (!level || !stages.value.length) return;
  const idx = stages.value.findIndex((s) => s.level === level);
  if (idx >= 0) stageIndex.value = idx;
}
watch(() => props.focusLevel, applyFocusLevel);
watch(stages, () => applyFocusLevel(props.focusLevel));

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式等存不了就算了 */ }
}

// ===== 沉浸台状态 =====
const dialogRef = ref<HTMLElement | null>(null);
const focusing = ref(false);
const lesson = ref<CultureLesson | null>(null);
const soloCouplet = ref<CoupletLesson | null>(null); // 从总览直接点对句题：单步沉浸
const stepIndex = ref(0);
const maxVisited = ref(0);
const couplet = ref<CoupletLesson | null>(null);
const coupletLoading = ref(false);
const coupletPassed = ref(false);
const loadingLesson = ref(false);

// 逐字注步
const depth = ref<Depth>('初学');
// 点中的注解引用：当前行 + 点查的词（抽屉两段数据都从行上取）
const activeRef = ref<{ line: CanonLine; term: string } | null>(null);
const readTerms = ref<Set<string>>(new Set());

// 脉络步
const activeStructure = ref(-1);

// 自测步
const chosen = ref('');

// 诵读步（useZhSpeech 共用实现：保留标点自然停顿 + 自动挑中文声线；不可用降级为只高亮不发声）
const speakIndex = ref(-1);
const speaking = ref(false);
const loopSingle = ref(false);
const reciter = useZhSpeech();

const steps = computed<CultureStepKind[]>(() => lesson.value?.steps ?? (soloCouplet.value ? ['couplet'] : []));
const currentStep = computed<CultureStepKind | ''>(() => steps.value[stepIndex.value] ?? '');
const immersiveTitle = computed(() => lesson.value?.title ?? soloCouplet.value?.title ?? '');
const currentId = computed(() => lesson.value?.id ?? soloCouplet.value?.id ?? '');

// ===== 原文切句（诵读步按句切分逐句高亮） =====
const sentences = computed(() => {
  const out: Array<{ key: string; text: string }> = [];
  for (const line of lesson.value?.lines ?? []) {
    const parts = line.text.match(/[^，。！？；、]+[，。！？；、]?/g) ?? [line.text];
    parts.forEach((p, i) => out.push({ key: `${line.id}:${i}`, text: p }));
  }
  return out;
});
const speakKey = computed(() => sentences.value[speakIndex.value]?.key ?? '');

function stopRecite() {
  speaking.value = false;
  reciter.stop();
}

function speakFrom(index: number) {
  if (index < 0 || index >= sentences.value.length) { stopRecite(); return; }
  speakIndex.value = index;
  speaking.value = true;
  reciter.start(
    sentences.value.map((s) => s.text),
    {
      startIndex: index,
      loop: loopSingle.value ? 'single' : 'none',
      rate: 0.9,
      silentFallback: true,
      onIndex: (i) => { if (speaking.value) speakIndex.value = i; },
      onDone: () => { stopRecite(); },
    },
  );
}

function toggleRecite() {
  if (speaking.value) { stopRecite(); return; }
  speakFrom(speakIndex.value < 0 ? 0 : speakIndex.value);
}

function playSentence(index: number) {
  speakFrom(index);
}

watch(stepIndex, () => {
  if (steps.value[stepIndex.value] !== 'recite') stopRecite();
});

// ===== 逐字注：把一行原文切成「可注词 / 普通字」token（最长匹配） =====
function tokenizeLine(line: CanonLine): Array<{ t: string; term?: string }> {
  const keys = line.annotations.map((a) => a.term).sort((a, b) => b.length - a.length);
  const tokens: Array<{ t: string; term?: string }> = [];
  let buf = '';
  let i = 0;
  while (i < line.text.length) {
    const hit = keys.find((k) => line.text.startsWith(k, i));
    if (hit) {
      if (buf) { tokens.push({ t: buf }); buf = ''; }
      tokens.push({ t: hit, term: hit });
      i += hit.length;
    } else {
      buf += line.text[i];
      i += 1;
    }
  }
  if (buf) tokens.push({ t: buf });
  return tokens;
}

// 深度口径：初学全部可点；进阶每行只留第一条注释的字/词（关键字）；原文不可点
function canClickTerm(line: CanonLine, term: string): boolean {
  if (!lesson.value) return false;
  if (depth.value === '原文') return false;
  if (depth.value === '初学') return true;
  return line.annotations[0]?.term === term;
}

function setDepth(d: Depth) {
  depth.value = d;
  if (d === '原文') activeRef.value = null;
}

function openTerm(line: CanonLine, term: string) {
  if (!line.annotations.some((a) => a.term === term)) return;
  readTerms.value = new Set(readTerms.value).add(`${line.id}:${term}`);
  activeRef.value = { line, term };
}

// 自测步：前端判卷
function checkClass(opt: string): Record<string, boolean> {
  if (!chosen.value) return {};
  return chosen.value === opt ? { picked: true, ok: opt === (lesson.value?.quickCheck?.answer ?? '') } : { picked: opt === chosen.value };
}

// ===== 打开 / 关闭沉浸台 =====
let previousBodyOverflow = '';
let lastFocusTrigger: HTMLElement | null = null;

async function openLesson(stageIdx: number, lessonId: string) {
  const stage = stages.value[stageIdx];
  if (!stage) return;
  lastFocusTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stageIndex.value = stageIdx;
  loadingLesson.value = true;
  error.value = '';
  lesson.value = null;
  soloCouplet.value = null;
  couplet.value = null;
  coupletPassed.value = false;
  activeRef.value = null;
  activeStructure.value = -1;
  chosen.value = '';
  stopRecite();
  try {
    const res = await api.get<CultureLesson>(`/learning/culture/lessons/${lessonId}`);
    if (!res || !('data' in res) || !res.data) { error.value = '课时加载失败'; loadingLesson.value = false; return; }
    lesson.value = res.data;
    stepIndex.value = 0;
    maxVisited.value = 0;
    writeJson(POSITION_KEY, lessonId);
    if (lesson.value.steps.includes('couplet')) void loadCouplet(stage.couplets[0]?.id ?? '');
    focusing.value = true;
    emit('focus-change', true);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void nextTick(() => dialogRef.value?.focus());
  } finally {
    loadingLesson.value = false;
  }
}

async function openCouplet(stageIdx: number, coupletId: string) {
  const stage = stages.value[stageIdx];
  if (!stage) return;
  lastFocusTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stageIndex.value = stageIdx;
  lesson.value = null;
  couplet.value = null;
  coupletPassed.value = false;
  stopRecite();
  stepIndex.value = 0;
  maxVisited.value = 0;
  writeJson(POSITION_KEY, coupletId);
  focusing.value = true;
  emit('focus-change', true);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  void nextTick(() => dialogRef.value?.focus());
  await loadCouplet(coupletId);
  soloCouplet.value = couplet.value;
}

async function loadCouplet(id: string) {
  if (!id) { couplet.value = null; return; }
  coupletLoading.value = true;
  try {
    const res = await api.get<CoupletLesson>(`/learning/culture/couplet/${id}`);
    if (res && 'data' in res && res.data) couplet.value = res.data;
  } finally {
    coupletLoading.value = false;
  }
}

function closeFocus() {
  if (!focusing.value) return;
  focusing.value = false;
  emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
  stopRecite();
  activeRef.value = null;
  void nextTick(() => {
    if (lastFocusTrigger?.isConnected) lastFocusTrigger.focus();
    lastFocusTrigger = null;
  });
}

function moveStep(delta: number) {
  const next = stepIndex.value + delta;
  if (next < 0 || next >= steps.value.length) return;
  stepIndex.value = next;
  maxVisited.value = Math.max(maxVisited.value, next);
}

function finishLesson() {
  if (currentId.value) markComplete(currentId.value);
  closeFocus();
}

function onCoupletPass() {
  coupletPassed.value = true;
  if (currentId.value) markComplete(currentId.value);
}

function markComplete(id: string) {
  if (!completedIds.value.includes(id)) {
    completedIds.value = [...completedIds.value, id];
    writeJson(COMPLETED_KEY, completedIds.value);
    // 跨端备份上报（fire-and-forget：失败静默，不影响本地进度）
    try { void api.post('/learning/lesson-progress', { subject: '传统文化', lessonIds: [id] }); } catch { /* 上报失败忽略 */ }
  }
}

/**
 * 跨端进度读回（P2）：先读 localStorage（onMounted 已做），再用服务端 lessonIds 做并集合并写回。
 * 只增不清：server 与本地都不会被对方清空；失败静默（离线可用不退化）。
 */
async function mergeServerProgress() {
  try {
    const res = await api.get<{ lessonIds: string[] }>('/learning/lesson-progress?subject=传统文化');
    const ids = res && 'data' in res ? res.data?.lessonIds : null;
    if (!Array.isArray(ids)) return;
    const merged = new Set(completedIds.value);
    let added = false;
    for (const id of ids) {
      if (typeof id === 'string' && id && !merged.has(id)) { merged.add(id); added = true; }
    }
    if (!added) return;
    completedIds.value = [...merged];
    writeJson(COMPLETED_KEY, completedIds.value);
  } catch { /* 离线/请求失败静默 */ }
}

function stageDoneCount(stage: CulturePathStage): number {
  return [...stage.lessons, ...stage.couplets].filter((x) => completedIds.value.includes(x.id)).length;
}

// ===== 记到笔记（沉浸台顶栏入口：预填各行原文 + 白话摘要，不影响五步/键盘/进度逻辑） =====
const noteVisible = ref(false);
const noteTitle = computed(() => lesson.value?.title ?? soloCouplet.value?.title ?? '');
const noteContent = computed(() => {
  const l = lesson.value;
  if (l) {
    const origin = l.lines.map((x) => x.text).join('\n');
    const plain = l.plainSummary.join('\n');
    return `${origin}\n\n白话：\n${plain}`;
  }
  const c = soloCouplet.value;
  return c ? `出句「${c.prompt}」。示例对句「${c.sampleAnswer}」。${c.sampleWhy}` : '';
});

// ===== 键盘：Escape 退出 / ←→ 切步 / Tab 焦点陷阱 =====
function handleKeydown(event: KeyboardEvent) {
  if (!focusing.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeFocus();
    return;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  const isTyping = !!target?.closest('input, textarea, select, [contenteditable="true"]');
  if (isTyping) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveStep(1);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveStep(-1);
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = [...dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  completedIds.value = readJson<string[]>(COMPLETED_KEY, []);
  void mergeServerProgress(); // 跨端读回（不阻塞路线加载；失败静默）
  loading.value = true;
  const res = await api.get<{ stages: CulturePathStage[] }>('/learning/culture/paths');
  if (res && 'data' in res && res.data?.stages) {
    stages.value = res.data.stages;
    // 回到原位：上次学到的课时在哪个阶，就展开哪个阶
    const pos = readJson<string>(POSITION_KEY, '');
    const idx = stages.value.findIndex((s) => s.lessons.some((l) => l.id === pos) || s.couplets.some((c) => c.id === pos));
    if (idx >= 0) stageIndex.value = idx;
  } else {
    error.value = '学习路线加载失败';
  }
  loading.value = false;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  stopRecite();
  if (focusing.value) emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <section class="cul-root">
    <header class="cul-head">
      <div>
        <span class="cul-kicker">传统文化</span>
        <h2>典籍精读 · 从对韵到五经</h2>
        <p>先把每个字点开、每句话说明白，最后自己对出一句联。</p>
      </div>
    </header>

    <p v-if="loading" class="cul-hint">正在准备学习路线…</p>
    <p v-else-if="error" class="cul-hint cul-error">{{ error }}</p>

    <template v-else>
      <div v-for="(stage, si) in stages" :key="stage.level" class="cul-stage" :class="{ open: si === stageIndex }">
        <button type="button" class="cul-stage-head" @click="stageIndex = si">
          <span>{{ String(si + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ stage.level }}</h3>
            <p>{{ stage.lessons.length }} 节精读课 · {{ stage.couplets.length }} 道对句题</p>
          </div>
          <small>{{ stageDoneCount(stage) }} / {{ stage.lessons.length + stage.couplets.length }} 已完成</small>
        </button>
        <div v-if="si === stageIndex" class="cul-lesson-list">
          <button
            v-for="l in stage.lessons"
            :key="l.id"
            type="button"
            class="cul-lesson-btn"
            :class="{ done: completedIds.includes(l.id) }"
            @click="openLesson(si, l.id)"
          >
            <b>{{ l.title }}</b>
            <p>{{ l.goal }}</p>
            <small>{{ l.minutes }} 分钟 · {{ l.steps.length }} 步</small>
          </button>
          <button
            v-for="c in stage.couplets"
            :key="c.id"
            type="button"
            class="cul-lesson-btn cul-couplet-btn"
            :class="{ done: completedIds.includes(c.id) }"
            @click="openCouplet(si, c.id)"
          >
            <b>对句 · {{ c.title }}</b>
            <p>出句「{{ c.prompt }}」（{{ c.promptTone }}）</p>
            <small>点候选字填槽</small>
          </button>
        </div>
      </div>
    </template>

    <!-- 沉浸台：全屏覆盖、锁滚动；顶栏四项（返回 / 课程名 / 步骤 x/n / 退出） -->
    <section
      v-if="focusing"
      ref="dialogRef"
      class="cul-immersive"
      role="dialog"
      aria-modal="true"
      :aria-label="immersiveTitle"
      tabindex="-1"
    >
      <header class="cul-immersive-head">
        <button type="button" class="cul-back" @click="closeFocus"><ArrowLeft :size="15" /><span>返回路线</span></button>
        <b class="cul-immersive-title">{{ immersiveTitle }}</b>
        <span class="cul-step-count">步骤 {{ stepIndex + 1 }}/{{ steps.length }}</span>
        <button type="button" class="cul-note-btn" @click="noteVisible = true">记笔记</button>
        <button type="button" class="cul-close" aria-label="退出本课" @click="closeFocus"><X :size="16" /></button>
      </header>

      <div class="cul-immersive-main">
        <article class="cul-paper" aria-live="polite">
          <!-- ① 诵读 -->
          <section v-if="currentStep === 'recite'" class="cul-step cul-step-recite">
            <div class="cul-recite-tools">
              <button type="button" class="cul-recite-toggle" @click="toggleRecite">
                {{ speaking ? '暂停' : speakIndex >= 0 ? '继续' : '诵读全文' }}
              </button>
              <button type="button" :class="{ active: loopSingle }" :aria-pressed="loopSingle" @click="loopSingle = !loopSingle">单句循环</button>
            </div>
            <div class="cul-lines">
              <p v-for="line in lesson?.lines ?? []" :key="line.id" class="cul-line">
                <button
                  v-for="(s, i) in sentences.filter((x) => x.key.startsWith(`${line.id}:`))"
                  :key="s.key"
                  type="button"
                  class="cul-sentence"
                  :class="{ active: speakKey === s.key }"
                  @click="playSentence(sentences.indexOf(s))"
                >{{ s.text }}</button>
              </p>
            </div>
          </section>

          <!-- ② 逐字注 -->
          <section v-else-if="currentStep === 'gloss'" class="cul-step cul-step-gloss">
            <div class="cul-depth" role="group" aria-label="注解深度">
              <button
                v-for="d in DEPTHS"
                :key="d"
                type="button"
                :class="{ active: depth === d }"
                :aria-pressed="depth === d"
                @click="setDepth(d)"
              >{{ d }}</button>
            </div>
            <div class="cul-lines">
              <p v-for="line in lesson?.lines ?? []" :key="line.id" class="cul-line">
                <template v-for="(tok, ti) in tokenizeLine(line)" :key="ti">
                  <span
                    v-if="tok.term && canClickTerm(line, tok.term)"
                    class="cul-gloss-term"
                    :class="{ read: readTerms.has(`${line.id}:${tok.term}`) }"
                    role="button"
                    tabindex="0"
                    @click="openTerm(line, tok.term)"
                  >{{ tok.t }}</span>
                  <span v-else>{{ tok.t }}</span>
                </template>
              </p>
            </div>
          </section>

          <!-- ③ 白话 -->
          <section v-else-if="currentStep === 'plain'" class="cul-step cul-step-plain">
            <ol class="cul-plain-summary">
              <li v-for="(s, i) in lesson?.plainSummary ?? []" :key="i">{{ s }}</li>
            </ol>
            <div class="cul-plain-pairs">
              <div v-for="line in lesson?.lines ?? []" :key="line.id" class="cul-plain-pair">
                <p class="cul-plain-origin">{{ line.text }}</p>
                <p class="cul-plain-modern">{{ line.plain || '——' }}</p>
              </div>
            </div>
          </section>

          <!-- ④ 脉络 -->
          <section v-else-if="currentStep === 'structure'" class="cul-step cul-step-structure">
            <div class="cul-structure-flow">
              <button
                v-for="(node, i) in lesson?.structure ?? []"
                :key="i"
                type="button"
                class="cul-structure-node"
                :class="{ active: activeStructure === i }"
                @click="activeStructure = i"
              >
                <b>{{ node.label }}</b>
                <span>{{ node.hint }}</span>
              </button>
            </div>
            <div class="cul-lines">
              <p
                v-for="(line, li) in lesson?.lines ?? []"
                :key="line.id"
                class="cul-line"
                :class="{ highlight: activeStructure >= 0 && lesson?.structure[activeStructure]?.lineIndex === li }"
              >{{ line.text }}</p>
            </div>
          </section>

          <!-- ⑤ 自测 / 对句 -->
          <section v-else-if="currentStep === 'check'" class="cul-step cul-step-check">
            <template v-if="lesson?.quickCheck">
              <p class="cul-check-question">{{ lesson.quickCheck.question }}</p>
              <div class="cul-check-options">
                <button
                  v-for="opt in lesson.quickCheck.options"
                  :key="opt"
                  type="button"
                  :class="checkClass(opt)"
                  :disabled="!!chosen"
                  @click="chosen = opt"
                >{{ opt }}</button>
              </div>
              <p v-if="chosen" class="cul-check-explain" :class="{ ok: chosen === lesson.quickCheck.answer }">
                {{ chosen === lesson.quickCheck.answer ? '答对了。' : '再想想。' }}{{ lesson.quickCheck.explanation }}
              </p>
            </template>
            <p v-else class="cul-hint">本课以对句收束。</p>
          </section>
          <section v-else-if="currentStep === 'couplet'" class="cul-step cul-step-couplet">
            <p v-if="coupletLoading" class="cul-hint">正在准备对句题…</p>
            <template v-else-if="couplet">
              <CoupletBoard :lesson="couplet" @pass="onCoupletPass" />
              <p v-if="coupletPassed" class="cul-couplet-pass">对上了。</p>
            </template>
            <p v-else class="cul-hint">对句题加载失败。</p>
          </section>
        </article>

        <!-- 注解抽屉：只在逐字注步出现，右侧常驻展开（不用行内折叠） -->
        <AnnotationDrawer
          v-if="currentStep === 'gloss' && activeRef"
          :line="activeRef.line"
          :term="activeRef.term"
          :depth="depth"
        />
      </div>

      <nav class="cul-immersive-foot" aria-label="步骤导航">
        <button type="button" :disabled="stepIndex === 0" aria-keyshortcuts="ArrowLeft" @click="moveStep(-1)">上一步</button>
        <div class="cul-dots">
          <button
            v-for="(s, i) in steps"
            :key="s"
            type="button"
            :class="{ active: i === stepIndex }"
            :disabled="i > maxVisited"
            :aria-current="i === stepIndex ? 'step' : undefined"
            @click="stepIndex = i; maxVisited = Math.max(maxVisited, i)"
          >{{ STEP_LABELS[s] }}</button>
        </div>
        <button v-if="stepIndex < steps.length - 1" type="button" class="primary" aria-keyshortcuts="ArrowRight" @click="moveStep(1)">下一步</button>
        <button v-else type="button" class="primary" @click="finishLesson">完成本课</button>
      </nav>
    </section>

    <!-- 记到笔记弹窗（Teleport 到 body，z-index 与沉浸台同级可正常盖出） -->
    <NoteQuickCreateDialog
      v-model:visible="noteVisible"
      :title="noteTitle"
      :content="noteContent"
      category-name="典籍摘抄"
    />
  </section>
</template>

<style scoped>
/* ===== 总览层（用全局 token） ===== */
.cul-root { display: flex; flex-direction: column; gap: 12px; }
.cul-head > div > span { color: var(--color-primary); font-size: 10px; font-weight: 700; }
.cul-head h2 { margin: 2px 0; font-size: 16px; }
.cul-head p { margin: 0; color: var(--color-text-secondary); font-size: 11px; }
.cul-hint { margin: 8px 0; color: var(--color-text-tertiary); font-size: 11px; }
.cul-hint.cul-error { color: var(--color-danger); }

.cul-stage { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); overflow: hidden; }
.cul-stage-head {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--color-text);
  padding: 11px 14px;
  text-align: left;
  cursor: pointer;
}
.cul-stage-head > span { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: color-mix(in srgb, var(--color-primary) 11%, transparent); color: var(--color-primary); font-size: 10px; font-weight: 700; }
.cul-stage-head h3 { margin: 0; font-size: 13px; }
.cul-stage-head p { margin: 2px 0 0; color: var(--color-text-tertiary); font-size: 10px; }
.cul-stage-head small { color: var(--color-text-tertiary); font-size: 10px; }
.cul-lesson-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; padding: 0 14px 14px; }
.cul-lesson-btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg-hover);
  color: var(--color-text);
  padding: 11px;
  text-align: left;
  cursor: pointer;
}
.cul-lesson-btn:hover { border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border)); }
.cul-lesson-btn.done { border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-border)); }
.cul-lesson-btn b { font-size: 12px; }
.cul-lesson-btn p { margin: 0; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
.cul-lesson-btn small { color: var(--color-text-tertiary); font-size: 9px; }

/* ===== 沉浸台（--cul-* 私有变量；深色低饱和外层 + 宣纸阅读面） ===== */
.cul-immersive {
  --cul-bg: #101418;
  --cul-panel: #1a2026;
  --cul-line: rgba(214, 205, 188, .16);
  --cul-ink: #f0ead9;
  --cul-muted: #a9a294;
  --cul-accent: #b98a4e;
  --cul-paper: #fffdf8;
  --cul-paper-ink: #2c2a26;
  --cul-paper-muted: #6f6a60;
  --cul-serif: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif;
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--cul-ink);
  background: linear-gradient(150deg, var(--cul-bg), #171d22 58%, #0c1014);
  outline: none;
}
.cul-immersive-head {
  flex: 0 0 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--cul-line);
  background: color-mix(in srgb, var(--cul-bg) 92%, transparent);
}
.cul-back,
.cul-close,
.cul-note-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--cul-line);
  border-radius: 6px;
  background: var(--cul-panel);
  color: var(--cul-muted);
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
}
.cul-back:hover,
.cul-close:hover,
.cul-note-btn:hover { border-color: color-mix(in srgb, var(--cul-accent) 45%, transparent); color: var(--cul-ink); }
.cul-immersive-title { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.cul-step-count { color: var(--cul-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.cul-immersive-main {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 22px clamp(16px, 4vw, 56px);
}
.cul-paper {
  width: min(720px, 100%);
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 8px;
  background: var(--cul-paper);
  color: var(--cul-paper-ink);
  box-shadow: 0 22px 68px rgba(0, 0, 0, .3);
  padding: 26px clamp(18px, 4vw, 40px) 30px;
}
.cul-step { display: flex; flex-direction: column; gap: 16px; }

/* 原文行：衬线大字、行距宽 */
.cul-lines { display: flex; flex-direction: column; gap: 10px; }
.cul-line {
  margin: 0;
  font-family: var(--cul-serif);
  font-size: 22px;
  line-height: 2;
  letter-spacing: .06em;
  color: var(--cul-paper-ink);
  border-radius: 6px;
  padding: 0 6px;
  transition: background .2s ease;
}
.cul-line.highlight { background: color-mix(in srgb, var(--cul-accent) 16%, transparent); }

/* 诵读步 */
.cul-recite-tools { display: flex; gap: 8px; }
.cul-recite-tools button {
  border: 1px solid rgba(44, 42, 38, .2);
  border-radius: 999px;
  background: #ffffff;
  color: var(--cul-paper-ink);
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.cul-recite-tools button.active { border-color: rgba(138, 106, 63, .6); background: color-mix(in srgb, var(--cul-accent) 14%, #ffffff); }
.cul-sentence {
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  padding: 0 2px;
  cursor: pointer;
  border-radius: 4px;
}
.cul-sentence.active { background: color-mix(in srgb, var(--cul-accent) 26%, transparent); }

/* 逐字注步 */
.cul-depth { display: inline-flex; gap: 2px; align-self: flex-start; border: 1px solid rgba(44, 42, 38, .18); border-radius: 999px; padding: 2px; }
.cul-depth button { border: 0; border-radius: 999px; background: transparent; color: var(--cul-paper-muted); padding: 4px 12px; font-size: 11px; cursor: pointer; }
.cul-depth button.active { background: color-mix(in srgb, var(--cul-accent) 16%, transparent); color: #8a6a3f; }
.cul-gloss-term {
  text-decoration: underline dotted rgba(138, 106, 63, .55);
  text-underline-offset: 6px;
  cursor: pointer;
}
.cul-gloss-term.read { background: color-mix(in srgb, var(--cul-accent) 10%, transparent); }
.cul-gloss-term:hover { background: color-mix(in srgb, var(--cul-accent) 18%, transparent); }

/* 白话步 */
.cul-plain-summary { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.cul-plain-summary li { font-size: 14px; line-height: 1.8; }
.cul-plain-pairs { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid rgba(44, 42, 38, .1); padding-top: 14px; }
.cul-plain-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: baseline; }
.cul-plain-origin { margin: 0; font-family: var(--cul-serif); font-size: 18px; line-height: 1.9; }
.cul-plain-modern { margin: 0; color: var(--cul-paper-muted); font-size: 13px; line-height: 1.8; }

/* 脉络步 */
.cul-structure-flow { display: flex; gap: 8px; flex-wrap: wrap; }
.cul-structure-node {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 8px;
  background: #ffffff;
  color: var(--cul-paper-ink);
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
}
.cul-structure-node.active { border-color: rgba(138, 106, 63, .6); background: color-mix(in srgb, var(--cul-accent) 12%, #ffffff); }
.cul-structure-node b { font-size: 12px; }
.cul-structure-node span { color: var(--cul-paper-muted); font-size: 11px; }

/* 自测步 */
.cul-check-question { margin: 0; font-size: 15px; line-height: 1.7; }
.cul-check-options { display: flex; flex-direction: column; gap: 8px; }
.cul-check-options button {
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 6px;
  background: #ffffff;
  color: var(--cul-paper-ink);
  padding: 10px 14px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.cul-check-options button:hover:not(:disabled) { border-color: rgba(138, 106, 63, .6); }
.cul-check-options button.ok { border-color: rgba(46, 125, 91, .7); background: color-mix(in srgb, #2e7d5b 10%, #ffffff); }
.cul-check-options button.picked:not(.ok) { border-color: rgba(185, 28, 28, .5); }
.cul-check-explain { margin: 0; font-size: 12px; line-height: 1.7; color: var(--cul-paper-muted); }
.cul-check-explain.ok { color: #2e7d5b; }
.cul-couplet-pass { margin: 0; text-align: center; color: #2e7d5b; font-size: 13px; }

/* 底部步骤导航 */
.cul-immersive-foot {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-top: 1px solid var(--cul-line);
  background: color-mix(in srgb, var(--cul-bg) 92%, transparent);
}
.cul-immersive-foot > button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--cul-line);
  border-radius: 6px;
  background: var(--cul-panel);
  color: var(--cul-muted);
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.cul-immersive-foot > button.primary { border-color: color-mix(in srgb, var(--cul-accent) 50%, transparent); color: var(--cul-ink); }
.cul-immersive-foot > button:disabled { opacity: .4; cursor: default; }
.cul-dots { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
.cul-dots button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cul-muted);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}
.cul-dots button.active { background: color-mix(in srgb, var(--cul-accent) 18%, transparent); color: var(--cul-ink); }
.cul-dots button:disabled { opacity: .35; cursor: default; }

@media (max-width: 760px) {
  .cul-immersive-head { grid-template-columns: auto minmax(0, 1fr) auto auto; }
  .cul-step-count { display: none; }
  .cul-plain-pair { grid-template-columns: 1fr; }
}
</style>
