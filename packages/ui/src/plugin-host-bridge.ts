/**
 * 插件宿主桥（前端）—— 插件前端 bundle 取用宿主共享依赖与受控 API 的唯一入口。
 *
 * 原理：宿主在应用启动早期挂 `window.__YZ_HOST__`；插件前端 bundle 构建时（build-plugins.mjs）
 * 把 vue / vue-router / pinia / element-plus / icons 的 import 改写到 yz://shared/*.mjs 静态 shim，
 * shim 再委托回这里的命名空间 —— 共享依赖全程单实例，插件包零复制。
 *
 * ★ 白名单纪律：api 面即插件的渲染层权限面。新增导出必须同步：
 *   1) openspec/changes/mode-pluginization/design.md §6
 *   2) apps/desktop/test/host-shims.test.cjs（shim 完备性）
 *   P0 初版从简（store 走异步工厂，避免把懒加载 chunk 拉进主包）；P1 试点按真实需要扩。
 */
import * as vue from 'vue';
import * as vueRouter from 'vue-router';
import * as pinia from 'pinia';
import * as elementPlus from 'element-plus';
import * as elementPlusIcons from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { API_BASE } from './api/client';
import { HOST_MODULES } from './host-modules';

export const HOST_API_VERSION = 1;

/** 插件包内资源 → /api/plugin-assets/:pluginId/<path>（web 端装载回退用；与 settings.ts 同口径） */
export function pluginAssetUrl(pluginId: string, rel: string): string {
  const clean = rel.replace(/^\.?\//, '');
  return `${API_BASE}/plugin-assets/${pluginId}/${clean}`;
}

export interface YzHostBridge {
  apiVersion: number;
  /** 共享依赖命名空间（shim 委托目标；key 见 SHARED_KEYS） */
  m: {
    vue: typeof vue;
    vueRouter: typeof vueRouter;
    pinia: typeof pinia;
    elementPlus: typeof elementPlus;
    elementPlusIcons: typeof elementPlusIcons;
  };
  /** 宿主内部模块登记表（P4）：key = 'stores/mode' 等；插件 shim 从这里取**同一份实例** */
  mods: Record<string, unknown>;
  api: Record<string, unknown>;
}

/** 共享依赖键清单（generate-host-shims.mjs 生成同名 shim，两边必须一致） */
export const SHARED_KEYS = ['vue', 'vueRouter', 'pinia', 'elementPlus', 'elementPlusIcons'] as const;

declare global {
  interface Window {
    __YZ_HOST__?: YzHostBridge;
  }
}

let installed = false;

/** 挂载宿主桥（幂等）。必须在任何插件前端装载之前调用（desktop/web 入口最早处）。 */
export function initPluginHostBridge(): void {
  if (installed) return;
  installed = true;
  const bridge: YzHostBridge = {
    apiVersion: HOST_API_VERSION,
    m: { vue, vueRouter, pinia, elementPlus, elementPlusIcons },
    mods: HOST_MODULES,
    api: {
      // Element Plus 反馈组件（插件 UI 与宿主同一套弹层风格）
      ElMessage,
      ElNotification,
      ElMessageBox,
      API_BASE,
      pluginAssetUrl,
      // Electron 主进程能力整体透传（含 remote-control 的 rc:* 专用通道；web 端为 undefined）
      get electronAPI() {
        return (window as { electronAPI?: unknown }).electronAPI;
      },
      // store 异步工厂：按需取，避免把懒加载 chunk 拉进主包。pinia 在应用挂载后已 active。
      // ★ 例外：useModeStore 是 defineModeStore() 预建的 store 对象（非工厂函数），直接返回不调用。
      stores: {
        chat: () => import('./stores/chat').then((m) => m.useChatStore()),
        plugin: () => import('./stores/plugin').then((m) => m.usePluginStore()),
        mode: () => import('./stores/mode').then((m) => m.useModeStore),
        settings: () => import('./stores/settings').then((m) => m.useSettingsStore()),
        sceneConfig: () => import('./stores/sceneConfig').then((m) => m.useSceneConfigStore()),
        license: () => import('./stores/license').then((m) => m.useLicenseStore()),
      } as Record<string, () => Promise<unknown>>,
    },
  };
  window.__YZ_HOST__ = bridge;
}
