/**
 * ffmpeg 定位单测。
 *
 * 为什么值得测：打包形态下 ffmpeg 不在 PATH，只能靠「沿模块目录向上找 resources/ffmpeg」。
 * 这个向上搜索一旦漏一层目录，打包版就会报「未找到 ffmpeg」而 dev 模式正常 —— 最难查的一类问题。
 * 这里用纯函数 buildBundledCandidates 钉住搜索半径与顺序。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildBundledCandidates, buildDownloadUrl, buildExtractCommand, resolveFfmpeg, resetFfmpegCache } from '../src/mcp/ffmpeg-runtime';

describe('buildBundledCandidates · 随包目录搜索', () => {
  // 用 path.resolve 在盘符根下构造，避免手写 path.sep 造成 "C:\App" 与 "\App" 这类跨平台差异
  const start = path.resolve('/App/resources/server/dist/apps/server/src/mcp');

  it('候选均为 <祖先>/ffmpeg 形式', () => {
    for (const c of buildBundledCandidates(start)) {
      expect(path.basename(c)).toBe('ffmpeg');
      expect(path.isAbsolute(c)).toBe(true);
    }
  });

  it('第一项是模块自身目录下的 ffmpeg（最近优先）', () => {
    expect(buildBundledCandidates(start)[0]).toBe(path.join(start, 'ffmpeg'));
  });

  it('能向上覆盖到 resources/ffmpeg（打包形态的真实位置）', () => {
    const expectTarget = path.resolve('/App/resources/ffmpeg');
    expect(buildBundledCandidates(start)).toContain(expectTarget);
  });

  it('搜索半径覆盖打包形态所需的 7 层，且不超过 8', () => {
    const c = buildBundledCandidates(start);
    expect(c.length).toBeGreaterThanOrEqual(7);
    expect(c.length).toBeLessThanOrEqual(8);
  });

  it('到根目录即停，不产生重复项', () => {
    const c = buildBundledCandidates(path.resolve('/a/b'));
    expect(new Set(c).size).toBe(c.length);
    expect(c[c.length - 1]).toBe(path.resolve('/ffmpeg'));
  });
});

describe('buildDownloadUrl · 按平台下载源', () => {
  it('三个平台都有源（含 mac —— 这是必须支持的平台）', () => {
    for (const p of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
      expect(buildDownloadUrl(p, 'x64')).not.toBeNull();
    }
  });

  it('win32 用 gyan.dev essentials zip（含 ffmpeg 与 ffprobe）', () => {
    const d = buildDownloadUrl('win32', 'x64')!;
    expect(d.url).toContain('gyan.dev');
    expect(d.archive).toBe('zip');
    expect(d.extraProbe).toBeUndefined();
  });

  it('darwin 额外给 ffprobe 独立包（evermeet 两个包分开）', () => {
    const d = buildDownloadUrl('darwin', 'arm64')!;
    expect(d.url).toContain('evermeet.cx');
    expect(d.extraProbe?.url).toContain('ffprobe');
  });

  it('linux 按架构选包（arm64 / amd64）', () => {
    expect(buildDownloadUrl('linux', 'arm64')!.url).toContain('arm64');
    expect(buildDownloadUrl('linux', 'x64')!.url).toContain('amd64');
  });

  it('未知平台返回 null（由上层给出手动安装指引）', () => {
    expect(buildDownloadUrl('freebsd' as NodeJS.Platform, 'x64')).toBeNull();
  });
});

describe('installDir · 可覆盖且不依赖数据库', () => {
  it('YZ_FFMPEG_DIR 优先（用户自定义安装位）', async () => {
    const dir = path.join(os.tmpdir(), 'yz-ff-test-install');
    const old = process.env.YZ_FFMPEG_DIR;
    process.env.YZ_FFMPEG_DIR = dir;
    try {
      const st = await resolveFfmpeg();
      expect(st.installDir).toBe(path.resolve(dir));
    } finally {
      if (old === undefined) delete process.env.YZ_FFMPEG_DIR; else process.env.YZ_FFMPEG_DIR = old;
      resetFfmpegCache();
    }
  });

  it('无覆盖时落在 DATA_DIR/ffmpeg 下', async () => {
    const base = path.join(os.tmpdir(), 'yz-ff-test-data');
    const oldDir = process.env.YZ_FFMPEG_DIR;
    const oldData = process.env.DATA_DIR;
    delete process.env.YZ_FFMPEG_DIR;
    process.env.DATA_DIR = base;
    try {
      const st = await resolveFfmpeg();
      expect(st.installDir).toBe(path.join(base, 'ffmpeg'));
    } finally {
      if (oldDir !== undefined) process.env.YZ_FFMPEG_DIR = oldDir;
      if (oldData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldData;
      resetFfmpegCache();
    }
  });

  it('installDir 兜底落在 apps/server 下，而不是仓库外的上级目录', async () => {
    // 回归：曾用「向上溯源 8 层」，结果落到 Desktop/github/ffmpeg（别的项目旁边），
    // 且因 bundled 兜底能命中而不报错 —— 下载位置错得很难发现。
    const oldDir = process.env.YZ_FFMPEG_DIR;
    const oldData = process.env.DATA_DIR;
    delete process.env.YZ_FFMPEG_DIR;
    delete process.env.DATA_DIR;
    try {
      const st = await resolveFfmpeg();
      expect(st.installDir).toMatch(/apps[\\/]server[\\/]ffmpeg$/);
    } finally {
      if (oldDir !== undefined) process.env.YZ_FFMPEG_DIR = oldDir;
      if (oldData !== undefined) process.env.DATA_DIR = oldData;
      resetFfmpegCache();
    }
  });

  it('本模块可独立导入（不连带初始化 better-sqlite3）', () => {
    // 若哪天有人给 ffmpeg-runtime 加了顶层 db 导入，这里会因 ABI/副作用炸掉
    expect(typeof resolveFfmpeg).toBe('function');
  });
});

describe('buildExtractCommand · 解压命令', () => {
  it('tar.xz 用 tar（跨平台自带）', () => {
    const c = buildExtractCommand('tarxz', '/tmp/a.tar.xz', '/tmp/out');
    expect(c.cmd).toBe('tar');
    expect(c.args).toContain('-xJf');
    expect(c.args).toContain('/tmp/out');
  });

  it('zip 在 Windows 走 PowerShell Expand-Archive', () => {
    const c = buildExtractCommand('zip', 'C:\\a.zip', 'C:\\out');
    if (process.platform === 'win32') {
      expect(c.cmd).toBe('powershell.exe');
      expect(c.args.join(' ')).toContain('Expand-Archive');
    } else {
      expect(c.cmd).toBe('unzip');
    }
  });

  it('路径原样透传（不自行改写，避免空格/中文路径被破坏）', () => {
    const c = buildExtractCommand('tarxz', '/tmp/有 空格/a.tar.xz', '/tmp/出 目录');
    expect(c.args).toContain('/tmp/有 空格/a.tar.xz');
    expect(c.args).toContain('/tmp/出 目录');
  });
});