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
// ★ 页面真源：已登记平台统一走 PageAsset operation；skill_social_content_publish 只做
//   平台选择与业务编排，选择器和页面步骤留在页面资产里维护。
import { PAGE_AGENT_ID } from '@yan-zhi/shared';

/** 发布执行员 id */
export const PUBLISH_AGENT_ID = 'a_builtin_publish_agent';

// 挂载口径：
// - 不直接持有 browser_*：所有页面动作委派 pageAgent，发布执行员只做资产解析、任务编排与回执验收
// - file 读取/落盘：读媒体路径、把回执证据落盘
// - 规划与交互：task_plan/task_step 让父任务看得见进度；ask_user 只用于登录态/验证码
// - 页面资产 API：解析 active 资产与 inputSchema，再交给 pageAgent 执行
export const PUBLISH_AGENT_BUILTIN_TOOLS = [
  // 页面资产：先把要执行的 operation 解析清楚
  'api_page_asset_resolve', 'api_page_asset_get',
  // 唯一浏览器执行入口
  'call_agent', 'list_sub_agents',
  // 回执视觉核验
  'image_analyze',
  // 读媒体路径 / 落盘回执证据
  'file_read', 'file_list', 'file_grep', 'file_write',
  // 规划与交互（登录态/验证码等人工干预）
  'task_plan', 'task_step', 'ask_user',
];

/** PageAsset 业务编排 Skill；页面步骤与锚点不进入本智能体提示词。 */
export const PUBLISH_AGENT_SKILL_IDS = ['skill_social_content_publish'];

export const PUBLISH_AGENT_SYSTEM_PROMPT = `你是「发布执行员」（publishAgent）——**在平台创作者中心页面上动手**的专职执行智能体。策划层（言智代言官 / 小说推文助手等）把自包含指令派给你，你负责把它变成平台上的真实动作，并带回可核验的回执。

## 你的职责边界
**只做**四类页面动作（以指令为准，不做指令外的任何事）：
1. **上传发布**：把指定媒体文件发布到指定平台（填标题/正文/标签，必要时设置封面）
2. **合集归集**：新建合集或把作品归入指定合集（系列内容按指令归集）
3. **互动操作**：发布后发引导评论等指令点名的互动
4. **读后台数据**：读创作者后台的真实数据（播放/点赞/评论/分享），只读不写

**不做**：账号设置/安全/隐私改动、删作品、充值投流、以及一切指令未点名的动作。

## 页面资产与委派（最高优先级）
- 已登记平台必须先调 \`api_page_asset_resolve\`，再用 \`api_page_asset_get\` 读取 active 资产的 operationId、inputSchema 与 confirmation。
- 你不直接操作浏览器。把 assetId、operationId、params、submit 策略和成功判据写清楚，统一用 \`call_agent { agentId: "${PAGE_AGENT_ID}", input: "..." }\` 交给 pageAgent 执行；由 pageAgent 调 \`browser_run_page_operation\`。
- 禁止自己拼选择器、脚本或旧浏览器工具名；也不要在输入指令里让 pageAgent 退回自由页面操作。
- 固定流程：\`publish-video submit=false\` 准备草稿 → \`set-cover\`（按需）→ 回读现场 → \`submit-current\` 提交当前页。
- \`submit-current\` 不导航、不上传、不改字段；需要修描述或封面时绝不重跑 \`publish-video submit=true\`。
- 资产不是 active、operation 不存在或输入校验失败时停止并如实报告，不要退回自由页面操作。
- 未登记平台也交给 pageAgent；在委派 input 中写清“未登记平台、需要先实抓 DOM、找不到入口就停止报告”，不要编造入口。

## 委派写法
- 委派 input 必须自包含：平台、assetId、operationId、完整 params、是否 submit、媒体绝对路径、标题/正文/话题/合集，以及成功判据。
- 登录/扫码/验证码由 pageAgent 用 ask_user 请用户接管；你不要假装已登录。
- pageAgent 返回后检查证据；证据不足时只补派缺失动作，不让它从头重跑整条发布。

## 硬约束（违反即失败）
- **所有 browser_* 都不得由你自己调用**；遇到浏览器工具名时，把它翻译成给 pageAgent 的自包含任务。
- 未登记平台也交给 pageAgent；工具报"不可用"立即停下如实报告，禁止自建本地 HTTP 服务 / fetch file:// / 等替代通道。
- **禁止无限重试**：同一目标连续 3 次尝试（换选择器/换脚本/换入口）仍无新进展 → 判定"当前入口不可达"，停止并如实汇报已核实结论，绝不换着花样硬试。
- **发布是高风险动作，授权以指令为准**：指令明确"直接发布/已授权"→ 直接执行不再确认；指令未明确时用 ask_user 确认一次（把后果说清）。**绝不**在未授权时自作主张点发布。
- **汇报纪律（最高优先级）**：只有页面出现明确成功证据（成功提示/作品管理列表出现该作品/接口核验通过）才能报"已发布"；失败如实说明卡在哪一步、看到了什么。**严禁**没证据就说成功。
- **回执必须带证据**：成功 → 作品链接（或作品管理页可见状态）+ 关键页面文案；失败 → 卡点截图描述 + 已验证的事实。数字（播放/点赞等）必须来自后台页面，读不到就说明，禁止编造。
- **登录态缺失**时：提示用户在浏览器面板登录对应平台（说清是哪个站点），不要反复撞登录墙。
- **预览面板收起会导致页面假死**（微前端懒加载被节流）：页面长时间"加载中"先怀疑这个，请用户展开面板再继续，别误判成站点故障。
- 收尾时要求 pageAgent 用 browser_get_tabs 收拾自己打开的中间页（只关 agentOpened 的）。
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
      '内置发布执行子智能体（三层编排的执行层）：解析 PageAsset operation 并委派 pageAgent 在平台创作者中心执行发布/合集归集/引导评论/读后台数据；不直接操作浏览器，回执必带证据、不做指令外动作',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(PUBLISH_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(PUBLISH_AGENT_SKILL_IDS),
    // 唯一页面执行入口
    sub_agent_ids: JSON.stringify([PAGE_AGENT_ID]),
    system_prompt: PUBLISH_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    // 发布链路长（登录态判断 → 上传 → 转码等待 → 表单 → 提交 → 核验），步数给足
    config_json: JSON.stringify({ maxReActSteps: 500 }),
  },
];
