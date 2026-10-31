/**
 * 图层变换 / 关键帧（P0-2）单测：滤镜串、位置优先级、值域归一化、投影往返。
 *
 * ★ 锁的是**纯函数层**：渲染表达式一错就是"画面不对但不报错"，只能靠断言钉住。
 *   真机观感由 clip-layer-transform-e2e.test.ts 用 ffmpeg 实跑验证。
 */
import { describe, it, expect } from 'vitest';
import {
  applyClipOp,
  layersFromV1Fields,
  v1FieldsFromLayers,
  type ClipProject,
  type ClipOverlay,
} from '../src/services/clip-project';
import { buildRenderPlan, overlayLayerChain } from '../src/services/clip-render';

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

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
  return pip.args[pip.args.indexOf('-filter_complex') + 1];
}

const baseProject = () => run(null, [['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);

describe('渲染 · 图层变换', () => {
  it('★ 静态 x/y：位置改用中心偏移表达式（覆盖九宫格）', () => {
    const p = run(baseProject(), [['add_overlay', { file: 'C:/p.png', start: 0, end: 2, x: 0.3, y: -0.2 }]]);
    const fc = pipFc(p);
    expect(fc).toContain("x='(main_w-overlay_w)/2+main_w*(0.3)'");
    expect(fc).toContain("y='(main_h-overlay_h)/2+main_h*(-0.2)'");
    expect(fc).not.toContain('main_w*0.04');
  });

  it('★ 不设 x/y 的老工程：仍走九宫格锚点（不产生偏移表达式）', () => {
    const p = run(baseProject(), [['add_overlay', { file: 'C:/p.png', start: 0, end: 2, pos: 'bottomright' }]]);
    expect(pipFc(p)).toContain("x='main_w-overlay_w-main_w*0.04'");
    expect(pipFc(p)).not.toContain('main_w*(0)');
  });

  it('★ 关键帧：x/scale 变成逐帧表达式，层内时间用 (t-起点)/时长 换算', () => {
    const p = run(baseProject(), [[
      'add_overlay',
      {
        file: 'C:/p.png', start: 1, end: 3, scale: 0.5,
        keyframes: [{ t: 0, x: 0.4, scale: 0.8 }, { t: 1, x: 0, scale: 1.2, ease: 'out' }],
      },
    ]]);
    const fc = pipFc(p);
    expect(fc).toContain('(t-1.000)/2.000');          // 层内时间换算
    expect(fc).toContain('main_w*(');                  // 位置来自关键帧表达式
    expect(fc).toContain(':eval=frame');               // 缩放逐帧求值
    expect(fc).toContain('if(lt(');                    // 分段表达式
  });

  it('★ 旋转：画布 1.5 倍外扩，非居中锚点补 overlay_w/6（否则整体内缩）', () => {
    const p = run(baseProject(), [['add_overlay', { file: 'C:/p.png', start: 0, end: 2, rotation: 30 }]]);
    const fc = pipFc(p);
    expect(fc).toContain("format=rgba,rotate=a='(30)*PI/180':ow=iw*1.5:oh=ih*1.5:fillcolor=black@0");
    expect(fc).toContain("-overlay_w/6");              // bottomright 的补偿
    expect(fc).toContain('-overlay_h/6');

    const centered = run(baseProject(), [['add_overlay', { file: 'C:/p.png', start: 0, end: 2, rotation: 30, pos: 'center' }]]);
    expect(pipFc(centered)).not.toContain('-overlay_w/6');   // 居中锚点不需要补偿
  });

  it('★ 不透明度：常量走 colorchannelmixer，关键帧走 geq 逐帧 alpha', () => {
    const stat = run(baseProject(), [['add_overlay', { file: 'C:/p.png', start: 0, end: 2, opacity: 0.5 }]]);
    expect(pipFc(stat)).toContain('colorchannelmixer=aa=0.5');

    const anim = run(baseProject(), [[
      'add_overlay',
      { file: 'C:/p.png', start: 0, end: 2, keyframes: [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }] },
    ]]);
    const fc = pipFc(anim);
    expect(fc).toContain('geq=');
    expect(fc).toContain("a='255*clip(");
  });

  it('★ overlayLayerChain：数字入参不加 eval=frame（预览单帧走同一条链）', () => {
    const chain = overlayLayerChain({ scaleW: '120', anchor: { x: 'main_w*0.04', y: 'main_h*0.04' }, centerX: false, centerY: false });
    expect(chain.filters[0]).toBe('scale=120:-2');
    expect(chain.x).toBe('main_w*0.04');
  });
});

describe('工程模型 · 变换归一化与投影', () => {
  it('★ x/y 越界钳制、旋转/透明度默认值不写字段', () => {
    const p = run(baseProject(), [[
      'add_overlay',
      { file: 'C:/p.png', start: 0, end: 1, x: 9, y: -9, rotation: 0, opacity: 1 },
    ]]);
    expect(p.overlays![0].x).toBe(0.5);
    expect(p.overlays![0].y).toBe(-0.5);
    expect(p.overlays![0].rotation).toBeUndefined();
    expect(p.overlays![0].opacity).toBeUndefined();
  });

  it('★ 关键帧：无值的点丢弃、越界钳制、按 t 排序', () => {
    const p = run(baseProject(), [[
      'add_overlay',
      {
        file: 'C:/p.png', start: 0, end: 1,
        keyframes: [
          { t: 0.8, scale: 9 },
          { t: 0.2, x: -9 },
          { t: 'bad' },
          { t: 0.5 },                       // 没有任何值 → 丢
        ],
      },
    ]]);
    const kfs = p.overlays![0].keyframes!;
    expect(kfs.map((k) => k.t)).toEqual([0.2, 0.8]);
    expect(kfs[0].x).toBe(-0.5);
    expect(kfs[1].scale).toBe(5);
  });

  it('★ 落盘投影往返：x/y/旋转/透明度/关键帧都不丢', () => {
    const overlays: ClipOverlay[] = [{
      id: 'o1', file: 'C:/p.png', start: 1, end: 3, scale: 0.4,
      x: 0.3, y: -0.1, rotation: 15, opacity: 0.7,
      keyframes: [{ t: 0, x: 0.4, ease: 'inout' }, { t: 1, x: 0, scale: 1.2 }],
    }];
    const layers = layersFromV1Fields([], overlays);
    expect(layers[0].transform).toMatchObject({ x: 0.3, y: -0.1, rotation: 15, opacity: 0.7 });
    expect(layers[0].keyframes).toHaveLength(2);
    const back = v1FieldsFromLayers(layers).overlays[0];
    expect(back).toMatchObject({ x: 0.3, y: -0.1, rotation: 15, opacity: 0.7 });
    expect(back.keyframes).toEqual(overlays[0].keyframes);
  });

  it('★ 九宫格 pos 仍能往返（老工程不因新增 x/y 而漂移）', () => {
    const layers = layersFromV1Fields([], [{ id: 'o1', file: 'C:/p.png', start: 0, end: 1, pos: 'topleft' }]);
    expect(layers[0].transform.pos).toBe('topleft');
    expect(v1FieldsFromLayers(layers).overlays[0].pos).toBe('topleft');
    expect(v1FieldsFromLayers(layers).overlays[0].x).toBeUndefined();
  });
});
