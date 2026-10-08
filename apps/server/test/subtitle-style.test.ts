/**
 * 字幕动画（SRT → ASS）单测。
 *
 * 为什么值得测：ASS 是「文本即代码」——时间戳错一位、标签转义漏一个 {}，
 * libass 会静默整条不渲染或把用户文本当标签吞掉，编译期完全无感。
 * 另外动画分支的坐标换算（PlayRes=真实分辨率）一旦错，表现为"字幕飞出画面"，
 * 只能靠这里把纯函数逻辑锁死，ffmpeg 实跑再核视觉效果。
 */
import { describe, it, expect } from 'vitest';
import { formatAssTime, parseSrt, buildAss, SUBTITLE_ANIMATION_PRESETS } from '../src/mcp/subtitle-style';

const BASE_OPTS = {
  preset: 'fade',
  playResX: 1080,
  playResY: 1920,
  fontSizePx: 50,
  primaryColor: '&H00FFFFFF&',
  outlineColor: '&H00000000&',
  outlinePx: 2,
  alignment: 2,
  marginVPx: 200,
} as const;

describe('formatAssTime · ASS 时间戳', () => {
  it('H:MM:SS.cc 厘秒两位（小时补零）', () => {
    expect(formatAssTime(0)).toBe('00:00:00.00');
    expect(formatAssTime(1.5)).toBe('00:00:01.50');
    expect(formatAssTime(3661.25)).toBe('01:01:01.25');
  });

  it('厘秒四舍五入到 100 时钳到 99（不产出非法 .100）', () => {
    expect(formatAssTime(1.999)).toBe('00:00:01.99');
  });
});

describe('parseSrt · SRT 解析', () => {
  it('解析序号/时间轴/多行文本，产出时间与文本', () => {
    const srt = '1\n00:00:00,000 --> 00:00:02,000\n第一行\n第二行\n\n2\n00:00:02,000 --> 00:00:04,500\n你好';
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 0, end: 2, text: '第一行\n第二行' });
    expect(cues[1].end).toBeCloseTo(4.5);
  });

  it('非法块（缺时间轴/时间倒置）跳过不整体失败，CRLF 兼容', () => {
    const srt = '1\n不是时间轴\nabc\r\n\r\n2\n00:00:01,000 --> 00:00:02,000\n好的\r\n\r\n3\n00:00:05,000 --> 00:00:04,000\n倒置';
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('好的');
  });
});

describe('buildAss · 结构与样式', () => {
  it('预设 id 全部可被 buildAss 接受（防止 enum 与实现脱节）', () => {
    expect(SUBTITLE_ANIMATION_PRESETS.length).toBe(8);
    for (const p of SUBTITLE_ANIMATION_PRESETS) {
      const r = buildAss([{ start: 0, end: 2, text: '测试' }], { ...BASE_OPTS, preset: p.id });
      expect(r.ok).toBe(true);
    }
  });

  it('ASS 头包含 PlayRes=传入的真实分辨率，样式行含字号/颜色/对齐/边距', () => {
    const r = buildAss([{ start: 0, end: 2, text: '测试' }], { ...BASE_OPTS, preset: 'fade' });
    if (!r.ok) throw new Error(r.error);
    expect(r.ass).toContain('PlayResX: 1080');
    expect(r.ass).toContain('PlayResY: 1920');
    expect(r.ass).toContain('Style: Default,Microsoft YaHei,50,&H00FFFFFF&');
    // Style 行是 CSV：…,BorderStyle=1, Outline=2, Shadow=1, Alignment=2, MarginL=40, MarginR=40, MarginV=200, Encoding=1
    expect(r.ass).toContain(',0,0,100,100,0,0,1,2,1,2,40,40,200,1');
  });

  it('未知预设与空条目返回 ok:false（不静默产空 ASS）', () => {
    expect(buildAss([{ start: 0, end: 2, text: 'x' }], { ...BASE_OPTS, preset: 'nope' }).ok).toBe(false);
    expect(buildAss([], BASE_OPTS).ok).toBe(false);
    expect(buildAss([{ start: 2, end: 1, text: 'x' }], BASE_OPTS).ok).toBe(false);
  });

  it('用户文本里的 {} 与 \\ 被清除（防止内联标签注入整条解析坏）', () => {
    const r = buildAss([{ start: 0, end: 2, text: '前{\\fscx999}后\\N假标签' }], BASE_OPTS);
    if (!r.ok) throw new Error(r.error);
    const dialogue = r.ass.split('\n').find((l) => l.startsWith('Dialogue'))!;
    // 用户注入的标签组整块剥离（不是只删花括号），反斜杠转义也清掉
    expect(dialogue).not.toContain('\\fscx999');
    expect(dialogue).not.toContain('fscx999');
    expect(dialogue).toContain('前后假标签');
  });
});

describe('buildAss · 各预设动画标签', () => {
  const cue = { start: 1, end: 3, text: '字幕测试' };
  const firstDialogue = (ass: string) => ass.split('\n').find((l) => l.startsWith('Dialogue'))!;

  it('fade：\\fad(300,300)', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'fade' });
    if (!r.ok) throw new Error(r.error);
    expect(firstDialogue(r.ass)).toContain('{\\fad(300,300)}字幕测试');
  });

  it('pop：缩放过冲回弹序列', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'pop' });
    if (!r.ok) throw new Error(r.error);
    const d = firstDialogue(r.ass);
    expect(d).toContain('\\fscx70\\fscy70');
    expect(d).toContain('\\t(0,160,\\fscx118\\fscy118)');
    expect(d).toContain('\\t(160,340,\\fscx100\\fscy100)');
  });

  it('karaoke：每字 \\k 厘秒值 = 时长/字数，且 SecondaryColour 已设', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'karaoke' });
    if (!r.ok) throw new Error(r.error);
    // 4 字 × 2s = 每字 50cs（下限 10）
    expect(firstDialogue(r.ass)).toContain('{\\k50}字');
    expect(r.ass).toMatch(/Style: Default,[^,]+,50,[^,]+,&H0000FFFF&/);
  });

  it('typewriter：产出逐字递增的 Dialogue 序列，锚定左端不跳位', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'typewriter' });
    if (!r.ok) throw new Error(r.error);
    const dialogues = r.ass.split('\n').filter((l) => l.startsWith('Dialogue'));
    expect(dialogues).toHaveLength(4);
    expect(dialogues[0]).toContain('\\an1\\pos(');
    expect(dialogues[0]).toContain('字');
    expect(dialogues[3]).toContain('字幕测试');
  });

  it('slide：默认从右侧滑入，\\move 起点 x 在锚点右侧', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'slide' });
    if (!r.ok) throw new Error(r.error);
    const m = firstDialogue(r.ass).match(/\\move\((-?\d+),(-?\d+),(\d+),(\d+),0,300\)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(Number(m![3])); // 起点 x > 终点 x
    expect(Number(m![4])).toBe(1920 - 200); // 底部锚点 y = resY - mv
  });

  it('slide：direction=up 从下方滑入（起点 y > 终点 y）', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'slide', direction: 'up' });
    if (!r.ok) throw new Error(r.error);
    const m = firstDialogue(r.ass).match(/\\move\((-?\d+),(-?\d+),(\d+),(\d+),0,300\)/);
    expect(Number(m![2])).toBeGreaterThan(Number(m![4]));
  });

  it('flicker：描边宽度脉冲含起止回到原值', () => {
    const r = buildAss([cue], { ...BASE_OPTS, preset: 'flicker' });
    if (!r.ok) throw new Error(r.error);
    const d = firstDialogue(r.ass);
    expect(d).toContain(`\\bord5`);
    expect(d).toContain(`\\bord2`);
  });

  it('flychar：每字独立 Dialogue 绝对定位，重复字也不共用时间轴起点', () => {
    const r = buildAss([{ start: 0, end: 2, text: '一样的' }], { ...BASE_OPTS, preset: 'flychar' });
    if (!r.ok) throw new Error(r.error);
    const dialogues = r.ass.split('\n').filter((l) => l.startsWith('Dialogue'));
    expect(dialogues).toHaveLength(3);
    // 三个字的起始时间必须两两不同（重复字 bug 曾让它们共用第一个字的起点）
    const starts = dialogues.map((d) => d.split(',')[1]);
    expect(new Set(starts).size).toBe(3);
  });
});
