// shop-ops 内置插件：店铺运营（亚马逊 / 淘宝 / 1688 / 跨境中转仓）的连接与工作台后端。
// 形态对齐 ops-shell（manifest + 入口模块 + 权限声明 + 审计 + 插件存储），默认启用
// （仅首次注册生效，之后随 DB 状态）。
//
// ★★ P0 的能力边界（2026-10-16，必须先说清）：**只读 + 配置管理，没有任何写操作工具**。
//   - 本插件负责：店铺/仓库这条"资源"的增删改查（凭据加密落 plugin_storage）、配置自检、
//     资源目录分组、审计留痕，以及给控制台 /shop 提供接口。
//   - 本插件**不负责**抓数：平台数据一律由智能体委派 pageAgent 走 browser_* 打开页面获取
//     （登录态由用户自己在浏览器面板登录，插件不存账号密码）。这样 P0 就能闭环，
//     且不引入任何"代用户操作店铺"的风险面。
//   - 写操作（改价/上下架/回消息）是 P2：届时新增 shop-write 权限 + 写工具族，
//     每个动作强制走 confirm_user 变更单 + 生产店铺强确认 + 审计。
//     现在**不要**提前声明 shop-write 权限，也不要放占位的写工具 —— 声明了就要拦得住。
//
// 与 ops-shell 的复用关系：凭据加密（utils/crypto）、审计（services/plugin-audit）、
// 生产标记判定（ops-shell-guard 的 isProductionTag）、插件存储用法全部照抄，不另发明一套。
import type { BuiltInTool, McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import { encrypt, decrypt } from '../utils/crypto.js';
import { pushPluginAudit } from '../services/plugin-audit.js';
import { isProductionTag } from './ops-shell-guard.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('shop-ops');

export const SHOP_OPS_ID = 'shop-ops';

/** 支持的平台。entryUrl/loginNote/keyMetrics 给智能体与用户看：P0 的抓数全靠 pageAgent 打开这些页面。 */
export interface ShopPlatform {
  id: 'amazon' | 'taobao' | 'pdd' | '1688' | 'tiktok' | 'shopify' | 'warehouse';
  label: string;
  kind: 'store' | 'warehouse';
  entryUrl: string;
  loginNote: string;
  /** 该平台该盯哪些指标（控制台「口径速查」用；只读参考，不假装能自动取到） */
  keyMetrics: string[];
}

export const SHOP_PLATFORMS: readonly ShopPlatform[] = [
  {
    id: 'amazon', label: '亚马逊', kind: 'store',
    entryUrl: 'https://sellercentral.amazon.com/',
    loginNote: '卖家中心需登录（各站点子域不同：sellercentral.amazon.co.uk / .co.jp 等）。首次请你在浏览器面板自行登录，之后 cookie 复用。',
    keyMetrics: ['业务报告：会话数 / 转化率 / 客单价', '广告报表：曝光-点击-花费-单量（算 ACoS）', '库存与 FBA 费用（含长期仓储费）', '退货率与差评关键词'],
  },
  {
    id: 'taobao', label: '淘宝 / 天猫', kind: 'store',
    entryUrl: 'https://myseller.taobao.com/',
    loginNote: '卖家中心（千牛网页版）需登录。反爬较强，取数优先找页面自身的 XHR 接口而不是点 DOM。',
    keyMetrics: ['生意参谋：访客数 / 支付转化率 / 客单价', '主推款的核心关键词排名', 'DSR 三项与退款/纠纷率', '流量结构与活动资源位'],
  },
  {
    id: 'pdd', label: '拼多多', kind: 'store',
    entryUrl: 'https://mms.pinduoduo.com/',
    loginNote: '商家后台需登录（常需短信验证码，可能需你人工完成一次）。',
    keyMetrics: ['商家后台：曝光 / 点击 / 转化', '退款率与纠纷率', '活动报名要素与价格力'],
  },
  {
    id: '1688', label: '1688（货源）', kind: 'store',
    entryUrl: 'https://www.1688.com/',
    loginNote: '部分阶梯价与供应商信息登录后才可见。主要用于货源比价，本模式不代下单。',
    keyMetrics: ['阶梯价与起订量 MOQ', '发货地与供货能力（日产能/是否现货）', '评分与回头率', '是否可定制（贴牌/改包装）'],
  },
  {
    id: 'tiktok', label: 'TikTok Shop', kind: 'store',
    entryUrl: 'https://seller.tiktokglobalshop.com/',
    loginNote: '跨境卖家后台需登录，常有风控校验。',
    keyMetrics: ['商品卡与短视频带货数据', '达人合作与佣金口径', '履约时效与差评'],
  },
  {
    id: 'shopify', label: 'Shopify 独立站', kind: 'store',
    entryUrl: 'https://admin.shopify.com/',
    loginNote: '后台需登录；有 API 时优先用 API 而非浏览器。',
    keyMetrics: ['流量来源与转化漏斗', '弃单率', '物流时效与退款率'],
  },
  {
    id: 'warehouse', label: '跨境中转仓 / 海外仓', kind: 'warehouse',
    entryUrl: '',
    loginNote: '多数是自有台账或服务商系统：没有统一入口，用导出的 Excel/CSV 放进任务目录 00-source 即可。',
    keyMetrics: ['入库预约与箱规/标签要求', '库存台账：在仓 / 在途 / 日均销 / 可售天数', '头程报价与门到门时效（含清关派送）', '长期仓储费与滞销库存'],
  },
];

const PLATFORM_BY_ID = new Map(SHOP_PLATFORMS.map((p) => [p.id, p]));

interface StoredConnection {
  id: string;
  platform: ShopPlatform['id'];
  /** 站点/市场：亚马逊 US/EU/JP；淘宝 taobao/tmall；中转仓填仓库名 */
  site: string;
  shopName: string;
  sellerId?: string;
  /** 生产 / 测试 —— P2 的写操作按它分级强确认（P0 无写操作，但先落字段，避免日后迁移） */
  tag?: string;
  note?: string;
  groupId?: string;
  /** API 凭据密文（iv:tag:ct）。纯浏览器自动化的平台留空。 */
  secretEnc: string;
  createdAt: number;
  lastCheckAt?: number;
}

interface ShopGroup {
  id: string;
  name: string;
  createdAt: number;
}

/** 出库视图：**永不回显凭据**，只回"有没有配置" */
function toClientView(c: StoredConnection) {
  const { secretEnc, ...rest } = c;
  return { ...rest, hasSecret: !!secretEnc, isProduction: isProductionTag(c.tag) };
}

function textResult(text: string): McpCallResult {
  return { content: [{ type: 'text', text }] } as McpCallResult;
}

const AUDIT_LIMIT = 500;

/** 插件存储的最小接口（与注入方 ctx.storage 同结构）。抽成具名类型是为了让测试能注入替身。 */
export interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** 插件存储由 activate 注入（与 ops-shell 同写法） */
let pluginStorage: PluginStorage | null = null;

/** 测试专用：直接注入插件存储（生产路径永远走 activate(ctx)）。 */
export function __setStorageForTest(s: PluginStorage | null): void {
  pluginStorage = s;
}

async function loadConnections(): Promise<StoredConnection[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<StoredConnection[]>('connections');
  return Array.isArray(rows) ? rows : [];
}

async function saveConnections(list: StoredConnection[]): Promise<void> {
  if (!pluginStorage) throw new Error('插件存储不可用（plugin_storage 未初始化）—— 店铺连接无法持久化');
  await pluginStorage.set('connections', list);
  // 回读校验：与 ops-shell 同口径，写不进去必须显式失败，不能静默丢配置
  const check = await pluginStorage.get<StoredConnection[]>('connections');
  if (!Array.isArray(check) || check.length !== list.length) {
    throw new Error('店铺连接写入校验失败（plugin_storage 未正确落库）');
  }
}

async function loadGroups(): Promise<ShopGroup[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<ShopGroup[]>('groups');
  return Array.isArray(rows) ? rows : [];
}

async function saveGroups(list: ShopGroup[]): Promise<void> {
  if (!pluginStorage) throw new Error('插件存储不可用 —— 目录无法持久化');
  await pluginStorage.set('groups', list);
}

async function audit(action: string, opts: Record<string, unknown> = {}): Promise<void> {
  await pushPluginAudit(pluginStorage, { at: Date.now(), action, ...opts }, AUDIT_LIMIT);
}

// ---------- 入参解析与校验 ----------

interface ConnInput {
  platform: ShopPlatform['id'];
  site: string;
  shopName: string;
  sellerId?: string;
  secret: string;
  tag?: string;
  note?: string;
  groupId?: string;
}

function parseConnInput(body: Record<string, unknown>): ConnInput {
  const rawPlatform = String(body.platform || '').trim();
  const platform: ShopPlatform['id'] = PLATFORM_BY_ID.has(rawPlatform as ShopPlatform['id'])
    ? (rawPlatform as ShopPlatform['id'])
    : 'amazon';
  const opt = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s || undefined;
  };
  return {
    platform,
    site: String(body.site || '').trim(),
    shopName: String(body.shopName || '').trim(),
    sellerId: opt(body.sellerId),
    secret: String(body.secret || ''),
    tag: opt(body.tag),
    note: opt(body.note),
    groupId: opt(body.groupId),
  };
}

/** 必填校验；返回错误文案，通过则返回 null */
function validateConnInput(input: ConnInput): string | null {
  if (!input.shopName) return '店铺名（或仓库名）必填';
  // 中转仓没有站点概念（仓库名即 site），其余平台站点必填：站点决定佣金/税/竞争口径
  if (input.platform !== 'warehouse' && !input.site) return '站点/市场必填（如亚马逊 US/EU/JP、淘宝 taobao/tmall）';
  return null;
}

function buildConnection(input: ConnInput, base?: StoredConnection): StoredConnection {
  return {
    id: base?.id ?? `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    platform: input.platform,
    site: input.site,
    shopName: input.shopName,
    sellerId: input.sellerId,
    // 编辑时未传新凭据 → 沿用原密文，避免"只改站点却要重填 Key"
    secretEnc: input.secret ? encrypt(input.secret) : (base?.secretEnc ?? ''),
    tag: input.tag,
    note: input.note,
    groupId: input.groupId ?? base?.groupId,
    createdAt: base?.createdAt ?? Date.now(),
    lastCheckAt: base?.lastCheckAt,
  };
}

/**
 * 配置自检（P0 只做"配置层面"，**不做真实的连通性探测**）。
 *
 * 为什么不叫「测试连接」：本插件不持有登录态、也不代表用户去连平台 —— 那是 pageAgent 的事。
 * 假装探连通性只会给出误导性的"连接成功"。这里如实只报：配置齐不齐、该去哪个入口、
 * 登录要注意什么，并把结果落 lastCheckAt 供控制台显示。
 */
function checkConnection(conn: StoredConnection): { ok: boolean; issues: string[]; hints: string[] } {
  const platform = PLATFORM_BY_ID.get(conn.platform);
  const issues: string[] = [];
  const hints: string[] = [];
  if (!platform) issues.push(`未知平台「${conn.platform}」`);
  if (!conn.shopName) issues.push('店铺名/仓库名为空');
  if (platform && platform.kind === 'store' && !conn.site) issues.push('站点/市场为空（会影响佣金与税的口径判断）');
  if (platform && platform.kind === 'warehouse') {
    hints.push('中转仓/海外仓没有统一后台：把服务商导出的 Excel/CSV 放进任务目录的 00-source 再分析。');
  }
  if (platform?.entryUrl) hints.push(`卖家后台入口：${platform.entryUrl}`);
  if (platform?.loginNote) hints.push(platform.loginNote);
  if (!conn.secretEnc) {
    hints.push('未配置 API 凭据 —— 纯浏览器流程不需要它；若要用平台 API（如亚马逊 SP-API）再补。');
  }
  if (isProductionTag(conn.tag)) {
    hints.push('★ 该店铺标记为「生产」：后续版本的写操作会对它做二次强确认，请确认标记正确。');
  }
  return { ok: issues.length === 0, issues, hints };
}

// ---------- 给模型用的工具（连接管理 + 受闸门约束的写操作） ----------

/** 导出以便测试直接驱动工具（生产由 activate 逐条 registerTool）。 */
export function makeShopTools(): BuiltInTool[] {
  const connList: BuiltInTool = {
    name: 'conn_list',
    description:
      '列出已配置的店铺/仓库连接（凭据永不回显）。先用它确认用户说的"我的店"是哪一条，再决定后续动作。',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const list = await loadConnections();
      if (!list.length) return textResult('还没有配置任何店铺/仓库。可在「店铺运营」控制台左侧「资源」里新建，或直接用 conn_create。');
      const groups = await loadGroups();
      const gname = new Map(groups.map((g) => [g.id, g.name]));
      const lines = list.map((c) => {
        const p = PLATFORM_BY_ID.get(c.platform);
        const bits = [
          `平台=${p?.label ?? c.platform}`,
          c.site ? `站点=${c.site}` : '',
          c.sellerId ? `卖家ID=${c.sellerId}` : '',
          c.tag ? `标签=${c.tag}` : '',
          c.groupId && gname.get(c.groupId) ? `目录=${gname.get(c.groupId)}` : '',
          c.secretEnc ? '有API凭据' : '无API凭据',
        ].filter(Boolean);
        return `- ${c.shopName}（${bits.join('，')}）`;
      });
      return textResult(`共 ${list.length} 条店铺/仓库连接：\n${lines.join('\n')}`);
    },
  };

  const connCreate: BuiltInTool = {
    name: 'conn_create',
    description:
      '新建一条店铺/仓库连接。只登记"是哪家店"，不在这里抓数也不做写操作。secret 仅当要用平台 API 时才填。',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'amazon / taobao / pdd / 1688 / tiktok / shopify / warehouse' },
        site: { type: 'string', description: '站点/市场：亚马逊 US/EU/JP、淘宝 taobao/tmall；中转仓可留空' },
        shopName: { type: 'string', description: '店铺名（或仓库名），唯一标识' },
        sellerId: { type: 'string', description: '卖家 ID（可选，用于对账）' },
        secret: { type: 'string', description: 'API 凭据（可选；纯浏览器流程不需要）' },
        tag: { type: 'string', description: '生产 / 测试（生产会触发后续版本的写操作强确认）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['platform', 'shopName'],
    },
    execute: async (args) => {
      const input = parseConnInput(args);
      const invalid = validateConnInput(input);
      if (invalid) return textResult(invalid);
      const list = await loadConnections();
      if (list.some((c) => c.shopName === input.shopName)) return textResult(`店铺「${input.shopName}」已存在`);
      const conn = buildConnection(input);
      list.push(conn);
      try {
        await saveConnections(list);
      } catch (e) {
        return textResult(`保存失败: ${(e as Error).message}`);
      }
      await audit('connection.create', { connection: conn.shopName, platform: conn.platform, ok: true });
      return textResult(`已新建店铺连接「${conn.shopName}」（平台 ${conn.platform}${conn.site ? `，站点 ${conn.site}` : ''}）`);
    },
  };

  const connUpdate: BuiltInTool = {
    name: 'conn_update',
    description: '修改一条店铺连接（按 shopName 定位）。secret 留空表示沿用原凭据。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '要修改的店铺名（定位用）' },
        site: { type: 'string' },
        sellerId: { type: 'string' },
        secret: { type: 'string', description: '新凭据；留空沿用原值' },
        tag: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['shopName'],
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const list = await loadConnections();
      const idx = list.findIndex((c) => c.shopName === name);
      if (idx < 0) return textResult(`未找到店铺「${name}」`);
      const base = list[idx];
      const input = parseConnInput({ ...base, ...args, platform: base.platform, shopName: base.shopName });
      const invalid = validateConnInput(input);
      if (invalid) return textResult(invalid);
      list[idx] = buildConnection(input, base);
      try {
        await saveConnections(list);
      } catch (e) {
        return textResult(`保存失败: ${(e as Error).message}`);
      }
      await audit('connection.update', { connection: name, ok: true });
      return textResult(`已更新店铺「${name}」`);
    },
  };

  const connDelete: BuiltInTool = {
    name: 'conn_delete',
    description: '删除一条店铺连接（按 shopName 定位）。只删这条登记记录，不动任何线上数据。',
    inputSchema: {
      type: 'object',
      properties: { shopName: { type: 'string', description: '要删除的店铺名' } },
      required: ['shopName'],
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const list = await loadConnections();
      const next = list.filter((c) => c.shopName !== name);
      if (next.length === list.length) return textResult(`未找到店铺「${name}」`);
      try {
        await saveConnections(next);
      } catch (e) {
        return textResult(`保存失败: ${(e as Error).message}`);
      }
      await audit('connection.delete', { connection: name, ok: true });
      return textResult(`已删除店铺连接「${name}」`);
    },
  };

  const connCheck: BuiltInTool = {
    name: 'conn_check',
    description:
      '对一条店铺连接做**配置自检**：报告配置是否齐全、该去哪个卖家后台入口、登录与口径上的注意事项。注意它不探测真实连通性（本插件不持有登录态，抓数由 pageAgent 负责）。',
    inputSchema: {
      type: 'object',
      properties: { shopName: { type: 'string', description: '店铺名（留空则检查全部）' } },
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const list = await loadConnections();
      const targets = name ? list.filter((c) => c.shopName === name) : list;
      if (!targets.length) return textResult(name ? `未找到店铺「${name}」` : '还没有配置任何店铺/仓库连接');
      const blocks = targets.map((c) => {
        const r = checkConnection(c);
        const head = `${c.shopName}：${r.ok ? '配置完整' : '配置缺项'}`;
        const lines = [
          ...r.issues.map((s) => `  ✗ ${s}`),
          ...r.hints.map((s) => `  · ${s}`),
        ];
        return [head, ...lines].join('\n');
      });
      return textResult(blocks.join('\n\n'));
    },
  };

  // ---------- 写操作：申请改价（P2 打样的唯一写动作） ----------
  //
  // ★★ 为什么是"申请"而不是"直接改"：本插件既不持有平台登录态、也没有平台写接口 ——
  //    真正的改动由智能体在**获批之后**用 pageAgent 在卖家后台完成。
  //    这个工具的价值是那道**闸门**：把"要改什么"固化成变更单，强制二次确认
  //    （生产店铺还要额外批准），并写审计留痕。
  //    ★ 未确认绝不放行 —— 硬约束在工具里，不依赖模型自觉。
  const priceUpdate: BuiltInTool = {
    name: 'shop_price_update',
    description:
      '【受闸门约束的写操作】申请修改某个商品的价格。首次调用（不带 confirmed）只返回一张变更单并**拒绝执行**；'
      + '把变更单交给用户确认、用户明确同意后，原样重试并带 confirmed: true 才放行。'
      + '标记为「生产」的店铺还需要额外的人工批准（approveProduction: true）。'
      + '放行后由你用 pageAgent 在卖家后台执行并回读确认。一次只改一个商品。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        sku: { type: 'string', description: '商品唯一标识（亚马逊 ASIN / 淘宝商品 ID / 卖家 SKU）' },
        currentPrice: { type: 'number', description: '当前价格（用于变更单的「从什么改成什么」）' },
        newPrice: { type: 'number', description: '目标价格' },
        reason: { type: 'string', description: '为什么改（用户给的理由，禁止编造）' },
        confirmed: { type: 'boolean', description: '用户是否已明确确认这张变更单' },
        approveProduction: { type: 'boolean', description: '仅生产店铺需要：控制台核对后的额外批准' },
      },
      required: ['shopName', 'sku', 'currentPrice', 'newPrice', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const sku = String(args.sku || '').trim();
      const reason = String(args.reason || '').trim();
      const currentPrice = Number(args.currentPrice);
      const newPrice = Number(args.newPrice);
      const list = await loadConnections();
      const conn = list.find((c) => c.shopName === shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!sku) return textResult('sku 必填（亚马逊 ASIN / 淘宝商品 ID / 卖家 SKU）。');
      if (!reason) return textResult('reason 必填 —— 改价理由必须来自用户，不要编造。');
      if (!Number.isFinite(currentPrice) || !Number.isFinite(newPrice) || newPrice <= 0) {
        return textResult('currentPrice / newPrice 必须是正数。');
      }
      const isProd = isProductionTag(conn.tag);
      const delta = currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0;
      const order = [
        '【改价变更单】',
        `店铺：${conn.shopName}（${PLATFORM_BY_ID.get(conn.platform)?.label ?? conn.platform}${conn.site ? ' · ' + conn.site : ''}${isProd ? ' · ★生产' : ''}）`,
        `商品：${sku}`,
        `价格：${currentPrice} → ${newPrice}（${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%）`,
        `理由：${reason}`,
        `回滚方式：改回 ${currentPrice}`,
      ].join('\n');

      if (args.confirmed !== true) {
        await audit('write.price_update.denied', { connection: conn.shopName, detail: sku, ok: false, note: '未确认' });
        return textResult(`${order}\n\n★ 未确认，**未执行**。请把这张变更单交给用户确认；用户明确同意后，原样重试并带 confirmed: true。`);
      }
      if (isProd && args.approveProduction !== true) {
        await audit('write.price_update.denied', { connection: conn.shopName, detail: sku, ok: false, note: '生产店铺未额外批准' });
        return textResult(`${order}\n\n★ 该店铺标记为「生产」，需要**额外人工批准**：请在控制台核对变更单与影响面后，再带 approveProduction: true 重试。`);
      }
      await audit('write.price_update.approved', {
        connection: conn.shopName, detail: sku, ok: true, from: currentPrice, to: newPrice, reason,
      });
      return textResult(
        `${order}\n\n✓ 已批准（已记审计）。执行方式：用 pageAgent 在登录态的卖家后台把 ${sku} 的价格从 ${currentPrice} 改成 ${newPrice}，`
        + `改完**回读页面确认已生效**再回报；若失败或价格不符，按回滚方式改回 ${currentPrice} 并如实说明。`,
      );
    },
  };

  const writeLog: BuiltInTool = {
    name: 'shop_write_log',
    description: '查看写操作记录（申请 / 被拒 / 已批准），用于回溯某个店铺改过什么、当时谁批的。只读。',
    inputSchema: {
      type: 'object',
      properties: { shopName: { type: 'string', description: '店铺名（留空则列出全部）' } },
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const all = (pluginStorage ? await pluginStorage.get<Array<Record<string, unknown>>>('audit') : []) || [];
      const writes = all.filter((e) => String(e.action || '').startsWith('write.'));
      const rows = name ? writes.filter((e) => e.connection === name) : writes;
      if (!rows.length) return textResult('还没有写操作记录。');
      const lines = rows.slice(-50).map((e) => {
        const t = new Date(Number(e.at) || 0).toISOString().replace('T', ' ').slice(0, 16);
        return `- ${t} ${String(e.action)} ${String(e.connection ?? '')} ${String(e.detail ?? '')} ${String(e.note ?? '')}`.replace(/\s+/g, ' ').trim();
      });
      return textResult(`写操作记录 ${rows.length} 条（最近 50 条）：\n${lines.join('\n')}`);
    },
  };

  return [connList, connCreate, connUpdate, connDelete, connCheck, priceUpdate, writeLog];
}

export const shopOpsManifest: PluginManifest = {
  id: SHOP_OPS_ID,
  name: '店铺运营',
  version: '0.1.0',
  category: '操作',
  description:
    '店铺运营工作台：登记亚马逊 / 淘宝 / 拼多多 / 1688 / TikTok Shop / 独立站 / 跨境中转仓的店铺与仓库，按目录归类并审计留痕；「更多 → 店铺运营」打开 /shop 控制台（店铺列表 + 工作台 + 口径速查）。平台数据由智能体委派 pageAgent 打开卖家后台获取（登录态由你自己在浏览器面板登录）。写操作仅开放「申请改价」一个动作打样，且必须经变更单 + 二次确认（生产店铺额外强确认）后才放行、全程审计。默认开启，可在插件管理页停用。',
  // ★ P0/P1 只声明 network（抓数走 pageAgent）。P2 加入 'shop-write'：
  //   权限声明是给用户与插件管理页看的**告知面**，真正的拦截在 shop_price_update 的闸门里
  //   （未确认 / 生产未额外批准一律拒绝执行），不依赖调用方自觉。
  permissions: ['network', 'shop-write'],
  contributes: {
    tools: ['conn_list', 'conn_create', 'conn_update', 'conn_delete', 'conn_check', 'shop_price_update', 'shop_write_log'],
    // ★ 与 ops-shell / sec-lab 同口径：不贡献 sidebar ——「更多」里的分组与顶栏模式下拉
    //   是同一个入口，重复（用户拍板 2026-10-16）。模式靠下面的 routes 拿路由。
    routes: [
      { path: '/shop', name: 'shop', component: 'views/plugin/ShopConsole.vue', meta: { desktopOnly: true } },
    ],
  },
  config: {
    type: 'object',
    properties: {
      defaultPlatform: {
        type: 'string',
        description: '新建连接时默认选中的平台（amazon / taobao / pdd / 1688 / tiktok / shopify / warehouse）',
      },
    },
  },
};

const shopOpsModule: PluginModule = {
  activate(ctx) {
    pluginStorage = ctx.storage;

    for (const tool of makeShopTools()) {
      ctx.registerTool(tool);
    }

    // 后端路由：店铺连接 CRUD + 分组 + 审计（/shop 控制台消费）
    ctx.registerBackendRoute((app: unknown) => {
      const r = app as {
        get: (p: string, h: (...a: unknown[]) => void) => void;
        post: (p: string, h: (...a: unknown[]) => void) => void;
        put: (p: string, h: (...a: unknown[]) => void) => void;
        delete: (p: string, h: (...a: unknown[]) => void) => void;
      };
      const jsonRes = (res: unknown) => res as { json: (d: unknown) => void };
      const failRes = (res: unknown, code: number, msg: string) =>
        (res as { status: (n: number) => { json: (d: unknown) => void } }).status(code).json({ error: msg });

      // 平台清单（控制台下拉用；顺带把入口与登录提示带给前端）
      r.get('/platforms', (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: SHOP_PLATFORMS });
      });

      // 店铺连接列表（凭据永不回显）
      r.get('/connections', async (_req: unknown, res: unknown) => {
        const list = await loadConnections();
        jsonRes(res).json({ data: list.map(toClientView) });
      });

      // 分组列表
      r.get('/groups', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: await loadGroups() });
      });

      r.post('/groups', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        if (!name) { failRes(res, 400, '目录名称必填'); return; }
        const list = await loadGroups();
        if (list.some((g) => g.name === name)) { failRes(res, 409, `目录「${name}」已存在`); return; }
        const g: ShopGroup = { id: `sgrp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, createdAt: Date.now() };
        list.push(g);
        try {
          await saveGroups(list);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: g });
      });

      // 新建店铺连接
      r.post('/connections', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const input = parseConnInput(body);
        const invalid = validateConnInput(input);
        if (invalid) { failRes(res, 400, invalid); return; }
        const list = await loadConnections();
        if (list.some((c) => c.shopName === input.shopName)) {
          failRes(res, 409, `店铺「${input.shopName}」已存在`); return;
        }
        const conn = buildConnection(input);
        list.push(conn);
        try {
          await saveConnections(list);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        await audit('connection.create', { connection: conn.shopName, platform: conn.platform, ok: true });
        jsonRes(res).json({ data: toClientView(conn) });
      });

      // 修改店铺连接（secret 留空 = 沿用原凭据）
      r.put('/connections/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === id);
        if (idx < 0) { failRes(res, 404, '店铺连接不存在'); return; }
        const base = list[idx];
        const input = parseConnInput({ ...base, ...body, platform: body.platform ?? base.platform });
        const invalid = validateConnInput(input);
        if (invalid) { failRes(res, 400, invalid); return; }
        if (list.some((c) => c.id !== id && c.shopName === input.shopName)) {
          failRes(res, 409, `店铺「${input.shopName}」已存在`); return;
        }
        list[idx] = buildConnection(input, base);
        try {
          await saveConnections(list);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        await audit('connection.update', { connection: input.shopName, ok: true });
        jsonRes(res).json({ data: toClientView(list[idx]) });
      });

      // 移动店铺到目录
      r.put('/connections/:id/group', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === id);
        if (idx < 0) { failRes(res, 404, '店铺连接不存在'); return; }
        const groupId = String(body.groupId || '').trim();
        if (!groupId) {
          delete list[idx].groupId;
          await saveConnections(list);
          jsonRes(res).json({ data: toClientView(list[idx]) });
          return;
        }
        const g = (await loadGroups()).find((x) => x.id === groupId);
        if (!g) { failRes(res, 404, '目录不存在'); return; }
        list[idx].groupId = g.id;
        try {
          await saveConnections(list);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: toClientView(list[idx]) });
      });

      // 删除店铺连接
      r.delete('/connections/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadConnections();
        const target = list.find((c) => c.id === id);
        const next = list.filter((c) => c.id !== id);
        if (!target) { failRes(res, 404, '店铺连接不存在'); return; }
        try {
          await saveConnections(next);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        await audit('connection.delete', { connection: target.shopName, ok: true });
        jsonRes(res).json({ data: { ok: true } });
      });

      // 配置自检（**不是**连通性探测，见 checkConnection 的注释）
      r.post('/connections/:id/check', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadConnections();
        const conn = list.find((c) => c.id === id);
        if (!conn) { failRes(res, 404, '店铺连接不存在'); return; }
        const result = checkConnection(conn);
        conn.lastCheckAt = Date.now();
        try {
          await saveConnections(list);
        } catch { /* 时间戳写不进不影响自检结论 */ }
        await audit('connection.check', { connection: conn.shopName, ok: result.ok });
        jsonRes(res).json({ data: result });
      });

      // 审计（控制台「操作日志」页签）
      r.get('/audit', async (_req: unknown, res: unknown) => {
        const list = (pluginStorage ? await pluginStorage.get<unknown[]>('audit') : []) || [];
        jsonRes(res).json({ data: list });
      });
    });

    logger.info('[shop-ops] 已激活（P0：只读 + 店铺连接管理，无写操作）');
  },

  deactivate() {
    pluginStorage = null;
  },
};

export { shopOpsModule };
