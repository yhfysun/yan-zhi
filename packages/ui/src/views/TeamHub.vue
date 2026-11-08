<template>
  <div class="team-page">
    <div class="team-head">
      <div>
        <h2>团队工作台</h2>
        <p>团队资源、我的额度、工作节点与远程任务</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <section class="team-stats">
      <div class="team-stat">
        <span>团队资源</span>
        <b>{{ totalResources }}</b>
        <small>模型 / Skill / 专家 / MCP</small>
      </div>
      <div class="team-stat">
        <span>我的额度</span>
        <b>{{ quota?.limitCny == null ? '不限' : `¥${Number(quota.limitCny).toFixed(2)}` }}</b>
        <small v-if="quota?.limitCny != null">已用 ¥{{ Number(quota.usedCny || 0).toFixed(2) }} · 剩余 ¥{{ Number(quota.remainingCny || 0).toFixed(2) }}</small>
        <small v-else>未配置周期额度</small>
      </div>
      <div class="team-stat">
        <span>可用节点</span>
        <b>{{ onlineNodes }}/{{ nodes.length }}</b>
        <small>关闭页面后远程任务继续执行</small>
      </div>
      <div class="team-stat">
        <span>活跃工作区</span>
        <b>{{ activeWorkspaces }}</b>
        <small>TTL 到期自动停止</small>
      </div>
    </section>

    <section class="team-panel">
      <div class="panel-head">
        <h3>团队资源</h3>
        <span>与个人资源分开显示</span>
      </div>
      <div class="resource-chips">
        <span v-for="card in resourceCards" :key="card.key">
          <b>{{ card.label }}</b>
          <em>{{ card.items.length }}</em>
        </span>
      </div>
    </section>

    <section class="team-panel">
      <div class="panel-head">
        <h3>远程任务</h3>
        <el-button size="small" type="primary" :disabled="!nodes.length" @click="openTask">下发任务</el-button>
      </div>
      <el-table :data="tasks" border size="small">
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
        <el-table-column prop="kind" label="类型" width="120" />
        <el-table-column prop="state" label="状态" width="100" />
        <el-table-column label="节点" min-width="150"><template #default="{ row }">{{ nodeName(row.node_id) }}</template></el-table-column>
        <el-table-column label="内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.payload?.command || row.payload?.name || row.workspace_id || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="showEvents(row)">事件</el-button>
            <el-button v-if="row.state === 'queued' || row.state === 'running'" link type="danger" @click="cancel(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="team-panel">
      <div class="panel-head">
        <h3>云工作区</h3>
        <el-button size="small" :disabled="!nodes.length" @click="openWorkspace">创建</el-button>
      </div>
      <el-table :data="workspaces" border size="small">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="模式" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.runtime_mode === 'container' ? 'warning' : 'info'">
              {{ row.runtime_mode === 'container' ? '容器' : '目录' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tooltip v-if="row.last_error" :content="row.last_error" placement="top">
              <el-tag size="small" type="danger">{{ row.status }}</el-tag>
            </el-tooltip>
            <span v-else>{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="240" show-overflow-tooltip />
        <el-table-column label="到期" width="170"><template #default="{ row }">{{ formatTime(row.expires_at) }}</template></el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button v-if="row.status === 'running' && (row.ports || []).length" link type="primary" :title="`端口 ${row.ports.join(', ')}`" @click="openPreview(row)">预览</el-button>
            <el-button v-if="row.status !== 'stopped'" link type="danger" @click="stopWorkspace(row)">停止</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="taskDialog" title="下发远程任务" width="600px">
      <el-form label-width="90px">
        <el-form-item label="节点">
          <el-select v-model="taskForm.nodeId" style="width: 100%">
            <el-option v-for="n in onlineNodeOptions" :key="n.id" :label="n.name" :value="n.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="命令"><el-input v-model="taskForm.command" type="textarea" :rows="5" placeholder="例如：pnpm test" /></el-form-item>
        <el-form-item label="超时"><el-input-number v-model="taskForm.timeoutMinutes" :min="1" :max="1440" /><span class="hint">分钟</span></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTask">下发</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="workspaceDialog" title="创建云工作区" width="540px">
      <el-form label-width="90px">
        <el-form-item label="节点">
          <el-select v-model="workspaceForm.nodeId" style="width: 100%">
            <el-option v-for="n in onlineNodeOptions" :key="n.id" :label="n.name" :value="n.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="workspaceForm.name" /></el-form-item>
        <el-form-item label="生命周期"><el-input-number v-model="workspaceForm.ttlMinutes" :min="5" :max="10080" /><span class="hint">分钟</span></el-form-item>
        <el-form-item label="容器镜像">
          <el-input v-model="workspaceForm.image" placeholder="留空＝节点目录模式；填写如 ubuntu:22.04 则启动容器" />
        </el-form-item>
        <template v-if="workspaceForm.image.trim()">
          <el-form-item label="CPU 限额">
            <el-input-number v-model="workspaceForm.cpu" :min="0" :max="64" :step="0.5" /><span class="hint">0＝不限，单位核</span>
          </el-form-item>
          <el-form-item label="内存限额">
            <el-input-number v-model="workspaceForm.memoryMb" :min="0" :max="131072" /><span class="hint">0＝不限，单位 MB</span>
          </el-form-item>
        </template>
        <el-form-item label="保留目录">
          <el-switch v-model="workspaceForm.keepDir" /><span class="hint">停止后保留节点上的工作目录</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="workspaceDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkspace">创建</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="eventsDrawer" title="任务事件" size="640px">
      <div class="event-list">
        <div v-for="e in events" :key="e.id" class="event-row">
          <span>#{{ e.seq }}</span>
          <b>{{ e.kind }}</b>
          <pre>{{ typeof e.payload?.text === 'string' ? e.payload.text : JSON.stringify(e.payload, null, 2) }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { enterpriseApi, type DesignResource, type RuntimeNode, type RuntimeTask, type RuntimeWorkspace, type TeamResourceCatalog } from '../api/enterprise';
import { API_BASE, getToken } from '../api/client';

const loading = ref(false);
const saving = ref(false);
const resources = ref<TeamResourceCatalog | null>(null);
const designResources = ref<DesignResource[]>([]);
const quota = ref<any>(null);
const nodes = ref<RuntimeNode[]>([]);
const tasks = ref<RuntimeTask[]>([]);
const workspaces = ref<RuntimeWorkspace[]>([]);
const taskDialog = ref(false);
const workspaceDialog = ref(false);
const eventsDrawer = ref(false);
const events = ref<any[]>([]);
const taskForm = ref({ nodeId: '', command: '', timeoutMinutes: 30 });
const emptyWorkspaceForm = () => ({
  nodeId: '', name: '办公工作区', ttlMinutes: 120,
  image: '', cpu: 0, memoryMb: 0, keepDir: false,
});
const workspaceForm = ref(emptyWorkspaceForm());

const totalResources = computed(() => {
  const r = resources.value;
  return ['models', 'skills', 'agents', 'tools', 'mcp'].reduce((n, k) => n + ((r as any)?.[k]?.length || 0), 0) + designResources.value.length;
});
const onlineNodes = computed(() => nodes.value.filter((n) => n.status === 'online').length);
const activeWorkspaces = computed(() => workspaces.value.filter((w) => !['stopped', 'failed'].includes(w.status)).length);
const onlineNodeOptions = computed(() => nodes.value.filter((n) => n.status === 'online'));
const resourceCards = computed(() => [
  { key: 'models', label: '模型', items: resources.value?.models || [] },
  { key: 'skills', label: 'Skill', items: resources.value?.skills || [] },
  { key: 'agents', label: '专家', items: resources.value?.agents || [] },
  { key: 'tools', label: '工具', items: resources.value?.tools || [] },
  { key: 'mcp', label: 'MCP', items: resources.value?.mcp || [] },
  { key: 'design', label: '设计资源', items: designResources.value },
]);

function formatTime(v: number | null) {
  return v ? new Date(v).toLocaleString() : '-';
}
function nodeName(id: string) {
  return nodes.value.find((n) => n.id === id)?.name || id.slice(0, 8);
}

async function reload() {
  loading.value = true;
  try {
    const [r, d, q, n, t, w] = await Promise.all([
      enterpriseApi.myResources(),
      enterpriseApi.myDesignResources(),
      enterpriseApi.myQuota(),
      enterpriseApi.myNodes(),
      enterpriseApi.myTasks(),
      enterpriseApi.myWorkspaces(),
    ]);
    resources.value = r;
    designResources.value = d || [];
    quota.value = q;
    nodes.value = n || [];
    tasks.value = t || [];
    workspaces.value = w || [];
  } finally {
    loading.value = false;
  }
}

function openTask() {
  taskForm.value = { nodeId: onlineNodeOptions.value[0]?.id || '', command: '', timeoutMinutes: 30 };
  taskDialog.value = true;
}
async function saveTask() {
  saving.value = true;
  try {
    const r = await enterpriseApi.createTask({
      nodeId: taskForm.value.nodeId,
      kind: 'command',
      payload: { command: taskForm.value.command, timeoutMs: taskForm.value.timeoutMinutes * 60_000 },
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    taskDialog.value = false;
    ElMessage.success('任务已下发');
    await reload();
  } finally { saving.value = false; }
}
async function cancel(row: RuntimeTask) {
  const r = await enterpriseApi.cancelTask(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}
async function showEvents(row: RuntimeTask) {
  events.value = (await enterpriseApi.taskEvents(row.id)) || [];
  eventsDrawer.value = true;
}
function openWorkspace() {
  workspaceForm.value = { ...emptyWorkspaceForm(), nodeId: onlineNodeOptions.value[0]?.id || '' };
  workspaceDialog.value = true;
}
async function saveWorkspace() {
  saving.value = true;
  try {
    const f = workspaceForm.value;
    const r = await enterpriseApi.createWorkspace({
      ...f,
      image: f.image.trim() || undefined,
      cpu: f.cpu || undefined,
      memoryMb: f.memoryMb || undefined,
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    workspaceDialog.value = false;
    ElMessage.success(f.image.trim() ? '容器工作区创建任务已下发' : '工作区创建任务已下发');
    await reload();
  } finally { saving.value = false; }
}
async function stopWorkspace(row: RuntimeWorkspace) {
  const r = await enterpriseApi.stopWorkspace(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}
function openPreview(row: RuntimeWorkspace) {
  const port = Number((row.ports || [])[0]);
  if (!port) { ElMessage.warning('该工作区没有已登记的预览端口'); return; }
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  window.open(`${API_BASE}/enterprise/runtime/workspaces/${row.id}/preview/${port}/${qs}`, '_blank', 'noopener,noreferrer');
}

onMounted(reload);
</script>

<style scoped>
.team-page { height: 100%; overflow: auto; padding: 20px 24px; }
.team-head, .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.team-head h2 { margin: 0; font-size: 18px; }
.team-head p, .panel-head span { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.team-stats { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
.team-stat { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); }
.team-stat span, .team-stat small { color: var(--color-text-secondary); font-size: 12px; }
.team-stat b { font-size: 24px; }
.team-panel { margin-top: 14px; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); }
.panel-head h3 { margin: 0; font-size: 15px; }
.resource-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.resource-chips span { display: inline-flex; gap: 8px; align-items: center; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 12px; }
.resource-chips em { font-style: normal; color: var(--color-primary); font-weight: 700; }
.hint { margin-left: 8px; color: var(--color-text-secondary); font-size: 12px; }
.event-list { display: flex; flex-direction: column; gap: 8px; }
.event-row { display: grid; grid-template-columns: 44px 100px minmax(0, 1fr); gap: 8px; padding: 8px; border: 1px solid var(--color-border); border-radius: 6px; }
.event-row pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
@media (max-width: 900px) { .team-stats { grid-template-columns: repeat(2, minmax(140px, 1fr)); } }
</style>
