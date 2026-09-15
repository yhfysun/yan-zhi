// 本机路径识别与打开分流单测（2026-09-15 落地「统一文件打开入口」）。
//
// 背景：此前消息里的「浏览文件」按钮直接切 Git 目录树 —— 点一个文件也要被丢进
// 目录里自己找；正文里的本机路径则完全不可点。现在统一走 useChat.openPath：
// 文件 → FilePreview 通用阅读，目录 → 目录树。本文件钉死识别口径：
//   1. 只认绝对路径，相对路径不认（否则正文满屏 src/index.ts 被链接化）
//   2. http(s) 与站点根相对路径不认（早期正则会把它误判成 Windows 盘符）
//   3. 中文标点处断开（"已保存到 C:\a\b.md，请查收" 不能把后面的正文吞进路径）
//   4. 分流：目录 → dir、文件 → file
// 已知限制：路径含空格时会在空格处截断（如 C:\Program Files\x），此处不做支持 ——
// 放宽会把后续正文一并吞掉，误伤大于收益。
import { describe, it, expect } from 'vitest';
import {
  baseNameOf,
  hasLocalPath,
  isLocalPath,
  normalizePath,
  resolveOpenTarget,
  splitLocalPaths,
} from '../../../packages/ui/src/utils/file-open';

describe('hasLocalPath 正文路径识别', () => {
  it('Windows 盘符路径（正反斜杠都认）', () => {
    expect(hasLocalPath('已保存到 C:\\out\\report.md')).toBe(true);
    expect(hasLocalPath('C:/out/report.md')).toBe(true);
  });

  it('unix 常见根路径', () => {
    expect(hasLocalPath('见 /home/user/app.log')).toBe(true);
    expect(hasLocalPath('/Users/yhfys/Desktop/a.ts')).toBe(true);
  });

  it('相对路径不认（避免正文被大面积链接化）', () => {
    expect(hasLocalPath('src/index.ts')).toBe(false);
    expect(hasLocalPath('packages/ui/package.json')).toBe(false);
  });

  it('http(s) 链接不认（回归：s:/ 曾被当成盘符）', () => {
    expect(hasLocalPath('https://example.com/a/b')).toBe(false);
    expect(hasLocalPath('http://x.cn/c:/d')).toBe(false);
  });

  it('站点根相对路径不认（那是后端媒体地址，不是本机文件）', () => {
    expect(hasLocalPath('/api/generated/images/a.png')).toBe(false);
  });

  it('空值不认', () => {
    expect(hasLocalPath('')).toBe(false);
    expect(hasLocalPath(undefined as unknown as string)).toBe(false);
  });
});

describe('isLocalPath 整段判定（行内代码用）', () => {
  it('整段就是一条路径才转', () => {
    expect(isLocalPath('C:\\a\\b.md')).toBe(true);
    expect(isLocalPath('  /home/u/a.txt  ')).toBe(true);
  });

  it('代码片段里的路径不转（且不误转整段代码）', () => {
    expect(isLocalPath('const p = "C:\\a"')).toBe(false);
    expect(isLocalPath('foo(C:\\a)')).toBe(false);
  });
});

describe('splitLocalPaths 分段', () => {
  it('文本与路径交替切分，顺序与原文一致', () => {
    const segs = splitLocalPaths('a C:\\x\\1.txt b /home/u/2.txt c');
    expect(segs.map((s) => s.type)).toEqual(['text', 'path', 'text', 'path', 'text']);
    expect(segs.filter((s) => s.type === 'path').map((s) => s.value)).toEqual([
      'C:\\x\\1.txt',
      '/home/u/2.txt',
    ]);
  });

  it('中文标点处断开，后续正文不被吞进路径', () => {
    const paths = splitLocalPaths('已保存到 C:\\out\\report.md，请查收')
      .filter((s) => s.type === 'path')
      .map((s) => s.value);
    expect(paths).toEqual(['C:\\out\\report.md']);
  });

  it('无路径时原样返回单段（拼接后与原文一致）', () => {
    const segs = splitLocalPaths('普通正文没有路径');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ type: 'text', value: '普通正文没有路径' });
  });

  it('分段拼接可完整还原原文（不丢字符）', () => {
    const src = '前 C:\\a\\b.md 中 /home/u/c.txt 后';
    expect(splitLocalPaths(src).map((s) => s.value).join('')).toBe(src);
  });
});

describe('normalizePath / baseNameOf', () => {
  it('清掉正文顺带带来的尾随标点与包裹引号', () => {
    expect(normalizePath('C:\\a\\b.md,')).toBe('C:\\a\\b.md');
    expect(normalizePath('"C:\\a\\b.md"')).toBe('C:\\a\\b.md');
    expect(normalizePath('  /home/u/a.txt  ')).toBe('/home/u/a.txt');
  });

  it('末段作为展示名，尾部斜杠不影响', () => {
    expect(baseNameOf('C:\\out\\report.md')).toBe('report.md');
    expect(baseNameOf('/home/u/project/')).toBe('project');
    expect(baseNameOf('/home/u/project')).toBe('project');
  });
});

describe('resolveOpenTarget 打开分流', () => {
  it('目录 → dir（走目录树）', () => {
    const t = resolveOpenTarget('C:\\out\\docs', true);
    expect(t).toEqual({ kind: 'dir', path: 'C:\\out\\docs', name: 'docs' });
  });

  it('文件 → file（走通用预览）', () => {
    const t = resolveOpenTarget('C:\\out\\docs\\a.md', false);
    expect(t).toEqual({ kind: 'file', path: 'C:\\out\\docs\\a.md', name: 'a.md' });
  });

  it('传入带尾随标点的路径时先归一化再分流', () => {
    expect(resolveOpenTarget('"C:\\out\\a.md",', false).path).toBe('C:\\out\\a.md');
  });
});
