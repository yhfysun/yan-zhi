<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';

type SubjectOption = { key: string; label: string; ready: boolean };

const props = withDefaults(defineProps<{
  value: string;
  options: SubjectOption[];
  label?: string;
}>(), {
  label: '科目',
});
const emit = defineEmits<{ select: [key: string] }>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);
const selectedIndex = computed(() => props.options.findIndex((item) => item.key === props.value));
const selected = computed(() => props.options[selectedIndex.value] || null);
const selectedLabel = computed(() => selected.value
  ? `${selected.value.label}${selected.value.ready ? '' : '（筹备中）'}`
  : props.value);

function enabledIndex(from: number, direction: 1 | -1) {
  if (!props.options.length) return -1;
  for (let step = 0; step < props.options.length; step += 1) {
    const index = (from + direction * step + props.options.length) % props.options.length;
    if (props.options[index]?.ready) return index;
  }
  return -1;
}

function openMenu() {
  open.value = true;
  activeIndex.value = selected.value?.ready ? selectedIndex.value : enabledIndex(0, 1);
}

function closeMenu(restoreFocus = false) {
  open.value = false;
  activeIndex.value = -1;
  if (restoreFocus) void nextTick(() => trigger.value?.focus());
}

function toggleMenu() {
  if (open.value) closeMenu();
  else openMenu();
}

function selectOption(option: SubjectOption) {
  if (!option.ready) return;
  emit('select', option.key);
  closeMenu(true);
}

function moveActive(direction: 1 | -1) {
  if (!props.options.length) return;
  const start = activeIndex.value >= 0 ? activeIndex.value : (selectedIndex.value >= 0 ? selectedIndex.value : 0);
  activeIndex.value = enabledIndex(start + direction, direction);
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open.value) openMenu();
    else moveActive(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) openMenu();
    else moveActive(-1);
    return;
  }
  if (event.key === 'Home' && open.value) {
    event.preventDefault();
    activeIndex.value = enabledIndex(0, 1);
    return;
  }
  if (event.key === 'End' && open.value) {
    event.preventDefault();
    activeIndex.value = enabledIndex(props.options.length - 1, -1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!open.value) {
      openMenu();
      return;
    }
    const option = props.options[activeIndex.value];
    if (option) selectOption(option);
    return;
  }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    closeMenu();
  }
  if (event.key === 'Tab') closeMenu();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return;
  if (!root.value?.contains(event.target as Node)) closeMenu();
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));
</script>

<template>
  <div ref="root" class="subject-picker">
    <span class="subject-picker-label">{{ label }}</span>
    <button
      ref="trigger"
      type="button"
      class="subject-picker-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="`选择学习${label}`"
      :aria-expanded="open"
      :aria-controls="open ? 'subject-picker-listbox' : undefined"
      :aria-activedescendant="open && activeIndex >= 0 ? `subject-picker-option-${activeIndex}` : undefined"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span>{{ selectedLabel }}</span>
      <ChevronDown :size="14" :class="{ open }" />
    </button>

    <div
      v-if="open"
      id="subject-picker-listbox"
      class="subject-picker-menu"
      role="listbox"
      :aria-label="`${label}选项`"
    >
      <button
        v-for="(option, index) in options"
        :id="`subject-picker-option-${index}`"
        :key="option.key"
        type="button"
        class="subject-picker-option"
        :class="{ selected: option.key === value, active: index === activeIndex, disabled: !option.ready }"
        role="option"
        :aria-selected="option.key === value"
        :aria-disabled="!option.ready"
        :disabled="!option.ready"
        @mouseenter="activeIndex = index"
        @click="selectOption(option)"
      >
        <span>{{ option.label }}{{ option.ready ? '' : '（筹备中）' }}</span>
        <Check v-if="option.key === value" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.subject-picker { position: relative; display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; color: var(--color-text-secondary); font-size: 11px; }
.subject-picker-label { white-space: nowrap; }
.subject-picker-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 32px; min-width: 126px; max-width: 170px; padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  border-radius: 7px;
  background: var(--skin-btn-bg-color, var(--glass-bg));
  color: var(--color-text);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.subject-picker-trigger:hover,
.subject-picker-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  background: var(--skin-btn-bg-hover, var(--glass-bg-hover));
}
.subject-picker-trigger:focus-visible { outline: 2px solid color-mix(in srgb, var(--color-primary) 45%, transparent); outline-offset: 1px; }
.subject-picker-trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subject-picker-trigger svg { flex: none; color: var(--color-text-tertiary); transition: transform .15s ease; }
.subject-picker-trigger svg.open { transform: rotate(180deg); }
.subject-picker-menu {
  position: absolute; top: calc(100% + 6px); left: 31px; z-index: 90;
  width: max(100%, 184px); max-width: min(260px, calc(100vw - 32px)); padding: 5px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  border-radius: 9px;
  background-color: var(--skin-dialog-bg, var(--glass-bg-panel-sm, var(--color-bg-elevated)));
  background-image:
    linear-gradient(var(--skin-popover-veil, transparent), var(--skin-popover-veil, transparent)),
    var(--skin-menu-pattern, none);
  background-size: auto, var(--skin-pattern-size, cover);
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 12px 34px color-mix(in srgb, #000 30%, transparent);
}
.subject-picker-option {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; min-height: 32px; padding: 6px 9px;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--color-text); font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.subject-picker-option:hover,
.subject-picker-option.active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}
.subject-picker-option.selected {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-text);
}
.subject-picker-option.selected svg { color: var(--color-primary); }
.subject-picker-option.disabled { color: var(--color-text-tertiary); opacity: .55; cursor: not-allowed; }
.subject-picker-option.disabled:hover { background: transparent; }
@media (max-width: 900px) {
  .subject-picker-trigger { min-width: 138px; max-width: min(210px, calc(100vw - 82px)); }
  .subject-picker-menu { left: 0; }
}
</style>
