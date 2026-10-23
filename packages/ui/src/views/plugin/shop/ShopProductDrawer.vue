<template>
  <el-dialog
    :model-value="modelValue"
    :title="product ? `编辑商品 · ${product.sku}` : '新建商品'"
    width="560px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-width="94px">
      <el-form-item label="SKU" required>
        <el-input v-model="form.sku" :disabled="!!product" placeholder="店内唯一，如 SKU-007" />
      </el-form-item>
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="商品标题" />
      </el-form-item>
      <el-form-item label="类目">
        <el-input v-model="form.category" placeholder="可空，如 家居收纳" />
      </el-form-item>
      <el-form-item label="成本 / 售价">
        <div style="display: flex; gap: 8px; width: 100%;">
          <el-input-number v-model="form.cost" :min="0" :precision="2" :step="1" style="flex: 1;" />
          <el-input-number v-model="form.price" :min="0.01" :precision="2" :step="1" style="flex: 1;" />
        </div>
      </el-form-item>
      <p class="shop-hint-line" style="margin: -6px 0 10px 94px;">
        毛利 {{ money(marginCents, currency) }}<template v-if="form.price > 0">（{{ marginRate }}%）</template>
      </p>
      <template v-if="isDropship">
        <el-form-item label="货源链接" required>
          <el-input v-model="form.sourceRef" placeholder="1688 商品链接 / 供应商货号" />
          <span class="shop-form-tip">无货源店铺：不持库存，出单后按此链接采购。</span>
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item v-if="!product" label="初始库存">
          <el-input-number v-model="form.stock" :min="0" :step="1" style="width: 100%;" />
          <span class="shop-form-tip">建商品时会补一条入库流水；之后改库存走「改库存」。</span>
        </el-form-item>
        <el-form-item label="安全库存">
          <el-input-number v-model="form.safetyStock" :min="0" :step="1" style="width: 100%;" />
          <span class="shop-form-tip">库存 ≤ 安全库存时看板预警。</span>
        </el-form-item>
      </template>
      <el-form-item label="状态">
        <el-radio-group v-model="form.listingStatus">
          <el-radio-button value="draft">草稿</el-radio-button>
          <el-radio-button value="online">在售</el-radio-button>
          <el-radio-button value="offline">已下架</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit()">{{ product ? '保存' : '创建' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 商品表单抽屉：新建 / 编辑本地商品（金额以元输入，提交转整数分）。
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ShopConnection } from '../shopSession';
import {
  createProductApi, updateProductApi, money,
  type BizProduct, type ListingStatus,
} from './useShopApi';

const props = defineProps<{
  modelValue: boolean;
  shop: ShopConnection | null;
  product: BizProduct | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const saving = ref(false);
const form = reactive({
  sku: '', title: '', category: '',
  cost: 0, price: 0, stock: 0, safetyStock: 0,
  sourceRef: '', listingStatus: 'draft' as ListingStatus,
});

const isDropship = computed(() => (props.shop?.supplyMode ?? 'stocked') === 'dropship');
const currency = computed(() => (props.shop?.platform === 'amazon' ? 'USD' : 'CNY'));
const marginCents = computed(() => Math.round((form.price - form.cost) * 100));
const marginRate = computed(() => {
  if (form.price <= 0) return '—';
  return `${(((form.price - form.cost) / form.price) * 100).toFixed(1)}%`;
});

function fill(): void {
  const p = props.product;
  form.sku = p?.sku || '';
  form.title = p?.title || '';
  form.category = p?.category || '';
  form.cost = p ? p.costCents / 100 : 0;
  form.price = p ? p.priceCents / 100 : 0;
  form.stock = p?.stock ?? 0;
  form.safetyStock = p?.safetyStock ?? 0;
  form.sourceRef = p?.sourceRef || '';
  form.listingStatus = p?.listingStatus || 'draft';
}

watch(() => [props.modelValue, props.product] as const, ([visible]) => {
  if (visible) fill();
}, { immediate: true });

async function submit(): Promise<void> {
  if (!props.shop) return;
  if (!form.sku.trim() || !form.title.trim()) { ElMessage.warning('SKU 与标题必填'); return; }
  if (!form.price || form.price <= 0) { ElMessage.warning('售价必须大于 0'); return; }
  if (isDropship.value && !form.sourceRef.trim()) { ElMessage.warning('无货源商品必须填货源链接'); return; }

  saving.value = true;
  try {
    const payload = {
      sku: form.sku.trim(),
      title: form.title.trim(),
      category: form.category.trim() || undefined,
      costCents: Math.round(form.cost * 100),
      priceCents: Math.round(form.price * 100),
      stock: isDropship.value ? 0 : Math.round(form.stock),
      safetyStock: isDropship.value ? 0 : Math.round(form.safetyStock),
      sourceRef: form.sourceRef.trim() || undefined,
      listingStatus: form.listingStatus,
    };
    const err = props.product
      ? await updateProductApi(props.shop.id, props.product.id, payload)
      : await createProductApi(props.shop.id, payload);
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(props.product ? '已保存' : '商品已创建');
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>
