<template>
  <div class="admin-page">
    <div class="admin-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </div>

    <el-table :data="users" v-loading="loading" border stripe>
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column prop="email" label="邮箱" min-width="160" />
      <el-table-column label="所属组织" min-width="180">
        <template #default="{ row }">
          <el-tag v-for="o in row.orgs" :key="o.id" size="small" class="tag">{{ o.name }}</el-tag>
          <span v-if="!row.orgs?.length" class="dim">未分配</span>
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="160">
        <template #default="{ row }">
          <el-tag v-for="r in row.roles" :key="r.id" size="small" type="warning" class="tag">{{ r.name }}</el-tag>
          <span v-if="!row.roles?.length" class="dim">无角色</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <!-- 管理员视角切换（2026-11-01）：切到该用户视角查看其全部数据，顶栏可退出 -->
          <el-button v-if="row.username !== 'guest' && row.id !== authStore.user?.id" link type="success" @click="viewAs(row)">查看数据</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing ? '编辑用户' : '新建用户'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="!!editing" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="选填" />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码' : '密码'">
          <el-input v-model="form.password" type="password" show-password :placeholder="editing ? '留空则不修改' : '至少 6 位'" />
        </el-form-item>
        <el-form-item label="组织">
          <el-select v-model="form.orgIds" multiple placeholder="选择组织" style="width: 100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple placeholder="选择角色" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi, type AdminUser, type AdminOrg, type AdminRole } from '../../api/admin';
import { useAuthStore } from '../../stores/auth';
import { setViewAs } from '../../api/client';

const authStore = useAuthStore();
/** 以该用户视角查看数据（2026-11-01）：所有请求带 X-YZ-View-As，顶栏出现"退出查看"横幅 */
function viewAs(u: AdminUser) {
  setViewAs({ id: u.id, username: u.username });
  ElMessage.success(`正在查看 ${u.username} 的数据，点击顶栏提示可退出`);
  setTimeout(() => window.location.href = '/#/chat', 500);
}

const users = ref<AdminUser[]>([]);
const orgs = ref<AdminOrg[]>([]);
const roles = ref<AdminRole[]>([]);
const loading = ref(false);
const dialog = ref(false);
const saving = ref(false);
const editing = ref<AdminUser | null>(null);
const form = ref({ username: '', email: '', password: '', orgIds: [] as string[], roleIds: [] as string[], quotaCostCny: null as number | null, usedCost: 0 });

async function reload() {
  loading.value = true;
  try {
    users.value = (await adminApi.users()) || [];
    orgs.value = (await adminApi.orgs()) || [];
    roles.value = (await adminApi.roles())?.roles || [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { username: '', email: '', password: '', orgIds: [], roleIds: [] };
  dialog.value = true;
}

function openEdit(u: AdminUser) {
  editing.value = u;
  form.value = {
    username: u.username,
    email: u.email || '',
    password: '',
    orgIds: u.orgs?.map((o) => o.id) || [],
    roleIds: u.roles?.map((r) => r.id) || [],
  };
  dialog.value = true;
}

async function save() {
  saving.value = true;
  try {
    const body: any = { email: form.value.email || undefined, orgIds: form.value.orgIds, roleIds: form.value.roleIds, quotaCostCny: form.value.quotaCostCny };
    let res;
    if (editing.value) {
      if (form.value.password) body.password = form.value.password;
      res = await adminApi.updateUser(editing.value.id, body);
    } else {
      body.username = form.value.username;
      body.password = form.value.password;
      res = await adminApi.createUser(body);
    }
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已保存');
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function remove(u: AdminUser) {
  const confirmed = await ElMessageBox.confirm(`确定删除用户「${u.username}」？其登录账号与个人数据（会话、任务等）将被一并删除。`, '删除用户', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const res = await adminApi.deleteUser(u.id);
  if ('error' in res) { ElMessage.error(res.error); return; }
  ElMessage.success('已删除');
  await reload();
}

onMounted(reload);
</script>

<style scoped>
.admin-page { padding: 20px 24px; height: 100%; overflow: auto; }
.admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.admin-header h2 { margin: 0; font-size: 18px; }
.tag { margin-right: 4px; }
.dim { color: var(--color-text-secondary); font-size: 12px; }
.quota-hint { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }
.quota-over { color: var(--el-color-danger); font-weight: 600; }
.dim { color: var(--color-text-secondary); }
</style>
