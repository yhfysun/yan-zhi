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

    <div
      class="ws-body"
      :class="{ 'is-drop-root': dropTarget && dropTarget === rootDir.replace(/[\\/]+$/, '') }"
      @contextmenu.prevent="openBlankMenu"
      @dragover.prevent="onDragOver($event, rootDir)"
      @drop.prevent="onDrop($event, rootDir)"
    >
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
          dragging: dragging?.path === node.path,
          'drop-target': dropTarget && dropTarget === (node.isDir ? node.path : dirOfNode(node)),
        }"
        :style="{ paddingLeft: 8 + node.depth * 14 + 'px' }"
        draggable="true"
        @click="onRowClick(node)"
        @dblclick.stop="startRename(node)"
        @contextmenu.prevent.stop="openMenu($event, node)"
        @dragstart="onDragStart($event, node)"
        @dragend="onDragEnd"
        @dragover.prevent="onDragOver($event, node.isDir ? node.path : dirOfNode(node))"
        @drop.prevent="onDrop($event, node.isDir ? node.path : dirOfNode(node))"
      >
        <span class="ws-caret" @click.stop="onRowClick(node)">
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
import { Plus, Refresh, ArrowRight, ArrowDown, Close } from '@element-plus/icons-vue';
import { useWorkspaceFiles, dirOfNode, type WsNode, type OfficeDocKind } from '../../composables/office/useWorkspaceFiles';
import { api } from '../../api/client';
import { officeSelectedFile } from '../../stores/officeWorkbench';

const {
  rootDir, loading, error, selectedPath, flatNodes, expanded,
  loadRoot, toggleDir, refresh, select, createDoc, renameNode, duplicateNode, deleteNode, targetDir,
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
function iconText(node: WsNode): string {
  if (node.isDir) return '▣';
  const ext = extOf(node.name);
  if (ext === '.docx') return 'W';
  if (ext === '.xlsx') return 'X';
  if (ext === '.pptx') return 'P';
  return '·';
}
function iconClass(node: WsNode): string {
  if (node.isDir) return 'is-folder';
  const ext = extOf(node.name);
  if (ext === '.docx') return 'f-word';
  if (ext === '.xlsx') return 'f-xls';
  if (ext === '.pptx') return 'f-ppt';
  return '';
}

function onRowClick(node: WsNode) {
  treeEl.value?.focus();
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
  if (e.key === 'Delete') {
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
  if (!dragging.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropTarget.value = dir;
}
function onDragEnd() {
  dragging.value = null;
  dropTarget.value = '';
}
async function onDrop(e: DragEvent, dir: string) {
  const node = dragging.value;
  dragging.value = null;
  dropTarget.value = '';
  if (!node || !dir) return;
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
watch(rootDir, () => { void loadRoot(true); });

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
