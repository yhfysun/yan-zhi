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

import { onBeforeUnmount } from 'vue';

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
 * 生成可直接 `v-on` 展开的长按处理器。
 *
 * ```vue
 * <div v-on="bindLongPress((ev) => openConvMenu(ev, conv))">
 * ```
 *
 * ★ 无需判平台：内部只对 `pointerType === 'touch'` 生效，桌面不受影响。
 * ★ 返回对象里含 `onClickCapture` —— `v-on` 会把它绑成捕获阶段的 click 拦截，
 *   用于吞掉长按之后的那一次误点。
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

  const api = {
    onPointerdown: (e: PointerEvent) => {
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
        // ★ 断言成 MouseEvent 形状：既有菜单函数形参是 `(e: MouseEvent)`，
        //   而它们实际只用 clientX/clientY/target。与其为一处长按去改一圈签名，
        //   不如在这里对齐形状（构造出的轻量 event 恰好覆盖这三个字段）。
        onLongPress(Object.assign(e, { clientX: e.clientX, clientY: e.clientY, target: e.target }) as CompatMouseEvent);
        // 兜底摘除：即便没有后续 click，也别把这个标记留太久
        setTimeout(() => { swallowClick = false; }, 600);
      }, duration);
    },
    onPointermove: (e: PointerEvent) => {
      if (timer === null) return;
      // 手指移动 = 用户在滚动列表，不是长按
      if (Math.abs(e.clientX - startX) > moveTolerance || Math.abs(e.clientY - startY) > moveTolerance) clear();
    },
    onPointerup: () => { clear(); fired = false; },
    onPointercancel: () => { clear(); fired = false; },
    /** 触屏上若仍派发了 contextmenu，只阻止系统菜单；已触发过长按的不重复触发。 */
    onContextmenu: (e: MouseEvent) => {
      const pt = (e as PointerEvent).pointerType;
      if (pt && pt !== 'touch') return; // 鼠标右键交给调用方
      if (fired) e.preventDefault();
    },
    onClickCapture: (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  onBeforeUnmount(() => { clear(); swallowClick = false; });
  return api;
}

export default bindLongPress;