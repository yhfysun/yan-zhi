import { ref } from 'vue';

export const mobileNavDrawerOpen = ref(false);

export function openMobileNavDrawer(): void {
  mobileNavDrawerOpen.value = true;
}

export function closeMobileNavDrawer(): void {
  mobileNavDrawerOpen.value = false;
}
