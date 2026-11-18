<!--
  OfficeWorkbench.vue — 办公工作台（2026-11-02，P2）

  办公室模式的「人工」形态：工作区文件树 ｜ 文档/表格/演示画布 ｜ 人工窄条。
  「AI」形态就是聊天页本身（/chat）；切换入口在聊天顶栏的 AI / 人工 segmented。
  人工模式不调用任何模型，右栏只保留切回 AI 的按钮。
-->
<template>
  <div class="office-wb" :class="{ 'is-mobile-shell': mobileShell }" :style="{ '--wb-tree-w': treeW + 'px' }">
    <header v-if="mobileShell" class="office-mobile-bar">
      <button
        class="office-mobile-icon-btn"
        type="button"
        data-action="open-file-drawer"
        aria-label="打开工作区文件"
        :aria-expanded="fileDrawerOpen"
        @click="openFileDrawer"
      >
        <el-icon :size="19"><FolderOpened /></el-icon>
        <span>文件</span>
      </button>
      <div class="office-mobile-title">
        <b>{{ fileName || '办公工作台' }}</b>
        <small>{{ fileSub }}</small>
      </div>
      <div class="office-mobile-actions">
        <WorkspaceModeSwitch />
        <MobileModeSwitch />
        <button class="office-mobile-icon-btn" type="button" aria-label="新建文档" @click="createMobileDocument">
          <el-icon :size="20"><Plus /></el-icon>
          <span>新建</span>
        </button>
      </div>
    </header>

    <!-- 左：文件树（移动端为覆盖式文件抽屉） -->
    <div
      ref="fileDrawerRef"
      class="wb-tree-shell"
      :class="{ open: fileDrawerOpen }"
      :role="mobileShell ? 'dialog' : undefined"
      :aria-modal="mobileShell && fileDrawerOpen ? 'true' : undefined"
      :aria-label="mobileShell ? '工作区文件' : undefined"
      @keydown.esc="fileDrawerOpen = false"
    >
      <header v-if="mobileShell" class="wb-drawer-head">
        <div><b>工作区文件</b><small>{{ rootDir || '选择工作目录后开始' }}</small></div>
        <button type="button" aria-label="关闭文件抽屉" @click="fileDrawerOpen = false">
          <el-icon :size="18"><Close /></el-icon>
        </button>
      </header>
      <WorkspaceFileTree ref="treeRef" class="wb-tree" @select="onWorkspaceFileSelected" />
    </div>
    <button
      v-if="mobileShell && fileDrawerOpen"
      class="wb-file-drawer-mask"
      type="button"
      aria-label="关闭文件抽屉"
      @click="fileDrawerOpen = false"
    />
    <div v-if="!mobileShell" class="rs-handle" @mousedown="treeR.startDrag($event, 'left')"></div>

    <!-- 中：画布 -->
    <section class="wb-main" :inert="mobileShell && fileDrawerOpen ? true : undefined">
      <header v-if="!mobileShell" class="wb-main-head">
        <nav class="wb-surface-tabs" aria-label="办公主视图">
          <button
            type="button"
            :class="{ active: workSurface === 'tasks' }"
            @click="setWorkSurface('tasks')"
          >
            <el-icon :size="14"><Grid /></el-icon>
            任务台
          </button>
          <button
            type="button"
            :class="{ active: workSurface === 'editor' }"
            :disabled="!selectedPath"
            @click="setWorkSurface('editor')"
          >
            <el-icon :size="14"><Document /></el-icon>
            文件编辑
          </button>
        </nav>
        <div class="wb-main-title">
          <span class="wb-file-name">{{ fileName || '办公工作台' }}</span>
          <span class="wb-file-sub">{{ fileSub }}</span>
        </div>
        <div v-if="selectedPath" class="wb-main-actions">
          <el-button size="small" :icon="ChatDotRound" @click="goAi">交给 AI</el-button>
          <el-button size="small" :icon="Download" @click="exportFile">{{ exportLabel }}</el-button>
          <el-button size="small" :icon="Link" @click="openLocal">本机打开</el-button>
        </div>
      </header>

      <!-- 原型任务台与现有文件编辑器并列为主视图，选中文件不再让任务上下文消失。 -->
      <div v-if="workSurface === 'tasks'" class="wb-desk">
        <header class="wb-desk-brief">
          <div>
            <span>今日任务台</span>
            <h1>{{ officeGreeting }}</h1>
            <p>{{ officeTaskSummary }}</p>
          </div>
          <div class="wb-desk-brief-actions">
            <el-button :icon="FolderOpened" @click="showWorkspaceDir = true">
              {{ rootDir ? '切换工作区' : '选择工作区' }}
            </el-button>
            <el-button :icon="Refresh" @click="refresh()">刷新文件</el-button>
            <el-button type="primary" :icon="Plus" @click="startOfficeTask">新建任务</el-button>
          </div>
        </header>

        <div class="wb-desk-stats" aria-label="任务概览">
          <div><span>正在执行</span><b>{{ runningOfficeTasks.length }}</b><small>实时运行中的任务</small></div>
          <div><span>等待输入</span><b>{{ waitingOfficeTasks.length }}</b><small>需要确认或补充信息</small></div>
          <div><span>最近任务</span><b>{{ officeTasks.length }}</b><small>当前工作区全部任务</small></div>
        </div>

        <div class="wb-desk-grid">
          <section class="wb-task-board" aria-label="办公任务看板">
            <div v-if="mobileShell && allOfficeTasksEmpty" class="wb-task-board-empty">
              <el-icon :size="20"><CircleCheck /></el-icon>
              <span>
                <b>当前没有待处理任务</b>
                <small>新建任务后会按执行状态自动出现在这里</small>
              </span>
            </div>
            <template v-for="column in officeTaskColumns" :key="column.key">
              <article v-if="!mobileShell || column.tasks.length" class="wb-task-column">
                <header>
                  <i :class="column.key"></i>
                  <b>{{ column.label }}</b>
                  <span>{{ column.tasks.length }}</span>
                </header>
                <div class="wb-task-list">
                  <button
                    v-for="task in column.tasks"
                    :key="task.id"
                    type="button"
                    class="wb-task-item"
                    @click="openOfficeTask(task.id)"
                  >
                    <span class="wb-task-item-head">
                      <i><el-icon :size="14"><component :is="column.icon" /></el-icon></i>
                      <b>{{ task.title || '未命名任务' }}</b>
                      <small>{{ taskAgentName(task.agentId) }}</small>
                    </span>
                    <span class="wb-task-item-meta">
                      {{ taskPlanLabel(task) }}
                      <em>{{ formatOfficeTaskTime(task.updatedAt || task.lastActivityAt || task.createdAt) }}</em>
                    </span>
                    <i v-if="taskPlanProgress(task).total" class="wb-task-progress">
                      <span :style="{ width: `${taskPlanProgress(task).percent}%` }"></span>
                    </i>
                  </button>
                </div>
              </article>
            </template>
          </section>

          <aside class="wb-desk-inspector">
            <section>
              <header><span>当前工作区</span><b>{{ rootDir ? '已连接' : '未设置' }}</b></header>
              <strong :title="rootDir || '尚未选择工作目录'">{{ rootDir || '尚未选择工作目录' }}</strong>
              <button type="button" @click="showWorkspaceDir = true">
                <el-icon :size="14"><FolderOpened /></el-icon>{{ rootDir ? '更换目录' : '选择目录' }}
              </button>
            </section>
            <section>
              <header><span>人工工作台</span><b>不调用模型</b></header>
              <button type="button" @click="treeRef?.doCreate('doc')">
                <el-icon :size="14"><Plus /></el-icon>新建文档
              </button>
              <button type="button" @click="openFileDrawer">
                <el-icon :size="14"><Files /></el-icon>浏览文件
              </button>
              <button type="button" @click="goAi">
                <el-icon :size="14"><ChatDotRound /></el-icon>交给 AI
              </button>
            </section>
            <section>
              <header><span>最近任务</span><b>{{ recentOfficeTasks.length }}</b></header>
              <button
                v-for="task in recentOfficeTasks.slice(0, 4)"
                :key="`recent-${task.id}`"
                type="button"
                class="wb-inspector-task"
                @click="openOfficeTask(task.id)"
              >
                <span>{{ task.title || '未命名任务' }}</span>
                <small>{{ formatOfficeTaskTime(task.updatedAt || task.createdAt) }}</small>
              </button>
              <p v-if="!recentOfficeTasks.length">还没有任务记录</p>
            </section>
          </aside>
        </div>
      </div>

      <div v-else class="wb-editor">
        <div class="wb-editor-pulse" aria-label="办公任务状态">
          <button type="button" @click="setWorkSurface('tasks')">
            <i class="running"></i>执行中 <b>{{ runningOfficeTasks.length }}</b>
          </button>
          <button type="button" @click="setWorkSurface('tasks')">
            <i class="waiting"></i>待处理 <b>{{ waitingOfficeTasks.length }}</b>
          </button>
          <button type="button" @click="setWorkSurface('tasks')">
            <i class="recent"></i>最近任务 <b>{{ officeTasks.length }}</b>
          </button>
          <span class="wb-editor-pulse-spacer"></span>
          <button type="button" class="wb-editor-pulse-task" @click="setWorkSurface('tasks')">
            打开任务台
          </button>
        </div>
        <FilePreview v-if="useFilePreview" ref="editorRef" :file="{ name: fileName, path: selectedPath }" />
        <OfficeDocumentView v-else :path="selectedPath" />
      </div>

      <!-- 人工 → AI：与开发模式同一形态的右下角悬浮按钮 -->
      <LeadToggle :model-value="'human'" mode="office" @update:model-value="goAi" />
      <footer v-if="mobileShell && selectedPath" class="wb-mobile-actions">
        <button type="button" @click="exportFile">
          <el-icon :size="18"><Download /></el-icon><span>{{ exportLabel }}</span>
        </button>
      </footer>
    </section>

    <!-- 聊天共用的弹层：工作目录选择 / 技能卡 / 定时任务等（与聊天页同一套） -->
    <ChatDialogs />
    <ChatSkillCards />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ChatDotRound, CircleCheck, Clock, Close, Document, Download, Files, FolderOpened, Grid, Link, Plus, Refresh, Warning,
} from '@element-plus/icons-vue';
import WorkspaceFileTree from '../../components/office/WorkspaceFileTree.vue';
import OfficeDocumentView from '../../components/office/OfficeDocumentView.vue';
import FilePreview from '../../components/FilePreview.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import ChatDialogs from '../../components/chat/ChatDialogs.vue';
import ChatSkillCards from '../../components/chat/ChatSkillCards.vue';
import MobileModeSwitch from '../../components/MobileModeSwitch.vue';
import WorkspaceModeSwitch from '../../components/workbench/WorkspaceModeSwitch.vue';
import { useWorkspaceFiles } from '../../composables/office/useWorkspaceFiles';
import { useResizable } from '../../composables/useResizable';
import { officePanel, setOfficePanel, officeSelectedFile } from '../../stores/officeWorkbench';
import { useAgentStore } from '../../stores/agent';
import { API_BASE, buildRequestHeaders } from '../../api/client';
import { useChat } from '../../composables/chat/useChat';
import { useMobileShell } from '../../composables/useMobileShell';

const { selectedPath, rootDir, refresh, loadRoot, revealPath } = useWorkspaceFiles();
const treeRef = ref<InstanceType<typeof WorkspaceFileTree> | null>(null);
const fileDrawerRef = ref<HTMLElement | null>(null);
const fileDrawerOpen = ref(false);
const workSurface = ref<'tasks' | 'editor'>(selectedPath.value ? 'editor' : 'tasks');
const mobileShell = useMobileShell();
let agentStore: ReturnType<typeof useAgentStore> | null = null;
try {
  agentStore = useAgentStore();
} catch { /* isolated mount tests do not install Pinia */ }
const editorRef = ref<InstanceType<typeof FilePreview> | null>(null);
/** 工作目录选择弹窗与聊天页共用同一个（见 ChatDialogs） */
const chat = useChat();
const { showWorkspaceDir } = chat;
const router = useRouter();

/** 办公模式的 AI 形态 = 聊天页本身；工作台只承担「人工」形态 */
function goAi() {
  setOfficePanel('ai');
  void router.push('/chat');
}

async function startOfficeTask() {
  setOfficePanel('ai');
  await chat.startNewChat();
  await router.push('/chat');
}

async function openOfficeTask(conversationId: string) {
  if (!conversationId) return;
  await chat.selectConv(conversationId);
  setOfficePanel('ai');
  await router.push('/chat');
}

async function openFileDrawer() {
  fileDrawerOpen.value = true;
  await nextTick();
  fileDrawerRef.value?.querySelector<HTMLElement>('.ws-row.is-active, .ws-icon-btn, button')?.focus();
}

function createMobileDocument() {
  fileDrawerOpen.value = false;
  treeRef.value?.doCreate('doc');
}

function onWorkspaceFileSelected(path: string) {
  if (!path) return;
  workSurface.value = 'editor';
  if (mobileShell.value) fileDrawerOpen.value = false;
}

function setWorkSurface(surface: 'tasks' | 'editor'): void {
  if (surface === 'editor' && !selectedPath.value) return;
  workSurface.value = surface;
}

// 工作台只承担人工形态：直接打开 /office 且上次停在 AI 时，回到聊天页；
// 否则恢复上次打开的文件（含祖先目录展开）。
onMounted(async () => {
  if (officePanel.value === 'ai') {
    void router.replace('/chat');
    return;
  }
  await loadRoot();
  if (!selectedPath.value && officeSelectedFile.value) {
    await revealPath(officeSelectedFile.value);
  }
});
watch(selectedPath, (path) => {
  workSurface.value = path ? 'editor' : 'tasks';
  if (mobileShell.value) fileDrawerOpen.value = false;
});
const treeR = useResizable('office_tree', 264, 200, 480);
const { width: treeW } = treeR;

const fileName = computed(() => {
  const p = selectedPath.value;
  if (!p) return '';
  return p.split(/[\\/]/).pop() || p;
});
const fileSub = computed(() => {
  if (!selectedPath.value) return '从左侧选择或新建文档';
  return useFilePreview.value ? '可直接编辑 · 自动保存' : '可编辑文字 · 保存到本机';
});

const officeTasks = computed(() => [...(chat.store?.conversations || [])]
  .filter((task) => (task.mode || 'office') === 'office')
  .filter((task) => !task.archivedAt && !task.deletedAt && task.source !== 'browser-page')
  .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));
const runningOfficeTasks = computed(() =>
  officeTasks.value.filter((task) => chat.store?.runningConvIds?.has(task.id)),
);
const waitingOfficeTasks = computed(() =>
  officeTasks.value.filter((task) => (
    !chat.store?.runningConvIds?.has(task.id)
    && (task.taskPlan?.steps || []).some((step) => ['waiting', 'pending', 'blocked', 'paused'].includes(String(step.status)))
  )),
);
const recentOfficeTasks = computed(() => {
  const running = new Set(runningOfficeTasks.value.map((task) => task.id));
  const waiting = new Set(waitingOfficeTasks.value.map((task) => task.id));
  return officeTasks.value.filter((task) => !running.has(task.id) && !waiting.has(task.id));
});
const officeTaskColumns = computed(() => [
  {
    key: 'running',
    label: '执行中',
    icon: Clock,
    tasks: runningOfficeTasks.value,
    empty: '当前没有运行中的任务',
  },
  {
    key: 'waiting',
    label: '需要你处理',
    icon: Warning,
    tasks: waitingOfficeTasks.value,
    empty: '没有等待确认的任务',
  },
  {
    key: 'recent',
    label: '最近任务',
    icon: CircleCheck,
    tasks: recentOfficeTasks.value.slice(0, 6),
    empty: '还没有办公任务',
  },
]);
const allOfficeTasksEmpty = computed(() => officeTaskColumns.value.every((column) => column.tasks.length === 0));
const officeTaskSummary = computed(() => {
  if (runningOfficeTasks.value.length) {
    return `${runningOfficeTasks.value.length} 个任务正在执行，${waitingOfficeTasks.value.length} 个需要你处理。`;
  }
  if (waitingOfficeTasks.value.length) return `${waitingOfficeTasks.value.length} 个任务在等你确认或补充信息。`;
  return officeTasks.value.length ? '当前没有运行中的任务，可以从最近任务继续。' : '从一项具体工作开始，需要时随时交给 AI。';
});
const officeGreeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 11 ? '上午好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
});

function taskAgentName(agentId?: string): string {
  return agentStore?.agents.find((agent) => agent.id === agentId)?.name || '日常办公助手';
}

function taskPlanProgress(task: { taskPlan?: { steps?: Array<{ status?: string }> } | null }) {
  const steps = task.taskPlan?.steps || [];
  const done = steps.filter((step) => step.status === 'done' || step.status === 'completed').length;
  return {
    total: steps.length,
    done,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}

function taskPlanLabel(task: { taskPlan?: { steps?: Array<{ status?: string }> } | null }): string {
  const progress = taskPlanProgress(task);
  if (!progress.total) return '人工任务';
  return `步骤 ${progress.done}/${progress.total}`;
}

function formatOfficeTaskTime(value?: number | string | null): string {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return '刚刚';
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/**
 * 复用专门的编辑器：FilePreview 支持 md/txt/代码/xlsx/pdf/图片；
 * docx/pptx 走 OfficeDocumentView —— 结构化块 + 画布内「编辑 / 取消 / 保存」（与 PPT 一致）。
 */
const useFilePreview = computed(() => {
  const p = selectedPath.value;
  if (!p) return false;
  return !/\.(pptx|docx)$/i.test(p);
});

const isYdocFile = computed(() => /\.ydoc$/i.test(selectedPath.value));
const exportLabel = computed(() => (isYdocFile.value ? '导出 Word' : '导出'));

async function exportFile() {
  const p = selectedPath.value;
  if (!p) return;
  try {
    // 自定义文档格式 .ydoc：直接走 DocumentCard 的 Word 导出（可编辑图表）
    if (isYdocFile.value) {
      editorRef.value?.exportYdocWord?.();
      return;
    }
    const name = fileName.value || 'document';
    const electronAPI = (window as unknown as { electronAPI?: any }).electronAPI;
    if (electronAPI?.dialog?.saveFile) {
      const r = await electronAPI.dialog.saveFile({ defaultName: name, sourcePath: p });
      if (r?.ok) ElMessage.success('已导出到 ' + r.path);
      else if (r && !r.cancelled) ElMessage.error('导出失败: ' + (r.error || '未知错误'));
      return;
    }
    const res = await fetch(`${API_BASE}/office/export?path=${encodeURIComponent(p)}`, { headers: buildRequestHeaders() });
    if (!res.ok) { ElMessage.error(`导出失败（HTTP ${res.status}）`); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || e));
  }
}

function openLocal() {
  const p = selectedPath.value;
  if (!p) return;
  const electronAPI = (window as unknown as { electronAPI?: any }).electronAPI;
  if (electronAPI?.shell?.openPath) {
    void electronAPI.shell.openPath(p).catch(() => ElMessage.error('本机打开失败'));
    return;
  }
  ElMessage.info('仅桌面端支持用本机应用打开');
}

</script>

<style src="../chat.css"></style>

<style scoped>
.office-wb {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--color-bg);
}
.wb-tree-shell {
  flex: 0 0 var(--wb-tree-w, 264px);
  width: var(--wb-tree-w, 264px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wb-tree {
  flex: 1;
  width: 100%;
  min-height: 0;
}
.wb-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}
.wb-main-head {
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.wb-surface-tabs {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface-hover);
}
.wb-surface-tabs button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}
.wb-surface-tabs button:hover {
  color: var(--color-text);
}
.wb-surface-tabs button.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 3px rgba(20, 30, 25, .09);
  font-weight: 650;
}
.wb-surface-tabs button:disabled {
  opacity: .42;
  cursor: default;
}
.wb-main-title { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
.wb-file-name {
  font-size: 12.5px; font-weight: 600; color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px;
}
.wb-file-sub { font-size: 11px; color: var(--color-text-tertiary); white-space: nowrap; }
.wb-main-actions { margin-left: auto; display: flex; gap: 6px; flex-shrink: 0; }
.wb-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.wb-editor-pulse {
  display: flex;
  min-height: 36px;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.wb-editor-pulse button {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 9.5px;
  cursor: pointer;
}
.wb-editor-pulse button:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}
.wb-editor-pulse button i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}
.wb-editor-pulse button i.running { background: var(--color-primary); }
.wb-editor-pulse button i.waiting { background: var(--color-warning); }
.wb-editor-pulse button i.recent { background: var(--color-success); }
.wb-editor-pulse button b {
  color: var(--color-text);
  font-size: 10px;
}
.wb-editor-pulse-spacer { flex: 1; }
.wb-editor-pulse .wb-editor-pulse-task {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-primary);
}
/* 右下角悬浮的切换按钮（LeadToggle）以画布为定位基准 */
.wb-main { position: relative; }

.wb-desk {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 24px 34px;
}
.wb-desk-brief {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}
.wb-desk-brief > div:first-child > span {
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
}
.wb-desk-brief h1 {
  margin: 4px 0 3px;
  font-size: 25px;
  line-height: 1.25;
}
.wb-desk-brief p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.wb-desk-brief-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.wb-desk-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 16px 0;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.wb-desk-stats > div {
  min-width: 0;
  padding: 12px 14px;
  border-left: 1px solid var(--color-border);
}
.wb-desk-stats > div:first-child { border-left: 0; }
.wb-desk-stats span,
.wb-desk-stats b,
.wb-desk-stats small { display: block; }
.wb-desk-stats span { color: var(--color-text-tertiary); font-size: 9px; }
.wb-desk-stats b { margin: 3px 0 1px; font-size: 20px; }
.wb-desk-stats small {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-desk-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 258px;
  gap: 16px;
  align-items: start;
}
.wb-task-board {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.wb-task-board-empty {
  display: flex;
  min-height: 64px;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
}
.wb-task-board-empty > span {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.wb-task-board-empty b {
  color: var(--color-text);
  font-size: 12px;
}
.wb-task-board-empty small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
.wb-task-column {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 82%, transparent);
}
.wb-task-column > header {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}
.wb-task-column > header i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}
.wb-task-column > header i.running { background: var(--color-primary); }
.wb-task-column > header i.waiting { background: var(--color-warning); }
.wb-task-column > header i.recent { background: var(--color-success); }
.wb-task-column > header b { flex: 1; font-size: 11px; }
.wb-task-column > header span {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  font-size: 9px;
  text-align: center;
}
.wb-task-list {
  display: flex;
  min-height: 146px;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.wb-task-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.wb-task-item:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
}
.wb-task-item-head {
  display: grid;
  min-width: 0;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 2px 7px;
  align-items: center;
}
.wb-task-item-head > i {
  display: grid;
  width: 26px;
  height: 26px;
  grid-row: 1 / 3;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.wb-task-item-head b,
.wb-task-item-head small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-task-item-head b { font-size: 10.5px; }
.wb-task-item-head small { color: var(--color-text-tertiary); font-size: 8.5px; }
.wb-task-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 9px;
}
.wb-task-item-meta em {
  flex: none;
  color: var(--color-text-tertiary);
  font-style: normal;
}
.wb-task-progress {
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-hover);
}
.wb-task-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
}
.wb-task-empty {
  display: flex;
  min-height: 114px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  color: var(--color-text-tertiary);
  font-size: 9.5px;
  line-height: 1.5;
  text-align: center;
}
.wb-desk-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wb-desk-inspector > section {
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}
.wb-desk-inspector header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.wb-desk-inspector header span {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 650;
}
.wb-desk-inspector header b {
  color: var(--color-success);
  font-size: 9px;
}
.wb-desk-inspector > section > strong {
  display: block;
  overflow: hidden;
  margin-bottom: 9px;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-desk-inspector > section > button {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 5px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}
.wb-desk-inspector > section > button:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}
.wb-desk-inspector .wb-inspector-task {
  display: flex;
  justify-content: space-between;
}
.wb-desk-inspector .wb-inspector-task span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-desk-inspector .wb-inspector-task small {
  flex: none;
  color: var(--color-text-tertiary);
  font-size: 8px;
}
.wb-desk-inspector p {
  margin: 4px 0;
  color: var(--color-text-tertiary);
  font-size: 9px;
}

/* ===== 空态：明确下一步 ===== */
.wb-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 32px;
}
.wb-empty-icon {
  width: 56px; height: 56px;
  border-radius: 16px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.wb-empty-title { margin: 6px 0 0; font-size: 16px; font-weight: 700; color: var(--color-text); }
.wb-empty-desc {
  max-width: 440px; margin: 0;
  font-size: 12.5px; line-height: 1.8; color: var(--color-text-tertiary);
}
.wb-empty-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }

.office-mobile-bar,
.wb-drawer-head,
.wb-mobile-actions { display: none; }

@media (max-width: 1100px) {
  .office-wb:not(.is-mobile-shell) { flex-direction: column; }
  .office-wb:not(.is-mobile-shell) .wb-tree-shell {
    flex: 0 0 220px; width: 100%; border-right: none; border-bottom: 1px solid var(--color-border);
  }
  .office-wb:not(.is-mobile-shell) .wb-tree { border-right: none; }
}

@media (max-width: 900px) {
  .office-wb.is-mobile-shell {
    position: relative;
    flex-direction: column;
    background: var(--color-bg);
  }
  .office-wb.is-mobile-shell .office-mobile-bar {
    flex: 0 0 56px;
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-bg, #f8fafc) 94%, #fff);
    backdrop-filter: blur(14px);
  }
  .office-wb.is-mobile-shell .office-mobile-icon-btn {
    min-width: 48px;
    min-height: 48px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 10px;
    touch-action: manipulation;
  }
  .office-wb.is-mobile-shell .office-mobile-icon-btn:active { background: var(--glass-bg-hover); }
  .office-wb.is-mobile-shell .office-mobile-icon-btn:disabled {
    opacity: .38;
  }
  .office-wb.is-mobile-shell .office-mobile-title {
    min-width: 0;
    text-align: center;
  }
  .office-wb.is-mobile-shell .office-mobile-title b,
  .office-wb.is-mobile-shell .office-mobile-title small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .office-wb.is-mobile-shell .office-mobile-title b { font-size: 14px; line-height: 1.35; }
  .office-wb.is-mobile-shell .office-mobile-title small { margin-top: 2px; color: var(--color-text-tertiary); font-size: 10px; }
  .office-wb.is-mobile-shell .office-mobile-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
  .office-wb.is-mobile-shell .office-mobile-actions :deep(.mode-pill) { min-height: 40px; padding: 0 8px; font-size: 11px; }
  .office-wb.is-mobile-shell .wb-tree-shell {
    position: absolute;
    z-index: 42;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(88vw, 340px);
    min-width: 0;
    transform: translateX(-104%);
    border-right: 1px solid var(--color-border);
    background: var(--color-bg, #f8fafc);
    box-shadow: 18px 0 48px rgba(15, 23, 28, .18);
    transition: transform .2s ease;
  }
  .office-wb.is-mobile-shell .wb-tree-shell.open { transform: translateX(0); }
  .office-wb.is-mobile-shell .wb-drawer-head {
    flex: 0 0 auto;
    display: flex;
    min-height: 56px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--color-border);
  }
  .office-wb.is-mobile-shell .wb-drawer-head b,
  .office-wb.is-mobile-shell .wb-drawer-head small { display: block; }
  .office-wb.is-mobile-shell .wb-drawer-head b { font-size: 14px; }
  .office-wb.is-mobile-shell .wb-drawer-head small {
    max-width: 220px;
    margin-top: 2px;
    overflow: hidden;
    color: var(--color-text-tertiary);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .office-wb.is-mobile-shell .wb-drawer-head button {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }
  .office-wb.is-mobile-shell .wb-file-drawer-mask {
    position: absolute;
    z-index: 41;
    inset: 0;
    display: block;
    border: 0;
    background: rgba(15, 23, 28, .4);
  }
  .office-wb.is-mobile-shell .rs-handle { display: none; }
  .office-wb.is-mobile-shell .wb-main { width: 100%; }
  .office-wb.is-mobile-shell .wb-editor-pulse {
    overflow-x: auto;
    padding: 4px 8px;
  }
  .office-wb.is-mobile-shell .wb-editor-pulse button {
    min-height: 36px;
    flex: none;
    font-size: 10px;
  }
  .office-wb.is-mobile-shell .wb-editor-pulse .wb-editor-pulse-task {
    position: sticky;
    right: 0;
  }
  .office-wb.is-mobile-shell .wb-desk {
    padding: 12px 10px 22px;
  }
  .office-wb.is-mobile-shell .wb-desk-brief {
    flex-direction: column;
    gap: 12px;
  }
  .office-wb.is-mobile-shell .wb-desk-brief h1 { margin: 3px 0 2px; font-size: 20px; }
  .office-wb.is-mobile-shell .wb-desk-brief p { font-size: 11px; line-height: 1.55; }
  .office-wb.is-mobile-shell .wb-desk-brief-actions {
    width: 100%;
    justify-content: stretch;
  }
  .office-wb.is-mobile-shell .wb-desk-brief-actions :deep(.el-button) {
    flex: 1 1 96px;
    min-height: 40px;
    margin-left: 0;
    font-size: 11px;
  }
  .office-wb.is-mobile-shell .wb-desk-stats {
    margin: 12px 0;
  }
  .office-wb.is-mobile-shell .wb-desk-stats > div {
    padding: 8px;
  }
  .office-wb.is-mobile-shell .wb-desk-stats b { font-size: 17px; }
  .office-wb.is-mobile-shell .wb-desk-stats small { display: none; }
  .office-wb.is-mobile-shell .wb-desk-grid {
    display: block;
  }
  .office-wb.is-mobile-shell .wb-task-board {
    grid-template-columns: 1fr;
    gap: 9px;
  }
  .office-wb.is-mobile-shell .wb-task-board-empty {
    min-height: 64px;
    padding: 10px 12px;
  }
  .office-wb.is-mobile-shell .wb-task-board-empty b { font-size: 12px; }
  .office-wb.is-mobile-shell .wb-task-board-empty small { font-size: 10px; line-height: 1.45; }
  .office-wb.is-mobile-shell .wb-task-list { min-height: 0; padding: 6px; }
  .office-wb.is-mobile-shell .wb-task-item { min-height: 54px; padding: 8px; }
  .office-wb.is-mobile-shell .wb-task-empty {
    min-height: 74px;
    padding: 10px;
  }
  .office-wb.is-mobile-shell .wb-desk-inspector {
    display: none;
  }
  .office-wb.is-mobile-shell .wb-desk-inspector > section > button {
    min-height: 44px;
    font-size: 11px;
  }
  .office-wb.is-mobile-shell .wb-empty {
    flex: 1;
    justify-content: flex-start;
    padding: 44px 18px 24px;
    gap: 12px;
  }
  .office-wb.is-mobile-shell .wb-empty-icon { width: 64px; height: 64px; border-radius: 18px; }
  .office-wb.is-mobile-shell .wb-empty-title { font-size: 19px; }
  .office-wb.is-mobile-shell .wb-empty-desc { max-width: 320px; font-size: 13px; line-height: 1.75; }
  .office-wb.is-mobile-shell .wb-empty-actions {
    width: 100%;
    max-width: 360px;
    flex-direction: column;
    margin-top: 12px;
  }
  .office-wb.is-mobile-shell .wb-empty-actions :deep(.el-button) {
    width: 100%;
    min-height: 48px;
    margin-left: 0;
    font-size: 14px;
  }
  .office-wb.is-mobile-shell .wb-main :deep(.lead-toggle-wrap) {
    right: 12px;
    bottom: 68px;
  }
  .office-wb.is-mobile-shell .wb-main :deep(.lead-fab) {
    width: 48px;
    height: 48px;
  }
  .office-wb.is-mobile-shell .wb-mobile-actions {
    flex: 0 0 60px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-bg, #f8fafc) 94%, #fff);
    backdrop-filter: blur(14px);
  }
  .office-wb.is-mobile-shell .wb-mobile-actions button {
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    border-radius: 9px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
  }
}
</style>
