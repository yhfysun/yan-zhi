/**
 * 文字层变换与关键帧（P0-2b）单测。
 *
 * 为什么必须钉住两件事：
 *   ① **老工程逐字节不变**：字幕有两条渲染出口（SRT+force_style / ASS）。一旦"没有变换"的工程
 *      也被切到 ASS，全量存量草稿的字幕观感都会漂（字号/边距/描边全换一套换算），而且不报错。
 *      所以这里直接比对文本级输出，而不是"看起来差不多"。
 *   ② **有变换时标签确实出现**：\pos/\frz/\fscx/\alpha 与 \t() 分段，任何一项丢了都是"静默没效果"。
 */
import { describe, it, expect } from 'vitest';
import { applyClipOp, layersFromV1Fields, v1FieldsFromLayers, type ClipProject, type ClipText } from '../src/services/clip-project';
import { buildRenderPlan, buildSrtFromTexts, buildSubtitleAssets, textHasTransform } from '../src/services/clip-render';

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

/** 三代同堂的存量工程：纯字幕 / 带动画 / 带底板（都是 P0-2b 之前的字段） */
function legacyProject(): ClipProject {
  return run(null, [
    ['add_clip', { clips: [{ file: 'C:/v/a.mp4' }, { file: 'C:/v/b.mp4' }] }],
    ['add_text', { texts: [
      { text: '你好世界', start: 0, end: 2 },
      { text: 'Hello 第二行', start: 2.5, end: 4.25, animation: 'zoom', position: 'center' },
      { text: '底部带底板', start: 5, end: 6.5, backColor: '#000000B3', position: 'bottom' },
    ] }],
  ]);
}

describe('P0-2b · 老工程（无 transform）出片路径逐字节不变', () => {
  it('SRT 文本与改动前完全一致（一个字都不能飘）', () => {
    const p = legacyProject();
    const expected = String.raw`1
00:00:00,000 --> 00:00:02,000
你好世界

2
00:00:02,500 --> 00:00:04,250
Hello 第二行

3
00:00:05,000 --> 00:00:06,500
底部带底板
`;
    expect(buildSrtFromTexts(p.texts)).toBe(expected);
  });

  it('有动画的工程 ASS 仍与改动前逐字节一致', () => {
    const p = legacyProject();
    const expected = String.raw`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,88,&H00FFFFFF&,&H0000FFFF&,&H00000000&,&H7F000000,0,0,0,0,100,100,0,0,1,12,1,5,40,40,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,00:00:00.00,00:00:02.00,Default,,0,0,0,,{\fad(300,300)}你好世界
Dialogue: 0,00:00:02.50,00:00:04.25,Default,,0,0,0,,{\fad(120,180)\fscx55\fscy55\t(0,240,\fscx100\fscy100)}Hello 第二行
Dialogue: 0,00:00:05.00,00:00:06.50,Default,,0,0,0,,{\fad(300,300)}底部带底板
`;
    expect(buildSubtitleAssets(p, 1080, 1920).ass).toBe(expected);
  });

  it('★ 无动画且无变换 → 不产 ASS，渲染仍用 SRT + force_style', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/v/a.mp4' }] }],
      ['add_text', { texts: [{ text: '静', start: 0, end: 2 }] }],
    ]);
    expect(buildSubtitleAssets(p, 1080, 1920).ass).toBeUndefined();
    const r = buildRenderPlan({
      project: p, durations: { 'C:/v/a.mp4': 3 }, hasAudio: {}, workDir: 'C:/w', outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    const sub = r.plan.steps.find((s) => s.label.includes('烧录字幕'))!;
    const vf = sub.args[sub.args.indexOf('-vf') + 1];
    expect(vf).toContain('subtitles.srt');
    expect(vf).toContain('force_style=');
    expect(vf).not.toContain('.ass');
  });
});

describe('P0-2b · 文字层变换 → ASS 内联标签', () => {
  const proj = (texts: Record<string, unknown>[]): ClipProject => run(null, [
    ['add_clip', { clips: [{ file: 'C:/v/a.mp4' }] }],
    ['add_text', { texts }],
  ]);

  /** 取第 i 条 Dialogue 的标签块 */
  const tagsOf = (ass: string, i = 0): string => {
    const d = ass.split('\n').filter((l) => l.startsWith('Dialogue'))[i];
    return d.slice(d.indexOf('{') + 1, d.indexOf('}'));
  };

  it('静态变换：\an5\pos 居中基准 + \frz / \fscx\fscy / \alpha', () => {
    const p = proj([{ text: '变换', start: 0, end: 3, transform: { x: 0.25, y: -0.1, scale: 1.5, rotation: 30, opacity: 0.5 } }]);
    const ass = buildSubtitleAssets(p, 1080, 1920).ass!;
    const tags = tagsOf(ass);
    expect(tags).toContain('\\an5');
    // x=0.25 → 540 + 0.25*1080 = 810；y=-0.1 → 960 - 0.1*1920 = 768
    expect(tags).toContain('\\pos(810,768)');
    expect(tags).toContain('\\fscx150\\fscy150');
    expect(tags).toContain('\\frz30');
    // opacity 0.5 → 透明度 128 → 80
    expect(tags).toContain('\\alpha&H80&');
    // 有变换时不再套默认淡入
    expect(tags).not.toContain('\\fad(');
  });

  it('关键帧：按关键帧时间切片，位置用 \\move（真机实测 \\t(\\pos) 在 libass 里不生效）', () => {
    const p = proj([{ text: '滑入', start: 0, end: 4, keyframes: [
      { t: 0, x: 0.35, scale: 0.6 },
      { t: 0.5, x: 0 },
      { t: 1, x: -0.2, scale: 1.1 },
    ] }]);
    const ass = buildSubtitleAssets(p, 1080, 1920).ass!;
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
    expect(dialogues).toHaveLength(2);
    // 两片首尾相接，覆盖整条 cue
    expect(dialogues[0]).toContain('00:00:00.00,00:00:02.00');
    expect(dialogues[1]).toContain('00:00:02.00,00:00:04.00');
    const [t1, t2] = [tagsOf(ass, 0), tagsOf(ass, 1)];
    // 起点 x=0.35 → 540+378=918；t=0.5 处 x=0 → 540；t=1 → -0.2 → 324
    expect(t1).toContain('\\move(918,960,540,960,0,2000)');
    expect(t2).toContain('\\move(540,960,324,960,0,2000)');
    // 缩放 0.6 → 0.85（t=0.5 线性采样）→ 1.1
    expect(t1).toContain('\\fscx60\\fscy60');
    expect(t1).toContain('\\t(0,2000,\\fscx85\\fscy85)');
    expect(t2).toContain('\\t(0,2000,\\fscx110\\fscy110)');
  });

  it('缓动：in/out 映射成 \\t 的 accel，inout/bezier 退回线性（不假装支持）', () => {
    const p = proj([{ text: '缓动', start: 0, end: 2, keyframes: [
      { t: 0, scale: 0.5, ease: 'out' },
      { t: 0.5, scale: 0.8, ease: 'inout' },
      { t: 1, scale: 1 },
    ] }]);
    const ass = buildSubtitleAssets(p, 1080, 1920).ass!;
    expect(tagsOf(ass, 0)).toContain('\\t(0,1000,0.5,\\fscx80\\fscy80)');
    expect(tagsOf(ass, 1)).toContain('\\t(0,1000,\\fscx100\\fscy100)');
  });

  it('只有关键帧、没有静态变换，也走 ASS（否则动画永远不生效）', () => {
    const p = proj([{ text: 'kf', start: 0, end: 2, keyframes: [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }] }]);
    const asset = buildSubtitleAssets(p, 1080, 1920);
    expect(asset.ass).toBeTruthy();
    expect(tagsOf(asset.ass!)).toContain('\\alpha&HFF&');
  });
});

describe('P0-2b · 归一化与清除', () => {
  it('非法变换值：越界钳制、非数字丢弃、等价默认值不写字段', () => {
    const p = run(null, [
      ['add_text', { texts: [{ text: 'x', start: 0, end: 1, transform: { x: 9, scale: 'abc', rotation: -999, opacity: 2, y: 'NaN' } }] }],
    ]);
    // x 钳到 0.5、rotation 钳到 -180；scale 非数字丢弃；opacity=2 → 钳到 1 = 默认 → 丢；y 非数字丢弃
    expect(p.texts[0].transform).toEqual({ x: 0.5, rotation: -180 });
  });

  it('关键帧非法值归一化：t 钳 0~1、无有效属性的点丢弃、按 t 排序', () => {
    const p = run(null, [
      ['add_text', { texts: [{ text: 'x', start: 0, end: 1, keyframes: [
        { t: 3, scale: 2 },
        { t: 0 },
        { t: 0.2, x: 9 },
      ] }] }],
    ]);
    expect(p.texts[0].keyframes).toEqual([{ t: 0.2, x: 0.5 }, { t: 1, scale: 2 }]);
  });

  it('update_text：patch.transform=null / keyframes=[] 清除字段（回到 SRT 原路径）', () => {
    let p = run(null, [
      ['add_text', { texts: [{ text: 'x', start: 0, end: 1, transform: { x: 0.2 }, keyframes: [{ t: 0, scale: 0.5 }] }] }],
    ]);
    expect(textHasTransform(p.texts[0])).toBe(true);
    p = run(p, [['update_text', { id: 't1', patch: { transform: null } }]]);
    expect(p.texts[0].transform).toBeUndefined();
    expect(textHasTransform(p.texts[0])).toBe(true);   // 关键帧还在
    p = run(p, [['update_text', { id: 't1', patch: { keyframes: [] } }]]);
    expect(p.texts[0].keyframes).toBeUndefined();
    expect(textHasTransform(p.texts[0])).toBe(false);
  });

  it('双向投影：text.transform/keyframes ↔ layer.transform/keyframes 不丢', () => {
    const texts: ClipText[] = [{
      id: 't1', text: 'a', start: 0, end: 2,
      transform: { x: 0.1, y: -0.2, scale: 1.4 },
      keyframes: [{ t: 0, x: 0.3 }, { t: 1, x: 0 }],
    }];
    const L = layersFromV1Fields(texts, []);
    expect(L[0].transform).toEqual({ x: 0.1, y: -0.2, scale: 1.4 });
    expect(L[0].keyframes).toHaveLength(2);
    // 变换不塞进 l.text（同一份数据不该在层里出现两次）
    expect((L[0].text as Record<string, unknown>).transform).toBeUndefined();
    expect(v1FieldsFromLayers(L).texts[0]).toEqual(texts[0]);
  });

  it('老工程的 text 层 transform 是空对象 → 读回来不带 transform 字段', () => {
    const L = layersFromV1Fields([{ id: 't1', text: 'a', start: 0, end: 1 }], []);
    expect(L[0].transform).toEqual({});
    expect(v1FieldsFromLayers(L).texts[0]).toEqual({ id: 't1', text: 'a', start: 0, end: 1 });
  });
});
