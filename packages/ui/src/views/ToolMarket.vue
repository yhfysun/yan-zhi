<template>
  <div class="page">
    <div class="page-top">
      <div class="page-info">
        <h2 class="page-title">工具管理</h2>
        <p class="page-sub">管理 MCP 服务、内置工具、自定义工具和同源商城</p>
      </div>
    </div>

    <el-tabs v-model="tab" class="glass-tabs">
      <el-tab-pane label="MCP 服务" name="mcp">
        <div class="tab-top">
          <el-button type="primary" size="small" @click="openMcpAdd"><el-icon><Plus /></el-icon> 新增服务</el-button>
        </div>
        <el-empty v-if="mcpStore.servers.length === 0" description="暂无 MCP 服务" :image-size="100" />
        <div v-else class="card-grid">
          <div v-for="s in mcpStore.servers" :key="s.id" class="mcp-card" :class="{ connected: s.status === 'connected' }">
            <div class="card-top">
              <div class="card-icon" :class="s.status"><el-icon :size="20"><Connection /></el-icon></div>
              <div class="card-head">
                <span class="card-name">{{ s.name }}<span class="status-dot" :class="s.status"></span></span>
                <div class="card-badges">
                  <el-tag size="small" effect="light">{{ s.transport.toUpperCase() }}</el-tag>
                </div>
              </div>
            </div>
            <div class="card-body">
              <div class="card-addr">
                <el-icon :size="14"><Link /></el-icon>
                <span v-if="s.transport === 'stdio'">{{ s.command }} {{ (s.args || []).join(' ') }}</span>
                <span v-else>{{ s.url }}</span>
              </div>
            </div>
            <div class="card-foot">
              <span class="stat">{{ (mcpStore.tools[s.id] || []).length }} 工具</span>
              <div class="card-actions">
                <el-button size="small" :type="s.status === 'connected' ? '' : 'primary'" :loading="mcpStore.connecting === s.id" @click="connectMcp(s.id)" round>{{ s.status === 'connected' ? '重连' : '连接' }}</el-button>
                <el-button size="small" :disabled="s.status !== 'connected'" @click="showMcpTools(s.id)" round>工具</el-button>
                <el-button size="small" @click="delMcp(s.id)" round><el-icon><DeleteIcon /></el-icon></el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="内置工具" name="builtin">
        <el-empty v-if="toolsStore.builtinTools.length === 0" description="暂无内置工具" :image-size="100" />
        <div v-else class="card-grid">
          <div v-for="t in toolsStore.builtinTools" :key="t.name" class="tool-card">
            <div class="tool-card-header">
              <el-icon :size="20" class="tool-icon"><Switch /></el-icon>
              <span class="tool-card-name">{{ t.name }}</span>
              <el-tag size="small" type="info" effect="plain">内置</el-tag>
            </div>
            <p class="tool-card-desc">{{ t.description }}</p>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="自定义工具" name="custom">
        <div class="tab-top">
          <el-button type="primary" size="small" @click="showCustomEditor = true"><el-icon><Plus /></el-icon> 新增工具</el-button>
        </div>
        <el-empty v-if="toolsStore.customTools.length === 0" description="暂无自定义工具" :image-size="100" />
        <div v-else class="card-grid">
          <div v-for="t in toolsStore.customTools" :key="t.id" class="tool-card" :class="{ disabled: !t.enabled }">
            <div class="tool-card-header">
              <el-icon :size="20" class="tool-icon"><Switch /></el-icon>
              <span class="tool-card-name">{{ t.name }}</span>
              <el-tag size="small" :type="t.source === 'remote' ? 'warning' : 'success'" effect="plain">{{ t.source === 'remote' ? '远程' : '本地' }}</el-tag>
              <el-tag v-if="t.isPublic" size="small" type="primary" effect="plain">已公开</el-tag>
            </div>
            <p class="tool-card-desc">{{ t.description || '无描述' }}</p>
            <div class="tool-card-foot">
              <span class="stat">{{ t.runtime }} · {{ t.timeout }}ms</span>
              <div class="card-actions">
                <el-switch v-model="t.enabled" size="small" @change="(v: boolean) => toolsStore.toggleEnabled(t.id, v)" />
                <el-button size="small" link @click="editCustomTool(t)">编辑</el-button>
                <el-button size="small" link type="danger" @click="delCustomTool(t.id)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="同源商城" name="market">
        <div class="market-section">
          <div class="section-title">远程商城源</div>
          <div class="tab-top">
            <el-button type="primary" size="small" @click="showSourceForm = true"><el-icon><Plus /></el-icon> 添加源</el-button>
          </div>
          <div v-if="toolsStore.remoteSources.length === 0" class="empty-hint">暂无远程源，添加其他言智节点地址以获取自定义工具</div>
          <div v-else class="source-list">
            <div v-for="s in toolsStore.remoteSources" :key="s.id" class="source-item">
              <div class="source-info">
                <span class="source-name">{{ s.name }}</span>
                <span class="source-url">{{ s.base_url }}</span>
                <el-tag size="small" :type="s.enabled ? 'success' : 'info'">{{ s.enabled ? '启用' : '禁用' }}</el-tag>
              </div>
              <div class="source-actions">
                <el-button size="small" @click="browseMarket(s)">浏览</el-button>
                <el-button size="small" @click="testSource(s.id)">测试</el-button>
                <el-button size="small" type="danger" @click="delSource(s.id)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="marketSourceId" class="market-section" style="margin-top:24px">
          <div class="section-title">远程工具 — {{ marketSourceName }}</div>
          <el-empty v-if="!marketItems.length" description="该远程源暂无公开的自定义工具" :image-size="80" />
          <div v-else class="card-grid">
            <div v-for="item in marketItems" :key="item.id" class="tool-card">
              <div class="tool-card-header">
                <span class="tool-card-name">{{ item.name }}</span>
                <el-tag size="small" type="warning" effect="plain">远程</el-tag>
              </div>
              <p class="tool-card-desc">{{ item.description || '无描述' }}</p>
              <div class="tool-card-foot">
                <el-button size="small" type="primary" @click="installTool(item)">安装到本地</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCustomEditor" :title="editingTool ? '编辑工具' : '新增自定义工具'" width="640px" @close="resetEditor">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="editor.name" placeholder="工具名称（英文）" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="editor.description" placeholder="给 LLM 看的描述" /></el-form-item>
        <el-form-item label="入口函数"><el-input v-model="editor.entry" placeholder="如: myToolHandler" /></el-form-item>
        <el-form-item label="输入 Schema"><el-input v-model="editor.schemaText" type="textarea" :rows="4" placeholder='{"type":"object","properties":{"key":{"type":"string"}}}' /></el-form-item>
        <el-form-item label="JS 代码"><el-input v-model="editor.code" type="textarea" :rows="10" class="code-input" placeholder="function myToolHandler(args) { return args.key + ' result'; }" /></el-form-item>
        <el-form-item label="超时(ms)"><el-input-number v-model="editor.timeout" :min="1000" :step="1000" /></el-form-item>
        <el-form-item label="发布到商城"><el-switch v-model="editor.isPublic" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCustomEditor = false">取消</el-button>
        <el-button type="primary" :loading="savingCustom" @click="saveCustomTool">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSourceForm" title="添加同源工具商城" width="480px" @close="resetSourceForm">
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
        <el-form-item v-if="sourceForm.authType !== 'none'" label="凭证"><el-input v-model="sourceForm.authValue" :placeholder="sourceForm.authType === 'bearer' ? 'Token' : 'API Key'" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSourceForm = false">取消</el-button>
        <el-button type="primary" @click="addSource">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Connection, Link, Switch, Delete as DeleteIcon } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMcpStore } from '../stores';
import { useToolsStore } from '../stores/tools';

const mcpStore = useMcpStore();
const toolsStore = useToolsStore();
const tab = ref('mcp');

onMounted(() => { mcpStore.loadServers(); toolsStore.loadCustomTools(); toolsStore.loadRemoteSources(); });

async function connectMcp(id: string) {
  const r = await mcpStore.connect(id);
  ElMessage[r.ok ? 'success' : 'error'](r.msg);
}
function showMcpTools(_id: string) { /* 复用原有逻辑 */ }
function openMcpAdd() { /* 打开原有 MCP 新增对话框 */ }
async function delMcp(id: string) {
  try { await ElMessageBox.confirm('删除该 MCP 服务？', '提示', { type: 'warning' }); await mcpStore.deleteServer(id); ElMessage.success('已删除'); } catch {}
}

const showCustomEditor = ref(false);
const editingTool = ref<any>(null);
const savingCustom = ref(false);
const editor = ref({ name: '', description: '', entry: '', schemaText: '{}', code: '', timeout: 30000, isPublic: false });

function editCustomTool(t: any) {
  editingTool.value = t;
  editor.value = { name: t.name, description: t.description || '', entry: t.entry, schemaText: JSON.stringify(t.inputSchema, null, 2), code: t.code, timeout: t.timeout, isPublic: t.isPublic };
  showCustomEditor.value = true;
}
function resetEditor() { editor.value = { name: '', description: '', entry: '', schemaText: '{}', code: '', timeout: 30000, isPublic: false }; editingTool.value = null; }
async function saveCustomTool() {
  if (!editor.value.name || !editor.value.code || !editor.value.entry) { ElMessage.warning('名称、入口函数和代码为必填项'); return; }
  savingCustom.value = true;
  try {
    let schema: Record<string, unknown>;
    try { schema = JSON.parse(editor.value.schemaText); } catch { ElMessage.warning('输入 Schema 格式错误'); return; }
    if (editingTool.value) {
      await toolsStore.updateTool(editingTool.value.id, { name: editor.value.name, description: editor.value.description, code: editor.value.code, entry: editor.value.entry, inputSchema: schema, timeout: editor.value.timeout, isPublic: editor.value.isPublic });
    } else {
      await toolsStore.createTool({ name: editor.value.name, description: editor.value.description, entry: editor.value.entry, inputSchema: schema, code: editor.value.code, timeout: editor.value.timeout, isPublic: editor.value.isPublic });
    }
    showCustomEditor.value = false; resetEditor(); ElMessage.success('保存成功');
  } finally { savingCustom.value = false; }
}
async function delCustomTool(id: string) {
  try { await ElMessageBox.confirm('删除该自定义工具？', '提示', { type: 'warning' }); await toolsStore.deleteTool(id); ElMessage.success('已删除'); } catch {}
}

const showSourceForm = ref(false);
const sourceForm = ref({ name: '', baseUrl: '', authType: 'none' as string, authValue: '' });
function resetSourceForm() { sourceForm.value = { name: '', baseUrl: '', authType: 'none', authValue: '' }; }
async function addSource() {
  if (!sourceForm.value.name || !sourceForm.value.baseUrl) { ElMessage.warning('名称和 URL 为必填项'); return; }
  const authConfig: any = {};
  if (sourceForm.value.authType === 'bearer') authConfig.token = sourceForm.value.authValue;
  else if (sourceForm.value.authType === 'api-key') authConfig.apiKey = sourceForm.value.authValue;
  await toolsStore.addRemoteSource({ name: sourceForm.value.name, baseUrl: sourceForm.value.baseUrl, authType: sourceForm.value.authType, authConfig });
  showSourceForm.value = false; resetSourceForm(); ElMessage.success('同源工具源已添加');
}
async function testSource(id: string) {
  const r = await toolsStore.testRemoteSource(id);
  ElMessage[r.ok ? 'success' : 'error'](r.ok ? '连接成功' : (r.error || '连接失败'));
}
async function delSource(id: string) {
  try { await ElMessageBox.confirm('删除该远程源？', '提示', { type: 'warning' }); await toolsStore.deleteRemoteSource(id); ElMessage.success('已删除'); } catch {}
}

const marketSourceId = ref('');
const marketSourceName = ref('');
const marketItems = ref<any[]>([]);
async function browseMarket(s: any) {
  marketSourceId.value = s.id; marketSourceName.value = s.name;
  await toolsStore.fetchRemoteItems(s.id);
  marketItems.value = toolsStore.remoteItems[s.id] || [];
}
async function installTool(item: any) {
  try { await toolsStore.installFromMarket(marketSourceId.value, item.id); ElMessage.success(`已安装 "${item.name}"`); } catch { ElMessage.error('安装失败'); }
}
</script>

<style scoped>
.page { padding: 28px 32px; }
.page-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); margin: 4px 0 0; }
.tab-top { margin-bottom: 14px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-top: 12px; }
.mcp-card, .tool-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 18px;
  transition: all 0.2s; display: flex; flex-direction: column; gap: 12px;
}
.mcp-card:hover, .tool-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.06); border-color: var(--glass-border-strong); }
.mcp-card.connected { border-color: rgba(34,197,94,0.25); }
.tool-card.disabled { opacity: 0.5; }
.card-top { display: flex; align-items: center; gap: 12px; }
.card-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(59,130,246,0.1); color: var(--color-primary); flex-shrink: 0; }
.card-icon.connected { background: rgba(34,197,94,0.12); color: #22c55e; }
.card-head { flex: 1; min-width: 0; }
.card-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.card-badges { margin-top: 4px; }
.status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.status-dot.connected { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.status-dot.disconnected { background: #94a3b8; }
.card-body { background: rgba(15,23,42,0.03); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.card-addr { display: flex; align-items: center; gap: 6px; font-family: monospace; color: var(--color-text-secondary); overflow: hidden; }
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-actions { display: flex; gap: 4px; align-items: center; }
.stat { font-size: 12px; color: var(--color-text-secondary); }
.tool-card-header { display: flex; align-items: center; gap: 8px; }
.tool-card-name { font-family: monospace; font-size: 14px; font-weight: 600; flex: 1; }
.tool-card-desc { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; margin: 0; }
.tool-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.market-section { margin-bottom: 16px; }
.section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.empty-hint { font-size: 13px; color: var(--color-text-secondary); padding: 16px 0; }
.source-list { display: flex; flex-direction: column; gap: 8px; }
.source-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); }
.source-info { display: flex; align-items: center; gap: 12px; }
.source-name { font-weight: 600; }
.source-url { font-size: 12px; color: var(--color-text-secondary); font-family: monospace; }
.source-actions { display: flex; gap: 6px; }
.tool-icon { color: #8B5CF6; flex-shrink: 0; }
.code-input textarea { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 13px; }
</style>
