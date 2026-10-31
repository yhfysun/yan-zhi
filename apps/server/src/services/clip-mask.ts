// 蒙版滤镜构造 —— 纯函数层（可脱机单测）。
//
// ★ 为什么单独一层：蒙版是**逐像素 alpha 表达式**，写错一个符号 ffmpeg 会
//   "命令成功但画面全黑/全透"（不报错），只能靠单测 + 实跑抽帧双重核验。
//   geq 的表达式里 x/y/W/H 的含义：x/y 是当前像素坐标，W/H 是画面宽高。
//
// 方案（本机实测均可用，见 tools/verify-effects.cjs 的 mask 组）：
//   · 形状蒙版：`format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='<形状表达式>'`
//     —— alpha=255 显示、0 透明。形状用中心距离/坐标不等式表达。
//   · 色键抠像：`colorkey=<颜色>:<相似度>:<混合>`（直接可用，来自效果库 MASK_KEYS）。
//   · 线性蒙版（P1-4）：法线方向的有符号距离 + 角度/位置/羽化，做渐变擦除。
//   · 钢笔路径（P1-4）：先烘成一张 PNG（折线或 Catmull-Rom 平滑曲线），再用
//     movie + alphamerge 当 alpha —— 逐像素多边形测试在 1080p 上太慢，必须烘焙。
//
// ★★★ 注意 geq 的变量名：**X/Y 是大写**（像素坐标），**W/H 也是大写**（尺寸）。
//   写成小写 x/y/w/h 会被当成"未定义变量"→ ffmpeg 报错或算出常量 → 蒙版失效。
// ★ 表达式里的逗号统一写成 `\,`（本机实测；混用裸逗号会出现难以归因的
//   `Missing ')' or too many args`）。

import { buildPiecewiseExpr, easePointList } from '@yan-zhi/shared';

export interface MaskShapeParams {
  /** 形状 id：circle / ellipse / rect / rounded / heart / star / diamond / split_* / top_circle / linear */
  shape: string;
  /** 蒙版尺寸比例 0.1~1（1 = 占满短边） */
  scale: number;
  /** 中心偏移（画面宽/高的比例，-0.5~0.5） */
  offsetX: number;
  offsetY: number;
  /** 边缘羽化像素（0 = 硬边） */
  feather: number;
  /** 线性蒙版角度（度，0=从左到右，90=从上到下） */
  angle?: number;
  /** 线性蒙版位置 0~1（0=几乎全遮，1=几乎全显） */
  position?: number;
}

/** 表达式版参数：所有数值都允许是 ffmpeg 表达式（关键帧动画用）。 */
export interface MaskAlphaParams {
  shape: string;
  /** 缩放**百分数**表达式（静态时是 "90" 这样的整数） */
  scalePct: string;
  offsetX: string;
  offsetY: string;
  feather: number;
  angle?: string;
  position?: string;
}

/** 生成形状蒙版的 alpha 表达式（geq 的 a= 部分）。返回 null 表示未知形状。 */
export function maskAlphaExpr(p: MaskAlphaParams): string | null {
  const cx = `(W/2 + ${p.offsetX}*W)`;
  const cy = `(H/2 + ${p.offsetY}*H)`;
  // ✅ 语义：scalePct = 蒙版**占短边的百分比**（100 = 撑满短边，50 = 一半）。
  //   半径 = pct/100 * min(W,H) / 2，即直径 = pct% * 短边。
  const r = `(${p.scalePct}/100*min(W\\,H)/2)`;
  const feather = Math.max(0, p.feather);
  const soft = (dist: string, lim: string = r) =>
    feather > 0
      ? `if(lt(${dist}\\,${lim})\\,255\\,if(lt(${dist}\\,${lim}+${feather})\\,255*(1-(${dist}-${lim})/${feather})\\,0))`
      : `if(lt(${dist}\\,${lim})\\,255\\,0)`;
  const hard = (cond: string) => `if(${cond}\\,255\\,0)`;

  switch (p.shape) {
    case 'circle':
    case 'top_circle': {
      // top_circle：中心上移到画面 1/3 处（口播头像圈）
      const c = p.shape === 'top_circle' ? `(H/3)` : cy;
      return soft(`hypot(X-(${cx})\\,Y-(${c}))`);
    }
    case 'ellipse':
      // 椭圆：把 x 方向距离按宽高比拉伸后再比较
      return soft(`hypot((X-(${cx}))*0.75\\,Y-(${cy}))`);
    case 'rect':
      // 矩形：坐标落在以中心为原点、边长 2r 的方框内
      return hard(`between(X\\,${cx}-${r}\\,${cx}+${r})*between(Y\\,${cy}-${r}\\,${cy}+${r})`);
    case 'rounded': {
      // 圆角矩形：矩形内 且（不在四角区域 或 落在角内切圆内）
      const half = r;
      const rad = `(${half}/5)`;
      return hard(
        `between(X\\,${cx}-${half}\\,${cx}+${half})*between(Y\\,${cy}-${half}\\,${cy}+${half})` +
        `*if(gt(abs(X-(${cx}))\\,${half}-${rad})*gt(abs(Y-(${cy}))\\,${half}-${rad})\\,` +
        `lt(hypot(abs(X-(${cx}))-(${half}-${rad})\\,abs(Y-(${cy}))-(${half}-${rad}))\\,${rad})\\,1)`,
      );
    }
    case 'heart': {
      // 心形隐式方程：(x²+y²-1)³ - x²y³ <= 0（x 右、y 上，故 Y 取负）
      const nx = `((X-(${cx}))/${r})`;
      const ny = `(-(Y-(${cy}))/${r})`;
      return hard(`lte(pow(pow(${nx}\\,2)+pow(${ny}\\,2)-1\\,3)-pow(${nx}\\,2)*pow(${ny}\\,3)\\,0)`);
    }
    case 'star': {
      // 五角星：极坐标下"半径阈值随角度做 5 次起伏"
      const dx = `(X-(${cx}))`;
      const dy = `(Y-(${cy}))`;
      const theta = `atan2(${dy}\\,${dx})`;
      const dist = `hypot(${dx}\\,${dy})`;
      // 阈值 = r * (0.45 + 0.55*|cos(2.5θ)|)，在 5 个方向上达到最大半径
      const lim = `${r}*(0.45+0.55*abs(cos(2.5*${theta})))`;
      return soft(dist, lim);
    }
    case 'diamond':
      return hard(`lte(abs(X-(${cx}))+abs(Y-(${cy}))\\,${r})`);
    case 'split_left':
      return hard(`lt(X\\,${cx})`);
    case 'split_right':
      return hard(`gt(X\\,${cx})`);
    case 'split_top':
      return hard(`lt(Y\\,${cy})`);
    case 'split_bottom':
      return hard(`gt(Y\\,${cy})`);
    case 'linear': {
      // 线性蒙版：沿角度方向的有符号距离 d，位置把分界线前后移动，羽化给过渡带。
      const a = `((${p.angle ?? '0'})*PI/180)`;
      const d = `((X-(${cx}))*cos(${a})+(Y-(${cy}))*sin(${a}))`;
      const shift = `(((${p.position ?? '0.5'})-0.5)*hypot(W\\,H))`;
      if (feather > 0) {
        return `if(lt(${d}\\,${shift}-${feather}/2)\\,255\\,if(lt(${d}\\,${shift}+${feather}/2)\\,255*(1-(${d}-(${shift})+${feather}/2)/${feather})\\,0))`;
      }
      return `if(lt(${d}\\,${shift})\\,255\\,0)`;
    }
    default:
      return null;
  }
}

/**
 * 数值版（老接口）：保持原有输出形态（`(90/100*min(...))`、偏移四位小数），
 * 单测与实跑工具都依赖这些字符串。
 */
export function shapeAlphaExpr(p: MaskShapeParams): string | null {
  const pct = Math.max(5, Math.min(100, Math.round(p.scale * 100)));
  return maskAlphaExpr({
    shape: p.shape,
    scalePct: String(pct),
    offsetX: p.offsetX.toFixed(4),
    offsetY: p.offsetY.toFixed(4),
    feather: p.feather,
    ...(p.angle != null ? { angle: String(p.angle) } : {}),
    ...(p.position != null ? { position: String(p.position) } : {}),
  });
}

// ===== 钢笔路径（P1-4）=====

/**
 * 归一化路径 → 像素折线。
 * ★ smooth=true 用 **Catmull-Rom 样条**（穿过所有锚点、自动算控制点）：
 *   钢笔的"贝塞尔"在交互语义上就是"点几个点得到平滑曲线"，Catmull-Rom 正是这个语义，
 *   且不需要用户再拖控制柄。渲染时每段展开 8 个采样点。
 */
export function flattenMaskPath(
  path: { smooth?: boolean; points: Array<{ x: number; y: number }> },
  W: number,
  H: number,
): Array<{ x: number; y: number }> {
  const pts = (path.points || []).map((p) => ({ x: p.x * W, y: p.y * H }));
  if (pts.length < 3) return pts;
  if (!path.smooth) return pts;
  const out: Array<{ x: number; y: number }> = [];
  const n = pts.length;
  const STEPS = 8;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    // Catmull-Rom → 三次贝塞尔控制点
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      const mt = 1 - t;
      out.push({
        x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
        y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y,
      });
    }
  }
  return out;
}

/**
 * 多边形（像素坐标）→ geq 的 alpha 表达式（奇偶规则/射线相交）。
 * ★ 只在**烘蒙版图**时跑一次，所以表达式长一点没关系；绝不要挂到主滤镜链上逐帧算。
 */
export function polygonAlphaExpr(pts: Array<{ x: number; y: number }>): string {
  const terms: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (Math.abs(b.y - a.y) < 0.5) continue;   // 水平边不参与射线相交
    // 半开区间判据：两个端点在射线两侧（ffmpeg 表达式没有 != / neq，用差的绝对值表达异或）
    const k = (b.x - a.x) / (b.y - a.y);
    terms.push(
      `abs(gt(${a.y.toFixed(2)}\\,Y)-gt(${b.y.toFixed(2)}\\,Y))*lt(X\\,${a.x.toFixed(2)}+(Y-${a.y.toFixed(2)})*${k.toFixed(6)})`,
    );
  }
  if (!terms.length) return '0';
  return `if(eq(mod(${terms.join('+')}\\,2)\\,1)\\,255\\,0)`;
}

// ===== 完整滤镜串 =====

export interface MaskBuildOptions {
  /** 段内时长（秒）：有关键帧时把 T 归一化到 0~1 */
  segDur?: number;
  /** 路径蒙版烘好的 PNG（绝对路径） */
  pathFile?: string;
  W?: number;
  H?: number;
}

const escMoviePath = (p: string): string => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/**
 * 构造完整的蒙版滤镜串（可直接拼进 -vf / filter_complex 的链里）。
 * 返回 null 表示"无需蒙版"（无形状/无路径/无 key）。
 *
 * ★★★ 关键实现细节（2026-10-07 抽帧踩到，务必照做）：
 *   **只设 alpha 是没用的** —— 后续必须把带 alpha 的画面**合成到黑底**上，
 *   否则 `format=yuv420p`（无 alpha 通道）会把透明度直接丢掉、RGB 原样保留
 *   → **蒙版完全失效**，而且 ffmpeg 不报任何错、产物也能正常播放。
 *
 *   正确写法 = `geq 设 alpha` → `split` → 一份做黑底 → `overlay` 合成
 *   （不要用 crop/pad 近似 —— 那只能做矩形，做不了圆/心形/路径）。
 */
export function buildMaskFilter(mask: {
  shape?: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  feather?: number;
  key?: string;
  angle?: number;
  position?: number;
  keyframes?: Array<{ t: number; scale?: number; offsetX?: number; offsetY?: number; angle?: number; position?: number }>;
  path?: { smooth?: boolean; points: Array<{ x: number; y: number }> };
}, keyFilter?: (id: string) => string | null, opts: MaskBuildOptions = {}): string | null {
  // 色键优先（用户给了抠像就按抠像走）
  if (mask.key && mask.key !== 'none') {
    const kf = keyFilter ? keyFilter(mask.key) : null;
    if (kf) return kf;
  }

  // 路径蒙版：烘好的 PNG 当 alpha（movie 是滤镜源，不必新增 -i 输入，段管线不用改索引）
  if (mask.path && mask.path.points.length >= 3 && opts.pathFile && opts.W && opts.H) {
    return `format=rgba[mpm];movie='${escMoviePath(opts.pathFile)}':loop=1,scale=${opts.W}:${opts.H},format=gray[mpmask];` +
      `[mpm][mpmask]alphamerge,split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay=shortest=1`;
  }

  const shape = (mask.shape || '').trim();
  if (!shape || shape === 'none') return null;

  // 关键帧 → 表达式（变量 T 是段内秒；乘 /segDur 归一到 0~1）。
  // ★ buildPiecewiseExpr 输出里的逗号统一转义成 `\,`，与手写表达式的约定一致。
  const animated = !!opts.segDur && !!mask.keyframes?.length;
  const kfExpr = (key: 'scale' | 'offsetX' | 'offsetY' | 'angle' | 'position', fallback: number): string => {
    const pctOf = (v: number) => String(Math.round(Math.max(0.05, Math.min(1, v)) * 100));
    if (!animated) return key === 'scale' ? pctOf(fallback) : (key === 'offsetX' || key === 'offsetY' ? fallback.toFixed(4) : String(fallback));
    const pts = mask.keyframes!.filter((k) => typeof k[key] === 'number').map((k) => ({ t: k.t, v: k[key] as number }));
    if (pts.length < 2) return key === 'scale' ? pctOf(fallback) : (key === 'offsetX' || key === 'offsetY' ? fallback.toFixed(4) : String(fallback));
    const raw = buildPiecewiseExpr(easePointList(pts), `(T/${opts.segDur!.toFixed(6)})`).replace(/,/g, '\\,');
    return key === 'scale' ? `(${raw}*100)` : raw;
  };

  const scale = typeof mask.scale === 'number' && mask.scale > 0 ? Math.min(1, mask.scale) : 0.9;
  const offsetX = typeof mask.offsetX === 'number' ? Math.max(-0.5, Math.min(0.5, mask.offsetX)) : 0;
  const offsetY = typeof mask.offsetY === 'number' ? Math.max(-0.5, Math.min(0.5, mask.offsetY)) : 0;
  const angle = typeof mask.angle === 'number' ? Math.max(-180, Math.min(180, mask.angle)) : 0;
  const position = typeof mask.position === 'number' ? Math.max(0, Math.min(1, mask.position)) : 0.5;
  const expr = maskAlphaExpr({
    shape,
    scalePct: kfExpr('scale', scale),
    offsetX: kfExpr('offsetX', offsetX),
    offsetY: kfExpr('offsetY', offsetY),
    feather: typeof mask.feather === 'number' ? mask.feather : 0,
    angle: kfExpr('angle', angle),
    position: kfExpr('position', position),
  });
  if (!expr) return null;
  // ★ 必须在 rgba 上做（yuv 无 alpha 通道，geq 的 a= 会被忽略）
  // ★ 且必须合成到黑底（否则 alpha 在转 yuv420p 时被丢弃 → 蒙版失效）
  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${expr}',split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay`;
}
