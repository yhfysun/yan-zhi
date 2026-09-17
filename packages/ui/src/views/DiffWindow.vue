<!--
  DiffWindow.vue — 独立窗口里的差异查看器（路由 /diff-window）
  ------------------------------------------------------------
  由 DiffBody/GitDiffViewer 的「在新窗口打开」按钮唤起（桌面端真窗口）。
  数据经主进程 payload 中转：开窗前 putPayload(key, {...})，本组件挂载后 take 一次。

  为什么不做成「主窗口传 props」：子窗口是独立渲染进程，Vue 状态过不去，
  只能走主进程中转或 URL 查询串。diff 文本可能很大（上百 KB），塞 URL 不安全也不优雅，
  故走 payload 通道；轻量标识（如仓库/文件路径）仍可从 URL 兜底。
-->
<template>
  <ChildWindowFrame
    :title="title"
    :subtitle="fileName"
    :icon="Files"
    @close="onClose"
  >
    <template #actions>
      <button v-if="diffText" class="dw-act" type="button" title="复制差异文本" @click="copyDiff">
        <el-icon :size="12"><CopyDocument /></el-icon>复制
      </button>
    </template>

    <div class="dw-body">
      <div v-if="loading" class="dw-state">正在加载差异…</div>
      <div v-else-if="!diffText" class="dw-state">
        <el-icon :size="38"><Document /></el-icon>
        <p>没有可显示的差异</p>
        <p class="dw-state-hint">请回到主窗口，在差异面板点「在新窗口打开」。</p>
      </div>
      <DiffBody
        v-else
        :diff-text="diffText"
        :file-name="fileName"
        fullscreen
        @toggle-fullscreen="onBackToMain"
      />
    </div>
  </ChildWindowFrame>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Files, CopyDocument, Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import DiffBody from '../components/chat/DiffBody.vue';
import ChildWindowFrame from '../components/workbench/ChildWindowFrame.vue';
import { takeChildWindowPayload, closeSelfWindow, isChildWindowContext } from '../utils/childWindow';

interface DiffWindowPayload {
  diffText: string;
  fileName: string;
  title?: string;
}

const loading = ref(true);
const diffText = ref('');
const fileName = ref('');
const title = ref('差异');

onMounted(async () => {
  // key 与开窗时一致（diff 窗口固定用这一个 key，同 key 只允许一个窗口）
  const payload = await takeChildWindowPayload<DiffWindowPayload>('diff-viewer');
  if (payload) {
    diffText.value = payload.diffText || '';
    fileName.value = payload.fileName || '';
    title.value = payload.title || '差异';
  }
  loading.value = false;
});

async function copyDiff(): Promise<void> {
  try {
    await navigator.clipboard.writeText(diffText.value);
    ElMessage.success('差异文本已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

/**
 * 「回到主窗口 / 退出」：
 *   · 真子窗口（szwin=1）→ 关闭本窗口
 *   · 应用内访问该路由 → 回退到上一页（不能关主窗口）
 */
async function leave(): Promise<void> {
  if (isChildWindowContext()) {
    const closed = await closeSelfWindow();
    if (closed) return;
  }
  if (history.length > 1) history.back();
  else window.location.hash = '#/code';
}

// 工具栏在 fullscreen 模式下显示的是「回到主窗口」
function onBackToMain(): void { void leave(); }
function onClose(): void { void leave(); }
</script>

<style scoped>
.dw-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px;
}
.dw-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary, #64748b);
  font-size: 13px;
}
.dw-state-hint { font-size: 12px; opacity: 0.8; }
.dw-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.12));
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: var(--el-text-color-regular, #475569);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dw-act:hover {
  border-color: var(--color-primary, #4f46e5);
  color: var(--color-primary, #4f46e5);
}
</style>