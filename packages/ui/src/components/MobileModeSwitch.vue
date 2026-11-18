<template>
  <button
    class="mode-pill"
    type="button"
    :aria-label="`当前模式：${currentLabel}，点击切换`"
    :aria-expanded="open"
    aria-haspopup="dialog"
    @click="open = true"
  >
    <el-icon :size="16"><component :is="currentIcon" /></el-icon>
    <span class="mode-pill-text">{{ currentShort }}</span>
  </button>

  <Teleport to="body">
    <Transition name="mode-sheet">
      <div v-if="open" class="mode-sheet-mask" @click.self="close">
        <section class="mode-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-mode-title">
          <header class="mode-sheet-head">
            <div>
              <span>工作模式</span>
              <h2 id="mobile-mode-title">选择当前工作区</h2>
            </div>
            <button type="button" class="mode-sheet-close" aria-label="关闭模式选择" @click="close">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>
          <div class="mode-sheet-list">
            <button
              v-for="(d, index) in visibleDefs"
              :key="d.key"
              :ref="index === 0 ? (el) => (firstOption = el as HTMLButtonElement | null) : undefined"
              type="button"
              class="mode-option"
              :class="{ active: d.key === currentMode }"
              :aria-current="d.key === currentMode ? 'page' : undefined"
              @click="onPick(d.key)"
            >
              <span class="mode-option-icon"><el-icon :size="19"><component :is="iconOf(d.icon)" /></el-icon></span>
              <span class="mode-option-copy">
                <strong>{{ d.label.replace(/模式$/, '') }}</strong>
                <small>{{ d.desc }}</small>
              </span>
              <el-icon v-if="d.key === currentMode" class="mode-option-check" :size="18"><Check /></el-icon>
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue';
import {
  ChatDotRound,
  Check,
  Close,
  Lock,
  Platform,
  Reading,
  Shop,
} from '@element-plus/icons-vue';
import { visibleModeDefs, activeMode, setMode, modeRoute } from '../stores/mode';

const visibleDefs = visibleModeDefs;
const currentMode = activeMode;
const open = ref(false);
const firstOption = ref<HTMLButtonElement | null>(null);
let previousBodyOverflow = '';

const ICONS: Record<string, Component> = {
  ChatDotRound,
  Platform,
  Lock,
  Shop,
  Reading,
};

function iconOf(name: string): Component {
  return ICONS[name] || ChatDotRound;
}

const currentDef = computed(
  () => visibleDefs.value.find((d) => d.key === currentMode.value),
);
const currentLabel = computed(() => currentDef.value?.label || '办公模式');
const currentShort = computed(() => currentLabel.value.replace(/模式$/, ''));
const currentIcon = computed(() => iconOf(currentDef.value?.icon || 'ChatDotRound'));

function close() {
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

watch(open, async (value) => {
  if (value) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    firstOption.value?.focus();
    return;
  }
  document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener('keydown', onKeydown);
});

function onPick(key: string | number | object) {
  const m = String(key);
  close();
  if (m === currentMode.value) return;
  setMode(m);
  void import('../router').then(({ default: router }) => {
    void router.push(modeRoute(m)).catch(() => { /* same-route navigation */ });
  });
}
</script>

<style scoped>
.mode-pill {
  display: inline-flex;
  height: 44px;
  min-height: 44px;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1;
}

.mode-pill:active {
  background: var(--color-surface-hover);
  transform: scale(0.98);
}

.mode-pill-text {
  max-width: 70px;
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 5200;
  display: flex;
  align-items: flex-end;
  padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  background: rgba(13, 18, 22, 0.42);
}

.mode-sheet {
  width: 100%;
  max-height: min(78dvh, calc(100dvh - 72px - env(safe-area-inset-bottom, 0px)), 680px);
  padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
  overflow: auto;
  border-radius: 24px 24px 0 0;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 -12px 36px rgba(17, 24, 39, 0.18);
}

.mode-sheet-head {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 6px 14px;
  background: var(--color-surface);
}

.mode-sheet-head::before {
  position: absolute;
  top: 7px;
  left: 50%;
  width: 36px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--color-border-strong);
  content: '';
}

.mode-sheet-head span {
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.mode-sheet-head h2 {
  margin: 3px 0 0;
  font-size: 20px;
  line-height: 1.25;
}

.mode-sheet-close {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.mode-sheet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-option {
  display: grid;
  width: 100%;
  min-height: 64px;
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}

.mode-option:active {
  background: var(--color-surface-hover);
}

.mode-option.active {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  background: var(--color-primary-soft);
}

.mode-option-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-primary);
}

.mode-option-copy {
  min-width: 0;
}

.mode-option-copy strong,
.mode-option-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-option-copy strong {
  font-size: 15px;
}

.mode-option-copy small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.mode-option-check {
  color: var(--color-primary);
}

.mode-sheet-enter-active,
.mode-sheet-leave-active {
  transition: opacity var(--motion-base) var(--ease-standard);
}

.mode-sheet-enter-active .mode-sheet,
.mode-sheet-leave-active .mode-sheet {
  transition: transform var(--motion-slow) var(--ease-entrance);
}

.mode-sheet-enter-from,
.mode-sheet-leave-to {
  opacity: 0;
}

.mode-sheet-enter-from .mode-sheet,
.mode-sheet-leave-to .mode-sheet {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .mode-sheet-enter-active,
  .mode-sheet-leave-active,
  .mode-sheet-enter-active .mode-sheet,
  .mode-sheet-leave-active .mode-sheet {
    transition-duration: 1ms;
  }
}
</style>
