<template>
  <div class="task-plan-card">
    <div class="task-plan-head">
      <div class="task-plan-title">
        <el-icon><List /></el-icon>
        <span>{{ store.planTitle || '任务计划' }}</span>
      </div>
      <div class="task-plan-progress">
        <span class="task-plan-count">{{ doneCount }}/{{ steps.length }}</span>
        <el-progress
          :percentage="percent"
          :stroke-width="6"
          :show-text="false"
          :status="hasFailed ? 'exception' : undefined"
          class="task-plan-bar"
        />
      </div>
      <el-button text size="small" circle title="清除计划" @click="store.clearPlan()">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    <ul class="task-plan-steps">
      <li v-for="(s, i) in steps" :key="s.id" class="task-plan-step" :class="'status-' + s.status">
        <span class="step-no">{{ i + 1 }}</span>
        <span class="step-icon">
          <el-icon v-if="s.status === 'done'"><CircleCheck /></el-icon>
          <el-icon v-else-if="s.status === 'failed'"><CircleClose /></el-icon>
          <el-icon v-else-if="s.status === 'running'" class="is-loading"><Loading /></el-icon>
          <span v-else class="step-dot" />
        </span>
        <div class="step-body">
          <div class="step-title">{{ s.title }}</div>
          <div v-if="s.description" class="step-desc">{{ s.description }}</div>
          <div v-if="s.note" class="step-note">{{ s.note }}</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '../stores/chat';
import { CircleCheck, CircleClose, Loading, Close, List } from '@element-plus/icons-vue';

const store = useChatStore();
const steps = computed(() => store.planSteps);
const doneCount = computed(() => steps.value.filter((s) => s.status === 'done').length);
const percent = computed(() =>
  steps.value.length ? Math.round((doneCount.value / steps.value.length) * 100) : 0,
);
const hasFailed = computed(() => steps.value.some((s) => s.status === 'failed'));
</script>

<style scoped>
.task-plan-card {
  margin: 0 0 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}
.task-plan-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}
.task-plan-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}
.task-plan-progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.task-plan-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.task-plan-bar {
  flex: 1;
  max-width: 220px;
}
.task-plan-steps {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
}
.task-plan-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 6px;
  border-radius: 8px;
}
.task-plan-step + .task-plan-step {
  border-top: 1px dashed var(--el-border-color-lighter);
}
.step-no {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}
.step-icon {
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}
.step-icon .el-icon {
  font-size: 16px;
}
.status-done .step-icon { color: var(--el-color-success); }
.status-done .step-no { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.status-failed .step-icon { color: var(--el-color-danger); }
.status-failed .step-no { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.status-running .step-icon { color: var(--el-color-primary); }
.status-running .step-no { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.step-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid var(--el-border-color);
  box-sizing: border-box;
}
.step-body { min-width: 0; }
.step-title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}
.status-done .step-title { color: var(--el-text-color-regular); }
.status-pending .step-title { color: var(--el-text-color-secondary); }
.step-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  line-height: 1.4;
}
.step-note {
  font-size: 11px;
  color: var(--el-color-primary);
  margin-top: 2px;
  line-height: 1.4;
  word-break: break-all;
}
</style>
