---
name: novel-tuiwen
description: 小说推文全自动产线：授权平台选书→过滤打分→取授权正文→Edge-TTS 配音→背景视频合成 4:3 成片→发布（抖音/快手）→引导评论→番茄达人中心回填发文。对应内置工具 novel_tuiwen + api_media_fetch。
---

# 小说推文视频（全自动产线）

## When to use

- 要做小说推文视频：选书 → 出片 → 发布 → 评论 → 回填
- 要操作番茄达人中心（选书 / 取正文 / 别名 / **回填发文**）
- 要发布到抖音或快手，或发引导评论、建合集
- 要排查上述页面的操作失败（点不到、填不进、卡加载）

## 文档结构

| 层级 | 路径 | 职责 |
|------|------|------|
| L0 | `references/README.md` | 索引 + 加载顺序 |
| L1 | `references/pipeline.md` | 出片产线：`novel_tuiwen` 参数、标题条/字幕、ffmpeg 坑、TTS、依赖 |
| L1 | `references/platform-specs.md` | 各平台画幅与 `aspect` 取值 |
| L1 | `references/common/arco-dom.md` | arco 站点通用表单规矩（受控输入 / 日期选择器 / 抽屉） |
| L1 | `references/pages/<平台>/<页>/index.md` | 何时用、展示、公共说明、操作文件表 |
| L1 | `references/pages/<平台>/<页>/<操作>.md` | 具体操作：步骤 + **实抓锚点** + Browser 配方 |

## 加载口诀

```text
办业务：定环节 → 定页面 → index.md → {操作}.md →（arco 站点才加）common/arco-dom.md
出片：  pipeline.md（参数与坑）
排版：  platform-specs.md
```

- 页面文档里的选择器**都会漂** → 落操作前**先实抓复核一次**，优先「文本 + placeholder + `[class*=前缀]`」。
- 没验证过的入口**不要编造**：搜不到就截图如实报告（合集、置顶都踩过这个坑）。

## 授权平台（多渠道，按序尝试，单家卡住换下一家）

1. **番茄达人中心**（字节官方）https://kol.fanqieopen.com — **首选**，书/正文/别名/回填全 Web 端闭环（2026-10 实测走通）
2. 七猫 https://zuozhe.qimao.com — 偏情感/家庭/年代文，竞争小
3. 书旗小说（阿里）https://www.shuqi.com
4. 纵横小说 https://www.zongheng.com — 男频/玄幻向
5. 巨日禄 https://www.jurilu.com — 2026-10 实测不可达，跳过，仅作候选

聚合渠道（右豹/小果繁星/即客/U客直谈）只有微信小程序，浏览器工具进不去。
番茄官网 fanqienovel.com 正文有字体混淆，**正文一律从达人中心书详情拿**。

## 平台现状（2026-10 实测）

- **番茄达人中心**：全链路 Web 端闭环 ✅（书/正文/别名/回填）
- **快手** `cp.kuaishou.com`：发布 + 作品管理 Web 端走通 ✅（2026-10-15 实测发布 3 集）
- **抖音** `creator.douyin.com`：Web 上传可达 ✅，登录态需用户在浏览器面板登录一次
- 七猫/书旗/纵横：无 Web 推广门户（推广子域不可达，授权在小程序/聚合渠道）→ 仅作书源参考，产线以番茄为主

## 场景 → 页面与操作

| 环节 | 页面 index | 操作 |
|------|------------|------|
| 选书 | `pages/fanqie/content/index.md` | `pages/fanqie/content/browse.md` |
| 取正文 | `pages/fanqie/book-detail/index.md` | `pages/fanqie/book-detail/fetch-text.md` |
| 建别名 | `pages/fanqie/alias-manage/index.md` | `pages/fanqie/alias-manage/create-alias.md` |
| **回填发文（结算前提）** | `pages/fanqie/alias-manage/index.md` | `pages/fanqie/alias-manage/backfill.md` ★ 快手走这条 |
| 批量回填（仅抖音） | 同上 | `pages/fanqie/alias-manage/backfill-batch.md` |
| 发布到快手 | `pages/kuaishou/publish/index.md` | `pages/kuaishou/publish/publish-video.md` |
| 快手作品核验 | `pages/kuaishou/works/index.md` | `pages/kuaishou/works/list-works.md` |
| 发布到抖音 | `pages/douyin/publish/index.md` | `pages/douyin/publish/publish-video.md` |
| 抖音合集 | 同上 | `pages/douyin/publish/collection.md` |
| 发引导评论 | `pages/douyin/comment/index.md` | `pages/douyin/comment/post-comment.md` |

## 全流程（聊天内一句话触发）

1. **选书**：授权平台按序尝试，浏览器工具抓书目 → `pages/fanqie/content/browse.md`；抓不到就换下一家，不死磕
2. **过滤**：题材热度 / 开头钩子 / 竞争度打分，取 Top1-3
3. **正文**：达人中心书详情逐章抓全文 → `file_write` 到 `<工作目录>/novel/<书名>/chNN.txt`（其他平台不给全文时 `ask_user`）
4. **背景**：优先本地素材；题材与选法见 `pipeline.md`「背景素材选取」
5. **出片**：`novel_tuiwen { chapter, title, alias, chapter, bg_video }` → `pipeline.md`
6. **发布**（需 confirm_user）：抖音 / 快手各见其 `publish-video.md`
7. **引导评论**：抖音发布后发引导评论 → `pages/douyin/comment/post-comment.md`
8. **回填发文**：番茄达人中心别名管理 → `backfill.md` —— **不回填不结算**
9. **回报**：选书理由 + 成片路径 + 发布/回填状态

## Browser automation 规矩

1. **首次打开页面**：一次到位（`browser_navigate` 后再操作），**别先开一个空 tab 再导航**
2. **同一页续操作**：复用同一个 `tabId`，不要重复 navigate 同一 URL
   —— ⚠️ 回填抽屉**不存草稿**，重新 navigate = 已填内容全清空
3. ⚠️ **需要 multi-tab 时给读取类工具传 `tabId`**（`browser_get_page_content` / `browser_get_page_info` 等），
   别靠"切来切去"改变当前页 —— 面板上"你看到的页"和工具"实际操作的页"不一定同一个
4. ⚠️ **预览面板收起（hidden）时微前端懒加载被节流** → 页面像假死。
   操作评测/抖音这类站点前，**先让用户把面板展开**
5. ⚠️ **收尾前主动收拾页面**：`browser_get_tabs` 看有哪些页（`agentOpened: true` 的才是你开的）→
   `browser_close_tab({ tabIds: [...] })` **一次关掉中间页**（搜索结果页、登录页、中转页），
   只保留该给用户看的成果页。**只能关自己开的**，用户手开的关不掉也别反复试
6. 新建/切换标签页：`browser_new_tab` / `browser_switch_tab` ——
   **要让用户看到某个页，就用 `browser_switch_tab` 显式切过去**，别指望它自己跟着走

## 书名红线

出片 `title` 传**别名**（书名会烧进标题条）、ending 传「搜索别名XX看后续」、发布文案**禁书名** —— 别名才白挂。
不传 alias/chapter 会告警（标题条只剩书名 = 违反红线）。

### 引导要点（转化位，别漏）

必须点名「**番茄小说**」App —— 别名是番茄**站内**搜索词，观众在抖音/快手**搜不到**：
**banner、ending、评论区三处都要写**「打开番茄小说搜「别名」」。
番茄无网页版可跳；0 粉走引导搜索，≥500 粉可开锚点挂链接。

## 赛道规则（巨日禄工具宝箱）

- **4:3 画面**；别关联中视频；**别发小红书**（封号）；日更 + 持续回传
- 只发布**已授权**书目，未授权搬运侵权
- **风控**：新号人工养 1-2 周；单号单浏览器指纹；**日发 ≤3 条/号**；拟人化（随机延时、真人轨迹）

## 结算规则（2026-10 核实，钱相关，务必向用户讲清）

- **怎么算**：官方结算**按「拉新量」** —— 用你分享的**别名**在【番茄小说 App】里**搜出本书 →
  下载/注册/充值**的用户才算。同名下的充值再给分成。
  - 拉新/拉活：约 **3–9 元/人**（常见 7–10，大促可到 15；以任务详情页单价为准）
  - 充值分成：约 **15%–70%**（按活动/书目）
  - 提现门槛：**满 100 元**可提现
- **回填是结算前提**：发布后必须在「申词记录 → 别名 → 回填发文」填**短视频作品链接**（不是小说链接）
  - **1 条链接即生效**，同一本书发多平台 / 多集**不必每条都回填**（详见 `pages/fanqie/alias-manage/backfill.md`）
  - 但**支持多次回填**：每次把结算截止推到「**最新发文日期 + 28 天**」→ 想"续命"就定期回填新视频
  - **新别名 7 天内不回填会失效**（2026-10-09 官方页面原文；过期别名不再计拉新。此前误记 14 天已更正）
  - **回填链接必须与「发文类型」匹配**，否则影响收益结算（官方页面原文警示）
- **结算周期（读法）**：订单 **T+2 出单** → **T+4 结算到账**（≈ 拉新后第 6 天到账）。当月收益一般次月固定日结算
- **别名有效期 6 个月**（比回填窗口长，回填窗口由"最新发文 + 28 天"约束）
- **红线（踩了直接不给钱/封号）**：禁机刷/任务量/放单平台做单；禁涉黄涉政擦边；禁版权侵权；
  别让用户"完成任务"式操作（系统要判真实用户）
- 数据查看：达人中心「我的收益」页；订单/结算明细按别名归集

## 工作方式与纪律

- ⚡ **自动化模式**：**开局一次 `ask_user` 问完全部决策项**（选书倾向 / 文案风格 / 发布节奏 / 画幅 / 章数 / 素材），
  用户说"你决定"即按默认执行；**中途一律不问**（书名用别名、标题描述话题自己写、弹窗自行处置）；
  **发布不二次确认**（用户下发发布指令即为授权），但任务未要求发布时**不得自作主张发**。
- 🚫 **工具使用纪律**：**优先用已有工具，不自造绕过** ——
  上传只用 `browser_upload`（禁自建本地 HTTP 服务 / `fetch file://` 写 `input.value`，浏览器安全模型下必失败）；
  工具报"不可用"就**停下如实报告**，不要发明替代通道。
- 🔓 **权限**：本智能体默认「完全权限 all」+ 路径守卫关闭，文件 / 命令 / 装依赖不弹授权窗（用户要求不询问）；
  危险命令护栏仍拦（递归删除 / 格式化 / 强推等硬红线）。
- 🔁 **批量**：多章逐章出片；`scheduled_task`（cron 每日）+ 登录态 → 每天自动出 N 条。
- 🖼️ **封面两段式**（2026-10-12）：生图模型画中文字必糊 → `api_image_generate` 只出**无字底图**（负向词必写），
  文字用 ffmpeg `drawtext` 烧（**只烧别名**）。规格与完整命令见 `references/cover-recipes.md`。

## Related

- 出片参数与坑 → `references/pipeline.md`
- 画幅规格 → `references/platform-specs.md`
- 页面实抓锚点 → `references/pages/`
