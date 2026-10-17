<!--
  智能体选择器（openspec 8b.4–8b.9）
  - 替代原 el-dropdown：改用 el-popover（dropdown-menu 被 el-scrollbar 包裹会裁剪限高）
  - 按 config.mode 分组（办公/开发/运维/安全/工作流），当前模式分组默认展开
  - 搜索匹配 name + description；命中自动展开所在分组
  - 折叠态持久化 yz:agentGroups:collapsed；子智能体由 chatAgents 过滤
-->
<template>
  <el-popover
    trigger="click"
    placement="bottom-start"
    popper-class="agent-picker-popper"
    :width="360"
    @show="onShow"
  >
    <template #reference>
      <div class="agent-trigger" @click.stop>
        <span class="agent-trigger-avatar">
          <el-icon :size="14"><component :is="agentIconOf(agentStore.selectedAgent?.id, agentStore.selectedAgent?.name)" /></el-icon>
        </span>
        <span class="agent-trigger-name">{{ agentStore.selectedAgent?.name || '选择智能体' }}</span>
        <el-icon class="agent-trigger-caret"><ArrowDown /></el-icon>
      </div>
    </template>

    <div class="ap">
      <el-input
        v-model="query"
        size="small"
        placeholder="搜索智能体（名称 / 描述）"
        clearable
        class="ap-search"
      />
      <div class="ap-list">
        <div v-for="g in groups" :key="g.mode" class="ap-group">
          <div class="ap-group-head" @click="toggle(g.mode)">
            <span class="ap-group-label">{{ g.label }}</span>
            <span class="ap-count">{{ g.agents.length }}</span>
            <span class="ap-caret">{{ isCollapsed(g.mode) ? '▸' : '▾' }}</span>
          </div>
          <template v-if="!isCollapsed(g.mode)">
            <button
              v-for="ag in g.agents"
              :key="ag.id"
              type="button"
              class="ap-item"
              :class="{ active: ag.id === agentStore.selectedId }"
              @click="pick(ag.id)"
            >
              <span class="ap-avatar">
                <el-icon :size="16"><component :is="agentIconOf(ag.id, ag.name)" /></el-icon>
              </span>
              <span class="ap-info">
                <span class="ap-name">
                  <el-icon v-if="ag.isDefault" class="ap-lock"><Lock /></el-icon>
                  {{ ag.name }}
                </span>
                <span class="ap-desc">{{ ag.description || '未填写描述' }}</span>
              </span>
              <el-icon v-if="ag.id === agentStore.selectedId" class="ap-check"><Check /></el-icon>
            </button>
          </template>
        </div>
        <div v-if="!groups.length" class="ap-empty">没有匹配的智能体</div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, Check, Lock } from '@element-plus/icons-vue';
import { useAgentStore } from '../../stores/agent';
import { activeMode } from '../../stores/mode';
import { resolveAgentIcon as agentIconOf } from '../../utils/agentIcon';

const agentStore = useAgentStore();
const query = ref('');
const COLLAPSE_KEY = 'yz:agentGroups:collapsed';

function readStored(): Set<string> | null {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return null;
  }
}
/** null = 用户从未调整过 → 除当前模式分组外默认折叠 */
const collapsed = ref<Set<string> | null>(readStored());

/** AppMode → 智能体分组 mode */
const activeGroup = computed(() => (activeMode.value === 'wf' ? 'workflow' : activeMode.value));
const searching = computed(() => !!query.value.trim());

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  return agentStore.groupedChatAgents
    .map((g) => ({
      ...g,
      agents: q
        ? g.agents.filter((a) => `${a.name} ${a.description || ''}`.toLowerCase().includes(q))
        : g.agents,
    }))
    .filter((g) => g.agents.length > 0);
});

function isCollapsed(mode: string): boolean {
  if (searching.value) return false;
  if (collapsed.value) return collapsed.value.has(mode);
  return mode !== activeGroup.value;
}
function toggle(mode: string): void {
  const base = collapsed.value
    ? new Set(collapsed.value)
    : new Set(agentStore.groupedChatAgents.map((g) => g.mode).filter((m) => m !== activeGroup.value));
  if (base.has(mode)) base.delete(mode); else base.add(mode);
  collapsed.value = base;
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...base])); } catch { /* ignore */ }
}
function pick(id: string): void {
  agentStore.selectAgent(id);
}
function onShow(): void {
  void agentStore.ensureAgents();
}
</script>

<style scoped>
.ap { display: flex; flex-direction: column; gap: 8px; max-height: 420px; }
.ap-search :deep(.el-input__wrapper) { border-radius: 8px; }
.ap-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; }
.ap-group { display: flex; flex-direction: column; gap: 2px; }
.ap-group-head {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: 11.5px; color: var(--color-text-secondary); padding: 2px 4px;
}
.ap-group-label { font-weight: 600; }
.ap-count {
  font-size: 10.5px; padding: 0 5px; border-radius: 8px;
  background: var(--glass-bg-hover); color: var(--color-text-tertiary);
}
.ap-caret { margin-left: auto; font-size: 10px; }
.ap-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: 1px solid transparent; border-radius: 8px;
  background: transparent; text-align: left; cursor: pointer;
}
.ap-item:hover { background: var(--glass-bg-hover); }
.ap-item.active { background: color-mix(in srgb, var(--color-primary) 10%, transparent); border-color: color-mix(in srgb, var(--color-primary) 35%, transparent); }
.ap-avatar { flex: none; color: var(--color-primary); }
.ap-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ap-name { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--color-text); }
.ap-lock { font-size: 11px; color: var(--color-text-tertiary); }
.ap-desc {
  font-size: 11px; color: var(--color-text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ap-check { flex: none; color: var(--color-primary); }
.ap-empty { text-align: center; font-size: 11px; color: var(--color-text-tertiary); padding: 12px 0; }
</style>
