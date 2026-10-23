<template>
  <ConsoleShell storage-key="shop_aside" root-class="shop-console" :default-width="260">
    <!-- ============ 左栏：项目 + 资源（ShopSidebar） ============ -->
    <template #aside>
      <ShopSidebar
        :projects="shopProjects"
        :active-project-id="activeProjectId"
        :shops="projectConns"
        :active-shop-id="shopActiveId"
        :orphan-count="orphanCount"
        :demo-count="demoShops.length"
        :demo-busy="demoBusy"
        :counts="projectCounts"
        @select-project="switchProject"
        @create-project="createProject"
        @delete-project="deleteProject"
        @select-shop="selectShop"
        @create-connection="openCreate()"
        @seed-demo="makeDemos"
        @clear-demo="clearDemos"
      />
    </template>

    <!-- ============ 主区：工作台（工具条 + 页签） + 常驻 AI 对话栏 ============ -->
    <section
      class="shop-main"
      :class="{ 'is-lead-ai': lead === 'ai', 'is-chat-collapsed': chatCollapsed }"
      :style="{ '--shop-chat-w': chatR.width.value + 'px' }"
    >
      <div class="shop-work">
        <ShopToolbar
          :shop="active"
          :active-project-title="activeProjectTitle"
          :is-store="isStore"
          :lead="lead"
          :checking="checking"
          @update:shop-type="onShopType"
          @update:supply-mode="onSupplyMode"
          @update:lead="onLeadChange"
          @check="runCheck()"
          @edit="openEdit()"
          @remove="removeShop()"
          @open-platform="tab = 'platform'"
        />

        <el-tabs v-model="tab" class="shop-tabs">
          <el-tab-pane label="概览" name="overview">
            <ShopOverview :shop="active" :check="checkForActive" :platform-label="platformLabel" :kind-of="kindOf" />
          </el-tab-pane>

          <template v-if="isStore">
            <el-tab-pane :label="`商品（${bizProducts.length}）`" name="products">
              <ShopProducts :shop="active" />
            </el-tab-pane>
            <el-tab-pane :label="`订单（${bizOrders.length}）`" name="orders">
              <ShopOrders :shop="active" />
            </el-tab-pane>
            <el-tab-pane :label="`发货（${bizShipments.length}）`" name="shipments">
              <ShopShipments :shop="active" />
            </el-tab-pane>
            <el-tab-pane v-if="!isDropship" label="库存" name="inventory">
              <ShopInventory :shop="active" />
            </el-tab-pane>
            <el-tab-pane label="平台后台" name="platform">
              <ShopPlatformView :shop="active" />
            </el-tab-pane>
          </template>

          <el-tab-pane v-if="isLogistics" label="物流" name="logistics">
            <ShopLogistics :shop="active" />
          </el-tab-pane>

          <el-tab-pane v-if="isWinit" label="出库单" name="outbound">
            <ShopWinitOutbound :shop="active" />
          </el-tab-pane>

          <el-tab-pane :label="`操作日志（${shopAudit.length}）`" name="audit">
            <ShopAudit />
          </el-tab-pane>
          <el-tab-pane label="口径速查" name="reference">
            <ShopReference />
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 拖拽条：工作台 ↔ 对话栏（任一侧收起时不渲染） -->
      <div
        v-show="!chatCollapsed"
        class="rs-handle"
        :class="{ dragging: chatR.dragging.value }"
        @mousedown="chatR.startDrag($event, 'right')"
      ></div>

      <!-- 常驻 AI 对话栏：与办公/开发/剪辑共用同一份会话（chat.css 由下方 style src 引入） -->
      <aside v-show="!chatCollapsed" class="shop-chat">
        <div class="shop-chat-head">
          <el-icon :size="13" class="shop-chat-icon"><ChatDotRound /></el-icon>
          <span class="shop-chat-title">AI 助手</span>
          <span class="shop-chat-spacer"></span>
          <LeadToggle :model-value="lead" mode="shop" @update:model-value="onLeadChange" />
          <button class="shop-chat-btn" title="收起对话" @click="chatCollapsed = true">
            <el-icon :size="12"><ArrowRight /></el-icon>
          </button>
        </div>
        <ChatMessageList />
        <ChatInputArea />
      </aside>

      <!-- 对话栏收起后右下角的悬浮入口 -->
      <button v-if="chatCollapsed" class="shop-chat-fab" title="展开 AI 对话" @click="chatCollapsed = false">
        <el-icon :size="13"><ChatDotRound /></el-icon><span>AI</span>
      </button>
    </section>

    <ChatDialogs />

    <ShopConnectionDialog
      v-model="connDialog.visible"
      :editing="connDialog.editing"
      :project-id="activeProjectId"
      @saved="connDialog.visible = false"
    />
  </ConsoleShell>
</template>

<script setup lang="ts">
// 店铺运营控制台壳（/shop）：左栏项目/资源 + 顶部工作条 + 页签 + 常驻 AI 对话栏。
// 页签内容全部拆到 ./shop/tabs/*；本文件只负责布局与页面级状态（2026-10-22 重构 §6）。
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ChatDotRound, ArrowRight } from '@element-plus/icons-vue';
import ConsoleShell from '../../components/console/ConsoleShell.vue';
import ChatMessageList from '../../components/chat/ChatMessageList.vue';
import ChatInputArea from '../../components/chat/ChatInputArea.vue';
import ChatDialogs from '../../components/chat/ChatDialogs.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import { useChatStore } from '../../stores/chat';
import { useChat } from '../../composables/chat/useChat';
import { useResizable } from '../../composables/useResizable';
import { activeMode, leadOf, setLead, type LeadMode } from '../../stores/mode';
import ShopSidebar from './shop/ShopSidebar.vue';
import ShopToolbar from './shop/ShopToolbar.vue';
import ShopConnectionDialog from './shop/ShopConnectionDialog.vue';
import ShopOverview from './shop/tabs/ShopOverview.vue';
import ShopProducts from './shop/tabs/ShopProducts.vue';
import ShopOrders from './shop/tabs/ShopOrders.vue';
import ShopShipments from './shop/tabs/ShopShipments.vue';
import ShopInventory from './shop/tabs/ShopInventory.vue';
import ShopLogistics from './shop/tabs/ShopLogistics.vue';
import ShopWinitOutbound from './shop/tabs/ShopWinitOutbound.vue';
import ShopPlatformView from './shop/tabs/ShopPlatformView.vue';
import ShopAudit from './shop/tabs/ShopAudit.vue';
import ShopReference from './shop/tabs/ShopReference.vue';
import {
  shopConnections, shopPlatforms, shopActiveId, shopCheck, shopCheckId, shopAudit,
  loadShopConsole, selectShop, deleteShop, checkShop,
  seedDemoShops, clearDemoShops, getDemoTemplates, reassignProject,
  type ShopConnection,
} from './shopSession';
import {
  bizProducts, bizOrders, bizShipments, loadShopBiz, refreshShopBiz,
  updateShopModeApi, type ShopType, type SupplyMode,
} from './shop/useShopApi';

// 对话栏：宽度可拖拽并持久化（与运维/工作流同一个 useResizable）
const chatR = useResizable('shop_chat', 360, 280, 760);
/** 小屏（<1100）首次进入先收起对话栏，用右下角悬浮入口展开；宽屏保持常驻。 */
const chatCollapsed = ref(typeof window !== 'undefined' && window.innerWidth < 1100);
/** 主导方：human=工作台居中+对话在右；ai=对话居中（LeadToggle / 工作台切换同步生效） */
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
function onLeadChange(v: LeadMode): void {
  setLead(activeMode.value, v);
}

// ===== 项目 = 一条店铺会话（与剪辑项目同模型；切项目 = 切整块对话上下文）=====
const chat = useChat();
const chatStore = useChatStore();
const shopProjects = computed(() => chatStore.conversations);
/** 当前项目 id；'' = 未归属（历史连接 / 还没建项目） */
const activeProjectId = ref('');
const activeProjectTitle = computed(() =>
  shopProjects.value.find((p) => p.id === activeProjectId.value)?.title
  || (activeProjectId.value ? '未命名项目' : '未归属资源'));

watch(() => chatStore.currentConvId, (id) => { activeProjectId.value = id || ''; }, { immediate: true });

const projectConns = computed(() =>
  shopConnections.value.filter((c) => (c.projectId || '') === activeProjectId.value));
const orphanCount = computed(() => shopConnections.value.filter((c) => !c.projectId).length);
const projectCounts = computed(() => {
  const map: Record<string, number> = {};
  for (const c of shopConnections.value) {
    const key = c.projectId || '';
    map[key] = (map[key] || 0) + 1;
  }
  return map;
});

const active = computed(() => projectConns.value.find((c) => c.id === shopActiveId.value) || null);

function platformLabel(id: string): string {
  return shopPlatforms.value.find((p) => p.id === id)?.label || id;
}
function kindOf(id: string): 'store' | 'warehouse' | 'logistics' {
  return (shopPlatforms.value.find((p) => p.id === id)?.kind ?? 'store') as 'store' | 'warehouse' | 'logistics';
}
const activeKind = computed(() => (active.value ? kindOf(active.value.platform) : 'store'));
const isStore = computed(() => !!active.value && activeKind.value === 'store');
const isLogistics = computed(() => !!active.value && activeKind.value === 'logistics');
const isWinit = computed(() => active.value?.platform === 'winit');
const isDropship = computed(() => (active.value?.supplyMode ?? 'stocked') === 'dropship');

// ===== 页签 =====
type ShopTab = 'overview' | 'products' | 'orders' | 'shipments' | 'inventory' | 'platform' | 'logistics' | 'outbound' | 'audit' | 'reference';
const tab = ref<ShopTab>('overview');

/** 切店后保证当前页签对这类资源仍可见（否则 el-tabs 会停在隐藏面板上显示空白） */
function ensureTabVisible(): void {
  if (!active.value) return;
  if (isLogistics.value) {
    if (!['overview', 'logistics', 'audit', 'reference'].includes(tab.value)) tab.value = 'logistics';
    return;
  }
  if (!isStore.value) {
    const allowed = isWinit.value ? ['overview', 'outbound', 'audit', 'reference'] : ['overview', 'audit', 'reference'];
    if (!allowed.includes(tab.value)) tab.value = 'overview';
    return;
  }
  if (tab.value === 'logistics' || (tab.value === 'inventory' && isDropship.value)) tab.value = 'overview';
}

/** 选中店铺变化 → 保证页签合法 + 拉该店业务数据（仅店铺类） */
watch(() => active.value?.id, (id) => {
  ensureTabVisible();
  if (!id) return;
  if (isStore.value) void loadShopBiz(id);
}, { immediate: true });

watch(isDropship, () => ensureTabVisible());

// 连接列表刷新（新建/删除/演示数据）后，若当前选中项不在本项目，自动落到本项目第一条
watch(projectConns, (list) => {
  if (active.value) return;
  const first = list[0];
  if (first) selectShop(first.id);
});

// 自检结果必须与当前选中的店铺同 id 才显示（换店后旧结论不能串台）
const checkForActive = computed(() =>
  (shopCheckId.value && shopCheckId.value === shopActiveId.value ? shopCheck.value : null));
const checking = ref(false);

// ===== 项目/店铺切换 =====
async function switchProject(id: string): Promise<void> {
  if (id === activeProjectId.value) return;
  selectShop('');
  activeProjectId.value = id;
  const first = shopConnections.value.find((c) => (c.projectId || '') === id);
  if (first) selectShop(first.id);
  if (!id) return;
  try { await chat.selectConv(id); } catch { /* 会话可能已删：保持空项目 */ }
}

async function createProject(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('项目名称（例：家居出海）', '新建店铺项目', {
      inputPlaceholder: '未命名店铺项目',
      inputValidator: (v: string) => (!!String(v || '').trim() || '项目名称必填'),
    });
    const id = await chatStore.createConversation(String(value).trim());
    await chat.selectConv(id);
    selectShop('');
    tab.value = 'overview';
  } catch { /* 取消 */ }
}

/** 删除项目 = 删这条店铺会话；资源先迁出（演示数据清除，真实资源归到未归属） */
async function deleteProject(p: { id: string; title?: string }): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除项目「${p.title || '未命名'}」？项目里的演示数据会清除，你自己登记的资源会移到「未归属资源」，不会删连接本身。`,
      '删除项目',
      { type: 'warning' },
    );
  } catch { return; }
  const err = await reassignProject(p.id);
  if (err) { ElMessage.error(err); return; }
  await chatStore.deleteConversation(p.id);
  if (activeProjectId.value === p.id) {
    activeProjectId.value = '';
    selectShop('');
  }
  ElMessage.success('项目已删除');
}

// ===== 连接弹窗 =====
const connDialog = ref<{ visible: boolean; editing: ShopConnection | null }>({ visible: false, editing: null });

function openCreate(): void {
  if (!activeProjectId.value) {
    ElMessage.warning('先在左侧新建一个店铺项目，资源都归属到项目里');
    return;
  }
  connDialog.value = { visible: true, editing: null };
}
function openEdit(): void {
  if (!active.value) return;
  connDialog.value = { visible: true, editing: active.value };
}

async function runCheck(): Promise<void> {
  const c = active.value;
  if (!c) return;
  checking.value = true;
  try {
    const err = await checkShop(c.id);
    if (err) ElMessage.error(err);
  } finally {
    checking.value = false;
  }
}

async function removeShop(): Promise<void> {
  const c = active.value;
  if (!c) return;
  try {
    await ElMessageBox.confirm(
      `删除登记「${c.shopName}」？只删这条记录，不动任何线上数据。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch { return; }
  const err = await deleteShop(c.id);
  if (err) ElMessage.error(err);
  else ElMessage.success('已删除');
}

// ===== 店铺类型 / 货源模式（写审计）=====
async function onShopType(next: ShopType): Promise<void> {
  const c = active.value;
  if (!c || next === (c.shopType ?? (c.demo ? 'demo' : c.isProduction ? 'production' : 'test'))) return;
  const label = next === 'demo' ? '演示' : next === 'production' ? '生产' : '测试';
  try {
    await ElMessageBox.confirm(
      `把「${c.shopName}」的店铺类型改为「${label}」？只改类型与数据源口径，不迁移已有数据。`
      + (next === 'production' ? '\n生产店铺的写操作将额外要求人工批准，且禁止批量。' : ''),
      '修改店铺类型', { type: 'warning' },
    );
  } catch { return; }
  const err = await updateShopModeApi(c.id, { shopType: next });
  if (err) { ElMessage.error(err); return; }
  await loadShopConsole(true);
  await refreshShopBiz();
  ElMessage.success(`已切换为「${label}」`);
}

async function onSupplyMode(next: SupplyMode): Promise<void> {
  const c = active.value;
  if (!c || next === (c.supplyMode ?? 'stocked')) return;
  const label = next === 'dropship' ? '无货源' : '有货源';
  try {
    await ElMessageBox.confirm(
      `把「${c.shopName}」切到「${label}」？只改口径：不删除已有库存数据（字段保留、界面隐藏），商品与订单动作按新模式展示。`,
      '修改货源模式', { type: 'warning' },
    );
  } catch { return; }
  const err = await updateShopModeApi(c.id, { supplyMode: next });
  if (err) { ElMessage.error(err); return; }
  await loadShopConsole(true);
  await refreshShopBiz();
  ElMessage.success(`已切换为「${label}」`);
}

// ===== 演示数据（按项目隔离）=====
const demoShops = computed(() => projectConns.value.filter((c) => c.demo));
const demoBusy = ref(false);

async function makeDemos(): Promise<void> {
  demoBusy.value = true;
  try {
    const { error, items } = await getDemoTemplates();
    if (error) { ElMessage.error(error); return; }
    if (!items.length) { ElMessage.warning('后端没有可用的演示模板'); return; }
    let first = '';
    for (const t of items) {
      // 同名项目已存在则复用，避免点两次生成两套
      const existing = chatStore.conversations.find((c) => (c.title || '') === t.title);
      const pid = existing?.id || await chatStore.createConversation(t.title);
      const err = await seedDemoShops(pid, t.key);
      if (err) { ElMessage.error(err); return; }
      if (!first) first = pid;
    }
    await chatStore.loadConversations();
    if (first) await chat.selectConv(first);
    await loadShopConsole(true);
    ElMessage.success(`已创建 ${items.length} 个演示项目 —— 带「演示」标记，可一键清空`);
  } finally {
    demoBusy.value = false;
  }
}

async function clearDemos(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `清空当前项目的 ${demoShops.value.length} 条演示数据？只删带「演示」标记的记录，你自己登记的一条不动。`,
      '清空演示数据',
      { type: 'warning' },
    );
  } catch { return; }
  demoBusy.value = true;
  try {
    const err = await clearDemoShops(activeProjectId.value || undefined);
    if (err) ElMessage.error(err);
    else ElMessage.success('演示数据已清空');
  } finally {
    demoBusy.value = false;
  }
}

onMounted(async () => {
  await loadShopConsole();
  // 进店铺模式：项目 = 店铺会话。没有当前会话时自动落到最近一个店铺项目；
  // 一个都没有就保持「未归属」，等用户新建项目或创建演示数据。
  try {
    await chatStore.loadConversations();
    if (!chatStore.currentConvId && chatStore.conversations.length) {
      await chat.selectConv(chatStore.conversations[0].id);
    }
  } catch { /* 会话列表拉不到不影响资源管理 */ }
  // 选中店铺：沿用上次或落到当前项目第一条
  if (!active.value) {
    const first = projectConns.value[0];
    if (first) selectShop(first.id);
  }
});
</script>

<!-- 对话区样式来自 views/chat.css（与办公/开发/剪辑同一份）：.messages 的 flex/滚动/内边距都在那里，
     不引就会「消息顶到最上沿 + 被上方条压住」。 -->
<style src="../chat.css"></style>
<!-- 店铺控制台共享样式（拆分后的子组件共用；全局类名 shop-*） -->
<style src="./shop/shop.css"></style>
