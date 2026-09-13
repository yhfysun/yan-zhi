<template>
  <div v-if="modelValue" class="ccp-mask" @mousedown.self="emit('close')">
    <div class="ccp" @mousedown.stop>
      <div class="ccp-input-row">
        <el-icon :size="15" class="ccp-ico"><Search /></el-icon>
        <input
          ref="inputRef"
          v-model="query"
          class="ccp-input"
          :placeholder="isCommand ? '输入命令…' : '搜索文件…（输入 > 执行命令）'"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="runActive"
          @keydown.esc.prevent="emit('close')"
        />
        <span class="ccp-mode">{{ isCommand ? '命令' : '文件' }}</span>
      </div>

      <div ref="listRef" class="ccp-list">
        <button
          v-for="(it, i) in items"
          :key="it.id"
          class="ccp-item"
          :class="{ on: i === activeIdx }"
          :title="it.hint || it.label"
          @mousedown.prevent="run(it)"
          @mousemove="activeIdx = i"
        >
          <el-icon :size="14" class="ccp-item-ico"><component :is="it.icon" /></el-icon>
          <span class="ccp-item-label">{{ it.label }}</span>
          <span v-if="it.hint" class="ccp-item-hint">{{ it.hint }}</span>
        </button>
        <div v-if="!items.length" class="ccp-empty">
          <template v-if="isCommand">没有匹配的命令</template>
          <template v-else-if="indexLoading">正在建立文件索引…</template>
          <template v-else>没有匹配的文件</template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  Search, Files, Share, Aim, DocumentChecked, CircleClose,
  Bottom, FolderOpened, Fold, Refresh, Document, Setting,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';
import { useCodeStore, type SidebarView } from '../../stores/code';
import { useFileIndex } from '../../composables/useFileIndex';
import { openProjectSwitcher } from '../../composables/useProjectSwitcher';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ close: []; 'open-new': [] }>();

const code = useCodeStore();

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: Component;
  run: () => void;
}

const query = ref('');
const activeIdx = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const dirRef = computed(() => code.projectDir);
const index = useFileIndex(dirRef);
const indexLoading = computed(() => index.loading.value);

/** 以「>」开头走命令模式，否则搜索文件 */
const isCommand = computed(() => query.value.trimStart().startsWith('>'));

const commands: PaletteItem[] = [
  { id: 'view-explorer', label: '视图：资源管理器', hint: '侧栏', icon: Files, run: () => setView('explorer') },
  { id: 'view-search', label: '视图：搜索', hint: '侧栏', icon: Search, run: () => setView('search') },
  { id: 'view-git', label: '视图：源代码管理', hint: '侧栏', icon: Share, run: () => setView('git') },
  { id: 'view-run', label: '视图：运行与调试', hint: '侧栏', icon: Aim, run: () => setView('run') },
  { id: 'save', label: '保存当前文件', hint: 'Ctrl+S', icon: DocumentChecked, run: saveActive },
  { id: 'close-others', label: '关闭其他标签', icon: CircleClose, run: () => code.closeOthers(code.activePath || '') },
  { id: 'close-all', label: '关闭所有标签', icon: CircleClose, run: () => code.closeAll() },
  { id: 'collapse-all', label: '折叠所有目录', icon: Fold, run: () => code.runExplorerCommand('collapse-all') },
  { id: 'refresh-tree', label: '刷新资源管理器', icon: Refresh, run: () => code.runExplorerCommand('refresh') },
  { id: 'toggle-console', label: '切换控制台', icon: Bottom, run: () => code.toggleConsole() },
  { id: 'switch-project', label: '切换项目目录…', icon: FolderOpened, run: () => openProjectSwitcher() },
  { id: 'open-project', label: '打开新项目…', hint: '选择电脑目录', icon: FolderOpened, run: () => emit('open-new') },
  { id: 'settings-env', label: '打开设置：开发环境', icon: Setting, run: () => setView('run') },
];

const filteredCommands = computed<PaletteItem[]>(() => {
  const q = query.value.trimStart().replace(/^>\s*/, '').toLowerCase();
  if (!q) return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
});

const filteredFiles = computed<PaletteItem[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) {
    return index.files.value.slice(0, 60).map(toFileItem);
  }
  const hits = index.filenameMatch(q, 80);
  return hits.map(toFileItem);
});

function toFileItem(f: { name: string; relPath: string }): PaletteItem {
  return {
    id: 'file:' + f.relPath,
    label: f.name,
    hint: f.relPath,
    icon: Document,
    run: () => openFile(f.relPath, f.name),
  };
}

const items = computed<PaletteItem[]>(() => (isCommand.value ? filteredCommands.value : filteredFiles.value));

watch(items, () => { activeIdx.value = 0; });
watch(() => props.modelValue, (open) => {
  if (open) {
    query.value = '';
    activeIdx.value = 0;
    void index.ensure();
    void nextTick(() => inputRef.value?.focus());
  }
});

function setView(v: SidebarView) {
  code.sidebarView = v;
  emit('close');
}

function saveActive() {
  const f = code.activeFile;
  if (f) void code.saveFile(f.path);
  emit('close');
}

function openFile(relPath: string, name: string) {
  const base = code.projectDir.replace(/[\\/]+$/, '');
  const sep = code.projectDir.includes('\\') && !code.projectDir.includes('/') ? '\\' : '/';
  const abs = base + sep + relPath.split('/').join(sep);
  void code.openFile(abs, name);
  emit('close');
}

function move(delta: number) {
  const n = items.value.length;
  if (!n) return;
  activeIdx.value = (activeIdx.value + delta + n) % n;
  void nextTick(() => {
    listRef.value?.querySelector('.ccp-item.on')?.scrollIntoView({ block: 'nearest' });
  });
}

function runActive() {
  const it = items.value[activeIdx.value];
  if (it) run(it);
}

function run(it: PaletteItem) {
  it.run();
  // 命令里已各自处理 close（视图切换等）；此处兜底关闭
  if (props.modelValue) emit('close');
}
</script>

<style scoped>
.ccp-mask {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  background: rgba(15, 23, 42, 0.28);
}
.ccp {
  width: 560px; max-width: 92vw;
  background: var(--color-surface, #fff);
  border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.ccp-input-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.ccp-ico { color: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.ccp-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: 14px; font-family: inherit; color: var(--color-text, #1a1a1a);
}
.ccp-mode {
  flex-shrink: 0; font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  padding: 2px 7px; border-radius: 999px; background: var(--color-surface-hover);
}
.ccp-list { max-height: 46vh; overflow-y: auto; padding: 6px; }
.ccp-list::-webkit-scrollbar { width: 6px; }
.ccp-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #d8d4ca); border-radius: 999px; }
.ccp-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 8px; background: transparent;
  text-align: left; cursor: pointer; transition: background 0.1s ease;
}
.ccp-item.on { background: color-mix(in srgb, var(--color-primary, #c2410c) 11%, transparent); }
.ccp-item-ico { color: var(--color-text-secondary, #6b6b66); flex-shrink: 0; }
.ccp-item.on .ccp-item-ico { color: var(--color-primary, #c2410c); }
.ccp-item-label {
  font-size: 13px; color: var(--color-text, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccp-item-hint {
  margin-left: auto; flex-shrink: 0; max-width: 46%;
  font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ccp-empty { padding: 20px; text-align: center; font-size: 12.5px; color: var(--color-text-tertiary, #9c9b94); }
</style>
