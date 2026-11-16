<template>
  <div class="gateway-panel">
    <div class="gateway-endpoint">
      <span class="gateway-endpoint-label">Base URL</span>
      <code>{{ endpoint }}</code>
      <el-button text :icon="Copy" aria-label="复制网关地址" @click="copy(endpoint)" />
    </div>

    <div class="gateway-toolbar">
      <div>
        <strong>客户密钥</strong>
        <span>{{ keys.length }} 个</span>
      </div>
      <el-button type="primary" :icon="Plus" :loading="creating" @click="openCreate">新建密钥</el-button>
    </div>

    <el-empty v-if="!loading && keys.length === 0" description="还没有网关密钥" :image-size="72" />
    <div v-else class="gateway-list">
      <div v-for="item in keys" :key="item.id" class="gateway-row" :class="{ disabled: !item.enabled }">
        <div class="gateway-identity">
          <span class="gateway-icon"><KeyRound :size="16" /></span>
          <div class="gateway-name-wrap">
            <strong>{{ item.name }}</strong>
            <code>{{ item.keyPrefix }}…</code>
          </div>
        </div>
        <div class="gateway-stat">
          <span>今日</span>
          <b>{{ shortNumber(item.usageToday.tokens) }} tokens</b>
          <small>{{ money(item.usageToday.costCny) }}</small>
        </div>
        <div class="gateway-stat">
          <span>限额</span>
          <b>{{ limitText(item.dailyTokenLimit, 'tokens') }}</b>
          <small>{{ item.dailyCostLimitCny ? money(item.dailyCostLimitCny) : '费用不限' }} · {{ item.rpmLimit }} RPM</small>
        </div>
        <div class="gateway-state">
          <el-switch
            :model-value="item.enabled"
            size="small"
            :loading="busyId === item.id"
            @change="toggle(item, !!$event)"
          />
          <el-button
            text
            :icon="Pencil"
            aria-label="编辑网关密钥"
            :loading="busyId === item.id"
            @click="openEdit(item)"
          />
          <el-button
            text
            type="danger"
            :icon="Trash2"
            aria-label="删除网关密钥"
            :loading="busyId === item.id"
            @click="remove(item)"
          />
        </div>
      </div>
    </div>

    <el-dialog v-model="createOpen" :title="editingId ? '编辑网关密钥' : '新建网关密钥'" width="520px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="名称">
          <el-input v-model="createForm.name" maxlength="100" placeholder="例如 Claude Code、Cursor" />
        </el-form-item>
        <el-form-item label="模型范围">
          <el-input
            v-model="createForm.allowedModels"
            placeholder="* = 全部；auto = 仅自动路由；也可填模型 ID，逗号分隔"
          />
        </el-form-item>
        <el-form-item label="每日 tokens">
          <el-input-number v-model="createForm.dailyTokenLimit" :min="0" :step="100000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每日费用">
          <el-input-number v-model="createForm.dailyCostLimitCny" :min="0" :step="1" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="RPM">
          <el-input-number v-model="createForm.rpmLimit" :min="1" :max="100000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="createForm.expiresAt"
            type="date"
            value-format="x"
            placeholder="永久有效"
            clearable
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <div class="gateway-form-tip">0 表示不限制每日 tokens 或费用。</div>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="create">{{ editingId ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="secretOpen" title="网关密钥已创建" width="560px" :close-on-click-modal="false">
      <div class="gateway-secret">
        <code>{{ secretKey }}</code>
        <el-button type="primary" :icon="Copy" @click="copy(secretKey)">复制</el-button>
      </div>
      <p class="gateway-secret-warning">明文只显示这一次，关闭后无法再次查看。</p>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-vue-next';
import type { GatewayClientKeyView, GatewayUsageToday } from '@yan-zhi/shared';
import { api } from '../../api/client';

type GatewayKeyItem = GatewayClientKeyView & { usageToday: GatewayUsageToday };

const endpoint = ref('http://127.0.0.1:3001/gateway/v1');
const keys = ref<GatewayKeyItem[]>([]);
const loading = ref(false);
const creating = ref(false);
const busyId = ref('');
const createOpen = ref(false);
const editingId = ref('');
const secretOpen = ref(false);
const secretKey = ref('');

const createForm = reactive({
  name: '',
  allowedModels: '*',
  dailyTokenLimit: 0,
  dailyCostLimitCny: 0,
  rpmLimit: 60,
  expiresAt: null as string | number | null,
});

function parseAllowedModels(raw: string): string[] {
  const items = raw.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  return items.length ? [...new Set(items)] : ['*'];
}

function shortNumber(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function money(value: number): string {
  return `¥${(Number(value) || 0).toFixed(2)}`;
}

function limitText(value: number, unit: string): string {
  return value > 0 ? `${shortNumber(value)} ${unit}` : `${unit}不限`;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.get<GatewayKeyItem[]>('/gateway-keys');
    if ('error' in result) {
      ElMessage.error((result as any).error || '加载网关密钥失败');
      return;
    }
    keys.value = result.data || [];
    if ((result as any).meta?.endpoint) endpoint.value = String((result as any).meta.endpoint);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = '';
  createForm.name = '';
  createForm.allowedModels = '*';
  createForm.dailyTokenLimit = 0;
  createForm.dailyCostLimitCny = 0;
  createForm.rpmLimit = 60;
  createForm.expiresAt = null;
  createOpen.value = true;
}

function openEdit(item: GatewayKeyItem): void {
  editingId.value = item.id;
  createForm.name = item.name;
  createForm.allowedModels = item.allowedModels.join(', ');
  createForm.dailyTokenLimit = item.dailyTokenLimit;
  createForm.dailyCostLimitCny = item.dailyCostLimitCny;
  createForm.rpmLimit = item.rpmLimit || 60;
  createForm.expiresAt = item.expiresAt;
  createOpen.value = true;
}

async function create(): Promise<void> {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入密钥名称');
    return;
  }
  creating.value = true;
  try {
    const payload = {
      name: createForm.name.trim(),
      allowedModels: parseAllowedModels(createForm.allowedModels),
      dailyTokenLimit: createForm.dailyTokenLimit,
      dailyCostLimitCny: createForm.dailyCostLimitCny,
      rpmLimit: createForm.rpmLimit,
      expiresAt: createForm.expiresAt ? Number(createForm.expiresAt) : null,
    };
    const result = editingId.value
      ? await api.patch<GatewayKeyItem>(`/gateway-keys/${editingId.value}`, payload)
      : await api.post<GatewayKeyItem & { key: string }>('/gateway-keys', payload);
    if ('error' in result) {
      ElMessage.error((result as any).error || (editingId.value ? '保存失败' : '创建失败'));
      return;
    }
    if (!editingId.value) {
      secretKey.value = (result.data as GatewayKeyItem & { key: string }).key;
      secretOpen.value = true;
    }
    createOpen.value = false;
    await load();
  } finally {
    creating.value = false;
  }
}

async function toggle(item: GatewayKeyItem, enabled: boolean): Promise<void> {
  busyId.value = item.id;
  try {
    const result = await api.patch<GatewayKeyItem>(`/gateway-keys/${item.id}`, { enabled });
    if ('error' in result) {
      ElMessage.error((result as any).error || '更新失败');
      return;
    }
    const index = keys.value.findIndex((key) => key.id === item.id);
    if (index >= 0) keys.value[index] = result.data;
  } finally {
    busyId.value = '';
  }
}

async function remove(item: GatewayKeyItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除密钥「${item.name}」后，外部客户端会立即失去访问权限。`, '删除网关密钥', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'yz-confirm-danger',
    });
  } catch {
    return;
  }
  busyId.value = item.id;
  try {
    const result = await api.delete(`/gateway-keys/${item.id}`);
    if ('error' in result) {
      ElMessage.error((result as any).error || '删除失败');
      return;
    }
    keys.value = keys.value.filter((key) => key.id !== item.id);
  } finally {
    busyId.value = '';
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

onMounted(load);
</script>

<style scoped>
.gateway-panel { display: flex; flex-direction: column; gap: 14px; width: min(980px, 100%); }
.gateway-endpoint {
  display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 8px;
  background: var(--glass-bg);
}
.gateway-endpoint-label { flex-shrink: 0; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.gateway-endpoint code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }
.gateway-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.gateway-toolbar > div { display: flex; align-items: baseline; gap: 8px; }
.gateway-toolbar span { font-size: 12px; color: var(--color-text-secondary); }
.gateway-list { border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.gateway-row {
  display: grid; grid-template-columns: minmax(180px, 1.35fr) minmax(150px, .8fr) minmax(190px, .9fr) auto;
  align-items: center; gap: 16px; min-height: 68px; padding: 10px 12px;
  border-bottom: 1px solid var(--color-border); background: var(--glass-bg);
}
.gateway-row:last-child { border-bottom: 0; }
.gateway-row.disabled { opacity: .58; }
.gateway-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gateway-icon {
  display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0;
  border-radius: 8px; background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary);
}
.gateway-name-wrap { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.gateway-name-wrap strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gateway-name-wrap code { font-size: 11px; color: var(--color-text-secondary); }
.gateway-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gateway-stat span,
.gateway-stat small { font-size: 11px; color: var(--color-text-secondary); }
.gateway-stat b { font-size: 13px; color: var(--color-text); }
.gateway-stat small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gateway-state { display: flex; align-items: center; gap: 4px; }
.gateway-form-tip { margin-top: -4px; font-size: 12px; color: var(--color-text-secondary); }
.gateway-secret { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gateway-secret code {
  flex: 1; min-width: 0; padding: 10px 12px; overflow-wrap: anywhere;
  border: 1px solid var(--color-border); border-radius: 8px; background: var(--el-fill-color-light);
}
.gateway-secret-warning { margin: 12px 0 0; color: var(--el-color-warning); font-size: 12px; }

@media (max-width: 720px) {
  .gateway-row { grid-template-columns: 1fr auto; gap: 10px 12px; }
  .gateway-stat { grid-column: 1; }
  .gateway-state { grid-column: 2; grid-row: 1 / span 3; align-self: center; }
  .gateway-endpoint { align-items: flex-start; flex-wrap: wrap; }
  .gateway-endpoint code { width: calc(100% - 82px); }
  .gateway-secret { align-items: stretch; flex-direction: column; }
}
</style>
