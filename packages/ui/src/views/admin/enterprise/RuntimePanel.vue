<template>
  <div class="epanel">
    <div class="toolbar">
      <div>
        <h3>工作节点与云工作区</h3>
        <p>节点 Agent 通过短期令牌接入，任务执行过程、终端输出和产物都回传服务端。</p>
      </div>
      <div class="actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button :icon="Plus" @click="openNode">创建节点</el-button>
        <el-button type="primary" :icon="Monitor" :disabled="!nodes.length" @click="openWorkspace">创建工作区</el-button>
        <el-button type="success" :icon="VideoPlay" :disabled="!nodes.length" @click="openTask">下发任务</el-button>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head"><h3>工作节点</h3><span>{{ onlineCount }}/{{ nodes.length }} 在线</span></div>
      <el-table :data="nodes" border size="small" v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="platform" label="平台" width="100" />
        <el-table-column prop="arch" label="架构" width="80" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'online' ? 'success' : row.status === 'disabled' ? 'info' : 'danger'">{{ nodeStatus(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后心跳" width="170">
          <template #default="{ row }">{{ formatTime(row.last_seen_at) }}</template>
        </el-table-column>
        <el-table-column label="能力" min-width="180">
          <template #default="{ row }"><el-tag v-for="c in row.capabilities" :key="c" size="small" class="tag">{{ c }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }"><el-button link type="danger" @click="removeNode(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head"><h3>工作区</h3><span>TTL 到期自动下发停止任务</span></div>
      <el-table :data="workspaces" border size="small">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="path" label="路径" min-width="240" show-overflow-tooltip />
        <el-table-column label="端口" width="100">
          <template #default="{ row }">{{ (row.ports || []).join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="到期" width="170">
          <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head"><h3>远程任务</h3><span>最近 100 条</span></div>
      <el-table :data="tasks" border size="small">
        <el-table-column label="创建时间" width="170"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
        <el-table-column prop="kind" label="类型" width="130" />
        <el-table-column prop="state" label="状态" width="100" />
        <el-table-column label="节点" min-width="140">
          <template #default="{ row }">{{ nodeName(row.node_id) }}</template>
        </el-table-column>
        <el-table-column label="命令 / 工作区" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ taskSummary(row) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100">
          <template #default="{ row }">{{ duration(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button link type="primary" @click="showEvents(row)">查看事件</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="nodeDialog" title="创建工作节点" width="520px">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="nodeForm.name" placeholder="例如：财务办公电脑" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="nodeForm.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNode">创建并生成令牌</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="workspaceDialog" title="创建云工作区" width="520px">
      <el-form label-width="100px">
        <el-form-item label="节点">
          <el-select v-model="workspaceForm.nodeId" style="width: 100%">
            <el-option v-for="n in usableNodes" :key="n.id" :label="n.name" :value="n.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="workspaceForm.name" /></el-form-item>
        <el-form-item label="生命周期">
          <el-input-number v-model="workspaceForm.ttlMinutes" :min="5" :max="10080" />
          <span class="hint">分钟</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="workspaceDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkspace">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDialog" title="下发远程任务" width="620px">
      <el-form label-width="90px">
        <el-form-item label="节点">
          <el-select v-model="taskForm.nodeId" style="width: 100%">
            <el-option v-for="n in usableNodes" :key="n.id" :label="n.name" :value="n.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="命令">
          <el-input v-model="taskForm.command" type="textarea" :rows="5" placeholder="例如：pnpm test" />
        </el-form-item>
        <el-form-item label="工作目录"><el-input v-model="taskForm.cwd" placeholder="留空使用节点默认目录" /></el-form-item>
        <el-form-item label="超时">
          <el-input-number v-model="taskForm.timeoutMinutes" :min="1" :max="1440" />
          <span class="hint">分钟</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTask">下发</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="eventsDrawer" :title="`任务事件 · ${activeTask?.id || ''}`" size="680px">
      <div class="event-list">
        <div v-for="e in events" :key="e.id" class="event-row">
          <span class="event-seq">#{{ e.seq }}</span>
          <span class="event-kind">{{ e.kind }}</span>
          <pre>{{ eventText(e) }}</pre>
        </div>
        <el-empty v-if="!events.length" description="暂无事件" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Monitor, Plus, VideoPlay } from '@element-plus/icons-vue';
import { enterpriseApi, type RuntimeNode, type RuntimeTask, type RuntimeWorkspace } from '../../../api/enterprise';
import { api } from '../../../api/client';

const loading = ref(false);
const saving = ref(false);
const nodes = ref<RuntimeNode[]>([]);
const workspaces = ref<RuntimeWorkspace[]>([]);
const tasks = ref<RuntimeTask[]>([]);
const nodeDialog = ref(false);
const workspaceDialog = ref(false);
const taskDialog = ref(false);
const eventsDrawer = ref(false);
const activeTask = ref<RuntimeTask | null>(null);
const events = ref<any[]>([]);
const nodeForm = ref({ name: '', description: '' });
const workspaceForm = ref({ nodeId: '', name: '办公工作区', ttlMinutes: 120 });
const taskForm = ref({ nodeId: '', command: '', cwd: '', timeoutMinutes: 30 });

const onlineCount = computed(() => nodes.value.filter((n) => n.status === 'online').length);
const usableNodes = computed(() => nodes.value.filter((n) => n.status !== 'disabled'));

function formatTime(v: number | null) {
  return v ? new Date(v).toLocaleString() : '-';
}
function nodeStatus(v: string) {
  return v === 'online' ? '在线' : v === 'disabled' ? '停用' : '离线';
}
function nodeName(id: string) {
  return nodes.value.find((n) => n.id === id)?.name || id.slice(0, 8);
}
function taskSummary(row: RuntimeTask) {
  if (row.kind === 'command') return String(row.payload?.command || '-');
  if (row.kind === 'workspace_create') return `创建 ${row.payload?.name || row.workspace_id || ''}`;
  if (row.kind === 'workspace_stop') return `停止 ${row.workspace_id || ''}`;
  return JSON.stringify(row.payload || {});
}
function duration(row: RuntimeTask) {
  if (!row.started_at) return '-';
  const end = row.ended_at || Date.now();
  const s = Math.max(0, Math.round((end - row.started_at) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function eventText(e: any) {
  const p = e.payload || {};
  if (typeof p.text === 'string') return p.text;
  return JSON.stringify(p, null, 2);
}

async function reload() {
  loading.value = true;
  try {
    const [n, w, t] = await Promise.all([
      enterpriseApi.runtimeNodes(),
      enterpriseApi.workspaces(),
      enterpriseApi.runtimeTasks(),
    ]);
    nodes.value = n || [];
    workspaces.value = w || [];
    tasks.value = t || [];
  } finally {
    loading.value = false;
  }
}

function openNode() {
  nodeForm.value = { name: '', description: '' };
  nodeDialog.value = true;
}

async function saveNode() {
  saving.value = true;
  try {
    const r = await enterpriseApi.createRuntimeNode({ name: nodeForm.value.name });
    if ('error' in r) { ElMessage.error(r.error); return; }
    nodeDialog.value = false;
    const { node, token } = r.data;
    await ElMessageBox.alert(
      `<p>节点令牌只显示一次：</p><code style="word-break:break-all">${token}</code><p>在节点上设置 YZ_RUNTIME_TOKEN 后启动 <code>pnpm --filter @yan-zhi/server enterprise:node</code>。</p>`,
      `节点「${node.name}」已创建`,
      { dangerouslyUseHTMLString: true, confirmButtonText: '已保存' },
    );
    await reload();
  } finally { saving.value = false; }
}

async function removeNode(row: RuntimeNode) {
  const confirmed = await ElMessageBox.confirm(`删除节点「${row.name}」？排队任务会被删除。`, '删除节点', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deleteRuntimeNode(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}

function openWorkspace() {
  workspaceForm.value = { nodeId: usableNodes.value[0]?.id || '', name: '办公工作区', ttlMinutes: 120 };
  workspaceDialog.value = true;
}

async function saveWorkspace() {
  saving.value = true;
  try {
    const r = await api.post('/enterprise/runtime/workspaces', workspaceForm.value);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('工作区创建任务已下发');
    workspaceDialog.value = false;
    await reload();
  } finally { saving.value = false; }
}

function openTask() {
  taskForm.value = { nodeId: usableNodes.value[0]?.id || '', command: '', cwd: '', timeoutMinutes: 30 };
  taskDialog.value = true;
}

async function saveTask() {
  saving.value = true;
  try {
    const r = await api.post('/enterprise/runtime/tasks', {
      nodeId: taskForm.value.nodeId,
      kind: 'command',
      payload: {
        command: taskForm.value.command,
        cwd: taskForm.value.cwd || undefined,
        timeoutMs: taskForm.value.timeoutMinutes * 60_000,
      },
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('任务已下发');
    taskDialog.value = false;
    await reload();
  } finally { saving.value = false; }
}

async function showEvents(row: RuntimeTask) {
  activeTask.value = row;
  events.value = [];
  eventsDrawer.value = true;
  const r = await api.get<any[]>(`/enterprise/runtime/tasks/${row.id}/events`);
  if ('data' in r) events.value = r.data || [];
}

onMounted(reload);
</script>

<style scoped>
.epanel { display: flex; flex-direction: column; gap: 14px; }
.toolbar, .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar h3, .panel-head h3 { margin: 0 0 4px; font-size: 15px; }
.toolbar p, .panel-head span { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); }
.tag { margin-right: 4px; margin-bottom: 2px; }
.hint { margin-left: 8px; color: var(--color-text-secondary); font-size: 12px; }
.event-list { display: flex; flex-direction: column; gap: 8px; }
.event-row { display: grid; grid-template-columns: 44px 104px minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px; border: 1px solid var(--color-border); border-radius: 6px; }
.event-seq { color: var(--color-text-secondary); font-size: 11px; }
.event-kind { font-size: 12px; font-weight: 600; }
.event-row pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; line-height: 1.5; }
@media (max-width: 760px) { .toolbar { flex-direction: column; } }
</style>
