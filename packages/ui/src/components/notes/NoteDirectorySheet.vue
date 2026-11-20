<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next';
import { api } from '../../api/client';

export interface NoteDirectoryItem {
  id: string;
  name: string;
  parentId: string | null;
  path: string[];
  depth: number;
  sort: number;
  count: number;
}

const props = defineProps<{
  visible: boolean;
  directories: readonly NoteDirectoryItem[];
  selectedId: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [id: string];
  changed: [];
}>();

type EditorState = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  parentId: string;
};

const collapsed = reactive<Set<string>>(new Set());
const editor = ref<EditorState | null>(null);
const error = ref('');
const saving = ref(false);

const realDirectories = computed(() => props.directories.filter((item) => item.id !== '__none__'));
const selected = computed(() => props.directories.find((item) => item.id === props.selectedId));
const selectedPath = computed(() => selected.value?.path?.join(' / ') || '全部目录');
const visibleRows = computed(() => {
  const children = new Map<string | null, NoteDirectoryItem[]>();
  for (const directory of realDirectories.value) {
    const list = children.get(directory.parentId) || [];
    list.push(directory);
    children.set(directory.parentId, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'));
  }
  const rows: Array<{ item: NoteDirectoryItem; hasChildren: boolean }> = [];
  const walk = (parentId: string | null) => {
    for (const item of children.get(parentId) || []) {
      const itemChildren = children.get(item.id) || [];
      rows.push({ item, hasChildren: itemChildren.length > 0 });
      if (!collapsed.has(item.id)) walk(item.id);
    }
  };
  walk(null);
  return rows;
});

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return null;
}

function toggle(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
}

function startCreate(parentId: string | null = null): void {
  editor.value = { mode: 'create', name: '', parentId: parentId || '' };
  error.value = '';
}

function startEdit(directory: NoteDirectoryItem): void {
  editor.value = {
    mode: 'edit',
    id: directory.id,
    name: directory.name,
    parentId: directory.parentId || '',
  };
  error.value = '';
}

function closeEditor(): void {
  if (saving.value) return;
  editor.value = null;
  error.value = '';
}

function descendantsOf(id: string): Set<string> {
  const out = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const directory of realDirectories.value) {
      if (directory.parentId && out.has(directory.parentId) && !out.has(directory.id)) {
        out.add(directory.id);
        changed = true;
      }
    }
  }
  return out;
}

const parentOptions = computed(() => {
  const excluded = editor.value?.mode === 'edit' && editor.value.id
    ? descendantsOf(editor.value.id)
    : new Set<string>();
  return realDirectories.value.filter((item) => !excluded.has(item.id));
});

async function save(): Promise<void> {
  const draft = editor.value;
  if (!draft || saving.value) return;
  const name = draft.name.trim();
  if (!name) {
    error.value = '请填写目录名称';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const response = draft.mode === 'create'
      ? await api.post('/notes/categories', {
        name,
        parentId: draft.parentId || null,
      })
      : await api.patch(`/notes/categories/${draft.id}`, {
        name,
        parentId: draft.parentId || null,
      });
    if (response && typeof response === 'object' && 'error' in response) {
      error.value = String((response as { error: unknown }).error);
      return;
    }
    const saved = unwrap<NoteDirectoryItem>(response);
    editor.value = null;
    emit('changed');
    if (saved) emit('select', saved.id);
  } finally {
    saving.value = false;
  }
}

async function remove(directory: NoteDirectoryItem): Promise<void> {
  if (!window.confirm(`删除目录「${directory.name}」？子目录会上移，记录会回到未分类。`)) return;
  const response = await api.delete(`/notes/categories/${directory.id}`);
  if (response && typeof response === 'object' && 'error' in response) {
    error.value = String((response as { error: unknown }).error);
    return;
  }
  if (props.selectedId === directory.id) emit('select', '__all__');
  emit('changed');
}

watch(() => props.visible, (open) => {
  if (!open) {
    editor.value = null;
    error.value = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="nds-mask" @click.self="$emit('close')">
      <section class="nds-sheet" role="dialog" aria-modal="true" aria-labelledby="nds-title">
        <header>
          <div>
            <small>记录目录</small>
            <h2 id="nds-title">{{ selectedPath }}</h2>
          </div>
          <button type="button" aria-label="关闭目录" @click="$emit('close')"><X :size="18" /></button>
        </header>

        <div class="nds-actions">
          <button type="button" class="all" :class="{ active: selectedId === '__all__' }" @click="$emit('select', '__all__'); $emit('close')">
            全部目录
          </button>
          <button type="button" class="new" @click="startCreate()"><Plus :size="15" />新建</button>
        </div>

        <form v-if="editor" class="nds-editor" @submit.prevent="save">
          <label>
            <span>目录名称</span>
            <input v-model="editor.name" maxlength="40" autofocus placeholder="例如：采购、餐饮、客户回访" />
          </label>
          <label>
            <span>上级目录</span>
            <select v-model="editor.parentId">
              <option value="">根目录</option>
              <option v-for="option in parentOptions" :key="option.id" :value="option.id">
                {{ option.path.join(' / ') }}
              </option>
            </select>
          </label>
          <p v-if="error" role="alert">{{ error }}</p>
          <div>
            <button type="button" @click="closeEditor">取消</button>
            <button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
          </div>
        </form>

        <div class="nds-list">
          <div class="nds-row uncategorized" :class="{ active: selectedId === '__none__' }">
            <button type="button" class="nds-select" @click="$emit('select', '__none__'); $emit('close')">
              <span>未分类</span>
              <small>{{ directories.find((item) => item.id === '__none__')?.count || 0 }}</small>
            </button>
          </div>
          <div
            v-for="row in visibleRows"
            :key="row.item.id"
            class="nds-row"
            :class="{ active: selectedId === row.item.id }"
            :style="{ '--depth': row.item.depth }"
          >
            <button
              v-if="row.hasChildren"
              type="button"
              class="nds-toggle"
              :aria-label="collapsed.has(row.item.id) ? `展开 ${row.item.name}` : `收起 ${row.item.name}`"
              @click="toggle(row.item.id)"
            >
              <ChevronRight v-if="collapsed.has(row.item.id)" :size="15" />
              <ChevronDown v-else :size="15" />
            </button>
            <span v-else class="nds-toggle-spacer"></span>
            <button type="button" class="nds-select" @click="$emit('select', row.item.id); $emit('close')">
              <span>{{ row.item.name }}</span>
              <small>{{ row.item.count }}</small>
            </button>
            <button type="button" aria-label="新建子目录" @click="startCreate(row.item.id)"><FolderPlus :size="15" /></button>
            <button type="button" aria-label="编辑目录" @click="startEdit(row.item)"><Pencil :size="15" /></button>
            <button type="button" aria-label="删除目录" @click="remove(row.item)"><Trash2 :size="15" /></button>
          </div>
          <div v-if="!visibleRows.length && !editor" class="nds-empty">
            还没有目录。新建一个，用目录把笔记、账本和经营记录分开。
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.nds-mask {
  position: fixed;
  inset: 0;
  z-index: 6300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.48);
}

.nds-sheet {
  display: flex;
  width: min(680px, 100%);
  max-height: 88dvh;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 18px 14px calc(14px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.nds-sheet > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nds-sheet > header small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.nds-sheet > header h2 {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nds-sheet > header button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.nds-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.nds-actions button,
.nds-editor button {
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}

.nds-actions .all {
  text-align: left;
  padding: 0 12px;
}

.nds-actions .all.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.nds-actions .new {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.nds-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.nds-editor label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.nds-editor label span {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.nds-editor input,
.nds-editor select {
  width: 100%;
  min-height: 44px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
}

.nds-editor p {
  grid-column: 1 / -1;
  margin: 0;
  color: #b54737;
  font-size: 11px;
}

.nds-editor > div {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: 0.7fr 1.3fr;
  gap: 8px;
}

.nds-editor button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.nds-list {
  display: grid;
  gap: 4px;
}

.nds-row {
  display: grid;
  min-height: 48px;
  grid-template-columns: 30px minmax(0, 1fr) repeat(3, 44px);
  align-items: center;
  gap: 2px;
  padding: 2px 4px 2px calc(4px + var(--depth, 0) * 12px);
  border-radius: 10px;
}

.nds-row.uncategorized {
  grid-template-columns: minmax(0, 1fr);
}

.nds-row.active {
  background: var(--color-primary-soft);
}

.nds-row > button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text-tertiary);
}

.nds-row > button:active {
  background: var(--color-surface-hover);
}

.nds-toggle,
.nds-toggle-spacer {
  width: 30px;
  height: 44px;
}

.nds-toggle {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--color-text-tertiary);
}

.nds-select {
  display: flex !important;
  width: auto !important;
  min-width: 0;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  color: var(--color-text) !important;
  text-align: left;
}

.nds-select span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nds-select small {
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nds-empty {
  padding: 30px 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 1.65;
  text-align: center;
}

@media (min-width: 760px) {
  .nds-mask {
    align-items: center;
    padding: 24px;
  }

  .nds-sheet {
    max-height: 82dvh;
    padding: 22px;
    border-radius: 18px;
  }
}

@media (max-width: 420px) {
  .nds-editor {
    grid-template-columns: 1fr;
  }

  .nds-row {
    grid-template-columns: 28px minmax(0, 1fr) repeat(3, 44px);
    padding-left: 2px;
  }
}
</style>
