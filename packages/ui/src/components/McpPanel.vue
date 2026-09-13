<template>
  <div class="mcp-panel">
    <el-segmented v-model="activeTab" :options="tabOptions" class="mcp-tabs" />

    <!-- 服务管理 -->
    <template v-if="activeTab === 'servers'">
    <!-- 面板工具栏：搜索 + 新增（原独立页 page-top 的精简版，供 tab 内嵌使用） -->
    <div class="mcp-panel-toolbar">
      <div class="mcp-search-wrap">
        <el-icon class="mcp-search-icon"><Search /></el-icon>
        <input v-model="searchQuery" placeholder="搜索服务..." class="mcp-search-input" />
        <el-icon v-if="searchQuery" class="mcp-search-clear" @click="searchQuery = ''"><Close /></el-icon>
      </div>
      <el-button type="primary" @click="openAdd" :icon="Plus" class="fab-add">新增服务</el-button>
    </div>

    <el-empty v-if="filteredServers.length === 0" :description="searchQuery ? '没有匹配的 MCP 服务' : '暂无 MCP 服务，点击右上角按钮添加'" :image-size="120" />

    <div v-else class="card-grid">
      <div v-for="s in filteredServers" :key="s.id" class="mcp-card" :class="{ connected: s.status === 'connected' }">
        <div class="card-top">
          <div class="card-icon" :class="s.status">
            <el-icon :size="20"><Connection /></el-icon>
          </div>
          <div class="card-head">
            <span class="card-name">{{ s.name }}<span class="status-dot" :class="s.status" :title="s.status === 'connected' ? '已连接' : '未连接'"></span></span>
            <div class="card-badges">
              <el-tag :type="s.transport === 'stdio' ? '' : s.transport === 'sse' ? 'success' : 'warning'" size="small" effect="light">
                {{ s.transport.toUpperCase() }}
              </el-tag>
              <el-tag v-if="s.authCredentialId" type="info" size="small" effect="plain"><el-icon><Lock /></el-icon> 已鉴权</el-tag>
            </div>
          </div>
        </div>

        <div class="card-body">
          <div class="card-addr">
            <el-icon :size="14"><Link /></el-icon>
            <span v-if="s.transport === 'stdio'" class="addr-cmd">{{ s.command }} {{ (s.args || []).join(' ') }}</span>
            <span v-else class="addr-url">{{ s.url }}</span>
          </div>
        </div>

        <div class="card-foot">
          <div class="card-stats">
            <span class="stat">
              <el-icon :size="14"><Switch /></el-icon>
              {{ (store.tools[s.id] || []).length }} 工具
            </span>
            <span class="stat">
              <el-icon :size="14"><Document /></el-icon>
              {{ (store.resources[s.id] || []).length }} 资源
            </span>
          </div>
          <div class="card-actions">
            <el-button size="small" :type="s.status === 'connected' ? '' : 'primary'" :loading="store.connecting === s.id" @click="connect(s.id)" round>
              {{ s.status === 'connected' ? '重连' : '连接' }}
            </el-button>
            <el-button size="small" :disabled="s.status !== 'connected'" @click="showTools(s.id)" round>工具</el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCmd(cmd, s.id)">
              <el-button size="small" round><el-icon><More /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="resources" :disabled="s.status !== 'connected'"><el-icon><Document /></el-icon> 查看资源</el-dropdown-item>
                  <el-dropdown-item command="prompts" :disabled="s.status !== 'connected'"><el-icon><Tickets /></el-icon> 查看提示词</el-dropdown-item>
                  <el-dropdown-item command="logs"><el-icon><List /></el-icon> 查看日志</el-dropdown-item>
                  <el-dropdown-item command="delete" divided><el-icon><DeleteIcon /></el-icon> 删除服务</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>
    </template>

    <!-- 凭证/令牌保险库 -->
    <template v-else-if="activeTab === 'credentials'">
      <div class="mcp-panel-toolbar">
        <div class="cred-hint">集中生成、加密存储 MCP 服务鉴权令牌，绑定到服务后连接时自动注入（明文不落库、列表不回显）。</div>
        <el-button type="primary" @click="openCredAdd" :icon="Plus" class="fab-add">新增凭证</el-button>
      </div>

      <el-empty v-if="store.credentials.length === 0" description="暂无凭证，点击右上角生成第一个" :image-size="120" />
      <div v-else class="cred-list">
        <div v-for="c in store.credentials" :key="c.id" class="cred-item">
          <div class="cred-main">
            <div class="cred-name">{{ c.name }}</div>
            <div class="cred-meta">
              <el-tag size="small" effect="light">{{ c.scheme === 'bearer' ? 'Bearer' : 'Raw' }}</el-tag>
              <el-tag size="small" effect="plain" type="info">{{ c.target === 'header' ? '请求头' : '环境变量' }}</el-tag>
              <span v-if="c.scheme === 'raw' && c.key" class="cred-key">{{ c.key }}</span>
              <span class="cred-time">创建于 {{ new Date(c.createdAt).toLocaleDateString() }}</span>
            </div>
          </div>
          <div class="cred-actions">
            <el-button size="small" @click="revealCred(c)" round>查看</el-button>
            <el-button size="small" type="danger" plain @click="delCred(c)" round>删除</el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- 对外访问：入站 MCP 访问凭证 -->
    <template v-else>
      <div class="mcp-panel-toolbar">
        <div class="cred-hint">签发访问凭证，把我们的内置/自定义工具以 MCP 服务形式开放给外部客户端。凭证绑定到你的账号，外部以你的身份调用。</div>
        <el-button type="primary" @click="openKeyAdd" :icon="Plus" class="fab-add">签发凭证</el-button>
      </div>

      <el-alert type="info" :closable="false" show-icon class="endpoint-box" style="margin-bottom:14px">
        <template #title>接入端点</template>
        <div class="endpoint-url">
          <code>{{ mcpEndpoint }}</code>
          <el-button link type="primary" size="small" @click="copyText(mcpEndpoint)">复制</el-button>
        </div>
        <div class="endpoint-tip">
          外部 MCP 客户端（如 Claude Desktop、我们自己的 McpClient）连接该端点，请求头携带
          <code>Authorization: Bearer &lt;访问凭证&gt;</code>，即可列出并调用你的工具。
        </div>
      </el-alert>

      <el-empty v-if="store.accessKeys.length === 0" description="尚未签发访问凭证" :image-size="120" />
      <div v-else class="cred-list">
        <div v-for="k in store.accessKeys" :key="k.id" class="cred-item">
          <div class="cred-main">
            <div class="cred-name">{{ k.name }}</div>
            <div class="cred-meta">
              <el-tag size="small" effect="plain" type="info" class="mono">{{ k.keyPrefix }}…</el-tag>
              <span class="cred-time">签发于 {{ new Date(k.createdAt).toLocaleDateString() }}</span>
              <span v-if="k.lastUsedAt" class="cred-time">上次使用 {{ new Date(k.lastUsedAt).toLocaleString() }}</span>
              <span v-if="k.expiresAt" class="cred-time">过期 {{ new Date(k.expiresAt).toLocaleDateString() }}</span>
            </div>
          </div>
          <div class="cred-actions">
            <el-button size="small" type="danger" plain @click="revokeKey(k)" round>撤销</el-button>
          </div>
        </div>
      </div>
    </template>

    <el-dialog v-model="showAdd" title="新增 MCP 服务" width="560px" :close-on-click-modal="false" @close="cancelDialog">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：filesystem" />
        </el-form-item>
        <el-form-item label="协议">
          <el-segmented v-model="form.transport" :options="transportOptions" />
        </el-form-item>
        <template v-if="form.transport === 'stdio'">
          <el-alert v-if="!store.isStdioSupported()" :title="stdioUnsupportedTitle" type="warning" :closable="false" show-icon style="margin-bottom:12px" />
          <el-form-item label="命令"><el-input v-model="form.command" placeholder="如：npx" /></el-form-item>
          <el-form-item label="参数">
            <el-input v-model="argsText" type="textarea" :rows="2" placeholder="一行一个参数，如：-y\n@modelcontextprotocol/server-filesystem\n/tmp" />
          </el-form-item>
          <el-form-item label="环境变量">
            <el-input v-model="envText" type="textarea" :rows="2" placeholder="KEY=value 一行一个" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="URL">
            <el-input v-model="form.url" placeholder="https://example.com/mcp" />
            <div class="form-tip">
              <template v-if="form.transport === 'sse'">SSE 端点 URL，系统自动解析 endpoint 事件</template>
              <template v-else>Streamable HTTP JSON-RPC 端点</template>
              <span class="form-tip-warn" v-if="!store.isDesktop()"> · 浏览器端需服务端支持 CORS</span>
            </div>
          </el-form-item>
          <el-form-item label="Headers">
            <el-input v-model="headersText" type="textarea" :rows="2" placeholder="Key: Value 一行一个（可选，手动填可不绑凭证）" />
          </el-form-item>
        </template>
        <el-form-item label="绑定凭证">
          <el-select v-model="form.authCredentialId" placeholder="不绑定（手动在 Headers 填鉴权）" clearable filterable style="width:100%">
            <el-option v-for="c in store.credentials" :key="c.id" :label="`${c.name}（${c.scheme === 'bearer' ? 'Bearer' : 'Raw'}/${c.target === 'header' ? '头' : '环境变量'}）`" :value="c.id" />
          </el-select>
          <div class="form-tip">绑定后连接时自动注入对应鉴权头/环境变量，无需再手写 Headers。</div>
        </el-form-item>
        <el-form-item label="自动重连"><el-switch v-model="form.autoReconnect" /></el-form-item>
        <el-form-item label="重连间隔"><el-input-number v-model="form.reconnectInterval" :min="1000" :step="1000" style="width:180px" /> ms</el-form-item>
        <el-form-item label="启动时连接"><el-switch v-model="form.autoConnect" /></el-form-item>
      </el-form>

      <div class="dialog-actions-bar">
        <el-button :loading="testingForm" :icon="Connection" @click="testForm">测试连接</el-button>
        <span v-if="formStatus" :class="['form-status', formStatusType]">{{ formStatus }}</span>
      </div>

      <div v-if="previewTools.length > 0" class="preview-tools">
        <div class="preview-header">预览到 {{ previewTools.length }} 个工具</div>
        <div class="preview-list">
          <div v-for="t in previewTools" :key="t.name" class="preview-item">
            <span class="tool-name">{{ t.name }}</span>
            <span class="tool-desc">{{ t.description || '无描述' }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="cancelDialog">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑凭证 -->
    <el-dialog v-model="credDialog" :title="credForm.id ? '编辑凭证' : '新增凭证'" width="520px" :close-on-click-modal="false" @close="credDialog = false">
      <el-form label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="credForm.name" placeholder="如：GitHub PAT" />
        </el-form-item>
        <el-form-item label="注入方式">
          <el-segmented v-model="credForm.scheme" :options="[{ label: 'Bearer', value: 'bearer' }, { label: 'Raw', value: 'raw' }]" />
        </el-form-item>
        <el-form-item label="注入位置">
          <el-segmented v-model="credForm.target" :options="[{ label: '请求头', value: 'header' }, { label: '环境变量', value: 'env' }]" />
        </el-form-item>
        <el-form-item v-if="credForm.scheme === 'raw'" label="键名">
          <el-input v-model="credForm.key" :placeholder="credForm.target === 'header' ? '如 X-API-Key' : '如 API_TOKEN'" />
        </el-form-item>
        <el-form-item label="密钥">
          <el-input v-model="credForm.secret" type="textarea" :rows="3" :placeholder="credForm.scheme === 'bearer' ? '粘贴或生成 Bearer 令牌' : '粘贴或生成密钥'" />
          <div class="form-tip">
            <el-button link type="primary" size="small" :loading="genBusy" @click="genToken">生成随机令牌</el-button>
            <span> · 提交后加密存储，明文仅可在「查看」中一次性获取</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="credDialog = false">取消</el-button>
        <el-button type="primary" :loading="credSaving" @click="saveCred">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看明文 -->
    <el-dialog v-model="revealDialog" :title="`查看凭证明文：${revealName}`" width="520px">
      <el-alert type="warning" :closable="false" show-icon title="请妥善保存" description="明文仅在本次查看时返回，关闭后不可再获取，请立即复制。" style="margin-bottom:12px" />
      <el-input :model-value="revealText" type="textarea" :rows="3" readonly />
      <template #footer>
        <el-button @click="revealDialog = false">关闭</el-button>
        <el-button type="primary" @click="copyText(revealText)">复制</el-button>
      </template>
    </el-dialog>

    <!-- 签发入站访问凭证 -->
    <el-dialog v-model="keyDialog" title="签发访问凭证" width="520px" :close-on-click-modal="false" @close="closeKeyDialog">
      <template v-if="!createdKey">
        <el-form label-width="90px">
          <el-form-item label="名称">
            <el-input v-model="keyForm.name" placeholder="如：给同事小王的接入凭证" />
          </el-form-item>
          <el-form-item label="有效期">
            <el-input-number v-model="keyForm.expiresInDays" :min="1" :max="3650" controls-position="right" style="width:180px" /> 天（留空=永久）
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert type="warning" :closable="false" show-icon title="凭证已生成，请立即复制" description="明文仅显示这一次，关闭对话框后将无法再次查看，请妥善保存。" style="margin-bottom:12px" />
        <el-input :model-value="createdKey" type="textarea" :rows="3" readonly />
        <div class="form-tip">
          <el-button link type="primary" size="small" @click="copyText(createdKey)">复制凭证</el-button>
        </div>
      </template>
      <template #footer>
        <template v-if="!createdKey">
          <el-button @click="keyDialog = false">取消</el-button>
          <el-button type="primary" :loading="keySaving" @click="saveKey">签发</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="keyDialog = false">完成</el-button>
        </template>
      </template>
    </el-dialog>

    <el-dialog v-model="toolsDialog" :title="`工具列表（${currentTools.length}）`" width="760px" class="tools-dialog">
      <div class="tools-dialog-body">
        <div v-if="currentTools.length === 0" class="tools-empty">
          <el-empty description="暂无工具" :image-size="80" />
        </div>
        <div v-for="t in currentTools" :key="t.name" class="tool-card-item" :class="{ disabled: !isToolEnabled(t) }">
          <div class="tool-card-left">
            <div class="tool-card-header">
              <el-icon :size="16" class="tool-icon"><Switch /></el-icon>
              <span class="tool-card-name" :title="t.name">{{ displayToolLabel(t) }}</span>
              <div class="tool-card-actions-inline">
                <el-button size="small" link type="primary" @click="showSchema(t)">Schema</el-button>
              </div>
            </div>
            <div class="tool-meta-row">
              <input
                class="tool-meta-input alias-input"
                :value="getToolMeta(t, 'alias')"
                :placeholder="'别名'"
                @blur="(e: any) => saveToolMeta(t, 'alias', e.target.value)"
                @keydown.enter.prevent="(e: any) => { (e.target as HTMLInputElement).blur() }"
              />
              <input
                class="tool-meta-input remark-input"
                :value="getToolMeta(t, 'remark')"
                :placeholder="'备注'"
                @blur="(e: any) => saveToolMeta(t, 'remark', e.target.value)"
                @keydown.enter.prevent="(e: any) => { (e.target as HTMLInputElement).blur() }"
              />
            </div>
            <div v-if="t.description" class="tool-card-desc" :class="{ expanded: expandedDescs[t.name] }" @click="toggleDesc(t.name)">
              {{ t.description }}
            </div>
            <div v-else class="tool-card-desc empty-desc">暂无描述</div>
            <div v-if="expandedSchema[t.name]" class="tool-schema-block">
              <div class="schema-section"><span class="schema-label">入参</span><pre class="schema-pre">{{ fmtSchema(t.inputSchema) }}</pre></div>
              <div class="schema-section"><span class="schema-label">出参</span><pre class="schema-pre">{{ fmtSchema(t.outputSchema) }}</pre></div>
            </div>
          </div>
          <div class="tool-card-right">
            <el-switch
              v-model="toolEnabledMap[t.name]"
              :disabled="toolEnabledMap[t.name] !== false && currentTools.filter(x => toolEnabledMap[x.name] !== false).length <= 1"
              size="small"
              @change="(v: boolean) => onToolToggle(t, v)"
            />
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="resourcesDialog" title="资源列表" width="720px">
      <el-table :data="currentResources" max-height="360" stripe>
        <el-table-column prop="uri" label="URI" min-width="240" />
        <el-table-column prop="name" label="名称" width="160" />
        <el-table-column prop="mimeType" label="MIME" width="140" />
        <el-table-column label="" width="80" align="center">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="readRes(row)">读取</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="currentResources.length === 0" description="暂无资源" :image-size="80" />
    </el-dialog>

    <el-dialog v-model="promptsDialog" title="提示词列表" width="720px">
      <el-table :data="currentPrompts" max-height="360" stripe>
        <el-table-column prop="name" label="名称" width="200" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="参数" width="200">
          <template #default="{ row }">
            <el-tag v-for="a in (row.arguments || [])" :key="a.name" size="small" effect="plain" style="margin:0 2px 2px 0">
              {{ a.name }}{{ a.required ? '*' : '' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="" width="80" align="center">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="getPromptContent(row)">获取</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="currentPrompts.length === 0" description="暂无提示词" :image-size="80" />
    </el-dialog>

    <el-dialog v-model="contentDialog" :title="contentTitle" width="640px">
      <pre class="preview-content">{{ contentText }}</pre>
    </el-dialog>

    <el-dialog v-model="logDialog" title="连接日志" width="680px">
      <el-table :data="currentLogs" max-height="400" size="small" stripe>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.time).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="method" label="方法" min-width="160" />
        <el-table-column label="结果" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'danger'" size="small" effect="dark">{{ row.ok ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="msg" label="说明" min-width="100" />
      </el-table>
      <el-empty v-if="currentLogs.length === 0" description="暂无日志" :image-size="80" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Plus, Connection, More, Link, Document, Switch, Tickets, List, Delete as DeleteIcon, Search, Close, Lock } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMcpStore } from '../stores';
import type { McpTransport, McpTool } from '@yan-zhi/shared';

const props = defineProps<{
  /** 深链聚焦：/mcp/:id 迁移后由 /tools?focus=<id> 传入，挂载后自动打开该服务的工具面板 */
  focusServerId?: string;
}>();

const store = useMcpStore();
const activeTab = ref<'servers' | 'credentials'>('servers');
const tabOptions = [
  { label: 'MCP 服务', value: 'servers' },
  { label: '凭证管理', value: 'credentials' },
  { label: '对外访问', value: 'inbound' },
];
const showAdd = ref(false);
const searchQuery = ref('');
const toolsDialog = ref(false);
const resourcesDialog = ref(false);
const promptsDialog = ref(false);
const logDialog = ref(false);
const contentDialog = ref(false);
const contentTitle = ref('');
const contentText = ref('');
const currentServerId = ref('');
const form = ref({
  name: '', transport: 'stdio' as McpTransport,
  command: '', url: '', autoReconnect: true, reconnectInterval: 5000, autoConnect: true,
  authCredentialId: '' as string,
});
const argsText = ref('');
const envText = ref('');
const headersText = ref('');

const testingForm = ref(false);
const saving = ref(false);
const formStatus = ref('');
const formStatusType = ref<'ok' | 'err'>('ok');
const previewTools = ref<McpTool[]>([]);

// ===== 凭证/令牌保险库 =====
const credDialog = ref(false);
const credSaving = ref(false);
const genBusy = ref(false);
const credForm = ref({
  id: '', name: '', scheme: 'bearer' as 'bearer' | 'raw', target: 'header' as 'header' | 'env',
  key: '', secret: '',
});
const revealDialog = ref(false);
const revealName = ref('');
const revealText = ref('');

function openCredAdd() {
  credForm.value = { id: '', name: '', scheme: 'bearer', target: 'header', key: '', secret: '' };
  credDialog.value = true;
}

async function genToken() {
  genBusy.value = true;
  try {
    credForm.value.secret = await store.generateCredentialToken();
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败');
  } finally {
    genBusy.value = false;
  }
}

async function saveCred() {
  if (!credForm.value.name.trim()) { ElMessage.warning('请填写名称'); return; }
  if (!credForm.value.secret.trim()) { ElMessage.warning('请填写或生成密钥'); return; }
  if (credForm.value.scheme === 'raw' && !credForm.value.key.trim()) { ElMessage.warning('Raw 模式需填写键名'); return; }
  credSaving.value = true;
  try {
    await store.createCredential({
      name: credForm.value.name.trim(), scheme: credForm.value.scheme, target: credForm.value.target,
      key: credForm.value.key.trim() || undefined, secret: credForm.value.secret.trim(),
    });
    credDialog.value = false;
    ElMessage.success('凭证已加密保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    credSaving.value = false;
  }
}

async function revealCred(c: any) {
  try {
    revealText.value = await store.revealCredential(c.id);
    revealName.value = c.name;
    revealDialog.value = true;
  } catch (e: any) {
    ElMessage.error(e?.message || '查看失败');
  }
}

async function delCred(c: any) {
  try {
    await ElMessageBox.confirm(`删除凭证「${c.name}」？已绑定的服务将失去鉴权，需重新配置。`, '提示', { type: 'warning' });
    await store.deleteCredential(c.id);
    ElMessage.success('已删除');
  } catch {}
}

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

// ===== 入站 MCP 访问凭证 =====
const mcpEndpoint = `${location.origin}/mcp`;
const keyDialog = ref(false);
const keySaving = ref(false);
const keyForm = ref({ name: '', expiresInDays: undefined as number | undefined });
const createdKey = ref('');

function openKeyAdd() {
  keyForm.value = { name: '', expiresInDays: undefined };
  createdKey.value = '';
  keyDialog.value = true;
}

async function saveKey() {
  if (!keyForm.value.name.trim()) { ElMessage.warning('请填写名称'); return; }
  keySaving.value = true;
  try {
    const r = await store.createAccessKey(keyForm.value.name.trim(), keyForm.value.expiresInDays);
    createdKey.value = r.key;
    ElMessage.success('凭证已签发');
  } catch (e: any) {
    ElMessage.error(e?.message || '签发失败');
  } finally {
    keySaving.value = false;
  }
}

function closeKeyDialog() {
  // 关闭后明文不再可见，刷新列表
  createdKey.value = '';
  store.loadAccessKeys();
}

async function revokeKey(k: any) {
  try {
    await ElMessageBox.confirm(`撤销访问凭证「${k.name}」？外部客户端将立即失去接入权限。`, '提示', { type: 'warning' });
    await store.revokeAccessKey(k.id);
    ElMessage.success('已撤销');
  } catch {}
}

const toolEnabledMap = ref<Record<string, boolean>>({});
const expandedDescs = ref<Record<string, boolean>>({});
const expandedSchema = ref<Record<string, boolean>>({});
const toolMetaMap = ref<Record<string, { alias: string; remark: string }>>({});

/** 按名称过滤（原独立页无此逻辑外的差异：过滤后空态与全空态文案区分） */
const filteredServers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return store.servers;
  return store.servers.filter((s) => (s.name || '').toLowerCase().includes(q));
});

function initToolMap() {
  const tools = currentTools.value;
  for (const t of tools) {
    if (!(t.name in toolEnabledMap.value)) {
      toolEnabledMap.value[t.name] = t.enabled !== false;
    }
  }
}
function isToolEnabled(t: McpTool) {
  return toolEnabledMap.value[t.name] !== false;
}
async function onToolToggle(t: McpTool, v: boolean) {
  toolEnabledMap.value[t.name] = v;
  await store.setToolEnabled(currentServerId.value, t.name, v);
}
function displayToolLabel(t: McpTool): string {
  const alias = toolMetaMap.value[t.name]?.alias || t.alias;
  const parts: string[] = [t.name];
  if (alias) parts.push(`[${alias}]`);
  return parts.join(' ');
}
function getToolMeta(t: McpTool, field: 'alias' | 'remark'): string {
  return toolMetaMap.value[t.name]?.[field] ?? (t[field] as string) ?? '';
}
async function saveToolMeta(t: McpTool, field: 'alias' | 'remark', val: string) {
  const trim = val.trim();
  const current = (t[field] as string) || '';
  if (trim === current) {
    if (toolMetaMap.value[t.name]) {
      delete toolMetaMap.value[t.name][field];
      if (!toolMetaMap.value[t.name].alias && !toolMetaMap.value[t.name].remark) {
        delete toolMetaMap.value[t.name];
      }
      await store.updateToolMeta(currentServerId.value, t.name, { [field]: current || '' });
    }
    return;
  }
  if (!toolMetaMap.value[t.name]) toolMetaMap.value[t.name] = { alias: '', remark: '' };
  toolMetaMap.value[t.name][field] = trim;
  await store.updateToolMeta(currentServerId.value, t.name, { [field]: trim || '' });
}
function toggleDesc(name: string) {
  expandedDescs.value[name] = !expandedDescs.value[name];
}

const transportOptions = computed(() => [
  { label: 'stdio', value: 'stdio', disabled: !store.isStdioSupported() },
  { label: 'SSE', value: 'sse' },
  { label: 'HTTP', value: 'http' },
]);

const stdioUnsupportedTitle = computed(() =>
  store.isDesktop()
    ? '当前桌面端壳未实现 stdio JSON-RPC，请使用 Electron 桌面端或改用 SSE/HTTP'
    : '当前为浏览器环境，stdio 协议仅在 Electron 桌面端可用',
);

onMounted(async () => {
  await store.loadServers();
  await store.loadCredentials();
  await store.loadAccessKeys();
  // 深链聚焦：原 /mcp/:id 直达，迁移后由 /tools?focus=<id> 传入
  if (props.focusServerId && store.servers.some((s) => s.id === props.focusServerId)) {
    showTools(props.focusServerId);
  }
});

const currentTools = computed(() => store.tools[currentServerId.value] || []);
const currentResources = computed(() => store.resources[currentServerId.value] || []);
const currentPrompts = computed(() => store.prompts[currentServerId.value] || []);
const currentLogs = computed(() => store.getLogs(currentServerId.value));

function openAdd() {
  resetForm();
  showAdd.value = true;
}

function cancelDialog() {
  if (testingForm.value) store.cancelTest();
  showAdd.value = false;
  testingForm.value = false;
  formStatus.value = '';
  previewTools.value = [];
}

function setStatus(msg: string, type: 'ok' | 'err' = 'ok') {
  formStatus.value = msg;
  formStatusType.value = type;
}

function parseForm() {
  const args = argsText.value.split('\n').map((s) => s.trim()).filter(Boolean);
  const env: Record<string, string> = {};
  envText.value.split('\n').forEach((line) => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  const headers: Record<string, string> = {};
  headersText.value.split('\n').forEach((line) => {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].trim()] = m[2].trim();
  });
  return { args, env, headers };
}

async function testForm() {
  if (form.value.transport === 'stdio' && !store.isStdioSupported()) { ElMessage.warning('当前环境不支持 stdio，请改用 SSE/HTTP'); return; }
  if (form.value.transport === 'stdio' && !form.value.command) { ElMessage.warning('请填写 command'); return; }
  if (form.value.transport !== 'stdio' && !form.value.url) { ElMessage.warning('请填写 URL'); return; }
  testingForm.value = true;
  formStatus.value = '';
  previewTools.value = [];
  try {
    const { args, env, headers } = parseForm();
    const r = await store.testServerConfig({
      transport: form.value.transport, command: form.value.command,
      args, env, url: form.value.url, headers,
    });
    if (r.ok) {
      setStatus(`${r.msg}（${r.durationMs}ms）`, 'ok');
      previewTools.value = r.tools || [];
    } else {
      setStatus(r.msg, 'err');
      ElMessage.error(r.msg);
    }
  } finally {
    testingForm.value = false;
  }
}

async function save() {
  if (!form.value.name) { ElMessage.warning('名称必填'); return; }
  if (form.value.transport === 'stdio' && !store.isStdioSupported()) { ElMessage.warning('当前环境不支持 stdio，请改用 SSE/HTTP'); return; }
  if (form.value.transport === 'stdio' && !form.value.command) { ElMessage.warning('stdio 需要 command'); return; }
  if (form.value.transport !== 'stdio' && !form.value.url) { ElMessage.warning('sse/http 需要 URL'); return; }

  saving.value = true;
  try {
    const { args, env, headers } = parseForm();
    const server = await store.addServer({
      name: form.value.name, transport: form.value.transport,
      command: form.value.command, args, env, url: form.value.url, headers,
      autoReconnect: form.value.autoReconnect, reconnectInterval: form.value.reconnectInterval,
      autoConnect: form.value.autoConnect,
      authCredentialId: form.value.authCredentialId || null,
    });
    showAdd.value = false;
    resetForm();
    ElMessage.success('已添加，正在连接…');
    const r = await store.connect(server.id);
    if (r.ok) ElMessage.success(r.msg);
    else ElMessage.warning(r.msg);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  form.value = { name: '', transport: store.isStdioSupported() ? 'stdio' : 'sse', command: '', url: '', autoReconnect: true, reconnectInterval: 5000, autoConnect: true, authCredentialId: '' };
  argsText.value = ''; envText.value = ''; headersText.value = '';
  formStatus.value = ''; previewTools.value = [];
}

async function connect(id: string) {
  const r = await store.connect(id);
  if (r.ok) ElMessage.success(r.msg);
  else ElMessage.error(r.msg);
}

function showTools(id: string) { currentServerId.value = id; initToolMap(); toolsDialog.value = true; }
function showResources(id: string) { currentServerId.value = id; resourcesDialog.value = true; }
function showPrompts(id: string) { currentServerId.value = id; promptsDialog.value = true; }
function showLog(id: string) { currentServerId.value = id; logDialog.value = true; }

function handleCmd(cmd: string, id: string) {
  switch (cmd) {
    case 'resources': showResources(id); break;
    case 'prompts': showPrompts(id); break;
    case 'logs': showLog(id); break;
    case 'delete': del(id); break;
  }
}

async function readRes(row: any) {
  const r = await store.readResource(currentServerId.value, row.uri);
  if (r.ok) {
    contentTitle.value = `资源：${row.uri}`;
    contentText.value = JSON.stringify(r.contents, null, 2);
    contentDialog.value = true;
  } else {
    ElMessage.error(r.msg || '读取失败');
  }
}

async function getPromptContent(row: any) {
  const args: Record<string, string> = {};
  const argList = row.arguments || [];
  if (argList.length > 0) {
    for (const a of argList) {
      const v = await ElMessageBox.prompt(`参数 ${a.name}${a.description ? ' - ' + a.description : ''}`, `提示词：${row.name}`, {
        confirmButtonText: '确定', cancelButtonText: '取消',
        inputValidator: (val) => a.required ? !!val?.trim() : true,
      }).catch(() => null);
      if (v === null) return;
      args[a.name] = v as unknown as string;
    }
  }
  const r = await store.getPrompt(currentServerId.value, row.name, args);
  if (r.ok) {
    contentTitle.value = `提示词：${row.name}`;
    contentText.value = JSON.stringify(r.result, null, 2);
    contentDialog.value = true;
  } else {
    ElMessage.error(r.msg || '获取失败');
  }
}

function showSchema(tool: any) {
  expandedSchema.value[tool.name] = !expandedSchema.value[tool.name];
}
function fmtSchema(schema: unknown): string {
  if (!schema || (typeof schema === 'object' && Object.keys(schema as object).length === 0)) return '（无）';
  try { return JSON.stringify(schema, null, 2); } catch { return String(schema); }
}

async function del(id: string) {
  try {
    await ElMessageBox.confirm('删除该 MCP 服务？关联工具也会一并删除', '提示', { type: 'warning' });
    await store.deleteServer(id);
    ElMessage.success('已删除');
  } catch {}
}
</script>

<style scoped>
.mcp-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mcp-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.mcp-search-wrap {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 10px;
  border: 1px solid var(--glass-border); background: var(--glass-bg);
  width: 200px; transition: border-color 0.2s;
}
.mcp-search-wrap:focus-within { border-color: var(--color-primary); }
.mcp-search-icon { font-size: 14px; color: var(--color-text-secondary); flex-shrink: 0; }
.mcp-search-input {
  border: none; outline: none; background: transparent;
  font-size: 13px; width: 100%; min-width: 0; color: var(--color-text);
}
.mcp-search-input::placeholder { color: var(--color-text-secondary); opacity: 0.5; }
.mcp-search-clear { font-size: 13px; color: var(--color-text-secondary); cursor: pointer; flex-shrink: 0; }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }

.mcp-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 20px;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mcp-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
  border-color: var(--glass-border-strong);
}
.mcp-card.connected { border-color: rgba(34, 197, 94, 0.25); }

.card-top { display: flex; align-items: center; gap: 14px; }
.card-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(59, 130, 246, 0.1); color: var(--color-primary);
  flex-shrink: 0;
}
.card-icon.connected { background: rgba(34, 197, 94, 0.12); color: #22c55e; }

.card-head { flex: 1; min-width: 0; }
.card-name { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }

.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; transition: background 0.3s;
}
.status-dot.connected { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.status-dot.disconnected { background: #94a3b8; }
.status-dot.error { background: #ef4444; }

.card-body {
  background: rgba(15, 23, 42, 0.03);
  border-radius: 8px; padding: 10px 12px;
}
.card-addr {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-family: "JetBrains Mono", "Cascadia Code", monospace;
  color: var(--color-text-secondary); overflow: hidden;
}
.addr-cmd, .addr-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-stats { display: flex; gap: 14px; }
.stat { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text-secondary); }
.card-actions { display: flex; gap: 6px; }

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
.preview-content {
  background: rgba(15, 23, 42, 0.03); padding: 16px; border-radius: 8px;
  font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px;
  max-height: 500px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}

.tools-dialog-body {
  max-height: 460px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
}
.tools-dialog-body::-webkit-scrollbar { width: 5px; }
.tools-dialog-body::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }
.tools-empty { padding: 40px 0; }

.tool-card-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 16px; border-radius: 10px;
  background: rgba(15, 23, 42, 0.02); border: 1px solid var(--glass-border);
  transition: all 0.18s;
}
.tool-card-item:hover { background: rgba(59, 130, 246, 0.04); border-color: rgba(59, 130, 246, 0.15); }
.tool-card-item.disabled { opacity: 0.45; }

.tool-card-left { flex: 1; min-width: 0; }
.tool-card-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}

.tool-meta-row {
  display: flex; gap: 8px; padding: 0 0 0 24px; margin-bottom: 4px;
}
.tool-meta-input {
  flex: 1; height: 26px; padding: 0 8px;
  border: 1px solid rgba(15,23,42,0.08); border-radius: 5px;
  font-size: 11px; outline: none; background: transparent;
  transition: border-color 0.15s; min-width: 0;
}
.tool-meta-input:focus { border-color: var(--color-primary); }
.tool-meta-input::placeholder { color: rgba(15,23,42,0.3); font-style: italic; }
.tool-icon { color: #8B5CF6; flex-shrink: 0; }
.tool-card-name {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 13px; font-weight: 600; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tool-card-actions-inline { flex-shrink: 0; }
.tool-card-actions-inline .el-button { font-size: 11px; padding: 0 2px; }

.tool-card-desc {
  font-size: 12px; color: var(--color-text-secondary); line-height: 1.5;
  padding-left: 24px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; cursor: pointer; transition: all 0.2s;
  border-radius: 4px; padding: 2px 4px 2px 24px;
}
.tool-card-desc:hover { background: rgba(139, 92, 246, 0.06); }
.tool-card-desc.expanded { -webkit-line-clamp: unset; display: block; }
.tool-card-desc.empty-desc { font-style: italic; opacity: 0.5; cursor: default; }
.tool-card-desc.empty-desc:hover { background: none; }

.tool-card-right { padding-top: 2px; flex-shrink: 0; }

/* 入参/出参行内展开块 */
.tool-schema-block {
  margin: 6px 0 0 24px; padding: 8px 10px; border-radius: 8px;
  background: rgba(15, 23, 42, 0.06); border: 1px solid var(--glass-border);
  display: flex; flex-direction: column; gap: 8px;
}
.schema-section { display: flex; flex-direction: column; gap: 4px; }
.schema-label {
  font-size: 11px; font-weight: 600; color: var(--color-text);
  text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;
}
.schema-pre {
  margin: 0; padding: 8px; border-radius: 6px;
  background: rgba(0, 0, 0, 0.04); color: var(--color-text);
  font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 11px;
  line-height: 1.5; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}
:root[data-theme="dark"] .tool-schema-block { background: rgba(255, 255, 255, 0.04); }
:root[data-theme="dark"] .schema-pre { background: rgba(0, 0, 0, 0.35); }

.cred-time { font-size: 12px; color: var(--color-text-secondary); }
.mono { font-family: "JetBrains Mono", "Cascadia Code", monospace; }

/* 入站访问端点信息框 */
.endpoint-box { text-align: left; }
.endpoint-url { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.endpoint-url code, .endpoint-tip code {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  background: rgba(15, 23, 42, 0.06); padding: 2px 6px; border-radius: 4px; font-size: 12px;
}
.endpoint-url code { color: var(--color-primary); }
.endpoint-tip { font-size: 12px; color: var(--color-text-secondary); line-height: 1.6; }

@media (max-width: 767px) {
  .mcp-panel-toolbar { flex-wrap: wrap; }
  .mcp-search-wrap { width: 100%; }
  .card-grid { grid-template-columns: 1fr; gap: 12px; }
  .mcp-card { padding: 14px; }
}
</style>
