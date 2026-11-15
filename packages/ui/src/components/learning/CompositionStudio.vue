<script setup lang="ts">
// 编曲台（docs/音乐双方向重构方案-2026-11-15.md §3.2-3.5）：三种编曲模式 + 真播放 + 作品沉淀。
// ① 人工手动：格子编辑（行按方向 7 音 / 5 声，每列一拍）；② 规则自动：POST /compose/auto（离线可复现）；
// ③ AI 辅助：POST /compose/assist（LLM 只产 MusicSpec，分域硬闸校验，非法回落规则生成并如实标注）。
// 播放：Web Audio 即时试听 + composeMusic 真音频（AudioPlayer 内联）。曲谱/说明可一键入笔记（§3.5）。
// 总览层一级 Tab（创作舞台，不是知识点列表）；作品入库 learning_composition（用户隔离）。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../../api/client';
import { useScoreAudio } from '../../composables/useScoreAudio';
import AudioPlayer from '../media/AudioPlayer.vue';
import NoteQuickCreateDialog from '../notes/NoteQuickCreateDialog.vue';
import {
  PENTA_ORDER, PENTA_VIEW, STEP_ORDER, modeLabel, noteToTrad, staffLayout, trackLabel,
  type MusicTrack, type NoteEvent, type Score, type ScoreMode,
} from '../../utils/learning/score-render';

const props = defineProps<{ seedScore?: Score | null }>();
const { playNote, playSequence, stopAll } = useScoreAudio();

const TRACKS: MusicTrack[] = ['western', 'traditional'];
const SOLFA = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
const GRID_COLS = 32; // 8 小节 × 4 拍
const PLAY_BPM = 84;
const WESTERN_MODES = [
  { label: 'C 大调', value: 'C:major', mode: { kind: 'major', tonic: 'C' } as ScoreMode },
  { label: 'G 大调', value: 'G:major', mode: { kind: 'major', tonic: 'G' } as ScoreMode },
  { label: 'F 大调', value: 'F:major', mode: { kind: 'major', tonic: 'F' } as ScoreMode },
  { label: 'A 小调', value: 'A:minor', mode: { kind: 'minor', tonic: 'A' } as ScoreMode },
];
const TRAD_MODES = PENTA_ORDER.map((t) => ({
  label: `${PENTA_VIEW[t].w}调式`, value: `${t}:pentatonic`, mode: { kind: 'pentatonic', tonic: t } as ScoreMode,
}));

// ── 状态 ──────────────────────────────────────────────────────────────────────
const track = ref<MusicTrack>('western');
const loading = ref(true);
const error = ref('');
const items = ref<Array<{ id: string; track: string; title: string; origin: string; audioUrl?: string; score: Score; spec?: Record<string, unknown> }>>([]);
const currentId = ref('');
const title = ref('未命名小曲');
const currentScore = ref<Score | null>(null);
const phase = ref<'score' | 'grid'>('grid'); // grid = 格子是真相源；score = 自动/AI 产物先展示，载入格子后才可手改
const modeSel = ref('C:major');
const grid = ref<boolean[][]>([]);
const aiPrompt = ref('');
const busy = ref('');
const fallbackNote = ref('');
const audioUrl = ref('');
const noteDialogVisible = ref(false);
const noteContent = ref('');
const surfaceRef = ref<HTMLElement | null>(null);
const playing = ref(false);
let endTimer: ReturnType<typeof setTimeout> | null = null;

// ── 派生 ──────────────────────────────────────────────────────────────────────
const modeOptions = computed(() => (track.value === 'western' ? WESTERN_MODES : TRAD_MODES));
const selectedMode = computed<ScoreMode>(() => {
  const [tonic, kind] = modeSel.value.split(':');
  if (track.value === 'traditional') return { kind: 'pentatonic', tonic: (tonic as 'gong') };
  return { kind: kind === 'minor' ? 'minor' : 'major', tonic: (tonic as 'C') };
});
const gridRows = computed(() => (track.value === 'western' ? STEP_ORDER : PENTA_ORDER));
const rowName = (row: number): string => (track.value === 'western' ? STEP_ORDER[row] : PENTA_VIEW[PENTA_ORDER[row]].w);
const rowNote = (row: number): NoteEvent => (track.value === 'western'
  ? { step: STEP_ORDER[row], octave: 4, beats: 1 }
  : { step: PENTA_VIEW[PENTA_ORDER[row]].e as NoteEvent['step'], octave: 4, beats: 1 });
/** 谱面 = 格子的实时投影（每列一拍）；phase='score' 时直接显示产物 notes */
const displayNotes = computed<NoteEvent[]>(() => {
  if (phase.value === 'score') return currentScore.value?.notes ?? [];
  const out: NoteEvent[] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = gridRows.value.length - 1; row >= 0; row--) {
      if (grid.value[row]?.[col]) { out.push(rowNote(row)); break; }
    }
  }
  return out;
});
const staff = computed(() => (displayNotes.value.length ? staffLayout(displayNotes.value, { key: currentScore.value?.key, meter: currentScore.value?.meter }) : null));
const gridCellActive = (row: number, col: number): boolean => !!grid.value[row]?.[col];

// ── 数据 ──────────────────────────────────────────────────────────────────────
function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const r = unwrap<Array<{ id: string; track: string; title: string; origin: string; audioUrl?: string; score: Score; spec?: Record<string, unknown> }>>(
      await api.get(`/learning/music/compositions?track=${track.value}`),
    );
    items.value = Array.isArray(r) ? r : [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function switchTrack(t: MusicTrack) {
  if (track.value === t) return;
  stopPlayback();
  track.value = t;
  modeSel.value = t === 'western' ? 'C:major' : 'gong:pentatonic';
  resetEditor();
  void loadList();
}

/** 课程「写/奏」步送谱进来（方案 §3.4：写/奏步 ↔ 编曲台双向） */
watch(() => props.seedScore, (seed) => {
  if (!seed) return;
  stopPlayback();
  track.value = seed.track;
  modeSel.value = seed.mode.kind === 'pentatonic' ? `${seed.mode.tonic}:pentatonic` : `${seed.mode.tonic}:${seed.mode.kind}`;
  currentId.value = '';
  title.value = seed.title || '课程小曲';
  currentScore.value = seed;
  audioUrl.value = '';
  fallbackNote.value = '';
  phase.value = 'grid';
  grid.value = notesToGrid(seed.notes);
}, { immediate: true });

function resetEditor() {
  currentId.value = '';
  title.value = '未命名小曲';
  currentScore.value = null;
  audioUrl.value = '';
  fallbackNote.value = '';
  phase.value = 'grid';
  grid.value = gridRows.value.map(() => Array<boolean>(GRID_COLS).fill(false));
}

function openItem(item: typeof items.value[number]) {
  stopPlayback();
  currentId.value = item.id;
  title.value = item.title;
  currentScore.value = item.score;
  audioUrl.value = item.audioUrl ?? '';
  fallbackNote.value = '';
  modeSel.value = item.score.mode.kind === 'pentatonic' ? `${item.score.mode.tonic}:pentatonic` : `${item.score.mode.tonic}:${item.score.mode.kind}`;
  grid.value = notesToGrid(item.score.notes);
  phase.value = 'grid';
}

/** 曲谱 notes → 格子（每音放起始格；beats>1 的长音占多格同音） */
function notesToGrid(notes: NoteEvent[]): boolean[][] {
  const g = gridRows.value.map(() => Array<boolean>(GRID_COLS).fill(false));
  let col = 0;
  for (const n of notes) {
    if (col >= GRID_COLS) break;
    const rowIndex = track.value === 'western' ? STEP_ORDER.indexOf(n.step) : PENTA_ORDER.indexOf(noteToTrad(n) ?? 'gong');
    if ((track.value === 'western' ? STEP_ORDER.includes(n.step) : noteToTrad(n) !== null) && rowIndex >= 0) {
      const span = Math.max(1, Math.min(GRID_COLS - col, Math.round(n.beats)));
      for (let k = 0; k < span; k++) g[rowIndex][col + k] = true;
    }
    col += Math.max(1, Math.round(n.beats));
  }
  return g;
}

// ── 格子编辑 ──────────────────────────────────────────────────────────────────
function toggleGridCell(row: number, col: number) {
  const rowArr = grid.value[row];
  if (!rowArr) return;
  rowArr[col] = !rowArr[col];
  if (rowArr[col]) playNote(rowNote(row), 0.5);
}

// ── 三种编曲模式 ──────────────────────────────────────────────────────────────
async function composeAuto() {
  busy.value = 'auto';
  error.value = '';
  try {
    const r = unwrap<{ score: Score; spec: Record<string, unknown>; origin: string }>(
      await api.post('/learning/music/compose/auto', {
        track: track.value, mode: selectedMode.value, bars: 8, seed: Math.floor(Math.random() * 100000) + 1,
      }),
    );
    if (r?.score) {
      currentScore.value = r.score;
      title.value = r.score.title || title.value;
      fallbackNote.value = '';
      phase.value = 'score';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally { busy.value = ''; }
}

async function composeAi() {
  busy.value = 'ai';
  error.value = '';
  try {
    const r = unwrap<{ score: Score; spec: Record<string, unknown>; origin: string; fallbackReason?: string }>(
      await api.post('/learning/music/compose/assist', {
        track: track.value, mode: selectedMode.value, prompt: aiPrompt.value.trim(), bars: 8,
      }),
    );
    if (r?.score) {
      currentScore.value = r.score;
      title.value = r.score.title || title.value;
      fallbackNote.value = r.fallbackReason ? `AI 输出未过校验（${r.fallbackReason}），已按规则自动生成` : '';
      phase.value = 'score';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally { busy.value = ''; }
}

/** 载入格子：把当前谱面（自动/AI 产物）摊平成格子，之后可手改（谱面变为格子实时投影） */
function loadIntoGrid() {
  if (!currentScore.value?.notes.length) return;
  grid.value = notesToGrid(currentScore.value.notes);
  phase.value = 'grid';
}

// ── 播放 ──────────────────────────────────────────────────────────────────────
function stopPlayback() {
  stopAll();
  playing.value = false;
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
}
function togglePlay() {
  if (playing.value) { stopPlayback(); return; }
  const notes = displayNotes.value;
  if (!notes.length) return;
  stopAll();
  playing.value = true;
  const handle = playSequence(notes, PLAY_BPM);
  const totalSec = notes.reduce((s, n) => s + n.beats * (60 / PLAY_BPM), 0);
  endTimer = setTimeout(() => { handle.stop(); playing.value = false; }, Math.round(totalSec * 1000) + 150);
}

/** 渲染真音频：composeMusic 本地合成 → AudioPlayer 内联播放（方案 §3.3 第二档） */
async function renderAudio() {
  if (!currentScore.value && !displayNotes.value.length) return;
  busy.value = 'render';
  error.value = '';
  try {
    const payloadScore = currentScore.value ?? gridToScore();
    const r = unwrap<{ url: string; compositionId?: string }>(
      await api.post('/learning/music/compose/render', {
        track: track.value, score: payloadScore,
        compositionId: currentId.value || undefined,
      }),
    );
    if (r?.url) {
      audioUrl.value = r.url;
      if (r.compositionId) currentId.value = r.compositionId;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally { busy.value = ''; }
}

function gridToScore(): Score {
  const [tonic, kind] = modeSel.value.split(':');
  return {
    id: currentId.value || `comp_${Date.now().toString(36)}`,
    title: title.value,
    track: track.value,
    clef: 'treble',
    key: track.value === 'traditional' ? 'C 宫' : tonic,
    meter: [4, 4],
    mode: selectedMode.value,
    notes: displayNotes.value,
  };
}

// ── 保存 / 记到笔记 ────────────────────────────────────────────────────────────
async function saveComposition() {
  busy.value = 'save';
  error.value = '';
  try {
    const score = gridToScore();
    if (currentId.value) {
      const r = unwrap<{ id: string }>(await api.patch(`/learning/music/compositions/${encodeURIComponent(currentId.value)}`, {
        title: title.value, score, origin: 'manual',
      }));
      if (!r) { error.value = '作品不存在'; return; }
    } else {
      const r = unwrap<{ id: string }>(await api.post('/learning/music/compositions', {
        track: track.value, title: title.value, score, origin: 'manual', spec: {},
      }));
      if (r?.id) currentId.value = r.id;
    }
    await loadList();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally { busy.value = ''; }
}

/** 曲谱入笔记（§3.5）：SVG 谱面 → /notes/media → Markdown 片段（用户接着写说明） */
async function sendScoreToNote() {
  try {
    const svg = surfaceRef.value?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const bytes = new TextEncoder().encode(xml);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const r = unwrap<{ url: string }>(await api.post('/notes/media', { name: `${title.value || '曲谱'}.svg`, base64: btoa(binary) }));
    if (!r?.url) return;
    const lines = [`## ${title.value} · ${modeLabel(selectedMode.value)}（${trackLabel(track.value)}）`, `![谱面](${r.url})`];
    if (audioUrl.value) lines.push(`{{audio ${audioUrl.value} 试听整曲}}`);
    noteContent.value = `${lines.join('\n')}\n\n（在这里写你的说明…）`;
    noteDialogVisible.value = true;
  } catch { /* 上传失败静默：不打断创作 */ }
}

onMounted(() => { if (!props.seedScore) resetEditor(); void loadList(); });
onBeforeUnmount(() => { stopPlayback(); });
</script>

<template>
  <div class="cs-studio">
    <!-- 方向 + 作品列表（筛选固定顶部 + 列表独立滚动） -->
    <aside class="cs-side">
      <div class="cs-side-head">
        <b>我的曲子</b>
        <span class="cs-track-switch">
          <button v-for="t in TRACKS" :key="t" :class="{ active: track === t }" @click="switchTrack(t)">{{ trackLabel(t) }}</button>
        </span>
      </div>
      <div v-if="loading" class="cs-muted">加载中…</div>
      <div v-else-if="error" class="cs-error">{{ error }}</div>
      <div v-else class="cs-list">
        <button class="cs-item" :class="{ active: !currentId }" @click="resetEditor">
          <b>＋ 新建小曲</b>
        </button>
        <button
          v-for="it in items" :key="it.id" class="cs-item" :class="{ active: currentId === it.id }"
          @click="openItem(it)"
        >
          <b>{{ it.title }}</b>
          <small>{{ it.origin === 'ai' ? 'AI 辅助' : it.origin === 'auto' ? '自动编曲' : '手动' }}{{ it.audioUrl ? ' · 已渲染' : '' }}</small>
        </button>
        <div v-if="!items.length" class="cs-muted">这个方向还没有作品——先自动编一段试试。</div>
      </div>
    </aside>

    <!-- 编辑区 -->
    <section class="cs-main">
      <div class="cs-toolbar">
        <input v-model="title" class="cs-title" placeholder="曲名" />
        <label class="cs-mode-label">
          {{ track === 'western' ? '调性' : '调式' }}
          <select v-model="modeSel" class="cs-mode-select">
            <option v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </label>
        <button class="cs-btn" :disabled="!!busy" @click="composeAuto">{{ busy === 'auto' ? '生成中…' : '自动编曲' }}</button>
        <button class="cs-btn" :disabled="!!busy || !aiPrompt.trim()" @click="composeAi">{{ busy === 'ai' ? '生成中…' : 'AI 辅助编曲' }}</button>
        <input v-model="aiPrompt" class="cs-ai-input" placeholder="一句话描述，如：8 小节婉转的五声小曲" />
      </div>
      <div v-if="fallbackNote" class="cs-fallback">{{ fallbackNote }}</div>

      <div ref="surfaceRef" class="cs-surface">
        <svg
          v-if="staff" class="cs-staff"
          :viewBox="`0 0 ${staff.width} ${staff.height}`" :width="Math.min(staff.width, 720)" :height="staff.height" role="img" :aria-label="title"
        >
          <line v-for="(y, i) in staff.lineY" :key="'l'+i" :x1="20" :x2="staff.width - 20" :y1="y" :y2="y" class="cs-line" />
          <text :x="staff.headX.clef" :y="staff.lineY[2] + 6" class="cs-clef">𝄞</text>
          <text :x="staff.headX.meter" :y="staff.lineY[0] - 6" class="cs-meter">4</text>
          <text :x="staff.headX.meter" :y="staff.lineY[4] + 14" class="cs-meter">4</text>
          <text :x="staff.headX.key" :y="staff.lineY[2] - 14" class="cs-key">{{ currentScore?.key === 'C 宫' ? '1=C（宫）' : `1=${currentScore?.key ?? 'C'}` }}</text>
          <g v-for="(n, i) in staff.notes" :key="'n'+i">
            <text v-if="n.rest" :x="n.x - 6" :y="n.y + 5" class="cs-rest">休</text>
            <template v-else>
              <text v-if="n.accidental" :x="n.x - 16" :y="n.y + 5" class="cs-acc">{{ n.accidental }}</text>
              <line v-if="n.stem !== 'none'" :x1="n.x + (n.stem === 'up' ? 7 : -7)" :y1="n.y" :x2="n.x + (n.stem === 'up' ? 7 : -7)" :y2="n.stemEndY" class="cs-stem" />
              <line v-if="n.flag" :x1="n.x + (n.stem === 'up' ? 7 : -7)" :y1="n.stemEndY" :x2="n.x + (n.stem === 'up' ? 15 : -15)" :y2="n.stemEndY + 6" class="cs-stem" />
              <ellipse :cx="n.x" :cy="n.y" rx="7.5" ry="5.2" :class="n.hollow ? 'cs-hollow' : 'cs-filled'" />
              <circle v-if="n.dotted" :cx="n.x + 12" :cy="n.y - 5" r="1.8" class="cs-filled" />
              <line v-for="(ly, j) in n.ledgerY" :key="'led'+i+'-'+j" :x1="n.x - 12" :x2="n.x + 12" :y1="ly" :y2="ly" class="cs-line" />
            </template>
          </g>
        </svg>
        <div v-else class="cs-muted">点格子落音，或先「自动编曲」生成一段。</div>

        <!-- 格子（行按方向 7 / 5） -->
        <div class="cs-grid">
          <div v-for="(row, r) in grid" :key="'gr'+r" class="cs-grid-row">
            <span class="cs-rowname">{{ rowName(r) }}</span>
            <button
              v-for="c in GRID_COLS" :key="c"
              class="cs-cell" :class="{ active: gridCellActive(r, c - 1) }"
              :aria-label="`第 ${c} 列 ${rowName(r)}`"
              @click="toggleGridCell(r, c - 1)"
            />
          </div>
        </div>
        <small class="cs-grid-hint">8 小节 × 每小节 4 拍：点格子落音，每列取最靠下的已点行发声。</small>
      </div>

      <div class="cs-ops">
        <button class="cs-btn" :class="{ playing }" @click="togglePlay">{{ playing ? '停止试听' : '即时试听' }}</button>
        <button class="cs-btn" :disabled="!!busy || !displayNotes.length" @click="renderAudio">{{ busy === 'render' ? '渲染中…' : '渲染成音频' }}</button>
        <button class="cs-btn" :disabled="!!busy" @click="saveComposition">{{ busy === 'save' ? '保存中…' : (currentId ? '保存修改' : '保存作品') }}</button>
        <button class="cs-btn" :disabled="phase === 'score' || !currentScore" @click="loadIntoGrid">载入格子编辑</button>
        <button class="cs-btn" :disabled="!displayNotes.length" @click="sendScoreToNote">记到笔记</button>
        <AudioPlayer v-if="audioUrl" :src="audioUrl" :name="title" compact class="cs-audio" />
      </div>
    </section>

    <NoteQuickCreateDialog
      v-model:visible="noteDialogVisible"
      :title="title"
      :content="noteContent"
      category-name="音乐"
    />
  </div>
</template>

<style scoped>
.cs-studio { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 12px; color: var(--color-text, #1f2937); align-items: start; }
.cs-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cs-side-head { display: flex; flex-direction: column; gap: 6px; }
.cs-side-head b { font-size: 13px; }
.cs-track-switch { display: inline-flex; gap: 0; padding: 2px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 999px; width: fit-content; }
.cs-track-switch button { min-height: 0; padding: 4px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--color-muted, #6b7280); font-size: 11px; cursor: pointer; }
.cs-track-switch button.active { background: var(--el-color-primary, #2563eb); color: #fff; }
.cs-list { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow: auto; }
.cs-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 0; width: 100%; padding: 7px 9px; text-align: left; border: 1px solid var(--color-border, #e5e7eb); border-radius: 9px; background: var(--color-surface, #fff); cursor: pointer; }
.cs-item.active { border-color: var(--el-color-primary, #2563eb); }
.cs-item b { font-size: 12px; }
.cs-item small { color: var(--color-muted, #6b7280); font-size: 10px; }
.cs-muted { color: var(--color-muted, #6b7280); font-size: 11px; }
.cs-error { color: #b91c1c; font-size: 11px; }
.cs-fallback { margin: 0 0 6px; padding: 6px 10px; border-radius: 8px; background: #fff7ed; color: #9a3412; font-size: 11px; }
.cs-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cs-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-title { width: 180px; min-height: 0; padding: 6px 10px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; background: transparent; font-size: 12px; }
.cs-mode-label { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-muted, #6b7280); }
.cs-mode-select { min-height: 0; padding: 4px 8px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; background: var(--color-surface, #fff); font-size: 12px; }
.cs-ai-input { flex: 1; min-width: 160px; min-height: 0; padding: 6px 10px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; background: transparent; font-size: 12px; }
.cs-btn { min-height: 0; padding: 6px 12px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 999px; background: var(--color-surface, #fff); color: var(--el-color-primary, #2563eb); font-size: 12px; cursor: pointer; }
.cs-btn:disabled { opacity: .5; cursor: default; }
.cs-btn.playing { background: var(--el-color-primary, #2563eb); color: #fff; border-color: transparent; }
.cs-surface { overflow: auto; padding: 12px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 12px; background: var(--color-surface, #fff); }
.cs-staff { max-width: 100%; display: block; margin: 0 auto; }
.cs-line { stroke: #2a3a48; stroke-width: 1.2; }
.cs-stem { stroke: #17212b; stroke-width: 1.6; }
.cs-filled { fill: #17212b; }
.cs-hollow { fill: none; stroke: #17212b; stroke-width: 1.6; }
.cs-clef { fill: #2a3a48; font-size: 46px; }
.cs-meter { fill: #17212b; font-size: 16px; font-weight: 700; text-anchor: middle; }
.cs-key { fill: #5a6a78; font-size: 12px; }
.cs-acc { fill: #17212b; font-size: 14px; }
.cs-rest { fill: #5a6a78; font-size: 12px; }
.cs-grid { display: flex; flex-direction: column; gap: 3px; padding-top: 10px; }
.cs-grid-row { display: flex; align-items: center; gap: 3px; }
.cs-rowname { flex: 0 0 22px; color: var(--color-muted, #6b7280); font-size: 10px; }
.cs-cell { flex: 1; min-height: 0; height: 20px; padding: 0; border: 1px solid var(--color-border, #e5e7eb); border-radius: 5px; background: #f6f9fb; cursor: pointer; }
.cs-cell:hover { border-color: var(--el-color-primary, #2563eb); }
.cs-cell.active { background: var(--el-color-primary, #2563eb); border-color: var(--el-color-primary, #2563eb); }
.cs-grid-hint { color: var(--color-muted, #6b7280); font-size: 10px; }
.cs-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-audio { flex-basis: 100%; }
</style>
