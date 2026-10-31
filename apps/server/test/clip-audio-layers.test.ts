/**
 * 定时音频层（P0-7）单测：op 归一化 / 图层双向投影 / 渲染计划。
 *
 * 验收对应：
 *   · 一处转场能放独立音效 → add_audio 把 0.5~1 秒的声音放到指定时间点
 *   · 两段 BGM 无缝接 → 两条首尾相接的音频层
 *
 * ★ 为什么渲染计划要单独钉：音频层写进计划只要**一步**（adelay 定位 + amix 直加），
 *   写错了不会报错 —— 表现为"音效出现了但位置整体偏了几秒"或"全片人声被压掉一半"。
 */
import { describe, it, expect } from 'vitest';
import { applyClipOp, layersFromV1Fields, v1FieldsFromLayers, nextAudioSlot, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan } from '../src/services/clip-render';

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

function planOf(p: ClipProject) {
  const r = buildRenderPlan({
    project: p, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true },
    workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
    // bgm 的文件由调用方解析后传入（与 api-tool-executor 一致）
    ...(p.bgm ? { bgmFile: p.bgm.file } : {}),
  });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe('P0-7 · add_audio / update_audio / remove_audio', () => {
  it('分配 a1/a2…；默认值不写字段（音量 1 / 无淡入淡出 / 无 duck）', () => {
    const p = run(null, [['add_audio', { audios: [
      { file: 'C:/whoosh.wav', start: 1, end: 2 },
      { file: 'C:/bgm2.mp3', start: 2, end: 9 },
    ] }]]);
    expect(p.audios!.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(p.audios![0]).toEqual({ id: 'a1', file: 'C:/whoosh.wav', start: 1, end: 2 });
  });

  it('非法条目明确报错：缺 file / end<=start', () => {
    expect(applyClipOp(null, 'add_audio', { audios: [{ start: 0, end: 1 }] }).ok).toBe(false);
    expect(applyClipOp(null, 'add_audio', { audios: [{ file: 'C:/x.wav', start: 2, end: 2 }] }).ok).toBe(false);
  });

  it('值域钳制：音量 0~2；淡入淡出不超过本段时长（超了 ffmpeg 会静默不生效）', () => {
    const p = run(null, [['add_audio', { audios: [
      { file: 'C:/s.wav', start: 0, end: 1, volume: 9, fadeIn: 8, fadeOut: -1, trimStart: -3 },
    ] }]]);
    expect(p.audios![0].volume).toBe(2);
    expect(p.audios![0].fadeIn).toBe(1);        // 段长 1 秒 → 钳到 1
    expect(p.audios![0].fadeOut).toBeUndefined(); // 负值 → 丢弃
    expect(p.audios![0].trimStart).toBeUndefined();
  });

  it('update_audio：改音量/淡出；传 volume:null 回到默认；时间非法时拒绝', () => {
    let p = run(null, [['add_audio', { audios: [{ file: 'C:/s.wav', start: 0, end: 4, volume: 0.5, fadeOut: 0.2 }] }]]);
    p = run(p, [['update_audio', { id: 'a1', patch: { volume: 0.9, fadeOut: 1.5 } }]]);
    expect(p.audios![0].volume).toBe(0.9);
    expect(p.audios![0].fadeOut).toBe(1.5);
    p = run(p, [['update_audio', { id: 'a1', patch: { volume: null } }]]);
    expect(p.audios![0].volume).toBeUndefined();
    expect(applyClipOp(p, 'update_audio', { id: 'a1', patch: { end: 0 } }).ok).toBe(false);
  });

  it('remove_audio 删空后清掉字段；clear_audios 一次清空', () => {
    let p = run(null, [['add_audio', { audios: [{ file: 'C:/s.wav', start: 0, end: 1 }] }]]);
    p = run(p, [['remove_audio', { id: 'a1' }]]);
    expect(p.audios).toBeUndefined();
    p = run(p, [['add_audio', { audios: [{ file: 'C:/s.wav', start: 0, end: 1 }, { file: 'C:/t.wav', start: 1, end: 2 }] }]]);
    p = run(p, [['clear_audios', {}]]);
    expect(p.audios).toBeUndefined();
  });

  it('双向投影：audios ↔ layers[kind=audio] 不丢字段', () => {
    const audios = [{ id: 'a1', file: 'C:/s.wav', start: 1, end: 2.5, volume: 0.4, fadeIn: 0.2, trimStart: 3 }];
    const L = layersFromV1Fields([], [], audios);
    expect(L).toHaveLength(1);
    expect(L[0].kind).toBe('audio');
    expect(L[0].audio).toEqual({ volume: 0.4, fadeIn: 0.2, trimStart: 3 });
    expect(v1FieldsFromLayers(L).audios[0]).toEqual(audios[0]);
  });

  it('老工程（无 audios）投影后读回仍是空数组', () => {
    const L = layersFromV1Fields([{ id: 't1', text: 'a', start: 0, end: 1 }], []);
    expect(v1FieldsFromLayers(L).audios).toEqual([]);
  });
});

describe('P1-8 · 配音落点（add_tts 的默认 start）', () => {
  it('nextAudioSlot：接在最后一条音频层之后；没有音频层从 0 开始', () => {
    const empty = run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    expect(nextAudioSlot(empty)).toBe(0);
    const p = run(empty, [['add_audio', { audios: [
      { file: 'C:/a.wav', start: 1, end: 2.5 },
      { file: 'C:/b.wav', start: 2.5, end: 4 },
    ] }]]);
    expect(nextAudioSlot(p)).toBe(4);
  });
});

describe('P0-7 · 渲染计划（音频层混入）', () => {
  it('★ 没有音频层 → 一步不多（老工程渲染计划不变）', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['set_bgm', { file: 'C:/m.mp3', volume: 0.25 }],
    ]);
    const labels = planOf(p).steps.map((s) => s.label);
    expect(labels.some((l) => l.includes('混入音频层'))).toBe(false);
    expect(labels.some((l) => l.includes('混入 BGM'))).toBe(true);
  });

  it('★ 有音频层 → 在 BGM 之前混入；adelay 定位、音量/淡入淡出、amix normalize=0', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['set_bgm', { file: 'C:/m.mp3', volume: 0.25 }],
      ['add_audio', { audios: [{ file: 'C:/whoosh.wav', start: 1.5, end: 2.1, volume: 0.8, fadeIn: 0.05, fadeOut: 0.1 }] }],
    ]);
    const plan = planOf(p);
    const labels = plan.steps.map((s) => s.label);
    const iAudio = labels.findIndex((l) => l.includes('混入音频层（1 段）'));
    const iBgm = labels.findIndex((l) => l.includes('混入 BGM'));
    expect(iAudio).toBeGreaterThan(-1);
    expect(iAudio).toBeLessThan(iBgm);

    const step = plan.steps[iAudio];
    const argsStr = step.args.join(' ');
    expect(argsStr).toContain('-t 0.600 -i C:/whoosh.wav');   // -t 紧贴本输入
    expect(argsStr).toContain('adelay=1500|1500');
    expect(argsStr).toContain('volume=0.800');
    expect(argsStr).toContain('afade=t=in:st=0:d=0.050');
    expect(argsStr).toContain('afade=t=out:st=0.500:d=0.100');
    expect(argsStr).toContain('amix=inputs=2:duration=first');
    // ★ normalize=0：默认归一化会把全片人声压掉一半
    expect(argsStr).toContain('normalize=0');
    expect(argsStr).toContain('alimiter');
  });

  it('超出片尾的音频截到片尾；起点已在片尾之后的整条跳过', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['add_audio', { audios: [
        { file: 'C:/long.wav', start: 4, end: 10 },
        { file: 'C:/late.wav', start: 6, end: 8 },
      ] }],
    ]);
    const plan = planOf(p);
    const step = plan.steps.find((s) => s.label.includes('混入音频层'))!;
    expect(step.label).toContain('（1 段）');           // 晚于片尾的那条被跳过
    expect(step.args.join(' ')).toContain('-t 1.000 -i C:/long.wav');  // 5 - 4 = 1 秒
    expect(step.args.join(' ')).not.toContain('late.wav');
  });

  it('trimStart 走输入 -ss（在 -i 之前）', () => {
    const p = run(null, [
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
      ['add_audio', { audios: [{ file: 'C:/s.wav', start: 0, end: 1, trimStart: 2.5 }] }],
    ]);
    const step = planOf(p).steps.find((s) => s.label.includes('混入音频层'))!;
    const s = step.args.join(' ');
    expect(s).toContain('-ss 2.500 -t 1.000 -i C:/s.wav');
    expect(s).not.toContain('adelay');   // start=0 不需要延迟
  });
});
