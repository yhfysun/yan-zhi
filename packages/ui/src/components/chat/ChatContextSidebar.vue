<template>
  <aside class="context-sidebar" :class="{ open: contextSidebarOpen }" aria-label="对话上下文栏">
    <header class="context-sidebar-header">
      <div class="context-sidebar-title">上下文</div>
      <el-button size="small" circle @click="toggleContextSidebar" aria-label="关闭上下文栏">
        <el-icon><Close /></el-icon>
      </el-button>
    </header>

    <div class="context-sidebar-body">
      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Collection /></el-icon>
          <span>知识库</span>
        </div>
        <el-empty v-if="mountedKnowledge.length === 0" description="暂无已挂载知识库" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="item in mountedKnowledge" :key="item.id" class="context-item">
            <el-icon><Collection /></el-icon>
            <span class="context-item-name">{{ item.name }}</span>
          </div>
        </div>
      </section>

      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Files /></el-icon>
          <span>已挂载 Skill</span>
        </div>
        <el-empty v-if="mountedSkills.length === 0" description="暂无已挂载 Skill" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="skill in mountedSkills" :key="skill.id" class="context-item">
            <el-icon><Files /></el-icon>
            <div class="context-item-copy">
              <span class="context-item-name">{{ skill.name }}</span>
              <span class="context-item-desc">{{ skill.description }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="context-section">
        <div class="context-section-heading">
          <el-icon><Connection /></el-icon>
          <span>已挂载工具</span>
        </div>
        <el-empty v-if="mountedTools.length === 0" description="暂无已挂载 MCP 工具" :image-size="46" />
        <div v-else class="context-item-list">
          <div v-for="tool in mountedTools" :key="tool.serverId + ':' + tool.name" class="context-item">
            <el-icon><Connection /></el-icon>
            <div class="context-item-copy">
              <span class="context-item-name">{{ tool.serverName }} / {{ tool.name }}</span>
              <span class="context-item-desc">{{ tool.description }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Close, Collection, Connection, Files } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import type { Skill } from '../../stores/skill';

const {
  contextSidebarOpen,
  toggleContextSidebar,
  store,
  mcpStore,
  mountedSkillIds,
  skillStore,
} = useChat();

const mountedKnowledge = computed<Array<{ id: string; name: string }>>(() => []);

const mountedSkills = computed(() =>
  mountedSkillIds.value
    .map((id) => skillStore.skills.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill)),
);

const mountedTools = computed(() =>
  store.mountedMcpServers.flatMap((serverId) => {
    const server = mcpStore.servers.find((item) => item.id === serverId);
    const tools = mcpStore.tools[serverId] || [];
    return tools.map((tool) => ({
      serverId,
      serverName: server?.name || serverId,
      name: tool.name,
      description: tool.description || '',
    }));
  }),
);
</script>

<style scoped>
.context-sidebar {
  flex: 0 0 0;
  min-width: 0;
  width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--glass-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--glass-filter, blur(14px));
  -webkit-backdrop-filter: var(--glass-filter, blur(14px));
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: flex-basis 0.24s ease, min-width 0.24s ease, width 0.24s ease, opacity 0.2s ease;
}

.context-sidebar.open {
  flex: 0 0 286px;
  min-width: 286px;
  width: 286px;
  opacity: 1;
  pointer-events: auto;
}

.context-sidebar-header {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
}

.context-sidebar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1e293b);
}

.context-sidebar-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px 20px;
}

.context-section + .context-section {
  margin-top: 18px;
}

.context-section-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary, #64748b);
  font-size: 12px;
  font-weight: 700;
}

.context-section-heading .el-icon {
  color: var(--el-color-primary, #7c3aed);
}

.context-item-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.context-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  border-radius: 9px;
  background: var(--el-fill-color-blank, rgba(255, 255, 255, 0.66));
  color: var(--el-text-color-primary, #1e293b);
}

.context-item > .el-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--el-text-color-secondary, #64748b);
}

.context-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-item-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-item-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary, #64748b);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 767px) {
  .context-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 250;
    width: min(320px, 86vw);
    min-width: 0;
    flex-basis: auto;
    transform: translateX(100%);
    transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    box-shadow: -18px 0 36px rgba(15, 23, 42, 0.18);
  }

  .context-sidebar.open {
    flex-basis: auto;
    min-width: min(320px, 86vw);
    width: min(320px, 86vw);
    transform: translateX(0);
  }
}
</style>
