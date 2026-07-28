<template>
  <div class="page">
    <!-- 无 id → 商城首页；有 id → 子页面 -->
    <MarketplaceCards v-if="!route.params.id" />
    <LocalSkillMarket v-else-if="route.params.id === 'local'" />
    <RemoteSkillMarket v-else-if="isRemoteId(route.params.id)" :source-id="parseRemoteId(route.params.id as string)" />
    <div v-else class="invalid-page">
      <el-empty description="找不到该商城"><el-button @click="$router.push('/skills')">返回商城首页</el-button></el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import MarketplaceCards from './skill-market/MarketplaceCards.vue';
import LocalSkillMarket from './skill-market/LocalSkillMarket.vue';
import RemoteSkillMarket from './skill-market/RemoteSkillMarket.vue';

const route = useRoute();

function isRemoteId(id: string | string[]): boolean {
  const v = Array.isArray(id) ? id[0] : id;
  return typeof v === 'string' && v.startsWith('remote-');
}

function parseRemoteId(id: string): string {
  return id.replace('remote-', '');
}
</script>

<style scoped>
.page { min-height: 100%; }
.invalid-page { padding: 80px 0; text-align: center; }
</style>
