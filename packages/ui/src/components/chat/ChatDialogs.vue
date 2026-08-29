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
    v-model="confirmDialogVisible"
    :title="store.pendingConfirmation?.title || '用户确认'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="confirm-user-dialog"
    @close="onConfirmDialogClose"
  >
    <div v-if="confirmCurrentPage && store.pendingConfirmation" class="confirm-wizard">
      <div class="confirm-wizard-step">
        第 {{ store.pendingConfirmation.index + 1 }} / {{ store.pendingConfirmation.pages.length }} 页
      </div>
      <div class="confirm-wizard-question">{{ confirmCurrentPage.question }}</div>
      <div v-if="confirmCurrentPage.description" class="confirm-wizard-description">
        {{ confirmCurrentPage.description }}
      </div>

      <div v-if="confirmMultiSelect" class="confirm-wizard-options">
        <el-checkbox
          v-for="(opt, i) in confirmCurrentPage.options"
          :key="i"
          v-model="confirmChecked[i]"
        >{{ opt }}</el-checkbox>
      </div>
      <div v-else-if="confirmCurrentPage.options?.length" class="confirm-wizard-options">
        <button
          v-for="(opt, i) in confirmCurrentPage.options"
          :key="i"
          type="button"
          class="ask-user-opt"
          :class="{ 'is-active': confirmSingle === opt }"
          @click="confirmSingle = opt"
        >{{ opt }}</button>
        <button
          v-if="confirmCurrentPage.allowText !== false"
          type="button"
          class="ask-user-opt ask-user-opt-text"
          :class="{ 'is-active': confirmShowText }"
          @click="confirmShowText = true"
        >其他（文字输入）</button>
      </div>

      <el-input
        v-if="confirmCurrentPage.allowText !== false && (!confirmCurrentPage.options?.length || confirmMultiSelect || confirmShowText)"
        v-model="confirmText"
        type="textarea"
        :rows="3"
        placeholder="输入你的回答..."
        class="confirm-wizard-text"
      />
      <el-input
        v-if="confirmCurrentPage.allowSupplement !== false"
        v-model="confirmSupplement"
        type="textarea"
        :rows="2"
        placeholder="补充说明（可选）"
        class="confirm-wizard-supplement"
      />
    </div>
    <template #footer>
      <el-button @click="onConfirmSkip">跳过</el-button>
      <el-button type="primary" @click="onConfirmNext">
        {{ store.pendingConfirmation && store.pendingConfirmation.index < store.pendingConfirmation.pages.length - 1 ? '下一页' : '完成' }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="askDialogVisible"
    title="智能体提问"
    width="460px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="ask-user-dialog"
    @close="onAskDialogClose"
  >
    <div class="ask-user-question">{{ store.pendingQuestion?.question }}</div>

    <div v-if="askMultiSelect" class="ask-user-options">
      <el-checkbox v-for="(opt, i) in store.pendingQuestion?.options" :key="i" v-model="askChecked[i]">{{ opt }}</el-checkbox>
    </div>
    <div v-else-if="store.pendingQuestion?.options?.length" class="ask-user-options">
      <button
        v-for="(opt, i) in store.pendingQuestion.options"
        :key="i"
        type="button"
        class="ask-user-opt"
        :class="{ 'is-active': askSingle === opt }"
        @click="askSingle = opt"
      >{{ opt }}</button>
      <button type="button" class="ask-user-opt ask-user-opt-text" :class="{ 'is-active': askShowText }" @click="askShowText = true">
        其他（文字输入）
      </button>
    </div>

    <el-input
      v-if="!store.pendingQuestion?.options?.length || askShowText"
      v-model="askText"
      type="textarea"
      :rows="3"
      placeholder="输入你的回答..."
      @keyup.ctrl.enter="onAskSubmit"
    />
    <el-input
      v-if="store.pendingQuestion?.allowSupplement !== false"
      v-model="askSupplement"
      type="textarea"
      :rows="2"
      placeholder="补充说明（可选）"
      class="ask-user-supplement"
      @keyup.ctrl.enter="onAskSubmit"
    />
    <template #footer>
      <el-button @click="onAskSkip">跳过</el-button>
      <el-button type="primary" @click="onAskSubmit">提交</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="platformConfigDialogVisible"
    title="配置模型平台"
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
        <el-input v-model="platformConfigForm.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
      <el-form-item label="模型 ID">
        <el-input v-model="platformConfigForm.modelId" placeholder="如：gpt-4o-mini / deepseek-chat" />
      </el-form-item>
      <el-form-item label="模型别名">
        <el-input v-model="platformConfigForm.alias" placeholder="可选，展示在模型列表中的名称" />
      </el-form-item>
      <el-form-item label="上下文窗口">
        <el-input-number v-model="platformConfigForm.contextWindow" :min="1024" :max="1000000" :step="1024" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="onPlatformConfigCancel">取消</el-button>
      <el-button type="primary" :loading="platformConfigSaving" @click="onPlatformConfigSubmit">保存并创建</el-button>
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
  onAgentDeleted, showWorkspaceDir, workspaceDir, onWorkspaceDirSelected, confirmDialogVisible,
  store, confirmCurrentPage, confirmMultiSelect, confirmChecked, confirmSingle, confirmShowText,
  confirmText, confirmSupplement, onConfirmSkip, onConfirmNext, onConfirmDialogClose, askDialogVisible,
  askMultiSelect, askChecked, askSingle, askShowText, askText, askSupplement, onAskSubmit, onAskSkip,
  onAskDialogClose, platformConfigDialogVisible, platformConfigForm, platformConfigSaving,
  onPlatformConfigCancel, onPlatformConfigSubmit, onPlatformConfigClose, showDistill, distillMessages,
} = useChat();
</script>
