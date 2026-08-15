<template>
  <el-dialog v-model="visible" title="选择工作目录" width="520px" :close-on-click-modal="false" @open="onOpen">
    <!-- 工具栏：原生目录选择 + 手动输入路径 -->
    <div class="wdd-toolbar">
      <el-button v-if="isDesktop" size="small" type="primary" plain @click="pickNativeDir" :loading="picking">
        <el-icon><FolderOpened /></el-icon> 浏览电脑目录
      </el-button>
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
    <div class="wdd-breadcrumb">
      <el-button size="small" circle @click="goUp" :disabled="!canGoUp">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <span class="wdd-path">{{ currentPath }}</span>
    </div>
    <div class="wdd-list">
      <div v-if="loading" class="wdd-loading">加载中...</div>
      <template v-else>
        <div
          v-for="entry in entries"
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
        <el-empty v-if="!loading && entries.length === 0" description="空目录" :image-size="40" />
      </template>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirm">选择当前目录</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowUp, FolderOpened, Files } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getPlatformAdapter } from '@yan-zhi/core';

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

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const currentPath = ref('');
const entries = ref<DirEntry[]>([]);
const selectedPath = ref('');
const loading = ref(false);
const manualPath = ref('');
const picking = ref(false);

const canGoUp = computed(() => {
  const p = currentPath.value;
  if (!p || p === '/') return false;
  // Windows 盘符根目录（C:\）或 Unix 根路径（/）到顶时不可再上
  if (/^[A-Za-z]:\\?$/.test(p)) return false;
  return true;
});

async function onOpen() {
  // 有已选路径则沿用；否则桌面端默认从 C:\ 开始（Windows），web 端用 'workspace'
  if (props.currentPath) {
    currentPath.value = props.currentPath;
  } else if (isDesktop) {
    currentPath.value = 'C:\\';
  } else {
    currentPath.value = 'workspace';
  }
  selectedPath.value = '';
  manualPath.value = currentPath.value;
  loadEntries();
}

async function loadEntries() {
  loading.value = true;
  try {
    const dirPath = currentPath.value;
    if (!dirPath) {
      entries.value = [];
      return;
    }
    const adapter = getPlatformAdapter();
    // 优先使用 listDirEntries（桌面端一次返回结构化条目，无 scope 限制）
    if (adapter.fs.listDirEntries) {
      const raw = await adapter.fs.listDirEntries(dirPath);
      const result: DirEntry[] = raw.map((e) => ({ name: e.name, path: e.path, isDir: e.isDir }));
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      entries.value = result;
    } else {
      // Web/Mobile：通过 readDir + 逐个判断 isDir
      const exists = await adapter.fs.exists(dirPath);
      if (!exists) {
        entries.value = [];
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
  } catch (e) {
    console.error('loadEntries error:', e);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

/** 桌面端：调用 Tauri 原生目录选择对话框 */
async function pickNativeDir() {
  picking.value = true;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title: '选择工作目录' });
    if (selected && typeof selected === 'string') {
      currentPath.value = selected;
      selectedPath.value = '';
      manualPath.value = selected;
      await loadEntries();
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
  const adapter = getPlatformAdapter();
  try {
    const exists = await adapter.fs.exists(p);
    if (!exists) {
      ElMessage.warning('路径不存在: ' + p);
      return;
    }
    currentPath.value = p;
    selectedPath.value = '';
    await loadEntries();
  } catch (e: any) {
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
  currentPath.value = entry.path;
  manualPath.value = entry.path;
  selectedPath.value = '';
  loadEntries();
}

function goUp() {
  const p = currentPath.value;
  if (!p || p === '/') return;
  if (/^[A-Za-z]:\\?$/.test(p)) return; // Windows 盘符根目录到顶
  // 兼容 Windows \ 和 Unix /
  if (p.includes('\\')) {
    const parts = p.split('\\').filter(Boolean);
    parts.pop();
    currentPath.value = parts.length > 0 ? parts.join('\\') : (p.charAt(0) + ':\\');
  } else {
    const parts = p.split('/');
    parts.pop();
    currentPath.value = parts.join('/') || '/';
  }
  manualPath.value = currentPath.value;
  selectedPath.value = '';
  loadEntries();
}

function confirm() {
  emit('selected', currentPath.value);
  visible.value = false;
}
</script>

<style scoped>
.wdd-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.wdd-manual-input {
  flex: 1;
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
.wdd-path {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.wdd-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
}
.wdd-list::-webkit-scrollbar { width: 5px; }
.wdd-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
.wdd-loading { padding: 24px; text-align: center; color: var(--color-text-secondary); font-size: 13px; }
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
.wdd-entry.selected { background: rgba(59,130,246,0.08); }
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
