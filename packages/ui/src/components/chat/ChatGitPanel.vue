<template>
  <div class="git-panel">
    <!-- 仓库头：分支切换器 + ahead/behind + 拉取/推送/新建分支/刷新 -->
    <div class="git-toolbar">
      <el-select v-model="currentBranch" size="small" placeholder="分支" class="git-branch" @change="onCheckout">
        <el-option v-for="b in gitStore.branches" :key="b" :label="b" :value="b" />
      </el-select>
      <span v-if="aheadBehind.behind || aheadBehind.ahead" class="git-ab">
        <span v-if="aheadBehind.behind" class="git-ab-down">↓{{ aheadBehind.behind }}</span>
        <span v-if="aheadBehind.ahead" class="git-ab-up">↑{{ aheadBehind.ahead }}</span>
      </span>
      <el-button size="small" @click="doPull" title="拉取" :loading="pulling">
        <el-icon><Download /></el-icon>
      </el-button>
      <el-button size="small" @click="doPush" title="推送" :loading="pushing">
        <el-icon><Upload /></el-icon>
      </el-button>
      <el-button size="small" @click="doCreateBranch" title="新建分支">
        <el-icon><Plus /></el-icon>
      </el-button>
      <el-button size="small" @click="loadAll" title="刷新">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <!-- 视图 tab -->
    <div class="git-view-tabs">
      <button class="git-view-tab" :class="{ active: view === 'changes' }" @click="view = 'changes'">
        变更({{ changedFiles.length }})
      </button>
      <button class="git-view-tab" :class="{ active: view === 'tree' }" @click="view = 'tree'">文件树</button>
      <button class="git-view-tab" :class="{ active: view === 'history' }" @click="view = 'history'">历史</button>
    </div>

    <!-- ① 变更视图 -->
    <div v-show="view === 'changes'" class="git-view-body git-changes-view">
      <div class="git-changes-scroll">
        <template v-if="changedFiles.length">
          <!-- 未暂存组 -->
          <template v-if="unstagedFiles.length">
            <div class="git-group-label">未暂存</div>
            <div
              v-for="f in unstagedFiles"
              :key="'u' + f.path"
              class="git-change-row"
              @click="toggleDiff(f)"
            >
              <el-icon class="git-stage-btn" @click.stop="toggleStage(f)"><Plus /></el-icon>
              <span class="git-status-badge" :class="f.statusClass">{{ f.statusChar }}</span>
              <span class="git-change-path" :title="f.path">{{ f.path }}</span>
              <span v-if="f.added" class="git-num git-num-add">+{{ f.added }}</span>
              <span v-if="f.deleted" class="git-num git-num-del">−{{ f.deleted }}</span>
              <div v-if="expandedDiffPath === f.path" class="git-inline-diff" @click.stop>
                <div v-if="diffLoading" class="git-diff-loading">加载 diff...</div>
                <pre v-else>{{ diffContent || '（无差异）' }}</pre>
              </div>
            </div>
          </template>
          <!-- 已暂存组 -->
          <template v-if="stagedFiles.length">
            <div class="git-group-label">已暂存</div>
            <div
              v-for="f in stagedFiles"
              :key="'s' + f.path"
              class="git-change-row"
              @click="toggleDiff(f)"
            >
              <el-icon class="git-stage-btn" @click.stop="toggleStage(f)"><Minus /></el-icon>
              <span class="git-status-badge" :class="f.statusClass">{{ f.statusChar }}</span>
              <span class="git-change-path" :title="f.path">{{ f.path }}</span>
              <span v-if="f.added" class="git-num git-num-add">+{{ f.added }}</span>
              <span v-if="f.deleted" class="git-num git-num-del">−{{ f.deleted }}</span>
              <div v-if="expandedDiffPath === f.path" class="git-inline-diff" @click.stop>
                <div v-if="diffLoading" class="git-diff-loading">加载 diff...</div>
                <pre v-else>{{ diffContent || '（无差异）' }}</pre>
              </div>
            </div>
          </template>
        </template>
        <el-empty v-else description="无变更" :image-size="40" />
      </div>
      <!-- 提交区 -->
      <div class="git-commit-bar">
        <el-input v-model="commitMsg" type="textarea" :rows="2" size="small" placeholder="提交信息（Ctrl+Enter 提交）" @keydown.ctrl.enter.prevent="doCommit" />
        <div class="git-commit-actions">
          <span class="git-commit-count">已选 {{ stagedCount }} / 共 {{ changedFiles.length }}</span>
          <el-button size="small" @click="stageAll" :disabled="!unstagedFiles.length">全部暂存</el-button>
          <el-button size="small" type="primary" @click="doCommit" :disabled="!commitMsg.trim()">提交</el-button>
        </div>
      </div>
    </div>

    <!-- ② 文件树视图 -->
    <div v-show="view === 'tree'" class="git-view-body git-tree-view">
      <div class="git-tree-list">
        <el-tree
          :data="treeData"
          :props="treeProps"
          node-key="path"
          :expand-on-click-node="false"
          @node-click="onTreeNodeClick"
        >
          <template #default="{ data }">
            <span class="git-tree-node">
              <span class="git-status-badge" :class="data.gitStatus ? statusClassOf(data.gitStatus) : ''">
                {{ data.gitStatus ? statusCharOf(data.gitStatus) : '' }}
              </span>
              <span class="git-tree-name">{{ data.name }}</span>
            </span>
          </template>
        </el-tree>
        <el-empty v-if="!treeData.length" description="空仓库" :image-size="40" />
      </div>
      <div class="git-tree-preview">
        <CodeEditor v-if="treePreviewPath" :model-value="treePreviewContent" :read-only="true" :language="treePreviewLanguage" />
        <el-empty v-else description="点击文件预览" :image-size="40" />
      </div>
    </div>

    <!-- ③ 历史视图 -->
    <div v-show="view === 'history'" class="git-view-body git-history-view">
      <div v-if="logEntries.length" class="git-history-list">
        <div
          v-for="(c, i) in logEntries"
          :key="c.hash"
          class="git-history-row"
          :class="{ expanded: expandedCommit === c.hash }"
          @click="expandedCommit = expandedCommit === c.hash ? '' : c.hash"
        >
          <div class="git-history-main">
            <span class="git-history-hash">{{ shortHash(c.hash) }}</span>
            <span class="git-history-msg">{{ c.message.split('\n')[0] }}</span>
            <span class="git-history-meta">{{ c.author_name }} · {{ timeAgo(c.date) }}</span>
          </div>
          <div v-if="expandedCommit === c.hash" class="git-history-detail">
            <div class="git-history-full">{{ c.message }}</div>
            <div class="git-history-author">作者：{{ c.author_name }}</div>
            <div class="git-history-date">提交时间：{{ formatDate(c.date) }}</div>
          </div>
        </div>
      </div>
      <el-empty v-else description="无提交历史" :image-size="40" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Download, Upload, Plus, Minus } from '@element-plus/icons-vue';
import { useGitStore, type GitNumstatEntry, type GitAheadBehind } from '../../stores/git';
import { useSettingsStore } from '../../stores/settings';
import CodeEditor from '../CodeEditor.vue';

const gitStore = useGitStore();
const settingsStore = useSettingsStore();

type View = 'changes' | 'tree' | 'history';

const view = ref<View>('changes');
const currentBranch = ref('');
const numstat = ref<GitNumstatEntry[]>([]);
const aheadBehind = ref<GitAheadBehind>({ ahead: 0, behind: 0 });
const commitMsg = ref('');
const expandedDiffPath = ref('');
const diffContent = ref('');
const diffLoading = ref(false);
const pulling = ref(false);
const pushing = ref(false);

// 文件树
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
  gitStatus?: string;
}
const treeData = ref<TreeNode[]>([]);
const treeProps = { label: 'name', children: 'children' };
const treePreviewPath = ref('');
const treePreviewContent = ref('');
const treePreviewLanguage = ref<'javascript' | 'json' | 'markdown' | null>(null);

// 历史
const expandedCommit = ref('');

const STATUS_LABEL: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', R: 'renamed', U: 'conflict' };
const STATUS_CHAR: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D', untracked: '?', renamed: 'R', conflict: 'U' };
const STATUS_CLASS: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', R: 'renamed', U: 'conflict' };

const repo = computed(() => settingsStore.settings.workspaceDir);

interface ChangedFile {
  path: string;
  statusChar: string;
  statusClass: string;
  staged: boolean;
  added: number;
  deleted: number;
}

const changedFiles = computed<ChangedFile[]>(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  if (!st?.files) return [];
  const numMap = new Map(numstat.value.map((n) => [n.path, n]));
  const result: ChangedFile[] = [];
  for (const f of st.files) {
    const idx = f.index;
    const wd = f.working_dir;
    if (idx && idx !== ' ') {
      const n = numMap.get(f.path);
      result.push({
        path: f.path,
        statusChar: idx,
        statusClass: STATUS_CLASS[idx] || 'modified',
        staged: true,
        added: n?.added ?? 0,
        deleted: n?.deleted ?? 0,
      });
    }
    if (wd && wd !== ' ') {
      const n = numMap.get(f.path);
      result.push({
        path: f.path,
        statusChar: wd,
        statusClass: STATUS_CLASS[wd] || 'modified',
        staged: false,
        added: n?.added ?? 0,
        deleted: n?.deleted ?? 0,
      });
    }
  }
  return result;
});

const unstagedFiles = computed(() => changedFiles.value.filter((f) => !f.staged));
const stagedFiles = computed(() => changedFiles.value.filter((f) => f.staged));
const stagedCount = computed(() => stagedFiles.value.length);

const logEntries = computed(() => {
  const lg = gitStore.log as {
    all?: Array<{ hash: string; date: string; message: string; author_name: string }>;
  } | null;
  return lg?.all || [];
});

function statusCharOf(cls: string): string {
  return STATUS_CHAR[cls] || '?';
}
function statusClassOf(cls: string): string {
  return cls;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();
  for (const p of paths) {
    const segs = p.split('/');
    let parent: TreeNode[] = root;
    let acc = '';
    for (let i = 0; i < segs.length; i++) {
      acc = i === 0 ? segs[i] : acc + '/' + segs[i];
      const isLeaf = i === segs.length - 1;
      let node = map.get(acc);
      if (!node) {
        node = { name: segs[i], path: acc, type: isLeaf ? 'file' : 'dir' };
        if (!isLeaf) node.children = [];
        map.set(acc, node);
        parent.push(node);
      }
      if (!isLeaf) parent = node.children!;
    }
  }
  return root;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!d.getTime()) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function detectLanguage(filePath: string): 'javascript' | 'json' | 'markdown' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'json') return 'json';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  return null;
}

async function loadAll() {
  if (!repo.value) return;
  const branch = currentBranch.value;
  await Promise.all([
    gitStore.fetchStatus(repo.value),
    gitStore.fetchBranches(repo.value),
    gitStore.fetchLog(repo.value),
  ]);
  const st = gitStore.status as { current?: string } | null;
  currentBranch.value = st?.current || branch || '';
  const [numstatRes, abRes, treeRes] = await Promise.all([
    gitStore.fetchNumstat(repo.value),
    gitStore.fetchAheadBehind(repo.value, currentBranch.value || undefined),
    gitStore.fetchTree(repo.value),
  ]);
  numstat.value = numstatRes;
  aheadBehind.value = abRes;
  treeData.value = buildTree(treeRes.map((t) => t.path));
}

async function onCheckout() {
  if (!currentBranch.value) return;
  await gitStore.checkout(repo.value, currentBranch.value);
  await loadAll();
}

async function doCreateBranch() {
  try {
    const { value } = await ElMessageBox.prompt('新分支名称', '新建分支', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/,
      inputErrorMessage: '分支名只能包含字母、数字、点、下划线、斜杠、连字符',
    });
    if (!value?.trim()) return;
    await gitStore.createBranch(repo.value, value.trim());
    ElMessage.success('已创建并切换到分支 ' + value.trim());
    await loadAll();
  } catch {
    /* 用户取消 */
  }
}

async function toggleStage(f: ChangedFile) {
  if (f.staged) {
    const res = await gitStore.unstageFiles(repo.value, [f.path]);
    if ('error' in res) ElMessage.error(res.error);
  } else {
    const res = await gitStore.stageFiles(repo.value, [f.path]);
    if ('error' in res) ElMessage.error(res.error);
  }
  await loadAll();
}

async function stageAll() {
  const paths = unstagedFiles.value.map((f) => f.path);
  if (!paths.length) return;
  const res = await gitStore.stageFiles(repo.value, paths);
  if ('error' in res) ElMessage.error(res.error);
  await loadAll();
}

async function toggleDiff(f: ChangedFile) {
  if (expandedDiffPath.value === f.path) {
    expandedDiffPath.value = '';
    return;
  }
  expandedDiffPath.value = f.path;
  diffLoading.value = true;
  try {
    diffContent.value = await gitStore.diff(repo.value, { file: f.path });
  } catch {
    diffContent.value = '';
  } finally {
    diffLoading.value = false;
  }
}

async function onTreeNodeClick(data: TreeNode) {
  if (data.type !== 'file') return;
  treePreviewPath.value = data.path;
  treePreviewLanguage.value = detectLanguage(data.path);
  treePreviewContent.value = await gitStore.readFile(repo.value, data.path);
}

async function doCommit() {
  const msg = commitMsg.value.trim();
  if (!msg) return;
  const res = await gitStore.commit(repo.value, msg);
  if ('error' in res) ElMessage.error(res.error);
  else {
    ElMessage.success('已提交');
    commitMsg.value = '';
    expandedDiffPath.value = '';
    await loadAll();
  }
}

async function doPull() {
  pulling.value = true;
  try {
    const res = await gitStore.pull(repo.value, currentBranch.value);
    if ('error' in res) ElMessage.error(res.error);
    else { ElMessage.success('已拉取'); await loadAll(); }
  } finally {
    pulling.value = false;
  }
}

async function doPush() {
  pushing.value = true;
  try {
    const res = await gitStore.push(repo.value, currentBranch.value);
    if ('error' in res) ElMessage.error(res.error);
    else { ElMessage.success('已推送'); await loadAll(); }
  } finally {
    pushing.value = false;
  }
}

/** 外部（选了工作目录时）调用来初始化加载 */
async function init() {
  await gitStore.checkCapability();
  if (gitStore.supported && repo.value) await loadAll();
}

defineExpose({ init });
watch(repo, () => { if (repo.value) init(); }, { immediate: true });
</script>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.git-toolbar {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
}
.git-branch {
  flex: 1;
  min-width: 0;
  max-width: 160px;
}
.git-ab {
  display: inline-flex;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.git-ab-down { color: #3b82f6; }
.git-ab-up { color: #10b981; }
.git-view-tabs {
  display: flex;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
}
.git-view-tab {
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  border-bottom: 2px solid transparent;
}
.git-view-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
.git-view-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.git-changes-view {
  overflow: hidden;
}
.git-changes-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}
.git-group-label {
  padding: 6px 10px 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}
.git-change-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  flex-wrap: wrap;
}
.git-change-row:hover { background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05)); }
.git-stage-btn {
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  margin-top: 1px;
}
.git-stage-btn:hover { color: var(--color-primary); }
.git-change-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.git-num {
  font-size: 11px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.git-num-add { color: #10b981; }
.git-num-del { color: #ef4444; }
.git-inline-diff {
  flex-basis: 100%;
  max-height: 220px;
  overflow: auto;
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.04));
  border-radius: 6px;
  padding: 6px 8px;
  margin-top: 4px;
}
.git-inline-diff pre {
  margin: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  white-space: pre;
  color: var(--el-text-color-primary);
}
.git-diff-loading {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 0;
}
.git-commit-bar {
  border-top: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.git-commit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.git-commit-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 1;
}
.git-status-badge {
  display: inline-block;
  width: 16px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.git-status-badge.modified { color: #f59e0b; }
.git-status-badge.added { color: #10b981; }
.git-status-badge.deleted { color: #ef4444; }
.git-status-badge.untracked { color: #94a3b8; }
.git-status-badge.conflict { color: #ef4444; }
.git-status-badge.renamed { color: #8b5cf6; }
.git-tree-view {
  flex-direction: row;
}
.git-tree-list {
  width: 55%;
  overflow-y: auto;
  border-right: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  padding: 4px 0;
}
.git-tree-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.git-tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.git-tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.git-history-view {
  overflow-y: auto;
}
.git-history-list {
  padding: 4px 0;
}
.git-history-row {
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba(15, 23, 42, 0.04);
}
.git-history-row:hover { background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05)); }
.git-history-row.expanded { background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05)); }
.git-history-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.git-history-hash {
  font-family: "JetBrains Mono", monospace;
  color: var(--color-primary);
  flex-shrink: 0;
}
.git-history-msg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.git-history-meta {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  flex-shrink: 0;
}
.git-history-detail {
  margin-top: 6px;
  padding: 6px 8px;
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.04));
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.git-history-full {
  white-space: pre-wrap;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}
.git-history-author, .git-history-date {
  margin-top: 2px;
}
</style>
