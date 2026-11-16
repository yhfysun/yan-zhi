<script setup lang="ts">
// 音乐 · 谱面工作台 v2（docs/音乐双方向重构方案-2026-11-15.md §五）。
// 一个科目两条方向（western / traditional）：方向切换换路线；记法 Tab 与调式控件按方向派生；
// 跨方向术语不串味（分域硬闸由 music-score.test.ts 钉死）。
// 沉浸台骨架契约照 EnglishPathWorkbench：position:fixed inset:0 z-index:3000、Escape/←→/Tab 焦点陷阱、
// 私有变量 --score-*；进度 key 按方向隔离 yz.learning.music.<track>.completed.v1。
// 「记到笔记」：谱面 SVG 序列化 → POST /notes/media → Markdown 片段预填（方案 §3.5）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../../api/client';
import { useScoreAudio } from '../../composables/useScoreAudio';
import NoteQuickCreateDialog from '../notes/NoteQuickCreateDialog.vue';
import {
  NOTATION_BY_TRACK, PENTA_ORDER, PENTA_VIEW, STEP_ORDER, labelsFor, modeLabel, noteToTrad,
  staffLayout, trackLabel, transposeScore,
  type MusicTrack, type NotationMode, type NoteEvent, type Score, type ScoreMode,
} from '../../utils/learning/score-render';

type MusicStepKind = 'listen' | 'recognize' | 'write' | 'play' | 'check';
type MusicLesson = {
  id: string;
  kind: 'listen' | 'read' | 'compose' | 'lyric' | 'check';
  title: string; goal: string; minutes: number;
  level: string; track: string;
  steps: MusicStepKind[];
  scoreId?: string;
  lyricTemplate?: string[];
  quickCheck?: { question: string; options: string[]; answer: string; explanation: string };
};
type MusicPathStage = { level: string; lessons: Array<{ id: string; kind: string; title: string; goal: string; minutes: number; steps: MusicStepKind[]; track: string }> };

const props = defineProps<{ focusTrack?: string }>();
const emit = defineEmits<{ 'focus-change': [active: boolean]; 'open-studio': [score: Score] }>();

const { playNote, playSequence, stopAll } = useScoreAudio();

// ── 常量 ──────────────────────────────────────────────────────────────────────
const TRACKS: MusicTrack[] = ['western', 'traditional'];
const STEP_LABELS: Record<MusicStepKind, string> = { listen: '听', recognize: '认', write: '写', play: '奏', check: '查' };
const SOLFA = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
/** 西方方向调性选项（P0 白键根）；传统方向 = 五个五声调式 */
const WESTERN_MODES: Array<{ label: string; value: string; mode: ScoreMode }> = [
  { label: 'C 大调', value: 'C:major', mode: { kind: 'major', tonic: 'C' } },
  { label: 'G 大调', value: 'G:major', mode: { kind: 'major', tonic: 'G' } },
  { label: 'F 大调', value: 'F:major', mode: { kind: 'major', tonic: 'F' } },
  { label: 'A 小调', value: 'A:minor', mode: { kind: 'minor', tonic: 'A' } },
];
const TRAD_MODES: Array<{ label: string; value: string; mode: ScoreMode }> = PENTA_ORDER.map((t) => ({
  label: `${PENTA_VIEW[t].w}调式`, value: `${t}:pentatonic`, mode: { kind: 'pentatonic', tonic: t } as ScoreMode,
}));
const GRID_COLS = 16;
const PLAY_BPM = 84;

// ── 状态 ──────────────────────────────────────────────────────────────────────
const track = ref<MusicTrack>('western');
const stages = ref<MusicPathStage[]>([]);
// ★★ 阶段手风琴（2026-11-16 用户实报「布局还是长的很」）：音乐总览此前全部阶段×全部
//   课程平铺（两条路线各 4-6 阶 × 每阶 4-8 课）⇒ 页面巨长。与文化/周易统一为
//   单开手风琴：桌面默认展开第一阶，移动端（≤900px）默认全收起。
const openStage = ref('');
function toggleStage(level: string) {
  openStage.value = openStage.value === level ? '' : level;
}
const isCompactViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 900px)')?.matches;
const loading = ref(true);
const error = ref('');
const completed = ref<Record<string, boolean>>({});
const focusing = ref(false);
const lesson = ref<MusicLesson | null>(null);
const score = ref<Score | null>(null);
const stepIdx = ref(0);
const notation = ref<NotationMode>('staff');
const modeSel = ref('C:major');
const highlightIdx = ref(-1);
const playing = ref(false);
const surfaceRef = ref<HTMLElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);
const noteDialogVisible = ref(false);
const noteContent = ref('');
const grid = ref<boolean[][]>([]);
const lyricVals = ref<string[]>([]);
const picked = ref('');
const blockOctave = ref(4);
let previousBodyOverflow = '';
let endTimer: ReturnType<typeof setTimeout> | null = null;

// ── 派生 ──────────────────────────────────────────────────────────────────────
const notationTabs = computed(() => NOTATION_BY_TRACK[track.value]);
const gridRows = computed(() => (track.value === 'western' ? STEP_ORDER : PENTA_ORDER));
const rowNote = (row: number): NoteEvent => (track.value === 'western'
  ? { step: STEP_ORDER[row], octave: blockOctave.value, beats: 1 }
  : { step: PENTA_VIEW[PENTA_ORDER[row]].e as NoteEvent['step'], octave: blockOctave.value, beats: 1 });
const rowName = (row: number): string => (track.value === 'western' ? STEP_ORDER[row] : PENTA_VIEW[PENTA_ORDER[row]].w);
const selectedMode = computed<ScoreMode>(() => {
  const [tonic, kind] = modeSel.value.split(':');
  if (track.value === 'traditional') return { kind: 'pentatonic', tonic: (tonic as 'gong') };
  return { kind: kind === 'minor' ? 'minor' : 'major', tonic: (tonic as 'C') };
});
const modeOptions = computed(() => (track.value === 'western' ? WESTERN_MODES : TRAD_MODES));
/** 调式/调性下拉移调：渲染/试听全部走移调后的音符（数据源仍是同一份 notes） */
const transposed = computed(() => (score.value ? transposeScore(score.value, selectedMode.value) : null));
const transposedNotes = computed(() => transposed.value?.notes ?? []);
const staff = computed(() => (notation.value === 'staff' ? staffLayout(transposedNotes.value, { key: transposed.value?.key, meter: transposed.value?.meter }) : null));
const labelList = computed(() => (notation.value !== 'staff' ? labelsFor(notation.value, transposedNotes.value) : []));
const currentStep = computed<MusicStepKind | ''>(() => lesson.value?.steps[stepIdx.value] ?? '');
const quickCheck = computed(() => lesson.value?.quickCheck ?? null);
const showGridInline = computed(() => currentStep.value === 'write' || currentStep.value === 'play');
const isLyricLesson = computed(() => lesson.value?.kind === 'lyric');
const isLastStep = computed(() => !!lesson.value && stepIdx.value >= lesson.value.steps.length - 1);
const completedKey = computed(() => `yz.learning.music.${track.value}.completed.v1`);
const positionKey = computed(() => `yz.learning.music.${track.value}.position.v1`);

function notationLabelOf(n: NoteEvent): string {
  const t = noteToTrad(n);
  return t ? PENTA_VIEW[t].n : n.step;
}
function scoreToModeSel(s: Score | null): string {
  if (!s) return track.value === 'western' ? 'C:major' : 'gong:pentatonic';
  return s.mode.kind === 'pentatonic' ? `${s.mode.tonic}:pentatonic` : `${s.mode.tonic}:${s.mode.kind}`;
}

// ── 工具 ──────────────────────────────────────────────────────────────────────
function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}
function loadCompleted() {
  try { completed.value = JSON.parse(localStorage.getItem(completedKey.value) || '{}'); }
  catch { completed.value = {}; }
}
function persistCompleted() {
  try { localStorage.setItem(completedKey.value, JSON.stringify(completed.value)); } catch { /* 无持久化环境忽略 */ }
}
function persistPosition() {
  try {
    localStorage.setItem(positionKey.value, JSON.stringify({ lessonId: lesson.value?.id ?? '', stepIdx: stepIdx.value }));
  } catch { /* 无持久化环境忽略 */ }
}

/** 跨端进度读回：server lessonIds 并集合并进 localStorage（只增不清；失败静默） */
async function mergeServerProgress() {
  try {
    const ids = unwrap<{ lessonIds: string[] }>(await api.get<{ lessonIds: string[] }>('/learning/lesson-progress?subject=音乐'))?.lessonIds;
    if (!Array.isArray(ids)) return;
    const merged = { ...completed.value };
    let added = false;
    for (const id of ids) {
      if (typeof id === 'string' && id && !merged[id]) { merged[id] = true; added = true; }
    }
    if (!added) return;
    completed.value = merged;
    persistCompleted();
  } catch { /* 离线/请求失败静默 */ }
}

// ── 数据加载 ──────────────────────────────────────────────────────────────────
async function loadPaths() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get<{ data: { stages: MusicPathStage[] } }>(`/learning/music/paths?track=${track.value}`);
    const data = unwrap<{ stages: MusicPathStage[] }>(r);
    stages.value = data?.stages ?? [];
    if (!stages.value.length) error.value = `${trackLabel(track.value)}路线为空`;
    // 手风琴默认态：桌面展开第一阶（保留桌面信息密度），移动端全收起（页面浓缩）
    const first = stages.value[0]?.level ?? '';
    openStage.value = isCompactViewport() ? '' : first;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function switchTrack(t: MusicTrack) {
  if (track.value === t) return;
  track.value = t;
  notation.value = NOTATION_BY_TRACK[t][0].mode;
  modeSel.value = t === 'western' ? 'C:major' : 'gong:pentatonic';
  openStage.value = ''; // 换路线重置手风琴（各路线的阶段集不同）
}

watch(track, () => { loadCompleted(); void loadPaths(); });
watch(() => props.focusTrack, (t) => { if (t === 'western' || t === 'traditional') switchTrack(t); });

async function openLesson(id: string) {
  try {
    const r = await api.get<{ data: MusicLesson }>(`/learning/music/lessons/${encodeURIComponent(id)}`);
    const data = unwrap<MusicLesson>(r);
    if (!data) { error.value = '课时不存在'; return; }
    lesson.value = data;
    stepIdx.value = 0;
    picked.value = '';
    highlightIdx.value = -1;
    grid.value = gridRows.value.map(() => Array<boolean>(GRID_COLS).fill(false));
    resetLyricVals();
    if (data.scoreId) {
      const sr = await api.get<{ data: Score }>(`/learning/music/scores/${encodeURIComponent(data.scoreId)}`);
      score.value = unwrap<Score>(sr);
      modeSel.value = scoreToModeSel(score.value);
    } else {
      score.value = null;
      modeSel.value = track.value === 'western' ? 'C:major' : 'gong:pentatonic';
    }
    enterFocus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function resetLyricVals() {
  const count = (score.value?.notes ?? []).filter((n) => !n.rest).length;
  const tpl = lesson.value?.lyricTemplate;
  lyricVals.value = Array.from({ length: count }, (_, i) => tpl?.[i] ?? '');
}

// ── 沉浸台开关（fixed 全屏 + 锁滚动 + focus-change 通知） ─────────────────────────
function enterFocus() {
  focusing.value = true;
  emit('focus-change', true);
  if (typeof document !== 'undefined') {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  persistPosition();
}
function closeFocus() {
  stopPlayback();
  focusing.value = false;
  emit('focus-change', false);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = previousBodyOverflow;
  }
  persistPosition();
}

// ── 步骤推进（←→ 键与底部按钮共用） ─────────────────────────────────────────────
function moveStep(delta: number) {
  if (!lesson.value) return;
  const next = stepIdx.value + delta;
  if (next < 0) return;
  if (next >= lesson.value.steps.length) {
    // 最后一步的「下一步」= 完成课时：记进度、留在课尾可回看
    completed.value[lesson.value.id] = true;
    persistCompleted();
    try { void api.post('/learning/lesson-progress', { subject: '音乐', lessonIds: [lesson.value.id] }); } catch { /* 上报失败忽略 */ }
    return;
  }
  stopPlayback();
  picked.value = '';
  stepIdx.value = next;
  persistPosition();
}

// ── 发声 ──────────────────────────────────────────────────────────────────────
function onNoteClick(index: number) {
  const n = transposedNotes.value[index];
  if (!n || n.rest) return;
  highlightIdx.value = index;
  playNote(n, 0.6);
}
function onLabelClick(index: number) { onNoteClick(index); }
/** 音名块试奏条：点即响 */
function onBlockClick(row: number) {
  highlightIdx.value = -1;
  playNote(rowNote(row), 0.6);
}
function stopPlayback() {
  stopAll();
  playing.value = false;
  highlightIdx.value = -1;
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
}
/** 试听整段：音头跟随高亮（各记法共用同一个 highlightIdx） */
function togglePlay() {
  if (playing.value) { stopPlayback(); return; }
  const notes = transposedNotes.value;
  if (!notes.length) return;
  stopAll();
  playing.value = true;
  const handle = playSequence(notes, PLAY_BPM, (i) => { highlightIdx.value = i; });
  const totalSec = notes.reduce((s, n) => s + n.beats * (60 / PLAY_BPM), 0);
  endTimer = setTimeout(() => { handle.stop(); playing.value = false; highlightIdx.value = -1; }, Math.round(totalSec * 1000) + 150);
}

// ── 编曲格子 ──────────────────────────────────────────────────────────────────
function gridCellActive(row: number, col: number): boolean {
  return !!grid.value[row]?.[col];
}
/** 点格 toggle：落音立即试听（调式下拉对格子无效——格子是自编素材） */
function toggleGridCell(row: number, col: number) {
  const rowArr = grid.value[row];
  if (!rowArr) return;
  rowArr[col] = !rowArr[col];
  if (rowArr[col]) playNote(rowNote(row), 0.5);
}
/** 试听编曲：按列从最靠下的已点行取音（每列单声部一拍） */
function gridSequence(): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = gridRows.value.length - 1; row >= 0; row--) {
      if (grid.value[row]?.[col]) { events.push(rowNote(row)); break; }
    }
  }
  return events;
}
function playGrid() {
  const events = gridSequence();
  if (!events.length) return;
  stopAll();
  playing.value = true;
  const handle = playSequence(events, PLAY_BPM);
  endTimer = setTimeout(() => { handle.stop(); playing.value = false; }, Math.round(events.length * (60 / PLAY_BPM) * 1000) + 150);
}

/** 送谱进编曲台（方案 §3.4：写/奏步 ↔ 编曲台双向）——格子投影 + 当前调式/方向 */
function openInStudio() {
  const events = gridSequence();
  if (!events.length) return;
  const [tonic, kind] = modeSel.value.split(':');
  const score: Score = {
    id: `lesson_${lesson.value?.id ?? Date.now().toString(36)}`,
    title: `${lesson.value?.title ?? '课程小曲'} · 我的编曲`,
    track: track.value,
    clef: 'treble',
    key: track.value === 'traditional' ? 'C 宫' : tonic,
    meter: [4, 4],
    mode: selectedMode.value,
    notes: events,
  };
  closeFocus();
  emit('open-studio', score);
}

// ── 自查步（前端判卷，不落库） ──────────────────────────────────────────────────
function pickOption(opt: string) {
  picked.value = opt;
}

// ── 记到笔记（方案 §3.5：曲谱直接入笔记 + 自己写说明） ───────────────────────────
async function sendScoreToNote() {
  try {
    const svg = surfaceRef.value?.querySelector('svg');
    if (!svg || !transposed.value) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const bytes = new TextEncoder().encode(xml);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const r = unwrap<{ url: string }>(await api.post<{ url: string }>('/notes/media', { name: `${transposed.value.title || '曲谱'}.svg`, base64: btoa(binary) }));
    if (!r?.url) return;
    noteContent.value = `## ${transposed.value.title || lesson.value?.title || '曲谱'} · ${modeLabel(transposed.value.mode)}（${trackLabel(track.value)}）\n![谱面](${r.url})\n\n（在这里写你的说明…）`;
    noteDialogVisible.value = true;
  } catch { /* 上传失败静默：不打断学习 */ }
}

// ── 键盘：Escape 退出 / ←→ 切步 / Tab 焦点陷阱（同英语沉浸台契约） ─────────────────
function handleKeydown(event: KeyboardEvent) {
  if (!focusing.value) return;
  if (event.key === 'Escape') {
    closeFocus();
    return;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  const isTyping = !!target?.closest('input, textarea, select, [contenteditable="true"]');
  if (!isTyping && event.key === 'ArrowRight') {
    event.preventDefault();
    moveStep(1);
    return;
  }
  if (!isTyping && event.key === 'ArrowLeft') {
    event.preventDefault();
    moveStep(-1);
    return;
  }
  if (event.key !== 'Tab' || !overlayRef.value) return;
  const focusable = [...overlayRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === overlayRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  loadCompleted();
  void mergeServerProgress();
  await loadPaths();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  stopPlayback();
  if (focusing.value) {
    emit('focus-change', false);
    if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow;
  }
});
</script>

<template>
  <div class="music-workbench">
    <!-- ── 总览：方向切换 + 路线 ─────────────────────────────────────────────── -->
    <div class="mw-overview">
      <div class="mw-overview-head">
        <b>音乐 · 谱面工作台</b>
        <small>两条方向分域学：现代通用乐理 / 中国传统音乐，术语不串味</small>
      </div>
      <div class="mw-track-switch">
        <button
          v-for="t in TRACKS" :key="t" :class="{ active: track === t }" @click="switchTrack(t)"
        >{{ trackLabel(t) }}</button>
      </div>
      <div v-if="loading" class="mw-loading">加载中…</div>
      <div v-else-if="error" class="mw-error">{{ error }}</div>
      <div v-else class="mw-stage-list">
        <section v-for="stage in stages" :key="stage.level" class="mw-stage">
          <!-- ★ 手风琴头（与文化/周易同款交互）：点开才出该阶段课程，页面不再被
               全部阶段×全部课程撑长；移动端默认全收起，桌面默认第一阶展开 -->
          <button
            type="button"
            class="mw-stage-head"
            :aria-expanded="openStage === stage.level"
            @click="toggleStage(stage.level)"
          >
            <h3>{{ stage.level }}<i class="mw-stage-count">{{ stage.lessons.length }}</i></h3>
            <span class="mw-caret" :class="{ open: openStage === stage.level }">▸</span>
          </button>
          <div v-if="openStage === stage.level" class="mw-stage-lessons">
            <button
              v-for="l in stage.lessons" :key="l.id" class="mw-lesson"
              :class="{ done: completed[l.id] }" @click="openLesson(l.id)"
            >
              <b>{{ l.title }}</b>
              <small>{{ l.goal }} · 约 {{ l.minutes }} 分钟</small>
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- ── 沉浸台：谱面工作台（fixed 全屏） ───────────────────────────────────── -->
    <div v-if="focusing && lesson" ref="overlayRef" class="mw-focus">
      <div class="mw-topbar">
        <button class="mw-back" @click="closeFocus">← 返回路线</button>
        <b class="mw-topbar-title">{{ lesson.title }}</b>
        <small class="mw-topbar-meta">{{ trackLabel(track) }} · 步骤 {{ stepIdx + 1 }}/{{ lesson.steps.length }}</small>
        <button class="mw-note" @click="sendScoreToNote">记到笔记</button>
        <button class="mw-exit" aria-label="退出" @click="closeFocus">✕</button>
      </div>

      <div class="mw-step-rail">
        <button
          v-for="(s, i) in lesson.steps" :key="s" :class="{ active: i === stepIdx, done: i < stepIdx }"
          @click="stepIdx = i"
        >
          <i>{{ i < stepIdx ? '✓' : i + 1 }}</i>
          <b>{{ STEP_LABELS[s] }}</b>
        </button>
      </div>

      <div class="mw-notation-tabs">
        <button
          v-for="t in notationTabs" :key="t.mode" :data-mode="t.mode"
          :class="{ active: notation === t.mode }" @click="notation = t.mode"
        >{{ t.label }}</button>
      </div>

      <div ref="surfaceRef" class="mw-surface">
        <!-- 五线谱模式：SVG 自绘（谱号 / 拍号 / key 文本 / 升降号 / 附点 / 符尾 / 休止） -->
        <svg
          v-if="notation === 'staff' && staff" class="mw-staff"
          :viewBox="`0 0 ${staff.width} ${staff.height}`" :width="Math.min(staff.width, 760)"
          :height="staff.height" role="img" :aria-label="score?.title || '谱面'"
        >
          <line
            v-for="(y, i) in staff.lineY" :key="'line' + i"
            :x1="20" :x2="staff.width - 20" :y1="y" :y2="y" class="mw-staff-line"
          />
          <text :x="staff.headX.clef" :y="staff.lineY[2] + 6" class="mw-staff-clef">𝄞</text>
          <text :x="staff.headX.meter" :y="staff.lineY[0] - 6" class="mw-staff-meter">{{ transposed?.meter?.[0] ?? 4 }}</text>
          <text :x="staff.headX.meter" :y="staff.lineY[4] + 14" class="mw-staff-meter">{{ transposed?.meter?.[1] ?? 4 }}</text>
          <text :x="staff.headX.key" :y="staff.lineY[2] - 14" class="mw-staff-key">{{ transposed?.key === 'C 宫' ? '1=C（宫）' : `1=${transposed?.key ?? 'C'}` }}</text>
          <g
            v-for="g in staff.notes" :key="'n' + g.index"
            class="mw-staff-note" :class="{ active: highlightIdx === g.index }"
            :data-index="g.index" @click="onNoteClick(g.index)"
          >
            <text v-if="g.rest" :x="g.x - 6" :y="g.y + 5" class="mw-staff-rest">休</text>
            <template v-else>
              <text v-if="g.accidental" :x="g.x - 16" :y="g.y + 5" class="mw-staff-acc">{{ g.accidental }}</text>
              <line v-if="g.stem !== 'none'" :x1="g.x + (g.stem === 'up' ? 7 : -7)" :y1="g.y" :x2="g.x + (g.stem === 'up' ? 7 : -7)" :y2="g.stemEndY" class="mw-staff-stem" />
              <line v-if="g.flag" :x1="g.x + (g.stem === 'up' ? 7 : -7)" :y1="g.stemEndY" :x2="g.x + (g.stem === 'up' ? 15 : -15)" :y2="g.stemEndY + 6" class="mw-staff-stem" />
              <ellipse :cx="g.x" :cy="g.y" rx="7.5" ry="5.2" :class="g.hollow ? 'mw-note-hollow' : 'mw-note-filled'" />
              <circle v-if="g.dotted" :cx="g.x + 12" :cy="g.y - 5" r="1.8" class="mw-note-filled" />
              <line
                v-for="(ly, j) in g.ledgerY" :key="'led' + g.index + '-' + j"
                :x1="g.x - 12" :x2="g.x + 12" :y1="ly" :y2="ly" class="mw-staff-ledger"
              />
            </template>
            <text v-if="g.lyric" :x="g.x" :y="g.y + 30" class="mw-staff-lyric">{{ g.lyric }}</text>
          </g>
        </svg>

        <!-- 大字卡模式：简谱 / 音名唱名 / 工尺谱 / 宫商角徵羽 -->
        <div v-else class="mw-label-row">
          <button
            v-for="l in labelList" :key="l.index"
            class="mw-label-card" :class="{ active: highlightIdx === l.index }"
            :data-index="l.index" @click="onLabelClick(l.index)"
          >
            {{ l.label }}<small v-if="l.sub">{{ l.sub }}</small>
          </button>
        </div>

        <div class="mw-toolbar">
          <label class="mw-mode-label">
            {{ track === 'western' ? '调性' : '调式' }}
            <select v-model="modeSel" class="mw-mode-select">
              <option v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </label>
          <button class="mw-score-play" :class="{ playing }" @click="togglePlay">{{ playing ? '停止' : '试听整段' }}</button>
        </div>

        <!-- 听 / 认 / 奏 步都见谱面；写 / 查 步内容如下 -->
        <div v-if="currentStep === 'listen'" class="mw-step-tip">
          <p>{{ lesson.goal }}</p>
          <p>点任意音符可以单独听它的音高。</p>
        </div>

        <div v-else-if="currentStep === 'recognize'" class="mw-recognize">
          <div class="mw-scale-table">
            <template v-if="track === 'traditional'">
              <div class="mw-scale-row"><span>五声</span><b v-for="p in PENTA_ORDER" :key="p">{{ PENTA_VIEW[p].w }}</b></div>
              <div class="mw-scale-row"><span>简谱</span><b v-for="p in PENTA_ORDER" :key="'n'+p">{{ PENTA_VIEW[p].n }}</b></div>
              <div class="mw-scale-row"><span>工尺</span><b v-for="p in PENTA_ORDER" :key="'g'+p">{{ PENTA_VIEW[p].g }}</b></div>
              <div class="mw-scale-row"><span>音名</span><b v-for="p in PENTA_ORDER" :key="'e'+p">{{ PENTA_VIEW[p].e }}</b></div>
            </template>
            <template v-else>
              <div class="mw-scale-row"><span>音名</span><b v-for="s in STEP_ORDER" :key="s">{{ s }}</b></div>
              <div class="mw-scale-row"><span>唱名</span><b v-for="(s, i) in STEP_ORDER" :key="'f'+s">{{ SOLFA[i] }}</b></div>
            </template>
          </div>
          <div class="mw-blocks">
            <span class="mw-octave-toggle">
              <button :class="{ active: blockOctave === 4 }" @click="blockOctave = 4">低八度</button>
              <button :class="{ active: blockOctave === 5 }" @click="blockOctave = 5">高八度</button>
            </span>
            <button
              v-for="(name, r) in gridRows" :key="'blk' + name" class="mw-block" :data-row="r"
              @click="onBlockClick(r)"
            >
              {{ name }}<small>{{ track === 'western' ? SOLFA[r] : PENTA_VIEW[PENTA_ORDER[r]].n }}</small>
            </button>
          </div>
        </div>

        <div v-else-if="currentStep === 'write'" class="mw-write">
          <!-- 依谱写词：字格输入（一字一音） -->
          <div v-if="isLyricLesson" class="mw-lyric-inputs">
            <label v-for="(val, i) in lyricVals" :key="i" class="mw-lyric-cell">
              <input v-model="lyricVals[i]" maxlength="1" :aria-label="`第 ${i + 1} 个字`" :placeholder="lesson.lyricTemplate?.[i] || ''" />
            </label>
            <small>每个音对应一个字；平声字配长音、仄声字配短音更顺口（只提示不判分）。</small>
          </div>
          <!-- 积木编曲：格子（行数按方向 7 / 5） -->
          <div v-else class="mw-grid-wrap">
            <div class="mw-grid">
              <div v-for="(row, r) in grid" :key="'gr' + r" class="mw-grid-row">
                <span class="mw-grid-rowname">{{ rowName(r) }}</span>
                <button
                  v-for="c in GRID_COLS" :key="c"
                  class="mw-grid-cell" :class="{ active: gridCellActive(r, c - 1) }"
                  :data-row="r" :data-col="c - 1"
                  :aria-label="`第 ${c} 列 ${rowName(r)}`"
                  @click="toggleGridCell(r, c - 1)"
                />
              </div>
            </div>
            <div class="mw-grid-meta">
              <small>4 小节 × 每小节 4 拍：点格子落音，每列取最靠下的已点行发声。</small>
              <span class="mw-grid-actions">
                <button class="mw-grid-play" @click="playGrid">试听编曲</button>
                <button class="mw-grid-play" data-action="open-studio" @click="openInStudio">在编曲台打开</button>
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="currentStep === 'play'" class="mw-play">
          <p class="mw-step-tip-inline">跟着音头高亮看谱试听；编曲课在下方格子里落音。</p>
          <div v-if="showGridInline && !isLyricLesson" class="mw-grid-wrap">
            <div class="mw-grid">
              <div v-for="(row, r) in grid" :key="'pgr' + r" class="mw-grid-row">
                <span class="mw-grid-rowname">{{ rowName(r) }}</span>
                <button
                  v-for="c in GRID_COLS" :key="c"
                  class="mw-grid-cell" :class="{ active: gridCellActive(r, c - 1) }"
                  :data-row="r" :data-col="c - 1"
                  @click="toggleGridCell(r, c - 1)"
                />
              </div>
            </div>
            <div class="mw-grid-meta">
              <small>每列取最靠下的已点行发声。</small>
              <button class="mw-grid-play" @click="playGrid">试听编曲</button>
            </div>
          </div>
          <div v-else-if="isLyricLesson" class="mw-lyric-preview">
            <span v-for="(n, i) in transposedNotes.filter((x) => !x.rest)" :key="i" class="mw-lyric-chip" :class="{ active: highlightIdx === i }">
              <b>{{ notationLabelOf(n) }}</b>
              <small>{{ lyricVals[i] || '　' }}</small>
            </span>
          </div>
        </div>

        <div v-else-if="currentStep === 'check' && quickCheck" class="mw-check">
          <p class="mw-check-question">{{ quickCheck.question }}</p>
          <div class="mw-check-options">
            <button
              v-for="opt in quickCheck.options" :key="opt"
              class="mw-check-option" :class="{ picked: picked === opt, correct: picked === opt && opt === quickCheck.answer, wrong: picked === opt && opt !== quickCheck.answer }"
              @click="pickOption(opt)"
            >{{ opt }}</button>
          </div>
          <div v-if="picked" class="mw-check-result">
            <b>{{ picked === quickCheck.answer ? '答对了' : '再想想' }}</b>
            <p>{{ quickCheck.explanation }}</p>
          </div>
        </div>
      </div>

      <div class="mw-footer">
        <button class="mw-step-prev" :disabled="stepIdx === 0" @click="moveStep(-1)">上一步</button>
        <button class="mw-step-next" @click="moveStep(1)">{{ isLastStep ? '完成课时' : '下一步' }}</button>
      </div>
    </div>

    <NoteQuickCreateDialog
      v-model:visible="noteDialogVisible"
      :title="lesson?.title || '曲谱笔记'"
      :content="noteContent"
      category-name="音乐"
    />
  </div>
</template>

<style scoped>
/* 沉浸层私有变量（对齐 --path-focus-* 做法，不改全局 token） */
.music-workbench {
  --score-bg: #081017;
  --score-panel: #101a23;
  --score-line: rgba(172, 211, 214, .18);
  --score-ink: #eef7f5;
  --score-muted: #a4b8b8;
  --score-accent: #46c8b8;
  --score-paper: #ffffff;
  --score-paper-ink: #17212b;
}

/* ── 总览 ─────────────────────────────────────────────────────────────────── */
.mw-overview { display: flex; flex-direction: column; gap: 14px; color: var(--score-ink); }
.mw-overview-head b { font-size: 14px; }
.mw-overview-head small { display: block; color: var(--score-muted); font-size: 11px; }
.mw-loading, .mw-error { color: var(--score-muted); font-size: 12px; }
.mw-track-switch { display: inline-flex; gap: 0; padding: 2px; border: 1px solid var(--score-line); border-radius: 999px; width: fit-content; }
.mw-track-switch button {
  min-height: 0; padding: 6px 16px; border: 0; border-radius: 999px;
  background: transparent; color: var(--score-muted); font-size: 12px; cursor: pointer;
}
.mw-track-switch button.active { background: var(--score-accent); color: #06231f; font-weight: 600; }
.mw-stage-list { display: flex; flex-direction: column; gap: 8px; }
/* ★ 手风琴头 + 折叠面板（2026-11-16 页面浓缩） */
.mw-stage-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 10px 12px;
  border: 1px solid var(--score-line); border-radius: 10px;
  background: var(--score-panel); cursor: pointer; text-align: left;
}
.mw-stage-head h3 { margin: 0; font-size: 12px; color: var(--score-accent); display: inline-flex; align-items: center; gap: 6px; }
.mw-stage-count {
  font-style: normal; min-width: 18px; height: 16px; padding: 0 5px; border-radius: 999px;
  background: color-mix(in srgb, var(--score-accent) 16%, transparent); color: var(--score-accent);
  font-size: 10px; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center;
}
.mw-caret { color: var(--score-muted); transition: transform .15s ease; }
.mw-caret.open { transform: rotate(90deg); }
.mw-stage-lessons { padding: 8px 2px 0; }
.mw-lesson {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; margin: 0 0 6px; padding: 8px 10px; text-align: left;
  border: 1px solid var(--score-line); border-radius: 10px; background: var(--score-panel); cursor: pointer;
}
.mw-lesson b { color: var(--score-ink); font-size: 12px; }
.mw-lesson small { color: var(--score-muted); font-size: 10px; line-height: 1.5; }
.mw-lesson.done { border-color: color-mix(in srgb, var(--score-accent) 42%, transparent); }
.mw-lesson.done b::after { content: ' ✓'; color: var(--score-accent); }

/* ── 沉浸台：fixed 全屏（骨架契约同 EnglishPathWorkbench） ────────────────────── */
.mw-focus {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  color: var(--score-ink);
  background: linear-gradient(135deg, var(--score-bg), #0a1620 58%, #071018);
  overflow: hidden;
}
.mw-topbar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-bottom: 1px solid var(--score-line);
  background: color-mix(in srgb, var(--score-bg) 92%, transparent);
}
.mw-topbar button {
  min-height: 0; padding: 5px 10px; border: 1px solid var(--score-line);
  border-radius: 8px; background: var(--score-panel); color: var(--score-muted); font-size: 11px; cursor: pointer;
}
.mw-topbar button:hover { color: var(--score-ink); }
.mw-topbar .mw-note { color: var(--score-accent); border-color: color-mix(in srgb, var(--score-accent) 42%, transparent); }
.mw-topbar-title { flex: 1; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.mw-topbar-meta { color: var(--score-muted); font-size: 10px; white-space: nowrap; }
.mw-step-rail { display: flex; gap: 6px; padding: 8px 14px 0; }
.mw-step-rail button {
  display: flex; align-items: center; gap: 6px; min-height: 0;
  padding: 5px 10px; border: 1px solid var(--score-line); border-radius: 999px;
  background: transparent; color: var(--score-muted); font-size: 11px; cursor: pointer;
}
.mw-step-rail button.active { border-color: color-mix(in srgb, var(--score-accent) 42%, transparent); color: var(--score-accent); background: color-mix(in srgb, var(--score-accent) 11%, transparent); }
.mw-step-rail button.done { color: var(--score-accent); }
.mw-step-rail i { display: inline-grid; place-items: center; width: 16px; height: 16px; border: 1px solid currentcolor; border-radius: 50%; font-size: 9px; font-style: normal; }

/* 记法切换条（按方向派生，当前高亮；切换只换渲染器） */
.mw-notation-tabs { display: flex; gap: 6px; padding: 8px 14px; }
.mw-notation-tabs button {
  min-height: 0; padding: 4px 12px; border: 1px solid var(--score-line);
  border-radius: 999px; background: transparent; color: var(--score-muted); font-size: 11px; cursor: pointer;
}
.mw-notation-tabs button.active { border-color: var(--score-accent); color: var(--score-accent); background: color-mix(in srgb, var(--score-accent) 14%, transparent); }

/* 白色谱面阅读面 */
.mw-surface {
  overflow: auto;
  margin: 0 14px; padding: 14px; border-radius: 12px;
  background: var(--score-paper); color: var(--score-paper-ink);
}
.mw-staff { max-width: 100%; display: block; margin: 0 auto; }
.mw-staff-line { stroke: #2a3a48; stroke-width: 1.2; }
.mw-staff-ledger { stroke: #2a3a48; stroke-width: 1.2; }
.mw-staff-stem { stroke: #17212b; stroke-width: 1.6; }
.mw-note-filled { fill: #17212b; }
.mw-note-hollow { fill: none; stroke: #17212b; stroke-width: 1.6; }
.mw-staff-note { cursor: pointer; }
.mw-staff-note.active ellipse { fill: var(--score-accent); stroke: var(--score-accent); }
.mw-staff-note.active .mw-staff-stem { stroke: var(--score-accent); }
.mw-staff-clef { fill: #2a3a48; font-size: 46px; }
.mw-staff-meter { fill: #17212b; font-size: 16px; font-weight: 700; text-anchor: middle; }
.mw-staff-key { fill: #5a6a78; font-size: 12px; }
.mw-staff-acc { fill: #17212b; font-size: 14px; }
.mw-staff-rest { fill: #5a6a78; font-size: 12px; }
.mw-staff-lyric { fill: #5a6a78; font-size: 12px; text-anchor: middle; }
.mw-label-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 6px 0; }
.mw-label-card {
  display: inline-flex; flex-direction: column; align-items: center;
  min-width: 44px; min-height: 0; padding: 10px 8px;
  border: 1px solid #d5dde4; border-radius: 10px; background: #f6f9fb;
  color: #17212b; font-size: 22px; font-weight: 700; cursor: pointer;
}
.mw-label-card small { font-size: 10px; font-weight: 400; color: #5a6a78; }
.mw-label-card.active { border-color: var(--score-accent); color: var(--score-accent); background: color-mix(in srgb, var(--score-accent) 14%, #ffffff); }
.mw-toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 0 4px; }
.mw-mode-label { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #5a6a78; }
.mw-mode-select { min-height: 0; padding: 4px 8px; border: 1px solid #d5dde4; border-radius: 8px; background: #fff; font-size: 12px; }
.mw-toolbar button {
  min-height: 0; padding: 6px 14px; border: 1px solid #2aa79a;
  border-radius: 999px; background: #eafaf7; color: #178f82; font-size: 12px; cursor: pointer;
}
.mw-toolbar button.playing { background: #178f82; color: #fff; }
.mw-step-tip, .mw-step-tip-inline { color: #5a6a78; font-size: 12px; line-height: 1.7; }

/* 认步：四记法对照条 + 音名块 */
.mw-recognize { display: flex; flex-direction: column; gap: 12px; padding-top: 10px; }
.mw-scale-row { display: flex; align-items: center; gap: 8px; }
.mw-scale-row span { flex: 0 0 42px; color: #5a6a78; font-size: 11px; }
.mw-scale-row b { flex: 1; padding: 6px 0; border: 1px solid #e2e8ee; border-radius: 8px; background: #f6f9fb; font-size: 15px; text-align: center; }
.mw-blocks { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mw-octave-toggle { display: inline-flex; gap: 4px; padding: 2px; border: 1px solid #d5dde4; border-radius: 999px; }
.mw-octave-toggle button { min-height: 0; padding: 3px 10px; border: 0; border-radius: 999px; background: transparent; color: #5a6a78; font-size: 11px; cursor: pointer; }
.mw-octave-toggle button.active { background: #eafaf7; color: #178f82; }
.mw-block { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; min-height: 0; padding: 10px 14px; border: 1px solid #d5dde4; border-radius: 10px; background: #f6f9fb; color: #17212b; font-size: 16px; font-weight: 700; cursor: pointer; }
.mw-block small { font-size: 10px; font-weight: 400; color: #5a6a78; }
.mw-block:hover { border-color: #2aa79a; }

/* 写步：编曲格子 / 字格 */
.mw-write, .mw-play { padding-top: 10px; }
.mw-grid { display: flex; flex-direction: column; gap: 4px; }
.mw-grid-row { display: flex; align-items: center; gap: 4px; }
.mw-grid-rowname { flex: 0 0 26px; color: #5a6a78; font-size: 11px; }
.mw-grid-cell { flex: 1; min-height: 0; height: 26px; padding: 0; border: 1px solid #d5dde4; border-radius: 6px; background: #f6f9fb; cursor: pointer; }
.mw-grid-cell:hover { border-color: #2aa79a; }
.mw-grid-cell.active { background: #178f82; border-color: #178f82; }
.mw-grid-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 8px; }
.mw-grid-meta small { color: #5a6a78; font-size: 10px; }
.mw-grid-actions { display: inline-flex; gap: 6px; }
.mw-grid-play { min-height: 0; padding: 5px 12px; border: 1px solid #2aa79a; border-radius: 999px; background: #eafaf7; color: #178f82; font-size: 11px; cursor: pointer; }
.mw-lyric-inputs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mw-lyric-inputs small { flex-basis: 100%; color: #5a6a78; font-size: 10px; }
.mw-lyric-cell input { width: 40px; height: 40px; padding: 0; border: 1px solid #d5dde4; border-radius: 8px; background: #fff; font-size: 18px; text-align: center; }
.mw-lyric-preview { display: flex; flex-wrap: wrap; gap: 6px; }
.mw-lyric-chip { display: inline-flex; flex-direction: column; align-items: center; min-width: 34px; padding: 5px 6px; border: 1px solid #e2e8ee; border-radius: 8px; }
.mw-lyric-chip b { font-size: 13px; }
.mw-lyric-chip small { color: #5a6a78; font-size: 12px; }
.mw-lyric-chip.active { border-color: var(--score-accent); color: #178f82; }

/* 查步：quickCheck（前端判卷） */
.mw-check { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
.mw-check-question { margin: 0; font-size: 14px; font-weight: 600; }
.mw-check-options { display: flex; flex-direction: column; gap: 6px; }
.mw-check-option { min-height: 0; padding: 8px 12px; border: 1px solid #d5dde4; border-radius: 8px; background: #f6f9fb; color: #17212b; font-size: 12px; text-align: left; cursor: pointer; }
.mw-check-option.correct { border-color: #178f82; color: #178f82; background: #eafaf7; }
.mw-check-option.wrong { border-color: #d06a5a; color: #b34a3c; background: #fdf0ee; }
.mw-check-result b { color: #178f82; font-size: 12px; }
.mw-check-result p { margin: 4px 0 0; color: #5a6a78; font-size: 12px; line-height: 1.7; }

/* 底部前进按钮（移动端常驻契约） */
.mw-footer { display: flex; justify-content: space-between; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--score-line); }
.mw-footer button {
  min-height: 0; padding: 8px 18px; border: 1px solid var(--score-line);
  border-radius: 999px; background: var(--score-panel); color: var(--score-muted); font-size: 12px; cursor: pointer;
}
.mw-footer button.primary, .mw-footer button.mw-step-next { border-color: var(--score-accent); background: color-mix(in srgb, var(--score-accent) 16%, var(--score-panel)); color: var(--score-accent); }
.mw-footer button:disabled { opacity: .45; cursor: default; }
</style>
