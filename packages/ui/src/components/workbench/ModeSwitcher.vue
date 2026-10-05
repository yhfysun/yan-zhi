<!--
  ModeSwitcher.vue — 顶栏模式下拉（原「任务」导航项原位升级，决策 1）
  - 复用 .title-nav-item 样式（与 首页/浏览器/消息 完全一致），零新增顶栏控件
  - **无选中白底、无下拉箭头**（用户拍板 2026-09-16）：hover 即出下拉，点击模式项即选中
  - ★ 2026-09-17：浮层内容改用 **HoverMenu** 渲染（原来是自己那套 .mode-menu/.mode-item）。
    原因：两套菜单各自写样式 → 图标规范漂移（模式下拉是裸 15px 灰图标，
    「更多」是 28px 圆角色块 + 主色图标），用户一眼就看出「不是统一的」。
    现在「更多」与「模式」共用同一份 HoverMenu 结构与样式，只有数据不同。
  - 用 el-popover 而非 el-dropdown：dropdown 会把内容包进 el-scrollbar（overflow 裁剪）
  - 运维/安全依赖 ops-shell / sec-lab 插件且 desktopOnly → 未启用或移动端置灰（HoverMenu 的 disabled）
  - 浮层展开时通知 BrowserPanel 避让原生 BrowserView（复用 titleBarOverlayOpen）
-->
<template>
  <!-- 只有一个可见模式时不渲染下拉（阉割版仅办公：单选下拉无意义，且多一个无内容的浮层入口）。
       用 v-if 而非把内容置空 —— 后者会留下一个可点但空白的气泡。 -->
  <span v-if="hasChoice" class="mode-switcher-anchor">
    <el-popover
      v-model:visible="open"
      :disabled="suppressHover"
      :trigger="isTouchLike ? 'click' : 'hover'"
      :show-after="isTouchLike ? 0 : 120"
      :hide-after="isTouchLike ? 0 : 120"
      placement="bottom-start"
      :show-arrow="false"
      :width="'auto'"
      popper-class="yz-menu-popper mode-switcher-popper"
    >
      <template #reference>
        <button
          class="title-nav-item mode-switcher"
          :class="{ active: onModeRoute }"
          type="button"
          :title="triggerTitle"
          @click="onTriggerClick"
        >
          <el-icon :size="15"><component :is="currentIcon" /></el-icon>
          <span class="mode-label">{{ shortLabel(currentDef) }}</span>
        </button>
      </template>
      <HoverMenu :items="menuItems" :width="216" @select="onPick" />
    </el-popover>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Check, Lock, ChatDotRound, Monitor, Platform, Connection } from '@element-plus/icons-vue';
import {
  activeMode, MODE_DEFS, setMode, modeRoute, visibleModeDefs,
  type AppMode, type ModeDef,
} from '../../stores/mode';
import { usePluginStore } from '../../stores/plugin';
import { isCapacitor } from '../../api/client';
import { titleBarOverlayOpen } from '../../composables/useTitleBarOverlay';
import HoverMenu from '../HoverMenu.vue';
import type { HoverMenuItem } from '../HoverMenu.vue';

const route = useRoute();
const router = useRouter();
const pluginStore = usePluginStore();

const open = defineModel<boolean>({ default: false });

/**
 * 点选后短暂屏蔽 hover 触发。
 * 原因：trigger=hover 时，点了菜单项 → setMode + router.push → 组件重渲染，
 * 而鼠标此刻仍停在浮层区域 → el-popover 立刻判定「hover 中」把浮层又打开
 * （实测：点「开发」跳 /code 后浮层依旧可见）。屏蔽 300ms 让鼠标有时间移开。
 */
const suppressHover = ref(false);
let suppressTimer: ReturnType<typeof setTimeout> | null = null;
function suppress() {
  suppressHover.value = true;
  open.value = false;
  if (suppressTimer) clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => { suppressHover.value = false; suppressTimer = null; }, 300);
}

// 当前模式徽标：图标 + 名称（窄宽时 .mode-label 隐藏，仅图标）
// ★ 从「可见模式」里找而不是 MODE_DEFS 全量：低档码下当前模式若不在可见集合里
//   （理论上 store 已回落 office，这里再兜一层），也不会渲染出一个已失权的标签。
const currentDef = computed<ModeDef>(
  () => visibleModeDefs.value.find((d) => d.key === activeMode.value) || visibleModeDefs.value[0] || MODE_DEFS[0],
);
const currentIcon = computed(() => iconOf(currentDef.value.icon));

/** 可见模式多于一个才渲染下拉：阉割版仅办公时整条模式入口不该出现。 */
const hasChoice = computed(() => visibleModeDefs.value.length > 1);

/** 顶栏按钮选中态：当前路由就是该模式的路由（与「浏览器/消息」active 口径一致） */
const onModeRoute = computed(() => route.path === modeRoute(activeMode.value));

/** 按钮 title：未在当前模式页时提示「点击进入」 */
const triggerTitle = computed(() =>
  onModeRoute.value ? `${shortLabel(currentDef.value)}（当前模式）` : `点击进入${shortLabel(currentDef.value)}`,
);

/** 触屏判定（无 hover 能力）：与 WebTopBar 同一口径 —— 纯触屏菜单走 click/tap，桌面保留 hover。
 *  matchMedia('(hover: none)') 而非 'ontouchstart'：触屏笔记本不误判，桌面 hover 不退化。 */
const isTouchLike = (() => {
  try { return window.matchMedia('(hover: none)').matches; } catch { return false; }
})();

/**
 * 点击按钮：桌面 = 跳当前模式的页面（不管现在在哪个路由）。
 * ★ 触屏（Task 4.1）：tap 只开合菜单（开合交给 el-popover 的 click trigger，
 *   这里 return 避免双重处理），导航交给菜单项 onPick；否则 tap 会「既跳页又弹菜单」。
 */
function onTriggerClick() {
  if (isTouchLike) return;
  // 用户拍板 2026-09-16：在 /home（办公模式）点「办公」→ 跳 /chat；在 /code 点「开发」→ 已在则视为刷新定位。
  suppress();
  router.push(modeRoute(activeMode.value));
}

const ICONS: Record<string, unknown> = { ChatDotRound, Monitor, Platform, Lock, Connection };
function iconOf(name: string) {
  return ICONS[name] || ChatDotRound;
}

/** 导航按钮与菜单项都不带「模式」两字（用户拍板 2026-09-16）：办公 / 开发 / 运维 / 安全 */
function shortLabel(def: ModeDef): string {
  return def.label.replace(/模式$/, '');
}

/** 菜单条目：结构交给 HoverMenu 渲染（check = 当前模式，disabled = 插件未启用/仅桌面端）
 *
 *  ★ 只遍历 visibleModeDefs：未授权的模式**完全隐藏**（用户拍板）——
 *    不出现置灰项、不带「需升级」提示文字。授权是硬边界，不是可选项。
 */
const menuItems = computed<HoverMenuItem[]>(() =>
  visibleModeDefs.value.map((def) => {
    const base = {
      key: def.key,
      label: shortLabel(def),
      icon: iconOf(def.icon) as HoverMenuItem['icon'],
      desc: def.desc,
    };
    const on = route.path === modeRoute(def.key);
    if (!def.pluginId) return { ...base, check: on };
    if (def.desktopOnly && isCapacitor) {
      return { ...base, desc: undefined, disabled: true, disabledReason: '仅桌面端可用' };
    }
    const enabled = pluginStore.plugins.some(
      (p) => p.manifest.id === def.pluginId && p.state === 'enabled',
    );
    return enabled
      ? { ...base, check: on }
      : { ...base, desc: undefined, disabled: true, disabledReason: '对应插件未启用' };
  }),
);

function onPick(item: HoverMenuItem) {
  const key = item.key as AppMode;
  // 不可用项：HoverMenu 已置灰且不派发 select，此处仅防御
  const def = MODE_DEFS.find((d) => d.key === key);
  if (def?.pluginId && (item.disabled || !isModeAvailable(key))) {
    // 插件未启用：引导去插件管理页自行决定（决策 15：不自动启用高危插件）
    suppress();
    router.push('/plugins');
    return;
  }
  suppress(); // 先收起并屏蔽 hover，再跳（否则重渲染后鼠标仍在浮层上会立刻重开）
  // 已在该模式页 → 不做任何事（下拉只负责「切到别的模式」）
  if (route.path === modeRoute(key)) return;
  // ★ 契约（决策 10）：只做「记模式 + 跳路由」——不新建会话、不清消息、不换 spaceId
  setMode(key);
  router.push(modeRoute(key));
}

function isModeAvailable(key: AppMode): boolean {
  const def = MODE_DEFS.find((d) => d.key === key);
  if (!def?.pluginId) return true;
  if (def.desktopOnly && isCapacitor) return false;
  return pluginStore.plugins.some((p) => p.manifest.id === def.pluginId && p.state === 'enabled');
}

// 浮层展开 → 避让 BrowserView（与「更多」菜单同一机制）
watch(open, (v) => {
  if (v) titleBarOverlayOpen.value = true;
});

onMounted(() => {
  if (!pluginStore.loaded) void pluginStore.refresh().catch(() => {});
});

onBeforeUnmount(() => {
  if (suppressTimer) { clearTimeout(suppressTimer); suppressTimer = null; }
});
</script>

<script lang="ts">
export default { name: 'ModeSwitcher' };
</script>

<style scoped>
/* 自带完整的导航项样式 —— 不依赖父组件 scoped 样式。
   （历史坑：子组件根元素带自己的 scope id，父组件 `.title-nav-item[data-v-x]` 命中不到，
   会退化成浏览器默认按钮：白底黑字 + 丢失 -webkit-app-region:no-drag → 点击/hover
   被窗口拖拽吞掉。故此处完整声明。） */
.mode-switcher {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary, #b0b8bc);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  /* 关键：标题栏内必须显式声明不可拖拽，否则点击/hover 全被窗口拖拽吞掉 */
  -webkit-app-region: no-drag;
  /* 关键 2：父层 .title-content 是 pointer-events:none（透传给拖拽层），
     本按钮在 el-popover 的 slot 里、拿不到父组件 scoped 的 pointer-events:auto，
     必须自带，否则真实 hover/click 全部失效（合成事件测不出来，只能真鼠标验证） */
  pointer-events: auto;
  transition: background 0.15s ease, color 0.15s ease;
}

/* 外层定位锚点：只做包裹，不参与布局（避免多包一层 span 后与相邻导航项的间距变化） */
.mode-switcher-anchor {
  display: inline-flex;
  -webkit-app-region: no-drag;
}

.mode-switcher:hover {
  background: var(--glass-bg-hover, #173848);
  color: var(--color-text, #effafe);
}

.mode-switcher.active {
  background: color-mix(in srgb, var(--color-primary, #38bdf8) 12%, transparent);
  color: var(--color-primary, #38bdf8);
}

/* 窄宽（<1100px）：只留图标 + 箭头（决策 11 / 任务 5c.2） */
@media (max-width: 1100px) {
  .mode-label {
    display: none;
  }
}
</style>