<template>
  <div class="shop-tab-body">
    <div class="shop-tab-toolbar">
      <!-- ★ 窄屏状态筛选改下拉：radio-button 7 个不可换行被裁切（全局兜底只管 wrap，宽度仍不够） -->
      <el-select v-if="isMobile" v-model="status" size="small" style="width: 150px;">
        <el-option label="全部" value="" />
        <el-option v-for="s in statuses" :key="s" :value="s" :label="`${ORDER_STATUS_META[s].label}（${countOf(s)}）`" />
      </el-select>
      <el-radio-group v-else v-model="status" size="small">
        <el-radio-button value="">全部（{{ bizOrders.length }}）</el-radio-button>
        <el-radio-button v-for="s in statuses" :key="s" :value="s">
          {{ ORDER_STATUS_META[s].label }}（{{ countOf(s) }}）
        </el-radio-button>
      </el-radio-group>
      <el-input v-model="search" size="small" placeholder="搜订单号 / 买家" clearable style="width: 180px;" />
      <span class="shop-spacer" />
      <el-button v-if="canImportOrders" size="small" :loading="importing" @click="importFromPlatform()">从平台导入</el-button>
      <el-button v-if="!isProduction" size="small" type="primary" plain @click="openMock()">＋ 模拟订单</el-button>
    </div>

    <el-table v-if="filtered.length && !isMobile" :data="filtered" size="small">
      <el-table-column prop="orderNo" label="订单号" width="150">
        <template #default="{ row }"><span class="shop-mono">{{ row.orderNo }}</span></template>
      </el-table-column>
      <el-table-column prop="buyer" label="买家" width="110" />
      <el-table-column label="商品" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ (row.items || []).map((i: BizOrderItem) => `${i.title} ×${i.qty}`).join('；') || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="金额" width="100">
        <template #default="{ row }">{{ money(row.amountCents, row.currency) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="92">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="orderMeta(row.status).tag">
            {{ orderMeta(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="同步" width="80">
        <template #default="{ row }">
          <el-tag v-if="syncStatusOf(row.attrs) === 'synced'" size="small" type="success" effect="plain">已同步</el-tag>
          <el-tag v-else-if="syncStatusOf(row.attrs) === 'failed'" size="small" type="danger" effect="plain">失败</el-tag>
          <span v-else class="shop-na">—</span>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="140">
        <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="isDropship && row.status === 'paid'"
            link size="small" type="primary" @click="markSourced(row)"
          >标记已采购</el-button>
          <el-button
            v-if="isDropship && (row.status === 'paid' || row.status === 'sourcing')"
            link size="small" type="warning" @click="openPurchase(row)"
          >采购</el-button>
          <el-button
            v-if="row.status === 'paid' || row.status === 'sourcing'"
            link size="small" @click="openShip(row)"
          >发货</el-button>
          <span v-if="row.status !== 'paid' && row.status !== 'sourcing'" class="shop-na">—</span>
        </template>
      </el-table-column>
    </el-table>
    <!-- ★ 窄屏订单卡片（§3）：订单表 ~1020px 在手机不可用；待发货/采购中的订单保留全部行操作 -->
    <div v-else-if="isMobile && filtered.length" class="shop-mcard-list">
      <div v-for="row in filtered" :key="row.id" class="shop-mcard">
        <div class="shop-mcard-head">
          <span class="shop-mono shop-mcard-sku">{{ row.orderNo }}</span>
          <el-tag size="small" effect="plain" :type="orderMeta(row.status).tag">{{ orderMeta(row.status).label }}</el-tag>
        </div>
        <div class="shop-mcard-title">{{ (row.items || []).map((i: BizOrderItem) => `${i.title} ×${i.qty}`).join('；') || '—' }}</div>
        <div class="shop-mcard-meta">
          <span>买家 {{ row.buyer || '—' }}</span>
          <span><b>{{ money(row.amountCents, row.currency) }}</b></span>
          <el-tag v-if="syncStatusOf(row.attrs) === 'synced'" size="small" type="success" effect="plain">已同步</el-tag>
          <el-tag v-else-if="syncStatusOf(row.attrs) === 'failed'" size="small" type="danger" effect="plain">同步失败</el-tag>
          <span>{{ fmtTime(row.createdAt) }}</span>
        </div>
        <div v-if="row.status === 'paid' || row.status === 'sourcing'" class="shop-mcard-actions">
          <el-button v-if="isDropship && row.status === 'paid'" size="small" type="primary" plain @click="markSourced(row)">标记已采购</el-button>
          <el-button v-if="isDropship" size="small" type="warning" plain @click="openPurchase(row)">采购</el-button>
          <el-button size="small" @click="openShip(row)">发货</el-button>
        </div>
      </div>
    </div>
    <div v-else class="shop-placeholder">
      <p v-if="bizLoading">正在读取订单…</p>
      <p v-else-if="bizError">{{ bizError }}</p>
      <p v-else>还没有订单。演示店铺会自带 8 条不同状态的订单。</p>
    </div>

    <p class="shop-hint-line">
      {{ isDropship
        ? '无货源店铺：不持库存，出单后去货源平台采购、供应商直发；付款一律由你人工完成。'
        : '有货源店铺：已付款/采购中的订单可直接填运单号发货。' }}
    </p>

    <ShopShipDialog
      v-model="ship.visible"
      :shop="shop"
      :order="ship.order"
      @saved="ship.visible = false"
    />

    <ShopPurchaseDialog
      v-model="purchase.visible"
      :shop="shop"
      :order="purchase.order"
      @saved="purchase.visible = false"
    />

    <!-- 模拟订单（演示/测试店铺）：造一条订单，用来走通发货闭环 -->
    <el-dialog v-model="mock.visible" title="模拟订单" width="460px" append-to-body>
      <el-form label-width="72px">
        <el-form-item label="商品">
          <el-select v-model="mock.productId" placeholder="选一个商品" style="width: 100%;">
            <el-option v-for="p in bizProducts" :key="p.id" :label="`${p.sku} · ${p.title}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="mock.qty" :min="1" :step="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="买家">
          <el-input v-model="mock.buyer" placeholder="模拟买家（可留空）" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="mock.status">
            <el-radio-button value="paid">待发货</el-radio-button>
            <el-radio-button value="pending">待付款</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <p class="shop-hint-line">模拟订单不动库存，只用于验证订单状态与发货闭环；生产店铺不提供此入口。</p>
      <template #footer>
        <el-button @click="mock.visible = false">取消</el-button>
        <el-button type="primary" :loading="mock.busy" @click="submitMock()">创建模拟订单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 订单页签：列表 + 状态过滤 + 标记已采购（无货源）+ 创建发货。
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ShopShipDialog from '../ShopShipDialog.vue';
import ShopPurchaseDialog from '../ShopPurchaseDialog.vue';
import { useIsMobile } from '../../../../composables/useIsMobile';
import { shopPlatforms, type ShopConnection } from '../../shopSession';
import {
  bizOrders, bizProducts, bizLoading, bizError, bizLastSummary,
  money, fmtTime, ORDER_STATUS_META,
  markOrderSourcedApi, mockOrderApi, importOrdersApi, syncStatusOf,
  type BizOrder, type BizOrderItem, type OrderStatus,
} from '../useShopApi';

const props = defineProps<{ shop: ShopConnection | null }>();

const statuses: OrderStatus[] = ['pending', 'paid', 'sourcing', 'shipped', 'completed', 'refunded'];
const status = ref('');
const search = ref('');
const isMobile = useIsMobile();
const isDropship = computed(() => (props.shop?.supplyMode ?? 'stocked') === 'dropship');
const isProduction = computed(() => (props.shop?.shopType ?? (props.shop?.isProduction ? 'production' : 'test')) === 'production');
const apiCaps = computed(() => shopPlatforms.value.find((p) => p.id === props.shop?.platform)?.apiCapabilities ?? []);
const canImportOrders = computed(() => !!props.shop?.hasSecret && apiCaps.value.includes('order.list'));
const importing = ref(false);

async function importFromPlatform(): Promise<void> {
  if (!props.shop) return;
  let approve = false;
  if (isProduction.value) {
    try {
      await ElMessageBox.confirm(
        '生产店铺从平台导入订单会更新本地订单状态（只前进，不倒退）。确认继续？',
        '生产店铺批准',
        { type: 'warning', confirmButtonText: '批准导入', cancelButtonText: '取消' },
      );
      approve = true;
    } catch { return; }
  }
  importing.value = true;
  try {
    const r = await importOrdersApi(props.shop.id, { approveProduction: approve });
    if (r.error) { ElMessage.error(r.error); return; }
    const s = r.summary;
    if (!s) return;
    ElMessage.success(`平台订单导入：新增 ${s.imported}，更新 ${s.updated}，冲突保留本地 ${s.conflicts ?? 0}，跳过 ${s.skipped}`);
    if (s.errors.length) ElMessage.warning(`部分失败：${s.errors.slice(0, 3).join('；')}${s.errors.length > 3 ? ' …' : ''}`);
  } finally {
    importing.value = false;
  }
}

function countOf(s: OrderStatus): number {
  return bizOrders.value.filter((o) => o.status === s).length;
}

/** 行内状态可能是 any（el-table slot），统一收口避免模板里直接索引 Record */
function orderMeta(s: string): { label: string; tag: 'info' | 'warning' | 'success' | 'danger' | 'primary' } {
  return ORDER_STATUS_META[s as OrderStatus] ?? { label: s, tag: 'info' };
}

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase();
  return bizOrders.value.filter((o) => {
    if (status.value && o.status !== status.value) return false;
    if (!kw) return true;
    return o.orderNo.toLowerCase().includes(kw) || (o.buyer || '').toLowerCase().includes(kw);
  });
});

async function markSourced(row: BizOrder): Promise<void> {
  const err = await markOrderSourcedApi(shopId(), row.id);
  if (err) { ElMessage.error(err); return; }
  ElMessage.success(bizLastSummary.value || '已标记采购');
}

const ship = reactive<{ visible: boolean; order: BizOrder | null }>({ visible: false, order: null });
const purchase = reactive<{ visible: boolean; order: BizOrder | null }>({ visible: false, order: null });
function openPurchase(row: BizOrder): void {
  purchase.order = row;
  purchase.visible = true;
}
function openShip(row: BizOrder): void {
  // 发货是不可逆动作（发货单不能删），二次确认
  ElMessageBox.confirm(
    `为订单 ${row.orderNo} 创建发货单？发货单写入后不能删除，运单号填错需联系物流商更正。`,
    '确认发货', { type: 'warning' },
  ).then(() => {
    ship.order = row;
    ship.visible = true;
  }).catch(() => { /* 取消 */ });
}

function shopId(): string { return props.shop?.id || ''; }

// ===== 模拟订单（演示/测试店铺）=====
const mock = reactive<{
  visible: boolean; busy: boolean;
  productId: string; qty: number; buyer: string; status: 'pending' | 'paid';
}>({ visible: false, busy: false, productId: '', qty: 1, buyer: '', status: 'paid' });

function openMock(): void {
  mock.productId = bizProducts.value[0]?.id || '';
  mock.qty = 1;
  mock.buyer = '';
  mock.status = 'paid';
  mock.visible = true;
}

async function submitMock(): Promise<void> {
  if (!mock.productId) { ElMessage.warning('先在商品页建一个商品，再模拟订单'); return; }
  mock.busy = true;
  try {
    const err = await mockOrderApi(shopId(), {
      productId: mock.productId,
      qty: mock.qty,
      buyer: mock.buyer.trim() || undefined,
      status: mock.status,
    });
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(bizLastSummary.value || '已创建模拟订单');
    mock.visible = false;
  } finally {
    mock.busy = false;
  }
}
</script>
