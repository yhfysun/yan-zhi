<template>
  <el-dialog v-model="visible" :title="isEdit ? '编辑智能体' : '新建智能体'" width="720px" top="2vh" class="agent-edit-dialog" :close-on-click-modal="false" destroy-on-close>
    <div class="agent-edit-body" v-if="form">
      <el-tabs v-model="activeTab" class="agent-tabs">
        <!-- Tab 1: 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <div class="tab-inner">
            <el-form label-width="80px" label-position="left">
              <el-form-item label="名称"><el-input v-model="form.name" placeholder="智能体名称" /></el-form-item>
              <el-form-item label="头像">
                <div class="avatar-picker">
                  <div class="avatar-picker-head">
                    <button
                      type="button"
                      class="icon-cell auto" :class="{ active: !form.avatar }"
                      title="自动：按智能体名称/内置用途判定" @click="form.avatar = ''"
                    >
                      <component v-if="autoIcon" :is="autoIcon" theme="filled" :size="18" />
                      <span v-else class="icon-cell-text">{{ autoInitial }}</span>
                      <span>自动</span>
                    </button>
                    <div class="avatar-tabs">
                      <button
                        type="button"
                        v-for="t in avatarTabs" :key="t.key"
                        class="avatar-tab" :class="{ active: avatarTab === t.key }"
                        @click="avatarTab = t.key"
                      >{{ t.label }}</button>
                    </div>
                  </div>
                  <div v-if="avatarTab === 'icon'" class="icon-picker">
                    <button
                      type="button"
                      v-for="opt in AGENT_ICON_LIBRARY" :key="opt.key"
                      class="icon-cell" :class="{ active: form.avatar === opt.key }"
                      :title="opt.label" @click="form.avatar = opt.key"
                    >
                      <component :is="opt.icon" theme="filled" :size="18" />
                      <span>{{ opt.label }}</span>
                    </button>
                  </div>
                  <div v-else class="image-picker">
                    <button
                      type="button"
                      v-for="img in avatarImagesOf(avatarTab)" :key="img.key"
                      class="image-cell" :class="{ active: form.avatar === img.key }"
                      :title="avatarTabLabel(avatarTab)" @click="form.avatar = img.key"
                    >
                      <img :src="img.src" alt="" draggable="false" />
                    </button>
                  </div>
                </div>
              </el-form-item>
              <el-form-item label="描述"><el-input v-model="form.description" placeholder="简短描述" /></el-form-item>
              <el-form-item label="分类">
                <el-radio-group v-model="form.agentKind">
                  <el-radio value="main" title="主智能体：可在会话中直接选中">主智能体</el-radio>
                  <el-radio value="sub" title="子智能体：只能被其他智能体引用委派，不会出现在会话的智能体选择列表中">子智能体</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="分类标签">
                <el-input v-model="form.category" placeholder="如：工作 / 研发 / 生活（用于智能体列表分组，可留空）" />
                <div class="kind-hint">自定义分类标签，与上方「主/子智能体」相互独立，用于智能体列表侧栏分组与筛选</div>
              </el-form-item>
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
              <el-form-item label="锁定模型">
                <el-select v-model="form.modelId" placeholder="留空则按候选池顺序选用" filterable clearable style="width:100%">
                  <el-option-group v-for="g in modelGroups" :key="g.platformId" :label="g.platformName">
                    <el-option v-for="m in g.models" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                  </el-option-group>
                </el-select>
              </el-form-item>
              <!-- 模型候选池（model-candidate-pools）：四槽位有序多选，顺序即优先级（第一个为首选）。
                   未配置的槽位按 智能体平台默认池 → 全局池 → 自动兜底 回退（判据 matchesModelSlot 与后端同源）。 -->
              <el-form-item v-for="slot in POOL_SLOTS" :key="slot" :label="POOL_LABELS[slot]">
                <div class="pool-select-row">
                  <el-select
                    v-model="form.modelPools[slot]"
                    :placeholder="`${POOL_LABELS[slot]}候选：可多选，顺序即优先级`"
                    filterable clearable multiple collapse-tags style="width:100%"
                  >
                    <el-option-group v-for="g in poolSlotGroups[slot]" :key="g.platformId" :label="g.platformName">
                      <el-option v-for="m in g.models" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                    </el-option-group>
                  </el-select>
                  <span v-if="(form.modelPools[slot] || []).length" class="pool-first-tag">首选：{{ firstPoolName(slot) }}</span>
                </div>
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
                <el-slider v-model="form.maxTokens" :min="512" :max="MAX_TOKENS_SLIDER_MAX" :step="256" size="small" />
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">思考模式</span></div>
                <!-- 取值对齐 2026-10 OpenAI 标准 reasoning_effort：minimal/low/medium/high/xhigh
                     （'' = 关闭，请求不带该参数）；不支持某档位的模型由模型侧报错兜底。 -->
                <el-select v-model="form.reasoningEffort" placeholder="关闭" size="small" style="width:100%">
                  <el-option label="关闭" value="" /><el-option label="最小" value="minimal" />
                  <el-option label="低" value="low" /><el-option label="中" value="medium" />
                  <el-option label="高" value="high" /><el-option label="超高" value="xhigh" />
                </el-select>
              </div>
              <div class="param-item">
                <div class="param-head"><span class="param-label">最大循环步数</span><span class="param-val">{{ form.maxReActSteps }}</span></div>
                <el-input-number v-model="form.maxReActSteps" :min="1" :max="500" :step="1" size="small" controls-position="right" style="width: 100%" />
                <div class="kind-hint">单批最大步数（1–500）。达上限后会自动接力下一批（默认最多 3 批），并先做一次进展总结与记忆整理；运行中改这里，下一轮即生效，不必重发。</div>
              </div>
              <!-- 单任务费用上限（2026-10-17 费用核算）：0 = 跟随会话档位（设置 → 通用「费用预算」）；
                   填正数则与本智能体的任务取**更严者**（提醒更早）。到阈值只提醒、不会停止任务，
                   唯一会停的是全局设置里的「硬停上限」。 -->
              <div class="param-item">
                <div class="param-head"><span class="param-label">单任务费用上限（元）</span><span class="param-val">{{ form.maxCostCny }}</span></div>
                <el-input-number v-model="form.maxCostCny" :min="0" :max="100000" :precision="2" :step="1" size="small" controls-position="right" style="width: 100%" />
                <div class="kind-hint">0 = 不限（跟随会话档位）。填正数则按更严者提醒；仅提醒，不会停止任务。</div>
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
              <button class="mount-tab" :class="{ active: mountTab === 'knowledge' }" @click="mountTab = 'knowledge'">
                <el-icon :size="14"><Notebook /></el-icon> 知识库
                <span class="badge">{{ form.knowledgeBaseIds?.length || 0 }}</span>
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
              <template v-else-if="mountTab === 'knowledge'">
                <div class="ont-mount-hint">
                  挂载后该智能体的知识库检索范围收敛到这些库；不挂载则跨全部可见知识库检索（绑则限定）。内置「应用使用说明」为系统默认库，始终可选。
                </div>
                <div class="chip-wrap" v-loading="kbLoading">
                  <label v-for="kb in kbList" :key="kb.id" class="chip" :class="{ on: form.knowledgeBaseIds.includes(kb.id) }" :title="kb.description">
                    <input type="checkbox" :value="kb.id" v-model="form.knowledgeBaseIds" hidden />{{ kb.name }}<span v-if="kb.id === 'builtin-app-guide'" class="kb-default-tag">默认</span>
                  </label>
                  <span v-if="!kbLoading && !kbList.length" class="mt-empty">暂无知识库</span>
                </div>
              </template>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button v-if="isEdit&&!agent?.isDefault&&!agent?.isBuiltin" type="danger" plain @click="handleDelete" style="margin-right:auto">删除</el-button>
      <el-button v-if="isEdit&&(agent?.isBuiltin||agent?.isDefault)" plain style="margin-right:auto" @click="handleReset">恢复默认</el-button>
      <el-button @click="visible=false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, EditPen, Cpu, Setting, Connection, Share, Files, Switch, ArrowRight, Collection, CopyDocument, Search, Notebook } from '@element-plus/icons-vue';
import type { Agent } from '@yan-zhi/shared';
import { DEFAULT_AGENT_PARAMS } from '@yan-zhi/shared';
import { useAgentStore, usePlatformStore, useMcpStore, useSkillStore, useToolsStore, useAuthStore, useModelPoolStore } from '../stores';
import { api } from '../api/client';
import { POOL_SLOTS, POOL_LABELS, groupModelsForSlot, poolModelsOf } from '../utils/model-pools';
import { AGENT_ICON_LIBRARY, AVATAR_KEY_PREFIX, agentInitial, isKnownAgentIconKey, resolveAgentIcon } from '../utils/agentIcon';
import { agentAvatarGroups, isKnownAgentAvatarImage } from '../utils/agentAvatarImages';

const props = defineProps<{ modelValue: boolean; agent?: Agent | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved', agentId: string): void; (e: 'deleted', agentId: string): void }>();

const agentStore = useAgentStore();
const authStore = useAuthStore();
const platformStore = usePlatformStore();
const modelPoolStore = useModelPoolStore();
const mcpStore = useMcpStore();
const skillStore = useSkillStore();
const toolsStore = useToolsStore();

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) });const isEdit = computed(() => !!props.agent?.id);
const activeTab = ref('basic');
const mountTab = ref('tools');
const mcpExpanded = reactive<Record<string, boolean>>({});
const builtinToolsLoaded = ref(false);

/**
 * 「Max Tokens」滑块上限。
 * ★ 与 `DEFAULT_AGENT_PARAMS.maxTokens` 同源（2026-10-10 收敛硬编码）——
 *   此前模板里裸写 65536，与后端默认值各写一份，是"改一处忘一处"的典型隐患。
 *   取默认值本身作为上限：再往上调没有实际收益（实测真实任务仅消耗约 7.7K token），
 *   反而容易让用户误以为"调满才够用"。
 */
const MAX_TOKENS_SLIDER_MAX = DEFAULT_AGENT_PARAMS.maxTokens;

const form = ref<any>({
  name: '', description: '', systemPrompt: '', modelId: '', type: 'harness',
  // avatar：内置图标库的 key，空 = 自动（按内置 id / 名称关键词判定，见 utils/agentIcon.ts）
  avatar: '',
  agentKind: 'main',
  modelPools: { llm: [], vision: [], image: [], video: [] },
  temperature: DEFAULT_AGENT_PARAMS.temperature, maxTokens: DEFAULT_AGENT_PARAMS.maxTokens,
  topP: DEFAULT_AGENT_PARAMS.topP, frequencyPenalty: DEFAULT_AGENT_PARAMS.frequencyPenalty,
  presencePenalty: DEFAULT_AGENT_PARAMS.presencePenalty,
  maxCostCny: 0,
  reasoningEffort: '', maxReActSteps: 500,
  builtinToolIds: [], customToolIds: [], mcpToolMounts: [], skillIds: [], subAgentIds: [], ontologyIds: [], knowledgeBaseIds: [],
  category: '',
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
// 知识库挂载：可挂载的知识库列表（含内置「应用使用说明」默认库）
const kbList = ref<Array<{ id: string; name: string; description?: string; builtin?: boolean; defaultMounted?: boolean }>>([]);
const kbLoading = ref(false);
async function loadKbs() {
  if (kbLoading.value) return;
  kbLoading.value = true;
  try {
    const res = await api.get<any[]>('/kb');
    if (!('error' in res)) {
      kbList.value = (res.data || []).map((b: any) => ({
        id: b.id, name: b.name, description: b.description,
        builtin: !!b.builtin, defaultMounted: !!b.defaultMounted,
      }));
    }
  } catch { /* server 不可达时保持空列表 */ }
  finally { kbLoading.value = false; }
}
// 内置智能体（如 pageAgent）也允许出现在子智能体列表中，默认助理可看到并确认已挂载的 pageAgent
const subAgentList = computed(() => agentStore.agents.filter(a => a.id !== props.agent?.id));
/** 候选池/锁定模型共用的模型源：优先 modelPoolStore 的独立全量清单
 *  （platformStore.models 会被 loadModels(pid) 整体替换成单平台清单而变空） */
const poolModels = computed(() => poolModelsOf(modelPoolStore, platformStore.models));
const modelGroups = computed(() => {
  const enabled = poolModels.value.filter((m: any) => m.enabled);
  return platformStore.platforms.map((p: any) => ({ platformId: p.id, platformName: p.name, models: enabled.filter((m: any) => m.platformId === p.id) })).filter((g: any) => g.models.length > 0);
});

// ===== 模型候选池（model-candidate-pools）=====
// POOL_SLOTS / POOL_LABELS 统一取自 utils/model-pools.ts（唯一实现；短名避免 label 折行）
/** 各槽位可选模型：口径统一走 utils/model-pools.ts（matchesModelSlot 与后端同源，不许前端另写一套） */
const poolSlotGroups = computed(() => {
  const out: Record<string, ReturnType<typeof groupModelsForSlot>> = {};
  for (const slot of POOL_SLOTS) {
    out[slot] = groupModelsForSlot(poolModels.value, platformStore.platforms, slot);
  }
  return out;
});
function firstPoolName(slot: string): string {
  const id = (form.value.modelPools?.[slot] || [])[0];
  const m = poolModels.value.find((x: any) => x.id === id);
  return m ? (m.alias || m.modelId) : id;
}
const checkedToolCount = computed(() => (form.value.builtinToolIds?.length || 0) + (form.value.customToolIds?.length || 0) + (form.value.mcpToolMounts?.length || 0));

/** 「自动」格的预览：内置智能体显示预设图标，自建助手显示名称首字（与 AgentAvatar 判定一致） */
const autoIcon = computed(() => resolveAgentIcon(props.agent?.id));
const autoInitial = computed(() => agentInitial(form.value.name));

// ===== 头像选择器：图标 / 卡通 / 动漫 / 表情 / 摄影 =====
const avatarTab = ref<string>('icon');
const avatarGroups = computed(() => agentAvatarGroups());
const avatarTabs = computed(() => [
  { key: 'icon', label: '图标' },
  ...avatarGroups.value.map((g) => ({ key: g.group, label: g.label })),
]);
function avatarImagesOf(group: string) {
  return avatarGroups.value.find((g) => g.group === group)?.items || [];
}
function avatarTabLabel(group: string) {
  return avatarGroups.value.find((g) => g.group === group)?.label || '头像';
}
/** 回填时把 tab 切到已选头像所在分组，避免「选过图片却停在图标页」 */
function syncAvatarTab(avatar?: string | null) {
  if (avatar && avatar.startsWith(AVATAR_KEY_PREFIX)) {
    const group = avatarGroups.value.find((g) => g.items.some((i) => i.key === avatar))?.group;
    avatarTab.value = group || 'icon';
  } else {
    avatarTab.value = 'icon';
  }
}

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
    // 知识库列表：挂载页数据源
    void loadKbs();
    // 候选池 / 锁定模型要跨所有平台选：拉独立全量模型清单（幂等）+ 平台列表
    void modelPoolStore.ensureModels();
    if (!platformStore.platformsLoaded) void platformStore.loadPlatforms();
    const a = props.agent;
    form.value = {
      name: a?.name || '', description: a?.description || '', systemPrompt: a?.systemPrompt || '',
      avatar: (isKnownAgentIconKey(a?.avatar) || isKnownAgentAvatarImage(a?.avatar)) ? (a!.avatar as string) : '',
      modelId: a?.modelId || '', type: a?.type || 'harness',
      modelPools: {
        llm: [...(a?.modelPools?.llm || [])],
        vision: [...(a?.modelPools?.vision || [])],
        image: [...(a?.modelPools?.image || [])],
        video: [...(a?.modelPools?.video || [])],
      },
      agentKind: a?.agentKind === 'sub' ? 'sub' : 'main',
      temperature: a?.temperature ?? DEFAULT_AGENT_PARAMS.temperature,
      maxTokens: a?.maxTokens ?? DEFAULT_AGENT_PARAMS.maxTokens,
      topP: a?.topP ?? DEFAULT_AGENT_PARAMS.topP,
      frequencyPenalty: a?.frequencyPenalty ?? DEFAULT_AGENT_PARAMS.frequencyPenalty,
      presencePenalty: a?.presencePenalty ?? DEFAULT_AGENT_PARAMS.presencePenalty,
      reasoningEffort: (a?.config as any)?.reasoningEffort || '', maxReActSteps: (a?.config as any)?.maxReActSteps ?? 500,
      maxCostCny: Number((a?.config as any)?.maxCostCny) > 0 ? Number((a?.config as any).maxCostCny) : 0,
      builtinToolIds: a?.builtinToolIds ? [...a.builtinToolIds] : [],
      customToolIds: a?.customToolIds ? [...a.customToolIds] : [],
      mcpToolMounts: a?.mcpToolMounts ? [...a.mcpToolMounts] : [],
      skillIds: a?.skillIds ? [...a.skillIds] : [], subAgentIds: a?.subAgentIds ? [...a.subAgentIds] : [],
      ontologyIds: a?.ontologyIds ? [...a.ontologyIds] : [],
      knowledgeBaseIds: a?.knowledgeBaseIds ? [...a.knowledgeBaseIds] : [],
      category: a?.category || '',
      isPublic: !!a?.isPublic,
    };
    activeTab.value = 'basic'; mountTab.value = 'tools';
    syncAvatarTab(form.value.avatar);
  }
}, { immediate: true });

async function handleReset() {
  if (!props.agent?.id) return;
  try {
    await ElMessageBox.confirm('将恢复该智能体的内置默认值（提示词/工具挂载/子智能体/配置），你的修改会被覆盖。确定？', '恢复默认', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
  } catch { return; }
  try {
    const ok = await agentStore.resetAgent(props.agent.id);
    if (!ok) { ElMessage.warning('该智能体无内置默认定义，无法恢复'); return; }
    // 重置后回填表单，用户可直接看到恢复结果
    const a = agentStore.agents.find((x) => x.id === props.agent!.id);
    if (a) {
      form.value.systemPrompt = a.systemPrompt || '';
      form.value.builtinToolIds = [...(a.builtinToolIds || [])];
      form.value.subAgentIds = [...(a.subAgentIds || [])];
      form.value.skillIds = [...(a.skillIds || [])];
    }
    ElMessage.success('已恢复默认');
  } catch (e: any) {
    ElMessage.error(e?.message || '恢复失败');
  }
}

async function handleSave() {
  if (!form.value.name?.trim()) { ElMessage.warning('名称必填'); return; }
  // 与锁定模型下拉同源（poolModels），避免两侧清单不一致导致 platformId 取空
  const m = poolModels.value.find((x: any) => x.id === form.value.modelId);
  const data: Partial<Agent> = {
    name: form.value.name.trim(), description: form.value.description?.trim() || '',
    // avatar：图标库 key；空串 = 自动判定（服务端落 NULL）
    avatar: form.value.avatar || '',
    systemPrompt: form.value.systemPrompt || '', modelId: form.value.modelId || '',
    modelPools: form.value.modelPools,
    platformId: m?.platformId || '', type: form.value.type,
    // 分类：main=主智能体（会话可选中）/ sub=子智能体（仅供其他智能体引用委派）
    agentKind: form.value.agentKind === 'sub' ? 'sub' : 'main',
    temperature: form.value.temperature, maxTokens: form.value.maxTokens, topP: form.value.topP,
    frequencyPenalty: form.value.frequencyPenalty, presencePenalty: form.value.presencePenalty,
    // maxCostCny：0 = 不限（后端 resolveAgentCostLimit 只认正数）
    config: { reasoningEffort: form.value.reasoningEffort || undefined, maxReActSteps: form.value.maxReActSteps, maxCostCny: Number(form.value.maxCostCny) > 0 ? Number(form.value.maxCostCny) : undefined },
    builtinToolIds: form.value.builtinToolIds, customToolIds: form.value.customToolIds,
    mcpToolMounts: form.value.mcpToolMounts,     skillIds: form.value.skillIds, subAgentIds: form.value.subAgentIds,
    ontologyIds: form.value.ontologyIds,
    knowledgeBaseIds: form.value.knowledgeBaseIds,
    category: form.value.category || '',
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
  try { await ElMessageBox.confirm(`删除智能体「${props.agent.name}」？`, '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' }); await agentStore.deleteAgent(props.agent.id); visible.value = false; emit('deleted', props.agent.id); ElMessage.success('已删除'); } catch {}
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
/* 模型候选池：多选行 + 首选标记 */
.pool-select-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.pool-first-tag { flex-shrink: 0; font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.publish-hint { font-size: var(--font-size-xs); color: var(--color-text-secondary); }

.prompt-wrap { width: 100%; display: flex; flex-direction: column; }
.kind-hint { margin-top: 4px; font-size: var(--font-size-xs); line-height: 1.5; color: var(--el-text-color-secondary); }
.prompt-copy { align-self: flex-start; margin-top: 2px; }

.type-selector { display: flex; gap: 8px; }
/* 头像选择器：自动格 + 分组 tab + 网格 */
.avatar-picker { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.avatar-picker-head { display: flex; align-items: center; gap: 10px; }
.avatar-picker-head .icon-cell { width: 56px; flex-shrink: 0; }
.avatar-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.avatar-tab {
  padding: 4px 10px; border-radius: 999px; cursor: pointer; font-family: inherit;
  font-size: 12px; border: 1px solid var(--glass-border); background: transparent;
  color: var(--color-text-secondary); transition: all 0.15s;
}
.avatar-tab:hover { color: var(--color-text); border-color: var(--color-primary); }
.avatar-tab.active { border-color: var(--color-primary); background: rgba(99,102,241,0.08); color: var(--color-primary); font-weight: 600; }
.icon-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px; width: 100%; max-height: 132px; overflow-y: auto; padding: 2px; }
.icon-picker::-webkit-scrollbar { width: 5px; }
.icon-picker::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }
.icon-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: 6px 2px; border-radius: 8px; cursor: pointer; font-family: inherit;
  border: 1.5px solid var(--glass-border); background: var(--glass-bg);
  color: var(--color-text-secondary); font-size: 10px; line-height: 1.2; transition: all 0.15s;
}
.icon-cell:hover { border-color: var(--color-primary); color: var(--color-text); }
.icon-cell-text { font-size: 15px; font-weight: 600; line-height: 1; }
.icon-cell.active { border-color: var(--color-primary); background: rgba(99,102,241,0.08); color: var(--color-primary); font-weight: 600; }
.image-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; width: 100%; max-height: 132px; overflow-y: auto; padding: 2px; }
.image-picker::-webkit-scrollbar { width: 5px; }
.image-picker::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }
.image-cell {
  aspect-ratio: 1; padding: 0; border-radius: 10px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; background: rgba(15,23,42,0.04); transition: border-color 0.15s, transform 0.15s;
}
.image-cell img { width: 100%; height: 100%; display: block; object-fit: cover; }
.image-cell:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 45%, transparent); }
.image-cell.active { border-color: var(--color-primary); }
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
.ont-mount-hint { font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-bottom: 8px; }
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
.kb-default-tag { font-size: 10px; font-weight: 700; color: var(--color-primary); margin-left: 2px; }

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
  /* ★ 补盲：ont-mount 双栏未收单列；mount-tabs 5 个 tab 不换行 */
  .ont-mount { grid-template-columns: 1fr; }
  .mount-tabs { flex-wrap: wrap; }
}
</style>
