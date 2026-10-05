<template>
  <div class="user-hooks-panel">
    <p class="hooks-tip">
      工具调用前置规则（对智能体的每次工具调用生效）：<b>弹窗确认</b> = 每次调用先弹窗请你点头，授权不记忆；
      <b>直接拒绝</b> = 无弹窗直接拒绝并把原因告诉智能体。与内置危险命令护栏相互独立、同时生效。
    </p>
    <div class="hooks-toolbar">
      <el-button type="primary" size="small" @click="openCreate">新增规则</el-button>
      <el-button size="small" @click="fillPreset">填入示例：git push 前确认</el-button>
    </div>
    <el-table v-loading="loading" :data="hooks" size="small" empty-text="还没有规则 —— 上面的示例按钮可快速体验">
      <el-table-column prop="name" label="名称" min-width="130" show-overflow-tooltip />
      <el-table-column label="工具" min-width="130">
        <template #default="{ row }"><code class="hook-code">{{ row.tool }}</code></template>
      </el-table-column>
      <el-table-column label="匹配内容" min-width="140" show-overflow-tooltip>
        <template #default="{ row }"><code class="hook-code">{{ row.pattern || '（全部调用）' }}</code></template>
      </el-table-column>
      <el-table-column label="动作" width="100">
        <template #default="{ row }">
          <el-tag :type="row.action === 'deny' ? 'danger' : 'warning'" size="small">
            {{ row.action === 'deny' ? '直接拒绝' : '弹窗确认' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="(v: any) => toggleEnabled(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" text @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FormDialog
      v-model="dialogVisible"
      :title="editingId ? '编辑规则' : '新增规则'"
      width="500px"
      append-to-body
      :loading="saving"
      @submit="save"
    >
      <el-form label-width="100px">
        <el-form-item label="规则名称">
          <el-input v-model="form.name" placeholder="如：git push 需确认" maxlength="50" />
        </el-form-item>
        <el-form-item label="工具">
          <el-select v-model="form.tool" filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="t in toolOptions" :key="t" :label="t === '*' ? '*（所有工具）' : t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="匹配内容">
          <el-input v-model="form.pattern" placeholder="如：npm publish（留空 = 该工具的每次调用）" />
          <span class="form-tip">大小写不敏感的子串匹配：命令类工具匹配命令行文本，其他工具匹配参数内容</span>
        </el-form-item>
        <el-form-item label="动作">
          <el-radio-group v-model="form.action">
            <el-radio value="confirm">每次弹窗确认</el-radio>
            <el-radio value="deny">直接拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';
import FormDialog from '../FormDialog.vue';

interface UserHook {
  id: string;
  name: string;
  tool: string;
  pattern: string | null;
  action: 'deny' | 'confirm';
  enabled: boolean;
}

const hooks = ref<UserHook[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ name: '', tool: '*', pattern: '', action: 'confirm' as 'deny' | 'confirm' });

// 常用候选（可自由输入任意工具名；* = 所有工具）
const toolOptions = [
  '*', 'cmd_exec', 'python_exec', 'file_write', 'file_edit',
  'api_git_push', 'api_message_send', 'api_custom_tool_execute',
];

async function load() {
  loading.value = true;
  try {
    const r = await api.get<UserHook[]>('/user-hooks');
    if ('error' in r) {
      ElMessage.error(r.error);
      return;
    }
    hooks.value = r.data || [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.tool = '*';
  form.pattern = '';
  form.action = 'confirm';
  dialogVisible.value = true;
}

function fillPreset() {
  editingId.value = null;
  form.name = 'git push 前确认';
  form.tool = 'api_git_push';
  form.pattern = '';
  form.action = 'confirm';
  dialogVisible.value = true;
}

function openEdit(row: UserHook) {
  editingId.value = row.id;
  form.name = row.name;
  form.tool = row.tool;
  form.pattern = row.pattern || '';
  form.action = row.action;
  dialogVisible.value = true;
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写规则名称');
    return;
  }
  saving.value = true;
  try {
    const payload = { name: form.name.trim(), tool: form.tool.trim() || '*', pattern: form.pattern.trim() || null, action: form.action };
    const r = editingId.value
      ? await api.put<UserHook>(`/user-hooks/${editingId.value}`, payload)
      : await api.post<UserHook>('/user-hooks', payload);
    if ('error' in r) {
      ElMessage.error(r.error);
      return;
    }
    ElMessage.success(editingId.value ? '已更新' : '已创建');
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(row: UserHook, enabled: boolean) {
  const r = await api.put<{ data: UserHook }>(`/user-hooks/${row.id}`, { enabled });
  if ('error' in r) {
    ElMessage.error(r.error);
    return;
  }
  row.enabled = enabled;
}

async function remove(row: UserHook) {
  try {
    await ElMessageBox.confirm(`删除规则「${row.name}」？`, '删除规则', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
  } catch {
    return;
  }
  const r = await api.delete(`/user-hooks/${row.id}`);
  if ('error' in r) {
    ElMessage.error(r.error);
    return;
  }
  await load();
}

onMounted(load);
</script>

<style scoped>
.user-hooks-panel { display: flex; flex-direction: column; gap: 12px; max-width: 900px; }
.hooks-tip { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.hooks-toolbar { display: flex; gap: 8px; }
.hook-code { font-size: 12px; }
.form-tip { display: block; margin-top: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
