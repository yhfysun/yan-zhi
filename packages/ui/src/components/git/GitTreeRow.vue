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
      <!-- 内联差异：plain 模式（宿主已有一层容器，避免工具栏套工具栏） -->
      <div v-if="expandedKey === node.file!.key" class="gtr-diff">
        <div v-if="diffLoading" class="gtr-diff-tip">加载差异…</div>
        <template v-else-if="expandedDiff">
          <div class="gtr-diff-head">
            <span class="gtr-diff-stat">
              <em class="add">+{{ node.file!.added }}</em>
              <em class="del">−{{ node.file!.deleted }}</em>
            </span>
            <span class="gtr-diff-spacer"></span>
            <button class="gtr-diff-act" title="在新窗口打开" @click.stop="openInWindow">
              <el-icon :size="11"><Open /></el-icon>新窗口
            </button>
          </div>
          <GitDiffViewer :diff-text="expandedDiff" :file-name="node.path" plain />
        </template>
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
import { CaretRight, CaretBottom, Folder, Open } from '@element-plus/icons-vue';
import GitDiffViewer from '../chat/GitDiffViewer.vue';
import { supportsChildWindow, openChildWindow } from '../../utils/childWindow';

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

/**
 * 内联差异的「在新窗口打开」。
 * plain 模式下 DiffBody 不带工具栏（避免嵌套观感），放大的入口由这里提供。
 * 桌面端开真·独立窗口；其它环境退化为「切换到应用内全屏弹窗」由父级处理，
 * 这里只负责能开则开、开不了就什么都不做（父级另有入口）。
 */
async function openInWindow(): Promise<void> {
  const f = props.node.file;
  if (!f || !supportsChildWindow) return;
  await openChildWindow({
    key: 'diff-viewer',
    route: '/diff-window',
    payload: { diffText: props.expandedDiff || '', fileName: props.node.path, title: '差异' },
    width: 1280,
    height: 860,
  });
}
</script>

<style scoped>
.gtr-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; cursor: pointer; font-size: 13px;
  border-bottom: 1px solid var(--color-border, #e7e4dc);
}
.gtr-row:hover { background: var(--color-surface-hover, #f1efe9); }
.gtr-file.is-expanded { background: var(--color-surface-hover, #f1efe9); }
.gtr-dir { font-weight: 600; color: var(--color-text, #1a1a1a); }
.gtr-caret { color: var(--color-text-tertiary, #9a9a9a); flex-shrink: 0; }
.gtr-file-caret { margin-left: auto; }
.gtr-check { margin-right: 0; flex-shrink: 0; }
.gtr-folder { color: #d9a441; flex-shrink: 0; }
.gtr-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gtr-dir-name { color: var(--color-text-secondary, #6b6b6b); font-family: "JetBrains Mono", monospace; font-size: 12px; }
.gtr-count {
  font-size: 10px; color: var(--color-text-tertiary, #9a9a9a);
  background: var(--color-surface-hover, #f1efe9); border-radius: 8px; padding: 0 6px; flex-shrink: 0;
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
.gtr-dir-tip { font-size: 11px; color: var(--color-text-tertiary, #9a9a9a); margin-left: auto; }
.gtr-diff { padding: 6px 10px; background: var(--color-surface, #fff); border-bottom: 1px solid var(--color-border, #e7e4dc); }
.gtr-diff-tip { font-size: 12px; color: var(--color-text-tertiary, #9a9a9a); padding: 6px 0; }

/* 内联差异的自有头部（统计 + 放大入口）——DiffBody 在 plain 模式下不带工具栏 */
.gtr-diff-head {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid var(--color-border, #f0eee8);
  margin-bottom: 6px;
}
.gtr-diff-stat { display: inline-flex; gap: 6px; font-family: "JetBrains Mono", monospace; font-size: 11px; }
.gtr-diff-stat .add { color: #10b981; font-style: normal; font-weight: 700; }
.gtr-diff-stat .del { color: #ef4444; font-style: normal; font-weight: 700; }
.gtr-diff-spacer { flex: 1; }
.gtr-diff-act {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid var(--color-border, #e7e4dc); background: var(--color-surface, #fff);
  border-radius: 5px; padding: 2px 7px; font-size: 11px; cursor: pointer;
  color: var(--color-text-secondary, #6b6b6b);
}
.gtr-diff-act:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
</style>
