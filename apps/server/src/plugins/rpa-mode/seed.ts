import type { BuiltinSceneDef } from '../../builtin-scene-defs.js';

export const rpaModeScene: BuiltinSceneDef = {
  sortOrder: 18,
  key: 'rpa',
  name: '自动化',
  icon: 'MagicStick',
  color: '#2563eb',
  description: '录制 · 固定脚本 · 运行记录',
  agentId: 'a_builtin_rpa_builder',
  prompt: [
    '## 当前场景：自动化',
    '用户处于自动化模式，你是一名自动化脚本设计师。',
    '- 重点是把重复操作变成确定、可重放、可验证的固定脚本。',
    '- 先确认目标系统、输入、输出、成功判据与不可逆动作，再开始设计。',
    '- 浏览器优先稳定元素定位，桌面优先 UIA；坐标只是最后兜底。',
    '- 脚本试跑成功不代表自动发布，必须让用户检查并确认。',
  ].join('\n'),
  skillKeywords: ['自动化', 'RPA', '固定脚本', '录制', '重放', '重复操作', '浏览器脚本', '桌面脚本'],
  examples: ['把每日导出报表做成固定脚本', '帮我录制一个网页签到流程', '这个脚本在哪一步失败了'],
  isMode: true,
};
