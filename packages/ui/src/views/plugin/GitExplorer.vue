<template>
  <div class="git-explorer">
    <div v-if="supported === null" class="git-empty">检测 Git 能力中…</div>
    <div v-else-if="supported === false" class="git-empty">
      当前平台不支持本地 Git，请在桌面端使用
    </div>
    <template v-else>
      <div class="git-toolbar">
        <el-input
          v-model="repo"
          placeholder="仓库路径（绝对路径）"
          size="small"
          style="width: 360px"
          @change="loadAll"
        />
        <el-select
          v-model="currentBranch"
          size="small"
          style="width: 160px"
          placeholder="分支"
          @change="onCheckout"
        >
          <el-option v-for="b in gitStore.branches" :key="b" :label="b" :value="b" />
        </el-select>
        <el-button size="small" @click="doPull">拉取</el-button>
        <el-button size="small" @click="doPush">推送</el-button>
        <el-button size="small" @click="loadAll">刷新</el-button>
      </div>
      <div class="git-body">
        <div class="git-left">
          <div class="git-section-title">文件</div>
          <div
            v-for="f in gitStore.fileTree"
            :key="f.path"
            class="git-file"
            :class="{ dir: f.type === 'dir' }"
            @click="f.type === 'dir' ? expand(f) : preview(f)"
          >
            <span class="git-status-badge" :class="f.gitStatus">
              {{ f.gitStatus ? String(f.gitStatus)[0].toUpperCase() : '' }}
            </span>
            <span>{{ f.name }}</span>
          </div>
        </div>
        <div class="git-center">
          <div class="git-section-title">
            <span>{{ previewPath || '预览' }}</span>
            <el-button-group v-if="previewPath && canDiff" size="small" class="git-view-toggle">
              <el-button :type="viewMode === 'preview' ? 'primary' : ''" @click="viewMode = 'preview'">内容</el-button>
              <el-button :type="viewMode === 'diff' ? 'primary' : ''" @click="viewMode = 'diff'">Diff</el-button>
            </el-button-group>
          </div>
          <div class="git-editor-wrap">
            <DiffEditor
              v-if="previewPath && viewMode === 'diff'"
              :original="originalContent"
              :modified="previewContent"
              :language="previewLanguage"
            />
            <CodeEditor
              v-else-if="previewPath"
              :model-value="previewContent"
              :read-only="true"
              :language="previewLanguage"
            />
            <div v-else class="git-preview-empty">选择文件以预览</div>
          </div>
        </div>
        <div class="git-right">
          <div class="git-section-title">变更 ({{ changedFiles.length }})</div>
          <div v-for="f in changedFiles" :key="f.path" class="git-changed">
            <el-checkbox v-model="staged[f.path]" />
            <span :class="f.status">{{ f.path }} ({{ f.status }})</span>
          </div>
          <el-input
            v-model="commitMsg"
            type="textarea"
            :rows="2"
            placeholder="提交信息"
            size="small"
            style="margin-top: 8px"
          />
          <el-button size="small" type="primary" style="margin-top: 6px" @click="doCommit">
            提交
          </el-button>
          <div class="git-section-title" style="margin-top: 14px">历史</div>
          <div v-for="l in logEntries" :key="l.hash" class="git-log">
            {{ String(l.hash).slice(0, 7) }} {{ l.message }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGitStore } from '../../stores/git';
import CodeEditor from '../../components/CodeEditor.vue';
import DiffEditor from '../../components/DiffEditor.vue';

const route = useRoute();
const gitStore = useGitStore();
const supported = ref<boolean | null>(null);
const repo = ref('');
const currentBranch = ref('');
const previewPath = ref('');
const previewContent = ref('');
const originalContent = ref('');
const previewLanguage = ref<'javascript' | 'json' | 'markdown' | null>(null);
const viewMode = ref<'preview' | 'diff'>('preview');
const commitMsg = ref('');
const staged = ref<Record<string, boolean>>({});

/** 当前预览文件是否有 git 变更（可 diff） */
const canDiff = computed(() => {
  if (!previewPath.value) return false;
  const node = gitStore.fileTree.find((f) => f.path === previewPath.value);
  return !!node?.gitStatus && node.gitStatus !== 'untracked';
});

function detectLanguage(filePath: string): 'javascript' | 'json' | 'markdown' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'json') return 'json';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  return null;
}

const changedFiles = computed(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  if (!st?.files) return [];
  return st.files.map((f) => ({
    path: f.path,
    status: (f.working_dir !== ' ' ? f.working_dir : f.index) || '?',
  }));
});
const logEntries = computed(() => {
  const l = gitStore.log as { all?: Array<{ hash: string; message: string }> } | null;
  return l?.all || [];
});

async function loadAll() {
  if (!repo.value) return;
  await Promise.all([
    gitStore.fetchStatus(repo.value),
    gitStore.fetchFileTree(repo.value),
    gitStore.fetchBranches(repo.value),
    gitStore.fetchLog(repo.value),
  ]);
  const st = gitStore.status as { current?: string } | null;
  currentBranch.value = st?.current || '';
}

async function preview(f: { path: string }) {
  previewPath.value = f.path;
  previewLanguage.value = detectLanguage(f.path);
  previewContent.value = await gitStore.readFile(repo.value, f.path);
  const node = gitStore.fileTree.find((x) => x.path === f.path);
  if (node?.gitStatus && node.gitStatus !== 'untracked') {
    originalContent.value = await gitStore.show(repo.value, f.path);
    viewMode.value = 'diff';
  } else {
    originalContent.value = '';
    viewMode.value = 'preview';
  }
}

async function expand(f: { path: string }) {
  await gitStore.fetchFileTree(repo.value, f.path);
}

async function onCheckout() {
  await gitStore.checkout(repo.value, currentBranch.value);
  await loadAll();
}

async function doCommit() {
  const files = Object.keys(staged.value).filter((k) => staged.value[k]);
  await gitStore.commit(repo.value, commitMsg.value, files.length ? files : undefined);
  commitMsg.value = '';
  staged.value = {};
  await loadAll();
}

async function doPull() {
  await gitStore.pull(repo.value, currentBranch.value);
  await loadAll();
}

async function doPush() {
  await gitStore.push(repo.value, currentBranch.value);
  await loadAll();
}

onMounted(async () => {
  await gitStore.checkCapability();
  supported.value = gitStore.supported;
  const q = route.query.repo as string | undefined;
  if (q) {
    repo.value = q;
    await loadAll();
  }
});
</script>

<style scoped>
.git-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 8px;
}
.git-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.git-body {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}
.git-left,
.git-center,
.git-right {
  flex: 1;
  border: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
}
.git-center {
  display: flex;
  flex-direction: column;
}
.git-editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.git-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.git-section-title {
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.git-view-toggle {
  margin-left: auto;
}
.git-file {
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.git-file:hover {
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05));
}
.git-file.dir {
  font-weight: 600;
}
.git-status-badge {
  display: inline-block;
  width: 18px;
  color: #f59e0b;
  font-size: 11px;
  font-weight: 700;
}
.git-status-badge.modified {
  color: #f59e0b;
}
.git-status-badge.untracked {
  color: #94a3b8;
}
.git-status-badge.added {
  color: #10b981;
}
.git-preview {
  white-space: pre-wrap;
  font-size: 12px;
  margin: 0;
  font-family: ui-monospace, monospace;
}
.git-changed {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}
.git-log {
  font-size: 11px;
  padding: 2px 0;
  color: var(--el-text-color-regular);
}
.git-empty {
  padding: 32px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
@media (max-width: 767px) {
  .git-toolbar {
    flex-wrap: wrap;
  }
  .git-body {
    flex-direction: column;
  }
  .git-left,
  .git-center,
  .git-right {
    flex: none;
    max-height: 240px;
  }
}
</style>
