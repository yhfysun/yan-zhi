/**
 * 浏览器收藏夹数据模型（树形：文件夹 + 网址）。
 *
 * 存储仍用 localStorage['browser_bookmarks']，兼容两种格式：
 *   - 旧：扁平数组 [{ url, title }]
 *   - 新：{ version: 2, nodes: BookmarkNode[] }
 * 读取统一走 parseStoredBookmarks：localStorage 里的脏数据曾把界面直接打白屏，
 * 所以每个字段都做防御式校验，非法节点丢弃而不是抛错。
 */

export const BOOKMARKS_STORAGE_KEY = 'browser_bookmarks';
export const BOOKMARKS_BAR_STORAGE_KEY = 'browser_bookmarks_bar';

export type BookmarkNodeType = 'url' | 'folder';

export interface BookmarkNode {
  id: string;
  type: BookmarkNodeType;
  title: string;
  url?: string;
  children?: BookmarkNode[];
  createdAt: number;
}

export interface FolderOption {
  id: string;
  title: string;
  depth: number;
  path: string;
}

/** Chrome 书签文件解析后的中间结构（主进程只做字段归一，不生成 id） */
export interface ImportedNode {
  title?: string;
  url?: string;
  children?: ImportedNode[];
  /** Chrome 根节点标识：bookmark_bar / other / synced */
  key?: string;
}

const MAX_DEPTH = 12;

function nextId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'bm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

export function hostOfUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function defaultTitleForUrl(url: string): string {
  const host = hostOfUrl(url);
  return host || url;
}

/** 判重用的 key：host 大小写不敏感，路径去掉尾部斜杠，查询串保留 */
export function bookmarkKey(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function makeUrlNode(url: string, title?: string, now = Date.now()): BookmarkNode {
  return {
    id: nextId(),
    type: 'url',
    title: (title || '').trim() || defaultTitleForUrl(url),
    url: url.trim(),
    createdAt: now,
  };
}

export function makeFolderNode(title: string, now = Date.now()): BookmarkNode {
  return {
    id: nextId(),
    type: 'folder',
    title: (title || '').trim() || '新建文件夹',
    children: [],
    createdAt: now,
  };
}

function sanitizeNode(input: any, depth: number, now: number): BookmarkNode | null {
  if (!input || typeof input !== 'object' || depth > MAX_DEPTH) return null;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const isFolder = input.type === 'folder' || Array.isArray(input.children);
  if (isFolder) {
    const children = sanitizeList(input.children, depth + 1, now);
    return {
      id: typeof input.id === 'string' && input.id ? input.id : nextId(),
      type: 'folder',
      title: title || '新建文件夹',
      children,
      createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    };
  }
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!isHttpUrl(url)) return null;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : nextId(),
    type: 'url',
    title: title || defaultTitleForUrl(url),
    url,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
  };
}

function sanitizeList(input: any, depth: number, now: number): BookmarkNode[] {
  if (!Array.isArray(input)) return [];
  const out: BookmarkNode[] = [];
  for (const item of input) {
    const node = sanitizeNode(item, depth, now);
    if (node) out.push(node);
  }
  return out;
}

export function parseStoredBookmarks(raw: string | null | undefined, now = Date.now()): BookmarkNode[] {
  if (!raw) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  // 旧版扁平数组：[{ url, title }]
  if (Array.isArray(parsed)) {
    return sanitizeList(parsed.map((it) => ({ ...it, type: 'url' })), 0, now);
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
    return sanitizeList(parsed.nodes, 0, now);
  }
  return [];
}

export function serializeBookmarks(nodes: BookmarkNode[]): string {
  return JSON.stringify({ version: 2, nodes });
}

function mapTree(nodes: BookmarkNode[], fn: (node: BookmarkNode) => BookmarkNode): BookmarkNode[] {
  return nodes.map((node) => {
    const mapped = fn(node);
    if (mapped.type === 'folder') {
      return { ...mapped, children: mapTree(mapped.children || [], fn) };
    }
    return mapped;
  });
}

export function flattenUrls(nodes: BookmarkNode[]): BookmarkNode[] {
  const out: BookmarkNode[] = [];
  const walk = (list: BookmarkNode[]) => {
    for (const n of list) {
      if (n.type === 'folder') walk(n.children || []);
      else out.push(n);
    }
  };
  walk(nodes);
  return out;
}

export function countUrls(nodes: BookmarkNode[]): number {
  return flattenUrls(nodes).length;
}

export interface FlatBookmarkRow {
  node: BookmarkNode;
  depth: number;
  parentId: string | null;
}

/** 管理弹窗用：按树顺序压平（文件夹在前，子项紧随），便于逐行渲染与搜索。 */
export function flattenTree(nodes: BookmarkNode[], depth = 0, parentId: string | null = null): FlatBookmarkRow[] {
  const out: FlatBookmarkRow[] = [];
  for (const node of nodes) {
    out.push({ node, depth, parentId });
    if (node.type === 'folder') out.push(...flattenTree(node.children || [], depth + 1, node.id));
  }
  return out;
}

export function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'folder' && n.children?.length) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function findUrlNode(nodes: BookmarkNode[], url: string): BookmarkNode | null {
  const key = bookmarkKey(url);
  return flattenUrls(nodes).find((n) => n.url && bookmarkKey(n.url) === key) || null;
}

export function findFolderOf(nodes: BookmarkNode[], id: string): string | null {
  for (const n of nodes) {
    if (n.type !== 'folder') continue;
    if ((n.children || []).some((c) => c.id === id)) return n.id;
    const hit = findFolderOf(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

export function listFolders(nodes: BookmarkNode[]): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (list: BookmarkNode[], depth: number, prefix: string) => {
    for (const n of list) {
      if (n.type !== 'folder') continue;
      const path = prefix ? `${prefix} / ${n.title}` : n.title;
      out.push({ id: n.id, title: n.title, depth, path });
      walk(n.children || [], depth + 1, path);
    }
  };
  walk(nodes, 0, '');
  return out;
}

export function addNode(nodes: BookmarkNode[], parentId: string | null, node: BookmarkNode): BookmarkNode[] {
  if (!parentId) return [...nodes, node];
  let inserted = false;
  const walk = (list: BookmarkNode[]): BookmarkNode[] => list.map((n) => {
    if (n.type !== 'folder') return n;
    if (n.id === parentId) {
      inserted = true;
      return { ...n, children: [...(n.children || []), node] };
    }
    return { ...n, children: walk(n.children || []) };
  });
  const next = walk(nodes);
  return inserted ? next : nodes;
}

export function removeNode(nodes: BookmarkNode[], id: string): BookmarkNode[] {
  const out: BookmarkNode[] = [];
  for (const n of nodes) {
    if (n.id === id) continue;
    if (n.type === 'folder') out.push({ ...n, children: removeNode(n.children || [], id) });
    else out.push(n);
  }
  return out;
}

export function updateNode(
  nodes: BookmarkNode[],
  id: string,
  patch: Pick<BookmarkNode, 'title'> & Partial<Pick<BookmarkNode, 'url'>>,
): BookmarkNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, ...patch, title: patch.title.trim() || n.title } : n));
}

function containsNode(node: BookmarkNode, id: string): boolean {
  if (node.id === id) return true;
  return (node.children || []).some((c) => containsNode(c, id));
}

/** 移动节点到某个文件夹（null = 根）。目标非法/会形成环时原样返回。 */
export function moveNode(nodes: BookmarkNode[], id: string, targetFolderId: string | null): BookmarkNode[] {
  if (id === targetFolderId) return nodes;
  const node = findNode(nodes, id);
  if (!node) return nodes;
  if (targetFolderId) {
    const target = findNode(nodes, targetFolderId);
    if (!target || target.type !== 'folder') return nodes;
    if (containsNode(node, targetFolderId)) return nodes;
  }
  const pruned = removeNode(nodes, id);
  if (targetFolderId && !findNode(pruned, targetFolderId)) return nodes;
  return addNode(pruned, targetFolderId, node);
}

/** 按关键词过滤：书名/文件夹名/URL 命中即保留，保留命中项的父文件夹链。 */
export function filterNodes(nodes: BookmarkNode[], query: string): BookmarkNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const hit = (n: BookmarkNode) => n.title.toLowerCase().includes(q) || (n.url || '').toLowerCase().includes(q);
  const walk = (list: BookmarkNode[]): BookmarkNode[] => {
    const out: BookmarkNode[] = [];
    for (const n of list) {
      if (n.type === 'folder') {
        const children = walk(n.children || []);
        if (children.length || hit(n)) out.push({ ...n, children: children.length ? children : n.children || [] });
      } else if (hit(n)) {
        out.push(n);
      }
    }
    return out;
  };
  return walk(nodes);
}

/** 把主进程解析出的 Chrome 树转成带 id 的收藏节点（丢弃空文件夹和非 http 链接）。 */
export function importedToNodes(tree: ImportedNode[], now = Date.now(), depth = 0): BookmarkNode[] {
  if (!Array.isArray(tree) || depth > MAX_DEPTH) return [];
  const out: BookmarkNode[] = [];
  for (const item of tree) {
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item.children)) {
      const children = importedToNodes(item.children, now, depth + 1);
      if (!children.length) continue;
      // Chrome 的「书签栏」根直接摊平到顶层，看起来与 Chrome 书签栏一致（不再多套一层）
      if (item.key === 'bookmark_bar') {
        out.push(...children);
        continue;
      }
      out.push({
        id: nextId(),
        type: 'folder',
        title: (item.title || '').trim() || '导入的书签',
        children,
        createdAt: now,
      });
      continue;
    }
    if (!isHttpUrl(item.url)) continue;
    out.push(makeUrlNode(item.url, item.title, now));
  }
  return out;
}

function dedupeTree(node: BookmarkNode, seen: Set<string>): { node: BookmarkNode | null; skipped: number } {
  if (node.type === 'url') {
    const key = bookmarkKey(node.url || '');
    if (!node.url || seen.has(key)) return { node: null, skipped: 1 };
    seen.add(key);
    return { node, skipped: 0 };
  }
  const children: BookmarkNode[] = [];
  let skipped = 0;
  for (const child of node.children || []) {
    const r = dedupeTree(child, seen);
    if (r.node) children.push(r.node);
    skipped += r.skipped;
  }
  if (!children.length) return { node: null, skipped };
  return { node: { ...node, children }, skipped };
}

/** 合并导入：按 URL 去重（保留已有），返回新树与统计。 */
export function mergeBookmarks(existing: BookmarkNode[], imported: BookmarkNode[]): {
  nodes: BookmarkNode[];
  added: number;
  skipped: number;
} {
  const seen = new Set(flattenUrls(existing).map((n) => bookmarkKey(n.url || '')));
  const addedNodes: BookmarkNode[] = [];
  let skipped = 0;
  for (const node of imported) {
    const r = dedupeTree(node, seen);
    if (r.node) addedNodes.push(r.node);
    skipped += r.skipped;
  }
  return { nodes: [...existing, ...addedNodes], added: countUrls(addedNodes), skipped };
}
