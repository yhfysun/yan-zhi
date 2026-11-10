/**
 * 浏览器操作的唯一执行入口与唯一工具清单。
 *
 * 架构约束：
 *   · 只有 pageAgent 能直接持有 / 执行 browser_* 工具；
 *   · 其他智能体统一通过 call_agent 给 pageAgent 下发自包含任务；
 *   · 所有智能体共享同一个页面操作 skill，避免各处维护旧流程。
 */

export const PAGE_AGENT_ID = 'a_builtin_page_agent';
export const WEB_PAGE_OPERATION_SKILL_ID = 'skill_web_page_operation';

/** pageAgent 的完整浏览器工具面（与 core 工具声明及桌面执行面保持同步）。 */
export const PAGE_AGENT_BROWSER_TOOLS = [
  // 导航、页面读取与交互
  'browser_navigate',
  'browser_open_external',
  'browser_search',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_hover',
  'browser_scroll',
  'browser_scroll_into_view',
  'browser_is_visible',
  'browser_drag',
  'browser_select_option',
  'browser_check',
  'browser_uncheck',
  'browser_fill_form',
  'browser_submit_form',
  'browser_upload',
  'browser_download',
  // 页面观察
  'browser_get_page_content',
  'browser_get_page_info',
  'browser_get_dom',
  'browser_get_text',
  'browser_get_visible_text',
  'browser_screenshot',
  'browser_observe',
  'browser_visual_locate',
  'browser_wait',
  'browser_wait_for',
  'browser_wait_for_request',
  'browser_get_network_log',
  'browser_next_page',
  'browser_prev_page',
  // 结构化提取与脚本
  'browser_extract_list',
  'browser_get_api_data',
  'browser_run_script',
  // 多标签
  'browser_get_tabs',
  'browser_new_tab',
  'browser_switch_tab',
  'browser_close_tab',
  // 站点配方 / PageAsset / 确定性循环
  'browser_run_recipe',
  'browser_run_page_operation',
  'browser_run_loop',
  'browser_login_saved',
] as const;

/** pageAgent 为完成任务需要的本地文件、代码执行、视觉识别与人工接管工具。 */
export const PAGE_AGENT_SUPPORT_TOOLS = [
  'file_read', 'file_write', 'file_list', 'file_grep', 'file_edit',
  'python_exec', 'js_exec', 'cmd_exec',
  'image_analyze', 'ask_user', 'confirm_user',
  'task_plan', 'task_step',
  'api_experience_read', 'api_experience_write',
] as const;

export const PAGE_AGENT_SKILL_IDS = [WEB_PAGE_OPERATION_SKILL_ID] as const;

/** 所有非 pageAgent 智能体共享的浏览器入口约束。 */
export const BROWSER_DELEGATION_PROMPT = `【网页登录与页面操作 · 委派 pageAgent】
- 浏览器操作唯一入口是 pageAgent，其他智能体不得直接调用 browser_*。
- 只有 pageAgent（${PAGE_AGENT_ID}）可以直接调用 browser_* 工具；其他智能体不得直接操作浏览器，也不得维护自己的页面动作。
- 需要打开、读取、登录、填写、点击、上传、截图、抓接口或执行页面配方时，统一委派：call_agent { agentId: "${PAGE_AGENT_ID}", input: "<目标站点 + 当前状态 + 要完成的动作 + 成功判据>" }。
- 委派输入必须自包含：写清目标 URL、账号/登录态、要填的字段或要点的按钮、成功判据，以及遇到扫码/验证码/滑块时先 ask_user。
- 只读权限不等于浏览器不可用：pageAgent 可直接导航、读页、截图、等待；点击/输入/填表/提交首次会弹授权卡。正常发起一次，不要提前判定“登录页进不去”。
- 首次打开预览面板可能较慢：同一 URL 只导航一次；返回“页面未就绪”时让 pageAgent 用 browser_get_tabs / browser_wait_for / browser_get_page_content 等待，不要反复重开标签页。
- 二维码、滑块、短信验证码、二次验证和用户账号密码必须由用户在浏览器面板接管；pageAgent 不代填验证码。
- 页面任务结束后验收 pageAgent 的证据：URL 变化、成功提示、页面状态或返回数据；不要仅凭“已点击”宣称完成。
- 不要告诉用户 pageAgent 只有六件套；它持有完整浏览器工具面。也不要自己拼旧工具名或另写浏览器流程。`;

export const WEB_TASK_AUTOMATION_DESC = '用 pageAgent 驱动真实浏览器完成登录、签到、领积分、填表单、搜索、翻页、提交、制作内容等网站自动化任务，可配合定时任务每日执行。';
export const WEB_TASK_AUTOMATION_TRIGGERS = ['每日签到', '自动登录', '领取积分', '制作视频', '填写表单', '网站自动化', 'pageAgent'];
export const WEB_TASK_AUTOMATION_BODY = `# 网站自动化任务

用内置 pageAgent 驱动真实浏览器（预览面板）完成网站操作任务。pageAgent 已挂载导航、读页、点击、输入、批量填表、提交、多标签、上传、等待、截图、视觉定位、接口直采和站点配方等完整工具面，不再只有六件套。配合「定时任务」可每日自动执行。

## 执行流程
1. 委派 pageAgent：call_agent { agentId: "a_builtin_page_agent", input: "<目标站点 + 当前状态 + 要完成的动作 + 成功判据>" }
2. browser_navigate 打开目标站点。首次打开预览面板可能较慢；同一 URL 只导航一次。
3. browser_wait_for 或 browser_get_page_content 等待并读取页面，拿正文、表单状态、可交互元素编号与稳定 selector。
4. 两点及以上字段优先一次 browser_fill_form；提交用 browser_submit_form 或点击明确的提交按钮。
5. 操作后重新 browser_get_page_content，按 URL、成功提示或表单消失判断结果，不以“按钮已点到”作为成功证据。
6. 周期任务用 scheduled_task（cron + prompt + 绑定日常办公助手）。

## 登录与权限
- 只读权限可直接导航、读页、截图、等待；点击/输入/填表/提交首次会请求用户授权，这是正常流程，不是浏览器不可用。
- 扫码、短信验证码、滑块、二次验证和用户账号密码由用户在浏览器面板接管；pageAgent 负责打开页面、等待并复核登录结果。
- 同一工具加相同参数连续两次无变化就停止重试，重新读取页面或换定位方式。

## 示例
- 每日签到：navigate → get_page_content 找签到入口 → click → get_page_content 确认积分。
- 搜索并提取：navigate 搜索页 → type 关键词并回车 → get_page_content + scroll 提取结果。`;

export const WEB_PAGE_OPERATION_DESC = '网页登录与页面操作专项：处理账号/扫码/短信/OAuth/SSO 登录、非标准表单、自定义下拉、受控输入、iframe、Shadow DOM、弹窗与多标签流程；明确只读授权、首次打开浏览器和页面未就绪时的正确处理。';
export const WEB_PAGE_OPERATION_TRIGGERS = ['网页登录', '登录页', '扫码登录', '短信验证码', 'OAuth', 'SSO', '非标准表单', '自定义下拉', '页面操作', '浏览器操作', '点击无反应', 'iframe', 'Shadow DOM', 'pageAgent'];
export const WEB_PAGE_OPERATION_BODY = `# 网页登录与页面操作

目标：把网页任务交给 pageAgent 时给出明确目标、当前状态和成功判据；不要把权限限制、首次冷启动或页面控件差异误判成“浏览器进不去”。

## 先判断问题属于哪一层
1. 权限：只读权限不是浏览器不可用。只读会话可直接导航、读页、截图、等待；click/type/fill_form/submit_form 首次会弹授权卡。不要因为当前只读就提前拒绝登录任务。
2. 冷启动：首次打开预览面板可能较慢。browser_navigate 返回页面未就绪时，用 browser_get_tabs、browser_wait_for、browser_get_page_content 等待，不要反复重开同一 URL。
3. 页面结构：先用 browser_get_page_content 获取正文、表单状态和编号元素；index 失效时重新读取，不猜 hash class。
4. 登录方式：区分原生账号密码、二维码、短信、OAuth/SSO、iframe 登录。需要人工验证时立即 ask_user。

## 非标准登录页流程
1. browser_navigate 打开登录页，browser_wait_for 或 browser_get_page_content 等待表单出现。
2. 识别登录方式：账号密码、二维码、短信、第三方 OAuth、企业 SSO、iframe/Shadow DOM。
3. 原生输入框：两点及以上字段用一次 browser_fill_form；受控输入失败时改为 click + type，并回读字段值。
4. 自定义下拉/组件库控件：先 click 展开，再 browser_get_page_content 找选项 index，click 选中；不要对 role=combobox 的伪控件调用原生 select 工具。
5. 勾选、单选、协议确认并进同一批 fill_form；折叠在抽屉或弹窗里的字段先滚动到可见区域。
6. 点击登录后等待 URL 变化、用户头像、工作台入口或成功提示；只出现“已点击”不算登录成功。
7. 二维码、短信验证码、滑块、二次验证、支付和密码输入由用户完成；pageAgent 只打开页面、等待、复核，不代填验证码。

## 非标准表单流程
- 普通控件优先一次 browser_fill_form，之后按返回的 state 回读核验。
- 富文本用 contenteditable 字段填写；联动下拉先填上游，再等下游选项出现。
- 表单出现校验提示时按原文补齐它点名的字段，同一提示连续两次不消失就停止并向用户报告。
- 弹窗、portal、iframe、Shadow DOM 里的元素以 browser_get_page_content 的编号为准；DOM 找不到时再用截图 + image_analyze 做视觉兜底。

## 委派模板
call_agent { agentId: "a_builtin_page_agent", input: "目标站点：...；当前页面/登录状态：...；要完成的动作：...；成功判据：...；遇到扫码/验证码/滑块请先 ask_user，由用户接管" }`;
