import { ref } from 'vue';

export type SettingsDrawerSection = string;

export const settingsDrawerOpen = ref(false);
export const settingsDrawerSection = ref<SettingsDrawerSection>('general');

export function openSettingsDrawer(section: SettingsDrawerSection = 'general') {
  settingsDrawerSection.value = section;
  settingsDrawerOpen.value = true;
}

export function closeSettingsDrawer() {
  settingsDrawerOpen.value = false;
}
