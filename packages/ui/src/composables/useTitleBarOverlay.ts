import { ref } from 'vue';

/**
 * 桌面端标题栏浮层（"更多"导航弹层 / 用户头像下拉）展开状态 —— 全局单例。
 *
 * 这些浮层 teleport 到 body，展开时正好落在内容区上方；当内容区被原生
 * BrowserView 覆盖时（/browser 页或任务预览面板打开了网页），浮层会被
 * 原生图层挡住。BrowserPanel 的可见性闸门（shouldBeVisible）读取此状态：
 * 浮层打开期间临时隐藏 BrowserView，关闭后由既有 watch 自动恢复。
 */
export const titleBarOverlayOpen = ref(false);
