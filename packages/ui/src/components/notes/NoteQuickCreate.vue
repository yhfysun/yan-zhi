<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue';
import {
  ArrowLeft,
  ChevronRight,
  ListChecks,
  NotebookPen,
  PackageCheck,
  PackagePlus,
  Search,
  SunMedium,
  Timer,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-vue-next';
import type {
  NoteDictionaryDefinition,
  NoteTemplateData,
  NoteTemplateDefinition,
  NoteTemplateField,
  NoteTemplateKind,
} from '@yan-zhi/shared';
import { api } from '../../api/client';
import NoteTemplateForm from './NoteTemplateForm.vue';
import {
  buildRecordPayload,
  initialTemplateData,
} from './notes-view-model';

export interface NoteCategoryChoice {
  id: string;
  name: string;
  parentId?: string | null;
  path?: string[];
  depth?: number;
}

const props = defineProps<{
  visible: boolean;
  templates: readonly NoteTemplateDefinition[];
  dictionaries: readonly NoteDictionaryDefinition[];
  categories: readonly NoteCategoryChoice[];
  defaultCategoryName?: string;
  defaultCategoryId?: string;
  initialTemplateId?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const RECENT_KEY = 'yz.notes.recentTemplates.v1';
const ICONS: Record<string, Component> = {
  NotebookPen,
  SunMedium,
  WalletCards,
  TrendingUp,
  PackagePlus,
  PackageCheck,
  Timer,
  ListChecks,
};
const KIND_LABEL: Record<NoteTemplateKind, string> = {
  note: '笔记',
  journal: '日记',
  expense: '支出',
  income: '收入',
  purchase: '进货',
  sale: '出货',
  time: '时间',
  task: '计划',
  custom: '自定义',
};

const selectedId = ref('');
const query = ref('');
const data = ref<NoteTemplateData>({});
const directoryId = ref('');
const errors = ref<Record<string, string>>({});
const saving = ref(false);
const saveError = ref('');
const recentIds = ref<string[]>([]);
const sheetRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
let previousOverflow = '';

const selectedTemplate = computed(() =>
  props.templates.find((template) => template.id === selectedId.value),
);
const titleField = computed(() =>
  selectedTemplate.value?.fields.find((field) => field.key === selectedTemplate.value?.titleField),
);
const contentField = computed(() =>
  selectedTemplate.value?.fields.find((field) => field.key === selectedTemplate.value?.contentField),
);
const contentFirst = computed(() => (
  selectedTemplate.value?.kind === 'journal'
  || selectedTemplate.value?.kind === 'note'
  || selectedTemplate.value?.kind === 'task'
));

const pickerTemplates = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const recentRank = new Map(recentIds.value.map((id, index) => [id, index]));
  return [...props.templates]
    .filter((template) => !keyword || [
      template.name,
      template.description,
      KIND_LABEL[template.kind],
    ].join(' ').toLowerCase().includes(keyword))
    .sort((a, b) => {
      const ar = recentRank.get(a.id);
      const br = recentRank.get(b.id);
      if (ar !== undefined || br !== undefined) return (ar ?? 999) - (br ?? 999);
      return Number(!!b.builtin) - Number(!!a.builtin);
    });
});

function iconOf(name: string): Component {
  return ICONS[name] || NotebookPen;
}

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberTemplate(id: string): void {
  recentIds.value = [id, ...recentIds.value.filter((item) => item !== id)].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value)); } catch { /* optional */ }
}

function reset(): void {
  selectedId.value = '';
  query.value = '';
  errors.value = {};
  saveError.value = '';
  saving.value = false;
  directoryId.value = props.defaultCategoryId || '';
  recentIds.value = readRecent();
}

function chooseTemplate(template: NoteTemplateDefinition): void {
  selectedId.value = template.id;
  data.value = initialTemplateData(template);
  directoryId.value = props.defaultCategoryId || '';
  errors.value = {};
  saveError.value = '';
  rememberTemplate(template.id);
}

function backToPicker(): void {
  if (saving.value) return;
  selectedId.value = '';
  errors.value = {};
  saveError.value = '';
}

function setData(key: string, value: unknown): void {
  data.value = { ...data.value, [key]: value as any };
  if (errors.value[key]) {
    const next = { ...errors.value };
    delete next[key];
    errors.value = next;
  }
}

function setTitle(event: Event): void {
  if (!titleField.value) return;
  setData(titleField.value.key, (event.target as HTMLInputElement).value);
}

function validate(template: NoteTemplateDefinition): boolean {
  const next: Record<string, string> = {};
  for (const field of template.fields) {
    if (!field.required) continue;
    const value = data.value[field.key];
    if (
      value === null
      || value === undefined
      || value === ''
      || (Array.isArray(value) && value.length === 0)
    ) {
      next[field.key] = `请填写${field.label}`;
    }
  }
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function save(): Promise<void> {
  const template = selectedTemplate.value;
  if (!template || saving.value || !validate(template)) return;
  saving.value = true;
  saveError.value = '';
  try {
    const selectedDirectory = props.categories.find((item) => item.id === directoryId.value);
    const payload = buildRecordPayload(template, data.value, selectedDirectory?.name || props.defaultCategoryName || '');
    const titleField = template.fields.find((field) => field.key === template.titleField);
    if (titleField && !String(data.value[titleField.key] ?? '').trim()) {
      const categoryField = template.fields.find((field) => field.key === 'category');
      const dictionary = categoryField?.dictionaryId
        ? props.dictionaries.find((item) => item.id === categoryField.dictionaryId)
        : undefined;
      const categoryLabel = dictionary?.items.find((item) => item.id === data.value.category)?.label;
      if (categoryLabel) {
        payload.title = `${categoryLabel}${template.kind === 'expense' ? '支出' : template.kind === 'income' ? '收入' : ''}`;
      }
    }
    const response = await api.post('/notes/notes', {
      ...payload,
      categoryId: directoryId.value || undefined,
    });
    if (response && typeof response === 'object' && 'error' in response) {
      saveError.value = String((response as { error: unknown }).error);
      return;
    }
    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}

function close(): void {
  if (saving.value) return;
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

watch(() => props.visible, async (open) => {
  if (open) {
    reset();
    const initial = props.initialTemplateId
      ? props.templates.find((template) => template.id === props.initialTemplateId)
      : undefined;
    if (initial) chooseTemplate(initial);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    searchRef.value?.focus();
    return;
  }
  document.body.style.overflow = previousOverflow;
  document.removeEventListener('keydown', onKeydown);
}, { immediate: true });

watch(selectedId, async (id) => {
  if (!id) return;
  await nextTick();
  if (sheetRef.value) sheetRef.value.scrollTop = 0;
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="nqc">
      <div v-if="visible" class="nqc-mask" @click.self="close">
        <section
          ref="sheetRef"
          class="nqc-sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="selectedTemplate ? 'nqc-form-title' : 'nqc-picker-title'"
        >
          <span class="nqc-handle" aria-hidden="true"></span>

          <template v-if="!selectedTemplate">
            <header class="nqc-head">
              <div>
                <small>快速记录</small>
                <h2 id="nqc-picker-title">今天记什么？</h2>
              </div>
              <button type="button" class="nqc-icon-btn" aria-label="关闭" @click="close">
                <X :size="19" />
              </button>
            </header>

            <label class="nqc-search">
              <Search :size="17" />
              <input ref="searchRef" v-model="query" type="search" placeholder="搜索模板，例如支出、进货、日记" />
            </label>

            <div class="nqc-recent-note">
              <span>最近使用</span>
              <small>常用模板会自动排在前面</small>
            </div>

            <div class="nqc-template-list">
              <button
                v-for="template in pickerTemplates"
                :key="template.id"
                type="button"
                class="nqc-template"
                :data-tone="template.tone"
                @click="chooseTemplate(template)"
              >
                <span class="nqc-template-icon">
                  <component :is="iconOf(template.icon)" :size="21" />
                </span>
                <span class="nqc-template-copy">
                  <strong>{{ template.name }}</strong>
                  <small>{{ template.description }}</small>
                </span>
                <span class="nqc-template-kind">{{ KIND_LABEL[template.kind] }}</span>
                <ChevronRight :size="17" />
              </button>
              <div v-if="!pickerTemplates.length" class="nqc-empty">
                没有匹配模板。可以到模板工作台新建一个。
              </div>
            </div>
          </template>

          <template v-else>
            <header class="nqc-form-head">
              <button type="button" class="nqc-icon-btn" aria-label="返回模板列表" @click="backToPicker">
                <ArrowLeft :size="19" />
              </button>
              <div>
                <small>{{ KIND_LABEL[selectedTemplate.kind] }}</small>
                <h2 id="nqc-form-title">{{ selectedTemplate.name }}</h2>
              </div>
              <button type="button" class="nqc-icon-btn" aria-label="关闭" @click="close">
                <X :size="19" />
              </button>
            </header>

            <form class="nqc-form" @submit.prevent="save">
              <label v-if="titleField" class="nqc-title-field">
                <span>{{ titleField.label }}</span>
                <input
                  :value="String(data[titleField.key] ?? '')"
                  type="text"
                  :placeholder="titleField.placeholder"
                  autofocus
                  @input="setTitle"
                />
                <small v-if="errors[titleField.key]" role="alert">{{ errors[titleField.key] }}</small>
              </label>

              <label v-if="contentField && contentFirst" class="nqc-content-field">
                <span>{{ contentField.label }}</span>
                <textarea
                  :value="String(data[contentField.key] ?? '')"
                  :rows="contentField.rows || 7"
                  :placeholder="contentField.placeholder"
                  @input="setData(contentField.key, ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
                <small v-if="errors[contentField.key]" role="alert">{{ errors[contentField.key] }}</small>
              </label>

              <NoteTemplateForm
                :template="selectedTemplate"
                :model-value="data"
                :dictionaries="dictionaries"
                :errors="errors"
                @update:model-value="data = $event"
              />

              <label v-if="contentField && !contentFirst" class="nqc-content-field">
                <span>{{ contentField.label }}</span>
                <textarea
                  :value="String(data[contentField.key] ?? '')"
                  :rows="contentField.rows || 4"
                  :placeholder="contentField.placeholder"
                  @input="setData(contentField.key, ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
                <small v-if="errors[contentField.key]" role="alert">{{ errors[contentField.key] }}</small>
              </label>

              <label class="nqc-category-field">
                <span>归档到</span>
                <select v-model="directoryId">
                  <option value="">未分类</option>
                  <option v-for="category in categories.filter((item) => item.id !== '__none__')" :key="category.id" :value="category.id">
                    {{ category.path?.join(' / ') || category.name }}
                  </option>
                </select>
              </label>

              <p v-if="saveError" class="nqc-save-error" role="alert">{{ saveError }}</p>

              <footer class="nqc-footer">
                <button type="button" class="nqc-secondary" @click="close">取消</button>
                <button type="submit" class="nqc-primary" :disabled="saving">
                  {{ saving ? '保存中…' : '保存记录' }}
                </button>
              </footer>
            </form>
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nqc-mask {
  position: fixed;
  inset: 0;
  z-index: 6200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.48);
}

.nqc-sheet {
  position: relative;
  display: flex;
  width: min(680px, 100%);
  max-height: min(88dvh, 780px);
  flex-direction: column;
  overflow-y: auto;
  padding: 22px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 -18px 46px rgba(15, 23, 28, 0.2);
}

.nqc-handle {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 38px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--color-border-strong);
}

.nqc-head,
.nqc-form-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 14px;
}

.nqc-head {
  justify-content: space-between;
}

.nqc-head > div,
.nqc-form-head > div {
  min-width: 0;
  flex: 1;
}

.nqc-head small,
.nqc-form-head small {
  display: block;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.nqc-head h2,
.nqc-form-head h2 {
  margin: 2px 0 0;
  font-size: 21px;
  line-height: 1.25;
}

.nqc-icon-btn {
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

.nqc-search {
  display: flex;
  min-height: 46px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
}

.nqc-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.nqc-recent-note {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 2px 8px;
}

.nqc-recent-note span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.nqc-recent-note small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.nqc-template-list {
  display: grid;
  gap: 7px;
}

.nqc-template {
  display: grid;
  width: 100%;
  min-height: 66px;
  grid-template-columns: 44px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}

.nqc-template:active {
  background: var(--color-surface-hover);
  transform: scale(0.992);
}

.nqc-template-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 12px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.nqc-template[data-tone='rose'] .nqc-template-icon {
  background: #fdf0ef;
  color: #b84f43;
}

.nqc-template[data-tone='emerald'] .nqc-template-icon {
  background: #edf8f2;
  color: #2f7a5b;
}

.nqc-template[data-tone='orange'] .nqc-template-icon {
  background: #fff4e9;
  color: #b86a2c;
}

.nqc-template[data-tone='blue'] .nqc-template-icon {
  background: #eef5fc;
  color: #3f6e9c;
}

.nqc-template[data-tone='amber'] .nqc-template-icon {
  background: #fff8e7;
  color: #9a721e;
}

.nqc-template[data-tone='violet'] .nqc-template-icon {
  background: #f3f1fc;
  color: #6559a7;
}

.nqc-template-copy {
  min-width: 0;
}

.nqc-template-copy strong,
.nqc-template-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nqc-template-copy strong {
  font-size: 14px;
}

.nqc-template-copy small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.nqc-template-kind {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nqc-empty {
  padding: 36px 12px;
  color: var(--color-text-tertiary);
  font-size: 13px;
  text-align: center;
}

.nqc-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.nqc-title-field,
.nqc-content-field,
.nqc-category-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.nqc-title-field > span,
.nqc-content-field > span,
.nqc-category-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.nqc-title-field input {
  width: 100%;
  min-height: 54px;
  padding: 8px 2px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  outline: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 24px;
  font-weight: 750;
}

.nqc-content-field textarea,
.nqc-category-field select {
  width: 100%;
  min-height: 48px;
  padding: 11px 12px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  outline: none;
  resize: vertical;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 15px;
  line-height: 1.65;
}

.nqc-title-field input:focus,
.nqc-content-field textarea:focus,
.nqc-category-field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.nqc-title-field small,
.nqc-content-field small {
  color: #b54737;
  font-size: 11px;
}

.nqc-category-field select {
  font-size: 13px;
}

.nqc-save-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 9px;
  background: #fff1ef;
  color: #a63f32;
  font-size: 12px;
}

.nqc-footer {
  position: sticky;
  bottom: calc(-18px - env(safe-area-inset-bottom, 0px));
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
  gap: 9px;
  margin: 2px -16px calc(-18px - env(safe-area-inset-bottom, 0px));
  padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 94%, transparent);
  backdrop-filter: blur(12px);
}

.nqc-secondary,
.nqc-primary {
  min-height: 50px;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.nqc-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.nqc-primary {
  border: 0;
  background: var(--color-primary);
  color: #fff;
}

.nqc-primary:disabled {
  opacity: 0.58;
}

.nqc-enter-active,
.nqc-leave-active {
  transition: opacity 180ms ease;
}

.nqc-enter-active .nqc-sheet,
.nqc-leave-active .nqc-sheet {
  transition: transform 230ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nqc-enter-from,
.nqc-leave-to {
  opacity: 0;
}

.nqc-enter-from .nqc-sheet,
.nqc-leave-to .nqc-sheet {
  transform: translateY(100%);
}

@media (min-width: 760px) {
  .nqc-mask {
    align-items: center;
    padding: 24px;
  }

  .nqc-sheet {
    max-height: min(86dvh, 820px);
    padding: 26px 22px 20px;
    border-radius: 18px;
  }

  .nqc-footer {
    bottom: -20px;
    margin: 2px -22px -20px;
    padding: 12px 22px 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nqc-enter-active,
  .nqc-leave-active,
  .nqc-enter-active .nqc-sheet,
  .nqc-leave-active .nqc-sheet {
    transition-duration: 1ms;
  }
}
</style>
