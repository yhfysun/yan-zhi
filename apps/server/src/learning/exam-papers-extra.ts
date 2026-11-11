import type { ExamPaper, ExamQuestion } from './exams.js';
import {
  getSoftKnowledgeProfile,
  SOFT_OFFICIAL_BOOKS_URL,
  type SoftKnowledgeDomain,
  type SoftOfficialBook,
} from './soft-exam-knowledge.js';

let questionSeq = 0;
const questionId = () => `extra_q_${++questionSeq}`;

const choice = (
  stem: string,
  options: string[],
  answer: number,
  explanation: string,
): ExamQuestion => ({ id: questionId(), kind: 'choice', stem, options, answer, explanation });

const practice = (
  stem: string,
  language: string,
  starterCode: string,
  reference: string,
  explanation: string,
): ExamQuestion => ({
  id: questionId(),
  kind: 'practice',
  stem,
  language,
  starterCode,
  reference,
  explanation,
});

const SOFT_COMMON_BANK: ExamQuestion[] = [
  choice('CPU 中设置高速缓存（Cache）的主要目的是什么？',
    ['扩大主存容量', '缓解 CPU 与主存之间的速度差异', '替代寄存器保存指令', '降低硬盘访问频率'], 1,
    'Cache 利用程序访问的局部性，把常用数据放在更靠近 CPU 的高速存储中。'),
  choice('与 CISC 相比，RISC 指令集的典型特点是什么？',
    ['指令数量多且格式复杂', '单条指令通常完成复杂操作', '指令格式规整并强调流水线执行', '只能用于嵌入式系统'], 2,
    'RISC 通常采用较少、较规整的指令，便于流水线和编译器优化。'),
  choice('下列存储器中，断电后数据通常丢失的是？',
    ['ROM', 'Flash', 'RAM', '硬盘'], 2,
    '普通 RAM 属于易失性存储器，断电后内容不能保持。'),
  choice('计算机总线的主要作用是什么？',
    ['在部件之间传输地址、数据和控制信息', '直接执行高级语言程序', '永久保存操作系统镜像', '只负责显示图像'], 0,
    '总线连接 CPU、内存和外设，承担地址、数据与控制信号的传输。'),
  choice('指令流水线中，后一条指令依赖前一条指令结果而产生的冲突属于？',
    ['结构冲突', '数据冲突', '控制冲突', '存储冲突'], 1,
    '数据冲突（数据冒险）通常来自指令之间的读写依赖。'),
  choice('DMA 技术的主要价值是什么？',
    ['让 CPU 逐字节搬运外设数据', '由专门控制器在外设与内存间直接传输数据', '提高显示器刷新率', '替代所有中断'], 1,
    'DMA 可减少 CPU 参与数据搬运的开销，适用于磁盘、网卡等批量传输。'),
  choice('CPU 中访问速度最快的存储部件通常是？',
    ['寄存器', 'Cache', '主存', '固态硬盘'], 0,
    '寄存器位于 CPU 内部，访问延迟通常低于 Cache 和主存。'),
  choice('RAID 1 的主要数据保护方式是？',
    ['条带化后计算奇偶校验', '把同一数据镜像写入多个磁盘', '按块分散到所有磁盘但不冗余', '压缩后写入单盘'], 1,
    'RAID 1 使用镜像，任一成员盘损坏时仍可由另一份副本恢复数据。'),
  choice('大端序和小端序描述的是什么？',
    ['多字节数据在内存中的字节排列顺序', '磁盘分区的组织方式', '网络地址的分类方式', 'CPU 时钟的频率单位'], 0,
    '端序决定一个多字节数值的高位字节或低位字节在内存中的排列顺序。'),
  choice('浮点数表示中，尾数位数主要影响什么？',
    ['可表示的数值精度', 'CPU 主频', '存储设备的寿命', '网络带宽上限'], 0,
    '在相同格式下，尾数位数越多，可保留的有效数字越多。'),
  choice('栈这种数据结构的基本访问特点是？',
    ['先进先出', '后进先出', '随机访问且不可修改', '只能存储整数'], 1,
    '栈只在栈顶插入和删除，因此后进入的元素先被访问。'),
  choice('图的广度优先遍历通常需要借助哪种数据结构？',
    ['栈', '队列', '优先队列', '并查集'], 1,
    'BFS 按层扩展节点，使用队列保存待访问节点。'),
  choice('在有序数组中执行二分查找，平均时间复杂度是？',
    ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 1,
    '每次比较都会把候选区间缩小一半，因此复杂度为 O(log n)。'),
  choice('哈希表中出现不同关键字映射到同一位置的现象称为什么？',
    ['哈希冲突', '死锁', '缺页', '总线争用'], 0,
    '不同关键字经过哈希函数得到相同桶地址时即发生哈希冲突。'),
  choice('对二叉搜索树进行中序遍历，通常可以得到什么序列？',
    ['按层次排列的序列', '递增有序序列', '逆序的后缀表达式', '随机序列'], 1,
    '二叉搜索树左子树小于根、右子树大于根，中序遍历可得到有序结果。'),
  choice('最小堆中，最小值通常位于哪里？',
    ['根节点', '最左叶节点', '最右叶节点', '任意叶节点'], 0,
    '最小堆满足父节点不大于子节点，因此最小值在根节点。'),
  choice('快速排序在最坏情况下的时间复杂度是？',
    ['O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'], 3,
    '当划分极不平衡时，快速排序可能退化为 O(n²)。'),
  choice('Dijkstra 算法适用于哪类图的单源最短路径问题？',
    ['含负权边的图', '边权非负的图', '只有无向边的图', '必须为完全图'], 1,
    '经典 Dijkstra 算法要求边权非负，否则贪心选择可能失效。'),
  choice('动态规划适合解决的典型问题是？',
    ['具有重复子问题且满足最优子结构的问题', '所有输入都必须排序的问题', '只能执行一次的问题', '没有任何状态转移的问题'], 0,
    '动态规划通过保存子问题结果避免重复计算，前提是问题具有相应结构。'),
  choice('使用邻接矩阵存储含 n 个顶点的图，空间复杂度通常是？',
    ['O(n)', 'O(n log n)', 'O(n²)', 'O(1)'], 2,
    '邻接矩阵需要 n×n 个位置记录顶点之间是否存在边或边权。'),
  choice('稳定排序的含义是什么？',
    ['排序后所有元素都相同', '相等元素的相对次序保持不变', '排序过程不使用额外空间', '排序时间固定为 O(n)'], 1,
    '稳定排序不会交换相等关键字元素的原有相对顺序。'),
  choice('深度优先遍历算法通常可以用哪种方式实现？',
    ['递归或显式栈', '只使用队列', '只使用哈希表', '只能使用堆'], 0,
    'DFS 的回溯过程与栈一致，因此可递归实现，也可用显式栈模拟。'),
  choice('进程从运行态转为阻塞态，通常是因为？',
    ['时间片用完', '等待 I/O 或某事件完成', '被创建', '正常终止'], 1,
    '进程主动等待资源或事件时会进入阻塞态，恢复后再转为就绪态。'),
  choice('产生死锁的必要条件不包括下列哪一项？',
    ['互斥', '占有并等待', '不可剥夺', '所有进程优先级相同'], 3,
    '死锁的必要条件包括互斥、占有并等待、不可剥夺和循环等待。'),
  choice('页面置换算法的主要目标是什么？',
    ['减少缺页次数', '增加磁盘分区数量', '提升 CPU 主频', '减少进程数量'], 0,
    '页面置换算法决定换出哪个页面，以降低缺页率和访问开销。'),
  choice('虚拟内存的主要作用是什么？',
    ['让程序使用可能大于物理内存的地址空间', '完全消除内存访问延迟', '替代文件系统', '让 CPU 不再需要 Cache'], 0,
    '虚拟内存通过映射和换入换出，为进程提供更大的逻辑地址空间。'),
  choice('同一进程内的多个线程通常共享什么？',
    ['地址空间和打开的文件', '各自的栈和寄存器', '各自独立的全部页表', '完全独立的内存空间'], 0,
    '线程共享进程资源，但拥有自己的栈、寄存器和执行上下文。'),
  choice('临界区是指什么？',
    ['多个进程不能同时进入、访问共享资源的代码段', '永远不能中断的代码段', '只能由操作系统执行的代码段', '存放在磁盘上的代码段'], 0,
    '临界区需要互斥访问，以避免共享数据产生竞争条件。'),
  choice('采用分页存储管理主要有助于缓解什么问题？',
    ['外部碎片', 'CPU 指令数量过多', '网络丢包', '磁盘容量不足'], 0,
    '分页把内存划分为固定大小页框，可减少因连续内存分配产生的外部碎片。'),
  choice('进程上下文切换时，操作系统通常需要保存什么？',
    ['当前进程的运行现场信息', '整个硬盘的全部内容', '所有网络数据包', '浏览器历史记录'], 0,
    '寄存器、程序计数器和栈指针等运行现场需要保存，以便之后恢复执行。'),
  choice('文件系统中的索引节点（inode）通常保存什么？',
    ['文件的元数据和数据块位置', '文件的完整文本内容', '用户的屏幕坐标', '网络路由表'], 0,
    'inode 通常记录权限、大小、时间及数据块索引等元数据。'),
  choice('SPOOLing 技术常用于什么场景？',
    ['把独占设备改造成可共享的虚拟设备', '提高 CPU 浮点精度', '压缩数据库索引', '替代所有内存'], 0,
    'SPOOLing 通过磁盘缓冲和队列管理，使打印等独占设备可被多个任务共享。'),
  choice('关系数据库中主键必须满足什么要求？',
    ['唯一且非空', '允许任意重复值', '必须是整数', '只能引用其它表'], 0,
    '主键用于唯一标识元组，因此不能重复，也不能为 NULL。'),
  choice('外键的主要作用是什么？',
    ['维护表之间的引用完整性', '自动提升查询速度', '替代所有索引', '决定表中列的显示顺序'], 0,
    '外键约束保证引用列的值能在被引用表中找到对应记录。'),
  choice('数据库事务的 ACID 中，A 表示什么？',
    ['原子性', '可用性', '一致性', '持久性'], 0,
    'ACID 分别为原子性、一致性、隔离性和持久性。'),
  choice('一个事务读取到另一个未提交事务修改的数据，这种现象称为？',
    ['脏读', '幻读', '不可重复读', '死锁'], 0,
    '脏读读取的是尚未提交且可能回滚的数据。'),
  choice('SQL 中 GROUP BY 子句的主要作用是什么？',
    ['把行按指定列分组', '删除重复表', '创建用户账号', '设置事务隔离级别'], 0,
    'GROUP BY 把具有相同分组键的行归为一组，便于聚合计算。'),
  choice('为数据库列建立索引通常带来什么取舍？',
    ['提高部分查询速度，但增加写入和存储开销', '只提高写入速度', '不占用任何空间', '自动消除所有慢查询'], 0,
    '索引需要维护额外结构，读取可能更快，但插入、更新和删除成本会增加。'),
  choice('数据库视图的主要特点是什么？',
    ['是基于查询定义的虚拟表', '必须单独复制全部底层数据', '不能包含任何列', '只能用于备份'], 0,
    '视图保存查询定义，可为用户提供受控的数据访问方式。'),
  choice('第三范式（3NF）主要要求消除什么？',
    ['非主属性对候选键的传递依赖', '所有外键', '全部索引', '所有空值'], 0,
    '3NF 在 2NF 基础上要求非主属性不传递依赖于候选键。'),
  choice('数据库备份的主要目的是什么？',
    ['在故障或误操作后恢复数据', '提高 CPU 使用率', '删除全部日志', '替代访问控制'], 0,
    '备份提供可用于恢复的数据副本，是数据可靠性保障的重要措施。'),
  choice('关系代数中的自然连接会自动做什么？',
    ['按同名属性进行等值连接并去除重复属性', '只保留左表记录', '把表转换为文本文件', '删除所有不同名属性'], 0,
    '自然连接以同名属性相等为条件，并在结果中合并重复的属性列。'),
  choice('IP 路由选择主要发生在 TCP/IP 模型的哪一层？',
    ['应用层', '传输层', '网际层', '网络接口层'], 2,
    'IP 层负责寻址和路由选择，把数据报转发到下一跳。'),
  choice('TCP 建立连接通常需要几次握手？',
    ['一次', '两次', '三次', '四次'], 2,
    'TCP 通过 SYN、SYN-ACK 和 ACK 三次交互建立可靠连接。'),
  choice('与 TCP 相比，UDP 的主要特点是什么？',
    ['面向连接并提供确认重传', '无连接且开销较小', '保证数据一定按序到达', '只能用于文件传输'], 1,
    'UDP 不建立连接，也不保证可靠到达，但协议开销低、实时性好。'),
  choice('IPv4 子网 192.168.10.0/24 中可分配给主机的地址数量是多少？',
    ['254', '255', '256', '512'], 0,
    '/24 共 256 个地址，扣除网络地址和广播地址后可用 254 个。'),
  choice('DNS 的核心功能是什么？',
    ['把域名解析为 IP 地址', '为磁盘分配分区', '压缩网页图片', '管理进程调度'], 0,
    'DNS 提供域名与 IP 地址等资源记录之间的解析服务。'),
  choice('HTTPS 相比 HTTP 主要增加了什么能力？',
    ['通过 TLS 提供加密、完整性和身份认证', '完全取消 TCP 连接', '自动生成网页内容', '不再需要端口'], 0,
    'HTTPS 在 HTTP 与传输层之间使用 TLS，保护传输内容并验证服务端身份。'),
  choice('ARP 协议的主要用途是什么？',
    ['根据 IP 地址获取对应的 MAC 地址', '把域名转换为邮箱地址', '为进程分配时间片', '同步数据库事务'], 0,
    'ARP 在局域网中通过广播询问目标 IP 对应的链路层地址。'),
  choice('VLAN 的主要作用是什么？',
    ['在交换网络中隔离广播域', '提高硬盘读写速度', '替代操作系统', '加密所有 IP 数据包'], 0,
    'VLAN 把一个物理交换网络划分为多个逻辑广播域，便于隔离和管理。'),
  choice('HTTP 状态码 404 通常表示什么？',
    ['请求成功', '服务器内部错误', '请求的资源不存在', '需要永久重定向'], 2,
    '404 Not Found 表示服务器没有找到请求的目标资源。'),
  choice('防火墙默认拒绝所有入站流量、仅放行明确规则，属于什么策略？',
    ['白名单策略', '黑名单策略', '透明桥接策略', '负载均衡策略'], 0,
    '只允许明确可信流量属于默认拒绝的白名单思路。'),
  choice('软件需求规格说明最重要的质量特征是什么？',
    ['清晰、完整且可验证', '尽可能使用复杂术语', '只描述界面颜色', '不包含任何约束'], 0,
    '需求应让开发和验收各方对功能、约束和验收条件形成一致理解。'),
  choice('瀑布模型的主要特点是什么？',
    ['阶段划分清晰，通常按顺序推进', '完全不需要需求文档', '每个小时自动发布一次', '只适用于人工智能项目'], 0,
    '瀑布模型强调阶段性评审和顺序推进，需求频繁变化时调整成本较高。'),
  choice('敏捷开发强调什么？',
    ['短周期迭代和持续反馈', '一次完成全部需求后再交付', '取消所有测试', '只由管理者编写代码'], 0,
    '敏捷通过小步交付、持续反馈和协作应对变化。'),
  choice('模块设计中通常希望达到什么目标？',
    ['高内聚、低耦合', '低内聚、高耦合', '所有模块共享全部数据', '模块之间没有任何接口'], 0,
    '高内聚表示模块职责集中，低耦合表示模块依赖较少。'),
  choice('黑盒测试主要依据什么设计测试用例？',
    ['程序内部语句结构', '需求规格和输入输出行为', '编译器优化日志', '数据库物理页布局'], 1,
    '黑盒测试不依赖内部实现，重点验证外部行为是否符合规格。'),
  choice('回归测试的主要目的是什么？',
    ['确认修改没有破坏已有功能', '只测试新安装的操作系统', '替代性能测试', '删除失败用例'], 0,
    '代码变更后重新执行相关测试，可以发现意外引入的功能退化。'),
  choice('版本控制系统最核心的能力是什么？',
    ['记录变更历史并支持协作与回溯', '自动编写全部业务代码', '替代数据库事务', '提升显示器分辨率'], 0,
    '版本控制保存提交历史、支持分支合并，并能在需要时恢复旧版本。'),
  choice('代码评审的主要价值是什么？',
    ['尽早发现缺陷并共享设计知识', '完全替代自动化测试', '只统计代码行数', '禁止团队成员修改代码'], 0,
    '代码评审可发现逻辑、可维护性和安全问题，同时促进知识传递。'),
  choice('软件可维护性通常不包括下列哪项？',
    ['可理解性', '可修改性', '可测试性', '界面动画数量'], 3,
    '可维护性关注理解、修改、测试和迁移软件的难易程度，不以动画数量衡量。'),
  choice('MVC 架构中，控制器通常承担什么职责？',
    ['接收输入并协调模型与视图', '永久保存所有二进制数据', '只负责绘制像素', '替代数据库引擎'], 0,
    '控制器处理用户输入和流程调度，使模型与视图保持分离。'),
  choice('信息安全中的机密性主要指什么？',
    ['信息只被授权对象访问', '信息永远不被修改', '信息随时可被删除', '所有信息都公开'], 0,
    '机密性防止未授权读取或披露敏感信息。'),
  choice('与加密相比，哈希函数的主要特点是什么？',
    ['通常不可逆，用于完整性校验', '可随时还原任意原文', '只能用于压缩图片', '不需要任何输入'], 0,
    '哈希把输入映射为固定长度摘要，通常不能从摘要恢复原文。'),
  choice('防止 SQL 注入最有效的常规做法是什么？',
    ['使用参数化查询', '把报错信息全部展示给用户', '拼接字符串后直接执行', '关闭数据库日志'], 0,
    '参数化查询把数据与 SQL 结构分离，可避免输入被解释为语句。'),
  choice('最小权限原则要求什么？',
    ['主体只获得完成任务所需的最小权限', '所有用户都使用管理员账号', '删除全部访问控制', '权限永久不回收'], 0,
    '最小权限能缩小误操作和账号失陷造成的影响范围。'),
  choice('计算机软件著作权通常保护什么？',
    ['软件的源代码和文档等表达形式', '软件中使用的数学定理本身', '所有思想和方法', '硬件芯片的制造工艺'], 0,
    '著作权保护程序及其相关文档的表达，不保护抽象思想本身。'),
  choice('国家标准、行业标准和企业标准的关系中，通常哪类标准要求更具体？',
    ['国家标准', '行业标准', '企业标准', '国际条约'], 2,
    '企业标准可在上级标准基础上提出更具体或更严格的要求。'),
  choice('风险应对策略中，购买保险属于哪一类？',
    ['规避', '转移', '接受', '利用'], 1,
    '保险把部分风险损失转移给第三方，属于风险转移。'),
];

const SOFT_EXAM_THEORY_QUESTION_COUNT = 75;

type SoftSpecialty = {
  level: '中级' | '高级';
  specialty: string;
  slug: string;
  knowledgePoints: string[];
  bank: ExamQuestion[];
};

const SOFT_SPECIALTIES: SoftSpecialty[] = [
  {
    level: '中级', specialty: '软件设计师', slug: 'software_designer',
    knowledgePoints: ['数据结构与算法', 'UML 与面向对象设计', '数据库设计', '软件测试', '设计模式', '操作系统基础'],
    bank: [
      choice('在需要频繁在两端插入和删除元素的场景中，最合适的数据结构是？',
        ['顺序表', '双端队列', '单链表', '静态数组'], 1, '双端队列支持两端 O(1) 插入和删除，比普通数组和单链表更贴合需求。'),
      choice('UML 中用于描述系统内部对象之间消息交互顺序的图是？',
        ['类图', '用例图', '顺序图', '部署图'], 2, '顺序图强调对象之间按时间顺序发生的消息交互。'),
      choice('关系数据库设计中，消除非主属性对候选键的部分依赖通常达到哪一范式？',
        ['1NF', '2NF', '3NF', 'BCNF'], 1, '2NF 要求非主属性完全依赖候选键，消除部分函数依赖。'),
      choice('单元测试主要关注哪一层面的正确性？',
        ['单个函数或类', '完整业务流程', '生产环境性能', '用户验收结果'], 0, '单元测试隔离最小可测单元，通常针对函数、方法或类。'),
      choice('希望在不修改现有对象结构的前提下动态增加职责，优先使用哪种设计模式？',
        ['工厂方法', '装饰器模式', '观察者模式', '模板方法'], 1, '装饰器模式通过组合包装对象，动态叠加职责。'),
      choice('进程与线程的主要区别是？',
        ['线程拥有独立地址空间', '进程切换通常比线程开销更大', '线程不能并发执行', '进程不能共享文件'], 1, '同一进程内线程共享地址空间，进程切换需要切换更多上下文。'),
    ],
  },
  {
    level: '中级', specialty: '网络工程师', slug: 'network_engineer',
    knowledgePoints: ['OSI 与 TCP/IP', '子网划分', '路由与交换', 'DNS/DHCP', '网络安全', 'VLAN 与无线网络'],
    bank: [
      choice('TCP/IP 模型中负责端到端可靠传输的是哪一层？',
        ['网络接口层', '网际层', '传输层', '应用层'], 2, '传输层的 TCP 提供连接管理、确认重传和流量控制。'),
      choice('IPv4 地址 192.168.1.130/26 所在子网的网络地址是？',
        ['192.168.1.0', '192.168.1.64', '192.168.1.128', '192.168.1.192'], 2, '/26 的块大小为 64，130 落在 128–191 区间。'),
      choice('把域名解析为 IP 地址最常用的协议是？',
        ['DHCP', 'DNS', 'ARP', 'SNMP'], 1, 'DNS 负责域名与 IP 地址之间的解析。'),
      choice('二层交换机划分 VLAN 的主要作用是？',
        ['扩大冲突域', '隔离广播域', '替代路由协议', '自动分配 IP'], 1, '每个 VLAN 是独立广播域，可减少广播流量并提升隔离性。'),
      choice('防火墙默认拒绝所有入站流量、仅放行明确规则，属于哪种策略？',
        ['白名单策略', '黑名单策略', '透明代理', '负载均衡'], 0, '只允许明确可信流量属于白名单式默认拒绝策略。'),
      choice('DHCP 的主要功能是？',
        ['动态分配 IP 地址', '加密网页流量', '转换域名', '同步路由器时钟'], 0, 'DHCP 自动分配 IP、网关和 DNS 等网络参数。'),
    ],
  },
  {
    level: '高级', specialty: '系统架构设计师', slug: 'system_architect',
    knowledgePoints: ['架构风格', '高可用设计', '缓存与消息队列', 'CAP 与一致性', '安全架构', '云原生与可观测性'],
    bank: [
      choice('系统要求读写比例极高且能容忍短暂最终一致，优先引入哪种组件？',
        ['分布式缓存', '强同步双写', '单机文件锁', '串行事务队列'], 0, '分布式缓存可显著降低数据库读压力，并通过过期或事件实现最终一致。'),
      choice('CAP 理论中，网络分区发生时系统通常需要在哪两者之间取舍？',
        ['性能与成本', '一致性与可用性', '安全性与兼容性', '可测试性与可维护性'], 1, '分区容错必须存在时，只能在一致性和可用性之间做取舍。'),
      choice('消息队列在架构中的典型价值不包括？',
        ['削峰填谷', '异步解耦', '保证所有业务绝对实时', '缓冲下游压力'], 2, '消息队列以异步换取解耦和缓冲，并不能保证所有链路绝对实时。'),
      choice('为降低单点故障，数据库主从架构通常还需要配套什么能力？',
        ['自动故障检测与切换', '关闭监控', '取消备份', '所有请求固定到主库'], 0, '高可用不仅需要副本，还需要故障检测、选主和切换机制。'),
      choice('系统出现偶发慢请求，最适合优先补齐哪类能力？',
        ['全链路追踪与指标监控', '增加首页动画', '关闭日志', '统一延长超时'], 0, '端到端追踪、指标和日志能定位慢在哪个服务或依赖。'),
      choice('敏感数据只在服务端解密并最小化日志输出，体现了哪项原则？',
        ['最小权限与数据最小化', '前后端同权', '默认信任内网', '明文换性能'], 0, '敏感数据应限制访问范围、最小化暴露并避免进入日志。'),
    ],
  },
  {
    level: '高级', specialty: '系统分析师', slug: 'system_analyst',
    knowledgePoints: ['需求获取与分析', 'DFD 与数据字典', '用例建模', '可行性分析', '业务规则', '需求变更管理'],
    bank: [
      choice('数据流图主要用于描述什么？',
        ['对象生命周期', '系统处理、数据流和数据存储', '代码调用栈', '网络拓扑'], 1, 'DFD 从数据流动角度描述处理过程、外部实体、数据存储和数据流。'),
      choice('需求分析阶段最重要的输出之一是？',
        ['可验证的需求规格说明', '最终部署脚本', '生产数据库备份', '运维值班表'], 0, '需求规格说明应明确、可验证，并作为设计与验收依据。'),
      choice('用例图中参与者与用例之间的关系通常表示为什么？',
        ['关联', '继承', '实现', '依赖注入'], 0, '参与者通过关联关系使用或参与某个用例。'),
      choice('评估项目在经济上是否值得立项，属于哪类可行性分析？',
        ['技术可行性', '经济可行性', '法律可行性', '运营可行性'], 1, '成本、收益、投资回报等属于经济可行性。'),
      choice('需求变更最稳妥的处理方式是？',
        ['口头同意后直接开发', '记录影响、评估并走变更控制', '全部拒绝', '先上线再补文档'], 1, '需求变更需要记录、影响分析、审批和基线更新。'),
      choice('数据字典在结构化分析中的主要作用是？',
        ['定义数据元素及组成关系', '生成界面配色', '替代所有测试', '管理员工考勤'], 0, '数据字典统一定义数据项、数据结构、数据流和数据存储。'),
    ],
  },
];

const softYearRange = [2023, 2024, 2025] as const;

function rotateQuestions(questions: ExamQuestion[], offset: number): ExamQuestion[] {
  if (questions.length === 0) return [];
  const start = ((offset % questions.length) + questions.length) % questions.length;
  return [...questions.slice(start), ...questions.slice(0, start)];
}

function softTheoryPaper(spec: SoftSpecialty, year: number): ExamPaper {
  const specialtyQuestions = rotateQuestions(spec.bank, (year - 2023) * 2).slice(0, 6);
  const commonQuestions = rotateQuestions(SOFT_COMMON_BANK, (year - 2023) * 11)
    .slice(0, SOFT_EXAM_THEORY_QUESTION_COUNT - specialtyQuestions.length);
  const questions = [...specialtyQuestions, ...commonQuestions].map((question, index) => ({
    ...question,
    id: `soft_${spec.slug}_${year}_q${index + 1}`,
  }));
  return {
    id: `exam_soft_${spec.slug}_${year}`,
    title: `${year} 软考${spec.level} · ${spec.specialty} · 综合知识`,
    examType: '软考',
    year,
    region: '全国软考',
    section: '综合知识',
    difficulty: spec.level === '高级' ? '中高难度' : '中等',
    durationMinutes: spec.level === '高级' ? 150 : 120,
    tags: [spec.level, spec.specialty, '75 题综合训练'],
    examLevel: spec.level,
    examFormat: '综合知识',
    softSpecialty: spec.specialty,
    knowledgePoints: spec.knowledgePoints,
    passage: [
      `本卷按 ${year} 软考${spec.level}「${spec.specialty}」常见考点组织，共 ${SOFT_EXAM_THEORY_QUESTION_COUNT} 道客观题，适合做综合知识限时训练。`,
      `重点范围：${spec.knowledgePoints.join('、')}。`,
      '本卷为高频考点训练卷，不等同于官方历年原题；建议先独立作答，再结合解析定位薄弱知识点。',
      '先独立作答，再看解析；错题建议回到知识点原文补齐概念，而不是只背选项。',
    ].join('\n\n'),
    questions,
  };
}

const SOFT_THEORY_PAPERS = SOFT_SPECIALTIES.flatMap((spec) =>
  softYearRange.map((year) => softTheoryPaper(spec, year)),
);

const SOFT_PRACTICE_PAPERS: ExamPaper[] = [
  {
    id: 'exam_soft_software_designer_practice_2023_2025',
    title: '2023–2025 软考中级 · 软件设计师 · 上机精选',
    examType: '软考',
    year: 2025,
    region: '全国软考',
    section: '上机实操',
    difficulty: '中等',
    durationMinutes: 45,
    tags: ['中级', '软件设计师', 'SQL', 'Java', '算法'],
    examLevel: '中级',
    examFormat: '上机实操',
    softSpecialty: '软件设计师',
    knowledgePoints: ['SQL 查询', 'Java 基础', '数组与哈希', '边界条件'],
    passage:
      '上机题按 2023–2025 软件设计师常见题型组织。请在作答区写出可运行的 SQL、Java 或 Python 代码；交卷后会显示参考实现和检查要点。',
    questions: [
      {
        ...practice(
          '给定 orders(order_id, user_id, amount, created_at)，写出查询：2025 年下单金额超过 1000 元的用户数。',
          'sql',
          'SELECT\n  -- 在这里作答\nFROM orders\nWHERE ',
          "SELECT COUNT(DISTINCT user_id)\nFROM orders\nWHERE amount > 1000\n  AND created_at >= '2025-01-01'\n  AND created_at < '2026-01-01';",
          '关键点：按 user_id 去重、金额大于 1000、时间范围使用半开区间。',
        ),
      },
      {
        ...practice(
          '实现 Java 方法 int firstUnique(int[] nums)：返回第一个只出现一次的数字，没有则返回 -1。',
          'java',
          'public int firstUnique(int[] nums) {\n    // 在这里作答\n    return -1;\n}',
          'public int firstUnique(int[] nums) {\n    Map<Integer, Integer> count = new LinkedHashMap<>();\n    for (int n : nums) count.merge(n, 1, Integer::sum);\n    for (var e : count.entrySet()) if (e.getValue() == 1) return e.getKey();\n    return -1;\n}',
          '关键点：先计数再按原顺序找第一个频次为 1 的元素。',
        ),
      },
      {
        ...practice(
          '实现 Python 函数 top_k_words(text, k)：返回文本中出现次数最多的 k 个单词，忽略大小写和标点。',
          'python',
          'def top_k_words(text: str, k: int) -> list[str]:\n    # 在这里作答\n    return []',
          "from collections import Counter\nimport re\n\ndef top_k_words(text: str, k: int) -> list[str]:\n    words = re.findall(r\"[A-Za-z']+\", text.lower())\n    return [word for word, _ in Counter(words).most_common(k)]",
          '关键点：统一小写、提取单词、统计频次、处理 k 大于词数的情况。',
        ),
      },
    ],
  },
  {
    id: 'exam_soft_system_architect_practice_2023_2025',
    title: '2023–2025 软考高级 · 系统架构设计师 · 案例与上机精选',
    examType: '软考',
    year: 2025,
    region: '全国软考',
    section: '上机实操',
    difficulty: '中高难度',
    durationMinutes: 50,
    tags: ['高级', '系统架构设计师', '案例分析', '架构设计'],
    examLevel: '高级',
    examFormat: '上机实操',
    softSpecialty: '系统架构设计师',
    knowledgePoints: ['容量估算', '高可用设计', '消息队列', '可观测性', '安全与降级'],
    passage:
      '高级上机题以架构方案和关键计算为主。作答时写清假设、组件职责、数据流、失败处理和验证方式，参考要点用于交卷后自查。',
    questions: [
      {
        ...practice(
          '某接口峰值 6000 QPS、平均响应时间 80ms。估算满足峰值所需的并发处理数，并说明实例数如何计算。',
          'text',
          '假设：\n计算过程：\n结论：',
          '并发数 ≈ QPS × 平均响应时间 = 6000 × 0.08 = 480。若单实例安全承载 120 并发，至少需要 4 个实例，并预留约 30% 余量。',
          '关键点：说明公式、单位、实例容量假设、冗余与压测验证。',
        ),
      },
      {
        ...practice(
          '设计一个订单系统的读写架构，要求下单强一致、查询可最终一致，并能在数据库主库故障时快速降级。',
          'text',
          '组件：\n数据流：\n故障处理：\n验证方式：',
          '写路径使用事务数据库和幂等订单号；读路径使用缓存或读副本；异步事件同步查询视图。主库故障时暂停新写入或切换主库，读请求降级到缓存/只读副本，并记录补偿任务。',
          '关键点：区分读写一致性、幂等、故障切换、降级、补偿和监控。',
        ),
      },
      {
        ...practice(
          '为一个微服务系统列出最小可用的可观测性方案，并说明如何定位“偶发 2 秒慢请求”。',
          'text',
          '指标：\n日志：\n追踪：\n定位步骤：',
          '最小方案：请求量/错误率/延迟分位数、结构化日志、traceId 全链路追踪。定位时按入口 trace 找到最慢 span，再对照依赖延迟、连接池、GC、线程池和下游错误率。',
          '关键点：指标查趋势、日志查上下文、追踪查链路，最后用压测或复现验证。',
        ),
      },
    ],
  },
];

const KAOYAN_2025: ExamPaper = {
  id: 'exam_kaoyan_2025_r1',
  title: '2025 考研英语（一）· 阅读精练',
  examType: '考研',
  year: 2025,
  region: '全国统考',
  section: '阅读理解',
  difficulty: '中等偏难',
  durationMinutes: 18,
  tags: ['人工智能素养', '教育', '推理题'],
  passage:
    'Artificial intelligence is entering the classroom less as a teacher than as a writing partner. Students can ask a model to outline an essay, suggest a counterargument or explain a difficult paragraph. The immediate benefit is speed: work that once required a library visit may now begin with a single prompt. Yet speed can hide a missing step. A student who receives a clear outline may never discover why one argument is stronger than another.\n\n'
    + 'Schools are therefore experimenting with assignments that make the process visible. Students may be asked to submit an early draft, a record of how they questioned the model and a final revision explaining what they changed. The point is not to ban assistance but to distinguish assistance from replacement. If a tool supplies every sentence, the student practices editing at best and authorship at worst becomes unclear.\n\n'
    + 'The most useful classroom rule may be simple: the model can help you think, but it cannot do your thinking for you. That rule is difficult to enforce mechanically. It requires teachers to design tasks that value judgment, evidence and revision rather than the polished surface of a final answer.',
  questions: [
    choice('What immediate benefit of AI in writing does the author mention?', ['It guarantees better grades.', 'It speeds up the beginning of a task.', 'It replaces the need for evidence.', 'It makes every argument equally strong.'], 1, '首段明确提到 immediate benefit is speed。'),
    choice('Why can speed be a problem?', ['Students may skip important thinking steps.', 'Teachers cannot access computers.', 'Models write too slowly.', 'Assignments become too short.'], 0, '速度可能掩盖论证比较和独立思考的过程。'),
    choice('What do experimental assignments ask students to make visible?', ['Their private passwords', 'Their writing and questioning process', 'Only the final answer', 'Their classmates’ drafts'], 1, '第二段要求提交初稿、提问记录和修改说明。'),
    choice('What is the author’s main point about AI assistance?', ['It should be completely banned.', 'It should replace teachers.', 'It must remain assistance rather than replacement.', 'It is useful only outside school.'], 2, '全文强调 assistance 与 replacement 的边界。'),
    choice('Which task would best reflect the author’s classroom rule?', ['Copying a generated essay', 'Memorizing a model prompt', 'Explaining and revising a suggested argument', 'Submitting the first generated draft'], 2, '解释和修改能保留判断、证据与作者责任。'),
  ],
};

const GAOKAO_2025: ExamPaper = {
  id: 'exam_gaokao_2025_r1',
  title: '2025 高考英语 · 全国卷阅读精练',
  examType: '高考',
  year: 2025,
  region: '全国卷',
  section: '阅读理解',
  difficulty: '中等',
  durationMinutes: 12,
  tags: ['社区', '共享空间', '细节题'],
  passage:
    'A vacant room beside the neighborhood sports center had been used for storage for years. When the city announced that it would be turned into a shared study room, some residents were doubtful. Teenagers already had a library, they said, and older people had the community center. Why create another place?\n\n'
    + 'The first month answered the question. Students used the room after school, but so did adults preparing for exams and retired residents learning to use smartphones. Because the room was open until ten at night, it served people whose schedules did not match those of the library. A simple booking board allowed groups to reserve a table while leaving most seats free for anyone who walked in.\n\n'
    + 'The most successful feature was not the furniture. It was a rule proposed by the users themselves: keep the room quiet, but do not make it silent. People could ask for help, form a small study group or attend a weekly skill-sharing hour. The room became useful because it was designed for different kinds of concentration, not just one.',
  questions: [
    choice('Why were some residents doubtful at first?', ['They thought another study place was unnecessary.', 'They wanted to keep the room for sports.', 'They believed the library was closing.', 'They expected the room to be too small.'], 0, '居民认为已有图书馆和社区中心，不需要再建一个学习空间。'),
    choice('What made the room different from the library?', ['It had more books.', 'It stayed open until ten at night.', 'It was only for teenagers.', 'It required no rules.'], 1, '文章明确说房间开放到晚上十点，覆盖不同作息。'),
    choice('What was the purpose of the booking board?', ['To charge for seats', 'To reserve tables while keeping most seats open', 'To close the room earlier', 'To separate older and younger users'], 1, '预订板允许团体订桌，同时保留大部分座位给临时来访者。'),
    choice('What did users propose?', ['A rule that balanced quiet and help', 'A ban on group study', 'A larger sports center', 'A shorter opening time'], 0, '用户提出安静但不必完全沉默，允许求助和小组学习。'),
    choice('What is the main idea of the passage?', ['Shared spaces work when they support different needs.', 'Libraries should be replaced by study rooms.', 'Teenagers need more sports facilities.', 'Quiet rooms should have no rules.'], 0, '全文强调共享空间因支持不同专注方式而成功。'),
  ],
};

const GAOKAO_2021: ExamPaper = {
  id: 'exam_gaokao_2021_r1',
  title: '2021 高考英语 · 全国卷阅读精练',
  examType: '高考',
  year: 2021,
  region: '全国卷',
  section: '阅读理解',
  difficulty: '中等',
  durationMinutes: 12,
  tags: ['劳动教育', '校园', '主旨题'],
  passage:
    'The school kitchen used to be a place students passed without noticing. Last year, a group of students asked whether they could help prepare one lunch each month. The kitchen staff agreed, but they set clear limits: students would work in small groups, follow safety rules and clean their own work area.\n\n'
    + 'The first lunch was slower than usual. Vegetables were cut unevenly, and one group forgot to check the soup. Instead of taking over, the staff asked the students to review what had happened. The next month, the group made a checklist and assigned roles before entering the kitchen. Lunch was ready on time, and less food was wasted.\n\n'
    + 'The project changed the students’ view of school meals. They began to notice the amount of planning behind a simple dish and the effort required to serve hundreds of people. Some students later joined a food-waste club. The kitchen staff said the greatest result was not better cooking skills, but a more respectful relationship between the people who prepared food and the people who ate it.',
  questions: [
    choice('What did the students ask to do?', ['Visit the kitchen once a year', 'Help prepare lunch each month', 'Design a new menu', 'Close the kitchen for repairs'], 1, '第一段学生请求每月帮助准备一次午餐。'),
    choice('What problem appeared on the first day?', ['The kitchen was closed.', 'The work was uneven and one group forgot a check.', 'No students arrived.', 'The food was too expensive.'], 1, '第一顿午餐出菜慢、切菜不均，还有小组忘记检查汤。'),
    choice('What improved the second lunch?', ['Buying prepared food', 'Using a checklist and assigned roles', 'Inviting parents to cook', 'Serving fewer students'], 1, '第二个月先做清单、分工，午餐按时完成且浪费更少。'),
    choice('What did students begin to understand?', ['School meals require planning and effort.', 'Cooking is easier than studying.', 'Kitchen staff have little responsibility.', 'Food waste cannot be reduced.'], 0, '学生开始理解一顿饭背后的计划与劳动。'),
    choice('What did the staff consider the greatest result?', ['Winning a cooking competition', 'A more respectful relationship around food', 'Serving more dishes', 'Building a larger kitchen'], 1, '工作人员认为最大成果是准备者和食用者之间更尊重的关系。'),
  ],
};

export const EXTRA_EXAM_PAPERS: ExamPaper[] = [
  KAOYAN_2025,
  GAOKAO_2025,
  GAOKAO_2021,
  ...SOFT_THEORY_PAPERS,
  ...SOFT_PRACTICE_PAPERS,
];

export type SoftMaterialSummary = {
  id: string;
  title: string;
  level: '中级' | '高级';
  specialty: string;
  yearRange: string;
  description: string;
  fileName: string;
  format: 'markdown';
  chapterCount: number;
  knowledgeDomains: SoftKnowledgeDomain[];
  books: SoftOfficialBook[];
  officialBooksUrl: string;
  coverageNote: string;
};

const softMaterialId = (spec: SoftSpecialty) => `soft_material_${spec.slug}`;

export const SOFT_MATERIALS: SoftMaterialSummary[] = SOFT_SPECIALTIES.map((spec) => {
  const knowledge = getSoftKnowledgeProfile(spec.specialty);
  if (!knowledge) throw new Error(`缺少软考知识体系：${spec.specialty}`);
  return {
    id: softMaterialId(spec),
    title: `${spec.specialty} · 自编学习清单（Markdown）`,
    level: spec.level,
    specialty: spec.specialty,
    yearRange: '2023–2025',
    description: `含 ${knowledge.chapterCount} 个章节级知识条目与自编练习；不是官方教材或官方原题。`,
    fileName: `${spec.level}-${spec.specialty}-学习清单.md`,
    format: 'markdown',
    chapterCount: knowledge.chapterCount,
    knowledgeDomains: knowledge.domains,
    books: knowledge.books,
    officialBooksUrl: SOFT_OFFICIAL_BOOKS_URL,
    coverageNote: knowledge.coverageNote,
  };
});

export function getSoftMaterial(id: string): (SoftMaterialSummary & { content: string }) | null {
  const spec = SOFT_SPECIALTIES.find((item) => softMaterialId(item) === id);
  const summary = SOFT_MATERIALS.find((item) => item.id === id);
  if (!spec || !summary) return null;
  const knowledge = getSoftKnowledgeProfile(spec.specialty);
  if (!knowledge) return null;
  const practical = SOFT_PRACTICE_PAPERS.find((paper) => paper.softSpecialty === spec.specialty);
  const lines = [
    `# ${spec.level} ${spec.specialty} · 自编学习清单`,
    '',
    '> 本文件由言智整理，是 Markdown 学习清单，不是官方教材、官方原题或官方电子书。',
    `> 官方考试大纲、教程与试题解析：${SOFT_OFFICIAL_BOOKS_URL}`,
    '',
    '## 知识覆盖说明',
    knowledge.coverageNote,
    '',
    '## 章节级知识域',
    ...knowledge.domains.flatMap((domain, index) => [
      `### ${index + 1}. ${domain.title}`,
      ...domain.chapters.map((chapter) => `- ${chapter}`),
      '',
    ]),
    '## 官方考试用书',
    ...knowledge.books.map((book) => `- ${book.kind}：${book.title}；ISBN ${book.isbn}；${book.publisher}。${book.note}`),
    '',
    '## 高频知识点索引',
    ...spec.knowledgePoints.map((point) => `- ${point}`),
    '',
    '## 自编综合知识练习',
    ...spec.bank.flatMap((q, index) => [
      `### ${index + 1}. ${q.stem}`,
      ...(q.options || []).map((option, oi) => `${String.fromCharCode(65 + oi)}. ${option}`),
      `- 参考答案：${String.fromCharCode(65 + Number(q.answer || 0))}`,
      `- 解析：${q.explanation}`,
      '',
    ]),
  ];
  if (practical) {
    lines.push(
      '## 自编上机与案例练习',
      ...practical.questions.flatMap((q, index) => [
        `### 上机 ${index + 1}. ${q.stem}`,
        `- 语言/形式：${q.language || 'text'}`,
        q.starterCode ? `- 代码模板：\n\`\`\`\n${q.starterCode}\n\`\`\`` : '',
        `- 参考要点：\n\`\`\`\n${q.reference || ''}\n\`\`\``,
        `- 检查说明：${q.explanation}`,
        '',
      ]),
    );
  }
  lines.push(
    '## 使用建议',
    '1. 先用本清单定位章节，再阅读官方最新版教程补齐概念。',
    '2. 完成自编综合知识练习后，用官方考试大纲核对覆盖范围。',
    '3. 上机题先独立完成，再对照参考要点检查边界条件和失败处理。',
  );
  return { ...summary, content: lines.join('\n') };
}
