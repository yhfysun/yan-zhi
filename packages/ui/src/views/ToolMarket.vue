<template>
  <div class="page">
    <div class="page-top">
      <div class="page-info">
        <h2 class="page-title">工具管理</h2>
        <p class="page-sub">浏览和管理本地与远程工具商城</p>
      </div>
    </div>

    <!-- ========== 视图容器 ========== -->
    <Transition name="view-fade" mode="out-in">
    <div v-if="activeMarketId === null" key="main">
      <!-- MCP 服务只读概览区 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">MCP 服务</h3>
          <el-button text size="small" @click="$router.push('/mcp')">前往管理</el-button>
        </div>
        <el-empty v-if="mcpStore.servers.length === 0" description="尚未接入 MCP 服务，前往管理页添加" :image-size="60" />
        <div v-else class="mcp-picker-list">
          <McpServerPicker
            v-for="s in mcpStore.servers"
            :key="s.id"
            :server-id="s.id"
            show-tools-count
          />
        </div>
      </section>

      <!-- 工具商城区 -->
      <section class="section">
        <MarketplaceShell title="工具商城" subtitle="浏览本地与远程工具商城">
          <template #actions>
            <el-button type="primary" :icon="Plus" @click="showSourceForm = true" class="fab-add">
              新增远程商城
            </el-button>
          </template>

          <div class="market-grid">
            <MarketplaceCard variant="local" @click="activeMarketId = 'local'">
              <template #icon><el-icon :size="28"><HomeFilled /></el-icon></template>
              <template #title>本地商城</template>
              <template #description>内置工具与自定义工具</template>
              <template #meta>
                {{ toolsStore.builtinTools.length }} 内置 · {{ toolsStore.customTools.length }} 自定义
              </template>
              <template #badge><el-tag size="small" type="primary" effect="plain">本机</el-tag></template>
            </MarketplaceCard>

            <MarketplaceCard
              v-for="s in toolsStore.remoteSources"
              :key="s.id"
              variant="remote"
              @click="enterRemoteMarket(s)"
            >
              <template #icon><el-icon :size="28"><Cloudy /></el-icon></template>
              <template #title>{{ s.name }}</template>
              <template #description>{{ s.base_url }}</template>
              <template #meta>远程商城</template>
              <template #badge><el-tag size="small" type="info" effect="plain">远程</el-tag></template>
            </MarketplaceCard>
          </div>

          <MarketplaceEmpty
            v-if="toolsStore.remoteSources.length === 0"
            description="暂无远程商城，点击上方按钮添加其他节点"
            :image-size="60"
          />
        </MarketplaceShell>
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
        <div v-for="g in toolsStore.builtinToolGroups" :key="g.key" class="builtin-cat">
          <div class="builtin-cat-head" @click="toggleBuiltinCat(g.key)">
            <el-icon :size="12" class="builtin-cat-arrow" :class="{ open: isBuiltinCatOpen(g.key) }"><ArrowRight /></el-icon>
            <span class="builtin-cat-name">{{ g.label }}</span>
            <span class="builtin-cat-count">{{ g.tools.length }}</span>
          </div>
          <div v-show="isBuiltinCatOpen(g.key)" class="card-grid">
            <div v-for="t in g.tools" :key="t.name" class="tool-card">
              <div class="tool-card-header">
                <el-icon :size="16" class="tool-icon"><Switch /></el-icon>
                <span class="tool-card-name">{{ t.name }}</span>
                <el-tag size="small" type="info" effect="plain">内置</el-tag>
              </div>
              <p class="tool-card-desc" :title="t.description">{{ t.description }}</p>
              <div class="tool-schema-toggle">
                <el-button size="small" link @click="toggleSchema('builtin-' + t.name)">
                  {{ expandedSchema['builtin-' + t.name] ? '收起' : '入参/出参' }}
                </el-button>
              </div>
              <div v-if="expandedSchema['builtin-' + t.name]" class="tool-schema-block">
                <div class="schema-section"><span class="schema-label">入参</span><pre class="schema-pre">{{ fmtSchema(t.inputSchema) }}</pre></div>
                <div class="schema-section"><span class="schema-label">出参</span><pre class="schema-pre">{{ fmtSchema(t.outputSchema) }}</pre></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 自定义工具 -->
      <section class="section">
        <div class="section-header">
          <h4 class="subsection-title">自定义工具</h4>
          <el-button type="primary" :icon="Plus" @click="openEditor(null)" class="fab-add">新增工具</el-button>
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
              <el-tag size="small" :type="t.source === 'remote' ? 'primary' : 'success'" effect="plain">
                {{ t.source === 'remote' ? '远程' : '本地' }}
              </el-tag>
              <el-tag v-if="t.isPublic" size="small" type="primary" effect="plain">已公开</el-tag>
            </div>
            <p class="tool-card-desc" :title="t.description || '无描述'">{{ t.description || '无描述' }}</p>
            <div class="tool-schema-toggle">
              <el-button size="small" link @click="toggleSchema('custom-' + t.id)">
                {{ expandedSchema['custom-' + t.id] ? '收起' : '入参/出参' }}
              </el-button>
            </div>
            <div v-if="expandedSchema['custom-' + t.id]" class="tool-schema-block">
              <div class="schema-section"><span class="schema-label">入参</span><pre class="schema-pre">{{ fmtSchema(t.inputSchema) }}</pre></div>
              <div class="schema-section"><span class="schema-label">出参</span><pre class="schema-pre">{{ fmtSchema(t.outputSchema) }}</pre></div>
            </div>
            <div class="tool-card-foot">
              <span class="stat">{{ t.runtime }} · {{ t.timeout }}ms</span>
              <div class="card-actions">
                <el-tooltip v-if="authStore.isLoggedIn" :content="t.isPublic ? '点击下架' : '发布到商城'" placement="top">
                  <el-switch
                    :model-value="!!t.isPublic"
                    size="small"
                    @change="(v: boolean) => toolsStore.togglePublic(t.id, v)"
                  />
                </el-tooltip>
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
            <el-tag size="small" type="primary" effect="plain">远程</el-tag>
          </div>
          <p class="tool-card-desc" :title="item.description || '无描述'">{{ item.description || '无描述' }}</p>
          <div class="tool-card-foot">
            <el-button size="small" type="primary" @click="installTool(item)">安装到本地</el-button>
          </div>
        </div>
      </div>
    </div>
    </Transition>

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
        <el-form-item label="输出 Schema">
          <el-input
            v-model="editor.outputSchemaText"
            type="textarea"
            :rows="4"
            placeholder='{"type":"object","properties":{"result":{"type":"string"}}}（可选）'
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
import {
  Plus, Switch,
  ArrowLeft, HomeFilled, Cloudy, ArrowRight,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useMcpStore, useAuthStore } from '../stores';
import { useToolsStore } from '../stores/tools';
import McpServerPicker from '../components/McpServerPicker.vue';
import MarketplaceShell from '../components/marketplace/MarketplaceShell.vue';
import MarketplaceCard from '../components/marketplace/MarketplaceCard.vue';
import MarketplaceEmpty from '../components/marketplace/MarketplaceEmpty.vue';

const mcpStore = useMcpStore();
const toolsStore = useToolsStore();
const authStore = useAuthStore();

// ---- 视图切换 ----
const activeMarketId = ref<string | null>(null);
const activeRemoteSource = computed(() =>
  toolsStore.remoteSources.find(s => s.id === activeMarketId.value)
);

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
  toolsStore.loadBuiltinTools();
  toolsStore.loadCustomTools();
  toolsStore.loadRemoteSources();
});

// ---- 入参/出参行内展开 ----
const expandedSchema = ref<Record<string, boolean>>({});
function toggleSchema(key: string) {
  expandedSchema.value[key] = !expandedSchema.value[key];
}
const builtinCatOpen = ref<Record<string, boolean>>({});
function isBuiltinCatOpen(key: string) { return builtinCatOpen.value[key] !== false; }
function toggleBuiltinCat(key: string) { builtinCatOpen.value[key] = !isBuiltinCatOpen(key); }
function fmtSchema(schema: unknown): string {
  if (!schema || (typeof schema === 'object' && Object.keys(schema as object).length === 0)) return '（无）';
  try { return JSON.stringify(schema, null, 2); } catch { return String(schema); }
}

// ---- 自定义工具编辑器 ----
const showCustomEditor = ref(false);
const editingTool = ref<any>(null);
const savingCustom = ref(false);
const editor = ref({
  name: '', description: '', entry: '',
  schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false,
});

function openEditor(t: any | null) {
  if (t) {
    editingTool.value = t;
    editor.value = {
      name: t.name, description: t.description || '',
      entry: t.entry, schemaText: JSON.stringify(t.inputSchema, null, 2),
      outputSchemaText: t.outputSchema ? JSON.stringify(t.outputSchema, null, 2) : '',
      code: t.code, timeout: t.timeout, isPublic: t.isPublic,
    };
  } else {
    editingTool.value = null;
    editor.value = { name: '', description: '', entry: '', schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false };
  }
  showCustomEditor.value = true;
}

function resetEditor() {
  editor.value = { name: '', description: '', entry: '', schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false };
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
    let outputSchema: Record<string, unknown> | undefined;
    if (editor.value.outputSchemaText.trim()) {
      try { outputSchema = JSON.parse(editor.value.outputSchemaText); } catch { ElMessage.warning('输出 Schema 格式错误'); return; }
    }
    if (editingTool.value) {
      await toolsStore.updateTool(editingTool.value.id, {
        name: editor.value.name, description: editor.value.description,
        code: editor.value.code, entry: editor.value.entry,
        inputSchema: schema, outputSchema, timeout: editor.value.timeout, isPublic: editor.value.isPublic,
      });
    } else {
      await toolsStore.createTool({
        name: editor.value.name, description: editor.value.description,
        entry: editor.value.entry, inputSchema: schema, outputSchema,
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
/* .page / .page-title / .page-sub come from App.vue global */
.page-top { margin-bottom: 24px; }

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

/* ---- MCP 只读概览 ---- */
.mcp-picker-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ---- 商城卡片网格 ---- */
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

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

.builtin-cat { margin-bottom: 16px; border: 1px solid var(--glass-border); border-radius: 10px; overflow: hidden; }
.builtin-cat-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; user-select: none; background: var(--glass-bg); transition: background 0.15s; }
.builtin-cat-head:hover { background: rgba(99,102,241,0.04); }
.builtin-cat-arrow { transition: transform 0.15s; color: var(--color-text-secondary); }
.builtin-cat-arrow.open { transform: rotate(90deg); }
.builtin-cat-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.builtin-cat-count { font-size: 11px; font-weight: 700; color: var(--color-text-secondary); background: rgba(15,23,42,0.06); border-radius: 10px; padding: 2px 8px; }
.builtin-cat .card-grid { padding: 12px 14px; }

/* ---- 工具卡片（统一高度 + 描述截断）---- */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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

/* 入参/出参展示块 */
.tool-schema-toggle { margin-top: 4px; }
.tool-schema-toggle .el-button { font-size: 12px; padding: 0 2px; height: 22px; }
.tool-schema-block {
  margin-top: 6px; padding: 8px 10px; border-radius: 8px;
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

.card-actions { display: flex; gap: 4px; align-items: center; }
.stat { font-size: 12px; color: var(--color-text-secondary); }

.code-input textarea { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 13px; }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .page-top { margin-bottom: 18px; }
  .page-title { font-size: 18px; }
  .section { margin-bottom: 24px; }
  .section-header { flex-wrap: wrap; gap: 8px; }
  .section-header-right { flex-wrap: wrap; }
  .section-header-right .el-input { max-width: 100%; flex: 1; min-width: 0; }
  .sub-header { flex-wrap: wrap; gap: 10px; padding-bottom: 12px; margin-bottom: 16px; }
  .sub-header-info { width: 100%; }
  .sub-header-actions { width: 100%; justify-content: flex-end; }
  .sub-title { font-size: 16px; }
  .card-grid { grid-template-columns: 1fr; gap: 12px; }
  .market-grid { grid-template-columns: 1fr; gap: 12px; }
  .mcp-picker-list { flex-direction: column; }
}
</style>
