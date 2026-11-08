<script setup lang="ts">
/**
 * 学习模式 · 形象舞台（P0-5）
 *
 * 复用宠物双渲染（Pet2D 精灵包 / Pet3D+VRM），渲染器与形象沿用宠物设置（usePetStore）——
 * 用户在宠物设置里选的形象直接出现在学习页，不另造一套选择器。
 * 挂载/VRM 加载逻辑照 PetWindow.vue 的既有实现收窄（同源 localStorage / dev fetch /vrm）。
 *
 * 教学事件驱动：父组件通过 ref 调 play('hop'|'wave'|'look'|'pet'|'spin'|'nap')，
 * 动作是瞬态覆盖层（到时回落 idle），不影响任务状态语义。
 */
import { computed, onMounted, ref, watch } from 'vue'
import Pet2D from '../pet/Pet2D.vue'
import Pet3D from '../pet/Pet3D.vue'
import {
  usePetStore,
  PET_DEFAULTS,
  builtinVrmOf,
  type PetSettings,
  type PetState,
} from '../../stores/pet'

const store = usePetStore()
store.init()
const settings = ref<PetSettings>({ ...PET_DEFAULTS, ...store.settings })

const state = ref<PetState>('idle')
const action = ref<string | null>(null)
const renderActive = ref(true)
const renderVisible = ref(true)
const walking = ref(false)
const facingLeft = ref(false)
const effectiveScale = computed(() => settings.value.scale || 1)

/* ===== 3D/VRM（照 PetWindow 收窄：web/dev 走 /vrm/ 静态，桌面走主进程 IPC） ===== */
const vrmBuffer = ref<ArrayBuffer | null>(null)
const vrmLoadState = ref<'none' | 'loading' | 'ready' | 'error'>('none')
const useVrm3d = computed(
  () => settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'error'
)
const show2d = computed(
  () =>
    settings.value.renderer === '2d' ||
    (settings.value.renderer === '3d' && settings.value.vrmMode !== 'off' && vrmLoadState.value !== 'ready')
)
const bodyStyle = computed(() => {
  if (settings.value.renderer !== '3d') return {}
  const s = effectiveScale.value || 1
  return { width: Math.round(190 * s) + 'px', height: Math.round(280 * s) + 'px' }
})

function toArrayBuffer(data: any): ArrayBuffer | null {
  if (!data) return null
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  }
  return null
}
const desktopApi = () => (window as any).electronAPI?.pet
async function loadBuiltinVrm(): Promise<ArrayBuffer | null> {
  const one = builtinVrmOf(settings.value.vrmBuiltin)
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/vrm/' + one.file)
      if (r.ok) return await r.arrayBuffer()
    } catch { /* dev 拿不到就退回主进程读 */ }
  }
  const r = await desktopApi()?.readBuiltinVrm?.(one.id)
  return r && r.ok ? toArrayBuffer(r.data) : null
}
let vrmSeq = 0
async function refreshVrm() {
  const seq = ++vrmSeq
  vrmLoadState.value = 'none'
  if (settings.value.renderer !== '3d' || settings.value.vrmMode === 'off') {
    vrmBuffer.value = null
    return
  }
  try {
    let buf: ArrayBuffer | null = null
    if (settings.value.vrmMode === 'custom' && settings.value.vrmPath) {
      const r = await desktopApi()?.readVrm?.(settings.value.vrmPath)
      buf = r && r.ok ? toArrayBuffer(r.data) : null
    } else if (settings.value.vrmMode === 'builtin') {
      buf = await loadBuiltinVrm()
    }
    if (seq !== vrmSeq) return
    vrmBuffer.value = buf
    vrmLoadState.value = buf ? 'ready' : 'error'
  } catch {
    if (seq === vrmSeq) vrmLoadState.value = 'error'
  }
}
watch(
  () => [settings.value.renderer, settings.value.vrmMode, settings.value.vrmPath, settings.value.vrmBuiltin],
  () => refreshVrm(),
)
onMounted(refreshVrm)

/* ===== 动作（瞬态覆盖层，时长对齐 PetWindow 的 ACT_DUR） ===== */
const ACT_DUR: Record<string, number> = { pet: 2300, wave: 2400, look: 2600, nap: 3000, spin: 1100, hop: 900 }
let actionTimer = 0
function play(key: string) {
  if (!ACT_DUR[key]) return
  action.value = null
  requestAnimationFrame(() => (action.value = key))
  window.clearTimeout(actionTimer)
  actionTimer = window.setTimeout(() => (action.value = null), ACT_DUR[key])
}

defineExpose({ play })
</script>

<template>
  <div class="learn-stage">
    <div class="stage-body" :style="bodyStyle">
      <Pet2D
        v-if="show2d"
        :state="state"
        :action="action"
        :pack="settings.pack"
        :scale="effectiveScale"
        :walking="walking"
        :flip="facingLeft"
        :active="renderActive"
        :visible="renderVisible"
      />
      <Pet3D
        v-if="useVrm3d"
        :state="state"
        :action="action"
        :scale="effectiveScale"
        :walking="walking"
        :flip="facingLeft"
        :active="renderActive"
        :visible="renderVisible"
        :vrm-buffer="vrmBuffer"
        @vrm-state="(s: 'none' | 'loading' | 'ready' | 'error') => (vrmLoadState = s)"
      />
    </div>
  </div>
</template>

<style scoped>
.learn-stage {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 160px;
  border-radius: 10px;
  background: linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%);
  border: 1px solid #e5e6eb;
  overflow: hidden;
}
.stage-body { position: relative; }
</style>
