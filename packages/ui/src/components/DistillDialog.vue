<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="蒸馏为 Skill"
    width="780px"
    :close-on-click-modal="false"
    class="distill-dialog"
  >
    <div class="distill-body">
      <!-- 待蒸馏消息预览 -->
      <div class="distill-section">
        <div class="distill-section-title">待蒸馏的对话记录</div>
        <div class="distill-msgs">
          <div v-for="(m, i) in messages" :key="i" class="distill-msg" :class="`role-${m.role}`">
            <span class="distill-msg-role">{{ m.role === 'user' ? '用户' : '助手' }}</span>
            <pre class="distill-msg-content">{{ m.content || '(空)' }}</pre>
          </div>
        </div>
      </div>

      <!-- 配置快览 -->
      <div class="distill-config-bar">
        <span class="config-chip">温度 {{ distillStore.config.temperature }}</span>
        <span class="config-chip">topP {{ distillStore.config.topP }}</span>
        <span class="config-chip">maxTokens {{ distillStore.config.maxTokens }}</span>
        <span class="config-chip">{{ platformLabel }}</span>
        <span class="config-chip">{{ modelLabel }}</span>
      </div>

      <!-- 操作区 -->
      <div class="distill-actions" v-if="!distilling && !result">
        <el-button type="primary" @click="runDistill" :loading="distilling">
          <el-icon><MagicStick /></el-icon> 开始蒸馏
        </el-button>
      </div>

      <!-- 蒸馏中 -->
      <div v-if="distilling" class="distill-loading">
        <el-icon class="is-loading" :size="28"><Loading /></el-icon>
        <span>正在蒸馏...</span>
      </div>

      <!-- 蒸馏结果 -->
      <div v-if="result" class="distill-result">
        <div class="distill-section-title">蒸馏结果（Skill Markdown）</div>
        <pre class="distill-result-md">{{ result }}</pre>

        <!-- 改造区 -->
        <div class="distill-refine">
          <el-input
            v-model="refineInstruction"
            type="textarea"
            :rows="2"
            placeholder="输入改造指令，如：增加更多触发词、让输出更简洁、加入错误处理步骤..."
          />
          <div class="refine-actions">
            <el-button size="small" @click="runRefine" :loading="refining" :disabled="!refineInstruction.trim()">
              <el-icon><EditPen /></el-icon> 改造 Skill
            </el-button>
            <el-button size="small" @click="runDistill" :loading="distilling">
              <el-icon><Refresh /></el-icon> 重新蒸馏
            </el-button>
            <el-button size="small" type="success" @click="saveSkill" :loading="saving">
              <el-icon><Check /></el-icon> 保存到 Skill 商店
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { MagicStick, Loading, EditPen, Refresh, Check } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useDistillStore, usePlatformStore } from '../stores';

const props = defineProps<{
  visible: boolean;
  messages: Array<{ role: string; content: string }>;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  saved: [string];
}>();

const distillStore = useDistillStore();
const platformStore = usePlatformStore();

const distilling = ref(false);
const refining = ref(false);
const saving = ref(false);
const result = ref('');
const refineInstruction = ref('');

const platformLabel = computed(() => {
  const pid = distillStore.config.platformId;
  const p = platformStore.platforms.find((x) => x.id === pid);
  return p ? p.name : '默认平台';
});

const modelLabel = computed(() => {
  const pid = distillStore.config.platformId || distillStore.config.modelId;
  const mid = distillStore.config.modelId;
  const m = platformStore.resolveModel(mid, pid);
  return m ? (m.alias || m.modelId) : '默认模型';
});

// 弹窗打开时加载配置
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await distillStore.loadConfig();
      result.value = '';
      refineInstruction.value = '';
    }
  },
);

async function runDistill() {
  if (!props.messages.length) {
    ElMessage.warning('没有可蒸馏的消息');
    return;
  }
  distilling.value = true;
  result.value = '';
  try {
    const taskId = await distillStore.distill(props.messages);
    const task = distillStore.getTask(taskId);
    result.value = task?.resultMd || '';
    ElMessage.success('蒸馏完成');
  } catch (e: any) {
    ElMessage.error(e?.message || '蒸馏失败');
  } finally {
    distilling.value = false;
  }
}

async function runRefine() {
  if (!refineInstruction.value.trim() || !result.value) return;
  refining.value = true;
  try {
    result.value = await distillStore.refineMd(result.value, refineInstruction.value);
    refineInstruction.value = '';
    ElMessage.success('改造完成');
  } catch (e: any) {
    ElMessage.error(e?.message || '改造失败');
  } finally {
    refining.value = false;
  }
}

async function saveSkill() {
  if (!result.value) return;
  saving.value = true;
  try {
    const skillId = await distillStore.saveMdAsSkill(result.value);
    ElMessage.success('已保存到 Skill 商店');
    emit('saved', skillId);
    emit('update:visible', false);
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.distill-body { display: flex; flex-direction: column; gap: 16px; }
.distill-section-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; }
.distill-msgs { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.distill-msg { padding: 8px 12px; border-radius: 8px; background: rgba(15,23,42,0.04); }
.distill-msg.role-user { border-left: 3px solid var(--color-primary); }
.distill-msg.role-assistant { border-left: 3px solid var(--color-accent); }
.distill-msg-role { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.distill-msg-content { font-size: 13px; white-space: pre-wrap; word-break: break-word; margin-top: 4px; font-family: inherit; }
.distill-config-bar { display: flex; flex-wrap: wrap; gap: 8px; }
.config-chip { font-size: 12px; padding: 2px 10px; border-radius: 12px; background: var(--color-primary-light); color: var(--color-primary-dark); }
.distill-actions { display: flex; justify-content: center; padding: 12px 0; }
.distill-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 24px 0; color: var(--color-text-secondary); }
.distill-result { display: flex; flex-direction: column; gap: 12px; }
.distill-result-md { background: rgba(15,23,42,0.04); padding: 16px; border-radius: 8px; font-family: "JetBrains Mono", monospace; font-size: 13px; max-height: 280px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.distill-refine { display: flex; flex-direction: column; gap: 8px; }
.refine-actions { display: flex; gap: 8px; flex-wrap: wrap; }

@media (max-width: 767px) {
  .distill-msgs { max-height: 150px; }
  .distill-result-md { max-height: 200px; }
}
</style>