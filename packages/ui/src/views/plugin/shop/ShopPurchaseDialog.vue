<template>
  <el-dialog
    :model-value="modelValue"
    :title="`无货源采购 · ${order?.orderNo || ''}`"
    width="680px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="shop-hint-line" style="margin: 0 0 8px;">
      买家：{{ order?.buyer || '—' }} · {{ money(order?.amountCents || 0, order?.currency) }}。
      采购付款必须由你人工完成，助手只代跑加购/填单等非资金步骤。
    </p>

    <!-- 已创建的采购单 -->
    <el-table v-if="existing.length && !isMobile" :data="existing" size="small" style="margin-bottom: 10px;">
      <el-table-column prop="sku" label="SKU" width="120" />
      <el-table-column label="货源" min-width="170" show-overflow-tooltip>
        <template #default="{ row }">
          <a :href="row.offerRef" target="_blank" rel="noreferrer noopener">{{ row.offerRef }}</a>
        </template>
      </el-table-column>
      <el-table-column label="数量" width="70">
        <template #default="{ row }">×{{ row.qty }}</template>
      </el-table-column>
      <el-table-column label="成本/件" width="90">
        <template #default="{ row }">{{ money(row.unitCostCents) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="statusMeta(row.status).tag">{{ statusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="go1688(row)">去 1688</el-button>
          <el-button link size="small" :disabled="row.status === 'ordered' || row.status === 'paid'" @click="setStatus(row, 'ordered')">已下单</el-button>
          <el-button link size="small" :disabled="row.status === 'paid'" @click="setStatus(row, 'paid')">已付款</el-button>
          <el-button link size="small" @click="setStatus(row, 'received')">已收货</el-button>
          <el-button link size="small" type="danger" @click="setStatus(row, 'cancelled')">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- ★ 窄屏采购单卡片（§3：操作列 210px 塞 5 按钮 → 卡片动作行） -->
    <div v-else-if="isMobile && existing.length" class="shop-mcard-list" style="margin-bottom: 10px;">
      <div v-for="row in existing" :key="row.id" class="shop-mcard">
        <div class="shop-mcard-head">
          <span class="shop-mono shop-mcard-sku">{{ row.sku }}</span>
          <el-tag size="small" effect="plain" :type="statusMeta(row.status).tag">{{ statusMeta(row.status).label }}</el-tag>
        </div>
        <div class="shop-mcard-meta">
          <span>×{{ row.qty }}</span>
          <span><b>{{ money(row.unitCostCents) }}</b>/件</span>
          <a v-if="row.offerRef" :href="row.offerRef" target="_blank" rel="noreferrer noopener" style="word-break: break-all;">货源链接</a>
        </div>
        <div class="shop-mcard-actions">
          <el-button size="small" type="primary" plain @click="go1688(row)">去 1688</el-button>
          <el-button size="small" :disabled="row.status === 'ordered' || row.status === 'paid'" @click="setStatus(row, 'ordered')">已下单</el-button>
          <el-button size="small" :disabled="row.status === 'paid'" @click="setStatus(row, 'paid')">已付款</el-button>
          <el-button size="small" @click="setStatus(row, 'received')">已收货</el-button>
          <el-button size="small" type="danger" plain @click="setStatus(row, 'cancelled')">取消</el-button>
        </div>
      </div>
    </div>
    <p v-if="!existing.length" class="shop-hint-line">该订单还没有采购单。下面按订单明细生成采购计划（货源默认取商品的 1688 链接/货号）。</p>

    <!-- 创建采购单 -->
    <template v-if="!existing.length">
      <el-table v-if="!isMobile" :data="rows" size="small">
        <el-table-column prop="sku" label="SKU" width="110" />
        <el-table-column label="货源（1688 链接/货号）" min-width="190">
          <template #default="{ row }">
            <el-input v-model="row.offerRef" size="small" placeholder="商品 sourceRef，可修改" />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="100">
          <template #default="{ row }">
            <el-input-number v-model="row.qty" size="small" :min="1" :step="1" controls-position="right" style="width: 100%;" />
          </template>
        </el-table-column>
        <el-table-column label="成本/件" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.costYuan" size="small" :min="0" :precision="2" :step="1" controls-position="right" style="width: 100%;" />
          </template>
        </el-table-column>
      </el-table>
      <!-- ★ 窄屏创建表单卡片化：表单型表格窄屏逐字段堆叠 -->
      <div v-else class="shop-mcard-list">
        <div v-for="(row, i) in rows" :key="i" class="shop-mcard">
          <div class="shop-mcard-head">
            <span class="shop-mono shop-mcard-sku">{{ row.sku }}</span>
          </div>
          <el-input v-model="row.offerRef" size="small" placeholder="货源（1688 链接/货号）" />
          <div class="shop-mcard-meta" style="gap: 10px;">
            <span>数量</span>
            <el-input-number v-model="row.qty" size="small" :min="1" :step="1" controls-position="right" style="width: 120px;" />
            <span>成本/件</span>
            <el-input-number v-model="row.costYuan" size="small" :min="0" :precision="2" :step="1" controls-position="right" style="width: 120px;" />
          </div>
        </div>
      </div>
      <p v-if="isProduction" style="margin-top: 10px;">
        <el-checkbox v-model="approveProduction">生产店铺：我已核对并批准创建采购单</el-checkbox>
      </p>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="!existing.length" type="primary" :loading="busy" @click="createAll()">创建采购单</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 无货源采购：按订单明细创建采购单、推进状态、跳转 1688（付款人工）。
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useIsMobile } from '../../../composables/useIsMobile';
import { useChatStore } from '../../../stores/chat';
import type { ShopConnection } from '../shopSession';
import {
  bizProducts, purchasesForOrder, createPurchasesApi, updatePurchaseStatusApi, purchaseJumpApi,
  money, type BizOrder, type BizPurchase, type PurchaseStatus,
} from './useShopApi';

const props = defineProps<{
  modelValue: boolean;
  shop: ShopConnection | null;
  order: BizOrder | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const isMobile = useIsMobile();
const chatStore = useChatStore();
const busy = ref(false);
const approveProduction = ref(false);

const existing = computed(() => (props.order ? purchasesForOrder(props.order.id) : []));
const isProduction = computed(() => (props.shop?.shopType ?? (props.shop?.isProduction ? 'production' : 'test')) === 'production');

interface Row { sku: string; qty: number; offerRef: string; costYuan: number }
const rows = reactive<Row[]>([]);

function rebuild(): void {
  rows.splice(0, rows.length);
  for (const item of props.order?.items || []) {
    const prod = bizProducts.value.find((p) => p.sku === item.sku);
    rows.push({
      sku: item.sku,
      qty: item.qty || 1,
      offerRef: prod?.sourceRef || '',
      costYuan: prod ? prod.costCents / 100 : 0,
    });
  }
}

watch(() => [props.modelValue, props.order?.id] as const, ([visible]) => {
  if (visible) { approveProduction.value = false; rebuild(); }
}, { immediate: true });

const STATUS_META: Record<PurchaseStatus, { label: string; tag: 'info' | 'warning' | 'success' | 'danger' | 'primary' }> = {
  planned: { label: '待下单', tag: 'info' },
  ordered: { label: '已下单', tag: 'warning' },
  paid: { label: '已付款', tag: 'primary' },
  received: { label: '已收货', tag: 'success' },
  cancelled: { label: '已取消', tag: 'danger' },
};
function statusMeta(s: PurchaseStatus) { return STATUS_META[s] || { label: s, tag: 'info' as const }; }

async function createAll(): Promise<void> {
  if (!props.shop || !props.order) return;
  if (isProduction.value && !approveProduction.value) { ElMessage.warning('生产店铺需要勾选批准'); return; }
  const missing = rows.filter((r) => !r.offerRef.trim());
  if (missing.length) { ElMessage.warning(`这些 SKU 缺少货源链接：${missing.map((r) => r.sku).join('、')}`); return; }
  busy.value = true;
  try {
    const r = await createPurchasesApi(props.shop.id, props.order.id, {
      items: rows.map((row) => ({
        sku: row.sku, qty: row.qty, offerRef: row.offerRef.trim(),
        unitCostCents: Math.round(row.costYuan * 100),
      })),
      approveProduction: approveProduction.value,
    });
    if (r.error) { ElMessage.error(r.error); return; }
    ElMessage.success('采购单已创建。去 1688 下单，付款请自行完成。');
    emit('saved');
  } finally {
    busy.value = false;
  }
}

async function setStatus(p: BizPurchase, status: PurchaseStatus): Promise<void> {
  if (!props.shop) return;
  const err = await updatePurchaseStatusApi(props.shop.id, p.id, status, approveProduction.value);
  if (err) { ElMessage.error(err); return; }
  ElMessage.success(`已标记「${statusMeta(status).label}」`);
}

async function go1688(p: BizPurchase): Promise<void> {
  if (!props.shop) return;
  const r = await purchaseJumpApi(props.shop.id, p.id);
  if (r.error || !r.plan) { ElMessage.error(r.error || '无法生成采购跳转'); return; }
  let name = '1688 采购';
  try { name = new URL(r.plan.url).host || name; } catch { /* 非法 URL 用默认 */ }
  chatStore.openTab({ kind: 'browser', name, url: r.plan.url });
  ElMessage.info('已在浏览器面板打开货源页；加购/填单可代跑，付款必须你本人完成。');
}
</script>
