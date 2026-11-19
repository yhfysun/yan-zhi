import type { ProgrammingCourseSeed, ProgrammingStepSeed } from './shared.js';

type AdvancedLesson = {
  readonly title: string;
  readonly focus: string;
  readonly mechanism: string;
  readonly evidence: string;
  readonly lab: string;
  readonly errors?: readonly string[];
};

type AdvancedStage = {
  readonly title: string;
  readonly goal: string;
  readonly sources: readonly string[];
  readonly lessons: readonly AdvancedLesson[];
};

const JAVA_API = 'Java Platform Standard Edition API Specification. https://docs.oracle.com/en/java/javase/';
const JAVA_SPECS = 'Java Language and VM Specifications. https://docs.oracle.com/javase/specs/';
const OPENJDK = 'OpenJDK Source. https://github.com/openjdk/jdk';
const JEP = 'OpenJDK JEP Index. https://openjdk.org/jeps/0';
const SPRING = 'Spring Framework Documentation. https://docs.spring.io/spring-framework/reference/';
const SPRING_BOOT = 'Spring Boot Documentation. https://docs.spring.io/spring-boot/';
const SPRING_SECURITY = 'Spring Security Reference. https://docs.spring.io/spring-security/reference/';
const SPRING_DATA = 'Spring Data Documentation. https://docs.spring.io/spring-data/commons/reference/';
const SPRING_CLOUD = 'Spring Cloud Gateway. https://docs.spring.io/spring-cloud-gateway/reference/';
const SPRING_AI = 'Spring AI Reference. https://docs.spring.io/spring-ai/reference/';
const MYBATIS = 'MyBatis Documentation. https://mybatis.org/mybatis-3/';
const KAFKA = 'Apache Kafka Documentation. https://kafka.apache.org/documentation/';
const KAFKA_SOURCE = 'Apache Kafka Source. https://github.com/apache/kafka';
const SPRING_KAFKA = 'Spring for Apache Kafka. https://docs.spring.io/spring-kafka/reference/';
const REDIS = 'Redis Documentation. https://redis.io/docs/latest/';
const RABBIT = 'RabbitMQ Documentation. https://www.rabbitmq.com/docs';
const HIKARI = 'HikariCP Source. https://github.com/brettwooldridge/HikariCP';
const OTEL = 'OpenTelemetry Documentation. https://opentelemetry.io/docs/';
const K8S = 'Kubernetes Documentation. https://kubernetes.io/docs/home/';
const DOCKER = 'Docker Documentation. https://docs.docker.com/';
const SRE = 'Google SRE Book. https://sre.google/sre-book/table-of-contents/';

const STAGES: readonly AdvancedStage[] = [
  {
    title: 'Java 标准库与集合源码',
    goal: '从接口、复杂度和 JDK 源码理解集合选型、哈希、顺序和并发边界。',
    sources: [JAVA_API, OPENJDK],
    lessons: [
      {
        title: 'Java 集合框架总览与复杂度',
        focus: '先按访问、插入、排序和唯一性建立集合选型表。',
        mechanism: '接口定义行为，抽象类复用部分实现，具体类决定数组、链表、树或哈希桶结构。',
        evidence: '对照 Collection、List、Set、Queue 和 Map 的 API，再用小规模基准验证复杂度。',
        lab: '对同一数据集执行索引访问、中间插入、按键查找和排序，记录结果与成本。',
      },
      {
        title: 'ArrayList 扩容与迭代器失效',
        focus: '理解连续数组、容量、扩容复制和 fail-fast 迭代器。',
        mechanism: '元素超过容量时分配更大数组并复制；结构性修改会改变 modCount，迭代器据此检测并发修改。',
        evidence: '阅读 grow、add、remove 和 Itr 实现，观察 removeIf 与直接 remove 的差异。',
        lab: '用容量预估减少扩容，再复现迭代期间删除导致的 ConcurrentModificationException。',
      },
      {
        title: 'LinkedList 结构与适用边界',
        focus: '理解双向链表、节点对象和索引遍历成本。',
        mechanism: '插入删除依赖节点链接，但随机访问需要从头或尾遍历；节点对象会增加内存和缓存开销。',
        evidence: '阅读 Node、linkFirst、linkLast 和 node(index)，比较 ArrayList 的缓存局部性。',
        lab: '对首尾操作、中间插入和随机访问分别做基准，说明 LinkedList 并不总是更快。',
      },
      {
        title: 'HashMap 哈希冲突与树化',
        focus: '掌握 hashCode、equals、桶、负载因子、扩容和红黑树阈值。',
        mechanism: '哈希决定桶位置，容量为 2 的幂便于位运算定位；链表过长且容量足够时树化，减少最坏查找成本。',
        evidence: '阅读 hash、putVal、resize、treeifyBin 和 TreeNode，验证键可变导致的查找失败。',
        lab: '构造冲突键，观察桶长度、树化和扩容；修复可变键和缺失 hashCode 的缺陷。',
        errors: ['只重写 equals 不重写 hashCode。', '使用可变对象作为键后修改字段。'],
      },
      {
        title: 'TreeMap 排序与比较器',
        focus: '理解红黑树顺序、Comparator 契约和范围查询。',
        mechanism: '键按比较结果进入有序树，比较器必须稳定、传递并一致处理相等。',
        evidence: '阅读 compare、getEntry 和 put，测试 null、重复比较结果与非传递比较器。',
        lab: '用自定义比较器实现时间范围索引，验证相邻区间和边界键。',
      },
      {
        title: 'Set 唯一性与 equals/hashCode',
        focus: '理解 HashSet、LinkedHashSet 和 TreeSet 的不同唯一性来源。',
        mechanism: 'HashSet 基于哈希，TreeSet 基于比较器，LinkedHashSet 额外保留插入顺序。',
        evidence: '用相同对象验证 contains、去重和顺序，阅读 Set 构造器如何委托 Map。',
        lab: '设计一个去重订单集合，确保业务主键、相等性和排序规则一致。',
      },
      {
        title: 'Queue、Deque 与 PriorityQueue',
        focus: '理解 FIFO、双端队列、优先级队列和堆操作。',
        mechanism: 'PriorityQueue 不是全排序列表，只保证堆顶最小或最大；比较器决定任务优先级。',
        evidence: '阅读 siftUp、siftDown 和 ArrayDeque 环形数组实现，观察扩容和父子索引。',
        lab: '实现任务调度队列，覆盖空队列、同优先级、取消和高频入队。',
      },
      {
        title: 'ConcurrentHashMap 并发语义',
        focus: '理解桶级并发、CAS、复合操作和弱一致迭代器。',
        mechanism: '读多数无锁，写入针对桶同步或 CAS；computeIfAbsent 等复合操作有特定原子性。',
        evidence: '阅读 putVal、get、computeIfAbsent 和 transfer，比较 synchronized HashMap。',
        lab: '实现计数和缓存，分别测试单步原子操作与跨键业务一致性。',
      },
      {
        title: 'Stream 与 Collectors 的性能边界',
        focus: '理解惰性流水线、装箱、并行流和终端聚合。',
        mechanism: '中间操作构建流水线，终端操作消费数据；并行流共享 ForkJoinPool，受数据规模和拆分成本影响。',
        evidence: '用 JMH 比较循环、串行流和并行流的装箱、排序与分组。',
        lab: '优化一个订单聚合流水线，减少中间对象并验证吞吐和可读性。',
      },
      {
        title: '集合选型与基准测试',
        focus: '把数据规模、访问模式和并发假设转成可验证选型。',
        mechanism: '复杂度给方向，常数、缓存、分配和锁决定真实性能，必须用接近生产的数据基准确认。',
        evidence: '比较 ArrayList、LinkedList、HashMap、TreeMap 和并发集合的分配与延迟。',
        lab: '为查询、导入和实时处理三种场景分别做集合选型报告。',
      },
    ],
  },
  {
    title: 'Java 并发、JMM 与虚拟线程',
    goal: '从线程同步进入 JMM、AQS、线程池、异步组合、虚拟线程和并发故障诊断。',
    sources: [JAVA_SPECS, JAVA_API],
    lessons: [
      {
        title: '线程生命周期与安全启动',
        focus: '理解 NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING 和 TERMINATED。',
        mechanism: '线程状态反映调度和等待原因；启动后异常不会自动向创建线程传播，需要明确错误通道。',
        evidence: '用 thread dump、UncaughtExceptionHandler 和 join 观察状态与退出。',
        lab: '实现受控后台任务，记录启动、完成、异常、取消和关闭。',
      },
      {
        title: 'synchronized 与监视器',
        focus: '理解对象监视器、互斥、可见性、可重入和锁粒度。',
        mechanism: '同步块建立 happens-before，退出时释放锁；锁范围过大降低并发，范围错误则保护不到共享状态。',
        evidence: '用线程转储观察 BLOCKED，比较不同锁对象和临界区。',
        lab: '修复余额并发扣减，证明失败后状态不变且总账一致。',
      },
      {
        title: 'volatile、JMM 与 happens-before',
        focus: '理解可见性、有序性、数据竞争和安全发布。',
        mechanism: 'volatile 保证读写可见与部分重排约束，但不保证复合操作原子性。',
        evidence: '用 jcstress 思路构造重排和可见性实验，分析安全发布。',
        lab: '实现停止标志和配置发布，验证 volatile 与锁的不同职责。',
      },
      {
        title: 'CAS、原子类与 ABA',
        focus: '理解乐观更新、竞争重试、内存序和 ABA 风险。',
        mechanism: '原子类用底层比较并交换更新值，高竞争下会自旋；复杂结构需要版本号或锁。',
        evidence: '阅读 AtomicInteger、LongAdder 和 VarHandle 相关实现。',
        lab: '实现无锁计数和高竞争计数器，分别比较吞吐与正确性。',
      },
      {
        title: 'AQS、ReentrantLock 与 Condition',
        focus: '理解同步状态、CLH 等待队列、公平性和条件等待。',
        mechanism: 'AQS 用 state 和等待队列实现获取、释放、中断与超时，Condition 管理单独等待集。',
        evidence: '阅读 acquire、release、tryAcquire 和 ConditionObject，观察锁等待线程栈。',
        lab: '实现有界缓冲区，覆盖中断、超时、公平锁和生产者消费者。',
      },
      {
        title: '并发集合与阻塞队列',
        focus: '理解队列语义、容量、阻塞、公平和内存可见性。',
        mechanism: 'BlockingQueue 把等待和唤醒封装进数据结构，容量决定背压；关闭与毒丸需要状态设计。',
        evidence: '阅读 ArrayBlockingQueue、LinkedBlockingQueue 和 SynchronousQueue。',
        lab: '实现背压任务管线，测试满队列、消费者退出和关闭顺序。',
      },
      {
        title: 'ThreadPoolExecutor 状态机',
        focus: '掌握核心线程、最大线程、队列、拒绝策略和关闭。',
        mechanism: 'ctl 同时编码运行状态和线程数；任务提交按线程和队列条件分派，关闭后不再接受新任务。',
        evidence: '阅读 execute、addWorker、getTask、shutdown 与 reject。',
        lab: '为 CPU、IO 和定时任务配置不同线程池，记录队列、拒绝、延迟和线程栈。',
        errors: ['所有业务共用一个无界队列线程池。', '只增加线程数掩盖锁竞争。'],
      },
      {
        title: 'CompletableFuture 与异步编排',
        focus: '理解任务组合、异常、超时、取消和线程调度。',
        mechanism: 'CompletionStage 组合依赖关系；默认线程池不适合阻塞业务，异常必须显式传播。',
        evidence: '用日志观察 thenApply、thenCompose、handle 和 whenComplete 的执行线程。',
        lab: '实现并行查询聚合，限制并发、超时和部分失败恢复。',
      },
      {
        title: 'Virtual Threads 与结构化并发',
        focus: '理解虚拟线程、载体线程、阻塞 IO、线程局部和结构化并发。',
        mechanism: '虚拟线程由 JVM 调度，阻塞时释放载体线程；CPU 密集任务和受限资源仍需容量控制。',
        evidence: '用 JFR 和线程转储比较平台线程与虚拟线程的创建成本和阻塞行为。',
        lab: '将大量阻塞请求迁移到虚拟线程，检查连接池、锁和第三方库兼容。',
      },
      {
        title: '竞态、死锁与并发诊断',
        focus: '从现象定位数据竞争、死锁、活锁、饥饿和线程泄漏。',
        mechanism: '线程转储显示锁和等待，JFR 显示阻塞与 CPU，测试要注入延迟和并发规模。',
        evidence: '构造两把锁环形等待和遗漏退出条件，记录诊断证据。',
        lab: '修复一个死锁和一个未退出 goroutine 的等价 Java 任务，并写回归测试。',
      },
    ],
  },
  {
    title: 'JVM、GC、JIT 与性能诊断',
    goal: '从 class 文件、类加载和运行时区域进入 GC、JIT、JFR 与生产调优。',
    sources: [JAVA_SPECS, OPENJDK, JEP],
    lessons: [
      {
        title: 'class 文件与字节码',
        focus: '理解常量池、方法结构、栈帧和 javap 输出。',
        mechanism: '编译器生成 JVM 指令，变量和方法调用映射成加载、存储、调用和返回指令。',
        evidence: '用 javap -c -v 对照源码和字节码，观察泛型擦除与字符串常量。',
        lab: '手写一个小类并解释每一步字节码及其运行时作用。',
      },
      {
        title: '类加载与双亲委派',
        focus: '理解加载、验证、准备、解析、初始化和类加载器隔离。',
        mechanism: '类加载器先请求父加载器，再尝试自身；类身份由加载器和全限定名共同决定。',
        evidence: '制造同名类、缺失依赖和静态初始化失败，观察不同错误。',
        lab: '实现一个受限插件类加载器，记录来源和加载顺序。',
      },
      {
        title: 'JVM 运行时数据区',
        focus: '区分堆、元空间、线程栈、PC、本地栈和直接内存。',
        mechanism: '对象、类元数据、栈帧和本地资源位于不同区域，溢出类型和工具不同。',
        evidence: '分别制造堆溢出、元空间增长、栈溢出和直接内存压力。',
        lab: '写一份内存区域与故障信息对照表，并用 jcmd 验证。',
      },
      {
        title: 'GC 根、可达性与分配',
        focus: '理解对象生命周期、分配速率、逃逸和回收判定。',
        mechanism: 'GC 从根集合追踪可达对象，未达对象可回收；栈引用、静态字段和 JNI 都可能是根。',
        evidence: '用 JFR 分配样本和堆直方图定位高分配对象。',
        lab: '降低一个接口的单位请求分配量，比较 GC 次数和延迟。',
      },
      {
        title: 'G1、ZGC 与停顿模型',
        focus: '区分吞吐、停顿、堆布局和回收器适用场景。',
        mechanism: 'G1 分区域并按预测停顿回收，ZGC 并发标记与重定位降低长停顿。',
        evidence: '收集 GC 日志，比较不同堆和分配率下的 P99、暂停和 CPU。',
        lab: '在同一 workload 下比较 G1 与 ZGC，写出不能推广的边界。',
      },
      {
        title: 'JIT、内联与去优化',
        focus: '理解解释执行、C1/C2、profile、内联和代码缓存。',
        mechanism: 'JVM 根据热点和方法大小决定编译，激进优化在假设失效时去优化。',
        evidence: '使用 PrintCompilation、JFR 和 JMH 观察预热与优化。',
        lab: '建立一个受预热影响的微基准，修正后给出稳定分位结果。',
      },
      {
        title: 'JFR 事件与火焰图',
        focus: '用低开销事件定位 CPU、锁、IO、分配和 GC。',
        mechanism: 'JFR 记录运行时事件，采样与事件窗口决定能看到什么。',
        evidence: '采集 JFR 并用 JMC 打开，关联线程、代码和 GC。',
        lab: '对一个慢服务完成 JFR 报告并区分热点和等待。',
      },
      {
        title: '线程转储与锁竞争',
        focus: '从 thread dump 判断阻塞、死锁、池耗尽和线程泄漏。',
        mechanism: '线程栈显示调用路径和锁状态，多次采样能看到持续热点和状态变化。',
        evidence: '比较间隔 5 秒的两次线程转储，定位持续 BLOCKED 和 WAITING。',
        lab: '复现连接池耗尽，写出排障步骤和修复验证。',
      },
      {
        title: '堆转储与内存泄漏',
        focus: '用 heap dump、支配树和引用链区分缓存与泄漏。',
        mechanism: '泄漏对象由仍存活的根路径持有，容量需要结合业务生命周期解释。',
        evidence: '用 jmap 导出堆，比较对象数量、保留大小和 GC 根路径。',
        lab: '制造一个 ThreadLocal 或缓存泄漏并修复，验证堆和业务行为。',
      },
      {
        title: 'JVM 调优实验与回归',
        focus: '建立 baseline、目标、单变量实验和回归基准。',
        mechanism: '吞吐、P99、内存和启动时间互相影响，参数优化必须绑定 workload。',
        evidence: '记录 JVM、容器限制、压测、GC、JFR 和错误率。',
        lab: '完成一份 JVM 调优报告，证明修改收益且没有引入新故障。',
      },
    ],
  },
  {
    title: 'JDK 8 到当前 LTS',
    goal: '掌握正式版与预览版演进、语言特性、运行时变化和迁移方法。',
    sources: [JEP, JAVA_API, JAVA_SPECS],
    lessons: [
      {
        title: 'JDK 8：Lambda、Stream 与函数式基线',
        focus: '理解函数式接口、方法引用、Stream、Optional 和新日期时间。',
        mechanism: 'Lambda 绑定函数式接口，Stream 惰性执行，Optional 表达缺失，java.time 区分时间点和本地日期。',
        evidence: '对照 JDK 8 API 和字节码，检查 invokedynamic 与泛型。',
        lab: '把一段 JDK 7 集合处理迁移为 Stream，并写出不适用场景。',
      },
      {
        title: 'JDK 9：模块系统与 API 边界',
        focus: '理解 module-info、可读性、导出和强封装。',
        mechanism: '模块声明依赖和导出包，反射访问受限，运行时镜像可按模块裁剪。',
        evidence: '用 jdeps、jlink 和 --describe-module 观察模块图。',
        lab: '把一个小型多包应用模块化，修复非法反射访问。',
      },
      {
        title: 'JDK 10-11：var 与 HttpClient',
        focus: '理解局部类型推断和现代 HTTP 客户端生命周期。',
        mechanism: 'var 只减少重复声明；HttpClient 支持异步、连接复用和超时，但仍需请求级错误处理。',
        evidence: '对照 API、线程模型和超时设置，观察连接与请求边界。',
        lab: '实现可取消、可超时的 HTTP 客户端调用并记录请求链路。',
      },
      {
        title: 'JDK 15：文本块与可读配置',
        focus: '理解文本块缩进、转义和内容构建规则。',
        mechanism: '文本块在编译期处理公共缩进和换行，仍需避免秘密和注入内容直接拼接。',
        evidence: '比较字符串拼接、文本块和模板化输出。',
        lab: '用文本块重建一份可读 SQL 或 JSON 样例，并验证空白与转义。',
      },
      {
        title: 'JDK 16：Record 数据建模',
        focus: '理解透明不可变数据的访问器、equals、hashCode 和构造校验。',
        mechanism: 'Record 自动生成结构方法，组件本身不是深层不可变，集合字段仍需防御复制。',
        evidence: '查看 javap 输出，观察规范构造器和生成方法。',
        lab: '用 Record 建模订单快照和 API DTO，补构造校验与序列化测试。',
      },
      {
        title: 'JDK 17：sealed 与模式匹配',
        focus: '用有界类型和穷尽分支表达业务状态。',
        mechanism: 'sealed 限制实现者，模式匹配与 switch 让类型和状态分支集中。',
        evidence: '在编译器下新增实现，验证 switch 穷尽提醒。',
        lab: '重构支付结果和订单状态，删除大量 instanceof 分支。',
      },
      {
        title: 'JDK 21：Virtual Threads 与并发迁移',
        focus: '理解虚拟线程、结构化并发预览边界和阻塞库兼容。',
        mechanism: '虚拟线程提高阻塞并发容量，但不会突破数据库连接、锁和服务配额。',
        evidence: '用 JFR 和压测比较平台线程池与虚拟线程。',
        lab: '迁移一个 IO 密集服务，检查连接池、线程局部和取消传播。',
      },
      {
        title: 'JDK 迁移矩阵与兼容性验证',
        focus: '把版本、JEP、正式/预览状态、依赖和运行时变化整理成可执行矩阵。',
        mechanism: '编译兼容不等于运行时兼容，反射、模块、GC、第三方库和容器镜像都可能失败。',
        evidence: '运行测试、反射扫描、启动、压测和依赖漏洞检查。',
        lab: '完成一个 JDK 8 到目标 LTS 的迁移计划、回滚和验证报告。',
      },
    ],
  },
  {
    title: 'Spring 机制与 Boot',
    goal: '从 BeanDefinition、refresh、代理和事务进入 Boot 自动配置和启动失败分析。',
    sources: [SPRING, SPRING_BOOT],
    lessons: [
      {
        title: 'Spring IoC 与 BeanDefinition',
        focus: '区分 Bean 定义、实例、作用域和代理。',
        mechanism: '配置解析产生 BeanDefinition，容器按依赖创建并注册对象，后置处理器可改写创建过程。',
        evidence: '断点观察 BeanDefinitionRegistry、DefaultListableBeanFactory 和 Bean 创建。',
        lab: '注册一个动态 Bean，并验证依赖、作用域和销毁。',
      },
      {
        title: 'ApplicationContext refresh 主流程',
        focus: '掌握环境准备、BeanFactory 初始化、后置处理和发布事件。',
        mechanism: 'refresh 是启动生命周期模板，异常发生在不同阶段对应不同修复方向。',
        evidence: '阅读 refresh 方法并记录每一步执行结果。',
        lab: '制造配置、依赖和初始化失败，建立启动错误分类表。',
      },
      {
        title: '依赖注入与 Bean 生命周期',
        focus: '理解构造器注入、字段注入、初始化、销毁和代理时机。',
        mechanism: '构造器注入保持依赖必需，生命周期回调可被后置处理器增强，循环依赖并不总是可解。',
        evidence: '观察实例化、属性填充、Aware、初始化前后和代理创建。',
        lab: '重构一个字段注入和循环依赖模块，改为构造器注入。',
      },
      {
        title: 'Spring AOP 与动态代理',
        focus: '理解切点、通知、代理和自调用失效。',
        mechanism: '代理拦截外部方法调用，JDK 代理基于接口，CGLIB 生成子类；真实方法内部自调用不会经过代理。',
        evidence: '阅读 ProxyFactory、Advisor 和拦截器链，观察代理类。',
        lab: '实现安全和日志切面，复现自调用并重构。',
      },
      {
        title: 'Spring 事务与事务传播',
        focus: '理解连接绑定、提交回滚、传播和只读边界。',
        mechanism: 'TransactionInterceptor 通过 PlatformTransactionManager 获取事务，资源与线程绑定，异常决定回滚。',
        evidence: '跟踪事务状态和数据库连接，观察 REQUIRES_NEW 与嵌套调用。',
        lab: '复现事务失效、吞异常回滚失败和远程调用长事务。',
      },
      {
        title: 'Spring 事件与扩展点',
        focus: '理解 ApplicationEvent、监听器、顺序和事务事件。',
        mechanism: '同步事件在发布线程执行，异步事件需配置执行器并处理失败；事务事件在提交后触发。',
        evidence: '观察监听器顺序、异常传播和事务提交时机。',
        lab: '实现提交后审计事件，验证失败不影响原事务。',
      },
      {
        title: 'Spring Boot 自动配置机制',
        focus: '理解条件装配、导入、配置绑定和 starter。',
        mechanism: 'Boot 根据 classpath、属性和已有 Bean 选择配置类，条件报告说明为什么生效或跳过。',
        evidence: '使用 --debug 和 ConditionEvaluationReport 追踪自动配置。',
        lab: '从空项目建立 starter 与自动配置，再关闭并手写等价配置。',
      },
      {
        title: '配置、Actuator 与启动失败分析',
        focus: '掌握外部配置、健康检查、指标和 FailureAnalyzer。',
        mechanism: '属性来源有优先级，Actuator 暴露运行状态，失败分析器把常见异常转为可行动信息。',
        evidence: '验证环境变量、配置文件和命令行覆盖顺序。',
        lab: '为服务建立健康、指标、配置审计和启动失败报告。',
      },
    ],
  },
  {
    title: 'Spring 家族源码',
    goal: '沿请求、鉴权、数据访问、网关和 AI 调用链阅读 Spring 家族源码。',
    sources: [SPRING, SPRING_SECURITY, SPRING_DATA, SPRING_CLOUD, SPRING_AI, MYBATIS],
    lessons: [
      {
        title: 'DispatcherServlet 请求链',
        focus: '掌握 HandlerMapping、HandlerAdapter、参数解析和返回值处理。',
        mechanism: 'DispatcherServlet 先找处理器，再找适配器，参数解析、执行、返回值和异常处理分层完成。',
        evidence: '在 doDispatch 打断点，记录 Filter、Interceptor、AOP 和 Controller 顺序。',
        lab: '画出一条完整 MVC 请求链并解释每个扩展点。',
      },
      {
        title: 'Security FilterChain 与授权',
        focus: '理解 FilterChainProxy、SecurityContext、认证和授权。',
        mechanism: '多个 SecurityFilterChain 按匹配顺序选择，过滤器建立上下文并执行认证授权。',
        evidence: '观察过滤链顺序、异常转换和对象级授权。',
        lab: '复现 URL 权限与方法权限不一致，修复并补回归。',
      },
      {
        title: 'Spring Data 仓库代理',
        focus: '理解 RepositoryFactorySupport、查询解析和事务拦截。',
        mechanism: '接口由工厂生成代理，方法名或注解解析成查询，调用经过事务和异常转换。',
        evidence: '观察代理类、查询解析和 SQL 日志。',
        lab: '实现一个自定义仓库片段并保持事务语义。',
      },
      {
        title: 'MyBatis MapperProxy 执行链',
        focus: '掌握 MapperProxy、SqlSession、Executor、StatementHandler 和结果映射。',
        mechanism: 'Mapper 方法由代理转为 MappedStatement 执行，参数、SQL、结果和插件分别处理。',
        evidence: '开启 SQL 日志并在 Executor 和 ResultSetHandler 处观察。',
        lab: '实现一个受控 MyBatis 插件并排查 N+1。',
      },
      {
        title: 'Spring Cloud Gateway 过滤器链',
        focus: '理解路由匹配、过滤器和请求转发。',
        mechanism: 'RoutePredicate 决定路由，过滤器链修改请求和响应，认证和限流应作为策略层。',
        evidence: '追踪一次请求的路由 ID、过滤器和响应写回。',
        lab: '实现限流与灰度过滤器，测试重试预算和错误响应。',
      },
      {
        title: 'Spring AI Advisor 与 Tool Calling',
        focus: '理解模型请求、Advisor、工具调用和结果回填。',
        mechanism: 'Advisor 在处理链中增强上下文和结果，工具调用需要参数校验、权限与确认。',
        evidence: '记录一次提示、工具请求、工具结果和最终响应。',
        lab: '实现只读工具与人工确认工具，验证越权参数被拒绝。',
      },
      {
        title: 'Spring Boot 条件装配与启动源码',
        focus: '沿 SpringApplication 和条件报告解释启动。',
        mechanism: '启动器发现候选配置，条件筛选后注册 Bean，失败分析器处理启动异常。',
        evidence: '比较类路径、属性和已有 Bean 对条件结果的影响。',
        lab: '实现自定义条件与失败分析器，记录启动证据。',
      },
      {
        title: '框架源码阅读与最小扩展',
        focus: '把入口、调用链、状态、扩展点和实验写成可复核报告。',
        mechanism: '固定版本、符号和调用链，避免只看函数名或依赖旧版记忆。',
        evidence: '仓库 tag、路径、符号、断点和可运行实验共同组成来源卡。',
        lab: '选择一个真实缺陷，写失败测试并提出最小补丁或扩展。',
      },
    ],
  },
  {
    title: 'SSE、WebFlux 与流式接口',
    goal: '从协议到 Spring MVC/WebFlux 实现流式响应，并处理背压、取消、超时和代理。',
    sources: [SPRING, OTEL, 'WHATWG HTML SSE. https://html.spec.whatwg.org/multipage/server-sent-events.html'],
    lessons: [
      {
        title: 'SSE 协议与事件格式',
        focus: '理解 event、data、id、retry、心跳和 text/event-stream。',
        mechanism: '客户端保持连接并逐事件解析，代理缓冲和超时会破坏实时性。',
        evidence: '用 curl -N 和浏览器观察事件边界与响应头。',
        lab: '实现可断线重连和事件 ID 的基础 SSE 端点。',
      },
      {
        title: 'SseEmitter 生命周期',
        focus: '理解超时、完成、错误、断线和异步请求资源。',
        mechanism: 'SseEmitter 由容器异步处理，回调必须释放生产者、取消模型和停止队列。',
        evidence: '模拟客户端断开，观察完成与错误回调。',
        lab: '实现断开即取消上游任务并记录原因。',
      },
      {
        title: 'WebFlux 与 Flux 数据流',
        focus: '理解 Publisher、订阅、操作符和响应式线程模型。',
        mechanism: 'Flux 在订阅后传递元素、完成或错误，操作符组合转换和调度。',
        evidence: '用 Reactor 日志观察 subscribe、request、onNext、cancel。',
        lab: '将阻塞服务包装为受控 Flux，验证取消与错误传播。',
      },
      {
        title: '背压与慢消费者',
        focus: '理解 request(n)、队列、丢弃和限流策略。',
        mechanism: '生产者速度高于消费者时必须有背压、缓冲或拒绝，不能无界堆内存。',
        evidence: '构造慢客户端，观察缓冲、延迟和连接上限。',
        lab: '为流式模型输出设计事件大小、并发和最长时限。',
      },
      {
        title: '取消、超时与资源释放',
        focus: '区分客户端取消、服务端超时、上游取消和正常完成。',
        mechanism: '取消需要贯穿数据库、HTTP、模型和执行器，finally 必须幂等清理。',
        evidence: '记录连接、线程、上游请求和队列的释放顺序。',
        lab: '实现超时和用户取消，证明无后台任务泄漏。',
      },
      {
        title: 'Nginx、Ingress 与代理缓冲',
        focus: '理解 proxy buffering、超时、压缩和连接限制对流的影响。',
        mechanism: '中间层可能缓存或聚合响应，SSE 和分块响应需要逐层配置和观测。',
        evidence: '比较直连与经代理的首字节和事件间隔。',
        lab: '调整代理配置并完成回滚，记录配置版本和影响。',
      },
      {
        title: '流式接口可观测性',
        focus: '监测首字节、事件数、连接时长、取消、错误和慢客户端。',
        mechanism: '普通请求耗时不适用于长连接，需要区分建立、首事件、持续时间和完成原因。',
        evidence: '用 Trace、指标和结构化日志串联一次流式请求。',
        lab: '建立连接数、事件速率和取消率仪表盘。',
      },
      {
        title: '流式服务容量与故障实验',
        focus: '确定最大连接、事件大小、内存、线程和上游配额。',
        mechanism: '流的资源占用来自连接、缓冲、上游任务和网络，必须做慢客户端与断线风暴测试。',
        evidence: '压测连接数、事件频率和客户端断开比例。',
        lab: '完成容量报告、限流策略、降级和事故运行手册。',
      },
    ],
  },
  {
    title: 'Kafka、中间件与多数据源',
    goal: '从 Kafka 源码和故障进入缓存、消息、连接池、多数据源与跨库一致性。',
    sources: [KAFKA, KAFKA_SOURCE, SPRING_KAFKA, REDIS, RABBIT, HIKARI],
    lessons: [
      {
        title: 'Kafka 集群、Topic 与 Partition',
        focus: '理解分区、副本、Leader、ISR 和消费并行度。',
        mechanism: 'Partition 是顺序与并行的基本单位，副本复制和 Leader 切换决定可用性。',
        evidence: '用 Broker 日志、Topic 描述和端到端延迟观察分区状态。',
        lab: '构造三 Broker 集群，观察 Leader 切换和客户端恢复。',
      },
      {
        title: 'KafkaProducer 与 Sender',
        focus: '理解序列化、分区器、RecordAccumulator、NetworkClient 和回调。',
        mechanism: 'Producer 先积累批次再由 Sender 发送，acks、重试和幂等配置共同决定可靠性。',
        evidence: '阅读 KafkaProducer.doSend、Sender 和 RecordAccumulator。',
        lab: '比较批大小、linger、acks 和重试对吞吐与重复的影响。',
      },
      {
        title: 'KafkaConsumer、Fetcher 与位移',
        focus: '理解订阅、抓取、处理、提交和重复消费。',
        mechanism: '消费进度由提交位移表达，业务处理与提交不是天然原子。',
        evidence: '观察 Fetcher、poll 和 commit 路径，注入处理失败。',
        lab: '实现幂等消费者、手动提交、重试和死信。',
      },
      {
        title: '消费组与 Rebalance',
        focus: '理解 ConsumerCoordinator、GroupCoordinator、心跳和分区分配。',
        mechanism: '组成员变化触发再平衡，停止世界或增量协议决定暂停范围。',
        evidence: '用 Broker 和 Consumer 日志记录一次 Rebalance 时间线。',
        lab: '模拟消费者加入、离开和超时，验证位移与分区交接。',
      },
      {
        title: 'Kafka 日志存储与副本',
        focus: '理解 UnifiedLog、LogSegment、索引、retention、ISR 和高水位。',
        mechanism: '消息追加到活动段，索引加速读取，副本追赶和 ISR 决定提交与可用性。',
        evidence: '阅读 UnifiedLog、LogSegment、ReplicaManager 与 Partition。',
        lab: '观察段滚动、retention、副本落后和磁盘增长。',
      },
      {
        title: 'Kafka 可靠性与故障实验',
        focus: '建立重复、丢失、顺序、积压和不可用边界。',
        mechanism: 'Producer、Broker、Consumer 三层各自有失败语义，业务必须幂等并可观测。',
        evidence: '记录请求、acks、位移、重复消费和告警。',
        lab: '完成 Broker 下线、消费者宕机和积压恢复演练。',
      },
      {
        title: 'Redis 事件循环与缓存治理',
        focus: '理解单线程命令、数据结构、过期、持久化和缓存失效。',
        mechanism: '命令在事件循环执行，长命令阻塞其他客户端；缓存命中、穿透和雪崩需要监控。',
        evidence: '阅读事件循环、dict 和 expire 关键路径。',
        lab: '实现缓存穿透保护、热点隔离和故障回源。',
      },
      {
        title: 'RabbitMQ 路由、ACK 与死信',
        focus: '理解 Exchange、Queue、确认、重投、DLX 和流控。',
        mechanism: '生产者确认和消费者 ACK 是不同边界，重投必须有幂等和上限。',
        evidence: '追踪消息从 Exchange 到 Queue 再到死信的状态。',
        lab: '实现重试队列、死信消费和积压告警。',
      },
      {
        title: 'HikariCP 连接池源码与容量',
        focus: '理解连接获取、归还、等待队列、超时和泄漏检测。',
        mechanism: '池大小限制数据库并发，连接借出和归还必须成对，长事务会耗尽池。',
        evidence: '阅读 HikariPool、PoolEntry 和等待队列，观察活跃连接。',
        lab: '复现连接泄漏和池等待，修复并给每库配置独立配额。',
      },
      {
        title: 'Spring/MyBatis 多数据源路由',
        focus: '实现 AbstractRoutingDataSource、上下文清理和多 SqlSessionFactory。',
        mechanism: '路由键在获取连接时读取，事务一旦绑定连接就不能随意切换数据源。',
        evidence: '观察 determineCurrentLookupKey、连接和事务绑定。',
        lab: '实现主从双数据源并验证线程复用不会串库。',
      },
      {
        title: '多数据源事务与读写分离',
        focus: '理解独立事务管理器、写后读和复制延迟。',
        mechanism: '多库事务不是单个本地事务，跨库一致性需要 Outbox、Saga 或明确接受最终一致。',
        evidence: '记录事务管理器、连接、提交和复制延迟。',
        lab: '复现写后立即读从库的延迟，并设计强制主库策略。',
      },
      {
        title: 'Outbox、Saga 与跨库一致性',
        focus: '把数据库状态和消息发布连接成可靠流程。',
        mechanism: 'Outbox 在同一库事务记录待发消息，后台投递并幂等消费；Saga 用补偿处理跨服务失败。',
        evidence: '记录事务、Outbox、消息、消费和补偿状态。',
        lab: '实现订单和库存跨库流程，注入重复、延迟和失败。',
      },
    ],
  },
  {
    title: '企业交付与云原生',
    goal: '把模块化服务部署到容器环境，完成 CI/CD、监控、发布和回滚。',
    sources: [DOCKER, K8S, OTEL, SRE, SPRING_BOOT],
    lessons: [
      {
        title: '模块边界、API 与错误模型',
        focus: '建立稳定领域边界、接口契约和统一错误。',
        mechanism: '模块按业务变化拆分，跨模块依赖通过明确接口；HTTP 状态与业务错误分层。',
        evidence: '用依赖图和契约测试验证边界。',
        lab: '拆分订单、库存和支付模块，禁止直接访问内部表。',
      },
      {
        title: '数据库迁移与数据回填',
        focus: '设计兼容发布、在线回填和回滚。',
        mechanism: '先加结构、再双写或回填、再切读、最后清理，每一步可独立执行。',
        evidence: '记录锁、耗时、失败和重试。',
        lab: '完成一次大表在线迁移与回滚演练。',
      },
      {
        title: '认证、授权与审计',
        focus: '完成服务端对象级授权和敏感操作审计。',
        mechanism: '身份、角色和资源归属分层判断，审计记录主体、动作、对象和结果。',
        evidence: '覆盖越权、撤回权限和过期会话。',
        lab: '实现多租户 RBAC 和审计日志。',
      },
      {
        title: '幂等、重试与超时预算',
        focus: '处理网络未知结果和流量放大。',
        mechanism: '写操作使用幂等键和唯一约束，重试只用于安全操作并消耗全局预算。',
        evidence: '模拟超时、重复请求和多层重试。',
        lab: '实现创建订单幂等和补偿查询。',
      },
      {
        title: '缓存、消息与高并发',
        focus: '设计缓存失效、队列、限流和降级。',
        mechanism: '缓存和消息都是有状态副本，必须定义一致性、容量和失败策略。',
        evidence: '压测命中率、积压、P99 和错误率。',
        lab: '完成高峰流量保护与降级方案。',
      },
      {
        title: 'Docker 镜像与配置',
        focus: '构建最小、非 root、可观测的 Java 镜像。',
        mechanism: '多阶段构建分离编译和运行，配置从环境或配置中心注入。',
        evidence: '检查镜像层、用户、健康检查和启动参数。',
        lab: '构建镜像并在干净环境启动和排障。',
      },
      {
        title: 'Kubernetes 发布与探针',
        focus: '配置 Deployment、Service、探针、资源和优雅停机。',
        mechanism: '就绪决定接流量，存活决定重启，资源限制和 PDB 决定发布容量。',
        evidence: '观察滚动发布、探针失败和 Pod 事件。',
        lab: '完成灰度发布、探针修复和回滚。',
      },
      {
        title: 'CI/CD、可观测性与事故复盘',
        focus: '把测试、扫描、制品、发布、监控和回滚连成闭环。',
        mechanism: '每次发布使用固定制品，部署后观察关键指标，失败时按运行手册回滚。',
        evidence: '保留构建、配置、发布、告警和复盘记录。',
        lab: '完成一次失败发布、止损、恢复和无责复盘。',
      },
    ],
  },
  {
    title: 'Java 毕业项目与源码答辩',
    goal: '接管真实项目，完成性能、安全、故障、架构和源码综合答辩。',
    sources: [OPENJDK, SPRING, KAFKA_SOURCE, SRE],
    lessons: [
      {
        title: 'Brownfield 项目接管',
        focus: '从入口、依赖、数据、部署和运行手册理解陌生系统。',
        mechanism: '先建立可运行基线和证据，再做最小变更。',
        evidence: '提交架构图、依赖图、运行图和风险清单。',
        lab: '在不破坏现有行为的前提下完成一个真实功能。',
      },
      {
        title: '性能问题定位与优化',
        focus: '用 JVM、数据库、缓存和链路证据定位瓶颈。',
        mechanism: '先分类 CPU、锁、GC、IO、数据库和网络，再做单变量实验。',
        evidence: '保留 baseline、profile、压测和回归结果。',
        lab: '完成一次 P99 优化并证明无功能回归。',
      },
      {
        title: '安全审查与修复',
        focus: '覆盖越权、注入、秘密、依赖和 AI 工具边界。',
        mechanism: '从资产和信任边界进入，修复根因并补攻击回归。',
        evidence: '威胁模型、扫描报告、修复 diff 和测试。',
        lab: '完成一次安全评审与复测。',
      },
      {
        title: '生产故障演练',
        focus: '处理 Broker 下线、数据库延迟、连接池耗尽和发布失败。',
        mechanism: '按运行手册观测、止损、恢复和复盘，不靠临场猜。',
        evidence: '时间线、指标、日志、变更和恢复记录。',
        lab: '完成多故障联合演练。',
      },
      {
        title: '架构 ADR 与技术取舍',
        focus: '记录模块化单体、消息、多数据源和部署选择。',
        mechanism: '质量属性、约束、选项、后果和重新评估条件共同组成决策。',
        evidence: 'ADR、质量场景和成本分析。',
        lab: '写一份能经得起半年后重读的 ADR。',
      },
      {
        title: '源码答辩与知识迁移',
        focus: '用自己的话解释 JVM、Spring、Kafka 和多数据源关键调用链。',
        mechanism: '从版本、入口、状态、扩展点、失败路径和生产验证完整陈述。',
        evidence: '源码卡、调用链图、实验和答辩记录。',
        lab: '完成毕业答辩和下一阶段学习计划。',
      },
    ],
  },
];

function seededSteps(stage: AdvancedStage, lesson: AdvancedLesson, index: number): readonly ProgrammingStepSeed[] {
  return [
    [
      `先明确${lesson.title}要解决的问题`,
      `${lesson.title}位于“${stage.title}”阶段。${lesson.focus} 学习时先写清输入、状态、目标和失败条件，再进入 API 或源码细节。`,
      '先定义问题，再记 API',
    ],
    [
      '按调用链拆解运行机制',
      `${lesson.mechanism} 把这个机制画成调用链或状态图，标出哪些对象持有状态、哪些资源需要释放，以及异常会从哪里传播。`,
      '机制必须能沿调用链复述',
    ],
    [
      '用源码、规范或运行结果验证',
      `${lesson.evidence} 固定 JDK、框架或中间件版本，记录符号、实验输入和输出；不能只凭函数名推断行为。`,
      '固定版本并保留证据',
    ],
    [
      '完成可重复实验',
      `${lesson.lab} 实验至少包含成功、边界、失败和恢复四条路径，并保存命令、日志、指标和关键结果。`,
      '实验必须能重复',
    ],
    [
      '迁移到企业工程并形成边界',
      `把“${lesson.title}”接入真实项目时，说明容量、权限、安全、监控、回滚和与其他模块的契约。阶段目标是：${stage.goal} 最后写成运行手册和复盘结论。`,
      '能交付、能排障才算掌握',
    ],
  ];
}

export const PROGRAMMING_JAVA_ADVANCED_COURSES: readonly ProgrammingCourseSeed[] =
  STAGES.flatMap((stage) =>
    stage.lessons.map((lesson, index) => ({
      name: lesson.title,
      track: 'P06 · Java / JVM / Spring',
      minutes: 38 + (index % 4) * 4,
      prerequisite:
        index === 0
          ? '完成 Java 零基础、语言核心、面向对象、集合、异常、IO 和测试课程。'
          : `建议先完成同阶段前一课“${stage.lessons[index - 1].title}”。`,
      goal: `学完后，能用自己的话解释“${lesson.title}”的机制、源码证据、实验边界和企业工程取舍。`,
      guidedPractice: lesson.lab,
      independentPractice: `为“${lesson.title}”完成一份源码或运行报告，包含正常链路、一个失败链路、证据、修复和回归。`,
      commonErrors: lesson.errors ?? [
        `只记“${lesson.title}”的 API 名称，不说明状态、资源和失败路径。`,
        '没有固定版本或可重复实验，就把一次运行结果当成普遍结论。',
      ],
      sourceRefs: stage.sources,
      steps: seededSteps(stage, lesson, index),
    })),
  );

export const PROGRAMMING_JAVA_ADVANCED_STAGE_OUTLINES = STAGES.map((stage, stageIndex) => {
  const lessons = stage.lessons.map((lesson, lessonIndex) => ({
    id: `j${stageIndex + 2}-${String(lessonIndex + 1).padStart(2, '0')}`,
    title: lesson.title,
    courseName: lesson.title,
    minutes: 38 + (lessonIndex % 4) * 4,
    status: 'ready' as const,
  }));
  return {
    id: `J${stageIndex + 2}`,
    title: stage.title,
    goal: stage.goal,
    minutes: lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    lessons,
  };
});
