// python 工具链失败分类 + 自愈钩子（2026-10-14）。
import { describe, it, expect } from 'vitest';
import { classifyPythonFailure, setPythonRepairer, getPythonRepairer } from './python-repair';

describe('classifyPythonFailure', () => {
  it('edge-tts 403 → edge-tts-403（优先于同一 stderr 里的代理字样）', () => {
    const stderr =
      'HTTPS proxies https://127.0.0.1:7890 are not supported, ignoring\n' +
      "[tts] seg 失败(第1次): WSServerHandshakeError: 403, message='Invalid response status', " +
      "url='wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'\n" +
      'edge-tts 连续 3 次失败';
    expect(classifyPythonFailure(stderr)).toEqual({ kind: 'edge-tts-403' });
  });

  it('No module named → missing-module + 模块名（去子模块）', () => {
    expect(classifyPythonFailure("ModuleNotFoundError: No module named 'edge_tts'")).toEqual({
      kind: 'missing-module',
      module: 'edge_tts',
    });
    expect(classifyPythonFailure('No module named cv2.cv2')).toEqual({ kind: 'missing-module', module: 'cv2' });
  });

  it('pip 代理错误 → pip-proxy', () => {
    expect(
      classifyPythonFailure("ProxyError('Cannot connect to proxy.', FileNotFoundError(2, 'No such file or directory'))"),
    ).toEqual({ kind: 'pip-proxy' });
  });

  it('普通错误 / 空 → null', () => {
    expect(classifyPythonFailure('some random error')).toBeNull();
    expect(classifyPythonFailure('')).toBeNull();
  });
});

describe('repairer 钩子', () => {
  it('set/get 生效，可清空', () => {
    const fn = async () => ({ repaired: true });
    setPythonRepairer(fn);
    expect(getPythonRepairer()).toBe(fn);
    setPythonRepairer(null);
    expect(getPythonRepairer()).toBeNull();
  });
});