// 工作区文件树（2026-11-02，P2 办公工作台）
//
// 数据来自服务端已有的 /api/workspace/*（tree/create/rename/copy/delete），
// 不做端侧 fs 直连 —— Web 与桌面同一套行为，也复用服务端已有的路径口径。
// 模块级单例：文件树组件与工作台工具栏共享同一份展开态/选中项。
import { ref, computed } from 'vue';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settings';
import { officeSelectedFile } from '../../stores/officeWorkbench';

export interface WsEntry {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
}

export interface WsNode extends WsEntry {
  /** 绝对路径（前端拼 root + relPath，服务端按绝对路径操作） */
  path: string;
  depth: number;
}

export type OfficeDocKind = 'doc' | 'sheet' | 'slides';
export const OFFICE_EXT: Record<OfficeDocKind, string> = {
  doc: '.docx',
  sheet: '.xlsx',
  slides: '.pptx',
};

export interface WorkspaceSearchHit {
  file: string;
  relPath: string;
  line: number;
  column: number;
  preview: string;
}

export interface UploadOutcome {
  saved: Array<{ name: string; path: string; size: number }>;
  failed: Array<{ name: string; error: string }>;
  error?: string;
}

export interface SearchOutcome {
  hits: WorkspaceSearchHit[];
  truncated: boolean;
  scanned: number;
  error?: string;
}

const childrenByDir = ref<Record<string, WsEntry[]>>({});
const expanded = ref<Record<string, boolean>>({});

// 展开状态按工作区根记忆：回到工作台时目录树还是上次的样子
const EXPANDED_KEY = 'yz:office:tree:expanded';
function expandedKey(): string {
  return `${EXPANDED_KEY}:${rootDir.value}`;
}
function readExpanded(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(expandedKey()) || '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function persistExpanded(): void {
  try { localStorage.setItem(expandedKey(), JSON.stringify(expanded.value)); } catch { /* 隐私模式忽略 */ }
}
const loadingDirs = ref<Record<string, boolean>>({});
const loading = ref(false);
const error = ref('');
const selectedPath = ref('');

const rootDir = computed(() => (useSettingsStore().settings.workspaceDir || '').trim());

function trimSlash(p: string): string {
  return p.replace(/[\\/]+$/, '');
}

/**
 * root 内相对路径 → 绝对路径。
 * ★ 服务端 /workspace/tree 的非递归模式在 sub 为绝对路径时，返回的 relPath 也是绝对路径
 *   （childRel = sub + '/' + name），这里必须原样接收，否则会拼成 root/root/… 的双重路径。
 */
function absOf(relPath: string): string {
  const rel = (relPath || '').trim();
  if (!rel) return trimSlash(rootDir.value);
  if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) {
    return rel.replace(/\\/g, '/');
  }
  return `${trimSlash(rootDir.value)}/${rel.replace(/^[\\/]+/, '')}`;
}

/** 某节点的所在目录 */
export function dirOfNode(node: WsNode): string {
  return node.isDir ? node.path : node.path.replace(/[\\/][^\\/]+$/, '');
}

async function fetchDir(dirPath: string): Promise<WsEntry[] | null> {
  const root = rootDir.value;
  if (!root) return null;
  const q = new URLSearchParams({ dir: root, sub: dirPath, recursive: '0' });
  const r = await api.get<{ entries?: WsEntry[] }>(`/workspace/tree?${q.toString()}`);
  if (!('data' in r)) {
    error.value = r.error || '目录读取失败';
    return null;
  }
  return Array.isArray(r.data?.entries) ? r.data.entries : [];
}

async function loadDir(dirPath: string, force = false): Promise<void> {
  if (!dirPath) return;
  if (!force && childrenByDir.value[dirPath]) return;
  loadingDirs.value = { ...loadingDirs.value, [dirPath]: true };
  try {
    const entries = await fetchDir(dirPath);
    if (entries) childrenByDir.value = { ...childrenByDir.value, [dirPath]: entries };
  } finally {
    const next = { ...loadingDirs.value };
    delete next[dirPath];
    loadingDirs.value = next;
  }
}

/** 根目录列表（进入工作台 / 刷新时调用） */
async function loadRoot(force = false): Promise<void> {
  const root = rootDir.value;
  if (!root) {
    childrenByDir.value = {};
    error.value = '未设置工作目录';
    return;
  }
  loading.value = true;
  error.value = '';
  expanded.value = readExpanded();
  try {
    await loadDir(root, force);
  } finally {
    loading.value = false;
  }
}

async function toggleDir(node: WsNode): Promise<void> {
  if (!node.isDir) return;
  if (expanded.value[node.path]) {
    expanded.value = { ...expanded.value, [node.path]: false };
    persistExpanded();
    return;
  }
  await loadDir(node.path);
  expanded.value = { ...expanded.value, [node.path]: true };
  persistExpanded();
}

/** 展平可见节点（只展开 expanded 里的目录），供列表渲染 */
const flatNodes = computed<WsNode[]>(() => {
  const out: WsNode[] = [];
  const root = rootDir.value;
  if (!root) return out;
  const walk = (dirPath: string, depth: number) => {
    for (const e of childrenByDir.value[dirPath] || []) {
      const path = absOf(e.relPath);
      out.push({ ...e, path, depth });
      if (e.isDir && expanded.value[path]) walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return out;
});

/** 新建时应落在哪个目录：选中目录 → 其内；选中文件 → 同级；未选 → 根 */
function targetDir(): string {
  const node = flatNodes.value.find((n) => n.path === selectedPath.value);
  if (!node) return rootDir.value;
  return dirOfNode(node);
}

async function refresh(): Promise<void> {
  const openDirs = Object.keys(expanded.value).filter((p) => expanded.value[p]);
  await loadRoot(true);
  for (const d of openDirs) await loadDir(d, true);
}

function select(path: string): void {
  selectedPath.value = path;
  officeSelectedFile.value = path;
}

/**
 * 打开上次的文件：把祖先目录逐级展开并选中目标。
 * 用于回到工作台时恢复「上次看到哪」——目录没有展开时目标行不可见，直接 select 也能预览，
 * 但树上看不到高亮，体验割裂。
 */
async function revealPath(target: string): Promise<void> {
  const root = trimSlash(rootDir.value);
  if (!root || !target) return;
  const norm = target.replace(/\\/g, '/');
  if (!norm.toLowerCase().startsWith(root.toLowerCase())) { select(target); return; }
  const rel = norm.slice(root.length).replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean);
  parts.pop();
  const next = { ...expanded.value };
  let cur = root;
  for (const seg of parts) {
    cur = `${cur}/${seg}`;
    await loadDir(cur);
    next[cur] = true;
  }
  expanded.value = next;
  persistExpanded();
  select(target);
}

async function createDoc(kind: OfficeDocKind, name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const dir = targetDir();
  if (!dir) return { ok: false, error: '未设置工作目录' };
  const r = await api.post<{ path: string; name: string }>('/office/create', { dir, name, kind });
  if (!('data' in r)) return { ok: false, error: r.error || '创建失败' };
  await refresh();
  select(r.data.path);
  return { ok: true, path: r.data.path };
}

async function renameNode(node: WsNode, rawName: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const name = rawName.trim().replace(/[\\/:*?"<>|]/g, '');
  if (!name) return { ok: false, error: '名称不能为空' };
  const dir = dirOfNode(node);
  const lower = name.toLowerCase();
  const keepExt = node.isDir ? '' : (lower.includes('.') ? '' : (node.name.match(/\.[^.]+$/) || [''])[0]);
  const to = `${dir}/${name}${keepExt}`;
  const r = await api.post('/workspace/rename', { from: node.path, to });
  if (!('data' in r)) return { ok: false, error: r.error || '重命名失败' };
  await refresh();
  select(to);
  return { ok: true, path: to };
}

async function duplicateNode(node: WsNode): Promise<{ ok: boolean; error?: string }> {
  const dir = dirOfNode(node);
  const m = node.name.match(/^(.*?)(\.[^.]+)?$/);
  const base = m?.[1] || node.name;
  const ext = node.isDir ? '' : (m?.[2] || '');
  let n = 2;
  let to = `${dir}/${base} (${n})${ext}`;
  // 目标重名时递增；服务端也有 409 兜底
  while (flatNodes.value.some((x) => x.path === to) && n < 100) {
    n += 1;
    to = `${dir}/${base} (${n})${ext}`;
  }
  const r = await api.post('/workspace/copy', { from: node.path, to });
  if (!('data' in r)) return { ok: false, error: r.error || '复制失败' };
  await refresh();
  select(to);
  return { ok: true };
}

async function deleteNode(node: WsNode): Promise<{ ok: boolean; error?: string }> {
  const r = await api.post('/workspace/delete', { path: node.path });
  if (!('data' in r)) return { ok: false, error: r.error || '删除失败' };
  if (selectedPath.value === node.path) selectedPath.value = '';
  await refresh();
  return { ok: true };
}

// ===== 外部文件导入（拖入上传）=====
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 把浏览器 File 对象上传到工作区目录（服务端 /workspace/upload）。
 * 逐条读成 base64 后一次提交；服务端逐条落盘并回报失败原因，成功后刷新目录。
 */
async function uploadFiles(dir: string, files: File[]): Promise<UploadOutcome> {
  if (!dir || !files.length) return { saved: [], failed: [] };
  const payload: Array<{ name: string; base64: string }> = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const f of files) {
    try {
      payload.push({ name: f.name, base64: await fileToBase64(f) });
    } catch {
      failed.push({ name: f.name, error: '读取文件失败' });
    }
  }
  if (!payload.length) return { saved: [], failed };
  const r = await api.post<{ saved?: UploadOutcome['saved']; failed?: UploadOutcome['failed'] }>('/workspace/upload', { dir, files: payload });
  if (!('data' in r)) return { saved: [], failed, error: r.error || '上传失败' };
  const d = (r.data || {}) as { saved?: UploadOutcome['saved']; failed?: UploadOutcome['failed'] };
  await refresh();
  return { saved: d.saved || [], failed: [...failed, ...(d.failed || [])] };
}

// ===== 工作区搜索（文件名 / 内容）=====
async function searchWorkspace(q: string, opts: { include?: string; maxResults?: number } = {}): Promise<SearchOutcome> {
  const root = rootDir.value;
  const query = q.trim();
  if (!root || !query) return { hits: [], truncated: false, scanned: 0 };
  const params = new URLSearchParams({ dir: root, q: query });
  if (opts.include) params.set('include', opts.include);
  params.set('maxResults', String(opts.maxResults ?? 300));
  const r = await api.get<{ hits?: WorkspaceSearchHit[]; truncated?: boolean; scanned?: number }>(`/workspace/search?${params.toString()}`);
  if (!('data' in r)) return { hits: [], truncated: false, scanned: 0, error: r.error || '搜索失败' };
  const d = (r.data || {}) as { hits?: WorkspaceSearchHit[]; truncated?: boolean; scanned?: number };
  return { hits: d.hits || [], truncated: !!d.truncated, scanned: d.scanned || 0 };
}

// ===== 批量操作（前端循环 + 汇总，不新增批量后端接口）=====
export interface BatchMoveResult {
  moved: Array<{ name: string; from: string; to: string }>;
  failed: Array<{ name: string; error: string }>;
}
export interface BatchDeleteResult {
  deleted: number;
  failed: Array<{ name: string; error: string }>;
}

async function moveNodes(nodes: WsNode[], targetDirPath: string): Promise<BatchMoveResult> {
  const rootNorm = targetDirPath.replace(/[\\/]+$/, '');
  const moved: BatchMoveResult['moved'] = [];
  const failed: BatchMoveResult['failed'] = [];
  for (const node of nodes) {
    const nodeNorm = node.path.replace(/[\\/]+$/, '');
    if (node.isDir && (rootNorm === nodeNorm || rootNorm.startsWith(nodeNorm + '/'))) {
      failed.push({ name: node.name, error: '不能移动到自身或子目录' });
      continue;
    }
    const to = `${rootNorm}/${node.name}`;
    if (to === node.path) continue;
    const r = await api.post('/workspace/rename', { from: node.path, to });
    if (!('data' in r)) { failed.push({ name: node.name, error: r.error || '移动失败' }); continue; }
    moved.push({ name: node.name, from: node.path, to });
  }
  if (moved.length) await refresh();
  return { moved, failed };
}

async function deleteMany(nodes: WsNode[]): Promise<BatchDeleteResult> {
  const failed: BatchDeleteResult['failed'] = [];
  let deleted = 0;
  for (const node of nodes) {
    const r = await api.post('/workspace/delete', { path: node.path });
    if (!('data' in r)) { failed.push({ name: node.name, error: r.error || '删除失败' }); continue; }
    deleted += 1;
    if (selectedPath.value === node.path) selectedPath.value = '';
  }
  if (deleted) await refresh();
  return { deleted, failed };
}

export function useWorkspaceFiles() {
  return {
    rootDir,
    childrenByDir,
    loading,
    error,
    selectedPath,
    flatNodes,
    expanded,
    loadingDirs,
    loadRoot,
    loadDir,
    toggleDir,
    refresh,
    select,
    revealPath,
    createDoc,
    renameNode,
    duplicateNode,
    deleteNode,
    moveNodes,
    deleteMany,
    uploadFiles,
    searchWorkspace,
    targetDir,
  };
}
