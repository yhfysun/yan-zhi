import type { ProgrammingCourseSeed, ProgrammingStepSeed } from './shared.js';

export type ProgrammingProjectKind =
  | 'frontend'
  | 'fullstack'
  | 'modular-monolith'
  | 'microservices'
  | 'ai-streaming'
  | 'cloud-native'
  | 'systems'
  | 'delivery-platform'
  | 'realtime'
  | 'data'
  | 'security-product'
  | 'developer-tools';

export type ProgrammingProjectLevel = '零基础' | '入门到进阶' | '企业进阶';

export type ProgrammingProjectPhaseMode =
  | '需求'
  | '契约'
  | '数据'
  | '工程'
  | '后端'
  | '前端'
  | '质量'
  | '交付'
  | '运维';

export type ProgrammingProjectPhase = {
  readonly id: string;
  readonly title: string;
  readonly mode: ProgrammingProjectPhaseMode;
  readonly minutes: number;
  readonly goal: string;
  readonly actions: readonly string[];
  readonly outputs: readonly string[];
  readonly checkpoint: string;
  readonly courseName: string;
};

export type ProgrammingProject = {
  readonly id: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly kind: ProgrammingProjectKind;
  readonly kindLabel: string;
  readonly level: ProgrammingProjectLevel;
  readonly duration: string;
  readonly summary: string;
  readonly whyNow: string;
  readonly stack: readonly string[];
  readonly prerequisites: readonly string[];
  readonly outcomes: readonly string[];
  readonly deliverables: readonly string[];
  readonly metrics: readonly string[];
  readonly architecture: string;
  readonly pipeline: readonly string[];
  readonly highlights: readonly string[];
  readonly phases: readonly ProgrammingProjectPhase[];
};

type ProjectBlueprint = Omit<ProgrammingProject, 'phases'> & {
  readonly problem: string;
  readonly actors: readonly string[];
  readonly userFlows: readonly string[];
  readonly mvp: string;
  readonly nonGoals: readonly string[];
  readonly apiFocus: string;
  readonly dataFocus: string;
  readonly implementationFocus: string;
  readonly frontendFocus: string;
  readonly qualityFocus: string;
  readonly deliveryFocus: string;
  readonly opsFocus: string;
  readonly risks: readonly string[];
  readonly sources: readonly string[];
};

const PHASE_META: readonly {
  readonly id: string;
  readonly title: string;
  readonly mode: ProgrammingProjectPhaseMode;
  readonly minutes: number;
}[] = [
  { id: '01', title: '业务理解与用户任务', mode: '需求', minutes: 42 },
  { id: '02', title: '范围、验收与非功能目标', mode: '需求', minutes: 40 },
  { id: '03', title: 'API 契约与前端数据边界', mode: '契约', minutes: 48 },
  { id: '04', title: '数据模型、约束与迁移', mode: '数据', minutes: 48 },
  { id: '05', title: '项目骨架、模块边界与本地环境', mode: '工程', minutes: 50 },
  { id: '06', title: '后端核心链路与异常恢复', mode: '后端', minutes: 56 },
  { id: '07', title: '前端页面、状态与可访问交互', mode: '前端', minutes: 54 },
  { id: '08', title: '联调、测试、安全与性能', mode: '质量', minutes: 56 },
  { id: '09', title: '容器、CI/CD、可观测与发布', mode: '交付', minutes: 54 },
  { id: '10', title: '故障演练、回滚与项目答辩', mode: '运维', minutes: 52 },
];

function phaseActions(project: ProjectBlueprint, index: number): readonly string[] {
  const actions = [
    [
      `访谈或模拟${project.actors.join('、')}，记录目标、阻碍和现有替代方案`,
      `走通${project.userFlows.join('、')}，标出每一步输入、状态和输出`,
      `写出本项目的非目标：${project.nonGoals.join('；')}`,
    ],
    [
      `把 MVP 收敛为：${project.mvp}`,
      '为每个主流程写验收场景、失败场景和非功能指标',
      `先确定不做什么，不把${project.nonGoals.join('、')}混入首版`,
    ],
    [
      `设计${project.apiFocus}`,
      '定义资源、方法、请求、响应、分页、稳定错误码和权限条件',
      '标出幂等写操作、超时、重试、取消和版本演进边界',
    ],
    [
      `建模${project.dataFocus}`,
      '确定主键、唯一约束、外键、空值、状态机和租户隔离',
      '先写查询模式，再设计索引、事务、迁移、回填和回滚',
    ],
    [
      `创建${project.stack.join(' + ')}项目骨架`,
      `把${project.architecture}落实为目录、模块、配置和依赖方向`,
      '用 Docker Compose、锁定文件和 README 让新成员复现本地环境',
    ],
    [
      `实现${project.implementationFocus}`,
      '补齐输入校验、对象级权限、事务、幂等、重试、超时和结构化错误',
      `记录${project.risks.join('；')}的实现边界和失败恢复`,
    ],
    [
      `实现${project.frontendFocus}`,
      '覆盖加载、空、错误、无权限、取消和移动端状态',
      '验证 URL 恢复、键盘操作、焦点管理、触控目标和窄屏布局',
    ],
    [
      `验证${project.qualityFocus}`,
      '补齐契约测试、集成测试、关键 E2E、失败注入和安全回归',
      `对${project.risks.join('；')}做一次可复现实验并保留证据`,
    ],
    [
      `按${project.deliveryFocus}产出固定版本制品`,
      '接入 CI、镜像扫描、秘密管理、健康检查、日志、指标和 Trace',
      '写清发布顺序、数据库迁移、冒烟检查、灰度、备份和回滚',
    ],
    [
      `完成${project.opsFocus}`,
      '制造依赖故障、慢请求、容量上升或错误配置，观察告警和恢复',
      '形成 ADR、运行手册、项目答辩和下一阶段演进清单',
    ],
  ] as const;
  return actions[index] || actions[0];
}

function phaseOutputs(project: ProjectBlueprint, index: number): readonly string[] {
  const outputs = [
    ['用户任务卡', '主流程和异常流程图', '非目标清单'],
    ['MVP 范围表', '验收场景', '性能、安全和可用性指标'],
    ['API 契约', '错误模型', '前端数据请求矩阵'],
    ['ER 图和关系约束', '索引与查询计划', '迁移、回填和回滚脚本'],
    ['可运行工程骨架', '模块依赖图', '本地环境复现说明'],
    ['后端接口与领域测试', '权限和幂等记录', '失败恢复日志'],
    ['可访问前端页面', '加载与错误状态', '移动端交互记录'],
    ['契约和集成测试', '安全与性能报告', '缺陷修复对照'],
    ['镜像和发布流水线', '仪表盘与告警', '发布与回滚清单'],
    ['故障演练报告', '架构 ADR 和运行手册', '项目答辩材料'],
  ] as const;
  return outputs[index] || outputs[0];
}

function phaseCheckpoint(project: ProjectBlueprint, index: number): string {
  return [
    `能不看代码复述${project.shortTitle}的用户、问题、主流程和非目标。`,
    '每条验收标准都能被执行或观察，并且首版边界没有偷偷扩大。',
    '调用方只看契约就能完成前后端并行开发，错误和重试行为一致。',
    '数据库能主动拒绝非法状态，迁移在旧数据和新代码并存时可执行。',
    '删除脚手架后仍能解释每个目录、启动命令、依赖和配置来源。',
    '正常、重复、超时、越权和依赖失败链路都有测试或实验证据。',
    '键盘、屏幕阅读器、320px 手机和慢网络下都能完成主任务。',
    '关键风险已用失败注入验证，修复后功能和性能回归通过。',
    '另一名工程师能按文档从提交发布到测试环境并完成回滚。',
    '能在限定时间内定位一次故障、恢复服务并说明后续架构取舍。',
  ][index] || '本项目阶段成果可运行、可验证、可回滚。';
}

function hydrateProject(project: ProjectBlueprint): ProgrammingProject {
  const phases = PHASE_META.map((phase, index) => ({
    ...phase,
    goal: [
      `从${project.actors.join('、')}的真实任务出发，先把问题、边界和证据写清。`,
      '把模糊需求收敛成可以验收的 MVP，并先确定非功能目标。',
      '先定义稳定接口，让前端、后端、测试和运维围绕同一契约工作。',
      '用数据和事务表达业务不变量，避免接口正确但数据失控。',
      '从空目录建立可复现工程，不让脚手架代替结构理解。',
      '完成可运行的后端核心流程，并证明失败路径不会造成脏数据。',
      '把业务状态变成清晰、可访问、适配桌面的移动交互。',
      '用测试、安全审查和性能实验证明项目达到可交付质量。',
      '把代码变成不可变制品，并让发布、观察和回滚成为闭环。',
      '在故障和容量压力下验证系统，并沉淀架构判断和运行手册。',
    ][index],
    actions: phaseActions(project, index),
    outputs: phaseOutputs(project, index),
    checkpoint: phaseCheckpoint(project, index),
    courseName: `综合训练 · ${project.shortTitle} · ${phase.title}`,
  }));
  return { ...project, phases };
}

const PROJECT_BLUEPRINTS: readonly ProjectBlueprint[] = [
  {
    id: 'studio-site',
    title: 'Studio 企业官网与作品集：从需求到可访问上线',
    shortTitle: 'Studio 企业官网',
    kind: 'frontend',
    kindLabel: '前端项目',
    level: '零基础',
    duration: '约 8 小时',
    summary: '从零完成一个面向真实客户的企业官网，覆盖信息架构、响应式设计、内容模型、联系表单、SEO、无障碍和静态发布。',
    whyNow: '企业官网仍然是最能检验 HTML、CSS、TypeScript、可访问性和 Web 性能基本功的项目，也是前端作品集最容易展示完整思考的入口。',
    stack: ['HTML5', 'CSS3', 'TypeScript', 'Vite', 'Playwright', 'Lighthouse'],
    prerequisites: ['不要求编程经验', '愿意使用终端、编辑器和浏览器 DevTools'],
    outcomes: ['从客户需求拆出页面与内容模型', '实现桌面和移动端一致的企业站', '完成键盘、截图和性能验收'],
    deliverables: ['可访问官网源码', '内容 JSON 和类型定义', '联系表单 mock 契约', 'Lighthouse 报告和 CDN 发布说明'],
    metrics: ['LCP < 2.5s', 'CLS < 0.1', '320-1440px 无横向溢出', 'axe 关键页面零严重问题'],
    architecture: '静态站点、内容适配器、组件分区、表单 mock service 和 CDN 发布',
    pipeline: ['客户任务', '页面与内容模型', '响应式组件', '可访问与性能', '静态发布'],
    highlights: ['零基础可做', '真实内容而非占位图', '移动导航与表单', 'SEO 与无障碍'],
    problem: '一家小型产品工作室需要让潜在客户快速理解服务、案例和报价方式，并能可靠提交咨询。',
    actors: ['品牌负责人', '潜在客户', '内容编辑', '移动访客'],
    userFlows: ['访客从首页进入案例并提交咨询', '内容编辑更新案例与联系方式', '移动访客用键盘或触屏完成表单'],
    mvp: '首页、服务页、案例页、关于页、联系页和 3 条真实案例内容',
    nonGoals: ['首版不做在线支付', '首版不接真实 CRM', '首版不做复杂动画系统'],
    apiFocus: '内容 JSON schema、联系表单请求与稳定错误结构',
    dataFocus: '页面、案例、服务、表单提交和本地草稿',
    implementationFocus: 'Vite 构建、内容加载、表单校验和错误恢复',
    frontendFocus: '响应式导航、案例筛选、联系表单、SEO 元数据和焦点状态',
    qualityFocus: 'axe、Playwright 断点矩阵、键盘流程和 Lighthouse',
    deliveryFocus: '静态构建、缓存头、Nginx/CDN 和预览环境',
    opsFocus: '资源 404、表单失败、慢网络和回滚静态版本',
    risks: ['移动导航遮挡内容', '表单只靠颜色表达错误', '首屏图片拖慢 LCP'],
    sources: [
      'WHATWG HTML Living Standard. https://html.spec.whatwg.org/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'web.dev Core Web Vitals. https://web.dev/articles/vitals',
    ],
  },
  {
    id: 'pulse-board-ssr',
    title: 'Pulse 实时内容驾驶舱：Next.js、RSC 与流式数据',
    shortTitle: 'Pulse 实时驾驶舱',
    kind: 'fullstack',
    kindLabel: '现代全栈',
    level: '入门到进阶',
    duration: '约 18 小时',
    summary: '用 React/Next.js、TypeScript 和 FastAPI 构建多源内容驾驶舱，实时展示热点、来源健康和事件流，并支持断线恢复。',
    whyNow: '这个项目把 RSC、流式接口、数据可视化和前端可访问性放进同一条真实链路，接近 2026 年内容运营和 AI 产品的常见形态。',
    stack: ['Next.js', 'React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'Redis', 'SSE'],
    prerequisites: ['完成 JavaScript/TypeScript 基础', '了解 HTTP 和数据库查询'],
    outcomes: ['划清 RSC 与客户端状态边界', '实现可恢复的实时事件流', '完成慢消费者和断线测试'],
    deliverables: ['仪表盘前端', 'FastAPI 事件服务', '流式接口契约', '实时链路运行图'],
    metrics: ['首屏 LCP < 2.5s', '流式首事件 < 1s', '断线 3s 内恢复', '慢客户端不拖垮服务'],
    architecture: 'Next.js 前端与 BFF、FastAPI 事件服务、PostgreSQL 资源库、Redis 热度缓存、SSE 通道',
    pipeline: ['运营任务', '事件与来源契约', '查询与缓存', '实时流', '发布与容量'],
    highlights: ['RSC 与客户端边界', 'SSE 断线恢复', '多源热点聚合', '可访问图表'],
    problem: '运营团队需要在一个屏幕里看到热点变化、来源健康、事件证据和最近告警，而不反复刷新多个后台。',
    actors: ['内容运营', '数据分析师', '值班编辑', '系统管理员'],
    userFlows: ['运营查看热点并打开事件证据', '编辑筛选来源并接管告警', '管理员检查采集源健康和积压'],
    mvp: '来源列表、事件时间线、热度卡片、实时流和基础筛选',
    nonGoals: ['首版不做复杂推荐算法', '首版不做全网舆情采集', '首版不做移动原生 App'],
    apiFocus: 'sources、events、alerts、stream 和 cursor 分页契约',
    dataFocus: 'source、event、topic、alert 和 stream cursor',
    implementationFocus: '异步查询、缓存失效、事件去重和 SSE 生命周期',
    frontendFocus: '服务端首屏、客户端筛选、实时插入、图表可访问替代文本',
    qualityFocus: '契约测试、流式中断、慢客户端、权限和首屏性能',
    deliveryFocus: 'Next SSR、FastAPI 多副本、Redis、Postgres 和 Trace',
    opsFocus: '来源中断、Redis 故障、连接泄洪和版本回滚',
    risks: ['客户端缓存泄漏租户数据', 'SSE 慢消费者占用内存', '实时图表只能靠颜色理解'],
    sources: [
      'Next.js App Router Documentation. https://nextjs.org/docs/app',
      'WHATWG Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
      'web.dev Interaction to Next Paint. https://web.dev/articles/inp',
    ],
  },
  {
    id: 'teamflow-saas',
    title: 'TeamFlow 多租户任务协作 SaaS：Vue 3 + Spring Boot',
    shortTitle: 'TeamFlow 协作 SaaS',
    kind: 'fullstack',
    kindLabel: '全栈单体',
    level: '企业进阶',
    duration: '约 24 小时',
    summary: '从零完成多租户工作区、项目、任务、评论、权限和审计，覆盖前后端单体交付、对象级授权和消息最终一致性。',
    whyNow: '这是最接近企业日常需求的全栈单体项目：业务复杂度真实，但不必一开始就付微服务运维成本。',
    stack: ['Vue 3', 'TypeScript', 'Spring Boot', 'Spring Security', 'PostgreSQL', 'Redis', 'RabbitMQ'],
    prerequisites: ['掌握 Java 与 SQL 基础', '完成 Vue/TypeScript 基础', '理解 HTTP 和事务'],
    outcomes: ['实现多租户数据隔离', '建立对象级权限与审计', '完成 Outbox 通知闭环'],
    deliverables: ['SaaS 前端与 API', '租户隔离集成测试', '审计日志页面', 'Outbox 与通知运行图'],
    metrics: ['租户越权测试 100% 拦截', '任务列表 P95 < 300ms', '通知最终送达', '关键写操作可重试'],
    architecture: '模块化 Spring Boot 单体、Vue 3 前端、PostgreSQL、Redis 会话缓存、RabbitMQ 通知',
    pipeline: ['工作区任务', '租户与权限契约', '协作数据模型', '前后端功能', '审计与通知'],
    highlights: ['多租户隔离', '对象级授权', 'Outbox 事件', '审计与操作回放'],
    problem: '成长型团队需要在一个工作区内协作任务、评论和通知，同时保证不同客户的数据、权限和审计完全隔离。',
    actors: ['工作区管理员', '项目负责人', '普通成员', '审计员'],
    userFlows: ['管理员创建工作区并邀请成员', '负责人创建项目并分配任务', '成员完成任务并触发通知'],
    mvp: '登录、工作区、成员邀请、项目、任务、评论、通知和审计列表',
    nonGoals: ['首版不做实时协同编辑', '首版不做插件市场', '首版不拆微服务'],
    apiFocus: 'workspace、member、project、task、comment、notification REST 契约',
    dataFocus: 'tenant_id、成员角色、任务状态、评论、审计和 outbox',
    implementationFocus: 'Spring Security 方法授权、事务、对象归属、Redis 缓存和 Outbox',
    frontendFocus: '工作区切换、任务看板、成员管理、错误与无权限页面',
    qualityFocus: '租户越权、撤销权限、并发更新、契约测试和通知幂等',
    deliveryFocus: '多阶段镜像、迁移、配置外置、Actuator 和 OpenTelemetry',
    opsFocus: 'RabbitMQ 延迟、缓存撤权、数据库复制延迟和旧权限回滚',
    risks: ['只做 URL 授权不做对象授权', '缓存权限后撤权失效', '通知与数据库提交不同步'],
    sources: [
      'Spring Security Reference. https://docs.spring.io/spring-security/reference/',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Vue.js Documentation. https://vuejs.org/guide/',
    ],
  },
  {
    id: 'commerce-modular',
    title: 'Commerce 多模块单体电商：订单、库存与支付一致性',
    shortTitle: 'Commerce 模块化电商',
    kind: 'modular-monolith',
    kindLabel: '多模块单体',
    level: '企业进阶',
    duration: '约 30 小时',
    summary: '用 Java 多模块工程实现商品、库存、订单、支付和通知模块，在一个部署单元内建立清晰模块边界、事务和事件协作。',
    whyNow: '多模块单体是大多数企业系统更现实的架构起点，能训练模块边界、事务约束和事件一致性，而不是先引入分布式复杂度。',
    stack: ['Java 21', 'Spring Boot', 'Gradle Multi-module', 'PostgreSQL', 'Redis', 'Kafka', 'Testcontainers'],
    prerequisites: ['完成 Java 集合、并发和 Spring 基础', '掌握 SQL、索引和事务'],
    outcomes: ['设计模块依赖和聚合边界', '实现幂等下单与库存预占', '用 Outbox 发布可靠领域事件'],
    deliverables: ['多模块电商工程', '订单状态机与幂等测试', '库存并发实验', 'Outbox 与 Kafka 链路'],
    metrics: ['重复请求只生成一单', '库存不超卖', '消息至少一次且可去重', '故障恢复后可对账'],
    architecture: 'Gradle 多模块单体、明确领域模块、共享基础设施最小化、PostgreSQL 事务、Kafka Outbox',
    pipeline: ['购买任务', '订单契约', '库存与支付模型', '模块实现', '一致性验证'],
    highlights: ['多模块依赖边界', '库存乐观锁', '支付幂等', 'Outbox 与对账'],
    problem: '一家成长型零售团队需要稳定处理商品、下单、库存预占、支付回调和售后通知，并保持单体部署的可维护性。',
    actors: ['消费者', '运营人员', '客服', '财务'],
    userFlows: ['消费者选商品并下单支付', '运营调整库存和价格', '客服查询订单状态并处理退款'],
    mvp: '商品浏览、购物车、下单、库存预占、支付模拟和订单查询',
    nonGoals: ['首版不做复杂促销引擎', '首版不拆微服务', '首版不接真实支付通道'],
    apiFocus: 'catalog、cart、order、inventory、payment 命令与查询契约',
    dataFocus: '商品、SKU、库存、订单、支付、Outbox 和审计',
    implementationFocus: '订单状态机、库存乐观锁、幂等键、支付回调和补偿',
    frontendFocus: '商品与购物车、下单反馈、订单详情和后台库存调整',
    qualityFocus: '并发下单、重复支付回调、Outbox 重放、事务回滚和对账',
    deliveryFocus: '多模块构建、迁移、Kafka、Redis、Actuator 和 K8s',
    opsFocus: '库存热点、支付回调积压、Kafka 重复和订单对账恢复',
    risks: ['模块间直接访问内部表', '重复点击创建多单', '库存与订单不在同一事务边界'],
    sources: [
      'Gradle Multi-project Builds. https://docs.gradle.org/current/userguide/multi_project_builds.html',
      'Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html',
      'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
    ],
  },
  {
    id: 'orbit-microservices',
    title: 'Orbit 内容社区微服务：网关、Feed 与通知',
    shortTitle: 'Orbit 内容社区微服务',
    kind: 'microservices',
    kindLabel: '微服务',
    level: '企业进阶',
    duration: '约 36 小时',
    summary: '从模块化边界演进到身份、内容、Feed、搜索和通知服务，使用网关、服务发现、Kafka、Redis 和分布式追踪。',
    whyNow: '微服务不是为了多而多，而是为了独立变化、独立伸缩和故障隔离。本项目先把单体边界做实，再按可观察瓶颈拆分。',
    stack: ['React', 'Spring Cloud Gateway', 'Java', 'Go', 'Kafka', 'Redis', 'PostgreSQL', 'OpenSearch', 'Kubernetes'],
    prerequisites: ['完成一个全栈单体项目', '理解消息、缓存、网关和容器编排'],
    outcomes: ['画出服务边界和故障域', '实现事件契约与消费幂等', '用 Trace 定位跨服务尾延迟'],
    deliverables: ['多服务仓库或工作区', '服务契约与事件目录', '网关和鉴权链路', '故障演练与容量报告'],
    metrics: ['Feed 读取 P95 < 250ms', '事件重复不产生重复通知', '单服务故障可降级', 'Trace 覆盖入口到消息消费'],
    architecture: 'API Gateway/BFF、身份服务、内容服务、Feed 服务、搜索服务、Go 通知 Worker 和事件总线',
    pipeline: ['内容任务', '服务与事件契约', '数据所有权', '多服务开发', '故障与容量'],
    highlights: ['从单体拆分', 'BFF 与网关', 'Kafka 事件所有权', '跨服务 Trace'],
    problem: '社区业务从单体增长到内容发布、个性化 Feed、搜索和通知独立伸缩，需要在不牺牲一致性和可诊断性的前提下演进架构。',
    actors: ['创作者', '读者', '审核员', '平台 SRE'],
    userFlows: ['创作者发布内容并进入 Feed', '读者浏览、搜索和互动', '审核员处理内容并触发通知'],
    mvp: '身份、发布、Feed、搜索、通知和审核最小闭环',
    nonGoals: ['首版不做推荐模型训练', '首版不引入 Service Mesh', '首版不按技术层机械拆服务'],
    apiFocus: 'BFF 聚合契约、内部 gRPC/REST、事件 schema 和版本兼容',
    dataFocus: '每服务独立数据所有权、Outbox、幂等消费和 Feed 索引',
    implementationFocus: '网关鉴权、内容事件、Feed 扇出、搜索同步和通知重试',
    frontendFocus: '发布页、Feed、搜索、审核台和服务降级提示',
    qualityFocus: '契约兼容、消息重复、服务超时、Trace 和混沌演练',
    deliveryFocus: 'Helm、K8s、HPA、NetworkPolicy、服务发现和集中可观测',
    opsFocus: '搜索延迟、通知积压、单服务宕机和跨服务重试风暴',
    risks: ['共享数据库导致伪微服务', '重试放大故障', '事件 schema 无版本导致消费方崩溃'],
    sources: [
      'Spring Cloud Gateway. https://docs.spring.io/spring-cloud-gateway/reference/',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
  },
  {
    id: 'atlas-ai-rag',
    title: 'Atlas AI 知识库与流式助手：RAG、工具和评测',
    shortTitle: 'Atlas AI 知识助手',
    kind: 'ai-streaming',
    kindLabel: 'AI 全栈',
    level: '企业进阶',
    duration: '约 28 小时',
    summary: '实现文档导入、检索、引用、流式回答、工具调用、取消、评测和提示注入防护，形成可审计的企业 AI 应用。',
    whyNow: '企业 AI 项目的难点已经从“调通模型”转向权限、流式体验、引用可信度、评测、成本和提示注入。',
    stack: ['React', 'TypeScript', 'Spring Boot', 'Spring AI', 'PostgreSQL/pgvector', 'Redis', 'SSE', 'OpenTelemetry'],
    prerequisites: ['完成 Spring Boot API 项目', '理解 React 状态和流式 HTTP', '了解向量检索基本概念'],
    outcomes: ['实现有引用的 RAG 流程', '设计可取消的流式回答', '完成提示注入和评测闭环'],
    deliverables: ['知识库管理台', '流式问答接口', '引用与评测面板', '安全与成本运行手册'],
    metrics: ['首 token < 2s', '取消后停止模型和工具资源', '引用可追溯到原文', '注入样本拦截率可测'],
    architecture: 'React 客户端、Spring AI 应用层、文档摄取任务、pgvector 检索、Redis 会话缓存和 SSE',
    pipeline: ['知识任务', 'AI 接口与引用契约', '文档与向量模型', 'RAG 与流式链路', '安全评测与发布'],
    highlights: ['RAG 引用', 'SSE 与取消', 'Tool Calling', '提示注入与评测'],
    problem: '企业团队需要在自己的权限边界内查询文档、获得带引用回答，并能审计模型调用、工具调用和失败原因。',
    actors: ['知识库管理员', '业务用户', '安全审核员', '平台运维'],
    userFlows: ['管理员导入文档并观察索引状态', '用户提问并获得流式引用回答', '审核员检查提示注入、工具和成本'],
    mvp: '文档上传、切分索引、问答、引用、取消和历史会话',
    nonGoals: ['首版不训练基础模型', '首版不做无权限全库检索', '首版不允许模型无审批执行高风险工具'],
    apiFocus: 'documents、collections、chat stream、feedback 和 eval 契约',
    dataFocus: '文档、chunk、embedding、会话、引用、工具审计和评测样本',
    implementationFocus: 'Spring AI Advisor、检索、工具权限、SSE、取消和成本记录',
    frontendFocus: '流式消息、引用抽屉、停止生成、失败重试和权限状态',
    qualityFocus: 'RAG 命中、引用准确、提示注入、工具越权、流式断线和成本',
    deliveryFocus: '模型秘密管理、限流、降级、容器、Trace 和离线评测',
    opsFocus: '模型超时、向量库故障、成本突增、错误引用和紧急停用工具',
    risks: ['把模型输出当可信事实', '知识库越权检索', '流式连接取消后仍消耗 token'],
    sources: [
      'Spring AI Reference. https://docs.spring.io/spring-ai/reference/',
      'OWASP Top 10 for LLM Applications. https://owasp.org/www-project-top-10-for-large-language-model-applications/',
      'OpenTelemetry GenAI Semantic Conventions. https://opentelemetry.io/docs/specs/semconv/gen-ai/',
    ],
  },
  {
    id: 'booking-cloud',
    title: 'Nimbus 预约票务云原生 API：Go、并发与 Kubernetes',
    shortTitle: 'Nimbus 预约票务',
    kind: 'cloud-native',
    kindLabel: '云原生后端',
    level: '企业进阶',
    duration: '约 26 小时',
    summary: '用 Go 构建资源、时段、预约、支付和通知服务，解决并发抢位、幂等、锁、缓存、限流和云原生发布。',
    whyNow: '预约与票务天然包含时间、并发、重复提交和容量问题，是训练 Go API、数据库约束和云原生运维的高密度项目。',
    stack: ['Go', 'Gin/gRPC', 'React', 'PostgreSQL', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'KEDA'],
    prerequisites: ['完成 Go 基础和并发课程', '理解 SQL 约束、索引和事务'],
    outcomes: ['实现并发安全预约', '处理重复支付与取消', '完成容量、限流和弹性伸缩'],
    deliverables: ['预约 API 与后台', '并发与幂等实验', '压测与容量报告', 'K8s 发布和回滚'],
    metrics: ['同一时段库存不超卖', '重复请求只产生一个预约', '高峰 P95 < 500ms', '取消后资源可回收'],
    architecture: 'React 管理端、Go API、PostgreSQL 预约事务、Redis 热点缓存、Kafka 通知和 K8s 部署',
    pipeline: ['预约任务', '库存契约', '并发事务', 'Go API 与后台', '弹性与故障'],
    highlights: ['并发抢位', '数据库约束', '限流与背压', 'KEDA 弹性伸缩'],
    problem: '场馆需要让用户在高峰时段预约有限座位，并可靠处理取消、支付回调和工作人员手动调整。',
    actors: ['预约用户', '场馆运营', '客服', '值班 SRE'],
    userFlows: ['用户选择时段并预约', '运营调整容量和关闭时段', '客服查询重复预约和支付异常'],
    mvp: '场馆、时段、库存、预约、取消、支付回调和运营后台',
    nonGoals: ['首版不做选座图', '首版不接真实支付', '首版不做跨区域多活'],
    apiFocus: 'venues、slots、reservations、payments 和 admin 契约',
    dataFocus: '场馆、时段、库存、预约、支付、取消和审计',
    implementationFocus: '事务边界、唯一约束、乐观锁、幂等键、限流和优雅停机',
    frontendFocus: '时段选择、库存反馈、倒计时、取消和运营容量调整',
    qualityFocus: '并发抢位、重复提交、超时未知结果、资源回收和压测',
    deliveryFocus: 'distroless 镜像、探针、HPA/KEDA、PDB 和滚动发布',
    opsFocus: '热点时段、Redis 故障、消息积压、Pod 驱逐和回滚',
    risks: ['先查库存再更新导致超卖', '客户端重试创建重复预约', '扩容后连接池和数据库先被打满'],
    sources: [
      'The Go Programming Language Documentation. https://go.dev/doc/',
      'PostgreSQL Concurrency Control. https://www.postgresql.org/docs/current/mvcc.html',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
    ],
  },
  {
    id: 'logforge-native',
    title: 'LogForge 高性能日志采集器：C++ Asio + Go 控制面',
    shortTitle: 'LogForge 日志采集器',
    kind: 'systems',
    kindLabel: '系统底层',
    level: '企业进阶',
    duration: '约 32 小时',
    summary: '实现 C++20 高吞吐采集端、Go 控制面、规则配置、批量传输、背压、指标和 React 运维界面。',
    whyNow: '日志采集把 C++ 内存、网络、异步 IO、Go 控制面、协议设计和可观测运维放在同一条线上，适合作为系统方向的高难项目。',
    stack: ['C++20', 'Boost.Asio', 'Go', 'React', 'CMake Presets', 'Protobuf', 'ClickHouse', 'OpenTelemetry'],
    prerequisites: ['完成 C++ RAII、并发和 CMake', '掌握 Go API 和 Linux 基础'],
    outcomes: ['实现有界缓冲与背压', '设计二进制协议和批量传输', '完成内存与吞吐诊断'],
    deliverables: ['C++ Collector', 'Go Control Plane', '运维仪表盘', 'ASan/TSan 与 benchmark 报告'],
    metrics: ['目标吞吐不低于 50MB/s', '队列有界且可观测', '进程崩溃可恢复', '零已知内存安全回归'],
    architecture: 'C++ Asio Collector、Protobuf 批量协议、Go 控制面、ClickHouse 存储和 React 运维台',
    pipeline: ['采集任务', '协议与配置契约', '缓冲与协议模型', '采集与控制面', '性能与故障'],
    highlights: ['Asio 异步 IO', '有界队列与背压', '零拷贝与批量', 'sanitizer 与 benchmark'],
    problem: '平台团队需要从大量主机稳定采集日志，在目标不可用或网络抖动时保持内存有界，并能远程调整规则和观察积压。',
    actors: ['平台工程师', '应用开发者', '值班 SRE', '安全审核员'],
    userFlows: ['主机启动采集器并注册', '工程师下发过滤规则', 'SRE 观察吞吐、丢弃和故障状态'],
    mvp: '文件读取、规则过滤、批量发送、控制面注册和基础指标',
    nonGoals: ['首版不做完整日志检索产品', '首版不做无限离线缓存', '首版不做跨云全局调度'],
    apiFocus: 'Agent protobuf、配置下发、心跳、状态和规则版本契约',
    dataFocus: '文件游标、规则版本、有界队列、批量元数据和采集状态',
    implementationFocus: 'Asio 非阻塞链路、有界缓冲、批量重试、游标持久化和优雅停机',
    frontendFocus: 'Agent 列表、规则编辑、吞吐图表、丢弃原因和危险操作确认',
    qualityFocus: 'ASan/UBSan/TSan、协议兼容、断网、慢磁盘和吞吐基准',
    deliveryFocus: '静态/动态依赖、多阶段镜像、systemd、CMake Presets 和签名制品',
    opsFocus: '内存增长、队列积压、目标故障、游标损坏和版本回滚',
    risks: ['网络变慢导致无界内存增长', '崩溃后重复或漏采日志', '规则更新使旧版本 Agent 无法解析'],
    sources: [
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'C++ Working Draft. https://eel.is/c++draft/',
      'OpenTelemetry Logs Data Model. https://opentelemetry.io/docs/specs/otel/logs/data-model/',
    ],
  },
  {
    id: 'launchpad-devops',
    title: 'LaunchPad 企业发布与故障演练平台：GitOps、K8s 与 SRE',
    shortTitle: 'LaunchPad 发布平台',
    kind: 'delivery-platform',
    kindLabel: '交付平台',
    level: '企业进阶',
    duration: '约 30 小时',
    summary: '构建应用、环境、发布、审批、故障和复盘平台，串起 GitOps、Helm、Argo CD、Prometheus、OpenTelemetry 和回滚。',
    whyNow: '企业真正缺的往往不是会写 Dockerfile，而是可审计、可审批、可观测、可回滚的交付系统。',
    stack: ['React', 'Go', 'Argo CD', 'Kubernetes', 'Helm', 'PostgreSQL', 'Prometheus', 'OpenTelemetry'],
    prerequisites: ['完成 Docker/K8s 基础', '理解 CI/CD、配置和可观测性', '具备一个可部署应用'],
    outcomes: ['设计发布状态机与审批', '实现 GitOps 发布和回滚', '把 SLO 与故障复盘接入平台'],
    deliverables: ['发布控制台', 'GitOps 发布 API', '故障演练剧本', 'SLO 与值班运行手册'],
    metrics: ['发布状态可追踪', '危险操作需审批', '失败发布 5 分钟内回滚', 'SLO 与告警关联到应用'],
    architecture: 'React 控制台、Go 控制面、PostgreSQL、Argo CD/K8s、Helm 制品、Prometheus/OTel 可观测',
    pipeline: ['交付任务', '发布与审批契约', '应用环境模型', '发布控制面', '故障与回滚'],
    highlights: ['GitOps', '审批与权限', '蓝绿/金丝雀', '故障演练与 SLO'],
    problem: '研发团队需要让发布过程可审计、配置可追溯、异常可停止、失败可回滚，并能定期验证故障预案。',
    actors: ['开发者', '发布经理', '审批人', 'SRE'],
    userFlows: ['开发者提交发布并查看差异', '审批人确认配置和影响范围', 'SRE 观察指标并触发回滚'],
    mvp: '应用、环境、发布单、审批、Argo 同步状态和回滚',
    nonGoals: ['首版不做通用低代码流水线', '首版不直接保存集群管理员凭据', '首版不做多云成本优化'],
    apiFocus: 'applications、environments、releases、approvals 和 incidents 契约',
    dataFocus: '应用、环境、发布版本、审批、事故、SLO 和审计',
    implementationFocus: '发布状态机、权限审批、GitOps 对账、回滚和幂等执行',
    frontendFocus: '环境差异、发布进度、审批风险、回滚入口和事故时间线',
    qualityFocus: '越权发布、重复执行、配置错误、失败回滚和审计完整性',
    deliveryFocus: '自身平台发布、Argo CD、Helm、镜像签名和秘密管理',
    opsFocus: '错误配置、集群不可达、回滚失败、告警风暴和复盘',
    risks: ['平台持有过大集群权限', '审批和实际制品不一致', '回滚脚本从未演练'],
    sources: [
      'Argo CD Documentation. https://argo-cd.readthedocs.io/',
      'Google SRE Workbook. https://sre.google/workbook/table-of-contents/',
      'Helm Documentation. https://helm.sh/docs/',
    ],
  },
  {
    id: 'canvas-collab',
    title: 'Canvas 实时协作白板：CRDT、WebSocket 与离线恢复',
    shortTitle: 'Canvas 实时协作',
    kind: 'realtime',
    kindLabel: '实时协作',
    level: '企业进阶',
    duration: '约 32 小时',
    summary: '实现多人光标、图形编辑、评论和离线合并，使用 Yjs/CRDT、WebSocket、Redis 和对象存储处理冲突、重连和权限。',
    whyNow: '实时协作把前端交互、网络状态、冲突合并、持久化和权限放在同一条链路，是训练异步系统边界的高价值项目。',
    stack: ['React', 'TypeScript', 'Yjs', 'WebSocket', 'Go', 'Redis', 'PostgreSQL', 'S3'],
    prerequisites: ['完成一个 React 或 Vue 全栈项目', '理解 WebSocket、状态同步和基本并发'],
    outcomes: ['设计可合并的文档状态', '实现断线重连与离线恢复', '限制协作房间与对象级权限'],
    deliverables: ['白板前端', '协作网关', 'CRDT 快照服务', '冲突与离线恢复报告'],
    metrics: ['双人编辑无数据丢失', '断线 5s 后可恢复', '快照可重建房间', '越权用户无法订阅房间'],
    architecture: 'React 编辑器、Yjs 文档、WebSocket 协作网关、Redis presence、PostgreSQL 元数据、S3 快照',
    pipeline: ['协作任务', '房间与更新契约', '文档与快照模型', '编辑器和网关', '冲突与恢复'],
    highlights: ['CRDT 合并', '多人光标', '离线恢复', '房间权限'],
    problem: '分布式团队需要在同一块白板上实时编辑图形、看到成员光标并保留评论，同时允许短时离线后继续工作。',
    actors: ['团队成员', '访客', '空间管理员', '值班工程师'],
    userFlows: ['成员加入房间并协同编辑', '访客只读浏览和评论', '断线成员重新连接并合并离线更新'],
    mvp: '房间创建、图形编辑、多人光标、评论、快照和只读分享',
    nonGoals: ['首版不做无限画布渲染引擎', '首版不做音视频会议', '首版不实现端到端加密'],
    apiFocus: 'rooms、snapshots、presence、comments 和 WebSocket update 协议',
    dataFocus: '房间、成员权限、Yjs 更新、快照、评论和审计',
    implementationFocus: '更新幂等、广播顺序、presence 过期、快照压缩和离线重放',
    frontendFocus: '画布交互、协作者光标、连接状态、只读模式和键盘操作',
    qualityFocus: '乱序更新、重复消息、断线、慢客户端、越权和快照恢复',
    deliveryFocus: 'WebSocket 网关、Redis、对象存储、灰度发布和连接容量',
    opsFocus: '连接风暴、presence 残留、快照失败和房间热迁移',
    risks: ['只做最后写入获胜导致编辑丢失', '断线重放无限增长', '快照失败后无法重建房间'],
    sources: [
      'Yjs Documentation. https://docs.yjs.dev/',
      'RFC 6455 WebSocket Protocol. https://www.rfc-editor.org/rfc/rfc6455',
      'Redis Pub/Sub Documentation. https://redis.io/docs/latest/develop/interact/pubsub/',
    ],
  },
  {
    id: 'dataflow-lakehouse',
    title: 'DataFlow 数据湖仓平台：采集、建模、血缘与指标',
    shortTitle: 'DataFlow 数据平台',
    kind: 'data',
    kindLabel: '数据平台',
    level: '企业进阶',
    duration: '约 34 小时',
    summary: '构建多源数据采集、质量检查、分层建模、指标服务和血缘界面，覆盖批流一体、权限、成本与数据质量。',
    whyNow: '业务规模上来后，企业需要的不只是 SQL，而是可追溯的数据契约、血缘、质量门禁和成本边界。',
    stack: ['Python', 'FastAPI', 'Dagster', 'dbt', 'DuckDB', 'ClickHouse', 'Kafka', 'React', 'Grafana'],
    prerequisites: ['掌握 SQL、Python 和数据建模基础', '理解批处理、消息和容器'],
    outcomes: ['定义数据契约和质量门禁', '实现分层模型与指标服务', '追踪字段血缘和成本'],
    deliverables: ['数据管道工程', '指标 API', '血缘与质量看板', '成本和演练报告'],
    metrics: ['重复运行结果幂等', '质量问题阻断发布', '指标与明细可对账', '单次批处理成本可核算'],
    architecture: 'Python 采集任务、Kafka 缓冲、对象存储原始层、dbt 模型、ClickHouse 指标层、React 数据目录',
    pipeline: ['数据任务', '数据契约与指标', '分层模型与血缘', '批流管道', '质量与成本'],
    highlights: ['批流一体', '数据契约', '字段血缘', '质量门禁与成本'],
    problem: '业务团队需要汇总多个系统数据，但字段含义、口径、质量和来源经常不一致，无法可靠支撑运营和财务指标。',
    actors: ['数据分析师', '数据工程师', '业务负责人', '数据治理员'],
    userFlows: ['工程师接入数据源并运行管道', '分析师查询指标和字段血缘', '治理员阻断低质量或越权数据发布'],
    mvp: '两个数据源、原始层、清洗层、三个指标、质量检查和血缘列表',
    nonGoals: ['首版不训练机器学习模型', '首版不建设完整 BI 编辑器', '首版不接生产敏感数据'],
    apiFocus: 'sources、pipelines、datasets、metrics、lineage 和 quality 契约',
    dataFocus: '数据源、批次、字段 schema、模型依赖、质量结果、指标和血缘',
    implementationFocus: '批处理幂等、分区、schema 演进、质量检查、回填和对账',
    frontendFocus: '数据目录、指标详情、血缘图、质量状态和成本展示',
    qualityFocus: '重复批次、迟到数据、schema 漂移、口径错误和权限泄露',
    deliveryFocus: '对象存储、ClickHouse、调度器、指标监控和数据发布版本',
    opsFocus: '管道积压、坏数据扩散、回填失败、存储成本和血缘断链',
    risks: ['指标口径散落在 SQL 中', 'schema 变更没有兼容策略', '回填覆盖了正确分区'],
    sources: [
      'Dagster Documentation. https://docs.dagster.io/',
      'dbt Documentation. https://docs.getdbt.com/',
      'ClickHouse Documentation. https://clickhouse.com/docs',
    ],
  },
  {
    id: 'securevault',
    title: 'SecureVault 多租户安全笔记：OIDC、加密与威胁建模',
    shortTitle: 'SecureVault 安全笔记',
    kind: 'security-product',
    kindLabel: '安全产品',
    level: '企业进阶',
    duration: '约 30 小时',
    summary: '实现安全笔记产品，覆盖 OIDC、多租户授权、客户端加密、密钥轮换、审计、威胁模型和攻击回归。',
    whyNow: '安全能力不能只在课程里讲。这个项目把身份、授权、密钥生命周期、日志和攻击测试做成一个可运行产品。',
    stack: ['React', 'TypeScript', 'Go', 'OIDC', 'PostgreSQL', 'Redis', 'WebCrypto', 'KMS', 'OpenTelemetry'],
    prerequisites: ['完成网络安全基础、身份与 Web 风险路线', '具备一个全栈 API 项目'],
    outcomes: ['实现对象级授权和多租户隔离', '设计客户端加密与密钥轮换', '完成威胁模型和攻击回归'],
    deliverables: ['安全笔记应用', '威胁模型', '权限与加密测试', '安全运行手册'],
    metrics: ['跨租户访问 100% 拒绝', '日志无明文笔记和令牌', '密钥轮换可回滚', '高风险攻击样本全部有回归'],
    architecture: 'React WebCrypto 客户端、Go API、OIDC 身份、PostgreSQL 密文、Redis 会话、KMS 密钥和数据审计',
    pipeline: ['安全任务', '身份与数据契约', '租户与密钥模型', '加密 API 与前端', '攻防与运营'],
    highlights: ['OIDC 与对象授权', '客户端加密', '密钥轮换', '威胁模型与回归'],
    problem: '个人和小团队需要保存敏感笔记，同时不希望服务端能随意读取正文，并需要证明租户隔离和审计有效。',
    actors: ['笔记用户', '团队管理员', '安全审核员', '平台运维'],
    userFlows: ['用户通过 OIDC 登录并解锁保险库', '管理员邀请成员和撤销权限', '审核员验证越权、加密与审计证据'],
    mvp: '登录、保险库、加密笔记、分享、撤销、审计和轮换',
    nonGoals: ['首版不实现匿名分享', '首版不做自研密码算法', '首版不保存恢复密码明文'],
    apiFocus: 'vaults、notes、members、keys、audit 和 share 契约',
    dataFocus: '租户、成员、密文、nonce、密钥版本、分享和审计',
    implementationFocus: '服务端授权、客户端加密、nonce 唯一、密钥轮换和审计脱敏',
    frontendFocus: '解锁流程、加密状态、权限管理、分享和敏感操作确认',
    qualityFocus: 'IDOR、CSRF、XSS、nonce 复用、令牌泄露、撤权和密钥轮换',
    deliveryFocus: '秘密管理、TLS、安全头、依赖扫描、SBOM 和审计存储',
    opsFocus: '密钥泄露响应、会话撤销、审计异常和灾难恢复',
    risks: ['服务端日志记录明文正文', '撤权后缓存仍允许访问', '客户端密钥存入不可信位置'],
    sources: [
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'OIDC Core. https://openid.net/specs/openid-connect-core-1_0.html',
      'MDN Web Crypto API. https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API',
    ],
  },
  {
    id: 'devkit-sdk',
    title: 'DevKit 开源 CLI 与 SDK：跨平台发布和供应链',
    shortTitle: 'DevKit 开源工具',
    kind: 'developer-tools',
    kindLabel: '开发者工具',
    level: '企业进阶',
    duration: '约 26 小时',
    summary: '设计并发布跨平台 CLI/SDK，覆盖命令架构、插件、类型契约、测试矩阵、语义版本、SBOM、签名和升级。',
    whyNow: '能写出脚本不等于能发布开发者工具。CLI/SDK 项目会逼你处理稳定契约、兼容性、跨平台、文档和供应链。',
    stack: ['TypeScript', 'Go', 'Node.js', 'pnpm', 'Vitest', 'GitHub Actions', 'Cosign', 'SLSA'],
    prerequisites: ['完成 TypeScript/Go 课程', '理解命令行、包管理和版本发布'],
    outcomes: ['设计稳定命令和 SDK 契约', '建立跨平台测试与发布流水线', '完成签名、SBOM 和弃用迁移'],
    deliverables: ['CLI 和 SDK 包', '插件接口', '跨平台发布流水线', '迁移与安全发布文档'],
    metrics: ['三个平台安装成功', '自动补全和错误提示可用', '破坏性变更需大版本', '制品可验签并追溯源码'],
    architecture: 'TypeScript SDK、Go 高性能 CLI 核心、插件协议、npm/二进制分发、GitHub Actions 和 Cosign',
    pipeline: ['开发者任务', 'CLI 与 SDK 契约', '插件和配置模型', '跨平台实现', '发布与供应链'],
    highlights: ['CLI UX', 'SDK 版本契约', '跨平台制品', 'SLSA 与签名'],
    problem: '团队需要把重复工程任务封装成开发者工具，并保证 Windows、macOS、Linux 用户能够稳定安装、升级和自动补全。',
    actors: ['应用开发者', '工具维护者', '平台工程师', '安全审核员'],
    userFlows: ['开发者安装 CLI 并完成初始化', '维护者发布新版本和迁移说明', '安全审核员验证制品来源和签名'],
    mvp: 'init/check/run 三个命令、SDK 客户端、插件接口和双平台发布',
    nonGoals: ['首版不做图形 IDE', '首版不自动执行远程脚本', '首版不做无限插件权限'],
    apiFocus: 'CLI 命令、退出码、配置 schema、插件协议和 SDK 类型契约',
    dataFocus: '配置版本、缓存、凭据引用、运行状态和迁移记录',
    implementationFocus: '命令解析、退出码、错误提示、插件隔离、跨平台路径和升级',
    frontendFocus: '终端输出、颜色降级、交互确认和 `--json` 自动化输出',
    qualityFocus: '命令兼容、路径差异、退出码、插件越权和供应链验证',
    deliveryFocus: 'npm、二进制归档、SBOM、Cosign 签名、GitHub Actions 和回滚',
    opsFocus: '坏版本撤回、下载源故障、旧版本兼容和 CVE 响应',
    risks: ['在命令中执行不可信远程脚本', '退出码不稳定破坏 CI', '发布制品没有源码来源'],
    sources: [
      'Node.js CLI Documentation. https://nodejs.org/api/cli.html',
      'SLSA Specification. https://slsa.dev/spec/',
      'Sigstore Cosign Documentation. https://docs.sigstore.dev/cosign/overview/',
    ],
  },
];

export const PROGRAMMING_PROJECTS: readonly ProgrammingProject[] =
  PROJECT_BLUEPRINTS.map(hydrateProject);

function projectPhaseSteps(
  project: ProjectBlueprint,
  phase: ProgrammingProjectPhase,
  index: number,
): readonly ProgrammingStepSeed[] {
  const risk = project.risks[index % project.risks.length];
  return [
    [
      `先读懂${phase.title}要解决的问题`,
      `${project.problem} 当前阶段聚焦“${phase.title}”。先记录参与角色、输入、输出、约束和失败代价，再打开编辑器。${phase.goal}`,
      `先写${phase.mode}边界，再写实现`,
    ],
    [
      `完成${phase.title}的设计动作`,
      `${phase.actions.join('。')}。设计结果要能让另一名工程师据此实现或测试，不能只停留在口头判断。`,
      '每个设计结论都要有输入、约束和验收',
    ],
    [
      `在${project.stack.join(' + ')}中落地`,
      `按${project.architecture}实现本阶段。重点检查${project.implementationFocus}，并把配置、命令、依赖和版本固定在项目仓库。`,
      '版本、配置和运行命令必须可复现',
    ],
    [
      `验证${project.shortTitle}的失败边界`,
      `产出${phase.outputs.join('、')}。围绕“${risk}”做失败注入，补齐${project.qualityFocus}中的测试、日志或观测证据，再修复并回归。`,
      '成功路径、失败路径和恢复都要有证据',
    ],
    [
      `形成可交付阶段成果`,
      `${phase.checkpoint} 将成果接入${project.deliveryFocus}和${project.opsFocus}，并记录本阶段对${project.outcomes.join('、')}的贡献。`,
      '阶段代码必须能构建、能验证、能交接',
    ],
  ];
}

export const PROGRAMMING_PROJECT_COURSE_SEEDS: readonly ProgrammingCourseSeed[] =
  PROGRAMMING_PROJECTS.flatMap((project) => {
    const blueprint = PROJECT_BLUEPRINTS.find((item) => item.id === project.id)!;
    return project.phases.map((phase, index) => ({
      name: phase.courseName,
      track: 'P15 · 综合训练项目',
      minutes: phase.minutes,
      prerequisite:
        index === 0
          ? `${project.prerequisites.join('；')}。开始前先确认本项目的角色、主流程和非目标。`
          : `先完成“${project.shortTitle}”的上一阶段，并保留设计、运行、失败和验收证据。`,
      goal: `${phase.goal} 完成后应交付${phase.outputs.join('、')}，并能解释其在${project.shortTitle}中的边界。`,
      guidedPractice: `${phase.actions.join('；')}。所有命令、版本、测试和失败恢复都写入项目文档。`,
      independentPractice: `独立完成${phase.outputs.join('、')}，用可复现实验证明“${phase.checkpoint}”已经满足。`,
      commonErrors: [
        `跳过${phase.mode}阶段直接写代码，导致后续无法验证${project.shortTitle}的边界。`,
        `没有处理“${blueprint.risks[index % blueprint.risks.length]}”，只验证了一次正常流程。`,
      ],
      sourceRefs: [
        ...blueprint.sources,
        `项目契约：${blueprint.apiFocus}`,
        `项目指标：${project.metrics.join('；')}`,
      ],
      steps: projectPhaseSteps(blueprint, phase, index),
    }));
  });
