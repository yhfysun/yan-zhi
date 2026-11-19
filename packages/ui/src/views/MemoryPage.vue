<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
        <div class="page-sub">五维记忆：用户画像 / 每日 / 会话 / 智能体 / 空间，对话中自动抽取与注入</div>
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
