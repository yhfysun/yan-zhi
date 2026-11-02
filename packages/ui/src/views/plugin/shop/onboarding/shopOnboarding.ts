export type ShopPlatformChoice =
  | 'undecided'
  | 'amazon'
  | 'taobao'
  | 'pdd'
  | 'douyin'
  | 'tiktok'
  | 'shopify';

export type ShopEntityType = 'undecided' | 'individual' | 'sole_proprietor' | 'company';
export type ShopSupplyChoice = 'stocked' | 'dropship' | 'brand';
export type ShopExperience = 'beginner' | 'some' | 'experienced';
export type ShopSetupStepId = 'position' | 'account' | 'open' | 'selection' | 'listing' | 'operate';
export type ShopQuickAction = 'platform' | 'selection' | 'sourcing' | 'listing' | 'launch';

export interface ShopSetupProfile {
  platform: ShopPlatformChoice;
  market: string;
  category: string;
  budgetYuan: string;
  entityType: ShopEntityType;
  hasAccount: boolean;
  hasQualification: boolean;
  supplyChoice: ShopSupplyChoice;
  experience: ShopExperience;
  notes: string;
  completedSteps: ShopSetupStepId[];
}

export interface ShopSetupStep {
  id: ShopSetupStepId;
  title: string;
  summary: string;
  userTask: string;
  aiTask: string;
  state: 'done' | 'active' | 'pending';
}

export interface ShopSetupProgress {
  steps: ShopSetupStep[];
  completed: number;
  total: number;
  percent: number;
  nextStep: ShopSetupStep | null;
}

export const SHOP_PLATFORM_OPTIONS: Array<{ value: ShopPlatformChoice; label: string }> = [
  { value: 'undecided', label: '还没决定，请 AI 帮我选' },
  { value: 'amazon', label: '亚马逊' },
  { value: 'taobao', label: '淘宝 / 天猫' },
  { value: 'pdd', label: '拼多多' },
  { value: 'douyin', label: '抖店 / 抖音小店' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'shopify', label: 'Shopify 独立站' },
];

const PLATFORM_LABELS: Record<ShopPlatformChoice, string> = {
  undecided: '平台待定',
  amazon: '亚马逊',
  taobao: '淘宝 / 天猫',
  pdd: '拼多多',
  douyin: '抖店 / 抖音小店',
  tiktok: 'TikTok Shop',
  shopify: 'Shopify 独立站',
};

const ENTITY_LABELS: Record<ShopEntityType, string> = {
  undecided: '主体待定',
  individual: '个人身份（身份证开店）',
  sole_proprietor: '个体工商户（需要营业执照）',
  company: '企业（需要营业执照）',
};

const ENTITY_MATERIAL_RULES: Record<ShopEntityType, string> = {
  undecided: '先确认主体类型，再按平台当前规则列材料。',
  individual: '个人身份店不得要求营业执照；按平台当前要求准备身份证实名、店铺名称、经营地址等。',
  sole_proprietor: '个体工商户需要营业执照，并按平台要求准备经营者身份证、收款账户等。',
  company: '企业需要营业执照，并按平台要求准备法人身份证、对公账户、品牌资质等。',
};

const SUPPLY_LABELS: Record<ShopSupplyChoice, string> = {
  stocked: '有货源',
  dropship: '无货源',
  brand: '自有品牌 / 工厂',
};

const EXPERIENCE_LABELS: Record<ShopExperience, string> = {
  beginner: '第一次开店',
  some: '做过一些电商',
  experienced: '有成熟经验',
};

const STEP_IDS: ShopSetupStepId[] = ['position', 'account', 'open', 'selection', 'listing', 'operate'];

const STEP_META: Array<Omit<ShopSetupStep, 'state'>> = [
  {
    id: 'position',
    title: '明确经营定位',
    summary: '平台、市场、品类和预算先对齐，后面的测算才不会跑偏。',
    userTask: '确认想卖给谁、卖什么、准备投入多少。',
    aiTask: '比较平台与市场，给出 2 至 3 条可选路线和取舍理由。',
  },
  {
    id: 'account',
    title: '准备账号与资质',
    summary: '按个人、个体工商户或企业准备对应主体资料与类目资质。',
    userTask: '个人准备身份证实名；个体户/企业准备营业执照与对应主体资料。',
    aiTask: '按目标平台列出材料清单、类目准入与合规风险。',
  },
  {
    id: 'open',
    title: '完成平台开店',
    summary: '打开平台官方入口，用户本人登录并提交开店申请。',
    userTask: '本人完成登录、实名认证、验证码和最终提交。',
    aiTask: '打开官方页面，逐步指引填写；能代填的字段由 AI 代填。',
  },
  {
    id: 'selection',
    title: '选品与利润验证',
    summary: '用可复核的数据筛需求、竞争和利润，不凭感觉选品。',
    userTask: '补充目标客单价、不能做的品类和已知供应链。',
    aiTask: '抓竞品、匹配同款、算到手利润，输出候选清单与淘汰理由。',
  },
  {
    id: 'listing',
    title: '建品、货源与 Listing',
    summary: '把选中的商品做成可上架素材，并核对采购、定价和合规。',
    userTask: '确认品牌授权、样品和最终定价。',
    aiTask: '生成标题、卖点、图片需求、SKU、成本与上架变更单。',
  },
  {
    id: 'operate',
    title: '首单与持续运营',
    summary: '接入订单、库存和物流，形成发布后的经营闭环。',
    userTask: '处理付款、验证码、采购付款和平台最终确认。',
    aiTask: '跟踪订单与库存，生成发货、补货、广告和复盘建议。',
  },
];

export function createDefaultShopSetupProfile(): ShopSetupProfile {
  return {
    platform: 'undecided',
    market: '',
    category: '',
    budgetYuan: '',
    entityType: 'undecided',
    hasAccount: false,
    hasQualification: false,
    supplyChoice: 'stocked',
    experience: 'beginner',
    notes: '',
    completedSteps: [],
  };
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeShopSetupProfile(value: unknown): ShopSetupProfile {
  const raw = recordOf(value);
  const fallback = createDefaultShopSetupProfile();
  const platform = SHOP_PLATFORM_OPTIONS.some((item) => item.value === raw.platform)
    ? raw.platform as ShopPlatformChoice
    : fallback.platform;
  const entityType = ['individual', 'sole_proprietor', 'company'].includes(String(raw.entityType))
    ? raw.entityType as ShopEntityType
    : fallback.entityType;
  const supplyChoice = ['stocked', 'dropship', 'brand'].includes(String(raw.supplyChoice))
    ? raw.supplyChoice as ShopSupplyChoice
    : fallback.supplyChoice;
  const experience = ['beginner', 'some', 'experienced'].includes(String(raw.experience))
    ? raw.experience as ShopExperience
    : fallback.experience;
  const completedSteps = Array.isArray(raw.completedSteps)
    ? [...new Set(raw.completedSteps.filter((step): step is ShopSetupStepId =>
      STEP_IDS.includes(step as ShopSetupStepId)))]
    : [];

  return {
    platform,
    market: textOf(raw.market),
    category: textOf(raw.category),
    budgetYuan: textOf(raw.budgetYuan),
    entityType,
    hasAccount: raw.hasAccount === true,
    hasQualification: raw.hasQualification === true,
    supplyChoice,
    experience,
    notes: textOf(raw.notes),
    completedSteps,
  };
}

function isPositionReady(profile: ShopSetupProfile): boolean {
  return profile.platform !== 'undecided'
    && !!profile.market
    && !!profile.category
    && !!profile.budgetYuan;
}

export function setupProgressOf(profile: ShopSetupProfile, hasConnection: boolean): ShopSetupProgress {
  const completed = new Set<ShopSetupStepId>(profile.completedSteps);
  if (isPositionReady(profile)) completed.add('position');
  if (profile.hasAccount && profile.hasQualification) completed.add('account');
  if (hasConnection) completed.add('open');

  let activeAssigned = false;
  const steps = STEP_META.map((meta): ShopSetupStep => {
    const done = completed.has(meta.id);
    const state = done ? 'done' : activeAssigned ? 'pending' : 'active';
    if (!done) activeAssigned = true;
    return { ...meta, state };
  });
  const doneCount = steps.filter((step) => step.state === 'done').length;

  return {
    steps,
    completed: doneCount,
    total: steps.length,
    percent: Math.round((doneCount / steps.length) * 100),
    nextStep: steps.find((step) => step.state === 'active') || null,
  };
}

function platformLabelOf(profile: ShopSetupProfile): string {
  return PLATFORM_LABELS[profile.platform] || PLATFORM_LABELS.undecided;
}

function profileFacts(profile: ShopSetupProfile): string {
  return [
    `- 平台：${platformLabelOf(profile)}`,
    `- 目标市场：${profile.market || '待确认'}`,
    `- 品类 / 商品方向：${profile.category || '待确认'}`,
    `- 可投入预算：${profile.budgetYuan ? `约 ${profile.budgetYuan} 元人民币` : '待确认'}`,
    `- 经营主体：${ENTITY_LABELS[profile.entityType]}`,
    `- 主体材料规则：${ENTITY_MATERIAL_RULES[profile.entityType]}`,
    `- 账号状态：${profile.hasAccount ? '已有平台账号' : '还没有平台账号'}`,
    `- 资质状态：${profile.hasQualification ? '主体与类目资质已准备' : '资质尚未准备齐全'}`,
    `- 供货方式：${SUPPLY_LABELS[profile.supplyChoice]}`,
    `- 电商经验：${EXPERIENCE_LABELS[profile.experience]}`,
    `- 额外约束：${profile.notes || '无'}`,
  ].join('\n');
}

export function buildShopSetupPrompt(
  profile: ShopSetupProfile,
  options: { projectTitle?: string; platformLabel?: string } = {},
): string {
  const title = options.projectTitle?.trim() || '我的店铺项目';
  const platform = options.platformLabel?.trim() || platformLabelOf(profile);

  return `我正在从零开一家店，请作为我的店铺运营负责人，直接带我完成，不要只给泛泛建议。

【当前项目】${title}
【目标平台】${platform}

【我已经提供的信息】
${profileFacts(profile)}

【执行方式】
1. 先用 task_plan 拆出从账号准备、开店提交、选品测算、货源与 Listing 到首单运营的可执行步骤。
2. 只询问上面仍然缺失、且会改变决策的信息；已经提供的信息不要再重复询问。缺失项请一次问全，不要挤牙膏。
3. 需要平台规则、费率、类目准入或竞品数据时，委派 pageAgent 打开官方页面现查；不要凭记忆写死费率。能查询和计算的部分由你完成。
4. 选品必须用 compare_products 做同款匹配，并给出售价、平台佣金、履约、采购和到手利润的逐项测算。
5. 给出清晰的下一步动作；涉及改价、上下架、建品、发货等写操作时，先出变更单让我确认。付款、退款、验证码和资金动作必须由我本人完成。
6. 如果平台尚未决定，先比较 2 至 3 个适合我的平台，说明启动成本、流量逻辑、资质门槛和退出成本，再推荐一个。
7. 主体类型必须严格区分个人身份、个体工商户和企业。个人身份店不得要求营业执照；只有个体工商户和企业才需要营业执照。官方页面写明“个人身份 / 我没有营业执照”时，以页面当前口径为准，不得用历史记忆否定。

【安全边界】
账号密码、验证码、支付密码由我本人操作。你可以打开官方页面并告诉我每一步填什么，但不得代填或索取这些敏感信息。

请从当前最靠前的未完成阶段开始，先给我这一轮要做什么和需要我补充的信息。`;
}

export function buildQuickShopPrompt(action: ShopQuickAction, profile: ShopSetupProfile): string {
  const common = `当前平台：${platformLabelOf(profile)}；目标市场：${profile.market || '待确认'}；商品方向：${profile.category || '待确认'}；预算：${profile.budgetYuan || '待确认'} 元。`;
  const prompts: Record<ShopQuickAction, string> = {
    platform: `${common}
请比较适合这个方向的 2 至 3 个平台，按启动成本、流量来源、类目门槛、履约难度和退出成本打分，最后推荐一个并给出从注册到开店的材料清单。平台规则要现查。`,
    selection: `${common}
请开始选品验证：先明确需求、竞争、利润三个评分维度，再委派 pageAgent 抓取可复核的竞品数据，用 compare_products 做同款匹配，最后输出 3 至 5 个候选的选品清单和逐项利润测算。`,
    sourcing: `${common}
请为候选商品寻找 1688 同款货源，核对阶梯价、MOQ、供货能力和侵权风险；用 compare_products 算铺货差价。只给可执行的货源与询价清单，不代下单、不代付款。`,
    listing: `${common}
请为当前最推荐的候选商品生成一套可上架的 Listing：标题、五点卖点、详情结构、主图/场景图需求、SKU、定价和合规检查。涉及建品时先出变更单，不要直接写平台。`,
    launch: `${common}
请检查现在是否具备发布首单的条件：账号、资质、选品、货源、定价、Listing、库存/履约和售后。按阻塞项排序，能由你完成的直接完成，必须我本人完成的列成待办。`,
  };
  return prompts[action];
}
