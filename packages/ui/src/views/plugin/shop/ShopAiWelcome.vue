<template>
  <section class="shop-ai-welcome" aria-labelledby="shop-ai-welcome-title">
    <div class="shop-ai-welcome-head">
      <span class="shop-ai-welcome-icon" aria-hidden="true"><Sparkles :size="18" /></span>
      <div>
        <h2 id="shop-ai-welcome-title">{{ projectTitle ? '继续推进当前店铺' : '从零开一家能卖的店' }}</h2>
        <p>结合已保存资料继续，缺什么 AI 只问一次。</p>
      </div>
    </div>

    <div class="shop-ai-welcome-context" aria-label="当前开店上下文">
      <span class="shop-ai-welcome-model" title="本次任务使用的模型">{{ modelLabel }}</span>
      <span>{{ platformLabel }}</span>
      <span v-if="profile.market.trim()">{{ profile.market }}</span>
      <span v-if="profile.category.trim()">{{ profile.category }}</span>
      <span>{{ progress.percent }}% 准备度</span>
    </div>

    <div class="shop-ai-welcome-actions">
      <button type="button" class="shop-ai-welcome-action" @click="emit('start')">
        <span class="shop-ai-welcome-action-icon"><Sparkles :size="15" /></span>
        <span class="shop-ai-welcome-action-copy">
          <strong>继续开店</strong>
          <span>{{ progress.nextStep?.title || '按当前资料推进下一阶段' }}</span>
        </span>
        <ArrowRight :size="14" class="shop-ai-welcome-action-arrow" />
      </button>
      <button
        type="button"
        class="shop-ai-welcome-action"
        @click="emit('quick-action', 'selection')"
      >
        <span class="shop-ai-welcome-action-icon"><SearchCheck :size="15" /></span>
        <span class="shop-ai-welcome-action-copy">
          <strong>选品与利润</strong>
          <span>竞品、货源、同款匹配和利润测算</span>
        </span>
        <ArrowRight :size="14" class="shop-ai-welcome-action-arrow" />
      </button>
      <button
        type="button"
        class="shop-ai-welcome-action"
        @click="emit('quick-action', 'launch')"
      >
        <span class="shop-ai-welcome-action-icon"><Rocket :size="15" /></span>
        <span class="shop-ai-welcome-action-copy">
          <strong>检查首单阻塞</strong>
          <span>账号、资质、定价、履约和售后逐项核对</span>
        </span>
        <ArrowRight :size="14" class="shop-ai-welcome-action-arrow" />
      </button>
    </div>

    <p class="shop-ai-welcome-foot">也可以直接在下方描述你要处理的店铺任务。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Rocket, SearchCheck, Sparkles } from 'lucide-vue-next';
import {
  SHOP_PLATFORM_OPTIONS,
  type ShopQuickAction,
  type ShopSetupProfile,
  type ShopSetupProgress,
} from './onboarding/shopOnboarding';

const props = defineProps<{
  projectTitle: string;
  profile: ShopSetupProfile;
  progress: ShopSetupProgress;
  modelLabel: string;
}>();

const emit = defineEmits<{
  (e: 'start'): void;
  (e: 'quick-action', action: ShopQuickAction): void;
}>();

const platformLabel = computed(() =>
  SHOP_PLATFORM_OPTIONS.find((item) => item.value === props.profile.platform)?.label
  || '平台待选择',
);
</script>

<style scoped>
.shop-ai-welcome {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  max-width: 620px;
  margin: 0 auto;
  padding: 24px 18px 72px;
}

.shop-ai-welcome-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.shop-ai-welcome-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 24%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 9%, var(--el-bg-color));
  color: var(--shop-accent, var(--el-color-primary));
}

.shop-ai-welcome h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 18px;
  line-height: 1.35;
  letter-spacing: 0;
}

.shop-ai-welcome-head p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.shop-ai-welcome-context {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 14px 0 12px;
}

.shop-ai-welcome-context span {
  padding: 3px 7px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 5px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1.4;
}

.shop-ai-welcome-context .shop-ai-welcome-model {
  border-color: color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 22%, var(--el-border-color-lighter));
  color: var(--shop-accent, var(--el-color-primary));
}

.shop-ai-welcome-actions {
  display: grid;
  gap: 6px;
}

.shop-ai-welcome-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 11px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.shop-ai-welcome-action:hover {
  border-color: color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 38%, var(--el-border-color));
  background: color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 4%, var(--el-bg-color));
}

.shop-ai-welcome-action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 55%, transparent);
  outline-offset: 1px;
}

.shop-ai-welcome-action-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--shop-accent, var(--el-color-primary)) 8%, var(--el-fill-color-lighter));
  color: var(--shop-accent, var(--el-color-primary));
}

.shop-ai-welcome-action-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.shop-ai-welcome-action-copy strong {
  font-size: 12px;
  font-weight: 600;
}

.shop-ai-welcome-action-copy span {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shop-ai-welcome-action-arrow {
  flex: none;
  color: var(--el-text-color-placeholder);
}

.shop-ai-welcome-foot {
  margin: 11px 0 0;
  color: var(--el-text-color-placeholder);
  font-size: 10px;
  line-height: 1.5;
  text-align: center;
}

@media (max-width: 720px) {
  .shop-ai-welcome {
    justify-content: flex-start;
    padding: 18px 12px 56px;
  }
}
</style>
