<template>
  <section class="publish-page" aria-labelledby="publish-page-title">
    <header class="publish-page-head">
      <div>
        <span>发布工作区</span>
        <h1 id="publish-page-title">发布队列</h1>
        <p>集中审核模型提交的内容，确认后再派发发布任务。侧栏只保留入口。</p>
      </div>
    </header>

    <div class="publish-workspace">
      <div class="publish-workspace-head">
        <div>
          <el-icon :size="18"><Promotion /></el-icon>
          <span><b>人工确认</b><small>发布动作仍由你批准</small></span>
        </div>
        <span class="publish-policy">待确认 → 已确认 → 派发发布任务</span>
      </div>
      <div class="publish-content">
        <PublishQueueTab />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Promotion } from '@element-plus/icons-vue';
import PublishQueueTab from '../components/chat/PublishQueueTab.vue';

</script>

<style scoped>
.publish-page {
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

.publish-page-head {
  display: flex;
  width: min(1180px, 100%);
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin: 0 auto;
}

.publish-page-head > div {
  min-width: 0;
}

.publish-page-head span {
  display: block;
  margin-bottom: 4px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
}

.publish-page-head h1 {
  color: var(--color-text);
  font-size: 24px;
  line-height: 1.2;
}

.publish-page-head p {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.publish-workspace {
  display: flex;
  width: min(1180px, 100%);
  min-height: 0;
  flex: 1;
  flex-direction: column;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.publish-workspace-head {
  display: flex;
  min-height: 62px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
}

.publish-workspace-head > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.publish-workspace-head > div > span b,
.publish-workspace-head > div > span small {
  display: block;
}

.publish-workspace-head b {
  color: var(--color-text);
  font-size: 13px;
}

.publish-workspace-head small,
.publish-policy {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.publish-content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.publish-content :deep(.pq-tab) {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
}

.publish-content :deep(.pq-summary),
.publish-content :deep(.pq-empty) {
  grid-column: 1 / -1;
}

.publish-content :deep(.pq-item) {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
}

.publish-content :deep(.pq-title) {
  white-space: normal;
}

@media (max-width: 900px) {
  .publish-page {
    gap: 10px;
    padding: 12px;
  }

  .publish-page-head h1 {
    font-size: 20px;
  }

  .publish-page-head p {
    font-size: 12px;
  }

  .publish-policy {
    display: none;
  }

  .publish-content :deep(.pq-tab) {
    grid-template-columns: minmax(0, 1fr);
    padding: 10px;
  }
}
</style>
