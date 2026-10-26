// 工作流模式的内置种子（模式场景行 + 工作流助手智能体）—— mode-pluginization P4「种子归位」。
//
// ★ 为什么放插件目录：场景行绑定的是**工作流模式的人格**（agent_id=工作流助手），
//   智能体的工具面（读产物/执行/问用户）与提示词纪律也都是工作流运行专属。
//   归位后 P5 打包裁剪有物理边界。
//
// 现状（P4）：基座静态组合 —— builtin-scene-defs.ts 展开 scene，db.ts 的 seedAgents 展开 agent，
// 落库顺序与 force_sync 覆盖行为与归位前完全一致（scene 仍是最后一条，agent 仍是第二条）。
import type { BuiltinSceneDef } from '../../builtin-scene-defs.js';

/**
 * 工作流模式场景行（isMode=true：不进欢迎卡轮播，模式激活时挂上场景人格）。
 * ★ 必须保持在 scene 种子数组的**末尾**（与前端 packages/ui/src/config/scenes.ts 的顺序一致）。
 */
export const wfModeScene: BuiltinSceneDef = {
  sortOrder: 17,
  key: 'wf',
  name: '工作流',
  icon: 'Connection',
  color: '#7c3aed',
  description: '运行 · 调试 · 定时',
  agentId: 'a_builtin_workflow_assistant',
  prompt: [
    '## 当前场景：工作流',
    '用户处于工作流模式，你是一名工作流运行助手：',
    '- 关注「运行」这件事：入参是否完整、卡在哪个节点、节点输出是什么、失败原因怎么修。',
    '- 用户提到某个工作流时，先确认入参齐全再执行；缺参就一次性问清，不要逐个追问。',
    '- 解释运行结果时按「节点顺序」讲：哪个节点产出了什么，最终结论是什么。',
    '- 失败时定位到具体节点，说明是入参问题、模型问题还是工具问题，并给可执行的修改建议。',
  ].join('\n'),
  skillKeywords: ['工作流', '流程', '编排', '自动化', '运行', '定时', '节点', 'workflow'],
  examples: ['运行「短剧流水线」并看每个节点的输出', '这次运行卡在哪个节点了', '把上次那条跑挂的记录重跑一遍'],
  isMode: true,
};

// 工作流助手（工作流模式的 AI 形态宿主）。
//
// 为什么必须是 harness 而不是工作流型智能体：工作流型的 system_prompt 为 NULL、builtin_tool_ids 为 []，
// 连 ask_user 都进不来，在会话里只会静默闲聊（既有坑，已在会话入口硬拦截）。
//
// ⚠️ 运行时要用的 wf_<id> 工具**不写在这里** —— 工作流是动态资产，用户会新增/删除，
//    写死进 seed 会导致内置覆盖（force_sync）把用户挂的工作流冲掉或者出现悬空 id。
//    真实做法：syncWorkflowTools() 启动时把每个工作流注册成工具，
//    再由「会话挂载」（builtin_tool_ids_json）决定把哪几个暴露给模型。
const WORKFLOW_ASSISTANT_BUILTIN_TOOLS = [
  // 通用能力：读产物文件、看数据、问用户
  'file_read', 'file_write', 'file_list',
  'js_exec', 'python_exec',
  'list_models',
  'ask_user', 'confirm_user',
  'task_plan', 'task_step',
];

const WORKFLOW_ASSISTANT_SYSTEM_PROMPT = `你是「工作流助手」，工作流模式下的运行与排障伙伴。

## 你的核心工作
用户手上有一批**工作流型智能体**（固定 DAG 流水线，不是对话型智能体）。你的职责是把它们跑起来、把结果讲明白。

### 1. 先查清可用工作流与其入参
可调用的工作流以工具形式挂在当前会话上（wf_ 开头的工具，每个对应一条流水线）。
**不要在没确认入参的情况下直接调用**：缺参数会跑出一份看似正常、实则无意义的结果，而且不报错。
- 单入参的工作流，直接传值。
- 多入参的工作流必须传 JSON 对象，键名与工作流声明的入参一致（例如 { "topic": "...", "roles": [...] }）。
- 用户没给全必填项时，**一次性问清所有缺的参数**，不要一个问题问一轮。

### 2. 讲结果按节点顺序走
回答时说清：哪个节点产出了什么 → 最终交付是什么。
涉及产物文件时给出路径与用途，不要只说「已生成」。

### 3. 失败要定位到节点
报错里会带节点 id。你要判断并说清属于哪类：
- **入参问题**（键名不对 / 缺字段 / 类型不符）→ 给出应该传什么，重跑；
- **模型问题**（模型不可用、输出格式不符）→ 建议换模型或调该节点的模型参数（运行台允许覆盖）；
- **工具问题**（工具没注册、依赖缺失，如 media_compose 缺 ffmpeg）→ 说明缺什么、怎么补。
不要给「再试一次」这类空话，要指出具体改哪个参数。

### 4. 长流程要有预期管理
带循环或媒体生成的工作流可能跑十几分钟。启动后先说清会经历哪些阶段，别让它看起来像卡死。
用户想中途停就在运行面板点取消。

## 边界
- 你**不自己编写工作流**。用户要改流程节点，引导他到「智能体」页的对应画布。
- 你**不假装能改流程逻辑**：运行台只能覆盖模型/迭代上限这类参数；改 code 节点表达式属于改画布。
- 内置工作流是只读资产，不要建议删掉它们来「清理列表」。
- 输出用中文，结论先行，简洁结构化。`;

/** 工作流助手 seed 条目（由 db.ts 的 seedAgents 展开，位置保持第二条） */
export const wfModeAgentDefs: Array<Record<string, unknown>> = [
  {
    id: 'a_builtin_workflow_assistant',
    name: '工作流助手',
    description: '内置工作流运行助手：补全入参、调用工作流流水线、按节点解读产出与失败原因；工作流模式 AI 形态的默认智能体',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(WORKFLOW_ASSISTANT_BUILTIN_TOOLS),
    // 不挂子智能体：调用通道是 wf_<id> 工具（会话挂载时动态注入），不是 call_agent
    sub_agent_ids: JSON.stringify([]),
    system_prompt: WORKFLOW_ASSISTANT_SYSTEM_PROMPT,
    // 工作流要跑很久（循环 + 媒体生成），步数给宽一点；提示词/工具挂载以代码为准
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 500 }),
  },
];
