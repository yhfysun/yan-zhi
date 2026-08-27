<template>
  <el-dialog v-model="showMount" title="挂载 MCP 工具" width="600px" class="mount-dialog">
    <div class="mount-body">
      <div v-if="mountableServers.length === 0" class="mount-empty">
        <el-empty description="暂无 MCP 服务，请先添加并连接服务" :image-size="80">
          <el-button type="primary" size="small" @click="showMount = false; $router.push('/mcp')">前往配置</el-button>
        </el-empty>
      </div>
      <template v-else>
        <el-input v-model="mountSearch" placeholder="搜索工具名称..." size="small" clearable :prefix-icon="Search" class="mount-search" />
        <div v-for="s in mountableServers" :key="s.id" class="mount-server-group">
          <div class="mount-server-header" @click="toggleServerCollapse(s.id)">
            <div class="mount-server-info">
              <el-icon :size="14" class="mount-collapse-icon" :class="{ collapsed: collapsedServers[s.id] }">
                <ArrowDown v-if="!collapsedServers[s.id]" /><ArrowRight v-else />
              </el-icon>
              <el-icon :size="14"><Connection /></el-icon>
              <span class="mount-server-name">{{ s.name }}</span>
              <el-tag v-if="s.status !== 'connected'" size="small" type="warning" effect="plain">离线</el-tag>
              <span class="mount-server-count">{{ (mcpStore.tools[s.id] || []).length }} 工具</span>
            </div>
            <el-button size="small" link type="primary" @click.stop="toggleAllTools(s.id)">
              {{ isAllToolsMounted(s.id) ? '取消全选' : '全选' }}
            </el-button>
          </div>
          <div v-show="!collapsedServers[s.id]" class="mount-tool-list">
            <div v-for="t in filteredTools(s.id)" :key="t.name" class="mount-tool-item">
              <div class="mount-tool-check" :class="{ checked: isToolMounted(s.id, t.name) }" @click="toggleMountTool(s.id, t.name)">
                <el-icon v-if="isToolMounted(s.id, t.name)"><Check /></el-icon>
              </div>
              <div class="mount-tool-info" @click="toggleMountTool(s.id, t.name)">
                <span class="mount-tool-name">
                  {{ t.name }}
                  <span v-if="t.alias" class="mount-tool-global-alias">[{{ t.alias }}]</span>
                </span>
                <span class="mount-tool-desc" :title="t.description">{{ t.description || '无描述' }}</span>
                <span v-if="t.remark" class="mount-tool-remark" :title="t.remark">{{ t.remark }}</span>
              </div>
              <input
                class="mount-tool-alias"
                :value="toolAliasMap[s.id]?.[t.name] || ''"
                placeholder="覆盖别名"
                @click.stop
                @input="(e: any) => setToolAlias(s.id, t.name, e.target.value)"
              />
            </div>
            <div v-if="filteredTools(s.id).length === 0" class="mount-no-match">无匹配工具</div>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="showMount = false">取消</el-button>
      <el-button type="primary" @click="saveMount">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Search, ArrowDown, ArrowRight, Connection, Check } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  showMount, mountableServers, mountSearch, mcpStore, toggleServerCollapse, collapsedServers,
  toggleAllTools, isAllToolsMounted, filteredTools, toggleMountTool, isToolMounted, toolAliasMap,
  setToolAlias, saveMount,
} = useChat();
</script>
