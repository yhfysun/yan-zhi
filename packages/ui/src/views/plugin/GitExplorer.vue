<template>
  <div class="git-explorer">
    <div v-if="supported === null" class="gx-empty">检测 Git 能力中…</div>
    <div v-else-if="supported === false" class="gx-empty">当前平台不支持本地 Git，请在桌面端使用</div>
    <template v-else>
      <!-- 顶栏：仓库 / 分支 / 同步 -->
      <div class="gx-toolbar">
        <el-select
          v-model="repo"
          class="gx-repo-select"
          size="small"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入仓库路径"
          @change="onRepoChange"
        >
          <el-option v-for="r in recentRepos" :key="r" :label="repoLabel(r)" :value="r" />
        </el-select>
        <template v-if="repo">
          <el-dropdown trigger="click" @command="onBranchCommand">
            <span class="gx-branch-chip">
              <el-icon><Sort /></el-icon>
              <span class="gx-branch-name">{{ currentBranch || '分支' }}</span>
              <span v-if="aheadBehind.ahead" class="gx-ab up">↑{{ aheadBehind.ahead }}</span>
              <span v-if="aheadBehind.behind" class="gx-ab down">↓{{ aheadBehind.behind }}</span>
              <el-icon class="gx-caret"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="b in localBranches" :key="b" :command="b" :class="{ active: b === currentBranch }">
                  {{ b }}
                </el-dropdown-item>
                <el-dropdown-item divided command="__new__">新建分支…</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-tooltip content="拉取" placement="bottom">
            <el-button size="small" text :loading="busy" :disabled="!aheadBehind.behind && !hasRemote" @click="doPull">
              <el-icon><RefreshLeft /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="推送" placement="bottom">
            <el-button size="small" text :loading="busy" :disabled="!aheadBehind.ahead && !hasRemote" @click="doPush">
              <el-icon><RefreshRight /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
        <div class="gx-spacer" />
        <el-tooltip content="刷新" placement="bottom">
          <el-button size="small" text :loading="gitLoading" :disabled="!repo" @click="loadRepoData(repo)">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <div v-if="!repo" class="gx-empty">
        <el-icon class="gx-empty-icon"><Connection /></el-icon>
        <div>选择一个仓库开始</div>
      </div>

      <div v-else class="gx-body">
        <!-- 左栏：更改 / 文件树 -->
        <div class="gx-left">
          <div class="gx-tabs">
            <button class="gx-tab" :class="{ active: leftTab === 'changes' }" @click="leftTab = 'changes'">更改</button>
            <button class="gx-tab" :class="{ active: leftTab === 'tree' }" @click="leftTab = 'tree'">文件树</button>
          </div>

          <!-- 更改 tab -->
          <template v-if="leftTab === 'changes'">
            <div class="gx-commit-box">
              <el-input
                v-model="commitMsg"
                type="textarea"
                :rows="2"
                resize="none"
                placeholder="提交信息 (Ctrl+Enter 提交)"
                @keydown.ctrl.enter.prevent="doCommit"
              />
              <div class="gx-commit-actions">
                <el-button size="small" text :disabled="!unstagedFiles.length" @click="stageAll">
                  全部暂存 ({{ unstagedFiles.length }})
                </el-button>
                <div class="gx-spacer" />
                <el-button
                  size="small"
                  type="primary"
                  :disabled="!stagedFiles.length || !commitMsg.trim()"
                  :loading="busy"
                  @click="doCommit"
                >
                  提交 ({{ stagedFiles.length }})
                </el-button>
              </div>
            </div>

            <div class="gx-filter">
              <el-input v-model="filterText" size="small" placeholder="筛选文件" clearable>
                <template #prefix><el-icon><Document /></el-icon></template>
              </el-input>
            </div>

            <div class="gx-list">
              <!-- 冲突 -->
              <template v-if="visiblePaths(conflictFiles).length">
                <div class="gx-group-head">
                  <span class="gx-caret-btn" @click="groups.conflict = !groups.conflict">
                    <el-icon><CaretRight v-if="!groups.conflict" /><CaretBottom v-else /></el-icon>
                  </span>
                  <el-icon class="gx-group-icon danger"><WarningFilled /></el-icon>
                  <span class="gx-group-title">合并冲突</span>
                  <span class="gx-group-count">{{ visiblePaths(conflictFiles).length }}</span>
                  <el-button size="small" text class="gx-group-act" @click="doAbortMerge">中止合并</el-button>
                </div>
                <template v-if="groups.conflict">
                  <div
                    v-for="p in visiblePaths(conflictFiles)"
                    :key="'c-' + p"
                    class="gx-file"
                    :class="{ active: selectedFile === p }"
                    @click="openDiff(p, false)"
                  >
                    <span class="gx-file-name">{{ baseName(p) }}</span>
                    <span class="gx-file-dir">{{ dirName(p) }}</span>
                    <span class="gx-status danger">U</span>
                  </div>
                </template>
              </template>

              <!-- 已暂存 -->
              <template v-if="visibleFiles(stagedFiles).length">
                <div class="gx-group-head">
                  <span class="gx-caret-btn" @click="groups.staged = !groups.staged">
                    <el-icon><CaretRight v-if="!groups.staged" /><CaretBottom v-else /></el-icon>
                  </span>
                  <span class="gx-group-title">已暂存</span>
                  <span class="gx-group-count">{{ visibleFiles(stagedFiles).length }}</span>
                  <el-button size="small" text class="gx-group-act" @click="unstageAll">全部取消</el-button>
                </div>
                <template v-if="groups.staged">
                  <div
                    v-for="f in visibleFiles(stagedFiles)"
                    :key="'s-' + f.path"
                    class="gx-file"
                    :class="{ active: selectedFile === f.path }"
                    @click="openDiff(f.path, true)"
                  >
                    <span class="gx-file-name">{{ baseName(f.path) }}</span>
                    <span class="gx-file-dir">{{ dirName(f.path) }}</span>
                    <span class="gx-add-del" v-if="f.added || f.deleted">
                      <i class="gx-n add">+{{ f.added }}</i><i class="gx-n del">−{{ f.deleted }}</i>
                    </span>
                    <span class="gx-status" :class="f.statusClass">{{ f.statusChar }}</span>
                    <span class="gx-acts" @click.stop>
                      <el-tooltip content="取消暂存" placement="top">
                        <el-button size="small" text @click="doUnstage([f.path])"><el-icon><RefreshLeft /></el-icon></el-button>
                      </el-tooltip>
                    </span>
                  </div>
                </template>
              </template>

              <!-- 未暂存 -->
              <template v-if="visibleFiles(unstagedFiles).length">
                <div class="gx-group-head">
                  <span class="gx-caret-btn" @click="groups.unstaged = !groups.unstaged">
                    <el-icon><CaretRight v-if="!groups.unstaged" /><CaretBottom v-else /></el-icon>
                  </span>
                  <span class="gx-group-title">未暂存</span>
                  <span class="gx-group-count">{{ visibleFiles(unstagedFiles).length }}</span>
                  <el-button size="small" text class="gx-group-act" @click="stageVisible">全部暂存</el-button>
                </div>
                <template v-if="groups.unstaged">
                  <div
                    v-for="f in visibleFiles(unstagedFiles)"
                    :key="'u-' + f.path"
                    class="gx-file"
                    :class="{ active: selectedFile === f.path }"
                    @click="openDiff(f.path, false)"
                  >
                    <span class="gx-file-name">{{ baseName(f.path) }}</span>
                    <span class="gx-file-dir">{{ dirName(f.path) }}</span>
                    <span class="gx-add-del" v-if="f.added || f.deleted">
                      <i class="gx-n add">+{{ f.added }}</i><i class="gx-n del">−{{ f.deleted }}</i>
                    </span>
                    <span class="gx-status" :class="f.statusClass">{{ f.statusChar }}</span>
                    <span class="gx-acts" @click.stop>
                      <el-tooltip content="放弃更改" placement="top">
                        <el-button size="small" text @click="doRestore(f.path)"><el-icon><Delete /></el-icon></el-button>
                      </el-tooltip>
                      <el-tooltip content="暂存" placement="top">
                        <el-button size="small" text @click="doStage([f.path])"><el-icon><RefreshRight /></el-icon></el-button>
                      </el-tooltip>
                    </span>
                  </div>
                </template>
              </template>

              <!-- 未跟踪 -->
              <template v-if="visibleFiles(untrackedFiles).length">
                <div class="gx-group-head">
                  <span class="gx-caret-btn" @click="groups.untracked = !groups.untracked">
                    <el-icon><CaretRight v-if="!groups.untracked" /><CaretBottom v-else /></el-icon>
                  </span>
                  <span class="gx-group-title">未跟踪</span>
                  <span class="gx-group-count">{{ visibleFiles(untrackedFiles).length }}</span>
                  <el-button size="small" text class="gx-group-act" @click="stageVisibleUntracked">全部暂存</el-button>
                </div>
                <template v-if="groups.untracked">
                  <div
                    v-for="f in visibleFiles(untrackedFiles)"
                    :key="'n-' + f.path"
                    class="gx-file"
                    :class="{ active: selectedFile === f.path }"
                    @click="openDiff(f.path, false)"
                  >
                    <span class="gx-file-name">{{ baseName(f.path) }}</span>
                    <span class="gx-file-dir">{{ dirName(f.path) }}</span>
                    <span class="gx-status untracked">U</span>
                    <span class="gx-acts" @click.stop>
                      <el-tooltip content="暂存" placement="top">
                        <el-button size="small" text @click="doStage([f.path])"><el-icon><RefreshRight /></el-icon></el-button>
                      </el-tooltip>
                    </span>
                  </div>
                </template>
              </template>

              <div v-if="!hasVisible" class="gx-list-empty">{{ filterText ? '无匹配文件' : '没有更改' }}</div>
            </div>
          </template>

          <!-- 文件树 tab -->
          <template v-else>
            <div class="gx-list gx-tree">
              <div
                v-for="f in gitStore.fileTree"
                :key="f.path"
                class="gx-file"
                :class="{ active: selectedFile === f.path, dir: f.type === 'dir' }"
                @click="f.type === 'dir' ? expandDir(f.path) : previewFile(f.path)"
              >
                <el-icon v-if="f.type === 'dir'" class="gx-dir-icon"><FolderOpened /></el-icon>
                <span class="gx-file-name">{{ f.name }}</span>
                <span v-if="f.gitStatus" class="gx-status" :class="String(f.gitStatus).slice(0, 3) === 'mod' ? 'modified' : 'untracked'">
                  {{ f.gitStatus === 'untracked' ? 'U' : 'M' }}
                </span>
              </div>
              <div v-if="!gitStore.fileTree.length" class="gx-list-empty">空目录</div>
            </div>
          </template>
        </div>

        <!-- 右栏：diff / 预览 -->
        <div class="gx-right">
          <div v-if="!selectedFile" class="gx-preview-empty">选择文件查看差异或内容</div>
          <template v-else>
            <div class="gx-preview-head">
              <span class="gx-preview-path" :title="selectedFile">{{ selectedFile }}</span>
              <span v-if="selectedAdded || selectedDeleted" class="gx-add-del">
                <i class="gx-n add">+{{ selectedAdded }}</i><i class="gx-n del">−{{ selectedDeleted }}</i>
              </span>
              <el-button-group v-if="previewMode" class="gx-view-toggle">
                <el-button size="small" :type="rightMode === 'diff' ? 'primary' : ''" @click="rightMode = 'diff'">Diff</el-button>
                <el-button size="small" :type="rightMode === 'content' ? 'primary' : ''" @click="rightMode = 'content'">内容</el-button>
              </el-button-group>
            </div>
            <div class="gx-preview-body">
              <GitDiffViewer v-if="rightMode === 'diff'" :diff-text="diffText" :file-name="selectedFile" />
              <CodeEditor v-else :model-value="previewContent" :read-only="true" :language="previewLanguage" />
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Refresh, RefreshLeft, RefreshRight, Sort, ArrowDown, Connection, Document,
  CaretRight, CaretBottom, WarningFilled, Delete, FolderOpened,
} from '@element-plus/icons-vue';
import { useGitStore, type GitNumstatEntry, type GitAheadBehind } from '../../stores/git';
import GitDiffViewer from '../../components/chat/GitDiffViewer.vue';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();
const router = useRouter();
const gitStore = useGitStore();

const REPO_LS_KEY = 'yz:git-explorer:repo';

const supported = ref<boolean | null>(null);
const repo = ref('');
const recentRepos = ref<string[]>([]);
const leftTab = ref<'changes' | 'tree'>('changes');
const busy = ref(false);
const gitLoading = ref(false);

const currentBranch = ref('');
const numstat = ref<GitNumstatEntry[]>([]);
const aheadBehind = ref<GitAheadBehind>({ ahead: 0, behind: 0 });
const hasRemote = ref(false);

const filterText = ref('');
const commitMsg = ref('');
const selectedFile = ref('');
const diffText = ref('');
const rightMode = ref<'diff' | 'content'>('diff');
const previewMode = ref(false);
const previewContent = ref('');
const previewLanguage = ref<'javascript' | 'json' | 'markdown' | null>(null);
const selectedAdded = ref(0);
const selectedDeleted = ref(0);
const diffLoading = ref(false);

const groups = reactive({ conflict: true, staged: true, unstaged: true, untracked: true });

const STATUS_CLASS: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', R: 'renamed', U: 'conflict' };
const UNMERGED_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

interface ChangedFile { path: string; statusChar: string; statusClass: string; staged: boolean; added: number; deleted: number; }

// ===== 派生 =====
const localBranches = computed(() => (gitStore.branches || []).filter((b) => !b.startsWith('remotes/') && !b.startsWith('origin/HEAD')));

const statusFiles = computed<Array<{ path: string; index: string; working_dir: string }>>(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  return st?.files || [];
});

const changedFiles = computed<ChangedFile[]>(() => {
  const numMap = new Map(numstat.value.map((n) => [n.path, n]));
  const out: ChangedFile[] = [];
  for (const f of statusFiles.value) {
    const idx = f.index || ' ';
    const wd = f.working_dir || ' ';
    const n = numMap.get(f.path);
    if (idx !== ' ') out.push({ path: f.path, statusChar: idx, statusClass: STATUS_CLASS[idx] || 'modified', staged: true, added: n?.added ?? 0, deleted: n?.deleted ?? 0 });
    if (wd !== ' ') out.push({ path: f.path, statusChar: wd, statusClass: STATUS_CLASS[wd] || 'modified', staged: false, added: n?.added ?? 0, deleted: n?.deleted ?? 0 });
  }
  return out;
});
const stagedFiles = computed(() => changedFiles.value.filter((f) => f.staged && f.statusChar !== '?'));
const unstagedFiles = computed(() => changedFiles.value.filter((f) => !f.staged && f.statusChar !== '?'));
const untrackedFiles = computed(() => changedFiles.value.filter((f) => f.statusChar === '?'));
const conflictFiles = computed<string[]>(() =>
  statusFiles.value.filter((f) => UNMERGED_CODES.has((f.index || ' ') + (f.working_dir || ' '))).map((f) => f.path),
);

function visibleFiles(list: ChangedFile[]): ChangedFile[] {
  const q = filterText.value.trim().toLowerCase();
  return q ? list.filter((f) => f.path.toLowerCase().includes(q)) : list;
}
function visiblePaths(list: string[]): string[] {
  const q = filterText.value.trim().toLowerCase();
  return q ? list.filter((p) => p.toLowerCase().includes(q)) : list;
}
const hasVisible = computed(
  () =>
    visiblePaths(conflictFiles.value).length +
      visibleFiles(stagedFiles.value).length +
      visibleFiles(unstagedFiles.value).length +
      visibleFiles(untrackedFiles.value).length >
    0,
);

function baseName(p: string): string { return p.split(/[\\/]/).pop() || p; }
function dirName(p: string): string {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.length ? parts.join('/') : '';
}
function repoLabel(r: string): string {
  const name = r.split(/[\\/]/).filter(Boolean).pop() || r;
  return `${name}  (${r})`;
}
function detectLanguage(filePath: string): 'javascript' | 'json' | 'markdown' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'json') return 'json';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  return null;
}

// ===== 数据加载 =====
async function loadRepoData(target?: string) {
  const r = (target || repo.value).trim();
  if (!r) return;
  repo.value = r;
  gitLoading.value = true;
  try {
    await Promise.all([
      gitStore.fetchStatus(r),
      gitStore.fetchBranches(r),
      gitStore.fetchNumstat(r),
      gitStore.fetchAheadBehind(r).then((ab) => { aheadBehind.value = ab; }),
    ]);
    const st = gitStore.status as { current?: string; remote?: unknown } | null;
    currentBranch.value = st?.current || '';
    hasRemote.value = !!st?.remote;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    gitLoading.value = false;
  }
}

function onRepoChange(r: string) {
  const p = (r || '').trim();
  if (!p) return;
  // 记住最近仓库
  recentRepos.value = [p, ...recentRepos.value.filter((x) => x !== p)].slice(0, 8);
  try { localStorage.setItem(REPO_LS_KEY, JSON.stringify(recentRepos.value)); } catch { /* ignore */ }
  selectedFile.value = '';
  diffText.value = '';
  previewMode.value = false;
  void router.replace({ query: { ...route.query, repo: p } });
  void loadRepoData(p);
}

async function expandDir(subPath: string) {
  await gitStore.fetchFileTree(repo.value, subPath);
}

async function openDiff(path: string, staged: boolean) {
  selectedFile.value = path;
  rightMode.value = 'diff';
  const n = numstat.value.find((x) => x.path === path);
  selectedAdded.value = n?.added ?? 0;
  selectedDeleted.value = n?.deleted ?? 0;
  const isUntracked = untrackedFiles.value.some((f) => f.path === path);
  if (isUntracked) {
    previewMode.value = false;
    diffLoading.value = true;
    try {
      const content = await gitStore.readFile(repo.value, path);
      diffText.value = content.split('\n').map((l) => `+${l}`).join('\n');
    } catch {
      diffText.value = '';
    } finally {
      diffLoading.value = false;
    }
    return;
  }
  previewMode.value = true;
  diffLoading.value = true;
  try {
    diffText.value = await gitStore.diff(repo.value, { file: path, staged });
  } catch (e) {
    diffText.value = `差异加载失败：${(e as Error).message}`;
  } finally {
    diffLoading.value = false;
  }
}

async function previewFile(path: string) {
  selectedFile.value = path;
  rightMode.value = 'content';
  previewContent.value = await gitStore.readFile(repo.value, path);
  previewLanguage.value = detectLanguage(path);
  previewMode.value = false;
}

// ===== 操作 =====
async function doStage(files: string[]) {
  if (!files.length) return;
  busy.value = true;
  try {
    await gitStore.stageFiles(repo.value, files);
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}
async function doUnstage(files: string[]) {
  if (!files.length) return;
  busy.value = true;
  try {
    await gitStore.unstageFiles(repo.value, files);
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}
function stageAll() { void doStage(unstagedFiles.value.map((f) => f.path)); }
function stageVisible() { void doStage(visibleFiles(unstagedFiles.value).map((f) => f.path)); }
function stageVisibleUntracked() { void doStage(visibleFiles(untrackedFiles.value).map((f) => f.path)); }
function unstageAll() { void doUnstage(stagedFiles.value.map((f) => f.path)); }

async function doRestore(path: string) {
  try {
    await ElMessageBox.confirm(`放弃 ${path} 的未暂存更改？此操作不可恢复。`, '放弃更改', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '取消' });
  } catch { return; }
  busy.value = true;
  try {
    await gitStore.restore(repo.value, [path]);
    if (selectedFile.value === path) { selectedFile.value = ''; diffText.value = ''; }
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}

async function doCommit() {
  const files = stagedFiles.value.map((f) => f.path);
  const msg = commitMsg.value.trim();
  if (!files.length || !msg) return;
  busy.value = true;
  try {
    await gitStore.commit(repo.value, msg, files);
    commitMsg.value = '';
    ElMessage.success('已提交');
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}

async function doAbortMerge() {
  try {
    await ElMessageBox.confirm('中止当前合并，恢复到合并前状态？', '中止合并', { type: 'warning', confirmButtonText: '中止', cancelButtonText: '取消' });
  } catch { return; }
  busy.value = true;
  try {
    await gitStore.abortMerge(repo.value);
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}

async function doPull() {
  busy.value = true;
  try {
    await gitStore.pull(repo.value, currentBranch.value);
    ElMessage.success('拉取完成');
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}
async function doPush() {
  busy.value = true;
  try {
    await gitStore.push(repo.value, currentBranch.value);
    ElMessage.success('推送完成');
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { busy.value = false; }
}

async function onBranchCommand(cmd: string) {
  if (cmd === '__new__') {
    let name = '';
    try {
      const res = await ElMessageBox.prompt('新分支名称', '新建分支', { confirmButtonText: '创建', cancelButtonText: '取消', inputPattern: /\S+/, inputErrorMessage: '名称不能为空' });
      name = (res.value || '').trim();
    } catch { return; }
    if (!name) return;
    try {
      await gitStore.createBranch(repo.value, name);
      await gitStore.checkout(repo.value, name);
      ElMessage.success(`已切换到 ${name}`);
      await loadRepoData();
    } catch (e) {
      ElMessage.error((e as Error).message);
    }
    return;
  }
  if (cmd === currentBranch.value) return;
  try {
    await gitStore.checkout(repo.value, cmd);
    await loadRepoData();
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

// 选中的文件变化时若已不在更改列表则清空右栏
watch(changedFiles, (list) => {
  if (selectedFile.value && !list.some((f) => f.path === selectedFile.value)) {
    const inTree = gitStore.fileTree.some((f) => f.path === selectedFile.value && f.type === 'file');
    if (!inTree) { selectedFile.value = ''; diffText.value = ''; }
  }
});

onMounted(async () => {
  await gitStore.checkCapability();
  supported.value = gitStore.supported;
  try {
    const saved = JSON.parse(localStorage.getItem(REPO_LS_KEY) || '[]');
    if (Array.isArray(saved)) recentRepos.value = saved.filter((x) => typeof x === 'string');
  } catch { /* ignore */ }
  const q = route.query.repo as string | undefined;
  const initial = q?.trim() || recentRepos.value[0] || '';
  if (initial) {
    if (!recentRepos.value.includes(initial)) recentRepos.value = [initial, ...recentRepos.value];
    await loadRepoData(initial);
  }
});
</script>

<style scoped>
.git-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
}
.gx-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  flex: none;
}
.gx-repo-select { width: 300px; }
.gx-spacer { flex: 1; }
.gx-branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}
.gx-branch-chip:hover { background: var(--color-surface-hover); }
.gx-branch-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gx-caret { font-size: 12px; color: var(--color-text-secondary); }
.gx-ab { font-weight: 700; font-size: 11px; }
.gx-ab.up { color: #10b981; }
.gx-ab.down { color: #f59e0b; }

.gx-body { flex: 1; display: flex; min-height: 0; }
.gx-left {
  width: 320px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  min-height: 0;
}
.gx-right { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

.gx-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  flex: none;
}
.gx-tab {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
}
.gx-tab.active { color: var(--color-primary); font-weight: 600; border-bottom: 2px solid var(--color-primary); }
.gx-tab:hover { color: var(--color-text); }

.gx-commit-box { padding: 8px 10px 4px; flex: none; }
.gx-commit-actions { display: flex; align-items: center; gap: 6px; margin-top: 6px; }

.gx-filter { padding: 4px 10px; flex: none; }

.gx-list { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: 8px; }
.gx-group-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 1;
}
.gx-caret-btn { display: inline-flex; cursor: pointer; color: var(--color-text-secondary); }
.gx-group-title { flex: none; }
.gx-group-count { color: var(--color-text-secondary); font-weight: 400; }
.gx-group-act { margin-left: auto; font-size: 11px; padding: 2px 6px; height: auto; }
.gx-group-icon.danger { color: #ef4444; }

.gx-file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 24px;
  font-size: 12.5px;
  cursor: pointer;
  min-width: 0;
}
.gx-file:hover { background: var(--color-surface-hover); }
.gx-file.active { background: var(--color-surface-active, var(--color-surface-hover)); }
.gx-file.dir { padding-left: 10px; font-weight: 600; }
.gx-dir-icon { color: var(--color-text-secondary); flex: none; }
.gx-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: none; max-width: 55%; }
.gx-file-dir { color: var(--color-text-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.gx-add-del { display: inline-flex; gap: 4px; flex: none; }
.gx-n { font-style: normal; font-size: 11px; font-weight: 600; }
.gx-n.add { color: #10b981; }
.gx-n.del { color: #ef4444; }
.gx-status {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  width: 14px;
  text-align: center;
}
.gx-status.modified { color: #f59e0b; }
.gx-status.untracked { color: #94a3b8; }
.gx-status.added { color: #10b981; }
.gx-status.deleted { color: #ef4444; }
.gx-status.renamed { color: #3b82f6; }
.gx-status.conflict, .gx-status.danger { color: #ef4444; }
.gx-acts { display: none; align-items: center; gap: 0; flex: none; margin-left: auto; }
.gx-file:hover .gx-acts { display: inline-flex; }
.gx-file:hover .gx-add-del { display: none; }
.gx-file:hover .gx-acts .el-button { padding: 2px 4px; }

.gx-list-empty { padding: 24px; text-align: center; color: var(--color-text-secondary); font-size: 12px; }
.gx-tree { padding-top: 4px; }

.gx-preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.gx-preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  flex: none;
}
.gx-preview-path { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gx-view-toggle { margin-left: auto; flex: none; }
.gx-preview-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }

.gx-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.gx-empty-icon { font-size: 32px; }

@media (max-width: 767px) {
  .gx-toolbar { flex-wrap: wrap; }
  .gx-repo-select { width: 100%; }
  .gx-body { flex-direction: column; }
  .gx-left { width: 100%; flex: none; max-height: 45%; border-right: none; border-bottom: 1px solid var(--color-border); }
}
</style>
