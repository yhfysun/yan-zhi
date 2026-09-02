<template>
  <el-dialog v-model="snapshotDialog" title="查看提示词" width="780px" class="snapshot-dialog">
    <el-tabs v-model="snapshotActiveTab" type="card">
      <el-tab-pane v-for="s in currentSnapshots" :key="s.id" :label="s.label" :name="s.id">
        <pre class="snapshot-body">{{ s.content }}</pre>
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="currentSnapshots.length === 0" description="没有找到提示词数据" :image-size="80" />
  </el-dialog>

  <AgentEditDialog v-model="showAgentEdit" :agent="editingAgent" @saved="onAgentSaved" @deleted="onAgentDeleted" />

  <WorkspaceDirDialog v-model="showWorkspaceDir" :current-path="workspaceDir" @selected="onWorkspaceDirSelected" />

  <el-dialog

    v-model="platformConfigDialogVisible"
    :title="platformConfigEditId ? '编辑模型平台' : '配置模型平台'"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="platform-config-dialog"
    @close="onPlatformConfigClose"
  >
    <el-form label-width="96px" class="platform-config-form">
      <el-form-item label="平台名称">
        <el-input v-model="platformConfigForm.name" placeholder="如：OpenAI / DeepSeek" />
      </el-form-item>
      <el-form-item label="协议">
        <el-select v-model="platformConfigForm.protocol">
          <el-option label="OpenAI" value="openai" />
          <el-option label="Anthropic" value="anthropic" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </el-form-item>
      <el-form-item label="API URL">
        <el-input v-model="platformConfigForm.apiUrl" placeholder="https://api.openai.com" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="platformConfigForm.apiKey" type="password" show-password :placeholder="platformConfigEditId ? '留空则不修改' : 'sk-...'" />
      </el-form-item>
      <template v-if="!platformConfigEditId">
        <el-form-item label="模型 ID">
          <el-input v-model="platformConfigForm.modelId" placeholder="如：gpt-4o-mini / deepseek-chat" />
        </el-form-item>
        <el-form-item label="模型别名">
          <el-input v-model="platformConfigForm.alias" placeholder="可选，展示在模型列表中的名称" />
        </el-form-item>
        <el-form-item label="上下文窗口">
          <el-input-number v-model="platformConfigForm.contextWindow" :min="1024" :max="1000000" :step="1024" />
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="onPlatformConfigCancel">取消</el-button>
      <el-button type="primary" :loading="platformConfigSaving" @click="onPlatformConfigSubmit">{{ platformConfigEditId ? '保存' : '保存并创建' }}</el-button>
    </template>
  </el-dialog>

  <DistillDialog v-model:visible="showDistill" :messages="distillMessages" />
</template>

<script setup lang="ts">
import { useChat } from '../../composables/chat/useChat';
import AgentEditDialog from '../AgentEditDialog.vue';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import DistillDialog from '../DistillDialog.vue';

const {
  snapshotDialog, snapshotActiveTab, currentSnapshots, showAgentEdit, editingAgent, onAgentSaved,
  onAgentDeleted, showWorkspaceDir, workspaceDir, onWorkspaceDirSelected,
  store, platformConfigDialogVisible, platformConfigEditId, platformConfigForm, platformConfigSaving,
  onPlatformConfigCancel, onPlatformConfigSubmit, onPlatformConfigClose, showDistill, distillMessages,
} = useChat();
</script>
