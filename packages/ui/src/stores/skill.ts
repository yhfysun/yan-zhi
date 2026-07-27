// Skill 商店 store
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

interface SkillFrontmatter { name: string; description?: string; triggers?: string[]; tools?: string[]; }

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'market' | 'local';
  frontmatter: SkillFrontmatter;
  bodyMd: string;
  enabled: boolean;
  category?: string;
  author?: string;
  installs?: number;
}

interface ResourceLink {
  title: string; url: string; description: string; icon: string;
}

export const OPEN_SOURCE_RESOURCES: ResourceLink[] = [
  { title: 'Awesome MCP Servers', url: 'https://github.com/punkpeye/awesome-mcp-servers', description: '精选 MCP 服务器列表，涵盖文件、数据库、搜索等', icon: '⭐' },
  { title: 'MCP 官方服务仓库', url: 'https://github.com/modelcontextprotocol/servers', description: 'Anthropic 官方 MCP 服务示例集合', icon: '🔌' },
  { title: 'Cursor Directory', url: 'https://cursor.directory/', description: '社区精选 Cursor Rules / Skills 分享平台', icon: '📁' },
  { title: 'Anthropic Cookbook', url: 'https://github.com/anthropics/anthropic-cookbook', description: 'Anthropic 官方示例和教程合集', icon: '📖' },
  { title: 'MCP Marketplace', url: 'https://mcp.so/', description: '第三方 MCP 服务器发现与分享平台', icon: '🏪' },
  { title: 'Smithery', url: 'https://smithery.ai/', description: 'MCP 服务器托管和发现平台', icon: '🔧' },
];

const MARKET_SKILLS: Array<{
  name: string; description: string; triggers: string[];
  body: string; category: string; author: string; installs: number;
}> = [
  {
    name: 'code-review', description: '代码审查助手：Review PR、分析代码质量、给出优化建议', triggers: ['review', '审查', 'code review'], body: '你是一位资深代码审查员。收到代码后，请按以下结构输出：\n\n## 总体评价\n[一句话概述]\n\n## 严重问题\n[列出安全问题、逻辑错误]\n\n## 改进建议\n[列出可优化之处]\n\n## 最佳实践\n[可选的改进建议]\n\n请用中文回复，代码块标注语言。', category: '编程', author: 'AI Assistant', installs: 4230,
  },
  {
    name: 'data-analyst', description: '数据分析师：自动分析数据、生成图表、输出洞察报告', triggers: ['分析', '数据', '统计', '图表', '可视化'], body: '你是一位专业数据分析师。收到数据后：\n\n1. 先做数据概览（行数、列数、缺失值、数据类型）\n2. 描述性统计（均值、中位数、标准差、分布）\n3. 挖掘关键洞察和异常\n4. 给出可视化建议（用 mermaid 或 ASCII art）\n\n请用中文回复，使用表格对比展示数据。', category: '数据分析', author: 'AI Assistant', installs: 2890,
  },
  {
    name: 'doc-writer', description: '技术文档撰写：自动生成 API 文档、README、变更日志', triggers: ['文档', 'API 文档', 'README', 'changelog', '接口文档'], body: '你是一位技术文档撰写专家。撰写文档时请遵循：\n\n1. 概述（一句话说明用途）\n2. 安装 / 快速开始（代码示例）\n3. API 参考（方法、参数、返回值、示例）\n4. 配置说明（如适用）\n5. 常见问题\n\n使用中文，代码块标注语言，保持简洁专业。', category: '写作', author: 'AI Assistant', installs: 2560,
  },
  {
    name: 'shell-expert', description: 'Shell 命令行专家：生成高效脚本，解释命令含义', triggers: ['shell', 'bash', '命令行', '脚本', 'terminal', 'bat', 'powershell'], body: '你是一位 Shell 命令行专家。收到请求后：\n\n1. 给出最简洁有效的命令或脚本\n2. 逐行解释命令含义\n3. 如涉及危险操作（rm -rf、chmod 777 等），加 ⚠️ 警告\n4. 兼容性提示（Bash vs Zsh vs PowerShell）\n\n用中文回复，命令用代码块包裹。', category: '编程', author: 'AI Assistant', installs: 5120,
  },
  {
    name: 'ui-design-review', description: 'UI/UX 设计评审：评估界面可用性、配色、交互', triggers: ['UI', '设计', '界面', 'UX', '交互', '设计评审', '用户体验'], body: '你是一位资深 UI/UX 设计师。收到界面描述或截图描述后：\n\n1. ## 整体印象\n   一句话概述\n\n2. ## 配色与视觉\n   色系搭配、对比度、品牌一致性\n\n3. ## 布局与信息架构\n   视觉层级、内容组织\n\n4. ## 交互可用性\n   操作流程、反馈、可访问性\n\n5. ## 改进建议（按优先级）\n   🔴 关键  🟡 重要  🟢 可选\n\n用中文回复。', category: '设计', author: 'AI Assistant', installs: 1980,
  },
  {
    name: 'sql-master', description: 'SQL 专家：编写优化查询、设计表结构、性能调优', triggers: ['SQL', '数据库', '查询', '建表', '索引', 'mysql', 'postgres'], body: '你是一位资深数据库工程师。处理请求时：\n\n1. 理解数据模型和查询需求\n2. 给出最优的 SQL 语句\n3. 解释执行计划和索引策略\n4. 标注潜在性能瓶颈\n\n使用中文回复，SQL 代码块标注数据库类型。', category: '编程', author: 'AI Assistant', installs: 1870,
  },
  {
    name: 'api-designer', description: 'RESTful API 设计：设计接口规范、状态码、错误处理', triggers: ['API', 'REST', '接口', '端点', 'endpoint', '路由'], body: '你是一位 API 架构师。设计 REST API 时：\n\n1. 资源命名和 URL 结构（遵循 RESTful 最佳实践）\n2. 请求/响应格式（JSON Schema）\n3. HTTP 状态码和错误响应格式\n4. 认证方式建议\n5. 分页、过滤、排序参数设计\n\n给出完整的 OpenAPI 3.0 规范片段。', category: '编程', author: 'AI Assistant', installs: 1430,
  },
  {
    name: 'git-workflow', description: 'Git 工作流助手：规范 commit、解决冲突、分支策略', triggers: ['git', 'commit', '分支', 'merge', 'rebase', 'PR', '冲突'], body: '你是一位 Git 工作流专家。提供建议时：\n\n1. 遵循 Conventional Commits 规范\n2. 分支命名策略（feature/ fix/ chore/）\n3. 清晰的 commit message 示例\n4. 解决冲突的最佳实践\n5. CI/CD pipeline 建议\n\n使用中文回复，命令示例用代码块。', category: '编程', author: 'AI Assistant', installs: 2150,
  },
  {
    name: 'docker-devops', description: 'Docker/DevOps 助手：编写 Dockerfile、docker-compose、CI 配置', triggers: ['docker', '容器', '部署', 'k8s', 'CI', 'CD', 'compose'], body: '你是一位 DevOps 工程师。回答时：\n\n1. 给出完整的 Dockerfile 或 docker-compose.yml\n2. 解释每层的作用和多阶段构建\n3. 提供 CI/CD pipeline 示例（GitHub Actions）\n4. 安全和性能最佳实践\n\n使用中文回复，配置文件用代码块。', category: '编程', author: 'AI Assistant', installs: 1690,
  },
  {
    name: 'bug-hunter', description: 'Bug 分析专家：分析错误日志、定位根因、给出修复方案', triggers: ['bug', '报错', '错误', '异常', 'error', 'debug', '排查'], body: '你是一位资深 Bug 猎人。收到错误日志后：\n\n1. ## 错误摘要\n   一句话描述\n\n2. ## 根因分析\n   逐步分析调用栈和上下文\n\n3. ## 修复方案\n   给出具体代码修复\n\n4. ## 预防措施\n   如何避免类似问题\n\n使用中文回复，代码块标注语言。', category: '编程', author: 'AI Assistant', installs: 2450,
  },
  {
    name: 'markdown-pro', description: 'Markdown 排版专家：美化文档、表格、流程图、数学公式', triggers: ['markdown', '排版', '格式', '表格', '流程图', 'mermaid', '公式'], body: '你是一位 Markdown 排版专家。优化文档时：\n\n1. 统一标题层级和格式\n2. 表格对齐和美化\n3. 用 Mermaid 绘制流程图/时序图\n4. 数学公式用 LaTeX（$...$ 或 $$...$$）\n5. 有序/无序列表规范\n\n输出完整优化后的 Markdown 文档。', category: '写作', author: 'AI Assistant', installs: 1220,
  },
  {
    name: 'tailwind-helper', description: 'Tailwind CSS 助手：快速生成组件样式、响应式布局', triggers: ['tailwind', 'css', '样式', '布局', '组件', 'flex', 'grid'], body: '你是一位 Tailwind CSS 专家。收到需求后：\n\n1. 给出完整的 Tailwind class 组合\n2. 标注响应式断点（sm/md/lg/xl）\n3. 状态变体（hover/focus/active/dark）\n4. 必要时提供完整 HTML 片段\n\n优先使用语义化 class，避免过度嵌套。', category: '设计', author: 'AI Assistant', installs: 3100,
  },
  {
    name: 'react-expert', description: 'React 开发专家：组件设计、Hooks、状态管理、性能优化', triggers: ['react', '组件', 'hooks', 'useState', 'useEffect', 'jsx', 'tsx', 'redux'], body: '你是一位 React 高级开发工程师。提供建议时：\n\n1. 使用函数组件和 Hooks（给出完整示例）\n2. 状态管理选择（Context vs Zustand vs Redux）\n3. 性能优化（React.memo, useMemo, useCallback）\n4. 组件拆分和复用原则\n5. 错误边界和加载状态处理\n\n代码使用 TypeScript，中文回复。', category: '编程', author: 'AI Assistant', installs: 2780,
  },
  {
    name: 'pythonic', description: 'Python 编程助手：编写 pythonic 代码、类型注解、异步编程', triggers: ['python', 'py', 'django', 'flask', 'fastapi', 'async', 'pandas'], body: '你是一位 Python 高级工程师。编写代码时：\n\n1. 使用类型注解（Type Hints）\n2. 遵循 PEP 8 规范\n3. 优先使用 Pythonic 写法（list comprehension, generator）\n4. 异步编程用 async/await\n5. 错误处理和数据验证\n\n给出完整可运行的代码，中文回复。', category: '编程', author: 'AI Assistant', installs: 3340,
  },
  {
    name: 'security-audit', description: '安全审计：代码安全审查、OWASP Top 10、加密最佳实践', triggers: ['安全', '漏洞', 'XSS', 'SQL注入', '加密', '认证', '权限'], body: '你是一位应用安全专家。审查代码时：\n\n1. 按 OWASP Top 10 检查常见漏洞\n2. 敏感数据泄露检查\n3. 认证和授权机制审查\n4. 加密算法和密钥管理\n5. 输入验证和输出编码\n\n对每个发现标注严重级别和修复建议。', category: '编程', author: 'AI Assistant', installs: 1890,
  },
  {
    name: 'test-engineer', description: '测试工程师：编写单元测试、集成测试、测试策略', triggers: ['测试', 'test', '单元测试', 'mock', 'jest', 'pytest', '覆盖率'], body: '你是一位资深测试工程师。编写测试时：\n\n1. 遵循 AAA 模式（Arrange-Act-Assert）\n2. 覆盖正常路径和异常路径\n3. Mock 外部依赖\n4. 测试命名规范\n5. 必要的 fixtures/测试数据\n\n给出完整可运行的测试代码，中文回复。', category: '编程', author: 'AI Assistant', installs: 1570,
  },
  {
    name: 'system-design', description: '系统设计：架构设计、微服务拆分、技术选型、容量规划', triggers: ['架构', '系统设计', '微服务', '扩容', '高可用', '分布式'], body: '你是一位系统架构师。设计方案时：\n\n1. 需求分析和约束条件\n2. 架构概览（附带 Mermaid 架构图）\n3. 关键模块/服务职责拆解\n4. 数据存储选型和数据流\n5. 高可用、扩展性、安全考量\n6. 技术选型对比\n\n使用中文回复，架构图用 Mermaid。', category: '编程', author: 'AI Assistant', installs: 1430,
  },
  {
    name: 'copywriter', description: '文案撰写：产品文案、广告语、社交媒体内容、邮件营销', triggers: ['文案', '广告', '营销', '产品介绍', '邮件', '推文', '公众号'], body: '你是一位资深文案策划师。撰写文案时：\n\n1. 先了解目标受众和渠道\n2. 用 AIDA 模型（注意-兴趣-欲望-行动）\n3. 简洁有力的标题和号召性用语\n4. 提供多个版本供选择\n5. 注意语气和品牌调性\n\n使用中文回复。', category: '写作', author: 'AI Assistant', installs: 1320,
  },
  {
    name: 'prompt-engineer', description: '提示词工程：优化 Prompt 设计、Few-shot、Chain-of-thought', triggers: ['prompt', '提示词', '提示工程', 'few-shot', 'cot', 'chain'], body: '你是一位提示词工程专家。优化 Prompt 时：\n\n1. 明确角色和输出格式\n2. 提供 Few-shot 示例\n3. 使用 Chain-of-Thought 引导推理\n4. 设置约束和边界\n5. 迭代改进建议\n\n给出优化后的完整 Prompt 模板。', category: '编程', author: 'AI Assistant', installs: 2760,
  },
  {
    name: 'ppt-outline', description: 'PPT 大纲生成：结构化演示文稿大纲、演讲备注', triggers: ['PPT', '演示', '幻灯片', '演讲', '汇报', '提案'], body: '你是一位演示文稿专家。生成大纲时：\n\n1. ## 标题页\n2. ## 目录\n3. ## 背景/问题（Why）\n4. ## 解决方案（What）\n5. ## 实施计划（How）\n6. ## 数据/案例支撑\n7. ## 总结与下一步\n\n每页标注要点和演讲备注。', category: '办公', author: 'AI Assistant', installs: 980,
  },
];

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<Skill[]>([]);
  const marketSkills = ref(MARKET_SKILLS);
  const loading = ref(false);
  const category = ref('全部');
  const search = ref('');

  const on = () => !!useAuthStore().isLoggedIn;

  const filteredMarket = computed(() => {
    let list = marketSkills.value;
    if (category.value !== '全部') list = list.filter((s) => s.category === category.value);
    if (search.value) {
      const q = search.value.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    return list;
  });

  const formatInstalls = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k+` : `${n}`;

  async function loadSkills() {
    loading.value = true;
    try {
      if (on()) {
        const r = await api.get<any[]>('/skills');
        if ('data' in r) {
          skills.value = (r.data as any[]).map(rowToSkill);
        }
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>('SELECT * FROM skill ORDER BY created_at DESC');
        skills.value = rows.map(rowToSkill);
      }
    } finally {
      loading.value = false;
    }
  }

  async function install(name: string): Promise<string> {
    const item = marketSkills.value.find((s) => s.name === name);
    if (!item) throw new Error('Skill 不存在');
    if (skills.value.some((s) => s.name === name)) throw new Error('已安装');

    if (on()) {
      const r = await api.post<any>('/skills', {
        name: item.name, description: item.description, triggers: item.triggers,
        body: item.body, category: item.category, author: item.author,
      });
      if ('data' in r) {
        skills.value.unshift(rowToSkill(r.data));
        return (r.data as any).id;
      }
      throw new Error('安装失败');
    }

    const adapter = getPlatformAdapter();
    const id = uid('sk_');
    const fm: SkillFrontmatter = { name: item.name, description: item.description, triggers: item.triggers };
    await adapter.db.exec(
      'INSERT INTO skill (id, name, description, source, frontmatter_json, body_md, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, item.name, item.description, 'market', JSON.stringify(fm), item.body, 1, Date.now()],
    );
    await loadSkills();
    return id;
  }

  async function createCustom(name: string, description: string, bodyMd: string, triggers: string[] = []): Promise<string> {
    if (on()) {
      const r = await api.post<any>('/skills', { name, description, triggers, body: bodyMd, category: '自定义' });
      if ('data' in r) {
        skills.value.unshift(rowToSkill(r.data));
        return (r.data as any).id;
      }
      throw new Error('创建失败');
    }

    const adapter = getPlatformAdapter();
    const id = uid('sk_');
    const fm: SkillFrontmatter = { name, description, triggers };
    await adapter.db.exec(
      'INSERT INTO skill (id, name, description, source, frontmatter_json, body_md, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, description, 'local', JSON.stringify(fm), bodyMd, 1, Date.now()],
    );
    await loadSkills();
    return id;
  }

  async function updateSkill(id: string, patch: { description?: string; bodyMd?: string; triggers?: string[] }) {
    if (on()) {
      const body: any = {};
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.bodyMd !== undefined) body.body = patch.bodyMd;
      if (patch.triggers !== undefined) body.triggers = patch.triggers;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/skills/${id}`, body);
    } else {
      const adapter = getPlatformAdapter();
      const s = skills.value.find((x) => x.id === id);
      if (!s) return;
      const newFm = { ...s.frontmatter };
      if (patch.description !== undefined) newFm.description = patch.description;
      if (patch.triggers !== undefined) newFm.triggers = patch.triggers;
      const sets = ['frontmatter_json = ?'];
      const params: unknown[] = [JSON.stringify(newFm)];
      if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
      if (patch.bodyMd !== undefined) { sets.push('body_md = ?'); params.push(patch.bodyMd); }
      params.push(id);
      await adapter.db.exec(`UPDATE skill SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    await loadSkills();
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    if (on()) {
      await api.patch(`/skills/${id}`, { enabled });
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE skill SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    }
    await loadSkills();
  }

  async function uninstall(id: string) {
    if (on()) {
      await api.delete(`/skills/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM skill WHERE id = ?', [id]);
    }
    await loadSkills();
  }

  async function importFromMd(md: string): Promise<string> {
    const parsed = parseSkillMd(md);
    return createCustom(parsed.frontmatter.name, parsed.frontmatter.description || '', parsed.body, parsed.frontmatter.triggers || []);
  }

  function exportToMd(skill: Skill): string {
    const fm = skill.frontmatter;
    const fmLines = ['---', `name: ${fm.name}`];
    if (fm.description) fmLines.push(`description: ${fm.description}`);
    if (fm.triggers?.length) fmLines.push(`triggers:\n${fm.triggers.map((t) => `  - ${t}`).join('\n')}`);
    if (fm.tools?.length) fmLines.push(`tools:\n${fm.tools.map((t) => `  - ${t}`).join('\n')}`);
    fmLines.push('---', '');
    return fmLines.join('\n') + skill.bodyMd;
  }

  return {
    skills, marketSkills, loading, category, search, filteredMarket, formatInstalls,
    loadSkills, install, createCustom, updateSkill, toggleEnabled, uninstall,
    importFromMd, exportToMd,
  };
});

function rowToSkill(r: any): Skill {
  if (r.body_md !== undefined) {
    return {
      id: r.id, name: r.name, description: r.description,
      source: r.source, enabled: !!r.enabled,
      frontmatter: r.frontmatter_json ? JSON.parse(r.frontmatter_json) : { name: r.name },
      bodyMd: r.body_md,
    };
  }
  return {
    id: r.id, name: r.name,
    description: r.description || '',
    source: 'local',
    frontmatter: {
      name: r.name, description: r.description,
      triggers: r.triggers_json ? JSON.parse(r.triggers_json) : [],
    },
    bodyMd: r.body || '',
    enabled: !!r.enabled,
    category: r.category,
    author: r.author,
    installs: r.installs,
  };
}

function parseSkillMd(md: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) return { frontmatter: { name: 'imported' }, body: md };
  const fm: SkillFrontmatter = { name: 'imported' };
  const lines = frontmatterMatch[1].split('\n');
  let currentKey = '';
  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):\s*(.*)/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      if (currentKey === 'triggers' || currentKey === 'tools') {
        (fm as any)[currentKey] = [];
      } else {
        (fm as any)[currentKey] = keyMatch[2].trim();
      }
    } else if (currentKey === 'triggers' || currentKey === 'tools') {
      const itemMatch = line.match(/^\s+-\s+(.*)/);
      if (itemMatch) (fm as any)[currentKey].push(itemMatch[1].trim());
    }
  }
  const body = md.slice(frontmatterMatch[0].length).trim();
  return { frontmatter: fm, body };
}
