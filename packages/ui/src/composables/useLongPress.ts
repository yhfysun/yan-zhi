// 长按手势（移动端触屏），用于替代「右键」这类桌面专属交互。
//
// ★★★ 为什么需要（2026-09-22 用户反馈「长按没有实现」）：
//
//   本文件此前是一个**从未被任何组件引用**的简版实现（仅 touchstart/touchend），
//   而真正需要它的地方（会话列表「右键会话进入批量」、文件树、消息气泡）
//   全都只绑了 `@contextmenu` —— 那是**右键**。
//   移动端没有右键：Android WebView 上长按只会弹系统的文本选择/图片保存菜单，
//   `contextmenu` 在触屏上**行为不一致**（部分机型不派发，部分派发在松手时且坐标错位）。
//   于是界面上写着「右键会话进入批量」，用户却**怎么按都出不来**。
//
// ★ 为什么不用 `@contextmenu` 兼任触屏：长按与右键语义不同 ——
//   长按应在**按住约 500ms 后立刻触发**（不等松手），并在触发后**阻止随后那次 click**
//   （否则长按结束还会顺带选中/打开会话）。
//
// ★ 为什么用 Pointer Events 而非 touchstart：Pointer 在触屏/鼠标/触控笔下统一，
//   `pointerType === 'touch'` 可精确圈定"只在触屏启用"，鼠标右键仍走原生 contextmenu，
//   不会重复触发；也能直接拿到 clientX/Y 供菜单定位。
//
// 行为约定：
//   · 仅 `pointerType === 'touch'` 生效（鼠标/触控笔不受影响，桌面体验零变化）；
//   · 按住 `duration` 毫秒且移动未超 `moveTolerance` → 触发回调；
//   · 触发后**吞掉紧随的一次 click**（捕获阶段拦一次），避免"长按=顺便点了一下"；
//   · 移动超容差 / 提前松手 / pointercancel（滚动）→ 取消，不误触。
//
// ★★★ 键名绝不能带 `on` 前缀（2026-09-26 实测踩到，代价很大）：
//
//   `v-on="bindLongPress(...)"` 时，Vue 会调 `toHandlers(obj)` 展开，而
//   **`toHandlers` 会给每个键再加一次 `on` 前缀**：
//
//       Vue.toHandlers({ onPointerdown: fn })  →  { onOnPointerdown: fn }   ← 错！
//       Vue.toHandlers({ pointerdown:   fn })  →  { onPointerdown:   fn }   ← 对
//
//   本文件此前用的是 `onPointerdown` 等键名 → 实际注册成 `onOnPointerdown`，
//   **永远不会被任何事件触发** → 表现为「长按功能没有实现」：
//   代码在、函数在、`grep` 也命中，但按下去毫无反应（连会话列表的长按一起坏）。
//   ★ 排查时极具误导性：`DOMDebugger.getEventListeners` 会把它归一化显示成
//     `onPointerdown`，看着"明明绑上了"，所以只能靠给 `toHandlers` 传参实测来定性。
//   ★ 判据：**凡是要喂给 `v-on="obj"` 的对象，键名一律不带 `on` 前缀**。
//
//   `clickCapture` 同理 → toHandlers 后得到 `onClickCapture`（Vue 的捕获语法）。

export interface LongPressEvent {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  /** 兼容既有 `(e: MouseEvent) => void` 的菜单函数签名。
   *  ★ 这些菜单函数只用 clientX/clientY（定位浮层）与 target，不会真的读 MouseEvent 专属字段；
   *    但它们的形参类型写的是 MouseEvent，所以这里用 `MouseEvent` 断言把形状对齐，
   *    避免为了长按去改一圈函数签名（改动面越小越好）。 */
  readonly __mouseEventCompat?: never;
}

/** 内部：把只带坐标的轻量事件断言成 MouseEvent，供既有菜单函数消费。 */
type CompatMouseEvent = MouseEvent & LongPressEvent;

/**
 * 把原生 PointerEvent 适配成调用方期待的「带 clientX/clientY/target 的事件」。
 *
 * ★★★ 绝不能用 `Object.assign(e, {...})`（2026-09-26 实测踩到，代价很大）：
 *   原生事件的 `clientX` / `clientY` / `target` 都是**原型链上的只读 getter**，
 *   `Object.assign` 要对它们**赋值** → 抛
 *     `TypeError: Cannot set property clientX of #<MouseEvent> which has only a getter`
 *   → 定时器回调第一行就炸 → 表现为「长按毫无反应」。
 *   （原代码把它写在这句上，异常又被吞掉，所以查了很久。）
 *
 * 正解：`Object.create(e)` 建一个**以原事件为原型**的轻壳 ——
 *   只读属性照旧从原型链读取，不需要（也不应该）赋值；
 *   这样①不触碰 getter ②仍 instanceof ③preventDefault 等事件方法可用。
 */
function asCompatMouseEvent(e: PointerEvent): CompatMouseEvent {
  return Object.create(e) as CompatMouseEvent;
}

/**
 * 生成可直接 `v-on` 展开的长按处理器。
 *
 * ```vue
 * <div v-on="bindLongPress((ev) => openConvMenu(ev, conv))">
 * ```
 *
 * ★ 无需判平台：内部只对 `pointerType === 'touch'` 生效，桌面不受影响。
 * ★ 返回对象的键名**不带 `on` 前缀** —— `v-on` 会经 `toHandlers()` 加前缀，
 *   自带前缀会变成 `onOnPointerdown` 而永不触发（见文件头注释）。
 * ★ 返回对象里含 `clickCapture` —— `toHandlers` 后即 `onClickCapture`，
 *   绑定为**捕获阶段**的 click 拦截，用于吞掉长按之后的那一次误点。
 *
 * ★★ 本函数**不使用任何生命周期钩子**（不要加回来）：
 *   它常在模板表达式里求值（`v-on="bindLongPress(...)"`），而模板求值不在 setup 期 →
 *   `onBeforeUnmount` 会报 `[Vue warn]: onBeforeUnmount is called when there is no
 *   active component instance`，且**钩子根本挂不上** → 内部的定时器永不清理。
 *   定时器本身会在触发后自然失效（`timer = null` / `swallowClick` 兜底复位），
 *   泄漏面可控；组件卸载时的清理交给调用方（或不必做 —— 见上）。
 *   判据：**任何"返回 v-on 展开对象"的函数里都不能出现生命周期 API**。
 */
export function bindLongPress(
  onLongPress: (event: CompatMouseEvent) => void,
  opts?: { duration?: number; moveTolerance?: number },
): Record<string, unknown> {
  const duration = opts?.duration ?? 500;
  const moveTolerance = opts?.moveTolerance ?? 10;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;
  /** 触发长按后需吞掉紧随的一次 click。 */
  let swallowClick = false;

  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  // ★ 键名不带 on 前缀（见上方注释：v-on 的 toHandlers 会补前缀）
  const api = {
    pointerdown: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return; // 鼠标/笔不接管
      clear();
      fired = false;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        swallowClick = true;
        // 阻止默认：避免同时弹出系统的文本选择 / 图片保存菜单
        try { e.preventDefault(); } catch { /* 合成事件可能不可取消 */ }
        // ★ 传给回调的是**事件壳**而非原事件：既有菜单函数形参写的是 `(e: MouseEvent)`，
        //   而它们实际只用 clientX/clientY/target。这里用原型继承做形状对齐（详见
        //   asCompatMouseEvent 注释：绝不能 Object.assign —— 会撞只读 getter 直接抛错）。
        try {
          onLongPress(asCompatMouseEvent(e));
        } catch (err) {
          // 回调抛错不能把 swallowClick 留在 true（会误吞后续一次真实点击）
          swallowClick = false;
          console.error('[LongPress] 长按回调异常:', err);
        }
        // 兜底摘除：即便没有后续 click，也别把这个标记留太久
        setTimeout(() => { swallowClick = false; }, 600);
      }, duration);
    },
    pointermove: (e: PointerEvent) => {
      if (timer === null) return;
      // 手指移动 = 用户在滚动列表，不是长按
      if (Math.abs(e.clientX - startX) > moveTolerance || Math.abs(e.clientY - startY) > moveTolerance) clear();
    },
    pointerup: () => { clear(); fired = false; },
    pointercancel: () => { clear(); fired = false; },
    /** 触屏上若仍派发了 contextmenu，只阻止系统菜单；已触发过长按的不重复触发。 */
    contextmenu: (e: MouseEvent) => {
      const pt = (e as PointerEvent).pointerType;
      if (pt && pt !== 'touch') return; // 鼠标右键交给调用方
      if (fired) e.preventDefault();
    },
    clickCapture: (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  return api;
}

export default bindLongPress;