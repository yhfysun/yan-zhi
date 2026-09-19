// 移动端外壳判定 —— 「是否应当使用移动布局」的唯一条件。
//
// 背景：useIsMobile() 是纯视口宽度断点（<768px）。Capacitor 端**横屏**时 CSS 视口宽度
// 常达 800+px（如 2400x1080 @3x = 800px 宽），此时只按宽度判断就会退回 Web 的 52px dock：
// 底部 TabBar 消失、自绘顶栏消失、内容留白按桌面算。触屏上丢掉底部导航很难用，
// 且 dock 里还留着移动端根本不可用的入口（代码/浏览器）。
//
// 三个判定的分工（勿合并，语义不同）：
//   · useIsMobile()            —— 视口宽度 < 768px。桌面端窄窗口也成立，那是刻意的窄窗降级。
//   · usePlatform().isMobile   —— 运行在 Capacitor 容器内，与屏幕尺寸无关。
//   · useMobileShell()         —— 两者取**并集**：视口窄 或 跑在移动端平台。
//
// ★ 为什么这样改不影响桌面端/Web 端：这两端都进不了 Capacitor，platform 恒非 mobile，
//   于是本判定退化成原宽度断点，行为与改动前逐字一致。这是本次改动的安全边界。
import { ref, computed, type ComputedRef } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { useIsMobile } from './useIsMobile';

/**
 * 平台是否为 mobile。三态：null = 尚未解析。
 *
 * 为什么用 ref 缓存而不是每次读适配器：读适配器要 try/catch（未初始化时抛错），
 * 放在 computed 里会导致「首次求值恰好在适配器就绪前」时把 false 永久缓存下来。
 * 改为在 useMobileShell() 被调用时（必然在组件 setup 内，晚于入口的 setPlatformAdapter）
 * 一次性解析并冻结，结果确定。
 */
const platformIsMobile = ref<boolean | null>(null);

function ensurePlatformResolved(): void {
  if (platformIsMobile.value !== null) return;
  try {
    platformIsMobile.value = getPlatformAdapter().platform === 'mobile';
  } catch {
    // 适配器未就绪：按非移动端处理，退化为纯宽度判定（不阻塞渲染）
    platformIsMobile.value = false;
  }
}

/** 视口窄 或 移动端平台 —— 即「应使用移动外壳」。 */
const isMobileShell: ComputedRef<boolean> = computed(
  () => useIsMobile().value || platformIsMobile.value === true,
);

/** 在组件 setup 中调用（内部会同步解析平台，避免首次求值过早）。 */
export function useMobileShell(): ComputedRef<boolean> {
  ensurePlatformResolved();
  return isMobileShell;
}