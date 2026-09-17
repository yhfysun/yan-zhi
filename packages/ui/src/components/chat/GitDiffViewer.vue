<!--
  GitDiffViewer.vue — 差异查看器
  · 默认（内嵌）：自带工具栏（导航 / 并排统一 / 放大），底部可拖高。
  · plain：只输出差异本体，不带工具栏 —— 用于「宿主已有一层容器」的场景
    （提交弹窗内联展开、文件树行内展开），避免工具栏套工具栏的嵌套观感。
  · 放大：桌面端开真·独立窗口；Web/移动端降级为应用内全屏弹窗。
  实现细节全部复用 DiffBody.vue（并排/统一切换、左右拖宽、行号固定、差异导航）。
-->
<template>
  <DiffBody
    :diff-text="diffText"
    :file-name="fileName"
    :fullscreen="false"
    :plain="plain"
    @toggle-fullscreen="openFullscreen"
  />

  <!-- 全屏差异（Web/移动端降级路径）：Teleport 由 el-dialog 自身承担 -->
  <el-dialog
    v-if="!plain"
    v-model="fullscreenOpen"
    :title="fileName || '差异'"
    width="96%"
    top="2vh"
    class="diff-fullscreen-dialog"
    append-to-body
    destroy-on-close
  >
    <div class="dfd-body">
      <DiffBody
        :diff-text="diffText"
        :file-name="fileName"
        :fullscreen="true"
        @toggle-fullscreen="fullscreenOpen = false"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import DiffBody from './DiffBody.vue';

const props = withDefaults(defineProps<{
  diffText: string;
  fileName?: string;
  /** 纯内容模式：不渲染工具栏与全屏弹窗，交给宿主容器提供放大能力 */
  plain?: boolean;
}>(), { fileName: '', plain: false });

const fullscreenOpen = ref(false);
// 无差异内容时不值得全屏，但保留按钮（用户可能想看文件名/统计）——故不拦截。
function openFullscreen(): void { fullscreenOpen.value = true; }

// 内容变了（切文件/切 commit）自动关掉全屏，避免停在上一个文件的全屏视图上
watch(() => [props.diffText, props.fileName], () => { fullscreenOpen.value = false; });
</script>

<style scoped>
.dfd-body {
  height: 88vh;
  min-height: 320px;
  display: flex;
  flex-direction: column;
}
</style>

<style>
/* el-dialog 渲染在 body 上，需非 scoped；去掉 body 内边距让差异区吃满 */
.diff-fullscreen-dialog .el-dialog__body {
  padding: 0 12px 12px;
  overflow: hidden;
}
.diff-fullscreen-dialog .el-dialog__header {
  margin-right: 0;
  padding-bottom: 12px;
}
</style>