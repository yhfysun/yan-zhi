// 店铺运营控制台（/shop）的页面级状态。
//
// ★ 为什么放模块作用域而不是组件内：App.vue 的 router-view 没有 keep-alive，
//   模式切换/路由跳转会**销毁组件** —— 状态放组件里就会把用户填了一半的新建表单、
//   选中的店铺、刚拉到的自检结果全丢掉。opsSession.ts 是同一理由（那边还涉及 xterm
//   句柄不能重建）。这里只存"普通数据"，比运维那边简单。
//
// ★ 只存数据不存 DOM 句柄：本控制台没有终端/图表实例，切页重建无害。
import { ref } from 'vue';
import { api } from '../../api/client';
import { usePluginStore } from '../../stores/plugin';

export interface ShopConnection {
  id: string;
  platform: string;
  site: string;
  shopName: string;
  sellerId?: string;
  tag?: string;
  note?: string;
  groupId?: string;
  createdAt: number;
  lastCheckAt?: number;
  /** 后端算好的派生字段：是否已配置凭据（密文永不回显）、是否生产店铺 */
  hasSecret: boolean;
  isProduction: boolean;
}

export interface ShopGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface ShopPlatformInfo {
  id: string;
  label: string;
  kind: 'store' | 'warehouse';
  entryUrl: string;
  loginNote: string;
}

export interface ShopCheckResult {
  ok: boolean;
  issues: string[];
  hints: string[];
}

/** 模块级单例（见文件头的 keep-alive 说明） */
export const shopConnections = ref<ShopConnection[]>([]);
export const shopGroups = ref<ShopGroup[]>([]);
export const shopPlatforms = ref<ShopPlatformInfo[]>([]);
export const shopActiveId = ref<string>('');
export const shopCheck = ref<ShopCheckResult | null>(null);
export const shopCheckId = ref<string>('');
export const shopLoading = ref(false);
export const shopError = ref<string>('');
export const shopAudit = ref<Array<Record<string, unknown>>>([]);

/** 未分组根节点 id —— 只用于渲染兜底，不落库（与 ops 控制台同做法） */
export const SHOP_UNGROUPED = '__ungrouped__';

function errText(r: unknown): string {
  const e = (r as { error?: string }).error;
  return e || '请求失败';
}

async function loadPlatforms(): Promise<void> {
  try {
    const r = await api.get<ShopPlatformInfo[]>('/plugin/shop-ops/platforms');
    if ('data' in r) shopPlatforms.value = r.data;
  } catch { /* 平台清单拉不到不影响主流程：新建表单会退化成默认 amazon */ }
}

async function loadGroups(): Promise<void> {
  const r = await api.get<ShopGroup[]>('/plugin/shop-ops/groups');
  if ('data' in r) shopGroups.value = r.data;
  else shopError.value = errText(r);
}

async function loadConnections(): Promise<void> {
  const r = await api.get<ShopConnection[]>('/plugin/shop-ops/connections');
  if ('data' in r) {
    shopConnections.value = r.data;
    // 选中项失效（被删/首次进入）→ 落到第一条，避免主区空白但左侧有内容
    if (!r.data.some((c) => c.id === shopActiveId.value)) {
      shopActiveId.value = r.data[0]?.id || '';
    }
  } else {
    shopError.value = errText(r);
  }
}

async function loadAudit(): Promise<void> {
  const r = await api.get<Array<Record<string, unknown>>>('/plugin/shop-ops/audit');
  if ('data' in r) shopAudit.value = r.data;
}

/** 进控制台时拉一次全量（平台清单只需一次，但重复拉无害且并发更省心） */
export async function loadShopConsole(force = false): Promise<void> {
  if (shopLoading.value) return;
  if (!force && shopConnections.value.length && shopPlatforms.value.length) return;
  shopLoading.value = true;
  shopError.value = '';
  try {
    await Promise.all([loadPlatforms(), loadGroups(), loadConnections(), loadAudit()]);
  } finally {
    shopLoading.value = false;
  }
}

export function selectShop(id: string): void {
  shopActiveId.value = id;
  // 自检结果是"某条店铺的"，换店必须清掉，否则会把上一条的结论显示成这一条的
  shopCheck.value = null;
  shopCheckId.value = '';
}

export function activeShop(): ShopConnection | null {
  return shopConnections.value.find((c) => c.id === shopActiveId.value) || null;
}

interface ConnPayload {
  platform: string;
  site?: string;
  shopName: string;
  sellerId?: string;
  secret?: string;
  tag?: string;
  note?: string;
  groupId?: string;
}

export async function createShop(payload: ConnPayload): Promise<string> {
  const r = await api.post<ShopConnection>('/plugin/shop-ops/connections', payload);
  if (!('data' in r)) return errText(r);
  await loadConnections();
  selectShop(r.data.id);
  return '';
}

export async function updateShop(id: string, payload: ConnPayload): Promise<string> {
  const r = await api.put<ShopConnection>(`/plugin/shop-ops/connections/${id}`, payload);
  if (!('data' in r)) return errText(r);
  await loadConnections();
  return '';
}

export async function deleteShop(id: string): Promise<string> {
  const r = await api.delete<{ ok: boolean }>(`/plugin/shop-ops/connections/${id}`);
  if (!('data' in r)) return errText(r);
  await loadConnections();
  return '';
}

/** 配置自检（**不是**连通性探测：本插件不持有登录态，抓数由 pageAgent 负责） */
export async function checkShop(id: string): Promise<string> {
  const r = await api.post<ShopCheckResult>(`/plugin/shop-ops/connections/${id}/check`, {});
  if (!('data' in r)) return errText(r);
  shopCheck.value = r.data;
  shopCheckId.value = id;
  await loadConnections();
  await loadAudit();
  return '';
}

export async function createGroup(name: string): Promise<string> {
  const r = await api.post<ShopGroup>('/plugin/shop-ops/groups', { name });
  if (!('data' in r)) return errText(r);
  await loadGroups();
  return '';
}

/** 插件是否已启用 —— 模式入口的置灰判定由 ModeSwitcher 负责，这里只给控制台一个兜底提示 */
export function shopPluginEnabled(): boolean {
  const ps = usePluginStore();
  return ps.plugins.some((p) => p.manifest.id === 'shop-ops' && p.state === 'enabled');
}
