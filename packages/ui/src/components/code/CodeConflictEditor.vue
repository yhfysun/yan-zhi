<template>
  <el-dialog
    v-model="visible"
    :title="''"
    :fullscreen="true"
    :show-close="false"
    :close-on-click-modal="false"
    class="cce-dialog"
    @opened="onDialogOpened"
  >
    <!-- 工具栏 -->
    <div class="cce-head">
      <span class="cce-title">
        <el-icon :size="14" class="cce-warn"><Warning /></el-icon>
        合并冲突
        <span class="cce-file">{{ fileName }}</span>
      </span>
      <span v-if="blocks.length" class="cce-conflict-count">
        {{ resolvedCount }}/{{ blocks.length }} 已解决
      </span>
      <span class="cce-spacer"></span>
      <button class="cce-btn" :disabled="!blocks.length" @click="navBlock(-1)" title="上一个冲突 (Alt+↑)">
        <el-icon><ArrowUp /></el-icon>
      </button>
      <button class="cce-btn" :disabled="!blocks.length" @click="navBlock(1)" title="下一个冲突 (Alt+↓)">
        <el-icon><ArrowDown /></el-icon>
      </button>
      <span class="cce-divider"></span>
      <button class="cce-btn" :disabled="!blocks.length" @click="syncAllLeft" title="全部同步左栏">
        <el-icon><DArrowLeft /></el-icon>&nbsp;全部采用左
      </button>
      <button class="cce-btn" :disabled="!blocks.length" @click="syncAllRight" title="全部同步右栏">
        全部采用右&nbsp;<el-icon><DArrowRight /></el-icon>
      </button>
      <span class="cce-divider"></span>
      <button class="cce-btn" @click="visible = false">取消</button>
      <button class="cce-btn primary" :disabled="!allDone || resolving" :title="resolveHint" @click="resolve">
        {{ resolving ? '处理中…' : '应用并标记已解决' }}
      </button>
    </div>

    <!-- 状态 -->
    <div v-if="error" class="cce-state err">{{ error }}</div>
    <div v-else-if="loading" class="cce-state">
      <el-icon :size="20" class="spin"><Loading /></el-icon>
      解析冲突中…
    </div>
    <div v-else-if="!blocks.length" class="cce-state">
      未检测到冲突标记。该文件可能已解决过，或不在冲突状态。
    </div>

    <!-- 三栏合并 -->
    <div v-else class="cce-merge">
      <!-- 左栏：本地 (ours) -->
      <div class="cce-col-left">
        <div class="cce-col-head">
          <span class="cce-col-title">本地 (Ours)</span>
          <button class="cce-sync-btn" title="全部同步到中间" @click="syncAllLeft">
            <el-icon><DArrowRight /></el-icon>
          </button>
        </div>
        <div class="cce-col-body" ref="leftScrollRef">
          <template v-for="(seg, i) in segments" :key="i">
            <div v-if="seg.type === 'text'" class="cce-seg-text">
              <div v-for="(ln, li) in seg.lines" :key="li" class="cce-line">{{ ln }}</div>
            </div>
            <div v-else class="cce-seg-conflict" :class="{ done: !!seg.choice }" :data-block="blockIndex(i) - 1">
              <div class="cce-conflict-label">冲突 {{ blockIndex(i) }}/{{ blocks.length }}</div>
              <div
                v-for="(ln, li) in seg.ours" :key="li"
                class="cce-line ours"
                :class="diffClass(i, li, 'ours')"
                @click="syncBlockLeft(i)"
              >
                <span class="cce-line-sync" title="同步此块到中间">→</span>{{ ln }}
              </div>
              <div v-if="!seg.ours.length" class="cce-line dim">（空）</div>
            </div>
          </template>
        </div>
      </div>

      <!-- 中栏：合并结果 -->
      <div class="cce-col-mid">
        <div class="cce-col-head center">
          <span class="cce-col-title">合并结果</span>
        </div>
        <div class="cce-col-body" ref="midScrollRef">
          <template v-for="(seg, i) in segments" :key="i">
            <div v-if="seg.type === 'text'" class="cce-seg-text">
              <div v-for="(ln, li) in seg.lines" :key="li" class="cce-line">{{ ln }}</div>
            </div>
            <div v-else class="cce-seg-conflict" :class="{ done: !!seg.choice }">
              <div class="cce-conflict-toolbar">
                <span class="cce-conflict-label">冲突 {{ blockIndex(i) }}/{{ blocks.length }}</span>
                <span v-if="seg.choice" class="cce-conflict-done">{{ choiceLabel(seg.choice) }}</span>
                <span v-else class="cce-conflict-todo">待选择</span>
                <span class="cce-spacer"></span>
                <button class="cce-mini-btn" :class="{ sel: seg.choice === 'ours' }" @click="syncBlockLeft(i)" title="接受左 (Alt+1)">← 左</button>
                <button class="cce-mini-btn" :class="{ sel: seg.choice === 'theirs' }" @click="syncBlockRight(i)" title="接受右 (Alt+2)">右 →</button>
                <button class="cce-mini-btn" :class="{ sel: seg.choice === 'both' }" @click="chooseBoth(i)" title="保留两者 (Alt+3)">两者</button>
              </div>
              <textarea
                v-model="seg.custom"
                class="cce-result-edit"
                :rows="Math.max(seg.ours.length, seg.theirs.length, 3)"
                spellcheck="false"
                placeholder="编辑合并结果…"
                @input="onSegEdit(i)"
              ></textarea>
            </div>
          </template>
        </div>
      </div>

      <!-- 右栏：传入 (theirs) -->
      <div class="cce-col-right">
        <div class="cce-col-head">
          <button class="cce-sync-btn" title="全部同步到中间" @click="syncAllRight">
            <el-icon><DArrowLeft /></el-icon>
          </button>
          <span class="cce-col-title">传入 (Theirs)</span>
        </div>
        <div class="cce-col-body" ref="rightScrollRef">
          <template v-for="(seg, i) in segments" :key="i">
            <div v-if="seg.type === 'text'" class="cce-seg-text">
              <div v-for="(ln, li) in seg.lines" :key="li" class="cce-line">{{ ln }}</div>
            </div>
            <div v-else class="cce-seg-conflict" :class="{ done: !!seg.choice }">
              <div class="cce-conflict-label">冲突 {{ blockIndex(i) }}/{{ blocks.length }}</div>
              <div
                v-for="(ln, li) in seg.theirs" :key="li"
                class="cce-line theirs"
                :class="diffClass(i, li, 'theirs')"
                @click="syncBlockRight(i)"
              >
                <span class="cce-line-sync" title="同步此块到中间">←</span>{{ ln }}
              </div>
              <div v-if="!seg.theirs.length" class="cce-line dim">（空）</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Warning, ArrowUp, ArrowDown, DArrowLeft, DArrowRight } from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { useGitStore } from '../../stores/git';
import { api } from '../../api/client';

const emit = defineEmits<{ resolved: []; cancel: [] }>();
const code = useCodeStore();
const gitStore = useGitStore();

const visible = ref(true);
watch(visible, (v) => { if (!v) emit('cancel'); });

interface TextSeg { type: 'text'; lines: string[] }
interface ConflictSeg {
  type: 'conflict';
  oursLabel: string;
  theirsLabel: string;
  ours: string[];
  theirs: string[];
  choice: '' | 'ours' | 'theirs' | 'both' | 'custom';
  custom: string;
}
type Seg = TextSeg | ConflictSeg;

const loading = ref(true);
const error = ref('');
const resolving = ref(false);
const repo = ref('');
const relPath = ref('');
const segments = ref<Seg[]>([]);

const leftScrollRef = ref<HTMLElement | null>(null);
const midScrollRef = ref<HTMLElement | null>(null);
const rightScrollRef = ref<HTMLElement | null>(null);

const fileName = computed(() => code.activeFile?.name || '');
const blocks = computed(() => segments.value.filter((s): s is ConflictSeg => s.type === 'conflict'));
const resolvedCount = computed(() => blocks.value.filter((b) => b.choice !== '').length);
const allDone = computed(() => blocks.value.length > 0 && resolvedCount.value === blocks.value.length);
const resolveHint = computed(() =>
  allDone.value ? '写入合并结果并 git add 标记已解决' : `还有 ${blocks.value.length - resolvedCount.value} 处冲突未选择`,
);

function isConflictLine(l: string, ch: '<' | '=' | '>') {
  return l.startsWith(ch.repeat(7));
}

function parse(content: string): Seg[] {
  const lines = content.split('\n');
  const segs: Seg[] = [];
  let text: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (isConflictLine(l, '<')) {
      if (text.length) { segs.push({ type: 'text', lines: text }); text = []; }
      const oursLabel = l.slice(7).trim();
      i++;
      const ours: string[] = [];
      while (i < lines.length && !isConflictLine(lines[i], '=')) { ours.push(lines[i]); i++; }
      i++;
      const theirs: string[] = [];
      while (i < lines.length && !isConflictLine(lines[i], '>')) { theirs.push(lines[i]); i++; }
      const theirsLabel = (lines[i] || '').slice(7).trim();
      i++;
      segs.push({ type: 'conflict', oursLabel, theirsLabel, ours, theirs, choice: '', custom: '' });
    } else {
      text.push(l);
      i++;
    }
  }
  if (text.length) segs.push({ type: 'text', lines: text });
  return segs;
}

function blockIndex(segIdx: number): number {
  let n = 0;
  for (let k = 0; k <= segIdx; k++) if (segments.value[k].type === 'conflict') n++;
  return n;
}

function choiceLabel(c: string): string {
  return c === 'ours' ? '已采用左' : c === 'theirs' ? '已采用右' : c === 'both' ? '已保留两者' : '自定义';
}

/** 同步单个冲突块：接受左 */
function syncBlockLeft(i: number) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  seg.custom = seg.ours.join('\n');
  seg.choice = 'ours';
}

/** 同步单个冲突块：接受右 */
function syncBlockRight(i: number) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  seg.custom = seg.theirs.join('\n');
  seg.choice = 'theirs';
}

/** 保留两者 */
function chooseBoth(i: number) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  seg.custom = [...seg.ours, ...seg.theirs].join('\n');
  seg.choice = 'both';
}

/** 中栏编辑 → 标记为 custom */
function onSegEdit(i: number) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  seg.choice = 'custom';
}

/** 一键全部同步左栏 */
function syncAllLeft() {
  for (let i = 0; i < segments.value.length; i++) {
    if (segments.value[i].type === 'conflict') syncBlockLeft(i);
  }
}

/** 一键全部同步右栏 */
function syncAllRight() {
  for (let i = 0; i < segments.value.length; i++) {
    if (segments.value[i].type === 'conflict') syncBlockRight(i);
  }
}

/** 冲突块导航 */
const activeBlock = ref(0);
function blockSegIndices(): number[] {
  const r: number[] = [];
  segments.value.forEach((s, k) => { if (s.type === 'conflict') r.push(k); });
  return r;
}
function navBlock(dir: 1 | -1) {
  const idxs = blockSegIndices();
  if (!idxs.length) return;
  const cur = idxs.indexOf(idxs[Math.min(activeBlock.value, idxs.length - 1)]);
  const next = (cur + dir + idxs.length) % idxs.length;
  activeBlock.value = next;
  const el = midScrollRef.value?.querySelector(`[data-block="${next}"]`) as HTMLElement | null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** 行级 diff 高亮 */
function diffClass(segIdx: number, lineIdx: number, side: 'ours' | 'theirs'): string {
  const seg = segments.value[segIdx];
  if (seg.type !== 'conflict') return '';
  const oursSet = new Set(seg.ours);
  const theirsSet = new Set(seg.theirs);
  if (side === 'ours') {
    return theirsSet.has(seg.ours[lineIdx]) ? '' : 'add';
  } else {
    return oursSet.has(seg.theirs[lineIdx]) ? '' : 'del';
  }
}

/** 键盘快捷键 */
function onKey(e: KeyboardEvent) {
  if (!e.altKey) return;
  const idxs = blockSegIndices();
  if (!idxs.length) return;
  const segIdx = idxs[Math.min(activeBlock.value, idxs.length - 1)];
  if (e.key === '1') { e.preventDefault(); syncBlockLeft(segIdx); }
  else if (e.key === '2') { e.preventDefault(); syncBlockRight(segIdx); }
  else if (e.key === '3') { e.preventDefault(); chooseBoth(segIdx); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); navBlock(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); navBlock(1); }
}

/** 三栏联动滚动 */
function onScroll(source: 'left' | 'mid' | 'right') {
  const src = source === 'left' ? leftScrollRef.value : source === 'mid' ? midScrollRef.value : rightScrollRef.value;
  if (!src) return;
  const top = src.scrollTop;
  if (source !== 'left' && leftScrollRef.value) leftScrollRef.value.scrollTop = top;
  if (source !== 'mid' && midScrollRef.value) midScrollRef.value.scrollTop = top;
  if (source !== 'right' && rightScrollRef.value) rightScrollRef.value.scrollTop = top;
}

function onDialogOpened() {
  leftScrollRef.value?.addEventListener('scroll', () => onScroll('left'));
  midScrollRef.value?.addEventListener('scroll', () => onScroll('mid'));
  rightScrollRef.value?.addEventListener('scroll', () => onScroll('right'));
}

/** 组合最终内容 */
function compose(): string {
  const out: string[] = [];
  for (const seg of segments.value) {
    if (seg.type === 'text') { out.push(...seg.lines); continue; }
    if (seg.choice === 'ours') out.push(...seg.ours);
    else if (seg.choice === 'theirs') out.push(...seg.theirs);
    else if (seg.choice === 'both' || seg.choice === 'custom') out.push(...seg.custom.split('\n'));
    else {
      out.push(`<<<<<<<${seg.oursLabel ? ' ' + seg.oursLabel : ''}`, ...seg.ours, '=======', ...seg.theirs, `>>>>>>>${seg.theirsLabel ? ' ' + seg.theirsLabel : ''}`);
    }
  }
  return out.join('\n');
}

async function resolve() {
  const f = code.activeFile;
  if (!f || !repo.value) return;
  const final = compose();
  if (final.split('\n').some((l) => isConflictLine(l, '<') || isConflictLine(l, '>'))) {
    ElMessage.error('内容中仍存在冲突标记，请先处理或手动删除');
    return;
  }
  resolving.value = true;
  try {
    code.updateContent(f.path, final);
    const ok = await code.saveFile(f.path);
    if (!ok) { ElMessage.error('写入文件失败，请重试'); return; }
    const r = await api.post<{ ok: boolean }>('/git/resolve', { repo: repo.value, file: relPath.value });
    if ('error' in r) { ElMessage.error(`已写入文件但 git add 失败：${r.error}`); return; }
    ElMessage.success('已解决并暂存该文件');
    void gitStore.fetchStatus(repo.value);
    visible.value = false;
    emit('resolved');
  } finally {
    resolving.value = false;
  }
}

onMounted(async () => {
  const f = code.activeFile;
  if (!f || !code.projectDir) { error.value = '没有打开的文件'; loading.value = false; return; }
  const d = await api.get<{ repo: string | null }>(`/git/discover?dir=${encodeURIComponent(code.projectDir)}`);
  if ('error' in d || !d.data.repo) { error.value = '未找到 git 仓库'; loading.value = false; return; }
  repo.value = d.data.repo;
  const base = repo.value.replace(/[\\/]+$/, '');
  const norm = f.path.replace(/[\\/]+/g, '/');
  if (!norm.startsWith(base.replace(/[\\/]+/g, '/') + '/')) { error.value = '文件不在 git 仓库内'; loading.value = false; return; }
  relPath.value = norm.slice(base.length + 1);
  segments.value = parse(f.content);
  loading.value = false;
});
onMounted(() => { document.addEventListener('keydown', onKey); });
onUnmounted(() => { document.removeEventListener('keydown', onKey); });
</script>

<style scoped>
.cce-dialog :deep(.el-dialog__body) { padding: 0; height: calc(100vh - 0px); display: flex; flex-direction: column; }
.cce-dialog :deep(.el-dialog__header) { display: none; }

.cce-head {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.08));
  background: color-mix(in srgb, #ef4444 6%, var(--color-surface, #fff));
  font-size: 13px;
}
.cce-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.cce-warn { color: #ef4444; }
.cce-file { font-weight: 400; color: var(--color-text-secondary, #6b6b66); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cce-conflict-count { font-size: 12px; color: var(--color-text-secondary, #6b6b66); }
.cce-spacer { flex: 1; }
.cce-divider { width: 1px; height: 18px; background: var(--color-border, rgba(15,23,42,0.1)); margin: 0 4px; }
.cce-btn {
  height: 28px; padding: 0 10px; font-size: 12px;
  border: 1px solid var(--color-border, rgba(15,23,42,0.12)); border-radius: 6px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
}
.cce-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cce-btn.primary { background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff; }
.cce-btn.primary:hover:not(:disabled) { color: #fff; filter: brightness(1.06); }
.cce-btn:disabled { opacity: 0.5; cursor: default; }

.cce-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: var(--color-text-tertiary, #9c9b94); }
.cce-state.err { color: #ef4444; }
.spin { animation: cce-spin 0.9s linear infinite; }
@keyframes cce-spin { to { transform: rotate(360deg); } }

/* ===== 三栏布局 ===== */
.cce-merge { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.cce-col-left, .cce-col-mid, .cce-col-right { display: flex; flex-direction: column; min-height: 0; }
.cce-col-left { flex: 1 1 33%; border-right: 1px solid var(--color-border, rgba(15,23,42,0.08)); }
.cce-col-mid { flex: 1 1 34%; }
.cce-col-right { flex: 1 1 33%; border-left: 1px solid var(--color-border, rgba(15,23,42,0.08)); }

.cce-col-head {
  display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; flex-shrink: 0;
  border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.06));
  background: var(--color-surface-hover, rgba(15,23,42,0.02)); font-size: 12px; font-weight: 600;
}
.cce-col-head.center { justify-content: center; }
.cce-col-title { color: var(--color-text, #1a1a1a); }
.cce-sync-btn {
  margin-left: auto; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 22px; border: 1px solid var(--color-border, rgba(15,23,42,0.12)); border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--color-text-secondary, #6b6b66); font-size: 12px;
}
.cce-sync-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cce-col-right .cce-sync-btn { margin-left: 0; margin-right: auto; }

.cce-col-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px; line-height: 1.6; }

/* 文本段 */
.cce-seg-text { padding: 0 8px; }
.cce-seg-text .cce-line { white-space: pre; color: var(--color-text-secondary, #6b6b66); min-height: 1.6em; }

/* 冲突段 */
.cce-seg-conflict { margin: 4px 6px; border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); border-radius: 6px; overflow: hidden; background: var(--color-surface, #fff); }
.cce-seg-conflict.done { border-color: color-mix(in srgb, #10b981 40%, transparent); }
.cce-conflict-label { padding: 3px 8px; font-size: 10px; font-weight: 700; color: var(--color-text-secondary, #6b6b66); background: color-mix(in srgb, #ef4444 5%, transparent); }
.cce-seg-conflict.done .cce-conflict-label { background: color-mix(in srgb, #10b981 5%, transparent); }

/* 冲突行 */
.cce-line { white-space: pre; padding: 0 8px; min-height: 1.6em; }
.cce-line.ours { cursor: pointer; color: var(--color-text, #1a1a1a); }
.cce-line.theirs { cursor: pointer; color: var(--color-text, #1a1a1a); }
.cce-line.ours:hover { background: color-mix(in srgb, #3b82f6 8%, transparent); }
.cce-line.theirs:hover { background: color-mix(in srgb, #10b981 8%, transparent); }
.cce-line.add { background: color-mix(in srgb, #10b981 10%, transparent); }
.cce-line.del { background: color-mix(in srgb, #ef4444 10%, transparent); }
.cce-line.dim { color: var(--color-text-tertiary, #9c9b94); font-style: italic; }
.cce-line-sync { display: inline-block; width: 14px; margin-right: 4px; color: var(--color-primary, #c2410c); font-weight: 700; opacity: 0; transition: opacity 0.12s; }
.cce-line.ours:hover .cce-line-sync, .cce-line.theirs:hover .cce-line-sync { opacity: 1; }

/* 中栏冲突工具栏 */
.cce-conflict-toolbar { display: flex; align-items: center; gap: 6px; padding: 3px 8px; font-size: 11px; background: color-mix(in srgb, #ef4444 5%, transparent); border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.06)); }
.cce-seg-conflict.done .cce-conflict-toolbar { background: color-mix(in srgb, #10b981 5%, transparent); }
.cce-conflict-done { color: #10b981; font-weight: 600; }
.cce-conflict-todo { color: #ef4444; font-weight: 600; }
.cce-mini-btn {
  height: 20px; padding: 0 8px; font-size: 11px; border: 1px solid var(--color-border, rgba(15,23,42,0.12)); border-radius: 4px;
  background: var(--color-surface, #fff); color: var(--color-text-secondary, #6b6b66); cursor: pointer; white-space: nowrap;
}
.cce-mini-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cce-mini-btn.sel { background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff; }

/* 中栏编辑区 */
.cce-result-edit {
  width: calc(100% - 8px); margin: 4px; padding: 6px 8px; border: none; border-radius: 4px;
  font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px; line-height: 1.5; resize: vertical;
  background: var(--color-surface-hover, rgba(15,23,42,0.02)); color: var(--color-text, #1a1a1a);
  outline: 1px solid var(--color-border, rgba(15,23,42,0.08));
}
.cce-result-edit:focus { outline: 1px solid var(--color-primary, #c2410c); }
</style>
