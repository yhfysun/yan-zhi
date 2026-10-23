<template>
  <div class="shop-winit-outbound">
    <div class="shop-tab-actions">
      <span class="shop-hint-line">万邑通出库单：仓库 + 收件人 + 商品明细，提交后由平台返回出库单号。</span>
      <el-button type="primary" size="small" @click="openDialog">创建出库单</el-button>
    </div>

    <el-alert
      v-if="lastResult"
      :title="lastResult"
      type="success"
      :closable="false"
      show-icon
      style="margin-top: 12px;"
    />
    <p v-if="lastRaw" class="shop-form-tip" style="white-space: pre-wrap; word-break: break-all;">
      平台回读：{{ lastRaw }}
    </p>

    <el-dialog v-model="visible" title="创建万邑通出库单" width="720px" append-to-body>
      <el-form label-width="110px">
        <el-form-item label="仓库编码" required>
          <el-input v-model="form.warehouseCode" placeholder="如 USWC / DE01，按万邑通仓库列表填写" />
        </el-form-item>
        <el-form-item label="客户订单号">
          <el-input v-model="form.customerOrderNo" placeholder="选填；建议填本地订单号，便于对账" />
        </el-form-item>

        <el-divider content-position="left">收件人</el-divider>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="form.recipientName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="电话" required><el-input v-model="form.recipientPhone" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="国家" required><el-input v-model="form.countryCode" placeholder="US / DE / GB" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="省/州"><el-input v-model="form.province" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="城市" required><el-input v-model="form.city" /></el-form-item></el-col>
          <el-col :span="16"><el-form-item label="地址1" required><el-input v-model="form.address1" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="邮编" required><el-input v-model="form.postalCode" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="地址2"><el-input v-model="form.address2" placeholder="选填：门牌/单元" /></el-form-item></el-col>
        </el-row>

        <el-divider content-position="left">商品明细</el-divider>
        <div v-for="(row, i) in form.productList" :key="i" class="shop-outbound-row">
          <el-input v-model="row.productCode" placeholder="万邑通 SKU / productCode" style="flex: 1;" />
          <el-input-number v-model="row.qty" :min="1" :step="1" controls-position="right" style="width: 120px;" />
          <el-button text type="danger" :disabled="form.productList.length <= 1" @click="removeRow(i)">删除</el-button>
        </div>
        <el-button size="small" @click="addRow">+ 添加商品</el-button>

        <el-form-item v-if="isProduction" label="生产批准" style="margin-top: 14px;">
          <el-checkbox v-model="form.approve">我已核对出库单内容，批准提交到万邑通</el-checkbox>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">提交出库单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 万邑通出库单（2026-10-23）：字段校验在前端，写操作走统一平台动作入口，
// 后端按 shop.platform 分发到 winit.order.ship；生产店铺需额外批准。
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { ShopConnection } from '../../shopSession';
import { platformActionApi } from '../useShopApi';
import { buildWinitOutboundOrder, validateWinitOutbound, type WinitOutboundForm } from '../winitOutbound';

const props = defineProps<{ shop: ShopConnection | null }>();

const visible = ref(false);
const saving = ref(false);
const lastResult = ref('');
const lastRaw = ref('');

interface ProductRow { productCode: string; qty: number }
const form = reactive<WinitOutboundForm>({
  warehouseCode: '', customerOrderNo: '',
  recipientName: '', recipientPhone: '', countryCode: '', province: '', city: '',
  address1: '', address2: '', postalCode: '',
  productList: [{ productCode: '', qty: 1 }] as ProductRow[],
  approve: false,
});

const isProduction = computed(() => (props.shop?.shopType ?? (props.shop?.isProduction ? 'production' : 'test')) === 'production');

function openDialog(): void {
  if (!props.shop) return;
  visible.value = true;
  lastResult.value = '';
  lastRaw.value = '';
}

function addRow(): void {
  form.productList.push({ productCode: '', qty: 1 });
}
function removeRow(i: number): void {
  form.productList.splice(i, 1);
}

async function submit(): Promise<void> {
  if (!props.shop) return;
  const err = validateWinitOutbound(form, isProduction.value);
  if (err) { ElMessage.warning(err); return; }
  const order = buildWinitOutboundOrder(form);

  saving.value = true;
  try {
    const r = await platformActionApi(props.shop.id, 'order.ship', { order }, {
      confirmed: true,
      approveProduction: isProduction.value ? form.approve : false,
    });
    if (r.error) { ElMessage.error(r.error); return; }
    const d = r.data;
    lastResult.value = d?.summary || '出库单已提交';
    lastRaw.value = d?.readback?.data ? JSON.stringify(d.readback.data).slice(0, 1200) : '';
    ElMessage.success(lastResult.value);
    visible.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.shop-tab-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shop-outbound-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
</style>
