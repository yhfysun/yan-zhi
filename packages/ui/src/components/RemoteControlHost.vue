<template>
  <!-- 被控端伴生组件：确认弹窗（Web UI 即被控端确认面） -->
  <el-dialog
    v-model="promptVisible"
    class="compact-dialog"
    title="远程控制请求"
    width="360px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="rcp-body">
      <div class="rcp-device">{{ pendingDevice }}</div>
      <div class="rcp-tip">请求远程观看并操作本机。拒绝将直接断开；允许后可在设置 → 远程控制查看会话记录。</div>
      <div v-if="displays.length > 1" class="rcp-disp">
        <div class="rcp-label">采集显示器（控制端看到哪块屏）</div>
        <select v-model="captureDisplayId" class="rcp-select">
          <option v-for="d in displays" :key="d.id" :value="d.id">
            {{ (d.primary ? '主显示器 · ' : '') + d.label }}（{{ d.w }}×{{ d.h }}）
          </option>
        </select>
      </div>
      <el-checkbox v-model="trustDevice">信任此设备，之后免确认直连</el-checkbox>
      <el-checkbox v-model="viewOnly">仅观看（不授予操作本机的权限）</el-checkbox>
    </div>
    <template #footer>
      <el-button @click="decide(false)">拒绝</el-button>
      <el-button type="primary" @click="decide(true)">允许</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 被控端确认弹窗（阶段 1 第 3 步起只剩 UI）。
 *
 * 信令、host WS、屏幕采集与 WebRTC 全部搬到不可见的采集窗口
 * （composables/useRcHostSignaling.ts），主窗口只在收到 rc:need-confirm 时弹框，
 * 用户答完把结果回传。这样主窗口被遮挡也不会影响画面输出。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { RcConfirmRequest, RcConfirmResult, RcDisplayInfo } from '../composables/useRcHostSignaling';

interface RcUiBridge {
  onRcNeedConfirm?: (cb: (payload: { id: number; req: RcConfirmRequest }) => void) => () => void;
  rcConfirmResult?: (id: number, result: RcConfirmResult) => Promise<unknown>;
}

const bridge = (): RcUiBridge | null =>
  (window as unknown as { electronAPI?: RcUiBridge }).electronAPI || null;

const promptVisible = ref(false);
const pendingDevice = ref('');
const trustDevice = ref(true);
/** 仅观看：允许看画面但不注入输入（会话级，控制端可再请求升级） */
const viewOnly = ref(false);
const displays = ref<RcDisplayInfo[]>([]);
const captureDisplayId = ref('');

/** 当前待回答的确认请求；0 = 没有 */
let confirmSeq = 0;
let offNeedConfirm: (() => void) | null = null;

onMounted(() => {
  offNeedConfirm = bridge()?.onRcNeedConfirm?.(({ id, req }) => {
    confirmSeq = id;
    pendingDevice.value = String(req?.device || '未命名设备');
    displays.value = Array.isArray(req?.displays) ? req.displays : [];
    captureDisplayId.value = String(req?.defaultDisplayId || '');
    trustDevice.value = true;
    viewOnly.value = false;
    promptVisible.value = true;
  }) || null;
});
onBeforeUnmount(() => {
  offNeedConfirm?.();
  offNeedConfirm = null;
});

async function decide(allow: boolean): Promise<void> {
  promptVisible.value = false;
  const id = confirmSeq;
  confirmSeq = 0;
  if (!id) return;
  const result: RcConfirmResult = allow
    ? {
      allow: true,
      trust: trustDevice.value,
      readOnly: allow && viewOnly.value,
      displayId: captureDisplayId.value,
    }
    : { allow: false };
  await bridge()?.rcConfirmResult?.(id, result);
}
</script>
