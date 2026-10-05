<template>
  <div class="status-action-bar">
    <slot :testing="testing" />
    <span v-if="status" class="status-action-text" :class="statusType">{{ status }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 弹窗内「操作按钮 + 状态反馈」横条（虚线分隔、状态文案右对齐）。
 * 抽自 Models.vue 的 .dialog-actions-bar / .form-status，供 Models、McpPanel 等复用。
 * 按钮放默认插槽（作用域透出 testing 便于按钮联动 loading）；
 * status 非空时右侧渲染 ok(绿)/err(红) 状态文案。
 */
withDefaults(
  defineProps<{
    /** 状态提示文案（测试/拉取结果等） */
    status?: string;
    /** 状态语义色：ok=成功色，err=危险色 */
    statusType?: 'ok' | 'err';
    /** 测试类操作进行中（经插槽作用域透出） */
    testing?: boolean;
  }>(),
  { status: '', statusType: 'ok', testing: false },
);
</script>

<style scoped>
.status-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0 12px;
  border-top: 1px dashed var(--color-border-light);
  margin-top: 8px;
}
.status-action-text {
  font-size: 12px;
  margin-left: auto;
}
.status-action-text.ok {
  color: var(--el-color-success);
}
.status-action-text.err {
  color: var(--el-color-danger);
}
@media (max-width: 767px) {
  .status-action-bar {
    flex-direction: row;
    gap: 6px;
    padding: 6px 0 10px;
  }
  .status-action-bar ::v-slotted(.el-button) {
    flex: 1;
    justify-content: center;
    white-space: nowrap;
    font-size: 13px;
    padding: 8px 6px;
  }
}
</style>
