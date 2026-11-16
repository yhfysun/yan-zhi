<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';

type SelectValue = string | number;
type LearningSelectOption = {
  value: SelectValue;
  label: string;
  disabled?: boolean;
};
type LearningSelectGroup = {
  label: string;
  options: LearningSelectOption[];
};

const props = withDefaults(defineProps<{
  value: SelectValue;
  options?: LearningSelectOption[];
  groups?: LearningSelectGroup[];
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  options: () => [],
  groups: () => [],
  ariaLabel: '选择',
  placeholder: '请选择',
  disabled: false,
});
const emit = defineEmits<{
  change: [value: SelectValue];
  'update:value': [value: SelectValue];
}>();

let selectUid = 0;
const instanceId = ++selectUid;
const listboxId = `learning-select-listbox-${instanceId}`;
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);

const renderGroups = computed<LearningSelectGroup[]>(() => {
  if (props.groups.length) return props.groups.filter((group) => group.options.length);
  return props.options.length ? [{ label: '', options: props.options }] : [];
});
const flatOptions = computed(() => renderGroups.value.flatMap((group) => group.options));
const selectedIndex = computed(() => flatOptions.value.findIndex((option) => option.value === props.value));
const selectedLabel = computed(() => flatOptions.value[selectedIndex.value]?.label || props.placeholder);

function enabledIndex(from: number, direction: 1 | -1): number {
  if (!flatOptions.value.length) return -1;
  let index = from;
  for (let step = 0; step < flatOptions.value.length; step += 1) {
    index = (index + direction + flatOptions.value.length) % flatOptions.value.length;
    if (!flatOptions.value[index]?.disabled) return index;
  }
  return -1;
}

function groupOffset(groupIndex: number): number {
  let offset = 0;
  for (let index = 0; index < groupIndex; index += 1) {
    offset += renderGroups.value[index]?.options.length ?? 0;
  }
  return offset;
}

function openMenu() {
  if (props.disabled) return;
  open.value = true;
  activeIndex.value = selectedIndex.value >= 0 && !flatOptions.value[selectedIndex.value]?.disabled
    ? selectedIndex.value
    : enabledIndex(selectedIndex.value, 1);
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

function selectOption(option: LearningSelectOption) {
  if (option.disabled) return;
  emit('update:value', option.value);
  emit('change', option.value);
  closeMenu(true);
}

function moveActive(direction: 1 | -1) {
  if (!flatOptions.value.length) return;
  const start = activeIndex.value >= 0
    ? activeIndex.value
    : selectedIndex.value >= 0
      ? selectedIndex.value
      : -direction;
  activeIndex.value = enabledIndex(start, direction);
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) openMenu();
    else moveActive(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Home' && open.value) {
    event.preventDefault();
    activeIndex.value = enabledIndex(-1, 1);
    return;
  }
  if (event.key === 'End' && open.value) {
    event.preventDefault();
    activeIndex.value = enabledIndex(flatOptions.value.length, -1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!open.value) {
      openMenu();
      return;
    }
    const option = flatOptions.value[activeIndex.value];
    if (option) selectOption(option);
    return;
  }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === 'Tab') closeMenu();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) closeMenu();
}

watch(activeIndex, (index) => {
  if (!open.value || index < 0) return;
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>(`#learning-select-option-${instanceId}-${index}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  });
});

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));
</script>

<template>
  <div ref="root" class="learning-select">
    <button
      ref="trigger"
      type="button"
      class="learning-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-activedescendant="open && activeIndex >= 0 ? `learning-select-option-${instanceId}-${activeIndex}` : undefined"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span>{{ selectedLabel }}</span>
      <ChevronDown :size="16" :class="{ open }" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      :id="listboxId"
      class="learning-select-menu"
      role="listbox"
      :aria-label="`${ariaLabel}选项`"
    >
      <div
        v-for="(group, groupIndex) in renderGroups"
        :key="`${group.label}-${groupIndex}`"
        class="learning-select-group"
        role="group"
        :aria-label="group.label || undefined"
      >
        <div v-if="group.label" class="learning-select-group-label">{{ group.label }}</div>
        <button
          v-for="(option, optionIndex) in group.options"
          :id="`learning-select-option-${instanceId}-${groupOffset(groupIndex) + optionIndex}`"
          :key="String(option.value)"
          type="button"
          class="learning-select-option"
          :class="{
            selected: option.value === value,
            active: groupOffset(groupIndex) + optionIndex === activeIndex,
          }"
          role="option"
          :data-value="String(option.value)"
          :aria-selected="option.value === value"
          :aria-disabled="option.disabled || undefined"
          :disabled="option.disabled"
          @mouseenter="activeIndex = groupOffset(groupIndex) + optionIndex"
          @click="selectOption(option)"
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === value" :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.learning-select {
  position: relative;
  width: 100%;
  min-width: 0;
  color: var(--learning-select-ink, var(--color-text, #242a2e));
  font-size: var(--learning-select-font-size, 14px);
}
.learning-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--learning-select-border, var(--color-border, #d8d3c8));
  border-radius: var(--learning-select-radius, 10px);
  background: var(--learning-select-bg, #fff);
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.learning-select-trigger:hover,
.learning-select-trigger[aria-expanded="true"] {
  border-color: var(--learning-select-accent, var(--color-primary, #3370ff));
}
.learning-select-trigger:focus-visible {
  outline: 2px solid var(--learning-select-accent, var(--color-primary, #3370ff));
  outline-offset: 1px;
}
.learning-select-trigger:disabled { opacity: .55; cursor: default; }
.learning-select-trigger > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.learning-select-trigger svg {
  flex: none;
  color: var(--learning-select-muted, var(--color-text-tertiary, #6e787d));
  transition: transform .15s ease;
}
.learning-select-trigger svg.open { transform: rotate(180deg); }
.learning-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 90;
  max-height: min(320px, 60vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 5px;
  border: 1px solid var(--learning-select-accent, var(--color-primary, #3370ff));
  border-radius: 10px;
  background: var(--learning-select-bg, var(--color-bg-elevated, #fff));
  box-shadow: 0 12px 34px rgba(0, 0, 0, .22);
}
.learning-select-group + .learning-select-group { margin-top: 5px; }
.learning-select-group-label {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 7px 9px 5px;
  background: var(--learning-select-bg, var(--color-bg-elevated, #fff));
  color: var(--learning-select-muted, var(--color-text-tertiary, #6e787d));
  font-size: 11px;
  font-weight: 700;
}
.learning-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.learning-select-option > span { min-width: 0; }
.learning-select-option:hover,
.learning-select-option.active {
  background: color-mix(in srgb, var(--learning-select-accent, var(--color-primary, #3370ff)) 12%, transparent);
}
.learning-select-option.selected {
  background: color-mix(in srgb, var(--learning-select-accent, var(--color-primary, #3370ff)) 18%, transparent);
  font-weight: 700;
}
.learning-select-option.selected svg { flex: none; color: var(--learning-select-accent, var(--color-primary, #3370ff)); }
.learning-select-option:disabled { opacity: .5; cursor: not-allowed; }
.learning-select-option:disabled:hover { background: transparent; }
@media (max-width: 900px) {
  .learning-select-menu { max-width: calc(100vw - 24px); }
}
</style>
