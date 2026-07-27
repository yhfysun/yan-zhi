<template>
  <div class="canvas-page">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <el-button :icon="ArrowLeft" text @click="$router.push('/agents')">返回</el-button>
        <el-divider direction="vertical" />
        <el-input v-model="agent.name" class="title-input" size="small" @input="markDirty" />
      </div>
      <div class="toolbar-right">
        <el-tag v-if="dirty" size="small" type="warning">未保存</el-tag>
        <el-button :icon="Document" size="small" @click="save">保存</el-button>
        <el-button type="primary" :icon="CaretRight" size="small" :loading="store.running" @click="run">运行</el-button>
      </div>
    </header>

    <div class="canvas-body">
      <!-- 左侧节点库 -->
      <aside class="palette">
        <div class="palette-title">节点库</div>
        <div
          v-for="g in nodePalette"
          :key="g.type"
          class="palette-item"
          draggable="true"
          @dragstart="onDragStart($event, g.type)"
          @click="addNode(g.type)"
        >
          <div class="palette-icon" :style="{ background: g.color }"><component :is="g.icon" /></div>
          <div class="palette-text">
            <div class="palette-name">{{ g.name }}</div>
            <div class="palette-desc">{{ g.desc }}</div>
          </div>
        </div>
        <div class="palette-tip">点击或拖拽到画布添加</div>
      </aside>

      <!-- 中间画布 -->
      <main class="flow-wrap" @drop="onDrop" @dragover.prevent>
        <VueFlow
          v-model:nodes="vfNodes"
          v-model:edges="vfEdges"
          :node-types="nodeTypes"
          :default-viewport="{ x: 0, y: 0, zoom: 0.9 }"
          fit-view-on-init
          @nodes-change="markDirty"
          @edges-change="markDirty"
          @node-click="onNodeClick"
          @pane-click="selectedNodeId = ''"
        >
          <template #background>
            <div class="grid-bg" />
          </template>
        </VueFlow>
        <!-- 自定义缩放控件 -->
        <div class="flow-controls">
          <el-button size="small" circle @click="zoomIn">+</el-button>
          <el-button size="small" circle @click="zoomOut">−</el-button>
          <el-button size="small" circle @click="fitView">⤢</el-button>
        </div>
      </main>

      <!-- 右侧属性面板 -->
      <aside class="inspector">
        <div class="inspector-title">{{ selectedNode ? '节点属性' : '智能体设置' }}</div>
        <div v-if="!selectedNode" class="inspector-empty">
          <el-form label-position="top" size="small">
            <el-form-item label="描述">
              <el-input v-model="agent.description" type="textarea" :rows="3" @input="markDirty" />
            </el-form-item>
            <el-form-item label="运行入参（JSON）">
              <el-input v-model="inputsText" type="textarea" :rows="4" placeholder='{"topic":"hello"}' />
            </el-form-item>
            <el-alert type="info" :closable="false" show-icon>
              选中节点可编辑其配置；点击空白处回到智能体设置
            </el-alert>
          </el-form>
        </div>
        <div v-else class="inspector-form">
          <el-form label-position="top" size="small">
            <el-form-item label="节点 ID">
              <el-input :model-value="selectedNode.id" disabled />
            </el-form-item>

            <!-- LLM 节点 -->
            <template v-if="selectedNode.type === 'llm'">
              <el-form-item label="平台">
                <el-select v-model="cfg.platformId" placeholder="选择平台" @change="onPlatformChange">
                  <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="模型">
                <el-select v-model="cfg.modelId" placeholder="选择模型">
                  <el-option v-for="m in filteredModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="系统提示词">
                <el-input v-model="cfg.systemPrompt" type="textarea" :rows="4" />
              </el-form-item>
              <el-form-item label="temperature">
                <el-slider v-model="cfg.temperature" :min="0" :max="2" :step="0.1" show-input />
              </el-form-item>
              <el-form-item label="maxTokens">
                <el-input-number v-model="cfg.maxTokens" :min="1" :max="32768" />
              </el-form-item>
            </template>

            <!-- Tool 节点 -->
            <template v-else-if="selectedNode.type === 'tool'">
              <el-form-item label="MCP 服务">
                <el-select v-model="cfg.mcpServerId" placeholder="选择服务" @change="onServerChange">
                  <el-option v-for="s in mcpServers" :key="s.id" :label="s.name" :value="s.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="工具">
                <el-select v-model="cfg.toolName" placeholder="选择工具">
                  <el-option v-for="t in filteredTools" :key="t.name" :label="t.name" :value="t.name" />
                </el-select>
              </el-form-item>
              <el-form-item label="参数（JSON，{} 表示用上游输入）">
                <el-input v-model="cfg.argumentsText" type="textarea" :rows="4" placeholder='{}' />
              </el-form-item>
            </template>

            <!-- Input 节点 -->
            <template v-else-if="selectedNode.type === 'input'">
              <el-form-item label="输入字段（JSON Schema，可空）">
                <el-input v-model="cfg.schemaText" type="textarea" :rows="6" placeholder='{"type":"object","properties":{}}' />
              </el-form-item>
            </template>

            <!-- Output 节点 -->
            <template v-else-if="selectedNode.type === 'output'">
              <el-form-item label="输出键名">
                <el-input v-model="cfg.key" placeholder="result" />
              </el-form-item>
            </template>

            <!-- Code 节点 -->
            <template v-else-if="selectedNode.type === 'code'">
              <el-form-item label="表达式（ctx 为运行上下文）">
                <el-input v-model="cfg.expression" type="textarea" :rows="8" placeholder='return ctx.inputs.topic;' />
              </el-form-item>
              <el-alert type="warning" :closable="false" show-icon>
                代码节点用 new Function 执行，请勿运行不受信任的表达式
              </el-alert>
            </template>

            <!-- Condition 节点 -->
            <template v-else-if="selectedNode.type === 'condition'">
              <el-form-item label="条件表达式（返回 truthy/falsy）">
                <el-input v-model="cfg.expression" type="textarea" :rows="4" placeholder='return ctx.inputs.score > 0.5;' />
              </el-form-item>
              <el-alert type="info" :closable="false" show-icon>
                条件节点输出两条分支：true → sourceHandle=true，false → sourceHandle=false。连线时选择对应出口。
              </el-alert>
            </template>

            <!-- Loop 节点 -->
            <template v-else-if="selectedNode.type === 'loop'">
              <el-form-item label="最大迭代次数">
                <el-input-number v-model="cfg.maxIterations" :min="1" :max="100" />
              </el-form-item>
              <el-form-item label="迭代变量名">
                <el-input v-model="cfg.iterateKey" placeholder="item" />
              </el-form-item>
              <el-form-item label="循环体表达式（ctx.item / ctx.index 可用）">
                <el-input v-model="cfg.bodyExpr" type="textarea" :rows="6" placeholder='return ctx.item.toUpperCase();' />
              </el-form-item>
              <el-alert type="info" :closable="false" show-icon>
                上游输出需为数组；输出为每次迭代结果的数组
              </el-alert>
            </template>

            <!-- SubAgent 节点 -->
            <template v-else-if="selectedNode.type === 'sub_agent'">
              <el-form-item label="子智能体">
                <el-select v-model="cfg.subAgentId" placeholder="选择智能体" filterable>
                  <el-option
                    v-for="a in subAgents"
                    :key="a.id"
                    :label="a.name"
                    :value="a.id"
                    :disabled="a.id === agentId"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="入参映射（JSON，支持 ${ctx.xxx}）">
                <el-input v-model="cfg.inputsMappingText" type="textarea" :rows="6" placeholder='{"topic":"${ctx.inputs.topic}"}' />
              </el-form-item>
              <el-alert type="warning" :closable="false" show-icon>
                被调用的智能体须允许作为子智能体；避免循环调用
              </el-alert>
            </template>

            <!-- MemoryRead 节点 -->
            <template v-else-if="selectedNode.type === 'memory_read'">
              <el-form-item label="智能体 ID（可空）">
                <el-select v-model="cfg.agentId" placeholder="留空查全部" clearable filterable>
                  <el-option v-for="a in subAgents" :key="a.id" :label="a.name" :value="a.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="查询关键词（可空）">
                <el-input v-model="cfg.query" placeholder="如：用户偏好" />
              </el-form-item>
              <el-form-item label="topK">
                <el-input-number v-model="cfg.topK" :min="1" :max="20" />
              </el-form-item>
            </template>

            <!-- MemoryWrite 节点 -->
            <template v-else-if="selectedNode.type === 'memory_write'">
              <el-form-item label="归属智能体（可空）">
                <el-select v-model="cfg.agentId" placeholder="留空不归属" clearable filterable>
                  <el-option v-for="a in subAgents" :key="a.id" :label="a.name" :value="a.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="内容来源字段">
                <el-input v-model="cfg.contentKey" placeholder="content" />
              </el-form-item>
              <el-form-item label="标签（逗号分隔）">
                <el-input v-model="cfg.tagsText" placeholder="用户,偏好" />
              </el-form-item>
              <el-alert type="info" :closable="false" show-icon>
                上游输出为字符串则直接写入；为对象则取 contentKey 字段
              </el-alert>
            </template>

            <el-form-item>
              <el-button type="danger" plain :icon="Delete" size="small" @click="removeSelected">删除节点</el-button>
            </el-form-item>
          </el-form>
        </div>
      </aside>
    </div>

    <!-- 运行结果对话框 -->
    <el-dialog v-model="showRunResult" title="运行结果" width="640px" top="6vh">
      <div v-if="store.runLogs.length" class="run-logs">
        <div v-for="(log, i) in store.runLogs" :key="i" class="run-log-item" :class="log.status">
          <span class="log-time">{{ new Date(log.time).toLocaleTimeString() }}</span>
          <el-tag size="small" :type="log.status === 'ok' ? 'success' : log.status === 'error' ? 'danger' : 'info'">
            {{ log.status }}
          </el-tag>
          <span class="log-msg">{{ log.nodeId === '__end__' ? '完成' : `节点 ${log.nodeId}` }}</span>
          <span v-if="log.msg" class="log-err">{{ log.msg }}</span>
        </div>
      </div>
      <el-divider />
      <div v-if="runOutput" class="run-output">
        <div class="run-output-title">最终输出</div>
        <pre>{{ typeof runOutput === 'string' ? runOutput : JSON.stringify(runOutput, null, 2) }}</pre>
      </div>
      <el-empty v-else description="无输出" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, markRaw, h, defineComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueFlow, useVueFlow, type Node, type Edge } from '@vue-flow/core';
import { ArrowLeft, Document, CaretRight, Delete, ChatDotRound, Tools, Upload, Download, Lightning, Switch, Refresh, Avatar, Reading, Memo } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAgentStore } from '../stores/agent';
import { usePlatformStore } from '../stores/platform';
import { useMcpStore } from '../stores/mcp';
import { getPlatformAdapter } from '@ai-assistant/core';
import type { NodeType, WorkflowNode } from '@ai-assistant/shared';

const route = useRoute();
const router = useRouter();
const store = useAgentStore();
const platformStore = usePlatformStore();
const mcpStore = useMcpStore();

const agentId = computed(() => route.params.id as string);

const agent = reactive<{ name: string; description: string }>({ name: '', description: '' });
const inputsText = ref('{}');
const dirty = ref(false);
const selectedNodeId = ref('');

const platforms = computed(() => platformStore.platforms);
const mcpServers = computed(() => mcpStore.servers);
/** 子智能体候选列表（排除当前智能体本身） */
const subAgents = computed(() => store.agents.filter((a) => a.id !== agentId.value));
const filteredModels = computed(() => {
  if (!cfg.platformId) return platformStore.models;
  return platformStore.models.filter((m) => m.platformId === cfg.platformId);
});
const filteredTools = computed(() => {
  if (!cfg.mcpServerId) return [];
  return (mcpStore.tools as Record<string, any[]>)[cfg.mcpServerId as string] || [];
});

// 节点配置 reactive
const cfg = reactive<Record<string, any>>({});

const vfNodes = ref<Node[]>([]);
const vfEdges = ref<Edge[]>([]);

const nodePalette = [
  { type: 'input' as NodeType, name: '输入', desc: '接收运行时入参', icon: markRaw(Upload), color: '#10B981' },
  { type: 'llm' as NodeType, name: 'LLM', desc: '调用大模型生成', icon: markRaw(ChatDotRound), color: '#6366F1' },
  { type: 'tool' as NodeType, name: '工具', desc: '调用 MCP 工具', icon: markRaw(Tools), color: '#F59E0B' },
  { type: 'code' as NodeType, name: '代码', desc: '执行 JS 表达式', icon: markRaw(Lightning), color: '#8B5CF6' },
  { type: 'condition' as NodeType, name: '条件分支', desc: '根据表达式结果路由', icon: markRaw(Switch), color: '#0EA5E9' },
  { type: 'loop' as NodeType, name: '循环', desc: '对数组迭代执行', icon: markRaw(Refresh), color: '#F97316' },
  { type: 'sub_agent' as NodeType, name: '子智能体', desc: '调用其他智能体', icon: markRaw(Avatar), color: '#EC4899' },
  { type: 'memory_read' as NodeType, name: '记忆读取', desc: '查询记忆库', icon: markRaw(Reading), color: '#14B8A6' },
  { type: 'memory_write' as NodeType, name: '记忆写入', desc: '持久化到记忆库', icon: markRaw(Memo), color: '#A855F7' },
  { type: 'output' as NodeType, name: '输出', desc: '收集最终结果', icon: markRaw(Download), color: '#EF4444' },
];

// 自定义节点渲染组件
function makeNodeComponent(type: string, color: string, Icon: any) {
  return markRaw(
    defineComponent({
      name: `Node-${type}`,
      props: ['id', 'data', 'selected'],
      setup(props: any) {
        return () =>
          h(
            'div',
            {
              class: ['custom-node', `custom-node-${type}`, { selected: props.selected }],
              style: { '--node-color': color },
            },
            [
              h('div', { class: 'custom-node-head' }, [
                h(Icon, { class: 'custom-node-icon' }),
                h('span', { class: 'custom-node-type' }, type.toUpperCase()),
              ]),
              h('div', { class: 'custom-node-body' }, props.data?.label || '未配置'),
            ],
          );
      },
    }),
  );
}

const nodeTypes = {
  llm: makeNodeComponent('llm', '#6366F1', ChatDotRound),
  tool: makeNodeComponent('tool', '#F59E0B', Tools),
  input: makeNodeComponent('input', '#10B981', Upload),
  output: makeNodeComponent('output', '#EF4444', Download),
  code: makeNodeComponent('code', '#8B5CF6', Lightning),
  condition: makeNodeComponent('condition', '#0EA5E9', Switch),
  loop: makeNodeComponent('loop', '#F97316', Refresh),
  sub_agent: makeNodeComponent('sub_agent', '#EC4899', Avatar),
  memory_read: makeNodeComponent('memory_read', '#14B8A6', Reading),
  memory_write: makeNodeComponent('memory_write', '#A855F7', Memo),
};

const { zoomIn, zoomOut, fitView } = useVueFlow();

function markDirty() {
  dirty.value = true;
}

function onNodeClick({ node }: { node: Node }) {
  selectedNodeId.value = node.id;
  syncCfgFromNode();
}

function syncCfgFromNode() {
  const n = vfNodes.value.find((x) => x.id === selectedNodeId.value);
  if (!n) return;
  Object.keys(cfg).forEach((k) => delete cfg[k]);
  const c = n.data?.config || {};
  Object.assign(cfg, JSON.parse(JSON.stringify(c)));
  if (n.type === 'tool' && typeof cfg.arguments === 'object') {
    cfg.argumentsText = JSON.stringify(cfg.arguments || {}, null, 2);
  }
  if (n.type === 'input' && typeof cfg.schema === 'object') {
    cfg.schemaText = JSON.stringify(cfg.schema || {}, null, 2);
  }
  if (n.type === 'sub_agent' && typeof cfg.inputsMapping === 'object') {
    cfg.inputsMappingText = JSON.stringify(cfg.inputsMapping || {}, null, 2);
  }
  if (n.type === 'memory_write' && Array.isArray(cfg.tags)) {
    cfg.tagsText = cfg.tags.join(',');
  }
}

const selectedNode = computed(() => vfNodes.value.find((n) => n.id === selectedNodeId.value));

watch(
  cfg,
  () => {
    if (!selectedNodeId.value) return;
    const idx = vfNodes.value.findIndex((n) => n.id === selectedNodeId.value);
    if (idx < 0) return;
    const n = vfNodes.value[idx];
    const newCfg = JSON.parse(JSON.stringify(cfg));
    if (n.type === 'tool' && newCfg.argumentsText !== undefined) {
      try {
        newCfg.arguments = JSON.parse(newCfg.argumentsText || '{}');
      } catch {}
      delete newCfg.argumentsText;
    }
    if (n.type === 'input' && newCfg.schemaText !== undefined) {
      try {
        newCfg.schema = JSON.parse(newCfg.schemaText || '{}');
      } catch {}
      delete newCfg.schemaText;
    }
    if (n.type === 'sub_agent' && newCfg.inputsMappingText !== undefined) {
      try {
        newCfg.inputsMapping = JSON.parse(newCfg.inputsMappingText || '{}');
      } catch {}
      delete newCfg.inputsMappingText;
    }
    if (n.type === 'memory_write' && newCfg.tagsText !== undefined) {
      newCfg.tags = String(newCfg.tagsText)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      delete newCfg.tagsText;
    }
    vfNodes.value[idx] = {
      ...n,
      data: { ...n.data, config: newCfg, label: labelFor(n.type as NodeType, newCfg) },
    };
    markDirty();
  },
  { deep: true },
);

function labelFor(type: NodeType, c: Record<string, any>): string {
  switch (type) {
    case 'llm': {
      const p = platforms.value.find((x) => x.id === c.platformId);
      const m = platformStore.models.find((x) => x.id === c.modelId);
      return `${p?.name || '?'} / ${m?.alias || m?.modelId || '?'}`;
    }
    case 'tool': {
      const s = mcpServers.value.find((x) => x.id === c.mcpServerId);
      return `${s?.name || '?'}.${c.toolName || '?'}`;
    }
    case 'input':
      return '入参';
    case 'output':
      return c.key || 'result';
    case 'code':
      return (c.expression || '').slice(0, 30) || 'expression';
    case 'condition':
      return (c.expression || '').slice(0, 24) || 'condition';
    case 'loop':
      return `×${c.maxIterations || '?'}（${c.iterateKey || 'item'}）`;
    case 'sub_agent': {
      const a = store.agents.find((x) => x.id === c.subAgentId);
      return a?.name || '未选择';
    }
    case 'memory_read':
      return `topK=${c.topK || 3}${c.query ? ` q="${String(c.query).slice(0, 12)}"` : ''}`;
    case 'memory_write':
      return `${c.contentKey || 'content'} → ${Array.isArray(c.tags) ? c.tags.join(',') : (c.tags || '')}`;
    default:
      return type;
  }
}

function onPlatformChange() {
  cfg.modelId = '';
}

function onServerChange() {
  cfg.toolName = '';
  if (cfg.mcpServerId && !(mcpStore.tools as Record<string, unknown[]>)[cfg.mcpServerId]) {
    mcpStore.connect(cfg.mcpServerId).catch(() => {});
  }
}

function onDragStart(e: DragEvent, type: NodeType) {
  e.dataTransfer?.setData('node-type', type);
}

function onDrop(e: DragEvent) {
  const type = e.dataTransfer?.getData('node-type') as NodeType;
  if (!type) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  addNode(type, { x: e.clientX - rect.left, y: e.clientY - rect.top });
}

function addNode(type: NodeType, position?: { x: number; y: number }) {
  const wfNode = store.addNode(type, position || randomPos());
  const node: Node = {
    id: wfNode.id,
    type,
    position: wfNode.position,
    data: { label: labelFor(type, wfNode.config), config: wfNode.config },
  };
  vfNodes.value = [...vfNodes.value, node];
  selectedNodeId.value = node.id;
  syncCfgFromNode();
  markDirty();
}

function randomPos() {
  return { x: 200 + Math.random() * 200, y: 100 + Math.random() * 100 };
}

function removeSelected() {
  if (!selectedNodeId.value) return;
  vfNodes.value = vfNodes.value.filter((n) => n.id !== selectedNodeId.value);
  vfEdges.value = vfEdges.value.filter((e) => e.source !== selectedNodeId.value && e.target !== selectedNodeId.value);
  selectedNodeId.value = '';
  markDirty();
}

watch([vfNodes, vfEdges], () => markDirty(), { deep: true });

async function save() {
  const workflow = toWorkflow();
  await store.updateWorkflow(agentId.value, workflow);
  const adapter = getPlatformAdapter();
  await adapter.db.exec(
    'UPDATE agent SET name = ?, description = ? WHERE id = ?',
    [agent.name, agent.description, agentId.value],
  );
  dirty.value = false;
  ElMessage.success('已保存');
}

function toWorkflow() {
  const nodes: WorkflowNode[] = vfNodes.value.map((n) => ({
    id: n.id,
    type: n.type as NodeType,
    config: n.data?.config || {},
    position: { x: n.position.x, y: n.position.y },
  }));
  const edges = vfEdges.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
    label: e.label as string | undefined,
  }));
  return { nodes, edges };
}

const showRunResult = ref(false);
const runOutput = ref<unknown>(null);

async function run() {
  if (dirty.value) await save();
  let inputs: Record<string, unknown> = {};
  try {
    inputs = JSON.parse(inputsText.value || '{}');
  } catch {
    ElMessage.warning('输入参数 JSON 解析失败，已使用空对象');
  }
  showRunResult.value = true;
  runOutput.value = null;
  try {
    const result = await store.runAgent(agentId.value, inputs);
    runOutput.value = result;
    ElMessage.success('运行完成');
  } catch (e: any) {
    ElMessage.error('运行失败: ' + e.message);
  }
}

async function load() {
  await Promise.all([
    store.loadAgent(agentId.value),
    store.loadAgents(),
    platformStore.loadPlatforms(),
    platformStore.loadModels(),
    mcpStore.loadServers(),
  ]);
  const a = store.current;
  if (!a) {
    ElMessage.error('智能体不存在');
    router.push('/agents');
    return;
  }
  agent.name = a.name;
  agent.description = a.description || '';
  vfNodes.value = a.workflow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { label: labelFor(n.type, n.config), config: n.config },
  }));
  vfEdges.value = a.workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    animated: true,
  }));
  dirty.value = false;
}

onMounted(load);
</script>

<style scoped>
.canvas-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border-bottom: 1px solid var(--color-border);
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-input {
  width: 240px;
}
.canvas-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.palette {
  width: 220px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border-right: 1px solid var(--color-border);
  padding: 12px;
  overflow-y: auto;
}
.palette-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
}
.palette-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  cursor: grab;
  transition: background 0.2s;
  margin-bottom: 6px;
  border: 1px solid transparent;
}
.palette-item:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
}
.palette-item:active {
  cursor: grabbing;
}
.palette-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}
.palette-text {
  flex: 1;
  min-width: 0;
}
.palette-name {
  font-size: 13px;
  font-weight: 600;
}
.palette-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.palette-tip {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 12px;
  text-align: center;
}
.flow-wrap {
  flex: 1;
  position: relative;
}
.flow-controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 5;
}
.inspector {
  width: 320px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border-left: 1px solid var(--color-border);
  padding: 12px;
  overflow-y: auto;
}
.inspector-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
}
.inspector-empty,
.inspector-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.run-logs {
  max-height: 240px;
  overflow-y: auto;
}
.run-log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
}
.run-log-item.error .log-msg {
  color: var(--el-color-danger);
}
.log-time {
  color: var(--color-text-secondary);
  font-family: monospace;
}
.log-err {
  color: var(--el-color-danger);
  margin-left: auto;
}
.run-output {
  margin-top: 8px;
}
.run-output-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.run-output pre {
  background: var(--color-bg-secondary);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
  max-height: 240px;
}

.grid-bg {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, #2a2a35 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}

/* Vue Flow 自定义节点样式 */
:deep(.custom-node) {
  min-width: 160px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--node-color, #6366f1);
  border-radius: 10px;
  padding: 8px 12px;
  color: var(--color-text);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
:deep(.custom-node.selected) {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4);
}
:deep(.custom-node-head) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--node-color);
  letter-spacing: 1px;
}
:deep(.custom-node-icon) {
  width: 14px;
  height: 14px;
}
:deep(.custom-node-body) {
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.85;
}

:deep(.vue-flow__edge-path) {
  stroke: #6366f1;
  stroke-width: 2;
}
:deep(.vue-flow__handle) {
  background: #6366f1;
  border: 2px solid var(--color-bg);
  width: 8px;
  height: 8px;
}
</style>
