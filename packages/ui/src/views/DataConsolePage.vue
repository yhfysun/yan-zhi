<template>
  <div class="page dw-root dc-root">
    <!-- 顶栏：数据源 + 只读护栏 + 执行按钮 -->
    <div class="dc-bar">
      <el-select
        v-model="activeDsId"
        placeholder="选择数据源"
        class="dc-ds-select"
        size="small"
        @change="onDsChange"
      >
        <el-option
          v-for="ds in dsList" :key="ds.id"
          :value="ds.id"
          :label="`${ds.name}（${typeLabel(ds.type)}）`"
        >
          <span class="dc-ds-opt">
            <span class="ds-dot" :class="ds.status === 'ok' ? 'ok' : ds.status === 'error' ? 'err' : 'neut'" />
            {{ ds.name }}（{{ typeLabel(ds.type) }}）
          </span>
        </el-option>
      </el-select>

      <span class="dc-guard" :class="{ write: activeDs?.allowWrite }">
        <el-icon><Lock /></el-icon>
        {{ activeDs?.allowWrite ? '写已开启 · 写语句仍走数据编辑通道' : '只读护栏' }}
      </span>
      <span class="dc-limits">上限 {{ maxRows }} 行 · 超时 {{ timeoutSec }}s · DDL 一律拒绝</span>

      <span class="dc-bar-spacer" />
      <el-button size="small" @click="formatSql">格式化</el-button>
      <el-tooltip
        :disabled="!!activeDs?.allowWrite"
        content="该数据源未开启写操作。请先在数据源设置中允许写入。"
        placement="bottom"
      >
        <span class="dc-write-action">
          <el-button
            size="small"
            :disabled="!activeDs?.allowWrite"
            :loading="editChecking || editApplying"
            @click="preflightEdit"
          >
            <el-icon><EditPen /></el-icon>数据编辑
          </el-button>
        </span>
      </el-tooltip>
      <el-button size="small" :disabled="!activeDsId" @click="openAudits">
        <el-icon><Document /></el-icon>审计
      </el-button>
      <el-button size="small" :loading="running" @click="run('current')">
        运行选中 <kbd class="kbd">⌃↵</kbd>
      </el-button>
      <el-button size="small" type="primary" :loading="running" @click="run('all')">
        <el-icon><VideoPlay /></el-icon>全部运行 <kbd class="kbd on">⌃⇧↵</kbd>
      </el-button>
    </div>

    <div class="dc-body">
      <!-- 左：schema 树 -->
      <aside class="dc-tree">
        <div class="dc-tree-filters">
          <el-input v-model="schemaFilter" placeholder="搜索表 / 列" size="small" clearable :prefix-icon="Search" />
          <el-select v-model="schemaKindFilter" size="small" class="dc-kind-select">
            <el-option label="全部" value="" />
            <el-option label="表" value="table" />
            <el-option label="视图" value="view" />
          </el-select>
        </div>
        <div class="dc-tree-scroll">
          <div v-if="schemaLoading" class="dc-tree-empty">加载结构中…</div>
          <div v-else-if="!filteredTables.length" class="dc-tree-empty">
            {{ activeDs ? '没有匹配的表' : '先在上方选择数据源' }}
          </div>
          <div v-for="t in filteredTables" :key="t.name" class="dc-tbl">
            <button class="dc-tbl-head" type="button" @click="t._open = !t._open">
              <el-icon class="chev" :class="{ open: t._open }"><ArrowRight /></el-icon>
              <span class="dw-mono">{{ t.name }}</span>
              <span class="dc-tbl-kind">{{ t.kind === 'view' ? '视图' : t.columns.length + '列' }}</span>
            </button>
            <div v-if="t._open" class="dc-cols">
              <button
                v-for="c in t.columns" :key="c.name"
                class="dc-col" type="button"
                :title="`${c.type}${c.comment ? ' · ' + c.comment : ''}`"
                @click="insertName(c.name)"
              >
                <span class="dw-mono">{{ c.name }}</span>
                <span class="dc-col-type">{{ c.pk ? 'PK' : c.type }}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右：编辑器 + 结果 -->
      <div class="dc-main">
        <!-- 深色仪器面板 -->
        <div class="dc-editor">
          <div class="dc-ed-bar">
            <span>query.sql</span>
            <span v-if="activeDs" class="dw-mono">{{ typeLabel(activeDs.type) }}</span>
            <span style="color: #4a5060">|</span>
            <span>{{ statementCount }} 条语句 · 光标第 {{ cursorStmtIndex || '—' }} 条</span>
            <span style="flex: 1" />
            <span class="dc-ed-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 选中/光标 · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> 全部</span>
          </div>
          <div class="dc-ed-body">
            <div ref="gutterEl" class="dc-gutter dw-mono"><div v-for="n in lineCount" :key="n">{{ n }}</div></div>
            <div class="dc-ed-area">
              <pre ref="hlEl" class="dc-hl dw-mono" aria-hidden="true" v-html="highlightHtml"></pre>
              <textarea
                ref="editorEl"
                v-model="editorText"
                class="dc-textarea dw-mono"
                spellcheck="false"
                wrap="off"
                placeholder="-- 输入 SQL；Ctrl+Enter 运行选中段，Ctrl+Shift+Enter 运行全部"
                @scroll="syncGutter"
                @click="syncCursor"
                @keyup="syncCursor"
                @select="syncCursor"
                @keydown.ctrl.enter.prevent="onCtrlEnter"
                @keydown.meta.enter.prevent="onCtrlEnter"
              />
            </div>
          </div>
        </div>

        <!-- 结果区 -->
        <div class="dc-results">
          <div v-if="!results.length" class="dc-res-empty">
            {{ running ? '执行中…' : '结果将显示在这里' }}
          </div>
          <template v-else>
            <div class="dc-res-tabs">
              <button
                v-for="(r, i) in results" :key="i"
                class="dc-res-tab" :class="{ on: i === activeResult, [`st-${r.status}`]: true }"
                type="button"
                @click="activeResult = i"
              >
                <span class="dc-dot" />语句 {{ i + 1 }}
              </button>
              <span style="flex: 1" />
              <span v-if="totalMs" class="dc-res-total">共 {{ totalMs }} ms</span>
              <el-button v-if="activeResultData?.status === 'ok'" size="small" text @click="exportCsv">
                导出 CSV
              </el-button>
            </div>

            <!-- 单语句结果 -->
            <div v-if="activeResultData" class="dc-res-pane">
              <div v-if="activeResultData.status !== 'ok'" class="dc-res-err" :class="`st-${activeResultData.status}`">
                <b>{{ statusLabel(activeResultData.status) }}</b>
                <p>{{ activeResultData.error }}</p>
                <pre v-if="activeResultData.text" class="dw-mono">{{ activeResultData.text }}</pre>
              </div>
              <template v-else>
                <div class="dc-grid-wrap">
                  <table class="dc-grid">
                    <thead>
                      <tr>
                        <th class="dc-rownum">#</th>
                        <th v-for="c in activeResultData.columns" :key="c" class="dw-mono">{{ c }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in activeResultData.rows" :key="ri">
                        <td class="dc-rownum">{{ ri + 1 }}</td>
                        <td
                          v-for="c in activeResultData.columns" :key="c"
                          :class="{ 'is-null': row[c] === null || row[c] === undefined }"
                        >{{ row[c] === null || row[c] === undefined ? 'NULL' : formatCell(row[c]) }}</td>
                      </tr>
                      <tr v-if="!activeResultData.rows?.length">
                        <td :colspan="(activeResultData.columns?.length || 0) + 1" class="dc-grid-empty">
                          空结果（0 行）
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="dc-res-foot">
                  <span>{{ activeResultData.rowCount }} 行</span>
                  <span>{{ activeResultData.latencyMs }} ms</span>
                  <span v-if="activeResultData.truncated" style="color: var(--dw-caution)">
                    已达上限截断 — 建议加 LIMIT 或调大行数上限
                  </span>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>

    <el-drawer v-model="auditOpen" size="min(760px, 94vw)" append-to-body>
      <template #header>
        <div class="dc-audit-head">
          <div>
            <b>数据编辑审计</b>
            <span v-if="activeDs"> · {{ activeDs.name }}</span>
          </div>
          <el-button
            text
            circle
            :icon="Refresh"
            :loading="auditLoading"
            aria-label="刷新数据编辑审计"
            title="刷新"
            @click="loadAudits"
          />
        </div>
      </template>
      <div v-loading="auditLoading" class="dc-audit">
        <div v-if="!auditLoading && !audits.length" class="dc-audit-empty" role="status">
          此数据源还没有数据编辑记录
        </div>
        <el-table v-else :data="audits" size="small" row-key="id" class="dc-audit-table">
          <el-table-column label="时间" width="152">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="动作" width="82">
            <template #default="{ row }">{{ actionLabel(row.action) }}</template>
          </el-table-column>
          <el-table-column label="SQL" min-width="240">
            <template #default="{ row }">
              <div class="dc-audit-sql dw-mono" :title="row.sql">{{ row.sql }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag size="small" :type="auditTagType(row.status)">
                {{ auditStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="影响行数" width="90" align="right">
            <template #default="{ row }">{{ row.affectedRows ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="错误" min-width="160">
            <template #default="{ row }">
              <span v-if="row.error" class="dc-audit-error">{{ row.error }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="audits.length" class="dc-audit-cards" role="list">
          <article v-for="row in audits" :key="row.id" class="dc-audit-card" role="listitem">
            <div class="dc-audit-card-head">
              <time :datetime="new Date(row.createdAt).toISOString()">{{ formatTime(row.createdAt) }}</time>
              <el-tag size="small" :type="auditTagType(row.status)">
                {{ auditStatusLabel(row.status) }}
              </el-tag>
            </div>
            <div class="dc-audit-card-meta">
              <span>{{ actionLabel(row.action) }}</span>
              <span>影响 {{ row.affectedRows ?? '—' }} 行</span>
            </div>
            <pre class="dc-audit-card-sql dw-mono">{{ row.sql }}</pre>
            <p v-if="row.error" class="dc-audit-card-error">{{ row.error }}</p>
          </article>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, ArrowRight, Document, EditPen, Lock, Refresh, VideoPlay } from '@element-plus/icons-vue';
import { api } from '../api/client';
import { statementAt, splitSqlStatements } from '@yan-zhi/shared';
import '../styles/data-workbench.css';
import './datasources.css';
import './console.css';

// ===== 数据源 =====
interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  allowWrite: boolean;
}
const TYPE_LABELS: Record<string, string> = {
  mysql: 'MySQL', postgres: 'PostgreSQL', dm: '达梦 DM', oracle: 'Oracle',
  sqlite: 'SQLite', project: '项目库', mongo: 'MongoDB', elastic: 'Elasticsearch',
};
const typeLabel = (t: string) => TYPE_LABELS[t] || t;

const dsList = ref<DataSourceInfo[]>([]);
const activeDsId = ref('');
const activeDs = computed(() => dsList.value.find((d) => d.id === activeDsId.value));

const maxRows = 500;
const timeoutSec = 30;

// ===== schema 树 =====
interface SchemaColumn { name: string; type: string; pk: boolean; comment?: string }
interface SchemaTable { name: string; kind: 'table' | 'view'; comment?: string; columns: SchemaColumn[]; _open?: boolean }
const tables = ref<SchemaTable[]>([]);
const schemaFilter = ref('');
/** 表/视图筛选：'' = 全部 */
const schemaKindFilter = ref('');
const schemaLoading = ref(false);

const filteredTables = computed(() => {
  const k = schemaFilter.value.trim().toLowerCase();
  // 类型筛选先于关键字：schema 里表/视图混排时，"只看表"是高频诉求
  const base = schemaKindFilter.value
    ? tables.value.filter((t) => (t.kind || 'table') === schemaKindFilter.value)
    : tables.value;
  if (!k) return base;
  return base
    .filter((t) => t.name.toLowerCase().includes(k) || t.columns.some((c) => c.name.toLowerCase().includes(k)))
    .map((t) => (t.name.toLowerCase().includes(k) ? t : { ...t, _open: true, columns: t.columns.filter((c) => c.name.toLowerCase().includes(k)) }));
});

async function onDsChange() {
  tables.value = [];
  results.value = [];
  activeResult.value = 0;
  auditOpen.value = false;
  audits.value = [];
  if (!activeDsId.value) return;
  schemaLoading.value = true;
  const res = await api.get<{ tables: SchemaTable[] }>(`/datasources/${activeDsId.value}/schema`);
  schemaLoading.value = false;
  if ('error' in res) return ElMessage.error(`加载结构失败：${res.error}`);
  tables.value = res.data.tables.map((t) => ({ ...t, _open: false }));
}

// ===== 编辑器 =====
const editorText = ref('');
const editorEl = ref<HTMLTextAreaElement | null>(null);
const gutterEl = ref<HTMLElement | null>(null);
const hlEl = ref<HTMLElement | null>(null);

const lineCount = computed(() => editorText.value.split('\n').length);
const statements = computed(() => splitSqlStatements(editorText.value));
const statementCount = computed(() => statements.value.length);

// 光标所在语句（1 起）；用于状态条与"选中段高亮/其余灰化"
const cursorOffset = ref(0);
const cursorStmtIndex = computed(() => {
  const list = statements.value;
  if (!list.length) return 0;
  const off = cursorOffset.value;
  const hit = list.findIndex((s) => off >= s.start && off <= s.end);
  if (hit >= 0) return hit + 1;
  let idx = 1;
  for (const s of list) if (off > s.end) idx += 1;
  return Math.min(idx, list.length);
});
function syncCursor() {
  const el = editorEl.value;
  if (el) cursorOffset.value = el.selectionStart;
}
const escHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
const highlightHtml = computed(() => {
  const raw = editorText.value;
  const list = statements.value;
  if (!list.length) return escHtml(raw);
  let out = '';
  let pos = 0;
  list.forEach((s, i) => {
    out += `<span class="rest">${escHtml(raw.slice(pos, s.start))}</span>`;
    const body = escHtml(raw.slice(s.start, s.end));
    out += i === cursorStmtIndex.value - 1 ? `<span class="cur">${body}</span>` : `<span class="rest">${body}</span>`;
    pos = s.end;
  });
  out += `<span class="rest">${escHtml(raw.slice(pos))}</span>`;
  return out;
});

function syncGutter() {
  if (gutterEl.value && editorEl.value) gutterEl.value.scrollTop = editorEl.value.scrollTop;
  if (hlEl.value && editorEl.value) {
    hlEl.value.scrollTop = editorEl.value.scrollTop;
    hlEl.value.scrollLeft = editorEl.value.scrollLeft;
  }
}

function insertName(name: string) {
  const el = editorEl.value;
  if (!el) return;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  const needsQuote = !/^[A-Za-z_][\w$]*$/.test(name);
  const token = needsQuote ? `"${name.replaceAll('"', '""')}"` : name;
  editorText.value = editorText.value.slice(0, s) + token + editorText.value.slice(e);
  nextTick(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = s + token.length;
  });
}

/** 简单格式化：掩掉字符串后关键字大写，语句间空行（不重排缩进，够控制台用） */
const FORMAT_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'INSERT INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE FROM', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN',
];
function formatSql() {
  const mask: string[] = [];
  const masked = editorText.value.replace(/'(?:[^']|'')*'/g, (m) => {
    mask.push(m);
    return `\u0000${mask.length - 1}\u0000`;
  });
  let out = masked;
  // 长词优先替换，避免 GROUP BY 被 GROUP 截断
  for (const kw of [...FORMAT_KEYWORDS].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${kw.replaceAll(' ', '\\s+')}\\b`, 'gi'), kw);
  }
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => mask[Number(i)]);
  editorText.value = splitSqlStatements(out).map((s) => s.text).join(';\n\n') + (splitSqlStatements(out).length ? ';' : '');
}

// ===== 执行 =====
interface ConsoleResult {
  index: number;
  text: string;
  status: 'ok' | 'error' | 'blocked' | 'skipped';
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  latencyMs?: number;
  error?: string;
}
const results = ref<ConsoleResult[]>([]);
const activeResult = ref(0);
const running = ref(false);
const totalMs = ref(0);

const activeResultData = computed(() => results.value[activeResult.value] || null);

function statusLabel(s: string): string {
  return s === 'blocked' ? '已拦截' : s === 'skipped' ? '未执行' : '执行失败';
}

function onCtrlEnter(e: KeyboardEvent) {
  void run(e.shiftKey ? 'all' : 'current');
}

function currentEditorText(): string {
  const el = editorEl.value;
  if (el && el.selectionStart !== el.selectionEnd) {
    return editorText.value.slice(el.selectionStart, el.selectionEnd);
  }
  const cur = statementAt(editorText.value, el ? el.selectionStart : 0);
  return cur?.text || '';
}

async function run(mode: 'current' | 'all') {
  if (!activeDsId.value) return ElMessage.warning('请先选择数据源');
  const text = mode === 'all' ? editorText.value : currentEditorText();
  if (!text.trim()) return ElMessage.warning('没有可执行的语句');

  running.value = true;
  const res = await api.post<{ results: ConsoleResult[]; totalMs: number }>('/sql-console/run', {
    dataSourceId: activeDsId.value,
    sql: text,
    maxRows,
    timeoutMs: timeoutSec * 1000,
  });
  running.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  results.value = res.data.results;
  totalMs.value = res.data.totalMs;
  // 聚焦到第一个非 ok 的语句（有错先看错），否则最后一条
  const firstBad = res.data.results.findIndex((r) => r.status !== 'ok');
  activeResult.value = firstBad === -1 ? res.data.results.length - 1 : firstBad;
  const blocked = res.data.results.filter((r) => r.status === 'blocked');
  if (blocked.length) ElMessage.warning(`${blocked.length} 条语句被护栏拦截，见结果区说明`);
}

// ===== 数据编辑通道 =====
interface DataEditPreflight {
  token: string;
  auditId: string;
  action: 'insert' | 'update' | 'delete';
  affectedRows: number;
  expiresAt: number;
  statement: string;
}

interface DataEditAudit {
  id: string;
  action: string;
  sql: string;
  status: 'preflight' | 'applied' | 'failed' | 'rejected' | 'expired';
  affectedRows: number | null;
  error: string | null;
  createdAt: number;
  appliedAt: number | null;
}

const editChecking = ref(false);
const editApplying = ref(false);
const auditOpen = ref(false);
const auditLoading = ref(false);
const audits = ref<DataEditAudit[]>([]);

function actionLabel(action: string): string {
  return ({ insert: '插入', update: '更新', delete: '删除' } as Record<string, string>)[action] || action;
}

function auditStatusLabel(status: DataEditAudit['status']): string {
  return {
    preflight: '已预检',
    applied: '已提交',
    failed: '失败',
    rejected: '已拦截',
    expired: '已过期',
  }[status];
}

function auditTagType(status: DataEditAudit['status']): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'applied') return 'success';
  if (status === 'preflight') return 'warning';
  if (status === 'failed') return 'danger';
  return 'info';
}

function formatTime(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

async function preflightEdit() {
  if (!activeDsId.value) return ElMessage.warning('请先选择数据源');
  if (!activeDs.value?.allowWrite) return ElMessage.warning('该数据源未开启写操作');
  const sql = currentEditorText().trim();
  if (!sql) return ElMessage.warning('请选中或定位到一条 INSERT / UPDATE / DELETE');

  const sourceDsId = activeDsId.value;
  editChecking.value = true;
  const res = await api.post<DataEditPreflight>(
    `/datasources/${sourceDsId}/data-edit/preflight`,
    { sql },
  );
  editChecking.value = false;
  if ('error' in res) return ElMessage.error(`预检失败：${res.error}`);

  const preview = res.data;
  if (activeDsId.value !== sourceDsId) {
    return ElMessage.warning('预检期间数据源已切换，本次编辑已取消');
  }
  try {
    await ElMessageBox.confirm(
      h('div', { class: 'dc-edit-confirm' }, [
        h('p', `将对「${activeDs.value?.name || '当前数据源'}」执行${actionLabel(preview.action)}，预检影响 ${preview.affectedRows} 行。`),
        h('pre', { class: 'dc-edit-confirm-sql dw-mono' }, preview.statement),
        h('p', { class: 'dc-edit-confirm-note' }, '提交时会重新执行并写入审计。确认令牌 5 分钟内有效且只能使用一次。'),
      ]),
      '确认数据编辑',
      {
        confirmButtonText: '提交写入',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true,
      },
    );
  } catch {
    ElMessage.info('已取消，本次预检记录将在 5 分钟后过期');
    return;
  }

  if (activeDsId.value !== sourceDsId) {
    return ElMessage.warning('数据源已切换，本次编辑已取消');
  }
  editApplying.value = true;
  const applied = await api.post<{ ok: boolean; auditId: string; affectedRows: number; latencyMs: number }>(
    `/datasources/${sourceDsId}/data-edit/apply`,
    { token: preview.token },
  );
  editApplying.value = false;
  if ('error' in applied) return ElMessage.error(`提交失败：${applied.error}`);
  ElMessage.success(`已提交，影响 ${applied.data.affectedRows} 行；审计 ${applied.data.auditId}`);
  if (auditOpen.value) await loadAudits();
}

async function loadAudits() {
  if (!activeDsId.value) return;
  auditLoading.value = true;
  const res = await api.get<DataEditAudit[]>(`/datasources/${activeDsId.value}/data-edit/audits`);
  auditLoading.value = false;
  if ('error' in res) return ElMessage.error(`加载审计失败：${res.error}`);
  audits.value = res.data;
}

async function openAudits() {
  if (!activeDsId.value) return;
  auditOpen.value = true;
  await loadAudits();
}

// ===== 展示工具 =====
function formatCell(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

function exportCsv() {
  const r = activeResultData.value;
  if (!r?.columns?.length) return;
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const lines = [r.columns.map(esc).join(',')];
  for (const row of r.rows || []) {
    lines.push(r.columns.map((c) => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      return esc(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }).join(','));
  }
  // BOM 保证 Excel 打开中文不乱码
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `result_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== 初始化 =====
onMounted(async () => {
  const res = await api.get<DataSourceInfo[]>('/datasources');
  if ('error' in res) return ElMessage.error(res.error);
  dsList.value = res.data;
  // 默认选内置项目库，开箱可用
  const project = res.data.find((d) => d.type === 'project');
  if (project) {
    activeDsId.value = project.id;
    await onDsChange();
  }
});
</script>
