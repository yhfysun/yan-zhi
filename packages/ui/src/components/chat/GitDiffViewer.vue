<template>
  <div class="diff-viewer">
    <div class="diff-toolbar">
      <span class="diff-file-name">{{ fileName || '差异' }}</span>
      <span class="diff-stats">
        <em class="diff-stat-add">+{{ stat.added }}</em>
        <em class="diff-stat-del">−{{ stat.deleted }}</em>
      </span>
    </div>
    <div v-if="hunks.length" class="diff-body">
      <div v-for="(hunk, hi) in hunks" :key="hi" class="diff-hunk">
        <div class="diff-hunk-header">{{ hunk.header }}</div>
        <div class="diff-hunk-content">
          <div class="diff-gutter-left">
            <div v-for="(row, i) in hunk.rows" :key="'l' + i" class="diff-gutter-cell" :class="row.leftType">
              {{ row.leftNum || '' }}
            </div>
          </div>
          <div class="diff-code-left">
            <div v-for="(row, i) in hunk.rows" :key="'l' + i" class="diff-code-cell" :class="row.leftType">
              <pre>{{ row.leftContent }}</pre>
            </div>
          </div>
          <div class="diff-gutter-right">
            <div v-for="(row, i) in hunk.rows" :key="'r' + i" class="diff-gutter-cell" :class="row.rightType">
              {{ row.rightNum || '' }}
            </div>
          </div>
          <div class="diff-code-right">
            <div v-for="(row, i) in hunk.rows" :key="'r' + i" class="diff-code-cell" :class="row.rightType">
              <pre>{{ row.rightContent }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="diff-empty">无差异内容</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  diffText: string;
  fileName?: string;
}>();

interface DiffRow {
  leftNum: number | null;
  rightNum: number | null;
  leftType: 'context' | 'removed' | 'empty';
  rightType: 'context' | 'added' | 'empty';
  leftContent: string;
  rightContent: string;
}
interface DiffHunk {
  header: string;
  rows: DiffRow[];
}

const parsed = computed(() => {
  const text = props.diffText || '';
  const lines = text.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldNum = 0;
  let newNum = 0;
  let added = 0;
  let deleted = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('Binary files')) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    if (line.startsWith('@@ ')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNum = Number(m[1]);
        newNum = Number(m[2]);
      }
      currentHunk = { header: line, rows: [] };
      hunks.push(currentHunk);
      continue;
    }
    if (!currentHunk) continue;

    if (line.startsWith('-')) {
      deleted++;
      currentHunk.rows.push({
        leftNum: oldNum++, rightNum: null,
        leftType: 'removed', rightType: 'empty',
        leftContent: line.slice(1), rightContent: '',
      });
    } else if (line.startsWith('+')) {
      added++;
      currentHunk.rows.push({
        leftNum: null, rightNum: newNum++,
        leftType: 'empty', rightType: 'added',
        leftContent: '', rightContent: line.slice(1),
      });
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      currentHunk.rows.push({
        leftNum: oldNum++, rightNum: newNum++,
        leftType: 'context', rightType: 'context',
        leftContent: content, rightContent: content,
      });
    }
  }
  return { hunks, added, deleted };
});

const hunks = computed(() => parsed.value.hunks);
const stat = computed(() => ({ added: parsed.value.added, deleted: parsed.value.deleted }));
</script>

<style scoped>
.diff-viewer {
  border: 1px solid var(--el-border-color-lighter, rgba(15,23,42,0.1));
  border-radius: 6px; overflow: hidden; font-size: 12px;
  font-family: "JetBrains Mono", "Consolas", monospace;
}
.diff-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 10px; background: var(--el-fill-color-light, rgba(15,23,42,0.04));
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.diff-file-name { font-weight: 600; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-stats { display: inline-flex; gap: 6px; flex-shrink: 0; }
.diff-stat-add { color: #10b981; font-style: normal; font-weight: 700; }
.diff-stat-del { color: #ef4444; font-style: normal; font-weight: 700; }
.diff-body { max-height: 400px; overflow: auto; }
.diff-hunk { border-bottom: 1px solid var(--el-border-color-lighter); }
.diff-hunk:last-child { border-bottom: none; }
.diff-hunk-header {
  padding: 3px 10px; background: var(--el-fill-color, rgba(15,23,42,0.06));
  color: var(--el-text-color-secondary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.diff-hunk-content { display: grid; grid-template-columns: 40px 1fr 40px 1fr; }
.diff-gutter-left, .diff-gutter-right {
  background: var(--el-fill-color-light, rgba(15,23,42,0.03));
  border-right: 1px solid var(--el-border-color-lighter);
}
.diff-gutter-right { border-right: none; border-left: 1px solid var(--el-border-color-lighter); }
.diff-gutter-cell {
  padding: 0 4px; text-align: right; color: var(--el-text-color-placeholder);
  font-size: 11px; line-height: 18px; height: 18px; overflow: hidden;
}
.diff-code-left, .diff-code-right { min-width: 0; }
.diff-code-cell {
  height: 18px; overflow: hidden; line-height: 18px;
}
.diff-code-cell pre {
  margin: 0; padding: 0 6px; white-space: pre; overflow: hidden;
  text-overflow: ellipsis; font-size: 12px; line-height: 18px;
}
.diff-code-cell.context pre { color: var(--el-text-color-primary); }
.diff-code-cell.removed { background: rgba(239, 68, 68, 0.08); }
.diff-code-cell.removed pre { color: #c0392b; }
.diff-code-cell.added { background: rgba(16, 185, 129, 0.08); }
.diff-code-cell.added pre { color: #0a7d54; }
.diff-code-cell.empty pre { color: transparent; }
.diff-gutter-cell.removed { background: rgba(239, 68, 68, 0.06); }
.diff-gutter-cell.added { background: rgba(16, 185, 129, 0.06); }
.diff-empty { padding: 16px; text-align: center; color: var(--el-text-color-secondary); }
</style>