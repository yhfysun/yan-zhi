/**
 * 语音包下载源单测：钉住「国内源优先 + 文件清单自洽 + onnx 改名」这三件容易回归的事。
 *
 * 背景：原先只有 GitHub release + 4 个 gh 代理，实测在本机（无代理）全部不可用；
 * 且 release 里的模型文件叫 vits-aishell3.onnx / theresa.onnx，旧白名单只认 model.onnx，
 * 导致「下载解压都成功却报缺少 model.onnx」。这些用例防止两者被改回去。
 */
import { describe, it, expect } from 'vitest';
import {
  TTS_PACKS, MS_REPOS, PACK_FILES, msFileUrl, msFileUrls, localNameFor, isRequiredFile,
} from '../src/services/tts-packs';

describe('msFileUrl · ModelScope 下载地址', () => {
  it('按 models/<repo>/resolve/master/<path> 拼', () => {
    expect(msFileUrl('owner/repo', 'model.onnx'))
      .toBe('https://www.modelscope.cn/models/owner/repo/resolve/master/model.onnx');
  });

  it('路径段做百分号编码（词典子目录也安全）', () => {
    expect(msFileUrl('o/r', 'dict/pos dict')).toContain('dict/pos%20dict');
  });
});

describe('msFileUrls · 每个包的国内源顺序', () => {
  it('aishell3 有两个仓库，第一个是 jianbing181（实测有全套文件）', () => {
    const urls = msFileUrls('vits-zh-aishell3', 'model.onnx');
    expect(urls.length).toBe(2);
    expect(urls[0]).toContain('jianbing181/tts-vits-icefall-zh-aishell3');
  });

  it('全部仓库都在 modelscope.cn 国内站上', () => {
    for (const id of Object.keys(MS_REPOS)) {
      for (const u of msFileUrls(id, 'model.onnx')) expect(u).toContain('modelscope.cn/models/');
    }
  });

  it('未知包返回空数组（不抛错）', () => {
    expect(msFileUrls('no-such-pack', 'model.onnx')).toEqual([]);
  });
});

describe('PACK_FILES · 清单自洽（每个可下载包都齐全）', () => {
  it('每个包都有国内仓库与文件清单', () => {
    for (const p of TTS_PACKS) {
      expect(MS_REPOS[p.id]?.length, `${p.id} 缺 ModelScope 仓库`).toBeGreaterThan(0);
      expect(PACK_FILES[p.id]?.length, `${p.id} 缺文件清单`).toBeGreaterThan(0);
    }
  });

  it('每个包落在本地的都是 model.onnx + tokens.txt + lexicon.txt', () => {
    for (const p of TTS_PACKS) {
      const locals = (PACK_FILES[p.id] ?? []).map((f) => f.local);
      for (const need of ['model.onnx', 'tokens.txt', 'lexicon.txt']) {
        expect(locals, `${p.id} 缺 ${need}`).toContain(need);
      }
    }
  });

  it('required 的 onnx 体积下限足够挡住「下到了错误页」', () => {
    for (const p of TTS_PACKS) {
      const onnx = (PACK_FILES[p.id] ?? []).find((f) => f.local === 'model.onnx' && f.required);
      expect(onnx, `${p.id} 缺必需 onnx`).toBeTruthy();
      expect(onnx!.minBytes).toBeGreaterThan(10 * 1048576);
    }
  });
});

describe('localNameFor · release 里的 onnx 改名', () => {
  it('vits-aishell3.onnx / theresa.onnx 都落成 model.onnx', () => {
    expect(localNameFor('vits-aishell3.onnx')).toBe('model.onnx');
    expect(localNameFor('theresa.onnx')).toBe('model.onnx');
  });

  it('标准名保持原样（含 fp16 变体）', () => {
    expect(localNameFor('model.onnx')).toBe('model.onnx');
    expect(localNameFor('model.fp16.onnx')).toBe('model.fp16.onnx');
  });

  it('非 onnx 文件不改名', () => {
    expect(localNameFor('tokens.txt')).toBe('tokens.txt');
    expect(localNameFor('lexicon.txt')).toBe('lexicon.txt');
  });
});

describe('isRequiredFile · 任意 .onnx 都算必需', () => {
  it('非标准命名的 onnx 也纳入（否则解压后一个文件都搬不过去）', () => {
    expect(isRequiredFile('vits-aishell3.onnx')).toBe(true);
    expect(isRequiredFile('theresa.onnx')).toBe(true);
  });

  it('rule.far 仍然排除（172MB 的可选规则包）', () => {
    expect(isRequiredFile('rule.far')).toBe(false);
  });
});
