<template>
  <div class="epanel audit-panel">
    <section class="audit-filter">
      <div class="audit-filter-head">
        <div class="audit-title-icon"><el-icon :size="17"><Document /></el-icon></div>
        <div class="audit-intro">
          <h3>管理审计</h3>
          <p>记录管理端与团队资源变更，保留操作者、路径、来源 IP 与前后值。</p>
        </div>
        <span class="audit-total"><b>{{ total }}</b> 条记录</span>
      </div>
      <div class="audit-filter-bar">
        <el-input v-model="filters.actorUserId" clearable placeholder="按操作者 ID 筛选" class="audit-input">
          <template #prefix><el-icon :size="14"><Search /></el-icon></template>
        </el-input>
        <el-select v-model="filters.resourceType" clearable filterable allow-create placeholder="全部资源类型" class="audit-select">
          <el-option v-for="t in resourceTypes" :key="t" :label="t" :value="t" />
        </el-select>
        <el-input v-model="filters.action" clearable placeholder="按操作名称筛选" class="audit-input">
          <template #prefix><el-icon :size="14"><Filter /></el-icon></template>
        </el-input>
        <div class="audit-filter-actions">
          <el-button :icon="RefreshLeft" :disabled="!hasFilters" @click="reset">重置</el-button>
          <el-button type="primary" :icon="Search" :loading="loading" @click="search">查询</el-button>
        </div>
      </div>
    </section>

    <section class="audit-table-card">
      <el-table :data="items" size="small" v-loading="loading" class="audit-table" row-key="id">
        <el-table-column label="时间" width="168">
          <template #default="{ row }"><span class="mono">{{ formatTime(row.created_at) }}</span></template>
        </el-table-column>
        <el-table-column prop="actor_user_id" label="操作者" min-width="130">
          <template #default="{ row }"><span class="actor">{{ row.actor_user_id || '系统' }}</span></template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="220" show-overflow-tooltip>
          <template #default="{ row }"><span class="action-name">{{ row.action }}</span></template>
        </el-table-column>
        <el-table-column label="资源" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.resource_type" size="small" effect="plain" round>{{ row.resource_type }}</el-tag>
            <span v-else class="dash">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="resource_id" label="资源 ID" min-width="140" show-overflow-tooltip>
          <template #default="{ row }"><span class="mono dim">{{ row.resource_id || '-' }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="来源 IP" width="130">
          <template #default="{ row }"><span class="mono dim">{{ row.ip || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="详情" width="76" align="center" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="查看完整记录" placement="top">
              <el-button link type="primary" :icon="View" @click="show(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
        <template #empty>
          <EntEmpty
            :title="hasFilters ? '没有匹配的审计记录' : '还没有审计记录'"
            :description="hasFilters ? '试试调整筛选条件，或清空后查看全部记录。' : '管理员创建资源、调整额度或修改配置后，操作会自动留痕并出现在这里。'"
          >
            <el-button v-if="hasFilters" size="small" round @click="reset">清空筛选</el-button>
          </EntEmpty>
        </template>
      </el-table>
      <div class="audit-pager">
        <span class="audit-pager-info">
          共 <b>{{ total }}</b> 条
          <template v-if="total"> · 当前 {{ offset + 1 }}–{{ Math.min(offset + items.length, total) }} 条</template>
        </span>
        <div class="audit-pager-btns">
          <el-button size="small" :disabled="offset <= 0" @click="prev">上一页</el-button>
          <span class="audit-page-no">{{ Math.floor(offset / limit) + 1 }} / {{ Math.max(1, Math.ceil(total / limit)) }}</span>
          <el-button size="small" :disabled="offset + limit >= total" @click="next">下一页</el-button>
        </div>
      </div>
    </section>

    <el-drawer v-model="drawer" title="审计详情" size="560px" class="audit-drawer">
      <div v-if="active" class="audit-detail">
        <div class="audit-hero">
          <span class="audit-hero-action">{{ active.action }}</span>
          <time>{{ formatTime(active.created_at) }}</time>
        </div>
        <dl class="audit-fields">
          <div><dt>操作者</dt><dd class="mono">{{ active.actor_user_id || '系统' }}</dd></div>
          <div><dt>请求方法</dt><dd class="mono">{{ active.method || '-' }}</dd></div>
          <div><dt>请求路径</dt><dd class="mono wrap">{{ active.path || '-' }}</dd></div>
          <div><dt>资源类型</dt><dd>{{ active.resource_type || '-' }}</dd></div>
          <div><dt>资源 ID</dt><dd class="mono wrap">{{ active.resource_id || '-' }}</dd></div>
          <div><dt>来源 IP</dt><dd class="mono">{{ active.ip || '-' }}</dd></div>
          <div><dt>Trace ID</dt><dd class="mono wrap">{{ active.trace_id || '-' }}</dd></div>
        </dl>
        <details class="audit-raw">
          <summary>原始记录 JSON</summary>
          <pre>{{ JSON.stringify(active, null, 2) }}</pre>
        </details>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Document, Filter, RefreshLeft, Search, View } from '@element-plus/icons-vue';
import { enterpriseApi, type AuditItem } from '../../../api/enterprise';
import EntEmpty from './EntEmpty.vue';

const loading = ref(false);
const items = ref<AuditItem[]>([]);
const total = ref(0);
const limit = 100;
const offset = ref(0);
const drawer = ref(false);
const active = ref<AuditItem | null>(null);
const filters = ref({ actorUserId: '', resourceType: '', action: '' });

const COMMON_TYPES = ['rule', 'mcp', 'quota', 'node', 'workspace', 'agent', 'model', 'skill', 'design'];
const resourceTypes = computed(() => {
  const fromData = items.value.map((x) => x.resource_type).filter((x): x is string => !!x);
  return Array.from(new Set([...COMMON_TYPES, ...fromData]));
});
const hasFilters = computed(() => !!(filters.value.actorUserId || filters.value.resourceType || filters.value.action));

function formatTime(v: number) {
  return v ? new Date(v).toLocaleString() : '-';
}

async function reload() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = { limit, offset: offset.value };
    if (filters.value.actorUserId.trim()) params.actorUserId = filters.value.actorUserId.trim();
    if (filters.value.resourceType.trim()) params.resourceType = filters.value.resourceType.trim();
    if (filters.value.action.trim()) params.action = filters.value.action.trim();
    const r = await enterpriseApi.audit(params);
    items.value = r?.items || [];
    total.value = r?.total || 0;
  } finally {
    loading.value = false;
  }
}

function search() {
  offset.value = 0;
  void reload();
}
function reset() {
  filters.value = { actorUserId: '', resourceType: '', action: '' };
  offset.value = 0;
  void reload();
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
.audit-filter, .audit-table-card {
  border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .03), 0 10px 24px -20px rgba(16, 24, 40, .3);
}
.audit-filter { padding: 16px 18px; }
.audit-filter-head { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
.audit-title-icon { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--color-primary-soft); color: var(--color-primary); }
.audit-intro { flex: 1; min-width: 0; }
.audit-intro h3 { margin: 0 0 3px; font-size: var(--font-size-md); font-weight: 600; color: var(--color-text); }
.audit-intro p { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.audit-total { flex: none; font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.audit-total b { font-family: var(--font-mono); font-size: 15px; color: var(--color-primary); margin-right: 3px; }
.audit-filter-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px dashed var(--color-border); }
.audit-input { width: 210px; }
.audit-select { width: 170px; }
.audit-filter-actions { display: flex; gap: 8px; margin-left: auto; }
.audit-filter-bar :deep(.el-input__prefix-inner) { color: var(--color-text-tertiary); }

.audit-table-card { overflow: hidden; }
.audit-table { --el-table-border-color: var(--color-border); }
.audit-table :deep(.el-table__inner-wrapper::before) { display: none; }
.audit-table :deep(th.el-table__cell) { background: color-mix(in srgb, var(--color-bg) 55%, var(--color-surface)); font-size: 11.5px; font-weight: 600; color: var(--color-text-secondary); }
.audit-table :deep(.el-table__body tr:hover > td.el-table__cell) { background: var(--color-primary-soft) !important; }
.audit-table :deep(.cell) { font-size: var(--font-size-sm); }
.mono { font-family: var(--font-mono); font-size: 11.5px; }
.dim { color: var(--color-text-tertiary); }
.wrap { overflow-wrap: anywhere; }
.actor { font-weight: 500; color: var(--color-text); }
.action-name { color: var(--color-text); }
.dash { color: var(--color-text-tertiary); }
.audit-pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 16px; border-top: 1px solid var(--color-border); }
.audit-pager-info { font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.audit-pager-info b { color: var(--color-text); font-family: var(--font-mono); }
.audit-pager-btns { display: flex; align-items: center; gap: 9px; }
.audit-page-no { min-width: 48px; text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary); }

.audit-detail { display: flex; flex-direction: column; gap: 16px; }
.audit-hero { padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 10px; background: linear-gradient(140deg, var(--color-primary-soft), var(--color-surface) 70%); }
.audit-hero-action { display: block; font-size: 15px; font-weight: 600; color: var(--color-text); overflow-wrap: anywhere; }
.audit-hero time { display: block; margin-top: 5px; font-size: 11px; color: var(--color-text-tertiary); font-family: var(--font-mono); }
.audit-fields { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1px; border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; background: var(--color-border); }
.audit-fields > div { padding: 11px 13px; background: var(--color-surface); min-width: 0; }
.audit-fields dt { margin: 0 0 5px; font-size: 10.5px; color: var(--color-text-tertiary); }
.audit-fields dd { margin: 0; font-size: var(--font-size-sm); color: var(--color-text); overflow-wrap: anywhere; }
.audit-raw { border: 1px solid var(--color-border); border-radius: 10px; padding: 0 14px; background: var(--color-bg); }
.audit-raw summary { padding: 11px 0; cursor: pointer; font-size: var(--font-size-sm); font-weight: 500; color: var(--color-text-secondary); }
.audit-raw pre { margin: 0; padding: 0 0 14px; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--color-text-secondary); font-family: var(--font-mono); }

@media (max-width: 900px) {
  .audit-input, .audit-select { width: 100%; }
  .audit-filter-actions { margin-left: 0; width: 100%; }
  .audit-filter-actions :deep(.el-button) { flex: 1; }
  .audit-fields { grid-template-columns: 1fr; }
}
</style>
