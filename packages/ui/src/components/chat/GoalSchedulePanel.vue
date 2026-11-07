<template>
  <div class="goal-schedule-panel">
    <template v-if="!formVisible">
      <div class="gsp-toolbar">
        <el-input v-model="search" size="small" clearable placeholder="搜索目标计划" :prefix-icon="Search" />
        <el-popover placement="bottom-end" :width="248" trigger="click">
          <template #reference>
            <el-button size="small" circle title="目标并发设置" aria-label="目标并发设置">
              <el-icon><Setting /></el-icon>
            </el-button>
          </template>
          <div class="gsp-governance">
            <div class="gsp-governance-title">目标并发</div>
            <div class="gsp-governance-row">
              <span>账号运行上限</span>
              <el-input-number
                v-model="governanceLimit"
                size="small"
                :min="1"
                :max="20"
              />
            </div>
            <div class="gsp-governance-row">
              <span>账号费用上限</span>
              <el-input-number
                v-model="governanceCostLimit"
                size="small"
                :min="0"
                :max="100000"
                :precision="2"
                :step="10"
              />
            </div>
            <div class="gsp-governance-meta">
              当前运行 {{ scheduleStore.governance?.runningForUser || 0 }}
              / 全局 {{ scheduleStore.governance?.runningGlobal || 0 }}
            </div>
            <div class="gsp-governance-actions">
              <el-button
                size="small"
                type="primary"
                :loading="savingGovernance"
                @click="saveGovernance"
              >
                保存
              </el-button>
            </div>
          </div>
        </el-popover>
        <el-tooltip content="新建目标计划" placement="top">
          <el-button size="small" circle type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <div v-loading="scheduleStore.loading" class="gsp-list">
        <article v-for="schedule in filteredSchedules" :key="schedule.id" class="gsp-item">
          <div class="gsp-item-head">
            <div class="gsp-item-title" :title="schedule.name">{{ schedule.name }}</div>
            <el-switch
              :model-value="schedule.enabled"
              size="small"
              @change="(value: any) => onToggle(schedule, value)"
            />
          </div>
          <div class="gsp-objective" :title="schedule.objective">{{ schedule.objective }}</div>
          <div class="gsp-meta">
            <el-tag size="small" effect="plain">{{ describeGoalSchedule(schedule) }}</el-tag>
            <span>{{ schedule.criteria.length }} 项验收</span>
            <span v-if="schedule.enabled && schedule.nextRunAt">下次 {{ formatTime(schedule.nextRunAt) }}</span>
            <span v-else-if="schedule.lastRunAt">上次 {{ formatTime(schedule.lastRunAt) }}</span>
          </div>
          <div v-if="schedule.lastError" class="gsp-error" :title="schedule.lastError">
            {{ schedule.lastError }}
          </div>
          <div class="gsp-actions">
            <el-tooltip content="立即运行" placement="top">
              <el-button size="small" circle :loading="runningId === schedule.id" @click="onRun(schedule)">
                <el-icon><VideoPlay /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" circle @click="openEdit(schedule)">
                <el-icon><EditPen /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" circle type="danger" @click="onDelete(schedule)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </article>

        <EmptyState
          v-if="!scheduleStore.loading && filteredSchedules.length === 0"
          icon="◎"
          title="暂无目标计划"
          action-text="新建计划"
          @action="openCreate"
        />
      </div>
    </template>

    <template v-else>
      <div class="gsp-form-head">
        <span>{{ editingId ? '编辑目标计划' : '新建目标计划' }}</span>
        <el-button text size="small" @click="formVisible = false">返回</el-button>
      </div>

      <el-form label-width="72px" size="small" class="gsp-form">
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="120" placeholder="每日经营巡检" />
        </el-form-item>
        <el-form-item v-if="!editingId" label="目标模板">
          <el-select v-model="form.templateId" filterable placeholder="选择目标模板" @change="onTemplatePick">
            <el-option
              v-if="store.currentGoal"
              value="__current_goal__"
              :label="`当前目标 · ${store.currentGoal.objective.slice(0, 28)}`"
            />
            <el-option
              v-for="template in store.goalTemplates"
              :key="template.id"
              :value="template.id"
              :label="template.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="selectedPolicy" label="目标">
          <div class="gsp-template-preview">
            <div>{{ selectedPolicy.objective }}</div>
            <span>{{ selectedPolicy.criteria.length }} 项验收 · {{ selectedPolicy.constraints.length }} 项约束</span>
          </div>
        </el-form-item>

        <el-form-item label="频率">
          <el-radio-group v-model="form.mode">
            <el-radio-button value="daily">每天</el-radio-button>
            <el-radio-button value="weekly">每周</el-radio-button>
            <el-radio-button value="interval">间隔</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.mode !== 'interval'" label="时间">
          <el-time-picker v-model="form.time" format="HH:mm" value-format="HH:mm" placeholder="09:00" />
        </el-form-item>
        <el-form-item v-if="form.mode === 'weekly'" label="星期">
          <el-select v-model="form.weekday">
            <el-option v-for="(label, index) in WEEK_LABELS" :key="label" :value="index" :label="label" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="form.mode === 'interval'" label="间隔">
          <el-input-number v-model="form.intervalMinutes" :min="1" :max="10080" />
          <span class="gsp-unit">分钟</span>
        </el-form-item>

        <el-form-item label="智能体">
          <el-select v-model="form.agentId" clearable filterable placeholder="沿用当前会话" @change="onAgentPick">
            <el-option v-for="agent in agentStore.chatAgents" :key="agent.id" :value="agent.id" :label="agent.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="大模型">
          <el-select v-model="form.modelId" filterable placeholder="选择模型" @change="onModelPick">
            <el-option-group v-for="group in modelGroups" :key="group.platformId" :label="group.platformName">
              <el-option
                v-for="model in group.models"
                :key="model.id"
                :value="model.id"
                :label="model.alias || model.modelId"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
      </el-form>

      <div class="gsp-form-footer">
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="onSave">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Delete, EditPen, Plus, Search, Setting, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { GoalSchedule, GoalTemplate } from '@yan-zhi/shared';
import { useChat } from '../../composables/chat/useChat';
import { useGoalScheduleStore } from '../../stores/goalSchedule';
import {
  buildGoalScheduleExpression,
  describeGoalSchedule,
  parseGoalScheduleExpression,
  type GoalScheduleMode,
} from '../../utils/goal-schedule-form';
import EmptyState from '../common/EmptyState.vue';

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const { store, currentConv, agentStore, modelGroups, selectConv } = useChat();
const scheduleStore = useGoalScheduleStore();

const search = ref('');
const formVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const runningId = ref('');
const governanceLimit = ref(2);
const governanceCostLimit = ref(0);
const savingGovernance = ref(false);

const form = reactive({
  name: '',
  templateId: '',
  mode: 'daily' as GoalScheduleMode,
  time: '09:00',
  weekday: 1,
  intervalMinutes: 30,
  agentId: '',
  platformId: '',
  modelId: '',
});

const filteredSchedules = computed(() => {
  const query = search.value.trim().toLowerCase();
  return scheduleStore.schedules.filter((schedule) => (
    !query
    || schedule.name.toLowerCase().includes(query)
    || schedule.objective.toLowerCase().includes(query)
  ));
});

const currentTemplate = computed<GoalTemplate | null>(() => (
  store.goalTemplates.find((template) => template.id === form.templateId) || null
));
const currentGoalPreview = computed(() => (
  form.templateId === '__current_goal__' ? store.currentGoal || null : null
));
const selectedPolicy = computed(() => currentTemplate.value || currentGoalPreview.value);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void Promise.all([
    scheduleStore.loadSchedules(),
    store.loadGoalTemplates(),
    scheduleStore.loadGovernance().then((value) => {
      if (value) {
        governanceLimit.value = value.maxRunningPerUser;
        governanceCostLimit.value = value.defaultCostLimitCny;
      }
    }),
  ]);
  refreshTimer = setInterval(() => { void scheduleStore.loadSchedules(); }, 30_000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
});

function setDefaults(): void {
  form.name = '';
  form.templateId = store.currentGoal ? '__current_goal__' : (store.goalTemplates[0]?.id || '');
  form.mode = 'daily';
  form.time = '09:00';
  form.weekday = 1;
  form.intervalMinutes = 30;
  form.agentId = currentConv.value?.agentId || agentStore.selectedId || '';
  form.platformId = currentConv.value?.platformId || '';
  form.modelId = currentConv.value?.modelId || '';
  if (!form.platformId || !form.modelId) {
    const agent = agentStore.agents.find((item) => item.id === form.agentId);
    form.platformId = agent?.platformId || '';
    form.modelId = agent?.modelId || '';
  }
}

async function openCreate(): Promise<void> {
  if (!currentConv.value) {
    ElMessage.warning('请先打开一个任务');
    return;
  }
  await store.loadGoalTemplates();
  if (!store.goalTemplates.length && !store.currentGoal) {
    ElMessage.warning('请先创建目标或保存模板');
    return;
  }
  editingId.value = null;
  setDefaults();
  const template = currentTemplate.value;
  if (template) form.name = template.name;
  else if (store.currentGoal) form.name = store.currentGoal.objective.slice(0, 40);
  formVisible.value = true;
}

function openEdit(schedule: GoalSchedule): void {
  editingId.value = schedule.id;
  const parsed = parseGoalScheduleExpression(schedule);
  form.name = schedule.name;
  form.templateId = schedule.templateId || '';
  form.mode = parsed.mode;
  form.time = parsed.time;
  form.weekday = parsed.weekday;
  form.intervalMinutes = parsed.intervalMinutes;
  form.agentId = schedule.agentId || '';
  form.platformId = schedule.platformId;
  form.modelId = schedule.modelId;
  formVisible.value = true;
}

function onTemplatePick(templateId: string): void {
  if (templateId === '__current_goal__' && store.currentGoal) {
    form.name = store.currentGoal.objective.slice(0, 40);
    return;
  }
  const template = store.goalTemplates.find((item) => item.id === templateId);
  if (template) form.name = template.name;
}

function onAgentPick(agentId: string): void {
  const agent = agentStore.agents.find((item) => item.id === agentId);
  if (!agent) return;
  form.platformId = agent.platformId || '';
  form.modelId = agent.modelId || '';
}

function onModelPick(modelId: string): void {
  if (!modelId) return;
  for (const group of modelGroups.value) {
    if (group.models.some((model) => model.id === modelId)) {
      form.platformId = group.platformId;
      return;
    }
  }
}

async function onSave(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('请填写计划名称');
    return;
  }
  if (!form.modelId || !form.platformId) {
    ElMessage.warning('请选择模型');
    return;
  }
  if (!editingId.value && !form.templateId) {
    ElMessage.warning('请选择目标模板');
    return;
  }
  const expression = buildGoalScheduleExpression(form);
  const usingCurrentGoal = form.templateId === '__current_goal__';
  saving.value = true;
  try {
    if (editingId.value) {
      await scheduleStore.updateSchedule(editingId.value, {
        name: form.name.trim(),
        agentId: form.agentId || null,
        platformId: form.platformId,
        modelId: form.modelId,
        ...expression,
      });
      ElMessage.success('目标计划已更新');
    } else {
      await scheduleStore.createSchedule({
        name: form.name.trim(),
        conversationId: currentConv.value!.id,
        templateId: usingCurrentGoal ? null : form.templateId,
        goalId: usingCurrentGoal ? store.currentGoal?.id : null,
        agentId: form.agentId || null,
        platformId: form.platformId,
        modelId: form.modelId,
        ...expression,
      });
      ElMessage.success('目标计划已创建');
    }
    formVisible.value = false;
  } catch (error: any) {
    ElMessage.error(error?.message || '保存目标计划失败');
  } finally {
    saving.value = false;
  }
}

async function onToggle(schedule: GoalSchedule, enabled: string | number | boolean): Promise<void> {
  try {
    await scheduleStore.updateSchedule(schedule.id, { enabled: !!enabled });
    ElMessage.success(enabled ? '目标计划已启用' : '目标计划已暂停');
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败');
  }
}

async function onRun(schedule: GoalSchedule): Promise<void> {
  runningId.value = schedule.id;
  try {
    const result = await scheduleStore.runSchedule(schedule.id);
    if (result.goal?.conversationId) {
      await store.loadConversations();
      await selectConv(result.goal.conversationId);
    }
    ElMessage.success('目标已创建并开始执行');
  } catch (error: any) {
    ElMessage.error(error?.message || '运行目标计划失败');
  } finally {
    runningId.value = '';
  }
}

async function onDelete(schedule: GoalSchedule): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除目标计划「${schedule.name}」吗？已创建的目标不受影响。`,
      '删除目标计划',
      {
        type: 'warning',
        confirmButtonClass: 'yz-confirm-danger',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
    await scheduleStore.deleteSchedule(schedule.id);
    ElMessage.success('目标计划已删除');
  } catch {
    // User cancelled.
  }
}

async function saveGovernance(): Promise<void> {
  savingGovernance.value = true;
  try {
    const value = await scheduleStore.updateGovernance({
      maxRunningPerUser: governanceLimit.value,
      defaultCostLimitCny: governanceCostLimit.value,
    });
    governanceLimit.value = value.maxRunningPerUser;
    governanceCostLimit.value = value.defaultCostLimitCny;
    ElMessage.success('目标并发配置已保存');
  } catch (error: any) {
    ElMessage.error(error?.message || '保存目标并发配置失败');
  } finally {
    savingGovernance.value = false;
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${time}`;
}
</script>

<style scoped>
.goal-schedule-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px 10px;
}

.gsp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.gsp-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 2px;
}

.gsp-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--glass-border, color-mix(in srgb, var(--color-text) 10%, transparent));
  border-radius: 8px;
  background: var(--el-fill-color-blank, #fff);
}

.gsp-item-head,
.gsp-actions,
.gsp-meta,
.gsp-form-head,
.gsp-form-footer {
  display: flex;
  align-items: center;
}

.gsp-item-head {
  justify-content: space-between;
  gap: 8px;
}

.gsp-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.gsp-objective {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.gsp-meta {
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.gsp-error {
  overflow: hidden;
  color: var(--el-color-danger);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gsp-actions {
  justify-content: flex-end;
  gap: 6px;
}

.gsp-form-head {
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.gsp-form {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.gsp-form :deep(.el-select),
.gsp-form :deep(.el-date-editor),
.gsp-form :deep(.el-input-number) {
  width: 100%;
}

.gsp-template-preview {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.gsp-template-preview span,
.gsp-unit {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.gsp-unit {
  margin-left: 6px;
}

.gsp-governance {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gsp-governance-title {
  font-size: 13px;
  font-weight: 600;
}

.gsp-governance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.gsp-governance-row :deep(.el-input-number) {
  width: 112px;
}

.gsp-governance-meta {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.gsp-governance-actions {
  display: flex;
  justify-content: flex-end;
}

.gsp-form-footer {
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
