<template>
  <router-link v-if="server" to="/mcp" class="mcp-server-picker">
    <el-icon :size="16"><Connection /></el-icon>
    <span class="mcp-server-name">{{ server.name }}</span>
    <span v-if="showToolsCount" class="mcp-server-count">{{ toolCount }} 工具</span>
  </router-link>
  <span v-else class="mcp-server-picker missing">
    <el-icon :size="16"><Connection /></el-icon>
    <span class="mcp-server-name">{{ serverId }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Connection } from '@element-plus/icons-vue';
import { useMcpStore } from '../stores';

const props = defineProps<{
  serverId: string;
  showToolsCount?: boolean;
}>();

const mcpStore = useMcpStore();
const server = computed(() => mcpStore.servers.find(s => s.id === props.serverId));
const toolCount = computed(() => (mcpStore.tools[props.serverId] || []).length);
</script>

<style scoped>
.mcp-server-picker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 8px 11px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
  color: var(--color-text);
  text-decoration: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.mcp-server-picker:hover {
  border-color: var(--glass-border-strong);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}
.mcp-server-picker :deep(.el-icon) {
  color: var(--color-primary);
  flex-shrink: 0;
}
.mcp-server-picker.missing {
  color: var(--color-text-secondary);
  cursor: default;
}
.mcp-server-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.mcp-server-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-secondary);
}
</style>
