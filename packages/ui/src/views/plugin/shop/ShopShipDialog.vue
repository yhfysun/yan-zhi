<template>
  <el-dialog
    :model-value="modelValue"
    :title="`发货 · ${order?.orderNo || ''}`"
    width="480px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-width="84px">
      <el-form-item label="订单">
        <span>{{ order?.orderNo }} · {{ order?.buyer || '—' }} · {{ money(order?.amountCents || 0, order?.currency) }}</span>
      </el-form-item>
      <el-form-item label="物流商" required>
        <el-select v-model="form.carrier" style="width: 100%;">
          <el-option v-for="c in carriers" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <span class="shop-form-tip">
          已登记的物流连接：{{ logiNames || '无（不影响发货，只影响能否查真实轨迹）' }}
        </span>
      </el-form-item>
      <el-form-item label="运单号" required>
        <el-input v-model="form.trackingNo" placeholder="如 SF1234567890 / YT2207711010000002" />
      </el-form-item>
      <el-form-item v-if="canPushToPlatform" label="同步平台">
        <el-checkbox v-model="form.pushPlatform">发货后把运单回填到平台</el-checkbox>
        <el-input
          v-if="form.pushPlatform"
          v-model="form.platformLogistics"
          :placeholder="platformLogisticsHint"
          style="margin-top: 6px;"
        />
        <span class="shop-form-tip">{{ platformLogisticsHint }}</span>
      </el-form-item>
      <el-form-item v-if="isProduction" label="生产批准">
        <el-checkbox v-model="form.approveProduction">我已核对变更单，批准本次发货/平台回填</el-checkbox>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="选填" />
      </el-form-item>
    </el-form>
    <p class="shop-hint-line">
      发货单写入后不能删除；运单号填错需联系物流商更正并另记备注。勾选同步平台后会用官方 API 回填，失败会如实提示并保留本地发货单。
    </p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit()">确认发货</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 发货表单：物流商 + 运单号 + 备注；可选同步回填平台（需要平台订单号与物流标识）。
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { shopConnections, shopPlatforms, type ShopConnection } from '../shopSession';
import { shipOrderApi, platformOrderIdOf, money, type BizOrder, type ShipPayload } from './useShopApi';

const props = defineProps<{
  modelValue: boolean;
  shop: ShopConnection | null;
  order: BizOrder | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const carriers = [
  { value: 'sf-express', label: '顺丰速运（丰桥）' },
  { value: 'yunexpress', label: '云途物流' },
  { value: 'jd-logistics', label: '京东物流' },
  { value: 'cainiao', label: '菜鸟' },
  { value: '4px', label: '递四方 4PX' },
  { value: 'winit', label: '万邑通（海外仓）' },
];

const form = reactive({
  carrier: 'sf-express', trackingNo: '', note: '',
  pushPlatform: false, platformLogistics: '', approveProduction: false,
});
const saving = ref(false);

const platformOrderId = computed(() => (props.order ? platformOrderIdOf(props.order) : ''));
const apiCaps = computed(() => shopPlatforms.value.find((p) => p.id === props.shop?.platform)?.apiCapabilities ?? []);
const canPushToPlatform = computed(() => !!platformOrderId.value && !!props.shop?.hasSecret && apiCaps.value.includes('order.ship') && props.shop?.platform !== 'winit');
const isProduction = computed(() => (props.shop?.shopType ?? (props.shop?.isProduction ? 'production' : 'test')) === 'production');
const platformLogisticsHint = computed(() => {
  switch (props.shop?.platform) {
    case 'taobao': return '淘宝物流公司编码 company_code（如 SF）';
    case 'amazon': return '亚马逊承运商代码 carrierCode（如 UPS / DHL / USPS）';
    case 'pdd': return '拼多多物流公司 id（数字，pdd.logistics.companies.get 可查）';
    case 'douyin': return '抖店物流公司编码 company_code（order.logisticsCompanyList 可查，如 shunfeng）';
    case 'kuaishou': return '快手快递公司数字编码 expressCode（快递公司列表接口可查）';
    case '1688': return '1688 物流公司编码 cpCode';
    case 'tiktok': return 'TikTok 物流商 id shippingProviderId';
    case 'shopify': return 'Shopify 物流公司名称（如 SF Express / DHL）；会走 fulfillment 流程';
    default: return '平台物流标识';
  }
});

const logiNames = computed(() => shopConnections.value
  .filter((c) => ['sf-express', 'yunexpress', 'jd-logistics', 'cainiao', '4px', 'winit'].includes(c.platform))
  .map((c) => c.shopName)
  .join('、'));

watch(() => props.modelValue, (v) => {
  if (v) {
    form.trackingNo = '';
    form.note = '';
    form.platformLogistics = '';
    form.approveProduction = false;
    form.pushPlatform = canPushToPlatform.value;
  }
});

async function submit(): Promise<void> {
  if (!props.shop || !props.order) return;
  if (!form.trackingNo.trim()) { ElMessage.warning('运单号必填'); return; }
  if (isProduction.value && !form.approveProduction) { ElMessage.warning('生产店铺需要勾选批准'); return; }
  saving.value = true;
  try {
    const payload: ShipPayload = {
      carrier: form.carrier,
      trackingNo: form.trackingNo.trim(),
      note: form.note.trim() || undefined,
      pushPlatform: form.pushPlatform && canPushToPlatform.value,
      approveProduction: form.approveProduction,
    };
    const extra = form.platformLogistics.trim();
    if (payload.pushPlatform && extra) {
      const p = props.shop.platform;
      if (p === 'pdd') payload.logisticsId = Number(extra) || undefined;
      else if (p === '1688') payload.cpCode = extra;
      else if (p === 'tiktok') payload.shippingProviderId = extra;
      else payload.companyCode = extra;
    }
    const r = await shipOrderApi(props.shop.id, props.order.id, payload);
    if (r.error) { ElMessage.error(r.error); return; }
    ElMessage.success('已创建发货单');
    if (r.platformSync) {
      if (r.platformSync.ok) ElMessage.success(r.platformSync.message);
      else ElMessage.warning(`本地已发货，但平台回填失败：${r.platformSync.message}`);
    }
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>
