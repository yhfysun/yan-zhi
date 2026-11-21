<template>
  <section class="sector-panel" aria-labelledby="sector-panel-title">
    <header class="sector-head">
      <h2 id="sector-panel-title">市场动向</h2>
      <span class="sector-updated">{{ formatTime(snapshot?.updatedAt || 0) }}</span>
      <button
        type="button"
        class="sector-refresh"
        :disabled="loading"
        :aria-label="loading ? '正在刷新板块' : '刷新板块'"
        @click="emit('retry')"
      >
        <RefreshCw :size="15" :class="{ spinning: loading }" />
      </button>
    </header>

    <div v-if="loading && !snapshot" class="sector-loading" role="status">正在加载行业板块…</div>
    <div v-else-if="error && !snapshot" class="sector-error" role="status">
      <p>{{ error }}</p>
      <button type="button" @click="emit('retry')">重新加载</button>
    </div>

    <template v-else-if="snapshot">
      <div class="sector-columns">
        <div class="sector-col">
          <h3 class="sector-col-title up">领涨行业</h3>
          <button
            v-for="item in snapshot.leaders"
            :key="item.code"
            type="button"
            class="sector-row"
            @click="emit('select', item.code, item.name)"
          >
            <span class="sector-name">{{ item.name }}</span>
            <span class="sector-leader" v-if="item.leader">{{ item.leader }} {{ signedPercent(item.leaderChangePercent) }}</span>
            <strong class="sector-percent" :class="direction(item.changePercent)">{{ signedPercent(item.changePercent) }}</strong>
          </button>
        </div>
        <div class="sector-col">
          <h3 class="sector-col-title down">领跌行业</h3>
          <button
            v-for="item in snapshot.laggards"
            :key="item.code"
            type="button"
            class="sector-row"
            @click="emit('select', item.code, item.name)"
          >
            <span class="sector-name">{{ item.name }}</span>
            <span class="sector-leader" v-if="item.leader">{{ item.leader }} {{ signedPercent(item.leaderChangePercent) }}</span>
            <strong class="sector-percent" :class="direction(item.changePercent)">{{ signedPercent(item.changePercent) }}</strong>
          </button>
        </div>
      </div>
      <p class="sector-note">点按任一板块可查看板块 K 线 · 数据来源 {{ snapshot.source }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import type { SectorSnapshot } from '@yan-zhi/shared';

defineProps<{
  snapshot: SectorSnapshot | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (event: 'retry'): void;
  (event: 'select', code: string, name: string): void;
}>();

function direction(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
</script>
