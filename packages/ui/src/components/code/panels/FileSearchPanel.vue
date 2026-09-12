<template>
  <div class="fsp">
    <div class="fsp-form">
      <el-input
        ref="qInputRef"
        v-model="q"
        size="small"
        placeholder="搜索文件内容 / 文件名"
        clearable
        :prefix-icon="Search"
        class="fsp-input"
        @keydown.enter="run"
      />
      <el-input
        v-model="include"
        size="small"
        placeholder="限定后缀，如 ts,vue 或 *.java"
        clearable
        class="fsp-input"
        @keydown.enter="run"
      />
      <div class="fsp-opts">
        <button class="fsp-opt" :class="{ on: caseSensitive }" title="区分大小写" @click="caseSensitive = !caseSensitive">Aa</button>
        <button class="fsp-opt" :class="{ on: wholeWord }" title="全字匹配" @click="wholeWord = !wholeWord">[ab]</button>
        <button class="fsp-opt" :class="{ on: useRegex }" title="正则表达式" @click="useRegex = !useRegex">.*</button>
        <span class="fsp-spacer"></span>
        <button class="fsp-idx" :title="indexTip" @click="rebuild">
          <el-icon v-if="indexLoading" :size="12" class="spin"><Loading /></el-icon>
          <el-icon v-else :size="12"><Refresh /></el-icon>
        </button>
        <button class="fsp-run" :disabled="!q.trim() || contentLoading" @click="run">
          <el-icon v-if="contentLoading" :size="12" class="spin"><Loading /></el-icon>
          <el-icon v-else :size="12"><Search /></el-icon>
        </button>
      </div>

      <!-- 搜索范围 -->
      <div ref="pickerRef" class="fsp-scope">
        <span class="fsp-scope-label">范围</span>
        <button v-if="scope" class="fsp-scope-chip" :title="scope.rel" @click="emit('update:scope', null)">
          <el-icon :size="11"><FolderOpened /></el-icon>
          <span class="fsp-scope-name">{{ scope.label }}</span>
          <el-icon :size="11" class="fsp-scope-x"><Close /></el-icon>
        </button>
        <span v-else class="fsp-scope-all">整个项目</span>
        <span class="fsp-spacer"></span>
        <button class="fsp-scope-pick" :class="{ on: showPicker }" title="指定目录" @click="showPicker = !showPicker">
          <el-icon :size="12"><Folder /></el-icon>
          <span>指定目录</span>
        </button>
        <!-- 目录选择浮层 -->
        <div v-if="showPicker" class="fsp-picker">
          <el-input v-model="dirFilter" size="small" placeholder="过滤目录名" clearable :prefix-icon="Search" />
          <div class="fsp-dir-list">
            <button class="fsp-dir-row root" :class="{ on: !scope }" @click="clearScope">整个项目（根）</button>
            <button
              v-for="d in filteredDirs"
              :key="d.rel"
              class="fsp-dir-row"
              :class="{ on: scope?.rel === d.rel }"
              :style="{ paddingLeft: 10 + d.depth * 11 + 'px' }"
              :title="d.rel"
              @click="pickDir(d.rel)"
            >
              <el-icon :size="11"><Folder /></el-icon>
              <span class="fsp-dir-name">{{ d.name }}</span>
            </button>
          </div>
          <div v-if="!indexReady" class="fsp-dir-empty">索引构建中，请稍候…</div>
          <div v-else-if="!filteredDirs.length" class="fsp-dir-empty">无匹配目录</div>
        </div>
      </div>
    </div>

    <div class="fsp-body">
      <div v-if="!searched" class="fsp-hint">
        在「{{ rootName }}」中搜索文件内容或文件名
      </div>
      <div v-else-if="busy" class="fsp-hint">搜索中…</div>
      <div v-else-if="contentError" class="fsp-hint fsp-hint-err">{{ contentError }}</div>
      <div v-else-if="!filenameHits.length && !groups.length" class="fsp-hint">无匹配结果</div>

      <template v-else>
        <!-- 文件名命中（来自本地索引，即时） -->
        <template v-if="filenameHits.length">
          <div class="fsp-summary">
            文件名 · {{ filenameHits.length }} 个匹配
            <span v-if="indexTruncated" class="fsp-trunc">（索引仅覆盖部分文件）</span>
          </div>
          <div
            v-for="f in filenameHits"
            :key="'fn-' + f.relPath"
            class="fsp-hit fsp-hit-fn"
            :title="f.relPath"
            @click="openFileResult(joinAbs(f.relPath), f.name, 1, 1)"
          >
            <el-icon class="fsp-file-icon" :style="{ color: meta(f.name).color }">
              <component :is="meta(f.name).icon" />
            </el-icon>
            <span class="fsp-name">{{ f.name }}</span>
            <span class="fsp-path">{{ f.relPath }}</span>
          </div>
        </template>

        <!-- 内容命中（服务端） -->
        <template v-if="groups.length">
          <div class="fsp-summary">
            内容 · 共 {{ contentHits.length }} 处匹配 · {{ groups.length }} 个文件
            <span v-if="contentTruncated" class="fsp-trunc">（已达上限，请缩小范围）</span>
          </div>
          <div v-for="g in groups" :key="g.file" class="fsp-group">
            <div class="fsp-group-head" :title="g.file" @click="toggleGroup(g.file)">
              <el-icon :size="11" class="fsp-caret" :class="{ collapsed: !openFiles.has(g.file) }"><CaretBottom /></el-icon>
              <el-icon :size="12" class="fsp-file-icon" :style="{ color: meta(g.name).color }">
                <component :is="meta(g.name).icon" />
              </el-icon>
              <span class="fsp-group-name">{{ g.name }}</span>
              <span class="fsp-group-path">{{ g.relPath }}</span>
              <span class="fsp-group-count">{{ g.hits.length }}</span>
            </div>
            <template v-if="openFiles.has(g.file)">
              <div
                v-for="h in g.hits"
                :key="h.line + '-' + h.column"
                class="fsp-hit"
                :title="h.preview"
                @click="openFileResult(g.file, g.name, h.line, h.column)"
              >
                <span class="fsp-ln">{{ h.line }}</span>
                <span class="fsp-preview"><!-- eslint-disable-next-line vue/no-v-html --><span v-html="highlight(h.preview)"></span></span>
              </div>
            </template>
          </div>
        </template>
      </template>

      <!-- 索引状态条 -->
      <div v-if="searched && indexLoading" class="fsp-idxhint">正在构建文件索引…</div>
      <div v-else-if="indexReady" class="fsp-idxhint">已索引 {{ totalFiles }} 个文件 · 文件名搜索即时响应</div>
      <div v-else-if="indexError" class="fsp-idxhint fsp-hint-err">索引失败：{{ indexError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  Search, Loading, CaretBottom, Refresh, FolderOpened, Close, Folder,
} from '@element-plus/icons-vue';
import { api } from '../../../api/client';
import { useFileIndex, type IndexEntry } from '../../../composables/useFileIndex';
import { fileMeta } from '../fileMeta';
import { useCodeStore } from '../../../stores/code';
import { useChatStore } from '../../../stores/chat';

interface Hit { file: string; relPath: string; line: number; column: number; preview: string }
interface Group { file: string; name: string; relPath: string; hits: Hit[] }
interface Scope { rel: string; label: string }

const props = defineProps<{
  dir: string;
  mode: 'code' | 'chat';
  scope?: Scope | null;
}>();
const emit = defineEmits<{ 'update:scope': [Scope | null] }>();

const code = useCodeStore();
const chatStore = useChatStore();

const meta = fileMeta;
const dirRef = computed(() => props.dir);
const {
  ready: indexReady, loading: indexLoading, error: indexError,
  files, totalFiles, truncated: indexTruncated, ensure: ensureIndex, refresh: refreshIndex,
} = useFileIndex(dirRef);

const q = ref('');
const include = ref('');
const caseSensitive = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const contentLoading = ref(false);
const contentError = ref('');
const contentHits = ref<Hit[]>([]);
const contentTruncated = ref(false);
const searched = ref(false);
const openFiles = ref<Set<string>>(new Set());

const qInputRef = ref<any>(null);
const rootName = computed(() => {
  const p = (props.dir || '').replace(/[\\/]+$/, '');
  return p.split(/[\\/]/).filter(Boolean).pop() || '项目';
});

const indexTip = computed(() => {
  if (indexLoading) return '正在构建索引…';
  if (indexReady) return `已索引 ${totalFiles} 个文件（点击刷新）`;
  return '构建文件索引（点击）';
});

const busy = computed(() => contentLoading.value);

// ===== 目录选择浮层（指定搜索范围）=====
const showPicker = ref(false);
const pickerRef = ref<HTMLElement | null>(null);
const dirFilter = ref('');

// 从索引文件推导全部目录（去重、排序），供「指定目录」范围选择
const allDirs = computed(() => {
  const set = new Set<string>();
  for (const f of files.value) {
    const parts = f.relPath.split('/').filter(Boolean);
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      set.add(acc);
    }
  }
  return [...set].sort().map((rel) => ({
    rel,
    name: rel.split('/').pop() || rel,
    depth: rel.split('/').length - 1,
  }));
});

const filteredDirs = computed(() => {
  const q = dirFilter.value.trim().toLowerCase();
  if (!q) return allDirs.value;
  return allDirs.value.filter((d) => d.rel.toLowerCase().includes(q) || d.name.toLowerCase().includes(q));
});

function pickDir(rel: string) {
  const name = rel.split('/').pop() || rel;
  emit('update:scope', { rel, label: name });
  showPicker.value = false;
}
function clearScope() {
  emit('update:scope', null);
  showPicker.value = false;
}
function onPickerDocClick(e: MouseEvent) {
  if (!showPicker.value) return;
  const t = e.target as Node;
  if (pickerRef.value?.contains(t)) return;
  showPicker.value = false;
}
onMounted(() => {
  document.addEventListener('click', onPickerDocClick);
  // 进入搜索面板即后台静默构建索引（懒加载，不打断用户操作）
  if (props.dir && !indexReady.value && !indexLoading.value) void ensureIndex();
});
onBeforeUnmount(() => document.removeEventListener('click', onPickerDocClick));

// 项目目录切换后，自动后台重建索引（懒加载，不阻塞用户）
watch(
  () => props.dir,
  (d) => { if (d && !indexReady.value && !indexLoading.value) void ensureIndex(); },
);

// ===== 文件名命中（本地索引即时）=====
const filenameHits = computed<IndexEntry[]>(() => {
  if (!q.value.trim() || !indexReady.value) return [];
  return files.value
    .filter((f) => f.name.toLowerCase().includes(q.value.trim().toLowerCase()))
    .slice(0, 500);
});

// 用户输入时若索引未建，后台懒加载（非实时）
watch(q, (v) => {
  if (v.trim() && !indexReady.value && !indexLoading.value) void ensureIndex();
});

function joinAbs(rel: string): string {
  const sep = props.dir.includes('\\') && !props.dir.includes('/') ? '\\' : '/';
  const base = props.dir.replace(/[\\/]+$/, '');
  return base + sep + rel.split('/').join(sep);
}

const groups = computed<Group[]>(() => {
  const map = new Map<string, Group>();
  for (const h of contentHits.value) {
    let g = map.get(h.file);
    if (!g) {
      const name = h.file.split(/[\\/]/).pop() || h.file;
      g = { file: h.file, name, relPath: h.relPath, hits: [] };
      map.set(h.file, g);
    }
    g.hits.push(h);
  }
  return [...map.values()];
});

function toggleGroup(f: string) {
  const next = new Set(openFiles.value);
  if (next.has(f)) next.delete(f);
  else next.add(f);
  openFiles.value = next;
}

async function run() {
  const term = q.value.trim();
  if (!term) return;
  if (!props.dir) { contentError.value = '请先选择项目目录'; searched.value = true; return; }
  searched.value = true;
  contentError.value = '';
  // 内容搜索走服务端、不依赖本地索引；文件名结果随索引就绪自动补上
  if (!indexReady.value && !indexLoading.value) void ensureIndex();

  contentLoading.value = true;
  const params = new URLSearchParams({
    dir: props.dir,
    q: term,
    include: include.value.trim(),
    caseSensitive: caseSensitive.value ? '1' : '0',
    wholeWord: wholeWord.value ? '1' : '0',
    regex: useRegex.value ? '1' : '0',
    maxResults: '1000',
  });
  if (props.scope?.rel) params.set('sub', props.scope.rel);
  const r = await api.get<{ hits: Hit[]; truncated: boolean }>(`/workspace/search?${params.toString()}`);
  contentLoading.value = false;
  if ('error' in r) { contentError.value = r.error; contentHits.value = []; return; }
  contentHits.value = r.data.hits || [];
  contentTruncated.value = !!r.data.truncated;
  openFiles.value = new Set(groups.value.slice(0, 12).map((g) => g.file));
}

function rebuild() {
  void refreshIndex();
}

function openFileResult(path: string, name: string, line: number, column: number) {
  if (props.mode === 'code') {
    code.revealLine(path, line, column);
  } else {
    chatStore.openTab({ kind: 'file', name, path });
    chatStore.rightPanelOpen = true;
  }
}

/** 把命中片段标红；正则模式下按列号截取等长片段，无法精确时整行高亮 */
function highlight(preview: string): string {
  const term = q.value.trim();
  const safe = escapeHtml(preview);
  if (!term) return safe;
  if (useRegex.value) {
    try {
      return safe.replace(new RegExp(`(${term})`, caseSensitive.value ? 'g' : 'gi'), '<mark>$1</mark>');
    } catch {
      return safe;
    }
  }
  const flags = caseSensitive.value ? 'g' : 'gi';
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(escaped, flags), (m) => `<mark>${m}</mark>`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 供父组件在「在此文件夹中搜索」后聚焦输入框 */
function focusQuery() {
  void nextTick(() => qInputRef.value?.focus?.());
}
defineExpose({ focusQuery, run });
</script>

<style scoped>
.fsp { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.fsp-form { padding: 8px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.fsp-input { width: 100%; }

.fsp-opts { display: flex; align-items: center; gap: 3px; }
.fsp-spacer { flex: 1; }
.fsp-opt {
  height: 20px; min-width: 26px; padding: 0 6px;
  font-size: 10.5px; font-family: var(--font-mono, monospace);
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 5px;
  background: transparent; color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.14s ease;
}
.fsp-opt:hover { border-color: var(--glass-border-strong, #d8d5cc); }
.fsp-opt.on {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent);
  border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c);
}
.fsp-idx, .fsp-run {
  width: 24px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 6px;
  background: transparent; color: var(--color-text-secondary, #6b6b66); cursor: pointer;
}
.fsp-idx:hover, .fsp-run:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.fsp-run:disabled { opacity: 0.4; cursor: default; }
.spin { animation: fsp-spin 0.9s linear infinite; }
@keyframes fsp-spin { to { transform: rotate(360deg); } }

.fsp-scope { display: flex; align-items: center; gap: 6px; position: relative; }
.fsp-scope-label { font-size: 11px; color: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.fsp-scope-all { font-size: 11px; color: var(--color-text-secondary, #6b6b66); }
.fsp-scope-chip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 6px; max-width: 200px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #c2410c) 40%, transparent);
  border-radius: 999px; background: color-mix(in srgb, var(--color-primary, #c2410c) 8%, transparent);
  color: var(--color-primary, #c2410c); font-size: 11px; cursor: pointer; font-family: inherit;
}
.fsp-scope-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fsp-scope-x { opacity: 0.7; }

.fsp-spacer { flex: 1; }
.fsp-scope-pick {
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
  height: 20px; padding: 0 6px; border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 999px; background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 10.5px; cursor: pointer; font-family: inherit;
}
.fsp-scope-pick:hover, .fsp-scope-pick.on { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }

.fsp-picker {
  position: absolute; top: calc(100% + 4px); right: 0; width: 250px; z-index: 30;
  background: var(--bg-elevated, #fff); border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.12); padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.fsp-dir-list { max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
.fsp-dir-row {
  display: flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 8px; border: none; border-radius: 5px;
  background: transparent; color: var(--color-text, #1a1a1a); font-size: 12px; cursor: pointer;
  text-align: left; font-family: inherit;
}
.fsp-dir-row:hover { background: var(--glass-bg-hover, #f1efe9); }
.fsp-dir-row.on { background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent); color: var(--color-primary, #c2410c); }
.fsp-dir-row.root { color: var(--color-text-secondary, #6b6b66); font-weight: 600; }
.fsp-dir-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fsp-dir-empty { padding: 8px; font-size: 11px; color: var(--color-text-tertiary, #9c9b94); text-align: center; }

.fsp-body { flex: 1; min-height: 0; overflow: auto; padding: 0 4px 8px; }

.fsp-hint {
  padding: 16px 10px; font-size: 11.5px; text-align: center; line-height: 1.6;
  color: var(--color-text-tertiary, #9c9b94);
}
.fsp-hint-err { color: var(--el-color-danger); }

.fsp-summary {
  padding: 6px 8px 6px; font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
}
.fsp-trunc { color: var(--el-color-warning); }

.fsp-group { margin-bottom: 2px; }
.fsp-group-head {
  display: flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 6px; border-radius: 6px; cursor: pointer;
}
.fsp-group-head:hover { background: var(--glass-bg-hover, #f1efe9); }
.fsp-caret { color: var(--color-text-tertiary, #9c9b94); transition: transform 0.15s ease; flex-shrink: 0; }
.fsp-caret.collapsed { transform: rotate(-90deg); }
.fsp-file-icon { flex-shrink: 0; }
.fsp-group-name { font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a); flex-shrink: 0; }
.fsp-group-path {
  flex: 1; min-width: 0; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left;
}
.fsp-group-count {
  flex-shrink: 0; font-size: 10px; padding: 0 5px; border-radius: 8px;
  background: var(--glass-bg-hover, #f1efe9); color: var(--color-text-secondary, #6b6b66);
}

.fsp-hit {
  display: flex; align-items: baseline; gap: 8px;
  padding: 2px 6px 2px 24px; border-radius: 5px; cursor: pointer;
  font-family: var(--font-mono, monospace); font-size: 11.5px;
  color: var(--color-text-secondary, #6b6b66);
}
.fsp-hit:hover { background: var(--glass-bg-hover, #f1efe9); }
.fsp-hit-fn { align-items: center; font-family: inherit; }
.fsp-name { font-size: 12px; color: var(--color-text, #1a1a1a); flex-shrink: 0; }
.fsp-path {
  flex: 1; min-width: 0; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left;
}
.fsp-ln {
  flex-shrink: 0; min-width: 30px; text-align: right;
  color: var(--color-text-tertiary, #9c9b94); font-size: 10.5px;
}
.fsp-preview {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--color-text, #1a1a1a);
}
.fsp-preview :deep(mark) {
  background: color-mix(in srgb, var(--color-warning, #b45309) 26%, transparent);
  color: inherit; border-radius: 2px; padding: 0 1px;
}

.fsp-idxhint {
  padding: 6px 10px; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  border-top: 1px solid var(--glass-border, #e7e4dc); margin-top: 4px;
}
</style>
