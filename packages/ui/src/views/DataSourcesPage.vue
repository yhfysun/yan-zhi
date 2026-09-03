<template>
  <div class="page dw-root">
    <header class="page-header">
      <div>
        <h2 class="page-title dw-display">数据源</h2>
        <div class="page-sub">连接外部数据库与内置项目库，作为本体（text2sql）与 SQL 控制台的数据面</div>
      </div>
      <div class="ds-actions">
        <el-input
          v-model="keyword"
          placeholder="搜索数据源 / 主机 / 库名"
          clearable
          class="ds-search"
          :prefix-icon="Search"
        />
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建数据源
        </el-button>
      </div>
    </header>

    <div v-if="loading" class="dw-loading">加载中…</div>
    <div v-else-if="loadError" class="dw-empty dw-empty-err">{{ loadError }}</div>

    <div v-else class="ds-grid">
      <!-- 新建/编辑表单：临时态，视觉重量必须低于常态卡片（白底 + 左侧品牌竖线） -->
      <div v-if="formOpen" class="ds-card ds-form">
        <div class="ds-card-head">
          <span class="ds-kind" :class="{ project: form.type === 'project' }">{{ typeLabel(form.type) }}</span>
          <span class="ds-eyebrow">{{ editingId ? '编辑连接' : '新建连接' }}</span>
          <span style="flex: 1" />
          <el-button text size="small" @click="closeForm">取消</el-button>
        </div>
        <h3 class="ds-card-title">{{ form.name || '未命名连接' }}</h3>

        <div class="ds-fgrid">
          <div class="ds-field" style="grid-column: 1 / -1">
            <label>数据库类型</label>
            <!-- 按语族分 3 组：把「8 个选项」切成 ≤5 的语块，能力差异写进分组标题 -->
            <div class="tp-groups">
              <div class="tp-g">
                <span class="ds-eyebrow">关系型 · 支持自动 JOIN</span>
                <div class="tp-row">
                  <button
                    v-for="t in RELATIONAL_TYPES" :key="t"
                    type="button" class="tp-btn" :class="{ on: form.type === t }"
                    @click="form.type = t"
                  >{{ typeLabel(t) }}</button>
                </div>
              </div>
              <div class="tp-g">
                <span class="ds-eyebrow">内置</span>
                <div class="tp-row">
                  <span class="tp-btn tp-fixed">言智项目库（自动就绪）</span>
                </div>
              </div>
              <div class="tp-g">
                <span class="ds-eyebrow">文档型 · 无 JOIN 下推（P5 落地）</span>
                <div class="tp-row">
                  <button
                    v-for="t in DOC_TYPES" :key="t" type="button"
                    class="tp-btn tp-na" disabled
                  >{{ typeLabel(t) }}</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ds-field">
            <label>名称</label>
            <el-input v-model="form.name" placeholder="如：生产交易库" maxlength="40" />
          </div>
          <template v-if="form.type === 'sqlite'">
            <div class="ds-field" style="grid-column: 1 / -1">
              <label>数据库文件路径</label>
              <el-input v-model="form.filePath" placeholder="如：D:\data\archive.db" />
            </div>
          </template>
          <template v-else>
            <div class="ds-field">
              <label>主机</label>
              <el-input v-model="form.host" placeholder="127.0.0.1" />
            </div>
            <div class="ds-field">
              <label>端口</label>
              <el-input v-model.number="form.port" :placeholder="defaultPort(form.type)" />
            </div>
            <div v-if="form.type === 'oracle' || form.type === 'dm'" class="ds-field">
              <label>服务名</label>
              <el-input v-model="form.serviceName" :placeholder="form.type === 'oracle' ? 'ORCLPDB1' : '可选'" />
            </div>
            <div class="ds-field">
              <label>数据库</label>
              <el-input v-model="form.database" :placeholder="form.type === 'oracle' ? '可选（默认服务名）' : '库名'" />
            </div>
            <div class="ds-field">
              <label>用户名</label>
              <el-input v-model="form.username" placeholder="建议只读账号" autocomplete="off" />
            </div>
            <div class="ds-field">
              <label>密码{{ editingId && form.password === undefined ? '（已保存，留空保持不变）' : '' }}</label>
              <el-input
                v-model="form.password" type="password" show-password
                placeholder="AES 加密存本地，不回显" autocomplete="new-password"
              />
            </div>
          </template>

          <div class="ds-field ds-switches">
            <el-checkbox v-if="form.type === 'mysql' || form.type === 'postgres'" v-model="form.ssl">SSL</el-checkbox>
            <el-checkbox v-model="form.allowWrite">允许写操作</el-checkbox>
            <span class="ds-hint">写操作默认关闭，执行时还需在会话中限时开启</span>
          </div>

          <!-- 失败诊断：只给"重新测试"等于让用户盲查；错误码展开可解释 -->
          <details v-if="formTestError" class="ds-diag">
            <summary>
              <el-icon class="chev"><ArrowRight /></el-icon>
              连接失败 · 如何排查
            </summary>
            <div class="ds-diag-body">
              <p class="ds-diag-err dw-mono">{{ formTestError }}</p>
              <ol>
                <li>防火墙 / 安全组未放通端口 <code class="dw-mono">{{ form.port || defaultPort(form.type) }}</code></li>
                <li>账号或密码错误（建议使用只读账号）</li>
                <li v-if="form.type === 'oracle'">服务名与实际 PDB 不一致（<code class="dw-mono">lsnrctl status</code> 核对）</li>
                <li v-else-if="form.type === 'dm'">达梦监听未启动（目标机 <code class="dw-mono">DmServiceDMSERVER</code> 状态）</li>
                <li v-else-if="form.type === 'postgres'">pg_hba.conf 未允许该来源 IP 连接</li>
                <li v-else>数据库未启动或拒绝远程连接</li>
              </ol>
              <el-button size="small" text @click="copyText(formTestError)">复制错误信息</el-button>
            </div>
          </details>
        </div>

        <div class="ds-card-foot">
          <el-button size="small" :loading="testing" @click="saveAndTest">
            保存并测试
          </el-button>
          <span v-if="formTestOk" class="ds-stat" style="color: var(--dw-signal)">
            <span class="ds-dot ok" />连接成功 · {{ formTestLatency }} ms
          </span>
          <span style="flex: 1" />
          <el-button size="small" type="primary" :loading="saving" @click="save(false)">保存</el-button>
        </div>
      </div>

      <!-- 常态卡片 -->
      <article v-for="ds in filtered" :key="ds.id" class="ds-card">
        <div class="ds-card-head">
          <span class="ds-kind" :class="{ project: ds.builtin }">{{ typeLabel(ds.type) }}</span>
          <span class="ds-eyebrow">{{ ds.builtin ? '内置' : '外部' }}</span>
          <span style="flex: 1" />
          <span class="ds-badge" :class="statusClass(ds)">
            <span class="ds-dot" :class="statusDot(ds)" />{{ statusLabel(ds) }}
          </span>
        </div>
        <h3 class="ds-card-title">
          {{ ds.name }}
          <el-dropdown v-if="!ds.builtin" trigger="click" @command="(cmd: string) => onCardCmd(cmd, ds)">
            <el-button text size="small" class="ds-more" :icon="MoreFilled" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </h3>
        <p class="ds-card-sub">{{ dsSubtitle(ds) }}</p>

        <dl class="ds-kv">
          <template v-if="ds.type === 'project'">
            <dt>位置</dt><dd class="dw-mono">应用自身 data.db</dd>
            <dt>方言</dt><dd class="dw-mono">sqlite · 只读</dd>
          </template>
          <template v-else-if="ds.type === 'sqlite'">
            <dt>文件</dt><dd class="dw-mono">{{ ds.filePath }}</dd>
          </template>
          <template v-else>
            <dt>主机</dt><dd class="dw-mono">{{ ds.host }}:{{ ds.port || defaultPort(ds.type) }}</dd>
            <dt>库</dt><dd class="dw-mono">{{ ds.database || ds.serviceName || '—' }}</dd>
            <dt>账号</dt><dd class="dw-mono">{{ ds.username || '—' }}{{ ds.ssl ? ' · SSL' : '' }}</dd>
          </template>
        </dl>

        <details v-if="ds.status === 'error' && ds.lastError" class="ds-diag">
          <summary>
            <el-icon class="chev"><ArrowRight /></el-icon>
            上次失败原因 · 如何排查
          </summary>
          <div class="ds-diag-body">
            <p class="ds-diag-err dw-mono">{{ ds.lastError }}</p>
            <el-button size="small" text @click="copyText(ds.lastError!)">复制错误信息</el-button>
          </div>
        </details>

        <div class="ds-card-foot">
          <span class="ds-stat">表 <b>{{ ds.tableCount ?? '—' }}</b></span>
          <span v-if="ds.schemaSyncedAt" class="ds-stat">同步 <b>{{ timeAgo(ds.schemaSyncedAt) }}</b></span>
          <span style="flex: 1" />
          <el-button size="small" text :loading="testingId === ds.id" @click="testDs(ds)">测试</el-button>
          <el-button size="small" :loading="syncingId === ds.id" @click="syncDs(ds)">
            {{ ds.schemaSyncedAt ? '重新同步' : '同步结构' }}
          </el-button>
        </div>
      </article>

      <div v-if="!filtered.length" class="dw-empty">没有匹配的数据源</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, ArrowRight, MoreFilled } from '@element-plus/icons-vue';
import { api } from '../api/client';
import '../styles/data-workbench.css';

// ===== 类型分组（能力差异写进分组标题，用户选型前即知情） =====
const RELATIONAL_TYPES = ['mysql', 'postgres', 'dm', 'oracle', 'sqlite'] as const;
const DOC_TYPES = ['mongo', 'elastic'] as const;
const ALL_TYPES = [...RELATIONAL_TYPES, 'project', ...DOC_TYPES];

const TYPE_LABELS: Record<string, string> = {
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  dm: '达梦 DM',
  oracle: 'Oracle',
  sqlite: 'SQLite',
  project: '项目库',
  mongo: 'MongoDB',
  elastic: 'Elasticsearch',
};
const typeLabel = (t: string) => TYPE_LABELS[t] || t;

const DEFAULT_PORTS: Record<string, string> = { mysql: '3306', postgres: '5432', dm: '5236', oracle: '1521' };
const defaultPort = (t: string) => DEFAULT_PORTS[t] || '—';

// ===== 列表 =====
interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  host: string | null;
  port: number | null;
  database: string | null;
  serviceName: string | null;
  filePath: string | null;
  username: string | null;
  readonly: boolean;
  allowWrite: boolean;
  status: string;
  lastError: string | null;
  lastTestAt: number | null;
  schemaSyncedAt: number | null;
  tableCount: number | null;
  builtin: boolean;
  hasPassword: boolean;
  ssl?: boolean;
}

const list = ref<DataSourceInfo[]>([]);
const loading = ref(true);
const loadError = ref('');
const keyword = ref('');
const testingId = ref('');
const syncingId = ref('');

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return list.value;
  return list.value.filter((d) =>
    [d.name, d.host, d.database, d.serviceName, d.type].some((s) => (s || '').toLowerCase().includes(k)),
  );
});

async function load() {
  loading.value = true;
  loadError.value = '';
  const res = await api.get<DataSourceInfo[]>('/datasources');
  if ('error' in res) loadError.value = res.error;
  else list.value = res.data;
  loading.value = false;
}
onMounted(load);

// ===== 状态展示 =====
function statusLabel(ds: DataSourceInfo): string {
  if (ds.status === 'ok') return '已连接';
  if (ds.status === 'error') return '连接失败';
  return ds.schemaSyncedAt ? '已就绪' : '未同步';
}
function statusClass(ds: DataSourceInfo): string {
  if (ds.status === 'ok') return 'b-ok';
  if (ds.status === 'error') return 'b-err';
  return 'b-neut';
}
function statusDot(ds: DataSourceInfo): string {
  if (ds.status === 'ok') return 'ok';
  if (ds.status === 'error') return 'err';
  return 'neut';
}
function dsSubtitle(ds: DataSourceInfo): string {
  if (ds.type === 'project') return '应用自身的 data.db，开箱可用';
  if (ds.allowWrite) return '已开启写操作（高危）';
  return '只读连接';
}
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

// ===== 测试 / 同步 =====
async function testDs(ds: DataSourceInfo) {
  testingId.value = ds.id;
  const res = await api.post<{ ok: boolean; latencyMs: number; version?: string; error?: string }>(
    `/datasources/${ds.id}/test`,
  );
  testingId.value = '';
  if ('error' in res) return ElMessage.error(res.error);
  if (res.data.ok) {
    ElMessage.success(`${ds.name} 连接成功 · ${res.data.latencyMs} ms${res.data.version ? ` · ${res.data.version}` : ''}`);
  } else {
    ElMessage.error(`${ds.name} 连接失败：${res.data.error || '未知错误'}`);
  }
  await load();
}

async function syncDs(ds: DataSourceInfo) {
  syncingId.value = ds.id;
  const res = await api.get<{ tableCount: number }>(`/datasources/${ds.id}/schema`);
  syncingId.value = '';
  if ('error' in res) return ElMessage.error(`同步失败：${res.error}`);
  ElMessage.success(`${ds.name} 同步完成 · ${res.data.tableCount} 张表/视图`);
  await load();
}

function onCardCmd(cmd: string, ds: DataSourceInfo) {
  if (cmd === 'edit') openEdit(ds);
  else if (cmd === 'delete') removeDs(ds);
}

async function removeDs(ds: DataSourceInfo) {
  await ElMessageBox.confirm(
    `删除数据源「${ds.name}」？已挂载它的本体与智能体将失去数据来源。`,
    '删除数据源',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
  ).catch(() => null);
  const res = await api.delete(`/datasources/${ds.id}`);
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success('已删除');
  await load();
}

// ===== 表单 =====
interface FormModel {
  name: string;
  type: string;
  host: string;
  port: number | undefined;
  database: string;
  serviceName: string;
  filePath: string;
  username: string;
  /** undefined = 保持原值（编辑态）；'' = 清除 */
  password: string | undefined;
  ssl: boolean;
  allowWrite: boolean;
}

const formOpen = ref(false);
const editingId = ref('');
const saving = ref(false);
const testing = ref(false);
const formTestOk = ref(false);
const formTestLatency = ref(0);
const formTestError = ref('');

const form = reactive<FormModel>({
  name: '', type: 'mysql', host: '', port: undefined, database: '',
  serviceName: '', filePath: '', username: '', password: undefined,
  ssl: false, allowWrite: false,
});

function openCreate() {
  Object.assign(form, {
    name: '', type: form.type || 'mysql', host: '', port: undefined, database: '',
    serviceName: '', filePath: '', username: '', password: '', ssl: false, allowWrite: false,
  });
  editingId.value = '';
  formOpen.value = true;
  resetFormTest();
}

function openEdit(ds: DataSourceInfo) {
  Object.assign(form, {
    name: ds.name, type: ds.type, host: ds.host || '', port: ds.port ?? undefined,
    database: ds.database || '', serviceName: ds.serviceName || '', filePath: ds.filePath || '',
    username: ds.username || '', password: undefined, ssl: !!ds.ssl, allowWrite: ds.allowWrite,
  });
  editingId.value = ds.id;
  formOpen.value = true;
  resetFormTest();
}

function closeForm() {
  formOpen.value = false;
  editingId.value = '';
}

function resetFormTest() {
  formTestOk.value = false;
  formTestLatency.value = 0;
  formTestError.value = '';
}

function payload(): Record<string, unknown> {
  return {
    name: form.name, type: form.type, host: form.host || undefined, port: form.port || undefined,
    database: form.database || undefined, serviceName: form.serviceName || undefined,
    filePath: form.filePath || undefined, username: form.username || undefined,
    // 编辑态密码留空 = 不传（保持原值）
    password: editingId.value && (form.password === undefined || form.password === '') ? undefined : form.password,
    ssl: form.ssl, allowWrite: form.allowWrite,
  };
}

async function save(alsoTest: boolean) {
  saving.value = alsoTest;
  testing.value = alsoTest;
  resetFormTest();
  const isEdit = !!editingId.value;
  const res = isEdit
    ? await api.put<DataSourceInfo>(`/datasources/${editingId.value}`, payload())
    : await api.post<DataSourceInfo>('/datasources', payload());
  if ('error' in res) {
    saving.value = false;
    testing.value = false;
    return ElMessage.error(res.error);
  }
  const ds = res.data;
  if (!alsoTest) {
    saving.value = false;
    ElMessage.success(isEdit ? '已保存' : '已创建');
    formOpen.value = false;
    await load();
    return;
  }
  const t = await api.post<{ ok: boolean; latencyMs: number; error?: string }>(`/datasources/${ds.id}/test`);
  saving.value = false;
  testing.value = false;
  if ('error' in t) return ElMessage.error(t.error);
  if (t.data.ok) {
    formTestOk.value = true;
    formTestLatency.value = t.data.latencyMs;
    ElMessage.success(`连接成功 · ${t.data.latencyMs} ms`);
    formOpen.value = false;
  } else {
    formTestError.value = t.data.error || '连接失败';
  }
  await load();
}

function saveAndTest() {
  if (!form.name.trim()) return ElMessage.warning('请先填写名称');
  void save(true);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}
</script>

<style>
@import './datasources.css';
</style>
