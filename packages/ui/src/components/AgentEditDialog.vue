<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑智能体' : '新建智能体'" width="800px" top="6vh" class="agent-edit-dialog" :close-on-click-modal="false">
    <div class="agent-edit-body" v-if="form">
      <div class="edit-section">
        <div class="section-title">
          <el-icon><User /></el-icon> 基本信息
        </div>
        <div class="edit-row">
          <label>名称</label>
          <el-input v-model="form.name" placeholder="智能体名称" />
        </div>
        <div class="edit-row">
          <label>描述</label>
          <el-input v-model="form.description" placeholder="简短描述" />
        </div>
      </div>

      <div class="edit-section">
        <div class="section-title">
          <el-icon><EditPen /></el-icon> 系统提示词
        </div>
        <el-input v-model="form.systemPrompt" type="textarea" :rows="3" placeholder="设定 AI 的角色、语气、行为约束..." />
      </div>

      <div class="edit-section">
        <div class="section-title">
          <el-icon><Cpu /></el-icon> 模型绑定
        </div>
        <div class="edit-row">
          <label>模型</label>
          <el-select v-model="form.modelId" placeholder="选择模型" filterable clearable style="flex:1">
            <el-option-group
              v-for="g in modelGroups"
              :key="g.platformId"
              :label="g.platformName"
            >
              <el-option
                v-for="m in g.models"
                :key="m.id"
                :label="m.alias || m.modelId"
                :value="m.id"
              />
            </el-option-group>
          </el-select>
        </div>
      </div>

      <div class="edit-section">
        <div class="section-title">
          <el-icon><Setting /></el-icon> 模型参数
        </div>
        <div class="param-grid">
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">Temperature</span>
              <span class="param-val">{{ form.temperature.toFixed(2) }}</span>
            </div>
            <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.05" />
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">Top P</span>
              <span class="param-val">{{ form.topP.toFixed(2) }}</span>
            </div>
            <el-slider v-model="form.topP" :min="0" :max="1" :step="0.05" />
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">Max Tokens</span>
              <span class="param-val">{{ form.maxTokens }}</span>
            </div>
            <el-slider v-model="form.maxTokens" :min="512" :max="32768" :step="256" />
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">频率惩罚</span>
              <span class="param-val">{{ form.frequencyPenalty.toFixed(1) }}</span>
            </div>
            <el-slider v-model="form.frequencyPenalty" :min="-2" :max="2" :step="0.1" />
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">存在惩罚</span>
              <span class="param-val">{{ form.presencePenalty.toFixed(1) }}</span>
            </div>
            <el-slider v-model="form.presencePenalty" :min="-2" :max="2" :step="0.1" />
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">思考模式</span>
            </div>
            <el-select v-model="form.reasoningEffort" placeholder="关闭" style="width:100%">
              <el-option label="关闭" value="" />
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
            </el-select>
          </div>
          <div class="param-item">
            <div class="param-head">
              <span class="param-label">最大循环步数</span>
              <span class="param-val">{{ form.maxReActSteps }}</span>
            </div>
            <el-slider v-model="form.maxReActSteps" :min="1" :max="30" :step="1" />
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button v-if="isEdit && !agent?.isDefault" type="danger" plain @click="handleDelete" style="margin-right:auto">删除</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, EditPen, Cpu, Setting } from '@element-plus/icons-vue';
import type { Agent } from '@ai-assistant/shared';
import { useAgentStore, usePlatformStore } from '../stores';

const props = defineProps<{
  modelValue: boolean;
  agent?: Agent | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved', agentId: string): void;
  (e: 'deleted', agentId: string): void;
}>();

const agentStore = useAgentStore();
const platformStore = usePlatformStore();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEdit = computed(() => !!props.agent?.id);

const form = ref<any>({
  name: '',
  description: '',
  systemPrompt: '',
  modelId: '',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  reasoningEffort: '',
  maxReActSteps: 10,
});

const modelGroups = computed(() => {
  const enabled = platformStore.models.filter((m: any) => m.enabled);
  return platformStore.platforms
    .map((p: any) => ({
      platformId: p.id,
      platformName: p.name,
      models: enabled.filter((m: any) => m.platformId === p.id),
    }))
    .filter((g: any) => g.models.length > 0);
});

watch(
  () => [props.modelValue, props.agent],
  () => {
    if (props.modelValue) {
      const agent = props.agent;
      form.value = {
        name: agent?.name || '',
        description: agent?.description || '',
        systemPrompt: agent?.systemPrompt || '',
        modelId: agent?.modelId || '',
        temperature: agent?.temperature ?? 0.7,
        maxTokens: agent?.maxTokens ?? 2048,
        topP: agent?.topP ?? 1.0,
        frequencyPenalty: agent?.frequencyPenalty ?? 0,
        presencePenalty: agent?.presencePenalty ?? 0,
        reasoningEffort: (agent?.config as any)?.reasoningEffort || '',
        maxReActSteps: (agent?.config as any)?.maxReActSteps ?? 10,
      };
    }
  },
  { immediate: true },
);

async function handleSave() {
  if (!form.value.name?.trim()) {
    ElMessage.warning('名称必填');
    return;
  }
  const model = platformStore.models.find((m: any) => m.id === form.value.modelId);
  const data: Partial<Agent> = {
    name: form.value.name.trim(),
    description: form.value.description?.trim() || '',
    systemPrompt: form.value.systemPrompt || '',
    modelId: form.value.modelId || '',
    platformId: model?.platformId || '',
    temperature: form.value.temperature,
    maxTokens: form.value.maxTokens,
    topP: form.value.topP,
    frequencyPenalty: form.value.frequencyPenalty,
    presencePenalty: form.value.presencePenalty,
    config: { reasoningEffort: form.value.reasoningEffort || undefined, maxReActSteps: form.value.maxReActSteps },
  };

  if (props.agent?.id) {
    await agentStore.updateAgent(props.agent.id, data);
    ElMessage.success('已更新');
    visible.value = false;
    emit('saved', props.agent.id);
  } else {
    const id = await agentStore.createChatAgent(data);
    ElMessage.success('已创建');
    visible.value = false;
    emit('saved', id);
  }
}

async function handleDelete() {
  if (!props.agent?.id) return;
  if (props.agent.isDefault) {
    ElMessage.warning('默认智能体不可删除');
    return;
  }
  try {
    await ElMessageBox.confirm(`删除智能体「${props.agent.name}」？`, '提示', { type: 'warning' });
    await agentStore.deleteAgent(props.agent.id);
    visible.value = false;
    emit('deleted', props.agent.id);
    ElMessage.success('已删除');
  } catch {}
}
</script>

<style scoped>
.agent-edit-body {
  display: flex; flex-direction: column; gap: 0;
}

.edit-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--glass-border);
}
.edit-section:last-child { border-bottom: none; padding-bottom: 0; }

.section-title {
  font-size: 12px; font-weight: 700; color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;
  display: flex; align-items: center; gap: 6px;
}
.section-title .el-icon { font-size: 14px; color: var(--color-primary); }

.edit-row {
  display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
}
.edit-row:last-child { margin-bottom: 0; }
.edit-row label {
  width: 72px; font-size: 13px; font-weight: 500; color: var(--color-text);
  text-align: right; flex-shrink: 0;
}

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}

.param-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 12px 16px; border-radius: 10px;
  background: rgba(15, 23, 42, 0.02);
  border: 1px solid rgba(15, 23, 42, 0.04);
  transition: all 0.18s;
}
.param-item:hover {
  border-color: var(--glass-border);
  background: rgba(15, 23, 42, 0.04);
}

.param-head {
  display: flex; align-items: baseline; justify-content: space-between;
}
.param-label {
  font-size: 11px; font-weight: 600; color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: 0.3px;
}
.param-val {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 12px; font-weight: 600; color: var(--color-primary);
}

.param-item :deep(.el-slider) {
  --el-slider-main-bg-color: var(--color-primary);
  --el-slider-runway-bg-color: rgba(15,23,42,0.08);
  --el-slider-stop-bg-color: transparent;
  --el-slider-height: 6px;
  --el-slider-button-size: 14px;
  padding: 0 2px;
}
.param-item :deep(.el-slider__stop) { display: none; }

.param-item :deep(.el-input__wrapper) {
  background: rgba(15,23,42,0.04); border: none; box-shadow: none;
}
.param-item :deep(.el-input__inner) { font-size: 13px; }
.param-item :deep(.el-select .el-input__inner) { font-size: 13px; }
.param-item :deep(.el-select .el-input__wrapper) { box-shadow: none !important; }

.edit-row :deep(.el-input__inner) { font-size: 13px; }
</style>
