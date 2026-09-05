<template>
  <div class="page dw-root ont-root">
    <!-- 左：本体列表 -->
    <aside class="ont-left">
      <div class="ont-left-bar">
        <el-input v-model="keyword" placeholder="搜索本体" size="small" clearable :prefix-icon="Search" />
        <el-select v-model="statusFilter" size="small" class="ont-status-sel">
          <el-option label="全部状态" value="" />
          <el-option label="已发布" value="published" />
          <el-option label="草稿" value="draft" />
        </el-select>
        <el-button size="small" text :icon="Plus" @click="openCreate">新建</el-button>
      </div>
      <div class="ont-list">
        <div v-if="loading" class="ont-empty">加载中…</div>
        <div v-else-if="!filtered.length" class="ont-empty">
          {{ keyword ? '没有匹配的本体' : '正在为项目库生成内置本体…' }}
        </div>
        <button
          v-for="o in filtered" :key="o.id"
          class="ont-li" :class="{ on: o.id === selectedId }"
          type="button" @click="selectOntology(o.id)"
        >
          <span class="ont-li-row">
            <span class="dw-mono ont-li-code">{{ o.code }}</span>
            <span style="flex: 1" />
            <span v-if="o.builtin" class="ont-tag">内置</span>
            <span class="ds-badge" :class="o.status === 'published' ? 'b-ok' : 'b-draft'">
              {{ o.status === 'published' ? `v${o.version}` : '草稿' }}
            </span>
          </span>
          <span class="ont-li-name">{{ o.name }}</span>
        </button>
      </div>
    </aside>

    <!-- 中：编辑区 -->
    <div class="ont-mid">
      <div v-if="!form.id" class="ont-mid-empty">从左侧选择一个本体，或点「新建」</div>
      <template v-else>
        <div class="ont-mid-head">
          <div>
            <h3 class="dw-display">{{ form.name }}</h3>
            <span class="ont-head-code dw-mono">{{ form.code }}</span>
            <span v-if="form.builtin" class="ont-tag">内置 · code/数据源/物理 SQL 不可改</span>
          </div>
          <div class="ont-head-actions">
            <el-dropdown trigger="click" @command="onHeadCmd">
              <el-button size="small" text :icon="MoreFilled" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="exportYaml">复制 YAML</el-dropdown-item>
                  <el-dropdown-item command="delete" divided :disabled="form.builtin">删除本体</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="ont-scroll">
          <!-- 标识 -->
          <div class="ont-fgroup"><span>标识</span><small>改 code 会断开引用它的智能体</small></div>
          <div class="ont-fgrid">
            <div class="ont-field">
              <label>本体 code（唯一、供大模型引用）</label>
              <el-input v-model="form.code" size="small" :disabled="form.builtin" class="dw-mono" />
            </div>
            <div class="ont-field">
              <label>名称</label>
              <el-input v-model="form.name" size="small" />
            </div>
          </div>

          <!-- 语义 -->
          <div class="ont-fgroup"><span>语义</span><small>大模型只看这一段来决定选不选它</small></div>
          <div class="ont-fgrid">
            <div class="ont-field">
              <label>业务域</label>
              <el-select v-model="form.domain" size="small" clearable placeholder="选择域">
                <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
              </el-select>
            </div>
            <div class="ont-field">
              <label>同义词（一行一个，用于命中提问）</label>
              <el-input v-model="form.synonymsText" type="textarea" :rows="2" size="small" />
            </div>
            <div class="ont-field ont-full">
              <label>业务描述（写清口径与粒度）</label>
              <el-input v-model="form.description" type="textarea" :rows="3" size="small" />
            </div>
          </div>

          <!-- 选择器 -->
          <div class="ont-fgroup">
            <span>维度 / 度量 / 时间维度</span>
            <small>expr 只能引用来源 SQL 的输出列别名</small>
          </div>
          <table class="ont-spec-table">
            <thead>
              <tr><th style="width:70px">角色</th><th>名称</th><th>表达式（别名）</th><th style="width:110px">聚合</th><th style="width:36px"></th></tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in form.dimensions" :key="`d${i}`">
                <td><span class="ont-role ont-role-dim">维度</span></td>
                <td><el-input v-model="d.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="d.expr" size="small" class="dw-mono" /></td>
                <td class="ont-cell-na">—</td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.dimensions.splice(i, 1)" /></td>
              </tr>
              <tr v-for="(m, i) in form.measures" :key="`m${i}`">
                <td><span class="ont-role ont-role-measure">度量</span></td>
                <td><el-input v-model="m.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="m.expr" size="small" class="dw-mono" placeholder="如 * 或列别名" /></td>
                <td>
                  <el-select v-model="m.agg" size="small">
                    <el-option v-for="a in AGGS" :key="a" :label="a" :value="a" />
                  </el-select>
                </td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.measures.splice(i, 1)" /></td>
              </tr>
              <tr v-for="(t, i) in form.timeDimensions" :key="`t${i}`">
                <td><span class="ont-role ont-role-time">时间</span></td>
                <td><el-input v-model="t.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="t.expr" size="small" class="dw-mono" /></td>
                <td class="ont-cell-na">日/周/月…</td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.timeDimensions.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="ont-add-row">
            <el-button size="small" text @click="form.dimensions.push({ name: '', expr: '' })">+ 维度</el-button>
            <el-button size="small" text @click="form.measures.push({ name: '', expr: '', agg: 'sum' })">+ 度量</el-button>
            <el-button size="small" text @click="form.timeDimensions.push({ name: '', expr: '' })">+ 时间维度</el-button>
          </div>

          <!-- 行级策略 -->
          <div class="ont-fgroup"><span>行级策略</span><small>强制注入 WHERE，用户不可绕过</small></div>
          <div class="ont-fgrid">
            <div v-for="(p, i) in form.policies" :key="i" class="ont-field ont-full ont-policy-row">
              <el-input v-model="form.policies[i]" size="small" class="dw-mono" placeholder="如 is_deleted = 0" />
              <el-button size="small" text type="danger" :icon="Delete" @click="form.policies.splice(i, 1)" />
            </div>
            <el-button size="small" text :icon="Plus" @click="form.policies.push('')">+ 行级策略</el-button>
          </div>

          <!-- 物理 -->
          <div class="ont-fgroup"><span>物理</span><small>大模型看不到这一段，只有编译器用</small></div>
          <div class="ont-field ont-full">
            <label>来源 SQL（每个输出列必须 AS 别名，保存时校验）</label>
            <el-input
              v-model="form.sourceSql" type="textarea" :rows="7" size="small"
              class="ont-sql dw-mono" :disabled="form.builtin" spellcheck="false"
            />
            <span v-if="form.builtin" class="ont-hint">
              内置本体的物理 SQL 由结构同步维护；补好语义描述与同义词后即可发布。
            </span>
          </div>
        </div>

        <!-- 动作条 -->
        <div class="ont-actionbar">
          <span v-if="dirty" class="ds-badge b-draft"><span class="ds-dot err" />未保存改动</span>
          <span style="flex: 1" />
          <el-button size="small" :loading="saving" @click="save(false)">保存草稿</el-button>
          <el-button size="small" :loading="previewing" @click="previewData">预览数据</el-button>
          <el-button size="small" :loading="running" @click="tryRun">试跑查询</el-button>
          <el-button size="small" type="primary" :loading="publishing" @click="publish">
            {{ form.status === 'published' ? `发布 v${form.version + 1}` : '发布' }}
          </el-button>
        </div>
      </template>
    </div>

    <!-- 右：编译预览 -->
    <aside class="ont-right">
      <div class="ont-right-head">
        <span class="ont-eyebrow">编译预览</span>
        <span class="ds-badge">不执行</span>
      </div>
      <CompileTrack :stages="trackStages" compact style="padding: 10px 14px 0" />
      <div class="ont-right-tabs">
        <button class="ont-rtab" :class="{ on: rightTab === 'sql' }" type="button" @click="rightTab = 'sql'">编译 SQL</button>
        <button class="ont-rtab" :class="{ on: rightTab === 'yaml' }" type="button" @click="rightTab = 'yaml'">YAML</button>
        <button class="ont-rtab" :class="{ on: rightTab === 'result' }" type="button" @click="rightTab = 'result'">
          结果{{ resultRows ? `（${resultRows.length}）` : '' }}
        </button>
      </div>
      <div class="ont-right-body">
        <pre v-if="rightTab === 'sql'" class="ont-code dw-mono">{{ compiledSql || '保存后自动编译' }}</pre>
        <pre v-else-if="rightTab === 'yaml'" class="ont-code dw-mono">{{ yamlText || '从「⋯ → 复制 YAML」导出' }}</pre>
        <template v-else>
          <div v-if="runError" class="ont-run-err">{{ runError }}</div>
          <div v-else-if="!resultColumns.length" class="ont-empty">点「预览数据」或「试跑查询」查看结果</div>
          <template v-else>
            <div class="ont-grid-wrap">
              <table class="dc-grid">
                <thead>
                  <tr>
                    <th class="dc-rownum">#</th>
                    <th v-for="c in resultColumns" :key="c" class="dw-mono">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in resultRows" :key="ri">
                    <td class="dc-rownum">{{ ri + 1 }}</td>
                    <td v-for="c in resultColumns" :key="c" :class="{ 'is-null': row[c] == null }">
                      {{ row[c] == null ? 'NULL' : formatCell(row[c]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="dc-res-foot">
              <span>{{ resultRows.length }} 行</span>
              <span v-if="resultMs">{{ resultMs }} ms</span>
            </div>
          </template>
        </template>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Delete, MoreFilled } from '@element-plus/icons-vue';
import { api } from '../api/client';
import CompileTrack, { type CompileStage } from '../components/CompileTrack.vue';
import '../styles/data-workbench.css';
import './datasources.css';
import './console.css';
import './ontology.css';

const DOMAINS = ['交易域', '用户域', '商品域', '营销域', '日志域', '通用'];
const AGGS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'];

interface OntologyInfo {
  id: string;
  datasourceId: string;
  code: string;
  name: string;
  domain: string | null;
  description: string | null;
  synonyms: string[];
  sourceSql: string;
  dimensions: { name: string; expr: string; description?: string }[];
  timeDimensions: { name: string; expr: string; description?: string }[];
  measures: { name: string; expr: string; agg: string }[];
  policies: string[];
  status: string;
  version: number;
  builtin: boolean;
}

// ===== 列表 =====
const list = ref<OntologyInfo[]>([]);
const loading = ref(true);
const keyword = ref('');
const statusFilter = ref('');
const selectedId = ref('');

const filtered = computed(() =>
  list.value.filter((o) => {
    if (statusFilter.value && o.status !== statusFilter.value) return false;
    const k = keyword.value.trim().toLowerCase();
    if (!k) return true;
    return [o.code, o.name, o.description].some((s) => (s || '').toLowerCase().includes(k));
  }),
);

async function load(keepSelection = true) {
  loading.value = true;
  const res = await api.get<OntologyInfo[]>('/ontologies');
  loading.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  list.value = res.data;
  // 首次加载可能有内置本体异步生成中，稍后自动补拉一次
  if (!res.data.length && !builtinRetry) {
    builtinRetry = true;
    setTimeout(() => void load(keepSelection), 1200);
  }
  if (!keepSelection || !selectedId.value) {
    if (list.value.length) await selectOntology(list.value[0].id);
  }
}
let builtinRetry = false;

// ===== 表单 =====
const form = reactive({
  id: '', datasourceId: '', code: '', name: '', domain: '', description: '',
  synonymsText: '', sourceSql: '',
  dimensions: [] as { name: string; expr: string }[],
  measures: [] as { name: string; expr: string; agg: string }[],
  timeDimensions: [] as { name: string; expr: string }[],
  policies: [] as string[],
  status: 'draft', version: 1, builtin: false,
});
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const previewing = ref(false);
const running = ref(false);

function fillForm(o: OntologyInfo) {
  Object.assign(form, {
    id: o.id, datasourceId: o.datasourceId, code: o.code, name: o.name,
    domain: o.domain || '', description: o.description || '',
    synonymsText: o.synonyms.join('\n'), sourceSql: o.sourceSql,
    dimensions: o.dimensions.map((d) => ({ ...d })),
    measures: o.measures.map((m) => ({ ...m })),
    timeDimensions: o.timeDimensions.map((d) => ({ ...d })),
    policies: [...o.policies],
    status: o.status, version: o.version, builtin: o.builtin,
  });
  dirty.value = false;
  void compilePreview();
  void loadYaml();
}

async function selectOntology(id: string) {
  const o = list.value.find((x) => x.id === id);
  if (!o) return;
  selectedId.value = id;
  fillForm(o);
  rightTab.value = 'sql';
}

function openCreate() {
  selectedId.value = '';
  Object.assign(form, {
    id: '', datasourceId: list.value[0]?.datasourceId || '', code: '', name: '', domain: '',
    description: '', synonymsText: '', sourceSql: 'SELECT\n  id AS id\nFROM t_your_table',
    dimensions: [], measures: [], timeDimensions: [], policies: [],
    status: 'draft', version: 1, builtin: false,
  });
  dirty.value = false;
}

function payload() {
  return {
    datasourceId: form.datasourceId || list.value[0]?.datasourceId,
    code: form.code, name: form.name, domain: form.domain || undefined,
    description: form.description || undefined,
    synonyms: form.synonymsText.split('\n').map((s) => s.trim()).filter(Boolean),
    sourceSql: form.sourceSql,
    dimensions: form.dimensions.filter((d) => d.name && d.expr),
    measures: form.measures.filter((m) => m.name && (m.expr || m.agg === 'count')),
    timeDimensions: form.timeDimensions.filter((d) => d.name && d.expr),
    policies: form.policies.map((p) => p.trim()).filter(Boolean),
  };
}

async function save(publishAfter: boolean) {
  if (!form.code || !form.name || !form.sourceSql) {
    return ElMessage.warning('code / 名称 / 来源 SQL 必填');
  }
  saving.value = true;
  const isEdit = !!form.id;
  const res = isEdit
    ? await api.put<OntologyInfo>(`/ontologies/${form.id}`, payload())
    : await api.post<OntologyInfo>('/ontologies', payload());
  saving.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success(isEdit ? '已保存（回到草稿态）' : '已创建草稿');
  dirty.value = false;
  await load(true);
  selectedId.value = res.data.id;
  fillForm(res.data);
  if (publishAfter) void publish();
}

async function publish() {
  if (!form.id) return;
  publishing.value = true;
  // 发布前先落草稿（所见即所发）
  if (dirty.value) {
    publishing.value = false;
    return save(true);
  }
  const res = await api.post<OntologyInfo>(`/ontologies/${form.id}/publish`);
  publishing.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success(`已发布 v${res.data.version}，智能体即刻生效`);
  await load(true);
  fillForm(res.data);
}

function onHeadCmd(cmd: string) {
  if (cmd === 'exportYaml') void copyYaml();
  else if (cmd === 'delete') void remove();
}

async function remove() {
  if (!form.id || form.builtin) return;
  await ElMessageBox.confirm(`删除本体「${form.code}」？引用它的智能体将失去该语义。`, '删除本体', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  }).catch(() => null);
  const res = await api.delete(`/ontologies/${form.id}`);
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success('已删除');
  selectedId.value = '';
  form.id = '';
  await load(false);
}

// ===== 编译预览 / YAML / 试跑 =====
const compiledSql = ref('');
const compileWarnings = ref<string[]>([]);
const trackStages = computed<CompileStage[]>(() => [
  { label: '意图', status: compiledSql.value || runError.value ? 'done' : 'cur' },
  { label: '编译', status: compiledSql.value ? 'done' : runError.value ? 'cur' : 'pending' },
  { label: '物理 SQL', status: compiledSql.value ? 'done' : 'pending' },
  { label: '结果', status: resultRows.value.length ? 'done' : 'pending' },
]);

async function compilePreview() {
  if (!form.id) return;
  compiledSql.value = '';
  runError.value = '';
  // 默认意图：全部维度 + 全部度量（概览查询）
  const res = await api.post<{ sql: string; warnings: string[] }>(`/ontologies/${form.id}/compile`, {
    dimensions: form.dimensions.map((d) => d.name).filter(Boolean),
    timeDimension: undefined,
    measures: form.measures.filter((m) => m.name).map((m) => ({ name: m.name })),
    limit: 50,
  });
  if ('error' in res) {
    runError.value = res.error;
    return;
  }
  compiledSql.value = res.data.sql;
  compileWarnings.value = res.data.warnings || [];
}

async function loadYaml() {
  if (!form.id) return;
  const res = await api.get<{ yaml: string }>(`/ontologies/${form.id}/yaml`);
  if (!('error' in res)) yamlText.value = res.data.yaml;
}

async function copyYaml() {
  if (!form.id) return;
  const res = await api.get<{ yaml: string }>(`/ontologies/${form.id}/yaml`);
  if ('error' in res) return ElMessage.error(res.error);
  try {
    await navigator.clipboard.writeText(res.data.yaml);
    ElMessage.success('YAML 已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败');
  }
}

const yamlText = ref('');
const rightTab = ref<'sql' | 'yaml' | 'result'>('sql');
const resultColumns = ref<string[]>([]);
const resultRows = ref<Record<string, unknown>[]>([]);
const resultMs = ref(0);
const runError = ref('');

function fillResult(r: { columns?: string[]; rows?: Record<string, unknown>[]; latencyMs?: number }) {
  resultColumns.value = r.columns || [];
  resultRows.value = r.rows || [];
  resultMs.value = r.latencyMs || 0;
  rightTab.value = 'result';
}

async function previewData() {
  if (!form.id) return;
  previewing.value = true;
  runError.value = '';
  const res = await api.post<{ columns: string[]; rows: Record<string, unknown>[]; latencyMs: number }>(
    `/ontologies/${form.id}/preview-data`, { limit: 50 },
  );
  previewing.value = false;
  if ('error' in res) {
    runError.value = res.error;
    rightTab.value = 'result';
    return;
  }
  fillResult(res.data);
}

async function tryRun() {
  if (!form.id) return;
  if (dirty.value) {
    ElMessage.warning('有未保存改动，请先保存草稿再试跑');
    return;
  }
  running.value = true;
  runError.value = '';
  const res = await api.post<{ columns: string[]; rows: Record<string, unknown>[]; latencyMs: number; warnings?: string[] }>(
    `/ontologies/${form.id}/try-run`,
    {
      dimensions: form.dimensions.map((d) => d.name).filter(Boolean),
      measures: form.measures.filter((m) => m.name).map((m) => ({ name: m.name })),
      limit: 50,
    },
  );
  running.value = false;
  if ('error' in res) {
    runError.value = res.error;
    rightTab.value = 'result';
    return;
  }
  fillResult(res.data);
}

function formatCell(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

onMounted(() => void load(false));
</script>
