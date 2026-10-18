<template>
  <el-dialog
    :model-value="modelValue"
    title="自定义模型"
    width="560px"
    top="8vh"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <el-form label-width="110px" @submit.prevent>
      <el-form-item label="API 格式" required>
        <el-select v-model="form.apiFormat" style="width: 100%">
          <el-option v-for="f in API_FORMATS" :key="f.value" :label="f.label" :value="f.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="API 地址" required>
        <el-input v-model="form.apiUrl" :placeholder="defaultUrlFor(form.apiFormat)" />
        <div class="cm-tip">基础地址即可，系统自动拼接端点路径（OpenAI 格式默认填官方地址）</div>
      </el-form-item>
      <el-form-item label="模型 ID" required>
        <el-input v-model="form.modelId" placeholder="如 deepseek-v4-pro / my-relay/gpt-x" maxlength="128" />
      </el-form-item>
      <el-form-item label="模型展示名称">
        <el-input v-model="form.displayName" :maxlength="64" show-word-limit placeholder="留空则用模型 ID" />
      </el-form-item>
      <el-form-item label="API 密钥" required>
        <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
      <el-form-item label="价格（可选）">
        <div class="cm-price-grid">
          <div class="cm-price-item"><span class="cm-price-label">输入</span>
            <el-input-number v-model="form.pInput" :min="0" :precision="2" :step="1" size="small" controls-position="right" style="width:110px" /></div>
          <div class="cm-price-item"><span class="cm-price-label">缓存命中</span>
            <el-input-number v-model="form.pCacheRead" :min="0" :precision="2" :step="0.5" size="small" controls-position="right" style="width:110px" /></div>
          <div class="cm-price-item"><span class="cm-price-label">缓存写入</span>
            <el-input-number v-model="form.pCacheWrite" :min="0" :precision="2" :step="0.5" size="small" controls-position="right" style="width:110px" /></div>
          <div class="cm-price-item"><span class="cm-price-label">输出</span>
            <el-input-number v-model="form.pOutput" :min="0" :precision="2" :step="1" size="small" controls-position="right" style="width:110px" /></div>
          <div class="cm-tip cm-price-unit">元 / 百万 tokens（厂商价目表口径，手填不易错 1000 倍）</div>
        </div>
      </el-form-item>
      <el-form-item label="连通性测试">
        <el-button size="small" :loading="testing" :disabled="!form.apiUrl.trim()" @click="testConnect">
          {{ testMsg || '测试连接（会发起一次真实请求，消耗少量 token）' }}
        </el-button>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { usePlatformStore } from '../stores';

/**
 * 「自定义模型」一步式对话框（2026-10-17 方案 §2.4）。
 *
 * ★ 以前要「新增平台 → 进详情 → 新增模型」三步，这里一个对话框 + 一个事务接口
 *   （POST /platforms/custom-model：平台 + 模型 + Key 同批落地，不留半成品）。
 * ★ 价格单位是**元/百万**（厂商价目表口径）—— 老表单的 元/千 在后续单位迁移批次统一，
 *   新写入一律带 unit:'per_1m'，读侧 normalizePricing 已有兜底。
 */

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** 创建成功（platformId, modelId） */
  created: [platformId: string, modelId: string];
}>();

const platformStore = usePlatformStore();

const API_FORMATS = [
  { value: 'openai', label: 'OpenAI Chat Completions 格式' },
  { value: 'openai-responses', label: 'OpenAI Responses API 格式' },
  { value: 'anthropic', label: 'Anthropic Messages 格式' },
] as const;

function defaultUrlFor(fmt: string): string {
  if (fmt === 'anthropic') return 'https://api.anthropic.com';
  return 'https://api.openai.com';
}

const form = reactive({
  apiFormat: 'openai' as string,
  apiUrl: '',
  modelId: '',
  displayName: '',
  apiKey: '',
  pInput: 0,
  pCacheRead: 0,
  pCacheWrite: 0,
  pOutput: 0,
});
const testing = ref(false);
const testMsg = ref('');
const saving = ref(false);

function reset() {
  form.apiUrl = '';
  form.modelId = '';
  form.displayName = '';
  form.apiKey = '';
  form.pInput = 0; form.pCacheRead = 0; form.pCacheWrite = 0; form.pOutput = 0;
  testMsg.value = '';
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
  if (!form.apiUrl.trim()) { ElMessage.warning('请填写 API 地址'); return; }
  if (!form.modelId.trim()) { ElMessage.warning('请填写模型 ID'); return; }
  if (!form.apiKey.trim()) { ElMessage.warning('请填写 API 密钥'); return; }
  saving.value = true;
  try {
    const { api } = await import('../api/client');
    const hasPrice = form.pInput > 0 || form.pOutput > 0 || form.pCacheRead > 0 || form.pCacheWrite > 0;
    const r = await api.post<any>('/platforms/custom-model', {
      apiFormat: form.apiFormat,
      modelId: form.modelId.trim(),
      displayName: form.displayName.trim() || undefined,
      apiUrl: form.apiUrl.trim(),
      apiKey: form.apiKey.trim(),
      pricing: hasPrice ? {
        unit: 'per_1m', currency: 'CNY', configured: true,
        input: form.pInput, output: form.pOutput,
        cacheRead: form.pCacheRead > 0 ? form.pCacheRead : undefined,
        cacheWrite: form.pCacheWrite > 0 ? form.pCacheWrite : undefined,
      } : undefined,
    });
    const d = ('data' in r ? r.data : r) as any;
    ElMessage.success(`已创建平台与模型「${form.displayName.trim() || form.modelId.trim()}」`);
    emit('created', d?.platformId || '', d?.modelId || '');
    emit('update:modelValue', false);
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cm-tip { font-size: 11px; color: var(--el-text-color-secondary, #909399); line-height: 1.5; }
.cm-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; width: 100%; }
.cm-price-item { display: flex; align-items: center; gap: 8px; }
.cm-price-label { font-size: 12px; color: var(--el-text-color-regular, #cfd3dc); flex-shrink: 0; }
.cm-price-unit { grid-column: 1 / -1; }
</style>
