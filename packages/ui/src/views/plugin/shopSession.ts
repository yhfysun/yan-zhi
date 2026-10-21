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
  /** 所属项目 = 一条店铺会话 id（与剪辑项目同模型）；缺省 = 未归属 */
  projectId?: string;
  /** 演示数据标记（一键清空只删这些） */
  demo?: boolean;
  createdAt: number;
  lastCheckAt?: number;
  /** 后端算好的派生字段：是否已配置凭据（密文永不回显）、是否生产店铺 */
  hasSecret: boolean;
  isProduction: boolean;
  /** 凭据里的非密钥字段回显（partnerID / customerNo / env 等），编辑时预填 */
  credMeta?: Record<string, string>;
}

export interface ShopGroup {
  id: string;
  name: string;
  createdAt: number;
}

/** 凭据字段（由后端 /platforms 下发，控制台据此渲染表单） */
export interface ShopCredentialField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
}

export interface ShopTrackEvent {
  time: string;
  description: string;
  location?: string;
  status?: string;
}

export interface ShopTrackResult {
  ok: boolean;
  provider: string;
  trackingNo: string;
  events: ShopTrackEvent[];
  message?: string;
  step?: string;
}

export interface ShopProbeResult {
  ok: boolean;
  message: string;
  step?: string;
}

/** 演示经营快照（合成数据，按 shopName 索引；仅演示连接有） */
export interface ShopDemoSnapshot {
  kpis: Array<{ label: string; value: string; hint?: string }>;
  table?: { title: string; columns: string[]; rows: string[][] };
  note: string;
}

export interface ShopPlatformInfo {
  id: string;
  label: string;
  kind: 'store' | 'warehouse' | 'logistics';
  entryUrl: string;
  loginNote: string;
  /** 该平台该盯哪些指标（控制台「口径速查」渲染；只读参考） */
  keyMetrics: string[];
  /** 对接状态：client=none 仅登记 / pending 接口已知未接 / ready 已实现客户端 */
  integration?: {
    docsUrl?: string;
    auth: 'none' | 'api-key' | 'app-key-secret' | 'oauth' | 'enterprise';
    client: 'none' | 'pending' | 'ready';
    enterprise?: boolean;
  };
  /** 物流商的凭据字段（没有客户端时缺省） */
  credentials?: ShopCredentialField[];
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
/** 演示经营快照：按 shopName 索引（后端只返回当前存在的演示连接） */
export const shopDemoData = ref<Record<string, ShopDemoSnapshot>>({});

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

async function loadDemoData(): Promise<void> {
  const r = await api.get<Record<string, ShopDemoSnapshot>>('/plugin/shop-ops/demo/data');
  if ('data' in r) shopDemoData.value = r.data;
  else shopDemoData.value = {};
}

/** 进控制台时拉一次全量（平台清单只需一次，但重复拉无害且并发更省心） */
export async function loadShopConsole(force = false): Promise<void> {
  if (shopLoading.value) return;
  if (!force && shopConnections.value.length && shopPlatforms.value.length) return;
  shopLoading.value = true;
  shopError.value = '';
  try {
    await Promise.all([loadPlatforms(), loadGroups(), loadConnections(), loadAudit(), loadDemoData()]);
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
  /** 所属项目（店铺会话 id） */
  projectId?: string;
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

/** 物流凭据连通性测试（只读探活，用假单号，不碰真实运单） */
export async function testShopLogistics(id: string): Promise<{ error: string; result?: ShopProbeResult }> {
  const r = await api.post<ShopProbeResult>(`/plugin/shop-ops/connections/${id}/logistics/test`, {});
  if (!('data' in r)) return { error: errText(r) };
  await loadAudit();
  return { error: '', result: r.data };
}

/** 运单轨迹查询（只读） */
export async function trackShopLogistics(
  id: string,
  payload: { trackingNo: string; phone?: string },
): Promise<{ error: string; result?: ShopTrackResult }> {
  const r = await api.post<ShopTrackResult>(`/plugin/shop-ops/connections/${id}/logistics/track`, payload);
  if (!('data' in r)) return { error: errText(r) };
  await loadAudit();
  return { error: '', result: r.data };
}

/** 演示项目模板（后端下发：每套自带店铺/仓储/物流） */
export interface DemoTemplate { key: string; title: string; count: number }

export async function getDemoTemplates(): Promise<{ error: string; items: DemoTemplate[] }> {
  const r = await api.get<DemoTemplate[]>('/plugin/shop-ops/demo/templates');
  if (!('data' in r)) return { error: errText(r), items: [] };
  return { error: '', items: r.data };
}

/** 一键创建演示店铺（按模板；幂等：同项目内同名跳过） */
export async function seedDemoShops(projectId?: string, template?: string): Promise<string> {
  const r = await api.post<{ created: number }>('/plugin/shop-ops/demo/seed', {
    ...(projectId ? { projectId } : {}),
    ...(template ? { template } : {}),
  });
  if (!('data' in r)) return errText(r);
  await loadConnections();
  await loadAudit();
  await loadDemoData();
  return '';
}

/** 删除项目前迁出资源：演示数据清除，真实资源归到「未归属」 */
export async function reassignProject(fromProjectId: string): Promise<string> {
  const r = await api.post<{ moved: number; removed: number }>('/plugin/shop-ops/connections/reassign', { fromProjectId });
  if (!('data' in r)) return errText(r);
  await loadConnections();
  await loadAudit();
  await loadDemoData();
  return '';
}

/** 一键清空演示店铺（★ 只删 demo 标记；传 projectId 时只清该项目的演示数据） */
export async function clearDemoShops(projectId?: string): Promise<string> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const r = await api.delete<{ removed: number }>(`/plugin/shop-ops/demo${q}`);
  if (!('data' in r)) return errText(r);
  await loadConnections();
  await loadAudit();
  shopCheck.value = null;
  shopCheckId.value = '';
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
