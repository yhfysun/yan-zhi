<template>
  <div class="shop-tab-body shop-platform">
    <div class="shop-card shop-jump" v-if="shop">
      <div class="shop-card-head">
        <h3>{{ plan?.title || '平台后台' }}</h3>
        <el-tag size="small" effect="plain" :type="plan?.automatable ? 'warning' : 'info'">
          {{ isDemo ? '演示计划（不触达平台）' : plan?.automatable ? '可由 pageAgent 代跑非资金动作' : '仅跳转' }}
        </el-tag>
        <span v-if="embedded" class="shop-hint-line" style="margin: 0;">内嵌浏览器 · scope=shop</span>
      </div>

      <p v-if="error" class="shop-check err" style="margin: 0 0 10px;">{{ error }}</p>
      <p v-else-if="!plan" class="shop-empty-hint">正在获取跳转计划…</p>

      <template v-else>
        <p class="shop-hint-line" style="margin: 0 0 6px;">目标地址</p>
        <p class="shop-jump-url">{{ plan.url || '（该平台未登记入口，请先补充平台信息）' }}</p>
        <ol class="shop-jump-steps">
          <li v-for="(s, i) in plan.steps" :key="i">{{ s }}</li>
        </ol>
        <div class="shop-card-actions">
          <el-button size="small" type="primary" plain :disabled="!plan.url || isDemo" @click="openEmbedded()">
            {{ embedded ? '重新载入' : '内嵌打开' }}
          </el-button>
          <el-button size="small" :disabled="!plan.url || isDemo" @click="openInBrowser()">在浏览器面板打开</el-button>
          <el-button size="small" :loading="busy" @click="load()">重新获取</el-button>
          <el-button size="small" :loading="busy" @click="markDone()">已处理（记审计）</el-button>
          <el-button v-if="embedded" size="small" text @click="closeEmbedded()">收起内嵌</el-button>
        </div>
        <p v-if="isDemo" class="shop-hint-line shop-warn-line">
          演示店铺只展示跳转计划，未打开任何真实平台页面。切换到测试/生产店铺后才可进入卖家后台。
        </p>
      </template>

      <p class="shop-hint-line">
        内嵌浏览器与主浏览器共用登录态（cookie 复用），登录请你自己完成；
        助手不会代填账号密码，也不会代做付款/验证码。
      </p>
    </div>

    <!-- 内嵌平台后台：复用 BrowserPanel（scope=shop，独立标签空间，不与主浏览器互相干扰） -->
    <div v-if="embedded" class="shop-embed">
      <BrowserPanel scope="shop" />
    </div>
    <div v-else-if="!shop" class="shop-placeholder"><p>选中一家店铺后查看平台后台跳转。</p></div>
  </div>
</template>

<script setup lang="ts">
// 平台后台页签：JumpPlan（URL + 步骤）+ 内嵌 BrowserPanel(scope=shop) + 审计。
// ★ 演示店铺绝不真正触达平台：只展示计划，内嵌/独立浏览器入口都禁用。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useChatStore } from '../../../../stores/chat';
import BrowserPanel from '../../../../components/BrowserPanel.vue';
import type { ShopConnection } from '../../shopSession';
import { openPlatformApi, markJumpDoneApi, type JumpPlan } from '../useShopApi';

const props = defineProps<{ shop: ShopConnection | null }>();
const chatStore = useChatStore();

const plan = ref<JumpPlan | null>(null);
const error = ref('');
const busy = ref(false);
const embedded = ref(false);

const isDemo = computed(() => {
  const c = props.shop;
  return (c?.shopType ?? (c?.demo ? 'demo' : '')) === 'demo';
});

const api = () => (window as unknown as { electronAPI?: { browserView?: Record<string, (...a: unknown[]) => Promise<unknown>> } }).electronAPI?.browserView;

async function load(): Promise<void> {
  if (!props.shop) return;
  busy.value = true;
  error.value = '';
  try {
    const r = await openPlatformApi(props.shop.id);
    if (r.error) { error.value = r.error; plan.value = null; return; }
    plan.value = r.plan || null;
    // 测试/生产店铺：计划拿到后直接在内嵌页签打开（方案 §8「JumpPlan 返回后直接切到该页签并导航」）
    if (plan.value?.automatable && plan.value.url) void openEmbedded();
  } finally {
    busy.value = false;
  }
}

/**
 * 内嵌打开：先挂载 BrowserPanel（它会自建本空间的起始 tab），再 ensureActiveTab 拿到
 * 该 tab 并 load(url)。非 Electron（Web 端）没有 browserView IPC，退化为应用浏览器面板。
 */
async function openEmbedded(): Promise<void> {
  if (!plan.value?.url || isDemo.value) return;
  const url = plan.value.url;
  const bv = api();
  if (!bv) { openInBrowser(); return; }

  embedded.value = true;
  await nextTick();
  try {
    let tabId = (await bv.ensureActiveTab?.('shop')) as string | undefined;
    if (!tabId) tabId = (await bv.createTab?.('shop')) as string | undefined;
    if (!tabId) throw new Error('未能创建内嵌标签页');
    await bv.load?.(tabId, url);
  } catch (e) {
    error.value = `内嵌打开失败：${(e as Error).message}`;
    embedded.value = false;
    ElMessage.error(error.value);
  }
}

function closeEmbedded(): void {
  try { api()?.closeAllTabs?.('shop', true); } catch { /* 忽略 */ }
  embedded.value = false;
}

function openInBrowser(): void {
  if (!plan.value?.url || isDemo.value) return;
  let name = plan.value.title || '平台后台';
  try { name = new URL(plan.value.url).host || name; } catch { /* 非法 URL 用标题兜底 */ }
  chatStore.openTab({ kind: 'browser', name, url: plan.value.url });
  ElMessage.success('已在浏览器面板打开；未登录时按提示登录卖家账号');
}

async function markDone(): Promise<void> {
  if (!props.shop) return;
  busy.value = true;
  try {
    const err = await markJumpDoneApi(props.shop.id, '用户在平台后台完成操作');
    if (err) { ElMessage.error(err); return; }
    ElMessage.success('已记录审计');
  } finally {
    busy.value = false;
  }
}

watch(() => props.shop?.id, () => {
  closeEmbedded();
  void load();
}, { immediate: true });

// 离开 /shop 时清理本空间的 tab（BrowserPanel 自身只清理 preview 空间）
onBeforeUnmount(() => { closeEmbedded(); });
</script>

<style scoped>
.shop-platform { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.shop-embed {
  flex: 1 1 auto;
  min-height: 420px;
  height: calc(100vh - 360px);
  display: flex;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
</style>
