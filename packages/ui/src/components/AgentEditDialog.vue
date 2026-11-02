<!--
  AgentEditDialog.vue — 智能体编辑弹窗（2026-11-02 拆壳）
  表单主体已抽到 AgentEditForm，弹窗与 Agents 页右侧详情面板共用同一套表单。
  本文件只保留弹窗外壳与底部操作（删除 / 恢复默认 / 取消 / 保存），对外 API 不变。
-->
<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑智能体' : '新建智能体'"
    width="720px"
    top="2vh"
    class="agent-edit-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <AgentEditForm
      ref="formRef"
      :agent="agent || null"
      @close="visible = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    <template #footer>
      <el-button v-if="canDelete" type="danger" plain :disabled="!formRef" @click="formRef?.remove()" style="margin-right:auto">删除</el-button>
      <el-button v-if="canReset" plain :disabled="!formRef" @click="formRef?.reset()" style="margin-right:auto">恢复默认</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!formRef" @click="formRef?.save()">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent } from '@yan-zhi/shared';
import AgentEditForm from './AgentEditForm.vue';

const props = defineProps<{ modelValue: boolean; agent?: Agent | null }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved', agentId: string): void;
  (e: 'deleted', agentId: string): void;
}>();

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) });
const isEdit = computed(() => !!props.agent?.id);
const canDelete = computed(() => isEdit.value && !props.agent?.isDefault && !props.agent?.isBuiltin);
const canReset = computed(() => isEdit.value && !!(props.agent?.isBuiltin || props.agent?.isDefault));

const formRef = ref<InstanceType<typeof AgentEditForm> | null>(null);
function onSaved(agentId: string) { emit('saved', agentId); }
function onDeleted(agentId: string) { emit('deleted', agentId); }
</script>
