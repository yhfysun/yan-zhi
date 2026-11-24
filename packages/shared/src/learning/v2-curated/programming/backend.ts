import type { ProgrammingCourseSeed } from './shared.js';

type StepExample = NonNullable<ProgrammingCourseSeed['steps'][number][3]>;

const stepExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): StepExample => ({ title, language, code, output });

const JAVA_DOCS = 'Oracle Java Documentation. https://docs.oracle.com/en/java/';
const JAVA_SPECS = 'Java Language and VM Specifications. https://docs.oracle.com/javase/specs/';
const OPENJDK = 'OpenJDK Documentation. https://openjdk.org/';
const SPRING = 'Spring Framework Documentation. https://docs.spring.io/spring-framework/reference/';
const SPRING_BOOT = 'Spring Boot Documentation. https://docs.spring.io/spring-boot/';
const SPRING_SECURITY = 'Spring Security Reference. https://docs.spring.io/spring-security/reference/';
const SPRING_AI = 'Spring AI Reference. https://docs.spring.io/spring-ai/reference/';
const SPRING_CLOUD = 'Spring Cloud Documentation. https://docs.spring.io/spring-cloud/docs/current/reference/html/';
const SPRING_WEBFLUX = 'Spring WebFlux Reference. https://docs.spring.io/spring-framework/reference/web/webflux.html';
const SPRING_GATEWAY = 'Spring Cloud Gateway. https://docs.spring.io/spring-cloud-gateway/reference/';
const MYBATIS = 'MyBatis Documentation. https://mybatis.org/mybatis-3/';
const NETTY = 'Netty Documentation. https://netty.io/wiki/';
const JEP_INDEX = 'OpenJDK JEP Index. https://openjdk.org/jeps/0';
const SSE_SPEC = 'WHATWG HTML Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html';
const KOTLIN = 'Kotlin Documentation. https://kotlinlang.org/docs/home.html';
const SCALA = 'Scala Documentation. https://docs.scala-lang.org/';
const GROOVY = 'Groovy Documentation. https://groovy-lang.org/documentation.html';
const CLOJURE = 'Clojure Documentation. https://clojure.org/reference/documentation';
const PYTHON = 'Python Documentation. https://docs.python.org/3/';
const PYTHON_PACKAGING = 'Python Packaging User Guide. https://packaging.python.org/';
const FASTAPI = 'FastAPI Documentation. https://fastapi.tiangolo.com/';
const DJANGO = 'Django Documentation. https://docs.djangoproject.com/';
const SQLALCHEMY = 'SQLAlchemy Documentation. https://docs.sqlalchemy.org/';
const UV = 'uv Documentation. https://docs.astral.sh/uv/';
const GO_DOCS = 'The Go Programming Language Documentation. https://go.dev/doc/';
const GO_SPEC = 'The Go Language Specification. https://go.dev/ref/spec';
const GO_MODULES = 'Go Modules Reference. https://go.dev/ref/mod';
const GO_BLOG = 'Go Blog. https://go.dev/blog/';
const GIN = 'Gin Web Framework Documentation. https://gin-gonic.com/docs/';
const GRPC_GO = 'gRPC-Go Documentation. https://grpc.io/docs/languages/go/';

const PROGRAMMING_BACKEND_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Java 集合源码：ArrayList、HashMap 与 ConcurrentHashMap',
    track: 'P06 · Java / JVM / Spring',
    minutes: 48,
    prerequisite: '掌握一种语言的变量、函数和对象，了解基本数据结构。',
    goal: '能解释 Java 值类型、引用、自动装箱、泛型擦除，并从源码说明 ArrayList 扩容与 HashMap 查找、冲突和树化。',
    guidedPractice: '为十万条数据分别选择 ArrayList、LinkedList 和 HashMap，记录插入、查找和内存表现，并对照 JDK 源码。',
    independentPractice: '写一份集合选型报告，包含数据规模、访问模式、复杂度、内存和源码依据。',
    commonErrors: ['只看大 O，不看常数、对象分配和缓存局部性。', '在遍历时直接删除集合元素。'],
    sourceRefs: [JAVA_DOCS, 'OpenJDK source. https://github.com/openjdk/jdk'],
    steps: [
      ['先区分值与对象引用', 'Java 参数传递的是值，对象变量保存引用。自动装箱会创建或复用对象，集合中大量小对象会影响内存和 GC。', '引用语义与对象分配要一起看'],
      ['ArrayList 用连续数组换随机访问', '扩容时需要分配更大数组并复制元素。容量预估可以减少复制，但过大的初始容量会增加内存占用。源码中的增长策略解释了这一权衡。', '随机访问快，插入中间成本高'],
      ['HashMap 用哈希桶定位键', '键的 hashCode 决定桶位置，equals 负责冲突判断。容量、负载因子、链表与红黑树转换共同影响最坏情况。', 'hashCode 与 equals 必须一致'],
      ['遍历与并发修改有契约', '增强 for 使用迭代器，结构性修改可能触发 fail-fast。ConcurrentHashMap 通过桶级并发和复合操作支持特定并发场景，但仍要理解原子性边界。', '先确定访问模式再选集合'],
      ['源码结论落到测量', '用 JMH 或受控基准比较场景，记录分配、吞吐和延迟。单次计时不能证明集合或代码优化有效。', '复杂度给方向，测量给结论'],
    ],
  },
  {
    name: 'Java 泛型、异常、反射与注解',
    track: 'P06 · Java / JVM / Spring',
    minutes: 46,
    prerequisite: '掌握 Java 类、接口、集合和基本异常处理。',
    goal: '能理解泛型擦除、异常层次、反射边界和注解处理，并解释框架为何依赖这些能力。',
    guidedPractice: '写一个泛型 API、自定义受检异常和注解处理器，再通过反射读取运行期元数据。',
    independentPractice: '审查一个滥用反射的模块，给出编译期接口、注册表和反射三种方案的安全与可维护性比较。',
    commonErrors: ['用反射访问私有字段绕过业务约束。', '捕获 Exception 后不保留原因。'],
    sourceRefs: [JAVA_SPECS, JAVA_DOCS],
    steps: [
      ['泛型提供编译期约束', '泛型信息大部分会被擦除，运行时只保留有限类型信息。集合、重载和反射场景必须理解擦除，否则会出现看似矛盾的编译错误。', '编译期强约束，运行时有限信息'],
      ['异常表达可恢复边界', '受检异常要求调用方处理，运行时异常通常表示程序缺陷。包装异常要保留 cause，不能让原始错误链消失。', '保留错误原因和上下文'],
      ['反射把编译期名字变成运行时操作', '反射强大但会绕过编译检查和封装，还有性能和安全性成本。框架使用反射是为了通用装配，业务代码不应默认使用。', '反射是边界工具'],
      ['注解本身不执行逻辑', '注解只是元数据，需要编译期处理器或运行时扫描器解释。框架启动慢、代理复杂和扫描行为都与此相关。', '注解必须找到处理者'],
      ['把动态能力关进边界', '若必须反射，限制可访问类型、参数和权限，并为失败提供明确错误。不能让任意字符串变成任意类加载。', '动态加载必须白名单'],
    ],
  },
  {
    name: 'Java 并发、AQS 与 ThreadPoolExecutor',
    track: 'P06 · Java / JVM / Spring',
    minutes: 54,
    prerequisite: '掌握 Java 对象、泛型和基本线程概念。',
    goal: '能解释 JMM、volatile、CAS、AQS、锁和线程池状态机，定位死锁、线程泄漏、队列积压和上下文切换。',
    guidedPractice: '用固定大小线程池执行慢任务，观察队列、活跃线程、拒绝策略和关闭行为，再制造一次死锁。',
    independentPractice: '为一个异步任务系统设计线程池、队列、超时、取消和拒绝策略，并用压测与线程栈证明。',
    commonErrors: ['所有业务共用无界队列线程池。', '只增加线程数掩盖锁竞争。'],
    sourceRefs: [JAVA_SPECS, 'Java Concurrency Utilities. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html'],
    steps: [
      ['JMM 定义线程间可见性', '线程可能缓存共享变量，volatile 和同步提供可见性与有序性保证。仅仅看到一次读写正常，不代表并发安全。', '先写同步与可见性契约'],
      ['CAS 用乐观重试避免阻塞', '原子类通过比较并交换更新值，竞争激烈时可能反复重试。长临界区和复杂复合操作仍然需要锁或更高层结构。', '原子操作只保护单个状态转换'],
      ['AQS 用状态和等待队列构建同步器', 'ReentrantLock、Semaphore 等共享排队、唤醒和中断机制。理解状态含义，才能解释公平性、超时和中断行为。', '锁不只是 synchronized 的替代品'],
      ['线程池是资源边界', '核心线程、最大线程、队列、拒绝策略和关闭组成完整状态机。无界队列可能延迟任务直到内存耗尽，线程过多又会争抢 CPU。', '线程池限制并发资源'],
      ['用证据诊断并发故障', 'thread dump 看锁和线程状态，JFR 看阻塞与 CPU，压测看延迟分位。每次修改都记录前后指标和任务形态。', '线程栈与指标一起判断'],
    ],
  },
  {
    name: 'JVM 内存、类加载与字节码',
    track: 'P06 · Java / JVM / Spring',
    minutes: 56,
    prerequisite: '掌握 Java 类、对象、异常和集合。',
    goal: '能解释 class 文件、加载验证准备解析初始化、双亲委派、堆与元空间、线程栈，以及常见内存溢出类型。',
    guidedPractice: '用 javap 查看一个类的字节码，制造 ClassNotFound、NoClassDefFound 和元空间增长，并记录异常差异。',
    independentPractice: '画出一个 Spring Boot 服务从启动到类加载的路径，列出每一层可能的版本冲突和内存问题。',
    commonErrors: ['把堆和栈都当成同一种内存。', '看到 ClassNotFound 只检查 import。'],
    sourceRefs: [JAVA_SPECS, OPENJDK],
    steps: [
      ['class 文件保存字节码和元数据', '常量池、方法、字段和版本信息共同组成可加载类。编译版本不兼容时，问题发生在加载或验证阶段，而不是业务代码。', '先看 class 版本和依赖来源'],
      ['类加载分阶段完成', '加载、验证、准备、解析和初始化各有职责。静态初始化延迟触发，类初始化失败会留下不可恢复错误状态。', '初始化时机影响启动顺序'],
      ['双亲委派管理类来源', '类加载器先请求父加载器再尝试自身，避免核心类被随意替换。容器、插件和热部署会引入更复杂的隔离边界。', '同名类可能来自不同加载器'],
      ['运行时数据区分工明确', '对象通常在堆，类元数据在元空间，线程执行状态在栈。不同溢出类型要通过错误信息和工具定位，不能统一加内存。', '先判断溢出发生在哪一区'],
      ['把启动依赖纳入可观测性', '记录 JVM 版本、类路径、模块和关键依赖版本。线上类冲突需要从实际制品和启动命令追查。', '运行中的类路径才是真相'],
    ],
  },
  {
    name: 'JVM GC、JIT 与 JFR 调优',
    track: 'P06 · Java / JVM / Spring',
    minutes: 62,
    prerequisite: '完成 JVM 内存和类加载课程，能运行压测。',
    goal: '能区分吞吐、延迟和内存目标，使用 GC 日志、JFR、线程栈和火焰图定位停顿、CPU、分配与泄漏，并证明调优有效。',
    guidedPractice: '对同一服务比较 G1 与 ZGC 的停顿和吞吐，改变堆与分配后记录 P99、GC 次数和 CPU。',
    independentPractice: '完成一次 JVM 调优报告，包含 baseline、假设、证据、单变量修改、回归和适用边界。',
    commonErrors: ['只背启动参数，不看 workload。', '用一次压测结果宣布所有环境最优。'],
    sourceRefs: ['OpenJDK Garbage Collection. https://openjdk.org/groups/hotspot/docs/HotSpotGC.html', 'JDK Flight Recorder. https://docs.oracle.com/javase/8/docs/technotes/guides/jfr/'],
    steps: [
      ['先定义优化目标', '吞吐、P99 延迟、内存占用和启动时间经常互相冲突。没有 baseline 和业务目标，参数调整只是在猜。', '先写目标，再读指标'],
      ['GC 根决定对象可达性', '分代、标记、复制和并发清理共同影响停顿。高分配率、长寿命缓存和堆设置都会改变回收行为。', '先看分配速率和停顿分布'],
      ['JIT 让热代码逐步优化', '解释执行收集 profile，C1 快速编译，C2 做更深优化。内联、逃逸分析和去优化会影响性能曲线。', '基准测试必须预热'],
      ['JFR 提供低开销证据', '分配、锁、线程、IO 和 GC 事件能还原运行时行为。结合火焰图与线程栈定位 CPU、阻塞和内存来源。', '证据优先于参数清单'],
      ['调优必须回归', '每次只改一个假设，重新压测并比较分位、错误率和资源。优化成功后要加监控和回归基准，防止后续版本回退。', '没有回归就没有长期收益'],
    ],
  },
  {
    name: 'Spring IoC、AOP 与事务源码',
    track: 'P06 · Java / JVM / Spring',
    minutes: 58,
    prerequisite: '掌握 Java 注解、反射、代理和并发基础。',
    goal: '能沿 BeanDefinition、BeanFactory、refresh、AOP 代理和 TransactionInterceptor 解释 Spring 容器与事务边界。',
    guidedPractice: '固定 Spring Framework 版本，断点跟踪一次 Bean 创建和一次事务方法调用，记录代理与拦截链。',
    independentPractice: '复现一个 self-invocation 事务失效问题，给出重构和集成测试方案。',
    commonErrors: ['认为加了注解就一定有事务。', '在事务中调用远程服务和长耗时操作。'],
    sourceRefs: [SPRING, 'Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html'],
    steps: [
      ['Bean 定义先于实例创建', 'Spring 先读取配置形成 BeanDefinition，再按依赖顺序创建、初始化和注册对象。作用域与延迟加载会改变生命周期。', '定义、实例和代理不是同一个对象'],
      ['容器 refresh 是启动主流程', '配置解析、后置处理器、Bean 创建和事件发布按顺序发生。启动错误要区分配置、依赖、代理和初始化失败。', '启动顺序是源码阅读地图'],
      ['AOP 用代理包裹调用边界', '切面通过代理在方法前后增加逻辑。自调用绕过代理，因此事务和安全注解可能失效。', '代理边界决定增强是否生效'],
      ['事务拦截器管理提交回滚', '传播行为、隔离级别、回滚规则和资源绑定共同决定结果。远程调用和长等待会扩大事务时间与锁范围。', '事务边界要短且明确'],
      ['从调用链写源码报告', '记录类、方法、拦截器和事务资源流转。结论必须能通过日志、断点和集成测试复现。', '源码阅读以行为验证收尾'],
    ],
  },
  {
    name: 'Spring Boot 自动配置与 Spring MVC',
    track: 'P06 · Java / JVM / Spring',
    minutes: 52,
    prerequisite: '完成 Spring IoC 与 AOP 课程。',
    goal: '能解释自动配置条件、配置优先级、启动器、DispatcherServlet 请求链和统一异常处理。',
    guidedPractice: '跟踪一次 Spring Boot 启动和 HTTP 请求，列出自动配置、HandlerMapping、HandlerAdapter、返回值和异常处理路径。',
    independentPractice: '从空工程搭建 Boot 服务，关闭一项自动配置并手写等价配置，说明两种方式的取舍。',
    commonErrors: ['遇到冲突就排除自动配置。', '在 Controller 中直接写业务和数据库访问。'],
    sourceRefs: [SPRING_BOOT, SPRING],
    steps: [
      ['启动器组织依赖', 'starter 只负责带入一组兼容依赖，自动配置根据 classpath、属性和 Bean 条件生效。依赖冲突要先看实际解析树。', 'starter 不是魔法实现'],
      ['自动配置由条件选择', '@Conditional 和配置属性决定是否创建 Bean。排除配置前要确认真实冲突，否则会失去后续升级修复。', '先看条件报告，再排除'],
      ['请求由 DispatcherServlet 分派', 'HandlerMapping 找处理器，HandlerAdapter 执行，消息转换器处理输入输出。过滤器、拦截器和切面的位置不同。', '过滤器、拦截器、AOP 分层'],
      ['配置优先级要可解释', '命令行、环境变量、配置文件和默认值按明确顺序覆盖。生产配置不应依赖开发者电脑上的隐式文件。', '最终生效值必须可查询'],
      ['用切片与集成测试验收', 'MVC 切片验证接口，集成测试验证数据库和容器，端到端测试验证真实请求。测试层级要对准风险。', '测试边界匹配故障边界'],
    ],
  },
  {
    name: 'Spring Security、Data 与缓存边界',
    track: 'P06 · Java / JVM / Spring',
    minutes: 50,
    prerequisite: '完成后端认证授权课程和 Spring Boot。',
    goal: '能配置安全过滤链、方法级授权、数据访问事务和缓存，并处理懒加载、N+1、缓存穿透与权限缓存失效。',
    guidedPractice: '为一个多租户 API 加入安全过滤链和对象级授权，再观察 JPA 懒加载与缓存导致的错误返回。',
    independentPractice: '设计一个缓存失效方案，覆盖写操作、撤权、失败回退和监控，并写集成测试。',
    commonErrors: ['只做 URL 级授权，不做对象级授权。', '缓存权限结果但撤权后不失效。'],
    sourceRefs: [SPRING_SECURITY, 'Spring Data Documentation. https://docs.spring.io/spring-data/commons/reference/'],
    steps: [
      ['过滤链逐步建立安全上下文', '认证、会话、CSRF、异常和授权过滤器顺序影响结果。自定义过滤器应最小化，并明确插入位置。', '安全上下文来自完整过滤链'],
      ['方法授权保护业务边界', 'URL 规则之外的资源级动作要在服务方法或查询条件中检查。管理员与普通用户的权限组合要测试。', '授权跟随资源访问'],
      ['ORM 不等于数据库透明层', '实体关系和懒加载会隐藏查询。通过 SQL 日志、统计和测试识别 N+1，再选择抓取策略或专用查询。', '实体关系必须观察真实 SQL'],
      ['缓存要定义一致性和失效', '缓存键包含租户和权限维度，写操作触发失效。失败时可回源，但不能回退到越权数据。', '安全数据缓存先设计撤权'],
      ['事务管理资源生命周期', '数据库事务、缓存写入和消息发布不是天然原子。需要 Outbox、补偿或明确失败窗口。', '跨资源操作要写一致性策略'],
    ],
  },
  {
    name: 'MyBatis 执行链与 SQL 治理',
    track: 'P06 · Java / JVM / Spring',
    minutes: 50,
    prerequisite: '掌握 SQL、事务和 Spring Boot。',
    goal: '能沿 MapperProxy、SqlSession、Executor、StatementHandler 和 ResultSetHandler 解释 MyBatis 调用，并治理动态 SQL 与 N+1。',
    guidedPractice: '固定 MyBatis 版本跟踪 Mapper 方法一次执行，开启 SQL 日志观察参数、执行计划与结果映射。',
    independentPractice: '重构一组动态 SQL 和 N+1 查询，补齐分页、索引、超时和批量写入测试。',
    commonErrors: ['把 ${} 当成普通参数占位符导致注入。', '在循环里逐条查询关联数据。'],
    sourceRefs: [MYBATIS, 'MyBatis Dynamic SQL. https://mybatis.org/mybatis-dynamic-sql/'],
    steps: [
      ['Mapper 接口由代理实现', '调用 Mapper 方法时生成执行器请求，参数映射到 SQL，结果再映射为对象。接口没有实现类不代表没有调用链。', '先看代理，再看执行器'],
      ['SqlSession 管理会话边界', '会话、事务和连接生命周期相关。何时提交、关闭和复用由 Spring 集成控制，业务代码不应自行打散。', '会话边界服从事务边界'],
      ['Executor 与 Handler 分层', '缓存、语句准备、参数绑定和结果映射分别处理。插件会改变执行链，排查时要注意拦截器顺序。', '插件不是免费增强'],
      ['动态 SQL 要防止注入与失控', '参数使用绑定变量，排序字段等必须白名单。复杂条件要把 SQL 生成和业务规则分开测试。', '结构和值分开处理'],
      ['用执行计划治理慢查询', '记录 SQL、参数、耗时和计划，结合索引与结果集大小定位。批量写入要控制事务大小和网络往返。', '慢查询优化从计划开始'],
    ],
  },
  {
    name: 'Spring AI、Spring Cloud 与 Netty',
    track: 'P06 · Java / JVM / Spring',
    minutes: 58,
    prerequisite: '完成 Spring Boot、安全、数据访问和并发基础。',
    goal: '能区分 Spring AI、Spring Cloud 与 Netty 的职责，设计模型调用、工具调用、服务治理和异步网络边界。',
    guidedPractice: '搭建一个模型调用接口，加入提示模板、工具调用、超时和审计，再用网关与负载均衡访问两个实例。',
    independentPractice: '设计一个 AI 功能的生产方案，包含秘密管理、限流、重试、降级、数据脱敏和人工确认。',
    commonErrors: ['把模型输出直接当成可信业务数据。', '在网关里写业务逻辑。'],
    sourceRefs: [SPRING_AI, SPRING_CLOUD, NETTY],
    steps: [
      ['Spring AI 管理模型交互边界', '模型客户端、提示、工具调用、RAG 和 Advisor 负责不同层次。输出必须经过结构校验、权限和业务确认。', '模型是外部不可信依赖'],
      ['工具调用需要权限沙箱', '模型只能调用明确允许的工具，参数要校验，敏感操作需要人工确认。工具结果也要视为不可信输入。', '模型不能拥有隐式系统权限'],
      ['Spring Cloud 处理服务治理', '服务发现、配置、网关、负载均衡和熔断解决不同问题。先确认单体边界，再引入分布式复杂度。', '治理组件服务于明确故障域'],
      ['Netty 提供异步网络基础', 'EventLoop、Channel、Pipeline 和 ByteBuf 管理非阻塞 IO。阻塞任务进入 EventLoop 会拖慢大量连接。', '网络线程保持非阻塞'],
      ['AI 与微服务都要可观测', '记录请求、模型、工具、令牌、延迟和错误，但脱敏输入输出。用超时和降级保护用户体验。', '可观测不能泄露提示与秘密'],
    ],
  },
  {
    name: 'Spring 家族源码：Framework、Boot、Security、Data、Cloud',
    track: 'P06 · Java / JVM / Spring',
    minutes: 68,
    prerequisite: '完成 Spring IoC、AOP、Boot、Security 和 MyBatis 课程。',
    goal: '能固定各 Spring 项目版本，沿容器刷新、自动配置、安全过滤链、数据仓库代理和网关过滤器阅读家族源码与扩展点。',
    guidedPractice: '为 Spring Framework、Boot、Security、Data 和 Cloud Gateway 各记录一个入口符号，画出一次 Bean 创建、请求鉴权和网关转发链路。',
    independentPractice: '自定义一个 Boot 自动配置、Security 过滤器和 Data 查询扩展，写测试证明执行顺序与失败边界。',
    commonErrors: ['把 Spring Boot 当成 Spring Framework 本体。', '只看注解，不追踪代理、条件和过滤器顺序。'],
    sourceRefs: [SPRING, SPRING_BOOT, SPRING_SECURITY, SPRING_CLOUD, SPRING_GATEWAY],
    steps: [
      ['Framework 先读容器刷新', 'AnnotationConfigApplicationContext 通过 refresh 完成配置解析、后置处理、Bean 创建和生命周期回调。所有家族能力最终都依赖这个容器与扩展点体系。', '先掌握 refresh 与 BeanFactory'],
      ['Boot 是自动配置和运行封装', 'SpringApplication 负责环境、监听器、上下文和失败分析；自动配置由条件、配置属性和 starter 依赖共同选择。启动失败要读条件报告和异常链。', 'Boot 不是另一个 IoC 容器'],
      ['Security 是过滤器链，不是注解集合', 'FilterChainProxy、SecurityFilterChain 和认证授权管理器组成请求安全边界。方法注解通过代理和授权管理器生效，顺序错误会绕过预期控制。', '过滤器顺序就是安全顺序'],
      ['Data 用代理生成仓库实现', 'RepositoryFactorySupport 根据接口生成查询和执行器，事务、异常转换和查询执行位于代理与模板层。读到实现类才能解释懒加载和事务边界。', '接口仓库背后仍有调用链'],
      ['Cloud Gateway 与 AI 都有责任边界', 'Gateway 过滤器处理路由、限流、头和鉴权，不承载业务规则；Spring AI 的 Advisor、工具和模型客户端负责不同模型交互层。所有扩展都要写清顺序、失败和降级。', '扩展点必须带顺序与边界'],
    ],
  },
  {
    name: 'Spring 流式接口：SSE、WebFlux 与背压',
    track: 'P06 · Java / JVM / Spring',
    minutes: 58,
    prerequisite: '完成 Spring MVC、WebFlux 基础、HTTP 和并发课程。',
    goal: '能设计可取消、可观测、支持背压的流式接口，理解 SSE、分块响应、Flux、线程模型、代理缓冲和连接超时。',
    guidedPractice: '分别用 SseEmitter 和 WebFlux 返回流式事件，记录连接建立、首字节、心跳、取消和代理缓冲行为。',
    independentPractice: '为一个流式 AI 接口设计超时、心跳、断线清理、限流、日志脱敏和前端取消方案，并完成慢客户端压测。',
    commonErrors: ['把流式响应当成一次性 JSON，等待全部完成后才返回。', '在事件循环线程执行阻塞数据库或模型调用。'],
    sourceRefs: [SPRING_WEBFLUX, SPRING, SSE_SPEC],
    steps: [
      ['先区分 SSE 与普通响应', 'SSE 使用持续连接发送 text/event-stream 事件，客户端可以逐段处理。响应头、缓冲、心跳和断线语义必须按事件流设计，不能只把 JSON 拆开。', '流式协议先于前端动画'],
      ['MVC 流式输出要管理生命周期', 'SseEmitter、StreamingResponseBody 和异步请求依赖容器线程与连接生命周期。客户端断开后必须停止生成、释放模型和数据库资源。', '连接结束要触发取消'],
      ['WebFlux 用 Publisher 表达流', 'Flux 和 Mono 是由订阅驱动的数据流，背压来自消费者请求量。阻塞调用必须调度到合适线程池，不能阻塞事件循环。', '订阅、需求和取消都是一等状态'],
      ['代理和网关可能破坏流式', 'Nginx、Ingress、CDN 和网关可能缓存、压缩或聚合响应。超时、缓冲和连接上限要逐层核对，并保留 requestId 观测首字节和结束。', '流式链路要检查每一层'],
      ['慢客户端与资源上限', '心跳、事件大小、并发连接、发送队列和最大时长都要限制。慢消费者不能无限占用内存，必要时断开并记录原因。', '流式接口必须有资源预算'],
    ],
  },
  {
    name: 'JDK 8 到最新 LTS：Records、Virtual Threads 与迁移',
    track: 'P06 · Java / JVM / Spring',
    minutes: 60,
    prerequisite: '掌握 Java 8 语法、集合、泛型、异常和基本并发。',
    goal: '能按正式版与预览版区分 JDK 8 到当前 LTS 的语言、API 和运行时演进，并制定兼容性、依赖和迁移验证方案。',
    guidedPractice: '从 Lambda/Stream 出发，逐版本记录 var、模块、HttpClient、文本块、Records、sealed、模式匹配、Virtual Threads 和结构化并发状态。',
    independentPractice: '把一个 JDK 8 服务迁移到目标 LTS，修复封装、反射、依赖、GC 和第三方库兼容问题，并保存迁移矩阵。',
    commonErrors: ['把预览特性当成所有 LTS 都能直接使用。', '只升级 javac，不验证运行时、依赖和反射兼容。'],
    sourceRefs: [JEP_INDEX, JAVA_DOCS, JAVA_SPECS, OPENJDK],
    steps: [
      ['JDK 8 建立函数式与 Stream 基线', 'Lambda、方法引用、Stream、Optional 和新日期时间 API 改变集合与函数组合方式。迁移时仍要检查惰性求值、异常和副作用边界。', 'Lambda 不是简单语法糖'],
      ['模块化和新语法逐步演进', 'JDK 9 引入模块系统，后续版本加入 var、HttpClient、文本块、Records、sealed 和模式匹配。每项特性要标注正式版、预览状态和最低运行时。', '版本矩阵必须写正式与预览'],
      ['Records 和 sealed 表达数据边界', 'Record 适合透明不可变数据载体，不等于万能领域实体；sealed 限制可扩展类型集合，便于穷尽分支。两者都要考虑序列化和框架支持。', '语言特性要与领域语义匹配'],
      ['Virtual Threads 改变阻塞并发成本', '虚拟线程适合大量阻塞 IO，不会让 CPU 密集任务自动并行。同步锁、线程局部变量、连接池和框架调度仍要重新验证。', '虚拟线程不是线程池替代品'],
      ['迁移以运行时证据收尾', '固定目标 LTS、编译参数、依赖版本和容器基础镜像，运行测试、反射扫描、GC 与压测。预览特性需要单独开关和回退策略。', '升级 JDK 是系统工程'],
    ],
  },
  {
    name: 'JVM 语言家族：Kotlin、Scala、Groovy 与 Clojure',
    track: 'P06 · Java / JVM / Spring',
    minutes: 48,
    prerequisite: '完成 Java 语言、JVM 和 Spring 基础。',
    goal: '能比较四种 JVM 语言在类型、并发、互操作、构建和团队维护上的取舍，不把语法偏好当架构决策。',
    guidedPractice: '用同一业务接口分别设计 Java 与 Kotlin 调用方式，检查空安全、协程和 Java 互操作边界。',
    independentPractice: '为一个团队选型写 ADR，说明业务约束、人才、构建、调试、性能和生态风险。',
    commonErrors: ['只因语法简洁就替换主力语言。', '忽略 Java 互操作和构建工具链成本。'],
    sourceRefs: [KOTLIN, SCALA, GROOVY, CLOJURE],
    steps: [
      ['共同运行时不代表相同模型', 'JVM 提供字节码和运行时基础，但各语言在类型系统、空安全、并发和宏能力上不同。跨语言调用要理解边界转换。', '先比较语义，再比较语法'],
      ['Kotlin 强调空安全与协程', 'Kotlin 与 Java 互操作成熟，适合 Android 和 Spring 服务。协程仍需理解结构化并发、取消和阻塞边界。', '协程不是自动异步'],
      ['Scala 提供强类型函数式工具', '类型系统和函数式抽象适合复杂数据与分布式生态，但学习曲线和编译成本要进入团队评估。', '抽象能力要匹配团队'],
      ['Groovy 与 Clojure 各有定位', 'Groovy 常见于 DSL、构建和脚本，Clojure 强调不可变数据与函数式并发。企业选型要关注维护者数量和调试能力。', '生态成本也是技术成本'],
      ['用 ADR 记录语言选型', '比较招聘、构建、测试、工具、性能、互操作和迁移路径。选型结论要有范围、试点和退出策略。', '语言决策是长期维护决策'],
    ],
  },
  {
    name: 'CPython 数据模型、类型与对象',
    track: 'P07 · Python 企业后端',
    minutes: 44,
    prerequisite: '会编写基本 Python 函数和类。',
    goal: '能解释对象、属性查找、描述符、可变默认参数、类型提示和协议，并写出可测试的 Python 领域模型。',
    guidedPractice: '用 __dict__、__slots__、property 和描述符观察属性访问，再复现可变默认参数问题。',
    independentPractice: '把一个使用字典传递业务状态的模块改成带类型和不变量的数据类，并为边界补测试。',
    commonErrors: ['使用可变对象作为默认参数。', '把类型提示当成运行时校验。'],
    sourceRefs: [PYTHON, 'Python Data Model. https://docs.python.org/3/reference/datamodel.html'],
    steps: [
      ['一切行为围绕对象协议', '属性查找、调用、迭代和上下文管理由特殊方法定义。理解协议能读懂库行为，也能写出与 Python 语法自然协作的类型。', '先找协议，再找业务方法'],
      ['默认参数在定义时求值', '可变默认参数会被所有调用共享。应使用 None 作为哨兵并在函数内部创建新容器，再用测试锁定行为。', '函数定义时与调用时要分清'],
      ['类型提示服务于工具', 'mypy、pyright 和编辑器依赖类型提示做静态检查，但运行时仍需校验外部数据。泛型与协议可以表达结构关系。', '静态类型不替代数据验证'],
      ['数据模型要保护不变量', '数据类、枚举和值对象能减少任意字典的非法状态。边界处解析数据，内部保持稳定类型。', '进入领域前完成解析'],
      ['性能问题先看对象分配', '大量小对象、属性字典和热路径函数调用会影响性能。用 profiling 数据判断，不靠局部微优化。', '先测量再优化对象模型'],
    ],
  },
  {
    name: 'Python 装饰器、生成器、上下文与异步',
    track: 'P07 · Python 企业后端',
    minutes: 48,
    prerequisite: '掌握 Python 函数、类和数据模型。',
    goal: '能使用装饰器、生成器、上下文管理器和 asyncio 构建可取消、可清理的异步业务流程。',
    guidedPractice: '实现一个带超时、取消和异常传播的异步请求，再比较同步阻塞调用对事件循环的影响。',
    independentPractice: '把一批同步文件处理改为流式生成器和异步任务，记录内存、吞吐和错误恢复。',
    commonErrors: ['在 async 函数中调用阻塞库。', '只捕获异常不执行清理。'],
    sourceRefs: [PYTHON, 'Python asyncio. https://docs.python.org/3/library/asyncio.html'],
    steps: [
      ['闭包和装饰器封装横切逻辑', '装饰器接收函数并返回新函数，适合日志、权限和缓存。包装后要保留元数据、签名和异常链。', '装饰器改变调用边界'],
      ['生成器按需产生数据', 'yield 保留执行状态，适合流式读取和大结果集。消费者要能关闭生成器并释放文件与网络资源。', '流式处理控制内存'],
      ['上下文管理器负责资源生命周期', 'with 保证进入和退出成对执行，即使中间抛错也能清理。异步上下文管理器对应异步资源。', '资源获取和释放要成对'],
      ['asyncio 是协作式并发', '任务在 await 点让出控制权，阻塞调用会卡住整个事件循环。同步库要用线程池或其他隔离方式。', '异步代码不能包含阻塞热路径'],
      ['取消是正常业务状态', '超时、断线和用户离开都会取消任务。清理逻辑要幂等，取消不能吞掉正在提交的事务。', '把取消纳入状态机'],
    ],
  },
  {
    name: 'Python 项目、打包、uv 与依赖锁定',
    track: 'P07 · Python 企业后端',
    minutes: 40,
    prerequisite: '能运行 Python 脚本并安装第三方包。',
    goal: '能从空目录建立 pyproject.toml 项目、锁定依赖、分离开发与生产环境，并构建可部署制品。',
    guidedPractice: '使用 uv 从空目录建立 src 布局、测试、Ruff、类型检查和锁文件，再构建 wheel 与容器。',
    independentPractice: '接管一个 requirements.txt 混乱的项目，迁移到 pyproject 与锁文件并验证生产环境一致。',
    commonErrors: ['全局 pip 安装并依赖隐式版本。', '开发和运行时依赖混在一起。'],
    sourceRefs: [PYTHON_PACKAGING, UV],
    steps: [
      ['项目元数据进入 pyproject', '名称、版本、Python 范围、依赖和工具配置集中声明。src 布局减少导入歧义，测试从安装后的包运行。', '项目根目录就是构建输入'],
      ['锁文件固定解析结果', '依赖声明与解析结果分开。CI 使用冻结锁文件安装，升级通过显式变更和回归测试完成。', '声明范围和可复现安装分开'],
      ['虚拟环境隔离项目依赖', '每个项目使用独立解释器和包目录，避免系统包污染。容器构建也应使用相同锁定路径。', '开发和生产共享一套锁'],
      ['质量工具进入统一入口', 'Ruff、类型检查、pytest 和构建命令进入脚本或 CI，开发者不必记多个隐式命令。', '一条命令跑完整检查'],
      ['容器镜像最小化', '只复制构建产物和运行依赖，使用非 root 用户、固定基础镜像和健康检查。不要把整个开发目录带进镜像。', '镜像只包含运行所需'],
    ],
  },
  {
    name: 'FastAPI、Django 与 SQLAlchemy 工程',
    track: 'P07 · Python 企业后端',
    minutes: 54,
    prerequisite: '完成 Python 类型、异步和项目打包课程。',
    goal: '能选择 FastAPI 或 Django，使用 Pydantic、依赖注入、SQLAlchemy 或 ORM、迁移和测试建立企业 API。',
    guidedPractice: '分别搭建 FastAPI 与 Django 最小服务，实现同一订单接口、校验、认证、迁移和错误响应。',
    independentPractice: '为一个 Python API 设计异步数据库访问、事务、连接池、后台任务和可观测性，并完成压测。',
    commonErrors: ['把 ORM 查询放进序列化层。', '在异步路由里使用同步阻塞数据库驱动。'],
    sourceRefs: [FASTAPI, DJANGO, SQLALCHEMY],
    steps: [
      ['先选框架的控制边界', 'FastAPI 偏 API 组合与类型校验，Django 提供完整 ORM、管理后台和约定。选择取决于领域、团队和既有能力。', '框架选择是边界选择'],
      ['依赖注入显式化', 'FastAPI 依赖适合解析请求、认证和数据库会话。依赖要在异常和取消时正确清理，避免连接泄漏。', '依赖的退出逻辑同样重要'],
      ['ORM 查询要观察 SQL', '关系加载、N+1、事务和连接池决定数据库行为。SQLAlchemy 异步会话与同步会话不能随意混用。', '先看 SQL，再谈 ORM 抽象'],
      ['迁移进入发布流程', 'Django migration 或 Alembic 变更要在测试库验证，生产迁移拆分并具备回滚。', '迁移脚本必须可审计'],
      ['后台任务需要幂等', '任务执行可能重复或失败，消息消费必须带幂等键、重试和死信处理。', '异步不等于可靠'],
    ],
  },
  {
    name: 'CPython 字节码、GIL 与性能剖析',
    track: 'P07 · Python 企业后端',
    minutes: 50,
    prerequisite: '完成 CPython 数据模型和异步课程。',
    goal: '能使用 dis、profiling、py-spy 和基准定位 CPU、GIL、内存与 IO 问题，并判断优化边界。',
    guidedPractice: '用 timeit、cProfile 和 py-spy 分析 CPU 密集与 IO 密集任务，比较多线程、多进程和异步方案。',
    independentPractice: '对一个慢 Python API 完成 profile、修复、压测和内存回归，写清优化没有改变的行为。',
    commonErrors: ['多线程解决所有 CPU 密集任务。', '只优化一行代码，不做端到端测量。'],
    sourceRefs: [PYTHON, 'CPython source. https://github.com/python/cpython'],
    steps: [
      ['字节码解释执行有固定成本', 'Python 源码编译为字节码，由虚拟机逐条执行。局部变量、属性访问和函数调用都是可测量成本。', '先看热点操作'],
      ['GIL 限制同时执行字节码', '线程适合等待 IO 的并发，不代表 CPU 密集任务并行。多进程、原生扩展和异步有不同成本和边界。', '任务形态决定并发模型'],
      ['profiling 区分 CPU 与 IO', '采样分析适合线上观察，确定性 profiler 会放大开销。火焰图能显示调用栈热点，内存工具能发现泄漏。', '工具选择取决于问题'],
      ['缓存与批处理优先于微优化', '减少重复网络、数据库和序列化通常比局部语法优化收益更大。缓存要定义失效与内存上限。', '先消除结构性浪费'],
      ['优化要有回归基准', '基准记录解释器版本、依赖、数据和并发。改动后用相同 workload 比较吞吐、P99 和内存。', '性能工程需要可重复实验'],
    ],
  },
  {
    name: 'Go 类型、接口、错误与 context',
    track: 'P08 · Go 企业后端',
    minutes: 42,
    prerequisite: '具备一种静态类型语言基础，了解 HTTP。',
    goal: '能用 Go 的值语义、接口、错误包装和 context 建立清晰的请求边界与取消传播。',
    guidedPractice: '实现一个带超时、取消和错误包装的 HTTP 调用，使用 errors.Is、errors.As 和 context 验证。',
    independentPractice: '重构一个到处打印错误的 Go 服务，建立稳定错误分类、用户消息和日志上下文。',
    commonErrors: ['忽略 context 取消继续执行。', '用字符串比较判断错误类型。'],
    sourceRefs: [GO_DOCS, GO_SPEC],
    steps: [
      ['值语义让复制行为清楚', '结构体默认按值复制，切片和 map 内部仍包含引用。理解容量、底层数组和指针，才能控制共享与分配。', '值、引用和底层存储分开看'],
      ['接口描述方法集合', '小接口更容易组合和测试，具体类型负责实现。接口值包含动态类型和值，nil 接口与 nil 指针并不相同。', '接口设计保持小'],
      ['错误是普通返回值', '调用方必须显式处理错误，包装时保留原因和上下文。业务错误应有稳定分类，不能只靠文本。', '错误上下文服务排障'],
      ['context 传播截止时间和取消', '请求进入后把 context 传到数据库、RPC 和 goroutine，任何阻塞操作都应响应取消。不能把 context 存进结构体当全局参数。', '取消必须贯穿调用链'],
      ['用表格测试边界', '输入、错误和 context 取消都可做表驱动测试。测试 goroutine 时要等待退出，避免偶发泄漏。', '并发测试必须可重复'],
    ],
  },
  {
    name: 'Go goroutine、channel 与调度器',
    track: 'P08 · Go 企业后端',
    minutes: 52,
    prerequisite: '完成 Go 类型、错误和 context。',
    goal: '能解释 goroutine、channel、select、GMP 调度和内存模型，定位泄漏、死锁、竞态和背压问题。',
    guidedPractice: '实现 worker pool 和取消流程，用 race detector、goroutine dump 和 trace 观察阻塞。',
    independentPractice: '修复一个未关闭 channel 和未退出 goroutine 的任务系统，补超时、背压和关闭顺序测试。',
    commonErrors: ['启动 goroutine 不定义退出条件。', '向已关闭 channel 发送数据。'],
    sourceRefs: [GO_SPEC, 'Go Memory Model. https://go.dev/ref/mem'],
    steps: [
      ['goroutine 是轻量执行单元', '创建便宜不等于可以无限创建。每个 goroutine 都要有退出、取消和错误返回路径，否则会泄漏内存与连接。', '启动时必须设计结束'],
      ['channel 传递所有权与同步', '无缓冲和有缓冲 channel 的阻塞行为不同。关闭应由发送方负责，接收方不能假设每次关闭都安全。', '用 channel 表达所有权'],
      ['select 处理多路等待', 'select 在多个通信操作中等待，配合 timer 和 context 实现超时取消。随机选择分支，不能依赖偶然顺序。', '超时与取消进入同一选择'],
      ['GMP 调度运行大量任务', 'Goroutine、逻辑处理器和操作系统线程协作。阻塞系统调用、CPU 密集任务和同步原语会影响调度与延迟。', '运行时调度影响尾延迟'],
      ['用 race 与 trace 找证据', 'race detector 检查数据竞争，pprof 和 trace 显示阻塞、调度和 GC。一次正常运行不能证明并发安全。', '并发故障靠工具重现'],
    ],
  },
  {
    name: 'Go net/http、Gin 与 gRPC 工程',
    track: 'P08 · Go 企业后端',
    minutes: 48,
    prerequisite: '完成 Go 错误、context 和并发课程。',
    goal: '能从标准库 HTTP 服务扩展至 Gin 与 gRPC，理解中间件、超时、连接、序列化和服务契约。',
    guidedPractice: '用 net/http 写最小服务，再迁移到 Gin，并实现一个 gRPC 方法共享领域模型和错误。',
    independentPractice: '为服务加入优雅停机、请求超时、限流、结构化日志、健康检查和 trace 传播。',
    commonErrors: ['框架中间件顺序错误。', '服务关闭时直接杀掉正在处理的请求。'],
    sourceRefs: ['Go net/http. https://pkg.go.dev/net/http', GIN, GRPC_GO],
    steps: [
      ['标准库先建立 HTTP 心智模型', 'Server、Handler、Request 和 ResponseWriter 是基础。框架只是路由和中间件组合，不能绕过协议语义。', '先懂标准库再看框架'],
      ['中间件按顺序包裹请求', '认证、日志、恢复、超时和限流有先后关系。错误处理要写回一致响应，不能重复写 Header。', '中间件顺序就是安全边界'],
      ['gRPC 用契约生成代码', 'Protobuf 定义消息和方法，生成客户端服务端代码。版本演进要遵守字段兼容，错误使用状态码和详情。', '契约变更需要兼容策略'],
      ['服务器需要优雅停机', '收到终止信号后停止接收新请求，等待在途任务完成，再关闭数据库和队列连接。超时后强制退出要记录。', '停机也是发布流程'],
      ['跨协议共享领域而非传输对象', 'HTTP 和 gRPC 可以有不同 DTO，但领域规则应复用。日志和 Trace 在入口建立，在出口清理。', '边界转换不复制业务规则'],
    ],
  },
  {
    name: 'Go 内存、GC、竞态、pprof 与部署',
    track: 'P08 · Go 企业后端',
    minutes: 52,
    prerequisite: '完成 Go 并发和 Web 服务课程。',
    goal: '能使用 pprof、trace、逃逸分析和基准定位 CPU、内存、锁与 GC，并构建小体积可运维镜像。',
    guidedPractice: '给服务加入 CPU、内存、goroutine 和 mutex profile，在压测中找出一个热点并验证修复。',
    independentPractice: '完成从二进制构建、distroless 镜像、探针、优雅停机到回滚的一次发布实验。',
    commonErrors: ['在热路径创建大量临时对象。', '容器没有资源限制和探针。'],
    sourceRefs: [GO_BLOG, 'Go Diagnostics. https://go.dev/doc/diagnostics'],
    steps: [
      ['逃逸分析决定堆分配', '编译器判断对象能否留在栈上。接口装箱、闭包捕获和返回指针可能增加分配，应通过基准确认而不是凭直觉改写。', '优化前先看分配'],
      ['GC 降低停顿但仍有成本', 'GOGC、内存上限和分配速率影响 CPU 与延迟。调整参数只是手段，降低无谓分配通常更直接。', '先减少垃圾，再调 GC'],
      ['并发 profile 暴露锁与阻塞', 'CPU、heap、goroutine 和 mutex profile 回答不同问题。采样窗口和控制面安全要设计。', 'profile 端点必须受保护'],
      ['基准测试防止性能回退', 'Benchmark 记录 ns/op、分配和并发规模。不同机器与环境要比较趋势，不能只看单次数值。', '性能回归进入 CI'],
      ['部署制品保持最小', '静态二进制或 distroless 镜像减少攻击面。配置通过环境或配置中心注入，运行用户非 root，探针和优雅停机齐全。', '小镜像也要有运维能力'],
    ],
  },
];

const BACKEND_STEP_DETAILS: Readonly<
  Record<string, readonly [string, string, string, string, string]>
> = {
  'Java 集合源码：ArrayList、HashMap 与 ConcurrentHashMap': [
    '每个 Java 对象除业务字段外还有对象头、对齐填充和引用成本，可用 JOL 或 jcmd GC.class_histogram 验证；十万条 Integer 与 int 的内存差距往往比算法复杂度更早触发 GC 压力。',
    'ArrayList 主要在连续 Object[] 上工作，复制发生在扩容和中间插入；使用 new ArrayList<>(expectedSize) 前先估算上限，完成后用 trimToSize 或分页避免把峰值容量长期保留。',
    'HashMap 默认负载因子为 0.75，链表达到树化阈值后可能转红黑树，但前提是表容量足够；键的 hashCode 分布差时仍会退化，必须用 equals/hashCode 契约和真实键集合验证。',
    '普通集合的迭代器使用 modCount 检测结构性修改，ConcurrentHashMap 的 computeIfAbsent、merge 等复合操作才提供桶级原子性；遍历期间是否允许删除要按具体集合并发契约验证。',
    '用 JMH 固定预热、线程数和数据结构操作比例，记录 ops/s、分配速率与 P99；源码解释负责提出假设，基准负责证明场景中哪项常数和内存成本真正占主导。',
  ],
  'Java 泛型、异常、反射与注解': [
    '泛型擦除会让 List<String> 与 List<Integer> 在运行时共享同一原始类型，桥接方法则维持多态调用；需要类型令牌时可用 Class<T> 或 TypeReference，但不能假设运行时保留了全部泛型参数。',
    '自定义异常应保留 cause、必要上下文和稳定错误码，批处理可用 addSuppressed 保留多个失败；捕获后重新抛出新异常时，漏掉 cause 会直接切断排障调用链。',
    '反射调用通常从 Class、Method、Field 进入，setAccessible 还受模块系统和安全管理限制；框架会缓存成员查找，而业务热路径应优先编译期接口和显式注册表。',
    '注解是否可见取决于 RetentionPolicy：SOURCE 只给编译器，CLASS 进入字节码但默认不被运行时读取，RUNTIME 才能通过反射获取；没有处理器或扫描器的自定义注解不会自动执行任何逻辑。',
    '动态类加载要校验包名、接口、版本和来源，最好通过 ServiceLoader 或显式白名单限制；把请求参数直接传给 Class.forName 会扩大任意类型加载和供应链攻击面。',
  ],
  'Java 并发、AQS 与 ThreadPoolExecutor': [
    'volatile 提供可见性和禁止特定重排，但不保证复合操作原子；理解锁释放与获取之间的 happens-before，才能判断一个线程写入的配置是否对另一个线程可靠可见。',
    'AtomicLong 的 incrementAndGet 通过 CAS 循环更新；竞争激烈时可观察失败重试与 CPU 消耗，LongAdder 更适合高并发计数，但读取值只是弱一致快照。',
    'AQS 用 state 表示锁或许可数量，并通过 CLH 等待队列组织线程；tryAcquire、tryRelease 决定公平性、可重入和条件等待，理解这些钩子才能读懂 ReentrantLock 与 Semaphore。',
    'ThreadPoolExecutor 从 RUNNING、SHUTDOWN、STOP、TIDYING 到 TERMINATED 有明确转换；队列满后的 AbortPolicy、CallerRunsPolicy 和自定义策略会改变背压位置，关闭时 shutdown 与 shutdownNow 语义不同。',
    '用 jcmd Thread.print 或 jstack 看 BLOCKED、WAITING 和锁持有者，用 JFR 的 JavaMonitorEnter、ThreadPark 事件看竞争开销；只增加线程数通常会把锁等待转成 CPU 上下文切换。',
  ],
  'JVM 内存、类加载与字节码': [
    'javap -c -v 可查看常量池、字节码、方法描述符和 class 主版本；UnsupportedClassVersionError 要对比编译 target、实际 java 版本和构建容器，而不是只检查 IDE 设置。',
    '类初始化由首次主动使用触发，<clinit> 抛错后类型会进入错误状态；静态连接池、配置读取和日志框架初始化顺序都可能让启动问题表现为 NoClassDefFoundError。',
    '双亲委派帮助核心类保持一致，但应用服务器、插件和热部署常用子加载器隔离同名类；排查 ClassCastException 时要同时打印对象的类加载器，而不是只看完整类名。',
    '堆溢出、Metaspace 溢出和无法创建线程对应不同内存区与限额；jcmd VM.native_memory、GC.heap_info 和 jstack 能区分对象保留、类生成和线程栈耗尽。',
    '启动命令中的 -cp、module-path、JAR manifest 和容器层共同决定实际类来源；发布记录应保存 java -version、完整启动参数、制品哈希和依赖树，便于复现线上类路径。',
  ],
  'JVM GC、JIT 与 JFR 调优': [
    'baseline 要同时记录吞吐、P50/P95/P99、GC 暂停、CPU、堆占用和错误率；先确认用户感知目标，再决定是减少分配、调整堆还是更换收集器。',
    'G1 以区域和预测停顿组织回收，ZGC 侧重低停顿与大堆，但两者都要支付标记、移动和 CPU 成本；对象分配速率和存活集变化比收集器名称更能解释尾延迟。',
    '热点方法先由解释器收集 profile，再被 C1/C2 分层编译；基准测试需要预热并避免死代码消除，线上性能突变还要考虑去优化和类加载。',
    '用 jcmd JFR.start 或 -XX:StartFlightRecording 采集 CPU、分配、锁、IO 与 GC 事件，再按 requestId 或线程关联线程栈；JFR 结论必须绑定采样时间和流量。',
    '每次调优只改变一个假设，并在相同 workload 下比较分位、GC 次数、CPU 和内存；没有回归基准和监控的“最佳参数”很快会在下一版失效。',
  ],
  'Spring IoC、AOP 与事务源码': [
    'BeanDefinition 保存类名、作用域、依赖和初始化信息，BeanPostProcessor 可在实例前后改写对象；调试时先区分定义是否存在、实例是否创建、最终注入的是否代理。',
    'AbstractApplicationContext.refresh 依次处理配置、后处理器、BeanFactory、消息源、事件和生命周期；启动失败要按阶段读取日志，避免把代理异常误判成配置缺失。',
    'Spring AOP 通过 JDK 动态代理或 CGLIB 生成代理，外部调用先进入拦截器链；同类内部 self-invocation 直接走 this，绕过代理，因此事务、缓存和安全注解都可能失效。',
    'TransactionInterceptor 根据传播行为获取或加入事务，再在异常时按 rollbackFor 决定提交或回滚；事务中等待远程接口会延长数据库锁和连接占用时间。',
    '源码报告应记录 Bean 创建栈、代理类型、Advisor 顺序、事务资源绑定和异常传播，并用断点或集成测试验证；只引用注解名称不能证明事务真实生效。',
  ],
  'Spring Boot 自动配置与 Spring MVC': [
    'starter 通过依赖管理带入一组常用库，实际自动配置仍由 @AutoConfiguration、@ConditionalOnClass 和属性条件决定；冲突时先运行 mvn dependency:tree 或 gradle dependencies。',
    'application.yml、环境变量、命令行和默认值按固定顺序覆盖，条件评估报告会列出每个候选配置为何匹配或不匹配；排除自动配置前先确认是类冲突、属性错误还是业务配置缺失。',
    'DispatcherServlet 通过 HandlerMapping 找方法、HandlerAdapter 执行参数解析，HttpMessageConverter 负责 JSON；Filter 在 Servlet 前后，Interceptor 在控制器前后，AOP 再包裹 Bean 方法。',
    '配置项应通过 @ConfigurationProperties 做类型绑定和校验，启动时暴露实际生效值；生产服务不能依赖开发者家目录里的隐式配置文件。',
    '@WebMvcTest 适合验证控制器与序列化，@SpringBootTest 适合容器和数据库集成，真实 HTTP 冒烟验证网络与安全链；测试层级要与故障边界对齐。',
  ],
  'Spring Security、Data 与缓存边界': [
    'SecurityFilterChain 中认证、会话、CSRF、异常转换和授权过滤器有先后关系，request 最终放入 SecurityContext；自定义过滤器位置错误会让后续授权读到空身份。',
    '@PreAuthorize 或服务方法检查必须结合资源查询，例如同时校验 tenant_id 与 owner_id；仅按 URL 角色拦截无法阻止用户修改订单 ID 访问他人资源。',
    'Spring Data 的懒加载和实体关系可能生成额外 SQL，可用 Hibernate statistics、p6spy 或数据库慢日志确认 N+1；抓取策略要按查询场景设计而不是全局打开 eager。',
    '缓存键必须包含租户、权限版本和资源标识，写操作与撤权要失效相关键；缓存失败可回源，但绝不能回退到未检查权限的旧快照。',
    '数据库、缓存和消息不是天然原子资源，可用 Transactional Outbox 或补偿流程处理失败窗口；跨资源一致性要写明重复、丢失和回滚时的业务结果。',
  ],
  'MyBatis 执行链与 SQL 治理': [
    'Mapper 接口由 MapperProxy 生成调用，MethodInvocation 根据注解或 XML 找到 MappedStatement；断点应落在代理、SqlSession 和 Executor，而不是寻找不存在的实现类。',
    'SqlSessionTemplate 把 MyBatis 会话绑定到 Spring 事务和线程上下文，提交、回滚与连接关闭由外层管理；业务代码自行 openSession 容易破坏事务边界。',
    'Executor 负责缓存和语句调度，StatementHandler 处理预编译与参数，ResultSetHandler 做映射；插件会按注册顺序包装这些对象，排障时要看到最终拦截链。',
    '参数值应使用 #{} 绑定，${} 只用于经过白名单校验的动态表名或排序字段；ORDER BY 不能接受原始用户字符串，否则会形成注入或异常 SQL 结构。',
    '记录 SQL 文本、绑定参数、执行计划、返回行数和耗时，结合 EXPLAIN 判断索引与回表；批量写入要控制批次大小、事务长度和网络往返。',
  ],
  'Spring AI、Spring Cloud 与 Netty': [
    'Spring AI 的 ChatClient、Advisor、工具调用和 RAG 各自管理不同边界，模型输出必须经过 schema 校验、权限检查和业务确认；模型返回不能直接作为转账、删除或发布命令。',
    '工具调用应使用显式 allowlist、参数 schema 和最小权限凭据，高风险动作需要人工确认；工具返回的网页或数据库文本仍是不可信数据。',
    'Spring Cloud Gateway 负责路由、过滤和跨服务治理，服务发现与负载均衡选择实例；网关不应承载领域事务，重试和超时也要与下游预算统一。',
    'Netty 的 EventLoop 处理非阻塞 Channel 与 Pipeline，ByteBuf 需要明确 release；在 EventLoop 中执行阻塞数据库调用会拖慢同一线程上的大量连接。',
    '模型调用要设置连接、首 token 和总请求超时，并为限流、失败和输出解析错误设计降级；日志记录模型与提示版本，但必须脱敏用户数据。',
  ],
  'Spring 家族源码：Framework、Boot、Security、Data、Cloud': [
    'Spring Framework 的主线是 BeanDefinition、容器 refresh、AOP 代理和 MVC 分派；跨模块阅读时先固定入口和调用方向，避免在大量扩展点中失去主线。',
    'Spring Boot 通过条件自动配置把可选依赖组装成默认应用，可用 ConditionEvaluationReport 查看决策；自定义 starter 也应把默认 Bean 与用户覆盖规则写清。',
    'Spring Security 的核心是过滤器链、AuthenticationManager、SecurityContext 和授权决策；方法级授权最终仍要落到资源查询和访问拒绝处理。',
    'Spring Data 通过 Repository 代理生成查询和事务边界，实际 SQL、连接池和懒加载决定性能；源码阅读要把方法名解析、查询执行和结果映射分开。',
    'Spring Cloud 组合网关、配置、服务发现和负载均衡，Netty 提供异步网络底座；跨家族结论要记录版本和配置，不能把某个版本的私有实现当成稳定 API。',
  ],
  'Spring 流式接口：SSE、WebFlux 与背压': [
    'SSE 响应使用 text/event-stream，每条消息由 event、id、data 和空行分隔；代理和客户端都必须支持长连接，不能按普通 JSON 响应设置缓存或压缩。',
    'SseEmitter 需要设置超时、完成和错误处理，客户端断开后停止生产数据；遗漏 onCompletion 清理会留下任务、订阅和内存引用。',
    'WebFlux 使用 Reactor 的 Publisher 和事件循环，操作符链描述数据流；在 map 中调用阻塞数据库会占住少量网络线程并拖慢所有连接。',
    '背压来自下游请求量，map 适合同步转换，flatMap 的并发参数和 buffer 策略会决定积压；无限生产却无取消会把网络慢消费者变成内存泄漏。',
    '取消、客户端断线和部署停机会触发 cancellation，生产端要停止上游查询并释放连接；Nginx 的 proxy_buffering、read timeout 和 Ingress 超时也要一起验证。',
  ],
  'JDK 8 到最新 LTS：Records、Virtual Threads 与迁移': [
    'JDK 8 的 Lambda 与 Stream 建立函数式组合，但流可能惰性执行且要求无副作用；迁移到新版本仍要检查并行流、Optional 误用和日期时间行为。',
    '模块系统、var、HttpClient、文本块、Records、sealed 和模式匹配有不同正式版本与预览历史；迁移矩阵必须写明源版本、目标版本、是否预览和框架支持。',
    'Record 适合透明不可变数据载体，sealed 适合封闭类型集合和穷尽分支；二者不等于自动完成业务校验、序列化兼容或 ORM 映射。',
    'Virtual Threads 降低阻塞 IO 的线程成本，但不会加速 CPU 密集任务；synchronized 长时间占用、ThreadLocal 累积和连接池上限仍需重新压测。',
    '迁移要固定目标 LTS、容器基础镜像、编译参数和依赖版本，运行反射扫描、集成测试、GC 与 P99 压测，并保留回退镜像和预览特性开关。',
  ],
  'JVM 语言家族：Kotlin、Scala、Groovy 与 Clojure': [
    '四种语言最终都生成 JVM 字节码，但类型系统、空安全、并发模型和元编程能力不同；跨语言调用要关注装箱、默认参数、异常和泛型擦除的边界转换。',
    'Kotlin 的空安全和协程提高表达力，Spring 与 Android 互操作成熟；协程仍需结构化作用域、取消和阻塞隔离，不能用 suspend 关键字掩盖阻塞调用。',
    'Scala 的强类型函数式和集合库适合复杂数据转换，但隐式、编译时间和团队学习成本必须进入决策；类型抽象要与维护人数和调试能力匹配。',
    'Groovy 常见于构建脚本与 DSL，Clojure 强调不可变数据和函数式并发；动态语言能力越强，运行期诊断、IDE 支持和生产约束越需要明确。',
    '语言 ADR 应比较业务约束、招聘、构建、测试、性能、互操作和迁移路径，先做受限试点并定义退出条件，而不是仅凭语法喜好切换主力栈。',
  ],
  'CPython 数据模型、类型与对象': [
    '属性查找、调用、迭代和 with 都依赖 __getattribute__、__call__、__iter__、__enter__ 等特殊方法；阅读第三方库时先找协议，再找业务函数会更快。',
    '默认参数在函数定义时求值，def f(items=[]) 会跨调用共享同一列表；使用 None 作为哨兵并在函数体内创建容器，可用对象身份断言固定该行为。',
    '类型提示由 mypy、pyright 和编辑器消费，运行时不会自动验证 JSON 或环境变量；Protocol 表达结构化接口，泛型 TypeVar 保持输入输出关系。',
    'dataclass、Enum、NamedTuple 和值对象可以替换任意字典状态，__post_init__ 或工厂负责不变量；边界层先解析，内部代码再依赖稳定类型。',
    '大量小对象会形成属性字典、引用和 GC 开销，可用 __slots__ 或数据类验证收益；先用 tracemalloc、memory_profiler 或 py-spy 找到热点再优化。',
  ],
  'Python 装饰器、生成器、上下文与异步': [
    '装饰器是高阶函数，包装后应用 functools.wraps 保留名称、文档和签名元数据；权限、日志和缓存装饰器还应明确异常是否传播及结果是否缓存。',
    '生成器在 yield 处暂停并保留局部状态，适合流式文件和大结果集；调用 close 或 with 管理生成器，才能在消费者取消时释放文件和连接。',
    'with 依赖 __enter__ 与 __exit__ 成对执行，异常会传入 __exit__；@contextmanager 适合短小资源逻辑，异步资源则使用 async with 和 __aenter__。',
    'asyncio 是协作式并发，阻塞文件、requests 或数据库驱动会卡住事件循环；可用 asyncio.to_thread 隔离阻塞库，并验证线程池上限。',
    '超时和断线会抛出 CancelledError，清理逻辑要幂等且不能吞掉取消；提交事务与外部请求必须支持回滚或补偿。',
  ],
  'Python 项目、打包、uv 与依赖锁定': [
    'pyproject.toml 应声明项目名、版本、Python 范围、运行依赖和构建后端；src 布局配合包安装能避免从当前目录误导入未打包文件。',
    'uv lock 固定解析后的传递依赖和哈希，pyproject 只保留允许范围；升级依赖应产生可审查的锁文件 diff，并在 CI 使用冻结安装模式。',
    '每个项目使用独立 .venv，CI 和开发者从同一锁文件安装；容器内也不能回退到全局 pip 安装，否则本地与生产解析结果会分叉。',
    'Ruff、类型检查和 pytest 应通过统一脚本或 Makefile 运行，输出 CI 可读的结果；不要把工具版本散落在个人终端命令里。',
    '构建 wheel 后复制到多阶段运行镜像，只安装运行依赖并使用非 root 用户；启动健康检查、配置注入和优雅退出同样属于打包产物。',
  ],
  'FastAPI、Django 与 SQLAlchemy 工程': [
    'FastAPI 以类型标注、Pydantic 和依赖注入组织 API，Django 以 ORM、管理后台和约定提供完整应用；选择要基于领域复杂度、团队经验和已有生态。',
    'FastAPI 依赖可解析认证、数据库会话和配置，退出阶段必须关闭会话；依赖缓存与作用域要明确，否则同一请求可能拿到错误或过期资源。',
    'SQLAlchemy 异步会话不能跨事件循环随意共享，关系加载要观察真实 SQL 和 N+1；连接池大小、超时与回滚必须在异常路径执行。',
    'Django migration 或 Alembic 变更先在空库和旧数据副本验证，生产迁移拆分结构、回填和切换步骤，并为失败保留回滚脚本。',
    '后台任务要有幂等键、重试上限、死信和可观察状态；FastAPI BackgroundTasks 适合短任务，长任务应进入独立队列和 worker。',
  ],
  'CPython 字节码、GIL 与性能剖析': [
    'dis 可展示 LOAD_FAST、LOAD_ATTR、CALL 等指令，属性访问和函数调用比局部变量更贵；先看多次循环中的指令分布，再决定是否改写。',
    'GIL 保护 CPython 字节码执行，线程适合等待 IO，CPU 密集任务通常要用多进程或原生扩展；NumPy 等库释放 GIL 的地方仍需按 workload 验证。',
    'cProfile 适合确定性调用统计，py-spy 可低开销采样运行中进程，tracemalloc 看内存分配；工具自身开销和采样窗口必须写进结论。',
    '缓存、批量查询和减少序列化通常比局部语法微优化收益更大；缓存要限制容量、定义失效并监控命中率，不能把错误结果永久保留。',
    '用 pyperf 或固定版本的基准脚本记录解释器、依赖、数据规模和分位，修复后比较吞吐、P99 与内存，避免不同机器上的单次结果误导。',
  ],
  'Go 类型、接口、错误与 context': [
    '结构体赋值会复制字段，但 slice 只复制指针、长度和容量，map 仍共享底层数据；修改共享切片可能影响原对象，需要 append 或显式复制验证。',
    '接口值包含动态类型和值，var err error 与 typed nil 指针并不相同；小接口更易组合，接口返回方的 nil 语义要通过测试锁定。',
    'Go 错误是普通返回值，fmt.Errorf 的 %w 保留错误链，errors.Is/As 用于分类和提取；用户消息与内部日志上下文应分层。',
    'request context 应作为第一个参数传递给数据库、HTTP 和 goroutine，超时与取消沿调用链传播；把 context 保存到结构体或忽略 Done 会阻止资源释放。',
    '表驱动测试覆盖零值、错误、取消和并发边界，goroutine 测试要等待退出并配合 -race；测试失败信息要包含输入和错误链。',
  ],
  'Go goroutine、channel 与调度器': [
    '每个 goroutine 都要有取消、完成和错误返回路径，启动时用 WaitGroup 或 errgroup 明确等待；无退出的 worker 会泄漏栈、连接和引用。',
    '关闭 channel 表示不再发送，只应由唯一发送方负责；向已关闭 channel 发送会 panic，接收方应通过 ok 判断关闭并依赖 context 处理取消。',
    'select 会同时等待通信与 ctx.Done，超时要停止后续工作并释放资源；多个分支同时就绪时选择是随机的，不能把顺序当业务契约。',
    'GMP 调度由 goroutine、逻辑处理器和系统线程协作，阻塞 syscall、CPU 密集任务和锁竞争会改变调度；用 runtime/trace 和 pprof 观察实际阻塞。',
    'race detector 只在执行到竞争时报告，必须配合并发测试和压测；goroutine profile、mutex profile 与 trace 分别揭示泄漏、锁和调度问题。',
  ],
  'Go net/http、Gin 与 gRPC 工程': [
    'net/http 的 Server、Handler、Request 和 ResponseWriter 定义基础请求模型，Gin 主要提供路由与中间件组合；先掌握状态码、Header 和 context 再使用框架。',
    '中间件按注册顺序包裹 Handler，认证、日志、恢复、超时和限流互相依赖；错误处理只能写一次响应，并要保存 requestId 与 trace 上下文。',
    'Protobuf 字段编号不能随意复用，新增字段通常兼容，删除和语义变化需要版本策略；gRPC 错误使用 codes 和 details，不能只返回字符串。',
    '优雅停机先停止接受新请求，再等待 Handler 和后台任务完成，最后关闭数据库与队列；超过预算的强制退出要记录未完成任务。',
    'HTTP 与 gRPC 可以有不同 DTO，但领域规则应复用；入口建立日志和 Trace，出口统一错误映射，避免两套业务实现逐渐分叉。',
  ],
  'Go 内存、GC、竞态、pprof 与部署': [
    '逃逸分析决定对象能否留在栈上，接口装箱、闭包和返回指针可能增加堆分配；用 go build -gcflags="-m" 和 benchmark 分配数据确认，而不是机械改写。',
    'GOGC、GOMEMLIMIT 与分配速率共同影响 GC CPU 和延迟，容器内存限制必须参与实验；先减少临时对象和缓存膨胀，再调整运行时参数。',
    'CPU、heap、goroutine 和 mutex profile 回答不同问题，采样有开销且可能暴露内部信息；生产 profile 端点必须认证、限流并限定持续时间。',
    'Benchmark 记录 ns/op、B/op、allocs/op 和并发规模，比较趋势而非单次数值；加入 benchstat 与 CI 回归阈值才能防止性能悄悄退步。',
    '静态二进制或 distroless 镜像减少攻击面，但配置注入、非 root、健康探针、资源限制、日志和优雅停机仍必须齐全；容器内信号处理也要验证。',
  ],
};

const BACKEND_STEP_EXAMPLES: Record<string, readonly StepExample[]> = {};

Object.assign(BACKEND_STEP_EXAMPLES, {
  'Java 集合源码：ArrayList、HashMap 与 ConcurrentHashMap': [
    stepExample(
      '装箱对象与基本类型计数',
      'java',
      `import java.util.ArrayList;

var values = new ArrayList<Integer>();
for (int i = 0; i < 1_000_000; i++) values.add(i);
long checksum = 0;
for (Integer value : values) checksum += value.intValue();
System.out.println(values.size() + " boxed values, checksum=" + checksum);`,
      `$ jshell --class-path . boxing.java
1000000 boxed values, checksum=499999500000
集合保存的是 Integer 引用；即使数值本身很小，大量独立装箱仍会增加对象头和引用成本。`,
    ),
    stepExample(
      'ArrayList 预分配容量',
      'java',
      `import java.util.ArrayList;

var list = new ArrayList<Integer>(1_000_000);
for (int i = 0; i < 1_000_000; i++) list.add(i);
System.out.println("size=" + list.size() + ", get=" + list.get(999_999));`,
      `$ javac -d out ArrayListCapacity.java && java -cp out ArrayListCapacity
size=1000000, get=999999
预分配避免中途多次分配新数组并复制元素，但容量过大也会让空集合长期占用内存。`,
    ),
    stepExample(
      '哈希冲突定位桶',
      'java',
      `import java.util.HashMap;

record BadKey(int id) {
  @Override public int hashCode() { return 1; }
}
var map = new HashMap<BadKey, String>();
for (int i = 0; i < 10; i++) map.put(new BadKey(i), "v" + i);
System.out.println("size=" + map.size() + ", lookup=" + map.get(new BadKey(7)));`,
      `$ java HashCollision.java
size=10, lookup=v7
十个键落在同一哈希桶，查找仍正确，但比较链显著变长；实现 hashCode 时应让真实键集合尽量均匀分布。`,
    ),
    stepExample(
      '迭代期间删除触发检查',
      'java',
      `import java.util.ArrayList;
import java.util.List;

var names = new ArrayList<>(List.of("alpha", "beta", "gamma"));
for (String name : names) {
  if (name.equals("beta")) names.remove(name);
}`,
      `$ java IteratorFailure.java
Exception in thread "main" java.util.ConcurrentModificationException
	at java.base/java.util.ArrayList$Itr.checkForComodification(ArrayList.java:1096)
增强 for 使用迭代器；结构性修改后下一次遍历检查发现 modCount 不一致。`,
    ),
    stepExample(
      'JMH 固定集合访问 workload',
      'java',
      `@Benchmark
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
public int arrayListGet() {
  return array.get(ThreadLocalRandom.current().nextInt(array.size()));
}`,
      `$ java -jar target/benchmarks.jar -wi 5 -i 5 -f 1
Benchmark                 Mode  Cnt   Score   Error  Units
CollectionBenchmark.get  avgt   25   3.184 ± 0.092  ns/op
固定预热、线程和操作分布后，源码复杂度假设才转换为可比较的测量结果。`,
    ),
  ],
  'Java 泛型、异常、反射与注解': [
    stepExample(
      '擦除后的运行时类型',
      'java',
      `import java.util.*;

class TypeToken<T> {
  Class<?> erased() { return List.class; }
}
System.out.println(new TypeToken<String>().erased().getTypeName());
System.out.println(new ArrayList<String>().getClass().getTypeName());`,
      `$ jshell erased.jsh
java.util.List
java.util.ArrayList
List 的 String 实参不会进入运行时 Class；需要完整泛型信息时必须显式传入 TypeToken 或 TypeReference。`,
    ),
    stepExample(
      '异常链保留根因',
      'java',
      `try {
  throw new IllegalStateException("database unavailable");
} catch (IllegalStateException error) {
  throw new RuntimeException("load order failed: o-1042", error);
}`,
      `$ java ExceptionChain.java
java.lang.RuntimeException: load order failed: o-1042
Caused by: java.lang.IllegalStateException: database unavailable
外层异常提供业务操作，cause 保留底层失败原因。`,
    ),
    stepExample(
      '反射调用实例方法',
      'java',
      `class Greeter {
  private String greet(String name) { return "hello " + name; }
}
var method = Greeter.class.getDeclaredMethod("greet", String.class);
method.setAccessible(true);
System.out.println(method.invoke(new Greeter(), "Ada"));`,
      `$ java ReflectionProbe.java
hello Ada
反射成功绕过了编译期方法访问，但方法名、参数类型和模块开放条件都变成运行期才验证的风险。`,
    ),
    stepExample(
      '运行期保留注解',
      'java',
      `import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
@interface Route { String path(); }

@Route(path = "/orders")
class OrdersResource {}
var route = OrdersResource.class.getAnnotation(Route.class);
System.out.println(route.path());`,
      `$ java AnnotationProbe.java
/orders
只有 RUNTIME retention 的注解能被运行时反射读取；注解值本身仍需框架处理器解释。`,
    ),
    stepExample(
      'ServiceLoader 白名单插件',
      'java',
      `ServiceLoader.load(PaymentProvider.class).stream()
  .map(ServiceLoader.Provider::get)
  .filter(provider -> Set.of("alipay", "wechat").contains(provider.id()))
  .forEach(provider -> System.out.println("loaded=" + provider.id()));`,
      `$ java -cp app.jar:plugins/* PluginLoader
loaded=alipay
loaded=wechat
Provider 由显式 SPI 和 id 白名单筛选，请求参数没有机会变成任意 Class.forName。`,
    ),
  ],
  'Java 并发、AQS 与 ThreadPoolExecutor': [
    stepExample(
      'volatile 复合操作并非原子',
      'java',
      `class Counter {
  volatile int value;
  void increment() { value++; }
}
var counter = new Counter();
var pool = Executors.newFixedThreadPool(8);
for (int i = 0; i < 8; i++) pool.submit(() -> {
  for (int n = 0; n < 100_000; n++) counter.increment();
});
pool.shutdown();
pool.awaitTermination(10, TimeUnit.SECONDS);
System.out.println("value=" + counter.value);`,
      `$ java VolatileCounter.java
value=642173
预期 800000，实际更少；value++ 包含读取、加一和写回，volatile 只保证每次读写可见，不保证整体原子。`,
    ),
    stepExample(
      'LongAdder 高并发计数',
      'java',
      `var adder = new LongAdder();
var pool = Executors.newFixedThreadPool(8);
for (int i = 0; i < 8; i++) pool.submit(() -> {
  for (int n = 0; n < 250_000; n++) adder.increment();
});
pool.shutdown();
pool.awaitTermination(10, TimeUnit.SECONDS);
System.out.println("sum=" + adder.sum());`,
      `$ java LongAdderProbe.java
sum=2000000
LongAdder 把竞争分散到多个单元，最终 sum 汇合；读取结果是近似一致的快照，不适合需要每次立即精确值的业务。`,
    ),
    stepExample(
      'AQS 锁与条件等待',
      'java',
      `var lock = new ReentrantLock(true);
var ready = lock.newCondition();
var queue = new ArrayDeque<String>();
new Thread(() -> {
  lock.lock();
  try { queue.add("job-1"); ready.signalAll(); }
  finally { lock.unlock(); }
}).start();
lock.lock();
try {
  while (queue.isEmpty()) ready.await(1, TimeUnit.SECONDS);
  System.out.println("consumed=" + queue.remove());
} finally { lock.unlock(); }`,
      `$ java ConditionProbe.java
consumed=job-1
await 释放锁并进入条件队列，signal 后重新竞争锁；公平锁让等待线程按队列顺序获得机会。`,
    ),
    stepExample(
      '线程池队列与关闭状态',
      'java',
      `var executor = new ThreadPoolExecutor(
  2, 2, 0, TimeUnit.MILLISECONDS,
  new ArrayBlockingQueue<>(2),
  new ThreadPoolExecutor.AbortPolicy());
for (int i = 0; i < 5; i++) {
  try { executor.execute(() -> sleep(500)); }
  catch (RejectedExecutionException error) { System.out.println("rejected=" + i); }
}
executor.shutdown();
System.out.println("shutdown=" + executor.isShutdown());`,
      `$ java PoolProbe.java
rejected=4
shutdown=true
两个线程和两个队列槽已满，第五个任务被拒绝；有界队列把过载变成明确失败而不是无限堆积。`,
    ),
    stepExample(
      '线程转储定位锁等待',
      'powershell',
      `jcmd 4242 Thread.print | Select-String -Pattern "BLOCKED|waiting to lock|locked <" -Context 0,2
jcmd 4242 JFR.start name=contention duration=30s filename=contention.jfr`,
      `$ jcmd 4242 Thread.print
"worker-3" #31 BLOCKED
  waiting to lock monitor 0x0000000008f2a
  which is held by "worker-1"
线程转储直接给出阻塞线程与锁持有者，JFR 同时记录竞争时段供后续对照。`,
    ),
  ],
  'JVM 内存、类加载与字节码': [
    stepExample(
      'javap 查看 class 坐标',
      'powershell',
      `javac -g -d out OrderService.java
javap -classpath out -c -v OrderService |
  Select-String "major version|descriptor:|invokevirtual"`,
      `$ javap -classpath out -c -v OrderService
major version: 65
descriptor: (Ljava/lang/String;)Lcom/example/Order;
invokevirtual #7 // Method java/util/List.add
class 主版本 65 对应 Java 21；常量池和指令一起解释了实际编译目标。`,
    ),
    stepExample(
      '静态初始化失败状态',
      'java',
      `class Config {
  static final String MODE = load();
  static String load() { throw new IllegalStateException("bad config"); }
}
try { System.out.println(Config.MODE); }
catch (Throwable first) { System.out.println(first.getClass().getSimpleName()); }
try { System.out.println(Config.MODE); }
catch (Throwable second) { System.out.println(second.getClass().getSimpleName()); }`,
      `$ java InitFailure.java
ExceptionInInitializerError
NoClassDefFoundError
首次初始化把根因包为 ExceptionInInitializerError，之后对错误类型的主动使用表现为 NoClassDefFoundError。`,
    ),
    stepExample(
      '比较实际类加载器',
      'java',
      `var own = ClassLoader.getSystemClassLoader();
var stringLoader = String.class.getClassLoader();
var serviceLoader = OrderService.class.getClassLoader();
System.out.println("bootstrap=" + stringLoader);
System.out.println("service=" + serviceLoader);
System.out.println("same=" + (own == serviceLoader));`,
      `$ java LoaderProbe.java
bootstrap=null
service=jdk.internal.loader.ClassLoaders$AppClassLoader@4f3f5b24
same=true
核心类由 bootstrap loader 返回 null；同名类如果来自不同 loader，Class 身份也不同。`,
    ),
    stepExample(
      '区分堆与线程栈耗尽',
      'powershell',
      `jcmd 4242 GC.heap_info
jcmd 4242 VM.native_memory summary
jcmd 4242 Thread.print | Select-String "OutOfMemoryError|unable to create"`,
      `$ jcmd 4242 GC.heap_info
garbage-first heap total 1048576K, used 402188K
$ jcmd 4242 VM.native_memory summary
Java Heap committed=1048576K
堆还有余量，线程创建失败就不能继续盲目扩大 -Xmx，应检查线程数与每线程栈占用。`,
    ),
    stepExample(
      '保存可复现类路径',
      'powershell',
      `mvn dependency:tree -DoutputFile=dependency-tree.txt
Get-Content target/classes/META-INF/MANIFEST.MF
java -XX:+PrintFlagsFinal -version | Select-String "UseCompressedOops|MaxHeapSize"`,
      `$ mvn dependency:tree -DoutputFile=dependency-tree.txt
BUILD SUCCESS
$ java -XX:+PrintFlagsFinal -version
bool UseCompressedOops = true
依赖树、manifest 和 JVM 参数共同说明运行时类与内存配置，单看 import 无法复现启动环境。`,
    ),
  ],
  'JVM GC、JIT 与 JFR 调优': [
    stepExample(
      '固定 JFR 基线窗口',
      'powershell',
      `jcmd 4242 JFR.start name=baseline settings=profile duration=120s filename=baseline.jfr
jcmd 4242 JFR.check
Start-Sleep -Seconds 120
jfr summary baseline.jfr | Select-String "GarbageCollection|ExecutionSample"`,
      `$ jcmd 4242 JFR.check
Recording 1: name=baseline duration=120s
$ jfr summary baseline.jfr
jdk.GarbageCollection 117
jdk.ExecutionSample 12488
基线同时覆盖 GC 与 CPU 采样，记录时间和流量后才能与下一次实验比较。`,
    ),
    stepExample(
      'G1 回收停顿采样',
      'powershell',
      `jstat -gcutil 4242 1000 20
jcmd 4242 GC.heap_info | Select-String "used|capacity"`,
      `$ jstat -gcutil 4242 1000 20
  S0     S1     E      O      M     YGC     YGCT    FGC    FGCT     GCT
  0.00  72.31  48.10  61.22  94.10    41    1.284     0    0.000    1.284
20 秒窗口内年轻代回收 41 次、总停顿 1.284 秒；老年代未满，不能仅因 GC 次数多就切换收集器。`,
    ),
    stepExample(
      '观察热点编译与去优化',
      'powershell',
      `java -XX:+PrintCompilation -XX:+UnlockDiagnosticVMOptions app.jar |
  Select-String "OrderService|made not entrant" | Select-Object -First 12`,
      `$ java -XX:+PrintCompilation app.jar
 18423  112 %     3       OrderService::price :: lambda$new$0
 20117  214       4       OrderService::price (18 bytes)
 24002  214       4       OrderService::price (18 bytes)   made not entrant
方法先由 C1 编译，随后 C2 优化；made not entrant 说明旧代码失效，基准必须经过预热才能观察稳定阶段。`,
    ),
    stepExample(
      'JFR 汇总定位分配压力',
      'powershell',
      `jfr summary checkout.jfr |
  Select-String "GarbageCollection|ObjectAllocationSample|ThreadPark"
jfr print --events jdk.ObjectAllocationSample --stack-depth 8 checkout.jfr |
  Select-Object -First 40`,
      `$ jfr print --events jdk.ObjectAllocationSample checkout.jfr
jdk.ObjectAllocationSample {
  objectClass = java.util.ArrayList$Itr
  weight = 1.2 GB
  stackTrace = java.util.ArrayList.iterator()
}
采样把分配热点定位到迭代器创建，后续修复应验证分配率和 GC 停顿是否同时下降。`,
    ),
    stepExample(
      '同 workload 回归对比',
      'powershell',
      `k6 run --vus 50 --duration 5m checkout.js | Tee-Object before.txt
java -XX:MaxGCPauseMillis=150 -jar app.jar
k6 run --vus 50 --duration 5m checkout.js | Tee-Object after.txt
Get-Content before.txt,after.txt | Select-String "p(95)|p(99)|http_req_failed"`,
      `before.txt: http_req_duration p(95)=241ms p(99)=402ms
after.txt:  http_req_duration p(95)=238ms p(99)=361ms
http_req_failed: before=0.11% after=0.08%
相同负载、数据和镜像下，尾延迟改善但吞吐略降；结论必须连同资源曲线和适用条件一起保存。`,
    ),
  ],
  'Spring IoC、AOP 与事务源码': [
    stepExample(
      '读取 BeanDefinition 清单',
      'java',
      `try (var context = new AnnotationConfigApplicationContext(AppConfig.class)) {
  for (String name : context.getBeanDefinitionNames()) {
    var definition = context.getBeanFactory().getBeanDefinition(name);
    System.out.println(name + " scope=" + definition.getScope());
  }
}`,
      `$ ./mvnw -q exec:java -Dexec.mainClass=BeanProbe
appConfig scope=
orderService scope=
transactionManager scope=
BeanDefinition 在实例创建前已经存在；名称、作用域和依赖先由容器解析，再进入 Bean 创建阶段。`,
    ),
    stepExample(
      '容器刷新阶段日志',
      'powershell',
      `./mvnw spring-boot:run -Dspring-boot.run.arguments=--debug |
  Select-String "Refreshing|BeanFactory|Started .*Application" -Context 0,1`,
      `$ ./mvnw spring-boot:run --debug
Refreshing org.springframework.context.annotation.AnnotationConfigApplicationContext
Bean factory initialized and post-processors registered
Started OrderApplication in 3.842 seconds
启动日志按 refresh 阶段展开，失败位置可以落在配置、后处理器、Bean 初始化或 Web 服务器。`,
    ),
    stepExample(
      '自调用绕过事务代理',
      'java',
      `@Service
class OrderService {
  @Transactional
  public void updateOrder() { insertsAudit(); }
  @Transactional
  public void insertsAudit() { repository.insertAudit("o-1042"); }
}
void submit() { service.updateOrder(); }`,
      `$ ./mvnw -Dtest=SelfInvocationTest test
FAIL: audit row missing after forced failure
外部 submit 调用进入代理，但 updateOrder 内部 this.insertsAudit 绕过代理，第二次事务注解没有机会生效。`,
    ),
    stepExample(
      '事务资源绑定跟踪',
      'powershell',
      `./mvnw -Dlogging.level.org.springframework.transaction=TRACE test -Dtest=OrderTransactionTest |
  Select-String "Creating new transaction|Acquired Connection|Initiating transaction commit"`,
      `$ ./mvnw -Dlogging.level.org.springframework.transaction=TRACE test
Creating new transaction with name [submitOrder]
Acquired Connection for JDBC transaction
Initiating transaction commit
Trace 显示连接获取、事务开始与提交顺序，集成测试证明拦截器真正进入调用链。`,
    ),
    stepExample(
      '事务失败证据夹具',
      'java',
      `@SpringBootTest
class OrderTransactionTest {
  @Test
  void rollsBackOrderAndAudit() {
    assertThatThrownBy(() -> orders.submit("o-1042"))
      .hasMessageContaining("forced failure");
    assertThat(orders.count("o-1042")).isZero();
    assertThat(audit.count("o-1042")).isZero();
  }
}`,
      `$ ./mvnw -Dtest=OrderTransactionTest test
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
业务行与审计行都回滚，说明事务边界覆盖两条写入；只检查返回值不能证明数据库状态。`,
    ),
  ],
  'Spring Boot 自动配置与 Spring MVC': [
    stepExample(
      '解析启动器实际依赖',
      'powershell',
      `./mvnw dependency:tree -Dincludes=org.springframework.boot,com.fasterxml.jackson.core |
  Tee-Object dependency-tree.txt`,
      `$ ./mvnw dependency:tree -Dincludes=org.springframework.boot
spring-boot-starter-web:3.5.8
\- spring-boot-starter-json:3.5.8
   \- jackson-databind:2.19.2
starter 带入一组兼容依赖；排障应看解析树中的实际版本和排除项。`,
    ),
    stepExample(
      '条件评估报告',
      'powershell',
      `java -jar app.jar --debug |
  Select-String "DataSourceAutoConfiguration|JdbcTemplateAutoConfiguration" -Context 0,3`,
      `$ java -jar app.jar --debug
DataSourceAutoConfiguration matched
  @ConditionalOnClass found required class javax.sql.DataSource
JdbcTemplateAutoConfiguration missing bean DataSource
条件报告说明候选配置为何匹配或跳过，比直接 exclude 更能定位依赖与属性问题。`,
    ),
    stepExample(
      '验证 MVC 分派结果',
      'powershell',
      `curl.exe -i http://localhost:8080/api/orders/o-404
curl.exe -i -H "Accept: application/problem+json" http://localhost:8080/api/orders/o-1042`,
      `$ curl.exe -i http://localhost:8080/api/orders/o-404
HTTP/1.1 404
Content-Type: application/problem+json
{"type":"about:blank","title":"Not Found","status":404}
真实 HTTP 响应同时验证 DispatcherServlet 分派、状态码、内容协商和统一异常处理。`,
    ),
    stepExample(
      '命令行覆盖配置',
      'powershell',
      `$env:SERVER_PORT='9090'
java -jar app.jar --server.port=9191 --management.endpoints.web.exposure.include=health
curl.exe -s http://localhost:9191/actuator/health`,
      `$ java -jar app.jar --server.port=9191
Tomcat started on port 9191
$ curl.exe -s http://localhost:9191/actuator/health
{"status":"UP","groups":["liveness","readiness"]}
命令行参数覆盖环境变量；最终端口可从启动日志和健康端点交叉确认。`,
    ),
    stepExample(
      'MVC 切片测试',
      'java',
      `@WebMvcTest(OrderController.class)
class OrderControllerTest {
  @Autowired MockMvc mvc;
  @Test
  void returnsProblemDetailForMissingOrder() throws Exception {
    mvc.perform(get("/api/orders/o-404"))
      .andExpect(status().isNotFound())
      .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));
  }
}`,
      `$ ./mvnw -Dtest=OrderControllerTest test
Tests run: 1, Failures: 0, Errors: 0
切片测试只启动 MVC 相关 Bean，快速验证路由、序列化和错误映射；数据库风险由集成测试覆盖。`,
    ),
  ],
});

Object.assign(BACKEND_STEP_EXAMPLES, {
  'Spring Security、Data 与缓存边界': [
    stepExample(
      '过滤链结果对照',
      'powershell',
      `curl.exe -i -s http://localhost:8080/api/orders/o-1042
curl.exe -i -s -u analyst:secret http://localhost:8080/api/orders/o-1042`,
      `$ curl.exe -i -s http://localhost:8080/api/orders/o-1042
HTTP/1.1 401
WWW-Authenticate: Basic realm="orders"
$ curl.exe -i -s -u analyst:secret http://localhost:8080/api/orders/o-1042
HTTP/1.1 200
匿名请求在认证过滤器处被拒绝，凭证请求继续通过会话、异常与授权过滤器。`,
    ),
    stepExample(
      '对象级授权拒绝越租户',
      'bash',
      `curl -s -o /tmp/order.json -w "%{http_code}" \
  -u tenant-b:secret http://localhost:8080/api/orders/o-1042`,
      `$ curl -s -o /tmp/order.json -w "%{http_code}" -u tenant-b:secret \
  http://localhost:8080/api/orders/o-1042
403
$ cat /tmp/order.json
{"code":"ORDER_ACCESS_DENIED","retryable":false}
资源查询同时校验 tenant_id；只拥有普通用户角色不能读取其他租户订单。`,
    ),
    stepExample(
      'Hibernate 统计发现 N+1',
      'yaml',
      `spring:
  jpa:
    properties:
      hibernate.generate_statistics: true
logging:
  level:
    org.hibernate.engine.internal.StatisticalLoggingSessionEventListener: INFO`,
      `$ ./mvnw test -Dtest=OrderQueryTest
Session Metrics: 1 JPA entity load, 26 JDBC statements
一次订单列表返回 25 行却执行 26 条 SQL，统计日志直接暴露逐行加载的 N+1。`,
    ),
    stepExample(
      '撤权后缓存必须失效',
      'bash',
      `redis-cli SET auth:tenant-a:u-7 '{"role":"admin"}' EX 600
redis-cli DEL auth:tenant-a:u-7
curl -s -o /dev/null -w "%{http_code}" -u tenant-a:u-7:secret \
  http://localhost:8080/api/orders/o-1042`,
      `$ redis-cli SET auth:tenant-a:u-7 '{"role":"admin"}' EX 600
OK
$ redis-cli DEL auth:tenant-a:u-7
(integer) 1
$ curl ... -w "%{http_code}"
403
撤权动作删除角色缓存，下一次请求回源权限存储并得到拒绝结果。`,
    ),
    stepExample(
      '订单与 Outbox 同事务',
      'sql',
      `BEGIN;
INSERT INTO orders(id, tenant_id, status, amount)
VALUES ('o-1042', 'tenant-a', 'submitted', 259.00);
INSERT INTO outbox(event_id, aggregate_id, event_type, payload)
VALUES ('e-1042', 'o-1042', 'OrderSubmitted', '{"amount":259.00}');
COMMIT;
SELECT count(*) AS events FROM outbox WHERE aggregate_id='o-1042';`,
      `$ psql "$DATABASE_URL" -f submit-order.sql
BEGIN
INSERT 0 1
INSERT 0 1
COMMIT
 events
      1
业务状态和待发事件同库提交，消息网络调用不再出现在数据库事务内。`,
    ),
  ],
  'MyBatis 执行链与 SQL 治理': [
    stepExample(
      '确认 Mapper 代理类型',
      'java',
      `@SpringBootTest
class MapperProxyTest {
  @Autowired OrderMapper mapper;
  @Test void mapperIsProxy() {
    System.out.println(mapper.getClass().getName());
    assertThat(AopUtils.isAopProxy(mapper)).isTrue();
  }
}`,
      `$ ./mvnw -Dtest=MapperProxyTest test
jdk.proxy3.$Proxy74
jdk.proxy3.$Proxy92
Mapper 接口没有手写实现，Spring 与 MyBatis 组合出的代理负责把方法调用转换为映射语句。`,
    ),
    stepExample(
      '会话随事务回滚',
      'java',
      `@SpringBootTest
class MapperTransactionTest {
  @Autowired OrderMapper mapper;
  @Test @Transactional
  void rollbackLeavesNoRow() {
    mapper.insert(new OrderRow("o-1042", "submitted"));
    TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
  }
}`,
      `$ ./mvnw -Dtest=MapperTransactionTest test
Tests run: 1, Failures: 0, Errors: 0
rollbackOnly 提交阶段回滚；SqlSession 的提交与关闭由 Spring 事务适配器管理，而不是 Mapper 自行决定。`,
    ),
    stepExample(
      '插件观察最终执行链',
      'java',
      `@Intercepts(@Signature(
  type = StatementHandler.class,
  method = "prepare",
  args = {Connection.class, Integer.class}))
class SqlAuditPlugin implements Interceptor {
  public Object intercept(Invocation invocation) throws Throwable {
    var handler = (StatementHandler) invocation.getTarget();
    System.out.println("sql=" + handler.getBoundSql().getSql());
    return invocation.proceed();
  }
}`,
      `$ ./mvnw -Dtest=SqlAuditPluginTest test
sql=select id, status, amount from orders where tenant_id = ?
Tests run: 1, Failures: 0, Errors: 0
插件在 StatementHandler 层看到预处理 SQL；参数仍未被拼接到文本中，保留绑定边界。`,
    ),
    stepExample(
      '拒绝拼接注入片段',
      'java',
      `@Test
void rejectsUntrustedOrderBy() {
  assertThatThrownBy(() -> repository.findPage("id desc; drop table orders"))
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessageContaining("unsupported sort");
  assertThat(repository.findPage("created_at desc")).hasSize(20);
}`,
      `$ ./mvnw -Dtest=SafeSortTest test
Tests run: 2, Failures: 0, Errors: 0
排序列只接受枚举映射后的固定白名单；普通筛选参数继续使用 #{} 预编译绑定。`,
    ),
    stepExample(
      '执行计划对比索引',
      'sql',
      `EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, amount
FROM orders
WHERE tenant_id = 'tenant-a' AND status = 'submitted'
ORDER BY created_at DESC
LIMIT 20;`,
      `$ psql "$DATABASE_URL" -f explain-orders.sql
Limit (actual time=1.842..2.104 rows=20 loops=1)
  -> Index Scan using idx_orders_tenant_status_created
       Buffers: shared hit=38
查询命中组合索引，读取 20 行而非扫描整表；耗时和缓冲区数据可进入慢查询治理记录。`,
    ),
  ],
  'Spring AI、Spring Cloud 与 Netty': [
    stepExample(
      '模型输出先做结构校验',
      'java',
      `record RefundDecision(boolean approved, String reason) {}
var raw = chatClient.prompt()
  .user("Return refund decision JSON for order o-1042")
  .call().content();
var decision = objectMapper.readValue(raw, RefundDecision.class);
if (decision.approved()) throw new IllegalStateException("approval requires operator");
System.out.println("reason=" + decision.reason());`,
      `$ ./mvnw -Dtest=RefundDecisionTest test
reason=damaged package
Tests run: 1, Failures: 0, Errors: 0
模型文本先反序列化为受限记录并校验；即使模型建议退款，高风险批准仍由业务规则或人工完成。`,
    ),
    stepExample(
      '工具白名单与参数 schema',
      'json',
      `{
  "tools": [
    { "name": "getOrder", "readOnly": true, "required": ["orderId"] },
    { "name": "createRefundDraft", "requiresConfirmation": true }
  ],
  "denied": ["deleteOrder", "shell", "httpFetchAnyUrl"]
}`,
      `$ jq '.tools[].name, .denied[]' agent-tools.json
"getOrder"
"createRefundDraft"
"deleteOrder"
"shell"
"httpFetchAnyUrl"
Agent 只能看到两个业务工具，删除、Shell 和任意 URL 抓取不在可调用集合中。`,
    ),
    stepExample(
      '网关路由与超时',
      'yaml',
      `spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: http://orders-service:8080
          predicates: [Path=/api/orders/**]
          filters:
            - StripPrefix=1
            - name: CircuitBreaker
              args: { name: ordersCb }
      httpclient:
        connect-timeout: 500
        response-timeout: 2s`,
      `$ ./mvnw spring-boot:run
RouteDefinition{id='orders', uri=http://orders-service:8080}
Mapped route: Path=/api/orders/** -> orders-service
网关只负责入口路由、超时与熔断；订单状态和退款规则仍由业务服务维护。`,
    ),
    stepExample(
      'Netty 事件循环执行链',
      'java',
      `EventLoopGroup boss = new NioEventLoopGroup(1);
EventLoopGroup workers = new NioEventLoopGroup(4);
bootstrap.group(boss, workers)
  .childHandler(new ChannelInitializer<SocketChannel>() {
    protected void initChannel(SocketChannel channel) {
      channel.pipeline()
        .addLast(new LineBasedFrameDecoder(4096))
        .addLast(new StringDecoder(StandardCharsets.UTF_8))
        .addLast(new EchoHandler());
    }
  });`,
      `$ java -jar netty-echo.jar
boss threads=1
worker threads=4
channel=o-1042 pipeline=[LineBasedFrameDecoder,StringDecoder,EchoHandler]
短回调在 worker EventLoop 执行；阻塞数据库工作必须切到受控线程池，否则会占用同线程其他连接。`,
    ),
    stepExample(
      '模型与微服务联合超时',
      'powershell',
      `curl.exe -N --max-time 8 http://localhost:8080/api/chat/orders/O-1042
curl.exe -s http://localhost:8080/actuator/metrics/resilience4j.circuitbreaker.state`,
      `$ curl.exe -N --max-time 8 http://localhost:8080/api/chat/orders/O-1042
event: token
data: order O-1042 is submitted
event: done
data: {"finishReason":"complete"}
首 token、总请求和下游服务各有预算；超时后日志保留模型版本、traceId 与降级原因。`,
    ),
  ],
  'Spring 家族源码：Framework、Boot、Security、Data、Cloud': [
    stepExample(
      '从 refresh 入口追容器',
      'powershell',
      `rg -n "void refresh\\(|invokeBeanFactoryPostProcessors|finishBeanFactoryInitialization" \
  spring-framework/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java`,
      `$ rg -n "void refresh\\(" AbstractApplicationContext.java
745: public void refresh() throws BeansException, IllegalStateException {
748:   invokeBeanFactoryPostProcessors(beanFactory);
793:   finishBeanFactoryInitialization(beanFactory);
源码坐标显示 refresh 的方法边界与关键调用顺序，后续断点可以沿这些行进入。`,
    ),
    stepExample(
      'Boot 条件决策证据',
      'powershell',
      `java -jar app.jar --debug |
  Select-String "OpenTelemetryAutoConfiguration|DataSourceAutoConfiguration" -Context 0,4`,
      `$ java -jar app.jar --debug
OpenTelemetryAutoConfiguration matched
  @ConditionalOnClass found OpenTelemetry
DataSourceAutoConfiguration matched
  @ConditionalOnProperty(spring.datasource.url) found value
条件报告把自动配置决策变成可复核证据，而不是只凭 starter 名称猜测。`,
    ),
    stepExample(
      'Security 过滤器顺序',
      'powershell',
      `./mvnw -Dlogging.level.org.springframework.security.web.FilterChainProxy=DEBUG test |
  Select-String "Security filter chain|Securing|Mapped to"`,
      `$ ./mvnw -Dlogging.level.org.springframework.security.web.FilterChainProxy=DEBUG test
Security filter chain: any request
  SecurityContextHolderFilter
  AuthorizationFilter
  ExceptionTranslationFilter
过滤器实际顺序决定身份何时进入上下文、异常如何转为 401/403。`,
    ),
    stepExample(
      'Repository 代理入口',
      'java',
      `System.out.println(orders.getClass().getName());
System.out.println(AopUtils.isAopProxy(orders));
System.out.println(Arrays.toString(orders.getClass().getInterfaces()));`,
      `$ ./mvnw -Dtest=RepositoryProxyTest test
jdk.proxy3.$Proxy103
true
[interface com.example.OrderRepository, interface org.springframework.data.repository.Repository]
Repository 方法是代理翻译为查询；事务、SQL 和结果映射发生在代理之后的执行链。`,
    ),
    stepExample(
      'Gateway 实际路由快照',
      'powershell',
      `curl.exe -s localhost:8080/actuator/gateway/routes |
  ConvertFrom-Json | Select-Object route_id, uri, order`,
      `$ curl.exe -s localhost:8080/actuator/gateway/routes
route_id uri                      order
-------- ---                      -----
orders   http://orders-service:8080 0
payments http://payments-service:8080 0
运行中的路由表和顺序可查询；源码阅读或发布排障以实际暴露路由快照为准。`,
    ),
  ],
  'Spring 流式接口：SSE、WebFlux 与背压': [
    stepExample(
      '检查 SSE 协议帧',
      'bash',
      `curl -N -H 'Accept: text/event-stream' \
  http://localhost:8080/api/orders/o-1042/events`,
      `$ curl -N -H 'Accept: text/event-stream' \
  http://localhost:8080/api/orders/o-1042/events
event: status
id: evt-17
data: {"status":"submitted"}

event: done
data: {}
响应保持 text/event-stream，每条事件以空行结束；代理缓存和缓冲会破坏实时性。`,
    ),
    stepExample(
      'SseEmitter 生命周期清理',
      'java',
      `var emitter = new SseEmitter(30_000L);
var subscription = events.subscribe(event -> {
  try { emitter.send(SseEmitter.event().name("status").data(event)); }
  catch (IOException error) { emitter.completeWithError(error); }
});
emitter.onCompletion(subscription::dispose);
emitter.onTimeout(() -> { subscription.dispose(); emitter.complete(); });
return emitter;`,
      `$ curl -N http://localhost:8080/api/events
event: status
data: {"orderId":"o-1042","status":"paid"}
客户端断开后 subscription disposed；超时和完成回调释放上游订阅。`,
    ),
    stepExample(
      'WebFlux 有界流',
      'java',
      `@GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
Flux<ServerSentEvent<OrderEvent>> events() {
  return repository.streamByTenant("tenant-a")
    .take(100)
    .timeout(Duration.ofSeconds(20))
    .map(event -> ServerSentEvent.builder(event).id(event.id()).build());
}`,
      `$ ./mvnw test -Dtest=OrderEventStreamTest
events=100
terminal=complete
Tests run: 1, Failures: 0, Errors: 0
取 100 条和 20 秒超时限制流长度；下游取消会沿 Publisher 向上游传播。`,
    ),
    stepExample(
      'Nginx 关闭流式缓冲',
      'nginx',
      `location /api/events/ {
  proxy_pass http://orders_upstream;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 65s;
  add_header X-Accel-Buffering no;
}`,
      `$ nginx -t && nginx -s reload
nginx: configuration file /etc/nginx/nginx.conf test is successful
$ curl -N -i https://orders.test/api/events/o-1042
HTTP/2 200
content-type: text/event-stream
代理关闭缓冲和缓存，长连接超时高于服务端事件间隔。`,
    ),
    stepExample(
      '慢消费者触发取消',
      'javascript',
      `import http from 'k6/http';
export default function () {
  const response = http.get('http://localhost:8080/api/events', {
    timeout: '5s',
    responseType: 'text',
  });
  console.log('bytes=' + response.body.length + ' status=' + response.status);
}`,
      `$ k6 run --vus 20 --duration 30s slow-sse.js
bytes=8192 status=200
bytes=4096 status=200
http_req_duration: p(95)=4.82s
慢消费者超时后连接取消，服务端发出的完成事件和残留订阅数量应回到基线。`,
    ),
  ],
  'JDK 8 到最新 LTS：Records、Virtual Threads 与迁移': [
    stepExample(
      'Stream 惰性与副作用',
      'java',
      `var names = List.of("beta", "alpha", "gamma");
var visited = new ArrayList<String>();
long count = names.stream()
  .peek(visited::add)
  .filter(name -> name.startsWith("a"))
  .count();
System.out.println("count=" + count + ", visited=" + visited);`,
      `$ java StreamProbe.java
count=1, visited=[]
终端 count 短路后没有继续遍历，peek 的副作用没有出现；Stream 不应承担业务写入。`,
    ),
    stepExample(
      'jdeps 扫描模块与依赖',
      'powershell',
      `jdeps --multi-release 21 --ignore-missing-deps --print-module-deps app.jar
jdeps --multi-release 21 -s app.jar | Select-String "java.sql|jdk.unsupported"`,
      `$ jdeps --multi-release 21 --print-module-deps app.jar
java.base,java.logging,java.sql
$ jdeps -s app.jar
app.jar -> java.sql
迁移工具列出运行时模块依赖，裁剪镜像前仍需集成测试反射与动态加载路径。`,
    ),
    stepExample(
      'Record 与 sealed 穷尽分支',
      'java',
      `sealed interface Payment permits CardPayment, CashPayment {}
record CardPayment(String last4) implements Payment {}
record CashPayment() implements Payment {}

String label(Payment payment) {
  return switch (payment) {
    case CardPayment card -> "card:" + card.last4();
    case CashPayment cash -> "cash";
  };
}
System.out.println(label(new CardPayment("4242")));`,
      `$ javac --release 21 PaymentDemo.java && java PaymentDemo
card:4242
sealed 类型允许编译器检查 switch 是否覆盖全部允许实现；record 只表达透明数据。`,
    ),
    stepExample(
      '虚拟线程与阻塞调用',
      'java',
      `try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
  var started = System.nanoTime();
  var tasks = IntStream.range(0, 1000)
    .mapToObj(i -> executor.submit(() -> { Thread.sleep(200); return i; }))
    .toList();
  for (var task : tasks) task.get();
  System.out.println("elapsedMs=" + (System.nanoTime() - started) / 1_000_000);
}`,
      `$ java VirtualThreadProbe.java
elapsedMs=352
一千个阻塞任务共享较少载体线程；CPU 密集任务不会因虚拟线程变快，连接池上限仍要重新设计。`,
    ),
    stepExample(
      '迁移矩阵与回退镜像',
      'yaml',
      `source_jdk: 17
target_jdk: 21
preview_features: false
framework_versions:
  spring_boot: 3.5.8
checks:
  - compile
  - reflection_scan
  - integration
  - jfr_p99
rollback_image: registry.example/orders@sha256:4f2a`,
      `$ yq '.target_jdk, .preview_features, .rollback_image' migration.yaml
21
false
registry.example/orders@sha256:4f2a
迁移目标、检查项和回退镜像固定在同一清单，发布后可按真实制品对比。`,
    ),
  ],
  'JVM 语言家族：Kotlin、Scala、Groovy 与 Clojure': [
    stepExample(
      'Kotlin 编译到 JVM 字节码',
      'kotlin',
      `data class Order(val id: String, val amount: Int)
fun main() {
  val order = Order("o-1042", 259)
  println("order=" + order.copy(amount = 199))
}`,
      `$ kotlinc order.kt -include-runtime -d order.jar
$ java -jar order.jar
order=Order(id=o-1042, amount=199)
$ javap -classpath order.jar Order
public final class Order
源码语言不同，最终仍生成 JVM 类、字段和方法描述符。`,
    ),
    stepExample(
      'Kotlin 空安全与协程取消',
      'kotlin',
      `suspend fun load(id: String?): String {
  requireNotNull(id) { "id is required" }
  return coroutineScope {
    val job = launch { delay(10_000) }
    delay(50)
    job.cancelAndJoin()
    "loaded:" + id
  }
}
println(runBlocking { load("o-1042") })`,
      `$ kotlinc -cp kotlinx-coroutines.jar probe.kt -d probe.jar
$ java -cp probe.jar:kotlinx-coroutines.jar ProbeKt
loaded:o-1042
可空参数在入口被显式校验，等待任务在结构化作用域内取消并等待退出。`,
    ),
    stepExample(
      'Scala 类型安全转换',
      'scala',
      `case class Order(id: String, amount: BigDecimal, currency: String)
val raw = Map("id" -> "o-1042", "amount" -> "259.00", "currency" -> "CNY")
val order = for {
  id <- raw.get("id")
  amount <- raw.get("amount").flatMap(v => scala.util.Try(BigDecimal(v)).toOption)
  currency <- raw.get("currency")
} yield Order(id, amount, currency)
println(order)`,
      `$ scala parse-order.scala
Some(Order(o-1042,259.00,CNY))
Option 将缺失字段转成无结果，BigDecimal 转换失败也不会抛到外层；类型边界在编译期可见。`,
    ),
    stepExample(
      'Groovy 与 Clojure 脚本对照',
      'bash',
      `groovy -e 'def orders = [[id:"o-1", amount:100], [id:"o-2", amount:250]]; println orders.findAll { it.amount > 120 }'
clojure -e '(->> [{:id "o-1" :amount 100} {:id "o-2" :amount 250}] (filter #(> (:amount %) 120)) println)'`,
      `$ groovy -e '...'
[[id:o-2, amount:250]]
$ clojure -e '...'
({:id o-2, :amount 250})
Groovy 适合构建脚本与动态 DSL，Clojure 的表达式以不可变数据结构为中心。`,
    ),
    stepExample(
      '语言选型可复核评分',
      'python',
      `import json

options = {
  "kotlin": {"hiring": 4, "learning": 4, "interop": 5, "latency": 4},
  "scala": {"hiring": 2, "learning": 2, "interop": 4, "latency": 5},
}
for name, score in options.items():
    total = score["hiring"] + score["learning"] + score["interop"] + score["latency"]
    print(json.dumps({"language": name, "score": total, "evidence": "pilot-2026-11"}))`,
      `$ python language-score.py
{"language": "kotlin", "score": 17, "evidence": "pilot-2026-11"}
{"language": "scala", "score": 13, "evidence": "pilot-2026-11"}
评分不是结论本身，必须连同招聘样本、试点代码和退出条件写入 ADR。`,
    ),
  ],
});

Object.assign(BACKEND_STEP_EXAMPLES, {
  'CPython 数据模型、类型与对象': [
    stepExample(
      '协议驱动属性访问',
      'python',
      `class Order:
    def __init__(self, order_id: str) -> None:
        self.order_id = order_id

    def __getattribute__(self, name: str):
        if name == "status":
            return "submitted"
        return object.__getattribute__(self, name)

order = Order("o-1042")
print(order.order_id, order.status)`,
      `$ python protocol_probe.py
o-1042 submitted
属性访问先经过 __getattribute__；框架常用这一协议实现代理、延迟加载和字段映射，但异常会直接改变普通点号读取。`,
    ),
    stepExample(
      '默认参数跨调用共享',
      'python',
      `def append_order(order_id: str, bucket: list[str] = []) -> list[str]:
    bucket.append(order_id)
    return bucket

first = append_order("o-1042")
second = append_order("o-1043")
print(first is second, second)`,
      `$ python default_arg.py
True ['o-1042', 'o-1043']
默认列表在函数定义时创建一次；改为 bucket: list[str] | None = None 并在函数体内初始化，才能隔离每次调用。`,
    ),
    stepExample(
      'Protocol 固定结构化接口',
      'python',
      `from typing import Protocol

class OrderReader(Protocol):
    def load(self, order_id: str) -> dict[str, object]: ...

class MemoryOrders:
    def load(self, order_id: str) -> dict[str, object]:
        return {"id": order_id, "status": "submitted"}

def render(reader: OrderReader) -> str:
    return str(reader.load("o-1042")["status"])

print(render(MemoryOrders()))`,
      `$ mypy --strict protocol_probe.py
Success: no issues found in 1 source file
$ python protocol_probe.py
submitted
Protocol 描述结构化接口，类型检查器在开发期验证方法形状；运行时并未自动校验外部 JSON。`,
    ),
    stepExample(
      'dataclass 守住金额不变量',
      'python',
      `from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class Order:
    order_id: str
    amount: Decimal

    def __post_init__(self) -> None:
        if self.amount <= 0:
            raise ValueError("amount must be positive")

order = Order("o-1042", Decimal("259.00"))
print(order)`,
      `$ python invariant.py
Order(order_id='o-1042', amount=Decimal('259.00'))
$ python -c "from invariant import Order; from decimal import Decimal; Order('x', Decimal('0'))"
ValueError: amount must be positive
值对象在创建时验证不变量，后续代码不需要猜金额是否合法。`,
    ),
    stepExample(
      '用 tracemalloc 验证 slots',
      'python',
      `import tracemalloc

class PointDict:
    def __init__(self, x: int, y: int): self.x, self.y = x, y

class PointSlots:
    __slots__ = ("x", "y")
    def __init__(self, x: int, y: int): self.x, self.y = x, y

tracemalloc.start()
items = [PointSlots(i, i) for i in range(100_000)]
current, peak = tracemalloc.get_traced_memory()
print("current_kib=", current // 1024, "count=", len(items))`,
      `$ python slots_probe.py
current_kib= 7216 count= 100000
对比 PointDict 可看到属性字典成本；只有对象数量大且访问模式稳定时，__slots__ 的收益才值得复杂度。`,
    ),
  ],
  'Python 装饰器、生成器、上下文与异步': [
    stepExample(
      'functools.wraps 保留包装元数据',
      'python',
      `from functools import wraps
from time import perf_counter

def timed(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        started = perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            print(fn.__name__, "elapsed_ms=", round((perf_counter() - started) * 1000, 2))
    return wrapper

@timed
def load_orders() -> list[str]:
    return ["o-1042", "o-1043"]

print(load_orders())`,
      `$ python decorator_probe.py
load_orders elapsed_ms= 0.01
['o-1042', 'o-1043']
wraps 保留函数名与文档，finally 让异常路径也记录耗时；装饰器仍需明确是否吞异常或缓存结果。`,
    ),
    stepExample(
      '生成器流式读取订单',
      'python',
      `from collections.abc import Iterator

def read_orders(path: str) -> Iterator[str]:
    with open(path, encoding="utf-8") as source:
        for line in source:
            order_id = line.strip()
            if order_id:
                yield order_id

for index, order_id in enumerate(read_orders("orders.txt")):
    print(index, order_id)
    if index == 1:
        break`,
      `$ printf 'o-1\n\n o-2\no-3\n' > orders.txt
$ python generator_probe.py
0 o-1
1 o-2
循环提前退出时生成器被关闭，with 负责关闭文件；不需要把整个大文件先读成列表。`,
    ),
    stepExample(
      '上下文管理器释放连接',
      'python',
      `from contextlib import contextmanager

@contextmanager
def transaction(connection):
    try:
        connection.execute("BEGIN")
        yield connection
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise

with transaction(connection) as tx:
    tx.execute("INSERT INTO orders(id) VALUES ('o-1042')")
print("committed")`,
      `$ python transaction_probe.py
BEGIN
INSERT INTO orders(id) VALUES ('o-1042')
COMMIT
committed
异常会进入 except 并执行 ROLLBACK；上下文管理器的退出逻辑必须在成功与失败路径都成立。`,
    ),
    stepExample(
      '隔离阻塞库调用',
      'python',
      `import asyncio
import time

def blocking_io() -> str:
    time.sleep(0.2)
    return "loaded"

async def main() -> None:
    started = time.perf_counter()
    results = await asyncio.gather(*[asyncio.to_thread(blocking_io) for _ in range(10)])
    print(len(results), round(time.perf_counter() - started, 2))

asyncio.run(main())`,
      `$ python async_thread.py
10 0.2
to_thread 把阻塞调用移出事件循环；线程池上限仍约束并发，不能靠无限创建线程解决阻塞依赖。`,
    ),
    stepExample(
      '取消任务并执行清理',
      'python',
      `import asyncio

async def worker(cleanup: list[str]) -> None:
    try:
        await asyncio.sleep(60)
    except asyncio.CancelledError:
        cleanup.append("released")
        raise

async def main() -> None:
    cleanup: list[str] = []
    task = asyncio.create_task(worker(cleanup))
    await asyncio.sleep(0.01)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    print(cleanup)

asyncio.run(main())`,
      `$ python cancellation.py
['released']
清理完成后重新抛出 CancelledError，调用链知道取消已发生；吞掉取消会让上层无法正确停止。`,
    ),
  ],
  'Python 项目、打包、uv 与依赖锁定': [
    stepExample(
      'pyproject 声明运行边界',
      'toml',
      `[project]
name = "orders-service"
version = "1.4.0"
requires-python = ">=3.12,<3.14"
dependencies = ["fastapi>=0.116,<0.117", "sqlalchemy>=2.0,<2.1"]

[build-system]
requires = ["hatchling>=1.27"]
build-backend = "hatchling.build"`,
      `$ uv build --out-dir dist
Building source distribution...
Building wheel from source distribution...
Successfully built dist/orders_service-1.4.0-py3-none-any.whl
运行依赖和 Python 范围进入元数据，构建后端生成可安装 wheel。`,
    ),
    stepExample(
      '锁文件固定传递依赖',
      'powershell',
      `uv lock --upgrade-package sqlalchemy
git diff -- uv.lock | Select-String "name = |version = " | Select-Object -First 12
uv lock --check`,
      `$ uv lock --upgrade-package sqlalchemy
Resolved 42 packages in 0.18s
$ git diff -- uv.lock
name = "sqlalchemy"
version = "2.0.45"
$ uv lock --check
Resolved 42 packages, lockfile is up to date
锁文件让传递依赖升级成为可审查 diff，检查模式在 CI 中阻止隐式漂移。`,
    ),
    stepExample(
      '冻结安装保证环境一致',
      'powershell',
      `uv venv .venv --python 3.12
uv sync --frozen --extra dev
.venv\Scripts\python.exe -c "import sqlalchemy; print(sqlalchemy.__version__)"`,
      `$ uv venv .venv --python 3.12
Using CPython 3.12.8
$ uv sync --frozen --extra dev
Installed 47 packages in 412ms
$ .venv\Scripts\python.exe -c "..."
2.0.45
冻结安装拒绝重新解析锁文件，CI、开发机和镜像使用同一依赖集合。`,
    ),
    stepExample(
      '统一质量检查入口',
      'powershell',
      `uv run ruff check .
uv run mypy src
uv run pytest -q --junitxml=reports/pytest.xml
Select-String -Path reports/pytest.xml -Pattern "tests=|failures="`,
      `$ uv run ruff check .
All checks passed!
$ uv run mypy src
Success: no issues found in 18 source files
$ uv run pytest -q
42 passed in 1.84s
工具版本由项目环境固定，CI 只需执行同一入口并收集标准报告。`,
    ),
    stepExample(
      '多阶段 Python 镜像',
      'dockerfile',
      `FROM python:3.12-slim AS build
WORKDIR /src
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN pip install uv && uv build --wheel --out-dir /dist

FROM python:3.12-slim
RUN useradd --uid 10001 --create-home app
COPY --from=build /dist/*.whl /tmp/app.whl
RUN pip install --no-cache-dir /tmp/app.whl
USER 10001
CMD ["orders-api"]`,
      `$ docker build -t orders-api:dev .
$ docker run --rm --read-only orders-api:dev id
uid=10001(app) gid=10001(app)
运行镜像只安装 wheel，不包含源码目录、构建缓存和 root 运行身份。`,
    ),
  ],
  'FastAPI、Django 与 SQLAlchemy 工程': [
    stepExample(
      '框架边界对照实验',
      'python',
      `from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class OrderIn(BaseModel):
    amount: int

@app.post("/orders", status_code=201)
def create_order(order: OrderIn) -> dict[str, object]:
    return {"id": "o-1042", "amount": order.amount}

print(app.routes[-1].path, app.routes[-1].methods)`,
      `$ python framework_probe.py
/orders {'POST'}
FastAPI 以类型和依赖描述入口；Django 则提供完整应用约定、ORM 和后台，选择应基于业务与团队边界。`,
    ),
    stepExample(
      '依赖作用域关闭会话',
      'python',
      `from collections.abc import Iterator
from sqlalchemy.orm import Session

def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

@app.get("/orders/{order_id}")
def get_order(order_id: str, session: Session = Depends(get_session)):
    return session.get(Order, order_id)`,
      `$ uvicorn app:app --port 8080
INFO: GET /orders/o-1042 200 OK
INFO: session closed request_id=req-71
依赖生成器在响应后执行 finally，异常路径先回滚再关闭；缓存和作用域由 FastAPI 依赖系统管理。`,
    ),
    stepExample(
      'SQLAlchemy 观察真实 SQL',
      'python',
      `from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

engine = create_engine(DATABASE_URL, echo=True)
with Session(engine) as session:
    statement = select(Order).where(Order.tenant_id == "tenant-a").limit(20)
    rows = session.scalars(statement).all()
    print("rows=", len(rows))`,
      `$ python query_probe.py
SELECT orders.id, orders.tenant_id, orders.status
FROM orders WHERE orders.tenant_id = %(tenant_id_1)s LIMIT 20
rows= 20
echo 日志显示绑定参数与 LIMIT；N+1 或缺少索引要基于真实 SQL 和计划判断。`,
    ),
    stepExample(
      '迁移先演练再切流量',
      'powershell',
      `alembic upgrade head
alembic downgrade -1
alembic upgrade head
psql "$DATABASE_URL" -c "select version_num from alembic_version"`,
      `$ alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade 3f2a -> 8d10
$ alembic downgrade -1
INFO  [alembic.runtime.migration] Running downgrade 8d10 -> 3f2a
$ psql ... -c "select version_num from alembic_version"
 8d10
空库升级、回退和再次升级都可用，迁移脚本才能进入发布门禁。`,
    ),
    stepExample(
      '后台任务幂等键',
      'python',
      `from arq import create_pool
from arq.connections import RedisSettings

async def enqueue(order_id: str) -> None:
    redis = await create_pool(RedisSettings.from_dsn(REDIS_URL))
    await redis.enqueue_job(
        "send_order_email",
        order_id,
        _job_id="order-email:" + order_id,
    )
    print("enqueued", order_id)`,
      `$ python enqueue.py
enqueued o-1042
$ python enqueue.py
enqueued o-1042
固定 job_id 让重复投递指向同一任务；worker 端仍需保存业务幂等键并限制重试次数。`,
    ),
  ],
  'CPython 字节码、GIL 与性能剖析': [
    stepExample(
      'dis 对比属性访问成本',
      'python',
      `import dis

def from_attr(order):
    return order.amount + order.amount

def from_local(order):
    amount = order.amount
    return amount + amount

dis.dis(from_attr)
dis.dis(from_local)`,
      `$ python dis_probe.py
LOAD_FAST order
LOAD_ATTR amount
LOAD_FAST order
LOAD_ATTR amount
...
from_local 只执行一次 LOAD_ATTR，后续使用 LOAD_FAST；字节码说明成本来源，但仍需 profiling 证明热点。`,
    ),
    stepExample(
      '线程与进程执行 CPU 工作',
      'python',
      `from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from time import perf_counter

def burn(_: int) -> int:
    return sum(i * i for i in range(2_000_000))

for pool_type in (ThreadPoolExecutor, ProcessPoolExecutor):
    started = perf_counter()
    with pool_type(max_workers=4) as pool:
        list(pool.map(burn, range(4)))
    print(pool_type.__name__, round(perf_counter() - started, 2))`,
      `$ python cpu_pools.py
ThreadPoolExecutor 2.84
ProcessPoolExecutor 0.79
CPython 线程在 CPU 密集字节码上受 GIL 限制；进程绕过 GIL 但增加启动、序列化和内存成本。`,
    ),
    stepExample(
      'cProfile 定位函数热点',
      'python',
      `import cProfile
import pstats

def load_orders() -> list[int]:
    return [sum(i * i for i in range(200_000)) for _ in range(5)]

with cProfile.Profile() as profile:
    load_orders()
pstats.Stats(profile).sort_stats("cumulative").print_stats(8)`,
      `$ python profile_probe.py
         1000007 function calls in 0.842 seconds
   ncalls  tottime  cumtime  filename:lineno(function)
        5    0.801    0.801  profile_probe.py:4(<listcomp>)
cProfile 给出确定性的调用统计；开销和采样窗口要写进结论，线上再用 py-spy 低开销核验。`,
    ),
    stepExample(
      '缓存与批量查询收益',
      'python',
      `from functools import lru_cache

@lru_cache(maxsize=1024)
def exchange_rate(currency: str) -> float:
    print("db lookup", currency)
    return {"CNY": 1.0, "USD": 7.12}[currency]

for _ in range(3):
    print(exchange_rate("USD"))
print(exchange_rate.cache_info())`,
      `$ python cache_probe.py
db lookup USD
7.12
7.12
7.12
CacheInfo(hits=2, misses=1, maxsize=1024, currsize=1)
有限缓存避免重复回源；汇率变化时必须显式失效，不能把过期值永久保留。`,
    ),
    stepExample(
      'pyperf 固定回归基准',
      'powershell',
      `pyperf system tune
pyperf timeit -s "items=list(range(1000))" "sum(items)"
pyperf compare_to baseline.json current.json --table`,
      `$ pyperf timeit -s "items=list(range(1000))" "sum(items)"
Mean +- std dev: 6.42 us +- 0.21 us
$ pyperf compare_to baseline.json current.json --table
Benchmark   baseline  current  change
sum_items   6.71 us   6.42 us  -4.3%
固定解释器、机器状态和多次采样后比较变化；单次 timeit 结果不能作为发布结论。`,
    ),
  ],
});

Object.assign(BACKEND_STEP_EXAMPLES, {
  'Go 类型、接口、错误与 context': [
    stepExample(
      '切片与 map 的共享引用',
      'go',
      `package main

import "fmt"

func main() {
	source := []int{1, 2, 3}
	alias := source[:2]
	alias[0] = 99
	other := append([]int(nil), source...)
	other[1] = 88
	fmt.Println(source, alias, other)
}`,
      `$ go run slices.go
[99 88 3] [99 88] [99 88 3]
slice 复制的是描述符而不是底层数组，append 到新切片后才独立；共享写入必须明确所有权。`,
    ),
    stepExample(
      'typed nil 不等于 nil 接口',
      'go',
      `package main

import "fmt"

type AppError struct{ Code string }

func (e *AppError) Error() string { return e.Code }

func fail() error {
	var problem *AppError
	return problem
}

func main() {
	err := fail()
	fmt.Println(err == nil, err)
}`,
      `$ go run typed_nil.go
false <nil>
接口值包含动态类型 *AppError 和 nil 指针，所以接口本身非 nil；返回错误时应显式 return nil。`,
    ),
    stepExample(
      '错误链分类与提取',
      'go',
      `var ErrNotFound = errors.New("order not found")

func loadOrder(id string) error {
	return fmt.Errorf("load order %s: %w", id, ErrNotFound)
}

err := loadOrder("o-404")
fmt.Println(errors.Is(err, ErrNotFound))
var coded *AppError
fmt.Println(errors.As(err, &coded), err)`,
      `$ go run errors.go
true
false load order o-404: order not found
%w 保留错误链，errors.Is 按语义分类；用户消息与内部错误上下文应分开输出。`,
    ),
    stepExample(
      'context 截止时间向下传播',
      'go',
      `ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
defer cancel()

result := make(chan string, 1)
go func() {
	time.Sleep(200 * time.Millisecond)
	result <- "late"
}()

select {
case value := <-result:
	fmt.Println("result", value)
case <-ctx.Done():
	fmt.Println("cancelled", errors.Is(ctx.Err(), context.DeadlineExceeded))
}`,
      `$ go run context_timeout.go
cancelled true
截止时间到达后调用链收到取消；后台 goroutine 仍需检查 ctx 或把结果写入有缓冲通道以避免泄漏。`,
    ),
    stepExample(
      '表驱动测试边界条件',
      'go',
      `func TestParseAmount(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want int
		err  error
	}{
		{name: "valid", in: "259", want: 259},
		{name: "zero", in: "0", err: ErrInvalidAmount},
		{name: "text", in: "abc", err: ErrInvalidAmount},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseAmount(tc.in)
			if got != tc.want || !errors.Is(err, tc.err) {
				t.Fatalf("in=%q got=%d err=%v", tc.in, got, err)
			}
		})
	}
}`,
      `$ go test ./... -race
ok   example.com/orders  0.482s
表驱动测试覆盖成功、零值和错误文本，失败消息包含输入；-race 同时检查并发路径。`,
    ),
  ],
  'Go goroutine、channel 与调度器': [
    stepExample(
      'WaitGroup 等待 worker 退出',
      'go',
      `func process(ids []string) []string {
	results := make([]string, len(ids))
	var group sync.WaitGroup
	for i, id := range ids {
		group.Add(1)
		go func(index int, orderID string) {
			defer group.Done()
			results[index] = "ok:" + orderID
		}(i, id)
	}
	group.Wait()
	return results
}
fmt.Println(process([]string{"o-1", "o-2", "o-3"}))`,
      `$ go run workers.go
[ok:o-1 ok:o-2 ok:o-3]
每个 worker 都有 Done 路径，索引按值传入避免循环变量共享；Wait 之后才读取结果集合。`,
    ),
    stepExample(
      '唯一发送方关闭 channel',
      'go',
      `jobs := make(chan string, 2)
go func() {
	defer close(jobs)
	jobs <- "o-1042"
	jobs <- "o-1043"
}()
for orderID := range jobs {
	fmt.Println("received", orderID)
}`,
      `$ go run channel.go
received o-1042
received o-1043
close 表示不会再发送，range 在缓冲区耗尽后退出；接收方不应尝试向已关闭 channel 发送。`,
    ),
    stepExample(
      'select 同时等待结果与取消',
      'go',
      `ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
defer cancel()
results := make(chan string)
go func() {
	time.Sleep(250 * time.Millisecond)
	results <- "late"
}()
select {
case result := <-results:
	fmt.Println("result", result)
case <-ctx.Done():
	fmt.Println("stop", ctx.Err())
}`,
      `$ go run select.go
stop context deadline exceeded
select 让超时和结果竞争；超时分支返回后，发送方必须有自己的取消路径或缓冲通道。`,
    ),
    stepExample(
      'runtime trace 观察调度',
      'powershell',
      `go test -run TestScheduler -trace trace.out ./...
go tool trace -http=127.0.0.1:6060 trace.out
go tool pprof -top worker.test cpu.pprof`,
      `$ go test -trace trace.out ./...
ok   example.com/orders  1.284s
$ go tool trace -http=127.0.0.1:6060 trace.out
Serving trace at http://127.0.0.1:6060
trace 显示 goroutine 就绪、运行和阻塞窗口，CPU profile 再区分真实计算热点。`,
    ),
    stepExample(
      '竞态检测覆盖并发边界',
      'powershell',
      `go test ./... -race -count=20
go test -run TestWorkerStops -count=100 ./...
go tool pprof -top -alloc_space baseline.test alloc.out`,
      `$ go test ./... -race -count=20
ok   example.com/orders  3.921s
$ go test -run TestWorkerStops -count=100
ok   example.com/orders  0.214s
race 只在执行到竞争时报告，因此需要并发测试、重复运行和资源 profile 共同覆盖。`,
    ),
  ],
  'Go net/http、Gin 与 gRPC 工程': [
    stepExample(
      '标准库 HTTP 服务',
      'go',
      `func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": r.PathValue("id")})
	})
	server := &http.Server{Addr: ":8080", Handler: mux, ReadHeaderTimeout: 2 * time.Second}
	log.Fatal(server.ListenAndServe())
}`,
      `$ go run server.go
$ curl -s http://localhost:8080/orders/o-1042
{"id":"o-1042"}
标准库显式管理路由、Header、超时和 Server；理解这些基础后再比较框架提供的组合能力。`,
    ),
    stepExample(
      '中间件包裹请求顺序',
      'go',
      `func trace(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		requestID := r.Header.Get("X-Request-Id")
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey{}, requestID))
		next.ServeHTTP(w, r)
		log.Printf("id=%s path=%s elapsed=%s", requestID, r.URL.Path, time.Since(started))
	})
}
handler := trace(recoverer(auth(mux)))`,
      `$ curl -s -H 'X-Request-Id: req-71' http://localhost:8080/orders/o-1042
{"id":"o-1042"}
$ go run app.go
id=req-71 path=/orders/o-1042 elapsed=8.2ms
外层中间件先进入后退出，requestId 和 trace 上下文沿 Handler 链传播。`,
    ),
    stepExample(
      'gRPC 契约生成服务',
      'go',
      `service Orders {
  rpc GetOrder(GetOrderRequest) returns (OrderReply);
}

message GetOrderRequest {
  string order_id = 1;
}

message OrderReply {
  string order_id = 1;
  string status = 2;
}`,
      `$ buf lint proto
$ buf generate
$ go test ./internal/orders -race
orders/v1/orders.pb.go generated
ok   example.com/orders/internal/orders  0.318s
字段编号和消息结构生成客户端与服务端类型；删除或复用编号必须走兼容审查。`,
    ),
    stepExample(
      '优雅停机等待在途请求',
      'go',
      `server := &http.Server{Addr: ":8080", Handler: handler}
go func() {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown=%v", err)
	}
}()
server.ListenAndServe()`,
      `$ kubectl delete pod orders-api-7f9c
SIGTERM received
waiting active requests=3
shutdown complete elapsed=4.2s
停止接收新连接后等待 Handler 完成，数据库和队列在超时预算内释放；超时强制退出会记录残留。`,
    ),
    stepExample(
      'HTTP 与 gRPC 共享领域服务',
      'go',
      `type CreateOrder struct{ service *OrderService }

func (h *CreateOrder) HTTP(w http.ResponseWriter, r *http.Request) {
	var input createOrderHTTP
	_ = json.NewDecoder(r.Body).Decode(&input)
	order, err := h.service.Create(r.Context(), input.toCommand())
	writeHTTP(w, order, err)
}

func (h *CreateOrder) GRPC(ctx context.Context, req *pb.CreateRequest) (*pb.OrderReply, error) {
	order, err := h.service.Create(ctx, commandFromProto(req))
	return toProto(order), mapGRPCError(err)
}`,
      `$ go test ./internal/orders -run 'TestCreateOrder' -v
=== RUN   TestCreateOrder/HTTP
=== RUN   TestCreateOrder/GRPC
--- PASS: TestCreateOrder
HTTP 输入转换、gRPC 输入转换分别靠近入口，领域 Create 与错误语义被两种协议复用。`,
    ),
  ],
  'Go 内存、GC、竞态、pprof 与部署': [
    stepExample(
      '逃逸分析定位堆分配',
      'powershell',
      `go build -gcflags="-m=2" ./cmd/orders 2>&1 |
  Select-String "escapes to heap|does not escape" | Select-Object -First 20`,
      `$ go build -gcflags="-m=2" ./cmd/orders
./handler.go:42:18: order escapes to heap
./handler.go:47:13: response does not escape
编译器报告变量逃逸原因；接口装箱、返回指针或闭包捕获都可能让对象进入堆。`,
    ),
    stepExample(
      'GOGC 与内存上限实验',
      'powershell',
      `$env:GOGC='100'
go test -bench BenchmarkOrders -benchmem -count=5 ./...
$env:GOMEMLIMIT='256MiB'
go test -bench BenchmarkOrders -benchmem -count=5 ./...`,
      `$ go test -bench BenchmarkOrders -benchmem -count=5
BenchmarkOrders-8  1200  842ns/op  192B/op  4 allocs/op
修改 GOGC 后 CPU 与停顿变化，GOMEMLIMIT 让容器内存成为软上限；先降低临时对象，再调运行时。`,
    ),
    stepExample(
      '受保护的生产 profile',
      'bash',
      `curl -s -H "Authorization: Bearer $PROFILE_TOKEN" \
  'http://localhost:6060/debug/pprof/profile?seconds=20' -o cpu.pprof
go tool pprof -top -nodecount=20 cpu.pprof`,
      `$ go tool pprof -top cpu.pprof
      flat  flat%   sum%        cum   cum%
  1.42mins 38.10% 38.10%   1.42mins 38.10%  encoding/json.Marshal
CPU 采样显示序列化热点；profile 端点必须认证、限流并限制采样时长。`,
    ),
    stepExample(
      '基准测试防性能回退',
      'powershell',
      `go test -run '^$' -bench BenchmarkParse -benchmem -count=10 ./internal/orders |
  tee new.txt
benchstat baseline.txt new.txt`,
      `$ benchstat baseline.txt new.txt
name        old time/op  new time/op  delta
Parse-8     842ns       791ns        -6.07%
name        old allocs  new allocs   delta
Parse-8     4.00        3.00         -25.00%
benchstat 比较多次样品与变化范围，时间和分配两个维度同时进入回归判断。`,
    ),
    stepExample(
      '最小 Go 运行镜像',
      'dockerfile',
      `FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /orders ./cmd/orders

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /orders /orders
USER nonroot:nonroot
ENTRYPOINT ["/orders"]`,
      `$ docker build -t orders-api:sha-4f2a .
$ docker run --rm --read-only orders-api:sha-4f2a
orders-api listening on :8080
$ docker image inspect orders-api:sha-4f2a --format '{{.Config.User}}'
nonroot:nonroot
运行层不包含编译器和源码，非 root、只读根文件系统与健康探针仍需在编排层验证。`,
    ),
  ],
});

export const PROGRAMMING_BACKEND_COURSES: readonly ProgrammingCourseSeed[] =
  PROGRAMMING_BACKEND_COURSES_BASE.map((course) => {
    const details = BACKEND_STEP_DETAILS[course.name];
    const examples = BACKEND_STEP_EXAMPLES[course.name];
    if (!details || details.length !== course.steps.length) {
      throw new Error(`P06-P08 手写步骤补充不完整：${course.name}`);
    }
    if (!examples || examples.length !== course.steps.length) {
      throw new Error(`P06-P08 步骤示例补充不完整：${course.name}`);
    }
    return {
      ...course,
      contentStatus: 'reviewed' as const,
      steps: course.steps.map((step, index) => [
        step[0],
        `${step[1]} ${details[index]}`,
        step[2],
        examples[index],
      ] as const),
    };
  });
