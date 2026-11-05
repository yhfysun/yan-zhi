<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(860px, 94vw)"
    append-to-body
    destroy-on-close
    class="pa-editor-dialog"
    @update:model-value="close"
  >
    <div class="pa-editor">
      <div class="pa-editor-note">
        <span>页面资产以 JSON 契约保存。内置资产不可直接修改，维护操作会先生成用户草稿。</span>
        <span class="pa-editor-id">{{ parsedId || '未命名资产' }}</span>
      </div>

      <label class="pa-field">
        <span>变更说明</span>
        <el-input
          v-model="changeSummary"
          maxlength="160"
          placeholder="例如：更新抖音上传按钮语义锚点"
          show-word-limit
        />
      </label>

      <div class="pa-editor-toolbar">
        <span class="pa-editor-label">PageAssetSpec</span>
        <div class="pa-editor-actions">
          <el-button size="small" :icon="Braces" @click="formatJson">格式化</el-button>
          <el-button size="small" :icon="RotateCcw" @click="reset">恢复</el-button>
        </div>
      </div>

      <el-input
        v-model="jsonText"
        type="textarea"
        :rows="22"
        resize="vertical"
        spellcheck="false"
        class="pa-json-editor"
        aria-label="页面资产 JSON 契约"
        @keydown.ctrl.enter.prevent="submit"
        @keydown.meta.enter.prevent="submit"
      />

      <el-alert
        v-if="localError || error"
        :title="localError || error"
        type="error"
        :closable="false"
        show-icon
      />
      <p class="pa-editor-hint">快捷键 Ctrl / Cmd + Enter 保存。保存后仍需校验，启用会产生新版本。</p>
    </div>

    <template #footer>
      <el-button @click="close(false)">取消</el-button>
      <el-button type="primary" :loading="saving" :icon="Save" @click="submit">保存草稿</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Braces, RotateCcw, Save } from 'lucide-vue-next';
import type { PageAssetSpec } from '@yan-zhi/shared';
import { parsePageAssetSpecJson } from './pageAssetUi';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  initialSpec: PageAssetSpec | null;
  saving?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'save', payload: { spec: PageAssetSpec; changeSummary: string }): void;
}>();

const jsonText = ref('');
const changeSummary = ref('');
const localError = ref('');
const parsedId = computed(() => {
  const parsed = parsePageAssetSpecJson(jsonText.value);
  return parsed.ok ? parsed.spec.id : '';
});

watch(
  () => [props.modelValue, props.initialSpec] as const,
  ([open]) => {
    if (!open) return;
    jsonText.value = props.initialSpec ? JSON.stringify(props.initialSpec, null, 2) : '';
    changeSummary.value = '';
    localError.value = '';
  },
  { immediate: true },
);

function close(value = false): void {
  emit('update:modelValue', value);
}

function reset(): void {
  jsonText.value = props.initialSpec ? JSON.stringify(props.initialSpec, null, 2) : '';
  changeSummary.value = '';
  localError.value = '';
}

function formatJson(): void {
  const parsed = parsePageAssetSpecJson(jsonText.value);
  if (!parsed.ok) {
    localError.value = `JSON 格式错误：${parsed.error}`;
    return;
  }
  jsonText.value = JSON.stringify(parsed.spec, null, 2);
  localError.value = '';
}

function submit(): void {
  const parsed = parsePageAssetSpecJson(jsonText.value);
  if (!parsed.ok) {
    localError.value = `JSON 格式错误：${parsed.error}`;
    return;
  }
  if (!changeSummary.value.trim()) {
    localError.value = '请填写变更说明，便于后续回滚和审计';
    return;
  }
  localError.value = '';
  emit('save', { spec: parsed.spec, changeSummary: changeSummary.value.trim() });
}
</script>

<style scoped>
.pa-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pa-editor-note {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
}

.pa-editor-id {
  flex: 0 0 auto;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.pa-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.pa-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.pa-editor-label {
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-weight: 600;
}

.pa-editor-actions {
  display: flex;
  gap: var(--space-2);
}

.pa-json-editor :deep(textarea) {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: 1.65;
  tab-size: 2;
  white-space: pre;
}

.pa-editor-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

@media (max-width: 640px) {
  .pa-editor-note {
    flex-direction: column;
  }
}
</style>
