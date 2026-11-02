/**
 * 智能抠像（P2-1）运行时骨架测试。
 *
 * 覆盖：
 *   ① parseMatteSidecar：合法 / 缺字段 / 越界夹取 / 非数字 / 非法 channelOrder / 非对象；
 *   ② resolveMatteRuntime：无模型 → ok:false 且 guidance 含放置目录；env 指向不存在文件 →
 *      可读错误；临时目录放 <id>.onnx 空文件 + 侧车 → ok:true（**不校验模型内容**）；
 *      已知 preset 文件名无侧车 → ok:true；
 *   ③ 脚本 CLI：本机有 python 时跑 --help / 非法参数，断言退出码与 JSON 错误（不加载模型）。
 *
 * ★ 本机没有分割模型，真实推理链路**未端到端验证**；这里一律不伪造推理成功。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMatteSidecar, resolveMatteRuntime, resetMatteRuntimeCache, matteModelDir,
} from '../src/services/clip-matte-runtime.js';

const h = vi.hoisted(() => ({
  runtimeOk: true,
  runtimeStdout: '4.10.0|1.23.2',
  runtimeStderr: '',
}));

vi.mock('@yan-zhi/core', () => ({
  findPython: vi.fn(async () => 'python'),
  getPythonScript: vi.fn(() => null),
  runPythonScript: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 1 })),
}));

vi.mock('../src/services/exec-cmd.js', () => ({
  runCmd: vi.fn(async () => (h.runtimeOk
    ? { ok: true, code: 0, stdout: h.runtimeStdout, stderr: '', error: '', timedOut: false }
    : { ok: false, code: 1, stdout: '', stderr: h.runtimeStderr, error: '', timedOut: false })),
  // 测试里不投递 PATH 探测：候选解释器只有 findPython 返回的一个
  lookupOnPath: vi.fn(async () => null),
}));

// ════════════════════════════════════════════════════════════════════════════
// ① parseMatteSidecar
// ════════════════════════════════════════════════════════════════════════════
describe('parseMatteSidecar · 侧车 JSON 校验/夹取', () => {
  it('合法输入 → 完整 preset', () => {
    const r = parseMatteSidecar({
      id: 'portrait', inputSize: 512, mean: [0.4, 0.5, 0.6], std: [0.1, 0.2, 0.3], channelOrder: 'bgr',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preset.id).toBe('portrait');
    expect(r.preset.inputSize).toBe(512);
    expect(r.preset.mean).toEqual([0.4, 0.5, 0.6]);
    expect(r.preset.std).toEqual([0.1, 0.2, 0.3]);
    expect(r.preset.channelOrder).toBe('BGR');
  });

  it('缺 inputSize / mean / std → 可读错误', () => {
    const noSize = parseMatteSidecar({ mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
    expect(noSize.ok).toBe(false);
    if (!noSize.ok) expect(noSize.error).toContain('inputSize');

    const noMean = parseMatteSidecar({ inputSize: 1024, std: [0.5, 0.5, 0.5] });
    expect(noMean.ok).toBe(false);
    if (!noMean.ok) expect(noMean.error).toContain('mean');

    const noStd = parseMatteSidecar({ inputSize: 1024, mean: [0.5, 0.5, 0.5] });
    expect(noStd.ok).toBe(false);
    if (!noStd.ok) expect(noStd.error).toContain('std');
  });

  it('越界 → 夹取（不是报错）', () => {
    const small = parseMatteSidecar({ inputSize: 10, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
    expect(small.ok).toBe(true);
    if (small.ok) expect(small.preset.inputSize).toBe(64);

    const big = parseMatteSidecar({ inputSize: 99999, mean: [100, -100, 0], std: [0.5, 0.5, 0.5] });
    expect(big.ok).toBe(true);
    if (big.ok) {
      expect(big.preset.inputSize).toBe(4096);
      expect(big.preset.mean).toEqual([10, -10, 0]);
    }
  });

  it('非数字 → 可读错误', () => {
    const badSize = parseMatteSidecar({ inputSize: '1024', mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
    expect(badSize.ok).toBe(false);
    if (!badSize.ok) expect(badSize.error).toContain('inputSize');

    const badMean = parseMatteSidecar({ inputSize: 1024, mean: ['a', 0.5, 0.5], std: [0.5, 0.5, 0.5] });
    expect(badMean.ok).toBe(false);
    if (!badMean.ok) expect(badMean.error).toContain('mean');

    const badStd = parseMatteSidecar({ inputSize: 1024, mean: [0.5, 0.5, 0.5], std: [0.5, null, 0.5] });
    expect(badStd.ok).toBe(false);
    if (!badStd.ok) expect(badStd.error).toContain('std');
  });

  it('非法 channelOrder / 非对象 → 可读错误', () => {
    const badOrder = parseMatteSidecar({ inputSize: 1024, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], channelOrder: 'XYZ' });
    expect(badOrder.ok).toBe(false);
    if (!badOrder.ok) expect(badOrder.error).toContain('channelOrder');

    for (const raw of [null, 42, 'x', [1, 2, 3]]) {
      const r = parseMatteSidecar(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('对象');
    }
  });

  it('mean/std 允许单数字（复制成 3 通道）', () => {
    const r = parseMatteSidecar({ inputSize: 256, mean: 0.5, std: 0.5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preset.mean).toEqual([0.5, 0.5, 0.5]);
      expect(r.preset.std).toEqual([0.5, 0.5, 0.5]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ② resolveMatteRuntime
// ════════════════════════════════════════════════════════════════════════════
describe('resolveMatteRuntime · 运行时解析', () => {
  const origDataDir = process.env.DATA_DIR;
  const origModel = process.env.YZ_MATTE_MODEL;
  let tmp = '';

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'yz-matte-'));
    process.env.DATA_DIR = tmp;
    delete process.env.YZ_MATTE_MODEL;
    h.runtimeOk = true;
    h.runtimeStdout = '4.10.0|1.23.2';
    h.runtimeStderr = '';
    resetMatteRuntimeCache();
  });

  afterEach(() => {
    resetMatteRuntimeCache();
    if (origDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = origDataDir;
    if (origModel === undefined) delete process.env.YZ_MATTE_MODEL; else process.env.YZ_MATTE_MODEL = origModel;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('无模型 → ok:false，guidance 含放置目录', async () => {
    mkdirSync(path.join(tmp, 'matte'), { recursive: true });
    const r = await resolveMatteRuntime();
    expect(r.ok).toBe(false);
    expect(r.python).toBe('python');
    expect(r.onnxruntime).toBe('1.23.2');
    expect(r.guidance.join('\n')).toContain(path.join(tmp, 'matte'));
    expect(r.guidance.join('\n')).toContain('不自动下载');
    expect(r.modelPath).toBe('');
  });

  it('YZ_MATTE_MODEL 指向不存在文件 → 可读错误（不回落目录）', async () => {
    process.env.YZ_MATTE_MODEL = path.join(tmp, 'missing.onnx');
    const r = await resolveMatteRuntime();
    expect(r.ok).toBe(false);
    expect(r.guidance.join('\n')).toContain('YZ_MATTE_MODEL');
    expect(r.guidance.join('\n')).toContain('不存在');
  });

  it('onnxruntime 不可导入 → ok:false 且给安装指引', async () => {
    mkdirSync(path.join(tmp, 'matte'), { recursive: true });
    writeFileSync(path.join(tmp, 'matte', 'u2netp.onnx'), '');
    h.runtimeOk = false;
    h.runtimeStderr = 'ModuleNotFoundError: No module named onnxruntime';
    const r = await resolveMatteRuntime();
    expect(r.ok).toBe(false);
    expect(r.onnxruntime).toBe('');
    expect(r.guidance.join('\n')).toContain('onnxruntime');
  });

  it('任意 <id>.onnx + 同名侧车 → ok:true（不校验模型内容）', async () => {
    const dir = path.join(tmp, 'matte');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'portrait.onnx'), '');
    writeFileSync(path.join(dir, 'portrait.json'), JSON.stringify({
      id: 'portrait', inputSize: 768, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5],
    }));
    const r = await resolveMatteRuntime();
    expect(r.ok).toBe(true);
    expect(r.modelId).toBe('portrait');
    expect(r.modelPath).toBe(path.join(dir, 'portrait.onnx'));
    expect(r.preset?.inputSize).toBe(768);
    expect(r.configPath).toBe(path.join(dir, 'portrait.json'));
  });

  it('已知 preset 文件名无侧车 → ok:true 且用注册表预设', async () => {
    const dir = path.join(tmp, 'matte');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'u2netp.onnx'), '');
    const r = await resolveMatteRuntime();
    expect(r.ok).toBe(true);
    expect(r.modelId).toBe('u2netp');
    expect(r.preset?.inputSize).toBe(320);
    expect(r.configPath).toBeUndefined();
  });

  it('matteModelDir 跟随 DATA_DIR', () => {
    expect(matteModelDir()).toBe(path.join(tmp, 'matte'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ③ 脚本 CLI（本机有 python 才跑；只验证参数/错误，不加载模型）
// ════════════════════════════════════════════════════════════════════════════
function detectPython(): string | null {
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 15000 });
    if (r.status === 0) return cmd;
  }
  return null;
}

const PY = detectPython();
const here = path.dirname(fileURLToPath(import.meta.url));
const MATTE_SCRIPT = path.resolve(
  here, '../../../packages/core/src/tool/builtin/python-scripts/clip_matte/portrait_mask.py',
);

function lastJsonLine(stdout: string): Record<string, unknown> {
  const last = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}';
  return JSON.parse(last) as Record<string, unknown>;
}

describe.skipIf(!PY)('portrait_mask.py · 参数契约（不加载模型）', () => {
  it('--help → 退出码 0 且列出关键参数', () => {
    const r = spawnSync(PY!, ['-I', MATTE_SCRIPT, '--help'], { encoding: 'utf8', timeout: 30000 });
    expect(r.status, r.stderr).toBe(0);
    const out = String(r.stdout || '');
    for (const flag of ['--input', '--out', '--model', '--preset', '--config', '--fps']) {
      expect(out).toContain(flag);
    }
  });

  it('缺 --preset/--config → JSON 错误 + 退出码 2', () => {
    const r = spawnSync(PY!, ['-I', MATTE_SCRIPT, '--input', 'x.mp4', '--out', 'y.mp4', '--model', 'z.onnx'], {
      encoding: 'utf8', timeout: 30000,
    });
    expect(r.status).toBe(2);
    const j = lastJsonLine(r.stdout);
    expect(j.ok).toBe(false);
    expect(String(j.error)).toContain('preset');
  });

  it('同时给 --preset 与 --config → JSON 错误 + 退出码 2', () => {
    const r = spawnSync(PY!, [
      '-I', MATTE_SCRIPT, '--input', 'x.mp4', '--out', 'y.mp4', '--model', 'z.onnx',
      '--preset', 'u2netp', '--config', 'c.json',
    ], { encoding: 'utf8', timeout: 30000 });
    expect(r.status).toBe(2);
    const j = lastJsonLine(r.stdout);
    expect(j.ok).toBe(false);
    expect(String(j.error)).toContain('preset');
  });

  it('未知 preset → JSON 错误 + 退出码 2（未走到模型加载）', () => {
    const r = spawnSync(PY!, [
      '-I', MATTE_SCRIPT, '--input', 'x.mp4', '--out', 'y.mp4', '--model', 'z.onnx', '--preset', 'nope',
    ], { encoding: 'utf8', timeout: 30000 });
    expect(r.status).toBe(2);
    const j = lastJsonLine(r.stdout);
    expect(j.ok).toBe(false);
    expect(String(j.error)).toContain('未知 preset');
  });
});
