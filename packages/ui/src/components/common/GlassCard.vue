<template>
  <div class="gc" :class="{ 'is-disabled': disabled }" :title="tooltip">
    <header v-if="title || $slots.icon || tags?.length" class="gc-head">
      <div v-if="$slots.icon" class="gc-icon"><slot name="icon" /></div>
      <div class="gc-head-main">
        <div class="gc-title-row">
          <span v-if="title" class="gc-title" :title="title">{{ title }}</span>
          <slot name="badge" />
        </div>
        <div v-if="tags?.length" class="gc-tags">
          <el-tag v-for="t in tags" :key="t" size="small" type="info" effect="plain">{{ t }}</el-tag>
        </div>
      </div>
    </header>
    <!-- 描述区始终占位（固定两行高）：保证同排卡片无论有无描述、描述长短都等高（2026-10-04 用户要求） -->
    <p class="gc-desc" :title="description || undefined">{{ description || '' }}</p>
    <div v-if="$slots.default" class="gc-body"><slot /></div>
    <footer v-if="$slots.foot || $slots.actions" class="gc-foot">
      <div v-if="$slots.foot" class="gc-foot-main"><slot name="foot" /></div>
      <!-- 卡内操作区阻断冒泡：整卡点击（如查看详情）不应被按钮触发 -->
      <div v-if="$slots.actions" class="gc-actions" @click.stop><slot name="actions" /></div>
    </footer>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 卡片标题（名称） */
  title?: string;
  /** 描述文本（两行截断） */
  description?: string;
  /** 简单文本标签组；复杂 tag 用 badge 插槽 */
  tags?: string[];
  /** 置灰态（如工具被停用） */
  disabled?: boolean;
  /** 整卡原生 tooltip（区别于 title 文本） */
  tooltip?: string;
}>();
</script>

<style scoped>
/* 玻璃卡片：三段结构（头 / 描述或自定义体 / 底部操作）。
   hover 上浮统一走 --shadow-1；皮肤模式由 skin.css 的 .gc 规则接管底图。 */
.gc {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 网格子项默认 min-width:auto → 长 id/描述会撑破列，显式置 0 才允许真收缩 */
  min-width: 0;
  /* 同排等高：由 CardGrid 的 align-items:stretch 拉满，height:100% 兜底兼容非网格容器；
     foot 的 margin-top:auto 把操作区沉底，描述区固定两行占位，不会因等高出现错位 */
  height: 100%;
  box-sizing: border-box;
}
.gc:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-1);
  border-color: var(--glass-border-strong);
}
.gc.is-disabled { opacity: 0.5; }

.gc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.gc-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.gc-head-main { flex: 1; min-width: 0; }
.gc-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.gc-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gc-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.gc-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  /* 固定两行高度：无描述/短描述也占位，同排卡片描述区严格对齐 */
  min-height: 3em;
}
.gc-body { min-width: 0; flex: 1 1 auto; }
.gc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}
.gc-foot-main { min-width: 0; }
.gc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

/* 底部提示文案（.hint）：默认弱化，整卡 hover 时点亮为主色 */
.gc .gc-foot :deep(.hint) { opacity: 0.65; transition: opacity 0.15s; }
.gc:hover .gc-foot :deep(.hint) { opacity: 1; color: var(--color-primary); }
</style>
