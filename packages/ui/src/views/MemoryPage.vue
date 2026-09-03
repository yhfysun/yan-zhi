<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
        <div class="page-sub">三层自动记忆：每日 / 会话 / 长期向量，对话中自动抽取与注入</div>
      </div>
    </header>
    <MemoryManage />
  </div>
</template>

<script setup lang="ts">
import MemoryManage from '../components/memory/MemoryManage.vue';
</script>

<style scoped>
.memory-manage {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
}
</style>
