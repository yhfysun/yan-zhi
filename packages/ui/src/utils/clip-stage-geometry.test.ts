/**
 * 监视器矢量图层几何单测（P1-10 / C-1）。
 *
 * ★ 这组测试守的是「预览 = 成片」的一致性契约：
 *   位置/尺寸口径一旦与 clip-render 漂移，用户看到的预览就是**假的**（且不报错）。
 *   锚点公式、关键帧优先级、1920 字号基准、拖动位移都按渲染侧实现逐条钉住。
 */
import { describe, it, expect } from 'vitest';
import {
  localLayerT, layerVisibleAt, sampleLayerTf, hasOffsetMode, layerWidthPx,
  layerCenterPx, anchorCell, ANCHOR_INSET, scale1920, textMarginPx,
  normalizeCssColor, outlineShadow, cssBlendMode,
  buildTextCss, buildLayerBoxCss, shiftLayerPosition, clampOffset,
} from './clip-stage-geometry';

const BOX = { width: 1080, height: 1920 };

describe('时间换算', () => {
  it('localLayerT 把成片时间换成层内 0~1，并夹在边界内', () => {
    expect(localLayerT(12, 10, 14)).toBeCloseTo(0.5, 6);
    expect(localLayerT(9, 10, 14)).toBe(0);
    expect(localLayerT(15, 10, 14)).toBe(1);
    expect(localLayerT(3, 10, 10)).toBe(0);   // 零长度层不除零
  });

  it('layerVisibleAt 与 enable between(t,st,et) 同口径（左闭右开）', () => {
    expect(layerVisibleAt(10, 10, 14)).toBe(true);
    expect(layerVisibleAt(14, 10, 14)).toBe(false);
    expect(layerVisibleAt(9.99, 10, 14)).toBe(false);
    expect(layerVisibleAt(11, 10, 10)).toBe(false);
  });
});

describe('sampleLayerTf · 关键帧优先级与逐属性合并', () => {
  it('没有关键帧 → 全取静态值', () => {
    const s = sampleLayerTf({ x: 0.1, y: -0.2, opacity: 0.8 }, undefined, 0.5);
    expect(s.kf).toEqual({});
    expect(s.eff).toEqual({ x: 0.1, y: -0.2, opacity: 0.8 });
  });

  it('★ 关键帧优先，静态值只兜底缺失属性（稀疏打点互不拉扯）', () => {
    const s = sampleLayerTf(
      { x: 0.3, scale: 2, rotation: 15 },
      [{ t: 0, scale: 1 }, { t: 1, scale: 1.5 }],
      0.5,
    );
    expect(s.eff.x).toBe(0.3);          // x 没打点 → 静态
    expect(s.eff.rotation).toBe(15);     // rotation 没打点 → 静态
    expect(s.eff.scale).toBeCloseTo(1.25, 6); // scale 有打点 → 关键帧
  });

  it('端点外 clamp（不外推）', () => {
    const kfs = [{ t: 0.2, x: 0 }, { t: 0.8, x: 0.4 }];
    expect(sampleLayerTf(undefined, kfs, 0).eff.x).toBe(0);
    expect(sampleLayerTf(undefined, kfs, 1).eff.x).toBe(0.4);
  });

  it('hasOffsetMode：任一绝对位置存在即两轴都走中心偏移', () => {
    expect(hasOffsetMode(undefined, undefined)).toBe(false);
    expect(hasOffsetMode({ scale: 0.4 }, [])).toBe(false);
    expect(hasOffsetMode({ y: 0.2 }, undefined)).toBe(true);
    expect(hasOffsetMode(undefined, [{ t: 0, x: 0.1 }])).toBe(true);
  });
});

describe('尺寸换算', () => {
  it('★ 贴纸/画中画宽度 = 画面宽 × 静态比例 × 关键帧倍数（渲染侧是乘数）', () => {
    expect(layerWidthPx(1080, 0.3, undefined)).toBeCloseTo(324, 6);
    expect(layerWidthPx(1080, 0.3, 2)).toBeCloseTo(648, 6);
    expect(layerWidthPx(1080, 0.3, 0.5)).toBeCloseTo(162, 6);
  });

  it('★ 字号/描边按 1920 高基准缩放（1920 高画幅 = 1:1）', () => {
    expect(scale1920(88, 1920)).toBe(88);
    expect(scale1920(88, 960)).toBe(44);
    expect(scale1920(12, 1080)).toBeCloseTo(6.75, 6);
  });

  it('字幕边距：默认 200、安全区 420（1920 基准）', () => {
    expect(textMarginPx(1920, false)).toBe(200);
    expect(textMarginPx(1920, true)).toBe(420);
    expect(textMarginPx(960, false)).toBe(100);
  });
});

describe('layerCenterPx · 与 overlayLayerChain 同口径', () => {
  const w = 324;
  const h = 576;

  it('居中锚点：中心恒在画幅中心（旋转也不偏）', () => {
    expect(layerCenterPx({ box: BOX, width: w, height: h, anchor: 'center', hasOffset: false }))
      .toEqual({ cx: 540, cy: 960 });
    const rot = layerCenterPx({ box: BOX, width: w, height: h, anchor: 'center', rotation: 30, hasOffset: false });
    expect(rot.cx).toBeCloseTo(540, 6);
    expect(rot.cy).toBeCloseTo(960, 6);
  });

  it('四角锚点：距边 4% + 自身一半（未旋转）', () => {
    const tl = layerCenterPx({ box: BOX, width: w, height: h, anchor: 'topleft', hasOffset: false });
    expect(tl.cx).toBeCloseTo(1080 * ANCHOR_INSET + w / 2, 6);
    expect(tl.cy).toBeCloseTo(1920 * ANCHOR_INSET + h / 2, 6);

    const br = layerCenterPx({ box: BOX, width: w, height: h, anchor: 'bottomright', hasOffset: false });
    expect(br.cx).toBeCloseTo(1080 - 1080 * ANCHOR_INSET - w / 2, 6);
    expect(br.cy).toBeCloseTo(1920 - 1920 * ANCHOR_INSET - h / 2, 6);
  });

  it('★ 旋转时复刻 1.5 倍外扩 + 非居中锚点 -overlay_w/6 补偿', () => {
    const br = layerCenterPx({ box: BOX, width: w, height: h, anchor: 'bottomright', rotation: 30, hasOffset: false });
    // 期望：left = W - 1.5w - inset - 0.25w；cy = left + 0.75w
    expect(br.cx).toBeCloseTo(1080 - 1080 * ANCHOR_INSET - w, 6);
    expect(br.cy).toBeCloseTo(1920 - 1920 * ANCHOR_INSET - h, 6);
  });

  it('中心偏移模式：中心 = 画幅中心 + 画幅 × 偏移（旋转不影响）', () => {
    const g = layerCenterPx({ box: BOX, width: w, height: h, anchor: 'bottomright', rotation: 45, hasOffset: true, offsetX: 0.1, offsetY: -0.2 });
    expect(g.cx).toBeCloseTo(540 + 108, 6);
    expect(g.cy).toBeCloseTo(960 - 384, 6);
  });

  it('anchorCell：未知回落右下（与 overlayAnchorOf 缺省一致）', () => {
    expect(anchorCell('top')).toEqual(['center', 'top']);
    expect(anchorCell('left')).toEqual(['left', 'center']);
    expect(anchorCell('')).toEqual(['right', 'bottom']);
  });
});

describe('颜色/描边/混合模式', () => {
  it('normalizeCssColor 只认 6/8 位 hex，非法返回 null', () => {
    expect(normalizeCssColor('#FF0000')).toBe('#FF0000');
    expect(normalizeCssColor('#ff000080')).toBe('#ff000080');
    expect(normalizeCssColor('red')).toBeNull();
    expect(normalizeCssColor('#f00')).toBeNull();
    expect(normalizeCssColor('')).toBeNull();
  });

  it('outlineShadow 生成 8 向零模糊阴影；宽度 0 → none', () => {
    const s = outlineShadow(12, '#000000');
    expect(s.split(',').length).toBe(8);
    expect(s).toContain('-12.00px -12.00px 0 #000000');
    expect(outlineShadow(0, '#000')).toBe('none');
  });

  it('★ 混合模式三套命名的唯一映射（含 add→plus-lighter）', () => {
    expect(cssBlendMode('normal')).toBe('normal');
    expect(cssBlendMode('softlight')).toBe('soft-light');
    expect(cssBlendMode('add')).toBe('plus-lighter');
    expect(cssBlendMode(undefined)).toBe('normal');
  });
});

describe('buildTextCss · 文字图层近似', () => {
  const base = { fontSizePx: 88, outlinePx: 12, color: '#FFFFFF', outlineColor: '#000000' };

  it('★ 字号/描边/字距按 1920 基准换算（1080x1920 画幅）', () => {
    const r = buildTextCss({ ...base, letterSpacingPx: 10 }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(r.style.fontSize).toBe('88px');
    expect(r.style.letterSpacing).toBe('10px');
    expect(String(r.style.textShadow)).toContain('12.00px');
    expect(r.usesTransform).toBe(false);
  });

  it('960 高画幅 → 字号减半', () => {
    const r = buildTextCss(base, { width: 540, height: 960 }, sampleLayerTf(undefined, undefined, 0));
    expect(r.style.fontSize).toBe('44px');
  });

  it('无变换：按 position 贴边（含 line-height 半行距补偿，量到文字而非盒边）', () => {
    // 88px、1.2 行高 → 半行距 8.8px：底线 200 + 8.8，顶线 420 - 8.8
    const bottom = buildTextCss({ ...base, position: 'bottom' }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(bottom.style.bottom).toBe('208.8px');
    expect(bottom.style.left).toBe('50%');
    expect(bottom.style.transform).toBe('translateX(-50%)');

    const topSafe = buildTextCss({ ...base, position: 'top', safeArea: true }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(topSafe.style.top).toBe('411.2px');

    const center = buildTextCss({ ...base, position: 'center' }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(center.style.top).toBe('50%');
    expect(center.style.transform).toBe('translate(-50%, -50%)');
  });

  it('★ 有变换：\an5 语义 —— 中心定位 + 旋转/缩放/透明', () => {
    const r = buildTextCss(
      { ...base, transform: { x: 0.1, y: -0.25, rotation: 15, scale: 1.5, opacity: 0.8 } },
      BOX,
      sampleLayerTf({ x: 0.1, y: -0.25, rotation: 15, scale: 1.5, opacity: 0.8 }, undefined, 0),
    );
    expect(r.usesTransform).toBe(true);
    expect(r.style.left).toBe(`${(0.6 * 1080).toFixed(0)}px`);
    expect(r.style.top).toBe(`${(0.25 * 1920).toFixed(0)}px`);
    expect(r.style.transform).toContain('rotate(15deg)');
    expect(r.style.transform).toContain('scale(1.5)');
    expect(r.style.opacity).toBe('0.8');
  });

  it('关键帧（即便只有 opacity）也走变换路径 → 位置落在画幅中心', () => {
    const r = buildTextCss(
      { ...base, keyframes: [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }] },
      BOX,
      sampleLayerTf(undefined, [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }], 0.5),
    );
    expect(r.usesTransform).toBe(true);
    expect(r.style.left).toBe('540px');
    expect(r.style.top).toBe('960px');
    expect(r.style.opacity).toBe('0.5');
  });

  it('花字底板 / 背景底板 / 描边色', () => {
    const plate = buildTextCss({ ...base, plateColor: '#11223380', platePaddingPx: 18 }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(plate.style.background).toBe('#11223380');
    expect(plate.style.borderRadius).toBe('18px');

    const back = buildTextCss({ ...base, backColor: '#000000CC' }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(back.style.background).toBe('#000000CC');

    const noOutline = buildTextCss({ ...base, outlinePx: 0 }, BOX, sampleLayerTf(undefined, undefined, 0));
    expect(noOutline.style.textShadow).toBeUndefined();
  });
});

describe('buildLayerBoxCss · 贴纸/画中画', () => {
  it('宽度 + 中心定位 + 旋转/透明/混合', () => {
    const css = buildLayerBoxCss({
      box: BOX, centerX: 648, centerY: 960, width: 324, height: 576,
      rotation: -20, opacity: 0.5, blend: 'add',
    });
    expect(css.left).toBe('648px');
    expect(css.top).toBe('960px');
    expect(css.width).toBe('324px');
    expect(css.height).toBe('576px');
    expect(css.transform).toContain('rotate(-20deg)');
    expect(css.opacity).toBe('0.5');
    expect(css.mixBlendMode).toBe('plus-lighter');
  });

  it('高度未知时省略 height（贴纸/居中锚点不需要）', () => {
    const css = buildLayerBoxCss({ box: BOX, centerX: 540, centerY: 960, width: 324 });
    expect(css.height).toBeUndefined();
    expect(css.mixBlendMode).toBeUndefined();
  });
});

describe('shiftLayerPosition · 拖动落点', () => {
  it('★ 静态位移 + 关键帧整体平移（否则拖完会跳回关键帧位置）', () => {
    const r = shiftLayerPosition({ x: 0.1 }, [{ t: 0, x: 0.1 }, { t: 1, x: 0.3 }], 0.05, 0.02);
    expect(r.tf.x).toBeCloseTo(0.15, 6);
    expect(r.tf.y).toBeCloseTo(0.02, 6);
    expect(r.kfs?.[0].x).toBeCloseTo(0.15, 6);
    expect(r.kfs?.[1].x).toBeCloseTo(0.35, 6);
  });

  it('只平移有该属性的关键帧点（稀疏打点不被凭空补值）', () => {
    const r = shiftLayerPosition(undefined, [{ t: 0, scale: 1 }, { t: 1, y: 0.2 }], 0.1, 0.1);
    expect(r.kfs?.[0].x).toBeUndefined();
    expect(r.kfs?.[0].y).toBeUndefined();
    expect(r.kfs?.[1].x).toBeUndefined();   // 该点本来就没有 x → 不凭空补
    expect(r.kfs?.[1].y).toBeCloseTo(0.3, 6);
  });

  it('偏移夹在 ±0.5（与属性面板的钳制一致）', () => {
    const r = shiftLayerPosition({ x: 0.45 }, undefined, 0.3, -0.9);
    expect(r.tf.x).toBe(0.5);
    expect(r.tf.y).toBe(-0.5);
    expect(clampOffset(2)).toBe(0.5);
  });

  it('不原地修改入参（工程状态只在 save 时写回）', () => {
    const tf = { x: 0.1 };
    const kfs = [{ t: 0, x: 0.1 }];
    shiftLayerPosition(tf, kfs, 0.1, 0);
    expect(tf.x).toBe(0.1);
    expect(kfs[0].x).toBe(0.1);
  });
});
