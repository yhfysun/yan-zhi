<script setup lang="ts">
/**
 * Generic side pane with drag-to-resize and collapse.
 * One implementation for textbook TOC / lesson TOC / note drawer so the three
 * surfaces cannot drift apart. Width and collapsed state are local preferences.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  label: string;
  storageKey: string;
  side?: 'left' | 'right';
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsedWidth?: number;
}>(), {
  side: 'left',
  defaultWidth: 220,
  minWidth: 34,
  maxWidth: 420,
  collapsedWidth: 34,
});

const width = ref(props.defaultWidth);
const collapsed = ref(false);
let dragStartX = 0;
let dragStartWidth = props.defaultWidth;

function clamp(value: number): number {
  return Math.min(props.maxWidth, Math.max(props.minWidth, Math.round(value)));
}

function save(): void {
  try {
    localStorage.setItem(props.storageKey, JSON.stringify({ width: width.value, collapsed: collapsed.value }));
  } catch { /* layout preferences are optional */ }
}

function restore(): void {
  try {
    const raw = localStorage.getItem(props.storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as { width?: number; collapsed?: boolean };
    if (Number.isFinite(Number(saved.width))) width.value = clamp(Number(saved.width));
    collapsed.value = !!saved.collapsed;
  } catch { /* ignore invalid preference */ }
}

function toggle(): void {
  collapsed.value = !collapsed.value;
  save();
}

function onPointerMove(event: PointerEvent): void {
  const delta = props.side === 'left' ? event.clientX - dragStartX : dragStartX - event.clientX;
  width.value = clamp(dragStartWidth + delta);
}

function stopResize(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  save();
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  dragStartX = event.clientX;
  dragStartWidth = width.value;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 32 : 16;
  const grow = props.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const shrink = props.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (event.key === grow) width.value = clamp(width.value + step);
  else if (event.key === shrink) width.value = clamp(width.value - step);
  else if (event.key === 'Home') width.value = props.minWidth;
  else if (event.key === 'End') width.value = props.maxWidth;
  else return;
  event.preventDefault();
  save();
}

onMounted(restore);
onBeforeUnmount(stopResize);

defineExpose({ toggle, collapsed, width });
</script>

<template>
  <aside
    class="rpane"
    :class="[`rpane-${side}`, { 'rpane-collapsed': collapsed }]"
    :style="{ width: `${collapsed ? collapsedWidth : width}px` }"
    :aria-label="label"
    :data-pane-label="label"
  >
    <template v-if="collapsed">
      <button class="rpane-reveal" type="button" :aria-label="`展开${label}`" @click="toggle">
        <ChevronLeft v-if="side === 'left'" :size="13" />
        <ChevronRight v-else :size="13" />
        <span>{{ label }}</span>
      </button>
    </template>
    <template v-else>
      <button class="rpane-fold" type="button" :aria-label="`收起${label}`" @click="toggle">
        <ChevronLeft v-if="side === 'left'" :size="13" />
        <ChevronRight v-else :size="13" />
      </button>
      <div class="rpane-content"><slot /></div>
      <div
        class="rpane-handle"
        role="separator"
        tabindex="0"
        :aria-label="`拖动调整${label}宽度`"
        :aria-orientation="'vertical'"
        :aria-valuemin="minWidth"
        :aria-valuemax="maxWidth"
        :aria-valuenow="width"
        @pointerdown="startResize"
        @keydown="onKeydown"
      />
    </template>
  </aside>
</template>

<style scoped>
.rpane {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid var(--lv2-line, #d8ded9);
  background: color-mix(in srgb, var(--lv2-surface, #fff) 86%, transparent);
}
.rpane-right { flex-direction: row-reverse; border-right: 0; border-left: 1px solid var(--lv2-line, #d8ded9); }
.rpane-content { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.rpane-fold {
  position: absolute; top: 7px; right: 10px; z-index: 2;
  display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center;
  border: 1px solid var(--lv2-line, #d8ded9); border-radius: 6px;
  background: var(--lv2-surface, #fff); color: var(--lv2-muted, #5f6a63); cursor: pointer;
}
.rpane-right .rpane-fold { right: auto; left: 10px; }
.rpane-reveal {
  display: flex; width: 100%; height: 100%; flex-direction: column; gap: 9px; align-items: center;
  padding-top: 12px; border: 0; background: transparent; color: var(--lv2-muted, #5f6a63); cursor: pointer;
}
.rpane-reveal span { writing-mode: vertical-rl; font-size: 10px; letter-spacing: 2px; }
.rpane-handle { flex: 0 0 6px; cursor: col-resize; background: transparent; }
.rpane-handle:hover, .rpane-handle:focus-visible { background: color-mix(in srgb, var(--lv2-accent, #3f8a67) 22%, transparent); outline: 0; }
</style>
