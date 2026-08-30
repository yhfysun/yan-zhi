---
name: multi-platform-shopping-compare
description: 多平台购物对比。当用户说"帮我比价""对比一下淘宝京东拼多多""手机在各平台多少钱""零食哪平台便宜""跨平台比价"时触发。用 pageAgent 驱动浏览器去淘宝、京东、拼多多搜索同一关键词，抓取商品价格/划线价/销量/评分/评论/优惠/物流/店铺，汇总成对比表与推荐结论。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 多平台购物对比（multi-platform-shopping-compare）

用内置 pageAgent 驱动浏览器，去 **淘宝 / 京东 / 拼多多** 搜索同一关键词，抓取商品信息，跨平台对比价格、销量、评分、评论、优惠、物流、店铺，输出对比表与购买建议。

## 何时触发

- 用户说"帮我比价""对比淘宝京东拼多多""XX 哪个平台便宜""跨平台比价""手机比价""零食比价"等
- 用户给一个商品关键词（手机、零食、纸巾、耳机…），要跨平台对比

## 前置条件

1. **pageAgent 已挂载**：默认助理经 `call_agent` 委派 pageAgent
2. **Playwright 已安装**：`npx playwright install chromium`
3. **网络可达各平台**：桌面端天然满足；服务端需有显示环境

## 工具清单

本 Skill 依赖以下内置工具（由 pageAgent 执行，父智能体经 `call_agent` 委派）：

### 搜索与导航
- **web_search**（含 `timeRange`/`freshness` 时间过滤）：搜索商品关键词，获取候选平台与近期在售/价格区间参考
- **browser_navigate**：打开平台搜索页 URL
- **browser_new_tab / browser_switch_tab / browser_close_tab / browser_get_tabs**：多标签页并行打开/切换/关闭淘宝、京东、拼多多搜索页，避免串行等待

### 列表与结构化提取
- **browser_extract_list**：按模板批量提取商品列表为 JSON（title/price/link/sales/rating/shop），不传 `fields` 时自动识别商品卡片；比 `get_visible_text` 再正则解析更稳
- **browser_get_page_info / browser_get_visible_text**：兜底抓取与动态识别可交互元素
- **browser_click**：进入商品详情页

### 异步加载与网络
- **browser_wait_for_request**：等待关键 XHR/Fetch 请求完成，确认列表/价格异步加载完毕再提取
- **browser_get_network_log**：取网络请求日志，定位数据接口或排查加载失败

### 视觉与可见性
- **browser_visual_locate**：截图保存为文件，引导 `image_analyze` 视觉识别目标元素坐标/文本（弹窗/浮层等 `get_page_info` 拿不到的结构兜底）
- **browser_scroll_into_view / browser_is_visible**：滚动到元素、检测可见性，处理懒加载与折叠区域

### 汇总对比
- **compare_products**：跨平台比价引擎。输入各平台抓取的商品 JSON，自动完成同款匹配（标题核心词+规格）、价格归一化（到手价）、可信度评分、评论情感分析，输出 Markdown 对比报告（对比表+排序+评论摘要+推荐）

## 标准流程（推荐）

1. **确认关键词与筛选**：商品关键词（如"iPhone 15 128G"）、是否只要官方/旗舰店、目标规格
2. **搜索候选平台**：`web_search { query: "<关键词>", timeRange: "近7天" }` 获取近期在售平台与价格区间参考
3. **并行打开平台搜索页**：`browser_new_tab` 分别打开淘宝/京东/拼多多搜索页（多标签并行，避免串行等待）
4. **等待异步加载**：`browser_wait_for_request` 确认商品列表 XHR 加载完成
5. **提取商品列表**：`browser_extract_list` 批量提取各平台前 N 个商品（title/price/link/sales/rating/shop）；提取不到时用 `browser_scroll_into_view` 触发懒加载后重试，或 `browser_get_page_info` + `browser_get_visible_text` 兜底
6. **进详情补充维度**（按需）：`browser_click` 进详情页抓 评分/评论数/优惠/物流/店铺；弹窗/浮层用 `browser_visual_locate` + `image_analyze` 识别
7. **汇总比价**：`compare_products { query, products: [<各平台商品>] }` 自动完成同款匹配 + 到手价归一化 + 可信度评分 + 评论情感分析，输出 Markdown 对比报告
8. **给建议**：综合价格、店铺可信度、物流、售后给出推荐

### 经典流程（备选，无新工具时）

1. **确认关键词与筛选**：商品关键词（如"iPhone 15 128G"）、是否只要官方/旗舰店、目标规格
2. **逐平台搜索**：委派 pageAgent 去三个平台搜索并抓取前 N 个商品
3. **抓取维度**：价格/划线价/销量/评分/评论摘要/优惠/物流/店铺
4. **对齐商品**：跨平台匹配同一款商品（按标题关键词+规格匹配）
5. **汇总对比**：输出对比表 + 价格从低到高排序 + 评论好评差评摘要
6. **给建议**：综合价格、店铺可信度、物流、售后给出推荐

## 各平台搜索入口与抓取

### 淘宝
```
1. browser_navigate { url: "https://s.taobao.com/search?q=<关键词>" }
2. 若需登录：ask_user 提示扫码登录淘宝，登录后 cookie 复用
3. browser_get_page_info → 识别商品卡片（标题/价格/销量/店铺）
4. browser_get_visible_text → 提取列表
5. browser_click { selector: "某商品" } → 进详情页
6. browser_get_page_info → 抓 评分/评论数/优惠/物流/店铺信息
7. browser_click { selector: "评价" } → browser_get_visible_text 抓代表性评论
```

### 京东
```
1. browser_navigate { url: "https://search.jd.com/Search?keyword=<关键词>" }
2. browser_get_visible_text → 列表（标题/价格/评论数/店铺）
3. browser_click 进商品详情
4. 抓 价格/划线价/促销/评分/评论/物流/自营标识
```

### 拼多多
```
1. browser_navigate { url: "https://mobile.yangkeduo.com/search_result.html?search_key=<关键词>" }
2. 若需登录：ask_user 提示扫码
3. browser_get_visible_text → 列表（价格/销量/店铺）
4. browser_click 进详情抓 百亿补贴/优惠/评论/物流
```

> URL 与页面结构会变，抓取时优先用 `browser_get_page_info` 获取可交互元素摘要，据此构造选择器，不要写死选择器。

## 抓取维度

| 维度 | 字段 | 说明 |
|------|------|------|
| 价格 | price / listPrice | 当前价 / 划线价（原价） |
| 到手价 | finalPrice | 含优惠后实付 |
| 销量 | sales | 月销/已售/收藏数 |
| 评分 | rating / goodRate | 评分、好评率 |
| 评论 | reviews | 代表性好评 2 条 + 差评 2 条摘要 |
| 优惠 | coupons | 优惠券/满减/跨店满减/首单/百亿补贴 |
| 物流 | shipping | 发货地/运费/包邮/次日达 |
| 店铺 | shop | 店铺名/官方或旗舰/店铺评分 |

## 对齐与对比

- **商品对齐**：按标题核心词 + 规格（如"128G"）+ 品牌匹配同款，不同款分开展示
- **价格对比**：到手价从低到高排序，标注价差
- **可信度**：官方/自营/旗舰店 > 普通店；结合店铺评分与销量
- **评论摘要**：每平台抽好评、差评各 2 条，提炼高频关键词（"正品/假货/快/慢/包装"）

## 输出格式

```markdown
# 「iPhone 15 128G」跨平台比价

## 对比表
| 平台 | 店铺 | 价格 | 划线价 | 到手价 | 月销 | 评分 | 优惠 | 物流 |
|------|------|------|--------|--------|------|------|------|------|
| 京东 | 苹果自营 | ¥5999 | ¥6499 | ¥5999 | 5万+ | 4.9 | 满减 | 次日达 |
| 淘宝 | Apple旗舰 | ¥5899 | ¥6499 | ¥5799 | 3万+ | 4.8 | 券 | 包邮 |
| 拼多多 | 百亿补贴 | ¥5499 | ¥6499 | ¥5499 | 10万+ | 4.7 | 百亿补贴 | 包邮 |

## 评论摘要
- 京东：好评"正品/发货快"｜差评"个别包装压角"
- 淘宝：好评"价格好/正品"｜差评"物流慢"
- 拼多多：好评"便宜/百亿补贴靠谱"｜差评"个别机器发热"

## 建议
- 最便宜：拼多多百亿补贴 ¥5499（差价 ¥500）
- 最稳：京东自营（次日达 + 售后，差价 ¥500 可接受）
- 综合推荐：京东自营（价格与可信度平衡）
```

## 注意事项

- **登录由 pageAgent 自处理（C3）**：淘宝/拼多多常需登录，pageAgent 检测到未登录时会自己调用 `ask_user` 弹窗让用户扫码，**父智能体不需要、也不应该处理登录或代填账号密码**；登录后 cookie 由 `persist:browser-view` partition 持久化复用
- **Skill 约束注入父智能体（C3）**：本 Skill 的约束（不代填账号、不绕过风控、控制节奏等）会注入到委派 pageAgent 的父智能体上下文，确保子智能体行为符合 Skill 规范
- **反爬**：频繁请求可能触发验证码，控制节奏，单平台抓完再下一个；遇验证码用 `ask_user` 让用户处理
- **页面结构会变**：别写死选择器，每步用 `browser_get_page_info` 动态识别
- **价格以详情页为准**：列表页价格有时是预估/起价，进详情页确认到手价
- **对齐要谨慎**：不同规格（128G/256G）、不同版本（国行/港版）不能直接比价，先对齐型号规格
- **百亿补贴/真划算**：拼多多这类标签的商品通常更便宜且平台背书，优先纳入
- **结果仅供参考**：价格/优惠实时变动，抓取结果只代表抓取时刻；下单前以页面实时价为准
- **合规**：仅做公开信息对比，不绕过任何平台风控，不批量爬取，单次少量商品对比
- 抓取耗时较长（三平台 × 多商品），先告知用户预计耗时，可先只比 2 个平台提速