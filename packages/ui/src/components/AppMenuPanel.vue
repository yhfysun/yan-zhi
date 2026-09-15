<template>
  <div class="app-menu-list" role="menu" :data-level="level">
    <template v-for="(item, idx) in items" :key="item.key ?? item.label ?? idx">
      <!-- 分隔线 -->
      <div v-if="item.type === 'separator'" class="app-menu-sep" role="separator" />
      <!-- 分组标题：不可聚焦不可点 -->
      <div v-else-if="item.type === 'group'" class="app-menu-group">{{ item.label }}</div>
      <!-- 菜单项 -->
      <div
        v-else
        ref="itemRefs"
        class="app-menu-item"
        :class="{
          'is-disabled': item.disabled,
          'is-selected': item.selected,
          'has-sub': hasSub(item),
          'is-open': activeKey === nodeKey(item, idx),
        }"
        role="menuitem"
        :aria-haspopup="hasSub(item) ? 'menu' : undefined"
        :aria-expanded="hasSub(item) ? activeKey === nodeKey(item, idx) : undefined"
        :tabindex="item.disabled ? -1 : 0"
        @mouseenter="onItemEnter(item, idx, $event)"
        @mouseleave="onItemLeave(item)"
        @click="onItemClick(item, $event)"
        @keydown="onItemKeydown(item, idx, $event)"
      >
        <span v-if="item.icon" class="app-menu-ic"><el-icon :size="15"><component :is="item.icon" /></el-icon></span>
        <span class="app-menu-label">{{ item.label }}</span>
        <span v-if="item.desc" class="app-menu-desc">{{ item.desc }}</span>
        <el-icon v-if="item.selected" class="app-menu-check"><Check /></el-icon>
        <el-icon v-else-if="hasSub(item)" class="app-menu-arrow"><ArrowRight /></el-icon>
      </div>
    </template>

    <!-- 二/三级子面板：Teleport 到 body + fixed 定位，避免被父面板的 overflow 裁剪 -->
    <Teleport to="body">
      <transition name="app-menu-sub">
        <div
          v-if="activeItem"
          ref="subRef"
          class="app-menu-sub"
          :style="{ top: subTop + 'px', left: subLeft + 'px' }"
          @mouseenter="cancelClose"
          @mouseleave="scheduleClose"
          @keydown="onSubKeydown"
        >
          <AppMenuPanel
            :items="activeItem.children ?? []"
            :level="(level ?? 1) + 1"
            @select="(n) => emit('select', n)"
            @close-sub="closeSubNow"
            @sub-open="emit('sub-open')"
            @sub-close="emit('sub-close')"
          />
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script lang="ts">
export interface MenuNode {
  key: string;
  label: string;
  icon?: Component;
  /** 次要说明（灰字 / 等宽 ID） */
  desc?: string;
  disabled?: boolean;
  /** 选中态：主色文字 + 对勾 */
  selected?: boolean;
  /** 分组标题 / 分隔线节点不可选中 */
  type?: 'item' | 'group' | 'separator';
  children?: MenuNode[];
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Component } from 'vue';
import { ArrowRight, Check } from '@element-plus/icons-vue';

const props = defineProps<{
  items: MenuNode[];
  /** 递归层级：1 = 主面板 */
  level?: number;
}>();

const emit = defineEmits<{
  (e: 'select', node: MenuNode): void;
  (e: 'close-sub'): void;
  /** 子面板已展开：父级据此抑制「鼠标移出主面板即关闭」的判定（子面板 Teleport 到 body，不算主面板内部） */
  (e: 'sub-open'): void;
  (e: 'sub-close'): void;
}>();

/** 子面板宽度与最大高度估算（用于视口边界钳制） */
const SUB_PANEL_W = 244;
const SUB_PANEL_MAX_H = 320;

const itemRefs = ref<HTMLElement[]>([]);
const activeKey = ref<string | null>(null);
const activeItem = ref<MenuNode | null>(null);
const subTop = ref(0);
const subLeft = ref(0);
const subRef = ref<HTMLElement | null>(null);

let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** 有子菜单：hover/点击展开二级面板，且点击不触发 select */
function hasSub(item: MenuNode): boolean {
  return !!item.children?.length;
}
function nodeKey(item: MenuNode, idx: number): string {
  return item.key ?? item.label ?? String(idx);
}

/* ===== 子面板开关：悬浮 120ms 展开 / 200ms 宽容收起 ===== */
function onItemEnter(item: MenuNode, idx: number, ev: MouseEvent) {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (hasSub(item)) {
    const key = nodeKey(item, idx);
    if (activeKey.value === key) return;
    openTimer = setTimeout(() => openSub(item, idx, ev), 120);
  } else {
    scheduleClose();
  }
}
function onItemLeave(item: MenuNode) {
  if (!hasSub(item)) return;
  scheduleClose();
}
function openSub(item: MenuNode, idx: number, ev?: Event) {
  cancelClose();
  const key = nodeKey(item, idx);
  if (activeKey.value === key) return;
  activeKey.value = key;
  activeItem.value = item;
  const el = (ev?.currentTarget as HTMLElement | null) ?? null;
  if (el) placeSub(el);
  emit('sub-open');
  nextTick(() => subRef.value?.focus?.());
}

/**
 * 子面板定位：默认贴菜单项右侧展开，右侧空间不足翻到左侧；
 * 纵向钳制在视口内，避免靠近底部时被切掉。
 */
function placeSub(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const gap = 6;
  const right = r.right + gap;
  subLeft.value = right + SUB_PANEL_W > window.innerWidth - 8
    ? Math.max(8, r.left - SUB_PANEL_W - gap)
    : right;
  subTop.value = Math.max(8, Math.min(r.top - 4, window.innerHeight - SUB_PANEL_MAX_H - 8));
}
function closeSubNow() {
  cancelClose();
  const had = !!activeItem.value;
  activeKey.value = null;
  activeItem.value = null;
  if (had) emit('sub-close');
}
function scheduleClose() {
  cancelClose();
  closeTimer = setTimeout(() => {
    openKey_clear();
  }, 200);
}
function openKey_clear() {
  const had = !!activeItem.value;
  activeKey.value = null;
  activeItem.value = null;
  if (had) emit('sub-close');
}
function cancelClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
}

/* ===== 主面板滚动后锚点失效 → 直接收起子面板（子面板自身滚动不触发） ===== */
function onDocScroll(ev: Event) {
  if (!activeItem.value) return;
  const t = ev.target as Node | null;
  if (t && subRef.value?.contains(t)) return;
  closeSubNow();
}

function onItemClick(item: MenuNode, ev: MouseEvent) {
  if (item.disabled) return;
  if (hasSub(item)) {
    const idx = (ev.currentTarget as HTMLElement)
      ? Array.from(itemRefs.value).indexOf(ev.currentTarget as HTMLElement)
      : -1;
    cancelClose();
    openSub(item, Math.max(0, idx), ev);
    return;
  }
  closeSubNow();
  emit('select', item);
}

/* ===== 键盘导航：上下移动 / 右展开 / 左返回 / Enter 选中 / Esc 逐级关闭 ===== */
function focusSibling(el: HTMLElement, dir: 1 | -1) {
  const list = Array.from(
    (el.parentElement as HTMLElement).querySelectorAll<HTMLElement>('.app-menu-item'),
  ).filter((n) => n.tabIndex >= 0);
  const i = list.indexOf(el);
  const next = list[(i + dir + list.length) % list.length];
  next?.focus();
}
function onItemKeydown(item: MenuNode, idx: number, ev: KeyboardEvent) {
  const el = ev.currentTarget as HTMLElement;
  switch (ev.key) {
    case 'ArrowDown': focusSibling(el, 1); ev.preventDefault(); break;
    case 'ArrowUp': focusSibling(el, -1); ev.preventDefault(); break;
    case 'ArrowRight':
      if (hasSub(item)) { cancelClose(); openSub(item, idx, ev); }
      ev.preventDefault();
      break;
    case 'ArrowLeft':
      if (props.level && props.level > 1) emit('close-sub');
      ev.preventDefault();
      break;
    case 'Enter':
    case ' ':
      onItemClick(item, ev as unknown as MouseEvent);
      ev.preventDefault();
      break;
    case 'Escape':
      if (props.level && props.level > 1) { closeSubNow(); ev.stopPropagation(); }
      emit('close-sub');
      break;
  }
}
function onSubKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    closeSubNow();
    ev.stopPropagation();
  }
}

onMounted(() => document.addEventListener('scroll', onDocScroll, true));
onBeforeUnmount(() => {
  cancelClose();
  document.removeEventListener('scroll', onDocScroll, true);
});

defineExpose({ closeSubNow });
</script>

<style scoped>
.app-menu-list {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 100%;
}

.app-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--menu-item-h, 34px);
  margin: 1px 2px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 6px);
  font-size: 13.5px;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition:
    background-color var(--motion-fast, 120ms) var(--ease-standard, ease),
    color var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.app-menu-item:hover,
.app-menu-item.is-open {
  background: var(--color-surface-hover);
}
.app-menu-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.app-menu-item.is-selected {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-weight: 600;
}
.app-menu-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-menu-ic {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--color-text-secondary);
}
.app-menu-item.is-selected .app-menu-ic {
  color: var(--color-primary);
}
.app-menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-menu-desc {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.app-menu-check {
  flex-shrink: 0;
  color: var(--color-primary);
}
.app-menu-arrow {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.app-menu-group {
  height: 24px;
  margin: 6px 2px 1px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  user-select: none;
}
.app-menu-group:first-child {
  margin-top: 0;
}

.app-menu-sep {
  height: 1px;
  margin: 5px 10px;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}

/* ===== 子面板：同皮肤，Teleport 到 body 后走 fixed（坐标由 placeSub 计算） ===== */
.app-menu-sub {
  position: fixed;
  min-width: 220px;
  max-width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--menu-pad, 6px);
  border-radius: var(--overlay-radius, 14px);
  border: 1px solid var(--color-border);
  background: var(--el-bg-color-overlay, var(--glass-bg));
  box-shadow: var(--overlay-shadow, var(--shadow-lg));
  z-index: calc(var(--z-dropdown, 2000) + 1);
}

.app-menu-sub-enter-active,
.app-menu-sub-leave-active {
  transition:
    opacity var(--motion-fast, 120ms) var(--ease-standard, ease),
    transform var(--motion-fast, 120ms) var(--ease-standard, ease);
}
.app-menu-sub-enter-from,
.app-menu-sub-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

@media (max-width: 767px) {
  .app-menu-item {
    height: var(--menu-item-h-mobile, 44px);
    font-size: 14px;
  }
}
</style>
