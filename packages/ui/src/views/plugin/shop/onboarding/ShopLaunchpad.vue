<template>
  <div class="shop-launchpad">
    <header class="shop-launch-head">
      <div class="shop-launch-title-wrap">
        <span class="shop-launch-flag"><Sparkles :size="13" /> 店铺运营 · 从零开店</span>
        <h1>{{ projectTitle || '从 0 开一家能卖的店' }}</h1>
        <div class="shop-launch-context" aria-label="当前开店上下文">
          <span>{{ platformLabel }}</span>
          <i aria-hidden="true"></i>
          <span>{{ profile.market || '市场待确认' }}</span>
          <i aria-hidden="true"></i>
          <span>{{ profile.category || '品类待确认' }}</span>
        </div>
        <p>先定经营口径，AI 会据此查规则、选品算账并准备 Listing。登录与付款仍由你完成。</p>
      </div>
      <div class="shop-launch-score">
        <strong>{{ progress.percent }}%</strong>
        <span>开店准备度</span>
      </div>
    </header>

    <div class="shop-launch-grid">
      <section class="shop-launch-flow" aria-labelledby="shop-launch-flow-title">
        <div class="shop-launch-section-head">
          <div>
            <span class="shop-setup-kicker">六步推进</span>
            <h2 id="shop-launch-flow-title">从没店铺到首单</h2>
          </div>
          <el-button type="primary" :icon="ArrowRight" @click="emit('start')">AI 按当前资料继续</el-button>
        </div>
        <ShopSetupSteps :progress="progress" @toggle-step="onToggleStep" />
        <div class="shop-launch-flow-actions">
          <div>
            <strong>{{ progress.nextStep?.title || '开店流程已完成' }}</strong>
            <p>{{ progress.nextStep?.summary || '接下来转入订单、库存、广告和复盘。' }}</p>
          </div>
          <el-button v-if="hasConnection" plain :icon="Database" @click="emit('create-connection')">
            添加经营资源
          </el-button>
          <el-button v-else plain :icon="Store" @click="emit('create-connection')">
            已有店铺，先接入数据
          </el-button>
        </div>
      </section>

      <ShopSetupForm :profile="profile" @update:profile="emit('update:profile', $event)" />
    </div>

    <section class="shop-launch-actions" aria-labelledby="shop-launch-actions-title">
      <div class="shop-launch-section-head">
        <div>
          <span class="shop-setup-kicker">直接派活</span>
          <h2 id="shop-launch-actions-title">让 AI 从具体任务开始</h2>
        </div>
        <span class="shop-launch-actions-note">会带上已填写的信息，缺什么只问一次</span>
      </div>
      <div class="shop-launch-action-list">
        <button
          v-for="item in quickActions"
          :key="item.action"
          type="button"
          class="shop-launch-action"
          @click="emit('quick-action', item.action)"
        >
          <span class="shop-launch-action-icon"><component :is="item.icon" :size="16" /></span>
          <span class="shop-launch-action-copy">
            <strong>{{ item.title }}</strong>
            <span>{{ item.detail }}</span>
          </span>
          <ArrowRight :size="14" class="shop-launch-action-arrow" />
        </button>
      </div>
    </section>

    <footer class="shop-launch-boundary">
      <ShieldCheck :size="16" />
      <p>
        AI 可以打开官方后台、读取公开页面、计算利润、生成变更单和指引填写；
        <strong>账号密码、验证码、支付密码和最终资金确认必须由你本人操作。</strong>
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  ArrowRight,
  Boxes,
  Compass,
  Database,
  PackagePlus,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-vue-next';
import ShopSetupForm from './ShopSetupForm.vue';
import ShopSetupSteps from './ShopSetupSteps.vue';
import {
  SHOP_PLATFORM_OPTIONS,
  type ShopQuickAction,
  type ShopSetupProfile,
  type ShopSetupProgress,
  type ShopSetupStepId,
} from './shopOnboarding';

const props = defineProps<{
  projectTitle: string;
  profile: ShopSetupProfile;
  progress: ShopSetupProgress;
  hasConnection: boolean;
}>();

const platformLabel = computed(() =>
  SHOP_PLATFORM_OPTIONS.find((item) => item.value === props.profile.platform)?.label
  || '平台待选择');

const emit = defineEmits<{
  (e: 'update:profile', value: ShopSetupProfile): void;
  (e: 'start'): void;
  (e: 'quick-action', action: ShopQuickAction): void;
  (e: 'toggle-step', id: ShopSetupStepId, done: boolean): void;
  (e: 'create-connection'): void;
}>();

const quickActions: Array<{
  action: ShopQuickAction;
  title: string;
  detail: string;
  icon: Component;
}> = [
  { action: 'platform', title: '比较平台与市场', detail: '启动成本、流量逻辑、资质门槛', icon: Compass },
  { action: 'selection', title: '开始选品验证', detail: '竞品、同款匹配、利润测算', icon: SearchCheck },
  { action: 'sourcing', title: '寻找 1688 货源', detail: '阶梯价、MOQ、供货与侵权筛查', icon: Boxes },
  { action: 'listing', title: '生成上架 Listing', detail: '标题、卖点、图片需求、SKU', icon: PackagePlus },
  { action: 'launch', title: '检查首单阻塞项', detail: '账号、资质、定价、履约、售后', icon: Rocket },
];

function onToggleStep(id: ShopSetupStepId, done: boolean): void {
  emit('toggle-step', id, done);
}
</script>
