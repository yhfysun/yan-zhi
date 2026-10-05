<template>
  <div class="page">
    <div class="page-top">
      <h2 class="page-title">工具与连接</h2>
    </div>

    <!-- 四 tab：内置工具 / 自定义工具 / MCP 服务 / 远程工具商城 -->
    <el-tabs v-model="activeTab" class="tl-tabs">
      <!-- ===== Tab 1：内置工具 ===== -->
      <el-tab-pane label="内置工具" name="builtin">
        <div class="tab-toolbar">
          <SearchToolbar v-model:query="searchBuiltin" placeholder="搜索名称或描述…" :count="builtinFilteredAll.length">
            <template #actions>
              <el-select v-model="builtinCatFilter" size="default" class="yz-cat-select" placeholder="全部分类">
                <el-option label="全部分类" value="all" />
                <el-option
                  v-for="g in toolsStore.builtinToolGroups"
                  :key="g.key"
                  :label="`${g.label}（${g.tools.length}）`"
                  :value="g.key"
                />
              </el-select>
            </template>
          </SearchToolbar>
        </div>

        <el-empty v-if="toolsStore.builtinTools.length === 0" description="暂无内置工具" :image-size="60" />
        <el-empty v-else-if="builtinGroupsFiltered.length === 0" :description="emptyDesc(searchBuiltin, '内置工具')" :image-size="60" />
        <CollapsibleCategory
          v-for="g in builtinGroupsFiltered"
          :key="g.key"
          :label="g.label"
          :count="g.tools.length"
          :collapsed="!!builtinCollapsed[g.key]"
          @update:collapsed="toggleBuiltinCat(g.key)"
        >
          <CardGrid>
            <GlassCard
              v-for="t in g.tools"
              :key="t.name"
              :title="t.name"
              :tooltip="'查看 ' + t.name + ' 的参数详情'"
              :description="t.description"
              @click="openSchemaDetail({ kind: '内置工具', name: t.name, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema })"
            >
              <template #badge>
                <el-tag size="small" type="info" effect="plain">内置</el-tag>
              </template>
              <template #foot>
                <span class="stat hint">点击查看入参/出参</span>
              </template>
              <template #actions>
                <el-button size="small" link type="primary" @click="openBuiltinRunner(t)">测试</el-button>
              </template>
            </GlassCard>
          </CardGrid>
        </CollapsibleCategory>
      </el-tab-pane>

      <!-- ===== Tab 2：自定义工具 ===== -->
      <el-tab-pane label="自定义工具" name="custom">
        <div class="tab-toolbar">
          <SearchToolbar v-model:query="searchCustom" placeholder="搜索名称或描述…">
            <template #actions>
              <el-select v-model="customCatFilter" size="default" class="yz-cat-select" placeholder="全部分类">
                <el-option label="全部分类" value="all" />
                <el-option v-for="c in customCatOptions" :key="c.key" :label="c.label" :value="c.key" />
              </el-select>
              <el-button type="primary" :icon="Plus" @click="openEditor(null)" class="fab-add">新增工具</el-button>
            </template>
          </SearchToolbar>
        </div>

        <el-empty v-if="toolsStore.customTools.length === 0" description="暂无自定义工具，点击「新增工具」创建" :image-size="60" />
        <el-empty v-else-if="customGroupsFiltered.length === 0" :description="emptyDesc(searchCustom, '工具')" :image-size="60" />
        <CollapsibleCategory
          v-for="g in customGroupsFiltered"
          :key="g.category"
          :label="g.category"
          :count="g.tools.length"
          :collapsed="!!customCollapsed[g.category]"
          @update:collapsed="toggleCustomCat(g.category)"
        >
          <CardGrid>
            <GlassCard
              v-for="t in g.tools"
              :key="t.id"
              :title="t.name"
              :tooltip="'查看 ' + t.name + ' 的参数详情'"
              :description="t.description || '无描述'"
              :disabled="!t.enabled"
              @click="openSchemaDetail({ kind: t.source === 'remote' ? '远程工具' : '自定义工具', name: t.name, description: t.description || '无描述', inputSchema: t.inputSchema, outputSchema: t.outputSchema, meta: `${t.runtime} · ${t.timeout}ms` })"
            >
              <template #badge>
                <el-tag size="small" :type="t.source === 'remote' ? 'primary' : 'success'" effect="plain">
                  {{ t.source === 'remote' ? '远程' : '本地' }}
                </el-tag>
                <el-tag v-if="t.isPublic" size="small" type="primary" effect="plain">已公开</el-tag>
              </template>
              <template #foot>
                <span class="stat">{{ t.runtime }} · {{ t.timeout }}ms</span>
              </template>
              <template #actions>
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
                <el-button size="small" link type="primary" :disabled="!t.enabled" @click="openRunner(t)">试运行</el-button>
                <el-button size="small" link @click="openEditor(t)">编辑</el-button>
                <el-button size="small" link type="danger" @click="delCustomTool(t.id)">删除</el-button>
              </template>
            </GlassCard>
          </CardGrid>
        </CollapsibleCategory>
      </el-tab-pane>

      <!-- ===== Tab 3：MCP 服务 ===== -->
      <el-tab-pane label="MCP 服务" name="mcp" lazy>
        <McpPanel :key="focusServerId || 'mcp'" :focus-server-id="focusServerId" />
      </el-tab-pane>

      <!-- ===== Tab 4：远程工具商城 ===== -->
      <el-tab-pane label="远程工具商城" name="remote" lazy>
        <!-- 顶层：远程源列表 -->
        <div v-if="activeSourceId === null">
          <div class="tab-toolbar">
            <SearchToolbar v-model:query="searchRemoteSource" placeholder="搜索远程源名称或 URL…">
              <template #actions>
                <el-button type="primary" :icon="Plus" @click="showSourceForm = true" class="fab-add">新增远程商城</el-button>
              </template>
            </SearchToolbar>
          </div>

          <el-empty v-if="toolsStore.remoteSources.length === 0" description="暂无远程商城，点击右上角按钮添加其他节点" :image-size="80" />
          <el-empty v-else-if="filteredRemoteSources.length === 0" :description="emptyDesc(searchRemoteSource, '远程源')" :image-size="80" />
          <CardGrid v-else :min-card-width="260" :gap="14">
            <div
              v-for="s in filteredRemoteSources"
              :key="s.id"
              class="market-card"
              @click="enterRemoteMarket(s)"
            >
              <div class="market-card-icon"><el-icon :size="28"><Cloudy /></el-icon></div>
              <div class="market-card-body">
                <div class="market-card-title">
                  {{ s.name }}
                  <el-tag size="small" type="info" effect="plain">远程</el-tag>
                </div>
                <div class="market-card-desc" :title="s.base_url">{{ s.base_url }}</div>
              </div>
            </div>
          </CardGrid>
        </div>

        <!-- 钻入：远程源详情 -->
        <div v-else>
          <div class="sub-header">
            <el-button text size="small" @click="activeSourceId = null">
              <el-icon><ArrowLeft /></el-icon> 返回商城列表
            </el-button>
            <div class="sub-header-info">
              <h3 class="sub-title">{{ activeRemoteSource?.name }}</h3>
              <span class="sub-meta url">{{ activeRemoteSource?.base_url }}</span>
            </div>
            <div class="sub-header-actions">
              <el-button size="small" @click="testSource(activeSourceId)">测试连接</el-button>
              <el-button size="small" type="danger" @click="delSource(activeSourceId)">删除源</el-button>
            </div>
          </div>

          <div class="tab-toolbar tab-toolbar-inline">
            <SearchToolbar v-model:query="searchRemoteTool" placeholder="在该远程源里搜索工具…" :count="filteredRemoteTools.length" />
          </div>

          <el-empty v-if="!remoteToolsLoaded" description="正在加载远程工具..." :image-size="60" />
          <el-empty v-else-if="!remoteTools.length" description="该远程源暂无公开的自定义工具" :image-size="60" />
          <el-empty v-else-if="filteredRemoteTools.length === 0" :description="emptyDesc(searchRemoteTool, '工具')" :image-size="60" />
          <CardGrid v-else>
            <GlassCard
              v-for="item in filteredRemoteTools"
              :key="item.id"
              :title="item.name"
              :tooltip="'查看 ' + item.name + ' 的参数详情'"
              :description="item.description || '无描述'"
              @click="openSchemaDetail({ kind: '远程工具', name: item.name, description: item.description || '无描述', inputSchema: item.inputSchema, outputSchema: item.outputSchema })"
            >
              <template #badge>
                <el-tag size="small" type="primary" effect="plain">远程</el-tag>
              </template>
              <template #foot>
                <span class="stat hint">点击查看入参/出参</span>
              </template>
              <template #actions>
                <el-button size="small" type="primary" @click="installTool(item)">安装到本地</el-button>
              </template>
            </GlassCard>
          </CardGrid>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ========== 自定义工具 Dialog ========== -->
    <el-dialog
      v-model="showCustomEditor"
      :title="editingTool ? '编辑工具' : '新增自定义工具'"
      width="640px"
      :close-on-click-modal="false"
      @close="resetEditor"
    >
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="editor.name" placeholder="工具名称（英文）" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="editor.description" placeholder="给 LLM 看的描述" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="editor.category" placeholder="如：数据处理 / 自动化（默认「其他」）" /></el-form-item>
        <el-form-item label="入口函数"><el-input v-model="editor.entry" placeholder="Node: 函数名；Python: 函数名（从 YZ_PY_ARGS 读入参）" /></el-form-item>
        <el-form-item label="运行环境">
          <el-select v-model="editor.runtime" size="default" style="width: 100%">
            <el-option label="Node.js（默认，沙箱 vm 执行）" value="node" />
            <el-option label="Python（内置打包解释器，离线可用）" value="python" />
          </el-select>
        </el-form-item>
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
        <el-form-item :label="editor.runtime === 'python' ? 'Python 代码' : 'JS 代码'">
          <el-input
            v-model="editor.code"
            type="textarea"
            :rows="10"
            class="code-input"
            :placeholder="editor.runtime === 'python'
              ? 'def my_tool_handler(args):\n    import os, json\n    args = json.loads(os.environ[\'YZ_PY_ARGS\'])  # base64(JSON)\n    print(json.dumps({\'result\': args.get(\'key\')}))'
              : 'function myToolHandler(args) { return args.key + \' result\'; }'"
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

    <!-- ========== 试运行 Dialog（自定义工具走 /tools/:id/execute，内置工具走 /tools/builtin/execute） ========== -->
    <!-- 与 schema 详情弹窗同理：文本密集，皮肤下需要实底衬底保证可读（见 skin.css .tm-solid-dialog） -->
    <el-dialog
      v-model="showRunner"
      :title="`试运行：${runningToolName}`"
      width="560px"
      :close-on-click-modal="false"
      append-to-body
      class="tm-solid-dialog"
      @close="resetRunner"
    >
      <div v-if="runningTool" class="runner-entry">入口函数：{{ runningTool.entry }}</div>
      <el-input
        v-model="runnerArgsText"
        type="textarea"
        :rows="6"
        class="code-input"
        placeholder='入参 JSON，如 {"key": "value"}；留空 = {}'
      />
      <div v-if="runnerError" class="runner-block runner-error">
        <span class="schema-label">错误</span>
        <pre class="schema-pre">{{ runnerError }}</pre>
      </div>
      <div v-if="runnerResult !== null" class="runner-block">
        <span class="schema-label">结果</span>
        <pre class="schema-pre">{{ runnerResult }}</pre>
      </div>
      <template #footer>
        <el-button @click="showRunner = false">关闭</el-button>
        <el-button type="primary" :loading="running" @click="runTool">运行</el-button>
      </template>
    </el-dialog>

    <!-- ========== 远程商城源 Dialog ========== -->
    <el-dialog v-model="showSourceForm" title="添加远程工具商城" width="480px" :close-on-click-modal="false" @close="resetSourceForm">
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

    <!-- ========== 工具参数详情 Dialog（点击卡片打开）==========
       【2026-09-13 用户反馈"点击卡片查看入参出参必要…做成卡片内打开一个弹窗那种，不要在当前卡片打开"】
       原先是在卡片内部行内展开 .tool-schema-block —— 会把该卡片撑到数百像素高，
       同行的其他卡片被 grid stretch 一起拉高、留出大片空白（"卡片这么怪异"的根因）。
       现改为：卡片只展示摘要，点击整张卡片 → 弹窗里看完整入参/出参（长 JSON 有独立滚动区，
       不再挤压卡片布局）。 -->
    <el-dialog
      v-model="showSchemaDetail"
      :title="schemaDetail ? `${schemaDetail.name}` : '参数详情'"
      width="720px"
      top="6vh"
      append-to-body
      class="tm-solid-dialog schema-detail-dialog"
    >
      <div v-if="schemaDetail" class="schema-detail">
        <div class="schema-detail-head">
          <el-tag size="small" type="info" effect="plain">{{ schemaDetail.kind }}</el-tag>
          <span v-if="schemaDetail.meta" class="stat">{{ schemaDetail.meta }}</span>
          <span v-if="schemaDetail.isPublic" class="stat">已公开</span>
        </div>
        <p class="schema-detail-desc">{{ schemaDetail.description }}</p>
        <SchemaViewer
          :sections="[
            { label: '入参', text: fmtSchema(schemaDetail.inputSchema) },
            { label: '出参', text: fmtSchema(schemaDetail.outputSchema) },
          ]"
        />
      </div>
      <template #footer>
        <el-button @click="showSchemaDetail = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  Plus, ArrowLeft, Cloudy,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores';
import { useToolsStore, type CustomToolItem, type BuiltinToolItem } from '../stores/tools';
import McpPanel from '../components/McpPanel.vue';
import SearchToolbar from '../components/common/SearchToolbar.vue';
import GlassCard from '../components/common/GlassCard.vue';
import CardGrid from '../components/common/CardGrid.vue';
import CollapsibleCategory from '../components/common/CollapsibleCategory.vue';
import SchemaViewer from '../components/common/SchemaViewer.vue';

// ---- Tab 切换（支持 /mcp 重定向带来的 ?tab=mcp&focus=<id> 深链） ----
const toolsStore = useToolsStore();
const authStore = useAuthStore();
const route = useRoute();

const activeTab = ref<'builtin' | 'custom' | 'mcp' | 'remote'>('builtin');
const focusServerId = ref<string | undefined>(undefined);

// ---- 分类折叠 ----
const builtinCollapsed = reactive<Record<string, boolean>>({});
const customCollapsed = reactive<Record<string, boolean>>({});
function toggleBuiltinCat(key: string) { builtinCollapsed[key] = !builtinCollapsed[key]; }
function toggleCustomCat(cat: string) { customCollapsed[cat] = !customCollapsed[cat]; }

onMounted(() => {
  const tab = route.query.tab;
  if (tab === 'mcp') activeTab.value = 'mcp';
  else if (tab === 'remote') activeTab.value = 'remote';
  else if (tab === 'custom') activeTab.value = 'custom';
  const focus = route.query.focus;
  if (typeof focus === 'string' && focus) focusServerId.value = focus;

  toolsStore.loadBuiltinTools();
  toolsStore.loadCustomTools();
  toolsStore.loadRemoteSources();
});

// ---- 搜索过滤：内置工具 ----
const searchBuiltin = ref('');
const matchesSearch = (query: string, name: string, desc?: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || (desc || '').toLowerCase().includes(q);
};

const builtinFilteredAll = computed(() =>
  toolsStore.builtinTools.filter((t) => matchesSearch(searchBuiltin.value, t.name, t.description))
);

/** 分类下拉筛选：'all' = 全部，否则只留选中的那一类 */
const builtinCatFilter = ref<string>('all');

/**
 * 分类区块渲染数据：先按下拉筛掉整组，再按搜索词筛组内工具，最后丢掉空组。
 * 分类名在区块左上角展示，卡片全部铺开、不再折叠。
 */
const builtinGroupsFiltered = computed(() => {
  const q = searchBuiltin.value;
  const cat = builtinCatFilter.value;
  return toolsStore.builtinToolGroups
    .filter((g) => cat === 'all' || g.key === cat)
    .map((g) => ({
      key: g.key,
      label: g.label,
      tools: g.tools.filter((t) => matchesSearch(q, t.name, t.description)),
    }))
    .filter((g) => g.tools.length > 0);
});

// ---- 搜索过滤 + 分类：自定义工具 ----
const searchCustom = ref('');
const customCatFilter = ref('all');

/** 按 category 分组（缺失归入「其他」），分类顺序保持稳定 */
const customGrouped = computed(() => {
  const map = new Map<string, CustomToolItem[]>();
  for (const t of toolsStore.customTools) {
    const cat = t.category || '其他';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  }
  return Array.from(map.entries()).map(([category, tools]) => ({ category, tools }));
});

/** 分类下拉选项（含数量） */
const customCatOptions = computed(() =>
  customGrouped.value.map((g) => ({ key: g.category, label: `${g.category}（${g.tools.length}）` }))
);

/** 渲染数据：先按分类下拉筛整组，再按搜索词筛组内工具，最后丢空组 */
const customGroupsFiltered = computed(() => {
  const q = searchCustom.value;
  const cat = customCatFilter.value;
  return customGrouped.value
    .filter((g) => cat === 'all' || g.category === cat)
    .map((g) => ({
      category: g.category,
      tools: g.tools.filter((t) => matchesSearch(q, t.name, t.description || '')),
    }))
    .filter((g) => g.tools.length > 0);
});

// ---- 远程源钻入 ----
const activeSourceId = ref<string | null>(null);
const activeRemoteSource = computed(() =>
  toolsStore.remoteSources.find((s) => s.id === activeSourceId.value)
);

const remoteTools = ref<any[]>([]);
const remoteToolsLoaded = ref(false);

const searchRemoteSource = ref('');
const filteredRemoteSources = computed(() =>
  toolsStore.remoteSources.filter((s) =>
    matchesSearch(searchRemoteSource.value, s.name, s.base_url)
  )
);

const searchRemoteTool = ref('');
const filteredRemoteTools = computed(() =>
  remoteTools.value.filter((t: any) =>
    matchesSearch(searchRemoteTool.value, t.name || '', t.description || '')
  )
);

function enterRemoteMarket(s: any) {
  activeSourceId.value = s.id;
  remoteToolsLoaded.value = false;
  remoteTools.value = [];
  searchRemoteTool.value = '';
  toolsStore.fetchRemoteItems(s.id).then(() => {
    remoteTools.value = toolsStore.remoteItems[s.id] || [];
    remoteToolsLoaded.value = true;
  });
}

// ---- 入参/出参：点击卡片 → 弹窗展示（不再在卡内行内展开）----
interface SchemaDetail {
  kind: string;
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  meta?: string;
  isPublic?: boolean;
}
const showSchemaDetail = ref(false);
const schemaDetail = ref<SchemaDetail | null>(null);
function openSchemaDetail(d: SchemaDetail) {
  schemaDetail.value = d;
  showSchemaDetail.value = true;
}
function fmtSchema(schema: unknown): string {
  if (!schema || (typeof schema === 'object' && Object.keys(schema as object).length === 0)) return '（无）';
  try { return JSON.stringify(schema, null, 2); } catch { return String(schema); }
}
/** 搜索无结果时 el-empty 的描述（模板里嵌字符串引号容易踩 parser，统一抽出） */
function emptyDesc(query: string, kind: string): string {
  return `没有匹配 “${query}” 的${kind}`;
}

// ---- 自定义工具编辑器 ----
const showCustomEditor = ref(false);
const editingTool = ref<any>(null);
const savingCustom = ref(false);
const editor = ref({
  name: '', description: '', category: '其他', entry: '', runtime: 'node',
  schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false,
});

function openEditor(t: any | null) {
  if (t) {
    editingTool.value = t;
    editor.value = {
      name: t.name, description: t.description || '', category: t.category || '其他',
      entry: t.entry, schemaText: JSON.stringify(t.inputSchema, null, 2),
      outputSchemaText: t.outputSchema ? JSON.stringify(t.outputSchema, null, 2) : '',
      code: t.code, timeout: t.timeout, isPublic: t.isPublic, runtime: t.runtime || 'node',
    };
  } else {
    editingTool.value = null;
    editor.value = { name: '', description: '', category: '其他', entry: '', runtime: 'node', schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false };
  }
  showCustomEditor.value = true;
}

function resetEditor() {
  editor.value = { name: '', description: '', category: '其他', entry: '', runtime: 'node', schemaText: '{}', outputSchemaText: '', code: '', timeout: 30000, isPublic: false };
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
        code: editor.value.code, entry: editor.value.entry, runtime: editor.value.runtime || 'node',
        inputSchema: schema, outputSchema, timeout: editor.value.timeout, isPublic: editor.value.isPublic,
        category: editor.value.category || '其他',
      });
    } else {
      await toolsStore.createTool({
        name: editor.value.name, description: editor.value.description,
        category: editor.value.category || '其他',
        entry: editor.value.entry, inputSchema: schema, outputSchema, runtime: editor.value.runtime || 'node',
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
    await ElMessageBox.confirm('删除该自定义工具？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
    await toolsStore.deleteTool(id);
    ElMessage.success('已删除');
  } catch {}
}

// ---- 试运行（自定义工具：POST /api/tools/:id/execute；内置工具：POST /api/tools/builtin/execute） ----
const showRunner = ref(false);
const runningTool = ref<CustomToolItem | null>(null);
const runningBuiltin = ref<BuiltinToolItem | null>(null);
const runnerArgsText = ref('');
const runnerResult = ref<string | null>(null);
const runnerError = ref('');
const running = ref(false);

const runningToolName = computed(() => runningTool.value?.name || runningBuiltin.value?.name || '');

/** 从 inputSchema.properties 生成默认参数模板（string→""，number→0，boolean→false，array/object→空结构） */
function defaultArgsFromSchema(schema: Record<string, unknown> | undefined): string {
  const props = (schema?.properties || {}) as Record<string, any>;
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(props)) {
    const type = Array.isArray(p.type) ? p.type[0] : p.type;
    if (type === 'number' || type === 'integer') out[k] = 0;
    else if (type === 'boolean') out[k] = false;
    else if (type === 'array') out[k] = [];
    else if (type === 'object') out[k] = {};
    else out[k] = '';
  }
  return JSON.stringify(out, null, 2);
}

function openRunner(t: CustomToolItem) {
  runningTool.value = t;
  runningBuiltin.value = null;
  runnerArgsText.value = defaultArgsFromSchema(t.inputSchema);
  runnerResult.value = null;
  runnerError.value = '';
  showRunner.value = true;
}

/** 打开内置工具测试（入参同样从 inputSchema 生成默认模板，可自行改参后运行） */
function openBuiltinRunner(t: BuiltinToolItem) {
  runningBuiltin.value = t;
  runningTool.value = null;
  runnerArgsText.value = defaultArgsFromSchema(t.inputSchema);
  runnerResult.value = null;
  runnerError.value = '';
  showRunner.value = true;
}

function resetRunner() {
  runningTool.value = null;
  runningBuiltin.value = null;
  runnerArgsText.value = '';
  runnerResult.value = null;
  runnerError.value = '';
}

/** 内置工具返回 McpCallResult（{ content: [{type,text}], isError }），优先拼接纯文本展示 */
function builtinResultText(r: unknown): string {
  const anyR = r as any;
  if (anyR && Array.isArray(anyR.content)) {
    return anyR.content
      .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(r, null, 2);
}

async function runTool() {
  if (runningBuiltin.value) {
    let args: Record<string, unknown> = {};
    const text = runnerArgsText.value.trim();
    if (text) {
      try { args = JSON.parse(text); } catch { runnerError.value = '入参 JSON 格式错误'; runnerResult.value = null; return; }
    }
    running.value = true;
    runnerError.value = '';
    runnerResult.value = null;
    try {
      const r = await toolsStore.executeBuiltinTool(runningBuiltin.value.name, args);
      const out = builtinResultText(r);
      if (r && (r as any).isError) runnerError.value = out || '工具返回 isError=true';
      else runnerResult.value = out;
    } catch (e: unknown) {
      runnerError.value = e instanceof Error ? e.message : String(e);
    } finally { running.value = false; }
    return;
  }
  if (!runningTool.value) return;
  let args: Record<string, unknown> = {};
  const text = runnerArgsText.value.trim();
  if (text) {
    try { args = JSON.parse(text); } catch { runnerError.value = '入参 JSON 格式错误'; runnerResult.value = null; return; }
  }
  running.value = true;
  runnerError.value = '';
  runnerResult.value = null;
  try {
    const r = await toolsStore.executeTool(runningTool.value.id, args);
    runnerResult.value = JSON.stringify(r, null, 2);
  } catch (e: unknown) {
    runnerError.value = e instanceof Error ? e.message : String(e);
  } finally { running.value = false; }
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
    await ElMessageBox.confirm('删除该远程源？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
    await toolsStore.deleteRemoteSource(id);
    activeSourceId.value = null;
    ElMessage.success('已删除');
  } catch {}
}

async function installTool(item: any) {
  try {
    await toolsStore.installFromMarket(activeSourceId.value!, item.id);
    ElMessage.success(`已安装 "${item.name}" 到本地商城`);
  } catch { ElMessage.error('安装失败'); }
}
</script>

<style scoped>
/* ---- 页面 ---- */
/* .page / .page-title / .page-sub come from App.vue global */
.page-top { margin-bottom: 20px; }

/* ---- Tab ---- */
.tl-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

/* ---- tab 顶部工具栏（左搜索 / 右操作：搜索框与 actions 均由 SearchToolbar 提供） ---- */
.tab-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 16px;
}
.tab-toolbar-inline { margin-bottom: 14px; }
/* 分类筛选下拉宽度由 .yz-cat-select 统一给定（styles/surface.css） */

/* ---- 分区 ---- */
.section { margin-bottom: 32px; }

.subsection-title {
  margin: 0 0 12px; font-size: 13px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

/* ---- 商城源卡片（远程源列表）---- */
.market-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px; border: 1px solid var(--glass-border);
  border-radius: var(--radius-md); background: var(--glass-bg);
  backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
  cursor: pointer; transition: all 0.2s;
  align-self: start;
}
.market-card:hover {
  transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.06);
  border-color: var(--glass-border-strong);
}
.market-card-icon {
  width: 44px; height: 44px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; background: rgba(99,102,241,0.08); color: var(--color-primary);
}
.market-card-body { flex: 1; min-width: 0; }
.market-card-title {
  font-size: 14px; font-weight: 600; color: var(--color-text);
  display: flex; align-items: center; gap: 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.market-card-desc {
  font-size: 12px; color: var(--color-text-secondary); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---- 子视图（远程源详情返回头）---- */
.sub-header {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 16px; padding-bottom: 16px;
  border-bottom: 1px solid var(--glass-border);
}
.sub-header-info { flex: 1; }
.sub-title { margin: 0; font-size: 18px; font-weight: 700; }
.sub-meta { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; display: block; }
.sub-meta.url { font-family: monospace; }
.sub-header-actions { display: flex; gap: 8px; }

/* 入参/出参：点击卡片 → 弹窗展示（卡内不再有 schema 块）。
   卡片底部的弱化提示（.hint）由 GlassCard 内置 hover 点亮。 */

.schema-detail-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.schema-detail-desc {
  margin: 0 0 14px; font-size: 13px; line-height: 1.6;
  color: var(--color-text-secondary); word-break: break-word;
}
/* 弹窗内入参/出参由 SchemaViewer 渲染；以下仅保留试运行块还在用的 schema 文本样式 */
.schema-label {
  font-size: 11px; font-weight: 600; color: var(--color-text);
  text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;
}
/* 试运行结果/错误独立滚动 */
.schema-pre {
  margin: 0; padding: 10px 12px; border-radius: 6px;
  background: rgba(0, 0, 0, 0.04); color: var(--color-text);
  font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px;
  line-height: 1.55; max-height: 32vh; overflow: auto; white-space: pre-wrap; word-break: break-word;
}
/* 暗色主题下的默认底衬。
   ⚠️ 必须 :not([data-skin="on"])：` :root[data-theme="dark"] .schema-pre` 特指度 (0,2,0)
   会盖掉 skin.css 的 [data-skin="on"] .schema-pre (0,1,0)，且组件样式后加载 →
   皮肤下 pre 会回落到仅 6% 白的近乎透明底，压在壁纸弹窗图上 = 文字不可读。 */
:root[data-theme="dark"]:not([data-skin="on"]) .schema-pre { background: rgba(255, 255, 255, 0.06); }

.stat { font-size: 12px; color: var(--color-text-secondary); }

.code-input textarea { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 13px; }

/* ---- 试运行 ---- */
.runner-entry { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 10px; }
.runner-entry code, .runner-entry { font-family: inherit; }
.runner-block { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.runner-error .schema-pre { color: #d84a3a; }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .page-top { margin-bottom: 14px; }
  .page-title { font-size: 18px; }
  .tab-toolbar { flex-wrap: wrap; }
  .sub-header { flex-wrap: wrap; gap: 10px; padding-bottom: 12px; }
  .sub-header-info { width: 100%; }
  .sub-header-actions { width: 100%; justify-content: flex-end; }
  .sub-title { font-size: 16px; }
  /* tab 条 5 项在窄屏溢出：Element 默认只在 hover 出箭头，触屏够不着 → nav-scroll 自己横向滚动。
     注意不要动 nav-wrap 的 overflow（它是 nav-scroll 的宽度约束来源，改成 visible 会照旧撑破）。 */
  .tl-tabs :deep(.el-tabs__nav-scroll) {
    overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tl-tabs :deep(.el-tabs__nav-scroll::-webkit-scrollbar) { display: none; }
  .tl-tabs :deep(.el-tabs__nav-prev),
  .tl-tabs :deep(.el-tabs__nav-next) { display: none; }
  .tl-tabs :deep(.el-tabs__item) { white-space: nowrap; }
  /* 参数详情弹窗：窄屏占满宽度，schema 高度收紧（弹窗内为 SchemaViewer） */
  .schema-detail :deep(.sv-pre) { max-height: 26vh; font-size: 11px; }
}
/* 弹窗挂在 body 下（append-to-body），scoped 命中不到 → 用 :global 提宽度 */
:global(.tm-solid-dialog .el-dialog__body) { padding-top: 8px; }
@media (max-width: 767px) {
  :global(.tm-solid-dialog) { width: 94vw !important; }
}
</style>
