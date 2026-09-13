<template>
  <div class="code-page" :style="{ '--code-side-w': sideW + 'px', '--code-chat-w': chatW + 'px' }">
    <!-- ===== 顶栏：项目 / 环境 / 返回任务 ===== -->
    <header class="cp-top">
      <div class="cp-top-left">
        <span class="cp-badge"><el-icon :size="13"><Document /></el-icon></span>
        <span class="cp-title">当前项目</span>
        <button class="cp-proj" :class="{ open: projDropdownOpen }" :title="code.projectDir || '点击切换项目目录'" @click.stop="toggleProjDropdown">
          <el-icon :size="12"><FolderOpened /></el-icon>
          <span class="cp-proj-name">{{ code.projectName || '选择项目目录' }}</span>
          <el-icon :size="10" class="cp-proj-caret"><ArrowDown /></el-icon>
        </button>
        <button class="cp-side-toggle" :title="sideCollapsed ? '展开侧栏' : '收起侧栏'" @click="toggleSidebar">
          <el-icon :size="14"><Fold v-if="!sideCollapsed" /><Expand v-else /></el-icon>
        </button>
        <Teleport to="body">
          <div v-if="projDropdownOpen" class="cp-task-dropdown cp-proj-dropdown" :style="projDropdownStyle" @click.stop>
            <div class="cp-task-section">项目目录</div>
            <div v-for="d in recentDirs" :key="d" class="cp-task-item" :class="{ active: d === code.projectDir }" :title="d" @click="selectProject(d)">
              <el-icon :size="12"><FolderOpened /></el-icon>
              <span class="cp-task-item-label">{{ basename(d) }}</span>
              <el-icon v-if="d === code.projectDir" :size="12" class="cp-task-check"><Check /></el-icon>
            </div>
            <div v-if="!recentDirs.length" class="cp-task-empty">暂无最近项目</div>
            <div class="cp-task-divider"></div>
            <div class="cp-task-item cp-task-action" @click="onOpenNewProject">
              <el-icon :size="12"><FolderAdd /></el-icon>
              <span class="cp-task-item-label">打开新项目…</span>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="cp-top-right">
        <!-- IDEA 风格 Git 区：分支切换 + Commit + 推送/拉取 -->
        <div v-if="code.projectDir" class="cp-git">
          <button class="cp-git-branch" :title="gitBranch || '非 Git 仓库'" @click.stop="toggleGitBranch">
            <el-icon :size="12"><Share /></el-icon>
            <span class="cp-git-branch-name">{{ gitBranch || 'no-git' }}</span>
            <span v-if="gitDirty" class="cp-git-dirty" :title="`${gitDirty} 处改动`">{{ gitDirty }}</span>
            <el-icon :size="10" class="cp-git-caret"><ArrowDown /></el-icon>
          </button>
          <!-- 冲突入口：仅在存在未解决冲突时出现 -->
          <button
            v-if="gitConflicts.length"
            class="cp-git-act is-conflict"
            :title="`${gitConflicts.length} 个冲突文件待解决`"
            @click="openConflictResolver(gitConflicts)"
          >
            <el-icon :size="14"><WarningFilled /></el-icon>
            <span class="cp-git-badge danger">{{ gitConflicts.length }}</span>
          </button>
          <!-- 提交：图标 + 改动数徽标，点击打开提交弹窗 -->
          <button class="cp-git-act" :class="{ 'is-on': commitOpen }" :disabled="!gitBranch" title="提交（Ctrl+K）" @click="openGitCommit">
            <el-icon :size="14"><Check /></el-icon>
            <span v-if="gitDirty" class="cp-git-badge">{{ gitDirty }}</span>
          </button>
          <!-- 同步：拉取 / 推送 / 获取，收进一个图标下拉 -->
          <button class="cp-git-act" :class="{ 'is-on': gitSyncDropdown }" :disabled="!gitBranch || gitBusy" title="同步：拉取 / 推送" @click.stop="toggleGitSync">
            <el-icon :size="14"><Refresh /></el-icon>
            <span v-if="gitAhead || gitBehind" class="cp-git-badge blue">{{ gitAhead || gitBehind }}</span>
          </button>
          <Teleport to="body">
            <div v-if="gitBranchDropdown" class="cp-task-dropdown cp-git-branch-dropdown" :style="gitBranchDropdownStyle" @click.stop>
              <div class="cp-task-section">本地分支</div>
              <div
                v-for="b in gitLocalBranches"
                :key="'gb' + b"
                class="cp-task-item"
                :class="{ active: b === gitBranch }"
                @click="checkoutGitBranch(b)"
              >
                <el-icon :size="12"><Check v-if="b === gitBranch" /><Share v-else /></el-icon>
                <span class="cp-task-item-label">{{ b }}</span>
              </div>
              <div v-if="!gitLocalBranches.length" class="cp-task-empty">无本地分支</div>
              <div class="cp-task-divider"></div>
              <div class="cp-task-item cp-task-action" @click="onCreateBranch">
                <el-icon :size="12"><Plus /></el-icon>
                <span class="cp-task-item-label">新建分支…</span>
              </div>
            </div>
          </Teleport>
          <Teleport to="body">
            <div v-if="gitSyncDropdown" class="cp-task-dropdown cp-git-sync-dropdown" :style="gitSyncDropdownStyle" @click.stop>
              <div class="cp-task-section">同步</div>
              <div class="cp-task-item" @click="doGitPull">
                <el-icon :size="12"><Download /></el-icon>
                <span class="cp-task-item-label">拉取（更新项目）</span>
                <span v-if="gitBehind" class="cp-task-badge">↓{{ gitBehind }}</span>
              </div>
              <div class="cp-task-item" @click="doGitPush">
                <el-icon :size="12"><Upload /></el-icon>
                <span class="cp-task-item-label">推送</span>
                <span v-if="gitAhead" class="cp-task-badge">↑{{ gitAhead }}</span>
              </div>
              <div class="cp-task-divider"></div>
              <div class="cp-task-item" @click="doGitFetch">
                <el-icon :size="12"><Refresh /></el-icon>
                <span class="cp-task-item-label">获取远程更新（不合并）</span>
              </div>
            </div>
          </Teleport>
        </div>

        <div class="cp-env">
          <button class="cp-env-set" :class="{ active: !chatCollapsed }" :title="chatCollapsed ? '打开任务' : '收起任务'" @click="toggleChat">
            <el-icon :size="12"><ChatDotRound /></el-icon>任务
          </button>
        </div>
        <el-tooltip content="退出开发模式" placement="bottom" :show-after="400">
          <button class="cp-back" @click="backToChat">
            <el-icon :size="13"><ChatDotRound /></el-icon>退出开发模式
          </button>
        </el-tooltip>
      </div>
    </header>

    <!-- ===== 三栏主体：左项目面板 | 中编辑器 | 右对话 ===== -->
    <div class="cp-body">
      <CodeSidebar v-show="!sideCollapsed" class="cp-side" @pick-dir="showDir = true" />
      <div v-show="!sideCollapsed" class="rs-handle" :class="{ dragging: sideR.dragging.value }" @mousedown="sideR.startDrag($event, 'left')"></div>

      <CodeEditorArea @pick-dir="showDir = true" />

      <div class="rs-handle" :class="{ dragging: chatR.dragging.value }" @mousedown="chatR.startDrag($event, 'right')"></div>

      <section class="cp-chat">
        <div class="cp-chat-head">
          <button class="cp-task-trigger" :class="{ active: taskDropdownOpen }" @click.stop="toggleTaskDropdown">
            <el-icon :size="13" class="cp-chat-icon"><ChatDotRound /></el-icon>
            <span class="cp-chat-title">{{ currentConvTitle }}</span>
            <el-icon :size="10" class="cp-task-caret"><ArrowDown /></el-icon>
          </button>
          <span class="cp-chat-spacer"></span>
          <button class="cp-chat-btn" title="新建任务" @click="newTask">
            <el-icon :size="12"><EditPen /></el-icon>
          </button>
          <button class="cp-chat-btn" title="收起任务栏" @click="toggleChat">
            <el-icon :size="12"><ArrowRight /></el-icon>
          </button>
          <div v-if="taskDropdownOpen" class="cp-task-dropdown" :style="taskDropdownStyle" @click.stop>
            <div class="cp-task-section">任务列表</div>
            <div v-for="conv in currentSpaceConvs" :key="conv.id" class="cp-task-item" :class="{ active: conv.id === chatStore.currentConvId }" @click="selectTask(conv.id)">
              <span class="cp-task-dot"></span>
              <span class="cp-task-item-label">{{ conv.title }}</span>
            </div>
            <div v-if="!currentSpaceConvs.length" class="cp-task-empty">暂无任务，发送消息自动创建</div>
          </div>
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

    <!-- Git 弹窗：提交 / 切换分支冲突 / 冲突解决 -->
    <GitCommitDialog v-model="commitOpen" :repo="code.projectDir" @committed="onCommitted" />
    <GitCheckoutConflictDialog
      v-model="checkoutConflict.visible"
      :repo="code.projectDir"
      :branch="checkoutConflict.branch"
      :files="checkoutConflict.files"
      @resolved="onCheckoutResolved"
    />
    <GitConflictResolver
      v-model="conflictResolver.visible"
      :repo="code.projectDir"
      :files="conflictResolver.files"
      @aborted="refreshGitStatus"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Document, FolderOpened, ArrowDown, ArrowRight, ChatDotRound, EditPen, FolderAdd, Check, Fold, Expand, Share, Download, Upload, Refresh, WarningFilled, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useCodeStore, setCodeModeActive } from '../stores/code';
import { useChatStore } from '../stores/chat';
import { useSpaceStore } from '../stores/space';
import { useGitStore } from '../stores/git';
import { useChat } from '../composables/chat/useChat';
import { clampMenuPos } from '../utils/menuPosition';
import { useResizable } from '../composables/useResizable';
import { api } from '../api/client';
import { useSettingsStore } from '../stores/settings';
import CodeSidebar from '../components/code/CodeSidebar.vue';
import CodeEditorArea from '../components/code/CodeEditorArea.vue';
import CodeStatusBar from '../components/code/CodeStatusBar.vue';
import CodeCommandPalette from '../components/code/CodeCommandPalette.vue';
import WorkspaceDirDialog from '../components/WorkspaceDirDialog.vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import ChatDialogs from '../components/chat/ChatDialogs.vue';
import GitCommitDialog from '../components/git/GitCommitDialog.vue';
import GitCheckoutConflictDialog from '../components/git/GitCheckoutConflictDialog.vue';
import GitConflictResolver from '../components/git/GitConflictResolver.vue';

const router = useRouter();
const code = useCodeStore();
const chatStore = useChatStore();
const spaceStore = useSpaceStore();
const settingsStore = useSettingsStore();
const gitStore = useGitStore();
const chat = useChat();

const sideR = useResizable('code_sidebar', 260, 180, 560);
const chatR = useResizable('code_chat', 420, 300, 900);
const sideW = sideR.width;
const chatW = chatR.width;

const showDir = ref(false);
const chatCollapsed = ref(false);
const sideCollapsed = ref(false);
const paletteOpen = ref(false);

// 在子组件创建前就标记代码模式，确保 ChatMessageList 首次渲染时 isCodeMode 已为 true
setCodeModeActive(true);

const currentConvTitle = computed(
  () => chatStore.conversations.find((c) => c.id === chatStore.currentConvId)?.title || '任务',
);

function onDirSelected(dir: string) {
  code.setProjectDir(dir);
  showDir.value = false;
}

// ===== 项目目录下拉 =====
const projDropdownOpen = ref(false);
const projDropdownStyle = ref<Record<string, string>>({});
const recentDirs = computed(() => {
  const list = (settingsStore.settings.recentWorkspaceDirs || []).filter(Boolean);
  const set = new Set(list);
  if (code.projectDir && !set.has(code.projectDir)) set.add(code.projectDir);
  return Array.from(set);
});
function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '');
  return clean.split(/[\\/]/).filter(Boolean).pop() || clean;
}
function toggleProjDropdown(e: MouseEvent) {
  if (!projDropdownOpen.value) {
    const pos = clampMenuPos(e, 280, 400);
    projDropdownStyle.value = { left: pos.x + 'px', top: pos.y + 'px' };
  }
  projDropdownOpen.value = !projDropdownOpen.value;
}
function selectProject(dir: string) {
  code.setProjectDir(dir);
  const list = (settingsStore.settings.recentWorkspaceDirs || []).filter((d) => d && d !== dir);
  list.unshift(dir);
  void settingsStore.update({ recentWorkspaceDirs: list.slice(0, 8) });
  projDropdownOpen.value = false;
}

/** 顶栏「打开新项目…」：关闭下拉，打开原生目录选择对话框 */
function onOpenNewProject() {
  projDropdownOpen.value = false;
  showDir.value = true;
}

// 下拉打开时，点击外部任意处关闭
function onDocClickClose() {
  if (projDropdownOpen.value) projDropdownOpen.value = false;
}
watch(projDropdownOpen, (open) => {
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
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKeydown);
  document.removeEventListener('keydown', onGitKeydown);
});

// ===== 任务下拉面板 =====
const taskDropdownOpen = ref(false);
const taskDropdownStyle = ref<Record<string, string>>({});
function toggleTaskDropdown(e: MouseEvent) {
  if (!taskDropdownOpen.value) {
    const pos = clampMenuPos(e, 260, 400);
    taskDropdownStyle.value = { left: pos.x + 'px', top: pos.y + 'px' };
  }
  taskDropdownOpen.value = !taskDropdownOpen.value;
}
const currentSpaceConvs = computed(() =>
  chatStore.conversations.filter((c) => c.spaceId === code.projectSpaceId),
);
function selectTask(id: string) {
  void chat.selectConv(id);
  taskDropdownOpen.value = false;
}
function newTask() {
  void chat.startNewChat(code.projectSpaceId);
  taskDropdownOpen.value = false;
}
function onDocClickCloseTask() {
  if (taskDropdownOpen.value) taskDropdownOpen.value = false;
}
watch(taskDropdownOpen, (open) => {
  if (open) document.addEventListener('click', onDocClickCloseTask);
  else document.removeEventListener('click', onDocClickCloseTask);
});

// ===== 项目目录 → space 同步 =====
async function syncProjectSpace() {
  if (!code.projectDir) { code.setProjectSpaceId(null); return; }
  try {
    const sid = await spaceStore.findOrCreateByDirPath(code.projectDir);
    code.setProjectSpaceId(sid);
  } catch { /* ignore */ }
}
// 切换项目目录：同步 space → 重新拉取会话列表 → 进入新任务草稿（避免残留上个项目的任务内容）
watch(() => code.projectDir, async () => {
  await syncProjectSpace();
  await chatStore.loadConversations();
  await chat.startNewChat(code.projectSpaceId);
});

/** 收起对话栏：宽度归零（再次点击顶栏「代码」或刷新恢复） */
function toggleChat() {
  chatCollapsed.value = !chatCollapsed.value;
  chatW.value = chatCollapsed.value ? 0 : 420;
}

/** 收起/展开左侧栏 */
function toggleSidebar() {
  sideCollapsed.value = !sideCollapsed.value;
  sideW.value = sideCollapsed.value ? 0 : 260;
}

function backToChat() {
  // 显式退出代码模式：清掉记忆标记，之后回「任务」就是普通聊天布局
  setCodeModeActive(false);
  const id = chatStore.currentConvId;
  router.push(id ? `/chat/${id}` : '/chat');
}


// ===== Git 状态（顶部 Git 区 + 底部状态栏：分支 + 改动数）=====
const gitBranch = ref<string | null>(null);
const gitDirty = ref(0);
const gitBusy = ref(false);
const gitLocalBranches = ref<string[]>([]);
const gitBranchDropdown = ref(false);
const gitBranchDropdownStyle = ref<Record<string, string>>({});
const gitSyncDropdown = ref(false);
const gitSyncDropdownStyle = ref<Record<string, string>>({});
const gitAhead = ref(0);
const gitBehind = ref(0);
const gitConflicts = ref<string[]>([]);

// ===== 提交弹窗 / 冲突弹窗 =====
const commitOpen = ref(false);
const checkoutConflict = ref<{ visible: boolean; branch: string; files: string[] }>({
  visible: false, branch: '', files: [],
});
const conflictResolver = ref<{ visible: boolean; files: string[] }>({ visible: false, files: [] });

async function refreshGitStatus() {
  if (!code.projectDir) {
    gitBranch.value = null; gitDirty.value = 0; gitLocalBranches.value = [];
    gitAhead.value = 0; gitBehind.value = 0; gitConflicts.value = [];
    return;
  }
  const q = encodeURIComponent(code.projectDir);
  const [stRes, brRes, cfRes] = await Promise.all([
    api.get<{ current?: string; files?: unknown[] }>(`/git/status?repo=${q}`),
    api.get<string[]>(`/git/branches?repo=${q}`),
    api.get<string[]>(`/git/conflicts?repo=${q}`).catch(() => ({ data: [] as string[] })),
  ]);
  if ('error' in stRes) { gitBranch.value = null; gitDirty.value = 0; return; }
  const d = stRes.data || {};
  gitBranch.value = d.current || null;
  gitDirty.value = Array.isArray(d.files) ? d.files.length : 0;
  gitLocalBranches.value = 'data' in brRes
    ? (brRes.data || []).filter((b) => !b.startsWith('remotes/') && !b.startsWith('origin/HEAD'))
    : [];
  gitConflicts.value = 'data' in cfRes ? cfRes.data || [] : [];
  try {
    const ab = await gitStore.fetchAheadBehind(code.projectDir);
    gitAhead.value = ab.ahead || 0;
    gitBehind.value = ab.behind || 0;
  } catch { gitAhead.value = 0; gitBehind.value = 0; }
}
function toggleGitBranch(e: MouseEvent) {
  if (!gitBranchDropdown.value) {
    const pos = clampMenuPos(e, 260, 400);
    gitBranchDropdownStyle.value = { left: pos.x + 'px', top: pos.y + 'px' };
  }
  gitSyncDropdown.value = false;
  gitBranchDropdown.value = !gitBranchDropdown.value;
}
function toggleGitSync(e: MouseEvent) {
  if (!gitSyncDropdown.value) {
    const pos = clampMenuPos(e, 240, 260);
    gitSyncDropdownStyle.value = { left: pos.x + 'px', top: pos.y + 'px' };
  }
  gitBranchDropdown.value = false;
  gitSyncDropdown.value = !gitSyncDropdown.value;
}

/**
 * 切换分支：先做冲突预检（strategy=check），有冲突时弹窗让用户选 智能检出 / 强制检出
 */
async function checkoutGitBranch(b: string) {
  gitBranchDropdown.value = false;
  if (b === gitBranch.value) return;
  const repo = code.projectDir;
  if (!repo) return;
  gitBusy.value = true;
  try {
    const pre = await gitStore.checkout(repo, b, 'check');
    if (!('error' in pre) && pre.data.conflicts?.length) {
      checkoutConflict.value = { visible: true, branch: b, files: pre.data.conflicts };
      return;
    }
    const res = await gitStore.checkout(repo, b, 'normal');
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('已切换到 ' + b);
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    gitBusy.value = false;
    await refreshGitStatus();
  }
}

/** 智能检出 / 强制检出 完成后的收尾 */
async function onCheckoutResolved(payload: { ok: boolean; conflicts: string[]; message: string }) {
  if (payload.message) ElMessage.success(payload.message);
  await refreshGitStatus();
  if (payload.conflicts?.length) openConflictResolver(payload.conflicts);
}

/** 打开冲突解决器 */
function openConflictResolver(files: string[]) {
  if (!files.length) return;
  conflictResolver.value = { visible: true, files: [...files] };
}

async function onCreateBranch() {
  gitBranchDropdown.value = false;
  try {
    const { value } = await ElMessageBox.prompt('输入新分支名（基于当前分支创建并切换）', '新建分支', {
      confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: 'feature/xxx',
    });
    const name = (value || '').trim();
    if (!name) return;
    const res = await gitStore.createBranch(code.projectDir, name);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('已创建并切换到 ' + name);
    await refreshGitStatus();
  } catch (e) {
    if ((e as Error).message && (e as Error).message !== 'cancel') ElMessage.error((e as Error).message);
  }
}

async function doGitPull() {
  gitSyncDropdown.value = false;
  gitBusy.value = true;
  try {
    const res = await gitStore.pull(code.projectDir, gitBranch.value || undefined);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('拉取完成');
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    gitBusy.value = false;
    await refreshGitStatus();
    // 拉取产生冲突（rebase/merge 冲突）时直接引导解决
    if (gitConflicts.value.length) openConflictResolver(gitConflicts.value);
  }
}
async function doGitPush() {
  gitSyncDropdown.value = false;
  gitBusy.value = true;
  try {
    const res = await gitStore.push(code.projectDir, gitBranch.value || undefined);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('推送完成');
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    gitBusy.value = false;
    await refreshGitStatus();
  }
}
async function doGitFetch() {
  gitSyncDropdown.value = false;
  gitBusy.value = true;
  try {
    const res = await gitStore.fetch(code.projectDir);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('已获取远程更新');
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    gitBusy.value = false;
  }
}

/** 顶栏提交图标：直接打开提交弹窗（IDEA 式逐文件勾选） */
function openGitCommit() {
  commitOpen.value = true;
}
function onCommitted(payload: { pushed: boolean }) {
  void refreshGitStatus();
  if (payload.pushed) ElMessage.success('已提交并推送');
}

// 分支下拉 / 同步下拉打开时，点击外部任意处关闭
function onDocClickCloseGit() {
  if (gitBranchDropdown.value) gitBranchDropdown.value = false;
  if (gitSyncDropdown.value) gitSyncDropdown.value = false;
}
watch([gitBranchDropdown, gitSyncDropdown], ([b, s]) => {
  if (b || s) document.addEventListener('click', onDocClickCloseGit);
  else document.removeEventListener('click', onDocClickCloseGit);
});
onBeforeUnmount(() => document.removeEventListener('click', onDocClickCloseGit));

// Ctrl+K：打开提交弹窗（与 IDEA 一致）
function onGitKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey || e.shiftKey) return;
  if (e.key.toLowerCase() !== 'k') return;
  if (!code.projectDir || !gitBranch.value) return;
  e.preventDefault();
  commitOpen.value = true;
}

watch(() => code.projectDir, () => void refreshGitStatus());

onMounted(async () => {
  document.addEventListener('keydown', onGitKeydown);
  void refreshGitStatus();
  // 加载空间列表并同步当前项目目录对应的 space
  // 注意：loadSpaces 可能因数据库迁移问题失败，必须 catch，否则 mounted 钩子抛未处理异常
  void spaceStore.loadSpaces().then(() => void syncProjectSpace()).catch((e) => {
    console.warn('[CodeWorkbench] 空间列表加载失败：', e);
  });
});
</script>

<style src="./chat.css"></style>

<style scoped>
.code-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  overflow: hidden;
}

/* ===== 顶栏 ===== */
.cp-top {
  display: flex; align-items: center; gap: 10px;
  height: 42px; padding: 0 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--glass-bg, #fff);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
}
.cp-top-left { display: flex; align-items: center; gap: 8px; min-width: 0; position: relative; }
.cp-badge {
  width: 24px; height: 24px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; background: var(--color-primary, #c2410c);
}
.cp-title { font-size: 13.5px; font-weight: 700; color: var(--color-text, #1a1a1a); }
.cp-side-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: transparent; color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease;
}
.cp-side-toggle:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
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

/* ===== IDEA 风格 Git 区 ===== */
.cp-git { display: flex; align-items: center; gap: 4px; margin-right: 4px; }
.cp-git-branch {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 9px; max-width: 200px;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.15s ease;
}
.cp-git-branch:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cp-git-branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "JetBrains Mono", monospace; }
.cp-git-caret { opacity: 0.6; flex-shrink: 0; }
.cp-git-dirty {
  flex-shrink: 0; font-size: 10px; font-weight: 700; line-height: 15px;
  min-width: 16px; text-align: center; border-radius: 8px; padding: 0 4px;
  background: color-mix(in srgb, var(--color-primary, #c2410c) 16%, transparent);
  color: var(--color-primary, #c2410c);
}
.cp-git-act {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  cursor: pointer; transition: all 0.15s ease;
}
.cp-git-act:hover:not(:disabled) { border-color: var(--glass-border, #e7e4dc); color: var(--color-text, #1a1a1a); }
.cp-git-act:disabled { opacity: 0.35; cursor: not-allowed; }
.cp-git-act.is-on {
  border-color: var(--color-primary, #c2410c);
  background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent);
  color: var(--color-primary, #c2410c);
}
.cp-git-act.is-conflict { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
.cp-git-act.is-conflict:hover { border-color: #b91c1c; color: #b91c1c; }
/* 角标：改动数 / 待推送 / 冲突数 */
.cp-git-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 7px; font-size: 9px; font-weight: 700; line-height: 14px; text-align: center;
  background: var(--color-primary, #c2410c); color: #fff;
}
.cp-git-badge.blue { background: #2563eb; }
.cp-git-badge.danger { background: #dc2626; }
.cp-git-commit {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc); background: transparent;
  color: var(--color-text-secondary, #6b6b66);
  font-size: 12px; font-weight: 600; font-family: inherit; transition: all 0.15s ease;
}
.cp-git-commit:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cp-git-commit:disabled { opacity: 0.35; cursor: not-allowed; }
.cp-git-count {
  font-size: 10px; font-weight: 700; line-height: 15px; min-width: 16px; text-align: center;
  border-radius: 8px; padding: 0 4px;
  background: var(--color-primary, #c2410c); color: #fff;
}
.cp-git-branch-dropdown { width: 260px; }
.cp-git-sync-dropdown { width: 240px; }
.cp-task-badge {
  margin-left: auto; font-size: 10px; font-weight: 700; padding: 0 5px; border-radius: 7px;
  background: #eff6ff; color: #2563eb;
}
.cp-env { display: flex; align-items: center; gap: 6px; }
.cp-env-set {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 9px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc);
  background: transparent; color: var(--color-text-secondary, #6b6b66);
  font-size: 11.5px; font-family: inherit; transition: all 0.15s ease;
}
.cp-env-set:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.cp-env-set.active {
  border-color: var(--color-primary, #c2410c);
  background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent);
  color: var(--color-primary, #c2410c);
}

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
  background: var(--glass-bg, #fff);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
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
  background: var(--glass-bg, #fff);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
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

/* ===== 任务下拉面板 ===== */
.cp-task-trigger {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 8px; border-radius: 7px; border: none;
  background: transparent; cursor: pointer; font-family: inherit;
  transition: all 0.15s ease;
}
.cp-task-trigger:hover { background: var(--glass-bg-hover, #f1efe9); }
.cp-task-trigger.active { background: var(--glass-bg-hover, #f1efe9); }
.cp-task-caret { color: var(--color-text-tertiary, #9c9b94); transition: transform 0.15s ease; }
.cp-task-trigger.active .cp-task-caret { transform: rotate(180deg); }
.cp-task-dropdown {
  position: fixed; z-index: 9999; width: 260px; max-height: 400px; overflow-y: auto;
  background: var(--glass-bg, #fff); border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 6px 0;
}
.cp-task-section {
  font-size: 10.5px; font-weight: 600; color: var(--color-text-tertiary, #9c9b94);
  padding: 6px 12px 3px; text-transform: uppercase; letter-spacing: 0.5px;
}
.cp-task-divider { height: 1px; margin: 4px 8px; background: var(--glass-border, #e7e4dc); }
.cp-task-item {
  display: flex; align-items: center; gap: 7px; padding: 6px 12px;
  cursor: pointer; border-radius: 6px; margin: 0 4px; transition: background 0.12s ease;
}
.cp-task-item:hover { background: var(--glass-bg-hover, #f1efe9); }
.cp-task-item.active { background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent); color: var(--color-primary, #c2410c); }
.cp-task-item-label { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cp-task-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-tertiary, #9c9b94); flex-shrink: 0; }
.cp-task-item.active .cp-task-dot { background: var(--color-primary, #c2410c); }
.cp-task-empty { font-size: 11.5px; color: var(--color-text-tertiary, #9c9b94); padding: 4px 12px 8px; }
.cp-task-check { color: var(--color-primary, #c2410c); flex-shrink: 0; }
.cp-task-action { color: var(--color-primary, #c2410c); font-weight: 600; }
.cp-proj-dropdown { width: 280px; }

@media (max-width: 1100px) {
  .cp-chat { display: none; }
  .cp-env { display: none; }
}
</style>
