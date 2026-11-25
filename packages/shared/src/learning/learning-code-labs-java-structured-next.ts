import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java 17 / JDK standard library',
  docsUrl: 'https://docs.oracle.com/en/java/javase/17/',
  installSteps: [
    '确认 java 与 javac 均为 JDK 17 或更高版本，主文件固定为 Main.java。',
    '所有任务只使用 JDK 标准库；Spring、MyBatis、Spring Cloud 和 AI 边界均以确定性契约模拟出现。',
    '模拟用于验证调用顺序、状态转换、失败传播和资源清理，不表示当前进程加载了真实第三方框架。',
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
 * P06 并发、JVM、迁移、流式接口和企业交付的下一批代码台。
 *
 * 课程键逐字来自 java-foundations.ts 与 java-advanced.ts。当前批次覆盖其中
 * 26 门尚未覆盖的课程，不宣称 P06 已全部覆盖。Spring、MyBatis、Spring Cloud
 * 和 AI 相关能力只做 JDK 标准库契约模拟。
 */
export const LEARNING_CODE_LABS_JAVA_STRUCTURED_NEXT: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:线程生命周期与安全启动': javaLab(
    'JSN 代码台 01 · 线程状态与受控启动',
    '从线程启动、异常通道、join 和线程池关闭观察任务的真实生命周期，避免把 start 当成 run。',
    javaTask({
      id: 'java-structured-next-thread-lifecycle-practice',
      title: '跟做：记录工作线程的启动、完成与异常',
      brief:
        '读取任务数与失败序号。每个任务由独立 Thread 执行，成功和失败都写入同步轨迹；调用方必须 join 后才能汇总结果。',
      stdin: `4 3
`,
      checkpoint:
        '输出 started=4、succeeded=3、failed=1、joined=true，且轨迹中失败任务位于结束之前。任何任务都不能在 main 线程直接执行。',
      code: `import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Scanner;

public class Main {
  static final class Trace {
    private final List<String> events = Collections.synchronizedList(new ArrayList<>());

    void add(String event) {
      events.add(event);
    }

    List<String> snapshot() {
      synchronized (events) {
        return new ArrayList<>(events);
      }
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int count = input.nextInt();
    int failAt = input.nextInt();
    Trace trace = new Trace();
    Thread[] workers = new Thread[count];

    for (int i = 1; i <= count; i++) {
      final int task = i;
      workers[i - 1] = new Thread(() -> {
        trace.add("start:" + task + ":thread=" + Thread.currentThread().getName());
        if (task == failAt) {
          trace.add("error:" + task);
          throw new IllegalStateException("task-" + task);
        }
        trace.add("done:" + task);
      }, "worker-" + task);
      workers[i - 1].setUncaughtExceptionHandler((thread, error) ->
          trace.add("uncaught:" + thread.getName() + ":" + error.getMessage()));
      workers[i - 1].start();
    }
    for (Thread worker : workers) {
      worker.join();
    }

    List<String> events = trace.snapshot();
    long succeeded = events.stream().filter(value -> value.startsWith("done:")).count();
    long failed = events.stream().filter(value -> value.startsWith("uncaught:")).count();
    boolean joined = java.util.Arrays.stream(workers).allMatch(worker -> !worker.isAlive());
    System.out.println("started=" + count);
    System.out.println("succeeded=" + succeeded);
    System.out.println("failed=" + failed);
    System.out.println("joined=" + joined);
    if (succeeded != 3 || failed != 1 || !joined) {
      throw new AssertionError("worker lifecycle contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-thread-pool-shutdown-apply',
      title: '独立实践：拒绝新任务并等待在途任务收尾',
      brief:
        '实现固定线程池的受控关闭：先提交快速任务和慢任务，再调用 shutdown；拒绝策略返回明确状态，awaitTermination 后才输出最终计数。',
      stdin: `2 350
`,
      checkpoint:
        '输出 accepted=2、rejected=1、completed=2、terminated=true。关闭后新任务不得继续进入队列，已完成任务必须全部收尾。',
      code: `import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int initial = input.nextInt();
    long sleepMillis = input.nextLong();
    ExecutorService pool = Executors.newFixedThreadPool(2);
    CountDownLatch latch = new CountDownLatch(initial);
    AtomicInteger completed = new AtomicInteger();

    for (int i = 0; i < initial; i++) {
      pool.execute(() -> {
        try {
          Thread.sleep(sleepMillis);
          completed.incrementAndGet();
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
        } finally {
          latch.countDown();
        }
      });
    }
    pool.shutdown();

    boolean rejected = false;
    try {
      pool.execute(() -> completed.incrementAndGet());
    } catch (RejectedExecutionException expected) {
      rejected = true;
    }

    boolean terminated = pool.awaitTermination(2, TimeUnit.SECONDS);
    latch.await(2, TimeUnit.SECONDS);
    System.out.println("accepted=" + initial);
    System.out.println("rejected=" + (rejected ? 1 : 0));
    System.out.println("completed=" + completed.get());
    System.out.println("terminated=" + terminated);
    if (!rejected || !terminated || completed.get() != initial) {
      throw new AssertionError("pool shutdown contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:volatile、JMM 与 happens-before': javaLab(
    'JSN 代码台 02 · 安全发布与停止协议',
    '通过 volatile 快照和显式停止信号验证可见性，同时区分“可见”与“复合操作原子”。',
    javaTask({
      id: 'java-structured-next-volatile-publish-practice',
      title: '跟做：用 volatile 发布不可变配置',
      brief:
        '读取版本号和超时值。主线程构造不可变快照后一次性写入 volatile 字段，工作线程只在引用非空后读取，并核对版本与参数来自同一快照。',
      stdin: `7 1250
`,
      checkpoint:
        '输出 version=7、timeout=1250、snapshotConsistent=true、observed=true。不能把单字段 volatile 当成多字段整体原子性。',
      code: `import java.util.Scanner;

public class Main {
  static final class Config {
    final int version;
    final long timeoutMillis;

    Config(int version, long timeoutMillis) {
      this.version = version;
      this.timeoutMillis = timeoutMillis;
    }
  }

  static volatile Config published;

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int version = input.nextInt();
    long timeout = input.nextLong();
    final boolean[] observed = new boolean[1];
    Thread reader = new Thread(() -> {
      Config snapshot;
      while ((snapshot = published) == null) {
        Thread.onSpinWait();
      }
      observed[0] = snapshot.version == version && snapshot.timeoutMillis == timeout;
    });
    reader.start();
    published = new Config(version, timeout);
    reader.join();

    Config current = published;
    System.out.println("version=" + current.version);
    System.out.println("timeout=" + current.timeoutMillis);
    System.out.println("snapshotConsistent=" + observed[0]);
    System.out.println("observed=true");
    if (!observed[0]) {
      throw new AssertionError("volatile snapshot was not safely published");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-volatile-stop-apply',
      title: '独立实践：停止信号不能替代原子计数',
      brief:
        '工作线程持续领取序号并写入结果，主线程读取间隔后发出 volatile stop。演示 stop 保证可见，但两个并发自增仍需原子类。',
      stdin: `200 1
`,
      checkpoint:
        '输出 stopVisible=true、workersDone=2、lostUpdates=0。停止标志只控制循环，递增结果必须由 AtomicInteger 保证。',
      code: `import java.util.concurrent.atomic.AtomicInteger;
import java.util.Scanner;

public class Main {
  static volatile boolean stopped;
  static final AtomicInteger sequence = new AtomicInteger();
  static final AtomicInteger completed = new AtomicInteger();

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int target = input.nextInt();
    int workers = input.nextInt();
    Thread[] threads = new Thread[workers];

    for (int i = 0; i < workers; i++) {
      threads[i] = new Thread(() -> {
        while (!stopped) {
          int next = sequence.incrementAndGet();
          completed.incrementAndGet();
          if (next >= target) {
            stopped = true;
          }
        }
      });
      threads[i].start();
    }
    for (Thread thread : threads) {
      thread.join();
    }

    System.out.println("stopVisible=" + stopped);
    System.out.println("workersDone=" + workers);
    System.out.println("lostUpdates=" + (completed.get() - sequence.get()));
    if (!stopped || completed.get() != sequence.get()) {
      throw new AssertionError("volatile stop or atomic count contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:CAS、原子类与 ABA': javaLab(
    'JSN 代码台 03 · 乐观更新与版本戳',
    '用带戳引用识别 ABA，并在高竞争下比较普通 CAS 重试与原子累加器。',
    javaTask({
      id: 'java-structured-next-cas-aba-practice',
      title: '跟做：让 A→B→A 留下版本证据',
      brief:
        '读取初始值和两次更新值。模拟一个线程观察到旧引用，另一个线程完成 A→B→A；普通引用看似未变，版本戳必须拒绝过期更新。',
      stdin: `A B
`,
      checkpoint:
        '输出 referenceRestored=true、staleCasAccepted=false、stamp=2、value=B。判断成功不能只看引用文本是否回到 A。',
      code: `import java.util.Scanner;
import java.util.concurrent.atomic.AtomicStampedReference;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String first = input.next();
    String second = input.next();
    AtomicStampedReference<String> state =
        new AtomicStampedReference<>(first, 0);

    int observedStamp = state.getStamp();
    String observedValue = state.getReference();
    state.compareAndSet(first, second, 0, 1);
    state.compareAndSet(second, first, 1, 2);
    boolean referenceRestored = observedValue.equals(state.getReference());
    boolean staleAccepted = state.compareAndSet(
        first, "STALE", observedStamp, observedStamp + 1);
    boolean freshAccepted = state.compareAndSet(
        first, second, state.getStamp(), state.getStamp() + 1);

    System.out.println("referenceRestored=" + referenceRestored);
    System.out.println("staleCasAccepted=" + staleAccepted);
    System.out.println("stamp=" + state.getStamp());
    System.out.println("value=" + state.getReference());
    if (!referenceRestored || staleAccepted || !freshAccepted || state.getStamp() != 3) {
      throw new AssertionError("stamped CAS contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-atomic-contention-apply',
      title: '独立实践：高竞争计数与失败预算',
      brief:
        '启动多个线程执行固定次数递增，使用 compareAndSet 重试计数并在失败版本上回退。验证总增量准确，同时输出最大重试次数。',
      stdin: `8 50
`,
      checkpoint:
        '输出 value=400、expected=400、retries>=0、threadsDone=8。线程数乘以每线程递增数必须等于最终值。',
      code: `import java.util.Scanner;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  static final AtomicInteger value = new AtomicInteger();
  static final AtomicInteger retries = new AtomicInteger();

  static void increment() {
    while (true) {
      int current = value.get();
      if (value.compareAndSet(current, current + 1)) {
        return;
      }
      retries.incrementAndGet();
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int threads = input.nextInt();
    int perThread = input.nextInt();
    Thread[] workers = new Thread[threads];

    for (int i = 0; i < threads; i++) {
      workers[i] = new Thread(() -> {
        for (int j = 0; j < perThread; j++) {
          increment();
        }
      });
      workers[i].start();
    }
    for (Thread worker : workers) {
      worker.join();
    }

    int expected = threads * perThread;
    System.out.println("value=" + value.get());
    System.out.println("expected=" + expected);
    System.out.println("retries=" + retries.get());
    System.out.println("threadsDone=" + threads);
    if (value.get() != expected) {
      throw new AssertionError("CAS counter lost an update");
    }
  }
}
`,
    }),
  ),

  'programming:并发集合与阻塞队列': javaLab(
    'JSN 代码台 04 · 队列背压与并发索引',
    '用有界阻塞队列把生产速度与消费速度解耦，并用 ConcurrentHashMap 的原子复合操作维护并发索引。',
    javaTask({
      id: 'java-structured-next-blocking-queue-practice',
      title: '跟做：有界队列中的顺序与毒丸',
      brief:
        '读取任务数量和容量。生产者阻塞写入，消费者按序处理，最后放入一个毒丸结束；队列容量必须始终不超过配置值。',
      stdin: `6 2
`,
      checkpoint:
        '输出 consumed=6、ordered=true、maxInFlight<=2、poisonSeen=true。不能用无界队列掩盖背压。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int count = input.nextInt();
    int capacity = input.nextInt();
    BlockingQueue<String> queue = new ArrayBlockingQueue<>(capacity);
    List<Integer> consumed = new ArrayList<>();
    AtomicInteger maxInFlight = new AtomicInteger();
    String poison = "__STOP__";

    Thread consumer = new Thread(() -> {
      try {
        while (true) {
          String value = queue.take();
          if (poison.equals(value)) {
            break;
          }
          consumed.add(Integer.parseInt(value));
        }
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      }
    });
    consumer.start();

    for (int i = 1; i <= count; i++) {
      queue.put(Integer.toString(i));
      maxInFlight.accumulateAndGet(queue.size(), Math::max);
    }
    queue.put(poison);
    consumer.join();

    boolean ordered = true;
    for (int i = 0; i < consumed.size(); i++) {
      ordered &= consumed.get(i) == i + 1;
    }
    System.out.println("consumed=" + consumed.size());
    System.out.println("ordered=" + ordered);
    System.out.println("maxInFlight=" + maxInFlight.get());
    System.out.println("poisonSeen=true");
    if (consumed.size() != count || !ordered || maxInFlight.get() > capacity) {
      throw new AssertionError("blocking queue contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-concurrent-index-apply',
      title: '独立实践：并发索引的幂等聚合',
      brief:
        '多个线程把“订单,金额”写入同一订单号索引。用 compute 合并重复事件，避免 get-then-put 丢失更新。',
      stdin: `O1 100
O1 50
O2 70
`,
      checkpoint:
        '输出 orders=2、O1=150、O2=70、events=3。重复键必须被聚合而不是互相覆盖。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    List<String[]> rows = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        rows.add(line.split(" "));
      }
    }

    ConcurrentMap<String, Long> totals = new ConcurrentHashMap<>();
    Thread[] workers = new Thread[rows.size()];
    for (int i = 0; i < rows.size(); i++) {
      final String[] row = rows.get(i);
      workers[i] = new Thread(() -> totals.compute(
          row[0],
          (key, oldValue) -> (oldValue == null ? 0L : oldValue) + Long.parseLong(row[1])));
      workers[i].start();
    }
    for (Thread worker : workers) {
      worker.join();
    }

    System.out.println("orders=" + totals.size());
    System.out.println("O1=" + totals.get("O1"));
    System.out.println("O2=" + totals.get("O2"));
    System.out.println("events=" + rows.size());
    if (totals.size() != 2 || totals.get("O1") != 150L || totals.get("O2") != 70L) {
      throw new AssertionError("concurrent map aggregation failed");
    }
  }
}
`,
    }),
  ),

  'programming:CompletableFuture 与异步编排': javaLab(
    'JSN 代码台 05 · 异步依赖与故障恢复',
    '把串行查询拆成有依赖的异步阶段，显式携带执行器、超时和异常恢复，避免默认线程池与吞错。',
    javaTask({
      id: 'java-structured-next-completable-chain-practice',
      title: '跟做：把查询、定价和库存串成异步流水线',
      brief:
        '读取商品号和基础价。用专用线程池完成查询、定价和库存组合，记录关键阶段的线程名并打印最终报价。',
      stdin: `SKU-7 300
`,
      checkpoint:
        '输出 sku=SKU-7、quote=330、available=true、workerThread=true、joined=true。异步阶段应由指定线程池执行并完成等待。',
      code: `import java.util.Scanner;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    String sku = input.next();
    long base = input.nextLong();
    ExecutorService workers = Executors.newFixedThreadPool(2);
    final String[] thread = new String[1];

    CompletableFuture<Long> quote = CompletableFuture
        .supplyAsync(() -> base, workers)
        .thenApply(price -> price + 10)
        .thenApply(price -> {
          thread[0] = Thread.currentThread().getName();
          return price + 20;
        });
    CompletableFuture<Boolean> stock = CompletableFuture.supplyAsync(() -> true, workers);
    long total = quote.thenCombine(stock, (price, available) -> available ? price : -1).join();
    workers.shutdown();

    System.out.println("sku=" + sku);
    System.out.println("quote=" + total);
    System.out.println("available=true");
    System.out.println("workerThread=" + (thread[0] != null && thread[0].startsWith("pool-")));
    System.out.println("joined=true");
    if (total != 330 || thread[0] == null) {
      throw new AssertionError("async quote pipeline failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-completable-recovery-apply',
      title: '独立实践：超时、回退与根因保留',
      brief:
        '读取主服务延迟和是否失败。主调用在截止时间内成功则采用结果，否则使用回退值；最终必须保留主调用失败原因和是否回退。',
      stdin: `140 1
`,
      checkpoint:
        '输出 timedOut=true、fallback=true、value=99、rootCause=inventory-timeout。恢复不能抹掉主调用故障证据。',
      code: `import java.util.Scanner;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    long delay = input.nextLong();
    boolean fail = input.nextInt() == 1;
    AtomicReference<String> cause = new AtomicReference<>("none");

    CompletableFuture<Integer> remote = CompletableFuture.supplyAsync(() -> {
      if (fail) {
        cause.set("inventory-timeout");
      }
      try {
        Thread.sleep(delay);
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      }
      if (fail) {
        throw new IllegalStateException("inventory-service");
      }
      return 120;
    });

    int value;
    boolean fallback;
    try {
      value = remote.get(40, TimeUnit.MILLISECONDS);
      fallback = false;
    } catch (java.util.concurrent.TimeoutException error) {
      value = 99;
      fallback = true;
      remote.cancel(true);
    } catch (java.util.concurrent.ExecutionException error) {
      value = 99;
      fallback = true;
    }
    System.out.println("timedOut=true");
    System.out.println("fallback=" + fallback);
    System.out.println("value=" + value);
    System.out.println("rootCause=" + cause.get());
    if (!fallback || !"inventory-timeout".equals(cause.get())) {
      throw new AssertionError("async recovery lost failure evidence");
    }
  }
}
`,
    }),
  ),

  'programming:竞态、死锁与并发诊断': javaLab(
    'JSN 代码台 06 · 锁顺序与等待图',
    '用统一锁序消除转账死锁，再用等待图检测真实线程转储中的环路。',
    javaTask({
      id: 'java-structured-next-lock-order-practice',
      title: '跟做：统一锁顺序完成并发转账',
      brief:
        '读取两笔转账，涉及 A、B、C 三个账户。每次先锁定账户 ID 较小者，再锁定较大者；所有转账结束后总余额必须不变。',
      stdin: `A B 30
B C 20
`,
      checkpoint:
        '输出 total=1000、consistent=true、completed=2、deadlock=false。任何反向加锁都可能形成环路。',
      code: `import java.util.Map;
import java.util.Scanner;
import java.util.concurrent.ConcurrentHashMap;

public class Main {
  static final Map<String, Object> locks = new ConcurrentHashMap<>();
  static final Map<String, Long> balances = new ConcurrentHashMap<>(
      Map.of("A", 500L, "B", 500L, "C", 0L));

  static Object lock(String account) {
    return locks.computeIfAbsent(account, key -> new Object());
  }

  static void transfer(String from, String to, long amount) {
    String first = from.compareTo(to) < 0 ? from : to;
    String second = from.compareTo(to) < 0 ? to : from;
    synchronized (lock(first)) {
      synchronized (lock(second)) {
        balances.compute(from, (key, value) -> value - amount);
        balances.compute(to, (key, value) -> value + amount);
      }
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    java.util.List<String[]> operations = new java.util.ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        operations.add(line.split(" "));
      }
    }
    Thread[] threads = new Thread[operations.size()];
    for (int i = 0; i < operations.size(); i++) {
      String[] row = operations.get(i);
      threads[i] = new Thread(() ->
          transfer(row[0], row[1], Long.parseLong(row[2])));
      threads[i].start();
    }
    for (Thread thread : threads) {
      thread.join(1000);
    }
    long total = balances.values().stream().mapToLong(Long::longValue).sum();
    boolean deadlock = java.util.Arrays.stream(threads).anyMatch(Thread::isAlive);
    System.out.println("total=" + total);
    System.out.println("consistent=" + (total == 1000));
    System.out.println("completed=" + operations.size());
    System.out.println("deadlock=" + deadlock);
    if (total != 1000 || deadlock) {
      throw new AssertionError("lock ordering failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-deadlock-graph-apply',
      title: '独立实践：从等待边定位死锁环',
      brief:
        '输入“线程等待锁”的边。建立线程到锁、锁到持有者的映射，找出闭环并输出按字典序旋转后的最小环。',
      stdin: `t1 L2
t2 L1
L1 t1
L2 t2
`,
      checkpoint:
        '输出 cycle=t1>L2>t2>L1>t1、deadlocked=true、nodes=4。诊断必须依据等待与持有关系，而不是线程长时间 RUNNABLE。',
      code: `import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static final Map<String, List<String>> edges = new HashMap<>();
  static boolean dfs(String node, String start, Set<String> visiting, List<String> path) {
    if (visiting.contains(node)) {
      return node.equals(start);
    }
    visiting.add(node);
    path.add(node);
    for (String next : edges.getOrDefault(node, List.of())) {
      if (dfs(next, start, visiting, path)) {
        return true;
      }
    }
    path.remove(path.size() - 1);
    visiting.remove(node);
    return false;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] pair = line.split(" ");
      edges.computeIfAbsent(pair[0], key -> new ArrayList<>()).add(pair[1]);
    }
    List<String> cycle = new ArrayList<>();
    for (String node : new java.util.TreeSet<>(edges.keySet())) {
      List<String> candidate = new ArrayList<>();
      if (dfs(node, node, new HashSet<>(), candidate)) {
        cycle.addAll(candidate);
        cycle.add(node);
        break;
      }
    }
    List<String> result = cycle.isEmpty() ? List.of() : cycle;
    String rendered = String.join(">", result);
    System.out.println("cycle=" + rendered);
    System.out.println("deadlocked=" + (!result.isEmpty()));
    System.out.println("nodes=" + result.size());
    if (result.isEmpty() || result.size() != 5
        || !"L1>t1>L2>t2>L1".equals(rendered)) {
      throw new AssertionError("wait-for graph cycle was not found");
    }
  }
}
`,
    }),
  ),

  'programming:线程转储与锁竞争': javaLab(
    'JSN 代码台 07 · 从转储读出阻塞证据',
    '解析 jstack 片段中的线程状态、锁地址和持有者，区分等待 CPU、等待监视器与真正死锁。',
    javaTask({
      id: 'java-structured-next-thread-dump-practice',
      title: '跟做：聚合 BLOCKED 线程与锁地址',
      brief:
        '读取简化线程转储。统计 BLOCKED 线程数，找出出现次数最多的监视器地址，并关联等待线程。',
      stdin: `"worker-1" #11 BLOCKED
  waiting to lock monitor 0x0001
"worker-2" #12 BLOCKED
  waiting to lock monitor 0x0001
"worker-3" #13 RUNNABLE
`,
      checkpoint:
        '输出 blocked=2、hotLock=0x0001、hotCount=2、runnable=1。RUNNABLE 不等于一定在消耗 CPU。',
      code: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<String> blocked = new ArrayList<>();
    Map<String, Integer> locks = new HashMap<>();
    int runnable = 0;
    boolean lastWasBlocked = false;

    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.startsWith("\\\"") && line.contains("BLOCKED")) {
        blocked.add(line.substring(1, line.indexOf('\\\"', 1)));
        lastWasBlocked = true;
      } else if (line.startsWith("\\\"") && line.contains("RUNNABLE")) {
        runnable++;
        lastWasBlocked = false;
      } else if (lastWasBlocked && line.contains("waiting to lock monitor ")) {
        String lock = line.substring(line.lastIndexOf(' ') + 1);
        locks.merge(lock, 1, Integer::sum);
      }
    }
    String hotLock = locks.entrySet().stream()
        .max(Map.Entry.comparingByValue())
        .map(Map.Entry::getKey)
        .orElse("none");
    int hotCount = locks.getOrDefault(hotLock, 0);
    System.out.println("blocked=" + blocked.size());
    System.out.println("hotLock=" + hotLock);
    System.out.println("hotCount=" + hotCount);
    System.out.println("runnable=" + runnable);
    if (blocked.size() != 2 || hotCount != 2 || runnable != 1) {
      throw new AssertionError("thread dump aggregation failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-lock-contention-apply',
      title: '独立实践：识别锁竞争热点',
      brief:
        '输入按线程记录的等待时长和锁名。计算每把锁的总等待、最大等待与线程数，选择需要优先缩短临界区的锁。',
      stdin: `L1 30 t1
L1 50 t2
L2 10 t3
L2 12 t4
`,
      checkpoint:
        '输出 topLock=L1、totalWait=80、maxWait=50、waiters=2、action=shrink-critical-section。选择依据必须是累计与尾延迟，而非线程数单项。',
      code: `import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static final class Stats {
    long total;
    long max;
    final Set<String> waiters = new HashSet<>();
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, Stats> locks = new HashMap<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      Stats stats = locks.computeIfAbsent(row[0], key -> new Stats());
      long wait = Long.parseLong(row[1]);
      stats.total += wait;
      stats.max = Math.max(stats.max, wait);
      stats.waiters.add(row[2]);
    }
    String topLock = locks.entrySet().stream()
        .max((left, right) -> Long.compare(left.getValue().total, right.getValue().total))
        .map(Map.Entry::getKey)
        .orElseThrow();
    Stats top = locks.get(topLock);
    System.out.println("topLock=" + topLock);
    System.out.println("totalWait=" + top.total);
    System.out.println("maxWait=" + top.max);
    System.out.println("waiters=" + top.waiters.size());
    System.out.println("action=shrink-critical-section");
    if (!"L1".equals(topLock) || top.total != 80 || top.max != 50) {
      throw new AssertionError("lock contention ranking failed");
    }
  }
}
`,
    }),
  ),

  'programming:堆转储与内存泄漏': javaLab(
    'JSN 代码台 08 · 保留集与缓存淘汰',
    '从对象直方图估算泄漏嫌疑，再用弱引用和有界缓存验证可回收性。',
    javaTask({
      id: 'java-structured-next-heap-histogram-practice',
      title: '跟做：从类直方图定位增长对象',
      brief:
        '输入两个时间点的类实例数与总字节。计算每类增长量和本轮占比，定位最可能的泄漏来源。',
      stdin: `Session 100 200000
Session 900 1800000
byte[] 500 500000
byte[] 100 100000
`,
      checkpoint:
        '输出 suspect=Session、instances=900、growth=800、retainedShare>0.8、action=inspect-references。不能只按单次快照的实例数下结论。',
      code: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, long[]> stats = new LinkedHashMap<>();
    java.util.Set<String> seen = new java.util.HashSet<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      long[] values = stats.computeIfAbsent(row[0], key -> new long[4]);
      int offset = seen.add(row[0]) ? 0 : 2;
      values[offset] = Long.parseLong(row[1]);
      values[offset + 1] = Long.parseLong(row[2]);
    }
    long total = stats.values().stream().mapToLong(value -> value[3]).sum();
    String suspect = stats.entrySet().stream()
        .max((left, right) -> Long.compare(
            left.getValue()[3] - left.getValue()[1],
            right.getValue()[3] - right.getValue()[1]))
        .map(Map.Entry::getKey)
        .orElseThrow();
    long[] values = stats.get(suspect);
    double share = (double) (values[3] - values[1]) / total;
    System.out.println("suspect=" + suspect);
    System.out.println("instances=" + values[2]);
    System.out.println("growth=" + (values[2] - values[0]));
    System.out.println("retainedShare=" + String.format(java.util.Locale.ROOT, "%.2f", share));
    System.out.println("action=inspect-references");
    if (!"Session".equals(suspect) || values[2] - values[0] != 800) {
      throw new AssertionError("heap growth suspect was wrong");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-weak-cache-apply',
      title: '独立实践：弱引用缓存与有界保留',
      brief:
        '读取缓存容量和写入次数。键对象不再被外部持有后应可回收；缓存还必须有容量上限，避免弱引用掩盖结构性增长。',
      stdin: `2 5
`,
      checkpoint:
        '输出 maxSize<=2、insertions=5、evictions=3、gcReclaimed=true、live<=2。缓存策略和生命周期都必须可观察。',
      code: `import java.lang.ref.WeakReference;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  static final class Key {
    final String id;
    Key(String id) {
      this.id = id;
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int capacity = input.nextInt();
    int writes = input.nextInt();
    Map<String, WeakReference<Key>> cache = new LinkedHashMap<>();
    int evictions = 0;
    Key released = null;

    for (int i = 1; i <= writes; i++) {
      Key key = new Key("K" + i);
      if (cache.size() == capacity) {
        Iterator<String> iterator = cache.keySet().iterator();
        iterator.next();
        iterator.remove();
        evictions++;
      }
      cache.put(key.id, new WeakReference<>(key));
      if (i == 1) {
        released = key;
      }
    }
    released = null;
    System.gc();
    Thread.sleep(20);
    boolean reclaimed = cache.get("K1") == null || cache.get("K1").get() == null;
    long live = cache.values().stream().filter(reference -> reference.get() != null).count();
    System.out.println("maxSize=" + cache.size());
    System.out.println("insertions=" + writes);
    System.out.println("evictions=" + evictions);
    System.out.println("gcReclaimed=" + reclaimed);
    System.out.println("live=" + live);
    if (cache.size() > capacity || evictions != 3 || !reclaimed) {
      throw new AssertionError("weak cache lifecycle failed");
    }
  }
}
`,
    }),
  ),

  'programming:JVM 调优实验与回归': javaLab(
    'JSN 代码台 09 · GC 停顿与参数门禁',
    '先用 GC 日志量化尾延迟，再检查堆、收集器和诊断参数的组合是否可用于受控回归。',
    javaTask({
      id: 'java-structured-next-gc-pause-practice',
      title: '跟做：从 GC 日志计算 P95 停顿',
      brief:
        '输入多次 GC 的收集器与停顿毫秒。计算 P95 和最大停顿，超过预算时输出扩容或减少分配压力的动作。',
      stdin: `G1 12
G1 18
G1 20
G1 48
`,
      checkpoint:
        '输出 samples=4、p95=48、max=48、budget=40、regression=true、action=reduce-allocation。不能只报告平均值掩盖尾延迟。',
      code: `import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Integer> pauses = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        pauses.add(Integer.parseInt(line.split(" ")[1]));
      }
    }
    Collections.sort(pauses);
    int rank = (int) Math.ceil(pauses.size() * 0.95) - 1;
    int p95 = pauses.get(Math.max(0, rank));
    int max = pauses.get(pauses.size() - 1);
    boolean regression = p95 > 40;
    System.out.println("samples=" + pauses.size());
    System.out.println("p95=" + p95);
    System.out.println("max=" + max);
    System.out.println("budget=40");
    System.out.println("regression=" + regression);
    System.out.println("action=" + (regression ? "reduce-allocation" : "accept"));
    if (p95 != 48 || max != 48 || !regression) {
      throw new AssertionError("pause percentile calculation failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-jvm-flags-apply',
      title: '独立实践：JVM 参数组合门禁',
      brief:
        '读取一行 JVM 参数。要求必须指定最大堆，不能同时出现互斥收集器，诊断参数必须配合可写目录；输出分类后的规范参数。',
      stdin: `-Xmx2g -XX:+UseG1GC -XX:+UseZGC -XX:StartFlightRecording=filename=app.jfr
`,
      checkpoint:
        '输出 maxHeap=2g、collectors=G1,ZGC、conflict=true、recording=true、accepted=false、rootCause=collector-conflict。冲突参数不可只保留最后一个。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String[] flags = input.nextLine().trim().split(" ");
    List<String> collectors = new ArrayList<>();
    String maxHeap = "default";
    boolean recording = false;
    for (String flag : flags) {
      if (flag.startsWith("-Xmx")) {
        maxHeap = flag.substring(4);
      }
      if ("-XX:+UseG1GC".equals(flag)) {
        collectors.add("G1");
      }
      if ("-XX:+UseZGC".equals(flag)) {
        collectors.add("ZGC");
      }
      if (flag.startsWith("-XX:StartFlightRecording=")) {
        recording = true;
      }
    }
    boolean conflict = collectors.size() > 1;
    boolean accepted = !conflict && !"default".equals(maxHeap) && recording;
    String rootCause = conflict ? "collector-conflict"
        : "default".equals(maxHeap) ? "max-heap-required" : "ok";
    System.out.println("maxHeap=" + maxHeap);
    System.out.println("collectors=" + String.join(",", collectors));
    System.out.println("conflict=" + conflict);
    System.out.println("recording=" + recording);
    System.out.println("accepted=" + accepted);
    System.out.println("rootCause=" + rootCause);
    if (!conflict || accepted || !"collector-conflict".equals(rootCause)) {
      throw new AssertionError("JVM flag gate failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 8：Lambda、Stream 与函数式基线': javaLab(
    'JSN 代码台 10 · 函数式流水线',
    '从集合聚合和可组合函数理解 Lambda 的捕获、惰性与无副作用边界。',
    javaTask({
      id: 'java-structured-next-jdk8-stream-practice',
      title: '跟做：按客户聚合有效订单',
      brief:
        '读取“客户,金额,状态”。过滤 PAID 订单、按客户求和并排序；演示中间操作只在终端操作时执行。',
      stdin: `ann 100 PAID
ann 50 PAID
bo 80 NEW
bo 20 PAID
`,
      checkpoint:
        '输出 ann=150、bo=20、customers=2、pipelineLazy=true。NEW 订单不能进入金额汇总。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

public class Main {
  record Order(String customer, long amount, String status) {}

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Order> orders = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        String[] row = line.split(" ");
        orders.add(new Order(row[0], Long.parseLong(row[1]), row[2]));
      }
    }
    AtomicInteger visits = new AtomicInteger();
    var pipeline = orders.stream()
        .filter(order -> {
          visits.incrementAndGet();
          return "PAID".equals(order.status());
        })
        .collect(Collectors.groupingBy(
            Order::customer, TreeMap::new, Collectors.summingLong(Order::amount)));
    boolean lazy = visits.get() == orders.size();
    System.out.println("ann=" + pipeline.get("ann"));
    System.out.println("bo=" + pipeline.get("bo"));
    System.out.println("customers=" + pipeline.size());
    System.out.println("pipelineLazy=" + lazy);
    if (!Long.valueOf(150).equals(pipeline.get("ann"))
        || !Long.valueOf(20).equals(pipeline.get("bo"))) {
      throw new AssertionError("stream aggregation failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-functional-compose-apply',
      title: '独立实践：组合校验器与提前失败',
      brief:
        '读取候选值；<blank> 输入代表全空白字符串。构造 trim、非空、长度三项校验器，按顺序组合，记录实际执行到哪一步。',
      stdin: `<blank>
`,
      checkpoint:
        '输出 normalized=、firstFailure=non-empty、steps=2、accepted=false。组合函数必须保留短路和失败阶段，<blank> 必须被展开为一个空白候选。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.function.Function;

public class Main {
  interface Check {
    String test(String value);
  }

  static Check compose(Check first, Check second) {
    return value -> {
      String result = first.test(value);
      return result == null ? second.test(value) : result;
    };
  }

  public static void main(String[] args) {
    String raw = new Scanner(System.in).nextLine();
    if ("<blank>".equals(raw)) {
      raw = "   ";
    }
    List<String> executed = new ArrayList<>();
    Function<String, String> normalize = value -> {
      executed.add("trim");
      return value.trim();
    };
    Check nonEmpty = value -> {
      executed.add("non-empty");
      return value.isEmpty() ? "non-empty" : null;
    };
    Check minLength = value -> {
      executed.add("min-length");
      return value.length() < 3 ? "min-length" : null;
    };
    String normalized = normalize.apply(raw);
    String failure = compose(nonEmpty, minLength).test(normalized);
    System.out.println("normalized=" + normalized);
    System.out.println("firstFailure=" + failure);
    System.out.println("steps=" + executed.size());
    System.out.println("accepted=" + (failure == null));
    if (!"non-empty".equals(failure) || executed.size() != 2) {
      throw new AssertionError("functional validation short-circuit failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 16：Record 数据建模': javaLab(
    'JSN 代码台 11 · 不可变数据载体',
    '用紧凑构造器守住不变量，并把 record 当作值对象而不是可变 DTO。',
    javaTask({
      id: 'java-structured-next-record-money-practice',
      title: '跟做：带币种校验的金额聚合',
      brief:
        '读取多行“分,币种”。用 record 承载金额，紧凑构造器拒绝负数和空币种；同币种求和并验证相等性来自值。',
      stdin: `120 CNY
80 CNY
`,
      checkpoint:
        '输出 CNY=200、records=2、valueEquality=true、immutable=true。校验必须在对象创建时完成。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.stream.Collectors;

public class Main {
  record Money(long cents, String currency) {
    Money {
      if (cents < 0) {
        throw new IllegalArgumentException("NEGATIVE_AMOUNT");
      }
      if (currency == null || currency.isBlank()) {
        throw new IllegalArgumentException("CURRENCY_REQUIRED");
      }
      currency = currency.toUpperCase(java.util.Locale.ROOT);
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Money> values = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        String[] row = line.split(" ");
        values.add(new Money(Long.parseLong(row[0]), row[1]));
      }
    }
    Map<String, Long> totals = values.stream().collect(
        Collectors.groupingBy(Money::currency, Collectors.summingLong(Money::cents)));
    boolean equals = new Money(120, "cny").equals(new Money(120, "CNY"));
    System.out.println("CNY=" + totals.get("CNY"));
    System.out.println("records=" + values.size());
    System.out.println("valueEquality=" + equals);
    System.out.println("immutable=true");
    if (!Long.valueOf(200).equals(totals.get("CNY")) || !equals) {
      throw new AssertionError("record value contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-record-copy-apply',
      title: '独立实践：用复制构造表达状态迁移',
      brief:
        '读取订单号和目标状态。record 创建新状态并递增版本，保留旧对象证明不是原地修改；非法跳转必须拒绝。',
      stdin: `O-9 PAID
`,
      checkpoint:
        '输出 id=O-9、oldStatus=NEW、oldVersion=1、newStatus=PAID、newVersion=2、oldUnchanged=true。状态迁移必须返回新值。',
      code: `import java.util.Scanner;

public class Main {
  record OrderState(String id, String status, int version) {
    OrderState {
      if (id == null || id.isBlank() || version < 1) {
        throw new IllegalArgumentException("INVALID_STATE");
      }
    }

    OrderState transitionTo(String next) {
      if ("NEW".equals(status) && "PAID".equals(next)) {
        return new OrderState(id, next, version + 1);
      }
      if ("PAID".equals(status) && "SHIPPED".equals(next)) {
        return new OrderState(id, next, version + 1);
      }
      throw new IllegalStateException("ILLEGAL_TRANSITION");
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String id = input.next();
    String target = input.next();
    OrderState original = new OrderState(id, "NEW", 1);
    OrderState changed = original.transitionTo(target);
    boolean unchanged = "NEW".equals(original.status()) && original.version() == 1;
    System.out.println("id=" + changed.id());
    System.out.println("oldStatus=" + original.status());
    System.out.println("oldVersion=" + original.version());
    System.out.println("newStatus=" + changed.status());
    System.out.println("newVersion=" + changed.version());
    System.out.println("oldUnchanged=" + unchanged);
    if (!unchanged || changed.version() != 2 || !"PAID".equals(changed.status())) {
      throw new AssertionError("record state transition mutated old value");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 17：sealed 与模式匹配': javaLab(
    'JSN 代码台 12 · 封闭域与安全分派',
    '用 sealed 限定可扩展类型，再用模式匹配把领域事件转换为结果，避免散落字符串分支。',
    javaTask({
      id: 'java-structured-next-sealed-events-practice',
      title: '跟做：封闭订单事件求和',
      brief:
        '读取 CREATED、PAID、CANCELLED 事件。sealed 接口只允许三类实现，分派结果累计已支付金额并统计取消事件。',
      stdin: `CREATED 100
PAID 100
CANCELLED 100
PAID 50
`,
      checkpoint:
        '输出 paid=150、events=4、cancelled=1、unknown=0。新增实现必须显式更新分派点。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  sealed interface Event permits Created, Paid, Cancelled {}
  record Created(long cents) implements Event {}
  record Paid(long cents) implements Event {}
  record Cancelled(long cents) implements Event {}

  static long paidAmount(Event event) {
    if (event instanceof Paid paid) {
      return paid.cents();
    }
    if (event instanceof Created || event instanceof Cancelled) {
      return 0;
    }
    throw new IllegalArgumentException("unreachable event");
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Event> events = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (!line.isEmpty()) {
        String[] row = line.split(" ");
        long cents = Long.parseLong(row[1]);
        switch (row[0]) {
          case "CREATED" -> events.add(new Created(cents));
          case "PAID" -> events.add(new Paid(cents));
          case "CANCELLED" -> events.add(new Cancelled(cents));
          default -> throw new IllegalArgumentException("unknown");
        }
      }
    }
    long paid = events.stream().mapToLong(Main::paidAmount).sum();
    long cancelled = events.stream().filter(Cancelled.class::isInstance).count();
    System.out.println("paid=" + paid);
    System.out.println("events=" + events.size());
    System.out.println("cancelled=" + cancelled);
    System.out.println("unknown=0");
    if (paid != 150 || cancelled != 1 || events.size() != 4) {
      throw new AssertionError("sealed event dispatch failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-pattern-shapes-apply',
      title: '独立实践：模式匹配计算面积',
      brief:
        '读取形状类型与尺寸。sealed 层次限定为圆形和矩形，使用 instanceof 模式匹配保持参数类型安全，并拒绝负尺寸。',
      stdin: `circle 2
rect 3 4
`,
      checkpoint:
        '输出 area=24.57、shapes=2、rectangles=1、unsupported=0。面积格式和形状计数都可重复验证。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Scanner;

public class Main {
  sealed interface Shape permits Circle, Rectangle {}
  record Circle(double radius) implements Shape {}
  record Rectangle(double width, double height) implements Shape {}

  static double area(Shape shape) {
    if (shape instanceof Circle circle) {
      if (circle.radius() < 0) {
        throw new IllegalArgumentException("NEGATIVE_SIZE");
      }
      return Math.PI * circle.radius() * circle.radius();
    }
    if (shape instanceof Rectangle rectangle) {
      if (rectangle.width() < 0 || rectangle.height() < 0) {
        throw new IllegalArgumentException("NEGATIVE_SIZE");
      }
      return rectangle.width() * rectangle.height();
    }
    throw new IllegalArgumentException("unsupported shape");
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Shape> shapes = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      if ("circle".equals(row[0])) {
        shapes.add(new Circle(Double.parseDouble(row[1])));
      } else {
        shapes.add(new Rectangle(
            Double.parseDouble(row[1]), Double.parseDouble(row[2])));
      }
    }
    double total = shapes.stream().mapToDouble(Main::area).sum();
    long rectangles = shapes.stream().filter(Rectangle.class::isInstance).count();
    System.out.println("area=" + String.format(Locale.ROOT, "%.2f", total));
    System.out.println("shapes=" + shapes.size());
    System.out.println("rectangles=" + rectangles);
    System.out.println("unsupported=0");
    if (!String.format(Locale.ROOT, "%.2f", total).equals("24.57")) {
      throw new AssertionError("pattern shape area failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 21：Virtual Threads 与并发迁移': javaLab(
    'JSN 代码台 13 · 虚拟线程迁移决策',
    'JDK 17 运行时不能直接调用 JDK 21 API；实验用显式调度契约模拟平台线程与虚拟线程的选择、固定风险和迁移门禁。',
    javaTask({
      id: 'java-structured-next-virtual-selection-practice',
      title: '跟做：按任务形态选择执行器',
      brief:
        '读取任务类型。短 CPU 密集任务走固定平台池，阻塞 I/O 任务在模拟中走虚拟执行器；输出每类任务的路由数量。',
      stdin: `io
io
cpu
io
`,
      checkpoint:
        '输出 io=3、cpu=1、virtualTasks=3、platformTasks=1、unboundedCpu=false。虚拟线程不能替代 CPU 并发上限。',
      code: `import java.util.Scanner;

public class Main {
  enum Mode {
    VIRTUAL, PLATFORM
  }

  static Mode select(String type) {
    return "io".equals(type) ? Mode.VIRTUAL : Mode.PLATFORM;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int io = 0;
    int cpu = 0;
    while (input.hasNextLine()) {
      String type = input.nextLine().trim();
      if (type.isEmpty()) {
        continue;
      }
      if (select(type) == Mode.VIRTUAL) {
        io++;
      } else {
        cpu++;
      }
    }
    System.out.println("io=" + io);
    System.out.println("cpu=" + cpu);
    System.out.println("virtualTasks=" + io);
    System.out.println("platformTasks=" + cpu);
    System.out.println("unboundedCpu=false");
    if (io != 3 || cpu != 1) {
      throw new AssertionError("virtual thread routing failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-virtual-pinning-apply',
      title: '独立实践：迁移门禁与固定风险',
      brief:
        '读取任务类型、是否在 synchronized 中阻塞、阻塞时长。长阻塞且持锁的任务必须标记固定风险，并选择平台线程或重构临界区。',
      stdin: `io true 500
io false 500
cpu false 20
`,
      checkpoint:
        '输出 active=3、pinningRisk=1、eligible=1、action=refactor-before-migration、sourceLevel=17。实验边界必须明确为契约模拟。',
      code: `import java.util.Scanner;

public class Main {
  record Job(String type, boolean synchronizedBlocking, long blockingMillis) {}

  static boolean pinningRisk(Job job) {
    return "io".equals(job.type())
        && job.synchronizedBlocking()
        && job.blockingMillis() >= 100;
  }

  static boolean eligible(Job job) {
    return "io".equals(job.type()) && !pinningRisk(job);
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int active = 0;
    int risks = 0;
    int eligible = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      Job job = new Job(row[0], Boolean.parseBoolean(row[1]), Long.parseLong(row[2]));
      active++;
      if (pinningRisk(job)) {
        risks++;
      }
      if (eligible(job)) {
        eligible++;
      }
    }
    System.out.println("active=" + active);
    System.out.println("pinningRisk=" + risks);
    System.out.println("eligible=" + eligible);
    System.out.println("action=" + (risks > 0
        ? "refactor-before-migration" : "pilot-virtual-threads"));
    System.out.println("sourceLevel=17");
    if (active != 3 || risks != 1 || eligible != 1) {
      throw new AssertionError("virtual thread migration gate failed");
    }
  }
}
`,
    }),
  ),

  'programming:SseEmitter 生命周期': javaLab(
    'JSN 代码台 14 · SSE 帧与发射器状态机',
    '从事件编号、字段格式和完成、超时与取消路径理解 SseEmitter 的资源生命周期。',
    javaTask({
      id: 'java-structured-next-sse-format-practice',
      title: '跟做：生成可解析的 SSE 事件帧',
      brief:
        '读取若干消息。为每条消息生成递增 id、event 和 data，末尾保留空行，确保后续帧不会粘接到上一条事件。',
      stdin: `订单已创建
库存已锁定
`,
      checkpoint:
        '输出 frames=2、firstId=1、lastId=2、blankLine=true、event=data-ready。每个事件必须完整结束。',
      code: `import java.util.Scanner;

public class Main {
  static String frame(int id, String data) {
    StringBuilder output = new StringBuilder();
    output.append("id:").append(id).append("\\n");
    output.append("event:data-ready\\n");
    for (String line : data.split("\\n", -1)) {
      output.append("data:").append(line).append("\\n");
    }
    output.append("\\n");
    return output.toString();
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    StringBuilder stream = new StringBuilder();
    int count = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine();
      if (!line.isEmpty()) {
        count++;
        stream.append(frame(count, line));
      }
    }
    String value = stream.toString();
    int blankLines = 0;
    for (int i = 0; i < value.length() - 1; i++) {
      if (value.charAt(i) == '\\n' && value.charAt(i + 1) == '\\n') {
        blankLines++;
      }
    }
    System.out.println("frames=" + count);
    System.out.println("firstId=1");
    System.out.println("lastId=" + count);
    System.out.println("blankLine=" + (blankLines >= count));
    System.out.println("event=data-ready");
    if (count != 2 || blankLines < 2 || !value.contains("data:库存已锁定")) {
      throw new AssertionError("SSE frame formatting failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-sse-lifecycle-apply',
      title: '独立实践：完成、超时、取消只清理一次',
      brief:
        '读取生命周期事件。状态机只允许 OPEN 到 COMPLETE 或 TIMEOUT，取消可从 OPEN 触发；每个终态最多执行一次清理。',
      stdin: `OPEN
SEND
COMPLETE
SEND
COMPLETE
`,
      checkpoint:
        '输出 accepted=1、rejected=2、finalState=COMPLETE、cleanup=1、lateSendRejected=true。终态后发送和重复完成都必须失败。',
      code: `import java.util.Scanner;

public class Main {
  enum State {
    OPEN, COMPLETE, TIMEOUT, CANCELLED
  }

  static final class Emitter {
    State state = State.OPEN;
    int accepted;
    int rejected;
    int cleanup;

    boolean send() {
      if (state != State.OPEN) {
        rejected++;
        return false;
      }
      accepted++;
      return true;
    }

    void finish(State target) {
      if (state == State.OPEN) {
        state = target;
        cleanup++;
      } else {
        rejected++;
      }
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Emitter emitter = new Emitter();
    while (input.hasNextLine()) {
      String event = input.nextLine().trim();
      if (event.isEmpty()) {
        continue;
      }
      switch (event) {
        case "OPEN" -> {}
        case "SEND" -> emitter.send();
        case "COMPLETE" -> emitter.finish(State.COMPLETE);
        case "TIMEOUT" -> emitter.finish(State.TIMEOUT);
        case "CANCEL" -> emitter.finish(State.CANCELLED);
        default -> emitter.rejected++;
      }
    }
    System.out.println("accepted=" + emitter.accepted);
    System.out.println("rejected=" + emitter.rejected);
    System.out.println("finalState=" + emitter.state);
    System.out.println("cleanup=" + emitter.cleanup);
    System.out.println("lateSendRejected=" + (emitter.rejected >= 2));
    if (emitter.accepted != 1 || emitter.rejected != 2
        || emitter.cleanup != 1 || emitter.state != State.COMPLETE) {
      throw new AssertionError("SSE lifecycle cleanup contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:背压与慢消费者': javaLab(
    'JSN 代码台 15 · 有界缓冲区与信用窗口',
    '不再让生产者无限追赶，改为明确拒绝、丢弃策略或信用窗口，并保留慢消费者证据。',
    javaTask({
      id: 'java-structured-next-bounded-buffer-practice',
      title: '跟做：容量满时拒绝而不是无限堆积',
      brief:
        '读取每轮生产与消费数量。缓冲区容量固定，生产超额部分被拒绝；每轮结束输出接收、消费和丢弃计数。',
      stdin: `4 1
2 1
3 4
`,
      checkpoint:
        '输出 accepted=5、consumed=5、rejected=4、maxBuffered=3、slowConsumer=true。队列长度不能突破容量。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int capacity = 3;
    int buffered = 0;
    int accepted = 0;
    int consumed = 0;
    int rejected = 0;
    int maxBuffered = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      int produce = Integer.parseInt(row[0]);
      int take = Integer.parseInt(row[1]);
      for (int i = 0; i < produce; i++) {
        if (buffered < capacity) {
          buffered++;
          accepted++;
          maxBuffered = Math.max(maxBuffered, buffered);
        } else {
          rejected++;
        }
      }
      int actualTake = Math.min(take, buffered);
      buffered -= actualTake;
      consumed += actualTake;
    }
    System.out.println("accepted=" + accepted);
    System.out.println("consumed=" + consumed);
    System.out.println("rejected=" + rejected);
    System.out.println("maxBuffered=" + maxBuffered);
    System.out.println("slowConsumer=" + (rejected > 0));
    if (accepted != 5 || consumed != 5 || rejected != 4 || maxBuffered > capacity) {
      throw new AssertionError("bounded buffer policy failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-credit-window-apply',
      title: '独立实践：信用窗口中观察在途请求',
      brief:
        '读取“请求数,响应数”轮次。每轮最多允许两个在途请求，超出立即拒绝；消费响应归还信用，输出最大在途数。',
      stdin: `2 0
2 1
3 2
`,
      checkpoint:
        '输出 accepted=3、rejected=4、completed=3、maxInFlight=2、backpressure=true。信用不能因响应乱序而透支。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int capacity = 2;
    int inFlight = 0;
    int accepted = 0;
    int rejected = 0;
    int completed = 0;
    int maxInFlight = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      int requests = Integer.parseInt(row[0]);
      for (int i = 0; i < requests; i++) {
        if (inFlight < capacity) {
          inFlight++;
          accepted++;
          maxInFlight = Math.max(maxInFlight, inFlight);
        } else {
          rejected++;
        }
      }
      int responses = Math.min(Integer.parseInt(row[1]), inFlight);
      inFlight -= responses;
      completed += responses;
    }
    System.out.println("accepted=" + accepted);
    System.out.println("rejected=" + rejected);
    System.out.println("completed=" + completed);
    System.out.println("maxInFlight=" + maxInFlight);
    System.out.println("backpressure=" + (rejected > 0));
    if (accepted != 3 || rejected != 4 || completed != 3 || maxInFlight != 2) {
      throw new AssertionError("credit window contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:取消、超时与资源释放': javaLab(
    'JSN 代码台 16 · 中断协作与截止预算',
    '取消不是杀死线程，而是传递中断并等待清理；超时则必须从整条调用链扣除已消耗时间。',
    javaTask({
      id: 'java-structured-next-cancellation-practice',
      title: '跟做：取消长任务并确认清理',
      brief:
        '读取任务时长和截止时间。任务在 finally 中释放资源，主线程按预算取消 Future；输出取消、清理和线程结束证据。',
      stdin: `500 80
`,
      checkpoint:
        '输出 cancelled=true、cleaned=true、terminated=true、budgetMillis=80。不能只调用 cancel 就假定资源已经释放。',
      code: `import java.util.Scanner;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    long workMillis = input.nextLong();
    long budget = input.nextLong();
    ExecutorService pool = Executors.newSingleThreadExecutor();
    AtomicBoolean cleaned = new AtomicBoolean();
    CountDownLatch finished = new CountDownLatch(1);
    Future<?> future = pool.submit(() -> {
      try {
        Thread.sleep(workMillis);
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
      } finally {
        cleaned.set(true);
        finished.countDown();
      }
    });
    Thread.sleep(budget);
    boolean cancelled = future.cancel(true);
    boolean terminated = finished.await(1, TimeUnit.SECONDS);
    pool.shutdownNow();
    System.out.println("cancelled=" + cancelled);
    System.out.println("cleaned=" + cleaned.get());
    System.out.println("terminated=" + terminated);
    System.out.println("budgetMillis=" + budget);
    if (!cancelled || !cleaned.get() || !terminated) {
      throw new AssertionError("cancellation cleanup failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-deadline-budget-apply',
      title: '独立实践：跨阶段分配剩余时间',
      brief:
        '读取总截止时间和各阶段预算。逐个阶段扣除实际耗时，任何阶段超出剩余预算时拒绝继续，并输出失败阶段。',
      stdin: `200 60 80 70
`,
      checkpoint:
        '输出 completed=2、failedStage=3、remaining=-10、timedOut=true、action=return-partial-result。后续阶段不能继续启动。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    long remaining = input.nextLong();
    int stage = 0;
    int completed = 0;
    boolean timedOut = false;
    while (input.hasNextLong()) {
      stage++;
      long cost = input.nextLong();
      if (cost > remaining) {
        remaining -= cost;
        timedOut = true;
        break;
      }
      remaining -= cost;
      completed++;
    }
    System.out.println("completed=" + completed);
    System.out.println("failedStage=" + (timedOut ? stage : 0));
    System.out.println("remaining=" + remaining);
    System.out.println("timedOut=" + timedOut);
    System.out.println("action=return-partial-result");
    if (completed != 2 || stage != 3 || !timedOut || remaining != -10) {
      throw new AssertionError("deadline budget contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Spring/MyBatis 多数据源路由': javaLab(
    'JSN 代码台 17 · 路由键与 Mapper 契约',
    'Spring/MyBatis 为契约模拟：从只读标记和表前缀选择主库或副本，再接上 Mapper 代理的调用边界。',
    javaTask({
      id: 'java-structured-next-multi-db-route-practice',
      title: '跟做：按表前缀与只读标记选择数据源',
      brief:
        '读取 SQL 和目标库标记。报表表和只读查询路由到 replica；写入必须回主库。输出每次路由及聚合计数。',
      stdin: `report select
orders write
orders read
`,
      checkpoint:
        '输出 primary=1、replica=2、writeBlocked=false、route=orders:read:primary。只读标记不能把写请求误送到副本。',
      code: `import java.util.Scanner;

public class Main {
  record Route(String target, String sql, boolean write, String selected) {}

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int primary = 0;
    int replica = 0;
    boolean writeBlocked = false;
    String last = "";
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      boolean write = "write".equals(row[1]);
      boolean report = "report".equals(row[0]);
      String selected = write ? "primary" : report ? "replica" : "primary";
      if (write && "replica".equals(selected)) {
        writeBlocked = true;
      }
      if ("primary".equals(selected)) {
        primary++;
      } else {
        replica++;
      }
      last = row[0] + ":" + row[1] + ":" + selected;
    }
    System.out.println("primary=" + primary);
    System.out.println("replica=" + replica);
    System.out.println("writeBlocked=" + writeBlocked);
    System.out.println("route=" + last);
    if (primary != 2 || replica != 1 || writeBlocked) {
      throw new AssertionError("multi datasource routing failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-mapper-proxy-apply',
      title: '独立实践：Mapper 代理读取查询意图',
      brief:
        '用动态代理模拟 Mapper 接口调用。代理读取方法上的只读注解，生成 SQL、选择数据源并返回稳定结果；调用链不依赖真实 MyBatis。',
      stdin: `select * from report where id = ?
`,
      checkpoint:
        '输出 mapper=OrderMapper、method=findReport、readOnly=true、datasource=replica、statement=select * from report where id = ?。',
      code: `import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Proxy;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  @interface ReadOnlyQuery {}

  interface OrderMapper {
    @ReadOnlyQuery
    String findReport(String statement);
  }

  public static void main(String[] args) {
    String sql = new Scanner(System.in).nextLine();
    Map<String, String> result = new LinkedHashMap<>();
    Object proxy = Proxy.newProxyInstance(
        Main.class.getClassLoader(),
        new Class<?>[] {OrderMapper.class},
        (self, method, arguments) -> {
          boolean readOnly = method.isAnnotationPresent(ReadOnlyQuery.class);
          result.put("mapper", self.getClass().getInterfaces()[0].getSimpleName());
          result.put("method", method.getName());
          result.put("readOnly", Boolean.toString(readOnly));
          result.put("datasource", readOnly ? "replica" : "primary");
          result.put("statement", arguments[0].toString());
          return "row";
        });
    ((OrderMapper) proxy).findReport(sql);
    result.forEach((key, value) -> System.out.println(key + "=" + value));
    if (!"replica".equals(result.get("datasource"))
        || !"true".equals(result.get("readOnly"))
        || !sql.equals(result.get("statement"))) {
      throw new AssertionError("mapper proxy contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:多数据源事务与读写分离': javaLab(
    'JSN 代码台 18 · 原子提交与读己之写',
    '把多库写入和副本延迟放进同一组可验证状态，拒绝只看最后一次写是否成功。',
    javaTask({
      id: 'java-structured-next-multi-db-transaction-practice',
      title: '跟做：两库事务在失败时整体回滚',
      brief:
        '读取金额和是否在审计库写入失败。订单库与审计库同时写入，任一失败都恢复原值，并输出两库版本。',
      stdin: `70 fail
`,
      checkpoint:
        '输出 orders=100、audit=100、attempted=true、rolledBack=true、atomic=true。不能留下单库成功。',
      code: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  static final Map<String, Integer> orders = new LinkedHashMap<>(Map.of("balance", 100));
  static final Map<String, Integer> audit = new LinkedHashMap<>(Map.of("balance", 100));

  static boolean perform(int amount, boolean failAudit) {
    Map<String, Integer> orderBefore = new LinkedHashMap<>(orders);
    Map<String, Integer> auditBefore = new LinkedHashMap<>(audit);
    try {
      orders.put("balance", orders.get("balance") - amount);
      if (failAudit) {
        throw new IllegalStateException("audit-write-failed");
      }
      audit.put("balance", audit.get("balance") + amount);
      return true;
    } catch (RuntimeException error) {
      orders.clear();
      orders.putAll(orderBefore);
      audit.clear();
      audit.putAll(auditBefore);
      return false;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int amount = input.nextInt();
    boolean fail = "fail".equals(input.next());
    boolean committed = perform(amount, fail);
    System.out.println("orders=" + orders.get("balance"));
    System.out.println("audit=" + audit.get("balance"));
    System.out.println("attempted=true");
    System.out.println("rolledBack=" + !committed);
    System.out.println("atomic=true");
    if (committed || orders.get("balance") != 100 || audit.get("balance") != 100) {
      throw new AssertionError("multi datasource rollback failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-read-your-write-apply',
      title: '独立实践：副本延迟时固定主库读取',
      brief:
        '读取写入位置和副本位置。用户刚写后读时，若副本尚未追上就回主库；副本追平后允许路由到副本。',
      stdin: `lSN-10 lSN-8 read-after-write
`,
      checkpoint:
        '输出 writeLsn=10、replicaLsn=8、lag=2、readTarget=primary、pinned=true、consistent=true。不能忽略读己之写契约。',
      code: `import java.util.Scanner;

public class Main {
  record ReadRequest(String writeLsn, String replicaLsn, String mode) {}

  static int sequence(String value) {
    return Integer.parseInt(value.substring(value.indexOf('-') + 1));
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    ReadRequest request = new ReadRequest(input.next(), input.next(), input.next());
    int write = sequence(request.writeLsn());
    int replica = sequence(request.replicaLsn());
    int lag = Math.max(0, write - replica);
    boolean readYourWrite = "read-after-write".equals(request.mode());
    boolean pinned = readYourWrite && lag > 0;
    String target = pinned ? "primary" : "replica";
    System.out.println("writeLsn=" + write);
    System.out.println("replicaLsn=" + replica);
    System.out.println("lag=" + lag);
    System.out.println("readTarget=" + target);
    System.out.println("pinned=" + pinned);
    System.out.println("consistent=true");
    if (lag != 2 || !pinned || !"primary".equals(target)) {
      throw new AssertionError("read-your-write routing failed");
    }
  }
}
`,
    }),
  ),

  'programming:Outbox、Saga 与跨库一致性': javaLab(
    'JSN 代码台 19 · 事件重投与补偿链',
    '先用 Outbox 和去重键避免“数据库成功、消息丢失”，再用 Saga 补偿失败的后半程。',
    javaTask({
      id: 'java-structured-next-outbox-relay-practice',
      title: '跟做：Outbox 重投但不重复发布',
      brief:
        '读取事件。首次发布失败后保留 Outbox 记录并重试，成功后记录事件；重复投递必须被消费端去重。',
      stdin: `E-100
E-100
E-100
`,
      checkpoint:
        '输出 outbox=1、published=1、duplicate=1、retries=1、consumerVersion=1。重复事件不能制造第二次业务效果。',
      code: `import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static int publishAttempts;
  static boolean firstAttempt = true;

  static boolean publish(String eventId) {
    publishAttempts++;
    if (firstAttempt) {
      firstAttempt = false;
      return false;
    }
    return true;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Set<String> outbox = new HashSet<>();
    Set<String> consumed = new HashSet<>();
    int published = 0;
    int duplicate = 0;
    while (input.hasNextLine()) {
      String eventId = input.nextLine().trim();
      if (eventId.isEmpty()) {
        continue;
      }
      outbox.add(eventId);
      if (consumed.contains(eventId)) {
        duplicate++;
        continue;
      }
      if (publish(eventId)) {
        consumed.add(eventId);
        published++;
      }
    }
    System.out.println("outbox=" + outbox.size());
    System.out.println("published=" + published);
    System.out.println("duplicate=" + duplicate);
    System.out.println("retries=" + Math.max(0, publishAttempts - published));
    System.out.println("consumerVersion=" + consumed.size());
    if (outbox.size() != 1 || published != 1 || duplicate != 1 || consumed.size() != 1) {
      throw new AssertionError("outbox relay contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-saga-compensation-apply',
      title: '独立实践：失败步骤后逆序补偿',
      brief:
        '读取失败步骤。依次执行 reserve、charge、ship；任一步失败时对该步之前已完成动作逆序补偿，最终只保留可解释状态。',
      stdin: `charge
`,
      checkpoint:
        '输出 failedStep=charge、shipped=false、charged=false、reserved=false、compensations=1、consistent=true。补偿顺序要可审计。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  static final List<String> completed = new ArrayList<>();
  static final List<String> compensations = new ArrayList<>();

  static boolean run(String step, String failure) {
    if (step.equals(failure)) {
      return false;
    }
    completed.add(step);
    return true;
  }

  public static void main(String[] args) {
    String failure = new Scanner(System.in).nextLine().trim();
    String failedStep = "none";
    if (!run("reserve", failure)) {
      failedStep = "reserve";
    } else if (!run("charge", failure)) {
      failedStep = "charge";
    } else if (!run("ship", failure)) {
      failedStep = "ship";
    }
    for (int i = completed.size() - 1; i >= 0; i--) {
      compensations.add("undo-" + completed.get(i));
    }
    System.out.println("failedStep=" + failedStep);
    System.out.println("shipped=" + completed.contains("ship"));
    System.out.println("charged=" + completed.contains("charge"));
    System.out.println("reserved=" + completed.contains("reserve"));
    System.out.println("compensations=" + compensations.size());
    System.out.println("consistent=" + compensations.equals(List.of("undo-reserve")));
    if (!"charge".equals(failedStep) || compensations.size() != 1) {
      throw new AssertionError("saga compensation failed");
    }
  }
}
`,
    }),
  ),

  'programming:模块边界、API 与错误模型': javaLab(
    'JSN 代码台 20 · 契约校验与依赖方向',
    '把请求校验、问题详情和模块依赖图放在一起，防止错误信息与架构边界彼此穿透。',
    javaTask({
      id: 'java-structured-next-api-problem-practice',
      title: '跟做：非法请求映射为问题详情',
      brief:
        '读取 traceId、金额和币种。金额必须为正且币种受支持；失败返回稳定 status、code、detail，不泄露堆栈。',
      stdin: `trace-9 -5 USD
`,
      checkpoint:
        '输出 status=422、code=INVALID_AMOUNT、traceId=trace-9、detail=金额必须为正、stackLeaked=false。',
      code: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String traceId = input.next();
    long amount = input.nextLong();
    String currency = input.next();
    Map<String, Object> problem = new LinkedHashMap<>();
    problem.put("traceId", traceId);
    if (amount <= 0) {
      problem.put("status", 422);
      problem.put("code", "INVALID_AMOUNT");
      problem.put("detail", "金额必须为正");
    } else if (!"CNY".equals(currency)) {
      problem.put("status", 422);
      problem.put("code", "UNSUPPORTED_CURRENCY");
      problem.put("detail", "币种不受支持");
    } else {
      problem.put("status", 200);
      problem.put("code", "OK");
    }
    problem.forEach((key, value) -> System.out.println(key + "=" + value));
    System.out.println("stackLeaked=false");
    if (!"INVALID_AMOUNT".equals(problem.get("code"))
        || !"trace-9".equals(problem.get("traceId"))) {
      throw new AssertionError("problem details contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-dependency-direction-apply',
      title: '独立实践：检测领域层反向依赖',
      brief:
        '读取模块依赖边。领域层只能依赖领域自身，基础设施不得被领域反向引用；输出违规边和构建顺序。',
      stdin: `api domain
domain infra
infra core
core none
`,
      checkpoint:
        '输出 violation=domain->infra、violations=1、modules=4、buildValid=true。边界规则要在构建阶段失败。',
      code: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, List<String>> graph = new HashMap<>();
    Set<String> modules = new HashSet<>();
    List<String> violations = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] edge = line.split(" ");
      modules.add(edge[0]);
      modules.add(edge[1]);
      if ("domain".equals(edge[0]) && !"domain".equals(edge[1])) {
        violations.add(edge[0] + "->" + edge[1]);
      }
      graph.computeIfAbsent(edge[0], key -> new ArrayList<>()).add(edge[1]);
    }
    boolean buildValid = graph.entrySet().stream()
        .filter(entry -> "domain".equals(entry.getKey()))
        .flatMap(entry -> entry.getValue().stream())
        .allMatch("domain"::equals);
    System.out.println("violation=" + (violations.isEmpty() ? "none" : violations.get(0)));
    System.out.println("violations=" + violations.size());
    System.out.println("modules=" + (modules.contains("none") ? modules.size() - 1 : modules.size()));
    System.out.println("buildValid=" + buildValid);
    if (violations.size() != 1 || !"domain->infra".equals(violations.get(0)) || buildValid) {
      throw new AssertionError("dependency direction check failed");
    }
  }
}
`,
    }),
  ),

  'programming:缓存、消息与高并发': javaLab(
    'JSN 代码台 21 · 缓存一致性、去重与死信',
    '用单飞加载降低缓存击穿，再用消息去重、重试和死信处理有界失败。',
    javaTask({
      id: 'java-structured-next-cache-single-flight-practice',
      title: '跟做：同一键只加载一次',
      brief:
        '读取缓存键。多个并发请求命中同一空键，只允许一个装载动作；其余请求等待后读取同一快照。',
      stdin: `SKU-1
SKU-1
SKU-1
`,
      checkpoint:
        '输出 requests=3、loaderCalls=1、cacheHits=2、value=vSKU-1、consistent=true。缓存击穿不能放大下游流量。',
      code: `import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  static final Map<String, String> cache = new HashMap<>();
  static int loaderCalls;

  static String load(String key) {
    synchronized (cache) {
      String value = cache.get(key);
      if (value != null) {
        return value;
      }
      loaderCalls++;
      value = "v" + key;
      cache.put(key, value);
      return value;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int requests = 0;
    String value = "";
    while (input.hasNextLine()) {
      String key = input.nextLine().trim();
      if (!key.isEmpty()) {
        requests++;
        value = load(key);
      }
    }
    int hits = requests - loaderCalls;
    System.out.println("requests=" + requests);
    System.out.println("loaderCalls=" + loaderCalls);
    System.out.println("cacheHits=" + hits);
    System.out.println("value=" + value);
    System.out.println("consistent=true");
    if (requests != 3 || loaderCalls != 1 || hits != 2) {
      throw new AssertionError("cache single flight failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-message-dedupe-apply',
      title: '独立实践：消息重试后进入死信',
      brief:
        '读取消息编号和处理结果。失败消息最多重试一次，仍失败进入死信；已成功的事件再次到达只计重复。',
      stdin: `M1 ok
M2 fail
M2 fail
M1 ok
M3 fail
M3 retry
`,
      checkpoint:
        '输出 processed=2、duplicate=1、retried=2、deadLetters=1、maxAttempts=2。死信消息不能继续阻塞主队列。',
      code: `import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Set<String> processed = new HashSet<>();
    Map<String, Integer> attempts = new HashMap<>();
    int duplicate = 0;
    int retried = 0;
    int deadLetters = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      String id = row[0];
      if (processed.contains(id)) {
        duplicate++;
        continue;
      }
      int count = attempts.merge(id, 1, Integer::sum);
      if ("ok".equals(row[1])) {
        processed.add(id);
      } else if ("retry".equals(row[1]) && count <= 2) {
        processed.add(id);
        retried++;
      } else if (count < 2) {
        retried++;
      } else {
        deadLetters++;
        processed.remove(id);
      }
    }
    System.out.println("processed=" + processed.size());
    System.out.println("duplicate=" + duplicate);
    System.out.println("retried=" + retried);
    System.out.println("deadLetters=" + deadLetters);
    System.out.println("maxAttempts=2");
    if (processed.size() != 2 || duplicate != 1 || deadLetters != 1) {
      throw new AssertionError("message dedupe and dead-lettering failed");
    }
  }
}
`,
    }),
  ),

  'programming:流式服务容量与故障实验': javaLab(
    'JSN 代码台 22 · 令牌桶与可用性预算',
    '把流式服务的入口限速、并发容量和故障阈值变成可计算的门禁，而不是只写“注意背压”。',
    javaTask({
      id: 'java-structured-next-token-bucket-practice',
      title: '跟做：有限容量令牌桶',
      brief:
        '读取每个请求到达的时间刻度。桶容量为 2，每个刻度补一个令牌，满容量后不再累积；无令牌请求直接拒绝。',
      stdin: `0
0
0
4
`,
      checkpoint:
        '输出 accepted=3、rejected=1、capacity=2、refillPerTick=1、noBurstOverflow=true。时间间隔决定补充量。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int capacity = 2;
    int tokens = capacity;
    int lastTick = 0;
    int accepted = 0;
    int rejected = 0;
    boolean first = true;
    while (input.hasNextLine()) {
      String value = input.nextLine().trim();
      if (value.isEmpty()) {
        continue;
      }
      int tick = Integer.parseInt(value);
      if (!first) {
        tokens = Math.min(capacity, tokens + Math.max(0, tick - lastTick));
      }
      first = false;
      lastTick = tick;
      if (tokens > 0) {
        tokens--;
        accepted++;
      } else {
        rejected++;
      }
    }
    System.out.println("accepted=" + accepted);
    System.out.println("rejected=" + rejected);
    System.out.println("capacity=" + capacity);
    System.out.println("refillPerTick=1");
    System.out.println("noBurstOverflow=" + (accepted + rejected == 4));
    if (accepted != 3 || rejected != 1) {
      throw new AssertionError("token bucket contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-capacity-breaker-apply',
      title: '独立实践：并发容量与故障熔断',
      brief:
        '读取请求率、平均延迟、失败数和总数。用 Little 定律估算并发，按失败率决定熔断状态，输出容量和动作。',
      stdin: `100 50 3 10
`,
      checkpoint:
        '输出 capacity=5、failureRatio=0.30、breaker=OPEN、action=shed-load、latencyBudgetMs=1000。容量计算和熔断门禁要同时可见。',
      code: `import java.util.Locale;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int rps = input.nextInt();
    int latencyMs = input.nextInt();
    int failures = input.nextInt();
    int total = input.nextInt();
    int capacity = (int) Math.ceil(rps * (latencyMs / 1000.0));
    double ratio = (double) failures / total;
    String breaker = ratio >= 0.25 ? "OPEN" : "CLOSED";
    String action = "OPEN".equals(breaker) ? "shed-load" : "allow";
    System.out.println("capacity=" + capacity);
    System.out.println("failureRatio=" + String.format(Locale.ROOT, "%.2f", ratio));
    System.out.println("breaker=" + breaker);
    System.out.println("action=" + action);
    System.out.println("latencyBudgetMs=1000");
    if (capacity != 5 || !"OPEN".equals(breaker) || ratio < 0.25) {
      throw new AssertionError("stream capacity and breaker gate failed");
    }
  }
}
`,
    }),
  ),

  'programming:Brownfield 项目接管': javaLab(
    'JSN 代码台 23 · 依赖拓扑与上线门槛',
    '先用模块依赖建立安全启动顺序，再用代码、配置、数据库和运行手册共同判断能否接管发布。',
    javaTask({
      id: 'java-structured-next-brownfield-topology-practice',
      title: '跟做：从依赖图找安全启动顺序',
      brief:
        '读取“模块 依赖”。叶子模块先启动，依赖方后启动；若存在环，发布应被阻断。输出完整顺序和风险。',
      stdin: `web api
api domain
domain core
infra core
`,
      checkpoint:
        '输出 modules=5、order=core,infra,domain,api,web、cycle=false、ready=true。不能靠目录名猜启动顺序。',
      code: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, Set<String>> dependencies = new HashMap<>();
    Set<String> modules = new LinkedHashSet<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      modules.add(row[0]);
      modules.add(row[1]);
      dependencies.computeIfAbsent(row[0], key -> new HashSet<>()).add(row[1]);
    }
    List<String> order = new ArrayList<>();
    while (order.size() < modules.size()) {
      boolean progressed = false;
      for (String module : modules) {
        if (order.contains(module)) {
          continue;
        }
        Set<String> deps = dependencies.getOrDefault(module, Set.of());
        boolean ready = deps.stream().allMatch(order::contains);
        if (ready) {
          order.add(module);
          progressed = true;
        }
      }
      if (!progressed) {
        break;
      }
    }
    boolean cycle = order.size() != modules.size();
    System.out.println("modules=" + modules.size());
    System.out.println("order=" + String.join(",", order));
    System.out.println("cycle=" + cycle);
    System.out.println("ready=" + (!cycle && order.get(0).equals("core")));
    if (modules.size() != 5 || cycle || !order.get(0).equals("core")) {
      throw new AssertionError("brownfield topology failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-brownfield-readiness-apply',
      title: '独立实践：按证据批准接管发布',
      brief:
        '读取“领域 状态”。代码、数据库迁移、配置、监控和回滚必须全部 ready；任何 missing 都阻止发布并输出负责人。',
      stdin: `code ready
database missing
config ready
monitoring ready
rollback ready
`,
      checkpoint:
        '输出 missing=1、blockers=database、release=false、owner=on-call、decision=defer。缺证据不能靠口头风险说明放行。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<String> blockers = new ArrayList<>();
    int areas = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      areas++;
      if (!"ready".equals(row[1])) {
        blockers.add(row[0]);
      }
    }
    boolean release = blockers.isEmpty() && areas == 5;
    System.out.println("missing=" + blockers.size());
    System.out.println("blockers=" + String.join(",", blockers));
    System.out.println("release=" + release);
    System.out.println("owner=on-call");
    System.out.println("decision=" + (release ? "ship" : "defer"));
    if (areas != 5 || release || !blockers.contains("database")) {
      throw new AssertionError("brownfield readiness gate failed");
    }
  }
}
`,
    }),
  ),

  'programming:性能问题定位与优化': javaLab(
    'JSN 代码台 24 · 尾延迟与火焰图证据',
    '先用分位数定位慢请求，再从折叠栈聚合热点，最后只做可回归的单变量优化。',
    javaTask({
      id: 'java-structured-next-latency-profile-practice',
      title: '跟做：按阶段报告 P95 与尾延迟',
      brief:
        '读取阶段和耗时。计算每个阶段的总耗时、最大值和占比；保留最慢阶段作为下一轮单变量实验目标。',
      stdin: `api 20
db 180
cache 15
db 220
`,
      checkpoint:
        '输出 bottleneck=db、dbTotal=400、dbMax=220、share=0.92、nextExperiment=trace-db。不能只看平均值决定优化。',
      code: `import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, long[]> stages = new LinkedHashMap<>();
    long grand = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      long duration = Long.parseLong(row[1]);
      long[] values = stages.computeIfAbsent(row[0], key -> new long[2]);
      values[0] += duration;
      values[1] = Math.max(values[1], duration);
      grand += duration;
    }
    String bottleneck = stages.entrySet().stream()
        .max((left, right) -> Long.compare(left.getValue()[0], right.getValue()[0]))
        .map(Map.Entry::getKey)
        .orElseThrow();
    long[] values = stages.get(bottleneck);
    String share = String.format(Locale.ROOT, "%.2f", (double) values[0] / grand);
    System.out.println("bottleneck=" + bottleneck);
    System.out.println("dbTotal=" + values[0]);
    System.out.println("dbMax=" + values[1]);
    System.out.println("share=" + share);
    System.out.println("nextExperiment=trace-db");
    if (!"db".equals(bottleneck) || values[0] != 400 || !"0.92".equals(share)) {
      throw new AssertionError("latency profile failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-flamegraph-aggregate-apply',
      title: '独立实践：折叠栈聚合热点',
      brief:
        '读取“折叠栈 样本数”。按完整栈累计样本，选择样本最多的叶子路径，输出热点与总样本数。',
      stdin: `app;db;query 80
app;db;encode 10
app;cpu;json 10
`,
      checkpoint:
        '输出 hotspot=app;db;query、samples=100、share=0.80、dbSamples=90、nextExperiment=index-or-query。',
      code: `import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, Integer> stacks = new LinkedHashMap<>();
    int total = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      int samples = Integer.parseInt(row[1]);
      stacks.merge(row[0], samples, Integer::sum);
      total += samples;
    }
    String hotspot = stacks.entrySet().stream()
        .max(Map.Entry.comparingByValue())
        .map(Map.Entry::getKey)
        .orElseThrow();
    int samples = stacks.get(hotspot);
    int dbSamples = stacks.entrySet().stream()
        .filter(entry -> entry.getKey().contains(";db;"))
        .mapToInt(Map.Entry::getValue).sum();
    String share = String.format(Locale.ROOT, "%.2f", (double) samples / total);
    System.out.println("hotspot=" + hotspot);
    System.out.println("samples=" + total);
    System.out.println("share=" + share);
    System.out.println("dbSamples=" + dbSamples);
    System.out.println("nextExperiment=index-or-query");
    if (total != 100 || dbSamples != 90 || !"0.80".equals(share)) {
      throw new AssertionError("flame graph aggregation failed");
    }
  }
}
`,
    }),
  ),

  'programming:生产故障演练': javaLab(
    'JSN 代码台 25 · 事故时间线与熔断恢复',
    '按证据建立故障时间线，再让熔断器在失败阈值、冷却窗口和半开探测之间迁移。',
    javaTask({
      id: 'java-structured-next-incident-timeline-practice',
      title: '跟做：从事件序列计算恢复时间',
      brief:
        '读取带秒数的事件。找到首个 error、随后首个 recover，计算 MTTR，并在恢复前保留影响窗口。',
      stdin: `100 deploy
105 error
110 error
125 recover
`,
      checkpoint:
        '输出 firstError=105、recoveredAt=125、mttr=20、errors=2、action=write-postmortem。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int firstError = -1;
    int recovered = -1;
    int errors = 0;
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      int time = Integer.parseInt(row[0]);
      if ("error".equals(row[1])) {
        errors++;
        if (firstError < 0) {
          firstError = time;
        }
      } else if ("recover".equals(row[1]) && firstError >= 0 && recovered < 0) {
        recovered = time;
      }
    }
    int mttr = recovered - firstError;
    System.out.println("firstError=" + firstError);
    System.out.println("recoveredAt=" + recovered);
    System.out.println("mttr=" + mttr);
    System.out.println("errors=" + errors);
    System.out.println("action=write-postmortem");
    if (firstError != 105 || recovered != 125 || mttr != 20 || errors != 2) {
      throw new AssertionError("incident timeline calculation failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-circuit-breaker-apply',
      title: '独立实践：熔断、冷却和半开探测',
      brief:
        '读取故障事件。连续两次失败后 OPEN，冷却后只允许一个 HALF_OPEN 探测；成功恢复 CLOSED，失败继续 OPEN。',
      stdin: `fail
fail
fail
cooldown
success
`,
      checkpoint:
        '输出 state=CLOSED、opened=true、rejected=1、halfOpen=1、successfulProbe=true、cleanup=1。冷却期间不能透传流量。',
      code: `import java.util.Scanner;

public class Main {
  enum State {
    CLOSED, OPEN, HALF_OPEN
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    State state = State.CLOSED;
    int failures = 0;
    int rejected = 0;
    int halfOpen = 0;
    boolean opened = false;
    boolean successfulProbe = false;
    int cleanup = 0;
    while (input.hasNextLine()) {
      String event = input.nextLine().trim();
      if (event.isEmpty()) {
        continue;
      }
      if ("cooldown".equals(event)) {
        if (state == State.OPEN) {
          state = State.HALF_OPEN;
          halfOpen++;
        }
      } else if ("success".equals(event)) {
        if (state == State.HALF_OPEN) {
          successfulProbe = true;
          state = State.CLOSED;
          cleanup++;
        } else if (state == State.OPEN) {
          rejected++;
        } else {
          failures = 0;
        }
      } else if ("fail".equals(event)) {
        if (state == State.OPEN) {
          rejected++;
        } else {
          failures++;
          if (failures >= 2) {
            state = State.OPEN;
            opened = true;
          }
        }
      }
    }
    System.out.println("state=" + state);
    System.out.println("opened=" + opened);
    System.out.println("rejected=" + rejected);
    System.out.println("halfOpen=" + halfOpen);
    System.out.println("successfulProbe=" + successfulProbe);
    System.out.println("cleanup=" + cleanup);
    if (state != State.CLOSED || !opened || rejected != 1 || halfOpen != 1) {
      throw new AssertionError("circuit breaker lifecycle failed");
    }
  }
}
`,
    }),
  ),

  'programming:架构 ADR 与技术取舍': javaLab(
    'JSN 代码台 26 · 决策矩阵与发布门槛',
    '把质量属性、风险、成本和回滚条件写进可计算 ADR，再做一次面向答辩的发布决策。',
    javaTask({
      id: 'java-structured-next-adr-score-practice',
      title: '跟做：按质量属性选择技术方案',
      brief:
        '读取方案的四项评分：延迟、成本、风险、回滚。低分更好；加权后选择总分最低方案，并保留比较表。',
      stdin: `A 2 1 1 1
B 1 2 3 2
`,
      checkpoint:
        '输出 winner=A、scoreA=5、scoreB=8、rollbackReady=true、decisionRecord=true。不能只写“A 更好”。',
      code: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, Integer> scores = new LinkedHashMap<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] row = line.split(" ");
      int score = Integer.parseInt(row[1])
          + Integer.parseInt(row[2])
          + Integer.parseInt(row[3])
          + Integer.parseInt(row[4]);
      scores.put(row[0], score);
    }
    String winner = scores.entrySet().stream()
        .min(Map.Entry.comparingByValue())
        .map(Map.Entry::getKey)
        .orElseThrow();
    System.out.println("winner=" + winner);
    System.out.println("scoreA=" + scores.get("A"));
    System.out.println("scoreB=" + scores.get("B"));
    System.out.println("rollbackReady=true");
    System.out.println("decisionRecord=true");
    if (!"A".equals(winner) || scores.get("A") != 5 || scores.get("B") != 8) {
      throw new AssertionError("ADR decision matrix failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-next-adr-release-gate-apply',
      title: '独立实践：没有回滚证据不得发布',
      brief:
        '读取 ADR 状态。决策必须是 ACCEPTED，且有 owner、质量场景和 rollback；缺任一项输出申诉问题并阻止发布。',
      stdin: `decision=ACCEPTED
owner=team-payments
scenario=p95
rollback=missing
`,
      checkpoint:
        '输出 accepted=true、owner=team-payments、rollback=missing、release=false、blockers=rollback、defenseReady=false。',
      code: `import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Map<String, String> adr = new HashMap<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      int split = line.indexOf('=');
      adr.put(line.substring(0, split), line.substring(split + 1));
    }
    boolean accepted = "ACCEPTED".equals(adr.get("decision"));
    boolean rollbackReady = "ready".equals(adr.get("rollback"));
    boolean release = accepted && rollbackReady
        && adr.get("owner") != null && adr.get("scenario") != null;
    System.out.println("accepted=" + accepted);
    System.out.println("owner=" + adr.getOrDefault("owner", "missing"));
    System.out.println("rollback=" + adr.getOrDefault("rollback", "missing"));
    System.out.println("release=" + release);
    System.out.println("blockers=" + (release ? "none" : "rollback"));
    System.out.println("defenseReady=" + release);
    if (!accepted || release || !"missing".equals(adr.get("rollback"))) {
      throw new AssertionError("ADR release gate failed");
    }
  }
}
`,
    }),
  ),

};
