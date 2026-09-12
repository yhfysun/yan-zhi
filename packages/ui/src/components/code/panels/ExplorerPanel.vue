<template>
  <div class="exp">
    <!-- 来源切换：项目文件 / 会话文件 -->
    <div class="exp-head">
      <div class="exp-src">
        <button class="exp-src-btn" :class="{ on: source === 'project' }" @click="source = 'project'">项目文件</button>
        <button class="exp-src-btn" :class="{ on: source === 'conv' }" @click="source = 'conv'">会话文件</button>
      </div>
      <div class="exp-head-actions">
        <el-tooltip content="新建文件" placement="bottom" :show-after="400">
          <button class="exp-icon-btn" @click="startCreate(false)"><el-icon :size="13"><DocumentAdd /></el-icon></button>
        </el-tooltip>
        <el-tooltip content="新建文件夹" placement="bottom" :show-after="400">
          <button class="exp-icon-btn" @click="startCreate(true)"><el-icon :size="13"><FolderAdd /></el-icon></button>
        </el-tooltip>
        <el-tooltip content="刷新" placement="bottom" :show-after="400">
          <button class="exp-icon-btn" :class="{ spin: treeLoading }" @click="reload"><el-icon :size="13"><Refresh /></el-icon></button>
        </el-tooltip>
        <el-tooltip content="在系统文件管理器中打开" placement="bottom" :show-after="400">
          <button class="exp-icon-btn" @click="revealRoot"><el-icon :size="13"><FolderOpened /></el-icon></button>
        </el-tooltip>
      </div>
    </div>

    <!-- 项目文件：目录树 -->
    <template v-if="source === 'project'">
      <div v-if="!code.projectDir" class="exp-empty">
        <el-icon :size="22"><Folder /></el-icon>
        <p>未选择项目目录</p>
        <button class="exp-btn" @click="emit('pick-dir')">选择项目目录</button>
      </div>

      <template v-else>
        <div class="exp-root" :title="code.projectDir">
          <el-icon :size="12"><FolderOpened /></el-icon>
          <span class="exp-root-name">{{ code.projectName }}</span>
          <span class="exp-root-path">{{ code.projectDir }}</span>
        </div>

        <el-input
          v-model="filterText"
          size="small"
          placeholder="过滤文件名"
          clearable
          :prefix-icon="Search"
          class="exp-filter"
        />

        <!-- 新建条目输入行 -->
        <div v-if="creating" class="exp-create">
          <el-icon :size="13" class="exp-create-icon">
            <Folder v-if="creating.isDir" /><Document v-else />
          </el-icon>
          <input
            ref="createInputRef"
            v-model="creating.name"
            class="exp-create-input"
            :placeholder="creating.isDir ? '文件夹名称' : '文件名（含后缀）'"
            @keydown.enter="submitCreate"
            @keydown.esc="creating = null"
            @blur="submitCreate"
          />
        </div>

        <div class="exp-tree">
          <div
            v-for="row in rows"
            v-show="rowMatch(row)"
            :key="row.relPath"
            class="exp-row"
            :class="{ 'is-dir': row.isDir, active: activeRel === row.relPath }"
            :style="{ paddingLeft: 4 + row.depth * 13 + 'px' }"
            :title="row.relPath"
            @click="onRowClick(row)"
            @contextmenu.prevent.stop="onRowMenu($event, row)"
          >
            <el-icon
              v-if="row.isDir"
              class="exp-caret"
              :class="{ expanded: expanded.has(row.relPath) }"
              @click.stop="toggleDir(row.relPath)"
            >
              <CaretRight />
            </el-icon>
            <span v-else class="exp-caret-ph"></span>
            <el-icon v-if="row.loading" class="exp-file-icon spin"><Loading /></el-icon>
            <el-icon v-else class="exp-file-icon" :style="{ color: meta(row.name, row.isDir).color }">
              <component :is="meta(row.name, row.isDir).icon" />
            </el-icon>
            <span class="exp-name">{{ row.name }}</span>
          </div>
          <div v-if="treeLoading" class="exp-hint">加载中…</div>
          <div v-else-if="treeError" class="exp-hint exp-hint-err">{{ treeError }}</div>
          <div v-else-if="rootLoaded && rows.length === 0" class="exp-hint">目录为空</div>
        </div>
      </template>
    </template>

    <!-- 会话文件：沿用聊天页三段分类（上传 / 中间 / 交付） -->
    <div v-else class="exp-conv">
      <template v-for="cat in convCats" :key="cat.key">
        <div class="exp-cat-head" @click="toggleCat(cat.key)">
          <el-icon :size="11" class="exp-cat-caret" :class="{ collapsed: !openCats[cat.key] }">
            <CaretBottom />
          </el-icon>
          <span class="exp-cat-name">{{ cat.label }}</span>
          <span class="exp-cat-count">{{ (fileStore.filesByCategory[cat.key] || []).length }}</span>
        </div>
        <template v-if="openCats[cat.key]">
          <div
            v-for="f in (fileStore.filesByCategory[cat.key] || [])"
            :key="f.id"
            class="exp-row is-file"
            :title="f.path"
            @click="openConvFile(f)"
          >
            <span class="exp-caret-ph"></span>
            <el-icon class="exp-file-icon" :style="{ color: meta(f.name).color }">
              <component :is="meta(f.name).icon" />
            </el-icon>
            <span class="exp-name">{{ f.name }}</span>
          </div>
          <div v-if="!(fileStore.filesByCategory[cat.key] || []).length" class="exp-hint exp-hint-sm">暂无{{ cat.label }}</div>
        </template>
      </template>
      <div v-if="!fileStore.files.length" class="exp-hint">当前会话还没有文件</div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="menu"
      class="exp-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @click.stop
    >
      <button class="exp-menu-item" @click="menuOpen">打开</button>
      <button class="exp-menu-item" @click="menuCopyPath">复制路径</button>
      <button class="exp-menu-item" @click="menuRename">重命名</button>
      <button class="exp-menu-item" @click="menuReveal">在文件管理器中显示</button>
      <button class="exp-menu-item danger" @click="menuDelete">删除</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import {
  DocumentAdd, FolderAdd, Refresh, FolderOpened, Folder, Document, CaretRight,
  CaretBottom, Search, Loading,
} from '@element-plus/icons-vue';
import { useCodeStore } from '../../../stores/code';
import { useFileStore } from '../../../stores/file';
import { useChatStore } from '../../../stores/chat';
import { api } from '../../../api/client';
import { fileMeta } from '../fileMeta';

const emit = defineEmits<{ 'pick-dir': [] }>();
const code = useCodeStore();
const fileStore = useFileStore();
const chatStore = useChatStore();

const source = ref<'project' | 'conv'>('project');
const filterText = ref('');
const meta = fileMeta;

// ======================== 目录树 ========================
interface TreeEntry { name: string; relPath: string; isDir: boolean; size: number }
interface TreeRow extends TreeEntry { depth: number; loading?: boolean }
interface LoadedDir { entries: TreeEntry[]; hasMore: boolean; loading: boolean; done: boolean }

const TREE_PAGE_SIZE = 2000;
const loaded = ref<Record<string, LoadedDir>>({});
const rootLoaded = ref(false);
const treeLoading = ref(false);
const treeError = ref('');
const expanded = ref<Set<string>>(new Set());
const activeRel = ref('');

const enc = (s: string) => encodeURIComponent(s);

function setLoaded(key: string, v: LoadedDir) {
  loaded.value = { ...loaded.value, [key]: v };
}

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
        `/workspace/tree?dir=${enc(code.projectDir)}&sub=${enc(parentRel)}&recursive=0&offset=${off}&limit=${TREE_PAGE_SIZE}`,
      );
      if ('error' in r) break;
      const page = r.data.entries || [];
      collected = off === 0 ? page : collected.concat(page);
      hasMore = r.data.hasMore;
      off += page.length;
    } while (hasMore && off < 50000);
    setLoaded(parentRel, { entries: collected, hasMore, loading: false, done: true });
  } catch {
    setLoaded(parentRel, { entries: prev?.entries ?? [], hasMore: false, loading: false, done: true });
  }
}

async function reload() {
  if (!code.projectDir) return;
  treeLoading.value = true;
  treeError.value = '';
  rootLoaded.value = false;
  loaded.value = {};
  expanded.value = new Set();
  try {
    await loadDir('');
    rootLoaded.value = true;
  } catch (e: any) {
    treeError.value = e?.message || '加载失败';
  } finally {
    treeLoading.value = false;
  }
}

function toggleDir(relPath: string) {
  const next = new Set(expanded.value);
  if (next.has(relPath)) next.delete(relPath);
  else { next.add(relPath); void loadDir(relPath); }
  expanded.value = next;
}

const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = [];
  const walk = (parentRel: string, depth: number) => {
    const ld = loaded.value[parentRel];
    if (!ld) return;
    for (const e of ld.entries) {
      out.push({ ...e, depth });
      if (e.isDir && expanded.value.has(e.relPath)) {
        const child = loaded.value[e.relPath];
        if (!child || !child.done) {
          out.push({ name: '加载中…', relPath: e.relPath + '/__loading__', isDir: true, size: 0, depth: depth + 1, loading: true });
        } else walk(e.relPath, depth + 1);
      }
    }
  };
  walk('', 0);
  return out;
});

function rowMatch(row: TreeRow): boolean {
  if (row.loading) return true;
  const q = filterText.value.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q);
}

function joinPath(rel: string): string {
  const base = code.projectDir.replace(/[\\/]+$/, '');
  const sep = code.projectDir.includes('\\') && !code.projectDir.includes('/') ? '\\' : '/';
  return base + sep + rel.split('/').join(sep);
}

function onRowClick(row: TreeRow) {
  if (row.loading) return;
  if (row.isDir) { toggleDir(row.relPath); return; }
  activeRel.value = row.relPath;
  void code.openFile(joinPath(row.relPath), row.name);
}

// ======================== 新建 / 重命名 / 删除 ========================
interface Creating { parentRel: string; isDir: boolean; name: string }
const creating = ref<Creating | null>(null);
const createInputRef = ref<HTMLInputElement | null>(null);

function startCreate(isDir: boolean) {
  if (!code.projectDir) { emit('pick-dir'); return; }
  creating.value = { parentRel: '', isDir, name: '' };
  void nextTick(() => createInputRef.value?.focus());
}

async function submitCreate() {
  const c = creating.value;
  if (!c) return;
  const name = c.name.trim();
  creating.value = null;
  if (!name) return;
  const target = joinPath(c.parentRel ? `${c.parentRel}/${name}` : name);
  const r = c.isDir
    ? await api.post<{ ok: boolean }>('/workspace/mkdir', { path: target })
    : await api.post<{ ok: boolean }>('/workspace/create', { path: target, isDir: false });
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success(`已创建 ${name}`);
  await reload();
  if (!c.isDir) void code.openFile(target, name);
}

// ===== 右键菜单（自绘浮动菜单，避免 Element 弹窗打断操作节奏）=====
interface RowMenu { x: number; y: number; row: TreeRow; abs: string }
const menu = ref<RowMenu | null>(null);

function onRowMenu(e: MouseEvent, row: TreeRow) {
  if (row.loading) return;
  menu.value = { x: e.clientX, y: e.clientY, row, abs: joinPath(row.relPath) };
}
function closeMenu() { menu.value = null; }

async function menuOpen() {
  const m = menu.value;
  if (!m) return;
  closeMenu();
  if (m.row.isDir) { activeRel.value = m.row.relPath; toggleDir(m.row.relPath); return; }
  activeRel.value = m.row.relPath;
  await code.openFile(m.abs, m.row.name);
}

async function menuCopyPath() {
  const m = menu.value;
  if (!m) return;
  closeMenu();
  try {
    await navigator.clipboard.writeText(m.abs);
    ElMessage.success('路径已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制：' + m.abs);
  }
}

async function menuRename() {
  const m = menu.value;
  if (!m) return;
  closeMenu();
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名', {
      confirmButtonText: '确定', cancelButtonText: '取消', inputValue: m.row.name,
    });
    const newName = (value || '').trim();
    if (!newName || newName === m.row.name) return;
    const idx = m.row.relPath.lastIndexOf('/');
    const parentRel = idx > 0 ? m.row.relPath.slice(0, idx) : '';
    const to = joinPath(parentRel ? `${parentRel}/${newName}` : newName);
    const r = await api.post<{ ok: boolean }>('/workspace/rename', { from: m.abs, to });
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('已重命名');
    code.closeFile(m.abs);
    await reload();
  } catch { /* 取消 */ }
}

async function menuDelete() {
  const m = menu.value;
  if (!m) return;
  closeMenu();
  try {
    await ElMessageBox.confirm(
      `确定删除「${m.row.name}」？${m.row.isDir ? '（含目录内全部内容，不可恢复）' : '（不可恢复）'}`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  const r = await api.post<{ ok: boolean }>('/workspace/delete', { path: m.abs });
  if ('error' in r) { ElMessage.error(r.error); return; }
  code.closeFile(m.abs);
  ElMessage.success('已删除');
  await reload();
}

function menuReveal() {
  const m = menu.value;
  if (!m) return;
  closeMenu();
  void api.post('/workspace/reveal', { path: m.abs });
}

onMounted(() => document.addEventListener('click', closeMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));

function revealRoot() {
  if (!code.projectDir) return;
  void api.post('/workspace/reveal', { path: code.projectDir });
}

// ======================== 会话文件 ========================
const convCats = [
  { key: 'upload' as const, label: '上传文件' },
  { key: 'intermediate' as const, label: '中间文件' },
  { key: 'deliverable' as const, label: '交付文件' },
];
const openCats = ref<Record<string, boolean>>({ upload: true, intermediate: true, deliverable: true });
function toggleCat(k: string) { openCats.value[k] = !openCats.value[k]; }
function openConvFile(f: { name: string; path: string }) {
  void code.openFile(f.path, f.name);
}

onMounted(() => {
  if (code.projectDir) void reload();
  if (chatStore.currentConvId) void fileStore.loadConversationFiles(chatStore.currentConvId);
});

watch(() => code.projectDir, () => {
  filterText.value = '';
  void reload();
});
</script>

<style scoped>
.exp { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.exp-head {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 8px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.exp-src { display: flex; gap: 2px; flex: 1; min-width: 0; }
.exp-src-btn {
  height: 22px; padding: 0 8px; font-size: 11px;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease;
}
.exp-src-btn:hover { background: var(--glass-bg-hover, #f1efe9); }
.exp-src-btn.on {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent);
  color: var(--color-primary, #c2410c); font-weight: 600;
}
.exp-head-actions { display: flex; gap: 1px; flex-shrink: 0; }
.exp-icon-btn {
  width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer; transition: all 0.15s ease;
}
.exp-icon-btn:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-primary, #c2410c); }
.spin { animation: exp-spin 0.9s linear infinite; }
@keyframes exp-spin { to { transform: rotate(360deg); } }

.exp-root {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 10px; flex-shrink: 0;
  font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
}
.exp-root-name {
  font-size: 12px; font-weight: 700; color: var(--color-text, #1a1a1a); flex-shrink: 0;
}
.exp-root-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.exp-filter { flex-shrink: 0; padding: 0 8px 6px; }

.exp-create {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 10px; flex-shrink: 0;
}
.exp-create-icon { color: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.exp-create-input {
  flex: 1; min-width: 0; height: 22px; padding: 0 6px;
  font-size: 12px; font-family: inherit;
  border: 1px solid var(--color-primary, #c2410c); border-radius: 5px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a); outline: none;
}

.exp-tree { flex: 1; min-height: 0; overflow: auto; padding: 0 4px 8px; }

.exp-row {
  display: flex; align-items: center; gap: 4px;
  height: 25px; padding-right: 6px; border-radius: 6px;
  font-size: 12px; color: var(--color-text, #1a1a1a);
  cursor: pointer; user-select: none; white-space: nowrap;
}
.exp-row:hover { background: var(--glass-bg-hover, #f1efe9); }
.exp-row.active { background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent); color: var(--color-primary, #c2410c); }
.exp-caret { flex-shrink: 0; color: var(--color-text-tertiary, #9c9b94); transition: transform 0.15s ease; }
.exp-caret.expanded { transform: rotate(90deg); }
.exp-caret-ph { flex: 0 0 14px; }
.exp-file-icon { flex-shrink: 0; font-size: 14px; }
.exp-name { overflow: hidden; text-overflow: ellipsis; }

.exp-hint {
  padding: 10px 6px; font-size: 11.5px; text-align: center;
  color: var(--color-text-tertiary, #9c9b94);
}
.exp-hint-err { color: var(--el-color-danger); }
.exp-hint-sm { padding: 4px 6px; }

.exp-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  color: var(--color-text-tertiary, #9c9b94); font-size: 12px; padding: 20px;
}
.exp-empty p { margin: 0; }
.exp-btn {
  height: 28px; padding: 0 12px; font-size: 12px;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a); cursor: pointer;
}
.exp-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }

.exp-conv { flex: 1; min-height: 0; overflow: auto; padding: 4px; }
.exp-cat-head {
  display: flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 6px; border-radius: 6px; cursor: pointer;
  font-size: 11.5px; font-weight: 600; color: var(--color-text-secondary, #6b6b66);
}
.exp-cat-head:hover { background: var(--glass-bg-hover, #f1efe9); }
.exp-cat-caret { transition: transform 0.15s ease; }
.exp-cat-caret.collapsed { transform: rotate(-90deg); }
.exp-cat-name { flex: 1; }
.exp-cat-count { font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94); }

/* ===== 右键菜单 ===== */
.exp-menu {
  position: fixed; z-index: 3000; min-width: 168px;
  padding: 4px; border-radius: 10px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--glass-border, #e7e4dc);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
  display: flex; flex-direction: column; gap: 1px;
}
.exp-menu-item {
  display: block; width: 100%; text-align: left;
  height: 28px; padding: 0 10px; font-size: 12px; font-family: inherit;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text, #1a1a1a); cursor: pointer; transition: background 0.12s ease;
}
.exp-menu-item:hover { background: var(--glass-bg-hover, #f1efe9); }
.exp-menu-item.danger { color: var(--el-color-danger); }
.exp-menu-item.danger:hover { background: color-mix(in srgb, var(--el-color-danger) 10%, transparent); }
</style>
