<template>
  <el-dialog v-model="visible" title="选择工作目录" width="520px" :close-on-click-modal="false" @open="onOpen">
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

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const currentPath = ref('');
const entries = ref<DirEntry[]>([]);
const selectedPath = ref('');
const loading = ref(false);

const canGoUp = computed(() => {
  const p = currentPath.value;
  return p && p !== '/' && p !== 'workspace' && p.includes('/');
});

function onOpen() {
  currentPath.value = props.currentPath || 'workspace';
  selectedPath.value = '';
  loadEntries();
}

async function loadEntries() {
  loading.value = true;
  try {
    const adapter = getPlatformAdapter();
    const dirPath = currentPath.value || 'workspace';
    const exists = await adapter.fs.exists(dirPath);
    if (!exists) {
      entries.value = [];
      loading.value = false;
      return;
    }
    const raw = await adapter.fs.readDir(dirPath);
    const result: DirEntry[] = [];
    for (const name of raw) {
      const cleanDir = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const fullPath = cleanDir + name;
      try {
        const entryExists = await adapter.fs.exists(fullPath);
        if (!entryExists) continue;
        try {
          await adapter.fs.readDir(fullPath);
          result.push({ name, path: fullPath, isDir: true });
        } catch {
          result.push({ name, path: fullPath, isDir: false });
        }
      } catch {
        // skip
      }
    }
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    entries.value = result;
  } catch (e) {
    console.error('loadEntries error:', e);
    entries.value = [];
  } finally {
    loading.value = false;
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
  selectedPath.value = '';
  loadEntries();
}

function goUp() {
  const p = currentPath.value;
  if (!p || p === '/' || p === 'workspace' || !p.includes('/')) return;
  const parts = p.split('/');
  parts.pop();
  currentPath.value = parts.join('/') || 'workspace';
  selectedPath.value = '';
  loadEntries();
}

function confirm() {
  emit('selected', currentPath.value);
  visible.value = false;
}
</script>

<style scoped>
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
