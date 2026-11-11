export type SoftKnowledgeDomain = {
  title: string;
  chapters: string[];
};

export type SoftOfficialBook = {
  kind: '考试大纲' | '教程' | '试题解析';
  title: string;
  publisher: string;
  isbn: string;
  officialUrl: string;
  note: string;
};

export type SoftKnowledgeProfile = {
  source: string;
  sourceUrl: string;
  coverageNote: string;
  chapterCount: number;
  domains: SoftKnowledgeDomain[];
  books: SoftOfficialBook[];
};

export const SOFT_OFFICIAL_BOOKS_URL = 'https://www.ruankao.org.cn/book/main.html';

const OFFICIAL_BOOK_DETAILS: Record<string, {
  syllabus: { title: string; isbn: string };
  tutorial: { title: string; isbn: string };
  solutions: { title: string; isbn: string };
}> = {
  软件设计师: {
    syllabus: { title: '软件设计师考试大纲', isbn: '9787302495208' },
    tutorial: { title: '软件设计师教程（第5版）', isbn: '9787302491224' },
    solutions: { title: '软件设计师2016至2020年试题分析与解答', isbn: '9787302589624' },
  },
  网络工程师: {
    syllabus: { title: '网络工程师考试大纲', isbn: '9787302668848' },
    tutorial: { title: '网络工程师教程（第6版）', isbn: '9787302669197' },
    solutions: { title: '网络工程师2016至2020年试题分析与解答', isbn: '9787302589273' },
  },
  系统架构设计师: {
    syllabus: { title: '系统架构设计师考试大纲', isbn: '9787302620037' },
    tutorial: { title: '系统架构设计师教程（第2版）', isbn: '9787302619925' },
    solutions: { title: '系统架构设计师2016至2020年试题分析与解答', isbn: '9787302589631' },
  },
  系统分析师: {
    syllabus: { title: '系统分析师考试大纲', isbn: '9787302670650' },
    tutorial: { title: '系统分析师教程（第2版）', isbn: '9787302669166' },
    solutions: { title: '系统分析师2014至2019年试题分析与解答', isbn: '9787302569176' },
  },
};

function officialBooks(specialty: string): SoftOfficialBook[] {
  const details = OFFICIAL_BOOK_DETAILS[specialty];
  if (!details) return [];
  const common = {
    publisher: '清华大学出版社',
    officialUrl: SOFT_OFFICIAL_BOOKS_URL,
    note: '以官方考试用书页公布的最新版次、库存和购买渠道为准。',
  };
  return [
    { kind: '考试大纲', ...details.syllabus, ...common },
    { kind: '教程', ...details.tutorial, ...common },
    { kind: '试题解析', ...details.solutions, ...common },
  ];
}

function knowledgeProfile(domains: SoftKnowledgeDomain[]): SoftKnowledgeProfile {
  return {
    source: '官方考试用书目录与最新版教程公开目录',
    sourceUrl: SOFT_OFFICIAL_BOOKS_URL,
    coverageNote: '知识域与章节依据官方考试大纲和最新版教程公开目录整理；教材正文、例题和完整解析请使用官方最新版教程。',
    chapterCount: domains.reduce((total, domain) => total + domain.chapters.length, 0),
    domains,
    books: [],
  };
}

const SOFTWARE_DESIGNER_KNOWLEDGE = knowledgeProfile([
  {
    title: '计算机系统基础',
    chapters: ['数据表示与校验', '运算器与控制器', '存储系统与 Cache', '总线、接口与 I/O', '可靠性与性能指标'],
  },
  {
    title: '操作系统',
    chapters: ['进程与线程', '处理机调度', '同步互斥与死锁', '分区、分页与虚拟内存', '文件系统', '设备管理'],
  },
  {
    title: '程序设计语言',
    chapters: ['编译与解释', '词法、语法和语义分析', '类型系统', '程序控制结构', '面向对象语言机制', '异常与资源管理'],
  },
  {
    title: '数据结构与算法',
    chapters: ['线性表', '栈与队列', '树与二叉树', '图', '查找与哈希', '排序', '算法设计策略', '时间与空间复杂度'],
  },
  {
    title: '软件工程',
    chapters: ['软件生命周期', '需求获取与分析', '概要设计与详细设计', '编码规范', '软件测试', '维护与演化', '配置管理', '软件项目管理'],
  },
  {
    title: '面向对象与 UML',
    chapters: ['类、对象与关系', '封装继承与多态', '用例图', '类图', '顺序图', '活动图与状态图', '构件图与部署图', 'SOLID 设计原则'],
  },
  {
    title: '数据库系统',
    chapters: ['关系模型', 'SQL 与关系代数', '函数依赖与规范化', '事务与并发控制', '数据库设计', '分布式数据库', '数据仓库与数据挖掘'],
  },
  {
    title: '网络与信息安全',
    chapters: ['OSI 与 TCP/IP', '局域网与广域网', 'TCP、UDP 与应用协议', '网络设备与路由', '密码学基础', '身份认证与访问控制', '常见攻击与防护'],
  },
  {
    title: '软件架构与设计模式',
    chapters: ['分层与 MVC', '创建型模式', '结构型模式', '行为型模式', '中间件', '构件与复用'],
  },
  {
    title: '系统分析与设计',
    chapters: ['可行性分析', '结构化分析', '数据流图与数据字典', '系统总体设计', '详细设计', '界面与交互设计'],
  },
  {
    title: '多媒体与标准化',
    chapters: ['多媒体基础', '图像与音视频编码', '压缩标准', '知识产权', '标准化与软件文档'],
  },
  {
    title: '新技术应用',
    chapters: ['云计算与虚拟化', '大数据处理', '人工智能应用', '物联网', '区块链基础'],
  },
]);

const NETWORK_ENGINEER_KNOWLEDGE = knowledgeProfile([
  {
    title: '计算机网络基础',
    chapters: ['网络体系结构', 'OSI 七层模型', 'TCP/IP 模型', '数据通信基础', '传输介质', '网络性能指标'],
  },
  {
    title: '数据链路与局域网',
    chapters: ['差错控制', '以太网与帧结构', '交换式局域网', 'VLAN', '生成树协议', '链路聚合'],
  },
  {
    title: 'IP 地址与路由',
    chapters: ['IPv4 地址与子网划分', 'CIDR 与路由聚合', '静态路由', 'RIP、OSPF 与 BGP', 'IPv6', '组播基础'],
  },
  {
    title: '传输层与应用层',
    chapters: ['TCP 连接管理', 'TCP 流量与拥塞控制', 'UDP', 'DNS', 'DHCP', 'HTTP 与 HTTPS', 'FTP、SMTP 与 SNMP'],
  },
  {
    title: '广域网与接入网',
    chapters: ['数字数据网', '帧中继', 'MPLS', '光纤接入', 'xDSL', '移动通信接入'],
  },
  {
    title: '无线网络',
    chapters: ['无线传播基础', 'IEEE 802.11', '无线安全', '移动 IP', '蜂窝网络', '无线网络规划'],
  },
  {
    title: '网络设备与配置',
    chapters: ['路由器', '交换机', '防火墙', '负载均衡', '网络服务器', '设备配置与排障'],
  },
  {
    title: '网络管理与运维',
    chapters: ['网络管理模型', 'SNMP', '日志与流量分析', '性能监控', '故障定位', '备份与恢复'],
  },
  {
    title: '网络安全',
    chapters: ['安全体系', '加密与认证', '访问控制', 'VPN', '入侵检测与防御', '安全审计'],
  },
  {
    title: '网络规划与设计',
    chapters: ['需求分析', '逻辑网络设计', '物理网络设计', '地址规划', '冗余与高可用', '测试与验收'],
  },
  {
    title: '标准化与新技术',
    chapters: ['网络标准', '软件定义网络', '网络功能虚拟化', '云计算网络', '物联网网络', '法律法规'],
  },
]);

const SYSTEM_ARCHITECT_KNOWLEDGE = knowledgeProfile([
  {
    title: '计算机系统与网络',
    chapters: ['计算机组成', '操作系统', '数据库系统', '计算机网络', '信息安全基础', '系统性能指标'],
  },
  {
    title: '系统架构基础',
    chapters: ['架构定义与作用', '架构视图', '架构与需求', '架构评估', '架构演化', '技术债务'],
  },
  {
    title: '需求工程',
    chapters: ['需求获取', '需求分析', '需求规格说明', '需求验证', '需求变更管理', '业务规则'],
  },
  {
    title: '系统分析',
    chapters: ['结构化分析', '面向对象分析', '领域建模', '数据建模', '用例模型', '系统边界'],
  },
  {
    title: '架构风格',
    chapters: ['分层架构', '客户机/服务器', '管道与过滤器', '事件驱动', '微内核', '面向服务', '微服务'],
  },
  {
    title: '质量属性',
    chapters: ['性能', '可用性', '可靠性', '安全性', '可修改性', '可测试性', '易用性'],
  },
  {
    title: '设计模式与复用',
    chapters: ['设计原则', '创建型模式', '结构型模式', '行为型模式', '框架与构件', '产品线'],
  },
  {
    title: '分布式系统架构',
    chapters: ['服务拆分', '服务发现', 'API 网关', '消息队列', '分布式事务', '缓存', '一致性'],
  },
  {
    title: '数据架构',
    chapters: ['数据模型', '数据集成', '数据仓库', '数据湖', '主数据管理', '数据治理'],
  },
  {
    title: '安全与可靠性架构',
    chapters: ['身份与权限', '数据安全', '容灾备份', '故障隔离', '限流降级', '可观测性'],
  },
  {
    title: '项目与架构治理',
    chapters: ['架构决策', '技术评审', '配置管理', '风险管理', '成本估算', '团队协作'],
  },
  {
    title: '新技术与标准',
    chapters: ['云原生', '容器与编排', 'Serverless', '大数据', '人工智能平台', '标准化与法规'],
  },
]);

const SYSTEM_ANALYST_KNOWLEDGE = knowledgeProfile([
  {
    title: '信息系统基础',
    chapters: ['信息系统概念', '系统类型', '系统生命周期', '组织结构与业务流程', '信息系统规划'],
  },
  {
    title: '计算机与网络基础',
    chapters: ['计算机组成', '操作系统', '数据库基础', '网络与通信', '信息安全', '多媒体基础'],
  },
  {
    title: '需求工程',
    chapters: ['需求获取方法', '利益相关者分析', '需求分类', '需求规格说明', '需求验证', '需求追踪与变更'],
  },
  {
    title: '结构化分析',
    chapters: ['数据流图', '数据字典', '加工说明', '实体关系图', '状态转换图', '结构化建模'],
  },
  {
    title: '面向对象分析',
    chapters: ['用例建模', '类与对象建模', '顺序图', '活动图', '状态图', '领域模型'],
  },
  {
    title: '系统设计',
    chapters: ['总体设计', '模块设计', '数据库设计', '接口设计', '界面设计', '安全设计'],
  },
  {
    title: '数据资源管理',
    chapters: ['数据规划', '数据标准化', '数据质量管理', '数据仓库', '数据挖掘', '数据治理'],
  },
  {
    title: '项目管理',
    chapters: ['范围管理', '进度管理', '成本管理', '质量管理', '风险管理', '沟通与干系人管理'],
  },
  {
    title: '经济与可行性分析',
    chapters: ['成本收益分析', '投资回收期', '净现值', '技术可行性', '经济可行性', '运行与法律可行性'],
  },
  {
    title: '企业架构与系统规划',
    chapters: ['业务架构', '应用架构', '数据架构', '技术架构', '架构治理', '信息化规划'],
  },
  {
    title: '安全与合规',
    chapters: ['安全需求', '访问控制', '隐私保护', '业务连续性', '合规审计', '知识产权'],
  },
  {
    title: '新技术应用',
    chapters: ['云计算', '大数据', '人工智能', '物联网', '区块链', '数字化转型'],
  },
]);

const PROFILES: Record<string, SoftKnowledgeProfile> = {
  软件设计师: SOFTWARE_DESIGNER_KNOWLEDGE,
  网络工程师: NETWORK_ENGINEER_KNOWLEDGE,
  系统架构设计师: SYSTEM_ARCHITECT_KNOWLEDGE,
  系统分析师: SYSTEM_ANALYST_KNOWLEDGE,
};

export function getSoftKnowledgeProfile(specialty: string): SoftKnowledgeProfile | null {
  const profile = PROFILES[specialty];
  if (!profile) return null;
  return {
    ...profile,
    domains: profile.domains.map((domain) => ({ ...domain, chapters: [...domain.chapters] })),
    books: officialBooks(specialty),
  };
}
