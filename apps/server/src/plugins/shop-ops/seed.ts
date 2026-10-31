// ★ mode-pluginization P4「种子归位」：本文件由 apps/server/src/builtin-shop-agents.ts 整体迁入，
//   并补上店铺模式场景行。业务口径与提示词未改一个字（归位不改行为）。
import type { BuiltinSceneDef } from '../../builtin-scene-defs.js';

// 店铺运营专属内置智能体定义（纯数据模块，**不 import db**）。
//
// 为什么单独一个文件（与 builtin-douyin-agents.ts / builtin-office-agents.ts 同一理由）：
//   db.ts 一旦被 import 就会打开 SQLite 并跑全套 seed —— 单测要引 better-sqlite3，
//   在本机必须跑在 Electron 下。把定义抽成纯常量后，测试可以直接 import 本模块做断言。
//
// 定位（2026-10-16，用户拍板）：面向**跨境与国内店铺运营**，覆盖亚马逊 / 淘宝 / 1688 /
//   跨境中转仓（海外仓）。P0 只做「只读分析闭环」：选品分析、竞品与同款比对、利润测算。
//   写操作（改价/上下架/回消息）留到 P2，届时每个动作都要走变更单 + 二次确认 + 审计。
//
// ★ 与「抖音运营助手」的关键差别：那个是内容/带货，**不碰用户账号**；
//   这个是**店铺经营**，后续允许代操作 —— 所以它的提示词里"只读优先 + 变更单"必须是硬约束，
//   而不是像别处那样只作建议。

/** 店铺运营助手 id（前端 config/scenes.ts 的 shop 场景卡与 mode.ts 的 fallbackAgent 引用它） */
export const SHOP_AGENT_ID = 'a_builtin_shop_agent';

const PAGE_AGENT_ID = 'a_builtin_page_agent';

// 挂载口径：
// - file 三件：选品清单/测算表/诊断报告落盘（category="deliverable"）
// - python_exec：利润测算、CSV 台账（复用 skill_xlsx_data_processing 的方法学）
// - image_analyze：看用户给的后台截图/竞品主图/详情页截图（只有路径，必须调它才看得见）
// - compare_products：跨平台同款匹配与到手价归一化（选品分析的核心引擎，**不要手工比对标题**）
// - browser 两件：直接看平台搜索页/详情页；多步操作委派 pageAgent
// - pageAgent：登录态站点的一切操作（首次由用户在浏览器面板自行登录）+ 平台规则现查
// - shop 业务工具：P0 本地业务库（商品/订单/发货/库存）已落地 —— 读用 *list/*dashboard，
//   写用受闸门约束的动作（先出变更单、用户确认后才执行）。平台侧动作仍走 pageAgent。
export const SHOP_AGENT_BUILTIN_TOOLS = [
  // 读资料与交付
  'file_read', 'file_write', 'file_list',
  // 测算与统计
  'python_exec',
  // 看图（后台截图 / 竞品主图 / 详情页）
  'image_analyze',
  // 跨平台同款匹配 + 到手价归一化（选品分析的核心）
  'compare_products',
  // 看网页原文；多步网站操作委派 pageAgent
  'browser_navigate', 'browser_get_page_content',
  // 委派 pageAgent 抓数 / 现查平台规则
  'call_agent', 'list_sub_agents', 'spawn_subagent',
  // 店铺连接与本地业务库（P0 已落地）
  'conn_list', 'conn_check',
  'shop_dashboard', 'shop_product_list', 'shop_order_list',
  'shop_product_create', 'shop_product_update',
  'shop_price_update', 'shop_stock_update', 'shop_listing_publish',
  'shop_order_ship', 'shop_shipment_track', 'shop_platform_open',
  // 平台官方 API（读直接执行；写仍走变更单闸门）
  'shop_api_check', 'shop_platform_api', 'shop_platform_sync',
  'shop_purchase_list', 'shop_purchase_create', 'shop_purchase_update', 'shop_purchase_jump',
  'shop_track_query', 'shop_write_log',
  // 交互与规划
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

/** 店铺运营 skill（须与 skill 表种子 id 对齐）。
 *  ★ P1 起六条全挂（选品 / Listing / 广告利润 / 淘宝 / 1688 货源 / 中转仓）。
 *    后端对「技能不存在或已禁用」是**不注入且不报错**（见 conversation-self-config.test.ts 的守门），
 *    所以这里挂的每个 id 都必须在 db.ts 的 builtinSkillDefaults 里真实存在 —— 加一条要两边同改。 */
export const SHOP_AGENT_SKILL_IDS = [
  'skill_shop_selection',
  'skill_amazon_listing',
  'skill_amazon_ads_profit',
  'skill_taobao_ops',
  'skill_1688_sourcing',
  'skill_overseas_warehouse',
  'skill_shop_service',
];

export const SHOP_AGENT_SYSTEM_PROMPT = `你是「店铺运营助手」（shopAgent），陪用户做**真实店铺的经营决策**：亚马逊 / 淘宝 / 1688 / 跨境中转仓（海外仓）。你服务的是有真金白银在里面的店主，不是写行业报告。

## 第一原则：先对齐口径，再算数
跨境电商最容易错的地方不是分析，是**口径**。每次开工先问清（一次问全，不要挤牙膏）：
- 平台与站点：亚马逊哪个站点（US/EU/JP）、还是淘宝/天猫、还是 1688 找货；
- 品类与价格带：卖什么、客单价区间、目标毛利；
- 成本口径：币种与汇率、是否含税（VAT/销售税）、平台佣金率、履约方式（FBA/自发货/海外仓）、头程与尾程；
- 约束：预算、备货周期、不能碰的品类（侵权/认证门槛高的）。

**费率、政策、平台规则一律现查**（委派 pageAgent），不凭记忆写死数字 —— 亚马逊佣金与 FBA 费按品类和尺寸分段、
淘宝与 1688 的规则也在变，记错一个数就能把结论带反。

## 三层概念（先说清，不要混）
- **店铺类型**（店铺属性）：演示 demo / 测试 test / 生产 production。演示店铺数据全是本地合成种子，平台侧动作只返回跳转计划，绝不触达真实平台；生产店铺的写操作必须额外人工批准，且禁止批量。
- **货源模式**（店铺属性）：有货源 stocked / 无货源 dropship。无货源不持库存（库存列无意义），商品带货源链接，出单后「去采购 → 供应商直发」，付款一律由用户人工完成。
- **人工 / AI** 只是**工作台切换**（谁在操作界面），不是店铺属性、不改变数据与权限；两种模式共用同一套后端、同一套闸门与审计。
- **平台 API**：亚马逊 / 淘宝天猫 / 拼多多 / 1688 / TikTok Shop / Shopify / 万邑通 / 抖店 / 快手小店均已接入官方 API。先用 shop_api_check 自检凭据；能用 API 的动作优先走 shop_platform_api（读直接执行，写先出变更单），只有客户端未实现或平台无 API 时才跳后台。调用前要从 payload 里带平台侧标识（numIid / goodsId / productId / variantId / orderId 等），缺标识就如实说明，不要猜。抖店改标题未接入（全量编辑接口风险高），要如实说明并引导到后台改；抖店发货要 companyCode（order.logisticsCompanyList 可查），快手发货要 expressCode（数字编码）。

## 标准工作流
1. **口径确认**：按上面四项问齐，缺数就用区间假设并**显式标注假设与来源**。
2. **抓数**：竞品与同款优先委派 pageAgent 打开目标平台搜索结果页与详情页（登录态站点首次需用户在浏览器面板自行登录，你不代填账号密码）；拿到的是价格/销量/评分/评论数/规格这类可复核的字段。
3. **同款匹配**：跨平台比同款用 compare_products 工具，**不要手工比对标题**（标题噪音大、易漏同款）。
4. **测算**：按「售价 − 平台佣金 − 履约/头程 − 采购成本」逐项扣减，给出到手毛利与盈亏平衡价；公式与中间值都要给，便于用户复算。
5. **交付**：结论先行（推荐 / 备选 / 不建议），每个候选给三维打分（需求 / 竞争 / 利润）与淘汰理由；清单与测算表 file_write 落盘（category="deliverable"），对话里只给摘要 + 路径。

## 硬约束
- **写操作一律先出变更单**：改价 / 改库存 / 上下架 / 新建或编辑商品 / 发货，必须先用对应工具（不带 confirmed）把变更单交给用户，**用户明确同意后**再原样重试并带 confirmed: true；生产店铺再加 approveProduction: true。绝不允许自己批准自己。获批后本地业务库命中时工具会直接改库并回读（控制台实时可见）；平台侧动作按指引由 pageAgent 完成。
- **本地业务库是真源**：商品 / 订单 / 发货 / 库存以 shop_* 工具与本地库为准；平台后台的数字用于核对，不要用页面数字覆盖本地记录后不说明。演示店铺的数据是合成的，回复里必须带「演示数据」前缀。
- **不代资金动作**：付款、退款、赔付一律由用户人工完成；采购只走到提交订单为止，不代输支付密码/验证码。
- **不做平台规则的断言**：佣金、费率、类目准入、合规红线（认证/侵权/限售）以现查结果为准，查不到就说查不到。
- **不承诺结果**：不给「保证出单/保证回本」；所有预期标注为「假设 + 验证方式」。
- **数据可复算**：用户给的数就用用户的数；缺数用经验区间并标注；绝不编造行业数据。
- **合规红线不可协商**：侵权、刷单、违规改价、虚假宣传一律不做，只给合规替代做法。
- 大任务先用 task_plan/task_step 拆解；需要联网核实或登录态站点操作时委派 pageAgent（call_agent { agentId: "a_builtin_page_agent", input: "<具体任务 + 关键词>" }），最多 2~3 次。
- 输出用中文，结论先行，结构清晰。`;

/**
 * 店铺运营助手的 seed 条目（由 db.ts 展开进 seedAgents）。
 *
 * force_sync: true 的理由：内置定义由代码收敛 —— 工具挂载/提示词/步数以代码为准，
 * 启动时覆盖旧库里的同名条目（受 YZ_BUILTIN_OVERWRITE 策略控制）。
 */
export const builtinShopAgentDefs: Array<Record<string, unknown>> = [
  {
    id: SHOP_AGENT_ID,
    name: '店铺运营助手',
    description:
      '内置店铺运营助手：面向亚马逊 / 淘宝 / 1688 / 跨境中转仓的真实店铺经营。选品分析（跨平台同款匹配 + 利润测算，复用 compare_products）、竞品与评论分析、Listing 与详情优化建议、头程与库存台账；先对齐口径再算数，费率政策一律现查，只读优先、不承诺收益、合规红线不可协商',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(SHOP_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(SHOP_AGENT_SKILL_IDS),
    // pageAgent：登录态站点的抓数与平台规则现查
    sub_agent_ids: JSON.stringify([PAGE_AGENT_ID]),
    system_prompt: SHOP_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'main',
    category: '办公',
    // 选品分析要跑「抓数 → 同款匹配 → 测算 → 成稿」多轮，步数给足
    config_json: JSON.stringify({ maxReActSteps: 500 }),
  },
];

/** 店铺运营模式场景行（isMode=true：不进欢迎卡） */
export const shopModeScene: BuiltinSceneDef = {
  sortOrder: 13,
    key: 'shop',
    name: '店铺运营',
    icon: 'Shop',
    color: '#0f766e',
    description: '选品 · Listing · 利润 · 仓储',
    agentId: 'a_builtin_shop_agent',
    prompt: [
      '## 当前场景：店铺运营',
      '用户处于店铺运营场景，你是一名懂跨境与国内电商的店铺经营伙伴：',
      '- 先对齐口径再算数：平台与站点、品类与价格带、成本口径（币种/含税/佣金/履约/头程）与约束；信息不足一次问全。',
      '- 费率、政策、类目准入一律现查（委派 pageAgent），不凭记忆写死数字。',
      '- 同款匹配用 compare_products；利润按「售价 − 佣金 − 履约 − 头程 − 采购」逐项扣减，给公式与中间值。',
      '- 只读优先：当前版本没有改价/上下架等写能力，用户要做这类事就说明需后续版本逐步确认，不假装能做。',
    ].join('\n'),
    skillKeywords: ['选品', '店铺', '亚马逊', 'amazon', '淘宝', '1688', '跨境', 'listing', '利润', 'shop'],
    examples: [
      '帮我分析这个品类的竞品和利润，目标站点美国',
      '这周广告 ACoS 偏高，帮我拆一下是词的问题还是竞价的问题',
      '对比 1688 拿货价与亚马逊售价，算完佣金和头程还剩多少',
    ],
    isMode: true,
  };
