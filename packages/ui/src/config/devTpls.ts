// 代码模式任务模板（openspec four-mode-workspace 决策 3.2 / tasks 5i）
// - 数据驱动：每个模板绑定【真实存在的】子智能体 + 【已内置的】skill 组合
// - 点击模板 = 切到对应子智能体 + 挂载对应 skill（不再只是高亮，见 ChatMessageList.pickDevTpl）
//
// ⚠️ agentId 必须与 db.ts 内置智能体 id 完全一致（改前先核对）：
//   a_builtin_code_agent / a_builtin_code_explorer / a_builtin_backend_dev / a_builtin_ui_designer
//   a_builtin_frontend_dev / a_builtin_java_agent / a_builtin_cicd_agent
// ⚠️ skillIds 必须是 db.ts builtinSkillDefaults 里已存在的 id
import type { Component } from 'vue';
import {
  FolderAdd, SetUp, Cpu, Share, Reading, DocumentChecked,
  Connection, Picture, Brush, MagicStick, Position, Odometer, Coffee, Box,
} from '@element-plus/icons-vue';

export interface DevTpl {
  key: string;
  label: string;
  icon: Component;
  color: string;
  desc: string;
  /** 承接的既有智能体 id（主智能体或专属子智能体） */
  agentId: string;
  /** 承接的既有智能体显示名（卡片上直接可读，点击时切换） */
  agentLabel: string;
  /** 点击后挂载的 skill id（必须是已内置的） */
  skillIds: string[];
  examples: string[];
}

export const DEV_TPLS: DevTpl[] = [
  {
    key: 'tpl-project',
    label: '建立项目',
    icon: FolderAdd,
    color: '#3b82f6',
    desc: '按技术栈生成项目骨架与目录结构',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_arch_design', 'skill_git_workflow'],
    examples: ['用 Vite + Vue3 + TS 建一个前端项目', '帮我初始化一个 Spring Boot 工程骨架'],
  },
  {
    key: 'tpl-feature',
    label: '需求开发',
    icon: SetUp,
    color: '#8b5cf6',
    desc: '需求澄清 → 架构设计 → 编码 → 自测',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_arch_design', 'skill_cross_cutting', 'skill_api_design'],
    examples: ['实现用户导出 Excel 功能，需求如下…', '给订单列表加一个批量删除接口'],
  },
  {
    key: 'tpl-read',
    label: '读懂项目',
    icon: Reading,
    color: '#f97316',
    desc: '目录结构 / 调用链 / 改动影响面',
    agentId: 'a_builtin_code_explorer',
    agentLabel: '代码探索助手',
    skillIds: ['skill_code_explain', 'skill_arch_design'],
    examples: ['帮我读懂这个项目的目录结构', '这个函数被哪些地方调用？改动影响面多大？'],
  },
  {
    key: 'tpl-arch',
    label: '架构设计',
    icon: Share,
    color: '#0ea5e9',
    desc: '分层与模块边界、接口契约、数据模型',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_arch_design', 'skill_cross_cutting'],
    examples: ['设计一个多租户的数据隔离方案', '拆分这个单体服务的模块边界'],
  },
  {
    key: 'tpl-api',
    label: '接口开发',
    icon: Cpu,
    color: '#0891b2',
    desc: '接口契约 → 实现 → 自测 → 文档',
    agentId: 'a_builtin_backend_dev',
    agentLabel: '高级程序助手',
    skillIds: ['skill_api_design', 'skill_unit_test_gen'],
    examples: ['实现订单查询接口，契约如下…', '给这个服务加一个分页查询 API'],
  },
  {
    key: 'tpl-ui-spec',
    label: '设计规格',
    icon: MagicStick,
    color: '#a855f7',
    desc: '信息架构 / 组件树 / 交互态 / 设计令牌',
    agentId: 'a_builtin_ui_designer',
    agentLabel: '设计助手',
    skillIds: ['skill_ui_design_spec'],
    examples: ['给这个列表页出设计规格', '设计一套暗色主题的设计令牌'],
  },
  {
    key: 'tpl-page',
    label: '页面开发',
    icon: Picture,
    color: '#ec4899',
    desc: '按设计规格产出前端页面',
    agentId: 'a_builtin_frontend_dev',
    agentLabel: '前端助手',
    skillIds: ['skill_frontend_page_build', 'skill_form_interaction'],
    examples: ['按设计稿实现这个表单页', '做一个带筛选和分页的列表页'],
  },
  {
    key: 'tpl-css',
    label: '样式打磨',
    icon: Brush,
    color: '#14b8a6',
    desc: 'CSS 布局 / 响应式 / 动效 / 性能',
    agentId: 'a_builtin_frontend_dev',
    agentLabel: '前端助手',
    skillIds: ['skill_css_styling', 'skill_frontend_performance'],
    examples: ['这个页面在移动端错位，帮我修一下', '给这个过渡加个自然的动效'],
  },
  {
    key: 'tpl-bugfix',
    label: 'Bug 修复',
    icon: MagicStick,
    color: '#e11d48',
    desc: '读堆栈 → 定位 → 最小改动 → 回归',
    agentId: 'a_builtin_code_explorer',
    agentLabel: '代码探索助手',
    skillIds: ['skill_code_explain', 'skill_unit_test_gen'],
    examples: ['修复这个报错：TypeError: ...', '页面偶发白屏，帮我排查根因'],
  },
  {
    key: 'tpl-review',
    label: '代码审查',
    icon: Position,
    color: '#0d9488',
    desc: '规范 / 安全 / 可维护性逐项过一遍',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_code_review', 'skill_code_security_audit'],
    examples: ['审查我这次改动，重点看安全与边界', '这段代码有没有性能隐患？'],
  },
  {
    key: 'tpl-refactor',
    label: '重构优化',
    icon: Odometer,
    color: '#7c3aed',
    desc: '消除重复、拆分职责、保持行为不变',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_code_refactor', 'skill_unit_test_gen'],
    examples: ['这个类太胖了，帮我拆一下', '把重复的校验逻辑抽成公共层'],
  },
  {
    key: 'tpl-test',
    label: '补单元测试',
    icon: DocumentChecked,
    color: '#16a34a',
    desc: '按现有风格补齐边界与异常用例',
    agentId: 'a_builtin_code_agent',
    agentLabel: '代码编写助手',
    skillIds: ['skill_unit_test_gen'],
    examples: ['给这个模块补齐单元测试', '按现有测试风格补边界与异常用例'],
  },
  {
    key: 'tpl-java',
    label: 'Java 专项',
    icon: Coffee,
    color: '#dc2626',
    desc: 'Maven/Gradle 构建、Spring 分析、调试',
    agentId: 'a_builtin_java_agent',
    agentLabel: 'Java 开发助手',
    skillIds: ['skill_backend_impl', 'skill_unit_test_gen'],
    examples: ['分析这个 Spring Bean 的装配过程', 'Maven 多模块依赖冲突排查'],
  },
  {
    key: 'tpl-release',
    label: '打包发布',
    icon: Box,
    color: '#475569',
    desc: '检测项目 → 生成流水线 → 一键部署',
    agentId: 'a_builtin_cicd_agent',
    agentLabel: '发布助手',
    skillIds: ['skill_git_workflow'],
    examples: ['检测当前项目并生成发布流水线', '把当前项目打包发到测试环境'],
  },
];