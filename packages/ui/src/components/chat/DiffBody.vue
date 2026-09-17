<!--
  DiffBody.vue — 差异内容主体（工具栏 + 内容 + 拖宽/拖高）
  设计参考 IntelliJ IDEA 的 Diff Viewer：
    · 并排（side-by-side）/ 统一（unified）两种视图可切换
    · 上一处 / 下一处 差异导航（IDEA 的 F7 / Shift+F7）
    · 左右两屏之间的分隔条可拖动改变宽度（IDEA：两栏宽度自由调整）
    · 底部可上下拖动改变显示高度（「拉大拉下」）
    · 行号列在横向滚动时固定不动（IDEA 的 gutter 不随内容横滚）
  被 GitDiffViewer（内嵌）与全屏弹窗复用同一份实现。
-->
<template>
  <div
    class="dv"
    :class="{ 'is-fullscreen': fullscreen, 'is-unified': viewMode === 'unified', 'is-plain': plain }"
  >
    <!-- ===== 工具栏（plain 模式不渲染：内联在文件树/弹窗里时避免「面板套面板」的嵌套观感） ===== -->
    <div v-if="!plain" class="dv-bar">
      <span class="dv-name" :title="fileName">{{ fileName || '差异' }}</span>
      <span class="dv-stats">
        <em class="dv-add">+{{ stat.added }}</em>
        <em class="dv-del">−{{ stat.deleted }}</em>
      </span>
      <span class="dv-spacer" />

      <template v-if="hunks.length">
        <button class="dv-btn" type="button" title="上一处差异" @click="gotoNav(-1)">
          <el-icon :size="12"><Top /></el-icon>
        </button>
        <span class="dv-pos">{{ navIndex + 1 }}/{{ hunks.length }}</span>
        <button class="dv-btn" type="button" title="下一处差异" @click="gotoNav(1)">
          <el-icon :size="12"><Bottom /></el-icon>
        </button>
        <span class="dv-sep" />
      </template>

      <button
        class="dv-btn"
        type="button"
        :class="{ on: viewMode === 'split' }"
        title="并排查看"
        @click="setView('split')"
      ><el-icon :size="13"><Grid /></el-icon></button>
      <button
        class="dv-btn"
        type="button"
        :class="{ on: viewMode === 'unified' }"
        title="统一查看"
        @click="setView('unified')"
      ><el-icon :size="13"><Menu /></el-icon></button>
      <span class="dv-sep" />
      <button
        v-if="!fullscreen"
        class="dv-btn"
        type="button"
        :title="childWindowSupported ? '在新窗口打开' : '全屏'"
        @click="onExpand"
      ><el-icon :size="13"><Open v-if="childWindowSupported" /><FullScreen v-else /></el-icon></button>
      <button
        v-else
        class="dv-btn"
        type="button"
        title="回到主窗口"
        @click="emit('toggle-fullscreen')"
      ><el-icon :size="13"><ScaleToOriginal /></el-icon></button>
    </div>

    <!-- ===== 内容 ===== -->
    <div ref="bodyRef" class="dv-body" :style="{ '--dv-h': height + 'px' }">
      <!-- 并排视图：左右两屏，宽度可拖 -->
      <div v-if="viewMode === 'split'" ref="colsRef" class="dv-cols" :style="{ '--dl': leftW + 'px' }">
        <div class="dv-col" data-side="left">
          <div v-for="(hk, hi) in hunks" :key="'l' + hi" class="dv-hunk" :data-hi="hi">
            <div class="dv-hunk-head">{{ hk.header }}</div>
            <div v-for="(r, i) in hk.rows" :key="'ll' + i" class="dv-line" :class="r.leftType">
              <span class="dv-num">{{ r.leftNum ?? '' }}</span>
              <span class="dv-code">{{ r.leftContent }}</span>
            </div>
          </div>
        </div>

        <div class="dv-divider" title="拖动调整两侧宽度" @mousedown="startColDrag" />

        <div class="dv-col" data-side="right">
          <div v-for="(hk, hi) in hunks" :key="'r' + hi" class="dv-hunk" :data-hi="hi">
            <div class="dv-hunk-head">{{ hk.header }}</div>
            <div v-for="(r, i) in hk.rows" :key="'rr' + i" class="dv-line" :class="r.rightType">
              <span class="dv-num">{{ r.rightNum ?? '' }}</span>
              <span class="dv-code">{{ r.rightContent }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 统一视图：单栏，不显示宽度分隔条 -->
      <div v-else class="dv-uni">
        <div v-for="(hk, hi) in hunks" :key="'u' + hi" class="dv-hunk" :data-hi="hi">
          <div class="dv-hunk-head">{{ hk.header }}</div>
          <template v-for="(r, i) in hk.rows" :key="'uu' + i">
            <div v-if="r.leftType === 'removed'" class="dv-line removed">
              <span class="dv-num">{{ r.leftNum ?? '' }}</span>
              <span class="dv-num"></span>
              <span class="dv-sign">−</span>
              <span class="dv-code">{{ r.leftContent }}</span>
            </div>
            <div v-else-if="r.rightType === 'added'" class="dv-line added">
              <span class="dv-num"></span>
              <span class="dv-num">{{ r.rightNum ?? '' }}</span>
              <span class="dv-sign">+</span>
              <span class="dv-code">{{ r.rightContent }}</span>
            </div>
            <div v-else class="dv-line context">
              <span class="dv-num">{{ r.leftNum ?? '' }}</span>
              <span class="dv-num">{{ r.rightNum ?? '' }}</span>
              <span class="dv-sign">&nbsp;</span>
              <span class="dv-code">{{ r.leftContent }}</span>
            </div>
          </template>
        </div>
      </div>

      <div v-if="!hunks.length" class="dv-empty">无差异内容</div>
    </div>

    <!-- 底部高度拖拽条（全屏/纯内容模式不需要） -->
    <div
      v-if="!fullscreen && !plain"
      class="dv-resize-v"
      title="拖动调整高度"
      @mousedown="startHeightDrag"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import {
  Top, Bottom, Grid, Menu, FullScreen, ScaleToOriginal, Open,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { supportsChildWindow, openChildWindow } from '../../utils/childWindow';

const props = withDefaults(defineProps<{
  diffText: string;
  fileName?: string;
  /** 撑满态：内嵌于全屏弹窗或独立窗口时用，高度交给外层，不显示高度拖拽条 */
  fullscreen?: boolean;
  /**
   * 纯内容模式：不渲染工具栏与拖高条，只输出差异本体。
   * 用于「已经有一层容器」的场景（提交弹窗内联展开、文件树行内展开），
   * 否则会出现工具栏套工具栏的嵌套观感；放大/切视图等操作由外层容器提供。
   */
  plain?: boolean;
}>(), { fileName: '', fullscreen: false, plain: false });

const emit = defineEmits<{ (e: 'toggle-fullscreen'): void }>();

/** 桌面端是否支持真·独立窗口（按钮图标与行为据此切换） */
const childWindowSupported = supportsChildWindow;

/**
 * 「放大」按钮：
 *   · 桌面端 → 开真·独立窗口（可最小化/最大化/还原、可拖边改大小、可拖到另一块屏幕）
 *   · Web/移动端 → 降级为应用内全屏弹窗（由父级 GitDiffViewer 承担）
 * 返回 false（窗口没开成）时也走降级路径，避免点了没反应。
 */
async function onExpand(): Promise<void> {
  if (childWindowSupported) {
    const ok = await openChildWindow({
      key: 'diff-viewer',
      route: '/diff-window',
      payload: { diffText: props.diffText, fileName: props.fileName, title: '差异' },
      width: 1280,
      height: 860,
    });
    if (ok) return;
    ElMessage.warning('独立窗口打开失败，已改为应用内全屏');
  }
  emit('toggle-fullscreen');
}

// ===== 差异解析（与原有实现保持一致，仅规范化换行）=====
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
  // CRLF 规范化：否则每行末尾会残留 \r，渲染出多余空白
  const lines = (props.diffText || '').replace(/\r\n/g, '\n').split('\n');
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

// ===== 视图模式（持久化，保留用户偏好）=====
type ViewMode = 'split' | 'unified';
function readStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function readNum(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch { return fallback; }
}
function write(key: string, val: string | number): void {
  try { localStorage.setItem(key, String(val)); } catch { /* 隐私模式忽略 */ }
}

const viewMode = ref<ViewMode>(readStr('yz_diff_view', 'split') === 'unified' ? 'unified' : 'split');
function setView(v: ViewMode): void {
  viewMode.value = v;
  write('yz_diff_view', v);
}

// ===== 差异导航：← 上一处 / 下一处 →（对应 IDEA 的 Shift+F7 / F7）=====
const navIndex = ref(0);
const bodyRef = ref<HTMLElement | null>(null);

watch(hunks, () => { navIndex.value = 0; });

function gotoNav(dir: 1 | -1): void {
  if (!hunks.value.length) return;
  const next = navIndex.value + dir;
  // 到头就停住（不循环），与 IDEA 的「到达首/尾提示切换文件」语义接近但不越界
  navIndex.value = Math.max(0, Math.min(hunks.value.length - 1, next));
  scrollToHunk(navIndex.value);
}

function scrollToHunk(i: number): void {
  const el = bodyRef.value?.querySelector(`[data-hi="${i}"]`) as HTMLElement | null;
  if (!el) return;
  const body = bodyRef.value;
  if (!body) return;
  // 只调整垂直偏移，避免 scrollIntoView 把横向滚动位置也一起带走
  const delta = el.offsetTop - body.offsetTop;
  body.scrollTop = Math.max(0, delta - 8);
}

/** 供外层（如全屏切换后）定位到当前差异 */
defineExpose({ scrollToHunk, gotoNav, navIndex });

// ===== 左右两屏宽度拖动 =====
const colsRef = ref<HTMLElement | null>(null);
/** 左屏代码区宽度（行号列之外），持久化 */
const leftW = ref(readNum('yz_diff_left', 520));
const MIN_PANE = 140; // 两侧各自的最小可读宽度

function startColDrag(e: MouseEvent): void {
  const cols = colsRef.value;
  if (!cols) return;
  const startX = e.clientX;
  const startW = leftW.value;
  // 可用总宽减去分隔条与右屏最小值，得到左屏上限
  const total = cols.getBoundingClientRect().width;
  const maxW = Math.max(MIN_PANE, total - MIN_PANE - 6);

  const onMove = (ev: MouseEvent) => {
    const w = Math.round(startW + (ev.clientX - startX));
    leftW.value = Math.max(MIN_PANE, Math.min(maxW, w));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    write('yz_diff_left', leftW.value);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}

// ===== 显示高度拖动（拉大拉下）=====
const height = ref(readNum('yz_diff_h', 420));
const MIN_H = 160;

function startHeightDrag(e: MouseEvent): void {
  const startY = e.clientY;
  const startH = height.value;
  const onMove = (ev: MouseEvent) => {
    const h = Math.round(startH + (ev.clientY - startY));
    const maxH = Math.max(MIN_H, window.innerHeight - 160);
    height.value = Math.max(MIN_H, Math.min(maxH, h));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    write('yz_diff_h', height.value);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}

// 窄容器保护：初始化时把左屏宽度收进容器（否则首次进入右屏会被挤没）
function clampLeftToContainer(): void {
  const cols = colsRef.value;
  if (!cols) return;
  const total = cols.getBoundingClientRect().width;
  if (total > 0 && leftW.value > total - MIN_PANE - 6) {
    leftW.value = Math.max(MIN_PANE, total - MIN_PANE - 6);
  }
}
watch(viewMode, (v) => { if (v === 'split') void Promise.resolve().then(clampLeftToContainer); });

onBeforeUnmount(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});
</script>

<style scoped>
.dv {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
  font-family: "JetBrains Mono", "Consolas", monospace;
  background: var(--el-bg-color, #fff);
}
.dv.is-fullscreen { border: none; border-radius: 0; flex: 1; }
/* 纯内容模式：融入宿主容器（不自带边框/圆角，避免嵌套出一层"面板"） */
.dv.is-plain {
  border: none;
  border-radius: 0;
  background: transparent;
}
.dv.is-plain .dv-body { max-height: none; }

/* ===== 工具栏 ===== */
.dv-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  flex-shrink: 0;
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.04));
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  font-family: initial;
}
.dv-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: "JetBrains Mono", "Consolas", monospace;
  min-width: 0;
}
.dv-stats { display: inline-flex; gap: 6px; flex-shrink: 0; }
.dv-add { color: #10b981; font-style: normal; font-weight: 700; }
.dv-del { color: #ef4444; font-style: normal; font-weight: 700; }
.dv-spacer { flex: 1; }
.dv-sep {
  width: 1px; height: 14px; flex-shrink: 0;
  background: var(--el-border-color-lighter, rgba(15, 23, 42, 0.12));
}
.dv-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex-shrink: 0;
  border: none; border-radius: 5px; background: transparent;
  color: var(--el-text-color-secondary, #64748b);
  cursor: pointer; transition: background 0.14s ease, color 0.14s ease;
}
.dv-btn:hover { background: color-mix(in srgb, var(--color-primary, #4f46e5) 10%, transparent); color: var(--color-primary, #4f46e5); }
.dv-btn.on { background: color-mix(in srgb, var(--color-primary, #4f46e5) 14%, transparent); color: var(--color-primary, #4f46e5); }
.dv-pos {
  font-size: 11px; flex-shrink: 0; min-width: 34px; text-align: center;
  color: var(--el-text-color-secondary, #64748b);
  font-family: "JetBrains Mono", "Consolas", monospace;
}

/* ===== 内容区：垂直滚动（左右共用一份 scrollTop，天然同步）===== */
.dv-body {
  max-height: var(--dv-h, 420px);
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.dv.is-fullscreen .dv-body { max-height: none; flex: 1; }

/* 并排：左屏宽度可拖（--dl），右屏吃掉剩余 */
.dv-cols {
  display: grid;
  grid-template-columns: minmax(140px, var(--dl, 520px)) 6px minmax(140px, 1fr);
  align-items: start;
}
.dv-col { overflow-x: auto; overflow-y: hidden; min-width: 0; }

.dv-hunk { width: max-content; min-width: 100%; }
.dv-uni .dv-hunk { width: 100%; }

.dv-hunk-head {
  padding: 3px 10px;
  background: var(--el-fill-color, rgba(15, 23, 42, 0.06));
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
  white-space: nowrap;
}

/* ===== 行：行号 sticky 固定，代码区横向滚动 ===== */
.dv-line {
  display: flex;
  align-items: stretch;
  height: 18px;
  line-height: 18px;
}
.dv-num {
  flex: 0 0 44px;
  width: 44px;
  padding: 0 6px 0 0;
  text-align: right;
  font-size: 11px;
  color: var(--el-text-color-placeholder, #94a3b8);
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.03));
  border-right: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.06));
  box-sizing: border-box;
  /* 横向滚动时行号保持可见（IDEA 的 gutter 行为） */
  position: sticky;
  left: 0;
  z-index: 1;
}
.dv-code {
  flex: 1 0 auto;
  padding: 0 12px 0 6px;
  white-space: pre;
  color: var(--el-text-color-primary);
  font-size: 12px;
}
.dv-sign {
  flex: 0 0 14px;
  text-align: center;
  color: var(--el-text-color-secondary, #64748b);
  user-select: none;
}

/* 行背景：新增绿 / 删除红（与项目既有配色一致） */
.dv-line.removed .dv-code { background: rgba(239, 68, 68, 0.08); color: #c0392b; }
.dv-line.removed .dv-num { background: rgba(239, 68, 68, 0.06); }
.dv-line.added .dv-code { background: rgba(16, 185, 129, 0.08); color: #0a7d54; }
.dv-line.added .dv-num { background: rgba(16, 185, 129, 0.06); }
.dv-line.empty .dv-code { color: transparent; }
.dv-line.empty .dv-num { color: transparent; }

/* ===== 左右分隔条（拖动调整两屏宽度）===== */
.dv-divider {
  align-self: stretch;
  cursor: col-resize;
  background: var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  position: relative;
  transition: background 0.15s ease;
}
.dv-divider::after {
  content: '';
  position: absolute;
  inset: 0 -2px;
}
.dv-divider:hover { background: var(--color-primary, #4f46e5); }

/* ===== 底部高度拖拽条 ===== */
.dv-resize-v {
  height: 7px;
  flex-shrink: 0;
  cursor: row-resize;
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.04));
  border-top: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.08));
  position: relative;
  transition: background 0.15s ease;
}
.dv-resize-v::after {
  content: '';
  position: absolute;
  left: 50%; top: 50%;
  width: 28px; height: 3px;
  transform: translate(-50%, -50%);
  border-radius: 2px;
  background: var(--el-border-color, rgba(15, 23, 42, 0.2));
  transition: background 0.15s ease;
}
.dv-resize-v:hover { background: color-mix(in srgb, var(--color-primary, #4f46e5) 8%, transparent); }
.dv-resize-v:hover::after { background: var(--color-primary, #4f46e5); }

.dv-empty {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-secondary, #64748b);
  font-family: initial;
}
</style>