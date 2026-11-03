<!--
  PageFrame.vue — 桌面应用统一页面骨架（2026-11-02）

  结构：固定页头（标题 + 说明 + 右侧操作）→ 固定工具条（搜索/筛选）→ 内容区自滚。
  目的：所有管理页共享同一副"不会整页上下滚"的框架，滚动时页头与工具条不动。

  用法：
    <PageFrame title="模型平台管理" subtitle="…">
      <template #actions>…右侧操作按钮…</template>
      <template #toolbar>…搜索/筛选工具条…</template>
      …内容…
    </PageFrame>

  两栏工作区（列表 + 详情）用 :scroll="false" + 内容内部各自滚动；
  全出血布局（贴边分栏）用 :pad="false"。
-->
<template>
  <section class="page-frame" :class="{ 'is-flush': !pad }" data-page-frame>
    <header v-if="title || subtitle || $slots.back || $slots.actions" class="pf-header">
      <div class="pf-heading">
        <slot name="back" />
        <div class="pf-text">
          <h2 v-if="title" class="pf-title">{{ title }}</h2>
          <p v-if="subtitle" class="pf-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="pf-actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="$slots.toolbar" class="pf-toolbar">
      <slot name="toolbar" />
    </div>

    <div class="pf-body" :class="{ 'no-scroll': !scroll, 'no-pad': !pad }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    /** 内容区是否自滚（默认 true）。false = 交给内部各栏自己滚（列表 + 详情）。 */
    scroll?: boolean;
    /** 内容区是否带页边距（默认 true）。false = 贴边（全出血分栏）。 */
    pad?: boolean;
  }>(),
  { title: '', subtitle: '', scroll: true, pad: true },
);
</script>

<style scoped>
.page-frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 页头：常驻，不参与滚动 ===== */
.pf-header {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 36px 12px;
}
.pf-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.pf-text { min-width: 0; }
.pf-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--color-text);
}
.pf-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
  overflow-wrap: anywhere;
}
.pf-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* ===== 工具条：常驻，不参与滚动 ===== */
.pf-toolbar {
  flex: 0 0 auto;
  padding: 0 36px 10px;
  min-width: 0;
}

/* ===== 内容区：唯一滚动容器 ===== */
.pf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 36px 28px;
}
.pf-body.no-scroll { overflow: hidden; }
.pf-body.no-pad { padding: 0; }

@media (max-width: 900px) {
  .pf-header { padding: 14px 16px 8px; flex-direction: column; gap: 10px; }
  .pf-actions { width: 100%; }
  .pf-toolbar { padding: 0 16px 8px; }
  .pf-body { padding: 0 16px 20px; }
  .pf-body.no-pad { padding: 0; }
}
</style>
