<template>
  <div class="shop-tab-body">
    <template v-if="shop">
      <!-- 资源详情（所有类型都有；店铺类在下方补看板） -->
      <div class="shop-card">
        <div class="shop-card-head">
          <h3>{{ shop.shopName }}</h3>
          <el-tag size="small" effect="plain" :type="shopTypeMeta.tag">{{ shopTypeMeta.label }}</el-tag>
          <el-tag size="small" effect="plain" :type="supplyMeta.tag">{{ supplyMeta.label }}</el-tag>
          <el-tag v-if="shop.tag && !shop.isProduction" size="small" type="info" effect="plain">{{ shop.tag }}</el-tag>
          <el-tag v-if="shop.isProduction" size="small" type="danger" effect="plain">生产店铺</el-tag>
        </div>
        <dl class="shop-kv">
          <div><dt>平台</dt><dd>{{ platformLabel(shop.platform) }}</dd></div>
          <div><dt>{{ siteFieldLabel }}</dt><dd>{{ shop.site || '—' }}</dd></div>
          <div><dt>卖家 ID</dt><dd>{{ shop.sellerId || '—' }}</dd></div>
          <div><dt>API 凭据</dt><dd>{{ shop.hasSecret ? '已配置' : (isLogistics ? '未配置（物流接口需要 appKey/appSecret）' : '未配置（纯浏览器流程不需要）') }}</dd></div>
          <div><dt>最近自检</dt><dd>{{ fmtTime(shop.lastCheckAt) }}</dd></div>
          <div v-if="shop.note"><dt>备注</dt><dd>{{ shop.note }}</dd></div>
        </dl>
      </div>

      <!-- 仓库/物流类演示资源：沿用合成快照（业务表只覆盖店铺类） -->
      <div v-if="!isStore && snapshot" class="shop-card" style="margin-top: 12px;">
        <div class="shop-card-head"><h3 style="font-size: 14px;">演示快照</h3><el-tag size="small" type="info" effect="plain">演示</el-tag></div>
        <div class="shop-kpi-grid">
          <div v-for="k in snapshot.kpis" :key="k.label" class="shop-kpi">
            <span class="shop-kpi-label">{{ k.label }}</span>
            <span class="shop-kpi-value">{{ k.value }}</span>
            <span v-if="k.hint" class="shop-kpi-hint">{{ k.hint }}</span>
          </div>
        </div>
        <div v-if="snapshot.table" style="margin-top: 12px;">
          <p class="shop-hint-line" style="margin: 0 0 6px;">{{ snapshot.table.title }}</p>
          <el-table :data="snapshotRows" size="small" border>
            <el-table-column
              v-for="(c, i) in snapshot.table.columns"
              :key="i"
              :prop="`c${i}`"
              :label="c"
              min-width="90"
            />
          </el-table>
        </div>
        <p class="shop-hint-line">{{ snapshot.note }}</p>
      </div>

      <!-- 看板（店铺类） -->
      <template v-if="isStore">
        <div v-if="loading" class="shop-empty-hint">正在读取经营看板…</div>
        <div v-else-if="bizError" class="shop-check err"><div class="shop-check-head">✗ 看板读取失败</div><p class="shop-hint-line">{{ bizError }}</p></div>
        <template v-else-if="dashboard">
          <div class="shop-kpi-grid">
            <div class="shop-kpi">
              <span class="shop-kpi-label">今日销售额</span>
              <span class="shop-kpi-value">{{ money(dashboard.todaySalesCents, currency) }}</span>
              <span class="shop-kpi-hint">今日已付款且未退款订单</span>
            </div>
            <div class="shop-kpi">
              <span class="shop-kpi-label">今日订单</span>
              <span class="shop-kpi-value">{{ dashboard.todayOrders }}</span>
              <span class="shop-kpi-hint">含各状态（退款单单列）</span>
            </div>
            <div class="shop-kpi">
              <span class="shop-kpi-label">待发货</span>
              <span class="shop-kpi-value">{{ dashboard.pendingShip }}</span>
              <span class="shop-kpi-hint">已付款 + 采购中</span>
            </div>
            <div class="shop-kpi">
              <span class="shop-kpi-label">低库存</span>
              <span class="shop-kpi-value" :class="{ 'shop-warn-line': !isDropship && dashboard.lowStock.length }">
                {{ isDropship ? '不持库存' : dashboard.lowStock.length }}
              </span>
              <span class="shop-kpi-hint">{{ isDropship ? '无货源模式' : '库存 ≤ 安全库存' }}</span>
            </div>
          </div>

          <div v-if="!isDropship && dashboard.lowStock.length" class="shop-card" style="margin-top: 12px;">
            <div class="shop-card-head"><h3 style="font-size: 14px;">低库存预警</h3></div>
            <el-table :data="dashboard.lowStock" size="small">
              <el-table-column prop="sku" label="SKU" width="110" />
              <el-table-column prop="title" label="商品" min-width="180" />
              <el-table-column prop="stock" label="当前库存" width="90" />
              <el-table-column prop="safetyStock" label="安全库存" width="90" />
            </el-table>
          </div>

          <div class="shop-card" style="margin-top: 12px;">
            <div class="shop-card-head"><h3 style="font-size: 14px;">最近订单</h3></div>
            <el-table v-if="dashboard.recentOrders.length" :data="dashboard.recentOrders" size="small">
              <el-table-column prop="orderNo" label="订单号" width="150" />
              <el-table-column prop="buyer" label="买家" width="110" />
              <el-table-column label="金额" width="100">
                <template #default="{ row }">{{ money(row.amountCents, currency) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="orderStatusMeta(row.status).tag">{{ orderStatusMeta(row.status).label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="下单时间" min-width="140">
                <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
            <p v-else class="shop-empty-hint">还没有订单。</p>
          </div>

          <p class="shop-hint-line">
            看板与商品/订单/发货/库存都以<strong>本地业务库</strong>为准（演示店铺为合成种子数据）。
            真实平台取数请让助手委派 pageAgent 打开卖家后台。
          </p>
        </template>
      </template>

      <!-- 平台 API：能力矩阵 + 连通性自检（凭据齐全才有意义） -->
      <div v-if="apiInfo && apiCaps.length" class="shop-card" style="margin-top: 12px;">
        <div class="shop-card-head">
          <h3 style="font-size: 14px;">平台 API</h3>
          <el-tag size="small" effect="plain" type="success">已接 {{ apiCaps.length }} 项能力</el-tag>
        </div>
        <p class="shop-hint-line" style="margin: 0 0 8px;">能力：{{ apiCapLabels.join(' · ') }}</p>
        <div class="shop-logi-row">
          <el-button size="small" :loading="apiBusy" :disabled="!canTestApi" @click="runApiTest()">API 连通性测试</el-button>
          <span v-if="!shop.hasSecret" class="shop-form-tip">先在「编辑」里按字段填写凭据（每个字段的提示都写了去哪个后台获取）。</span>
          <span v-else-if="apiResult" class="shop-logi-note" :class="apiResult.ok ? 'ok' : 'err'">
            {{ apiResult.ok ? '✓' : '✗' }} {{ apiResult.message }}
          </span>
        </div>
      </div>

      <!-- 配置自检结果 -->
      <div v-if="check" class="shop-check" :class="check.ok ? 'ok' : 'err'" style="margin-top: 12px;">
        <div class="shop-check-head">
          {{ check.ok ? '✓ 配置完整' : '✗ 配置缺项' }}
          <span class="shop-check-sub">（配置自检，不含连通性探测 —— 真取数由助手委派 pageAgent 打开页面完成）</span>
        </div>
        <ul v-if="check.issues.length" class="shop-check-list">
          <li v-for="(t, i) in check.issues" :key="`i${i}`" class="is-issue">{{ t }}</li>
        </ul>
        <ul v-if="check.hints.length" class="shop-check-list">
          <li v-for="(t, i) in check.hints" :key="`h${i}`">{{ t }}</li>
        </ul>
      </div>

      <div class="shop-next" style="margin-top: 12px;">
        <p class="shop-next-title">下一步：人工干，或交给 AI</p>
        <p class="shop-empty-hint">
          人工工作台：在「商品 / 订单 / 发货 / 库存」页签里直接操作，改动立即落本地业务库。<br>
          AI 工作台：顶部切到「AI」，在右侧对话下指令（例：<em>把 SKU-001 价格改成 27.99</em>）——
          AI 先出变更单，你确认后才执行，结果实时反映在表格里。两种模式共用同一套数据、闸门与审计。
        </p>
      </div>
    </template>
    <div v-else class="shop-placeholder">
      <p>选中左侧的资源查看详情，或点「＋ 连接」登记一条。</p>
      <p class="shop-empty-hint">
        演示店铺可以直接体验完整闭环：新建商品 → 上架 → 改价 → 改库存 → 模拟订单 → 发货。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// 概览页签：资源详情 + 本地业务看板（KPI / 低库存 / 最近订单）+ 自检结果。
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ShopConnection, ShopCheckResult, ShopDemoSnapshot } from '../../shopSession';
import { shopDemoData, shopPlatforms, testShopApi, type ShopProbeResult } from '../../shopSession';
import {
  bizDashboard, bizLoading, bizError, money, fmtTime, SHOP_TYPE_META, SUPPLY_META,
  ORDER_STATUS_META, type OrderStatus, type ShopType, type SupplyMode,
} from '../useShopApi';

const props = defineProps<{
  shop: ShopConnection | null;
  check: ShopCheckResult | null;
  platformLabel: (id: string) => string;
  kindOf: (id: string) => 'store' | 'warehouse' | 'logistics';
}>();

const dashboard = computed(() => bizDashboard.value);
const loading = computed(() => bizLoading.value);
const isStore = computed(() => (props.shop ? props.kindOf(props.shop.platform) === 'store' : false));
const isLogistics = computed(() => (props.shop ? props.kindOf(props.shop.platform) === 'logistics' : false));
const isDropship = computed(() => (props.shop?.supplyMode ?? 'stocked') === 'dropship');
const currency = computed(() => (props.shop?.platform === 'amazon' ? 'USD' : 'CNY'));
const siteFieldLabel = computed(() => {
  const kind = props.shop ? props.kindOf(props.shop.platform) : 'store';
  return kind === 'warehouse' ? '仓库' : kind === 'logistics' ? '服务范围' : '站点 / 市场';
});
const shopTypeMeta = computed(() => {
  const c = props.shop;
  const t = (c?.shopType ?? (c?.demo ? 'demo' : c?.isProduction ? 'production' : 'test')) as ShopType;
  return SHOP_TYPE_META[t];
});
const supplyMeta = computed(() => SUPPLY_META[(props.shop?.supplyMode ?? 'stocked') as SupplyMode]);

// ===== 平台 API：能力矩阵 + 连通性自检 =====
const apiInfo = computed(() => shopPlatforms.value.find((p) => p.id === props.shop?.platform));
const apiCaps = computed(() => apiInfo.value?.apiCapabilities ?? []);
/** 能力名 → 中文（原始动作名对用户没意义） */
const API_CAP_LABEL: Record<string, string> = {
  test: '连通自检',
  'product.list': '商品列表',
  'product.update': '改标题',
  'product.price': '改价',
  'product.stock': '改库存',
  'product.listing': '上下架',
  'inventory.get': '库存查询',
  'order.list': '订单列表',
  'order.ship': '回填运单',
};
const apiCapLabels = computed(() => apiCaps.value.map((c) => API_CAP_LABEL[c] || c));
const canTestApi = computed(() => !!props.shop?.hasSecret && apiInfo.value?.integration?.client === 'ready');
const apiBusy = ref(false);
const apiResult = ref<ShopProbeResult | null>(null);

watch(() => props.shop?.id, () => { apiResult.value = null; });

async function runApiTest(): Promise<void> {
  if (!props.shop) return;
  apiBusy.value = true;
  try {
    const r = await testShopApi(props.shop.id);
    if (r.error) { ElMessage.error(r.error); return; }
    apiResult.value = r.result || null;
  } finally {
    apiBusy.value = false;
  }
}

/** 仓库/物流类演示快照（按 shopName 索引；真实资源没有） */
const snapshot = computed<ShopDemoSnapshot | undefined>(() => {
  const c = props.shop;
  return c?.demo ? shopDemoData.value[c.shopName] : undefined;
});
const snapshotRows = computed(() =>
  (snapshot.value?.table?.rows || []).map((r) => Object.fromEntries(r.map((cell, i) => [`c${i}`, cell]))));

function orderStatusMeta(s: OrderStatus) {
  return ORDER_STATUS_META[s] ?? { label: s, tag: 'info' as const };
}
</script>
