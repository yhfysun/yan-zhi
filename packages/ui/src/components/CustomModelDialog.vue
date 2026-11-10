<template>
  <el-dialog
    :model-value="modelValue"
    title="自定义平台"
    width="560px"
    top="8vh"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <el-form label-width="110px" @submit.prevent>
      <el-form-item label="平台名称" required>
        <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="如：公司中转站 / 私有 DeepSeek" />
      </el-form-item>
      <el-form-item label="API 格式" required>
        <el-select v-model="form.apiFormat" style="width: 100%">
          <el-option v-for="f in API_FORMATS" :key="f.value" :label="f.label" :value="f.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="API 地址" required>
        <el-input v-model="form.apiUrl" :placeholder="defaultUrlFor(form.apiFormat)" />
        <div class="cm-tip">基础地址即可，系统自动拼接端点路径（OpenAI 格式默认填官方地址）</div>
      </el-form-item>
      <el-form-item label="API 密钥" required>
        <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
      <el-form-item label="连通性测试">
        <el-button size="small" :loading="testing" :disabled="!form.apiUrl.trim()" @click="testConnect">
          {{ testMsg || '测试连接（拉取模型列表）' }}
        </el-button>
      </el-form-item>
    </el-form>
    <div class="cm-tip cm-auto-pull">
      保存后会直接请求远端 /models 并同步可用模型；拉取失败时平台仍会保留，可在详情页重试。
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存并拉取模型</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { usePlatformStore } from '../stores';

/**
 * 「自定义平台」对话框。
 *
 * 平台连接信息使用通用 POST /platforms 创建；保存成功后立即请求远端 /models
 * 并走 fetchRemoteModels 入库。模型不再要求用户手填，也不再和平台创建绑成事务。
 */

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** 平台创建成功（模型由随后的自动拉取同步） */
  created: [platformId: string];
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
  name: '',
  apiFormat: 'openai' as string,
  apiUrl: '',
  apiKey: '',
});
const testing = ref(false);
const testMsg = ref('');
const saving = ref(false);

function reset() {
  form.name = '';
  form.apiUrl = '';
  form.apiKey = '';
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
  if (!form.name.trim()) { ElMessage.warning('请填写平台名称'); return; }
  if (!form.apiUrl.trim()) { ElMessage.warning('请填写 API 地址'); return; }
  if (!form.apiKey.trim()) { ElMessage.warning('请填写 API 密钥'); return; }
  saving.value = true;
  try {
    const platformId = await platformStore.addPlatform({
      name: form.name.trim(),
      protocol: form.apiFormat as any,
      apiUrl: form.apiUrl.trim(),
      apiKeyEnc: form.apiKey.trim(),
      headers: {},
      status: 'unknown',
      pauseMinMs: 0,
      pauseMaxMs: 0,
    });
    try {
      const ids = await platformStore.fetchRemoteModels(platformId);
      ElMessage.success(ids.length > 0
        ? `平台「${form.name.trim()}」已创建，已拉取 ${ids.length} 个模型`
        : `平台「${form.name.trim()}」已创建，远端暂未返回模型`);
    } catch (e: any) {
      ElMessage.warning(`平台「${form.name.trim()}」已创建，但自动拉取模型失败：${e?.message || e}`);
    }
    emit('created', platformId);
    emit('update:modelValue', false);
  } catch (e: any) {
    ElMessage.error(e?.message || '创建平台失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cm-tip { font-size: 11px; color: var(--el-text-color-secondary, #909399); line-height: 1.5; }
.cm-auto-pull { margin: -4px 0 4px 110px; }
@media (max-width: 600px) { .cm-auto-pull { margin-left: 0; } }
</style>
