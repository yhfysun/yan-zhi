// @vitest-environment jsdom
//
// 移动端长按的**行为**测试（真实 DOM + 真实事件派发）。
//
// 为什么要有这一层（本轮真机验证被授权门禁挡住后的替代）：
//   静态断言只能证明"代码写了"，证明不了"按下去真的有反应"。
//   本项目历史上正是被这一点坑过：`useLongPress` 的键名带了 `on` 前缀 →
//   `grep` 命中、`DOMDebugger.getEventListeners` 也显示"已绑定"，
//   但实际注册成 `onOnPointerdown`，**按下去毫无反应**。
//   ⇒ 必须有一条"派发真实事件 → 断言回调被调用"的行为测试。
//
// 本文件覆盖：
//   1. bindLongPress 的完整行为（触屏长按触发 / 鼠标不接管 / 移动取消 / 吞 click）；
//   2. 把它的返回对象经 `Vue.toHandlers()` 展开后挂到真实 DOM 上 —— 这正是
//      `v-on="bindLongPress(...)"` 的真实路径，能抓出"前缀错位"这类静默失效。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toHandlers } from 'vue';
import { bindLongPress } from './useLongPress';

/**
 * 派发一个只带坐标的 PointerEvent。
 * ★ jsdom 25 **没有实现 PointerEvent 构造器**（`PointerEvent is not defined`），
 *   所以用 MouseEvent 派生一个等价物：真实浏览器里 PointerEvent 也是 MouseEvent 的子类，
 *   `bindLongPress` 只读 `pointerType / clientX / clientY` 三个字段 →
 *   这个派生类的可观测行为与真机一致。
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerType: string;
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: { pointerType?: string; pointerId?: number; isPrimary?: boolean } & MouseEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? 'touch';
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}
function pointer(type: string, opts: { x?: number; y?: number; pointerType?: string } = {}) {
  const { x = 100, y = 100, pointerType = 'touch' } = opts;
  return new FakePointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerType,
    pointerId: 1,
    isPrimary: true,
  });
}

/**
 * 把一个容器按 `v-on="bindLongPress(...)"` 的真实路径挂上处理器。
 *
 * ★★ 这里必须**复刻 Vue 的键名处理**（本轮实测踩到的脚手架 bug）：
 *   `toHandlers(obj)` 会给每个键补一次 `on` 前缀 → 得到 `onPointerdown` / `onClickCapture`。
 *   但 `addEventListener` 要的是**不带前缀**的事件名 → 直接 `addEventListener('onPointerdown')`
 *   永远不触发（我第一版就是这么写的，导致"长按全不触发"的假红）。
 *   Vue 内部在 patchProp 里做的是 `key.slice(2).toLowerCase()` + 识别 Capture 后缀。
 */
function mount(handler: (e: unknown) => void, opts?: Parameters<typeof bindLongPress>[1]) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const raw = bindLongPress(handler, opts) as Record<string, unknown>;
  const handlers = toHandlers(raw as any) as Record<string, unknown>;
  const bound: string[] = [];
  for (const [key, fn] of Object.entries(handlers)) {
    // ★★★ 前缀错位的特征：自带 on 前缀会被 toHandlers 补成 onOnXxx → 永不触发
    expect(key, `★ 键名错位：${key}（bindLongPress 自带 on 前缀 → 被 toHandlers 补成 onOnXxx）`)
      .not.toMatch(/^onOn/);
    expect(key, `★ toHandlers 后的键应带 on 前缀，实际是 ${key}`).toMatch(/^on/);
    let type = key.slice(2);
    let capture = false;
    if (type.endsWith('Capture')) { capture = true; type = type.slice(0, -'Capture'.length); }
    el.addEventListener(type.toLowerCase(), fn as EventListener, capture);
    bound.push(type.toLowerCase() + (capture ? ':capture' : ''));
  }
  // 正向：v-on 展开后必须真的落成这批原生事件
  for (const want of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'click:capture']) {
    expect(bound, `★ 缺少原生事件 ${want}（v-on 展开后没落到真实事件上）`).toContain(want);
  }
  return el;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('bindLongPress 行为：触屏长按真的会触发', () => {
  it('★★★ 经 toHandlers 展开后仍能触发（抓 on 前缀静默失效）', () => {
    // 这一条是本文件的核心：v-on 的对象会经 toHandlers() 补一次 on 前缀，
    // 若 bindLongPress 自己带了前缀 → 注册成 onOnPointerdown → 永远不触发。
    const cb = vi.fn();
    const el = mount(cb);

    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(510);

    expect(cb, '★ 长按没有触发 —— 键名可能带了 on 前缀（被 toHandlers 补成 onOnXxx）').toHaveBeenCalledTimes(1);
  });

  it('★ 未到阈值不触发', () => {
    const cb = vi.fn();
    const el = mount(cb);
    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(300);
    expect(cb).not.toHaveBeenCalled();
  });

  it('★ 回调收到的是「以原事件为原型」的壳（能拿到坐标定位菜单）', () => {
    let got: Record<string, unknown> | null = null;
    let raw: Record<string, unknown> | null = null;
    const el = mount((e) => { got = e as Record<string, unknown>; });
    // 记下原始事件，用来比对"壳确实继承了它"
    document.addEventListener('pointerdown', (e) => { raw = e as unknown as Record<string, unknown>; }, { capture: true, once: true });
    el.dispatchEvent(pointer('pointerdown', { x: 137, y: 246 }));
    vi.advanceTimersByTime(510);
    expect(got).toBeTruthy();
    expect(raw).toBeTruthy();

    // ★★★ 核心：回调收到的必须是**以原事件为原型**的壳 —— 这样 clientX/clientY/target
    //   照旧从原型链读取（真机上拿到的就是真实坐标），而**不是**自有属性。
    //   历史坑：`Object.assign(e, { clientX })` 会创建自有属性并在赋值时撞只读 getter 抛错。
    expect(Object.getPrototypeOf(got!), '★ 壳没有以原事件为原型（改用 Object.assign 覆盖了？）').toBe(raw);
    for (const key of ['clientX', 'clientY', 'target']) {
      expect(Object.getOwnPropertyDescriptor(got!, key),
        `★ ${key} 成了壳的自有属性 —— 说明是被赋值覆盖的（Object.assign 的痕迹，真机会抛错）`).toBeUndefined();
    }
    // 正向：真值仍可从原型链读到（用 hasOwnProperty 探测避开 jsdom 的 WebIDL 品牌检查 ——
    //   jsdom 对 `Object.create(event)` 的壳访问 clientX/target 会抛
    //   "called on an object that is not a valid instance of MouseEvent"，
    //   真实 Chrome 不会；这是 jsdom 实现限制，不是被测代码的问题。）
    const proto = Object.getPrototypeOf(got!) as object;
    expect(Object.getPrototypeOf(proto), '★ 原型链只有一层，应指向原事件的类原型').toBeTruthy();
    // 事件方法可用（preventDefault 是长按里要调的）
    expect(typeof (got as unknown as { preventDefault?: unknown }).preventDefault,
      '★ 壳上拿不到 preventDefault').toBe('function');
  });

  it('★ 鼠标按下不接管（桌面端零影响）', () => {
    const cb = vi.fn();
    const el = mount(cb);
    el.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(1000);
    expect(cb, '★ 鼠标也被当成触屏长按了（桌面端会被破坏）').not.toHaveBeenCalled();
  });

  it('★ 手指移动超容差 → 取消（滚动列表不误触）', () => {
    const cb = vi.fn();
    const el = mount(cb);
    el.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
    vi.advanceTimersByTime(200);
    el.dispatchEvent(pointer('pointermove', { x: 160, y: 100 })); // 移动 60 > 10
    vi.advanceTimersByTime(600);
    expect(cb, '★ 滑动列表时误触了长按').not.toHaveBeenCalled();
  });

  it('★ 提前松手 → 取消', () => {
    const cb = vi.fn();
    const el = mount(cb);
    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(200);
    el.dispatchEvent(pointer('pointerup'));
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('★ pointercancel（如系统接管滚动）→ 取消', () => {
    const cb = vi.fn();
    const el = mount(cb);
    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(200);
    el.dispatchEvent(pointer('pointercancel'));
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('★ 触发后要吞掉紧随的那一次 click（否则"长按=顺便点了一下"）', () => {
    const cb = vi.fn();
    const el = mount(cb);
    const clickSpy = vi.fn();
    el.addEventListener('click', clickSpy);
    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(510);
    expect(cb).toHaveBeenCalledTimes(1);
    // 长按后补发的 click 应被吞（stopPropagation + preventDefault）
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clickSpy, '★ 长按后的 click 没有被吞掉（会顺带选中/打开）').not.toHaveBeenCalled();
  });

  it('★ 回调抛错不得让 swallowClick 卡在 true（会误吞后续真实点击）', () => {
    const el = mount(() => { throw new Error('boom'); });
    el.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(510); // 回调抛错
    const clickSpy = vi.fn();
    el.addEventListener('click', clickSpy);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clickSpy, '★ 回调抛错后把后续真实点击也吞了').toHaveBeenCalled();
  });

  it('★ 自定义时长/容差生效', () => {
    const cb = vi.fn();
    const el = mount(cb, { duration: 100, moveTolerance: 50 });
    el.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 }));
    vi.advanceTimersByTime(110);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});