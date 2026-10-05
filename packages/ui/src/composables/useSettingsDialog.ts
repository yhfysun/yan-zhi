// 设置弹窗（桌面端）全局状态 —— 与 useSettingsDrawer（移动端/侧栏抽屉）并存的另一形态。
// 背景（Task 10.3）：桌面端设置统一为「侧导航居中大弹窗」，入口在 WebTopBar 头像菜单 /
// 「更多」菜单；移动端继续走 SettingsDrawer，/settings 路由页保留给 Web 端页内形式。
import { ref } from 'vue';
import { closeSettingsDrawer } from './useSettingsDrawer';

export type SettingsDialogCategory = string;

export const settingsDialogOpen = ref(false);
export const settingsDialogCategory = ref<SettingsDialogCategory>('general');

export function openSettingsDialog(category: SettingsDialogCategory = 'general') {
  settingsDialogCategory.value = category;
  // 与设置抽屉互斥（两者都监听 ESC，同开会双关闭）
  closeSettingsDrawer();
  settingsDialogOpen.value = true;
}

export function closeSettingsDialog() {
  settingsDialogOpen.value = false;
}
