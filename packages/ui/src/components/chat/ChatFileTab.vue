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
          <el-tooltip content="定位当前预览文件" placement="bottom" :show-after="400">
            <el-icon class="fs-act" :class="{ off: !store.previewingFile }" :disabled="!store.previewingFile" @click="revealCurrentFile"><Aim /></el-icon>
          </el-tooltip>
          <el-tooltip content="折叠所有目录" placement="bottom" :show-after="400">
            <el-icon class="fs-act" @click="collapseAll"><Fold /></el-icon>
          </el-tooltip>
          <el-tooltip content="刷新" placement="bottom" :show-after="400">
            <el-icon v-if="view === 'explorer'" class="fs-refresh" :class="{ spinning: treeLoading }" @click="loadTree"><Refresh /></el-icon>
          </el-tooltip>
        </div>

        <!-- 资源管理器：目录树（按目录层级懒加载：展开目录才加载其子项） -->
        <div v-if="view === 'explorer'" class="fs-body">
          <el-input
            v-model="filterText"
            size="small"
            placeholder="过滤文件名"
            clearable
            :prefix-icon="Search"
            class="fs-filter"
          />

          <!-- 新建条目输入行 -->
          <div v-if="creating" class="fs-create">
            <el-icon :size="13" class="fs-create-icon">
              <Folder v-if="creating.isDir" /><Document v-else />
            </el-icon>
            <input
              ref="createInputRef"
              v-model="creating.name"
              class="fs-create-input"
              :placeholder="creating.isDir ? '文件夹名称' : '文件名（含后缀）'"
              @keydown.enter="submitCreate"
              @keydown.esc="creating = null"
              @blur="submitCreate"
            />
          </div>

          <div ref="treeRef" class="fs-tree" @contextmenu.prevent="onBgMenu($event)">
            <div
              v-for="row in explorerRows"
              v-show="rowMatch(row)"
              :key="row.relPath"
              class="fs-row"
              :class="{ 'is-file': !row.isDir, active: activeRel === row.relPath }"
              :style="{ paddingLeft: 6 + (row.depth * 13) + 'px' }"
              :title="row.relPath"
              @click="onRowClick(row)"
              @contextmenu.prevent.stop="onRowMenu($event, row)"
            >
              <el-icon v-if="row.isDir" class="fs-caret" :class="{ expanded: expandedDirs.has(row.relPath) }" @click.stop="toggleDir(row.relPath)">
                <CaretRight />
              </el-icon>
              <span v-else class="fs-caret-placeholder"></span>
              <el-icon v-if="row.loading" class="fs-file-icon fs-spin"><Loading /></el-icon>
              <el-icon v-else class="fs-file-icon" :style="{ color: fileMeta(row.name).color }">
                <component :is="row.isDir ? Folder : fileMeta(row.name).icon" />
              </el-icon>
              <span class="fs-name" :title="row.relPath">{{ row.name }}</span>
            </div>
            <div v-if="treeLoading" class="fs-hint">加载中…</div>
            <div v-else-if="treeError" class="fs-hint fs-hint-err">{{ treeError }}</div>
            <div v-else-if="rootLoaded && explorerRows.length === 0" class="fs-hint">目录为空</div>
          </div>
        </div>

        <!-- 搜索：文件名 + 内容（共享 FileSearchPanel） -->
        <FileSearchPanel
          v-else-if="view === 'search'"
          ref="fileSearchRef"
          mode="chat"
          :dir="activeDir"
          v-model:scope="searchScope"
        />

        <!-- Git：复用 Git 面板（目录跟随空间 dirPath 同步的 workspaceDir） -->
        <div v-else class="fs-body fs-git-body">
          <ChatGitPanel />
        </div>
      </template>
    </div>

    <!-- 行右键菜单 -->
    <ul v-if="rowMenu" class="fs-menu" :style="{ top: rowMenu.y + 'px', left: rowMenu.x + 'px' }" @click.stop>
      <li v-if="rowMenu.row.isDir" @click="menuSearchHere"><el-icon><Search /></el-icon>在此文件夹中搜索</li>
      <li @click="menuNewFile"><el-icon><Document /></el-icon>新建文件</li>
      <li @click="menuNewFolder"><el-icon><Folder /></el-icon>新建文件夹</li>
      <li @click="menuOpen">{{ rowMenu.row.isDir ? '打开 / 展开' : '打开' }}</li>
      <li @click="menuCopyPath"><el-icon><DocumentCopy /></el-icon>复制路径</li>
      <li @click="menuReveal"><el-icon><FolderOpened /></el-icon>在文件管理器显示</li>
      <li class="danger" @click="menuDelete"><el-icon><Delete /></el-icon>删除</li>
    </ul>

    <!-- 空白区右键菜单 -->
    <ul v-if="bgMenu" class="fs-menu" :style="{ top: bgMenu.y + 'px', left: bgMenu.x + 'px' }" @click.stop>
      <li @click="bgNewFile"><el-icon><Document /></el-icon>新建文件</li>
      <li @click="bgNewFolder"><el-icon><Folder /></el-icon>新建文件夹</li>
      <li @click="bgCollapse"><el-icon><Fold /></el-icon>折叠所有目录</li>
      <li @click="bgRefresh"><el-icon><Refresh /></el-icon>刷新</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  FolderOpened, Folder, Search, CaretRight, Refresh, Share, Loading,
  Picture, Document, Tickets, Memo, Box, VideoCamera, Headset, Files,
  DocumentCopy, Delete, Fold, Aim,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';
import { useSpaceStore } from '../../stores/space';
import { useSettingsStore } from '../../stores/settings';
import ChatGitPanel from './ChatGitPanel.vue';
import FileSearchPanel from '../code/panels/FileSearchPanel.vue';

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
interface TreeRow extends TreeEntry { depth: number; loading?: boolean }
/** 某个目录（按父级 relPath 索引，''=根）已加载的子项 */
interface LoadedDir { entries: TreeEntry[]; hasMore: boolean; loading: boolean; done: boolean }

const TREE_PAGE_SIZE = 2000;
const DIR_MAX_FILES = 50000; // 单目录拉取安全上限，避免极端超大目录卡死

// 按「父目录 relPath」缓存已加载子项；展开目录时按需加载，不预递归整棵树
const loaded = ref<Record<string, LoadedDir>>({});
const rootLoaded = ref(false);
const treeLoading = ref(false); // 根目录加载中
const treeError = ref('');
const fullTreeLoading = ref(false); // 搜索/过滤时全树扫描中
const expandedDirs = ref<Set<string>>(new Set());
const filterText = ref('');
const activeRel = ref(''); // 当前定位高亮行
const treeRef = ref<HTMLElement | null>(null);

function setLoaded(key: string, v: LoadedDir) {
  loaded.value = { ...loaded.value, [key]: v };
}
const enc = (s: string) => encodeURIComponent(s);

/** 加载某个目录的子项（一次性拉全该目录，上限 DIR_MAX_FILES；已完整加载则缓存命中） */
async function loadDir(parentRel: string) {
  const prev = loaded.value[parentRel];
  if (prev?.loading) return;
  if (prev?.done && !prev.hasMore) return;
  setLoaded(parentRel, { entries: prev?.entries ?? [], hasMore: prev?.hasMore ?? false, loading: true, done: false });
  try {
    let collected: TreeEntry[] = prev?.entries ?? [];
    let off = collected.length;
    let hasMore = false;
    do {
      const r = await api.get<{ entries: TreeEntry[]; hasMore: boolean }>(
        `/workspace/tree?dir=${enc(activeDir.value)}&sub=${enc(parentRel)}&recursive=0&offset=${off}&limit=${TREE_PAGE_SIZE}`,
      );
      if (!('data' in r)) break;
      const page = r.data.entries || [];
      collected = off === 0 ? page : collected.concat(page);
      hasMore = r.data.hasMore;
      off += page.length;
    } while (hasMore && off < DIR_MAX_FILES);
    setLoaded(parentRel, { entries: collected, hasMore: hasMore && off < DIR_MAX_FILES, loading: false, done: true });
  } catch {
    setLoaded(parentRel, { entries: prev?.entries ?? [], hasMore: false, loading: false, done: true });
  }
}

/** 根目录加载：只加载根的直接子项，默认全部折叠；点开某目录才加载其下一级 */
async function loadTree() {
  if (!activeDir.value) return;
  treeLoading.value = true;
  treeError.value = '';
  rootLoaded.value = false;
  loaded.value = {};
  expandedDirs.value = new Set();
  activeRel.value = '';
  try {
    await loadDir('');
    rootLoaded.value = true;
  } catch (e: any) {
    treeError.value = e?.message || '加载失败';
  } finally {
    treeLoading.value = false;
  }
}

/** 搜索/过滤需要覆盖全部文件：递归加载整棵树并全部展开 */
async function ensureFullTree() {
  if (fullTreeLoading.value) return;
  if (Object.keys(loaded.value).length === 0) await loadTree();
  fullTreeLoading.value = true;
  try {
    const queue: string[] = [];
    const next = new Set(expandedDirs.value);
    const ld0 = loaded.value[''];
    if (ld0) for (const e of ld0.entries) if (e.isDir) { next.add(e.relPath); queue.push(e.relPath); }
    while (queue.length) {
      const rel = queue.shift()!;
      await loadDir(rel);
      const ld = loaded.value[rel];
      if (ld) for (const e of ld.entries) if (e.isDir && !next.has(e.relPath)) { next.add(e.relPath); queue.push(e.relPath); }
    }
    expandedDirs.value = next;
  } finally {
    fullTreeLoading.value = false;
  }
}

function toggleDir(relPath: string) {
  const next = new Set(expandedDirs.value);
  if (next.has(relPath)) next.delete(relPath);
  else { next.add(relPath); loadDir(relPath); }
  expandedDirs.value = next;
}

/** 一键折叠所有目录 */
function collapseAll() {
  expandedDirs.value = new Set();
}

/** 展开感知的目录树行（仅展开目录的子项会出现） */
const explorerRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const walk = (parentRel: string, depth: number) => {
    const ld = loaded.value[parentRel];
    if (!ld) return;
    for (const e of ld.entries) {
      rows.push({ ...e, depth });
      if (e.isDir && expandedDirs.value.has(e.relPath)) {
        const child = loaded.value[e.relPath];
        if (!child || !child.done) {
          rows.push({ name: '加载中…', relPath: e.relPath + '/__loading__', isDir: true, size: 0, depth: depth + 1, loading: true });
        } else {
          walk(e.relPath, depth + 1);
        }
      }
    }
  };
  walk('', 0);
  return rows;
});

function rowMatch(row: TreeRow): boolean {
  if (row.loading) return true;
  const q = filterText.value.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q);
}

function onRowClick(row: TreeRow) {
  if (row.loading) return;
  if (row.isDir) toggleDir(row.relPath);
  else { activeRel.value = row.relPath; openFile(row); }
}

// 目录切换：重置并重新加载根目录
watch(activeDir, () => {
  expandedDirs.value = new Set();
  filterText.value = '';
  activeRel.value = '';
  loadTree();
}, { immediate: true });

// 对话有新消息时刷新根目录（智能体可能产出了新文件）
watch(() => store.currentMessages.length, () => {
  if (view.value === 'explorer' && !treeLoading.value) loadTree();
});

// 过滤：触发全树扫描后再匹配；清空则收回为根层级（全部折叠）
watch([filterText], () => {
  if (filterText.value.trim()) {
    ensureFullTree();
  } else {
    expandedDirs.value = new Set();
  }
});

/** 点击文件 → 右侧预览面板打开文件 tab */
function openFile(row: { name: string; relPath: string }) {
  const sep = activeDir.value.includes('\\') && !activeDir.value.includes('/') ? '\\' : '/';
  const base = activeDir.value.replace(/[\\/]+$/, '');
  const path = base + sep + row.relPath.split('/').join(sep);
  store.openTab({ kind: 'file', name: row.name, path });
  store.rightPanelOpen = true;
}

function joinAbs(rel: string): string {
  const sep = activeDir.value.includes('\\') && !activeDir.value.includes('/') ? '\\' : '/';
  const base = activeDir.value.replace(/[\\/]+$/, '');
  return base + sep + rel.split('/').join(sep);
}

// ===== 新建文件 / 文件夹（右击，不在头部放图标按钮）=====
interface Creating { parentRel: string; isDir: boolean; name: string }
const creating = ref<Creating | null>(null);
const createInputRef = ref<HTMLInputElement | null>(null);

function startCreate(isDir: boolean, parentRel = '') {
  if (!activeDir.value) return;
  creating.value = { parentRel, isDir, name: '' };
  void nextTick(() => createInputRef.value?.focus());
}
async function submitCreate() {
  const c = creating.value;
  if (!c) return;
  const name = c.name.trim();
  creating.value = null;
  if (!name) return;
  const target = joinAbs(c.parentRel ? `${c.parentRel}/${name}` : name);
  const r = c.isDir
    ? await api.post<{ ok: boolean }>('/workspace/mkdir', { path: target })
    : await api.post<{ ok: boolean }>('/workspace/create', { path: target, isDir: false });
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success(`已创建 ${name}`);
  await loadTree();
  if (!c.isDir) openFile({ name, relPath: c.parentRel ? `${c.parentRel}/${name}` : name });
}

// ===== 定位当前预览文件：在树中展开祖先、高亮并滚动到可视区 =====
async function revealCurrentFile() {
  const pf = store.previewingFile;
  if (!pf?.path || !activeDir.value) return;
  const base = activeDir.value.replace(/[\\/]+$/, '');
  if (!pf.path.startsWith(base)) return;
  let rel = pf.path.slice(base.length).replace(/^[\\/]+/, '');
  if (!rel) return;
  rel = rel.split(/[\\/]/).join('/');
  if (view.value !== 'explorer') view.value = 'explorer';
  const next = new Set(expandedDirs.value);
  const parts = rel.split('/');
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? acc + '/' + parts[i] : parts[i];
    next.add(acc);
    await loadDir(acc);
  }
  expandedDirs.value = next;
  activeRel.value = rel;
  await nextTick();
  treeRef.value?.querySelector('.fs-row.active')?.scrollIntoView({ block: 'center' });
}

// ===== 右键菜单 =====
interface RowMenu { x: number; y: number; row: TreeRow }
const rowMenu = ref<RowMenu | null>(null);
const bgMenu = ref<{ x: number; y: number } | null>(null);

function parentRelOf(row: TreeRow): string {
  if (row.isDir) return row.relPath;
  const idx = row.relPath.lastIndexOf('/');
  return idx > 0 ? row.relPath.slice(0, idx) : '';
}
function onRowMenu(e: MouseEvent, row: TreeRow) {
  if (row.loading) return;
  bgMenu.value = null;
  rowMenu.value = { x: e.clientX, y: e.clientY, row };
}
function onBgMenu(e: MouseEvent) {
  if (!activeDir.value) return;
  rowMenu.value = null;
  bgMenu.value = { x: e.clientX, y: e.clientY };
}
function closeMenus() { rowMenu.value = null; bgMenu.value = null; }

function scopeSearchFrom(rel: string, label: string) {
  searchScope.value = { rel, label };
  view.value = 'search';
  void nextTick(() => fileSearchRef.value?.focusQuery());
}

// ----- 行菜单动作 -----
function menuSearchHere() {
  const m = rowMenu.value; if (!m) return;
  closeMenus();
  scopeSearchFrom(m.row.relPath, m.row.name);
}
function menuNewFile() { const m = rowMenu.value; if (!m) return; closeMenus(); startCreate(false, parentRelOf(m.row)); }
function menuNewFolder() { const m = rowMenu.value; if (!m) return; closeMenus(); startCreate(true, parentRelOf(m.row)); }
function menuOpen() {
  const m = rowMenu.value; if (!m) return;
  closeMenus();
  if (m.row.isDir) toggleDir(m.row.relPath);
  else { activeRel.value = m.row.relPath; openFile(m.row); }
}
async function menuCopyPath() {
  const m = rowMenu.value; if (!m) return;
  closeMenus();
  try { await navigator.clipboard.writeText(joinAbs(m.row.relPath)); ElMessage.success('路径已复制'); }
  catch { ElMessage.warning('复制失败：' + joinAbs(m.row.relPath)); }
}
function menuReveal() { const m = rowMenu.value; if (!m) return; closeMenus(); void api.post('/workspace/reveal', { path: joinAbs(m.row.relPath) }); }
async function menuDelete() {
  const m = rowMenu.value; if (!m) return;
  closeMenus();
  try {
    await ElMessageBox.confirm(
      `确定删除「${m.row.name}」？${m.row.isDir ? '（含目录内全部内容，不可恢复）' : '（不可恢复）'}`,
      '删除确认', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  const r = await api.post<{ ok: boolean }>('/workspace/delete', { path: joinAbs(m.row.relPath) });
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('已删除');
  await loadTree();
}

// ----- 空白区菜单动作 -----
function bgNewFile() { closeMenus(); startCreate(false, ''); }
function bgNewFolder() { closeMenus(); startCreate(true, ''); }
function bgCollapse() { closeMenus(); collapseAll(); }
function bgRefresh() { closeMenus(); void loadTree(); }

// ===== 搜索范围（联动搜索面板） =====
const searchScope = ref<{ rel: string; label: string } | null>(null);
const fileSearchRef = ref<InstanceType<typeof FileSearchPanel> | null>(null);

function onDocMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.fs-menu')) return;
  closeMenus();
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));

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

.fs-act {
  flex-shrink: 0; cursor: pointer; color: var(--el-text-color-secondary, #64748b);
  transition: color 0.15s ease;
}
.fs-act:hover { color: var(--color-primary, #7c3aed); }
.fs-act.off { opacity: 0.35; cursor: default; }
.fs-act.off:hover { color: var(--el-text-color-secondary, #64748b); }

.fs-refresh {
  flex-shrink: 0;
  cursor: pointer;
  color: var(--el-text-color-secondary, #64748b);
}
.fs-refresh:hover { color: var(--color-primary, #7c3aed); }
.fs-refresh.spinning { animation: fs-spin 0.9s linear infinite; }
.fs-spin { animation: fs-spin 0.9s linear infinite; }
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

.fs-create {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 4px; flex-shrink: 0;
}
.fs-create-icon { color: var(--el-text-color-secondary, #64748b); flex-shrink: 0; }
.fs-create-input {
  flex: 1; min-width: 0; height: 22px; padding: 0 6px;
  font-size: 12px; font-family: inherit;
  border: 1px solid var(--color-primary, #7c3aed); border-radius: 5px;
  background: var(--el-color-white, #fff); color: var(--el-text-color-primary, #1e293b); outline: none;
}

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
.fs-row.active { background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent); color: var(--color-primary, #7c3aed); }

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

/* ===== 右键菜单 ===== */
.fs-menu {
  position: fixed; z-index: 3000; min-width: 176px;
  margin: 0; padding: 4px; list-style: none;
  border-radius: 10px;
  background: var(--el-color-white, #fff);
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.12));
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
}
.fs-menu li {
  display: flex; align-items: center; gap: 7px;
  height: 28px; padding: 0 10px; font-size: 12px; font-family: inherit;
  border-radius: 6px; color: var(--el-text-color-primary, #1e293b); cursor: pointer;
}
.fs-menu li:hover { background: var(--glass-bg-hover, rgba(15, 23, 42, 0.06)); }
.fs-menu li.danger { color: var(--el-color-danger, #ef4444); }
.fs-menu li.danger:hover { background: color-mix(in srgb, var(--el-color-danger) 10%, transparent); }
</style>
