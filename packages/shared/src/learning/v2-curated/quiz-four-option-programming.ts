import type { LearningV2Practice } from '../v2-types.js';
import { CPP_PERFORMANCE_COURSE_QUIZ } from './programming/quiz-cpp-performance.js';
import { C_SYSTEMS_COURSE_QUIZ } from './programming/quiz-c-systems.js';
import type { CuratedCoursePlanPatchMap } from './types.js';

type OptionAddition = readonly [questionIndex: number, option: string];

const OPTION_ADDITIONS: Readonly<Record<string, readonly OptionAddition[]>> = {
  'C · 栈、堆、生命周期与未定义行为：自动存储、静态存储和动态分配': [
    [0, '三种存储期只影响变量命名作用域，与对象何时创建和销毁没有关系'],
    [2, '静态数组即使零初始化也保留在 data 段，因为编译器必须把每个 0 字节写入可执行文件'],
    [3, '递归调用会在堆上分配栈帧，因此应优先检查 malloc 是否发生泄漏'],
  ],
  'C · 栈、堆、生命周期与未定义行为：malloc/realloc/free 与所有权': [
    [0, 'malloc(24) 按 8 字节对齐，chunk 总大小固定为 24 字节，可用空间也正好是 24 字节'],
    [1, 'tmp = realloc(p, 4096); p = tmp; 无论 tmp 是否为空都覆盖 p，失败时再 free 旧指针即可'],
    [2, 'malloc(0) 的返回值可作为唯一句柄传给 realloc 扩容，而 free(NULL) 会终止进程'],
    [3, '向 free 传入栈变量地址会被 glibc 自动识别并安全忽略，因为分配器会检查页属性'],
  ],
  'C · 栈、堆、生命周期与未定义行为：悬空指针、双重释放和泄漏': [
    [0, 'free 会把块内容清零并立即 munmap，所以释放后读取对象只会稳定得到 0'],
    [1, '同一地址第二次 free 被标准定义为空操作，ASan 报 attempting double-free 属于误报'],
    [2, '把任一别名设为 NULL 会自动清除所有指向同一块的指针，因此经全局数组访问必定安全'],
    [3, 'SUMMARY 表示 2 个分配块被 double free，40 字节是分配器元数据而不是用户载荷'],
  ],
  'C · 栈、堆、生命周期与未定义行为：整数溢出、越界和严格别名': [
    [0, '先比较 a 和 0 就能把有符号溢出转成无符号回绕，因此 if (a + b < a) 是标准推荐的检测方式'],
    [1, 'if (len - 10 < 20) 中先把 len 强制转成 int 就不会回绕，短长度与超大长度都能正确处理'],
    [2, '-1 > 1u 在 C 标准中会保持有符号操作数不变，因此数学比较结果为假'],
    [3, '给两个指针都加 volatile 强制每次从内存读取，严格别名优化就会停止，类型双关也随之合法'],
  ],
  'C · 栈、堆、生命周期与未定义行为：错误路径与统一清理': [
    [0, 'errno 是进程全局变量，多线程使用前必须对 errno 加互斥锁，否则返回值也会被污染'],
    [1, 'goto cleanup 应按申请顺序释放资源，因为后申请的资源可以保证先申请的资源仍然有效'],
    [2, 'EINTR 后必须重新打开文件描述符并从头写整块数据，否则内核会把当前写入计数清零'],
    [3, '会看到 heap-use-after-free，因为 fopen 失败后 libc 会释放调用方传入的路径缓冲区'],
  ],
  'C · 栈、堆、生命周期与未定义行为：内存安全测试矩阵': [
    [0, 'ASan 在每次 malloc 后把整页设为不可访问，越界写入由内核缺页异常直接报告'],
    [1, '编译与链接都已带 -fsanitize=address 时仍报未定义符号，通常是缺少 Valgrind 开发头文件'],
    [2, '能，ASan 的影子内存也记录初始化位，零报告足以证明程序没有任何未定义行为'],
    [3, '合适，Valgrind memcheck 只插桩关键函数，运行开销通常低于 ASan，适合每次提交全量跑'],
  ],
  'C · 调试、追踪、静态分析与性能：GDB 断点、栈和变量': [
    [0, 'core 文件没有正确加载进 gdb，执行 set sysroot 后所有变量和行号就会自动恢复'],
    [2, 'bt 的帧编号由调试器按每帧栈指针大小降序生成，与调用方向和崩溃现场无关'],
  ],
  'C · 调试、追踪、静态分析与性能：core dump、符号和构建 ID': [
    [0, '重启 systemd-journald 并清空 /var/lib/systemd/coredump 后，core 会自动写到当前目录'],
    [1, '先执行 coredumpctl list PID，再用 coredumpctl info PID 就会自动载入 gdb 并可单步执行'],
    [2, 'build-id mismatch 只影响调试符号名称，改用 addr2line 就能恢复局部变量和线程状态'],
    [3, '补上 -fno-omit-frame-pointer 后，纯地址 core 无需任何符号包也能显示函数名和源文件行号'],
  ],
  'C · 调试、追踪、静态分析与性能：strace/ltrace 与系统调用': [
    [0, 'ltrace 通过 ptrace 拦截内核系统调用，strace 只在用户态动态库函数入口打点'],
    [1, '执行 strace -k ./prog，只看一次回溯就能列出程序尝试打开的全部候选路径'],
    [2, 'time 与 strace -c 的差值来自磁盘缓存预热，应继续追查 syscall 内核态耗时而不是用户态计算'],
    [3, '给 strace 加 -c 就会自动汇入子进程调用，-f 只负责给每行添加时间戳'],
  ],
  'C · 调试、追踪、静态分析与性能：clang-tidy、静态分析和编译器警告': [
    [0, 'clang-tidy 会运行完整后端优化，能证明编译器警告永远不会触发，因此 CI 只跑 tidy 就足够'],
    [1, 'clang-tidy 只能自动读取 compile_commands.json，找不到头文件时不能用 -- 临时传入 -I 参数'],
    [2, '--fix 应用后应直接提交，NOLINT 只能放在文件头全局关闭该文件的所有诊断'],
    [3, '先关闭 -Wall 与 -Wextra，等所有旧代码废弃后只对新仓库一次性打开 -Werror'],
  ],
  'C · 调试、追踪、静态分析与性能：perf、火焰图和缓存局部性': [
    [0, '火焰图横轴是采样时间，色块宽度表示函数执行次数，纵轴调用深度可以忽略'],
    [1, 'perf record -g --sleep 1000 ./a.out，采样间隔固定为一千毫秒且不受负载影响'],
    [2, 'self 与 children 都包含子调用时间，只有 children 能排除递归造成的重复累计'],
    [3, '两个线程私有计数器仍有伪共享，说明应给计数器加互斥锁而不是做缓存行对齐'],
  ],
  'C · 调试、追踪、静态分析与性能：C 服务生产诊断报告': [
    [0, '命令只要在本机能运行且输出非空，就足以作为根因证据，不要求相同产物和相同环境重放'],
    [1, '先按最近提交时间排列作者，再结合代码变更顺序，就能同时确定责任人和崩溃根因'],
    [2, '把根因、临时措施和长期修复合并成一条结论，便于把止血和修复写成同一个责任项'],
    [3, '直接重启服务并观察内存回落即可认定泄漏，测试环境复现会引入额外变量所以不必做'],
  ],
  'C · 数据结构、并发与协议工程：哈希表、链表、队列和内存池': [
    [1, '只修改 p->prev->next 指向 p->next，p->next 的 prev 会在下一次遍历时自动修复'],
    [2, '最多存 4 个元素，为保持容量是 2 的幂必须把可用槽位再折半'],
    [3, '逐块 free 池中每个用户对象即可消除报告，池本身不需要 destroy，因为自由链表会被回收'],
  ],
  'C · 数据结构、并发与协议工程：线程、互斥量、条件变量和原子': [
    [0, 'pthread_create 失败返回 -1 并设置 errno，成功时返回线程函数的最终返回值'],
    [1, 'do { pthread_cond_wait(&cv, &mutex); } while (0); 循环体只执行一次即可忽略虚假唤醒'],
    [2, '最终数可能大于八十万，因为 relaxed 允许同一原子操作被多个线程重复提交'],
    [3, '先 trylock 两把锁，失败时保持已持有锁继续等待，只要避免重复加锁就不会死锁'],
  ],
  'C · 数据结构、并发与协议工程：数据竞争、死锁和线程清理': [
    [0, '两个线程只读同一内存位置也会构成数据竞争，只要访问次数足够多就需要同步'],
    [1, 'trylock 失败后应持有另一把锁并立即忙等重试，这样既不会破坏临界区也不会产生死锁'],
    [2, 'pthread_exit 只执行最后注册的 B，pthread_cancel 只执行 A，两条清理路径不会同时出现'],
    [3, '给两把锁都设置 recursive 属性后，不同线程可以同时持有同一把锁而不会阻塞'],
  ],
  'C · 数据结构、并发与协议工程：二进制协议、序列化和字节序': [
    [0, 'x86 小端发送到大端接收端时 TCP 会自动翻转整数字节序，应用层无需做任何转换'],
    [1, '给结构体加 __attribute__((packed)) 后直接强转读取，既避免对齐问题也自动完成字节序转换'],
    [2, '先按伪造长度 malloc 并继续接收，超时后再交给校验和判断，这样不会错丢合法大帧'],
    [3, 'sizeof 为 12 说明只存在对齐填充，统一使用 #pragma pack(1) 就能同时消除跨机字节序差异'],
  ],
  'C · 数据结构、并发与协议工程：TLS、校验和错误恢复': [
    [0, 'recv 返回 0 表示本端发送缓冲区已满，应先调用 send 排空数据再继续接收'],
    [1, 'EAGAIN 表示接收队列已被内核丢弃，应立即重连并重新完成握手，不能等待可读事件'],
    [2, '固定每秒重试一次并关闭随机抖动，才能让重连时间在压测中稳定可复现'],
    [3, 'MTU 变化会让 TCP 重排字节序，重连后应对帧头做字节交换再继续解析'],
  ],
  'C · 数据结构、并发与协议工程：并发与协议综合实验': [
    [0, 'close 只由一个线程执行是为了避免 EINTR，多线程 close 会阻塞整个信号处理流程'],
    [1, '信号处理函数可以调用 pthread_mutex_unlock，只要该锁不是 recursive 类型就不会产生未定义行为'],
    [2, 'TSan 能同时检测死锁并把锁顺序告警写入 race 报告，因此无需再单独做锁排序审查'],
    [3, '每个关联字段各用一个 atomic 并逐字段读取，本身就是可线性化的一致快照'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：固定仓库、tag、宏和构建选项': [
    [0, 'master 与 tag 7.2.5 只差注释和文档时可直接互换，二进制行为不会因此变化'],
    [1, 'redis-server --version 会显示 malloc 实现，看到版本号变化就能证明分配器已经切换'],
    [2, 'make clean 会连同编译宏缓存一起失效，distclean 只用于删除运行日志和 dump 文件'],
    [3, 'TLS 握手失败通常只是少写 tls-ca-cert-file，运行中重载配置即可打开编译期固化的 TLS 能力'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：Redis 事件循环与连接缓冲': [
    [0, 'aeApiPoll 的等待时长由监听端口数量决定，端口越多超时越短以保证公平轮询'],
    [1, '累计未解析数据超限后 Redis 会丢弃最旧的半包字节，再继续解析后续命令'],
    [2, '32mb 是软上限，8mb 是硬上限，60 表示缓冲区至少保留 60% 的空闲空间'],
    [3, '半包会被当作完整命令执行，返回 protocol error 后查询缓冲区立即清空'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：Nginx event cycle 与 upstream': [
    [0, 'epoll_wait 超时取红黑树最大节点的剩余时间，避免因最近任务频繁唤醒事件循环'],
    [1, 'keepalive 只控制客户端连接池，还需把 keepalive_timeout 设为 0 才会复用到 upstream 的连接'],
    [2, '8192，每个 worker 只受 worker_connections 限制，upstream 连接不占用 worker 的 fd 配额'],
    [3, 'error.log 只记录客户端 4xx，后端摘除与恢复只能从后端应用自己的访问日志判断'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：状态机、容量和文件描述符上限': [
    [0, '只发两行后 Redis 会把已收到的字节当作未知命令立即丢弃，连接保持可读但状态复位'],
    [1, '修改 /proc/<pid>/limits 中的 Max open files 后 reload 服务，即可永久提高运行用户上限'],
    [2, 'worker_connections 是所有 worker 共享的总量，单个 worker 的实际连接上限取决于 worker_processes'],
    [3, '先把 fs.file-max 调到无限再重启一次 Nginx，worker 会自动继承新的 fd 硬上限'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：systemd、容器、core dump 和升级': [
    [0, 'Restart=on-failure 只检查退出码，因此收到 SIGTERM 的正常 systemctl stop 也会被 restart 拉起'],
    [1, '只要 core_pattern 可写就够了，systemd 托管服务会自动把 ulimit -c 设为 unlimited'],
    [2, '容器与宿主机共享 /etc/security/limits.conf，调大宿主机 nofile 后会立即覆盖容器内的 fd 限制'],
    [3, 'USR2 只用于重新打开日志，WINCH 才会拉起新 master 并执行二进制热切换'],
  ],
  'C · Redis/Nginx 源码与原生服务交付：C 原生服务毕业项目与源码答辩': [
    [0, '单线程 epoll 中复用同一客户端 fd 的读写需要额外线程锁，否则非阻塞状态会互相覆盖'],
    [1, '必须记录系统负载平均值，因为它决定每秒请求数上限，且与连接数和 fd 上限没有关系'],
    [2, '-O2 加 -march=native，并删除 -g 以缩小符号体积，这样发布版仍能完整回溯崩溃栈'],
    [3, 'core 只保存崩溃瞬间的寄存器，没有目标程序的映射表，所以任何符号包都无法恢复函数名'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：编译器、标准库、ABI 和链接': [
    [1, '在命令末尾加 -Wl,--start-group 与 --end-group 后，静态库的前后顺序就不再影响符号解析'],
    [2, '只要所有函数都用 extern "C" 声明，GCC 与 MSVC 的名字修饰、类布局和虚表结构就会自动兼容'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：C++20/23 基线与编译器支持': [
    [0, '该宏值由编译器的补丁号决定，GCC 与 MSVC 在 c++20 模式下不会得到同一常量'],
    [1, 'GCC 12 的报错是因为漏写 #include <iostream>，标准库实现本身已经完整支持 std::format'],
    [2, '-std=c++2b 会同时切换 ABI 到实验版本，升级后必须重新编译并链接全部第三方二进制'],
    [3, 'cl 找不到标准头文件是因为普通 PowerShell 不允许执行 cl.exe，改用管理员终端即可修复'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：CMake target 与 PUBLIC/PRIVATE': [
    [0, 'PUBLIC，纯头文件库没有源文件，也仍需把自身和下游的编译选项同时打开'],
    [1, '编译会通过，因为 PRIVATE 只控制库是否安装，不控制头文件搜索路径是否传播'],
    [2, 'PRIVATE，utils 只被 core 的对外头文件包含，属于实现细节，不应继续传播给下游'],
    [3, 'binaryDir 没有按 preset 分组会让 target 属性在同一构建树里串联，统一改成 INTERFACE 即可隔离'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：CMake Presets 和 Ninja': [
    [0, 'cmake --preset debug 只列出可用 preset，真正执行配置还必须再补 --configure 参数'],
    [1, '两个 preset 共用 binaryDir 时 CMake 会按 preset 名隔离缓存变量，debug 与 release 可以安全共存'],
    [2, 'hidden preset 只是不写进 CMakeCache.txt，仍会出现在 --list-presets 输出中且可直接执行'],
    [3, 'testPresets 至少要求 schema version 6，version 3 只支持 configurePresets 与 Ninja generator'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：Conan/vcpkg 与依赖锁定': [
    [0, '同一个包无论 profile settings 如何变化都会得到相同包 ID，profile 只决定安装目录'],
    [1, 'vcpkg 已安装但 find_package 找不到，通常是 CMakeLists 少写 include_directories(vcpkg_installed)'],
    [2, '删除 conan.lock 后 Conan 会强制复用上一次 install 的缓存版本，因此构建可重复但永远无法升级'],
    [3, '只用 CMakeDeps 就会同时生成 conan_toolchain.cmake，CMakeToolchain 只负责 Ninja 的编译命令'],
  ],
  'C++ · 工具链、CMake Presets 与第一个工程：第一个跨平台 C++17/20 工程': [
    [0, 'CMake 会在每次构建前重新扫描源目录，未列入 add_library 的新文件会自动加入当前 target'],
    [1, 'target_compile_features 只控制警告等级，不参与生成 -std 参数，实际标准仍由 CMAKE_CXX_STANDARD 决定'],
    [2, '手写 -lpthread 比导入目标更可移植，Threads::Threads 只能用于 Windows，不能修复 Linux 链接失败'],
    [3, '在 .gitattributes 中设置 * text=auto 并保留 CRLF，Git 就会把 Windows 脚本自动转换成 Unix 可执行格式'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：左值、右值、移动与完美转发': [
    [0, 'std::move(x) 返回一个具名右值对象，因此对它取地址与对 x 取地址在所有上下文中都合法'],
    [1, '编译期会直接失败，因为 vector 要求元素类型必须可拷贝，移动构造还必须显式标注 noexcept'],
    [2, 'v 的所有成员会被清零，size 变为 0，之后只能重新构造而不能安全地重新赋值'],
    [3, '参数写成 const T&& 仍然属于万能引用，只会把推导结果限制为 const 而不改变折叠规则'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：模板、特化和编译期计算': [
    [0, '模板定义放在 .cpp 且没有显式实例化时，链接器会保留模板记号，在调用点按需生成实例'],
    [1, '删掉 constexpr 后 static_assert 仍会通过，因为编译器会自动保留纯函数的编译期求值能力'],
    [2, '函数模板也支持偏特化，只是语法必须写成 template<typename T> Pair<T, T> f(...)'],
    [3, '给 T::value_type 前加 const 就能绕过依赖名解析，typename 只用于函数返回值而不用于成员类型'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：concepts、ranges 与错误诊断': [
    [0, 'requires 表达式会先实例化函数体，只有实例化失败后才把 concept 求值为 false 并输出完整错误'],
    [1, 'std::integral<double> 为 false 只是编译器实现差异，标准保证整型与浮点类型都满足同一概念'],
    [2, 'views::all 会复制临时字符串的所有权，因此把临时源绑定到视图后继续遍历是安全的'],
    [3, 'concepts 会把真正错误完全隐藏，必须禁用 concepts 并退回 C++17 才能看到模板参数问题'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：vector 扩容、迭代器失效和分配器': [
    [0, 'MSVC 与 libstdc++ 都固定按 2 倍扩容，出现 1、2、3、4、6 只可能是代码手工调用了 reserve'],
    [1, 'sizeof(std::vector<int>) 恒为 12 字节，对象内包含 size、capacity 和数据指针三个 32 位字段'],
    [2, 'push_back 触发扩容只会让尾后迭代器失效，begin() 迭代器会保留并在 realloc 后自动更新'],
    [3, 'reserve(100) 会同时把 size 设为 100 并值初始化全部元素，之后可以直接用下标覆盖赋值'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：unordered_map、红黑树与算法选型': [
    [0, 'rehash 会把所有元素复制到新节点，因此元素的引用、指针与迭代器全部失效，但值内容保持不变'],
    [1, '编译会通过，因为 unordered_map 会自动退化为按 operator< 排序的红黑树实现'],
    [2, '耗时先线性增长后突然降为常数，因为桶数量会指数扩张直到覆盖全部十万个键'],
    [3, '继续使用 unordered_map，并在每次遍历前 sort 全部键后二分查找，均摊复杂度仍然保持 O(1)'],
  ],
  'C++ · 移动、模板、Concepts 与 STL：STL 源码与容器基准实验': [
    [0, 'sum 未被使用只会让编译器把循环移到后台线程，基准结果仍然有效且更接近吞吐上限'],
    [1, 'ptype /o 会显示 vector 对象内部直接保存 int 数组，因此 sizeof 会随 capacity 一起增长'],
    [2, 'ns/op 会异常升高，因为容器构造会阻止迭代器失效，应把构造放入内层循环才能获得精确测量'],
    [3, 'list 曲线平缓说明其内存访问连续，vector 的台阶来自每元素动态分配和指针间接访问'],
  ],
};

const SOURCE_QUIZ: Readonly<Record<string, readonly LearningV2Practice[]>> = {
  ...C_SYSTEMS_COURSE_QUIZ,
  ...CPP_PERFORMANCE_COURSE_QUIZ,
};

function completeFourOptionQuiz(
  courseName: string,
  questions: readonly LearningV2Practice[],
  additions: readonly OptionAddition[],
): readonly LearningV2Practice[] {
  const additionsByIndex = new Map(additions);
  if (additionsByIndex.size !== additions.length) {
    throw new Error(`Duplicate programming quiz patch index: ${courseName}`);
  }

  const patchedIndexes = new Set<number>();
  const quiz = questions.map((question, questionIndex) => {
    const option = additionsByIndex.get(questionIndex);
    if (option === undefined) return question;
    if (question.options.length !== 3) {
      throw new Error(`Programming quiz is not three-option: ${courseName}/${questionIndex}`);
    }
    if (question.options.includes(option)) {
      throw new Error(`Duplicate programming quiz option: ${courseName}/${questionIndex}`);
    }
    patchedIndexes.add(questionIndex);
    return {
      ...question,
      options: [...question.options, option],
    };
  });

  for (const questionIndex of additionsByIndex.keys()) {
    if (!patchedIndexes.has(questionIndex)) {
      throw new Error(`Programming quiz patch index is missing: ${courseName}/${questionIndex}`);
    }
  }
  return quiz;
}

export const PROGRAMMING_FOUR_OPTION_PATCHES = Object.fromEntries(
  Object.entries(OPTION_ADDITIONS).map(([courseName, additions]) => {
    const questions = SOURCE_QUIZ[courseName];
    if (!questions) throw new Error(`Unknown programming quiz course: ${courseName}`);
    return [
      `programming:${courseName}`,
      { quiz: completeFourOptionQuiz(courseName, questions, additions) },
    ];
  }),
) satisfies CuratedCoursePlanPatchMap;
