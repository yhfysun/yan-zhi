<template>
  <div class="srp">
    <div class="srp-form">
      <el-input
        v-model="q"
        size="small"
        placeholder="搜索文件内容"
        clearable
        :prefix-icon="Search"
        class="srp-input"
        @keydown.enter="run"
      />
      <el-input
        v-model="include"
        size="small"
        placeholder="限定后缀，如 ts,vue 或 *.java"
        clearable
        class="srp-input"
        @keydown.enter="run"
      />
      <div class="srp-opts">
        <button class="srp-opt" :class="{ on: caseSensitive }" title="区分大小写" @click="caseSensitive = !caseSensitive">Aa</button>
        <button class="srp-opt" :class="{ on: wholeWord }" title="全字匹配" @click="wholeWord = !wholeWord">[ab]</button>
        <button class="srp-opt" :class="{ on: useRegex }" title="正则表达式" @click="useRegex = !useRegex">.*</button>
        <span class="srp-spacer"></span>
        <button class="srp-run" :disabled="!q.trim() || loading" @click="run">
          <el-icon v-if="loading" :size="12" class="spin"><Loading /></el-icon>
          <el-icon v-else :size="12"><Search /></el-icon>
        </button>
      </div>
    </div>

    <div class="srp-body">
      <div v-if="!searched" class="srp-hint">
        在「{{ code.projectName || '项目' }}」中搜索文件内容
      </div>
      <div v-else-if="loading" class="srp-hint">搜索中…</div>
      <div v-else-if="error" class="srp-hint srp-hint-err">{{ error }}</div>
      <div v-else-if="!groups.length" class="srp-hint">无匹配结果</div>

      <template v-else>
        <div class="srp-summary">
          共 {{ hits.length }} 处匹配 · {{ groups.length }} 个文件
          <span v-if="truncated" class="srp-trunc">（已达上限，请缩小范围）</span>
        </div>
        <div v-for="g in groups" :key="g.file" class="srp-group">
          <div class="srp-group-head" :title="g.file" @click="toggleGroup(g.file)">
            <el-icon :size="11" class="srp-caret" :class="{ collapsed: !openFiles.has(g.file) }"><CaretBottom /></el-icon>
            <el-icon :size="12" class="srp-file-icon" :style="{ color: meta(g.name).color }">
              <component :is="meta(g.name).icon" />
            </el-icon>
            <span class="srp-group-name">{{ g.name }}</span>
            <span class="srp-group-path">{{ g.relPath }}</span>
            <span class="srp-group-count">{{ g.hits.length }}</span>
          </div>
          <template v-if="openFiles.has(g.file)">
            <div
              v-for="h in g.hits"
              :key="h.line + '-' + h.column"
              class="srp-hit"
              :title="h.preview"
              @click="openHit(g.file, h.line, h.column)"
            >
              <span class="srp-ln">{{ h.line }}</span>
              <span class="srp-preview"><!-- eslint-disable-next-line vue/no-v-html --><span v-html="highlight(h.preview)"></span></span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search, Loading, CaretBottom } from '@element-plus/icons-vue';
import { api } from '../../../api/client';
import { useCodeStore } from '../../../stores/code';
import { fileMeta } from '../fileMeta';

interface Hit { file: string; relPath: string; line: number; column: number; preview: string }
interface Group { file: string; name: string; relPath: string; hits: Hit[] }

const code = useCodeStore();
const meta = fileMeta;

const q = ref('');
const include = ref('');
const caseSensitive = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const loading = ref(false);
const searched = ref(false);
const error = ref('');
const hits = ref<Hit[]>([]);
const truncated = ref(false);
const openFiles = ref<Set<string>>(new Set());

const groups = computed<Group[]>(() => {
  const map = new Map<string, Group>();
  for (const h of hits.value) {
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
  if (!code.projectDir) { error.value = '请先选择项目目录'; searched.value = true; return; }
  loading.value = true;
  error.value = '';
  searched.value = true;
  const params = new URLSearchParams({
    dir: code.projectDir,
    q: term,
    include: include.value.trim(),
    caseSensitive: caseSensitive.value ? '1' : '0',
    wholeWord: wholeWord.value ? '1' : '0',
    regex: useRegex.value ? '1' : '0',
    maxResults: '1000',
  });
  const r = await api.get<{ hits: Hit[]; truncated: boolean }>(`/workspace/search?${params.toString()}`);
  loading.value = false;
  if ('error' in r) { error.value = r.error; hits.value = []; return; }
  hits.value = r.data.hits || [];
  truncated.value = !!r.data.truncated;
  // 默认展开前 12 个文件分组
  openFiles.value = new Set(groups.value.slice(0, 12).map((g) => g.file));
}

function openHit(file: string, line: number, column: number) {
  code.revealLine(file, line, column);
}

/** 把命中片段标红；正则模式下按服务端返回的列号截取等长片段，无法精确时整行高亮 */
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
</script>

<style scoped>
.srp { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.srp-form { padding: 8px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.srp-input { width: 100%; }

.srp-opts { display: flex; align-items: center; gap: 3px; }
.srp-spacer { flex: 1; }
.srp-opt {
  height: 20px; min-width: 26px; padding: 0 6px;
  font-size: 10.5px; font-family: var(--font-mono, monospace);
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 5px;
  background: transparent; color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.14s ease;
}
.srp-opt:hover { border-color: var(--glass-border-strong, #d8d5cc); }
.srp-opt.on {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent);
  border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c);
}
.srp-run {
  width: 24px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 6px;
  background: transparent; color: var(--color-text-secondary, #6b6b66); cursor: pointer;
}
.srp-run:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.srp-run:disabled { opacity: 0.4; cursor: default; }
.spin { animation: srp-spin 0.9s linear infinite; }
@keyframes srp-spin { to { transform: rotate(360deg); } }

.srp-body { flex: 1; min-height: 0; overflow: auto; padding: 0 4px 8px; }

.srp-hint {
  padding: 16px 10px; font-size: 11.5px; text-align: center; line-height: 1.6;
  color: var(--color-text-tertiary, #9c9b94);
}
.srp-hint-err { color: var(--el-color-danger); }

.srp-summary {
  padding: 4px 8px 8px; font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
}
.srp-trunc { color: var(--el-color-warning); }

.srp-group { margin-bottom: 2px; }
.srp-group-head {
  display: flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 6px; border-radius: 6px; cursor: pointer;
}
.srp-group-head:hover { background: var(--glass-bg-hover, #f1efe9); }
.srp-caret { color: var(--color-text-tertiary, #9c9b94); transition: transform 0.15s ease; flex-shrink: 0; }
.srp-caret.collapsed { transform: rotate(-90deg); }
.srp-file-icon { flex-shrink: 0; }
.srp-group-name { font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a); flex-shrink: 0; }
.srp-group-path {
  flex: 1; min-width: 0; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left;
}
.srp-group-count {
  flex-shrink: 0; font-size: 10px; padding: 0 5px; border-radius: 8px;
  background: var(--glass-bg-hover, #f1efe9); color: var(--color-text-secondary, #6b6b66);
}

.srp-hit {
  display: flex; align-items: baseline; gap: 8px;
  padding: 2px 6px 2px 24px; border-radius: 5px; cursor: pointer;
  font-family: var(--font-mono, monospace); font-size: 11.5px;
  color: var(--color-text-secondary, #6b6b66);
}
.srp-hit:hover { background: var(--glass-bg-hover, #f1efe9); }
.srp-ln {
  flex-shrink: 0; min-width: 30px; text-align: right;
  color: var(--color-text-tertiary, #9c9b94); font-size: 10.5px;
}
.srp-preview {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--color-text, #1a1a1a);
}
.srp-preview :deep(mark) {
  background: color-mix(in srgb, var(--color-warning, #b45309) 26%, transparent);
  color: inherit; border-radius: 2px; padding: 0 1px;
}
</style>
