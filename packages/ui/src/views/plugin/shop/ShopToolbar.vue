<template>
  <div class="shop-toolbar">
    <span class="shop-toolbar-title">{{ shop?.shopName || (activeProjectTitle || '未选择项目') }}</span>
    <el-tag v-if="shop" size="small" effect="plain" :type="typeMeta.tag">{{ typeMeta.label }}</el-tag>

    <template v-if="shop && isStore">
      <div class="shop-tool-block">
        <span class="shop-tool-label">店铺类型</span>
        <el-select
          :model-value="shopType"
          size="small"
          class="shop-tool-select"
          @update:model-value="onShopType"
        >
          <el-option label="演示" value="demo" />
          <el-option label="测试" value="test" />
          <el-option label="生产" value="production" />
        </el-select>
      </div>
      <div class="shop-tool-block">
        <span class="shop-tool-label">货源模式</span>
        <el-select
          :model-value="supplyMode"
          size="small"
          class="shop-tool-select"
          @update:model-value="onSupplyMode"
        >
          <el-option label="有货源" value="stocked" />
          <el-option label="无货源" value="dropship" />
        </el-select>
      </div>
    </template>

    <div class="shop-tool-block">
      <span class="shop-tool-label">工作台</span>
      <el-radio-group :model-value="lead" size="small" @update:model-value="onLead">
        <el-radio-button value="human">人工</el-radio-button>
        <el-radio-button value="ai">AI</el-radio-button>
      </el-radio-group>
    </div>

    <span class="shop-toolbar-spacer" />

    <div class="shop-toolbar-actions">
      <el-button v-if="shop" size="small" :loading="checking" @click="emit('check')">配置自检</el-button>
      <el-button v-if="shop" size="small" @click="emit('edit')">编辑</el-button>
      <el-button v-if="shop && isStore" size="small" type="primary" plain @click="emit('open-platform')">平台后台</el-button>
      <el-button v-if="shop" size="small" type="danger" plain @click="emit('remove')">删除</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 顶部工作条（方案 §6）：店铺类型 / 货源模式 / 工作台模式 + 连接级操作。
// ★ 人工/AI 只是工作台切换（复用 lead），不改变数据与权限。
import { computed } from 'vue';
import type { ShopConnection } from '../shopSession';
import type { LeadMode } from '../../../stores/mode';
import { SHOP_TYPE_META, type ShopType, type SupplyMode } from './useShopApi';

const props = defineProps<{
  shop: ShopConnection | null;
  activeProjectTitle: string;
  isStore: boolean;
  lead: LeadMode;
  checking: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:shop-type', v: ShopType): void;
  (e: 'update:supply-mode', v: SupplyMode): void;
  (e: 'update:lead', v: LeadMode): void;
  (e: 'check'): void;
  (e: 'edit'): void;
  (e: 'remove'): void;
  (e: 'open-platform'): void;
}>();

const shopType = computed<ShopType>(() => props.shop?.shopType ?? (props.shop?.demo ? 'demo' : props.shop?.isProduction ? 'production' : 'test'));
const typeMeta = computed(() => SHOP_TYPE_META[shopType.value]);
const supplyMode = computed<SupplyMode>(() => props.shop?.supplyMode ?? 'stocked');

function onShopType(v: unknown): void { emit('update:shop-type', v as ShopType); }
function onSupplyMode(v: unknown): void { emit('update:supply-mode', v as SupplyMode); }
function onLead(v: unknown): void { emit('update:lead', v as LeadMode); }
</script>
