<template>
  <div class="page">
    <!-- ===== 商城卡片入口页 ===== -->
    <template v-if="currentView === 'marketplace'">
      <header class="page-header">
        <div>
          <h2 class="page-title">智能体商店</h2>
          <p class="page-sub">管理本地智能体，或接入远程智能体商城</p>
        </div>
      </header>

      <div class="marketplace-grid">
        <!-- 本地商城卡片 -->
        <el-card class="marketplace-card local-card" shadow="hover" @click="goToLocalAgents()">
          <div class="marketplace-card-body">
            <div class="marketplace-icon local">
              <span class="icon-emoji">🤖</span>
            </div>
            <div class="marketplace-info">
              <div class="marketplace-name">本地智能体</div>
              <div class="marketplace-desc">管理内置智能体和自定义创建的智能体</div>
            </div>
          </div>
          <div class="marketplace-stats">
            <el-tag size="small" type="info" effect="plain">内置 {{ builtinCount }} 个</el-tag>
            <el-tag size="small" type="success" effect="plain">自定义 {{ customCount }} 个</el-tag>
          </div>
          <div class="marketplace-actions">
            <el-button type="primary" size="small">进入管理</el-button>
          </div>
        </el-card>

        <!-- 远程商城卡片 -->
        <el-card
          v-for="s in agentRemoteSources"
          :key="s.id"
          class="marketplace-card remote-card"
          shadow="hover"
          @click="goToRemoteAgents(s)"
        >
          <div class="marketplace-card-body">
            <div class="marketplace-icon remote">
              <span class="icon-emoji">🌐</span>
            </div>
            <div class="marketplace-info">
              <div class="marketplace-name">
                {{ s.name }}
                <span class="connect-dot" :class="s.status || 'unknown'"></span>
              </div>
              <div class="marketplace-desc mono">{{ s.base_url }}</div>
            </div>
          </div>
          <div class="marketplace-stats">
            <el-tag size="small" :type="s.enabled ? 'success' : 'info'">{{ s.enabled ? '启用' : '禁用' }}</el-tag>
          </div>
          <div class="marketplace-actions" @click.stop>
            <el-button size="small" text @click="browseAgentSource(s)">浏览</el-button>
            <el-button size="small" text @click="testAgentSource(s.id)">测试</el-button>
            <el-button size="small" text type="danger" @click="delAgentSource(s.id)">删除</el-button>
          </div>
        </el-card>

        <!-- 添加远程商城入口卡片 -->
        <el-card class="marketplace-card add-card" shadow="never" @click="showAgentSourceForm = true">
          <div class="add-card-content">
            <el-icon :size="32"><Plus /></el-icon>
            <span class="add-card-text">添加远程商城</span>
          </div>
        </el-card>
      </div>

      <el-empty v-if="agentRemoteSources.length === 0 && !loading" description="暂无远程商城源，点击上方卡片添加" :image-size="80" />
    </template>

    <!-- ===== 本地智能体列表页 ===== -->
    <template v-if="currentView === 'local-agents'">
      <header class="page-header">
        <div class="back-header">
          <el-button text :icon="ArrowLeft" class="back-btn" @click="goToMarketplace()">返回商城</el-button>
          <div>
            <h2 class="page-title">本地智能体</h2>
            <p class="page-sub">内置智能体与自定义创建的智能体</p>
          </div>
        </div>
        <el-button type="primary" :icon="Plus" @click="createAgent">新建智能体</el-button>
      </header>

      <div v-loading="loading" class="agent-grid">
        <template v-if="loading">
          <el-skeleton v-for="n in 4" :key="n" animated style="padding:16px">
            <template #template><el-skeleton-item variant="text" style="width:60%" /><el-skeleton-item variant="text" style="width:40%" /><el-skeleton-item variant="rect" style="height:40px;margin-top:8px" /></template>
          </el-skeleton>
        </template>
        <el-card
          v-for="agent in store.agents"
          :key="agent.id"
          class="agent-card"
          :class="{ 'is-default': agent.isDefault }"
          shadow="hover"
        >
          <div class="agent-card-head" @click="openCanvas(agent.id)">
            <div class="agent-avatar">{{ (agent.name || '?').slice(0, 2) }}</div>
            <div class="agent-info">
              <div class="agent-name">
                <el-icon v-if="agent.isDefault" class="lock-icon"><Lock /></el-icon>
                {{ agent.name }}
              </div>
              <div class="agent-desc">{{ agent.description || '暂无描述' }}</div>
            </div>
          </div>
          <div class="agent-meta">
            <el-tag size="small" type="info">{{ agent.workflow.nodes.length }} 节点</el-tag>
            <el-tag size="small" type="info">{{ agent.workflow.edges.length }} 连线</el-tag>
            <span class="agent-time">{{ formatTime(agent.updatedAt) }}</span>
          </div>
          <div class="agent-actions" @click.stop>
            <el-button text size="small" :icon="EditPen" @click="editAgent(agent)">编辑</el-button>
            <el-button text size="small" :icon="Setting" @click="openCanvas(agent.id)">设计</el-button>
            <el-button v-if="!agent.isDefault" text size="small" type="danger" :icon="Delete" @click="remove(agent)">删除</el-button>
          </div>
        </el-card>
      </div>

      <el-empty v-if="!loading && store.agents.length === 0" description="还没有智能体，点击右上角新建">
        <el-button type="primary" :icon="Plus" @click="createAgent">立即创建</el-button>
      </el-empty>
    </template>

    <!-- ===== 远程智能体列表页 ===== -->
    <template v-if="currentView === 'remote-agents'">
      <header class="page-header">
        <div class="back-header">
          <el-button text :icon="ArrowLeft" class="back-btn" @click="goToMarketplace()">返回商城</el-button>
          <div>
            <h2 class="page-title">{{ selectedRemoteSource?.name || '远程商城' }}</h2>
            <p class="page-sub mono">{{ selectedRemoteSource?.base_url || '' }}</p>
          </div>
        </div>
      </header>

      <div class="remote-toolbar">
        <el-button size="small" @click="browseAgentSource(selectedRemoteSource)">刷新列表</el-button>
      </div>

      <div v-if="remoteAgentItems.length === 0" style="padding: 40px 0; text-align: center; color: var(--color-text-secondary);">
        该远程商城暂无可用智能体
      </div>

      <div v-else class="agent-grid">
        <el-card v-for="item in remoteAgentItems" :key="item.id" class="agent-card remote-agent-card" shadow="hover">
          <div class="agent-card-head">
            <div class="agent-avatar remote-avatar">{{ (item.name || '?').slice(0, 2) }}</div>
            <div class="agent-info">
              <div class="agent-name">{{ item.name }}</div>
              <div class="agent-desc">{{ item.description || '暂无描述' }}</div>
            </div>
          </div>
          <div class="agent-meta">
            <span class="agent-time">v{{ item.version || 1 }}</span>
          </div>
          <div class="agent-actions">
            <el-button size="small" type="primary" @click="installRemoteAgent(item.id)">复制到本地</el-button>
          </div>
        </el-card>
      </div>
    </template>

    <!-- 远程商城源添加弹窗 -->
    <el-dialog v-model="showAgentSourceForm" title="添加远程智能体商城" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="agentSourceForm.name" placeholder="如: 官方智能体源" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="agentSourceForm.baseUrl" placeholder="http://192.168.1.100:3001" /></el-form-item>
        <el-form-item label="认证">
          <el-select v-model="agentSourceForm.authType">
            <el-option label="无认证" value="none" />
            <el-option label="Bearer Token" value="bearer" />
            <el-option label="API Key" value="api-key" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="agentSourceForm.authType !== 'none'" label="凭证">
          <el-input v-model="agentSourceForm.authValue" :placeholder="agentSourceForm.authType === 'bearer' ? 'Token' : 'API Key'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAgentSourceForm = false">取消</el-button>
        <el-button type="primary" @click="addAgentSource">保存</el-button>
      </template>
    </el-dialog>

    <AgentEditDialog v-model="showEdit" :agent="editing" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, EditPen, Delete, Setting, Lock, ArrowLeft } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useAgentStore } from '../stores/agent';
import { api } from '../api/client';
import type { Agent } from '@yan-zhi/shared';
import AgentEditDialog from '../components/AgentEditDialog.vue';

const router = useRouter();
const store = useAgentStore();

const loading = ref(false);
const showEdit = ref(false);
const editing = ref<Agent | null>(null);

// 视图状态：marketplace | local-agents | remote-agents
const currentView = ref<'marketplace' | 'local-agents' | 'remote-agents'>('marketplace');

// 远程智能体商城
const showAgentSourceForm = ref(false);
const agentRemoteSources = ref<any[]>([]);
const remoteAgentItems = ref<any[]>([]);
const selectedRemoteSource = ref<any>(null);
const agentSourceForm = ref({ name: '', baseUrl: '', authType: 'none', authValue: '' });

// 统计
const builtinCount = computed(() => store.agents.filter((a) => a.isDefault).length);
const customCount = computed(() => store.agents.filter((a) => !a.isDefault).length);

// 视图切换
function goToMarketplace() {
  currentView.value = 'marketplace';
  remoteAgentItems.value = [];
  selectedRemoteSource.value = null;
}
function goToLocalAgents() {
  currentView.value = 'local-agents';
}
function goToRemoteAgents(source: any) {
  currentView.value = 'remote-agents';
  selectedRemoteSource.value = source;
  browseAgentSource(source);
}

async function loadAgentRemoteSources() {
  try { const r = await api.get<any[]>('/agent-marketplace'); agentRemoteSources.value = r.data || []; } catch {}
}
async function addAgentSource() {
  if (!agentSourceForm.value.name || !agentSourceForm.value.baseUrl) { ElMessage.warning('名称和 URL 为必填项'); return; }
  const authConfig: any = {};
  if (agentSourceForm.value.authType === 'bearer') authConfig.token = agentSourceForm.value.authValue;
  else if (agentSourceForm.value.authType === 'api-key') authConfig.apiKey = agentSourceForm.value.authValue;
  await api.post('/agent-marketplace', { name: agentSourceForm.value.name, baseUrl: agentSourceForm.value.baseUrl, authType: agentSourceForm.value.authType, authConfig });
  showAgentSourceForm.value = false; await loadAgentRemoteSources(); ElMessage.success('已添加');
}
async function testAgentSource(id: string) {
  const r = await api.post<any>(`/agent-marketplace/${id}/test`);
  ElMessage[r.ok ? 'success' : 'error'](r.ok ? '连接成功' : (r.error || '连接失败'));
}
async function delAgentSource(id: string) {
  try { await ElMessageBox.confirm('删除该远程源？', '提示', { type: 'warning' }); await api.delete(`/agent-marketplace/${id}`); await loadAgentRemoteSources(); ElMessage.success('已删除'); } catch {}
}
async function browseAgentSource(s: any) {
  selectedRemoteSource.value = s;
  try { const r = await api.get<any>(`/agent-marketplace/${s.id}/agents`); remoteAgentItems.value = r?.data?.items || []; } catch { ElMessage.error('获取远程智能体列表失败'); }
}
async function installRemoteAgent(agentId: string) {
  if (!selectedRemoteSource.value) return;
  try { await api.post(`/agent-marketplace/${selectedRemoteSource.value.id}/install`, { agentId }); await store.loadAgents(); ElMessage.success('已复制到本地'); } catch { ElMessage.error('安装失败'); }
}

onMounted(async () => {
  loading.value = true;
  try { await store.loadAgents(); } finally { loading.value = false; }
  loadAgentRemoteSources();
});

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openCanvas(id: string) {
  router.push(`/agents/${id}`);
}

function createAgent() {
  editing.value = null;
  showEdit.value = true;
}

function editAgent(agent: Agent) {
  editing.value = agent;
  showEdit.value = true;
}

function onSaved(_id: string) {
  showEdit.value = false;
}

function onDeleted(_id: string) {
  showEdit.value = false;
}

async function remove(agent: Agent) {
  await ElMessageBox.confirm(`确定删除智能体「${agent.name}」？此操作不可恢复。`, '确认删除', {
    type: 'warning',
  });
  await store.deleteAgent(agent.id);
  ElMessage.success('已删除');
}
</script>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); margin: 6px 0 0; }
.page-sub.mono { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px; }

/* ===== 返回导航 ===== */
.back-header { display: flex; align-items: flex-start; gap: 12px; }
.back-btn { flex-shrink: 0; margin-top: 2px; }

/* ===== 商城卡片网格（入口层） ===== */
.marketplace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.marketplace-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.marketplace-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
  border-color: var(--glass-border-strong);
}
.marketplace-card.local-card {
  border-color: rgba(139, 92, 246, 0.25);
}
.marketplace-card-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.marketplace-icon {
  width: 56px; height: 56px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 24px;
}
.marketplace-icon.local {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15));
}
.marketplace-icon.remote {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(16, 185, 129, 0.12));
}
.icon-emoji { line-height: 1; }
.marketplace-info { flex: 1; min-width: 0; }
.marketplace-name {
  font-weight: 600; font-size: 16px;
  display: flex; align-items: center; gap: 6px;
}
.marketplace-desc {
  font-size: 12px; color: var(--color-text-secondary);
  margin-top: 4px; line-height: 1.4;
}
.marketplace-desc.mono {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 11px; word-break: break-all;
}
.marketplace-stats {
  display: flex; gap: 6px; margin: 14px 0 10px; flex-wrap: wrap;
}
.marketplace-actions {
  display: flex; gap: 4px;
  border-top: 1px solid var(--color-border-light); padding-top: 10px;
}
.connect-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.connect-dot.connected { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
.connect-dot.disconnected,
.connect-dot.unknown { background: #94a3b8; }

/* 添加远程商城卡片 */
.marketplace-card.add-card {
  border: 2px dashed var(--glass-border);
  background: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.2s;
}
.marketplace-card.add-card:hover {
  border-color: var(--color-primary);
  background: rgba(59, 130, 246, 0.04);
  transform: translateY(-2px);
}
.add-card-content {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 16px 0; color: var(--color-text-secondary);
}
.add-card-text { font-size: 14px; }

/* ===== 智能体卡片网格 ===== */
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.agent-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s, box-shadow 0.2s;
}
.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
  border-color: var(--glass-border-strong);
}
.agent-card.is-default { border-color: rgba(59, 130, 246, 0.25); }
.agent-card-head { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
.agent-avatar {
  width: 48px; height: 48px; border-radius: 12px;
  background: linear-gradient(135deg, #8B5CF6, #6366F1);
  color: white; display: flex; align-items: center; justify-content: center;
  font-weight: 700; flex-shrink: 0;
}
.agent-avatar.remote-avatar {
  background: linear-gradient(135deg, #22c55e, #10b981);
}
.agent-info { flex: 1; min-width: 0; }
.agent-name {
  font-weight: 600; font-size: 15px;
  display: flex; align-items: center; gap: 4px;
}
.agent-name .lock-icon { font-size: 12px; color: var(--color-text-secondary); }
.agent-desc { font-size: 12px; color: var(--color-text-secondary); margin: 4px 0 0; line-height: 1.4; }
.agent-meta { display: flex; align-items: center; gap: 6px; margin: 12px 0 8px; flex-wrap: wrap; }
.agent-time { font-size: 11px; color: var(--color-text-secondary); margin-left: auto; }
.agent-actions { display: flex; gap: 4px; border-top: 1px solid var(--color-border-light); padding-top: 8px; }

/* ===== 远程工具条 ===== */
.remote-toolbar { margin-bottom: 16px; }
</style>
