<template>
  <div class="live-performer" :data-renderer="renderer">
    <Pet2D
      v-if="renderer === '2d'"
      :state="state"
      :action="action"
      :pack="pack"
      :scale="scale"
      :active="active"
      :visible="visible"
      :walking="false"
      :flip="false"
    />
    <Pet3D
      v-else
      :state="state"
      :action="action"
      :scale="scale"
      :active="active"
      :visible="visible"
      :walking="false"
      :flip="false"
      :vrm-buffer="null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 直播页的宠物主体。
 *
 * 只是把 Pet2D / Pet3D 的既有 props 包一层，**不改宠物内部**：
 * 桌宠窗那套拖拽、踱步、弹层、IPC 全都不带过来，直播页只要"能按状态动"。
 * 换成虚拟人时新增同接口的 AvatarPerformer 即可，页面不用动。
 */
import Pet2D from '../pet/Pet2D.vue'
import Pet3D from '../pet/Pet3D.vue'
import type { PetState } from '../../stores/pet'

withDefaults(
  defineProps<{
    state: PetState
    action?: string | null
    pack?: string
    renderer?: '2d' | '3d'
    scale?: number
    active?: boolean
    visible?: boolean
  }>(),
  { action: null, pack: 'boba', renderer: '2d', scale: 1, active: true, visible: true }
)
</script>

<style scoped>
.live-performer {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
