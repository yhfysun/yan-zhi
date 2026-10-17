<!--
  发布项目面板（four-mode-workspace 7b.6）
  挂在运维左栏：列出发布项目（本地目录 + 技术栈 + 部署目标），支持新建/编辑/删除与绑定当前任务。
  ★ 只负责「项目资产」本身；绑定后的对话上下文注入与工具挂载由 OpsConsole 完成。
-->
<template>
  <div class="relp">
    <div class="relp-head">
      <span class="relp-title">发布项目</span>
      <button class="relp-new" type="button" title="新建发布项目" @click="openCreate">
        <el-icon :size="12"><Plus /></el-icon>
      </button>
    </div>

    <div class="relp-list">
      <div
        v-for="p in projects"
        :key="p.id"
        class="relp-item"
        :class="{ active: p.id === activeProjectId }"
        :title="`${p.name}\n${p.localDir}`"
      >
        <span class="relp-dot" />
        <span class="relp-name">{{ p.name }}</span>
        <span class="relp-stack">{{ p.techStack?.buildType || '未识别' }}</span>
        <span class="relp-actions" @click.stop>
          <span class="relp-act" :class="{ on: p.id === activeProjectId }" @click="toggleBind(p)">
            {{ p.id === activeProjectId ? '已绑定' : '绑定' }}
          </span>
          <span class="relp-act" title="编辑" @click="openEdit(p)"><el-icon :size="12"><EditPen /></el-icon></span>
          <span class="relp-act" title="删除" @click="remove(p)"><el-icon :size="12"><Close /></el-icon></span>
        </span>
      </div>
      <div v-if="!projects.length" class="relp-empty">暂无发布项目，点右上角 + 新建</div>
    </div>

    <div v-if="activeProjectId" class="relp-bound">
      <span class="relp-act" @click="emit('open-release')">打开发布</span>
      <span class="relp-act" @click="emit('unbind')">解绑当前任务</span>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑发布项目' : '新建发布项目'" width="580px" append-to-body>
      <div class="relp-form">
        <label class="relp-field">名称
          <el-input v-model="form.name" size="small" placeholder="如 订单服务" />
        </label>

        <template v-if="!editingId">
          <label class="relp-field">创建方式
            <el-select v-model="form.mode" size="small">
              <el-option value="existing" label="选取已有目录" />
              <el-option value="empty" label="新建空目录" />
              <el-option value="scaffold" label="脚手架初始化（需确认）" />
            </el-select>
          </label>
          <label v-if="form.mode !== 'existing'" class="relp-field">父目录
            <div class="relp-row">
              <el-input v-model="form.parentDir" size="small" placeholder="D:/work（绝对路径）" />
              <el-button size="small" @click="pickDir('parentDir')">选择</el-button>
            </div>
          </label>
          <label v-if="form.mode === 'scaffold'" class="relp-field">骨架
            <el-select v-model="form.scaffold" size="small">
              <el-option value="empty" label="空目录 + README" />
              <el-option value="node" label="Node（package.json）" />
              <el-option value="maven" label="Maven（pom.xml）" />
              <el-option value="docker" label="Docker（Dockerfile）" />
            </el-select>
          </label>
        </template>

        <label v-if="editingId || form.mode === 'existing'" class="relp-field">本地目录
          <div class="relp-row">
            <el-input v-model="form.localDir" size="small" placeholder="D:/work/app（绝对路径）" />
            <el-button size="small" @click="pickDir('localDir')">选择</el-button>
          </div>
        </label>

        <label class="relp-field">描述
          <el-input v-model="form.description" size="small" placeholder="可选" />
        </label>
        <div class="relp-row">
          <label class="relp-field relp-half">构建命令
            <el-input v-model="form.buildCommand" size="small" placeholder="如 mvn -DskipTests package" />
          </label>
          <label class="relp-field relp-half">产物路径
            <el-input v-model="form.artifact" size="small" placeholder="如 target/app.jar" />
          </label>
        </div>

        <div class="relp-targets-head">
          <span>部署目标</span>
          <el-button link size="small" @click="addTarget">+ 添加</el-button>
        </div>
        <div v-for="(t, i) in form.targets" :key="i" class="relp-target">
          <el-select v-model="t.connectionId" size="small" placeholder="选择连接" class="relp-target-conn">
            <el-option
              v-for="c in connections"
              :key="c.id"
              :value="c.id"
              :label="`${c.name}（${c.username}@${c.host}）${c.tag ? ' · ' + c.tag : ''}`"
            />
          </el-select>
          <el-input v-model="t.remotePath" size="small" placeholder="发布目录 /app" />
          <el-input v-model="t.restartScript" size="small" placeholder="重启脚本 sh restart.sh" />
          <el-button link size="small" title="移除" @click="form.targets.splice(i, 1)">
            <el-icon :size="12"><Close /></el-icon>
          </el-button>
        </div>
        <div v-if="!form.targets.length" class="relp-empty">未配置部署目标（可稍后补）</div>

        <div v-if="editingId" class="relp-field">
          <div class="relp-targets-head">
            <span>关联流水线</span>
            <el-button link size="small" @click="loadPipelines">刷新</el-button>
          </div>
          <el-select v-model="form.pipelineIds" multiple size="small" placeholder="选择已有流水线（可稍后关联）">
            <el-option v-for="p in pipelines" :key="p.id" :value="p.id" :label="p.name" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, EditPen, Close } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { ReleaseProject } from '@yan-zhi/shared';

const props = defineProps<{ activeProjectId?: string }>();
const emit = defineEmits<{
  (e: 'bind', project: ReleaseProject): void;
  (e: 'unbind'): void;
  (e: 'open-release'): void;
}>();

interface ConnRow { id: string; name: string; host: string; username: string; tag?: string }
interface PipelineRow { id: string; name: string }
interface TargetForm { connectionId: string; remotePath: string; restartScript: string }

const electron = (window as any).electronAPI;
const projects = ref<ReleaseProject[]>([]);
const connections = ref<ConnRow[]>([]);
const pipelines = ref<PipelineRow[]>([]);
const dialogVisible = ref(false);
const editingId = ref('');
const saving = ref(false);

const form = ref({
  name: '',
  description: '',
  mode: 'existing' as 'existing' | 'empty' | 'scaffold',
  localDir: '',
  parentDir: '',
  scaffold: 'empty' as 'empty' | 'node' | 'maven' | 'docker',
  buildCommand: '',
  artifact: '',
  targets: [] as TargetForm[],
  pipelineIds: [] as string[],
});

async function load(): Promise<void> {
  const r = await api.get<ReleaseProject[]>('/plugin/ops-shell/release-projects');
  if ('data' in r && Array.isArray(r.data)) projects.value = r.data;
}
async function loadConnections(): Promise<void> {
  const r = await api.get<ConnRow[]>('/plugin/ops-shell/connections');
  if ('data' in r && Array.isArray(r.data)) connections.value = r.data;
}
async function loadPipelines(): Promise<void> {
  const r = await api.get<PipelineRow[]>('/plugin/cicd-pipeline/pipelines');
  if ('data' in r && Array.isArray(r.data)) pipelines.value = r.data;
}

onMounted(() => {
  void load();
  void loadConnections();
  void loadPipelines();
});

function resetForm(): void {
  form.value = {
    name: '', description: '', mode: 'existing', localDir: '', parentDir: '',
    scaffold: 'empty', buildCommand: '', artifact: '', targets: [], pipelineIds: [],
  };
}

function openCreate(): void {
  editingId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(p: ReleaseProject): void {
  editingId.value = p.id;
  form.value = {
    name: p.name,
    description: p.description || '',
    mode: 'existing',
    localDir: p.localDir,
    parentDir: '',
    scaffold: 'empty',
    buildCommand: p.buildHint?.command || '',
    artifact: p.buildHint?.artifact || '',
    targets: p.targets.map((t) => ({ connectionId: t.connectionId, remotePath: t.remotePath, restartScript: t.restartScript })),
    pipelineIds: [...(p.pipelineIds || [])],
  };
  dialogVisible.value = true;
  void loadPipelines();
}

function addTarget(): void {
  form.value.targets.push({ connectionId: connections.value[0]?.id || '', remotePath: '', restartScript: '' });
}

async function pickDir(field: 'localDir' | 'parentDir'): Promise<void> {
  try {
    const dir = await electron?.dialog?.showOpenDir?.({ title: '选择目录' });
    if (typeof dir === 'string' && dir) form.value[field] = dir.replace(/\\/g, '/');
  } catch (e) {
    ElMessage.warning('打开目录选择器失败：' + (e as Error).message);
  }
}

function connName(id: string): string {
  return connections.value.find((c) => c.id === id)?.name || '部署目标';
}

async function save(): Promise<void> {
  const name = form.value.name.trim();
  if (!name) { ElMessage.warning('项目名称必填'); return; }
  if (!editingId.value && form.value.mode === 'scaffold') {
    const ok = await ElMessageBox.confirm(
      `将在「${form.value.parentDir.replace(/\/+$/, '')}/${name}」写入最小骨架文件，确认？`,
      '脚手架初始化', { type: 'warning', confirmButtonText: '创建', cancelButtonText: '取消' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
  }
  const body: Record<string, unknown> = {
    name,
    description: form.value.description.trim() || undefined,
    buildHint: {
      command: form.value.buildCommand.trim() || undefined,
      artifact: form.value.artifact.trim() || undefined,
    },
    targets: form.value.targets.map((t) => ({
      connectionId: t.connectionId,
      name: connName(t.connectionId),
      remotePath: t.remotePath.trim(),
      restartScript: t.restartScript.trim(),
    })),
    pipelineIds: form.value.pipelineIds,
  };
  if (!editingId.value) {
    body.mode = form.value.mode;
    if (form.value.mode === 'existing') body.localDir = form.value.localDir.trim();
    else body.parentDir = form.value.parentDir.trim();
    if (form.value.mode === 'scaffold') { body.scaffold = form.value.scaffold; body.confirmed = true; }
  }
  saving.value = true;
  try {
    const r = editingId.value
      ? await api.put<ReleaseProject>(`/plugin/ops-shell/release-projects/${editingId.value}`, body)
      : await api.post<ReleaseProject>('/plugin/ops-shell/release-projects', body);
    if ('error' in r) { ElMessage.error(r.error); return; }
    dialogVisible.value = false;
    await load();
    ElMessage.success(editingId.value ? '发布项目已更新' : '发布项目已创建');
  } finally {
    saving.value = false;
  }
}

async function remove(p: ReleaseProject): Promise<void> {
  const ok = await ElMessageBox.confirm(
    `删除发布项目「${p.name}」？项目文件不会被删除，但会话绑定会一并清掉。`,
    '删除发布项目', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).then(() => true).catch(() => false);
  if (!ok) return;
  const r = await api.delete(`/plugin/ops-shell/release-projects/${p.id}`);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await load();
  ElMessage.success('已删除');
}

function toggleBind(p: ReleaseProject): void {
  if (p.id === props.activeProjectId) emit('unbind');
  else emit('bind', p);
}
</script>

<style scoped>
.relp { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px 4px; border-top: 1px solid var(--glass-border); }
.relp-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; }
.relp-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.relp-new {
  width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--glass-border);
  background: transparent; color: var(--color-text-secondary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.relp-new:hover { color: var(--color-primary); border-color: var(--color-primary); }
.relp-list { display: flex; flex-direction: column; gap: 3px; max-height: 180px; overflow: auto; }
.relp-item {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 6px;
  font-size: 12px; cursor: default;
}
.relp-item:hover { background: var(--glass-bg-hover); }
.relp-item.active { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.relp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary); flex: none; }
.relp-item.active .relp-dot { background: var(--color-primary); }
.relp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relp-stack { flex: none; font-size: 10.5px; color: var(--color-text-tertiary); }
.relp-actions { flex: none; display: inline-flex; align-items: center; gap: 6px; opacity: 0; }
.relp-item:hover .relp-actions { opacity: 1; }
.relp-item.active .relp-actions { opacity: 1; }
.relp-act { cursor: pointer; font-size: 11px; color: var(--color-text-secondary); }
.relp-act:hover { color: var(--color-primary); }
.relp-act.on { color: var(--color-primary); }
.relp-bound {
  display: flex; gap: 10px; padding: 4px 6px; font-size: 11px;
  border-top: 1px dashed var(--glass-border);
}
.relp-empty { padding: 4px 6px; font-size: 11px; color: var(--color-text-tertiary); }
.relp-form { display: flex; flex-direction: column; gap: 10px; }
.relp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--color-text-secondary); }
.relp-row { display: flex; gap: 6px; align-items: center; }
.relp-half { flex: 1; min-width: 0; }
.relp-targets-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-text-secondary); }
.relp-target { display: grid; grid-template-columns: 1.1fr 1fr 1fr auto; gap: 6px; align-items: center; }
.relp-target-conn { min-width: 0; }
</style>
