<template>
  <el-dialog
    :model-value="modelValue"
    title="导入形象"
    width="600px"
    append-to-body
    @update:model-value="onVisible"
    @closed="reset"
  >
    <div class="pet-import">
      <div v-if="!fileName" class="pi-empty">
        <el-button type="primary" @click="pick">选择 GIF / 图片 / 图集</el-button>
        <p class="pi-hint">
          GIF 逐帧导入并循环播放；PNG / WebP / JPEG 可当单张形象，也可按网格切成动作行。
          文件只存在本机（userData/pet-packs），不随包分发。
        </p>
      </div>

      <template v-else>
        <div class="pi-top">
          <div class="pi-preview">
            <img v-if="isGif && gifUrl" :src="gifUrl" class="pi-gif" alt="" />
            <canvas v-else ref="sheetEl" class="pi-canvas" width="300" height="210" />
          </div>
          <div class="pi-meta">
            <div class="pi-file" :title="fileName">{{ fileName }}</div>
            <div class="pi-dim">{{ info?.width }} × {{ info?.height }} px</div>
            <div v-if="isGif" class="pi-dim">GIF · {{ info?.frameCount }} 帧 · {{ info?.fps }} fps</div>
            <el-radio-group v-else v-model="mode" size="small">
              <el-radio-button label="auto">单张形象</el-radio-button>
              <el-radio-button label="atlas">精灵图集</el-radio-button>
            </el-radio-group>
            <template v-if="isAtlas">
              <div class="pi-field">
                <span class="pi-label">列 × 行</span>
                <el-input-number v-model="cols" :min="1" :max="32" size="small" controls-position="right" />
                <el-input-number v-model="rows" :min="1" :max="9" size="small" controls-position="right" />
              </div>
              <div class="pi-field">
                <span class="pi-label">帧率</span>
                <el-input-number v-model="fps" :min="2" :max="24" size="small" controls-position="right" />
              </div>
            </template>
            <el-button size="small" text @click="pick">换一张</el-button>
          </div>
        </div>

        <p v-if="isGif" class="pi-note">整段动画会作为待机循环，所有任务状态共用这一段。</p>

        <template v-else-if="isAtlas">
          <p v-if="plan.errors.length" class="pi-err">{{ plan.errors[0] }}</p>
          <template v-else>
            <div class="pi-rows-head">
              <span>动作行</span>
              <span class="pi-sub">{{ plan.cols }} 列 × {{ plan.rows }} 行 · 单帧 {{ plan.frameWidth }} × {{ plan.frameHeight }} px</span>
              <canvas ref="animEl" class="pi-anim" width="72" height="72" />
            </div>
            <div class="pi-rows">
              <button
                v-for="row in rowInfo"
                :key="row.index"
                type="button"
                class="pi-row"
                :class="{ active: previewRow === row.index, empty: row.empty }"
                @click="previewRow = row.index"
              >
                <span class="pi-row-i">第 {{ row.index + 1 }} 行</span>
                <span class="pi-row-name">{{ row.label }}</span>
                <span class="pi-row-n">{{ row.empty ? '整行透明，将不使用' : row.frames + ' 帧' }}</span>
              </button>
            </div>
            <p v-for="w in plan.warnings" :key="w" class="pi-warn">{{ w }}</p>
          </template>
        </template>

        <div class="pi-name">
          <span class="pi-label">名字</span>
          <el-input v-model="label" size="small" maxlength="24" show-word-limit style="width: 200px" />
          <span v-if="!isGif && !isAtlas" class="pi-sub">整张图作为一帧静止形象</span>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="onVisible(false)">取消</el-button>
      <el-button type="primary" :loading="busy" :disabled="!canImport" @click="submit">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 形象工坊 · 导入对话框
 *
 * 三种输入：GIF（逐帧平铺）、单张静图（一帧）、精灵图集（cols×rows 网格）。
 * 图集在这里做三类校验：尺寸能否整除、帧是否太小、每行是否整行透明；
 * 行顺序按社区标准 9 态（待机/踱步/跑动/完成/等你输入/出错/暂停）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  STATE_ROW_LABELS,
  STATE_ROW_ORDER,
  inspectBytes,
  planAtlas,
  suggestCols,
  type AtlasPlan,
} from './import-pack'
import { importUserPack } from './user-packs'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; imported: [string] }>()

interface ImageInfo {
  type: string
  width: number
  height: number
  frameCount: number
  fps: number
}

const fileName = ref('')
const label = ref('')
const bytes = ref<ArrayBuffer | null>(null)
const info = ref<ImageInfo | null>(null)
const gifUrl = ref('')
const mode = ref<'auto' | 'atlas'>('auto')
const cols = ref(1)
const rows = ref(1)
const fps = ref(6)
const busy = ref(false)
const previewRow = ref(0)
const emptyRows = ref<boolean[]>([])
const sheetEl = ref<HTMLCanvasElement | null>(null)
const animEl = ref<HTMLCanvasElement | null>(null)

let bitmap: ImageBitmap | null = null
let frameIndex = 0
let animTimer = 0
let gifObjectUrl = ''

const isGif = computed(() => info.value?.type === 'image/gif')
const isAtlas = computed(() => !isGif.value && mode.value === 'atlas')
const plan = computed<AtlasPlan>(() =>
  planAtlas(info.value?.width || 0, info.value?.height || 0, cols.value, rows.value, fps.value)
)
const rowInfo = computed(() =>
  Array.from({ length: plan.value.rows }, (_, i) => ({
    index: i,
    label: STATE_ROW_LABELS[STATE_ROW_ORDER[i] as keyof typeof STATE_ROW_LABELS] || '备用',
    frames: plan.value.cols,
    empty: !!emptyRows.value[i],
  }))
)
const canImport = computed(() => {
  if (!bytes.value || !label.value.trim()) return false
  if (isGif.value || mode.value === 'auto') return true
  return plan.value.ok
})

function pick() {
  const el = document.createElement('input')
  el.type = 'file'
  el.accept = 'image/gif,image/png,image/webp,image/jpeg'
  el.onchange = () => {
    const f = el.files?.[0]
    if (f) void loadFile(f)
  }
  el.click()
}

async function loadFile(file: File) {
  try {
    revoke()
    fileName.value = file.name
    label.value = file.name.replace(/\.[^.]+$/, '').slice(0, 24)
    bytes.value = await file.arrayBuffer()
    info.value = await inspectBytes(bytes.value)
    const isSheetName = /sheet|atlas|sprite/i.test(file.name)
    mode.value = info.value.type === 'image/gif' ? 'auto' : isSheetName ? 'atlas' : 'auto'
    cols.value = info.value.type === 'image/gif' ? info.value.frameCount : suggestCols(info.value.width, info.value.height)
    rows.value = 1
    fps.value = info.value.type === 'image/gif' ? info.value.fps : 6
    previewRow.value = 0
    emptyRows.value = []
    if (info.value.type === 'image/gif') {
      gifObjectUrl = URL.createObjectURL(file)
      gifUrl.value = gifObjectUrl
      return
    }
    bitmap = await createImageBitmap(new Blob([bytes.value], { type: info.value.type }))
    await nextTick()
    drawSheet()
    emptyRows.value = scanEmptyRows()
    startAnim()
  } catch (err: any) {
    ElMessage.error(err?.message || '读取图片失败')
    reset()
  }
}

/** 整张图按比例画进预览框，并画出网格；当前动作行高亮 */
function drawSheet() {
  const c = sheetEl.value
  if (!c || !bitmap || !info.value) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const W = c.width
  const H = c.height
  ctx.clearRect(0, 0, W, H)
  const s = Math.min(W / info.value.width, H / info.value.height)
  const dw = info.value.width * s
  const dh = info.value.height * s
  const dx = (W - dw) / 2
  const dy = (H - dh) / 2
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bitmap, dx, dy, dw, dh)
  if (!isAtlas.value) return
  const { cols: cN, rows: rN } = plan.value
  if (!cN || !rN) return
  const cw = dw / cN
  const ch = dh / rN
  ctx.strokeStyle = 'rgba(90, 160, 255, 0.55)'
  ctx.lineWidth = 1
  for (let i = 1; i < cN; i++) {
    ctx.beginPath()
    ctx.moveTo(dx + i * cw, dy)
    ctx.lineTo(dx + i * cw, dy + dh)
    ctx.stroke()
  }
  for (let j = 1; j < rN; j++) {
    ctx.beginPath()
    ctx.moveTo(dx, dy + j * ch)
    ctx.lineTo(dx + dw, dy + j * ch)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255, 176, 32, 0.95)'
  ctx.lineWidth = 2
  ctx.strokeRect(dx, dy + previewRow.value * ch + 1, dw, ch - 2)
}

/** 每行抽 1/4 分辨率扫 alpha：整行透明 = 图集里的占位行 */
function scanEmptyRows(): boolean[] {
  if (!bitmap || !info.value || !plan.value.ok) return []
  const c = document.createElement('canvas')
  const scale = 0.25
  c.width = Math.max(1, Math.round(info.value.width * scale))
  c.height = Math.max(1, Math.round(info.value.height * scale))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  const rowH = c.height / plan.value.rows
  return Array.from({ length: plan.value.rows }, (_, r) => {
    const y0 = Math.floor(r * rowH)
    const y1 = Math.min(c.height, Math.floor((r + 1) * rowH))
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 8) return false
      }
    }
    return true
  })
}

/** 预览当前行的动画（图集才需要；GIF 用 <img> 自己动） */
function startAnim() {
  stopAnim()
  frameIndex = 0
  const step = () => {
    drawAnim()
    frameIndex = (frameIndex + 1) % Math.max(1, plan.value.cols)
  }
  step()
  if (isAtlas.value) animTimer = window.setInterval(step, Math.max(60, 1000 / Math.max(2, fps.value)))
}
function stopAnim() {
  if (animTimer) window.clearInterval(animTimer)
  animTimer = 0
}

/** 选中行的逐帧试播（72×72，等比缩放居中） */
function drawAnim() {
  const c = animEl.value
  if (!c || !bitmap || !plan.value.ok) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  const { frameWidth: fw, frameHeight: fh, cols: cN } = plan.value
  const s = Math.min(c.width / fw, c.height / fh)
  const dw = fw * s
  const dh = fh * s
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bitmap, frameIndex * fw, previewRow.value * fh, fw, fh, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
}

function revoke() {
  if (gifObjectUrl) {
    try {
      URL.revokeObjectURL(gifObjectUrl)
    } catch {
      /* 忽略 */
    }
    gifObjectUrl = ''
  }
  gifUrl.value = ''
  bitmap?.close?.()
  bitmap = null
}

function reset() {
  stopAnim()
  revoke()
  bytes.value = null
  fileName.value = ''
  label.value = ''
  info.value = null
  mode.value = 'auto'
  cols.value = 1
  rows.value = 1
  fps.value = 6
  previewRow.value = 0
  emptyRows.value = []
  busy.value = false
}

function onVisible(v: boolean) {
  emit('update:modelValue', v)
}

async function submit() {
  if (!bytes.value) return
  busy.value = true
  try {
    const opts = isAtlas.value
      ? { mode: 'atlas' as const, cols: cols.value, rows: rows.value, fps: fps.value }
      : {}
    const id = await importUserPack(bytes.value, label.value.trim() || '自定义形象', opts)
    ElMessage.success('形象已导入')
    emit('imported', id)
    onVisible(false)
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败')
  } finally {
    busy.value = false
  }
}

watch([plan, previewRow], () => {
  if (!isAtlas.value) return
  emptyRows.value = scanEmptyRows()
  drawSheet()
  void nextTick(drawAnim)
})
watch(isAtlas, (on) => {
  if (on) {
    void nextTick(startAnim)
  } else {
    stopAnim()
    void nextTick(drawSheet)
  }
})

onBeforeUnmount(reset)
</script>

<style scoped>
.pi-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
}
.pi-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.pi-top {
  display: flex;
  gap: 16px;
}
.pi-preview {
  flex: 0 0 300px;
  height: 210px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: repeating-conic-gradient(#2a2a2a 0 25%, #333 0 50%) 0 0 / 16px 16px;
  overflow: hidden;
}
.pi-canvas,
.pi-gif {
  max-width: 100%;
  max-height: 100%;
}
.pi-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.pi-file {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.pi-dim {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pi-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pi-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.pi-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pi-err {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
.pi-warn {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-color-warning);
}
.pi-rows-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
}
.pi-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pi-anim {
  margin-left: auto;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  background: repeating-conic-gradient(#2a2a2a 0 25%, #333 0 50%) 0 0 / 12px 12px;
}
.pi-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  max-height: 168px;
  overflow-y: auto;
}
.pi-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  font-size: 12px;
  text-align: left;
  color: inherit;
  background: var(--el-fill-color-lighter);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.pi-row.active {
  border-color: var(--el-color-primary);
}
.pi-row.empty {
  opacity: 0.55;
}
.pi-row-i {
  width: 56px;
  color: var(--el-text-color-secondary);
}
.pi-row-name {
  width: 76px;
}
.pi-row-n {
  color: var(--el-text-color-secondary);
}
.pi-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
</style>
