<template>
  <PageFrame title="插件管理" subtitle="已安装插件的启停、配置与卸载" :scroll="false" :pad="false">
    <PluginManager />
  </PageFrame>
</template>

<script setup lang="ts">
import PageFrame from '../components/common/PageFrame.vue';
import PluginManager from '../components/plugin/PluginManager.vue';
</script>
