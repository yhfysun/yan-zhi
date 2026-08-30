<template>
  <div class="git-panel">
    <!-- 工具栏 -->
    <div class="git-toolbar">
      <el-select v-model="currentBranch" size="small" placeholder="分支" style="flex:1;min-width:0" @change="onCheckout">
        <el-option v-for="b in gitStore.branches" :key="b" :label="b" :value="b" />
      </el-select>
      <el-button size="small" @click="doPull" title="拉取">拉</el-button>
      <el-button size="small" @click="doPush" title="推送">推</el-button>
      <el-button size="small" @click="loadAll" title="刷新">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <!-- 面包屑 -->
    <div class="git-breadcrumb">
      <span class="git-crumb" @click="navigateTo('')">根</span>
      <template v-for="(seg, i) in currentPathSegments" :key="i">
        <span class="git-crumb-sep">/</span>
        <span class="git-crumb" @click="navigateTo(currentPathSegments.slice(0, i + 1).join('/'))">{{ seg }}</span>
      </template>
    </div>

    <!-- 文件列表 -->
    <div class="git-filelist">
      <div v-if="currentPath" class="git-file-item dir" @click="goUp">
        <span class="git-status-badge"></span>
        <span class="git-file-name">..</span>
      </div>
      <div
        v-for="f in gitStore.fileTree"
        :key="f.path"
        class="git-file-item"
        :class="{ dir: f.type === 'dir', active: f.path === selectedPath }"
        @click="f.type === 'dir' ? navigateTo(f.path) : selectFile(f)"
      >
        <span class="git-status-badge" :class="f.gitStatus">{{ f.gitStatus ? STATUS_LABEL[f.gitStatus] || f.gitStatus[0].toUpperCase() : '' }}</span>
        <span class="git-file-name">{{ f.name }}</span>
      </div>
    </div>

    <!-- 下半区 -->
    <div class="git-bottom">
      <div class="git-bottom-tabs">
        <button class="git-bottom-tab" :class="{ active: bottomTab === 'content' }" @click="bottomTab = 'content'">内容</button>
        <button v-if="canDiff" class="git-bottom-tab" :class="{ active: bottomTab === 'diff' }" @click="bottomTab = 'diff'">Diff</button>
        <button class="git-bottom-tab" :class="{ active: bottomTab === 'changes' }" @click="bottomTab = 'changes'">
          变更({{ changedFiles.length }})
        </button>
      </div>
      <div class="git-bottom-body">
        <div v-show="bottomTab === 'content'" class="git-bottom-content">
          <CodeEditor v-if="selectedPath" :model-value="fileContent" :read-only="true" :language="fileLanguage" />
          <el-empty v-else description="选择文件预览" :image-size="40" />
        </div>
        <div v-show="bottomTab === 'diff'" class="git-bottom-content">
          <DiffEditor v-if="selectedPath && canDiff" :original="originalContent" :modified="fileContent" :language="fileLanguage" />
          <el-empty v-else description="无变更" :image-size="40" />
        </div>
        <div v-show="bottomTab === 'changes'" class="git-changes">
          <div class="git-changes-list">
            <div v-for="f in changedFiles" :key="f.path" class="git-change-item">
              <el-checkbox v-model="staged[f.path]" size="small" />
              <span class="git-status-badge" :class="f.statusClass">{{ f.statusChar }}</span>
              <span class="git-change-path">{{ f.path }}</span>
            </div>
            <el-empty v-if="changedFiles.length === 0" description="无变更" :image-size="40" />
          </div>
          <el-input v-model="commitMsg" type="textarea" :rows="2" placeholder="提交信息" size="small" />
          <el-button size="small" type="primary" @click="doCommit" :disabled="!commitMsg">提交</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { useGitStore } from '../../stores/git';
import { useSettingsStore } from '../../stores/settings';
import CodeEditor from '../CodeEditor.vue';
import DiffEditor from '../DiffEditor.vue';

const gitStore = useGitStore();
const settingsStore = useSettingsStore();

const currentPath = ref('');
const currentBranch = ref('');
const selectedPath = ref('');
const fileContent = ref('');
const originalContent = ref('');
const fileLanguage = ref<'javascript' | 'json' | 'markdown' | null>(null);
const bottomTab = ref<'content' | 'diff' | 'changes'>('content');
const commitMsg = ref('');
const staged = ref<Record<string, boolean>>({});

const STATUS_LABEL: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D', untracked: '?', renamed: 'R', conflict: 'U' };

const repo = computed(() => settingsStore.settings.workspaceDir);

const currentPathSegments = computed(() => currentPath.value ? currentPath.value.split('/').filter(Boolean) : []);

const changedFiles = computed(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  if (!st?.files) return [];
  return st.files.map((f) => {
    const code = f.working_dir !== ' ' ? f.working_dir : f.index;
    const cls: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', U: 'conflict' };
    return { path: f.path, statusChar: code || '?', statusClass: cls[code] || 'modified' };
  });
});

const canDiff = computed(() => {
  if (!selectedPath.value) return false;
  const node = gitStore.fileTree.find((f) => f.path === selectedPath.value);
  return !!node?.gitStatus && node.gitStatus !== 'untracked';
});

function detectLanguage(filePath: string): 'javascript' | 'json' | 'markdown' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'json') return 'json';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  return null;
}

async function loadAll() {
  if (!repo.value) return;
  await Promise.all([
    gitStore.fetchStatus(repo.value),
    gitStore.fetchFileTree(repo.value, currentPath.value),
    gitStore.fetchBranches(repo.value),
    gitStore.fetchLog(repo.value),
  ]);
  const st = gitStore.status as { current?: string } | null;
  currentBranch.value = st?.current || '';
}

async function navigateTo(subPath: string) {
  currentPath.value = subPath;
  await gitStore.fetchFileTree(repo.value, subPath);
}

function goUp() {
  const segs = currentPathSegments.value.slice(0, -1);
  navigateTo(segs.join('/'));
}

async function selectFile(f: { path: string }) {
  selectedPath.value = f.path;
  fileLanguage.value = detectLanguage(f.path);
  fileContent.value = await gitStore.readFile(repo.value, f.path);
  const node = gitStore.fileTree.find((x) => x.path === f.path);
  if (node?.gitStatus && node.gitStatus !== 'untracked') {
    originalContent.value = await gitStore.show(repo.value, f.path);
    bottomTab.value = 'diff';
  } else {
    originalContent.value = '';
    bottomTab.value = 'content';
  }
}

async function onCheckout() {
  await gitStore.checkout(repo.value, currentBranch.value);
  await loadAll();
}

async function doCommit() {
  const files = Object.keys(staged.value).filter((k) => staged.value[k]);
  const res = await gitStore.commit(repo.value, commitMsg.value, files.length ? files : undefined);
  if ('error' in res) ElMessage.error(res.error);
  else { ElMessage.success('已提交'); commitMsg.value = ''; staged.value = {}; await loadAll(); }
}

async function doPull() {
  const res = await gitStore.pull(repo.value, currentBranch.value);
  if ('error' in res) ElMessage.error(res.error);
  else { ElMessage.success('已拉取'); await loadAll(); }
}

async function doPush() {
  const res = await gitStore.push(repo.value, currentBranch.value);
  if ('error' in res) ElMessage.error(res.error);
  else { ElMessage.success('已推送'); await loadAll(); }
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
.git-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  flex-wrap: wrap;
}
.git-crumb {
  cursor: pointer;
  color: var(--color-primary);
}
.git-crumb:hover { text-decoration: underline; }
.git-crumb-sep { margin: 0 2px; }
.git-filelist {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  min-height: 0;
}
.git-file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 13px;
}
.git-file-item:hover { background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05)); }
.git-file-item.active { background: var(--el-color-primary-light-9, rgba(124, 58, 237, 0.1)); }
.git-file-item.dir .git-file-name { font-weight: 600; }
.git-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-status-badge {
  display: inline-block;
  width: 16px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-placeholder);
}
.git-status-badge.modified { color: #f59e0b; }
.git-status-badge.added { color: #10b981; }
.git-status-badge.deleted { color: #ef4444; }
.git-status-badge.untracked { color: #94a3b8; }
.git-status-badge.conflict { color: #ef4444; }
.git-bottom {
  height: 45%;
  min-height: 140px;
  border-top: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  display: flex;
  flex-direction: column;
}
.git-bottom-tabs {
  display: flex;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
}
.git-bottom-tab {
  padding: 5px 12px;
  font-size: 12px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  border-bottom: 2px solid transparent;
}
.git-bottom-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
.git-bottom-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.git-bottom-content { flex: 1; min-height: 0; overflow: hidden; }
.git-changes {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  gap: 6px;
  overflow: hidden;
}
.git-changes-list { flex: 1; overflow-y: auto; }
.git-change-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
}
.git-change-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>