// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonBlendAudioSrc, normalizeIpa, phonicsAudioSrc, phonicsAudioTable } from './phonics-audio';

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

  it('★ s/z 已补录真人擦音：sit 拼读第一个音不再哑（2026-11-14）', () => {
    expect(phonicsAudioTable()['s']).toBe('sound_ipa_s.mp3');
    expect(phonicsAudioTable()['z']).toBe('sound_ipa_z.mp3');
    expect(phonicsAudioSrc('/s/')).toMatch(/sound_ipa_s\.mp3$/);
    expect(phonicsAudioSrc('/z/')).toMatch(/sound_ipa_z\.mp3$/);
  });

  it('★ Windows 大小写不敏感：补录的 s/z 不得覆盖 ʃ/ʒ 的 sound_S/Z.mp3', () => {
    const table = phonicsAudioTable();
    expect(table['s'].toLowerCase()).not.toBe(table['ʃ'].toLowerCase());
    expect(table['z'].toLowerCase()).not.toBe(table['ʒ'].toLowerCase());
    expect(table['ʃ']).toBe('sound_S.mp3');
    expect(table['ʒ']).toBe('sound_Z.mp3');
  });

  it('★ 第 1 课 5 条专属慢速拼读示范音频全部随包存在', async () => {
    const dir = path.join(AUDIO_DIR, 'lesson', 'letter-name-vs-sound');
    for (const word of ['tap', 'bed', 'sit', 'hot', 'cup']) {
      const src = lessonBlendAudioSrc(`lesson/letter-name-vs-sound/${word}.mp3`);
      expect(src, `${word} 地址绝对化`).toMatch(/phonics-audio\/lesson\/letter-name-vs-sound\//);
      const st = await stat(path.join(dir, `${word}.mp3`));
      expect(st.isFile(), `缺文件: ${word}.mp3`).toBe(true);
      expect(st.size, `文件过小: ${word}.mp3`).toBeGreaterThan(10000);
    }
    expect(lessonBlendAudioSrc('../evil.mp3')).toBeNull();
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
