// 共享 UI 包入口 - 三端共用的 Vue 组件、路由、视图
export { default as App } from './App.vue';
export { default as router } from './router';
export * from './stores';
export { openSettingsDrawer, closeSettingsDrawer, settingsDrawerOpen, settingsDrawerSection } from './composables/useSettingsDrawer';
export type { SettingsDrawerSection } from './composables/useSettingsDrawer';
export { openSettingsDialog, closeSettingsDialog, settingsDialogOpen, settingsDialogCategory } from './composables/useSettingsDialog';
export type { SettingsDialogCategory } from './composables/useSettingsDialog';
// 插件宿主桥与运行时装载器（mode-pluginization）：入口文件须尽早调 initPluginHostBridge()
export { initPluginHostBridge, pluginAssetUrl as hostPluginAssetUrl, HOST_API_VERSION, SHARED_KEYS } from './plugin-host-bridge';
export type { YzHostBridge } from './plugin-host-bridge';
export { isElectronHost, pluginFrontendUrl, resolvePluginFrontendEntry, loadPluginFrontend, invalidatePluginFrontendCache } from './plugin-runtime';
