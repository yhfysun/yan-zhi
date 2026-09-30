// 工具路径解析的回归测试 —— 守一个用户实报缺陷（2026-09-30）。
//
// ★★★ 被修的缺陷：所有读类工具（file_read / file_list / file_grep / code_search …
//   以及 code_outline / code_refs / code_graph / file_to_markdown / file_edit /
//   file_write 的回退路径）此前各自 `const root = args.path || '.'` 后**直接交给 fs**，
//   而 fs 适配器用的是**进程 cwd**（后端启动目录），不是用户的工作目录。
//
//   实测证据（生产库会话 aaa84c6c，09-30 08:27~08:28）：
//     · `{"path":"02-work"}`                  → Error: directory not found: 02-work
//     · `{"path":"02-work/audio"}`            → 同样失败
//     · `{"path":".yan-zhi/tasks/<convId>"}`  → 同样失败
//     · 模型被迫改用一长串绝对路径才绕过去（08:30 之后才恢复）
//   用户原话：「这个工具也有问题啊，不是工作目录是当前目录？」
//
// ★ 修法：core 提供**唯一出口** `resolveToolPath(input, workspaceDir)`，
//   工作目录由调用方经 `ToolContext.workspaceDir` 传入（与既有的 artifactDirs 同取向：
//   调用方算好、直接传，工具侧零业务知识）。
import { describe, it, expect } from 'vitest';
import { resolveToolPath, isAbsolutePath } from './fs-walk';
import { FileListTool } from './file-list';
import { setPlatformAdapter } from '../../platform/types';

const WS = 'C:/work/proj';

describe('isAbsolutePath', () => {
  it('Windows 盘符 / UNC / POSIX 根都算绝对', () => {
    expect(isAbsolutePath('C:\\a\\b')).toBe(true);
    expect(isAbsolutePath('C:/a/b')).toBe(true);
    expect(isAbsolutePath('\\\\server\\share')).toBe(true);
    expect(isAbsolutePath('//server/share')).toBe(true);
    expect(isAbsolutePath('/usr/local')).toBe(true);
  });

  it('相对路径不算绝对', () => {
    for (const p of ['02-work', '02-work/audio', './x', '.', '..', 'a/b/c']) {
      expect(isAbsolutePath(p), p).toBe(false);
    }
  });

  it('空值不算绝对（不得把空串当根）', () => {
    expect(isAbsolutePath('')).toBe(false);
    expect(isAbsolutePath('   ')).toBe(false);
  });
});

describe('resolveToolPath：相对路径必须基于工作目录（核心修复）', () => {
  it('★★★ 用户实报的 `02-work` → 拼到工作目录（修复前解析到进程 cwd → not found）', () => {
    expect(resolveToolPath('02-work', WS)).toBe(`${WS}/02-work`);
  });

  it('★★★ 多级相对路径 `02-work/audio` → 同样基于工作目录', () => {
    expect(resolveToolPath('02-work/audio', WS)).toBe(`${WS}/02-work/audio`);
  });

  it('★★★ 相对路径 `.yan-zhi/tasks/<id>` → 基于工作目录（另一处实测失败形态）', () => {
    expect(resolveToolPath('.yan-zhi/tasks/abc', WS)).toBe(`${WS}/.yan-zhi/tasks/abc`);
  });

  it('绝对路径**原样返回**（用户/模型显式指定就别动它）', () => {
    expect(resolveToolPath('C:/other/place', WS)).toBe('C:/other/place');
    expect(resolveToolPath('/usr/local/bin', WS)).toBe('/usr/local/bin');
    expect(resolveToolPath('\\\\srv\\share\\x', WS)).toBe('\\\\srv\\share\\x');
  });

  it('`.` 与 `./x` 都表示工作目录（与 schema 里 "Use \".\" for the workspace root" 一致）', () => {
    expect(resolveToolPath('.', WS)).toBe(WS);
    expect(resolveToolPath('./sub', WS)).toBe(`${WS}/sub`);
    expect(resolveToolPath('.\\sub', WS)).toBe(`${WS}/sub`);
  });

  it('未给路径 → 工作目录根（无工作目录时才退回 "."）', () => {
    expect(resolveToolPath(undefined, WS)).toBe(WS);
    expect(resolveToolPath('', WS)).toBe(WS);
    expect(resolveToolPath('   ', WS)).toBe(WS);
    expect(resolveToolPath(undefined)).toBe('.');
  });

  it('★ 拿不到 workspaceDir → 原样返回（保持旧行为，不静默改变语义）', () => {
    expect(resolveToolPath('02-work')).toBe('02-work');
    expect(resolveToolPath('02-work', '')).toBe('02-work');
    expect(resolveToolPath('02-work', null)).toBe('02-work');
  });

  it('★ 不做路径规范化：`..` 保留原样（越界判定是上层权限的职责，不是本函数）', () => {
    // 单一职责：本函数只负责"相对路径基于工作目录"，不越权做安全判定
    expect(resolveToolPath('../outside', WS)).toBe(`${WS}/../outside`);
  });

  it('工作目录末尾带斜杠时不产生双斜杠', () => {
    expect(resolveToolPath('02-work', 'C:/work/proj/')).toBe('C:/work/proj/02-work');
    expect(resolveToolPath('02-work', 'C:/work/proj///')).toBe('C:/work/proj/02-work');
  });

  it('非字符串输入安全（模型偶尔传数字/null）', () => {
    expect(resolveToolPath(123, WS)).toBe(WS);
    expect(resolveToolPath(null, WS)).toBe(WS);
    expect(resolveToolPath({ path: 'x' }, WS)).toBe(WS);
  });

  it('反例对照：旧行为（原样交给 fs）对同一输入会落到 cwd', () => {
    const oldBehavior = (p: string) => p; // 旧代码就是原样透传
    expect(oldBehavior('02-work')).toBe('02-work');           // ← 相对路径 → 解析到进程 cwd
    expect(resolveToolPath('02-work', WS)).not.toBe('02-work'); // ← 修复后基于工作目录
  });
});

// ── 端到端：真实调用 file_list（不只测纯函数）──
// 最小 fs 适配器：只实现 file_list 用到的 exists / listDirEntries
const tree: Record<string, string[]> = {
  'C:/ws': ['02-work', 'readme.md'],
  'C:/ws/02-work': ['audio', 'tts'],
  'C:/ws/02-work/audio': [],
  'C:/ws/02-work/tts': [],
};
setPlatformAdapter({
  fs: {
    async exists(p: string) { return Object.prototype.hasOwnProperty.call(tree, p.replace(/[\\/]+$/,'')) || p === 'C:/ws'; },
    async listDirEntries(p: string) {
      const k = p.replace(/[\\/]+$/,'');
      if (!tree[k]) throw new Error('not found');
      return tree[k].map((n) => ({ name: n, isDir: Object.prototype.hasOwnProperty.call(tree, `${k}/${n}`) }));
    },
  } as any,
} as any);

describe('端到端：file_list 相对路径基于 ctx.workspaceDir', () => {
  it('★★★ 传 "02-work" → 应解析到工作目录下的 02-work（修复前报 directory not found）', async () => {
    const r: any = await new FileListTool().execute({ path: '02-work' }, { workspaceDir: 'C:/ws' } as any);
    expect(r.isError, '仍报 not found → 相对路径没基于工作目录').toBeFalsy();
    const text = r.content[0].text;
    expect(text).toContain('audio');
    expect(text).toContain('tts');
  });

  it('传 "." → 工作目录根', async () => {
    const r: any = await new FileListTool().execute({ path: '.' }, { workspaceDir: 'C:/ws' } as any);
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('02-work');
  });

  it('绝对路径原样使用', async () => {
    const r: any = await new FileListTool().execute({ path: 'C:/ws/02-work' }, { workspaceDir: 'C:/other' } as any);
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('audio');
  });

  it('反例对照：不给 ctx 时仍走旧行为（相对路径解析失败）', async () => {
    const r: any = await new FileListTool().execute({ path: '02-work' });
    expect(r.isError, '无 ctx 时应保持旧行为（这正是缺陷现场）').toBe(true);
    expect(r.content[0].text).toContain('directory not found');
  });
});
