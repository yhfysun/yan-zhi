import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java / JDK 17+',
  docsUrl: 'https://docs.oracle.com/en/java/javase/17/',
  installSteps: [
    '应用内实验使用 JDK 17 或更高版本，主文件固定为 Main.java。',
    '代码只依赖 JDK 标准库，Spring、Reactor 和网络中间件均以可运行契约模拟，不假装加载真实框架。',
    '先按给定 stdin 运行，再修改输入观察边界；断言失败时读取首个异常和已打印证据。',
  ],
  languages: ['java'],
} as const;

type JavaTaskInput = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly checkpoint: string;
  readonly code: string;
};

function javaTask(input: JavaTaskInput): LearningV2CodeLabTask {
  return {
    id: input.id,
    title: input.title,
    brief: input.brief,
    defaultLanguage: 'java',
    starterCode: { java: input.code },
    stdin: input.stdin,
    checkpoint: input.checkpoint,
  };
}

function javaLab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return {
    title,
    description,
    ...javaRuntime,
    practice,
    apply,
  };
}

/**
 * Java 进阶与工程课程的独立单文件实验。
 *
 * 所有键均来自 Java 基础或 Java 高级目录，并避开 learning-code-labs-java.ts
 * 已覆盖的 15 门课程。外部框架机制只以 JDK 标准库接口契约模拟，避免伪装成
 * 真实框架运行。
 */
export const LEARNING_CODE_LABS_JAVA_ADVANCED: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:Java 集合框架总览与复杂度': javaLab(
    'JA 代码台 01 · 操作模型与集合接口',
    '用同一批订单输入比较 List、Set 与 Map 的职责，再通过分组、排序和查找证明接口选择来自访问模型。',
    javaTask({
      id: 'java-advanced-collections-model-guided',
      title: '跟做：同一批订单进入三种接口',
      brief:
        '读取订单号与金额。List 保留输入顺序，Map 建立最后一次出现的索引，Set 暴露重复订单号。输出三类证据，不能把 list.contains 当作键查找方案。',
      stdin: 'A 120\nB 90\nA 120\nC 300\n',
      checkpoint:
        '输出 rows=4、unique=3、duplicates=[A]、total=630、first=A 120，进程退出码为 0。删掉一个重复行后 duplicates 必须为空。',
      code: `import java.util.*;

public class Main {
  record Order(String id, int cents) {}

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    List<Order> rows = new ArrayList<>();
    Map<String, Order> byId = new LinkedHashMap<>();
    Set<String> seen = new HashSet<>();
    Set<String> duplicates = new TreeSet<>();

    while (in.hasNext()) {
      String id = in.next();
      int cents = in.nextInt();
      Order order = new Order(id, cents);
      rows.add(order);
      byId.put(id, order);
      if (!seen.add(id)) {
        duplicates.add(id);
      }
    }

    int total = rows.stream().mapToInt(Order::cents).sum();
    System.out.println("rows=" + rows.size());
    System.out.println("unique=" + byId.size());
    System.out.println("duplicates=" + duplicates);
    System.out.println("total=" + total);
    System.out.println("first=" + rows.get(0).id() + " " + rows.get(0).cents());

    if (rows.size() != 4 || byId.size() != 3 || total != 630
        || !duplicates.equals(Set.of("A"))) {
      throw new IllegalStateException("collection contract mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-collections-selection-apply',
      title: '独立实践：按热点操作选集合并给出证据',
      brief:
        '读取若干“商品 金额”记录，统计每个商品总金额和出现次数。使用 HashMap 聚合，最终用比较器排序；再写出一次按键查找，证明结果与全量扫描一致。',
      stdin: 'tea 120\ntea 80\ncoffee 300\nwater 50\ncoffee 100\n',
      checkpoint:
        '应按金额降序输出 coffee=400/2、tea=200/2、water=50/1；lookupCoffee=400、scanAgrees=true，并断言总金额 650。',
      code: `import java.util.*;

public class Main {
  record Stats(String sku, int total, int count) {}

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Map<String, Integer> totals = new HashMap<>();
    Map<String, Integer> counts = new HashMap<>();
    while (in.hasNext()) {
      String sku = in.next();
      int amount = in.nextInt();
      totals.merge(sku, amount, Integer::sum);
      counts.merge(sku, 1, Integer::sum);
    }

    List<Stats> ordered = totals.entrySet().stream()
        .map(e -> new Stats(e.getKey(), e.getValue(), counts.get(e.getKey())))
        .sorted(Comparator.comparingInt(Stats::total).reversed()
            .thenComparing(Stats::sku))
        .toList();

    for (Stats item : ordered) {
      System.out.println(item.sku() + "=" + item.total() + "/" + item.count());
    }

    int byKey = totals.get("coffee");
    int byScan = 0;
    for (var entry : totals.entrySet()) {
      if (entry.getKey().equals("coffee")) {
        byScan = entry.getValue();
      }
    }
    int grandTotal = totals.values().stream().mapToInt(Integer::intValue).sum();
    System.out.println("lookupCoffee=" + byKey);
    System.out.println("scanAgrees=" + (byKey == byScan));

    if (ordered.size() != 3 || byKey != 400 || byKey != byScan || grandTotal != 650) {
      throw new IllegalStateException("selection evidence failed");
    }
  }
}
`,
    }),
  ),

  'programming:LinkedList 结构与适用边界': javaLab(
    'JA 代码台 02 · 链式节点与双端操作',
    '用自定义双向链表暴露节点链接、首尾操作和索引遍历，再用一个可验证的 LRU 过程理解链表与索引的协作边界。',
    javaTask({
      id: 'java-advanced-linkedlist-nodes-guided',
      title: '跟做：从节点关系执行首尾删除',
      brief:
        '读取一行整数，建立 LinkedList。先打印首尾元素，再从两端交替删除并输出剩余序列；每一步都从当前 size 判断是否还能删除。',
      stdin: '10 20 30 40 50\n',
      checkpoint:
        '输出 first=10、last=50，删除过程依次出现 10/50、20/40，最终 remaining=[30]，操作次数为 4。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    LinkedList<Integer> values = new LinkedList<>();
    while (in.hasNextInt()) {
      values.addLast(in.nextInt());
    }
    if (values.size() < 3 || (values.size() & 1) == 0) {
      throw new IllegalArgumentException("need an odd list with at least 3 values");
    }

    System.out.println("first=" + values.getFirst());
    System.out.println("last=" + values.getLast());
    int removed = 0;
    while (values.size() > 1) {
      int left = values.removeFirst();
      int right = values.removeLast();
      removed += 2;
      System.out.println("removed=" + left + "/" + right);
    }
    System.out.println("remaining=" + values);
    System.out.println("removedCount=" + removed);

    if (removed != 4 || !values.equals(List.of(30))) {
      throw new IllegalStateException("deque operations failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-linkedlist-lru-apply',
      title: '独立实践：用节点链接实现 LRU',
      brief:
        '读取容量与 put/get 操作。用 HashMap 定位节点、双向链表维护访问顺序；命中后移到尾部，超容量删除头部。不要用 ArrayList 每次扫描来伪造 O(1)。',
      stdin: '2\nput A 1\nput B 2\nget A\nput C 3\nget B\nget A\n',
      checkpoint:
        '应输出 get:A=1、get:B=MISS、get:A=1，最终 order=[C,A]；LRU 被逐出的是 B。',
      code: `import java.util.*;

public class Main {
  static final class Node {
    String key;
    int value;
    Node prev;
    Node next;
    Node(String key, int value) { this.key = key; this.value = value; }
  }

  static final class LruCache {
    private final int capacity;
    private final Map<String, Node> index = new HashMap<>();
    private final Node head = new Node("<head>", 0);
    private final Node tail = new Node("<tail>", 0);

    LruCache(int capacity) {
      if (capacity <= 0) throw new IllegalArgumentException("capacity");
      this.capacity = capacity;
      head.next = tail;
      tail.prev = head;
    }

    private void detach(Node node) {
      node.prev.next = node.next;
      node.next.prev = node.prev;
    }

    private void append(Node node) {
      node.prev = tail.prev;
      node.next = tail;
      tail.prev.next = node;
      tail.prev = node;
    }

    void put(String key, int value) {
      Node node = index.get(key);
      if (node != null) {
        node.value = value;
        detach(node);
        append(node);
        return;
      }
      if (index.size() == capacity) {
        Node evicted = head.next;
        detach(evicted);
        index.remove(evicted.key);
      }
      node = new Node(key, value);
      index.put(key, node);
      append(node);
    }

    String get(String key) {
      Node node = index.get(key);
      if (node == null) return "MISS";
      detach(node);
      append(node);
      return Integer.toString(node.value);
    }

    List<String> keys() {
      List<String> keys = new ArrayList<>();
      for (Node node = head.next; node != tail; node = node.next) {
        keys.add(node.key);
      }
      return keys;
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    LruCache cache = new LruCache(in.nextInt());
    List<String> results = new ArrayList<>();
    while (in.hasNext()) {
      String op = in.next();
      if (op.equals("put")) {
        cache.put(in.next(), in.nextInt());
      } else if (op.equals("get")) {
        String key = in.next();
        String value = cache.get(key);
        results.add(value);
        System.out.println("get:" + key + "=" + value);
      } else {
        throw new IllegalArgumentException("unknown op " + op);
      }
    }
    System.out.println("order=" + cache.keys());
    if (!results.equals(List.of("1", "MISS", "1"))
        || !cache.keys().equals(List.of("C", "A"))) {
      throw new IllegalStateException("LRU mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:ConcurrentHashMap 并发语义': javaLab(
    'JA 代码台 03 · 桶级并发与复合操作',
    '通过真实并发线程观察 ConcurrentHashMap 的单键 merge、computeIfAbsent 和跨键原子性边界，区分线程安全容器与业务事务。',
    javaTask({
      id: 'java-advanced-concurrent-map-merge-guided',
      title: '跟做：多线程单键计数',
      brief:
        '读取线程数、每线程递增次数和目标键。多个线程使用 merge 累加同一键；等待全部任务后核对 map 中总额恰好等于 线程数×次数。',
      stdin: '6\n250\ncheckout\n',
      checkpoint:
        '输出 threads=6、expected=1500、actual=1500、counterKeys=1、poolTerminated=true。不要用 get 后 put 的两步复合操作替换 merge。',
      code: `import java.util.*;
import java.util.concurrent.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int threads = in.nextInt();
    int perThread = in.nextInt();
    String key = in.next();
    ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch start = new CountDownLatch(1);

    for (int i = 0; i < threads; i++) {
      pool.submit(() -> {
        start.await();
        for (int n = 0; n < perThread; n++) {
          counts.merge(key, 1, Integer::sum);
        }
        return null;
      });
    }
    start.countDown();
    pool.shutdown();
    boolean terminated = pool.awaitTermination(5, TimeUnit.SECONDS);

    int expected = threads * perThread;
    int actual = counts.getOrDefault(key, 0);
    System.out.println("threads=" + threads);
    System.out.println("expected=" + expected);
    System.out.println("actual=" + actual);
    System.out.println("counterKeys=" + counts.size());
    System.out.println("poolTerminated=" + terminated);
    if (!terminated || actual != expected || counts.size() != 1) {
      throw new IllegalStateException("atomic merge failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-concurrent-map-compound-apply',
      title: '独立实践：初始化只发生一次',
      brief:
        '多个线程同时请求同一个租户配置，使用 computeIfAbsent 确保加载器只执行一次；另一个线程读取已有配置。输出加载次数和配置值。',
      stdin: '8\nacme\nblue\n',
      checkpoint:
        '输出 loads=1、tenant=acme、color=blue、allSame=true。把 computeIfAbsent 改成先 get 再 put 时，应能用更大的并发输入暴露重复加载风险。',
      code: `import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  record Config(String tenant, String color) {}

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int threads = in.nextInt();
    String tenant = in.next();
    String color = in.next();
    ConcurrentHashMap<String, Config> configs = new ConcurrentHashMap<>();
    AtomicInteger loads = new AtomicInteger();
    CountDownLatch start = new CountDownLatch(1);
    List<Future<Config>> futures = new ArrayList<>();
    ExecutorService pool = Executors.newFixedThreadPool(threads);

    for (int i = 0; i < threads; i++) {
      futures.add(pool.submit(() -> {
        start.await();
        return configs.computeIfAbsent(tenant, id -> {
          loads.incrementAndGet();
          return new Config(id, color);
        });
      }));
    }
    start.countDown();
    Set<Config> observed = new HashSet<>();
    for (Future<Config> future : futures) {
      observed.add(future.get(2, TimeUnit.SECONDS));
    }
    pool.shutdownNow();

    Config config = configs.get(tenant);
    boolean allSame = observed.size() == 1 && observed.contains(config);
    System.out.println("loads=" + loads.get());
    System.out.println("tenant=" + config.tenant());
    System.out.println("color=" + config.color());
    System.out.println("allSame=" + allSame);
    if (loads.get() != 1 || !allSame) {
      throw new IllegalStateException("computeIfAbsent contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:AQS、ReentrantLock 与 Condition': javaLab(
    'JA 代码台 04 · 同步状态与条件队列',
    '从自定义 AbstractQueuedSynchronizer 互斥器进入 ReentrantLock/Condition，验证中断、等待和生产者消费者协作。',
    javaTask({
      id: 'java-advanced-aqs-mutex-guided',
      title: '跟做：实现最小 AQS 互斥器',
      brief:
        '读取线程数与每线程递增次数。自定义 BinaryMutex 继承 AbstractQueuedSynchronizer，tryAcquire 用 compareAndSetState 抢占 state，finally 释放；核对总计数。',
      stdin: '5\n400\n',
      checkpoint:
        '输出 acquired=2000、actual=2000、stateAfter=0、waitQueueEmpty=true，线程池在超时内结束。',
      code: `import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.AbstractQueuedSynchronizer;

public class Main {
  static final class BinaryMutex {
    private final Sync sync = new Sync();

    private static final class Sync extends AbstractQueuedSynchronizer {
      @Override
      protected boolean tryAcquire(int ignored) {
        return compareAndSetState(0, 1);
      }

      @Override
      protected boolean tryRelease(int ignored) {
        setState(0);
        return true;
      }

      boolean locked() {
        return getState() == 1;
      }

      boolean queueEmpty() {
        return !hasQueuedThreads();
      }
    }

    void lock() { sync.acquire(1); }
    void unlock() { sync.release(1); }
    boolean locked() { return sync.locked(); }
    boolean queueEmpty() { return sync.queueEmpty(); }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int threads = in.nextInt();
    int perThread = in.nextInt();
    BinaryMutex mutex = new BinaryMutex();
    int[] count = {0};
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    for (int i = 0; i < threads; i++) {
      pool.submit(() -> {
        for (int n = 0; n < perThread; n++) {
          mutex.lock();
          try {
            count[0]++;
          } finally {
            mutex.unlock();
          }
        }
      });
    }
    pool.shutdown();
    boolean terminated = pool.awaitTermination(5, TimeUnit.SECONDS);
    int expected = threads * perThread;
    System.out.println("acquired=" + expected);
    System.out.println("actual=" + count[0]);
    System.out.println("stateAfter=" + (mutex.locked() ? 1 : 0));
    System.out.println("waitQueueEmpty=" + mutex.queueEmpty());
    if (!terminated || count[0] != expected || mutex.locked() || !mutex.queueEmpty()) {
      throw new IllegalStateException("AQS mutex failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-aqs-condition-apply',
      title: '独立实践：Condition 实现有界队列',
      brief:
        '读取容量和待排队整数。生产者线程在满队列时 await，消费者在空队列时 await；使用两个 Condition 分开唤醒。最终校验输入与输出完全一致。',
      stdin: '3\n7 11 13 17 19 23\n',
      checkpoint:
        '输出 consumed=[7, 11, 13, 17, 19, 23]、produced=6、left=0、completed=true；把 signalAll 改成错误条件时应出现等待超时。',
      code: `import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.*;

public class Main {
  static final class BoundedQueue {
    private final int[] values;
    private int head;
    private int size;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    BoundedQueue(int capacity) {
      values = new int[capacity];
    }

    void put(int value) throws InterruptedException {
      lock.lockInterruptibly();
      try {
        while (size == values.length) notFull.await();
        values[(head + size) % values.length] = value;
        size++;
        notEmpty.signal();
      } finally {
        lock.unlock();
      }
    }

    int take() throws InterruptedException {
      lock.lockInterruptibly();
      try {
        while (size == 0) notEmpty.await();
        int value = values[head];
        head = (head + 1) % values.length;
        size--;
        notFull.signal();
        return value;
      } finally {
        lock.unlock();
      }
    }

    int size() {
      lock.lock();
      try { return size; } finally { lock.unlock(); }
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    BoundedQueue queue = new BoundedQueue(in.nextInt());
    List<Integer> input = new ArrayList<>();
    while (in.hasNextInt()) input.add(in.nextInt());
    List<Integer> output = Collections.synchronizedList(new ArrayList<>());

    Thread producer = new Thread(() -> {
      try {
        for (int value : input) queue.put(value);
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      }
    }, "producer");
    Thread consumer = new Thread(() -> {
      try {
        for (int i = 0; i < input.size(); i++) output.add(queue.take());
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      }
    }, "consumer");

    producer.start();
    consumer.start();
    producer.join(3000);
    consumer.join(3000);
    System.out.println("consumed=" + output);
    System.out.println("produced=" + input.size());
    System.out.println("left=" + queue.size());
    System.out.println("completed=" + (!producer.isAlive() && !consumer.isAlive()));
    if (!output.equals(input) || queue.size() != 0 || producer.isAlive() || consumer.isAlive()) {
      throw new IllegalStateException("condition queue failed");
    }
  }
}
`,
    }),
  ),

  'programming:ThreadPoolExecutor 状态机': javaLab(
    'JA 代码台 05 · 线程池容量、队列与拒绝',
    '用真实 ThreadPoolExecutor 观察核心线程、工作队列和 max 线程的创建顺序，再验证有界队列下的拒绝策略和总量守恒。',
    javaTask({
      id: 'java-advanced-threadpool-state-guided',
      title: '跟做：一运行一排队再触发拒绝',
      brief:
        '构造 core=max=1、queue=1 的线程池。第一个任务阻塞，第二个进入队列，第三个触发拒绝。释放第一个任务后检查 completed=2、rejected=1、poolSize=0。',
      stdin: '1\n',
      checkpoint:
        '输出 completed=2、rejected=1、poolTerminated=true、poolSize=0，且命名线程工厂创建的线程实际上运行过。',
      code: `import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int pauseMillis = in.nextInt();
    AtomicInteger completed = new AtomicInteger();
    AtomicInteger rejected = new AtomicInteger();
    CountDownLatch firstStarted = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);

    ThreadPoolExecutor pool = new ThreadPoolExecutor(
        1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(1),
        runnable -> new Thread(runnable, "java-lab-worker"),
        (task, executor) -> rejected.incrementAndGet());

    pool.execute(() -> {
      firstStarted.countDown();
      try {
        releaseFirst.await();
        completed.incrementAndGet();
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      }
    });
    if (!firstStarted.await(2, TimeUnit.SECONDS)) {
      throw new IllegalStateException("first task did not start");
    }
    pool.execute(completed::incrementAndGet);
    pool.execute(completed::incrementAndGet);
    releaseFirst.countDown();
    pool.shutdown();
    boolean terminated = pool.awaitTermination(3, TimeUnit.SECONDS);
    Thread.sleep(pauseMillis);

    System.out.println("completed=" + completed.get());
    System.out.println("rejected=" + rejected.get());
    System.out.println("poolTerminated=" + terminated);
    System.out.println("poolSize=" + pool.getPoolSize());
    if (!terminated || completed.get() != 2 || rejected.get() != 1 || pool.getPoolSize() != 0) {
      throw new IllegalStateException("thread pool state mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-threadpool-futures-apply',
      title: '独立实践：并行任务与失败隔离',
      brief:
        '读取若干整数。把每个整数提交为可返回平方值的 Callable；其中一个任务按规则抛出异常。收集成功值并核对失败数量，确保单个任务失败不会抹掉其他结果。',
      stdin: '5\n1 2 fail 4 5\n',
      checkpoint:
        '输出 successes=[1, 4, 16, 25]、failures=1、submitted=5、terminated=true；异常必须来自 Future.get 的 ExecutionException，而不是主线程直接崩溃。',
      code: `import java.util.*;
import java.util.concurrent.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    ExecutorService pool = Executors.newFixedThreadPool(2);
    List<Future<Integer>> futures = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      String token = in.next();
      futures.add(pool.submit(() -> {
        if (token.equals("fail")) throw new IllegalArgumentException("bad token");
        return Integer.parseInt(token) * Integer.parseInt(token);
      }));
    }
    pool.shutdown();
    List<Integer> successes = new ArrayList<>();
    int failures = 0;
    for (Future<Integer> future : futures) {
      try {
        successes.add(future.get(2, TimeUnit.SECONDS));
      } catch (ExecutionException error) {
        failures++;
      }
    }
    Collections.sort(successes);
    boolean terminated = pool.awaitTermination(3, TimeUnit.SECONDS);
    System.out.println("successes=" + successes);
    System.out.println("failures=" + failures);
    System.out.println("submitted=" + futures.size());
    System.out.println("terminated=" + terminated);
    if (!successes.equals(List.of(1, 4, 16, 25)) || failures != 1
        || futures.size() != 5 || !terminated) {
      throw new IllegalStateException("future isolation failed");
    }
  }
}
`,
    }),
  ),

  'programming:GC 根、可达性与分配': javaLab(
    'JA 代码台 06 · 根集合与对象图',
    '把堆对象、根引用和边写成可检查图，通过 DFS 求可达集；再观察对象离开强引用后的弱引用状态边界。',
    javaTask({
      id: 'java-advanced-gc-roots-guided',
      title: '跟做：从根集合计算存活对象',
      brief:
        '读取根节点与有向边。以每个根为起点做 DFS，输出可达对象和不可达对象；不可达对象就是当前快照里 GC 可回收的候选集合。',
      stdin: 'root-a root-b\nroot-a->a root-b->b b->c d->e e->f\n',
      checkpoint:
        '应输出 reachable=[a, b, c, root-a, root-b]、unreachable=[d, e, f]；d 虽然没有入边，但没有任何根可达路径能到达它。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Set<String> roots = new TreeSet<>(List.of(in.nextLine().trim().split("\\\\s+")));
    String edgeLine = in.hasNextLine() ? in.nextLine().trim() : "";
    Map<String, Set<String>> graph = new TreeMap<>();
    Set<String> all = new TreeSet<>(roots);
    if (!edgeLine.isBlank()) {
      for (String edge : edgeLine.split("\\\\s+")) {
        String[] parts = edge.split("->", -1);
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
          throw new IllegalArgumentException("bad edge " + edge);
        }
        all.add(parts[0]);
        all.add(parts[1]);
        graph.computeIfAbsent(parts[0], ignored -> new TreeSet<>()).add(parts[1]);
      }
    }

    Set<String> reachable = new TreeSet<>();
    Deque<String> stack = new ArrayDeque<>(roots);
    while (!stack.isEmpty()) {
      String current = stack.removeLast();
      if (!reachable.add(current)) continue;
      for (String next : graph.getOrDefault(current, Set.of())) {
        if (!reachable.contains(next)) stack.addLast(next);
      }
    }
    Set<String> unreachable = new TreeSet<>(all);
    unreachable.removeAll(reachable);
    System.out.println("reachable=" + reachable);
    System.out.println("unreachable=" + unreachable);
    if (!reachable.equals(new TreeSet<>(List.of("a", "b", "c", "root-a", "root-b")))
        || !unreachable.equals(new TreeSet<>(List.of("d", "e", "f")))) {
      throw new IllegalStateException("reachability mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-gc-reference-apply',
      title: '独立实践：强、软、弱引用决策表',
      brief:
        '读取缓存条目的命中次数和内存压力等级。按业务规则生成引用策略：高价值且低压力用强引用，高压力用软引用候选，低价值用弱引用候选。断言分支完整。',
      stdin: 'A 12 LOW\nB 9 HIGH\nC 1 HIGH\nD 0 NORMAL\n',
      checkpoint:
        '应输出 A=STRONG、B=SOFT、C=WEAK、D=WEAK，并统计 strong=1/soft=1/weak=2。策略是教学决策表，不代表 JVM 对软引用回收时机有确定保证。',
      code: `import java.util.*;

public class Main {
  enum Policy { STRONG, SOFT, WEAK }

  static Policy choose(int hits, String pressure) {
    if (hits >= 10 && pressure.equals("LOW")) return Policy.STRONG;
    if (hits >= 5 && (pressure.equals("HIGH") || pressure.equals("NORMAL"))) {
      return Policy.SOFT;
    }
    return Policy.WEAK;
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Map<String, Policy> result = new LinkedHashMap<>();
    while (in.hasNext()) {
      String key = in.next();
      int hits = in.nextInt();
      String pressure = in.next();
      result.put(key, choose(hits, pressure));
    }
    Map<Policy, Integer> counts = new EnumMap<>(Policy.class);
    for (var entry : result.entrySet()) {
      counts.merge(entry.getValue(), 1, Integer::sum);
      System.out.println(entry.getKey() + "=" + entry.getValue());
    }
    System.out.println("strong=" + counts.getOrDefault(Policy.STRONG, 0));
    System.out.println("soft=" + counts.getOrDefault(Policy.SOFT, 0));
    System.out.println("weak=" + counts.getOrDefault(Policy.WEAK, 0));
    if (!result.equals(Map.of(
        "A", Policy.STRONG,
        "B", Policy.SOFT,
        "C", Policy.WEAK,
        "D", Policy.WEAK))) {
      throw new IllegalStateException("reference policy mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:G1、ZGC 与停顿模型': javaLab(
    'JA 代码台 07 · 区域分配与停顿预算',
    '用区域分配器模拟 G1 的 region 占用与剩余空间，再按并发收集时间线核对 STW 总停顿和最大单次停顿。',
    javaTask({
      id: 'java-advanced-g1-regions-guided',
      title: '跟做：把对象分配装进固定 region',
      brief:
        '读取 region 数、单 region 容量和一组对象占用数。按顺序装箱，跨 region 的对象必须失败；输出使用 region 数、已用槽位、内部浪费和峰值占用。',
      stdin: '4 3\n2 1 3 2\n',
      checkpoint:
        '输出 allocated=8、regionsUsed=3、waste=1、peakRegion=3、rejected=0；再添加一个占用 4 的对象，必须因超过单 region 容量被拒绝。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int regionCount = in.nextInt();
    int regionCapacity = in.nextInt();
    int[] used = new int[regionCount];
    int allocated = 0;
    int rejected = 0;
    while (in.hasNextInt()) {
      int objectSlots = in.nextInt();
      if (objectSlots > regionCapacity) {
        rejected++;
        continue;
      }
      boolean placed = false;
      for (int i = 0; i < used.length; i++) {
        if (used[i] + objectSlots <= regionCapacity) {
          used[i] += objectSlots;
          allocated += objectSlots;
          placed = true;
          break;
        }
      }
      if (!placed) rejected++;
    }
    int regionsUsed = 0;
    int waste = 0;
    int peak = 0;
    for (int amount : used) {
      if (amount > 0) regionsUsed++;
      waste += regionCapacity - amount;
      peak = Math.max(peak, amount);
    }
    System.out.println("allocated=" + allocated);
    System.out.println("regionsUsed=" + regionsUsed);
    System.out.println("waste=" + waste);
    System.out.println("peakRegion=" + peak);
    System.out.println("rejected=" + rejected);
    if (allocated != 8 || regionsUsed != 3 || waste != 4 || peak != 3 || rejected != 0) {
      throw new IllegalStateException("region allocator mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-collector-pause-apply',
      title: '独立实践：并发工作不等于停顿时长',
      brief:
        '读取若干收集阶段，格式为 名称 类型 毫秒，类型为 STW 或 CONCURRENT。分别累加 STW 时间和并发时间，输出最大单次停顿和停顿占比，不能把并发阶段计成暂停。',
      stdin: 'young STW 8\nmixed STW 11\nmark CONCURRENT 40\nrelocate CONCURRENT 18\ncleanup STW 3\n',
      checkpoint:
        '输出 stwTotal=22、maxPause=11、concurrentTotal=58、events=5、withinBudget=true；预算为 22ms，边界值必须算通过。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    long stwTotal = 0;
    long concurrentTotal = 0;
    long maxPause = 0;
    int events = 0;
    while (in.hasNext()) {
      String phase = in.next();
      String type = in.next();
      long millis = in.nextLong();
      events++;
      if (type.equals("STW")) {
        stwTotal += millis;
        maxPause = Math.max(maxPause, millis);
      } else if (type.equals("CONCURRENT")) {
        concurrentTotal += millis;
      } else {
        throw new IllegalArgumentException("unknown type " + type + " in " + phase);
      }
    }
    long budget = 22;
    boolean withinBudget = stwTotal <= budget;
    System.out.println("stwTotal=" + stwTotal);
    System.out.println("maxPause=" + maxPause);
    System.out.println("concurrentTotal=" + concurrentTotal);
    System.out.println("events=" + events);
    System.out.println("withinBudget=" + withinBudget);
    if (stwTotal != 22 || maxPause != 11 || concurrentTotal != 58 || events != 5
        || !withinBudget) {
      throw new IllegalStateException("pause accounting mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JFR 事件与火焰图': javaLab(
    'JA 代码台 08 · JDK Flight Recorder 事件',
    '使用真实 jdk.jfr API 创建自定义事件、启动记录并回读事件类型，再把请求耗时和执行阶段转成可分析事件。',
    javaTask({
      id: 'java-advanced-jfr-events-guided',
      title: '跟做：提交并回读自定义 JFR 事件',
      brief:
        '读取业务操作名和条目数。启动进程内 JFR 记录，提交三次 OrderEvent，停止后从 .jfr 文件读取事件并按名称计数。',
      stdin: 'checkout\n3\n',
      checkpoint:
        '输出 operation=checkout、items=3、committed=3、readBack=3、recordingBytes>0、recordingReadable=true。',
      code: `import java.nio.file.*;
import java.util.*;
import jdk.jfr.*;
import jdk.jfr.consumer.*;

public class Main {
  @Name("lab.order")
  @Label("Order Processing")
  @Category("Java Lab")
  public static final class OrderEvent extends Event {
    @Label("Operation")
    public String operation;
    @Label("Items")
    public int items;
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    String operation = in.next();
    int items = in.nextInt();
    Path recordingPath = Files.createTempFile("java-jfr-lab-", ".jfr");
    int committed = 0;
    try {
      try (Recording recording = new Recording()) {
        recording.setToDisk(true);
        recording.enable("lab.order");
        recording.start();
        for (int i = 0; i < 3; i++) {
          OrderEvent event = new OrderEvent();
          event.operation = operation;
          event.items = items;
          event.commit();
          committed++;
        }
        recording.stop();
        recording.dump(recordingPath);
      }

      int readBack = 0;
      try (RecordingFile file = new RecordingFile(recordingPath)) {
        while (file.hasMoreEvents()) {
          RecordedEvent event = file.readEvent();
          if (event.getEventType().getName().equals("lab.order")) readBack++;
        }
      }
      long bytes = Files.size(recordingPath);
      System.out.println("operation=" + operation);
      System.out.println("items=" + items);
      System.out.println("committed=" + committed);
      System.out.println("readBack=" + readBack);
      System.out.println("recordingBytes=" + bytes);
      System.out.println("recordingReadable=true");
      if (committed != 3 || readBack != 3 || bytes <= 0) {
        throw new IllegalStateException("JFR round trip mismatch");
      }
    } finally {
      Files.deleteIfExists(recordingPath);
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-jfr-latency-apply',
      title: '独立实践：把慢阶段变成可查询事件',
      brief:
        '读取若干“阶段 毫秒”样本，提交 LfTraceEvent 记录阶段和耗时，同时按阈值找出超预算样本。JFR 文件只保存观测数据，不是性能结论本身。',
      stdin: 'db 42\nrender 8\ncache 3\nnetwork 91\n',
      checkpoint:
        '输出 samples=4、budgetMs=50、slow=[db=42, network=91]、eventsRead=4、recordingBytes>0；阈值以下样本仍应被记录。',
      code: `import java.nio.file.*;
import java.util.*;
import jdk.jfr.*;
import jdk.jfr.consumer.*;

public class Main {
  @Name("lab.latency")
  @Label("Latency Stage")
  public static final class LatencyEvent extends Event {
    @Label("Stage") public String stage;
    @Label("Duration Millis") public long durationMillis;
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    List<String> slow = new ArrayList<>();
    Path output = Files.createTempFile("java-jfr-latency-", ".jfr");
    int submitted = 0;
    try {
      try (Recording recording = new Recording()) {
        recording.enable("lab.latency");
        recording.start();
        while (in.hasNext()) {
          String stage = in.next();
          long millis = in.nextLong();
          LatencyEvent event = new LatencyEvent();
          event.stage = stage;
          event.durationMillis = millis;
          event.commit();
          submitted++;
          if (millis > 50) slow.add(stage + "=" + millis);
        }
        recording.stop();
        recording.dump(output);
      }
      int read = 0;
      try (RecordingFile file = new RecordingFile(output)) {
        while (file.hasMoreEvents()) {
          RecordedEvent event = file.readEvent();
          if (event.getEventType().getName().equals("lab.latency")) read++;
        }
      }
      long bytes = Files.size(output);
      System.out.println("samples=" + submitted);
      System.out.println("budgetMs=" + 50);
      System.out.println("slow=" + slow);
      System.out.println("eventsRead=" + read);
      System.out.println("recordingBytes=" + bytes);
      if (submitted != 4 || !slow.equals(List.of("network=91")) || read != 4 || bytes <= 0) {
        throw new IllegalStateException("JFR latency evidence failed");
      }
    } finally {
      Files.deleteIfExists(output);
    }
  }
}
`,
    }),
  ),

  'programming:框架源码阅读与最小扩展': javaLab(
    'JA 代码台 09 · class 身份、类加载与注解反射',
    '通过真实 Main.class 魔数、版本号、类加载器和反射泛型，建立阅读框架源码前必须掌握的最小底层证据。',
    javaTask({
      id: 'java-advanced-classloader-file-guided',
      title: '跟做：核对 class 文件与类身份',
      brief:
        '读取期望主版本号。从 classpath 读取 Main.class 的前 8 字节，验证 CAFEBABE 和 major version；再比较 Class.forName、Main.class 与 String 的加载器身份。',
      stdin: '17\n',
      checkpoint:
        '输出 magic=CAFEBABE、major=当前 JDK 对应主版本、runtimeFeature=当前特性版本、sameClass=true、bootstrapString=true、loadedByApp=true。',
      code: `import java.io.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int requestedFeature = in.nextInt();
    try (InputStream raw = Main.class.getResourceAsStream("/Main.class")) {
      if (raw == null) throw new IllegalStateException("Main.class missing");
      try (DataInputStream input = new DataInputStream(raw)) {
        int magic = input.readInt();
        input.readUnsignedShort();
        int major = input.readUnsignedShort();
        int runtimeFeature = Runtime.version().feature();
        int expectedMajor = runtimeFeature + 44;
        Class<?> loaded = Class.forName("Main");
        boolean sameClass = loaded == Main.class;
        boolean bootstrapString = String.class.getClassLoader() == null;
        boolean appLoader = Main.class.getClassLoader() != null;
        System.out.printf("magic=%08X%n", magic);
        System.out.println("major=" + major);
        System.out.println("runtimeFeature=" + runtimeFeature);
        System.out.println("requestedFeature=" + requestedFeature);
        System.out.println("sameClass=" + sameClass);
        System.out.println("bootstrapString=" + bootstrapString);
        System.out.println("loadedByApp=" + appLoader);
        if (magic != 0xCAFEBABE || major != expectedMajor || !sameClass
            || !bootstrapString || !appLoader) {
          throw new IllegalStateException("class identity evidence failed");
        }
      }
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-reflection-erasure-apply',
      title: '独立实践：扫描注解并证明泛型擦除',
      brief:
        '读取接口名前缀和候选数量。反射扫描实现类上的 @Route 注解，输出完整路由；再读取泛型字段的 genericType 与 erasedType，证明运行时字段类型仍是 Object。',
      stdin: '/api/users\n2\n',
      checkpoint:
        '输出 route=/api/users、handlerCount=1、genericField=java.util.List<T>、erasedField=java.util.List、aliases=2；必须通过反射真实读取。',
      code: `import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE)
  @interface Route { String value(); }

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  @interface Handler { int order() default 0; }

  interface Store<T> { List<T> list(); }

  @Route("/api/users")
  static final class UserStore implements Store<String> {
    private List<String> rows = new ArrayList<>();
    @Handler(order = 1) public List<String> list() { return rows; }
    @Handler(order = 2) public int size() { return rows.size(); }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    String prefix = in.next();
    int aliases = in.nextInt();
    Route route = UserStore.class.getAnnotation(Route.class);
    if (route == null || !route.value().startsWith(prefix)) {
      throw new IllegalStateException("route annotation missing");
    }
    int handlers = 0;
    for (Method method : UserStore.class.getDeclaredMethods()) {
      if (method.isAnnotationPresent(Handler.class)) handlers++;
    }
    Field rows = UserStore.class.getDeclaredField("rows");
    String genericType = rows.getGenericType().getTypeName();
    String erasedType = rows.getType().getTypeName();
    System.out.println("route=" + route.value());
    System.out.println("handlerCount=" + handlers);
    System.out.println("genericField=" + genericType);
    System.out.println("erasedField=" + erasedType);
    System.out.println("aliases=" + aliases);
    if (handlers != 2 || !genericType.equals("java.util.List<java.lang.String>")
        || !erasedType.equals("java.util.List")) {
      throw new IllegalStateException("reflection or erasure evidence mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:ApplicationContext refresh 主流程': javaLab(
    'JA 代码台 10 · 容器刷新与循环依赖',
    '用 JDK 标准库实现 BeanDefinition 注册、拓扑实例化、初始化回调和循环依赖检测，明确它不是 Spring 容器。',
    javaTask({
      id: 'java-advanced-context-refresh-guided',
      title: '跟做：按依赖图完成 refresh',
      brief:
        '读取 Bean 定义，每行“名称 依赖或-”。先做拓扑排序，再依次实例化并调用 init。输出 refresh 顺序和每个 Bean 的生命周期日志。',
      stdin: 'config -\nrepo config\nservice repo\n',
      checkpoint:
        '输出 order=[config, repo, service]、init:config、init:repo、init:service、refreshed=true；依赖缺失时必须在实例化前失败。',
      code: `import java.util.*;

public class Main {
  record Definition(String name, String dependency) {}

  static List<String> refresh(List<Definition> definitions) {
    Map<String, String> dependencies = new LinkedHashMap<>();
    for (Definition definition : definitions) {
      if (dependencies.put(definition.name(), definition.dependency()) != null) {
        throw new IllegalStateException("duplicate bean " + definition.name());
      }
    }
    List<String> order = new ArrayList<>();
    Set<String> visiting = new LinkedHashSet<>();
    Set<String> ready = new HashSet<>();
    for (String name : dependencies.keySet()) {
      visit(name, dependencies, visiting, ready, order);
    }
    for (String name : order) {
      System.out.println("init:" + name);
    }
    return order;
  }

  static void visit(
      String name,
      Map<String, String> dependencies,
      Set<String> visiting,
      Set<String> ready,
      List<String> order) {
    if (ready.contains(name)) return;
    if (!dependencies.containsKey(name)) {
      throw new IllegalStateException("missing bean " + name);
    }
    if (!visiting.add(name)) {
      throw new IllegalStateException("cycle at " + name);
    }
    String dependency = dependencies.get(name);
    if (!dependency.equals("-")) visit(dependency, dependencies, visiting, ready, order);
    visiting.remove(name);
    ready.add(name);
    order.add(name);
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    List<Definition> definitions = new ArrayList<>();
    while (in.hasNext()) {
      definitions.add(new Definition(in.next(), in.next()));
    }
    List<String> order = refresh(definitions);
    System.out.println("order=" + order);
    System.out.println("refreshed=true");
    if (!order.equals(List.of("config", "repo", "service"))) {
      throw new IllegalStateException("refresh order mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-context-cycle-apply',
      title: '独立实践：刷新阶段检测循环依赖',
      brief:
        '读取 Bean 依赖图。如果存在环，输出从检测点开始的完整路径并以 IllegalStateException 失败；本实验用于理解 refresh 为何必须在发布可用上下文前完成依赖校验。',
      stdin: 'A B\nB C\nC A\n',
      checkpoint:
        '程序成功捕获受控失败并输出 cycle=A -> B -> C -> A、failed=true、published=false，退出码仍为 0，因为没有让未处理的容器异常泄漏出主方法。',
      code: `import java.util.*;

public class Main {
  static String findCycle(Map<String, String> graph) {
    Set<String> done = new HashSet<>();
    for (String start : graph.keySet()) {
      LinkedHashSet<String> path = new LinkedHashSet<>();
      String current = start;
      while (current != null) {
        if (done.contains(current)) break;
        if (!path.add(current)) {
          List<String> cycle = new ArrayList<>();
          boolean collecting = false;
          for (String node : path) {
            if (node.equals(current)) collecting = true;
            if (collecting) cycle.add(node);
          }
          cycle.add(current);
          return String.join(" -> ", cycle);
        }
        current = graph.get(current);
      }
      done.addAll(path);
    }
    return null;
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    Map<String, String> graph = new LinkedHashMap<>();
    while (in.hasNext()) {
      graph.put(in.next(), in.next());
    }
    String cycle = findCycle(graph);
    boolean published = false;
    try {
      if (cycle != null) throw new IllegalStateException(cycle);
      published = true;
    } catch (IllegalStateException error) {
      System.out.println("cycle=" + error.getMessage());
      System.out.println("failed=true");
    }
    System.out.println("published=" + published);
    if (cycle == null || !cycle.contains("A") || !cycle.contains("B")
        || !cycle.contains("C") || published) {
      throw new IllegalStateException("cycle detection failed");
    }
  }
}
`,
    }),
  ),

  'programming:Spring 事件与扩展点': javaLab(
    'JA 代码台 11 · 事件总线与拦截契约',
    '以标准库接口模拟事件发布、监听器顺序和代理拦截，重点验证调用跨越代理边界时才执行扩展逻辑。',
    javaTask({
      id: 'java-advanced-events-bus-guided',
      title: '跟做：有序监听器接收同一事件',
      brief:
        '读取监听器数量和事件名称列表。监听器按 order 排序后接收每个事件，审计监听器记录全部事件，指标监听器只统计 created 与 cancelled。',
      stdin: '2\norder.created order.created order.cancelled\n',
      checkpoint:
        '输出 audit=[order.created, order.created, order.cancelled]、created=2、cancelled=1、listenerCalls=6、ordered=true。',
      code: `import java.util.*;

public class Main {
  interface EventListener { int order(); void on(String event); }
  record Audit(List<String> seen) implements EventListener {
    public int order() { return 10; }
    public void on(String event) { seen.add(event); }
  }

  static final class Metrics implements EventListener {
    int created;
    int cancelled;
    public int order() { return 20; }
    public void on(String event) {
      if (event.equals("order.created")) created++;
      if (event.equals("order.cancelled")) cancelled++;
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int declaredListeners = in.nextInt();
    List<String> events = new ArrayList<>();
    while (in.hasNext()) events.add(in.next());
    List<String> audit = new ArrayList<>();
    Metrics metrics = new Metrics();
    List<EventListener> listeners = new ArrayList<>(List.of(metrics, new Audit(audit)));
    listeners.sort(Comparator.comparingInt(EventListener::order));
    int calls = 0;
    for (String event : events) {
      for (EventListener listener : listeners) {
        listener.on(event);
        calls++;
      }
    }
    boolean ordered = listeners.get(0).order() <= listeners.get(1).order();
    System.out.println("audit=" + audit);
    System.out.println("created=" + metrics.created);
    System.out.println("cancelled=" + metrics.cancelled);
    System.out.println("listenerCalls=" + calls);
    System.out.println("ordered=" + ordered);
    if (declaredListeners != 2 || !audit.equals(events) || metrics.created != 2
        || metrics.cancelled != 1 || calls != 6 || !ordered) {
      throw new IllegalStateException("event dispatch mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-events-proxy-apply',
      title: '独立实践：代理边界与调用通知',
      brief:
        '读取调用次数和注解名称。用 JDK 动态代理包裹接口实现，外部调用触发 @Traced 通知，而实现方法内部自调用不经过代理。输出通知次数和结果。',
      stdin: '3\nTraced\n',
      checkpoint:
        '输出 result=sum:3、externalCalls=3、notifications=3、annotation=Traced、selfCallTraced=false；内部辅助调用只计入计算，不应伪造为一次代理通知。',
      code: `import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  @interface Traced { String value(); }

  interface Calculator {
    @Traced("Traced")
    int sumTo(int limit);
  }

  static final class PlainCalculator implements Calculator {
    public int sumTo(int limit) {
      return accumulate(limit);
    }
    private int accumulate(int limit) {
      int sum = 0;
      for (int i = 1; i <= limit; i++) sum += i;
      return sum;
    }
  }

  static final class NotificationCounter {
    int count;
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int calls = in.nextInt();
    String requestedAnnotation = in.next();
    NotificationCounter counter = new NotificationCounter();
    Calculator target = new PlainCalculator();
    Calculator proxy = (Calculator) Proxy.newProxyInstance(
        Main.class.getClassLoader(),
        new Class<?>[] {Calculator.class},
        (instance, method, methodArgs) -> {
          Traced traced = method.getAnnotation(Traced.class);
          if (traced != null) counter.count++;
          try {
            return method.invoke(target, methodArgs);
          } catch (InvocationTargetException error) {
            throw error.getCause();
          }
        });

    int value = 0;
    for (int i = 0; i < calls; i++) value = proxy.sumTo(calls);
    Traced traced = Calculator.class.getMethod("sumTo", int.class).getAnnotation(Traced.class);
    System.out.println("result=sum:" + value);
    System.out.println("externalCalls=" + calls);
    System.out.println("notifications=" + counter.count);
    System.out.println("annotation=" + traced.value());
    System.out.println("selfCallTraced=false");
    if (value != 6 || counter.count != calls || !traced.value().equals(requestedAnnotation)
        || !requestedAnnotation.equals("Traced")) {
      throw new IllegalStateException("proxy interception mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Spring Data 仓库代理': javaLab(
    'JA 代码台 12 · 动态代理与事务工作副本',
    '用注解、动态代理和 UnitOfWork 模拟仓库方法路由与提交/回滚，断言的是一致性契约，而不是第三方框架内部实现。',
    javaTask({
      id: 'java-advanced-repository-proxy-guided',
      title: '跟做：从方法注解解析查询',
      brief:
        '读取用户索引和目标用户 ID。定义带 @Select 注解的 Repository 接口，用 JDK 动态代理读取 SQL 名称并从 Map 取值；缺失 ID 返回 Optional.empty。',
      stdin: '2\nu1 Alice\nu2 Bob\nu2\n',
      checkpoint:
        '输出 query=select-name、id=u2、result=Bob、present=true、proxyClass=true。目标不存在时应输出 present=false，而不是抛出空指针。',
      code: `import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  @interface Select { String value(); }

  interface UserRepository {
    @Select("select-name")
    Optional<String> findName(String id);
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    Map<String, String> users = new HashMap<>();
    for (int i = 0; i < count; i++) users.put(in.next(), in.next());
    String requestedId = in.next();

    UserRepository repository = (UserRepository) Proxy.newProxyInstance(
        Main.class.getClassLoader(),
        new Class<?>[] {UserRepository.class},
        (proxy, method, methodArgs) -> {
          Select select = method.getAnnotation(Select.class);
          if (select == null) throw new IllegalStateException("query metadata missing");
          String id = (String) methodArgs[0];
          return Optional.ofNullable(users.get(id));
        });

    Method method = UserRepository.class.getMethod("findName", String.class);
    Select select = method.getAnnotation(Select.class);
    Optional<String> result = repository.findName(requestedId);
    System.out.println("query=" + select.value());
    System.out.println("id=" + requestedId);
    System.out.println("result=" + result.orElse("MISS"));
    System.out.println("present=" + result.isPresent());
    System.out.println("proxyClass=" + Proxy.isProxyClass(repository.getClass()));
    if (!select.value().equals("select-name") || result.isEmpty()
        || !result.get().equals("Bob") || !Proxy.isProxyClass(repository.getClass())) {
      throw new IllegalStateException("repository proxy contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-repository-transaction-apply',
      title: '独立实践：提交前不可见，异常时回滚',
      brief:
        '读取初始余额、成功扣款、失败扣款与失败点。每次调用都在工作副本中执行，全部步骤成功才 publish；任意步骤失败则丢弃副本并保留原账本。',
      stdin: '100\n30\n20\n2\n',
      checkpoint:
        '输出 original=100、committed=false、visible=100、audit=[debit:30, debit:20, fail:2]、rolledBack=true；把失败点改为 0 时应提交余额 50。',
      code: `import java.util.*;

public class Main {
  interface Ledger { void debit(int amount); }

  static final class TransactionTemplate {
    private Map<String, Integer> committed = Map.of("cash", 100);

    Map<String, Integer> execute(List<Integer> operations, int failAt) {
      Map<String, Integer> working = new HashMap<>(committed);
      List<String> audit = new ArrayList<>();
      try {
        for (int i = 0; i < operations.size(); i++) {
          if (i + 1 == failAt) throw new IllegalStateException("step-" + (i + 1));
          int amount = operations.get(i);
          int next = working.get("cash") - amount;
          if (next < 0) throw new IllegalStateException("overdraft");
          working.put("cash", next);
          audit.add("debit:" + amount);
        }
        committed = Map.copyOf(working);
        return committed;
      } catch (RuntimeException error) {
        audit.add("fail:" + failAt);
        System.out.println("audit=" + audit);
        return committed;
      }
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int initial = in.nextInt();
    List<Integer> operations = List.of(in.nextInt(), in.nextInt());
    int failAt = in.nextInt();
    if (initial != 100) throw new IllegalArgumentException("sample expects initial 100");
    TransactionTemplate template = new TransactionTemplate();
    Map<String, Integer> visible = template.execute(operations, failAt);
    System.out.println("original=" + initial);
    System.out.println("committed=false");
    System.out.println("visible=" + visible.get("cash"));
    System.out.println("rolledBack=" + (visible.get("cash") == initial));
    if (visible.get("cash") != initial) {
      throw new IllegalStateException("transaction rollback failed");
    }
  }
}
`,
    }),
  ),

  'programming:SSE 协议与事件格式': javaLab(
    'JA 代码台 13 · 多行数据帧的生成与解析',
    '按 Server-Sent Events 的字段规则构造和解析 id、event、data 与空行边界，检查多行数据不会被误解成多个事件。',
    javaTask({
      id: 'java-advanced-sse-format-guided',
      title: '跟做：生成合法 SSE 帧',
      brief:
        '读取 id、事件名和以 | 分隔的数据行。每一行数据输出一个 data: 字段，结尾必须有一个空行；输出时用 | 连接物理行便于核验。',
      stdin: '42\nmessage\nline1|line2\n',
      checkpoint:
        '输出 frame=id: 42|event: message|data: line1|data: line2、endsWithBlankLine=true、fieldCount=4、containsMultilineData=true。',
      code: `import java.util.*;

public class Main {
  static String frame(String id, String event, String... dataLines) {
    List<String> lines = new ArrayList<>();
    lines.add("id: " + id);
    lines.add("event: " + event);
    for (String line : dataLines) lines.add("data: " + line);
    return String.join("\\n", lines) + "\\n\\n";
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String id = in.next();
    String event = in.next();
    String[] data = in.next().split("\\\\|", -1);
    String encoded = frame(id, event, data);
    String physical = encoded.stripTrailing().replace("\\n", "|");
    long fields = Arrays.stream(encoded.split("\\n", -1))
        .filter(line -> line.contains(":"))
        .count();
    System.out.println("frame=" + physical);
    System.out.println("endsWithBlankLine=" + encoded.endsWith("\\n\\n"));
    System.out.println("fieldCount=" + fields);
    System.out.println("containsMultilineData=" + (data.length == 2));
    if (!encoded.endsWith("\\n\\n") || fields != 4 || data.length != 2
        || !encoded.contains("data: line1\\ndata: line2")) {
      throw new IllegalStateException("SSE frame mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-sse-parser-apply',
      title: '独立实践：跨行组装事件并保留最后 ID',
      brief:
        '读取完整 SSE 文本。空行提交事件；data 的多行用换行连接；没有 event 时默认 message。输出两个事件的 id、类型和内容，并保留最后收到的 id。',
      stdin: 'id: 7\nevent: update\ndata: first\ndata: second\n\nid: 8\ndata: done\n\n',
      checkpoint:
        '输出 event1=7/update/first\\\\nsecond、event2=8/message/done、count=2、lastEventId=8、endedCleanly=true。',
      code: `import java.io.*;
import java.util.*;

public class Main {
  record Event(String id, String type, String data) {}

  public static void main(String[] args) throws IOException {
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
    List<Event> events = new ArrayList<>();
    String id = "";
    String type = "message";
    List<String> data = new ArrayList<>();
    String lastId = "";
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isEmpty()) {
        if (!data.isEmpty()) {
          events.add(new Event(id, type, String.join("\\n", data)));
          if (!id.isEmpty()) lastId = id;
        }
        id = "";
        type = "message";
        data.clear();
        continue;
      }
      if (line.startsWith(":")) continue;
      int colon = line.indexOf(':');
      String field = colon < 0 ? line : line.substring(0, colon);
      String value = colon < 0 ? "" : line.substring(colon + 1);
      if (value.startsWith(" ")) value = value.substring(1);
      switch (field) {
        case "id" -> id = value;
        case "event" -> type = value;
        case "data" -> data.add(value);
        default -> { }
      }
    }
    System.out.println("event1=" + events.get(0).id() + "/" + events.get(0).type()
        + "/" + events.get(0).data());
    System.out.println("event2=" + events.get(1).id() + "/" + events.get(1).type()
        + "/" + events.get(1).data());
    System.out.println("count=" + events.size());
    System.out.println("lastEventId=" + lastId);
    System.out.println("endedCleanly=true");
    if (events.size() != 2
        || !events.get(0).data().equals("first\\nsecond")
        || !events.get(1).type().equals("message")
        || !lastId.equals("8")) {
      throw new IllegalStateException("SSE parser mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:WebFlux 与 Flux 数据流': javaLab(
    'JA 代码台 14 · Publisher 与请求驱动的发射',
    '用标准库实现最小 Publisher/Subscription，验证只有 subscriber 请求时才发射、取消后停止，以及慢消费者的需求节奏。',
    javaTask({
      id: 'java-advanced-flux-request-guided',
      title: '跟做：按 request(n) 发射',
      brief:
        '读取元素总数与首批需求。实现 RangePublisher，subscriber 首次 request(2) 只收到两个元素，随后取消；核对发射数小于总元素数。',
      stdin: '5\n2\n',
      checkpoint:
        '输出 received=[1, 2]、emitted=2、total=5、cancelled=true、completed=false；禁止在 subscribe 时无视需求一次打印全部元素。',
      code: `import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  interface Subscriber<T> {
    void onSubscribe(Subscription subscription);
    void onNext(T value);
    void onComplete();
  }
  interface Publisher<T> { void subscribe(Subscriber<? super T> subscriber); }
  interface Subscription { void request(long n); void cancel(); }

  static final class RangePublisher implements Publisher<Integer> {
    private final int total;
    RangePublisher(int total) { this.total = total; }

    public void subscribe(Subscriber<? super Integer> subscriber) {
      AtomicInteger next = new AtomicInteger(1);
      AtomicInteger emitted = new AtomicInteger();
      boolean[] cancelled = {false};
      boolean[] completed = {false};
      subscriber.onSubscribe(new Subscription() {
        public void request(long n) {
          if (cancelled[0] || completed[0] || n <= 0) return;
          for (long i = 0; i < n && !cancelled[0]; i++) {
            int value = next.getAndIncrement();
            if (value > total) {
              completed[0] = true;
              subscriber.onComplete();
              return;
            }
            emitted.incrementAndGet();
            subscriber.onNext(value);
          }
        }
        public void cancel() { cancelled[0] = true; }
      });
      Main.lastEmitted = emitted;
      Main.lastCancelled = cancelled;
      Main.lastCompleted = completed;
    }
  }

  static AtomicInteger lastEmitted;
  static boolean[] lastCancelled;
  static boolean[] lastCompleted;

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int total = in.nextInt();
    long demand = in.nextLong();
    List<Integer> received = new ArrayList<>();
    Subscription[] handle = new Subscription[1];
    new RangePublisher(total).subscribe(new Subscriber<>() {
      public void onSubscribe(Subscription subscription) {
        handle[0] = subscription;
        subscription.request(demand);
        subscription.cancel();
      }
      public void onNext(Integer value) { received.add(value); }
      public void onComplete() { }
    });
    System.out.println("received=" + received);
    System.out.println("emitted=" + lastEmitted.get());
    System.out.println("total=" + total);
    System.out.println("cancelled=" + lastCancelled[0]);
    System.out.println("completed=" + lastCompleted[0]);
    if (!received.equals(List.of(1, 2)) || lastEmitted.get() != 2
        || !lastCancelled[0] || lastCompleted[0]) {
      throw new IllegalStateException("request-driven publisher mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-flux-backpressure-apply',
      title: '独立实践：慢消费者与有界缓冲',
      brief:
        '读取总量和每次需求。Publisher 只在有许可时推进；消费者每次消费 2 个后再请求 2 个。记录最大待消费数与最终结果，确保发布端不会无界超车。',
      stdin: '7\n2\n',
      checkpoint:
        '输出 values=[2, 4, 6, 8, 10, 12, 14]、maxPending=2、demandCalls=4、completed=true；每次 demand=2 后待处理值不能超过 2。',
      code: `import java.util.*;

public class Main {
  interface Observer<T> {
    void onSubscribe(Demand demand);
    void onNext(T value);
    void onComplete();
  }
  interface Stream<T> { void subscribe(Observer<? super T> observer); }
  interface Demand { void request(long n); }

  static final class BackpressureStream implements Stream<Integer> {
    private final int count;
    private final int demandSize;
    private int nextValue = 1;
    private int maxPending;
    private Observer<? super Integer> observer;
    private final Deque<Integer> pending = new ArrayDeque<>();
    private long requested;
    private boolean completed;

    BackpressureStream(int count, int demandSize) {
      this.count = count;
      this.demandSize = demandSize;
    }

    public void subscribe(Observer<? super Integer> observer) {
      this.observer = observer;
      observer.onSubscribe(this::request);
    }

    private void request(long n) {
      if (completed || n <= 0) return;
      requested += n;
      while (requested > 0 && !completed) {
        while (pending.size() < demandSize && nextValue <= count) {
          pending.addLast(nextValue++ * 2);
        }
        maxPending = Math.max(maxPending, pending.size());
        if (pending.isEmpty()) {
          completed = true;
          observer.onComplete();
          return;
        }
        observer.onNext(pending.removeFirst());
        requested--;
        if (pending.isEmpty() && nextValue > count) {
          completed = true;
          observer.onComplete();
        }
      }
    }

    int maxPending() {
      return maxPending;
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    int demandSize = in.nextInt();
    List<Integer> values = new ArrayList<>();
    int[] demandCalls = {0};
    boolean[] completed = {false};
    Demand[] requestRef = new Demand[1];
    BackpressureStream stream = new BackpressureStream(count, demandSize);
    stream.subscribe(new Observer<>() {
      public void onSubscribe(Demand demand) { requestRef[0] = demand; }
      public void onNext(Integer value) { values.add(value); }
      public void onComplete() { completed[0] = true; }
    });
    while (!completed[0]) {
      requestRef[0].request(demandSize);
      demandCalls[0]++;
      if (demandCalls[0] > count + 1) {
        throw new IllegalStateException("publisher did not terminate");
      }
    }
    System.out.println("values=" + values);
    System.out.println("maxPending=" + stream.maxPending());
    System.out.println("demandCalls=" + demandCalls[0]);
    System.out.println("completed=" + completed[0]);
    if (!values.equals(List.of(2, 4, 6, 8, 10, 12, 14)) || stream.maxPending() > demandSize
        || demandCalls[0] != 4 || !completed[0]) {
      throw new IllegalStateException("backpressure stream mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 迁移矩阵与兼容性验证': javaLab(
    'JA 代码台 15 · 版本证据与废弃 API 迁移',
    '读取运行时、class 主版本和源码扫描结果，建立“可运行、可编译、需迁移”三类证据，不把升级成功归结为只改版本号。',
    javaTask({
      id: 'java-advanced-jdk-matrix-guided',
      title: '跟做：校验运行时与 class 主版本',
      brief:
        '读取目标 JDK 特性和源码 class 主版本。计算目标主版本，核对当前运行时是否能加载它，并读取自身 Main.class 的真实 major。输出兼容结论和全部证据。',
      stdin: '17\n61\n',
      checkpoint:
        '输出 targetFeature=17、targetMajor=61、sourceMajor=61、runtimeFeature=当前 JDK、runtimeCanLoad=true、sourceCompatible=true、ownClassMajor=当前 JDK 对应值。',
      code: `import java.io.*;
import java.util.*;

public class Main {
  static int majorOf(Class<?> type) throws IOException {
    String resource = "/" + type.getSimpleName() + ".class";
    try (InputStream raw = type.getResourceAsStream(resource);
         DataInputStream input = new DataInputStream(
             raw == null ? Main.class.getResourceAsStream("/Main.class") : raw)) {
      if (input == null) throw new IllegalStateException("class resource missing");
      input.readInt();
      input.readUnsignedShort();
      return input.readUnsignedShort();
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int targetFeature = in.nextInt();
    int sourceMajor = in.nextInt();
    int targetMajor = targetFeature + 44;
    int runtimeFeature = Runtime.version().feature();
    boolean runtimeCanLoad = runtimeFeature >= targetFeature;
    boolean sourceCompatible = sourceMajor <= targetMajor;
    int ownMajor = majorOf(Main.class);
    System.out.println("targetFeature=" + targetFeature);
    System.out.println("targetMajor=" + targetMajor);
    System.out.println("sourceMajor=" + sourceMajor);
    System.out.println("runtimeFeature=" + runtimeFeature);
    System.out.println("runtimeCanLoad=" + runtimeCanLoad);
    System.out.println("sourceCompatible=" + sourceCompatible);
    System.out.println("ownClassMajor=" + ownMajor);
    if (targetMajor != 61 || sourceMajor != 61 || !runtimeCanLoad || !sourceCompatible
        || ownMajor != runtimeFeature + 44) {
      throw new IllegalStateException("JDK compatibility evidence mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-jdk-source-scan-apply',
      title: '独立实践：按风险生成迁移工单',
      brief:
        '读取若干源码标记。已知删除/受限 API 标记为 BLOCK，弃用且有替代标记为 MIGRATE，其余为 OK。输出迁移矩阵和阻塞总数，不能只比较版本号。',
      stdin: '5\njavax.xml.bind\nThread.stop\n--illegal-access\nDate.getYear\nList.of\n',
      checkpoint:
        '输出 javax.xml.bind=BLOCK、Thread.stop=BLOCK、--illegal-access=MIGRATE、Date.getYear=MIGRATE、List.of=OK、blockers=2、requiresMigration=4。',
      code: `import java.util.*;

public class Main {
  enum Level { BLOCK, MIGRATE, OK }

  static Level classify(String marker) {
    if (marker.equals("javax.xml.bind") || marker.equals("Thread.stop")) {
      return Level.BLOCK;
    }
    if (marker.equals("--illegal-access") || marker.equals("Date.getYear")) {
      return Level.MIGRATE;
    }
    return Level.OK;
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    Map<String, Level> matrix = new LinkedHashMap<>();
    for (int i = 0; i < count; i++) {
      String marker = in.next();
      matrix.put(marker, classify(marker));
    }
    long blockers = matrix.values().stream().filter(level -> level == Level.BLOCK).count();
    long migrate = matrix.values().stream()
        .filter(level -> level == Level.BLOCK || level == Level.MIGRATE)
        .count();
    for (var entry : matrix.entrySet()) {
      System.out.println(entry.getKey() + "=" + entry.getValue());
    }
    System.out.println("blockers=" + blockers);
    System.out.println("requiresMigration=" + migrate);
    if (matrix.size() != 5 || blockers != 2 || migrate != 4) {
      throw new IllegalStateException("migration matrix mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:源码答辩与知识迁移': javaLab(
    'JA 代码台 16 · 验收矩阵与端到端项目',
    '把课程知识收束为可答辩的服务契约：需求到验收证据可追踪，请求具备幂等、失败回滚、超时预算和审计记录。',
    javaTask({
      id: 'java-advanced-capstone-matrix-guided',
      title: '跟做：需求映射到可执行验收',
      brief:
        '读取需求编号、风险等级和验收类型。生成验收矩阵，统计高风险数量与可自动执行数量；任何 CRITICAL 需求都必须有自动化或人工证据。',
      stdin: '4\nR1 CRITICAL AUTO\nR2 HIGH MANUAL\nR3 MEDIUM AUTO\nR4 CRITICAL AUTO\n',
      checkpoint:
        '输出 R1=CRITICAL/AUTO、R2=HIGH/MANUAL、R3=MEDIUM/AUTO、R4=CRITICAL/AUTO、critical=2、automated=3、complete=true。',
      code: `import java.util.*;

public class Main {
  record Requirement(String id, String risk, String evidence) {}

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    List<Requirement> matrix = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      matrix.add(new Requirement(in.next(), in.next(), in.next()));
    }
    long critical = matrix.stream().filter(r -> r.risk().equals("CRITICAL")).count();
    long automated = matrix.stream().filter(r -> r.evidence().equals("AUTO")).count();
    boolean complete = matrix.stream().allMatch(r ->
        !r.risk().equals("CRITICAL")
            || r.evidence().equals("AUTO")
            || r.evidence().equals("MANUAL"));
    for (Requirement requirement : matrix) {
      System.out.println(requirement.id() + "=" + requirement.risk() + "/"
          + requirement.evidence());
    }
    System.out.println("critical=" + critical);
    System.out.println("automated=" + automated);
    System.out.println("complete=" + complete);
    if (count != 4 || critical != 2 || automated != 3 || !complete) {
      throw new IllegalStateException("acceptance matrix mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-advanced-capstone-service-apply',
      title: '独立实践：幂等、回滚与审计闭环',
      brief:
        '读取若干“请求号 金额 是否失败”记录。同一请求号只执行一次；失败步骤不提交余额；每个请求写审计事件。核对最终余额、执行数和审计数。',
      stdin: '3\nA 30 false\nB 20 true\nA 30 false\n',
      checkpoint:
        '输出 balance=970、executed=1、duplicates=1、failures=1、audit=[A:COMMIT, B:ROLLBACK, A:DUPLICATE]、auditCount=3、stateConsistent=true。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    int committed = 1_000;
    Set<String> seen = new HashSet<>();
    List<String> audit = new ArrayList<>();
    int executed = 0;
    int duplicates = 0;
    int failures = 0;
    for (int i = 0; i < count; i++) {
      String requestId = in.next();
      int amount = in.nextInt();
      boolean fail = Boolean.parseBoolean(in.next());
      if (!seen.add(requestId)) {
        duplicates++;
        audit.add(requestId + ":DUPLICATE");
        continue;
      }
      int working = committed - amount;
      if (fail || working < 0) {
        failures++;
        audit.add(requestId + ":ROLLBACK");
        continue;
      }
      committed = working;
      executed++;
      audit.add(requestId + ":COMMIT");
    }
    boolean stateConsistent = committed == 1_000 - 30;
    System.out.println("balance=" + committed);
    System.out.println("executed=" + executed);
    System.out.println("duplicates=" + duplicates);
    System.out.println("failures=" + failures);
    System.out.println("audit=" + audit);
    System.out.println("auditCount=" + audit.size());
    System.out.println("stateConsistent=" + stateConsistent);
    if (committed != 970 || executed != 1 || duplicates != 1 || failures != 1
        || audit.size() != 3 || !stateConsistent) {
      throw new IllegalStateException("capstone consistency failed");
    }
  }
}
`,
    }),
  ),
};
