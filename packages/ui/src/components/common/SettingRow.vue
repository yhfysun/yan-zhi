<template>
  <div class="setting-row">
    <label v-if="label" class="setting-row-label">{{ label }}</label>
    <div class="setting-row-body">
      <div class="setting-row-content">
        <slot />
        <span v-if="tip && tipAfter" class="setting-row-tip">{{ tip }}</span>
      </div>
      <p v-if="tip && !tipAfter" class="setting-row-tip setting-row-tip-block">{{ tip }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 设置行：label + 控件（默认插槽）+ 说明文字。
 * - 默认布局对齐 el-form-item（label 右对齐、宽 160px、控件在右侧内容区），
 *   用于替换 Settings 等页的 el-form-item 手写行；
 * - tipAfter：说明文字内联排在控件之后（如「开关 + 提示」），否则排在控件下方整行展示；
 * - 垂直布局（label 在上）等特殊形态由使用方 scoped 样式覆盖（见 EnvConfig.vue）。
 */
withDefaults(
  defineProps<{
    label: string;
    /** 说明文字 */
    tip?: string;
    /** true：说明内联跟在控件后；false（默认）：说明独占一行在控件下方 */
    tipAfter?: boolean;
  }>(),
  { tip: '', tipAfter: false },
);
</script>

<style scoped>
.setting-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 18px;
}
.setting-row-label {
  flex: none;
  width: var(--setting-row-label-width, 160px);
  padding-right: 12px;
  font-size: 14px;
  line-height: 32px;
  color: var(--el-text-color-regular);
  text-align: var(--setting-row-label-align, right);
  word-break: break-all;
}
.setting-row-body {
  flex: 1;
  min-width: 0;
}
.setting-row-content {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-height: 32px;
}
.setting-row-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.setting-row-tip-block {
  margin: 4px 0 0;
}
</style>
