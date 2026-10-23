<template>
  <div class="shop-tab-body">
    <div class="shop-tab-toolbar">
      <el-input v-model="search" size="small" placeholder="搜 SKU / 标题" clearable style="width: 180px;" />
      <el-select v-model="status" size="small" style="width: 110px;" placeholder="全部状态">
        <el-option label="全部状态" value="" />
        <el-option label="草稿" value="draft" />
        <el-option label="在售" value="online" />
        <el-option label="已下架" value="offline" />
      </el-select>
      <template v-if="selected.length">
        <el-button size="small" :disabled="isProduction" @click="batch('online')">批量上架</el-button>
        <el-button size="small" :disabled="isProduction" @click="batch('offline')">批量下架</el-button>
        <el-button size="small" :disabled="isProduction" @click="openBatchPrice()">批量改价</el-button>
        <span class="shop-hint-line" style="margin: 0;">已选 {{ selected.length }} 个</span>
      </template>
      <span class="shop-spacer" />
      <el-button v-if="canImportProducts" size="small" :loading="importing" @click="openImport()">从平台导入</el-button>
      <el-button v-if="apiReady" size="small" :loading="fullSyncing" @click="runFullSync()">全量同步</el-button>
      <el-button v-if="apiReady" size="small" @click="openSyncCfg()">同步设置</el-button>
      <el-button size="small" type="primary" plain @click="openCreate()">＋ 新建商品</el-button>
    </div>

    <el-dialog v-model="syncCfg.visible" title="同步设置" width="480px" append-to-body>
      <el-form label-width="96px">
        <el-form-item label="冲突策略">
          <el-radio-group v-model="syncCfg.policy">
            <el-radio value="platform-first">平台优先（用平台值覆盖本地）</el-radio>
            <el-radio value="local-first">本地优先（保留本地价格/库存）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="定时间隔">
          <el-input-number v-model="syncCfg.intervalMin" :min="0" :step="15" />
          <span class="shop-form-tip">分钟；0 = 关闭定时同步（开启时最小 5 分钟；生产店铺不会自动跑，只能手动批准）</span>
        </el-form-item>
        <el-form-item label="最近同步">
          <div v-if="syncLog.length" class="shop-form-tip">
            <div v-for="(e, i) in syncLog.slice(0, 5)" :key="i">
              {{ fmtTime(e.at) }} · {{ e.trigger === 'scheduled' ? '定时' : '手动' }} · 新增 {{ e.imported }} / 更新 {{ e.updated }} / 冲突 {{ e.conflicts }} / 失败 {{ e.errors }}
              <span v-if="e.note">（{{ e.note }}）</span>
            </div>
          </div>
          <span v-else class="shop-form-tip">还没有同步记录</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="syncCfg.visible = false">取消</el-button>
        <el-button type="primary" :loading="syncCfg.saving" @click="saveSyncCfg()">保存设置</el-button>
      </template>
    </el-dialog>

    <p v-if="isDropship" class="shop-hint-line" style="margin: 0 0 8px;">
      无货源店铺：不持库存，商品带货源链接；出单后到「订单」页去采购 → 供应商直发。
    </p>
    <p v-if="isProduction" class="shop-hint-line shop-warn-line" style="margin: 0 0 8px;">
      生产店铺：禁止批量操作，请逐个处理；平台侧上架仍由代理适配器/后台执行。
    </p>

    <el-table
      v-if="filtered.length"
      :data="filtered"
      size="small"
      @selection-change="(rows: BizProduct[]) => (selected = rows)"
    >
      <el-table-column type="selection" width="38" />
      <el-table-column prop="sku" label="SKU" width="120">
        <template #default="{ row }"><span class="shop-mono">{{ row.sku }}</span></template>
      </el-table-column>
      <el-table-column prop="title" label="商品" min-width="190" show-overflow-tooltip />
      <el-table-column label="货源" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <a v-if="row.sourceRef" :href="row.sourceRef" target="_blank" rel="noreferrer noopener">{{ row.sourceRef }}</a>
          <span v-else class="shop-na">自营</span>
        </template>
      </el-table-column>
      <el-table-column label="成本" width="86">
        <template #default="{ row }">{{ money(row.costCents, row.currency) }}</template>
      </el-table-column>
      <el-table-column label="售价" width="86">
        <template #default="{ row }">{{ money(row.priceCents, row.currency) }}</template>
      </el-table-column>
      <el-table-column label="毛利" width="90">
        <template #default="{ row }">
          <span :class="{ 'shop-warn-line': row.priceCents - row.costCents < 0 }">{{ money(row.priceCents - row.costCents, row.currency) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="库存" width="90">
        <template #default="{ row }">
          <span v-if="row.supplyMode === 'dropship'" class="shop-na">不持库存</span>
          <span v-else :class="{ 'shop-warn-line': row.stock <= row.safetyStock }">{{ row.stock }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="listingMeta(row.listingStatus).tag">
            {{ listingMeta(row.listingStatus).label }}
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
      <el-table-column label="更新时间" width="130">
        <template #default="{ row }">{{ fmtTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="toggleListing(row)">{{ row.listingStatus === 'online' ? '下架' : '上架' }}</el-button>
          <el-button link size="small" @click="openPrice(row)">改价</el-button>
          <el-button v-if="row.supplyMode !== 'dropship'" link size="small" @click="openStock(row)">改库存</el-button>
          <el-button link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="apiReady" link size="small" type="primary" @click="openSync(row)">同步</el-button>
          <el-button link size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-else class="shop-placeholder">
      <p v-if="bizLoading">正在读取商品…</p>
      <p v-else-if="bizError">{{ bizError }}</p>
      <p v-else>还没有商品。点「＋ 新建商品」建一个，或在 AI 工作台让助手建。</p>
    </div>

    <!-- 改价 -->
    <el-dialog v-model="price.visible" title="改价" width="380px" append-to-body>
      <el-form label-width="72px">
        <el-form-item label="商品"><span>{{ price.product?.sku }} · {{ price.product?.title }}</span></el-form-item>
        <el-form-item label="现价"><span>{{ money(price.product?.priceCents || 0, price.product?.currency) }}</span></el-form-item>
        <el-form-item label="新价格">
          <el-input-number v-model="price.value" :min="0.01" :precision="2" :step="1" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="price.visible = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submitPrice()">确定改价</el-button>
      </template>
    </el-dialog>

    <!-- 改库存（入库 / 出库 / 盘点） -->
    <el-dialog v-model="stock.visible" title="改库存" width="420px" append-to-body>
      <el-form label-width="84px">
        <el-form-item label="商品"><span>{{ stock.product?.sku }} · {{ stock.product?.title }}</span></el-form-item>
        <el-form-item label="当前库存"><span>{{ stock.product?.stock ?? 0 }}</span></el-form-item>
        <el-form-item label="动作">
          <el-radio-group v-model="stock.kind">
            <el-radio-button value="in">入库</el-radio-button>
            <el-radio-button value="out">出库</el-radio-button>
            <el-radio-button value="adjust">盘点差额</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="stock.kind === 'adjust' ? '差额（可负）' : '数量'">
          <el-input-number v-model="stock.qty" :min="stock.kind === 'adjust' ? -99999 : 1" :step="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="stock.reason" size="small" placeholder="选填，如：补货入库 / 订单出库 / 盘点" />
        </el-form-item>
      </el-form>
      <p class="shop-hint-line">预计库存：{{ stockPreview }}（每次变更都会写库存流水并留审计）</p>
      <template #footer>
        <el-button @click="stock.visible = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submitStock()">确定</el-button>
      </template>
    </el-dialog>

    <ShopProductDrawer
      v-model="drawer.visible"
      :shop="shop"
      :product="drawer.product"
      @saved="onSaved()"
    />

    <!-- 批量改价（生产店铺禁用；逐条经 runShopAction，逐条留审计） -->
    <el-dialog v-model="batchPrice.visible" title="批量改价" width="420px" append-to-body>
      <p class="shop-hint-line" style="margin: 0 0 10px;">
        已选 {{ selected.length }} 个商品，统一改为：
      </p>
      <el-input-number v-model="batchPrice.value" :min="0.01" :precision="2" :step="1" style="width: 100%;" />
      <p class="shop-hint-line">币种随商品自身（美元店按美元），统一写入整数分。</p>
      <template #footer>
        <el-button @click="batchPrice.visible = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submitBatchPrice()">确认改价</el-button>
      </template>
    </el-dialog>

    <!-- 平台 → 本地导入 -->
    <el-dialog v-model="importDlg.visible" title="从平台导入商品" width="480px" append-to-body>
      <el-form label-width="88px">
        <template v-if="shop?.platform === 'amazon'">
          <el-form-item label="关键词">
            <el-input v-model="importDlg.keywords" placeholder="如 bamboo organizer" />
          </el-form-item>
          <el-form-item label="ASIN">
            <el-input v-model="importDlg.asins" placeholder="多个用逗号分隔（与关键词二选一）" />
          </el-form-item>
        </template>
        <el-form-item label="数量上限">
          <el-input-number v-model="importDlg.limit" :min="1" :max="250" :step="10" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <p class="shop-hint-line">
        按 SKU 合并：已有商品更新字段并写入平台 ID，新商品创建到本地。导入后即可在行内点「同步」把本地改动推回平台。
      </p>
      <template #footer>
        <el-button @click="importDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="submitImport()">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 本地 → 平台推送 -->
    <el-dialog v-model="syncDlg.visible" title="同步到平台" width="460px" append-to-body>
      <p class="shop-hint-line" style="margin: 0 0 8px;">
        {{ syncDlg.product?.sku }} · {{ syncDlg.product?.title }}
      </p>
      <el-checkbox-group v-model="syncDlg.fields">
        <el-checkbox value="price">价格</el-checkbox>
        <el-checkbox value="stock">库存</el-checkbox>
        <el-checkbox value="title">标题</el-checkbox>
        <el-checkbox value="listing">上下架状态</el-checkbox>
      </el-checkbox-group>
      <p v-if="isProduction" style="margin-top: 10px;">
        <el-checkbox v-model="syncDlg.approve">生产店铺：我已核对并批准本次同步</el-checkbox>
      </p>
      <p class="shop-hint-line">
        需要商品 attrs 里有平台 ID（从平台导入的商品会自动带上）；平台不支持或缺少 ID 时会如实失败。
      </p>
      <template #footer>
        <el-button @click="syncDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="syncing" @click="submitSync()">开始同步</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 商品页签：本地业务库的商品 CRUD + 上下架 + 改价 + 改库存（写操作直接落库并留审计）。
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ShopProductDrawer from '../ShopProductDrawer.vue';
import { shopPlatforms, type ShopConnection } from '../../shopSession';
import {
  bizProducts, bizLoading, bizError, bizLastSummary,
  money, fmtTime, LISTING_STATUS_META,
  setListingApi, setPriceApi, changeStockApi, deleteProductApi, batchProductApi,
  importProductsApi, pushProductApi, syncStatusOf,
  fullSyncApi, saveSyncConfigApi, syncLogApi, type SyncRunEntry,
  type BizProduct, type ListingStatus,
} from '../useShopApi';

const props = defineProps<{ shop: ShopConnection | null }>();

const search = ref('');
const status = ref('');
const selected = ref<BizProduct[]>([]);
const isDropship = computed(() => (props.shop?.supplyMode ?? 'stocked') === 'dropship');
const isProduction = computed(() => (props.shop?.shopType ?? (props.shop?.isProduction ? 'production' : 'test')) === 'production');
const apiCaps = computed(() => shopPlatforms.value.find((p) => p.id === props.shop?.platform)?.apiCapabilities ?? []);
const apiReady = computed(() => !!props.shop?.hasSecret && apiCaps.value.length > 0);
const canImportProducts = computed(() => !!props.shop?.hasSecret && apiCaps.value.includes('product.list'));

// ===== 同步增强（D）：全量同步 + 策略/定时间隔 =====
const fullSyncing = ref(false);
const syncLog = ref<SyncRunEntry[]>([]);
const syncCfg = reactive({
  visible: false,
  policy: 'platform-first' as 'local-first' | 'platform-first',
  intervalMin: 0,
  saving: false,
});

function openSyncCfg(): void {
  syncCfg.policy = props.shop?.syncPolicy ?? 'platform-first';
  syncCfg.intervalMin = props.shop?.syncIntervalMin ?? 0;
  syncCfg.visible = true;
  if (props.shop) {
    void syncLogApi(props.shop.id).then((r) => { if (!r.error) syncLog.value = r.entries; });
  }
}

async function saveSyncCfg(): Promise<void> {
  if (!props.shop) return;
  syncCfg.saving = true;
  try {
    const err = await saveSyncConfigApi(props.shop.id, {
      syncPolicy: syncCfg.policy,
      syncIntervalMin: Number(syncCfg.intervalMin) || 0,
    });
    if (err) { ElMessage.error(err); return; }
    // 同步更新当前连接对象，避免重开设置弹窗还显示旧值（下次刷新会从后端重新拉）
    props.shop.syncPolicy = syncCfg.policy;
    props.shop.syncIntervalMin = Number(syncCfg.intervalMin) || 0;
    ElMessage.success('同步设置已保存');
    syncCfg.visible = false;
  } finally {
    syncCfg.saving = false;
  }
}

async function runFullSync(): Promise<void> {
  if (!props.shop) return;
  let approve = false;
  if (isProduction.value) {
    try {
      await ElMessageBox.confirm('生产店铺全量同步会按当前冲突策略更新本地数据。确认继续？', '生产店铺批准', {
        type: 'warning', confirmButtonText: '批准同步', cancelButtonText: '取消',
      });
      approve = true;
    } catch { return; }
  }
  fullSyncing.value = true;
  try {
    const r = await fullSyncApi(props.shop.id, approve);
    if (r.error) { ElMessage.error(r.error); return; }
    const e = r.entry;
    if (!e) return;
    const msg = `全量同步：新增 ${e.imported}，更新 ${e.updated}，冲突 ${e.conflicts}，失败 ${e.errors}`;
    if (e.ok) ElMessage.success(msg);
    else ElMessage.warning(`${msg}${e.note ? `（${e.note}）` : ''}`);
  } finally {
    fullSyncing.value = false;
  }
}

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase();
  return bizProducts.value.filter((p) => {
    if (status.value && p.listingStatus !== status.value) return false;
    if (!kw) return true;
    return p.sku.toLowerCase().includes(kw) || p.title.toLowerCase().includes(kw);
  });
});

/** 行内状态可能是 any（el-table slot），统一收口 */
function listingMeta(s: string): { label: string; tag: 'info' | 'success' | 'warning' } {
  return LISTING_STATUS_META[s as ListingStatus] ?? { label: s, tag: 'info' };
}

const busy = ref(false);
async function run(work: () => Promise<string>, okText = '已保存'): Promise<void> {
  busy.value = true;
  try {
    const err = await work();
    if (err) { ElMessage.error(err); return; }
    ElMessage.success(bizLastSummary.value || okText);
  } finally {
    busy.value = false;
  }
}

async function toggleListing(row: BizProduct): Promise<void> {
  const next = row.listingStatus !== 'online';
  await run(() => setListingApi(shopId(), row.id, next), next ? '已上架（本地库）' : '已下架');
}
async function batch(listing: 'online' | 'offline'): Promise<void> {
  if (!selected.value.length) return;
  await run(() => batchProductApi(shopId(), selected.value.map((p) => p.id), 'listing', { listing }), '批量操作完成');
}

// 批量改价
const batchPrice = reactive<{ visible: boolean; value: number }>({ visible: false, value: 0 });
function openBatchPrice(): void {
  if (!selected.value.length) return;
  batchPrice.value = Number(((selected.value[0]?.priceCents || 0) / 100).toFixed(2));
  batchPrice.visible = true;
}
async function submitBatchPrice(): Promise<void> {
  if (!selected.value.length) return;
  const cents = Math.round(batchPrice.value * 100);
  await run(
    () => batchProductApi(shopId(), selected.value.map((p) => p.id), 'price', { newPriceCents: cents }),
    '批量改价完成',
  );
  batchPrice.visible = false;
}

// 改价
const price = reactive<{ visible: boolean; product: BizProduct | null; value: number }>({ visible: false, product: null, value: 0 });
function openPrice(row: BizProduct): void {
  price.product = row;
  price.value = Number((row.priceCents / 100).toFixed(2));
  price.visible = true;
}
async function submitPrice(): Promise<void> {
  if (!price.product) return;
  const cents = Math.round(price.value * 100);
  await run(() => setPriceApi(shopId(), price.product!.id, cents), '价格已更新');
  price.visible = false;
}

// 改库存
const stock = reactive<{ visible: boolean; product: BizProduct | null; kind: 'in' | 'out' | 'adjust'; qty: number; reason: string }>({
  visible: false, product: null, kind: 'in', qty: 1, reason: '',
});
const stockPreview = computed(() => {
  const base = stock.product?.stock || 0;
  const delta = stock.kind === 'adjust' ? stock.qty : stock.kind === 'in' ? Math.abs(stock.qty) : -Math.abs(stock.qty);
  return base + delta;
});
function openStock(row: BizProduct): void {
  stock.product = row;
  stock.kind = 'in';
  stock.qty = 1;
  stock.reason = '';
  stock.visible = true;
}
async function submitStock(): Promise<void> {
  if (!stock.product || !stock.qty) { ElMessage.warning('数量不能为 0'); return; }
  const qty = stock.kind === 'adjust' ? stock.qty : Math.abs(stock.qty);
  await run(() => changeStockApi(shopId(), stock.product!.id, stock.kind, qty, stock.reason || undefined), '库存已更新');
  stock.visible = false;
}

// 新建 / 编辑
const drawer = reactive<{ visible: boolean; product: BizProduct | null }>({ visible: false, product: null });
function openCreate(): void { drawer.product = null; drawer.visible = true; }
function openEdit(row: BizProduct): void { drawer.product = row; drawer.visible = true; }
function onSaved(): void { drawer.visible = false; }

async function remove(row: BizProduct): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除商品「${row.sku} · ${row.title}」？本地库硬删并记审计；订单/发货记录不会删。`,
      '删除商品', { type: 'warning' },
    );
  } catch { return; }
  await run(() => deleteProductApi(shopId(), row.id), '商品已删除');
}

function shopId(): string { return props.shop?.id || ''; }

// ===== 平台 → 本地导入 =====
const importing = ref(false);
const importDlg = reactive({ visible: false, keywords: '', asins: '', limit: 50 });

function openImport(): void {
  importDlg.keywords = '';
  importDlg.asins = '';
  importDlg.limit = 50;
  importDlg.visible = true;
}

async function submitImport(): Promise<void> {
  if (!props.shop) return;
  const asins = importDlg.asins.split(',').map((s) => s.trim()).filter(Boolean);
  let approve = false;
  if (isProduction.value) {
    try {
      await ElMessageBox.confirm(
        '生产店铺从平台导入会按“平台优先”更新本地价格/库存。确认继续？',
        '生产店铺批准',
        { type: 'warning', confirmButtonText: '批准导入', cancelButtonText: '取消' },
      );
      approve = true;
    } catch { return; }
  }
  importing.value = true;
  try {
    const r = await importProductsApi(props.shop.id, {
      keywords: importDlg.keywords.trim() || undefined,
      asins: asins.length ? asins : undefined,
      limit: importDlg.limit,
      approveProduction: approve,
    });
    if (r.error) { ElMessage.error(r.error); return; }
    const s = r.summary;
    if (s) {
      ElMessage.success(`平台商品导入：新增 ${s.imported}，更新 ${s.updated}，冲突保留本地 ${s.conflicts ?? 0}，跳过 ${s.skipped}`);
      if (s.errors.length) ElMessage.warning(`部分失败：${s.errors.slice(0, 3).join('；')}${s.errors.length > 3 ? ' …' : ''}`);
    }
    importDlg.visible = false;
  } finally {
    importing.value = false;
  }
}

// ===== 本地 → 平台推送 =====
const syncing = ref(false);
const syncDlg = reactive<{ visible: boolean; product: BizProduct | null; fields: string[]; approve: boolean }>({
  visible: false, product: null, fields: ['price', 'stock'], approve: false,
});

function openSync(row: BizProduct): void {
  syncDlg.product = row;
  syncDlg.fields = ['price', 'stock'];
  syncDlg.approve = false;
  syncDlg.visible = true;
}

async function submitSync(): Promise<void> {
  if (!props.shop || !syncDlg.product) return;
  if (!syncDlg.fields.length) { ElMessage.warning('至少选择一个字段'); return; }
  if (isProduction.value && !syncDlg.approve) { ElMessage.warning('生产店铺需要勾选批准'); return; }
  syncing.value = true;
  try {
    const r = await pushProductApi(
      props.shop.id,
      syncDlg.product.id,
      syncDlg.fields as Array<'price' | 'stock' | 'title' | 'listing'>,
      syncDlg.approve,
    );
    if (r.error) { ElMessage.error(r.error); return; }
    if (r.ticket) { ElMessage.warning(`未执行：${r.ticket}`); return; }
    if (r.result) {
      if (r.result.ok) ElMessage.success(r.result.message);
      else ElMessage.warning(r.result.message);
    }
    syncDlg.visible = false;
  } finally {
    syncing.value = false;
  }
}
</script>
