// 设置 store（持久化到 keyring 的特殊命名空间）
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';

export type ThemeName = 'ocean' | 'forest' | 'sunset' | 'aurora' | 'rose';

export interface AppSettings {
  theme: ThemeName;
  darkMode: boolean;
  defaultPlatformId: string;
  defaultModelId: string;
  keepRecent: number;
  maxContextTokens: number;
  enableCompression: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'aurora',
  darkMode: false,
  defaultPlatformId: '',
  defaultModelId: '',
  keepRecent: 6,
  maxContextTokens: 8000,
  enableCompression: true,
};

interface ThemePalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  gradient: string;
  orb1: string;
  orb2: string;
  orb3: string;
}

const THEMES: Record<ThemeName, ThemePalette> = {
  ocean: {
    primary: '#3B82F6',
    primaryLight: '#DBEAFE',
    primaryDark: '#1D4ED8',
    accent: '#6366F1',
    gradient: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    orb1: '#3B82F6',
    orb2: '#60A5FA',
    orb3: '#93C5FD',
  },
  forest: {
    primary: '#10B981',
    primaryLight: '#D1FAE5',
    primaryDark: '#047857',
    accent: '#34D399',
    gradient: 'linear-gradient(135deg, #10B981, #34D399)',
    orb1: '#10B981',
    orb2: '#34D399',
    orb3: '#6EE7B7',
  },
  sunset: {
    primary: '#F59E0B',
    primaryLight: '#FEF3C7',
    primaryDark: '#B45309',
    accent: '#F97316',
    gradient: 'linear-gradient(135deg, #F59E0B, #F97316)',
    orb1: '#F59E0B',
    orb2: '#FBBF24',
    orb3: '#FDE68A',
  },
  aurora: {
    primary: '#7C3AED',
    primaryLight: '#EDE9FE',
    primaryDark: '#5B21B6',
    accent: '#EC4899',
    gradient: 'linear-gradient(135deg, #7C3AED, #EC4899)',
    orb1: '#7C3AED',
    orb2: '#A78BFA',
    orb3: '#EC4899',
  },
  rose: {
    primary: '#EC4899',
    primaryLight: '#FCE7F3',
    primaryDark: '#BE185D',
    accent: '#F472B6',
    gradient: 'linear-gradient(135deg, #EC4899, #F472B6)',
    orb1: '#EC4899',
    orb2: '#F472B6',
    orb3: '#FBCFE8',
  },
};

const STORAGE_KEY = 'settings:app';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  async function load() {
    const adapter = getPlatformAdapter();
    const raw = await adapter.keyring.get(STORAGE_KEY);
    if (raw) {
      try {
        settings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {}
    }
    loaded.value = true;
    applyTheme(settings.value.theme);
    applyDarkMode(settings.value.darkMode);
  }

  async function save() {
    const adapter = getPlatformAdapter();
    await adapter.keyring.set(STORAGE_KEY, JSON.stringify(settings.value));
  }

  async function update(patch: Partial<AppSettings>) {
    settings.value = { ...settings.value, ...patch };
    if (patch.theme !== undefined) applyTheme(patch.theme);
    if (patch.darkMode !== undefined) applyDarkMode(patch.darkMode);
    await save();
  }

  function applyTheme(theme: ThemeName) {
    const p = THEMES[theme];
    const root = document.documentElement.style;
    root.setProperty('--color-primary', p.primary);
    root.setProperty('--color-primary-light', p.primaryLight);
    root.setProperty('--color-primary-dark', p.primaryDark);
    root.setProperty('--color-accent', p.accent);
    root.setProperty('--gradient-primary', p.gradient);
    root.setProperty('--orb-1-color', p.orb1);
    root.setProperty('--orb-2-color', p.orb2);
    root.setProperty('--orb-3-color', p.orb3);
  }

  function applyDarkMode(dark: boolean) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return { settings, loaded, load, save, update, THEMES };
});
