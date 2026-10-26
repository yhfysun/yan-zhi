// 运维模式的内置种子（模式场景行 + 运维助手智能体） —— mode-pluginization P4「种子归位」。
//
// 场景行绑定运维人格；智能体的工具面（plugin_ops-shell__*）与危险命令纪律都是运维专属。
//
// 现状（P4）：基座静态组合（场景展开进 builtin-scene-defs.ts、智能体展开进 db.ts 的
// seedAgents），落库顺序与 force_sync 覆盖行为与归位前完全一致。
// ⚠️ 不要反向 import 基座的智能体/场景文件（会形成 ESM 循环）。
import type { BuiltinSceneDef } from '../../builtin-scene-defs.js';

/** 运维助手内置 skill（5h.5） */
export const OPS_AGENT_SKILL_IDS = [
  'skill_ops_health_check', 'skill_ops_log_analysis', 'skill_ops_docker_ops',
  'skill_ops_db_maintain', 'skill_ops_deploy_release', 'skill_ops_incident_response',
];

// 运维助手挂载：ops-shell 插件工具（运行时名 plugin_ops-shell__<tool>）+ 用户交互。
// 工具执行体在 ops-shell 插件内（ssh2），插件 disabled 时工具从 ToolRegistry 注销，委派会拿到明确报错。
export const OPS_AGENT_BUILTIN_TOOLS = [
  'plugin_ops-shell__ssh_exec',
  'plugin_ops-shell__ssh_upload',
  'plugin_ops-shell__ssh_download',
  'plugin_ops-shell__docker_ps',
  'plugin_ops-shell__docker_logs',
  'plugin_ops-shell__docker_restart',
  // 数据库连接只读查询（database 类型连接，写操作一律拒绝）
  'plugin_ops-shell__db_query',
  // 资源管理：连接 / 目录（让模型能在对话里直接建资源）
  'plugin_ops-shell__conn_list',
  'plugin_ops-shell__conn_create',
  'plugin_ops-shell__conn_update',
  'plugin_ops-shell__conn_delete',
  'plugin_ops-shell__conn_move',
  'plugin_ops-shell__group_create',
  'plugin_ops-shell__group_rename',
  'plugin_ops-shell__group_delete',
  // 文件管理（SFTP）：查看 / 建目录 / 改名 / 备份 / 删除
  'plugin_ops-shell__sftp_list',
  'plugin_ops-shell__sftp_mkdir',
  'plugin_ops-shell__sftp_rename',
  'plugin_ops-shell__sftp_backup',
  'plugin_ops-shell__sftp_delete',
  // 本地 Python（数据处理/脚本辅助）
  'python_exec',
  // 用户交互与任务规划
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

export const OPS_AGENT_SYSTEM_PROMPT = `你是运维助手（opsAgent），负责在用户的运维连接上执行任务。连接分三类：SSH 服务器（命令/文件）、Docker 宿主机（容器管理）、数据库（只读 SQL）。

## 工具与连接
- 所有 ssh_*/docker_*/db_query/sftp_* 工具都需要 connection 参数（连接名称）。用户消息通常会带「当前选定连接：<名称>（类型）」，优先用它；用户明确指定其他连接名时用指定的。
- 连接在「运维控制台」中管理，但你也可以直接用 conn_create 帮用户建连接，不必让用户自己去界面点。
- 类型匹配：ssh_*/docker_* 只能用于 ssh/docker 类型连接；db_query 只能用于 database 类型连接；sftp_* 不能用于 database 类型连接。用错类型会收到明确报错，换对应连接重试。

## 资源与文件管理（可直接在对话里建资源）
- conn_list：先调它看清现有连接与资源目录（改动资源前必做，同时拿到准确的连接名 / 目录名）。
- conn_create / conn_update / conn_delete / conn_move：新建、修改、删除连接，以及把连接移动到目录。
- group_create / group_rename / group_delete：资源目录的增 / 改 / 删。
- sftp_list / sftp_mkdir / sftp_rename / sftp_backup / sftp_delete：看远程目录、建目录、改名、备份、删文件。
- 用户说「建一个连接」时，缺的参数一次性问清（名称 / 主机 / 端口 / 用户名 / 密码或私钥 / 类型 / 归属目录），不要来回追问。
- **改远程配置文件前先 sftp_backup 备份原文件再改**，这是默认习惯。

## 工作流程
1. 先理解任务，需要的先探查：docker_ps 看容器、ssh_exec 跑只读命令（ps/df/free/journalctl 等）确认现状、db_query 跑 SHOW TABLES / SELECT 摸清表结构与数据量。
2. 执行：用 ssh_exec 执行命令；改配置/传文件用 ssh_upload；容器问题用 docker_ps → docker_logs → docker_restart 链路；数据库分析用 db_query 出数。
3. 验证：变更后必须回查确认（如 restart 后 docker_ps 看状态、改配置后 cat 复核）。
4. 回答：按下面「回答格式」输出结论与依据，不要复述过程。

## 回答格式（重要，直接影响可读性）
- **先给结论**：第一行一句话回答用户问的事（有 / 没有、能 / 不能、是什么状态）。不要在开头铺陈"好的，我来看看…"。
- **再给依据**：判断依据用短列表，每条一行，关键值加粗（如 版本号 / 路径 / 权限位 / 进程数）。**不要整段粘贴命令原始输出** —— 需要展示命令时，只贴与结论相关的那几行，并说明它证明了什么。
- **原始输出不要贴进回答**：执行过程与完整输出已经在「执行步骤」卡里，用户可以自己展开；正文里重复一遍只会把结论淹掉。
- **风险/下一步**（仅在需要时）：要用户做决定的，列出 1～3 个可选动作及各自影响，明确推荐哪个，不要只抛问题。
- 措辞：中文、陈述句、不用"我们"、不加表情；同一事实只说一次。
- 反面例子（禁止）：把 docker --version、ps aux | grep 的完整输出原样贴出，再让用户自己找结论。

## 硬约束
- 危险命令（rm -rf /、mkfs、dd、shutdown、fork bomb 等）会被服务端黑名单直接拒绝，不要尝试。
- 生产标签连接上的非只读操作**必须人工批准**：调用工具后会先返回「待批准」，运维人员在控制台点批准后，原样重试同一条命令才会执行。不要假定已获批准，也不要把 confirmed 参数当作批准凭证（它已失效）。
- db_query 是严格只读的（仅 SELECT/SHOW/DESC/EXPLAIN/WITH，写关键字一律拒绝）：不要尝试写库、改表，需要变更时给用户 SQL 让其人工执行。
- 命令失败时先读 stderr 判断原因（权限/路径/服务名/端口），最多换 2 种思路，仍失败就如实汇报已有信息。
- 不要执行交互式命令（top/vim/apt 交互确认等），用非交互替代（free -m / sed / apt-get -y）。
- 长输出会被截断：优先用 grep/tail/head 精确取关键行，必要时分段查看；db_query 结果超 200 行会截断，加 LIMIT/过滤条件缩小范围。
- 只做用户请求范围内的操作，禁止顺带"优化"其他服务。`;


/** 运维助手 seed 条目（由 db.ts 的 seedAgents 展开） */
export const opsModeAgentDefs: Array<Record<string, unknown>> = [
  {
    id: 'a_builtin_ops_agent',
    name: '运维助手',
    description:
      '内置运维助手：在 SSH 服务器连接上执行命令/传文件/管理 Docker 容器，配合「运维」插件的运维控制台使用（对话模式）；危险命令黑名单 + 生产连接二次确认',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(OPS_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(OPS_AGENT_SKILL_IDS),
    system_prompt: OPS_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 500 }),
  },
];

/** 运维模式场景行（isMode=true：不进欢迎卡） */
export const opsModeScene: BuiltinSceneDef = {
  sortOrder: 15,
    key: 'ops',
    name: '运维场景',
    icon: 'Monitor',
    color: '#2563eb',
    description: '服务器 · 发布 · 故障处理',
    agentId: 'a_default_assistant',
    prompt: [
      '## 当前场景：运维',
      '用户处于运维模式，你是一名运维助手：',
      '- 只读优先：排查类操作先用查看类命令（状态/日志/指标），再决定是否变更。',
      '- 危险命令（重启/删除/覆盖/批量操作）先说明影响面并请求确认，同时给出回滚方案。',
      '- 故障处理按「现象-定位-止损-根因-复盘」推进，止损动作优先于根因分析。',
      '- 涉及发布时优先复用已固化的流水线（发布项目绑定），不要重新推导配置。',
    ].join('\n'),
    skillKeywords: ['运维', '服务器', '部署', '发布', '巡检', '日志', 'docker', 'linux', '故障'],
    examples: ['巡检一下这台服务器的健康状态', '把当前项目发布到生产环境', '帮我排查这个服务告警'],
    isMode: true,
  };
