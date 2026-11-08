<template>
  <el-dialog
    :model-value="visible"
    :title="`授权名单 — ${name}`"
    width="460px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @open="load"
  >
    <p class="acl-tip">名单内的<strong>用户</strong>或<strong>角色</strong>（角色下所有用户）可以使用该资源（不可编辑）；你自己始终可用。保存后立即生效。</p>
    <div class="acl-label">按用户授权</div>
    <el-select v-model="selectedUsers" multiple filterable placeholder="选择用户" style="width: 100%" :loading="loading">
      <el-option v-for="u in users" :key="u.id" :label="u.username" :value="u.id" />
    </el-select>
    <div class="acl-label">按角色授权（批量：角色下所有用户生效）</div>
    <el-select v-model="selectedRoles" multiple filterable placeholder="选择角色" style="width: 100%" :loading="loading">
      <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
    </el-select>
    <p v-if="users.length === 0 && roles.length === 0 && !loading" class="acl-empty">暂无其它用户/角色 —— 先在「用户管理」「角色权限」里创建。</p>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存名单</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';
import { usePlatformStore } from '../../stores/platform';
import { useSkillStore } from '../../stores/skill';
import { useAgentStore } from '../../stores/agent';

const props = defineProps<{
  visible: boolean;
  /** 资源类型：agent / model / skill / tool / platform / plugin */
  type: string;
  id: string;
  name: string;
}>();
defineEmits(['update:visible']);

const users = ref<Array<{ id: string; username: string }>>([]);
const roles = ref<Array<{ id: string; name: string }>>([]);
const selectedUsers = ref<string[]>([]);
const selectedRoles = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);

async function load() {
  if (!props.id) return;
  loading.value = true;
  const [opts, acl] = await Promise.all([
    api.get<{ users: Array<{ id: string; username: string }>; roles: Array<{ id: string; name: string }> }>('/resource-acl/user-options'),
    api.get<{ userIds: string[]; roleIds: string[] }>(`/resource-acl/${props.type}/${encodeURIComponent(props.id)}`),
  ]);
  loading.value = false;
  if ('data' in opts) { users.value = opts.data.users || []; roles.value = opts.data.roles || []; }
  if ('data' in acl) { selectedUsers.value = acl.data.userIds || []; selectedRoles.value = acl.data.roleIds || []; }
}

watch(() => props.visible, (v) => { if (v) load(); });

async function save() {
  saving.value = true;
  const r = await api.put(`/resource-acl/${props.type}/${encodeURIComponent(props.id)}`, { userIds: selectedUsers.value, roleIds: selectedRoles.value });
  saving.value = false;
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('授权名单已保存');
  // ★ 撤权/授权后立即失效常规选择器的资源缓存（Task 4）：名单可能减少，已撤权限的资源
  //   必须从模型 / Skill / 智能体选择器消失，下次打开时重新拉取（服务端按 ACL 过滤）。
  usePlatformStore().invalidateModels();
  useSkillStore().invalidateSkills();
  useAgentStore().invalidateAgents();
  // 重新拉取（后端会剔除无效用户）
  load();
}
</script>

<style scoped>
.acl-tip { font-size: 12.5px; color: var(--color-text-secondary); margin: 0 0 12px; }
.acl-empty { font-size: 12.5px; color: var(--color-text-secondary); margin: 10px 0 0; }
</style>
