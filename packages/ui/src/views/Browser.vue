<template>
  <div class="browser-page">
    <BrowserPanel />
  </div>
</template>

<script setup lang="ts">
import BrowserPanel from '../components/BrowserPanel.vue';
</script>

<style scoped>
.browser-page { flex: 1; display: flex; flex-direction: column; padding: 0; box-sizing: border-box; min-height: 0; }
</style>
