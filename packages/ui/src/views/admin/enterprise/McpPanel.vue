<template>
  <div class="epanel">
    <div class="toolbar">
      <div>
        <h3>集中式 MCP</h3>
        <p>Provider 定义服务类型，Connector 定义实例。共享凭证只保存在服务端。</p>
      </div>
      <div class="actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button :icon="Plus" @click="openProvider">新建 Provider</el-button>
        <el-button type="primary" :icon="Connection" :disabled="!providers.length" @click="openConnector">新建连接</el-button>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head"><h3>Provider</h3><span>{{ providers.length }} 个</span></div>
      <el-table :data="providers" border size="small" v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="url" label="地址" min-width="260" show-overflow-tooltip />
        <el-table-column prop="auth_mode" label="认证" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }"><el-button link type="danger" @click="removeProvider(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head"><h3>Connector</h3><span>授权仍走资源 ACL</span></div>
      <el-table :data="connectors" border size="small">
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="provider_name" label="Provider" min-width="130" />
        <el-table-column prop="credential_mode" label="凭证模式" width="120" />
        <el-table-column label="共享凭证" width="100">
          <template #default="{ row }">{{ row.has_shared_secret ? '已配置' : '-' }}</template>
        </el-table-column>
        <el-table-column label="OAuth" width="120">
          <template #default="{ row }">
            <el-tooltip v-if="isOAuthProvider(row) && row.oauth_error" :content="row.oauth_error" placement="top">
              <el-tag size="small" :type="oauthTagType(row.oauth_status)">{{ oauthLabel(row.oauth_status) }}</el-tag>
            </el-tooltip>
            <el-tag v-else-if="isOAuthProvider(row)" size="small" :type="oauthTagType(row.oauth_status)">{{ oauthLabel(row.oauth_status) }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="公开" width="70">
          <template #default="{ row }">{{ row.is_public ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :loading="discovering === row.id" @click="discover(row)">发现工具</el-button>
            <el-button link type="success" @click="showTools(row)">工具</el-button>
            <el-button v-if="isOAuthProvider(row)" link type="warning" :loading="authorizing === row.id" @click="startOAuth(row)">
              {{ row.oauth_status === 'authorized' ? '重新授权' : '发起授权' }}
            </el-button>
            <el-button v-if="isOAuthProvider(row) && row.has_oauth_token" link @click="revokeOAuth(row)">撤销授权</el-button>
            <el-button link type="danger" @click="removeConnector(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel-head"><h3>最近 MCP 调用</h3><span>不含请求正文</span></div>
      <el-table :data="calls" border size="small">
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
        <el-table-column prop="tool_name" label="工具" min-width="160" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="费用" width="100"><template #default="{ row }">¥{{ Number(row.cost_cny || 0).toFixed(4) }}</template></el-table-column>
        <el-table-column prop="duration_ms" label="耗时" width="90" />
        <el-table-column prop="error_code" label="错误" min-width="180" show-overflow-tooltip />
      </el-table>
    </section>

    <el-dialog v-model="providerDialog" title="新建 MCP Provider" width="560px">
      <el-form label-width="96px">
        <el-form-item label="名称"><el-input v-model="providerForm.name" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="providerForm.url" placeholder="https://example.com/mcp" /></el-form-item>
        <el-form-item label="认证方式">
          <el-radio-group v-model="providerForm.authMode">
            <el-radio-button value="none">无认证</el-radio-button>
            <el-radio-button value="header">Header</el-radio-button>
            <el-radio-button value="oauth">OAuth</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="providerForm.authMode === 'oauth'">
          <el-form-item label="授权地址"><el-input v-model="providerForm.authorizationUrl" placeholder="https://issuer.example/authorize" /></el-form-item>
          <el-form-item label="令牌地址"><el-input v-model="providerForm.tokenUrl" placeholder="https://issuer.example/token" /></el-form-item>
          <el-form-item label="Client ID"><el-input v-model="providerForm.clientId" /></el-form-item>
          <el-form-item label="Client Secret">
            <el-input v-model="providerForm.clientSecret" type="password" show-password placeholder="仅保存在服务端，列表不回显" />
          </el-form-item>
          <el-form-item label="Scopes"><el-input v-model="providerForm.scopes" placeholder="空格分隔，如 mcp:tools" /></el-form-item>
          <el-form-item label="Issuer"><el-input v-model="providerForm.issuer" placeholder="可选，用于校验回调 iss" /></el-form-item>
          <el-form-item label="回调地址">
            <el-input v-model="providerForm.redirectUri" placeholder="留空自动使用当前站点 /api/enterprise/mcp/oauth/callback" />
          </el-form-item>
        </template>
        <el-form-item label="说明"><el-input v-model="providerForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProvider">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="connectorDialog" title="新建 MCP 连接" width="600px">
      <el-form label-width="100px">
        <el-form-item label="Provider">
          <el-select v-model="connectorForm.providerId" style="width: 100%">
            <el-option v-for="p in providers" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="connectorForm.name" /></el-form-item>
        <el-form-item label="覆盖地址"><el-input v-model="connectorForm.url" placeholder="留空使用 Provider 地址" /></el-form-item>
        <el-form-item label="凭证模式">
          <el-radio-group v-model="connectorForm.credentialMode">
            <el-radio-button value="centralized">共享凭证</el-radio-button>
            <el-radio-button value="independent">用户独立</el-radio-button>
            <el-radio-button value="none">无凭证</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="connectorForm.credentialMode === 'centralized'" label="共享密钥">
          <el-input v-model="connectorForm.sharedSecret" type="password" show-password placeholder="作为 Authorization: Bearer ... 保存" />
        </el-form-item>
        <el-form-item label="公开给所有成员"><el-switch v-model="connectorForm.isPublic" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="connectorDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveConnector">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="toolsDrawer" :title="`工具 · ${activeConnector?.name || ''}`" size="620px">
      <el-table :data="tools" border size="small">
        <el-table-column prop="name" label="工具" min-width="160" />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleTool(row)" />
          </template>
        </el-table-column>
        <el-table-column label="每次费用" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.cost_cny" :min="0" :precision="4" :controls="false" size="small" @change="updateCost(row)" />
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Connection, Plus } from '@element-plus/icons-vue';
import { enterpriseApi, type McpConnector, type McpProvider, type McpTool } from '../../../api/enterprise';

const loading = ref(false);
const saving = ref(false);
const discovering = ref('');
const authorizing = ref('');
const providers = ref<McpProvider[]>([]);
const connectors = ref<McpConnector[]>([]);
const calls = ref<any[]>([]);
const providerDialog = ref(false);
const connectorDialog = ref(false);
const toolsDrawer = ref(false);
const activeConnector = ref<McpConnector | null>(null);
const tools = ref<McpTool[]>([]);
const emptyProviderForm = () => ({
  name: '', url: '', authMode: 'header', description: '',
  authorizationUrl: '', tokenUrl: '', clientId: '', clientSecret: '',
  scopes: 'mcp:tools', issuer: '', redirectUri: '',
});
const providerForm = ref(emptyProviderForm());
const connectorForm = ref({ providerId: '', name: '', url: '', credentialMode: 'centralized', sharedSecret: '', isPublic: false });

function formatTime(v: number) {
  return v ? new Date(v).toLocaleString() : '-';
}

async function reload() {
  loading.value = true;
  try {
    const [p, c, l] = await Promise.all([enterpriseApi.mcpProviders(), enterpriseApi.mcpConnectors(), enterpriseApi.mcpCalls(100)]);
    providers.value = p || [];
    connectors.value = c || [];
    calls.value = l || [];
  } finally {
    loading.value = false;
  }
}

function openProvider() {
  providerForm.value = emptyProviderForm();
  providerDialog.value = true;
}

async function saveProvider() {
  saving.value = true;
  try {
    const f = providerForm.value;
    const payload: Record<string, unknown> = {
      name: f.name, url: f.url, authMode: f.authMode, description: f.description,
    };
    if (f.authMode === 'oauth') {
      if (!f.authorizationUrl || !f.tokenUrl || !f.clientId || !f.clientSecret) {
        ElMessage.error('OAuth 配置需要授权地址、令牌地址、Client ID 和 Client Secret');
        return;
      }
      payload.oauthConfig = {
        authorizationUrl: f.authorizationUrl.trim(),
        tokenUrl: f.tokenUrl.trim(),
        clientId: f.clientId.trim(),
        clientSecret: f.clientSecret,
        scopes: f.scopes.split(/\s+/).filter(Boolean),
        ...(f.issuer.trim() ? { issuer: f.issuer.trim() } : {}),
        ...(f.redirectUri.trim() ? { redirectUri: f.redirectUri.trim() } : {}),
      };
    }
    const r = await enterpriseApi.createMcpProvider(payload);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('Provider 已创建');
    providerDialog.value = false;
    await reload();
  } finally { saving.value = false; }
}

async function removeProvider(row: McpProvider) {
  const confirmed = await ElMessageBox.confirm(`删除 Provider「${row.name}」？`, '删除 Provider', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deleteMcpProvider(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}

function openConnector() {
  connectorForm.value = { providerId: providers.value[0]?.id || '', name: '', url: '', credentialMode: 'centralized', sharedSecret: '', isPublic: false };
  connectorDialog.value = true;
}

async function saveConnector() {
  saving.value = true;
  try {
    const r = await enterpriseApi.createMcpConnector(connectorForm.value);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success('连接已创建');
    connectorDialog.value = false;
    await reload();
  } finally { saving.value = false; }
}

async function removeConnector(row: McpConnector) {
  const confirmed = await ElMessageBox.confirm(`删除连接「${row.name}」？`, '删除连接', { type: 'warning' }).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.deleteMcpConnector(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  await reload();
}

async function discover(row: McpConnector) {
  discovering.value = row.id;
  try {
    const r = await enterpriseApi.discoverMcpTools(row.id);
    if ('error' in r) { ElMessage.error(r.error); return; }
    ElMessage.success(`已发现 ${r.data?.length || 0} 个工具`);
    await reload();
  } finally { discovering.value = ''; }
}

async function showTools(row: McpConnector) {
  activeConnector.value = row;
  tools.value = (await enterpriseApi.mcpTools(row.id)) || [];
  toolsDrawer.value = true;
}

async function toggleTool(row: McpTool) {
  if (!activeConnector.value) return;
  const r = await enterpriseApi.updateMcpTool(activeConnector.value.id, row.name, { enabled: row.enabled });
  if ('error' in r) ElMessage.error(r.error);
}

async function updateCost(row: McpTool) {
  if (!activeConnector.value) return;
  const r = await enterpriseApi.updateMcpTool(activeConnector.value.id, row.name, { costCny: row.cost_cny });
  if ('error' in r) ElMessage.error(r.error);
}

// ===== 集中式 MCP OAuth 授权闭环 =====
function isOAuthProvider(row: McpConnector): boolean {
  return providers.value.find((p) => p.id === row.provider_id)?.auth_mode === 'oauth';
}

function oauthLabel(status: string): string {
  return ({
    not_authorized: '未授权', pending: '等待授权', authorized: '已授权',
    expired: '已过期', revoked: '已撤销', reauthorization_required: '需重新授权',
  } as Record<string, string>)[status] || status;
}

function oauthTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'authorized') return 'success';
  if (status === 'pending') return 'info';
  if (status === 'expired' || status === 'reauthorization_required') return 'danger';
  return 'warning';
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** 授权在独立窗口完成，管理页按状态轮询收敛（回调页不会回传任何 token）。 */
function pollOAuth(id: string) {
  stopPoll();
  let ticks = 0;
  pollTimer = setInterval(async () => {
    ticks += 1;
    if (ticks > 80) { stopPoll(); return; }
    const s = await enterpriseApi.mcpOAuthStatus(id);
    if (!s) return;
    if (s.status === 'authorized' || s.status === 'reauthorization_required' || s.status === 'revoked') {
      stopPoll();
      await reload();
      if (s.status === 'authorized') ElMessage.success('OAuth 授权已完成');
      else ElMessage.warning(s.message);
    }
  }, 1500);
}

async function startOAuth(row: McpConnector) {
  authorizing.value = row.id;
  try {
    const r = await enterpriseApi.startMcpOAuth(row.id);
    if ('error' in r) { ElMessage.error(r.error); return; }
    window.open(r.data.authorizationUrl, '_blank', 'noopener,noreferrer,width=720,height=760');
    ElMessage.info('已打开授权页，完成授权后状态会自动更新');
    pollOAuth(row.id);
  } finally { authorizing.value = ''; }
}

async function revokeOAuth(row: McpConnector) {
  const confirmed = await ElMessageBox.confirm(
    `撤销「${row.name}」的 OAuth 授权？之后工具调用会要求重新授权。`, '撤销授权', { type: 'warning' },
  ).catch(() => false);
  if (!confirmed) return;
  const r = await enterpriseApi.revokeMcpOAuth(row.id);
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success('已撤销授权');
  await reload();
}

onMounted(() => {
  // 回调会 302 回 /admin/enterprise?mcp_oauth=success|denied，query 里只有状态，不含凭证。
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('mcp_oauth');
  if (flag === 'success') ElMessage.success('OAuth 授权完成');
  else if (flag === 'denied') ElMessage.warning('OAuth 授权被取消或拒绝');
  if (flag) {
    params.delete('mcp_oauth');
    params.delete('connector');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }
  void reload();
});
onBeforeUnmount(stopPoll);
</script>

<style scoped>
.epanel { display: flex; flex-direction: column; gap: 14px; }
.toolbar, .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.toolbar h3, .panel-head h3 { margin: 0 0 4px; font-size: 15px; }
.toolbar p, .panel-head span { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; background: var(--color-bg-secondary); }
@media (max-width: 760px) { .toolbar { flex-direction: column; } }
</style>
