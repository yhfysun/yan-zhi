<script setup lang="ts">
// 周易学科 · 学习台（主组件）。
// 结构对齐 CultureWorkbench：总览层（八条路径路线卡 + 课时列表）+ 全屏沉浸台。
// 沉浸台骨架契约照抄：position:fixed; inset:0; z-index:3000、锁 body 滚动、
// Escape 退出 / ←→ 切步 / Tab 焦点陷阱；一次只显示一个学习步骤；
// 注释走右侧 AnnotationPanel 抽屉（点词按需出现、非 accordion）。
// 配色用独立 --zy-* 前缀（深色低饱和外层 + 浅色纸面），不复用 culture 的 CSS 变量。
// 进度写独立 localStorage key（其他科目的进度 key 一概不碰）。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, X } from 'lucide-vue-next';
import { zhouyiBlockToShapes } from '@yan-zhi/shared';
import type { ZhouyiShape } from '@yan-zhi/shared';
import { api } from '../../../api/client';
import { useZhSpeech } from '../../../composables/useZhSpeech';
import AnnotationPanel from './AnnotationPanel.vue';
import DiagramView from './diagram-view.vue';
import type {
  ZhouyiAnnotation, ZhouyiBookEntry, ZhouyiCanonWork, ZhouyiCourse, ZhouyiInterpretation, ZhouyiLesson,
  ZhouyiLine, ZhouyiPathsData, ZhouyiStepKind, ZhouyiTerm, ZhouyiTrack,
} from './zhouyi-types';

const emit = defineEmits<{ 'focus-change': [enabled: boolean] }>();
const props = defineProps<{ focusTrack?: string; focusNonce?: number }>();

const PROGRESS_KEY = 'yz.zhouyi.progress.v1';
const POSITION_KEY = 'yz.zhouyi.position.v1';

const STEP_LABELS: Record<ZhouyiStepKind, string> = {
  gloss: '题解',
  annotate: '注释',
  interpret: '注解',
  plain: '白话',
  structure: '脉络',
  check: '自测',
};

const FILTERS: Array<{ key: 'all' | 'read' | 'lecture'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'read', label: '原文精读' },
  { key: 'lecture', label: '概念讲义' },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式等存不了就算了 */ }
}

// ===== 总览层 =====
const tracks = ref<ZhouyiTrack[]>([]);
const courses = ref<ZhouyiCourse[]>([]);
const terms = ref<ZhouyiTerm[]>([]);
const bibliography = ref<ZhouyiBookEntry[]>([]);
const canonWorks = ref<ZhouyiCanonWork[]>([]);
const disclaimerText = ref('');
// 总览三视图：课程主线 / 术语索引 / 参考书目（原 /paths 下发的资料不再是无处展示的死数据）
const overviewTab = ref<'lessons' | 'terms' | 'books'>('lessons');
const termGroups = computed<Array<[string, ZhouyiTerm[]]>>(() => {
  const map = new Map<string, ZhouyiTerm[]>();
  for (const t of terms.value) {
    const g = map.get(t.category) ?? [];
    g.push(t);
    map.set(t.category, g);
  }
  return [...map.entries()];
});
const loading = ref(true);
const error = ref('');
const completedIds = ref<string[]>([]);
const kindFilter = ref<'all' | 'read' | 'lecture'>('all');
const expandedTrack = ref('');
const listRef = ref<HTMLElement | null>(null);

// focusTrack / 上次学到的课时 → 展开对应路径并滚到可视区。
// ★ 两个「点了没反应」的洞都在这：① watch 只盯 focusTrack，同一路径的第二张课卡
//   点击时值不变不触发（配合 focusNonce 强制响应）；② 只展开不滚动，列表深处点了
//   顶部路径的课，展开发生在视口外，用户感知就是「点不了」。
function applyFocus(target: string | undefined) {
  if (!target || !tracks.value.length) return;
  const asTrack = tracks.value.findIndex((t) => t.id === target);
  let focused = '';
  if (asTrack >= 0) { focused = tracks.value[asTrack].id; }
  else {
    const course = courses.value.find((c) => c.id === target);
    if (course) focused = course.track;
  }
  if (!focused) return;
  if (focused !== expandedTrack.value) expandedTrack.value = focused;
  // 已展开时也要滚回去：用户可能手动滚走了，此时点击必须给出行进反馈
  void nextTick(() => {
    const el = listRef.value?.querySelector(`[data-track-id="${focused}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
watch(() => [props.focusTrack, props.focusNonce], () => applyFocus(props.focusTrack));
watch(tracks, () => applyFocus(props.focusTrack));

function coursesOf(trackId: string): ZhouyiCourse[] {
  return courses.value.filter((c) => c.track === trackId
    && (kindFilter.value === 'all' || c.kind === kindFilter.value));
}
function courseCountOf(trackId: string): number {
  return courses.value.filter((c) => c.track === trackId).length;
}
function doneCountOf(trackId: string): number {
  return courses.value.filter((c) => c.track === trackId && c.ready && completedIds.value.includes(c.id)).length;
}
const readyTotal = computed(() => courses.value.filter((c) => c.ready).length);
const doneReady = computed(() => courses.value.filter((c) => c.ready && completedIds.value.includes(c.id)).length);
const progressPct = computed(() => (readyTotal.value ? Math.round((doneReady.value / readyTotal.value) * 100) : 0));

// ===== 沉浸台状态 =====
const immersiveRef = ref<HTMLElement | null>(null);
const focusing = ref(false);
const lesson = ref<ZhouyiLesson | null>(null);
const stepIndex = ref(0);
const maxVisited = ref(0);
let overviewScroll = 0;

// 注释步：点中的注释（抽屉按需挂载）
const activeAnno = ref<{ lineId: string; anno: ZhouyiAnnotation } | null>(null);
const readTerms = ref<Set<string>>(new Set());

// 注解步：显式切换注家类别（无空态占位）
const activeKind = ref('');

// 脉络步
const activeStructure = ref(-1);

// 自测步
const chosen = ref('');

// 诵读（read 课注释步；useZhSpeech 共用实现）
const reciter = useZhSpeech();
const speaking = ref(false);
const speakLine = ref(-1);

const steps = computed<ZhouyiStepKind[]>(() => lesson.value?.steps ?? []);
const currentStep = computed<ZhouyiStepKind | ''>(() => steps.value[stepIndex.value] ?? '');

// ===== 注释步：把一行原文切成「可注词 / 普通字」token（最长匹配） =====
function tokenizeLine(line: ZhouyiLine): Array<{ t: string; term?: string }> {
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

function openTerm(line: ZhouyiLine, term: string) {
  const anno = line.annotations.find((a) => a.term === term);
  if (!anno) return;
  readTerms.value = new Set(readTerms.value).add(`${line.id}:${term}`);
  activeAnno.value = { lineId: line.id, anno };
}

// 抽屉条目：释义 / 注音 / 备注（空字段不渲染，无空态占位）
const panelItems = computed(() => {
  const a = activeAnno.value?.anno;
  if (!a) return [];
  const items: Array<{ label: string; value: string; tag?: string }> = [];
  items.push({ label: '释义', value: a.gloss, tag: a.type });
  if (a.pinyin) items.push({ label: '注音', value: a.pinyin });
  if (a.note) items.push({ label: '备注', value: a.note });
  return items;
});

// ===== 诵读（read 课逐句读原文，按行高亮） =====
const lineTexts = computed(() => lesson.value?.lines.map((l) => l.text) ?? []);

function stopRecite() {
  speaking.value = false;
  speakLine.value = -1;
  reciter.stop();
}

function toggleRecite() {
  if (speaking.value) { stopRecite(); return; }
  speaking.value = true;
  reciter.start(lineTexts.value, {
    startIndex: 0,
    loop: 'none',
    rate: 0.9,
    silentFallback: true,
    onIndex: (i) => { if (speaking.value) speakLine.value = i; },
    onDone: () => { stopRecite(); },
  });
}

watch(stepIndex, () => {
  if (steps.value[stepIndex.value] !== 'annotate') {
    stopRecite();
    activeAnno.value = null;
  }
});

// ===== 注解步：按 kind（传/注/笺/疏/正义/集解/今按…）显式分组 =====
const interpKinds = computed(() => {
  const seen: Array<{ key: string; label: string }> = [];
  for (const line of lesson.value?.lines ?? []) {
    for (const it of line.interpretations) {
      const key = it.kind ?? '总论';
      if (!seen.some((s) => s.key === key)) seen.push({ key, label: key });
    }
  }
  return seen;
});
watch(interpKinds, (ks) => {
  if (!ks.some((k) => k.key === activeKind.value)) activeKind.value = ks[0]?.key ?? '';
});

// 只渲染有当前类别条目的行（无空态占位）
const interpGroups = computed(() => (lesson.value?.lines ?? [])
  .map((line) => ({ line, items: line.interpretations.filter((it) => (it.kind ?? '总论') === activeKind.value) }))
  .filter((g) => g.items.length));

function entryTag(it: ZhouyiInterpretation): string {
  if (it.kind === '今按') return '今按 · 编者释义';
  return it.paraphrase === true ? '大意转述' : '逐字原注';
}

// ===== 题解步：卦象/图示（blocks 经 shared zhouyiBlockToShapes 转形状——唯一实现，不自造图形） =====
const glossShapes = computed<ZhouyiShape[]>(() => {
  const out: ZhouyiShape[] = [];
  for (const line of lesson.value?.lines ?? []) {
    for (const b of line.blocks ?? []) {
      try { out.push(...zhouyiBlockToShapes(b as Parameters<typeof zhouyiBlockToShapes>[0])); }
      catch { /* 未知图块类型跳过，不炸渲染 */ }
    }
  }
  return out;
});

// 自测步：前端判卷
const checkPassed = computed(() => !!lesson.value?.quickCheck
  && !!chosen.value
  && chosen.value === lesson.value.quickCheck.answer);

function checkClass(opt: string): Record<string, boolean> {
  if (!chosen.value) return {};
  return chosen.value === opt ? { picked: true, ok: opt === (lesson.value?.quickCheck?.answer ?? '') } : { picked: opt === chosen.value };
}

// ===== 打开 / 关闭沉浸台 =====
let previousBodyOverflow = '';
let lastFocusTrigger: HTMLElement | null = null;

async function openLesson(course: ZhouyiCourse, trackId: string) {
  if (!course.ready) return; // 建设中的课绝不允许进入（总览层已 disabled，这里双保险）
  lastFocusTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  expandedTrack.value = trackId;
  overviewScroll = listRef.value?.scrollTop ?? 0;
  error.value = '';
  lesson.value = null;
  activeAnno.value = null;
  activeStructure.value = -1;
  activeKind.value = '';
  chosen.value = '';
  readTerms.value = new Set();
  stopRecite();
  try {
    const res = await api.get<ZhouyiLesson>(`/learning/zhouyi/lessons/${course.id}`);
    if (!res || !('data' in res) || !res.data) { error.value = '课时加载失败'; return; }
    lesson.value = res.data;
    stepIndex.value = 0;
    maxVisited.value = 0;
    writeJson(POSITION_KEY, course.id);
    focusing.value = true;
    emit('focus-change', true);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void nextTick(() => immersiveRef.value?.focus());
  } finally {
    // loadingLesson 态由 error/lesson 呈现，无需独立标志
  }
}

function closeFocus() {
  if (!focusing.value) return;
  focusing.value = false;
  emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
  stopRecite();
  activeAnno.value = null;
  void nextTick(() => {
    // 退出回总览保留位置：滚动位置 + 焦点都回到路线
    if (listRef.value) listRef.value.scrollTop = overviewScroll;
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
  // 无自测题的课：走完即算完成；有自测题的课由 checkPassed watch 判定
  if (lesson.value && !lesson.value.quickCheck) markComplete(lesson.value.id);
  closeFocus();
}

function markComplete(id: string) {
  if (!completedIds.value.includes(id)) {
    completedIds.value = [...completedIds.value, id];
    writeJson(PROGRESS_KEY, completedIds.value);
    // 跨端备份上报（fire-and-forget：失败静默，不影响本地进度）
    try { void api.post('/learning/lesson-progress', { subject: '周易', lessonIds: [id] }); } catch { /* 上报失败忽略 */ }
  }
}

watch(checkPassed, (ok) => {
  if (ok && lesson.value) markComplete(lesson.value.id);
});

/** 跨端进度读回：先读 localStorage，再用服务端 lessonIds 做并集；只增不清，失败静默。 */
async function mergeServerProgress() {
  try {
    const res = await api.get<{ lessonIds: string[] }>('/learning/lesson-progress?subject=周易');
    const ids = res && 'data' in res ? res.data?.lessonIds : null;
    if (!Array.isArray(ids)) return;
    const merged = new Set(completedIds.value);
    let added = false;
    for (const id of ids) {
      if (typeof id === 'string' && id && !merged.has(id)) { merged.add(id); added = true; }
    }
    if (!added) return;
    completedIds.value = [...merged];
    writeJson(PROGRESS_KEY, completedIds.value);
  } catch { /* 离线/请求失败静默 */ }
}

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
  if (event.key !== 'Tab' || !immersiveRef.value) return;
  const focusable = [...immersiveRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === immersiveRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  completedIds.value = readJson<string[]>(PROGRESS_KEY, []);
  void mergeServerProgress(); // 跨端读回（不阻塞路线加载；失败静默）
  loading.value = true;
  const res = await api.get<ZhouyiPathsData>('/learning/zhouyi/paths');
  if (res && 'data' in res && res.data?.tracks) {
    tracks.value = res.data.tracks;
    courses.value = res.data.courses ?? [];
    terms.value = res.data.terms ?? [];
    bibliography.value = res.data.bibliography ?? [];
    canonWorks.value = res.data.canon ?? [];
    disclaimerText.value = res.data.disclaimer ?? '';
    // 回到原位：优先 focusTrack（课程地图跳入），其次上次学到的课时所在路径
    const pos = readJson<string>(POSITION_KEY, '');
    applyFocus(props.focusTrack ?? pos);
    if (!expandedTrack.value) expandedTrack.value = tracks.value[0]?.id ?? '';
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
  <section class="zy-root">
    <header class="zy-head">
      <div>
        <span class="zy-kicker">周易</span>
        <h2>周易学习台 · 八径入门</h2>
        <p>先读卦爻，再读传注，一次一步。</p>
      </div>
      <div class="zy-progress">
        <span>已完成 {{ doneReady }} / {{ readyTotal }}</span>
        <div class="zy-progress-bar" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100" aria-label="总完成进度">
          <i :style="{ width: `${progressPct}%` }" />
        </div>
      </div>
    </header>

    <div class="zy-overview-tabs" role="group" aria-label="资料切换">
      <button type="button" :class="{ active: overviewTab === 'lessons' }" @click="overviewTab = 'lessons'">课程主线</button>
      <button type="button" :class="{ active: overviewTab === 'terms' }" @click="overviewTab = 'terms'">术语索引</button>
      <button type="button" :class="{ active: overviewTab === 'books' }" @click="overviewTab = 'books'">参考书目</button>
    </div>

    <div v-if="overviewTab === 'lessons' && !loading && !(error && !focusing)" class="zy-filter" role="group" aria-label="课时筛选">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        :class="{ active: kindFilter === f.key }"
        :aria-pressed="kindFilter === f.key"
        @click="kindFilter = f.key"
      >{{ f.label }}</button>
    </div>

    <p v-if="loading" class="zy-hint">正在准备学习路线…</p>
    <p v-else-if="error && !focusing" class="zy-hint zy-error">{{ error }}</p>

    <div v-else-if="overviewTab === 'terms'" class="zy-list">
      <section v-for="[cat, list] in termGroups" :key="cat" class="zy-term-group">
        <h4>{{ cat }}</h4>
        <dl v-for="t in list" :key="t.term" class="zy-term">
          <dt>{{ t.term }} <small v-if="t.pinyin">{{ t.pinyin }}</small></dt>
          <dd>{{ t.definition }}</dd>
        </dl>
      </section>
    </div>

    <div v-else-if="overviewTab === 'books'" class="zy-list">
      <section class="zy-book-group">
        <h4>课程参考书目</h4>
        <ul class="zy-book-list">
          <li v-for="b in bibliography" :key="b.title">
            <b>{{ b.title }}</b>
            <span>{{ [b.author, b.dynasty].filter(Boolean).join(' · ') }}</span>
            <em>{{ b.role }}</em>
            <span class="zy-badge" :class="{ warn: b.license === '仅书目' }">{{ b.license }}</span>
          </li>
        </ul>
      </section>
      <section class="zy-book-group">
        <h4>文库精选</h4>
        <p class="zy-book-note">公版原文可直接阅读；「仅书目」只列出处不录全文。</p>
        <article v-for="w in canonWorks" :key="w.id" class="zy-canon-work">
          <h5>{{ w.title }} <small>{{ [w.author, w.dynasty].filter(Boolean).join(' · ') }} · {{ w.license }}</small></h5>
          <p v-for="(e, i) in w.excerptLines" :key="i">
            {{ e.text }}<small v-if="e.note">（{{ e.note }}）</small>
          </p>
        </article>
      </section>
      <p v-if="disclaimerText" class="zy-disclaimer">{{ disclaimerText }}</p>
    </div>

    <div v-else ref="listRef" v-show="overviewTab === 'lessons'" class="zy-list">
      <article
        v-for="t in tracks"
        :key="t.id"
        :data-track-id="t.id"
        class="zy-track"
        :class="{ open: t.id === expandedTrack }"
      >
        <button type="button" class="zy-track-head" @click="expandedTrack = t.id">
          <span>{{ t.id }}</span>
          <div>
            <h3>{{ t.name }}</h3>
            <p>{{ t.desc }}</p>
          </div>
          <small>{{ doneCountOf(t.id) }} / {{ courseCountOf(t.id) }} 已完成</small>
        </button>
        <div v-if="t.id === expandedTrack" class="zy-course-list">
          <button
            v-for="c in coursesOf(t.id)"
            :key="c.id"
            type="button"
            class="zy-course-btn"
            :class="{ done: completedIds.includes(c.id), locked: !c.ready }"
            :disabled="!c.ready"
            @click="openLesson(c, t.id)"
          >
            <b>{{ c.name }} <span v-if="!c.ready" class="zy-badge-locked">建设中</span></b>
            <p>{{ c.goal }}</p>
            <small>{{ c.minutes }} 分钟 · {{ c.kind === 'read' ? '原文精读' : '概念讲义' }}</small>
          </button>
        </div>
      </article>
      <p class="zy-disclaimer">{{ disclaimerText }}</p>
    </div>

    <!-- 沉浸台：全屏覆盖、锁滚动；顶栏四项（返回路线 / 课程名 / 步骤 x/n / 退出） -->
    <section
      v-if="focusing"
      ref="immersiveRef"
      class="zy-immersive"
      role="dialog"
      aria-modal="true"
      :aria-label="lesson?.title"
      tabindex="-1"
    >
      <header class="zy-immersive-head">
        <button type="button" class="zy-back" @click="closeFocus"><ArrowLeft :size="15" /><span>返回路线</span></button>
        <b class="zy-immersive-title">{{ lesson?.title }}</b>
        <span class="zy-step-count">步骤 {{ stepIndex + 1 }}/{{ steps.length }}</span>
        <button type="button" class="zy-close" aria-label="退出本课" @click="closeFocus"><X :size="16" /></button>
      </header>

      <div class="zy-immersive-main">
        <article class="zy-paper" aria-live="polite">
          <!-- ① 题解（lecture 课的概念/题解步） -->
          <section v-if="currentStep === 'gloss'" class="zy-step">
            <p class="zy-goal">{{ lesson?.goal }}</p>
            <p v-if="lesson?.stance" class="zy-stance">{{ lesson.stance }}</p>
            <ol class="zy-summary">
              <li v-for="(s, i) in lesson?.plainSummary ?? []" :key="i">{{ s }}</li>
            </ol>
            <div v-if="glossShapes.length" class="zy-diagram">
              <DiagramView :shapes="glossShapes" />
            </div>
            <ul v-if="lesson?.sources.length" class="zy-sources">
              <li v-for="(s, i) in lesson.sources" :key="i">
                <b>{{ s.work }}</b>
                <span>{{ [s.author, s.dynasty, s.juan].filter(Boolean).join(' · ') }}</span>
                <span class="zy-badge" :class="{ warn: s.license === '仅书目' }">{{ s.license }}</span>
              </li>
            </ul>
            <p class="zy-source-line">底本：{{ lesson?.source }}</p>
          </section>

          <!-- ② 注释：原文切词，点词开右侧抽屉；read 课附诵读 -->
          <section v-else-if="currentStep === 'annotate'" class="zy-step">
            <div v-if="lesson?.kind === 'read'" class="zy-recite-tools">
              <button type="button" :class="{ active: speaking }" @click="toggleRecite">
                {{ speaking ? '暂停' : '诵读全文' }}
              </button>
            </div>
            <div class="zy-lines">
              <p
                v-for="(line, li) in lesson?.lines ?? []"
                :key="line.id"
                class="zy-line"
                :class="{ speaking: speakLine === li }"
              >
                <template v-for="(tok, ti) in tokenizeLine(line)" :key="ti">
                  <span
                    v-if="tok.term"
                    class="zy-term"
                    :class="{ read: readTerms.has(`${line.id}:${tok.term}`) }"
                    role="button"
                    tabindex="0"
                    @click="openTerm(line, tok.term)"
                    @keydown.enter.prevent="openTerm(line, tok.term)"
                  >{{ tok.t }}</span>
                  <span v-else>{{ tok.t }}</span>
                </template>
              </p>
            </div>
          </section>

          <!-- ③ 注解：按 kind 分组列历代注家（显式切换、无空态占位） -->
          <section v-else-if="currentStep === 'interpret'" class="zy-step">
            <div class="zy-kind-tabs" role="group" aria-label="注家类别">
              <button
                v-for="k in interpKinds"
                :key="k.key"
                type="button"
                :class="{ active: k.key === activeKind }"
                :aria-pressed="k.key === activeKind"
                @click="activeKind = k.key"
              >{{ k.label }}</button>
            </div>
            <div class="zy-interp-groups">
              <div v-for="g in interpGroups" :key="g.line.id" class="zy-interp-line">
                <p class="zy-line-echo">{{ g.line.text }}</p>
                <ul class="zy-interp-list">
                  <li v-for="(it, i) in g.items" :key="`${it.school}:${i}`">
                    <div class="zy-interp-head">
                      <b>{{ it.school }}</b>
                      <span class="zy-badge">{{ it.dynasty }}</span>
                      <span class="zy-chip">{{ entryTag(it) }}</span>
                    </div>
                    <blockquote class="zy-interp-text">{{ it.text }}</blockquote>
                    <p class="zy-interp-plain">{{ it.plain }}</p>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <!-- ④ 白话：逐句 plain + 篇级摘要 -->
          <section v-else-if="currentStep === 'plain'" class="zy-step">
            <ol class="zy-summary">
              <li v-for="(s, i) in lesson?.plainSummary ?? []" :key="i">{{ s }}</li>
            </ol>
            <div class="zy-plain-pairs">
              <div v-for="line in lesson?.lines ?? []" :key="line.id" class="zy-plain-pair">
                <p class="zy-plain-origin">{{ line.text }}</p>
                <p class="zy-plain-modern">{{ line.plain || '——' }}</p>
              </div>
            </div>
          </section>

          <!-- ⑤ 脉络：节点串讲 + 对应原文行高亮 -->
          <section v-else-if="currentStep === 'structure'" class="zy-step">
            <div class="zy-structure-flow">
              <button
                v-for="(node, i) in lesson?.structure ?? []"
                :key="i"
                type="button"
                class="zy-structure-node"
                :class="{ active: activeStructure === i }"
                @click="activeStructure = i"
              >
                <b>{{ node.label }}</b>
                <span>{{ node.hint }}</span>
              </button>
            </div>
            <div class="zy-lines">
              <p
                v-for="(line, li) in lesson?.lines ?? []"
                :key="line.id"
                class="zy-line"
                :class="{ highlight: activeStructure >= 0 && lesson?.structure[activeStructure]?.lineIndex === li }"
              >{{ line.text }}</p>
            </div>
          </section>

          <!-- ⑥ 自测：单选 + 前端判卷 -->
          <section v-else-if="currentStep === 'check'" class="zy-step">
            <template v-if="lesson?.quickCheck">
              <p class="zy-check-question">{{ lesson.quickCheck.question }}</p>
              <div class="zy-check-options">
                <button
                  v-for="opt in lesson.quickCheck.options"
                  :key="opt"
                  type="button"
                  :class="checkClass(opt)"
                  :disabled="!!chosen"
                  @click="chosen = opt"
                >{{ opt }}</button>
              </div>
              <p v-if="chosen" class="zy-check-explain" :class="{ ok: chosen === lesson.quickCheck.answer }">
                {{ chosen === lesson.quickCheck.answer ? '答对了。' : '再想想。' }}{{ lesson.quickCheck.explanation }}
              </p>
            </template>
            <p v-else class="zy-step-hint">本课未设自测。</p>
          </section>
        </article>

        <!-- 注释抽屉：只在注释步且点词后出现，右侧按需展开 -->
        <AnnotationPanel
          v-if="currentStep === 'annotate' && activeAnno"
          :visible="true"
          :title="activeAnno.anno.term"
          :items="panelItems"
          @close="activeAnno = null"
        />
      </div>

      <nav class="zy-immersive-foot" aria-label="步骤导航">
        <button type="button" :disabled="stepIndex === 0" aria-keyshortcuts="ArrowLeft" @click="moveStep(-1)">上一步</button>
        <div class="zy-dots">
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
  </section>
</template>

<style scoped>
/* ===== 总览层（用全局 token） ===== */
.zy-root { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.zy-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.zy-head > div > span { color: var(--color-primary); font-size: 10px; font-weight: 700; }
.zy-head h2 { margin: 2px 0; font-size: 16px; }
.zy-head p { margin: 0; color: var(--color-text-secondary); font-size: 11px; }
.zy-progress { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; white-space: nowrap; }
.zy-progress > span { color: var(--color-text-tertiary); font-size: 10px; font-variant-numeric: tabular-nums; }
.zy-progress-bar { width: 140px; height: 5px; border-radius: 999px; background: var(--color-border); overflow: hidden; }
.zy-progress-bar i { display: block; height: 100%; border-radius: 999px; background: var(--color-primary); transition: width .25s ease; }

.zy-filter { display: inline-flex; align-self: flex-start; gap: 2px; border: 1px solid var(--color-border); border-radius: 999px; padding: 2px; }
.zy-filter button { border: 0; border-radius: 999px; background: transparent; color: var(--color-text-tertiary); padding: 4px 12px; font-size: 11px; cursor: pointer; }
.zy-filter button.active { background: color-mix(in srgb, var(--color-primary) 14%, transparent); color: var(--color-primary); }

.zy-hint { margin: 8px 0; color: var(--color-text-tertiary); font-size: 11px; }
.zy-hint.zy-error { color: var(--color-danger); }

/* 筛选条件固定顶部、列表区独立滚动，禁止整页滚动。
   ★ 子项必须禁止收缩：flex 列容器的子项默认 flex-shrink:1，高度受限时会把 8 条路径
     连同展开的课卡一起压进容器（内容挤成一团），此时 scrollHeight == clientHeight，
     列表反而「滚不动」。收口到唯一出口 .zy-list > *，逐个子项补必然漏。 */
.zy-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.zy-list > * { flex: 0 0 auto; }
.zy-track { border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); overflow: hidden; }
.zy-track-head {
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
.zy-track-head > span {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 11%, transparent);
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.zy-track-head h3 { margin: 0; font-size: 13px; }
.zy-track-head p { margin: 2px 0 0; color: var(--color-text-tertiary); font-size: 10px; }
.zy-track-head small { color: var(--color-text-tertiary); font-size: 10px; }
.zy-course-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; padding: 0 14px 14px; }
.zy-course-btn {
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
.zy-course-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border)); }
.zy-course-btn.done { border-color: color-mix(in srgb, var(--color-success) 40%, var(--color-border)); }
.zy-course-btn.locked { opacity: .55; cursor: default; }
.zy-course-btn b { font-size: 12px; }
.zy-course-btn p { margin: 0; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
.zy-course-btn small { color: var(--color-text-tertiary); font-size: 9px; }
.zy-badge-locked {
  display: inline-block;
  border: 1px solid color-mix(in srgb, var(--color-warning, #b98a4e) 55%, transparent);
  border-radius: 999px;
  color: var(--color-warning, #b98a4e);
  font-size: 9px;
  font-weight: 400;
  padding: 0 7px;
  vertical-align: 1px;
  white-space: nowrap;
}

/* ===== 沉浸台（--zy-* 私有变量；深色低饱和外层 + 浅色纸面） ===== */
.zy-immersive {
  --zy-bg: #111417;
  --zy-panel: #1b2126;
  --zy-line: rgba(210, 200, 182, .16);
  --zy-ink: #efe9db;
  --zy-muted: #a8a194;
  --zy-accent: #9a7b4f;
  --zy-paper: #fffdf8;
  --zy-paper-ink: #2c2a26;
  --zy-paper-muted: #6f6a60;
  --zy-serif: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif;
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--zy-ink);
  background: linear-gradient(150deg, var(--zy-bg), #181e23 58%, #0b0f12);
  outline: none;
}
.zy-immersive-head {
  flex: 0 0 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--zy-line);
  background: color-mix(in srgb, var(--zy-bg) 92%, transparent);
}
.zy-back,
.zy-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--zy-line);
  border-radius: 6px;
  background: var(--zy-panel);
  color: var(--zy-muted);
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
}
.zy-back:hover,
.zy-close:hover { border-color: color-mix(in srgb, var(--zy-accent) 45%, transparent); color: var(--zy-ink); }
.zy-immersive-title { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.zy-step-count { color: var(--zy-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.zy-immersive-main {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 22px clamp(16px, 4vw, 56px);
}
.zy-paper {
  width: min(720px, 100%);
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 8px;
  background: var(--zy-paper);
  color: var(--zy-paper-ink);
  box-shadow: 0 22px 68px rgba(0, 0, 0, .3);
  padding: 26px clamp(18px, 4vw, 40px) 30px;
}
.zy-step { display: flex; flex-direction: column; gap: 16px; }
.zy-step-hint { margin: 0; color: var(--zy-paper-muted); font-size: 12px; }

/* 题解步 */
.zy-goal { margin: 0; font-size: 15px; line-height: 1.7; }
.zy-stance { margin: 0; color: var(--zy-paper-muted); font-size: 12px; line-height: 1.7; border-left: 3px solid color-mix(in srgb, var(--zy-accent) 45%, transparent); padding-left: 10px; }
.zy-summary { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.zy-summary li { font-size: 14px; line-height: 1.8; }
.zy-diagram { border: 1px solid rgba(44, 42, 38, .12); border-radius: 8px; background: #ffffff; padding: 10px 12px; }
.zy-sources {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 12px 0 0;
  border-top: 1px solid rgba(44, 42, 38, .1);
  list-style: none;
}
.zy-sources li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--zy-paper-muted); }
.zy-sources li b { color: var(--zy-paper-ink); font-size: 12px; }
.zy-badge {
  border: 1px solid rgba(138, 106, 63, .4);
  border-radius: 999px;
  color: #8a6a3f;
  font-size: 9px;
  padding: 1px 7px;
  white-space: nowrap;
}
.zy-badge.warn { border-color: rgba(185, 28, 28, .4); color: rgba(163, 42, 42, .9); }
.zy-source-line { margin: 0; color: var(--zy-paper-muted); font-size: 11px; }

/* 原文行：衬线大字、行距宽 */
.zy-lines { display: flex; flex-direction: column; gap: 10px; }
.zy-line {
  margin: 0;
  font-family: var(--zy-serif);
  font-size: 22px;
  line-height: 2;
  letter-spacing: .06em;
  color: var(--zy-paper-ink);
  border-radius: 6px;
  padding: 0 6px;
  transition: background .2s ease;
}
.zy-line.highlight { background: color-mix(in srgb, var(--zy-accent) 16%, transparent); }
.zy-line.speaking { background: color-mix(in srgb, var(--zy-accent) 22%, transparent); }

/* 注释步 */
.zy-recite-tools { display: flex; gap: 8px; }
.zy-recite-tools button {
  border: 1px solid rgba(44, 42, 38, .2);
  border-radius: 999px;
  background: #ffffff;
  color: var(--zy-paper-ink);
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.zy-recite-tools button.active { border-color: rgba(138, 106, 63, .6); background: color-mix(in srgb, var(--zy-accent) 14%, #ffffff); }
.zy-term {
  text-decoration: underline dotted rgba(138, 106, 63, .55);
  text-underline-offset: 6px;
  cursor: pointer;
}
.zy-term.read { background: color-mix(in srgb, var(--zy-accent) 10%, transparent); }
.zy-term:hover { background: color-mix(in srgb, var(--zy-accent) 18%, transparent); }

/* 注解步 */
.zy-kind-tabs { display: inline-flex; align-self: flex-start; gap: 2px; flex-wrap: wrap; border: 1px solid rgba(44, 42, 38, .18); border-radius: 999px; padding: 2px; }
.zy-kind-tabs button { border: 0; border-radius: 999px; background: transparent; color: var(--zy-paper-muted); padding: 4px 12px; font-size: 11px; cursor: pointer; }
.zy-kind-tabs button.active { background: color-mix(in srgb, var(--zy-accent) 16%, transparent); color: #8a6a3f; }
.zy-interp-groups { display: flex; flex-direction: column; gap: 16px; }
.zy-interp-line { border-top: 1px solid rgba(44, 42, 38, .1); padding-top: 12px; }
.zy-line-echo {
  margin: 0 0 8px;
  font-family: var(--zy-serif);
  font-size: 17px;
  line-height: 1.8;
  letter-spacing: .05em;
}
.zy-interp-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.zy-interp-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.zy-interp-head b { font-size: 12px; }
.zy-chip {
  border: 1px dashed rgba(138, 106, 63, .55);
  border-radius: 999px;
  color: #8a6a3f;
  font-size: 9px;
  padding: 1px 7px;
  white-space: nowrap;
}
.zy-interp-text {
  margin: 6px 0 0;
  border-left: 3px solid rgba(138, 106, 63, .35);
  padding: 2px 0 2px 8px;
  font-family: var(--zy-serif);
  font-size: 12px;
  line-height: 1.8;
}
.zy-interp-plain { margin: 5px 0 0; color: var(--zy-paper-muted); font-size: 11px; line-height: 1.6; }

/* 白话步 */
.zy-plain-pairs { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid rgba(44, 42, 38, .1); padding-top: 14px; }
.zy-plain-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: baseline; }
.zy-plain-origin { margin: 0; font-family: var(--zy-serif); font-size: 18px; line-height: 1.9; }
.zy-plain-modern { margin: 0; color: var(--zy-paper-muted); font-size: 13px; line-height: 1.8; }

/* 脉络步 */
.zy-structure-flow { display: flex; gap: 8px; flex-wrap: wrap; }
.zy-structure-node {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 8px;
  background: #ffffff;
  color: var(--zy-paper-ink);
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
}
.zy-structure-node.active { border-color: rgba(138, 106, 63, .6); background: color-mix(in srgb, var(--zy-accent) 12%, #ffffff); }
.zy-structure-node b { font-size: 12px; }
.zy-structure-node span { color: var(--zy-paper-muted); font-size: 11px; }

/* 自测步 */
.zy-check-question { margin: 0; font-size: 15px; line-height: 1.7; }
.zy-check-options { display: flex; flex-direction: column; gap: 8px; }
.zy-check-options button {
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 6px;
  background: #ffffff;
  color: var(--zy-paper-ink);
  padding: 10px 14px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.zy-check-options button:hover:not(:disabled) { border-color: rgba(138, 106, 63, .6); }
.zy-check-options button.ok { border-color: rgba(46, 125, 91, .7); background: color-mix(in srgb, #2e7d5b 10%, #ffffff); }
.zy-check-options button.picked:not(.ok) { border-color: rgba(185, 28, 28, .5); }
.zy-check-explain { margin: 0; font-size: 12px; line-height: 1.7; color: var(--zy-paper-muted); }
.zy-check-explain.ok { color: #2e7d5b; }

/* 底部步骤导航 */
.zy-immersive-foot {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-top: 1px solid var(--zy-line);
  background: color-mix(in srgb, var(--zy-bg) 92%, transparent);
}
.zy-immersive-foot > button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid var(--zy-line);
  border-radius: 6px;
  background: var(--zy-panel);
  color: var(--zy-muted);
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.zy-immersive-foot > button.primary { border-color: color-mix(in srgb, var(--zy-accent) 50%, transparent); color: var(--zy-ink); }
.zy-immersive-foot > button:disabled { opacity: .4; cursor: default; }
.zy-dots { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
.zy-dots button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--zy-muted);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}
.zy-dots button.active { background: color-mix(in srgb, var(--zy-accent) 18%, transparent); color: var(--zy-ink); }
.zy-dots button:disabled { opacity: .35; cursor: default; }

@media (max-width: 760px) {
  .zy-head { flex-direction: column; align-items: flex-start; }
  .zy-step-count { display: none; }
  .zy-plain-pair { grid-template-columns: 1fr; }
}

/* ★★ 窄屏（≤900px，与 Learning.vue 的单列断点同口径）：总览层**不再自带滚动容器**。
   根因（2026-11-16 真机实报「周易课程页面无法滑动」）：
     学习页单列布局下 .lp-col-mid 变成 height:auto ⇒ .zy-root 的 height:100% 解析为
     auto ⇒ 其内的 .zy-list(flex:1 1 0 + min-height:0) 在**无确定高度**的 flex 容器里
     自由空间为 0 ⇒ 列表高度塌成 0 ⇒ 内容被压扁、页面高度也不增长 ⇒ 整页滑不动。
   改法：窄屏下 .zy-root 交出高度链、.zy-list 不再是滚动容器（overflow 可见），
     让内容自然撑开，由**页面级滚动**（Learning.vue 的 .main-content.has-learning
     overflow-y:auto）承担滚动 —— 与英语/文化等科目的单列体验一致。
   ⚠ 断点必须是 900px（不是本文件原有的 760px）：学习页在 ≤900px 就转单列，
     761~900px 区间若仍按桌面高度链走，同样会塌陷。 */
@media (max-width: 900px) {
  .zy-root { height: auto; min-height: 0; }
  .zy-list {
    flex: 0 0 auto;
    min-height: 0;
    overflow-y: visible;
    overscroll-behavior: auto;
  }
}

/* 总览资料切换（课程主线 / 术语索引 / 参考书目） */
.zy-overview-tabs { display: flex; gap: 6px; padding: 0 18px 4px; }
.zy-overview-tabs button {
  border: 1px solid var(--zy-line, #d8d3c8);
  background: transparent;
  color: var(--zy-muted, #6f6a60);
  font-size: 13px;
  padding: 5px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.zy-overview-tabs button.active {
  background: var(--zy-accent, #2f3a4a);
  border-color: var(--zy-accent, #2f3a4a);
  color: #fffdf8;
}

/* 术语索引：按分类分组，列表区独立滚动 */
.zy-term-group { padding: 8px 18px; }
.zy-term-group h4 { margin: 8px 0 6px; font-size: 14px; color: var(--zy-muted, #6f6a60); }
.zy-term { margin: 0 0 10px; }
.zy-term dt { font-weight: 600; font-size: 14px; }
.zy-term dt small { font-weight: 400; color: var(--zy-muted, #8a8578); margin-left: 6px; }
.zy-term dd { margin: 2px 0 0; font-size: 13px; line-height: 1.6; color: var(--zy-ink, #3a372f); }

/* 参考书目与文库精选 */
.zy-book-group { padding: 8px 18px; }
.zy-book-group h4 { margin: 8px 0 6px; font-size: 14px; color: var(--zy-muted, #6f6a60); }
.zy-book-note { font-size: 12px; color: var(--zy-muted, #8a8578); margin: 0 0 8px; }
.zy-book-list { list-style: none; margin: 0; padding: 0; }
.zy-book-list li {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0; border-bottom: 1px dashed var(--zy-line, #e2ddd2); font-size: 13px;
}
.zy-book-list li span { color: var(--zy-muted, #6f6a60); }
.zy-book-list li em { font-style: normal; font-size: 12px; color: var(--zy-muted, #8a8578); }
.zy-canon-work { margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px dashed var(--zy-line, #e2ddd2); }
.zy-canon-work h5 { margin: 4px 0 6px; font-size: 14px; }
.zy-canon-work h5 small { font-weight: 400; color: var(--zy-muted, #8a8578); }
.zy-canon-work p { margin: 0 0 6px; font-size: 14px; line-height: 1.8; font-family: 'Songti SC', 'Noto Serif SC', serif; }
.zy-canon-work p small { color: var(--zy-muted, #8a8578); margin-left: 6px; }
.zy-disclaimer { padding: 10px 18px 16px; font-size: 12px; color: var(--zy-muted, #8a8578); }
</style>
