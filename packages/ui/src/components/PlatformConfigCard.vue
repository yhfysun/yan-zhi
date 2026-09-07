<template>
  <div class="platform-config-card">
    <div class="pcc-header">
      <el-icon class="pcc-header-icon"><Setting /></el-icon>
      <span class="pcc-title">{{ mode === 'edit' ? '修正平台配置' : '配置模型平台' }}</span>
    </div>
    <el-alert
      v-if="reason"
      :title="reason"
      type="error"
      show-icon
      :closable="false"
      class="pcc-reason"
    />
    <el-form label-width="90px" class="pcc-form">
      <el-form-item label="名称">
        <el-input v-model="form.name" placeholder="如：OpenAI / DeepSeek" />
      </el-form-item>
      <el-form-item label="协议">
        <el-select v-model="form.protocol" style="width: 100%">
          <el-option label="OpenAI" value="openai" />
          <el-option label="Anthropic" value="anthropic" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </el-form-item>
      <el-form-item label="API URL">
        <el-input v-model="form.apiUrl" placeholder="https://api.openai.com（填到域名，不要带 /v1）" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="mode === 'edit' ? '输入新 Token 可追加（留空不修改）' : 'sk-...'"
          @input="apiKeyDirty = true"
        />
      </el-form-item>
      <el-form-item label="请求停顿">
        <div class="pcc-pause-range">
          <el-input-number v-model="form.pauseMinMs" :min="0" :max="60000" :step="100" controls-position="right" size="small" />
          <span>~</span>
          <el-input-number v-model="form.pauseMaxMs" :min="0" :max="60000" :step="100" controls-position="right" size="small" />
          <span class="pcc-pause-unit">ms</span>
        </div>
      </el-form-item>
    </el-form>
    <div class="pcc-actions">
      <el-button :loading="testing" @click="testConnect">
        <el-icon><Connection /></el-icon>
        <span>测试连接</span>
      </el-button>
      <el-button type="primary" :loading="saving" @click="save">
        <el-icon><Check /></el-icon>
        <span>保存</span>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { Setting, Connection, Check } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { usePlatformStore } from '../stores';
import type { Platform, Protocol } from '@yan-zhi/shared';

const props = defineProps<{
  mode: 'create' | 'edit';
  platform?: Platform;
  reason?: string;
}>();

const emit = defineEmits<{
  saved: [payload: { platformId: string; modelId?: string }];
}>();

const platformStore = usePlatformStore();

const form = reactive({
  name: '',
  protocol: 'openai' as Protocol,
  apiUrl: '',
  apiKey: '',
  pauseMinMs: 0,
  pauseMaxMs: 0,
});
const apiKeyDirty = ref(false);
const testing = ref(false);
const saving = ref(false);

function initFromProps() {
  if (props.mode === 'edit' && props.platform) {
    form.name = props.platform.name;
    form.protocol = props.platform.protocol || 'openai';
    form.apiUrl = props.platform.apiUrl;
    form.apiKey = '';
    form.pauseMinMs = props.platform.pauseMinMs || 0;
    form.pauseMaxMs = props.platform.pauseMaxMs || 0;
  } else {
    form.name = '';
    form.protocol = 'openai';
    form.apiUrl = '';
    form.apiKey = '';
    form.pauseMinMs = 0;
    form.pauseMaxMs = 0;
  }
  apiKeyDirty.value = false;
}

initFromProps();
watch(
  () => [props.mode, props.platform?.id],
  () => initFromProps(),
);

async function testConnect() {
  if (!form.apiUrl) {
    ElMessage.warning('请先填写 API URL');
    return;
  }
  testing.value = true;
  try {
    const r = await platformStore.testPlatformConfig({ apiUrl: form.apiUrl, apiKey: form.apiKey });
    if (r.ok) {
      ElMessage.success(`${r.msg}（${r.durationMs}ms）`);
    } else {
      ElMessage.error(r.msg);
    }
  } finally {
    testing.value = false;
  }
}

async function save() {
  if (!form.name.trim() || !form.apiUrl.trim()) {
    ElMessage.warning('名称和 API URL 必填');
    return;
  }
  saving.value = true;
  try {
    let platformId: string;
    if (props.mode === 'edit' && props.platform) {
      const patch: Partial<{
        name: string;
        protocol: Protocol;
        apiUrl: string;
        apiKeyEnc: string;
        headers: Record<string, string>;
        pauseMinMs: number;
        pauseMaxMs: number;
      }> = {
        name: form.name.trim(),
        protocol: form.protocol,
        apiUrl: form.apiUrl.trim(),
        pauseMinMs: form.pauseMinMs,
        pauseMaxMs: form.pauseMaxMs,
      };
      await platformStore.updatePlatform(props.platform.id, patch);
      if (apiKeyDirty.value && form.apiKey.trim()) {
        await platformStore.addApiKey(props.platform.id, form.apiKey.trim());
      }
      platformId = props.platform.id;
    } else {
      platformId = await platformStore.addPlatform({
        name: form.name.trim(),
        protocol: form.protocol,
        apiUrl: form.apiUrl.trim(),
        apiKeyEnc: form.apiKey,
        headers: {},
        status: 'unknown',
        pauseMinMs: form.pauseMinMs,
        pauseMaxMs: form.pauseMaxMs,
      });
    }

    // 拉取远程模型落库（失败仅提示，不阻断）
    try {
      await platformStore.fetchRemoteModels(platformId);
    } catch (e: any) {
      ElMessage.warning('拉取远程模型失败：' + (e?.message || '未知错误') + '，可稍后在模型页重试');
    }

    await platformStore.loadPlatforms();
    await platformStore.loadModels(platformId);

    // 找一个可用的对话模型
    const available = platformStore.models.find(
      (x) => x.platformId === platformId && x.enabled && (x.type === 'llm' || x.type === ('chat' as any)),
    );

    emit('saved', { platformId, modelId: available?.id });
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.message || '未知错误'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.platform-config-card {
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--glass-bg, rgba(255, 255, 255, 0.6));
  backdrop-filter: var(--glass-filter, blur(8px));
  margin-top: 10px;
  max-width: 100%;
  box-sizing: border-box;
}
.pcc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #1f2937);
  margin-bottom: 10px;
}
.pcc-header-icon {
  color: var(--color-primary, #3B82F6);
}
.pcc-reason {
  margin-bottom: 10px;
}
.pcc-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.pcc-form :deep(.el-form-item__label) {
  font-size: 12px;
}
.pcc-form :deep(.el-input__wrapper),
.pcc-form :deep(.el-select__wrapper) {
  font-size: 13px;
}
.pcc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.pcc-pause-range { display: flex; align-items: center; gap: 6px; }
.pcc-pause-unit { font-size: 12px; color: var(--color-text-secondary); }
</style>