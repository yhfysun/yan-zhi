<template>
  <div class="bc" @click.stop>
    <!-- 指向来源面包屑段的箭头 -->
    <span class="bc-arrow" :style="{ left: arrowLeft + 'px' }"></span>

    <template v-if="file">
      <!-- 当前文件所在目录 + 回溯链 -->
      <div class="bc-path">
        <button
          v-for="n in ancestors"
          :key="n.abs"
          class="bc-path-seg"
          :title="n.abs"
          @click="focusDir(n.dirAbs)"
        >{{ n.label }}</button>
      </div>

      <input
        ref="inputRef"
        v-model="query"
        class="bc-input"
        :placeholder="`在 ${currentLabel} 中按名称过滤…`"
        @keydown.esc.stop.prevent="emit('close')"
        @keydown.enter.prevent="openFirst"
      />

      <div class="bc-list">
        <template v-for="row in rows" :key="row.abs">
          <div
            class="bc-row"
            :class="{ 'is-dir': row.isDir, 'is-parent': row.kind === 'parent', on: row.abs === cursorAbs }"
            :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
            :title="row.abs"
            @click="onRowClick(row)"
            @mouseenter="cursorAbs = row.abs"
          >
            <el-icon v-if="row.isDir && row.kind !== 'parent'" class="bc-caret" :class="{ on: expanded.has(row.abs) }">
              <CaretRight />
            </el-icon>
            <span v-else-if="row.kind === 'parent'" class="bc-parent-ico">‹</span>
            <span v-else class="bc-caret-ph"></span>

            <el-icon v-if="row.loading" class="bc-ico spin"><Loading /></el-icon>
            <el-icon v-else class="bc-ico" :style="{ color: rowMeta(row).color }">
              <component :is="rowMeta(row).icon" />
            </el-icon>

            <span class="bc-name">{{ row.name }}</span>
            <el-icon v-if="row.abs === activeAbs" :size="11" class="bc-check"><Check /></el-icon>
            <span v-if="row.isDir && row.kind === 'dir'" class="bc-count">{{ "" }}</span>
          </div>
          <div v-if="row.error" class="bc-err" :style="{ paddingLeft: 22 + row.depth * 14 + 'px' }">{{ row.error }}</div>
        </template>
        <div v-if="!rows.length && !loading" class="bc-empty">{{ query.trim() ? '无匹配项' : '空目录' }}</div>
      </div>

      <div class="bc-foot">
        <button class="bc-foot-btn" @click="revealCurrent">
          <el-icon :size="12"><FolderOpened /></el-icon> 在文件管理器中打开
        </button>
        <span class="bc-foot-hint">↑↓ 选择 · Enter 打开</span>
      </div>
    </template>

    <div v-else class="bc-empty bc-empty-lg">无目录</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { CaretRight, Loading, Check, FolderOpened } from '@element-plus/icons-vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { api } from '../../api/client';
import { fileMeta } from './fileMeta';

const props = defineProps<{
  /** 目录下拉的根（真实绝对路径） */
  file: { abs: string; label: string } | null;
  /** 项目根目录（用于把绝对路径换算成 /workspace/tree 需要的相对路径） */
  rootDir?: string;
  /** 当前打开文件（绝对路径），用于高亮 */
  activeAbs?: string;
  /** 箭头相对下拉框左边缘的位置（跟随来源面包屑段） */
  arrowLeft?: number;
}>();
const emit = defineEmits<{ close: []; opened: [{ abs: string; name: string }] }>();

interface Entry { name: string; abs: string; isDir: boolean }
type Row = Entry & { depth: number; kind: 'dir' | 'parent'; loading?: boolean; error?: string };

const arrowLeft = computed(() => props.arrowLeft ?? 18);

// ===== 目录内容（每层懒加载 + 缓存）=====
// 注意：这些 ref 必须在下方 immediate watch 之前声明，否则 watch 首次执行会
// 命中 TDZ（ReferenceError: Cannot access 'query' before initialization）。
const cache = ref<Record<string, Entry[]>>({});
const loading = ref(false);
const error = ref('');
const expanded = ref<Set<string>>(new Set());
const query = ref('');
const cursorAbs = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// ===== 导航历史（点目录 → 就地展开为列表；「‹ 上一级」沿历史回退）=====
const hist = ref<Entry[]>([]);
watch(() => props.file, (f) => {
  hist.value = f ? [{ name: f.label, abs: f.abs, isDir: true }] : [];
  query.value = '';
  cache.value = {};
  expanded.value = new Set();
  error.value = '';
  cursorAbs.value = '';
  if (f) void load(f.abs);
}, { immediate: true });

const current = computed(() => hist.value[hist.value.length - 1] || null);
const currentLabel = computed(() => current.value?.name || props.file?.label || '');
const ancestors = computed(() =>
  hist.value.map((n, i) => {
    const dirAbs = i === 0 ? parentOf(n.abs) : hist.value[i - 1].abs;
    return { label: n.name, abs: n.abs, dirAbs };
  }),
);

function parentOf(p: string): string {
  const segs = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  segs.pop();
  const head = segs[0] || '';
  // Windows 盘符：C: → C:\
  if (segs.length === 1 && /^[A-Za-z]:$/.test(head)) return head + '\\';
  return segs.join('/') || head;
}

async function fetchDir(abs: string): Promise<{ entries: Entry[] } | { error: string }> {
  // 走后端 /workspace/tree（web/desktop 一致、读真实磁盘）
  // 当面包屑段指向「项目根之外」的目录（如打开的文件路径不在 code.projectDir
  // 子树下），sub 直接传绝对路径 — 后端对该形态放行（仅限 local/dev，
  // 面包屑本身就源自用户已打开的本地文件路径，不算穿越）。
  const root = props.rootDir || '';
  const sub = abs;
  try {
    const r = await api.get<{ entries: Array<{ name: string; relPath: string; isDir: boolean }>; hasMore: boolean }>(
      `/workspace/tree?dir=${encodeURIComponent(root || abs)}&sub=${encodeURIComponent(sub)}&recursive=0&limit=2000`,
    );
    if ('data' in r) {
      const list = r.data.entries || [];
      return { entries: list.map((e) => ({ name: e.name, abs: joinAbs(abs, e.name), isDir: e.isDir })) };
    }
    // 后端 4xx/5xx（不安全/不存在）→ 落到适配器兜底，让桌面端用 Rust 直接读
  } catch { /* 落到适配器兜底 */ }

  // 兜底：平台适配器（桌面端能读任意绝对路径；web 端只读 OPFS 授权目录）
  try {
    const fs = getPlatformAdapter().fs;
    if (fs.listDirEntries) {
      const list = await fs.listDirEntries(abs);
      return { entries: list.map((e) => ({ name: e.name, abs: e.path, isDir: e.isDir })) };
    }
    const names = await fs.readDir(abs);
    const entries: Entry[] = [];
    for (const name of names) {
      const child = joinAbs(abs, name);
      let isDir = false;
      try {
        if (fs.stat) isDir = (await fs.stat(child)).isDir;
        else isDir = await fs.exists(joinAbs(child, '/'));
      } catch { isDir = false; }
      entries.push({ name, abs: child, isDir });
    }
    return { entries };
  } catch (e: any) {
    return { error: e?.message || '无法读取该目录' };
  }
}

function joinAbs(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

async function load(abs: string) {
  if (!abs) return;
  const cached = cache.value[abs];
  if (cached) return;
  loading.value = true;
  error.value = '';
  const r = await fetchDir(abs);
  loading.value = false;
  if ('error' in r) { error.value = r.error; return; }
  cache.value = { ...cache.value, [abs]: r.entries };
}

async function toggleDir(abs: string) {
  const next = new Set(expanded.value);
  if (next.has(abs)) next.delete(abs);
  else { next.add(abs); await load(abs); }
  expanded.value = next;
}

/** 点目录行：就地展开（不跳转）；点「‹ 上一级」才回退一层 */
function onRowClick(row: Row) {
  if (row.loading) return;
  cursorAbs.value = row.abs;
  if (row.kind === 'parent') { goBack(); return; }
  if (row.isDir) { void toggleDir(row.abs); return; }
  emit('close');
  emit('opened', { abs: row.abs, name: row.name });
}

function focusDir(abs: string) {
  const idx = hist.value.findIndex((n) => n.abs === abs);
  if (idx >= 0) { hist.value = hist.value.slice(0, idx + 1); return; }
  // 回溯到祖先：补齐链路
  hist.value = [{ name: props.file?.label || basename(abs), abs: props.file!.abs, isDir: true }];
}

function goBack() {
  if (hist.value.length > 1) hist.value = hist.value.slice(0, -1);
}

function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '');
  return clean.split(/[\\/]/).filter(Boolean).pop() || clean;
}

const rows = computed<Row[]>(() => {
  const cur = current.value;
  if (!cur) return [];
  const out: Row[] = [];
  // 「上一级」回溯行：仅在多级历史时出现
  if (hist.value.length > 1) {
    const parent = hist.value[hist.value.length - 2];
    out.push({ name: `返回 ${parent.name}`, abs: parent.abs, isDir: true, depth: 0, kind: 'parent' });
  }
  const entries = cache.value[cur.abs] || [];
  const q = query.value.trim().toLowerCase();
  const match = (e: Entry) => !q || e.name.toLowerCase().includes(q);
  for (const e of entries) {
    if (!match(e)) continue;
    out.push({ ...e, depth: 0, kind: 'dir' });
    if (e.isDir && expanded.value.has(e.abs)) {
      const kids = cache.value[e.abs];
      if (!kids) {
        out.push({ name: '加载中…', abs: e.abs + '/__loading__', isDir: true, depth: 1, kind: 'dir', loading: true });
      } else {
        for (const k of kids) {
          if (!match(k)) continue;
          out.push({ ...k, depth: 1, kind: 'dir' });
        }
      }
    }
  }
  return out;
});

const hoverRow = computed(() => rows.value.find((r) => r.abs === cursorAbs.value) || null);

function rowMeta(row: Row) {
  if (row.kind === 'parent') return fileMeta('', true);
  return fileMeta(row.name, row.isDir);
}

function openFirst() {
  const first = rows.value.find((r) => !r.loading);
  if (first) onRowClick(first);
}

/** 兜底打开系统文件管理器：优先用后端 /workspace/reveal（跨端一致），失败再退回本地 shell */
async function revealInOs(abs: string) {
  const r = await api.post<{ ok: boolean }>('/workspace/reveal', { path: abs });
  if (!('error' in r)) return;
  const shell = getPlatformAdapter().shell;
  if (!shell) return;
  try {
    await shell.exec('explorer', [abs]);
  } catch { /* 平台不支持时忽略 */ }
}

function revealCurrent() {
  const abs = current.value?.abs;
  if (abs) void revealInOs(abs);
  emit('close');
}

// ===== 键盘导航 =====
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key === 'Backspace' && !query.value) { e.preventDefault(); goBack(); return; }
  const list = rows.value.filter((r) => !r.loading);
  if (!list.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const i = list.findIndex((r) => r.abs === cursorAbs.value);
    const next = e.key === 'ArrowDown'
      ? (i < 0 ? 0 : Math.min(list.length - 1, i + 1))
      : (i <= 0 ? 0 : i - 1);
    const target = list[next];
    if (target) cursorAbs.value = target.abs;
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown, true);
  void nextTick(() => inputRef.value?.focus());
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
</script>

<style scoped>
.bc {
  position: relative;
  width: 340px;
  max-width: 86vw;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  overflow: hidden;
}
.bc-arrow {
  position: absolute; top: -6px; width: 11px; height: 11px;
  margin-left: -5px; transform: rotate(45deg);
  background: var(--color-surface, #fff);
  border-left: 1px solid var(--glass-border, #e7e4dc);
  border-top: 1px solid var(--glass-border, #e7e4dc);
}

/* 回溯链 */
.bc-path {
  display: flex; align-items: center; gap: 2px; flex-wrap: nowrap;
  padding: 7px 10px 6px; overflow: hidden;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface-hover);
}
.bc-path-seg {
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 6px; border: none; border-radius: 5px; background: transparent;
  font-size: 11.5px; font-family: inherit; color: var(--color-text-secondary, #6b6b66);
  cursor: pointer; transition: background 0.12s ease, color 0.12s ease;
}
.bc-path-seg + .bc-path-seg::before {
  content: '›'; position: relative; left: -4px; color: var(--color-text-tertiary, #9c9b94);
}
.bc-path-seg:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-primary, #c2410c); }

.bc-input {
  margin: 8px 10px 6px; height: 26px; padding: 0 8px;
  font-size: 12px; font-family: inherit;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 7px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a); outline: none;
}
.bc-input:focus { border-color: var(--color-primary, #c2410c); }

.bc-list { max-height: 260px; overflow: auto; padding: 2px 4px 6px; }
.bc-row {
  display: flex; align-items: center; gap: 5px;
  height: 25px; padding-right: 8px; border-radius: 6px;
  font-size: 12px; color: var(--color-text, #1a1a1a);
  cursor: pointer; user-select: none; white-space: nowrap;
}
.bc-row:hover, .bc-row.on { background: var(--glass-bg-hover, #f1efe9); }
.bc-row.is-parent { color: var(--color-text-secondary, #6b6b66); font-style: italic; }
.bc-caret { flex-shrink: 0; color: var(--color-text-tertiary, #9c9b94); transition: transform 0.15s ease; }
.bc-caret.on { transform: rotate(90deg); }
.bc-caret-ph { flex: 0 0 12px; }
.bc-parent-ico { flex: 0 0 12px; color: var(--color-text-tertiary, #9c9b94); }
.bc-ico { flex-shrink: 0; font-size: 14px; }
.bc-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bc-check { color: var(--color-primary, #c2410c); flex-shrink: 0; }
.bc-count { flex-shrink: 0; }
.bc-err { font-size: 11px; color: var(--el-color-danger, #ef4444); padding: 3px 0 5px; }
.bc-empty {
  padding: 16px 8px; text-align: center;
  font-size: 11.5px; color: var(--color-text-tertiary, #9c9b94);
}
.bc-empty-lg { padding: 22px 8px; }

.bc-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-top: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface-hover);
}
.bc-foot-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc); background: var(--color-surface, #fff);
  font-size: 11.5px; font-family: inherit; color: var(--color-text-secondary, #6b6b66);
  transition: all 0.15s ease;
}
.bc-foot-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.bc-foot-hint { margin-left: auto; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94); }

.spin { animation: bc-spin 0.9s linear infinite; }
@keyframes bc-spin { to { transform: rotate(360deg); } }
</style>
