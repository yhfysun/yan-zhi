<template>
  <!-- 左侧栏「文件」tab 内容：竖排视图按钮（资源管理器/搜索/Git）+ 面板，对齐 VSCode 活动条 -->
  <div class="file-tab">
    <!-- 竖排图标条 -->
    <div class="fs-activity">
      <el-tooltip content="资源管理器" placement="right" :show-after="300">
        <button
          type="button"
          class="fs-act-btn"
          :class="{ active: view === 'explorer' }"
          @click="view = 'explorer'"
        >
          <el-icon :size="17"><FolderOpened /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="搜索" placement="right" :show-after="300">
        <button
          type="button"
          class="fs-act-btn"
          :class="{ active: view === 'search' }"
          @click="view = 'search'"
        >
          <el-icon :size="17"><Search /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="Git" placement="right" :show-after="300">
        <button
          type="button"
          class="fs-act-btn"
          :class="{ active: view === 'git' }"
          @click="view = 'git'"
        >
          <el-icon :size="17"><Share /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- 内容面板 -->
    <div class="fs-panel">
      <!-- 未绑定目录：提示 -->
      <div v-if="!activeDir" class="fs-empty">
        <el-icon :size="22"><Folder /></el-icon>
        <p>当前会话未绑定带目录的空间</p>
        <p class="fs-empty-sub">给空间设置「目录」后，这里可浏览空间内的文件、搜索和查看 Git</p>
      </div>

      <template v-else>
        <div class="fs-panel-head">
          <span class="fs-panel-title">{{ activeSpace?.name || '空间' }}</span>
          <span class="fs-panel-root" :title="activeDir">{{ rootName }}</span>
          <el-icon v-if="view === 'explorer'" class="fs-refresh" :class="{ spinning: treeLoading }" @click="loadTree"><Refresh /></el-icon>
        </div>

        <!-- 资源管理器：目录树 -->
        <div v-if="view === 'explorer'" class="fs-body">
          <el-input
            v-model="filterText"
            size="small"
            placeholder="过滤文件名"
            clearable
            :prefix-icon="Search"
            class="fs-filter"
          />
          <div class="fs-tree" @scroll="onTreeScroll">
            <template v-for="node in treeNodes" :key="node.relPath || '__root__'">
              <div
                v-for="row in flattenTree(node)"
                v-show="rowMatch(row)"
                :key="row.relPath"
                class="fs-row"
                :style="{ paddingLeft: 6 + (row.depth * 13) + 'px' }"
                :class="{ 'is-file': !row.isDir }"
                @click="onRowClick(row)"
                @contextmenu.prevent
              >
                <el-icon v-if="row.isDir" class="fs-caret" :class="{ expanded: expandedDirs.has(row.relPath) }" @click.stop="toggleDir(row.relPath)">
                  <CaretRight />
                </el-icon>
                <span v-else class="fs-caret-placeholder"></span>
                <el-icon class="fs-file-icon" :style="{ color: fileMeta(row.name).color }">
                  <component :is="row.isDir ? Folder : fileMeta(row.name).icon" />
                </el-icon>
                <span class="fs-name" :title="row.relPath">{{ row.name }}</span>
              </div>
            </template>
            <div v-if="treeLoading" class="fs-hint">加载中…</div>
            <div v-else-if="treeError" class="fs-hint fs-hint-err">{{ treeError }}</div>
            <div v-else-if="treeEntries.length === 0" class="fs-hint">目录为空</div>
            <div v-else-if="loadingMore" class="fs-hint">加载更多…</div>
          </div>
        </div>

        <!-- 搜索：按文件名匹配 -->
        <div v-else-if="view === 'search'" class="fs-body">
          <el-input
            v-model="searchText"
            size="small"
            placeholder="搜索空间内文件"
            clearable
            :prefix-icon="Search"
            class="fs-filter"
          />
          <div class="fs-tree">
            <template v-if="searchText.trim()">
              <div
                v-for="row in searchResults.slice(0, 200)"
                :key="row.relPath"
                class="fs-row is-file"
                @click="openFile(row)"
              >
                <span class="fs-caret-placeholder"></span>
                <el-icon class="fs-file-icon" :style="{ color: fileMeta(row.name).color }">
                  <component :is="fileMeta(row.name).icon" />
                </el-icon>
                <span class="fs-name" :title="row.relPath">{{ row.name }}</span>
              </div>
              <div v-if="searchResults.length === 0" class="fs-hint">无匹配文件</div>
            </template>
            <div v-else class="fs-hint">输入关键词，按文件名搜索「{{ rootName }}」</div>
          </div>
        </div>

        <!-- Git：复用 Git 面板（目录跟随空间 dirPath 同步的 workspaceDir） -->
        <div v-else class="fs-body fs-git-body">
          <ChatGitPanel />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  FolderOpened, Folder, Search, CaretRight, Refresh, Share,
  Picture, Document, Tickets, Memo, Box, VideoCamera, Headset, Files,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';
import { api } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';
import { useSpaceStore } from '../../stores/space';
import { useSettingsStore } from '../../stores/settings';
import ChatGitPanel from './ChatGitPanel.vue';

const { store, currentConv } = useChat();
const spaceStore = useSpaceStore();
const settingsStore = useSettingsStore();

const view = ref<'explorer' | 'search' | 'git'>('explorer');

/** 当前生效空间：优先当前会话所属空间，其次全局选中的空间 */
const activeSpace = computed(() => {
  const convSpaceId = currentConv.value?.spaceId;
  if (convSpaceId) return spaceStore.spaces.find((s) => s.id === convSpaceId) || null;
  return spaceStore.currentSpace;
});
const activeDir = computed(() => (activeSpace.value?.dirPath || '').trim());
const rootName = computed(() => {
  const p = activeDir.value.replace(/[\\/]+$/, '');
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
});

// ===== 空间目录 → workspaceDir 同步：让 Git 面板 / 文件工具指向空间目录 =====
watch(
  activeDir,
  async (dir) => {
    if (!dir || settingsStore.settings.workspaceDir === dir) return;
    await settingsStore.update({ workspaceDir: dir });
    try { await api.post('/workspace/dir', { dir }); } catch { /* ignore */ }
  },
  { immediate: true },
);

// ===== 目录树数据 =====
interface TreeEntry { name: string; relPath: string; isDir: boolean; size: number }
interface TreeRow extends TreeEntry { depth: number }
const treeEntries = ref<TreeEntry[]>([]);
const treeLoading = ref(false);
const treeError = ref('');
const treeHasMore = ref(false);
const loadingMore = ref(false);
const TREE_PAGE_SIZE = 2000;
const expandedDirs = ref<Set<string>>(new Set());
const filterText = ref('');
const searchText = ref('');

async function loadTree() {
  if (!activeDir.value) return;
  treeLoading.value = true;
  treeError.value = '';
  try {
    const r = await api.get<{ root: string; entries: TreeEntry[]; hasMore: boolean }>(
      `/workspace/tree?dir=${encodeURIComponent(activeDir.value)}&offset=0&limit=${TREE_PAGE_SIZE}`,
    );
    if ('data' in r) {
      treeEntries.value = r.data.entries || [];
      treeHasMore.value = !!r.data.hasMore;
      // 默认展开顶层目录
      const next = new Set(expandedDirs.value);
      for (const e of treeEntries.value) {
        if (e.isDir && !e.relPath.includes('/')) next.add(e.relPath);
      }
      expandedDirs.value = next;
    } else {
      treeEntries.value = [];
      treeHasMore.value = false;
      treeError.value = (r as any).error || '加载失败';
    }
  } catch (e: any) {
    treeEntries.value = [];
    treeHasMore.value = false;
    treeError.value = e?.message || '加载失败';
  } finally {
    treeLoading.value = false;
  }
}

/** 滚动触底追加下一页（DFS 顺序稳定，offset = 已加载条数） */
async function loadMore() {
  if (loadingMore.value || treeLoading.value || !treeHasMore.value || !activeDir.value) return;
  loadingMore.value = true;
  try {
    const r = await api.get<{ root: string; entries: TreeEntry[]; hasMore: boolean }>(
      `/workspace/tree?dir=${encodeURIComponent(activeDir.value)}&offset=${treeEntries.value.length}&limit=${TREE_PAGE_SIZE}`,
    );
    if ('data' in r) {
      treeEntries.value = treeEntries.value.concat(r.data.entries || []);
      treeHasMore.value = !!r.data.hasMore;
    }
  } catch { /* 静默：下一轮滚动重试 */ }
  finally { loadingMore.value = false; }
}

function onTreeScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) loadMore();
}

// 搜索按文件名匹配需覆盖全部文件：还有未加载页时静默拉全
watch(searchText, (q) => {
  if (q.trim() && treeHasMore.value && !treeLoading.value) {
    (async () => { while (treeHasMore.value) { await loadMore(); if (loadingMore.value) break; } })();
  }
});

// 目录切换 / 目录内容可能被智能体改动：重新拉取
watch(activeDir, () => {
  expandedDirs.value = new Set();
  filterText.value = '';
  searchText.value = '';
  loadTree();
}, { immediate: true });
watch(() => store.currentMessages.length, () => {
  // 对话有新消息时刷新目录（智能体可能产出了新文件）；轻量接口，忽略失败
  if (view.value === 'explorer' && !treeLoading.value) loadTree();
});

function toggleDir(relPath: string) {
  const next = new Set(expandedDirs.value);
  if (next.has(relPath)) next.delete(relPath);
  else next.add(relPath);
  expandedDirs.value = next;
}

interface TreeNode extends TreeEntry { children: TreeNode[] }
/** 扁平 entries → 树，再展开成带缩进层级的行（目录折叠靠 expandedDirs 过滤） */
const treeNodes = computed<TreeNode[]>(() => {
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();
  for (const e of treeEntries.value) {
    byPath.set(e.relPath, { ...e, children: [] });
  }
  for (const e of treeEntries.value) {
    const node = byPath.get(e.relPath)!;
    const idx = e.relPath.lastIndexOf('/');
    if (idx < 0) roots.push(node);
    else {
      const parent = byPath.get(e.relPath.slice(0, idx));
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
});

function flattenTree(root: TreeNode): TreeRow[] {
  const rows: TreeRow[] = [];
  const forceExpand = !!filterText.value.trim();
  const walk = (node: TreeNode, depth: number) => {
    rows.push({ ...node, depth });
    if (node.isDir && (forceExpand || expandedDirs.value.has(node.relPath))) {
      for (const c of node.children) walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

function rowMatch(row: TreeRow): boolean {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return true;
  // 过滤时强制展开路径上的父目录：只要自身或任一子孙匹配就显示
  if (row.name.toLowerCase().includes(q)) return true;
  if (!row.isDir) return false;
  return treeEntries.value.some((e) => e.relPath.startsWith(row.relPath + '/') && e.name.toLowerCase().includes(q));
}

const searchResults = computed<TreeEntry[]>(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return [];
  return treeEntries.value.filter((e) => !e.isDir && e.name.toLowerCase().includes(q));
});

function onRowClick(row: TreeRow) {
  if (row.isDir) toggleDir(row.relPath);
  else openFile(row);
}

/** 点击文件 → 右侧预览面板打开文件 tab */
function openFile(row: { name: string; relPath: string }) {
  const sep = activeDir.value.includes('\\') && !activeDir.value.includes('/') ? '\\' : '/';
  const base = activeDir.value.replace(/[\\/]+$/, '');
  const path = base + sep + row.relPath.split('/').join(sep);
  store.openTab({ kind: 'file', name: row.name, path });
  store.rightPanelOpen = true;
}

// ===== 文件类型图标/着色（与输入区 @ 引用同一套配色） =====
const FILE_TYPE_META: Record<string, { icon: Component; color: string }> = {
  image: { icon: Picture, color: '#22c55e' },
  code: { icon: Document, color: '#3b82f6' },
  data: { icon: Tickets, color: '#10b981' },
  doc: { icon: Memo, color: '#f59e0b' },
  archive: { icon: Box, color: '#8b5cf6' },
  video: { icon: VideoCamera, color: '#ef4444' },
  audio: { icon: Headset, color: '#ec4899' },
  other: { icon: Files, color: '#94a3b8' },
};
const EXT_GROUP: Record<string, string> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', vue: 'code', py: 'code', java: 'code', go: 'code', rs: 'code',
  c: 'code', cpp: 'code', h: 'code', html: 'code', css: 'code', scss: 'code', less: 'code', json: 'code',
  xml: 'code', yaml: 'code', yml: 'code', sh: 'code', sql: 'code', php: 'code', rb: 'code', kt: 'code', swift: 'code',
  csv: 'data', xlsx: 'data', xls: 'data',
  md: 'doc', txt: 'doc', pdf: 'doc', doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', rtf: 'doc', log: 'doc',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
};
function fileMeta(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_TYPE_META[EXT_GROUP[ext] || 'other'];
}
</script>

<style scoped>
.file-tab {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* 竖排图标条（对齐 VSCode activity bar） */
.fs-activity {
  flex: 0 0 36px;
  width: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  border-right: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  background: var(--el-fill-color-lighter, #f8fafc);
}

.fs-act-btn {
  all: unset;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary, #64748b);
  transition: background 0.15s ease, color 0.15s ease;
}

.fs-act-btn:hover {
  background: var(--glass-bg-hover, rgba(15, 23, 42, 0.06));
  color: var(--el-text-color-primary, #1e293b);
}

.fs-act-btn.active {
  color: var(--color-primary, #7c3aed);
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}

/* 内容面板 */
.fs-panel {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.fs-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: var(--el-text-color-secondary, #94a3b8);
  text-align: center;
  font-size: 12px;
}
.fs-empty p { margin: 0; }
.fs-empty-sub { font-size: 11px; opacity: 0.8; line-height: 1.5; }

.fs-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  min-height: 35px;
}

.fs-panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1e293b);
  flex-shrink: 0;
}

.fs-panel-root {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fs-refresh {
  flex-shrink: 0;
  cursor: pointer;
  color: var(--el-text-color-secondary, #64748b);
}
.fs-refresh:hover { color: var(--color-primary, #7c3aed); }
.fs-refresh.spinning { animation: fs-spin 0.9s linear infinite; }
@keyframes fs-spin { to { transform: rotate(360deg); } }

.fs-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 8px;
}

.fs-filter { flex-shrink: 0; }

.fs-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.fs-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding-right: 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-regular, #475569);
  white-space: nowrap;
  user-select: none;
}

.fs-row:hover { background: var(--glass-bg-hover, rgba(15, 23, 42, 0.05)); }
.fs-row.is-file:hover .fs-name { color: var(--color-primary, #7c3aed); }

.fs-caret {
  flex-shrink: 0;
  color: var(--el-text-color-secondary, #94a3b8);
  transition: transform 0.15s ease;
}
.fs-caret.expanded { transform: rotate(90deg); }
.fs-caret-placeholder { flex: 0 0 14px; }

.fs-file-icon { flex-shrink: 0; font-size: 14px; }

.fs-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-hint {
  padding: 10px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #94a3b8);
  text-align: center;
}
.fs-hint-err { color: #ef4444; }
.fs-hint-warn { color: #f59e0b; }

.fs-git-body { padding: 0; }
</style>
