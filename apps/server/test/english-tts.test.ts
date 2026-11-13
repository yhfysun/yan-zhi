import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEARNING_EDGE_VOICE, resolveBundledEdgeTts } from '../src/learning/english-tts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..', '..');
const BUNDLED_EDGE = path.join(REPO_ROOT, 'apps', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe');

describe('英语课程随包在线语音', () => {
  it('默认使用稳定的美式英文音色', () => {
    expect(LEARNING_EDGE_VOICE).toBe('en-US-JennyNeural');
  });

  it('打包环境可以通过显式路径找到随包 edge-tts', () => {
    expect(resolveBundledEdgeTts({ YZ_BUNDLED_EDGE_TTS: BUNDLED_EDGE }, TEST_DIR, '')).toBe(BUNDLED_EDGE);
  });

  it('开发环境可以从 apps/server 推导 apps/desktop 随包 Python', () => {
    expect(resolveBundledEdgeTts({}, path.join(REPO_ROOT, 'apps', 'server'), '')).toBe(BUNDLED_EDGE);
  });

  it('找不到 CLI 时返回 null，交给上层显示明确错误', () => {
    expect(resolveBundledEdgeTts({ YZ_BUNDLED_EDGE_TTS: path.join(TEST_DIR, 'missing.exe') }, TEST_DIR, '')).toBeNull();
  });
});
