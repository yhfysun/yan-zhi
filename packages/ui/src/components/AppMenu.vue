<template>
  <span
    ref="anchorRef"
    class="app-menu-anchor"
    :class="{ 'is-open': open }"
    @click="onClickTrigger"
    @mouseenter="onEnterTrigger"
    @mouseleave="onLeaveTrigger"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="app-menu-fade">
      <div
        v-if="open"
        ref="panelRef"
        class="app-menu-panel"
        :style="panelStyle"
        role="menu"
        tabindex="-1"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
        @keydown="onPanelKeydown"
      >
        <AppMenuPanel :items="items" :level="1" @select="onSelect" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppMenuPanel from './AppMenuPanel.vue';
import type { MenuNode } from './AppMenuPanel.vue';

const props = withDefaults(
  defineProps<{
    items: MenuNode[];
    /** 触发方式：click（默认）或 hover */
    trigger?: 'click' | 'hover';
    placement?: 'bottom-start' | 'bottom-end';
    /** 面板宽度（px） */
    width?: number;
  }>(),
  { trigger: 'click', placement: 'bottom-start', width: 220 },
);

const emit = defineEmits<{
  (e: 'select', node: MenuNode): void;
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const anchorRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const open = ref(false);
const panelPos = ref({ left: 0, top: 0 });

const panelStyle = computed(() => ({
  left: `${panelPos.value.left}px`,
  top: `${panelPos.value.top}px`,
  width: `${props.width}px`,
}));

/* ===== 开关 ===== */
function show() {
  if (open.value) return;
  open.value = true;
  emit('open');
  nextTick(() => {
    updatePosition();
    panelRef.value?.focus();
  });
  bindGlobal();
}
function hide() {
  if (!open.value) return;
  open.value = false;
  emit('close');
  unbindGlobal();
}
function toggle() {
  open.value ? hide() : show();
}

/* ===== 定位：锚点下方，越界翻转 ===== */
function updatePosition() {
  const anchor = anchorRef.value;
  const panel = panelRef.value;
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const w = props.width;
  const h = panel?.offsetHeight ?? 320;
  let left = props.placement === 'bottom-end' ? r.right - w : r.left;
  let top = r.bottom + 6;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  if (left < 8) left = 8;
  if (top + h > window.innerHeight - 8) {
    const above = r.top - h - 12;
    top = above > 8 ? above : Math.max(8, window.innerHeight - 8 - h);
  }
  panelPos.value = { left, top };
}

/* ===== 触发器事件 ===== */
let triggerTimer: ReturnType<typeof setTimeout> | null = null;
function onClickTrigger(ev: MouseEvent) {
  if (props.trigger === 'hover') return;
  ev.stopPropagation();
  toggle();
}
function onEnterTrigger() {
  if (props.trigger !== 'hover') return;
  if (triggerTimer) { clearTimeout(triggerTimer); triggerTimer = null; }
  show();
}
function onLeaveTrigger() {
  if (props.trigger !== 'hover') return;
  scheduleClose();
}
function scheduleClose() {
  cancelClose();
  triggerTimer = setTimeout(hide, 200);
}
function cancelClose() {
  if (triggerTimer) { clearTimeout(triggerTimer); triggerTimer = null; }
}

/* ===== 选择 / 键盘 ===== */
function onSelect(node: MenuNode) {
  hide();
  emit('select', node);
}
function onPanelKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    hide();
    ev.preventDefault();
    ev.stopPropagation();
  }
}

/* ===== 全局监听：外部点击 / 滚动重定位 / 窗口变化关闭 ===== */
function onDocMousedown(ev: MouseEvent) {
  const t = ev.target as Node;
  if (panelRef.value?.contains(t)) return;
  if (anchorRef.value?.contains(t)) return;
  hide();
}
function onWinChange() {
  if (open.value) updatePosition();
}
function bindGlobal() {
  document.addEventListener('mousedown', onDocMousedown, true);
  window.addEventListener('resize', onWinChange);
  window.addEventListener('scroll', onWinChange, true);
}
function unbindGlobal() {
  document.removeEventListener('mousedown', onDocMousedown, true);
  window.removeEventListener('resize', onWinChange);
  window.removeEventListener('scroll', onWinChange, true);
}

watch(
  () => props.items,
  () => { if (open.value) nextTick(updatePosition); },
  { deep: true },
);

onBeforeUnmount(() => {
  cancelClose();
  unbindGlobal();
});

defineExpose({ show, hide, toggle });
</script>

<style scoped>
.app-menu-anchor {
  display: inline-flex;
}

/* ===== 面板：实色纸面 + 软阴影（elevation 只声明一次），Teleport 到 body 防裁剪 ===== */
.app-menu-panel {
  position: fixed;
  z-index: var(--z-dropdown, 2000);
  max-height: 60vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--menu-pad, 6px);
  border-radius: var(--overlay-radius, 14px);
  border: 1px solid var(--color-border);
  background: var(--el-bg-color-overlay, var(--glass-bg));
  box-shadow: var(--overlay-shadow, var(--shadow-lg));
  outline: none;
}

.app-menu-fade-enter-active {
  transition:
    opacity var(--motion-fast, 120ms) var(--ease-standard, ease),
    transform var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.app-menu-fade-leave-active {
  transition:
    opacity var(--motion-fast, 120ms) var(--ease-standard, ease),
    transform var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.app-menu-fade-enter-from,
.app-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
