/**
 * 轻量 git 分支图布局计算（IDEA 风格：每个提交行内嵌一个泳道单元）。
 *
 * 输入按 git log 顺序（新→旧）的提交列表，输出每行的线段与圆点坐标。
 * 坐标以「泳道序号」表示，渲染时按 laneWidth 换算为像素。
 *
 * 算法：维护一组「活跃指针」（每条尚未走到终点的分支线，指向它等待的父提交）。
 * 逐行处理提交：
 *  1. 找到指向本提交的指针 → 本提交落在该泳道（新提交则分配空闲泳道）；
 *  2. 与本提交无关的活跃线在本行垂直贯穿；
 *  3. 指向本提交的线从顶部弯入圆点，随后消费掉；
 *  4. 为每个父提交分配泳道（已被其他线等待的父提交直接连过去），从圆点引出。
 */

export interface GraphSegment {
  /** 起点泳道（行顶部） */
  x1: number;
  /** 终点泳道（行底部 / 圆点） */
  x2: number;
  /** 片段位置：full=贯穿整行；top=上半行（弯入圆点）；bottom=下半行（自圆点引出） */
  part: 'full' | 'top' | 'bottom';
  color: string;
}

export interface GraphRow {
  segments: GraphSegment[];
  dot: { x: number; color: string } | null;
}

export interface GraphLayout {
  rows: Map<string, GraphRow>;
  /** 单泳道宽度（px） */
  laneWidth: number;
  /** SVG 建议总宽（px） */
  width: number;
}

const PALETTE = ['#2563eb', '#d97706', '#059669', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];
const LANE_WIDTH = 14;

export function computeGraphLayout(commits: Array<{ hash: string; parents: string[] }>): GraphLayout {
  const rows = new Map<string, GraphRow>();
  // 活跃指针：lane index → 该线正在等待的父提交
  const pointers: Array<{ hash: string; color: string } | null> = [];
  let colorCursor = 0;
  const nextColor = () => PALETTE[colorCursor++ % PALETTE.length];

  for (const c of commits) {
    const segments: GraphSegment[] = [];

    // 1) 汇入本提交的活跃线（常规 0/1 条）
    const incoming: number[] = [];
    pointers.forEach((p, i) => { if (p && p.hash === c.hash) incoming.push(i); });

    let dotX: number;
    let dotColor: string;
    if (incoming.length) {
      dotX = Math.min(...incoming);
      dotColor = pointers[incoming[0]]!.color;
    } else {
      const free = pointers.findIndex((p) => !p);
      dotX = free >= 0 ? free : pointers.length;
      dotColor = nextColor();
    }

    // 2) 与本提交无关的活跃线贯穿整行
    pointers.forEach((p, i) => {
      if (p && p.hash !== c.hash) segments.push({ x1: i, x2: i, part: 'full', color: p.color });
    });
    // 3) 汇入线：顶部弯到圆点
    for (const i of incoming) segments.push({ x1: i, x2: dotX, part: 'top', color: pointers[i]!.color });
    for (const i of incoming) pointers[i] = null;

    // 4) 为父提交分配泳道，自圆点引出
    for (const ph of c.parents) {
      const existing = pointers.findIndex((p) => p && p.hash === ph);
      if (existing >= 0) {
        // 已有活跃线在等这个父提交（并行分支汇合）：连过去并用那条线的颜色
        segments.push({ x1: dotX, x2: existing, part: 'bottom', color: pointers[existing]!.color });
      } else {
        const free = pointers.findIndex((p) => !p);
        const target = free >= 0 ? free : pointers.length;
        if (free < 0) pointers.push(null);
        pointers[target] = { hash: ph, color: dotColor };
        segments.push({ x1: dotX, x2: target, part: 'bottom', color: dotColor });
      }
    }

    rows.set(c.hash, { segments, dot: { x: dotX, color: dotColor } });
  }

  const laneCount = Math.max(1, pointers.length);
  return { rows, laneWidth: LANE_WIDTH, width: LANE_WIDTH * (laneCount + 1) };
}

/** 泳道序号 → 圆心 X 坐标（px） */
export function laneX(lane: number, laneWidth = LANE_WIDTH): number {
  return lane * laneWidth + laneWidth / 2;
}

/**
 * 线段 → SVG path。曲线用三次贝塞尔（控制点在同一直线上时自动退化为直线），
 * 因此 x1===x2 时无需特判。
 */
export function segmentPath(seg: GraphSegment, rowHeight: number, laneWidth = LANE_WIDTH): string {
  const x1 = laneX(seg.x1, laneWidth);
  const x2 = laneX(seg.x2, laneWidth);
  const ym = rowHeight / 2;
  if (seg.part === 'top') {
    return `M ${x1} 0 C ${x1} ${ym * 0.4}, ${x2} ${ym * 0.6}, ${x2} ${ym}`;
  }
  if (seg.part === 'bottom') {
    return `M ${x1} ${ym} C ${x1} ${ym + (rowHeight - ym) * 0.6}, ${x2} ${ym + (rowHeight - ym) * 0.4}, ${x2} ${rowHeight}`;
  }
  return `M ${x1} 0 L ${x2} ${rowHeight}`;
}
