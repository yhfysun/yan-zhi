import { describe, it, expect } from 'vitest';
import { RemoteGestureRecognizer, type RemoteGestureEvent } from './remote-gesture';

function make(mode: 'direct' | 'pointer' = 'direct'): RemoteGestureRecognizer {
  return new RemoteGestureRecognizer({ mode, longPressMs: 450 });
}

function kinds(events: RemoteGestureEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('RemoteGestureRecognizer · 单指', () => {
  it('轻点（无位移）抬起时产生一次左键单击', () => {
    const g = make();
    expect(g.down(1, 100, 100, 0)).toEqual([]);
    expect(g.up(1, 101, 100, 120)).toEqual([{ kind: 'tap', x: 101, y: 100 }]);
  });

  it('位移超过阈值即成为拖拽：先按下再移动，且抬起时只发一次 up', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    const start = g.move(1, 130, 100);
    expect(kinds(start)).toEqual(['dragStart', 'dragMove']);
    expect(g.move(1, 160, 100).map((e) => e.kind)).toEqual(['dragMove']);
    expect(g.up(1, 160, 100, 200)).toEqual([{ kind: 'dragEnd', x: 160, y: 100 }]);
  });

  it('长按产生右键，且抬起时不再补左键单击', () => {
    const g = make();
    g.down(1, 50, 60, 0);
    expect(g.maybeLongPress(200)).toEqual([]);
    expect(g.maybeLongPress(460)).toEqual([{ kind: 'rightTap', x: 50, y: 60, fromTwoFinger: false }]);
    expect(g.up(1, 50, 60, 700)).toEqual([]);
  });

  it('指针模式：拖动只移动指针，不产生按下/抬起；轻点仍是单击', () => {
    const g = make('pointer');
    g.down(1, 10, 10, 0);
    expect(g.move(1, 30, 10)).toEqual([{ kind: 'pointerMove', dx: 20, dy: 0 }]);
    expect(g.up(1, 30, 10, 100)).toEqual([]);

    g.down(2, 40, 40, 1000);
    expect(g.up(2, 40, 40, 1080)).toEqual([{ kind: 'tap', x: 40, y: 40 }]);
  });
});

describe('RemoteGestureRecognizer · 双指', () => {
  it('双指滑动只滚轮，不会触发单击，且不会卡住左键', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    // 第一指落下后直接来第二指：不应产生任何按下残留
    expect(g.down(2, 140, 100, 20)).toEqual([]);
    // 双指同向下滑 = 内容向下 = 滚轮向下（delta 为负）
    const wheel = g.move(1, 100, 130);
    expect(kinds(wheel)).toEqual(['wheel']);
    expect(wheel[0]).toMatchObject({ kind: 'wheel' });
    expect((wheel[0] as { delta: number }).delta).toBeLessThan(0);
    expect(g.up(1, 100, 130, 300)).toEqual([]);
    expect(g.up(2, 140, 130, 320)).toEqual([]);
    // 双指结束后再轻点，应恢复为正常的左键单击（早期实现这里会一直失效）
    g.down(3, 200, 200, 500);
    expect(g.up(3, 200, 200, 560)).toEqual([{ kind: 'tap', x: 200, y: 200 }]);
  });

  it('拖拽过程中加入第二指会先抬左键，再进入双指滚动', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    g.move(1, 140, 100);
    expect(g.isDragging).toBe(true);
    const events = g.down(2, 180, 100, 100);
    expect(events).toEqual([{ kind: 'dragEnd', x: 140, y: 100 }]);
    expect(g.isDragging).toBe(false);
  });

  it('双指间距明显变化判定为捏合，不再发滚轮', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    const zoom = g.move(1, 60, 100);
    expect(kinds(zoom)).toEqual(['zoom']);
    expect((zoom[0] as { ratio: number }).ratio).toBeGreaterThan(1);
    // 已锁定为捏合：后续只按间距变化缩放，不会再变成滚轮
    expect(kinds(g.move(1, 60, 180))).not.toContain('wheel');
  });

  it('双指滚动结束后先抬起一指，剩余手指继续移动不会变成拖拽', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    g.down(2, 140, 100, 20);
    g.move(1, 100, 140);
    expect(g.up(2, 140, 140, 200)).toEqual([]);
    expect(g.move(1, 100, 220)).toEqual([]);
    expect(g.up(1, 100, 220, 260)).toEqual([]);
  });

  it('双指轻点（几乎不移动）产生右键，而不是两次左键', () => {
    const g = make();
    g.down(1, 100, 100, 0);
    g.down(2, 140, 100, 30);
    expect(g.up(1, 100, 100, 120)).toEqual([{ kind: 'rightTap', x: 100, y: 100, fromTwoFinger: true }]);
    expect(g.up(2, 140, 100, 140)).toEqual([]);
  });
});

describe('RemoteGestureRecognizer · 安全性', () => {
  it('cancel 会把已按下的左键补起来', () => {
    const g = make();
    g.down(1, 10, 10, 0);
    g.move(1, 40, 10);
    expect(g.cancel()).toEqual([{ kind: 'dragEnd', x: 40, y: 10 }]);
    expect(g.isDragging).toBe(false);
  });

  it('长按后继续拖动不会变成拖拽', () => {
    const g = make();
    g.down(1, 10, 10, 0);
    expect(g.maybeLongPress(500)).toHaveLength(1);
    expect(g.move(1, 90, 10)).toEqual([]);
    expect(g.up(1, 90, 10, 600)).toEqual([]);
  });

  it('第三指落下不改变当前手势状态', () => {
    const g = make();
    g.down(1, 10, 10, 0);
    g.down(2, 50, 10, 10);
    expect(g.down(3, 90, 10, 20)).toEqual([]);
  });
});
