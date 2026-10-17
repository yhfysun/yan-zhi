// python 工具链自愈（server）：代理探测 + 修复计划（2026-10-14）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withProxyScheme, planRepair, detectHttpProxy } from '../src/services/python-self-heal.js';

describe('withProxyScheme', () => {
  it('缺 scheme → 补 http://（本机 pip ProxyError 的根因）', () => {
    expect(withProxyScheme('127.0.0.1:7890')).toBe('http://127.0.0.1:7890');
    expect(withProxyScheme(' 127.0.0.1:7890 ')).toBe('http://127.0.0.1:7890');
  });
  it('已有 scheme → 原样', () => {
    expect(withProxyScheme('http://127.0.0.1:7890')).toBe('http://127.0.0.1:7890');
    expect(withProxyScheme('socks5://127.0.0.1:1080')).toBe('socks5://127.0.0.1:1080');
  });
});

describe('planRepair', () => {
  it('缺依赖 → 装该模块', () => {
    expect(planRepair({ kind: 'missing-module', module: 'edge_tts' })?.pipArgs).toEqual(['install', 'edge_tts']);
  });
  it('模块名 → pip 包名别名（PIL 是 2010 年占位假包，必须装 pillow）', () => {
    expect(planRepair({ kind: 'missing-module', module: 'PIL' })?.pipArgs).toEqual(['install', 'pillow']);
    expect(planRepair({ kind: 'missing-module', module: 'cv2' })?.pipArgs).toEqual(['install', 'opencv-python']);
    expect(planRepair({ kind: 'missing-module', module: 'yaml' })?.pipArgs).toEqual(['install', 'pyyaml']);
  });
  it('edge-tts 403 → 升级 edge-tts', () => {
    expect(planRepair({ kind: 'edge-tts-403' })?.pipArgs).toEqual(['install', '--upgrade', 'edge-tts']);
  });
  it('缺模块名 / 未支持类型 → null', () => {
    expect(planRepair({ kind: 'missing-module' })).toBeNull();
    expect(planRepair({ kind: 'pip-proxy' })).toBeNull();
  });
});

describe('detectHttpProxy（env 优先）', () => {
  const keys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
  let saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved = {};
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('env 设置时返回带 scheme 的值', () => {
    process.env.HTTPS_PROXY = '127.0.0.1:7890';
    expect(detectHttpProxy()).toBe('http://127.0.0.1:7890');
  });
});