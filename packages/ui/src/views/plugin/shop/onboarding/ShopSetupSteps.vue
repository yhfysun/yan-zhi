<template>
  <div class="shop-setup-steps">
    <div
      class="shop-setup-progress"
      role="progressbar"
      aria-label="开店流程进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress.percent"
      :aria-valuetext="`${progress.completed} / ${progress.total} 已完成`"
    >
      <div class="shop-setup-progress-track">
        <span :style="{ width: `${progress.percent}%` }"></span>
      </div>
      <span class="shop-setup-progress-text">{{ progress.completed }} / {{ progress.total }} 已完成</span>
    </div>

    <ol class="shop-setup-list">
      <li
        v-for="(step, index) in progress.steps"
        :key="step.id"
        class="shop-setup-step"
        :class="`is-${step.state}`"
        :aria-current="step.state === 'active' ? 'step' : undefined"
      >
        <div class="shop-setup-step-mark" aria-hidden="true">
          <Check v-if="step.state === 'done'" :size="14" />
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div class="shop-setup-step-body">
          <div class="shop-setup-step-head">
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.summary }}</p>
            </div>
            <el-button
              v-if="step.id !== 'position' && step.id !== 'account' && step.id !== 'open'"
              size="small"
              text
              @click="emit('toggle-step', step.id, step.state !== 'done')"
            >
              {{ step.state === 'done' ? '重新打开' : '标记完成' }}
            </el-button>
          </div>
          <div v-if="step.state === 'active'" class="shop-setup-step-detail">
            <div>
              <span class="shop-setup-detail-label">你来</span>
              <p>{{ step.userTask }}</p>
            </div>
            <div>
              <span class="shop-setup-detail-label is-ai">AI 做</span>
              <p>{{ step.aiTask }}</p>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import type { ShopSetupProgress, ShopSetupStepId } from './shopOnboarding';

defineProps<{
  progress: ShopSetupProgress;
}>();

const emit = defineEmits<{
  (e: 'toggle-step', id: ShopSetupStepId, done: boolean): void;
}>();
</script>
