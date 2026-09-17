<template>
  <div class="csb">
    <!-- ===== 最左侧竖条：两种形态统一（用户拍板 2026-09-16：AI 模式也要有全部菜单）=====
         任务 + 资源管理器 + 搜索 + Git + 运行 + 控制台 + 插件 + 开发环境 -->
    <div class="csb-bar">
      <el-tooltip content="任务" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'task' }" @click="leadTab = 'task'">
          <el-icon :size="17"><ChatDotRound /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="资源管理器" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'file' && view === 'explorer' }" @click="openFileView('explorer')">
          <el-icon :size="17"><Files /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="搜索（文件内容）" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'file' && view === 'search' }" @click="openFileView('search')">
          <el-icon :size="17"><Search /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="源代码管理" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'file' && view === 'git' }" @click="openFileView('git')">
          <el-icon :size="17"><Share /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="运行与调试" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'file' && view === 'run' }" @click="openFileView('run')">
          <el-icon :size="17"><Aim /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="控制台" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: code.consoleOpen }" @click="code.toggleConsole()">
          <el-icon :size="17"><Monitor /></el-icon>
        </button>
      </el-tooltip>

      <!-- 插件入口（代码类型插件列表） -->
      <el-tooltip content="插件" placement="right" :show-after="300">
        <button class="csb-act" :class="{ on: leadTab === 'file' && view === 'plugins' }" @click="openFileView('plugins')">
          <el-icon :size="17"><Box /></el-icon>
        </button>
      </el-tooltip>

      <div class="csb-bar-spacer"></div>

      <el-tooltip content="开发环境（Java / Maven / Python）" placement="right" :show-after="300">
        <button class="csb-act" @click="openEnv">
          <el-icon :size="17"><Setting /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- ===== 内容列：单面板，由竖条切换 ===== -->
    <div class="csb-col">
      <div class="csb-panel">
        <TaskListSection v-show="leadTab === 'task'" :space-id="code.projectSpaceId" />
        <ExplorerPanel v-show="leadTab === 'file' && view === 'explorer'" @pick-dir="emit('pick-dir')" @scope-search="onScopeSearch" />
        <FileSearchPanel
          v-show="leadTab === 'file' && view === 'search'"
          ref="fileSearchRef"
          mode="code"
          :dir="code.projectDir"
          v-model:scope="searchScope"
        />
        <div v-show="leadTab === 'file' && view === 'git'" class="csb-git">
          <ChatGitPanel ref="gitPanelRef" :repo="code.projectDir" @viewDiff="onViewDiff" />
        </div>
        <RunDebugPanel v-show="leadTab === 'file' && view === 'run'" />

        <!-- 插件列表面板 -->
        <div v-show="leadTab === 'file' && view === 'plugins'" class="csb-plugin-list">
          <div class="plugin-list-header">插件</div>
          <div class="plugin-list-body">
            <div
              v-for="p in codePlugins"
              :key="p.id"
              class="plugin-card"
              @click="openPluginDialog(p)"
            >
              <div class="plugin-card-icon">{{ p.label.charAt(0) }}</div>
              <div class="plugin-card-info">
                <div class="plugin-card-name">{{ p.label }}</div>
                <div class="plugin-card-desc">{{ p.desc || p.route }}</div>
              </div>
            </div>
            <div v-if="!codePlugins.length" class="plugin-list-empty">
              暂无代码插件
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 插件弹窗 -->
    <el-dialog
      v-model="pluginDialogVisible"
      :title="pluginDialogTitle"
      width="85%"
      top="5vh"
      class="plugin-dialog"
      destroy-on-close
    >
      <div class="plugin-dialog-body">
        <CicdConsole v-if="activePluginId === 'cicd-pipeline'" />
        <JavaSuite v-if="activePluginId === 'java-suite'" />
      </div>
    </el-dialog>

    <!-- git 差异对比弹窗（点变更文件 / 打开差异按钮） -->
    <el-dialog
      v-model="diffDialog.open"
      :title="'差异对比 · ' + diffDialog.file"
      width="82%"
      top="4vh"
      class="csb-diff-dialog"
      destroy-on-close
    >
      <div v-loading="diffDialog.loading" class="csb-diff-body">
        <GitDiffViewer v-if="!diffDialog.loading" :diff-text="diffDialog.text" :file-name="diffDialog.file" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Files, Search, Share, Aim, Setting, Monitor, Box, ChatDotRound } from '@element-plus/icons-vue';
import { useCodeStore, type SidebarView } from '../../stores/code';
import { usePluginStore } from '../../stores/plugin';
import { useGitStore } from '../../stores/git';
import { openSettingsDrawer } from '../../composables/useSettingsDrawer';
import ExplorerPanel from './panels/ExplorerPanel.vue';
import FileSearchPanel from './panels/FileSearchPanel.vue';
import RunDebugPanel from './panels/RunDebugPanel.vue';
import ChatGitPanel from '../chat/ChatGitPanel.vue';
import GitDiffViewer from '../chat/GitDiffViewer.vue';
import CicdConsole from '../../views/plugin/CicdConsole.vue';
import JavaSuite from '../../views/plugin/JavaSuite.vue';
import TaskListSection from '../workbench/TaskListSection.vue';

const emit = defineEmits<{ 'pick-dir': [] }>();

const code = useCodeStore();
const pluginStore = usePluginStore();

/**
 * 左栏选中项：task = 任务列表；file = 文件类面板（由 view 决定具体哪个）。
 * 两种形态统一走这一条竖条（用户拍板 2026-09-16）。
 */
const leadTab = ref<'task' | 'file'>('file');

/** 点文件类图标：切到文件面板并定位到对应视图 */
function openFileView(v: SidebarView) {
  leadTab.value = 'file';
  view.value = v;
}

const view = computed<SidebarView>({
  get: () => code.sidebarView,
  set: (v) => { code.sidebarView = v; },
});

/** 搜索范围（资源管理器右击「在此文件夹中搜索」设置，联动搜索面板） */
const searchScope = ref<{ rel: string; label: string } | null>(null);
const fileSearchRef = ref<InstanceType<typeof FileSearchPanel> | null>(null);

/** 代码类型插件（kind='code'）：从已启用插件中过滤，取首个路由作为入口 */
const codePlugins = computed(() =>
  pluginStore.enabledPlugins
    .filter((p) => p.manifest.kind === 'code')
    .map((p) => ({
      id: p.manifest.id,
      label: p.manifest.name,
      route: p.manifest.contributes?.routes?.[0]?.path || '',
      desc: p.manifest.description,
    })),
);

/** 插件弹窗 */
const pluginDialogVisible = ref(false);
const pluginDialogTitle = ref('');
const activePluginId = ref('');
function openPluginDialog(p: { id: string; label: string }) {
  activePluginId.value = p.id;
  pluginDialogTitle.value = p.label;
  pluginDialogVisible.value = true;
}

function onScopeSearch(scope: { rel: string; label: string }) {
  searchScope.value = scope;
  view.value = 'search';
  void nextTick(() => fileSearchRef.value?.focusQuery());
}

function openEnv() {
  void openSettingsDrawer('env');
}

// ===== git 差异弹窗（用户拍板：点变更文件开 diff 对比，全屏弹窗即可，不必进编辑器）=====
const gitStore = useGitStore();
/**
 * git 面板引用：用于在「切到源码管理视图」时确保数据已加载。
 * 面板自身也会在挂载/工作目录变化时初始化，这里只做兜底刷新，
 * 避免用户在别处做了 git 操作（如顶部提交）后切回来看到旧数据。
 */
const gitPanelRef = ref<InstanceType<typeof ChatGitPanel> | null>(null);
const diffDialog = ref<{ open: boolean; loading: boolean; text: string; file: string }>({
  open: false, loading: false, text: '', file: '',
});

// 切到源码管理视图 → 刷新一次，保证与顶部状态栏（每次直接请求 /git/status）同源
watch([view, leadTab], ([v, t]) => {
  if (v === 'git' && t === 'file') {
    void nextTick(() => gitPanelRef.value?.refresh?.());
  }
});

async function onViewDiff(payload: { path: string; staged: boolean; repoPath?: string }) {
  const repo = payload.repoPath || code.projectDir || '';
  if (!repo) { ElMessage.warning('未选择项目目录，无法查看差异'); return; }
  diffDialog.value = { open: true, loading: true, text: '', file: payload.path };
  try {
    const text = await gitStore.diff(repo, { file: payload.path, staged: payload.staged });
    diffDialog.value.text = text || '// 无差异';
  } catch {
    diffDialog.value.text = '// 加载差异失败';
  } finally {
    diffDialog.value.loading = false;
  }
}

onMounted(() => {
  if (!pluginStore.loaded) pluginStore.refresh();
});
</script>

<style scoped>
.csb { display: flex; height: 100%; min-height: 0; overflow: hidden; }

/* 内容列：竖条右侧的单面板 */
.csb-col { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
/* ===== 以下样式恢复自原文件（竖条/面板/插件列表）===== */
.csb-bar {
  flex: 0 0 42px; width: 42px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px 0;
  background: var(--glass-bg-hover, #f1efe9);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border-right: 1px solid var(--glass-border, #e7e4dc);
}
.csb-bar-spacer { flex: 1; }

.csb-act {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 8px; background: transparent;
  color: var(--color-text-secondary, #6b6b66); cursor: pointer;
  transition: all 0.15s ease; position: relative;
}
.csb-act:hover { background: var(--glass-bg-hover, #eeebe3); color: var(--color-text, #1a1a1a); }
.csb-act.on { color: var(--color-primary, #c2410c); background: color-mix(in srgb, var(--color-primary, #c2410c) 12%, transparent); }
.csb-act.on::before {
  content: ''; position: absolute; left: -8px; top: 22%; height: 56%; width: 2px;
  background: var(--color-primary, #c2410c); border-radius: 0 2px 2px 0;
}

.csb-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.csb-panel > * { flex: 1; min-height: 0; }
.csb-git { display: flex; flex-direction: column; overflow: hidden; }

/* 插件列表面板 */
.csb-plugin-list { display: flex; flex-direction: column; overflow: hidden; }
.plugin-list-header {
  padding: 10px 14px; font-size: 13px; font-weight: 600;
  color: var(--color-text-secondary, #6b6b66);
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
}
.plugin-list-body { flex: 1; overflow-y: auto; padding: 8px; }
.plugin-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
}
.plugin-card:hover { background: var(--glass-bg-hover, #eeebe3); }
.plugin-card-icon {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600;
  background: color-mix(in srgb, var(--color-primary, #c2410c) 15%, transparent);
  color: var(--color-primary, #c2410c);
}
.plugin-card-info { flex: 1; min-width: 0; }
.plugin-card-name { font-size: 14px; font-weight: 500; }
.plugin-card-desc { font-size: 12px; color: var(--color-text-secondary, #999); margin-top: 2px; }
.plugin-list-empty { padding: 20px; text-align: center; color: var(--color-text-secondary, #999); font-size: 13px; }

/* 插件弹窗 */
.plugin-dialog-body { height: 75vh; overflow: auto; }

/* git 差异对比弹窗 */
.csb-diff-body { min-height: 300px; max-height: 78vh; overflow: auto; }
</style>

<style>
/* 弹窗全局样式（非 scoped，el-dialog 渲染在 body 上） */
.plugin-dialog .el-dialog__body { padding: 0; }
</style>