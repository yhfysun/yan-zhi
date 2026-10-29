<template>
  <div class="pack-picker">
    <button
      v-for="p in items"
      :key="p.id"
      type="button"
      class="chr"
      :class="{ on: p.id === modelValue }"
      :title="p.label"
      @click="$emit('select', p.id)"
    >
      <span class="chr-pack" :style="thumbStyle(p)" />
      <span class="chr-name">{{ p.short }}</span>
      <span v-if="p.user" class="chr-del" title="删除这个形象" @click.stop="remove(p.id)">×</span>
    </button>
    <button type="button" class="chr chr-add" title="导入 GIF / 图片 / 精灵图集" @click="$emit('import')">
      <span class="chr-plus">＋</span>
      <span class="chr-name">导入</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 形象托盘（对齐原型 pet-companion-proto.html 的 .char-tray）
 *
 * 每格显示精灵图第一帧的缩略图 + 名字，当前形象描橙色边；用户导入的形象
 * 右上角带 × 可删。最后一格「＋ 导入」是形象工坊入口。
 */
import { computed } from 'vue'
import { PET_PACK_URLS, PET_PACKS } from './pet-assets'
import { userPacks, deleteUserPack } from './user-packs'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ select: [string]; import: []; removed: [string] }>()

interface Tile {
  id: string
  label: string
  short: string
  url: string
  fw: number
  fh: number
  cols: number
  rows: number
  user?: boolean
}

const items = computed<Tile[]>(() => {
  const builtin = PET_PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    short: p.label.replace(/（.*?）|\(.*?\)/g, ''),
    url: PET_PACK_URLS[p.id],
    fw: 192,
    fh: 208,
    cols: 8,
    rows: 9,
  }))
  const mine = Object.values(userPacks).map((e) => ({
    id: e.manifest.id,
    label: e.manifest.label,
    short: e.manifest.label,
    url: e.url,
    fw: e.manifest.frameWidth,
    fh: e.manifest.frameHeight,
    cols: e.manifest.cols || e.manifest.frames || 1,
    rows: e.manifest.rows || 1,
    user: true,
  }))
  return [...builtin, ...mine]
})

/** 缩略图：按 42px 帧宽缩放整张图集，只露第一帧 */
function thumbStyle(p: Tile) {
  const sc = 42 / Math.max(1, p.fw)
  return {
    backgroundImage: `url(${p.url})`,
    backgroundSize: `${(p.fw * p.cols * sc).toFixed(1)}px ${(p.fh * p.rows * sc).toFixed(1)}px`,
    backgroundPosition: '0 0',
    width: (p.fw * sc).toFixed(1) + 'px',
    height: (p.fh * sc).toFixed(1) + 'px',
  }
}

async function remove(id: string) {
  await deleteUserPack(id)
  emit('removed', id)
}
</script>

<style scoped>
.pack-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 7px 9px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
}
.chr {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 58px;
  padding: 7px 0 5px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  color: inherit;
}
.chr:hover {
  background: var(--el-fill-color);
  border-color: var(--el-border-color);
}
.chr.on {
  border-color: #e8734a;
  background: rgba(232, 115, 74, 0.1);
}
.chr-pack {
  background-repeat: no-repeat;
  image-rendering: auto;
  pointer-events: none;
}
.chr-name {
  max-width: 54px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}
.chr.on .chr-name {
  color: #d8643c;
  font-weight: 600;
}
.chr-del {
  position: absolute;
  top: 1px;
  right: 3px;
  width: 14px;
  height: 14px;
  line-height: 12px;
  border-radius: 50%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color-overlay);
  opacity: 0;
}
.chr:hover .chr-del {
  opacity: 1;
}
.chr-del:hover {
  color: #fff;
  background: #c0392b;
}
.chr-add {
  justify-content: center;
  border-style: dashed;
  border-color: var(--el-border-color);
}
.chr-plus {
  font-size: 20px;
  line-height: 28px;
  color: var(--el-text-color-secondary);
}
.chr-add:hover .chr-plus,
.chr-add:hover .chr-name {
  color: #d8643c;
}
</style>
