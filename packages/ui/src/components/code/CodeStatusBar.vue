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
      <!-- 编码：显示后端识别出的真实编码；点击可转码（GBK ↔ UTF-8 等） -->
      <el-dropdown v-if="active" trigger="click" size="small" @command="onPickEncoding">
        <button class="csb-seg" :title="`当前编码：${encodingText}（点击转换）`">
          <span>{{ encodingText }}</span>
          <el-icon :size="10"><ArrowUp /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="enc in commonEncodings"
              :key="'c-' + enc"
              :command="enc"
              :disabled="enc === active.encoding || converting"
            >
              {{ labelOf(enc) }}<span v-if="enc === active.encoding" class="csb-cur">（当前）</span>
            </el-dropdown-item>
            <el-dropdown-item divided disabled class="csb-group">其它编码</el-dropdown-item>
            <el-dropdown-item
              v-for="enc in otherEncodings"
              :key="'o-' + enc"
              :command="enc"
              :disabled="enc === active.encoding || converting"
            >
              {{ labelOf(enc) }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Share, VideoPlay, ArrowUp } from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { langLabel } from './codeLang';
import { SUPPORTED_ENCODINGS, encodingLabel } from '@yan-zhi/shared';

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

// ── 编码显示与转码（2026-10-21）──────────────────────────────────────────────
// 状态栏此前硬编码 "UTF-8"：GBK 文件在编辑器里乱码，用户连"是编码问题"都看不出来。
const converting = ref(false);
const encodingText = computed(() => (active.value ? labelOf(active.value.encoding) : 'UTF-8'));
const COMMON = ['utf-8', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'utf-16le', 'utf-16be', 'windows-1252'];
const commonEncodings = computed(() => COMMON.filter((e) => (SUPPORTED_ENCODINGS as readonly string[]).includes(e)));
const otherEncodings = computed(() =>
  (SUPPORTED_ENCODINGS as readonly string[]).filter((e) => !COMMON.includes(e)),
);

function labelOf(enc: string): string {
  try {
    return encodingLabel(enc as never);
  } catch {
    return enc.toUpperCase();
  }
}

async function onPickEncoding(to: string) {
  const f = active.value;
  if (!f || converting.value) return;
  const fromLabel = labelOf(f.encoding);
  const toLabel = labelOf(to);
  try {
    await ElMessageBox.confirm(
      `将 ${f.name} 从 ${fromLabel} 转换为 ${toLabel}（直接改写磁盘文件）。\n` +
        '若文件里有目标编码无法表示的字符，会拒绝转换并保持原样。',
      '转换文件编码',
      { type: 'warning', confirmButtonText: `转为 ${toLabel}`, cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  converting.value = true;
  try {
    const r = await code.reencodeFile(f.path, to);
    if (!r.ok) {
      ElMessage.error(r.error || '转码失败');
      return;
    }
    ElMessage.success(`已转换为 ${toLabel}`);
  } finally {
    converting.value = false;
  }
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
.csb-cur { color: var(--color-text-secondary, #6b6b66); font-size: 11px; }
.csb-group { font-size: 11px; opacity: 0.6; cursor: default; }
</style>
