<template>
  <div class="csb-bar">
    <!-- 左侧：Git 分支 + 改动数 -->
    <div class="csb-left">
      <button v-if="gitBranch" class="csb-seg" title="源代码管理" @click="goGit">
        <el-icon :size="12"><Share /></el-icon>
        <span class="csb-branch">{{ gitBranch }}</span>
        <span v-if="gitDirty" class="csb-dot" :title="gitDirty + ' 个改动'">{{ gitDirty }}</span>
      </button>
      <span v-else class="csb-seg muted">未纳入 Git</span>
    </div>

    <!-- 右侧：语言 / 光标 / 编码 / 换行 / 断点 / 脏标记 -->
    <div class="csb-right">
      <span v-if="active" class="csb-seg">{{ langLabel(active.name) }}</span>
      <span v-if="active" class="csb-seg">Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span v-if="active" class="csb-seg">空格: 2</span>
      <span v-if="active" class="csb-seg">UTF-8</span>
      <span v-if="active" class="csb-seg">LF</span>
      <span v-if="active && bpCount" class="csb-seg bp">
        <el-icon :size="11"><VideoPlay /></el-icon>{{ bpCount }} 断点
      </span>
      <span v-if="active && isDirty" class="csb-seg dirty">未保存</span>
      <span v-if="!active" class="csb-seg muted">{{ code.projectDir ? '就绪' : '未选择项目目录' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Share, VideoPlay } from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { langLabel } from './codeLang';

const props = withDefaults(defineProps<{
  gitBranch?: string | null;
  gitDirty?: number;
}>(), { gitBranch: null, gitDirty: 0 });

const code = useCodeStore();
const active = computed(() => code.activeFile);
const cursor = computed(() => code.editorCursor);
const isDirty = computed(() => !!active.value && active.value.content !== active.value.original);
const bpCount = computed(() => (active.value ? (code.breakpoints[active.value.path] || []).length : 0));

function goGit() {
  code.sidebarView = 'git';
}
</script>

<style scoped>
.csb-bar {
  display: flex; align-items: center; justify-content: space-between;
  height: 24px; flex-shrink: 0; padding: 0 10px;
  font-size: 11.5px; color: var(--color-text-secondary, #6b6b66);
  background: var(--color-surface-hover);
  border-top: 1px solid var(--glass-border, #e7e4dc);
  user-select: none;
}
.csb-left, .csb-right { display: flex; align-items: center; gap: 2px; min-width: 0; }
.csb-seg {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 8px; border-radius: 5px;
  color: var(--color-text-secondary, #6b6b66); cursor: default;
  transition: background 0.12s ease;
  white-space: nowrap;
}
button.csb-seg { border: none; background: transparent; font-family: inherit; font-size: 11.5px; }
button.csb-seg:hover { background: var(--glass-bg-hover, #e7e4dc); color: var(--color-text, #1a1a1a); }
.csb-seg.muted { opacity: 0.6; }
.csb-branch { font-weight: 600; color: var(--color-text, #1a1a1a); }
.csb-dot {
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff; background: var(--color-primary, #c2410c);
}
.csb-seg.bp { color: var(--color-primary, #c2410c); }
.csb-seg.dirty { color: var(--color-warning, #b45309); font-weight: 600; }
</style>
