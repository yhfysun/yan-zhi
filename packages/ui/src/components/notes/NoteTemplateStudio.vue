<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowLeft,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-vue-next';
import type {
  NoteDictionaryDefinition,
  NoteDictionaryItem,
  NoteTemplateDefinition,
  NoteTemplateField,
  NoteTemplateKind,
} from '@yan-zhi/shared';
import { api } from '../../api/client';
import NoteDictionaryEditor from './NoteDictionaryEditor.vue';
import NoteFieldComposer from './NoteFieldComposer.vue';

const props = defineProps<{
  visible: boolean;
  templates: readonly NoteTemplateDefinition[];
  dictionaries: readonly NoteDictionaryDefinition[];
}>();

const emit = defineEmits<{
  close: [];
  changed: [];
}>();

type TabKey = 'templates' | 'dictionaries';

const TYPE_LABEL: Record<NoteTemplateField['type'], string> = {
  text: '短文本',
  textarea: '长文本',
  number: '数字',
  amount: '金额',
  date: '日期',
  datetime: '日期时间',
  select: '单选',
  multiselect: '多选',
  checkbox: '开关',
  tags: '标签',
  product: '商品',
};
const KIND_OPTIONS: Array<{ value: NoteTemplateKind; label: string }> = [
  { value: 'custom', label: '自定义' },
  { value: 'note', label: '笔记' },
  { value: 'journal', label: '日记' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'purchase', label: '进货' },
  { value: 'sale', label: '出货' },
  { value: 'time', label: '时间' },
  { value: 'task', label: '任务计划' },
];

const activeTab = ref<TabKey>('templates');
const editing = ref<NoteTemplateDefinition | null>(null);
const isNewTemplate = ref(false);
const fieldComposerOpen = ref(false);
const editingFieldIndex = ref(-1);
const saveError = ref('');
const saving = ref(false);
const dictionaryEditorOpen = ref(false);
const editingDictionary = ref<NoteDictionaryDefinition | null>(null);

const customTemplates = computed(() => props.templates.filter((item) => !item.builtin));
const builtinTemplates = computed(() => props.templates.filter((item) => item.builtin));
const templateFields = computed(() => editing.value?.fields || []);
const editingField = computed(() => (
  editingFieldIndex.value >= 0 ? editing.value?.fields[editingFieldIndex.value] || null : null
));

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return null;
}

function cloneFields(fields: readonly NoteTemplateField[]): NoteTemplateField[] {
  return fields.map((field) => ({
    ...field,
    defaultValue: Array.isArray(field.defaultValue) ? [...field.defaultValue] : field.defaultValue,
  }));
}

function newTemplate(): NoteTemplateDefinition {
  const now = Date.now();
  return {
    id: `local_${now}`,
    name: '我的记录模板',
    description: '',
    icon: 'NotebookPen',
    tone: 'slate',
    kind: 'custom',
    fields: [
      { key: 'title', label: '标题', type: 'text', required: true, width: 'full' },
      { key: 'content', label: '内容', type: 'textarea', rows: 5, width: 'full' },
    ],
    titleField: 'title',
    contentField: 'content',
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

function startNew(): void {
  editing.value = newTemplate();
  isNewTemplate.value = true;
  saveError.value = '';
}

function editTemplate(template: NoteTemplateDefinition): void {
  if (template.builtin) return;
  editing.value = {
    ...template,
    fields: cloneFields(template.fields),
  };
  isNewTemplate.value = false;
  saveError.value = '';
}

function copyTemplate(template: NoteTemplateDefinition): void {
  const now = Date.now();
  editing.value = {
    ...template,
    id: `local_${now}`,
    name: `${template.name}副本`,
    builtin: false,
    fields: cloneFields(template.fields),
    createdAt: now,
    updatedAt: now,
  };
  isNewTemplate.value = true;
  saveError.value = '';
}

function closeEditor(): void {
  if (saving.value) return;
  editing.value = null;
  saveError.value = '';
}

function openFieldComposer(index = -1): void {
  editingFieldIndex.value = index;
  fieldComposerOpen.value = true;
}

function saveField(field: NoteTemplateField): void {
  if (!editing.value) return;
  const previousField = editingFieldIndex.value >= 0 ? editing.value.fields[editingFieldIndex.value] : null;
  let fields = [...editing.value.fields];
  if (editingFieldIndex.value >= 0) fields[editingFieldIndex.value] = field;
  else fields.push(field);
  const triggerStillValid = (
    (field.type === 'select' || field.type === 'multiselect')
    && !!field.dictionaryId
    && (!previousField || previousField.dictionaryId === field.dictionaryId)
  );
  if (!triggerStillValid) {
    fields = fields.map((item) => item.visibleWhen?.field === field.key
      ? { ...item, visibleWhen: undefined }
      : item);
  }
  editing.value = {
    ...editing.value,
    fields,
    titleField: fields.some((item) => item.key === editing.value?.titleField)
      ? editing.value.titleField
      : fields[0].key,
  };
  fieldComposerOpen.value = false;
  editingFieldIndex.value = -1;
}

function removeField(index: number): void {
  if (!editing.value || editing.value.fields.length <= 1) return;
  const removedKey = editing.value.fields[index]?.key;
  const fields = editing.value.fields
    .filter((_, itemIndex) => itemIndex !== index)
    .map((field) => field.visibleWhen?.field === removedKey
      ? { ...field, visibleWhen: undefined }
      : field);
  editing.value = {
    ...editing.value,
    fields,
    titleField: fields.some((item) => item.key === editing.value?.titleField)
      ? editing.value.titleField
      : fields[0].key,
    contentField: fields.some((item) => item.key === editing.value?.contentField)
      ? editing.value.contentField
      : undefined,
  };
}

function moveField(index: number, delta: -1 | 1): void {
  if (!editing.value) return;
  const target = index + delta;
  if (target < 0 || target >= editing.value.fields.length) return;
  const fields = [...editing.value.fields];
  [fields[index], fields[target]] = [fields[target], fields[index]];
  editing.value = { ...editing.value, fields };
}

async function saveTemplate(): Promise<void> {
  const draft = editing.value;
  if (!draft || saving.value) return;
  if (!draft.name.trim()) {
    saveError.value = '请填写模板名称';
    return;
  }
  if (!draft.fields.length) {
    saveError.value = '模板至少需要一个字段';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    const body = {
      name: draft.name,
      description: draft.description,
      icon: draft.icon,
      tone: draft.tone,
      kind: draft.kind,
      fields: draft.fields,
      titleField: draft.titleField,
      contentField: draft.contentField,
    };
    const response = isNewTemplate.value
      ? await api.post('/notes/templates', body)
      : await api.patch(`/notes/templates/${draft.id}`, body);
    if (response && typeof response === 'object' && 'error' in response) {
      saveError.value = String((response as { error: unknown }).error);
      return;
    }
    unwrap<NoteTemplateDefinition>(response);
    editing.value = null;
    emit('changed');
  } finally {
    saving.value = false;
  }
}

async function deleteTemplate(template: NoteTemplateDefinition): Promise<void> {
  if (template.builtin) return;
  if (!window.confirm(`删除模板「${template.name}」？历史记录不会删除。`)) return;
  const response = await api.delete(`/notes/templates/${template.id}`);
  if (response && typeof response === 'object' && 'error' in response) {
    saveError.value = String((response as { error: unknown }).error);
    return;
  }
  emit('changed');
}

function openNewDictionary(): void {
  saveError.value = '';
  editingDictionary.value = null;
  dictionaryEditorOpen.value = true;
}

function openDictionary(dictionary: NoteDictionaryDefinition): void {
  if (dictionary.builtin) return;
  saveError.value = '';
  editingDictionary.value = dictionary;
  dictionaryEditorOpen.value = true;
}

async function saveDictionary(value: {
  name: string;
  description: string;
  items: NoteDictionaryItem[];
}): Promise<void> {
  saveError.value = '';
  const editingId = editingDictionary.value?.id;
  const response = editingId
    ? await api.patch(`/notes/dictionaries/${editingId}`, value)
    : await api.post('/notes/dictionaries', value);
  if (response && typeof response === 'object' && 'error' in response) {
    saveError.value = String((response as { error: unknown }).error);
    return;
  }
  dictionaryEditorOpen.value = false;
  editingDictionary.value = null;
  emit('changed');
}

async function deleteDictionary(dictionary: NoteDictionaryDefinition): Promise<void> {
  if (dictionary.builtin) return;
  if (!window.confirm(`删除字典「${dictionary.name}」？绑定它的模板可能需要重新选择字典。`)) return;
  const response = await api.delete(`/notes/dictionaries/${dictionary.id}`);
  if (response && typeof response === 'object' && 'error' in response) {
    saveError.value = String((response as { error: unknown }).error);
    return;
  }
  emit('changed');
}

function dictionaryName(id?: string): string {
  if (!id) return '未绑定';
  return props.dictionaries.find((item) => item.id === id)?.name || '字典已失效';
}

function conditionLabel(field: NoteTemplateField): string {
  if (!field.visibleWhen) return '';
  const trigger = editing.value?.fields.find((item) => item.key === field.visibleWhen?.field);
  const dictionary = trigger?.dictionaryId
    ? props.dictionaries.find((item) => item.id === trigger.dictionaryId)
    : undefined;
  const option = dictionary?.items.find((item) => item.id === field.visibleWhen?.equals);
  return trigger ? ` · 当 ${trigger.label}=${option?.label || field.visibleWhen.equals}` : '';
}

watch(() => props.visible, (open) => {
  if (!open) {
    activeTab.value = 'templates';
    editing.value = null;
    saveError.value = '';
    dictionaryEditorOpen.value = false;
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="nts-mask" @click.self="$emit('close')">
      <section class="nts-shell" role="dialog" aria-modal="true" aria-labelledby="nts-title">
        <header class="nts-head">
          <div>
            <small>记录设置</small>
            <h2 id="nts-title">模板与字典</h2>
          </div>
          <button type="button" class="nts-close" aria-label="关闭模板工作台" @click="$emit('close')">
            <X :size="19" />
          </button>
        </header>

        <div class="nts-tabs" role="tablist" aria-label="模板工作台分栏">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'templates'"
            :class="{ active: activeTab === 'templates' }"
            @click="activeTab = 'templates'; editing = null"
          ><BookOpenText :size="16" />模板</button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'dictionaries'"
            :class="{ active: activeTab === 'dictionaries' }"
            @click="activeTab = 'dictionaries'; editing = null"
          ><Database :size="16" />字典</button>
        </div>

        <div class="nts-body">
          <template v-if="activeTab === 'templates'">
            <template v-if="!editing">
              <div class="nts-section-head">
                <div><strong>我的模板</strong><small>{{ customTemplates.length }} 个</small></div>
                <button type="button" class="nts-primary" @click="startNew"><Plus :size="16" />新建模板</button>
              </div>

              <div v-if="customTemplates.length" class="nts-list">
                <article v-for="template in customTemplates" :key="template.id" class="nts-template-row">
                  <div>
                    <strong>{{ template.name }}</strong>
                    <small>{{ template.fields.length }} 个字段 · {{ template.description || '自定义模板' }}</small>
                  </div>
                  <button type="button" aria-label="编辑模板" @click="editTemplate(template)"><Pencil :size="15" /></button>
                  <button type="button" aria-label="删除模板" @click="deleteTemplate(template)"><Trash2 :size="15" /></button>
                </article>
              </div>
              <div v-else class="nts-empty">
                <BookOpenText :size="24" />
                <strong>还没有自定义模板</strong>
                <span>从空白新建，或者复制一个内置模板再改字段。</span>
              </div>

              <div class="nts-section-head builtin-head">
                <div><strong>内置模板</strong><small>可直接使用，也可以复制后修改</small></div>
              </div>
              <div class="nts-list">
                <article v-for="template in builtinTemplates" :key="template.id" class="nts-template-row">
                  <div>
                    <strong>{{ template.name }}</strong>
                    <small>{{ template.fields.length }} 个字段 · {{ template.description }}</small>
                  </div>
                  <button type="button" aria-label="复制内置模板" @click="copyTemplate(template)"><Copy :size="15" /></button>
                </article>
              </div>
            </template>

            <template v-else>
              <header class="nts-editor-head">
                <button type="button" aria-label="返回模板列表" @click="closeEditor"><ArrowLeft :size="18" /></button>
                <div><small>{{ isNewTemplate ? '新模板' : '编辑模板' }}</small><h3>{{ editing.name }}</h3></div>
                <button type="button" class="nts-primary compact" :disabled="saving" @click="saveTemplate">
                  <Save :size="16" />{{ saving ? '保存中' : '保存' }}
                </button>
              </header>

              <div class="nts-editor-grid">
                <label class="nts-field">
                  <span>模板名称</span>
                  <input v-model="editing.name" maxlength="40" />
                </label>
                <label class="nts-field">
                  <span>模板类型</span>
                  <select v-model="editing.kind">
                    <option v-for="option in KIND_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label class="nts-field full">
                  <span>说明</span>
                  <input v-model="editing.description" maxlength="160" placeholder="说明这个模板适合记录什么" />
                </label>
                <label class="nts-field">
                  <span>标题字段</span>
                  <select v-model="editing.titleField">
                    <option v-for="field in editing.fields" :key="field.key" :value="field.key">{{ field.label }}</option>
                  </select>
                </label>
                <label class="nts-field">
                  <span>正文字段</span>
                  <select :value="editing.contentField || ''" @change="editing.contentField = ($event.target as HTMLSelectElement).value || undefined">
                    <option value="">无</option>
                    <option v-for="field in editing.fields" :key="field.key" :value="field.key">{{ field.label }}</option>
                  </select>
                </label>
              </div>

              <div class="nts-section-head">
                <div><strong>字段</strong><small>顺序就是手机填写时的顺序</small></div>
                <button type="button" class="nts-soft" @click="openFieldComposer()"><Plus :size="15" />添加字段</button>
              </div>

              <div class="nts-field-list">
                <article v-for="(field, index) in editing.fields" :key="field.key" class="nts-field-row">
                  <span class="nts-field-order">{{ index + 1 }}</span>
                  <div>
                    <strong>{{ field.label }}<i v-if="field.required">必填</i></strong>
                    <small>{{ TYPE_LABEL[field.type] }}<template v-if="field.dictionaryId"> · {{ dictionaryName(field.dictionaryId) }}</template>{{ conditionLabel(field) }}</small>
                  </div>
                  <button type="button" :disabled="index === 0" aria-label="上移字段" @click="moveField(index, -1)"><ChevronUp :size="15" /></button>
                  <button type="button" :disabled="index === editing.fields.length - 1" aria-label="下移字段" @click="moveField(index, 1)"><ChevronDown :size="15" /></button>
                  <button type="button" aria-label="编辑字段" @click="openFieldComposer(index)"><Pencil :size="15" /></button>
                  <button type="button" :disabled="editing.fields.length <= 1" aria-label="删除字段" @click="removeField(index)"><Trash2 :size="15" /></button>
                </article>
              </div>

              <p v-if="saveError" class="nts-error" role="alert">{{ saveError }}</p>
            </template>
          </template>

          <template v-else>
            <div class="nts-section-head">
              <div><strong>选项字典</strong><small>模板单选字段会绑定到这里</small></div>
              <button type="button" class="nts-primary" @click="openNewDictionary"><Plus :size="16" />新建字典</button>
            </div>

            <div class="nts-list">
              <article v-for="dictionary in dictionaries" :key="dictionary.id" class="nts-dict-row">
                <div>
                  <strong>{{ dictionary.name }}<i v-if="dictionary.builtin">内置</i></strong>
                  <small>{{ dictionary.description || '暂无说明' }}</small>
                  <span>{{ dictionary.items.filter((item) => !item.archived).slice(0, 8).map((item) => item.label).join(' · ') }}</span>
                </div>
                <button v-if="!dictionary.builtin" type="button" aria-label="编辑字典" @click="openDictionary(dictionary)"><Pencil :size="15" /></button>
                <button v-if="!dictionary.builtin" type="button" aria-label="删除字典" @click="deleteDictionary(dictionary)"><Trash2 :size="15" /></button>
              </article>
            </div>
          </template>
        </div>
      </section>
    </div>

    <NoteFieldComposer
      :visible="fieldComposerOpen"
      :field="editingField"
      :dictionaries="dictionaries"
      :fields="editing?.fields || []"
      @close="fieldComposerOpen = false"
      @save="saveField"
    />
    <NoteDictionaryEditor
      :visible="dictionaryEditorOpen"
      :dictionary="editingDictionary"
      :external-error="saveError"
      @close="dictionaryEditorOpen = false"
      @save="saveDictionary"
    />
  </Teleport>
</template>

<style scoped>
.nts-mask {
  position: fixed;
  inset: 0;
  z-index: 6400;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.48);
}

.nts-shell {
  display: flex;
  width: min(820px, 100%);
  max-height: 92dvh;
  flex-direction: column;
  overflow: hidden;
  padding: 18px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.nts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 12px;
}

.nts-head small,
.nts-editor-head small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.nts-head h2 {
  margin: 2px 0 0;
  font-size: 21px;
}

.nts-close,
.nts-editor-head > button:first-child {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.nts-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--color-surface-hover);
}

.nts-tabs button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
}

.nts-tabs button.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 4px rgba(22, 30, 35, 0.08);
}

.nts-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 12px 2px 4px;
}

.nts-section-head {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nts-section-head > div {
  min-width: 0;
}

.nts-section-head strong,
.nts-section-head small {
  display: block;
}

.nts-section-head strong {
  font-size: 14px;
}

.nts-section-head small {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.builtin-head {
  margin-top: 8px;
  border-top: 1px solid var(--color-border);
}

.nts-primary,
.nts-soft {
  display: inline-flex;
  min-height: 44px;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 12px;
  border-radius: 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.nts-primary {
  border: 0;
  background: var(--color-primary);
  color: #fff;
}

.nts-primary.compact {
  min-height: 44px;
}

.nts-primary:disabled {
  opacity: 0.55;
}

.nts-soft {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.nts-list {
  display: grid;
  gap: 7px;
}

.nts-template-row,
.nts-dict-row {
  display: grid;
  min-height: 62px;
  align-items: center;
  gap: 5px;
  padding: 9px 8px 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface);
}

.nts-template-row {
  grid-template-columns: minmax(0, 1fr) 44px 44px;
}

.nts-dict-row {
  grid-template-columns: minmax(0, 1fr) 44px 44px;
}

.nts-template-row > div,
.nts-dict-row > div {
  min-width: 0;
}

.nts-template-row strong,
.nts-template-row small,
.nts-dict-row strong,
.nts-dict-row small,
.nts-dict-row span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nts-template-row strong,
.nts-dict-row strong {
  font-size: 13px;
}

.nts-template-row small,
.nts-dict-row small {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.nts-dict-row span {
  margin-top: 4px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.nts-dict-row strong i,
.nts-field-row strong i {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
  font-weight: 650;
}

.nts-template-row > button,
.nts-dict-row > button,
.nts-field-row > button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text-tertiary);
}

.nts-template-row > button:active,
.nts-dict-row > button:active,
.nts-field-row > button:active {
  background: var(--color-surface-hover);
}

.nts-empty {
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 30px 16px;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.nts-empty strong {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.nts-empty span {
  max-width: 300px;
  font-size: 10px;
  line-height: 1.55;
}

.nts-editor-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding-bottom: 12px;
}

.nts-editor-head > div {
  min-width: 0;
}

.nts-editor-head h3 {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nts-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-bottom: 10px;
}

.nts-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.nts-field.full {
  grid-column: 1 / -1;
}

.nts-field > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.nts-field input,
.nts-field select {
  width: 100%;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}

.nts-field input:focus,
.nts-field select:focus {
  border-color: var(--color-primary);
}

.nts-field-list {
  display: grid;
  gap: 6px;
}

.nts-field-row {
  display: grid;
  min-height: 58px;
  grid-template-columns: 28px minmax(0, 1fr) repeat(4, 44px);
  align-items: center;
  gap: 2px;
  padding: 6px 5px 6px 7px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
}

.nts-field-order {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 7px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.nts-field-row > div {
  min-width: 0;
}

.nts-field-row strong,
.nts-field-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nts-field-row strong {
  font-size: 12px;
}

.nts-field-row small {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.nts-field-row > button:disabled {
  opacity: 0.22;
}

.nts-error {
  margin: 10px 0 0;
  padding: 9px 10px;
  border-radius: 8px;
  background: #fff1ef;
  color: #a63f32;
  font-size: 11px;
}

@media (min-width: 760px) {
  .nts-mask {
    align-items: center;
    padding: 24px;
  }

  .nts-shell {
    max-height: 86dvh;
    padding: 22px;
    border-radius: 18px;
  }
}

@media (max-width: 520px) {
  .nts-editor-grid {
    grid-template-columns: 1fr;
  }

  .nts-field.full {
    grid-column: auto;
  }

  .nts-field-row {
    grid-template-columns: 22px minmax(0, 1fr) repeat(4, 44px);
  }
}
</style>
