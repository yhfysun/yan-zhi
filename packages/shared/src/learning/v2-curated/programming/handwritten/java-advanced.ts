// Java 企业级后端 · J2-J11 手写教案。
// name 与 programs.ts 中 JAVA_ENTERPRISE_COURSE 的 lesson.courseName 逐项一致。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';

const JAVA_COLLECTIONS = 'Java SE 21 Collections Framework API. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/doc-files/coll-reference.html';
const OPENJDK_COLLECTIONS = 'OpenJDK java.util source. https://github.com/openjdk/jdk/tree/master/src/java.base/share/classes/java/util';
const JAVA_SPECS = 'Java Language and Virtual Machine Specifications. https://docs.oracle.com/javase/specs/';
const JAVA_CONCURRENCY = 'Java SE 21 java.util.concurrent API. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html';
const JLS_THREADS = 'Java Language Specification, Chapter 17. https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html';
const OPENJDK_CONCURRENT = 'OpenJDK java.util.concurrent source. https://github.com/openjdk/jdk/tree/master/src/java.base/share/classes/java/util/concurrent';
const JDK_TOOLS = 'Java Platform, Standard Edition Troubleshooting Guide. https://docs.oracle.com/en/java/javase/21/troubleshoot/';
const OPENJDK = 'OpenJDK jdk repository. https://github.com/openjdk/jdk';
const JEP = 'OpenJDK JEP Index. https://openjdk.org/jeps/0';
const SPRING = 'Spring Framework Reference. https://docs.spring.io/spring-framework/reference/';
const SPRING_BOOT = 'Spring Boot Reference. https://docs.spring.io/spring-boot/reference/';
const SPRING_SECURITY = 'Spring Security Reference. https://docs.spring.io/spring-security/reference/';
const SPRING_DATA = 'Spring Data Commons Reference. https://docs.spring.io/spring-data/commons/reference/';
const SPRING_CLOUD = 'Spring Cloud Gateway Reference. https://docs.spring.io/spring-cloud-gateway/reference/';
const SPRING_AI = 'Spring AI Reference. https://docs.spring.io/spring-ai/reference/';
const MYBATIS = 'MyBatis 3 Documentation. https://mybatis.org/mybatis-3/';
const SSE_SPEC = 'WHATWG HTML Living Standard, Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html';
const REACTOR = 'Project Reactor Reference. https://projectreactor.io/docs/core/release/reference/';
const NETTY = 'Netty Reference. https://netty.io/wiki/user-guide-for-4.x.html';
const NGINX = 'nginx Documentation. https://nginx.org/en/docs/';
const KAFKA = 'Apache Kafka Documentation. https://kafka.apache.org/documentation/';
const KAFKA_SOURCE = 'Apache Kafka source. https://github.com/apache/kafka';
const SPRING_KAFKA = 'Spring for Apache Kafka Reference. https://docs.spring.io/spring-kafka/reference/';
const REDIS = 'Redis Documentation. https://redis.io/docs/latest/';
const RABBIT = 'RabbitMQ Documentation. https://www.rabbitmq.com/docs';
const HIKARI = 'HikariCP source. https://github.com/brettwooldridge/HikariCP';
const OWASP = 'OWASP Application Security Verification Standard. https://owasp.org/www-project-application-security-verification-standard/';
const OTEL = 'OpenTelemetry Documentation. https://opentelemetry.io/docs/';
const DOCKER = 'Docker Documentation. https://docs.docker.com/';
const K8S = 'Kubernetes Documentation. https://kubernetes.io/docs/';
const SRE = 'Google SRE Book. https://sre.google/sre-book/table-of-contents/';

const J2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Java 集合框架总览与复杂度',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成 Java 基础、泛型和接口课程，能在命令行编译多类项目。',
    goal: '能按顺序、唯一性、键值映射和并发访问选择集合接口，并用操作模型而非口头“O(1)”解释复杂度。',
    guidedPractice: '从同一批订单数据出发，分别用 List、Set、Map 建模，执行按索引读取、追加、按键查找和全量排序，记录每种操作的数据规模与耗时。',
    independentPractice: '为一个查询服务建立集合选型表，给出访问模式、元素数量、峰值内存和并发读写假设，再用 JMH 或简单基准验证两个候选实现。',
    commonErrors: ['把平均复杂度当成固定耗时，忽略扩容复制、缓存局部性、哈希冲突和对象分配。', '先决定 ArrayList 或 HashMap，再倒推业务需要的顺序、唯一性和并发语义。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['接口语义先于具体类', 'Collection、List、Set、Queue 和 Map 定义的是可观察行为，不承诺内部一定使用数组、链表或红黑树。List 承诺位置访问与顺序，Set 用相等性约束唯一，Map 把键映射到值；选择接口就是先确定调用方依赖哪些行为。', '先写调用契约，再选实现', {
        title: 'Java：同一订单数据映射到三种集合接口',
        language: 'Java',
        code: `List<Order> ordered = new ArrayList<>();
Set<String> uniqueIds = new HashSet<>();
Map<String, Order> byId = new HashMap<>();

Order order = new Order("O-1", 4200);
ordered.add(order);
uniqueIds.add(order.id());
byId.put(order.id(), order);

System.out.println(ordered.get(0).id());
System.out.println(uniqueIds.contains("O-1"));
System.out.println(byId.get("O-1").totalCents());`,
        output: `O-1
true
4200

List 关注位置，Set 关注唯一身份，Map 按键取值；不要把三者都当成“能装东西的袋子”。`,
      }],
      ['复杂度必须绑定操作模型', '复杂度描述输入规模增长时的趋势，常数项却会决定小数据和缓存友好数据上的胜负。ArrayList 的尾部追加通常摊还 O(1)，中间插入要移动元素；HashMap 查找平均接近常数，但冲突、扩容和对象分配都会把真实延迟推高。', '同时记录复杂度、分配与局部性', {
        title: 'Java：比较尾部追加、随机读取和按键查找',
        language: 'Java',
        code: `List<Integer> list = new ArrayList<>();
Map<Integer, Integer> map = new HashMap<>();
for (int i = 0; i < 200_000; i++) {
  list.add(i);
  map.put(i, i);
}

long start = System.nanoTime();
long sum = 0;
for (int i = 0; i < 200_000; i += 10) sum += list.get(i);
long listMs = (System.nanoTime() - start) / 1_000_000;

start = System.nanoTime();
for (int i = 0; i < 200_000; i += 10) sum += map.get(i);
long mapMs = (System.nanoTime() - start) / 1_000_000;
System.out.println(sum + "," + listMs + "," + mapMs);`,
        output: `19999900000,1,4

数值只表示本机样例耗时；真实选型还要记录内存、GC、元素分布和并发访问。`,
      }],
      ['抽象类复用不同实现骨架', 'AbstractList、AbstractSet 和 AbstractMap 复用部分算法，但仍把存储和迭代细节留给具体类。查看源码时要区分接口承诺、抽象类模板方法和 final 类实际结构，不能因为继承关系相同就假定运行成本相同。', '模板方法不等于相同性能', {
        title: 'Java：观察接口、抽象类与具体实现关系',
        language: 'Java',
        code: `Class<?> type = ArrayList.class;
while (type != null) {
  System.out.println(type.getName());
  type = type.getSuperclass();
}
System.out.println(Collection.class.isAssignableFrom(ArrayList.class));
System.out.println(List.class.isAssignableFrom(ArrayList.class));`,
        output: `java.util.ArrayList
java.util.AbstractList
java.util.AbstractCollection
java.lang.Object
true
true

ArrayList 继承共享骨架，但数组存储和 grow 仍由具体类实现；抽象类层级本身不决定复杂度。`,
      }],
      ['用四种基本操作建立基准', '至少测量顺序追加、随机查找、中间删除和全量遍历，并为每次实验固定 JDK、堆大小、预热轮次和输入生成器。记录吞吐、P99、分配速率和 GC 次数，单看一次 System.nanoTime 的差值不足以支撑选型。', '四类操作和四类指标一起看', {
        title: 'PowerShell + Java：保存一份可复现基准记录',
        language: 'PowerShell',
        code: `@'
import java.util.*;
public class CollectionOps {
  public static void main(String[] args) {
    List<Integer> list = new ArrayList<>();
    long t = System.nanoTime();
    for (int i = 0; i < 500_000; i++) list.add(i);
    long append = System.nanoTime() - t;
    System.out.printf("appendMs=%d size=%d%n", append / 1_000_000, list.size());
  }
}
'@ | Set-Content CollectionOps.java
javac CollectionOps.java
java -Xms256m -Xmx256m CollectionOps`,
        output: `appendMs=18 size=500000

固定 JDK、堆和输入规模后，至少重复预热与正式轮次；结果写入选型表，不凭一次输出做架构决策。`,
      }],
      ['把集合边界带进生产设计', '接口层应隐藏具体容器，只有在容量、顺序或并发承诺确实属于契约时才暴露。对不可信输入设置数量上限，对热点 Map 观察桶分布，对批量导入预估容量；上线前还要用真实峰值数据复测，而不是沿用课程样例的结论。', '选型结论要绑定数据规模', {
        title: 'Java：在接口层限制输入规模',
        language: 'Java',
        code: `static List<Order> importOrders(List<Order> input) {
  if (input == null) throw new IllegalArgumentException("INPUT");
  if (input.size() > 100_000) throw new IllegalArgumentException("TOO_MANY");

  List<Order> copy = new ArrayList<>(input.size());
  for (Order order : input) {
    if (order.totalCents() < 0) throw new IllegalArgumentException("NEGATIVE_TOTAL");
    copy.add(order);
  }
  return List.copyOf(copy);
}`,
        output: `合法输入返回不可变副本；超过上限或含负金额时在进入热点集合前失败。

调用方看不到 ArrayList 细节，服务内部可替换实现而不破坏契约。`,
      }],
    ],
  },
  {
    name: 'ArrayList 扩容与迭代器失效',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '知道 List 接口、数组索引和泛型擦除，能阅读基本 JDK 源码。',
    goal: '能解释 ArrayList 的 size 与数组容量、扩容复制、modCount 和 fail-fast 迭代器，并修复遍历删除问题。',
    guidedPractice: '用反射读取 ArrayList 的 elementData 长度，连续 add 观察容量变化；再在执行增强 for 循环时调用 list.remove，捕获 ConcurrentModificationException 并改用 Iterator.remove。',
    independentPractice: '构造一个百万级订单列表，比较默认构造与 ensureCapacity 预分配在批量导入时的扩容次数、耗时和内存峰值，并提交前后对照日志。',
    commonErrors: ['把 size 当成数组容量，看到元素数量很小就认为不会扩容。', '在 for-each 中删除元素后继续遍历，把 fail-fast 异常误判为存在真实并发线程。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['数组、size 与容量的三重状态', 'ArrayList 内部持有 Object[] elementData 和元素数量 size，容量是数组长度而不是 size。默认构造不会立即分配大数组，首次 add 才建立存储；后续访问始终检查 size 边界，容量只决定还能追加多少而不改变 List 可见长度。', 'size 是元素数，不是容量', {
        title: 'Java：反射查看 ArrayList 的容量',
        language: 'Java',
        code: `import java.lang.reflect.*;
import java.util.*;

static int capacity(ArrayList<?> list) throws Exception {
  Field field = ArrayList.class.getDeclaredField("elementData");
  field.setAccessible(true);
  return ((Object[]) field.get(list)).length;
}

ArrayList<String> list = new ArrayList<>();
System.out.println(list.size() + "," + capacity(list));
list.add("A");
System.out.println(list.size() + "," + capacity(list));`,
        output: `0,0
1,10

默认构造先使用空数组，首次 add 才分配容量。size 始终是 1，容量可能更大且不是公开契约。`,
      }],
      ['grow 复制是扩容的真实成本', '容量不足时 grow 计算新容量、复制旧数组并替换引用，旧的 elementData 等待 GC。批量导入若能从业务上限估算容量，可调用 ensureCapacity 减少多次复制；估得过大又会长期占用堆，容量决策必须结合峰值与生命周期。', '用扩容次数和峰值内存验收', {
        title: 'Java：ensureCapacity 与默认扩容对照',
        language: 'Java',
        code: `ArrayList<Integer> defaultList = new ArrayList<>();
ArrayList<Integer> sizedList = new ArrayList<>();
sizedList.ensureCapacity(100_000);

long t1 = System.nanoTime();
for (int i = 0; i < 100_000; i++) defaultList.add(i);
long defaultMs = (System.nanoTime() - t1) / 1_000_000;

t1 = System.nanoTime();
for (int i = 0; i < 100_000; i++) sizedList.add(i);
long sizedMs = (System.nanoTime() - t1) / 1_000_000;
System.out.println(defaultMs + "," + sizedMs);`,
        output: `6,2

预分配减少多次 grow 复制，但会立即占用约 100k 引用槽位。收益要以扩容次数、P99 和峰值堆共同验收。`,
      }],
      ['modCount 让结构修改可见', 'add、remove 和 clear 等结构修改会更新 modCount，迭代器在创建时记录 expectedModCount，每次 next 前比较两者。不一致时抛出 ConcurrentModificationException，它表示检测到未经过迭代器协议的结构修改，并不保证检测到所有并发问题。', 'fail-fast 是尽力检测，不是并发保证', {
        title: 'Java：增强 for 中删除触发 fail-fast',
        language: 'Java',
        code: `import java.util.*;

List<String> list = new ArrayList<>(List.of("A", "B", "C"));
try {
  for (String value : list) {
    if ("B".equals(value)) list.remove(value);
  }
} catch (ConcurrentModificationException error) {
  System.out.println(error.getClass().getSimpleName());
}
System.out.println(list);`,
        output: `ConcurrentModificationException
[A, C]

删除已经发生，随后迭代器发现 modCount 与 expectedModCount 不一致。这里没有并发线程，只是修改路径绕过迭代器。`,
      }],
      ['遍历删除使用同一迭代器', '增强 for 会被编译器展开为 Iterator 调用，外部 list.remove 改变 modCount 后下一次 next 就会失败。需要删除时使用 Iterator.remove，或 use removeIf；并发场景要换成真正定义并发语义的集合和显式同步策略。', '修改路径要与迭代器协商', {
        title: 'Java：Iterator.remove 与 removeIf',
        language: 'Java',
        code: `List<String> list = new ArrayList<>(List.of("A", "B", "C"));
Iterator<String> iterator = list.iterator();
while (iterator.hasNext()) {
  if ("B".equals(iterator.next())) iterator.remove();
}

list.removeIf(value -> value.startsWith("C"));
System.out.println(list);`,
        output: `[A]

Iterator.remove 会同步 expectedModCount；removeIf 内部遵循集合协议。不要在迭代器遍历外再调用 list.remove。`,
      }],
      ['容量优化必须可回退', '为导入任务记录列表生命周期、初始容量、扩容次数和峰值堆；在一次请求结束后让大列表自然释放，避免把请求级缓存提升为长期静态字段。基准要在相同数据与 JVM 参数下重复，若收益不足就保留更简单实现。', '容量收益与内存代价同时记录', {
        title: 'PowerShell：限制堆并比较容量策略',
        language: 'PowerShell',
        code: `java -Xms256m -Xmx256m -XX:+UseG1GC -jar list-bench.jar default
java -Xms256m -Xmx256m -XX:+UseG1GC -jar list-bench.jar preallocated
Compare-Object (Get-Content baseline.txt) (Get-Content preallocated.txt)
jcmd 12345 GC.heap_info`,
        output: `default: time=420ms, gc=3, peak=190MB
preallocated: time=280ms, gc=1, peak=205MB

预分配减少耗时和 GC，却提高峰值堆。只有在导入峰值可控且列表短命时才保留这项优化。`,
      }],
    ],
  },
  {
    name: 'LinkedList 结构与适用边界',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解 ArrayList 的数组结构和链表节点概念。',
    goal: '能解释 LinkedList 的双向链表节点、首尾定位、按索引遍历和对象开销，并判断何时应改用 ArrayDeque 或 ArrayList。',
    guidedPractice: '阅读 Node、linkFirst、linkLast 和 node(int index)，对首部插入、尾部插入、中部插入和随机 get 各运行一组递增规模实验，记录节点分配与耗时。',
    independentPractice: '把一段把 LinkedList 当随机访问列表使用的代码迁移为 ArrayList 或 Deque，并用操作计数和堆分配对比证明迁移收益及行为边界。',
    commonErrors: ['认为链表任意位置插入永远是 O(1)，忽略先用 node(index) 找到位置的成本。', '忽略每个节点都包含前后引用与对象头，导致内存占用和缓存未命中远高于数组。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['双向节点保存前后链接', 'LinkedList 由 Node 对象组成，每个节点保存 item、prev 和 next，first 与 last 指向两端。首尾增删只需改变少量链接，但每个元素都被包装成独立对象，额外引用和对象头会增加堆占用。', '链接灵活，节点有额外成本', {
        title: 'Java：反射读取节点链接',
        language: 'Java',
        code: `import java.lang.reflect.*;
import java.util.*;

LinkedList<String> list = new LinkedList<>(List.of("A", "B", "C"));
Field firstField = LinkedList.class.getDeclaredField("first");
firstField.setAccessible(true);
Object node = firstField.get(list);
Class<?> nodeType = node.getClass();
Field item = nodeType.getDeclaredField("item");
Field next = nodeType.getDeclaredField("next");
item.setAccessible(true);
next.setAccessible(true);
System.out.println(item.get(node));
System.out.println(next.get(node) != null);`,
        output: `A
true

每个元素是一个 Node，包含 item、prev、next。链表省去了数组扩容复制，却为每项增加了对象头和两个引用。`,
      }],
      ['按索引访问要走到目标节点', 'node(index) 会比较索引与 size 的一半，从头部或尾部逐节点跳转，因此随机 get 是线性时间。中部插入看起来只需改链接，实际先付费寻找节点；若调用方持有节点引用才能接近常数插入，但普通 List API 不提供该能力。', '定位成本常被忽略', {
        title: 'Java：随机索引访问 LinkedList',
        language: 'Java',
        code: `LinkedList<Integer> list = new LinkedList<>();
for (int i = 0; i < 20_000; i++) list.add(i);

long start = System.nanoTime();
long sum = 0;
for (int i = 0; i < 20_000; i += 100) sum += list.get(i);
long elapsedMs = (System.nanoTime() - start) / 1_000_000;
System.out.println(sum + "," + elapsedMs);`,
        output: `1999900,32

get(index) 从最近端逐节点走到目标。索引越靠中间，路径越长；随机访问场景应使用 ArrayList。`,
      }],
      ['链表局部性通常更差', '数组元素连续存储，顺序遍历容易命中 CPU 缓存；链表节点分散在堆中，每跳一次都可能发生缓存未命中。对象数量增加也会提高 GC 扫描和分配压力，所以即使复杂度相同，真实吞吐仍可能由内存布局决定。', '缓存局部性属于性能事实', {
        title: 'Java：同规模遍历 ArrayList 与 LinkedList',
        language: 'Java',
        code: `List<Integer> array = new ArrayList<>();
List<Integer> linked = new LinkedList<>();
for (int i = 0; i < 1_000_000; i++) {
  array.add(i);
  linked.add(i);
}

long start = System.nanoTime();
long a = array.stream().mapToLong(Integer::longValue).sum();
long arrayMs = (System.nanoTime() - start) / 1_000_000;

start = System.nanoTime();
long b = linked.stream().mapToLong(Integer::longValue).sum();
long linkedMs = (System.nanoTime() - start) / 1_000_000;
System.out.println(a == b);
System.out.println(arrayMs + "," + linkedMs);`,
        output: `true
3,18

结果受 JVM 和机器影响，但连续数组通常缓存更友好。链表每个节点都增加分配与指针跳转。`,
      }],
      ['用操作序列而不是数据结构名验收', '测试要包含首尾操作、中部插入、按索引读取和全量遍历，并输出每类操作次数。只测 append 会掩盖随机访问问题，只测中间插入又会把查找成本算进循环外部；操作序列必须接近生产调用方式。', '基准脚本模拟真实调用顺序', {
        title: 'Java：按业务操作序列选择容器',
        language: 'Java',
        code: `Deque<Integer> queue = new ArrayDeque<>();
for (int i = 0; i < 100_000; i++) queue.addLast(i);

long start = System.nanoTime();
long sum = 0;
while (!queue.isEmpty()) sum += queue.removeFirst();
long dequeMs = (System.nanoTime() - start) / 1_000_000;

List<Integer> list = new ArrayList<>();
for (int i = 0; i < 100_000; i++) list.add(i);
start = System.nanoTime();
sum = 0;
for (int value : list) sum += value;
long listMs = (System.nanoTime() - start) / 1_000_000;
System.out.println(sum + "," + dequeMs + "," + listMs);`,
        output: `4999950000,4,1

如果业务只是先进先出，Deque/ArrayDeque 比 LinkedList 更合适；如果只是遍历和索引，ArrayList 更直接。`,
      }],
      ['优先选择表达力更强的接口', '需要栈或双端队列时使用 ArrayDeque，需要随机访问时使用 ArrayList；LinkedList 更适合必须频繁在两端增删且不按索引访问的明确场景。API 接受 Deque 还能让调用方替换实现，而不把链表细节泄漏到业务层。', '用接口约束真实操作', {
        title: 'Java：用 Deque 表达队列能力',
        language: 'Java',
        code: `interface TaskQueue {
  void enqueue(String task);
  String dequeue();
}

final class DequeTaskQueue implements TaskQueue {
  private final Deque<String> values = new ArrayDeque<>();
  public void enqueue(String task) { values.addLast(task); }
  public String dequeue() { return values.removeFirst(); }
}

TaskQueue queue = new DequeTaskQueue();
queue.enqueue("send-email");
System.out.println(queue.dequeue());`,
        output: `send-email

调用方只依赖队列语义，实现可以从 ArrayDeque 换成有界队列或持久化队列，不需要知道 LinkedList 节点结构。`,
      }],
    ],
  },
  {
    name: 'HashMap 哈希冲突与树化',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 hashCode、equals、数组索引和基本复杂度。',
    goal: '能沿 putVal、resize 和 treeifyBin 解释 HashMap 的桶定位、冲突链、扩容与红黑树阈值，并修复可变键问题。',
    guidedPractice: '定义只按 id 判等但 hashCode 始终返回 1 的键，批量 put 后通过调试器查看 table、桶链表长度和 size；再把键字段改为 final 后查询，比较冲突与查找路径。',
    independentPractice: '用一个业务主键对象作为 Map 键，补 equals/hashCode 契约测试，覆盖相等对象、哈希冲突、集合字段变化和序列化往返。',
    commonErrors: ['只重写 equals 不重写 hashCode，导致相等键落入不同桶。', '把可变对象放入 HashMap 后再修改参与哈希的字段，使 get 和 remove 找不到原条目。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['哈希扩散与桶索引', 'HashMap 先对 key 的 hashCode 做高位扩散，再用 table 长度减一与哈希值做按位与得到桶下标。容量通常是 2 的幂，使位运算等价于取模，但只使用低位时冲突会集中；因此 hash 方法会混入高位来改善分布。', '先算扩散哈希，再定位桶', {
        title: 'Java：计算扩散哈希与桶下标',
        language: 'Java',
        code: `static int spread(int hash) {
  return hash ^ (hash >>> 16);
}

int hash = "O-1001".hashCode();
int capacity = 16;
int spreadHash = spread(hash);
int index = spreadHash & (capacity - 1);

System.out.println(hash);
System.out.println(spreadHash);
System.out.println(index);`,
        output: `2161402977
2161432342
6

HashMap 会混合高位再用掩码定位桶；桶号只说明初始位置，最终仍需比较 hash 与 equals。`,
      }],
      ['putVal 先查同桶再判键相等', 'putVal 找到桶后，空桶直接放入新节点；非空桶先比较首节点哈希与键，再沿链表或树查找。键相等要求哈希相同且 equals 为真，命中则替换 value，未命中才追加节点并增加 size。', '桶相同不等于键相等', {
        title: 'Java：构造哈希冲突的两个键',
        language: 'Java',
        code: `class Key {
  final String id;
  Key(String id) { this.id = id; }
  public boolean equals(Object other) {
    return other instanceof Key key && id.equals(key.id);
  }
  public int hashCode() { return 1; }
}

Map<Key, String> map = new HashMap<>();
map.put(new Key("A"), "first");
map.put(new Key("B"), "second");
System.out.println(map.size());
System.out.println(map.get(new Key("A")));`,
        output: `2
first

两个键落入同一桶，但 equals 不同，因此都保留；同桶只表示需要继续比较，不表示覆盖。`,
      }],
      ['扩容重排已有节点', '当 size 超过阈值时 resize 把 table 扩大一倍，并根据节点哈希的额外位把旧桶拆成低位链和高位链。扩容不是简单复制，涉及新数组分配和节点重排；大量键同时进入会形成分配尖峰，容量预估要服务于真实批量写入。', '扩容会重排并产生分配', {
        title: 'Java：反射观察 HashMap 表长度',
        language: 'Java',
        code: `import java.lang.reflect.*;
import java.util.*;

static int tableLength(HashMap<?, ?> map) throws Exception {
  Field table = HashMap.class.getDeclaredField("table");
  table.setAccessible(true);
  Object[] values = (Object[]) table.get(map);
  return values == null ? 0 : values.length;
}

HashMap<Integer, Integer> map = new HashMap<>();
for (int i = 1; i <= 13; i++) {
  map.put(i, i);
  if (i == 12 || i == 13) System.out.println(i + ":" + tableLength(map));
}`,
        output: `12:16
13:32

阈值触发后容量翻倍并重排。一次批量写入前估算容量，可以减少 resize 分配尖峰。`,
      }],
      ['树化需要容量与冲突同时满足', '单个桶链过长时 treeifyBin 会先检查 table 是否达到最小树化容量，容量不足优先扩容；满足条件后把节点转为 TreeNode 红黑树。树化仍以 hash 和 compare 规则组织，重复键和不可比较键都有边界，不能用“树化后永不再冲突”概括。', '先扩容，满足条件才树化', {
        title: 'Java：大量冲突键观察桶节点类型',
        language: 'Java',
        code: `import java.lang.reflect.Field;
import java.util.HashMap;

record BadKey(int id) {
  public int hashCode() { return 1; }
}

HashMap<BadKey, Integer> map = new HashMap<>();
for (int i = 0; i < 16; i++) map.put(new BadKey(i), i);

Field field = HashMap.class.getDeclaredField("table");
field.setAccessible(true);
Object[] table = (Object[]) field.get(map);
int index = 1 & (table.length - 1);
System.out.println(table.length);
System.out.println(table[index].getClass().getName());`,
        output: `64
java.util.HashMap$TreeNode

容量达到树化条件且单桶冲突足够多后节点变为 TreeNode；这仍不是正常业务键应有的哈希分布。`,
      }],
      ['键契约必须稳定可验证', 'equals 与 hashCode 要基于创建后不变化的字段，并保证相等对象哈希相同。测试不仅覆盖普通相等，还要覆盖哈希碰撞、字段修改后不可查找、并发修改导致的不一致；Map 本身不是并发集合，多线程写入要另选 ConcurrentHashMap 或加锁。', '可变键是数据完整性缺陷', {
        title: 'Java + JUnit：验证键契约',
        language: 'Java',
        code: `@Test
void equalKeysHaveSameHashAndRemainFindable() {
  Key first = new Key("O-1");
  Key second = new Key("O-1");
  assertEquals(first, second);
  assertEquals(first.hashCode(), second.hashCode());

  Map<Key, String> map = new HashMap<>();
  map.put(first, "PAID");
  assertEquals("PAID", map.get(second));
}

@Test
void keysAreImmutable() {
  Key key = new Key("O-1");
  assertThrows(UnsupportedOperationException.class, () -> key.changeId("O-2"));
}`,
        output: `✔ equalKeysHaveSameHashAndRemainFindable()
✔ keysAreImmutable()
Tests 2 passed

契约测试同时覆盖相等对象查找和禁止修改身份字段。`,
      }],
    ],
  },
  {
    name: 'TreeMap 排序与比较器',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 Map 接口、比较器和红黑树的基本概念。',
    goal: '能正确设计 Comparator 的传递性与相等语义，使用 TreeMap 的有序导航和范围视图，并识别比较结果为 0 的影响。',
    guidedPractice: '用订单金额与创建时间组合 Comparator 构造 TreeMap，调用 firstKey、subMap 和 descendingMap；再写入两个比较结果为 0 的不同订单，观察后一个覆盖前一个。',
    independentPractice: '为可空值设计稳定的比较规则，编写传递性、对称性和重复键测试，并说明为什么 Comparator 不能依赖每次调用都变化的系统时间。',
    commonErrors: ['Comparator 返回 0 就以为两个对象完全相同，忽略 TreeMap 会把它们视为同一个键。', '使用不满足传递性的比较器，导致查找、插入和范围查询行为不可预测。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['比较结果决定树的路径', 'TreeMap 在每次 put、get 和 remove 时通过 Comparator 或键的自然顺序比较，结果小于零走左子树，大于零走右子树，等于零视为同一键。排序依赖比较器在全输入域保持自洽，不能只在样例数据上看似有序。', '0 代表键位置相同', {
        title: 'Java：TreeMap 按金额与时间排序',
        language: 'Java',
        code: `record Order(String id, long cents, long createdAt) {}

Comparator<Order> byAmountThenTime = Comparator
  .comparingLong(Order::cents)
  .thenComparingLong(Order::createdAt);

TreeMap<Order, String> map = new TreeMap<>(byAmountThenTime);
map.put(new Order("O-2", 200, 2), "second");
map.put(new Order("O-1", 100, 1), "first");
map.put(new Order("O-3", 300, 3), "third");
System.out.println(map);`,
        output: `{Order[id=O-1, cents=100, createdAt=1]=first, Order[id=O-2, cents=200, createdAt=2]=second, Order[id=O-3, cents=300, createdAt=3]=third}

TreeMap 按比较器决定顺序。金额和时间都参与比较，避免同金额订单被误判为同键。`,
      }],
      ['比较一致性与 equals 相互独立', 'TreeMap 的键相等由比较结果决定，不调用 equals；因此 Comparator 忽略某个字段时，两个 equals 不同的对象仍可能覆盖。业务建模要明确排序键是否同时也是唯一键，否则应组合比较字段或改用其他容器。', '排序键和身份键要分清', {
        title: 'Java：比较器返回 0 导致覆盖',
        language: 'Java',
        code: `TreeMap<Order, String> byAmount = new TreeMap<>(
  Comparator.comparingLong(Order::cents)
);

Order first = new Order("O-1", 100, 1);
Order second = new Order("O-2", 100, 2);
byAmount.put(first, "first");
byAmount.put(second, "second");

System.out.println(first.equals(second));
System.out.println(byAmount.size());
System.out.println(byAmount.firstEntry());`,
        output: `false
1
Order[id=O-2, cents=100, createdAt=2]=second

两个订单不同，但 amount=100 比较结果为 0，TreeMap 把它们视为同一键，后一个覆盖前一个。`,
      }],
      ['红黑树维持对数高度', 'TreeMap 的 Entry 保存左右子节点、父节点和颜色，插入删除后通过旋转与重着色恢复黑高平衡。导航方法利用有序结构在 O(log n) 附近定位边界，但每次节点访问仍会跳转堆对象，性能取决于比较器成本。', '平衡保证高度，比较器决定成本', {
        title: 'Java：比较 TreeMap 与 HashMap 查找',
        language: 'Java',
        code: `TreeMap<Integer, Integer> tree = new TreeMap<>();
HashMap<Integer, Integer> hash = new HashMap<>();
for (int i = 0; i < 500_000; i++) {
  tree.put(i, i);
  hash.put(i, i);
}

long start = System.nanoTime();
long t = 0;
for (int i = 0; i < 500_000; i += 10) t += tree.get(i);
long treeMs = (System.nanoTime() - start) / 1_000_000;

start = System.nanoTime();
long h = 0;
for (int i = 0; i < 500_000; i += 10) h += hash.get(i);
long hashMs = (System.nanoTime() - start) / 1_000_000;
System.out.println(t + "," + treeMs + "," + hashMs);`,
        output: `12499750000,31,8

TreeMap 保持有序但每次查找走比较路径；HashMap 平均桶查找更快。需要排序范围时才优先 TreeMap。`,
      }],
      ['范围视图依赖边界语义', 'subMap、headMap 和 tailMap 的 fromInclusive、toInclusive 决定边界是否包含，返回的是受原 Map 支持的视图。向视图写入会回写原树，边界外操作抛 IllegalArgumentException；测试要同时覆盖端点、空区间和反向区间。', '边界参数必须逐项验证', {
        title: 'Java：subMap 边界和回写',
        language: 'Java',
        code: `TreeMap<Integer, String> map = new TreeMap<>();
map.put(1, "A");
map.put(2, "B");
map.put(3, "C");
map.put(4, "D");

NavigableMap<Integer, String> middle = map.subMap(2, true, 3, false);
middle.put(2, "B2");
System.out.println(middle);
System.out.println(map);`,
        output: `{2=B2}
{1=A, 2=B2, 3=C, 4=D}

subMap 是原 Map 的视图，[2, true] 包含 2，[3, false] 不包含 3；写视图会影响原树。`,
      }],
      ['比较器也是生产配置', '比较器若读取时区、随机数或可变全局状态，同一键在不同时刻可能进入不同位置。把排序规则写成纯函数，测试 null、极值、相等值和组合顺序；在发布前用真实数据检查传递性，而不是仅靠一个排序结果截图。', '排序规则必须确定且可复现', {
        title: 'Java + JUnit：验证比较器传递性',
        language: 'Java',
        code: `Comparator<String> comparator = Comparator
  .nullsLast(String.CASE_INSENSITIVE_ORDER)
  .thenComparing(Comparator.naturalOrder());

List<String> input = new ArrayList<>(List.of("b", "A", "a", "B", "c"));
input.sort(comparator);
System.out.println(input);

assertDoesNotThrow(() -> {
  TreeSet<String> set = new TreeSet<>(comparator);
  set.addAll(input);
});`,
        output: `[A, a, B, b, c]

比较器先忽略大小写再以自然顺序打破平局，避免 A/a 被视为同一键；null 规则也必须与其他比较保持一致。`,
      }],
    ],
  },
  {
    name: 'Set 唯一性与 equals/hashCode',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 equals、hashCode、Comparator 与 Map 的基本使用。',
    goal: '能区分 HashSet、LinkedHashSet 和 TreeSet 的唯一性来源，并为业务去重选择稳定、可测试的相等或排序规则。',
    guidedPractice: '同一组订单分别加入 HashSet、LinkedHashSet 和按时间比较的 TreeSet，打印迭代顺序和 size；随后修改一个键参与哈希的字段，再执行 contains 观察集合失效。',
    independentPractice: '为一批含重复业务编号的记录设计去重流程，先按唯一键筛选，再按展示顺序排序，并分别验证集合大小、首项和不可变性。',
    commonErrors: ['用 TreeSet 却只定义自然顺序，忽略 compare 返回 0 会删除不同业务对象。', '认为 LinkedHashSet 是线程安全的，或多个线程同时添加不会破坏顺序。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['HashSet 用 Map 的键实现唯一', 'HashSet 内部通常由 HashMap 保存元素作为键，value 是共享占位对象。add 先定位哈希桶，再按 hashCode 与 equals 判断是否已存在；因此集合唯一性完全继承键对象的契约。', '相等性由键契约决定', {
        title: 'Java：观察 HashSet.add 返回值',
        language: 'Java',
        code: `record OrderId(String value) {}

Set<OrderId> ids = new HashSet<>();
System.out.println(ids.add(new OrderId("O-1")));
System.out.println(ids.add(new OrderId("O-1")));
System.out.println(ids.size());`,
        output: `true
false
1

第二次 add 遇到相等键返回 false，集合大小不变。唯一性来自 OrderId 的 record equals/hashCode，而不是对象引用。`,
      }],
      ['LinkedHashSet 保留插入遍历顺序', 'LinkedHashSet 在哈希表基础上增加双向链接，迭代时按插入顺序访问，但查找仍依赖哈希。它不是“按访问时间排序”的集合，并发写入也没有同步保证；需要并发语义时应使用 ConcurrentHashMap.newKeySet 等明确 API。', '插入顺序不是排序', {
        title: 'Java：LinkedHashSet 保留首次插入顺序',
        language: 'Java',
        code: `Set<String> ids = new LinkedHashSet<>();
ids.add("O-3");
ids.add("O-1");
ids.add("O-3");
ids.add("O-2");
System.out.println(ids);`,
        output: `[O-3, O-1, O-2]

重复 O-3 不改变首次位置，也不会移到末尾。需要按时间或金额排序时应显式排序，而不是依赖插入顺序。`,
      }],
      ['TreeSet 用比较结果判重', 'TreeSet 依赖 NavigableMap，比较结果为 0 时认为元素已经存在。自然顺序要求元素实现 Comparable，自定义比较器则决定排序和唯一性；如果业务身份由 id 决定、展示由时间决定，单一比较器不能满足两个目标。', '排序键可能吞掉不同身份', {
        title: 'Java：TreeSet 比较器返回 0 导致去重',
        language: 'Java',
        code: `record Order(String id, long cents) {}

Set<Order> set = new TreeSet<>(Comparator.comparingLong(Order::cents));
set.add(new Order("O-1", 100));
set.add(new Order("O-2", 100));
System.out.println(set);`,
        output: `[Order[id=O-2, cents=100]]

两个订单 ID 不同，但金额比较为 0，TreeSet 视为同一键。需要保留 ID 差异时，应在比较器中追加 id。`,
      }],
      ['去重对象要可复现', '测试准备两个字段相同但引用不同的对象、两个哈希相同但 equals 不同的对象，以及两个业务键相同但其他字段不同的对象。检查 add 返回值、size、contains 和迭代顺序，能够区分容器行为与对象契约。', '用四种对象关系做断言', {
        title: 'Java + JUnit：验证 Set 四种关系',
        language: 'Java',
        code: `OrderId first = new OrderId("O-1");
OrderId same = new OrderId("O-1");
OrderId different = new OrderId("O-2");

Set<OrderId> set = new HashSet<>();
assertTrue(set.add(first));
assertFalse(set.add(same));
assertTrue(set.contains(same));
assertFalse(set.contains(different));
assertEquals(1, set.size());`,
        output: `✔ first 添加成功
✔ same 被 equals/hashCode 去重
✔ contains(same) 为 true
✔ different 不在集合

断言同时区分引用不同、业务相等和业务不同三种情况。`,
      }],
      ['集合输出要有稳定边界', '把去重结果直接返回给 API 时，要说明顺序是否属于契约；内部集合应防御性复制，避免调用方修改影响缓存。跨线程共享时不要依赖 Set 接口自带的并发性，按读写模式选择不可变包装或真正的并发集合。', '顺序、线程和归属写进接口', {
        title: 'Java：返回不可变去重结果',
        language: 'Java',
        code: `Set<String> unique = new LinkedHashSet<>(List.of("A", "B", "A"));
Set<String> result = Collections.unmodifiableSet(unique);

System.out.println(result);
try {
  result.add("C");
} catch (UnsupportedOperationException error) {
  System.out.println("immutable");
}`,
        output: `[A, B]
immutable

返回顺序由 LinkedHashSet 固定，调用方不能修改内部集合。若需要并发写，应另建副本或选择明确的并发集合。`,
      }],
    ],
  },
  {
    name: 'Queue、Deque 与 PriorityQueue',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解 Collection 接口、比较器和基本并发概念。',
    goal: '能区分 Queue 的插入检查方法、Deque 的双端语义和 PriorityQueue 的堆不变量，并用比较器实现可验证的任务优先级。',
    guidedPractice: '用 ArrayDeque 实现浏览器前进后退，用 offerFirst/offerLast/pollFirst 记录每一步状态；再创建按截止时间排序的 PriorityQueue，打印数组内部顺序与连续 poll 顺序。',
    independentPractice: '实现一个有容量上限的任务队列，处理空队列、同优先级、取消任务和比较器变更，并写出每个失败边界的断言。',
    commonErrors: ['用 add/remove 在满或空时抛异常，却没有把失败处理纳入队列契约。', '修改已入队元素的比较字段，导致堆顺序失去不变量。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['Queue 用返回值表达可恢复失败', 'offer 在容量受限时返回 false，poll 在空队列返回 null，peek 只观察队首；add、remove 和 element 则以 NoSuchElementException 或容量异常报告失败。生产代码要按调用方是否希望恢复来选择方法，不能混用异常与 null。', '先约定空和满时的行为', {
        title: 'Java：区分 offer/poll 与 add/remove',
        language: 'Java',
        code: `Queue<String> queue = new LinkedList<>();
System.out.println(queue.offer("A"));
System.out.println(queue.poll());
System.out.println(queue.poll());
try {
  queue.remove();
} catch (NoSuchElementException error) {
  System.out.println("empty");
}`,
        output: `true
A
null
empty

poll 在空队列返回 null，适合可恢复消费；remove 抛异常，适合空队列代表程序缺陷的场景。`,
      }],
      ['ArrayDeque 是环形数组', 'ArrayDeque 用 head 与 tail 表示有效区间，首尾增删通过索引移动完成，必要时扩容。它不允许 null 元素，适合栈和双端队列；Deque 的 push/pop 与 addFirst/removeFirst 具有明确的端点语义，不能把它当随机访问 List。', '端点操作明确，禁止 null', {
        title: 'Java：ArrayDeque 实现栈与双端队列',
        language: 'Java',
        code: `Deque<String> deque = new ArrayDeque<>();
deque.addLast("A");
deque.addLast("B");
deque.addFirst("first");
System.out.println(deque.removeFirst());
System.out.println(deque.removeLast());

Deque<String> stack = new ArrayDeque<>();
stack.push("bottom");
stack.push("top");
System.out.println(stack.pop());`,
        output: `first
B
top

ArrayDeque 不允许 null；push/pop 明确操作栈顶，addFirst/addLast 明确端点。`,
      }],
      ['PriorityQueue 只保证堆顶', 'PriorityQueue 用数组保存完全二叉树，siftUp 和 siftDown 维持父节点不大于或大于子节点。迭代顺序不是完整排序，只有连续 poll 才按比较器输出；比较器变更后必须重新建堆，不能期待自动修复。', '堆顶有序，不等于全数组有序', {
        title: 'Java：PriorityQueue 迭代与 poll 差异',
        language: 'Java',
        code: `PriorityQueue<Integer> queue = new PriorityQueue<>();
queue.addAll(List.of(5, 1, 4, 2, 3));
System.out.println(queue);
System.out.println(queue.peek());
while (!queue.isEmpty()) System.out.print(queue.poll() + " ");`,
        output: `[1, 2, 4, 5, 3]
1
1 2 3 4 5

数组内部只满足堆不变量，不是全排序。连续 poll 才得到完整升序输出。`,
      }],
      ['优先级对象不可在队列内变异', 'PriorityQueue 不跟踪已插入元素后续的字段变化，元素在队列中修改优先级会破坏堆不变量。需要用不可变任务快照，取消时通过单独状态映射过滤；如果必须更新优先级，应移除、修改副本、再插入并记录操作。', '入堆后保持比较键稳定', {
        title: 'Java：不可变任务快照',
        language: 'Java',
        code: `record Task(String id, int priority) implements Comparable<Task> {
  public int compareTo(Task other) {
    return Integer.compare(priority, other.priority);
  }
}

PriorityQueue<Task> queue = new PriorityQueue<>();
queue.add(new Task("T-1", 5));
queue.add(new Task("T-2", 1));
System.out.println(queue.poll());
System.out.println(queue.poll());`,
        output: `Task[id=T-2, priority=1]
Task[id=T-1, priority=5]

record 字段不可变，入堆后比较键不会改变。若优先级变化，应插入新快照并处理旧任务状态。`,
      }],
      ['容量、公平性与关闭方式', '有界队列要在满时决定阻塞、拒绝或丢弃，并在关闭时唤醒等待者；优先级相同还要定义稳定顺序。测试覆盖空队列、满队列、比较器相等、并发关闭和取消，将每种结果的调用方行为写进运行手册。', '满、空、关闭都要可观察', {
        title: 'Java：有界任务队列返回明确失败',
        language: 'Java',
        code: `final class BoundedTasks {
  private final ArrayDeque<String> items = new ArrayDeque<>();
  private final int capacity;

  BoundedTasks(int capacity) { this.capacity = capacity; }

  boolean offer(String task) {
    if (items.size() >= capacity) return false;
    items.addLast(task);
    return true;
  }

  String poll() { return items.pollFirst(); }
}

BoundedTasks tasks = new BoundedTasks(1);
System.out.println(tasks.offer("A"));
System.out.println(tasks.offer("B"));`,
        output: `true
false

满队列明确返回 false，调用方可拒绝、阻塞或降级。空队列 poll 返回 null，关闭语义仍需另外建模。`,
      }],
    ],
  },
  {
    name: 'ConcurrentHashMap 并发语义',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 HashMap、happens-before、CAS 和 synchronized 的基础语义。',
    goal: '能解释 ConcurrentHashMap 的桶级并发、可见性、复合操作和弱一致迭代器，并能区分单键原子与多键业务原子。',
    guidedPractice: '多线程并发执行 computeIfAbsent、incrementAndGet 和 put，记录 size、桶结构和耗时；再用两个键实现转账式复合更新，证明单次 API 原子性不足。',
    independentPractice: '实现一个并发命中计数与缓存加载器，限制加载竞争、处理加载异常，并通过多线程测试和日志证明没有重复或丢失更新。',
    commonErrors: ['把 ConcurrentHashMap 当成整个 Map 事务，跨多个键的读写仍按单次操作假设原子。', '在 computeIfAbsent 的映射函数里执行长时间远程调用或再次修改同一个 Map。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_CONCURRENT],
    steps: [
      ['桶级同步加 CAS 协作', 'ConcurrentHashMap 读取通常不加锁，插入新桶可把节点 CAS 到 table，已有桶的更新使用 synchronized 锁住首节点；volatile 字段和节点链接建立可见性。它避免的是全局锁，不是把所有业务操作合并成一个原子步骤。', '并发粒度到桶，不到业务事务', {
        title: 'Java：computeIfAbsent 只初始化一次',
        language: 'Java',
        code: `ConcurrentHashMap<String, Integer> cache = new ConcurrentHashMap<>();
int value = cache.computeIfAbsent("answer", key -> 42);
int same = cache.computeIfAbsent("answer", key -> 99);
System.out.println(value);
System.out.println(same);`,
        output: `42
42

同一键已有值时不会再次执行映射函数。并发调用仍共享该键的原子边界，但不同键可能并行加载。`,
      }],
      ['迭代器是弱一致快照视图', '迭代器遍历时反映构造后某个时间点或后续可见的部分变化，不抛 ConcurrentModificationException，也不保证包含构造后所有更新。它可以与写入并发，但不能当成一致快照做金额汇总或库存结算。', '弱一致适合遍历，不适合对账', {
        title: 'Java：并发写入时弱一致迭代',
        language: 'Java',
        code: `ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();
map.put("A", 1);
map.put("B", 2);

Iterator<String> iterator = map.keySet().iterator();
if (iterator.hasNext()) iterator.next();
map.put("C", 3);

List<String> seen = new ArrayList<>();
while (iterator.hasNext()) seen.add(iterator.next());
System.out.println(seen);
System.out.println(map.keySet());`,
        output: `[B]
[A, B, C]

迭代过程不抛 ConcurrentModificationException，但不保证看到迭代开始后的 C。对账需要停止写入或使用锁定快照。`,
      }],
      ['复合方法只承诺单次映射原子', 'putIfAbsent、remove(key,value)、replace、compute 和 merge 对同一个键的检查和修改具有原子语义；computeIfAbsent 中加载失败会移除占位，递归更新同一键可能抛 IllegalStateException。跨键的“先读 A 再写 B”仍要锁、事务或状态机。', '先画原子边界再调用 API', {
        title: 'Java：单键原子与跨键不原子',
        language: 'Java',
        code: `ConcurrentHashMap<String, Integer> balances = new ConcurrentHashMap<>();
balances.put("A", 100);
balances.put("B", 0);

// 跨两个键不是原子事务
int from = balances.get("A");
int to = balances.get("B");
balances.put("A", from - 30);
balances.put("B", to + 30);

// 单键更新可以原子化
balances.compute("A", (key, value) -> value == null ? 0 : value + 1);
System.out.println(balances);`,
        output: `{A=71, B=30}

单键 compute 原子，但两次 get/put 之间仍可能被其他线程修改。转账需要锁、数据库事务或统一账户聚合对象。`,
      }],
      ['计数要处理热点竞争', 'AtomicInteger 在高并发下共享同一缓存行，CAS 重试会放大开销；LongAdder 分散到单元格再汇总，适合高频计数但 sum 是弱一致值。选择前用线程数、更新频率和读取频率压测，不要只看单线程吞吐。', '读多写少与写多要分开选型', {
        title: 'Java：LongAdder 高并发计数',
        language: 'Java',
        code: `import java.util.concurrent.atomic.LongAdder;
import java.util.stream.IntStream;

LongAdder hits = new LongAdder();
IntStream.range(0, 1_000_000).parallel().forEach(index -> hits.increment());
System.out.println(hits.sum());`,
        output: `1000000

LongAdder 把热点分散到单元格，sum 汇总当前值。读取不是单次 CAS 那样的强一致快照，适合监控计数。`,
      }],
      ['容量和业务不变量要观测', '监控 size 的调用成本、桶冲突、加载耗时、异常和热点键，避免把大对象缓存无界增长。清理策略需要处理过期、版本变化和删除竞态；对外结果应定义最终一致性窗口，并提供强制刷新或降级路径。', '缓存也是有状态的生产资源', {
        title: 'Java：带版本和异常处理的缓存加载',
        language: 'Java',
        code: `record CacheValue(String data, long loadedAt) {}

ConcurrentHashMap<String, CacheValue> cache = new ConcurrentHashMap<>();
CacheValue load(String key) {
  return cache.computeIfAbsent(key, ignored -> {
    try {
      return new CacheValue(repository.load(key), System.currentTimeMillis());
    } catch (RuntimeException error) {
      log.warn("cache-load-failed key={}", key, error);
      throw error;
    }
  });
}`,
        output: `加载成功才留下 CacheValue；异常不会写入伪造占位值。

生产还应限制 key 数量、过期清理和容量淘汰。热门 key 的长时间加载会阻塞同键其他调用。`,
      }],
    ],
  },
  {
    name: 'Stream 与 Collectors 的性能边界',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '会使用 Lambda、函数式接口、集合和 JUnit，理解装箱概念。',
    goal: '能解释 Stream 流水线的惰性、短路和终端消费，识别装箱、分组与并行流的成本，并用基准选择可读且可接受的实现。',
    guidedPractice: '对同一订单集合分别写普通循环、串行 Stream 和 parallelStream，统计过滤、映射、分组结果与耗时；用 GC 日志和线程名观察中间对象、公共 ForkJoinPool 的使用。',
    independentPractice: '优化一个订单聚合任务，减少无必要装箱和中间集合，补充小数据、空数据和超大数据测试，并证明优化前后结果完全一致。',
    commonErrors: ['以为 parallelStream 会自动利用服务器全部核心，忽略数据拆分、共享池和合并成本。', '在 Stream 中执行阻塞 IO 或修改外部共享变量，导致副作用和结果不可控。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_COLLECTIONS],
    steps: [
      ['中间操作构建惰性流水线', 'filter、map 和 sorted 等中间操作只构建 AbstractPipeline，直到终端操作触发才消费源数据。流水线可能把多个无状态操作融合，但 sorted 和 distinct 往往需要缓冲或状态；理解这一点才能解释为什么代码短不等于内存少。', '先找终端操作，再看缓冲点', {
        title: 'Java：观察中间操作惰性',
        language: 'Java',
        code: `Stream<Integer> pipeline = Stream.of(1, 2, 3, 4)
  .filter(value -> { System.out.println("filter:" + value); return value > 2; })
  .map(value -> { System.out.println("map:" + value); return value * 10; });

System.out.println("before-terminal");
System.out.println(pipeline.toList());`,
        output: `before-terminal
filter:1
filter:2
filter:3
map:3
filter:4
map:4
[30, 40]

没有终端操作前没有任何元素流动；filter 与 map 按元素融合执行。`,
      }],
      ['短路操作能提前结束', 'findFirst、anyMatch 和 limit 在条件满足后可以停止上游消费，但排序、全量分组和收集会改变这个边界。把昂贵的映射放在短路操作之前可能做无用功，用 peek 观察元素流动时也要注意它只适合调试。', '短路只对部分终端成立', {
        title: 'Java：findFirst 提前停止',
        language: 'Java',
        code: `int found = Stream.of(1, 2, 3, 4, 5)
  .peek(value -> System.out.println("visit:" + value))
  .filter(value -> value > 2)
  .findFirst()
  .orElseThrow();
System.out.println("found=" + found);`,
        output: `visit:1
visit:2
visit:3
found=3

命中 3 后流水线停止，4、5 不再访问。sorted 或全量 collect 则不会这样提前结束。`,
      }],
      ['装箱与收集器会产生对象', 'IntStream 能避免 Integer 装箱，Collectors.groupingBy 会创建 Map、List 和可能的中间容器。下游收集器可以选择 counting 或 reducing，减少不必要列表；对超大集合要估算分组键数量，而不是只关注遍历时间。', '分组基数决定内存峰值', {
        title: 'Java：避免装箱并使用下游计数',
        language: 'Java',
        code: `record Event(String type, int count) {}

List<Event> events = List.of(
  new Event("paid", 1),
  new Event("paid", 2),
  new Event("failed", 1)
);

Map<String, Integer> sums = events.stream().collect(
  Collectors.groupingBy(Event::type, Collectors.summingInt(Event::count))
);
int total = events.stream().mapToInt(Event::count).sum();
System.out.println(sums);
System.out.println(total);`,
        output: `{paid=3, failed=1}
4

mapToInt 避免每项 Integer 装箱；groupingBy+summingInt 直接聚合，不创建每组的中间 List。`,
      }],
      ['并行流属于共享调度资源', 'parallelStream 默认使用公共 ForkJoinPool，拆分策略依赖数据源的可分割性，合并阶段也有成本。阻塞调用会占住工作线程，I/O 任务应使用有界执行器；CPU 密集任务也要先证明可利用多个核心。', '并行不是免费的线程池', {
        title: 'Java：记录并行流实际线程',
        language: 'Java',
        code: `Set<String> threads = ConcurrentHashMap.newKeySet();
long sum = LongStream.rangeClosed(1, 1_000_000)
  .parallel()
  .peek(value -> threads.add(Thread.currentThread().getName()))
  .sum();
System.out.println(sum);
System.out.println(threads);`,
        output: `500000500000
[main, ForkJoinPool.commonPool-worker-1, ForkJoinPool.commonPool-worker-2, ...]

并行任务默认共享公共池。阻塞 I/O 会占用工作线程，生产任务应使用专用有界执行器或保持串行。`,
      }],
      ['基准要覆盖结果与资源', '基准同时断言输出、元素数、分配字节和 GC 次数，至少比较循环、串行流和并行流三种方案。用小数据测常数开销，用大数据测吞吐，并记录 JDK 与硬件；如果差异落在噪声内，优先选择更易审查的写法。', '输出、延迟、内存一起对照', {
        title: 'PowerShell + JMH：比较循环与串行流',
        language: 'PowerShell',
        code: `java -jar benchmarks.jar LoopVsStream \
  -wi 3 -i 5 -f 1 \
  -p size=1000,100000,1000000 \
  -prof gc -rf json -rff stream-benchmark.json
Get-Content stream-benchmark.json -TotalCount 20`,
        output: `LoopVsStream.loop    1000    0.004 ms/op   0 B/op
LoopVsStream.stream  1000    0.011 ms/op   48 B/op
LoopVsStream.loop  1000000  3.900 ms/op   0 B/op
LoopVsStream.stream 1000000 5.100 ms/op  48 B/op

只有差异稳定超过误差且内存可接受时，才用基准结论替换更易读的实现。`,
      }],
    ],
  },
  {
    name: '集合选型与基准测试',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成集合源码阶段前九课，能运行 JMH 或编写可重复基准。',
    goal: '能把真实访问模式转成集合实验矩阵，用预热、隔离和分位数避免基准误导，并形成可回退的选型报告。',
    guidedPractice: '建立一个包含 List、Set、Map 候选实现的 JMH 项目，分别生成小规模、真实规模和压力规模数据，记录吞吐、P99、分配速率和 GC 暂停，并保留失败与异常配置。',
    independentPractice: '为一个高频查询服务完成正式选型报告：输入模型、候选集合、基准代码、环境、结果、边界、回退条件和上线观测指标。',
    commonErrors: ['用一次 warmup 不足的手写计时得出“某个集合快十倍”的结论。', '只测单一操作，不回放真实操作的顺序、命中率和并发度。'],
    sourceRefs: [JAVA_COLLECTIONS, OPENJDK_COLLECTIONS],
    steps: [
      ['先写访问模式再写候选类', '选型输入应包括元素数量、读写比例、是否按键或按索引、是否需要顺序、是否允许重复、单次批量大小和线程数。没有访问模式的对比只是在比较两个类名，无法回答业务是否需要哈希、有序树或并发保护。', '业务操作序列是实验输入', {
        title: '文本：集合选型输入卡',
        language: 'Text',
        code: `场景：订单查询缓存
元素数：50万
读写比：95:5
主操作：按 orderId 查找、按 status 过滤、每5分钟替换快照
顺序要求：API 列表按 createdAt 倒序
线程：20 个请求线程只读，单个刷新线程写

候选：
A. HashMap + 读取时排序
B. ConcurrentHashMap + 不可变排序快照
C. TreeMap 按 orderId`,
        output: `A 需要每次请求排序，CPU 重复。
B 让并发读无锁，刷新时替换整个不可变快照。
C 按 orderId 排序不等于按 createdAt 排序，查询仍要额外排序。

访问模式已经排除 C，并指出 A/B 需要基准比较。`,
      }],
      ['复杂度只是候选筛选器', '先用复杂度排除明显不合适的结构，再用基准确认常数项、缓存局部性、分配和锁竞争。小数据往往受启动与固定成本影响，大数据可能暴露扩容和 GC；同一结论必须在小、中、大三档上分别说明，任何一项恶化都要重新选型。', '三档数据检验结论稳健性', {
        title: 'Java：小、中、大三档测量查找',
        language: 'Java',
        code: `for (int size : new int[] { 10, 10_000, 1_000_000 }) {
  Map<Integer, Integer> map = new HashMap<>();
  for (int i = 0; i < size; i++) map.put(i, i);

  long start = System.nanoTime();
  long sum = 0;
  for (int i = 0; i < size; i++) sum += map.get(i);
  long ms = (System.nanoTime() - start) / 1_000_000;
  System.out.println(size + ":" + ms + ":" + sum);
}`,
        output: `10:0:45
10000:0:49995000
1000000:8:1783293664

小数据被固定成本主导，大数据才暴露哈希和缓存影响。任何结论都要标明规模区间。`,
      }],
      ['用 JMH 控制预热与隔离', '基准要使用独立 JVM、足够预热、固定输入和 Blackhole 消费结果，避免 JIT 把循环消除。对比方案每次只改集合类型，数据生成器、线程数、JVM 参数和断言保持一致；任何异常都要让基准失败。', '基准也是被测代码', {
        title: 'Java + JMH：可重复 Map 查找基准',
        language: 'Java',
        code: `@State(Scope.Benchmark)
public class MapLookupBenchmark {
  @Param({"10000", "1000000"})
  int size;
  private Map<Integer, Integer> map;

  @Setup(Level.Trial)
  public void setup() {
    map = new HashMap<>(size);
    for (int i = 0; i < size; i++) map.put(i, i);
  }

  @Benchmark
  public long lookup(Blackhole blackhole) {
    long sum = 0;
    for (int i = 0; i < size; i++) sum += map.get(i);
    blackhole.consume(sum);
    return sum;
  }
}`,
        output: `mvn package
java -jar target/benchmarks.jar MapLookupBenchmark -wi 5 -i 8 -f 2

Blackhole 消费结果，JMH 负责预热、分叉和统计；不会把未使用循环优化掉。`,
      }],
      ['分位数比平均值更接近用户', '平均值会掩盖锁等待、GC 和长尾请求，至少输出 P50、P95、P99 与错误率。并发基准还要记录线程数、队列深度和超时；如果某个集合在平均值上更快但长尾更差，生产质量属性可能不允许采用。', '看分位数和错误率', {
        title: 'PowerShell：从原始延迟计算分位数',
        language: 'PowerShell',
        code: `$latency = Get-Content latency-ms.txt | ForEach-Object { [double]$_ } | Sort-Object
$p50 = $latency[[math]::Floor($latency.Count * 0.50)]
$p95 = $latency[[math]::Floor($latency.Count * 0.95)]
$p99 = $latency[[math]::Floor($latency.Count * 0.99)]
[pscustomobject]@{ p50=$p50; p95=$p95; p99=$p99; max=$latency[-1] }`,
        output: `p50 p95 p99 max
--- --- --- ---
2.1 18  84  312

平均值可能只有 4ms，但 p99 达 84ms。并发缓存是否能上线要看长尾和错误率，而不只看吞吐。`,
      }],
      ['报告必须带回退条件', '最终报告把候选、证据、成本、适用边界和重新评估触发条件写清楚，例如元素超过阈值、并发写入增加或命中率下降时重测。上线后监控容量、延迟和 GC，不把实验室结论当成永久事实；缺少回退条件不得上线。', '结论附条件和退出机制', {
        title: 'Markdown：集合选型结论模板',
        language: 'Markdown',
        code: `# 订单缓存集合选型

## 结论
采用 ConcurrentHashMap<String, OrderSnapshot>

## 证据
- 50万键，95% 读取
- p99 从 42ms 降到 9ms
- 刷新时替换不可变快照
- 错误率 0

## 成本
- 快照峰值内存增加 120MB
- 刷新窗口需要双版本

## 回退条件
- p99 连续10分钟 > 20ms
- 快照内存 > 1GB
- 热键冲突导致加载超时`,
        output: `报告包含结论、证据、成本和可执行回退条件。

上线后监控 p99、内存和加载异常；触发条件时重新评估，不把一次基准当永久结论。`,
      }],
    ],
  },
];

const J3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '线程生命周期与安全启动',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '能在 Java 中创建对象、捕获异常，并理解进程与线程的基本差别。',
    goal: '能根据 Thread.State 和线程转储解释线程状态，使用 start、join、中断与异常处理器完成可控启动和关闭。',
    guidedPractice: '创建三个线程分别进入 BLOCKED、WAITING 和 TIMED_WAITING，主线程用 jcmd Thread.print 导出转储并在栈中找到状态；再设置 UncaughtExceptionHandler 捕获工作线程异常。',
    independentPractice: '实现一个有明确启动屏障、最大运行时间和关闭信号的后台任务，验证正常完成、未捕获异常、外部中断和超时四条路径。',
    commonErrors: ['直接调用 run 方法却以为启动了新线程。', '把 interrupt 当成强制终止，忽略线程需要在阻塞点或轮询中自行响应。'],
    sourceRefs: [JAVA_CONCURRENCY, JLS_THREADS],
    steps: [
      ['状态是调度与等待原因的快照', 'Thread.State 包含 NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING 和 TERMINATED，RUNNABLE 还可能正在等操作系统或 IO。线程转储给出某一时刻的 Java 栈和锁信息，要多次采样结合代码路径判断，不能把一次状态打印当成完整生命周期。', '状态配合栈和多次采样', {
        title: 'Java：观察 NEW、TIMED_WAITING 与 TERMINATED',
        language: 'Java',
        code: `Thread worker = new Thread(() -> {
  try { Thread.sleep(300); } catch (InterruptedException error) {
    Thread.currentThread().interrupt();
  }
});
System.out.println(worker.getState());
worker.start();
Thread.sleep(100);
System.out.println(worker.getState());
worker.join();
System.out.println(worker.getState());`,
        output: `NEW
TIMED_WAITING
TERMINATED

状态只代表采样瞬间；生产中多次线程转储结合栈、锁和等待对象才能定位长期阻塞。`,
      }],
      ['start 创建执行，run 只是普通调用', '调用 start 后 JVM 安排线程执行目标 run 方法，同一 Thread 实例只能启动一次；直接调用 run 则在当前调用线程同步执行。创建后未启动的线程处于 NEW，进入 run 后才可能变为 RUNNABLE。', '启动新线程只能用 start', {
        title: 'Java：对比 start 与 run',
        language: 'Java',
        code: `Thread viaStart = new Thread(() ->
  System.out.println("start:" + Thread.currentThread().getName())
);
Thread viaRun = new Thread(() ->
  System.out.println("run:" + Thread.currentThread().getName())
);
viaStart.start();
viaRun.run();
System.out.println("main:" + Thread.currentThread().getName());
viaStart.join();`,
        output: `run:main
main:main
start:Thread-0

run 在 main 线程同步执行，start 才创建新线程。输出顺序受调度影响，但线程名明确区分。`,
      }],
      ['join 建立完成可见性', 'join 等待目标线程终止，返回后能看到目标线程在终止前的副作用，因为线程终止与 join 返回之间存在 happens-before。join 可带超时，但超时只表示等待结束，不代表目标线程已经完成；调用方必须检查 isAlive 并继续处理。', '超时返回不等于任务完成', {
        title: 'Java：带超时 join 检查 isAlive',
        language: 'Java',
        code: `Thread worker = new Thread(() -> {
  try { Thread.sleep(500); } catch (InterruptedException ignored) {}
});
worker.start();
worker.join(100);
System.out.println(worker.isAlive());
worker.join();
System.out.println(worker.getState());`,
        output: `true
TERMINATED

第一次 join 超时后线程仍在运行，不能当作完成。第二次无超时 join 后才确认终止。`,
      }],
      ['中断是协作取消信号', 'interrupt 设置中断标志；sleep、wait、join 等阻塞方法通常抛 InterruptedException 并清除标志。线程应在 catch 中恢复中断或向上传播中断状态，而不是吞掉异常继续运行；CPU 密集循环则要主动检查 Thread.currentThread().isInterrupted()。', '取消由目标线程协作完成', {
        title: 'Java：中断阻塞任务',
        language: 'Java',
        code: `AtomicBoolean stopped = new AtomicBoolean(false);
Thread worker = new Thread(() -> {
  try {
    Thread.sleep(10_000);
  } catch (InterruptedException error) {
    stopped.set(true);
    Thread.currentThread().interrupt();
  }
});
worker.start();
Thread.sleep(100);
worker.interrupt();
worker.join();
System.out.println(stopped.get());
System.out.println(worker.isInterrupted());`,
        output: `true
false

worker 在 sleep 中收到中断并退出；之后 join 清除终止线程的中断查询结果。生产代码应保留清晰的取消日志和状态。`,
      }],
      ['异常出口和关闭顺序要显式', '工作线程未捕获异常不会自动让主线程失败，应配置 UncaughtExceptionHandler，把错误写入结构化日志和监控。关闭时先停止接收新任务，再发出取消信号、等待有界时间，超时后记录仍在运行的线程栈，避免无界 shutdown。', '异常和关闭都要有证据', {
        title: 'Java：工作线程异常处理',
        language: 'Java',
        code: `Thread worker = new Thread(() -> {
  throw new IllegalStateException("worker-failed");
});
worker.setUncaughtExceptionHandler((thread, error) ->
  System.out.println(thread.getName() + ":" + error.getMessage())
);
worker.start();
worker.join();
System.out.println(worker.getState());`,
        output: `Thread-0:worker-failed
TERMINATED

异常通过显式 handler 进入日志/监控。若等待任务完成，外层还要检查线程是否异常结束和任务结果是否提交。`,
      }],
    ],
  },
  {
    name: 'synchronized 与监视器',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解线程状态、共享字段和数据竞争，能阅读 Java 字节码。',
    goal: '能解释对象监视器的互斥、可重入与可见性，正确选择锁对象，并用线程转储定位临界区阻塞。',
    guidedPractice: '编写两个线程同时扣减余额的方法，在 monitorenter/monitorexit 处观察锁；再故意在同步块中调用 sleep，使用 jcmd Thread.print -l 定位 BLOCKED 线程和持有者。',
    independentPractice: '修复一个因锁范围过宽导致吞吐下降、锁范围过窄导致余额丢失的账户服务，提交并发测试、线程转储和吞吐前后对照。',
    commonErrors: ['用字符串常量或可被外部替换的字段当锁，导致无关代码共享同一监视器。', '只同步写入而不同步读取，或同步不同锁对象，误以为关键字会自动保护所有代码。'],
    sourceRefs: [JLS_THREADS, OPENJDK_CONCURRENT],
    steps: [
      ['monitor 提供互斥与可见性', 'synchronized 方法或同步块进入时获取对象监视器，退出时释放；同一监视器在同一时刻只允许一个线程持有。释放锁之前的写操作对随后获得同一锁的线程可见，所以它同时解决互斥和部分内存可见性问题。', '同一锁对象才能建立同一保护域', {
        title: 'Java：同步保护共享余额',
        language: 'Java',
        code: `final class Account {
  private long balance = 1000;

  synchronized void withdraw(long amount) {
    if (amount > balance) throw new IllegalStateException("INSUFFICIENT");
    balance -= amount;
  }

  synchronized long balance() { return balance; }
}

Account account = new Account();
account.withdraw(200);
System.out.println(account.balance());`,
        output: `800

withdraw 与 balance 使用同一实例监视器，读写都受保护；失败检查与扣减位于同一临界区。`,
      }],
      ['可重入避免自锁', '持有监视器的线程可以再次进入同一监视器的同步代码，JVM 维护进入计数，最外层退出时才真正释放。可重入不代表可以随意递归加锁，跨多个锁对象时仍必须定义全局顺序，否则会形成环形等待。', '可重入不等于无死锁', {
        title: 'Java：同一线程重复进入监视器',
        language: 'Java',
        code: `final class ReentrantBox {
  synchronized void outer() {
    System.out.println("outer");
    inner();
  }

  synchronized void inner() {
    System.out.println("inner");
  }
}

new ReentrantBox().outer();`,
        output: `outer
inner

同一线程已持有 this 监视器，再调用 inner 会重入而不是死锁。退出 inner 后进入计数减一，outer 退出才真正释放。`,
      }],
      ['锁对象必须稳定且私有', '锁应保护明确的不变量，通常使用私有 final 对象；锁 String 字面量、类对象或可被替换的引用，会把无关调用者带入同一竞争域。读取共享状态也要进入相同监视器，否则可见性和原子性假设不一致。', '保护域覆盖所有访问路径', {
        title: 'Java：私有 final 锁对象',
        language: 'Java',
        code: `final class Counter {
  private final Object lock = new Object();
  private long value;

  void increment() {
    synchronized (lock) { value++; }
  }

  long value() {
    synchronized (lock) { return value; }
  }
}

Counter counter = new Counter();
counter.increment();
System.out.println(counter.value());`,
        output: `1

increment 和 value 使用同一个不可替换锁对象。外部无法获取 lock，也不会误锁同一字符串或类对象。`,
      }],
      ['临界区按不变量切分', '锁只包住必须原子完成的状态读取、校验和写入，远程调用、文件 IO 和用户回调应移到锁外；但把步骤拆得太碎又可能破坏业务不变量。正确边界由状态一致性决定，不能简单以“锁越小越快”作为规则。', '先保不变量，再缩短持锁时间', {
        title: 'Java：锁内校验与扣减，锁外通知',
        language: 'Java',
        code: `final class TransferService {
  private final Object lock = new Object();
  private long balance = 1000;

  boolean withdraw(long amount) {
    synchronized (lock) {
      if (amount > balance) return false;
      balance -= amount;
    }
    events.publish("withdrawn:" + amount);
    return true;
  }
}

System.out.println(service.withdraw(300));`,
        output: `true

余额检查与扣减在同一锁内完成；事件发布在锁外，避免网络或回调阻塞全部取款线程。`,
      }],
      ['用线程转储验证锁竞争', '高频采样 Thread.print -l 能看到 waiting to lock 的线程、锁标识和持有者栈。持续 BLOCKED 说明某个临界区过慢或锁范围过大；修复后重跑相同负载，比较等待时间、吞吐和锁竞争事件，并保留修复前后转储。', '锁问题要定位到源码行', {
        title: 'PowerShell：定位 BLOCKED 线程',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
jcmd $pid Thread.print -l > thread-before.txt
Select-String -Path thread-before.txt -Pattern "BLOCKED|waiting to lock|locked" -Context 2,5
jcmd $pid Thread.print -l > thread-after.txt
Compare-Object (Get-Content thread-before.txt) (Get-Content thread-after.txt)`,
        output: `"worker-2" #22 BLOCKED
  waiting to lock monitor 0x000001...
  at Account.withdraw(Account.java:18)

  - locked <0x000002...> (a Account)

转储直接指出等待锁的源码行和持有者；修复后比较等待线程数量与持锁栈。`,
      }],
    ],
  },
  {
    name: 'volatile、JMM 与 happens-before',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握 synchronized、线程启动和共享变量，了解指令重排概念。',
    goal: '能使用 JMM 的 happens-before 规则判断可见性，区分 volatile 与锁的职责，并修复安全发布和停止标志问题。',
    guidedPractice: '运行一个停止标志未加 volatile 的循环，用 JIT 编译与线程转储观察循环；改为 volatile 后记录退出时间，再用 final 字段构造不可变对象验证安全发布。',
    independentPractice: '找出一个双重检查锁和懒加载字段缺陷，改为 volatile 加类持有或同步方案，并写压力测试和代码审查说明。',
    commonErrors: ['认为 volatile 能保证 count++ 原子，忽略读改写由多条指令组成。', '在构造器结束前发布 this，其他线程可能看到未初始化字段。'],
    sourceRefs: [JLS_THREADS, JAVA_SPECS],
    steps: [
      ['happens-before 定义可见与顺序', '线程启动、线程终止并由 join 返回、监视器解锁到加锁、volatile 写读到后续读，以及传递关系都建立 happens-before。若没有这些边，编译器、CPU 和缓存都可能让两个线程看到不同的执行顺序，数据结果就不能仅凭代码先后推导。', '先找同步边，再讨论结果', {
        title: '文本：识别代码中的 happens-before 边',
        language: 'Text',
        code: `t1:
  data = 42;
  ready = true;   // volatile write

t2:
  if (ready) {    // volatile read
    print(data);
  }

happens-before:
  t1 写 ready <-synchronizes-with-> t2 读 ready
  data=42 先于 ready=true（程序顺序）
  t2 看到 data=42（传递可见性）`,
        output: `若 ready 不是 volatile，且没有锁或其他同步边，t2 可能看不到 true，即使短暂看到也可能看不到 data=42。

volatile 写读为这组字段建立了发布关系，但没有让任意多字段更新自动原子。`,
      }],
      ['volatile 提供可见性和顺序约束', 'volatile 写发布此前动作，volatile 读观察其后动作，并限制相关重排。它不会让复合读改写变成原子操作；计数、检查和设置等多个步骤仍需要锁或原子类。', 'volatile 管发布，不管复合更新', {
        title: 'Java：volatile++ 仍会丢失更新',
        language: 'Java',
        code: `class Counter {
  volatile int value;
  void increment() { value++; }
}

Counter counter = new Counter();
Thread first = new Thread(() -> {
  for (int i = 0; i < 10_000; i++) counter.increment();
});
Thread second = new Thread(() -> {
  for (int i = 0; i < 10_000; i++) counter.increment();
});
first.start(); second.start();
first.join(); second.join();
System.out.println(counter.value);`,
        output: `19987

Actual output 可能小于 20000，且不固定。value++ 是读、加、写三步，volatile 只保证每一步可见，不保证整体原子。`,
      }],
      ['安全发布需要最终引用可见', '对象构造完成后，通过 volatile 字段、锁、final 字段、线程启动或安全容器发布，才能让其他线程可靠看到初始化状态。把对象放进普通静态字段后又无同步地读取，可能读到 null 之外的半初始化字段。', '发布路径也要有 happens-before', {
        title: 'Java：volatile 安全发布配置',
        language: 'Java',
        code: `record Config(String endpoint, int timeoutMs) {}

final class ConfigHolder {
  private static volatile Config current;

  static void publish(Config config) {
    current = config;
  }

  static Config read() {
    Config value = current;
    if (value == null) throw new IllegalStateException("NOT_READY");
    return value;
  }
}`,
        output: `Config 的 final 字段先完成构造，再通过 volatile 写发布；reads 的 volatile 读建立 happens-before。

其他线程要么看到完整 Config，要么在未发布前明确 NOT_READY，不能看到半初始化对象。`,
      }],
      ['用可复现压力实验验证', '构造共享停止标志、懒初始化或发布字段的压力试验，记录每次读到 null、旧值和异常的次数，并比较加 volatile、锁与不可变方案。实验要设置超时和线程回收，避免一个错误实现把测试进程永久挂住。', '实验要能失败并自动退出', {
        title: 'Java：有超时的停止标志实验',
        language: 'Java',
        code: `final class Job implements Runnable {
  private volatile boolean running = true;
  public void run() {
    while (running) Thread.onSpinWait();
  }
  void stop() { running = false; }
}

Job job = new Job();
Thread worker = new Thread(job);
worker.start();
Thread.sleep(100);
job.stop();
worker.join(2_000);
System.out.println(worker.isAlive());`,
        output: `false

volatile running 让停止写入可见。join 设置上限，实验失败也不会永久挂住测试进程。`,
      }],
      ['选择最弱的足够同步原语', '只需要发布配置或停止信号时，volatile 或不可变快照比全局锁更清晰；需要多字段一致性和复合更新时，用锁或原子状态。代码评审要说明哪条 happens-before 边保护哪个字段，不能以“加了 volatile 应该没事”结束。', '每个共享字段都要有保护理由', {
        title: 'Markdown：共享字段评审卡',
        language: 'Markdown',
        code: `字段：running
写入者：控制线程 stop()
读取者：工作线程循环
保护：volatile 写读，建立停止信号 happens-before
不变量：停止后不再接收新任务

字段：balance
更新：多个转账线程 read+check+write
保护：synchronized 锁定 Account.this
原因：volatile 不足以保证复合更新`,
        output: `每个共享字段都明确写入者、读取者、保护边和不变量。

评审时先要求说明保护理由，再讨论性能；无法说明同步边的 volatile 字段不应合入。`,
      }],
    ],
  },
  {
    name: 'CAS、原子类与 ABA',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 volatile、JMM、引用比较和循环重试。',
    goal: '能解释 CAS 的比较并交换、内存序和 ABA 风险，区分 AtomicInteger 与 LongAdder，并选择需要版本号的场景。',
    guidedPractice: '用 compareAndSet 实现一个无锁最大值更新，记录失败重试次数；再用 AtomicStampedReference 构造 A-B-A 过程，观察只比较引用与比较版本的差异。',
    independentPractice: '为高并发计数与资源版本控制各实现一个方案，压测吞吐、重试率和正确性，并说明何时应回退到锁。',
    commonErrors: ['把 CAS 当成一次普通写入，忽略比较值与新值必须来自同一个观察点。', '认为 AtomicReference 的 set 或 get 组合是原子的，导致两个线程丢失彼此更新。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_CONCURRENT],
    steps: [
      ['CAS 在单个内存位置原子比较', 'compareAndSet 只在当前值仍等于期望值时写入新值，否则返回 false，调用方重新读取并计算。它保证单变量更新的原子性和内存可见性，但不自动提供跨多个字段的业务一致性。', '一次最多保护一个值', {
        title: 'Java：CAS 更新最大值',
        language: 'Java',
        code: `AtomicInteger max = new AtomicInteger(0);
int candidate = 42;
while (true) {
  int current = max.get();
  if (candidate <= current) break;
  if (max.compareAndSet(current, candidate)) break;
}
System.out.println(max.get());`,
        output: `42

只有 max 仍等于 current 时才写入 candidate；否则重读并重算。整个业务条件必须能在循环中重新验证。`,
      }],
      ['循环重试把失败变成竞争成本', '无锁更新通常写成 read-compute-CAS 循环，失败说明其他线程先改过值。低竞争时重试成本小，高竞争时缓存行争用和重复计算会放大 CPU 开销；记录成功前的尝试次数才能判断是否进入错误场景。', '统计 CAS 失败率', {
        title: 'Java：记录 CAS 尝试次数',
        language: 'Java',
        code: `AtomicLong attempts = new AtomicLong();
AtomicInteger value = new AtomicInteger();
for (int thread = 0; thread < 8; thread++) {
  new Thread(() -> {
    for (int i = 0; i < 10_000; i++) {
      int current;
      do {
        current = value.get();
        attempts.incrementAndGet();
      } while (!value.compareAndSet(current, current + 1));
    }
  }).start();
}
Thread.sleep(1_000);
System.out.println("value=" + value.get());
System.out.println("attempts=" + attempts.get());`,
        output: `value=80000
attempts=80321

尝试次数接近成功次数说明低冲突；远高于成功次数表示热点竞争严重，应改用 LongAdder 或锁分段。`,
      }],
      ['ABA 是版本缺失问题', '值从 A 变成 B 又回到 A 时，单纯引用比较会认为没有变化。AtomicStampedReference 同时记录版本戳，更新时比较值加版本；是否需要版本号由业务是否依赖中间状态决定，简单计数未必需要。', '只比较值会丢失历史', {
        title: 'Java：AtomicStampedReference 识别 ABA',
        language: 'Java',
        code: `AtomicStampedReference<String> ref = new AtomicStampedReference<>("A", 0);
int[] stamp = { ref.getStamp() };
String expected = ref.get(stamp);

ref.compareAndSet("A", "B", stamp[0], stamp[0] + 1);
ref.compareAndSet("B", "A", ref.getStamp(), ref.getStamp() + 1);

boolean valueOnly = ref.compareAndSet("A", "C", 0, 1);
System.out.println(valueOnly);
System.out.println(ref.getReference() + ":" + ref.getStamp());`,
        output: `false
A:2

值回到 A，但版本从 0 变为 2；只比较值的 CAS 仍会成功，带版本比较能发现中间变化。`,
      }],
      ['LongAdder 为高频计数分散热点', 'LongAdder 在竞争时把更新分散到多个 Cell，sum 汇总当前近似值，适合写多读少且允许弱一致的监控计数。AtomicLong 提供精确线性一致的当前值，读多写少或需要比较更新时更合适。', '按一致性与读写比例选型', {
        title: 'Java：LongAdder 与 AtomicLong 选型',
        language: 'Java',
        code: `LongAdder hits = new LongAdder();
AtomicLong sequence = new AtomicLong();

IntStream.range(0, 1_000_000).parallel().forEach(index -> {
  hits.increment();
});

long next = sequence.incrementAndGet();
System.out.println(hits.sum());
System.out.println(next);`,
        output: `1000000
1

高频写计数使用 LongAdder；需要返回精确下一个序列值或做 CAS 条件更新时使用 AtomicLong。`,
      }],
      ['失败路径要回退到锁', '如果一次更新涉及余额、状态、审计等多个字段，CAS 方案会越来越复杂，测试也很难枚举交错。此时应使用有界锁、数据库事务或状态机，并明确锁顺序；无锁不是质量目标，可证明的正确性才是。', '复杂度超过收益就加锁', {
        title: 'Java：复合状态回归锁保护',
        language: 'Java',
        code: `final class Inventory {
  private final Object lock = new Object();
  private int stock;
  private String status = "OPEN";

  boolean reserve(int quantity) {
    synchronized (lock) {
      if (!"OPEN".equals(status) || quantity <= 0 || quantity > stock) return false;
      stock -= quantity;
      if (stock == 0) status = "SOLD_OUT";
      return true;
    }
  }
}`,
        output: `库存检查、扣减和状态切换在同一锁内原子完成。

若强行用多个 Atomic 字段，线程可能看到库存与状态不一致；复合业务状态应回退到锁、事务或单一不可变快照。`,
      }],
    ],
  },
  {
    name: 'AQS、ReentrantLock 与 Condition',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 synchronized、volatile、CAS 和线程状态。',
    goal: '能沿 state 与等待节点解释 AQS 的获取、释放、条件等待和中断，正确实现有界缓冲区并选择公平锁。',
    guidedPractice: '阅读 AQS 的 acquire、release、tryAcquire 和 ConditionObject，用 ReentrantLock 与两个 Condition 实现有界队列；分别测试满队列等待、消费者唤醒和生产者中断。',
    independentPractice: '实现一个容量为 N 的生产者消费者缓冲区，覆盖公平与非公平、超时获取、关闭唤醒和异常退出，并用线程转储解释不存在永久等待的原因。',
    commonErrors: ['用 if 而不是 while 等待条件，线程被唤醒后条件已再次变化仍继续执行。', '抛出 InterruptedException 时吞掉中断并继续循环，导致关闭请求无法结束。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_CONCURRENT],
    steps: [
      ['AQS 用状态和队列管理同步', 'AbstractQueuedSynchronizer 把同步状态保存在 int state，子类通过 tryAcquire、tryRelease 等方法定义语义。获取失败的线程进入等待队列，当前持有者释放时唤醒后继；ReentrantLock 用 state 记录重入次数，Condition 另建等待队列。', 'state 定语义，队列管排队', {
        title: 'Java：ReentrantLock 的显式加解锁',
        language: 'Java',
        code: `Lock lock = new ReentrantLock();
int[] balance = { 1000 };

lock.lock();
try {
  balance[0] -= 200;
} finally {
  lock.unlock();
}
System.out.println(balance[0]);`,
        output: `800

lock/unlock 必须成对，finally 保证异常时释放。与 synchronized 不同，等待可中断、可超时、可公平选择。`,
      }],
      ['Condition 等待会释放锁', 'await 必须持有对应锁，调用后释放锁并把线程挂到条件队列，被 signal 后需要重新竞争锁才从 await 返回。因此等待条件必须放在 while 循环中重新检查，不能假定醒来时状态仍然满足。', '醒来后重新检查条件', {
        title: 'Java：Condition 用 while 检查队列空',
        language: 'Java',
        code: `ReentrantLock lock = new ReentrantLock();
Condition notEmpty = lock.newCondition();
Deque<String> queue = new ArrayDeque<>();

String take() throws InterruptedException {
  lock.lockInterruptibly();
  try {
    while (queue.isEmpty()) notEmpty.await();
    return queue.removeFirst();
  } finally {
    lock.unlock();
  }
}`,
        output: `await 前必须持有 lock。被唤醒后线程重新获得锁，并再次检查 queue 是否为空。

若写成 if，其他消费者可能先取走元素，当前线程醒来后会继续从空队列移除。`,
      }],
      ['中断和超时改变控制流', 'await、lockInterruptibly 和 tryLock 会把中断或超时作为可恢复状态返回或抛出异常。业务代码要恢复中断标志或明确结束任务，finally 中释放锁；只捕获异常不处理会让上层永远不知道取消已经发生。', '中断是任务协议的一部分', {
        title: 'Java：tryLock 超时避免无限等待',
        language: 'Java',
        code: `ReentrantLock lock = new ReentrantLock();
boolean acquired = false;
try {
  acquired = lock.tryLock(200, TimeUnit.MILLISECONDS);
  if (!acquired) {
    System.out.println("BUSY");
  } else {
    System.out.println("work");
  }
} catch (InterruptedException error) {
  Thread.currentThread().interrupt();
  System.out.println("CANCELLED");
} finally {
  if (acquired) lock.unlock();
}`,
        output: `BUSY

超时返回 false，调用方可降级、重试或拒绝。中断会恢复标志并结束当前任务，锁只在成功获取时释放。`,
      }],
      ['公平锁换取可预测的排队顺序', '公平锁按队列顺序授予线程，减少饥饿但可能降低吞吐；非公平锁允许插队，依赖调度和竞争强度。选择要靠延迟分位数、等待时长和吞吐实验，不能仅凭“公平更好”决定。', '公平性与吞吐量做取舍', {
        title: 'Java：公平与非公平锁基准',
        language: 'Java',
        code: `for (boolean fair : new boolean[] { false, true }) {
  ReentrantLock lock = new ReentrantLock(fair);
  AtomicLong maxWait = new AtomicLong();
  long start = System.nanoTime();
  for (int thread = 0; thread < 8; thread++) {
    new Thread(() -> {
      long begin = System.nanoTime();
      lock.lock();
      try {
        maxWait.accumulateAndGet(System.nanoTime() - begin, Math::max);
      } finally {
        lock.unlock();
      }
    }).start();
  }
  System.out.println(fair + ":" + maxWait.get());
}`,
        output: `false:180000
true:240000

示例显示公平锁可能增加等待和吞吐成本；生产结论要基于多次运行、分位数和线程数。`,
      }],
      ['用状态不变量检查死锁', '有界缓冲区必须始终满足 0 <= size <= capacity，生产与消费只在互斥区内改状态，条件等待覆盖满与空。关闭时设置 closed 标志并 signalAll，所有等待循环检查关闭条件；恢复后线程全部结束视为验收。', '不变量和关闭条件都要可验证', {
        title: 'Java：两个 Condition 实现有界缓冲区',
        language: 'Java',
        code: `final class Buffer {
  private final ReentrantLock lock = new ReentrantLock();
  private final Condition notFull = lock.newCondition();
  private final Condition notEmpty = lock.newCondition();
  private final Deque<String> values = new ArrayDeque<>();
  private final int capacity;
  Buffer(int capacity) { this.capacity = capacity; }

  void put(String value) throws InterruptedException {
    lock.lockInterruptibly();
    try {
      while (values.size() == capacity) notFull.await();
      values.addLast(value);
      notEmpty.signal();
    } finally { lock.unlock(); }
  }
}`,
        output: `put 在满时等待 notFull，成功插入后通知 notEmpty；取数实现镜像使用另一个条件。

两个 while 循环保证醒来后重新检查满/空，关闭时还需设置 closed 并 signalAll。`,
      }],
    ],
  },
  {
    name: '并发集合与阻塞队列',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Queue 接口、锁、Condition 与线程池基础。',
    goal: '能按容量、公平性、吞吐和关闭语义选择 BlockingQueue，正确实现背压、毒丸和中断退出。',
    guidedPractice: '用 ArrayBlockingQueue、LinkedBlockingQueue 和 SynchronousQueue 分别构建生产者消费者，注入慢消费者和消费者退出，记录 put/offer/take 的阻塞时间与队列长度。',
    independentPractice: '实现一个有界任务管线，支持生产者限流、消费者关闭、失败重试和积压指标，并证明关闭后没有任务被悄悄吞掉。',
    commonErrors: ['用无界 LinkedBlockingQueue 掩盖生产速度超过消费速度的问题。', '消费者退出后生产者继续永久 put，没有关闭信号和超时处理。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_CONCURRENT],
    steps: [
      ['队列契约定义满与空行为', 'offer 快速返回、put 在有界队列满时阻塞、take 在空时阻塞、poll 可带超时。生产者要根据上游是否能承受背压选择方法；返回 false 不是异常，但若调用方忽略，消息会静默丢失。', '先定义满时策略', {
        title: 'Java：ArrayBlockingQueue 满时快速失败',
        language: 'Java',
        code: `BlockingQueue<String> queue = new ArrayBlockingQueue<>(2);
System.out.println(queue.offer("A"));
System.out.println(queue.offer("B"));
System.out.println(queue.offer("C"));
System.out.println(queue.size());`,
        output: `true
true
false
2

offer 在满时立即返回 false，调用方必须记录拒绝或降级。若改用 put，生产者会阻塞直到消费者腾出空间。`,
      }],
      ['ArrayBlockingQueue 共享一把锁', 'ArrayBlockingQueue 用固定数组、重入锁和 notEmpty/notFull 条件实现，生产与消费通常共享同一锁。容量稳定、内存可预估，但高并发时锁竞争明显；公平锁会增加上下文切换。', '固定容量，竞争可见', {
        title: 'Java：固定容量队列的背压',
        language: 'Java',
        code: `BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(10);
Thread consumer = new Thread(() -> {
  try {
    while (true) {
      int value = queue.take();
      if (value < 0) break;
      Thread.sleep(5);
    }
  } catch (InterruptedException error) {
    Thread.currentThread().interrupt();
  }
});
consumer.start();
for (int i = 0; i < 20; i++) queue.put(i);
queue.put(-1);
consumer.join();`,
        output: `生产速度超过消费时，put 在队列满后阻塞，内存不会无限增长。

毒丸 -1 放在所有任务之后，消费者看到后退出；真实系统还要给 put 设置关闭和超时路径。`,
      }],
      ['LinkedBlockingQueue 节点与双锁', 'LinkedBlockingQueue 用节点链保存元素，通常用 takeLock 与 putLock 分离生产消费，并用原子计数维护 size。无界构造方便演示，生产上更应显式设置容量，避免积压和堆增长。', '默认无界不是安全默认', {
        title: 'Java：显式限制 LinkedBlockingQueue 容量',
        language: 'Java',
        code: `BlockingQueue<String> queue = new LinkedBlockingQueue<>(1000);
for (int i = 0; i < 1000; i++) queue.offer("task-" + i);
System.out.println(queue.size());
System.out.println(queue.offer("overflow"));`,
        output: `1000
false

显式 cap 让积压有上限。new LinkedBlockingQueue<>() 默认接近无界，生产队列会持续吃掉堆内存。`,
      }],
      ['SynchronousQueue 直接交接', 'SynchronousQueue 不保存元素，生产者必须与消费者直接配对，适合线程池中的任务转交和严格背压。线程池使用它时要理解没有排队缓冲，超过可用线程会直接触发拒绝或扩容；不能把拒绝误判为容量不足。', '没有缓冲就没有积压', {
        title: 'Java：SynchronousQueue 必须有人接收',
        language: 'Java',
        code: `SynchronousQueue<String> handoff = new SynchronousQueue<>();
Thread consumer = new Thread(() -> {
  try { System.out.println(handoff.take()); }
  catch (InterruptedException error) { Thread.currentThread().interrupt(); }
});
consumer.start();
System.out.println(handoff.offer("job-1", 200, TimeUnit.MILLISECONDS));
consumer.join();`,
        output: `true
job-1

offer 只有在消费者等待或及时到达时成功；无人接收会超时返回 false。队列本身不保存积压。`,
      }],
      ['关闭需要统一信号', '关闭时先把状态置为 stopping，再唤醒所有阻塞线程，生产者收到关闭后停止 put，消费者处理已接收任务或毒丸后退出。finally 中减少活跃计数并记录未完成任务，测试进程在超时前结束。', '唤醒、毒丸和超时要配套', {
        title: 'Java：毒丸和中断共同关闭队列',
        language: 'Java',
        code: `BlockingQueue<String> queue = new LinkedBlockingQueue<>(10);
AtomicBoolean running = new AtomicBoolean(true);
Thread worker = new Thread(() -> {
  while (running.get()) {
    try {
      String item = queue.poll(200, TimeUnit.MILLISECONDS);
      if ("STOP".equals(item)) break;
      if (item != null) process(item);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      break;
    }
  }
});
worker.start();
running.set(false);
queue.offer("STOP");
worker.join(1000);
System.out.println(worker.isAlive());`,
        output: `false

poll 超时保证线程定期检查 running，毒丸让队列中的终止信号有序到达，中断则处理外部强制关闭。`,
      }],
    ],
  },
  {
    name: 'ThreadPoolExecutor 状态机',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解阻塞队列、线程生命周期、拒绝策略和任务取消。',
    goal: '能沿 ctl、execute、addWorker、getTask 和 shutdown 解释线程池状态机，按任务类型配置容量并观察队列、拒绝与关闭。',
    guidedPractice: '给 ThreadPoolExecutor 配置 2 个核心线程、有界队列和 CallerRunsPolicy，提交不同耗时任务，记录 corePoolSize、queue、activeCount、completedTaskCount 和拒绝次数。',
    independentPractice: '为 CPU 密集、阻塞 IO 和定时任务分别设计线程池，写出容量计算、队列上限、拒绝行为、关闭步骤和监控指标，并用故障注入验证。',
    commonErrors: ['所有业务共用一个无界队列线程池，积压时只看到内存上涨却没有任何拒绝信号。', '调用 shutdownNow 后假定任务已经停止，没有处理被中断任务和未执行队列。'],
    sourceRefs: [JAVA_CONCURRENCY, OPENJDK_CONCURRENT],
    steps: [
      ['ctl 同时编码状态和线程数', 'ThreadPoolExecutor 用原子整数 ctl 的高位保存 RUNNING、SHUTDOWN、STOP、TIDYING、TERMINATED，低位保存 worker 数量。一次 CAS 同时保证状态与数量一致，很多关闭与扩容行为都从这个打包字段推导。', '状态和线程数是一个原子整体', {
        title: 'Java：读取线程池状态和线程数',
        language: 'Java',
        code: `ThreadPoolExecutor pool = new ThreadPoolExecutor(
  2, 4, 30, TimeUnit.SECONDS,
  new ArrayBlockingQueue<>(10)
);
System.out.println(pool.getPoolSize());
System.out.println(pool.isShutdown());
pool.shutdown();
System.out.println(pool.isShutdown());`,
        output: `0
false
true

公开方法把 ctl 解码成状态与数量。关闭后不再接受新任务，但已有任务可能仍在运行。`,
      }],
      ['execute 的分派顺序', '任务到达时，若 worker 少于 corePoolSize 先创建核心线程；核心线程已满则尝试进入队列；队列满后再创建到 maximumPoolSize；仍无法接收才调用拒绝策略。队列容量会改变扩容时机，必须与任务语义一起配置。', '线程、队列、拒绝依次判断', {
        title: 'Java：观察线程、队列与扩容顺序',
        language: 'Java',
        code: `ThreadPoolExecutor pool = new ThreadPoolExecutor(
  2, 4, 30, TimeUnit.SECONDS,
  new ArrayBlockingQueue<>(2)
);
for (int i = 1; i <= 6; i++) {
  int id = i;
  try {
    pool.execute(() -> {
      try { Thread.sleep(500); } catch (InterruptedException ignored) {}
    });
  } catch (RejectedExecutionException error) {
    System.out.println("rejected:" + id);
  }
}
System.out.println("pool=" + pool.getPoolSize() + ",queue=" + pool.getQueue().size());`,
        output: `rejected:5
rejected:6
pool=4,queue=2

前 2 个创建核心线程，接着 2 个进队列，再扩到 4 个线程；队列和最大线程都满后开始拒绝。`,
      }],
      ['worker 在阻塞中等待任务', 'Worker 启动后循环执行任务，getTask 从队列取任务并维持 keepAlive 逻辑；线程数超过核心后，空闲超时会逐步回收。任务抛出未捕获异常会结束工作线程，线程池再按状态补充 worker，因此异常必须被记录。', '异常不能让任务悄无声息消失', {
        title: 'Java：捕获任务异常并记录',
        language: 'Java',
        code: `ThreadPoolExecutor pool = new ThreadPoolExecutor(
  1, 1, 0, TimeUnit.MILLISECONDS,
  new ArrayBlockingQueue<>(2)
);
pool.execute(() -> {
  try {
    throw new IllegalStateException("task-failed");
  } catch (RuntimeException error) {
    log.error("task failed", error);
  }
});
pool.shutdown();
pool.awaitTermination(1, TimeUnit.SECONDS);
System.out.println(pool.isTerminated());`,
        output: `ERROR task failed
java.lang.IllegalStateException: task-failed
true

在任务边界记录异常，worker 不会因未捕获异常退出，关闭流程也能正常结束。`,
      }],
      ['关闭存在两种语义', 'shutdown 拒绝新任务，等待已提交任务完成；shutdownNow 尝试中断 worker 并返回未执行队列。已经运行的任务是否响应中断由任务自己决定，调用方要设置等待上限、保存未处理任务并记录无法停止的线程。', '先定义“关闭”是哪种', {
        title: 'Java：shutdown 与 shutdownNow',
        language: 'Java',
        code: `ThreadPoolExecutor pool = new ThreadPoolExecutor(
  1, 1, 0, TimeUnit.MILLISECONDS,
  new ArrayBlockingQueue<>(10)
);
for (int i = 0; i < 3; i++) {
  pool.execute(() -> {
    try { Thread.sleep(500); } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
    }
  });
}
List<Runnable> neverRun = pool.shutdownNow();
System.out.println(neverRun.size());
System.out.println(pool.awaitTermination(2, TimeUnit.SECONDS));`,
        output: `2
true

shutdownNow 返回尚未开始的任务，尝试中断正在运行任务。运行任务是否响应中断由自身代码决定。`,
      }],
      ['容量来自资源和延迟目标', 'CPU 密集任务接近核心数，阻塞 IO 任务要受下游连接池、数据库和内存约束，队列深度要限制等待时间和积压。监控活跃线程、队列深度、最长等待、拒绝量和任务耗时，按这些指标调整而不是盲目加线程。', '线程数不是容量的全部', {
        title: 'Java：采集线程池运行指标',
        language: 'Java',
        code: `ThreadPoolExecutor pool = ...;
System.out.println(pool.getActiveCount());
System.out.println(pool.getQueue().size());
System.out.println(pool.getCompletedTaskCount());
System.out.println(pool.getLargestPoolSize());
long remaining = pool.getQueue().remainingCapacity();
System.out.println(remaining);`,
        output: `8
120
4500
12
880

活跃线程、队列深度、完成量和峰值线程数共同说明容量。队列剩余 880 时还没有背压信号。`,
      }],
    ],
  },
  {
    name: 'CompletableFuture 与异步编排',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解线程池、异常传播、超时和函数式接口。',
    goal: '能区分 thenApply、thenCompose、thenCombine 和 handle 的依赖关系，限定异步线程池并实现可取消、可观测的聚合调用。',
    guidedPractice: '并发调用三个模拟服务，分别使用 thenApply、thenCompose 和 handle，打印每段回调的执行线程；再用 orTimeout 和 exceptionally 验证超时与降级。',
    independentPractice: '实现一个商品详情聚合器，为每个下游设置超时和并发上限，记录成功、失败、取消与整体预算，并写出无后台泄漏测试。',
    commonErrors: ['在 thenApply 中做阻塞 IO，回调可能运行在完成任务的公共线程上，导致整个链路卡住。', '只用 get 等待，忽略异常包装、取消状态和外部超时。'],
    sourceRefs: [JAVA_CONCURRENCY, JAVA_SPECS],
    steps: [
      ['CompletionStage 表达依赖图', 'thenApply 转换同一阶段的结果，thenCompose 展开另一个异步阶段，thenCombine 合并两个独立结果。回调默认可能在完成任务完成的线程上执行，也可能被优化为同步执行，因此不能假定固定线程名。', '组合关系决定等待，不决定线程', {
        title: 'Java：thenApply、thenCompose、thenCombine',
        language: 'Java',
        code: `CompletableFuture<Integer> total = CompletableFuture.completedFuture(4200);
CompletableFuture<String> label = total.thenApply(value -> "total=" + value);

CompletableFuture<String> order = CompletableFuture.completedFuture("O-1");
CompletableFuture<String> detail = order.thenCompose(id ->
  CompletableFuture.completedFuture("detail:" + id)
);

CompletableFuture<String> combined = label.thenCombine(detail, (a, b) -> a + "|" + b);
System.out.println(combined.join());`,
        output: `total=4200|detail:O-1

thenApply 转换值，thenCompose 展开另一层 Future，thenCombine 等待两条独立链后合并。`,
      }],
      ['异步线程池必须显式限定', 'supplyAsync 不传 executor 时通常使用公共 ForkJoinPool，阻塞任务会污染共享调度。为下游调用提供有界专用执行器，使用 thenApplyAsync 指定线程池，并把线程池关闭纳入应用生命周期。', '阻塞调用要隔离线程池', {
        title: 'Java：显式线程池运行异步回调',
        language: 'Java',
        code: `ExecutorService executor = Executors.newFixedThreadPool(2);
CompletableFuture<String> future = CompletableFuture
  .supplyAsync(() -> "orders", executor)
  .thenApplyAsync(value -> value + ":" + Thread.currentThread().getName(), executor);
System.out.println(future.join());
executor.shutdown();`,
        output: `orders:pool-1-thread-1

阻塞与 CPU 任务显式进入专用线程池；线程名证明不是公共 ForkJoinPool。执行器关闭属于应用生命周期。`,
      }],
      ['异常沿阶段传播并可转换', '上游异常会跳过普通转换，进入 exceptionally、handle 或 whenComplete；handle 可以把异常转换为值，whenComplete 更适合记录结果但仍传播原异常。包装后的 CompletionException 需要沿 cause 链读取根因。', '先写失败类型，再写降级', {
        title: 'Java：handle 转换失败为降级值',
        language: 'Java',
        code: `CompletableFuture<Integer> future = CompletableFuture
  .supplyAsync(() -> { throw new IllegalStateException("catalog-down"); })
  .thenApply(value -> value / 2)
  .handle((value, error) -> error == null ? value : -1);
System.out.println(future.join());`,
        output: `-1

异常跳过 thenApply，在 handle 中被转换为降级值。若调用 join，未处理异常会包装为 CompletionException，需要读取 cause。`,
      }],
      ['取消与超时具有不同语义', 'cancel 只标记当前阶段，底层任务不一定停止；orTimeout 和 completeOnTimeout 会改变阶段结果，但无法强制终止已经运行的任务。真正取消要持有上游句柄或让任务检查中断，并清理连接和临时状态。', '超时返回不等于资源释放', {
        title: 'Java：orTimeout 与 join 异常',
        language: 'Java',
        code: `CompletableFuture<String> slow = CompletableFuture
  .supplyAsync(() -> {
    try { Thread.sleep(2000); } catch (InterruptedException ignored) {}
    return "late";
  })
  .orTimeout(100, TimeUnit.MILLISECONDS);

try {
  System.out.println(slow.join());
} catch (CompletionException error) {
  System.out.println(error.getCause().getClass().getSimpleName());
}`,
        output: `TimeoutException

Future 已以 TimeoutException 完成，但后台任务仍可能继续运行。需要取消句柄和资源清理才能停止真实工作。`,
      }],
      ['聚合器要有整体预算', '为每个阶段设置单独超时和总预算，限制同时发起的下游请求数，记录每个依赖的耗时、结果和取消原因。部分失败是否可降级由业务决定；验收时关闭线程池并检查活跃线程、连接和未完成阶段。', '每个下游都留下结果证据', {
        title: 'Java：两个下游依赖的预算聚合',
        language: 'Java',
        code: `record DependencyResult(String name, long ms, String status) {}

CompletableFuture<DependencyResult> price = CompletableFuture
  .supplyAsync(() -> loadPrice(orderId), executor)
  .orTimeout(300, TimeUnit.MILLISECONDS)
  .handle((value, error) -> new DependencyResult(
    "price", 300, error == null ? "ok" : "fallback"
  ));

CompletableFuture<DependencyResult> stock = CompletableFuture
  .supplyAsync(() -> loadStock(orderId), executor)
  .orTimeout(500, TimeUnit.MILLISECONDS)
  .handle((value, error) -> new DependencyResult(
    "stock", 500, error == null ? "ok" : "fallback"
  ));

System.out.println(price.thenCombine(stock, List::of).join());`,
        output: `[DependencyResult[name=price, ms=300, status=ok], DependencyResult[name=stock, ms=500, status=ok]]

每个依赖有单独预算和结果证据。整体超时/取消仍需由上层统一处理，不能只依赖两个孤立 orTimeout。`,
      }],
    ],
  },
  {
    name: 'Virtual Threads 与结构化并发',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成线程池、JMM、阻塞 IO 和异常处理课程。',
    goal: '能解释虚拟线程的调度与载体线程、迁移线程每请求模型，识别固定载体、ThreadLocal 和下游连接池边界。',
    guidedPractice: '在 JDK 21 中用 Executors.newVirtualThreadPerTaskExecutor 启动大量阻塞任务，用 JFR 记录 jdk.VirtualThreadPinned 和线程事件；再在 synchronized 块内阻塞，比较载体线程占用。',
    independentPractice: '把一个平台线程池处理 HTTP 请求的服务迁移为虚拟线程，保留数据库连接上限和超时，压测后提交线程数、P95、连接池等待和 JFR 报告。',
    commonErrors: ['把虚拟线程放进固定大小的池，限制了本应高并发的阻塞任务数量。', '认为虚拟线程能绕过数据库连接池、CPU、文件句柄和下游服务的真实容量。'],
    sourceRefs: ['JEP 444: Virtual Threads. https://openjdk.org/jeps/444', 'JEP 453: Structured Concurrency Preview. https://openjdk.org/jeps/453'],
    steps: [
      ['虚拟线程由 JVM 调度到载体线程', '虚拟线程是 Thread 的一种实现，阻塞时可从载体 ForkJoinPool 卸载，恢复后再挂载到可用载体。创建成本较低使线程每请求模型可行，但同一时刻仍只有有限载体执行 CPU 工作。', '多的是任务，不是 CPU', {
        title: 'Java 21：每任务一个虚拟线程',
        language: 'Java',
        code: `try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  List<Future<String>> futures = new ArrayList<>();
  for (int i = 0; i < 10_000; i++) {
    int id = i;
    futures.add(executor.submit(() -> {
      Thread.sleep(100);
      return "task-" + id;
    }));
  }
  System.out.println(futures.get(0).get());
}`,
        output: `task-0

执行器可以启动大量阻塞任务，但真正执行 CPU 指令的载体线程仍然有限。`,
      }],
      ['阻塞兼容性决定迁移收益', '基于 JDK 的阻塞 IO 通常会让虚拟线程卸载，部分本地库、synchronized 内长阻塞或其他受限场景可能固定载体线程。用 JFR 和线程转储确认实际挂载，不在每个模型调用外包一层线程池。', '先测卸载，再谈扩容', {
        title: 'PowerShell：用 JFR 检查虚拟线程固定',
        language: 'PowerShell',
        code: `java -XX:+UnlockDiagnosticVMOptions \
  -XX:+FlightRecorder \
  -XX:StartFlightRecording=filename=vt.jfr,settings=profile,duration=20s \
  -cp app.jar com.example.VirtualThreadDemo
jfr print --events jdk.VirtualThreadPinned vt.jfr
jfr print --events jdk.VirtualThreadStart,jdk.VirtualThreadEnd vt.jfr`,
        output: `jdk.VirtualThreadPinned {
  startTime = 12:00:01.123
  duration = 850 ms
  eventThread = "virtual-42"
  stackTrace = [ ... synchronized ... ]
}

长时间 pinned 会占住载体线程。迁移前要在真实负载下确认该事件，不要只看虚拟线程创建数量。`,
      }],
      ['线程局部变量仍然存在', '虚拟线程支持 ThreadLocal，但每个虚拟线程都可能持有自己的副本，大量请求会让内存放大。请求上下文应尽量显式传递或使用范围受限的 Context，缓存和连接也不能依赖每个虚拟线程各自创建。', '线程数增加会放大副本', {
        title: 'Java：避免每虚拟线程大对象缓存',
        language: 'Java',
        code: `ThreadLocal<byte[]> buffer = ThreadLocal.withInitial(() -> new byte[1024 * 1024]);

try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  for (int i = 0; i < 10_000; i++) {
    executor.submit(() -> {
      buffer.get()[0] = 1;
    });
  }
}`,
        output: `最多可能创建 10000 个 1MB ThreadLocal 缓冲区，导致约 10GB 潜在内存占用。

共享池应受容量控制，请求上下文应显式传递或使用作用域对象，而不是每线程复制大对象。`,
      }],
      ['结构化并发管理任务树', '结构化并发把一组相关子任务绑定到同一作用域，父任务等待、取消和错误传播形成清晰边界。使用预览 API 时要固定 JDK 版本并启用预览参数；生产依赖要核对正式状态，不能把预览特性混入无回退方案。', '作用域结束时任务必须收口', {
        title: 'Java：虚拟线程任务树',
        language: 'Java',
        code: `try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  Future<String> price = executor.submit(() -> loadPrice("O-1"));
  Future<String> stock = executor.submit(() -> loadStock("O-1"));
  try {
    String result = price.get() + "|" + stock.get();
    System.out.println(result);
  } catch (ExecutionException error) {
    price.cancel(true);
    stock.cancel(true);
    throw error;
  }
}`,
        output: `price=4200|stock=3

作用域负责关闭执行器；任一任务失败时主动取消兄弟任务。若使用结构化并发预览 API，要固定 JDK 版本并提供回退实现。`,
      }],
      ['下游容量仍是硬上限', '虚拟线程提高等待并发，但数据库连接池、Redis 连接数、文件句柄和服务配额没有自动增加。为每个资源设置并发闸门和超时，在压测中观察连接等待、载体 CPU 与 JFR 固定事件，再决定请求容量。', '连接池才是很多系统的瓶颈', {
        title: 'Java：Semaphore 限制数据库并发',
        language: 'Java',
        code: `Semaphore dbPermits = new Semaphore(20);

String query() throws InterruptedException {
  dbPermits.acquire();
  try {
    return database.query("select ...");
  } finally {
    dbPermits.release();
  }
}

try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  for (int i = 0; i < 1000; i++) executor.submit(() -> query());
}`,
        output: `1000 个虚拟任务可以等待，但同一时刻最多 20 个进入数据库。

连接池、SQL 超时和 Semaphore 许可共同保护下游；虚拟线程不会扩大数据库容量。`,
      }],
    ],
  },
  {
    name: '竞态、死锁与并发诊断',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 JMM、锁、线程池与虚拟线程课程，能使用 jcmd。',
    goal: '能从线程转储、JFR 和并发测试区分数据竞争、死锁、活锁、饥饿和线程泄漏，并建立可重复的修复验证。',
    guidedPractice: '构造两个线程以相反顺序获取两把锁，使用 jcmd Thread.print 观察 Found one Java-level deadlock；再用 ThreadMXBean.findDeadlockedThreads 编写测试，把锁顺序固定后对照结果。',
    independentPractice: '排查一个线程不退出、连接池耗尽和偶发余额错误组成的综合故障，提交时间线、根因、修复、回归和运行手册。',
    commonErrors: ['看到 BLOCKED 就认定死锁，忽略活锁、线程饥饿和持有者执行过慢。', '偶发失败无法复现时直接增加 sleep 或重试，掩盖数据竞争和资源泄漏。'],
    sourceRefs: [JDK_TOOLS, JAVA_CONCURRENCY],
    steps: [
      ['先区分等待、循环和空转', '死锁是循环等待且无法前进，活锁是线程不断改变状态却无进展，饥饿是高优先级或锁分配长期挤压某类线程。线程转储能显示锁和等待图，JFR 能补充阻塞、CPU 与线程事件，两类证据要同时看。', '先给停滞分类，再找代码', {
        title: 'Java：构造双锁死锁',
        language: 'Java',
        code: `Object left = new Object();
Object right = new Object();

Thread first = new Thread(() -> {
  synchronized (left) {
    sleep(100);
    synchronized (right) { System.out.println("first"); }
  }
});
Thread second = new Thread(() -> {
  synchronized (right) {
    sleep(100);
    synchronized (left) { System.out.println("second"); }
  }
});
first.start(); second.start();`,
        output: `两个线程分别持有 left/right，再等待对方持有的锁，进程不退出。

jcmd Thread.print 会显示 Found one Java-level deadlock 和双方栈。`,
      }],
      ['固定锁顺序消除环', '多个资源需要加锁时，为锁定义全局排序，所有路径按同一顺序获取；跨模块调用不应在持锁状态下回调未知代码。修复后仍需并发压力测试，因为只在部分交错下出现的环，单次通过不能证明安全；异常路径也必须反向按序释放。', '全局顺序比局部 tryLock 更清晰', {
        title: 'Java：按对象身份固定锁顺序',
        language: 'Java',
        code: `void transfer(Account from, Account to, long amount) {
  Account first = from.id().compareTo(to.id()) < 0 ? from : to;
  Account second = first == from ? to : from;
  synchronized (first) {
    synchronized (second) {
      from.withdraw(amount);
      to.deposit(amount);
    }
  }
}`,
        output: `所有转账都先锁 id 较小的账户，再锁较大的账户，环形等待条件被消除。

锁顺序必须成为团队约定；仍要保持临界区短，并把外部调用移出锁。`,
      }],
      ['线程泄漏看生命周期', '线程池、定时器和监听器若没有关闭，会让类和上下文持续存活。连续多次请求后采样线程名、数量、栈和 GC 根，比较是否单调增长；修复后关闭服务并等待终止，确认线程数回到基线；线程数持续上升即为失败。', '线程数量也是泄漏指标', {
        title: 'PowerShell：比较请求前后线程数量',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
jcmd $pid Thread.print > before.txt
for ($i = 0; $i -lt 20; $i++) { Invoke-WebRequest http://127.0.0.1:8080/api/order | Out-Null }
Start-Sleep -Seconds 2
jcmd $pid Thread.print > after.txt
(Select-String -Path before.txt -Pattern '^"').Count
(Select-String -Path after.txt -Pattern '^"').Count`,
        output: `42
82

20 次请求后线程数持续增长，需查看新增线程名和栈。若应复用线程池，说明每个请求创建了执行器或后台线程未关闭。`,
      }],
      ['数据竞争要用断言暴露', '并发测试应提供确定性屏障、随机延迟和结果不变量，例如总账守恒、余额不为负、每个任务只完成一次。单纯比较某次日志顺序很难证明正确，测试失败时保存种子和调度记录以便复现；不能只靠一次通过判定。', '让错误以不变量违约暴露', {
        title: 'Java + JUnit：并发转账总账守恒',
        language: 'Java',
        code: `@Test
void totalBalanceIsConserved() throws Exception {
  Account a = new Account("A", 1000);
  Account b = new Account("B", 1000);
  ExecutorService pool = Executors.newFixedThreadPool(8);
  CyclicBarrier start = new CyclicBarrier(8);

  for (int i = 0; i < 8; i++) {
    pool.submit(() -> {
      start.await();
      for (int n = 0; n < 1000; n++) transfer(a, b, 1);
      return null;
    });
  }
  pool.shutdown();
  assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
  assertEquals(2000, a.balance() + b.balance());
}`,
        output: `✔ totalBalanceIsConserved()

8 个线程同时启动，反复转账后总余额仍为 2000。任何丢失更新都会破坏不变量。`,
      }],
      ['诊断报告写到处置动作', '报告包含故障现象、采样时间、线程 ID、锁持有者、JFR 窗口、代码提交和修复命令。上线后观察线程数、锁等待、任务完成率和错误率，达到稳定窗口后才能关闭事故；未验证恢复不得关闭问题。', '修复和回归都要有证据', {
        title: 'Markdown：并发故障报告模板',
        language: 'Markdown',
        code: `# 并发故障报告

## 现象
订单接口 P99 从 80ms 升至 8s，线程数持续增长

## 证据
- thread-before.txt：42 线程
- thread-after.txt：82 线程
- JFR：对象池等待占 70%
- 最近提交：abc123 每次请求创建线程池

## 修复
- 改为共享有界线程池
- 增加 2s 获取连接超时
- 关闭时 awaitTermination(10s)

## 回归
- 20 次请求后线程数 42
- P99 95ms
- 总账守恒测试通过`,
        output: `报告把现象、采样、根因、修复和回归证据写在一起。

上线观察线程数、队列深度、锁等待和 P99 达到稳定窗口后才关闭事故。`,
      }],
    ],
  },
];

const J4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'class 文件与字节码',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '能编译运行 Java 程序，知道基本类型、引用、方法调用和栈帧概念。',
    goal: '能读取 class 文件的魔数、版本、常量池与方法结构，用 javap 对照源码解释栈帧局部变量和操作数栈。',
    guidedPractice: '编写一个包含字段、构造器、循环和方法调用的类，执行 javap -c -v -p 查看常量池和 Code 属性，逐条标注 aload、iload、invokevirtual 与 return。',
    independentPractice: '手写一个泛型集合方法和一个字符串拼接方法，分别用字节码解释类型擦除、自动装箱和调用指令，并提交带偏移量的注释版反汇编。',
    commonErrors: ['把 class 文件当成源码文本，认为修改注释或变量名一定会改变运行行为。', '只记住指令名称，不说明局部变量槽、对象引用和操作数栈之间的数据流。'],
    sourceRefs: ['JVM Specification, Class File Format. https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html', JAVA_SPECS],
    steps: [
      ['文件结构由规范固定', 'class 以 0xCAFEBABE 开始，随后是次版本、主版本、常量池、访问标志、字段表、方法表和属性。主版本决定 JVM 能接受的最低运行版本，编译器生成的常量池与调试信息也能解释部分启动和链接错误。', '先读版本和常量池', {
        title: 'PowerShell：读取 class 版本和常量池',
        language: 'PowerShell',
        code: `@'
public class Demo {
  private static final String NAME = "orders";
  public static void main(String[] args) {
    System.out.println(NAME);
  }
}
'@ | Set-Content Demo.java
javac Demo.java
javap -v -p Demo | Select-String "major version|minor version|Constant pool|NAME|orders"`,
        output: `minor version: 0
major version: 65
Constant pool:
  #1 = Methodref ...
  #7 = String #8 // orders
  #8 = Utf8 orders
  private static final java.lang.String NAME;

主版本 65 对应 Java 21；字符串在常量池中按索引引用。`,
      }],
      ['方法体存放在 Code 属性里', '每个非抽象方法都有 max_stack、max_locals 和 code[]，字节码按操作码与操作数排列。JVM 执行方法时创建栈帧，局部变量数组保存参数与临时变量，操作数栈完成装载、计算、调用和返回。', '字节码是栈式指令序列', {
        title: 'PowerShell：对照 Java 加法与字节码',
        language: 'PowerShell',
        code: `@'
public class Add {
  static int sum(int left, int right) {
    return left + right;
  }
}
'@ | Set-Content Add.java
javac Add.java
javap -c -p Add`,
        output: `static int sum(int, int);
  Code:
     0: iload_0
     1: iload_1
     2: iadd
     3: ireturn

局部变量 0、1 装载到操作数栈，iadd 消耗两个 int 压入结果，ireturn 返回。`,
      }],
      ['javap 把结构变成可核对证据', 'javap -c 显示反汇编，-v 显示常量池和属性，-p 显示私有成员。对照源码时记录指令偏移和常量池索引，才能解释字符串驻留、泛型擦除、异常表以及编译器插入的桥方法；偏移量与参数必须一起保存。', '偏移量让证据可定位', {
        title: 'PowerShell：保存带偏移量的反汇编',
        language: 'PowerShell',
        code: `javap -c -v -p Add > add.bytecode.txt
Select-String -Path add.bytecode.txt -Pattern "^ *[0-9]+:"
Get-FileHash add.bytecode.txt -Algorithm SHA256`,
        output: `0: iload_0
1: iload_1
2: iadd
3: ireturn
SHA256 3C7F...A901

反汇编与 JDK 版本绑定。报告记录 javac 版本、源文件和输出哈希，升级后可重新对照。`,
      }],
      ['类型擦除发生在字节码层', '泛型参数在绝大多数运行时调用中擦除为上界类型，调用方可能插入强制转换；可变参数、装箱和自动关闭由编译器生成辅助代码。阅读字节码能确认语法糖没有被误认为 JVM 内建能力；桥方法和强制转换要记录。', '语法糖由编译器展开', {
        title: 'PowerShell：观察泛型擦除和强制转换',
        language: 'PowerShell',
        code: `@'
import java.util.*;
public class Erasure {
  static String first(List<String> values) {
    return values.get(0);
  }
}
'@ | Set-Content Erasure.java
javac Erasure.java
javap -c -p Erasure`,
        output: `4: invokeinterface java/util/List.get:(I)Ljava/lang/Object;
9: checkcast #7 // class java/lang/String
12: areturn

方法签名擦除为 List，get 返回 Object；编译器在返回值处插入 checkcast String。`,
      }],
      ['用错误版本验证边界', '用目标 JDK 编译后，用更低版本 java 启动应看到 UnsupportedClassVersionError，检查主版本即可定位。把同一份反汇编保存到版本化报告，升级 JDK 后重新生成，避免用旧字节码结论解释新编译器输出。', '版本不兼容要读主版本', {
        title: 'PowerShell：低版本 JVM 启动高版本 class',
        language: 'PowerShell',
        code: `javac --release 21 Demo.java
javap -v Demo | Select-String "major version"
java -version
java Demo
"exit=$LASTEXITCODE"
Get-Command java | Select-Object Source`,
        output: `openjdk version "17.0.10"
UnsupportedClassVersionError: Demo has been compiled by a more recent version
class file version 65.0, this version recognizes up to 61.0
exit=1

错误直接给出 class 主版本和当前 JVM 支持范围；应升级运行时或用 --release 17 重新编译。`,
      }],
    ],
  },
  {
    name: '类加载与双亲委派',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 class 文件课程，理解包名、类路径和静态初始化。',
    goal: '能解释加载、链接、初始化和类加载器身份，使用双亲委派与自定义 ClassLoader 隔离插件，并区分加载失败的不同异常。',
    guidedPractice: '写一个打印加载器名称的类，分别通过应用类路径和 URLClassLoader 加载同名类，比较 Class 对象是否相等；再制造 NoClassDefFoundError 与 ClassNotFoundException。',
    independentPractice: '实现一个只允许加载指定目录 class 的插件加载器，记录父加载器、来源 URL、加载顺序和关闭资源，并验证两个版本插件互不污染。',
    commonErrors: ['只看全限定类名就认为两个 Class 相同，忽略定义类加载器也是身份的一部分。', '用 Class.forName 的默认行为触发静态初始化，再把初始化异常误判为类文件缺失。'],
    sourceRefs: ['JVM Specification, Loading, Linking, Initialization. https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html', OPENJDK],
    steps: [
      ['加载找到二进制表示', '类加载器按名称定位 class 字节，解析成运行时 Class 对象。名称相同但由不同加载器定义的类不是同一个类型，互相赋值会抛 ClassCastException；插件隔离和热部署都必须围绕定义类加载器设计。', '类身份等于加载器加名称', {
        title: 'Java：打印类与定义加载器',
        language: 'Java',
        code: `Class<?> type = Class.forName("demo.Plugin");
System.out.println(type.getName());
System.out.println(type.getClassLoader().getName());
System.out.println(type.getModule().getName());`,
        output: `demo.Plugin
app
unnamed module

类型身份是“定义类加载器 + 全限定名”。插件与宿主同名类若由不同加载器定义，不能互相赋值。`,
      }],
      ['链接包含验证、准备与解析', '验证检查字节码和结构安全，准备为静态字段分配默认值，解析把符号引用转成直接引用。链接失败和初始化失败发生在不同阶段，堆栈中可能分别出现 VerifyError、NoClassDefFoundError 或 ExceptionInInitializerError。', '把链接和初始化分开看', {
        title: 'Java：静态初始化失败后的异常链',
        language: 'Java',
        code: `class Broken {
  static { if (true) throw new IllegalStateException("init-failed"); }
}

for (int attempt = 1; attempt <= 2; attempt++) {
  try {
    new Broken();
  } catch (Throwable error) {
    System.out.println(attempt + ":" + error.getClass().getSimpleName());
  }
}`,
        output: `1:ExceptionInInitializerError
2:NoClassDefFoundError

第一次访问触发静态初始化并保留根因；类随后处于错误状态，再次访问得到 NoClassDefFoundError。`,
      }],
      ['双亲委派先请求父加载器', 'ClassLoader.loadClass 默认先委派父加载器查找，父找不到再由当前加载器尝试。它保护核心类不被同名应用类轻易替换，但自定义 Web 容器或插件可以在受控条件下改变顺序，必须同时设计包白名单。', '委派顺序就是安全边界', {
        title: 'Java：URLClassLoader 加载插件',
        language: 'Java',
        code: `try (URLClassLoader loader = new URLClassLoader(
  new URL[] { Path.of("plugins/demo.jar").toUri().toURL() },
  ClassLoader.getPlatformClassLoader()
)) {
  Class<?> plugin = loader.loadClass("demo.Plugin");
  Object instance = plugin.getDeclaredConstructor().newInstance();
  System.out.println(instance.getClass().getClassLoader() == loader);
}`,
        output: `true

插件类由单独的 URLClassLoader 定义，父加载器只提供平台类。两个插件版本可用不同加载器隔离。`,
      }],
      ['Class.forName 与 loadClass 行为不同', 'Class.forName(name, true, loader) 默认执行初始化，ClassLoader.loadClass 通常只加载不初始化；静态块中抛异常会包装为 ExceptionInInitializerError，后续再次访问可能得到 NoClassDefFoundError。复现时要记录首次失败原因。', '初始化时机影响错误类型', {
        title: 'Java：forName 初始化与 loadClass 不初始化',
        language: 'Java',
        code: `ClassLoader loader = InitProbe.class.getClassLoader();
Class<?> loaded = loader.loadClass("InitProbe");
System.out.println("after-load");

Class<?> initialized = Class.forName("InitProbe", true, loader);
System.out.println("after-init");`,
        output: `after-load
static-init
after-init

loadClass 只完成加载阶段，forName(..., true, ...) 会触发初始化并执行静态块。`,
      }],
      ['插件关闭要释放引用', 'URLClassLoader 持有 URL 和已定义类，线程上下文加载器、缓存和 ThreadLocal 也可能延长生命周期。关闭插件时移除注册、停止线程并关闭 ClassLoader，抓堆转储确认旧类和加载器可回收。', '加载器也要有生命周期', {
        title: 'Java：关闭插件并移除上下文引用',
        language: 'Java',
        code: `URLClassLoader loader = new URLClassLoader(urls, parent);
try {
  Class<?> plugin = loader.loadClass("demo.Plugin");
  start(plugin);
} finally {
  registry.remove("demo");
  Thread.currentThread().setContextClassLoader(parent);
  loader.close();
}`,
        output: `插件注册和线程上下文引用被移除，URLClassLoader.close 释放打开的 jar。

若仍有 ThreadLocal、定时器或缓存持有插件类，旧加载器无法回收；需要堆转储确认。`,
      }],
    ],
  },
  {
    name: 'JVM 运行时数据区',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解线程、栈帧、对象和类加载，能运行 jcmd 与基础诊断命令。',
    goal: '能区分堆、元空间、线程栈、程序计数器、本地方法栈和直接内存，按 OutOfMemoryError 类型定位资源区域。',
    guidedPractice: '分别用大数组、无限创建类加载器、深递归和 NIO 直接缓冲制造压力，记录错误消息和 jcmd VM.info、GC.heap_info、Thread.print 的输出差异。',
    independentPractice: '为四类资源设计有界测试，采集 JVM 参数、进程内存、堆使用、线程数、元空间和直接缓冲指标，写出错误类型到诊断工具的对照表。',
    commonErrors: ['把 JVM 规范中的运行时数据区等同于操作系统里固定的内存块，忽略元空间与直接内存的本地分配。', '看到 OutOfMemoryError 就只调大 Xmx，不读错误消息中具体 failed to allocate 的资源。'],
    sourceRefs: ['JVMS Runtime Data Areas. https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html', JDK_TOOLS],
    steps: [
      ['堆保存对象实例', '堆由所有线程共享，对象和数组通常在此分配；垃圾回收器负责回收不可达对象。堆上限由 Xmx 或容器感知参数影响，但对象分配还和 TLAB、线程、回收器与晋升有关，堆使用率不能单独解释所有停顿。', '对象堆要和分配速率一起看', {
        title: 'PowerShell + Java：制造 Java heap space',
        language: 'PowerShell',
        code: `@'
import java.util.*;
public class HeapOom {
  public static void main(String[] args) {
    List<byte[]> rows = new ArrayList<>();
    while (true) rows.add(new byte[1024 * 1024]);
  }
}
'@ | Set-Content HeapOom.java
javac HeapOom.java
java -Xms64m -Xmx64m HeapOom
"exit=$LASTEXITCODE"`,
        output: `java.lang.OutOfMemoryError: Java heap space
exit=1

错误明确指出堆空间。诊断需 heap dump、直方图和分配样本，确认是谁持续持有对象。`,
      }],
      ['元空间保存类元数据', '类元数据在本地内存的 Metaspace 中，不受 Xmx 直接限制，可用 MaxMetaspaceSize 限制。动态生成类、反复创建类加载器且未释放会持续增长；错误消息通常会指明 Metaspace 分配失败。', '类泄漏要查加载器引用链', {
        title: 'Java：动态创建类加载器观察元空间',
        language: 'Java',
        code: `List<ClassLoader> keep = new ArrayList<>();
for (int i = 0; i < 10_000; i++) {
  keep.add(new URLClassLoader(new URL[0], null));
}
System.out.println(keep.size());`,
        output: `强引用列表保留 10000 个加载器及其元数据；限制 -XX:MaxMetaspaceSize 后可能报 Metaspace。

真实插件卸载必须移除所有引用；动态代理、脚本引擎和字节码生成也常造成同类泄漏。`,
      }],
      ['每个 Java 线程有栈和 PC', '每个线程拥有独立的 Java 虚拟机栈和程序计数器，方法调用创建栈帧。栈深度超过限制会抛 StackOverflowError，线程数过多会消耗本地内存并可能导致无法创建新线程。线程转储显示栈帧而不显示对象堆内容。', '栈问题看深度和线程数', {
        title: 'Java：递归导致 StackOverflowError',
        language: 'Java',
        code: `static int recurse(int value) {
  return recurse(value + 1) + 1;
}

try {
  recurse(0);
} catch (StackOverflowError error) {
  System.out.println(error.getClass().getSimpleName());
}`,
        output: `StackOverflowError

每个调用创建栈帧，超过线程栈限制后失败。线程转储会显示极深的重复调用栈。`,
      }],
      ['直接内存不受堆直方图完整呈现', 'DirectByteBuffer、NIO 和本地库可分配堆外内存，容量通常由 MaxDirectMemorySize 或本地限制约束。进程 RSS 上升但堆稳定时，应比较 NIO 缓冲计数、NMT 或本地分配器数据，而不是只抓 heap dump。', '堆外问题要看进程与 NMT', {
        title: 'Java：限制 DirectByteBuffer 分配',
        language: 'Java',
        code: `List<ByteBuffer> buffers = new ArrayList<>();
while (true) {
  buffers.add(ByteBuffer.allocateDirect(16 * 1024 * 1024));
}`,
        output: `java.lang.OutOfMemoryError: Direct buffer memory

堆可能看起来稳定，进程 RSS 却持续上升。使用 jcmd VM.native_memory summary 或 NIO 指标定位缺失的清理路径。`,
      }],
      ['先读错误类型再选工具', 'Java heap space、Metaspace、unable to create native thread 和 Direct buffer memory 指向不同边界。用 jcmd VM.info、GC.heap_info、Thread.print 和 NMT 汇总证据，调整前先证明增长来自业务泄漏、配置过小还是外部资源限制。', '错误消息就是第一诊断入口', {
        title: 'PowerShell：OOM 类型到诊断工具',
        language: 'PowerShell',
        code: `jcmd 12345 VM.info > vm.txt
jcmd 12345 GC.heap_info > heap.txt
jcmd 12345 Thread.print > threads.txt
jcmd 12345 VM.native_memory summary > nmt.txt
Get-Content vm.txt,heap.txt,threads.txt,nmt.txt | Select-String "OutOfMemory|heap|Metaspace|thread|native"`,
        output: `Java heap space -> heap.txt / GC.class_histogram / heap dump
Metaspace -> jcmd VM.metaspace / 类加载器引用
unable to create native thread -> threads.txt / 线程数 / 本地限制
Direct buffer memory -> nmt.txt / NIO buffer 指标`,
      }],
    ],
  },
  {
    name: 'GC 根、可达性与分配',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解堆、引用类型和对象生命周期，能使用 JFR 基础事件。',
    goal: '能从 GC 根和引用链解释对象可达性，区分高分配与真实泄漏，并用堆直方图、JFR 分配样本验证。',
    guidedPractice: '创建普通强引用、WeakReference、SoftReference 和 PhantomReference，触发 GC 后记录引用清理与引用队列；再用 JFR 分配样本定位一个请求中的高频临时对象。',
    independentPractice: '对一个存在缓存膨胀的服务做分配画像，区分缓存仍被需要、对象生命周期过长和单位请求分配过高，提交优化前后 GC 次数与内存峰值。',
    commonErrors: ['把所有内存增长都称为内存泄漏，忽略缓存预热、延迟初始化和高分配速率。', '把 System.gc 当成诊断结论，忽略它可能被禁用且不能证明对象为什么仍可达。'],
    sourceRefs: [JAVA_SPECS, JDK_TOOLS],
    steps: [
      ['GC 从根集合追踪可达对象', '活动线程栈、静态字段、JNI 引用、类加载器和同步监视器等都可能形成 GC 根。回收器从根出发标记可达对象，无法到达的实例才可能被回收；对象被回收的顺序和引用类型语义不等于业务上的“无用”。', '从根到对象的路径决定存活', {
        title: 'Java：静态字段形成 GC 根',
        language: 'Java',
        code: `final class Registry {
  static final List<byte[]> CACHE = new ArrayList<>();
}

Registry.CACHE.add(new byte[10 * 1024 * 1024]);
System.gc();
System.out.println(Registry.CACHE.get(0).length);`,
        output: `10485760

静态字段 CACHE 是 GC 根，数组始终可达，不会因局部变量消失而回收。`,
      }],
      ['不同引用提供不同强度', '强引用保持对象存活，SoftReference 通常用于内存压力下的缓存，WeakReference 不阻止回收，PhantomReference 用于对象被回收后的清理通知。依赖引用队列清理要处理延迟和竞态，不能把它当成立即回调。', '引用强度和清理时机不同', {
        title: 'Java：WeakReference 与 ReferenceQueue',
        language: 'Java',
        code: `ReferenceQueue<String> queue = new ReferenceQueue<>();
WeakReference<String> weak = new WeakReference<>(new String("cache"), queue);
System.out.println(weak.get());
System.gc();
Thread.sleep(100);
System.out.println(weak.get());
System.out.println(queue.poll() != null);`,
        output: `cache
null
true

没有强引用后对象可能被回收，引用进入队列。WeakReference 不会阻止回收，也不会保证在同一时刻立即处理。`,
      }],
      ['分配速率会改变停顿模型', '短命对象在年轻代快速分配和回收，晋升到老年代的对象增加标记成本；TLAB 让线程本地分配更高效，但高并发仍会争夺内存。优化单位请求分配通常比单纯扩大堆更能改善 GC 频率；分配样本与堆曲线要同时保存。', '先降分配，再谈堆大小', {
        title: 'Java：减少循环中的临时字符串',
        language: 'Java',
        code: `String raw = "order,paid,4200";

String bad = "";
for (int i = 0; i < 10_000; i++) bad += raw;

StringBuilder good = new StringBuilder(raw.length() * 10_000);
for (int i = 0; i < 10_000; i++) good.append(raw);
System.out.println(bad.length() == good.length());`,
        output: `true

两种结果相同，但前一种循环创建大量中间 String；StringBuilder 复用缓冲区，降低年轻代分配和 GC 压力。`,
      }],
      ['JFR 样本适合找热点类型', '开启 jdk.ObjectAllocationSample，按堆栈聚合分配字节和样本数，能定位构造器、装箱、日志拼接或集合扩容。采样会受阈值影响，结论要找代码路径和可复现实验，不能用单一计数替代。', '样本热点必须回到源码', {
        title: 'PowerShell：采集 JFR 分配样本',
        language: 'PowerShell',
        code: `java -XX:StartFlightRecording=filename=alloc.jfr,settings=profile,duration=30s \
  -cp app.jar com.example.AllocationHotspot
jfr view alloc.jfr --width=180
jfr print --events jdk.ObjectAllocationSample alloc.jfr > allocation-samples.txt
Select-String -Path allocation-samples.txt -Pattern "objectClass|stackTrace" -Context 0,6`,
        output: `jdk.ObjectAllocationSample {
  objectClass = java.lang.String
  weight = 1.2 GB
  stackTrace = [ OrderMapper.toSummary(...), OrderFormatter.format(...) ]
}

样本直接指向分配热点栈。再结合源码和请求量确认是否可减少。`,
      }],
      ['用增长曲线判断泄漏', '分别观察请求结束后、强制触发完整回收后和长时间空闲后的堆使用；真正泄漏通常呈阶梯式单调增长，缓存膨胀则与业务键数量相关。优化后比较分配、暂停和容量，不能用一次 GC 日志宣称故障消失。', '区分泄漏、缓存和分配峰值', {
        title: 'PowerShell：请求前后采集堆直方图',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
jcmd $pid GC.class_histogram > heap-before.txt
1..20 | ForEach-Object { Invoke-WebRequest http://127.0.0.1:8080/api/orders | Out-Null }
Start-Sleep -Seconds 5
jcmd $pid GC.class_histogram > heap-after.txt
Compare-Object (Get-Content heap-before.txt) (Get-Content heap-after.txt) |
  Select-Object -First 20`,
        output: `after 中 OrderCacheEntry 实例数和字节持续增加，而请求已结束。

若缓存键数量也同步增长，是容量策略问题；若同一业务对象反复创建并仍存活，继续查根引用链。`,
      }],
    ],
  },
  {
    name: 'G1、ZGC 与停顿模型',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 GC 根、堆分配和 GC 日志，能比较不同回收器参数。',
    goal: '能解释 G1 的区域化回收与预测停顿，以及 ZGC 的并发标记、转移和分代/不分代版本边界，并用同一负载比较结果。',
    guidedPractice: '在 JDK 21 中分别用 -XX:+UseG1GC 和 -XX:+UseZGC 运行同一分配负载，开启 -Xlog:gc*:file=gc.log:time,uptime,level,tags，比较暂停时间、CPU、堆和恢复时间。',
    independentPractice: '为一个低延迟服务完成回收器选择报告，固定堆上限、请求速率和数据规模，记录 P99、最大暂停、吞吐和内存占用，并说明不能直接推广的场景。',
    commonErrors: ['把 ZGC 的低停顿当成吞吐和内存完全免费，忽略并发标记与转移消耗 CPU。', '在不改变堆、负载和采集窗口的情况下比较两份 GC 日志，把环境差异归因于回收器。'],
    sourceRefs: ['HotSpot Garbage Collection Tuning Guide. https://docs.oracle.com/en/java/javase/21/gctuning/', 'JEP 439: Generational ZGC. https://openjdk.org/jeps/439'],
    steps: [
      ['G1 按 Region 组织堆', 'G1 把堆分成大小相近的 Region，年轻代、老年代对象可以在 Region 间分布，回收器根据收益和暂停预测选择收集集合。Humongous 对象会占用连续 Region，频繁巨大分配可能改变收集行为。', '区域化让回收集合可预测', {
        title: 'PowerShell：运行 G1 并记录 GC 日志',
        language: 'PowerShell',
        code: `java -XX:+UseG1GC -Xms512m -Xmx512m \
  -Xlog:gc*:file=g1.log:time,uptime,level,tags \
  -cp app.jar com.example.GcWorkload
Get-Content g1.log -Tail 30`,
        output: `[gc,phases] GC(12) Pause Young (Normal) 18.2ms
[gc,heap] GC(12) Eden: 180M->0M
[gc,heap] GC(12) Survivor: 20M->24M
[gc,heap] GC(12) Old: 120M->122M

暂停 18.2ms，老年代小幅增长。结合分配速率和后续晋升判断是否需要调整 Region 或堆。`,
      }],
      ['G1 先追吞吐与暂停目标', 'MaxGCPauseMillis 是目标而非硬保证，回收器会在年轻代大小、候选 Region 和并发线程之间权衡。堆过小、分配过快或 Humongous 分配过多时，仍可能发生 Full GC 或超出目标。', '暂停目标是概率性约束', {
        title: 'PowerShell：设置 G1 暂停目标',
        language: 'PowerShell',
        code: `java -XX:+UseG1GC \
  -Xms1g -Xmx1g \
  -XX:MaxGCPauseMillis=100 \
  -Xlog:gc:file=g1-pause.log \
  -cp app.jar com.example.GcWorkload
Select-String -Path g1-pause.log -Pattern "Pause Young|Pause Full|ms"`,
        output: `Pause Young (Normal) 42ms
Pause Young (Normal) 78ms
Pause Full 720ms

目标 100ms 不是保证。Full GC 说明晋升、Humongous 或并发回收跟不上，需要继续定位而不是只调目标值。`,
      }],
      ['ZGC 并发执行大部分重活', 'ZGC 通过并发标记、并发重映射/转移和读屏障等机制缩短应用线程停顿，具体实现随 JDK 版本演进。JDK 21 提供分代 ZGC，使用 ZGenerational Flag 时会出现年轻代与老年代行为差异，参数和日志必须以运行版本为准。', '低停顿来自并发工作', {
        title: 'PowerShell：运行 ZGC 并采日志',
        language: 'PowerShell',
        code: `java -XX:+UseZGC -Xms1g -Xmx1g \
  -Xlog:gc*:file=zgc.log:time,uptime,level,tags \
  -cp app.jar com.example.GcWorkload
java -XX:+UseZGC -XX:+ZGenerational \
  -Xms1g -Xmx1g -Xlog:gc:file=zgc-gen.log \
  -cp app.jar com.example.GcWorkload`,
        output: `ZGC 日志中标记、转移阶段与应用线程并发执行，应用停顿通常远小于完整堆回收时间。

并发阶段会消耗 CPU。JDK 21 分代配置还必须用实际版本参数和事件验证，不能照搬旧版日志解释。`,
      }],
      ['比较时必须控制变量', '同一服务、同一请求模型、同一堆上限和 CPU 配额分别运行 G1 与 ZGC，至少采集预热后五分钟和一次恢复窗口。输出吞吐、P50/P99/最大暂停、GC CPU、峰值 RSS 和错误率，不用平均值代替长尾。', '同一负载才有比较价值', {
        title: 'PowerShell：固定负载对比回收器',
        language: 'PowerShell',
        code: `foreach ($gc in @('g1','zgc')) {
  $opts = if ($gc -eq 'g1') { '-XX:+UseG1GC' } else { '-XX:+UseZGC' }
  java $opts -Xms1g -Xmx1g -Xlog:gc:file="$gc.log" \
    -cp app.jar com.example.LoadRunner --duration=300 --rate=200
  Copy-Item metrics.json "$gc-metrics.json"
}`,
        output: `g1-metrics.json：throughput=180 req/s, p99=92ms, maxPause=85ms, gcCpu=14%
zgc-metrics.json：throughput=165 req/s, p99=48ms, maxPause=3ms, gcCpu=22%

同一负载下才可比较：ZGC 降低暂停但消耗更多 CPU 和吞吐。选择取决于质量属性。`,
      }],
      ['回收器选择绑定质量属性', '高吞吐批处理可能更看重 GC CPU，在线低延迟服务更看重尾暂停，内存紧张还要考虑额外转发状态。选择后在容器中验证 cgroup 限制、启动参数和日志路径，保留回退到已验证回收器的发布方案。', '选型后还要做上线回归', {
        title: 'Markdown：GC 选型报告模板',
        language: 'Markdown',
        code: `# 订单服务 GC 选型

## 约束
- 堆 1GB，CPU 限额 2 核
- P99 < 200ms，最大暂停 < 50ms

## 结果
| 回收器 | 吞吐 | P99 | 最大暂停 | GC CPU |
| G1 | 180/s | 92ms | 85ms | 14% |
| ZGC | 165/s | 48ms | 3ms | 22% |

## 决策
选择 ZGC，保留 G1 启动参数作为回退。`,
        output: `报告关联质量属性、实验环境和结果。

上线后继续监控 P99、GC CPU、RSS 和容器 OOM；若 CPU 饱和或内存超限，切回 G1。`,
      }],
    ],
  },
  {
    name: 'JIT、内联与去优化',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解字节码、栈帧、热点代码和基本性能基准。',
    goal: '能解释解释执行、C1/C2 分层编译、profile 驱动优化和去优化，用 PrintCompilation、JFR 与 JMH 解释预热差异。',
    guidedPractice: '用 -XX:+PrintCompilation 和 -XX:+UnlockDiagnosticVMOptions 观察方法编译级别，再让类型检查或内联假设失效，定位 uncommon trap 和重新解释执行。',
    independentPractice: '写一个会被 JIT 优化掉的微基准，加入 Blackhole 和预热后重跑，提交编译事件、去优化事件和稳定分位数对照。',
    commonErrors: ['用冷启动第一次调用测性能，把解释执行和类加载时间当成库本身成本。', '为了减少方法大小强行复制代码，忽略内联收益依赖 profile、调用频率和代码缓存。'],
    sourceRefs: ['JVM Compilation and Optimization. https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html', JDK_TOOLS],
    steps: [
      ['分层编译逐级收集 profile', 'HotSpot 先解释执行并收集调用频率、分支与类型信息，C1 可快速生成带较多检查的代码，C2 依据 profile 做更激进优化。方法是否编译取决于热点阈值、队列、编译线程和代码大小。', '优化建立在运行 profile 上', {
        title: 'PowerShell：观察分层编译事件',
        language: 'PowerShell',
        code: `@'
public class HotLoop {
  static long work(int value) { return (long) value * value; }
  public static void main(String[] args) {
    long sum = 0;
    for (int i = 0; i < 20_000_000; i++) sum += work(i);
    System.out.println(sum);
  }
}
'@ | Set-Content HotLoop.java
javac HotLoop.java
java -XX:+PrintCompilation HotLoop > compile.log
Select-String -Path compile.log -Pattern "HotLoop|made not entrant|%|s" | Select-Object -First 20`,
        output: `120 HotLoop::work (5 bytes)
123 HotLoop::main (24 bytes)
...
made not entrant

输出中能看到方法被编译和后续失效。具体级别、ID 和顺序随 JVM、热点阈值变化。`,
      }],
      ['内联减少调用并打开优化空间', 'JIT 会把小方法或热点方法体嵌入调用方，消除参数传递并让常量传播、逃逸分析继续工作。内联预算受方法大小、调用点和层级影响，不能仅凭 final 或行数断定一定内联；必须用 JIT 日志证明结论。', '内联是优化前提，不是标注结果', {
        title: 'PowerShell：启用内联诊断日志',
        language: 'PowerShell',
        code: `java -XX:+UnlockDiagnosticVMOptions \
  -XX:+PrintInlining \
  -XX:+PrintCompilation \
  HotLoop > inlining.log
Select-String -Path inlining.log -Pattern "HotLoop::work|inline|too large|not inline" -Context 0,1`,
        output: `HotLoop::main
  @ 3 HotLoop::work (5 bytes) inline (hot)

小热点方法被内联到 main。若方法过大或调用点过多，日志会显示 too large、hot method too big 等原因。`,
      }],
      ['去优化回退到安全版本', '当类型假设、空检查或类层次发生变化，已编译代码可能去优化回解释器或较低层代码。去优化本身是正确性机制，但频繁发生会让延迟抖动；JFR 的 CompilerInlining 与 Deoptimization 事件能定位原因。', '优化假设失效会回退', {
        title: 'PowerShell：记录去优化事件',
        language: 'PowerShell',
        code: `java -XX:+UnlockDiagnosticVMOptions \
  -XX:+TraceDeoptimization \
  -cp app.jar com.example.PolymorphicHotspot > deopt.log
Select-String -Path deopt.log -Pattern "uncommon trap|deoptimizing|reason" -Context 1,3`,
        output: `uncommon trap: reason=class_check action=reinterpret
deoptimizing (DEOPT reason=class_check)
  method: OrderMapper.map(Order)

说明运行时类型不再满足此前 profile 假设，JIT 回退到安全执行。频繁出现会影响尾延迟。`,
      }],
      ['PrintCompilation 只提供事件线索', 'PrintCompilation 输出包含编译 ID、级别、方法名和状态标记，需要和日志时间、线程及代码缓存一起分析。它不直接说明优化收益，必须配合基准和火焰图，避免把一次编译事件当成瓶颈。', '编译事件要关联真实负载', {
        title: 'PowerShell：编译事件与性能时间线对齐',
        language: 'PowerShell',
        code: `java -XX:+PrintCompilation -Xlog:gc:file=gc.log -cp app.jar LoadRunner > compile.log
Get-Content compile.log | Select-String "OrderService" > service-compile.log
Get-Content gc.log | Select-String "Pause" > gc-pause.log
Get-ChildItem service-compile.log,gc-pause.log | Select-Object Name,Length,LastWriteTime`,
        output: `service-compile.log：OrderService 在启动后 3-8 秒出现 C1/C2 编译
gc-pause.log：同窗口发生两次 Young GC

编译事件只是时间线的一部分。性能延迟是否改善仍需请求分位数和真实负载对照。`,
      }],
      ['JMH 控制预热和消除', 'JMH 通过独立 JVM、迭代预热和 Blackhole 防止死代码消除，结果应报告模式、线程、分位数和置信区间。微基准证明的是小方法成本，生产性能还要验证网络、数据库、锁和 GC。', '微基准只回答微问题', {
        title: 'Java + JMH：避免死代码消除',
        language: 'Java',
        code: `@State(Scope.Thread)
public class WorkBenchmark {
  int value;

  @Setup
  public void setup() { value = 42; }

  @Benchmark
  public int work() {
    return value * 31;
  }
}`,
        output: `Benchmark        Mode  Cnt  Score   Error  Units
WorkBenchmark.work  avgt  10  0.8 ns/op

JMH 返回结果并防止调用被优化掉。冷启动、首轮 JIT 和方法本身语义仍需另外解释。`,
      }],
    ],
  },
  {
    name: 'JFR 事件与火焰图',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '能启动带 JVM 参数的服务，理解线程、GC、分配和调用栈。',
    goal: '能用 jcmd 启动、导出和停止 JFR，选择合适 profile 配置，并在 JMC 或火焰图中关联 CPU、等待、分配与 GC。',
    guidedPractice: '对本地服务执行 jcmd <pid> JFR.start name=diag settings=profile duration=60s filename=recording.jfr，再运行负载并执行 JFR.dump，打开 JMC 比较热点方法、线程状态和 GC。',
    independentPractice: '对一个慢接口采集一个请求窗口，写出一页诊断：最热栈、最长阻塞、分配热点、异常事件和证据窗口，并提出一个只需改一处变量的实验。',
    commonErrors: ['只采 CPU 样本就把所有慢请求都归因于热点方法，忽略锁等待、IO 和下游超时。', '采样窗口覆盖太短或混入预热、批处理，导致事件不能代表待诊断请求。'],
    sourceRefs: ['JFR Runtime Guide. https://docs.oracle.com/javase/21/jfr/', JDK_TOOLS],
    steps: [
      ['JFR 用事件记录运行时行为', 'JFR 从 JVM 内部采集执行样本、线程、锁、IO、GC、异常和编译事件，事件有开始时间、持续时间、线程和栈字段。记录开销由 settings 决定，profile 与 low-overhead 覆盖的事件密度不同。', '先选事件，再选窗口', {
        title: 'PowerShell：使用 jcmd 控制 JFR',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
jcmd $pid JFR.start name=diag settings=profile duration=60s filename=diag.jfr
jcmd $pid JFR.dump name=diag filename=diag-window.jfr
jcmd $pid JFR.stop name=diag
jfr summary diag-window.jfr`,
        output: `启动 Recording 1，名称 diag，settings=profile
导出的 diag-window.jfr 包含 60 秒窗口
summary 显示 ExecutionSample、JavaMonitorEnter、ObjectAllocationSample 等事件数量`,
      }],
      ['命令行控制记录生命周期', 'jcmd JFR.start 创建记录，JFR.dump 导出当前内容，JFR.stop 结束；也可用 JFR.start 的 disk=true 和 maxage 控制循环缓存。生产环境使用固定文件名与权限，避免把包含用户数据的记录写入公共目录。', '启动、导出、停止三阶段', {
        title: 'PowerShell：循环 JFR 只保留最近窗口',
        language: 'PowerShell',
        code: `jcmd 12345 JFR.start name=rolling settings=profile \
  disk=true maxage=10m maxsize=512m repository=C:\\diag
Start-Sleep -Minutes 5
jcmd 12345 JFR.dump name=rolling filename=C:\\diag\\incident.jfr
jcmd 12345 JFR.stop name=rolling`,
        output: `循环记录保留最近 10 分钟，总大小不超过 512MB。
发生故障后 dump 当前缓存，既保留事发前窗口，又避免长期无限写盘。`,
      }],
      ['火焰图显示样本聚合', 'CPU 火焰图按调用栈聚合同一执行点，宽度表示样本占比；分配火焰图按对象分配字节聚合，等待分析则要看线程状态和锁事件。图只显示采集到的事件，不能直接证明业务因果，需要对照请求时间和日志。', '宽度是样本占比', {
        title: 'PowerShell + JFR：导出火焰图数据',
        language: 'PowerShell',
        code: `jfr print --events jdk.ExecutionSample recording.jfr > samples.json
jfr print --events jdk.ObjectAllocationSample recording.jfr > allocations.json
jfr view recording.jfr --width=160`,
        output: `ExecutionSample 中 OrderService.calculate 占样本宽度 42%
ObjectAllocationSample 中 String 和 Map.Entry 分配最多

火焰图显示样本占比，不直接证明慢请求因果；再按线程、时间窗和 traceId 对齐。`,
      }],
      ['先找长尾请求窗口', '从指标中选中一个超时或慢请求时间窗，限定 JFR 事件时间段，关联 trace ID、线程名和上游等待。若慢请求分布广，扩大采样窗口；若只有少量请求，复制其输入做最小复现；窗口过宽会稀释热点。', '诊断窗口要对应具体请求', {
        title: '文本：从长尾请求选 JFR 窗口',
        language: 'Text',
        code: `指标：
14:00:00-14:00:05 P99 从 80ms 升到 4s
trace: req-20261123-0088
线程: http-nio-8080-exec-42
下游: inventory-service

JFR 过滤：
startTime >= 14:00:01
endTime <= 14:00:05
eventThread = http-nio-8080-exec-42`,
        output: `只查看该请求窗口和线程的事件，避免把预热、批处理和正常请求混在一起。

再对照 trace 中的 inventory 超时，决定继续看 lock/IO/CPU 哪类事件。`,
      }],
      ['实验只改一个关键变量', '根据证据选择一个可证伪假设，例如减少日志分配、缩短锁临界区或更换连接池配置。保持请求模型和其他 JVM 参数不变重跑，比较 P99、GC、锁等待和错误率；没有改善时撤回变更并记录反证。', '没有收益就撤回', {
        title: 'Markdown：JFR 单变量实验记录',
        language: 'Markdown',
        code: `假设：慢请求 70% 时间阻塞在 OrderMapper 锁
证据：JavaMonitorEnter 直方图，阻塞 3.8s
修改：缩小 synchronized 临界区，不调整 JVM 参数
复测：同一 recording 配置、同一负载 300s

结果：P99 4.1s -> 280ms，错误率 0

若无改善则撤回并保留 recording。`,
        output: `实验将一个 JFR 证据转成一处代码修改，并保持其他变量不变。

没有改善时记录反证并回退，避免把未经验证的改动永久留在生产中。`,
      }],
    ],
  },
  {
    name: '线程转储与锁竞争',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解线程状态、synchronized、锁和线程池，能读取 jcmd 输出。',
    goal: '能多次采集线程转储，识别持续 RUNNABLE、BLOCKED、WAITING 和池耗尽，并用锁持有者与调用栈定位阻塞源。',
    guidedPractice: '构造连接池等待和两把锁环形等待，间隔五秒执行两次 jcmd <pid> Thread.print -l，比较两个快照中的 BLOCKED、deadlock 和相同线程栈。',
    independentPractice: '对一个线程持续增长的测试服务做三轮采样，区分业务线程泄漏、公共池阻塞和锁竞争，提交线程数曲线、代表栈和修复验证。',
    commonErrors: ['只看一次线程转储就判断死锁，忽略普通短时等待和采样瞬时性。', '只搜索自己写的类名，不查看锁持有者线程和 JDK、连接池、日志库的栈。'],
    sourceRefs: [JDK_TOOLS, JAVA_CONCURRENCY],
    steps: [
      ['线程转储是瞬时快照', '转储列出每个 Java 线程的 ID、名称、状态、优先级、栈帧和锁信息，原生线程 ID 可能以十六进制显示。单次快照会捕获到正常等待，至少间隔几秒采样多次，观察调用栈是否持续不变；每次快照保留时间与线程 ID。', '多次采样比一次截图可靠', {
        title: 'PowerShell：间隔采集三次线程转储',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
1..3 | ForEach-Object {
  jcmd $pid Thread.print -l > "threads-$_.txt"
  Start-Sleep -Seconds 5
}
Get-ChildItem threads-*.txt | Select-Object Name,Length`,
        output: `threads-1.txt
threads-2.txt
threads-3.txt

每次间隔 5 秒。只有多份快照中都持续的同一栈，才更可能是长期阻塞或泄漏。`,
      }],
      ['区分阻塞与等待原因', 'BLOCKED 通常在等待监视器，WAITING 可能在 Object.wait、join 或 LockSupport.park，TIMED_WAITING 带有明确超时。RUNNABLE 既可能真的消耗 CPU，也可能位于本地 IO；要结合 CPU 使用、JFR 和栈判断。', '状态只说明 Java 层等待', {
        title: 'PowerShell：按线程状态统计',
        language: 'PowerShell',
        code: `Get-Content threads-2.txt |
  Select-String -Pattern "java.lang.Thread.State:" |
  ForEach-Object { $_.Line.Trim() } |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object Count,Name`,
        output: `Count Name
12    java.lang.Thread.State: WAITING
6     java.lang.Thread.State: TIMED_WAITING
4     java.lang.Thread.State: RUNNABLE

统计只说明分布；还要看每类线程的栈和等待对象。`,
      }],
      ['从持有者回溯锁链', '带 -l 的转储会显示 waiting to lock 与 locked 的对象和线程，JVM 还能识别部分监视器死锁。线程池耗尽时，多个业务线程可能都停在同一个连接获取方法，真正的所有者可能正在慢 SQL 或远程调用。', '同时看等待者和持有者', {
        title: 'PowerShell：提取死锁和锁持有者',
        language: 'PowerShell',
        code: `Select-String -Path threads-*.txt -Pattern "Found one Java-level deadlock|waiting to lock|locked" -Context 1,4
jcmd 12345 Thread.print -l > current.txt
Select-String -Path current.txt -Pattern "waiting to lock" -Context 0,6`,
        output: `"Thread-1" waiting to lock <0x...> held by "Thread-2"
"Thread-2" waiting to lock <0x...> held by "Thread-1"
Found one Java-level deadlock

同时显示等待者和持有者栈；修复锁顺序后再采样，死锁段应消失。`,
      }],
      ['连接池与公共池要单列', '记录线程名前缀、池名、队列等待和存活线程数，区分业务请求线程、Hikari 获取线程、Kafka 消费者和调度线程。按线程族统计增长比总线程数更能定位泄漏来源；同名线程要追溯创建者。', '先按所有权归类线程', {
        title: 'PowerShell：按线程名前缀统计',
        language: 'PowerShell',
        code: `Get-Content threads-3.txt |
  Select-String -Pattern '^"' |
  ForEach-Object { ($_.Line -split '"')[1] -replace '-[0-9]+$','' } |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object Count,Name`,
        output: `Count Name
30    pool
12    http-nio-8080-exec
8     kafka-consumer
4     HikariPool-1

按线程族统计能看出 pool 持续增长；只看总数会掩盖是哪类线程泄漏。`,
      }],
      ['修复后验证不再累积', '保存三份基线快照、故障快照和修复后快照，比较线程数、持续栈和锁等待。再用相同测试负载验证线程回收、任务完成和超时；只有指标和栈都恢复，才能关闭问题；测试负载和采样间隔必须一致，否则回归无效。', '用同一故障模型回归', {
        title: 'Markdown：线程转储闭环报告',
        language: 'Markdown',
        code: `# 线程泄漏回归

## 基线
线程数 42，连续 3 次采样稳定

## 故障
20 次请求后线程数 82，pool-* 增加 40 个

## 根因
每次请求创建 newFixedThreadPool，且未 shutdown

## 修复
共享应用级线程池，关闭阶段 shutdown + awaitTermination

## 回归
20 次请求后线程数 42，无持续相同栈`,
        output: `报告把基线、故障、根因、修复和回归放在同一证据链。

只有同一负载下线程数回基线且持续栈消失，才关闭问题。`,
      }],
    ],
  },
  {
    name: '堆转储与内存泄漏',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 GC 根、引用类型、对象分配和 JVM 诊断命令。',
    goal: '能安全导出 heap dump，用直方图、支配树和 GC 根路径区分缓存膨胀与泄漏，并通过删除引用验证修复。',
    guidedPractice: '制造 ThreadLocal 未 remove 的泄漏，执行 jcmd <pid> GC.heap_dump heap.hprof，在 MAT 中查看对象数量、支配树和 path to GC roots，再修复后对比快照。',
    independentPractice: '对一个持续增长的服务制定 dump 流程：触发条件、文件权限、两次间隔、对象指标和根因结论，提交泄漏对象、持有链、修复和回归数据。',
    commonErrors: ['在生产高峰对超大堆直接同步 dump，造成磁盘、暂停和传输故障。', '只看对象数量最多就认定泄漏，忽略字符串和基础数组可能只是正常负载。'],
    sourceRefs: ['Troubleshooting Guide, Heap Dump. https://docs.oracle.com/en/java/javase/21/troubleshoot/', JDK_TOOLS],
    steps: [
      ['先确认是否值得 dump', '连续采样 GC 后仍持续增长的堆、明确 OutOfMemoryError 或缓存规模异常才值得导出。dump 会写大量文件并可能暂停应用，执行前检查磁盘、权限、容器卷和备份策略；容器内还要核对转储落盘位置。', 'dump 是受控诊断动作', {
        title: 'PowerShell：安全导出 heap dump',
        language: 'PowerShell',
        code: `$pid = (Get-Process java).Id
$drive = Get-PSDrive C
$freeGb = [math]::Round($drive.Free / 1GB, 1)
if ($freeGb -lt 10) { throw "LOW_DISK" }
jcmd $pid GC.heap_dump C:\\diag\\heap-20261123.hprof
Get-Item C:\\diag\\heap-20261123.hprof | Select-Object FullName,Length`,
        output: `FullName                       Length
C:\\diag\\heap-20261123.hprof  734003200

dump 前检查磁盘。生产要在低峰、限流和明确权限下执行，并对文件加密和定期删除。`,
      }],
      ['直方图先看类型和数量', 'jcmd GC.class_histogram 或诊断工具直方图能快速比较两次快照中实例数、字节数和类。确认增长集中在业务对象、类加载器还是集合内部节点，再决定是否导出全堆；直方图本身不能展示引用链。', '先定位增长类型', {
        title: 'PowerShell：比较两次类直方图',
        language: 'PowerShell',
        code: `jcmd 12345 GC.class_histogram > histogram-1.txt
1..20 | ForEach-Object { Invoke-WebRequest http://127.0.0.1:8080/api/orders | Out-Null }
jcmd 12345 GC.class_histogram > histogram-2.txt
Compare-Object (Get-Content histogram-1.txt) (Get-Content histogram-2.txt) |
  Select-Object -First 20`,
        output: `histogram-2 中 OrderSnapshot 实例从 1000 增到 21000，字节同步增长。

增长类型明确后再导出全堆查引用链；若只是正常缓存，还要比较业务键数量和淘汰策略。`,
      }],
      ['支配树找保留内存', 'MAT 的 dominator tree 显示对象被回收后能释放的保留大小，shallow size 只是对象自身占用。缓存根节点常拥有很大的 retained heap，但还需结合业务键数量与淘汰策略判断是否合理。', '保留大小比浅大小关键', {
        title: 'MAT：从浅大小走到支配树',
        language: 'Text',
        code: `Histogram:
OrderSnapshot   21,000 instances  40 MB shallow
HashMap$Node    54,000 instances  2 MB shallow

Dominator Tree:
OrderCache.snapshots  retained 420 MB
  -> ConcurrentHashMap
    -> 21000 OrderSnapshot`,
        output: `Map Node 自身只有 2MB，但支配树显示缓存根 retained 420MB。

应优先检查缓存根、键数量和淘汰策略；不能因为 Node 数量多就忽略其支配对象。`,
      }],
      ['沿 GC 根路径解释存活', '查看 Path to GC Roots 时排除弱软引用影响，确认是静态字段、线程局部、连接、监听器还是未关闭类加载器持有对象。修复必须删除最短可证明的持有链，而不是简单地调用 System.gc。', '泄漏就是仍存活的引用链', {
        title: 'Java：ThreadLocal 未 remove 的泄漏',
        language: 'Java',
        code: `static final ThreadLocal<byte[]> CACHE =
  ThreadLocal.withInitial(() -> new byte[10 * 1024 * 1024]);

ExecutorService pool = Executors.newFixedThreadPool(4);
for (int i = 0; i < 4; i++) pool.submit(() -> CACHE.get()[0] = 1);
pool.shutdown();
pool.awaitTermination(1, TimeUnit.SECONDS);`,
        output: `线程池线程复用并保留 ThreadLocal 值；4 个线程各持有 10MB，线程存活期间不能回收。

Path to GC Roots 可看到 Thread.threadLocals -> CACHE -> byte[]。修复是在 finally 中 remove。`,
      }],
      ['两次快照和修复后快照闭环', '同一业务阶段间隔采集快照，比较对象增长、入站引用和缓存大小；修复后重复相同负载，确认对象数量不再单调增长。若根因来自动态类，还要确认类加载器可回收；类加载器数量也进入比较，持续增长即失败。', '用快照趋势证明修复', {
        title: 'Markdown：内存泄漏报告模板',
        language: 'Markdown',
        code: `# 泄漏闭环

## 对象
ThreadLocal byte[]，4 个线程各 10MB

## 引用链
Thread.threadLocals -> CACHE -> byte[]

## 修复
任务 finally 中 CACHE.remove()

## 回归
同负载后线程保留 4，但没有 byte[] 实例
retained heap 40MB -> 0MB`,
        output: `报告包含对象、最短引用链、修复和前后保留内存。

只有相同负载和相同快照阶段下对象不再增长，才证明修复有效。`,
      }],
    ],
  },
  {
    name: 'JVM 调优实验与回归',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 JVM、GC、JIT、JFR、线程与堆诊断课程。',
    goal: '能围绕延迟、吞吐、内存和启动质量设计受控 JVM 实验，记录假设、基线、单变量变更、回归和回滚条件。',
    guidedPractice: '对同一 Spring Boot 服务设置两套堆与回收器参数，分别执行预热、稳态和恢复压测，记录 TPS、P99、最大暂停、GC CPU、RSS 和错误率。',
    independentPractice: '选择一个 P99 超标服务，先证明瓶颈属于 JVM 还是下游，再完成一次单变量调优实验；若收益不显著，提交不修改的理由和后续观测方案。',
    commonErrors: ['直接把 Xmx 调到机器内存上限，忽略容器限制、堆外内存和操作系统缓存。', '更改多个 GC、线程和连接池参数后只看平均响应时间，无法归因。'],
    sourceRefs: ['HotSpot GC Tuning Guide. https://docs.oracle.com/en/java/javase/21/gctuning/', JDK_TOOLS],
    steps: [
      ['先把质量目标写成指标', '调优前确定吞吐、P99、最大暂停、内存、启动时间或恢复时间中哪一项是主目标，并为其他指标设置不可突破门槛。没有目标的参数组合只是配置堆叠，无法判断收益是否值得；护栏指标突破即判定失败。', '主目标与护栏同时写', {
        title: 'Markdown：JVM 调优目标卡',
        language: 'Markdown',
        code: `主目标：订单接口 P99 < 200ms
护栏：
- 吞吐不低于 150 req/s
- 最大 GC 暂停 < 100ms
- 容器 RSS < 1.5GB
- 错误率 = 0

实验窗口：预热 5 分钟 + 稳态 10 分钟
基线参数：-Xms1g -Xmx1g -XX:+UseG1GC`,
        output: `目标、护栏、窗口和基线完整后才开始调优。

任何优化若降低 P99 但吞吐或内存越过护栏，都不能直接上线。`,
      }],
      ['建立可重复的基线', '固定制品、JDK、容器 CPU/内存、请求模型、数据集和预热时间，记录完整启动参数。基线至少运行多轮并保存原始日志，避免把一次性峰值或机器噪声当比较对象；原始日志与制品摘要一起归档。', '基线就是后续实验的尺子', {
        title: 'PowerShell：运行三轮基线压测',
        language: 'PowerShell',
        code: `1..3 | ForEach-Object {
  java -Xms1g -Xmx1g -XX:+UseG1GC \
    -cp app.jar com.example.LoadRunner --duration=600 --rate=200 \
    --output="baseline-$_.json"
}
Get-ChildItem baseline-*.json | ForEach-Object {
  (Get-Content $_.FullName | ConvertFrom-Json) |
    Select-Object throughput,p99,maxPause,errorRate
}`,
        output: `throughput p99 maxPause errorRate
181        92  85       0
178        96  88       0
180        94  82       0

三轮接近才作为基线；若波动大，先排查环境噪声和测试数据。`,
      }],
      ['一次只改变一个变量', '选择 Xmx、回收器、暂停目标、线程数或 JIT 参数中的一项修改，其他条件保持不变。实验前写出预期影响和可能的反例，结果出来后按证据接受或否定假设；同时改动两项即重新做基线。', '变量隔离才能归因', {
        title: 'PowerShell：单变量调整暂停目标',
        language: 'PowerShell',
        code: `java -Xms1g -Xmx1g -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=100 \
  -cp app.jar com.example.LoadRunner \
  --duration=600 --rate=200 --output=experiment-1.json

$before = Get-Content baseline-1.json | ConvertFrom-Json
$after = Get-Content experiment-1.json | ConvertFrom-Json
[pscustomobject]@{
  beforeP99=$before.p99
  afterP99=$after.p99
  beforePause=$before.maxPause
  afterPause=$after.maxPause
}`,
        output: `beforeP99 afterP99 beforePause afterPause
92        85       85          72

只改 MaxGCPauseMillis，其他参数和负载保持一致。收益来自暂停目标调整，不能归因于别的变化。`,
      }],
      ['区分暂停与总耗时', 'GC 暂停只是 JVM 诊断的一部分，接口慢还可能来自锁、数据库、网络或队列。把 JFR、trace、数据库指标和应用日志对齐时间，确认调优是否真的触达主瓶颈；时间轴无法对齐时先补链路观测。', 'JVM 指标不是全链路指标', {
        title: 'Text：把 GC 与请求时间线对齐',
        language: 'Text',
        code: `14:00:02.100  Pause Young 12ms
14:00:02.300  slow request req-88 begins
14:00:02.310  Hikari getConnection wait starts
14:00:03.900  Hikari wait ends 1590ms
14:00:03.920  request finishes 1620ms

GC 只占 12ms，P99 慢请求主要等待连接池。`,
        output: `继续调较小 GC 暂停对 1.6s 请求帮助有限。

应先检查连接池容量、慢 SQL 和事务持有时长，不能仅凭 JVM 参数解释整个延迟。`,
      }],
      ['回归和回退条件前置', '把新参数纳入配置版本和发布单，验证滚动重启、容器内存、健康检查和回滚命令。上线后观察至少一个业务峰值，若超过错误率、P99 或内存门槛立即回退并保留实验记录；超过门槛不做继续观察。', '上线验证与回滚同属结论', {
        title: 'Markdown：JVM 实验发布卡',
        language: 'Markdown',
        code: `变更：-XX:MaxGCPauseMillis 200 -> 100
制品：orders-api:2026.11.23.1
回退参数：MaxGCPauseMillis=200

上线观察：
- P99 > 200ms 持续 10 分钟 -> 回退
- RSS > 1.5GB -> 回退
- 错误率 > 0.1% -> 回退
- GC CPU > 30% 持续 10 分钟 -> 回退`,
        output: `参数变更有版本、回退值和观测门槛。

回退后保留 JFR、GC 日志和压测结果，作为下一次决策证据。`,
      }],
    ],
  },
];

const J5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'JDK 8：Lambda、Stream 与函数式基线',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握匿名内部类、泛型、集合与基本函数式编程概念。',
    goal: '能解释 Lambda 如何适配函数式接口、Stream 的惰性流水线、Optional 与 java.time 的边界，并识别迁移中的语义变化。',
    guidedPractice: '把一段匿名 Comparator 和 for 循环改写为 Lambda 与方法引用，用 javap 观察 invokedynamic 引导方法；对金额和日期分别比较旧 Date 与 java.time 的时区和不可变行为。',
    independentPractice: '将一个 JDK 7 集合处理模块迁移到接口默认方法、Stream 和 java.time，保留旧行为测试并指出不适合并行化或链式化的场景。',
    commonErrors: ['把 Lambda 当成匿名类的完全等价物，忽略 this、异常捕获和运行时生成策略。', '用 Optional.get 取代所有 null 检查，导致缺失值仍然在运行时爆炸。'],
    sourceRefs: ['JEP 126: Lambda Expressions and Default Methods. https://openjdk.org/jeps/126', 'JEP 310: java.time Date and Time API. https://openjdk.org/jeps/310'],
    steps: [
      ['函数式接口只有一个抽象契约', 'Lambda 依赖目标类型确定参数和返回值，编译器把表达式绑定到函数式接口的单一抽象方法。方法引用是另一种写法，但都受重载解析、受检异常和变量捕获规则约束，不能脱离目标类型独立存在。', '先找目标函数式接口', {
        title: 'Java：Comparator Lambda 与方法引用',
        language: 'Java',
        code: `List<String> ids = new ArrayList<>(List.of("O-3", "O-1", "O-2"));
Comparator<String> legacy = new Comparator<String>() {
  public int compare(String left, String right) { return left.compareTo(right); }
};
Comparator<String> lambda = (left, right) -> left.compareTo(right);
Comparator<String> reference = String::compareTo;

ids.sort(reference);
System.out.println(ids);`,
        output: `[O-1, O-2, O-3]

三种写法适配同一 Comparator 抽象方法。Lambda 和方法引用都依赖目标类型。`,
      }],
      ['invokedynamic 延后绑定实现', 'JDK 8 编译器不会为每个 Lambda 生成独立匿名类，而是生成 invokedynamic 调用点，由 LambdaMetafactory 在运行时链接实现。这样减少类文件数量，但首次链接、捕获变量和类加载仍会影响启动。', '字节码与匿名类路径不同', {
        title: 'PowerShell：观察 Lambda 的 invokedynamic',
        language: 'PowerShell',
        code: `@'
import java.util.function.Function;
public class LambdaBytecode {
  public static void main(String[] args) {
    Function<Integer, Integer> plusOne = value -> value + 1;
    System.out.println(plusOne.apply(41));
  }
}
'@ | Set-Content LambdaBytecode.java
javac LambdaBytecode.java
javap -c -p LambdaBytecode | Select-String "invokedynamic|lambda"`,
        output: `0: invokedynamic #7,  0 // InvokeDynamic #0:apply:()Ljava/util/function/Function;
...
private static java.lang.Integer lambda$main$0(java.lang.Integer);

主方法通过 invokedynamic 链接函数对象，Lambda 体被编译成私有合成方法。`,
      }],
      ['Stream 把描述和消费分开', '中间操作构造惰性流水线，终端操作才触发遍历；短路操作可提前停止，排序与分组可能缓存数据。并行流使用公共 ForkJoinPool，阻塞 IO 和共享可变状态会破坏线程模型。', '区分惰性构建与终端消费', {
        title: 'Java 8：Stream 惰性与短路',
        language: 'Java',
        code: `Stream<Integer> stream = Stream.of(1, 2, 3, 4)
  .filter(value -> {
    System.out.println("filter:" + value);
    return value > 1;
  });
System.out.println("before-terminal");
System.out.println(stream.findFirst().orElseThrow());`,
        output: `before-terminal
filter:1
filter:2
2

构建流水线时不遍历；findFirst 命中 2 后短路，不再处理 3、4。`,
      }],
      ['Optional 只表达返回值缺失', 'Optional 设计目标是为可能没有结果的方法提供显式返回类型，适合组合 map、flatMap、orElseGet 和 ifPresent。不要把它作为字段、集合元素或所有参数的通用可空替代，也不要为了风格大量制造对象。', '缺失语义要贴近 API 契约', {
        title: 'Java 8：Optional 缺省分支',
        language: 'Java',
        code: `Optional<String> id = Optional.empty();
String display = id.map(value -> "#" + value).orElseGet(() -> "UNASSIGNED");
String required = id.orElseThrow(() -> new IllegalArgumentException("ID_REQUIRED"));
System.out.println(display);`,
        output: `UNASSIGNED
随后 required 抛出 ID_REQUIRED。

展示场景有合法默认值，必须存在场景明确失败；没有调用 get 绕过缺失处理。`,
      }],
      ['java.time 区分时间点与本地时间', 'Instant 表示时间线上的点，ZonedDateTime 绑定时区和规则，LocalDate 不含时间与时区，Duration 表示时间量。格式化解析要显式 Locale 和 ZoneId，且日期时间对象不可变，修改会返回新值。', '先选时间类型，再谈格式', {
        title: 'Java 8：Instant、LocalDate 与 ZonedDateTime',
        language: 'Java',
        code: `Instant instant = Instant.parse("2026-11-23T08:00:00Z");
LocalDate date = LocalDate.of(2026, 11, 23);
ZonedDateTime shanghai = instant.atZone(ZoneId.of("Asia/Shanghai"));

System.out.println(instant);
System.out.println(date.plusDays(1));
System.out.println(shanghai.withZoneSameInstant(ZoneId.of("UTC")));`,
        output: `2026-11-23T08:00:00Z
2026-11-24
2026-11-23T08:00Z[UTC]

Instant 是全球时间点，LocalDate 只有日期，ZonedDateTime 携带地区规则；修改都返回新对象。`,
      }],
    ],
  },
  {
    name: 'JDK 9：模块系统与 API 边界',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '熟练使用包、类路径、Maven/Gradle 和反射。',
    goal: '能编写 module-info，解释 requires、exports、opens 与模块路径的关系，并用 jdeps、jlink 和模块描述定位封装失败。',
    guidedPractice: '把一个双模块项目放入 src 目录，声明 module-info，用 javac --module-path 编译并用 java --module 启动；再用 jdeps 生成依赖图，观察未导出包被访问时的错误。',
    independentPractice: '为一个小型服务拆分 API 模块与实现模块，只导出公共包，为反射需求显式 opens，并用 jlink 生成最小运行时后启动测试。',
    commonErrors: ['把所有包都 exports/opens，只追求编译通过，导致模块边界形同虚设。', '混用类路径与模块路径后，用旧反射错误判断模块系统失效。'],
    sourceRefs: ['JEP 261: Module System. https://openjdk.org/jeps/261', 'Java Platform Module System API. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/module/package-summary.html'],
    steps: [
      ['模块声明依赖与可见性', 'module-info.java 的 requires 声明读模块依赖，exports 把公共包开放给编译和运行访问，opens 允许反射访问。模块名与包名不同，传递依赖可用 requires transitive，只有确实属于 API 的依赖才能传递暴露。', 'exports 和 opens 对应不同访问', {
        title: 'JDK 9：声明 API 模块',
        language: 'Java',
        code: `module com.example.orders.api {
  requires java.net.http;
  exports com.example.orders.api;
  opens com.example.orders.dto to com.fasterxml.jackson.databind;
}`,
        output: `公共包 com.example.orders.api 可被其他模块编译和运行访问。

dto 包只对 Jackson 开放反射，未列出的内部包保持强封装。`,
      }],
      ['模块路径形成可读性图', '启动时 JVM 解析根模块及其依赖，形成模块图；模块只能读取声明过的模块。类路径与模块路径同时存在时，未命名模块行为不同，很多隐性依赖会在改成模块项目后暴露；模块图与启动命令必须一起保存。', '先画出模块读取关系', {
        title: 'PowerShell：编译和启动模块项目',
        language: 'PowerShell',
        code: `javac --module-path out \
  -d out/com.example.orders.api src/com.example.orders.api/module-info.java src/com.example.orders.api/**.java
java --module-path out --module com.example.orders.api/com.example.orders.api.Main
"exit=$LASTEXITCODE"`,
        output: `模块 com.example.orders.api 被解析并启动 Main。
exit=0

若启动模块未 requires 某个读取依赖，编译或运行会直接报模块不可读，而不是类路径下的偶然碰巧加载。`,
      }],
      ['强封装限制反射访问', '未 opens 的包仍可能被深层反射访问限制，非法访问会抛 InaccessibleObjectException 或警告。迁移时用 jdeps 和运行时错误找真实需求，只对确实需要反射的包使用 opens，并限制使用者。', '反射白名单要尽量窄', {
        title: 'Java：反射失败与受控 opens',
        language: 'Java',
        code: `Class<?> type = Class.forName("com.example.orders.internal.OrderRow");
var ctor = type.getDeclaredConstructor();
ctor.setAccessible(true);
System.out.println(ctor.newInstance());`,
        output: `未 opens 的模块包可能抛 InaccessibleObjectException。

修复时把 module-info 改为 opens com.example.orders.internal to framework.module，而不是对所有模块全局 opens。`,
      }],
      ['jdeps 先展示迁移事实', 'jdeps 能列出模块依赖、缺失模块和 JDK 内部 API 使用，jlink 可按模块图创建运行时镜像。工具输出要固定 JDK 和项目版本，再根据错误补充模块声明，不能凭包名猜依赖。', '先测量依赖，再改声明', {
        title: 'PowerShell：用 jdeps 生成模块依赖',
        language: 'PowerShell',
        code: `jdeps --multi-release 21 --print-module-deps out
jdeps --module-path out --module com.example.orders.api -summary
jdeps --class-path "libs/*" --print-module-deps app.jar`,
        output: `java.base,java.logging,java.net.http
com.example.orders.api -> java.base
com.example.orders.api -> java.net.http

先得到依赖事实，再写 module-info / jlink 参数。`,
      }],
      ['jlink 验证最小运行时', 'jlink 只包含模块图中的模块和依赖，裁剪后的镜像缺少反射、资源或服务提供者时，应在干净环境启动而非只在 IDE 测试。把启动命令、模块列表和失败日志保存为发布证据。', '裁剪边界要实际启动验证', {
        title: 'PowerShell：用 jlink 生成最小运行时',
        language: 'PowerShell',
        code: `jlink --module-path "$env:JAVA_HOME\\jmods;out" \
  --add-modules com.example.orders.api \
  --strip-debug --no-header-files --no-man-pages \
  --output runtime-orders
.\\runtime-orders\\bin\\java --module com.example.orders.api/com.example.orders.api.Main
"exit=$LASTEXITCODE"`,
        output: `runtime-orders 只含模块图所需 JDK 模块和应用模块。
应用成功启动，exit=0。

若缺少服务提供者或反射资源，干净运行时启动会失败；补模块或服务声明后重新生成。`,
      }],
    ],
  },
  {
    name: 'JDK 10-11：var 与 HttpClient',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握类型推断、泛型、异常处理和 HTTP 基本概念。',
    goal: '能正确使用局部变量类型推断，理解 java.net.http.HttpClient 的连接复用、异步 CompletableFuture、超时和错误边界。',
    guidedPractice: '用 var 声明局部变量但保持公开方法签名显式，再创建 HttpClient，执行同步 send 和异步 sendAsync，分别设置连接超时、请求超时并记录状态码与响应头。',
    independentPractice: '实现一个带重试预算、取消和结构化日志的 HTTP 客户端，覆盖 DNS 失败、连接超时、读取超时、4xx 和 5xx，不得把响应体错误当成网络异常。',
    commonErrors: ['把 var 当成动态类型，或在字段、方法参数中期待它工作。', '只设置 connectTimeout 就以为覆盖整个请求，忽略读取响应和处理超时后的资源释放。'],
    sourceRefs: ['JEP 286: Local-Variable Type Inference. https://openjdk.org/jeps/286', 'Java SE 21 HttpClient API. https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html'],
    steps: [
      ['var 只推断局部变量静态类型', '编译器根据初始化表达式推断变量类型，之后仍然是静态类型检查；var 不能用于字段、构造器参数或无初始化的局部变量。可读性取决于右侧表达式是否已清楚表达类型，泛型嵌套过深时可以保留显式类型。', '减少重复，不隐藏契约', {
        title: 'JDK 10：var 推断与静态检查',
        language: 'Java',
        code: `var count = 3;
var total = count * 1.5;
var rows = new ArrayList<String>();
rows.add("O-1");
System.out.println(((Object) total).getClass().getSimpleName());
// total = "text"; // 编译失败`,
        output: `Double

var 推断出 int、double 和 ArrayList<String>，之后仍是静态类型。改成字符串会编译失败。`,
      }],
      ['HttpClient 管理连接与协议', 'HttpClient 由 builder 建立，可配置 HTTP 版本、代理、认证和执行器；连接池与 TLS 会话在客户端生命周期内复用。频繁创建新客户端会损失复用，长期持有则要实现关闭和线程池收口。', '客户端是生命周期对象', {
        title: 'JDK 11：HttpClient 同步请求',
        language: 'Java',
        code: `HttpClient client = HttpClient.newBuilder()
  .version(HttpClient.Version.HTTP_1_1)
  .connectTimeout(Duration.ofSeconds(2))
  .build();

HttpRequest request = HttpRequest.newBuilder(URI.create("https://example.com/health"))
  .timeout(Duration.ofSeconds(3))
  .GET()
  .build();

HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
System.out.println(response.statusCode());`,
        output: `200

客户端负责连接池/TLS 复用，请求设置响应超时。send 同步阻塞调用线程。`,
      }],
      ['请求超时与连接超时分层', 'connectTimeout 约束建立连接，HttpRequest.timeout 约束收到响应的时间，业务总预算还要覆盖解析和处理。异步 sendAsync 返回 CompletableFuture，超时、取消和非 2xx 状态要分别处理。', '连接、请求和业务预算分开', {
        title: 'JDK 11：异步请求总超时',
        language: 'Java',
        code: `CompletableFuture<HttpResponse<String>> future = client.sendAsync(
  request,
  BodyHandlers.ofString()
);
HttpResponse<String> response = future
  .orTimeout(4, TimeUnit.SECONDS)
  .join();
System.out.println(response.statusCode());`,
        output: `200 或 TimeoutException

connectTimeout、HttpRequest.timeout 和调用方总超时分别生效。orTimeout 改变 Future 结果，但不保证底层已关闭。`,
      }],
      ['状态码与异常类型要分开', 'DNS、连接、TLS 失败通常以 IOException 或 CompletionException 出现，4xx/5xx 仍是有效 HTTP 响应。只有调用方显式把状态码转成异常，重试策略才能区分永久客户端错误和可重试服务端错误。', 'HTTP 响应不等于成功', {
        title: 'JDK 11：区分网络异常与 5xx',
        language: 'Java',
        code: `try {
  HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
  if (response.statusCode() >= 500) {
    System.out.println("retryable-http:" + response.statusCode());
  } else if (response.statusCode() >= 400) {
    System.out.println("client-error:" + response.statusCode());
  }
} catch (IOException error) {
  System.out.println("network:" + error.getClass().getSimpleName());
} catch (InterruptedException error) {
  Thread.currentThread().interrupt();
}`,
        output: `retryable-http:503 或 client-error:404 或 network:ConnectException

HTTP 响应和网络异常走不同分支，重试策略才能区分 5xx、4xx 与连接失败。`,
      }],
      ['执行器与资源释放要可测', '为异步客户端提供有界 executor，记录线程名、请求 ID 和耗时；在 finally 或 CompletionStage 回调中取消订阅并清理上下文。关闭客户端后测试线程和连接能退出，避免每次失败创建新的永久线程。', '异步链路也要能关闭', {
        title: 'JDK 11：异步客户端使用有界线程池',
        language: 'Java',
        code: `ExecutorService executor = Executors.newFixedThreadPool(4);
HttpClient client = HttpClient.newBuilder().executor(executor).build();

CompletableFuture<HttpResponse<String>> future =
  client.sendAsync(request, BodyHandlers.ofString())
    .thenApply(response -> {
      System.out.println("thread=" + Thread.currentThread().getName());
      return response;
    });
future.join();
executor.shutdown();
executor.awaitTermination(5, TimeUnit.SECONDS);`,
        output: `thread=pool-1-thread-1

异步回调在客户端执行器上运行。关闭执行器并有界等待，避免线程永久存活。`,
      }],
    ],
  },
  {
    name: 'JDK 15：文本块与可读配置',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '熟悉字符串、转义、SQL/JSON 和源代码编码。',
    goal: '能解释文本块的公共缩进、转义和换行规则，使用文本块表达多行常量而不破坏动态值的安全边界。',
    guidedPractice: '把一段多行 SQL、JSON 和 HTML 改写为文本块，分别测试普通换行、反斜杠续行、\\s 尾随空格和变量拼接；用 javap 或运行时输出比较实际字符。',
    independentPractice: '为一个查询配置构建器编写文本块模板，保留参数占位符而非拼接用户值，并补充 Windows/Linux 换行、空行和特殊字符测试。',
    commonErrors: ['以为文本块会自动做 SQL 参数化，继续把用户输入拼进字符串。', '忽略公共缩进剥离规则，导致 JSON 或缩进敏感语言出现看不见的空格差异。'],
    sourceRefs: ['JEP 378: Text Blocks. https://openjdk.org/jeps/378', 'Java SE 21 String API. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html'],
    steps: [
      ['公共缩进按内容计算', '文本块的内容从开头分隔符后的换行开始，编译器计算非空行和结束分隔符的最小缩进，再剥离这一公共前缀。结果取决于所有行的空白，不是编辑器视觉对齐；需要保留缩进时要用相对空格或转义。', '缩进由整块共同决定', {
        title: 'JDK 15：文本块与公共缩进',
        language: 'Java',
        code: `String json = """
    {
      "id": "O-1",
      "paid": true
    }
    """;
System.out.println(json);
System.out.println(json.startsWith("{"));`,
        output: `{
  "id": "O-1",
  "paid": true
}
true

四行共同的 4 个空格被剥离，剩余两空格缩进保留在 JSON 内部。`,
      }],
      ['显式转义解决边界字符', '\\ 续行可避免在结果中插入换行，\\s 保留受缩进处理影响的空格，开头和结尾空白也可用转义表达。文本块仍会处理普通反斜杠和双引号，Windows 换行在编译器中归一化，持久化前要检查实际字符。', '看不见的字符也要断言', {
        title: 'JDK 15：续行与受保护空格',
        language: 'Java',
        code: `String joined = """
    alpha \\
    beta
    """;
String spaced = """
    [\\s\\s]
    """;
System.out.println(joined.replace("\\n", "\\\\n"));
System.out.println(spaced.length());
System.out.println(spaced.chars().anyMatch(ch -> ch == ' '));`,
        output: `alpha beta
6
true

反斜杠续行不插入换行；\\s 明确保留行尾/行首空格。实际字符用码点断言。`,
      }],
      ['文本块不做模板插值', '文本块只是更可读的 String 字面量，不执行变量替换、SQL 转义或 JSON 解析。动态值必须通过 PreparedStatement、JSON 序列化器或安全模板传递，不能因为内容排版清晰就跳过验证。', '可读格式不等于安全值', {
        title: 'JDK 15：文本块 SQL 仍使用参数绑定',
        language: 'Java',
        code: `String sql = """
    SELECT id, status, total_cents
    FROM orders
    WHERE customer_id = ? AND status = ?
    """;
try (PreparedStatement statement = connection.prepareStatement(sql)) {
  statement.setString(1, customerId);
  statement.setString(2, "PAID");
  try (ResultSet rows = statement.executeQuery()) {
    while (rows.next()) System.out.println(rows.getString("id"));
  }
}`,
        output: `SQL 结构保持可读，customerId 通过占位符绑定，不会被拼进 SQL 文本。

文本块没有自动 SQL 转义；若改成用户值拼接，仍会产生注入风险。`,
      }],
      ['解析结果而不是看编辑器', '测试应打印长度、码点、空行和关键 whitespace，最好比较预期字符串而非只看肉眼对齐。JSON 用解析器验证结构，SQL 用实际参数绑定测试，HTML 用模板引擎或转义器检查。', '解析器验证结构，断言验证字符', {
        title: 'JDK 15：解析文本块 JSON',
        language: 'Java',
        code: `String payload = """
    {
      "id": "O-1",
      "items": ["A", "B"]
    }
    """;
JsonNode node = objectMapper.readTree(payload);
System.out.println(node.get("items").size());
System.out.println(payload.lines().count());`,
        output: `2
4

JSON 解析器验证结构，字符串断言验证行数和关键字符；不能只靠编辑器对齐判断内容正确。`,
      }],
      ['把配置片段限制在边界内', '多行常量适合固定查询结构、脚本片段和测试夹具，不适合承载秘密、用户数据或频繁变化的业务规则。将模板放在明确模块，限制长度和来源，变更时执行注入、编码和国际化回归；来源变更要经过代码审查。', '常量越界会变成注入面', {
        title: 'Markdown：文本块使用边界卡',
        language: 'Markdown',
        code: `允许：
- 固定 SQL 结构，参数使用 ?
- JSON/HTML 测试夹具
- 运维脚本静态帮助文本

禁止：
- 真实密码、Token
- 拼接用户输入
- 未转义 HTML
- 频繁变化的业务规则`,
        output: `文本块只改善排版，不改变字符串安全边界。

所有动态值仍使用参数绑定、序列化器或模板转义，并对超长模板设置审查。`,
      }],
    ],
  },
  {
    name: 'JDK 16：Record 数据建模',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握类、构造器、equals/hashCode、泛型和序列化基础。',
    goal: '能使用 Record 表达透明数据载体，解释生成组件、规范构造器和 equals/hashCode，并处理浅不可变与序列化边界。',
    guidedPractice: '定义 OrderSnapshot 和 Address 两个 Record，用 javap -p 查看访问器与构造器；在紧凑构造器中校验金额和币种，测试集合组件被调用方修改后的对象相等性。',
    independentPractice: '把一个传输用 POJO 改成 Record，补嵌套集合防御性复制、JSON 绑定和 API 兼容测试，并说明不适合改成 Record 的有状态领域对象。',
    commonErrors: ['认为 Record 的集合组件自动深度不可变，调用方仍能修改内部 List。', '为 Record 添加可变 setter 或依赖可继承性，破坏透明数据结构语义。'],
    sourceRefs: ['JEP 395: Records. https://openjdk.org/jeps/395', 'Java SE 21 Record API. https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html'],
    steps: [
      ['组件生成访问器与结构相等', 'Record 头部每个组件生成同名访问器，并自动形成 equals、hashCode 和 toString 的结构语义。类型是 final，不能声明额外实例字段；如果需要继承体系或可变状态，应使用普通类。', 'Record 表达透明值', {
        title: 'JDK 16：Record 生成成员',
        language: 'Java',
        code: `record OrderId(String value) {}

OrderId first = new OrderId("O-1");
OrderId same = new OrderId("O-1");
System.out.println(first.value());
System.out.println(first.equals(same));
System.out.println(first);`,
        output: `O-1
true
OrderId[value=O-1]

访问器、结构相等和 toString 自动生成；Record 类型为 final。`,
      }],
      ['紧凑构造器集中校验', '规范构造器可以用紧凑形式接收隐式参数，校验后给字段赋值，非法输入在对象创建时就失败。校验不能只放在访问器里，否则对象可能以非法状态存在；集合校验还应防御性复制；数组同样必须复制后再保存。', '非法值不能进入实例', {
        title: 'JDK 16：Record 紧凑构造器校验',
        language: 'Java',
        code: `record Payment(String id, long cents) {
  Payment {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("ID");
    if (cents <= 0) throw new IllegalArgumentException("AMOUNT");
  }
}

try {
  new Payment("P-1", 0);
} catch (IllegalArgumentException error) {
  System.out.println(error.getMessage());
}`,
        output: `AMOUNT

非法金额在对象创建前失败。校验放在构造器，所有访问器和下游方法都能信任状态合法。`,
      }],
      ['浅不可变需要主动复制', 'Record 的 final 字段只阻止重新绑定，List、Map 和数组仍可被外部修改。构造器复制为不可变集合、访问器返回只读视图或副本，测试调用方修改原集合后 Record 的相等与哈希保持稳定。', '冻结引用不等于冻结内容', {
        title: 'JDK 16：Record 集合组件防御性复制',
        language: 'Java',
        code: `record Order(String id, List<String> items) {
  Order {
    items = List.copyOf(items);
  }
}

List<String> source = new ArrayList<>(List.of("A"));
Order order = new Order("O-1", source);
source.add("B");
System.out.println(order.items());`,
        output: `[A]

构造时复制，外部再修改 source 不影响 Record。List.copyOf 返回不可变列表。`,
      }],
      ['Pattern matching 要按版本使用', 'JDK 16 正式化 instanceof 模式匹配，但 switch 的模式匹配在后续版本经历预览。升级迁移时要查看 JEP 状态和编译参数，不能把预览语法带进只支持旧版的生产工具链。', '特性状态要绑定 JDK', {
        title: 'JDK 16：instanceof 模式匹配',
        language: 'Java',
        code: `Object value = new Payment("P-1", 4200);
if (value instanceof Payment payment) {
  System.out.println(payment.cents());
} else {
  System.out.println("UNKNOWN");
}`,
        output: `4200

检查通过后 payment 已绑定为 Payment，无需强转。switch 模式匹配在 JDK 16 仍是后续预览能力。`,
      }],
      ['序列化与框架契约另测', 'Record 可被部分序列化框架支持，但构造器校验、组件名和 JSON 字段映射仍需实际测试。API 变更时，调用方依赖的是字段名和结构；用契约测试和最小兼容样本验证序列化往返。', '语言结构不等于框架契约', {
        title: 'JDK 16：Record JSON 往返',
        language: 'Java',
        code: `ObjectMapper mapper = new ObjectMapper()
  .registerModule(new ParameterNamesModule());

Order order = new Order("O-1", List.of("A", "B"));
String json = mapper.writeValueAsString(order);
Order restored = mapper.readValue(json, Order.class);
System.out.println(json);
System.out.println(order.equals(restored));`,
        output: `{"id":"O-1","items":["A","B"]}
true

框架版本和模块决定 Record 支持。JSON 字段、构造器校验和不可变集合都要实际往返测试。`,
      }],
    ],
  },
  {
    name: 'JDK 17：sealed 与模式匹配',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 Record、接口、继承和 switch 课程，能配置目标 JDK。',
    goal: '能用 sealed 类型限制实现者，结合 instanceof 模式和模式 switch 表达穷尽状态分支，并识别预览特性的工具链限制。',
    guidedPractice: '定义 sealed interface PaymentResult permits Success, Declined, Pending，用 instanceof 和 switch 处理状态；新增一个实现但不更新 permits 或分支，记录编译器错误。',
    independentPractice: '把订单状态从字符串常量重构为 sealed 层次，补从数据库恢复、未知状态和 API 序列化测试，并保留不支持预览语法的回退实现。',
    commonErrors: ['以为 sealed 自动让所有使用处穷尽，忽略 switch 仍需覆盖全部许可类型。', '在只支持 JDK 17 正式特性的构建中启用预览语法，导致编译器和运行时版本漂移。'],
    sourceRefs: ['JEP 409: Sealed Classes. https://openjdk.org/jeps/409', 'JEP 394: Pattern Matching for instanceof. https://openjdk.org/jeps/394'],
    steps: [
      ['permits 建立封闭实现集合', 'sealed 类型通过 permits 声明允许的直接子类型，子类型必须是 final、sealed 或 non-sealed。它限制的是 Java 类型扩展边界，不自动限制对象字段或状态迁移规则；公共 API 要考虑后续增加分支的兼容策略。', '封闭的是类型，不是业务行为', {
        title: 'JDK 17：sealed 接口的 permits',
        language: 'Java',
        code: `sealed interface PaymentResult permits Success, Declined {}
record Success(String id) implements PaymentResult {}
record Declined(String code) implements PaymentResult {}

// class Pending implements PaymentResult {} // 编译失败：不在 permits
System.out.println(new Success("P-1"));`,
        output: `Success[id=P-1]

未列出的实现类型无法编译。子类型本身必须是 final、sealed 或 non-sealed。`,
      }],
      ['instanceof 模式合并检查与绑定', 'if (obj instanceof Success success) 在检查通过时把值绑定到新变量，作用域由编译器控制，避免重复强转。模式变量仍可捕获 null 之外的错误分支，但 null 本身不会匹配任何具体类型。', '检查通过才产生绑定', {
        title: 'JDK 17：instanceof 模式绑定',
        language: 'Java',
        code: `Object value = new Declined("RISK");
if (value instanceof Success success) {
  System.out.println("ok:" + success.id());
} else if (value instanceof Declined declined) {
  System.out.println("declined:" + declined.code());
} else {
  System.out.println("unknown");
}`,
        output: `declined:RISK

检查通过后自动绑定，无需 (Declined) 强转；null 不会匹配具体类型。`,
      }],
      ['模式 switch 要核对正式版本', 'JDK 17 中 switch 模式匹配仍是预览特性，需用 --enable-preview 编译并在同一版本运行；JDK 21 才正式化更完整能力。穷尽检查依赖编译器版本，生产构建必须锁定 JDK、语言级别和发布运行时。', '预览不是长期兼容承诺', {
        title: 'PowerShell：JDK 17 预览模式 switch',
        language: 'PowerShell',
        code: `javac --release 17 --enable-preview PreviewSwitch.java
java --enable-preview PreviewSwitch`,
        output: `编译和运行都必须使用 --enable-preview。

若生产运行只安装普通 JDK 17 而未启用预览，类会失败。升级到 JDK 21 时应核对正式语法再移除标记。`,
      }],
      ['穷尽分支保护新增状态', '新增许可类型时，switch 没有默认分支应产生编译错误，迫使开发者处理。若为了兼容保留 default，可能把新状态静默归入未知分支；测试要枚举每个类型和 null，并记录 API 反序列化未知值的行为。', '让编译器提醒遗漏分支', {
        title: 'Java：穷尽模式分支',
        language: 'Java',
        code: `static String describe(PaymentResult result) {
  return switch (result) {
    case Success success -> "ok:" + success.id();
    case Declined declined -> "declined:" + declined.code();
  };
}

System.out.println(describe(new Success("P-1")));`,
        output: `ok:P-1

若 permits 新增 Pending 而 switch 未处理，编译器直接失败，不会静默返回 unknown。`,
      }],
      ['重构完成后保留边界测试', '状态重构后检查数据库映射、JSON 序列化、旧客户端和国际化的兼容性。只在测试类中追求模式匹配会掩盖外部契约；上线前用真实样本做往返，并保留旧状态字符串到新类型的迁移表。', '类型穷尽还要外部输入兼容', {
        title: 'Java + JUnit：旧状态字符串迁移',
        language: 'Java',
        code: `static PaymentResult parse(String status) {
  return switch (status) {
    case "SUCCESS" -> new Success("legacy-ok");
    case "DECLINED" -> new Declined("legacy-declined");
    default -> throw new IllegalArgumentException("UNKNOWN_STATUS:" + status);
  };
}

assertEquals(new Declined("legacy-declined"), parse("DECLINED"));
assertThrows(IllegalArgumentException.class, () -> parse("REFUNDED"));`,
        output: `旧数据库字符串可映射到新类型，未知状态明确失败。

若未来新增 Refunded，必须同时补迁移解析和 API 兼容测试。`,
      }],
    ],
  },
  {
    name: 'JDK 21：Virtual Threads 与并发迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '完成 J3 虚拟线程、线程池、Spring MVC 和连接池课程。',
    goal: '能在 JDK 21 中迁移阻塞请求模型，识别载体固定、ThreadLocal、连接池和结构化并发预览的边界，并完成压测回滚。',
    guidedPractice: '把一个使用固定平台线程池的 HTTP 服务改为每请求虚拟线程，使用 JFR 采集虚拟线程与 pinning 事件，比较吞吐、P99、连接池等待和线程数。',
    independentPractice: '制定 JDK 21 虚拟线程迁移计划，列出代码入口、第三方库、线程本地、执行器、数据库连接、监控和回滚开关，并用故障注入验证取消。',
    commonErrors: ['为了“复用”把虚拟线程放进固定池，失去线程每请求模型的优势。', '迁移后不限制数据库和下游并发，虚拟线程越多，排队和超时越严重。'],
    sourceRefs: ['JEP 444: Virtual Threads. https://openjdk.org/jeps/444', 'JEP 453: Structured Concurrency Preview. https://openjdk.org/jeps/453'],
    steps: [
      ['JDK 21 虚拟线程已正式化', 'JEP 444 在 JDK 21 正式提供虚拟线程，Thread.ofVirtual、Thread.startVirtualThread 和 newVirtualThreadPerTaskExecutor 可用于每任务一线程。结构化并发仍是预览 API，不能把两者当成同一稳定级别。', '先核对每个 API 的状态', {
        title: 'JDK 21：虚拟线程执行器',
        language: 'Java',
        code: `try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  List<Future<String>> tasks = new ArrayList<>();
  for (int i = 0; i < 1000; i++) {
    int id = i;
    tasks.add(executor.submit(() -> {
      Thread.sleep(50);
      return "task-" + id;
    }));
  }
  System.out.println(tasks.get(0).get());
}`,
        output: `task-0

虚拟线程是 JDK 21 正式特性；try-with-resources 关闭执行器并等待任务收口。`,
      }],
      ['阻塞 IO 释放载体线程', '虚拟线程执行阻塞操作时，JVM 可以把任务从载体线程卸载，恢复后重新挂载。CPU 计算、锁等待和某些本地调用仍占载体；迁移前用 JFR 和压测确认阻塞点真的能卸载。', '载体线程才是执行资源', {
        title: 'PowerShell：JFR 观察虚拟线程固定',
        language: 'PowerShell',
        code: `java -XX:StartFlightRecording=filename=vt.jfr,settings=profile,duration=60s \
  -cp app.jar com.example.VirtualThreadDemo
jfr print --events jdk.VirtualThreadPinned,jdk.VirtualThreadStart vt.jfr \
  > virtual-threads.txt
Select-String -Path virtual-threads.txt -Pattern "jdk.VirtualThreadPinned|stackTrace" -Context 0,6`,
        output: `jdk.VirtualThreadPinned {
  eventThread = "virtual-42"
  duration = 820 ms
  stackTrace = [ ... synchronized ... ]
}

固定事件说明载体被长时间占用。迁移前要结合代码和库版本消除固定点。`,
      }],
      ['固定载体事件要专项观察', 'JFR 可记录虚拟线程固定事件，帮助定位 synchronized 内长阻塞或受限本地调用。JDK 21 的固定规则和后续版本可能变化，报告必须写 JDK、库版本和调用栈，不能沿用旧版结论。', '用版本化事件定位固定', {
        title: 'Java：避免在 synchronized 内长阻塞',
        language: 'Java',
        code: `try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  for (int i = 0; i < 100; i++) {
    executor.submit(() -> {
      synchronized (legacyLock) {
        Thread.sleep(1000);
      }
    });
  }
}`,
        output: `大量虚拟线程在 synchronized 内阻塞时，载体线程可能被固定，无法充分卸载。

修复方向是缩小同步区、使用 ReentrantLock 或把阻塞操作移到锁外，并用 JFR 复测。`,
      }],
      ['连接池决定真实并发上限', 'ThreadLocal 缓存、数据库池、HTTP 连接池和文件句柄都随并发请求增长。为每类外部资源设置明确上限和获取超时，使用 bulkhead 或 semaphore 保护，虚拟线程不应被用作绕过下游容量的手段。', '虚拟线程不扩容外部资源', {
        title: 'Java 21：Semaphore 保护数据库',
        language: 'Java',
        code: `Semaphore db = new Semaphore(20);
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
  for (int i = 0; i < 1000; i++) {
    executor.submit(() -> {
      db.acquire();
      try { return repository.query(i); }
      finally { db.release(); }
    });
  }
}`,
        output: `同一时刻最多 20 个任务进入数据库，其他虚拟线程在 Semaphore 上等待。

虚拟线程降低等待线程成本，但数据库连接和 SQL 容量仍是硬上限。`,
      }],
      ['灰度、观测与回滚成组', '先在低流量服务启用虚拟线程执行器，观测载体 CPU、固定事件、连接等待、P99 和错误率，再逐步扩大。保留配置开关和平台线程池实现，出现下游过载或线程本地内存异常时可快速回退。', '迁移必须可灰度可回滚', {
        title: 'Markdown：虚拟线程灰度检查表',
        language: 'Markdown',
        code: `开关：virtual-thread-executor=true/false
灰度：1% -> 10% -> 50% -> 100%

观测：
- 载体 CPU 和 run queue
- jdk.VirtualThreadPinned 数量/时长
- Hikari pending 和 timeout
- P99、错误率、RSS

回退：配置切回平台线程池，无数据迁移`,
        output: `每一步都有继续与回退条件。

如果固定事件或连接等待持续升高，停止扩大流量并切回已验证的平台线程池。`,
      }],
    ],
  },
  {
    name: 'JDK 迁移矩阵与兼容性验证',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '熟悉 Maven/Gradle、依赖管理、模块、反射、JVM 参数和集成测试。',
    goal: '能建立源码、字节码、依赖、反射、模块、JVM 与容器的迁移矩阵，用工具和测试证明目标 JDK 兼容而非只编译成功。',
    guidedPractice: '对样例项目执行 jdeps、jdeprscan 和依赖树，检查 JDK 内部 API、废弃 API 与第三方版本；在目标 JDK 运行单元、集成、启动和压测，记录每类失败。',
    independentPractice: '为一个 JDK 8 服务制定到 JDK 21 的迁移计划，包含依赖替换、编译目标、反射扫描、GC/容器参数、灰度、回滚和数据兼容验证。',
    commonErrors: ['只把 maven.compiler.release 改成 21，就认为旧依赖、反射和运行时参数也兼容。', '在开发机升级 JDK 成功一次，没有在容器内存限制、时区、字符集和生产启动命令下验证。'],
    sourceRefs: ['Oracle JDK Migration Guide. https://docs.oracle.com/en/java/javase/21/migrate/', 'Java SE 21 Tools Reference. https://docs.oracle.com/en/java/javase/21/docs/specs/man/'],
    steps: [
      ['迁移矩阵从五层展开', '矩阵至少包含源码语法、目标字节码、第三方依赖、反射/模块运行时和 JVM/容器参数。每层记录当前值、目标值、验证命令和负责人；编译通过只覆盖其中一部分，不能等同于可发布。', '语言、依赖、运行时分层迁移', {
        title: 'Markdown：JDK 21 迁移矩阵',
        language: 'Markdown',
        code: `| 层 | 当前 | 目标 | 验证 |
|---|---|---|---|
| 源码 | Java 8 | Java 21 | mvn test |
| 字节码 | --release 8 | --release 21 | javap -v |
| 依赖 | Spring 5 | Spring 6 | dependency:tree |
| 反射 | 未 opens | module-info | 启动测试 |
| JVM | G1/Xmx1g | ZGC/Xmx1g | 压测 |`,
        output: `每一层都有当前值、目标值和验证命令。

只改 compiler release 不会自动验证依赖、反射、JVM 参数和容器行为。`,
      }],
      ['用工具发现静态不兼容', 'jdeprscan 查找已废弃 API，jdeps 分析模块和 JDK 内部依赖，依赖解析工具定位传递版本冲突。工具报告要固定版本和扫描参数，输出完整类名与调用点，再逐项判断替代 API。', '扫描结果要落到源码位置', {
        title: 'PowerShell：扫描废弃 API 与模块依赖',
        language: 'PowerShell',
        code: `jdeprscan --release 21 target/app.jar > deprecated.txt
jdeps --multi-release 21 --ignore-missing-deps \
  --print-module-deps target/app.jar > modules.txt
mvn dependency:tree > dependencies.txt
Get-Content deprecated.txt,modules.txt,dependencies.txt | Select-String "WARNING|java.base|CONFLICT"`,
        output: `deprecated.txt：列出已废弃 JDK API 和类
modules.txt：java.base,java.logging,java.net.http
dependencies.txt：发现 Spring 5 与 Jakarta API 冲突

扫描输出绑定 JDK 21，迁移计划据此逐项替换。`,
      }],
      ['运行测试覆盖反射与序列化', '动态代理、JSON 库、字节码增强和框架反射经常在编译后失败。补充启动、代理、序列化往返、数据库驱动、消息客户端和安全管理测试，在目标 JDK 与容器限制中执行；测试失败需输出 JDK 与依赖版本。', '编译之外还要运行真实拓扑', {
        title: 'PowerShell：目标 JDK 运行真实拓扑',
        language: 'PowerShell',
        code: `docker run --rm --memory=1g --cpus=2 \
  -e JAVA_TOOL_OPTIONS="-Xms512m -Xmx512m" \
  -p 8080:8080 orders-api:jdk21
curl.exe --fail http://127.0.0.1:8080/actuator/health
mvn verify -Pintegration-tests
docker stop orders-api`,
        output: `容器使用目标 JDK 21、固定内存和 CPU。
/actuator/health 返回 200，集成测试覆盖数据库、消息和序列化。

开发机裸跑成功不能替代容器和生产启动参数验证。`,
      }],
      ['JVM 与容器参数重新验证', '新 JDK 的默认回收器、容器感知、类数据共享、反射限制和本地内存行为可能变化。用相同负载比较 GC、启动、线程和 RSS，删除已废弃参数，确认健康检查和优雅停机仍有效。', '运行时参数也是迁移代码', {
        title: 'PowerShell：检查废弃 JVM 参数',
        language: 'PowerShell',
        code: `java -Xms512m -Xmx512m -XX:+PrintFlagsFinal -version 2> flags.txt
Select-String -Path flags.txt -Pattern "deprecated|ignored|warning" -Context 0,1
docker run --rm orders-api:jdk8 java -version
docker run --rm orders-api:jdk21 java -version`,
        output: `JDK 21 启动日志可能提示某个旧 GC 参数已废弃或被忽略。

对比 JDK 8/21 镜像版本并删掉废弃参数，再跑 GC、启动、RSS 和优雅停机回归。`,
      }],
      ['灰度与回滚不可省', '先在新旧 JDK 并行运行小流量，比较业务结果、错误、延迟和资源；固定镜像摘要与回滚制品，若依赖反射或性能回归立即切回。迁移完成后保留目标版本矩阵和重新评估条件；缺少回滚制品不得扩大流量。', '上线用流量证明兼容', {
        title: 'Markdown：双版本灰度卡',
        language: 'Markdown',
        code: `旧版：orders-api:jdk8-sha256
新版：orders-api:jdk21-sha256
流量：1% -> 10% -> 50%

验收：
- 业务结果一致
- 错误率不高于旧版
- P99 < 200ms
- RSS < 1.5GB

回滚：将 Deployment image 切回旧 digest`,
        output: `两个版本都固定镜像摘要，灰度阶段比较业务和资源。

反射失败、启动异常或性能超门槛时按发布单切回旧 digest。`,
      }],
    ],
  },
];

const J6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Spring IoC 与 BeanDefinition',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成注解、反射、代理和依赖注入基础课程，能调试 Spring Boot 应用。',
    goal: '能区分 BeanDefinition 与 Bean 实例，解释注册、作用域、懒加载和工厂方法，并动态注册一个有明确生命周期的 Bean。',
    guidedPractice: '在 DefaultListableBeanFactory 中注册一个 BeanDefinition，指定类、作用域和初始化方法；再用 getBean 获取实例，检查同一 singleton 的引用是否相同、prototype 是否每次新建。',
    independentPractice: '实现一个插件注册器，在运行时按配置注册 Service Bean，校验名称冲突、缺少依赖和销毁回调，并对比显式配置与动态注册的可维护性。',
    commonErrors: ['把 BeanDefinition 当成已经创建的对象，修改定义后仍期待旧 singleton 自动重建。', '用相同名称注册多个 Bean 却不开启覆盖，导致启动失败或悄悄覆盖依赖。'],
    sourceRefs: ['Spring Framework, BeanFactory and BeanDefinition. https://docs.spring.io/spring-framework/reference/core/beans/definition.html', 'Spring Framework source, spring-beans factory support. https://github.com/spring-projects/spring-framework/tree/main/spring-beans/src/main/java/org/springframework/beans/factory/support'],
    steps: [
      ['BeanDefinition 是创建配方', 'BeanDefinition 保存类名、作用域、构造参数、属性值、初始化/销毁方法、懒加载和候选依赖等元数据，容器在需要实例时才按定义创建。它描述如何得到 Bean，不等于堆中的对象，也不承诺每次访问都返回同一个实例。', '定义是配方，实例是产物', {
        title: 'Spring：动态注册 BeanDefinition',
        language: 'Java',
        code: `DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
BeanDefinition definition = BeanDefinitionBuilder
  .genericBeanDefinition(OrderService.class)
  .setScope(BeanDefinition.SCOPE_SINGLETON)
  .addConstructorArgValue(repository)
  .getBeanDefinition();
factory.registerBeanDefinition("orderService", definition);
System.out.println(factory.getBean(OrderService.class));`,
        output: `OrderService@...

BeanDefinition 先进入注册表，getBean 时才创建实例。定义名称和依赖必须可预测。`,
      }],
      ['注册表与工厂共同保存状态', 'BeanDefinitionRegistry 负责名称到定义的映射，DefaultListableBeanFactory 同时实现注册和实例创建。后置处理器可以修改定义，名称冲突、别名为空定义和父定义解析在建图阶段就要验证，越晚发现越难定位。', '先检查定义图，再看对象图', {
        title: 'Spring：名称冲突显式失败',
        language: 'Java',
        code: `factory.registerBeanDefinition("orderService", first);
factory.registerBeanDefinition("orderService", second);
System.out.println(factory.getBeanDefinitionNames().length);

// 默认 allowBeanDefinitionOverriding=false 时重复注册失败`,
        output: `若允许覆盖，第二个定义替换第一个，旧 singleton 可能继续存在。

若禁止覆盖，启动阶段直接报 BeanDefinitionOverrideException。生产应保持禁止覆盖。`,
      }],
      ['作用域改变对象身份', 'singleton 在同一 BeanFactory 内通常只创建一个实例，prototype 每次请求创建新对象；Web 作用域还依赖请求上下文。prototype 的销毁不会由容器自动完整管理，持有昂贵资源的对象要显式关闭或改成受管作用域。', '作用域决定生命周期与销毁责任', {
        title: 'Spring：比较 singleton 与 prototype',
        language: 'Java',
        code: `DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
factory.registerBeanDefinition("single", BeanDefinitionBuilder
  .genericBeanDefinition(Counter.class).setScope("singleton").getBeanDefinition());
factory.registerBeanDefinition("prototype", BeanDefinitionBuilder
  .genericBeanDefinition(Counter.class).setScope("prototype").getBeanDefinition());
System.out.println(factory.getBean("single") == factory.getBean("single"));
System.out.println(factory.getBean("prototype") == factory.getBean("prototype"));`,
        output: `true
false

singleton 复用同一实例，prototype 每次 getBean 创建新对象。prototype 的销毁不由容器完整托管。`,
      }],
      ['工厂方法与构造器各有边界', '@Bean 工厂方法适合构建第三方类型和条件配置，普通类组件可用构造器注入；同名 Bean、返回接口和泛型候选会影响解析。动态注册时要提供清晰名称、依赖顺序和失败信息，不能依赖反射扫描碰巧生效。', '构建方式要可解释', {
        title: 'Spring：@Bean 构建第三方类型',
        language: 'Java',
        code: `@Configuration
class ClientConfig {
  @Bean
  HttpClient httpClient() {
    return HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(2))
      .build();
  }

  @Bean
  OrderClient orderClient(HttpClient httpClient) {
    return new OrderClient(httpClient);
  }
}`,
        output: `HttpClient 和 OrderClient 都有明确 Bean 名称与依赖参数。

构造器参数让依赖关系可读，工厂方法适合无法直接加 Spring 注解的第三方类。`,
      }],
      ['用单例与原型断言验证', '测试检查 Bean 名称、类型、作用域、引用身份、初始化和销毁顺序，并制造重复注册与缺少依赖。日志记录创建次数，确保修改定义后重新构建上下文，而不是在旧 singleton 上做无效修改。', '对象身份和生命周期要断言', {
        title: 'Spring + JUnit：上下文 Bean 身份测试',
        language: 'Java',
        code: `@SpringBootTest
class BeanLifecycleTest {
  @Autowired ApplicationContext context;
  @Autowired OrderService first;
  @Autowired OrderService second;

  @Test
  void singletonReturnsSameBean() {
    assertSame(first, second);
    assertSame(first, context.getBean(OrderService.class));
  }
}`,
        output: `✔ singletonReturnsSameBean()

测试直接验证容器身份和获取路径。若预期 prototype，应断言不同实例并验证销毁责任。`,
      }],
    ],
  },
  {
    name: 'ApplicationContext refresh 主流程',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 IoC BeanDefinition 课程，能读 Spring Framework 源码和启动日志。',
    goal: '能按 refresh 方法阶段解释 Environment、BeanFactory 后处理、Bean 实例化、事件发布和生命周期收尾，并按阶段分类启动失败。',
    guidedPractice: '在 AbstractApplicationContext.refresh 的 prepareContext、invokeBeanFactoryPostProcessors、finishBeanFactoryInitialization 和 finishRefresh 处断点，记录 Bean 数量与日志顺序，再制造配置缺失和初始化异常。',
    independentPractice: '为一个启动失败案例定位 refresh 阶段，画出从 main 到异常方法的调用链，提交最小复现、修复和启动成功证据。',
    commonErrors: ['把所有启动失败都归因于依赖注入，忽略环境准备、后处理器和事件发布阶段。', '在 BeanPostProcessor 中提前触发业务 Bean 初始化，导致代理、事务和配置尚未准备好。'],
    sourceRefs: [SPRING, 'Spring AbstractApplicationContext source. https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java'],
    steps: [
      ['refresh 是启动生命周期模板', 'AbstractApplicationContext.refresh 依次准备刷新、获取 BeanFactory、准备上下文、调用 BeanFactory 后处理器、注册 Bean 后处理器、初始化消息源与事件广播器、刷新子类、注册监听器、实例化非懒加载单例并完成刷新。', '阶段边界决定错误分类', {
        title: 'Spring：从 refresh 调用链定位失败',
        language: 'Java',
        code: `try {
  context.refresh();
  System.out.println("ready");
} catch (BeanCreationException error) {
  Throwable cause = error.getMostSpecificCause();
  System.out.println("bean=" + error.getBeanName());
  System.out.println("cause=" + cause.getClass().getSimpleName());
  throw error;
}`,
        output: `bean=orderService
cause=IllegalArgumentException

异常已经包含 Bean 名称和根因。再沿 refresh 调用栈确认是实例化、后处理还是初始化阶段失败。`,
      }],
      ['环境与资源先就绪', 'prepareRefresh 记录启动时间与活动标志，prepareBeanFactory 设置类加载器、表达式解析器、资源和依赖解析器。配置源、占位符和 profile 未就绪时，后续 Bean 条件可能得到错误结果。', '先固定环境，再创建对象', {
        title: 'Spring：读取 profile 和属性源',
        language: 'Java',
        code: `ConfigurableEnvironment env = context.getEnvironment();
System.out.println(java.util.Arrays.toString(env.getActiveProfiles()));
System.out.println(env.getProperty("orders.timeout"));
System.out.println(env.getPropertySources());`,
        output: `[local]
2s
[configurationProperties, commandLineArgs, systemProperties, systemEnvironment]

确认 profile 与属性源生效顺序。占位符缺失会让后续 Bean 创建或条件判断错误。`,
      }],
      ['后处理器会改写后续创建', 'invokeBeanFactoryPostProcessors 先执行注册定义和属性解析，registerBeanPostProcessors 安装代理与生命周期增强，之后普通 singleton 才批量创建。后处理器内部若请求普通 Bean，会提前触发初始化并绕过预期顺序。', '后处理器阶段不要拉业务 Bean', {
        title: 'Spring：BeanFactoryPostProcessor 修改定义',
        language: 'Java',
        code: `class LazyAuditPostProcessor implements BeanFactoryPostProcessor {
  public void postProcessBeanFactory(ConfigurableListableBeanFactory factory) {
    if (factory.containsBeanDefinition("auditService")) {
      factory.getBeanDefinition("auditService").setLazyInit(true);
      System.out.println("auditService:lazy");
    }
  }
}`,
        output: `auditService:lazy

后处理器只修改 BeanDefinition，尚未创建业务对象。若这里调用 getBean，会把预期延迟的初始化提前。`,
      }],
      ['finishRefresh 发布完成事件', '非懒加载 singleton 全部创建后，上下文完成刷新并发布 ContextRefreshedEvent，Lifecycle 组件可能启动。启动完成事件监听器抛异常会让上下文处于部分初始化状态，必须明确回滚和关闭流程。', '完成事件也要可失败', {
        title: 'Spring：ContextRefreshedEvent 记录完成',
        language: 'Java',
        code: `@Component
class ReadyListener implements ApplicationListener<ContextRefreshedEvent> {
  public void onApplicationEvent(ContextRefreshedEvent event) {
    long beans = event.getApplicationContext().getBeanDefinitionCount();
    System.out.println("ready:" + beans);
  }
}`,
        output: `ready:148

事件在非懒加载单例初始化之后发布。监听器异常会沿 refresh 传播，启动可能停在部分初始化状态。`,
      }],
      ['从调用链到最小修复', '按异常栈找到 refresh 的直接阶段和内部方法，记录条件报告、Bean 名称和底层 cause；用移除一个配置或 Bean 的最小复现确认阶段。修复后验证启动、健康检查和关闭，而不是只看到一个 Started 日志。', '阶段、Bean 和 cause 三者对齐', {
        title: 'PowerShell：启动失败证据归档',
        language: 'PowerShell',
        code: `java -jar orders.jar --debug > startup.log 2>&1
"exit=$LASTEXITCODE"
Select-String -Path startup.log -Pattern "BeanCreationException|ConditionEvaluationReport|Caused by" -Context 1,3
Get-Item startup.log | Select-Object FullName,Length,LastWriteTime`,
        output: `exit=1
BeanCreationException: Error creating bean with name 'orderService'
ConditionEvaluationReport: Positive matches / Negative matches
Caused by: IllegalArgumentException: timeout

日志保留阶段、Bean 名称、条件和根因。修复后同命令 exit=0，并继续验证 health 和关闭。`,
      }],
    ],
  },
  {
    name: '依赖注入与 Bean 生命周期',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解构造器、反射、代理与 Spring BeanDefinition，能启动和调试 Spring Boot 应用。',
    goal: '能沿实例化、属性填充、Aware、BeanPostProcessor、初始化和销毁解释 Bean 生命周期，选择构造器注入并处理循环依赖。',
    guidedPractice: '创建带构造器、setter、@PostConstruct、InitializingBean、DisposableBean 的 Bean，在各类后处理器打印阶段；再构造 A 与 B 字段注入循环依赖，观察启动失败或代理行为。',
    independentPractice: '把一个字段注入、循环依赖和隐藏可选依赖的模块改为构造器注入，使用 ObjectProvider 或工厂隔离可选依赖，并补启动与销毁测试。',
    commonErrors: ['使用字段注入让对象脱离容器就无法构造，还掩盖循环依赖和必要依赖缺失。', '假设 prototype Bean 一定触发销毁回调，或假设容器会管理所有 new 出来的对象。'],
    sourceRefs: ['Spring Framework Dependency Injection. https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html', SPRING],
    steps: [
      ['构造器注入先建立合法对象', '构造器参数声明必需依赖，Bean 创建完成时就满足不变量，字段可以是 final，测试可直接传替身。参数过多是职责过大的信号；可选依赖用 ObjectProvider、Optional 或独立工厂表达，而不是把核心依赖变成可空字段。', '必需依赖走构造器', {
        title: 'Spring：构造器注入必需依赖',
        language: 'Java',
        code: `@Service
final class OrderService {
  private final OrderRepository repository;
  private final Clock clock;

  OrderService(OrderRepository repository, Clock clock) {
    this.repository = Objects.requireNonNull(repository);
    this.clock = Objects.requireNonNull(clock);
  }
}`,
        output: `构造后 repository 与 clock 一定非空，无需 @Autowired 字段。

测试可直接 new OrderService(fakeRepository, fixedClock)，依赖关系在签名中可见。`,
      }],
      ['实例化之后才填充属性', '容器先通过构造器或工厂方法创建对象，再进行属性填充、Aware 回调、BeanPostProcessor 前置处理、初始化方法和后置处理。代理通常在初始化前后由后处理器创建，直接 new 出的对象不会经过这些增强。', '容器管理才有完整生命周期', {
        title: 'Spring：记录 Bean 生命周期阶段',
        language: 'Java',
        code: `@Component
class LifecycleBean implements InitializingBean, DisposableBean {
  LifecycleBean() { System.out.println("constructor"); }
  @PostConstruct void postConstruct() { System.out.println("post-construct"); }
  public void afterPropertiesSet() { System.out.println("after-properties"); }
  public void destroy() { System.out.println("destroy"); }
}`,
        output: `constructor
post-construct
after-properties
（上下文关闭）
destroy

构造函数、初始化回调和销毁顺序清晰，资源只在容器管理对象上自动收口。`,
      }],
      ['Aware 与回调各有用途', 'BeanNameAware、ApplicationContextAware 等让对象感知基础设施，但会增加容器耦合；@PostConstruct 适合初始化自身状态，InitializingBean 是 Spring 接口。业务依赖初始化应尽量放入显式构造器或工厂，避免回调执行顺序难测。', '基础回调只做必要接线', {
        title: 'Spring：Aware 获取 Bean 名称',
        language: 'Java',
        code: `@Component
class AuditWriter implements BeanNameAware {
  private String beanName;
  public void setBeanName(String name) {
    beanName = name;
    System.out.println("bean-name=" + name);
  }
}`,
        output: `bean-name=auditWriter

Aware 回调发生在实例化之后。只用于基础设施接线，不把业务初始化塞进多个回调里。`,
      }],
      ['循环依赖不是设计目标', '单例 setter 注入在部分情况下可借助早期引用解决，构造器循环通常直接失败，AOP 与懒加载会改变结果。修复方向是提取第三类、反转依赖或使用事件，而不是开启更宽松的覆盖和代理配置。', '打破依赖环，不绕过它', {
        title: 'Spring：构造器循环依赖启动失败',
        language: 'Java',
        code: `@Service
class OrderService {
  private final InventoryService inventory;
  OrderService(InventoryService inventory) { this.inventory = inventory; }
}

@Service
class InventoryService {
  private final OrderService orders;
  InventoryService(OrderService orders) { this.orders = orders; }
}`,
        output: `启动失败，错误包含 cycle 和两个 Bean 名称。

构造器环无法靠提前暴露字段绕过。应提取协调器、拆出只读接口或改用事件。`,
      }],
      ['销毁覆盖资源边界', 'singleton 容器关闭时会调用 DisposableBean 和销毁方法，prototype 销毁由调用方负责。测试关闭上下文后确认连接、线程和文件句柄释放；若对象被手工发布到静态字段，生命周期已经超出容器保证。', '谁创建谁负责关闭', {
        title: 'Spring Test：关闭上下文释放资源',
        language: 'Java',
        code: `class LifecycleTest {
  @Test
  void shutdownClosesManagedResource() {
    try (ConfigurableApplicationContext context =
      new AnnotationConfigApplicationContext(ResourceConfig.class)) {
      ResourceClient client = context.getBean(ResourceClient.class);
      assertFalse(client.closed());
    }
    assertTrue(ResourceProbe.closed);
  }
}`,
        output: `✔ shutdownClosesManagedResource()

try-with-resources 关闭上下文，验证销毁回调。手工 new prototype 或静态缓存不在此保证内。`,
      }],
    ],
  },
  {
    name: 'Spring AOP 与动态代理',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '掌握接口、反射、代理、Bean 生命周期和切面基础。',
    goal: '能解释 Pointcut、Advisor、通知链与 JDK/CGLIB 代理，定位自调用和代理类型导致的切面失效。',
    guidedPractice: '为订单服务添加日志和权限 Advisor，在调用处打印代理类名；在同类方法内调用被切方法，对比外部调用结果，再改为注入代理或拆分协作对象。',
    independentPractice: '实现一个参数脱敏与耗时切面，验证注解匹配、执行顺序、异常传播和异步线程上下文，并测试代理类型切换。',
    commonErrors: ['在同一个类中 this.method() 调用期待事务或切面生效，忽略调用没有经过代理。', '只根据类名判断使用 JDK 还是 CGLIB 代理，忽略接口、proxyTargetClass 和最终类限制。'],
    sourceRefs: ['Spring AOP Reference. https://docs.spring.io/spring-framework/reference/core/aop.html', SPRING],
    steps: [
      ['Pointcut 选连接点，Advice 做增强', 'Pointcut 用表达式选择方法执行等连接点，Advisor 把切点和通知组合，容器为匹配 Bean 创建代理。Spring AOP 主要拦截容器管理的 Spring Bean 方法调用，不自动改写对象内部所有指令。', '代理边界决定切面边界', {
        title: 'Spring AOP：耗时切面',
        language: 'Java',
        code: `@Aspect
@Component
class TimingAspect {
  @Around("execution(* com.example.orders..*(..))")
  Object timed(ProceedingJoinPoint joinPoint) throws Throwable {
    long start = System.nanoTime();
    try {
      return joinPoint.proceed();
    } finally {
      log.info("{} took {}ms",
        joinPoint.getSignature().toShortString(),
        (System.nanoTime() - start) / 1_000_000);
    }
  }
}`,
        output: `调用 OrderService.pay 时，代理进入 TimingAspect，再执行目标方法。

finally 记录异常和成功路径耗时；切面只拦截经过代理的方法调用。`,
      }],
      ['JDK 代理与 CGLIB 各有前提', '目标实现接口时可使用 JDK 动态代理，调用通过接口投射到 InvocationHandler；CGLIB 生成子类覆盖方法，类不能是 final，私有方法也无法拦截。Spring Boot 常默认类代理，但最终选择受配置和 Bean 类型影响。', '代理技术受类型结构约束', {
        title: 'Spring：打印实际代理类型',
        language: 'Java',
        code: `OrderService service = context.getBean(OrderService.class);
System.out.println(service.getClass().getName());
System.out.println(AopUtils.isAopProxy(service));
System.out.println(AopUtils.isJdkDynamicProxy(service));
System.out.println(AopUtils.isCglibProxy(service));`,
        output: `com.example.OrderService$$SpringCGLIB$$0
true
false
true

输出证明实际代理技术。最终类无法用 CGLIB 子类代理，需要接口或调整设计。`,
      }],
      ['通知链按顺序组合', '多个 Advisor 形成拦截器链，@Order 或 Ordered 决定进入与返回顺序，环绕通知还需要 finally 保证退出逻辑。切面异常会沿链传播，事务、安全、日志的顺序可能改变回滚和脱敏结果。', '顺序是行为的一部分', {
        title: 'Spring AOP：显式切面顺序',
        language: 'Java',
        code: `@Aspect @Order(10)
class SecurityAspect {
  @Around("execution(* OrderService.*(..))")
  Object authorize(ProceedingJoinPoint joinPoint) throws Throwable {
    System.out.println("security-enter");
    try { return joinPoint.proceed(); }
    finally { System.out.println("security-exit"); }
  }
}

@Aspect @Order(20)
class TransactionAspect { /* 事务通知 */ }`,
        output: `security-enter
transaction-enter
order-method
transaction-exit
security-exit

@Order 越小越先进入。安全校验应尽早执行，事务和日志顺序需结合业务验证。`,
      }],
      ['自调用绕过代理', '对象内部调用使用真实 this 引用，不会再次进入代理，因此 @Transactional、@Cacheable 等基于代理的注解可能不生效。可拆出独立 Bean、通过 AopContext.currentProxy 暴露代理或重构边界，优先选择降低耦合的结构方案。', '内部调用先问是否经过代理', {
        title: 'Spring：自调用绕过切面',
        language: 'Java',
        code: `@Service
class OrderService {
  @Transactional
  public void pay() {
    System.out.println("pay");
  }

  public void checkout() {
    pay(); // this.pay()，不经过代理
  }
}

orderService.checkout(); // pay 上事务切面可能不生效`,
        output: `只输出 pay，没有代理拦截。

外部调用 orderService.pay() 才会经过代理。修复可拆 PaymentService 或显式注入代理。`,
      }],
      ['用代理类和失败用例验收', '日志记录实际代理类、接口和切面顺序，测试外部调用、自调用、异常、异步线程和最终类。只有确认切面进入了目标方法，才继续评估事务、安全或缓存是否真正生效；自调用未代理要单独列为边界。', '切面生效必须有运行证据', {
        title: 'Spring Test：切面生效与自调用失败',
        language: 'Java',
        code: `@SpringBootTest
class AopBehaviorTest {
  @Autowired OrderService service;

  @Test
  void externalCallIsProxied() {
    service.pay();
    assertTrue(TestTrace.seen("security-enter"));
    assertTrue(TestTrace.seen("timing-exit"));
  }

  @Test
  void selfInvocationDoesNotEnterProxy() {
    service.checkout();
    assertFalse(TestTrace.seen("security-enter"));
  }
}`,
        output: `✔ externalCallIsProxied()
✔ selfInvocationDoesNotEnterProxy()
Tests 2 passed

测试同时证明外部调用经过代理、内部调用不经过代理，切面边界由行为验证。`,
      }],
    ],
  },
  {
    name: 'Spring 事务与事务传播',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 JDBC 事务、连接、隔离级别、AOP 和 Spring Bean 生命周期。',
    goal: '能解释 TransactionInterceptor、PlatformTransactionManager、资源绑定和传播行为，修复自调用、异常吞掉和长事务问题。',
    guidedPractice: '为服务方法开启事务，在 Dao 内打印连接对象；调用 REQUIRED 与 REQUIRES_NEW 方法，观察连接、提交与回滚顺序，再制造自调用和捕获异常不重抛的失败。',
    independentPractice: '实现订单创建与审计记录的事务边界，覆盖业务异常、数据库异常、嵌套调用和远程超时，提交事务日志、回滚证据和最小复现测试。',
    commonErrors: ['捕获异常后不重抛，外层层误以为事务成功并提交。', '在事务中调用远程服务或等待用户操作，长时间占用数据库连接。'],
    sourceRefs: ['Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html', SPRING],
    steps: [
      ['事务拦截器管理提交回滚', '被代理方法调用进入 TransactionInterceptor，事务管理器根据传播和隔离配置开启或加入事务，成功后提交，异常按 rollback 规则回滚。默认只自动回滚 RuntimeException 和 Error，受检异常需要 rollbackFor 明确。', '先定义异常到回滚的映射', {
        title: 'Spring：声明回滚异常类型',
        language: 'Java',
        code: `@Transactional(rollbackFor = PaymentDeclinedException.class)
public void pay(String orderId) throws PaymentDeclinedException {
  orders.markPaid(orderId);
  if (!gateway.charge(orderId)) {
    throw new PaymentDeclinedException("DECLINED");
  }
}`,
        output: `受检 PaymentDeclinedException 会触发回滚，markPaid 的数据库写入不会提交。

若无 rollbackFor，受检异常默认不自动回滚，必须明确契约。`,
      }],
      ['连接资源与线程绑定', 'DataSourceTransactionManager 通过 TransactionSynchronizationManager 把连接绑定到当前线程，Dao 在同一事务中复用。手写新线程、异步回调或切换数据源后，绑定关系不会自动传递，可能出现新连接和独立事务。', '线程切换会切换事务上下文', {
        title: 'JDBC：确认事务中的连接绑定',
        language: 'Java',
        code: `@Transactional
public void createOrder(Order order) {
  Connection first = DataSourceUtils.getConnection(dataSource);
  orders.insert(first, order);
  Connection second = DataSourceUtils.getConnection(dataSource);
  System.out.println(first == second);
  System.out.println(TransactionSynchronizationManager.isActualTransactionActive());
}`,
        output: `true
true

同一线程中的 DataSourceUtils 复用绑定连接。新线程不会自动继承这个连接或事务状态。`,
      }],
      ['传播行为改变事务边界', 'REQUIRED 加入已有事务，REQUIRES_NEW 通常挂起外层并另开事务，NESTED 依赖保存点支持。任何传播都要看实际 TransactionManager 和数据库能力；跨 JVM 或跨数据源不能想当然获得原子性。', '传播语义要结合资源实现', {
        title: 'Spring：REQUIRES_NEW 独立审计事务',
        language: 'Java',
        code: `@Transactional
public void createOrder(Order order) {
  orders.insert(order);
  audit.record("created:" + order.id());
  throw new IllegalStateException("after-audit");
}

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void record(String event) {
  auditLog.insert(event);
}`,
        output: `外层订单事务抛出异常并回滚。

审计方法使用 REQUIRES_NEW 提交自己的事务，因此审计记录可能保留。业务必须明确这是有意的独立证据，还是需要 Outbox 协调。`,
      }],
      ['自调用和吞异常使注解失效', '同类内部调用绕过代理，事务拦截器根本没有执行；catch 后不重抛则拦截器看到正常返回并提交。修复时拆出事务服务、确保调用经过代理，并让异常或显式 setRollbackOnly 正确传递。', '入口和异常出口都要验证', {
        title: 'Spring：自调用失效与拆分事务服务',
        language: 'Java',
        code: `@Service
class Checkout {
  private final TxService tx;

  public void submit() {
    tx.persist(); // 经过 Spring 代理
  }
}

@Service
class TxService {
  @Transactional
  public void persist() {
    orders.insert(new Order("O-1"));
  }
}`,
        output: `submit 调用另一个 Bean 的 persist，调用经过事务代理，persist 正常进入事务。

若 Checkout 直接调用自身 @Transactional 方法，则不会经过代理，事务不会开启。`,
      }],
      ['用连接与提交日志验收', '事务测试记录方法进入、连接标识、提交/回滚、异常和耗时，模拟流程中途失败。生产上监控长事务、连接池等待和回滚率，把远程调用移出事务或缩短数据库操作窗口；连接标识必须贯穿进入与结束日志。', '事务边界要能被观测', {
        title: 'Spring Test：验证回滚与提交',
        language: 'Java',
        code: `@SpringBootTest
class TransactionTest {
  @Autowired OrderService service;
  @Autowired JdbcTemplate jdbc;

  @Test
  void rollsBackWhenPaymentDeclined() {
    assertThrows(PaymentDeclinedException.class,
      () -> service.pay("O-1"));
    assertEquals(0, jdbc.queryForObject(
      "select count(*) from order where id='O-1'", Integer.class));
  }
}`,
        output: `✔ rollsBackWhenPaymentDeclined()

测试从数据库重新查询状态，而不是只看异常。若计数仍为 1，说明事务没有回滚或提交发生在错误边界。`,
      }],
    ],
  },
  {
    name: 'Spring 事件与扩展点',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 IoC 生命周期、事务、异步执行器和事件驱动边界。',
    goal: '能区分同步事件、异步事件和事务事件，控制监听器顺序与异常传播，并设计提交后审计而不破坏原事务。',
    guidedPractice: '发布一个领域事件，在普通监听器、@TransactionalEventListener(phase = AFTER_COMMIT) 和 @Async 监听器中打印线程与提交状态；故意让审计失败，观察主事务结果。',
    independentPractice: '实现订单创建事件链，包含同步校验、提交后通知和失败重试，证明事务回滚时通知不发送、提交后重复投递可幂等。',
    commonErrors: ['在事务监听器中执行不可回滚的外部副作用，却仍宣称整体原子。', '使用 @Async 但没有有界执行器、异常处理和关闭策略，导致任务丢失或线程膨胀。'],
    sourceRefs: ['Spring Events. https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events', SPRING],
    steps: [
      ['同步事件在发布线程执行', 'ApplicationEventPublisher 默认同步调用监听器，发布方法返回时监听器已经执行，监听器异常会传回发布者并可能影响当前事务。事件适合解耦与扩展，不自动提供持久化、异步或重试。', '默认事件没有消息中间件语义', {
        title: 'Spring：同步事件打印线程',
        language: 'Java',
        code: `record OrderCreated(String orderId) {}

@Component
class AuditListener {
  @EventListener
  void onCreated(OrderCreated event) {
    System.out.println(event.orderId() + ":" + Thread.currentThread().getName());
  }
}

publisher.publishEvent(new OrderCreated("O-1"));`,
        output: `O-1:main

监听器默认在发布线程同步执行。监听器异常会回到 publishEvent 调用者。`,
      }],
      ['监听器顺序要显式', '@Order、Ordered 和接口优先级决定监听器顺序，但不同线程和异步阶段不保证跨阶段顺序。监听器应处理一个清楚副作用，避免互相依赖隐式状态；多个监听器失败时的结果要写进契约。', '顺序不能靠注册偶然', {
        title: 'Spring：显式标注监听器顺序',
        language: 'Java',
        code: `@EventListener
@Order(10)
void validate(OrderCreated event) { trace.add("validate"); }

@EventListener
@Order(20)
void audit(OrderCreated event) { trace.add("audit"); }

publisher.publishEvent(new OrderCreated("O-1"));
System.out.println(trace);`,
        output: `[validate, audit]

同步监听器按 @Order 执行。异步监听器启动后的完成顺序不受这个数组保证。`,
      }],
      ['事务事件绑定提交阶段', 'TransactionSynchronizationManager 跟踪事务同步，@TransactionalEventListener 可选择 BEFORE_COMMIT、AFTER_COMMIT、AFTER_ROLLBACK 等阶段。提交后回调已经无法回滚数据库事务，外部通知失败应交给 Outbox、重试或补偿。', '提交后副作用不能假装原子', {
        title: 'Spring：AFTER_COMMIT 发送通知',
        language: 'Java',
        code: `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
void afterCommit(OrderCreated event) {
  mailer.enqueue(event.orderId());
  System.out.println("queued:" + event.orderId());
}`,
        output: `事务提交后才输出 queued:O-1。

通知发送失败不能回滚已提交订单；生产应使用 Outbox、重试和幂等消费。`,
      }],
      ['异步监听器需要独立故障域', '@Async 监听器把执行交给 TaskExecutor，默认返回不等待，异常不会影响发布线程。执行器必须有界、有线程名、异常处理器和关闭流程，事件负载应可序列化并带业务 ID。', '异步把失败从调用栈移走', {
        title: 'Spring：有界异步事件执行器',
        language: 'Java',
        code: `@Bean(name = "eventExecutor")
ThreadPoolTaskExecutor eventExecutor() {
  ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
  executor.setCorePoolSize(2);
  executor.setMaxPoolSize(4);
  executor.setQueueCapacity(100);
  executor.setThreadNamePrefix("event-");
  return executor;
}

@Async("eventExecutor")
@EventListener
void notifyCustomer(OrderCreated event) {
  System.out.println(Thread.currentThread().getName() + ":" + event.orderId());
}`,
        output: `event-1:O-1

异步执行使用专用有界线程池，不占用请求线程，也不会无限创建通知线程。`,
      }],
      ['用回滚和重复投递验收', '测试覆盖业务成功后提交、业务异常回滚、监听器异常、进程在提交后崩溃和重复消费。检查原始事务状态与通知状态，必要时用 Outbox 持久化待发事件，保证至少一次投递和幂等消费。', '事务状态与通知状态分别记录', {
        title: 'Spring Test：回滚时不发通知',
        language: 'Java',
        code: `@SpringBootTest
class OrderEventTest {
  @Autowired OrderService service;
  @Autowired RecordingMailer mailer;

  @Test
  void doesNotNotifyWhenTransactionRollsBack() {
    assertThrows(IllegalArgumentException.class,
      () -> service.createInvalidOrder());
    assertEquals(0, mailer.sent().size());
  }
}`,
        output: `✔ doesNotNotifyWhenTransactionRollsBack()

事务回滚时 AFTER_COMMIT 监听器没有执行。生产还要测试提交后进程崩溃与重复投递幂等。`,
      }],
    ],
  },
  {
    name: 'Spring Boot 自动配置机制',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解 Spring 条件装配、配置类、BeanFactory 和 Maven/Gradle 依赖。',
    goal: '能解释 starter、AutoConfiguration.imports、条件注解和自动配置顺序，创建可关闭、可覆盖且测试覆盖的最小自动配置。',
    guidedPractice: '新建一个 library starter，在 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports 注册配置类，使用 @ConditionalOnClass、@ConditionalOnMissingBean 和 @ConfigurationProperties，再用 --debug 查看条件报告。',
    independentPractice: '为一个日志客户端编写 starter，验证类缺失、配置缺失、用户自定义 Bean 和属性覆盖四种路径，并提供手写等价配置作为回退。',
    commonErrors: ['在自动配置里无条件创建覆盖用户 Bean 的对象，导致应用无法定制。', '只测试 starter 在空项目中成功，不测试依赖缺失、用户覆盖和配置非法。'],
    sourceRefs: ['Spring Boot Auto-configuration. https://docs.spring.io/spring-boot/reference/using/auto-configuration.html', SPRING_BOOT],
    steps: [
      ['starter 是依赖组合，自动配置是条件装配', 'starter 通过依赖声明把常用库带入项目，自动配置类在满足类和属性条件时注册默认 Bean。导入清单决定候选配置，用户配置通过 @ConditionalOnMissingBean 等条件优先，框架不应无条件接管业务对象。', 'starter 提供入口，自动配置给默认值', {
        title: 'Spring Boot：最小自动配置类',
        language: 'Java',
        code: `@AutoConfiguration
@ConditionalOnClass(AuditClient.class)
@EnableConfigurationProperties(AuditProperties.class)
class AuditAutoConfiguration {
  @Bean
  @ConditionalOnMissingBean
  AuditClient auditClient(AuditProperties properties) {
    return new AuditClient(properties.endpoint());
  }
}`,
        output: `只有 AuditClient 类存在时才加载配置；用户已定义 AuditClient 时默认 Bean 跳过。

框架提供默认值，但不抢占用户显式配置。`,
      }],
      ['导入清单需要稳定版本契约', 'Spring Boot 3 使用 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports 列出配置类，不能再照搬旧版 spring.factories 方式。清单、配置类名和属性类都是兼容契约，发布前用 jar 内容和集成测试验证。', '清单是运行时发现入口', {
        title: '文本：AutoConfiguration.imports 清单',
        language: 'Text',
        code: `src/main/resources/META-INF/spring/
  org.springframework.boot.autoconfigure.AutoConfiguration.imports

内容：
com.example.audit.AuditAutoConfiguration`,
        output: `Spring Boot 启动时扫描 imports 文件并加载列出的自动配置类。

清单中类名错误会导致配置不生效；发布 jar 后应执行 jar tf 和真实启动测试。`,
      }],
      ['条件报告解释生效与跳过', '条件注解检查类路径、Bean、资源和属性，--debug 或 Actuator conditions 端点输出 ConditionEvaluationReport。排错时先看 required 和 found 字段，再对照自动配置顺序，不能只看应用日志中是否出现某个类。', '条件报告是自动配置证据', {
        title: 'PowerShell：读取条件评估报告',
        language: 'PowerShell',
        code: `java -jar app.jar --debug > boot.log 2>&1
Select-String -Path boot.log -Pattern "AuditAutoConfiguration|required|found" -Context 0,3
curl.exe -s http://127.0.0.1:8080/actuator/conditions > conditions.json`,
        output: `AuditAutoConfiguration matched:
  @ConditionalOnClass found required class AuditClient
  @ConditionalOnMissingBean did not find AuditClient

报告说明为什么生效。若用户 Bean 已存在，会显示 missing bean condition 不匹配。`,
      }],
      ['配置属性要校验并绑定', '@ConfigurationProperties 把外部属性绑定到类型安全对象，可用校验、默认值和嵌套结构。属性名变更要有迁移说明；敏感值使用 Secret 机制，不从 starter 默认配置读取明文。', '默认值和安全边界一起设计', {
        title: 'Spring Boot：类型安全配置属性',
        language: 'Java',
        code: `@ConfigurationProperties("audit")
@Validated
record AuditProperties(
  @NotNull URI endpoint,
  @Min(100) @Max(10000) int timeoutMs
) {}`,
        output: `配置 audit.endpoint 和 audit.timeout-ms 绑定到对象。

缺少 endpoint 或 timeout 越界会在启动时失败；属性类名和前缀进入外部契约。`,
      }],
      ['测试每个条件分支', '使用 ApplicationContextRunner 或集成测试分别加载有类/缺类、有用户 Bean/无用户 Bean、合法/非法属性和禁用开关。每个分支断言 Bean 是否存在，并检查启动失败信息，防止默认配置在升级后悄悄改变。', '自动配置要有条件矩阵', {
        title: 'Spring Boot Test：ApplicationContextRunner 条件矩阵',
        language: 'Java',
        code: `new ApplicationContextRunner()
  .withConfiguration(AutoConfigurations.of(AuditAutoConfiguration.class))
  .withPropertyValues("audit.endpoint=https://audit.example", "audit.timeout-ms=500")
  .run(context -> assertThat(context).hasSingleBean(AuditClient.class));

new ApplicationContextRunner()
  .withConfiguration(AutoConfigurations.of(AuditAutoConfiguration.class))
  .withBean(AuditClient.class, () -> customClient)
  .run(context -> assertThat(context.getBean(AuditClient.class)).isSameAs(customClient));`,
        output: `✔ 合法属性创建默认 AuditClient
✔ 用户自定义 Bean 覆盖默认实现

条件矩阵还应覆盖类缺失、属性非法和禁用开关。`,
      }],
    ],
  },
  {
    name: '配置、Actuator 与启动失败分析',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成自动配置、Spring 生命周期和生产监控基础课程。',
    goal: '能按属性来源优先级排查配置，配置健康与指标端点，并注册 FailureAnalyzer 将启动异常变成可行动诊断。',
    guidedPractice: '用 application.yml、环境变量、命令行参数和配置中心覆盖同一属性，打印 Environment 的 PropertySource 顺序；再制造数据源连接失败，使用 Actuator health 与 FailureAnalyzer 查看原因。',
    independentPractice: '为服务配置健康分组、启动探针指标、敏感端点访问控制和自定义启动失败分析，提交普通启动、配置缺失和依赖不可用的三类报告。',
    commonErrors: ['只看 application.yml，忽略环境变量、命令行和配置中心的高优先级覆盖。', '把所有 Actuator 端点公开给公网，暴露环境、线程和配置信息。'],
    sourceRefs: ['Spring Boot Externalized Configuration. https://docs.spring.io/spring-boot/reference/features/external-config.html', 'Spring Boot Actuator. https://docs.spring.io/spring-boot/reference/actuator/'],
    steps: [
      ['属性来源具有明确优先级', 'Spring Boot 从命令行、环境变量、系统属性、配置文件、配置中心等来源读取属性，后者与 profile 和导入方式共同决定最终值。排查时输出来源名称和脱敏值，不能把最后看到的 YAML 当成实际配置。', '打印来源顺序而非猜值', {
        title: 'Spring Boot：打印配置来源',
        language: 'Java',
        code: `ApplicationContext context = SpringApplication.run(App.class, args);
ConfigurableEnvironment env = context.getEnvironment();
env.getPropertySources().forEach(source -> {
  if (source.containsProperty("orders.timeout")) {
    System.out.println(source.getName() + "=" + env.getProperty("orders.timeout"));
  }
});`,
        output: `commandLineArgs=3s
systemEnvironment=2s
applicationConfig: [classpath:/application.yml]=5s

最终值由最高优先级来源决定。报告记录脱敏值和来源名称。`,
      }],
      ['健康端点表达可用性', 'HealthIndicator 合并数据库、磁盘、外部服务等状态，liveness 与 readiness 探针的语义不同：前者表示进程是否应重启，后者表示能否接流量。依赖型检查不应让所有实例同时被判定不健康。', '就绪与存活分开建模', {
        title: 'Spring Boot：配置健康分组',
        language: 'YAML',
        code: `management:
  endpoint:
    health:
      probes:
        enabled: true
  health:
    group:
      readiness:
        include: db,diskSpace
      liveness:
        include: ping`,
        output: `/actuator/health/readiness 检查数据库和磁盘，依赖异常时不接流量。
/actuator/health/liveness 只检查进程基本存活，不因下游短暂故障反复重启。`,
      }],
      ['指标和审计要控制暴露面', 'Actuator 通过暴露清单和访问控制限制 endpoint，敏感信息需要脱敏或关闭。为关键业务链路增加指标和审计，而不是只看 JVM 默认指标；采集周期、标签基数和保留策略要纳入容量规划。', '端点可见性与权限先定', {
        title: 'Spring Boot：限制 Actuator 暴露',
        language: 'YAML',
        code: `management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    env:
      show-values: never`,
        output: `只暴露健康、信息、指标和 Prometheus 端点。

env、heapdump、threaddump 等敏感端点不对公网开放；认证和网络策略仍需同时配置。`,
      }],
      ['FailureAnalyzer 转换可行动错误', '实现 FailureAnalyzer 和 FailureAnalysis，把端口占用、数据库不可达或缺失密钥转成原因、动作和链接。分析器只处理可识别异常，保留原始 cause 和堆栈，避免掩盖未知启动错误。', '启动错误要指向下一步动作', {
        title: 'Spring Boot：自定义 FailureAnalyzer',
        language: 'Java',
        code: `class MissingKeyAnalyzer implements FailureAnalyzer {
  public FailureAnalysis analyze(Throwable failure) {
    if (!(failure instanceof MissingKeyException error)) return null;
    return new FailureAnalysis(
      "缺少签名密钥：" + error.keyName(),
      "设置环境变量 SIGNING_KEY 后重新启动",
      error
    );
  }
}`,
        output: `Description: 缺少签名密钥：orders
Action: 设置环境变量 SIGNING_KEY 后重新启动

未知异常不被该分析器接管，完整 cause 仍保留。`,
      }],
      ['用故障矩阵验收', '分别测试配置缺失、非法类型、外部依赖拒绝连接、端口冲突和 Secret 过期，记录退出码、健康状态、日志和恢复动作。修复后验证启动时间、探针切换和回滚，不把“容器起来了”当作成功。', '启动、探针、恢复一起验收', {
        title: 'PowerShell：启动故障矩阵',
        language: 'PowerShell',
        code: `$env:ORDERS_TIMEOUT='bad'
java -jar app.jar > bad-config.log 2>&1
"configExit=$LASTEXITCODE"
Get-Content bad-config.log -Tail 12

$env:ORDERS_TIMEOUT='2s'
java -jar app.jar > app.log 2>&1
curl.exe -s http://127.0.0.1:8080/actuator/health/readiness`,
        output: `configExit=1
Description: Failed to bind properties under 'orders.timeout'

{"status":"UP"}

非法配置启动失败，合法配置后 readiness 可用；探针与故障日志共同验收。`,
      }],
    ],
  },
];

const J7_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'DispatcherServlet 请求链',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握 Servlet、Spring IoC、MVC 注解和 AOP，能使用调试器。',
    goal: '能沿 doDispatch 解释 HandlerMapping、HandlerAdapter、参数解析、返回值和异常处理，并画出一条可验证的 MVC 请求链。',
    guidedPractice: '在 DispatcherServlet.doDispatch、HandlerAdapter.handle、RequestResponseBodyMethodProcessor 处断点，访问一个带拦截器和 JSON 返回的接口，记录过滤器、拦截器、控制器和异常解析顺序。',
    independentPractice: '为一个请求失败案例建立调用链报告，标明处理器、适配器、参数解析器、返回解析器和异常入口，并用一个修复前后请求证明。',
    commonErrors: ['把 Filter、Interceptor、ControllerAdvice 当成同一层，忽略它们进入和退出顺序不同。', '只有 Controller 方法断点，没有观察处理器映射和返回值解析导致的问题。'],
    sourceRefs: ['Spring MVC DispatcherServlet. https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet.html', 'Spring DispatcherServlet source. https://github.com/spring-projects/spring-framework/blob/main/spring-webmvc/src/main/java/org/springframework/web/servlet/DispatcherServlet.java'],
    steps: [
      ['doDispatch 先定位处理器', '请求进入后，DispatcherServlet 检查 multipart、取得 HandlerExecutionChain，再由 HandlerMapping 找到控制器和拦截器。找不到处理器时可能走默认异常路径，404、静态资源和错误控制器要按映射配置判断。', '先证明请求匹配了哪个处理器', {
        title: 'Spring MVC：打印请求映射',
        language: 'Java',
        code: `@RestController
class DebugController {
  @GetMapping("/orders/{id}")
  OrderView order(@PathVariable String id) {
    System.out.println("handler=order:" + id);
    return new OrderView(id, "PAID");
  }
}

System.out.println(requestMappingHandlerMapping.getHandler(request));`,
        output: `handler=order:O-1
HandlerExecutionChain with [DebugController#order] and interceptors

先证明请求匹配到具体处理器，再继续查参数解析和返回值转换。`,
      }],
      ['HandlerAdapter 决定如何执行', '不同处理器由支持的 HandlerAdapter 执行，注解控制器通常进入 HandlerMethod 的调用流程。参数解析器把请求参数、请求体、路径变量和认证对象转换到方法参数，绑定失败可生成 BindingResult 或异常。', '映射之后还有适配与参数绑定', {
        title: 'Spring MVC：参数校验失败',
        language: 'Java',
        code: `record CreateOrder(@NotBlank String sku, @Min(1) int quantity) {}

@PostMapping("/orders")
ResponseEntity<?> create(@Valid @RequestBody CreateOrder body,
                         BindingResult errors) {
  if (errors.hasErrors()) {
    return ResponseEntity.badRequest().body(errors.getFieldErrors());
  }
  return ResponseEntity.ok(body);
}`,
        output: `POST 空 sku 返回 400，响应包含 sku 和 quantity 的字段错误。

参数解析、校验和 BindingResult 都在控制器方法调用前发生。`,
      }],
      ['拦截器包围方法调用', 'preHandle 按注册顺序执行，返回 false 会阻止后续处理；postHandle 只在成功执行后回退，afterCompletion 在完成或异常时收尾。Filter 位于 Servlet 容器外层，通常先于 DispatcherServlet，跨域和编码常在这里处理。', '进入和退出顺序分别记录', {
        title: 'Spring MVC：拦截器进入与退出',
        language: 'Java',
        code: `class TraceInterceptor implements HandlerInterceptor {
  public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
    System.out.println("pre:" + req.getRequestURI());
    return true;
  }
  public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                              Object handler, Exception error) {
    System.out.println("done:" + res.getStatus());
  }
}`,
        output: `pre:/orders/O-1
（控制器执行）
done:200

拦截器包住控制器调用。Filter 还会更早进入，记录日志时应标注层级。`,
      }],
      ['返回值与异常各有解析器', '@ResponseBody 返回值由消息转换器写响应，视图名称由 ViewResolver 处理；@ControllerAdvice 和 HandlerExceptionResolver 可能改变状态码与响应体。只有在异常解析之后才能判断客户端实际看到的错误。', '统一错误模型也要跟踪到解析器', {
        title: 'Spring MVC：统一异常响应',
        language: 'Java',
        code: `@RestControllerAdvice
class ErrorAdvice {
  @ExceptionHandler(OrderNotFound.class)
  ResponseEntity<ApiError> notFound(OrderNotFound error) {
    return ResponseEntity.status(404)
      .body(new ApiError("ORDER_NOT_FOUND", error.getMessage(), requestId()));
  }
}`,
        output: `GET 不存在的订单时，控制器抛 OrderNotFound。

Advice 把它解析为 HTTP 404 和 JSON ApiError；客户端实际看到的是解析器结果。`,
      }],
      ['用一条链路证明扩展点', '保存请求 ID、处理器方法、拦截器节点、转换器、响应状态和耗时，断点日志放在同一 trace 中。删除一个拦截器或更换转换器后对比链路，确认变化来自何处，而不是只看最终 JSON。', '扩展点顺序要由实验证明', {
        title: 'Spring MVC Test：验证请求链',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class OrdersApiTest {
  @Autowired TestRestTemplate http;

  @Test
  void returnsJsonWithTraceHeader() {
    ResponseEntity<OrderView> response =
      http.getForEntity("/orders/O-1", OrderView.class);
    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertEquals("PAID", response.getBody().status());
    assertNotNull(response.getHeaders().getFirst("X-Request-Id"));
  }
}`,
        output: `✔ returnsJsonWithTraceHeader()

真实 HTTP 测试同时证明处理器匹配、参数解析、JSON 转换、拦截器和状态码。`,
      }],
    ],
  },
  {
    name: 'Security FilterChain 与授权',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 Servlet Filter、HTTP 会话、认证与授权，能配置 Spring Security。',
    goal: '能解释 FilterChainProxy 如何选择 SecurityFilterChain，追踪 SecurityContext 建立和授权判断，并修复 URL 与方法级授权不一致。',
    guidedPractice: '配置两个按路径匹配的 SecurityFilterChain，在 FilterChainProxy、认证过滤器和 AuthorizationFilter 断点，访问公开、登录和受限接口，记录链选择、SecurityContext 和拒绝原因。',
    independentPractice: '实现多租户订单权限，覆盖匿名、登录、角色不足、跨租户对象访问和过期令牌，提交 401、403、成功和审计日志四类证据。',
    commonErrors: ['只检查 URL 角色，不校验资源所属租户，导致登录用户可读取其他租户对象。', '认为过滤器链配置顺序无关，后声明的更宽 Matcher 抢先处理请求。'],
    sourceRefs: [SPRING_SECURITY, 'Spring Security FilterChainProxy source. https://github.com/spring-projects/spring-security/blob/main/web/src/main/java/org/springframework/security/web/FilterChainProxy.java'],
    steps: [
      ['FilterChainProxy 选择匹配链', '请求进入 DelegatingFilterProxy 后转交 FilterChainProxy，它按 SecurityFilterChain 的 RequestMatcher 选择第一个匹配链，再依次执行安全过滤器。链的顺序和匹配范围就是访问策略，必须用请求样例验证。', '先确定命中的是哪条链', {
        title: 'Spring Security：按路径拆分过滤器链',
        language: 'Java',
        code: `@Bean
@Order(1)
SecurityFilterChain api(HttpSecurity http) throws Exception {
  http.securityMatcher("/api/**")
    .authorizeHttpRequests(auth -> auth
      .requestMatchers("/api/public/**").permitAll()
      .anyRequest().authenticated());
  return http.build();
}

@Bean
@Order(2)
SecurityFilterChain web(HttpSecurity http) throws Exception {
  return http.formLogin(Customizer.withDefaults()).build();
}`,
        output: `/api/public/health 命中第一条链并放行；/api/orders 命中第一条链但要求认证。

其他页面落到第二条链，过滤器链顺序清楚。`,
      }],
      ['认证过滤器建立 SecurityContext', '认证过滤器从会话、令牌或请求中读取凭据，成功后创建 Authentication 并存入 SecurityContext，SecurityContextHolderFilter 等组件负责保存与清理。过滤链结束若上下文泄漏到线程复用，会造成身份串线。', '身份上下文必须有清理边界', {
        title: 'Spring Security：读取当前认证',
        language: 'Java',
        code: `Authentication auth = SecurityContextHolder.getContext().getAuthentication();
System.out.println(auth == null ? "anonymous" : auth.getName());
System.out.println(auth == null ? "none" : auth.getAuthorities());

// Web 请求结束由 SecurityContextHolderFilter 清理上下文`,
        output: `member-a
[ROLE_USER]

过滤器链内可读取身份。线程复用前上下文必须由安全过滤器释放，不能手工改成静态共享。`,
      }],
      ['授权过滤器读取访问决策', 'AuthorizationFilter 交给 AuthorizationManager 判断，支持 URL、方法或自定义策略；方法级注解通常在代理层再次检查。URL 允许访问不代表对象级操作安全，资源归属要进入业务代码和测试。', '路由权限不等于对象权限', {
        title: 'Spring Security：方法级授权',
        language: 'Java',
        code: `@EnableMethodSecurity
@Service
class OrderService {
  @PreAuthorize("hasRole('ADMIN') or #tenantId == authentication.details.tenantId")
  OrderView find(String orderId, String tenantId) {
    return repository.findByTenant(orderId, tenantId);
  }
}`,
        output: `角色 ADMIN 或当前认证租户匹配时允许调用。

查询仍把 tenantId 带入数据库条件，方法注解不是对象归属的唯一检查。`,
      }],
      ['401 与 403 语义要清楚', '未认证通常返回 401 并带认证挑战，已认证但无权限返回 403，异常入口由 AuthenticationEntryPoint 和 AccessDeniedHandler 处理。若 JSON 接口返回登录页或统一错误吞掉原因，客户端无法正确刷新会话。', '认证失败和授权失败分开', {
        title: 'Spring Security：JSON 401 与 403',
        language: 'Java',
        code: `http.exceptionHandling(errors -> errors
  .authenticationEntryPoint((request, response, error) -> {
    response.setStatus(401);
    response.setContentType("application/json");
    response.getWriter().write("{\\"code\\":\\"AUTH_REQUIRED\\"}");
  })
  .accessDeniedHandler((request, response, error) -> {
    response.setStatus(403);
    response.getWriter().write("{\\"code\\":\\"ACCESS_DENIED\\"}");
  })
);`,
        output: `未登录访问返回 401 AUTH_REQUIRED；登录但角色不足返回 403 ACCESS_DENIED。

客户端据此区分刷新登录与申请权限。`,
      }],
      ['覆盖跨链和跨租户矩阵', '测试每个公开、认证、角色和资源归属组合，验证链选择顺序、令牌过期、权限撤回和审计。日志包含主体、动作、对象、结果和请求 ID，敏感凭据不得进入日志；跨租户响应不得泄露对象状态。', '用攻击回归而非成功页验收', {
        title: 'Spring Security Test：跨租户越权回归',
        language: 'Java',
        code: `@SpringBootTest
@AutoConfigureMockMvc
class OrderSecurityTest {
  @Autowired MockMvc mvc;

  @Test
  @WithMockUser(username = "member-a", roles = "USER")
  void cannotReadOtherTenantOrder() throws Exception {
    mvc.perform(get("/api/orders/O-owned-by-b")
      .header("X-Tenant-Id", "tenant-a"))
      .andExpect(status().isNotFound());
  }
}`,
        output: `✔ cannotReadOtherTenantOrder()

登录用户读取其他租户订单返回 404，避免泄露资源存在性。

审计日志仍记录主体、动作、对象、结果和 requestId，不记录令牌。`,
      }],
    ],
  },
  {
    name: 'Spring Data 仓库代理',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握 JPA/JDBC、事务、代理、查询和分页基础。',
    goal: '能解释 RepositoryFactorySupport 为接口生成代理、方法名查询解析、事务拦截和自定义片段，并定位 N+1 与查询边界。',
    guidedPractice: '为一个 Repository 接口在启动后打印代理类，开启 SQL 日志，调用派生查询、@Query 和自定义实现；用 Pageable 与 Sort 观察生成的 SQL 与总数查询。',
    independentPractice: '实现一个组合仓库接口，包含派生查询、复杂 SQL 和自定义片段，补分页、无结果、N+1 和事务只读测试。',
    commonErrors: ['把方法名派生查询写成超长业务规则，导致 SQL 和可读性不可控。', '在循环中逐条调用关联仓库，误以为 Repository 会批量加载。'],
    sourceRefs: [SPRING_DATA, 'Spring Data Commons repository factory source. https://github.com/spring-projects/spring-data-commons/tree/main/spring-data-commons/src/main/java/org/springframework/data/repository/core/support'],
    steps: [
      ['接口由工厂生成代理', 'RepositoryFactorySupport 读取接口、泛型实体和主键，创建 JDK 代理并处理查询方法、事务和片段组合。调用方看到的是接口，每次调用可能进入不同执行策略，不能从接口名推断所有方法成本。', '仓库接口背后是运行时组合', {
        title: 'Spring Data：打印仓库代理类',
        language: 'Java',
        code: `OrderRepository repository = context.getBean(OrderRepository.class);
System.out.println(repository.getClass().getName());
System.out.println(AopUtils.isAopProxy(repository));
System.out.println(Arrays.toString(repository.getClass().getInterfaces()));`,
        output: `jdk.proxy2.$Proxy78
true
[interface com.example.OrderRepository]

运行时由 JDK 代理组合接口方法，接口本身没有手写实现类。`,
      }],
      ['方法名解析成查询意图', 'PartTree 解析 find、read、delete 等前缀和属性表达式，生成查询条件和排序。复杂 OR、子查询或数据库函数超过派生查询表达能力时，应使用 @Query 或自定义实现，并避免把业务分支藏在超长方法名里。', '派生查询适合简单稳定规则', {
        title: 'Spring Data：派生查询与显式查询',
        language: 'Java',
        code: `interface OrderRepository extends JpaRepository<Order, String> {
  List<Order> findByStatusOrderByCreatedAtDesc(String status);

  @Query("""
      select o from Order o
      where o.customer.id = :customerId
        and o.totalCents >= :minimum
      """)
  List<Order> findLargeOrders(String customerId, long minimum);
}`,
        output: `findByStatusOrderByCreatedAtDesc 生成状态过滤和创建时间倒序。

复杂条件使用 @Query，意图比超长方法名清楚，JPQL 也能单独审查。`,
      }],
      ['事务通常由上层边界控制', 'SimpleJpaRepository 的写方法通常带事务语义，但业务服务若需要多个仓库操作原子提交，应在服务层使用同一个事务管理器。跨线程或跨数据源时会切换原始事务，不能把仓库代理当成全局事务。', '业务事务要覆盖完整用例', {
        title: 'Spring Data：业务服务事务边界',
        language: 'Java',
        code: `@Service
class PlaceOrder {
  private final OrderRepository orders;
  private final OutboxRepository outbox;

  @Transactional
  public void execute(Order order) {
    orders.save(order);
    outbox.save(Outbox.of("order.created", order.id()));
  }
}`,
        output: `订单与 Outbox 记录在同一业务事务中提交。

仓库自带写方法事务被外层 REQUIRED 事务加入，不会各自独立提交。`,
      }],
      ['自定义片段保持接口一致', '自定义实现要按约定命名并实现对应片段接口，组合后的代理会把方法路由到实现。返回类型、分页参数和事务注解必须与调用契约一致，否则编译通过但运行时方法无法解析；代理方法来源要有断言。', '片段是显式行为边界', {
        title: 'Spring Data：组合自定义片段',
        language: 'Java',
        code: `interface OrderSearch {
  List<Order> search(OrderFilter filter);
}

class OrderSearchImpl implements OrderSearch {
  public List<Order> search(OrderFilter filter) {
    return entityManager.createQuery("...", Order.class)
      .setMaxResults(filter.limit()).getResultList();
  }
}

interface OrderRepository extends JpaRepository<Order, String>, OrderSearch {}`,
        output: `OrderRepository.search 由 OrderSearchImpl 执行，其余 CRUD 方法由 Spring Data 实现。

组合后的代理按方法来源路由，片段方法也可独立测试。`,
      }],
      ['先抓 SQL 再看 N+1', '为一次请求记录语句数量、参数、行数、耗时和关联加载，N+1 通常表现为父记录一条、子记录 N 条。用批量抓取、投影或专用查询修复，并验证分页总数、空集合和大关联不会产生新的内存问题。', '语句数是一等性能指标', {
        title: 'PowerShell + PostgreSQL：比较 N+1 与批量查询',
        language: 'PowerShell',
        code: `$sql = @'
select count(*) as statements, sum(calls) as calls
from pg_stat_statements
where query like '%order_item%';
'@
psql $env:DATABASE_URL -c $sql
curl.exe -s http://127.0.0.1:8080/api/orders?size=50 > before.json
psql $env:DATABASE_URL -c $sql
curl.exe -s http://127.0.0.1:8080/api/orders-optimized?size=50 > after.json`,
        output: `before: statements=51, calls=51
after: statements=2, calls=2

响应业务结果一致，SQL 数量显著下降。再用耗时和行数确认没有产生超大 join。`,
      }],
    ],
  },
  {
    name: 'MyBatis MapperProxy 执行链',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '掌握 MyBatis 映射、SqlSession、JDBC、事务和动态代理。',
    goal: '能沿 MapperProxy、SqlSession、Executor、StatementHandler 和 ResultSetHandler 解释一次 Mapper 调用，并实现受控插件定位 N+1。',
    guidedPractice: '开启 MyBatis SQL 日志，在 MapperProxy.invoke、SqlSessionTemplate、Executor.query 和 ResultSetHandler 处断点；调用一个关联查询，记录参数、SQL、结果映射和事务连接。',
    independentPractice: '实现一个只测量执行时间和行数的 MyBatis Interceptor，修复一个 N+1 查询并提交 SQL 数量、耗时和结果一致性测试。',
    commonErrors: ['把 Mapper 接口当成普通接口直接 new，忽略它需要 SqlSession 和映射配置。', '在插件中修改 SQL 或结果却不验证代理链、参数和事务，导致隐蔽行为。'],
    sourceRefs: [MYBATIS, 'MyBatis source. https://github.com/mybatis/mybatis-3'],
    steps: [
      ['MapperProxy 把方法转成 MappedStatement', 'Mapper 接口由 MapperProxy 代理，调用时根据方法签名找到 MappedStatement，再通过 SqlSession 选择 Executor 执行。接口没有实现类也能调用，前提是映射注册和方法解析正确。', '方法名不是唯一身份，Statement 才是', {
        title: 'MyBatis：调用 Mapper 并查看代理',
        language: 'Java',
        code: `OrderMapper mapper = sqlSession.getMapper(OrderMapper.class);
System.out.println(mapper.getClass().getName());
OrderView order = mapper.findById("O-1");
System.out.println(order.id());`,
        output: `jdk.proxy2.$Proxy42
O-1

Mapper 接口由 MapperProxy 实现。调用 findById 后解析到对应 MappedStatement，再进入 SqlSession。`,
      }],
      ['SqlSessionTemplate 管理安全会话', '与 Spring 集成时，SqlSessionTemplate 为每次调用提供线程安全的会话代理，并把连接和事务绑定交给 Spring。直接持有原生 SqlSession 跨线程使用会破坏资源和事务边界。', '会话生命周期跟随调用与事务', {
        title: 'Spring + MyBatis：模板复用安全会话',
        language: 'Java',
        code: `@Service
class OrderQuery {
  private final SqlSessionTemplate sqlSession;

  OrderQuery(SqlSessionTemplate sqlSession) {
    this.sqlSession = sqlSession;
  }

  OrderView find(String id) {
    return sqlSession.getMapper(OrderMapper.class).findById(id);
  }
}`,
        output: `每次调用通过 SqlSessionTemplate 获得线程安全代理，并在 Spring 事务中复用连接。

服务不保存原生 SqlSession，也不跨线程传会话。`,
      }],
      ['Executor 与 StatementHandler 分层', 'Executor 负责查询/更新、缓存与事务协作，StatementHandler 负责 JDBC 语句和参数准备，ResultSetHandler 把结果映射为对象。插件可按这四类接口代理，但修改 SQL 时要处理数据库方言和参数位置。', '先定位层，再决定插件点', {
        title: 'MyBatis：Interceptor 记录 SQL 耗时',
        language: 'Java',
        code: `@Intercepts({
  @Signature(type = Executor.class, method = "query",
    args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
})
class SqlTimingPlugin implements Interceptor {
  public Object intercept(Invocation invocation) throws Throwable {
    MappedStatement statement = (MappedStatement) invocation.getArgs()[0];
    long start = System.nanoTime();
    try {
      return invocation.proceed();
    } finally {
      log.info("{} {}ms", statement.getId(), (System.nanoTime() - start) / 1_000_000);
    }
  }
}`,
        output: `OrderMapper.findById 8ms
OrderMapper.findItems 42ms

插件只测量 Executor 调用，不修改 SQL 和结果。生产需评估代理额外开销和日志量。`,
      }],
      ['一级缓存有 SqlSession 边界', '一级缓存通常限定在同一个 SqlSession 内，Spring 事务中连接和会话复用会影响命中；不同事务之间不要期待共享缓存。二级缓存需要显式配置和失效策略，不能把旧读问题隐藏在缓存命中率下。', '缓存范围必须写清', {
        title: 'MyBatis：一级缓存边界',
        language: 'Java',
        code: `try (SqlSession session = factory.openSession()) {
  OrderMapper mapper = session.getMapper(OrderMapper.class);
  OrderView first = mapper.findById("O-1");
  OrderView second = mapper.findById("O-1");
  System.out.println(first == second);
  session.clearCache();
  OrderView third = mapper.findById("O-1");
  System.out.println(first == third);
}`,
        output: `true
false

同一 SqlSession 中第二次命中一级缓存，clearCache 后重新查询。不同事务/会话不保证共享。`,
      }],
      ['以 SQL 数量和映射结果验收', '测试记录每个 Statement 的参数、SQL、行数、耗时和异常，N+1 通过批量查询或 join 修复后重跑。对动态 SQL 额外检查空集合、注入参数和分页边界，插件只做可观测增强，不偷偷改变业务结果。', '查询成本和结果同时验证', {
        title: 'Spring + MyBatis：N+1 修复回归',
        language: 'Java',
        code: `@SpringBootTest
class OrderQueryTest {
  @Autowired OrderMapper mapper;
  @Autowired SqlCapture capture;

  @Test
  void loadsItemsInOneQuery() {
    capture.clear();
    List<OrderView> rows = mapper.findRecent(50);
    assertEquals(50, rows.size());
    assertEquals(2, capture.sqlCount());
    assertTrue(rows.stream().allMatch(row -> !row.items().isEmpty()));
  }
}`,
        output: `✔ loadsItemsInOneQuery()

订单查询与批量明细共 2 条 SQL，结果仍包含 50 个订单及明细。修复前后 SQL 数量与业务结果一起验收。`,
      }],
    ],
  },
  {
    name: 'Spring Cloud Gateway 过滤器链',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握 WebFlux、HTTP、认证、限流和 Spring Boot 配置。',
    goal: '能解释 RoutePredicate、RouteLocator、GlobalFilter 与 GatewayFilter 链，追踪路由匹配和响应写回，并实现可控认证与限流。',
    guidedPractice: '配置两条按路径和 Header 匹配的路由，在 RoutePredicateHandlerMapping、FilteringWebHandler 和 GlobalFilter 处记录 routeId、过滤器顺序和响应状态；调用一个超时下游观察错误。',
    independentPractice: '实现租户灰度与按 Key 限流过滤器，覆盖路由未匹配、认证失败、限流拒绝、下游超时和响应已提交后的异常。',
    commonErrors: ['在网关过滤器里做长阻塞调用，占住 WebFlux 事件循环线程。', '尝试在响应已提交后再次修改状态码，导致错误只出现在日志而客户端看不到。'],
    sourceRefs: [SPRING_CLOUD, 'Spring Cloud Gateway source. https://github.com/spring-cloud/spring-cloud-gateway'],
    steps: [
      ['路由定义由谓词和过滤器组成', 'RouteDefinition 包含 id、目标 URI、Predicate 和 Filter，RouteLocator 把配置转换成可匹配路由。多个谓词对同一请求必须同时满足，路径、Header、方法和权重规则要有确定性优先级。', '先确认请求命中了哪条路由', {
        title: 'Spring Cloud Gateway：按路径路由',
        language: 'YAML',
        code: `spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: http://orders-service:8080
          predicates:
            - Path=/api/orders/**
        - id: inventory
          uri: http://inventory-service:8080
          predicates:
            - Path=/api/inventory/**`,
        output: `/api/orders/O-1 命中 orders 路由，转发到 orders-service。
/api/inventory/SKU-1 命中 inventory 路由。

路径谓词范围必须与后端服务边界一致。`,
      }],
      ['FilteringWebHandler 组合全局与路由过滤器', '匹配后请求进入过滤器链，GlobalFilter 和 GatewayFilter 按 Order 排序，围绕下游请求执行前置与后置逻辑。过滤器可以改写请求头、限流或短路，但顺序错误会让认证和追踪失效。', '过滤器顺序本身就是策略', {
        title: 'Spring Cloud Gateway：全局过滤器记录路由',
        language: 'Java',
        code: `@Component
class RouteTraceFilter implements GlobalFilter, Ordered {
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String route = exchange.getAttribute(GATEWAY_ROUTE_ATTR).getId();
    exchange.getResponse().getHeaders().add("X-Route", route);
    return chain.filter(exchange);
  }
  public int getOrder() { return 10; }
}`,
        output: `响应头出现 X-Route: orders。

过滤器在匹配路由后执行，顺序 10 早于普通业务过滤器；认证和追踪顺序要显式审查。`,
      }],
      ['响应提交后不能再自由改写', '网关向下游发送请求并接收响应，过滤器在响应阶段可修改尚未提交的响应头和状态。若已经写出部分 body，再尝试修改状态会失败；错误处理要使用统一异常入口并在提交前决定。', '先判断 commit 状态再写响应', {
        title: 'Spring Cloud Gateway：响应提交状态',
        language: 'Java',
        code: `return chain.filter(exchange)
  .onErrorResume(error -> {
    ServerHttpResponse response = exchange.getResponse();
    if (response.isCommitted()) {
      return response.setComplete();
    }
    response.setStatusCode(HttpStatus.BAD_GATEWAY);
    return response.writeWith(Mono.just(
      response.bufferFactory().wrap("{\\"code\\":\\"UPSTREAM_FAILED\\"}".getBytes())
    ));
  });`,
        output: `响应未提交时返回 502 和稳定错误 JSON。

已经提交部分正文时只结束流，不能假装重写状态码；记录 requestId 供排查。`,
      }],
      ['认证策略放在入口边界', 'JWT、会话或外部认证在网关验证后，要把主体和请求 ID 以受控头或上下文传给后端，并防止客户端伪造。内部服务不能仅信任任意 Header，网关和后端要共享信任边界与签名策略。', '网关通过不等于后端信任任意头', {
        title: 'Spring Cloud Gateway：认证过滤器',
        language: 'Java',
        code: `@Component
class AuthFilter implements GlobalFilter, Ordered {
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String token = exchange.getRequest().getHeaders().getFirst(AUTHORIZATION);
    if (token == null || !token.startsWith("Bearer ")) {
      exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
      return exchange.getResponse().setComplete();
    }
    String subject = verifier.verify(token.substring(7));
    ServerHttpRequest request = exchange.getRequest().mutate()
      .headers(headers -> headers.set("X-Subject", subject)).build();
    return chain.filter(exchange.mutate().request(request).build());
  }
  public int getOrder() { return -100; }
}`,
        output: `无 Bearer 令牌直接返回 401；有效令牌把主体写入内部请求头。

后端必须只信任网关注入头，并在网络层拒绝外部直接访问该服务。`,
      }],
      ['用路由矩阵验收', '测试路由匹配、过滤器顺序、超时、限流、灰度、认证拒绝和下游 5xx，记录 routeId、状态、耗时和 trace。压测事件循环与连接池，避免某个过滤器阻塞拖垮全部租户。', '每条路由都有失败样例', {
        title: 'PowerShell：网关路由矩阵',
        language: 'PowerShell',
        code: `curl.exe -i http://127.0.0.1:8080/api/public/health
curl.exe -i http://127.0.0.1:8080/api/orders/O-1
curl.exe -i http://127.0.0.1:8080/api/orders/O-1 -H "Authorization: Bearer $env:TOKEN"
curl.exe -i http://127.0.0.1:8080/api/missing
curl.exe --max-time 2 -i http://127.0.0.1:8080/api/orders/slow`,
        output: `public health: 200 route=public
no token: 401
valid token: 200 route=orders
missing: 404
slow downstream: 504 UPSTREAM_TIMEOUT

每条路由都记录 routeId、状态、耗时和 trace，成功路径不足以验收。`,
      }],
    ],
  },
  {
    name: 'Spring AI Advisor 与 Tool Calling',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Spring Boot、JSON、函数调用、权限边界和基础 LLM API。',
    goal: '能解释 ChatClient 请求、Advisor 处理链、工具定义、参数校验和结果回填，并让工具调用具备授权、确认和可审计边界。',
    guidedPractice: '配置一个只读查询工具和一个人工确认工具，启用请求与工具日志，记录模型输入、工具名、参数、返回、拒绝原因和最终回答；故意传入越权租户 ID。',
    independentPractice: '实现一个订单查询助手，限制可调工具、租户范围、返回字段和调用次数，补提示注入、工具异常和人工确认测试。',
    commonErrors: ['把模型生成的工具参数直接当可信输入执行数据库或命令行操作。', '工具失败后把完整异常和内部路径返回给模型或用户，泄露实现和敏感信息。'],
    sourceRefs: [SPRING_AI, 'OWASP Top 10 for LLM Applications. https://owasp.org/www-project-top-10-for-large-language-model-applications/'],
    steps: [
      ['ChatClient 组合模型与 Advisor', 'ChatClient 接收提示和选项，经过注册的 Advisor 处理上下文、日志或结果，再调用 ChatModel 与模型提供方。Advisor 不是安全边界，请求内容仍需最小化，输出仍需按业务用途验证。', '链式增强不改模型可信度', {
        title: 'Spring AI：注册请求日志 Advisor',
        language: 'Java',
        code: `@Bean
ChatClient chatClient(ChatClient.Builder builder, AuditAdvisor audit) {
  return builder
    .defaultAdvisors(audit)
    .defaultSystem("You answer only order questions. Never expose secrets.")
    .build();
}

String answer = chatClient.prompt()
  .user("Where is order O-1?")
  .call()
  .content();`,
        output: `Advisor 记录 requestId、模型名、耗时和脱敏后的消息。

系统提示只是行为引导，不是权限；工具和返回仍需服务端校验。`,
      }],
      ['工具定义声明输入模式', '工具通过名称、描述和参数 schema 暴露给模型，模型可能生成缺失、错误或恶意参数。服务端必须重新校验类型、范围、租户和对象权限，未知工具或超出白名单的调用直接拒绝。', '模型输出参数必须服务端校验', {
        title: 'Spring AI：只读工具校验租户',
        language: 'Java',
        code: `class OrderTools {
  private final OrderRepository repository;
  private final CurrentUser user;

  @Tool(description = "Read one order visible to the current user")
  OrderView findOrder(@ToolParam(description = "order id") String orderId) {
    if (!orderId.matches("^[A-Z]-[0-9]+$")) {
      throw new IllegalArgumentException("INVALID_ORDER_ID");
    }
    return repository.findForTenant(orderId, user.tenantId())
      .orElseThrow(() -> new IllegalArgumentException("NOT_FOUND"));
  }
}`,
        output: `模型传入合法 ID 时按当前用户租户查询；格式错误或跨租户都返回稳定拒绝。

模型生成的 orderId 不被直接拼进 SQL，也不会跨租户执行。`,
      }],
      ['工具结果要受控回填', '工具返回值会进入下一轮模型上下文，成功结果应只包含完成回答所需字段，错误使用稳定错误码和可读原因。工具调用与最终回答都要记录 trace、用户、资源和结果，便于审计与复现。', '工具结果同样是输入', {
        title: 'Spring AI：最小化工具返回',
        language: 'Java',
        code: `record OrderSummary(String id, String status, long totalCents) {}

OrderSummary summary = repository.findForTenant(id, tenantId)
  .map(order -> new OrderSummary(order.id(), order.status(), order.totalCents()))
  .orElseThrow(() -> new IllegalArgumentException("NOT_FOUND"));

audit.record("tool.findOrder", id, "success");
return summary;`,
        output: `模型上下文只收到 id、状态和总金额，不包含内部备注、密钥或完整客户资料。

错误只返回 NOT_FOUND 等稳定码，审计记录保留调用主体和资源。`,
      }],
      ['高危动作需要人工确认', '写操作、支付、删除和外部通知分为预检、确认、执行三段，确认令牌绑定用户、参数摘要和过期时间。确认前不产生业务副作用，执行后使用幂等键防止重复确认。', '模型不能替代业务授权', {
        title: 'Spring AI：预检与一次性确认',
        language: 'Java',
        code: `record DeletePreview(String token, String orderId, long expiresAt) {}

@Tool
DeletePreview previewDelete(String orderId) {
  OrderView order = tools.findOrder(orderId);
  return confirmations.create(user.id(), "delete-order", order.id(), Duration.ofMinutes(5));
}

@PostMapping("/confirm-delete")
void confirm(@RequestBody ConfirmRequest request) {
  confirmations.consume(user.id(), request.token(), "delete-order");
  orders.delete(request.orderId(), user.tenantId());
}`,
        output: `模型只能生成删除预览，不立即删除订单。

人工确认令牌绑定用户、动作、订单和过期时间；消费一次后失效，重复确认幂等拒绝。`,
      }],
      ['测试提示注入与失败边界', '用恶意文档、越权参数、工具超时、重复调用和模型幻觉构造测试，验证敏感字段不出现、拒绝可解释、调用次数受限。上线监控工具成功率、拒绝率、延迟和敏感查询，异常时关闭工具。', '工具调用要可停用可审计', {
        title: 'Spring AI：注入与越权回归',
        language: 'Java',
        code: `@Test
void rejectsCrossTenantToolArguments() {
  CurrentUser user = new CurrentUser("member-a", "tenant-a");
  OrderTools tools = new OrderTools(repository, user);

  IllegalArgumentException error = assertThrows(
    IllegalArgumentException.class,
    () -> tools.findOrder("O-owned-by-b")
  );
  assertEquals("NOT_FOUND", error.getMessage());
  assertFalse(telemetry.arguments().contains("tenant-b"));
}`,
        output: `✔ rejectsCrossTenantToolArguments()

工具按当前主体租户查询并返回 NOT_FOUND。日志不含被拒绝请求的敏感正文，调用计数和拒绝率可监控。`,
      }],
    ],
  },
  {
    name: 'Spring Boot 条件装配与启动源码',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '完成 refresh、自动配置、Environment 和 SpringApplication 基础课程。',
    goal: '能沿 SpringApplication.run、环境准备、上下文创建、自动配置导入和 Condition 评估解释启动，并实现自定义条件。',
    guidedPractice: '在 SpringApplication.run、AutoConfigurationImportSelector.selectImports、ConditionEvaluator.shouldSkip 断点，切换类路径和属性运行，记录候选配置、过滤原因和 Bean 定义数量。',
    independentPractice: '实现一个只在指定模块和属性同时存在时启用的配置类，使用 ApplicationContextRunner 覆盖所有条件分支，并提交 --debug 条件报告。',
    commonErrors: ['把 @ComponentScan 与自动配置当成同一来源，忽略导入清单和条件过滤。', '自定义 Condition 在启动早期依赖尚未注册的 Bean，导致误判或循环初始化。'],
    sourceRefs: ['Spring Boot SpringApplication Reference. https://docs.spring.io/spring-boot/reference/features/spring-application.html', 'Spring Boot AutoConfigurationImportSelector source. https://github.com/spring-projects/spring-boot/blob/main/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java'],
    steps: [
      ['SpringApplication 准备环境与上下文', 'SpringApplication.run 推断应用类型，加载监听器和初始化器，准备 ConfigurableEnvironment，再创建对应 ApplicationContext 并调用 refresh。日志和异常在环境准备、上下文刷新和运行回调阶段含义不同。', '启动参数先进入 Environment', {
        title: 'Spring Boot：观察启动事件',
        language: 'Java',
        code: `SpringApplication application = new SpringApplication(App.class);
application.addListeners((ApplicationListener<ApplicationEnvironmentPreparedEvent>) event -> {
  System.out.println("env=" + event.getEnvironment().getActiveProfiles().length);
});
application.addListeners((ApplicationListener<ApplicationReadyEvent>) event ->
  System.out.println("ready=" + event.getApplicationContext().getBeanDefinitionCount()));
application.run(args);`,
        output: `env=1
ready=148

环境准备事件早于 Bean 创建，ready 发生在 refresh 完成之后。`,
      }],
      ['AutoConfigurationImportSelector 生成候选', '自动配置导入选择器读取 imports 清单，结合排除项、属性和导入过滤得到候选配置类。候选不等于最终生效，后续还要经过 Conditions 和 Bean 定义注册。', '候选、条件和注册是三段', {
        title: 'Spring Boot：查看自动配置候选',
        language: 'Java',
        code: `List<String> imports = AutoConfigurationImportSelector
  .getAutoConfigurationEntry(metadata, attributes)
  .getConfigurations();
System.out.println(imports.size());
System.out.println(imports.stream()
  .filter(name -> name.contains("Audit"))
  .toList());`,
        output: `142
[com.example.audit.AuditAutoConfiguration]

候选清单包含 Audit 配置，但此时尚未评估条件，也未创建或注册 Bean。`,
      }],
      ['Condition 决定是否跳过配置', 'ConditionEvaluator 按阶段评估 @ConditionalOnClass、OnBean、OnProperty 等条件，结果写入 ConditionEvaluationReport。Bean 条件依赖注册顺序，配置顺序和 MissingBean 语义必须经过测试。', '条件依赖看到的状态', {
        title: 'Spring Boot：自定义环境条件',
        language: 'Java',
        code: `class OnAuditEnabled implements Condition {
  public boolean matches(ConditionContext context, AnnotatedTypeMetadata meta) {
    String enabled = context.getEnvironment()
      .getProperty("audit.enabled", "false");
    return Boolean.parseBoolean(enabled);
  }
}

@Configuration
@Conditional(OnAuditEnabled.class)
class AuditConfig {}`,
        output: `audit.enabled=true 时 AuditConfig 生效；false 或缺失时跳过。

条件只读取 Environment，不创建业务 Bean，评估报告可解释原因。`,
      }],
      ['自定义 Condition 保持无副作用', '自定义条件实现 Condition，只读取 Environment、类路径和已知上下文状态，不在判断过程中创建业务 Bean 或执行远程调用。条件报告要能说明匹配原因，避免“配置没有生效”只能猜。', '条件评估必须轻量可解释', {
        title: 'Spring Boot：条件报告核对',
        language: 'PowerShell',
        code: `java -jar app.jar --debug --audit.enabled=true > audit-on.log 2>&1
java -jar app.jar --debug --audit.enabled=false > audit-off.log 2>&1
Select-String -Path audit-on.log -Pattern "AuditConfig|OnAuditEnabled" -Context 0,2
Select-String -Path audit-off.log -Pattern "AuditConfig|OnAuditEnabled" -Context 0,2`,
        output: `audit-on.log: AuditConfig matched, audit.enabled=true
audit-off.log: AuditConfig did not match, audit.enabled=false

条件报告直接解释生效/跳过，不依赖猜测或只数 Bean 数量。`,
      }],
      ['用启动矩阵固定行为', '分别测试有/无模块、属性合法/非法、用户 Bean 覆盖、排除配置和启动失败，断言上下文中的 Bean 与退出码。保存 --debug 报告并比较升级前后，自动配置变化才能被审查。', '启动条件要有测试矩阵', {
        title: 'Spring Boot Test：条件组合断言',
        language: 'Java',
        code: `new ApplicationContextRunner()
  .withConfiguration(AutoConfigurations.of(AuditConfig.class))
  .withPropertyValues("audit.enabled=true")
  .run(ctx -> assertThat(ctx).hasSingleBean(AuditClient.class));

new ApplicationContextRunner()
  .withConfiguration(AutoConfigurations.of(AuditConfig.class))
  .withPropertyValues("audit.enabled=false")
  .run(ctx -> assertThat(ctx).doesNotHaveBean(AuditClient.class));`,
        output: `✔ enabled=true 创建 AuditClient
✔ enabled=false 跳过 AuditClient

测试矩阵固定条件行为，升级 Spring Boot 后可比较条件报告和 Bean 断言。`,
      }],
    ],
  },
  {
    name: '框架源码阅读与最小扩展',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成 Spring、JVM 与中间件源码基础，能定位提交和编写失败测试。',
    goal: '能建立版本、入口、调用链、状态、扩展点和失败路径完整的源码卡，以最小补丁或扩展解决一个真实问题。',
    guidedPractice: '选择一个固定 Spring 或 JDK 版本，从公开入口断点到关键实现，记录仓库 tag、文件路径、符号、输入输出和一次失败实验；再用源码依赖或测试复现构建环境。',
    independentPractice: '为一个真实缺陷写失败测试，提出最小扩展或补丁，验证向后兼容、错误消息、性能和无回归，并完成一页答辩材料。',
    commonErrors: ['只复制方法名和结论，不记录版本、提交、调用条件和失败输入。', '为绕过问题在框架内部反射改字段，忽略升级兼容和封装边界。'],
    sourceRefs: [OPENJDK, SPRING],
    steps: [
      ['源码卡先固定版本坐标', '记录项目依赖、Git tag 或提交、JDK、构建工具和源码压缩包来源，再写入口类和符号。没有版本坐标的源码结论会在升级后失效，也不能区分官方源码与反编译结果；同一类名在不同分支可能已经有不同字段和加锁方式。', '版本坐标是第一条证据', {
        title: 'PowerShell：克隆并锁定 Spring Framework 版本',
        language: 'PowerShell',
        code: `git clone --filter=blob:none --branch v6.2.8 https://github.com/spring-projects/spring-framework.git
git -C spring-framework rev-parse HEAD
git -C spring-framework describe --tags --exact-match
java -version
git -C spring-framework status --short`,
        output: `1e3f3f5a7c4f0d4f6faf0c50f208f52f40ef5f08
v6.2.8
openjdk version "21.0.5" 2024-10-15 LTS

源码卡记录 tag、提交、JDK 与工作树状态，后续结论都能回到同一版本。`,
      }],
      ['入口、调用链与状态一起描述', '从公共 API、启动器或事件入口向下追调用，记录参数如何变化、哪些字段保存状态、在哪里加锁或分配资源。只列类名关系不够，必须说明某条输入如何到达错误和副作用；例如 refresh 的失败会留下哪些已注册 Bean、单例和监听器，必须写进调用链。', '调用链要带数据与控制状态', {
        title: 'PowerShell：定位 refresh 的公开入口',
        language: 'PowerShell',
        code: `Push-Location spring-framework
rg -n "public void refresh\\(" spring-context/src/main/java
rg -n "finishRefresh\\(|cancelRefresh\\(" spring-context/src/main/java
git blame -L 530,545 spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java
Pop-Location`,
        output: `AbstractApplicationContext.java:536: public void refresh()
AbstractApplicationContext.java:621: finishRefresh()
AbstractApplicationContext.java:689: cancelRefresh()

源码卡从 refresh 入口连到完成与失败清理，并标出固定提交中的行号。`,
      }],
      ['扩展点先于修改框架', '优先使用 BeanPostProcessor、Advisor、Filter、Converter、Condition 等公开扩展点，并验证顺序和生命周期。若确需补丁，先在独立分支写失败测试，补丁范围保持最小并补文档；反射修改框架私有字段必须给出升级测试和替代方案，不能作为默认做法。', '能扩展就不要改内部', {
        title: 'Java：用 BeanPostProcessor 注入审计代理',
        language: 'Java',
        code: `class AuditPostProcessor implements BeanPostProcessor {
  public Object postProcessAfterInitialization(Object bean, String name) {
    if (bean instanceof PaymentGateway gateway) {
      return (PaymentGateway) Proxy.newProxyInstance(
        bean.getClass().getClassLoader(),
        new Class<?>[] {PaymentGateway.class},
        (proxy, method, args) -> {
          log.info("gateway-call bean={} method={}", name, method.getName());
          return method.invoke(gateway, args);
        });
    }
    return bean;
  }
}`,
        output: `INFO gateway-call bean=paymentGateway method=charge

扩展点只代理目标接口，不修改 Spring 内部。测试需覆盖代理顺序、异常传播和循环依赖。`,
      }],
      ['实验覆盖成功与失败路径', '固定输入、版本和环境，运行正常、边界、异常和恢复四类实验，保存日志、断点变量和测试断言。对照替代实现或回退版本，排除环境噪声与测试偶然性；只证明成功路径不够，源码卡必须写清哪个断言会让错误行为立即失败。', '每条结论都有可复现实验', {
        title: 'Spring Test：同时锁定成功与失败行为',
        language: 'Java',
        code: `new ApplicationContextRunner()
  .withUserConfiguration(AuditConfig.class)
  .withPropertyValues("audit.enabled=true")
  .run(context -> {
    assertThat(context).hasSingleBean(AuditClient.class);
    assertThat(context.getBean(AuditClient.class).target()).isSameAs(paymentGateway);
  });

new ApplicationContextRunner()
  .withUserConfiguration(AuditConfig.class)
  .withPropertyValues("audit.enabled=false")
  .run(context -> assertThat(context).doesNotHaveBean(AuditClient.class));`,
        output: `✔ enabled=true creates one proxied AuditClient
✔ enabled=false leaves AuditClient absent

实验保存版本、属性、Bean 断言和失败路径，升级后可直接重跑。`,
      }],
      ['答辩按证据链陈述', '最终材料按问题、版本、入口、状态、扩展、失败实验和生产验证组织，控制在可复核的篇幅。另一位工程师应能按命令重现，并指出方案升级时需要重新检查的符号和测试；结论、假设和尚未验证项必须分开写，不能把一次断点观察包装成完整机制。', '可复核比篇幅重要', {
        title: 'PowerShell：生成源码卡与回归命令',
        language: 'PowerShell',
        code: `$commit = git -C spring-framework rev-parse --short HEAD
$entry = "AbstractApplicationContext#refresh"
"commit=$commit entry=$entry extension=BeanPostProcessor" | Tee-Object source-card.txt
git -C spring-framework show "$commit:spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java" |
  Select-String -Pattern "public void refresh\\(|finishRefresh\\("
Push-Location spring-framework
./gradlew :spring-context:test --tests "*AuditPostProcessorTests"
Pop-Location`,
        output: `commit=1e3f3f5 entry=AbstractApplicationContext#refresh
536: public void refresh() throws BeansException, IllegalStateException
621: finishRefresh();

BUILD SUCCESSFUL
源码卡、提交、入口和回归测试可以交给另一位工程师独立复现。`,
      }],
    ],
  },
];

const J8_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'SSE 协议与事件格式',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '理解 HTTP 响应、字符编码、长连接和浏览器 EventSource。',
    goal: '能按 WHATWG 规范构造 text/event-stream 事件，处理 id、retry、心跳、断线重连和代理缓冲。',
    guidedPractice: '用 Spring MVC 返回 text/event-stream，发送 event、data、id 和 retry 字段；用 curl -N 观察分块到达时间，再关闭连接并观察浏览器携带 Last-Event-ID 重连。',
    independentPractice: '实现带事件 ID、心跳、重复事件过滤和错误事件的 SSE 端点，覆盖空 data、多行 data、代理超时和客户端频繁断线。',
    commonErrors: ['没有在事件间输出空行，客户端把所有字段合成一个不完整事件。', '只发送 data 而忽略 id 与重连语义，断线后无法判断从哪个事件继续。'],
    sourceRefs: [SSE_SPEC, SPRING],
    steps: [
      ['响应类型和编码先固定', 'SSE 使用 text/event-stream，正文按 UTF-8 解释，响应通常持续打开并通过分块或流式写出。Content-Type 缺字符集、代理压缩或缓冲都可能让事件在客户端成批出现。', '先核对 Content-Type 与首字节', {
        title: 'Spring MVC：SSE 响应头',
        language: 'Java',
        code: `@GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
SseEmitter events() {
  SseEmitter emitter = new SseEmitter(30_000L);
  emitter.send(SseEmitter.event()
    .name("ready")
    .data("connected"));
  return emitter;
}`,
        output: `HTTP/1.1 200 OK
content-type: text/event-stream

event:ready
data:connected

响应保持打开，客户端逐事件读取。代理关闭 buffering 后才能看到实时到达。`,
      }],
      ['字段行和空行定义事件边界', 'event 指定事件类型，data 保存负载，id 设置最后事件标识，retry 给客户端重连间隔建议。一个事件可包含多行 data，行之间用换行组合，事件末尾必须有一个空行；注释行以冒号开头，常用作心跳。', '空行结束事件，不是装饰', {
        title: 'PowerShell + curl：观察 SSE 字段',
        language: 'PowerShell',
        code: `curl.exe -N -s http://127.0.0.1:8080/events

# 预期原始流
# : heartbeat
#
# id: 42
# event: order
# data: {"id":"O-1"}
# data: status=PAID
#`,
        output: `: heartbeat

id: 42
event: order
data: {"id":"O-1"}
data: status=PAID

事件末尾空行结束当前事件；多行 data 由客户端按换行拼接。`,
      }],
      ['重连依赖 Last-Event-ID', '浏览器断开后重新连接时可能发送 Last-Event-ID 请求头，服务端可据此续传。id 应稳定、单调且与业务游标对应，不能每次重连随机变化；服务端要处理 ID 过期和重复事件。', '事件 ID 是可续传游标', {
        title: 'Java：按 Last-Event-ID 续传',
        language: 'Java',
        code: `@GetMapping("/events")
SseEmitter events(@RequestHeader(value = "Last-Event-ID", required = false) Long lastId) {
  long cursor = lastId == null ? 0 : lastId;
  return streamEventsAfter(cursor);
}

// 每个事件使用单调递增、与存储游标一致的 id
// emitter.send(SseEmitter.event().id(String.valueOf(cursor)).data(payload));`,
        output: `首次连接 lastId 为空，从 0 开始。
断开后浏览器携带 Last-Event-ID: 42，服务端从 43 继续发送，避免重复。`,
      }],
      ['用网络工具验证流式行为', 'curl -N 禁用缓冲，记录响应头、首事件时间、事件间隔和结束原因；浏览器的 EventSource 可检查 readyState 与 error。只有端到端都逐事件到达，才能排除网关或压缩层的聚合。', '首事件与间隔都要测量', {
        title: 'PowerShell：逐事件计时',
        language: 'PowerShell',
        code: `curl.exe -N -s -D headers.txt -o stream.txt --write-out "status=%{http_code} first=%{time_starttransfer}s total=%{time_total}s\\n" http://127.0.0.1:8080/events
Get-Content headers.txt
Get-Content stream.txt -Tail 20`,
        output: `status=200 first=0.032s total=5.002s
content-type: text/event-stream
x-accel-buffering: no

首字节 32ms 说明流已开始；事件间隔还需按发出时间核对。`,
      }],
      ['生产流必须有生命周期上限', '即使客户端不关闭，服务端也应设置最大连接时长、心跳间隔和空闲超时，并在关闭时发送可识别的终止事件。记录连接 ID、最后事件 ID、重连次数和取消原因，便于容量与故障分析；超时与取消都必须触发同一清理。', '长连接也要有终点', {
        title: 'Java：SSE 心跳与最大时长',
        language: 'Java',
        code: `SseEmitter emitter = new SseEmitter(30_000L);
ScheduledFuture<?> heartbeat = scheduler.scheduleAtFixedRate(() -> {
  try { emitter.send(SseEmitter.event().comment("heartbeat")); }
  catch (IOException error) { emitter.completeWithError(error); }
}, 10, 10, TimeUnit.SECONDS);

emitter.onCompletion(() -> heartbeat.cancel(true));
emitter.onTimeout(() -> {
  heartbeat.cancel(true);
  emitter.complete();
});`,
        output: `每 10 秒发送注释心跳，连接最长 30 秒。

完成或超时都会取消定时器。客户端断线和上游任务也要通过同一幂等清理函数收口。`,
      }],
    ],
  },
  {
    name: 'SseEmitter 生命周期',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Spring MVC 异步请求、Servlet 容器和 SSE 协议。',
    goal: '能解释 SseEmitter 的异步请求、send、complete、超时和错误回调，确保客户端断开后取消上游任务并清理资源。',
    guidedPractice: '返回 SseEmitter(30_000L)，注册 onCompletion、onTimeout、onError，定时发送事件；在 curl 中途 Ctrl+C，观察回调顺序和线程名，再检查发送者是否停止。',
    independentPractice: '实现一个订阅任务流的 SseEmitter 服务，处理断线、超时、上游失败和重复完成，压测后确认线程、连接、队列和订阅都能释放。',
    commonErrors: ['只在 finally 里 complete，却没有监听客户端断线，导致后台任务继续运行。', '从多个线程并发发送未建立顺序控制，事件交错或 IOException 被忽略。'],
    sourceRefs: ['Spring MVC Asynchronous Requests. https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html', SPRING],
    steps: [
      ['SseEmitter 启动异步请求', '控制器返回 SseEmitter 后，Servlet 请求进入异步处理，响应线程可先退出，业务线程通过 send 写事件。complete 结束正常响应，completeWithError 触发错误处理；控制器不能随后再写普通响应。', '返回 emitter 就交出响应控制权', {
        title: 'Spring MVC：返回 SseEmitter',
        language: 'Java',
        code: `@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
SseEmitter stream() {
  SseEmitter emitter = new SseEmitter(30_000L);
  executor.execute(() -> {
    try {
      emitter.send(SseEmitter.event().id("1").data("hello"));
      emitter.complete();
    } catch (IOException error) {
      emitter.completeWithError(error);
    }
  });
  return emitter;
}`,
        output: `HTTP 响应进入异步模式，控制器线程返回。

后台执行器写事件并 complete；请求线程不再写普通响应。`,
      }],
      ['三个回调覆盖主要结束原因', 'onCompletion 在异步请求完成时调用，onTimeout 在容器超时前触发，onError 在发送或上游异常时触发。多个结束原因可能交错，清理逻辑要幂等，用原子状态确保只取消一次。', '结束回调必须可重入清理', {
        title: 'Spring MVC：注册 emitter 结束回调',
        language: 'Java',
        code: `AtomicBoolean closed = new AtomicBoolean();
Runnable cleanup = () -> {
  if (closed.compareAndSet(false, true)) {
    upstream.cancel();
    scheduler.shutdownNow();
    log.info("sse-cleaned");
  }
};
emitter.onCompletion(cleanup);
emitter.onTimeout(cleanup);
emitter.onError(error -> cleanup.run());`,
        output: `sse-cleaned

完成、超时、错误三个入口只执行一次清理。原子状态防止重复取消上游或关闭调度器。`,
      }],
      ['客户端断线表现为写失败或完成', '客户端关闭后，下一次 send 可能抛 IOException，也可能先收到完成回调。捕获后应停止调度、取消数据库或模型订阅并记录原因；若仍持续生产事件，只会积累无用任务和日志。', '断开后立即停止上游', {
        title: 'Spring MVC：客户端断开停止任务',
        language: 'Java',
        code: `emitter.onCompletion(() -> {
  subscription.dispose();
  log.info("client-disconnected");
});

producer.subscribe(
  value -> {
    try { emitter.send(value); }
    catch (IOException error) { emitter.completeWithError(error); }
  },
  emitter::completeWithError,
  emitter::complete
);`,
        output: `client-disconnected

客户端断开触发完成回调，订阅被 dispose。后台模型或数据库流不再继续产生无用事件。`,
      }],
      ['发送顺序与背压要自己设计', 'Servlet SSE 不提供浏览器侧的 request(n) 协议，控制器必须使用有界队列、单写者或有序调度器。生产速度超过网络消费时选择阻塞生产者、丢弃低价值事件或关闭连接，不能无限堆内存。', '浏览器不会替你施加背压', {
        title: 'Spring MVC：有界事件队列',
        language: 'Java',
        code: `BlockingQueue<String> queue = new ArrayBlockingQueue<>(256);
executor.execute(() -> {
  while (!closed.get()) {
    String event = queue.poll(500, TimeUnit.MILLISECONDS);
    if (event == null) continue;
    try { emitter.send(SseEmitter.event().data(event)); }
    catch (IOException error) { break; }
  }
});

if (!queue.offer(payload)) {
  emitter.completeWithError(new IllegalStateException("SSE_OVERFLOW"));
}`,
        output: `队列最多保存 256 个待发送事件。

生产超过消费时直接关闭并记录 SSE_OVERFLOW，而不是无限堆积内存。`,
      }],
      ['用资源和事件双验收', '测试正常完成、超时、客户端断开、上游异常和重复 complete，检查每个事件 ID、error 日志、连接数、线程数和队列。修复后运行断开风暴，证明活跃资源能回到基线。', '事件正确且资源归零', {
        title: 'Spring MVC Test：断开后资源归零',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class StreamLifecycleTest {
  @Autowired TestRestTemplate http;

  @Test
  void disconnectStopsUpstreamSubscription() throws Exception {
    var controller = new StreamProbe();
    var response = http.getForEntity("/stream", byte[].class);
    assertEquals(HttpStatus.OK, response.getStatusCode());
    controller.disconnect();
    waitUntil(() -> controller.subscriptionCount() == 0);
    assertEquals(0, controller.activeThreads());
  }
}`,
        output: `✔ disconnectStopsUpstreamSubscription()

客户端断开后订阅数回到 0，调度线程也停止。事件 ID 和错误日志另见流内容断言。`,
      }],
    ],
  },
  {
    name: 'WebFlux 与 Flux 数据流',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解回调、CompletableFuture、HTTP 流和函数式组合。',
    goal: '能解释 Reactive Streams 的订阅、请求、元素、完成和取消信号，使用 Flux 构建非阻塞流并识别阻塞边界。',
    guidedPractice: '创建 cold Flux，在 subscribe 前打印日志，用 log() 观察 request、onNext、onComplete 和 cancel；把阻塞调用放到事件循环，记录线程和延迟，再用 boundedElastic 隔离。',
    independentPractice: '把一个返回 Flux<String> 的 SSE 端点接入两个上游，限制并发、超时和错误传播，并验证客户端断开后上游取消。',
    commonErrors: ['调用 Flux 后没有订阅却期待业务执行，或过早 subscribe 让流脱离响应链。', '在 Netty 事件循环执行阻塞 JDBC、文件或模型调用，导致所有连接延迟上升。'],
    sourceRefs: [REACTOR, 'Spring WebFlux Reference. https://docs.spring.io/spring-framework/reference/web/webflux.html'],
    steps: [
      ['Publisher 在订阅后工作', 'Flux 和 Mono 描述数据流，只有 Subscriber 订阅后才向上游请求数据。onNext 传元素，onComplete 和 onError 是终止信号，Subscription 同时提供 request(n) 与 cancel，调用 subscribeOn/publishOn 会改变执行和信号调度的线程。', '先订阅，再谈执行', {
        title: 'Reactor：观察订阅与请求',
        language: 'Java',
        code: `Flux<Integer> source = Flux.range(1, 3)
  .doOnSubscribe(signal -> System.out.println("subscribe"))
  .doOnNext(value -> System.out.println("next:" + value))
  .doOnComplete(() -> System.out.println("complete"));
System.out.println("before-subscribe");
source.subscribe();`,
        output: `before-subscribe
subscribe
next:1
next:2
next:3
complete

构建 Flux 时没有执行，订阅才触发上游和终止信号。`,
      }],
      ['冷流与热流语义不同', 'cold Flux 通常为每个订阅重新执行源，hot Flux 可能共享已发生事件。HTTP 响应流多为 cold 或按订阅创建，广播和共享缓存需要 share、replay 等操作符，但会引入订阅时机和缓冲边界。', '确定每个订阅是否重新计算', {
        title: 'Reactor：cold Flux 的每订阅执行',
        language: 'Java',
        code: `AtomicInteger executions = new AtomicInteger();
Flux<Integer> cold = Flux.defer(() -> {
  executions.incrementAndGet();
  return Flux.just(1, 2);
});
cold.subscribe();
cold.subscribe();
System.out.println(executions.get());`,
        output: `2

defer 为每个订阅重新调用工厂。若使用 replay/share，第二个订阅可能直接复用已发生元素。`,
      }],
      ['操作符保持非阻塞', 'map、filter、flatMap 等操作符应执行短小纯计算，阻塞 IO 要用适配器或调度器隔离。flatMap 并发度、超时和错误恢复策略必须显式设置，否则大量内部发布者可能形成隐性积压。', '事件循环只做非阻塞工作', {
        title: 'Reactor：阻塞调用隔离到 boundedElastic',
        language: 'Java',
        code: `Flux.range(1, 3)
  .flatMap(value -> Mono.fromCallable(() -> blockingQuery(value))
    .subscribeOn(Schedulers.boundedElastic()), 2)
  .map(result -> "ok:" + result)
  .subscribe(System.out::println);`,
        output: `ok:1
ok:2
ok:3

flatMap 并发限制为 2，阻塞查询在 boundedElastic 执行，不占 Netty 事件循环。`,
      }],
      ['错误是终止信号', '异常沿发布者链传播并结束流，doOnError 适合记录，onErrorResume 可替换降级流。响应开始后不能随意改状态码，错误通常转为 error 事件或关闭流，客户端要能识别终止原因。', '提交响应前后错误策略不同', {
        title: 'Reactor：错误恢复为降级 Mono',
        language: 'Java',
        code: `Mono<String> result = Mono.error(new TimeoutException("upstream"))
  .doOnError(error -> log.warn("stream failed", error))
  .onErrorResume(error -> Mono.just("fallback"));
result.subscribe(System.out::println);`,
        output: `WARN stream failed
fallback

onErrorResume 替换错误流并正常完成。doOnError 只记录，不会自行吞掉异常。`,
      }],
      ['用信号日志和取消测试', 'Reactor log 或 Observation 记录订阅、请求、元素、完成、错误和取消，压测中检查事件循环线程是否阻塞。客户端断开后应看到 cancel 向上游传播，连接、订阅和缓存数量回到基线。', '取消和错误都是验收路径', {
        title: 'Reactor：用 doFinally 记录取消',
        language: 'Java',
        code: `Disposable subscription = Flux.interval(Duration.ofMillis(100))
  .doOnNext(value -> System.out.println("tick:" + value))
  .doFinally(signal -> System.out.println("finally:" + signal))
  .subscribe();

Thread.sleep(250);
subscription.dispose();`,
        output: `tick:0
tick:1
finally:CANCEL

dispose 触发取消信号并完成清理。生产中使用同一 finally 释放连接、订阅和缓存。`,
      }],
    ],
  },
  {
    name: '背压与慢消费者',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '掌握 Flux 订阅协议、SSE、队列和容量控制。',
    goal: '能区分 Reactive Streams 的 request(n)、传输层缓冲和浏览器消费能力，为慢客户端选择有界缓冲、丢弃或断开策略。',
    guidedPractice: '用一个故意缓慢读取的 HTTP 客户端订阅高频 Flux，比较默认队列、limitRate、onBackpressureBuffer(有界)、onBackpressureDrop 和 onBackpressureError 的延迟、内存与错误。',
    independentPractice: '为模型输出设计背压方案，设定每连接队列、单事件大小、总连接数和最长时长，压测慢客户端占比上升时的内存和取消行为。',
    commonErrors: ['在服务端使用无界缓冲吸收慢客户端，短期不报错但内存持续增长。', '以为浏览器 EventSource 会发送 request(n)，忽略 SSE 在传输层仍按字节缓冲。'],
    sourceRefs: [REACTOR, SPRING],
    steps: [
      ['request(n) 是可消费量', 'Reactive Streams 订阅者通过 Subscription.request(n) 声明还能处理多少元素，上游根据需求生产。操作符可以预取、合并和重试，需求不足时会向下游施加背压；这属于进程内协议，不等于客户端网络真的能跟上，因此必须同时记录下游请求量、实际发送量和等待时间。', '先找需求信号在哪里', {
        title: 'Reactor：逐条请求元素',
        language: 'Java',
        code: `Flux.range(1, 5)
  .doOnRequest(n -> System.out.println("request=" + n))
  .subscribe(new BaseSubscriber<Integer>() {
    protected void hookOnSubscribe(Subscription subscription) {
      request(1);
    }
    protected void hookOnNext(Integer value) {
      System.out.println("next=" + value);
      request(1);
    }
  });`,
        output: `request=1
next=1
request=1
next=2
request=1
next=3
request=1
next=4
request=1
next=5

每次消费后只请求一条，日志证明需求信号推动了上游生产。`,
      }],
      ['传输层仍有自己的缓冲', 'WebFlux 写出数据后，Netty、TLS、代理和客户端接收窗口都可能缓冲字节。慢消费者造成写未完成时，服务端需要有连接级水位和超时，不能只依赖 Flux 逻辑需求；代理缓冲开启时，即使服务端每秒写出，客户端也可能十几秒后才成批收到。', '协议背压不等于网络无缓冲', {
        title: 'PowerShell：验证代理是否聚合事件',
        language: 'PowerShell',
        code: `nginx -T 2>&1 | Select-String -Pattern "proxy_buffering|proxy_read_timeout|gzip"
curl.exe -N --limit-rate 2k -D proxy-headers.txt -o proxy-stream.txt http://127.0.0.1:8081/events
curl.exe -N -D direct-headers.txt -o direct-stream.txt http://127.0.0.1:8080/events
Get-Content proxy-headers.txt
Get-Item proxy-stream.txt, direct-stream.txt | Select-Object Name, Length`,
        output: `proxy_buffering on;
proxy_read_timeout 60s;
HTTP/1.1 200
content-type: text/event-stream

proxy-headers: transfer-encoding: chunked, x-accel-buffering: no
direct-stream.txt 正在逐事件增长，proxy-stream.txt 长时间保持不变时说明仍有中间层缓冲。`,
      }],
      ['选择丢弃还是阻塞要按业务', '日志或状态更新可丢弃旧事件，关键事务事件不能静默丢弃；实时 UI 可以合并为最新快照，计费事件必须持久化。onBackpressureBuffer 要有容量和溢出策略，overflow 时应显式报错或关闭；丢弃操作要计数，否则业务方会误以为每个事件都已送达。', '先定义哪些事件可丢', {
        title: 'Reactor：有界缓冲与显式溢出',
        language: 'Java',
        code: `Flux.interval(Duration.ofMillis(10))
  .onBackpressureBuffer(
    128,
    dropped -> meter.counter("stream.buffer.dropped").increment(),
    BufferOverflowStrategy.ERROR)
  .concatMap(value -> Mono.delay(Duration.ofMillis(50)).thenReturn(value))
  .subscribe(
    value -> System.out.println("sent=" + value),
    error -> System.out.println("stream-failed=" + error.getMessage()));`,
        output: `sent=0
sent=1
stream-failed=Could not emit buffer due to lack of requests

缓冲达到 128 后立即失败，并累计 dropped 计数。关键事件不会继续堆积内存。`,
      }],
      ['慢消费者实验覆盖分布', '压测不仅设置一个慢客户端，还要包含快慢比例、断线重连和事件大小变化。记录队列长度、写等待、堆使用、连接数和取消率，找到开始错误增长的水位；只测全快或全慢客户端会掩盖混合负载下某个租户占满连接池的问题。', '慢客户端比例也是输入', {
        title: 'PowerShell：混合快慢 SSE 客户端',
        language: 'PowerShell',
        code: `$url = "http://127.0.0.1:8080/events"
$jobs = 1..60 | ForEach-Object {
  $rate = if ($_ % 3 -eq 0) { "64k" } else { "2k" }
  Start-Job -ArgumentList $url, $rate -ScriptBlock {
    param($target, $limit)
    curl.exe -N -s --limit-rate $limit --max-time 30 $target > $null
  }
}
Start-Sleep -Seconds 10
curl.exe -s http://127.0.0.1:8080/actuator/prometheus |
  Select-String -Pattern "sse_active|stream_queue|jvm_memory_used"
$jobs | Wait-Job | Remove-Job`,
        output: `sse_active_connections 60
stream_queue_items{route="events"} 1842
jvm_memory_used_bytes{area="heap"} 7.8e+08

三分之二连接被限速后，队列与堆同时增长。实验继续记录取消率和首事件延迟，定位开始恶化时的慢客户端比例。`,
      }],
      ['把上限写进接口契约', '为每连接、每用户和全局设置并发与缓冲上限，超限返回 429、关闭连接或降级事件，并给出可观测原因。容量实验后把阈值、告警和回退策略写进运行手册；接口调用方必须知道 429 是否可重试、重连退避多久以及失去哪些事件。', '溢出必须有可预测结果', {
        title: 'WebFlux：连接写入前执行配额',
        language: 'Java',
        code: `return quota.tryAcquire(userId)
  .flatMap(granted -> {
    if (!granted) {
      exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
      exchange.getResponse().getHeaders().set("Retry-After", "5");
      return exchange.getResponse().setComplete();
    }
    return exchange.getResponse().writeAndFlushWith(
      Flux.from(upstream)
        .onBackpressureBuffer(64, dropped -> metrics.increment("sse.overflow"))
        .map(value -> Mono.just(exchange.getResponse().bufferFactory()
          .wrap(("data:" + value + "\\n\\n").getBytes(StandardCharsets.UTF_8)))));
  })
  .doFinally(signal -> quota.release(userId));`,
        output: `配额不足：429 Too Many Requests, Retry-After: 5
正常连接：每个元素单独 flush
缓冲溢出：sse.overflow 计数增加并取消上游

握手阶段拒绝新连接，已建立连接仍有独立队列上限和释放路径。`,
      }],
    ],
  },
  {
    name: '取消、超时与资源释放',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握异步请求、Reactive Streams、线程中断和资源生命周期。',
    goal: '能区分客户端取消、服务端超时、上游失败和正常完成，让取消贯穿 HTTP、模型、数据库和执行器并幂等清理。',
    guidedPractice: '让客户端在模型流中途断开，使用 doFinally、Disposable 或 SseEmitter.onCompletion 记录 cancel 信号；同时设置服务端总超时，观察上游请求、连接和线程是否释放。',
    independentPractice: '实现一个带 60 秒总预算的流式请求，覆盖用户取消、服务端超时、上游 5xx 和正常完成，提交资源计数和最后一个已发送事件。',
    commonErrors: ['客户端消失后只在日志中结束 send 循环，没有取消模型和数据库订阅。', '用 Future.cancel 标记取消就认为底层 IO 已停止，忽略连接和远程任务仍在运行。'],
    sourceRefs: [REACTOR, SPRING],
    steps: [
      ['多种结束原因不能合并成布尔值', '客户端断开、总预算超时、上游错误和正常完成对业务含义不同，至少要记录结束原因、最后事件 ID 和时间。前端可据此重连或提示，后端可据此清理不同资源；只记一个 closed=true 无法判断是否需要续传、告警或检查上游状态。', '结束原因要可观测', {
        title: 'Reactor：记录每种终止信号',
        language: 'Java',
        code: `Flux<String> stream = source
  .doOnNext(value -> lastEvent.set(value))
  .timeout(Duration.ofSeconds(30))
  .doOnError(TimeoutException.class,
    error -> metrics.increment("stream.end", "timeout"))
  .doOnError(error -> metrics.increment("stream.end", "error"))
  .doOnComplete(() -> metrics.increment("stream.end", "complete"))
  .doFinally(signal -> {
    if (signal == SignalType.CANCEL) {
      metrics.increment("stream.end", "cancel");
    }
    log.info("stream-end signal={} last={}", signal, lastEvent.get());
  });`,
        output: `stream-end signal=CANCEL last={"id":"42","status":"RUNNING"}
stream.end{reason="cancel"} +1

取消、完成、超时和错误分别计数，并保留最后事件 ID 供续传和排障。`,
      }],
      ['取消要向下游传播', 'Reactor 收到 cancel 后沿链路通知上游，doFinally 可处理 CANCEL 信号；Servlet SseEmitter 需要监听完成或发送失败再取消订阅。取消操作必须幂等，避免重复关闭连接或回调；若上游 SDK 提供 close 或 abort，必须在取消信号的同一清理路径调用。', '拿到取消句柄才能止损', {
        title: 'WebFlux：客户端断开时取消上游',
        language: 'Java',
        code: `@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
Flux<ServerSentEvent<String>> stream() {
  return modelClient.generate("...")
    .map(token -> ServerSentEvent.builder(token).id(token.id()).build())
    .doFinally(signal -> {
      if (signal == SignalType.CANCEL) {
        log.info("client-cancelled request={}", RequestContext.id());
      }
    });
}`,
        output: `client-cancelled request=req-7f21
model.upstream.closed request=req-7f21 reason=cancel

浏览器关闭响应后，WebFlux 取消响应发布者，取消信号继续传到模型客户端并关闭上游连接。`,
      }],
      ['超时按层建模', '连接超时、首字节超时、单事件间隔和总时长是不同指标，orTimeout、timeout 和容器异步超时作用边界也不同。总预算到达时应主动取消上游，而不是只给客户端一个超时错误后继续后台生成；每层超时都应产生不同错误码和观测标签。', '分层超时分别触发', {
        title: 'Reactor：连接、首事件与总预算分离',
        language: 'Java',
        code: `HttpClient client = HttpClient.create()
  .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 1_000)
  .responseTimeout(Duration.ofSeconds(20));

Flux<Token> stream = client.post().uri("/generate").exchangeToFlux(...)
  .timeout(Duration.ofSeconds(5), Mono.error(new FirstTokenTimeout()))
  .take(Duration.ofSeconds(60))
  .onErrorResume(TimeoutException.class,
    error -> Flux.just(Token.error("STREAM_TIMEOUT")));`,
        output: `CONNECT_TIMEOUT after 1000ms
FIRST_TOKEN_TIMEOUT after 5000ms
STREAM_TIMEOUT after 60000ms

连接、等待首个事件和总流时长分别触发，超时后上游订阅被取消。`,
      }],
      ['阻塞任务要响应中断', 'CompletableFuture 取消通常不会强制终止已运行线程，JDBC 和 HTTP 客户端需要使用各自取消或中断机制。清理逻辑使用 finally 并避免抛出新异常覆盖原结束原因，记录未能取消的资源；线程池任务必须检查中断标志，远程请求还要关闭连接或发送 abort。', '取消最终要触达资源', {
        title: 'Java：取消 Future 并关闭 JDBC Statement',
        language: 'Java',
        code: `AtomicReference<Statement> active = new AtomicReference<>();
Future<?> task = executor.submit(() -> {
  try (Connection connection = dataSource.getConnection();
       Statement statement = connection.createStatement()) {
    active.set(statement);
    try (ResultSet rows = statement.executeQuery("select * from events")) {
      while (!Thread.currentThread().isInterrupted() && rows.next()) {
        emit(rows.getString("payload"));
      }
    }
  } catch (SQLException error) {
    log.warn("query-cancelled", error);
  } finally {
    active.set(null);
  }
});

Cancellation cleanup = () -> {
  task.cancel(true);
  try {
    Statement statement = active.getAndSet(null);
    if (statement != null) statement.cancel();
  } catch (SQLException error) {
    log.warn("statement-cancel-failed", error);
  }
};`,
        output: `task.cancel(true) 只设置中断，正在阻塞的 JDBC 驱动未必立即返回。
statement.cancel() 通知数据库停止当前查询。
finally 清空 active 引用，日志同时保留取消失败原因。`,
      }],
      ['用资源基线证明释放', '测试前后比较活跃 HTTP 连接、Netty 订阅、执行器任务、数据库连接和内存队列；断开风暴后运行 GC 与线程采样。只有资源回到基线且日志中具有结束原因，才说明取消完整；测试要等待稳定时间并允许短暂尾延迟，但不能用一次 sleep 掩盖持续泄漏。', '连接、线程、队列分别归零', {
        title: 'Micrometer Test：断开风暴后资源归零',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class StreamCancelTest {
  @Autowired WebTestClient client;
  @Autowired MeterRegistry meters;

  @Test
  void disconnectStormReturnsToBaseline() {
    int before = activeGauge("stream.active");
    Flux.range(1, 100)
      .flatMap(id -> client.get().uri("/stream?id=" + id)
        .exchangeToFlux(response -> response.bodyToFlux(String.class))
        .take(1), 20)
      .blockLast();
    await().atMost(Duration.ofSeconds(5))
      .until(() -> activeGauge("stream.active") == before);
    assertThat(meter("model.upstream.active").gauge().value()).isZero();
  }
}`,
        output: `✔ disconnectStormReturnsToBaseline()
stream.active: 100 -> 0
model.upstream.active: 100 -> 0
executor.active: 8 -> 0

资源在 5 秒内回到基线，完成、取消和错误计数之和等于 100 次连接。`,
      }],
    ],
  },
  {
    name: 'Nginx、Ingress 与代理缓冲',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 HTTP 分块、反向代理、TLS 和 Kubernetes Ingress。',
    goal: '能定位代理缓冲、压缩、读超时和连接复用对流式响应的影响，按环境配置并完成回滚。',
    guidedPractice: '同一 SSE 端点分别直连、经 Nginx 和经 Kubernetes Ingress 访问，记录首字节、事件间隔、响应头与连接关闭；为 Nginx 设置 proxy_buffering off、proxy_read_timeout 和 X-Accel-Buffering 后对比。',
    independentPractice: '为一个流式服务编写代理层验收清单，覆盖超时、缓冲、压缩、TLS、keepalive、限流和错误页，提交配置差异、证据与回滚命令。',
    commonErrors: ['只改应用响应头，没有检查 Nginx proxy_buffering 或云负载均衡聚合。', '把压缩当成总是减少延迟，忽略 gzip 或压缩中间件可能等待缓冲。'],
    sourceRefs: [NGINX, K8S],
    steps: [
      ['缓冲会改变事件到达时间', 'Nginx 默认可能缓冲上游响应再发给客户端，长连接事件会成批出现。proxy_buffering off 或在受支持时返回 X-Accel-Buffering: no 可让响应更及时，但还会受缓存、压缩和缓冲区大小影响；验证时必须同时观察首事件和连续事件间隔，不能只看最终响应是否完整。', '先测首字节和事件间隔', {
        title: 'Nginx：关闭 SSE 代理缓冲',
        language: 'nginx',
        code: `location /events {
    proxy_pass http://app:8080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 65s;
}

# 应用响应头可直接返回：X-Accel-Buffering: no`,
        output: `curl -N 输出按事件持续到达：

t=0.03s event: ready
t=1.04s event: token
t=2.05s event: token

若关闭前事件在 t=10s 一次出现，说明代理或压缩层仍发生聚合。`,
      }],
      ['超时参数要覆盖长连接语义', 'proxy_read_timeout 约束等待上游两次读之间的时间，proxy_send_timeout 和客户端超时也可能中断连接。心跳间隔必须小于最窄层超时，HTTP/1.1 的逐跳 Connection 头要由正确代理处理；负载均衡、Ingress、应用和浏览器任一层先超时，都会表现为同一种断线。', '逐层列出最小时钟', {
        title: 'Nginx：把心跳放进超时窗口',
        language: 'nginx',
        code: `upstream stream_app {
    server app-1:8080;
    server app-2:8080;
    keepalive 32;
}

server {
    location /events {
        proxy_pass http://stream_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 45s;
        proxy_send_timeout 45s;
    }
}

# 应用每 10 秒发送 ": heartbeat"，小于代理 45 秒空闲窗口。`,
        output: `: heartbeat t=10s
: heartbeat t=20s
: heartbeat t=30s
: heartbeat t=40s

桥接事件在 45 秒内持续出现，连接不会因两次业务事件间隔过长被代理提前关闭。`,
      }],
      ['Ingress 由具体控制器实现', 'Kubernetes Ingress 只是路由资源，缓冲、超时、压缩和连接限制由 Ingress Controller 或云负载均衡决定。注解名称不可跨供应商复制，配置要以实际控制器版本和文档为准；上线前先用 ingress-nginx 的生成配置或控制器日志确认注解真的被读取。', 'Ingress 不是独立代理实现', {
        title: 'ingress-nginx：流式路由注解',
        language: 'YAML',
        code: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: stream
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "45"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "45"
spec:
  ingressClassName: nginx
  rules:
    - host: stream.example.test
      http:
        paths:
          - path: /events
            pathType: Prefix
            backend:
              service:
                name: stream
                port:
                  number: 8080`,
        output: `kubectl describe ingress stream
Annotations: nginx.ingress.kubernetes.io/proxy-buffering: off
Ingress Class: nginx

随后从集群外 curl -N，事件间隔与直连一致。更换云厂商时必须重新核对注解和负载均衡监听器。`,
      }],
      ['TLS 和压缩可能额外缓冲', 'TLS 终止点、压缩器、WAF 和 CDN 都可能聚合数据或限制响应体。验证链路时逐跳 curl，记录 Via、Server-Response 和自建请求头，避免在应用内反复修改却看不到效果；SSE 通常应关闭 gzip/br 动态压缩，因为压缩器需要攒数据才能有效压缩。', '逐跳排除，而非全链路猜', {
        title: 'PowerShell：逐跳检查响应和压缩',
        language: 'PowerShell',
        code: `$paths = @(
  "http://127.0.0.1:8080/events",
  "http://127.0.0.1:8081/events",
  "https://stream.example.test/events"
)
foreach ($uri in $paths) {
  curl.exe -sS -N --max-time 4 -D - -o NUL -H "Accept-Encoding: gzip, br" $uri |
    Select-String -Pattern "HTTP/|content-encoding|via:|server:|x-request-id"
}`,
        output: `HTTP/1.1 200 OK
server: nginx
x-request-id: edge-a91

HTTP/2 200
content-encoding: gzip
via: 1.1 edge-cdn

直连未压缩，CDN 边缘返回 gzip，事件聚合问题应继续在 CDN 压缩或缓存层排查。`,
      }],
      ['变更配置必须可回滚', '保存代理配置版本、灰度范围、验证命令和回滚步骤，在预发和一个小流量入口先验证。上线后监控首事件延迟、连接数、错误和超时，异常时恢复上一版配置而不是临时反复试参数；回滚后还要用同一 curl 和仪表盘证明事件恢复逐条到达。', '代理配置也是发布制品', {
        title: 'PowerShell：Nginx 与 Ingress 灰度回滚',
        language: 'PowerShell',
        code: `nginx -t
nginx -s reload
kubectl -n edge get configmap nginx-config -o yaml > nginx-config.before.yaml
kubectl -n edge rollout status deployment/ingress-nginx-controller --timeout=120s
curl.exe -N --max-time 8 -sS https://stream.example.test/events > stream.after.txt
kubectl -n edge rollout undo deployment/ingress-nginx-controller --to-revision=12
kubectl -n edge rollout status deployment/ingress-nginx-controller --timeout=120s`,
        output: `nginx: configuration file /etc/nginx/nginx.conf test is successful
deployment "ingress-nginx-controller" successfully rolled out
stream.after.txt: 6 个事件，首事件 0.041s
deployment "ingress-nginx-controller" rolled back to revision 12

回滚前后命令、配置、事件数量和首个事件时间都保存在发布记录中。`,
      }],
    ],
  },
  {
    name: '流式接口可观测性',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握 Micrometer、日志、Trace、SSE 和 WebFlux 基础。',
    goal: '能定义连接、首事件、事件速率、取消、超时和错误指标，把一次流式请求从入口关联到上游。',
    guidedPractice: '用 Micrometer 记录活跃 SSE 连接、首事件耗时、事件数、发送错误和取消原因；在一次请求中注入 trace ID，在应用、代理和上游日志中检索同一 ID。',
    independentPractice: '为一个模型流式接口建立仪表盘和告警，覆盖正常完成、客户端取消、上游超时和慢消费者，提交指标含义、阈值和排查流程。',
    commonErrors: ['用普通 HTTP 请求耗时描述长连接服务，导致活跃连接和首事件延迟被平均值掩埋。', '只记录开始和结束，没有事件数量、最后 ID 和结束原因，故障后无法判断流在哪一阶段停止。'],
    sourceRefs: [OTEL, 'Micrometer Documentation. https://docs.micrometer.io/micrometer/reference/'],
    steps: [
      ['把流拆成生命周期指标', '连接建立、首事件、持续时长、最后成功事件和结束原因分别测量，计数记录开始、完成、取消、错误和超时，直方图记录首事件与总时长。普通请求耗时不能反映仍在运行的长连接；活跃连接还必须是瞬时 Gauge，否则连接结束后无法与上游占用对照。', '生命周期事件分别计数', {
        title: 'Micrometer：记录连接与首事件',
        language: 'Java',
        code: `Counter ended = Counter.builder("stream.ended")
  .tag("route", route).register(registry);
Timer firstEvent = Timer.builder("stream.first.event")
  .tag("route", route).register(registry);
Gauge.builder("stream.active", connections, AtomicInteger::get)
  .tag("route", route).register(registry);

connections.incrementAndGet();
Timer.Sample sample = Timer.start(registry);
source.doOnNext(value -> {
  if (first.compareAndSet(false, true)) {
    sample.stop(firstEvent);
  }
}).doFinally(signal -> {
  connections.decrementAndGet();
  ended.tag("reason", signal.name().toLowerCase()).increment();
});`,
        output: `stream.active{route="chat"} 37
stream.first.event_count{route="chat"} 34
stream.ended_total{route="chat",reason="cancel"} 9
stream.ended_total{route="chat",reason="complete"} 25

活跃连接、首事件分布和结束原因可以分别聚合。`,
      }],
      ['事件吞吐和大小要单列', '记录每秒事件数、事件字节数、发送队列长度和写等待时间，事件大小分布能解释大对象序列化和代理压力。按路由、模型、租户和结束原因设置有限标签，避免高基数吞掉监控系统；用户 ID 和请求 ID 应放日志或 Trace，不能直接做指标标签。', '标签基数也是容量问题', {
        title: 'Micrometer：事件大小与队列水位',
        language: 'Java',
        code: `DistributionSummary bytes = DistributionSummary.builder("stream.event.bytes")
  .baseUnit("bytes")
  .publishPercentileHistogram()
  .tag("route", "chat")
  .register(registry);
Counter emitted = Counter.builder("stream.events").tag("model", model).register(registry);
Gauge.builder("stream.queue.depth", queue, BlockingQueue::size)
  .tag("route", "chat").register(registry);

for (byte[] event : batch) {
  bytes.record(event.length);
  emitted.increment();
  queue.put(event);
}`,
        output: `stream.events_total{model="chat-v2"} 14820
stream.event.bytes_count{route="chat"} 14820
stream.event.bytes_max{route="chat"} 42117
stream.queue.depth{route="chat"} 286

事件数量、大小和队列同时增长时，说明大对象与消费不足都可能存在。`,
      }],
      ['Trace 跨越异步边界传播', 'trace ID 应随请求和事件上下文传递到上游 HTTP、模型调用和数据库，日志使用同一 ID 和事件序号。异步线程或 Reactor Context 中要显式传播，否则只能在入口看到一条孤立记录；事件日志还应带连接 ID 和最后一个成功事件，才能把一次流补成完整链路。', '异步链路不能丢上下文', {
        title: 'Reactor：把 trace context 传到模型调用',
        language: 'Java',
        code: `Mono<String> answer = Mono.deferContextual(contextView -> {
  String traceId = contextView.get("traceId");
  return modelClient.generate(prompt)
    .contextWrite(Context.of("traceId", traceId))
    .doOnNext(token -> log.info(
      "trace={} stream={} seq={} bytes={}",
      traceId, streamId, sequence.incrementAndGet(),
      token.getBytes(StandardCharsets.UTF_8).length));
});

return answer.contextWrite(context -> context.put("traceId", currentTraceId()));`,
        output: `trace=7f21a stream=s-09 seq=1 bytes=18
trace=7f21a stream=s-09 seq=2 bytes=42
trace=7f21a stream=s-09 seq=3 bytes=27

入口、模型调用和事件日志共享 trace，sequence 能指出流停止前最后处理的位置。`,
      }],
      ['告警绑定用户体验', '告警优先关注首事件超时率、错误率、取消率和队列增长，单纯 CPU 高不一定代表问题。为不同租户和路由设置阈值，记录告警对应的代理、上游和版本，减少无行动噪音；取消率需要结合用户主动关闭和网络失败，不能把所有取消都当成故障。', '告警必须指向可执行动作', {
        title: 'PromQL：首事件与错误预算告警',
        language: 'PromQL',
        code: `sum(rate(stream_first_event_seconds_count{route="chat",le="5"}[5m]))
/
sum(rate(stream_first_event_seconds_count{route="chat"}[5m]))

sum(rate(stream_ended_total{route="chat",reason=~"error|timeout"}[5m]))
/
sum(rate(stream_ended_total{route="chat"}[5m]))

max_over_time(stream_queue_depth{route="chat"}[10m]) > 500`,
        output: `首事件 5 秒达标率 = 98.7%
错误或超时占比 = 0.4%
queue depth max = 612

告警规则分别指向体验劣化、错误终止和积压，并携带 dashboard、runbook 和最近发布版本。`,
      }],
      ['用故障注入校准指标', '分别注入客户端断开、上游慢响应、代理缓冲、错误事件和大事件，确认指标变化与真实原因一致。仪表盘要能让值班人回答“影响谁、从何时开始、下一步查哪里”，而不是只展示美丽曲线；每次演练要保存注入参数、指标截图和恢复时间。', '指标要经故障校准', {
        title: 'PowerShell：注入断线与慢事件并核对指标',
        language: 'PowerShell',
        code: `$base = "http://127.0.0.1:8080"
curl.exe -s "$base/actuator/prometheus" > metrics.before.txt
for ($i = 0; $i -lt 20; $i++) {
  $p = Start-Process curl.exe -ArgumentList @(
    "-N","-s","--max-time","2","$base/events?fault=slow")
  Start-Sleep -Milliseconds 250
  $p.Kill()
}
curl.exe -s "$base/actuator/prometheus" > metrics.after.txt
Select-String -Path metrics.after.txt -Pattern "stream_ended_total|stream_active"`,
        output: `stream_ended_total{reason="cancel"} 20
stream_ended_total{reason="timeout"} 2
stream_active 0

注入 20 次短连接和慢首事件后，取消与超时计数按预期变化，活跃连接回到零。`,
      }],
    ],
  },
  {
    name: '流式服务容量与故障实验',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成 SSE、WebFlux、背压、超时、代理和可观测性课程。',
    goal: '能计算长连接的连接数、内存、文件描述符、代理和上游配额，完成慢客户端、断线风暴与上游故障实验。',
    guidedPractice: '用压测工具建立不同并发连接、事件频率和慢客户端比例，记录 CPU、RSS、FD、活跃连接、队列、首事件和取消率；关闭一半连接观察资源回收时间。',
    independentPractice: '为流式模型服务写容量报告与运行手册，给出最大连接、单连接预算、限流、降级、扩容、回滚和告警阈值，并跑一次断线风暴。',
    commonErrors: ['只按平均请求 QPS 估算容量，忽略长连接持续占用和事件大小。', '没有验证代理、数据库和模型上游的配额，只扩容应用副本导致下游先崩溃。'],
    sourceRefs: [SRE, OTEL],
    steps: [
      ['容量单位是连接乘资源', '每个流至少占用连接、对象、缓冲、任务和上下文，内存约为连接固定成本加每连接队列上限与事件大小。文件描述符、TLS、代理表和上游并发也要计入，不能用单纯 QPS 换算；必须先画清单，再用实测值替换估算，保留安全余量。', '按连接建立资源预算', {
        title: 'Java：按连接计算内存与文件描述符',
        language: 'Java',
        code: `record Limits(int connections, int queuePerConnection, int bytesPerEvent) {}

Limits limits = new Limits(9000, 64, 2048);
long queueBytes = (long) limits.connections()
  * limits.queuePerConnection() * limits.bytesPerEvent();
long fixedBytes = (long) limits.connections() * 24_000;
long totalBytes = queueBytes + fixedBytes;
long fdCount = (long) limits.connections() * 2;

System.out.printf("queue=%.1f MiB total=%.1f MiB fd=%d%n",
  queueBytes / 1024.0 / 1024.0,
  totalBytes / 1024.0 / 1024.0,
  fdCount);`,
        output: `queue=1125.0 MiB total=1331.0 MiB fd=18000

9000 个连接仅队列与固定估算就超过 1.3 GiB，另有 TLS、堆对象和上游连接。容量报告必须纳入这些成本。`,
      }],
      ['建立四种负载场景', '测试稳定增量、慢客户端比例上升、突断开线和上游延迟增大，分别记录首事件、错误、连接和内存曲线。容量是在质量目标内可持续的最大负载，不是压到进程崩溃前的峰值；每轮只改变一个主要变量，并保留前一轮指标作为对照。', '场景比单点压测更真实', {
        title: 'k6：稳定、慢速和断线混合场景',
        language: 'JavaScript',
        code: `import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    steady: { executor: 'ramping-vus', startVUs: 20, stages: [
      { target: 200, duration: '2m' }, { target: 200, duration: '3m' }] },
    churn: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s',
      duration: '3m', preAllocatedVUs: 80, exec: 'shortConnection' },
  },
  thresholds: { http_req_failed: ['rate<0.01'] },
};

export default function () {
  const res = http.get(__ENV.URL, { timeout: '60s' });
  if (res.status !== 200) throw new Error('stream status ' + res.status);
  sleep(0.2);
}

export function shortConnection() {
  http.get(__ENV.URL, { timeout: '2s' });
}`,
        output: `steady: 200 VUs, max active connections=200
churn: 20 connections/second, cancel rate=100%
first_event_p95=0.82s
http_req_failed=0.3%
heap_peak=71%

稳定连接与断线风暴同时运行，容量结论来自混合场景而不是单一 VU 峰值。`,
      }],
      ['故障注入验证降级', '让上游模型超时、Redis 不可用、代理重启和大事件突增，观察 429、降级流、事件终止和重连是否按设计。每个组件失败时限定影响范围，不能让一个租户占满所有连接；故障恢复后要验证陈旧队列、重连风暴和错误预算是否回到基线。', '每种故障都有降级路径', {
        title: 'Toxiproxy：注入上游延迟与断开',
        language: 'PowerShell',
        code: `docker run -d --name toxiproxy -p 8474:8474 -p 26379:26379 ghcr.io/shopify/toxiproxy:2.9.0
curl.exe -X POST http://127.0.0.1:8474/proxies -H "Content-Type: application/json" -d '{"name":"redis","listen":"0.0.0.0:26379","upstream":"redis:6379"}'
curl.exe -X POST http://127.0.0.1:8474/proxies/redis/toxics -H "Content-Type: application/json" -d '{"name":"latency","type":"latency","attributes":{"latency":2500,"jitter":500}}'
curl.exe -N --max-time 15 http://127.0.0.1:8080/events
curl.exe -X DELETE http://127.0.0.1:8474/proxies/redis/toxics/latency`,
        output: `event: degraded
data: {"reason":"CACHE_TIMEOUT"}

stream_ended_total{reason="degraded"} 1
redis_latency_ms 2500

Redis 延迟时流返回稳定降级事件，没有让请求无限等待；删除故障后指标恢复。`,
      }],
      ['资源门槛与扩缩容联动', '为连接数、内存、FD、首事件 P99 和上游错误设置水位，达到水位先限流或拒绝新连接，再按安全节奏扩容。缩容要优雅排空长连接，避免一次性关闭导致客户端风暴；仅按 CPU 的 HPA 可能对长连接反应太慢，连接水位要参与扩缩决策。', '先保护，再扩容', {
        title: 'Kubernetes：连接水位驱动的扩缩配置',
        language: 'YAML',
        code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: stream
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: stream
  minReplicas: 8
  maxReplicas: 40
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 900
  metrics:
    - type: Pods
      pods:
        metric:
          name: stream_active_connections
        target:
          type: AverageValue
          averageValue: "450"`,
        output: `8 replicas × 450 = 3600 连接目标水位
达到 80% 水位先由入口返回 429，再扩容
scaleDown 窗口 15 分钟，配合 preStop 摘流和连接排空

扩容和应用拒绝新连接共同保护后端，缩容不会在 1 分钟内切断大量长连接。`,
      }],
      ['运行手册包含恢复证据', '记录命令、仪表盘、回滚版本、代理配置、断线原因和恢复后指标，演练后更新阈值。事故复盘关注为什么没有提前观测和隔离，而不是只写“增加了资源”；恢复证据应包括客户端重新收到事件、队列下降、活跃连接稳定和上游配额未超限。', '容量结论必须可复测', {
        title: 'PowerShell：断线风暴恢复检查',
        language: 'PowerShell',
        code: `$base = "http://127.0.0.1:8080"
$before = (Invoke-RestMethod "$base/actuator/metrics/stream.active").measurements[0].value
1..500 | ForEach-Object -Parallel {
  curl.exe -N -s --max-time 2 "$using:base/events" > $null
} -ThrottleLimit 100
Start-Sleep -Seconds 8
$after = (Invoke-RestMethod "$base/actuator/metrics/stream.active").measurements[0].value
$heap = (Invoke-RestMethod "$base/actuator/metrics/jvm.memory.used?tag=area:heap").measurements[0].value
[pscustomobject]@{ Before=$before; After=$after; HeapBytes=$heap; Limit=0 }`,
        output: `Before After HeapBytes Limit
  120     0 734003200     0

500 次两秒断开在 8 秒内回收，活动连接回到基线。
运行手册同时记录队列、代理连接和模型上游配额，恢复证据可以复测。`,
      }],
    ],
  },
];

const J9_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Kafka 集群、Topic 与 Partition',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握 TCP、HTTP、消息队列基本概念，能启动 Docker 与 Kafka CLI。',
    goal: '能解释 Partition 的顺序与并行边界、副本 Leader/ISR 和消费者并行度，用 CLI 与故障实验验证可用性。',
    guidedPractice: '启动三个 Broker 的单机容器集群，创建三分区两副本 Topic，执行 kafka-topics.sh --describe；关闭一个非 Leader Broker，再关闭 Leader，记录 Leader、ISR 和客户端恢复时间。',
    independentPractice: '为一个订单事件设计 Topic 分区键、副本数、最小同步副本和消费者并发度，注入 Broker 下线并提交消息顺序、缺失和恢复报告。',
    commonErrors: ['只增加消费者数量却不超过分区数，期待消费并行度继续提升。', '把副本数当成写入成功保证，忽略 acks、min.insync.replicas 和 ISR 状态。'],
    sourceRefs: [KAFKA, KAFKA_SOURCE],
    steps: [
      ['Partition 是最小并行单元', 'Topic 被拆成多个 Partition，每个分区内部按追加顺序保存记录；同一分区同一时刻只有一个 Leader 接收写入，消费者组内一个分区通常只分配给一个消费者。分区键决定消息落在哪个分区，也决定跨键顺序边界；键相同只能保证单分区顺序，不能保证整个 Topic 的全局顺序。', '顺序到分区，并行到分区数', {
        title: 'Kafka CLI：创建分区 Topic 并写出分区结果',
        language: 'PowerShell',
        code: `docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --create --topic orders --partitions 3 --replication-factor 2 --config min.insync.replicas=1
"O-1:created" | docker exec -i kafka-1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka-1:9092 --topic orders --property parse.key=true --property key.separator=:
"O-2:paid" | docker exec -i kafka-1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka-1:9092 --topic orders --property parse.key=true --property key.separator=:
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders`,
        output: `Topic: orders Partition: 0 Leader: 1 Replicas: 1,2 Isr: 1,2
Topic: orders Partition: 1 Leader: 2 Replicas: 2,3 Isr: 2,3
Topic: orders Partition: 2 Leader: 3 Replicas: 3,1 Isr: 3,1

订单按 key 落到某个分区；同一 O-1 的后续事件保持分区内顺序，三个分区提供读取并行度。`,
      }],
      ['Leader 与 ISR 表达复制状态', '每个分区有 Leader 和副本集合，Leader 处理读写，Follower 拉取日志；ISR 是保持足够同步的副本集合。Leader 故障时从可用副本选出新 Leader，落后太多的副本可能被移出 ISR，可用性取决于剩余副本；只看 Replicas 列表会误以为所有副本都能立即接管。', 'ISR 是实时健康集合', {
        title: 'Kafka CLI：比较 Replicas 与 ISR',
        language: 'PowerShell',
        code: `docker compose stop kafka-2
Start-Sleep -Seconds 3
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders
docker exec kafka-1 /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server kafka-1:9092 --topic orders
docker compose start kafka-2
Start-Sleep -Seconds 8
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders`,
        output: `Partition: 1 Leader: 3 Replicas: 2,3 Isr: 3
Partition: 1 Leader: 3 Replicas: 2,3 Isr: 2,3

Broker 2 离线后从 ISR 移除，分区仍由 Broker 3 服务。恢复并追上日志后，Broker 2 重新进入 ISR。`,
      }],
      ['副本数和 min ISR 共同约束写入', 'acks=all 要求 Leader 等待当前 ISR 确认，min.insync.replicas 规定可用同步副本下限。副本数足够但 ISR 缩小到下限以下时写入会失败，这是保护一致性的预期行为，不是 Broker 应该被盲目重启；客户端要把这类失败归类为可重试的暂时不可用。', '不可写有时是正确保护', {
        title: 'Kafka：让 ISR 不足时拒绝写入',
        language: 'Java',
        code: `Properties props = new Properties();
props.put("bootstrap.servers", "kafka-1:9092");
props.put("key.serializer", StringSerializer.class.getName());
props.put("value.serializer", StringSerializer.class.getName());
props.put("acks", "all");
props.put("delivery.timeout.ms", "10000");
props.put("enable.idempotence", "true");

try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
  RecordMetadata metadata = producer
    .send(new ProducerRecord<>("orders", "O-9", "created"))
    .get();
  System.out.println(metadata.partition() + ":" + metadata.offset());
} catch (ExecutionException error) {
  System.out.println(error.getCause().getClass().getSimpleName());
}`,
        output: `Topic orders 设置 replication.factor=2, min.insync.replicas=2
Broker 2 离线后 ISR=1
NotEnoughReplicasException: In-sync replicas: 1, required: 2

写入失败是配置保护生效。恢复同步副本后才允许继续接收订单。`,
      }],
      ['消费并行度受分区数限制', '同一消费者组内，一个分区在一个时刻只由一个消费者消费；消费者数超过分区数后会有空闲成员。扩分区可提高并行度，但会改变键映射并影响已有顺序语义，扩分区前要评估下游假设；如果消费者耗时不均，先修单条处理成本，不能只靠加实例。', '先设计键与分区，再定消费者', {
        title: 'Kafka CLI：检查消费组的分区分配',
        language: 'PowerShell',
        code: `docker exec kafka-1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka-1:9092 --topic orders --group order-worker --from-beginning --timeout-ms 3000
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group order-worker
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --alter --topic orders --partitions 4
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group order-worker`,
        output: `GROUP order-worker CONSUMER-ID worker-1 HOST /10.0.0.11
orders 0 18 18 0
orders 1 21 21 0
orders 2 17 17 0

三个分区只能让三个 worker 各自活跃；新增第 4 个分区后才可能出现第四个分配。旧 key 到分区的映射也会随扩分区变化。`,
      }],
      ['用描述与故障时间线验收', '保存 TopicDescribe 的 Partition、Leader、Replicas、Isr 字段，记录 Broker 停止、选举、客户端重试和积压变化。恢复后继续生产并验证每个键的顺序、重复和缺失，不能只看所有 Broker 进程重新启动；消费者 lag 归零不代表业务处理结果正确。', '状态字段和业务数据一起验收', {
        title: 'PowerShell：记录 Broker 故障时间线',
        language: 'PowerShell',
        code: `$events = @()
$events += [pscustomobject]@{ time = Get-Date; action = "stop-2" }
docker compose stop kafka-2 | Out-Null
$events += [pscustomobject]@{ time = Get-Date; action = "describe-after-stop" }
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders | Tee-Object describe.txt
docker compose start kafka-2 | Out-Null
Start-Sleep -Seconds 8
$events += [pscustomobject]@{ time = Get-Date; action = "describe-after-recovery" }
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders | Tee-Object -Append describe.txt
$events | Format-Table -AutoSize
Get-Content describe.txt`,
        output: `time                 action
2026-11-24 10:00:01 stop-2
2026-11-24 10:00:04 describe-after-stop
2026-11-24 10:00:20 describe-after-recovery

describe-after-stop: Partition 1 Leader 3 Isr 3
describe-after-recovery: Partition 1 Leader 3 Isr 2,3
订单键顺序与业务结果另行查询，故障时间线可以复盘，而不是只看进程重新启动。`,
      }],
    ],
  },
  {
    name: 'KafkaProducer 与 Sender',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 Kafka 分区、序列化、超时、重试和异步回调。',
    goal: '能沿 KafkaProducer.doSend、分区器、RecordAccumulator 和 Sender 解释发送路径，配置批次、确认和幂等并观察吞吐与重复。',
    guidedPractice: '用 Java KafkaProducer 发送带键消息，记录 send 返回 Future 与回调线程；调整 linger.ms、batch.size、acks 和 enable.idempotence，观察吞吐、批次大小和错误。',
    independentPractice: '为一个订单 Producer 设计可靠发送策略，覆盖 Broker 延迟、超时、重试、分区键和关闭，提交成功回调、失败原因、重复与延迟报告。',
    commonErrors: ['发送后不等待 Future 或关闭 Producer，进程退出导致缓冲中的消息未交付。', '把 retries 和 delivery.timeout.ms 当成独立保证，忽略重试窗口包含批次等待与请求时间。'],
    sourceRefs: ['Kafka Producer Configs. https://kafka.apache.org/documentation/#producerconfigs', KAFKA_SOURCE],
    steps: [
      ['doSend 先序列化并选分区', 'KafkaProducer.send 计算分区、序列化键值、估算批次大小，并把记录追加到对应分区的 RecordAccumulator；send 成功通常只表示进入客户端缓冲，不代表 Broker 已持久化。回调或 Future 才提供最终交付结果；序列化异常可能同步抛出，网络或确认失败则通过 Future 返回。', 'send 返回不是 Broker 确认', {
        title: 'KafkaProducer：回调与 Future 双观测',
        language: 'Java',
        code: `ProducerRecord<String, String> record =
  new ProducerRecord<>("orders", "O-1", "{\\"status\\":\\"created\\"}");

Future<RecordMetadata> future = producer.send(record, (metadata, error) -> {
  if (error == null) {
    System.out.printf("callback partition=%d offset=%d thread=%s%n",
      metadata.partition(), metadata.offset(), Thread.currentThread().getName());
  } else {
    System.out.println("callback failed=" + error.getMessage());
  }
});

System.out.println("send-returned=" + future.isDone());
RecordMetadata result = future.get(5, TimeUnit.SECONDS);
System.out.println("future offset=" + result.offset());`,
        output: `send-returned=false
callback partition=1 offset=42 thread=kafka-producer-network-thread
future offset=42

send 返回时仍在缓冲，Broker 确认后回调和 Future 才给出分区与位移。`,
      }],
      ['Sender 批量发送网络请求', 'Sender 线程从累加器取出可发送批次，通过 NetworkClient 发往分区 Leader；Broker 响应更新批次状态并触发回调。批次等待与网络往返共同决定延迟，batch.size 和 linger.ms 需要和吞吐目标一起调整，过大批次在高延迟链路上会放大尾延迟。', '批次提升吞吐也增加等待', {
        title: 'kafka-producer-perf-test：比较批次参数',
        language: 'PowerShell',
        code: `docker exec kafka-1 /opt/kafka/bin/kafka-producer-perf-test.sh --topic orders --num-records 100000 --record-size 512 --throughput -1 --producer-props bootstrap.servers=kafka-1:9092 acks=all linger.ms=0 batch.size=16384
docker exec kafka-1 /opt/kafka/bin/kafka-producer-perf-test.sh --topic orders --num-records 100000 --record-size 512 --throughput -1 --producer-props bootstrap.servers=kafka-1:9092 acks=all linger.ms=20 batch.size=65536
docker exec kafka-1 /opt/kafka/bin/kafka-run-class.sh kafka.tools.JmxTool --object-name kafka.producer:type=producer-metrics,client-id=perf-producer-1`,
        output: `linger=0: 28412 records/sec, 138.7 MB/sec, p99=18ms
linger=20: 46103 records/sec, 225.1 MB/sec, p99=34ms

批次提高吞吐也增加等待，必须按请求延迟目标选择。`,
      }],
      ['acks 决定等待哪些副本', 'acks=0 不等确认，acks=1 等 Leader，acks=all 等当前 ISR。与 min.insync.replicas 配合时，acks=all 才能在同步副本不足时拒绝写入；可靠性来自 Broker 与 Producer 配置组合，高确认级别仍需要处理超时后的未知交付结果。', '确认级别要成组配置', {
        title: 'KafkaProducer：设置 acks=all 与重试预算',
        language: 'Java',
        code: `Properties props = new Properties();
props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka-1:9092");
props.put(ProducerConfig.ACKS_CONFIG, "all");
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, "30000");
props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, "5000");

producer.send(new ProducerRecord<>("orders", "O-7", "created"), (meta, error) -> {
  if (error != null) {
    metrics.increment("kafka.send", error.getClass().getSimpleName());
    log.warn("order={} delivery-unknown", "O-7", error);
  }
});`,
        output: `Topic: replication.factor=2, min.insync.replicas=2
正常 ISR=2: callback offset=108
Broker 2 离线、ISR=1: callback NotEnoughReplicasException
指标 kafka.send{NotEnoughReplicasException} +1

确认失败被显式处理，调用方不会把缓冲成功误认为交付成功。`,
      }],
      ['幂等 Producer 防止重试重复', 'enable.idempotence 为同一生产者会话分配标识和序列号，Broker 可去重重试批次；它不自动解决跨会话重复、业务重复或多生产者写入。要注意 max.in.flight 和事务能力边界，生产者 ID 在重启后会变化，业务幂等键仍是最终防线。', '幂等有会话和主题边界', {
        title: 'KafkaProducer：幂等会话与业务键',
        language: 'Java',
        code: `Properties props = new Properties();
props.put("bootstrap.servers", "kafka-1:9092");
props.put("key.serializer", StringSerializer.class.getName());
props.put("value.serializer", StringSerializer.class.getName());
props.put("enable.idempotence", "true");
props.put("acks", "all");
props.put("max.in.flight.requests.per.connection", "5");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
System.out.println(producer.metrics().keySet().stream()
  .filter(name -> name.contains("producer-id"))
  .toList());
producer.send(new ProducerRecord<>("orders", "O-8", "created"));
producer.send(new ProducerRecord<>("orders", "O-8", "created"));`,
        output: `[producer-id]

同一服务端会话内重试批次可被去重；第二个 send 是新的业务记录，不会自动去重。
消费者仍以 eventId 唯一键约束，解决跨重启和重复输入。`,
      }],
      ['关闭与结果统计是验收核心', 'close 会等待或放弃缓冲区并释放网络资源，关闭前应记录未完成 Future、成功、失败和重试次数。性能报告同时看吞吐、P99、批次大小、重试率、重复和未确认数量，不能只测每秒 send 调用；进程退出前未 flush 的消息可能从未到 Broker。', '交付结果必须有统计出口', {
        title: 'KafkaProducer：关闭前等待未完成交付',
        language: 'Java',
        code: `List<Future<RecordMetadata>> pending = new ArrayList<>();
for (var order : page) {
  pending.add(producer.send(toRecord(order)));
}
long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
for (var future : pending) {
  long remaining = deadline - System.nanoTime();
  try {
    future.get(Math.max(1, remaining), TimeUnit.NANOSECONDS);
    sent.increment();
  } catch (TimeoutException error) {
    timedOut.increment();
  }
}
producer.flush();
producer.close(Duration.ofSeconds(5));
System.out.printf("sent=%d timeout=%d%n", sent.sum(), timedOut.sum());`,
        output: `sent=200 timeout=0

进程退出前等待所有 Future，记录成功与超时后再 close。
若 timeout>0，消息交付状态未知，应进入重试或对账，而不是只输出“发送完成”。`,
      }],
    ],
  },
  {
    name: 'KafkaConsumer、Fetcher 与位移',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解 Kafka 分区、消费者组和事务性业务处理。',
    goal: '能解释 poll、Fetcher、position、提交位移和重复消费，设计手动提交、幂等处理与死信边界。',
    guidedPractice: '创建手动提交 Consumer，记录 poll 返回批次、处理前后 position 和 commit；在处理成功后提交，再在处理后、提交前强制退出，观察重启后的重复消费。',
    independentPractice: '实现一个有数据库唯一键的订单消费者，覆盖处理成功、业务失败、提交失败和重复消息，提交位移、消费日志与去重结果。',
    commonErrors: ['先提交位移再执行业务，进程崩溃后消息永久跳过。', '开启自动提交却进行长时间异步处理，让位移越过尚未完成的业务。'],
    sourceRefs: ['Kafka Consumer Configs. https://kafka.apache.org/documentation/#consumerconfigs', KAFKA_SOURCE],
    steps: [
      ['poll 拉取记录并更新位置', 'Consumer.poll 从 KafkaConsumer 驱动订阅，Fetcher 从 Broker 拉取已完成批次，解析后返回 ConsumerRecords。position 是下一条要读取的位移，committed offset 是已持久化的消费进度，两者不应混为一谈；调用 seek 会改变下一次读取位置，但不会自动提交。', '当前读取位置不等于已提交进度', {
        title: 'KafkaConsumer：观察 position 与 committed',
        language: 'Java',
        code: `ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
for (ConsumerRecord<String, String> record : records) {
  System.out.printf("partition=%d offset=%d key=%s%n",
    record.partition(), record.offset(), record.key());
}
for (TopicPartition partition : records.partitions()) {
  OffsetAndMetadata committed = consumer.committed(partition);
  System.out.printf("partition=%d position=%d committed=%s%n",
    partition.partition(), consumer.position(partition),
    committed == null ? "none" : committed.offset());
}`,
        output: `partition=1 offset=40 key=O-1
partition=1 offset=41 key=O-1
partition=1 position=42 committed=39

已读取到 41，下一次 position 是 42；committed 仍为 39，重启后会从这里重新投递。`,
      }],
      ['位移提交与业务处理不是原子', '业务写库和 Kafka commit 是两个独立系统，无法在普通消费者中用一次本地操作同时完成。至少一次处理需要在业务侧使用幂等键或唯一约束，允许重复但不能产生重复业务结果；处理成功但提交失败会产生重复，处理失败但提前提交会静默丢失。', '重复处理要由业务吸收', {
        title: 'Java + SQL：用唯一键吸收重复消费',
        language: 'Java',
        code: `@Transactional
public void apply(ConsumerRecord<String, String> record) {
  int inserted = jdbc.update("""
    insert into consumed_event(event_id, order_id, status)
    values (?, ?, ?)
    on conflict (event_id) do nothing
    """, record.key(), orderId(record), status(record));
  if (inserted == 0) {
    log.info("duplicate event={} partition={} offset={}",
      record.key(), record.partition(), record.offset());
    return;
  }
  jdbc.update("update orders set status = ? where id = ?",
    status(record), orderId(record));
}`,
        output: `insert consumed_event=1, update orders=1
重投同一 event_id: insert consumed_event=0, duplicate event=O-1

业务唯一键让重复消息不重复改状态。数据库事务成功后再提交 Kafka 位移。`,
      }],
      ['手动提交要绑定处理完成', '关闭 enable.auto.commit 或控制自动提交边界，在整批业务成功后提交最高已处理位移加一。批中部分失败时要拆分、暂停或重试；提交失败则记录并重新处理，不能把失败当成已完成；同步 commit 的返回还应与业务处理窗口一起记录。', '成功处理后再提交', {
        title: 'KafkaConsumer：处理成功后同步提交',
        language: 'Java',
        code: `props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
try {
  for (ConsumerRecord<String, String> record : records) {
    orderService.applyIdempotently(record);
    offsets.put(new TopicPartition(record.topic(), record.partition()),
      new OffsetAndMetadata(record.offset() + 1));
  }
  consumer.commitSync(offsets, Duration.ofSeconds(3));
  log.info("committed partitions={}", offsets.keySet());
} catch (Exception error) {
  log.error("batch failed before commit", error);
  consumer.seek(offsets.firstKey(), offsets.firstEntry().getValue());
}`,
        output: `committed partitions=[orders-1]

处理所有业务副作用后才提交 offset+1。
任何处理或提交异常都保留重投，重复由业务幂等吸收。`,
      }],
      ['流控与长处理需要暂停', 'max.poll.records、fetch.max.bytes 和处理时间共同决定一次 poll 的工作量，超过 max.poll.interval.ms 会触发再平衡。处理慢时使用 pause/resume、并行工作队列或将大批任务拆分，不能长时间不 poll；暂停只停止拉取新记录，已返回批次仍需在时限内完成。', '控制单批工作量', {
        title: 'KafkaConsumer：暂停分区并限制在途任务',
        language: 'Java',
        code: `props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "50");
ExecutorService workers = Executors.newFixedThreadPool(8);
Semaphore inFlight = new Semaphore(8);

while (running) {
  ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
  if (!records.isEmpty()) {
    consumer.pause(records.partitions());
    for (ConsumerRecord<String, String> record : records) {
      inFlight.acquire();
      workers.submit(() -> {
        try { orderService.applyIdempotently(record); }
        finally { inFlight.release(); }
      });
    }
    while (inFlight.availablePermits() < 8) {
      consumer.poll(Duration.ZERO);
      Thread.sleep(50);
    }
    consumer.resume(records.partitions());
  }
}`,
        output: `poll returned=50 partitions=3
paused partitions=3 in-flight=8
resumed partitions=3

批次被限为 50，工作并发限为 8。暂停期间继续驱动心跳，处理完成后恢复拉取。`,
      }],
      ['用崩溃点矩阵验证', '在消费前、业务提交后 Kafka 提交前、Kafka 提交后继续处理等位置注入崩溃，检查重启后结果是丢失、重复还是正确处理。记录位移、数据库版本和死信消息，证明业务语义而非 API 调用次数；每个崩溃点都要有预期结果和自动断言。', '每个崩溃点都要有结果', {
        title: 'PowerShell：在提交前杀消费者并核对重投',
        language: 'PowerShell',
        code: `$group = "order-worker-crash"
$env:CRASH_AFTER_BUSINESS = "true"
Start-Process java -ArgumentList @("-jar","consumer.jar") -PassThru | Out-Null
Start-Sleep -Seconds 4
$pidToStop = (Get-CimInstance Win32_Process | Where-Object CommandLine -like "*consumer.jar*").ProcessId
Stop-Process -Id $pidToStop -Force
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group $group
psql $env:DATABASE_URL -c "select event_id, count(*) from consumed_event group by event_id having count(*) > 1"
Start-Process java -ArgumentList @("-jar","consumer.jar") | Out-Null
Start-Sleep -Seconds 10
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group $group`,
        output: `业务已提交，Kafka offset 未提交：
orders 1 42 41 1
重投后 consumed_event 唯一键阻止第二次副作用：
event_id O-1 count=1
最终 lag=0

崩溃点产生可解释重复输入，但业务没有重复结果。`,
      }],
    ],
  },
  {
    name: '消费组与 Rebalance',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 Consumer poll、位移、心跳和分区分配。',
    goal: '能解释 ConsumerCoordinator、GroupCoordinator、心跳、会话超时和再平衡协议，设计提交边界与分区交接。',
    guidedPractice: '启动两个消费者组成消费组，加入第三个与主动退出一个，记录 JoinGroup、SyncGroup、分区撤回和分配日志；将处理时间调到 max.poll.interval.ms 以上观察再平衡。',
    independentPractice: '为一个订单消费组设计滚动发布流程，使用 cooperative-sticky 分配、分区撤回提交和优雅停机，验证发布期间重复、延迟和空闲分区。',
    commonErrors: ['在分区被撤销时继续异步处理后提交，导致旧处理结果覆盖新消费者。', '只看心跳正常，不控制 poll 间隔，最终因处理超时被踢出消费组。'],
    sourceRefs: ['Kafka Consumer Design. https://kafka.apache.org/documentation/#consumergroup', KAFKA],
    steps: [
      ['协调器管理成员与位移', 'Consumer 向 GroupCoordinator 注册为消费组成员，协调器维护成员、心跳和已提交位移。ConsumerCoordinator 处理加入、同步、离开和分区分配，客户端需要保持 poll 循环完成协议；订阅关系或成员变化后，应用必须等待 assignment 稳定再判断自己负责哪些分区。', '组协议需要持续驱动', {
        title: 'KafkaConsumer：观察组协调与分区分配',
        language: 'Java',
        code: `consumer.subscribe(List.of("orders"), new ConsumerRebalanceListener() {
  public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
    log.info("assigned={}", partitions);
    metrics.gauge("consumer.assignments", partitions.size());
  }
  public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
    log.info("revoked={}", partitions);
  }
});

while (running) {
  ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
  records.forEach(service::applyIdempotently);
  log.debug("poll records={} assignment={}",
    records.count(), consumer.assignment());
}`,
        output: `assigned=[orders-0, orders-1]
poll records=12 assignment=[orders-0, orders-1]
revoked=[orders-1]
assigned=[orders-0]

日志显示协调器完成分配和撤回。处理循环继续 poll，组协议和心跳才能推进。`,
      }],
      ['再平衡是分区所有权重分配', '成员加入、离开或被认为失联时，组进入再平衡，成员撤回或获得分区。Eager 协议通常让所有成员暂停，cooperative-sticky 尝试只调整变化分区，但客户端和 Broker 版本都要支持；升级期间必须确认协议兼容，不能假设新旧成员一定平滑交接。', '再平衡期间所有权会变化', {
        title: 'KafkaConsumer：cooperative-sticky 分配',
        language: 'Java',
        code: `Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka-1:9092");
props.put(ConsumerConfig.GROUP_ID_CONFIG, "order-worker");
props.put(ConsumerConfig.CLIENT_ID_CONFIG, "worker-a");
props.put(ConsumerConfig.PARTITION_ASSIGNMENT_STRATEGY_CLASS,
  "org.apache.kafka.clients.consumer.CooperativeStickyAssignor");

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
consumer.subscribe(List.of("orders"));
Runtime.getRuntime().addShutdownHook(new Thread(consumer::wakeup));`,
        output: `worker-a assigned=[orders-0, orders-1, orders-2]
worker-b join -> cooperative revoke [orders-2]
worker-b assigned=[orders-2]
worker-a 保留 [orders-0, orders-1]

只移动变化分区，旧成员无需放弃全部所有权。应用仍需处理短暂重复。`,
      }],
      ['心跳与处理时间约束不同', 'session.timeout.ms 判断成员是否失联，heartbeat.interval.ms 控制心跳频率，max.poll.interval.ms 限制两次 poll 的最大间隔。后台心跳不能拯救 poll 超时的成员，长任务必须缩短单批或移到受控工作流；调大 max.poll.interval.ms 只会延后踢出，并可能让故障分区更久无人消费。', '心跳正常不代表处理及时', {
        title: 'KafkaConsumer：用短 poll 窗口暴露超时',
        language: 'Java',
        code: `Properties props = new Properties();
props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "10000");
props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, "3000");
props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, "15000");
props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "20");

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
while (running) {
  long started = System.nanoTime();
  ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
  processInSmallChunks(records);
  long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
  if (elapsedMs > 12000) {
    log.warn("poll-cycle-near-limit elapsedMs={} records={}", elapsedMs, records.count());
  }
}`,
        output: `poll-cycle-near-limit elapsedMs=13700 records=20
Consumer group order-worker: member worker-a has left
Rebalance started

心跳线程仍在运行，但业务线程 13.7 秒才回到 poll；超过 15 秒窗口后成员会被踢出。`,
      }],
      ['撤回时要提交已完成位移', '在 onPartitionsRevoked 中停止拉取、等待当前批次处理或安全中止并提交已完成进度，再释放资源。分区重新分配后从提交位移继续，未完成批次可能重复，因此业务要幂等；撤回回调不能无限等待，超时后应保留可恢复边界。', '交接前确定已完成边界', {
        title: 'KafkaConsumer：撤回时提交已完成批次',
        language: 'Java',
        code: `AtomicBoolean handedOff = new AtomicBoolean();
consumer.subscribe(List.of("orders"), new ConsumerRebalanceListener() {
  public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
    handedOff.set(false);
  }
  public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
    stopAcceptingNewWork();
    awaitCurrentBatch(Duration.ofSeconds(5));
    Map<TopicPartition, OffsetAndMetadata> done = completedOffsets(partitions);
    consumer.commitSync(done, Duration.ofSeconds(3));
    releasePartitionResources(partitions);
    handedOff.set(true);
    log.info("revoked={} committed={}", partitions, done);
  }
});`,
        output: `revoked=[orders-2] committed={orders-2=OffsetAndMetadata{offset=88}}

撤回回调先停止接新任务，等待当前批次到安全边界，提交已完成位移并释放资源。
未来重复从 offset 88 开始，由唯一事件键吸收。`,
      }],
      ['发布与故障演练看业务连续性', '记录成员变化、分区分配、位移提交、重复和积压时间线，滚动重启和 Broker 故障各跑一次。目标是组稳定后所有分区有合法消费者、已处理状态一致，而不是只看到 REBALANCE 日志结束；演练还要记录最大积压和恢复耗时。', '组稳定还要业务稳定', {
        title: 'PowerShell：滚动重启并记录组恢复',
        language: 'PowerShell',
        code: `$group = "order-worker"
$log = "rebalance-timeline.txt"
foreach ($pod in @("worker-a","worker-b","worker-c")) {
  "$(Get-Date -Format o) delete $pod" | Add-Content $log
  kubectl delete pod $pod
  kubectl rollout status statefulset/order-worker --timeout=180s
  docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group $group |
    Tee-Object -Append $log
  Start-Sleep -Seconds 5
}
Select-String -Path $log -Pattern "delete|orders|lag|CONSUMER-ID"`,
        output: `2026-11-24T10:12:01 delete worker-a
orders 0 180 180 0 worker-b
orders 1 175 175 0 worker-c
orders 2 190 172 18 worker-b
2026-11-24T10:12:31 delete worker-b

每次只停一个成员，分区全部有 owner。最大 lag=18，业务对账无缺口后才继续下一个。`,
      }],
    ],
  },
  {
    name: 'Kafka 日志存储与副本',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握 Kafka 分区、Broker、文件系统和复制基础。',
    goal: '能解释 UnifiedLog、LogSegment、索引、roll、retention、Leader 高水位和副本追赶，并用磁盘与 Broker 指标定位问题。',
    guidedPractice: '连续写入消息，观察活动 Segment、.log、.index、.timeindex 文件大小和滚动；修改 retention 与 segment.ms 后等待清理，记录磁盘、起始位移和 Broker 日志。',
    independentPractice: '为一个事件 Topic 做容量报告，估算消息字节、保留时间、副本倍数、索引和临时空间，并注入 Follower 落后观察 ISR 与磁盘增长。',
    commonErrors: ['只按消息条数估算磁盘，忽略消息大小、批次、索引、副本和保留倍数。', '看到磁盘上涨就删除 Segment 文件，绕过日志管理和副本一致性。'],
    sourceRefs: ['Kafka Log Implementation. https://kafka.apache.org/documentation/#implementation_log', KAFKA_SOURCE],
    steps: [
      ['追加日志由多个 Segment 组成', 'Partition 日志追加到活动 Segment，达到大小或时间条件后滚动出新 Segment。段内偏移索引和时间索引加速查找，旧段按 retention 或 compact 策略处理；直接操作文件会破坏 Broker 元数据和恢复，排查应使用 Kafka 工具而不是删除或改写日志文件。', '段、索引、保留一起管理', {
        title: 'PowerShell：查看 Segment、索引和位移',
        language: 'PowerShell',
        code: `docker exec kafka-1 find /var/lib/kafka/data/orders-0 -maxdepth 1 -type f |
  Sort-Object |
  Select-Object -Last 8
docker exec kafka-1 /opt/kafka/bin/kafka-dump-log.sh --files /var/lib/kafka/data/orders-0/00000000000000000000.log --print-data-log |
  Select-Object -First 20
docker exec kafka-1 /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server kafka-1:9092 --topic orders --time -2`,
        output: `/orders-0/00000000000000000000.log
/orders-0/00000000000000000000.index
/orders-0/00000000000000000000.timeindex
/orders-0/00000000000000000812.log
/orders-0/00000000000000000812.index

offset: 812 position: 0 CreateTime: 1763942400000 key: O-8
earliest offset=0

活动段从位移 812 开始，索引与日志同名成段，起始位移由清理进度决定。`,
      }],
      ['Leader 高水位决定可消费范围', 'Follower 向 Leader 拉取并追加日志，Leader 根据副本确认推进高水位；消费者通常只能读取到高水位以下的记录。ISR 缩小会改变可提交和可消费边界，复制延迟也会影响延迟与容量；LEO 是日志末端，HW 是可消费边界，二者不能混用。', '高水位是复制可见边界', {
        title: 'PowerShell：比较 LEO、高水位与消费位置',
        language: 'PowerShell',
        code: `docker exec kafka-1 /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server kafka-1:9092 --topic orders
docker exec kafka-1 /opt/kafka/bin/kafka-run-class.sh kafka.tools.JmxTool --object-name "kafka.server:type=ReplicaManager,name=PartitionCount"
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group order-worker
docker exec kafka-1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka-1:9092 --topic orders --partition 0 --offset latest --max-messages 1 --timeout-ms 3000`,
        output: `orders:0:220 orders:1:180 orders:2:205
GROUP order-worker orders 0 215 215 5
GROUP order-worker orders 1 180 180 0

Partition 0 LEO=220，高水位附近仍有 5 条未被消费者读取。
尾部记录读取成功，说明高水位以下已对客户端可见。`,
      }],
      ['副本追赶受网络与磁盘限制', 'Follower 落后可能由网络、磁盘、线程或 Broker 负载造成，超过 replica.lag 条件会被移出 ISR。恢复后追赶会增加磁盘和网络压力，应观察副本字节速率和 ISR 恢复时间；只重启 Follower 会扩大故障域，先确认带宽、磁盘和 Leader 负载。', 'ISR 是结果，不是根因', {
        title: 'PowerShell：制造 Follower 落后并观察追赶',
        language: 'PowerShell',
        code: `docker compose pause kafka-2
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders
1..5 | ForEach-Object {
  "O-$($_):backlog" | docker exec -i kafka-1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka-1:9092 --topic orders --property parse.key=true --property key.separator=:
}
Start-Sleep -Seconds 5
docker compose unpause kafka-2
for ($i = 0; $i -lt 10; $i++) {
  docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders |
    Select-String "Partition: 1"
  Start-Sleep -Seconds 2
}`,
        output: `Paused: Isr: 1
Unpaused: Isr: 1
Unpaused: Isr: 1,2

Broker 2 恢复网络后追赶日志，约 6 秒重新进入 ISR。
故障窗口内 Broker 1 的网络和磁盘速率、追赶字节数也应记录。`,
      }],
      ['清理策略影响查询与存储', 'delete retention 删除旧 Segment，compaction 保留每个键的最新值并逐步清理旧记录，compact 不等于立即删除。Topic 策略与消费者从早期位移读取的能力要一起定义；开启 compact 也不能撤销 retention 对未压缩段的删除行为。', '保留策略属于数据契约', {
        title: 'Kafka CLI：观察 retention 与 compact 边界',
        language: 'PowerShell',
        code: `docker exec kafka-1 /opt/kafka/bin/kafka-configs.sh --bootstrap-server kafka-1:9092 --entity-type topics --entity-name orders --alter --add-config retention.ms=3600000,segment.ms=600000,cleanup.policy=compact,delete
docker exec kafka-1 /opt/kafka/bin/kafka-configs.sh --bootstrap-server kafka-1:9092 --entity-type topics --entity-name orders --describe
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --topic orders
Get-ChildItem -Recurse . -Filter "*.log" | Where-Object FullName -like "*orders-0*" | Select-Object Name, Length, LastWriteTime`,
        output: `retention.ms=3600000 sensitive=false synonyms={...}
segment.ms=600000 sensitive=false synonyms={...}
cleanup.policy=compact,delete
Topic: orders Partition: 0 Leader: 1 Replicas: 1,2 Isr: 1,2

策略允许按时间删除段，也保留键的最新值。段只有在满足清理条件后才变化，不是执行命令立即删除。`,
      }],
      ['用磁盘与位移对照验收', '采集每个分区 leader/follower log end offset、高水位、ISR、Segment 数和磁盘字节，验证滚动、清理、Broker 重启后的恢复。容量按峰值写入乘保留窗口再加副本与安全余量，不按当前平均值；索引、批次开销和临时追赶空间也要计入。', '位移和字节都要进入容量表', {
        title: 'PowerShell：采集日志容量与副本进度',
        language: 'PowerShell',
        code: `$bootstrap = "kafka-1:9092"
docker exec kafka-1 /opt/kafka/bin/kafka-log-dirs.sh --bootstrap-server $bootstrap --describe --topic-list orders > log-dirs.json
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server $bootstrap --describe --topic orders > topic.txt
docker exec kafka-1 /opt/kafka/bin/kafka-run-class.sh kafka.tools.JmxTool --object-name "kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec" > bytes-in.txt
Get-Content log-dirs.json | ConvertFrom-Json | Select-Object -ExpandProperty brokers | Select-Object -ExpandProperty logDirs
Get-Content topic.txt
Get-Content bytes-in.txt`,
        output: `path=/var/lib/kafka/data size=5368709120 offsetLag=0
Topic: orders Partition: 0 Leader: 1 Replicas: 1,2 Isr: 1,2
BytesInPerSec: Count=1821 MeanRate=2.4MB/s OneMinuteRate=2.7MB/s

分区复制 offsetLag=0，磁盘约 5 GiB。
容量表按峰值 3.5MB/s、保留 24h、副本 2 和安全余量计算，不按当前 2.4MB/s。`,
      }],
    ],
  },
  {
    name: 'Kafka 可靠性与故障实验',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 Kafka Producer、Consumer、Rebalance 和存储副本课程。',
    goal: '能建立重复、丢失、顺序、积压和不可用边界，区分至少一次、幂等和事务语义，完成 Broker 与消费者故障演练。',
    guidedPractice: '在三 Broker 环境制造 Broker 下线、Consumer 崩溃、处理超时和重复消息，记录 Producer 回调、Topic ISR、committed offset、业务幂等键和积压恢复时间。',
    independentPractice: '为订单事件链实现可观测的至少一次投递，支持死信、退避和人工重放，并用四种故障注入证明无静默丢失。',
    commonErrors: ['声称系统 exactly-once，却只在 Producer 开启幂等，没有覆盖消费副作用。', '失败消息无限重试占住分区，死信和退避策略缺失导致整体积压。'],
    sourceRefs: [KAFKA, SPRING_KAFKA],
    steps: [
      ['先定义每段保证', 'Producer 交付、Broker 复制、Consumer 提交和业务副作用各自有失败语义。至少一次允许重复但不应静默丢失，最多一次可能丢失，exactly-once 需要事务或幂等副作用覆盖完整业务边界；架构图应在每一跳旁写出失败时可能丢、重或未知。', '保证必须写到业务结果', {
        title: 'Java：把每段保证写成断言',
        language: 'Java',
        code: `record DeliveryContract(
  String stage, String guarantee, String failureOutcome) {}

List<DeliveryContract> contracts = List.of(
  new DeliveryContract("producer", "at-least-once", "timeout may duplicate"),
  new DeliveryContract("broker", "replicated", "write fails below min ISR"),
  new DeliveryContract("consumer", "manual-offset", "crash may replay"),
  new DeliveryContract("database", "unique-event-id", "duplicate result ignored")
);

contracts.forEach(contract ->
  assertThat(contract.failureOutcome()).isNotBlank());`,
        output: `producer: at-least-once, timeout may duplicate
broker: replicated, write fails below min ISR
consumer: manual-offset, crash may replay
database: unique-event-id, duplicate result ignored

每一跳都有明确失败结果，组合后才能说明订单链不会静默丢失。`,
      }],
      ['事务不能替代外部副作用设计', 'Kafka 事务可原子写多个 Topic 与消费位移，但数据库、邮件和第三方 API 不自动加入同一事务。涉及外部系统时使用 Outbox、幂等键或补偿，不能只看 read_committed 配置；Kafka 内部原子并不等于业务全链路原子。', '事务边界决定真正原子范围', {
        title: 'KafkaTransactions：原子写 Topic 与位移',
        language: 'Java',
        code: `producer.initTransactions();
consumer.subscribe(List.of("orders"));

while (running) {
  ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
  producer.beginTransaction();
  try {
    for (ConsumerRecord<String, String> record : records) {
      producer.send(new ProducerRecord<>("orders-audit", record.key(), record.value()));
    }
    producer.sendOffsetsToTransaction(currentOffsets(records), consumer.groupMetadata());
    producer.commitTransaction();
  } catch (Exception error) {
    producer.abortTransaction();
    throw error;
  }
}`,
        output: `transactional.id=order-audit-tx-1
orders-audit records visible after commitTransaction
consumer offsets advanced in same transaction

下游数据库写入没有加入本事务。若数据库也需更新，应使用 Outbox 或幂等副作用，而不是扩大事务口号。`,
      }],
      ['重试要有分类和上限', '网络超时、Leader 切换和瞬时 5xx 可退避重试，非法消息、权限和业务规则错误应进入死信或暂停。重试次数、总时长和分区阻塞时间要有上限，避免毒消息拖住整个分区；重试前先判断操作是否幂等，未知交付结果要可查询。', '可重试与不可重试分开', {
        title: 'Java：按异常类型决定重试或死信',
        language: 'Java',
        code: `enum FailureKind { RETRYABLE, PERMANENT, UNKNOWN }

FailureKind classify(Throwable error) {
  if (error instanceof RetriableException) return FailureKind.RETRYABLE;
  if (error instanceof SerializationException
      || error instanceof AuthorizationException) return FailureKind.PERMANENT;
  if (error instanceof TimeoutException) return FailureKind.UNKNOWN;
  return FailureKind.PERMANENT;
}

void handle(ConsumerRecord<String, String> record, Throwable error) {
  switch (classify(error)) {
    case RETRYABLE -> retryQueue.enqueue(record, backoff(attempt(record)));
    case PERMANENT -> deadLetter.publish(record, error);
    case UNKNOWN -> reconciliation.enqueue(eventId(record));
  }
}`,
        output: `TimeoutException -> UNKNOWN -> reconciliation
RetriableException -> RETRYABLE -> retry in 2s
SerializationException -> PERMANENT -> dead-letter

三类失败走不同队列，毒消息不会无限 requeue，未知结果查询后再决定重放。`,
      }],
      ['故障实验保留完整时间线', '记录消息 ID、发送时间、Broker 确认、消费开始、业务提交、位移提交和告警时间，计算重复窗口和恢复时长。故障前后对账消息总数、业务状态和死信数量；事件日志要使用同一 requestId 和 traceId，才能把跨进程阶段对齐。', '时间线能证明是否丢或重', {
        title: 'PowerShell：Broker 下线时保留消息时间线',
        language: 'PowerShell',
        code: `$id = [guid]::NewGuid()
$start = [datetime]::UtcNow
docker compose stop kafka-2
"$start send event=$id key=O-44" | Add-Content timeline.txt
"O-44:$id" | docker exec -i kafka-1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka-1:9092 --topic orders --property parse.key=true --property key.separator=:
docker compose start kafka-2
Start-Sleep -Seconds 8
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group order-worker | Tee-Object -Append timeline.txt
psql $env:DATABASE_URL -c "select event_id, status, updated_at from consumed_event where event_id = '$id'" | Tee-Object -Append timeline.txt
Get-Content timeline.txt`,
        output: `2026-11-24T10:41:02Z send event=7f... key=O-44
GROUP order-worker orders 1 301 301 0
event_id=7f... status=APPLIED updated_at=10:41:07Z

发送、消费和业务提交落在同一 ID 时间线上。Broker 恢复后 lag=0，业务记录存在且只有一条。`,
      }],
      ['恢复手册包含重放和停止条件', '预案写明如何暂停消费、检查积压、隔离毒消息、重放死信和回滚业务。恢复后比较各分区 LEO、高水位、提交位移和业务对账，满足停止条件后才能宣布事故结束；停止条件要同时覆盖技术指标和业务数量，不能只看 lag。', '重放和停止都要有规则', {
        title: 'Kafka CLI：暂停、检查并重放死信',
        language: 'PowerShell',
        code: `$group = "order-worker"
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group $group
docker exec kafka-1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka-1:9092 --topic orders-dlq --from-beginning --max-messages 20 --timeout-ms 5000
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --group $group --topic orders --reset-offsets --to-earliest --dry-run
psql $env:DATABASE_URL -c "select status, count(*) from orders group by status order by status"
curl.exe -s http://127.0.0.1:8080/actuator/prometheus | Select-String "kafka_consumer_fetch_manager_records_lag"`,
        output: `orders 0 302 300 lag=2
DLQ sample: O-77 eventId=... reason=INVALID_STATUS
dry-run reset orders 0 to 301
CREATED 1442  PAID 2031  CANCELLED 111
kafka_consumer_fetch_manager_records_lag{partition="0"} 2

先定位两条 lag 和毒消息，再决定重放。停止条件：lag=0、死信清零、订单总数对账一致。`,
      }],
    ],
  },
  {
    name: 'Redis 事件循环与缓存治理',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握 TCP、缓存、键值模型和基础 Redis 命令。',
    goal: '能解释 Redis 命令执行、过期、淘汰、持久化和缓存失效，设计防穿透、防击穿与热点隔离方案。',
    guidedPractice: '用一个长时间 KEYS 或 Lua 循环观察其他客户端延迟，再设置 maxmemory、淘汰策略和 TTL；构造缓存未命中风暴，记录请求回源数、命中率和 Redis 慢日志。',
    independentPractice: '为商品详情建立缓存策略，包含 TTL、空值缓存、单飞加载、热点隔离、降级和失效通知，并压测冷启动与 Redis 不可用场景。',
    commonErrors: ['在生产使用 KEYS 或超长集合命令，阻塞命令执行并拖慢所有客户端。', '每次缓存失效后让全部请求同时回源，缓存反而成为数据库雪崩触发器。'],
    sourceRefs: [REDIS, 'Redis source. https://github.com/redis/redis'],
    steps: [
      ['命令执行通常串行进入事件循环', 'Redis 主线程处理客户端事件并执行命令，单条命令执行期间其他命令要等待；现代版本可通过 IO 线程处理网络，但复杂命令和大键仍会占用主要执行路径。慢日志和延迟事件能证明阻塞来源；生产环境应优先复现命令成本，不依赖可能被禁用的 DEBUG 操作。', '一条慢命令影响所有租户', {
        title: 'Redis CLI：用 Lua 放大阻塞并测延迟',
        language: 'PowerShell',
        code: `$slow = Start-Job { redis-cli -h 127.0.0.1 -p 6379 EVAL "for i=1,2000000 do redis.call('PING') end return 1" 0 }
Start-Sleep -Milliseconds 200
redis-cli -h 127.0.0.1 -p 6379 --latency -i 0.2
redis-cli -h 127.0.0.1 -p 6379 SLOWLOG GET 5
Wait-Job $slow | Receive-Job
redis-cli -h 127.0.0.1 -p 6379 INFO commandstats | Select-String "evalsha|ping"`,
        output: `min: 0, max: 1847, avg: 22.17 (187 samples)
1) 1) (integer) 14
   4) 1) "EVAL"
      2) "for i=1,2000000..."
      3) (integer) 1721

慢脚本执行 1.7 秒，期间普通 PING 最大等待 1.8 秒。
慢日志与延迟采样共同证明命令阻塞，而不是网络抖动。`,
      }],
      ['过期和淘汰策略不同', 'TTL 到期通过惰性检查和周期扫描清理，内存达到 maxmemory 时按淘汰策略移除键。淘汰不是业务删除通知，缓存层必须允许数据被回收；对关键状态不能只存 Redis 而缺少持久化与恢复，业务代码也不能依赖键恰好仍存在。', '缓存可以被淘汰，事实源要明确', {
        title: 'Redis CLI：观察 maxmemory 与淘汰',
        language: 'PowerShell',
        code: `redis-cli -h 127.0.0.1 -p 6379 CONFIG SET maxmemory 32mb
redis-cli -h 127.0.0.1 -p 6379 CONFIG SET maxmemory-policy allkeys-lru
redis-cli -h 127.0.0.1 -p 6379 CONFIG GET maxmemory maxmemory-policy
1..20000 | ForEach-Object { "SET product:$($_) $('x' * 512)" } |
  redis-cli -h 127.0.0.1 -p 6379
redis-cli -h 127.0.0.1 -p 6379 INFO stats | Select-String "evicted_keys|keyspace_hits|keyspace_misses"
redis-cli -h 127.0.0.1 -p 6379 INFO memory | Select-String "used_memory_human|maxmemory_human"`,
        output: `maxmemory 32mb
maxmemory-policy allkeys-lru
evicted_keys: 4218
keyspace_hits: 17342
keyspace_misses: 386
used_memory_human: 31.94M
maxmemory_human: 32.00M

内存触顶后发生淘汰，缓存命中仍是正常读路径；数据库必须能在缺键时重建。`,
      }],
      ['缓存穿透与击穿分开处理', '不存在的键可缓存短 TTL 空值或使用布隆过滤器减少回源，热点键过期可在单飞锁保护下重建。锁要有超时和失败释放，避免持有者在异常时永久阻塞；空值缓存要区分“确认不存在”和“查询失败”，后者不能伪装成空结果。', '空值与热点各用一套策略', {
        title: 'Java：空值缓存加单飞重建',
        language: 'Java',
        code: `public ProductView get(String id) {
  String key = "product:" + id;
  String cached = redis.get(key);
  if (cached != null) {
    return "NULL".equals(cached) ? null : json.read(cached, ProductView.class);
  }
  String lock = "lock:product:" + id;
  if (redis.set(lock, "1", SetParams.setParams().nx().px(3000))) {
    try {
      return loadAndCache(id);
    } finally {
      redis.del(lock);
    }
  }
  return waitAndReadCached(id, Duration.ofMillis(500));
}

private ProductView loadAndCache(String id) {
  ProductView value = repository.find(id).orElse(null);
  redis.set("product:" + id, value == null ? "NULL" : json.write(value),
    SetParams.setParams().ex(value == null ? 30 : 600));
  return value;
}`,
        output: `cache miss product:404
lock acquired product:404
database rows=0, cache value=NULL ttl=30s
并发请求等待后读到 NULL，只发生一次回源。

查询异常不写 NULL，避免短暂数据库故障被缓存成 30 秒不存在。`,
      }],
      ['持久化不是数据库事务替代', 'RDB 快照和 AOF 以不同恢复点与写放大代价提供持久化，主从复制仍有异步窗口。缓存一致性要定义失效顺序、延迟和回退，不能把 Redis 成功写入当成与数据库原子提交；关键事实源写数据库，缓存删除或版本更新可异步重试。', '先定事实源与一致性窗口', {
        title: 'Redis CLI：核对持久化与复制状态',
        language: 'PowerShell',
        code: `redis-cli -h 127.0.0.1 -p 6379 CONFIG GET save appendonly appendfsync
redis-cli -h 127.0.0.1 -p 6379 INFO persistence |
  Select-String "rdb_last_save_time|rdb_changes_since_last_save|aof_enabled|aof_last_write_status"
redis-cli -h 127.0.0.1 -p 6379 INFO replication |
  Select-String "role|connected_slaves|master_repl_offset|slave_repl_offset"
psql $env:DATABASE_URL -c "update products set version = version + 1, price = 1999 where id = 'P-1' returning version"
redis-cli -h 127.0.0.1 -p 6379 DEL product:P-1`,
        output: `save 3600 1 300 100 60 10000
appendonly yes
appendfsync everysec
rdb_last_save_time:1763942400
aof_last_write_status:ok
role:master
connected_slaves:1
master_repl_offset:918233

数据库先提交并返回 version=8，再删除缓存。
Redis 持久化和复制改善恢复能力，但数据库仍是事实源。`,
      }],
      ['监控命中、延迟和故障域', '记录命中率、回源率、平均与 P99 命令耗时、慢日志、内存、淘汰和连接数，按业务键限制单值大小。Redis 不可用时使用本地短期缓存、限流或快速失败，避免重试风暴压垮数据库；恢复后还要防止大量缓存同时重建。', '缓存故障也要有降级', {
        title: 'Java + Micrometer：Redis 故障降级',
        language: 'Java',
        code: `CircuitBreaker breaker = CircuitBreaker.ofDefaults("redis");
Cache fallback = Caffeine.newBuilder()
  .maximumSize(10_000)
  .expireAfterWrite(Duration.ofSeconds(30))
  .build();

ProductView query(String id) {
  return breaker.executeSupplier(() -> {
      String value = redis.get("product:" + id);
      cacheHits.increment(value != null ? "hit" : "miss");
      return value == null ? null : json.read(value, ProductView.class);
    },
    error -> {
      cacheErrors.increment();
      return fallback.getIfPresent(id);
    });
}`,
        output: `redis.command.latency p99=1.2ms
cache.hit-ratio=0.93
cache.errors_total{type="RedisConnectionException"} 42
fallback.hit-ratio=0.61

Redis 断开后请求进入 30 秒本地缓存和受控回源，没有形成无限重试。
恢复时通过预热和错峰重建避免再次过载。`,
      }],
    ],
  },
  {
    name: 'RabbitMQ 路由、ACK 与死信',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '理解 AMQP 基本模型、消息队列、HTTP 和幂等消费。',
    goal: '能解释 Exchange、Queue、Binding、Publisher Confirm、Consumer ACK、prefetch 和 DLX，设计有界重试与死信处理。',
    guidedPractice: '创建 direct 与 topic Exchange，模拟路由键未被绑定；开启 Publisher Confirm，消费端先 nack requeue 再设 prefetch，配置 TTL 重试队列和死信队列，记录消息头与 x-death。',
    independentPractice: '实现订单消息的重试链路，覆盖成功、瞬时失败、永久失败、重复投递和队列积压，提交消息状态、延迟和监控证据。',
    commonErrors: ['生产者只 publish 不看 Confirm，Broker 未接收消息却以为发送成功。', '消费者异常时无限 requeue，形成毒消息循环并占满队列。'],
    sourceRefs: [RABBIT, 'Spring AMQP Reference. https://docs.spring.io/spring-amqp/reference/'],
    steps: [
      ['Exchange 按规则路由到 Queue', 'Producer 把消息发布到 Exchange，Binding 根据 routing key 和 Exchange 类型决定目标 Queue。未被路由的消息在未设置 mandatory 时可能被丢弃，因此关键消息要结合 alternate exchange、回退和 Confirm；路由键设计错误往往不会让 publish 抛异常。', '先验证路由，再验证确认', {
        title: 'RabbitMQ：创建绑定并验证路由',
        language: 'PowerShell',
        code: `docker exec rabbitmq rabbitmqadmin declare exchange name=orders type=topic durable=true
docker exec rabbitmq rabbitmqadmin declare queue name=orders.created durable=true
docker exec rabbitmq rabbitmqadmin declare binding source=orders destination=orders.created routing_key=order.created
docker exec rabbitmq rabbitmqadmin publish exchange=orders routing_key=order.created payload='{"id":"O-1"}' properties='{"delivery_mode":2}'
docker exec rabbitmq rabbitmqadmin get queue=orders.created count=1 ackmode=ack_requeue_false
docker exec rabbitmq rabbitmqadmin publish exchange=orders routing_key=order.missing payload='{"id":"O-2"}'`,
        output: `exchange declared: orders
queue declared: orders.created
binding created: order.created
message published: order.created
message received:
payload={"id":"O-1"}

order.missing 没有匹配 binding，默认 publish 仍返回成功但消息不存在于队列。
关键消息需启用 mandatory 或 alternate exchange。`,
      }],
      ['Publisher Confirm 确认 Broker 接收', 'Confirm 模式由 Broker 对 Channel 上的发布返回 ack 或 nack，异步 confirm 需要关联发布序号。它不代表消费者已处理，只代表 RabbitMQ 接收职责的一块边界；数据库副作用仍需业务确认或 Outbox，returned message 还要单独处理。', '发布确认不等于消费成功', {
        title: 'Spring AMQP：Publisher Confirm 与 Return',
        language: 'Java',
        code: `rabbitTemplate.setConfirmCallback((correlation, ack, cause) ->
  metrics.counter("rabbit.publish", ack ? "ack" : "nack").increment());
rabbitTemplate.setReturnsCallback(returned ->
  deadLetter.publish(returned.getMessage(),
    "UNROUTABLE:" + returned.getReplyText()));
rabbitTemplate.setMandatory(true);

CorrelationData correlation = new CorrelationData("O-1:" + UUID.randomUUID());
rabbitTemplate.convertAndSend("orders", "order.created", payload, correlation);
CorrelationData.Confirm confirm =
  correlation.getFuture().get(3, TimeUnit.SECONDS);
log.info("correlation={} ack={}", correlation.getId(), confirm.isAck());`,
        output: `rabbit.publish{ack} +1
correlation=O-1:7f21 ack=true

如果 routing key 不匹配，returns callback 收到 312 NO_ROUTE，CorrelationData 可能仍为 ack。
应用必须同时记录路由失败和 Broker 确认。`,
      }],
      ['消费 ACK 与 prefetch 控制压力', '消费者处理完成后 ack，失败可 nack 或 reject；requeue 会再次投递，prefetch 限制未确认消息数量。ACK 延迟和未确认上限决定内存与公平性，长时间不处理会拖住队列消费者；自动 ACK 在业务处理前确认会造成静默丢失。', '未确认消息也是资源', {
        title: 'Spring AMQP：手动 ACK 与 prefetch',
        language: 'Java',
        code: `@Bean
SimpleRabbitListenerContainerFactory factory(ConnectionFactory connectionFactory) {
  var factory = new SimpleRabbitListenerContainerFactory();
  factory.setConnectionFactory(connectionFactory);
  factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
  factory.setPrefetchCount(20);
  factory.setConcurrentConsumers(4);
  return factory;
}

@RabbitListener(queues = "orders.created")
void consume(Message message, Channel channel) throws IOException {
  long tag = message.getMessageProperties().getDeliveryTag();
  try {
    orderService.applyIdempotently(message);
    channel.basicAck(tag, false);
  } catch (RetryableException error) {
    channel.basicNack(tag, false, false);
  }
}`,
        output: `prefetch=20, consumers=4, unacked upper bound=80
deliveryTag=41 business=applied ack=true
deliveryTag=42 business=transient nack->dead-letter

业务成功才 ACK；可重试失败不无限 requeue。
监控 unacked 和消费耗时，避免 80 条未确认消息长期占住内存。`,
      }],
      ['重试要有次数、延迟和死信', '用 TTL 加 DLX 把失败消息转入延迟队列，超过次数进入死信队列并保留原 routing key、异常和重试次数。x-death 可辅助诊断，但业务不应只依赖 Broker 头决定最终状态；延迟队列的 TTL 到期与死信转发都要验证。', '死信是状态而非垃圾桶', {
        title: 'RabbitMQ：TTL、DLX 与 x-death',
        language: 'PowerShell',
        code: `docker exec rabbitmq rabbitmqadmin declare queue name=orders.retry.5s durable=true arguments='[{"key":"x-message-ttl","value":5000},{"key":"x-dead-letter-exchange","value":"orders"},{"key":"x-dead-letter-routing-key","value":"order.created"}]'
docker exec rabbitmq rabbitmqadmin declare exchange name=orders.dlx type=direct durable=true
docker exec rabbitmq rabbitmqadmin declare queue name=orders.dlq durable=true
docker exec rabbitmq rabbitmqadmin declare binding source=orders.dlx destination=orders.dlq routing_key=order.failed
docker exec rabbitmq rabbitmqadmin get queue=orders.dlq count=1 ackmode=ack_requeue_false
docker exec rabbitmq rabbitmqadmin list queues name messages arguments`,
        output: `orders.retry.5s messages=0 x-message-ttl=5000
orders.dlq messages=1
payload={"id":"O-77"}
properties.headers.x-death:
  queue=orders.created reason=rejected count=4 exchange=orders routing_keys=order.created

消息重试 4 次后进入死信，原 routing key 和拒绝原因保留。
值班人可根据 x-death 和业务状态重新投递。`,
      }],
      ['用拓扑与故障实验验收', '记录 Exchange、Queue、Binding、发布 Confirm、ACK/NACK、x-death 和最终业务状态，注入 Broker 重连、消费者崩溃和重复投递。恢复后确认积压下降、死信可处理且总量对账一致；拓扑对，但业务状态不对，仍不能判定通过。', '拓扑、确认和业务一起对账', {
        title: 'PowerShell：RabbitMQ 故障与积压对账',
        language: 'PowerShell',
        code: `docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
docker restart rabbitmq
Start-Sleep -Seconds 5
1..100 | ForEach-Object {
  docker exec rabbitmq rabbitmqadmin publish exchange=orders routing_key=order.created payload="{\\"id\\":\\"O-$_\\"}" | Out-Null
}
docker stop order-consumer
Start-Sleep -Seconds 5
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
docker start order-consumer
Start-Sleep -Seconds 15
docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
psql $env:DATABASE_URL -c "select count(*) from orders where id like 'O-%'"`,
        output: `before restart: orders.created ready=0 unacked=0 consumers=2
consumer stopped: ready=100 unacked=0 consumers=0
consumer recovered: ready=0 unacked=0 consumers=2
database orders count=100

积压从 0 到 100 再回 0，业务表也有 100 条。
Confirm 失败、route return 和死信数量为 0。`,
      }],
    ],
  },
  {
    name: 'HikariCP 连接池源码与容量',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '掌握 JDBC、数据库事务、线程池、超时和连接生命周期。',
    goal: '能沿 HikariPool 获取、借出、归还和超时解释连接池行为，按数据库容量配置 maximumPoolSize 并定位泄漏。',
    guidedPractice: '设置 maximumPoolSize 为 5、connectionTimeout 为 2 秒，启动 20 个并发慢查询，观察 active、idle、waiting 线程和超时；故意不关闭 Connection 复现泄漏与日志。',
    independentPractice: '为读写服务分别配置两个有界池，提交容量计算、等待 P99、慢 SQL、事务时长和泄漏告警，并证明连接数量不超过数据库配额。',
    commonErrors: ['把连接池调大当作数据库变快，忽略数据库最大连接、CPU 和锁竞争。', '在事务中执行远程调用或忘记关闭连接，导致池被长期占满。'],
    sourceRefs: [HIKARI, 'HikariCP Configuration. https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby'],
    steps: [
      ['连接池复用物理连接', 'HikariPool 维护空闲和借出连接，应用 getConnection 时优先从池中分配，归还时清理状态并放回。创建的物理连接数量受 maximumPoolSize 和 minimumIdle 影响，数据库端仍有独立的连接上限；应用副本数增加时，总连接数会成倍增长。', '池大小由下游能力约束', {
        title: 'HikariCP：观察物理连接与池状态',
        language: 'Java',
        code: `HikariConfig config = new HikariConfig();
config.setJdbcUrl(System.getenv("DATABASE_URL"));
config.setMaximumPoolSize(5);
config.setMinimumIdle(2);
config.setPoolName("orders-pool");
config.setRegisterMbeans(true);

try (HikariDataSource pool = new HikariDataSource(config);
     Connection first = pool.getConnection();
     Connection second = pool.getConnection()) {
  HikariPoolMXBean mx = pool.getHikariPoolMXBean();
  System.out.printf("active=%d idle=%d total=%d waiting=%d%n",
    mx.getActiveConnections(), mx.getIdleConnections(),
    mx.getTotalConnections(), mx.getThreadsAwaitingConnection());
  System.out.println(first.getMetaData().getURL());
}`,
        output: `active=2 idle=0 total=2 waiting=0
jdbc:postgresql://db:5432/orders

两个事务各借一条物理连接，关闭后归还池中。
池配置不是数据库连接总数；10 个应用实例会让上限变成 50。`,
      }],
      ['获取等待有明确超时', '连接不足时，请求进入等待队列，超过 connectionTimeout 抛 SQLTransientConnectionException 一类异常。等待队列变长通常说明事务慢、锁等待、泄漏或池太小，增加池前先定位连接被谁持有；等待线程数比单纯活跃连接数更能暴露拥塞。', '超时是容量信号', {
        title: 'HikariCP：并发耗尽连接池',
        language: 'Java',
        code: `HikariConfig config = new HikariConfig();
config.setJdbcUrl(System.getenv("DATABASE_URL"));
config.setMaximumPoolSize(2);
config.setConnectionTimeout(500);
config.setPoolName("capacity-probe");

try (HikariDataSource pool = new HikariDataSource(config);
     ExecutorService workers = Executors.newFixedThreadPool(12)) {
  CountDownLatch start = new CountDownLatch(1);
  for (int i = 0; i < 12; i++) {
    workers.submit(() -> {
      start.await();
      try (Connection connection = pool.getConnection();
           PreparedStatement query = connection.prepareStatement(
             "select pg_sleep(2)")) {
        query.execute();
      } catch (SQLTransientConnectionException error) {
        System.out.println("pool-timeout waiting="
          + pool.getHikariPoolMXBean().getThreadsAwaitingConnection());
      }
      return null;
    });
  }
  start.countDown();
  workers.shutdown();
  workers.awaitTermination(10, TimeUnit.SECONDS);
}`,
        output: `pool-timeout waiting=8
pool-timeout waiting=6
HikariPool capacity-probe - Connection is not available, request timed out after 500ms

池只有 2 条连接，10 个请求在 500ms 内未获得连接。
慢 SQL 占满连接，增加 timeout 只会让请求等待更久。`,
      }],
      ['借出和归还必须成对', 'try-with-resources 保证 close 归还，Spring 事务把连接绑定到当前线程。提交/回滚或事务结束后才归还，跨线程传递连接和手动关闭会破坏池状态；连接泄漏检测阈值可帮助发现长时间借出，但不能代替正确的资源和事务边界。', '事务边界就是连接持有边界', {
        title: 'HikariCP：泄漏检测与 try-with-resources',
        language: 'Java',
        code: `HikariConfig config = new HikariConfig();
config.setJdbcUrl(System.getenv("DATABASE_URL"));
config.setMaximumPoolSize(3);
config.setLeakDetectionThreshold(2_000);
config.setPoolName("leak-probe");

try (HikariDataSource pool = new HikariDataSource(config)) {
  try (Connection connection = pool.getConnection();
       PreparedStatement query = connection.prepareStatement(
         "select * from orders where id = ?")) {
    query.setString(1, "O-1");
    try (ResultSet rows = query.executeQuery()) {
      while (rows.next()) System.out.println(rows.getString("status"));
    }
  }
  System.out.println("active-after-close="
    + pool.getHikariPoolMXBean().getActiveConnections());
}`,
        output: `PAID
active-after-close=0

如果连接超过 2 秒未归还，日志出现：
Connection leak detection triggered for jdbc:postgresql://db/...

严重泄漏可调用 HikariPoolMXBean.softEvictConnections，让下一笔借出替换连接。`,
      }],
      ['容量按数据库和请求预算计算', '设每个应用实例最大池连接、总实例数、数据库连接上限和读写分池，保留管理连接余量。以等待 P99、查询时长和错误率确定容量，不能用微服务副本数乘固定池值就上线；扩容应用前先确认数据库还能承载新增连接。', '总连接数跨实例统一算', {
        title: 'Java：计算全局连接上限',
        language: 'Java',
        code: `record PoolBudget(int replicas, int poolPerReplica,
  int databaseLimit, int reservedAdminConnections) {
  int applicationConnections() { return replicas * poolPerReplica; }
  int usable() { return databaseLimit - reservedAdminConnections; }
  boolean fits() { return applicationConnections() <= usable(); }
}

PoolBudget current = new PoolBudget(12, 10, 200, 20);
System.out.printf("app=%d usable=%d fits=%s%n",
  current.applicationConnections(), current.usable(), current.fits());

int safePool = current.usable() / current.replicas();
System.out.println("safe-pool-per-replica=" + safePool);`,
        output: `app=120 usable=180 fits=true
safe-pool-per-replica=15

按 12 个副本计算，全局理论上最多 180 条应用连接。
实际池值还要受等待 P99、慢 SQL 和读库配额约束，15 只是安全上限，不是推荐值。`,
      }],
      ['监控池的五个关键量', '采集 active、idle、waiting、获取耗时和创建/关闭连接次数，结合慢 SQL 与事务时长。压测连接耗尽并观察重试预算，修复后验证等待恢复和数据库连接数回到目标范围；池指标必须与 pg_stat_activity 等数据库侧视图对照。', '池指标要和数据库指标对齐', {
        title: 'Prometheus + PostgreSQL：对照池和数据库连接',
        language: 'PowerShell',
        code: `1..80 | ForEach-Object -Parallel {
  curl.exe -s http://127.0.0.1:8080/api/orders/slow?delay=3000 | Out-Null
} -ThrottleLimit 40
curl.exe -s http://127.0.0.1:8080/actuator/prometheus |
  Select-String "hikaricp_connections|hikaricp_connection_timeout"
psql $env:DATABASE_URL -c "select state, count(*) from pg_stat_activity where application_name = 'orders-api' group by state"
psql $env:DATABASE_URL -c "select pid, now() - query_start as age, left(query, 80) from pg_stat_activity where application_name = 'orders-api' order by age desc limit 5"`,
        output: `hikaricp_connections_active{pool="orders-pool"} 25
hikaricp_connections_idle{pool="orders-pool"} 0
hikaricp_connections_pending{pool="orders-pool"} 15
hikaricp_connection_timeout_total{pool="orders-pool"} 4

state=active count=25
pid 2412 age=00:00:03.2 query=select pg_sleep(3)

池 waiting=15，数据库也正好 25 条 active，说明不是泄漏在应用线程，而是 25 条慢查询占住全部连接。`,
      }],
    ],
  },
  {
    name: 'Spring/MyBatis 多数据源路由',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Spring 事务、MyBatis、DataSource、ThreadLocal 和连接池。',
    goal: '能实现 AbstractRoutingDataSource 主从路由，理解获取连接时读取路由键和事务绑定边界，验证线程复用不会串库。',
    guidedPractice: '实现 RoutingDataSource 与上下文 Holder，在 Service 层设置 WRITE/READ；观察 determineCurrentLookupKey、getConnection 和事务提交时的连接，模拟线程池复用未清理上下文。',
    independentPractice: '实现主从双数据源读写路由，覆盖无注解、强制主库、事务内调用、异常清理和并发线程复用，提交两库查询证据和连接日志。',
    commonErrors: ['在事务已经绑定连接后再切换数据源，期待当前事务自动改库。', 'ThreadLocal 路由键在请求结束后不清理，后续复用线程查询串到错误库。'],
    sourceRefs: ['Spring AbstractRoutingDataSource API. https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/lookup/AbstractRoutingDataSource.html', MYBATIS],
    steps: [
      ['路由键在取连接时解析', 'AbstractRoutingDataSource 保存 targetDataSources 默认目标，调用 getConnection 时执行 determineCurrentLookupKey，再由 determineTargetDataSource 选择实际数据源。路由发生在连接获取边界，不是每条 SQL 自动重选；同一事务复用连接时不会再次执行路由。', '路由一次，连接绑定后续', {
        title: 'Spring：AbstractRoutingDataSource 选主从',
        language: 'Java',
        code: `class ReadWriteDataSource extends AbstractRoutingDataSource {
  protected Object determineCurrentLookupKey() {
    Route route = RouteContext.current();
    log.debug("route lookup route={} transaction={}", route,
      TransactionSynchronizationManager.isActualTransactionActive());
    return route == Route.WRITE ? "primary" : "replica";
  }
}

@Bean
DataSource routingDataSource(DataSource primary, DataSource replica) {
  var routing = new ReadWriteDataSource();
  routing.setTargetDataSources(Map.of("primary", primary, "replica", replica));
  routing.setDefaultTargetDataSource(primary);
  return routing;
}`,
        output: `route lookup route=READ transaction=false
route lookup route=READ transaction=false
route lookup route=WRITE transaction=true

每次 getConnection 时读取当前路由键。
若事务已经绑定连接，后续 route=WRITE 也不会替换为主库连接。`,
      }],
      ['事务绑定会固定数据源', 'Spring 事务开始时通过事务管理器取得连接并绑定到线程，后续同事务调用通常复用该连接；中途修改路由键不会替换已绑定连接。需要另一个库时必须先结束当前事务，必要时用独立事务管理器并明确传播；跨库调用不能只靠注解切换。', '先开事务再切库通常无效', {
        title: 'Spring Test：验证事务内切库无效',
        language: 'Java',
        code: `@SpringBootTest
class RoutingTransactionTest {
  @Autowired JdbcTemplate jdbc;

  @Test
  @Transactional
  void routeKeyChangeDoesNotReplaceBoundConnection() {
    RouteContext.set(Route.WRITE);
    String firstUrl = jdbc.queryForObject(
      "select current_setting('cluster_name')", String.class);
    RouteContext.set(Route.READ);
    String secondUrl = jdbc.queryForObject(
      "select current_setting('cluster_name')", String.class);
    assertEquals(firstUrl, secondUrl);
    assertTrue(firstUrl.contains("primary"));
  }
}`,
        output: `firstUrl=primary-cluster
secondUrl=primary-cluster

事务开始时已取得 primary 连接，把 ThreadLocal 改成 READ 后仍复用原连接。
若要查询 replica，需在事务外调用或使用独立事务边界。`,
      }],
      ['上下文要有严格生命周期', '用 ThreadLocal 保存路由键时，在请求入口设置、finally 清除，异步线程和回调要显式传播。Spring 的 TransactionSynchronizationManager 也绑定线程状态，混用线程池时要验证清理和优先级；异步任务默认不会继承父线程的 ThreadLocal。', '线程复用会把上下文带错', {
        title: 'Spring：请求结束后清理路由键',
        language: 'Java',
        code: `@Component
class RouteFilter extends OncePerRequestFilter {
  protected void doFilterInternal(HttpServletRequest request,
      HttpServletResponse response, FilterChain chain) throws Exception {
    boolean write = request.getMethod().matches("POST|PUT|PATCH|DELETE");
    RouteContext.set(write ? Route.WRITE : Route.READ);
    try {
      chain.doFilter(request, response);
    } finally {
      RouteContext.clear();
    }
  }
}

class RouteContext {
  private static final ThreadLocal<Route> CURRENT = new ThreadLocal<>();
  static Route current() { return CURRENT.get(); }
  static void set(Route route) { CURRENT.set(route); }
  static void clear() { CURRENT.remove(); }
}`,
        output: `request POST /orders route=WRITE
request GET /orders route=READ
after filter route=null

finally 清理 ThreadLocal，线程池复用下不会把 WRITE 带到下一请求。
异步任务必须显式传入 route，不能依赖父线程残留。`,
      }],
      ['MyBatis 工厂与事务管理器要配套', '不同 DataSource 通常需要独立 SqlSessionFactory、事务管理器和 Mapper 扫描边界。共享 Mapper 看似方便，却可能把主从选择交给隐式状态；显式服务方法与数据源边界更容易测试，也避免 MyBatis 会话在一次事务中错误复用另一库的 Executor。', '数据源、会话、事务三者成套', {
        title: 'Spring：为主从配置独立 SqlSessionFactory',
        language: 'Java',
        code: `@Configuration
class PrimaryMyBatisConfig {
  @Bean("primarySqlSessionFactory")
  SqlSessionFactory primarySqlSessionFactory(
      @Qualifier("primary") DataSource dataSource) throws Exception {
    var bean = new SqlSessionFactoryBean();
    bean.setDataSource(dataSource);
    bean.setMapperLocations(new PathMatchingResourcePatternResolver()
      .getResources("classpath*:mapper/primary/**/*.xml"));
    return bean.getObject();
  }

  @Bean("primaryTransactionManager")
  DataSourceTransactionManager primaryTransactionManager(
      @Qualifier("primary") DataSource dataSource) {
    return new DataSourceTransactionManager(dataSource);
  }
}`,
        output: `primarySqlSessionFactory -> primaryDataSource
primaryTransactionManager -> primaryDataSource
Mapper order.primary.OrderMapper 只扫描 primary 目录

数据源、SqlSessionFactory 和事务管理器共用同一资源。
replica 也按同样方式独立配置，不能只共享一个 @Transactional 管理器。`,
      }],
      ['用双库标记与并发测试验收', '在两个库写入不同标记，执行读、写、强制读主库和事务内切库，记录实际连接 URL 和 SQL。多线程复用同一个工作线程反复请求，证明 finally 清理后不会读到上次数据源；并发日志必须带请求 ID，否则线程名相同也无法证明上下文隔离。', '连接 URL 是最直接证据', {
        title: 'Spring Test：双库标记与线程复用',
        language: 'Java',
        code: `@SpringBootTest
class ReadWriteRoutingTest {
  @Autowired RouteProbe probe;

  @Test
  void routesReadsWritesAndClearsContext() {
    assertEquals("primary", probe.write("O-1"));
    assertEquals("replica", probe.read("O-1"));
    assertEquals("primary", probe.forcePrimary("O-1"));

    ExecutorService thread = Executors.newSingleThreadExecutor();
    for (int i = 0; i < 20; i++) {
      int request = i;
      String database = thread.submit(() ->
        request % 2 == 0 ? probe.write("O-" + request) : probe.read("O-" + request)
      ).get();
      assertEquals(request % 2 == 0 ? "primary" : "replica", database);
      assertNull(RouteContext.current());
    }
    thread.shutdown();
  }
}`,
        output: `write O-1 database=primary
read O-1 database=replica
force-primary O-1 database=primary
20 calls on reused thread: context=null after each call

同一个线程交替读写没有串库，连接 URL 和清理断言共同证明路由正确。`,
      }],
    ],
  },
  {
    name: '多数据源事务与读写分离',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '完成路由数据源、事务、复制和连接池课程。',
    goal: '能区分本地事务、跨库一致性和复制延迟，设计写后读、从库延迟监控与失败回退，不伪装跨库原子提交。',
    guidedPractice: '向主库写入后立即查询从库，记录主库提交时间、复制延迟和从库读取结果；再用强制主库策略重查，比较事务管理器、连接标识和结果。',
    independentPractice: '为账户与订单两个数据库设计读写流程，覆盖主库成功从库延迟、复制中断、跨库失败和回滚，提交一致性窗口与补偿方案。',
    commonErrors: ['给两个数据库配置一个普通事务管理器就声称跨库原子提交。', '写后立刻读从库并把偶发旧值归因于缓存。'],
    sourceRefs: ['Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html', 'MySQL Replication Documentation. https://dev.mysql.com/doc/refman/8.4/en/replication.html'],
    steps: [
      ['本地事务只覆盖一个资源', '一个 DataSource 事务管理器通常只能对同一连接上的数据库操作提交或回滚，两个独立 DataSource 的连接无法自动形成一个 XA 或本地原子事务。代码里有 @Transactional 不代表跨库失败会一起撤销；要标出事务管理器、连接和真实提交点。', '先标出事务真正覆盖的资源', {
        title: 'Spring Test：两个本地事务不会同时回滚',
        language: 'Java',
        code: `@SpringBootTest
class TwoDatabaseTransactionTest {
  @Autowired @Qualifier("ordersTx") TransactionTemplate ordersTx;
  @Autowired @Qualifier("billingTx") TransactionTemplate billingTx;

  @Test
  void secondDatabaseFailureLeavesFirstCommitted() {
    ordersTx.executeWithoutResult(status ->
      orders.update("insert into orders(id, status) values('O-9','CREATED')"));
    assertThrows(RuntimeException.class, () ->
      billingTx.executeWithoutResult(status -> {
        billing.insert("insert into billing(id, amount) values('O-9',100)");
        throw new IllegalStateException("billing failed");
      }));
    assertTrue(orders.exists("O-9"));
    assertFalse(billing.exists("O-9"));
  }
}`,
        output: `orders transaction committed: O-9 CREATED
billing transaction rolled back: O-9 absent

两个 TransactionTemplate 各自管理一个 DataSource。
第一个事务已提交，第二个失败不会撤销订单库写入。`,
      }],
      ['复制延迟要被当作时间窗口', '主库提交成功到从库可读存在网络、线程、SQL 执行和复制状态差异，延迟不是固定常量。记录 binlog/位点、复制线程、秒级延迟和查询位点，才能判断旧读是否在预期窗口内；延迟必须以业务版本或数据时间证明，不只看复制线程是否 running。', '读写分离一定定义陈旧度', {
        title: 'MySQL：记录复制位点与延迟',
        language: 'SQL',
        code: `SHOW REPLICA STATUS\\G
SELECT
  MASTER_POS_WAIT('mysql-bin.000041', 918233, 2) AS caught_up;
SELECT @@global.server_id AS server_id,
       @@hostname AS hostname,
       NOW(6) AS replica_now;
SELECT version, updated_at
FROM orders.orders
WHERE id = 'O-44';
SELECT TIMESTAMPDIFF(MICROSECOND, MAX(created_at), NOW(6)) / 1000
       AS oldest_unapplied_ms
FROM performance_schema.replication_applier_status_by_worker;`,
        output: `Replica_IO_Running: Yes
Replica_SQL_Running: Yes
Seconds_Behind_Source: 4
MASTER_POS_WAIT returned 1 (reached position)
replica_now=2026-11-24 11:03:21.150000
orders O-44 version=8 updated_at=11:03:16.920000

复制线程正常，但目标位点在 2 秒内到达；从库读取的时刻和主库版本写入时间都进入证据。`,
      }],
      ['写后读使用主库或会话粘滞', '对余额、订单详情等要求读到自己写入的查询，在写事务后的一段时间或同一会话强制主库，或将最新版本带回。粘滞窗口到期后允许从库，避免永久把所有流量压回主库；粘滞必须绑定用户或会话，不能只存在某个线程。', '一致性要求落到查询路由', {
        title: 'Spring：写后读会话粘滞主库',
        language: 'Java',
        code: `@Service
class OrderWriter {
  private final OrderRepository primary;
  private final SessionPin pin;

  @Transactional("primaryTx")
  public OrderView create(CreateOrder command) {
    OrderView created = primary.insert(command);
    pin.toPrimary(command.sessionId(), Duration.ofSeconds(3));
    return created;
  }
}

@Service
class OrderReader {
  private final RouteContext route;
  private final OrderRepository replica;
  private final OrderRepository primary;

  public OrderView get(String id, String sessionId) {
    return route.isPinned(sessionId)
      ? primary.findById(id).orElseThrow()
      : replica.findById(id).orElseThrow();
  }
}`,
        output: `POST /orders session=s-7f2 write primary
pin session=s-7f2 to-primary ttl=3s
GET /orders/O-9 session=s-7f2 route=primary
GET /orders/O-9 session=s-7f2 after 3s route=replica

写后 3 秒内读取主库，窗口结束后重新分流。
pin 存在会话存储，不依赖线程 ThreadLocal 碰巧保留。`,
      }],
      ['跨库流程用补偿而非假装原子', '先完成一个库的本地事务并保存流程状态，再用 Outbox/Saga 驱动另一个库；失败时有明确重试、补偿和人工介入。每一步状态可恢复，不能只靠一个调度器重试整段业务；幂等键和可查询流程 ID 是恢复基础。', '流程状态是恢复基础', {
        title: 'SQL：订单与计费两库流程状态',
        language: 'SQL',
        code: `BEGIN;
INSERT INTO orders.outbox(flow_id, step, payload, status)
VALUES ('F-9001', 'ORDER_CREATED', '{"orderId":"O-9"}', 'PENDING');
INSERT INTO orders.orders(id, status, flow_id)
VALUES ('O-9', 'CREATED', 'F-9001');
COMMIT;

UPDATE billing.flow_state
SET status = 'BILLING_PENDING', attempts = attempts + 1
WHERE flow_id = 'F-9001' AND status IN ('INIT','BILLING_RETRY');

INSERT INTO billing.invoices(order_id, amount, flow_id)
VALUES ('O-9', 100, 'F-9001')
ON CONFLICT (flow_id) DO NOTHING;
UPDATE billing.flow_state
SET status = 'COMPLETED', completed_at = now()
WHERE flow_id = 'F-9001' AND status = 'BILLING_PENDING';`,
        output: `orders/outbox committed flow=F-9001 status=PENDING
billing/flow_state updated 1 row attempts=1
billing/invoices inserted 1 row
billing/flow_state completed 1 row

每个库内步骤有事务，跨库由 flow_id 和状态推进。
重试时 invoice 的 flow_id 唯一约束防止重复扣费。`,
      }],
      ['监控主从与业务双视角', '指标包含主库提交耗时、复制延迟、从库错误、强制主库比例、跨库流程卡住数和对账差异。故障演练中断复制与网络，验证用户提示、重试、补偿和恢复后的数据一致；复制指标恢复不代表业务数据已经追平。', '复制指标要接业务语义', {
        title: 'PowerShell：中断复制并核对业务版本',
        language: 'PowerShell',
        code: `mysql -h mysql-primary -e "STOP REPLICA SQL_THREAD"
mysql -h mysql-primary -e "INSERT INTO orders.orders(id, status, version) VALUES('O-77','PAID',1)"
mysql -h mysql-replica -e "SELECT id, status, version FROM orders.orders WHERE id='O-77'"
mysql -h mysql-replica -e "SHOW REPLICA STATUS\\G" | Select-String "Replica_SQL_Running|Last_SQL_Error|Seconds_Behind_Source"
mysql -h mysql-primary -e "START REPLICA SQL_THREAD"
Start-Sleep -Seconds 2
mysql -h mysql-replica -e "SELECT id, status, version FROM orders.orders WHERE id='O-77'"
mysql -h mysql-replica -e "SHOW REPLICA STATUS\\G" | Select-String "Replica_SQL_Running|Seconds_Behind_Source"`,
        output: `主库写入 O-77 version=1
从库查询：Empty set
Replica_SQL_Running: No
Seconds_Behind_Source: 6

恢复后：
O-77 PAID 1
Replica_SQL_Running: Yes, Seconds_Behind_Source: 0

监控同时记录旧读数量和强制主库比例；线程恢复后业务版本也已追平。`,
      }],
    ],
  },
  {
    name: 'Outbox、Saga 与跨库一致性',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成 Kafka、数据库事务、多数据源和补偿流程课程。',
    goal: '能解释 Outbox 的本地事务保证、轮询发布、幂等消费和 Saga 状态机，在崩溃点下验证最终一致。',
    guidedPractice: '在订单库同一事务写订单和 Outbox 行，用轮询任务发布到 Kafka 并标记 sent；在业务提交后、发送前、发送后标记前分别杀进程，观察重复与恢复。',
    independentPractice: '实现订单与库存 Saga，包含预留、确认、补偿、超时和人工处理；注入消息重复、乱序和库存失败，提交状态机与对账报告。',
    commonErrors: ['先写数据库再直接发 Kafka，数据库成功而发送失败时没有重试记录。', 'Saga 补偿不幂等，重复补偿导致库存增加两次或释放不存在的预占。'],
    sourceRefs: ['Transactional Outbox pattern. https://microservices.io/patterns/data/transactional-outbox.html', SPRING_KAFKA],
    steps: [
      ['同一数据库事务写状态和事件', 'Outbox 表与业务表位于同一数据库，业务更新和待发事件在同一事务提交，避免“业务成功、消息丢失”的直接窗口。发送器只处理已提交记录，发送成功后标记 sent，失败保留以便重试；事件序列化与业务更新一起失败或提交。', '本地事务保证事件不丢', {
        title: 'SQL：订单和 Outbox 同事务提交',
        language: 'SQL',
        code: `BEGIN;
UPDATE orders.orders
SET status = 'PAID', version = version + 1
WHERE id = 'O-1' AND status = 'CREATED';

INSERT INTO orders.outbox(
  event_id, aggregate_id, event_type, payload, status, created_at
) VALUES (
  'evt-7f21', 'O-1', 'ORDER_PAID',
  '{"orderId":"O-1","status":"PAID"}', 'PENDING', now()
);
COMMIT;

SELECT event_id, status, attempts, created_at
FROM orders.outbox WHERE aggregate_id = 'O-1';`,
        output: `UPDATE 1
INSERT 0 1
COMMIT
event_id=evt-7f21 status=PENDING attempts=0

订单状态和待发事件在同一数据库事务提交。
若事务回滚，两行都不存在，不会出现订单已支付而事件丢失。`,
      }],
      ['发送语义通常是至少一次', '发送器可能已经投递但崩溃在标记前，重启会再次发送；因此消费者必须用事件 ID 和业务键幂等。去重表、唯一约束或状态迁移要与业务写入同事务，不能只在内存 Set 里去重；Kafka 幂等 Producer 也不能覆盖重启后的新会话。', '重复是设计输入', {
        title: 'Java：轮询 Outbox 并幂等消费',
        language: 'Java',
        code: `@Scheduled(fixedDelay = 1000)
void publishBatch() {
  List<OutboxRow> rows = outbox.lockPending(100);
  for (OutboxRow row : rows) {
    try {
      producer.send(new ProducerRecord<>("order-events", row.aggregateId(),
        row.eventId(), row.payload())).get(3, TimeUnit.SECONDS);
      outbox.markSent(row.eventId(), Instant.now());
    } catch (Exception error) {
      outbox.markFailed(row.eventId(), error.getClass().getSimpleName());
    }
  }
}

@Transactional
void consume(Event event) {
  int inserted = consumedEvents.insertIgnore(event.eventId());
  if (inserted == 0) return;
  inventory.apply(event.orderId(), event.type());
}`,
        output: `outbox evt-7f21 sent offset=91
crash after send before markSent
restart resends evt-7f21 offset=92
consumer consumed_events insert=0 on second delivery

消息至少一次，业务副作用只执行一次。`,
      }],
      ['Saga 用状态机管理步骤', '每个 Saga 步骤记录 pending、completed、failed、compensating 等状态和输入，执行下一步前持久化决定。超时通过查询或协调器推进，补偿按逆序执行且可重复，最终状态可审计；状态迁移必须有条件，避免并发调度器重复推进。', '流程状态不能藏在日志里', {
        title: 'SQL：订单库存 Saga 状态机',
        language: 'SQL',
        code: `INSERT INTO workflow.saga(flow_id, order_id, status, version)
VALUES ('F-9001', 'O-9', 'STARTED', 0);

UPDATE workflow.saga
SET status = 'RESERVING', version = version + 1, updated_at = now()
WHERE flow_id = 'F-9001' AND status = 'STARTED' AND version = 0;

INSERT INTO inventory.reservations(flow_id, sku, quantity, status)
VALUES ('F-9001', 'SKU-1', 2, 'RESERVED')
ON CONFLICT (flow_id) DO NOTHING;

UPDATE workflow.saga
SET status = 'RESERVED', version = version + 1, updated_at = now()
WHERE flow_id = 'F-9001' AND status = 'RESERVING' AND version = 1;

SELECT flow_id, status, version, updated_at
FROM workflow.saga WHERE flow_id = 'F-9001';`,
        output: `STARTED -> RESERVING version=1
reservation inserted flow=F-9001 status=RESERVED
RESERVING -> RESERVED version=2
flow_id=F-9001 status=RESERVED version=2

每次迁移都检查当前状态和版本，重复调度不会重复预留库存。`,
      }],
      ['乱序需要版本和条件更新', '消息可能延迟、重复或跨分区乱序，状态迁移使用版本号、预期状态和数据库条件更新拒绝过期事件。消费者先验证事件是否适用于当前步骤，再执行副作用；被拒绝的事件仍要记录原因和版本，便于对账。', '旧事件不能覆盖新状态', {
        title: 'SQL：拒绝过期版本事件',
        language: 'SQL',
        code: `-- 新事件先到，推进到 version=5
UPDATE workflow.saga
SET status = 'COMPLETED', version = 5
WHERE flow_id = 'F-9001' AND version = 4;

-- 旧事件随后到达，只能匹配 version=3
UPDATE workflow.saga
SET status = 'INVENTORY_RESERVED', version = 4
WHERE flow_id = 'F-9001' AND version = 3;
SELECT flow_id, status, version FROM workflow.saga WHERE flow_id = 'F-9001';

INSERT INTO workflow.event_log(flow_id, event_id, expected_version, outcome)
VALUES ('F-9001', 'evt-old-3', 3, 'REJECTED_STALE');`,
        output: `UPDATE 1 (new event: version 4 -> 5)
UPDATE 0 (old event expected version 3)
flow_id=F-9001 status=COMPLETED version=5
event_log evt-old-3 outcome=REJECTED_STALE expected_version=3

旧事件无法覆盖已完成状态，拒绝原因也被持久化。`,
      }],
      ['用崩溃点和对账验收', '在业务提交、Outbox 发送、消费者副作用、状态更新和补偿处注入崩溃，检查最终订单、库存、消息和流程状态。日终对账发现卡住流程并进入人工队列，满足恢复阈值后才结束；测试要自动断言不丢、不重和版本一致。', '每个崩溃点都能恢复', {
        title: 'PowerShell：Outbox 崩溃点演练',
        language: 'PowerShell',
        code: `$env:CRASH_POINT = "AFTER_BUSINESS_COMMIT"
Start-Process java -ArgumentList @("-jar","order-service.jar") | Out-Null
Start-Sleep -Seconds 4
$target = (Get-CimInstance Win32_Process | Where-Object CommandLine -like "*order-service.jar*").ProcessId
Stop-Process -Id $target -Force
psql $env:DATABASE_URL -c "select status, count(*) from orders.outbox group by status"
psql $env:DATABASE_URL -c "select flow_id, status, version from workflow.saga where order_id='O-9'"
$env:CRASH_POINT = ""
Start-Process java -ArgumentList @("-jar","order-service.jar") | Out-Null
Start-Sleep -Seconds 15
psql $env:DATABASE_URL -c "select status, count(*) from orders.outbox group by status"
psql $env:DATABASE_URL -c "select flow_id, status, version from workflow.saga where order_id='O-9'"
psql $env:DATABASE_URL -c "select count(*) from inventory.reservations where flow_id='F-9001'"`,
        output: `崩溃后：
outbox PENDING 1
saga F-9001 RESERVING version=1
恢复后：
outbox SENT 1
saga F-9001 COMPLETED version=3
reservations count=1

业务、消息、流程和库存四张表对账一致。
重复重放不会增加预留数量，卡住流程为 0。`,
      }],
    ],
  },
];

const J10_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '模块边界、API 与错误模型',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成 Java 包、Maven/Gradle、Spring MVC 和领域建模课程。',
    goal: '能按业务变化划分模块，限制内部表访问，设计稳定 API 契约和统一错误模型，并用依赖与契约测试验证。',
    guidedPractice: '把订单、库存、支付拆成三个包或 Maven 模块，绘制依赖图，用 ArchUnit 规则禁止跨模块访问 internal 包；让一个非法输入分别经过 Controller、Service 和数据库，观察错误映射。',
    independentPractice: '为订单 API 编写 OpenAPI 契约和统一错误响应，覆盖校验失败、资源不存在、冲突、无权限和内部错误，加入归档、幂等和 trace ID。',
    commonErrors: ['模块按 Controller、Service、Mapper 技术层拆分，却不约束业务边界，导致订单模块直接读写库存表。', '所有异常都返回 500 或固定 message，客户端无法区分可重试、校验和权限问题。'],
    sourceRefs: [SPRING, 'RFC 9457 Problem Details for HTTP APIs. https://www.rfc-editor.org/rfc/rfc9457'],
    steps: [
      ['模块按变化原因和所有权拆分', '一个模块应拥有稳定的业务能力和数据，其他模块通过公开接口、事件或 API 访问，不直接依赖内部表。技术层目录可以存在，但不能代替业务边界；边界要与团队所有权、事务和发布节奏一致，能以独立测试和发布窗口验证。', '模块拥有能力和数据', {
        title: 'Maven：按业务能力拆分模块',
        language: 'XML',
        code: `<modules>
  <module>order-domain</module>
  <module>order-api</module>
  <module>inventory-api</module>
  <module>inventory-app</module>
</modules>

<dependency>
  <groupId>com.example</groupId>
  <artifactId>inventory-api</artifactId>
  <version>\${project.version}</version>
</dependency>
<!-- order-app 不依赖 inventory-app -->
<enforcer>
  <rules><bannedDependencies>
    <excludes><exclude>com.example:*:*-internal</exclude></excludes>
  </bannedDependencies></rules>
</enforcer>`,
        output: `order-app -> order-domain, inventory-api
inventory-app -> inventory-domain, order-api
依赖图没有 app 到 app 的边

订单模块只能通过 inventory-api 调用库存能力，不能直接引用库存内部实现。
模块拥有自己的领域与数据，发布边界清晰。`,
      }],
      ['依赖只指向公开契约', 'Java package-private、模块 exports 或构建依赖可限制可见性，ArchUnit 可在测试中禁止内部包被引用。公开类型保持少而稳定，内部 DTO 和数据库实体不直接成为跨模块 API；包名和 Maven 模块要共同表达边界。', '内部实现要真正不可达', {
        title: 'ArchUnit：禁止跨模块访问 internal',
        language: 'Java',
        code: `@ArchTest
static final ArchRule modules_only_use_public_packages =
  noClasses()
    .that().resideInAPackage("..order..")
    .should().dependOnClassesThat()
    .resideInAnyPackage("..inventory.internal..", "..payment.internal..")
    .because("cross-module access must use public API");

@ArchTest
static final ArchRule domain_does_not_depend_on_web =
  noClasses()
    .that().resideInAPackage("..order.domain..")
    .should().dependOnClassesThat()
    .resideInAnyPackage("org.springframework.web..");

@Test
void architecture() {
  JavaClasses classes = new ClassFileImporter()
    .importPackages("com.example");
  modules_only_use_public_packages.check(classes);
}`,
        output: `Architecture Violation - Rule 'modules only use public packages' failed
order.application.OrderService -> inventory.internal.InventoryRow

修复前测试准确找到内部依赖。
改为 inventory.api.InventoryClient 后架构测试通过。`,
      }],
      ['HTTP 错误分层表达', '请求语法和字段校验可用 400，认证失败 401，无权限 403，资源不存在 404，状态冲突或幂等冲突可用 409，限流 429，服务端问题 5xx。错误体包含稳定 code、message、字段列表和 traceId，不泄露堆栈；HTTP 状态表达类别，业务 code 表达客户端可执行的细分原因。', '状态码和业务 code 各司其职', {
        title: 'Spring MVC：RFC 9457 错误响应',
        language: 'Java',
        code: `@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {
  @ExceptionHandler(OrderConflictException.class)
  ProblemDetail conflict(OrderConflictException error) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
      HttpStatus.CONFLICT, "Order state changed");
    problem.setType(URI.create("https://api.example/errors/order-conflict"));
    problem.setTitle("Order conflict");
    problem.setProperty("code", "ORDER_STATE_CONFLICT");
    problem.setProperty("traceId", MDC.get("traceId"));
    problem.setProperty("currentVersion", error.currentVersion());
    return problem;
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ProblemDetail validation(MethodArgumentNotValidException error) {
    ProblemDetail problem = ProblemDetail.forStatus(400);
    problem.setProperty("code", "VALIDATION_FAILED");
    problem.setProperty("fields", fieldErrors(error));
    return problem;
  }
}`,
        output: `HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://api.example/errors/order-conflict",
  "title": "Order conflict",
  "status": 409,
  "detail": "Order state changed",
  "code": "ORDER_STATE_CONFLICT",
  "currentVersion": 8,
  "traceId": "7f21a"
}`,
      }],
      ['契约测试固定跨模块行为', 'OpenAPI 或消费者契约测试验证请求字段、状态码、错误体和兼容性，数据库集成测试验证约束，架构测试验证依赖。每次更改公开接口先跑契约，再评估客户端升级窗口；契约要同时覆盖成功响应和错误响应。', '边界由测试持续保护', {
        title: 'Spring Cloud Contract：错误体消费者契约',
        language: 'Groovy',
        code: `Contract.make {
  request {
    method 'GET'
    url '/api/orders/O-missing'
    headers { header('Accept', 'application/problem+json') }
  }
  response {
    status 404
    headers { contentType('application/problem+json') }
    body([
      type: 'https://api.example/errors/not-found',
      code: 'ORDER_NOT_FOUND',
      status: 404,
      traceId: $(anyNonBlankString())
    ])
  }
}`,
        output: `./gradlew contractTest
✔ GET /api/orders/O-missing returns 404 problem+json
✔ code=ORDER_NOT_FOUND
✔ traceId is present

客户端与提供方使用同一契约。
删除 code 或改状态码会让构建失败，而不是上线后才暴露。`,
      }],
      ['错误是运维接口', '同类错误使用统一日志字段，区分 expected validation 与 unexpected exception；5xx 记录服务端 cause，4xx 不记录敏感输入。指标按 route、code 和依赖聚合，帮助定位是输入、权限还是下游故障；错误日志和用户响应共享 traceId，但不共享堆栈。', '日志与指标共用一个错误模型', {
        title: 'Micrometer + Logback：错误码指标与 trace',
        language: 'Java',
        code: `ProblemDetail problem = ...;
String route = request.getAttribute(BEST_MATCHING_PATTERN_ATTRIBUTE).toString();
String code = String.valueOf(problem.getProperties().get("code"));
Counter.builder("api.errors")
  .tag("route", route)
  .tag("status", String.valueOf(problem.getStatus()))
  .tag("code", code)
  .register(registry)
  .increment();

if (problem.getStatus() >= 500) {
  log.error("request_failed traceId={} route={} code={}",
    MDC.get("traceId"), route, code, cause);
} else {
  log.info("request_rejected traceId={} route={} code={}",
    MDC.get("traceId"), route, code);
}`,
        output: `api.errors{route="/api/orders/{id}",status="404",code="ORDER_NOT_FOUND"} 1
request_rejected traceId=7f21a route=/api/orders/{id} code=ORDER_NOT_FOUND

4xx 只记录脱敏业务字段；5xx 额外记录 cause。
指标按稳定 route 聚合，不使用真实路径和用户 ID 做高基数标签。`,
      }],
    ],
  },
  {
    name: '数据库迁移与数据回填',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 SQL、索引、事务、Flyway/Liquibase 和发布流程。',
    goal: '能按 expand-migrate-contract 设计兼容迁移，在线回填大数据并验证锁、耗时、失败和回滚边界。',
    guidedPractice: '为订单新增非空状态列，先用可空列和默认写入扩展，再分批回填并记录 checkpoint，双读写稳定后切读，最后加非空约束；每步执行 EXPLAIN 和锁观察。',
    independentPractice: '为百万行表做一次在线迁移，覆盖新旧版本并行、回填中断、重复执行和回滚，提交批次耗时、锁、错误和业务一致性报告。',
    commonErrors: ['一次性 UPDATE 全表并直接加非空约束，在高峰期产生长锁和阻塞。', '迁移脚本不可重复执行，回填失败后从头开始并重复产生副作用。'],
    sourceRefs: ['Flyway Documentation. https://documentation.red-gate.com/flyway', 'PostgreSQL DDL and Concurrency Documentation. https://www.postgresql.org/docs/current/ddl.html'],
    steps: [
      ['扩展阶段只加兼容结构', '先添加可空列、索引或新表，让旧版本应用仍能运行；默认值和索引创建要考虑数据库锁行为。此阶段不要求新字段立即成为唯一事实源，目标是让新旧结构同时存活的发布窗口可工作；DDL 要使用在线或并发选项。', '扩展阶段避免破坏旧版本', {
        title: 'PostgreSQL：添加可空列与并发索引',
        language: 'SQL',
        code: `BEGIN;
ALTER TABLE orders.orders
  ADD COLUMN payment_state varchar(24);
COMMIT;

CREATE INDEX CONCURRENTLY idx_orders_payment_state
  ON orders.orders(payment_state)
  WHERE payment_state IS NOT NULL;

SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='orders' AND table_name='orders'
  AND column_name='payment_state';
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='orders' AND tablename='orders'
  AND indexname='idx_orders_payment_state';`,
        output: `ALTER TABLE
CREATE INDEX
column_name=payment_state is_nullable=YES data_type=character varying
indexname=idx_orders_payment_state

旧版本 INSERT 不写新列仍可成功，索引并发创建避免阻塞写入。
新字段此时只是可选副本，尚未切换事实源。`,
      }],
      ['回填使用小批次与检查点', '按主键范围分批更新，每批独立事务并记录最后处理 ID、时间和失败原因。控制批大小、休眠与并发，监控锁等待、复制延迟和 IO；重复执行要跳过已完成范围或使用幂等条件，检查点必须与数据处理同事务或可重放。', '批次可恢复，进度可审计', {
        title: 'PostgreSQL：按主键批次回填并记录检查点',
        language: 'SQL',
        code: `WITH batch AS (
  SELECT id FROM orders.orders
  WHERE payment_state IS NULL
  ORDER BY id
  LIMIT 1000
  FOR UPDATE SKIP LOCKED
)
UPDATE orders.orders o
SET payment_state = CASE WHEN o.status = 'PAID' THEN 'PAID' ELSE 'UNPAID' END
FROM batch
WHERE o.id = batch.id
RETURNING o.id;

INSERT INTO migration.checkpoint(name, last_id, processed, updated_at)
VALUES ('orders.payment_state', (SELECT max(id) FROM orders.orders WHERE payment_state IS NOT NULL), 1000, now())
ON CONFLICT (name) DO UPDATE SET
  last_id = EXCLUDED.last_id,
  processed = migration.checkpoint.processed + EXCLUDED.processed,
  updated_at = EXCLUDED.updated_at;

SELECT name, last_id, processed, updated_at FROM migration.checkpoint
WHERE name='orders.payment_state';`,
        output: `UPDATE 1000
INSERT 0 1
name=orders.payment_state last_id=O-1000 processed=1000

每批 1000 行、独立提交并使用 SKIP LOCKED。
失败后从 payment_state IS NULL 和 checkpoint 继续，不从头全表更新。`,
      }],
      ['双写双读管理过渡', '过渡期写入新旧字段并校验一致，读取可按开关逐步切到新结构。后台对账发现差异后修正，切读达到稳定窗口后再停止旧写入，不能跳过数据比对直接清理；开关切换要按租户或流量比例，并保留快速回退。', '切换必须有对账证据', {
        title: 'Java：双写与对账查询',
        language: 'Java',
        code: `@Transactional
public void updatePayment(String id, PaymentState state) {
  OrderRow row = repository.lock(id);
  row.setStatus(state.legacyValue());
  row.setPaymentState(state.name());
  repository.save(row);
  meter.counter("migration.dual-write", state.name()).increment();
}

@Scheduled(cron = "0 */10 * * * *")
public void reconcile() {
  List<Mismatch> mismatches = jdbc.query("""
    select id, status, payment_state
    from orders.orders
    where (status = 'PAID') <> (payment_state = 'PAID')
    limit 500
    """, mismatchMapper);
  mismatches.forEach(reconciler::scheduleFix);
  meter.gauge("migration.payment.mismatch", mismatches.size());
}`,
        output: `dual-write PAID metrics +1
reconcile mismatches=0
read-switch tenant=acme percent=10

每次更新同时写旧状态和新字段，每 10 分钟对账。
连续多个对账窗口为 0 后才允许扩大新字段读流量。`,
      }],
      ['收缩阶段最后删除', '新版本稳定且回滚窗口结束后，再删旧列、旧索引和兼容代码。删除前确认没有旧实例、报表和外部消费者使用旧结构；每一步迁移保留版本号与回滚策略，删除动作应有独立变更记录和备份或重建方案。', '删除是最后一步', {
        title: 'PostgreSQL：收缩前检查依赖与流量',
        language: 'SQL',
        code: `SELECT count(*) AS old_column_readers
FROM pg_stat_statements
WHERE query ILIKE '%orders.status%'
  AND query NOT ILIKE '%payment_state%';

SELECT id, status, payment_state
FROM orders.orders
WHERE status IS DISTINCT FROM payment_state
LIMIT 20;

SELECT version, description, success
FROM flyway_schema_history
ORDER BY installed_rank DESC LIMIT 5;

-- 回滚窗口结束、旧版本实例为 0、对账差异为 0 后才执行
ALTER TABLE orders.orders DROP COLUMN status;`,
        output: `old_column_readers=0
mismatch rows=0
V42 migrate payment_state success=t
V43 add payment_state constraint success=t
ALTER TABLE

旧列读写为 0、差异为 0、旧实例全部下线后才删除。
删除脚本独立审查并保留 V45 重建方案。`,
      }],
      ['迁移也是发布工程', '记录迁移前置检查、命令、锁等待、回填进度、停止条件和回滚脚本，先在影子库或低流量环境演练。生产执行后核对行数、约束、索引和业务查询，失败时先停止新流量再处理数据；迁移结果要进入发布记录，而不是只留在操作者终端。', '每一步都有停止条件', {
        title: 'PowerShell：迁移前后自动检查',
        language: 'PowerShell',
        code: `$before = psql $env:DATABASE_URL -Atc "select count(*) from orders.orders"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/V42__payment_state.sql
$after = psql $env:DATABASE_URL -Atc "select count(*) from orders.orders"
$nulls = psql $env:DATABASE_URL -Atc "select count(*) from orders.orders where payment_state is null"
$locks = psql $env:DATABASE_URL -Atc "select count(*) from pg_locks where not granted"
$plan = psql $env:DATABASE_URL -c "explain (analyze, buffers) select * from orders.orders where payment_state='PAID' limit 100"
[pscustomobject]@{ Before=$before; After=$after; Nulls=$nulls; WaitingLocks=$locks } | Tee-Object migration-evidence.txt
$plan | Tee-Object -Append migration-evidence.txt`,
        output: `Before After Nulls WaitingLocks
1000000 1000000     0            0

Index Scan using idx_orders_payment_state
Execution Time: 1.842 ms

本次只执行扩展 DDL，行数不变、无空值、无等待锁。
回填和收缩分别作为后续发布执行。`,
      }],
    ],
  },
  {
    name: '认证、授权与审计',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '完成 Spring Security、HTTP、JWT/OIDC、多租户和数据库事务课程。',
    goal: '能区分身份认证、角色授权和对象级授权，校验令牌边界，记录可追溯审计并覆盖越权、撤回和过期会话。',
    guidedPractice: '使用 OIDC 令牌访问受保护接口，检查 issuer、audience、exp 和签名，再把租户归属放到服务端校验；用另一个租户 ID 调用详情接口，记录 403、审计事件和日志脱敏。',
    independentPractice: '实现多租户订单授权，覆盖角色、资源归属、权限撤回、过期令牌和管理员代办，提交授权矩阵、审计查询和 IDOR 回归测试。',
    commonErrors: ['只检查 JWT 是否有效，不检查 issuer、audience、过期和服务端权限撤回。', '只按 URL 角色授权，不校验订单属于当前租户，造成对象级越权。'],
    sourceRefs: [SPRING_SECURITY, 'RFC 7519 JSON Web Token. https://www.rfc-editor.org/rfc/rfc7519', OWASP],
    steps: [
      ['认证回答“是谁”', '认证流程验证凭据并建立主体，OIDC/JWT 要核对签名、issuer、audience、过期和允许算法，再映射到内部用户。令牌中的声明不能自动成为最终权限，服务端仍要处理禁用、撤回和租户状态；验证失败统一返回 401，不透露具体校验细节。', '先建立可信主体', {
        title: 'Spring Security：校验 OIDC JWT 声明',
        language: 'Java',
        code: `@Bean
SecurityFilterChain security(HttpSecurity http, JwtDecoder decoder) throws Exception {
  http.oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt
      .decoder(decoder)
      .jwtAuthenticationConverter(converter())))
    .authorizeHttpRequests(auth -> auth
      .requestMatchers("/actuator/health").permitAll()
      .anyRequest().authenticated());
  return http.build();
}

@Bean
JwtDecoder jwtDecoder() {
  NimbusJwtDecoder decoder = JwtDecoders.fromIssuerLocation(
    "https://ids.example.test/realms/prod");
  OAuth2TokenValidator<Jwt> audience =
    new JwtClaimValidator<List<String>>("aud", aud -> aud.contains("orders-api"));
  decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
    JwtValidators.createDefaultWithIssuer("https://ids.example.test/realms/prod"),
    audience));
  return decoder;
}`,
        output: `valid token: sub=u-42 iss=https://ids.example.test/realms/prod aud=[orders-api]
wrong audience: 401 invalid_token
expired token: 401 invalid_token

签名、issuer、audience 和过期全部校验。
内部用户服务再检查账号禁用与租户状态，不把 JWT 声明当最终权限。`,
      }],
      ['授权回答“能做什么”', '角色适合粗粒度入口，资源归属和状态需要对象级检查，例如 order.tenantId 等于主体租户或主体具有明确代办权限。授权判断应集中在可测试的策略层，避免在多个 Controller 中复制 if；拒绝时统一 403，并避免泄露对象是否存在。', '入口权限与对象权限叠加', {
        title: 'Spring：对象级订单授权策略',
        language: 'Java',
        code: `@Component
class OrderPolicy {
  boolean canView(Actor actor, Order order) {
    return actor.enabled()
      && actor.tenantId().equals(order.tenantId())
      && (actor.hasRole("ORDER_READ") || actor.hasRole("SUPPORT_READ"));
  }

  boolean canCancel(Actor actor, Order order) {
    return canView(actor, order)
      && order.status().canCancel()
      && (actor.id().equals(order.ownerId())
          || actor.hasRole("ORDER_ADMIN"));
  }
}

OrderView get(String id, Actor actor) {
  Order order = repository.findById(id).orElseThrow(OrderNotFound::new);
  if (!policy.canView(actor, order)) throw new AccessDeniedException("ORDER_FORBIDDEN");
  return viewMapper.toView(order);
}`,
        output: `role ORDER_READ + same tenant + CREATED -> view allowed
role ORDER_READ + tenant B + tenant A order -> 403
role SUPPORT_READ + shipped order cancel -> 403

入口角色通过后仍检查租户、状态和所有者。
策略集中测试，Controller 不复制判断。`,
      }],
      ['多租户过滤不得只靠客户端', '所有查询和更新都从可信主体获取租户，不接受请求体任意 tenantId；数据库层可用行级安全或强制查询条件双保险。跨租户管理员操作要有独立权限和更强审计；SQL 日志和缓存键必须包含租户，防止结果串租户。', '租户边界在服务端闭合', {
        title: 'Spring Data：从主体强制租户条件',
        language: 'Java',
        code: `public interface OrderRepository extends Repository<Order, String> {
  Optional<Order> findByIdAndTenantId(String id, String tenantId);
  List<Order> findAllByTenantId(String tenantId, Pageable pageable);
}

@Service
class OrderQuery {
  private final OrderRepository repository;
  private final ActorProvider actors;

  OrderView find(String id) {
    Actor actor = actors.current();
    return repository.findByIdAndTenantId(id, actor.tenantId())
      .map(OrderView::from)
      .orElseThrow(OrderNotFound::new);
  }
}

-- 双保险：PostgreSQL 行级安全
CREATE POLICY tenant_orders ON orders.orders
USING (tenant_id = current_setting('app.tenant_id', true));`,
        output: `GET /orders/O-1 actor.tenant=acme -> query includes tenant_id='acme'
GET /orders/O-1 actor.tenant=globex -> 404 ORDER_NOT_FOUND
request body tenantId=acme ignored

请求体不能指定查询租户。
即使遗漏服务条件，行级安全仍限制到当前 app.tenant_id。`,
      }],
      ['审计记录主体、动作和对象', '审计事件包含 actor、tenant、action、resource、before/after 摘要、requestId、结果和时间，敏感字段脱敏并防篡改。审计写入失败是否阻止业务要明确，关键操作不能只有普通应用日志；审计 ID 还要能关联 trace 和业务流水。', '审计是业务记录，不是调试日志', {
        title: 'SQL：订单取消审计同事务写入',
        language: 'SQL',
        code: `BEGIN;
UPDATE orders.orders
SET status = 'CANCELLED', version = version + 1
WHERE id = 'O-1' AND tenant_id = 'acme' AND status IN ('CREATED','PAID')
RETURNING id, status, version;

INSERT INTO audit.events(
  audit_id, actor_id, tenant_id, action, resource_type, resource_id,
  before_summary, after_summary, request_id, trace_id, result, occurred_at
) VALUES (
  'aud-7f21', 'u-42', 'acme', 'ORDER_CANCEL', 'ORDER', 'O-1',
  '{"status":"PAID"}', '{"status":"CANCELLED"}',
  'req-91', '7f21a', 'SUCCESS', now()
);
COMMIT;`,
        output: `UPDATE 1 returned O-1 CANCELLED version=8
INSERT 0 1 audit aud-7f21
COMMIT

状态变更和审计同事务提交。
actor、tenant、before/after、requestId、traceId 和时间都可查询。`,
      }],
      ['用攻击矩阵验收', '测试匿名、错误受众、过期令牌、角色不足、跨租户 ID、权限撤回和代办越权，验证 401/403 与响应不泄露对象存在性。修复后重放攻击用例，并抽查审计能从请求追到资源；所有拒绝都应产生可关联的安全日志和安全指标。', '越权测试比成功登录更重要', {
        title: 'PowerShell：认证与对象越权矩阵',
        language: 'PowerShell',
        code: `$base = "https://api.example.test"
$tenantAToken = (Get-Content token-acme.json | ConvertFrom-Json).access_token
$tenantBToken = (Get-Content token-globex.json | ConvertFrom-Json).access_token
curl.exe -s -o anonymous.json -w "anonymous=%{http_code}; " "$base/api/orders/O-acme"
curl.exe -s -o wrong-aud.json -w "wrong-aud=%{http_code}; " -H "Authorization: Bearer $env:WRONG_AUD" "$base/api/orders/O-acme"
curl.exe -s -o same-tenant.json -w "same-tenant=%{http_code}; " -H "Authorization: Bearer $tenantAToken" "$base/api/orders/O-acme"
curl.exe -s -o cross-tenant.json -w "cross-tenant=%{http_code}; " -H "Authorization: Bearer $tenantBToken" "$base/api/orders/O-acme"
Get-Content anonymous.json, cross-tenant.json
curl.exe -s "$base/api/audit?resourceId=O-acme" -H "Authorization: Bearer $env:ADMIN_TOKEN"`,
        output: `anonymous=401
wrong-aud=401
same-tenant=200
cross-tenant=404

跨租户响应与不存在一致，没有泄露 O-acme 存在性。
审计返回 ORDER_VIEW SUCCESS actor=u-42 tenant=acme，攻击请求记录 ACCESS_DENIED。`,
      }],
    ],
  },
  {
    name: '幂等、重试与超时预算',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '掌握 HTTP 语义、数据库唯一约束、线程池和分布式调用。',
    goal: '能使用幂等键与唯一约束处理未知结果，按错误类型设置重试和总超时预算，避免多层重试放大流量。',
    guidedPractice: '为创建订单要求 Idempotency-Key，在数据库保存键与响应摘要；同一请求重复发送两次，分别覆盖首次成功、处理中、不同 payload 和超时后查询，记录状态码与唯一约束。',
    independentPractice: '实现支付扣款调用链，包含连接超时、读取超时、超时后查询、指数退避、抖动、熔断和人工补偿，证明重复请求不会重复扣款。',
    commonErrors: ['只在应用内存用 Set 去重，进程重启或多实例后重复请求仍会执行。', '网关、客户端和业务层各自重试三次，最终把一次请求放大成数十次下游调用。'],
    sourceRefs: ['IETF HTTP Semantics, Idempotent Methods. https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2', 'Stripe Idempotent Requests. https://docs.stripe.com/api/idempotent_requests'],
    steps: [
      ['未知结果需要可查询事务 ID', '网络超时只说明调用方没收到结果，不说明服务端没执行。创建业务操作时生成请求 ID 或幂等键，服务端持久化处理状态和最终响应；重试先查询同一键，而不是再次盲目创建；首次请求和后续查询都受同一主体、请求摘要和过期窗口约束。', '超时后先确认状态', {
        title: 'Spring：用 Idempotency-Key 查询处理状态',
        language: 'Java',
        code: `@PostMapping("/orders")
ResponseEntity<?> create(
    @RequestHeader("Idempotency-Key") String key,
    @RequestBody CreateOrder body) {
  Actor actor = actors.current();
  String digest = sha256(canonicalJson(body));
  IdempotencyRecord record = idempotency.begin(key, actor.id(), digest);
  if (record.completed()) {
    return ResponseEntity.status(record.status())
      .header("Idempotent-Replayed", "true")
      .body(record.response());
  }
  if (record.inProgress()) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
      .header("Retry-After", "1")
      .body(Problem.of("REQUEST_IN_PROGRESS", "trace"));
  }
  return executeCreation(record);
}`,
        output: `initial POST key=k-91 trace=7f21 -> 201 order O-9
replay same key and payload -> 201, Idempotent-Replayed: true
same key different payload -> 409 IDEMPOTENCY_KEY_REUSED
in-flight concurrent request -> 409 REQUEST_IN_PROGRESS, Retry-After: 1

客户端超时后用同一 key 再请求，拿到已保存结果而不是再创建订单。`,
      }],
      ['唯一约束是最终防线', '业务主键、幂等键和状态版本放在数据库中，利用唯一索引或条件更新保证并发只有一个成功者。数据库提交后再更新响应缓存；如果响应丢失，重放同一键返回已保存结果；不能把去重状态只存在 Redis 或应用内存。', '并发以数据库约束收敛', {
        title: 'PostgreSQL：唯一索引收敛并发创建',
        language: 'SQL',
        code: `CREATE UNIQUE INDEX uq_idempotency_scope_key
ON idempotency.records(actor_id, idempotency_key);

INSERT INTO idempotency.records(
  id, actor_id, idempotency_key, request_digest, status, expires_at
) VALUES (
  'idem-91', 'u-42', 'k-91', 'sha256:8f1c', 'PROCESSING', now() + interval '24 hours'
)
ON CONFLICT (actor_id, idempotency_key)
DO UPDATE SET last_seen_at = now()
WHERE idempotency.records.request_digest = EXCLUDED.request_digest
RETURNING id, status, response_body;

INSERT INTO orders.orders(id, tenant_id, status, version)
VALUES ('O-9', 'acme', 'CREATED', 0)
ON CONFLICT (id) DO NOTHING;`,
        output: `first insert: idem-91 status=PROCESSING
same digest concurrent insert: ON CONFLICT, status=PROCESSING
different digest: unique key conflict without valid update -> request rejected
orders O-9 inserted 1 row

数据库唯一约束保证只有一个记录进入处理。
响应完成后同一键保存最终 body，重放直接返回。`,
      }],
      ['重试只针对瞬时错误', '连接失败、明确 5xx、限流和事务冲突可评估重试，校验错误、权限和确定性业务拒绝不应重试。每次重试消耗总 deadline，指数退避加随机抖动，并限制最大次数和总时长；超时后的未知结果必须先查询，而不是直接再次扣款。', '先分类再重试', {
        title: 'Java：瞬时错误退避与总 deadline',
        language: 'Java',
        code: `RetryPolicy policy = RetryPolicy.builder()
  .maxAttempts(3)
  .maxElapsed(Duration.ofSeconds(2))
  .backoff(Backoff.exponential(Duration.ofMillis(100), Duration.ofMillis(600), 2.0).jitter(0.5))
  .retryOn(error -> error instanceof ConnectException
    || error instanceof HttpServerErrorException.ServiceUnavailable
    || error instanceof HttpStatus429)
  .onRetry(event -> log.warn("retry attempt={} delay={}ms", event.attempt(), event.delay().toMillis()))
  .build();

Instant deadline = Instant.now().plus(Duration.ofSeconds(3));
PaymentResult result = policy.execute(() ->
  paymentClient.charge(request, Duration.between(Instant.now(), deadline)));`,
        output: `attempt=1 ConnectException delay=73ms
attempt=2 429 delay=411ms
attempt=3 success elapsed=812ms

4xx validation 不重试。
每次请求携带剩余 deadline，超过总预算立即失败并进入查询结果流程。`,
      }],
      ['预算在调用链中向下传递', '入口设定总预算，gateway、服务、HTTP 客户端和数据库分别扣除已消耗时间，剩余预算不足直接失败。熔断器在连续失败时快速拒绝，恢复时用半开探测，避免所有实例同时重试；预算值不能只写在最外层日志。', '所有层共享一个截止时间', {
        title: 'Java：把 deadline 传到下游请求',
        language: 'Java',
        code: `Deadline deadline = Deadline.after(Duration.ofMillis(1200));
RequestContext context = RequestContext.current().withDeadline(deadline);

Mono<Inventory> inventory = inventoryClient.reserve(order, context)
  .timeout(deadline.remaining())
  .onErrorResume(TimeoutException.class,
    error -> Mono.error(new BudgetExceeded("inventory", deadline.elapsed())));

return inventory.flatMap(reserved -> paymentClient.charge(order, context)
    .timeout(deadline.remaining())
    .doOnSubscribe(signal -> log.info("remaining-budget={}ms",
      deadline.remaining().toMillis()))
    .onErrorMap(TimeoutException.class,
      error -> new BudgetExceeded("payment", deadline.elapsed())));`,
        output: `inventory reserved elapsed=280ms remaining=920ms
payment request timeout=690ms
payment completed elapsed=1015ms remaining=185ms

每跳使用同一个 deadline 的剩余时间。
如果 inventory 已消耗 1200ms，payment 在发起前就返回 BUDGET_EXHAUSTED。`,
      }],
      ['用重复与故障矩阵验收', '覆盖首次成功响应丢失、处理中重试、参数摘要不同、数据库唯一冲突和下游超时查询。核对业务记录、审计、下游流水和返回状态，确保没有双重副作用；测试要并发发送同键请求，不能只串行重复两次。', '幂等结论要对账业务结果', {
        title: 'Spring Test：同键并发与响应丢失',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class IdempotencyTest {
  @Autowired TestRestTemplate http;

  @Test
  void concurrentSameKeyCreatesOneOrder() throws Exception {
    String body = "{\\"productId\\":\\"P-1\\",\\"quantity\\":1}";
    int workers = 20;
    ExecutorService pool = Executors.newFixedThreadPool(workers);
    CountDownLatch start = new CountDownLatch(1);
    List<Callable<Integer>> calls = IntStream.range(0, workers).mapToObj(i -> (Callable<Integer>) () -> {
      start.await();
      return http.postForEntity("/orders", new HttpEntity<>(body,
        headers("Idempotency-Key", "k-91")), Problem.class).getStatusCodeValue();
    }).toList();
    List<Future<Integer>> results = calls.stream().map(pool::submit).toList();
    start.countDown();
    List<Integer> statuses = results.stream().map(this::get).toList();
    assertEquals(1, statuses.stream().filter(code -> code == 201).count());
    assertEquals(1, orderRepository.countByIdempotencyKey("k-91"));
    assertEquals(1, paymentLedger.countByRequestId("k-91"));
  }
}`,
        output: `statuses: 201 x1, 409 REQUEST_IN_PROGRESS x19
orders count=1
payment ledger count=1
audit idempotent replay=19

并发同键请求只产生一个订单和一笔支付流水。
响应丢失后重放同一键返回保存结果，副作用仍为一次。`,
      }],
    ],
  },
  {
    name: '缓存、消息与高并发',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成 Redis、Kafka/RabbitMQ、连接池、限流和容量基础课程。',
    goal: '能组合缓存、消息、限流和降级处理高峰流量，定义一致性、积压、容量和失败策略并用压测验证。',
    guidedPractice: '为商品查询加入缓存与单飞加载，为写操作发送消息，再加令牌桶限流和熔断；压测冷启动、热点失效、消息积压和 Redis 不可用，记录命中率、P99、队列和错误。',
    independentPractice: '为秒杀查询与下单链路设计高峰保护，分别给出读缓存、异步削峰、库存预占、排队、拒绝和降级策略，提交容量与公平性实验。',
    commonErrors: ['缓存、消息和重试各自都配置了失败回退，组合后产生级联放大。', '只在上层限流，异步消费者和下游数据库没有独立并发保护。'],
    sourceRefs: [REDIS, KAFKA, SRE],
    steps: [
      ['先定事实源与一致性窗口', '缓存和消息都是副本与异步通道，数据库或事件日志的事实源要明确。读缓存允许的陈旧时间、写后读要求和消息延迟上限写进契约，失败时才能选择回源、拒绝或最终一致；每个异步阶段要有业务版本和可查询状态。', '每个副本都有陈旧边界', {
        title: 'Java：把缓存与消息陈旧度写成契约',
        language: 'Java',
        code: `record DataContract(
  String sourceOfTruth,
  Duration maxReadStaleness,
  Duration writeAfterReadPin,
  Duration maxMessageDelay,
  String fallback) {}

DataContract productRead = new DataContract(
  "postgres.products",
  Duration.ofSeconds(30),
  Duration.ofSeconds(3),
  Duration.ofSeconds(60),
  "serve-stale-with-warning"
);

DataContract orderWrite = new DataContract(
  "postgres.orders + outbox",
  Duration.ZERO,
  Duration.ofSeconds(10),
  Duration.ofSeconds(5),
  "reject-if-outbox-not-durable"
);

assertThat(productRead.maxReadStaleness()).isLessThan(Duration.ofMinutes(1));
assertThat(orderWrite.maxReadStaleness()).isZero();`,
        output: `product read: source=postgres, stale<=30s, fallback=serve-stale
order write: source=orders+outbox, read-your-write=10s
message delay: product<=60s, order<=5s

契约明确每个副本允许的陈旧和失败动作。
缓存或消息故障时不再临时猜应该回源、拒绝还是降级。`,
      }],
      ['缓存保护读路径', 'TTL、容量淘汰、单飞重建和空值缓存共同防击穿与穿透，热点键拆分或本地短缓存降低单节点压力。失效事件要可重复执行，缓存失败时根据业务重要性回源或返回降级内容；单飞锁必须有超时，等待者也要有失败出口。', '热点重建由少数请求执行', {
        title: 'Java：本地单飞加 Redis 缓存',
        language: 'Java',
        code: `LoadingCache<String, ProductView> products = Caffeine.newBuilder()
  .maximumSize(20_000)
  .expireAfterWrite(Duration.ofSeconds(5))
  .build(this::loadProduct);

ProductView getProduct(String id) {
  String redisKey = "product:" + id;
  String remote = safeRedisGet(redisKey);
  if (remote != null) {
    return "NULL".equals(remote) ? null : json.read(remote, ProductView.class);
  }
  return products.get(id);
}

ProductView loadProduct(String id) {
  ProductView value = repository.find(id).orElse(null);
  safeRedisSet("product:" + id, value == null ? "NULL" : json.write(value),
    value == null ? Duration.ofSeconds(30) : Duration.ofMinutes(10));
  return value;
}`,
        output: `100 concurrent misses product:P-1
Caffeine loader invoked=1
database select=1
Redis cache set ttl=10m

同一实例内只发起一次回源，本地缓存再承接 5 秒热点读。
Redis 故障时 safe 方法返回 miss，仍由受限数据库回源处理。`,
      }],
      ['消息保护写路径与削峰', '生产端使用有界队列、发布确认和幂等键，消费端控制单批工作量、并发和重试。积压超过阈值时暂停低优先级流量或扩容消费者，但不能超过下游容量；队列溢出要显式拒绝或降级，不能静默丢业务事件。', '队列有界，消费有账', {
        title: 'Kafka + Java：有界发送队列与消费闸门',
        language: 'Java',
        code: `BlockingQueue<OrderEvent> queue = new ArrayBlockingQueue<>(10_000);
ExecutorService sender = Executors.newSingleThreadExecutor();
Semaphore consumerGate = new Semaphore(32);

boolean submit(OrderEvent event) {
  if (!queue.offer(event)) {
    meter.counter("events.rejected", event.priority().name()).increment();
    return false;
  }
  return true;
}

void drain() {
  while (running) {
    OrderEvent event = queue.take();
    producer.send(new ProducerRecord<>("order-events", event.orderId(), event),
      (metadata, error) -> {
        if (error != null) retryStore.save(event, error);
      });
  }
}

void consume(OrderEvent event) throws InterruptedException {
  consumerGate.acquire();
  try { orderService.applyIdempotently(event); }
  finally { consumerGate.release(); }
}`,
        output: `queue capacity=10000 depth=9820
events.rejected{priority="LOW"} 180
consumer in-flight=32 target=32
Kafka produced=9400, retry-store=420

高优先级写满队列时拒绝低优先级并记录。
消费者并发不超过 32，下游数据库连接池预算仍有余量。`,
      }],
      ['限流与降级按业务分桶', '令牌桶限制总速率，并发闸门保护下游，按租户、接口和优先级分配配额。降级返回缓存、静态内容或明确错误，关键支付与普通浏览不能使用同一策略；拒绝响应要包含 Retry-After 和稳定业务 code。', '公平性也是容量设计', {
        title: 'Bucket4j：按租户分桶限流',
        language: 'Java',
        code: `Map<String, Bucket> buckets = new ConcurrentHashMap<>();

Bucket bucket(String tenant) {
  return buckets.computeIfAbsent(tenant, key -> Bucket.builder()
    .addLimit(limit -> limit.capacity(200)
      .refillGreedy(100, Duration.ofSeconds(1)))
    .build());
  }

boolean allow(String tenant, String route) {
  boolean allowed = bucket(tenant).tryConsume(1);
  meter.counter("api.rate", allowed ? "allowed" : "rejected",
    "tenant", tenant, "route", route).increment();
  return allowed;
}

if (!allow(tenant, "order-query")) {
  response.setStatus(429);
  response.setHeader("Retry-After", "1");
  response.getWriter().write("{\\"code\\":\\"TENANT_RATE_LIMITED\\"}");
}`,
        output: `tenant=acme route=order-query allowed=200
tenant=acme request 201 -> 429 TENANT_RATE_LIMITED Retry-After: 1
tenant=globex route=order-query allowed=200

一个租户耗尽自己的令牌桶，不影响其他租户。
支付路由使用独立桶和更小并发闸门。`,
      }],
      ['用联合故障验证系统边界', '同时注入 Redis 冷启动、消息延迟、数据库变慢和实例扩容，观察缓存回源、队列、连接池和错误预算。只有在关键业务仍满足最低服务级别时才算通过，压测不能只测单组件；实验要保存每个故障开始与恢复时间。', '联合故障暴露真实级联', {
        title: 'k6：高并发读写下联合故障',
        language: 'JavaScript',
        code: `import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    browse: { executor: 'ramping-arrival-rate', startRate: 50, timeUnit: '1s',
      stages: [{ target: 500, duration: '2m' }, { target: 500, duration: '5m' }],
      preAllocatedVUs: 200 },
    checkout: { executor: 'constant-rate', rate: 20, timeUnit: '1s',
      duration: '7m', preAllocatedVUs: 30, exec: 'checkout' },
  },
  thresholds: {
    'http_req_failed{flow:checkout}': ['rate<0.01'],
    'http_req_duration{flow:checkout}': ['p(99)<1500'],
  },
};

export default function () { http.get(__ENV.CATALOG_URL); sleep(0.2); }
export function checkout() {
  http.post(__ENV.CHECKOUT_URL, JSON.stringify({ sku: 'SKU-1', qty: 1 }),
    { headers: { 'Content-Type': 'application/json' } });
}`,
        output: `browse rate=500/s, cache cold start p99=2.4s
checkout rate=20/s, p99=1.12s, errors=0.4%
Redis errors=1800, fallback served=1762
Kafka lag peak=2400, recovered in 35s
db pool waiting peak=18, no timeout

Redis 冷启动和消息延迟同时发生时，浏览进入降级，结账仍低于错误预算。
恢复时间与关键业务 SLO 一起通过。`,
      }],
    ],
  },
  {
    name: 'Docker 镜像与配置',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Maven/Gradle、JVM 启动、Linux 用户、环境变量和容器基础。',
    goal: '能构建多阶段、最小、非 root、可观测的 Java 镜像，配置容器感知 JVM、健康检查和外部配置。',
    guidedPractice: '编写多阶段 Dockerfile，第一阶段用 JDK 构建 jar，第二阶段复制到受支持的 JRE 镜像，创建非 root 用户并以 exec 形式启动；检查镜像层、用户、启动参数和干净环境运行。',
    independentPractice: '为一个 Spring Boot 服务构建生产镜像，包含依赖缓存、可重复构建、镜像扫描、配置注入、健康检查和优雅停机，提交镜像大小、启动时间与漏洞报告。',
    commonErrors: ['直接把构建工具、源码、测试密钥和 root 用户带入运行镜像。', '把配置和秘密写进镜像层，后续无法安全轮换或区分环境。'],
    sourceRefs: [DOCKER, 'OpenJDK container awareness and JVM ergonomics. https://docs.oracle.com/en/java/javase/21/gctuning/ergonomics.html'],
    steps: [
      ['多阶段分离构建与运行', '构建阶段安装 JDK、下载依赖并执行测试与打包，运行阶段只复制确定的 jar、证书和启动脚本。复制依赖层可复用缓存，但最终镜像不包含源码、Maven 仓库和构建凭据；运行镜像的基础系统要固定并可持续打补丁。', '运行镜像只保留运行所需', {
        title: 'Dockerfile：多阶段构建 Java 服务',
        language: 'Dockerfile',
        code: `FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q verify package -DskipTests=false

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/target/orders.jar /app/orders.jar
COPY certs/ca.pem /app/certs/ca.pem
ENTRYPOINT ["java","-jar","/app/orders.jar"]`,
        output: `docker build -t orders:local .
[build] mvn verify BUILD SUCCESS
[stage-1 2/4] COPY orders.jar /app/orders.jar
[stage-1 4/4] ENTRYPOINT ["java","-jar","/app/orders.jar"]

最终镜像只有 JRE、jar 和证书，不包含 Maven、源码与测试凭据。
依赖下载在构建阶段缓存，运行层保持精简。`,
      }],
      ['非 root 与最小权限', '创建固定 UID/GID 的非 root 用户，设置工作目录和文件权限，入口使用 exec 形式接收信号。文件系统尽量只读，写临时目录使用受控卷；容器内工具越少，攻击面越小，权限和目录归属要通过运行检查证明。', '身份与文件权限先收紧', {
        title: 'Dockerfile：固定 UID 非 root 运行',
        language: 'Dockerfile',
        code: `FROM eclipse-temurin:21-jre
RUN groupadd --gid 10001 app \\
 && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \\
 && mkdir -p /app /tmp/orders \\
 && chown -R 10001:10001 /app /tmp/orders
WORKDIR /app
COPY --chown=10001:10001 orders.jar /app/orders.jar
USER 10001:10001
ENV TMPDIR=/tmp/orders
ENTRYPOINT ["java","-jar","/app/orders.jar"]`,
        output: `docker run --rm orders:local id
uid=10001(app) gid=10001(app) groups=10001(app)

docker inspect orders:local --format "{{.Config.User}}"
10001:10001

进程不是 root，应用只拥有 /app 和 /tmp/orders。
Kubernetes 可进一步设置 readOnlyRootFilesystem 和 drop capabilities。`,
      }],
      ['配置从环境或配置中心注入', '环境变量、挂载文件或 Secret 注入配置，镜像不固化数据库密码和 API Key。启动命令显式设置堆、GC、时区和健康端口，容器内 CPU/内存限制会影响 JVM 默认 ergonomics；配置值要有启动校验和脱敏日志。', '镜像可复用，配置按环境注入', {
        title: 'Docker run：容器感知 JVM 与外部配置',
        language: 'PowerShell',
        code: `docker run --rm --memory 1g --cpus 2 -p 8080:8080 -e SPRING_PROFILES_ACTIVE=prod -e SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/orders -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseG1GC -XX:ActiveProcessorCount=2" -e TZ=Asia/Shanghai --mount type=bind,src=$env:CONFIG_DIR,dst=/run/config,readonly orders:local`,
        output: `Picked up JAVA_TOOL_OPTIONS: -XX:MaxRAMPercentage=70 -XX:+UseG1GC -XX:ActiveProcessorCount=2
The JVM has detected the container memory limit: 1073741824 bytes
Tomcat started on port 8080
profile=prod database=jdbc:postgresql://db:5432/orders

配置和证书从外部挂载，镜像不变。
堆按 1 GiB 容器限制计算，仍给元空间、直接内存和线程栈留余量。`,
      }],
      ['启动与信号行为可测试', 'docker run --rm、只读文件和受限内存下启动镜像，检查健康端点、非 root 用户和日志到 stdout。发送 SIGTERM 后服务应停止接流量、完成有界任务并退出，不能依赖强杀；停止时间要短于编排平台宽限期。', 'SIGTERM 后要优雅退出', {
        title: 'PowerShell：只读容器与 SIGTERM 测试',
        language: 'PowerShell',
        code: `$name = "orders-signal-test"
$dockerArgs = @(
  "run", "-d", "--name", $name, "--memory", "768m", "--read-only",
  "--tmpfs", "/tmp/orders:rw,size=64m",
  "-e", "SERVER_SHUTDOWN=graceful", "orders:local"
)
docker @dockerArgs
Start-Sleep -Seconds 8
docker exec $name id
curl.exe -s http://127.0.0.1:8080/actuator/health
docker stop --time 20 $name
docker inspect $name --format "ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}"
docker logs $name | Select-Object -Last 20`,
        output: `uid=10001(app) gid=10001(app)
{"status":"UP"}
Graceful shutdown initiated
Waiting for active requests to finish: 3 -> 0
Application shutdown complete
ExitCode=0 OOMKilled=false

只读根文件系统下服务正常启动，临时目录可写。
SIGTERM 在宽限期内完成有界退出，没有 OOM 或强杀。`,
      }],
      ['制品证据一起发布', '保存 Dockerfile 提交、镜像 digest、SBOM、漏洞扫描、启动命令和回滚 digest，镜像标签不承担唯一身份。上线前在干净环境拉取同一 digest 验证，避免本地缓存掩盖依赖缺失；发布记录要能证明测试镜像就是生产镜像。', '发布单位是不可变 digest', {
        title: 'Docker CLI：构建、扫描并记录 digest',
        language: 'PowerShell',
        code: `docker build --pull -t registry.example/orders:$env:GIT_SHA .
$digest = docker image inspect registry.example/orders:$env:GIT_SHA --format "{{index .RepoDigests 0}}"
docker push registry.example/orders:$env:GIT_SHA
syft registry.example/orders:$env:GIT_SHA -o spdx-json > orders-sbom.json
trivy image --severity HIGH,CRITICAL --exit-code 1 registry.example/orders:$env:GIT_SHA
docker pull $digest
docker run --rm $digest java -version
"$digest" | Tee-Object release-digest.txt
Get-FileHash orders-sbom.json -Algorithm SHA256`,
        output: `digest=registry.example/orders@sha256:4b91...
SBOM packages=187
Trivy HIGH=0 CRITICAL=0
openjdk version "21.0.5"

release-digest.txt 指向不可变镜像，SBOM 哈希进入发布记录。
回滚使用上一 digest，不需要重新构建。`,
      }],
    ],
  },
  {
    name: 'Kubernetes 发布与探针',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '掌握 Docker、HTTP 健康检查、Spring Boot 优雅停机和 Kubernetes 基础资源。',
    goal: '能配置 Deployment、Service、startup/readiness/liveness 探针、资源、PDB 和优雅停机，完成灰度、观察与回滚。',
    guidedPractice: '部署两个副本的应用，配置 startupProbe、readinessProbe、livenessProbe、terminationGracePeriodSeconds 和 preStop；执行 kubectl rollout status，修改镜像触发滚动发布，再执行 rollout undo。',
    independentPractice: '为 Java 服务设计一次发布，覆盖就绪失败、存活失败、资源不足、PDB 和旧实例退出，提交 Pod 事件、端点变化、错误率和回滚证据。',
    commonErrors: ['所有探针共用同一个 /health，依赖数据库失败时让所有 Pod 被重启。', '没有设置 requests/limits 或优雅停机时间，滚动发布时旧请求被强制中断。'],
    sourceRefs: [K8S, 'Spring Boot Kubernetes Probes. https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.kubernetes-probes'],
    steps: [
      ['Deployment 管副本与滚动策略', 'Deployment 维护 ReplicaSet，滚动策略通过 maxSurge 和 maxUnavailable 控制新旧副本切换。新 Pod 必须变为 Ready 才进入 Service Endpoints，readiness 失败不应触发重启但会停止接流量；终止中的 Pod 仍可能短暂在 Endpoints 中，需要配合 preStop。', '就绪决定流量，存活决定重启', {
        title: 'Kubernetes：设置滚动发布策略',
        language: 'YAML',
        code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 0
  selector:
    matchLabels: { app: orders }
  template:
    metadata:
      labels: { app: orders }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: app
          image: registry.example/orders@sha256:4b91`,
        output: `kubectl rollout status deployment/orders
Waiting for deployment "orders" rollout to finish:
2 out of 6 new replicas have been updated...
6 out of 6 new replicas are available...

maxUnavailable=0 保证旧容量不先减少，maxSurge=2 允许先增加新 Pod。
新 Pod Ready 后才接收 Service 流量。`,
      }],
      ['三种探针职责不同', 'startupProbe 给慢启动应用窗口，readinessProbe 判断能否处理请求，livenessProbe 判断进程是否需要重启。依赖型健康只在 readiness 中受限表达，liveness 只检查本进程可恢复状态，避免数据库故障引发重启风暴；探针 timeout 和 failureThreshold 要有时间预算。', '依赖故障不应重启所有进程', {
        title: 'Spring Boot：启动、就绪与存活探针',
        language: 'YAML',
        code: `startupProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  periodSeconds: 5
  failureThreshold: 24
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 5
  timeoutSeconds: 2
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3`,
        output: `startup: process became live after 38s
readiness: DB unavailable -> 503, Pod remains Running but removed from Endpoints
liveness: process responsive -> 200, no restart
events: Readiness probe failed, Liveness probe succeeded

数据库故障只摘流，不重启全部应用。
进程卡死或事件循环无响应时才触发 liveness 重启。`,
      }],
      ['资源和调度影响可用性', 'requests 决定调度与 CPU 权重，limits 影响 CFS 限流和内存 OOM。Java 堆要小于容器内存并给元空间、线程栈、直接内存和 OS 留余量；水平扩展前确认数据库和代理容量，CPU limit 过低会让 GC 和请求线程被限流。', '堆内存不是容器全部内存', {
        title: 'Kubernetes：JVM 内存与资源限制',
        language: 'YAML',
        code: `resources:
  requests:
    cpu: "500m"
    memory: "768Mi"
  limits:
    cpu: "2"
    memory: "1536Mi"
env:
  - name: JAVA_TOOL_OPTIONS
    value: >-
      -XX:MaxRAMPercentage=60
      -XX:InitialRAMPercentage=30
      -XX:+UseG1GC
      -XX:ActiveProcessorCount=2
  - name: JAVA_OPTS_EXTRA
    value: "-Djava.security.egd=file:/dev/urandom"`,
        output: `container memory limit=1536Mi
JVM max heap=921Mi (60%)
non-heap budget=615Mi for metaspace, direct memory, stacks and OS
cpu request=500m, limit=2, ActiveProcessorCount=2

堆不是 1536Mi 全部。压测中 GC 暂停和 CPU throttling 同时进入容量报告。`,
      }],
      ['停机要先摘流再退出', 'Pod 终止时进入 terminating，Endpoints 逐步移除，preStop 和 terminationGracePeriodSeconds 给优雅关闭窗口。Spring Boot 应停止接收新流量并等待有界请求，JVM 进程收到 SIGTERM 后完成清理；停机总时长必须小于宽限期并留出负载均衡传播延迟。', '摘流和关闭要有时间顺序', {
        title: 'Kubernetes：preStop 与优雅停机',
        language: 'YAML',
        code: `lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 8"]
terminationGracePeriodSeconds: 40
env:
  - name: SERVER_SHUTDOWN
    value: graceful
  - name: SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE
    value: 15s
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 3`,
        output: `Pod terminating at t=0
preStop sleep until t=8, endpoint propagation completes
SIGTERM at t=8, readiness DOWN
active requests 14 -> 0 at t=21
process exit t=22, within grace 40s

先等待摘流，再停止接新请求并排空旧请求。
总关闭时间 22 秒，低于 40 秒宽限期。`,
      }],
      ['发布观察点驱动回滚', '用 kubectl rollout status、get pods、describe events 和 logs 检查版本、就绪、重启和资源，结合业务错误率、P99 与 trace。超过阈值立即 kubectl rollout undo 并保留事件和指标时间线；回滚也要继续观察旧版本能否恢复容量。', '回滚条件提前写成阈值', {
        title: 'PowerShell：灰度发布观察与回滚',
        language: 'PowerShell',
        code: `kubectl apply -f k8s/orders.yaml
kubectl rollout status deployment/orders --timeout=180s
kubectl get pods -l app=orders -o wide
kubectl describe deployment orders | Select-String "Image|Events" -Context 0,4
$errorRate = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_http_error_ratio").data.result[0].value[1]
$p99 = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_http_p99").data.result[0].value[1]
[pscustomobject]@{ ErrorRate=$errorRate; P99=$p99; Threshold=0.01 } | Format-Table
if ([double]$errorRate -gt 0.01) {
  kubectl rollout undo deployment/orders
  kubectl rollout status deployment/orders --timeout=180s
}`,
        output: `deployment "orders" successfully rolled out
orders-7d9f 1/1 Running image=sha256:4b91
orders-5c2a 1/1 Running image=sha256:3e70

ErrorRate P99 Threshold
0.023     1.84      0.01
deployment "orders" rolled back
deployment "orders" successfully rolled out

错误率超过 1% 立即回滚，旧版本恢复后错误率回到 0.2%。`,
      }],
    ],
  },
  {
    name: 'CI/CD、可观测性与事故复盘',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成测试、容器、Kubernetes、OpenTelemetry、SRE 和发布课程。',
    goal: '能把测试、扫描、制品、发布、指标告警和回滚连成闭环，用固定产物运行一次失败发布与无责复盘。',
    guidedPractice: '建立一条流水线：编译测试、依赖与镜像扫描、生成 SBOM、推送 digest、部署到测试环境、运行冒烟和发布金丝雀；注入一个失败版本，观察告警、停止和回滚。',
    independentPractice: '为一个 Java 服务完成发布运行手册，包含门禁、制品、环境、审批、指标、回滚命令、事故角色和复盘模板，并演练一次。',
    commonErrors: ['在生产机重新构建代码，导致测试过的源码和实际制品不是同一个二进制。', '告警只配置 CPU，不配置用户错误率、延迟和依赖可用性，事故发生后无人知道影响。'],
    sourceRefs: [OTEL, SRE, DOCKER],
    steps: [
      ['流水线只晋升固定制品', '构建阶段生成镜像 digest 和 SBOM，测试环境与生产使用同一 digest，环境差异只来自配置和 Secret。任何代码变化都产生新制品并重新过门禁，不能在上线时临时执行未测脚本；部署清单应记录 digest 而不是浮动 tag。', '同一制品从测试走到生产', {
        title: 'GitHub Actions：构建并晋升同一 digest',
        language: 'YAML',
        code: `jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digest: \${{ steps.push.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "21", cache: maven }
      - run: ./mvnw -B verify
      - uses: docker/login-action@v3
        with:
          registry: registry.example
          username: \${{ secrets.REGISTRY_USER }}
          password: \${{ secrets.REGISTRY_TOKEN }}
      - id: push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: registry.example/orders:\${{ github.sha }}
      - run: echo "\${{ steps.push.outputs.digest }}" > image-digest.txt
  deploy-test:
    needs: build
    uses: ./.github/workflows/deploy.yml
    with:
      image: registry.example/orders@\${{ needs.build.outputs.digest }}`,
        output: `build: mvn verify BUILD SUCCESS
push digest=sha256:4b91...
deploy-test image=registry.example/orders@sha256:4b91...
deploy-prod 复用同一个 digest

测试与生产没有重新构建。
环境差异只来自配置、Secret 和副本数。`,
      }],
      ['门禁覆盖正确性和供应链', '单元、集成、契约、端到端按风险分层执行，依赖与镜像扫描、秘密扫描、许可证和签名进入门禁。失败要阻止发布或明确豁免人、原因和过期时间，不以人工点“继续”代替修复；门禁日志和制品哈希要保留。', '门禁结果必须可追溯', {
        title: 'CI 门禁：测试、扫描、SBOM 与签名',
        language: 'YAML',
        code: `- run: ./mvnw -B verify
- run: ./mvnw -B contract:verify
- run: pnpm exec playwright test --grep "@smoke"
- run: trivy fs --scanners vuln,secret,misconfig --exit-code 1 .
- run: syft registry.example/orders@\${{ needs.build.outputs.digest }} -o spdx-json > sbom.spdx.json
- run: grype sbom:sbom.spdx.json --fail-on high
- run: cosign attest --predicate sbom.spdx.json --type spdxjson registry.example/orders@\${{ needs.build.outputs.digest }}
- run: cosign verify registry.example/orders@\${{ needs.build.outputs.digest }}
- uses: actions/upload-artifact@v4
  with: { name: release-evidence, path: |
      sbom.spdx.json
      test-results/
      trivy.txt }`,
        output: `unit/integration/contract: passed
smoke: 42 passed
trivy: HIGH=0 CRITICAL=0 secrets=0
grype: high vulnerabilities=0
cosign: verified registry.example/orders@sha256:4b91...
artifact release-evidence uploaded

门禁结果与 digest、SBOM 和签名一起归档。
任意高危漏洞或契约破坏都会阻止晋升。`,
      }],
      ['发布采用渐进和可观测策略', '先灰度或金丝雀，观察错误率、P99、饱和度、依赖健康、日志和业务转化，再扩大流量。每个阶段有继续、暂停、回滚阈值，schema 迁移与代码发布保持兼容；扩大流量前后都要比较同一时间窗口。', '每扩大一次流量重新判断', {
        title: 'Argo Rollouts：金丝雀阶段门禁',
        language: 'YAML',
        code: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: orders
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - analysis:
            templates: [{ templateName: orders-success }]
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
      analysis:
        templates: [{ templateName: orders-success }]
        startingStep: 0
---
kind: AnalysisTemplate
metadata: { name: orders-success }
spec:
  metrics:
    - name: error-rate
      interval: 30s
      successCondition: result[0] < 0.01
      failureLimit: 2
      provider:
        prometheus:
          address: http://prometheus:9090
          query: sum(rate(orders_http_errors_total[2m])) / sum(rate(orders_http_requests_total[2m]))`,
        output: `setWeight=5 analysis error-rate=0.002 PASS
setWeight=25 error-rate=0.004 PASS
setWeight=50 error-rate=0.003 P99=940ms PASS
setWeight=100 stable

每组金丝雀流量观察 5-10 分钟。
错误率超过 1% 两次分析失败后自动中止并回滚。`,
      }],
      ['告警绑定 SLO 与行动', '以用户可感知的成功率、延迟和关键业务事件定义 SLO，告警包含影响范围、最近变更和运行手册链接。值班人能查询 trace、日志和仪表盘，并执行预定义止损，而不是从零开始探索；告警标签不能泄漏高基数用户标识。', '告警必须有下一步动作', {
        title: 'Prometheus：SLO 多窗口燃烧率告警',
        language: 'YAML',
        code: `groups:
  - name: orders-slo
    rules:
      - record: orders:error_ratio:5m
        expr: |
          sum(rate(orders_http_errors_total{job="orders"}[5m]))
          / sum(rate(orders_http_requests_total{job="orders"}[5m]))
      - alert: OrdersErrorBudgetFastBurn
        expr: orders:error_ratio:5m > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
          runbook: orders-high-error
        annotations:
          summary: "Orders error budget burning fast"
          dashboard: "https://grafana.example/d/orders"
          action: "Check recent rollout, payment dependency and rollback if error > 2%"
      - alert: OrdersP99High
        expr: histogram_quantile(0.99, sum(rate(orders_http_duration_seconds_bucket[5m])) by (le)) > 1
        for: 10m
        labels: { severity: ticket, runbook: orders-latency }`,
        output: `OrdersErrorBudgetFastBurn firing
current error ratio=0.023, threshold=0.0144, 5m window
runbook=orders-high-error
recent rollout=orders sha256:4b91

告警直接说明错误率、窗口、最近发布和回滚动作。
值班人从 trace 找到支付依赖超时后执行暂停金丝雀和回滚。`,
      }],
      ['复盘改进可验证', '时间线包含发现、响应、变更、恢复和验证，区分触发因素与深层条件，避免只归责个人。改进项有负责人、截止时间和验证方式，下一次演练检查是否真的降低同类故障影响；无责不等于无技术结论。', '复盘以系统改进收口', {
        title: 'PowerShell：事故时间线与改进验证',
        language: 'PowerShell',
        code: `$events = @(
  [pscustomobject]@{ time="10:02:10"; event="canary error-rate=2.3%" },
  [pscustomobject]@{ time="10:02:25"; event="alert fast-burn fired" },
  [pscustomobject]@{ time="10:04:00"; event="golden signals show payment timeout" },
  [pscustomobject]@{ time="10:05:12"; event="rollout abort + rollback" },
  [pscustomobject]@{ time="10:07:40"; event="error-rate back to 0.2%" },
  [pscustomobject]@{ time="10:15:00"; event="Kafka lag 0, payment ledger reconciled" }
)
$events | Format-Table -AutoSize
kubectl rollout history deployment/orders
curl.exe -s http://prometheus:9090/api/v1/query?query=orders_http_error_ratio
psql $env:DATABASE_URL -c "select count(*) from reconciliation.gaps where day=current_date"`,
        output: `10:02:10 canary error-rate=2.3%
10:02:25 alert fast-burn fired
10:05:12 rollout abort + rollback
10:07:40 error-rate back to 0.2%
10:15:00 Kafka lag 0, ledger reconciled
reconciliation gaps=0

改进项：
- 支付客户端增加连接池等待告警，负责人=payments，验证日期=12-05
- 金丝雀分析增加 dependency timeout 指标，负责人=sre，验证日期=12-02`,
      }],
    ],
  },
];

const J11_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Brownfield 项目接管',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成 Java 全套核心、Spring、中间件、交付和源码课程。',
    goal: '能在陌生项目中复原入口、依赖、数据、运行拓扑和风险，以最小变更交付真实功能并保留回归证据。',
    guidedPractice: '从 README、构建文件、SpringApplication、启动脚本和部署清单追踪系统入口，运行一次本地启动和关键接口，记录环境变量、外部依赖、数据库迁移和当前失败项。',
    independentPractice: '接管一个缺少完整文档的订单服务，完成架构图、依赖图、运行图、风险清单和一个小型功能；提交变更前测试、发布步骤和回滚方案。',
    commonErrors: ['先大改目录和框架，再花数周修复无法运行的环境，丢失原有行为基线。', '只读代码不验证外部依赖和数据状态，把配置缺失误判为源码缺陷。'],
    sourceRefs: [SPRING_BOOT, SRE],
    steps: [
      ['入口和运行契约先被复现', '从 main、SpringApplication.run、Dockerfile、Compose 或 Kubernetes 清单追踪真实启动命令，记录 JDK、profiles、端口、环境变量、数据库迁移和外部服务。IDE 能运行不代表生产命令能运行；接手时先复现部署入口，而不是先改代码结构。', '启动命令要来自部署入口', {
        title: 'PowerShell：复现陌生服务的真实启动',
        language: 'PowerShell',
        code: `git clone $env:REPO_URL legacy-orders
Set-Location legacy-orders
git log --oneline -10
java -version
docker compose config
docker compose up -d postgres redis kafka
$env:SPRING_PROFILES_ACTIVE = "local"
java -jar target/orders.jar --server.port=18080 --debug
curl.exe -s -i http://127.0.0.1:18080/actuator/health`,
        output: `openjdk version "17.0.12"
docker compose config: services=postgres,redis,kafka,orders
Tomcat started on port 18080
profile=local migrations=47
HTTP/1.1 200 OK
{"status":"UP"}

部署入口、JDK、依赖和健康端点都已复现。
README 的旧启动命令与实际 Compose 配置不一致，记录为风险。`,
      }],
      ['依赖图要包含运行副作用', '除 Maven/Gradle 依赖，还画数据库、Redis、Kafka、HTTP 下游、文件系统和定时任务。标注同步/异步、超时、重试、所有者与失败模式，才知道一个改动会碰到哪些系统；依赖图要能从代码、配置和网络连接交叉验证。', '依赖不是只有 jar', {
        title: 'PowerShell：生成运行依赖与连接清单',
        language: 'PowerShell',
        code: `./mvnw -q dependency:tree -DoutputFile=dependencies.txt
docker compose ps
Get-Content src/main/resources/application.yml | Select-String "url:|bootstrap-servers|host:"
Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Select-Object ProcessId, CommandLine
netstat -ano | Select-String "LISTENING" |
  Select-String ":5432|:6379|:9092|:8080"
Get-ScheduledTask | Where-Object TaskName -like "orders-*"`,
        output: `maven dependencies: spring-web, jdbc, kafka, redis
runtime: postgres:5432, redis:6379, kafka:9092
scheduled: InventoryReconciler every 10m
http downstream: payment.example:443
file: /var/orders/export

依赖不只来自 jar，还来自连接配置、定时任务和共享文件。
每个节点标上同步/异步、timeout=3s、retry=2、owner=team。`,
      }],
      ['数据和发布历史决定风险', '检查 schema、迁移版本、索引、消息 Topic、配置中心和最近发布记录，识别不可逆改动与兼容窗口。对关键表抽样对账，确认开发数据不会掩盖生产约束；备份、容量和权限也要进入风险清单。', '先识别不可逆边界', {
        title: 'SQL：接手时核对迁移与数据风险',
        language: 'SQL',
        code: `SELECT installed_rank, version, description, success, installed_on
FROM flyway_schema_history
ORDER BY installed_rank DESC LIMIT 10;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname IN ('orders','billing')
ORDER BY tablename, indexname;

SELECT status, count(*) FROM orders.orders GROUP BY status;
SELECT count(*) AS duplicate_events
FROM (SELECT event_id FROM orders.outbox GROUP BY event_id HAVING count(*) > 1) d;

SELECT pid, state, wait_event_type, wait_event, left(query, 100)
FROM pg_stat_activity WHERE datname='orders' AND state <> 'idle';`,
        output: `V47 add payment_state success=true
V46 unique idempotency key success=true
orders status: PAID 42103, CREATED 188, CANCELLED 906
duplicate_events=0
active waits=0

最近迁移已包含支付字段和唯一索引。
无重复事件、无长等待，但 V48 计划删除旧列，必须先确认旧应用实例为 0。`,
      }],
      ['最小功能走完整生命周期', '选择一个有明确验收且影响可控的功能，先写行为测试，再做小补丁，经过构建、部署、监控和回滚。变更范围越小，越能把陌生系统的不确定性转成可观察证据；不要顺手重构目录或框架。', '小变更也要完整交付', {
        title: 'Java：先写行为测试再做小补丁',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class OrderStatusTest {
  @Autowired TestRestTemplate http;

  @Test
  void cancelledOrderRejectsSecondCancel() {
    String id = createPaidOrder();
    var first = http.postForEntity("/orders/" + id + "/cancel", null, Void.class);
    var second = http.postForEntity("/orders/" + id + "/cancel", null, Problem.class);
    assertEquals(HttpStatus.NO_CONTENT, first.getStatusCode());
    assertEquals(HttpStatus.CONFLICT, second.getStatusCode());
    assertEquals("ORDER_ALREADY_CANCELLED",
      second.getBody().getProperties().get("code"));
  }
}`,
        output: `test failed before patch: second cancel returned 204
after guard and conditional update: second cancel returned 409
orders version increases only once

最小补丁只改取消状态迁移和错误映射。
测试覆盖首次成功、第二次冲突、审计一条记录。`,
      }],
      ['留下可接续的工程地图', '交付 README、架构与依赖图、运行手册、已知风险、验证命令和负责人清单。新成员按文档在干净环境启动并修复一个问题，才能证明材料可操作；文档中的每个命令要有最近验证日期和预期结果。', '让下一位工程师能接手', {
        title: 'PowerShell：在干净环境执行接手验收',
        language: 'PowerShell',
        code: `$work = Join-Path $env:TEMP ("brownfield-" + [guid]::NewGuid())
git clone $env:REPO_URL $work
Set-Location $work
Get-Content README.md | Select-Object -First 60
docker compose up -d
./scripts/wait-healthy.ps1 -Url http://127.0.0.1:18080/actuator/health -Timeout 120
./scripts/smoke.ps1 -BaseUrl http://127.0.0.1:18080
Get-Content docs/runbook.md | Select-Object -First 80
Get-ChildItem docs/architecture, docs/risks | Select-Object Name`,
        output: `clone completed
compose services healthy in 48s
smoke: health=200, create=201, query=200, cancel=204
runbook has startup, rollback, database and Kafka sections
architecture/dependency.md updated 2026-11-24

新成员从空目录启动成功并跑通冒烟。
文档命令可执行，未知项和负责人清单可在 10 分钟内找到。`,
      }],
    ],
  },
  {
    name: '性能问题定位与优化',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 JVM、JFR、线程诊断、数据库、缓存、并发和容量课程。',
    goal: '能把慢请求分到 CPU、锁、GC、IO、数据库或网络，建立基线和单变量实验，证明 P99 改善且功能无回归。',
    guidedPractice: '选择一个慢接口，记录请求量、P50/P95/P99、错误和资源；用 JFR、线程转储、SQL 语句数/执行计划和下游 trace 分类瓶颈，再做只改一个变量的实验。',
    independentPractice: '完成一次真实 P99 优化，提交输入模型、baseline、profiling 证据、假设、修改、压测、业务回归和回滚条件。',
    commonErrors: ['先改 JVM 参数或加缓存，没有确认慢在 CPU、等待还是下游。', '只比较平均值和单次压测，忽略长尾、错误率与资源成本。'],
    sourceRefs: [JDK_TOOLS, SRE],
    steps: [
      ['先把慢请求变成分布', '记录端到端和每一跳的 P50/P95/P99、错误率、吞吐、连接队列和资源，按租户、接口和输入大小拆分。平均值会掩盖少量极慢请求，先找稳定重现的尾部样本；没有固定载荷和输入规模，后续优化不可比较。', '用长尾和分段定位', {
        title: 'k6 + Prometheus：建立慢请求基线',
        language: 'JavaScript',
        code: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    steady: { executor: 'constant-vus', vus: 100, duration: '10m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1200'],
  },
};

export default function () {
  const res = http.get(__ENV.URL + '/api/orders?size=100');
  check(res, { 'status 200': r => r.status === 200 });
  sleep(1);
}`,
        output: `http_reqs=60000, 100 VUs for 10m
http_req_duration p50=182ms p95=640ms p99=2140ms
http_req_failed=0.6%
CPU=68%, heap=72%, DB pool waiting p99=18
top slow tenant=acme inputs=size100

平均值 220ms 掩盖了 2.14s 的 P99。
先固定 100 VUs、size=100 和同一数据集，后续实验才有基线。`,
      }],
      ['按资源信号分类', '高 CPU 看热点栈与分配，锁等待看线程转储和 JFR Monitor，GC 看暂停与分配速率，IO 看文件/网络事件，数据库看语句数、执行计划和锁。每类证据不同，不能共用一套参数答案；先采样短窗口，避免诊断工具本身放大负载。', '先分类，再选工具', {
        title: 'JFR + jcmd：判断 CPU、锁还是 GC',
        language: 'PowerShell',
        code: `$pid = (Get-Process java | Select-Object -First 1).Id
jcmd $pid VM.version
jcmd $pid VM.flags
jcmd $pid Thread.print -l > threads.txt
jcmd $pid GC.heap_info
jcmd $pid JFR.start name=slow duration=60s settings=profile filename=slow.jfr
Start-Sleep -Seconds 65
jfr print --events jdk.ExecutionSample,jdk.JavaMonitorEnter,jdk.GarbageCollection slow.jfr > jfr.txt
Select-String -Path jfr.txt -Pattern "OrderMapper|Hikari|MonitorEnter|pause" -Context 0,3`,
        output: `JVM version=21.0.5
VM.flags=-XX:MaxRAMPercentage=60 -XX:+UseG1GC
heap used=1.2G committed=1.5G
ExecutionSample top=24% OrderMapper.toView
JavaMonitorEnter count=182, total=4.8s
GarbageCollection maxPause=21ms

CPU 热点、锁等待和 GC 暂停已分开。
GC 不是 P99 主因，JFR 指向结果映射和数据库连接等待。`,
      }],
      ['建立受控基线和假设', '固定代码、数据、并发、预热和环境，记录原始指标。根据证据写一个可证伪假设，例如“每请求重复查询造成 20 次 SQL”，而不是同时改缓存、线程数和超时；实验只改变一个主要变量并记录预期结果。', '假设要指向一个机制', {
        title: 'PostgreSQL：验证重复 SQL 假设',
        language: 'SQL',
        code: `SELECT queryid, calls,
       round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 3) AS mean_ms,
       rows
FROM pg_stat_statements
WHERE query ILIKE '%order_item%'
ORDER BY calls DESC
LIMIT 10;

EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, i.id
FROM orders.orders o
LEFT JOIN orders.order_item i ON i.order_id = o.id
WHERE o.id IN (SELECT id FROM orders.orders ORDER BY created_at DESC LIMIT 100);

SELECT count(*) AS sql_calls
FROM pg_stat_statements
WHERE query ILIKE '%order_item%';`,
        output: `calls=20100 over 1000 requests -> about 20 item queries per request
mean_exec_time=2.1ms, total=42.2s
EXPLAIN shows repeated index scans with one query per order
current request SQL count=21, target=2

假设：订单列表对每条订单单独加载明细，造成 N+1。
下一实验只把明细加载改为批量 IN 查询。`,
      }],
      ['优化后用同一模型复测', '只改目标变量，重跑相同负载与数据，比较 P99、吞吐、错误、CPU、GC、连接和下游。增加功能回归和故障路径，确认改善不是把成本转给缓存、数据库或用户；如果 P99 没变，保留原始假设的反证。', '收益与副作用一起评估', {
        title: 'k6：优化前后同一负载复测',
        language: 'PowerShell',
        code: `$env:URL = "http://127.0.0.1:8080"; $env:RUN = "before"
k6 run --summary-export baseline.json perf/order-list.js
$env:RUN = "after"
k6 run --summary-export optimized.json perf/order-list.js
$before = Get-Content baseline.json | ConvertFrom-Json
$after = Get-Content optimized.json | ConvertFrom-Json
[pscustomobject]@{
  P95Before=$before.metrics.http_req_duration.values.'p(95)'
  P95After=$after.metrics.http_req_duration.values.'p(95)'
  P99Before=$before.metrics.http_req_duration.values.'p(99)'
  P99After=$after.metrics.http_req_duration.values.'p(99)'
  ErrorsBefore=$before.metrics.http_req_failed.values.rate
  ErrorsAfter=$after.metrics.http_req_failed.values.rate
} | Format-List
psql $env:DATABASE_URL -c "select query, calls, mean_exec_time from pg_stat_statements where query ilike '%order_item%'"`,
        output: `P95Before=640ms P95After=248ms
P99Before=2140ms P99After=710ms
ErrorsBefore=0.006 ErrorsAfter=0.001
item SQL calls/request: 20 -> 2
DB total time: 42.2s -> 5.9s

同一 100 VUs、10 分钟和数据集下，P99 降低约 67%。
响应业务字段与分页总数回归一致，没有把成本转到缓存。`,
      }],
      ['上线保留观测和回滚', '把关键指标、预算和回滚版本写入发布单，观察真实峰值和缓存冷启动。若收益未达到门槛或出现新瓶颈，恢复原方案并记录反证，避免“优化”成为永久复杂度；生产实际输入分布可能与压测模型不同。', '实验室收益要经过生产', {
        title: 'Kubernetes：性能变更灰度与回滚',
        language: 'PowerShell',
        code: `kubectl set image deployment/orders app=registry.example/orders@sha256:optimized
kubectl rollout status deployment/orders --timeout=180s
Start-Sleep -Minutes 10
$p99 = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_http_p99").data.result[0].value[1]
$sql = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_db_calls_per_request").data.result[0].value[1]
$errors = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_error_ratio").data.result[0].value[1]
[pscustomobject]@{ P99=$p99; SqlPerRequest=$sql; Errors=$errors } | Format-Table
if ([double]$p99 -gt 0.9 -or [double]$errors -gt 0.01) {
  kubectl rollout undo deployment/orders
  kubectl rollout status deployment/orders --timeout=180s
}`,
        output: `P99=0.62s SqlPerRequest=2.1 Errors=0.003
canary 5%: pass
50%: pass
100%: P99 stable for 30m

生产输入 size=100 仍保持 2 条 SQL，P99 从 1.9s 降到 0.62s。
回滚条件预先存在；本次未触发。`,
      }],
    ],
  },
  {
    name: '安全审查与修复',
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '完成 Spring Security、鉴权、输入安全、秘密、依赖与 AI 工具课程。',
    goal: '能从资产和信任边界审查越权、注入、秘密、依赖和 AI 工具风险，修复根因并补攻击回归。',
    guidedPractice: '对一个订单接口画信任边界，列出用户、网关、服务、数据库和 AI 工具资产；测试跨租户 ID、SQL 拼接、错误日志泄露、过期令牌和工具越权，保存请求与响应证据。',
    independentPractice: '完成一次安全评审，提交威胁模型、发现、风险等级、修复差异、回归测试和剩余风险，证明同一攻击在修复后失败。',
    commonErrors: ['只跑依赖扫描，不检查对象级授权和业务状态转换。', '用前端隐藏按钮代替服务端授权，或把秘密放在环境变量名中却仍打印到日志。'],
    sourceRefs: [OWASP, SPRING_SECURITY],
    steps: [
      ['资产、主体和信任边界先画清', '列出订单、余额、身份、密钥、内部 API 和模型上下文，标出谁可以调用、在哪里跨越网络或权限边界。威胁模型从资产和攻击面出发，才能覆盖 IDOR、SSRF、注入、重放和工具调用；每条路径至少有一个控制和一个验证方法。', '边界决定攻击路径', {
        title: 'YAML：订单服务威胁模型清单',
        language: 'YAML',
        code: `assets:
  - orders.orders
  - billing.ledger
  - secrets/payment-api
  - model-context
actors:
  - anonymous
  - customer
  - support-agent
  - internal-service
  - ai-tool
boundaries:
  - edge -> orders-api
  - orders-api -> payment-api
  - orders-api -> postgres
  - support -> tool-call
threats:
  - id: T01
    type: IDOR
    path: customer -> /orders/{id}
    control: tenant-and-owner-check
    verification: attack-matrix
  - id: T02
    type: SSRF
    path: ai-tool -> fetch-url
    control: allowlisted-origin
    verification: blocked-internal-ip-test`,
        output: `assets=4 actors=5 boundaries=4 threats=2
T01 customer -> /orders/{id}: tenant-and-owner-check
T02 ai-tool -> fetch-url: allowlisted-origin, blocked-internal-ip-test

威胁模型从对象、调用者和边界出发。
每个威胁都有控制与可执行的验证，而不是泛泛“注意安全”。`,
      }],
      ['授权在服务端对象层闭合', '认证主体、租户、资源归属和操作状态共同决定权限，查询必须从可信主体约束数据。管理员代办和批量接口单独建模，不能只依赖 URL 角色或前端菜单；对象不存在和无权访问要按业务选择统一响应，避免枚举。', '每个对象都重新授权', {
        title: 'PowerShell：跨租户 IDOR 攻击回归',
        language: 'PowerShell',
        code: `$base = "https://api.example.test"
$tokenA = (Get-Content token-acme.json | ConvertFrom-Json).access_token
$tokenB = (Get-Content token-globex.json | ConvertFrom-Json).access_token
curl.exe -s -o owner.json -w "owner=%{http_code}; " -H "Authorization: Bearer $tokenA" "$base/api/orders/O-acme"
curl.exe -s -o attacker.json -w "attacker=%{http_code}; " -H "Authorization: Bearer $tokenB" "$base/api/orders/O-acme"
curl.exe -s -o update.json -w "update=%{http_code}; " -X PATCH -H "Authorization: Bearer $tokenB" -H "Content-Type: application/json" -d '{"status":"CANCELLED"}' "$base/api/orders/O-acme"
Get-Content attacker.json
psql $env:DATABASE_URL -c "select status from orders.orders where id='O-acme'"
curl.exe -s "$base/api/audit?resource=O-acme" -H "Authorization: Bearer $env:ADMIN_TOKEN"`,
        output: `owner=200
attacker=404
update=404
attacker body code=ORDER_NOT_FOUND
orders status=PAID (unchanged)
audit ACCESS_DENIED actor=u-globex tenant=globex resource=O-acme

跨租户读取和写入都被对象层拒绝。
响应不泄露资源存在性，业务状态未改变，审计可追溯。`,
      }],
      ['输入与输出都按不可信处理', 'SQL 使用参数化，命令、模板、路径和外部 URL 使用白名单与解析器，错误响应不泄露堆栈和内部数据。日志脱敏，AI 工具参数重新校验并限制可访问资源；解析失败要拒绝，而不是把原字符串交给 shell 或模板。', '模型和用户输入都不可信', {
        title: 'Java：参数化 SQL 与 URL 白名单',
        language: 'Java',
        code: `List<OrderView> search(String status, int limit) {
  return jdbc.query("""
    select id, status, total
    from orders.orders
    where tenant_id = ? and status = ?
    order by created_at desc
    limit ?
    """, orderMapper, actor.tenantId(), status, Math.min(limit, 100));
}

URI safeFetch(String rawUrl) {
  URI uri = URI.create(rawUrl);
  if (!"https".equals(uri.getScheme())
      || !ALLOWED_HOSTS.contains(uri.getHost())
      || uri.getHost().endsWith(".internal")) {
    throw new IllegalArgumentException("URL_NOT_ALLOWED");
  }
  return uri;
}

if (!path.startsWith("/exports/")
    || path.contains("..")
    || path.indexOf('\\0') >= 0) {
  throw new IllegalArgumentException("INVALID_PATH");
}`,
        output: `status='PAID' or 1=1 -> query uses parameter, returns PAID rows only
url=https://169.254.169.254/latest/meta-data -> URL_NOT_ALLOWED
path=../../etc/passwd -> INVALID_PATH

SQL、URL 和路径都按不可信输入拒绝危险形态。
错误响应返回稳定 code，不暴露数据库或文件系统细节。`,
      }],
      ['秘密与依赖进入生命周期', '秘密通过 Secret 管理、最小权限和轮换使用，避免进入镜像、仓库和日志；依赖使用锁定版本、SBOM、漏洞扫描和签名。发现漏洞时评估可达性、升级窗口和回滚；轮换后要验证旧凭据失效和新凭据生效。', '秘密和供应链也要运维', {
        title: 'PowerShell：秘密扫描、漏洞和签名验证',
        language: 'PowerShell',
        code: `gitleaks detect --source . --redact --report-format json --report-path gitleaks.json
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1 .
syft registry.example/orders@sha256:4b91 -o spdx-json > sbom.json
grype sbom:sbom.json --fail-on high
cosign verify registry.example/orders@sha256:4b91
kubectl get secret orders-secret -o jsonpath="{.metadata.resourceVersion}"
kubectl rollout restart deployment/orders
kubectl rollout status deployment/orders --timeout=180s`,
        output: `gitleaks findings=0
trivy HIGH=0 CRITICAL=0 secrets=0
sbom packages=187, high vulnerabilities=0
cosign verified digest=sha256:4b91
secret updated, old token revoked
deployment restarted and healthy in 42s

秘密不在仓库或镜像中，轮换后旧 token 已失效。
漏洞和签名门禁证据与发布 digest 一起保存。`,
      }],
      ['修复后用攻击回归验收', '保留攻击请求、预期拒绝、响应体、审计和监控，修复后重放同一用例，再测试相邻变体。剩余风险写进 ADR 或安全例外，明确负责人和到期时间；攻击用例必须自动运行并进入每次发布门禁，不能依靠一次性手工检查。', '攻击不成功才是证据', {
        title: 'Spring Test：IDOR 与注入攻击回归',
        language: 'Java',
        code: `@SpringBootTest(webEnvironment = RANDOM_PORT)
class SecurityRegressionTest {
  @Autowired TestRestTemplate http;

  @Test
  void crossTenantReadAndUpdateAreDenied() {
    String token = tokenFor("globex", "ORDER_READ");
    var read = http.exchange("/api/orders/O-acme", GET,
      new HttpEntity<>(bearer(token)), Problem.class);
    var update = http.exchange("/api/orders/O-acme", PATCH,
      new HttpEntity<>(Map.of("status", "CANCELLED"), bearer(token)), Problem.class);
    assertEquals(HttpStatus.NOT_FOUND, read.getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, update.getStatusCode());
    assertEquals("ORDER_NOT_FOUND", read.getBody().getProperties().get("code"));
  }

  @Test
  void sqlInjectionPayloadReturnsValidationError() {
    var response = http.getForEntity(
      "/api/orders/search?status=PAID%27%20OR%201%3D1--", Problem.class);
    assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    assertEquals("INVALID_STATUS", response.getBody().getProperties().get("code"));
  }
}`,
        output: `✔ crossTenantReadAndUpdateAreDenied()
✔ sqlInjectionPayloadReturnsValidationError()
audit ACCESS_DENIED count=2
metrics api.errors{code="ORDER_NOT_FOUND"}=2

同一攻击和相邻注入变体在 CI 自动失败保护。
剩余风险：管理员批量导出待补对象级审计，负责人=security，到期=2026-12-10。`,
      }],
    ],
  },
  {
    name: '生产故障演练',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '完成可观测性、Kafka、Redis、数据库、连接池、代理和发布课程。',
    goal: '能按运行手册观测、止损、恢复和复盘联合故障，区分触发因素与根因，验证数据和服务恢复。',
    guidedPractice: '演练 Broker 下线、数据库延迟、连接池耗尽和发布失败组合，按值班流程查看仪表盘、trace、日志和变更，执行降级、隔离、扩容与回滚，记录时间线。',
    independentPractice: '设计一次非生产环境事故演练，包含角色、假设、注入、停止条件、沟通、恢复和复盘，提交指标、日志、命令和客户影响报告。',
    commonErrors: ['一看到错误率上升就重启所有服务，打断诊断并制造更多不可用。', '恢复后只看 Pod Running，没有验证数据、积压、连接和关键业务。'],
    sourceRefs: [SRE, K8S],
    steps: [
      ['先确认影响和变更窗口', '从用户错误率、关键业务成功率、延迟和依赖状态判断影响范围，查看最近部署、配置、迁移和证书变更。事故初期先保护用户，不在未确认时做全局重启；先确认受影响租户、开始时间和最近一次变更，建立统一时间线。', '先界定影响与最近变化', {
        title: 'Prometheus：确认影响范围与最近变更',
        language: 'PowerShell',
        code: `$base = "http://prometheus:9090/api/v1/query"
$queries = @{
  error = 'sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))'
  p99 = 'histogram_quantile(0.99, sum by (le,route) (rate(http_duration_seconds_bucket[5m])))'
  kafka = 'kafka_consumergroup_lag'
  dbWait = 'hikaricp_connections_pending'
}
foreach ($name in $queries.Keys) {
  Invoke-RestMethod "$base?query=$([uri]::EscapeDataString($queries[$name]))" |
    Select-Object -ExpandProperty data |
    Select-Object -ExpandProperty result |
    ForEach-Object { [pscustomobject]@{ metric=$name; labels=$_.metric; value=$_.value[1] } }
}
kubectl rollout history deployment/orders
kubectl get events --sort-by=.lastTimestamp | Select-Object -Last 20`,
        output: `error route=/api/checkout value=0.083
p99 route=/api/checkout value=4.2
kafka lag topic=order-events value=18420
dbWait pool=orders-pool value=27
revision 12 image=sha256:4b91 deployed 10:02
events: payment timeout, readiness probe failed

影响集中在 checkout，开始于 revision 12 发布后 4 分钟。
未做全局重启，先保留现场并确认支付依赖与连接池。`,
      }],
      ['按运行手册执行止损', '根据故障类型使用限流、摘流、降级、切只读、暂停消费、扩容或回滚，每个动作写明预期效果和停止条件。保留操作时间、命令和结果，避免多人重复修改；高风险动作要有明确负责人、审批边界和可执行的回滚命令。', '止损动作要有负责人', {
        title: 'Kubernetes：先回滚再限制故障流量',
        language: 'PowerShell',
        code: `"$(Get-Date -Format o) incident=INC-91 action=rollback owner=oncall" | Tee-Object incident.log -Append
kubectl rollout undo deployment/orders
kubectl rollout status deployment/orders --timeout=180s
kubectl scale deployment/orders-feature --replicas=0
kubectl patch deployment/orders --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/env/4/value","value":"true"}]'
curl.exe -s http://127.0.0.1:8080/actuator/health/readiness
curl.exe -s http://127.0.0.1:9090/api/v1/query?query=orders_error_ratio
"$(Get-Date -Format o) action=verify owner=oncall" | Tee-Object incident.log -Append`,
        output: `10:06:10 action=rollback owner=oncall
deployment "orders" rolled back
deployment "orders" successfully rolled out
feature disabled through controlled config patch
readiness=UP
error ratio=0.004
10:08:02 action=verify owner=oncall

每次操作有时间和负责人。
停止条件：错误率<1%、支付超时下降、活跃连接回基线。`,
      }],
      ['让观测回答三个问题', '仪表盘和 trace 要回答哪里失败、影响多少、是否在恢复。比较故障前后同一指标窗口，区分错误率下降是因为流量被拒绝还是服务真的恢复；trace、日志、业务成功率和请求量必须互相对照，才能排除流量消失造成的假恢复。', '流量消失不等于恢复', {
        title: 'Prometheus + Jaeger：比较故障窗口',
        language: 'PowerShell',
        code: `$start = "2026-11-24T10:02:00Z"
$end = "2026-11-24T10:08:00Z"
$queries = @{
  requestRate = 'sum(rate(http_requests_total[1m]))'
  successRate = 'sum(rate(http_requests_total{status!~"5.."}[1m])) / sum(rate(http_requests_total[1m]))'
  checkoutLatency = 'histogram_quantile(0.99, sum by (le) (rate(http_duration_seconds_bucket{route="/api/checkout"}[5m])))'
  rejected = 'sum(rate(http_requests_total{status="429"}[1m]))'
}
foreach ($name in $queries.Keys) {
  $uri = "http://prometheus:9090/api/v1/query_range?start=$start&end=$end&step=30s&query=" + [uri]::EscapeDataString($queries[$name])
  Invoke-RestMethod $uri | Select-Object -ExpandProperty data |
    Select-Object -ExpandProperty result |
    ForEach-Object { [pscustomobject]@{ metric=$name; samples=$_.values.Count; first=$_.values[0][1]; last=$_.values[-1][1] } }
}
curl.exe -s "http://jaeger:16686/api/traces?service=orders&start=$start&end=$end&limit=20" > traces.json`,
        output: `requestRate first=182/s last=178/s (traffic returned)
successRate first=0.92 last=0.996
checkoutLatency first=4.2s last=0.71s
rejected first=0 last=0 (not hidden by rate limit)
trace slow span=paymentClient.charge 3.8s

请求量没有骤降，成功率和延迟真实恢复。
trace 指向支付调用，而不是数据库或 GC。`,
      }],
      ['恢复要验证数据与积压', '检查数据库连接和复制、Kafka LEO/commit/consumer lag、Redis 缓存、HTTP 连接和关键业务对账。异步补偿和死信要进入队列，确认没有静默丢失或重复副作用；恢复声明必须包含业务数量与版本。', '服务进程与业务状态一起恢复', {
        title: 'PowerShell + SQL：服务、积压和业务对账',
        language: 'PowerShell',
        code: `kubectl get pods -l app=orders
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --describe --group order-worker
psql $env:DATABASE_URL -c "select count(*) from orders.orders where updated_at >= '2026-11-24 10:02:00+08'"
psql $env:DATABASE_URL -c "select count(*) from orders.outbox where status <> 'SENT'"
psql $env:DATABASE_URL -c "select count(*) from reconciliation.gaps where day=current_date"
redis-cli -h redis -p 6379 INFO stats | Select-String "keyspace_hits|keyspace_misses"
curl.exe -s http://127.0.0.1:8080/actuator/health/readiness`,
        output: `orders-7d9f 1/1 Running
orders-5c2a 1/1 Running
GROUP order-worker orders 0-2 lag=0
orders updated during incident=1842
outbox not sent=0
reconciliation gaps=0
readiness=UP

服务、消息积压、Outbox 和业务对账都恢复。
没有把“Pod Running”当作事故结束条件。`,
      }],
      ['复盘围绕系统改进', '时间线记录发现、行动、影响和恢复证据，区分触发事件、促成条件与缺失防线。改进项有负责人、截止时间和回归演练，下一轮验证真实降低同类故障影响；复盘应能解释为什么监控、发布和降级没有提前阻断。', '复盘以可验证改进收口', {
        title: 'PowerShell：事故时间线与改进项',
        language: 'PowerShell',
        code: `$timeline = @(
  [pscustomobject]@{ time="10:02:10"; event="revision 12 starts rollout" },
  [pscustomobject]@{ time="10:02:25"; event="fast-burn alert fires" },
  [pscustomobject]@{ time="10:03:00"; event="checkout error 8.3%" },
  [pscustomobject]@{ time="10:06:10"; event="rollback started" },
  [pscustomobject]@{ time="10:08:02"; event="error < 1%" },
  [pscustomobject]@{ time="10:15:00"; event="outbox and reconciliation clean" }
)
$timeline | Format-Table -AutoSize
$actions = @(
  [pscustomobject]@{ owner="payments"; action="add payment timeout SLI"; due="2026-12-02" },
  [pscustomobject]@{ owner="sre"; action="canary checks dependency timeout"; due="2026-11-29" },
  [pscustomobject]@{ owner="orders"; action="load test revision with 3x payment latency"; due="2026-12-05" }
)
$actions | ConvertTo-Json | Tee-Object incident-actions.json`,
        output: `10:02:10 rollout starts
10:02:25 alert fires
10:03:00 checkout error 8.3%
10:06:10 rollback
10:08:02 error <1%
10:15:00 data clean

改进项有负责人和截止时间。
下一次演练验证支付超时能在金丝雀阶段阻断发布，而不是只看文档已更新。`,
      }],
    ],
  },
  {
    name: '架构 ADR 与技术取舍',
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '完成模块、分布式、数据一致性、部署和故障课程。',
    goal: '能围绕质量属性与约束记录模块化单体、消息、多数据源和部署决策，写出可重新评估的 ADR。',
    guidedPractice: '为订单系统选择模块化单体还是微服务，写下上下文、约束、质量场景、三个候选、决策、后果和重新评估条件；用一次跨模块事务和数据迁移案例检验论证。',
    independentPractice: '写一份能在半年后重读的 ADR，覆盖可用性、延迟、一致性、成本、团队所有权、发布和回滚，并列出反对意见与未决风险。',
    commonErrors: ['ADR 只写“采用微服务因为可扩展”，没有质量场景、成本和反例。', '决策没有所有者和重新评估触发器，环境变化后仍被当成不可修改结论。'],
    sourceRefs: ['Architecture Decision Records. https://adr.github.io/', SRE],
    steps: [
      ['上下文先描述约束', 'ADR 写业务问题、规模、团队、预算、合规、现有系统和时间窗口，不先写偏好的技术。没有上下文的架构图无法判断取舍，读者也无法知道半年后哪些条件已经改变；上下文要包含事实、假设和未知项。', '先写问题与限制', {
        title: 'Markdown：ADR 上下文模板',
        language: 'Markdown',
        code: `# ADR-014 订单与库存一致性方案

## 背景
- 当前 12 个应用实例，订单峰值 1800 req/s。
- 订单与库存分别在两个 PostgreSQL 集群。
- 团队 6 人，发布频率每日 2 到 4 次。
- 合规要求支付操作可审计，不可静默丢失。

## 约束
- 不允许在高峰期阻塞订单主库超过 200ms。
- 30 天内不能重构库存服务 API。
- 故障恢复目标：15 分钟内可查询流程状态。

## 未知
- 库存团队是否支持幂等预留接口。
- 消息积压 P99 上限尚未测量。`,
        output: `背景包含规模、团队、数据边界和合规。
约束可测量：主库延迟 200ms、恢复 15 分钟、API 30 天。
未知项被显式记录，供决策者和后续评审补证。`,
      }],
      ['质量属性转成场景', '把高可用、低延迟、一致性、可维护性和成本写成可测量场景，例如峰值请求下的 P99、故障恢复时间和数据陈旧窗口。场景使候选方案可以在同一尺度比较；场景要包含刺激、环境、响应和度量。', '质量属性必须可观测', {
        title: 'YAML：可测质量场景',
        language: 'YAML',
        code: `scenarios:
  - id: QS-01
    stimulus: 订单峰值 1800 req/s
    environment: 库存服务延迟 2s
    response: 订单请求保持可见状态
    measure: p99 < 1500ms, error_ratio < 1%
  - id: QS-02
    stimulus: 消息代理不可用 10 分钟
    environment: 应用继续写订单
    response: Outbox 保留待发事件
    measure: lost_events=0, recovery < 15m
  - id: QS-03
    stimulus: 重复支付回调 20 次
    environment: 同一 eventId 并发
    response: 只产生一笔账务流水
    measure: duplicate_charge=0
  - id: QS-04
    stimulus: 新人接手
    environment: 无口头背景
    response: 按 ADR 执行回滚
    measure: rollback < 10m`,
        output: `QS-01 p99<1500ms, error<1%
QS-02 lost_events=0, recovery<15m
QS-03 duplicate_charge=0
QS-04 rollback<10m

质量属性变成刺激、环境、响应和度量。
候选方案可以在同一组场景下比较，而不是比口号。`,
      }],
      ['候选方案列清后果', '比较模块化单体、分布式事务、Outbox/Saga、同步/异步通信和部署方式，写出收益、代价、失败模式、迁移路径和团队负担。保留至少一个被否决方案及理由，避免伪选择；估算要显示数据来源和不确定性。', '每个收益都写对应成本', {
        title: 'Markdown：候选方案后果表',
        language: 'Markdown',
        code: `| 方案 | 收益 | 代价 | 失败模式 | 迁移路径 |
|---|---|---|---|---|
| 同步调用库存 | 实现简单 | 库存慢拖垮订单 | 超时未知结果 | 30 天内可完成 |
| XA 两阶段提交 | 强原子 | 锁和运维复杂 | 协调器故障 | 需改两库驱动 |
| Outbox + Saga | 可恢复、可审计 | 最终一致、状态机复杂 | 重复、乱序 | 逐步接入，不需双写 |
| 共享库事务 | 本地原子 | 服务耦合、无法独立扩缩 | schema 冲突 | 与边界目标冲突 |

否决 XA：当前团队无人维护协调器，故障面超出收益。
否决共享库：订单和库存发布节奏不同，已有独立团队。`,
        output: `同步：低复杂度，高耦合失败
XA：强一致，高运维与锁成本
Outbox+Saga：最终一致，需状态机和幂等
共享库：本地原子，破坏所有权

至少两个方案被明确否决并写理由。
每个收益旁都有代价和失败模式。`,
      }],
      ['决策与所有权明确', '记录被选方案、适用范围、负责人、实施边界和例外，不把讨论过程写成命令。默认采用模块化边界和可回退路径，跨服务原子性若无法提供就明确最终一致；决策还要写谁有权修改和谁负责运行。', '决策需要所有者', {
        title: 'Markdown：ADR 决策与边界',
        language: 'Markdown',
        code: `## 决策
采用订单 Outbox + 库存预留 Saga。

## 适用范围
- 新订单创建与库存预留。
- 不适用于支付清算，支付链路继续使用现有账务系统。

## 所有权
- 决策人：架构评审组（2026-11-24）
- 实现负责人：订单平台团队
- 运行负责人：SRE on-call
- 例外审批：架构负责人，最长 30 天

## 边界
- Outbox 与订单同库同事务。
- 库存接口必须有 idempotency-key。
- 超过 5 分钟未回执进入人工队列。
- 跨库不承诺原子提交，承诺可查询和可补偿。`,
        output: `decision=Outbox+Saga
owner=order-platform, runtime-owner=sre
exception-max=30d
payment-clearing explicitly out of scope

决策、范围、运行责任和例外审批明确。
团队不会把“采用 Saga”误解为所有跨库操作都自动一致。`,
      }],
      ['重新评估条件可执行', '写明何时重开决策，例如订单量、团队数、数据规模、合规要求或故障频率超过阈值，并关联指标和下一次评审。ADR 是随时间维护的决策记录，不是一次性宣传文档；触发条件要能由现有监控或组织事实判断。', '环境变化触发重新决策', {
        title: 'YAML：ADR 重新评估触发器',
        language: 'YAML',
        code: `review:
  owner: architecture-review
  next_review: 2026-12-15
  triggers:
    - metric: orders_flow_stuck_total
      condition: "> 50 over 24h"
      action: review-saga-reliability
    - metric: order_peak_rps
      condition: ">= 5000 for 7d"
      action: evaluate-partitioning
    - metric: manual_compensation_queue
      condition: "> 100 open for 1h"
      action: incident-review
    - organizational: inventory-team-split
      condition: "team owns inventory write API independently"
      action: revisit-boundaries
    - compliance: payment-audit-v2
      condition: "new retention requires 7-year immutable ledger"
      action: revisit-storage`,
        output: `next review=2026-12-15
peak rps trigger=5000 for 7d
stuck flows trigger=>50 per 24h
manual queue trigger=>100 open for 1h

重新评估条件可被监控或组织事实判断。
ADR 不只记录一次决定，还定义何时它已经过时。`,
      }],
    ],
  },
  {
    name: '源码答辩与知识迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 Java 全课程、企业项目、源码阅读与故障演练。',
    goal: '能用自己的话从版本、入口、状态、扩展点、失败路径和生产验证解释 JVM、Spring、Kafka 与多数据源调用链。',
    guidedPractice: '从 HashMap、ApplicationContext.refresh、KafkaProducer.doSend 和 RoutingDataSource 各选一条调用链，在白板画出参数、状态、线程和资源释放，再用固定版本源码和实验验证。',
    independentPractice: '准备一场 20 分钟源码答辩，回答设计者问题、失败场景和证据来源，并给出下一次版本升级需要重新检查的符号与测试。',
    commonErrors: ['背诵类名与方法名，无法解释输入变化后状态如何流转和资源在哪里释放。', '引用多个版本源码混在一起，答辩时无法说明结论适用的 JDK 或框架版本。'],
    sourceRefs: [OPENJDK, SPRING, KAFKA_SOURCE],
    steps: [
      ['版本和入口先说明', '每个源码结论先报 JDK、Spring Framework、Boot 或 Kafka 版本与源码坐标，再指出公共入口和调用方向。版本不清的答辩无法验证，也不足以支持生产决策；源码结论要说明来自官方 tag、发布包还是反编译，并保留提交号。', '先固定坐标再讲机制', {
        title: 'PowerShell：固定源码版本坐标',
        language: 'PowerShell',
        code: `java -version
./mvnw -q dependency:tree -Dincludes=org.springframework:spring-context,org.springframework.boot:spring-boot
git -C spring-framework rev-parse --short HEAD
git -C spring-framework describe --tags --exact-match
git -C kafka rev-parse --short HEAD
git -C kafka describe --tags --exact-match
Get-Content gradle/libs.versions.toml | Select-String "spring|kafka|junit"
javap -classpath target/classes -p com.example.OrderService`,
        output: `openjdk version "21.0.5"
spring-context:6.2.8
spring-boot:3.4.5
spring-framework commit=1e3f3f5 tag=v6.2.8
kafka commit=8d1b91a tag=3.9.0

答辩白板第一行写 JDK 21.0.5、Spring 6.2.8、Boot 3.4.5、Kafka 3.9.0。
后续类名、字段和行号都绑定同一提交。`,
      }],
      ['沿数据和状态走完整链', '从请求、方法参数或事件记录开始，说明值如何转换成内部对象、哪一字段保存状态、哪个线程持有、何时提交或释放。用图中的节点和箭头对应源码符号，避免只讲目录；每个关键跳转都写输入、输出、线程和资源变化。', '每次跳转都要有输入输出', {
        title: 'JFR + 源码：KafkaProducer 发送链',
        language: 'PowerShell',
        code: `jcmd $pid JFR.start name=kafka-send settings=profile duration=30s filename=kafka-send.jfr
Start-Sleep -Seconds 35
jfr print --events jdk.ExecutionSample,jdk.JavaMonitorEnter,jdk.SocketWrite kafka-send.jfr > kafka-send.txt
rg -n "doSend\\(|append\\(|Sender|RecordAccumulator" kafka/clients/src/main/java/org/apache/kafka/clients/producer
javap -classpath kafka-clients-3.9.0.jar -c -p org.apache.kafka.clients.producer.KafkaProducer |
  Select-String "doSend|append|waitOnMetadata" -Context 0,12
Select-String -Path kafka-send.txt -Pattern "KafkaProducer|Sender|RecordAccumulator","SocketWrite" -Context 0,3`,
        output: `caller Thread-12 KafkaProducer.doSend
serialize key/value, estimate batch size
append to RecordAccumulator partition=1
caller kafka-producer-network-thread Sender.sendProducerData
SocketWrite to leader kafka-2:9092

数据链：业务对象 -> ProducerRecord -> 序列化字节 -> RecordBatch -> NetworkClient -> Broker。
线程链：调用线程入队，Sender 网络线程发送并触发回调。`,
      }],
      ['扩展点和失败路径同等重要', '指出可插入的 Processor、Advisor、Filter、Interceptor 或 Handler，并说明顺序、异常和回滚边界。一个机制能否在生产使用，取决于失败时留下什么状态；答辩要能说明扩展点前后状态、重复执行和资源释放。', '正常链路与失败链路一起讲', {
        title: 'Spring：扩展点插入与失败状态',
        language: 'Java',
        code: `@Aspect
@Order(20)
class PaymentAuditAspect {
  @Around("@annotation(audited)")
  Object audit(ProceedingJoinPoint joinPoint, Audited audited) throws Throwable {
    String auditId = audit.start(joinPoint.getSignature().toShortString());
    try {
      Object result = joinPoint.proceed();
      audit.complete(auditId, "SUCCESS", result);
      return result;
    } catch (Throwable error) {
      audit.complete(auditId, "FAILED", error.getClass().getSimpleName());
      throw error;
    }
  }
}

// Spring 顺序：early @Around 在外层，@Order 数值小者先进入。
// 事务 Advisor order 通常更低，异常会先触发事务回滚再传播到审计。`,
        output: `entry: auditId=aud-91, transaction started by lower-order advisor
success: business commit -> audit SUCCESS
failure: transaction rollback -> audit FAILED -> exception propagated
duplicate invocation: new auditId, unique business id used

扩展点顺序决定审计看到的是提交前还是提交后状态。
如果审计写入失败，策略明确为日志告警，不吞业务异常。`,
      }],
      ['用实验回应质疑', '对白板上的关键结论准备最小复现：日志、断点、JFR、SQL、压测或测试断言。被问到不同版本或配置时，先查 JEP、迁移文档和源码，而不是用记忆猜；每个结论至少有一个能重复执行的实验。', '证据优先于口才', {
        title: 'Spring Test：验证条件与代理行为',
        language: 'Java',
        code: `new ApplicationContextRunner()
  .withUserConfiguration(AuditConfig.class)
  .withPropertyValues("audit.enabled=true")
  .run(context -> {
    assertThat(context).hasSingleBean(AuditAspect.class);
    assertThat(AopUtils.isAopProxy(context.getBean(PaymentService.class))).isTrue();
  });

new ApplicationContextRunner()
  .withUserConfiguration(AuditConfig.class)
  .withPropertyValues("audit.enabled=false")
  .run(context -> assertThat(context).doesNotHaveBean(AuditAspect.class));

assertThatThrownBy(() -> service.charge(failingPayment))
  .isInstanceOf(PaymentDeclined.class);
assertThat(auditRepository.lastOutcome()).isEqualTo("FAILED");`,
        output: `✔ audit.enabled=true creates one aspect and JDK proxy
✔ audit.enabled=false leaves aspect absent
✔ charge failure rolls back transaction and persists FAILED audit

同一实验证明条件装配、代理创建和失败路径。
被问到版本差异时，用固定源码与迁移文档回应。`,
      }],
      ['知识迁移写成可执行卡', '输出源码卡、调用链图、实验命令、失败样例和升级检查项，让下一位工程师能复现。答辩结束时明确哪些是已验证事实、哪些是仍待验证假设；升级检查项要列出源码符号、自动化测试和运行指标，并指定复查触发条件。', '把理解变成可复用证据', {
        title: 'Markdown：源码答辩卡',
        language: 'Markdown',
        code: `# 源码卡：KafkaProducer.doSend

## 坐标
- JDK 21.0.5
- kafka-clients 3.9.0
- commit 8d1b91a

## 调用链
1. app -> KafkaProducer.send
2. doSend -> serialize -> partition
3. RecordAccumulator.append
4. Sender.networkThread -> NetworkClient
5. Broker response -> callback

## 失败路径
- serialization error: caller future fails
- metadata timeout: retry until delivery.timeout.ms
- unknown after retry: business idempotency key reconciles

## 实验
\`jcmd <pid> JFR.start settings=profile\`
\`jfr print --events jdk.ExecutionSample,jdk.SocketWrite\`

## 已验证 / 待验证
- verified: buffer append before network send
- assumption: broker ack after replication to required ISR

## 升级检查
- symbols: doSend, append, Sender.sendProducerData
- tests: timeout, duplicate retry, close with pending batch
- metrics: record queue, batch size, callback latency`,
        output: `source card includes coordinates, call chain, failure path, experiment,
verified facts and remaining assumptions.

另一位工程师可按命令复现入队、发送和回调时间线。
升级时先重跑源码符号、测试和运行指标检查。`,
      }],
    ],
  },
];

export const HANDWRITTEN_JAVA_ADVANCED_J2_COURSES: readonly ProgrammingCourseSeed[] =
  J2_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J3_COURSES: readonly ProgrammingCourseSeed[] =
  J3_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J4_COURSES: readonly ProgrammingCourseSeed[] =
  J4_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J5_COURSES: readonly ProgrammingCourseSeed[] =
  J5_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J6_COURSES: readonly ProgrammingCourseSeed[] =
  J6_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J7_COURSES: readonly ProgrammingCourseSeed[] =
  J7_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J8_COURSES: readonly ProgrammingCourseSeed[] =
  J8_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J9_COURSES: readonly ProgrammingCourseSeed[] =
  J9_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J10_COURSES: readonly ProgrammingCourseSeed[] =
  J10_COURSES;

export const HANDWRITTEN_JAVA_ADVANCED_J11_COURSES: readonly ProgrammingCourseSeed[] =
  J11_COURSES;
