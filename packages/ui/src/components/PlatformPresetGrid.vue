<template>
  <div class="preset-grid-wrap">
    <div class="preset-grid-head">
      <span class="preset-grid-title">快速添加厂商</span>
      <span class="preset-grid-hint">点厂商卡 → 填 Key 即用；没找到？用右侧「自定义模型」</span>
    </div>
    <div class="preset-grid">
      <div
        v-for="p in catalog"
        :key="p.key"
        class="preset-card"
        :class="{ 'is-added': p.added }"
        :title="p.note || p.name"
        @click="onPick(p)"
      >
        <div class="preset-icon" :style="{ background: p.brandColor }">{{ p.iconText }}</div>
        <div class="preset-info">
          <div class="preset-name">{{ p.name }}</div>
          <div class="preset-note">{{ p.added ? (p.platformName || '已添加') : (p.note || p.baseUrl) }}</div>
        </div>
        <span v-if="p.added" class="preset-added-tag">已添加</span>
        <el-icon v-else class="preset-plus"><Plus /></el-icon>
      </div>
      <!-- 自定义模型：一步式（方案 §2.4） -->
      <div class="preset-card is-custom" @click="emit('custom')">
        <div class="preset-icon is-custom-icon"><el-icon><MagicStick /></el-icon></div>
        <div class="preset-info">
          <div class="preset-name">自定义模型</div>
          <div class="preset-note">中转站 / 私有部署 / 任意 OpenAI 兼容端点，一步创建</div>
        </div>
        <el-icon class="preset-plus"><Plus /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, MagicStick } from '@element-plus/icons-vue';
import type { ModelProviderPreset } from '@yan-zhi/shared';
import { api } from '../api/client';

/**
 * 内置厂商宫格（2026-10-17 方案 §2.3）。
 *
 * ★ 目录是「可添加清单」而非「已有平台」：已添加的厂商卡显示状态、点击直接进详情；
 *   未添加的点击弹「添加 {厂商}」（预填 baseUrl/协议，填 Key 才真建平台）。
 * ★ 窄屏 1 列：网格用 auto-fill + minmax，桌面 2 列、窄屏自然折行（ADAPTATION-NOTES 已知坑）。
 */

export interface CatalogItem extends ModelProviderPreset {
  added: boolean;
  platformId: string | null;
  platformName: string | null;
}

const emit = defineEmits<{
  /** 点了未添加的厂商 → 父组件弹「添加 {厂商}」对话框 */
  pick: [item: CatalogItem];
  /** 点了已添加的厂商 → 直接进平台详情 */
  open: [platformId: string];
  /** 点了「自定义模型」 */
  custom: [];
}>();

const catalog = ref<CatalogItem[]>([]);

async function load() {
  try {
    const r = await api.get<any>('/platforms/catalog');
    catalog.value = ('data' in r ? r.data : r) as CatalogItem[];
  } catch {
    catalog.value = []; // 目录拉不到（旧后端）⇒ 宫格空着，不挡新增平台的老入口
  }
}

function onPick(p: CatalogItem) {
  if (p.added && p.platformId) emit('open', p.platformId);
  else emit('pick', p);
}

/** 添加/删除平台后由父组件触发刷新（已添加态变化） */
async function refresh() {
  await load();
}

onMounted(load);
defineExpose({ refresh });
</script>

<style scoped>
.preset-grid-wrap { margin-bottom: 14px; }
.preset-grid-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.preset-grid-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary, #fff); }
.preset-grid-hint { font-size: 12px; color: var(--el-text-color-secondary, #909399); }
.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
/* 窄屏 1 列（ADAPTATION-NOTES：宫格在窄屏挤 2 列 = 文字截断） */
@media (max-width: 700px) {
  .preset-grid { grid-template-columns: 1fr; }
}
.preset-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.12));
  border-radius: 12px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
  cursor: pointer;
  transition: border-color .15s, transform .15s;
  min-width: 0;
}
.preset-card:hover { border-color: var(--el-color-primary); transform: translateY(-1px); }
.preset-card.is-added { opacity: 0.85; }
.preset-card.is-custom { border-style: dashed; }
.preset-icon {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px;
  color: #fff; font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.preset-icon.is-custom-icon { background: var(--el-color-primary); }
.preset-info { flex: 1; min-width: 0; }
.preset-name { font-size: 13px; font-weight: 500; color: var(--el-text-color-primary, #fff); }
.preset-note {
  font-size: 11px; color: var(--el-text-color-secondary, #909399);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-added-tag {
  flex-shrink: 0; font-size: 11px; padding: 2px 8px; border-radius: 8px;
  color: var(--el-color-success); border: 1px solid var(--el-color-success-light-5);
}
.preset-plus { flex-shrink: 0; color: var(--el-text-color-secondary, #909399); }
</style>
