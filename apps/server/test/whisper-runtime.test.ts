/**
 * whisper-runtime 单测 —— 本地 ASR（whisper.cpp）的纯逻辑守门。
 *
 * ★★★ 为什么必须钉这些（2026-10-08 实测踩坑）：
 *   ① **whisper.cpp 的正式 release 零二进制资产** —— 实测 `releases/latest` → `v1.9.5`
 *      的 `assets: []`，二进制**只在 nightly tag**（形如 `b5454`）。若按常规去 latest 找 zip
 *      必然 404，且**不报错**（只是拿到空列表）。
 *   ② nightly tag **滚动**，写死版本会在旧 tag 清理后失效 → 必须"取最新"。
 *   ③ 本项目开发机 GitHub 直连不可达（000）、走代理才通（200）→ 下载失败是**常态**而非异常，
 *      所以"失败时给不给出补救指引"必须被钉住（不能静默失败）。
 *   ④ 平台差异：macOS 官方不发预编译包 → 必须明确返回 null（而非给个假 URL）。
 *
 * 运行：npx vitest run test/whisper-runtime.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  pickNightlyTag,
  buildAssetName,
  buildModelUrls,
  modelFileName,
  WHISPER_MODELS,
  DEFAULT_WHISPER_MODEL,
  installDir,
  modelsDir,
  findBinIn,
  findModelIn,
} from '../src/mcp/whisper-runtime.js';

describe('pickNightlyTag —— 从 releases 列表取最新 nightly', () => {
  it('★ 取第一个形如 b<数字> 且有资产的 tag', () => {
    const releases = [
      { tag_name: 'v1.9.5', assets: [] },                 // 正式版零资产（实测）
      { tag_name: 'b5454', assets: [{}, {}] },            // nightly（实测有 12 个）
      { tag_name: 'b5453', assets: [{}] },
    ];
    expect(pickNightlyTag(releases)).toBe('b5454');
  });

  it('★ 正式版（v 开头）绝不选中 —— 即使排在前面且带资产', () => {
    const releases = [
      { tag_name: 'v1.9.5', assets: [{}, {}] },
      { tag_name: 'b100', assets: [{}] },
    ];
    expect(pickNightlyTag(releases)).toBe('b100');
  });

  it('★ nightly tag 但零资产 → 跳过（空壳 release 不能用）', () => {
    const releases = [
      { tag_name: 'b5454', assets: [] },
      { tag_name: 'b5453', assets: [{}] },
    ];
    expect(pickNightlyTag(releases)).toBe('b5453');
  });

  it('全无可用 → null（上层据此给"手动放置"指引）', () => {
    expect(pickNightlyTag([{ tag_name: 'v1.9.5', assets: [] }])).toBeNull();
    expect(pickNightlyTag([])).toBeNull();
    expect(pickNightlyTag(null)).toBeNull();
    expect(pickNightlyTag(undefined)).toBeNull();
  });
});

describe('buildAssetName —— 平台 → 实测资产名', () => {
  it('win32 x64 → whisper-bin-x64.zip（实测 8MB，默认选它）', () => {
    expect(buildAssetName('win32', 'x64')).toEqual({ asset: 'whisper-bin-x64.zip', archive: 'zip' });
  });

  it('win32 arm64 → CPU arm64 包（不是 CUDA）', () => {
    expect(buildAssetName('win32', 'arm64')).toEqual({ asset: 'whisper-bin-win-cpu-arm64.zip', archive: 'zip' });
  });

  it('linux → ubuntu tar.gz（按架构分派）', () => {
    expect(buildAssetName('linux', 'x64')).toEqual({ asset: 'whisper-bin-ubuntu-x64.tar.gz', archive: 'targz' });
    expect(buildAssetName('linux', 'arm64')).toEqual({ asset: 'whisper-bin-ubuntu-arm64.tar.gz', archive: 'targz' });
  });

  it('★ darwin → null（官方不发预编译包，不能给假 URL）', () => {
    expect(buildAssetName('darwin', 'arm64')).toBeNull();
    expect(buildAssetName('darwin', 'x64')).toBeNull();
  });
});

describe('模型', () => {
  it('默认 small（用户拍板：中文场景）', () => {
    expect(DEFAULT_WHISPER_MODEL).toBe('small');
  });

  it('三档齐全且体积递增（给用户明确预期）', () => {
    expect(Object.keys(WHISPER_MODELS).sort()).toEqual(['base', 'medium', 'small']);
    expect(WHISPER_MODELS.base.sizeMB).toBeLessThan(WHISPER_MODELS.small.sizeMB);
    expect(WHISPER_MODELS.small.sizeMB).toBeLessThan(WHISPER_MODELS.medium.sizeMB);
  });

  it('文件名形态 ggml-<model>.bin', () => {
    expect(modelFileName('small')).toBe('ggml-small.bin');
  });

  it('★ 模型源按实测可达性排序：ModelScope 优先（实测国内直连 200，HF 系 000）', () => {
    const u = buildModelUrls('small');
    // primary 必须是 ModelScope（实测唯一直连可用的源）
    expect(u.primary).toContain('modelscope.cn');
    expect(u.primary).toContain('ggml-small.bin');
    // 后备源要齐（HF 官方 + 镜像），但**不能**排在 primary 之前
    expect(u.mirror).toContain('hf-mirror.com');
    expect(u.mirror).toContain('ggml-small.bin');
    expect(u.all.map((c) => c.url)).toContain(u.primary);
    expect(u.all.length).toBeGreaterThanOrEqual(3);
    expect(u.all[0].url).toBe(u.primary);
    // 每个候选都要带 label（报错时给用户可读的选择）
    for (const c of u.all) expect(c.label.length).toBeGreaterThan(0);
  });
});

describe('目录解析（与 ffmpeg-runtime 同构）', () => {
  it('安装目录与模型目录同根（便于用户一次性放置）', () => {
    expect(modelsDir().startsWith(installDir())).toBe(true);
    expect(modelsDir()).toContain('models');
  });

  it('目录解析不得退到仓库外（ffmpeg-runtime 踩过的坑）', () => {
    const d = installDir();
    expect(d).toContain('whisper');
    expect(d).not.toBe(path_sep_root());
  });

  it('findBinIn / findModelIn 对不存在的目录返回 null（不抛）', () => {
    expect(findBinIn('Z:/__nope__')).toBeNull();
    expect(findModelIn('Z:/__nope__', 'small')).toBeNull();
  });
});

function path_sep_root(): string {
  // 仓库根不该是 installDir 的返回值（那意味着路径推导退到了仓库外）
  return process.platform === 'win32' ? 'C:\\' : '/';
}