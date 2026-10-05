<template>
  <!-- 四段式页面骨架（spec「移动端导航与页面骨架」/ Task 11.2）：
       页面头（返回 + 标题 + 页内操作）→ 可选分段 tab → 内容区 → 底部安全区。
       · show-header=false 时退化为纯内容壳（桌面端 / 弹窗内嵌用法，行为与旧 .page 一致）；
       · 内容区挂全局 .page 类：桌面 28/36 内边距、767px 14px、Capacitor 留白等全局规则自动继承；
       · tabs 插槽供后续页面把分段控件放到头部与内容之间（本次示范页未用，先留位）。 -->
  <div class="mps">
    <header v-if="showHeader" class="mps-header">
      <button v-if="back" type="button" class="mps-back" aria-label="返回" @click="goBack">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mps-title">{{ title }}</span>
      <div class="mps-actions"><slot name="actions" /></div>
    </header>
    <nav v-if="$slots.tabs" class="mps-tabs"><slot name="tabs" /></nav>
    <div class="mps-body page">
      <slot />
    </div>
    <div class="mps-safe" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    /** 显示左上返回按钮（二级页用） */
    back?: boolean;
    /** 是否渲染页面头；桌面端/弹窗内嵌传入 false，保持原布局 */
    showHeader?: boolean;
    /** 自定义返回行为（传入时替代默认的路由回退）：
     *  页内层级导航用 —— 如设置页「二级子页 → 返回首层分组」不离开 /settings 路由 */
    backHandler?: () => void;
  }>(),
  { title: '', back: false, showHeader: true },
);

const router = useRouter();

/** 返回：外部给了 backHandler 则交给外部（页内层级回退）；否则有历史（由其它页推入）则回退，
 *  直接落在骨架页（无历史）时兜底回任务页 */
function goBack() {
  if (props.backHandler) {
    props.backHandler();
    return;
  }
  const st = window.history.state as { back?: string } | null;
  if (st?.back) router.back();
  else void router.replace('/chat').catch(() => {});
}
</script>

<style scoped>
.mps {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.mps-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 8px 0 4px;
  /* 状态栏/刘海让位（Capacitor 端生效，桌面端 env 解析为 0） */
  padding-top: env(safe-area-inset-top, 0px);
  background: var(--el-bg-color, var(--color-surface));
  border-bottom: 1px solid var(--color-border);
}

.mps-back {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard);
}
.mps-back:active {
  background: var(--color-surface-hover);
}

.mps-title {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mps-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mps-tabs {
  flex-shrink: 0;
}

/* .mps-body 挂全局 .page 类：滚动与留白全部复用现有规则，页面无需自带 .page 根 */

.mps-safe {
  flex-shrink: 0;
  height: env(safe-area-inset-bottom, 0px);
}
</style>
