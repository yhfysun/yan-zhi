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
//
// ★★★ 注意 geq 的变量名：**X/Y 是大写**（像素坐标），**W/H 也是大写**（尺寸）。
//   写成小写 x/y/w/h 会被当成"未定义变量"→ ffmpeg 报错或算出常量 → 蒙版失效。

export interface MaskShapeParams {
  /** 形状 id：circle / ellipse / rect / rounded / heart / star / diamond / split_* / top_circle */
  shape: string;
  /** 蒙版尺寸比例 0.1~1（1 = 占满短边） */
  scale: number;
  /** 中心偏移（画面宽/高的比例，-0.5~0.5） */
  offsetX: number;
  offsetY: number;
  /** 边缘羽化像素（0 = 硬边） */
  feather: number;
}

/** 生成形状蒙版的 alpha 表达式（geq 的 a= 部分）。返回 null 表示未知形状。 */
export function shapeAlphaExpr(p: MaskShapeParams): string | null {
  const cx = `(W/2 + ${p.offsetX.toFixed(4)}*W)`;
  const cy = `(H/2 + ${p.offsetY.toFixed(4)}*H)`;
  // ✅ 语义：scale = 蒙版**占短边的比例**（1 = 撑满短边，0.5 = 一半）。
  //   半径 = scale * min(W,H) / 2，即直径 = scale * 短边。
  //
  // ★★ 第一次写成 `Math.min(50, Math.round(p.scale * 100))` —— 两处错：
  //   ① 上限 50 把 0.9（应 90）截成 50 → 蒙版恒为短边 50%；② 与 scale 语义反了
  //   （scale 越大蒙版越大才对）。这类"数值看着合理但量纲错"只能靠打印表达式发现
  //   （见 tools/verify-masks.cjs —— 它现在直接调实现拿表达式，不再手写复刻）。
  const pct = Math.max(5, Math.min(100, Math.round(p.scale * 100)));
  const r = `(${pct}/100*min(W\\,H)/2)`;
  const feather = Math.max(0, p.feather);
  // 硬边 or 羽化：羽化用线性过渡（alpha 从 255 渐到 0）
  /**
 * 生成带羽化的 alpha：距中心 < r 全不透明；r ~ r+feather 之间线性淡出。
 *
 * ★★ 转义规则（实跑踩到，务必记住）：geq 表达式里
 *   · **外层函数调用的参数分隔** 用 `\,`（filtergraph 会把裸 `,` 当成滤镜分隔符）
 *   · **内层嵌套调用里**（已在一对括号内）直接用 `,`
 *   第一版两处都写 `\,` → `Error initializing filters / Invalid argument`，
 *   报错完全看不出是转义问题（这是实跑验证的价值所在）。
 */
  const soft = (dist: string) =>
    feather > 0
      ? `if(lt(${dist}\\,${r})\\,255\\,if(lt(${dist}\\,${r}+${feather})\\,255*(1-(${dist}-${r})/${feather})\\,0))`
      : `if(lt(${dist}\\,${r})\\,255\\,0)`;
  const hard = (cond: string) => `if(${cond}\\,255\\,0)`;

  switch (p.shape) {
    case 'circle':
    case 'top_circle': {
      // top_circle：中心上移到画面 1/3 处（口播头像圈）
      const c = p.shape === 'top_circle' ? `(H/3)` : cy;
      return soft(`hypot(X-(${cx}),Y-(${c}))`);
    }
    case 'ellipse':
      // 椭圆：把 x 方向距离按宽高比拉伸后再比较
      return soft(`hypot((X-(${cx}))*0.75,Y-(${cy}))`);
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
      // 五角星：极坐标下"半径阈值随角度做 5 次起伏"。
      //
      // ★★ 转义规则（实跑踩到，务必记住）：geq 表达式里
      //   · **外层函数调用的参数分隔** 用 `\,`
      //   · **内层嵌套调用里**（已在一对括号内）直接用 `,` —— 多转义一层会
      //     "Error initializing filters / Invalid argument"（表达式解析失败）。
      //   第一版把内层也写成 `\,` 就整条炸了，且报错只说 filter 初始化失败，很难归因。
      const dx = `(X-(${cx}))`;
      const dy = `(Y-(${cy}))`;
      const theta = `atan2(${dy},${dx})`;
      const dist = `hypot(${dx},${dy})`;
      // 阈值 = r * (0.45 + 0.55*|cos(2.5θ)|)，在 5 个方向上达到最大半径
      const lim = `${r}*(0.45+0.55*abs(cos(2.5*${theta})))`;
      return feather > 0
        ? `if(lt(${dist}\\,${lim})\\,255\\,if(lt(${dist}\\,${lim}+${feather})\\,255*(1-(${dist}-${lim})/${feather})\\,0))`
        : `if(lt(${dist}\\,${lim})\\,255\\,0)`;
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
    default:
      return null;
  }
}

/**
 * 构造完整的蒙版滤镜串（可直接拼进 -vf）。
 * 返回 null 表示"无需蒙版"（shape=none 且无 key）。
 *
 * ★★★ 关键实现细节（2026-10-07 抽帧踩到，务必照做）：
 *   **只设 alpha 是没用的** —— 后续必须把带 alpha 的画面**合成到黑底**上，
 *   否则 `format=yuv420p`（无 alpha 通道）会把透明度直接丢掉、RGB 原样保留
 *   → **蒙版完全失效**，而且 ffmpeg 不报任何错、产物也能正常播放。
 *   实测证据：circle 与 heart 两版成品的同一帧 **md5 完全相同**（都是完整色条）。
 *
 *   正确写法 = `geq 设 alpha` → `split` → 一份做黑底 → `overlay` 合成：
 *     format=rgba,geq=...[a='<形状>'],split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay
 *   （不要用 `crop`/`pad` 近似 —— 那只能做矩形，做不了圆/心形；也不要在 geq 里直接
 *    把区域外颜色涂黑，那样叠加到别的素材上时是"黑色块"而不是"透明"，无法做画中画。）
 */
export function buildMaskFilter(mask: {
  shape?: string; scale?: number; offsetX?: number; offsetY?: number; feather?: number; key?: string;
}, keyFilter?: (id: string) => string | null): string | null {
  // 色键优先（用户给了抠像就按抠像走）
  if (mask.key && mask.key !== 'none') {
    const kf = keyFilter ? keyFilter(mask.key) : null;
    if (kf) return kf;
  }
  const shape = (mask.shape || '').trim();
  if (!shape || shape === 'none') return null;
  const expr = shapeAlphaExpr({
    shape,
    scale: typeof mask.scale === 'number' && mask.scale > 0 ? Math.min(1, mask.scale) : 0.9,
    offsetX: typeof mask.offsetX === 'number' ? Math.max(-0.5, Math.min(0.5, mask.offsetX)) : 0,
    offsetY: typeof mask.offsetY === 'number' ? Math.max(-0.5, Math.min(0.5, mask.offsetY)) : 0,
    feather: typeof mask.feather === 'number' ? mask.feather : 0,
  });
  if (!expr) return null;
  // ★ 必须在 rgba 上做（yuv 无 alpha 通道，geq 的 a= 会被忽略）
  // ★ 且必须合成到黑底（否则 alpha 在转 yuv420p 时被丢弃 → 蒙版失效）
  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${expr}',split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay`;
}