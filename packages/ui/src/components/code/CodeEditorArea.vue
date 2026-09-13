<template>
  <div class="cea">
    <!-- ===== 文件标签栏（无滚动条；滚轮/Shift+滚轮横向滚动；两侧悬浮箭头） ===== -->
    <div class="cea-tabs">
      <button v-show="canScrollLeft" class="cea-tab-nav" title="向左滚动" @click="scrollTabs(-1)">
        <el-icon :size="12"><ArrowLeft /></el-icon>
      </button>
      <div ref="tabsScrollRef" class="cea-tabs-scroll" @wheel.prevent="onTabsWheel" @scroll="updateTabNav">
        <div
          v-for="f in code.openFiles"
          :key="f.path"
          class="cea-tab"
          :class="{ active: f.path === code.activePath }"
          :title="f.path"
          @click="activate(f.path)"
          @click.middle.prevent="close(f.path)"
          @contextmenu.prevent="onTabMenu($event, f.path)"
        >
          <span class="cea-tab-dot" :class="{ dirty: f.content !== f.original }"></span>
          <span class="cea-tab-name">{{ f.name }}</span>
          <span class="cea-tab-close" @click.stop="close(f.path)">
            <el-icon :size="10"><Close /></el-icon>
          </span>
        </div>
      </div>
      <button v-show="canScrollRight" class="cea-tab-nav" title="向右滚动" @click="scrollTabs(1)">
        <el-icon :size="12"><ArrowRight /></el-icon>
      </button>
    </div>

    <!-- ===== 面包屑：当前文件相对项目根的路径 ===== -->
    <div v-if="breadcrumbs.length" class="cea-crumbs">
      <el-icon :size="12" class="cea-crumb-ico"><FolderOpened /></el-icon>
      <template v-for="(seg, i) in breadcrumbs" :key="seg.abs">
        <span v-if="i" class="cea-crumb-sep">›</span>
        <button
          v-if="seg.isDir"
          class="cea-crumb"
          :title="seg.abs"
          @click="revealBreadcrumbDir(seg.abs)"
        >{{ seg.label }}</button>
        <span v-else class="cea-crumb current" :title="seg.abs">{{ seg.label }}</span>
      </template>
    </div>

    <!-- ===== 模型修改提示条：对比 / 处理 ===== -->
    <div v-if="activeAiChange && !showDiff" class="cea-ai-bar">
      <el-icon :size="13"><MagicStick /></el-icon>
      <span class="cea-ai-text">模型已修改此文件<template v-if="activeAiChange.count > 1">（{{ activeAiChange.count }} 次修改）</template></span>
      <span class="cea-ai-spacer"></span>
      <button class="cea-ai-btn" @click="showDiff = true">对比 / 处理</button>
    </div>

    <!-- ===== 合并冲突提示条 ===== -->
    <div v-if="activeIsConflict && !conflictMode && !showDiff" class="cea-conflict-bar">
      <el-icon :size="13"><Warning /></el-icon>
      <span class="cea-ai-text">此文件存在合并冲突</span>
      <span class="cea-ai-spacer"></span>
      <button class="cea-ai-btn" @click="conflictMode = true">解决冲突</button>
    </div>

    <!-- ===== 编辑区 ===== -->
    <div class="cea-body">
      <template v-if="active">
        <div v-if="active.error" class="cea-state cea-state-err">
          <el-icon :size="26"><WarningFilled /></el-icon>
          <p class="cea-state-title">无法打开该文件</p>
          <p class="cea-state-sub">{{ active.error }}</p>
        </div>
        <div v-else-if="active.loading" class="cea-state">
          <el-icon :size="22" class="spin"><Loading /></el-icon>
          <p class="cea-state-sub">读取中…</p>
        </div>
        <div v-else class="cea-edit">
          <!-- MD 三态悬浮切换：源码 / 分屏 / 预览（浮于内容区右上角） -->
          <div v-if="activeIsMd && !showDiff && !conflictMode" class="cea-md-switch" @click.stop>
            <button class="cea-md-btn" :title="mdViewLabel" @click="mdMenu = !mdMenu">
              <el-icon :size="14"><View /></el-icon>
              <el-icon :size="9" class="cea-md-caret"><CaretBottom /></el-icon>
            </button>
            <div v-if="mdMenu" class="cea-md-menu">
              <button v-for="o in MD_VIEWS" :key="o.v" class="cea-md-item" :class="{ on: mdView === o.v }" @click="setMdView(o.v)">
                <span>{{ o.label }}</span>
                <el-icon v-if="mdView === o.v" :size="11"><Check /></el-icon>
              </button>
            </div>
          </div>
          <!-- 模型修改 Diff 对比（应用 / 回退 / 忽略） -->
          <AiDiffView
            v-if="showDiff && activeAiChange"
            :change-id="activeAiChange.id"
            :path="active.path"
            @acted="onAiActed"
            @close="showDiff = false"
          />

          <!-- 非 MD：原 CM6 源码编辑器（带断点/调试/跳转） -->
          <CodeEditorPane
            v-else-if="!activeIsMd"
            :key="active.path"
            :value="active.content"
            :file-name="active.name"
            :breakpoints="code.breakpoints[active.path] || []"
            :active-line="debugActiveLine"
            :reveal="revealSignal"
            @update:value="(v) => code.updateContent(active!.path, v)"
            @save="saveActive"
            @cursor="onCursor"
            @toggle-breakpoint="(line) => code.toggleBreakpoint(active!.path, line)"
          />
          <!-- MD 三态：源码 / 分屏（左源码右实时预览）/ 预览 -->
          <template v-else>
            <CodeEditorPane
              v-if="mdView === 'source'"
              :key="active.path + '-src'"
              :value="active.content"
              :file-name="active.name"
              :breakpoints="code.breakpoints[active.path] || []"
              :active-line="debugActiveLine"
              :reveal="revealSignal"
              @update:value="(v) => code.updateContent(active!.path, v)"
              @save="saveActive"
              @cursor="onCursor"
              @toggle-breakpoint="(line) => code.toggleBreakpoint(active!.path, line)"
            />
            <div v-else-if="mdView === 'split'" class="cea-split">
              <div class="cea-split-pane">
                <CodeEditorPane
                  :key="active.path + '-split'"
                  :value="active.content"
                  :file-name="active.name"
                  :breakpoints="code.breakpoints[active.path] || []"
                  :active-line="debugActiveLine"
                  :reveal="revealSignal"
                  @update:value="(v) => code.updateContent(active!.path, v)"
                  @save="saveActive"
                  @cursor="onCursor"
                  @toggle-breakpoint="(line) => code.toggleBreakpoint(active!.path, line)"
                />
              </div>
              <div class="cea-split-handle"></div>
              <div class="cea-split-pane cea-split-preview">
                <MarkdownPreview :content="active.content" />
              </div>
            </div>
            <MarkdownPreview v-else :content="active.content" />
          </template>
        </div>
      </template>

      <div v-else class="cea-empty">
        <div class="cea-empty-logo">
          <el-icon :size="30"><Document /></el-icon>
        </div>
        <p class="cea-empty-title">{{ code.projectName || '未打开项目' }}</p>
        <p class="cea-empty-sub">从左侧资源管理器选择文件开始编辑 · Ctrl+S 保存</p>
        <div class="cea-empty-actions">
          <button class="cea-btn" @click="pickDir">
            <el-icon :size="13"><FolderOpened /></el-icon>{{ code.projectDir ? '切换项目目录' : '选择项目目录' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 合并冲突解决弹窗（三栏 IDE 风格） -->
    <CodeConflictEditor
      v-if="conflictMode"
      @resolved="onConflictResolved"
      @cancel="conflictMode = false"
    />

    <!-- ===== 可上下拖动的控制台 ===== -->
    <template v-if="code.consoleOpen">
      <div
        class="cea-handle-v"
        :class="{ dragging: consoleR.dragging.value }"
        @mousedown="consoleR.startDrag($event, 'up')"
        @dblclick="code.toggleConsole(false)"
      ></div>
      <div class="cea-console" :style="{ height: consoleH + 'px' }">
        <div class="cea-console-head">
          <el-icon :size="13" class="cea-console-icon"><Monitor /></el-icon>
          <span class="cea-console-title">控制台</span>
          <span class="cea-console-cwd" :title="code.projectDir">{{ code.projectDir || '未选择目录' }}</span>
          <el-tooltip content="最大化 / 还原" placement="top" :show-after="400">
            <button class="cea-icon-btn" @click="toggleMaxConsole">
              <el-icon :size="12"><FullScreen /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="收起控制台" placement="top" :show-after="400">
            <button class="cea-icon-btn" @click="code.toggleConsole(false)">
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </el-tooltip>
        </div>
        <div class="cea-console-body">
          <ChatConsolePanel />
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import {
  Close, Document, Loading, WarningFilled, Warning, FolderOpened, Monitor, FullScreen,
  ArrowLeft, ArrowRight, View, CaretBottom, Check, MagicStick,
} from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { useResizableV } from '../../composables/useResizableV';
import { api } from '../../api/client';
import CodeEditorPane from './CodeEditorPane.vue';
import MarkdownPreview from './MarkdownPreview.vue';
import ChatConsolePanel from '../chat/ChatConsolePanel.vue';

const emit = defineEmits<{ 'pick-dir': [] }>();
const code = useCodeStore();
const consoleR = useResizableV('code_console_h', 220, 90, 900);
const consoleH = consoleR.height;
const maximized = ref(false);
let lastHeight = 220;

const active = computed(() => code.activeFile);

// MD 文件在代码模式支持三态：源码 / 分屏（左源码右实时预览）/ 预览，与对话模式文件预览统一
const activeIsMd = computed(() => {
  const f = code.activeFile;
  if (!f) return false;
  const e = f.name.split('.').pop()?.toLowerCase() || '';
  return ['md', 'markdown'].includes(e);
});
const mdView = ref<'source' | 'split' | 'preview'>('split');
const mdMenu = ref(false);
const MD_VIEWS = [
  { v: 'source', label: '源码' },
  { v: 'split', label: '分屏' },
  { v: 'preview', label: '预览' },
] as const;
const mdViewLabel = computed(() => MD_VIEWS.find((o) => o.v === mdView.value)?.label || '视图');
function setMdView(v: 'source' | 'split' | 'preview') {
  mdView.value = v;
  mdMenu.value = false;
}
function onDocClickCloseMd() { mdMenu.value = false; }

// ===== 标签栏横向滚动（无滚动条；滚轮横向滚；两侧悬浮箭头） =====
const tabsScrollRef = ref<HTMLDivElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateTabNav() {
  const el = tabsScrollRef.value;
  if (!el) { canScrollLeft.value = false; canScrollRight.value = false; return; }
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}
/** 滚轮横向滚动：普通滚轮与 Shift+滚轮都横向滚标签条 */
function onTabsWheel(e: WheelEvent) {
  const el = tabsScrollRef.value;
  if (!el) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  el.scrollLeft += delta;
}
function scrollTabs(dir: number) {
  const el = tabsScrollRef.value;
  if (!el) return;
  el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
}

watch(() => code.openFiles.length, () => void nextTick(updateTabNav));
const isDirty = computed(() => {
  const f = code.activeFile;
  return !!f && f.content !== f.original;
});
/** 面包屑：当前文件相对项目根的路径分段（末段文件名，中间目录可点开系统文件管理器） */
const breadcrumbs = computed<Array<{ label: string; abs: string; isDir: boolean }>>(() => {
  const f = code.activeFile;
  if (!f || !code.projectDir) return [];
  const base = code.projectDir.replace(/[\\/]+$/, '');
  const sep = code.projectDir.includes('\\') && !code.projectDir.includes('/') ? '\\' : '/';
  const rel = f.path.startsWith(base) ? f.path.slice(base.length).replace(/^[\\/]+/, '') : f.path;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const segs: Array<{ label: string; abs: string; isDir: boolean }> = [];
  let acc = base;
  for (let i = 0; i < parts.length; i++) {
    acc = acc + sep + parts[i];
    segs.push({ label: parts[i], abs: acc, isDir: i < parts.length - 1 });
  }
  return segs;
});

function revealBreadcrumbDir(abs: string) {
  void api.post('/workspace/reveal', { path: abs });
}

/** 编辑器光标变化 → 状态栏 Ln/Col */
function onCursor(e: { line: number; col: number }) {
  code.setEditorCursor(e.line, e.col);
}

// ===== 模型修改快照（Diff / 应用 / 回退）=====
const showDiff = ref(false);
const activeAiChange = computed(() => {
  const f = code.activeFile;
  if (!f) return null;
  return code.aiChangeByPath(f.path) || null;
});

async function onAiActed(kind: 'apply' | 'revert' | 'dismiss', info?: { deleted?: boolean }) {
  showDiff.value = false;
  void code.fetchAiChanges();
  const f = code.activeFile;
  if (!f) return;
  if (kind === 'revert') {
    if (info?.deleted) code.closeFile(f.path);
    else await code.loadContent(f.path);
  }
}

// ===== 合并冲突（git 面板 / 提示条 → 冲突解决器）=====
const conflictMode = ref(false);
const conflictPaths = ref<Set<string>>(new Set());
const activeIsConflict = computed(() => {
  const f = code.activeFile;
  if (!f) return false;
  return conflictPaths.value.has(f.path.replace(/[\\/]+/g, '/'));
});

async function loadConflictPaths() {
  const dir = code.projectDir;
  if (!dir) { conflictPaths.value = new Set(); return; }
  const d = await api.get<{ repo: string | null }>(`/git/discover?dir=${encodeURIComponent(dir)}`);
  if ('error' in d || !d.data.repo) { conflictPaths.value = new Set(); return; }
  const c = await api.get<string[]>(`/git/conflicts?repo=${encodeURIComponent(d.data.repo)}`);
  if ('error' in c) { conflictPaths.value = new Set(); return; }
  const base = d.data.repo.replace(/[\\/]+$/, '').replace(/[\\/]+/g, '/');
  conflictPaths.value = new Set((c.data || []).map((p) => base + '/' + p));
}

function onConflictResolved() {
  conflictMode.value = false;
  void loadConflictPaths();
}

// git 面板点击冲突文件 → 打开文件并进入冲突解决器
watch(() => code.pendingConflict, async (p) => {
  if (!p) return;
  await code.openFile(p.path);
  conflictMode.value = true;
});

// 切标签时退出 diff / 冲突视图
watch(() => code.activePath, () => {
  showDiff.value = false;
  conflictMode.value = false;
});

watch(() => code.projectDir, () => { void loadConflictPaths(); });

/** 调试命中行：仅当暂停文件正是当前文件时高亮 */
const debugActiveLine = computed<number | null>(() => {
  const f = code.activeFile;
  const d = code.debugActive;
  if (!f || !d) return null;
  return d.path === f.path ? d.line : null;
});

/** 跳转信号（搜索结果 / 断点命中） */
const revealSignal = ref<{ line: number; column?: number; ts: number } | null>(null);

watch(() => code.pendingReveal, async (r) => {
  if (!r) return;
  // 目标文件没打开就先打开（会自动激活）
  if (!code.openFiles.some((f) => f.path === r.path)) await code.openFile(r.path);
  else code.activePath = r.path;
  // 跳转到 MD 时若正处于「预览」态（无编辑器），切到分屏以显示源码并定位
  if (activeIsMd.value && mdView.value === 'preview') mdView.value = 'split';
  // 等编辑器组件挂载
  await new Promise((res) => setTimeout(res, 80));
  revealSignal.value = { line: r.line, column: r.column, ts: r.ts };
});

function activate(path: string) {
  code.activePath = path;
  const f = code.openFiles.find((x) => x.path === path);
  if (f && !f.content && !f.error) void code.loadContent(path);
}

function close(path: string) {
  const f = code.openFiles.find((x) => x.path === path);
  if (f && f.content !== f.original) {
    void ElMessageBox.confirm(`「${f.name}」有未保存的修改，确定关闭吗？`, '未保存', {
      confirmButtonText: '关闭不保存', cancelButtonText: '取消', type: 'warning',
    }).then(() => code.closeFile(path)).catch(() => { /* 取消 */ });
    return;
  }
  code.closeFile(path);
}

function onTabMenu(_e: MouseEvent, path: string) {
  const f = code.openFiles.find((x) => x.path === path);
  if (!f) return;
  void ElMessageBox.confirm(`关闭「${f.name}」？`, '关闭标签', {
    confirmButtonText: '关闭', cancelButtonText: '取消',
  }).then(() => code.closeFile(path)).catch(() => { /* 取消 */ });
}

async function saveActive() {
  const f = code.activeFile;
  if (!f) return;
  const ok = await code.saveFile(f.path);
  if (ok) ElMessage.success(`已保存 ${f.name}`);
  else if (f.error) ElMessage.error(f.error);
}

function toggleMaxConsole() {
  if (maximized.value) {
    consoleH.value = lastHeight;
    maximized.value = false;
  } else {
    lastHeight = consoleH.value;
    consoleH.value = 900;
    maximized.value = true;
  }
}

function pickDir() {
  emit('pick-dir');
}

// Ctrl+S 全局保存；Ctrl+` 切换控制台
function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    if (isDirty.value) void saveActive();
    return;
  }
  if (mod && e.key === '`') {
    e.preventDefault();
    code.toggleConsole();
  }
}
onMounted(() => {
  code.rememberTabs();
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocClickCloseMd);
  void nextTick(updateTabNav);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocClickCloseMd);
});
</script>

<style scoped>
.cea {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--glass-bg, #fff);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
}

/* ===== 标签栏 ===== */
.cea-tabs {
  display: flex;
  align-items: stretch;
  height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--glass-bg-hover, #f1efe9);
}
.cea-tabs-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  scroll-behavior: smooth;
}
.cea-tabs-scroll::-webkit-scrollbar { display: none; }
.cea-tab-nav {
  flex-shrink: 0;
  width: 22px;
  border: none;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--glass-bg-hover, #f1efe9);
  color: var(--color-text-secondary, #6b6b66);
  cursor: pointer; z-index: 2;
}
.cea-tab-nav:hover { color: var(--color-primary, #c2410c); background: var(--glass-bg-hover, #f1efe9); }

.cea-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: auto;
  max-width: 190px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b6b66);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid var(--glass-border, #e7e4dc);
  background: transparent;
  position: relative;
  transition: background 0.12s ease, color 0.12s ease;
}
.cea-tab:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-text, #1a1a1a); }
.cea-tab.active {
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1a1a);
  font-weight: 500;
}
.cea-tab.active::before {
  content: '';
  position: absolute; left: 0; right: 0; top: 0; height: 2px;
  background: var(--color-primary, #c2410c);
}
.cea-tab-name { overflow: hidden; text-overflow: ellipsis; }
.cea-tab-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: transparent; flex-shrink: 0;
}
.cea-tab-dot.dirty { background: var(--color-primary, #c2410c); }
.cea-tab-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; border-radius: 4px;
  color: var(--color-text-tertiary, #9c9b94);
  opacity: 0; flex-shrink: 0;
}
.cea-tab:hover .cea-tab-close, .cea-tab.active .cea-tab-close { opacity: 1; }
.cea-tab-close:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--el-color-danger); }

.cea-icon-btn {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease;
}
.cea-icon-btn:hover:not(:disabled) { background: var(--glass-bg-hover, #f1efe9); color: var(--color-text, #1a1a1a); }
.cea-icon-btn:disabled { opacity: 0.35; cursor: default; }
.cea-icon-btn.on { color: var(--color-primary, #c2410c); background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent); }

/* ===== 编辑区 ===== */
.cea-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

/* 编辑容器（包裹三态，撑满编辑区；作为 MD 悬浮切换的定位上下文） */
.cea-edit { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }

/* MD 三态悬浮切换（内容区右上角） */
.cea-md-switch { position: absolute; top: 8px; right: 14px; z-index: 20; }
.cea-md-btn {
  display: inline-flex; align-items: center; gap: 3px;
  height: 26px; padding: 0 8px;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface, #fff) 88%, transparent);
  backdrop-filter: blur(6px);
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: all 0.15s ease;
}
.cea-md-btn:hover, .cea-md-btn:has(+ .cea-md-menu) { color: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); }
.cea-md-caret { opacity: 0.6; }
.cea-md-menu {
  position: absolute; top: 32px; right: 0; min-width: 96px;
  padding: 4px; border-radius: 8px;
  border: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column; gap: 1px;
}
.cea-md-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 26px; padding: 0 9px;
  border: none; border-radius: 5px; background: transparent;
  font-size: 12px; color: var(--color-text, #1a1a1a); cursor: pointer;
  text-align: left;
}
.cea-md-item:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-primary, #c2410c); }
.cea-md-item.on { color: var(--color-primary, #c2410c); font-weight: 600; }

/* MD 分屏：左源码右实时预览（各占一半，独立滚动） */
.cea-split { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.cea-split-pane {
  flex: 1 1 50%; min-width: 0; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}
.cea-split-pane > * { flex: 1; min-height: 0; }
.cea-split-handle { flex: 0 0 1px; background: var(--glass-border, #e7e4dc); }
.cea-split-preview {
  border-left: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface, #fff);
}

.cea-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  color: var(--color-text-tertiary, #9c9b94);
}
.cea-state-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.cea-state-sub { margin: 0; font-size: 12px; max-width: 420px; text-align: center; line-height: 1.6; }
.cea-state-err .cea-state-title { color: var(--el-color-danger); }
.spin { animation: cea-spin 0.9s linear infinite; }
@keyframes cea-spin { to { transform: rotate(360deg); } }

.cea-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 24px; text-align: center;
  background:
    radial-gradient(240px 140px at 50% 34%, color-mix(in srgb, var(--color-primary, #c2410c) 6%, transparent), transparent);
}
.cea-empty-logo {
  width: 62px; height: 62px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary, #c2410c);
  background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary, #c2410c) 18%, transparent);
}
.cea-empty-title { margin: 4px 0 0; font-size: 15px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.cea-empty-sub { margin: 0; font-size: 12px; color: var(--color-text-tertiary, #9c9b94); }
.cea-empty-actions { margin-top: 6px; }
.cea-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; font-size: 12px; font-weight: 500;
  border: 1px solid var(--glass-border-strong, #d8d5cc); border-radius: 8px;
  background: var(--color-surface, #fff); color: var(--color-text, #1a1a1a); cursor: pointer;
  transition: all 0.15s ease;
}
.cea-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }

/* ===== 模型修改 / 冲突提示条 ===== */
.cea-ai-bar, .cea-conflict-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  flex-shrink: 0;
  font-size: 11.5px;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.cea-ai-bar {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 7%, var(--color-surface-hover));
  color: var(--color-primary, #c2410c);
}
.cea-conflict-bar {
  background: color-mix(in srgb, #ef4444 8%, var(--color-surface-hover));
  color: #ef4444;
}
.cea-ai-text { color: var(--color-text, #1a1a1a); }
.cea-ai-spacer { flex: 1; }
.cea-ai-btn {
  height: 20px;
  padding: 0 9px;
  font-size: 11px;
  border: 1px solid var(--glass-border-strong, #d8d5cc);
  border-radius: 5px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1a1a);
  cursor: pointer;
  flex-shrink: 0;
}
.cea-ai-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }

/* ===== 控制台 ===== */
.cea-handle-v {
  flex: 0 0 6px; height: 6px; cursor: row-resize; position: relative; z-index: 5;
  background: transparent; transition: background 0.15s ease;
}
.cea-handle-v::after {
  content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px;
  transform: translateY(-50%); background: var(--glass-border, #e7e4dc); border-radius: 1px;
}
.cea-handle-v:hover, .cea-handle-v.dragging { background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent); }
.cea-handle-v:hover::after, .cea-handle-v.dragging::after { background: var(--color-primary, #c2410c); height: 3px; }

.cea-console {
  flex: 0 0 auto;
  display: flex; flex-direction: column;
  border-top: 1px solid var(--glass-border, #e7e4dc);
  background: var(--glass-bg-hover, #f1efe9);
  overflow: hidden;
}
.cea-console-head {
  display: flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.cea-console-icon { color: var(--color-text-tertiary, #9c9b94); }
.cea-console-title { font-size: 11.5px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.cea-console-cwd {
  flex: 1; min-width: 0; font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cea-console-body { flex: 1; min-height: 0; }

/* ===== 面包屑 ===== */
.cea-crumbs {
  display: flex; align-items: center; gap: 2px;
  height: 24px; padding: 0 8px; flex-shrink: 0;
  font-size: 11.5px; color: var(--color-text-tertiary, #9c9b94);
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  overflow: hidden; white-space: nowrap;
}
.cea-crumb-ico { color: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; margin-right: 2px; }
.cea-crumb {
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 5px; border: none; border-radius: 4px; background: transparent;
  font-size: 11.5px; font-family: inherit; color: var(--color-text-secondary, #6b6b66);
  cursor: pointer; transition: background 0.12s ease, color 0.12s ease;
}
.cea-crumb:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-primary, #c2410c); }
.cea-crumb.current { color: var(--color-text, #1a1a1a); font-weight: 600; cursor: default; }
.cea-crumb.current:hover { background: transparent; color: var(--color-text, #1a1a1a); }
.cea-crumb-sep { color: var(--color-text-tertiary, #9c9b94); opacity: 0.6; flex-shrink: 0; padding: 0 1px; }
</style>
