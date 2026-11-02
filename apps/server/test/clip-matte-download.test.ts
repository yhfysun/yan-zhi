/**
 * 智能抠像模型下载（P2-1 追加）—— 源回退 / 校验 / 不覆盖 / 全失败摘要。
 *
 * ★ 全程**不碰真实网络**：下载器与 ONNX 校验都注入 mock，只验证编排逻辑。
 * ★ 模型写盘路径用临时目录，不污染真实模型目录。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MATTE_MODELS, matteSourcesFor, installMatteModel, type MatteModelSpec,
} from '../src/services/clip-matte-runtime';

const baseSpec = (over: Partial<MatteModelSpec> = {}): MatteModelSpec => ({
  id: 'test', label: '测试模型', fileHint: 'test.onnx',
  inputSize: 320, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], channelOrder: 'RGB',
  approxSizeMB: 1,
  sources: [
    { url: 'https://intl.example/test.onnx', label: '官方', region: 'intl' },
    { url: 'https://cn1.example/test.onnx', label: '镜像1', region: 'cn' },
    { url: 'https://cn2.example/test.onnx', label: '镜像2', region: 'cn' },
  ],
  license: '测试许可',
  ...over,
});

describe('matteSourcesFor · 国内外源顺序', () => {
  const orig = process.env.YZ_MATTE_MIRRORS;
  afterEach(() => {
    if (orig === undefined) delete process.env.YZ_MATTE_MIRRORS; else process.env.YZ_MATTE_MIRRORS = orig;
  });

  it('u2netp：官方直链在前，第三方镜像在后', () => {
    delete process.env.YZ_MATTE_MIRRORS;
    const s = matteSourcesFor('u2netp');
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0].region).toBe('intl');
    expect(s[0].url).toContain('github.com/danielgatis/rembg');
    expect(s.some((x) => x.region === 'cn')).toBe(true);
  });

  it('RMBG/MODNet 没有核实过的源 → 空数组（只手动放置）', () => {
    delete process.env.YZ_MATTE_MIRRORS;
    expect(MATTE_MODELS.rmbg14.sources).toEqual([]);
    expect(MATTE_MODELS.modnet.sources).toEqual([]);
  });

  it('YZ_MATTE_MIRRORS 前缀插在内置镜像之前；none=覆盖内置镜像', () => {
    process.env.YZ_MATTE_MIRRORS = 'https://m1.example/, https://m2.example/';
    const s = matteSourcesFor('u2netp');
    expect(s[0].region).toBe('intl');
    expect(s[1].url.startsWith('https://m1.example/')).toBe(true);
    expect(s[2].url.startsWith('https://m2.example/')).toBe(true);
    const m1Idx = s.findIndex((x) => x.url.startsWith('https://m1.example/'));
    const builtinIdx = s.findIndex((x) => x.url.includes('ghfast.top'));
    expect(m1Idx).toBeGreaterThan(-1);
    expect(builtinIdx).toBeGreaterThan(m1Idx);

    process.env.YZ_MATTE_MIRRORS = 'none';
    expect(matteSourcesFor('u2netp').every((x) => x.region === 'intl')).toBe(true);
  });
});

describe('installMatteModel · 源回退与校验', () => {
  let tmp = '';
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-matte-install-')); });
  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('前两个源失败、第三个成功 → 原子落盘并报告 sourceUsed', async () => {
    const tried: string[] = [];
    const spec = baseSpec();
    const r = await installMatteModel('test', {
      spec, modelDir: tmp, verifyOnnx: async () => ({ ok: true }),
      download: async (url, dest) => {
        tried.push(url);
        if (url.includes('intl') || url.includes('cn1')) return { ok: false, error: 'mock 网络错误' };
        fs.writeFileSync(dest, 'onnx-bytes');
        return { ok: true, bytes: 9 };
      },
    });
    expect(r.ok).toBe(true);
    expect(r.sourceUsed).toBe('https://cn2.example/test.onnx');
    expect(r.attempts?.map((a) => a.source.url)).toEqual([
      'https://intl.example/test.onnx', 'https://cn1.example/test.onnx',
    ]);
    expect(tried).toEqual(spec.sources.map((s) => s.url));
    expect(fs.readFileSync(path.join(tmp, 'test.onnx'), 'utf8')).toBe('onnx-bytes');
    expect(fs.existsSync(path.join(tmp, 'test.onnx.download'))).toBe(false);
  });

  it('文件大小不符 → 该源失败（不会把半截文件当模型）', async () => {
    const spec = baseSpec({ sizeBytes: 100 });
    const r = await installMatteModel('test', {
      spec, modelDir: tmp, verifyOnnx: async () => ({ ok: true }),
      download: async (_url, dest) => { fs.writeFileSync(dest, 'short'); return { ok: true, bytes: 5 }; },
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(3);
    expect(r.error).toContain('大小不符');
    expect(fs.existsSync(path.join(tmp, 'test.onnx'))).toBe(false);
  });

  it('sha256 不符 → 该源失败', async () => {
    const spec = baseSpec({ sha256: 'deadbeef' });
    const r = await installMatteModel('test', {
      spec, modelDir: tmp, verifyOnnx: async () => ({ ok: true }),
      download: async (_url, dest) => { fs.writeFileSync(dest, 'wrong-bytes'); return { ok: true, bytes: 11 }; },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('sha256');
    expect(fs.existsSync(path.join(tmp, 'test.onnx'))).toBe(false);
  });

  it('ONNX 校验失败 → 该源失败（不落盘）', async () => {
    const spec = baseSpec({ sources: [{ url: 'https://x.example/test.onnx', label: 'x', region: 'intl' }] });
    const r = await installMatteModel('test', {
      spec, modelDir: tmp, verifyOnnx: async () => ({ ok: false, error: '不是有效 ONNX' }),
      download: async (_url, dest) => { fs.writeFileSync(dest, 'html'); return { ok: true, bytes: 4 }; },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('不是有效 ONNX');
    expect(fs.existsSync(path.join(tmp, 'test.onnx'))).toBe(false);
  });

  it('已存在有效模型 → 不覆盖、不发起下载', async () => {
    fs.writeFileSync(path.join(tmp, 'test.onnx'), 'keep-me');
    let called = 0;
    const r = await installMatteModel('test', {
      spec: baseSpec(), modelDir: tmp,
      download: async () => { called += 1; return { ok: true, bytes: 1 }; },
      verifyOnnx: async () => ({ ok: true }),
    });
    expect(r.ok).toBe(true);
    expect(r.alreadyInstalled).toBe(true);
    expect(called).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'test.onnx'), 'utf8')).toBe('keep-me');
  });

  it('force=true → 允许覆盖', async () => {
    fs.writeFileSync(path.join(tmp, 'test.onnx'), 'old');
    const r = await installMatteModel('test', {
      spec: baseSpec({ sources: [{ url: 'https://x/y.onnx', label: 'x', region: 'intl' }] }),
      modelDir: tmp, force: true, verifyOnnx: async () => ({ ok: true }),
      download: async (_url, dest) => { fs.writeFileSync(dest, 'new'); return { ok: true, bytes: 3 }; },
    });
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'test.onnx'), 'utf8')).toBe('new');
  });

  it('全部失败 → 返回各源摘要与手动放置路径', async () => {
    const spec = baseSpec();
    const r = await installMatteModel('test', {
      spec, modelDir: tmp, verifyOnnx: async () => ({ ok: true }),
      download: async (url) => ({ ok: false, error: `连不上 ${url}` }),
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(3);
    expect(r.error).toContain('全部下载源均失败（3 个）');
    expect(r.error).toContain('镜像1');
    expect(r.manualPath).toBe(path.join(tmp, 'test.onnx'));
    expect(r.guidance?.join('\n')).toContain('手动放置');
    expect(fs.existsSync(path.join(tmp, 'test.onnx'))).toBe(false);
  });
});
