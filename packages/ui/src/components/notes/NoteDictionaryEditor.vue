<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus, Trash2, X } from 'lucide-vue-next';
import type { NoteDictionaryDefinition, NoteDictionaryItem } from '@yan-zhi/shared';

const props = defineProps<{
  visible: boolean;
  dictionary?: NoteDictionaryDefinition | null;
  externalError?: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: { name: string; description: string; items: NoteDictionaryItem[] }];
}>();

const name = ref('');
const description = ref('');
const items = ref<NoteDictionaryItem[]>([]);
const newItem = ref('');
const error = ref('');

watch(() => props.visible, (open) => {
  if (!open) return;
  name.value = props.dictionary?.name || '';
  description.value = props.dictionary?.description || '';
  items.value = (props.dictionary?.items || []).map((item) => ({ ...item }));
  newItem.value = '';
  error.value = '';
}, { immediate: true });

function addItem(): void {
  const label = newItem.value.trim();
  if (!label) return;
  if (items.value.some((item) => item.label === label && !item.archived)) {
    error.value = `选项「${label}」已存在`;
    return;
  }
  items.value.push({
    id: `item_${Date.now().toString(36)}`,
    label,
  });
  newItem.value = '';
  error.value = '';
}

function toggleArchived(item: NoteDictionaryItem): void {
  item.archived = !item.archived;
}

function removeItem(item: NoteDictionaryItem): void {
  if (item.archived) return;
  items.value = items.value.filter((entry) => entry.id !== item.id);
}

function save(): void {
  const cleanName = name.value.trim();
  if (!cleanName) {
    error.value = '请填写字典名称';
    return;
  }
  if (!items.value.length) {
    error.value = '至少添加一个选项';
    return;
  }
  emit('save', {
    name: cleanName,
    description: description.value.trim(),
    items: items.value,
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="nde-mask" @click.self="$emit('close')">
      <section class="nde-sheet" role="dialog" aria-modal="true" aria-labelledby="nde-title">
        <header>
          <div>
            <small>选项字典</small>
            <h3 id="nde-title">{{ dictionary ? '编辑字典' : '新建字典' }}</h3>
          </div>
          <button type="button" aria-label="关闭" @click="$emit('close')"><X :size="18" /></button>
        </header>

        <label class="nde-field">
          <span>字典名称</span>
          <input v-model="name" maxlength="40" placeholder="例如：客户类型、进货渠道" autofocus />
        </label>

        <label class="nde-field">
          <span>说明</span>
          <input v-model="description" maxlength="160" placeholder="这个字典会在哪些模板里使用" />
        </label>

        <div class="nde-field">
          <span>选项</span>
          <div class="nde-items">
            <span
              v-for="item in items"
              :key="item.id"
              class="nde-item"
              :class="{ archived: item.archived }"
            >
              <button type="button" class="nde-item-label" :aria-label="`${item.archived ? '启用' : '停用'} ${item.label}`" @click="toggleArchived(item)">
                {{ item.label }}<small v-if="item.archived">已停用</small>
              </button>
              <button type="button" class="nde-item-delete" :disabled="item.archived" :aria-label="`删除 ${item.label}`" @click="removeItem(item)">
                <Trash2 :size="13" />
              </button>
            </span>
          </div>
        </div>

        <div class="nde-add">
          <input
            v-model="newItem"
            maxlength="40"
            placeholder="新增一个选项"
            @keydown.enter.prevent="addItem"
          />
          <button type="button" aria-label="添加选项" @click="addItem"><Plus :size="18" /></button>
        </div>

        <p class="nde-hint">停用不会删除历史记录中的值；删除只影响尚未使用的新记录。</p>
        <p v-if="error || externalError" class="nde-error" role="alert">{{ error || externalError }}</p>

        <footer>
          <button type="button" class="secondary" @click="$emit('close')">取消</button>
          <button type="button" class="primary" @click="save">保存字典</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.nde-mask {
  position: fixed;
  inset: 0;
  z-index: 6600;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.46);
}

.nde-sheet {
  display: flex;
  width: min(560px, 100%);
  max-height: 88dvh;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border-radius: 22px 22px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.nde-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nde-sheet header small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.nde-sheet header h3 {
  margin: 2px 0 0;
  font-size: 20px;
}

.nde-sheet header button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.nde-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nde-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.nde-field input,
.nde-add input {
  width: 100%;
  min-height: 46px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 14px;
}

.nde-items {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.nde-item {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
}

.nde-item.archived {
  opacity: 0.56;
}

.nde-item-label {
  min-height: 44px;
  padding: 0 8px 0 12px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
}

.nde-item-label small {
  margin-left: 4px;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nde-item-delete {
  display: grid;
  width: 34px;
  height: 44px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--color-text-tertiary);
}

.nde-item-delete:disabled {
  opacity: 0.25;
}

.nde-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 8px;
}

.nde-add button {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 0;
  border-radius: 11px;
  background: var(--color-primary);
  color: #fff;
}

.nde-hint {
  margin: -2px 0 0;
  color: var(--color-text-tertiary);
  font-size: 10px;
  line-height: 1.55;
}

.nde-error {
  margin: 0;
  color: #b54737;
  font-size: 12px;
}

.nde-sheet footer {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  gap: 8px;
}

.nde-sheet footer button {
  min-height: 50px;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.nde-sheet footer .secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.nde-sheet footer .primary {
  border: 0;
  background: var(--color-primary);
  color: #fff;
}

@media (min-width: 760px) {
  .nde-mask {
    align-items: center;
    padding: 24px;
  }

  .nde-sheet {
    max-height: 82dvh;
    padding: 22px;
    border-radius: 18px;
  }
}
</style>
