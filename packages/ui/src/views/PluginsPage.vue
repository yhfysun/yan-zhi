<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">插件管理</h2>
        <div class="page-sub">已安装插件的启停、配置与卸载</div>
      </div>
    </header>
    <PluginManager />
  </div>
</template>

<script setup lang="ts">
import PluginManager from '../components/plugin/PluginManager.vue';
</script>

<style scoped>
.plugin-manager {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
}
</style>
