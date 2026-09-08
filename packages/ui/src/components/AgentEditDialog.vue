<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑智能体' : '新建智能体'" width="720px" top="2vh" class="agent-edit-dialog" :close-on-click-modal="false" destroy-on-close>
    <div class="agent-edit-body" v-if="form">
      <el-tabs v-model="activeTab" class="agent-tabs">
        <!-- Tab 1: 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <div class="tab-inner">
            <el-form label-width="80px" label-position="left">
              <el-form-item label="名称"><el-input v-model="form.name" placeholder="智能体名称" /></el-form-item>
              <el-form-item label="描述"><el-input v-model="form.description" placeholder="简短描述" /></el-form-item>
              <el-form-item label="类型">
                <div class="type-selector" :class="{ disabled: isEdit }">
                  <div class="type-card" :class="{ active: form.type === 'harness' }" @click="!isEdit && (form.type = 'harness')">
                    <div class="type-icon"><el-icon :size="18"><Connection /></el-icon></div>
                    <span>Harness · 挂载即用</span>
                  </div>
                  <div class="type-card" :class="{ active: form.type === 'workflow' }" @click="!isEdit && (form.type = 'workflow')">
                    <div class="type-icon"><el-icon :size="18"><Share /></el-icon></div>
                    <span>Workflow · DAG编排</span>
                  </div>
                </div>
              </el-form-item>
              <el-form-item label="系统提示词">
                <div class="prompt-wrap">
                  <el-input v-model="form.systemPrompt" type="textarea" :rows="4" placeholder="设定角色、语气、行为约束..." />
                  <el-button size="small" text class="prompt-copy" :icon="CopyDocument" title="复制提示词" @click="copySystemPrompt">复制</el-button>
                </div>
              </el-form-item>
              <el-form-item label="模型">
                <el-select v-model="form.modelId" placeholder="选择模型" filterable clearable style="width:100%">
                  <el-option-group v-for="g in modelGroups" :key="g.platformId" :label="g.platformName">
                    <el-option v-for="m in g.models" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                  </el-option-group>
                </el-select>
              </el-form-item>
              <el-form-item v-if="authStore.isLoggedIn" label="发布到商城">
                <div class="publish-row">
                  <el-switch v-model="form.isPublic" active-text="公开" inactive-text="私有" />
                  <span class="publish-hint">开启后将此智能体快照发布到商城供远程节点安装</span>
                </div>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- Tab 2: 模型参数 -->
        <el-tab-pane label="模型参数" name="params">
          <div class="tab-inner">
            <div class="param-grid">
              <div class="param-item">
                <div class="param-head"><span class="param-label">Temperature</span><span class="param-val">{{ form.temperature.toFixed(2) }}</span></div>
                <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.05" size="small" />
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">Top P</span><span class="param-val">{{ form.topP.toFixed(2) }}</span></div>
                <el-slider v-model="form.topP" :min="0" :max="1" :step="0.05" size="small" />
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">Max Tokens</span><span class="param-val">{{ form.maxTokens }}</span></div>
                <el-slider v-model="form.maxTokens" :min="512" :max="65536" :step="256" size="small" />
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">思考模式</span></div>
                <el-select v-model="form.reasoningEffort" placeholder="关闭" size="small" style="width:100%">
                  <el-option label="关闭" value="" /><el-option label="低" value="low" />
                  <el-option label="中" value="medium" /><el-option label="高" value="high" />
                </el-select>
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">最大循环步数</span><span class="param-val">{{ form.maxReActSteps }}</span></div>
                <el-input-number v-model="form.maxReActSteps" :min="100" :max="500" :step="1" size="small" controls-position="right" style="width: 100%" />
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 3: 高级配置 (Harness only) -->
        <el-tab-pane v-if="form.type === 'harness'" label="高级配置" name="advanced">
          <div class="tab-inner">
            <div class="mount-tabs">
              <button class="mount-tab" :class="{ active: mountTab === 'tools' }" @click="mountTab = 'tools'">
                <el-icon :size="14"><Switch /></el-icon> 工具
                <span class="badge">{{ checkedToolCount }}</span>
              </button>
              <button class="mount-tab" :class="{ active: mountTab === 'skills' }" @click="mountTab = 'skills'">
                <el-icon :size="14"><Files /></el-icon> Skill
                <span class="badge">{{ form.skillIds?.length || 0 }}</span>
              </button>
              <button class="mount-tab" :class="{ active: mountTab === 'subAgents' }" @click="mountTab = 'subAgents'">
                <el-icon :size="14"><Share /></el-icon> 子智能体
                <span class="badge">{{ form.subAgentIds?.length || 0 }}</span>
              </button>
              <button class="mount-tab" :class="{ active: mountTab === 'ontologies' }" @click="mountTab = 'ontologies'">
                <el-icon :size="14"><Collection /></el-icon> 本体
                <span class="badge">{{ form.ontologyIds?.length || 0 }}</span>
              </button>
            </div>

            <div class="mount-body">
              <template v-if="mountTab === 'tools'">
                <div class="mount-group">
                  <div class="mount-label">内置工具</div>
                  <div v-for="g in builtinToolGroups" :key="g.key" class="tool-cat">
                    <div class="tool-cat-head" @click="toggleBuiltinCat(g.key)">
                      <el-icon :size="11" class="tool-cat-arrow" :class="{ open: isBuiltinCatOpen(g.key) }"><ArrowRight /></el-icon>
                      <span class="tool-cat-name">{{ g.label }}</span>
                      <span class="tool-cat-count">{{ g.tools.length }}</span>
                    </div>
                    <div v-show="isBuiltinCatOpen(g.key)" class="chip-wrap">
                      <label v-for="t in g.tools" :key="t.name" class="chip" :class="{ on: form.builtinToolIds.includes(t.name) }">
                        <input type="checkbox" :value="t.name" v-model="form.builtinToolIds" hidden />{{ t.name }}
                      </label>
                    </div>
                  </div>
                </div>
                <div class="mount-group">
                  <div class="mount-label">自定义工具</div>
                  <div class="chip-wrap">
                    <label v-for="t in customToolList" :key="t.id" class="chip" :class="{ on: form.customToolIds.includes(t.id) }">
                      <input type="checkbox" :value="t.id" v-model="form.customToolIds" hidden />{{ t.name }}
                    </label>
                    <span v-if="customToolList.length===0" class="mt-empty">暂无</span>
                  </div>
                </div>
                <div class="mount-group">
                  <div class="mount-label">MCP 工具</div>
                  <div v-if="mcpServerList.length===0" class="mt-empty">暂无已连接的 MCP</div>
                  <div v-for="s in mcpServerList" :key="s.id" class="mcp-row">
                    <el-checkbox :model-value="isMcpAll(s.id)" :indeterminate="isMcpIndeterm(s.id)" @change="onMcpToggle(s.id,$event)" style="font-weight:600">{{ s.name }}</el-checkbox>
                    <div v-if="mcpExpanded[s.id]" class="chip-wrap" style="padding-left:22px;margin-top:4px">
                      <label v-for="t in (mcpStore.tools[s.id]||[])" :key="t.name"
                        class="chip" :class="{ on: isMcpTool(s.id, t.name) }"
                        @click="onMcpTool(s.id, t.name, !isMcpTool(s.id, t.name))">{{ t.name }}</label>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="mountTab === 'skills'">
                <el-input v-model="skillFilter" size="small" clearable :prefix-icon="Search" placeholder="搜索 Skill 名称 / 描述 / 分类" style="margin-bottom: 8px" />
                <div v-for="g in skillGroups" :key="g.label" class="mount-group">
                  <div class="mount-label">{{ g.label }}<span class="badge" style="margin-left: 6px">{{ g.items.length }}</span></div>
                  <div class="chip-wrap">
                    <label v-for="sk in g.items" :key="sk.id" class="chip" :class="{ on: form.skillIds.includes(sk.id) }" :title="sk.description">
                      <input type="checkbox" :value="sk.id" v-model="form.skillIds" hidden />{{ sk.name }}
                    </label>
                  </div>
                </div>
                <div v-if="!skillGroups.length" class="mt-empty">没有匹配的 Skill</div>
              </template>
              <template v-else-if="mountTab === 'subAgents'">
                <div class="chip-wrap">
                  <label v-for="a in subAgentList" :key="a.id" class="chip" :class="{ on: form.subAgentIds.includes(a.id) }">
                    <input type="checkbox" :value="a.id" v-model="form.subAgentIds" hidden />{{ a.name }}
                  </label>
                </div>
              </template>
              <template v-else-if="mountTab === 'ontologies'">
                <div class="ont-mount-hint">
                  挂载后该智能体的取数范围收敛到这些本体；不挂载则可查全部已发布本体。按本体包分组，可整组挂载/移除。
                </div>
                <el-input v-model="ontFilter" size="small" clearable :prefix-icon="Search" placeholder="搜索本体 code / 名称 / 描述" style="margin-bottom: 8px" />
                <div class="ont-mount" v-loading="ontologyLoading">
                  <!-- 左：已挂载 -->
                  <div class="ont-col">
                    <div class="ont-col-head">
                      <span class="ont-col-title">已挂载 <b>{{ form.ontologyIds.length }}</b></span>
                      <el-button v-if="form.ontologyIds.length" text size="small" type="danger" @click="form.ontologyIds = []">清空</el-button>
                    </div>
                    <div class="ont-col-body">
                      <div v-for="g in mountedOntGroups" :key="g.label" class="ont-cat">
                        <div class="ont-cat-head">
                          <span class="ont-cat-name">{{ g.label }}</span>
                          <el-button text size="small" type="danger" @click="moveOntGroup(g.items, false)">全部移除</el-button>
                        </div>
                        <div class="chip-wrap">
                          <label v-for="o in g.items" :key="o.id" class="chip on" :title="o.description" @click="toggleOntology(o.id, false)">{{ o.code }}</label>
                        </div>
                      </div>
                      <div v-if="!mountedOntGroups.length && !ontologyLoading" class="mt-empty">未挂载本体，从右侧选择</div>
                    </div>
                  </div>
                  <!-- 右：未挂载 -->
                  <div class="ont-col">
                    <div class="ont-col-head">
                      <span class="ont-col-title">未挂载 <b>{{ unmountedOntCount }}</b></span>
                      <el-button v-if="unmountedOntCount" text size="small" type="primary" @click="moveOntGroup(allUnmounted, true)">全部挂载</el-button>
                    </div>
                    <div class="ont-col-body">
                      <div v-for="g in unmountedOntGroups" :key="g.label" class="ont-cat">
                        <div class="ont-cat-head">
                          <span class="ont-cat-name">{{ g.label }}</span>
                          <el-button text size="small" type="primary" @click="moveOntGroup(g.items, true)">全部挂载</el-button>
                        </div>
                        <div class="chip-wrap">
                          <label v-for="o in g.items" :key="o.id" class="chip" :title="o.description" @click="toggleOntology(o.id, true)">{{ o.code }}</label>
                        </div>
                      </div>
                      <div v-if="!unmountedOntGroups.length && !ontologyLoading" class="mt-empty">已全部挂载</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button v-if="isEdit&&!agent?.isDefault&&!agent?.isBuiltin" type="danger" plain @click="handleDelete" style="margin-right:auto">删除</el-button>
      <el-button @click="visible=false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, EditPen, Cpu, Setting, Connection, Share, Files, Switch, ArrowRight, Collection, CopyDocument, Search } from '@element-plus/icons-vue';
import type { Agent } from '@yan-zhi/shared';
import { useAgentStore, usePlatformStore, useMcpStore, useSkillStore, useToolsStore, useAuthStore } from '../stores';
import { api } from '../api/client';

const props = defineProps<{ modelValue: boolean; agent?: Agent | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved', agentId: string): void; (e: 'deleted', agentId: string): void }>();

const agentStore = useAgentStore();
const authStore = useAuthStore();
const platformStore = usePlatformStore();
const mcpStore = useMcpStore();
const skillStore = useSkillStore();
const toolsStore = useToolsStore();

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) });
const isEdit = computed(() => !!props.agent?.id);
const activeTab = ref('basic');
const mountTab = ref('tools');
const mcpExpanded = reactive<Record<string, boolean>>({});
const builtinToolsLoaded = ref(false);

const form = ref<any>({
  name: '', description: '', systemPrompt: '', modelId: '', type: 'harness',
  temperature: 0.7, maxTokens: 2048, topP: 1, frequencyPenalty: 0, presencePenalty: 0,
  reasoningEffort: '', maxReActSteps: 100,
  builtinToolIds: [], customToolIds: [], mcpToolMounts: [], skillIds: [], subAgentIds: [], ontologyIds: [],
  isPublic: false,
});

// ===== 本体挂载（双栏：左已挂载 / 右未挂载，按域分组，可整组挂载/移除） =====
const ontologyList = ref<Array<{ id: string; code: string; name: string; description: string; domain: string }>>([]);
const ontologyLoading = ref(false);
async function loadOntologies() {
  if (ontologyLoading.value) return;
  ontologyLoading.value = true;
  try {
    const res = await api.get<any[]>('/ontologies');
    if ('error' in res) return;
    // 只列已发布本体（与智能体取数口径一致；草稿挂了也取不到数）
    ontologyList.value = (res.data || []).filter((o: any) => o.status === 'published');
    // 本体包树：挂载分组按包路径展示（包下建包的多级结构折叠为「父/子」路径）
    const groups = await api.get<any[]>('/ontology-groups');
    if (!('error' in groups)) ontologyGroups.value = flattenGroups(groups.data as any[]);
  } catch { /* server 不可达时保持空列表 */ }
  finally { ontologyLoading.value = false; }
}

interface GroupNode { id: string; name: string; parentId: string | null; children: GroupNode[] }
const ontologyGroups = ref<Array<{ id: string; label: string }>>([]);
function flattenGroups(nodes: GroupNode[], prefix = ''): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({ id: n.id, label });
    out.push(...flattenGroups(n.children, label));
  }
  return out;
}
function toggleOntology(id: string, on: boolean) {
  const s = new Set<string>(form.value.ontologyIds || []);
  if (on) s.add(id); else s.delete(id);
  form.value.ontologyIds = [...s];
}
function moveOntGroup(items: Array<{ id: string }>, on: boolean) {
  const s = new Set<string>(form.value.ontologyIds || []);
  for (const o of items) { if (on) s.add(o.id); else s.delete(o.id); }
  form.value.ontologyIds = [...s];
}
/** 搜索过滤（code/名称/描述/包路径） */
const ontFilter = ref('');
const filteredOntologyList = computed(() => {
  const k = ontFilter.value.trim().toLowerCase();
  if (!k) return ontologyList.value;
  return ontologyList.value.filter((o) => {
    const grpLabel = ontologyGroups.value.find((g) => g.id === (o as any).groupId)?.label || '';
    return [o.code, o.name, o.description, grpLabel].some((x) => (x || '').toLowerCase().includes(k));
  });
});
function groupOntologies(list: typeof ontologyList.value) {
  const map = new Map<string, typeof list>();
  for (const o of list) {
    // 分组优先用本体包路径（多级，如「交易/订单」）；未归包的按业务域兜底，再退「未分类」
    const grp = ontologyGroups.value.find((g) => g.id === (o as any).groupId);
    const k = grp ? grp.label : (o.domain || '').trim() || '未分类';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}
const mountedOntGroups = computed(() => groupOntologies(filteredOntologyList.value.filter((o) => form.value.ontologyIds?.includes(o.id))));
const allUnmounted = computed(() => filteredOntologyList.value.filter((o) => !form.value.ontologyIds?.includes(o.id)));
const unmountedOntGroups = computed(() => groupOntologies(allUnmounted.value));
const unmountedOntCount = computed(() => allUnmounted.value.length);

// ===== Skill 挂载：搜索 + 按分类分组 + 描述提示 =====
const skillFilter = ref('');
const skillGroups = computed(() => {
  const k = skillFilter.value.trim().toLowerCase();
  const items = skillList.value.filter((s: any) => {
    if (!k) return true;
    return [s.name, s.description, s.category].some((x) => (x || '').toLowerCase().includes(k));
  });
  const map = new Map<string, any[]>();
  for (const s of items) {
    const label = (s.category || '').trim() || '其他';
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(s);
  }
  return [...map.entries()].map(([label, list2]) => ({ label, items: list2 })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
});

const builtinToolGroups = computed(() => toolsStore.builtinToolGroups);
const builtinCatOpen = ref<Record<string, boolean>>({});
function isBuiltinCatOpen(key: string) { return builtinCatOpen.value[key] !== false; }
function toggleBuiltinCat(key: string) { builtinCatOpen.value[key] = !isBuiltinCatOpen(key); }
const customToolList = computed(() => toolsStore.customTools.filter((t: any) => t.enabled));
const mcpServerList = computed(() => mcpStore.servers);
const skillList = computed(() => skillStore.skills.filter((s: any) => s.enabled));
// 内置智能体（如 pageAgent）也允许出现在子智能体列表中，默认助理可看到并确认已挂载的 pageAgent
const subAgentList = computed(() => agentStore.agents.filter(a => a.id !== props.agent?.id));
const modelGroups = computed(() => {
  const enabled = platformStore.models.filter((m: any) => m.enabled);
  return platformStore.platforms.map((p: any) => ({ platformId: p.id, platformName: p.name, models: enabled.filter((m: any) => m.platformId === p.id) })).filter((g: any) => g.models.length > 0);
});
const checkedToolCount = computed(() => (form.value.builtinToolIds?.length || 0) + (form.value.customToolIds?.length || 0) + (form.value.mcpToolMounts?.length || 0));

/** 复制系统提示词到剪贴板（clipboard API 不可用时回退 execCommand） */
async function copySystemPrompt() {
  const text = form.value.systemPrompt || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('提示词已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ElMessage.success('提示词已复制');
    } catch {
      ElMessage.error('复制失败，请手动选择复制');
    }
    document.body.removeChild(ta);
  }
}

function isMcpAll(sid: string) { return form.value.mcpToolMounts?.find((m: any) => m.serverId === sid)?.toolName === '*'; }
function isMcpIndeterm(sid: string) { const m = form.value.mcpToolMounts?.find((m: any) => m.serverId === sid); return !!m && m.toolName !== '*' && !isMcpAll(sid); }
function isMcpTool(sid: string, name: string) { return form.value.mcpToolMounts?.some((m: any) => m.serverId === sid && (m.toolName === '*' || m.toolName === name)); }
function onMcpToggle(sid: string, checked: boolean) { form.value.mcpToolMounts = form.value.mcpToolMounts?.filter((m: any) => m.serverId !== sid) || []; if (checked) form.value.mcpToolMounts.push({ serverId: sid, toolName: '*' }); mcpExpanded[sid] = checked; }
function onMcpTool(sid: string, toolName: string, checked: boolean) {
  form.value.mcpToolMounts = form.value.mcpToolMounts?.filter((m: any) => !(m.serverId === sid && (m.toolName === toolName || m.toolName === '*'))) || [];
  if (checked) { form.value.mcpToolMounts.push({ serverId: sid, toolName }); const all = (mcpStore.tools[sid] || []).map((t: any) => t.name); const sel = form.value.mcpToolMounts.filter((m: any) => m.serverId === sid).map((m: any) => m.toolName); if (all.length > 0 && all.every((n: string) => sel.includes(n))) { form.value.mcpToolMounts = form.value.mcpToolMounts.filter((m: any) => m.serverId !== sid); form.value.mcpToolMounts.push({ serverId: sid, toolName: '*' }); } }
}

watch(() => [props.modelValue, props.agent], () => {
  if (props.modelValue) {
    if (!builtinToolsLoaded.value) {
      builtinToolsLoaded.value = true;
      toolsStore.loadBuiltinTools();
    }
    // 自定义工具列表需在弹窗打开时加载：此前从未加载导致「自定义工具」挂载区始终显示"暂无"，
    // 而工具商城页进入时会自行加载，两边数据不一致。重复调用幂等（覆盖 store 列表）。
    toolsStore.loadCustomTools();
    // Skill 列表同理：只在 Skill 商店页才加载会导致挂载区为空（badge 有数但列表显示"没有匹配的 Skill"）
    void skillStore.loadSkills();
    // 本体列表：挂载页数据源（只列已发布本体，与智能体取数范围口径一致）
    void loadOntologies();
    const a = props.agent;
    form.value = {
      name: a?.name || '', description: a?.description || '', systemPrompt: a?.systemPrompt || '',
      modelId: a?.modelId || '', type: a?.type || 'harness',
      temperature: a?.temperature ?? 0.7, maxTokens: a?.maxTokens ?? 2048, topP: a?.topP ?? 1,
      frequencyPenalty: a?.frequencyPenalty ?? 0, presencePenalty: a?.presencePenalty ?? 0,
      reasoningEffort: (a?.config as any)?.reasoningEffort || '', maxReActSteps: (a?.config as any)?.maxReActSteps ?? 100,
      builtinToolIds: a?.builtinToolIds ? [...a.builtinToolIds] : [],
      customToolIds: a?.customToolIds ? [...a.customToolIds] : [],
      mcpToolMounts: a?.mcpToolMounts ? [...a.mcpToolMounts] : [],
      skillIds: a?.skillIds ? [...a.skillIds] : [], subAgentIds: a?.subAgentIds ? [...a.subAgentIds] : [],
      ontologyIds: a?.ontologyIds ? [...a.ontologyIds] : [],
      isPublic: !!a?.isPublic,
    };
    activeTab.value = 'basic'; mountTab.value = 'tools';
  }
}, { immediate: true });

async function handleSave() {
  if (!form.value.name?.trim()) { ElMessage.warning('名称必填'); return; }
  const m = platformStore.models.find((x: any) => x.id === form.value.modelId);
  const data: Partial<Agent> = {
    name: form.value.name.trim(), description: form.value.description?.trim() || '',
    systemPrompt: form.value.systemPrompt || '', modelId: form.value.modelId || '',
    platformId: m?.platformId || '', type: form.value.type,
    temperature: form.value.temperature, maxTokens: form.value.maxTokens, topP: form.value.topP,
    frequencyPenalty: form.value.frequencyPenalty, presencePenalty: form.value.presencePenalty,
    config: { reasoningEffort: form.value.reasoningEffort || undefined, maxReActSteps: form.value.maxReActSteps },
    builtinToolIds: form.value.builtinToolIds, customToolIds: form.value.customToolIds,
    mcpToolMounts: form.value.mcpToolMounts, skillIds: form.value.skillIds, subAgentIds: form.value.subAgentIds,
    ontologyIds: form.value.ontologyIds,
  };
  // 发布状态由 publishAgent/unpublishAgent 单独管理（同步本地 + 服务端），不随普通字段写入
  const wasPublic = !!props.agent?.isPublic;
  const wantPublic = !!form.value.isPublic;
  let savedId = '';
  if (props.agent?.id) { await agentStore.updateAgent(props.agent.id, data); savedId = props.agent.id; ElMessage.success('已更新'); }
  else { savedId = await agentStore.createChatAgent(data); ElMessage.success('已创建'); }
  // 发布/下架：仅在状态变化或已公开需同步更新时触发
  if (wantPublic && !wasPublic) {
    const r = await agentStore.publishAgent(savedId);
    if (r.ok) ElMessage.success('已发布到商城');
    else ElMessage.warning(r.error || '发布失败');
  } else if (wantPublic && wasPublic) {
    // 已公开的智能体编辑后重新同步快照到服务端
    const r = await agentStore.publishAgent(savedId);
    if (!r.ok) ElMessage.warning(r.error || '商城同步失败');
  } else if (!wantPublic && wasPublic) {
    const r = await agentStore.unpublishAgent(savedId);
    if (r.ok) ElMessage.success('已从商城下架');
    else ElMessage.warning(r.error || '下架失败');
  }
  visible.value = false;
  emit('saved', savedId);
}
async function handleDelete() {
  if (!props.agent?.id) return; if (props.agent.isDefault) { ElMessage.warning('默认智能体不可删除'); return; }
  try { await ElMessageBox.confirm(`删除智能体「${props.agent.name}」？`, '提示', { type: 'warning' }); await agentStore.deleteAgent(props.agent.id); visible.value = false; emit('deleted', props.agent.id); ElMessage.success('已删除'); } catch {}
}
</script>

<style scoped>
.agent-edit-body { display: flex; flex-direction: column; min-height: 0; }
.agent-tabs :deep(.el-tabs__header) { margin-bottom: 2px; flex-shrink: 0; }
.agent-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.agent-edit-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.agent-tabs :deep(.el-tabs__header) { margin-bottom: 2px; flex-shrink: 0; }
.agent-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.agent-tabs :deep(.el-tabs__item) { font-size: 14px; font-weight: 500; padding: 0 16px; height: 38px; line-height: 38px; }
.agent-tabs { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.agent-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* pane 默认高度为 auto，必须显式 flex 传递，否则 tab 内容会溢出被 content 裁剪且无法滚动 */
.agent-tabs :deep(.el-tab-pane) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.tab-inner { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 8px 4px 4px 0; }
.tab-inner::-webkit-scrollbar { width: 5px; }
.tab-inner::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }

.publish-row { display: flex; align-items: center; gap: 10px; }
.publish-hint { font-size: 11px; color: var(--color-text-secondary); }

.prompt-wrap { width: 100%; display: flex; flex-direction: column; }
.prompt-copy { align-self: flex-start; margin-top: 2px; }

.type-selector { display: flex; gap: 8px; }
.type-card {
  flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  border-radius: 8px; border: 1.5px solid var(--glass-border); cursor: pointer;
  font-size: 13px; font-weight: 500; transition: all 0.15s;
  color: var(--color-text-secondary);
  background: var(--glass-bg);
}
.type-card:hover { border-color: var(--color-primary); color: var(--color-text); }
.type-card .type-icon { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; background: rgba(15,23,42,0.05); color: var(--color-text-secondary); }
.type-card.active { border-color: var(--color-primary); background: rgba(99,102,241,0.04); }
.type-selector.disabled .type-card { opacity: 0.6; cursor: not-allowed; }
.type-selector.disabled .type-card:hover { border-color: var(--el-border-color); color: var(--el-text-color-regular); }
.type-card.active .type-icon { background: var(--color-primary); color: #fff; }

.param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
.param-item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 14px; border-radius: 10px;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
}
.param-head { display: flex; justify-content: space-between; align-items: baseline; }
.param-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; }
.param-val { font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 600; color: var(--color-primary); }
.param-item :deep(.el-slider) { --el-slider-main-bg-color: var(--color-primary); --el-slider-runway-bg-color: rgba(15,23,42,0.08); --el-slider-height: 4px; --el-slider-button-size: 12px; }

/* 本体挂载双栏 */
.ont-mount-hint { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 8px; }
.ont-mount { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; min-height: 220px; }
.ont-col {
  display: flex; flex-direction: column; min-height: 0; overflow-y: auto;
  border: 1px solid var(--glass-border); border-radius: 10px; background: rgba(15,23,42,0.02); padding: 8px;
}
.ont-col-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.ont-col-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.ont-col-title b { color: var(--color-primary); }
.ont-cat { margin-bottom: 8px; }
.ont-cat-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; }
.ont-cat-name { font-size: 12px; font-weight: 600; color: var(--color-text); }

.mount-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-shrink: 0; }
.mount-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1.5px solid var(--glass-border); background: rgba(15,23,42,0.01);
  color: var(--color-text-secondary); transition: all 0.15s;
}
.mount-tab:hover { border-color: var(--color-primary); color: var(--color-text); }
.mount-tab.active { border-color: var(--color-primary); background: rgba(99,102,241,0.06); color: var(--color-primary); }
.mount-tab .badge {
  font-size: 10px; font-weight: 700; min-width: 20px; height: 20px; border-radius: 10px;
  background: rgba(15,23,42,0.06); display: flex; align-items: center; justify-content: center;
  padding: 0 6px;
}
.mount-tab.active .badge { background: rgba(99,102,241,0.15); color: var(--color-primary); }

.mount-body { flex: 1; min-height: 0; overflow-y: auto; border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 14px; background: var(--glass-bg); display: flex; flex-direction: column; }
.mount-body::-webkit-scrollbar { width: 5px; }
.mount-body::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }
.mount-group { margin-bottom: 10px; }
.mount-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
.mt-empty { font-size: 12px; color: var(--color-text-secondary); font-style: italic; }
.mcp-row { margin-bottom: 4px; }

.chip-wrap { display: flex; flex-wrap: wrap; gap: 5px; }
.chip {
  display: inline-flex; padding: 5px 12px; border-radius: 999px; cursor: pointer;
  font-size: 12px; font-weight: 500; border: 1.5px solid var(--glass-border);
  background: var(--glass-bg); color: var(--color-text-secondary);
  transition: all 0.15s; user-select: none;
}
.chip:hover { border-color: var(--color-primary); color: var(--color-text); }
.chip.on {
  border-color: var(--color-primary); background: rgba(99,102,241,0.08);
  color: var(--color-primary); font-weight: 600;
}

.tool-cat { margin-bottom: 6px; }
.tool-cat-head { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 3px 0; user-select: none; }
.tool-cat-head:hover .tool-cat-name { color: var(--color-primary); }
.tool-cat-arrow { transition: transform 0.15s; color: var(--color-text-secondary); }
.tool-cat-arrow.open { transform: rotate(90deg); }
.tool-cat-name { font-size: 12px; font-weight: 600; color: var(--color-text); transition: color 0.15s; }
.tool-cat-count { font-size: 10px; font-weight: 700; color: var(--color-text-secondary); background: rgba(15,23,42,0.06); border-radius: 8px; padding: 1px 6px; }

@media (max-width: 767px) {
  .tab-inner { padding: 4px 2px 4px 0; }
  .type-selector { flex-direction: row; }
  .type-card { padding: 4px 8px; font-size: 12px; }
  .param-grid { grid-template-columns: 1fr; gap: 8px; }
  .param-item { padding: 8px 10px; }
  .mount-tab { padding: 6px 8px; font-size: 12px; }
}
</style>
