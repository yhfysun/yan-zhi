/**
 * 远控手势识别（纯逻辑，可直接单测）。
 *
 * 目标行为对齐 UU 远控移动端：
 *   单指轻点 = 左键单击        长按 = 右键单击
 *   单指拖动 = 直接模式拖拽 / 指针模式移动指针
 *   双指上下滑 = 滚轮          双指捏合 = 本地缩放
 *   双指轻点 = 右键单击
 *
 * 关键不变式（修「点着点着就单击无用」）：
 *   任何进入双指、cancel、断线路径都必须结束可能已按下的左键 —— 早期实现只在
 *   「正在拖拽」时补 up，双指滚动常常在 down 之后开始，左键就一直卡在按下状态，
 *   后续所有点击都被系统当成拖拽。
 */

export type RemoteGestureMode = 'direct' | 'pointer';

export interface RemoteGestureOptions {
  mode: RemoteGestureMode;
  /** 单指位移超过该值就不再算轻点（px） */
  tapSlop?: number;
  /** 长按判定时长（ms） */
  longPressMs?: number;
  /** 双指中点纵向位移达到该值 → 判定为滚动（px） */
  scrollStartPx?: number;
  /** 双指间距变化达到该值 → 判定为捏合（px） */
  pinchStartPx?: number;
  /** 手指纵向每移动 1px 换算的滚轮增量 */
  wheelStep?: number;
  /** 双指轻点持续上限（ms） */
  twoFingerTapMs?: number;
}

export type RemoteGestureEvent =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'rightTap'; x: number; y: number; fromTwoFinger: boolean }
  | { kind: 'dragStart'; x: number; y: number }
  | { kind: 'dragMove'; x: number; y: number }
  | { kind: 'dragEnd'; x: number; y: number }
  | { kind: 'pointerMove'; dx: number; dy: number }
  | { kind: 'wheel'; x: number; y: number; delta: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; ratio: number; anchorX: number; anchorY: number };

interface PointerEntry { x: number; y: number }

interface TwoFingerState {
  startDist: number;
  lastDist: number;
  startMidY: number;
  startMidX: number;
  lastMidY: number;
  lastMidX: number;
  intent: 'none' | 'scroll' | 'pinch' | 'pan';
  moved: boolean;
  downAt: number;
  /** 滚轮余量：像素位移换算后不足 1 个单位的部分留到下一次，避免慢滑丢事件 */
  wheelAcc: number;
}

const DEFAULTS = {
  tapSlop: 8,
  longPressMs: 450,
  scrollStartPx: 10,
  pinchStartPx: 24,
  // 手指 1px 换算的滚轮单位：Windows 一格是 120，滑 80px ≈ 3 格，跟手；
  // 旧值 1.5 时滑 80px 只有 120（1 格），体感就是「双指下滑没反应」。
  wheelStep: 5,
  // 双指同落同起的真实耗时很少低于 300ms；旧值 260ms 让双指右键几乎打不出来。
  twoFingerTapMs: 420,
};

function distance(a: PointerEntry, b: PointerEntry): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class RemoteGestureRecognizer {
  private readonly opt: Required<RemoteGestureOptions>;
  private pointers = new Map<number, PointerEntry>();
  private primary: number | null = null;
  private start: PointerEntry | null = null;
  private last: PointerEntry | null = null;
  private downAt = 0;
  private longPending = false;
  private longFired = false;
  private moved = false;
  private dragging = false;
  private two: TwoFingerState | null = null;
  /** 三指平移状态（双指保留给滚动，平移移到三指） */
  private three: { lastX: number; lastY: number } | null = null;
  /** 双指手势结束后，剩下那根手指不许退化成单指拖动（否则滚完一抬手就误拖） */
  private suppressSingle = false;

  constructor(options: RemoteGestureOptions) {
    this.opt = { ...DEFAULTS, ...options };
  }

  get mode(): RemoteGestureMode {
    return this.opt.mode;
  }

  setMode(mode: RemoteGestureMode): void {
    this.opt.mode = mode;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** 无任何手势进行中（用于决定是否给新手指设指针捕获，见 RemoteControl 舞台按下处理） */
  get isIdle(): boolean {
    return this.pointers.size === 0;
  }

  reset(): void {
    this.pointers.clear();
    this.primary = null;
    this.start = null;
    this.last = null;
    this.downAt = 0;
    this.longPending = false;
    this.longFired = false;
    this.moved = false;
    this.dragging = false;
    this.two = null;
    this.three = null;
    this.suppressSingle = false;
  }

  down(id: number, x: number, y: number, now: number): RemoteGestureEvent[] {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1) {
      this.primary = id;
      this.start = { x, y };
      this.last = { x, y };
      this.downAt = now;
      this.longPending = true;
      this.longFired = false;
      this.moved = false;
      this.dragging = false;
      return [];
    }
    if (this.pointers.size === 2) {
      const events: RemoteGestureEvent[] = [];
      this.suppressSingle = true;
      // 第二指落下：先把可能按下的左键抬起来，再进入双指手势
      if (this.dragging && this.last) {
        events.push({ kind: 'dragEnd', x: this.last.x, y: this.last.y });
        this.dragging = false;
      }
      this.longPending = false;
      const pts = [...this.pointers.values()];
      const d = distance(pts[0], pts[1]);
      this.two = {
        startDist: d,
        lastDist: d,
        startMidY: (pts[0].y + pts[1].y) / 2,
        startMidX: (pts[0].x + pts[1].x) / 2,
        lastMidY: (pts[0].y + pts[1].y) / 2,
        lastMidX: (pts[0].x + pts[1].x) / 2,
        intent: 'none',
        moved: false,
        downAt: now,
        wheelAcc: 0,
      };
      return events;
    }
    // 第三指落下：接管为「三指平移」——双指保留给滚动（高频小动作，两指易误触成
    // 捏合/拖拽；三指语义清晰）。已有双指手势立即取消。
    if (this.pointers.size >= 3 && !this.three) {
      const p3 = [...this.pointers.values()];
      this.three = {
        lastX: p3.reduce((s, p) => s + p.x, 0) / p3.length,
        lastY: p3.reduce((s, p) => s + p.y, 0) / p3.length,
      };
      this.two = null;
      this.suppressSingle = true;
      return [];
    }
    return [];
  }

  move(id: number, x: number, y: number): RemoteGestureEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    p.x = x;
    p.y = y;

    // 三指平移优先：三指重心移动 = pan 事件（本地画面平移）
    if (this.three) {
      if (this.pointers.size < 3) {
        this.three = null;
        return [];
      }
      const p3 = [...this.pointers.values()];
      const cx = p3.reduce((s, q) => s + q.x, 0) / p3.length;
      const cy = p3.reduce((s, q) => s + q.y, 0) / p3.length;
      const dx = cx - this.three.lastX;
      const dy = cy - this.three.lastY;
      this.three.lastX = cx;
      this.three.lastY = cy;
      if (dx === 0 && dy === 0) return [];
      return [{ kind: 'pan', dx, dy }];
    }

    if (this.two) {
      const pts = [...this.pointers.values()];
      if (pts.length < 2) return [];
      const d = distance(pts[0], pts[1]);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const t = this.two;
      if (t.intent === 'none') {
        if (Math.abs(d - t.startDist) >= this.opt.pinchStartPx) t.intent = 'pinch';
        // 双指拖动永远滚动远端：平移已移给三指（fill 模式下双指拖动此前被 pan 吃掉，
        // 用户体感「双指滚动变成移动」）。
        else if (Math.abs(midY - t.startMidY) >= this.opt.scrollStartPx
          || Math.abs(midX - t.startMidX) >= this.opt.scrollStartPx) t.intent = 'scroll';
        else return [];
      }
      t.moved = true;
      if (t.intent === 'pinch') {
        const ratio = d / Math.max(1, t.lastDist);
        t.lastDist = d;
        t.lastMidX = midX;
        t.lastMidY = midY;
        if (Math.abs(ratio - 1) < 0.01) return [];
        return [{ kind: 'zoom', ratio, anchorX: midX, anchorY: midY }];
      }
      if (t.intent === 'pan') {
        // 放大/铺满时：双指拖动平移本地画面，而不是把滚动注入远端
        const dx = midX - t.lastMidX;
        const dy = midY - t.lastMidY;
        t.lastMidX = midX;
        t.lastMidY = midY;
        if (dx === 0 && dy === 0) return [];
        return [{ kind: 'pan', dx, dy }];
      }
      const dy = midY - t.lastMidY;
      t.lastMidY = midY;
      t.lastMidX = midX;
      if (dy === 0) return [];
      // 像素累积：慢速小幅滑动不会被取整抹成 0（旧实现滑得慢就等于完全没反应）
      t.wheelAcc += -dy * this.opt.wheelStep;
      const raw = Math.trunc(t.wheelAcc);
      if (raw === 0) return [];
      t.wheelAcc -= raw;
      const delta = Math.max(-400, Math.min(400, raw));
      return [{ kind: 'wheel', x: midX, y: midY, delta }];
    }

    if (this.primary !== id) return [];
    if (this.suppressSingle || this.longFired) return [];

    const total = Math.hypot(x - this.start!.x, y - this.start!.y);
    if (total > this.opt.tapSlop) {
      this.longPending = false;
      this.moved = true;
    }

    if (this.opt.mode === 'pointer') {
      const dx = x - this.last!.x;
      const dy = y - this.last!.y;
      this.last = { x, y };
      return this.moved ? [{ kind: 'pointerMove', dx, dy }] : [];
    }

    if (!this.moved) return [];
    const events: RemoteGestureEvent[] = [];
    if (!this.dragging) {
      this.dragging = true;
      events.push({ kind: 'dragStart', x: this.start!.x, y: this.start!.y });
    }
    this.last = { x, y };
    events.push({ kind: 'dragMove', x, y });
    return events;
  }

  up(id: number, x: number, y: number, now: number): RemoteGestureEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    p.x = x;
    p.y = y;
    this.pointers.delete(id);

    // 三指任一抬起：结束三指平移，剩余手指不退化为单指拖动（防误触）
    if (this.three) {
      if (this.pointers.size < 3) {
        this.three = null;
        this.pointers.clear();
        this.primary = null;
        this.dragging = false;
        this.longPending = false;
        this.suppressSingle = false;
      }
      return [];
    }

    if (this.two) {
      const t = this.two;
      if (this.pointers.size < 2) {
        this.two = null;
        if (!t.moved && t.intent === 'none' && now - t.downAt <= this.opt.twoFingerTapMs) {
          this.pointers.clear();
          this.primary = null;
          this.dragging = false;
          this.longPending = false;
          this.suppressSingle = false;
          return [{ kind: 'rightTap', x: p.x, y: p.y, fromTwoFinger: true }];
        }
      }
      if (this.pointers.size === 0) {
        this.primary = null;
        this.dragging = false;
        this.longPending = false;
        this.suppressSingle = false;
      }
      return [];
    }

    if (this.primary !== id) {
      if (this.pointers.size === 0) this.primary = null;
      return [];
    }

    const events: RemoteGestureEvent[] = [];
    if (this.dragging) {
      events.push({ kind: 'dragEnd', x, y });
    } else if (this.longPending && !this.longFired && !this.moved) {
      events.push({ kind: 'tap', x, y });
    }
    this.reset();
    return events;
  }

  /** 长按计时器到点：仍处于「单指按下且未移动」才升级为右键 */
  maybeLongPress(now: number): RemoteGestureEvent[] {
    if (this.two || this.suppressSingle) return [];
    if (!this.longPending || this.longFired || this.moved || this.dragging) return [];
    if (!this.primary || this.pointers.size !== 1) return [];
    if (now - this.downAt < this.opt.longPressMs) return [];
    this.longPending = false;
    this.longFired = true;
    const p = this.pointers.get(this.primary);
    return p ? [{ kind: 'rightTap', x: p.x, y: p.y, fromTwoFinger: false }] : [];
  }

  /** 取消（pointercancel / 页面隐藏 / 断开）：必须把按下状态补一个抬键 */
  cancel(): RemoteGestureEvent[] {
    const events: RemoteGestureEvent[] = [];
    if (this.dragging && this.last) events.push({ kind: 'dragEnd', x: this.last.x, y: this.last.y });
    this.reset();
    return events;
  }
}
