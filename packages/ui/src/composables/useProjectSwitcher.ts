// 代码模式「项目目录」下拉切换的共享开关状态。
// 顶栏按钮与资源管理器根目录行都调用 openProjectSwitcher() 打开同一个下拉。
import { ref } from 'vue';

export const projectSwitcherOpen = ref(false);

export function openProjectSwitcher() {
  projectSwitcherOpen.value = true;
}

export function closeProjectSwitcher() {
  projectSwitcherOpen.value = false;
}

export function toggleProjectSwitcher() {
  projectSwitcherOpen.value = !projectSwitcherOpen.value;
}
