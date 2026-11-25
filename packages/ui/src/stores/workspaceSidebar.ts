import { ref } from 'vue';

type WorkspaceSidebarRegistration = {
  key: string;
  label: string;
  getCollapsed: () => boolean;
  toggle: () => void;
};

const registration = ref<WorkspaceSidebarRegistration | null>(null);

export const workspaceSidebarAvailable = ref(false);
export const workspaceSidebarCollapsed = ref(false);
export const workspaceSidebarLabel = ref('侧栏');

function syncWorkspaceSidebarState(): void {
  const current = registration.value;
  workspaceSidebarAvailable.value = !!current;
  workspaceSidebarCollapsed.value = current?.getCollapsed() ?? false;
  workspaceSidebarLabel.value = current?.label || '侧栏';
}

export function registerWorkspaceSidebar(next: WorkspaceSidebarRegistration): void {
  registration.value = next;
  syncWorkspaceSidebarState();
}

export function updateWorkspaceSidebar(key: string): void {
  if (registration.value?.key !== key) return;
  syncWorkspaceSidebarState();
}

export function unregisterWorkspaceSidebar(key: string): void {
  if (registration.value?.key !== key) return;
  registration.value = null;
  syncWorkspaceSidebarState();
}

export function toggleRegisteredWorkspaceSidebar(): void {
  registration.value?.toggle();
  syncWorkspaceSidebarState();
}
