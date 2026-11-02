// 工作区文件树（2026-11-02，P2 办公工作台）
//
// 数据来自服务端已有的 /api/workspace/*（tree/create/rename/copy/delete），
// 不做端侧 fs 直连 —— Web 与桌面同一套行为，也复用服务端已有的路径口径。
// 模块级单例：文件树组件与工作台工具栏共享同一份展开态/选中项。
import { ref, computed } from 'vue';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settings';

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

const childrenByDir = ref<Record<string, WsEntry[]>>({});
const expanded = ref<Record<string, boolean>>({});
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
    return;
  }
  await loadDir(node.path);
  expanded.value = { ...expanded.value, [node.path]: true };
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

async function renameNode(node: WsNode, rawName: string): Promise<{ ok: boolean; error?: string }> {
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
  return { ok: true };
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
    createDoc,
    renameNode,
    duplicateNode,
    deleteNode,
    targetDir,
  };
}
