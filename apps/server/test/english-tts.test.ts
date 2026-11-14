import { describe, expect, it } from 'vitest';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEARNING_EDGE_VOICE,
  LEARNING_TTS_SPEEDS,
  normalizeEnglishTtsText,
  normalizeLearningTtsSpeed,
  resolveBundledEdgeTts,
  resolveBundledPython,
  synthesizeBundledEnglishEdge,
  type BundledEdgeRunner,
} from '../src/learning/english-tts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..', '..');
const BUNDLED_EDGE = path.join(REPO_ROOT, 'apps', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe');
const BUNDLED_PY = path.join(REPO_ROOT, 'apps', 'desktop', 'resources', 'python', 'python.exe');

/**
 * 造一个假的 monorepo 目录结构（<root>/apps/server + <root>/apps/desktop/resources/python/...），
 * 让"dev 从 apps/server 向上推导 desktop 资源"的用例**不依赖本机是否真的生成过 python 运行时**
 * （工作区可能只烤了部分依赖，Scripts/edge-tts.exe 并不总在 —— 路径推导测试只该测推导）。
 */
async function withFakeRepo(fn: (serverDir: string, desktopRes: string) => Promise<void>): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  const root = path.join(tmpdir(), `yz-edge-tts-repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const serverDir = path.join(root, 'apps', 'server');
  const desktopRes = path.join(root, 'apps', 'desktop', 'resources', 'python');
  await mkdir(path.join(desktopRes, 'Scripts'), { recursive: true });
  await writeFile(path.join(desktopRes, 'Scripts', 'edge-tts.exe'), 'stub');
  await writeFile(path.join(desktopRes, 'python.exe'), 'stub');
  try {
    await fn(serverDir, desktopRes);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  }
}

/** 造一个"合成成功"的 runner：把目标文件写出非空内容并记录调用。 */
function okRunner(outFile: string, calls: Array<{ exe: string; args: string[] }>): BundledEdgeRunner {
  return async (exe, args) => {
    calls.push({ exe, args });
    await writeFile(outFile, 'fake-mp3-bytes');
  };
}

async function withTempOutFile(fn: (outFile: string) => Promise<void>): Promise<void> {
  const outFile = path.join(tmpdir(), `yz-edge-tts-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
  try {
    await fn(outFile);
  } finally {
    try { await unlink(outFile); } catch { /* 不存在则忽略 */ }
  }
}

describe('朗读文本规范化（2026-11-14 用户实测：句首 A 被读字母名、词表连读飞快）', () => {
  it('冠词 A/a 一律按 /ə/ 处理（uh），不读字母名 /eɪ/', () => {
    expect(normalizeEnglishTtsText('A cat sat on a red mat.')).toBe('Uh cat sat on uh red mat.');
  });

  it('词表分隔符 · → 逗号停顿，不再整串连读', () => {
    expect(normalizeEnglishTtsText('cat · bed · sit · hot · cup')).toBe('cat, bed, sit, hot, cup');
  });

  it('不误伤含 a 的单词与其它标点', () => {
    expect(normalizeEnglishTtsText('A cat and a hat about a.m.')).toBe('Uh cat and uh hat about a.m.');
  });
});

describe('英语课程随包在线语音', () => {
  it('默认使用稳定的美式英文音色', () => {
    expect(LEARNING_EDGE_VOICE).toBe('en-US-JennyNeural');
  });

  it('打包环境可以通过显式路径找到随包 edge-tts', async () => {
    // 不依赖本机是否真的生成过 python 运行时（Scripts/edge-tts.exe 并不总在）
    await withFakeRepo(async (_serverDir, desktopRes) => {
      const exe = path.join(desktopRes, 'Scripts', 'edge-tts.exe');
      expect(resolveBundledEdgeTts({ YZ_BUNDLED_EDGE_TTS: exe }, TEST_DIR, '')).toBe(exe);
    });
  });

  it('开发环境可以从 apps/server 推导 apps/desktop 随包 Python', async () => {
    await withFakeRepo(async (serverDir, desktopRes) => {
      expect(resolveBundledEdgeTts({}, serverDir, '')).toBe(path.join(desktopRes, 'Scripts', 'edge-tts.exe'));
    });
  });

  it('找不到 CLI 时返回 null，交给上层显示明确错误', () => {
    expect(resolveBundledEdgeTts({ YZ_BUNDLED_EDGE_TTS: path.join(TEST_DIR, 'missing.exe') }, TEST_DIR, '')).toBeNull();
  });
});

describe('随包 Python 解释器解析（launcher 死路径治理 2026-11-13）', () => {
  it('打包环境可以通过显式路径找到随包 python.exe', () => {
    expect(resolveBundledPython({ YZ_BUNDLED_PYTHON: BUNDLED_PY }, TEST_DIR, '')).toBe(BUNDLED_PY);
  });

  it('开发环境可以从 apps/server 推导 apps/desktop 随包 python.exe', async () => {
    await withFakeRepo(async (serverDir, desktopRes) => {
      expect(resolveBundledPython({}, serverDir, '')).toBe(path.join(desktopRes, 'python.exe'));
    });
  });

  it('显式路径不存在时返回 null（不猜不兜）', () => {
    expect(resolveBundledPython({ YZ_BUNDLED_PYTHON: path.join(TEST_DIR, 'missing-python.exe') }, TEST_DIR, '')).toBeNull();
  });
});

describe('synthesizeBundledEnglishEdge 执行顺序（python -m 优先，exe 仅构建机兜底）', () => {
  it('python 可用时走 python -m edge_tts，绝不调用 launcher exe', async () => {
    await withTempOutFile(async (outFile) => {
      const calls: Array<{ exe: string; args: string[] }> = [];
      const result = await synthesizeBundledEnglishEdge({
        text: 'cat',
        outFile,
        exePath: BUNDLED_EDGE,
        pythonPath: BUNDLED_PY,
        run: okRunner(outFile, calls),
      });
      expect(result).toEqual({ file: outFile, bytes: 'fake-mp3-bytes'.length, voice: LEARNING_EDGE_VOICE });
      expect(calls).toHaveLength(1);
      expect(calls[0].exe).toBe(BUNDLED_PY);
      expect(calls[0].args.slice(0, 2)).toEqual(['-m', 'edge_tts']);
      expect(calls[0].args).toContain('--write-media');
      expect(calls[0].args).toContain(outFile);
    });
  });

  it('python 不可用时回退 exe（显式路径）', async () => {
    await withTempOutFile(async (outFile) => {
      const calls: Array<{ exe: string; args: string[] }> = [];
      const result = await synthesizeBundledEnglishEdge({
        text: 'cat',
        outFile,
        exePath: BUNDLED_EDGE,
        pythonPath: null,
        run: okRunner(outFile, calls),
      });
      expect(result).not.toBeNull();
      expect(calls).toHaveLength(1);
      expect(calls[0].exe).toBe(BUNDLED_EDGE);
      expect(calls[0].args[0]).toBe('--voice');
    });
  });

  it('python -m 失败时自动回退 exe（两条路径参数形态一致）', async () => {
    await withTempOutFile(async (outFile) => {
      const calls: Array<{ exe: string; args: string[] }> = [];
      let n = 0;
      const run: BundledEdgeRunner = async (exe, args) => {
        calls.push({ exe, args });
        n += 1;
        if (n === 1) throw new Error('python -m 失败');
        await writeFile(outFile, 'fallback-bytes');
      };
      const result = await synthesizeBundledEnglishEdge({
        text: 'cat',
        outFile,
        exePath: BUNDLED_EDGE,
        pythonPath: BUNDLED_PY,
        run,
      });
      expect(result).toEqual({ file: outFile, bytes: 'fallback-bytes'.length, voice: LEARNING_EDGE_VOICE });
      expect(calls.map((c) => c.exe)).toEqual([BUNDLED_PY, BUNDLED_EDGE]);
      // 两条路径的合成参数必须完全一致（除 python -m 前缀），避免口径漂移
      const pyArgs = calls[0].args.slice(2);
      expect(pyArgs).toEqual(calls[1].args);
    });
  });

  it('python 与 exe 都失败时返回 null，交给上层 409 提示', async () => {
    await withTempOutFile(async (outFile) => {
      const run: BundledEdgeRunner = async () => { throw new Error('network down'); };
      const result = await synthesizeBundledEnglishEdge({
        text: 'cat',
        outFile,
        exePath: path.join(TEST_DIR, 'missing.exe'),
        pythonPath: path.join(TEST_DIR, 'missing-python.exe'),
        run,
      });
      expect(result).toBeNull();
    });
  });
});

describe('朗读语速档位（2026-11-14 用户实测：例句读得太快）', () => {
  it('normalize：非法值一律回退 normal，slow / fast 透传', () => {
    expect(normalizeLearningTtsSpeed(undefined)).toBe('normal');
    expect(normalizeLearningTtsSpeed(null)).toBe('normal');
    expect(normalizeLearningTtsSpeed('bogus')).toBe('normal');
    expect(normalizeLearningTtsSpeed(1)).toBe('normal');
    expect(normalizeLearningTtsSpeed('slow')).toBe('slow');
    expect(normalizeLearningTtsSpeed('fast')).toBe('fast');
  });

  it('三档全部 ≤ 原生语速：学习场景不需要比原生快，默认档比原生慢', () => {
    expect(LEARNING_TTS_SPEEDS.fast.sapi).toBe(0);
    expect(LEARNING_TTS_SPEEDS.fast.edge).toBe('0%');
    expect(LEARNING_TTS_SPEEDS.normal.sapi).toBeLessThan(0);
    expect(LEARNING_TTS_SPEEDS.slow.sapi).toBeLessThan(LEARNING_TTS_SPEEDS.normal.sapi);
  });

  it('edge-tts 参数随档位变化：默认 -12%，slow -30%，fast 0%', async () => {
    for (const [speed, expectedRate] of [['slow', '--rate=-30%'], ['normal', '--rate=-12%'], ['fast', '--rate=0%']] as const) {
      await withTempOutFile(async (outFile) => {
        const calls: Array<{ exe: string; args: string[] }> = [];
        const result = await synthesizeBundledEnglishEdge({
          text: 'cat',
          outFile,
          exePath: BUNDLED_EDGE,
          pythonPath: BUNDLED_PY,
          speed,
          run: okRunner(outFile, calls),
        });
        expect(result).not.toBeNull();
        expect(calls[0].args).toContain(expectedRate);
      });
    }
  });

  it('不传 speed 时保持默认档（-12%），两条执行路径参数形态一致', async () => {
    await withTempOutFile(async (outFile) => {
      const calls: Array<{ exe: string; args: string[] }> = [];
      let n = 0;
      const run: BundledEdgeRunner = async (exe, args) => {
        calls.push({ exe, args });
        n += 1;
        if (n === 1) throw new Error('python -m 失败');
        await writeFile(outFile, 'fallback-bytes');
      };
      const result = await synthesizeBundledEnglishEdge({
        text: 'cat',
        outFile,
        exePath: BUNDLED_EDGE,
        pythonPath: BUNDLED_PY,
        run,
      });
      expect(result).not.toBeNull();
      expect(calls[0].args).toContain('--rate=-12%');
      expect(calls[0].args.slice(2)).toEqual(calls[1].args);
    });
  });
});
