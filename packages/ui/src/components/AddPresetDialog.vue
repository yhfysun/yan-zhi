<template>
  <el-dialog
    :model-value="modelValue"
    :title="preset ? `添加 ${preset.name}` : '添加厂商平台'"
    width="520px"
    top="8vh"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="API 格式">
        <el-select v-model="form.protocol" style="width: 100%" @change="onProtocolChange">
          <el-option
            v-for="f in API_FORMATS"
            :key="f.value"
            :label="f.label"
            :value="f.value"
            :disabled="preset ? !(preset.protocol === f.value || preset.urlByProtocol?.[f.value]) : false"
          />
        </el-select>
        <div class="cm-tip">厂商支持的格式之外已禁用（与目录端点对齐）</div>
      </el-form-item>
      <el-form-item label="API 地址">
        <el-input v-model="form.apiUrl" placeholder="https://..." />
        <div class="cm-tip">已按厂商默认值预填；用户手改过的中转地址不会被协议切换覆盖</div>
      </el-form-item>
      <el-form-item label="API 密钥" required>
        <div style="display:flex;gap:8px;width:100%">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." style="flex:1" />
          <el-button v-if="preset?.keyUrl" size="small" @click="openKeyUrl">去获取</el-button>
        </div>
      </el-form-item>
      <el-form-item label="连通性测试">
        <el-button size="small" :loading="testing" :disabled="!form.apiUrl.trim()" @click="testConnect">
          {{ testMsg || '测试连接（拉取模型列表）' }}
        </el-button>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { Protocol } from '@yan-zhi/shared';
import { resolveProtocolUrl, type ModelProviderPreset } from '@yan-zhi/shared';
import { usePlatformStore } from '../stores';
import type { CatalogItem } from './PlatformPresetGrid.vue';

/**
 * 「添加 {厂商}」对话框（2026-10-17 方案 §2.3/§2.4 的 preset 分支）。
 *
 * ★ 只有真正填了 Key 并保存才 POST /from-preset 建平台 —— 目录是清单不是存量，
 *   不填 Key 关掉 = 什么都没发生（不产生没有 Key 的失效平台）。
 * ★ 协议切换联动用 shared 的 resolveProtocolUrl：仅当 URL 仍是旧协议默认值时改写
 *   （用户手改过的中转地址绝不被覆盖）。
 */

const props = defineProps<{
  modelValue: boolean;
  preset: ModelProviderPreset | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** 保存成功（新平台已建） */
  saved: [platformId: string];
}>();

const platformStore = usePlatformStore();

const API_FORMATS = [
  { value: 'openai', label: 'OpenAI Chat Completions 格式' },
  { value: 'openai-responses', label: 'OpenAI Responses API 格式' },
  { value: 'anthropic', label: 'Anthropic Messages 格式' },
] as const;

const form = reactive({
  protocol: 'openai' as Protocol,
  apiUrl: '',
  apiKey: '',
});
const testing = ref(false);
const testMsg = ref('');
const saving = ref(false);

function initFromPreset() {
  if (!props.preset) return;
  form.protocol = props.preset.protocol as Protocol;
  form.apiUrl = props.preset.urlByProtocol?.[props.preset.protocol] || props.preset.baseUrl;
  form.apiKey = '';
  testMsg.value = '';
}

watch(() => [props.modelValue, props.preset?.key], () => {
  if (props.modelValue) initFromPreset();
});
initFromPreset();

function reset() {
  form.apiKey = '';
  testMsg.value = '';
}

function onProtocolChange(to: Protocol) {
  if (!props.preset) return;
  form.apiUrl = resolveProtocolUrl(props.preset, form.protocol as Protocol, to, form.apiUrl);
  form.protocol = to;
}

function openKeyUrl() {
  if (props.preset?.keyUrl) window.open(props.preset.keyUrl, '_blank');
}

async function testConnect() {
  testing.value = true;
  testMsg.value = '';
  try {
    const r = await platformStore.testPlatformConfig({ apiUrl: form.apiUrl.trim(), apiKey: form.apiKey.trim() });
    testMsg.value = r.ok ? `✓ ${r.msg}（${r.durationMs}ms）` : `✗ ${r.msg}`;
  } finally {
    testing.value = false;
  }
}

async function save() {
  if (!props.preset) return;
  if (!form.apiKey.trim()) {
    ElMessage.warning('请先填写 API 密钥（没有 Key 的平台加了也用不了）');
    return;
  }
  saving.value = true;
  try {
    const { api } = await import('../api/client');
    const r = await api.post<any>('/platforms/from-preset', {
      presetKey: props.preset.key,
      apiKey: form.apiKey.trim(),
    });
    const data = ('data' in r ? r.data : r) as any;
    ElMessage.success(data?.existed ? `已使用现有的 ${props.preset.name} 平台` : `${props.preset.name} 已添加`);
    emit('saved', data?.id || data?.platformId || '');
    emit('update:modelValue', false);
  } catch (e: any) {
    ElMessage.error(e?.message || '添加失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cm-tip { font-size: 11px; color: var(--el-text-color-secondary, #909399); line-height: 1.5; }
</style>
