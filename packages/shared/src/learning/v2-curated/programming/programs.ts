import type { ProgrammingCourseSeed, ProgrammingStepSeed } from './shared.js';
import { PROGRAMMING_JAVA_ADVANCED_STAGE_OUTLINES } from './java-advanced.js';
import {
  DETAILED_PROGRAMMING_COURSE_CATALOG,
  type DetailedProgrammingCourse,
  type DetailedProgrammingStage,
} from './language-catalogs.js';

export type ProgrammingCourseStatus = 'ready' | 'outline';

export type ProgrammingLessonOutline = {
  readonly id: string;
  readonly title: string;
  readonly courseName: string;
  readonly minutes: number;
  readonly status: 'ready' | 'planned';
};

export type ProgrammingStageOutline = {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly minutes: number;
  readonly lessons: readonly ProgrammingLessonOutline[];
};

export type ProgrammingCoursePackage = {
  readonly id: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly category: 'foundation' | 'frontend' | 'backend' | 'systems' | 'middleware' | 'ai' | 'engineering';
  readonly summary: string;
  readonly prerequisite: string;
  readonly targetRole: string;
  readonly runtime: string;
  readonly toolchain: string;
  readonly frameworks: string;
  readonly sourceAnchors: readonly string[];
  readonly capstone: string;
  readonly totalLessons: number;
  readonly readyLessons: number;
  readonly status: ProgrammingCourseStatus;
  readonly stages: readonly ProgrammingStageOutline[];
};

export type ProgrammingCurriculumCourseRef = {
  readonly courseId: string;
  readonly note: string;
};

export type ProgrammingCurriculumPhase = {
  readonly id: string;
  readonly step: number;
  readonly title: string;
  readonly description: string;
  readonly outcome: string;
  readonly courses: readonly ProgrammingCurriculumCourseRef[];
};

function javaReadyStage(
  id: string,
  title: string,
  goal: string,
  lessons: readonly (readonly [string, number])[],
): ProgrammingStageOutline {
  return {
    id,
    title,
    goal,
    minutes: lessons.reduce((sum, [, minutes]) => sum + minutes, 0),
    lessons: lessons.map(([courseName, minutes], index) => ({
      id: `${id.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
      title: courseName,
      courseName,
      minutes,
      status: 'ready',
    })),
  };
}

const CATEGORY_LESSON_KINDS: Record<ProgrammingCoursePackage['category'], readonly string[]> = {
  foundation: ['工具链与第一个程序', '数据、网络与模型', '数据库、事务与测试', '部署与工程交付'],
  frontend: ['工具链与最小页面', '组件、状态与机制', '构建、源码与性能', '安全、测试与部署'],
  backend: ['环境与最小服务', '核心机制与源码', '数据库与中间件', '企业交付与运维'],
  systems: ['工具链与第一个程序', '内存、ABI 与运行时', '系统接口与调试', '性能、安全与交付'],
  middleware: ['运行拓扑与最小样例', '存储、网络与源码', '故障、背压与容量', '监控、恢复与运行手册'],
  ai: ['心智模型与规格', '上下文与工具调用', 'Agent、权限与沙箱', '评测、交付与复盘'],
  engineering: ['质量属性与模块边界', '分布式与数据一致性', '平台、发布与可观测性', '项目、风险与架构 ADR'],
};

function generatedStage(
  courseTitle: string,
  category: ProgrammingCoursePackage['category'],
  id: string,
  title: string,
  goal: string,
): ProgrammingStageOutline {
  const lessons = CATEGORY_LESSON_KINDS[category].map((kind, index) => {
    const lessonTitle = `${courseTitle} · ${title}：${kind}`;
    return {
      id: `${id.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
      title: lessonTitle,
      courseName: lessonTitle,
      minutes: 34 + index * 4,
      status: 'ready' as const,
    };
  });
  return {
    id,
    title,
    goal,
    minutes: lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    lessons,
  };
}

function detailedStage(
  shortTitle: string,
  profile: DetailedProgrammingCourse,
  stage: DetailedProgrammingStage,
): ProgrammingStageOutline {
  const lessons = stage.lessons.map((topic, index) => ({
    id: `${stage.id.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
    title: topic,
    courseName: `${shortTitle} · ${stage.title}：${topic}`,
    minutes: 36 + index * 3,
    status: 'ready' as const,
  }));
  return {
    id: stage.id,
    title: stage.title,
    goal: `${stage.goal} ${stage.lab}`,
    minutes: lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    lessons,
  };
}

function profileMetadata(profile: DetailedProgrammingCourse | undefined): Pick<
  ProgrammingCoursePackage,
  'runtime' | 'toolchain' | 'frameworks' | 'sourceAnchors' | 'capstone'
> {
  return {
    runtime: profile?.runtime || '语言官方运行时与目标操作系统',
    toolchain: profile?.toolchain || '官方工具链、调试器、测试框架与构建工具',
    frameworks: profile?.frameworks || '语言标准库与该方向主流框架',
    sourceAnchors: profile?.sourceAnchors || ['语言规范、官方文档与固定版本源码'],
    capstone: profile?.capstone || '完成可运行、可测试、可部署和可回滚的企业项目。',
  };
}

const JAVA_STAGES: readonly ProgrammingStageOutline[] = [
  javaReadyStage('J0', '零基础环境与第一行代码', '从安装 JDK 到能编译、运行、调试和测试 Java 程序。', [
    ['Java 零基础：JDK、IDE 与第一个程序', 34],
    ['javac、class 与 java：程序如何运行', 36],
    ['变量、基本类型与类型转换', 38],
    ['运算符、分支与循环', 36],
    ['方法、参数、返回值与调用栈', 36],
    ['数组、字符串与命令行输入', 40],
    ['包、目录、Maven/Gradle 与项目骨架', 42],
    ['调试器、异常信息与第一个测试', 42],
  ]),
  javaReadyStage('J1', 'Java 语言核心与面向对象', '从类与对象进入封装、组合、接口、异常、泛型、集合、Stream 和基础项目。', [
    ['类、对象、字段与方法', 40],
    ['构造器、this 与对象初始化', 38],
    ['封装、访问控制与不变量', 38],
    ['继承、组合与多态', 42],
    ['接口、抽象类与依赖倒置', 40],
    ['枚举、Record 与 sealed 类型', 40],
    ['异常体系、错误传播与资源关闭', 42],
    ['泛型、类型擦除与通配符', 42],
    ['List、Map 与 Set 的选型', 42],
    ['Lambda、函数式接口与 Stream', 44],
    ['日期时间、Optional 与不可变数据', 40],
    ['文件、NIO 与结构化输入输出', 44],
    ['JUnit、断言与测试边界', 42],
    ['Java 基础项目：订单领域模型与 CLI 工具', 58],
  ]),
  ...PROGRAMMING_JAVA_ADVANCED_STAGE_OUTLINES,
];

function outlinePackage(
  id: string,
  title: string,
  shortTitle: string,
  category: ProgrammingCoursePackage['category'],
  summary: string,
  prerequisite: string,
  targetRole: string,
  stages: readonly (readonly [string, string, number])[],
): ProgrammingCoursePackage {
  const profile = DETAILED_PROGRAMMING_COURSE_CATALOG[id];
  const normalized = profile
    ? profile.stages.map((item) => detailedStage(shortTitle, profile, item))
    : stages.map(([stageTitle, goal], index) =>
        generatedStage(title, category, `S${index + 1}`, stageTitle, goal),
      );
  const totalLessons = normalized.reduce((sum, stage) => sum + stage.lessons.length, 0);
  return {
    id,
    title,
    shortTitle,
    category,
    summary,
    prerequisite,
    targetRole,
    ...profileMetadata(profile),
    totalLessons,
    readyLessons: totalLessons,
    status: 'ready',
    stages: normalized,
  };
}

const PROGRAMMING_COURSE_PACKAGE_LIBRARY: readonly ProgrammingCoursePackage[] = [
  {
    id: 'java-enterprise',
    title: 'Java 企业级后端：从零基础到 JVM 与 Spring 源码',
    shortTitle: 'Java 企业级后端',
    category: 'backend',
    summary: '从 JDK 安装、语言核心、OOP、集合与并发，到 JVM、JDK 演进、Spring 家族源码、Kafka、多数据源和企业交付。',
    prerequisite: '无。课程从安装 JDK 和第一行代码开始。',
    targetRole: 'Java 后端工程师 / JVM 平台工程师',
    runtime: 'JDK 8 到当前 LTS、HotSpot JVM、Linux/Windows 服务与 Kubernetes',
    toolchain: 'IntelliJ IDEA、Maven/Gradle Wrapper、JUnit、Testcontainers、JFR、VisualVM',
    frameworks: 'Spring Framework、Spring Boot、Security、Data、Cloud、Spring AI、MyBatis、Netty',
    sourceAnchors: [
      'OpenJDK src/java.base/java/util/ArrayList.java',
      'OpenJDK src/java.base/java/util/concurrent/ThreadPoolExecutor.java',
      'Spring Framework AbstractApplicationContext#refresh',
      'Spring Boot SpringApplication#run and AutoConfigurationImportSelector',
      'Kafka UnifiedLog, ReplicaManager, ConsumerCoordinator',
    ],
    capstone: '完成带多数据源、Kafka、Redis、SSE/WebFlux、鉴权、可观测性、K8s 发布和回滚的 Java 企业系统。',
    totalLessons: 110,
    readyLessons: 110,
    status: 'ready',
    stages: JAVA_STAGES,
  },
  outlinePackage('programming-foundations', '编程通识与计算机基础', '编程通识', 'foundation',
    '程序、数据、操作系统、网络、数据库、Git、测试、容器与交付的公共基础。', '无', '所有技术方向', [
      ['计算机与工具链', '终端、Git、进程和版本控制。', 8],
      ['数据结构与算法', '复杂度、容器、树、图和真实基准。', 10],
      ['系统与网络', '进程线程、内存、IO、TCP/TLS 和 HTTP。', 10],
      ['数据库与事务', 'SQL、索引、隔离、迁移和恢复。', 10],
      ['质量与安全', '测试、调试、威胁模型和门禁。', 8],
      ['容器与运维', 'Docker、CI/CD、可观测性和运行手册。', 10],
    ]),
  outlinePackage('html5', 'HTML5：从零到语义化与可访问网页', 'HTML5', 'frontend',
    '从文档结构、表单和媒体到可访问性、SEO 和页面性能。', '无', 'Web 前端工程师', [
      ['文档与语义', '浏览器、文档结构和语义元素。', 8],
      ['表单与媒体', '表单、验证、图片、音视频。', 8],
      ['可访问性与 SEO', '键盘、ARIA、阅读顺序和搜索。', 8],
      ['企业页面项目', '从零实现可访问企业站点。', 6],
    ]),
  outlinePackage('css3', 'CSS3：从布局到设计系统', 'CSS3', 'frontend',
    '从级联、盒模型、Flex/Grid 到响应式、主题和设计 Token。', 'HTML 基础', 'Web 前端工程师', [
      ['级联与盒模型', '规则优先级、尺寸、单位和溢出。', 10],
      ['布局与响应式', 'Flex、Grid、定位和断点。', 12],
      ['视觉系统', '字体、色彩、动效、主题与可访问性。', 10],
      ['设计系统项目', '组件样式、Token 和页面性能。', 8],
    ]),
  outlinePackage('javascript', 'JavaScript：从语言到浏览器工程', 'JavaScript', 'frontend',
    '语言核心、对象原型、事件循环、DOM、模块、测试与前端安全。', 'HTML/CSS 基础', '前端工程师', [
      ['语言核心', '类型、作用域、闭包和函数。', 12],
      ['对象与异步', '原型、this、Promise 和事件循环。', 12],
      ['浏览器工程', 'DOM、Fetch、模块和 Vite。', 12],
      ['工程与项目', '测试、性能、安全和部署。', 10],
    ]),
  outlinePackage('typescript', 'TypeScript：从类型到企业应用', 'TypeScript', 'frontend',
    '类型系统、领域建模、运行时校验、API 契约和迁移。', 'JavaScript 基础', '前端 / 全栈工程师', [
      ['类型基础', '推断、联合、收窄和泛型。', 10],
      ['领域与 API', '领域模型、运行时校验和错误模型。', 10],
      ['企业工程', '库、类型测试、迁移和发布。', 8],
    ]),
  outlinePackage('vue3', 'Vue 3：从零到源码与 SSR', 'Vue 3', 'frontend',
    '组合式 API、Router、Pinia、Nuxt、性能与 Vue 源码。', 'HTML/CSS/JavaScript/TypeScript', 'Vue 前端工程师', [
      ['Vue 起步', '项目、模板、组件和响应式。', 10],
      ['状态与工程', '组合函数、路由、Pinia 和测试。', 10],
      ['SSR 与性能', 'Nuxt、hydration、部署和监控。', 8],
      ['源码', 'reactivity、runtime-core、compiler。', 8],
      ['企业项目', '从零和 Brownfield 交付。', 8],
    ]),
  outlinePackage('react', 'React：从零到 Fiber 与 Next.js', 'React', 'frontend',
    '组件、Hooks、数据缓存、Next.js、Fiber、Scheduler 和企业项目。', 'HTML/CSS/JavaScript/TypeScript', 'React 前端工程师', [
      ['React 起步', 'JSX、组件、状态和表单。', 10],
      ['Hooks 与数据', '副作用、路由、Query 和测试。', 10],
      ['Next.js', 'SSR/RSC、部署和监控。', 8],
      ['源码', 'Fiber、Hooks、Scheduler 和 commit。', 10],
      ['企业项目', '性能、架构和 Brownfield。', 8],
    ]),
  outlinePackage('python-enterprise', 'Python 企业级后端：从零到 CPython 与框架源码', 'Python', 'backend',
    '语言、数据模型、异步、CPython、FastAPI/Django、SQLAlchemy 和部署。', '无', 'Python 后端工程师', [
      ['Python 起步', '环境、语法、数据结构和模块。', 12],
      ['核心与工程', 'OOP、异常、类型、测试和打包。', 12],
      ['异步与运行时', 'asyncio、CPython、GIL 和性能。', 12],
      ['框架与数据', 'FastAPI、Django、SQLAlchemy 和迁移。', 12],
      ['企业交付', '安全、部署、监控和项目。', 10],
    ]),
  outlinePackage('go-cloud', 'Go 云原生后端：从零到 Runtime 与源码', 'Go', 'backend',
    '语言、接口、context、goroutine、调度器、GC、HTTP、Gin、gRPC 和云原生。', '无', 'Go 后端 / 云原生工程师', [
      ['Go 起步', '工具链、类型、控制流和模块。', 10],
      ['核心工程', '接口、错误、context 和测试。', 10],
      ['并发与运行时', 'goroutine、channel、GMP 和 GC。', 12],
      ['服务与源码', 'net/http、Gin、gRPC、pprof。', 12],
      ['企业交付', '镜像、K8s、监控和项目。', 8],
    ]),
  outlinePackage('c-systems', 'C 系统编程：从零到真实项目源码', 'C', 'systems',
    '工具链、指针、内存、ABI、POSIX、syscall、调试和 Redis/Nginx 源码。', '无', '系统 / 基础软件工程师', [
      ['C 起步', '编译器、链接、类型和第一个程序。', 10],
      ['内存与 ABI', '指针、栈堆、未定义行为和 ABI。', 12],
      ['系统接口', 'libc、POSIX、文件、进程和网络。', 12],
      ['调试与安全', 'GDB、strace、sanitizer 和 Valgrind。', 10],
      ['源码与项目', 'Redis/Nginx 和原生服务。', 10],
    ]),
  outlinePackage('cpp-performance', 'C++ 高性能工程：从零到 STL/Asio 源码', 'C++', 'systems',
    'RAII、移动、模板、STL、并发、Asio、CMake、ABI 和性能。', '无', 'C++ / 高性能工程师', [
      ['C++ 起步', '工具链、值语义、类和 RAII。', 12],
      ['现代语言', '移动、异常安全、模板和 STL。', 12],
      ['并发与网络', '线程、原子、Asio 和内存模型。', 12],
      ['构建与诊断', 'CMake、ABI、sanitizer 和 perf。', 10],
      ['源码与项目', 'STL/Asio 和高性能服务。', 10],
    ]),
  outlinePackage('middleware-source', '中间件与源码：Kafka、Redis、RabbitMQ、Nginx、Apollo', '中间件源码', 'middleware',
    '从消息、缓存、配置和代理的正常链路进入存储、网络、复制和故障恢复源码。', '至少一门后端语言基础', '后端 / 平台 / SRE 工程师', [
      ['Kafka', '日志、副本、消费组和事务。', 14],
      ['Redis', '事件循环、数据结构和持久化。', 10],
      ['RabbitMQ 与 Apollo', '路由、确认、配置发布和回滚。', 10],
      ['Nginx 与 HikariCP', '代理、缓冲、连接池和限流。', 10],
      ['项目', '故障演练、容量和恢复。', 8],
    ]),
  outlinePackage('ai-programming', 'AI 编程与氛围编程', 'AI 编程', 'ai',
    '规格、上下文、Agent、工具沙箱、提示注入、测试和交付。', '至少一门完整语言课程', 'AI 辅助工程师', [
      ['心智模型', '模型能力、局限与验证。', 8],
      ['规范与上下文', '规格、上下文工程和补丁审查。', 8],
      ['Agent 安全', '工具、权限、沙箱和提示注入。', 10],
      ['交付实验', '从规格到部署和复盘。', 8],
    ]),
  outlinePackage('software-engineering', '软件工程、架构与项目交付', '软件架构与交付', 'engineering',
    '模块化单体、DDD、分布式、K8s、CI/CD、SRE、项目管理和架构 ADR。', '至少一门完整语言课程', '高级工程师 / 技术负责人', [
      ['架构基础', '质量属性、模块化和 ADR。', 10],
      ['分布式', '一致性、事件、缓存和消息。', 12],
      ['交付平台', 'Docker、K8s、CI/CD 和可观测性。', 12],
      ['项目管理', '风险、容量、发布和复盘。', 10],
    ]),
  outlinePackage('testing-quality', '测试、调试与工程质量：从断言到 CI 门禁', '测试与工程质量', 'engineering',
    '单元、集成、契约、E2E、性能、安全、故障注入、flaky 治理和质量运营。', '完成至少一门语言的基础项目', '开发 / 测试 / 平台工程师', [
      ['测试思维', '行为、风险和断言。', 8],
      ['单元与属性测试', '测试替身和生成式输入。', 10],
      ['集成与契约', '数据库、消息和 API。', 12],
      ['浏览器与无障碍', '组件、E2E、移动和 axe。', 12],
      ['性能与安全', '预算、攻击和故障。', 12],
      ['CI 质量门禁', '稳定性、归因和趋势。', 10],
    ]),
  outlinePackage('security-engineering', '安全工程与供应链：从威胁模型到事故响应', '安全工程', 'engineering',
    '安全设计、身份授权、密码学、秘密、API/云、安全 CI/CD、SBOM、签名和响应。', '完成编程基础和一个全栈项目', '后端 / 平台 / DevSecOps 工程师', [
      ['安全设计', '威胁模型和验收。', 10],
      ['身份与输入', 'OIDC、授权和边界。', 12],
      ['密码与秘密', 'AEAD、KMS 和轮换。', 12],
      ['应用与云', 'API、Web、移动和云。', 12],
      ['供应链', '扫描、SBOM、签名和门禁。', 12],
      ['安全运营', '检测、恢复和复盘。', 10],
    ]),
];

/**
 * 编程科目的唯一推荐学习顺序。
 *
 * 综合训练不在这里重复登记，UI 会把它固定为第 10 步。
 */
export const PROGRAMMING_CURRICULUM_PHASES: readonly ProgrammingCurriculumPhase[] = [
  {
    id: 'programming-foundation',
    step: 1,
    title: '编程通用、计算机与代码原理',
    description: '先理解终端、文件、Git、进程、网络、HTTP、程序运行、简单算法与数据结构、数据库、测试和容器，不急着背框架。',
    outcome: '能从空目录运行、调试并交付一个最小程序，理解代码如何运行，并知道一次请求和一次构建经过哪些系统。',
    courses: [
      { courseId: 'programming-foundations', note: '入口课 · 含简单算法与数据结构' },
    ],
  },
  {
    id: 'frontend-foundation',
    step: 2,
    title: '前端基础',
    description: '严格按 HTML → CSS → JavaScript → TypeScript 学习页面结构、样式、语言语义和类型边界。',
    outcome: '能从空目录完成可访问、响应式、类型化的前端项目，并独立调试浏览器问题。',
    courses: [
      { courseId: 'html5', note: '前端第 1 门' },
      { courseId: 'css3', note: '前端第 2 门' },
      { courseId: 'javascript', note: '前端第 3 门' },
      { courseId: 'typescript', note: '前端第 4 门' },
    ],
  },
  {
    id: 'frontend-frameworks',
    step: 3,
    title: '前端框架与企业工程',
    description: 'Vue 和 React 二选一开始，完成组件、路由、状态、测试、SSR、性能与源码后，再扩展另一套框架。',
    outcome: '能独立构建企业前端模块，读框架源码，定位渲染、状态和性能问题。',
    courses: [
      { courseId: 'vue3', note: '框架分支 A' },
      { courseId: 'react', note: '框架分支 B' },
    ],
  },
  {
    id: 'backend-languages',
    step: 4,
    title: '后端语言、框架与运行时',
    description: '先选 Java、Python 或 Go 作为主语言；C 与 C++ 作为系统和高性能分支，不建议同时起步五门语言。',
    outcome: '能用一门主语言完成 API、数据库、框架集成、构建部署和故障排查，再按方向扩展第二门。',
    courses: [
      { courseId: 'java-enterprise', note: '后端主语言 · Java 系首选' },
      { courseId: 'python-enterprise', note: '后端主语言 · 快速交付' },
      { courseId: 'go-cloud', note: '后端主语言 · 云原生' },
      { courseId: 'c-systems', note: '系统分支 · 主语言后修' },
      { courseId: 'cpp-performance', note: '高性能分支 · 主语言后修' },
    ],
  },
  {
    id: 'data-and-middleware',
    step: 5,
    title: '数据库、中间件与数据一致性',
    description: '数据库基础已在第一阶段与后端课程中反复使用；这一阶段把事务、索引、多数据源带入 Redis、Kafka、RabbitMQ 和代理层。',
    outcome: '能定位缓存、消息、连接池、复制和跨库一致性问题，写出恢复与容量方案。',
    courses: [
      { courseId: 'middleware-source', note: '至少完成一门后端语言后进入' },
    ],
  },
  {
    id: 'quality-and-security',
    step: 6,
    title: '工程质量与安全',
    description: '完成一个真实业务模块后，再系统学习测试、契约、E2E、性能、安全编码、供应链与事故响应。',
    outcome: '能把质量与安全要求变成自动门禁，并留下可复现的缺陷、性能和攻防证据。',
    courses: [
      { courseId: 'testing-quality', note: '先建立质量门禁' },
      { courseId: 'security-engineering', note: '再进入安全工程' },
    ],
  },
  {
    id: 'ai-programming',
    step: 7,
    title: 'AI 编程与协作提效',
    description: '在已经能判断代码正确性之后，再学习规格、上下文、Agent、工具沙箱、提示注入和补丁审查。',
    outcome: '能让 AI 参与需求、实现、测试和交付，同时保留验证、权限和回滚边界。',
    courses: [
      { courseId: 'ai-programming', note: '完成语言与质量课程后进入' },
    ],
  },
  {
    id: 'architecture-and-delivery',
    step: 8,
    title: '架构、交付与运维',
    description: '最后把模块化、DDD、分布式、Docker、Kubernetes、CI/CD、SLO、项目管理和事故复盘串成企业架构能力。',
    outcome: '能完成架构权衡、容量规划、发布回滚和跨团队技术决策，并对结果负责。',
    courses: [
      { courseId: 'software-engineering', note: '课程终点 · 架构与交付' },
    ],
  },
];

const PROGRAMMING_COURSE_ORDER = PROGRAMMING_CURRICULUM_PHASES.flatMap((phase) =>
  phase.courses.map((course) => course.courseId),
);
const PROGRAMMING_COURSE_BY_ID = new Map(
  PROGRAMMING_COURSE_PACKAGE_LIBRARY.map((course) => [course.id, course]),
);

if (PROGRAMMING_COURSE_ORDER.length !== PROGRAMMING_COURSE_PACKAGE_LIBRARY.length) {
  throw new Error('编程课程学习路径与课程包数量不一致');
}

export const PROGRAMMING_COURSE_PACKAGES: readonly ProgrammingCoursePackage[] =
  PROGRAMMING_COURSE_ORDER.map((id) => {
    const course = PROGRAMMING_COURSE_BY_ID.get(id);
    if (!course) throw new Error(`编程学习路径缺少课程包：${id}`);
    return course;
  });

export function getProgrammingCoursePackage(id: string): ProgrammingCoursePackage | undefined {
  return PROGRAMMING_COURSE_PACKAGES.find((course) => course.id === id);
}

export const JAVA_ENTERPRISE_COURSE = PROGRAMMING_COURSE_PACKAGES
  .find((course) => course.id === 'java-enterprise')!;
const COURSE_SOURCES_BY_ID: Record<string, readonly string[]> = {
  'programming-foundations': [
    'MDN Web Docs. https://developer.mozilla.org/',
    'PostgreSQL Documentation. https://www.postgresql.org/docs/',
    'Pro Git. https://git-scm.com/book/en/v2',
  ],
  html5: [
    'WHATWG HTML Living Standard. https://html.spec.whatwg.org/',
    'MDN HTML. https://developer.mozilla.org/en-US/docs/Web/HTML',
    'WAI ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
  ],
  css3: [
    'W3C CSS Standards. https://www.w3.org/TR/CSS/',
    'MDN CSS. https://developer.mozilla.org/en-US/docs/Web/CSS',
    'web.dev Learn CSS. https://web.dev/learn/css',
  ],
  javascript: [
    'ECMAScript Language Specification. https://tc39.es/ecma262/',
    'MDN JavaScript. https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'Web Vitals. https://web.dev/articles/vitals',
  ],
  typescript: [
    'TypeScript Documentation. https://www.typescriptlang.org/docs/',
    'TypeScript Handbook. https://www.typescriptlang.org/docs/handbook/intro.html',
    'ECMAScript Language Specification. https://tc39.es/ecma262/',
  ],
  vue3: [
    'Vue.js Documentation. https://vuejs.org/guide/',
    'Nuxt Documentation. https://nuxt.com/docs',
    'Vite Guide. https://vite.dev/guide/',
  ],
  react: [
    'React Documentation. https://react.dev/reference/react',
    'Next.js Documentation. https://nextjs.org/docs',
    'Vite Guide. https://vite.dev/guide/',
  ],
  'python-enterprise': [
    'Python Documentation. https://docs.python.org/3/',
    'FastAPI Documentation. https://fastapi.tiangolo.com/',
    'Django Documentation. https://docs.djangoproject.com/',
  ],
  'go-cloud': [
    'The Go Programming Language Documentation. https://go.dev/doc/',
    'The Go Language Specification. https://go.dev/ref/spec',
    'Go Diagnostics. https://go.dev/doc/diagnostics',
  ],
  'c-systems': [
    'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/',
    'POSIX Specification. https://pubs.opengroup.org/onlinepubs/9799919799/',
    'GCC Documentation. https://gcc.gnu.org/onlinedocs/',
  ],
  'cpp-performance': [
    'C++ Working Draft. https://eel.is/c++draft/',
    'Clang Documentation. https://clang.llvm.org/docs/',
    'CMake Documentation. https://cmake.org/documentation/',
  ],
  'middleware-source': [
    'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
    'Redis Documentation. https://redis.io/docs/latest/',
    'RabbitMQ Documentation. https://www.rabbitmq.com/docs',
  ],
  'ai-programming': [
    'NIST AI Risk Management Framework. https://www.nist.gov/itl/ai-risk-management-framework',
    'OWASP LLM Top 10. https://owasp.org/www-project-top-10-for-large-language-model-applications/',
    'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
  ],
  'software-engineering': [
    'Kubernetes Documentation. https://kubernetes.io/docs/home/',
    'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
  ],
  'testing-quality': [
    'Google Testing Blog. https://testing.googleblog.com/',
    'Playwright Test Documentation. https://playwright.dev/docs/test-intro',
    'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
  ],
  'security-engineering': [
    'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
    'NIST SSDF. https://csrc.nist.gov/projects/ssdf',
    'SLSA Specification. https://slsa.dev/spec/',
  ],
};

function generatedCourseSteps(
  course: ProgrammingCoursePackage,
  stage: ProgrammingStageOutline,
  lesson: ProgrammingLessonOutline,
): readonly ProgrammingStepSeed[] {
  const profile = DETAILED_PROGRAMMING_COURSE_CATALOG[course.id];
  const detailedStage = profile?.stages.find((item) => item.id === stage.id);
  const sourceAnchor = detailedStage?.sourceAnchor || course.sourceAnchors[0] || '官方文档与固定版本源码';
  const lab = detailedStage?.lab || `围绕“${lesson.title}”完成正常链路、边界输入、失败注入和恢复实验`;
  return [
    [
      '先建立可运行基线',
      `${lesson.title} 属于“${course.shortTitle}”的“${stage.title}”阶段。运行环境是${course.runtime}，使用${course.toolchain}。先在最小项目中固定版本、目录、启动命令、退出码和预期输出，再开始解释“${lesson.title}”的机制。`,
      '环境、版本、命令和输出先固定',
    ],
    [
      `拆解“${lesson.title}”的机制`,
      `写出这个知识点的输入、状态、输出、异常和资源释放路径，并说明它如何接入${course.frameworks}。反例必须能指出：如果跳过边界、配置、权限或生命周期，程序会以什么方式失败。`,
      '机制要能画成状态、数据流或调用链',
    ],
    [
      '用规范、源码与工具取得证据',
      `固定版本后从“${sourceAnchor}”进入，记录仓库或规范、符号、配置和调用关系。再用${course.toolchain}中的调试、日志、测试或性能工具验证实际行为，结论不能只来自记忆或搜索结果。`,
      '版本、符号和运行证据一起保留',
    ],
    [
      `完成“${lesson.title}”实验`,
      `${lab}。实验至少包含正常输入、边界值、失败注入和恢复，并保存命令、输出、日志、测试结果以及一次修复前后的对照。`,
      '成功、失败和恢复都要验证',
    ],
    [
      '接入企业项目与运行边界',
      `把这一步接入${course.targetRole}的项目主线：${course.capstone}。补齐测试、配置、安全、性能、可观测性、部署和回滚，阶段验收是：${stage.goal}`,
      '能开发、部署、排障和回滚才算完成',
    ],
  ];
}

export const PROGRAMMING_OTHER_COURSE_SEEDS: readonly ProgrammingCourseSeed[] =
  PROGRAMMING_COURSE_PACKAGES
    .filter((course) => course.id !== 'java-enterprise')
    .flatMap((course) =>
      course.stages.flatMap((stage) =>
        stage.lessons
          .filter((lesson) => lesson.status === 'ready')
          .map((lesson, lessonIndex) => {
            const detailedStage = DETAILED_PROGRAMMING_COURSE_CATALOG[course.id]
              ?.stages.find((item) => item.id === stage.id);
            return {
              name: lesson.courseName,
              track: 'P14 · 独立语言课程',
              minutes: lesson.minutes,
              prerequisite:
                lessonIndex === 0
                  ? `本课程入口要求：${course.prerequisite}。运行环境为${course.runtime}，先完成版本、工具链和最小项目检查。`
                  : `建议先完成“${stage.title}”中的前一课，并保留环境、命令、失败和验收记录。`,
              goal: `学完后，能围绕“${lesson.title}”解释机制、复现运行结果、验证 ${detailedStage?.sourceAnchor || course.sourceAnchors[0]}，并说明企业项目中的输入、边界、失败和运维责任。`,
              guidedPractice: `${detailedStage?.lab || '完成最小项目、边界输入和失败注入'}，同时用${course.toolchain}记录版本、命令、输出和修复证据。`,
              independentPractice: `为“${lesson.title}”完成独立练习，交付代码或配置、测试记录、失败复盘和部署边界，并接入毕业项目：${course.capstone}`,
              commonErrors: [
                `只记“${lesson.title}”的结论，不说明${course.runtime}下的版本、配置和失败路径。`,
                `把“${course.frameworks}”当成黑盒，没有通过源码、日志、测试或性能证据验证实际行为。`,
              ],
              sourceRefs: [
                ...(COURSE_SOURCES_BY_ID[course.id] || [
                  'MDN Web Docs. https://developer.mozilla.org/',
                  'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
                ]),
                `源码/规范锚点：${detailedStage?.sourceAnchor || course.sourceAnchors[0]}`,
              ],
              steps: generatedCourseSteps(course, stage, lesson),
            };
          }),
      ),
    );
