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

      <span style="flex: 1" />
      <el-button size="small" @click="formatSql">格式化</el-button>
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
        <el-input v-model="schemaFilter" placeholder="搜索表 / 列" size="small" clearable :prefix-icon="Search" />
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
            <span>{{ statementCount }} 条语句</span>
            <span style="flex: 1" />
            <span class="dc-ed-hint">⌃↵ 运行选中 / 光标所在语句</span>
          </div>
          <div class="dc-ed-body">
            <div ref="gutterEl" class="dc-gutter dw-mono"><div v-for="n in lineCount" :key="n">{{ n }}</div></div>
            <textarea
              ref="editorEl"
              v-model="editorText"
              class="dc-textarea dw-mono"
              spellcheck="false"
              wrap="off"
              placeholder="-- 输入 SQL；Ctrl+Enter 运行选中段，Ctrl+Shift+Enter 运行全部"
              @scroll="syncGutter"
              @keydown.ctrl.enter.prevent="onCtrlEnter"
              @keydown.meta.enter.prevent="onCtrlEnter"
            />
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, ArrowRight, Lock, VideoPlay } from '@element-plus/icons-vue';
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
const schemaLoading = ref(false);

const filteredTables = computed(() => {
  const k = schemaFilter.value.trim().toLowerCase();
  if (!k) return tables.value;
  return tables.value
    .filter((t) => t.name.toLowerCase().includes(k) || t.columns.some((c) => c.name.toLowerCase().includes(k)))
    .map((t) => (t.name.toLowerCase().includes(k) ? t : { ...t, _open: true, columns: t.columns.filter((c) => c.name.toLowerCase().includes(k)) }));
});

async function onDsChange() {
  tables.value = [];
  results.value = [];
  activeResult.value = 0;
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

const lineCount = computed(() => editorText.value.split('\n').length);
const statementCount = computed(() => splitSqlStatements(editorText.value).length);

function syncGutter() {
  if (gutterEl.value && editorEl.value) gutterEl.value.scrollTop = editorEl.value.scrollTop;
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

async function run(mode: 'current' | 'all') {
  if (!activeDsId.value) return ElMessage.warning('请先选择数据源');
  let text = '';
  if (mode === 'all') {
    text = editorText.value;
  } else {
    const el = editorEl.value;
    const hasSel = el && el.selectionStart !== el.selectionEnd;
    if (hasSel) {
      text = editorText.value.slice(el!.selectionStart, el!.selectionEnd);
    } else {
      const cur = statementAt(editorText.value, el ? el.selectionStart : 0);
      if (!cur) return ElMessage.warning('没有可执行的语句');
      text = cur.text;
    }
  }
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
