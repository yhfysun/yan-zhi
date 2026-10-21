/**
 * 本地 AI 配乐：乐谱 → 编曲 → 合成 的单测。
 *
 * 分三层，越往下越"跑得动"：
 *  ① 解析/编曲（纯逻辑）：和弦符号、音名、风格织体、确定性；
 *  ② 合成（纯计算）：WAV 头、时长、非静音、不削波；
 *  ③ 落盘（需 ffmpeg，`YZ_LIVE_MEDIA=1` 才跑）：m4a 产物 + ffprobe 时长。
 *
 * ★ 为什么时长要单独断言：合成器最容易犯的错是"包络算错导致时长差一截"，
 *   而 WAV 头里的长度与采样数不一致时，播放器会截断/爆音 —— 这类问题不看波形看不出来。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { arrangeMusic, parseChord, pitchToMidi } from '../src/services/music-plan';
import { renderArrangement, encodeWav } from '../src/services/music-synth';
import { parsePinyin, renderVocal } from '../src/services/music-vocal';
import { composeMusic } from '../src/services/music-render';

const LIVE = process.env.YZ_LIVE_MEDIA === '1';
const FFMPEG = process.env.YZ_FFMPEG_BIN?.trim() ||
  path.join(process.env.APPDATA || '', 'yan-zhi/server-data/ffmpeg/ffmpeg.exe');
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');

describe('乐谱 · 和弦与音名解析', () => {
  it('大三/小三/七和弦', () => {
    expect(parseChord('C')?.intervals).toEqual([0, 4, 7]);
    expect(parseChord('Am')?.intervals).toEqual([0, 3, 7]);
    expect(parseChord('D7')?.intervals).toEqual([0, 4, 7, 10]);
    expect(parseChord('F#m7')?.intervals).toEqual([0, 3, 7, 10]);
    expect(parseChord('Gsus4')?.intervals).toEqual([0, 5, 7]);
  });

  it('降号与大小写都能认', () => {
    expect(parseChord('Bb')?.root).toBe(10);
    expect(parseChord('bb')?.root).toBe(10);
    expect(parseChord('F#')?.root).toBe(6);
  });

  it('无法解析时返回 null（不硬凑一个和弦）', () => {
    expect(parseChord('H7')).toBeNull();
    expect(parseChord('')).toBeNull();
    expect(parseChord('流行')).toBeNull();
  });

  it('音名 → MIDI', () => {
    expect(pitchToMidi('C4')).toBe(60);
    expect(pitchToMidi('A4')).toBe(69);
    expect(pitchToMidi('F#5')).toBe(78);
    expect(pitchToMidi(60)).toBe(60);
    expect(pitchToMidi('Z9')).toBeNull();
  });
});

describe('乐谱 · 编曲展开', () => {
  it('时长 = 小节数 × 每小节秒数', () => {
    const a = arrangeMusic({ bpm: 120, beatsPerBar: 4, bars: 4 });
    expect(a.duration).toBeCloseTo(8, 5); // 4 小节 × 2s
    expect(a.bpm).toBe(120);
  });

  it('和弦按小节循环，缺省时给出默认进行并如实提示', () => {
    const a = arrangeMusic({ bars: 6, chords: ['C', 'G'] });
    expect(a.chordNames).toEqual(['C', 'G', 'C', 'G', 'C', 'G']);
    const d = arrangeMusic({ bars: 2, chords: [] });
    expect(d.warnings.join('')).toContain('默认进行');
    expect(d.chordNames).toEqual(['C', 'G']);
  });

  it('非法参数退回默认值而不是抛错', () => {
    const a = arrangeMusic({ bpm: 9999, bars: -3, style: 'jazz' as never });
    expect(a.bpm).toBe(180);
    expect(a.bars).toBe(1);
    expect(a.style).toBe('gentle');
  });

  it('同一种子 → 完全相同的编曲（可复现）', () => {
    const spec = { bpm: 100, bars: 4, style: 'lofi' as const, seed: 7 };
    expect(arrangeMusic(spec).notes).toEqual(arrangeMusic(spec).notes);
  });

  it('音符都落在曲子范围内', () => {
    const a = arrangeMusic({ bpm: 96, bars: 8, chords: ['Am', 'F', 'C', 'G'], style: 'pop' });
    expect(a.notes.length).toBeGreaterThan(10);
    for (const n of a.notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(a.duration + 0.01);
      expect(n.dur).toBeGreaterThan(0);
    }
  });

  it('风格决定织体：edm 有四踩鼓且不叠 pad，gentle 有 pad', () => {
    const edm = arrangeMusic({ bars: 2, style: 'edm', drums: 'edm' });
    expect(edm.notes.some((n) => n.track === 'pad')).toBe(false);
    const kicks = edm.notes.filter((n) => n.drum === 'kick');
    expect(kicks.length).toBeGreaterThanOrEqual(8); // 4/4 × 2 小节 = 8 拍
    const gentle = arrangeMusic({ bars: 2, style: 'gentle', drums: 'ballad' });
    expect(gentle.notes.some((n) => n.track === 'pad')).toBe(true);
  });

  it('给了旋律就用旋律（lead 轨）', () => {
    const a = arrangeMusic({ bars: 2, melody: [{ start: 0, len: 1, pitch: 'C5' }, { start: 1, len: 1, pitch: 'E5' }] });
    const lead = a.notes.filter((n) => n.track === 'lead');
    expect(lead.map((n) => n.midi)).toEqual([72, 76]);
  });
});

describe('合成 · PCM / WAV', () => {
  const arr = arrangeMusic({ bpm: 120, bars: 2, chords: ['C', 'G'], style: 'gentle', drums: 'ballad', seed: 3 });

  it('WAV 头与采样数一致', () => {
    const out = renderArrangement(arr, { sampleRate: 8000, tailSec: 0.5 });
    const buf = out.wav;
    expect(buf.slice(0, 4).toString()).toBe('RIFF');
    expect(buf.slice(8, 12).toString()).toBe('WAVE');
    const dataBytes = buf.readUInt32LE(40);
    expect(dataBytes).toBeGreaterThan(0);
    expect(buf.length).toBe(44 + dataBytes);
    // 8000 帧/秒 × 2 声道 × 2 字节
    expect(dataBytes).toBe(Math.round(out.seconds * 8000 * 4));
  });

  it('时长 = 音乐本体 + 尾巴', () => {
    const out = renderArrangement(arr, { sampleRate: 8000, tailSec: 1 });
    expect(out.seconds).toBeCloseTo(arr.duration + 1, 2);
  });

  it('不是静音，也不削波', () => {
    const out = renderArrangement(arr, { sampleRate: 8000 });
    expect(out.peak).toBeGreaterThan(0.05);
    expect(out.peak).toBeLessThanOrEqual(0.9);
  });

  it('确定性：同输入两次渲染逐字节相同', () => {
    const a = renderArrangement(arr, { sampleRate: 8000 });
    const b = renderArrangement(arr, { sampleRate: 8000 });
    expect(a.wav.equals(b.wav)).toBe(true);
  });

  it('encodeWav 对越界样本做夹取（不产生爆音）', () => {
    const L = new Float32Array([2, -2]);
    const R = new Float32Array([0, 0]);
    const wav = encodeWav(L, R, 44100);
    expect(wav.readInt16LE(44)).toBe(32767);
    expect(wav.readInt16LE(46)).toBe(0);
    expect(wav.readInt16LE(48)).toBe(-32767);
  });
});

describe('配乐 · 风格音色与演唱', () => {
  it('摇滚用电吉他 + 声学鼓', () => {
    const a = arrangeMusic({ bars: 2, style: 'rock' });
    expect(a.notes.some((n) => n.inst === 'dist_guitar')).toBe(true);
    expect(a.notes.filter((n) => n.track === 'drums').every((n) => n.drumKit === 'acoustic')).toBe(true);
  });

  it('国风用古筝 / 二胡 / 笛子', () => {
    const a = arrangeMusic({ bars: 2, style: 'cn' });
    expect(a.notes.some((n) => n.inst === 'guzheng')).toBe(true);
    expect(a.notes.some((n) => n.inst === 'erhu')).toBe(true);
    expect(a.notes.some((n) => n.inst === 'ebass')).toBe(true);
  });

  it('电子鼓与声学鼓要区分（edm 用 electronic）', () => {
    const a = arrangeMusic({ bars: 2, style: 'edm' });
    expect(a.notes.filter((n) => n.track === 'drums').every((n) => n.drumKit === 'electronic')).toBe(true);
  });

  it('instruments 可逐项覆盖风格默认值', () => {
    const a = arrangeMusic({ bars: 1, style: 'cn', instruments: { keys: 'piano' } });
    expect(a.notes.some((n) => n.inst === 'piano')).toBe(true);
    expect(a.notes.some((n) => n.inst === 'guzheng')).toBe(false);
  });

  it('歌词生成 vox 轨并带拼音与音高', () => {
    const a = arrangeMusic({ bars: 2, lyrics: [{ text: '月', py: 'yue', start: 0, len: 1, pitch: 'C5' }] });
    const v = a.notes.find((n) => n.track === 'vox');
    expect(v?.syllable?.text).toBe('月');
    expect(v?.syllable?.py).toBe('yue');
    expect(v?.midi).toBe(72);
  });

  it('拼音拆分覆盖 y/w 省写与舌尖元音', () => {
    expect(parsePinyin('yue').seq).toEqual(['v', 'e']);
    expect(parsePinyin('shang').initial).toBe('sh');
    expect(parsePinyin('shang').coda).toBe('ng');
    expect(parsePinyin('zhi').seq).toEqual(['r']);
    expect(parsePinyin('wo').seq).toEqual(['u', 'o']);
    expect(parsePinyin('yu').seq).toEqual(['v']);
  });

  it('人声渲染非静音，长度含释放段', () => {
    const v = renderVocal({ sr: 8000, freq: 440, dur: 0.5, vel: 0.8, seed: 1, py: 'shang' });
    let peak = 0;
    for (const s of v) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.02);
    expect(v.length).toBe(Math.round((0.5 + 0.09) * 8000));
  });
});

describe.skipIf(!LIVE)('落盘 · 需要 ffmpeg', () => {  it('composeMusic 产出可被 ffprobe 识别的 m4a，时长与元数据一致', async () => {
    const dir = path.join(os.tmpdir(), 'yz-music-verify');
    const out = await composeMusic({
      spec: { title: '验证曲', bpm: 120, bars: 2, chords: ['Am', 'F'], style: 'lofi', seed: 5 },
      dir,
      ffmpeg: FFMPEG,
    });
    expect(out.ok, out.error).toBe(true);
    expect(out.file!.endsWith('.m4a')).toBe(true);
    expect(fs.statSync(out.file!).size).toBeGreaterThan(5000);
    const dur = Number(execFileSync(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out.file!,
    ], { encoding: 'utf8' }).trim());
    expect(Math.abs(dur - out.audioSeconds!)).toBeLessThan(0.35);
    expect(out.bpm).toBe(120);
    expect(out.bars).toBe(2);
  }, 120000);
});
