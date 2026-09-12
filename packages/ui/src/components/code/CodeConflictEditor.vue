<template>
  <div class="cce">
    <!-- 工具栏 -->
    <div class="cce-head">
      <span class="cce-title">
        <el-icon :size="13" class="cce-warn"><Warning /></el-icon>
        合并冲突
        <span class="cce-file">{{ fileName }}</span>
      </span>
      <span class="cce-spacer"></span>
      <button class="cce-btn" :disabled="!blocks.length" @click="chooseAll('ours')">全部采用当前</button>
      <button class="cce-btn" :disabled="!blocks.length" @click="chooseAll('theirs')">全部采用传入</button>
      <button class="cce-btn" @click="emit('cancel')">取消</button>
      <button class="cce-btn primary" :disabled="!allDone || resolving" :title="resolveHint" @click="resolve">
        {{ resolving ? '处理中…' : `标记为已解决（${resolvedCount}/${blocks.length}）` }}
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
      <button class="cce-btn" style="margin-top: 8px" @click="emit('cancel')">返回编辑器</button>
    </div>

    <!-- 正文：文本段 + 冲突块 -->
    <div v-else class="cce-body">
      <template v-for="(seg, i) in segments" :key="i">
        <pre v-if="seg.type === 'text'" class="cce-text">{{ seg.lines.join('\n') }}</pre>
        <div v-else class="cce-block" :class="{ done: !!seg.choice }">
          <div class="cce-block-head">
            <span class="cce-block-no">冲突 {{ blockIndex(i) }}/{{ blocks.length }}</span>
            <span v-if="seg.choice" class="cce-block-done">
              已选择：{{ choiceLabel(seg.choice) }}
            </span>
            <span v-else class="cce-block-todo">待选择</span>
            <span class="cce-spacer"></span>
            <div class="cce-actions">
              <button class="cce-act" :class="{ sel: seg.choice === 'ours' }" @click="choose(i, 'ours')">使用当前{{ seg.oursLabel ? `（${seg.oursLabel}）` : '' }}</button>
              <button class="cce-act" :class="{ sel: seg.choice === 'theirs' }" @click="choose(i, 'theirs')">使用传入{{ seg.theirsLabel ? `（${seg.theirsLabel}）` : '' }}</button>
              <button class="cce-act" :class="{ sel: seg.choice === 'both' }" @click="choose(i, 'both')">保留两者</button>
              <button class="cce-act" :class="{ sel: seg.editing }" @click="toggleEdit(i)">手动编辑</button>
            </div>
          </div>
          <div class="cce-cols">
            <pre class="cce-col" :class="{ sel: seg.choice === 'ours' }" @click="choose(i, 'ours')">{{ seg.ours.join('\n') || '（空）' }}</pre>
            <pre class="cce-col" :class="{ sel: seg.choice === 'theirs' }" @click="choose(i, 'theirs')">{{ seg.theirs.join('\n') || '（空）' }}</pre>
          </div>
          <textarea
            v-if="seg.editing"
            v-model="seg.custom"
            class="cce-custom"
            rows="6"
            spellcheck="false"
            placeholder="编辑该块最终保留的内容"
          ></textarea>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Warning } from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { useGitStore } from '../../stores/git';
import { api } from '../../api/client';

const emit = defineEmits<{ resolved: []; cancel: [] }>();
const code = useCodeStore();
const gitStore = useGitStore();

interface TextSeg { type: 'text'; lines: string[] }
interface ConflictSeg {
  type: 'conflict';
  oursLabel: string;
  theirsLabel: string;
  ours: string[];
  theirs: string[];
  choice: '' | 'ours' | 'theirs' | 'both' | 'custom';
  custom: string;
  editing: boolean;
}
type Seg = TextSeg | ConflictSeg;

const loading = ref(true);
const error = ref('');
const resolving = ref(false);
const repo = ref('');
const relPath = ref('');
const segments = ref<Seg[]>([]);

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

/** 解析冲突标记为 文本段 / 冲突块 序列（逐行，回写不丢换行） */
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
      i++; // 跳过 =======
      const theirs: string[] = [];
      while (i < lines.length && !isConflictLine(lines[i], '>')) { theirs.push(lines[i]); i++; }
      const theirsLabel = (lines[i] || '').slice(7).trim();
      i++; // 跳过 >>>>>>>
      segs.push({ type: 'conflict', oursLabel, theirsLabel, ours, theirs, choice: '', custom: '', editing: false });
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
  return c === 'ours' ? '当前' : c === 'theirs' ? '传入' : c === 'both' ? '两者' : '自定义';
}

function choose(i: number, choice: ConflictSeg['choice']) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  if (choice === 'both') seg.custom = [...seg.ours, ...seg.theirs].join('\n');
  seg.choice = choice;
}

function chooseAll(choice: 'ours' | 'theirs') {
  for (const seg of segments.value) if (seg.type === 'conflict') choose(segments.value.indexOf(seg), choice);
}

function toggleEdit(i: number) {
  const seg = segments.value[i];
  if (seg.type !== 'conflict') return;
  if (!seg.editing && !seg.custom) {
    seg.custom = seg.choice === 'ours' ? seg.ours.join('\n')
      : seg.choice === 'theirs' ? seg.theirs.join('\n')
      : [...seg.ours, ...seg.theirs].join('\n');
  }
  seg.editing = !seg.editing;
  if (seg.editing) seg.choice = 'custom';
}

/** 组合最终内容；未选择的块保留原冲突标记 */
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
  // 双保险：内容里不允许再残留冲突标记（手动编辑可能引入）
  if (final.split('\n').some((l) => isConflictLine(l, '<') || isConflictLine(l, '>'))) {
    ElMessage.error('内容中仍存在冲突标记，请先处理或手动删除');
    return;
  }
  resolving.value = true;
  try {
    code.updateContent(f.path, final);
    const ok = await code.saveFile(f.path);
    if (!ok) {
      ElMessage.error('写入文件失败，请重试');
      return;
    }
    const r = await api.post<{ ok: boolean }>('/git/resolve', { repo: repo.value, file: relPath.value });
    if ('error' in r) {
      ElMessage.error(`已写入文件但 git add 失败：${r.error}`);
      return;
    }
    ElMessage.success('已解决并暂存该文件');
    void gitStore.fetchStatus(repo.value);
    emit('resolved');
  } finally {
    resolving.value = false;
  }
}

onMounted(async () => {
  const f = code.activeFile;
  if (!f || !code.projectDir) {
    error.value = '没有打开的文件';
    loading.value = false;
    return;
  }
  // 定位 git 仓库根（projectDir 可能是仓库子目录）
  const d = await api.get<{ repo: string | null }>(`/git/discover?dir=${encodeURIComponent(code.projectDir)}`);
  if ('error' in d || !d.data.repo) {
    error.value = '未找到 git 仓库';
    loading.value = false;
    return;
  }
  repo.value = d.data.repo;
  const base = repo.value.replace(/[\\/]+$/, '');
  const norm = f.path.replace(/[\\/]+/g, '/');
  if (!norm.startsWith(base.replace(/[\\/]+/g, '/') + '/')) {
    error.value = '文件不在 git 仓库内';
    loading.value = false;
    return;
  }
  relPath.value = norm.slice(base.length + 1);
  segments.value = parse(f.content);
  loading.value = false;
});
</script>

<style scoped>
.cce {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cce-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: color-mix(in srgb, #ef4444 7%, var(--el-fill-color-lighter, #faf9f6));
  font-size: 12px;
}
.cce-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--color-text, #1a1a1a);
}
.cce-warn { color: #ef4444; }
.cce-file {
  font-weight: 400;
  color: var(--color-text-secondary, #6b6b66);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cce-spacer { flex: 1; }
.cce-btn {
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  border: 1px solid var(--glass-border-strong, #d8d5cc);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1a1a);
  cursor: pointer;
  flex-shrink: 0;
}
.cce-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cce-btn.primary {
  background: var(--color-primary, #c2410c);
  border-color: var(--color-primary, #c2410c);
  color: #fff;
}
.cce-btn.primary:hover:not(:disabled) { color: #fff; filter: brightness(1.06); }
.cce-btn:disabled { opacity: 0.5; cursor: default; }

.cce-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary, #9c9b94);
}
.cce-state.err { color: var(--el-color-danger); }
.spin { animation: cce-spin 0.9s linear infinite; }
@keyframes cce-spin { to { transform: rotate(360deg); } }

.cce-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0 40px;
}
.cce-text {
  margin: 0;
  padding: 0 12px;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  color: var(--color-text-secondary, #6b6b66);
}
.cce-block {
  margin: 8px 10px;
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface, #fff);
}
.cce-block.done { border-color: color-mix(in srgb, #10b981 45%, transparent); }
.cce-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 11.5px;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: color-mix(in srgb, #ef4444 5%, transparent);
}
.cce-block.done .cce-block-head { background: color-mix(in srgb, #10b981 6%, transparent); }
.cce-block-no { font-weight: 700; color: var(--color-text, #1a1a1a); }
.cce-block-done { color: #10b981; }
.cce-block-todo { color: #ef4444; }
.cce-actions { display: inline-flex; gap: 4px; }
.cce-act {
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
  border: 1px solid var(--glass-border-strong, #d8d5cc);
  border-radius: 5px;
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #6b6b66);
  cursor: pointer;
  white-space: nowrap;
}
.cce-act:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cce-act.sel {
  background: var(--color-primary, #c2410c);
  border-color: var(--color-primary, #c2410c);
  color: #fff;
}
.cce-cols {
  display: flex;
  min-height: 0;
}
.cce-col {
  flex: 1 1 50%;
  min-width: 0;
  margin: 0;
  padding: 6px 10px;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
  cursor: pointer;
  color: var(--color-text, #1a1a1a);
}
.cce-col + .cce-col { border-left: 1px dashed var(--glass-border, #e7e4dc); }
.cce-col:hover { background: color-mix(in srgb, var(--color-primary, #c2410c) 4%, transparent); }
.cce-col.sel { background: color-mix(in srgb, #10b981 9%, transparent); }
.cce-custom {
  width: calc(100% - 20px);
  margin: 6px 10px;
  padding: 6px 8px;
  border: 1px solid var(--glass-border-strong, #d8d5cc);
  border-radius: 6px;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  background: var(--el-fill-color-lighter, #faf9f6);
  color: var(--color-text, #1a1a1a);
}
</style>
