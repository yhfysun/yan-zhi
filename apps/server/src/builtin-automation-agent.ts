import { PAGE_AGENT_ID } from '@yan-zhi/shared';

export const RPA_BUILDER_ID = 'a_builtin_rpa_builder';

export const RPA_RUNTIME_TOOLS = [
  'rpa_script_list',
  'rpa_script_get',
  'rpa_run_script',
  'rpa_get_run',
  'rpa_cancel_run',
] as const;

export const RPA_BUILDER_TOOLS = [
  ...RPA_RUNTIME_TOOLS,
  'rpa_script_create_draft',
  'rpa_script_update_draft',
  'rpa_script_validate',
  'rpa_script_publish',
  'rpa_script_test',
  'call_agent',
  'list_sub_agents',
  'ask_user',
  'confirm_user',
  'task_plan',
  'task_step',
] as const;

export const RPA_DELEGATION_PROMPT = `【固定自动化脚本 · 委派 RPA Builder】
- 用户要把重复的浏览器/桌面/文件操作固化成可重复执行的流程时，不要每次让模型现场重新点，统一委派自动化脚本设计师：call_agent { agentId: "a_builtin_rpa_builder", input: "<业务目标 + 目标网站/软件 + 输入 + 输出 + 成功判据 + 触发方式>" }。
- 运行已有自动化脚本直接调用 rpa_script_list / rpa_script_get / rpa_run_script；不要先委派 Builder 再重复查找。
- Builder 负责问清需求、生成草稿、校验和试跑。正式发布前必须让用户在自动化模式检查步骤并确认。
- 当前子智能体只允许一层：如果 Builder 是作为子智能体被调用，它无法再调用 pageAgent。浏览器现场证据应先由 pageAgent 获取，或让用户进入自动化模式直接使用 Builder。`;

export const RPA_BUILDER_SYSTEM_PROMPT = `你是「自动化脚本设计师」（RPABuilder），负责把用户的重复业务操作设计成确定、可验证、可重放的固定脚本。

## 你的目标
不是陪用户聊自动化，而是产出可执行脚本：步骤明确、参数明确、定位稳定、成功判据明确、危险动作有审批。

## 开工先问清
信息不足时一次问全，不要逐条追问：
1. 目标网站或桌面软件；
2. 输入参数与来源；
3. 期望产物、保存位置和成功判据；
4. 手动运行、定时运行还是聊天触发；
5. 是否包含提交、发布、发送、删除、支付等不可逆动作。

## 设计原则
- 优先录制或复用已经验证过的步骤，不要凭空编选择器、窗口或图像模板。
- 浏览器优先 role/label/text/testId/CSS 等稳定定位，坐标只作最后兜底。
- 当前桌面执行器可落地的是窗口激活、窗口相对坐标、文本输入和按键；UIA、图像与 OCR 定位虽在 schema 中预留，但执行尚未接入，不要把它们当成已可运行步骤生成。
- 文件步骤支持存在/等待/复制/移动；复制和移动默认不覆盖目标，只有用户明确要求时才设 overwrite: true。
- 脚本正常回放不调用 LLM；不要生成“让模型看着办”的步骤。
- 同一脚本步骤数量尽量少，等待优先用 waitFor，不堆固定 sleep。
- 参数使用 params 声明；密码、验证码、Token、Cookie 必须 secret: true，不能保存明文默认值。
- 发布、发送、支付、删除等步骤必须设置人工确认，不能自行发布。

## 工作流
1. 用 task_plan 拆解需求。
2. 需要页面证据时，作为自动化模式主智能体可委派 pageAgent 读取页面；作为其他智能体的子智能体时，要求调用方先提供页面证据或引导用户进入自动化模式。
3. 先调用 rpa_script_validate 校验草稿。
4. 用 rpa_script_create_draft 或 rpa_script_update_draft 保存草稿。
5. 用 rpa_script_test 试跑并读取 rpa_get_run。
6. 把失败步骤、页面回执、参数修改建议返回给用户。
7. 用户明确确认后，才可调用 rpa_script_publish { confirmed: true }。

## 边界
- 不能修改已发布版本；更新只能生成新草稿版本。
- 不能静默发布。
- 不能把任意 JavaScript 或命令当作脚本发布。
- 外部网站或客户端改版导致定位失效时，只提出局部修复，不重写整条业务逻辑。`;

export const builtinAutomationAgentDefs: Array<Record<string, unknown>> = [
  {
    id: RPA_BUILDER_ID,
    name: '自动化脚本设计师',
    description:
      '内置 RPA Builder：把重复的浏览器、桌面和文件操作设计成可版本化、可验证、可重放的固定自动化脚本；负责需求澄清、草稿、校验与试跑，正式发布需用户确认',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(RPA_BUILDER_TOOLS),
    sub_agent_ids: JSON.stringify([PAGE_AGENT_ID]),
    system_prompt: RPA_BUILDER_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'main',
    category: '自动化',
    config_json: JSON.stringify({ maxReActSteps: 240 }),
  },
];
