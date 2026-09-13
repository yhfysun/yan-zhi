<template>
  <div class="scheduled-task-panel">
    <!-- 任务列表 -->
    <template v-if="!formVisible">
      <div class="st-toolbar">
        <el-input v-model="search" placeholder="搜索定时任务" size="small" clearable :prefix-icon="Search" />
      </div>
      <div v-loading="taskStore.loading" class="st-list" @contextmenu.prevent.stop="openBlankMenu($event)">
        <!-- 分组节点 -->
        <div v-for="g in displayGroups" :key="g.id" class="st-group">
          <div class="st-group-header" @click="toggleGroup(g.id)" @contextmenu.prevent.stop="openGroupMenu($event, g)">
            <el-icon class="st-collapse-icon" :class="{ expanded: !collapsedGroups[g.id] }"><CaretRight /></el-icon>
            <template v-if="renamingGroupId === g.id">
              <input
                ref="renameInputRef"
                v-model="renamingGroupName"
                class="st-group-rename"
                @click.stop
                @keyup.enter="commitGroupRename"
                @keyup.esc="renamingGroupId = null"
                @blur="commitGroupRename"
              />
            </template>
            <template v-else>
              <span class="st-group-name" :title="g.name">{{ g.name }}</span>
              <span class="st-group-count">{{ groupTaskCount(g.id) }}</span>
            </template>
          </div>
          <div v-show="!collapsedGroups[g.id]" class="st-group-body">
            <div
              v-for="task in groupTasks(g.id)"
              :key="task.id"
              class="st-item glass-card"
              @contextmenu.prevent.stop="openTaskMenu($event, task)"
            >
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
          </div>
        </div>
        <!-- 未分组 -->
        <div v-if="ungroupedTasks.length > 0 || taskStore.groups.length === 0" class="st-group">
          <div class="st-group-header" @click="toggleGroup(UNGROUPED)" @contextmenu.prevent.stop="openUngroupedMenu($event)">
            <el-icon class="st-collapse-icon" :class="{ expanded: !collapsedGroups[UNGROUPED] }"><CaretRight /></el-icon>
            <span class="st-group-name">未分组</span>
            <span class="st-group-count">{{ ungroupedTasks.length }}</span>
          </div>
          <div v-show="!collapsedGroups[UNGROUPED]" class="st-group-body">
            <div
              v-for="task in ungroupedTasks"
              :key="task.id"
              class="st-item glass-card"
              @contextmenu.prevent.stop="openTaskMenu($event, task)"
            >
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
          </div>
        </div>
        <el-empty v-if="taskStore.tasks.length === 0 && !taskStore.loading" description="暂无定时任务，右击新建" :image-size="60" />
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
        <el-form-item label="所属分组">
          <el-select v-model="form.groupId" placeholder="未分组" clearable filterable>
            <el-option v-for="g in taskStore.groups" :key="g.id" :value="g.id" :label="g.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="form.prompt" type="textarea" :rows="4" placeholder="定时发送给模型的提示词" />
        </el-form-item>
        <el-form-item label="定时方式">
          <el-radio-group v-model="form.scheduleMode">
            <el-radio value="cycle">周期</el-radio>
            <el-radio value="interval">间隔</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.scheduleMode === 'cycle'">
          <el-form-item label="周期类型">
            <el-radio-group v-model="form.cycleType">
              <el-radio value="once">单次</el-radio>
              <el-radio value="daily">每天</el-radio>
              <el-radio value="weekly">每周</el-radio>
              <el-radio value="biweekly">双周</el-radio>
              <el-radio value="monthly">每月</el-radio>
              <el-radio value="yearly">每年</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="form.cycleType === 'once'" label="执行时间">
            <div class="st-sched-stack">
              <el-date-picker v-model="form.onceDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
              <el-time-picker v-model="form.onceTime" format="HH:mm" value-format="HH:mm" placeholder="时间" />
            </div>
          </el-form-item>
          <el-form-item v-else-if="form.cycleType === 'daily'" label="运行时间">
            <el-time-picker v-model="form.dailyTime" format="HH:mm" value-format="HH:mm" placeholder="选择时间" />
          </el-form-item>
          <el-form-item v-else-if="form.cycleType === 'weekly' || form.cycleType === 'biweekly'" label="星期 / 时间">
            <div class="st-sched-stack">
              <el-select v-model="form.weekDay" placeholder="选择星期">
                <el-option v-for="(w, i) in WEEK_LABELS" :key="i" :value="i" :label="w" />
              </el-select>
              <el-time-picker v-model="form.weekTime" format="HH:mm" value-format="HH:mm" placeholder="时间" />
            </div>
          </el-form-item>
          <el-form-item v-else-if="form.cycleType === 'monthly'" label="日期 / 时间">
            <div class="st-sched-stack">
              <el-input-number v-model="form.monthDay" :min="1" :max="31" placeholder="几号" />
              <el-time-picker v-model="form.monthTime" format="HH:mm" value-format="HH:mm" placeholder="时间" />
            </div>
          </el-form-item>
          <el-form-item v-else-if="form.cycleType === 'yearly'" label="月 / 日 / 时间">
            <div class="st-sched-stack">
              <el-input-number v-model="form.yearMonth" :min="1" :max="12" placeholder="月" />
              <el-input-number v-model="form.yearDay" :min="1" :max="31" placeholder="日" />
              <el-time-picker v-model="form.yearTime" format="HH:mm" value-format="HH:mm" placeholder="时间" />
            </div>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="星期">
            <el-select v-model="form.intervalWeekDays" multiple clearable placeholder="不限（默认每天都可执行）">
              <el-option v-for="(w, i) in WEEK_LABELS" :key="i" :value="i" :label="w" />
            </el-select>
          </el-form-item>
          <el-form-item label="间隔">
            <div class="st-sched-row">
              <el-input-number v-model="form.intervalDays" :min="0" :max="365" placeholder="天" />
              <span class="st-sched-unit">天</span>
              <el-input-number v-model="form.intervalHours" :min="0" :max="23" placeholder="时" />
              <span class="st-sched-unit">时</span>
              <el-input-number v-model="form.intervalMinutes" :min="0" :max="59" placeholder="分" />
              <span class="st-sched-unit">分</span>
            </div>
          </el-form-item>
        </template>

        <el-form-item label="有效期">
          <el-date-picker v-model="form.expireAt" type="date" value-format="YYYY-MM-DD" placeholder="永久有效" clearable />
        </el-form-item>
        <el-form-item label="智能体">
          <el-select v-model="form.agentId" placeholder="不绑定则用默认智能体" clearable filterable @change="onAgentPick">
            <el-option v-for="ag in agentStore.chatAgents" :key="ag.id" :value="ag.id" :label="ag.name" />
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

    <!-- 右击菜单：传送到 body，脱离 .sidebar 的 backdrop-filter containing block，保证 fixed 定位相对视窗 -->
    <Teleport to="body">
      <ul v-if="ctxMenu.visible" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }" @click.stop>
        <li
          v-for="item in ctxMenu.items"
          :key="item.label"
          :class="{ danger: item.danger }"
          @click="item.handler(); closeCtxMenu()"
        >
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>{{ item.label }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { clampMenuPos } from '../../utils/menuPosition';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Delete, EditPen, Plus, VideoPlay, Search, CaretRight, FolderOpened, ChatDotRound,
} from '@element-plus/icons-vue';
import { useScheduledTaskStore, type ScheduledTask, type ScheduleConfig } from '../../stores/scheduledTask';
import { useChat } from '../../composables/chat/useChat';

const taskStore = useScheduledTaskStore();
const { store, currentConv, agentStore, spaceStore, modelGroups } = useChat();

const UNGROUPED = '__ungrouped__';

const formVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const runningId = ref('');
const search = ref('');
const renamingGroupId = ref<string | null>(null);
const renamingGroupName = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);
const collapsedGroups = ref<Record<string, boolean>>({});

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const form = reactive({
  name: '',
  prompt: '',
  scheduleMode: 'cycle' as 'cycle' | 'interval',
  cycleType: 'daily' as 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly',
  onceDate: '',
  onceTime: '09:00',
  dailyTime: '09:00',
  weekDay: 1,
  weekTime: '09:00',
  monthDay: 1,
  monthTime: '09:00',
  yearMonth: 1,
  yearDay: 1,
  yearTime: '09:00',
  intervalDays: 0,
  intervalHours: 0,
  intervalMinutes: 30,
  intervalWeekDays: [] as number[],
  expireAt: '',
  bindConversation: false,
  agentId: '' as string,
  platformId: '' as string,
  modelId: '' as string,
  spaceId: '' as string,
  groupId: '' as string,
});

onMounted(() => {
  if (taskStore.tasks.length === 0) taskStore.loadTasks();
  if (taskStore.groups.length === 0) taskStore.loadGroups();
  document.addEventListener('mousedown', onDocMouseDown, true);
});
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));

function onDocMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.ctx-menu')) return;
  closeCtxMenu();
}

const filteredTasks = computed(() => {
  const kw = search.value.trim().toLowerCase();
  if (!kw) return taskStore.tasks;
  return taskStore.tasks.filter((t) => t.name.toLowerCase().includes(kw));
});

const displayGroups = computed(() => {
  const kw = search.value.trim().toLowerCase();
  if (!kw) return taskStore.groups;
  return taskStore.groups.filter((g) => filteredTasks.value.some((t) => t.groupId === g.id));
});

const ungroupedTasks = computed(() => filteredTasks.value.filter((t) => !t.groupId));

function groupTasks(groupId: string): ScheduledTask[] {
  return filteredTasks.value.filter((t) => t.groupId === groupId);
}
function groupTaskCount(groupId: string): number {
  return taskStore.tasks.filter((t) => t.groupId === groupId).length;
}
function toggleGroup(id: string) {
  collapsedGroups.value[id] = !collapsedGroups.value[id];
}

// ===== 右击菜单 =====
interface MenuItem {
  label: string;
  icon?: any;
  handler: () => void;
  danger?: boolean;
}
const ctxMenu = ref<{ visible: boolean; x: number; y: number; items: MenuItem[] }>({
  visible: false, x: 0, y: 0, items: [],
});

function openBlankMenu(e: MouseEvent) {
  if (formVisible.value) return;
  ctxMenu.value = {
    visible: true,
    ...clampMenuPos(e),
    items: [
      { label: '新建定时任务', icon: ChatDotRound, handler: () => openCreate() },
      { label: '新建分组', icon: FolderOpened, handler: () => createGroupInline() },
    ],
  };
}

function openGroupMenu(e: MouseEvent, group: { id: string; name: string }) {
  ctxMenu.value = {
    visible: true,
    ...clampMenuPos(e),
    items: [
      { label: '新建定时任务', icon: ChatDotRound, handler: () => openCreate(group.id) },
      { label: '重命名分组', icon: EditPen, handler: () => startGroupRename(group.id, group.name) },
      { label: '删除分组', icon: Delete, handler: () => deleteGroupConfirm(group.id, group.name), danger: true },
    ],
  };
}

function openUngroupedMenu(e: MouseEvent) {
  ctxMenu.value = {
    visible: true,
    ...clampMenuPos(e),
    items: [
      { label: '新建定时任务', icon: ChatDotRound, handler: () => openCreate() },
      { label: '新建分组', icon: FolderOpened, handler: () => createGroupInline() },
    ],
  };
}

function openTaskMenu(e: MouseEvent, task: ScheduledTask) {
  ctxMenu.value = {
    visible: true,
    ...clampMenuPos(e),
    items: [
      { label: '编辑', icon: EditPen, handler: () => openEdit(task) },
      { label: '立即运行', icon: VideoPlay, handler: () => onRun(task) },
      { label: '删除', icon: Delete, handler: () => onDelete(task), danger: true },
    ],
  };
}

function closeCtxMenu() {
  ctxMenu.value.visible = false;
}

// ===== 分组操作 =====
async function createGroupInline() {
  try {
    const name = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPlaceholder: '分组名称',
      inputValidator: (v: string) => (v && v.trim() ? true : '分组名称不能为空'),
    });
    await taskStore.createGroup(name.value.trim());
    ElMessage.success('分组已创建');
  } catch { /* 取消 */ }
}

function startGroupRename(id: string, name: string) {
  renamingGroupId.value = id;
  renamingGroupName.value = name;
  nextTick(() => renameInputRef.value?.focus());
}

async function commitGroupRename() {
  if (!renamingGroupId.value) return;
  const id = renamingGroupId.value;
  const name = renamingGroupName.value.trim();
  renamingGroupId.value = null;
  if (!name) return;
  const old = taskStore.groups.find((g) => g.id === id)?.name || '';
  if (name === old) return;
  try {
    await taskStore.renameGroup(id, name);
    ElMessage.success('分组已重命名');
  } catch (e: any) {
    ElMessage.error(e?.message || '重命名失败');
  }
}

async function deleteGroupConfirm(id: string, name: string) {
  try {
    await ElMessageBox.confirm(
      `确定删除分组「${name}」吗？组内任务将移至未分组。`,
      '删除分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    await taskStore.deleteGroup(id);
    ElMessage.success('分组已删除');
  } catch { /* 取消 */ }
}

function boundAgentName(id?: string | null): string {
  if (!id) return '';
  return agentStore.agents.find((a) => a.id === id)?.name || '';
}
function boundSpaceName(id?: string | null): string {
  if (!id) return '';
  return spaceStore.spaces.find((s) => s.id === id)?.name || '';
}

function onAgentPick(agentId: string) {
  if (!agentId) return;
  const ag = agentStore.agents.find((a) => a.id === agentId);
  if (ag) {
    form.platformId = ag.platformId || '';
    form.modelId = ag.modelId || '';
  }
}

function onModelPick(modelId: string) {
  if (!modelId) { form.platformId = ''; return; }
  for (const group of modelGroups.value) {
    if (group.models.find((m) => m.id === modelId)) {
      form.platformId = group.platformId;
      return;
    }
  }
}

function resetSchedule() {
  form.scheduleMode = 'cycle';
  form.cycleType = 'daily';
  form.onceDate = '';
  form.onceTime = '09:00';
  form.dailyTime = '09:00';
  form.weekDay = 1;
  form.weekTime = '09:00';
  form.monthDay = 1;
  form.monthTime = '09:00';
  form.yearMonth = 1;
  form.yearDay = 1;
  form.yearTime = '09:00';
  form.intervalDays = 0;
  form.intervalHours = 0;
  form.intervalMinutes = 30;
  form.intervalWeekDays = [];
  form.expireAt = '';
}

function applySchedule(s: ScheduleConfig) {
  resetSchedule();
  if (!s) return;
  if (s.mode === 'interval') {
    form.scheduleMode = 'interval';
    form.intervalDays = s.days || 0;
    form.intervalHours = s.hours || 0;
    form.intervalMinutes = s.minutes || 0;
    form.intervalWeekDays = s.daysOfWeek ? [...s.daysOfWeek] : [];
    return;
  }
  form.scheduleMode = 'cycle';
  form.cycleType = s.type || 'daily';
  switch (s.type) {
    case 'once':
      if (s.datetime) {
        const d = new Date(s.datetime);
        form.onceDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        form.onceTime = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      break;
    case 'daily': form.dailyTime = s.time || '09:00'; break;
    case 'weekly':
    case 'biweekly':
      form.weekDay = s.dayOfWeek ?? 1;
      form.weekTime = s.time || '09:00';
      break;
    case 'monthly': form.monthDay = s.dayOfMonth ?? 1; form.monthTime = s.time || '09:00'; break;
    case 'yearly': form.yearMonth = s.month ?? 1; form.yearDay = s.dayOfMonth ?? 1; form.yearTime = s.time || '09:00'; break;
  }
}

function buildSchedule(): ScheduleConfig {
  if (form.scheduleMode === 'cycle') {
    const s: ScheduleConfig = { mode: 'cycle', type: form.cycleType };
    switch (form.cycleType) {
      case 'once':
        if (form.onceDate) s.datetime = new Date(form.onceDate + 'T' + (form.onceTime || '09:00') + ':00').getTime();
        break;
      case 'daily': s.time = form.dailyTime || '09:00'; break;
      case 'weekly':
      case 'biweekly':
        s.dayOfWeek = form.weekDay;
        s.time = form.weekTime || '09:00';
        if (form.cycleType === 'biweekly') s.anchor = Date.now();
        break;
      case 'monthly': s.dayOfMonth = form.monthDay; s.time = form.monthTime || '09:00'; break;
      case 'yearly': s.month = form.yearMonth; s.dayOfMonth = form.yearDay; s.time = form.yearTime || '09:00'; break;
    }
    return s;
  }
  const s: ScheduleConfig = { mode: 'interval', days: form.intervalDays, hours: form.intervalHours, minutes: form.intervalMinutes };
  if (form.intervalWeekDays.length) s.daysOfWeek = [...form.intervalWeekDays];
  return s;
}

function openCreate(groupId?: string) {
  editingId.value = null;
  form.name = '';
  form.prompt = '';
  resetSchedule();
  form.bindConversation = !!currentConv.value;
  form.agentId = agentStore.selectedId || '';
  const ag = agentStore.agents.find((a) => a.id === form.agentId);
  form.platformId = ag?.platformId || '';
  form.modelId = ag?.modelId || '';
  form.spaceId = spaceStore.currentSpaceId || '';
  form.groupId = groupId || '';
  formVisible.value = true;
}

function openEdit(task: ScheduledTask) {
  editingId.value = task.id;
  form.name = task.name;
  form.prompt = task.prompt || '';
  if (task.schedule) {
    applySchedule(task.schedule);
  } else if (task.intervalMinutes && task.intervalMinutes > 0) {
    form.scheduleMode = 'interval';
    form.intervalDays = Math.floor(task.intervalMinutes / 1440);
    form.intervalHours = Math.floor((task.intervalMinutes % 1440) / 60);
    form.intervalMinutes = task.intervalMinutes % 60;
  } else {
    form.scheduleMode = 'cycle';
    form.cycleType = 'daily';
    const parts = (task.cronExpr || '').trim().split(/\s+/);
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    form.dailyTime = Number.isFinite(minute) && Number.isFinite(hour)
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      : '09:00';
  }
  if (task.expireAt) {
    const d = new Date(task.expireAt);
    form.expireAt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } else {
    form.expireAt = '';
  }
  form.bindConversation = !!task.conversationId;
  form.agentId = task.agentId || '';
  form.platformId = task.platformId || '';
  form.modelId = task.modelId || '';
  form.spaceId = task.spaceId || '';
  form.groupId = task.groupId || '';
  formVisible.value = true;
}

function scheduleText(task: ScheduledTask): string {
  const s = task.schedule;
  if (s) {
    if (s.mode === 'interval') {
      const parts: string[] = [];
      if (s.days) parts.push(s.days + '天');
      if (s.hours) parts.push(s.hours + '时');
      if (s.minutes) parts.push(s.minutes + '分');
      const base = parts.length ? '每 ' + parts.join('') : '未设置';
      if (s.daysOfWeek && s.daysOfWeek.length) {
        return base + '（' + s.daysOfWeek.map((d) => WEEK_LABELS[d]).join('、') + '）';
      }
      return base;
    }
    switch (s.type) {
      case 'once': return s.datetime ? '单次 ' + formatTime(s.datetime) : '单次';
      case 'daily': return '每天 ' + (s.time || '');
      case 'weekly': return '每周' + WEEK_LABELS[s.dayOfWeek ?? 0] + ' ' + (s.time || '');
      case 'biweekly': return '双周' + WEEK_LABELS[s.dayOfWeek ?? 0] + ' ' + (s.time || '');
      case 'monthly': return '每月' + (s.dayOfMonth ?? 1) + '日 ' + (s.time || '');
      case 'yearly': return '每年' + (s.month ?? 1) + '月' + (s.dayOfMonth ?? 1) + '日 ' + (s.time || '');
    }
    return '未设置';
  }
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
  if (form.scheduleMode === 'cycle' && form.cycleType === 'once' && !form.onceDate) {
    ElMessage.warning('请选择单次任务的执行日期'); return;
  }
  if (form.scheduleMode === 'interval' && form.intervalDays <= 0 && form.intervalHours <= 0 && form.intervalMinutes <= 0) {
    ElMessage.warning('请设置间隔时长（天/时/分至少一项大于 0）'); return;
  }
  const schedule = buildSchedule();
  const input: any = {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    conversationId: form.bindConversation && currentConv.value ? currentConv.value.id : null,
    agentId: form.agentId || null,
    platformId: form.platformId || null,
    modelId: form.modelId || null,
    spaceId: form.spaceId || null,
    groupId: form.groupId || null,
    schedule,
    expireAt: form.expireAt ? new Date(form.expireAt + 'T23:59:59').getTime() : null,
    cronExpr: null,
    intervalMinutes: null,
  };
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
  gap: 8px;
  margin-bottom: 10px;
}

.st-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
  padding: 2px;
}

.st-group {
  display: flex;
  flex-direction: column;
}

.st-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}
.st-group-header:hover {
  background: var(--glass-bg-hover, rgba(15, 23, 42, 0.04));
}

.st-collapse-icon {
  transition: transform 0.15s;
  font-size: 12px;
  opacity: 0.6;
}
.st-collapse-icon.expanded {
  transform: rotate(90deg);
}

.st-group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-group-count {
  color: var(--el-text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 400;
}

.st-group-rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 1px solid var(--el-color-primary, #409eff);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
  background: var(--glass-bg, #fff);
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
  outline: none;
}

.st-group-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0 4px 16px;
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
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
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

.st-sched-stack { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.st-sched-stack :deep(.el-input-number),
.st-sched-stack :deep(.el-date-editor),
.st-sched-stack :deep(.el-select) { width: 100%; }
.st-sched-row { display: flex; align-items: center; gap: 6px; width: 100%; }
.st-sched-row :deep(.el-input-number) { flex: 1; }
.st-sched-unit { font-size: 12px; color: var(--el-text-color-secondary, #64748b); flex-shrink: 0; }

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
