<template>
  <div class="scheduled-task-panel">
    <!-- 任务列表 -->
    <template v-if="!formVisible">
      <div class="st-toolbar">
        <span class="st-hint">按计划自动向模型发送提示词，结果写入对应会话</span>
        <el-button type="primary" size="small" @click="openCreate">
          <el-icon><Plus /></el-icon> 新建
        </el-button>
      </div>
      <div v-loading="taskStore.loading" class="st-list">
        <div v-for="task in taskStore.tasks" :key="task.id" class="st-item glass-card">
          <div class="st-item-main">
            <div class="st-item-name" :title="task.name">{{ task.name }}</div>
            <div class="st-item-meta">
              <el-tag size="small" effect="plain" round>{{ scheduleText(task) }}</el-tag>
              <span v-if="boundAgentName(task.agentId)" class="st-item-sub">智能体：{{ boundAgentName(task.agentId) }}</span>
              <span v-if="boundSpaceName(task.spaceId)" class="st-item-sub">空间：{{ boundSpaceName(task.spaceId) }}</span>
              <span v-if="task.conversationId" class="st-item-sub">已绑定会话</span>
              <span class="st-item-sub">上次：{{ task.lastRunAt ? formatTime(task.lastRunAt) : '未运行' }}</span>
              <span v-if="task.enabled && task.nextRunAt" class="st-item-sub">下次：{{ formatTime(task.nextRunAt) }}</span>
            </div>
          </div>
          <div class="st-item-actions" @click.stop>
            <el-switch :model-value="task.enabled" size="small" @change="(v: any) => onToggle(task, v)" />
            <el-tooltip content="立即运行" placement="top">
              <el-button size="small" circle :loading="runningId === task.id" @click="onRun(task)">
                <el-icon><VideoPlay /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" circle @click="openEdit(task)">
                <el-icon><EditPen /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" circle type="danger" @click="onDelete(task)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </div>
        <el-empty v-if="taskStore.tasks.length === 0 && !taskStore.loading" description="暂无定时任务" :image-size="60" />
      </div>
    </template>

    <!-- 新建 / 编辑表单 -->
    <template v-else>
      <div class="st-form-header">
        <span class="st-form-title">{{ editingId ? '编辑任务' : '新建任务' }}</span>
        <el-button text size="small" @click="formVisible = false">返回</el-button>
      </div>
      <el-form label-width="72px" class="st-form" size="small">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" placeholder="如：每日早报" maxlength="50" />
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="form.prompt" type="textarea" :rows="4" placeholder="定时发送给模型的提示词" />
        </el-form-item>
        <el-form-item label="定时方式">
          <el-radio-group v-model="form.scheduleType">
            <el-radio value="interval">每 N 分钟</el-radio>
            <el-radio value="daily">每天固定时间</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scheduleType === 'interval'" label="间隔分钟">
          <el-input-number v-model="form.intervalMinutes" :min="1" :max="525600" :step="5" />
        </el-form-item>
        <el-form-item v-else label="运行时间">
          <el-time-picker v-model="form.dailyTime" format="HH:mm" value-format="HH:mm" placeholder="选择时间" />
        </el-form-item>
        <el-form-item label="智能体">
          <el-select v-model="form.agentId" placeholder="不绑定则用默认智能体" clearable filterable @change="onAgentPick">
            <el-option v-for="ag in agentStore.agents" :key="ag.id" :value="ag.id" :label="ag.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="大模型">
          <el-select v-model="form.modelId" placeholder="不绑定则用默认模型" clearable filterable @change="onModelPick">
            <el-option-group v-for="group in modelGroups" :key="group.platformId" :label="group.platformName">
              <el-option v-for="model in group.models" :key="model.id" :value="model.id" :label="model.alias || model.modelId" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="空间">
          <el-select v-model="form.spaceId" placeholder="不绑定则不归类" clearable filterable>
            <el-option v-for="sp in spaceStore.spaces" :key="sp.id" :value="sp.id" :label="sp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定会话">
          <el-checkbox v-model="form.bindConversation" :disabled="!currentConv">
            {{ currentConv ? `写入当前会话「${currentConv.title}」` : '当前无会话' }}
          </el-checkbox>
        </el-form-item>
      </el-form>
      <div class="st-form-hint">不绑定会话时，将在首次运行时自动创建独立会话；绑定智能体/大模型/空间后，任务发起的会话会继承这些配置。</div>
      <div class="st-form-footer">
        <el-button size="small" @click="formVisible = false">取消</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="onSave">{{ editingId ? '保存' : '创建' }}</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen, Plus, VideoPlay } from '@element-plus/icons-vue';
import { useScheduledTaskStore, type ScheduledTask } from '../../stores/scheduledTask';
import { useChat } from '../../composables/chat/useChat';

const taskStore = useScheduledTaskStore();
const { store, currentConv, agentStore, spaceStore, modelGroups } = useChat();

const formVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const runningId = ref('');

const form = reactive({
  name: '',
  prompt: '',
  scheduleType: 'interval' as 'interval' | 'daily',
  intervalMinutes: 30,
  dailyTime: '09:00',
  bindConversation: false,
  agentId: '' as string,
  platformId: '' as string,
  modelId: '' as string,
  spaceId: '' as string,
});

onMounted(() => { if (taskStore.tasks.length === 0) taskStore.loadTasks(); });

function boundAgentName(id?: string | null): string {
  if (!id) return '';
  return agentStore.agents.find((a) => a.id === id)?.name || '';
}
function boundSpaceName(id?: string | null): string {
  if (!id) return '';
  return spaceStore.spaces.find((s) => s.id === id)?.name || '';
}

/** 选择智能体后自动带出其绑定的模型（用户仍可在「大模型」下拉覆盖） */
function onAgentPick(agentId: string) {
  if (!agentId) return;
  const ag = agentStore.agents.find((a) => a.id === agentId);
  if (ag) {
    form.platformId = ag.platformId || '';
    form.modelId = ag.modelId || '';
  }
}

/** 选择模型时同步记录其所属平台 */
function onModelPick(modelId: string) {
  if (!modelId) { form.platformId = ''; return; }
  for (const group of modelGroups.value) {
    if (group.models.find((m) => m.id === modelId)) {
      form.platformId = group.platformId;
      return;
    }
  }
}

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.prompt = '';
  form.scheduleType = 'interval';
  form.intervalMinutes = 30;
  form.dailyTime = '09:00';
  form.bindConversation = !!currentConv.value;
  form.agentId = agentStore.selectedId || '';
  const ag = agentStore.agents.find((a) => a.id === form.agentId);
  form.platformId = ag?.platformId || '';
  form.modelId = ag?.modelId || '';
  form.spaceId = spaceStore.currentSpaceId || '';
  formVisible.value = true;
}

function openEdit(task: ScheduledTask) {
  editingId.value = task.id;
  form.name = task.name;
  form.prompt = task.prompt || '';
  if (task.intervalMinutes && task.intervalMinutes > 0) {
    form.scheduleType = 'interval';
    form.intervalMinutes = task.intervalMinutes;
  } else {
    form.scheduleType = 'daily';
    const parts = (task.cronExpr || '').trim().split(/\s+/);
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    form.dailyTime = Number.isFinite(minute) && Number.isFinite(hour)
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      : '09:00';
  }
  form.bindConversation = !!task.conversationId;
  form.agentId = task.agentId || '';
  form.platformId = task.platformId || '';
  form.modelId = task.modelId || '';
  form.spaceId = task.spaceId || '';
  formVisible.value = true;
}

/** 调度描述：每 N 分钟 / 每天 HH:MM / 原始 cron */
function scheduleText(task: ScheduledTask): string {
  if (task.intervalMinutes && task.intervalMinutes > 0) return `每 ${task.intervalMinutes} 分钟`;
  const parts = (task.cronExpr || '').trim().split(/\s+/);
  if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && (parts[4] === '*' || parts[4] === '?')) {
    const hour = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
    const minute = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
    return `每天 ${hour}:${minute}`;
  }
  return task.cronExpr ? `Cron ${task.cronExpr}` : '未设置';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function onSave() {
  if (!form.name.trim()) { ElMessage.warning('请填写任务名称'); return; }
  if (!form.prompt.trim()) { ElMessage.warning('请填写提示词'); return; }
  const input: any = {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    conversationId: form.bindConversation && currentConv.value ? currentConv.value.id : null,
    agentId: form.agentId || null,
    platformId: form.platformId || null,
    modelId: form.modelId || null,
    spaceId: form.spaceId || null,
  };
  if (form.scheduleType === 'interval') {
    input.intervalMinutes = form.intervalMinutes;
    input.cronExpr = null;
  } else {
    const [h, m] = (form.dailyTime || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
    input.cronExpr = `${m} ${h} * * *`;
    input.intervalMinutes = null;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await taskStore.updateTask(editingId.value, input);
      ElMessage.success('定时任务已更新');
    } else {
      await taskStore.createTask(input);
      ElMessage.success('定时任务已创建');
    }
    formVisible.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onToggle(task: ScheduledTask, value: string | number | boolean) {
  try {
    await taskStore.updateTask(task.id, { enabled: !!value });
    ElMessage.success(value ? '任务已启用' : '任务已暂停');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function onRun(task: ScheduledTask) {
  runningId.value = task.id;
  try {
    const r = await taskStore.runTask(task.id);
    if (r.ok) {
      ElMessage.success('任务已运行');
      await store.loadConversations();
      if (r.conversationId && r.conversationId === store.currentConvId) {
        await store.loadMessages(store.currentConvId);
      }
    } else {
      ElMessage.error(r.error || '任务执行失败');
    }
  } finally {
    runningId.value = '';
  }
}

async function onDelete(task: ScheduledTask) {
  try {
    await ElMessageBox.confirm(
      `确定删除定时任务「${task.name}」吗？已产生的会话不受影响。`,
      '删除任务',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    await taskStore.deleteTask(task.id);
    ElMessage.success('任务已删除');
  } catch { /* 取消 */ }
}
</script>

<style scoped>
.scheduled-task-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 10px;
  overflow: hidden;
}

.st-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.st-hint {
  color: var(--el-text-color-secondary, #64748b);
  font-size: 12px;
}

.st-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding: 2px;
}

.st-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--el-fill-color-blank, #fff);
}

.st-item-main {
  min-width: 0;
  flex: 1;
}

.st-item-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.st-item-sub {
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
}

.st-item-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.st-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.st-form-title {
  font-weight: 600;
  font-size: 14px;
}

.st-form {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}
.st-form :deep(.el-input-number),
.st-form :deep(.el-time-picker),
.st-form :deep(.el-date-editor) { width: 100%; }

.st-form-hint {
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
  margin: 6px 0 10px;
  line-height: 1.5;
}

.st-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--glass-border, rgba(15, 23, 42, 0.06));
}

@media (max-width: 767px) {
  .st-item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
