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
  | { kind: 'zoom'; ratio: number; anchorX: number; anchorY: number };

interface PointerEntry { x: number; y: number }

interface TwoFingerState {
  startDist: number;
  lastDist: number;
  startMidY: number;
  lastMidY: number;
  lastMidX: number;
  intent: 'none' | 'scroll' | 'pinch';
  moved: boolean;
  downAt: number;
}

const DEFAULTS = {
  tapSlop: 8,
  longPressMs: 450,
  scrollStartPx: 10,
  pinchStartPx: 24,
  wheelStep: 1.5,
  twoFingerTapMs: 260,
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
        lastMidY: (pts[0].y + pts[1].y) / 2,
        lastMidX: (pts[0].x + pts[1].x) / 2,
        intent: 'none',
        moved: false,
        downAt: now,
      };
      return events;
    }
    // 第三指：只标记「不是双指轻点」，不改变当前手势
    if (this.two) this.two.moved = true;
    return [];
  }

  move(id: number, x: number, y: number): RemoteGestureEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    p.x = x;
    p.y = y;

    if (this.two) {
      const pts = [...this.pointers.values()];
      if (pts.length < 2) return [];
      const d = distance(pts[0], pts[1]);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const t = this.two;
      if (t.intent === 'none') {
        if (Math.abs(d - t.startDist) >= this.opt.pinchStartPx) t.intent = 'pinch';
        else if (Math.abs(midY - t.startMidY) >= this.opt.scrollStartPx) t.intent = 'scroll';
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
      const dy = midY - t.lastMidY;
      t.lastMidY = midY;
      t.lastMidX = midX;
      if (Math.abs(dy) < 1) return [];
      const delta = Math.max(-400, Math.min(400, -Math.round(dy * this.opt.wheelStep)));
      return delta === 0 ? [] : [{ kind: 'wheel', x: midX, y: midY, delta }];
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
