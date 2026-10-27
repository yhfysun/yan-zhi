// 双 Y 轴分组：同一根轴上量级差太远的指标会被压成直线，
// 按「最大值排序后最大的倍数断层」把系列分到左右两根轴。

/** 量级差距超过这个倍数才拆轴，避免量级相近时白白多一根轴 */
export const AXIS_SPLIT_RATIO = 20;

export interface MagnitudeSplit {
  /** 与输入一一对应：0 = 左轴，1 = 右轴 */
  axisOf: number[];
  dual: boolean;
}

export function splitByMagnitude(maxes: number[]): MagnitudeSplit {
  const safe = maxes.map((m) => (Number.isFinite(m) ? Math.abs(m) : 0));
  if (safe.length < 2) return { axisOf: safe.map(() => 0), dual: false };
  // 全零的系列没有量级可谈，固定放左轴
  const candidates = safe
    .map((m, i) => ({ m, i }))
    .filter((x) => x.m > 0)
    .sort((a, b) => a.m - b.m);
  if (candidates.length < 2) return { axisOf: safe.map(() => 0), dual: false };
  let splitAt = 0;
  let bestRatio = 1;
  for (let k = 1; k < candidates.length; k++) {
    const ratio = candidates[k].m / candidates[k - 1].m;
    if (ratio > bestRatio) { bestRatio = ratio; splitAt = k; }
  }
  if (bestRatio < AXIS_SPLIT_RATIO) return { axisOf: safe.map(() => 0), dual: false };
  const threshold = candidates[splitAt - 1].m;
  return { axisOf: safe.map((m) => (m > threshold ? 1 : 0)), dual: true };
}
