import { ref } from 'vue';

export type SettingsDrawerSection =
  | 'general'
  | 'chat'
  | 'models'
  | 'mcp'
  | 'tools'
  | 'skills'
  | 'distill'
  | 'agents'
  | 'peers'
  | 'connections';

export const settingsDrawerOpen = ref(false);
export const settingsDrawerSection = ref<SettingsDrawerSection>('general');

export function openSettingsDrawer(section: SettingsDrawerSection = 'general') {
  settingsDrawerSection.value = section;
  settingsDrawerOpen.value = true;
}

export function closeSettingsDrawer() {
  settingsDrawerOpen.value = false;
}
