<template>
  <section class="scheduled-page" aria-labelledby="scheduled-page-title">
    <header class="scheduled-page-head">
      <div>
        <span>自动化工作区</span>
        <h1 id="scheduled-page-title">定时任务</h1>
        <p>集中管理按时间触发的对话、工作流和 Runbook，不再挤在任务侧栏里。</p>
      </div>
    </header>

    <div class="scheduled-workspace">
      <nav class="scheduled-nav" aria-label="计划类型">
        <button
          type="button"
          :class="{ active: activeKind === 'scheduled' }"
          @click="activeKind = 'scheduled'"
        >
          <el-icon><Timer /></el-icon>
          <span><b>定时任务</b><small>按时间自动执行</small></span>
        </button>
        <button
          type="button"
          :class="{ active: activeKind === 'goal' }"
          @click="activeKind = 'goal'"
        >
          <el-icon><Flag /></el-icon>
          <span><b>目标计划</b><small>围绕目标持续复盘</small></span>
        </button>
      </nav>

      <div class="scheduled-main">
        <header class="scheduled-main-head">
          <div>
            <h2>{{ activeKind === 'scheduled' ? '执行计划' : '目标节奏' }}</h2>
            <p>
              {{ activeKind === 'scheduled'
                ? '查看启用状态、下次运行时间和最近一次结果。'
                : '设置目标周期、验收标准与并行上限。' }}
            </p>
          </div>
          <el-button
            v-if="activeKind === 'scheduled'"
            type="primary"
            @click="openScheduledCreate"
          >
            <el-icon><Plus /></el-icon>
            新建定时任务
          </el-button>
        </header>

        <div class="scheduled-content">
          <GoalSchedulePanel v-if="activeKind === 'goal'" />
          <ScheduledTaskDialog v-else ref="scheduledPanelRef" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Flag, Plus, Timer } from '@element-plus/icons-vue';
import GoalSchedulePanel from '../components/chat/GoalSchedulePanel.vue';
import ScheduledTaskDialog from '../components/chat/ScheduledTaskDialog.vue';

type PlanKind = 'scheduled' | 'goal';

const activeKind = ref<PlanKind>('scheduled');
const scheduledPanelRef = ref<InstanceType<typeof ScheduledTaskDialog> | null>(null);

function openScheduledCreate(): void {
  scheduledPanelRef.value?.openCreate();
}
</script>

<style scoped>
.scheduled-page {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding: 20px 24px 24px;
  background: var(--color-bg);
}

.scheduled-page-head {
  display: flex;
  width: min(1180px, 100%);
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin: 0 auto;
}

.scheduled-page-head > div {
  min-width: 0;
}

.scheduled-page-head span {
  display: block;
  margin-bottom: 4px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
}

.scheduled-page-head h1 {
  color: var(--color-text);
  font-size: 24px;
  line-height: 1.2;
}

.scheduled-page-head p {
  max-width: 680px;
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.scheduled-workspace {
  display: grid;
  width: min(1180px, 100%);
  min-height: 0;
  flex: 1;
  grid-template-columns: 220px minmax(0, 1fr);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.scheduled-nav {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-secondary);
}

.scheduled-nav button {
  display: flex;
  width: 100%;
  min-height: 56px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  text-align: left;
  cursor: pointer;
}

.scheduled-nav button:hover {
  background: var(--glass-bg-hover);
  color: var(--color-text);
}

.scheduled-nav button.active {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
  box-shadow: inset 3px 0 var(--color-primary);
}

.scheduled-nav button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.scheduled-nav b {
  font-size: 13px;
}

.scheduled-nav small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.scheduled-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.scheduled-main-head {
  display: flex;
  min-height: 68px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
}

.scheduled-main-head h2 {
  color: var(--color-text);
  font-size: 15px;
}

.scheduled-main-head p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.scheduled-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.scheduled-content :deep(.scheduled-task-panel),
.scheduled-content :deep(.goal-schedule-panel) {
  height: 100%;
  padding: 14px 16px 18px;
}

.scheduled-content :deep(.st-toolbar),
.scheduled-content :deep(.gsp-toolbar) {
  max-width: 620px;
}

.scheduled-content :deep(.st-form) {
  width: min(760px, 100%);
  margin: 0 auto;
}

.scheduled-content :deep(.st-form-footer) {
  width: min(760px, 100%);
  margin: 0 auto;
}

.scheduled-content :deep(.gsp-form) {
  width: min(820px, 100%);
  margin: 0 auto;
}

@media (max-width: 900px) {
  .scheduled-page {
    gap: 10px;
    padding: 12px;
  }

  .scheduled-page-head h1 {
    font-size: 20px;
  }

  .scheduled-page-head p {
    font-size: 12px;
  }

  .scheduled-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .scheduled-nav {
    flex-direction: row;
    padding: 6px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .scheduled-nav button {
    min-height: 44px;
    flex: 1;
  }

  .scheduled-nav small {
    display: none;
  }

  .scheduled-main-head {
    min-height: 58px;
    padding: 8px 10px;
  }

  .scheduled-content :deep(.scheduled-task-panel),
  .scheduled-content :deep(.goal-schedule-panel) {
    padding: 10px;
  }
}
</style>
