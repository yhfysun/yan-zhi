<template>
  <div class="shop-side-head">
    <span class="shop-side-title">项目</span>
    <el-button size="small" type="primary" plain :icon="Plus" @click="emit('create-project')">新建</el-button>
  </div>

  <div class="shop-projects">
    <div
      v-for="p in projects"
      :key="p.id"
      class="shop-project"
      :class="{ active: p.id === activeProjectId }"
      @click="emit('select-project', p.id)"
    >
      <el-icon class="shop-project-icon"><ChatLineSquare /></el-icon>
      <span class="shop-project-name" :title="p.title">{{ p.title || '未命名项目' }}</span>
      <span class="shop-project-count">{{ countOf(p.id) }}</span>
      <button class="shop-project-del" title="删除项目" @click.stop="emit('delete-project', p)">×</button>
    </div>

    <!-- 历史连接没有 projectId：单独列出，避免"看不见/丢数据" -->
    <div
      v-if="orphanCount"
      class="shop-project"
      :class="{ active: activeProjectId === '' }"
      @click="emit('select-project', '')"
    >
      <el-icon class="shop-project-icon"><Shop /></el-icon>
      <span class="shop-project-name">未归属资源</span>
      <span class="shop-project-count">{{ orphanCount }}</span>
    </div>

    <div v-if="!projects.length && !orphanCount" class="shop-empty">
      <p>还没有店铺项目。</p>
      <p class="shop-empty-hint">
        一个项目 = 一家店的经营上下文（对话 + 资源）。新建后，在中间绑定
        <strong>店铺 / 仓储 / 物流</strong>，并按 商品 → 订单 → 发货 经营。
      </p>
    </div>
  </div>

  <!-- 当前项目下的资源（店铺列表带 演示/测试/生产 · 有货源/无货源 角标） -->
  <div class="shop-shops">
    <div class="shop-shops-head">
      <span class="shop-side-title">资源</span>
      <el-button
        size="small"
        type="primary"
        plain
        :disabled="!activeProjectId"
        @click="emit('create-connection')"
      >＋ 连接</el-button>
    </div>
    <div
      v-for="c in shops"
      :key="c.id"
      class="shop-shop-row"
      :class="{ active: c.id === activeShopId }"
      @click="emit('select-shop', c.id)"
    >
      <el-icon :size="12"><Shop /></el-icon>
      <span class="shop-shop-name" :title="c.shopName">{{ c.shopName }}</span>
      <span class="shop-shop-badges">
        <el-tag size="small" effect="plain" :type="shopTypeMeta(c).tag">{{ shopTypeMeta(c).label }}</el-tag>
        <el-tag size="small" effect="plain" :type="supplyMeta(c).tag">{{ supplyMeta(c).label }}</el-tag>
      </span>
    </div>
    <p v-if="!shops.length" class="shop-empty-hint">
      {{ activeProjectId ? '这个项目还没有资源，点「＋ 连接」登记一条。' : '先在左侧新建一个店铺项目。' }}
    </p>
  </div>

  <!-- 演示数据：空控制台一眼看懂怎么用；清空只删当前项目的 demo 行 -->
  <div class="shop-demo">
    <template v-if="demoCount">
      <span class="shop-demo-hint">{{ demoCount }} 条演示数据</span>
      <el-button size="small" text type="danger" :loading="demoBusy" @click="emit('clear-demo')">清空演示</el-button>
    </template>
    <el-button v-else size="small" text type="primary" :loading="demoBusy" @click="emit('seed-demo')">＋ 创建演示项目</el-button>
  </div>
</template>

<script setup lang="ts">
// 左栏：项目列表 + 当前项目的资源列表（店铺/仓储/物流统一一处，带类型与货源角标）。
import { ChatLineSquare, Plus, Shop } from '@element-plus/icons-vue';
import type { ShopConnection } from '../shopSession';
import { SHOP_TYPE_META, SUPPLY_META, type ShopType, type SupplyMode } from './useShopApi';

interface ProjectItem { id: string; title?: string }

const props = defineProps<{
  projects: ProjectItem[];
  activeProjectId: string;
  shops: ShopConnection[];
  activeShopId: string;
  orphanCount: number;
  demoCount: number;
  demoBusy: boolean;
  counts: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'select-project', id: string): void;
  (e: 'create-project'): void;
  (e: 'delete-project', p: ProjectItem): void;
  (e: 'select-shop', id: string): void;
  (e: 'create-connection'): void;
  (e: 'seed-demo'): void;
  (e: 'clear-demo'): void;
}>();

function countOf(id: string): number {
  return props.counts[id] || 0;
}

/** 老连接没有 shopType：按 demo / 生产标签推导（与后端 shopContextOf 同口径） */
function shopTypeOf(c: ShopConnection): ShopType {
  return c.shopType ?? (c.demo ? 'demo' : c.isProduction ? 'production' : 'test');
}
function shopTypeMeta(c: ShopConnection) {
  return SHOP_TYPE_META[shopTypeOf(c)];
}
function supplyMeta(c: ShopConnection) {
  const mode: SupplyMode = c.supplyMode ?? 'stocked';
  return SUPPLY_META[mode];
}
</script>
