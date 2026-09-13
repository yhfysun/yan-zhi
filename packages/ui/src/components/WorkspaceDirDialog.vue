<template>
  <el-dialog v-model="visible" title="选择工作目录" width="560px" :close-on-click-modal="false" @open="onOpen">
    <!-- 工具栏：原生目录选择 + 手动输入路径 -->
    <div class="wdd-toolbar">
      <el-button v-if="isDesktop" size="small" type="primary" plain @click="pickNativeDir" :loading="picking">
        <el-icon><FolderOpened /></el-icon> 浏览电脑目录
      </el-button>
      <el-input
        v-model="searchText"
        size="small"
        placeholder="在当前目录内搜索（按名称过滤）"
        class="wdd-search-input"
        clearable
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 手动输入路径 -->
    <div class="wdd-toolbar wdd-toolbar--second">
      <el-input
        v-model="manualPath"
        size="small"
        placeholder="手动输入路径，如 C:\Users\Administrator\Projects"
        class="wdd-manual-input"
        @keyup.enter="navigateToManual"
      >
        <template #append>
          <el-button size="small" @click="navigateToManual" :disabled="!manualPath.trim()">前往</el-button>
        </template>
      </el-input>
    </div>

    <!-- 最近使用 -->
    <div v-if="recentDirs.length" class="wdd-recent">
      <span class="wdd-recent-label">最近使用</span>
      <button
        v-for="dir in recentDirs"
        :key="dir"
        class="wdd-recent-chip"
        type="button"
        :title="dir"
        @click="navigateToPath(dir)"
      >
        {{ dir }}
      </button>
    </div>

    <!-- 可点面包屑 -->
    <div class="wdd-breadcrumb">
      <el-button size="small" circle @click="goUp" :disabled="!canGoUp">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <nav class="wdd-crumbs">
        <button
          v-for="(seg, i) in crumbSegments"
          :key="i"
          type="button"
          class="wdd-crumb"
          :class="{ current: i === crumbSegments.length - 1 }"
          @click="navigateToPath(seg.path)"
        >
          {{ seg.label }}
        </button>
        <span v-if="crumbSegments.length" class="wdd-crumb-sep"></span>
      </nav>
    </div>

    <!-- 列表 -->
    <div class="wdd-list">
      <div v-if="loading" class="wdd-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      <div v-else-if="errorMsg" class="wdd-state wdd-state--error">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ errorMsg }}</span>
        <el-button size="small" plain @click="loadEntries">重试</el-button>
      </div>
      <template v-else>
        <div
          v-for="entry in filteredEntries"
          :key="entry.path"
          class="wdd-entry"
          :class="{ selected: selectedPath === entry.path }"
          @click="selectEntry(entry)"
          @dblclick="entry.isDir && navigateTo(entry)"
        >
          <el-icon :size="16" :color="entry.isDir ? '#f59e0b' : '#94a3b8'">
            <FolderOpened v-if="entry.isDir" />
            <Files v-else />
          </el-icon>
          <span class="wdd-entry-name">{{ entry.name }}</span>
          <span v-if="entry.isDir" class="wdd-entry-arrow">&rsaquo;</span>
        </div>
        <el-empty
          v-if="!loading && !errorMsg && filteredEntries.length === 0"
          :description="searchText.trim() ? '无匹配项' : '空目录'"
          :image-size="40"
        />
      </template>
    </div>

    <template #footer>
      <el-button v-if="props.currentPath" type="danger" plain @click="clearDir">清除工作目录</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirm">选择当前目录</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowUp, FolderOpened, Files, Search, Loading, WarningFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getPlatformAdapter } from '@yan-zhi/core';
import { useSettingsStore } from '../stores/settings';

const props = defineProps<{
  modelValue: boolean;
  currentPath: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'selected', path: string): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isDesktop = getPlatformAdapter().platform === 'desktop';
const settingsStore = useSettingsStore();

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const currentPath = ref('');
const entries = ref<DirEntry[]>([]);
const selectedPath = ref('');
const loading = ref(false);
const errorMsg = ref('');
const manualPath = ref('');
const picking = ref(false);
const searchText = ref('');

const recentDirs = computed(() => {
  const dirs = settingsStore.settings.recentWorkspaceDirs || [];
  // 过滤掉当前正在浏览的目录与不存在的值
  return dirs.filter((d) => d && d !== currentPath.value).slice(0, 5);
});

/** 当前目录过滤结果（本地 computed 纯内存过滤，无需防抖） */
const filteredEntries = computed(() => {
  const kw = searchText.value.trim().toLowerCase();
  if (!kw) return entries.value;
  return entries.value.filter((e) => e.name.toLowerCase().includes(kw));
});

/** 把当前路径拆成可点面包屑分段 */
const crumbSegments = computed(() => {
  const p = currentPath.value;
  if (!p) return [];
  const segs: Array<{ label: string; path: string }> = [];
  if (p.includes('\\')) {
    // Windows：C:\foo\bar
    const m = /^([A-Za-z]:)\\(.*)$/.exec(p);
    if (m) {
      const drive = m[1] + '\\';
      segs.push({ label: drive, path: drive });
      const rest = m[2].split('\\').filter(Boolean);
      let acc = drive;
      for (const part of rest) {
        acc = acc.endsWith('\\') ? acc + part : acc + '\\' + part;
        segs.push({ label: part, path: acc });
      }
    }
  } else {
    // Unix：/foo/bar
    const parts = p.split('/').filter(Boolean);
    if (p.startsWith('/')) {
      segs.push({ label: '/', path: '/' });
    }
    let acc = p.startsWith('/') ? '/' : '';
    for (const part of parts) {
      acc = acc === '/' ? '/' + part : acc + '/' + part;
      segs.push({ label: part, path: acc });
    }
  }
  return segs;
});

const canGoUp = computed(() => {
  const p = currentPath.value;
  if (!p || p === '/') return false;
  if (/^[A-Za-z]:\\?$/.test(p)) return false;
  return true;
});

function onOpen() {
  if (props.currentPath) {
    currentPath.value = props.currentPath;
  } else if (isDesktop) {
    currentPath.value = 'C:\\';
  } else {
    currentPath.value = 'workspace';
  }
  selectedPath.value = '';
  manualPath.value = currentPath.value;
  searchText.value = '';
  errorMsg.value = '';
  loadEntries();
}

async function loadEntries() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const dirPath = currentPath.value;
    if (!dirPath) {
      entries.value = [];
      return;
    }
    const adapter = getPlatformAdapter();
    if (adapter.fs.listDirEntries) {
      const raw = await adapter.fs.listDirEntries(dirPath);
      const result: DirEntry[] = raw.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir }));
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      entries.value = result;
    } else {
      const exists = await adapter.fs.exists(dirPath);
      if (!exists) {
        entries.value = [];
        errorMsg.value = '路径不存在或已失效';
        return;
      }
      const names = await adapter.fs.readDir(dirPath);
      const result: DirEntry[] = [];
      for (const name of names) {
        const sep = dirPath.includes('\\') ? '\\' : '/';
        const cleanDir = dirPath.endsWith(sep) ? dirPath : dirPath + sep;
        const fullPath = cleanDir + name;
        try {
          await adapter.fs.readDir(fullPath);
          result.push({ name, path: fullPath, isDir: true });
        } catch {
          result.push({ name, path: fullPath, isDir: false });
        }
      }
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      entries.value = result;
    }
  } catch (e: any) {
    console.error('loadEntries error:', e);
    entries.value = [];
    errorMsg.value = '无法访问该目录（权限不足或路径非法）';
  } finally {
    loading.value = false;
  }
}

/** 桌面端：选择工作目录（经 preload 暴露的 Electron 原生 dialog） */
async function pickNativeDir() {
  picking.value = true;
  try {
    const electronApi = (window as any).electronAPI;
    const selected = electronApi?.dialog?.showOpenDir
      ? await electronApi.dialog.showOpenDir({ title: '选择工作目录' })
      : null;
    if (selected && typeof selected === 'string') {
      await navigateToPath(selected);
    }
  } catch (e: any) {
    ElMessage.error('目录选择失败: ' + (e?.message || e));
  } finally {
    picking.value = false;
  }
}

/** 手动输入路径后前往 */
async function navigateToManual() {
  const p = manualPath.value.trim();
  if (!p) return;
  await navigateToPath(p);
}

/** 直接导航到某个路径（面包屑 / 最近使用 chip / 手动输入共用） */
async function navigateToPath(p: string) {
  if (!p) return;
  const adapter = getPlatformAdapter();
  try {
    const exists = await adapter.fs.exists(p);
    if (!exists) {
      errorMsg.value = '路径不存在: ' + p;
      ElMessage.warning('路径不存在: ' + p);
      return;
    }
    currentPath.value = p;
    manualPath.value = p;
    selectedPath.value = '';
    searchText.value = '';
    await loadEntries();
  } catch (e: any) {
    errorMsg.value = '无法访问路径: ' + (e?.message || e);
    ElMessage.error('无法访问路径: ' + (e?.message || e));
  }
}

function selectEntry(entry: DirEntry) {
  if (entry.isDir) {
    selectedPath.value = entry.path;
  }
}

function navigateTo(entry: DirEntry) {
  if (!entry.isDir) return;
  navigateToPath(entry.path);
}

function goUp() {
  const p = currentPath.value;
  if (!p || p === '/') return;
  if (/^[A-Za-z]:\\?$/.test(p)) return;
  let parent = '';
  if (p.includes('\\')) {
    const parts = p.split('\\').filter(Boolean);
    parts.pop();
    parent = parts.length > 0 ? parts.join('\\') : p.charAt(0) + ':\\';
  } else {
    const parts = p.split('/');
    parts.pop();
    parent = parts.join('/') || '/';
  }
  navigateToPath(parent);
}

/** 记录最近使用：选中目录提到最前，去重，最多 5 个 */
function rememberRecent(path: string) {
  if (!path) return;
  const list = (settingsStore.settings.recentWorkspaceDirs || []).filter((d) => d && d !== path);
  list.unshift(path);
  settingsStore.update({ recentWorkspaceDirs: list.slice(0, 5) });
}

function confirm() {
  if (currentPath.value) rememberRecent(currentPath.value);
  emit('selected', currentPath.value);
  visible.value = false;
}

function clearDir() {
  emit('selected', '');
  visible.value = false;
}
</script>

<style scoped>
.wdd-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.wdd-toolbar--second {
  margin-bottom: 12px;
}
.wdd-search-input {
  flex: 1;
}
.wdd-manual-input {
  flex: 1;
}
.wdd-recent {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.wdd-recent-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.wdd-recent-chip {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.wdd-recent-chip:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--glass-bg-hover);
}
.wdd-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
}
.wdd-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.wdd-crumb {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wdd-crumb:hover {
  color: var(--color-primary);
  background: var(--glass-bg-hover);
}
.wdd-crumb.current {
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: default;
}
.wdd-crumb.current:hover {
  background: none;
}
.wdd-crumb-sep {
  display: none;
}
.wdd-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
}
.wdd-list::-webkit-scrollbar { width: 5px; }
.wdd-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
.wdd-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.wdd-state--error {
  color: var(--color-danger, #ef4444);
  flex-direction: column;
}
.wdd-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid rgba(15,23,42,0.04);
}
.wdd-entry:last-child { border-bottom: none; }
.wdd-entry:hover { background: var(--glass-bg-hover); }
.wdd-entry.selected { background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.wdd-entry-name {
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wdd-entry-arrow {
  font-size: 18px;
  color: var(--color-text-secondary);
  font-weight: 300;
}
</style>
