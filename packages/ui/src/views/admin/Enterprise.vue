<template>
  <div class="admin-page enterprise-page">
    <header class="ent-header">
      <div class="ent-brand">
        <div class="ent-brand-mark"><el-icon :size="22"><OfficeBuilding /></el-icon></div>
        <div class="ent-brand-text">
          <div class="ent-eyebrow">ADMIN CONSOLE / 企业管理</div>
          <h1>企业工作台</h1>
          <p>团队资源、额度计费、集中式 MCP、工作节点与管理审计</p>
        </div>
      </div>
      <div class="ent-header-actions">
        <span class="ent-updated"><el-icon :size="13"><Clock /></el-icon>{{ lastUpdated ? `更新于 ${lastUpdated}` : '正在加载数据' }}</span>
        <el-button :icon="Refresh" :loading="loading" round @click="reload">刷新数据</el-button>
      </div>
    </header>

    <section v-if="overview" class="ent-stats" aria-label="关键指标">
      <article
        v-for="s in statCards"
        :key="s.key"
        class="ent-stat"
        :class="[`tone-${s.tone}`, { 'is-featured': s.featured }]"
      >
        <div class="ent-stat-head">
          <span class="ent-stat-label">{{ s.label }}</span>
          <span class="ent-stat-icon"><el-icon :size="16"><component :is="s.icon" /></el-icon></span>
        </div>
        <div class="ent-stat-value">
          <em v-if="s.prefix">{{ s.prefix }}</em>{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small>
        </div>
        <div class="ent-stat-foot">
          <span>{{ s.hint }}</span>
          <span v-if="s.badge" class="ent-stat-badge">{{ s.badge }}</span>
        </div>
        <div v-if="s.progress !== undefined" class="ent-stat-track"><i :style="{ width: `${s.progress}%` }" /></div>
      </article>
    </section>
    <section v-else class="ent-stats" aria-label="关键指标加载中">
      <div v-for="n in 5" :key="n" class="ent-stat ent-stat-skeleton" />
    </section>

    <el-tabs v-model="activeTab" class="ent-tabs">
      <el-tab-pane name="overview">
        <template #label><span class="ent-tab-label"><el-icon :size="14"><TrendCharts /></el-icon>概览</span></template>
        <div class="ent-grid">
          <section class="ent-card">
            <div class="ent-card-head">
              <div><h3>模型费用趋势</h3><p>近 30 天每日调用成本</p></div>
              <span class="ent-chip">¥{{ Number(overview?.usage.totalCny30d || 0).toFixed(2) }}</span>
            </div>
            <div v-if="trend.length" class="ent-chart">
              <div v-for="(d, i) in trend" :key="i" class="ent-chart-col" :title="`${d.day} · ¥${Number(d.cost_cny || 0).toFixed(4)} · ${d.calls} 次`">
                <i :style="{ height: `${d.h}%` }" />
              </div>
            </div>
            <div v-if="trend.length" class="ent-chart-axis"><span>{{ trend[0]?.day }}</span><span>{{ trend[trend.length - 1]?.day }}</span></div>
            <EntEmpty v-else title="暂无费用数据" description="产生模型调用后，这里会显示近 30 天的每日费用走势。" />
          </section>

          <section class="ent-card">
            <div class="ent-card-head">
              <div><h3>模型消耗排行</h3><p>按累计费用排序</p></div>
              <span class="ent-chip">TOP {{ topModels.length }}</span>
            </div>
            <div v-if="topModels.length" class="ent-rank">
              <div v-for="(m, i) in topModels" :key="m.model_id" class="ent-rank-row">
                <span class="ent-rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
                <div class="ent-rank-main">
                  <div class="ent-rank-top"><b :title="m.model_id">{{ m.model_id }}</b><span>¥{{ Number(m.cost_cny || 0).toFixed(2) }}</span></div>
                  <div class="ent-rank-track"><i :style="{ width: `${m.pct}%` }" /></div>
                </div>
              </div>
            </div>
            <EntEmpty v-else title="暂无模型消耗" description="模型被调用后，会按费用排出最常用模型。" />
          </section>

          <section class="ent-card span-2">
            <div class="ent-card-head">
              <div><h3>最近管理操作</h3><p>来自全局审计日志，最新 10 条</p></div>
              <span class="ent-chip">审计留痕</span>
            </div>
            <div v-if="recentAudit.length" class="ent-timeline">
              <div v-for="(a, i) in recentAudit" :key="a.id || i" class="ent-tl-row">
                <span class="ent-tl-dot" />
                <div class="ent-tl-body">
                  <div class="ent-tl-title"><b>{{ a.action }}</b><time>{{ formatTime(a.created_at) }}</time></div>
                  <div class="ent-tl-meta">{{ a.actor_user_id || '系统' }}<span v-if="a.path"> · {{ a.path }}</span></div>
                </div>
              </div>
            </div>
            <EntEmpty v-else title="还没有管理操作" description="管理员创建资源、调整额度或修改配置后，操作会按时间线出现在这里。" />
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane name="resources" lazy>
        <template #label><span class="ent-tab-label"><el-icon :size="14"><Files /></el-icon>团队资源</span></template>
        <ResourcesPanel />
      </el-tab-pane>
      <el-tab-pane name="quotas" lazy>
        <template #label><span class="ent-tab-label"><el-icon :size="14"><Coin /></el-icon>额度计费</span></template>
        <QuotasPanel />
      </el-tab-pane>
      <el-tab-pane name="mcp" lazy>
        <template #label><span class="ent-tab-label"><el-icon :size="14"><Connection /></el-icon>MCP</span></template>
        <McpPanel />
      </el-tab-pane>
      <el-tab-pane name="runtime" lazy>
        <template #label><span class="ent-tab-label"><el-icon :size="14"><Monitor /></el-icon>工作节点</span></template>
        <RuntimePanel />
      </el-tab-pane>
      <el-tab-pane name="audit" lazy>
        <template #label><span class="ent-tab-label"><el-icon :size="14"><Document /></el-icon>管理审计</span></template>
        <AuditPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref } from 'vue';
import {
  Clock, Coin, Connection, Document, Files, Monitor, OfficeBuilding,
  Refresh, TrendCharts, User,
} from '@element-plus/icons-vue';
import { enterpriseApi, type EnterpriseOverview } from '../../api/enterprise';
import ResourcesPanel from './enterprise/ResourcesPanel.vue';
import QuotasPanel from './enterprise/QuotasPanel.vue';
import McpPanel from './enterprise/McpPanel.vue';
import RuntimePanel from './enterprise/RuntimePanel.vue';
import AuditPanel from './enterprise/AuditPanel.vue';
import EntEmpty from './enterprise/EntEmpty.vue';

const ICONS = {
  user: markRaw(User), rule: markRaw(Document), mcp: markRaw(Connection),
  node: markRaw(Monitor), cost: markRaw(Coin),
};

const activeTab = ref('overview');
const loading = ref(false);
const lastUpdated = ref('');
const overview = ref<EnterpriseOverview | null>(null);

const c = computed(() => overview.value?.counts || ({} as Record<string, number>));

const statCards = computed(() => {
  const online = Number(c.value.runtimeOnline || 0);
  const nodes = Number(c.value.runtimeNodes || 0);
  return [
    { key: 'users', label: '成员', value: c.value.users ?? 0, prefix: '', unit: '', tone: 'indigo', featured: false,
      icon: ICONS.user, hint: `${c.value.orgs ?? 0} 个组织 · ${c.value.roles ?? 0} 个角色`, badge: '', progress: undefined },
    { key: 'rules', label: '团队规则', value: c.value.rules ?? 0, prefix: '', unit: '', tone: 'sky', featured: false,
      icon: ICONS.rule, hint: '系统 / 专家 / 用户规则', badge: '', progress: undefined },
    { key: 'mcp', label: 'MCP 连接', value: c.value.mcpConnectors ?? 0, prefix: '', unit: '', tone: 'teal', featured: false,
      icon: ICONS.mcp, hint: '集中凭证与独立凭证', badge: '', progress: undefined },
    { key: 'nodes', label: '工作节点', value: `${online}/${nodes}`, prefix: '', unit: '', tone: 'amber', featured: false,
      icon: ICONS.node, hint: `${c.value.workspaces ?? 0} 个活跃工作区`, badge: nodes ? `${Math.round(online / nodes * 100)}% 在线` : '',
      progress: nodes ? Math.round(online / nodes * 100) : 0 },
    { key: 'cost', label: '近 30 天模型费用', value: Number(overview.value?.usage.totalCny30d || 0).toFixed(2),
      prefix: '¥', unit: '', tone: 'violet', featured: true,
      icon: ICONS.cost, hint: `${overview.value?.usage.totalCalls30d ?? 0} 次模型调用`, badge: '30 天', progress: undefined },
  ];
});

const trend = computed(() => {
  const rows = (overview.value?.usage.usageByDay || []).slice(-30);
  const max = Math.max(1, ...rows.map((r) => Number(r.cost_cny || 0)));
  return rows.map((r) => ({ ...r, h: Math.max(4, Math.round(Number(r.cost_cny || 0) / max * 100)) }));
});

const topModels = computed(() => {
  const rows = (overview.value?.usage.topModels || []).slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => Number(r.cost_cny || 0)));
  return rows.map((r) => ({ ...r, pct: Math.max(4, Math.round(Number(r.cost_cny || 0) / max * 100)) }));
});

const recentAudit = computed(() => (overview.value?.audit || []).slice(0, 10));

function formatTime(v: number | null | undefined) {
  return v ? new Date(v).toLocaleString() : '-';
}

async function reload() {
  loading.value = true;
  try {
    overview.value = await enterpriseApi.overview();
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
/* ★ 变量别名收口：企业工作台 5 个子面板大量引用了从未定义的
   --color-bg-secondary / --color-text-primary，导致卡片背景声明整条失效
   （表现就是"卡片没有层次、像一张长纸"）。在这里一次性补齐，子面板零改动即生效。 */
.enterprise-page {
  --color-bg-secondary: var(--color-surface);
  --color-text-primary: var(--color-text);
  min-height: 100%;
  padding-bottom: var(--space-5);
}

/* ===== 页头 ===== */
.ent-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); }
.ent-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.ent-brand-mark {
  flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 55%, #9333EA));
  box-shadow: 0 8px 20px -8px var(--color-primary-ring);
}
.ent-brand-text { min-width: 0; }
.ent-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: var(--color-text-tertiary); }
.ent-brand-text h1 { margin: 2px 0 3px; font-size: 21px; font-weight: 650; line-height: 1.25; color: var(--color-text); }
.ent-brand-text p { margin: 0; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.ent-header-actions { display: flex; align-items: center; gap: var(--space-3); flex: none; }
.ent-updated { display: inline-flex; align-items: center; gap: 5px; font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

/* ===== 指标卡 ===== */
.ent-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: var(--space-5); }
.ent-stat {
  position: relative; min-width: 0; padding: 15px 16px 14px; border: 1px solid var(--color-border);
  border-radius: 12px; background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .03), 0 10px 24px -18px rgba(16, 24, 40, .28);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  overflow: hidden;
}
.ent-stat::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--tone); opacity: .85; }
.ent-stat:hover { transform: translateY(-2px); border-color: var(--color-border-strong); box-shadow: 0 4px 10px rgba(16, 24, 40, .06), 0 16px 30px -20px rgba(16, 24, 40, .4); }
.ent-stat.is-featured { background: linear-gradient(150deg, var(--color-primary-soft), var(--color-surface) 62%); }
.tone-indigo { --tone: #4F46E5; --tone-soft: #EEF0FF; }
.tone-sky { --tone: #0EA5E9; --tone-soft: #E8F6FE; }
.tone-teal { --tone: #10B981; --tone-soft: #E7F8F2; }
.tone-amber { --tone: #F59E0B; --tone-soft: #FEF4E2; }
.tone-violet { --tone: #8B5CF6; --tone-soft: #F2ECFF; }
.ent-stat-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ent-stat-label { font-size: var(--font-size-sm); font-weight: 500; color: var(--color-text-secondary); }
.ent-stat-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--tone-soft); color: var(--tone); }
.ent-stat-value { margin: 10px 0 4px; font-family: var(--font-mono); font-size: 27px; font-weight: 650; line-height: 1.1; letter-spacing: -.02em; color: var(--color-text); font-variant-numeric: tabular-nums; }
.ent-stat-value em { font-style: normal; font-size: 17px; margin-right: 2px; color: var(--color-text-secondary); }
.ent-stat-value small { font-size: 13px; margin-left: 3px; color: var(--color-text-secondary); }
.is-featured .ent-stat-value { color: var(--color-primary); }
.ent-stat-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 18px; font-size: 11px; color: var(--color-text-tertiary); }
.ent-stat-foot > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-stat-badge { flex: none; padding: 1px 7px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 10px; font-weight: 600; }
.ent-stat-track { margin-top: 8px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--tone) 14%, transparent); overflow: hidden; }
.ent-stat-track i { display: block; height: 100%; border-radius: inherit; background: var(--tone); transition: width .3s ease; }
.ent-stat-skeleton { height: 120px; background: linear-gradient(100deg, var(--color-surface) 30%, var(--color-surface-hover) 50%, var(--color-surface) 70%); background-size: 220% 100%; animation: ent-shine 1.5s infinite; }
.ent-stat-skeleton::before { display: none; }
@keyframes ent-shine { to { background-position-x: -220%; } }

/* ===== 标签栏（胶囊式） ===== */
.ent-tabs :deep(.el-tabs__header) { margin: 0 0 16px; }
.ent-tabs :deep(.el-tabs__nav-wrap::after) { display: none; }
.ent-tabs :deep(.el-tabs__nav) { display: inline-flex; gap: 3px; padding: 4px; border: 1px solid var(--color-border); border-radius: 11px; background: var(--color-surface-hover); }
.ent-tabs :deep(.el-tabs__active-bar) { display: none; }
.ent-tabs :deep(.el-tabs__item) { height: 34px; line-height: 34px; padding: 0 15px; border-radius: 8px; font-size: var(--font-size-base); color: var(--color-text-secondary); transition: all .16s ease; }
.ent-tabs :deep(.el-tabs__item:hover) { color: var(--color-primary); }
.ent-tabs :deep(.el-tabs__item.is-active) { background: var(--color-surface); color: var(--color-primary); font-weight: 600; box-shadow: 0 1px 3px rgba(16, 24, 40, .1); }
.ent-tab-label { display: inline-flex; align-items: center; gap: 6px; }

/* ===== 卡片 / 概览 ===== */
.ent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ent-card { min-width: 0; padding: 16px 18px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); box-shadow: 0 1px 2px rgba(16, 24, 40, .03), 0 10px 24px -18px rgba(16, 24, 40, .28); }
.ent-card.span-2 { grid-column: span 2; }
.ent-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: 14px; }
.ent-card-head h3 { margin: 0 0 3px; font-size: var(--font-size-md); font-weight: 600; color: var(--color-text); }
.ent-card-head p { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-tertiary); }
.ent-chip { flex: none; padding: 3px 9px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 11px; font-weight: 600; font-family: var(--font-mono); }

.ent-chart { display: flex; align-items: flex-end; gap: 3px; height: 108px; padding-top: 6px; border-bottom: 1px solid var(--color-border); }
.ent-chart-col { flex: 1; min-width: 3px; height: 100%; display: flex; align-items: flex-end; }
.ent-chart-col i { display: block; width: 100%; min-height: 3px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 35%, transparent)); transition: opacity .15s ease; }
.ent-chart-col:hover i { opacity: .62; }
.ent-chart-axis { display: flex; justify-content: space-between; margin-top: 7px; font-size: 10px; color: var(--color-text-tertiary); font-family: var(--font-mono); }

.ent-rank { display: flex; flex-direction: column; gap: 13px; }
.ent-rank-row { display: flex; align-items: center; gap: 11px; }
.ent-rank-no { flex: none; width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: var(--color-surface-hover); color: var(--color-text-tertiary); font-size: 11px; font-weight: 700; font-family: var(--font-mono); }
.ent-rank-no.top { background: var(--color-primary-soft); color: var(--color-primary); }
.ent-rank-main { flex: 1; min-width: 0; }
.ent-rank-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; font-size: var(--font-size-sm); }
.ent-rank-top b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--color-text); }
.ent-rank-top span { flex: none; font-family: var(--font-mono); color: var(--color-text-secondary); }
.ent-rank-track { height: 5px; border-radius: 999px; background: var(--color-surface-hover); overflow: hidden; }
.ent-rank-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 45%, #8B5CF6)); }

.ent-timeline { display: flex; flex-direction: column; }
.ent-tl-row { position: relative; display: flex; gap: 12px; padding: 0 0 14px 2px; }
.ent-tl-row:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 14px; bottom: 0; width: 1px; background: var(--color-border); }
.ent-tl-dot { position: relative; z-index: 1; flex: none; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--color-surface); border: 2px solid var(--color-primary); }
.ent-tl-body { flex: 1; min-width: 0; padding-bottom: 2px; }
.ent-tl-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.ent-tl-title b { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-tl-title time { flex: none; font-size: 10px; color: var(--color-text-tertiary); font-family: var(--font-mono); }
.ent-tl-meta { margin-top: 2px; font-size: 11px; color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ===== 子面板统一的 Element Plus 皮肤（一处收口，5 个子组件零改动） ===== */
.enterprise-page :deep(.panel) { border-radius: 12px; border-color: var(--color-border); box-shadow: 0 1px 2px rgba(16, 24, 40, .03); }
.enterprise-page :deep(.toolbar) { align-items: center; padding: 2px 0 2px; }
.enterprise-page :deep(.el-table) { --el-table-border-color: var(--color-border); --el-table-header-bg-color: color-mix(in srgb, var(--color-bg) 60%, var(--color-surface)); border-radius: 8px; overflow: hidden; }
.enterprise-page :deep(.el-table th.el-table__cell) { font-size: 11.5px; font-weight: 600; color: var(--color-text-secondary); }
.enterprise-page :deep(.el-table .cell) { font-size: var(--font-size-sm); }
.enterprise-page :deep(.el-table__body tr:hover > td.el-table__cell) { background: var(--color-primary-soft) !important; }

@media (max-width: 1200px) { .ent-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) {
  .ent-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ent-grid { grid-template-columns: 1fr; }
  .ent-card.span-2 { grid-column: span 1; }
  .ent-header { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 560px) { .ent-stats { grid-template-columns: 1fr 1fr; } }
</style>
