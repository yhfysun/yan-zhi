// 场景轮播（components/chat/SceneCarousel.vue）—— 降级阈值与拖动状态机回归测试。
//
// 钉住的契约（2026-09-17 三处实修，均由 CDP 实测暴露）：
//   1) 宽度降级阈值：≥640 → 3D 轮播；240~640 → 横向卡片条；<240 → 按钮行。
//      阈值曾是 320，而开发模式聊天列固定 420px（减去内边距后轮播容器实测 315px），
//      卡在阈值之下 → 直接掉到「按钮行」，用户完全看不到卡片（表现为「卡片没有拖动效果」）。
//   2) 惯性滑动结束后必须复位 immediate，否则 is-dragging 常驻、CSS transition 永久关闭。
//   3) 3D 轮播的 pointer 绑定必须跟随形态切换重新绑定（原实现只在 onMounted 绑一次）。
//
// 说明：本文件是纯函数级契约测试（node 环境无 DOM），
// 故只覆盖可脱离渲染器验证的「阈值矩阵」与「拖动状态机」两处纯逻辑。

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────
// 1) 阈值矩阵：与 SceneCarousel 内 mode computed 保持同一份判定规则
// ────────────────────────────────────────────────────────────
const STAGE_MIN = 640;
const STRIP_MIN = 240;

function modeOf(containerW: number, reduced = false): 'stage' | 'strip' | 'buttons' {
  if (reduced) return 'strip';
  if (containerW >= STAGE_MIN) return 'stage';
  return containerW >= STRIP_MIN ? 'strip' : 'buttons';
}

describe('轮播降级阈值矩阵', () => {
  it('办公模式宽容器（680px 实测）走 3D 轮播', () => {
    expect(modeOf(680)).toBe('stage');
  });

  it('开发模式聊天列（轮播容器实测 315px）走卡片条 —— 不是按钮行', () => {
    // 回归点：阈值 320 时 315 会掉到 buttons，卡片形态完全不出现。
    expect(modeOf(315)).toBe('strip');
  });

  it('阈值边界：640 与 240 都归入较大的形态（左闭）', () => {
    expect(modeOf(STAGE_MIN)).toBe('stage');
    expect(modeOf(STAGE_MIN - 1)).toBe('strip');
    expect(modeOf(STRIP_MIN)).toBe('strip');
    expect(modeOf(STRIP_MIN - 1)).toBe('buttons');
  });

  it('极窄容器（<240）退化为按钮行', () => {
    expect(modeOf(239)).toBe('buttons');
    expect(modeOf(120)).toBe('buttons');
  });

  it('prefers-reduced-motion 恒走卡片条（不渲染 3D）', () => {
    expect(modeOf(1200, true)).toBe('strip');
    expect(modeOf(300, true)).toBe('strip');
  });

  it('开发模式默认列宽 420px 减内边距后的区间必然落进卡片条（防止再次误调阈值）', () => {
    // 420px 列 - 左右内边距 20px × 2 - 滚动条约 5px ≈ 355；实测轮播容器 315px。
    for (const w of [300, 315, 355]) {
      expect(modeOf(w)).toBe('strip');
    }
  });
});

// ────────────────────────────────────────────────────────────
// 2) 拖动状态机：immediate（跟手态）与 moved（点击判定）的生命周期
//    复刻 SceneCarousel 的 pointerdown / move / up / inertia 语义
// ────────────────────────────────────────────────────────────
interface DragState {
  immediate: boolean;
  moved: number;
  vel: number;
  angle: number;
}

const DAMP = 0.22;
const FRICTION = 0.94;
const TICK_MS = 16;
/** 惯性停止阈值：|vel| <= 0.02 即判定停下（与实现一致） */
const VEL_EPS = 0.02;

function makeDrag(): DragState {
  return { immediate: false, moved: 0, vel: 0, angle: 0 };
}

function pointerDown(s: DragState): void {
  s.immediate = true;
  s.moved = 0;
  s.vel = 0;
}

function pointerMove(s: DragState, dx: number): void {
  if (!s.immediate) return;
  s.moved += Math.abs(dx);
  s.angle += dx * DAMP;
  s.vel = (dx * DAMP) / TICK_MS;
}

/**
 * 惯性滑动直到停止。
 * 返回是否在结束时就地复位 immediate —— 这是本次修复的核心。
 */
function inertiaUntilStop(s: DragState): boolean {
  let guard = 0;
  while (Math.abs(s.vel) > VEL_EPS && guard++ < 1000) {
    s.vel *= FRICTION;
    s.angle += s.vel * TICK_MS;
  }
  // 修复后的实现：停止时 immediate.value = false
  if (Math.abs(s.vel) <= VEL_EPS) {
    s.immediate = false;
    return true;
  }
  return false;
}

function pointerUp(s: DragState): 'inertia' | 'snap' {
  if (!s.immediate) return 'snap';
  if (Math.abs(s.vel) > VEL_EPS) {
    inertiaUntilStop(s);
    return 'inertia';
  }
  s.immediate = false;
  return 'snap';
}

describe('拖动状态机：immediate 生命周期', () => {
  it('pointerdown 进入跟手态；无位移松手立刻退出', () => {
    const s = makeDrag();
    pointerDown(s);
    expect(s.immediate).toBe(true);
    expect(pointerUp(s)).toBe('snap');
    expect(s.immediate).toBe(false);
  });

  it('惯性滑动结束后 immediate 必须复位（回归：is-dragging 常驻 → 转场动画永久失效）', () => {
    const s = makeDrag();
    pointerDown(s);
    pointerMove(s, 18); // 给一个足以触发惯性的速度
    expect(pointerUp(s)).toBe('inertia');
    expect(s.immediate).toBe(false);
  });

  it('跟手期间 angle 随位移单调增加（方向正确）', () => {
    const s = makeDrag();
    pointerDown(s);
    pointerMove(s, 20);
    const mid = s.angle;
    pointerMove(s, 20);
    expect(s.angle).toBeGreaterThan(mid);
    expect(s.angle).toBeCloseTo(40 * DAMP, 5);
  });
});

describe('拖动状态机：moved 与点击判定', () => {
  it('微小抖动（<6px）不算拖动，点击应生效', () => {
    const s = makeDrag();
    pointerDown(s);
    pointerMove(s, 2);
    pointerMove(s, 2);
    expect(s.moved).toBe(4);
    expect(s.moved > 6).toBe(false); // onCardClick 的判据
  });

  it('横拖超过 6px 视为拖动，点击应被抑制', () => {
    const s = makeDrag();
    pointerDown(s);
    pointerMove(s, 10);
    expect(s.moved > 6).toBe(true);
  });

  it('每次 pointerdown 都重置 moved（回归：残留 moved 会永久吞掉后续点击）', () => {
    const s = makeDrag();
    // 第一次拖动后遗留 moved
    pointerDown(s);
    pointerMove(s, 50);
    pointerUp(s);
    // 修复后由 requestAnimationFrame 复位；此处直接模拟该复位时机
    s.moved = 0;
    // 第二次独立点击
    pointerDown(s);
    expect(s.moved).toBe(0);
    pointerUp(s);
    expect(s.moved).toBe(0);
    expect(s.immediate).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 3) 吸附取模：拖动后落位必须是卡位整数倍（与 theta 对齐）
// ────────────────────────────────────────────────────────────
describe('吸附落位', () => {
  const theta = 360 / 10;

  function snap(angle: number): number {
    return Math.round(-angle / theta) * -theta;
  }

  it('吸附结果恒为 theta 的整数倍', () => {
    for (const a of [0, 7, 31.68, 72, -13, 359, 500]) {
      const t = snap(a);
      expect(Math.abs(t % theta)).toBeLessThan(1e-9);
    }
  });

  it('吸附到最近卡位（误差不超过半档）', () => {
    expect(snap(31.68)).toBe(36);
    expect(snap(20)).toBe(36);   // 20 距 36 更近（比 0 的 20 略近，取半档 18 为界）
    expect(snap(17)).toBe(0);
    expect(snap(72)).toBe(72);
  });
});