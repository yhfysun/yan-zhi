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
const menuRef = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);

/** 窄视口判定：≤900px 与紧凑布局/学习页单列同断点。窄屏菜单 Teleport 到 body
 *  变 bottom sheet 弹窗（学习模式设计准则 §6 ⑤长列表用弹层；用户实报
 *  「点击要翻到最后才能看到，弹窗也行」）。桌面保持原位下拉，契约不变。 */
const isNarrowViewport = ref(
  typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia('(max-width: 900px)').matches
    : false,
);
if (typeof window !== 'undefined' && window.matchMedia) {
  const mqNarrow = window.matchMedia('(max-width: 900px)');
  const onMqNarrow = (e: MediaQueryListEvent) => { isNarrowViewport.value = e.matches; };
  try { mqNarrow.addEventListener('change', onMqNarrow); } catch { mqNarrow.addListener(onMqNarrow); }
  onBeforeUnmount(() => {
    try { mqNarrow.removeEventListener('change', onMqNarrow); } catch { mqNarrow.removeListener(onMqNarrow); }
  });
}

const renderGroups = computed<LearningSelectGroup[]>(() => {
  // ★ 分组可折叠（用户实报「下拉框里面分类的能不能折叠」）：收起的组只渲染标题，
  //   选项从渲染树剔除 ⇒ flatOptions/键盘导航/aria id 全部自动保持一致。
  return baseGroups.value.map((group) => ({
    label: group.label,
    options: group.label && collapsedGroups.value.has(group.label) ? [] : group.options,
  }));
});
const baseGroups = computed<LearningSelectGroup[]>(() => {
  const src = props.groups.length
    ? props.groups.filter((group) => group.options.length)
    : props.options.length ? [{ label: '', options: props.options }] : [];
  return src;
});
/** 组内选项总数（折叠后 renderGroups 里 options 已清空，计数从 baseGroups 取） */
function groupCount(label: string): number {
  return baseGroups.value.find((group) => group.label === label)?.options.length ?? 0;
}
/** 全量选项（含折叠组）：选中项标签必须不受折叠影响 */
const allOptions = computed(() => props.groups.length
  ? props.groups.flatMap((group) => group.options)
  : [...props.options]);
const flatOptions = computed(() => renderGroups.value.flatMap((group) => group.options));
const selectedIndex = computed(() => allOptions.value.findIndex((option) => option.value === props.value));
const selectedLabel = computed(() => allOptions.value[selectedIndex.value]?.label || props.placeholder);

// ---- 分组折叠状态（按组标题记；无标题组不参与折叠）----
const collapsedGroups = ref<Set<string>>(new Set());
function toggleGroup(label: string) {
  if (!label) return;
  const next = new Set(collapsedGroups.value);
  if (next.has(label)) next.delete(label); else next.add(label);
  collapsedGroups.value = next;
  // 重新展开时把选中项滚进可视区（collapsed ⇒ flatOptions 变化后 nextTick 再滚）
  void nextTick(() => {
    if (activeIndex.value < 0) return;
    root.value?.querySelector<HTMLElement>(`#learning-select-option-${instanceId}-${activeIndex.value}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  });
}

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
  if (!open.value) return;
  const target = event.target as Node;
  // 菜单可能 Teleport 到 body（窄屏弹层）：root 与 menuRef 任一命中都算内部点击
  if (!root.value?.contains(target) && !menuRef.value?.contains(target)) closeMenu();
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

    <!-- 窄屏：Teleport 到 body 的 bottom sheet（z-index 3000 同沉浸台口径，盖过 TabBar
         与吸底复习 CTA——.main-content 的层叠上下文/祖先 transform 不再劫持）；
         桌面 disabled 保持原 DOM 位置的原位下拉。 -->
    <Teleport to="body" :disabled="!isNarrowViewport">
      <div v-if="open" class="learning-select-layer">
        <div
          ref="menuRef"
          :id="listboxId"
          class="learning-select-menu"
          :class="{ sheet: isNarrowViewport }"
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
            <button
              v-if="group.label"
              type="button"
              class="learning-select-group-label"
              :aria-expanded="!collapsedGroups.has(group.label)"
              :aria-label="`折叠/展开分组 ${group.label}`"
              @click.stop="toggleGroup(group.label)"
            >
              <span>{{ group.label }}</span>
              <small>{{ groupCount(group.label) }}</small>
              <ChevronDown :size="13" :class="{ open: !collapsedGroups.has(group.label) }" aria-hidden="true" />
            </button>
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
    </Teleport>
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
/* 分组标题 = 折叠按钮（触摸目标 ≥44px）；sticky 吸顶保持 */
.learning-select-group-label {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 6px 9px;
  border: 0;
  border-radius: 7px;
  background: var(--learning-select-bg, var(--color-bg-elevated, #fff));
  color: var(--learning-select-muted, var(--color-text-tertiary, #6e787d));
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.learning-select-group-label small { color: var(--learning-select-muted, #a5adb2); font-weight: 600; }
.learning-select-group-label svg { margin-left: auto; color: inherit; transition: transform .15s ease; }
.learning-select-group-label svg.open { transform: rotate(180deg); }
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
/* ★ 窄屏弹层：fixed inset 0 遮罩 + 底部弹层（Teleport 直挂 body，脱离
   .main-content 层叠上下文；z-index 3000 与沉浸台同口径，盖过 TabBar(100)） */
.learning-select-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--color-text, #17211e) 35%, transparent);
}
.learning-select-menu.sheet {
  position: static;
  width: 100%;
  max-height: min(62vh, 540px);
  border-radius: 14px;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, .28);
}
@media (max-width: 900px) {
  .learning-select-menu { max-width: calc(100vw - 24px); }
}
</style>
