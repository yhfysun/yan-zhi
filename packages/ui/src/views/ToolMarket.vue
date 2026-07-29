<template>
  <div class="page">
    <div class="page-top">
      <div class="page-info">
        <h2 class="page-title">工具管理</h2>
        <p class="page-sub">管理 MCP 服务和工具商城</p>
      </div>
    </div>

    <!-- ========== 视图容器 ========== -->
    <Transition name="view-fade" mode="out-in">
    <div v-if="activeMarketId === null" key="main">
      <!-- MCP 服务概览区 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">MCP 服务</h3>
          <div class="section-header-right">
            <el-input
              v-model="mcpSearch"
              size="small"
              placeholder="搜索服务..."
              :prefix-icon="SearchIcon"
              clearable
              style="width: 200px"
            />
            <el-button type="primary" size="small" @click="openMcpAdd">
              <el-icon><Plus /></el-icon> 新增服务
            </el-button>
          </div>
        </div>
        <el-empty v-if="mcpStore.servers.length === 0" description="暂无 MCP 服务" :image-size="60">
          <el-button type="primary" size="small" @click="openMcpAdd">新增服务</el-button>
        </el-empty>
        <div v-else class="mcp-scroll">
          <div
            v-for="s in filteredMcpServers"
            :key="s.id"
            class="mcp-mini-card"
            :class="{ connected: s.status === 'connected' }"
          >
            <div class="mcp-mini-card-top">
              <div class="mcp-mini-card-icon" :class="s.status">
                <el-icon :size="18"><Connection /></el-icon>
              </div>
              <div class="mcp-mini-card-body">
                <span class="mcp-mini-name">
                  {{ s.name }}
                  <span class="status-dot" :class="s.status || 'disconnected'"></span>
                </span>
                <div class="mcp-mini-meta">
                  <el-tag size="small" effect="plain" type="info">{{ s.transport.toUpperCase() }}</el-tag>
                  <span class="mcp-mini-tools">{{ (mcpStore.tools[s.id] || []).length }} 工具</span>
                </div>
              </div>
            </div>
            <div class="mcp-mini-card-actions">
              <el-tooltip :content="s.status === 'connected' ? '重连' : '连接'" placement="top">
                <el-button
                  size="small" circle
                  :type="s.status === 'connected' ? '' : 'primary'"
                  :loading="mcpStore.connecting === s.id"
                  @click.stop="connectMcp(s.id)"
                ><el-icon :size="14"><Link /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="工具" placement="top">
                <el-button size="small" circle :disabled="s.status !== 'connected'" @click.stop="showMcpTools(s.id)"><el-icon :size="14"><Switch /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="详情" placement="top">
                <el-button size="small" circle @click.stop="showMcpDetail(s)"><el-icon :size="14"><InfoFilled /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" circle @click.stop="editMcpServer(s)"><el-icon :size="14"><Edit /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" circle type="danger" @click.stop="delMcp(s.id)"><el-icon :size="14"><DeleteIcon /></el-icon></el-button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </section>

      <!-- 工具商城区 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">工具商城</h3>
          <el-button type="primary" size="small" @click="showSourceForm = true">
            <el-icon><Plus /></el-icon> 新增远程商城
          </el-button>
        </div>
        <div class="market-grid">
          <!-- 本地商城卡片（始终存在） -->
          <div class="market-card local" @click="activeMarketId = 'local'">
            <div class="market-card-cover">
              <div class="market-card-icon local-icon">
                <el-icon :size="28"><HomeFilled /></el-icon>
              </div>
            </div>
            <div class="market-card-body">
              <span class="market-card-name">本地商城</span>
              <span class="market-card-meta">
                {{ toolsStore.builtinTools.length }} 内置 · {{ toolsStore.customTools.length }} 自定义
              </span>
            </div>
            <div class="market-card-badge local-badge">本机</div>
          </div>

          <!-- 远程商城源卡片 -->
          <div
            v-for="s in toolsStore.remoteSources"
            :key="s.id"
            class="market-card remote"
            @click="enterRemoteMarket(s)"
          >
            <div class="market-card-cover">
              <div class="market-card-icon remote-icon">
                <el-icon :size="28"><Cloudy /></el-icon>
              </div>
            </div>
            <div class="market-card-body">
              <span class="market-card-name">{{ s.name }}</span>
              <span class="market-card-meta">{{ s.base_url }}</span>
            </div>
            <div class="market-card-badge remote-badge">远程</div>
          </div>
        </div>

        <el-empty
          v-if="toolsStore.remoteSources.length === 0"
          description="暂无远程商城，点击上方按钮添加其他节点"
          :image-size="60"
        />
      </section>
    </div>

    <!-- ========== 子视图：本地商城 ========== -->
    <div v-else-if="activeMarketId === 'local'" key="local">
      <div class="sub-header">
        <el-button text size="small" @click="activeMarketId = null">
          <el-icon><ArrowLeft /></el-icon> 返回商城列表
        </el-button>
        <div class="sub-header-info">
          <h3 class="sub-title">本地商城</h3>
          <span class="sub-meta">{{ toolsStore.builtinTools.length }} 内置 · {{ toolsStore.customTools.length }} 自定义</span>
        </div>
      </div>

      <!-- 内置工具 -->
      <section class="section">
        <h4 class="subsection-title">内置工具</h4>
        <el-empty v-if="toolsStore.builtinTools.length === 0" description="暂无内置工具" :image-size="60" />
        <div v-else class="card-grid">
          <div v-for="t in toolsStore.builtinTools" :key="t.name" class="tool-card">
            <div class="tool-card-header">
              <el-icon :size="16" class="tool-icon"><Switch /></el-icon>
              <span class="tool-card-name">{{ t.name }}</span>
              <el-tag size="small" type="info" effect="plain">内置</el-tag>
            </div>
            <p class="tool-card-desc" :title="t.description">{{ t.description }}</p>
          </div>
        </div>
      </section>

      <!-- 自定义工具 -->
      <section class="section">
        <div class="section-header">
          <h4 class="subsection-title">自定义工具</h4>
          <el-button type="primary" size="small" @click="openEditor(null)">
            <el-icon><Plus /></el-icon> 新增工具
          </el-button>
        </div>
        <el-empty v-if="toolsStore.customTools.length === 0" description="暂无自定义工具，点击上方按钮创建" :image-size="60" />
        <div v-else class="card-grid">
          <div
            v-for="t in toolsStore.customTools"
            :key="t.id"
            class="tool-card"
            :class="{ disabled: !t.enabled }"
          >
            <div class="tool-card-header">
              <el-icon :size="16" class="tool-icon"><Switch /></el-icon>
              <span class="tool-card-name">{{ t.name }}</span>
              <el-tag size="small" :type="t.source === 'remote' ? 'warning' : 'success'" effect="plain">
                {{ t.source === 'remote' ? '远程' : '本地' }}
              </el-tag>
              <el-tag v-if="t.isPublic" size="small" type="primary" effect="plain">已公开</el-tag>
            </div>
            <p class="tool-card-desc" :title="t.description || '无描述'">{{ t.description || '无描述' }}</p>
            <div class="tool-card-foot">
              <span class="stat">{{ t.runtime }} · {{ t.timeout }}ms</span>
              <div class="card-actions">
                <el-switch
                  v-model="t.enabled"
                  size="small"
                  @change="(v: boolean) => toolsStore.toggleEnabled(t.id, v)"
                />
                <el-button size="small" link @click="openEditor(t)">编辑</el-button>
                <el-button size="small" link type="danger" @click="delCustomTool(t.id)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ========== 子视图：远程商城 ========== -->
    <div v-else key="remote">
      <div class="sub-header">
        <el-button text size="small" @click="activeMarketId = null">
          <el-icon><ArrowLeft /></el-icon> 返回商城列表
        </el-button>
        <div class="sub-header-info">
          <h3 class="sub-title">{{ activeRemoteSource?.name }}</h3>
          <span class="sub-meta url">{{ activeRemoteSource?.base_url }}</span>
        </div>
        <div class="sub-header-actions">
          <el-button size="small" @click="testSource(activeMarketId)">测试连接</el-button>
          <el-button size="small" type="danger" @click="delSource(activeMarketId)">删除源</el-button>
        </div>
      </div>

      <el-empty v-if="!remoteToolsLoaded" description="正在加载远程工具..." :image-size="60" />
      <el-empty v-else-if="!remoteTools.length" description="该远程源暂无公开的自定义工具" :image-size="60" />
      <div v-else class="card-grid">
        <div v-for="item in remoteTools" :key="item.id" class="tool-card">
          <div class="tool-card-header">
            <el-icon :size="16" class="tool-icon"><Switch /></el-icon>
            <span class="tool-card-name">{{ item.name }}</span>
            <el-tag size="small" type="warning" effect="plain">远程</el-tag>
          </div>
          <p class="tool-card-desc" :title="item.description || '无描述'">{{ item.description || '无描述' }}</p>
          <div class="tool-card-foot">
            <el-button size="small" type="primary" @click="installTool(item)">安装到本地</el-button>
          </div>
        </div>
      </div>
    </div>
    </Transition>

    <!-- ========== MCP 新增/编辑 Dialog ========== -->
    <el-dialog v-model="showMcpForm" :title="editingMcp ? '编辑 MCP 服务' : '新增 MCP 服务'" width="560px" @close="cancelMcpDialog">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="mcpForm.name" placeholder="如：filesystem" />
        </el-form-item>
        <el-form-item label="协议">
          <el-segmented v-model="mcpForm.transport" :options="transportOptions" />
        </el-form-item>
        <template v-if="mcpForm.transport === 'stdio'">
          <el-alert v-if="!mcpStore.isDesktop()" title="当前为浏览器环境，stdio 协议仅在桌面端可用" type="warning" :closable="false" show-icon style="margin-bottom:12px" />
          <el-form-item label="命令"><el-input v-model="mcpForm.command" placeholder="如：npx" /></el-form-item>
          <el-form-item label="参数">
            <el-input v-model="mcpArgsText" type="textarea" :rows="2" placeholder="一行一个参数，如：-y\n@modelcontextprotocol/server-filesystem\n/tmp" />
          </el-form-item>
          <el-form-item label="环境变量">
            <el-input v-model="mcpEnvText" type="textarea" :rows="2" placeholder="KEY=value 一行一个" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="URL">
            <el-input v-model="mcpForm.url" placeholder="https://example.com/mcp" />
            <div class="form-tip">
              <template v-if="mcpForm.transport === 'sse'">SSE 端点 URL，系统自动解析 endpoint 事件</template>
              <template v-else>Streamable HTTP JSON-RPC 端点</template>
              <span class="form-tip-warn" v-if="!mcpStore.isDesktop()"> · 浏览器端需服务端支持 CORS</span>
            </div>
          </el-form-item>
          <el-form-item label="Headers">
            <el-input v-model="mcpHeadersText" type="textarea" :rows="2" placeholder="Key: Value 一行一个（可选）" />
          </el-form-item>
        </template>
        <el-form-item label="自动重连"><el-switch v-model="mcpForm.autoReconnect" /></el-form-item>
        <el-form-item label="重连间隔"><el-input-number v-model="mcpForm.reconnectInterval" :min="1000" :step="1000" style="width:180px" /> ms</el-form-item>
        <el-form-item label="启动时连接"><el-switch v-model="mcpForm.autoConnect" /></el-form-item>
      </el-form>

      <div class="dialog-actions-bar">
        <el-button :loading="testingMcpForm" :icon="Connection" @click="testMcpForm">测试连接</el-button>
        <span v-if="mcpFormStatus" :class="['form-status', mcpFormStatusType]">{{ mcpFormStatus }}</span>
      </div>

      <div v-if="mcpPreviewTools.length > 0" class="preview-tools">
        <div class="preview-header">预览到 {{ mcpPreviewTools.length }} 个工具</div>
        <div class="preview-list">
          <div v-for="t in mcpPreviewTools" :key="t.name" class="preview-item">
            <span class="tool-name">{{ t.name }}</span>
            <span class="tool-desc">{{ t.description || '无描述' }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="cancelMcpDialog">取消</el-button>
        <el-button type="primary" :loading="savingMcp" @click="saveMcp">保存</el-button>
      </template>
    </el-dialog>

    <!-- ========== MCP 详情 Dialog ========== -->
    <el-dialog v-model="showMcpDetailDialog" title="MCP 服务详情" width="540px">
      <template v-if="detailMcpServer">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="名称">{{ detailMcpServer.name }}</el-descriptions-item>
          <el-descriptions-item label="协议">{{ detailMcpServer.transport.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item v-if="detailMcpServer.transport === 'stdio'" label="命令">{{ detailMcpServer.command }} {{ (detailMcpServer.args || []).join(' ') }}</el-descriptions-item>
          <el-descriptions-item v-else label="URL">{{ detailMcpServer.url }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detailMcpServer.status === 'connected' ? 'success' : 'info'" size="small">
              {{ detailMcpServer.status === 'connected' ? '已连接' : '未连接' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="工具数">{{ (mcpStore.tools[detailMcpServer.id] || []).length }}</el-descriptions-item>
          <el-descriptions-item label="自动重连">{{ detailMcpServer.autoReconnect ? '是' : '否' }}</el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="showMcpDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ========== MCP 工具列表 Dialog ========== -->
    <el-dialog v-model="showMcpToolsDialog" :title="`工具列表（${mcpCurrentTools.length}）`" width="680px">
      <div class="tools-dialog-body">
        <el-empty v-if="mcpCurrentTools.length === 0" description="暂无工具" :image-size="80" />
        <div v-for="t in mcpCurrentTools" :key="t.name" class="tool-dialog-item" :class="{ disabled: !mcpToolEnabled[t.name] }">
          <div class="tool-dialog-left">
            <span class="tool-dialog-name">{{ t.name }}</span>
            <span v-if="t.description" class="tool-dialog-desc" :title="t.description">{{ t.description }}</span>
          </div>
          <div class="tool-dialog-right">
            <el-switch
              v-model="mcpToolEnabled[t.name]"
              size="small"
              @change="(v: boolean) => onMcpToolToggle(t, v)"
            />
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- ========== 自定义工具 Dialog ========== -->
    <el-dialog
      v-model="showCustomEditor"
      :title="editingTool ? '编辑工具' : '新增自定义工具'"
      width="640px"
      @close="resetEditor"
    >
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="editor.name" placeholder="工具名称（英文）" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="editor.description" placeholder="给 LLM 看的描述" /></el-form-item>
        <el-form-item label="入口函数"><el-input v-model="editor.entry" placeholder="如: myToolHandler" /></el-form-item>
        <el-form-item label="输入 Schema">
          <el-input
            v-model="editor.schemaText"
            type="textarea"
            :rows="4"
            placeholder='{"type":"object","properties":{"key":{"type":"string"}}}'
          />
        </el-form-item>
        <el-form-item label="JS 代码">
          <el-input
            v-model="editor.code"
            type="textarea"
            :rows="10"
            class="code-input"
            placeholder="function myToolHandler(args) { return args.key + ' result'; }"
          />
        </el-form-item>
        <el-form-item label="超时(ms)">
          <el-input-number v-model="editor.timeout" :min="1000" :step="1000" />
        </el-form-item>
        <el-form-item label="发布到商城"><el-switch v-model="editor.isPublic" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCustomEditor = false">取消</el-button>
        <el-button type="primary" :loading="savingCustom" @click="saveCustomTool">保存</el-button>
      </template>
    </el-dialog>

    <!-- ========== 远程商城源 Dialog ========== -->
    <el-dialog v-model="showSourceForm" title="添加远程工具商城" width="480px" @close="resetSourceForm">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="sourceForm.name" placeholder="如: 我的节点" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="sourceForm.baseUrl" placeholder="http://192.168.1.100:3001" /></el-form-item>
        <el-form-item label="认证类型">
          <el-select v-model="sourceForm.authType">
            <el-option label="无认证" value="none" />
            <el-option label="Bearer Token" value="bearer" />
            <el-option label="API Key" value="api-key" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="sourceForm.authType !== 'none'" label="凭证">
          <el-input v-model="sourceForm.authValue" :placeholder="sourceForm.authType === 'bearer' ? 'Token' : 'API Key'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSourceForm = false">取消</el-button>
        <el-button type="primary" @click="addSource">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { McpTransport } from '@yan-zhi/shared';
import {
  Plus, Connection, Switch, Delete as DeleteIcon,
  ArrowLeft, ArrowRight, HomeFilled, Cloudy, Search,
  Link, InfoFilled, Edit,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMcpStore } from '../stores';
import { useToolsStore } from '../stores/tools';

const SearchIcon = Search;
const mcpStore = useMcpStore();
const toolsStore = useToolsStore();

// ---- 视图切换 ----
const activeMarketId = ref<string | null>(null);
const activeRemoteSource = computed(() =>
  toolsStore.remoteSources.find(s => s.id === activeMarketId.value)
);

// ---- MCP 搜索 ----
const mcpSearch = ref('');
const filteredMcpServers = computed(() => {
  const q = mcpSearch.value.toLowerCase().trim();
  if (!q) return mcpStore.servers;
  return mcpStore.servers.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.transport.toLowerCase().includes(q) ||
    (s.url && s.url.toLowerCase().includes(q))
  );
});

// ---- MCP 连接/删除 ----
async function connectMcp(id: string) {
  const r = await mcpStore.connect(id);
  ElMessage[r.ok ? 'success' : 'error'](r.msg);
}
async function delMcp(id: string) {
  try {
    await ElMessageBox.confirm('删除该 MCP 服务？关联工具也会一并删除', '提示', { type: 'warning' });
    await mcpStore.deleteServer(id);
    ElMessage.success('已删除');
  } catch {}
}

// ---- MCP 详情 ----
const showMcpDetailDialog = ref(false);
const detailMcpServer = ref<any>(null);
function showMcpDetail(s: any) {
  detailMcpServer.value = s;
  showMcpDetailDialog.value = true;
}

// ---- MCP 工具列表 ----
const showMcpToolsDialog = ref(false);
const mcpToolsServerId = ref('');
const mcpCurrentTools = computed(() => mcpStore.tools[mcpToolsServerId.value] || []);
const mcpToolEnabled = ref<Record<string, boolean>>({});

function showMcpTools(id: string) {
  mcpToolsServerId.value = id;
  const tools = mcpStore.tools[id] || [];
  for (const t of tools) {
    if (!(t.name in mcpToolEnabled.value)) {
      mcpToolEnabled.value[t.name] = t.enabled !== false;
    }
  }
  showMcpToolsDialog.value = true;
}
async function onMcpToolToggle(t: any, v: boolean) {
  mcpToolEnabled.value[t.name] = v;
  await mcpStore.setToolEnabled(mcpToolsServerId.value, t.name, v);
}

// ---- MCP 新增/编辑 Dialog ----
const showMcpForm = ref(false);
const editingMcp = ref<any>(null);
const savingMcp = ref(false);
const testingMcpForm = ref(false);
const mcpFormStatus = ref('');
const mcpFormStatusType = ref<'ok' | 'err'>('ok');
const mcpPreviewTools = ref<any[]>([]);
const transportOptions = [
  { label: 'stdio', value: 'stdio' },
  { label: 'SSE', value: 'sse' },
  { label: 'HTTP', value: 'http' },
];

const mcpForm = ref({
  name: '', transport: 'stdio' as McpTransport,
  command: '', url: '', autoReconnect: true, reconnectInterval: 5000, autoConnect: true,
});
const mcpArgsText = ref('');
const mcpEnvText = ref('');
const mcpHeadersText = ref('');

function openMcpAdd() {
  editingMcp.value = null;
  resetMcpForm();
  showMcpForm.value = true;
}

function editMcpServer(s: any) {
  editingMcp.value = s;
  mcpForm.value = {
    name: s.name, transport: s.transport,
    command: s.command || '', url: s.url || '',
    autoReconnect: s.autoReconnect !== false,
    reconnectInterval: s.reconnectInterval || 5000,
    autoConnect: s.autoConnect !== false,
  };
  mcpArgsText.value = (s.args || []).join('\n');
  mcpEnvText.value = Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n');
  mcpHeadersText.value = Object.entries(s.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  showMcpForm.value = true;
}

function cancelMcpDialog() {
  if (testingMcpForm.value) mcpStore.cancelTest();
  showMcpForm.value = false;
  testingMcpForm.value = false;
  mcpFormStatus.value = '';
  mcpPreviewTools.value = [];
}

function resetMcpForm() {
  mcpForm.value = { name: '', transport: 'stdio', command: '', url: '', autoReconnect: true, reconnectInterval: 5000, autoConnect: true };
  mcpArgsText.value = '';
  mcpEnvText.value = '';
  mcpHeadersText.value = '';
  mcpFormStatus.value = '';
  mcpPreviewTools.value = [];
}

function parseMcpForm() {
  const args = mcpArgsText.value.split('\n').map(s => s.trim()).filter(Boolean);
  const env: Record<string, string> = {};
  mcpEnvText.value.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  const headers: Record<string, string> = {};
  mcpHeadersText.value.split('\n').forEach(line => {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].trim()] = m[2].trim();
  });
  return { args, env, headers };
}

async function testMcpForm() {
  if (mcpForm.value.transport === 'stdio' && !mcpForm.value.command) { ElMessage.warning('请填写 command'); return; }
  if (mcpForm.value.transport !== 'stdio' && !mcpForm.value.url) { ElMessage.warning('请填写 URL'); return; }
  testingMcpForm.value = true;
  mcpFormStatus.value = '';
  mcpPreviewTools.value = [];
  try {
    const { args, env, headers } = parseMcpForm();
    const r = await mcpStore.testServerConfig({
      transport: mcpForm.value.transport, command: mcpForm.value.command,
      args, env, url: mcpForm.value.url, headers,
    });
    if (r.ok) {
      mcpFormStatus.value = `${r.msg}（${r.durationMs}ms）`;
      mcpFormStatusType.value = 'ok';
      mcpPreviewTools.value = r.tools || [];
    } else {
      mcpFormStatus.value = r.msg;
      mcpFormStatusType.value = 'err';
      ElMessage.error(r.msg);
    }
  } finally {
    testingMcpForm.value = false;
  }
}

async function saveMcp() {
  if (!mcpForm.value.name) { ElMessage.warning('名称必填'); return; }
  if (mcpForm.value.transport === 'stdio' && !mcpForm.value.command) { ElMessage.warning('stdio 需要 command'); return; }
  if (mcpForm.value.transport !== 'stdio' && !mcpForm.value.url) { ElMessage.warning('sse/http 需要 URL'); return; }

  savingMcp.value = true;
  try {
    const { args, env, headers } = parseMcpForm();
    if (editingMcp.value) {
      await mcpStore.updateServer(editingMcp.value.id, {
        name: mcpForm.value.name, transport: mcpForm.value.transport,
        command: mcpForm.value.command, args, env, url: mcpForm.value.url, headers,
        autoReconnect: mcpForm.value.autoReconnect, reconnectInterval: mcpForm.value.reconnectInterval,
        autoConnect: mcpForm.value.autoConnect,
      });
      showMcpForm.value = false;
      resetMcpForm();
      ElMessage.success('已更新');
    } else {
      const server = await mcpStore.addServer({
        name: mcpForm.value.name, transport: mcpForm.value.transport,
        command: mcpForm.value.command, args, env, url: mcpForm.value.url, headers,
        autoReconnect: mcpForm.value.autoReconnect, reconnectInterval: mcpForm.value.reconnectInterval,
        autoConnect: mcpForm.value.autoConnect,
      });
      showMcpForm.value = false;
      resetMcpForm();
      ElMessage.success('已添加，正在连接…');
      const r = await mcpStore.connect(server.id);
      if (r.ok) ElMessage.success(r.msg);
      else ElMessage.warning(r.msg);
    }
  } finally {
    savingMcp.value = false;
  }
}

// ---- 远程工具 ----
const remoteTools = ref<any[]>([]);
const remoteToolsLoaded = ref(false);

function enterRemoteMarket(s: any) {
  activeMarketId.value = s.id;
  remoteToolsLoaded.value = false;
  remoteTools.value = [];
  toolsStore.fetchRemoteItems(s.id).then(() => {
    remoteTools.value = toolsStore.remoteItems[s.id] || [];
    remoteToolsLoaded.value = true;
  });
}

onMounted(() => {
  mcpStore.loadServers();
  toolsStore.loadCustomTools();
  toolsStore.loadRemoteSources();
});

// ---- 自定义工具编辑器 ----
const showCustomEditor = ref(false);
const editingTool = ref<any>(null);
const savingCustom = ref(false);
const editor = ref({
  name: '', description: '', entry: '',
  schemaText: '{}', code: '', timeout: 30000, isPublic: false,
});

function openEditor(t: any | null) {
  if (t) {
    editingTool.value = t;
    editor.value = {
      name: t.name, description: t.description || '',
      entry: t.entry, schemaText: JSON.stringify(t.inputSchema, null, 2),
      code: t.code, timeout: t.timeout, isPublic: t.isPublic,
    };
  } else {
    editingTool.value = null;
    editor.value = { name: '', description: '', entry: '', schemaText: '{}', code: '', timeout: 30000, isPublic: false };
  }
  showCustomEditor.value = true;
}

function resetEditor() {
  editor.value = { name: '', description: '', entry: '', schemaText: '{}', code: '', timeout: 30000, isPublic: false };
  editingTool.value = null;
}

async function saveCustomTool() {
  if (!editor.value.name || !editor.value.code || !editor.value.entry) {
    ElMessage.warning('名称、入口函数和代码为必填项');
    return;
  }
  savingCustom.value = true;
  try {
    let schema: Record<string, unknown>;
    try { schema = JSON.parse(editor.value.schemaText); } catch { ElMessage.warning('输入 Schema 格式错误'); return; }
    if (editingTool.value) {
      await toolsStore.updateTool(editingTool.value.id, {
        name: editor.value.name, description: editor.value.description,
        code: editor.value.code, entry: editor.value.entry,
        inputSchema: schema, timeout: editor.value.timeout, isPublic: editor.value.isPublic,
      });
    } else {
      await toolsStore.createTool({
        name: editor.value.name, description: editor.value.description,
        entry: editor.value.entry, inputSchema: schema,
        code: editor.value.code, timeout: editor.value.timeout, isPublic: editor.value.isPublic,
      });
    }
    showCustomEditor.value = false;
    resetEditor();
    ElMessage.success('保存成功');
  } finally { savingCustom.value = false; }
}

async function delCustomTool(id: string) {
  try {
    await ElMessageBox.confirm('删除该自定义工具？', '提示', { type: 'warning' });
    await toolsStore.deleteTool(id);
    ElMessage.success('已删除');
  } catch {}
}

// ---- 远程源管理 ----
const showSourceForm = ref(false);
const sourceForm = ref({ name: '', baseUrl: '', authType: 'none' as string, authValue: '' });

function resetSourceForm() { sourceForm.value = { name: '', baseUrl: '', authType: 'none', authValue: '' }; }

async function addSource() {
  if (!sourceForm.value.name || !sourceForm.value.baseUrl) { ElMessage.warning('名称和 URL 为必填项'); return; }
  const authConfig: any = {};
  if (sourceForm.value.authType === 'bearer') authConfig.token = sourceForm.value.authValue;
  else if (sourceForm.value.authType === 'api-key') authConfig.apiKey = sourceForm.value.authValue;
  await toolsStore.addRemoteSource({
    name: sourceForm.value.name, baseUrl: sourceForm.value.baseUrl, authType: sourceForm.value.authType, authConfig,
  });
  showSourceForm.value = false;
  resetSourceForm();
  ElMessage.success('远程商城源已添加');
}

async function testSource(id: string) {
  const r = await toolsStore.testRemoteSource(id);
  ElMessage[r.ok ? 'success' : 'error'](r.ok ? '连接成功' : (r.error || '连接失败'));
}

async function delSource(id: string) {
  try {
    await ElMessageBox.confirm('删除该远程源？', '提示', { type: 'warning' });
    await toolsStore.deleteRemoteSource(id);
    activeMarketId.value = null;
    ElMessage.success('已删除');
  } catch {}
}

async function installTool(item: any) {
  try {
    await toolsStore.installFromMarket(activeMarketId.value!, item.id);
    ElMessage.success(`已安装 "${item.name}" 到本地商城`);
  } catch { ElMessage.error('安装失败'); }
}
</script>

<style scoped>
/* ---- 视图过渡 ---- */
.view-fade-enter-active,
.view-fade-leave-active { transition: opacity 0.15s ease; }
.view-fade-enter-from,
.view-fade-leave-to { opacity: 0; }

/* ---- 页面 ---- */
.page { padding: 28px 32px; }
.page-top { margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); margin: 4px 0 0; }

/* ---- 分区 ---- */
.section { margin-bottom: 32px; }
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
}
.section-header-right {
  display: flex; align-items: center; gap: 10px;
}
.section-title { font-size: 15px; font-weight: 600; margin: 0; }

/* ---- MCP 概览紧凑卡片（横向滚动） ---- */
.mcp-scroll {
  display: flex; gap: 12px; padding-bottom: 6px;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.mcp-scroll::-webkit-scrollbar { height: 5px; }
.mcp-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }

.mcp-mini-card {
  flex: 0 0 300px;
  padding: 12px 14px; border-radius: 10px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  transition: all 0.18s;
  display: flex; flex-direction: column; gap: 12px;
}
.mcp-mini-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.05);
  border-color: var(--glass-border-strong);
}
.mcp-mini-card.connected { border-color: rgba(34,197,94,0.2); }
.mcp-mini-card-top {
  display: flex; align-items: center; gap: 12px;
}
.mcp-mini-card-icon {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(59,130,246,0.08); color: var(--color-primary);
  flex-shrink: 0;
}
.mcp-mini-card-icon.connected { background: rgba(34,197,94,0.1); color: #22c55e; }
.mcp-mini-card-body { flex: 1; min-width: 0; }
.mcp-mini-name {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; margin-bottom: 2px;
}
.mcp-mini-meta { display: flex; align-items: center; gap: 6px; }
.mcp-mini-tools { font-size: 11px; color: var(--color-text-secondary); }
.mcp-mini-card-actions {
  display: flex; gap: 2px; align-items: center;
}

.status-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.connected { background: #22c55e; box-shadow: 0 0 5px rgba(34,197,94,0.4); }
.status-dot.disconnected { background: #cbd5e1; }

/* ---- 商城卡片网格 ---- */
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

/* ---- 商城卡片 ---- */
.market-card {
  position: relative;
  border-radius: 14px; overflow: hidden; cursor: pointer;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.market-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.07);
  border-color: var(--glass-border-strong);
}
.market-card-cover {
  height: 70px;
  display: flex; align-items: center; justify-content: center;
}
.market-card.local .market-card-cover {
  background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(139,92,246,0.04));
}
.market-card.remote .market-card-cover {
  background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(96,165,250,0.04));
}
.market-card-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.local-icon { background: rgba(124,58,237,0.12); color: #7c3aed; }
.remote-icon { background: rgba(59,130,246,0.12); color: #3b82f6; }
.market-card-body {
  padding: 12px 14px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.market-card-name { font-size: 13px; font-weight: 600; }
.market-card-meta { font-size: 12px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.market-card-badge {
  position: absolute; top: 12px; right: 12px;
  padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
}
.local-badge { background: rgba(124,58,237,0.1); color: #7c3aed; }
.remote-badge { background: rgba(59,130,246,0.1); color: #3b82f6; }

/* ---- 子视图 ---- */
.sub-header {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 24px; padding-bottom: 16px;
  border-bottom: 1px solid var(--glass-border);
}
.sub-header-info { flex: 1; }
.sub-title { margin: 0; font-size: 18px; font-weight: 700; }
.sub-meta { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; display: block; }
.sub-meta.url { font-family: monospace; }
.sub-header-actions { display: flex; gap: 8px; }

.subsection-title {
  margin: 0 0 12px; font-size: 13px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

/* ---- 工具卡片（统一高度 + 描述截断）---- */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.tool-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s;
  display: flex; flex-direction: column; gap: 8px;
  height: 100%;
}
.tool-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.06);
  border-color: var(--glass-border-strong);
}
.tool-card.disabled { opacity: 0.5; }
.tool-card-header { display: flex; align-items: center; gap: 6px; }
.tool-card-name { font-family: monospace; font-size: 13px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-card-desc {
  font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-word;
  max-height: 3em; /* fallback: 2 lines × 1.5 line-height */
}
.tool-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }
.tool-icon { color: #8B5CF6; flex-shrink: 0; }

.card-actions { display: flex; gap: 4px; align-items: center; }
.stat { font-size: 12px; color: var(--color-text-secondary); }

/* ---- MCP Form ---- */
.form-tip { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; line-height: 1.5; }
.form-tip-warn { color: #f59e0b; }
.dialog-actions-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 0 12px;
  border-top: 1px solid var(--glass-border);
  margin-top: 8px;
}
.form-status { font-size: 12px; margin-left: auto; }
.form-status.ok { color: #22c55e; }
.form-status.err { color: #ef4444; }
.preview-tools {
  margin-top: 8px; border: 1px solid var(--glass-border); border-radius: 8px;
  padding: 8px 12px; max-height: 200px; overflow-y: auto;
  background: rgba(15, 23, 42, 0.02);
}
.preview-header { font-size: 12px; color: var(--color-text-secondary); padding-bottom: 6px; border-bottom: 1px solid var(--glass-border); margin-bottom: 6px; }
.preview-list { display: flex; flex-direction: column; gap: 4px; }
.preview-item { display: flex; gap: 8px; padding: 4px 6px; border-radius: 4px; font-size: 12px; }
.preview-item:hover { background: rgba(99, 102, 241, 0.06); }
.tool-name { font-family: "JetBrains Mono", monospace; color: var(--color-text); flex-shrink: 0; }
.tool-desc { color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- MCP 工具列表 Dialog ---- */
.tools-dialog-body {
  max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
}
.tool-dialog-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 6px;
  background: rgba(15,23,42,0.02); border: 1px solid var(--glass-border);
  transition: all 0.15s;
}
.tool-dialog-item:hover { background: rgba(59,130,246,0.04); border-color: rgba(59,130,246,0.15); }
.tool-dialog-item.disabled { opacity: 0.45; }
.tool-dialog-left { flex: 1; min-width: 0; }
.tool-dialog-name { font-family: monospace; font-size: 12px; font-weight: 600; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-dialog-desc {
  font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-word;
}
.tool-dialog-right { flex-shrink: 0; }

.code-input textarea { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 13px; }
</style>
