<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import {
  noteDictionaryById,
  type NoteDictionaryDefinition,
  type NoteTemplateData,
  type NoteTemplateDefinition,
  type NoteTemplateField,
} from '@yan-zhi/shared';
import { inputValueToTimestamp, timestampToInputValue } from './notes-view-model';

const props = defineProps<{
  template: NoteTemplateDefinition;
  modelValue: NoteTemplateData;
  dictionaries: readonly NoteDictionaryDefinition[];
  errors?: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: NoteTemplateData];
}>();

const tagDrafts = reactive<Record<string, string>>({});
const localData = reactive<NoteTemplateData>({ ...props.modelValue });

watch(() => props.modelValue, (value) => {
  for (const key of Object.keys(localData)) {
    if (!(key in value)) delete localData[key];
  }
  Object.assign(localData, value);
}, { deep: true });

const visibleFields = computed(() => props.template.fields.filter((field) => (
  field.key !== props.template.titleField
  && field.key !== props.template.contentField
  && (
    !field.visibleWhen
    || String(localData[field.visibleWhen.field] ?? '') === field.visibleWhen.equals
  )
)));
const tagFields = computed(() => visibleFields.value.filter((field) => field.type === 'tags'));

function fieldValue(field: NoteTemplateField): unknown {
  return localData[field.key];
}

function setValue(field: NoteTemplateField, value: unknown): void {
  localData[field.key] = value as any;
  emit('update:modelValue', { ...localData });
}

function updateText(field: NoteTemplateField, event: Event): void {
  setValue(field, (event.target as HTMLInputElement | HTMLTextAreaElement).value);
}

function updateNumber(field: NoteTemplateField, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  setValue(field, raw === '' ? '' : Number(raw));
}

function updateDate(field: NoteTemplateField, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  setValue(field, inputValueToTimestamp(field, raw));
}

function dictionaryFor(field: NoteTemplateField): NoteDictionaryDefinition | undefined {
  return field.dictionaryId ? noteDictionaryById(field.dictionaryId, props.dictionaries) : undefined;
}

function availableOptions(field: NoteTemplateField) {
  return dictionaryFor(field)?.items.filter((item) => !item.archived) || [];
}

function chooseOption(field: NoteTemplateField, optionId: string): void {
  if (field.type === 'multiselect') {
    const current = Array.isArray(fieldValue(field)) ? fieldValue(field) as string[] : [];
    setValue(field, current.includes(optionId)
      ? current.filter((item) => item !== optionId)
      : [...current, optionId]);
    return;
  }
  setValue(field, fieldValue(field) === optionId ? '' : optionId);
}

function optionSelected(field: NoteTemplateField, optionId: string): boolean {
  const value = fieldValue(field);
  return Array.isArray(value) ? value.includes(optionId) : value === optionId;
}

function addTag(field: NoteTemplateField): void {
  const draft = String(tagDrafts[field.key] || '').trim();
  if (!draft) return;
  const current = Array.isArray(fieldValue(field)) ? fieldValue(field) as string[] : [];
  if (!current.includes(draft)) setValue(field, [...current, draft]);
  tagDrafts[field.key] = '';
}

function removeTag(field: NoteTemplateField, tag: string): void {
  const current = Array.isArray(fieldValue(field)) ? fieldValue(field) as string[] : [];
  setValue(field, current.filter((item) => item !== tag));
}

function inputMode(field: NoteTemplateField): 'decimal' | 'numeric' | 'text' {
  if (field.type === 'amount') return 'decimal';
  if (field.type === 'number') return 'numeric';
  return 'text';
}

function derivedAmount(field: NoteTemplateField): number | null {
  if (field.derived !== 'quantity_x_unitPrice') return null;
  const quantity = Number(localData.quantity);
  const unitPrice = Number(localData.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return Math.round(quantity * unitPrice * 100) / 100;
}

watch(
  () => [localData.quantity, localData.unitPrice, props.template.id],
  () => {
    const derivedField = props.template.fields.find((field) => field.derived === 'quantity_x_unitPrice');
    if (!derivedField) return;
    const next = derivedAmount(derivedField);
    if (next === null || localData[derivedField.key] === next) return;
    localData[derivedField.key] = next;
    emit('update:modelValue', { ...localData });
  },
);
</script>

<template>
  <div class="ntf-fields">
    <div
      v-for="field in visibleFields"
      :key="field.key"
      class="ntf-field"
      :class="[
        `is-${field.type}`,
        { 'is-full': field.width !== 'half', 'has-error': errors?.[field.key] },
      ]"
    >
      <div class="ntf-label-row">
        <label :for="`ntf-${field.key}`">{{ field.label }}</label>
        <span v-if="field.required" class="ntf-required">必填</span>
        <span v-else class="ntf-optional">选填</span>
      </div>

      <div v-if="field.type === 'amount'" class="ntf-amount">
        <span>¥</span>
        <input
          :id="`ntf-${field.key}`"
          :value="fieldValue(field) ?? ''"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          :placeholder="field.placeholder || '0.00'"
          :readonly="field.derived === 'quantity_x_unitPrice'"
          @input="updateNumber(field, $event)"
        />
        <small v-if="field.derived === 'quantity_x_unitPrice'">自动计算</small>
      </div>

      <textarea
        v-else-if="field.type === 'textarea'"
        :id="`ntf-${field.key}`"
        :value="String(fieldValue(field) ?? '')"
        :rows="field.rows || 4"
        :placeholder="field.placeholder"
        @input="updateText(field, $event)"
      ></textarea>

      <div v-else-if="field.type === 'select' || field.type === 'multiselect'" class="ntf-options">
        <button
          v-for="option in availableOptions(field)"
          :key="option.id"
          type="button"
          class="ntf-option"
          :class="{ active: optionSelected(field, option.id) }"
          :aria-pressed="optionSelected(field, option.id)"
          @click="chooseOption(field, option.id)"
        >
          {{ option.label }}
        </button>
        <span v-if="!availableOptions(field).length" class="ntf-empty-options">这个字典还没有可用选项</span>
      </div>

      <div v-else-if="field.type === 'tags'" class="ntf-tags">
        <button
          v-for="tag in (Array.isArray(fieldValue(field)) ? fieldValue(field) as string[] : [])"
          :key="tag"
          type="button"
          class="ntf-tag"
          :aria-label="`删除标签 ${tag}`"
          @click="removeTag(field, tag)"
        >
          {{ tag }} <span aria-hidden="true">×</span>
        </button>
        <input
          :id="`ntf-${field.key}`"
          v-model="tagDrafts[field.key]"
          type="text"
          :placeholder="field.placeholder || '输入后回车'"
          @keydown.enter.prevent="addTag(field)"
          @blur="addTag(field)"
        />
      </div>

      <label v-else-if="field.type === 'checkbox'" class="ntf-switch">
        <input
          :id="`ntf-${field.key}`"
          type="checkbox"
          :checked="fieldValue(field) === true"
          @change="setValue(field, ($event.target as HTMLInputElement).checked)"
        />
        <span class="ntf-switch-track" aria-hidden="true"><i></i></span>
        <span>{{ field.placeholder || '开启' }}</span>
      </label>

      <input
        v-else-if="field.type === 'date' || field.type === 'datetime'"
        :id="`ntf-${field.key}`"
        :value="timestampToInputValue(field, fieldValue(field))"
        :type="field.type === 'date' ? 'date' : 'datetime-local'"
        @input="updateDate(field, $event)"
      />

      <div v-else-if="field.type === 'number'" class="ntf-number">
        <input
          :id="`ntf-${field.key}`"
          :value="fieldValue(field) ?? ''"
          type="number"
          :inputmode="inputMode(field)"
          :min="field.min"
          :max="field.max"
          :placeholder="field.placeholder"
          @input="updateNumber(field, $event)"
        />
        <span v-if="field.unit">{{ field.unit }}</span>
      </div>

      <input
        v-else
        :id="`ntf-${field.key}`"
        :value="String(fieldValue(field) ?? '')"
        type="text"
        :inputmode="inputMode(field)"
        :placeholder="field.placeholder"
        @input="updateText(field, $event)"
      />

      <p v-if="errors?.[field.key]" class="ntf-error" role="alert">{{ errors[field.key] }}</p>
    </div>
  </div>
</template>

<style scoped>
.ntf-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 10px;
}

.ntf-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.ntf-field.is-full {
  grid-column: 1 / -1;
}

.ntf-label-row {
  display: flex;
  min-height: 20px;
  align-items: center;
  gap: 6px;
}

.ntf-label-row label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 650;
}

.ntf-required,
.ntf-optional {
  margin-left: auto;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.ntf-required {
  color: #b54737;
}

.ntf-field input:not([type='checkbox']),
.ntf-field textarea {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 15px;
}

.ntf-field textarea {
  min-height: 96px;
  resize: vertical;
  line-height: 1.65;
}

.ntf-field input:focus,
.ntf-field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.ntf-field.has-error input,
.ntf-field.has-error textarea,
.ntf-field.has-error .ntf-amount,
.ntf-field.has-error .ntf-number {
  border-color: #b54737;
}

.ntf-amount,
.ntf-number {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.ntf-amount span {
  color: var(--color-text-secondary);
  font-size: 20px;
  font-weight: 700;
}

.ntf-amount small {
  margin-left: auto;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

.ntf-amount input,
.ntf-number input {
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  font-size: 24px !important;
  font-weight: 700;
}

.ntf-field .ntf-amount input[readonly] {
  color: var(--color-text-secondary);
}

.ntf-number input {
  font-size: 18px !important;
}

.ntf-number span {
  flex: none;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.ntf-options {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ntf-option,
.ntf-tag {
  min-height: 44px;
  padding: 0 13px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
}

.ntf-option:active,
.ntf-tag:active {
  transform: scale(0.97);
}

.ntf-option.active {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
}

.ntf-empty-options {
  padding: 9px 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.ntf-tags {
  display: flex;
  min-height: 46px;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-surface);
}

.ntf-tags input {
  min-width: 100px;
  min-height: 34px !important;
  flex: 1;
  padding: 0 6px !important;
  border: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.ntf-tag {
  min-height: 36px;
  padding: 0 9px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.ntf-switch {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.ntf-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.ntf-switch-track {
  position: relative;
  display: block;
  width: 46px;
  height: 28px;
  flex: none;
  border-radius: 999px;
  background: var(--color-border);
  transition: background 160ms ease;
}

.ntf-switch-track i {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(20, 27, 32, 0.24);
  transition: transform 160ms ease;
}

.ntf-switch input:checked + .ntf-switch-track {
  background: var(--color-primary);
}

.ntf-switch input:checked + .ntf-switch-track i {
  transform: translateX(18px);
}

.ntf-switch input:focus-visible + .ntf-switch-track {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}

.ntf-error {
  margin: 0;
  color: #b54737;
  font-size: 11px;
}

@media (max-width: 520px) {
  .ntf-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .ntf-field:not(.is-full) {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ntf-switch-track,
  .ntf-switch-track i {
    transition: none;
  }
}
</style>
