<template>
  <div class="shop-tab-body">
    <template v-if="isDropship">
      <div class="shop-card">
        <p class="shop-empty-hint" style="margin: 0;">
          该店铺是<strong>无货源</strong>模式：不持库存，库存列与流水不参与口径。<br>
          出单后到「订单」页点「标记已采购」，再到货源平台采购，由供应商直发。
        </p>
      </div>
    </template>
    <template v-else>
      <div class="shop-tab-toolbar">
        <span class="shop-hint-line" style="margin: 0;">按库存余量排序 · 低库存 {{ lowCount }} 个</span>
        <span class="shop-spacer" />
        <el-button size="small" :disabled="!selectedProduct" @click="openChange('in')">入库</el-button>
        <el-button size="small" :disabled="!selectedProduct" @click="openChange('out')">出库</el-button>
        <el-button size="small" :disabled="!selectedProduct" @click="openChange('adjust')">盘点</el-button>
      </div>

      <el-table
        v-if="!isMobile"
        :data="sortedProducts"
        size="small"
        highlight-current-row
        @current-change="(row: BizProduct | null) => (selectedProduct = row)"
      >
        <el-table-column prop="sku" label="SKU" width="120">
          <template #default="{ row }"><span class="shop-mono">{{ row.sku }}</span></template>
        </el-table-column>
        <el-table-column prop="title" label="商品" min-width="200" show-overflow-tooltip />
        <el-table-column label="当前库存" width="100">
          <template #default="{ row }">
            <span :class="{ 'shop-warn-line': row.stock <= row.safetyStock }">{{ row.stock }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="safetyStock" label="安全库存" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.stock <= row.safetyStock" size="small" type="warning" effect="plain">低库存</el-tag>
            <span v-else class="shop-na">正常</span>
          </template>
        </el-table-column>
      </el-table>
      <!-- ★ 窄屏库存商品卡片：点卡片选中（替代表格 current-row），再点工具栏入库/出库/盘点 -->
      <div v-else class="shop-mcard-list">
        <div
          v-for="row in sortedProducts" :key="row.id"
          class="shop-mcard"
          :style="selectedProduct?.id === row.id ? 'border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);' : ''"
          @click="selectedProduct = row"
        >
          <div class="shop-mcard-head">
            <span class="shop-mono shop-mcard-sku">{{ row.sku }}</span>
            <el-tag v-if="row.stock <= row.safetyStock" size="small" type="warning" effect="plain">低库存</el-tag>
            <span v-else class="shop-na">正常</span>
          </div>
          <div class="shop-mcard-title">{{ row.title }}</div>
          <div class="shop-mcard-meta">
            <span>库存 <b :class="{ 'shop-warn-line': row.stock <= row.safetyStock }">{{ row.stock }}</b></span>
            <span>安全库存 {{ row.safetyStock }}</span>
          </div>
        </div>
      </div>

      <div class="shop-card" style="margin-top: 14px;">
        <div class="shop-card-head"><h3 style="font-size: 14px;">库存流水（最近 {{ moves.length }} 条）</h3></div>
        <el-table v-if="moves.length && !isMobile" :data="moves" size="small" max-height="320">
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="动作" width="80">
            <template #default="{ row }">{{ moveKindLabel(row.kind) }}</template>
          </el-table-column>
          <el-table-column label="SKU" width="120">
            <template #default="{ row }">{{ skuOf(row.productId) }}</template>
          </el-table-column>
          <el-table-column label="变动" width="80">
            <template #default="{ row }">
              <span :class="row.qty > 0 ? '' : 'shop-warn-line'">{{ row.qty > 0 ? `+${row.qty}` : row.qty }}</span>
            </template>
          </el-table-column>
          <el-table-column label="库存" width="120">
            <template #default="{ row }"><span class="shop-mono">{{ row.beforeQty }} → {{ row.afterQty }}</span></template>
          </el-table-column>
          <el-table-column label="操作者" width="80">
            <template #default="{ row }">{{ row.actor === 'ai' ? 'AI' : '人工' }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="140" show-overflow-tooltip />
        </el-table>
        <!-- ★ 窄屏流水卡片（§3：7 列 ~760px → 时间/SKU/变动 + 前后余量） -->
        <div v-else-if="moves.length" class="shop-mcard-list">
          <div v-for="row in moves" :key="row.id" class="shop-mcard">
            <div class="shop-mcard-head">
              <span class="shop-mcard-meta" style="margin: 0;">{{ fmtTime(row.createdAt) }} · {{ moveKindLabel(row.kind) }} · {{ skuOf(row.productId) }}</span>
              <span :class="row.qty > 0 ? 'shop-mcard-qty-in' : 'shop-warn-line'">{{ row.qty > 0 ? `+${row.qty}` : row.qty }}</span>
            </div>
            <div class="shop-mcard-meta">
              <span class="shop-mono">{{ row.beforeQty }} → {{ row.afterQty }}</span>
              <span>{{ row.actor === 'ai' ? 'AI' : '人工' }}</span>
              <span v-if="row.reason">{{ row.reason }}</span>
            </div>
          </div>
        </div>
        <p v-else class="shop-empty-hint">还没有库存流水。入库/出库/盘点都会在这里留痕。</p>
      </div>
    </template>

    <el-dialog v-model="change.visible" :title="`${moveKindLabel(change.kind)} · ${change.product?.sku || ''}`" width="420px" append-to-body>
      <el-form label-width="84px">
        <el-form-item label="当前库存"><span>{{ change.product?.stock ?? 0 }}</span></el-form-item>
        <el-form-item :label="change.kind === 'adjust' ? '差额（可负）' : '数量'">
          <el-input-number v-model="change.qty" :min="change.kind === 'adjust' ? -99999 : 1" :step="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="change.reason" size="small" placeholder="选填" />
        </el-form-item>
      </el-form>
      <p class="shop-hint-line">预计库存：{{ preview }}</p>
      <template #footer>
        <el-button @click="change.visible = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submit()">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 库存页签：有货源店铺的库存列表 + 入库/出库/盘点 + 全量流水；无货源显示不持库存引导。
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { ShopConnection } from '../../shopSession';
import { useIsMobile } from '../../../../composables/useIsMobile';
import {
  bizProducts, bizMoves, bizLastSummary, changeStockApi, fmtTime,
  type BizProduct,
} from '../useShopApi';

const props = defineProps<{ shop: ShopConnection | null }>();
const isMobile = useIsMobile();

const isDropship = computed(() => (props.shop?.supplyMode ?? 'stocked') === 'dropship');
const sortedProducts = computed(() => [...bizProducts.value].sort((a, b) => a.stock - b.stock));
const lowCount = computed(() => bizProducts.value.filter((p) => p.stock <= p.safetyStock).length);
const moves = computed(() => bizMoves.value.slice(0, 100));
const selectedProduct = ref<BizProduct | null>(null);

const skuMap = computed(() => new Map(bizProducts.value.map((p) => [p.id, p.sku])));
function skuOf(id: string): string { return skuMap.value.get(id) || id; }
function moveKindLabel(kind: string): string {
  return kind === 'in' ? '入库' : kind === 'out' ? '出库' : '盘点';
}

const busy = ref(false);
const change = reactive<{
  visible: boolean; product: BizProduct | null;
  kind: 'in' | 'out' | 'adjust'; qty: number; reason: string;
}>({ visible: false, product: null, kind: 'in', qty: 1, reason: '' });

const preview = computed(() => {
  const base = change.product?.stock || 0;
  const delta = change.kind === 'adjust' ? change.qty : change.kind === 'in' ? Math.abs(change.qty) : -Math.abs(change.qty);
  return base + delta;
});

function openChange(kind: 'in' | 'out' | 'adjust'): void {
  if (!selectedProduct.value) { ElMessage.warning('先在表里选中一个商品'); return; }
  change.product = selectedProduct.value;
  change.kind = kind;
  change.qty = 1;
  change.reason = '';
  change.visible = true;
}

async function submit(): Promise<void> {
  if (!props.shop || !change.product || !change.qty) { ElMessage.warning('数量不能为 0'); return; }
  busy.value = true;
  try {
    const qty = change.kind === 'adjust' ? change.qty : Math.abs(change.qty);
    const err = await changeStockApi(props.shop.id, change.product.id, change.kind, qty, change.reason || undefined);
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(bizLastSummary.value || '库存已更新');
    change.visible = false;
  } finally {
    busy.value = false;
  }
}
</script>
