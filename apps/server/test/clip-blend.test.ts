/**
 * 混合模式（P0-3）单测：blend 滤镜串、非法值归一化、老工程不变、投影往返。
 *
 * ★★★ 为什么单独一个文件：混合模式横跨三层（工程模型 / 渲染 / 投影），
 *   任何一层漏了都会表现成"设置了没反应"或"老工程渲染变了"，且都不报错。
 *   本机没有 ffmpeg，这里锁的是**纯函数层的滤镜串**；观感需真机出片验证。
 */
import { describe, it, expect } from 'vitest';
import {
  applyClipOp,
  migrateV1ToV2,
  layersFromV1Fields,
  v1FieldsFromLayers,
  type ClipProject,
  type ClipOverlay,
  type ClipProjectV1,
} from '../src/services/clip-project';
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

/** 取「画中画合成」步骤的 -filter_complex 串。 */
function pipFc(project: ClipProject): string {
  const r = buildRenderPlan({
    project,
    durations: { 'C:/a.mp4': 5 },
    hasAudio: { 'C:/a.mp4': true },
    workDir: 'C:/w',
    outFile: 'C:/w/o.mp4',
  });
  if (!r.ok) throw new Error(r.error);
  const pip = r.plan.steps.find((s) => s.label.includes('画中画'));
  if (!pip) throw new Error('没有画中画步骤');
  const i = pip.args.indexOf('-filter_complex');
  return pip.args[i + 1];
}

const baseProject = () => run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);

describe('渲染 · blend 滤镜串', () => {
  it('★ normal（无 blend 字段）：保持原 overlay 路径（含时间轴对齐）', () => {
    const p = run(baseProject(), [
      ['add_overlay', { file: 'C:/p.png', start: 1, end: 3, pos: 'topright', scale: 0.4 }],
    ]);
    expect(pipFc(p)).toBe(
      "[1:v]scale=432:-2,setsar=1,setpts=PTS+1.000/TB[ov0];" +
      "[0:v][ov0]overlay=x='main_w-overlay_w-main_w*0.04':y='main_h*0.04':enable='between(t,1.000,3.000)'[v0]",
    );
  });

  it('★ v1 老工程（画中画没有 blend 字段）：迁移后渲染计划与普通覆盖一致', () => {
    const v1: ClipProjectV1 = {
      version: 1, name: '老工程', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/a.mp4' }], texts: [],
      overlays: [{ id: 'o1', file: 'C:/p.png', start: 1, end: 3, pos: 'topright', scale: 0.4 }],
    };
    expect(pipFc(migrateV1ToV2(v1))).toBe(
      "[1:v]scale=432:-2,setsar=1,setpts=PTS+1.000/TB[ov0];" +
      "[0:v][ov0]overlay=x='main_w-overlay_w-main_w*0.04':y='main_h*0.04':enable='between(t,1.000,3.000)'[v0]",
    );
  });

  it('★ screen：中性色黑底 + 画幅对齐 + blend=all_mode=screen', () => {
    const p = run(baseProject(), [
      ['add_overlay', { file: 'C:/p.png', start: 1, end: 3, pos: 'topright', scale: 0.4, blend: 'screen' }],
    ]);
    const fc = pipFc(p);
    expect(fc).toContain('color=c=0x000000:s=1080x1920:r=30:d=5.000[bl0]');
    expect(fc).toContain('setpts=PTS+1.000/TB[ov0]');
    expect(fc).toContain('blend=all_mode=screen:all_opacity=1:shortest=1[v0]');
    expect(fc).not.toContain('blend=all_mode=normal');
  });

  it('★ multiply 用白色中性底（黑底会把整帧乘成黑）；add 映射到 ffmpeg 的 addition', () => {
    const mul = run(baseProject(), [
      ['add_overlay', { file: 'C:/p.png', start: 0, end: 2, blend: 'multiply' }],
    ]);
    expect(pipFc(mul)).toContain('color=c=0xFFFFFF');
    expect(pipFc(mul)).toContain('all_mode=multiply');

    const add = run(baseProject(), [
      ['add_overlay', { file: 'C:/p.png', start: 0, end: 2, blend: 'add' }],
    ]);
    expect(pipFc(add)).toContain('all_mode=addition');
  });

  it('★ 多层：普通层先叠加，混合层再与"已叠加的画面"混合（链式 prev 不断）', () => {
    const p = run(baseProject(), [
      ['add_overlay', { file: 'C:/pip.png', start: 1, end: 3 }],
      ['add_overlay', { file: 'C:/glow.png', start: 0, end: 5, blend: 'screen' }],
    ]);
    const fc = pipFc(p);
    expect(fc).toContain('[0:v][ov0]overlay=');          // 第一层普通覆盖
    expect(fc).toContain('[2:v]scale=');                 // 第二层是第 3 个输入
    expect(fc).toContain('[v0][ly1]blend=all_mode=screen');  // 与第一层的结果混合
  });
});

describe('工程模型 · blend 归一化与投影', () => {
  it('★ 合法值收下、大小写不敏感；非法值丢弃（回落普通覆盖）', () => {
    const p = run(baseProject(), [
      ['add_overlay', { file: 'C:/p1.png', start: 0, end: 1, blend: 'SCREEN' }],
      ['add_overlay', { file: 'C:/p2.png', start: 0, end: 1, blend: 'nope' }],
      ['add_overlay', { file: 'C:/p3.png', start: 0, end: 1, blend: 'normal' }],
    ]);
    expect(p.overlays?.[0].blend).toBe('screen');
    expect(p.overlays?.[1].blend).toBeUndefined();
    expect(p.overlays?.[2].blend).toBeUndefined();
  });

  it('★ update_overlay：patch 可改 blend，blend:null 可清回 normal', () => {
    let p = run(baseProject(), [
      ['add_overlay', { file: 'C:/p.png', start: 0, end: 1 }],
    ]);
    const id = p.overlays![0].id;
    p = run(p, [['update_overlay', { id, patch: { blend: 'overlay' } }]]);
    expect(p.overlays![0].blend).toBe('overlay');
    // 只改其它字段时 blend 不能被抹掉
    p = run(p, [['update_overlay', { id, patch: { scale: 0.6 } }]]);
    expect(p.overlays![0].blend).toBe('overlay');
    p = run(p, [['update_overlay', { id, patch: { blend: null } }]]);
    expect(p.overlays![0].blend).toBeUndefined();
  });

  it('★ layers 投影往返不丢 blend（overlays → transform.blend → overlays）', () => {
    const overlays: ClipOverlay[] = [
      { id: 'o1', file: 'C:/p.png', start: 1, end: 3, pos: 'center', scale: 0.5, blend: 'screen' },
      { id: 'o2', file: 'C:/q.png', start: 0, end: 1, pos: 'topleft' },
    ];
    const layers = layersFromV1Fields([], overlays);
    expect(layers[0].transform.blend).toBe('screen');
    expect(layers[1].transform.blend).toBeUndefined();
    const back = v1FieldsFromLayers(layers).overlays;
    expect(back[0].blend).toBe('screen');
    expect(back[1].blend).toBeUndefined();
  });
});
