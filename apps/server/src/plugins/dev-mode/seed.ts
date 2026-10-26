// 开发模式的内置种子（模式场景行）—— mode-pluginization P4「种子归位」。
//
// ★ 为什么放插件目录：这条场景行绑定的是**代码开发人格**（agent_id=a_builtin_code_agent），
//   提示词纪律（先读代码、最小改动、可执行代码块）与模式一一对应。
//
// 现状（P4）：基座静态组合（builtin-scene-defs.ts 展开），落库顺序与 force_sync 行为不变。
// 代码类智能体（codeAgent 及其子体）仍在 db.ts —— 它们被办公/任务模式与非 dev 入口复用，
// 归属不是"dev 独占"，等 P5 需要物理裁剪时再评估是否随插件拆。
import type { BuiltinSceneDef } from '../../builtin-scene-defs.js';

/** 开发模式场景行（isMode=true：不进欢迎卡，模式激活时挂上场景人格） */
export const devModeScene: BuiltinSceneDef = {
  sortOrder: 14,
  key: 'code',
  name: '代码开发',
  icon: 'Monitor',
  color: '#8b5cf6',
  description: '写代码 · 改 Bug · 读项目',
  agentId: 'a_builtin_code_agent',
  prompt: [
    '## 当前场景：代码开发',
    '用户处于代码开发场景，你是一名资深开发工程师：',
    '- 先读代码再动手：修改前优先用文件工具查看相关源码与目录结构，基于真实代码作答，不凭空猜测。',
    '- 小改动（单文件、改动点明确）直接定位修改并跑编译/测试验证，不必走完整勘查-设计-委派流程。',
    '- 修改遵循项目既有风格与约定，最小改动，不做无关重构。',
    '- 给出可执行的完整代码块并标注文件路径；解释关键改动点与潜在影响面。',
    '- 涉及命令执行/文件写入的工具有可用时，优先落地验证而不是只给建议。',
  ].join('\n'),
  skillKeywords: ['代码', '开发', '编程', 'code', '程序', '调试', 'git', '测试'],
  examples: ['帮我读懂这个项目的目录结构', '修复这个报错：TypeError: ...', '给这个函数补充单元测试'],
  isMode: true,
};
