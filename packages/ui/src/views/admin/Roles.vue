<template>
  <div class="admin-page">
    <div class="admin-header">
      <h2>角色与权限</h2>
      <el-button type="primary" @click="openCreate">新建角色</el-button>
    </div>

    <el-table :data="roleTree" v-loading="loading" border row-key="id" default-expand-all>
      <el-table-column prop="name" label="角色" min-width="180" />
      <el-table-column label="权限" min-width="300">
        <template #default="{ row }">
          <el-tag
            v-for="pid in rolePermissionIds(row.id).slice(0, 8)"
            :key="pid" size="small" class="tag">{{ permName(pid) }}</el-tag>
          <span v-if="rolePermissionIds(row.id).length > 8" class="dim">等 {{ rolePermissionIds(row.id).length }} 项</span>
          <span v-if="!rolePermissionIds(row.id).length" class="dim">无权限</span>
        </template>
      </el-table-column>
      <el-table-column label="内置" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.is_system" size="small" type="info">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">配置</el-button>
          <el-button link type="danger" :disabled="!!row.is_system" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing ? '配置角色' : '新建角色'" width="560px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" :disabled="editing?.is_system" />
        </el-form-item>
        <el-form-item label="父角色">
          <el-tree-select
            v-model="form.parentId"
            :data="roleSelectTree"
            check-strictly
            placeholder="不选则为顶级（子角色继承父角色权限）"
            clearable
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="选填" />
        </el-form-item>
        <el-form-item label="权限">
          <!-- 权限树（2026-11-01 用户要求）：el-tree 级联勾选，父子联动（勾父=全选子） -->
          <div class="perm-tree-wrap">
            <el-tree
              ref="permTreeRef"
              :data="permTreeData"
              node-key="id"
              show-checkbox
              default-expand-all
              :props="{ label: 'name', children: 'children' }"
              :default-checked-keys="form.permissionIds"
            />
          </div>
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
import { ref, computed, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi, type AdminRole, type RoleBinding, type PermissionDef } from '../../api/admin';

interface RoleRow extends AdminRole { children?: RoleRow[] }

const roles = ref<RoleRow[]>([]);
const bindings = ref<RoleBinding[]>([]);
const permissions = ref<PermissionDef[]>([]);
const loading = ref(false);
const dialog = ref(false);
const saving = ref(false);
const editing = ref<RoleRow | null>(null);
const form = ref({ name: '', parentId: null as string | null, remark: '', permissionIds: [] as string[] });

/** 权限树数据（el-tree，2026-11-01 用户要求树形权限） */
const permTreeRef = ref();
const permTreeData = computed(() => {
  const top = permissions.value.filter((p) => !p.parent);
  const childrenOf = (id: string) => permissions.value.filter((p) => p.parent === id);
  // 三层足够（顶级 → 二级 → 三级）；更深递归兜底
  const build = (id: string): any[] => childrenOf(id).map((c) => {
    const kids = build(c.id);
    return kids.length ? { ...c, children: kids } : { ...c };
  });
  return top.map((t) => ({ ...t, children: build(t.id) }));
});
function syncTreeChecked() {
  nextTick(() => { try { permTreeRef.value?.setCheckedKeys(form.value.permissionIds); } catch { /* ignore */ } });
}

const roleTree = computed<RoleRow[]>(() => {
  const byParent = new Map<string | null, RoleRow[]>();
  for (const r of roles.value) {
    const list = byParent.get(r.parent_id) || [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }
  const build = (parentId: string | null): RoleRow[] =>
    (byParent.get(parentId) || []).map((r) => ({ ...r, children: build(r.id) }));
  return build(null);
});

const roleSelectTree = computed(() => roleTree.value.map(function walk(r: any): any {
  return { value: r.id, label: r.name, children: (r.children || []).map(walk) };
}));

function rolePermissionIds(roleId: string): string[] {
  return bindings.value.filter((b) => b.role_id === roleId).map((b) => b.permission_id);
}

function permName(id: string): string {
  return permissions.value.find((p) => p.id === id)?.name || id;
}

function isGroupChecked(group: any): boolean {
  return group.children.length > 0 && group.children.every((c: PermissionDef) => form.value.permissionIds.includes(c.id));
}
function isGroupIndeterminate(group: any): boolean {
  const n = group.children.filter((c: PermissionDef) => form.value.permissionIds.includes(c.id)).length;
  return n > 0 && n < group.children.length;
}
function toggleGroup(group: any, checked: boolean): void {
  const ids = new Set(form.value.permissionIds);
  for (const c of group.children) {
    if (checked) ids.add(c.id);
    else ids.delete(c.id);
  }
  form.value.permissionIds = [...ids];
}

async function reload() {
  loading.value = true;
  try {
    const r = (await adminApi.roles()) || { roles: [], bindings: [] };
    roles.value = r.roles as RoleRow[];
    bindings.value = r.bindings;
    permissions.value = (await adminApi.permissions()) || [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', parentId: null, remark: '', permissionIds: [] };
  dialog.value = true;
  syncTreeChecked();
}

function openEdit(role: RoleRow) {
  editing.value = role;
  form.value = {
    name: role.name,
    parentId: role.parent_id,
    remark: role.remark || '',
    permissionIds: rolePermissionIds(role.id),
  };
  dialog.value = true;
  syncTreeChecked();
}

async function save() {
  if (!form.value.name.trim()) { ElMessage.warning('请填写角色名称'); return; }
  saving.value = true;
  try {
    const body = {
      name: form.value.name,
      parentId: form.value.parentId,
      remark: form.value.remark || undefined,
      permissionIds: (permTreeRef.value?.getCheckedKeys() as string[]) || [],
    };
    const res = editing.value ? await adminApi.updateRole(editing.value.id, body) : await adminApi.createRole(body);
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已保存');
    dialog.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function remove(role: RoleRow) {
  const confirmed = await ElMessageBox.confirm(`确定删除角色「${role.name}」？`, '删除角色', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const res = await adminApi.deleteRole(role.id);
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
.perm-panel { width: 100%; }
.perm-group { margin-bottom: 8px; }
.perm-group-title { font-weight: 600; }
.perm-items { display: flex; flex-wrap: wrap; padding-left: 20px; }
</style>
