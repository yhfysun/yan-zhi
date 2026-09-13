<!-- 提交弹窗的树节点行（递归）：目录可折叠 + 三态勾选，文件显示状态徽标 / 增删行数 / 内联差异 -->
<template>
  <div class="gtr-node">
    <!-- 目录行 -->
    <div
      v-if="node.isDir"
      class="gtr-row gtr-dir"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="emit('toggle-collapse', node.id)"
    >
      <el-icon :size="12" class="gtr-caret">
        <CaretRight v-if="collapsedNow" /><CaretBottom v-else />
      </el-icon>
      <el-checkbox
        :model-value="dirState"
        :indeterminate="dirState === 'indeterminate'"
        size="small"
        class="gtr-check"
        @click.stop
        @change="(v: unknown) => emit('toggle-dir', node, !!v)"
      />
      <el-icon :size="13" class="gtr-folder"><Folder /></el-icon>
      <span class="gtr-name gtr-dir-name" :title="node.path">{{ node.name }}</span>
      <span class="gtr-count">{{ node.fileCount }}</span>
    </div>

    <!-- 文件行 -->
    <template v-else>
      <div
        class="gtr-row gtr-file"
        :class="{ 'is-expanded': expandedKey === node.file!.key, 'is-dir-entry': node.file!.isDirEntry }"
        :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
        @click="onFileClick"
        @contextmenu.prevent="node.file && emit('open-menu', $event, node.file)"
      >
        <el-checkbox
          :model-value="!!selected[node.file!.key]"
          :disabled="node.file!.isDirEntry"
          size="small"
          class="gtr-check"
          @click.stop
          @change="(v: unknown) => emit('toggle-file', node.file!.key, !!v)"
        />
        <span class="gtr-badge" :class="'st-' + node.file!.statusClass">{{ node.file!.statusChar }}</span>
        <span class="gtr-name" :title="node.path">{{ node.name }}</span>
        <span v-if="node.file!.isDirEntry" class="gtr-dir-tip">目录未展开</span>
        <span v-else class="gtr-stat">
          <em class="add">+{{ node.file!.added }}</em>
          <em class="del">−{{ node.file!.deleted }}</em>
        </span>
        <span class="gtr-flag" v-if="node.file!.staged" title="已暂存">暂</span>
        <el-icon v-if="!node.file!.isDirEntry" :size="12" class="gtr-caret gtr-file-caret">
          <CaretRight v-if="expandedKey !== node.file!.key" /><CaretBottom v-else />
        </el-icon>
      </div>
      <!-- 内联差异 -->
      <div v-if="expandedKey === node.file!.key" class="gtr-diff">
        <div v-if="diffLoading" class="gtr-diff-tip">加载差异…</div>
        <GitDiffViewer v-else-if="expandedDiff" :diff-text="expandedDiff" :file-name="node.path" />
        <div v-else class="gtr-diff-tip">无差异内容（新增或二进制文件）</div>
      </div>
    </template>

    <!-- 子节点递归 -->
    <template v-if="node.isDir && !collapsedNow">
      <GitTreeRow
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected="selected"
        :expanded-key="expandedKey"
        :collapsed="collapsed"
        :filter="filter"
        :diff-loading="diffLoading"
        :expanded-diff="expandedDiff"
        @open-menu="(e, f) => emit('open-menu', e, f)"
        @expand="(f) => emit('expand', f)"
        @toggle-file="(k, v) => emit('toggle-file', k, v)"
        @toggle-dir="(n, v) => emit('toggle-dir', n, v)"
        @toggle-collapse="(id) => emit('toggle-collapse', id)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CaretRight, CaretBottom, Folder } from '@element-plus/icons-vue';
import GitDiffViewer from '../chat/GitDiffViewer.vue';

// 递归自引用：显式声明组件名，保证模板内 <GitTreeRow> 能解析到自身
defineOptions({ name: 'GitTreeRow' });

interface ChangedFile {
  key: string;
  path: string;
  dir: string;
  name: string;
  statusChar: string;
  statusClass: string;
  staged: boolean;
  added: number;
  deleted: number;
  isDirEntry?: boolean;
}
interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  fileCount: number;
  selCount: number;
  file?: ChangedFile;
}

const props = defineProps<{
  node: TreeNode;
  depth: number;
  selected: Record<string, boolean>;
  expandedKey: string;
  collapsed: Record<string, boolean>;
  filter: string;
  diffLoading?: boolean;
  expandedDiff?: string;
}>();
const emit = defineEmits<{
  (e: 'open-menu', ev: MouseEvent, f: ChangedFile): void;
  (e: 'expand', f: ChangedFile): void;
  (e: 'toggle-file', key: string, v: boolean): void;
  (e: 'toggle-dir', node: TreeNode, v: boolean): void;
  (e: 'toggle-collapse', id: string): void;
}>();

/** 过滤时强制展开，避免命中结果被折叠藏在目录里 */
const collapsedNow = computed(() => !props.filter.trim() && !!props.collapsed[props.node.id]);
/** 目录三态：全选 / 半选 / 未选 */
const dirState = computed<boolean | 'indeterminate'>(() => {
  const n = props.node;
  if (n.selCount === 0) return false;
  return n.selCount >= n.fileCount ? true : 'indeterminate';
});

function onFileClick(): void {
  const f = props.node.file;
  if (f && !f.isDirEntry) emit('expand', f);
}
</script>

<style scoped>
.gtr-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; cursor: pointer; font-size: 13px;
  border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
}
.gtr-row:hover { background: var(--glass-bg-hover, #f5f3ee); }
.gtr-file.is-expanded { background: var(--glass-bg-hover, #f5f3ee); }
.gtr-dir { font-weight: 600; color: var(--color-text, #1a1a1a); }
.gtr-caret { color: var(--color-text-muted, #9a9a9a); flex-shrink: 0; }
.gtr-file-caret { margin-left: auto; }
.gtr-check { margin-right: 0; flex-shrink: 0; }
.gtr-folder { color: #d9a441; flex-shrink: 0; }
.gtr-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gtr-dir-name { color: var(--color-text-soft, #6b6b6b); font-family: "JetBrains Mono", monospace; font-size: 12px; }
.gtr-count {
  font-size: 10px; color: var(--color-text-muted, #9a9a9a);
  background: var(--glass-bg-soft, #f5f3ee); border-radius: 8px; padding: 0 6px; flex-shrink: 0;
}
.gtr-badge {
  width: 16px; height: 16px; flex-shrink: 0; border-radius: 3px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; font-family: "JetBrains Mono", monospace;
}
.st-modified { background: #fdf0d5; color: #b45309; }
.st-added { background: #dcfce7; color: #15803d; }
.st-deleted { background: #fee2e2; color: #b91c1c; }
.st-untracked { background: #e0e7ff; color: #4338ca; }
.st-renamed { background: #e0f2fe; color: #0369a1; }
.st-conflict { background: #fae8ff; color: #a21caf; }
.gtr-stat { font-size: 11px; font-family: "JetBrains Mono", monospace; flex-shrink: 0; margin-left: auto; }
.gtr-stat .add { color: #15803d; font-style: normal; margin-right: 4px; }
.gtr-stat .del { color: #b91c1c; font-style: normal; }
.gtr-flag {
  font-size: 10px; padding: 0 4px; border-radius: 3px;
  background: #eef2ff; color: #4338ca; flex-shrink: 0;
}
.gtr-dir-tip { font-size: 11px; color: var(--color-text-muted, #9a9a9a); margin-left: auto; }
.gtr-diff { padding: 6px 10px; background: #fff; border-bottom: 1px solid var(--glass-border-soft, #f0eee8); }
.gtr-diff-tip { font-size: 12px; color: var(--color-text-muted, #9a9a9a); padding: 6px 0; }
</style>
