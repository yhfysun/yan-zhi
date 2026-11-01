<template>
  <div class="admin-page">
    <div class="admin-header">
      <h2>组织管理</h2>
      <el-button type="primary" @click="openCreate()">新建组织</el-button>
    </div>

    <el-table :data="orgTree" v-loading="loading" border row-key="id" default-expand-all>
      <el-table-column prop="name" label="组织名称" min-width="240" />
      <el-table-column label="角色授权" min-width="220">
        <template #default="{ row }">
          <el-tag v-for="rid in row.role_ids" :key="rid" size="small" type="warning" class="tag">
            {{ roleName(rid) }}
          </el-tag>
          <span v-if="!row.role_ids?.length" class="dim">未授权</span>
        </template>
      </el-table-column>
      <el-table-column prop="user_count" label="成员数" width="90" />
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openCreate(row.id)">加子组织</el-button>
          <el-button link type="warning" @click="openRoles(row)">授权角色</el-button>
          <el-button link type="danger" :disabled="row.id === 'org_root'" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" title="新建组织" width="420px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="组织名称" />
        </el-form-item>
        <el-form-item label="父组织">
          <el-tree-select
            v-model="form.parentId"
            :data="orgSelectTree"
            check-strictly
            placeholder="不选则为顶级组织"
            clearable
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rolesDialog" title="给组织授权角色（该组织成员自动继承）" width="440px">
      <el-select v-model="selectedRoleIds" multiple placeholder="选择角色" style="width: 100%">
        <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <template #footer>
        <el-button @click="rolesDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRoles">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi, type AdminOrg, type AdminRole } from '../../api/admin';

interface OrgRow extends AdminOrg { role_ids: string[]; children?: OrgRow[] }

const orgs = ref<OrgRow[]>([]);
const roles = ref<AdminRole[]>([]);
const loading = ref(false);
const dialog = ref(false);
const rolesDialog = ref(false);
const saving = ref(false);
const form = ref({ name: '', parentId: null as string | null });
const selectedOrg = ref<OrgRow | null>(null);
const selectedRoleIds = ref<string[]>([]);

function roleName(id: string): string {
  return roles.value.find((r) => r.id === id)?.name || id;
}

/** 平铺 → 树（el-table 树形 + el-tree-select 共用） */
const orgTree = computed<OrgRow[]>(() => {
  const byParent = new Map<string | null, OrgRow[]>();
  for (const o of orgs.value) {
    const list = byParent.get(o.parent_id) || [];
    list.push(o);
    byParent.set(o.parent_id, list);
  }
  const build = (parentId: string | null): OrgRow[] =>
    (byParent.get(parentId) || []).map((o) => ({ ...o, children: build(o.id) }));
  return build(null);
});

const orgSelectTree = computed(() => orgTree.value.map(function walk(o: any): any {
  return { value: o.id, label: o.name, children: (o.children || []).map(walk) };
}));

async function reload() {
  loading.value = true;
  try {
    orgs.value = ((await adminApi.orgs()) as OrgRow[]) || [];
    roles.value = (await adminApi.roles())?.roles || [];
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId: string | null = null) {
  form.value = { name: '', parentId };
  dialog.value = true;
}

async function save() {
  if (!form.value.name.trim()) { ElMessage.warning('请填写组织名称'); return; }
  saving.value = true;
  try {
    const res = await adminApi.createOrg({ name: form.value.name, parentId: form.value.parentId });
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已创建');
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

function openRoles(org: OrgRow) {
  selectedOrg.value = org;
  selectedRoleIds.value = [...(org.role_ids || [])];
  rolesDialog.value = true;
}

async function saveRoles() {
  if (!selectedOrg.value) return;
  saving.value = true;
  try {
    const res = await adminApi.setOrgRoles(selectedOrg.value.id, selectedRoleIds.value);
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已保存授权');
    rolesDialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function remove(org: OrgRow) {
  const confirmed = await ElMessageBox.confirm(`确定删除组织「${org.name}」？`, '删除组织', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const res = await adminApi.deleteOrg(org.id);
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
</style>
