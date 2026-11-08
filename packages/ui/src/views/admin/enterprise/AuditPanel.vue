<template>
  <div class="epanel">
    <div class="toolbar">
      <div>
        <h3>管理审计</h3>
        <p>记录管理端和团队资源变更，保留操作者、路径、来源 IP 与前后值。</p>
      </div>
      <div class="actions">
        <el-input v-model="filters.actorUserId" clearable placeholder="操作者 ID" style="width: 180px" />
        <el-input v-model="filters.resourceType" clearable placeholder="资源类型" style="width: 140px" />
        <el-button :loading="loading" @click="reload">查询</el-button>
      </div>
    </div>

    <section class="panel">
      <el-table :data="items" border size="small" v-loading="loading">
        <el-table-column label="时间" width="175">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="actor_user_id" label="操作者" min-width="150" />
        <el-table-column prop="action" label="操作" min-width="240" show-overflow-tooltip />
        <el-table-column prop="resource_type" label="资源" width="110" />
        <el-table-column prop="resource_id" label="资源 ID" min-width="140" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column label="详情" width="90">
          <template #default="{ row }"><el-button link type="primary" @click="show(row)">查看</el-button></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <span>共 {{ total }} 条</span>
        <el-button size="small" :disabled="offset <= 0" @click="prev">上一页</el-button>
        <el-button size="small" :disabled="offset + limit >= total" @click="next">下一页</el-button>
      </div>
    </section>

    <el-drawer v-model="drawer" title="审计详情" size="620px">
      <pre class="json">{{ JSON.stringify(active, null, 2) }}</pre>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { enterpriseApi, type AuditItem } from '../../../api/enterprise';

const loading = ref(false);
const items = ref<AuditItem[]>([]);
const total = ref(0);
const limit = 100;
const offset = ref(0);
const drawer = ref(false);
const active = ref<AuditItem | null>(null);
const filters = ref({ actorUserId: '', resourceType: '' });

function formatTime(v: number) {
  return v ? new Date(v).toLocaleString() : '-';
}

async function reload() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = { limit, offset: offset.value };
    if (filters.value.actorUserId.trim()) params.actorUserId = filters.value.actorUserId.trim();
    if (filters.value.resourceType.trim()) params.resourceType = filters.value.resourceType.trim();
    const r = await enterpriseApi.audit(params);
    items.value = r?.items || [];
    total.value = r?.total || 0;
  } finally {
    loading.value = false;
  }
}

function show(row: AuditItem) {
  active.value = row;
  drawer.value = true;
}
function prev() {
  offset.value = Math.max(0, offset.value - limit);
  void reload();
}
function next() {
  offset.value += limit;
  void reload();
}

onMounted(reload);
</script>

<style scoped>
.epanel { display: flex; flex-direction: column; gap: 14px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar h3 { margin: 0 0 4px; font-size: 15px; }
.toolbar p { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 10px; color: var(--color-text-secondary); font-size: 12px; }
.json { margin: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg-secondary); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .toolbar { flex-direction: column; } .actions { justify-content: flex-start; } }
</style>
