<template>
  <div class="page ops-console">
    <div class="ops-header">
      <h3 class="page-title">运维控制台</h3>
      <el-button size="small" :icon="Plus" type="primary" @click="openAddDialog">新建连接</el-button>
    </div>

    <div class="ops-layout">
      <!-- 左侧：连接列表（按类型标记：SSH / Docker / 数据库） -->
      <aside class="ops-connections">
        <div
          v-for="c in connections"
          :key="c.id"
          :class="['ops-conn-item', { active: c.id === activeConnectionId }]"
          @click="selectConnection(c)"
        >
          <div class="ops-conn-main">
            <span class="ops-conn-name">{{ c.name }}</span>
            <span class="ops-conn-type" :data-type="connType(c)">{{ TYPE_LABELS[connType(c)] }}</span>
            <el-tag v-if="c.tag" size="small" :type="isProdTag(c.tag) ? 'danger' : 'info'">{{ c.tag }}</el-tag>
          </div>
          <div class="ops-conn-sub">{{ connSub(c) }}</div>
          <div class="ops-conn-actions">
            <el-button link size="small" @click.stop="testConnection(c)">测试</el-button>
            <el-button link size="small" type="danger" @click.stop="removeConnection(c)">删除</el-button>
          </div>
        </div>
        <div v-if="!connections.length" class="ops-empty">
          暂无连接，点右上角「新建连接」添加资源（SSH 服务器 / Docker 主机 / 数据库）
        </div>
      </aside>

      <!-- 右侧：按连接类型呈现工作区 -->
      <section class="ops-workspace">
        <template v-if="activeConnection">
          <el-tabs v-model="mode" class="ops-tabs">
            <!-- SSH：命令模式（xterm 终端） -->
            <el-tab-pane v-if="connType(activeConnection) === 'ssh'" label="命令模式" name="term">
              <div class="ops-term-wrap">
                <div class="ops-term-bar">
                  <span class="ops-term-conn">{{ activeConnection.username }}@{{ activeConnection.host }}</span>
                  <el-button v-if="!termOpen" size="small" type="primary" @click="openTerminal">连接终端</el-button>
                  <el-button v-else size="small" type="warning" @click="closeTerminal">断开</el-button>
                </div>
                <div ref="termEl" v-if="termOpen" class="ops-term"></div>
                <div v-else class="ops-term-empty">
                  <p class="ops-term-empty-title">未连接终端</p>
                  <p class="ops-term-empty-sub">点「连接终端」，进入交互式 SSH Shell</p>
                </div>
              </div>
            </el-tab-pane>

            <!-- Docker：容器面板（docker 类型连接的远程操作页） -->
            <el-tab-pane v-if="connType(activeConnection) === 'docker'" label="容器" name="docker">
              <div class="ops-docker">
                <div class="ops-docker-bar">
                  <el-button size="small" @click="loadContainers">刷新</el-button>
                  <span v-if="containersError" class="ops-docker-error">{{ containersError }}</span>
                </div>
                <el-table v-if="containers.length" :data="containers" size="small" height="100%" class="ops-docker-table">
                  <el-table-column prop="Names" label="名称" min-width="160" show-overflow-tooltip />
                  <el-table-column prop="Image" label="镜像" min-width="180" show-overflow-tooltip />
                  <el-table-column prop="State" label="状态" width="90">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.State === 'running' ? 'success' : 'info'">{{ row.State }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="Status" label="详情" min-width="140" show-overflow-tooltip />
                  <el-table-column label="操作" width="150" fixed="right">
                    <template #default="{ row }">
                      <el-button link size="small" @click="viewLogs(row)">日志</el-button>
                      <el-button link size="small" type="warning" @click="restartContainer(row)">重启</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-else class="ops-empty">点「刷新」查看该主机上的容器</div>
              </div>
            </el-tab-pane>

            <!-- 数据库：SQL 查询面板（database 类型连接的远程操作页，只读） -->
            <el-tab-pane v-if="connType(activeConnection) === 'database'" label="数据查询" name="db">
              <div class="ops-db">
                <div class="ops-db-bar">
                  <el-select
                    v-model="dbTable"
                    placeholder="选择表（可选）"
                    size="small"
                    clearable
                    filterable
                    class="ops-db-table-select"
                    @visible-change="(v: boolean) => v && loadDbTables()"
                    @change="onPickTable"
                  >
                    <el-option v-for="t in dbTables" :key="t" :label="t" :value="t" />
                  </el-select>
                  <el-button size="small" :loading="dbLoading" type="primary" :disabled="!dbSql.trim()" @click="runDbQuery">
                    运行 (Ctrl+Enter)
                  </el-button>
                  <span class="form-tip">仅支持只读查询：SELECT / SHOW / DESC / EXPLAIN / WITH，写操作一律拒绝</span>
                </div>
                <el-input
                  v-model="dbSql"
                  type="textarea"
                  :rows="4"
                  class="ops-db-sql"
                  placeholder="如：SELECT * FROM users ORDER BY id DESC LIMIT 20"
                  @keydown.ctrl.enter="runDbQuery"
                />
                <div v-if="dbError" class="ops-docker-error">{{ dbError }}</div>
                <div v-if="dbResult" class="ops-db-meta">
                  {{ dbResult.rows.length }} 行{{ dbResult.truncated ? `（已截断，仅显示前 200 行）` : '' }}
                </div>
                <el-table
                  v-if="dbResult && dbResult.rows.length"
                  :data="dbResult.rows"
                  size="small"
                  height="100%"
                  class="ops-docker-table"
                  border
                >
                  <el-table-column
                    v-for="f in dbResult.fields"
                    :key="f"
                    :prop="f"
                    :label="f"
                    min-width="120"
                    show-overflow-tooltip
                  />
                </el-table>
                <div v-else-if="dbResult && !dbResult.rows.length" class="ops-empty">查询成功，0 行结果</div>
              </div>
            </el-tab-pane>

            <!-- 对话模式：内置运维助手（所有连接类型共用，LLM 参与运维） -->
            <el-tab-pane label="对话模式" name="chat">
              <div class="ops-chat">
                <div ref="chatListEl" class="ops-chat-list" @click="onMdClick">
                  <div v-if="!chatMessages.length" class="ops-empty">
                    与内置「运维助手」对话：描述运维任务（如"查看 nginx 容器日志"、"查一下 users 表最近 10 条"），
                    它会调用 ssh/docker/db 工具在选定连接上执行。<br />
                    会话独立于「任务」对话页，互不干扰；执行记录可在「操作日志」查看。
                  </div>
                  <div v-for="m in chatMessages" :key="m.id" :class="['ops-msg', m.role]">
                    <div class="ops-msg-role">
                      {{ m.role === 'user' ? '我' : (m.subAgentName || '运维助手') }}
                      <span v-if="m.streaming" class="ops-msg-streaming">输出中…</span>
                    </div>
                    <!-- 用户消息纯文本；助手消息 markdown 渲染（对齐主对话：代码高亮 + 复制 + 工具调用 chip） -->
                    <div v-if="m.role === 'user'" class="ops-msg-content">{{ m.content }}</div>
                    <div v-else class="ops-msg-content ops-md" v-html="renderAssistantMarkdown(m.content)"></div>
                  </div>
                </div>
                <div class="ops-chat-input">
                  <el-input
                    v-model="chatInput"
                    type="textarea"
                    :rows="2"
                    :disabled="chatStreaming"
                    placeholder="输入运维任务，Ctrl+Enter 发送"
                    @keydown.ctrl.enter="sendChat"
                  />
                  <div class="ops-chat-actions">
                    <span v-if="chatStreaming" class="form-tip">执行中…</span>
                    <el-button v-if="chatStreaming" size="small" type="warning" @click="abortChat">停止</el-button>
                    <el-button size="small" :disabled="chatStreaming || !chatInput.trim()" type="primary" @click="sendChat">发送</el-button>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 操作日志：ssh/docker/db 工具执行审计（LLM 调用明细见「工具与连接 → LLM 日志」页） -->
            <el-tab-pane label="操作日志" name="log">
              <div class="ops-audit">
                <div class="ops-docker-bar">
                  <el-button size="small" @click="loadAudit">刷新</el-button>
                  <span class="form-tip">ssh/docker/db 工具执行全量审计（含拒绝项）；LLM 调用明细在「工具与连接 → LLM 日志」按会话/模型统计</span>
                </div>
                <el-table v-if="auditEntries.length" :data="auditEntries" size="small" height="100%" class="ops-docker-table">
                  <el-table-column label="时间" width="100">
                    <template #default="{ row }">{{ fmtTime(row.at) }}</template>
                  </el-table-column>
                  <el-table-column prop="action" label="操作" width="150" show-overflow-tooltip />
                  <el-table-column prop="connection" label="连接" width="110" show-overflow-tooltip />
                  <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
                  <el-table-column label="结果" width="90">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败/拒绝' }}</el-tag>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-else class="ops-empty">暂无操作记录 —— 对话模式/工具执行的每一条 ssh/docker/db 操作都会落在这里</div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
        <div v-else class="ops-workspace-empty">
          <el-empty description="左侧选择或新建一个连接（SSH 服务器 / Docker 主机 / 数据库）" />
        </div>
      </section>
    </div>

    <!-- 日志弹窗 -->
    <el-dialog v-model="logDialog.visible" :title="`容器日志 · ${logDialog.container}`" width="780px" top="6vh">
      <pre class="ops-log-view">{{ logDialog.content || '加载中…' }}</pre>
    </el-dialog>

    <!-- 新建连接弹窗：先选资源类型（SSH / Docker / 数据库） -->
    <el-dialog v-model="addDialog.visible" title="新建连接" width="500px">
      <el-form label-width="90px">
        <el-form-item label="资源类型">
          <el-radio-group v-model="addDialog.type" @change="onTypeChange">
            <el-radio-button value="ssh">SSH 服务器</el-radio-button>
            <el-radio-button value="docker">Docker 主机</el-radio-button>
            <el-radio-button value="database">数据库</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="addDialog.type === 'docker'" label=" ">
          <span class="form-tip">通过 SSH 连到宿主机管理容器（复用 docker CLI），无需暴露 Docker 端口</span>
        </el-form-item>
        <el-form-item v-if="addDialog.type === 'database'" label="数据库类型">
          <el-radio-group v-model="addDialog.dbType" @change="onDbTypeChange">
            <el-radio value="mysql">MySQL</el-radio>
            <el-radio value="postgres">PostgreSQL</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="addDialog.name" placeholder="如 web-1 / 主库" /></el-form-item>
        <el-form-item label="主机"><el-input v-model="addDialog.host" placeholder="IP 或域名" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="addDialog.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="addDialog.username" :placeholder="addDialog.type === 'database' ? '数据库用户' : 'root'" /></el-form-item>
        <el-form-item v-if="addDialog.type === 'database'" label="库名">
          <el-input v-model="addDialog.database" placeholder="默认连接的数据库名" />
        </el-form-item>
        <el-form-item v-if="addDialog.type !== 'database'" label="认证方式">
          <el-radio-group v-model="addDialog.authType">
            <el-radio value="password">密码</el-radio>
            <el-radio value="key">私钥</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="addDialog.type === 'database' ? '密码' : (addDialog.authType === 'key' ? '私钥' : '密码')">
          <el-input
            v-model="addDialog.secret"
            :type="addDialog.type !== 'database' && addDialog.authType === 'key' ? 'textarea' : 'password'"
            :rows="4"
            show-password
            :placeholder="addDialog.type !== 'database' && addDialog.authType === 'key' ? 'PEM 私钥内容（OpenSSH 新格式需转 PEM）' : '密码'"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="addDialog.tag" placeholder="如 生产 / 测试（生产标签的写操作需二次确认）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitAddConnection">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import '@xterm/xterm/css/xterm.css';
import { api, API_BASE } from '../../api/client';
import { useSettingsStore } from '../../stores/settings';
import { usePlatformStore } from '../../stores/platform';

// ===== 连接管理 =====
type ConnType = 'ssh' | 'docker' | 'database';
interface OpsConn {
  id: string;
  type?: ConnType;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  tag?: string;
  dbType?: 'mysql' | 'postgres';
  database?: string;
}
const TYPE_LABELS: Record<ConnType, string> = { ssh: 'SSH', docker: 'Docker', database: '数据库' };
const connections = ref<OpsConn[]>([]);
const activeConnectionId = ref('');
const activeConnection = computed(() => connections.value.find((c) => c.id === activeConnectionId.value) || null);
const mode = ref<'term' | 'chat' | 'docker' | 'log' | 'db'>('term');

function connType(c: OpsConn | null): ConnType {
  return c?.type === 'docker' || c?.type === 'database' ? c.type : 'ssh';
}
function connSub(c: OpsConn): string {
  if (connType(c) === 'database') {
    return `${c.dbType === 'postgres' ? 'pgsql' : 'mysql'} · ${c.username}@${c.host}:${c.port}/${c.database || ''}`;
  }
  return `${c.username}@${c.host}:${c.port}`;
}
/** 连接类型 → 允许的工作区 tab（每种类型都有：专属远程操作页 + 对话模式 + 操作日志） */
function tabsFor(type: ConnType): Array<'term' | 'docker' | 'db' | 'chat' | 'log'> {
  if (type === 'ssh') return ['term', 'chat', 'log'];
  if (type === 'docker') return ['docker', 'chat', 'log'];
  return ['db', 'chat', 'log'];
}

function isProdTag(tag: string): boolean {
  const t = (tag || '').toLowerCase();
  return t.includes('生产') || t.includes('prod');
}

async function loadConnections() {
  const r = await api.get<OpsConn[]>('/plugin/ops-shell/connections');
  if ('data' in r) connections.value = r.data;
}
function selectConnection(c: OpsConn) {
  activeConnectionId.value = c.id;
  if (termOpen.value) closeTerminal();
  // 切换连接后当前 tab 可能不属于新类型（如 SSH 终端切到数据库连接），回落到该类型首个 tab
  const allowed = tabsFor(connType(c));
  if (!allowed.includes(mode.value)) mode.value = allowed[0];
}

const addDialog = ref({
  visible: false,
  type: 'ssh' as ConnType,
  name: '', host: '', port: 22, username: 'root',
  authType: 'password' as 'password' | 'key', secret: '', tag: '',
  dbType: 'mysql' as 'mysql' | 'postgres', database: '',
});
function openAddDialog() {
  addDialog.value = {
    visible: true, type: 'ssh', name: '', host: '', port: 22, username: 'root',
    authType: 'password', secret: '', tag: '', dbType: 'mysql', database: '',
  };
}
function onTypeChange() {
  const d = addDialog.value;
  d.port = d.type === 'database' ? (d.dbType === 'postgres' ? 5432 : 3306) : 22;
  if (d.type === 'database') d.username = '';
  else d.username = 'root';
}
function onDbTypeChange() {
  const d = addDialog.value;
  d.port = d.dbType === 'postgres' ? 5432 : 3306;
}

async function submitAddConnection() {
  const d = addDialog.value;
  if (!d.name || !d.host || !d.secret) { ElMessage.warning('名称 / 主机 / 密码或私钥必填'); return; }
  if (d.type === 'database' && !d.database) { ElMessage.warning('数据库连接必须填库名'); return; }
  const r = await api.post<OpsConn>('/plugin/ops-shell/connections', {
    type: d.type, name: d.name, host: d.host, port: d.port, username: d.username,
    authType: d.authType, secret: d.secret, tag: d.tag || undefined,
    dbType: d.type === 'database' ? d.dbType : undefined,
    database: d.type === 'database' ? d.database : undefined,
  });
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('连接已保存（密钥已加密存储）');
  addDialog.value.visible = false;
  await loadConnections();
}

async function testConnection(c: OpsConn) {
  ElMessage.info(`正在测试 ${c.name}…`);
  const r = await api.post<{ ok: boolean; error?: string }>(`/plugin/ops-shell/connections/${c.id}/test`, {});
  if ('data' in r && r.data.ok) ElMessage.success(`${c.name} 连接正常`);
  else ElMessage.error(`${c.name} 连接失败: ${('data' in r && r.data.error) || ('error' in r ? r.error : '未知错误')}`);
}

async function removeConnection(c: OpsConn) {
  await ElMessageBox.confirm(`删除连接「${c.name}」？`, '确认', { type: 'warning' });
  await api.delete(`/plugin/ops-shell/connections/${c.id}`);
  if (activeConnectionId.value === c.id) { activeConnectionId.value = ''; closeTerminal(); }
  await loadConnections();
}

// ===== 命令模式（xterm + SSE） =====
const termEl = ref<HTMLElement | null>(null);
const termOpen = ref(false);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let termSessionId = '';
let streamController: AbortController | null = null;

function b64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

async function openTerminal() {
  if (!activeConnection.value) return;
  const r = await api.post<{ sessionId: string }>('/plugin/ops-shell/term/open', {
    connectionId: activeConnection.value.id, cols: 120, rows: 32,
  });
  if ('error' in r) { ElMessage.error(r.error); return; }
  termSessionId = r.data.sessionId;
  termOpen.value = true;
  await nextTick();
  if (!termEl.value) return;
  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: { background: '#141414', foreground: '#E5E5E0' },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(termEl.value);
  fitAddon.fit();
  term.onData((data) => {
    void api.post(`/plugin/ops-shell/term/${termSessionId}/input`, { data });
  });
  term.onResize(({ cols, rows }) => {
    void api.post(`/plugin/ops-shell/term/${termSessionId}/resize`, { cols, rows });
  });
  streamController = new AbortController();
  const token = localStorage.getItem('auth_token') || '';
  void (async () => {
    try {
      const resp = await fetch(`${API_BASE}/plugin/ops-shell/term/${termSessionId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: streamController!.signal,
      });
      const reader = resp.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5);
          if (payload === ':connected') continue;
          try { term?.write(b64ToUtf8(payload)); } catch { /* 非 base64 帧（如心跳）忽略 */ }
        }
      }
    } catch { /* 会话关闭/网络中断，静默 */ }
  })();
  term.focus();
}

function closeTerminal() {
  if (termSessionId) void api.post(`/plugin/ops-shell/term/${termSessionId}/close`, {});
  streamController?.abort();
  streamController = null;
  term?.dispose();
  term = null; fitAddon = null;
  termSessionId = '';
  termOpen.value = false;
}

// ===== 对话模式：独立会话，不依赖全局 chat store =====
// 关键约束：普通对话页的 currentConvId/currentMessages 是全局单例状态，
// 这里绝不读写它们 —— 运维会话是独立 conversation 行（绑定 a_builtin_ops_agent），
// 消息走本组件自有列表 + 后端 message 表（含 tool_calls_json），互不串扰。
const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const OPS_AGENT_ID = 'a_builtin_ops_agent';
const OPS_CONV_KEY = 'ops-console:conv-id';

interface OpsMsg {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  subAgentName?: string | null;
  streaming?: boolean;
  createdAt: number;
}
const chatInput = ref('');
const chatStreaming = ref(false);
const chatMessages = ref<OpsMsg[]>([]);
const chatListEl = ref<HTMLElement | null>(null);
let chatAbort: AbortController | null = null;

async function ensureOpsConversation(): Promise<string> {
  const saved = localStorage.getItem(OPS_CONV_KEY);
  if (saved) {
    const r = await api.get<any[]>(`/conversations/${saved}/messages`);
    if (!('error' in r)) return saved; // 会话仍存在
  }
  const r = await api.post<any>('/conversations', { title: '运维控制台', agentId: OPS_AGENT_ID });
  if ('error' in r) throw new Error(r.error);
  const id = (r.data as any).id as string;
  localStorage.setItem(OPS_CONV_KEY, id);
  return id;
}

async function loadOpsMessages() {
  const convId = localStorage.getItem(OPS_CONV_KEY);
  if (!convId) return;
  const r = await api.get<any[]>(`/conversations/${convId}/messages`);
  if ('data' in r) {
    chatMessages.value = (r.data as any[]).map((m) => ({
      id: m.id, role: m.role, content: m.content || '',
      subAgentName: m.sub_agent_name || null, createdAt: m.created_at,
    }));
  }
}

function scrollChatBottom() {
  void nextTick(() => { if (chatListEl.value) chatListEl.value.scrollTop = chatListEl.value.scrollHeight; });
}

async function sendChat() {
  const content = chatInput.value.trim();
  if (!content || chatStreaming.value) return;
  const platform = platformStore.platforms.find((p) => p.id === settingsStore.settings.defaultPlatformId);
  const model = platformStore.models.find((m) => m.id === settingsStore.settings.defaultModelId);
  if (!platform || !model) {
    ElMessage.warning('请先在「设置」配置默认平台与模型（对话模式需要）');
    return;
  }
  let convId = localStorage.getItem(OPS_CONV_KEY);
  if (!convId) convId = await ensureOpsConversation();

  // 上下文提示：把当前选定连接（含类型）带给运维助手
  const c = activeConnection.value;
  let connHint: string;
  if (c) {
    const typeLabel = TYPE_LABELS[connType(c)];
    const extra =
      connType(c) === 'database' ? `，${c.dbType === 'postgres' ? 'PostgreSQL' : 'MySQL'}，库名 ${c.database || '（未指定）'}` : '';
    connHint = `\n\n（当前选定连接：${c.name}，类型 ${typeLabel}，${c.username}@${c.host}:${c.port}${extra}${c.tag ? '，标签 ' + c.tag : ''}）`;
  } else {
    connHint = '\n\n（尚未在左侧选定连接，请先选择或在工具参数里指定连接名）';
  }
  chatInput.value = '';
  chatStreaming.value = true;
  const userMsg: OpsMsg = { id: `local-${Date.now()}`, role: 'user', content, createdAt: Date.now() };
  chatMessages.value.push(userMsg);
  scrollChatBottom();

  chatAbort = new AbortController();
  try {
    const taskRes = await api.post<any>('/llm/tasks', {
      conversationId: convId,
      platformId: platform.id,
      modelId: model.id,
      userContent: content + connHint,
      agentId: OPS_AGENT_ID,
    });
    if ('error' in taskRes) throw new Error(taskRes.error);
    const taskId = taskRes.data.taskId as string;
    await subscribeOpsTask(taskId);
  } catch (e) {
    ElMessage.error('执行失败: ' + (e as Error).message);
  } finally {
    chatStreaming.value = false;
    chatAbort = null;
    // 服务端为准：结束后拉取规范消息列表（含子智能体消息与最终回复）
    await loadOpsMessages();
    scrollChatBottom();
  }
}

async function abortChat() {
  const convId = localStorage.getItem(OPS_CONV_KEY);
  if (!convId) return;
  chatAbort?.abort();
  try {
    const token = localStorage.getItem('auth_token') || '';
    // taskId 本地未存时按会话查活动任务
    const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
    const taskId = ('data' in r && r.data?.[0]?.id) || null;
    if (taskId) await fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* 忽略 */ }
}

/** 运维会话专属 SSE 订阅：与 chat store 的 subscribeTaskSse 同协议，但状态完全本地 */
async function subscribeOpsTask(taskId: string): Promise<void> {
  const token = localStorage.getItem('auth_token') || '';
  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=0`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: chatAbort!.signal,
  });
  if (!resp.ok || !resp.body) throw new Error('SSE 连接失败');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const raw of events) {
      const line = raw.trim();
      if (!line.startsWith('data: ')) continue;
      let event: any;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.type === 'message:added') {
        const msg = event.message;
        if (!chatMessages.value.some((m) => m.id === msg.id)) {
          chatMessages.value.push({
            id: msg.id, role: msg.role, content: msg.content || '',
            subAgentName: msg.subAgentName || msg.sub_agent_name || null,
            streaming: msg.role === 'assistant', createdAt: Date.now(),
          });
        }
        scrollChatBottom();
      } else if (event.type === 'chunk') {
        // 追加到最后一条流式中的助手消息（子智能体消息按名称单独成泡，chunk 不细分）
        const list = chatMessages.value;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].role === 'assistant' && list[i].streaming) {
            if (event.content) list[i].content += event.content;
            scrollChatBottom();
            break;
          }
        }
      } else if (event.type === 'task:completed' || event.type === 'task:error' || event.type === 'task:aborted') {
        for (const m of chatMessages.value) m.streaming = false;
        if (event.type === 'task:error' && event.error) {
          chatMessages.value.push({ id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${event.error}`, createdAt: Date.now() });
        }
        scrollChatBottom();
        return;
      }
    }
  }
  for (const m of chatMessages.value) m.streaming = false;
}

// ===== 助手消息 markdown 渲染（对齐主对话 ChatMessageList：工具块清理 + 代码高亮 + 复制） =====
const md = new MarkdownIt({
  html: false, linkify: true, breaks: true,
  highlight(str: string, lang: string): string {
    const codeClass = lang ? ` class="language-${lang}"` : '';
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const h = hljs.highlight(str, { language: lang }).value;
        return `<pre class="hljs ops-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
      } catch {}
    }
    return `<pre class="hljs ops-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

function renderAssistantMarkdown(content?: string): string {
  let c = content || '';
  // 与主对话同口径：隐藏文本模式工具调用块（执行记录在「操作日志」里看）
  c = c
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map((part) => {
    if (part === '[tool_call]') {
      return '<span class="ops-inline-tool">⚙ 正在调用工具</span>';
    }
    return md.render(part);
  }).join('');
}

// markdown 容器事件委托：复制按钮 / 链接新窗口
function onMdClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.classList.contains('code-copy-btn')) {
    const raw = t.getAttribute('data-code') || '';
    navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
      t.textContent = '已复制'; setTimeout(() => { t.textContent = '复制'; }, 1500);
    }).catch(() => {});
    return;
  }
  const a = (t as HTMLElement).closest('a');
  if (a) {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) { e.preventDefault(); window.open(href, '_blank', 'noopener'); }
  }
}

// ===== 容器面板（docker 类型连接） =====
interface DockerRow { Id?: string; Names?: string; Image?: string; State?: string; Status?: string; [k: string]: unknown }
const containers = ref<DockerRow[]>([]);
const containersError = ref('');

async function loadContainers() {
  if (!activeConnection.value) return;
  containersError.value = '';
  const r = await api.get<DockerRow[]>(`/plugin/ops-shell/docker/ps?connectionId=${activeConnection.value.id}`);
  if ('data' in r) containers.value = r.data;
  else containersError.value = r.error;
}

const logDialog = ref({ visible: false, container: '', content: '' });
async function viewLogs(row: DockerRow) {
  const container = String(row.Names || '').split(',')[0] || '';
  logDialog.value = { visible: true, container, content: '' };
  const r = await api.get<string>(`/plugin/ops-shell/docker/logs?connectionId=${activeConnection.value?.id}&container=${encodeURIComponent(container)}&tail=300`);
  logDialog.value.content = 'data' in r ? r.data : r.error;
}

async function restartContainer(row: DockerRow) {
  const container = String(row.Names || '').split(',')[0] || '';
  const isProd = !!activeConnection.value && isProdTag(activeConnection.value.tag || '');
  const confirmed = isProd
    ? await ElMessageBox.confirm(`生产连接：确认重启容器「${container}」？`, '二次确认', { type: 'warning' }).then(() => true).catch(() => false)
    : true;
  if (!confirmed) return;
  const r = await api.post<{ ok: boolean; output?: string }>('/plugin/ops-shell/docker/restart', {
    connectionId: activeConnection.value?.id, container, confirmed,
  });
  if ('data' in r && r.data.ok) { ElMessage.success(`容器 ${container} 已重启`); await loadContainers(); }
  else ElMessage.error('error' in r ? r.error : (r as { data: { output?: string } }).data.output || '重启失败');
}

// ===== 数据库面板（database 类型连接，只读） =====
const dbTables = ref<string[]>([]);
const dbTable = ref('');
const dbSql = ref('');
const dbLoading = ref(false);
const dbError = ref('');
const dbResult = ref<{ rows: Record<string, unknown>[]; fields: string[]; truncated?: boolean } | null>(null);

async function loadDbTables() {
  if (!activeConnection.value) return;
  const r = await api.get<string[]>(`/plugin/ops-shell/db/tables?connectionId=${activeConnection.value.id}`);
  if ('data' in r) dbTables.value = r.data;
  else dbError.value = r.error;
}

function onPickTable(t: string) {
  if (!t) return;
  dbSql.value = `SELECT * FROM ${t} LIMIT 20`;
}

async function runDbQuery() {
  const c = activeConnection.value;
  if (!c || !dbSql.value.trim() || dbLoading.value) return;
  dbLoading.value = true;
  dbError.value = '';
  dbResult.value = null;
  const r = await api.post<{ rows: Record<string, unknown>[]; fields: string[]; truncated?: boolean }>(
    '/plugin/ops-shell/db/query',
    { connectionId: c.id, sql: dbSql.value },
  );
  dbLoading.value = false;
  if ('data' in r) dbResult.value = r.data;
  else dbError.value = r.error;
}

// ===== 操作日志 =====
interface AuditEntry { at: number; action: string; connection?: string; detail?: string; ok: boolean }
const auditEntries = ref<AuditEntry[]>([]);
async function loadAudit() {
  const r = await api.get<AuditEntry[]>('/plugin/ops-shell/audit');
  if ('data' in r) auditEntries.value = r.data;
}
function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===== 初始化 =====
function init() {
  void loadConnections().then(() => {
    if (connections.value.length && !activeConnectionId.value) {
      activeConnectionId.value = connections.value[0].id;
      mode.value = tabsFor(connType(connections.value[0]))[0];
    }
  });
  void ensureOpsConversation().then(() => loadOpsMessages()).catch(() => { /* 对话初始化失败不阻塞 */ });
  void loadAudit();
  if (!platformStore.platforms.length) {
    void platformStore.loadPlatforms().then(() => {
      const pid = settingsStore.settings.defaultPlatformId;
      if (pid && !platformStore.models.some((m) => m.platformId === pid)) void platformStore.loadModels(pid);
    });
  }
}
init();

onUnmounted(() => {
  closeTerminal();
  chatAbort?.abort();
});
</script>

<style scoped>
.ops-console { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.ops-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.ops-layout { flex: 1; display: flex; gap: 14px; min-height: 0; }
.ops-connections {
  width: 240px; flex-shrink: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
}
.ops-conn-item {
  border: 1px solid var(--glass-border); border-radius: 10px;
  padding: 10px 12px; cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.ops-conn-item:hover { background: var(--glass-bg-hover); }
.ops-conn-item.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 6%, transparent); }
.ops-conn-main { display: flex; align-items: center; gap: 6px; }
.ops-conn-name { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-conn-type {
  flex-shrink: 0; font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--color-surface-hover); color: var(--color-text-secondary);
}
.ops-conn-type[data-type='docker'] { color: #2563eb; background: rgba(37, 99, 235, 0.1); }
.ops-conn-type[data-type='database'] { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
.ops-conn-sub { font-size: 11px; color: var(--color-text-secondary); margin: 3px 0 4px; word-break: break-all; }
.ops-conn-actions { display: flex; gap: 4px; }
.ops-empty { font-size: 12px; color: var(--color-text-secondary); padding: 16px 4px; text-align: center; }
.ops-workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ops-workspace-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.ops-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ops-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.ops-tabs :deep(.el-tab-pane) { height: 100%; }

/* 终端 */
.ops-term-wrap { height: 100%; display: flex; flex-direction: column; gap: 8px; }
.ops-term-bar { display: flex; align-items: center; justify-content: space-between; }
.ops-term-conn { font-size: 12px; color: var(--color-text-secondary); font-family: Consolas, monospace; }
.ops-term { flex: 1; min-height: 0; border-radius: 10px; overflow: hidden; background: #141414; padding: 6px; }
.ops-term-empty {
  flex: 1; min-height: 0; border-radius: 10px;
  border: 1px dashed var(--glass-border);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
}
.ops-term-empty-title { font-size: 14px; font-weight: 600; color: var(--color-text-secondary); }
.ops-term-empty-sub { font-size: 12px; color: var(--color-text-tertiary); }

/* 对话模式 */
.ops-chat { height: 100%; display: flex; flex-direction: column; gap: 10px; }
.ops-chat-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px; }
.ops-msg { max-width: 82%; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
.ops-msg.user { align-self: flex-end; background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.ops-msg.assistant { align-self: flex-start; background: var(--glass-bg); border: 1px solid var(--glass-border); }
.ops-msg-role { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 3px; }
.ops-msg-streaming { color: var(--color-primary); }
.ops-msg-content { white-space: pre-wrap; word-break: break-word; }

/* markdown 内容区：关闭 pre-wrap，交给 md 排版 */
.ops-md { white-space: normal; }
.ops-md :deep(p) { margin: 4px 0; }
.ops-md :deep(ul), .ops-md :deep(ol) { margin: 4px 0; padding-left: 20px; }
.ops-md :deep(h1), .ops-md :deep(h2), .ops-md :deep(h3), .ops-md :deep(h4) { margin: 8px 0 4px; font-size: 14px; }
.ops-md :deep(table) { border-collapse: collapse; margin: 6px 0; font-size: 12px; display: block; overflow-x: auto; }
.ops-md :deep(th), .ops-md :deep(td) { border: 1px solid var(--glass-border); padding: 4px 8px; text-align: left; }
.ops-md :deep(code:not(pre code)) {
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: Consolas, monospace;
}
.ops-md :deep(pre.ops-code) {
  position: relative; margin: 6px 0; padding: 26px 10px 8px;
  background: #1e1e2e; border-radius: 8px; overflow-x: auto;
}
.ops-md :deep(pre.ops-code code) { background: transparent; color: #dcdce0; font-size: 12px; font-family: Consolas, monospace; }
.ops-md :deep(.code-lang) { position: absolute; top: 5px; left: 10px; font-size: 10px; color: #8a8a99; }
.ops-md :deep(.code-copy-btn) {
  position: absolute; top: 4px; right: 6px; font-size: 11px;
  color: #b8b8c4; background: rgba(255,255,255,0.08); border: none;
  border-radius: 5px; padding: 2px 8px; cursor: pointer;
}
.ops-md :deep(.code-copy-btn:hover) { background: rgba(255,255,255,0.16); }
.ops-md :deep(a) { color: var(--color-primary); }
.ops-inline-tool {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--color-text-secondary);
  border: 1px dashed var(--glass-border); border-radius: 999px; padding: 1px 8px; margin: 2px 0;
}

.ops-chat-input { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.ops-chat-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }

/* 容器 / 数据库 / 操作日志 */
.ops-docker { height: 100%; display: flex; flex-direction: column; gap: 8px; }
.ops-audit { height: 100%; display: flex; flex-direction: column; gap: 8px; }
.ops-docker-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ops-docker-error { font-size: 12px; color: var(--el-color-danger); }
.ops-docker-table { flex: 1; min-height: 0; }
.ops-log-view {
  max-height: 60vh; overflow: auto; font-size: 12px; line-height: 1.5;
  background: var(--el-bg-color); padding: 12px; border-radius: 8px;
  white-space: pre-wrap; word-break: break-all; font-family: Consolas, monospace;
}

/* 数据库查询面板 */
.ops-db { height: 100%; display: flex; flex-direction: column; gap: 8px; }
.ops-db-table-select { width: 220px; }
.ops-db-sql :deep(textarea) { font-family: Consolas, monospace; font-size: 12px; }
.ops-db-meta { font-size: 11px; color: var(--color-text-tertiary); }
</style>
