<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, ChevronDown, UserRound } from 'lucide-vue-next';
import { usePetStore } from '../../stores/pet';
import { HAS_PET_ASSETS, PET_PACKS, PET_VRM_MODELS } from '../pet/pet-assets';
import { loadUserPacks, packAspectOf } from '../pet/user-packs';
import PetPackPicker from '../pet/PetPackPicker.vue';
import PetImportDialog from '../pet/PetImportDialog.vue';

const store = usePetStore();
store.init();

const root = ref<HTMLElement | null>(null);
const open = ref(false);
const mode = ref<'2d' | '3d'>(store.settings.renderer === '3d' ? '3d' : '2d');
const importOpen = ref(false);
const has2d = PET_PACKS.length > 0;
const has3d = PET_VRM_MODELS.length > 0;
const currentName = computed(() => {
  if (store.settings.renderer === '3d') {
    return PET_VRM_MODELS.find((item) => item.id === store.settings.vrmBuiltin)?.label || '3D 形象';
  }
  return PET_PACKS.find((item) => item.id === store.settings.pack)?.label || '2D 形象';
});

function toggle() {
  open.value = !open.value;
  if (open.value) mode.value = store.settings.renderer === '3d' ? '3d' : '2d';
}

function choosePack(id: string) {
  store.update({ renderer: '2d', pack: id, packAspect: packAspectOf(id) });
}

function chooseVrm(id: string) {
  store.update({ renderer: '3d', vrmMode: 'builtin', vrmBuiltin: id });
}

function onImported(id: string) {
  choosePack(id);
  open.value = false;
}

function onPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  void loadUserPacks();
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="HAS_PET_ASSETS" ref="root" class="learning-avatar-picker">
    <button
      type="button"
      class="lp-tool-button la-trigger"
      :aria-expanded="open"
      aria-controls="learning-avatar-menu"
      title="更换陪练形象"
      @click="toggle"
    >
      <UserRound :size="15" />
      换形象
      <ChevronDown :size="13" :class="{ open }" />
    </button>

    <section v-if="open" id="learning-avatar-menu" class="la-menu" aria-label="更换陪练形象">
      <header>
        <div>
          <b>陪练形象</b>
          <small>{{ currentName }}</small>
        </div>
        <div v-if="has2d && has3d" class="la-modes" role="tablist" aria-label="形象类型">
          <button type="button" role="tab" :aria-selected="mode === '2d'" :class="{ active: mode === '2d' }" @click="mode = '2d'">2D 精灵</button>
          <button type="button" role="tab" :aria-selected="mode === '3d'" :class="{ active: mode === '3d' }" @click="mode = '3d'">3D 模型</button>
        </div>
      </header>

      <PetPackPicker
        v-if="mode === '2d' && has2d"
        :model-value="store.settings.pack"
        @select="choosePack"
        @import="importOpen = true"
      />

      <div v-else-if="mode === '3d' && has3d" class="la-models">
        <button
          v-for="model in PET_VRM_MODELS"
          :key="model.id"
          type="button"
          :class="{ active: store.settings.renderer === '3d' && store.settings.vrmMode === 'builtin' && store.settings.vrmBuiltin === model.id }"
          @click="chooseVrm(model.id)"
        >
          <span class="la-model-orb"><UserRound :size="18" /></span>
          <span>{{ model.label }}</span>
          <Check
            v-if="store.settings.renderer === '3d' && store.settings.vrmMode === 'builtin' && store.settings.vrmBuiltin === model.id"
            :size="14"
          />
        </button>
      </div>

      <p v-else class="la-empty">当前安装包没有这类形象资源。</p>
      <footer>切换后立即应用；自定义 2D 形象可在「导入」中添加。</footer>
    </section>

    <PetImportDialog v-if="importOpen" v-model="importOpen" @imported="onImported" />
  </div>
</template>

<style scoped>
.learning-avatar-picker { position: relative; }
.la-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--glass-bg);
  color: var(--color-text-secondary);
  padding: 4px 9px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.la-trigger:hover,
.la-trigger[aria-expanded="true"] { border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border)); color: var(--color-primary); }
.lp-tool-button svg.open { transform: rotate(180deg); }
.la-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: min(390px, calc(100vw - 28px));
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  border-radius: 10px;
  background-color: var(--skin-popover-veil, var(--glass-bg-panel-sm, var(--color-bg-elevated)));
  background-image: var(--skin-menu-pattern, none);
  background-size: cover;
  background-position: center;
  box-shadow: 0 16px 40px color-mix(in srgb, #000 34%, transparent);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.la-menu > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.la-menu > header > div:first-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.la-menu b { color: var(--color-text); font-size: 13px; }
.la-menu small { color: var(--color-text-tertiary); font-size: 10px; }
.la-modes { display: inline-flex; padding: 2px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); }
.la-modes button { border: 0; border-radius: 5px; background: transparent; color: var(--color-text-secondary); padding: 4px 8px; font-size: 10px; cursor: pointer; }
.la-modes button.active { background: color-mix(in srgb, var(--color-primary) 16%, var(--glass-bg)); color: var(--color-primary); font-weight: 600; }
.la-models { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.la-models button { display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 8px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text); padding: 7px 8px; text-align: left; font-size: 11px; cursor: pointer; }
.la-models button:hover, .la-models button.active { border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg)); }
.la-model-orb { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: color-mix(in srgb, var(--color-primary) 14%, var(--glass-bg)); color: var(--color-primary); }
.la-empty { margin: 8px 0; color: var(--color-text-tertiary); font-size: 11px; }
.la-menu footer { margin-top: 9px; border-top: 1px solid var(--color-border); padding-top: 8px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
</style>
