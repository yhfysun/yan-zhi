<template>
  <div
    v-if="supported"
    class="workspace-lead-switch"
    role="group"
    aria-label="工作方式"
  >
    <button
      type="button"
      class="workspace-lead-option"
      :class="{ active: currentLead === 'ai' }"
      :aria-pressed="currentLead === 'ai'"
      aria-label="AI 协作"
      title="AI 协作：由智能体推进任务"
      @click="pick('ai')"
    >
      <Sparkles :size="15" />
      <span>AI</span>
    </button>
    <button
      type="button"
      class="workspace-lead-option"
      :class="{ active: currentLead === 'human' }"
      :aria-pressed="currentLead === 'human'"
      aria-label="人工工作台"
      :title="humanHint"
      @click="pick('human')"
    >
      <UserRound :size="15" />
      <span>人工</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Sparkles, UserRound } from 'lucide-vue-next';
import {
  activeMode,
  leadOf,
  setLead,
  type AppMode,
  type LeadMode,
} from '../../stores/mode';
import { officePanel, setOfficePanel } from '../../stores/officeWorkbench';

const router = useRouter();

const SUPPORTED = new Set<AppMode>(['office', 'dev', 'ops', 'sec', 'wf', 'rpa', 'clip', 'shop', 'learning']);
const supported = computed(() => SUPPORTED.has(activeMode.value));
const currentLead = computed<LeadMode>(() => (
  activeMode.value === 'office'
    ? (officePanel.value === 'manual' ? 'human' : 'ai')
    : leadOf(activeMode.value)
));
const humanHint = computed(() => {
  if (activeMode.value === 'office') return '人工：直接编辑本机文件';
  if (activeMode.value === 'dev') return '人工：进入编辑器工作台';
  if (activeMode.value === 'clip') return '人工：进入时间轴工作台';
  if (activeMode.value === 'shop') return '人工：进入店铺运营工作台';
  if (activeMode.value === 'wf') return '人工：进入工作流运行台';
  if (activeMode.value === 'rpa') return '人工：进入自动化脚本工作台';
  if (activeMode.value === 'learning') return '人工：进入学习台';
  return '人工：进入命令与监控工作台';
});

async function pick(next: LeadMode): Promise<void> {
  if (next === currentLead.value) return;
  if (activeMode.value === 'office') {
    setOfficePanel(next === 'human' ? 'manual' : 'ai');
    await router.push(next === 'human' ? '/office' : '/chat');
    return;
  }
  setLead(activeMode.value, next);
}
</script>

<style scoped>
.workspace-lead-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-fill-color) 72%, transparent);
  -webkit-app-region: no-drag;
  pointer-events: auto;
}

.workspace-lead-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 24px;
  gap: 5px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease;
}

.workspace-lead-option:hover {
  color: var(--color-text);
  background: color-mix(in srgb, var(--el-bg-color) 78%, transparent);
}

.workspace-lead-option.active {
  color: var(--color-primary);
  background: var(--el-bg-color);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 12%, transparent);
}

.workspace-lead-option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
  outline-offset: 1px;
}

@media (max-width: 900px), (hover: none) {
  .workspace-lead-switch {
    height: 56px;
    padding: 3px;
    border-radius: 12px;
  }

  .workspace-lead-option {
    width: 48px;
    min-width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 9px;
  }

  .workspace-lead-option span {
    display: none;
  }
}
</style>
