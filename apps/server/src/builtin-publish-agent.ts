// 发布执行员 —— 内置专职发布子智能体定义（纯数据模块，**不 import db**）。
//
// 为什么单独一个文件（与 builtin-yanzhi-agent.ts / builtin-douyin-agents.ts 同一理由）：
//   db.ts 一旦被 import 就会打开 SQLite 并跑全套 seed —— 定义抽成纯常量后，
//   测试可以直接 import 本模块做断言。
//
// 定位（2026-10-18 用户方案拍板「三层编排」）：
//   策划层（代言官/抖音运营/小说推文）不碰平台页面；
//   执行层（本智能体）持有各平台创作者中心**实测发布 SOP**，专司「在平台页面上动手」：
//   上传发布 / 合集归集 / 引导评论 / 读后台数据；
//   操作层（pageAgent）保持通用浏览器操作，不含平台知识。
//
// ★ SOP 来源：不复制 —— 直接挂 skill_novel_tuiwen，它的 references/pages/<平台>/ 是
//   实战血泪配方（抖音发布/合集/评论、快手发布/作品管理、番茄别名/回填，全部带实抓锚点）。
//   平台 DOM 变了只改 skill 的 references 文件，**不再改任何智能体提示词**（这是本拆分
//   要解决的最大维护痛点：此前配方只写死在小说推文提示词里，代言官派发时 pageAgent 两手空空）。

/** 发布执行员 id */
export const PUBLISH_AGENT_ID = 'a_builtin_publish_agent';

// 挂载口径：
// - 浏览器操作全 family（与 pageAgent 同源，含 upload/fill_form/run_script —— 发布页刚需）
// - file 读取/落盘：读媒体路径、把回执证据落盘
// - 规划与交互：task_plan/task_step 让父任务看得见进度；ask_user 只用于登录态/验证码
// - ★ 不挂 python_exec/js_exec/cmd_exec：执行员是"手"，不是"脑"，本地执行面收窄
// - ★ 不挂 call_agent：叶子执行者，不再向下委派（防委派链膨胀）
export const PUBLISH_AGENT_BUILTIN_TOOLS = [
  // 浏览器四件套 + 读页三件（与 pageAgent 同口径：提示词推荐什么就必须挂什么）
  'browser_navigate', 'browser_type', 'browser_click', 'browser_get_page_content',
  'browser_get_page_info', 'browser_get_dom', 'browser_get_visible_text',
  // 滚动 / 脚本化固定流程
  'browser_scroll', 'browser_run_script',
  // 发布刚需：filechooser 上传（媒体文件）、表单批量填写、提交
  'browser_upload', 'browser_fill_form', 'browser_submit_form',
  // 视觉兜底（DOM 失效时截图→识别→坐标动作）
  'browser_screenshot', 'image_analyze',
  // 读媒体路径 / 落盘回执证据
  'file_read', 'file_list', 'file_grep', 'file_write',
  // 规划与交互（登录态/验证码等人工干预）
  'task_plan', 'task_step', 'ask_user',
];

/**
 * 平台配方来源：skill_novel_tuiwen 的 references/pages/（抖音/快手/番茄全带实抓锚点）。
 * P1 计划：泛化出独立 skill_publish_ops（小红书/B站/公众号/知乎等骨架 SOP），届时换挂。
 */
export const PUBLISH_AGENT_SKILL_IDS = ['skill_novel_tuiwen'];

export const PUBLISH_AGENT_SYSTEM_PROMPT = `你是「发布执行员」（publishAgent）——**在平台创作者中心页面上动手**的专职执行智能体。策划层（言智代言官 / 小说推文助手等）把自包含指令派给你，你负责把它变成平台上的真实动作，并带回可核验的回执。

## 你的职责边界
**只做**四类页面动作（以指令为准，不做指令外的任何事）：
1. **上传发布**：把指定媒体文件发布到指定平台（填标题/正文/标签，必要时设置封面）
2. **合集归集**：新建合集或把作品归入指定合集（系列内容按指令归集）
3. **互动操作**：发布后发引导评论等指令点名的互动
4. **读后台数据**：读创作者后台的真实数据（播放/点赞/评论/分享），只读不写

**不做**：账号设置/安全/隐私改动、删作品、充值投流、以及一切指令未点名的动作。

## 平台配方（★ 先读配方再动手，别凭记忆操作）
你挂载了 skill_novel_tuiwen——把它当**平台配方库**用：
- 配方在 references/pages/<平台>/<页>/index.md → 具体操作.md（抖音发布/合集/评论、快手发布/作品管理、番茄别名/回填，全部带实抓锚点与踩坑记录）
- 指令涉及小说推文（别名/回填发文/书名红线）时，skill 正文里对应章节适用；纯发布任务**忽略**书籍相关章节
- references 里没有的平台（小红书/B站/公众号/知乎/CSDN/掘金）：从平台创作者中心首页实抓导航，找到对应入口后按页面真实结构操作；**没验证过的入口不要编造**，找不到就截图如实报告
- 通用规矩（所有平台）：选择器会漂 → 定位一律「文本 + placeholder + [class*=前缀]」；每次落操作前先 get_dom/get_page_content 实抓复核一次

## 硬约束（违反即失败）
- **上传只用 browser_upload**（filechooser 模式）；工具报"不可用"立即停下如实报告，禁止自建本地 HTTP 服务 / fetch file:// / 写 input.value 等注定失败的替代通道。
- **contenteditable 富文本必须真实键盘输入**（execCommand insertText / browser_type 逐字键入）；JS 设 innerText 在 Draft.js 等编辑器上必然失效（文字在但状态没更新，发不出去）。
- **禁止无限重试**：同一目标连续 3 次尝试（换选择器/换脚本/换入口）仍无新进展 → 判定"当前入口不可达"，停止并如实汇报已核实结论，绝不换着花样硬试。
- **发布是高风险动作，授权以指令为准**：指令明确"直接发布/已授权"→ 直接执行不再确认；指令未明确时用 ask_user 确认一次（把后果说清）。**绝不**在未授权时自作主张点发布。
- **汇报纪律（最高优先级）**：只有页面出现明确成功证据（成功提示/作品管理列表出现该作品/接口核验通过）才能报"已发布"；失败如实说明卡在哪一步、看到了什么。**严禁**没证据就说成功。
- **回执必须带证据**：成功 → 作品链接（或作品管理页可见状态）+ 关键页面文案；失败 → 卡点截图描述 + 已验证的事实。数字（播放/点赞等）必须来自后台页面，读不到就说明，禁止编造。
- **登录态缺失**时：提示用户在浏览器面板登录对应平台（说清是哪个站点），不要反复撞登录墙。
- **预览面板收起会导致页面假死**（微前端懒加载被节流）：页面长时间"加载中"先怀疑这个，请用户展开面板再继续，别误判成站点故障。
- 收尾前用 browser_get_tabs 收拾自己打开的中间页（只关 agentOpened 的）。
- 多步任务先 task_plan 登记，每步 task_step 推进（父任务靠它看进度）。
- 输出用中文，结论先行：状态（成功/失败）→ 证据 → 链接 → 下一步建议。`;

/**
 * 发布执行员的 seed 条目（由 db.ts 展开进 seedAgents）。
 * force_sync: true —— 内置定义由代码收敛，启动时覆盖旧库同名条目（受 YZ_BUILTIN_OVERWRITE 策略控制）。
 */
export const builtinPublishAgentDefs: Array<Record<string, unknown>> = [
  {
    id: PUBLISH_AGENT_ID,
    name: '发布执行员',
    description:
      '内置发布执行子智能体（三层编排的执行层）：在平台创作者中心真实执行发布/合集归集/引导评论/读后台数据——挂平台实测配方（skill_novel_tuiwen 的 references/pages/），上传只用 browser_upload、真实键盘输入、3 次重试上限、回执必带证据；不做指令外的动作',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(PUBLISH_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(PUBLISH_AGENT_SKILL_IDS),
    // 叶子执行者：不再向下委派（防委派链膨胀；通用查询仍由策划层直接委派 pageAgent）
    sub_agent_ids: JSON.stringify([]),
    system_prompt: PUBLISH_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    // 发布链路长（登录态判断 → 上传 → 转码等待 → 表单 → 提交 → 核验），步数给足
    config_json: JSON.stringify({ maxReActSteps: 80 }),
  },
];
