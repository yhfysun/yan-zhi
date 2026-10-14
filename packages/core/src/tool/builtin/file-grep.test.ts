// file_grep 目录探测回归（2026-10-14 实报）
//
// ★ 守住的语义：**搜单个文件必须能搜到**。
//   原实现用 `fs.exists(target + '/')` 判目录，而 **Windows 上对「文件」加尾斜杠 stat 同样
//   成功** ⇒ 单个文件被判成目录 ⇒ walkFiles（对文件 readDir 必失败）返回空 ⇒ 恒回
//   「No files to search in: <那个文件>」。实测 conv 96125908 16:20:17 现场复现：
//   模型以为参数写错、换着花样重试同一文件，16:02:10 更因此连撞两次触发循环闸门硬停。
//   同一坑 fs-walk.ts:114 已踩过并写明（"2026-10-03 集成自测实测"），file-grep 漏改。
//
// 本测试的 fs 适配器**刻意复现 Windows 语义**（exists 无视尾斜杠、readDir 对文件抛错），
// 旧实现跑这份 fixture 会红，新实现（stat 优先、readDir 兜底）必绿。
import { describe, it, expect, beforeEach } from 'vitest';
import { FileGrepTool } from './file-grep';
import { setPlatformAdapter, type DirEntryInfo, type PlatformAdapter } from '../../platform/types';

const WS = 'C:/work/proj';
const FILE = `${WS}/发布单.md`;
const CONTENT = [
  '# 《骨债阴阳》三集发布单',
  '合集名（三条共用）：骨债阴阳',
  '评论区置顶引导词：搜「骨债阴阳」看全文',
].join('\n');

const NESTED = `${WS}/notes/经验.md`;
const NESTED_CONTENT = '历史坑：browser_navigate 打开 file:// 会失败。';

/** 内存 fs —— ★ 复现 Windows 语义：对文件加尾斜杠 exists 同样为 true */
function makeWinLikeFs(withStat: boolean) {
  const files = new Map<string, string>([
    [FILE, CONTENT],
    [NESTED, NESTED_CONTENT],
  ]);
  const dirs = new Set<string>([WS, `${WS}/notes`]);
  const norm = (p: string) => p.replace(/[\\/]+$/, '');

  const fs: Record<string, unknown> = {
    async readFile(p: string) {
      const c = files.get(norm(p));
      if (c === undefined) throw new Error(`ENOENT: ${p}`);
      return c;
    },
    async exists(p: string) {
      // ★ 关键：Windows 下 `exists('a.md/')` 与 `exists('a.md')` 等价 → 都是 true
      const k = norm(p);
      return files.has(k) || dirs.has(k);
    },
    async readDir(p: string) {
      const k = norm(p);
      if (files.has(k)) throw new Error('ENOTDIR'); // 对文件 readDir 必然失败（探测语义依赖它）
      if (!dirs.has(k)) throw new Error('ENOENT');
      const names = new Set<string>();
      for (const f of files.keys()) if (f.startsWith(`${k}/`)) names.add(f.slice(k.length + 1).split('/')[0]);
      for (const d of dirs) if (d !== k && d.startsWith(`${k}/`)) names.add(d.slice(k.length + 1).split('/')[0]);
      return [...names];
    },
  };
  if (withStat) {
    fs.stat = async (p: string) => {
      const k = norm(p);
      if (files.has(k)) return { isDir: false, size: files.get(k)!.length };
      if (dirs.has(k)) return { isDir: true, size: 0 };
      throw new Error(`ENOENT: ${p}`);
    };
    fs.listDirEntries = async (p: string): Promise<DirEntryInfo[]> => {
      const k = norm(p);
      if (files.has(k)) throw new Error('ENOTDIR');
      const names = await (fs.readDir as (x: string) => Promise<string[]>)(k);
      return names.map((name) => ({
        name,
        path: `${k}/${name}`,
        isDir: dirs.has(`${k}/${name}`),
      }));
    };
  }
  return fs as unknown as PlatformAdapter['fs'];
}

function install(withStat: boolean) {
  setPlatformAdapter({ platform: 'desktop', fs: makeWinLikeFs(withStat) } as unknown as PlatformAdapter);
}

// McpCallResult.content[].text 是可选字段（不是每个 part 都带 text）
const text = (r: { content: Array<{ text?: string }> }) => r.content.map((c) => c.text ?? '').join('\n');

beforeEach(() => install(true));

describe('file_grep 目录探测（2026-10-14 Windows 单文件恒失败修复）', () => {
  it('★ 搜单个文件能搜到（旧实现回 "No files to search in"）', async () => {
    // 先证明这份 fixture 确实复现了 Windows 怪癖（否则本测试是空转）：
    // 对**文件**加尾斜杠 exists 仍为 true —— 这正是旧判据 `exists(target + '/')` 判错的原因
    const { getPlatformAdapter } = await import('../../platform/types');
    expect(await getPlatformAdapter().fs.exists(`${FILE}/`)).toBe(true);
    // ★ await 的是**断言**本身（不能 await 那个 promise：拒绝会先抛出来变成测试自己抛错）
    await expect(getPlatformAdapter().fs.readDir(FILE)).rejects.toThrow();

    const r = await new FileGrepTool().execute({ path: FILE, pattern: '骨债阴阳' }, { workspaceDir: WS });
    const out = text(r);
    expect(out, '★ 单文件搜索恒失败是本 bug 的核心症状').not.toContain('No files to search in');
    expect(out).toContain(FILE);
    expect(out).toContain('合集名（三条共用）：骨债阴阳');
  });

  it('★ 单文件搜索带行号，且命中行号正确（1/2/3 三行都含该词）', async () => {
    const r = await new FileGrepTool().execute({ path: FILE, pattern: '骨债阴阳' }, { workspaceDir: WS });
    const lines = text(r).split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain(':1:');
    expect(lines[1]).toContain(':2:');
    expect(lines[2]).toContain(':3:');
  });

  it('单文件搜不到时给的是"无匹配"而不是"没有可搜的文件"（两种回执不能混）', async () => {
    const r = await new FileGrepTool().execute({ path: FILE, pattern: '不存在的词' }, { workspaceDir: WS });
    expect(text(r)).toContain('No matches for');
    expect(text(r)).not.toContain('No files to search in');
  });

  it('适配器没有 stat 时，用 readDir 探测兜底（单文件同样能搜到）', async () => {
    install(false);
    const r = await new FileGrepTool().execute({ path: FILE, pattern: '评论区' }, { workspaceDir: WS });
    expect(text(r)).toContain('评论区置顶引导词');
  });

  it('目录搜索不受影响：递归命中子目录文件', async () => {
    const r = await new FileGrepTool().execute({ path: WS, pattern: 'file://' }, { workspaceDir: WS });
    const out = text(r);
    expect(out).toContain(NESTED);
    expect(out).toContain('browser_navigate');
  });

  it('路径不存在仍报 path not found（修复不能把这条改没了）', async () => {
    const r = await new FileGrepTool().execute({ path: `${WS}/没有这个文件.md`, pattern: 'x' }, { workspaceDir: WS });
    expect(text(r)).toContain('path not found');
  });
});
