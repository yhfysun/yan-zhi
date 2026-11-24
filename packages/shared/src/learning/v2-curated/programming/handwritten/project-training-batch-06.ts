// P15 综合训练第六批手写样板：LogForge 日志采集器 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;

const LOGFORGE_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · LogForge 日志采集器 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 Linux 文件、网络和进程，能阅读 C++ 与 Go 基础代码。',
    goal: '能区分平台工程师、应用开发者、SRE 和安全审核员的采集任务，建立文件读取、规则过滤、批量发送、控制面和故障恢复的业务链路。',
    guidedPractice: '模拟主机注册、规则下发、目标不可用、磁盘慢和游标恢复五类任务，记录吞吐、延迟、丢弃和人工处理。',
    independentPractice: '交付角色任务卡、采集链路图和故障预算，标出内存有界、数据可恢复和控制面不可达时的边界。',
    commonErrors: [
      '只设计正常发送路径，没有说明目标变慢时采集器如何限制内存。',
      '把日志采集器当成无限缓冲队列，忽略崩溃和升级后的游标恢复。',
    ],
    sourceRefs: [
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'C++ Working Draft. https://eel.is/c++draft/',
      'OpenTelemetry Logs Data Model. https://opentelemetry.io/docs/specs/otel/logs/data-model/',
    ],
    steps: [
      [
        '按角色定义采集责任',
        '平台工程师负责部署和容量，应用开发者关心文件格式与过滤，SRE 要观察积压和丢弃，安全审核员要求规则和样本脱敏。每个角色写清成功证据、故障反馈和人工入口。',
        '采集器必须对多角色可解释',
      ],
      [
        '画清文件到后端的链路',
        '文件轮转被检测后读取新增行，规则过滤和字段解析生成事件，有界队列批量序列化并发送，成功后提交游标。任何一步失败都要说明重试、丢弃或暂停策略。',
        '游标与批次决定恢复边界',
      ],
      [
        '把有界内存写成硬约束',
        '采集吞吐、目标延迟和队列容量共同决定内存上限。网络变慢时允许丢弃、限速或暂停读取，但不能无限增长队列。',
        '内存预算先于吞吐目标',
      ],
      [
        '识别轮转与重复风险',
        '文件 truncate、rename、inode 复用时只看路径会漏采或重采。读取前记录 inode、偏移和头部指纹，发送成功后再提交可恢复游标。',
        '日志文件身份需要多重判断',
      ],
      [
        '形成首版闭环',
        '首版包含文件读取、基础规则、批量发送、注册心跳、指标和游标持久化；不做完整检索产品、无限离线缓存和跨云调度。',
        '首版先保证有界和可恢复',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 LogForge 角色任务、采集链路和内存约束。',
    goal: '能把首版限定为文件读取、规则、批量传输、控制心跳和指标，写出吞吐、内存、断网、慢磁盘、游标恢复和规则兼容验收。',
    guidedPractice: '为 50MB/s 吞吐、队列满载、后端断网、文件轮转和进程崩溃各写观察指标与通过线。',
    independentPractice: '交付验收矩阵、容量假设和故障预算，每条包含输入、资源、通过标准和证据。',
    commonErrors: [
      '只测平均吞吐，不看 P99、队列水位和内存峰值。',
      '用无限队列换取不丢数据，最终在故障时 OOM。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Clang Sanitizers. https://clang.llvm.org/docs/index.html',
      'Protobuf Language Guide. https://protobuf.dev/programming-guides/proto3/',
    ],
    steps: [
      [
        '范围收敛到采集闭环',
        '首版必须能发现文件、读取新增行、应用规则、批量发送、持久化游标、暴露指标并接受控制面心跳。日志查询和复杂分析放在后端产品。',
        '采集客户端只做采集职责',
      ],
      [
        '吞吐与资源共同验收',
        '在固定磁盘、CPU、批次和网络下记录 MB/s、队列水位、内存峰值、CPU、发送延迟和丢弃率。只看吞吐会忽略资源代价。',
        '吞吐必须带资源账单',
      ],
      [
        '断网和慢磁盘是必测场景',
        '目标断开时队列应达到上限并触发背压或丢弃策略，磁盘读取变慢时不能忙等占满 CPU。恢复后按游标继续。',
        '故障中也要保持有界',
      ],
      [
        '崩溃恢复检查重复与漏采',
        '在批次发送前后杀进程，重启后游标只能导致可解释的重复，不能永久漏采。消费者或后端按事件 ID 去重。',
        '至少一次采集需要幂等边界',
      ],
      [
        '冻结规则和协议版本',
        '规则 schema、Agent 协议和配置版本都要兼容旧 Agent。不支持的配置要拒绝并报告，而不是让采集器反复崩溃。',
        '控制面升级不能秒杀旧 Agent',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 LogForge MVP、吞吐资源和恢复验收。',
    goal: '能定义 Agent 注册、心跳、配置下发、状态和 Protobuf 批量协议，处理版本兼容、背压、失败重试和运维台状态展示。',
    guidedPractice: '写出 Agent 注册与心跳、配置版本拉取和批量发送响应，再模拟旧 Agent 收到未知字段和配置格式错误。',
    independentPractice: '交付 API 与 Proto 契约、错误码和前端状态矩阵，覆盖离线、积压、丢弃、配置失败和版本不兼容。',
    commonErrors: [
      '配置接口直接下发未验证脚本或 shell 命令。',
      '用无界 JSON 数组发送日志，无法控制批次大小和内存。',
    ],
    sourceRefs: [
      'Protobuf Language Guide. https://protobuf.dev/programming-guides/proto3/',
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'gRPC Documentation. https://grpc.io/docs/',
    ],
    steps: [
      [
        'Agent 注册包含身份和版本',
        '注册请求包含主机 ID、Agent 版本、平台、规则版本和能力声明，控制面返回配置版本和心跳间隔。旧 Agent 可忽略未知可选字段。',
        '版本是控制面协议的一部分',
      ],
      [
        '配置下发以声明式规则为主',
        '规则使用受控 schema 描述路径、过滤、字段和限额，不允许下发任意 shell。Agent 校验成功后才原子切换版本。',
        '配置不是远程代码执行',
      ],
      [
        '批量协议明确批次边界',
        '每个批次包含 agentId、batchId、事件数量、压缩状态和校验值，响应返回已接收批次或明确错误。单批大小受内存和时间限制。',
        'batchId 支持幂等和追踪',
      ],
      [
        '心跳报告资源与积压',
        '心跳携带队列水位、丢弃数、读取速率、发送速率、最近错误和规则版本。控制面据此显示离线、过载和不兼容状态。',
        '心跳不是只报活着',
      ],
      [
        '运维台只展示可行动状态',
        '前端按在线、离线、配置待生效、队列积压、权限错误和目标失败显示不同动作。危险配置变更需展示差异和确认。',
        '状态页必须帮助恢复',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 LogForge 协议、规则和前端状态。',
    goal: '能为控制面建立 Agent、配置版本、心跳、规则和审计模型，为采集端设计游标、批次和状态存储，并处理版本迁移和损坏恢复。',
    guidedPractice: '设计 Agent 心跳快照和配置版本表，再模拟游标文件损坏、配置回滚和旧 Agent 升级。',
    independentPractice: '交付控制面 ER 图、Agent 本地状态格式和迁移方案，覆盖原子写入、版本回滚和损坏检测。',
    commonErrors: [
      '心跳覆盖所有历史，无法追踪积压和错误变化。',
      '游标直接原地写文件，崩溃时留下半写 JSON。',
    ],
    sourceRefs: [
      'PostgreSQL Documentation. https://www.postgresql.org/docs/',
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'OpenTelemetry Logs Data Model. https://opentelemetry.io/docs/specs/otel/logs/data-model/',
    ],
    steps: [
      [
        '控制面保存期望与观测状态',
        'Agent 表保存身份和当前注册信息，配置版本保存不可变规则，心跳保存最近观测，审计记录谁在何时下发和回滚。',
        '期望配置和实际状态分开',
      ],
      [
        '游标写入必须原子',
        '采集端先写临时文件并 fsync，再原子 rename；内容包含文件身份、偏移、批次和校验。损坏时保留现场并触发安全恢复。',
        '崩溃不能留下半写游标',
      ],
      [
        '事件 ID 支持去重',
        '事件 ID 由 agentId、文件身份、偏移和批次组成，后端可据此处理发送成功但游标未提交导致的重复。',
        '重复边界可计算',
      ],
      [
        '配置版本不可变',
        '修改规则生成新版本，不覆盖旧版本；Agent 回报应用的版本和错误，控制面可回滚到上一版本。',
        '回滚依赖历史版本',
      ],
      [
        '迁移兼容旧 Agent',
        '新增字段使用可选和默认值，旧 Agent 不认识时仍能拉取兼容配置。升级失败可恢复旧游标和规则。',
        '滚动升级期间双版本共存',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已有 LogForge 协议、游标和配置模型。',
    goal: '能建立 C++20 Collector、Go 控制面、React 运维台和本地目标服务，固定 CMake Presets、依赖锁定、配置和测试入口。',
    guidedPractice: '从空目录构建三个组件，启动本地目标服务并让 Collector 完成注册、读取测试日志和批量发送。',
    independentPractice: '删除生成物后按 README 重建，分别制造配置错误、目标断网和游标损坏并保留故障日志。',
    commonErrors: [
      'C++ 构建依赖本机隐式安装，CI 无法复现。',
      'Collector 直接读取开发机绝对路径和秘密配置。',
    ],
    sourceRefs: [
      'CMake Documentation. https://cmake.org/documentation/',
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'Go Documentation. https://go.dev/doc/',
    ],
    steps: [
      [
        'Collector 按输入、处理、输出分层',
        '文件源、规则处理、有界队列、序列化和网络发送分别定义接口，控制面和指标是适配器。层间传递明确所有权对象，避免悬空引用。',
        '所有权边界决定内存安全',
      ],
      [
        '构建固定编译器和依赖',
        'CMake Presets 记录编译器、C++ 标准、构建类型和包管理，CI 与本地共用。静态/动态链接和运行时库进入制品说明。',
        '构建输入必须可复现',
      ],
      [
        '控制面和 Collector 独立发布',
        'Go 控制面与 C++ Agent 有各自版本和兼容矩阵，配置协议显式声明最低 Agent 版本，不能假设同时升级。',
        '发布单元相互独立',
      ],
      [
        '本地环境包含真实目标',
        'Compose 或本地进程提供接收端和 ClickHouse 替代测试目标，Collector 使用相对路径和测试配置，不读取开发者主目录。',
        '路径和配置必须可移植',
      ],
      [
        'README 跑通注册到发送',
        '新成员从空目录完成构建、启动、注册、写入测试日志、接收批次和查看指标。失败场景也有命令和预期输出。',
        '首次链路要能独立复现',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'LogForge Collector 与控制面基本链路已经可运行。',
    goal: '能实现 Asio 异步读取、规则处理、有界队列、批量发送、背压、游标提交和优雅停机，处理断网、慢盘和崩溃恢复。',
    guidedPractice: '把目标接收速度降到一半，观察队列水位、丢弃和内存；断开网络后恢复，检查游标与重复批次。',
    independentPractice: '在批次发送前后杀进程，证明重启后不漏采、重复可解释，并写一份资源恢复报告。',
    commonErrors: [
      '在 Asio 回调中执行阻塞文件 IO 或压缩，拖慢所有定时器。',
      '接收成功但游标提交失败后无法判断能否重发。',
    ],
    sourceRefs: [
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'C++ Working Draft. https://eel.is/c++draft/',
      'OpenTelemetry Logs Data Model. https://opentelemetry.io/docs/specs/otel/logs/data-model/',
    ],
    steps: [
      [
        'IO 回调保持非阻塞',
        '文件读取、压缩和发送通过异步任务或受控线程池执行，io_context 回调只推进状态。任何长计算进入 EventLoop 都会延迟心跳和超时。',
        '网络线程不做重计算',
      ],
      [
        '队列容量和背压策略显式',
        '队列达到高水位时暂停读取，达到硬上限选择丢弃旧事件或按策略拒绝并计数。不能继续无界 push。',
        '背压发生在读取入口',
      ],
      [
        '批次发送与游标分离',
        '发送成功后记录已接收批次，再异步提交游标。中间崩溃会重发但 ID 可去重，不能因游标失败永久丢事件。',
        '恢复边界要可解释',
      ],
      [
        '慢盘和文件轮转稳定处理',
        '轮询文件状态比较 inode、大小和头部指纹，轮转后先读完旧文件再切换。慢盘时降低轮询频率并保留资源。',
        '文件身份比路径更可靠',
      ],
      [
        '优雅停机保存状态',
        '收到终止信号停止读取，等待在途批次到超时，提交游标并关闭连接。强制退出要保留临时文件和错误记录。',
        '停机也是数据一致性环节',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'LogForge Agent、配置和指标接口已可联调。',
    goal: '能实现 Agent 列表、规则编辑、吞吐图表、队列告警和危险操作确认，处理离线、积压、规则错误和移动端运维。',
    guidedPractice: '模拟 Agent 离线、队列积压、规则校验失败和配置回滚，检查页面状态和操作路径。',
    independentPractice: '用键盘和窄屏完成规则下发与回滚，补齐焦点、确认、错误和表格溢出。',
    commonErrors: [
      '把危险操作做成一行小链接，误触后直接覆盖生产规则。',
      '图表只有颜色，没有数值、时间和无数据状态。',
    ],
    sourceRefs: [
      'React Documentation. https://react.dev/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'Prometheus Documentation. https://prometheus.io/docs/',
    ],
    steps: [
      [
        'Agent 列表突出健康与版本',
        '每一行显示在线状态、最后心跳、Agent 版本、配置版本、队列水位和丢弃数；离线与版本不兼容使用文字和图标共同表达。',
        '运维表先展示异常项',
      ],
      [
        '配置编辑先校验再确认',
        '编辑器实时显示 schema 错误和影响范围，提交前展示规则 diff、目标 Agent 和回滚版本。失败保留草稿。',
        '危险配置必须可比较',
      ],
      [
        '吞吐图表要可读',
        '图表包含时间范围、单位、数据来源、空状态和可访问文本摘要。颜色不是唯一状态，积压阈值用文字标注。',
        '图表也是正文内容',
      ],
      [
        '回滚操作确认影响',
        '回滚显示将恢复的版本、受影响 Agent 和潜在断点，执行后显示同步进度和失败列表。',
        '回滚不是隐藏按钮',
      ],
      [
        '键盘和窄屏完成运维',
        '规则编辑、保存、确认和回滚均可键盘操作，移动端表格改为分组列表，触控目标不小于 44px。',
        '移动端也要能排障',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'LogForge 采集主链路、控制面和前端状态已经可运行。',
    goal: '能验证协议兼容、断网、慢盘、游标损坏、内存安全、规则注入和吞吐基准，证明采集器有界且可恢复。',
    guidedPractice: '运行 ASan/UBSan/TSan、断网和慢盘测试，再让旧 Agent 接收新配置，记录错误和资源。',
    independentPractice: '完成 50MB/s 基准和故障恢复报告，包含内存峰值、队列、重复、漏采和修复证据。',
    commonErrors: [
      '只跑 Debug 构建，不测试优化构建下的未定义行为。',
      '基准只测本地回环，没有模拟网络延迟和磁盘抖动。',
    ],
    sourceRefs: [
      'Clang Sanitizers. https://clang.llvm.org/docs/index.html',
      'Google Benchmark. https://github.com/google/benchmark',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
    ],
    steps: [
      [
        '协议兼容测试覆盖旧版本',
        '旧 Agent 收到未知可选字段应忽略，缺少必需字段应明确失败。控制面不能下发超出 Agent 能力的规则。',
        '协议兼容要自动回归',
      ],
      [
        '内存安全矩阵进入 CI',
        'ASan/UBSan/TSan 分别在支持平台运行，覆盖文件轮转、队列压力、取消和停机。第一条错误栈必须归档。',
        'sanitizer 不是一次性检查',
      ],
      [
        '断网和慢盘重复注入',
        '固定网络和磁盘异常模型，观察队列、内存、丢弃和恢复时间。测试不能只依赖本机偶然负载。',
        '故障注入要可重复',
      ],
      [
        '规则安全限制输入和资源',
        '正则、路径和字段规则设置长度、复杂度和匹配时间上限，避免灾难性回溯或读取任意系统文件。',
        '配置也可能成为攻击入口',
      ],
      [
        '性能报告带资源与正确性',
        'Google Benchmark 和端到端吞吐记录 MB/s、CPU、内存、P99、重复和丢弃，固定构建和硬件。',
        '正确性不通过则不谈性能',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'LogForge 测试、sanitizer 和吞吐基线已经建立。',
    goal: '能构建 C++ 与 Go 固定制品，配置 systemd/容器、指标、日志、发布签名和回滚，并验证 Agent 与控制面兼容。',
    guidedPractice: '让 CI 因 sanitizer、协议兼容和镜像扫描分别失败一次，再发布 Collector 与控制面并演练回滚。',
    independentPractice: '交付发布记录，包含二进制 digest、编译器、配置版本、最低控制面版本、指标和回滚证据。',
    commonErrors: [
      'Agent 二进制没有版本和符号，线上崩溃无法定位。',
      '控制面先升级并下发新规则，旧 Agent 全部解析失败。',
    ],
    sourceRefs: [
      'CMake Documentation. https://cmake.org/documentation/',
      'Kubernetes Documentation. https://kubernetes.io/docs/home/',
      'OpenTelemetry Logs Data Model. https://opentelemetry.io/docs/specs/otel/logs/data-model/',
    ],
    steps: [
      [
        '制品包含版本和符号',
        'Collector 二进制与调试符号分开归档，产物记录编译器、C++ 标准、提交和签名。部署版本可从指标查询。',
        '线上崩溃必须可符号化',
      ],
      [
        'CI 覆盖双语言与协议矩阵',
        'C++ 构建/测试/sanitizer 与 Go 控制面测试分别运行，联合测试覆盖旧 Agent 和新控制面、新 Agent 和旧控制面。',
        '跨语言项目需要联合门禁',
      ],
      [
        'Collector 指标暴露有界状态',
        '采集速率、队列水位、丢弃、发送延迟、游标错误和版本进入指标；控制面心跳展示。日志避免输出原始业务内容。',
        '先观测资源和丢失',
      ],
      [
        '发布顺序保证兼容',
        '先发布兼容旧 Agent 的控制面，再逐步升级 Agent。配置只使用能力协商允许的字段，失败可回滚规则版本。',
        '控制面先向前兼容',
      ],
      [
        '回滚验证采集连续性',
        '回滚 Agent 或控制面后检查游标继续、队列恢复和重复可去重，执行一次真实文件采集冒烟。',
        '版本回滚不能造成漏采',
      ],
    ],
  },
  {
    name: '综合训练 · LogForge 日志采集器 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'LogForge 已部署测试环境，具备指标、日志、协议兼容和回滚能力。',
    goal: '能演练内存增长、目标断网、慢盘、游标损坏、规则爆炸和 Agent 升级失败，完成降级、恢复、对账和源码答辩。',
    guidedPractice: '同时制造后端慢响应和规则匹配变慢，观察队列、CPU、丢弃与内存，再恢复并核对游标。',
    independentPractice: '写故障报告，区分触发因素、放大因素、根因、恢复动作、重复或漏采数量和后续修复。',
    commonErrors: [
      '恢复后只看到采集继续，没有核对从断点到恢复的事件数量。',
      '只优化 CPU，没有观察队列和内存是否仍无界。',
    ],
    sourceRefs: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
      'Clang Sanitizers. https://clang.llvm.org/docs/index.html',
    ],
    steps: [
      [
        '目标断网演练有界队列',
        '暂停接收端，观察队列达到高水位后的读取暂停或丢弃策略。恢复后按游标继续并记录重复数量。',
        '断网时内存不能增长',
      ],
      [
        '慢盘演练控制读取频率',
        '降低磁盘吞吐或注入延迟，检查轮询、CPU、队列和超时。慢盘恢复后不能重复读取已完成位置。',
        '磁盘故障不能忙等',
      ],
      [
        '游标损坏演练安全恢复',
        '篡改游标和临时文件，验证校验失败、保留现场和人工恢复路径。恢复后说明可能重复范围。',
        '损坏恢复必须可审计',
      ],
      [
        '规则爆炸演练限制资源',
        '下发高复杂度正则或超大过滤规则，确认配置校验、匹配上限和回滚有效，不拖垮 EventLoop。',
        '控制面错误不能拖死 Agent',
      ],
      [
        '答辩解释内存与一致性取舍',
        '回答 Asio 模型、有界队列、批次幂等、游标提交和协议兼容为何这样设计；用吞吐、sanitizer、断网和恢复数据支撑。',
        '系统项目答辩以资源证据为核心',
      ],
    ],
  },
];

const LOGFORGE_STEP_SUFFIXES: Readonly<Record<string, string>> = {
  '把有界内存写成硬约束': '队列高水位、硬上限和丢弃策略都要进入指标与压测。',
  '形成首版闭环': '每项非目标要说明会在什么容量或故障条件下重新评估。',
  '范围收敛到采集闭环': '规则、队列、批次和游标形成最小可恢复链路。',
  '吞吐与资源共同验收': '报告必须同时包含 MB/s、CPU、内存、P99 和丢弃率。',
  '断网和慢磁盘是必测场景': '故障注入要固定网络和磁盘模型并可持续复现。',
  '崩溃恢复检查重复与漏采': '恢复报告要列出断点、批次和可解释的重复范围。',
  '冻结规则和协议版本': '配置能力协商和最低兼容版本进入发布门禁。',
  '配置下发以声明式规则为主': 'Agent 校验失败时保留旧版本并报告稳定错误码。',
  '心跳报告资源与积压': '控制面按心跳时间判断离线，并保留最近错误摘要。',
  '运维台只展示可行动状态': '每个异常状态都要给出下一步操作和影响范围。',
  '控制面保存期望与观测状态': '配置、心跳和审计分开保存，避免覆盖历史。',
  '游标写入必须原子': '恢复时要校验内容和文件身份，失败则保留现场。',
  '事件 ID 支持去重': '同一批重发使用相同 ID，接收端才能安全去重。',
  '配置版本不可变': '每次下发生成新版本，回滚只是切换引用。',
  '迁移兼容旧 Agent': '新字段保持可选，能力协商决定是否下发。',
  'Collector 按输入、处理、输出分层': '跨线程对象用明确所有权和生命周期管理。',
  '控制面和 Collector 独立发布': '兼容矩阵必须覆盖双版本组合。',
  'README 跑通注册到发送': '失败场景也要给出命令、日志和预期错误。',
  '队列容量和背压策略显式': '达到硬上限时必须停止读取或按策略丢弃。',
  '批次发送与游标分离': '接收成功和游标提交之间允许可去重重复。',
  '慢盘和文件轮转稳定处理': '比较 inode、大小和头部指纹后再切换文件。',
  '优雅停机保存状态': '停机等待在途批次、提交游标并记录超时。',
  'Agent 列表突出健康与版本': '异常项应优先排序并显示最后心跳。',
  '配置编辑先校验再确认': '提交前显示 diff、影响 Agent 和回滚版本。',
  '吞吐图表要可读': '图表提供单位、时间范围、阈值和文字摘要。',
  '回滚操作确认影响': '执行后展示同步进度和失败 Agent 列表。',
  '键盘和窄屏完成运维': '移动端表格改为分组列表并保持触控目标。',
  '协议兼容测试覆盖旧版本': '未知字段、缺失字段和能力不足都要有样例。',
  '内存安全矩阵进入 CI': 'ASan、UBSan 和 TSan 分工运行并归档错误栈。',
  '断网和慢盘重复注入': '观察队列、内存、丢弃和恢复时间是否有界，并记录关键指标。',
  '规则安全限制输入和资源': '正则长度、复杂度和单次匹配时间都要设上限。',
  '性能报告带资源与正确性': '必须先通过功能与恢复测试，再比较性能。',
  '制品包含版本和符号': '二进制、调试符号和构建 ID 要一起归档。',
  'Collector 指标暴露有界状态': '队列、丢弃、游标错误和版本必须可查询。',
  '发布顺序保证兼容': '控制面先支持旧 Agent，再逐步升级采集端。',
  '回滚验证采集连续性': '回滚后执行真实文件采集并核对重复范围。',
  '目标断网演练有界队列': '恢复后检查队列下降、内存回落并保留水位快照。',
  '慢盘演练控制读取频率': '慢盘恢复后不能重复读取已完成偏移，并记录恢复时间。',
  '游标损坏演练安全恢复': '恢复动作必须记录可能重复的数据范围和人工确认记录。',
  '规则爆炸演练限制资源': '配置校验和回滚必须阻止 EventLoop 被拖垮。',
  '答辩解释内存与一致性取舍': '回答要引用 sanitizer、吞吐和故障恢复数据。',
};

const LOGFORGE_STEP_EXAMPLES: Readonly<Record<string, LearningV2LessonExample>> = {
  '按角色定义采集责任': {
    title: 'Agent、控制面和运维角色边界',
    language: 'yaml',
    code: `roles:
  platform_engineer:
    can: [agent:register, config:publish, agent:drain]
  service_owner:
    can: [collector:read, config:propose]
    scope: project_id
  sre:
    can: [metric:read, queue:drain, agent:disable]
  security_auditor:
    can: [audit:read, config:read]
agent_identity:
  proof: [mtls_spiffe, enrollment_token_one_time]
  cannot_select_other_tenant: true`,
    output: `$ logforgectl policy check ops/roles.yaml
roles=4 permissions=11 cross_tenant_grants=0
agent_identity=mTLS+enrollment_token
失败边界：Agent 注册令牌只能使用一次并绑定租户；服务负责人不能直接向全部 Agent 推规则。`,
  },
  '画清文件到后端的链路': {
    title: '日志采集链路与断点',
    language: 'text',
    code: `file write -> inotify/kqueue hint
-> bounded read queue -> multiline assembler -> filter/redact
-> batch encoder -> HTTP/gRPC send -> receiver ack
-> cursor persist -> metrics/health
control plane: enrollment -> desired config vN -> agent observed config vN
可选磁盘缓冲只保存有界批次，不作为永久队列`,
    output: `$ logforgectl trace pipeline --agent agent-7 --file /var/log/app/access.log
file_bytes=824311 queue_depth=6 batch_id=b-91 cursor_offset=824311
ack=true cursor_persisted=true observed_config=27
失败边界：收到 HTTP 200 但游标提交失败会产生可去重重复，不能在发送前提交游标。`,
  },
  '把有界内存写成硬约束': {
    title: '固定容量队列与丢弃指标',
    language: 'cpp',
    code: `template <std::size_t Capacity>
class BoundedQueue {
 public:
  bool TryPush(LogLine line) {
    std::unique_lock lock(mu_, std::try_to_lock);
    if (!lock.owns_lock() || queue_.size() == Capacity) {
      dropped_.fetch_add(1, std::memory_order_relaxed);
      return false;
    }
    queue_.push_back(std::move(line));
    cv_.notify_one();
    return true;
  }
  std::size_t Dropped() const { return dropped_.load(); }
 private:
  std::mutex mu_;
  std::condition_variable cv_;
  std::deque<LogLine> queue_;
  std::atomic<std::size_t> dropped_{0};
};
static_assert(sizeof(LogLine) <= 512);`,
    output: `$ ./build/logforge_agent --test-queue-capacity=4096
capacity=4096 high_water=4096 dropped=127 rss_growth_kb=0
queue_push_failures=127 metric=logforge_queue_dropped_total
失败边界：队列满时必须停止读取或按策略丢弃并计数；无限 queue 会把磁盘慢消费变成 OOM。`,
  },
  '识别轮转与重复风险': {
    title: '文件身份与头部指纹防重复',
    language: 'cpp',
    code: `struct FileIdentity {
  std::uint64_t device;
  std::uint64_t inode;
  std::uint64_t size;
  std::array<std::byte, 64> head_hash;
};
bool IsSameFile(const FileIdentity& cursor, const FileIdentity& current) {
  return cursor.device == current.device
      && cursor.inode == current.inode
      && cursor.size <= current.size
      && cursor.head_hash == current.head_hash;
}
void OnRotate(const std::filesystem::path& path) {
  auto id = Stat(path);
  if (!IsSameFile(persisted_cursor_, id)) {
    persisted_cursor_ = FreshCursor(id);
    metrics.Increment("logforge_rotate_detected_total");
  }
}`,
    output: `$ ./logforge_agent --fixture rotate-copytruncate --dry-run
old_inode=711 new_inode=711 size_before=900 size_after=12
head_hash_match=false action=reset_offset duplicate_lines=0
失败边界：只比较路径或 inode 会漏掉 copytruncate；读取到旧尾部和截断新头部可能产生重复。`,
  },
  '形成首版闭环': {
    title: '首版采集端到端状态',
    language: 'yaml',
    code: `release: logforge-agent-mvp-1
in_scope:
  - enrollment_with_one_time_token
  - versioned_polling_config
  - tail_file_with_rotation_detection
  - bounded_queue_and_batch_send
  - at_least_once_delivery_with_event_id
  - metrics_and_local_health
out_of_scope:
  - arbitrary_remote_shell
  - cluster_wide_log_search
  - permanent_disk_queue
failure_contract:
  network_down: pause_read_at_high_water
  cursor_write_error: stop_commit_and_expose_health`,
    output: `$ logforgectl release simulate --scenario mvp
register=ok config=applied tail=batch-1 sent=true ack=true cursor=saved
network_down_queue=bounded cursor_error=blocked
失败边界：首版没有可靠游标、去重 ID 或背压时，不能因为能发出一条日志就判定闭环。`,
  },
  '范围收敛到采集闭环': {
    title: '采集闭环验收场景',
    language: 'gherkin',
    code: `Scenario: 文件新增日志在断网后恢复
  Given agent-7 配置采集 access.log
  And 接收端暂停 30 秒
  When 文件写入 1000 行且队列达到高水位
  Then Agent 内存不超过 64 MiB
  And 读取暂停而不是无限增长
  When 接收端恢复
  Then 所有已确认批次最终送达
  And event_id 去重后没有重复入库
  And cursor 指向最后确认位置`,
    output: `$ logforge-e2e run scenarios/collector-recovery.feature
memory_peak_mb=61.8 queue_high_water=4096
recovered_batches=7 duplicate_inserts=0 cursor_offset=1024000
失败边界：网络恢复后若重发全部文件或漏掉最后一批，即使告警清零也不算闭环。`,
  },
  '吞吐与资源共同验收': {
    title: '吞吐、CPU、内存和丢弃基线',
    language: 'bash',
    code: `./build/logforge_agent --config fixtures/throughput.yaml --duration 60s --json
jq '{mb_per_sec, cpu_pct, rss_mb, p99_batch_ms, dropped, duplicate}' report.json
perf stat -e task-clock,cycles,context-switches \\
  ./build/logforge_agent --config fixtures/throughput.yaml --duration 60s
logforgectl soak verify --report report.json --max-rss-mb 64 --max-drop-rate 0.001`,
    output: `$ ./scripts/throughput-baseline.sh
mb_per_sec=18.4 cpu_pct=31 rss_mb=42.7 p99_batch_ms=180
dropped=0 duplicate=0 soak_verified=true
失败边界：只报最高 MB/s 而不报 CPU、内存和丢弃率，会掩盖靠无限缓冲取得的高吞吐。`,
  },
  '断网和慢磁盘是必测场景': {
    title: '网络暂停与 20MB/s 磁盘限速',
    language: 'bash',
    code: `tc qdisc add dev eth0 root netem delay 200ms loss 20%
fio --name=slowlog --filename=/tmp/logforge/access.log --size=2G \\
  --rw=write --bs=64k --rate=20m --runtime=40 --time_based
./build/logforge_agent --config fixtures/slow-disk.yaml --duration 45s
tc qdisc del dev eth0 root
jq '{rssMb,queueDropped,readPaused,p99Ms}' artifacts/slow-disk.json`,
    output: `$ ./scripts/network-disk-drill.sh
network_delay=200ms loss=20% disk_rate=20MB/s
rssMb=58.4 queueDropped=31 readPaused=true p99Ms=430
recovery_seconds=6
失败边界：故障注入必须固定网络与磁盘参数；仅在本地复制大文件无法建立可复现基线。`,
  },
  '崩溃恢复检查重复与漏采': {
    title: 'SIGKILL 后从游标恢复',
    language: 'bash',
    code: `./build/logforge_agent --config fixtures/crash.yaml --cursor /tmp/lf.cursor &
agent=$!
for i in $(seq 1 5000); do printf 'line-%s\n' "$i"; done >> /tmp/logforge/access.log
kill -9 "$agent"
sleep 1
./build/logforge_agent --config fixtures/crash.yaml --cursor /tmp/lf.cursor
logforge-receiver verify --from-event 1 --dedupe-by event_id --expect-lines 5000`,
    output: `$ ./scripts/crash-recovery.sh
cursor_offset=436120 events_replayed=117 duplicate_events=117
missing_lines=0 receiver_unique_lines=5000
recovery_report=present
失败边界：可能重复可以接受但必须可去重且范围可解释；漏采或游标越过未确认数据不可接受。`,
  },
  '冻结规则和协议版本': {
    title: '能力协商与最低 Agent 版本',
    language: 'yaml',
    code: `protocol: logforge.v2
control_plane:
  supported_agent_versions: ">=2.3 <3"
  minimum_for_config_push: 2.3.0
features:
  multiline_v2: {requires_agent: ">=2.3"}
  compression_zstd: {requires_agent: ">=2.4"}
  cursor_checksum: {requires_agent: ">=2.3"}
compatibility:
  unknown_fields: ignore
  removed_fields: reject_config
  schema_fixture: fixtures/protocol/v2-golden.json`,
    output: `$ logforgectl protocol gate fixtures/agent-capabilities.json
agent_version=2.3.4 protocol=v2 supported=true
features=[multiline_v2,cursor_checksum] unsupported=[compression_zstd]
失败边界：控制面使用未协商能力可能让旧 Agent 静默丢日志；最低版本必须进入发布门禁。`,
  },
  'Agent 注册包含身份和版本': {
    title: '一次性注册与证书身份',
    language: 'json',
    code: `{
  "enrollmentToken": "enroll-6f3d-single-use",
  "tenantId": "tenant-acme",
  "projectId": "project-payments",
  "hostname": "api-07",
  "os": "linux",
  "arch": "amd64",
  "agentVersion": "2.4.1",
  "buildId": "sha256:9c3e...",
  "capabilities": ["multiline_v2", "compression_zstd", "cursor_checksum"]
}`,
    output: `$ curl -sS -X POST localhost:8443/v1/agents/enroll -d @enroll.json | jq
agentId=agent-7 status=active configVersion=27
certificateSubject=spiffe://logforge/tenant-acme/agent-7
expiresIn=86400
失败边界：同一注册令牌第二次使用必须 401；主机名和自报版本不能替代证书身份。`,
  },
  '配置下发以声明式规则为主': {
    title: '不可变声明式采集配置',
    language: 'yaml',
    code: `apiVersion: logforge/v2
kind: CollectorConfig
metadata: {name: payments-access}
spec:
  inputs:
    - type: file
      path: /var/log/payments/access.log
      multiline: {pattern: '^\\d{4}-\\d{2}-\\d{2}', maxLines: 64}
  filters:
    - type: redact
      field: authorization
  output:
    endpoint: https://ingest.internal/v2/batches
    compression: zstd
  queue:
    capacity: 4096
    highWatermark: 3072`,
    output: `$ logforgectl config validate payments-access.yaml
document=valid versionGenerated=28 rules=4
max_queue_bytes=67108864 destructive_action=none
$ logforgectl config diff 27 28
仅新增 redact authorization 规则；文件路径与输出不变
失败边界：配置中的未知字段或超出硬上限的队列要拒绝整份配置，不能部分应用。`,
  },
  '批量协议明确批次边界': {
    title: '带 eventId 的批次协议',
    language: 'protobuf',
    code: `syntax = "proto3";
message LogEvent {
  string event_id = 1;
  string agent_id = 2;
  int64 file_offset = 3;
  int64 observed_at_unix_nano = 4;
  bytes payload = 5;
}
message LogBatch {
  string batch_id = 1;
  string config_version = 2;
  uint32 sequence = 3;
  repeated LogEvent events = 4;
}
message BatchAck {
  string batch_id = 1;
  bool duplicate = 2;
  int64 committed_through_offset = 3;
}`,
    output: `$ protoc --descriptor_set_out=batch.pb logforge.proto
$ logforgectl protocol inspect batch.pb
messages=3 required=event_id,batch_id,config_version
max_events=10000 max_payload=8MiB ack_has_offset=true
失败边界：批次缺 batch_id 或重复事件没有稳定 event_id 时，接收端无法安全去重与确认。`,
  },
  '心跳报告资源与积压': {
    title: 'Agent 心跳资源与配置状态',
    language: 'json',
    code: `{
  "agentId": "agent-7",
  "observedAt": "2026-11-24T10:31:08Z",
  "agentVersion": "2.4.1",
  "configVersion": 27,
  "queueDepth": 214,
  "queueCapacity": 4096,
  "bytesPerSecond": 4821032,
  "cursorLagBytes": 12013,
  "rssBytes": 47185920,
  "droppedEvents": 0,
  "lastError": null
}`,
    output: `$ curl -sS localhost:8080/v1/agents/agent-7 | jq '.health,.queueDepth'
"healthy"
214
$ logforgectl agent reap --older-than 90s
reaped=0 stale=0
失败边界：心跳只报 online 无法定位慢消费；缺 observedAt 或版本会导致误判和错误配置下发。`,
  },
  '运维台只展示可行动状态': {
    title: 'Agent 告警状态与动作映射',
    language: 'typescript',
    code: `type AgentSignal = 'healthy' | 'config_drift' | 'queue_saturated' | 'cursor_error';
const actionBySignal: Record<AgentSignal, { label: string; command: string }> = {
  healthy: { label: '查看详情', command: 'view' },
  config_drift: { label: '重新下发配置', command: 'republish-config' },
  queue_saturated: { label: '降低读取速率并检查接收端', command: 'throttle-input' },
  cursor_error: { label: '暂停 Agent 并保留游标现场', command: 'pause-agent' },
};
export const stateText = (signal: AgentSignal) => ({
  healthy: '采集正常', config_drift: '配置未生效',
  queue_saturated: '队列接近上限', cursor_error: '游标写入失败',
}[signal]);`,
    output: `$ pnpm vitest run src/agents/actionBySignal.test.ts
signals=4 mapped_actions=4 unmapped=0
cursor_error_action=pause-agent preserves_on_call_link=true
失败边界：只显示“异常”而没有影响范围、下一步和负责人，运维仍无法安全处理。`,
  },
  '控制面保存期望与观测状态': {
    title: '期望配置、观测心跳和审计分表',
    language: 'sql',
    code: `CREATE TABLE desired_config (
  agent_id UUID NOT NULL,
  version INTEGER NOT NULL,
  spec JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (agent_id, version)
);
CREATE TABLE agent_observation (
  agent_id UUID NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  config_version INTEGER NOT NULL,
  queue_depth INTEGER NOT NULL,
  rss_bytes BIGINT NOT NULL,
  last_error TEXT,
  PRIMARY KEY (agent_id, observed_at)
);
CREATE TABLE config_audit (
  id BIGSERIAL PRIMARY KEY, agent_id UUID, version INTEGER,
  action TEXT, actor UUID, diff JSONB, created_at TIMESTAMPTZ DEFAULT now()
);`,
    output: `$ psql "$LOGFORGE_DB" -f migrations/001_control_plane.sql
CREATE TABLE
CREATE TABLE
CREATE TABLE
$ logforgectl agent status agent-7 --json | jq '.desiredVersion,.observedVersion'
28
27
失败边界：用一条 agent 行覆盖期望与心跳会丢失历史，并让配置漂移无法审计。`,
  },
  '游标写入必须原子': {
    title: '临时文件、fsync 与原子重命名',
    language: 'cpp',
    code: `void PersistCursor(const Cursor& cursor, const fs::path& target) {
  const auto temp = target.string() + ".tmp";
  const int fd = ::open(temp.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (fd < 0) throw std::system_error(errno, std::generic_category());
  const auto bytes = EncodeWithChecksum(cursor);
  WriteAll(fd, bytes);
  if (::fsync(fd) != 0) { ::close(fd); throw std::system_error(errno, std::generic_category()); }
  ::close(fd);
  if (::rename(temp.c_str(), target.c_str()) != 0) {
    throw std::system_error(errno, std::generic_category());
  }
}
// 目录 fsync 后游标才具备崩溃持久性`,
    output: `$ ./logforge_agent --test-cursor-crash-point=before-rename
temp_checksum=valid target_previous=valid recovery=replay-batch-91
duplicate_events=12 missing_events=0
失败边界：直接截断写目标文件会在崩溃后产生半写游标；必须保留可验证的旧版本或临时文件。`,
  },
  '事件 ID 支持去重': {
    title: '稳定 eventId 生成与接收端去重',
    language: 'sql',
    code: `CREATE TABLE ingested_event (
  event_id CHAR(32) PRIMARY KEY,
  tenant_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  file_offset BIGINT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  payload BYTEA NOT NULL
);
INSERT INTO ingested_event
  (event_id,tenant_id,agent_id,batch_id,file_offset,observed_at,payload)
VALUES (:event_id,:tenant,:agent,:batch,:offset,:observed,:payload)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;
-- 返回 0 行表示重复，Ack 仍可成功 */
SELECT count(*) FILTER (WHERE inserted) AS inserted,
       count(*) FILTER (WHERE NOT inserted) AS duplicates
FROM ingest_batch;`,
    output: `$ psql "$LOGFORGE_DB" -f ops/ingest-batch.sql
inserted=998 duplicates=2
$ logforgectl receiver ack --batch b-91
batch_id=b-91 duplicate=partial emitted_events=998
失败边界：eventId 不能只是随机 UUID；同一事件重发必须得到相同 ID，否则去重策略无效。`,
  },
  '配置版本不可变': {
    title: '配置发布、回滚与审批',
    language: 'bash',
    code: `logforgectl config create --agent agent-7 --file config/payments-v29.yaml \\
  --reason "mask authorization header" --dry-run
logforgectl config approve cfg-29 --approver security-owner
logforgectl config publish cfg-29 --canary agent-7
logforgectl agent wait-config agent-7 --version 29 --timeout 60s
logforgectl config rollback --agent agent-7 --to 28 --reason "parser regression"
logforgectl audit show --agent agent-7 --since 10m`,
    output: `$ ./scripts/config-rollback.sh
dry_run=valid approval=security-owner canary=agent-7
observed_version=29 then rollback_observed=28
audit_entries=4 old_versions_retained=true
失败边界：原地编辑配置会破坏审计和回滚；回滚不能删除新版本，只能把期望版本切回旧值。`,
  },
  '迁移兼容旧 Agent': {
    title: '新增可选字段的双版本协议迁移',
    language: 'protobuf',
    code: `// 旧 Agent 发送 v2 LogEvent；新控制面必须继续接受。
message LogEvent {
  string event_id = 1;
  string agent_id = 2;
  int64 file_offset = 3;
  bytes payload = 4;
  reserved 5;                    // 已删除字段，永不复用编号
  string parser_version = 6;    // 新可选字段
  Compression compression = 7; // UNKNOWN 默认值
}
enum Compression { COMPRESSION_UNKNOWN = 0; NONE = 1; ZSTD = 2; }
// capability=compression_zstd 时才下发 ZSTD`,
    output: `$ buf lint proto && buf breaking proto --against .git#branch=main
lint=PASS breaking=0
$ logforgectl compat run --old-agent 2.3.4 --config cfg-29
config=accepted negotiated_compression=none
失败边界：复用删除字段编号或把新字段设为必填，会让旧 Agent 解析失败或错误解释字节。`,
  },
  'Collector 按输入、处理、输出分层': {
    title: 'Asio Collector 的模块所有权',
    language: 'text',
    code: `collector/
  input/
    file_tailer.cpp        // open/read only; owns file descriptor
    rotation_detector.cpp
  pipeline/
    multiline_assembler.cpp
    redaction_filter.cpp
    bounded_queue.hpp
  output/
    batch_encoder.cpp
    http_sender.cpp
    cursor_store.cpp
  core/
    app.cpp                // lifecycle only
  test/
    fake_input.cpp fake_sender.cpp`,
    output: `$ cmake --build build --target logforge_agent && ./build/logforge_agent --self-check
layers=input,pipeline,output,core
socket_io_on=asio io_context=1 queue_owner=pipeline
self_check=PASS
失败边界：文件读取、发送和游标共享可变全局状态会导致竞态；每层只通过明确消息传递所有权。`,
  },
  '构建固定编译器和依赖': {
    title: '可复现 C++ 构建参数',
    language: 'cmake',
    code: `cmake_minimum_required(VERSION 3.28)
project(logforge_agent LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
find_package(Boost 1.86 REQUIRED COMPONENTS system)
find_package(OpenSSL 3.0 REQUIRED)
add_executable(logforge_agent src/main.cpp src/collector/*.cpp)
target_compile_options(logforge_agent PRIVATE -Wall -Wextra -Wpedantic)
target_compile_definitions(logforge_agent PRIVATE LOGFORGE_VERSION="2.4.1")
target_link_libraries(logforge_agent PRIVATE Boost::system OpenSSL::SSL)
install(TARGETS logforge_agent RUNTIME DESTINATION bin)`,
    output: `$ cmake --preset linux-release && cmake --build --preset linux-release
-- compiler: GCC 14.2.0
-- Boost 1.86.0 OpenSSL 3.4.0
[100%] Built target logforge_agent
$ ./build/logforge_agent --version
logforge_agent 2.4.1
失败边界：未固定编译器镜像、Boost 和 OpenSSL 版本会产生不同 ABI 与行为；release 必须带可追踪版本。`,
  },
  '控制面和 Collector 独立发布': {
    title: '控制面与 Agent 兼容矩阵',
    language: 'yaml',
    code: `releases:
  control-plane: 2026.11.24
  agent: 2.4.1
compatibility:
  control_plane_supports_agent: ">=2.3 <3"
  agent_supports_protocol: ["v2"]
  minimum_config_reader: 2.3.0
checks:
  - old_agent_new_control: fixtures/agent-2.3.4.json
  - new_agent_old_control: fixtures/control-2026.10.json
  - mixed_cluster_config_versions: [27, 28, 29]`,
    output: `$ logforgectl release matrix verify release.yaml
pairs=3 old_agent_new_control=pass new_agent_old_control=pass
mixed_versions=pass unsupported_combinations=0
失败边界：控制面与 Agent 同时升级会失去回滚窗口；必须保证至少两个版本交叉兼容。`,
  },
  '本地环境包含真实目标': {
    title: '真实文件、接收端和控制面 Compose',
    language: 'yaml',
    code: `services:
  control-plane:
    build: {context: ., target: control-plane}
    ports: ["8080:8080", "8443:8443"]
  receiver:
    build: {context: ., target: receiver}
    ports: ["9000:9000"]
  postgres:
    image: postgres:16.3-alpine
  kafka:
    image: bitnami/kafka:3.7.0
  log-producer:
    image: alpine:3.20
    command: ["/bin/sh","-c","while true; do date; sleep 0.2; done"]
    volumes: ["./tmp/logs:/var/log/app"]
  agent:
    build: {context: ., target: agent}
    command: ["/usr/local/bin/logforge_agent","--config","/etc/logforge/config.yaml"]`,
    output: `$ docker compose up -d --wait
control-plane healthy receiver healthy postgres healthy kafka healthy
$ docker compose exec agent logforge_agent --health
config=applied files=1 sent_batches=12 cursor=valid
失败边界：只用内存 fake 输入无法验证 inotify、轮转和 fsync；本地环境至少要有真实文件。`,
  },
  'README 跑通注册到发送': {
    title: '从空环境注册并发送首批日志',
    language: 'bash',
    code: `git clone https://example.test/acme/logforge.git
cd logforge
cp .env.example .env
docker compose up -d --build --wait
token=$(logforgectl enroll create --tenant local --ttl 5m | jq -r '.token')
docker compose exec agent logforge_agent enroll --token "$token"
printf '{"level":"info","msg":"hello"}\n' >> tmp/logs/app.log
logforgectl agent wait-healthy agent-local --timeout 30s
logforgectl receiver query --event-text hello
./scripts/verify-readme.sh`,
    output: `$ ./scripts/verify-readme.sh
enrollment=ok config=applied file_lines=1 cursor=saved
receiver_event=hello duplicate=0
elapsed=72s result=PASS
失败边界：README 没有覆盖证书、配置校验和真实接收确认时，不能证明从空环境可用。`,
  },
  'IO 回调保持非阻塞': {
    title: 'Asio 回调只投递工作不压日志',
    language: 'cpp',
    code: `void FileTailer::HandleRead(const boost::system::error_code& ec,
                             std::size_t bytes) {
  if (ec == asio::error::operation_aborted) return;
  if (ec) { logger.Error("read", ec); ScheduleRetry(); return; }
  const auto now = Clock::Now();
  for (auto line : SplitLines(buffer_.Substr(0, bytes))) {
    if (!queue_.TryPush(std::move(line))) {
      metrics_.Increment("logforge_queue_dropped_total");
    }
  }
  ScheduleNextRead();
}
// 解析、压缩和发送通过 asio::post 移到有界 worker`,
    output: `$ ./build/logforge_agent --test-slow-receiver --log-level=debug
iocallback_max_us=84 compression_on_io_thread=false
events_processed=18240 queue_dropped=0
失败边界：回调里同步 HTTP 或压缩会阻塞所有 socket 和 timer；慢接收端会直接冻结文件读取。`,
  },
  '队列容量和背压策略显式': {
    title: '高水位暂停读取与硬上限丢弃',
    language: 'yaml',
    code: `queue:
  capacity: 4096
  highWatermark: 3072
  lowWatermark: 1024
  onHighWater: pause_input
  onCapacity: drop_newest_and_count
  maxBatchEvents: 500
metrics:
  depth: logforge_queue_depth
  dropped: logforge_queue_dropped_total
  paused: logforge_input_paused
health:
  degradedAbove: 3072
  criticalAbove: 4000`,
    output: `$ ./build/logforge_agent --fixture slow-receiver --report queue.json
depth=3073 action=pause_input paused=true
depth=4096 dropped=64 action=drop_newest
after_recovery depth=842 paused=false
失败边界：达到硬上限后继续读取会 OOM；只丢弃不计数则会造成无法解释的数据缺口。`,
  },
  '批次发送与游标分离': {
    title: 'Ack 后提交游标',
    language: 'cpp',
    code: `co_await sender_.Send(batch, asio::use_awaitable);
auto ack = co_await sender_.WaitAck(batch.id, 5s, asio::use_awaitable);
if (!ack.duplicate && !ack.accepted) {
  co_return RetryOrPause{ack.reason};
}
cursor_store_.Commit(ack.committed_through_offset, batch.id);
metrics_.Increment("logforge_batch_committed_total");
// 发送成功但 ack 超时：重试同 batch/event ids，不能先推进游标
`,
    output: `$ ./build/logforge_agent --fixture ack-timeout --once
batch=b-91 send=ok ack=timeout cursor=unchanged
retry=b-91 duplicate=true committed_offset=1024000
失败边界：HTTP 200 仅代表接收端收到请求，不代表已持久化；必须以可重复 ack 和游标为准。`,
  },
  '慢盘和文件轮转稳定处理': {
    title: '读取位置、inode 与截断检测',
    language: 'cpp',
    code: `ReadResult FileReader::ReadChunk() {
  const auto st = fs::status(path_);
  if (!fs::exists(st)) return Rotation{};
  const auto size = fs::file_size(path_);
  if (size < cursor_.offset) {
    return Truncated{cursor_.offset, size, HeadHash(path_)};
  }
  return ReadFrom(path_, cursor_.offset, std::min<std::size_t>(64 * 1024, size - cursor_.offset));
}
void OnRotation() {
  CloseOldFile();
  OpenByPath();
  cursor_ = DiscoverCursorOrStartOfFile();
}`,
    output: `$ ./build/logforge_agent --fixture copytruncate
old_offset=1048576 new_size=0 head_hash_changed=true
action=reopen_at_zero duplicate_lines=0
Failed retries=0
失败边界：慢盘下轮询不能忙等；rename、copytruncate 和 inode 复用的恢复策略必须分别处理。`,
  },
  '优雅停机保存状态': {
    title: 'SIGTERM 等待批次并提交游标',
    language: 'cpp',
    code: `void App::Stop() {
  stopping_.store(true);
  tailer_.StopAccepting();
  asio::post(io_, [this] {
    sender_.CancelPendingAfter(25s);
    queue_.Close();
    if (auto batch = queue_.TryPop()) sender_.SendFinal(batch);
    cursor_store_.Flush();
    io_.stop();
  });
}
std::signal(SIGTERM, [](int) { app->RequestStop(); });
std::signal(SIGINT, [](int) { app->RequestStop(); });
// systemd TimeoutStopSec 要大于应用内部 25s`,
    output: `$ systemctl stop logforge-agent
queue_depth=0 in_flight_batch=b-92 ack=received
cursor_offset=1241088 process_exit_ms=3340
失败边界：收到 SIGTERM 立即退出会丢失在途批次；无限等待会让部署或重启被强制 kill。`,
  },
  'Agent 列表突出健康与版本': {
    title: 'Agent 列表健康排序',
    language: 'tsx',
    code: `const sorted = agents.toSorted((a, b) => {
  const severity = { cursor_error: 3, queue_saturated: 2, config_drift: 1, healthy: 0 };
  return severity[b.signal] - severity[a.signal]
    || Date.parse(b.lastHeartbeat) - Date.parse(a.lastHeartbeat);
});
return (
  <ul aria-label="日志采集 Agent">
    {sorted.map((agent) => (
      <li key={agent.id}>
        <strong>{agent.hostname}</strong>
        <span>{agent.signalText}</span>
        <span>v{agent.version} · 配置 {agent.configVersion}</span>
      </li>
    ))}
  </ul>
);`,
    output: `$ pnpm vitest run src/agents/AgentList.test.tsx
cursor_error_before_queue_saturated=true
stale_last_seen=true version_visible=true
healthy_count=14 degraded_count=3 critical_count=1
失败边界：按主机名排序会把游标错误埋在后面；健康状态、配置版本和最后心跳必须同时展示。`,
  },
  '配置编辑先校验再确认': {
    title: '配置 diff 与服务端校验',
    language: 'typescript',
    code: `async function submitConfig(agentIds: string[], yaml: string) {
  const preview = await api.validateConfig({ yaml, targetAgentIds: agentIds });
  if (!preview.valid) return setErrors(preview.errors);
  setConfirmation({
    affected: preview.affectedAgents,
    diff: preview.diff,
    rollbackVersion: preview.currentVersion,
    queueResetRequired: preview.queueResetRequired,
  });
}
async function confirm() {
  await api.publishConfig({ yaml, agentIds, expectedVersion: confirmation.currentVersion });
  toast('配置已进入灰度，观察 Agent 上报版本');
}`,
    output: `$ pnpm vitest run src/config/ConfigEditor.test.tsx
invalid_yaml_publish_button_disabled=true
diff_visible=true affected_agents=2 rollback_version=28
publish_requires_version=true
失败边界：客户端校验只能提示；服务端必须再次验证规则、硬上限和影响对象。`,
  },
  '吞吐图表要可读': {
    title: '吞吐与积压图表单位和阈值',
    language: 'typescript',
    code: `const chart = {
  unit: 'MB/s',
  range: 'last 30 minutes',
  series: [
    { name: '采集吞吐', query: 'rate(logforge_bytes_read_total[1m])' },
    { name: '发送吞吐', query: 'rate(logforge_bytes_sent_total[1m])' },
    { name: '队列深度', query: 'logforge_queue_depth' },
  ],
  thresholds: { queueDepth: 3072, dropRate: 0.001 },
  axis: { x: '时间', y: 'MB/s 或条数' },
  emptyState: '没有心跳数据，检查 Agent 是否在线',
};`,
    output: `$ pnpm vitest run src/metrics/ThroughputChart.test.tsx
unit=MB/s x_axis=time thresholds=visible
empty_state=有动作文本 no_percent_without_denominator=true
失败边界：吞吐与队列画在同一无单位坐标轴会误读；空数据不能显示成 0 MB/s 正常。`,
  },
  '回滚操作确认影响': {
    title: '配置回滚影响确认',
    language: 'tsx',
    code: `function RollbackDialog({ proposal, onConfirm }: Props) {
  return (
    <dialog open aria-labelledby="rollback-title">
      <h2 id="rollback-title">回滚配置到版本 {proposal.targetVersion}？</h2>
      <p>影响 {proposal.agents.length} 个 Agent；采集会短暂重载。</p>
      <p>当前版本：{proposal.currentVersion}；审批人：{proposal.approver}。</p>
      <p>不会删除文件，但尚未确认的批次会重新发送，可能产生可去重重复。</p>
      <button onClick={onConfirm}>确认灰度回滚</button>
      <button onClick={close}>取消</button>
    </dialog>
  );
}`,
    output: `$ pnpm vitest run src/config/RollbackDialog.test.tsx
target_version_visible=true affected_count=2
replay_warning_visible=true confirm_requires_approver=true
失败边界：只写“回滚配置”而不说明批次重发、Agent 数量和回滚版本会诱导误操作。`,
  },
  '键盘和窄屏完成运维': {
    title: '375px 下 Agent 健康与配置操作',
    language: 'typescript',
    code: `test('operates agent card on narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/ops/agents/agent-7');
  await page.getByRole('button', { name: /更多操作/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: '查看配置差异' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /更多操作/ })).toBeFocused();
  expect(await page.locator('body').evaluate((el) => el.scrollWidth)).toBe(375);
});`,
    output: `$ pnpm playwright test tests/ops/mobile-agent.spec.ts
viewport=375x812 menu_keyboard=pass dialog_focus_return=pass
scrollWidth=375 console_errors=0
失败边界：窄屏表格不能挤压到只剩图钉大小；菜单关闭后焦点必须返回触发按钮。`,
  },
  '协议兼容测试覆盖旧版本': {
    title: '旧 Agent 协议兼容夹具',
    language: 'go',
    code: `func TestProtocolCompatibility(t *testing.T) {
  fixtures := []string{
    "agent-2.3.4-no-zstd.json",
    "agent-2.4.1-zstd.json",
    "agent-unknown-field.json",
  }
  for _, name := range fixtures {
    raw := mustRead(t, filepath.Join("fixtures/protocol", name))
    got, err := DecodeAgentCapabilities(raw)
    require.NoError(t, err, name)
    require.NotEmpty(t, got.AgentID)
    require.False(t, got.DecideCompression() == "zstd" && got.Version < "2.4.1")
  }
}`,
    output: `$ go test ./internal/protocol -run TestProtocolCompatibility -v
--- PASS: TestProtocolCompatibility
fixtures=3 unknown_fields=ignored zstd_negotiated_only_for_2_4_1=true
失败边界：只测当前 Agent 会漏掉字段编号、默认值和能力协商对旧版本的影响。`,
  },
  '内存安全矩阵进入 CI': {
    title: 'ASan、UBSan、TSan 构建矩阵',
    language: 'yaml',
    code: `jobs:
  sanitizers:
    strategy:
      matrix:
        sanitizer: [address, undefined, thread]
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: cmake -S . -B build/\${{ matrix.sanitizer }}
          -DCMAKE_CXX_FLAGS="-fsanitize=\${{ matrix.sanitizer }} -fno-omit-frame-pointer"
          -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=\${{ matrix.sanitizer }}"
      - run: cmake --build build/\${{ matrix.sanitizer }} -j2
      - run: ctest --test-dir build/\${{ matrix.sanitizer }} --output-on-failure`,
    output: `$ gh run view 9912 --log
sanitizer(address)=pass sanitizer(undefined)=pass sanitizer(thread)=pass
build_targets=3 tests=48
失败边界：ASan 不能发现数据竞争；TSan 需单独构建并运行并发队列与停机路径。`,
  },
  '断网和慢盘重复注入': {
    title: '故障参数化恢复矩阵',
    language: 'bash',
    code: `for loss in 20 100; do
  for rate in 5m 20m; do
    tc qdisc replace dev eth0 root netem loss "\${loss}%"
    fio --name=slow --filename=/tmp/logforge/a.log --rw=write --bs=64k \\
      --rate="$rate" --runtime=30 --time_based
    ./build/logforge_agent --config fixtures/recovery.yaml --duration 30s \\
      --report "artifacts/loss-\${loss}-rate-\${rate}.json"
  done
done
logforgectl recovery verify artifacts/*.json --max-rss-mb 64 --max-drop-rate 0.005`,
    output: `$ ./scripts/recovery-matrix.sh
loss_20_rate_5m=rss57.1 dropped=0 cursor_valid=true
loss_100_rate_5m=rss63.4 dropped=18 recovery=7.2s
loss_20_rate_20m=rss44.8 dropped=0
失败边界：验证器必须检查最终游标与 eventId 去重，不能只看进程仍存活。`,
  },
  '规则安全限制输入和资源': {
    title: '正则复杂度与单事件超时',
    language: 'cpp',
    code: `struct RuleLimits {
  std::size_t max_pattern_bytes = 2048;
  std::size_t max_input_bytes = 65536;
  std::chrono::milliseconds match_timeout{50};
};
FilterResult ApplyRule(const RegexRule& rule, std::string_view line,
                       const RuleLimits& limits) {
  if (rule.pattern.size() > limits.max_pattern_bytes) return FilterResult::Reject("pattern_too_large");
  if (line.size() > limits.max_input_bytes) return FilterResult::Reject("line_too_large");
  if (!rule.regex.match(line, limits.match_timeout)) return FilterResult::Reject("match_timeout");
  return rule.decision;
}
// 控制面发布前用受限引擎做复杂度扫描`,
    output: `$ ./build/logforge_agent --test-rule '^(a+)+$' --test-line "$(printf 'a%.0s' {1..50000})"
rule=rejected reason=complexity_limit
match_timeout=false process_rss_mb=39.8
失败边界：正则匹配不能无超时运行在 Asio IO 线程；控制面也必须拒绝明显灾难性复杂度。`,
  },
  '性能报告带资源与正确性': {
    title: '性能与恢复联合报告',
    language: 'json',
    code: `{
  "agentVersion": "2.4.1",
  "fixture": "mixed-lines-20mb",
  "throughputMBps": 18.4,
  "cpuPercent": 31.2,
  "rssPeakMB": 58.4,
  "p99BatchMs": 182,
  "queueDropped": 0,
  "recovery": {"kill": "SIGKILL", "missingLines": 0, "duplicateLines": 117},
  "sanitizers": {"address": "pass", "undefined": "pass", "thread": "pass"},
  "reportSha256": "a31d..."
}`,
    output: `$ logforgectl perf verify artifacts/perf-2.4.1.json --max-rss-mb 64
throughput=18.4MB/s cpu=31.2% rss=58.4MB p99=182ms
correctness=pass sanitizers=pass
verdict=ACCEPTED
失败边界：吞吐提升但漏采、重复不可解释或 sanitizer 失败时必须拒绝该性能结论。`,
  },
  '制品包含版本和符号': {
    title: '二进制版本、调试符号与构建 ID',
    language: 'bash',
    code: `cmake --build build/release --target logforge_agent
objcopy --only-keep-debug build/release/logforge_agent logforge_agent.debug
objcopy --strip-debug build/release/logforge_agent logforge_agent
objcopy --add-gnu-debuglink=logforge_agent.debug logforge_agent
readelf -n logforge_agent | Select-String 'Build ID'
sha256sum logforge_agent logforge_agent.debug > SHA256SUMS
file logforge_agent logforge_agent.debug > artifact-types.txt`,
    output: `$ ./scripts/package-agent.sh
version=2.4.1 build_id=3f2a9c...
stripped=yes debuglink=present sha256=written
artifact_size_kb=8421 debug_size_kb=19344
失败边界：生产二进制剥离符号后必须归档 debuglink；否则崩溃栈只剩地址，无法定位代码。`,
  },
  'CI 覆盖双语言与协议矩阵': {
    title: '控制面、Agent 与协议兼容 CI',
    language: 'yaml',
    code: `name: logforge-ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        component: [control-plane, agent]
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build-\${{ matrix.component }}.sh
      - run: ./scripts/test-\${{ matrix.component }}.sh
  compatibility:
    needs: build
    runs-on: ubuntu-24.04
    steps:
      - run: ./scripts/test-agent-matrix.sh --old 2.3.4 --new 2.4.1
      - run: buf breaking proto --against .git#branch=main`,
    output: `$ gh run view 9921 --log
control_plane_build=pass agent_build=pass
agent_matrix=pass protocol_breaking=0
artifact_uploaded=logforge-agent-2.4.1
失败边界：CI 只构建其中一端会漏掉协议握手；旧新 Agent 矩阵失败时不得发布控制面。`,
  },
  'Collector 指标暴露有界状态': {
    title: '队列、游标与配置指标',
    language: 'prometheus',
    code: `logforge_queue_depth{agent_id="agent-7"}
logforge_queue_capacity{agent_id="agent-7"}
logforge_queue_dropped_total{agent_id="agent-7",reason="capacity"}
logforge_cursor_lag_bytes{agent_id="agent-7"}
logforge_cursor_write_errors_total{agent_id="agent-7"}
logforge_config_observed{agent_id="agent-7",version="29"} 1
logforge_batch_ack_latency_seconds_bucket{le="1"}
# 告警：dropped 1m > 0、cursor_write_errors 5m > 0、observed 不等于 desired
`,
    output: `$ curl -s localhost:9100/metrics | Select-String 'logforge_(queue|cursor|config)'
logforge_queue_depth{agent_id="agent-7"} 214
logforge_queue_dropped_total{agent_id="agent-7",reason="capacity"} 0
logforge_cursor_lag_bytes{agent_id="agent-7"} 12013
失败边界：只暴露进程在线无法判断采集停止；队列、丢弃、游标和配置版本都要可查询。`,
  },
  '发布顺序保证兼容': {
    title: '控制面先升级、Agent 后灰度',
    language: 'bash',
    code: `helm upgrade logforge-control-plane charts/control-plane \\
  --set image.tag=2026.11.24 --set protocol.minAgent=2.3.0 --wait
./scripts/smoke-control-plane.sh
kubectl rollout restart daemonset/logforge-agent -n logging
kubectl rollout status daemonset/logforge-agent --timeout=300s
logforgectl agents verify --versions '2.3.x,2.4.1' --config-versions 28,29
./scripts/smoke-collector-continuity.sh`,
    output: `$ ./scripts/release-logforge.sh
control_plane=2026.11.24 min_agent=2.3.0
agent_ready=120 upgraded=120
mixed_protocol_seen=true config_versions=28,29
continuity=PASS
失败边界：先升级全部 Agent 会让旧控制面无法解析新字段；必须保留混合版本窗口。`,
  },
  '回滚验证采集连续性': {
    title: '控制面与 Agent 回滚后持续采集',
    language: 'bash',
    code: `helm rollback logforge-control-plane 17 --wait
kubectl rollout undo daemonset/logforge-agent
kubectl rollout status daemonset/logforge-agent --timeout=300s
printf 'rollback-probe-%s\n' "$(date +%s)" >> /tmp/logforge/access.log
logforgectl receiver wait-event --text-prefix rollback-probe --timeout 30s
logforgectl cursor verify --all-agents --allow-duplicates --max-gap 0
logforgectl config status --expect-versions 28`,
    output: `$ ./scripts/rollback-logforge.sh
control_plane=rolled-back agent=rolled-back
probe_received=true duplicate=0 cursor_valid=true missing_lines=0
observed_config_version=28
失败边界：回滚只检查 Pod Ready 不够；要写真实日志并验证游标、配置和接收端连续性。`,
  },
  '目标断网演练有界队列': {
    title: '接收端断网时暂停读取',
    language: 'bash',
    code: `docker compose pause receiver
dd if=/dev/urandom of=/tmp/logforge/access.log bs=1M count=32 conv=notrunc oflag=append
sleep 10
curl -s localhost:9100/metrics | Select-String 'logforge_queue_(depth|dropped)|logforge_input_paused'
docker compose unpause receiver
logforgectl wait-queue-below 1024 --timeout 120s
logforge-receiver verify --event-ids /tmp/logforge/expected.ids --dedupe`,
    output: `$ ./scripts/network-outage-drill.sh
queue_depth=3072 input_paused=1 dropped=0 rss_mb=59.2
queue_after=814 recovery_seconds=24
missing_events=0 duplicate_events=0
失败边界：断网时内存必须保持有界；恢复后不能重复读取已完成位置或漏掉最后批次。`,
  },
  '慢盘演练控制读取频率': {
    title: '20MB/s 目标盘与退避轮询',
    language: 'bash',
    code: `fio --name=slow --filename=/tmp/logforge/access.log --rw=write \\
  --bs=64k --rate=20m --runtime=60 --time_based --time_based &
./build/logforge_agent --config fixtures/slow-disk.yaml --duration 60s --json > slow.json
jq '{readBytes,avgReadMs,cpuPercent,rssMb,retries,duplicateLines}' slow.json
perf stat -e context-switches,cpu-migrations ./build/logforge_agent \\
  --config fixtures/slow-disk.yaml --duration 10s`,
    output: `$ ./scripts/slow-disk-drill.sh
readBytes=118489088 avgReadMs=3.6 cpuPercent=8.7
rssMb=35.2 retries=0 duplicateLines=0 context-switches=942
失败边界：慢盘不能用无延迟忙等消耗 CPU；恢复后游标应继续且不重复已确认范围。`,
  },
  '游标损坏演练安全恢复': {
    title: '校验失败后隔离游标与人工确认',
    language: 'bash',
    code: `cp /tmp/logforge/cursor.json /tmp/logforge/cursor.json.bak
printf 'tampered' > /tmp/logforge/cursor.json
./build/logforge_agent --config fixtures/recovery.yaml --once --strict-cursor
ls -l /tmp/logforge/cursor.json* artifacts/cursor-incident.json
jq '{status,expectedChecksum,actualChecksum,quarantinePath}' artifacts/cursor-incident.json
logforgectl cursor recover --agent agent-7 --from-last-acked-batch b-91 --confirm`,
    output: `$ ./scripts/cursor-corruption-drill.sh
status=quarantined expected=7f4a actual=invalid
quarantine=cursor.json.corrupt.20261124T103800Z
recovery_from=b-91 duplicate_range=last-batch manual_confirmed=true
失败边界：损坏游标不能静默重置到文件开头；恢复必须记录可能重复范围并保留原文件。`,
  },
  '规则爆炸演练限制资源': {
    title: '复杂正则与超大规则集阻断',
    language: 'yaml',
    code: `rules:
  - id: catastrophic-test
    pattern: '^(a+)+$'
    action: drop
  - id: oversized-pattern
    pattern: 'x{0,100000}'
    action: drop
limits:
  maxPatternBytes: 2048
  maxRulesPerConfig: 64
  maxMatchMsPerEvent: 50
  rejectOnCompileTimeout: true
validation:
  testLine: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  maxCompileMs: 100`,
    output: `$ logforgectl config validate rules-explosion.yaml
rule=catastrophic-test status=rejected reason=complexity_budget
rule=oversized-pattern status=rejected reason=pattern_too_large
published=false old_config_retained=true
失败边界：控制面接受危险正则会让每个 Agent 在事件循环中卡死；必须整份配置拒绝并保留旧版本。`,
  },
  '答辩解释内存与一致性取舍': {
    title: 'LogForge 有界内存与至少一次投递 ADR',
    language: 'markdown',
    code: `# ADR-021：有界队列 + 至少一次投递
## 决策
队列硬上限 4096 条；高水位暂停读取；接收端以 event_id 去重；仅在 ack 后提交游标。
## 备选
无限内存队列：拒绝，慢接收端会导致 OOM。
发送前提交游标：拒绝，崩溃会漏采。
## 证据
断网 10s：rss=59.2MB queue=3072 dropped=0；恢复 24s。
SIGKILL：missing=0 duplicate=117，重复均可按 event_id 去重。
## 剩余风险
文件在确认前被外部删除可能丢数据；需要与业务保留策略联动。`,
    output: `$ logforgectl adr verify docs/adr/021-bounded-at-least-once.md
decision=present alternatives=2 evidence=2 residual_risks=1
metrics=rss,queue,cursor,duplicate missing_events=0
失败边界：没有内存上限、游标和去重证据的“高吞吐”结论不能通过系统项目答辩。`,
  },
};

export const PROGRAMMING_PROJECT_TRAINING_BATCH_06_COURSES =
  LOGFORGE_COURSES_BASE.map((course) => ({
    ...course,
    steps: course.steps.map((step) => {
      const suffix = LOGFORGE_STEP_SUFFIXES[step[0]];
      const example = LOGFORGE_STEP_EXAMPLES[step[0]];
      if (!example) throw new Error(`LogForge example missing for ${course.name}: ${step[0]}`);
      return [step[0], suffix ? `${step[1]} ${suffix}` : step[1], step[2], example] as const;
    }),
  }));
