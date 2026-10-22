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
import { parseSpApiCreds, spApiCheck } from '../services/amazon-sp-api.js';
import {
  credentialFieldsOf, logisticsClientOf, missingFields,
  type CredentialField, type LogisticsCredentials,
} from '../services/logistics/index.js';
import { createLogger } from '../services/logger.js';
import { db } from '../db.js';
import { initShopStore, __setDbForTest } from '../shop/store.js';
import { runShopAction, setPlatformLookup } from '../shop/actions.js';
import type { ShopContext, ShopType, SupplyMode } from '../shop/types.js';

const logger = createLogger('shop-ops');

export const SHOP_OPS_ID = 'shop-ops';

/**
 * 对接状态。★ 必须诚实标注：`client` 表示客户端代码做没做，
 * 而不是"服务商有没有 API" —— 大平台都有开放平台，但没有企业入驻与凭据时一行也跑不通。
 */
export interface ShopIntegration {
  /** 官方开放平台文档。不确定时留空，宁可不给链接也不给错的 */
  docsUrl?: string;
  /** 认证方式 */
  auth: 'none' | 'api-key' | 'app-key-secret' | 'oauth' | 'enterprise';
  /** none=仅登记；pending=接口已知未接；ready=已实现客户端 */
  client: 'none' | 'pending' | 'ready';
  /** 是否要企业入驻 / 应用审核 / IP 白名单 */
  enterprise?: boolean;
}

/** 支持的平台。entryUrl/loginNote/keyMetrics 给智能体与用户看：P0 的抓数全靠 pageAgent 打开这些页面。 */
export interface ShopPlatform {
  id: 'amazon' | 'taobao' | 'pdd' | '1688' | 'tiktok' | 'shopify' | 'warehouse'
    | 'sf-express' | 'jd-logistics' | 'cainiao' | '4px' | 'yunexpress' | 'winit';
  label: string;
  kind: 'store' | 'warehouse' | 'logistics';
  entryUrl: string;
  loginNote: string;
  /** 该平台该盯哪些指标（控制台「口径速查」用；只读参考，不假装能自动取到） */
  keyMetrics: string[];
  integration?: ShopIntegration;
  /** 物流商的凭据字段（控制台按它渲染表单；没有客户端时缺省） */
  credentials?: CredentialField[];
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
    integration: { auth: 'none', client: 'none' },
  },
  {
    id: 'winit', label: '万邑通海外仓（WINIT）', kind: 'warehouse',
    entryUrl: 'https://www.winit.com.cn/',
    loginNote: '服务商系统需客户账号；库存与入库单也可按页导出 CSV 放进 00-source。',
    keyMetrics: ['海外仓在库/在途/库龄', '入库预约与收货差异', '出库时效与妥投率', '仓储费与附加费明细'],
    // 万邑通有开放平台，但要客户账号开通才拿得到 appKey —— 代码客户端尚未实现
    integration: { auth: 'app-key-secret', client: 'pending', enterprise: true },
  },

  // ===== 物流服务商（2026-10-21 增补）=====
  // ★ 对接状态分两档，必须如实区分：
  //   - ready：客户端已按官方文档实现（顺丰丰桥 / 云途 OMS），填凭据即可测试与查轨迹；
  //     但**没有在真实账号上跑通过**，联调结果会如实返回错误码。
  //   - pending：接口存在但需要企业入驻/客户端未接（4PX / 京东 / 菜鸟），只做登记与口径。
  {
    id: 'sf-express', label: '顺丰速运（丰桥）', kind: 'logistics',
    entryUrl: 'https://www.sf-express.com/',
    loginNote: '丰桥开放平台需企业入驻并申请应用（appKey/appSecret），运单轨迹按「路由查询」接口取；生产环境常常还要 IP 白名单。',
    keyMetrics: ['运单轨迹与节点时效', '签收率与异常件（破损/丢失/退回）', '首重续重与偏远附加费', '揽收及时率'],
    integration: { docsUrl: 'https://open.sf-express.com/', auth: 'app-key-secret', client: 'ready', enterprise: true },
    credentials: credentialFieldsOf('sf-express'),
  },
  {
    id: 'jd-logistics', label: '京东物流', kind: 'logistics',
    entryUrl: 'https://www.jdl.com/',
    loginNote: '京东物流开放平台需企业开发者认证；轨迹/下单走签名接口，部分能力要服务商资质。',
    keyMetrics: ['运单轨迹与时效达成', '签收/拒收与售后件', '运费与增值服务费', '仓配一体库存周转'],
    integration: { docsUrl: 'https://open.jdl.com/', auth: 'app-key-secret', client: 'pending', enterprise: true },
  },
  {
    id: 'cainiao', label: '菜鸟 / 菜鸟国际', kind: 'logistics',
    entryUrl: 'https://www.cainiao.com/',
    loginNote: '菜鸟开放平台主要面向商家与服务商，跨境线路需对应渠道开通；轨迹查询按渠道不同接口也不同。',
    keyMetrics: ['跨境轨迹（揽收-干线-清关-派送）', '时效达成与异常滞留', '头程/尾程费用拆分', '妥投率与客诉'],
    integration: { auth: 'app-key-secret', client: 'pending', enterprise: true },
  },
  {
    id: '4px', label: '4PX 递四方', kind: 'logistics',
    entryUrl: 'https://www.4px.com/',
    loginNote: '4PX 开放平台需客户账号开通；轨迹、报价、下单分属不同接口，签名为 appKey+签名串。',
    keyMetrics: ['轨迹节点与清关状态', '渠道时效对比（经济/标准/快线）', '计费重与体积重差异', '退件与丢件处理时效'],
    integration: { auth: 'app-key-secret', client: 'pending', enterprise: true },
  },
  {
    id: 'yunexpress', label: '云途物流', kind: 'logistics',
    entryUrl: 'https://www.yunexpress.com/',
    loginNote: '云途开放平台需客户账号申请 appKey/appSecret；轨迹与报价接口按渠道区分。',
    keyMetrics: ['轨迹与妥投时效', '渠道报价与燃油附加', '异常件与赔付规则', '揽收截单时间'],
    integration: { auth: 'app-key-secret', client: 'ready', enterprise: true },
    credentials: credentialFieldsOf('yunexpress'),
  },
];

const PLATFORM_BY_ID = new Map(SHOP_PLATFORMS.map((p) => [p.id, p]));

/**
 * 演示店铺（2026-10-21）：让空控制台一眼能看懂"这套东西怎么用"。
 * ★ 全部带 demo 标记 + 「测试」标签：一键清空只删这些，且绝不代表任何真实账号。
 * 名称刻意用「演示 ·」前缀，用户在列表里一眼能区分真假。
 */
/**
 * 演示快照（2026-10-21）：让「管理」看得见 —— 只有登记记录时，控制台和助手都无从下手。
 * ★ 全部是**合成数据**，固定字符串、不含任何真实账号信息；界面与工具回复都必须带「演示」前缀。
 * 按 shopName 索引，与 DEMO_PROJECTS 各模板的连接一一对应。
 */
export interface ShopDemoSnapshot {
  kpis: Array<{ label: string; value: string; hint?: string }>;
  table?: { title: string; columns: string[]; rows: string[][] };
  note: string;
}

export const DEMO_SNAPSHOTS: Record<string, ShopDemoSnapshot> = {
  '演示 · 亚马逊家居店': {
    kpis: [
      { label: '今日销售额', value: '$12,480', hint: '较昨日 +6.4%' },
      { label: '订单数', value: '86', hint: '客单价 $145' },
      { label: '转化率', value: '8.2%', hint: '类目均值 6.5%' },
      { label: '广告 ACoS', value: '27%', hint: '目标 ≤30%' },
    ],
    table: {
      title: 'Top 商品 · 利润与库存',
      columns: ['商品', '售价', '单件利润', '可售天数'],
      rows: [
        ['竹制收纳架', '$29.99', '$7.40', '41 天'],
        ['硅胶厨具 6 件套', '$24.99', '$5.80', '28 天'],
        ['折叠沥水架', '$18.99', '$4.10', '12 天 ⚠ 补货'],
      ],
    },
    note: '演示数据：跨境家居类目。真实数值需你在浏览器面板登录卖家中心后由 pageAgent 取。',
  },
  '演示 · 天猫女装店': {
    kpis: [
      { label: '今日支付 GMV', value: '¥38,600', hint: '较上周同日 +12%' },
      { label: '访客数', value: '21,400', hint: '主推款带来 38%' },
      { label: '支付转化率', value: '3.1%', hint: '行业均值 3.4%' },
      { label: '退款率', value: '8.4%', hint: '针织开衫偏高' },
    ],
    table: {
      title: '主推款 · 毛利与退款',
      columns: ['商品', '售价', '毛利率', '7 日退款率'],
      rows: [
        ['法式连衣裙', '¥199', '52%', '6.2%'],
        ['针织开衫', '¥159', '48%', '11.5% ⚠'],
        ['高腰阔腿裤', '¥139', '55%', '5.1%'],
      ],
    },
    note: '演示数据：国内女装。退款率是当前最该拆的指标，建议先看尺码与色差差评。',
  },
  '演示 · 拼多多日用百货': {
    kpis: [
      { label: '今日单量', value: '1,240', hint: '较昨日 +18%' },
      { label: '客单价', value: '¥23.5', hint: '低价走量' },
      { label: '纠纷率', value: '0.6%', hint: '低于阈值 1%' },
      { label: '活动报名', value: '3 个', hint: '2 个待审' },
    ],
    table: {
      title: '商品 · 价格力',
      columns: ['商品', '售价', '日销', '价格力'],
      rows: [
        ['一次性洗脸巾', '¥9.9', '680', '强'],
        ['垃圾袋 100 只', '¥7.9', '420', '中'],
        ['厨房抹布 10 条', '¥12.9', '140', '弱 ⚠'],
      ],
    },
    note: '演示数据：低价日百。价格力弱的品优先看同款竞品券后价，而不是直接降价。',
  },
  '演示 · 1688 家居货源': {
    kpis: [
      { label: '在谈供应商', value: '6 家', hint: '2 家可打样' },
      { label: '最低起订量', value: '50 件', hint: '竹制收纳架' },
      { label: '拿货价差', value: '32%', hint: '同款最高/最低' },
      { label: '打样周期', value: '3–7 天', hint: '定制贴牌另算' },
    ],
    table: {
      title: '货源 · 阶梯价与交期',
      columns: ['货源', '阶梯价', 'MOQ', '交期'],
      rows: [
        ['竹制收纳架', '¥12.8 起', '50', '7 天'],
        ['硅胶厨具 6 件套', '¥9.6 起', '100', '10 天'],
        ['折叠沥水架', '¥7.2 起', '200', '5 天'],
      ],
    },
    note: '演示数据：货源比价。本模式不代下单；付款必须由你人工完成。',
  },
  '演示 · 美国海外仓': {
    kpis: [
      { label: '在仓库存', value: '12,480 件', hint: '3 个 SKU' },
      { label: '在途库存', value: '3,200 件', hint: '预计 5 天到仓' },
      { label: '可售天数', value: '41 天', hint: '低于 21 天需补货' },
      { label: '滞销 SKU', value: '1 个', hint: '库龄 >180 天' },
    ],
    table: {
      title: '库存台账 · 在仓 / 在途',
      columns: ['SKU', '在仓', '在途', '日均销', '可售天数'],
      rows: [
        ['竹制收纳架', '4,200', '1,200', '102', '41'],
        ['硅胶厨具 6 件套', '7,420', '2,000', '190', '39'],
        ['折叠沥水架', '860', '0', '72', '12 ⚠'],
      ],
    },
    note: '演示数据：库存台账。真实台账可把服务商导出的 CSV 放进任务目录 00-source。',
  },
  '演示 · 顺丰月结账号': {
    kpis: [
      { label: '本月运单', value: '1,860', hint: '月结账号' },
      { label: '签收率', value: '97.2%', hint: '异常件 14' },
      { label: '平均时效', value: '2.4 天', hint: '较上月 -0.3 天' },
      { label: '异常件', value: '14', hint: '破损 5 / 退回 9' },
    ],
    table: {
      title: '轨迹示例 · SF1234567890',
      columns: ['时间', '地点', '节点'],
      rows: [
        ['2026-10-20 09:12', '深圳', '已揽收'],
        ['2026-10-20 18:40', '深圳', '已发出，下一站上海'],
        ['2026-10-21 08:05', '上海', '到达派送网点'],
        ['2026-10-21 11:26', '上海', '派送中'],
        ['2026-10-21 15:02', '上海', '已签收'],
      ],
    },
    note: '演示轨迹：真实轨迹需填 partnerID / checkword 后点「测试连接」与「查轨迹」。',
  },
  '演示 · 华东仓': {
    kpis: [
      { label: '在仓库存', value: '8,640 件', hint: '2 个 SKU' },
      { label: '在途库存', value: '1,500 件', hint: '预计 2 天入仓' },
      { label: '可售天数', value: '26 天', hint: '低于 21 天需补货' },
      { label: '滞销 SKU', value: '0 个', hint: '库龄健康' },
    ],
    table: {
      title: '库存台账 · 在仓 / 在途',
      columns: ['SKU', '在仓', '在途', '日均销', '可售天数'],
      rows: [
        ['法式连衣裙', '5,200', '1,000', '210', '24'],
        ['针织开衫', '3,440', '500', '120', '28'],
      ],
    },
    note: '演示数据：国内仓。真实台账可把服务商导出的 CSV 放进任务目录 00-source。',
  },
  '演示 · 云途物流': {
    kpis: [
      { label: '本月运单', value: '2,340', hint: '跨境小包' },
      { label: '签收率', value: '95.8%', hint: '异常件 27' },
      { label: '平均时效', value: '7.6 天', hint: '较上月 -0.4 天' },
      { label: '异常件', value: '27', hint: '清关滞留 11 / 退回 6' },
    ],
    table: {
      title: '轨迹示例 · YT2207711010000002',
      columns: ['时间', '地点', '节点'],
      rows: [
        ['2026-10-18 14:20', '深圳', '已揽收'],
        ['2026-10-19 03:10', '深圳', '已交航'],
        ['2026-10-21 09:40', '洛杉矶', '清关中'],
        ['2026-10-23 16:05', '芝加哥', '到达派送网点'],
      ],
    },
    note: '演示轨迹：真实轨迹需在连接里填 ADDR / 客户编号 / ApiSecret 后点「测试连接」。',
  },
};

export interface DemoProjectTemplate {
  key: string;
  title: string;
  connections: ReadonlyArray<{
    platform: ShopPlatform['id'];
    site: string;
    shopName: string;
    note: string;
  }>;
}

/**
 * 两套演示项目（2026-10-21）：演示数据必须按「项目 → 店铺/仓储/物流」组织，
 * 否则切换项目只会看到同一份平铺列表，演示不出项目隔离。
 */
export const DEMO_PROJECTS: readonly DemoProjectTemplate[] = [
  {
    key: 'home-abroad',
    title: '演示 · 家居出海',
    connections: [
      { platform: 'amazon', site: 'US', shopName: '演示 · 亚马逊家居店', note: '演示数据：跨境家居类目，主看转化率与 ACoS。' },
      { platform: '1688', site: '义乌', shopName: '演示 · 1688 家居货源', note: '演示数据：货源比价用，不代下单。' },
      { platform: 'warehouse', site: 'US-West', shopName: '演示 · 美国海外仓', note: '演示数据：库存台账与可售天数。' },
      { platform: 'sf-express', site: '', shopName: '演示 · 顺丰月结账号', note: '演示数据：物流商只登记，轨迹接口需 appKey/secret。' },
    ],
  },
  {
    key: 'women-cn',
    title: '演示 · 国内女装',
    connections: [
      { platform: 'taobao', site: 'tmall', shopName: '演示 · 天猫女装店', note: '演示数据：国内女装，主看 DSR 与退款率。' },
      { platform: 'pdd', site: '拼多多', shopName: '演示 · 拼多多日用百货', note: '演示数据：低价走量，主看价格力与纠纷率。' },
      { platform: 'warehouse', site: '华东', shopName: '演示 · 华东仓', note: '演示数据：国内仓库存台账。' },
      { platform: 'yunexpress', site: '', shopName: '演示 · 云途物流', note: '演示数据：跨境小包轨迹。' },
    ],
  },
];

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
  /** 所属项目 = 一条店铺会话 id（与剪辑项目同模型）；缺省 = 未归属 */
  projectId?: string;
  /** 演示数据标记：一键清空只删这些，绝不误伤用户真实登记 */
  demo?: boolean;
  /** 店铺类型：demo 演示 / test 测试 / production 生产（2026-10-22 重构 §3.1；老库由 demo/tag 推导） */
  shopType?: ShopType;
  /** 货源模式：stocked 有货源 / dropship 无货源 */
  supplyMode?: SupplyMode;
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
  return { ...rest, hasSecret: !!secretEnc, isProduction: isProductionTag(c.tag), credMeta: publicCredMeta(c) };
}

/**
 * 凭据里的**非密钥字段**（如 partnerID / customerNo / env）回显给控制台，
 * 编辑时不用重填；secret=true 的字段一律不回显。
 */
function publicCredMeta(c: StoredConnection): Record<string, string> | undefined {
  if (!c.secretEnc) return undefined;
  const fields = credentialFieldsOf(c.platform);
  if (!fields.length) return undefined;
  const creds = parseLogisticsCreds(c);
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!f.secret && creds[f.key]) out[f.key] = creds[f.key];
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 物流凭据：secretEnc 里存的是 JSON（如 { partnerID: "xxx", checkword: "***", env: "prod" }）。
 * 解析失败一律当"未配置" —— 不把密文/异常栈带进日志或响应。
 */
function parseLogisticsCreds(conn: StoredConnection): LogisticsCredentials {
  if (!conn.secretEnc) return {};
  try {
    const raw = JSON.parse(decrypt(conn.secretEnc)) as Record<string, unknown>;
    const out: LogisticsCredentials = {};
    for (const [k, v] of Object.entries(raw || {})) out[k] = String(v ?? '');
    return out;
  } catch {
    return {};
  }
}

/**
 * 编辑物流连接时，前端拿不到已保存的密钥（永不回显）—— 空字段沿用旧值。
 * 只对"JSON 对象凭据"生效；解析不了就原样返回（交给 buildConnection 按旧逻辑处理）。
 */
function mergeLogisticsSecret(newSecret: string, base?: StoredConnection): string {
  if (!newSecret || !base?.secretEnc) return newSecret;
  try {
    const next = JSON.parse(newSecret) as Record<string, unknown>;
    const prev = JSON.parse(decrypt(base.secretEnc)) as Record<string, unknown>;
    if (!next || typeof next !== 'object' || !prev || typeof prev !== 'object') return newSecret;
    for (const [k, v] of Object.entries(prev)) {
      if (!String(next[k] ?? '').trim()) next[k] = v;
    }
    return JSON.stringify(next);
  } catch {
    return newSecret;
  }
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
  /** 所属项目（店铺会话 id）；留空 = 未归属 */
  projectId?: string;
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
    projectId: opt(body.projectId),
  };
}

/** 必填校验；返回错误文案，通过则返回 null */
function validateConnInput(input: ConnInput): string | null {
  if (!input.shopName) return '店铺名（或仓库名）必填';
  // 只有店铺类才有"站点"概念：中转仓/物流商的名称本身即口径，不能强制填站点
  const platform = PLATFORM_BY_ID.get(input.platform);
  if (platform?.kind === 'store' && !input.site) return '站点/市场必填（如亚马逊 US/EU/JP、淘宝 taobao/tmall）';
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
    projectId: input.projectId ?? base?.projectId,
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
  if (platform && platform.kind === 'logistics') {
    const hasClient = !!logisticsClientOf(platform.id);
    hints.push(hasClient
      ? '已实现轨迹查询客户端：按下面的字段填好凭据后，可在工作台点「测试连接」并查询运单轨迹。'
      : '该服务商客户端未接（需要企业入驻与 appKey/secret 才能联调），本版本只做登记与口径，轨迹请查官网或用导出的账单。');
    if (platform.integration?.docsUrl) hints.push(`开放平台文档：${platform.integration.docsUrl}`);
  }
  if (platform?.entryUrl) {
    const entryLabel = platform.kind === 'store' ? '卖家后台入口' : platform.kind === 'logistics' ? '服务商官网' : '服务商入口';
    hints.push(`${entryLabel}：${platform.entryUrl}`);
  }
  if (platform?.loginNote) hints.push(platform.loginNote);
  if (!conn.secretEnc) {
    hints.push(platform?.kind === 'logistics'
      ? '未配置开放平台凭据（appKey / appSecret）—— 物流接口必须先配凭据，配置后仍需客户端支持才调得通。'
      : '未配置 API 凭据 —— 纯浏览器流程不需要它；若要用平台 API（如亚马逊 SP-API）再补。');
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
        platform: { type: 'string', description: 'amazon / taobao / pdd / 1688 / tiktok / shopify / warehouse / winit / sf-express / jd-logistics / cainiao / 4px / yunexpress' },
        site: { type: 'string', description: '站点/市场：亚马逊 US/EU/JP、淘宝 taobao/tmall；中转仓可留空' },
        shopName: { type: 'string', description: '店铺名（或仓库名），唯一标识' },
        sellerId: { type: 'string', description: '卖家 ID（可选，用于对账）' },
        secret: { type: 'string', description: 'API 凭据（可选；纯浏览器流程不需要）' },
        tag: { type: 'string', description: '生产 / 测试（生产会触发后续版本的写操作强确认）' },
        note: { type: 'string', description: '备注' },
        projectId: { type: 'string', description: '所属项目（店铺会话 id；留空 = 未归属）' },
      },
      required: ['platform', 'shopName'],
    },
    execute: async (args) => {
      const input = parseConnInput(args);
      const invalid = validateConnInput(input);
      if (invalid) return textResult(invalid);
      const list = await loadConnections();
      if (list.some((c) => c.shopName === input.shopName && c.projectId === input.projectId)) {
        return textResult(`项目内已存在「${input.shopName}」`);
      }
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
        projectId: { type: 'string', description: '改归属项目（店铺会话 id）' },
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

  // ---------- 物流轨迹（只读，不涉及写闸门） ----------
  //
  // 凭据由用户在控制台按服务商字段填写（加密存 secretEnc），工具只消费、不回显。
  // 未实现客户端的服务商明确拒绝，并指出当前支持哪两家 —— 不假装能查。
  const shopTrackQuery: BuiltInTool = {
    name: 'shop_track_query',
    description:
      '查询物流运单轨迹。仅支持已实现客户端的服务商（顺丰丰桥 sf-express、云途 yunexpress）；'
      + '先用 conn_list 找到对应的物流连接，凭据由用户在控制台填写。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '物流连接名（按名称定位）' },
        trackingNo: { type: 'string', description: '运单号（云途也接受跟踪号）' },
        phone: { type: 'string', description: '可选：顺丰收寄人手机号后四位' },
        orderNo: { type: 'string', description: '可选：按客户订单号查询' },
      },
      required: ['shopName', 'trackingNo'],
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const trackingNo = String(args.trackingNo || '').trim();
      if (!trackingNo) return textResult('运单号为空。');
      const conn = (await loadConnections()).find((c) => c.shopName === name);
      if (!conn) return textResult(`未找到连接「${name}」—— 先用 conn_list 看看已登记了哪些。`);
      const client = logisticsClientOf(conn.platform);
      if (!client) {
        return textResult(`「${conn.shopName}」的服务商「${conn.platform}」还没有客户端（当前支持：顺丰丰桥 sf-express / 云途 yunexpress）。先按口径查官网或导出账单。`);
      }
      const creds = parseLogisticsCreds(conn);
      const miss = missingFields(client, creds);
      if (miss.length) {
        return textResult(`「${conn.shopName}」凭据不完整：缺 ${miss.join('、')}。请在「店铺运营」控制台编辑该连接补上。`);
      }
      const r = await client.track(creds, {
        trackingNo,
        phone: args.phone ? String(args.phone) : undefined,
        orderNo: args.orderNo ? String(args.orderNo) : undefined,
      });
      await audit('logistics.track', { connection: conn.shopName, detail: trackingNo, ok: r.ok });
      if (!r.ok) return textResult(`查询失败（${r.step || 'api'}）：${r.message || '未知错误'}`);
      const lines = r.events.map((e) => `- ${e.time}${e.location ? ` ${e.location}` : ''} ${e.description}${e.status ? `（${e.status}）` : ''}`);
      return textResult([
        `${r.provider} · ${r.trackingNo}`,
        r.message || '',
        ...(lines.length ? lines : ['（暂无轨迹）']),
      ].filter(Boolean).join('\n'));
    },
  };

  // ---------- 经营快照（演示数据；真实连接暂无数据源） ----------
  const shopSnapshot: BuiltInTool = {
    name: 'shop_snapshot',
    description:
      '读取一条连接的经营快照（KPI + 明细表）。演示店铺返回合成演示数据；'
      + '真实店铺目前没有接入数据源，会如实说明 —— 抓数请用 pageAgent 打开卖家后台或让用户提供导出文件。',
    inputSchema: {
      type: 'object',
      properties: { shopName: { type: 'string', description: '连接名（按名称定位）' } },
      required: ['shopName'],
    },
    execute: async (args) => {
      const name = String(args.shopName || '').trim();
      const conn = (await loadConnections()).find((c) => c.shopName === name);
      if (!conn) return textResult(`未找到连接「${name}」—— 先用 conn_list 看看已登记了哪些。`);
      const snap = conn.demo ? DEMO_SNAPSHOTS[conn.shopName] : undefined;
      if (!snap) {
        return textResult(`「${conn.shopName}」没有接入数据源：本版本不持有登录态，也不存平台数据。请用 pageAgent 打开卖家后台取数，或让用户提供导出的 Excel/CSV。`);
      }
      const kpis = snap.kpis.map((k) => `- ${k.label}：${k.value}${k.hint ? `（${k.hint}）` : ''}`);
      const table = snap.table
        ? ['', `【${snap.table.title}】`, snap.table.columns.join(' | '), ...snap.table.rows.map((r) => r.join(' | '))]
        : [];
      return textResult([
        `【演示数据】${conn.shopName}`,
        ...kpis,
        ...table,
        '',
        snap.note,
        '★ 以上均为合成演示数据，不代表任何真实账号。',
      ].join('\n'));
    },
  };

  // ---------- 写操作：统一走「申请 → 用户确认 →（生产额外批准）」闸门 ----------
  //
  // ★★ 为什么全部做成"申请"而不是"直接改"：本插件既不持有平台登录态、也没有平台写接口 ——
  //    真正的改动由智能体在**获批之后**用 pageAgent 在卖家后台完成。
  //    这些工具的价值是那道**闸门**：把"要改什么"固化成变更单，强制二次确认
  //    （生产店铺还要额外批准），并写审计留痕。未确认绝不放行 —— 硬约束在工具里，不依赖模型自觉。
  //
  // ★ 闸门收敛成**一份**实现（runWriteGate）：动作之间的差别只有「变更单写什么、获批后怎么执行」。
  //   逐个复制必然改出分歧 —— ops-shell 那边同一种审计逻辑曾复制到 5 处，改 cap 时漏了一处。

  interface WriteReq {
    /** 审计动作名，如 write.stock_update */
    action: string;
    conn: StoredConnection;
    /** 变更单标题，如「改价变更单」 */
    title: string;
    /** 目标对象（sku / 商品 id / 会话 id），进审计 */
    target: string;
    /** 变更单正文行（不含标题与店铺行） */
    lines: string[];
    /** 获批后交给 pageAgent 的执行指引 */
    exec: string;
    confirmed?: boolean;
    approveProduction?: boolean;
  }

  const findConn = async (shopName: string): Promise<StoredConnection | undefined> =>
    (await loadConnections()).find((c) => c.shopName === shopName);

  const runWriteGate = async (req: WriteReq): Promise<McpCallResult> => {
    const platform = PLATFORM_BY_ID.get(req.conn.platform);
    const isProd = isProductionTag(req.conn.tag);
    const order = [
      `【${req.title}】`,
      `店铺：${req.conn.shopName}（${platform?.label ?? req.conn.platform}${req.conn.site ? ' · ' + req.conn.site : ''}${isProd ? ' · ★生产' : ''}）`,
      ...req.lines,
    ].join('\n');

    if (req.confirmed !== true) {
      await audit(`${req.action}.denied`, { connection: req.conn.shopName, detail: req.target, ok: false, note: '未确认' });
      return textResult(`${order}\n\n★ 未确认，**未执行**。请把这张变更单交给用户确认；用户明确同意后，原样重试并带 confirmed: true。`);
    }
    if (isProd && req.approveProduction !== true) {
      await audit(`${req.action}.denied`, { connection: req.conn.shopName, detail: req.target, ok: false, note: '生产店铺未额外批准' });
      return textResult(`${order}\n\n★ 该店铺标记为「生产」，需要**额外人工批准**：请在控制台核对变更单与影响面后，再带 approveProduction: true 重试。`);
    }
    await audit(`${req.action}.approved`, {
      connection: req.conn.shopName, detail: req.target, ok: true, summary: req.lines.join(' | '),
    });
    return textResult(
      `${order}\n\n✓ 已批准（已记审计）。执行方式：${req.exec}\n`
      + '改完**回读页面确认已生效**再回报；若失败或结果与变更单不符，按上面的回滚方式处理并如实说明。',
    );
  };

  /** 写工具共用的两个闸门入参 */
  const WRITE_GATE_PROPS = {
    confirmed: { type: 'boolean', description: '用户是否已明确确认这张变更单' },
    approveProduction: { type: 'boolean', description: '仅生产店铺需要：控制台核对后的额外批准' },
  };
  const GATE_HINT =
    '【受闸门约束的写操作】首次调用（不带 confirmed）只返回一张变更单并**拒绝执行**；'
    + '把变更单交给用户确认、用户明确同意后，原样重试并带 confirmed: true 才放行。'
    + '标记为「生产」的店铺还需要额外的人工批准（approveProduction: true）。'
    + '放行后由你用 pageAgent 在卖家后台执行并回读确认。';

  const priceUpdate: BuiltInTool = {
    name: 'shop_price_update',
    description: `${GATE_HINT}本动作：改单个商品的售价。一次只改一个商品。`,
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        sku: { type: 'string', description: '商品唯一标识（亚马逊 ASIN / 淘宝商品 ID / 卖家 SKU）' },
        currentPrice: { type: 'number', description: '当前价格（变更单的「从什么改成什么」）' },
        newPrice: { type: 'number', description: '目标价格' },
        reason: { type: 'string', description: '为什么改（用户给的理由，禁止编造）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'sku', 'currentPrice', 'newPrice', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const sku = String(args.sku || '').trim();
      const reason = String(args.reason || '').trim();
      const currentPrice = Number(args.currentPrice);
      const newPrice = Number(args.newPrice);
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!sku) return textResult('sku 必填（亚马逊 ASIN / 淘宝商品 ID / 卖家 SKU）。');
      if (!reason) return textResult('reason 必填 —— 改价理由必须来自用户，不要编造。');
      if (!Number.isFinite(currentPrice) || !Number.isFinite(newPrice) || newPrice <= 0) {
        return textResult('currentPrice / newPrice 必须是正数。');
      }
      const delta = currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0;
      return runWriteGate({
        action: 'write.price_update', conn, title: '改价变更单', target: sku,
        lines: [
          `商品：${sku}`,
          `价格：${currentPrice} → ${newPrice}（${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%）`,
          `理由：${reason}`,
          `回滚方式：改回 ${currentPrice}`,
        ],
        exec: `用 pageAgent 在登录态的卖家后台把 ${sku} 的价格从 ${currentPrice} 改成 ${newPrice}。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const stockUpdate: BuiltInTool = {
    name: 'shop_stock_update',
    description: `${GATE_HINT}本动作：改单个商品的库存数量（含售罄下架式的置零）。一次只改一个商品。`,
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        sku: { type: 'string', description: '商品唯一标识' },
        currentStock: { type: 'number', description: '当前库存' },
        newStock: { type: 'number', description: '目标库存（0 = 售罄）' },
        reason: { type: 'string', description: '为什么改（用户给的理由，禁止编造）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'sku', 'currentStock', 'newStock', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const sku = String(args.sku || '').trim();
      const reason = String(args.reason || '').trim();
      const currentStock = Number(args.currentStock);
      const newStock = Number(args.newStock);
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!sku) return textResult('sku 必填。');
      if (!reason) return textResult('reason 必填 —— 改库存理由必须来自用户，不要编造。');
      if (!Number.isInteger(currentStock) || !Number.isInteger(newStock) || newStock < 0) {
        return textResult('currentStock / newStock 必须是非负整数。');
      }
      return runWriteGate({
        action: 'write.stock_update', conn, title: '改库存变更单', target: sku,
        lines: [
          `商品：${sku}`,
          `库存：${currentStock} → ${newStock}${newStock === 0 ? '（置零 = 售罄下架）' : ''}`,
          `理由：${reason}`,
          `回滚方式：改回 ${currentStock}`,
        ],
        exec: `用 pageAgent 在登录态的卖家后台把 ${sku} 的可售库存从 ${currentStock} 改成 ${newStock}。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const listingPublish: BuiltInTool = {
    name: 'shop_listing_publish',
    description: `${GATE_HINT}本动作：商品**上下架**（online 上架 / offline 下架）。一次只处理一个商品。`,
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        sku: { type: 'string', description: '商品唯一标识' },
        listing: { type: 'string', description: 'online = 上架 / offline = 下架' },
        reason: { type: 'string', description: '为什么上下架（用户给的理由，禁止编造）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'sku', 'listing', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const sku = String(args.sku || '').trim();
      const reason = String(args.reason || '').trim();
      const listing = String(args.listing || '').trim();
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!sku) return textResult('sku 必填。');
      if (listing !== 'online' && listing !== 'offline') return textResult('listing 只能是 online 或 offline。');
      if (!reason) return textResult('reason 必填 —— 上下架理由必须来自用户，不要编造。');
      const label = listing === 'online' ? '上架' : '下架';
      return runWriteGate({
        action: 'write.listing_publish', conn, title: `${label}变更单`, target: sku,
        lines: [
          `商品：${sku}`,
          `动作：${label}`,
          `理由：${reason}`,
          `回滚方式：${listing === 'online' ? '改回下架' : '改回上架'}`,
        ],
        exec: `用 pageAgent 在登录态的卖家后台把 ${sku} ${label}（商品管理页的上下架开关）。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const listingCreate: BuiltInTool = {
    name: 'shop_listing_create',
    description:
      `${GATE_HINT}本动作：**铺货上架** —— 在目标平台新建一个商品（1688 拿货铺到亚马逊/淘宝等）。`
      + '必须先把标题/卖点/价格/规格/图片素材准备好并在变更单里列清；本工具只负责过闸门，不生成素材。一次只铺一个商品。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '目标店铺名（必须已登记）' },
        sourceRef: { type: 'string', description: '货源标识（1688 商品链接 / 供应商货号），用于留档与溯源' },
        title: { type: 'string', description: '拟用标题（已按平台规则写好）' },
        price: { type: 'number', description: '拟售价' },
        reason: { type: 'string', description: '为什么铺这个品（来自选品/货源分析的结论）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'sourceRef', 'title', 'price', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const sourceRef = String(args.sourceRef || '').trim();
      const title = String(args.title || '').trim();
      const reason = String(args.reason || '').trim();
      const price = Number(args.price);
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!sourceRef || !title) return textResult('sourceRef（货源标识）与 title（拟用标题）必填。');
      if (!reason) return textResult('reason 必填 —— 铺货理由必须来自选品/货源分析，不要编造。');
      if (!Number.isFinite(price) || price <= 0) return textResult('price 必须是正数。');
      return runWriteGate({
        action: 'write.listing_create', conn, title: '铺货上架变更单', target: sourceRef,
        lines: [
          `货源：${sourceRef}`,
          `拟用标题：${title}`,
          `拟售价：${price}`,
          `理由：${reason}`,
          '回滚方式：下架并删除该新建商品（保留下架截图留档）',
          '★ 前置检查：侵权/品牌授权/认证门槛（FCC/CE/CPC 等）已按 skill_1688_sourcing 筛过一遍',
        ],
        exec: `用 pageAgent 在登录态的卖家后台新建商品：标题用上面这条、售价 ${price}，按平台要求填写必填属性与图片。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const campaignApply: BuiltInTool = {
    name: 'shop_campaign_apply',
    description:
      `${GATE_HINT}本动作：**报名平台活动**（大促/日常资源位）。`
      + '活动报名往往是多商品一次提交，所以本工具允许传商品列表，但**列表必须与用户逐项核对过**；'
      + '报名前先算活动价下的到手毛利（低于成本的要显式标注并让用户确认）。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        campaign: { type: 'string', description: '活动名称与档期（如「双11 预热场 11.01-11.03」）' },
        skus: { type: 'string', description: '参与商品，多个用英文逗号分隔' },
        dealPrice: { type: 'number', description: '活动价（全部商品同一价时填这个；不同价请在 reason 里逐一说明）' },
        reason: { type: 'string', description: '为什么报名（含到手毛利结论）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'campaign', 'skus', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const campaign = String(args.campaign || '').trim();
      const skus = String(args.skus || '').trim();
      const reason = String(args.reason || '').trim();
      const dealPrice = Number(args.dealPrice);
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!campaign || !skus) return textResult('campaign（活动与档期）与 skus（参与商品）必填。');
      if (!reason) return textResult('reason 必填 —— 报名理由里要含活动价下的到手毛利结论。');
      const skuList = skus.split(',').map((s) => s.trim()).filter(Boolean);
      if (!skuList.length) return textResult('skus 解析后为空。');
      return runWriteGate({
        action: 'write.campaign_apply', conn, title: '活动报名变更单', target: skuList.join(','),
        lines: [
          `活动：${campaign}`,
          `参与商品（${skuList.length} 个）：${skuList.join('、')}`,
          Number.isFinite(dealPrice) && dealPrice > 0 ? `活动价：${dealPrice}` : '活动价：见理由（多商品不同价）',
          `理由与毛利结论：${reason}`,
          '回滚方式：在活动报名截止前撤销报名；已生效的活动价需在活动结束后改回原价',
        ],
        exec: `用 pageAgent 在登录态的卖家后台「营销/活动」里报名 ${campaign}，按变更单逐个勾选商品并填写活动价。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const replySend: BuiltInTool = {
    name: 'shop_reply_send',
    description:
      `${GATE_HINT}本动作：**回复买家消息/站内信**（客服与售后）。`
      + '回复文案必须逐字写进变更单 —— 发出的内容是用户确认过的那一份，不允许获批后自行改写。'
      + '涉及退款、补偿、赔付、承诺时效的，必须在变更单里显式标注「需人工处理」，本工具不代做资金动作。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '店铺名（必须已登记）' },
        threadId: { type: 'string', description: '会话/工单标识（买家名或会话号），用于定位与审计' },
        replyText: { type: 'string', description: '拟发送的完整回复文案（会原样发出）' },
        reason: { type: 'string', description: '为什么这样回（对应用户的诉求与口径）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'threadId', 'replyText', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const threadId = String(args.threadId || '').trim();
      const replyText = String(args.replyText || '');
      const reason = String(args.reason || '').trim();
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!threadId) return textResult('threadId 必填（否则发错人）。');
      if (!replyText.trim()) return textResult('replyText 必填 —— 要发送的文案不能为空。');
      if (!reason) return textResult('reason 必填 —— 回复口径必须来自用户，不要编造。');
      const risky = /退款|退货|赔付|补偿|赔偿|承诺|到账|免单/.test(replyText);
      return runWriteGate({
        action: 'write.reply_send', conn, title: '回复买家变更单', target: threadId,
        lines: [
          `对象：${threadId}`,
          `拟发送全文：\n${replyText}`,
          `口径依据：${reason}`,
          '回滚方式：无法撤回已发送消息 —— 若发错，需另发一条更正并说明',
          ...(risky ? ['★ 文案涉及退款/补偿/承诺时效：**需人工处理**资金与承诺动作，本工具只发消息'] : []),
        ],
        exec: `用 pageAgent 在登录态的客服/站内信里找到 ${threadId}，把变更单里的全文**原样**发出（不要改写）。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  const orderPlace: BuiltInTool = {
    name: 'shop_order_place',
    description:
      `${GATE_HINT}本动作：**在 1688 下采购单**（货源采购）。`
      + '★ 硬边界：本工具只批准"走到提交订单为止"——**付款必须由用户人工完成**，'
      + '不允许代替输入支付密码、短信验证码或走免密支付。'
      + '下单前必须已确认货源合规（侵权/授权/认证）与到手差价。',
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: '用于采购的店铺连接名（平台通常是 1688）' },
        offerRef: { type: 'string', description: '1688 商品链接或报价单号' },
        qty: { type: 'number', description: '采购数量' },
        unitPrice: { type: 'number', description: '单价（阶梯价里取你实际能拿的那档）' },
        reason: { type: 'string', description: '为什么下这一单（含到手差价与合规结论）' },
        ...WRITE_GATE_PROPS,
      },
      required: ['shopName', 'offerRef', 'qty', 'unitPrice', 'reason'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const offerRef = String(args.offerRef || '').trim();
      const reason = String(args.reason || '').trim();
      const qty = Number(args.qty);
      const unitPrice = Number(args.unitPrice);
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (!offerRef) return textResult('offerRef（1688 商品链接/报价单号）必填。');
      if (!reason) return textResult('reason 必填 —— 下单理由里要含到手差价与合规结论。');
      if (!Number.isInteger(qty) || qty <= 0) return textResult('qty 必须是正整数。');
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return textResult('unitPrice 必须是正数。');
      return runWriteGate({
        action: 'write.order_place', conn, title: '采购下单变更单', target: offerRef,
        lines: [
          `货源：${offerRef}`,
          `数量：${qty} × 单价 ${unitPrice}（合计约 ${(qty * unitPrice).toFixed(2)}）`,
          `理由与合规结论：${reason}`,
          '回滚方式：付款前可取消订单；已付款需走退款流程（人工）',
          '★ 硬边界：**付款必须由用户人工完成** —— 不允许代输支付密码/验证码，不走免密支付',
        ],
        exec: `用 pageAgent 在 1688 打开 ${offerRef}，加入 ${qty} 件、核对单价 ${unitPrice}，**走到提交订单页为止就停下**，把订单页交给用户人工付款。`,
        confirmed: args.confirmed === true,
        approveProduction: args.approveProduction === true,
      });
    },
  };

  // ---------- SP-API：凭据连通性检查（只读，不产生任何写操作） ----------
  //
  // 写操作目前靠 pageAgent 点 DOM —— 能用但脆弱（改版/风控/限流）。亚马逊有官方 API，
  // 配好凭据后调它远比点页面稳。这个工具的价值是：**在真正需要它之前就能验凭据**，
  // 而不是等某次抓数失败才发现配额或授权有问题。
  const spApiCheckTool: BuiltInTool = {
    name: 'shop_sp_api_check',
    description:
      '检查某个**亚马逊**店铺的 SP-API 凭据是否可用：用连接里存的凭据换 LWA token、SigV4 签名、调用一次官方接口。'
      + '凭据没配会明确说未配置；配置有误会指出**是哪一步**失败（换 token / 签名 / 接口被拒）。只读，不产生写操作。',
    inputSchema: {
      type: 'object',
      properties: { shopName: { type: 'string', description: '亚马逊店铺连接名' } },
      required: ['shopName'],
    },
    execute: async (args) => {
      const shopName = String(args.shopName || '').trim();
      const conn = await findConn(shopName);
      if (!conn) return textResult(`未找到店铺「${shopName}」—— 先用 conn_list 确认店铺名。`);
      if (conn.platform !== 'amazon') {
        return textResult(`「${conn.shopName}」的平台是 ${conn.platform} —— SP-API 只适用于亚马逊店铺。`);
      }
      if (!conn.secretEnc) {
        return textResult('该店铺未配置凭据。SP-API 需要在编辑弹窗的「API 凭据」里填一段 JSON（clientId / clientSecret / refreshToken / awsAccessKeyId / awsSecretAccessKey，可选 awsSessionToken 与 region=na|eu|fe）；未配置时走浏览器流程即可。');
      }
      let raw = '';
      try {
        raw = decrypt(conn.secretEnc);
      } catch (e) {
        return textResult(`凭据解密失败：${(e as Error).message}`);
      }
      const creds = parseSpApiCreds(raw);
      if (!creds) {
        return textResult('凭据格式不对：需要 JSON，且至少含 clientId / clientSecret / refreshToken（缺 IAM 的 AK/SK 时会在签名那一步失败）。');
      }
      const r = await spApiCheck(creds);
      if (r.ok) return textResult(`✓ SP-API 可用。${r.note}`);
      const stepLabel: Record<string, string> = {
        creds: '凭据未配置',
        lwa: 'LWA 换 token 失败（clientId / clientSecret / refreshToken 有误，或应用尚未授权）',
        sigv4: 'SigV4 签名失败（缺 IAM 的 awsAccessKeyId / awsSecretAccessKey）',
        api: '接口调用被拒（IAM 角色未授权 SP-API / 站点不对 / 触发限流）',
      };
      await audit('spapi.check.failed', { connection: conn.shopName, ok: false, note: r.step });
      return textResult(`✗ SP-API 不可用 —— 卡在「${stepLabel[r.step] ?? r.step}」：${r.reason}`);
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

  return [
    connList, connCreate, connUpdate, connDelete, connCheck,
    spApiCheckTool, shopTrackQuery, shopSnapshot,
    priceUpdate, stockUpdate, listingPublish, listingCreate, campaignApply, replySend, orderPlace,
    writeLog,
  ];
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
    tools: [
      'conn_list', 'conn_create', 'conn_update', 'conn_delete', 'conn_check',
      'shop_sp_api_check',
      // 只读物流轨迹（顺丰丰桥 / 云途，需要用户先在控制台填凭据）
      'shop_track_query',
      // 经营快照（演示店铺有合成数据；真实店铺如实说明没有数据源）
      'shop_snapshot',
      // 七个受闸门约束的写动作（未确认一律拒绝执行）
      'shop_price_update', 'shop_stock_update', 'shop_listing_publish', 'shop_listing_create',
      'shop_campaign_apply', 'shop_reply_send', 'shop_order_place',
      'shop_write_log',
    ],
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
        description: '新建连接时默认选中的平台（amazon / taobao / pdd / 1688 / tiktok / shopify / warehouse / winit / sf-express / jd-logistics / cainiao / 4px / yunexpress）',
      },
    },
  },
};

const shopOpsModule: PluginModule = {
  activate(ctx) {
    pluginStorage = ctx.storage;
    initShopStore(db);
    setPlatformLookup((platformId: string) => {
      const p = PLATFORM_BY_ID.get(platformId as Parameters<typeof PLATFORM_BY_ID.get>[0]);
      return { url: p?.entryUrl ?? '', label: p?.label ?? platformId };
    });

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
        if (list.some((c) => c.shopName === input.shopName && c.projectId === input.projectId)) {
          failRes(res, 409, `项目内已存在「${input.shopName}」`); return;
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
        if (list.some((c) => c.id !== id && c.shopName === input.shopName && c.projectId === input.projectId)) {
          failRes(res, 409, `项目内已存在「${input.shopName}」`); return;
        }
        list[idx] = buildConnection(
          input.secret ? { ...input, secret: mergeLogisticsSecret(input.secret, base) } : input,
          base,
        );
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

      // 物流：凭据连通性测试（只读探活；用一个不存在的单号，不碰用户真实运单）
      r.post('/connections/:id/logistics/test', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const conn = (await loadConnections()).find((c) => c.id === id);
        if (!conn) { failRes(res, 404, '店铺连接不存在'); return; }
        const client = logisticsClientOf(conn.platform);
        if (!client) { failRes(res, 400, '该服务商还没有客户端（当前支持：顺丰丰桥 / 云途）'); return; }
        try {
          const result = await client.probe(parseLogisticsCreds(conn));
          await audit('logistics.test', { connection: conn.shopName, ok: result.ok });
          jsonRes(res).json({ data: result });
        } catch (e) {
          await audit('logistics.test', { connection: conn.shopName, ok: false });
          failRes(res, 500, (e as Error).message);
        }
      });

      // 物流：运单轨迹查询（只读）
      r.post('/connections/:id/logistics/track', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const trackingNo = String(body.trackingNo || '').trim();
        if (!trackingNo) { failRes(res, 400, '运单号必填'); return; }
        const conn = (await loadConnections()).find((c) => c.id === id);
        if (!conn) { failRes(res, 404, '店铺连接不存在'); return; }
        const client = logisticsClientOf(conn.platform);
        if (!client) { failRes(res, 400, '该服务商还没有客户端（当前支持：顺丰丰桥 / 云途）'); return; }
        try {
          const result = await client.track(parseLogisticsCreds(conn), {
            trackingNo,
            phone: body.phone ? String(body.phone) : undefined,
            orderNo: body.orderNo ? String(body.orderNo) : undefined,
          });
          await audit('logistics.track', { connection: conn.shopName, detail: trackingNo, ok: result.ok });
          jsonRes(res).json({ data: result });
        } catch (e) {
          await audit('logistics.track', { connection: conn.shopName, detail: trackingNo, ok: false });
          failRes(res, 500, (e as Error).message);
        }
      });

      // 删除项目前迁移资源：演示数据直接清掉（它们只属于演示项目），
      // 真实资源移到「未归属」，绝不因为删项目而删掉用户登记。
      r.post('/connections/reassign', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const from = String(body.fromProjectId || '').trim();
        const to = String(body.toProjectId || '').trim() || undefined;
        if (!from) { failRes(res, 400, 'fromProjectId 必填'); return; }
        const list = await loadConnections();
        const next: StoredConnection[] = [];
        let moved = 0;
        let removed = 0;
        for (const c of list) {
          if (c.projectId !== from) { next.push(c); continue; }
          if (c.demo) { removed++; continue; }
          if (to) c.projectId = to; else delete c.projectId;
          next.push(c);
          moved++;
        }
        if (moved || removed) {
          try {
            await saveConnections(next);
          } catch (e) { failRes(res, 500, (e as Error).message); return; }
          await audit('connection.reassign', { connection: `迁出 ${moved} 条、清除演示 ${removed} 条`, ok: true });
        }
        jsonRes(res).json({ data: { moved, removed } });
      });

      // 演示快照：按店铺名返回合成经营数据（只返回当前存在的演示连接）
      r.get('/demo/data', async (_req: unknown, res: unknown) => {
        const list = await loadConnections();
        const names = new Set(list.filter((c) => c.demo).map((c) => c.shopName));
        const out: Record<string, ShopDemoSnapshot> = {};
        for (const [name, snap] of Object.entries(DEMO_SNAPSHOTS)) {
          if (names.has(name)) out[name] = snap;
        }
        jsonRes(res).json({ data: out });
      });

      // 演示模板清单：前端据此创建对应的「店铺项目」（项目 = 一条店铺会话）
      r.get('/demo/templates', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({
          data: DEMO_PROJECTS.map((p) => ({ key: p.key, title: p.title, count: p.connections.length })),
        });
      });

      // 演示数据：按模板创建（幂等：同项目内同名已存在则跳过）
      r.post('/demo/seed', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const projectId = String(body.projectId || '').trim() || undefined;
        const templateKey = String(body.template || '').trim();
        const template = DEMO_PROJECTS.find((p) => p.key === templateKey);
        if (!template) { failRes(res, 400, '未知的演示模板'); return; }
        const list = await loadConnections();
        let created = 0;
        let moved = 0;
        for (const d of template.connections) {
          if (list.some((c) => c.shopName === d.shopName && c.projectId === projectId)) continue;
          // 旧版演示数据没有项目归属：直接归到当前项目，避免"演示数据重复一份"
          const orphan = list.find((c) => c.shopName === d.shopName && c.demo && !c.projectId);
          if (orphan) {
            orphan.projectId = projectId;
            moved++;
            continue;
          }
          list.push({
            id: `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            platform: d.platform,
            site: d.site,
            shopName: d.shopName,
            tag: '测试',
            note: d.note,
            secretEnc: '',
            createdAt: Date.now(),
            demo: true,
            projectId,
          });
          created++;
        }
        if (created || moved) {
          try {
            await saveConnections(list);
          } catch (e) { failRes(res, 500, (e as Error).message); return; }
          await audit('demo.seed', { connection: `新增 ${created} 条、归入项目 ${moved} 条演示店铺`, ok: true });
        }
        jsonRes(res).json({ data: { created, moved } });
      });

      // 演示数据：一键清空（★ 只删 demo 标记；传 projectId 时只清该项目的演示数据）
      r.delete('/demo', async (req: unknown, res: unknown) => {
        const q = (req as { query: Record<string, unknown> }).query || {};
        const projectId = String(q.projectId || '').trim();
        const list = await loadConnections();
        const hit = (c: StoredConnection) => !!c.demo && (!projectId || c.projectId === projectId);
        const removed = list.filter(hit).length;
        if (removed) {
          try {
            await saveConnections(list.filter((c) => !hit(c)));
          } catch (e) { failRes(res, 500, (e as Error).message); return; }
          await audit('demo.clear', { connection: `删除 ${removed} 条演示店铺`, ok: true });
        }
        jsonRes(res).json({ data: { removed } });
      });

      // 审计（控制台「操作日志」页签）
      r.get('/audit', async (_req: unknown, res: unknown) => {
        const list = (pluginStorage ? await pluginStorage.get<unknown[]>('audit') : []) || [];
        jsonRes(res).json({ data: list });
      });
      registerShopBusinessRoutes(r);
    });

    logger.info('[shop-ops] 已激活（P0：只读 + 店铺连接管理，无写操作）');
  },

  deactivate() {
    pluginStorage = null;
  },
};

export { shopOpsModule };

/** 连接 → ShopContext（shop/ 模块的动作层入口） */
function shopContextOf(c: StoredConnection): ShopContext {
  return {
    id: c.id,
    platform: c.platform,
    site: c.site,
    shopName: c.shopName,
    shopType: c.shopType ?? (c.demo ? 'demo' : (isProductionTag(c.tag) ? 'production' : 'test')),
    supplyMode: c.supplyMode ?? 'stocked',
    hasSecret: !!c.secretEnc,
  };
}

/** 2026-10-22 重构：业务路由（dashboard/products/orders/shipments/stock/mode/open）——全部经 runShopAction */
function registerShopBusinessRoutes(r: Record<string, (path: string, handler: (req: unknown, res: unknown) => void) => void>): void {
  const jsonRes = (res: unknown) => res as { json: (d: unknown) => void };
  const failRes = (res: unknown, code: number, msg: string) => (res as { status: (n: number) => { json: (d: unknown) => void } }).status(code).json({ error: msg });
  /** 按连接 id 取店铺上下文；找不到返回 null */
  const ctxOf = async (id: string): Promise<ShopContext | null> => {
    const c = (await loadConnections()).find((c) => c.id === id);
    return c ? shopContextOf(c) : null;
  };

  r.post('/products', async (req: unknown, res: unknown) => {
    const body = (req as { body: Record<string, unknown> }).body || {};
    const shop = await ctxOf(String(body.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'product.create', body, 'human');
    await audit('product.create', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.patch('/products/:id', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'product.update', { ...p.body, productId: p.params.id }, 'human');
    await audit('product.update', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.post('/products/:id/listing', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const online = String((p.body as { listing?: string }).listing ?? 'online') !== 'offline';
    const out = await runShopAction(shop, 'product.publish', { ...p.body, productId: p.params.id, online }, 'human');
    await audit('product.publish', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.post('/products/:id/price', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'product.price', { ...p.body, productId: p.params.id }, 'human');
    await audit('product.price', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.post('/products/:id/stock', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'product.stock', { ...p.body, productId: p.params.id }, 'human');
    await audit('product.stock', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.get('/orders', async (req: unknown, res: unknown) => {
    const q = (req as { query: Record<string, unknown> }).query || {};
    const shop = await ctxOf(String(q.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'order.list', {}, 'human');
    jsonRes(res).json({ data: out });
  });
  r.post('/orders/:id/source', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'order.markSourced', { ...p.body, orderId: p.params.id }, 'human');
    await audit('order.markSourced', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.post('/orders/:id/ship', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(String(p.body?.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'order.ship', { ...p.body, orderId: p.params.id }, 'human');
    await audit('order.ship', { connection: shop.shopName, ok: out.kind === 'done' });
    jsonRes(res).json({ data: out });
  });
  r.get('/shipments', async (req: unknown, res: unknown) => {
    const q = (req as { query: Record<string, unknown> }).query || {};
    const shop = await ctxOf(String(q.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'shipment.list', {}, 'human');
    jsonRes(res).json({ data: out });
  });
  r.get('/stock/moves', async (req: unknown, res: unknown) => {
    const q = (req as { query: Record<string, unknown> }).query || {};
    const shop = await ctxOf(String(q.shopId || ''));
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'stock.moves', {}, 'human');
    jsonRes(res).json({ data: out });
  });
  r.patch('/shops/:id', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: { shopType?: string; supplyMode?: string } };
    const list = await loadConnections();
    const c = list.find((c) => c.id === p.params.id);
    if (!c) { failRes(res, 404, '店铺不存在'); return; }
    if (p.body.shopType === 'demo' || p.body.shopType === 'test' || p.body.shopType === 'production') c.shopType = p.body.shopType;
    if (p.body.supplyMode === 'stocked' || p.body.supplyMode === 'dropship') c.supplyMode = p.body.supplyMode;
    try { await saveConnections(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
    await audit('shop.mode', { connection: c.shopName, ok: true, note: JSON.stringify(p.body) });
    jsonRes(res).json({ data: toClientView(c) });
  });
  r.post('/shops/:id/open', async (req: unknown, res: unknown) => {
    const p = req as { params: { id: string }; body: Record<string, unknown> };
    const shop = await ctxOf(p.params.id);
    if (!shop) { failRes(res, 404, '店铺不存在'); return; }
    const out = await runShopAction(shop, 'shop.open', {}, 'human');
    jsonRes(res).json({ data: out });
  });
}
