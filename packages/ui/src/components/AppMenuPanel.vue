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
          'has-sub': hasChildren(item),
          'is-open': activeKey === nodeKey(item, idx),
        }"
        role="menuitem"
        :aria-haspopup="hasChildren(item) ? 'menu' : undefined"
        :aria-expanded="hasChildren(item) ? activeKey === nodeKey(item, idx) : undefined"
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
        <el-icon v-else-if="hasChildren(item)" class="app-menu-arrow"><ArrowRight /></el-icon>
      </div>
    </template>

    <!-- 二/三级子面板：绝对定位，右侧空间不足自动翻转 -->
    <transition name="app-menu-sub">
      <div
        v-if="activeItem"
        ref="subRef"
        class="app-menu-sub"
        :class="{ 'is-flip': subFlip }"
        :style="{ top: subTop + 'px' }"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
        @keydown="onSubKeydown"
      >
        <AppMenuPanel
          :items="activeItem.children ?? []"
          :level="(level ?? 1) + 1"
          @select="(n) => emit('select', n)"
          @close-sub="closeSubNow"
        />
      </div>
    </transition>
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
import { nextTick, ref } from 'vue';
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
}>();

const itemRefs = ref<HTMLElement[]>([]);
const activeKey = ref<string | null>(null);
const activeItem = ref<MenuNode | null>(null);
const subTop = ref(0);
const subFlip = ref(false);
const subRef = ref<HTMLElement | null>(null);

let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function hasChildren(item: MenuNode): boolean {
  return !!item.children?.length;
}
function nodeKey(item: MenuNode, idx: number): string {
  return item.key ?? item.label ?? String(idx);
}

/* ===== 子面板开关：悬浮 120ms 展开 / 200ms 宽容收起 ===== */
function onItemEnter(item: MenuNode, idx: number, ev: MouseEvent) {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (hasChildren(item)) {
    const key = nodeKey(item, idx);
    if (activeKey.value === key) return;
    openTimer = setTimeout(() => openSub(item, idx, ev), 120);
  } else {
    scheduleClose();
  }
}
function onItemLeave(item: MenuNode) {
  if (!hasChildren(item)) return;
  scheduleClose();
}
function openSub(item: MenuNode, idx: number, ev?: Event) {
  cancelClose();
  const key = nodeKey(item, idx);
  if (activeKey.value === key) return;
  activeKey.value = key;
  activeItem.value = item;
  const el = (ev?.currentTarget as HTMLElement | null) ?? null;
  if (el) {
    subTop.value = Math.max(0, el.offsetTop - 2);
    // 右侧空间不足 → 翻转到左侧（留 232px：220 面板 + 12 间距）
    const right = el.getBoundingClientRect().right;
    subFlip.value = right + 232 > window.innerWidth && right - 232 > 8;
  }
  nextTick(() => subRef.value?.focus?.());
}
function closeSubNow() {
  cancelClose();
  activeKey.value = null;
  activeItem.value = null;
}
function scheduleClose() {
  cancelClose();
  closeTimer = setTimeout(() => {
    openKey_clear();
  }, 200);
}
function openKey_clear() {
  activeKey.value = null;
  activeItem.value = null;
}
function cancelClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
}

function onItemClick(item: MenuNode, ev: MouseEvent) {
  if (item.disabled) return;
  if (hasChildren(item)) {
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
      if (hasChildren(item)) { cancelClose(); openSub(item, idx, ev); }
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

/* ===== 子面板：同皮肤，右向展开（空间不足翻转） ===== */
.app-menu-sub {
  position: absolute;
  left: calc(100% + 6px);
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
  z-index: 1;
}
.app-menu-sub.is-flip {
  left: auto;
  right: calc(100% + 6px);
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
