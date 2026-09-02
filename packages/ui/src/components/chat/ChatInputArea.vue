<template>
  <div class="input-area">
    <div class="input-box" :class="{ focused: inputFocused }">

      <div class="input-agent-bar">
        <div class="minimal-select agent-switch" @click.stop>
          <el-select v-model="agentStore.selectedId" placeholder="选择智能体" size="small" popper-class="minimal-popper" @change="onAgentSwitch">
            <el-option
              v-for="ag in agentStore.agents"
              :key="ag.id"
              :label="ag.name"
              :value="ag.id"
            >
              <span style="display:flex;align-items:center;gap:6px">
                <el-icon v-if="ag.isDefault" style="font-size:12px"><Lock /></el-icon>
                <span>{{ ag.name }}</span>
              </span>
            </el-option>
          </el-select>
        </div>
        <el-tooltip content="编辑当前智能体" placement="top">
          <el-button size="small" circle class="agent-edit-btn" @click="openEditAgent(agentStore.selectedAgent)">
            <el-icon><EditPen /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <el-input
        ref="inputRef"
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 12 }"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        @keydown.enter.exact.prevent="store.streaming ? null : send()"
        :disabled="store.streaming"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
        class="input-textarea"
      />
      <div class="input-toolbar">
        <div class="toolbar-left">
          <el-tooltip content="上传文件" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="triggerFileUpload">
              <el-icon><UploadFilled /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="workspaceDir || '设置工作目录'" placement="top">
            <el-button size="small" circle class="ctx-btn" :class="{ 'is-active': hasWorkspaceDir }" @click="showWorkspaceDir = true">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="MCP 工具" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="showMount = true">
              <el-icon><Connection /></el-icon>
              <span v-if="store.mountedMcpServers.length" class="btn-badge">{{ store.mountedMcpServers.length }}</span>
            </el-button>
          </el-tooltip>
          <el-tooltip content="Skill" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="showSkills = true">
              <el-icon><Files /></el-icon>
              <span v-if="mountedSkillIds.length" class="btn-badge">{{ mountedSkillIds.length }}</span>
            </el-button>
          </el-tooltip>

        </div>

        <div class="toolbar-mobile-selects">
          <el-popover placement="top" trigger="click" :width="220" :show-arrow="false">
            <template #reference>
              <el-button size="small" circle>
                <el-icon><User /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list">
              <div
                v-for="ag in agentStore.agents"
                :key="ag.id"
                class="pop-select-item"
                :class="{ active: ag.id === agentStore.selectedId }"
                @click="onAgentSwitch(ag.id); agentStore.selectAgent(ag.id)"
              >
                <el-icon v-if="ag.isDefault" style="font-size:12px"><Lock /></el-icon>
                <span>{{ ag.name }}</span>
              </div>
            </div>
          </el-popover>

          <el-tooltip content="编辑当前智能体" placement="top">
            <el-button size="small" circle @click="openEditAgent(agentStore.selectedAgent)">
              <el-icon><EditPen /></el-icon>
            </el-button>
          </el-tooltip>

          <el-popover placement="top" trigger="click" :width="240" :show-arrow="false">
            <template #reference>
              <el-button size="small" circle>
                <el-icon><Cpu /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list">
              <template v-for="g in modelGroups" :key="g.platformId">
                <div class="pop-select-label">{{ g.platformName }}</div>
                <div
                  v-for="m in g.models"
                  :key="m.id"
                  class="pop-select-item"
                  :class="{ active: m.id === selectedModelId }"
                  @click="onModelChange(m.id)"
                >
                  <span>{{ m.alias || m.modelId }}</span>
                </div>
              </template>
            </div>
          </el-popover>
        </div>

        <div class="toolbar-right">
          <el-tooltip content="配置模型平台" placement="top">
            <el-button size="small" circle @click="openPlatformConfig">
              <el-icon><Setting /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="新建任务" placement="top">
            <el-button size="small" circle @click="startNewChat()">
              <el-icon><Plus /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="store.streaming ? '终止 (停止生成)' : '发送 (Enter)'" placement="top">
            <span>
              <el-button v-if="!store.streaming" type="primary" :icon="Promotion" :disabled="(!input.trim() && uploadedFiles.length === 0) || !selectedModelId" @click="send" circle class="send-btn" />
              <el-button v-else type="danger" :icon="Close" @click="stopChat" circle class="send-btn stop-btn" />
            </span>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div v-if="uploadedFiles.length > 0" class="file-chips">
      <div v-for="(f, idx) in uploadedFiles" :key="idx" class="file-chip">
        <span class="file-chip-icon">📄</span>
        <span class="file-chip-name">{{ f.name }}</span>
        <span class="file-chip-size">{{ formatSize(f.size) }}</span>
        <el-button size="small" link class="file-chip-remove" @click="removeFile(idx)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <input ref="fileInputRef" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.vue,.html,.css,.xml,.yaml,.yml,.log,.doc,.docx,.xlsx,.pptx,.zip" style="display:none" @change="handleFileChange" />

  </div>
</template>

<script setup lang="ts">
import {
  FolderOpened, ArrowDown, Connection, Files, UploadFilled, User, EditPen, Cpu, Setting, Plus,
  Promotion, Close, Lock,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  inputFocused, workspaceDir, hasWorkspaceDir, clearWorkspaceDir, showWorkspaceDir, showMount, store, showSkills, mountedSkillIds,
  triggerFileUpload, input, send, agentStore, onAgentSwitch, openEditAgent, modelGroups,
  selectedModelId, onModelChange, openPlatformConfig, startNewChat, uploadedFiles, stopChat,
  formatSize, removeFile, fileInputRef, handleFileChange,
} = useChat();
</script>
