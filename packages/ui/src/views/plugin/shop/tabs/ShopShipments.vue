<template>
  <div class="shop-tab-body">
    <el-table v-if="bizShipments.length && !isMobile" :data="bizShipments" size="small">
      <el-table-column label="运单号" width="170">
        <template #default="{ row }"><span class="shop-mono">{{ row.trackingNo || '—' }}</span></template>
      </el-table-column>
      <el-table-column label="物流商" width="130">
        <template #default="{ row }">{{ carrierLabel(row.carrier) }}</template>
      </el-table-column>
      <el-table-column label="订单" width="150">
        <template #default="{ row }">{{ orderNoOf(row.orderId) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="92">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="shipmentMeta(row.status).tag">
            {{ shipmentMeta(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发出时间" width="140">
        <template #default="{ row }">{{ fmtTime(row.shippedAt || row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" :loading="track.busy && track.shipment?.id === row.id" @click="openTrack(row)">查轨迹</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- ★ 窄屏发货单卡片（§3） -->
    <div v-else-if="isMobile && bizShipments.length" class="shop-mcard-list">
      <div v-for="row in bizShipments" :key="row.id" class="shop-mcard">
        <div class="shop-mcard-head">
          <span class="shop-mono shop-mcard-sku">{{ row.trackingNo || '—' }}</span>
          <el-tag size="small" effect="plain" :type="shipmentMeta(row.status).tag">{{ shipmentMeta(row.status).label }}</el-tag>
        </div>
        <div class="shop-mcard-meta">
          <span>物流商 {{ carrierLabel(row.carrier) }}</span>
          <span>订单 {{ orderNoOf(row.orderId) }}</span>
          <span>{{ fmtTime(row.shippedAt || row.createdAt) }}</span>
        </div>
        <div v-if="row.note" class="shop-mcard-title" style="font-weight: 400; color: var(--color-text-secondary);">{{ row.note }}</div>
        <div class="shop-mcard-actions">
          <el-button size="small" :loading="track.busy && track.shipment?.id === row.id" @click="openTrack(row)">查轨迹</el-button>
        </div>
      </div>
    </div>
    <div v-else class="shop-placeholder">
      <p v-if="bizLoading">正在读取发货单…</p>
      <p v-else-if="bizError">{{ bizError }}</p>
      <p v-else>还没有发货单。在「订单」页对已付款订单点「发货」即可创建。</p>
    </div>

    <p class="shop-hint-line">
      已接客户端的物流商（顺丰丰桥 / 云途）可查真实轨迹；未接客户端或凭据缺失会如实提示。
      跨店/跨项目请先在该项目里登记物流连接。
    </p>

    <!-- 轨迹时间线 -->
    <el-dialog v-model="track.visible" :title="`轨迹 · ${track.shipment?.trackingNo || ''}`" width="560px" append-to-body>
      <p v-if="track.error" class="shop-check err" style="margin: 0;">{{ track.error }}</p>
      <div v-else-if="track.result" class="shop-logi-result" :class="track.result.ok ? 'ok' : 'err'">
        <p class="shop-logi-result-head">
          {{ track.result.message || (track.result.ok ? '已返回轨迹' : `查询失败${track.result.step ? `（${track.result.step}）` : ''}`) }}
        </p>
        <ul v-if="track.result.events.length" class="shop-logi-events">
          <li v-for="(e, i) in track.result.events" :key="i">
            <span class="shop-logi-time">{{ e.time }}</span>
            <span v-if="e.location" class="shop-logi-loc">{{ e.location }}</span>
            <span class="shop-logi-desc">{{ e.description }}</span>
            <span v-if="e.status" class="shop-logi-status">{{ e.status }}</span>
          </li>
        </ul>
      </div>
      <p v-else-if="track.busy" class="shop-empty-hint">正在查询…</p>
      <template #footer>
        <el-button @click="track.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 发货页签：发货单列表 + 运单轨迹（复用既有物流客户端，只读）。
import { computed, reactive } from 'vue';
import type { ShopConnection } from '../../shopSession';
import { useIsMobile } from '../../../../composables/useIsMobile';
import {
  bizOrders, bizShipments, bizLoading, bizError,
  fmtTime, SHIPMENT_STATUS_META, trackShipmentApi,
  type BizShipment, type TrackResult, type ShipmentStatus,
} from '../useShopApi';

const props = defineProps<{ shop: ShopConnection | null }>();
const isMobile = useIsMobile();

/** 行内状态可能是 any（el-table slot），统一收口 */
function shipmentMeta(s: string): { label: string; tag: 'info' | 'warning' | 'success' | 'danger' } {
  return SHIPMENT_STATUS_META[s as ShipmentStatus] ?? { label: s, tag: 'info' };
}

const carrierLabels: Record<string, string> = {
  'sf-express': '顺丰速运',
  yunexpress: '云途物流',
  'jd-logistics': '京东物流',
  cainiao: '菜鸟',
  '4px': '递四方 4PX',
  winit: '万邑通',
};
function carrierLabel(id?: string): string {
  if (!id) return '—';
  return carrierLabels[id] || id;
}

const orderNoMap = computed(() => new Map(bizOrders.value.map((o) => [o.id, o.orderNo])));
function orderNoOf(orderId: string): string {
  return orderNoMap.value.get(orderId) || orderId;
}

const track = reactive<{
  visible: boolean; busy: boolean; shipment: BizShipment | null;
  result: TrackResult | null; error: string;
}>({ visible: false, busy: false, shipment: null, result: null, error: '' });

async function openTrack(row: BizShipment): Promise<void> {
  track.visible = true;
  track.busy = true;
  track.shipment = row;
  track.result = null;
  track.error = '';
  try {
    if (!props.shop) return;
    const r = await trackShipmentApi(props.shop.id, row.id);
    track.error = r.error;
    track.result = r.result || null;
  } finally {
    track.busy = false;
  }
}
</script>
