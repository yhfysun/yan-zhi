<template>
  <Teleport to="body">
    <Transition name="settings-drawer">
      <div v-if="settingsDrawerOpen" class="settings-drawer-mask" @click.self="closeSettingsDrawer">
        <aside class="settings-drawer" role="dialog" aria-modal="true" aria-label="设置抽屉">
          <header class="settings-drawer-header">
            <div>
              <div class="settings-drawer-kicker">设置</div>
              <div class="settings-drawer-title">{{ activeItem?.label || '设置' }}</div>
            </div>
            <button type="button" class="settings-drawer-close" aria-label="关闭设置" @click="closeSettingsDrawer">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="settings-drawer-body">
            <nav class="settings-drawer-nav" aria-label="设置分区">
              <button
                v-for="item in sections"
                :key="item.section"
                type="button"
                class="settings-drawer-nav-item"
                :class="{ active: activeSection === item.section }"
                @click="selectSection(item.section)"
              >
                <el-icon :size="17"><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </nav>

            <div class="settings-drawer-content">
              <component
                :is="resolveComponent(activeSection)"
                :key="activeSection"
              />
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue';

import {
  Setting,
  Cpu,
  Suitcase,
  Files,
  Box,
  Promotion,
  Collection,
  Memo,
  MagicStick,
  Monitor,
  Close,
} from '@element-plus/icons-vue';
import {
  settingsDrawerOpen,
  settingsDrawerSection,
  closeSettingsDrawer,
  type SettingsDrawerSection,
} from '../composables/useSettingsDrawer';
import { usePluginStore } from '../stores/plugin';
import { resolvePluginComponent } from '../plugin-component-registry';
import { resolvePluginIcon } from '../plugin-icons';

interface SettingsSection {
  section: SettingsDrawerSection;
  label: string;
  icon: any;
}

const pluginStore = usePluginStore();

const builtinSections: SettingsSection[] = [
  { section: 'general', label: '通用与数据', icon: Setting },

  { section: 'models', label: '模型平台', icon: Cpu },
  { section: 'tools', label: '工具与连接', icon: Suitcase },
  { section: 'skills', label: 'Skill 商店', icon: Files },
  { section: 'distill', label: 'Skill 蒸馏', icon: MagicStick },
  { section: 'agents', label: '智能体', icon: Box },
  { section: 'knowledge', label: '知识库', icon: Collection },
  { section: 'memory', label: '记忆管理', icon: Memo },

  { section: 'connections', label: 'IM 连接', icon: Promotion },
  { section: 'env', label: '开发环境', icon: Monitor },
  { section: 'plugins', label: '插件管理', icon: Box },
];

const sections = computed<SettingsSection[]>(() => {
  const pluginTabs: SettingsSection[] = pluginStore.settingsTabs.map((t) => ({
    section: `plugin:${t.id}` as SettingsDrawerSection,
    label: t.label,
    icon: resolvePluginIcon(t.icon || ''),
  }));
  return [...builtinSections, ...pluginTabs];
});

const builtinComponents: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  general: defineAsyncComponent(() => import('../views/Settings.vue')),

  models: defineAsyncComponent(() => import('../views/Models.vue')),
  tools: defineAsyncComponent(() => import('../views/ToolMarket.vue')),
  skills: defineAsyncComponent(() => import('../views/skill-market/LocalSkillMarket.vue')),
  distill: defineAsyncComponent(() => import('../views/SkillDistill.vue')),
  agents: defineAsyncComponent(() => import('../views/Agents.vue')),
  knowledge: defineAsyncComponent(() => import('../views/Knowledge.vue')),
  memory: defineAsyncComponent(() => import('../components/memory/MemoryManage.vue')),

  connections: defineAsyncComponent(() => import('../views/Connections.vue')),
  env: defineAsyncComponent(() => import('../views/EnvConfig.vue')),
  plugins: defineAsyncComponent(() => import('./plugin/PluginManager.vue')),
};

function resolveComponent(section: string): ReturnType<typeof defineAsyncComponent> | undefined {
  if (builtinComponents[section]) return builtinComponents[section];
  if (section.startsWith('plugin:')) {
    const id = section.slice(7);
    const tab = pluginStore.settingsTabs.find((t) => t.id === id);
    if (tab) {
      const comp = resolvePluginComponent(tab.component);
      if (comp) return defineAsyncComponent(comp as () => Promise<{ default: unknown }>);
    }
  }
  return undefined;
}


const activeSection = computed(() => settingsDrawerSection.value);
const activeItem = computed(() => sections.value.find((item) => item.section === activeSection.value));

function selectSection(section: SettingsDrawerSection) {

  settingsDrawerSection.value = section;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeSettingsDrawer();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.settings-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 1999;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.settings-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(920px, 100vw);
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color, #fff);
  border-left: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  box-shadow: -18px 0 48px rgba(15, 23, 42, 0.22);
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.settings-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  flex-shrink: 0;
}

.settings-drawer-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary, #64748b);
}

.settings-drawer-title {
  margin-top: 2px;
  font-size: 17px;
  font-weight: 700;
}

.settings-drawer-close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--el-text-color-secondary, #64748b);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.settings-drawer-close:hover {
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.06));
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.settings-drawer-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.settings-drawer-nav {
  width: 188px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 12px 8px;
  border-right: 1px solid var(--el-border-color-lighter, rgba(15, 23, 42, 0.1));
  background: var(--el-fill-color-blank, #fff);
}

.settings-drawer-nav-item {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-regular, #475569);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.settings-drawer-nav-item:hover {
  background: var(--el-fill-color-light, rgba(15, 23, 42, 0.05));
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}

.settings-drawer-nav-item.active {
  background: var(--el-color-primary-light-9, #f5f3ff);
  color: var(--el-color-primary, #7c3aed);
  font-weight: 650;
}

.settings-drawer-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.settings-drawer-content :deep(.page) {
  padding: 0 !important;
  min-height: 0;
  overflow: visible;
}

.settings-drawer-content :deep(.page-title),
.settings-drawer-content :deep(.page-sub) {
  display: none;
}

.settings-drawer-content :deep(.page-header) {
  margin-bottom: 14px;
  justify-content: flex-end;
  gap: 8px;
}

.settings-drawer-content :deep(.page-top) {
  margin-bottom: 14px;
}

.settings-drawer-content :deep(.page-top .page-info) {
  display: none;
}

.settings-drawer-content :deep(.glass-tabs) {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: none;
  padding: 0;
}

.settings-drawer-content :deep(.page .el-tabs__header) {
  margin-bottom: 14px;
}

@media (max-width: 767px) {
  .settings-drawer {
    width: 100vw;
    border-left: none;
  }

  .settings-drawer-header {
    padding: 13px 16px;
  }

  .settings-drawer-nav {
    width: 150px;
    padding: 10px 6px;
  }

  .settings-drawer-nav-item {
    height: 38px;
    padding: 0 10px;
    gap: 8px;
    font-size: 12px;
  }

  .settings-drawer-content {
    padding: 14px 12px 20px;
  }
}
</style>

<style>
.settings-drawer-enter-active,
.settings-drawer-leave-active {
  transition: opacity 0.22s ease;
}

.settings-drawer-enter-active .settings-drawer,
.settings-drawer-leave-active .settings-drawer {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-drawer-enter-from,
.settings-drawer-leave-to {
  opacity: 0;
}

.settings-drawer-enter-from .settings-drawer,
.settings-drawer-leave-to .settings-drawer {
  transform: translateX(100%);
}
</style>
