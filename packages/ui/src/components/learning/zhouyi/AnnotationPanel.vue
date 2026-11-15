<script setup lang="ts">
// 注释抽屉（交互宪法 §2：注解走右侧抽屉，不用行内折叠/accordion）。
// 通用条目渲染：label + tag 徽标 + value；衬线字体、极简浅色卡片、显式关闭按钮。
// 按需出现：由父组件在点词时挂载（v-if 门控），不常驻阅读区。
import { X } from 'lucide-vue-next';

defineProps<{
  visible: boolean;
  title: string;
  items: Array<{ label: string; value: string; tag?: string }>;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside v-if="visible" class="zy-panel" role="dialog" aria-label="注释">
    <header class="zy-panel-head">
      <b class="zy-panel-title">{{ title }}</b>
      <button type="button" class="zy-panel-close" aria-label="关闭注释" @click="emit('close')"><X :size="14" /></button>
    </header>
    <ul class="zy-panel-items">
      <li v-for="(it, i) in items" :key="i" class="zy-panel-item">
        <div class="zy-panel-item-head">
          <span class="zy-panel-label">{{ it.label }}</span>
          <span v-if="it.tag" class="zy-panel-tag">{{ it.tag }}</span>
        </div>
        <p class="zy-panel-value">{{ it.value }}</p>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.zy-panel {
  position: fixed;
  right: 20px;
  top: 68px;
  bottom: 72px;
  z-index: 3100;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
  overflow-y: auto;
  border: 1px solid rgba(44, 42, 38, .12);
  border-radius: 8px;
  background: #ffffff;
  color: #2c2a26;
  padding: 14px 16px;
  box-shadow: 0 12px 36px rgba(10, 14, 18, .18);
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif;
}
.zy-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.zy-panel-title {
  overflow: hidden;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zy-panel-close {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(44, 42, 38, .18);
  border-radius: 6px;
  background: #ffffff;
  color: #6f6a60;
  cursor: pointer;
}
.zy-panel-close:hover { border-color: rgba(138, 106, 63, .55); color: #2c2a26; }
.zy-panel-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.zy-panel-item-head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.zy-panel-label {
  color: #8a6a3f;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
}
.zy-panel-tag {
  border: 1px solid rgba(138, 106, 63, .4);
  border-radius: 999px;
  color: #8a6a3f;
  font-size: 9px;
  padding: 1px 7px;
  white-space: nowrap;
}
.zy-panel-value {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.75;
}
@media (max-width: 900px) {
  .zy-panel {
    top: auto;
    right: 16px;
    left: 16px;
    bottom: 70px;
    width: auto;
    max-height: 45vh;
  }
}
</style>
