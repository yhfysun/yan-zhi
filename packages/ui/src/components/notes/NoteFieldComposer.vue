<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import {
  noteDictionaryById,
  type NoteDictionaryDefinition,
  NoteFieldAggregate,
  NoteFieldType,
  NoteTemplateField,
} from '@yan-zhi/shared';

const props = defineProps<{
  visible: boolean;
  field?: NoteTemplateField | null;
  dictionaries: readonly NoteDictionaryDefinition[];
  fields?: readonly NoteTemplateField[];
}>();

const emit = defineEmits<{
  close: [];
  save: [field: NoteTemplateField];
}>();

const TYPE_OPTIONS: Array<{ type: NoteFieldType; label: string }> = [
  { type: 'text', label: '短文本' },
  { type: 'textarea', label: '长文本' },
  { type: 'number', label: '数字' },
  { type: 'amount', label: '金额' },
  { type: 'date', label: '日期' },
  { type: 'datetime', label: '日期时间' },
  { type: 'select', label: '单选' },
  { type: 'multiselect', label: '多选' },
  { type: 'checkbox', label: '开关' },
  { type: 'tags', label: '标签' },
  { type: 'product', label: '商品' },
];

const label = ref('');
const type = ref<NoteFieldType>('text');
const required = ref(false);
const placeholder = ref('');
const unit = ref('');
const dictionaryId = ref('');
const list = ref(false);
const aggregate = ref<'' | NoteFieldAggregate>('');
const conditionFieldKey = ref('');
const conditionValue = ref('');
const error = ref('');

const supportsDictionary = computed(() => type.value === 'select' || type.value === 'multiselect');
const supportsAggregate = computed(() => type.value === 'number' || type.value === 'amount');
const conditionCandidates = computed(() => (props.fields || []).filter((field) => (
  field.key !== props.field?.key
  && (field.type === 'select' || field.type === 'multiselect')
  && !!field.dictionaryId
)));
const conditionTrigger = computed(() => (
  conditionCandidates.value.find((field) => field.key === conditionFieldKey.value)
));
const conditionOptions = computed(() => {
  const dictionary = conditionTrigger.value?.dictionaryId
    ? noteDictionaryById(conditionTrigger.value.dictionaryId, props.dictionaries)
    : undefined;
  return dictionary?.items.filter((item) => !item.archived) || [];
});

watch(() => props.visible, (open) => {
  if (!open) return;
  label.value = props.field?.label || '';
  type.value = props.field?.type || 'text';
  required.value = props.field?.required === true;
  placeholder.value = props.field?.placeholder || '';
  unit.value = props.field?.unit || '';
  dictionaryId.value = props.field?.dictionaryId || '';
  list.value = props.field?.list === true;
  aggregate.value = props.field?.aggregate || '';
  conditionFieldKey.value = props.field?.visibleWhen?.field || '';
  conditionValue.value = props.field?.visibleWhen?.equals || '';
  error.value = '';
}, { immediate: true });

watch(type, (next) => {
  if (next !== 'select' && next !== 'multiselect') dictionaryId.value = '';
  if (next !== 'number' && next !== 'amount') aggregate.value = '';
});

watch(conditionFieldKey, () => {
  if (!conditionOptions.value.some((item) => item.id === conditionValue.value)) {
    conditionValue.value = '';
  }
});

function close(): void {
  emit('close');
}

function suggestKey(label: string, fieldType: NoteFieldType): string {
  const text = label.toLowerCase();
  let base = 'field';
  if (fieldType === 'amount') {
    if (/单价|价格/.test(text)) base = 'unitPrice';
    else if (/总额|合计|金额/.test(text)) base = /总额|合计/.test(text) ? 'total' : 'amount';
    else if (/成本/.test(text)) base = 'cost';
  } else if (fieldType === 'number') {
    if (/数量|件数/.test(text)) base = 'quantity';
    else if (/时长|分钟|小时/.test(text)) base = 'durationMinutes';
  } else if (fieldType === 'select' || fieldType === 'multiselect') {
    if (/分类|类型/.test(text)) base = 'category';
    else if (/账户|账号/.test(text)) base = 'account';
    else if (/状态/.test(text)) base = 'paymentStatus';
    else if (/优先级/.test(text)) base = 'priority';
  } else if (fieldType === 'datetime' || fieldType === 'date') {
    if (/计划|截止/.test(text)) base = 'planAt';
    else base = 'occurredAt';
  } else if (fieldType === 'checkbox') {
    if (/完成/.test(text)) base = 'done';
    else if (/提醒/.test(text)) base = 'remind';
  } else if (fieldType === 'tags') {
    base = 'tags';
  } else if (fieldType === 'product') {
    base = 'item';
  } else if (fieldType === 'text') {
    if (/商品|货品/.test(text)) base = 'item';
    else if (/供应商/.test(text)) base = 'supplier';
    else if (/渠道|客户/.test(text)) base = 'channel';
    else if (/标题|事项|任务/.test(text)) base = 'title';
    else if (/活动|做了/.test(text)) base = 'activity';
  } else if (fieldType === 'textarea') {
    base = /说明|备注|正文|内容/.test(text) ? (text.includes('正文') ? 'content' : 'note') : 'field';
  }
  const used = new Set((props.fields || []).map((field) => field.key));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function save(): void {
  const cleanLabel = label.value.trim();
  if (!cleanLabel) {
    error.value = '请填写字段名称';
    return;
  }
  if (supportsDictionary.value && !dictionaryId.value) {
    error.value = '单选或多选字段需要绑定一个字典';
    return;
  }
  const key = props.field?.key || suggestKey(cleanLabel, type.value);
  emit('save', {
    ...(props.field || {}),
    key,
    label: cleanLabel,
    type: type.value,
    required: required.value,
    placeholder: placeholder.value.trim() || undefined,
    unit: unit.value.trim() || undefined,
    dictionaryId: dictionaryId.value || undefined,
    list: list.value,
    aggregate: aggregate.value || undefined,
    visibleWhen: conditionFieldKey.value && conditionValue.value
      ? { field: conditionFieldKey.value, equals: conditionValue.value }
      : undefined,
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="nfc-mask" @click.self="close">
      <section class="nfc-sheet" role="dialog" aria-modal="true" aria-labelledby="nfc-title">
        <header>
          <div>
            <small>模板字段</small>
            <h3 id="nfc-title">{{ field ? '编辑字段' : '添加字段' }}</h3>
          </div>
          <button type="button" aria-label="关闭" @click="close"><X :size="18" /></button>
        </header>

        <label class="nfc-field">
          <span>字段名称</span>
          <input v-model="label" maxlength="40" placeholder="例如：供应商、支出分类、数量" autofocus />
        </label>

        <div class="nfc-field">
          <span>字段类型</span>
          <div class="nfc-types">
            <button
              v-for="option in TYPE_OPTIONS"
              :key="option.type"
              type="button"
              :class="{ active: type === option.type }"
              :aria-pressed="type === option.type"
              @click="type = option.type"
            >{{ option.label }}</button>
          </div>
        </div>

        <label v-if="supportsDictionary" class="nfc-field">
          <span>绑定字典</span>
          <select v-model="dictionaryId">
            <option value="">请选择字典</option>
            <option v-for="dictionary in dictionaries" :key="dictionary.id" :value="dictionary.id">
              {{ dictionary.name }}{{ dictionary.builtin ? '（内置）' : '' }}
            </option>
          </select>
        </label>

        <div class="nfc-grid">
          <label class="nfc-field">
            <span>提示文字</span>
            <input v-model="placeholder" maxlength="120" placeholder="用户填写时看到" />
          </label>
          <label v-if="type === 'number'" class="nfc-field">
            <span>单位</span>
            <input v-model="unit" maxlength="12" placeholder="件、小时、公斤" />
          </label>
        </div>

        <div class="nfc-checks">
          <label><input v-model="required" type="checkbox" /> 必填</label>
          <label><input v-model="list" type="checkbox" /> 在记录列表中显示摘要</label>
        </div>

        <label v-if="supportsAggregate" class="nfc-field">
          <span>统计方式</span>
          <select v-model="aggregate">
            <option value="">不统计</option>
            <option value="sum">求和</option>
            <option value="count">计数</option>
          </select>
        </label>

        <div v-if="conditionCandidates.length" class="nfc-field">
          <span>分类级显示条件</span>
          <div class="nfc-condition">
            <select v-model="conditionFieldKey">
              <option value="">始终显示</option>
              <option v-for="field in conditionCandidates" :key="field.key" :value="field.key">
                当「{{ field.label }}」
              </option>
            </select>
            <select v-if="conditionFieldKey" v-model="conditionValue">
              <option value="">选择分类</option>
              <option v-for="option in conditionOptions" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="error" class="nfc-error" role="alert">{{ error }}</p>

        <footer>
          <button type="button" class="secondary" @click="close">取消</button>
          <button type="button" class="primary" @click="save">保存字段</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.nfc-mask {
  position: fixed;
  inset: 0;
  z-index: 6500;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(12, 18, 21, 0.46);
}

.nfc-sheet {
  display: flex;
  width: min(560px, 100%);
  max-height: 88dvh;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
  padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border-radius: 22px 22px 0 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.nfc-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nfc-sheet header small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.nfc-sheet header h3 {
  margin: 2px 0 0;
  font-size: 20px;
}

.nfc-sheet header button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.nfc-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.nfc-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.nfc-field input,
.nfc-field select {
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

.nfc-field input:focus,
.nfc-field select:focus {
  border-color: var(--color-primary);
}

.nfc-types {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.nfc-types button {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 12px;
}

.nfc-types button.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
}

.nfc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.nfc-condition {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.nfc-checks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nfc-checks label {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.nfc-checks input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

.nfc-error {
  margin: 0;
  color: #b54737;
  font-size: 12px;
}

.nfc-sheet footer {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  gap: 8px;
  margin-top: 2px;
}

.nfc-sheet footer button {
  min-height: 50px;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.nfc-sheet footer .secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.nfc-sheet footer .primary {
  border: 0;
  background: var(--color-primary);
  color: #fff;
}

@media (min-width: 760px) {
  .nfc-mask {
    align-items: center;
    padding: 24px;
  }

  .nfc-sheet {
    max-height: 82dvh;
    padding: 22px;
    border-radius: 18px;
  }
}

@media (max-width: 420px) {
  .nfc-grid {
    grid-template-columns: 1fr;
  }

  .nfc-condition {
    grid-template-columns: 1fr;
  }
}
</style>
