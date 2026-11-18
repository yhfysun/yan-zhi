// 办公工作台状态（2026-11-02，P2）
//
// 工作台是办公室模式的「文件视图」入口：默认聊天页不变，点顶栏「工作台」进入。
// 这里只存两份 UI 状态：右栏 AI/人工、上次打开的文件（回到工作台继续看同一份）。
import { ref, watch } from 'vue';

export type OfficePanel = 'ai' | 'manual';

const PANEL_KEY = 'yz:office:panel';
const FILE_KEY = 'yz:office:file';
const AI_SIDEBAR_COLLAPSED_KEY = 'yz:office:ai-sidebar-collapsed';

function readPanel(): OfficePanel {
  try {
    return localStorage.getItem(PANEL_KEY) === 'manual' ? 'manual' : 'ai';
  } catch {
    return 'ai';
  }
}

function readFile(): string {
  try {
    return localStorage.getItem(FILE_KEY) || '';
  } catch {
    return '';
  }
}

export const officePanel = ref<OfficePanel>(readPanel());
export const officeSelectedFile = ref<string>(readFile());
export const officeAiSidebarCollapsed = ref(readAiSidebarCollapsed());

watch(officePanel, (v) => {
  try { localStorage.setItem(PANEL_KEY, v); } catch { /* 隐私模式忽略 */ }
});
watch(officeSelectedFile, (v) => {
  try {
    if (v) localStorage.setItem(FILE_KEY, v);
    else localStorage.removeItem(FILE_KEY);
  } catch { /* 隐私模式忽略 */ }
});
watch(officeAiSidebarCollapsed, (v) => {
  try { localStorage.setItem(AI_SIDEBAR_COLLAPSED_KEY, v ? '1' : '0'); } catch { /* 隐私模式忽略 */ }
});

export function setOfficePanel(p: OfficePanel): void {
  officePanel.value = p;
}

export function toggleOfficePanel(): void {
  officePanel.value = officePanel.value === 'ai' ? 'manual' : 'ai';
}

function readAiSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(AI_SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function toggleOfficeAiSidebar(): void {
  officeAiSidebarCollapsed.value = !officeAiSidebarCollapsed.value;
}

/** 人工模式 = 不调用任何模型（发送入口在 UI 上消失） */
export function isManualPanel(): boolean {
  return officePanel.value === 'manual';
}

export function useOfficeWorkbench() {
  return {
    officePanel,
    officeSelectedFile,
    officeAiSidebarCollapsed,
    setOfficePanel,
    toggleOfficePanel,
    toggleOfficeAiSidebar,
  };
}
