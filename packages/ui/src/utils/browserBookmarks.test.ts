import { describe, it, expect } from 'vitest';
import {
  addNode,
  bookmarkKey,
  countUrls,
  filterNodes,
  findUrlNode,
  flattenTree,
  importedToNodes,
  listFolders,
  makeFolderNode,
  makeUrlNode,
  mergeBookmarks,
  moveNode,
  parseStoredBookmarks,
  removeNode,
  serializeBookmarks,
  updateNode,
  type BookmarkNode,
} from './browserBookmarks';

const NOW = 1760000000000;

function folder(title: string, children: BookmarkNode[] = []): BookmarkNode {
  return { ...makeFolderNode(title, NOW), id: 'f-' + title, children };
}
function url(u: string, title = ''): BookmarkNode {
  return { ...makeUrlNode(u, title, NOW), id: 'u-' + u };
}

describe('parseStoredBookmarks', () => {
  it('迁移旧版扁平数组，并按域名补标题', () => {
    const list = parseStoredBookmarks(JSON.stringify([
      { url: 'https://www.github.com/a', title: '' },
      { url: 'https://example.com', title: '示例' },
    ]), NOW);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ type: 'url', title: 'github.com', url: 'https://www.github.com/a' });
    expect(list[1].title).toBe('示例');
  });

  it('读取新版树形结构', () => {
    const raw = serializeBookmarks([folder('AI', [url('https://a.com', 'A')])]);
    const nodes = parseStoredBookmarks(raw, NOW);
    expect(nodes[0].type).toBe('folder');
    expect(nodes[0].children?.[0].title).toBe('A');
  });

  it('坏数据不抛错', () => {
    expect(parseStoredBookmarks('not json', NOW)).toEqual([]);
    expect(parseStoredBookmarks('{"version":2}', NOW)).toEqual([]);
    expect(parseStoredBookmarks(JSON.stringify([{ title: '没有 url' }, null, 42]), NOW)).toEqual([]);
  });

  it('丢弃非 http 链接', () => {
    const nodes = parseStoredBookmarks(JSON.stringify([{ url: 'javascript:alert(1)' }]), NOW);
    expect(nodes).toEqual([]);
  });
});

describe('树形增删改移', () => {
  it('addNode 写入指定文件夹', () => {
    const tree = [folder('AI', [])];
    const next = addNode(tree, 'f-AI', url('https://a.com'));
    expect(next[0].children).toHaveLength(1);
    // 不可变：原树不动
    expect(tree[0].children).toHaveLength(0);
  });

  it('addNode 目标不存在时原样返回', () => {
    const tree = [folder('AI', [])];
    expect(addNode(tree, 'missing', url('https://a.com'))).toBe(tree);
  });

  it('removeNode 递归删除', () => {
    const tree = [folder('AI', [folder('子', [url('https://a.com')])])];
    const next = removeNode(tree, 'u-https://a.com');
    expect(next[0].children?.[0].children).toHaveLength(0);
  });

  it('updateNode 改名，空标题保留原名', () => {
    const tree = [url('https://a.com', '旧名')];
    expect(updateNode(tree, tree[0].id, { title: '新名' })[0].title).toBe('新名');
    expect(updateNode(tree, tree[0].id, { title: '  ' })[0].title).toBe('旧名');
  });

  it('moveNode 不允许把文件夹移进自己的子孙', () => {
    const child = folder('子', [url('https://a.com')]);
    const tree = [folder('父', [child])];
    expect(moveNode(tree, 'f-父', 'f-子')).toBe(tree);
  });

  it('moveNode 可移回根目录', () => {
    const tree = [folder('AI', [url('https://a.com')])];
    const next = moveNode(tree, 'u-https://a.com', null);
    expect(countUrls(next)).toBe(1);
    expect(next.some((n) => n.type === 'url')).toBe(true);
  });
});

describe('查找与过滤', () => {
  it('findUrlNode 忽略 host 大小写与尾部斜杠', () => {
    const tree = [url('https://Example.com/path/')];
    expect(findUrlNode(tree, 'https://example.com/path')).not.toBeNull();
    expect(bookmarkKey('https://Example.com/path/')).toBe('https://example.com/path');
  });

  it('filterNodes 保留命中项的父文件夹链', () => {
    const tree = [folder('AI', [url('https://a.com', 'GPT'), url('https://b.com', '其他')])];
    const hit = filterNodes(tree, 'gpt');
    expect(hit).toHaveLength(1);
    expect(hit[0].children?.map((n) => n.title)).toEqual(['GPT']);
  });

  it('listFolders 给出可读路径', () => {
    const tree = [folder('AI', [folder('子', [])])];
    expect(listFolders(tree).map((f) => f.path)).toEqual(['AI', 'AI / 子']);
  });

  it('flattenTree 按树顺序给出深度与父文件夹', () => {
    const tree = [folder('AI', [folder('子', []), url('https://a.com')]), url('https://b.com')];
    const rows = flattenTree(tree);
    expect(rows.map((r) => [r.node.title, r.depth, r.parentId === 'f-AI'])).toEqual([
      ['AI', 0, false],
      ['子', 1, true],
      ['a.com', 1, true],
      ['b.com', 0, false],
    ]);
  });
});

describe('Chrome 导入', () => {
  it('importedToNodes 过滤非法链接与空文件夹', () => {
    const nodes = importedToNodes([
      { title: 'AI', children: [{ title: 'GitHub', url: 'https://github.com' }] },
      { title: '空文件夹', children: [] },
      { title: '坏链接', url: 'chrome://settings' },
    ], NOW);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children?.[0].title).toBe('GitHub');
  });

  it('书签栏根展开到顶层（与 Chrome 收藏栏一致）', () => {
    const nodes = importedToNodes([
      { key: 'bookmark_bar', title: '书签栏', children: [{ title: 'GitHub', url: 'https://github.com' }] },
    ], NOW);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('url');
  });

  it('mergeBookmarks 按 URL 去重并统计', () => {
    const existing = [url('https://github.com', '已有')];
    const imported = importedToNodes([
      { title: 'AI', children: [
        { title: 'GitHub', url: 'https://github.com/' },
        { title: 'Docs', url: 'https://docs.example.com' },
      ] },
    ], NOW);
    const r = mergeBookmarks(existing, imported);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(countUrls(r.nodes)).toBe(2);
    expect(r.nodes.find((n) => n.type === 'folder')?.children?.map((c) => c.title)).toEqual(['Docs']);
  });
});
