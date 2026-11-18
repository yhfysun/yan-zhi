<template>
  <div class="shop-tab-body">
    <template v-if="shop">
      <template v-if="isStore">
        <header class="shop-overview-head">
          <div class="shop-overview-title">
            <h1>今日运营</h1>
            <p>{{ activeContext }} · {{ updatedLabel }}</p>
          </div>
          <div class="shop-overview-head-actions">
            <span class="shop-overview-date">今日</span>
            <button type="button" class="shop-overview-ai" @click="emit('ask-ai')">
              <el-icon :size="13"><MagicStick /></el-icon>
              问 AI
            </button>
          </div>
        </header>

        <div v-if="loading" class="shop-loading-shell" aria-label="正在读取经营看板">
          <i v-for="i in 5" :key="i"></i>
        </div>
        <div v-else-if="bizError" class="shop-check err">
          <div class="shop-check-head">看板读取失败</div>
          <p class="shop-hint-line">{{ bizError }}</p>
        </div>
        <template v-else-if="dashboard">
          <section class="shop-ops-kpis" aria-label="今日经营指标">
            <article class="shop-ops-kpi">
              <span>今日销售额</span>
              <strong>{{ money(dashboard.todaySalesCents, currency) }}</strong>
              <small>已付款且未退款</small>
            </article>
            <article class="shop-ops-kpi">
              <span>今日订单</span>
              <strong>{{ dashboard.todayOrders }}</strong>
              <small>含各状态订单</small>
            </article>
            <article class="shop-ops-kpi" :class="{ warn: dashboard.pendingShip > 0 }">
              <span>待发货</span>
              <strong>{{ dashboard.pendingShip }}</strong>
              <small>{{ dashboard.pendingShip ? '需要安排履约' : '履约队列已清空' }}</small>
            </article>
            <article class="shop-ops-kpi" :class="{ warn: !isDropship && dashboard.lowStock.length > 0 }">
              <span>低库存</span>
              <strong>{{ isDropship ? '不持库存' : dashboard.lowStock.length }}</strong>
              <small>{{ isDropship ? '无货源模式' : '低于安全库存' }}</small>
            </article>
            <article class="shop-ops-kpi">
              <span>最近自检</span>
              <strong class="text">{{ shop.lastCheckAt ? fmtTime(shop.lastCheckAt) : '未自检' }}</strong>
              <small>{{ check?.ok === false ? '存在配置缺项' : '配置状态可查看' }}</small>
            </article>
          </section>

          <div class="shop-ops-main">
            <section class="shop-ops-panel shop-ops-tasks" aria-labelledby="shop-tasks-title">
              <header class="shop-ops-panel-head">
                <div>
                  <h2 id="shop-tasks-title">需要你处理</h2>
                  <p>按风险和时限排序</p>
                </div>
                <button
                  v-if="operationTasks.length"
                  type="button"
                  class="shop-ops-secondary"
                  @click="openTask(operationTasks[0])"
                >
                  全部处理
                </button>
              </header>
              <div v-if="operationTasks.length" class="shop-ops-task-list">
                <button
                  v-for="task in operationTasks"
                  :key="task.key"
                  type="button"
                  class="shop-ops-task"
                  @click="openTask(task)"
                >
                  <span class="shop-ops-task-icon" :class="task.level">
                    <el-icon :size="14">
                      <WarningFilled v-if="task.level === 'warn'" />
                      <Box v-else />
                    </el-icon>
                  </span>
                  <span class="shop-ops-task-copy">
                    <strong>{{ task.title }}</strong>
                    <small>{{ task.desc }}</small>
                  </span>
                  <span class="shop-ops-task-badge">{{ task.level === 'warn' ? '待处理' : '建议' }}</span>
                  <span class="shop-ops-task-action">{{ task.action }}</span>
                </button>
              </div>
              <div v-else class="shop-ops-empty">
                <el-icon :size="18"><CircleCheck /></el-icon>
                <span>当前没有待处理事项</span>
              </div>
            </section>

            <section class="shop-ops-panel shop-ops-trend" aria-labelledby="shop-trend-title">
              <header class="shop-ops-panel-head">
                <div>
                  <h2 id="shop-trend-title">订单趋势</h2>
                  <p>近 14 天 · 本地业务库</p>
                </div>
                <span class="shop-ops-trend-total">{{ trendTotal }} 单</span>
              </header>
              <div class="shop-ops-chart">
                <svg viewBox="0 0 560 180" role="img" aria-label="近十四天订单趋势图">
                  <defs>
                    <linearGradient id="shop-trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#0f766e" stop-opacity=".2" />
                      <stop offset="100%" stop-color="#0f766e" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <line v-for="y in trendGridLines" :key="y" x1="28" :y1="y" x2="540" :y2="y" class="shop-chart-grid" />
                  <path :d="trendAreaPath" fill="url(#shop-trend-fill)" />
                  <path :d="trendPath" class="shop-chart-line" />
                  <circle v-for="point in trendPoints" :key="point.key" :cx="point.x" :cy="point.y" r="2.5" class="shop-chart-dot" />
                </svg>
                <div class="shop-chart-labels">
                  <span v-for="label in trendLabels" :key="label.key">{{ label.text }}</span>
                </div>
              </div>
            </section>
          </div>

          <section class="shop-ops-panel shop-ops-orders" aria-labelledby="shop-orders-title">
            <header class="shop-ops-panel-head">
              <div>
                <h2 id="shop-orders-title">最近订单</h2>
                <p>{{ dashboard.recentOrders.length }} 条最新记录</p>
              </div>
              <div class="shop-ops-orders-actions">
                <button type="button" class="shop-ops-secondary" @click="exportRecentOrders">导出</button>
                <button type="button" class="shop-ops-secondary" @click="emit('open-tab', 'orders')">查看全部</button>
              </div>
            </header>
            <el-table v-if="dashboard.recentOrders.length" :data="dashboard.recentOrders" size="small">
              <el-table-column prop="orderNo" label="订单号" min-width="150" />
              <el-table-column prop="buyer" label="买家" width="100" />
              <el-table-column label="金额" width="110">
                <template #default="{ row }">{{ money(row.amountCents, currency) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="orderStatusMeta(row.status).tag">{{ orderStatusMeta(row.status).label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="下单时间" width="150">
                <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
            <div v-else class="shop-ops-empty"><span>还没有订单。</span></div>
          </section>

          <details class="shop-detail-disclosure">
            <summary>店铺配置与诊断</summary>
            <div class="shop-detail-disclosure-body">
              <dl class="shop-kv">
                <div><dt>平台</dt><dd>{{ platformLabel(shop.platform) }}</dd></div>
                <div><dt>{{ siteFieldLabel }}</dt><dd>{{ shop.site || '—' }}</dd></div>
                <div><dt>卖家 ID</dt><dd>{{ shop.sellerId || '—' }}</dd></div>
                <div><dt>业务类型</dt><dd>{{ shopTypeMeta.label }} · {{ supplyMeta.label }}</dd></div>
                <div><dt>API 凭据</dt><dd>{{ shop.hasSecret ? '已配置' : '未配置（浏览器流程仍可执行）' }}</dd></div>
                <div v-if="shop.note"><dt>备注</dt><dd>{{ shop.note }}</dd></div>
              </dl>
              <div v-if="apiInfo && apiCaps.length" class="shop-detail-api">
                <p>平台能力：{{ apiCapLabels.join(' · ') }}</p>
                <div class="shop-logi-row">
                  <el-button size="small" :loading="apiBusy" :disabled="!canTestApi" @click="runApiTest()">API 连通性测试</el-button>
                  <span v-if="apiResult" class="shop-logi-note" :class="apiResult.ok ? 'ok' : 'err'">
                    {{ apiResult.ok ? '通过' : '失败' }} {{ apiResult.message }}
                  </span>
                </div>
              </div>
              <div v-if="check" class="shop-check" :class="check.ok ? 'ok' : 'err'">
                <div class="shop-check-head">{{ check.ok ? '配置完整' : '配置缺项' }}</div>
                <ul v-if="check.issues.length" class="shop-check-list">
                  <li v-for="(item, index) in check.issues" :key="`issue-${index}`" class="is-issue">{{ item }}</li>
                </ul>
                <ul v-if="check.hints.length" class="shop-check-list">
                  <li v-for="(item, index) in check.hints" :key="`hint-${index}`">{{ item }}</li>
                </ul>
              </div>
            </div>
          </details>
        </template>
      </template>

      <template v-else>
        <div class="shop-card">
          <div class="shop-card-head">
            <h3>{{ shop.shopName }}</h3>
            <el-tag size="small" effect="plain" :type="shopTypeMeta.tag">{{ shopTypeMeta.label }}</el-tag>
            <el-tag v-if="shop.isProduction" size="small" type="danger" effect="plain">生产资源</el-tag>
          </div>
          <dl class="shop-kv">
            <div><dt>平台</dt><dd>{{ platformLabel(shop.platform) }}</dd></div>
            <div><dt>{{ siteFieldLabel }}</dt><dd>{{ shop.site || '—' }}</dd></div>
            <div><dt>资源 ID</dt><dd>{{ shop.sellerId || '—' }}</dd></div>
            <div><dt>最近自检</dt><dd>{{ fmtTime(shop.lastCheckAt) }}</dd></div>
          </dl>
        </div>
        <div v-if="snapshot" class="shop-card">
          <div class="shop-card-head"><h3>资源快照</h3><el-tag size="small" type="info" effect="plain">演示</el-tag></div>
          <div class="shop-kpi-grid">
            <div v-for="k in snapshot.kpis" :key="k.label" class="shop-kpi">
              <span class="shop-kpi-label">{{ k.label }}</span>
              <span class="shop-kpi-value">{{ k.value }}</span>
              <span v-if="k.hint" class="shop-kpi-hint">{{ k.hint }}</span>
            </div>
          </div>
          <div v-if="snapshot.table" class="shop-snapshot-table">
            <p>{{ snapshot.table.title }}</p>
            <el-table :data="snapshotRows" size="small" border>
              <el-table-column
                v-for="(column, index) in snapshot.table.columns"
                :key="index"
                :prop="`c${index}`"
                :label="column"
                min-width="90"
              />
            </el-table>
          </div>
          <p class="shop-hint-line">{{ snapshot.note }}</p>
        </div>
      </template>
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
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Box, CircleCheck, MagicStick, WarningFilled } from '@element-plus/icons-vue';
import type { ShopConnection, ShopCheckResult, ShopDemoSnapshot } from '../../shopSession';
import { shopDemoData, shopPlatforms, testShopApi, type ShopProbeResult } from '../../shopSession';
import {
  bizDashboard, bizLoading, bizError, bizOrders, money, fmtTime, SHOP_TYPE_META, SUPPLY_META,
  ORDER_STATUS_META, type OrderStatus, type ShopType, type SupplyMode,
} from '../useShopApi';

const props = defineProps<{
  shop: ShopConnection | null;
  check: ShopCheckResult | null;
  activeProjectTitle?: string;
  platformLabel: (id: string) => string;
  kindOf: (id: string) => 'store' | 'warehouse' | 'logistics';
}>();
const emit = defineEmits<{
  (e: 'open-tab', tab: string): void;
  (e: 'ask-ai'): void;
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
const activeContext = computed(() => [
  props.activeProjectTitle || '',
  props.shop?.shopName || '',
  shopTypeMeta.value.label,
].filter(Boolean).join(' · '));
const updatedLabel = computed(() => {
  const latest = Math.max(
    Number(props.shop?.lastCheckAt) || 0,
    ...(bizOrders.value || []).map((order) => Number(order.createdAt) || 0),
  );
  return latest ? `${fmtTime(latest)} 更新` : '本地业务库';
});

type OperationTask = {
  key: string;
  title: string;
  desc: string;
  action: string;
  tab: string;
  level: 'warn' | 'info';
};

const operationTasks = computed<OperationTask[]>(() => {
  const tasks: OperationTask[] = [];
  const data = dashboard.value;
  if (data?.pendingShip) {
    tasks.push({
      key: 'pending-ship',
      title: `${data.pendingShip} 单待发货`,
      desc: '及时回填运单，避免履约超时',
      action: '处理',
      tab: 'shipments',
      level: 'warn',
    });
  }
  if (!isDropship.value && data?.lowStock.length) {
    const count = data.lowStock.length;
    tasks.push({
      key: 'low-stock',
      title: `${count} 个 SKU 低于安全库存`,
      desc: '建议先补充主推商品库存',
      action: '补货',
      tab: 'inventory',
      level: 'warn',
    });
  }
  if (bizError.value) {
    tasks.push({
      key: 'business-error',
      title: '经营数据读取异常',
      desc: bizError.value,
      action: '重试',
      tab: 'overview',
      level: 'warn',
    });
  }
  if (props.check && !props.check.ok) {
    tasks.push({
      key: 'shop-check',
      title: '店铺配置存在缺项',
      desc: props.check.issues[0] || '打开配置自检查看需要补充的字段',
      action: '检查',
      tab: 'overview',
      level: 'warn',
    });
  }
  if (props.shop && !props.shop.hasSecret && !isDropship.value) {
    tasks.push({
      key: 'credential',
      title: '平台 API 凭据未配置',
      desc: '浏览器流程可用，需要直连接口时再配置',
      action: '查看',
      tab: 'overview',
      level: 'info',
    });
  }
  return tasks.slice(0, 4);
});

const trendSeries = computed(() => {
  const days = 14;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - 1 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      date,
      count: 0,
    };
  });
  const byDay = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const order of bizOrders.value || []) {
    const date = new Date(Number(order.createdAt) || 0);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const bucket = byDay.get(key);
    if (bucket) bucket.count += 1;
  }
  return buckets;
});

const trendTotal = computed(() => trendSeries.value.reduce((sum, point) => sum + point.count, 0));
const trendChart = computed(() => {
  const width = 512;
  const height = 128;
  const left = 28;
  const top = 16;
  const bottom = 18;
  const max = Math.max(1, ...trendSeries.value.map((point) => point.count));
  const step = trendSeries.value.length > 1 ? width / (trendSeries.value.length - 1) : width;
  const points = trendSeries.value.map((point, index) => ({
    ...point,
    x: Number((left + step * index).toFixed(2)),
    y: Number((top + height - (point.count / max) * (height - bottom)).toFixed(2)),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points.at(-1)?.x || left} ${top + height} L ${points[0]?.x || left} ${top + height} Z`;
  return { points, line, area };
});
const trendPoints = computed(() => trendChart.value.points);
const trendPath = computed(() => trendChart.value.line);
const trendAreaPath = computed(() => trendChart.value.area);
const trendGridLines = [28, 64, 100, 136];
const trendLabels = computed(() => {
  const indexes = [0, 4, 8, 13];
  return indexes.map((index) => {
    const date = trendSeries.value[index]?.date;
    return {
      key: index,
      text: date ? `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}` : '',
    };
  });
});

function openTask(task: OperationTask): void {
  emit('open-tab', task.tab);
}

function exportRecentOrders(): void {
  const rows = dashboard.value?.recentOrders || [];
  if (!rows.length) {
    ElMessage.info('暂无可导出的订单');
    return;
  }
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['订单号', '买家', '金额', '状态', '下单时间'].map(escape).join(','),
    ...rows.map((row) => [
      row.orderNo,
      row.buyer || '',
      (row.amountCents / 100).toFixed(2),
      orderStatusMeta(row.status).label,
      fmtTime(row.createdAt),
    ].map(escape).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${props.shop?.shopName || '店铺'}-最近订单.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
