// 会话场景（对齐 WorkBuddy 新任务页的三张场景卡片）
// 场景的三层区分方式：
// 1. 系统提示词不同 —— 选场景后发送首条消息时，把场景提示词追加进会话级 system_prompt
// 2. 默认挂载 Skill 不同 —— 按关键词匹配 Skill 商店里同名/同描述的技能并自动挂载
// 3. 推荐引导语不同 —— 欢迎卡片给出各场景的典型任务示例
import type { Component } from 'vue';
import { Suitcase, Monitor, Brush } from '@element-plus/icons-vue';

export type SceneKey = 'office' | 'code' | 'design' | '';

export interface SceneDef {
  key: Exclude<SceneKey, ''>;
  label: string;
  icon: Component;
  color: string;
  desc: string;
  examples: string[];
  /** 场景绑定的智能体：选中场景即切换（office=默认日常办公助手，code/design=专属内置智能体） */
  agentId: string;
  /** 场景系统提示词（追加到智能体提示词之后） */
  prompt: string;
  /** 默认挂载 Skill 的匹配关键词（对 skill.name / skill.description 小写匹配） */
  skillKeywords: string[];
}

export const SCENES: SceneDef[] = [
  {
    key: 'office',
    label: '日常办公',
    icon: Suitcase,
    color: '#3b82f6',
    desc: '写文档 · 做表格 · 会议纪要',
    examples: ['帮我把这份数据整理成周报', '起草一封项目进度同步邮件', '根据要点生成 PPT 大纲'],
    agentId: 'a_default_assistant',
    prompt: [
      '## 当前场景：日常办公',
      '用户处于日常办公场景，你是一名办公效率助手：',
      '- 擅长文档撰写（通知/周报/邮件/纪要）、表格数据处理、日程与流程安排。',
      '- 输出正式、简洁、结构化，优先使用清晰的标题与列表；涉及表格数据时用 Markdown 表格呈现。',
      '- 处理 Excel/CSV 等数据文件时，先理解列含义再汇总，保留原始精度。',
      '- 有文件/表格类工具或 Skill 可用时优先使用，产出可直接使用的成品文档。',
    ].join('\n'),
    skillKeywords: ['办公', '文档', '表格', 'excel', 'word', 'ppt', '邮件', '纪要', '报告', 'office'],
  },
  {
    key: 'code',
    label: '代码开发',
    icon: Monitor,
    color: '#8b5cf6',
    desc: '写代码 · 改 Bug · 读项目',
    examples: ['帮我读懂这个项目的目录结构', '修复这个报错：TypeError: ...', '给这个函数补充单元测试'],
    agentId: 'a_builtin_code_agent',
    prompt: [
      '## 当前场景：代码开发',
      '用户处于代码开发场景，你是一名资深开发工程师：',
      '- 先读代码再动手：修改前优先用文件工具查看相关源码与目录结构，基于真实代码作答，不凭空猜测。',
      '- 修改遵循项目既有风格与约定，最小改动，不做无关重构。',
      '- 给出可执行的完整代码块并标注文件路径；解释关键改动点与潜在影响面。',
      '- 涉及命令执行/文件写入的工具有可用时，优先落地验证而不是只给建议。',
    ].join('\n'),
    skillKeywords: ['代码', '开发', '编程', 'code', '程序', '调试', 'git', '测试'],
  },
  {
    key: 'design',
    label: '设计创意',
    icon: Brush,
    color: '#ec4899',
    desc: '出方案 · 画配图 · 找灵感',
    examples: ['给这款产品设计三版海报文案', '生成一张科技感封面配图', '帮我想十个品牌命名方案'],
    agentId: 'a_builtin_design_agent',
    prompt: [
      '## 当前场景：设计创意',
      '用户处于设计创意场景，你是一名创意设计伙伴：',
      '- 先给 2~3 个风格/方向选项（附一句理由），确认后再深化，避免一稿定死。',
      '- 视觉描述具体到位：配色（给色值）、构图、字体气质、留白与光线等可直接执行的细节。',
      '- 有图片生成类工具/Skill 可用时，主动调用产出实际成品。',
      '- 文案与命名输出多组候选并做差异化，方便挑选。',
    ].join('\n'),
    skillKeywords: ['设计', '创意', '图片', '绘图', '海报', 'logo', '配图', '生成图片', 'design'],
  },
];

export function sceneByKey(key: SceneKey): SceneDef | null {
  if (!key) return null;
  return SCENES.find((s) => s.key === key) || null;
}
