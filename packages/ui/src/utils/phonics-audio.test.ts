// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeIpa, phonicsAudioSrc, phonicsAudioTable } from './phonics-audio';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
/** 音频实际随包位置：vite publicDir = apps/web/public → dist → 打包版根 */
const AUDIO_DIR = path.resolve(TEST_DIR, '..', '..', '..', '..', 'apps', 'web', 'public', 'phonics-audio');

describe('音标本音映射（phonics-audio）', () => {
  it('★ 易错对应关系按上游映射文档钉死（sound_i 是 /iː/、sound_long_e 是 /ɜː/，与文件名直觉相反）', () => {
    const table = phonicsAudioTable();
    expect(table['iː']).toBe('sound_i.mp3');
    expect(table['ɪ']).toBe('sound_short_i.mp3');
    expect(table['ɜː']).toBe('sound_long_e.mp3');
    expect(table['e']).toBe('sound_e.mp3');
    expect(table['ʃ']).toBe('sound_S.mp3');
    expect(table['ʒ']).toBe('sound_Z.mp3');
    expect(table['tʃ'] ?? table['ʧ']).toBe('sound_ʧ.mp3');
    expect(table['dʒ'] ?? table['ʤ']).toBe('sound_ʤ.mp3');
  });

  it('归一化：去斜杠、tʃ/dʒ 变体统一', () => {
    expect(normalizeIpa('/æ/')).toBe('æ');
    expect(normalizeIpa('/tʃ/')).toBe('ʧ');
    expect(normalizeIpa('/dʒ/')).toBe('ʤ');
    expect(normalizeIpa(' ʃ ')).toBe('ʃ');
  });

  it('美式写法可命中（含 r 色元音近似与 oʊ≈əʊ）', () => {
    const table = phonicsAudioTable();
    expect(table['ɑ']).toBe('sound_long_ɑ.mp3');
    expect(table['ɑr']).toBe('sound_long_ɑ.mp3');
    expect(table['ɔr']).toBe('sound_long_ɔ.mp3');
    expect(table['ɚ']).toBe('sound_ə.mp3');
    expect(table['ɝ']).toBe('sound_long_e.mp3');
    expect(table['oʊ']).toBe('sound_əʊ.mp3');
  });

  it('上游缺文件的不映射（s/z），交给例词朗读回退', () => {
    expect(phonicsAudioTable()['s']).toBeUndefined();
    expect(phonicsAudioTable()['z']).toBeUndefined();
    expect(phonicsAudioSrc('/s/')).toBeNull();
  });

  it('★ 严谨性：映射表里每个文件都必须真实随包存在且是有效 mp3（>3KB）', async () => {
    const table = phonicsAudioTable();
    const files = new Set(Object.values(table));
    expect(files.size).toBeGreaterThanOrEqual(40);
    for (const file of files) {
      const st = await stat(path.join(AUDIO_DIR, file));
      expect(st.isFile(), `缺文件: ${file}`).toBe(true);
      expect(st.size, `文件过小: ${file}`).toBeGreaterThan(3000);
    }
  });

  it('phonicsAudioSrc 返回绝对 URL（遵循媒体地址绝对化的全仓规矩；unicode 文件名按标准 percent-encode）', () => {
    const src = phonicsAudioSrc('/æ/');
    expect(src).toMatch(/^https?:\/\/[^/]+\/phonics-audio\//);
    expect(decodeURIComponent(src!)).toMatch(/sound_æ\.mp3$/);
  });
});
