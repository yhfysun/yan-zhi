<!--
  WorkspaceFileTree.vue — 办公工作台左栏：工作区文件树（2026-11-02，P2）

  数据走 /api/workspace/tree（逐级懒加载），CRUD 走 /api/workspace 的 create / rename / copy / delete，
  与 /api/office/create（docx/xlsx/pptx）。右键菜单照原型：
  新建文档/表格/演示、重命名、复制一份、删除。
-->
<template>
  <aside class="ws-tree" ref="treeEl" tabindex="0" @keydown="onTreeKeydown">
    <header class="ws-head">
      <div class="ws-head-text">
        <span class="ws-title">工作区</span>
        <span class="ws-sub" :title="rootDir">{{ rootName }}</span>
      </div>
      <div class="ws-head-actions">
        <button class="ws-icon-btn" type="button" title="搜索文件名或内容" @click="toggleSearch">
          <el-icon :size="14"><Search /></el-icon>
        </button>
        <el-dropdown trigger="click" :disabled="!rootDir" @command="onCreatePick">
          <button class="ws-icon-btn" type="button" title="新建文档 / 表格 / 演示">
            <el-icon :size="14"><Plus /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="doc">新建文档（.docx）</el-dropdown-item>
              <el-dropdown-item command="sheet">新建表格（.xlsx）</el-dropdown-item>
              <el-dropdown-item command="slides">新建演示（.pptx）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button class="ws-icon-btn" type="button" title="刷新" :disabled="!rootDir || loading" @click="refresh()">
          <el-icon :size="14" :class="{ spin: loading }"><Refresh /></el-icon>
        </button>
      </div>
    </header>

    <!-- 搜索：输入即搜（按文件名或内容），结果列表替代树；点结果定位并退出搜索 -->
    <div v-if="searchOpen" class="ws-search">
      <input
        ref="searchInputEl"
        v-model="searchQuery"
        class="ws-search-input"
        spellcheck="false"
        placeholder="搜索文件名或内容…"
        @keydown.esc.prevent="closeSearch"
        @keydown.enter.prevent="runSearch"
      />
      <button v-if="searchQuery" class="ws-search-clear" type="button" title="清空" @click="searchQuery = ''">
        <el-icon :size="12"><Close /></el-icon>
      </button>
      <button class="ws-search-close" type="button" title="关闭搜索" @click="closeSearch">取消</button>
    </div>
    <div v-if="uploading" class="ws-uploading">正在上传 {{ uploadCount }} 个文件…</div>

    <div
      class="ws-body"
      :class="{ 'is-drop-root': dropTarget && dropTarget === rootDir.replace(/[\\/]+$/, '') }"
      @contextmenu.prevent="openBlankMenu"
      @dragover.prevent="onDragOver($event, rootDir)"
      @drop.prevent="onDrop($event, rootDir)"
    >
      <!-- 搜索态：结果列表替代树 -->
      <template v-if="isSearching">
        <div v-if="searching" class="ws-empty">正在搜索…</div>
        <div v-else-if="searchError" class="ws-empty">{{ searchError }}</div>
        <div v-else-if="searchHits.length === 0" class="ws-empty">没有匹配结果</div>
        <div
          v-for="(hit, i) in searchHits"
          :key="hit.file + ':' + hit.line + ':' + i"
          class="ws-hit-row"
          :title="hit.file"
          @click="openHit(hit)"
        >
          <span class="ws-ficon">{{ iconTextByName(hit.file) }}</span>
          <span class="ws-hit-main">
            <span class="ws-hit-name">{{ baseName(hit.file) }}<span class="ws-hit-line">:{{ hit.line }}</span></span>
            <span class="ws-hit-rel">{{ hit.relPath }}</span>
            <span class="ws-hit-preview">{{ hit.preview }}</span>
          </span>
        </div>
        <div v-if="!searching && searchHits.length" class="ws-hit-foot">
          共 {{ searchHits.length }} 条{{ searchTruncated ? '（已截断）' : '' }}
        </div>
      </template>

      <template v-else>
        <div v-if="!rootDir" class="ws-empty">未设置工作目录</div>
        <div v-else-if="error" class="ws-empty">{{ error }}</div>
        <div v-else-if="loading && flatNodes.length === 0" class="ws-empty">正在读取目录…</div>
        <div v-else-if="flatNodes.length === 0" class="ws-empty">目录是空的，从右上角新建文档开始</div>

        <div
          v-for="node in flatNodes"
          :key="node.path"
          class="ws-row"
          :class="{
            'is-dir': node.isDir,
            'is-active': node.path === selectedPath,
            'is-multi': selectedPaths.includes(node.path),
            dragging: dragging?.path === node.path,
            'drop-target': dropTarget && dropTarget === (node.isDir ? node.path : dirOfNode(node)),
          }"
          :style="{ paddingLeft: 8 + node.depth * 14 + 'px' }"
          draggable="true"
          @click="onRowClick(node, $event)"
          @dblclick.stop="startRename(node)"
          @contextmenu.prevent.stop="openMenu($event, node)"
          @dragstart="onDragStart($event, node)"
          @dragend="onDragEnd"
          @dragover.prevent="onDragOver($event, node.isDir ? node.path : dirOfNode(node))"
          @drop.prevent="onDrop($event, node.isDir ? node.path : dirOfNode(node))"
        >
          <span class="ws-caret" @click.stop="onRowClick(node, $event)">
            <el-icon v-if="node.isDir" :size="10">
              <ArrowDown v-if="expanded[node.path]" /><ArrowRight v-else />
            </el-icon>
          </span>
          <span class="ws-ficon" :class="iconClass(node)">{{ iconText(node) }}</span>
          <span v-if="renamingPath === node.path" class="ws-name" @click.stop>
            <input
              v-model="renameValue"
              class="ws-rename-input"
              spellcheck="false"
              @click.stop
              @keydown.enter.prevent="commitRename(node)"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename(node)"
            />
          </span>
          <span v-else class="ws-name" :title="node.name">{{ node.name }}</span>
          <span v-if="renamingPath !== node.path && !node.isDir && node.size" class="ws-size" :title="`${node.size} 字节`">{{ humanSize(node.size) }}</span>
        </div>
      </template>
    </div>

    <!-- 批量操作条：Ctrl/Cmd 点选、Shift 连选后出现 -->
    <div v-if="selectedNodes.length" class="ws-batch">
      <span class="ws-batch-count">已选 {{ selectedNodes.length }} 项</span>
      <el-dropdown trigger="click" size="small" @command="batchMoveTo">
        <button class="ws-batch-btn" type="button">移动到…</button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="d in knownDirs" :key="d" :command="d">{{ dirLabel(d) }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button class="ws-batch-btn danger" type="button" @click="batchDelete">删除</button>
      <button class="ws-batch-x" type="button" title="取消选择" @click="clearMulti">
        <el-icon :size="12"><Close /></el-icon>
      </button>
    </div>

    <!-- 撤销条：重命名 / 移动后出现，最多回退最近 10 步 -->
    <div v-if="undoStack.length" class="ws-undo">
      <span class="ws-undo-text" :title="undoStack[undoStack.length - 1].label">{{ undoStack[undoStack.length - 1].label }}</span>
      <button class="ws-undo-btn" type="button" @click="undoLast">撤销</button>
      <button class="ws-undo-x" type="button" title="关闭" @click="clearUndo">
        <el-icon :size="12"><Close /></el-icon>
      </button>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="menu.visible"
        class="ws-menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @mousedown.stop
      >
        <button class="ws-menu-item" type="button" @click="menuCreate('doc')">＋ 新建文档 <span>.docx</span></button>
        <button class="ws-menu-item" type="button" @click="menuCreate('sheet')">＋ 新建表格 <span>.xlsx</span></button>
        <button class="ws-menu-item" type="button" @click="menuCreate('slides')">＋ 新建演示 <span>.pptx</span></button>
        <button class="ws-menu-item" type="button" @click="menuCreate('md')">＋ 新建 Markdown <span>.md</span></button>
        <button class="ws-menu-item" type="button" @click="menuCreate('txt')">＋ 新建文本 <span>.txt</span></button>
        <template v-if="menu.node">
          <div class="ws-menu-sep"></div>
          <button class="ws-menu-item" type="button" @click="menuRename">✎ 重命名</button>
          <button class="ws-menu-item" type="button" @click="menuDuplicate">⧉ 复制一份</button>
          <div class="ws-menu-sep"></div>
          <button class="ws-menu-item danger" type="button" @click="menuDelete">⌫ 删除</button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, watch, ref, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, ArrowRight, ArrowDown, Close, Search } from '@element-plus/icons-vue';
import { useWorkspaceFiles, dirOfNode, type WsNode, type OfficeDocKind, type WorkspaceSearchHit } from '../../composables/office/useWorkspaceFiles';
import { api } from '../../api/client';
import { officeSelectedFile } from '../../stores/officeWorkbench';

const {
  rootDir, loading, error, selectedPath, flatNodes, expanded, childrenByDir,
  loadRoot, toggleDir, refresh, select, revealPath, createDoc, renameNode, duplicateNode, deleteNode,
  moveNodes, deleteMany, uploadFiles, searchWorkspace, targetDir,
} = useWorkspaceFiles();

const rootName = computed(() => {
  const r = rootDir.value.replace(/[\\/]+$/, '');
  return r.split(/[\\/]/).pop() || r || '未设置';
});

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}
function humanSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}
function iconTextByName(name: string): string {
  const ext = extOf(name);
  if (ext === '.docx') return 'W';
  if (ext === '.xlsx') return 'X';
  if (ext === '.pptx') return 'P';
  return '·';
}
function iconText(node: WsNode): string {
  if (node.isDir) return '▣';
  return iconTextByName(node.name);
}
function iconClass(node: WsNode): string {
  if (node.isDir) return 'is-folder';
  const ext = extOf(node.name);
  if (ext === '.docx') return 'f-word';
  if (ext === '.xlsx') return 'f-xls';
  if (ext === '.pptx') return 'f-ppt';
  return '';
}

// ===== 多选（Ctrl/Cmd 点选、Shift 连选）=====
const selectedPaths = ref<string[]>([]);
const lastAnchorPath = ref('');
const selectedNodes = computed<WsNode[]>(() =>
  flatNodes.value.filter((n) => selectedPaths.value.includes(n.path)),
);
function clearMulti() {
  selectedPaths.value = [];
  lastAnchorPath.value = '';
}
function toggleInMulti(node: WsNode) {
  selectedPaths.value = selectedPaths.value.includes(node.path)
    ? selectedPaths.value.filter((p) => p !== node.path)
    : [...selectedPaths.value, node.path];
  lastAnchorPath.value = node.path;
  select(node.path);
  officeSelectedFile.value = node.path;
}

function onRowClick(node: WsNode, e?: MouseEvent) {
  treeEl.value?.focus();
  const mod = !!e && (e.ctrlKey || e.metaKey);
  const shift = !!e && e.shiftKey;

  if (shift && lastAnchorPath.value) {
    const a = flatNodes.value.findIndex((n) => n.path === lastAnchorPath.value);
    const b = flatNodes.value.findIndex((n) => n.path === node.path);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      selectedPaths.value = flatNodes.value.slice(lo, hi + 1).map((n) => n.path);
      select(node.path);
      officeSelectedFile.value = node.path;
      return;
    }
  }
  if (mod) {
    toggleInMulti(node);
    return;
  }
  // 普通点击：清空多选；目录 = 展开/收起，文件 = 打开
  clearMulti();
  lastAnchorPath.value = node.path;
  if (node.isDir) {
    void toggleDir(node);
    return;
  }
  select(node.path);
  officeSelectedFile.value = node.path;
}

// ===== 键盘操作：F2 改名 / Del 删除 / Ctrl+Z 撤销 =====
const treeEl = ref<HTMLElement | null>(null);
function selectedNode(): WsNode | null {
  return flatNodes.value.find((n) => n.path === selectedPath.value) || null;
}
function onTreeKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (!undoStack.value.length) return;
    e.preventDefault();
    void undoLast();
    return;
  }
  if (e.key === 'F2') {
    const node = selectedNode();
    if (!node) return;
    e.preventDefault();
    startRename(node);
    return;
  }
  if (e.key === 'Escape') {
    if (selectedPaths.value.length) { e.preventDefault(); clearMulti(); }
    return;
  }
  if (e.key === 'Delete') {
    if (selectedPaths.value.length) { e.preventDefault(); void batchDelete(); return; }
    const node = selectedNode();
    if (!node) return;
    e.preventDefault();
    void removeByKeyboard(node);
  }
}
async function removeByKeyboard(node: WsNode) {
  try {
    await ElMessageBox.confirm(
      `删除「${node.name}」${node.isDir ? '及其全部内容' : ''}？文件会被直接删除，不进回收站。`,
      '删除',
      { type: 'warning', confirmButtonClass: 'yz-confirm-danger', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  const r = await deleteNode(node);
  if (!r.ok) { ElMessage.error(r.error || '删除失败'); return; }
  ElMessage.success('已删除');
}

// ===== 批量操作（批量移动 / 批量删除）=====
const knownDirs = computed(() => {
  const root = rootDir.value.replace(/[\\/]+$/, '');
  const set = new Set<string>();
  if (root) set.add(root);
  for (const d of Object.keys(childrenByDir.value)) set.add(d.replace(/[\\/]+$/, ''));
  for (const n of flatNodes.value) if (n.isDir) set.add(n.path.replace(/[\\/]+$/, ''));
  return [...set].filter(Boolean).sort();
});
function dirLabel(d: string): string {
  const root = rootDir.value.replace(/[\\/]+$/, '');
  if (d === root) return '/（工作区根）';
  const rel = d.toLowerCase().startsWith(root.toLowerCase())
    ? d.slice(root.length).replace(/^[\\/]+/, '')
    : d;
  return rel || '/';
}
async function batchMoveTo(target: string) {
  const nodes = selectedNodes.value.slice();
  if (!nodes.length || !target) return;
  const r = await moveNodes(nodes, target);
  for (const m of r.moved) pushUndo(`移动「${m.name}」`, m.from, m.to);
  if (r.moved.length) ElMessage.success(`已移动 ${r.moved.length} 项`);
  if (r.failed.length) ElMessage.warning(`${r.failed.length} 项移动失败：${r.failed[0].name}（${r.failed[0].error}）`);
  selectedPaths.value = r.moved.length ? r.moved.map((m) => m.to) : nodes.map((n) => n.path);
}
async function batchDelete() {
  const nodes = selectedNodes.value.slice();
  if (!nodes.length) return;
  try {
    await ElMessageBox.confirm(
      `删除选中的 ${nodes.length} 项？文件会被直接删除，不进回收站。`,
      '批量删除',
      { type: 'warning', confirmButtonClass: 'yz-confirm-danger', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  const r = await deleteMany(nodes);
  clearMulti();
  if (r.deleted) ElMessage.success(`已删除 ${r.deleted} 项`);
  if (r.failed.length) ElMessage.warning(`${r.failed.length} 项删除失败：${r.failed[0].name}（${r.failed[0].error}）`);
}

// ===== 工作区搜索（文件名 / 内容）=====
const searchOpen = ref(false);
const searchInputEl = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const searching = ref(false);
const searchError = ref('');
const searchHits = ref<WorkspaceSearchHit[]>([]);
const searchTruncated = ref(false);
const isSearching = computed(() => searchOpen.value && searchQuery.value.trim().length > 0);

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { void runSearch(); }, 320);
}
async function runSearch() {
  const q = searchQuery.value.trim();
  if (!q) { searchHits.value = []; searchError.value = ''; return; }
  searching.value = true;
  searchError.value = '';
  const r = await searchWorkspace(q);
  searching.value = false;
  if (r.error) { searchError.value = r.error; searchHits.value = []; return; }
  searchHits.value = r.hits;
  searchTruncated.value = r.truncated;
}
watch(searchQuery, scheduleSearch);
async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    await nextTick();
    searchInputEl.value?.focus();
    if (searchQuery.value.trim()) void runSearch();
  } else {
    searchHits.value = [];
    searchError.value = '';
  }
}
function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = '';
  searchHits.value = [];
  searchError.value = '';
}
async function openHit(hit: WorkspaceSearchHit) {
  closeSearch();
  await revealPath(hit.file);
  officeSelectedFile.value = hit.file;
}

// ===== 外部文件拖入上传 =====
const uploading = ref(false);
const uploadCount = ref(0);
function hasExternalFiles(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt) return false;
  return Array.from(dt.types || []).includes('Files');
}
async function handleUpload(dir: string, fileList: FileList | File[]) {
  const files = Array.from(fileList as ArrayLike<File>);
  if (!dir || !files.length) return;
  uploading.value = true;
  uploadCount.value = files.length;
  try {
    const r = await uploadFiles(dir, files);
    if (r.error) ElMessage.error(r.error);
    if (r.saved.length) {
      ElMessage.success(`已上传 ${r.saved.length} 个文件`);
      const first = r.saved[0];
      if (first) { select(first.path); officeSelectedFile.value = first.path; }
    }
    if (r.failed.length) {
      const f = r.failed[0];
      ElMessage.warning(`${r.failed.length} 个文件上传失败：${f.name}（${f.error}）`);
    }
  } finally {
    uploading.value = false;
    uploadCount.value = 0;
  }
}

// ===== 撤销（重命名 / 移动）=====
interface TreeUndo { label: string; from: string; to: string }
const undoStack = ref<TreeUndo[]>([]);
function pushUndo(label: string, from: string, to: string) {
  undoStack.value = [...undoStack.value.slice(-9), { label, from, to }];
}
function clearUndo() { undoStack.value = []; }
async function undoLast() {
  const last = undoStack.value[undoStack.value.length - 1];
  if (!last) return;
  const r = await api.post('/workspace/rename', { from: last.to, to: last.from });
  if (!('data' in r)) { ElMessage.error(r.error || '撤销失败'); return; }
  undoStack.value = undoStack.value.slice(0, -1);
  await refresh();
  select(last.from);
  ElMessage.success('已撤销：' + last.label);
}

// ===== 行内重命名（双击 / 右键菜单）=====
const renamingPath = ref('');
const renameValue = ref('');
function startRename(node: WsNode) {
  renamingPath.value = node.path;
  renameValue.value = node.name;
  void nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.ws-rename-input');
    el?.focus();
    el?.select();
  });
}
function cancelRename() {
  renamingPath.value = '';
  renameValue.value = '';
}
async function commitRename(node: WsNode) {
  if (renamingPath.value !== node.path) return;
  const name = renameValue.value.trim();
  renamingPath.value = '';
  if (!name || name === node.name) return;
  const r = await renameNode(node, name);
  if (!r.ok) { ElMessage.error(r.error || '重命名失败'); return; }
  if (r.path) pushUndo(`重命名「${node.name}」`, node.path, r.path);
  ElMessage.success('已重命名');
}

// ===== 拖拽移动（拖到目录行 / 空白处=根目录）=====
const dragging = ref<WsNode | null>(null);
const dropTarget = ref('');
function onDragStart(e: DragEvent, node: WsNode) {
  dragging.value = node;
  dropTarget.value = '';
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
  }
}
function onDragOver(e: DragEvent, dir: string) {
  const normalized = (dir || '').replace(/[\\/]+$/, '');
  // 内部拖拽：移动到目录
  if (dragging.value) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget.value = normalized;
    return;
  }
  // 外部文件：上传到目录（DataTransfer.types 含 'Files'，内部拖拽只有 'text/plain'）
  if (hasExternalFiles(e)) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropTarget.value = normalized;
  }
}
function onDragEnd() {
  dragging.value = null;
  dropTarget.value = '';
}
async function onDrop(e: DragEvent, dir: string) {
  const node = dragging.value;
  const dt = e.dataTransfer;
  dragging.value = null;
  dropTarget.value = '';
  if (!node) {
    if (dt && dt.files && dt.files.length) {
      e.preventDefault();
      await handleUpload(dir, dt.files);
    }
    return;
  }
  if (!dir) return;
  e.preventDefault();
  const rootNormalized = dir.replace(/[\\/]+$/, '');
  const nodeNormalized = node.path.replace(/[\\/]+$/, '');
  // 目录不能拖进自身或子目录
  if (node.isDir && (rootNormalized === nodeNormalized || rootNormalized.startsWith(nodeNormalized + '/'))) {
    ElMessage.error('不能移动到自身或子目录');
    return;
  }
  const to = `${rootNormalized}/${node.name}`;
  if (to === node.path) return; // 同目录，无变化
  const r = await api.post('/workspace/rename', { from: node.path, to });
  if (!('data' in r)) { ElMessage.error(r.error || '移动失败'); return; }
  pushUndo(`移动「${node.name}」`, node.path, to);
  await refresh();
  select(to);
  ElMessage.success('已移动');
}

// 手机/触屏没有右键：长按同一行打开菜单。桌面右键已覆盖主要场景，这里不额外引组件。
const menu = reactive({ visible: false, x: 0, y: 0, node: null as WsNode | null });
function openMenu(e: MouseEvent, node: WsNode) {
  menu.visible = true;
  menu.node = node;
  menu.x = Math.min(e.clientX, window.innerWidth - 220);
  menu.y = Math.min(e.clientY, window.innerHeight - 300);
  select(node.path);
}
/** 空白处右键：在根目录新建（不针对具体文件） */
function openBlankMenu(e: MouseEvent) {
  menu.visible = true;
  menu.node = null;
  menu.x = Math.min(e.clientX, window.innerWidth - 220);
  menu.y = Math.min(e.clientY, window.innerHeight - 300);
  select('');
}
function closeMenu() { menu.visible = false; }
function onDocMouseDown() { if (menu.visible) closeMenu(); }
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && menu.visible) closeMenu(); }

async function promptName(title: string, initial: string): Promise<string | null> {
  try {
    const r = await ElMessageBox.prompt('名称', title, {
      inputValue: initial,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    return String(r.value || '').trim() || null;
  } catch {
    return null;
  }
}

type CreateKind = OfficeDocKind | 'md' | 'txt';

async function doCreate(kind: CreateKind) {
  closeMenu();
  if (kind === 'md' || kind === 'txt') {
    const label = kind === 'md' ? 'Markdown' : '文本';
    const name = await promptName(`新建${label}`, kind === 'md' ? '未命名文档' : '未命名文本');
    if (!name) return;
    const dir = targetDir();
    if (!dir) { ElMessage.error('未设置工作目录'); return; }
    const ext = kind === 'md' ? '.md' : '.txt';
    const file = /\.[a-z0-9]+$/i.test(name) ? name : name + ext;
    const path = `${dir}/${file}`;
    const r = await api.post('/workspace/create', { path });
    if (!('data' in r)) { ElMessage.error(r.error || '创建失败'); return; }
    await refresh();
    select(path);
    ElMessage.success(`已创建${label}`);
    return;
  }
  const label = kind === 'doc' ? '文档' : kind === 'sheet' ? '表格' : '演示';
  const name = await promptName(`新建${label}`, `未命名${label}`);
  if (!name) return;
  const r = await createDoc(kind, name);
  if (!r.ok) { ElMessage.error(r.error || '创建失败'); return; }
  ElMessage.success(`已创建${label}`);
}

function onCreatePick(cmd: string) { void doCreate(cmd as CreateKind); }
function menuCreate(kind: CreateKind) { void doCreate(kind); }

async function menuRename() {
  const node = menu.node;
  closeMenu();
  if (!node) return;
  startRename(node);
}

async function menuDuplicate() {
  const node = menu.node;
  closeMenu();
  if (!node) return;
  const r = await duplicateNode(node);
  if (!r.ok) { ElMessage.error(r.error || '复制失败'); return; }
  ElMessage.success('已复制一份');
}

async function menuDelete() {
  const node = menu.node;
  closeMenu();
  if (!node) return;
  try {
    await ElMessageBox.confirm(`删除「${node.name}」？文件会被直接删除，不进回收站。`, '删除', {
      type: 'warning',
      confirmButtonClass: 'yz-confirm-danger',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch { return; }
  const r = await deleteNode(node);
  if (!r.ok) { ElMessage.error(r.error || '删除失败'); return; }
  ElMessage.success('已删除');
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown, true);
  document.addEventListener('keydown', onKeydown);
  void loadRoot();
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true);
  document.removeEventListener('keydown', onKeydown);
});
watch(rootDir, () => { clearMulti(); closeSearch(); void loadRoot(true); });

defineExpose({ doCreate });
</script>

<style scoped>
.ws-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}
.ws-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}
.ws-head-text { min-width: 0; display: flex; flex-direction: column; }
.ws-title { font-size: 12px; font-weight: 700; color: var(--color-text); }
.ws-sub {
  font-size: 11px; color: var(--color-text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;
}
.ws-head-actions { margin-left: auto; display: flex; gap: 2px; }
.ws-icon-btn {
  width: 26px; height: 26px; display: grid; place-items: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary); cursor: pointer;
}
.ws-icon-btn:hover:not(:disabled) { background: var(--glass-bg-hover); color: var(--color-text); }
.ws-icon-btn:disabled { opacity: 0.4; cursor: default; }
.spin { animation: ws-spin 0.9s linear infinite; }
@keyframes ws-spin { to { transform: rotate(360deg); } }

.ws-body { flex: 1; min-height: 0; overflow: auto; padding: 6px 4px 12px; }
.ws-empty { padding: 22px 14px; font-size: 12px; color: var(--color-text-tertiary); line-height: 1.6; }

.ws-row {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding-right: 8px; border-radius: 6px;
  font-size: 12.5px; color: var(--color-text); cursor: pointer; white-space: nowrap;
}
.ws-row:hover { background: var(--glass-bg-hover); }
.ws-row.is-active { background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary); font-weight: 500; }
.ws-row.is-dir { color: var(--color-text-secondary); font-weight: 600; }
.ws-row.dragging { opacity: 0.45; }
.ws-row.drop-target {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  outline: 1px dashed var(--color-primary);
  outline-offset: -1px;
}
.ws-body.is-drop-root { background: color-mix(in srgb, var(--color-primary) 4%, transparent); }
.ws-rename-input {
  width: 100%; min-width: 0;
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  padding: 1px 4px;
  outline: none;
}
/* 撤销条 */
.ws-undo {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 11.5px;
  color: var(--color-text-secondary);
}
.ws-undo-text {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-undo-btn {
  border: none; background: transparent; padding: 0;
  color: var(--color-primary); font-size: 11.5px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.ws-undo-btn:hover { text-decoration: underline; }
.ws-undo-x {
  border: none; background: transparent; padding: 2px;
  display: grid; place-items: center;
  color: var(--color-text-tertiary); cursor: pointer;
}
.ws-undo-x:hover { color: var(--color-text); }
.ws-caret { width: 12px; flex: 0 0 12px; display: inline-flex; justify-content: center; color: var(--color-text-tertiary); }
.ws-ficon { width: 16px; flex: 0 0 16px; text-align: center; font-size: 10px; font-weight: 700; }
.ws-ficon.is-folder { color: var(--color-text-tertiary); font-size: 11px; }
.ws-ficon.f-word { color: #2b579a; }
.ws-ficon.f-xls { color: #1d7044; }
.ws-ficon.f-ppt { color: #b7472a; }
.ws-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ws-size { flex: 0 0 auto; margin-left: 8px; font-size: 10.5px; color: var(--color-text-tertiary); }
/* 树获得焦点时不画整块描边（键盘操作靠选中行反馈） */
.ws-tree:focus { outline: none; }

.ws-row.is-multi {
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  color: var(--color-primary);
}
/* 搜索行 */
.ws-search {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}
.ws-search-input {
  flex: 1; min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.ws-search-input:focus { border-color: var(--color-primary); }
.ws-search-clear, .ws-search-close {
  border: none; background: transparent; padding: 2px 4px;
  color: var(--color-text-tertiary); cursor: pointer; font-size: 11.5px;
}
.ws-search-clear:hover, .ws-search-close:hover { color: var(--color-text); }
.ws-search-close { flex: 0 0 auto; }
.ws-uploading {
  flex: 0 0 auto;
  padding: 6px 10px;
  font-size: 11.5px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
/* 搜索结果 */
.ws-hit-row {
  display: flex;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.ws-hit-row:hover { background: var(--glass-bg-hover); }
.ws-hit-main { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ws-hit-name {
  font-size: 12.5px; color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-hit-line { color: var(--color-primary); }
.ws-hit-rel { font-size: 10.5px; color: var(--color-text-tertiary); }
.ws-hit-preview {
  font-size: 11px; color: var(--color-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-hit-foot { padding: 8px 10px; font-size: 10.5px; color: var(--color-text-tertiary); }
/* 批量操作条 */
.ws-batch {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 11.5px;
  color: var(--color-text-secondary);
}
.ws-batch-count { flex: 1; min-width: 0; }
.ws-batch-btn {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 11.5px;
  cursor: pointer;
  font-family: inherit;
}
.ws-batch-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.ws-batch-btn.danger { color: #b91c1c; }
.ws-batch-btn.danger:hover { border-color: #b91c1c; }
.ws-batch-x {
  border: none; background: transparent; padding: 2px;
  display: grid; place-items: center;
  color: var(--color-text-tertiary); cursor: pointer;
}
.ws-batch-x:hover { color: var(--color-text); }

.ws-menu {
  position: fixed; z-index: 3000; min-width: 200px;
  padding: 5px; border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--glass-bg, #fff));
  box-shadow: var(--shadow-3);
}
.ws-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 10px; border: none; border-radius: 7px; background: transparent;
  font-size: 12.5px; color: var(--color-text); text-align: left; cursor: pointer;
}
.ws-menu-item:hover { background: var(--glass-bg-hover); }
.ws-menu-item span { margin-left: auto; font-size: 10.5px; color: var(--color-text-tertiary); }
.ws-menu-item.danger { color: #b91c1c; }
.ws-menu-sep { height: 1px; margin: 4px 6px; background: var(--color-border); }
</style>
