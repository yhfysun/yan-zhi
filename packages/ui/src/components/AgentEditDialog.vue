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
                <div class="type-selector">
                  <div class="type-card" :class="{ active: form.type === 'harness' }" @click="form.type = 'harness'">
                    <div class="type-icon"><el-icon :size="18"><Connection /></el-icon></div>
                    <span>Harness · 挂载即用</span>
                  </div>
                  <div class="type-card" :class="{ active: form.type === 'workflow' }" @click="form.type = 'workflow'">
                    <div class="type-icon"><el-icon :size="18"><Share /></el-icon></div>
                    <span>Workflow · DAG编排</span>
                  </div>
                </div>
              </el-form-item>
              <el-form-item label="系统提示词">
                <el-input v-model="form.systemPrompt" type="textarea" :rows="4" placeholder="设定角色、语气、行为约束..." />
              </el-form-item>
              <el-form-item label="模型">
                <el-select v-model="form.modelId" placeholder="选择模型" filterable clearable style="width:100%">
                  <el-option-group v-for="g in modelGroups" :key="g.platformId" :label="g.platformName">
                    <el-option v-for="m in g.models" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                  </el-option-group>
                </el-select>
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
                <div class="param-head"><span class="param-label">最大循环</span><span class="param-val">{{ form.maxReActSteps }}</span></div>
                <el-slider v-model="form.maxReActSteps" :min="1" :max="30" :step="1" size="small" />
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
            </div>

            <div class="mount-body">
              <template v-if="mountTab === 'tools'">
                <div class="mount-group">
                  <div class="mount-label">内置工具</div>
                  <div class="chip-wrap">
                    <label v-for="t in builtinToolList" :key="t.name" class="chip" :class="{ on: form.builtinToolIds.includes(t.name) }">
                      <input type="checkbox" :value="t.name" v-model="form.builtinToolIds" hidden />{{ t.name }}
                    </label>
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
                <div class="chip-wrap">
                  <label v-for="sk in skillList" :key="sk.id" class="chip" :class="{ on: form.skillIds.includes(sk.id) }">
                    <input type="checkbox" :value="sk.id" v-model="form.skillIds" hidden />{{ sk.name }}
                  </label>
                </div>
              </template>
              <template v-else-if="mountTab === 'subAgents'">
                <div class="chip-wrap">
                  <label v-for="a in subAgentList" :key="a.id" class="chip" :class="{ on: form.subAgentIds.includes(a.id) }">
                    <input type="checkbox" :value="a.id" v-model="form.subAgentIds" hidden />{{ a.name }}
                  </label>
                </div>
              </template>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button v-if="isEdit&&!agent?.isDefault" type="danger" plain @click="handleDelete" style="margin-right:auto">删除</el-button>
      <el-button @click="visible=false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { User, EditPen, Cpu, Setting, Connection, Share, Files, Switch } from '@element-plus/icons-vue';
import type { Agent } from '@yan-zhi/shared';
import { useAgentStore, usePlatformStore, useMcpStore, useSkillStore, useToolsStore } from '../stores';

const props = defineProps<{ modelValue: boolean; agent?: Agent | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved', agentId: string): void; (e: 'deleted', agentId: string): void }>();

const agentStore = useAgentStore();
const platformStore = usePlatformStore();
const mcpStore = useMcpStore();
const skillStore = useSkillStore();
const toolsStore = useToolsStore();

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) });
const isEdit = computed(() => !!props.agent?.id);
const activeTab = ref('basic');
const mountTab = ref('tools');
const mcpExpanded = reactive<Record<string, boolean>>({});

const form = ref<any>({
  name: '', description: '', systemPrompt: '', modelId: '', type: 'harness',
  temperature: 0.7, maxTokens: 2048, topP: 1, frequencyPenalty: 0, presencePenalty: 0,
  reasoningEffort: '', maxReActSteps: 10,
  builtinToolIds: [], customToolIds: [], mcpToolMounts: [], skillIds: [], subAgentIds: [],
});

const builtinToolList = computed(() => toolsStore.builtinTools);
const customToolList = computed(() => toolsStore.customTools.filter((t: any) => t.enabled));
const mcpServerList = computed(() => mcpStore.servers);
const skillList = computed(() => skillStore.skills.filter((s: any) => s.enabled));
const subAgentList = computed(() => agentStore.agents.filter(a => a.id !== props.agent?.id));
const modelGroups = computed(() => {
  const enabled = platformStore.models.filter((m: any) => m.enabled);
  return platformStore.platforms.map((p: any) => ({ platformId: p.id, platformName: p.name, models: enabled.filter((m: any) => m.platformId === p.id) })).filter((g: any) => g.models.length > 0);
});
const checkedToolCount = computed(() => (form.value.builtinToolIds?.length || 0) + (form.value.customToolIds?.length || 0) + (form.value.mcpToolMounts?.length || 0));

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
    const a = props.agent;
    form.value = {
      name: a?.name || '', description: a?.description || '', systemPrompt: a?.systemPrompt || '',
      modelId: a?.modelId || '', type: a?.type || 'harness',
      temperature: a?.temperature ?? 0.7, maxTokens: a?.maxTokens ?? 2048, topP: a?.topP ?? 1,
      frequencyPenalty: a?.frequencyPenalty ?? 0, presencePenalty: a?.presencePenalty ?? 0,
      reasoningEffort: (a?.config as any)?.reasoningEffort || '', maxReActSteps: (a?.config as any)?.maxReActSteps ?? 10,
      builtinToolIds: a?.builtinToolIds ? [...a.builtinToolIds] : [],
      customToolIds: a?.customToolIds ? [...a.customToolIds] : [],
      mcpToolMounts: a?.mcpToolMounts ? [...a.mcpToolMounts] : [],
      skillIds: a?.skillIds ? [...a.skillIds] : [], subAgentIds: a?.subAgentIds ? [...a.subAgentIds] : [],
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
  };
  if (props.agent?.id) { await agentStore.updateAgent(props.agent.id, data); ElMessage.success('已更新'); visible.value = false; emit('saved', props.agent.id); }
  else { const id = await agentStore.createChatAgent(data); ElMessage.success('已创建'); visible.value = false; emit('saved', id); }
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
.agent-tabs :deep(.el-tabs__item) { font-size: 14px; font-weight: 500; padding: 0 16px; height: 38px; line-height: 38px; }
.agent-tabs { display: flex; flex-direction: column; min-height: 0; }
.agent-tabs :deep(.el-tabs__content) { flex: 0 1 auto; overflow: visible; }
.tab-inner { padding: 8px 4px 4px 0; }
.tab-inner::-webkit-scrollbar { width: 5px; }
.tab-inner::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }

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

.mount-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
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

.mount-body { overflow-y: auto; border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 14px; background: var(--glass-bg); max-height: 30vh; }
.mount-body::-webkit-scrollbar { width: 5px; }
.mount-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
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

@media (max-width: 767px) {
  .tab-inner { padding: 4px 2px 4px 0; }
  .type-selector { flex-direction: row; }
  .type-card { padding: 4px 8px; font-size: 12px; }
  .param-grid { grid-template-columns: 1fr; gap: 8px; }
  .param-item { padding: 8px 10px; }
  .mount-tab { padding: 6px 8px; font-size: 12px; }
}
</style>
