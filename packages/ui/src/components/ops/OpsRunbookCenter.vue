<template>
  <div class="orbc">
    <aside class="orbc-list">
      <div class="orbc-head">
        <span>Runbook</span>
        <el-button size="small" :icon="Plus" text title="新建 Runbook" @click="openCreate" />
      </div>
      <button
        v-for="item in runbooks"
        :key="item.id"
        type="button"
        class="orbc-item"
        :class="{ active: item.id === selected?.id }"
        @click="selectRunbook(item)"
      >
        <span class="orbc-item-name">{{ item.name }}</span>
        <span class="orbc-item-meta">v{{ item.version }} · {{ connectionName(item.connectionId) }}</span>
        <span class="orbc-item-state" :class="{ off: !item.enabled }">{{ item.enabled ? '启用' : '停用' }}</span>
      </button>
      <div v-if="!runbooks.length" class="orbc-empty">暂无 Runbook</div>
    </aside>

    <section class="orbc-main">
      <template v-if="selected">
        <div class="orbc-titlebar">
          <div class="orbc-title">
            <strong>{{ selected.name }}</strong>
            <span>v{{ selected.version }} · {{ connectionName(selected.connectionId) }}</span>
          </div>
          <div class="orbc-actions">
            <el-button size="small" :loading="running" :disabled="!selected.enabled" @click="openRun">运行</el-button>
            <el-button size="small" @click="openEdit(selected)">编辑</el-button>
            <el-button size="small" text type="danger" @click="remove(selected)">删除</el-button>
          </div>
        </div>
        <p v-if="selected.description" class="orbc-desc">{{ selected.description }}</p>

        <div class="orbc-meta">
          <span>执行步骤 <b>{{ selected.steps.length }}</b></span>
          <span>回滚步骤 <b>{{ selected.rollbackSteps.length }}</b></span>
          <span>参数 <b>{{ (selected.parameters || []).length }}</b></span>
          <span>更新 {{ formatTime(selected.updatedAt) }}</span>
        </div>

        <div v-if="currentRun" class="orbc-run">
          <div class="orbc-run-head">
            <span>本次运行</span>
            <div class="orbc-run-head-actions">
              <el-button
                v-if="currentRun.status === 'running'"
                size="small"
                text
                type="warning"
                :loading="cancelling"
                @click="cancelCurrentRun"
              >
                取消运行
              </el-button>
              <span v-if="currentRun.scheduledTaskId" class="orbc-run-source">定时</span>
              <span class="orbc-run-status" :class="currentRun.status">{{ runStatusLabel(currentRun.status) }}</span>
            </div>
          </div>
          <div v-if="Object.keys(currentRun.inputParams || {}).length" class="orbc-run-params">
            <span v-for="(value, key) in currentRun.inputParams" :key="key">{{ key }}={{ value }}</span>
          </div>
          <div v-if="currentRun.error" class="orbc-run-error">{{ currentRun.error }}</div>
          <div v-for="step in currentRun.stepResults || []" :key="step.id" class="orbc-step" :class="step.status">
            <span class="orbc-step-dot" />
            <span class="orbc-step-name">{{ step.name }}</span>
            <span class="orbc-step-summary">{{ step.error || step.output || step.status }}</span>
            <span class="orbc-step-duration">{{ duration(step) }}</span>
          </div>
          <template v-if="(currentRun.rollbackResults || []).length">
            <div class="orbc-rollback-title">回滚结果</div>
            <div v-for="step in currentRun.rollbackResults || []" :key="`r-${step.id}`" class="orbc-step" :class="step.status">
              <span class="orbc-step-dot" />
              <span class="orbc-step-name">{{ step.name }}</span>
              <span class="orbc-step-summary">{{ step.error || step.output || step.status }}</span>
              <span class="orbc-step-duration">{{ duration(step) }}</span>
            </div>
          </template>
        </div>

        <div class="orbc-versions">
          <div class="orbc-head">
            <span>版本历史</span>
            <el-button size="small" text @click="loadVersions">刷新</el-button>
          </div>
          <div v-if="!versions.length" class="orbc-empty">暂无版本记录</div>
          <div v-for="version in versions" :key="version.version" class="orbc-version-row">
            <button type="button" class="orbc-version-main" @click="openVersion(version)">
              <span>v{{ version.version }} · {{ version.name }}</span>
              <span>{{ formatTime(version.createdAt) }}</span>
              <span>{{ version.stepCount }} 步 · {{ version.parameterCount }} 个参数</span>
            </button>
            <span v-if="version.version === selected.version" class="orbc-version-current">当前</span>
            <el-button v-else size="small" text @click="restoreVersion(version)">恢复此版本</el-button>
          </div>
        </div>

        <div class="orbc-history">
          <div class="orbc-head"><span>运行历史</span><el-button size="small" text @click="loadRuns">刷新</el-button></div>
          <div v-if="!runs.length" class="orbc-empty">暂无运行记录</div>
          <button
            v-for="run in runs"
            :key="run.id"
            type="button"
            class="orbc-history-row"
            @click="currentRun = run"
          >
            <span class="orbc-run-status" :class="run.status">{{ runStatusLabel(run.status) }}</span>
            <span v-if="run.scheduledTaskId" class="orbc-run-source">定时</span>
            <span>v{{ run.runbookVersion }}</span>
            <span>{{ formatTime(run.startedAt) }}</span>
            <span>{{ run.stepResults.length }} 步</span>
          </button>
        </div>
      </template>
      <div v-else class="orbc-empty orbc-main-empty">请选择 Runbook</div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 Runbook' : '新建 Runbook'" width="720px" append-to-body>
      <div class="orbc-form">
        <label>
          <span>名称</span>
          <el-input v-model="form.name" size="small" maxlength="120" />
        </label>
        <label>
          <span>执行连接</span>
          <el-select v-model="form.connectionId" size="small">
            <el-option
              v-for="conn in monitorConnections"
              :key="conn.id"
              :value="conn.id"
              :label="`${conn.name}${conn.tag ? ` · ${conn.tag}` : ''}`"
            />
          </el-select>
        </label>
        <label class="orbc-wide">
          <span>描述</span>
          <el-input v-model="form.description" size="small" maxlength="500" />
        </label>
        <div class="orbc-switch">
          <span>启用</span>
          <el-switch v-model="form.enabled" size="small" />
        </div>
        <label class="orbc-wide">
          <span>参数 JSON</span>
          <el-input
            v-model="form.parametersText"
            type="textarea"
            :rows="4"
            size="small"
            spellcheck="false"
            placeholder='[{"key":"service","label":"服务名","required":true,"defaultValue":"api"}]'
          />
        </label>
        <label class="orbc-wide">
          <span>执行步骤 JSON</span>
          <el-input v-model="form.stepsText" type="textarea" :rows="8" size="small" spellcheck="false" />
        </label>
        <label class="orbc-wide">
          <span>失败回滚 JSON</span>
          <el-input v-model="form.rollbackText" type="textarea" :rows="5" size="small" spellcheck="false" />
        </label>
      </div>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="runDialogVisible" title="运行参数" width="460px" append-to-body>
      <div v-if="selected" class="orbc-run-form">
        <div class="orbc-run-form-head">{{ selected.name }} · {{ connectionName(selected.connectionId) }}</div>
        <label v-for="parameter in selected.parameters || []" :key="parameter.key">
          <span>
            {{ parameter.label || parameter.key }}
            <em v-if="parameter.required">必填</em>
          </span>
          <el-input
            v-model="runParams[parameter.key]"
            size="small"
            :placeholder="parameter.defaultValue || `请输入 ${parameter.key}`"
          />
        </label>
        <p v-if="!(selected.parameters || []).length" class="orbc-run-form-empty">该 Runbook 无需运行参数</p>
      </div>
      <template #footer>
        <el-button size="small" @click="runDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="confirmRunParams">继续运行</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="versionDialogVisible" title="版本详情" width="680px" append-to-body>
      <template v-if="previewVersion">
        <div class="orbc-version-detail-head">
          v{{ previewVersion.version }} · {{ previewVersion.snapshot.name }} ·
          {{ formatTime(previewVersion.createdAt) }}
        </div>
        <pre class="orbc-version-json">{{ JSON.stringify(previewVersion.snapshot, null, 2) }}</pre>
      </template>
      <template #footer>
        <el-button size="small" @click="versionDialogVisible = false">关闭</el-button>
        <el-button
          v-if="previewVersion && previewVersion.version !== selected?.version"
          size="small"
          type="primary"
          @click="restoreVersion(previewVersion)"
        >
          恢复此版本
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../../api/client';

interface MonitorConnection { id: string; name: string; type?: string; tag?: string }
type StepType = 'exec' | 'http' | 'wait';
interface RunbookParameter {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
}
interface RunbookStep {
  id: string;
  name: string;
  type: StepType;
  command?: string;
  url?: string;
  expectedStatus?: number;
  seconds?: number;
  continueOnError?: boolean;
}
interface Runbook {
  id: string;
  name: string;
  description?: string;
  connectionId: string;
  enabled: boolean;
  version: number;
  parameters: RunbookParameter[];
  steps: RunbookStep[];
  rollbackSteps: RunbookStep[];
  createdAt: number;
  updatedAt: number;
}
interface StepResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: number;
  finishedAt: number;
  output?: string;
  error?: string;
}
interface RunbookRun {
  id: string;
  runbookId: string;
  runbookName: string;
  runbookVersion: number;
  status: 'running' | 'success' | 'failed' | 'rolled_back' | 'cancelled';
  scheduledTaskId?: string;
  inputParams: Record<string, string>;
  stepResults: StepResult[];
  rollbackResults: StepResult[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
}
interface RunbookVersionSummary {
  runbookId: string;
  version: number;
  name: string;
  description?: string;
  connectionId: string;
  enabled: boolean;
  parameterCount: number;
  stepCount: number;
  rollbackStepCount: number;
  createdAt: number;
}
interface RunbookVersionDetail {
  runbookId: string;
  version: number;
  snapshot: Runbook;
  createdAt: number;
}

const props = defineProps<{
  connections: MonitorConnection[];
  activeConnectionId?: string;
}>();

const runbooks = ref<Runbook[]>([]);
const selected = ref<Runbook | null>(null);
const runs = ref<RunbookRun[]>([]);
const versions = ref<RunbookVersionSummary[]>([]);
const currentRun = ref<RunbookRun | null>(null);
const running = ref(false);
const cancelling = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const runDialogVisible = ref(false);
const versionDialogVisible = ref(false);
const editingId = ref('');
const runParams = ref<Record<string, string>>({});
const previewVersion = ref<RunbookVersionDetail | null>(null);
const pollingRunIds = new Set<string>();
const monitorConnections = computed(() => props.connections.filter((conn) => conn.type !== 'database'));
const form = ref({
  name: '', description: '', connectionId: '', enabled: true,
  parametersText: '[]',
  stepsText: '[\n  {\n    "type": "exec",\n    "name": "检查版本",\n    "command": "uptime"\n  }\n]',
  rollbackText: '[]',
});

function connectionName(id: string): string {
  return props.connections.find((conn) => conn.id === id)?.name || '连接已删除';
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function duration(step: StepResult): string {
  return `${Math.max(0, step.finishedAt - step.startedAt)}ms`;
}

function runStatusLabel(status: RunbookRun['status']): string {
  return {
    running: '运行中',
    success: '成功',
    failed: '失败',
    rolled_back: '已回滚',
    cancelled: '已取消',
  }[status];
}

async function load(): Promise<void> {
  const result = await api.get<Runbook[]>('/plugin/ops-shell/runbooks');
  if ('error' in result) return;
  runbooks.value = result.data;
  if (!selected.value || !result.data.some((item) => item.id === selected.value!.id)) {
    selected.value = result.data[0] || null;
  } else {
    selected.value = result.data.find((item) => item.id === selected.value!.id) || null;
  }
  await Promise.all([loadRuns(), loadVersions()]);
}

async function loadRuns(): Promise<void> {
  if (!selected.value) {
    runs.value = [];
    return;
  }
  const result = await api.get<RunbookRun[]>(`/plugin/ops-shell/runbooks/runs?runbookId=${encodeURIComponent(selected.value.id)}&limit=20`);
  if ('data' in result) runs.value = result.data;
}

async function loadVersions(): Promise<void> {
  if (!selected.value) {
    versions.value = [];
    return;
  }
  const result = await api.get<RunbookVersionSummary[]>(
    `/plugin/ops-shell/runbooks/${selected.value.id}/versions`,
  );
  versions.value = 'data' in result ? result.data : [];
}

function selectRunbook(item: Runbook): void {
  selected.value = item;
  currentRun.value = null;
  previewVersion.value = null;
  runDialogVisible.value = false;
  versionDialogVisible.value = false;
  void Promise.all([loadRuns(), loadVersions()]);
}

function resetForm(): void {
  form.value = {
    name: '',
    description: '',
    connectionId: props.activeConnectionId || monitorConnections.value[0]?.id || '',
    enabled: true,
    parametersText: '[]',
    stepsText: '[\n  {\n    "type": "exec",\n    "name": "检查版本",\n    "command": "uptime"\n  }\n]',
    rollbackText: '[]',
  };
}

function openCreate(): void {
  editingId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(item: Runbook): void {
  editingId.value = item.id;
  form.value = {
    name: item.name,
    description: item.description || '',
    connectionId: item.connectionId,
    enabled: item.enabled,
    parametersText: JSON.stringify(item.parameters || [], null, 2),
    stepsText: JSON.stringify(item.steps, null, 2),
    rollbackText: JSON.stringify(item.rollbackSteps, null, 2),
  };
  dialogVisible.value = true;
}

function parseArray<T>(text: string, label: string): T[] | null {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) {
      ElMessage.error(`${label}必须是 JSON 数组`);
      return null;
    }
    return value;
  } catch (e) {
    ElMessage.error(`${label} JSON 非法：${(e as Error).message}`);
    return null;
  }
}

async function save(): Promise<void> {
  const parameters = parseArray<RunbookParameter>(form.value.parametersText, '参数');
  if (!parameters) return;
  const steps = parseArray<RunbookStep>(form.value.stepsText, '执行步骤');
  if (!steps) return;
  const rollbackSteps = parseArray<RunbookStep>(form.value.rollbackText, '回滚步骤');
  if (!rollbackSteps) return;
  saving.value = true;
  try {
    const body = {
      name: form.value.name,
      description: form.value.description,
      connectionId: form.value.connectionId,
      enabled: form.value.enabled,
      parameters,
      steps,
      rollbackSteps,
    };
    const result = editingId.value
      ? await api.put<Runbook>(`/plugin/ops-shell/runbooks/${editingId.value}`, body)
      : await api.post<Runbook>('/plugin/ops-shell/runbooks', body);
    if ('error' in result) {
      ElMessage.error(result.error);
      return;
    }
    dialogVisible.value = false;
    await load();
    selected.value = runbooks.value.find((item) => item.id === result.data.id) || result.data;
    await Promise.all([loadRuns(), loadVersions()]);
  } finally {
    saving.value = false;
  }
}

async function remove(item: Runbook): Promise<void> {
  const ok = await ElMessageBox.confirm(`删除 Runbook「${item.name}」？运行历史会保留。`, '删除 Runbook', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  }).then(() => true).catch(() => false);
  if (!ok) return;
  const result = await api.delete(`/plugin/ops-shell/runbooks/${item.id}`);
  if ('error' in result) {
    ElMessage.error(result.error);
    return;
  }
  selected.value = null;
  versions.value = [];
  await load();
}

async function openVersion(item: RunbookVersionSummary): Promise<void> {
  const result = await api.get<RunbookVersionDetail>(
    `/plugin/ops-shell/runbooks/${item.runbookId}/versions/${item.version}`,
  );
  if ('error' in result) {
    ElMessage.error(result.error);
    return;
  }
  previewVersion.value = result.data;
  versionDialogVisible.value = true;
}

async function restoreVersion(item: Pick<RunbookVersionSummary, 'runbookId' | 'version'>): Promise<void> {
  const ok = await ElMessageBox.confirm(
    `把 v${item.version} 恢复为新的当前版本？现有版本和运行历史都会保留。`,
    '恢复 Runbook 版本',
    { type: 'warning', confirmButtonText: '恢复此版本', cancelButtonText: '取消' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  const result = await api.post<Runbook>(
    `/plugin/ops-shell/runbooks/${item.runbookId}/versions/${item.version}/restore`,
  );
  if ('error' in result) {
    ElMessage.error(result.error);
    return;
  }
  versionDialogVisible.value = false;
  previewVersion.value = null;
  await load();
  selected.value = runbooks.value.find((runbook) => runbook.id === result.data.id) || result.data;
  await Promise.all([loadRuns(), loadVersions()]);
  ElMessage.success(`已恢复 v${item.version}，生成 v${result.data.version}`);
}

function planText(item: Runbook, params: Record<string, string> = {}): string {
  const parameterLines = Object.entries(params).map(([key, value]) => `- ${key}=${value}`);
  return [
    `Runbook：${item.name} v${item.version}`,
    `连接：${connectionName(item.connectionId)}`,
    '运行参数：',
    ...(parameterLines.length ? parameterLines : ['- 无']),
    '执行步骤：',
    ...item.steps.map((step) => `- ${step.name} [${step.type}]`),
    '失败回滚：',
    ...(item.rollbackSteps.length ? item.rollbackSteps.map((step) => `- ${step.name} [${step.type}]`) : ['- 未配置']),
  ].join('\n');
}

function textBlock(text: string) {
  return h('pre', {
    style: {
      margin: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit',
      lineHeight: '1.55', textAlign: 'left', maxHeight: '420px', overflow: 'auto',
    },
  }, text);
}

function openRun(): void {
  if (!selected.value) return;
  runParams.value = Object.fromEntries(
    (selected.value.parameters || []).map((parameter) => [parameter.key, parameter.defaultValue || '']),
  );
  if (!(selected.value.parameters || []).length) {
    void runNow();
    return;
  }
  runDialogVisible.value = true;
}

async function confirmRunParams(): Promise<void> {
  if (!selected.value) return;
  const missing = (selected.value.parameters || []).find(
    (parameter) => parameter.required && !String(runParams.value[parameter.key] || '').trim(),
  );
  if (missing) {
    ElMessage.warning(`请填写${missing.label || missing.key}`);
    return;
  }
  runDialogVisible.value = false;
  await runNow();
}

async function runNow(): Promise<void> {
  const runbook = selected.value;
  if (!runbook) return;
  const params = { ...runParams.value };
  running.value = true;
  try {
    const prep = await api.post<{
      required: boolean;
      plan?: string;
      approval?: { id: string; command: string; status: 'pending' | 'approved' | 'rejected' };
    }>(`/plugin/ops-shell/runbooks/${runbook.id}/approval`, { params });
    if ('error' in prep) {
      ElMessage.error(prep.error);
      return;
    }
    if (prep.data.required && prep.data.approval) {
      const approval = prep.data.approval;
      if (approval.status === 'rejected') {
        ElMessage.error('该 Runbook 已被拒绝，请调整版本后再运行');
        return;
      }
      if (approval.status === 'pending') {
        const ok = await ElMessageBox.confirm(textBlock(approval.command), 'Runbook 审批', {
          type: 'warning', confirmButtonText: '批准并运行', cancelButtonText: '取消',
        }).then(() => true).catch(() => false);
        const decided = ok
          ? await api.post(`/plugin/ops-shell/approvals/${approval.id}`, { approve: true })
          : await api.delete(`/plugin/ops-shell/approvals/${approval.id}`);
        if ('error' in decided) {
          ElMessage.error(decided.error);
          return;
        }
        if (!ok) return;
      }
    } else {
      const ok = await ElMessageBox.confirm(textBlock(prep.data.plan || planText(runbook, params)), '运行 Runbook', {
        type: 'warning', confirmButtonText: '开始运行', cancelButtonText: '取消',
      }).then(() => true).catch(() => false);
      if (!ok) return;
    }

    const started = await api.post<RunbookRun>(`/plugin/ops-shell/runbooks/${runbook.id}/run`, { params });
    if ('error' in started) {
      ElMessage.error(started.error);
      return;
    }
    currentRun.value = started.data;
    await pollRun(started.data.id);
  } finally {
    running.value = false;
  }
}

async function cancelCurrentRun(): Promise<void> {
  if (!currentRun.value || currentRun.value.status !== 'running') return;
  const runId = currentRun.value.id;
  const ok = await ElMessageBox.confirm(
    '取消只会在当前步骤结束后生效，不会强制中断正在执行的远程命令。确认请求取消？',
    '取消 Runbook',
    { type: 'warning', confirmButtonText: '请求取消', cancelButtonText: '继续等待' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  cancelling.value = true;
  try {
    const result = await api.post(`/plugin/ops-shell/runbooks/runs/${runId}/cancel`);
    if ('error' in result) {
      ElMessage.error(result.error);
      return;
    }
    ElMessage.success('已请求取消，将在当前步骤结束后停止');
    void pollRun(runId);
  } finally {
    cancelling.value = false;
  }
}

async function pollRun(runId: string): Promise<void> {
  if (pollingRunIds.has(runId)) return;
  pollingRunIds.add(runId);
  try {
    for (let i = 0; i < 120; i++) {
      const result = await api.get<RunbookRun>(`/plugin/ops-shell/runbooks/runs/${runId}`);
      if ('error' in result) return;
      currentRun.value = result.data;
      if (result.data.status !== 'running') {
        await loadRuns();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    pollingRunIds.delete(runId);
  }
}

watch(() => props.activeConnectionId, (id) => {
  if (!selected.value && id) {
    const item = runbooks.value.find((runbook) => runbook.connectionId === id);
    if (item) selectRunbook(item);
  }
});

onMounted(() => { void load(); });
</script>

<style scoped>
.orbc { height: 100%; min-height: 0; display: grid; grid-template-columns: minmax(210px, .7fr) minmax(0, 1.6fr); gap: 10px; overflow: hidden; }
.orbc-list, .orbc-main { min-height: 0; overflow: auto; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); background: var(--glass-bg); padding: 10px; }
.orbc-list { display: flex; flex-direction: column; gap: 5px; }
.orbc-main { display: flex; flex-direction: column; gap: 10px; }
.orbc-head, .orbc-titlebar, .orbc-run-head, .orbc-meta, .orbc-history-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.orbc-head { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.orbc-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 6px; padding: 7px 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; color: var(--color-text-primary); cursor: pointer; }
.orbc-item:hover { background: var(--color-surface-hover); }
.orbc-item.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.orbc-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
.orbc-item-meta { grid-column: 1 / 2; font-size: 10px; color: var(--color-text-tertiary); }
.orbc-item-state { grid-row: 1 / 3; grid-column: 2; align-self: center; font-size: 10px; color: var(--color-success); }
.orbc-item-state.off { color: var(--color-text-tertiary); }
.orbc-empty { padding: 28px 0; text-align: center; font-size: 12px; color: var(--color-text-tertiary); }
.orbc-main-empty { margin: auto; }
.orbc-title strong { display: block; font-size: 15px; }
.orbc-title span, .orbc-desc { font-size: 11px; color: var(--color-text-secondary); }
.orbc-desc { margin: 0; }
.orbc-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.orbc-meta { justify-content: flex-start; font-size: 11px; color: var(--color-text-tertiary); }
.orbc-meta b { color: var(--color-text-primary); }
.orbc-run, .orbc-versions, .orbc-history { border-top: 1px solid var(--color-border); padding-top: 9px; }
.orbc-run-head { font-size: 12px; font-weight: 600; }
.orbc-run-head-actions { display: inline-flex; align-items: center; gap: 4px; }
.orbc-run-source { font-size: 10px; color: var(--color-primary); }
.orbc-run-params { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; font-size: 10.5px; color: var(--color-text-secondary); }
.orbc-run-params span { overflow-wrap: anywhere; }
.orbc-run-error { margin-top: 5px; font-size: 11px; color: var(--color-danger); overflow-wrap: anywhere; }
.orbc-run-status { font-size: 11px; color: var(--color-primary); }
.orbc-run-status.success { color: var(--color-success); }
.orbc-run-status.failed { color: var(--color-danger); }
.orbc-run-status.rolled_back { color: var(--color-warning); }
.orbc-run-status.cancelled { color: var(--color-text-tertiary); }
.orbc-step { display: grid; grid-template-columns: 8px minmax(90px, .7fr) minmax(0, 1.6fr) auto; align-items: start; gap: 7px; padding: 6px 0; border-bottom: 1px dashed var(--color-border); font-size: 11px; }
.orbc-step-dot { width: 6px; height: 6px; margin-top: 4px; border-radius: 50%; background: var(--color-success); }
.orbc-step.failed .orbc-step-dot { background: var(--color-danger); }
.orbc-step-name { font-weight: 600; }
.orbc-step-summary { min-width: 0; overflow-wrap: anywhere; color: var(--color-text-secondary); white-space: pre-wrap; }
.orbc-step-duration { color: var(--color-text-tertiary); }
.orbc-rollback-title { margin: 8px 0 2px; font-size: 11px; color: var(--color-warning); }
.orbc-versions { display: flex; flex-direction: column; gap: 4px; }
.orbc-version-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.orbc-version-main { flex: 1; min-width: 0; display: grid; grid-template-columns: auto minmax(120px, 1fr) auto; gap: 8px; align-items: center; border: 0; border-radius: 4px; padding: 5px 6px; background: transparent; color: var(--color-text-secondary); text-align: left; font-size: 11px; cursor: pointer; }
.orbc-version-main:hover { background: var(--color-surface-hover); }
.orbc-version-main span:first-child { color: var(--color-text-primary); font-weight: 600; }
.orbc-version-current { flex: none; font-size: 10px; color: var(--color-success); }
.orbc-history { display: flex; flex-direction: column; gap: 4px; }
.orbc-history-row { width: 100%; border: 0; border-radius: 4px; padding: 5px 6px; background: transparent; color: var(--color-text-secondary); text-align: left; font-size: 11px; cursor: pointer; }
.orbc-history-row:hover { background: var(--color-surface-hover); }
.orbc-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.orbc-form label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-text-secondary); }
.orbc-wide { grid-column: 1 / -1; }
.orbc-switch { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.orbc-run-form { display: flex; flex-direction: column; gap: 10px; }
.orbc-run-form-head { color: var(--color-text-secondary); font-size: 12px; }
.orbc-run-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--color-text-secondary); }
.orbc-run-form label span { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.orbc-run-form em { font-style: normal; font-size: 10px; color: var(--color-warning); }
.orbc-run-form-empty { margin: 0; font-size: 12px; color: var(--color-text-tertiary); }
.orbc-version-detail-head { margin-bottom: 8px; font-size: 12px; color: var(--color-text-secondary); }
.orbc-version-json { margin: 0; max-height: 58vh; overflow: auto; padding: 10px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg-secondary); color: var(--color-text-primary); font-size: 11px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .orbc { grid-template-columns: 1fr; overflow: auto; }
  .orbc-list, .orbc-main { overflow: visible; }
  .orbc-form { grid-template-columns: 1fr; }
  .orbc-wide { grid-column: auto; }
}
</style>
