<template>
  <div class="cea">
    <!-- ===== 文件标签栏 ===== -->
    <div class="cea-tabs">
      <div class="cea-tabs-scroll">
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
      <div class="cea-tabs-actions">
        <el-tooltip content="保存 (Ctrl+S)" placement="bottom" :show-after="400">
          <button class="cea-icon-btn" :disabled="!isDirty" @click="saveActive">
            <el-icon :size="13"><DocumentChecked /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="关闭其他标签" placement="bottom" :show-after="400">
          <button class="cea-icon-btn" :disabled="code.openFiles.length < 2" @click="code.closeOthers(code.activePath || '')">
            <el-icon :size="13"><CircleClose /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip :content="code.consoleOpen ? '收起控制台' : '展开控制台'" placement="bottom" :show-after="400">
          <button class="cea-icon-btn" :class="{ on: code.consoleOpen }" @click="code.toggleConsole()">
            <el-icon :size="13"><Bottom /></el-icon>
          </button>
        </el-tooltip>
      </div>
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
        <CodeEditorPane
          v-else
          :key="active.path"
          :value="active.content"
          :file-name="active.name"
          :breakpoints="code.breakpoints[active.path] || []"
          :active-line="debugActiveLine"
          :reveal="revealSignal"
          @update:value="(v) => code.updateContent(active!.path, v)"
          @save="saveActive"
          @toggle-breakpoint="(line) => code.toggleBreakpoint(active!.path, line)"
        />
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

    <!-- ===== 状态栏 ===== -->
    <div class="cea-status">
      <span class="cea-status-item" :title="active?.path || ''">{{ active ? active.path : '未打开文件' }}</span>
      <span class="cea-status-spacer"></span>
      <template v-if="active">
        <span class="cea-status-item">{{ langLabel(active.name) }}</span>
        <span class="cea-status-item">{{ lineCount }} 行</span>
        <span class="cea-status-item">UTF-8</span>
        <span v-if="(code.breakpoints[active.path] || []).length" class="cea-status-item bp">
          <el-icon :size="10"><VideoPlay /></el-icon>{{ (code.breakpoints[active.path] || []).length }} 个断点
        </span>
        <span v-if="active.content !== active.original" class="cea-status-item dirty">未保存</span>
      </template>
      <span v-else class="cea-status-item">{{ code.projectDir ? '就绪' : '未选择项目目录' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import {
  Close, DocumentChecked, CircleClose, Bottom, Document, Loading, WarningFilled,
  FolderOpened, Monitor, FullScreen, VideoPlay,
} from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { useResizableV } from '../../composables/useResizableV';
import { langLabel } from './codeLang';
import CodeEditorPane from './CodeEditorPane.vue';
import ChatConsolePanel from '../chat/ChatConsolePanel.vue';

const emit = defineEmits<{ 'pick-dir': [] }>();
const code = useCodeStore();
const consoleR = useResizableV('code_console_h', 220, 90, 900);
const consoleH = consoleR.height;
const maximized = ref(false);
let lastHeight = 220;

const active = computed(() => code.activeFile);
const isDirty = computed(() => {
  const f = code.activeFile;
  return !!f && f.content !== f.original;
});
const lineCount = computed(() => {
  const f = code.activeFile;
  if (!f || !f.content) return 0;
  return f.content.split('\n').length;
});

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

// Ctrl+S 全局保存（编辑器内已处理，这里兜住焦点在别处的情况）
function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    if (isDirty.value) void saveActive();
  }
}
onMounted(() => {
  code.rememberTabs();
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.cea {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface, #fff);
}

/* ===== 标签栏 ===== */
.cea-tabs {
  display: flex;
  align-items: center;
  height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--el-fill-color-lighter, #faf9f6);
}
.cea-tabs-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  scrollbar-width: thin;
}
.cea-tabs-scroll::-webkit-scrollbar { height: 0; }
.cea-tabs-actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; flex-shrink: 0; }

.cea-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  max-width: 190px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b6b66);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid transparent;
}
.cea-tab:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-text, #1a1a1a); }
.cea-tab.active {
  background: var(--color-surface, #fff);
  border-color: var(--glass-border, #e7e4dc);
  color: var(--color-text, #1a1a1a);
  font-weight: 500;
  box-shadow: inset 0 -2px 0 var(--color-primary, #c2410c);
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
  background: var(--el-fill-color-lighter, #faf9f6);
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

/* ===== 状态栏 ===== */
.cea-status {
  display: flex; align-items: center; gap: 12px;
  height: 24px; padding: 0 10px; flex-shrink: 0;
  border-top: 1px solid var(--glass-border, #e7e4dc);
  background: var(--el-fill-color-lighter, #faf9f6);
  font-size: 11px; color: var(--color-text-tertiary, #9c9b94);
}
.cea-status-spacer { flex: 1; }
.cea-status-item {
  max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 3px;
}
.cea-status-item.bp { color: var(--el-color-danger); }
.cea-status-item.dirty { color: var(--color-primary, #c2410c); }
</style>
