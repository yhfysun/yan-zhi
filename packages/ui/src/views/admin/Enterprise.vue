<template>
  <div class="admin-page enterprise-page">
    <div class="admin-header">
      <div>
        <h2>企业工作台</h2>
        <p class="sub">团队资源、额度、集中式 MCP、工作节点与审计</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
    </div>

    <section v-if="overview" class="stat-grid">
      <div class="stat-card">
        <span>成员</span>
        <b>{{ overview.counts.users }}</b>
        <small>{{ overview.counts.orgs }} 个组织 · {{ overview.counts.roles }} 个角色</small>
      </div>
      <div class="stat-card">
        <span>团队规则</span>
        <b>{{ overview.counts.rules }}</b>
        <small>系统 / 专家 / 用户规则</small>
      </div>
      <div class="stat-card">
        <span>MCP 连接</span>
        <b>{{ overview.counts.mcpConnectors }}</b>
        <small>集中凭证与独立凭证</small>
      </div>
      <div class="stat-card">
        <span>工作节点</span>
        <b>{{ overview.counts.runtimeOnline }}/{{ overview.counts.runtimeNodes }}</b>
        <small>{{ overview.counts.workspaces }} 个活跃工作区</small>
      </div>
      <div class="stat-card wide">
        <span>近 30 天模型费用</span>
        <b>¥{{ Number(overview.usage.totalCny30d || 0).toFixed(2) }}</b>
        <small>{{ overview.usage.totalCalls30d }} 次模型调用</small>
      </div>
    </section>

    <el-tabs v-model="activeTab" class="enterprise-tabs">
      <el-tab-pane label="概览" name="overview">
        <div class="overview-grid">
          <section class="panel">
            <div class="panel-title">
              <h3>模型费用趋势</h3>
              <span>近 30 天</span>
            </div>
            <el-table :data="overview?.usage.usageByDay || []" size="small" border>
              <el-table-column prop="day" label="日期" min-width="110" />
              <el-table-column label="费用" width="120">
                <template #default="{ row }">¥{{ Number(row.cost_cny || 0).toFixed(4) }}</template>
              </el-table-column>
              <el-table-column prop="calls" label="调用" width="90" />
            </el-table>
          </section>
          <section class="panel">
            <div class="panel-title">
              <h3>模型消耗排行</h3>
              <span>按费用</span>
            </div>
            <el-table :data="overview?.usage.topModels || []" size="small" border>
              <el-table-column prop="model_id" label="模型" min-width="160" />
              <el-table-column label="费用" width="120">
                <template #default="{ row }">¥{{ Number(row.cost_cny || 0).toFixed(4) }}</template>
              </el-table-column>
              <el-table-column prop="calls" label="调用" width="90" />
            </el-table>
          </section>
          <section class="panel span-2">
            <div class="panel-title">
              <h3>最近管理操作</h3>
              <span>最新 10 条</span>
            </div>
            <el-table :data="(overview?.audit || []).slice(0, 10)" size="small" border>
              <el-table-column label="时间" width="170">
                <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
              </el-table-column>
              <el-table-column prop="action" label="操作" min-width="220" />
              <el-table-column prop="actor_user_id" label="操作者" min-width="150" />
              <el-table-column prop="path" label="路径" min-width="220" />
            </el-table>
          </section>
        </div>
      </el-tab-pane>
      <el-tab-pane label="团队资源" name="resources" lazy>
        <ResourcesPanel />
      </el-tab-pane>
      <el-tab-pane label="额度计费" name="quotas" lazy>
        <QuotasPanel />
      </el-tab-pane>
      <el-tab-pane label="MCP" name="mcp" lazy>
        <McpPanel />
      </el-tab-pane>
      <el-tab-pane label="工作节点" name="runtime" lazy>
        <RuntimePanel />
      </el-tab-pane>
      <el-tab-pane label="管理审计" name="audit" lazy>
        <AuditPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { enterpriseApi, type EnterpriseOverview } from '../../api/enterprise';
import ResourcesPanel from './enterprise/ResourcesPanel.vue';
import QuotasPanel from './enterprise/QuotasPanel.vue';
import McpPanel from './enterprise/McpPanel.vue';
import RuntimePanel from './enterprise/RuntimePanel.vue';
import AuditPanel from './enterprise/AuditPanel.vue';

const activeTab = ref('overview');
const loading = ref(false);
const overview = ref<EnterpriseOverview | null>(null);

function formatTime(v: number | null | undefined) {
  return v ? new Date(v).toLocaleString() : '-';
}

async function reload() {
  loading.value = true;
  try {
    overview.value = await enterpriseApi.overview();
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.enterprise-page { min-height: 100%; }
.sub { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.stat-grid { display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap: 12px; margin-bottom: 14px; }
.stat-card { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary); }
.stat-card span, .stat-card small { color: var(--color-text-secondary); font-size: 12px; }
.stat-card b { font-size: 24px; line-height: 1.1; color: var(--color-text-primary); }
.enterprise-tabs { min-height: 0; }
.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); min-width: 0; }
.panel.span-2 { grid-column: span 2; }
.panel-title { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.panel-title h3 { margin: 0; font-size: 14px; }
.panel-title span { color: var(--color-text-secondary); font-size: 12px; }
@media (max-width: 1000px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
  .overview-grid { grid-template-columns: 1fr; }
  .panel.span-2 { grid-column: span 1; }
}
</style>
