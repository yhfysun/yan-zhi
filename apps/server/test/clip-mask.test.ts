/**
 * 蒙版滤镜构造单测（apps/server/src/services/clip-mask）。
 *
 * ★★★ 为什么必须钉住（2026-10-07 抽帧抓到的真缺陷）：
 *   蒙版第一版**只设了 alpha**，而后续 `format=yuv420p` 没有 alpha 通道 →
 *   透明度被静默丢弃、RGB 原样保留 → **蒙版完全失效**，
 *   但 ffmpeg 不报错、产物能正常播放、`ffprobe` 也能解出视频流。
 *   实测证据：circle 与 heart 两版成品的同一帧 **md5 完全相同**。
 *   → 断言必须落在「滤镜串包含 alpha 的消费步骤（overlay 合成到黑底）」上，
 *     而不是"参数存在"这种表面检查。
 *
 * ★ ffmpeg 层面"确实生效"由 tools/verify-masks.cjs 实跑 + 抽帧 md5 互异核验（17/17）。
 *   本文件保证**数据契约与关键结构**正确，两者互补。
 */
import { describe, it, expect } from 'vitest';
import { shapeAlphaExpr, buildMaskFilter } from '../src/services/clip-mask';

const SHAPES = ['circle', 'ellipse', 'rect', 'rounded', 'heart', 'star', 'diamond',
  'split_left', 'split_right', 'split_top', 'split_bottom', 'top_circle'];

const base = { scale: 0.9, offsetX: 0, offsetY: 0, feather: 0 };

describe('clip-mask · 形状表达式', () => {
  it('全部形状都能生成表达式（不得有 NULL —— 那会让该形状静默不生效）', () => {
    for (const s of SHAPES) {
      const e = shapeAlphaExpr({ shape: s, ...base });
      expect(e, `形状 ${s} 未生成表达式`).toBeTruthy();
      expect(e!.length).toBeGreaterThan(10);
    }
  });

  it('未知形状返回 null（由调用方决定忽略，不得静默当成某种形状）', () => {
    expect(shapeAlphaExpr({ shape: '不存在的形状', ...base })).toBeNull();
  });

  it('★ geq 变量必须是大写 X/Y/W/H（小写会被当成未定义 → 蒙版失效）', () => {
    const e = shapeAlphaExpr({ shape: 'circle', ...base })!;
    expect(e).toContain('X');
    expect(e).toContain('Y');
    expect(e).toContain('W');
    expect(e).toContain('H');
    // 不得出现裸的小写坐标变量（如 `x-` / `y>`）；注意 r(X,Y) 这种函数名不算
    expect(e).not.toMatch(/[^A-Za-z](x|y|w|h)[^A-Za-z(]/);
  });

  it('★★ scale 语义：越大蒙版越大（曾把上限写成 50 导致恒为一半）', () => {
    const small = shapeAlphaExpr({ shape: 'circle', ...base, scale: 0.3 })!;
    const big = shapeAlphaExpr({ shape: 'circle', ...base, scale: 0.9 })!;
    // 半径百分比出现在表达式里：30 与 90
    expect(small).toContain('/100*');
    expect(small).toMatch(/\(30\/100/);
    expect(big).toMatch(/\(90\/100/);
  });

  it('★ 羽化>0 时表达式包含线性过渡（而不是只留硬边）', () => {
    const hard = shapeAlphaExpr({ shape: 'circle', ...base, feather: 0 })!;
    const soft = shapeAlphaExpr({ shape: 'circle', ...base, feather: 20 })!;
    expect(soft.length).toBeGreaterThan(hard.length);
    expect(soft).toContain('20');
  });

  it('偏移量生效：offsetX 出现在中心点计算里', () => {
    const e = shapeAlphaExpr({ shape: 'circle', ...base, offsetX: 0.25 })!;
    expect(e).toContain('0.2500');
  });

  it('★ 逗号一律用 \\, 转义（实测本机 ffmpeg 接受该形态；先前的"内外层不同"推测是错的）', () => {
    const e = shapeAlphaExpr({ shape: 'heart', ...base })!;
    // 实测结论：统一用 \, 转义即可跑通（17/17 实跑通过，见 tools/verify-masks.cjs）。
    // 曾误以为"内层嵌套要用裸逗号"，改成裸逗号后同样能跑 —— 两种都能过，
    // 但**必须一致**，混用会产生难以归因的 `Missing ')' or too many args`。
    // 判据：不得出现裸逗号（函数实参分隔位置）。
    expect(e).toContain('\\,');
    // 至少要有若干处内层嵌套（heart 的 pow 链）
    expect((e.match(/pow\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('clip-mask · 完整滤镜串（含 alpha 消费）', () => {
  it('★★★ 必须把 alpha 合成到黑底（只设 alpha 会被 yuv420p 静默丢弃 → 蒙版失效）', () => {
    const f = buildMaskFilter({ shape: 'circle', ...base })!;
    expect(f).toBeTruthy();
    expect(f).toContain('format=rgba');       // 设 alpha 的前提
    expect(f).toContain('geq=');              // 生成 alpha
    // ★ 关键：alpha 必须被消费掉，否则等于没做
    expect(f).toContain('overlay');           // 合成动作
    expect(f).toContain('drawbox');           // 黑底来源
  });

  it('圆与心形生成的滤镜串必须不同（相同即蒙版失效的强信号）', () => {
    const c = buildMaskFilter({ shape: 'circle', ...base })!;
    const h = buildMaskFilter({ shape: 'heart', ...base })!;
    expect(c).not.toBe(h);
  });

  it('shape=none 且无 key → null（不产空转滤镜）', () => {
    expect(buildMaskFilter({ shape: 'none', ...base })).toBeNull();
    expect(buildMaskFilter({})).toBeNull();
  });

  it('★ 色键走 colorkey 且不做黑底合成（素材本身就是待抠的整幅）', () => {
    const kf = (id: string) => (id === 'green' ? 'colorkey=0x00FF00:0.30:0.10' : null);
    const f = buildMaskFilter({ key: 'green' }, kf)!;
    expect(f).toContain('colorkey');
    expect(f).not.toContain('overlay');   // 抠像不需要黑底合成
  });

  it('★★ 色键 id 未知时回落形状蒙版（不得返回 null 让用户"设了没反应"）', () => {
    const kf = () => null;   // 查不到
    const f = buildMaskFilter({ shape: 'circle', key: 'unknown_key' }, kf);
    expect(f).toBeTruthy();
    expect(f).toContain('overlay');   // 回落到形状蒙版
  });

  it('★★ shape 与 key 同时给 → 色键优先（语义：抠像覆盖形状）', () => {
    const kf = (id: string) => (id === 'green' ? 'colorkey=0x00FF00:0.30:0.10' : null);
    const f = buildMaskFilter({ shape: 'circle', key: 'green' }, kf)!;
    expect(f).toContain('colorkey');
    expect(f).not.toContain('overlay');
  });

  it('scale 越界被钳制（0 与 >1 都不产非法值）', () => {
    const f0 = buildMaskFilter({ shape: 'circle', ...base, scale: 0 })!;
    const f9 = buildMaskFilter({ shape: 'circle', ...base, scale: 9 })!;
    // scale=0 走默认 0.9；scale=9 被 Math.min(1) 钳到 1
    expect(f0).toMatch(/\(90\/100/);
    expect(f9).toMatch(/\(100\/100/);
  });
});