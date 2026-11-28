import { registerPlugin } from '@capacitor/core';

interface YzStoragePlugin {
  status(): Promise<{ granted: boolean; root: string; api: number }>;
  requestAccess(): Promise<{ granted: boolean; root: string; api: number }>;
}

const YzStorage = registerPlugin<YzStoragePlugin>('YzStorage');

export async function getStorageAccessStatus(): Promise<{ granted: boolean; root: string }> {
  const r = await YzStorage.status();
  return { granted: !!r.granted, root: String(r.root || '') };
}

export async function requestStorageAccess(): Promise<{ granted: boolean; root: string }> {
  const r = await YzStorage.requestAccess();
  return { granted: !!r.granted, root: String(r.root || '') };
}
