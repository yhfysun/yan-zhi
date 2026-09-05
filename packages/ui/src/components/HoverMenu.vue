<template>
  <div class="hm-wrap" @mouseleave="scheduleClose">
    <div class="hm-list" ref="listRef">
      <template v-for="(item, idx) in items" :key="item.key ?? item.label ?? idx">
        <!-- 分隔线项 -->
        <div v-if="item.divider" class="hm-divider" />
        <!-- 含子菜单：hover / 点击均展开二级 -->
        <div
          v-else-if="item.children?.length"
          class="hm-item"
          :class="{ 'is-open': openKey === groupKey(item, idx) }"
          :data-hm-key="groupKey(item, idx)"
          @mouseenter="openItem(item, idx, $event)"
          @click="openItem(item, idx, $event)"
        >
          <span v-if="item.icon" class="hm-ic"><el-icon :size="15"><component :is="item.icon" /></el-icon></span>
          <div class="hm-info">
            <div class="hm-label">{{ item.label }}</div>
            <div v-if="item.desc" class="hm-desc">{{ item.desc }}</div>
          </div>
          <el-icon class="hm-arrow"><ArrowRight /></el-icon>
        </div>
        <!-- 叶子项 -->
        <div v-else class="hm-item" @mouseenter="closeSubNow" @click="pick(item)">
          <span v-if="item.icon" class="hm-ic"><el-icon :size="15"><component :is="item.icon" /></el-icon></span>
          <div class="hm-info">
            <div class="hm-label">{{ item.label }}</div>
            <div v-if="item.desc" class="hm-desc">{{ item.desc }}</div>
          </div>
          <el-icon v-if="item.check" class="hm-check"><Check /></el-icon>
        </div>
      </template>
    </div>

    <!-- 二级面板：右侧弹出，顶部固定分组名 + 项数 -->
    <transition name="hm-sub-fade">
      <div v-if="activeItem?.children?.length" class="hm-sub" :style="{ top: subTop + 'px' }" @mouseenter="cancelClose">
        <div class="hm-sub-head">{{ activeItem.label }} · {{ activeItem.children.length }}</div>
        <div
          v-for="child in activeItem.children"
          :key="child.key ?? child.label"
          class="hm-item"
          @click="pick(child)"
        >
          <span v-if="child.icon" class="hm-ic"><el-icon :size="15"><component :is="child.icon" /></el-icon></span>
          <div class="hm-info">
            <div class="hm-label">{{ child.label }}</div>
            <div v-if="child.desc" class="hm-desc">{{ child.desc }}</div>
          </div>
          <el-icon v-if="child.check" class="hm-check"><Check /></el-icon>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Component } from 'vue';
import { ArrowRight, Check } from '@element-plus/icons-vue';

export interface HoverMenuItem {
  /** 稳定 key（缺省用 label） */
  key?: string;
  label: string;
  icon?: Component;
  /** 次要说明（灰字） */
  desc?: string;
  /** 叶子项路由（由父组件在 select 事件里自行跳转） */
  path?: string;
  /** 分隔线（只渲染线，不渲染项，label 可省） */
  divider?: boolean;
  /** 有子菜单时点击/hover 展开二级面板 */
  children?: HoverMenuItem[];
  /** 叶子项选中态对勾 */
  check?: boolean;
}

const props = defineProps<{
  items: HoverMenuItem[];
  /** 一级菜单宽度（px），默认 216 */
  width?: number;
}>();

const emit = defineEmits<{
  /** 叶子项被点击（含二级面板内的项） */
  (e: 'select', item: HoverMenuItem): void;
}>();

const listRef = ref<HTMLElement | null>(null);
const openKey = ref<string | null>(null);
const subTop = ref(0);
const listWidth = computed(() => `${props.width ?? 216}px`);

let closeTimer: ReturnType<typeof setTimeout> | null = null;

const activeItem = computed(() =>
  props.items.find((it, idx) => openKey.value === groupKey(it, idx) && it.children?.length),
);

function groupKey(item: HoverMenuItem, idx: number): string {
  return item.key ?? item.label ?? String(idx);
}

/** hover / 点击一级分组项：展开其二级面板（面板 top 对齐被 hover 项） */
function openItem(item: HoverMenuItem, idx: number, ev: MouseEvent) {
  if (!item.children?.length) return;
  cancelClose();
  const key = groupKey(item, idx);
  if (openKey.value === key) return;
  openKey.value = key;
  const el = (ev.currentTarget as HTMLElement | null);
  if (el && listRef.value) {
    subTop.value = Math.max(0, el.offsetTop - 2);
  }
}

function closeSubNow() {
  cancelClose();
  openKey.value = null;
}

/** 鼠标斜穿菜单时不误关：150ms 延迟 */
function scheduleClose() {
  cancelClose();
  closeTimer = setTimeout(() => {
    openKey.value = null;
  }, 150);
}

function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function pick(item: HoverMenuItem) {
  closeSubNow();
  emit('select', item);
}

defineExpose({ closeSubNow });
</script>

<style scoped>
.hm-wrap {
  position: relative;
  display: flex;
}

.hm-list {
  display: flex;
  flex-direction: column;
  width: v-bind(listWidth);
}

.hm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.hm-item:hover {
  background: var(--glass-bg-hover);
}

.hm-item.is-open {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.hm-ic {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}

.hm-info {
  flex: 1;
  min-width: 0;
}

.hm-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.3;
}

.hm-desc {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}

.hm-arrow {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.hm-check {
  font-size: 14px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.hm-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--glass-border);
}

/* 二级面板：绝对定位右侧 */
.hm-sub {
  position: absolute;
  left: calc(100% + 8px);
  min-width: 200px;
  max-width: 300px;
  padding: 6px;
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--glass-border);
  background: var(--el-bg-color-overlay, var(--glass-bg));
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.hm-sub-head {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 10px 4px;
}

.hm-sub-fade-enter-active,
.hm-sub-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.hm-sub-fade-enter-from,
.hm-sub-fade-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}
</style>
