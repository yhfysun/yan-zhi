/**
 * 剪辑工程（applyClipOp）+ 渲染计划（buildRenderPlan）单测。
 *
 * 为什么值得测：
 *   ① op 层是 UI 拖拽与智能体调用的**共用实现** —— 一处语义错，两条入口全错；
 *      「删了中间项 id 撞号」「update 静默无变更」这类错误不会报错，只表现为时好时坏；
 *   ② 渲染计划是本链路唯一需要真跑 ffmpeg 的部分，把「滤镜串/时长/映射」锁在纯函数层，
 *      实跑只用来验视觉效果，两者互补；
 *   ③ 已知铁律（有 -map 必须显式映射视频流、anullsrc 必须 -t、concat 前统一规格）
 *      一旦被改回去，症状是「产物只有声音」或「拼接失败」，很难从报错反推 → 用断言钉住。
 */
import { describe, it, expect } from 'vitest';
import { applyClipOp, createEmptyProject, summarizeProject, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, segmentDuration, buildSrtFromTexts, buildSubtitleAssets, REVERSE_MAX_SEC } from '../src/services/clip-render';
import { locateTimeline } from '../src/services/clip-preview';

/** 连续应用多步 op，任一步失败即抛（测试里出错要立刻爆，不要静默） */
function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

describe('applyClipOp · 片段增删改', () => {
  it('add_clip 追加并自动分配不重复 id（删中间项后仍不撞号）', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4' }, { file: 'C:/c.mp4' }] }]]);
    expect(p.clips.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    p = run(p, [['remove_clip', { id: 'c2' }], ['add_clip', { clips: [{ file: 'C:/d.mp4' }] }]]);
    // 删掉 c2 后新段必须是 c4，不能复用 c2（否则历史操作会指向新段）
    expect(p.clips.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  });

  it('add_clip 支持 1 基 index 定位（模型说「第 2 段」）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4' }] }]]);
    const r = applyClipOp(p, 'update_clip', { index: 2, patch: { speed: 2 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.clips[1].speed).toBe(2);
    expect(r.project.clips[0].speed).toBeUndefined();
  });

  it('update_clip 无任何字段可改时明确报错（不静默成功）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const r = applyClipOp(p, 'update_clip', { id: 'c1', unrelated: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('至少要改一个字段');
  });

  it('update_clip 把 speed=1 / volume=1 归一为「无此字段」（保持工程文件干净）', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', speed: 2, volume: 0.5 }] }]]);
    expect(p.clips[0].speed).toBe(2);
    p = run(p, [['update_clip', { id: 'c1', patch: { speed: 1, volume: 1 } }]]);
    expect(p.clips[0].speed).toBeUndefined();
    expect(p.clips[0].volume).toBeUndefined();
  });

  it('update_clip 校验裁剪区间（trimEnd <= trimStart 必须拒绝）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 1, trimEnd: 5 }] }]]);
    const r = applyClipOp(p, 'update_clip', { id: 'c1', patch: { trimEnd: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('裁剪区间无效');
  });

  it('add_clip 拒绝无 file 的条目（静默丢素材是最坏结果）', () => {
    const r = applyClipOp(null, 'add_clip', { clips: [{ label: '没有路径' }] });
    expect(r.ok).toBe(false);
  });

  it('move_clip 按 to 重排，越界报错', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4' }, { file: 'C:/c.mp4' }] }]]);
    p = run(p, [['move_clip', { id: 'c3', to: 1 }]]);
    expect(p.clips.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    const bad = applyClipOp(p, 'move_clip', { id: 'c1', to: 9 });
    expect(bad.ok).toBe(false);
  });

  it('locateClip 越界与未知 id 都给出可读报错（含现有清单）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const r1 = applyClipOp(p, 'remove_clip', { index: 5 });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain('越界');
    const r2 = applyClipOp(p, 'remove_clip', { id: 'c99' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('找不到片段');
  });
});

describe('applyClipOp · 字幕', () => {
  it('add_text 自动编号、时间成对校验', () => {
    const p = run(null, [['add_text', { texts: [{ text: '第一句', start: 0, end: 2 }, { text: '第二句', start: 2, end: 4 }] }]]);
    expect(p.texts.map((t) => t.id)).toEqual(['t1', 't2']);
    const bad = applyClipOp(p, 'add_text', { texts: [{ text: '倒置', start: 5, end: 3 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('end > start');
  });

  it('add_text 拒绝空文本', () => {
    const r = applyClipOp(null, 'add_text', { texts: [{ text: '   ', start: 0, end: 1 }] });
    expect(r.ok).toBe(false);
  });

  it('update_text 局部改（只改动画不动时间）', () => {
    const p = run(null, [['add_text', { texts: [{ text: '你好', start: 1, end: 3 }] }]]);
    const r = applyClipOp(p, 'update_text', { id: 't1', patch: { animation: 'karaoke' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.texts[0].animation).toBe('karaoke');
    expect(r.project.texts[0].start).toBe(1);
    expect(r.project.texts[0].end).toBe(3);
  });

  it('字幕位置/方向只接受合法枚举（拼错不落库成脏值）', () => {
    const p = run(null, [['add_text', { texts: [{ text: 'x', start: 0, end: 1, position: 'mid', slideDirection: 'diagonal' }] }]]);
    expect(p.texts[0].position).toBeUndefined();
    expect(p.texts[0].slideDirection).toBeUndefined();
  });
});

describe('applyClipOp · BGM 与元信息', () => {
  it('首次 set_bgm 必给 file；之后可只调音量', () => {
    const empty = createEmptyProject();
    expect(applyClipOp(empty, 'set_bgm', { volume: 0.3 }).ok).toBe(false);
    let p = run(empty, [['set_bgm', { file: 'C:/bgm.mp3', volume: 0.3, duck: true }]]);
    expect(p.bgm).toEqual({ file: 'C:/bgm.mp3', volume: 0.3, duck: true });
    p = run(p, [['set_bgm', { volume: 0.5 }]]);
    expect(p.bgm!.volume).toBe(0.5);
    expect(p.bgm!.file).toBe('C:/bgm.mp3');
    p = run(p, [['clear_bgm']]);
    expect(p.bgm).toBeUndefined();
  });

  it('set_output 校验规格格式', () => {
    const p = createEmptyProject();
    expect(applyClipOp(p, 'set_output', { size: '1920*1080' }).ok).toBe(false);
    const r = applyClipOp(p, 'set_output', { size: '1920x1080', fps: 60 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.output).toEqual({ size: '1920x1080', fps: 60 });
  });

  it('未知 op 报错并列出全部合法 op（避免模型瞎猜）', () => {
    const r = applyClipOp(null, 'append_clip', {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('add_clip');
      expect(r.error).toContain('add_text');
    }
  });

  it('纯函数：不改动传入的工程对象', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const snapshot = JSON.stringify(p);
    applyClipOp(p, 'add_clip', { clips: [{ file: 'C:/b.mp4' }] });
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('summarizeProject · 时间轴累计', () => {
  it('按各段时长（含裁剪与变速）累计出成片时间轴', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4', trimStart: 0, trimEnd: 4, speed: 2 }] }],
    ]);
    const s = summarizeProject(p, { 'C:/a.mp4': 10, 'C:/b.mp4': 10 });
    const clips = s.clips as Array<Record<string, unknown>>;
    expect(clips[0].timelineStart).toBe(0);
    expect(clips[0].timelineEnd).toBe(10);
    // 第二段：trim 0-4 = 4s，speed 2 → 2s；起点接在第一段之后
    expect(clips[1].timelineStart).toBe(10);
    expect(clips[1].timelineEnd).toBe(12);
    expect(s.totalDuration).toBe(12);
  });

  it('时长未知时不给 timeline 字段（宁缺勿错）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const s = summarizeProject(p, {});
    const clips = s.clips as Array<Record<string, unknown>>;
    expect(clips[0].timelineStart).toBeUndefined();
    expect(s.totalDuration).toBe(0);
  });
});

describe('segmentDuration · 时长换算', () => {
  it('裁剪 + 变速组合', () => {
    expect(segmentDuration({ id: 'c1', file: 'x' }, 10)).toBe(10);
    expect(segmentDuration({ id: 'c1', file: 'x', trimStart: 2, trimEnd: 6 }, 10)).toBe(4);
    expect(segmentDuration({ id: 'c1', file: 'x', trimStart: 2, speed: 2 }, 10)).toBe(4);
    expect(segmentDuration({ id: 'c1', file: 'x', trimEnd: 100 }, 10)).toBe(10);
  });
});

describe('buildRenderPlan · 渲染链路', () => {
  const project: ClipProject = run(null, [
    ['create', { name: '测试片', size: '1080x1920', fps: 30 }],
    ['add_clip', { clips: [{ file: 'C:/a.mp4', label: '段一' }, { file: 'C:/b.mp4', speed: 2 }] }],
    ['add_text', { texts: [{ text: '字幕一', start: 0, end: 3, animation: 'karaoke' }] }],
    ['set_bgm', { file: 'C:/bgm.mp3', volume: 0.3, duck: true }],
  ]);

  it('输出 加工→拼接→字幕→BGM→落盘 的完整步骤链，且末步是目标文件', () => {
    const r = buildRenderPlan({
      project,
      durations: { 'C:/a.mp4': 5, 'C:/b.mp4': 6 },
      hasAudio: { 'C:/a.mp4': false, 'C:/b.mp4': true },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', bgmFile: 'C:/bgm.mp3',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const labels = r.plan.steps.map((s) => s.label);
    expect(labels[0]).toContain('加工第 1 段');
    expect(labels.some((l) => l.includes('拼接'))).toBe(true);
    expect(labels.some((l) => l.includes('烧录字幕（动画 karaoke'))).toBe(true);
    expect(labels.some((l) => l.includes('混入 BGM'))).toBe(true);
    expect(r.plan.steps[r.plan.steps.length - 1].out).toBe('C:/w/out.mp4');
    // 无音轨的段必须补静音源（且带 -t，否则 anullsrc 无限产出）
    const seg1 = r.plan.steps[0].args;
    expect(seg1).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    const tIdx = seg1.indexOf('-t');
    expect(tIdx).toBeGreaterThan(-1);
    // 有音轨的段必须显式映射视频流（有 -map 时默认流选择被禁用）
    const seg2 = r.plan.steps[1].args;
    expect(seg2.join(' ')).toContain('-map 0:v:0');
  });

  it('资产（concat 清单 / srt / ass）通过 assets 返回，供调用方落盘', () => {
    const r = buildRenderPlan({
      project, durations: { 'C:/a.mp4': 5, 'C:/b.mp4': 6 }, hasAudio: { 'C:/a.mp4': true, 'C:/b.mp4': true },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', bgmFile: 'C:/bgm.mp3',
    });
    if (!r.ok) throw new Error(r.error);
    const files = r.plan.assets.map((a) => a.file);
    expect(files.some((f) => f.endsWith('concat.txt'))).toBe(true);
    expect(files.some((f) => f.endsWith('subtitles.srt'))).toBe(true);
    // 有动画 → 必须同时给 ASS
    expect(files.some((f) => f.endsWith('subtitles.ass'))).toBe(true);
    const concat = r.plan.assets.find((a) => a.file.endsWith('concat.txt'))!;
    // concat 清单必须是正斜杠（ffmpeg concat demuxer 不认反斜杠）
    expect(concat.content).toContain('file \'C:/w/seg-001-c1.mp4\'');
  });

  it('无字幕无 BGM 时链路收短（不留空转步骤）', () => {
    const bare = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
    ]);
    const r = buildRenderPlan({
      project: bare, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.steps.some((s) => s.label.includes('烧录字幕'))).toBe(false);
    expect(r.plan.steps.some((s) => s.label.includes('BGM'))).toBe(false);
    // 单段且无后续 → 直接输出到目标文件（不做多余的收尾转存）
    expect(r.plan.steps).toHaveLength(1);
    expect(r.plan.steps[0].out).toBe('C:/w/out.mp4');
  });

  it('空工程明确报错', () => {
    const r = buildRenderPlan({ project: createEmptyProject(), durations: {}, hasAudio: {}, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    expect(r.ok).toBe(false);
  });

  it('图片素材走 kenburns 分支（loop + zoompan，不依赖源时长）', () => {
    const imgProj = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/pic.png', kenburns: { direction: 'in', duration: 5 } }] }],
    ]);
    const r = buildRenderPlan({
      project: imgProj, durations: {}, hasAudio: {}, workDir: 'C:/w', outFile: 'C:/w/o.mp4', imageFiles: ['C:/pic.png'],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.steps[0].args.join(' ')).toContain('zoompan');
    expect(r.plan.totalDuration).toBe(5);
  });

  it('配音替换原声时只映射配音轨；keepOriginalAudio 时混音', () => {
    const withDub = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', audioFile: 'C:/v.mp3' }] }],
    ]);
    // 有配音时 -t 必须只作用于视频输入（放在第一个 -i 之前），否则会去截配音
    const r0 = buildRenderPlan({ project: withDub, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r0.ok) throw new Error(r0.error);
    const a0 = r0.plan.steps[0].args;
    const firstI = a0.indexOf('-i');
    const tIdx0 = a0.indexOf('-t');
    expect(tIdx0).toBeLessThan(firstI); // -t 在第一个 -i 之前
    const r1 = buildRenderPlan({ project: withDub, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r1.ok) throw new Error(r1.error);
    const j1 = r1.plan.steps[0].args.join(' ');
    expect(j1).toContain('-map [v]');
    expect(j1).not.toContain('amix');
    // ★ 用 filter_complex 时不得前置裸 -map 0:v:0（会多出一条未加工视频流 → 规格/调色静默失效）
    expect(j1).not.toContain('-map 0:v:0');

    const keep = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', audioFile: 'C:/v.mp3', keepOriginalAudio: true }] }],
    ]);
    const r2 = buildRenderPlan({ project: keep, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.plan.steps[0].args.join(' ')).toContain('amix=inputs=2');
  });

  it('裁剪用 -ss/-t 且 -t 必须在第一个 -i 之前（放中间会去截后一个输入）', () => {
    const proj = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 1, trimEnd: 5 }] }],
    ]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 7 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const a = r.plan.steps[0].args;
    expect(a[a.indexOf('-ss') + 1]).toBe('1');
    // readDur = segDur × speed = 4 × 1
    expect(a[a.indexOf('-t') + 1]).toBe('4.000');
    expect(a.indexOf('-t')).toBeLessThan(a.indexOf('-i'));
  });

  it('变速时 -t 取「变速前」的读取长度（setpts 后再缩到目标时长）', () => {
    const proj = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', trimEnd: 6, speed: 0.5 }] }],
    ]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 10 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const a = r.plan.steps[0].args;
    // 裁 0~6 = 6s，speed 0.5 → 成片 12s，读 6s
    expect(a[a.indexOf('-t') + 1]).toBe('6.000');
    expect(a.join(' ')).toContain('setpts=PTS/0.500000');
  });

  it('字幕位置/安全区影响 force_style（底部安全区字幕上抬）', () => {
    const proj = run(null, [
      ['create', {}],
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['add_text', { texts: [{ text: '安全区', start: 0, end: 2, safeArea: true, position: 'bottom' }] }],
    ]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const sub = r.plan.steps.find((s) => s.label.includes('烧录字幕'))!;
    const vf = sub.args[sub.args.indexOf('-vf') + 1];
    // MarginV 用 288/1920 系数换算：420px → 63
    expect(vf).toContain('MarginV=63');
    expect(vf).toContain('Alignment=2');
  });
});

describe('buildSrtFromTexts / buildSubtitleAssets', () => {
  it('SRT 按时间排序输出（工程里顺序乱了也不影响成片）', () => {
    const proj = run(null, [
      ['add_text', { texts: [{ text: '后', start: 5, end: 7 }, { text: '前', start: 0, end: 2 }] }],
    ]);
    const srt = buildSrtFromTexts(proj.texts);
    expect(srt.indexOf('前')).toBeLessThan(srt.indexOf('后'));
    expect(srt).toContain('00:00:00,000 --> 00:00:02,000');
  });

  it('无动画 → 只给 SRT；有动画 → 同时给 ASS 且 PlayRes 为真实分辨率', () => {
    const plain = run(null, [['add_text', { texts: [{ text: '静', start: 0, end: 1 }] }]]);
    expect(buildSubtitleAssets(plain, 1080, 1920).ass).toBeUndefined();

    const anim = run(null, [['add_text', { texts: [{ text: '动', start: 0, end: 1, animation: 'fade' }] }]]);
    const asset = buildSubtitleAssets(anim, 1080, 1920);
    expect(asset.ass).toBeTruthy();
    expect(asset.ass).toContain('PlayResX: 1080');
    expect(asset.ass).toContain('\\fad(');
  });

  it('动画 id 非法时降级为无动画（不产坏 ASS）', () => {
    const bad = run(null, [['add_text', { texts: [{ text: 'x', start: 0, end: 1, animation: 'wobble' }] }]]);
    expect(buildSubtitleAssets(bad, 1080, 1920).ass).toBeUndefined();
  });

  it('逐条动画：混用多种动效时每条都按自己的预设渲染（不被第一条套住）', () => {
    const proj = run(null, [
      ['add_text', {
        texts: [
          { text: '片头', start: 0, end: 2, animation: 'zoom' },
          { text: '中段跟读', start: 2, end: 4, animation: 'karaoke' },
          { text: '结尾', start: 4, end: 6, animation: 'fade' },
          { text: '干净的一行', start: 6, end: 8 },
        ],
      }],
    ]);
    const asset = buildSubtitleAssets(proj, 1080, 1920);
    expect(asset.ass).toBeTruthy();
    const dialogues = asset.ass!.split('\n').filter((l) => l.startsWith('Dialogue'));
    // 4 条各一条 Dialogue（fade/karaoke 都不拆行）
    expect(dialogues).toHaveLength(4);
    expect(dialogues[0]).toContain('\\fscx55\\fscy55');   // zoom
    expect(dialogues[1]).toContain('\\k');                  // karaoke
    expect(dialogues[2]).toContain('\\fad(300,300)');       // fade（工程未标 preset 时的兜底项是 'fade'）
    expect(dialogues[3]).toContain('\\fad(300,300)');       // 无动画条目也走淡入
    // 关键：中段不是 zoom（若被第一条套住，这里会是 \fscx55）
    expect(dialogues[1]).not.toContain('\\fscx55');
  });

  it('逐条位置：标题居中 + 字幕底部混排各自生效', () => {
    const proj = run(null, [
      ['add_text', {
        texts: [
          { text: '标题', start: 0, end: 2, animation: 'slide', position: 'center' },
          { text: '正文', start: 2, end: 4, animation: 'slide', position: 'bottom' },
        ],
      }],
    ]);
    const ass = buildSubtitleAssets(proj, 1080, 1920).ass!;
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue'));
    const yOf = (d: string) => Number(d.match(/\\move\(-?\d+,(-?\d+),-?\d+,(-?\d+),/ )![2]);
    expect(yOf(dialogues[0])).toBe(960);   // center → resY/2
    expect(yOf(dialogues[1])).toBe(1720);  // bottom → resY - mv(200)
  });
});
// ===== 裁剪 / 关键帧 / 画中画（2026-10-08 落地，op 层 + 渲染计划两侧一起钉） =====
describe('applyClipOp · crop / keyframes / overlay', () => {
  it('add_clip 归一化 crop：范围钳制 + 全画幅视为未裁剪（不写脏字段进工程）', () => {
    const p = run(null, [['add_clip', { clips: [
      { file: 'C:/a.mp4', crop: { x: -0.5, y: 2, w: 5, h: 0.8 } },   // 越界 → 钳制
      { file: 'C:/b.mp4', crop: { x: 0, y: 0, w: 1, h: 1 } },        // 全画幅 → 丢弃
    ] }]]);
    expect(p.clips[0].crop).toEqual({ x: 0, y: 0.9, w: 1, h: 0.8 });
    expect(p.clips[1].crop).toBeUndefined();
  });

  it('update_clip 把 patch.crop=null 视为清除裁剪', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }] }]]);
    expect(p.clips[0].crop).toBeDefined();
    p = run(p, [['update_clip', { id: 'c1', patch: { crop: null } }]]);
    expect(p.clips[0].crop).toBeUndefined();
  });

  it('keyframes 归一化：无意义点丢弃（全缺省/scale=1）、按 t 排序、t 钳到 0~1', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
      { t: 1, scale: 1 },               // 无意义（scale=1 且无位移/透明度）→ 丢
      { t: 0.5, scale: 2 },             // 保留
      { t: 0, opacity: 0 },             // 保留（透明度<1 有意义）
      { t: 3, scale: 1.5 },             // t 越界 → 钳到 1
    ] }]}]]);
    const kf = p.clips[0].keyframes!;
    expect(kf.map((k) => k.t)).toEqual([0, 0.5, 1]);
    expect(kf[1].scale).toBe(2);
  });

  it('update_clip patch.keyframes=空数组 清除关键帧', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [{ t: 0, scale: 1.5 }] }] }]]);
    p = run(p, [['update_clip', { id: 'c1', patch: { keyframes: [] } }]]);
    expect(p.clips[0].keyframes).toBeUndefined();
  });

  it('add_overlay 分配 o1/o2…；end<=start 明确报错；remove_overlay 删空后清掉 overlays 字段', () => {
    const r1 = applyClipOp(null, 'add_overlay', { file: 'C:/p1.mp4', start: 0, end: 2 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.project.overlays![0].id).toBe('o1');
    expect(r1.project.overlays![0].scale).toBe(0.35); // 缺省
    const bad = applyClipOp(r1.project, 'add_overlay', { file: 'C:/p2.mp4', start: 3, end: 3 });
    expect(bad.ok).toBe(false);
    const r2 = applyClipOp(r1.project, 'add_overlay', { overlays: [{ file: 'C:/p2.mp4', start: 1, end: 3 }] });
    if (!r2.ok) throw new Error(r2.error);
    const r3 = applyClipOp(r2.project, 'remove_overlay', { id: 'o1' });
    expect(r3.ok).toBe(true);
    const r4 = applyClipOp(r3.project, 'remove_overlay', { id: 'o2' });
    expect(r4.ok).toBe(true);
    expect(r4.project.overlays).toBeUndefined();
  });

  it('update_overlay：patch 合并后仍过校验（file 清空 / end<=start 拒绝）', () => {
    let p = run(null, [['add_overlay', { file: 'C:/p1.mp4', start: 0, end: 2 }]]);
    const bad = applyClipOp(p, 'update_overlay', { id: 'o1', patch: { end: 0 } });
    expect(bad.ok).toBe(false);
    p = run(p, [['update_overlay', { id: 'o1', patch: { pos: 'topleft', scale: 0.5 } }]]);
    expect(p.overlays![0].pos).toBe('topleft');
    expect(p.overlays![0].scale).toBe(0.5);
  });

  it('summarizeProject 带出 overlays（模型看摘要就能推算画中画时间）', () => {
    const p = run(null, [['add_overlay', { file: 'C:/p1.mp4', start: 0.5, end: 2.5 }]]);
    const s = summarizeProject(p) as { overlays?: Array<{ index: number; id: string }> };
    expect(s.overlays?.[0]).toMatchObject({ index: 1, id: 'o1' });
  });
});

describe('buildRenderPlan · 裁剪/关键帧/画中画', () => {
  it('crop 段：滤镜链包含裁剪回填（crop→scale→crop→setsar）', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', crop: { x: 0.1, y: 0, w: 0.9, h: 1 } }] }]]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const step = r.plan.steps[0];
    const argsStr = JSON.stringify(step.args);
    expect(argsStr).toContain('crop=iw*0.9000:ih*1.0000:iw*0.1000:ih*0.0000');
  });

  it('只有缩放关键帧：走 -vf 的 zoompan（不需要垫黑底）；z 表达式分段线性', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [{ t: 0, scale: 1 }, { t: 1, scale: 1.5 }] }]}]]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 4 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const argsStr = JSON.stringify(r.plan.steps[0].args);
    expect(argsStr).toContain('zoompan=');
    expect(argsStr).not.toContain('geq');
  });

  it('透明度关键帧：必须走 filter_complex 垫黑底（geq alpha + overlay 到 color 源），且显式 -map [v0]', () => {
    // ★ 此前的坑：yuv420p 无 alpha，直接改 alpha 会被静默丢弃 → 必须 format=yuva420p + 黑底合成
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }] }]}]]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 4 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const step = r.plan.steps[0];
    const argsStr = JSON.stringify(step.args);
    expect(argsStr).toContain('yuva420p');
    expect(argsStr).toContain('geq=');
    expect(argsStr).toContain('color=c=black');
    expect(argsStr).toContain('-map');
    expect(argsStr).toContain('[v0]');
  });

  it('画中画：产生「画中画合成」步骤；enable 窗口与锚点进 overlay 滤镜', () => {
    const proj = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['add_overlay', { file: 'C:/p.png', start: 1, end: 3, pos: 'topright', scale: 0.4 }],
    ]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const pip = r.plan.steps.find((s) => s.label.includes('画中画'));
    expect(pip).toBeDefined();
    const argsStr = JSON.stringify(pip!.args);
    expect(argsStr).toContain('scale=');
    expect(argsStr).toContain("enable='between(t,1.000,3.000)'");
    expect(argsStr).toContain('main_w-overlay_w-main_w*0.04'); // topright 的 x 表达式
  });

  it('不透明度全为 1 的关键帧不触发 geq（不付逐像素滤镜的性能代价）', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [{ t: 0, scale: 1.3 }, { t: 1, opacity: 1 }] }]}]]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 4 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    expect(JSON.stringify(r.plan.steps[0].args)).not.toContain('geq');
  });
});

describe('关键帧缓动（ease）与端点锚', () => {
  it('起点锚 {t:0,scale:1} 不再被丢弃（否则"从原尺寸推近"会变成全程常量）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
      { t: 0, scale: 1 }, { t: 1, scale: 1.4 },
    ] }] }]]);
    const kf = p.clips[0].keyframes!;
    expect(kf.map((k) => k.t)).toEqual([0, 1]);
    expect(kf[0].scale).toBe(1);
  });

  it('整条曲线恒定（缩放恒 1）仍然整体丢弃 —— 不产生无效关键帧', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
      { t: 0, scale: 1 }, { t: 1, scale: 1 },
    ] }] }]]);
    expect(p.clips[0].keyframes).toBeUndefined();
  });

  it('ease 归一化：合法值保留、非法值丢弃；bezier 控制点钳制', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
      { t: 0, scale: 1, ease: 'inout' },
      { t: 0.5, scale: 1.5, ease: 'nope' },
      { t: 1, scale: 1, ease: 'bezier', bezier: [-1, 5, 2, 0.3] },
    ] }] }]]);
    const kf = p.clips[0].keyframes!;
    expect(kf[0].ease).toBe('inout');
    expect(kf[1].ease).toBeUndefined();
    expect(kf[2].ease).toBe('bezier');
    // x 钳到 0~1，y 放宽到 -1~2
    expect(kf[2].bezier).toEqual([0, 2, 1, 0.3]);
  });

  it('缓动会让缩放表达式变长（插入采样点），线性则保持 1 段', () => {
    const exprOf = (ease?: string) => {
      const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
        { t: 0, scale: 1, ...(ease ? { ease } : {}) }, { t: 1, scale: 1.4 },
      ] }] }]]);
      const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 4 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
      if (!r.ok) throw new Error(r.error);
      return JSON.stringify(r.plan.steps[0].args);
    };
    const countIf = (s: string) => (s.match(/if\(lt\(/g) || []).length;
    expect(countIf(exprOf())).toBe(1);
    expect(countIf(exprOf('inout'))).toBeGreaterThan(1);
  });

  it('透明度淡出：[{t:0,opacity:1},{t:1,opacity:0}] 不能退化成"整段全黑"', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', keyframes: [
      { t: 0, opacity: 1 }, { t: 1, opacity: 0 },
    ] }] }]]);
    const r = buildRenderPlan({ project: proj, durations: { 'C:/a.mp4': 4 }, hasAudio: { 'C:/a.mp4': true }, workDir: 'C:/w', outFile: 'C:/w/o.mp4' });
    if (!r.ok) throw new Error(r.error);
    const s = JSON.stringify(r.plan.steps[0].args);
    expect(s).toContain('geq=');
    // 表达式必须随 T 变化（含 T），不能是常量 0
    expect(s).toMatch(/a='255\*clip\([^']*T[^']*,0,1\)'/);
    expect(s).not.toContain("a='255*clip(0,0,1)'");
  });
});

describe('图片段 kenburns 方向（含定格用的 none）', () => {
  it("direction='none' 保留：定格帧要的是「静止但可改时长」", () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.png', kenburns: { direction: 'none', duration: 3 } }] }]]);
    expect(p.clips[0].kenburns).toEqual({ direction: 'none', duration: 3 });
  });

  it('未知方向回落到 in；时长下限 1 秒', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.png', kenburns: { direction: 'weird', duration: 0.2 } }] }]]);
    expect(p.clips[0].kenburns).toEqual({ direction: 'in', duration: 1 });
  });

  it("direction='none' 渲染成恒定缩放（z='1'），成片时长取 duration", () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.png', kenburns: { direction: 'none', duration: 3 } }] }]]);
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.png': 0 },
      hasAudio: {},
      imageFiles: ['C:/a.png'],
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    expect(JSON.stringify(r.plan.steps[0].args)).toContain("zoompan=z='1'");
    expect(r.plan.totalDuration).toBe(3);
  });
});

describe('曲线变速（speedCurve）', () => {
  it('归一化：排序 + 钳制；平直曲线与单点直接丢弃', () => {
    const p = run(null, [['add_clip', { clips: [
      { file: 'C:/a.mp4', speedCurve: [{ t: 1, speed: 9 }, { t: 0, speed: 0 }] },
      { file: 'C:/b.mp4', speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 1.01 }] },
      { file: 'C:/c.mp4', speedCurve: [{ t: 0, speed: 1 }] },
    ] }]]);
    expect(p.clips[0].speedCurve).toEqual([{ t: 0, speed: 0.25 }, { t: 1, speed: 4 }]);
    expect(p.clips[1].speedCurve).toBeUndefined();
    expect(p.clips[2].speedCurve).toBeUndefined();
  });

  it('与恒定倍速互斥：设曲线清 speed，设 speed 清曲线', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', speed: 2, speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 2 }] }] }]]);
    expect(p.clips[0].speed).toBeUndefined();
    expect(p.clips[0].speedCurve).toBeTruthy();
    p = run(p, [['update_clip', { id: 'c1', patch: { speed: 1.5 } }]]);
    expect(p.clips[0].speed).toBe(1.5);
    expect(p.clips[0].speedCurve).toBeUndefined();
  });

  it('段时长按曲线算（快慢交替 ≠ 源长）', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', speedCurve: [{ t: 0, speed: 2 }, { t: 0.5, speed: 1 }, { t: 1, speed: 2 }] }] }]]);
    const d = segmentDuration(p.clips[0], 10);
    expect(d).toBeLessThan(10);
    expect(d).toBeGreaterThan(4);
  });

  it('渲染：整段 → 8 片 → 拼接；片里带 setpts 与 atempo；总时长用曲线口径', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 2 }] }] }]]);
    const r = buildRenderPlan({
      project: proj, durations: { 'C:/a.mp4': 10 }, hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w', outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    const labels = r.plan.steps.map((s) => s.label);
    expect(labels[0]).toContain('加工第 1 段');
    expect(labels.filter((l) => l.startsWith('变速片')).length).toBe(8);
    expect(labels.some((l) => l.includes('拼接变速片'))).toBe(true);
    const all = JSON.stringify(r.plan.steps);
    expect(all).toContain('setpts=PTS/');
    expect(all).toContain('atempo=');
    expect(r.plan.totalDuration).toBeLessThan(10);
  });

  it('预览定位：减速曲线下，输出中点对应的源时间 > 一半（非线性映射生效）', () => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 0.5 }] }] }]]);
    const dur = segmentDuration(proj.clips[0], 10);
    const loc = locateTimeline(proj, dur * 0.5, { 'C:/a.mp4': 10 });
    expect(loc).toBeTruthy();
    expect(loc!.srcOffset).toBeGreaterThan(5.3);
    expect(loc!.srcOffset).toBeLessThan(6.5);
  });
});

describe('导出质量档与封面帧', () => {
  const planOf = (quality: string | undefined, fast = false) => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    if (quality) proj.output.quality = quality as 'low' | 'std' | 'high';
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.mp4': 4 },
      hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
      fast,
    });
    if (!r.ok) throw new Error(r.error);
    return r.plan;
  };

  it('create / set_output 接受 quality，非法值报错（不静默回落）', () => {
    const p = run(null, [['create', { quality: 'high' }]]);
    expect(p.output.quality).toBe('high');
    const r = applyClipOp(p, 'set_output', { quality: 'ultra' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('quality');
  });

  it('三档对应不同 crf 与音轨码率', () => {
    expect(JSON.stringify(planOf('low').steps[0].args)).toContain('"-crf","28"');
    expect(JSON.stringify(planOf('low').steps[0].args)).toContain('128k');
    expect(JSON.stringify(planOf('high').steps[0].args)).toContain('"-crf","18"');
    expect(JSON.stringify(planOf('high').steps[0].args)).toContain('256k');
    // 未设档 → std
    expect(JSON.stringify(planOf(undefined).steps[0].args)).toContain('"-crf","21"');
    expect(JSON.stringify(planOf(undefined).steps[0].args)).toContain('192k');
  });

  it('预览档：固定 crf 30，且不出封面', () => {
    const plan = planOf(undefined, true);
    expect(JSON.stringify(plan.steps[0].args)).toContain('"-crf","30"');
    expect(plan.cover).toBeUndefined();
    expect(plan.steps.some((s) => s.label === '导出封面')).toBe(false);
  });

  it('正式导出附带封面任务：产物与成片同目录、从成片抽帧，且不污染 steps', () => {
    const plan = planOf(undefined);
    expect(plan.cover?.out).toBe('C:/w/o-cover.jpg');
    expect(plan.cover?.args.join(' ')).toContain('C:/w/o.mp4');
    // steps 的不变式是「末步产物 = 成片」，封面不能混进去
    expect(plan.steps.some((s) => s.out.endsWith('.jpg'))).toBe(false);
  });
});

describe('特效参数（fxParams）', () => {
  const renderArgs = (seg: Record<string, unknown>) => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', ...seg }] }]]);
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.mp4': 4 },
      hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    return JSON.stringify(r.plan.steps[0].args);
  };

  it('只收注册表声明的键；越界钳制；等于默认值不落盘', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', fx: 'shake', fxParams: {
      amplitude: 0.02, freq: 999, nope: 5,
    } }] }]]);
    // freq 钳到上限 40；nope 不是声明过的键 → 丢弃
    expect(p.clips[0].fxParams).toEqual({ amplitude: 0.02, freq: 40 });
  });

  it('全部等于默认值 / 无参数特效 → 不写 fxParams', () => {
    const p = run(null, [['add_clip', { clips: [
      { file: 'C:/a.mp4', fx: 'shake', fxParams: { amplitude: 0.006 } },
      { file: 'C:/b.mp4', fx: 'mirror', fxParams: { amplitude: 0.02 } },
    ] }]]);
    expect(p.clips[0].fxParams).toBeUndefined();
    expect(p.clips[1].fxParams).toBeUndefined();
  });

  it('换特效会丢掉旧特效的参数；清空特效一并清参数', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', fx: 'shake', fxParams: { amplitude: 0.02 } }] }]]);
    p = run(p, [['update_clip', { id: 'c1', patch: { fx: 'pixelate' } }]]);
    expect(p.clips[0].fx).toBe('pixelate');
    expect(p.clips[0].fxParams).toBeUndefined();
    p = run(p, [['update_clip', { id: 'c1', patch: { fxParams: { blocks: 20 } } }]]);
    expect(p.clips[0].fxParams).toEqual({ blocks: 20 });
    p = run(p, [['update_clip', { id: 'c1', patch: { fx: '' } }]]);
    expect(p.clips[0].fxParams).toBeUndefined();
  });

  it('渲染串带上参数值（马赛克块数）', () => {
    expect(renderArgs({ fx: 'pixelate', fxParams: { blocks: 20 } })).toContain('iw/20');
  });

  it('默认参数渲染串里不留占位符', () => {
    const s = renderArgs({ fx: 'bloom' });
    expect(s).toContain('gblur=sigma=14');
    expect(s).not.toContain('{sigma}');
  });
});

describe('手动调色（adjust）与滤镜强度', () => {
  const renderArgs = (seg: Record<string, unknown>) => {
    const proj = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', ...seg }] }]]);
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.mp4': 4 },
      hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    return JSON.stringify(r.plan.steps[0].args);
  };

  it('归一化：越界钳制，等于默认值的项不落盘', () => {
    const p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', adjust: {
      brightness: 9, contrast: 1, saturation: 0.5, temperature: -9, sharpness: -1, vignette: 0,
    } }] }]]);
    // brightness 钳到 0.5、temperature 钳到 -1；contrast/sharpness/vignette 是默认值 → 丢弃
    expect(p.clips[0].adjust).toEqual({ brightness: 0.5, saturation: 0.5, temperature: -1 });
  });

  it('全默认的 adjust 不写字段；update_clip 传 null 可清除', () => {
    let p = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', adjust: { brightness: 0, contrast: 1 } }] }]]);
    expect(p.clips[0].adjust).toBeUndefined();
    p = run(p, [['update_clip', { id: 'c1', patch: { adjust: { vignette: 0.6 } } }]]);
    expect(p.clips[0].adjust).toEqual({ vignette: 0.6 });
    p = run(p, [['update_clip', { id: 'c1', patch: { adjust: null } }]]);
    expect(p.clips[0].adjust).toBeUndefined();
  });

  it('滤镜强度 1 = 直接串联；<1 走 split+blend 按比例混合', () => {
    const full = renderArgs({ colorPreset: 'cinema' });
    expect(full).toContain('colorbalance');   // cinema 预设的滤镜串
    expect(full).not.toContain('all_opacity');

    const half = renderArgs({ colorPreset: 'cinema', colorStrength: 0.5 });
    expect(half).toContain('split[csA][csB]');
    expect(half).toContain('all_opacity=0.500');
  });

  it('强度越界钳到 0~1；钳完等于 1 就不落字段', () => {
    const p = run(null, [['add_clip', { clips: [
      { file: 'C:/a.mp4', colorPreset: 'warm', colorStrength: 5 },
      { file: 'C:/b.mp4', colorPreset: 'warm', colorStrength: 1 },
      { file: 'C:/c.mp4', colorPreset: 'warm', colorStrength: 0.3 },
    ] }]]);
    expect(p.clips[0].colorStrength).toBeUndefined();   // 5 → 钳到 1 → 与默认同
    expect(p.clips[1].colorStrength).toBeUndefined();
    expect(p.clips[2].colorStrength).toBe(0.3);
  });

  it('手动调节顺序：eq → colorbalance → unsharp → vignette（暗角必须最后）', () => {
    const s = renderArgs({ adjust: { brightness: 0.1, temperature: 0.5, sharpness: 0.6, vignette: 0.4 } });
    expect(s).toContain('eq=brightness=0.100');
    expect(s).toContain('colorbalance=rs=0.075');
    expect(s).toContain('unsharp=5:5:0.900');
    expect(s).toContain('vignette=angle=PI/3.80');
    expect(s.indexOf('unsharp')).toBeLessThan(s.indexOf('vignette'));
  });

  it('预设 + 手动调节可叠加（预设在前）', () => {
    const s = renderArgs({ colorPreset: 'cinema', adjust: { brightness: 0.08 } });
    const iPreset = s.indexOf('colorbalance=rs=-.06');
    const iAdjust = s.indexOf('eq=brightness=0.080');
    expect(iPreset).toBeGreaterThan(-1);
    expect(iAdjust).toBeGreaterThan(iPreset);
  });
});

describe('片段方向：旋转 / 镜像 / 倒放', () => {
  const oneClip = (seg: Record<string, unknown>) =>
    run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4', ...seg }] }]]);

  const renderArgs = (proj: ClipProject, dur = 4) => {
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.mp4': dur },
      hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
    });
    if (!r.ok) throw new Error(r.error);
    return JSON.stringify(r.plan.steps[0].args);
  };

  it('归一化：rotate 只认 90/180/270、flip 只认 h/v/both、reverse 只认 true', () => {
    const p = oneClip({ rotate: 90, flip: 'h', reverse: true });
    expect(p.clips[0].rotate).toBe(90);
    expect(p.clips[0].flip).toBe('h');
    expect(p.clips[0].reverse).toBe(true);

    const bad = oneClip({ rotate: 45, flip: 'diag', reverse: 'yes' });
    expect(bad.clips[0].rotate).toBeUndefined();
    expect(bad.clips[0].flip).toBeUndefined();
    expect(bad.clips[0].reverse).toBeUndefined();
  });

  it('update_clip 能改也能清（rotate:0 / flip:"" / reverse:false）', () => {
    let p = oneClip({ rotate: 180, flip: 'v', reverse: true });
    expect(p.clips[0].rotate).toBe(180);
    p = run(p, [['update_clip', { id: 'c1', patch: { rotate: 0, flip: '', reverse: false } }]]);
    expect(p.clips[0].rotate).toBeUndefined();
    expect(p.clips[0].flip).toBeUndefined();
    expect(p.clips[0].reverse).toBeUndefined();
  });

  it('旋转必须在规格化之前（转 90° 后宽高互换，先归一化会破坏 concat 规格）', () => {
    const s = renderArgs(oneClip({ rotate: 90 }));
    expect(s).toContain('transpose=1');
    expect(s.indexOf('transpose=1')).toBeLessThan(s.indexOf('scale='));
  });

  it('镜像写 hflip / vflip', () => {
    expect(renderArgs(oneClip({ flip: 'h' }))).toContain('hflip');
    expect(renderArgs(oneClip({ flip: 'v' }))).toContain('vflip');
    expect(renderArgs(oneClip({ flip: 'both' }))).toContain('hflip,vflip');
  });

  it('倒放：视频 reverse 排在淡入之前，音轨同步 areverse', () => {
    const s = renderArgs(oneClip({ reverse: true, fadeIn: 1 }));
    expect(s).toContain(',reverse,fade=t=in');
    expect(s).toContain('areverse');
  });

  it(`倒放超长（> ${REVERSE_MAX_SEC}s）直接拒绝，并说清是内存原因`, () => {
    const proj = oneClip({ reverse: true });
    const r = buildRenderPlan({
      project: proj,
      durations: { 'C:/a.mp4': REVERSE_MAX_SEC + 5 },
      hasAudio: { 'C:/a.mp4': true },
      workDir: 'C:/w',
      outFile: 'C:/w/o.mp4',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('上限');
    expect(r.error).toContain('reverse');
  });
});
