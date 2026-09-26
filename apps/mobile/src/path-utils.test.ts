// 移动端路径归一化的契约测试（apps/mobile/src/path-utils.ts）。
//
// 起因（用户实测报障）：「生成图片预览 ok，点击图片在预览框里面就会有问题说文件不存在」，
// 报错里的路径**重复了两遍**：
//   /data/user/0/com.yanzhi.mobile/files/data/data/com.yanzhi.mobile/files/capawesome_nodejs/...
//
// 根因：Capacitor `Filesystem.readFile({ path, directory: Directory.Data })` 里的 `path`
// 必须是**相对 Directory.Data 的路径**；而内嵌后端产出的是**绝对路径**，
// 直接混用会被再拼一次根目录。本文件钉住这个契约，防止回退。

import { describe, it, expect } from 'vitest';
import { toFileUri, toFsArg } from './path-utils';

describe('toFileUri：绝对路径必须转成 file:// 直连', () => {
  it('★ 后端在 Android 上的家目录相对形式 → /data/user/0/', () => {
    // 这是用户实报的那个形态，正是它导致了路径重复
    expect(toFileUri('data/data/com.yanzhi.mobile/files/capawesome_nodejs/yan-zhi-data/x.png'))
      .toBe('file:///data/user/0/com.yanzhi.mobile/files/capawesome_nodejs/yan-zhi-data/x.png');
  });

  it('真绝对路径 → 补 file://', () => {
    expect(toFileUri('/data/user/0/com.yanzhi.mobile/files/a.png'))
      .toBe('file:///data/user/0/com.yanzhi.mobile/files/a.png');
  });

  it('已是 file:// → 原样返回（幂等）', () => {
    const u = 'file:///data/user/0/com.yanzhi.mobile/files/a.png';
    expect(toFileUri(u)).toBe(u);
  });

  it('data/user/<uid>/ 形式也能识别', () => {
    expect(toFileUri('data/user/0/com.yanzhi.mobile/files/a.png'))
      .toBe('file:///data/user/0/com.yanzhi.mobile/files/a.png');
  });

  it('Windows 盘符路径（健壮性，移动端用不到）', () => {
    expect(toFileUri('C:\\Users\\x\\a.png')).toBe('file:///C:/Users/x/a.png');
  });

  it('空值 / 空白 → null', () => {
    expect(toFileUri('')).toBeNull();
    expect(toFileUri('   ')).toBeNull();
    expect(toFileUri(undefined as unknown as string)).toBeNull();
  });

  it('★ 相对 Directory.Data 的路径 → null（交由调用方走 directory 拼接）', () => {
    // 例如 ChatFileTab 里自己拼的 workspace/xxx，必须走 Directory.Data
    expect(toFileUri('workspace/a.png')).toBeNull();
    expect(toFileUri('capawesome_nodejs/yan-zhi-data/a.db')).toBeNull();
    expect(toFileUri('./a.png')).toBeNull();
  });
});

describe('toFsArg：绝对路径不得再传 directory（否则二次拼接）', () => {
  const DATA = 'DATA' as const;

  it('★ 绝对路径：只给 path，且必须是 file://', () => {
    const arg = toFsArg('data/data/com.yanzhi.mobile/files/a.png', DATA);
    expect(arg.directory, '绝对路径还必须不传 directory').toBeUndefined();
    expect(arg.path.startsWith('file://')).toBe(true);
    // 反向：绝不能出现「根目录被拼两次」
    expect(arg.path).not.toMatch(/\/files\/.*data\/data\//);
  });

  it('相对路径：给 path + Directory.Data', () => {
    const arg = toFsArg('workspace/a.png', DATA);
    expect(arg.directory).toBe(DATA);
    expect(arg.path).toBe('workspace/a.png');
  });

  it('★ 回归钉死：不再产出重复根目录的路径', () => {
    // 用户报错里的那串：根目录出现两次
    const bad = 'data/data/com.yanzhi.mobile/files/capawesome_nodejs/x.png';
    const arg = toFsArg(bad, DATA);
    const asWouldBeConcat = arg.directory ? `/data/user/0/com.yanzhi.mobile/files/${arg.path}` : arg.path;
    expect(asWouldBeConcat).not.toContain('/files/data/data/');
  });
});