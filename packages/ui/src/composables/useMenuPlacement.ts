import { nextTick, type Ref } from 'vue';
import { placeMenuNear } from '../utils/menuPosition';

/**
 * 右键菜单定位：先按光标落位，**渲染完成后**再按真实尺寸校正（贴光标 + 不越出可视区）。
 *
 * ★ 为什么必须有"渲染后校正"这一步（用户实报 2026-10-16「右击弹窗…也不用隔这么远啊，
 *   不能自己动态计算位置？」）：菜单尺寸只有渲染后才知道（行数随数据变、字号随主题变）。
 *   任何"猜高度"的夹取（旧 `clampMenuPos` 默认按 320px 夹）在靠近窗口底部右击时，
 *   会把真高三行的菜单推到光标上方两百多像素 —— 表现就是"菜单离鼠标老远"。
 *   校正发生在 `nextTick` 里：同一次渲染帧内、**绘制之前**，肉眼看不到跳位。
 *
 * 用法：
 * ```ts
 * const menuEl = ref<HTMLElement | null>(null);      // 模板里 ref="menuEl"
 * function openMenu(ev: MouseEvent) {
 *   state.value = { visible: true, x: ev.clientX, y: ev.clientY };
 *   placeMenuAfterRender(menuEl, state.value, (p) => { state.value = { ...state.value, ...p }; });
 * }
 * ```
 * ⚠️ 传 **ref 本身**而不是 `ref.value`：v-if 刚变 true 时元素还没创建（此刻 .value 是 null），
 *    校正必须放到 nextTick 之后再取一次。
 */
export function placeMenuAfterRender<T extends { x: number; y: number }>(
  elRef: Ref<HTMLElement | null>,
  pos: T,
  apply: (p: { x: number; y: number }) => void,
): void {
  void nextTick(() => {
    const el = elRef.value;                 // ★ nextTick 之后再取：v-if 的元素此刻才存在
    if (!el) return;
    const p = placeMenuNear(pos.x, pos.y, el.offsetWidth, el.offsetHeight);
    if (p.x !== pos.x || p.y !== pos.y) apply(p);
  });
}
