// 代码模式工作台状态：打开的文件、项目目录、断点、运行配置。
// 与聊天 store 解耦 —— 代码模式是独立页面，但右侧对话区仍复用 chat store。
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';
import { useSettingsStore } from './settings';

export type SidebarView = 'explorer' | 'search' | 'git' | 'run' | 'plugins';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  /** 磁盘上的原文，用于脏标记比对 */
  original: string;
  loading: boolean;
  error: string;
  saving: boolean;
  /** 打开后是否从未激活过（用于「预览态」斜体标签，暂未启用） */
  mtime: number;
}

export interface RunConfigItem {
  id: string;
  name: string;
  kind: 'java' | 'maven' | 'python' | 'node' | 'custom';
  cwd: string;
  mainClass?: string;
  classpath?: string;
  goal?: string;
  program?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** 模型文件修改快照条目（/workspace/changes 返回，按路径合并后的最新一条） */
export interface AiFileChangeItem {
  id: string;
  path: string;
  tool: string;
  createdAt: number;
  count: number;
}

const LS_DIR = 'yz:code:projectDir';
const LS_FILES = 'yz:code:openFiles';
const LS_CFG = 'yz:code:runConfigs';
const LS_BP = 'yz:code:breakpoints';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ===== 代码模式记忆（纯 localStorage，供 router guard 使用，不依赖 pinia）=====
// 语义：用户停留在代码模式时离开（去首页/浏览器等），再点「任务」应恢复代码工作台，
// 而不是掉回普通聊天布局。只有显式点代码模式里的「返回任务」才清除。
const CODE_MODE_KEY = 'yz:code:active';

export function isCodeModeActive(): boolean {
  try { return localStorage.getItem(CODE_MODE_KEY) === '1'; } catch { return false; }
}

export function setCodeModeActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(CODE_MODE_KEY, '1');
    else localStorage.removeItem(CODE_MODE_KEY);
  } catch { /* 隐私模式等场景忽略 */ }
  codeModeActiveRef.value = active;
}

/** 响应式代码模式标记（供组件 v-if 判断，进入/退出代码模式时即时更新） */
const codeModeActiveRef = ref(isCodeModeActive());

export const useCodeStore = defineStore('code', () => {
  const settingsStore = useSettingsStore();

  // ===== 项目目录 =====
  const projectDir = ref(localStorage.getItem(LS_DIR) || '');
  function setProjectDir(dir: string) {
    projectDir.value = dir;
    localStorage.setItem(LS_DIR, dir);
    // 同步到全局工作目录，保证 cmd_exec / Git 面板 / 智能体工具指向同一个根
    if (dir && settingsStore.settings.workspaceDir !== dir) {
      void settingsStore.update({ workspaceDir: dir });
      void api.post('/workspace/dir', { dir });
    }
  }
  // 首次进入时若未选过目录，沿用设置里的工作目录
  if (!projectDir.value && settingsStore.settings.workspaceDir) {
    projectDir.value = settingsStore.settings.workspaceDir;
  }

  const projectName = computed(() => {
    const p = projectDir.value.replace(/[\\/]+$/, '');
    return p.split(/[\\/]/).filter(Boolean).pop() || '';
  });

  // ===== 项目目录关联的 spaceId（用于代码模式会话分组）=====
  const projectSpaceId = ref<string | null>(null);
  function setProjectSpaceId(id: string | null) {
    projectSpaceId.value = id;
  }

  // ===== 打开的文件 =====
  const openFiles = ref<OpenFile[]>([]);
  const activePath = ref<string | null>(null);

  const activeFile = computed(() => openFiles.value.find((f) => f.path === activePath.value) || null);
  const dirtyCount = computed(() => openFiles.value.filter((f) => f.content !== f.original).length);

  function persistFiles() {
    try {
      localStorage.setItem(LS_FILES, JSON.stringify(openFiles.value.map((f) => ({ path: f.path, name: f.name }))));
    } catch { /* 忽略配额错误 */ }
  }

  /** 把「路径/文件名」恢复到标签栏（内容留空，点开才读盘，避免启动时大量 IO） */
  function rememberTabs() {
    const saved = readJson<Array<{ path: string; name: string }>>(LS_FILES, []);
    openFiles.value = saved
      .filter((f) => f?.path)
      .map((f) => ({ path: f.path, name: f.name, content: '', original: '', loading: false, error: '', saving: false, mtime: 0 }));
    if (openFiles.value.length) {
      activePath.value = openFiles.value[0].path;
      void loadContent(openFiles.value[0].path);
    }
  }

  async function openFile(path: string, name?: string) {
    if (!path) return;
    const exist = openFiles.value.find((f) => f.path === path);
    if (exist) {
      activePath.value = path;
      if (!exist.content && !exist.error) await loadContent(path);
      return;
    }
    const file: OpenFile = {
      path,
      name: name || path.split(/[\\/]/).pop() || path,
      content: '',
      original: '',
      loading: true,
      error: '',
      saving: false,
      mtime: 0,
    };
    openFiles.value.push(file);
    activePath.value = path;
    persistFiles();
    await loadContent(path);
  }

  async function loadContent(path: string) {
    const f = openFiles.value.find((x) => x.path === path);
    if (!f) return;
    f.loading = true;
    f.error = '';
    const r = await api.get<{ content: string; name: string; mtime: number }>(
      `/workspace/file?path=${encodeURIComponent(path)}`,
    );
    f.loading = false;
    if ('error' in r) {
      f.error = r.error;
      return;
    }
    f.content = r.data.content ?? '';
    f.original = f.content;
    f.name = r.data.name || f.name;
    f.mtime = r.data.mtime || 0;
  }

  function updateContent(path: string, content: string) {
    const f = openFiles.value.find((x) => x.path === path);
    if (f) f.content = content;
  }

  async function saveFile(path: string): Promise<boolean> {
    const f = openFiles.value.find((x) => x.path === path);
    if (!f) return false;
    f.saving = true;
    const r = await api.put<{ ok: boolean; mtime: number }>('/workspace/file', { path, content: f.content });
    f.saving = false;
    if ('error' in r) {
      f.error = r.error;
      return false;
    }
    f.original = f.content;
    f.mtime = r.data.mtime || Date.now();
    f.error = '';
    return true;
  }

  function closeFile(path: string) {
    const idx = openFiles.value.findIndex((f) => f.path === path);
    if (idx < 0) return;
    openFiles.value.splice(idx, 1);
    if (activePath.value === path) {
      activePath.value = (openFiles.value[idx] || openFiles.value[idx - 1] || null)?.path ?? null;
    }
    persistFiles();
  }

  function closeOthers(path: string) {
    openFiles.value = openFiles.value.filter((f) => f.path === path);
    activePath.value = path;
    persistFiles();
  }

  function closeAll() {
    openFiles.value = [];
    activePath.value = null;
    persistFiles();
  }

  // ===== 左栏视图 =====
  const sidebarView = ref<SidebarView>('explorer');

  /** 展开侧栏并切到 Git 视图（顶栏 Git 按钮 / Commit 按钮调用） */
  function openGitPanel() {
    sidebarView.value = 'git';
  }

  // ===== 断点（path → 行号） =====
  const breakpoints = ref<Record<string, number[]>>(readJson<Record<string, number[]>>(LS_BP, {}));
  watch(breakpoints, (v) => {
    try { localStorage.setItem(LS_BP, JSON.stringify(v)); } catch { /* ignore */ }
  }, { deep: true });

  function toggleBreakpoint(path: string, line: number) {
    const list = breakpoints.value[path] ? [...breakpoints.value[path]] : [];
    const i = list.indexOf(line);
    if (i >= 0) list.splice(i, 1);
    else list.push(line);
    if (list.length) breakpoints.value[path] = list.sort((a, b) => a - b);
    else delete breakpoints.value[path];
    breakpoints.value = { ...breakpoints.value };
  }

  function clearBreakpoints(path?: string) {
    if (path) delete breakpoints.value[path];
    else breakpoints.value = {};
    breakpoints.value = { ...breakpoints.value };
  }

  // ===== 运行配置 =====
  const runConfigs = ref<RunConfigItem[]>(readJson<RunConfigItem[]>(LS_CFG, []));
  const activeConfigId = ref<string>('');
  watch(runConfigs, (v) => {
    try { localStorage.setItem(LS_CFG, JSON.stringify(v)); } catch { /* ignore */ }
  }, { deep: true });

  function saveRunConfig(cfg: RunConfigItem) {
    const i = runConfigs.value.findIndex((c) => c.id === cfg.id);
    if (i >= 0) runConfigs.value[i] = { ...cfg };
    else runConfigs.value.push({ ...cfg });
    runConfigs.value = [...runConfigs.value];
  }

  function removeRunConfig(id: string) {
    runConfigs.value = runConfigs.value.filter((c) => c.id !== id);
    if (activeConfigId.value === id) activeConfigId.value = '';
  }

  // ===== 跳转请求（搜索结果 / 调试断点命中 → 编辑器滚动到指定行） =====
  const pendingReveal = ref<{ path: string; line: number; column?: number; ts: number } | null>(null);
  function revealLine(path: string, line: number, column?: number) {
    pendingReveal.value = { path, line, column, ts: Date.now() };
  }

  // ===== 调试命中行（编辑器高亮） =====
  const debugActive = ref<{ path: string; line: number } | null>(null);
  function setDebugActive(path: string, line: number) {
    debugActive.value = line > 0 && path ? { path, line } : null;
  }

  // ===== 控制台 =====
  const consoleOpen = ref(localStorage.getItem('yz:code:consoleOpen') !== '0');
  function toggleConsole(open?: boolean) {
    consoleOpen.value = open === undefined ? !consoleOpen.value : open;
    localStorage.setItem('yz:code:consoleOpen', consoleOpen.value ? '1' : '0');
  }

  // ===== 编辑器光标位置（状态栏 Ln/Col 显示）=====
  const editorCursor = ref<{ line: number; col: number }>({ line: 1, col: 1 });
  function setEditorCursor(line: number, col: number) {
    editorCursor.value = { line, col };
  }

  // ===== 资源管理器动作信号（命令面板触发；资源管理器 watch 后执行）=====
  const explorerCommand = ref<{ kind: 'collapse-all' | 'refresh'; ts: number } | null>(null);
  function runExplorerCommand(kind: 'collapse-all' | 'refresh') {
    explorerCommand.value = { kind, ts: Date.now() };
  }

  // ===== 模型文件修改快照（Diff 对比 / 应用 / 回退）=====
  const aiChanges = ref<AiFileChangeItem[]>([]);
  async function fetchAiChanges() {
    const dir = projectDir.value;
    if (!dir) { aiChanges.value = []; return; }
    const r = await api.get<{ items: AiFileChangeItem[] }>(
      `/workspace/changes?dir=${encodeURIComponent(dir)}`,
    );
    if ('error' in r) { aiChanges.value = []; return; }
    aiChanges.value = r.data.items || [];
  }
  const aiChangeByPath = (path: string) =>
    aiChanges.value.find((c) => c.path.replace(/[\\/]+/g, '/') === path.replace(/[\\/]+/g, '/'));

  // ===== 冲突解决信号（git 面板点击冲突文件 → 编辑区打开冲突解决器）=====
  const pendingConflict = ref<{ path: string; ts: number } | null>(null);
  function openConflict(path: string) {
    pendingConflict.value = { path, ts: Date.now() };
  }

  // 项目目录变化 / 首次进入时拉取模型修改快照
  watch(projectDir, () => { void fetchAiChanges(); });
  if (projectDir.value) void fetchAiChanges();

  return {
    projectDir, projectName, setProjectDir,
    projectSpaceId, setProjectSpaceId,
    codeModeActive: codeModeActiveRef,
    openFiles, activePath, activeFile, dirtyCount,
    openFile, loadContent, updateContent, saveFile, closeFile, closeOthers, closeAll, rememberTabs,
    sidebarView, openGitPanel,
    breakpoints, toggleBreakpoint, clearBreakpoints,
    runConfigs, activeConfigId, saveRunConfig, removeRunConfig,
    pendingReveal, revealLine,
    debugActive, setDebugActive,
    consoleOpen, toggleConsole,
    editorCursor, setEditorCursor,
    explorerCommand, runExplorerCommand,
    aiChanges, fetchAiChanges, aiChangeByPath,
    pendingConflict, openConflict,
  };
});
