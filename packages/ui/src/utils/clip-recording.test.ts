/**
 * 录音工具单测：MIME 选择 / 扩展名 / 文件名 / 计时。
 * ★ 这些是跨浏览器会漂移的口径（webm/opus vs mp4/aac），必须钉住顺序与回落。
 */
import { describe, it, expect } from 'vitest';
import {
  pickRecorderMime, recordingExt, recordingFileName, formatRecTime,
  REC_MIME_CANDIDATES, RECORDING_MAX_MS,
} from './clip-recording';

describe('pickRecorderMime', () => {
  it('按候选顺序取第一个支持的', () => {
    expect(pickRecorderMime((m) => m === 'audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime((m) => m === 'audio/webm')).toBe('audio/webm');
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
  });

  it('都不支持 → 空串（交给 MediaRecorder 默认值）', () => {
    expect(pickRecorderMime(() => false)).toBe('');
  });

  it('isTypeSupported 抛异常也当作不支持', () => {
    expect(pickRecorderMime(() => { throw new Error('boom'); })).toBe('');
  });

  it('候选表本身不为空且含 webm/opus（Electron 环境的主力格式）', () => {
    expect(REC_MIME_CANDIDATES.length).toBeGreaterThan(0);
    expect(REC_MIME_CANDIDATES[0]).toContain('webm');
  });
});

describe('recordingExt', () => {
  it('webm/ogg/mp4 的扩展名映射', () => {
    expect(recordingExt('audio/webm;codecs=opus')).toBe('webm');
    expect(recordingExt('audio/webm')).toBe('webm');
    expect(recordingExt('audio/ogg;codecs=opus')).toBe('ogg');
    expect(recordingExt('audio/mp4')).toBe('m4a');
    expect(recordingExt('')).toBe('webm');
  });
});

describe('recordingFileName', () => {
  it('时间戳格式固定（便于排序与去重）', () => {
    const d = new Date(2026, 10, 2, 13, 5, 9);   // 2026-11-02 13:05:09
    expect(recordingFileName(d, 'audio/webm;codecs=opus')).toBe('录音-20261102-130509.webm');
    expect(recordingFileName(d, 'audio/mp4')).toBe('录音-20261102-130509.m4a');
  });

  it('非法日期回落当前时间（不产生 Invalid Date 文件名）', () => {
    const name = recordingFileName(new Date('nope'), 'audio/webm');
    expect(name).toMatch(/^录音-\d{8}-\d{6}\.webm$/);
  });
});

describe('formatRecTime', () => {
  it('分:秒.十分位', () => {
    expect(formatRecTime(0)).toBe('0:00.0');
    expect(formatRecTime(5300)).toBe('0:05.3');
    expect(formatRecTime(750000)).toBe('12:30.0');
    expect(formatRecTime(-100)).toBe('0:00.0');
  });
});

describe('RECORDING_MAX_MS', () => {
  it('上限是 30 分钟（防止忘记录音占满磁盘）', () => {
    expect(RECORDING_MAX_MS).toBe(30 * 60 * 1000);
  });
});
