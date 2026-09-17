/**
 * SRT 字幕生成单测。
 *
 * 为什么值得测：字幕时间轴是纯计算（分镜每镜自带时长，累加即得），零 ASR 成本，
 * 但「累加」这件事有两种典型错法 —— 浮点累积导致时间戳漂移、空条目打乱条目编号。
 * 时间戳格式错一位，播放器就整段不显示，且不会报错，很难从症状倒推。
 */
import { describe, it, expect } from 'vitest';
import { formatSrtTime, buildSrt } from '../src/mcp/srt';

describe('formatSrtTime · 时间戳格式', () => {
  it('标准格式 HH:MM:SS,mmm（毫秒三位、逗号分隔）', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(1.5)).toBe('00:00:01,500');
    expect(formatSrtTime(61.25)).toBe('00:01:01,250');
    expect(formatSrtTime(3661.007)).toBe('01:01:01,007');
  });

  it('负数按 0 处理（不产出 -00 这种非法时间戳）', () => {
    expect(formatSrtTime(-5)).toBe('00:00:00,000');
  });

  it('小时位补零到两位', () => {
    expect(formatSrtTime(3600)).toBe('01:00:00,000');
  });
});

describe('buildSrt · 时长累加', () => {
  it('按 duration 顺序累加，不重叠不留缝', () => {
    const r = buildSrt([{ text: 'A', duration: 2 }, { text: 'B', duration: 3 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.count).toBe(2);
    expect(r.srt).toContain('00:00:00,000 --> 00:00:02,000');
    expect(r.srt).toContain('00:00:02,000 --> 00:00:05,000');
  });

  it('条目从 1 开始编号，块间空行分隔，结尾换行', () => {
    const r = buildSrt([{ text: 'A', duration: 1 }, { text: 'B', duration: 1 }]);
    if (!r.ok) return;
    expect(r.srt.startsWith('1\n')).toBe(true);
    expect(r.srt).toContain('\n\n2\n');
    expect(r.srt.endsWith('\n')).toBe(true);
  });

  it('未给 duration 时用 3 秒缺省（避免零长字幕闪退）', () => {
    const r = buildSrt([{ text: '单条' }]);
    if (!r.ok) return;
    expect(r.srt).toContain('00:00:00,000 --> 00:00:03,000');
  });

  it('显式 start/end 优先于累加（两者混用时显式段之后继续按累加）', () => {
    const r = buildSrt([
      { text: 'A', duration: 2 },
      { text: 'B', start: 10, end: 12 },
      { text: 'C', duration: 1 },
    ]);
    if (!r.ok) return;
    expect(r.srt).toContain('00:00:10,000 --> 00:00:12,000');
    // C 接在显式段之后
    expect(r.srt).toContain('00:00:12,000 --> 00:00:13,000');
  });
});

describe('buildSrt · 脏数据与边界', () => {
  it('空文本条目被跳过，且不影响后续编号连续性', () => {
    const r = buildSrt([{ text: 'A', duration: 1 }, { text: '   ' }, { text: 'B', duration: 1 }]);
    if (!r.ok) return;
    expect(r.count).toBe(2);
    expect(r.srt).toContain('\n\n2\n');
    expect(r.srt).not.toContain('3\n');
  });

  it('非法区间（end <= start）被丢弃，且不降级成累加（避免字幕整体错位）', () => {
    const r = buildSrt([{ text: 'A', start: 5, end: 5 }, { text: 'B', duration: 1 }]);
    if (!r.ok) return;
    expect(r.count).toBe(1);
    expect(r.srt).toContain('B');
    expect(r.srt).not.toContain('A');
  });

  it('只给 start 或只给 end（残缺坐标）→ 丢弃，不猜另一头', () => {
    const r = buildSrt([{ text: '只有头', start: 5 }, { text: '只有尾', end: 9 }, { text: '好的', duration: 1 }]);
    if (!r.ok) return;
    expect(r.count).toBe(1);
    expect(r.srt).toContain('好的');
    expect(r.srt).not.toContain('只有头');
    expect(r.srt).not.toContain('只有尾');
  });

  it('duration 为 0 或负数时回落缺省 3 秒', () => {
    const r = buildSrt([{ text: 'A', duration: 0 }]);
    if (!r.ok) return;
    expect(r.srt).toContain('00:00:00,000 --> 00:00:03,000');
  });

  it('全空 / 空数组 → 明确报错而不是产出空文件', () => {
    expect(buildSrt([]).ok).toBe(false);
    expect(buildSrt([{ text: '' }]).ok).toBe(false);
    const r = buildSrt([{ text: '' }]);
    if (!r.ok) expect(r.error).toContain('没有可用的字幕条目');
  });
});