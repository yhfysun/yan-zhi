<template>
  <aside class="pa-list" aria-label="页面资产列表">
    <div class="pa-list-head">
      <div class="pa-list-counts">
        <span><strong>{{ activeCount }}</strong> 已启用</span>
        <span><strong>{{ draftCount }}</strong> 草稿</span>
        <span><strong>{{ items.length }}</strong> 当前结果</span>
      </div>

      <div class="pa-search-row">
        <el-input
          :model-value="search"
          clearable
          placeholder="搜索名称、ID、能力…"
          :prefix-icon="Search"
          aria-label="搜索页面资产"
          @update:model-value="$emit('update:search', $event)"
          @keyup.enter="$emit('reload')"
        />
        <el-button :icon="RefreshCw" :loading="loading" aria-label="刷新页面资产" @click="$emit('reload')" />
      </div>

      <div class="pa-filter-row">
        <el-select
          :model-value="status"
          size="small"
          aria-label="按状态筛选"
          @update:model-value="$emit('update:status', $event)"
        >
          <el-option label="全部状态" value="" />
          <el-option label="已启用" value="active" />
          <el-option label="草稿" value="draft" />
          <el-option label="已停用" value="deprecated" />
        </el-select>
        <el-select
          :model-value="platform"
          size="small"
          aria-label="按平台筛选"
          @update:model-value="$emit('update:platform', $event)"
        >
          <el-option label="全部平台" value="" />
          <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
    </div>

    <div class="pa-list-scroll" role="list">
      <template v-if="loading && !items.length">
        <div v-for="index in 5" :key="index" class="pa-list-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </template>

      <el-empty
        v-else-if="!items.length"
        description="没有匹配的页面资产"
        :image-size="64"
      />

      <div v-for="item in items" :key="item.id" role="listitem">
        <button
          type="button"
          class="pa-list-item"
          :class="{ active: item.id === selectedId }"
          :aria-current="item.id === selectedId ? 'true' : undefined"
          @click="$emit('select', item.id)"
        >
          <span class="pa-item-top">
            <span class="pa-item-title">{{ item.title }}</span>
            <el-tag size="small" :type="statusMeta(item.status).type" effect="plain">
              {{ statusMeta(item.status).label }}
            </el-tag>
            <el-tag v-if="item.draftVersion" size="small" type="warning" effect="plain">
              草稿 v{{ item.draftVersion }}
            </el-tag>
          </span>
          <span class="pa-item-meta">
            <span>{{ platformLabel(item.platform) }}</span>
            <span>v{{ item.version }}</span>
            <span v-if="item.draftVersion">草稿 v{{ item.draftVersion }}</span>
            <span>{{ item.source === 'builtin' ? '内置' : '自建' }}</span>
            <span>{{ item.operationIds.length }} 操作</span>
          </span>
          <span class="pa-item-foot">
            <code>{{ item.id }}</code>
            <span :title="`成功率 ${formatHealthRate(item.health)}`">{{ formatHealthRate(item.health) }}</span>
          </span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { RefreshCw, Search } from 'lucide-vue-next';
import type { PageAssetStatus } from '@yan-zhi/shared';
import type { PageAssetSummary } from '../../stores/page-assets';
import {
  formatHealthRate,
  pageAssetStatusMeta,
  platformLabel,
} from './pageAssetUi';

defineProps<{
  items: PageAssetSummary[];
  selectedId?: string;
  loading?: boolean;
  search: string;
  platform: string;
  status: PageAssetStatus | '';
  platformOptions: Array<{ label: string; value: string }>;
  activeCount: number;
  draftCount: number;
}>();

defineEmits<{
  (event: 'select', id: string): void;
  (event: 'reload'): void;
  (event: 'update:search', value: string): void;
  (event: 'update:platform', value: string): void;
  (event: 'update:status', value: PageAssetStatus | ''): void;
}>();

const statusMeta = pageAssetStatusMeta;
</script>

<style scoped>
.pa-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.pa-list-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.pa-list-counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.pa-list-counts strong {
  margin-right: 2px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.pa-search-row,
.pa-filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.pa-search-row :deep(.el-input) {
  flex: 1;
}

.pa-filter-row :deep(.el-select) {
  flex: 1;
}

.pa-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.pa-list-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  padding: 11px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard);
}

.pa-list-item:hover {
  background: var(--color-surface-hover);
}

.pa-list-item.active {
  border-color: var(--color-primary-ring);
  background: var(--color-primary-soft);
}

.pa-item-top,
.pa-item-meta,
.pa-item-foot {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
}

.pa-item-top {
  justify-content: space-between;
  gap: var(--space-2);
}

.pa-item-title {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-item-meta,
.pa-item-foot {
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.pa-item-meta span:not(:last-child)::after {
  content: "·";
  margin-left: var(--space-2);
}

.pa-item-foot {
  justify-content: space-between;
}

.pa-item-foot code {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-list-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 5px;
  padding: 12px 10px;
}

.pa-list-skeleton span {
  height: 10px;
  border-radius: var(--radius-xs);
  background: var(--color-surface-hover);
  animation: pa-pulse 1.4s ease-in-out infinite;
}

.pa-list-skeleton span:nth-child(1) { width: 62%; }
.pa-list-skeleton span:nth-child(2) { width: 88%; }
.pa-list-skeleton span:nth-child(3) { width: 44%; }

@keyframes pa-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@media (max-width: 900px) {
  .pa-list {
    max-height: 42vh;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
