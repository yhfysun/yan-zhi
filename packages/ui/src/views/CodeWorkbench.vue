<template>
  <div class="code-page" :style="{ '--code-side-w': sideW + 'px', '--code-chat-w': chatW + 'px' }">
    <!-- ===== 顶栏：项目 / 环境 / 返回任务 ===== -->
    <header class="cp-top">
      <div class="cp-top-left">
        <span class="cp-badge"><el-icon :size="13"><Document /></el-icon></span>
        <span class="cp-title">代码</span>
        <button class="cp-proj" :class="{ open: projectSwitcherOpen }" :title="code.projectDir || '点击切换项目目录'" @click.stop="toggleProjectSwitcher">
          <el-icon :size="12"><FolderOpened /></el-icon>
          <span class="cp-proj-name">{{ code.projectName || '选择项目目录' }}</span>
          <el-icon :size="10" class="cp-proj-caret"><ArrowDown /></el-icon>
        </button>
        <ProjectSwitcherMenu
          v-if="projectSwitcherOpen"
          @open-new="onOpenNewProject"
          @close="closeProjectSwitcher"
        />
      </div>

      <div class="cp-top-right">
        <div class="cp-env" :title="envTitle">
          <span v-for="t in envChips" :key="t.id" class="cp-env-chip" :class="{ off: !t.ok }">
            <span class="cp-env-dot"></span>{{ t.label }}<template v-if="t.ok"> {{ t.version }}</template>
          </span>
          <button class="cp-env-set" @click="openSettingsDrawer('env')">
            <el-icon :size="12"><Setting /></el-icon>环境
          </button>
        </div>
        <el-tooltip content="返回任务对话" placement="bottom" :show-after="400">
          <button class="cp-back" @click="backToChat">
            <el-icon :size="13"><ChatDotRound /></el-icon>返回任务
          </button>
        </el-tooltip>
      </div>
    </header>

    <!-- ===== 三栏主体：左项目面板 | 中编辑器 | 右对话 ===== -->
    <div class="cp-body">
      <CodeSidebar class="cp-side" @pick-dir="showDir = true" />
      <div class="rs-handle" :class="{ dragging: sideR.dragging.value }" @mousedown="sideR.startDrag($event, 'left')"></div>

      <CodeEditorArea @pick-dir="showDir = true" />

      <div class="rs-handle" :class="{ dragging: chatR.dragging.value }" @mousedown="chatR.startDrag($event, 'right')"></div>

      <section class="cp-chat">
        <div class="cp-chat-head">
          <el-icon :size="13" class="cp-chat-icon"><ChatDotRound /></el-icon>
          <span class="cp-chat-title">{{ currentConvTitle }}</span>
          <span class="cp-chat-spacer"></span>
          <button class="cp-chat-btn" title="收起对话栏" @click="toggleChat">
            <el-icon :size="12"><ArrowRight /></el-icon>
          </button>
        </div>
        <div class="cp-chat-msgs">
          <ChatMessageList />
        </div>
        <ChatInputArea />
      </section>
    </div>

    <!-- ===== 底部状态栏（贯通整窗）===== -->
    <CodeStatusBar :git-branch="gitBranch" :git-dirty="gitDirty" />

    <!-- ===== 命令面板（Ctrl+Shift+P / Ctrl+P）===== -->
    <CodeCommandPalette v-model="paletteOpen" @open-new="onOpenNewProject" />

    <WorkspaceDirDialog v-model="showDir" :current-path="code.projectDir" @selected="onDirSelected" />
    <ChatDialogs />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Document, FolderOpened, ArrowDown, ArrowRight, ChatDotRound, Setting } from '@element-plus/icons-vue';
import { useCodeStore, setCodeModeActive } from '../stores/code';
import { useChatStore } from '../stores/chat';
import { useResizable } from '../composables/useResizable';
import { openSettingsDrawer } from '../composables/useSettingsDrawer';
import { projectSwitcherOpen, closeProjectSwitcher, toggleProjectSwitcher } from '../composables/useProjectSwitcher';
import { api } from '../api/client';
import CodeSidebar from '../components/code/CodeSidebar.vue';
import CodeEditorArea from '../components/code/CodeEditorArea.vue';
import ProjectSwitcherMenu from '../components/code/ProjectSwitcherMenu.vue';
import CodeStatusBar from '../components/code/CodeStatusBar.vue';
import CodeCommandPalette from '../components/code/CodeCommandPalette.vue';
import WorkspaceDirDialog from '../components/WorkspaceDirDialog.vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import ChatDialogs from '../components/chat/ChatDialogs.vue';

const router = useRouter();
const code = useCodeStore();
const chatStore = useChatStore();

const sideR = useResizable('code_sidebar', 260, 180, 560);
const chatR = useResizable('code_chat', 420, 300, 900);
const sideW = sideR.width;
const chatW = chatR.width;

const showDir = ref(false);
const chatCollapsed = ref(false);
const paletteOpen = ref(false);

const currentConvTitle = computed(
  () => chatStore.conversations.find((c) => c.id === chatStore.currentConvId)?.title || '任务对话',
);

function onDirSelected(dir: string) {
  code.setProjectDir(dir);
  showDir.value = false;
}

/** 顶栏「打开新项目…」：关闭下拉，打开原生目录选择对话框 */
function onOpenNewProject() {
  closeProjectSwitcher();
  showDir.value = true;
}

// 下拉打开时，点击外部任意处关闭（菜单自身 stop 了冒泡）
function onDocClickClose() {
  if (projectSwitcherOpen.value) closeProjectSwitcher();
}
watch(projectSwitcherOpen, (open) => {
  if (open) document.addEventListener('click', onDocClickClose);
  else document.removeEventListener('click', onDocClickClose);
});
onBeforeUnmount(() => document.removeEventListener('click', onDocClickClose));

// 命令面板快捷键：Ctrl/Cmd+P（快速打开）与 Ctrl/Cmd+Shift+P（命令）
function onGlobalKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;
  if (e.key.toLowerCase() !== 'p') return;
  e.preventDefault();
  paletteOpen.value = !paletteOpen.value;
}
onMounted(() => document.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown));

/** 收起对话栏：宽度归零（再次点击顶栏「代码」或刷新恢复） */
function toggleChat() {
  chatCollapsed.value = !chatCollapsed.value;
  chatW.value = chatCollapsed.value ? 0 : 420;
}

function backToChat() {
  // 显式退出代码模式：清掉记忆标记，之后回「任务」就是普通聊天布局
  setCodeModeActive(false);
  const id = chatStore.currentConvId;
  router.push(id ? `/chat/${id}` : '/chat');
}

// ===== 环境状态条 =====
interface EnvChip { id: string; label: string; version: string; ok: boolean }
const envChips = ref<EnvChip[]>([]);
const envTitle = computed(() =>
  envChips.value.length
    ? envChips.value.map((t) => `${t.label} ${t.ok ? t.version : '未配置'}`).join(' · ')
    : '尚未检测开发环境',
);

// ===== Git 状态（底部状态栏：分支 + 改动数）=====
const gitBranch = ref<string | null>(null);
const gitDirty = ref(0);
async function refreshGitStatus() {
  if (!code.projectDir) { gitBranch.value = null; gitDirty.value = 0; return; }
  const r = await api.get<{
    current?: string; files?: unknown[];
    modified?: unknown[]; not_added?: unknown[]; created?: unknown[]; deleted?: unknown[];
  }>(`/git/status?repo=${encodeURIComponent(code.projectDir)}`);
  if ('error' in r) { gitBranch.value = null; gitDirty.value = 0; return; }
  const d = r.data || {};
  gitBranch.value = d.current || null;
  const files = d.files;
  gitDirty.value = Array.isArray(files)
    ? files.length
    : (d.modified?.length || 0) + (d.not_added?.length || 0) + (d.created?.length || 0) + (d.deleted?.length || 0);
}
watch(() => code.projectDir, () => void refreshGitStatus());

onMounted(async () => {
  // 记住代码模式：去别的页面再回「任务」时恢复代码工作台（router guard 消费该标记）
  setCodeModeActive(true);
  if (!code.projectDir) {
    // 顶栏已通过 store 初始化兜底到 settings.workspaceDir
  }
  void refreshGitStatus();
  const r = await api.post<Array<{ id: string; label: string; version: string; ok: boolean }>>('/env/verify', {});
  if ('error' in r) return;
  envChips.value = (r.data || [])
    .filter((t) => ['java', 'maven', 'python', 'node'].includes(t.id))
    .map((t) => ({
      id: t.id,
      label: t.id === 'java' ? 'Java' : t.id === 'maven' ? 'Maven' : t.id === 'python' ? 'Python' : 'Node',
      version: t.version || '',
      ok: !!t.ok,
    }));
});
</script>

<style src="./chat.css"></style>

<style scoped>
.code-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #f7f5f0);
  overflow: hidden;
}

/* ===== 顶栏 ===== */
.cp-top {
  display: flex; align-items: center; gap: 10px;
  height: 42px; padding: 0 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--color-surface, #fff);
}
.cp-top-left { display: flex; align-items: center; gap: 8px; min-width: 0; position: relative; }
.cp-badge {
  width: 24px; height: 24px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; background: var(--color-primary, #c2410c);
}
.cp-title { font-size: 13.5px; font-weight: 700; color: var(--color-text, #1a1a1a); }
.cp-proj {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 9px; max-width: 320px;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.15s ease;
}
.cp-proj:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cp-proj-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-proj-caret { opacity: 0.6; flex-shrink: 0; transition: transform 0.15s ease; }
.cp-proj.open { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cp-proj.open .cp-proj-caret { transform: rotate(180deg); }

.cp-top-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cp-env { display: flex; align-items: center; gap: 6px; }
.cp-env-chip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 22px; padding: 0 8px; border-radius: 999px;
  font-size: 11px; color: var(--color-text-secondary, #6b6b66);
  background: var(--el-fill-color-lighter, #f6f4ef);
}
.cp-env-chip.off { opacity: 0.45; }
.cp-env-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-success, #2f6b4f);
}
.cp-env-chip.off .cp-env-dot { background: var(--color-text-tertiary, #9c9b94); }
.cp-env-set {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 9px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc);
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 11.5px; font-family: inherit; transition: all 0.15s ease;
}
.cp-env-set:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }

.cp-back {
  display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 12px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent;
  background: var(--color-primary, #c2410c); color: #fff;
  font-size: 12px; font-weight: 600; font-family: inherit; transition: all 0.15s ease;
}
.cp-back:hover { filter: brightness(1.06); }

/* ===== 主体 ===== */
.cp-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }

.cp-side {
  flex: 0 0 var(--code-side-w, 260px);
  min-width: 0;
  background: var(--color-surface, #fff);
  border-right: 1px solid var(--glass-border, #e7e4dc);
  overflow: hidden;
}

/* 复用聊天页的拖拽条样式 */
.rs-handle {
  flex: 0 0 6px; width: 6px; cursor: col-resize; position: relative; z-index: 6;
  background: transparent; transition: background 0.15s ease;
}
.rs-handle::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  transform: translateX(-50%); border-radius: 1px;
  background: var(--glass-border, #e7e4dc);
}
.rs-handle:hover, .rs-handle.dragging { background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent); }
.rs-handle:hover::after, .rs-handle.dragging::after { background: var(--color-primary, #c2410c); width: 3px; }

/* ===== 右侧对话栏 ===== */
.cp-chat {
  flex: 0 0 var(--code-chat-w, 420px);
  min-width: 0;
  display: flex; flex-direction: column;
  background: var(--color-surface, #fff);
  border-left: 1px solid var(--glass-border, #e7e4dc);
  overflow: hidden;
}
.cp-chat-head {
  display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.cp-chat-icon { color: var(--color-primary, #c2410c); }
.cp-chat-title {
  font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-chat-spacer { flex: 1; }
.cp-chat-btn {
  width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-tertiary, #9c9b94); cursor: pointer;
}
.cp-chat-btn:hover { background: var(--glass-bg-hover, #f1efe9); color: var(--color-text, #1a1a1a); }
.cp-chat-msgs { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

@media (max-width: 1100px) {
  .cp-chat { display: none; }
  .cp-env { display: none; }
}
</style>
