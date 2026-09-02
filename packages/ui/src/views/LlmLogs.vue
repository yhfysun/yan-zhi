<template>
  <div class="page logs-page">
    <!-- 顶栏 -->
    <div class="logs-header">
      <div class="page-info">
        <h2 class="page-title">LLM 交互日志</h2>
        <p class="page-sub">查看每次与大模型交互的信息，按用户 / 会话 / 模型统计</p>
      </div>
      <div class="logs-header-actions">
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Download" @click="exportCsv">导出 CSV</el-button>
      </div>
    </div>

    <!-- 汇总卡片 -->
    <div class="overview-grid">
      <div class="ov-card">
        <div class="ov-icon primary"><el-icon :size="20"><ChatDotRound /></el-icon></div>
        <div class="ov-meta">
          <div class="ov-value">{{ fmtNum(overview.calls) }}</div>
          <div class="ov-label">交互次数</div>
        </div>
      </div>
      <div class="ov-card">
        <div class="ov-icon warn"><el-icon :size="20"><Coin /></el-icon></div>
        <div class="ov-meta">
          <div class="ov-value">{{ fmtNum(overview.tokens) }}</div>
          <div class="ov-label">Token 消耗</div>
        </div>
      </div>
      <div class="ov-card">
        <div class="ov-icon success"><el-icon :size="20"><ChatLineRound /></el-icon></div>
        <div class="ov-meta">
          <div class="ov-value">{{ fmtNum(overview.conversations) }}</div>
          <div class="ov-label">会话数</div>
        </div>
      </div>
      <div class="ov-card">
        <div class="ov-icon purple"><el-icon :size="20"><User /></el-icon></div>
        <div class="ov-meta">
          <div class="ov-value">{{ fmtNum(overview.users) }}</div>
          <div class="ov-label">用户数</div>
        </div>
      </div>
    </div>

    <!-- 筛选区（固定顶部，不随列表滚动） -->
    <div class="logs-filters">
      <div class="filters-row">
        <el-select v-model="filters.userId" placeholder="全部用户" clearable class="f-filter" @change="applyFilters">
          <el-option v-for="u in options.users" :key="u.id" :label="`${u.username} (${u.cnt})`" :value="u.id" />
        </el-select>
        <el-select v-model="filters.conversationId" placeholder="全部会话" clearable filterable class="f-filter f-grow" @change="applyFilters">
          <el-option v-for="c in options.conversations" :key="c.id" :label="`${c.title}${c.username ? ' · ' + c.username : ''} (${c.cnt})`" :value="c.id" />
        </el-select>
        <el-select v-model="filters.modelId" placeholder="全部模型" clearable class="f-filter" @change="applyFilters">
          <el-option v-for="m in options.models" :key="m.id || 'null'" :label="`${m.alias || m.name || '未知'}${m.platform_name ? ' · ' + m.platform_name : ''} (${m.cnt})`" :value="m.id" />
        </el-select>
        <el-select v-model="filters.subAgent" placeholder="智能体" clearable class="f-filter" @change="applyFilters">
          <el-option label="主智能体" value="0" />
          <el-option label="子智能体" value="1" />
        </el-select>
        <el-select v-model="filters.range" placeholder="时间范围" class="f-filter" @change="applyFilters">
          <el-option label="全部时间" value="" />
          <el-option label="近 24 小时" value="24h" />
          <el-option label="近 7 天" value="7d" />
          <el-option label="近 30 天" value="30d" />
        </el-select>
      </div>
      <div class="filters-row">
        <div class="f-keyword-wrap">
          <el-icon class="f-kw-icon"><Search /></el-icon>
          <input v-model="filters.keyword" placeholder="搜索响应内容 / 会话标题..." class="f-keyword" @keyup.enter="applyFilters" />
        </div>
        <el-button :icon="Search" @click="applyFilters">查询</el-button>
      </div>
    </div>

    <!-- 统计 tab -->
    <div class="stats-section">
      <el-radio-group v-model="statsBy" size="small" @change="loadStats">
        <el-radio-button label="user">按用户</el-radio-button>
        <el-radio-button label="conversation">按会话</el-radio-button>
        <el-radio-button label="model">按模型</el-radio-button>
      </el-radio-group>
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>名称</th>
              <th v-if="statsBy !== 'model'">所属用户</th>
              <th v-if="statsBy === 'model'">平台</th>
              <th>交互次数</th>
              <th>子智能体</th>
              <th>Token 消耗</th>
              <th>最近交互</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="statsLoading"><td colspan="8" class="stats-empty"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</td></tr>
            <tr v-else-if="stats.length === 0"><td colspan="8" class="stats-empty">暂无数据</td></tr>
            <tr v-for="(s, i) in stats" :key="s.key">
              <td class="t-index">{{ i + 1 }}</td>
              <td class="t-name">{{ s.name || '（无标题）' }}</td>
              <td v-if="statsBy !== 'model'">{{ s.username || 'guest' }}</td>
              <td v-if="statsBy === 'model'">{{ s.platform_name || '-' }}</td>
              <td class="t-num">{{ fmtNum(s.calls) }}</td>
              <td class="t-num">{{ fmtNum(s.subAgentCalls) }}</td>
              <td class="t-num t-tokens">{{ fmtNum(s.tokens) }}</td>
              <td class="t-time">{{ s.lastAt ? fmtTime(s.lastAt) : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 交互明细列表（独立滚动） -->
    <div class="logs-list">
      <div class="logs-list-head">
        <span class="ll-count">共 {{ total }} 条交互</span>
      </div>
      <el-empty v-if="!loading && items.length === 0" description="暂无交互日志" :image-size="90" />
      <div v-for="it in items" :key="it.id" class="log-item">
        <div class="log-item-head" @click="toggle(it.id)">
          <span class="li-time">{{ fmtTime(it.created_at) }}</span>
          <span class="li-user">{{ it.username || 'guest' }}</span>
          <span class="li-conv" :title="it.conv_title">{{ it.conv_title || '（无标题会话）' }}</span>
          <span v-if="it.sub_agent_name" class="li-badge sub">{{ it.sub_agent_name }}</span>
          <span class="li-model" :title="`${it.model_alias || it.model_name || '未知模型'}${it.platform_name ? ' · ' + it.platform_name : ''}`">
            {{ it.model_alias || it.model_name || '未知模型' }}
          </span>
          <span class="li-tokens">{{ fmtNum(it.tokens) }} tok</span>
          <el-icon class="li-arrow" :class="{ open: expanded[it.id] }"><ArrowDown /></el-icon>
        </div>
        <div v-if="expanded[it.id]" class="log-item-body">
          <div v-if="it.reasoning_content" class="lb-block">
            <div class="lb-title">思考过程</div>
            <pre class="lb-pre reasoning">{{ it.reasoning_content }}</pre>
          </div>
          <div class="lb-block">
            <div class="lb-title">模型响应</div>
            <pre class="lb-pre response">{{ it.content || '（空）' }}</pre>
          </div>
          <div v-if="it.tool_calls_json" class="lb-block">
            <div class="lb-title">工具调用</div>
            <pre class="lb-pre tools">{{ fmtJson(it.tool_calls_json) }}</pre>
          </div>
          <div class="lb-block">
            <div class="lb-title">系统提示词</div>
            <pre class="lb-pre system">{{ it.system_prompt_snapshot ? fmtSnapshot(it.system_prompt_snapshot) : '（未记录）' }}</pre>
          </div>
        </div>
      </div>

      <div v-if="total > pageSize" class="logs-pager">
        <el-pagination
          layout="prev, pager, next, total"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          background
          @current-change="onPage"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  Refresh, Download, Search, User, ChatDotRound, ChatLineRound, Coin,
  ArrowDown, Loading,
} from '@element-plus/icons-vue';
import { api } from '../api/client';

const loading = ref(false);
const statsLoading = ref(false);
const items = ref<any[]>([]);
const stats = ref<any[]>([]);
const overview = reactive({ calls: 0, tokens: 0, conversations: 0, users: 0 });
const options = reactive<{ users: any[]; conversations: any[]; models: any[] }>({ users: [], conversations: [], models: [] });
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const expanded = reactive<Record<string, boolean>>({});

const filters = reactive<{ userId: string; conversationId: string; modelId: string; subAgent: string; range: string; keyword: string }>({
  userId: '', conversationId: '', modelId: '', subAgent: '', range: '', keyword: '',
});
const statsBy = ref('user');

function fmtNum(n: any): string {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(v);
}
function fmtTime(ts: any): string {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function fmtJson(j: any): string {
  try { return JSON.stringify(JSON.parse(j), null, 2); } catch { return String(j); }
}
function fmtSnapshot(s: string): string {
  try {
    const p = JSON.parse(s);
    if (p && typeof p === 'object' && typeof p.systemPrompt === 'string') return p.systemPrompt;
  } catch {}
  return s;
}

function buildParams(): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.userId) p.userId = filters.userId;
  if (filters.conversationId) p.conversationId = filters.conversationId;
  if (filters.modelId) p.modelId = filters.modelId;
  if (filters.subAgent !== '') p.subAgent = filters.subAgent;
  if (filters.keyword) p.keyword = filters.keyword;
  const now = Date.now();
  if (filters.range === '24h') p.from = String(now - 24 * 3600 * 1000);
  else if (filters.range === '7d') p.from = String(now - 7 * 24 * 3600 * 1000);
  else if (filters.range === '30d') p.from = String(now - 30 * 24 * 3600 * 1000);
  return p;
}

async function loadOptions() {
  const r = await api.get('/llm/logs/options');
  if (r && (r as any).data) {
    const d = (r as any).data;
    options.users = d.users || [];
    options.conversations = d.conversations || [];
    options.models = d.models || [];
  }
}

async function loadOverview() {
  const p = buildParams();
  const qs = new URLSearchParams(p).toString();
  const r = await api.get(`/llm/logs/overview${qs ? '?' + qs : ''}`);
  if (r && (r as any).data) Object.assign(overview, (r as any).data);
}

async function loadStats() {
  statsLoading.value = true;
  const p = buildParams();
  p.by = statsBy.value;
  const qs = new URLSearchParams(p).toString();
  const r = await api.get(`/llm/logs/stats?${qs}`);
  stats.value = r && (r as any).data ? (r as any).data : [];
  statsLoading.value = false;
}

async function loadItems() {
  loading.value = true;
  const p = buildParams();
  p.limit = String(pageSize);
  p.offset = String((page.value - 1) * pageSize);
  const qs = new URLSearchParams(p).toString();
  const r = await api.get(`/llm/logs?${qs}`);
  if (r && (r as any).data) {
    const d = (r as any).data;
    items.value = d.items || [];
    total.value = d.total || 0;
  } else {
    items.value = [];
    total.value = 0;
  }
  loading.value = false;
}

function applyFilters() {
  page.value = 1;
  loadOverview();
  loadStats();
  loadItems();
}

function onPage(p: number) {
  page.value = p;
  loadItems();
}

function toggle(id: string) {
  expanded[id] = !expanded[id];
}

function reload() {
  loadOptions();
  applyFilters();
}

function exportCsv() {
  const head = ['时间', '用户', '会话', '模型', '子智能体', 'Tokens', '响应内容'];
  const lines = items.value.map((it) => [
    fmtTime(it.created_at),
    it.username || 'guest',
    (it.conv_title || '').replace(/[",\n]/g, ' '),
    (it.model_alias || it.model_name || '未知模型').replace(/,/g, ' '),
    it.sub_agent_name || '',
    it.tokens || 0,
    (it.content || '').replace(/[\n\r]+/g, ' ').replace(/,/g, '，'),
  ].join(','));
  const csv = '\uFEFF' + [head.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-logs-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  reload();
});
</script>

<style scoped>
.logs-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 32px;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.page-title { font-size: 22px; font-weight: 700; margin: 0; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); margin: 4px 0 0; }
.logs-header-actions { display: flex; gap: 8px; }

/* 汇总卡片 */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.ov-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
}
.ov-icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ov-icon.primary { background: rgba(64,158,255,.12); color: #409eff; }
.ov-icon.warn { background: rgba(230,162,60,.14); color: #e6a23c; }
.ov-icon.success { background: rgba(103,194,58,.13); color: #67c23a; }
.ov-icon.purple { background: rgba(124,58,237,.12); color: var(--color-primary); }
.ov-value { font-size: 24px; font-weight: 700; line-height: 1.1; color: var(--color-text); }
.ov-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }

/* 筛选区 */
.logs-filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--glass-border);
  margin-bottom: 16px;
  flex-shrink: 0;
}
.filters-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.f-filter { width: 170px; }
.f-grow { flex: 1; min-width: 200px; }
.f-keyword-wrap {
  flex: 1; min-width: 220px;
  display: flex; align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--el-bg-color-page, rgba(0,0,0,0.02));
}
.f-keyword { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: var(--color-text); }
.f-kw-icon { color: var(--color-text-secondary); }

/* 统计 */
.stats-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.stats-table-wrap {
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  overflow: auto;
  max-height: 240px;
  background: var(--el-bg-color, #fff);
}
.stats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stats-table th {
  position: sticky; top: 0;
  background: var(--el-bg-color, #fff);
  padding: 10px 12px;
  text-align: left;
  font-weight: 700;
  font-size: 12.5px;
  color: var(--color-text);
  border-bottom: 1px solid var(--glass-border);
  z-index: 1;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.stats-table td { padding: 9px 12px; border-bottom: 1px solid var(--glass-border); color: var(--color-text); }
.stats-table tr:last-child td { border-bottom: none; }
.stats-table tr:hover td { background: var(--glass-bg-hover); }
.stats-empty { text-align: center; color: var(--color-text-secondary); padding: 20px 12px !important; }
.t-index { color: var(--color-text-secondary); width: 40px; }
.t-name { font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t-num { text-align: right; width: 90px; font-variant-numeric: tabular-nums; font-weight: 600; }
.t-tokens { font-weight: 700; color: var(--color-primary); }
.t-time { color: var(--color-text); width: 150px; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* 交互明细列表 */
.logs-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}
.logs-list-head { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 2px; flex-shrink: 0; }
.log-item {
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  flex-shrink: 0;
  overflow: hidden;
}
.log-item-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  cursor: pointer;
  font-size: 13px;
  flex-wrap: wrap;
}
.log-item-head:hover { background: var(--glass-bg-hover); }
.li-time { color: var(--color-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.li-user {
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(124,58,237,.12);
  color: var(--color-primary);
  white-space: nowrap;
}
.li-conv { font-weight: 500; flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }
.li-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.li-badge.sub { background: rgba(103,194,58,.15); color: #3f9d2f; }
.li-model {
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(100,116,139,.1);
}
.li-tokens { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; color: var(--color-text); }
.li-arrow { color: var(--color-text-secondary); transition: transform .18s ease; }
.li-arrow.open { transform: rotate(180deg); }

.log-item-body {
  border-top: 1px solid var(--glass-border);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--el-bg-color-page, rgba(0,0,0,0.015));
}
.lb-title { font-size: 12px; font-weight: 700; color: var(--color-text); margin-bottom: 6px; }
.lb-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-blank, #fff);
  border: 1px solid var(--glass-border);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
  overflow: auto;
  color: var(--color-text);
}
/* 内容块仅靠标签文字区分，不叠加易致对比度不足的 tint 底色 */
.lb-pre.reasoning { color: var(--color-text); background: var(--el-fill-color-blank, #fff); }
.lb-pre.tools { color: var(--color-text); background: var(--el-fill-color-blank, #fff); }
.lb-pre.system { color: var(--color-text); background: var(--el-fill-color-blank, #fff); }

.logs-pager { display: flex; justify-content: center; padding: 12px 0; flex-shrink: 0; }

/* —— 深色模式配色适配：保证数据/图标可读（背景深、文字浅） —— */
[data-theme="dark"] .ov-icon.primary { background: rgba(96,165,250,.18); color: #7fb2ff; }
[data-theme="dark"] .ov-icon.warn { background: rgba(245,158,11,.2); color: #fbbf24; }
[data-theme="dark"] .ov-icon.success { background: rgba(34,197,94,.18); color: #4ade80; }
[data-theme="dark"] .ov-icon.purple { background: rgba(167,139,250,.18); color: #c4b5fd; }
[data-theme="dark"] .li-user { background: rgba(167,139,250,.18); color: #e9d5ff; }
[data-theme="dark"] .li-model { background: rgba(148,163,184,.18); color: #f1f5f9; }
[data-theme="dark"] .li-badge.sub { background: rgba(34,197,94,.2); color: #4ade80; }
[data-theme="dark"] .t-tokens { color: #c4b5fd; }
[data-theme="dark"] .ov-card,
[data-theme="dark"] .logs-filters,
[data-theme="dark"] .stats-table-wrap,
[data-theme="dark"] .stats-table th,
[data-theme="dark"] .log-item { background: var(--el-fill-color-blank, #181a24); }
[data-theme="dark"] .lb-pre { border-color: var(--el-border-color); background: var(--el-fill-color-blank, #181a24); }
[data-theme="dark"] .log-item-body { background: var(--el-fill-color-blank, #181a24); }
[data-theme="dark"] .lb-title { color: var(--color-text); }
</style>
