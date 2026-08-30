// compare_products 内置工具 —— 跨平台商品对比引擎
// 输入多平台抓取的商品列表（JSON），自动对齐同款（按标题核心词+规格匹配）、
// 归一化价格（到手价）、输出对比表+排序+推荐建议。
// 用于 pageAgent 抓取淘宝/京东/拼多多后的汇总对比。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

/** 商品输入（来自各平台抓取结果，字段尽量宽松以适配不同抓取格式） */
interface ProductInput {
  platform?: string;
  title?: string;
  price?: string | number;
  listPrice?: string | number;
  finalPrice?: string | number;
  sales?: string | number;
  rating?: string | number;
  reviewCount?: string | number;
  reviews?: unknown;
  coupons?: string | number;
  shipping?: string | number;
  shop?: string;
  url?: string;
}

/** 归一化后的商品 */
interface NormalizedProduct {
  platform: string;
  title: string;
  shop: string;
  price: number | null;
  listPrice: number | null;
  finalPrice: number;
  sales: number;
  rating: number | null;
  reviewCount: number;
  reviews: string[];
  coupons: string;
  shipping: string;
  url: string;
  spec: string; // 提取的规格（容量+版本词）
  matchScore: number; // 同款匹配度 0~1.5
  isSameModel: boolean;
  credibility: number; // 可信度评分
  priceAnomaly: boolean;
}

// 停用词表（含品类词——品类非型号，不应参与同款匹配）
const STOP_WORDS = new Set([
  '的', '和', '与', '及', '或', '在', '为', '了', '是', '有', '搜索', '购买', '买', '对比', '比价',
  '多少钱', '推荐', '哪个好', '怎么样', '评测', '参数', '配置', '价格', '报价', '行情', '最新',
  '正品', '行货', '国行', '港版', '二手', '全新', '包邮', '促销', '打折', '优惠', '便宜', '哪里',
  '手机', '电脑', '笔记本', '平板', '耳机', '音箱', '手表', '电视', '相机', '镜头', '显示器',
  '键盘', '鼠标', '路由器', '充电器', '数据线', '手机壳', '贴膜', '空调', '冰箱', '洗衣机',
  '扫地机', '机器人', '电饭煲', '微波炉', '电动', '牙刷', '吹风机', '卷发', '剃须', '剃须刀',
  'a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'to', 'is', 'it', 'buy', 'shop',
]);

// 已知品牌词（用于无空格中文 query 的拆分）
const BRAND_WORDS = [
  '华为', '小米', '苹果', '三星', 'oppo', 'vivo', '荣耀', 'honor', '一加', 'oneplus',
  '魅族', 'meizu', 'realme', 'iqoo', '努比亚', 'nubia', '中兴', 'zte', '联想', 'lenovo',
  'iphone', 'ipad', 'macbook', 'airpods', '戴森', 'dyson', '索尼', 'sony', '任天堂', 'nintendo',
  '微软', 'microsoft', '谷歌', 'google', '诺基亚', 'nokia', '雷蛇', 'razer', '罗技', 'logitech',
  '大疆', 'dji', '佳能', 'canon', '尼康', 'nikon', '飞利浦', 'philips', '松下', 'panasonic',
];

const POSITIVE_WORDS = ['好', '不错', '满意', '赞', '棒', '喜欢', '推荐', '优质', '快', '值', '划算', '正品', '给力', '牛', '靠谱', '信赖', '清晰', '流畅', '续航', '惊艳'];
const NEGATIVE_WORDS = ['差', '烂', '假', '慢', '坑', '不满', '退', '投诉', '垃圾', '问题', '坏', '失望', '骗', '水货', '翻车', '拉胯', '卡顿', '发热', '漏液'];

/** 从文本提取规格（容量+版本词），标准化为可比较字符串 */
function extractSpec(text: string): string {
  const lower = text.toLowerCase();
  const parts: string[] = [];
  // 容量：128G / 256GB / 1T / 512G
  const capMatch = text.match(/(\d+)\s*(gb|g|tb|t)\b/i);
  if (capMatch) {
    const unit = capMatch[2].toLowerCase().startsWith('t') ? 'T' : 'G';
    parts.push(capMatch[1] + unit);
  }
  // 版本关键词（长词用 includes，短词用单词边界避免误匹配）
  const longKws = ['pro max', 'pro', 'max', 'plus', 'mini', 'ultra', 'lite'];
  const shortKws = ['air', 'se'];
  for (const kw of longKws) {
    if (lower.includes(kw)) parts.push(kw);
  }
  for (const kw of shortKws) {
    if (new RegExp(`\\b${kw}\\b`).test(lower)) parts.push(kw);
  }
  return parts.sort().join('+');
}

/** 从 query 提取核心词（品牌+型号，移除规格与停用词/品类词） */
function extractCoreWords(query: string): string[] {
  // 移除容量规格，避免把 128 当核心词
  const cleaned = query.replace(/\d+\s*(gb|g|tb|t)\b/gi, '');
  const words: string[] = [];
  // 分段：英文、数字、中文
  const segments = cleaned.match(/[a-z]+|\d+|[\u4e00-\u9fa5]+/gi) || [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (/[\u4e00-\u9fa5]/.test(seg)) {
      // 中文段：先用品牌词拆分
      let remaining = seg;
      for (const brand of BRAND_WORDS) {
        const brandLower = brand.toLowerCase();
        if (remaining.toLowerCase().includes(brandLower)) {
          words.push(brandLower);
          remaining = remaining.replace(new RegExp(brand, 'i'), '');
        }
      }
      // 剩余中文：长度 2-4 作为一个词，更长则取 2-gram
      remaining = remaining.trim();
      if (remaining.length >= 2 && remaining.length <= 4) {
        if (!STOP_WORDS.has(remaining.toLowerCase())) words.push(remaining.toLowerCase());
      } else if (remaining.length > 4) {
        for (let i = 0; i < remaining.length - 1; i++) {
          const gram = remaining.slice(i, i + 2).toLowerCase();
          if (!STOP_WORDS.has(gram)) words.push(gram);
        }
      }
    } else if (/^\d+$/.test(lower)) {
      // 数字段：保留作型号（如 "15"、"60"）
      if (lower.length >= 1) words.push(lower);
    } else {
      // 英文段
      if (!STOP_WORDS.has(lower) && lower.length >= 2) words.push(lower);
    }
  }
  return [...new Set(words)];
}

/** 解析价格字符串/数字，返回正数或 null。兼容 "¥5999" / "5999元" / "约5999" / "5,999" */
function parsePrice(val: string | number | undefined): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val > 0 ? val : null;
  if (typeof val !== 'string') return null;
  const m = val.match(/[\d,]+\.?\d*/);
  if (!m) return null;
  const num = parseFloat(m[0].replace(/,/g, ''));
  return !isNaN(num) && num > 0 ? num : null;
}

/** 解析销量，处理 "1.2万+" / "月销1000" / "1000+" */
function parseSales(val: string | number | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return Math.max(0, val);
  if (typeof val !== 'string') return 0;
  const m = val.match(/([\d,]+\.?\d*)/);
  if (!m) return 0;
  let num = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(num)) return 0;
  if (val.includes('万')) num *= 10000;
  return Math.round(Math.max(0, num));
}

/** 解析评分 */
function parseRating(val: string | number | undefined): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return null;
  const m = val.match(/\d+\.?\d*/);
  if (!m) return null;
  const num = parseFloat(m[0]);
  return !isNaN(num) ? num : null;
}

/** 评论情感分类 */
function classifyReview(review: string): 'positive' | 'negative' | 'neutral' {
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (review.includes(w)) pos++;
  for (const w of NEGATIVE_WORDS) if (review.includes(w)) neg++;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/** 从评论列表提取高频关键词（中文 2-gram + 英文词） */
function extractKeywords(reviews: string[], topK = 5): string[] {
  if (reviews.length === 0) return [];
  const freq = new Map<string, number>();
  const STOP_GRAM = new Set([
    ...STOP_WORDS, '这个', '那个', '就是', '但是', '不过', '而且', '然后', '因为', '所以',
    '非常', '比较', '感觉', '觉得', '真的', '确实', '一下', '可以', '应该', '没有', '不是',
    '还是', '一般', '还行', '东西', '产品', '收到', '发货', '客服', '的话', '的是', '的一',
  ]);
  for (const r of reviews) {
    // 中文 2-gram
    for (let i = 0; i < r.length - 1; i++) {
      const gram = r.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(gram) && !STOP_GRAM.has(gram)) {
        freq.set(gram, (freq.get(gram) || 0) + 1);
      }
    }
    // 英文单词（≥3 字符）
    const enTokens = r.toLowerCase().match(/[a-z]{3,}/g) || [];
    for (const t of enTokens) {
      if (!STOP_GRAM.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map((e) => e[0]);
}

/** 计算可信度评分 */
function computeCredibility(p: NormalizedProduct): number {
  let score = 0;
  const shop = p.shop.toLowerCase();
  const title = p.title.toLowerCase();
  const tagText = (p.coupons + ' ' + p.title).toLowerCase();
  // 官方/自营/旗舰店
  if (/官方|自营|旗舰/.test(shop)) score += 3;
  else if (/官方|自营|旗舰/.test(title)) score += 2;
  // 百亿补贴/真划算/品牌认证
  if (/百亿补贴|真划算|品牌认证|正品保证|假一赔/.test(tagText)) score += 2;
  // 评分
  if (p.rating != null) score += Math.min(p.rating, 5) * 0.4;
  // 销量（对数）
  if (p.sales > 0) score += Math.min(Math.log10(p.sales + 1), 5) * 0.3;
  return Math.round(score * 10) / 10;
}

/** 价格异常检测 */
function detectPriceAnomaly(finalPrice: number, listPrice: number | null): boolean {
  if (finalPrice <= 0) return true;
  if (finalPrice > 1000000) return true; // 过高
  if (listPrice != null && listPrice > 0 && finalPrice > listPrice * 2) return true; // 到手价高于划线价 2 倍
  return false;
}

/** 归一化单个商品 */
function normalizeProduct(
  raw: ProductInput,
  coreWords: string[],
  querySpec: string,
): NormalizedProduct {
  const platform = (raw.platform || '未知平台').trim();
  const title = (raw.title || '').trim();
  const shop = (raw.shop || '').trim();
  const price = parsePrice(raw.price);
  const listPrice = parsePrice(raw.listPrice);
  const finalPriceRaw = parsePrice(raw.finalPrice);
  // 到手价优先 finalPrice，其次 price
  const finalPrice = finalPriceRaw != null ? finalPriceRaw : price != null ? price : 0;
  const sales = parseSales(raw.sales);
  const rating = parseRating(raw.rating);
  const reviewCount = parseSales(raw.reviewCount);
  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.filter((r): r is string => typeof r === 'string')
    : [];
  const coupons = (raw.coupons ?? '').toString().trim();
  const shipping = (raw.shipping ?? '').toString().trim();
  const url = (raw.url ?? '').toString().trim();

  // 规格提取与同款匹配
  const spec = extractSpec(title);
  const titleLower = title.toLowerCase();
  let coreHit = 0;
  for (const w of coreWords) {
    if (titleLower.includes(w)) coreHit++;
  }
  const coreRatio = coreWords.length > 0 ? coreHit / coreWords.length : 0;
  const specMatch = spec === querySpec && querySpec !== '';
  const matchScore = Math.round((coreRatio + (specMatch ? 0.5 : 0)) * 100) / 100;
  // 同款：核心词全部命中 且（无规格可比较 或 规格一致）
  const isSameModel =
    coreHit === coreWords.length && coreWords.length > 0 && (querySpec === '' || specMatch);

  const base: NormalizedProduct = {
    platform,
    title,
    shop,
    price,
    listPrice,
    finalPrice,
    sales,
    rating,
    reviewCount,
    reviews,
    coupons,
    shipping,
    url,
    spec,
    matchScore,
    isSameModel,
    credibility: 0,
    priceAnomaly: detectPriceAnomaly(finalPrice, listPrice),
  };
  base.credibility = computeCredibility(base);
  return base;
}

/** 格式化价格显示 */
function fmtPrice(v: number | null): string {
  if (v == null) return '-';
  return '¥' + (Math.round(v * 100) / 100);
}

/** 转义 Markdown 表格单元格内容 */
function mdCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export class CompareProductsTool implements BuiltInTool {
  name = 'compare_products';
  description =
    '跨平台商品对比引擎。输入多平台抓取的商品列表（JSON），自动对齐同款（按标题核心词+规格匹配）、归一化价格（到手价）、输出对比表+排序+推荐建议。用于 pageAgent 抓取淘宝/京东/拼多多后的汇总对比。';

  inputSchema = {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        description:
          '商品列表，每项含: platform(平台名)、title(标题)、price(当前价)、listPrice?(划线价)、finalPrice?(到手价)、sales?(销量)、rating?(评分)、reviewCount?(评论数)、reviews?(代表性评论数组)、coupons?(优惠)、shipping?(物流)、shop?(店铺)、url?(链接)',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            title: { type: 'string' },
            price: { type: 'string' },
            listPrice: { type: 'string' },
            finalPrice: { type: 'string' },
            sales: { type: 'string' },
            rating: { type: 'string' },
            reviewCount: { type: 'string' },
            reviews: { type: 'array', items: { type: 'string' } },
            coupons: { type: 'string' },
            shipping: { type: 'string' },
            shop: { type: 'string' },
            url: { type: 'string' },
          },
        },
      },
      query: {
        type: 'string',
        description: '搜索关键词（用于同款匹配的核心词提取，如 "iPhone 15 128G"）',
      },
      sortBy: {
        type: 'string',
        enum: ['finalPrice', 'price', 'sales', 'rating'],
        description: '排序字段，默认 finalPrice（到手价升序）',
      },
      topN: {
        type: 'number',
        description: '每平台最多取前 N 个商品，默认 5',
      },
    },
    required: ['products', 'query'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const products = args.products as ProductInput[] | undefined;
    const query = args.query as string | undefined;
    const sortBy = (args.sortBy as string) || 'finalPrice';
    const topN = typeof args.topN === 'number' ? args.topN : 5;

    // 参数校验
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        content: [{ type: 'text', text: '错误：query（搜索关键词）为必填项，请提供用于同款匹配的核心词。' }],
        isError: true,
      };
    }
    if (!Array.isArray(products) || products.length === 0) {
      return {
        content: [
          { type: 'text', text: `未提供商品数据。请传入各平台抓取的商品列表（products 数组），再进行「${query}」比价。` },
        ],
      };
    }

    // 提取核心词与规格
    const coreWords = extractCoreWords(query);
    const querySpec = extractSpec(query);

    // 归一化所有商品
    let allProducts = products.map((p) => normalizeProduct(p || {}, coreWords, querySpec));

    // 每平台取前 topN（按输入顺序，抓取结果通常已按相关性排序）
    if (topN > 0) {
      const byPlatform = new Map<string, NormalizedProduct[]>();
      for (const p of allProducts) {
        if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, []);
        byPlatform.get(p.platform)!.push(p);
      }
      allProducts = [];
      for (const arr of byPlatform.values()) {
        allProducts.push(...arr.slice(0, topN));
      }
    }

    // 分同款 / 非同款
    const sameModel = allProducts.filter((p) => p.isSameModel);
    const otherModel = allProducts.filter((p) => !p.isSameModel);

    // 排序
    const sortFn = (a: NormalizedProduct, b: NormalizedProduct): number => {
      switch (sortBy) {
        case 'price':
          return (a.price ?? a.finalPrice) - (b.price ?? b.finalPrice);
        case 'sales':
          return b.sales - a.sales;
        case 'rating':
          return (b.rating ?? 0) - (a.rating ?? 0);
        case 'finalPrice':
        default:
          return a.finalPrice - b.finalPrice;
      }
    };
    sameModel.sort(sortFn);
    otherModel.sort(sortFn);

    // 生成 Markdown
    const md = this.renderMarkdown(query, sameModel, otherModel, sortBy);
    return { content: [{ type: 'text', text: md }] };
  }

  /** 渲染 Markdown 输出 */
  private renderMarkdown(
    query: string,
    sameModel: NormalizedProduct[],
    otherModel: NormalizedProduct[],
    sortBy: string,
  ): string {
    const lines: string[] = [];
    lines.push(`# 「${query}」跨平台比价`);
    lines.push('');

    // ---- 对比表（同款）----
    if (sameModel.length === 0) {
      lines.push('## 对比表（同款）');
      lines.push('');
      lines.push(
        '> ⚠️ 未匹配到与搜索词核心规格一致的同款商品。已将所有商品列入「非同款/其他规格」部分，请人工核实。',
      );
      lines.push('');
    } else {
      lines.push('## 对比表（同款）');
      lines.push('');
      const minFinal = Math.min(...sameModel.map((p) => p.finalPrice));
      lines.push('| 平台 | 店铺 | 价格 | 划线价 | 到手价 | 月销 | 评分 | 优惠 | 物流 | 价差 |');
      lines.push('|------|------|------|--------|--------|------|------|------|------|------|');
      for (const p of sameModel) {
        const diff = p.finalPrice - minFinal;
        const diffStr = diff <= 0.001 ? '最低' : `+¥${Math.round(diff * 100) / 100}`;
        const anomalyTag = p.priceAnomaly ? '⚠️' : '';
        lines.push(
          [
            mdCell(p.platform),
            mdCell(p.shop || '-'),
            fmtPrice(p.price),
            fmtPrice(p.listPrice),
            anomalyTag + fmtPrice(p.finalPrice),
            p.sales > 0 ? p.sales.toLocaleString() : '-',
            p.rating != null ? p.rating.toFixed(1) : '-',
            mdCell(p.coupons || '-'),
            mdCell(p.shipping || '-'),
            diffStr,
          ].join(' | '),
        );
      }
      lines.push('');
      const sortLabel: Record<string, string> = {
        finalPrice: '到手价升序',
        price: '当前价升序',
        sales: '销量降序',
        rating: '评分降序',
      };
      lines.push(`> 排序：${sortLabel[sortBy] || sortBy}｜共 ${sameModel.length} 条同款`);
      lines.push('');
    }

    // ---- 评论摘要 ----
    lines.push('## 评论摘要');
    lines.push('');
    const source = sameModel.length > 0 ? sameModel : otherModel;
    const platformReviews = new Map<string, NormalizedProduct[]>();
    for (const p of source) {
      if (!platformReviews.has(p.platform)) platformReviews.set(p.platform, []);
      platformReviews.get(p.platform)!.push(p);
    }
    if (platformReviews.size === 0) {
      lines.push('（无评论数据）');
      lines.push('');
    } else {
      for (const [platform, prods] of platformReviews) {
        const allReviews = prods.flatMap((p) => p.reviews);
        if (allReviews.length === 0) {
          lines.push(`- ${platform}：无评论数据`);
          continue;
        }
        const positives = allReviews.filter((r) => classifyReview(r) === 'positive').slice(0, 2);
        const negatives = allReviews.filter((r) => classifyReview(r) === 'negative').slice(0, 2);
        const keywords = extractKeywords(allReviews);
        const parts: string[] = [];
        if (positives.length > 0)
          parts.push('好评' + positives.map((r) => `"${r.slice(0, 40)}"`).join('、'));
        if (negatives.length > 0)
          parts.push('差评' + negatives.map((r) => `"${r.slice(0, 40)}"`).join('、'));
        if (keywords.length > 0) parts.push('高频词' + keywords.map((k) => `「${k}」`).join(''));
        lines.push(`- ${platform}：${parts.join(' ｜ ') || '评论情感中性'}`);
      }
      lines.push('');
    }

    // ---- 建议 ----
    lines.push('## 建议');
    lines.push('');
    if (sameModel.length > 0) {
      const prices = sameModel.map((p) => p.finalPrice);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const creds = sameModel.map((p) => p.credibility);
      const maxC = Math.max(...creds);
      const minC = Math.min(...creds);

      // 最便宜
      const cheapest = sameModel.reduce((a, b) => (a.finalPrice <= b.finalPrice ? a : b));
      const diffMax = maxP - cheapest.finalPrice;
      lines.push(
        `- 最便宜：${cheapest.platform}${cheapest.shop ? `（${cheapest.shop}）` : ''} ${fmtPrice(cheapest.finalPrice)}${diffMax > 0.001 ? `（差价 ¥${Math.round(diffMax * 100) / 100}）` : ''}`,
      );

      // 最稳（可信度最高）
      const mostStable = sameModel.reduce((a, b) => (a.credibility >= b.credibility ? a : b));
      const stableReasons: string[] = [];
      if (/官方|自营|旗舰/.test(mostStable.shop)) stableReasons.push('官方/旗舰店铺');
      if (/百亿补贴|真划算|品牌认证/.test(mostStable.coupons + mostStable.title))
        stableReasons.push('正品保障标签');
      if (mostStable.rating != null && mostStable.rating >= 4.5)
        stableReasons.push(`评分 ${mostStable.rating.toFixed(1)}`);
      if (mostStable.sales > 0) stableReasons.push(`月销 ${mostStable.sales.toLocaleString()}`);
      lines.push(
        `- 最稳：${mostStable.platform}${mostStable.shop ? `（${mostStable.shop}）` : ''}（${stableReasons.join('、') || '可信度评分最高'}，可信度 ${mostStable.credibility}）`,
      );

      // 综合推荐（价格 60% + 可信度 40%）
      const scored = sameModel.map((p) => {
        const priceScore = maxP > minP ? 1 - (p.finalPrice - minP) / (maxP - minP) : 1;
        const credScore = maxC > minC ? (p.credibility - minC) / (maxC - minC) : 0.5;
        return { p, total: priceScore * 0.6 + credScore * 0.4 };
      });
      scored.sort((a, b) => b.total - a.total);
      const best = scored[0].p;
      const bestReasons: string[] = [];
      if (best.finalPrice <= minP * 1.02) bestReasons.push('价格接近最低');
      if (best.credibility >= maxC * 0.9) bestReasons.push('可信度高');
      if (best.rating != null && best.rating >= 4.5) bestReasons.push(`评分 ${best.rating.toFixed(1)}`);
      lines.push(
        `- 综合推荐：${best.platform}${best.shop ? `（${best.shop}）` : ''} ${fmtPrice(best.finalPrice)}（${bestReasons.join('、') || '价格与可信度综合最优'}）`,
      );
    } else {
      lines.push('（同款匹配为空，无法给出建议，请人工对比下方非同款商品）');
    }
    lines.push('');

    // ---- 非同款/其他规格 ----
    if (otherModel.length > 0) {
      lines.push('## 非同款/其他规格');
      lines.push('');
      lines.push(
        `> 以下 ${otherModel.length} 条商品与搜索词核心规格不完全匹配，可能为不同型号/容量/版本，供参考：`,
      );
      lines.push('');
      lines.push('| 平台 | 标题 | 到手价 | 匹配度 |');
      lines.push('|------|------|--------|--------|');
      for (const p of otherModel) {
        lines.push(
          [mdCell(p.platform), mdCell(p.title.slice(0, 40)), fmtPrice(p.finalPrice), p.matchScore.toFixed(2)].join(
            ' | ',
          ),
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}