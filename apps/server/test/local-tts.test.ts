/**
 * 本地语音（sherpa-onnx）单测。
 *
 * 真实推理需要 22MB 原生二进制 + 31MB 模型，不适合单测；那部分靠冒烟脚本验证（已实测通过：
 * 6 角色 → 6 个不同说话人、单条合成 0.15~0.7s、8000Hz WAV）。
 * 这里钉住的是「错了一定会出问题」的纯逻辑。
 */
import { describe, it, expect } from 'vitest';
import { pcmToWav, parseLocalVoice, pickSpeakerForRole, normalizeForTts, platformPackage, packageUrls, AISHELL3_SPEAKERS, AISHELL3_ROLE_MAP } from '../src/mcp/sherpa-tts';
import { isRequiredFile, mirrorUrls } from '../src/services/tts-packs';

describe('pcmToWav · PCM 转 WAV', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = pcmToWav(samples, 8000);

  it('生成合法 RIFF/WAVE 头', () => {
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.subarray(12, 16).toString()).toBe('fmt ');
    expect(wav.subarray(36, 40).toString()).toBe('data');
  });

  it('采样率/声道/位深正确（16-bit 单声道）', () => {
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
  });

  it('文件长度 = 44 头 + 样本数 × 2', () => {
    expect(wav.length).toBe(44 + samples.length * 2);
  });

  it('幅度被夹在 [-1,1] 不溢出（输入 2.0 不应变成噪声）', () => {
    const w = pcmToWav(new Float32Array([2, -2]), 8000);
    expect(w.readInt16LE(44)).toBe(32767);
    expect(w.readInt16LE(46)).toBe(-32767);
  });
});

describe('normalizeForTts · 数字转汉字（lexicon 不认阿拉伯数字）', () => {
  it('阿拉伯数字逐位转汉字', () => {
    expect(normalizeForTts('编号88')).toBe('编号八八');
    expect(normalizeForTts('第3集')).toBe('第三集');
  });

  it('无数字时原样返回', () => {
    expect(normalizeForTts('你好世界')).toBe('你好世界');
  });

  it('空输入安全', () => {
    expect(normalizeForTts('')).toBe('');
  });
});

describe('parseLocalVoice · 音色标识解析', () => {
  it('local:<编号> 形式', () => {
    expect(parseLocalVoice('local:88', '')).toBe(88);
  });

  it('纯数字形式', () => {
    expect(parseLocalVoice('42', '')).toBe(42);
  });

  it('角色名查预置表', () => {
    expect(parseLocalVoice('', '男主')).toBe(AISHELL3_ROLE_MAP['男主']);
    expect(parseLocalVoice('', '女主')).toBe(AISHELL3_ROLE_MAP['女主']);
  });

  it('显式编号优先于角色名', () => {
    expect(parseLocalVoice('local:7', '男主')).toBe(7);
  });

  it('越界编号不生效（回退角色/散列）', () => {
    expect(parseLocalVoice('local:999', '')).toBeNull();
    expect(parseLocalVoice('999', '')).toBeNull();
  });

  it('无法解析返回 null（交给调用方兜底）', () => {
    expect(parseLocalVoice('', '')).toBeNull();
    expect(parseLocalVoice('abc', '未知角色')).toBeNull();
  });
});

describe('pickSpeakerForRole · 角色散列分配', () => {
  it('同角色恒定返回同一编号（保证声音不飘）', () => {
    const a = pickSpeakerForRole('神秘人', new Set());
    const b = pickSpeakerForRole('神秘人', new Set());
    expect(a).toBe(b);
  });

  it('已被占用的编号不重复分配', () => {
    const first = pickSpeakerForRole('角色甲', new Set());
    const second = pickSpeakerForRole('角色乙', new Set([first]));
    expect(second).not.toBe(first);
  });

  it('预置表里的角色直接用预置编号', () => {
    expect(pickSpeakerForRole('男主', new Set())).toBe(AISHELL3_ROLE_MAP['男主']);
  });

  it('编号始终在合法范围内', () => {
    for (const name of ['甲', '乙', '丙', '丁', '戊']) {
      const n = pickSpeakerForRole(name, new Set());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(AISHELL3_SPEAKERS);
    }
  });
});

describe('引擎包名与下载地址', () => {
  it('win32 用 win 前缀（上游刻意改名避 spam 过滤）', () => {
    expect(platformPackage('win32', 'x64')).toBe('sherpa-onnx-win-x64');
  });

  it('darwin/linux 保持原名', () => {
    expect(platformPackage('darwin', 'arm64')).toBe('sherpa-onnx-darwin-arm64');
    expect(platformPackage('linux', 'x64')).toBe('sherpa-onnx-linux-x64');
  });

  it('npm tarball 地址格式正确', () => {
    expect(packageUrls('https://registry.npmmirror.com', 'sherpa-onnx-node', '1.13.8'))
      .toBe('https://registry.npmmirror.com/sherpa-onnx-node/-/sherpa-onnx-node-1.13.8.tgz');
  });
});

describe('isRequiredFile · 必需文件白名单（决定下载体积）', () => {
  it('推理必需文件在列', () => {
    for (const f of ['model.onnx', 'tokens.txt', 'lexicon.txt']) {
      expect(isRequiredFile(f)).toBe(true);
    }
  });

  it('rule.far 被排除（aishell3 里它占 172MB，非必需）', () => {
    expect(isRequiredFile('rule.far')).toBe(false);
  });

  it('未知文件默认排除（白名单语义，不是黑名单）', () => {
    expect(isRequiredFile('some-random.bin')).toBe(false);
  });
});

describe('mirrorUrls · 多源候选（GitHub 时通时不通）', () => {
  it('包含官方源作为最后一个兜底', () => {
    const urls = mirrorUrls('vits-icefall-zh-aishell3.tar.bz2');
    expect(urls[urls.length - 1]).toContain('github.com');
  });

  it('镜像源排在官方之前（优先走加速）', () => {
    const urls = mirrorUrls('x.tar.bz2');
    expect(urls.length).toBeGreaterThan(1);
    // 镜像形如 https://<mirror>/<official-url>，官方源则是裸 github.com/k2-fsa/...
    const officialIdx = urls.findIndex((u) => u.startsWith('https://github.com/'));
    expect(officialIdx).toBe(urls.length - 1);
    // 前面的都应是镜像（以 https:// 开头但不是裸 github.com）
    for (const u of urls.slice(0, officialIdx)) {
      expect(u.startsWith('https://github.com/')).toBe(false);
      expect(u).toContain('github.com/k2-fsa');
    }
  });

  it('每个候选都指向同一个文件名', () => {
    const urls = mirrorUrls('vits-icefall-zh-aishell3.tar.bz2');
    for (const u of urls) expect(u).toContain('vits-icefall-zh-aishell3.tar.bz2');
  });
});