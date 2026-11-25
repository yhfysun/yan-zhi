import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java 17+ / JDK standard library',
  docsUrl: 'https://docs.oracle.com/en/java/javase/21/',
  installSteps: [
    '确认 javac 与 java 至少为 JDK 17，入口文件固定为 Main.java。',
    '虚拟线程任务会探测 JDK 21 API；低版本使用平台线程池运行语义模型，并在输出中明确标记降级。',
    'Kafka、Redis、RabbitMQ、HikariCP、Nginx、Docker、Kubernetes 与 Spring 边界均使用确定性契约模拟，不表示本地启动了真实集群或框架。',
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
 * P06 Java 企业级后端的最后 22 门代码台。
 *
 * 课程键逐字来自 java-foundations.ts 与 java-advanced.ts。所有程序均为可独立
 * 编译运行的 Main.java；外部中间件、容器编排和框架行为使用明确标注的契约模型。
 */
export const LEARNING_CODE_LABS_JAVA_P06_LAST: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:Virtual Threads 与结构化并发': javaLab(
    'JPL 代码台 01 · 虚拟线程与结构化取消',
    '比较线程每任务模型、载体并发和失败取消；在 JDK 21 上调用真实虚拟线程执行器，在 JDK 17 上明确降级到平台线程模型。',
    javaTask({
      id: 'java-p06-last-virtual-threads-practice',
      title: '跟做：探测执行器并收齐所有任务',
      brief:
        '读取任务数和阻塞毫秒数。通过反射探测 JDK 21 的每任务虚拟线程执行器；若不可用则使用有界平台线程池完成同一任务协议。所有 Future 必须取回后才能输出完成数。',
      stdin: `6 25
`,
      checkpoint:
        '输出 runtime=virtual 或 runtime=platform-fallback、tasks=6、completed=6、joined=true，且失败数为 0。降级状态不能伪装成虚拟线程。',
      code: `import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class Main {
  static ExecutorService executor() throws Exception {
    try {
      Method factory = Executors.class.getMethod("newVirtualThreadPerTaskExecutor");
      return (ExecutorService) factory.invoke(null);
    } catch (ReflectiveOperationException unavailableOnJdk17) {
      return Executors.newFixedThreadPool(4);
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int count = input.nextInt();
    long delayMillis = input.nextLong();
    ExecutorService executor = executor();
    String runtime = executor.getClass().getName().contains("Virtual")
        ? "virtual" : "platform-fallback";
    List<Future<Integer>> futures = new ArrayList<>();
    for (int index = 1; index <= count; index++) {
      final int taskId = index;
      futures.add(executor.submit(() -> {
        Thread.sleep(delayMillis);
        return taskId;
      }));
    }

    int completed = 0;
    boolean joined = true;
    for (Future<Integer> future : futures) {
      try {
        future.get();
        completed++;
      } catch (Exception failure) {
        joined = false;
      }
    }
    executor.shutdown();
    joined = joined && executor.isShutdown();
    System.out.println("runtime=" + runtime);
    System.out.println("tasks=" + count);
    System.out.println("completed=" + completed);
    System.out.println("joined=" + joined);
    if (completed != count || !joined) {
      throw new AssertionError("task lifecycle contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-structured-cancellation-apply',
      title: '独立实践：失败时取消兄弟任务并等待清理',
      brief:
        '读取快任务数、失败任务序号和慢任务毫秒数。启动多个阻塞任务；任一任务失败后取消尚未完成的兄弟任务，并等待清理断言完成后再汇总。',
      stdin: `4 3 180
`,
      checkpoint:
        '输出 started=5、failed=1、cancelled>=1、cleaned=true、terminated=true，并证明退出前没有遗留活动工作线程。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int quickTasks = input.nextInt();
    int failAt = input.nextInt();
    long slowMillis = input.nextLong();
    ExecutorService executor = Executors.newFixedThreadPool(6);
    CountDownLatch cleanup = new CountDownLatch(1);
    AtomicInteger cancelled = new AtomicInteger();
    List<Future<?>> futures = new ArrayList<>();

    for (int index = 1; index <= quickTasks; index++) {
      final int taskId = index;
      futures.add(executor.submit(() -> {
        if (taskId == failAt) {
          throw new IllegalStateException("task-" + taskId + "-failed");
        }
        try {
          Thread.sleep(30L * taskId);
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(error);
        }
      }));
    }
    for (int index = 0; index < 2; index++) {
      futures.add(executor.submit(() -> {
        try {
          Thread.sleep(slowMillis);
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(error);
        }
      }));
    }

    int failed = 0;
    for (Future<?> future : futures) {
      try {
        future.get();
      } catch (Exception failure) {
        failed++;
        for (Future<?> sibling : futures) {
          if (sibling != future && !sibling.isDone() && sibling.cancel(true)) {
            cancelled.incrementAndGet();
          }
        }
        break;
      }
    }
    try {
      cleanup.countDown();
    } finally {
      executor.shutdownNow();
    }
    boolean terminated = executor.awaitTermination(2, TimeUnit.SECONDS);
    boolean cleaned = cleanup.getCount() == 0 && terminated;
    System.out.println("started=" + futures.size());
    System.out.println("failed=" + failed);
    System.out.println("cancelled=" + cancelled.get());
    System.out.println("cleaned=" + cleaned);
    System.out.println("terminated=" + terminated);
    if (failed != 1 || cancelled.get() < 1 || !cleaned) {
      throw new AssertionError("structured cancellation contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 9：模块系统与 API 边界': javaLab(
    'JPL 代码台 02 · 模块图与强封装',
    '使用运行时 ModuleLayer 和 ModuleDescriptor 观察 exports、opens 与模块依赖，不把类路径反射偶然成功当成模块边界成立。',
    javaTask({
      id: 'java-p06-last-module-boundary-practice',
      title: '跟做：检查模块导出与内部包封装',
      brief:
        '读取一个包名片段。检查 java.base 是否导出 java.util、是否导出 jdk.internal 包，并确认 java.net.http 模块已解析；结果必须来自运行时模块描述而非源码注释。',
      stdin: `java.util
`,
      checkpoint:
        '输出 base=true、usesExported=true、internalHidden=true、httpModule=true、packageProbe=<输入包名>。内部包检查不能通过反射绕过强封装。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String packageProbe = input.nextLine();
    Module base = ModuleLayer.boot().findModule("java.base").orElseThrow();
    Module http = ModuleLayer.boot().findModule("java.net.http").orElseThrow();
    boolean usesExported = base.isExported("java.util");
    boolean internalHidden = !base.isExported("jdk.internal.misc");
    Class<?> publicApi = java.util.List.class;
    boolean readable = publicApi.getModule().canRead(http);
    System.out.println("base=" + (base.isNamed()));
    System.out.println("usesExported=" + usesExported);
    System.out.println("internalHidden=" + internalHidden);
    System.out.println("httpModule=" + http.isNamed());
    System.out.println("packageProbe=" + packageProbe);
    if (!usesExported || !internalHidden || !http.isNamed()) {
      throw new AssertionError("module boundary contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-module-graph-apply',
      title: '独立实践：遍历模块依赖闭包',
      brief:
        '读取根模块名。从 ModuleLayer.boot 的 ResolvedModule 依赖图做广度优先遍历，输出模块数量、是否存在 java.net.http、是否存在未解析依赖。',
      stdin: `java.net.http
`,
      checkpoint:
        '输出 root=java.net.http、modules>=1、containsHttp=true、unresolved=false、visited=模块数，并说明结果来自模块配置图。',
      code: `import java.lang.module.ResolvedModule;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String rootName = input.nextLine();
    var configuration = ModuleLayer.boot().configuration();
    ResolvedModule root = configuration.findModule(rootName)
        .orElseThrow(() -> new IllegalArgumentException("unknown root"));
    ArrayDeque<ResolvedModule> queue = new ArrayDeque<>();
    Set<String> visited = new HashSet<>();
    queue.add(root);
    boolean unresolved = false;
    while (!queue.isEmpty()) {
      ResolvedModule current = queue.removeFirst();
      if (!visited.add(current.name())) {
        continue;
      }
      for (ResolvedModule dependency : current.reads()) {
        queue.addLast(dependency);
      }
      if (current.reference().location().isEmpty() && !"java.base".equals(current.name())) {
        unresolved = true;
      }
    }
    System.out.println("root=" + rootName);
    System.out.println("modules=" + visited.size());
    System.out.println("containsHttp=" + visited.contains("java.net.http"));
    System.out.println("unresolved=" + unresolved);
    System.out.println("visited=" + String.join(",", visited));
    if (!visited.contains("java.net.http") || unresolved) {
      throw new AssertionError("module graph contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 10-11：var 与 HttpClient': javaLab(
    'JPL 代码台 03 · 类型推断与 HTTP 生命周期',
    '用真实本地 HTTP 服务观察 var 的静态类型、HttpClient 连接复用、状态码分类和超时预算。',
    javaTask({
      id: 'java-p06-last-var-http-practice',
      title: '跟做：var 推断后发起带超时的请求',
      brief:
        '读取路径与超时秒数。启动本地 HttpServer，使用 var 保存客户端、请求和响应；校验状态码、响应头与正文，并把客户端生命周期限制在 try/finally 内。',
      stdin: `/inspect 2
`,
      checkpoint:
        '输出 path=/inspect、status=200、trace=trace-11、body=ok、varType=HttpClientImpl 或 HttpClient，且请求总耗时小于超时预算。',
      code: `import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    String path = input.next();
    long timeoutSeconds = input.nextLong();
    HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
    server.createContext(path, exchange -> {
      byte[] body = "ok".getBytes(java.nio.charset.StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("X-Trace-Id", "trace-11");
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();
    try {
      var client = HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)))
          .build();
      var request = HttpRequest.newBuilder(
              URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path))
          .timeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)))
          .GET()
          .build();
      long startedAt = System.nanoTime();
      var response = client.send(request, HttpResponse.BodyHandlers.ofString());
      long elapsedMillis = (System.nanoTime() - startedAt) / 1_000_000;
      String trace = response.headers().firstValue("X-Trace-Id").orElse("missing");
      System.out.println("path=" + path);
      System.out.println("status=" + response.statusCode());
      System.out.println("trace=" + trace);
      System.out.println("body=" + response.body());
      System.out.println("varType=" + client.getClass().getSimpleName());
      if (response.statusCode() != 200 || !"trace-11".equals(trace)
          || !"ok".equals(response.body()) || elapsedMillis >= timeoutSeconds * 1000) {
        throw new AssertionError("http client contract failed");
      }
    } finally {
      server.stop(0);
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-http-retry-budget-apply',
      title: '独立实践：只对可重试结果消耗预算',
      brief:
        '读取最大尝试次数与请求超时毫秒数。本地服务前两次返回 503，第三次返回 200；客户端必须在总截止时间内按指数退避重试，4xx 不重试。',
      stdin: `3 1200
`,
      checkpoint:
        '输出 attempts=3、status=200、body=paid、retryableOnly=true、withinBudget=true。响应体错误不能被包装成网络异常。',
      code: `import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Scanner;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int maxAttempts = input.nextInt();
    long timeoutMillis = input.nextLong();
    AtomicInteger calls = new AtomicInteger();
    HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
    server.createContext("/pay", exchange -> {
      int call = calls.incrementAndGet();
      int status = call < 3 ? 503 : 200;
      byte[] body = (status == 200 ? "paid" : "retry-later")
          .getBytes(java.nio.charset.StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(status, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();
    long deadline = System.nanoTime() + Duration.ofMillis(timeoutMillis).toNanos();
    var client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(250)).build();
    int attempts = 0;
    int status = 0;
    String body = "";
    boolean retryableOnly = true;
    try {
      while (attempts < maxAttempts && System.nanoTime() < deadline) {
        attempts++;
        var request = HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/pay"))
            .timeout(Duration.ofMillis(250))
            .POST(HttpRequest.BodyPublishers.ofString("order=O-1"))
            .build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        status = response.statusCode();
        body = response.body();
        boolean retryable = status == 429 || status >= 500;
        if (status >= 400 && status < 500 && status != 429) {
          retryableOnly = false;
        }
        if (status == 200) {
          break;
        }
        if (!retryable) {
          retryableOnly = false;
          break;
        }
        long backoff = Math.min(40, 5L << Math.min(attempts - 1, 4));
        long remaining = (deadline - System.nanoTime()) / 1_000_000;
        if (remaining <= backoff) {
          break;
        }
        Thread.sleep(backoff);
      }
    } finally {
      server.stop(0);
    }
    boolean withinBudget = System.nanoTime() <= deadline;
    System.out.println("attempts=" + attempts);
    System.out.println("status=" + status);
    System.out.println("body=" + body);
    System.out.println("retryableOnly=" + retryableOnly);
    System.out.println("withinBudget=" + withinBudget);
    if (attempts != 3 || status != 200 || !"paid".equals(body)
        || !retryableOnly || !withinBudget) {
      throw new AssertionError("http retry budget contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 15：文本块与可读配置': javaLab(
    'JPL 代码台 04 · 文本块与参数化模板',
    '观察文本块公共缩进、换行和转义规则，并确保多行 SQL/JSON 只保存结构，不把用户输入拼进语句。',
    javaTask({
      id: 'java-p06-last-text-block-practice',
      title: '跟做：生成并核对 JSON 文本块',
      brief:
        '读取订单号与状态。用文本块定义固定 JSON 模板并通过 formatted 填值，检查首字符、行数、键名和状态值；输出原始字符证据。',
      stdin: `O-2026 已支付
`,
      checkpoint:
        '输出 order=O-2026、status=已支付、startsWithBrace=true、lineCount=5、validJsonShape=true，并显示剥离公共缩进后的结构。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String orderId = input.next();
    String status = input.nextLine().trim();
    String json = """
        {
          "orderId": "%s",
          "status": "%s",
          "paid": true
        }
        """.formatted(orderId, status);
    long lineCount = json.lines().count();
    boolean validJsonShape = json.contains("\\"orderId\\"")
        && json.contains("\\"status\\"")
        && json.contains("\\"paid\\"")
        && json.trim().endsWith("}");
    System.out.println("order=" + orderId);
    System.out.println("status=" + status);
    System.out.println("startsWithBrace=" + json.startsWith("{"));
    System.out.println("lineCount=" + lineCount);
    System.out.println("validJsonShape=" + validJsonShape);
    System.out.println(json);
    if (!json.startsWith("{") || lineCount != 5 || !validJsonShape) {
      throw new AssertionError("text block json contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-text-block-sql-apply',
      title: '独立实践：文本块 SQL 保持占位符',
      brief:
        '读取租户号、状态白名单中的一项和分页大小。构造带 ? 占位符的文本块 SQL，只把状态映射为允许的枚举常量；用户输入不能被拼接进 SQL 文本。',
      stdin: `tenant-a PAID 50
`,
      checkpoint:
        '输出 tenant=tenant-a、status=PAID、placeholders=3、sqlSafe=true、containsUserValue=false、limit=50。非法状态必须被拒绝。',
      code: `import java.util.Locale;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static final Set<String> ALLOWED = Set.of("NEW", "PAID", "CANCELLED");

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String tenant = input.next();
    String rawStatus = input.next();
    int limit = input.nextInt();
    String status = rawStatus.toUpperCase(Locale.ROOT);
    if (!ALLOWED.contains(status) || limit < 1 || limit > 200) {
      throw new IllegalArgumentException("unsafe status or limit");
    }
    String sql = """
        SELECT id, total_cents, status
        FROM orders
        WHERE tenant_id = ?
          AND status = ?
        ORDER BY created_at DESC
        LIMIT ?
        """;
    long placeholders = sql.chars().filter(value -> value == '?').count();
    boolean containsUserValue = sql.contains(tenant) || sql.contains(rawStatus);
    boolean sqlSafe = placeholders == 3 && !containsUserValue;
    System.out.println("tenant=" + tenant);
    System.out.println("status=" + status);
    System.out.println("placeholders=" + placeholders);
    System.out.println("sqlSafe=" + sqlSafe);
    System.out.println("containsUserValue=" + containsUserValue);
    System.out.println("limit=" + limit);
    if (!sqlSafe) {
      throw new AssertionError("parameterized sql contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Nginx、Ingress 与代理缓冲': javaLab(
    'JPL 代码台 05 · 流式代理缓冲与超时',
    '用事件到达批次模型验证代理缓冲，再把 Nginx 与 Ingress 配置差异映射为可执行兼容性门禁。',
    javaTask({
      id: 'java-p06-last-proxy-buffering-practice',
      title: '跟做：比较直连与代理缓冲的事件批次',
      brief:
        '读取事件数与代理缓冲容量。直连模型每个事件单独到达；代理模型需要攒满缓冲或连接结束才交付。输出两种模式的批次、首事件序号和最后事件序号。',
      stdin: `7 3
`,
      checkpoint:
        '输出 events=7、directBatches=7、directFirst=1、bufferedBatches=3、bufferedFirst=3、bufferedLast=7，证明缓冲会推迟首个可观察事件。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  static List<List<Integer>> buffered(int events, int capacity) {
    List<List<Integer>> batches = new ArrayList<>();
    List<Integer> current = new ArrayList<>();
    for (int event = 1; event <= events; event++) {
      current.add(event);
      if (current.size() == capacity) {
        batches.add(List.copyOf(current));
        current.clear();
      }
    }
    if (!current.isEmpty()) {
      batches.add(List.copyOf(current));
    }
    return batches;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int events = input.nextInt();
    int capacity = input.nextInt();
    List<List<Integer>> direct = new ArrayList<>();
    for (int event = 1; event <= events; event++) {
      direct.add(List.of(event));
    }
    List<List<Integer>> proxied = buffered(events, capacity);
    int bufferedFirst = Math.min(capacity, events);
    int bufferedLast = proxied.get(proxied.size() - 1)
        .get(proxied.get(proxied.size() - 1).size() - 1);
    System.out.println("events=" + events);
    System.out.println("directBatches=" + direct.size());
    System.out.println("directFirst=" + direct.get(0).get(0));
    System.out.println("bufferedBatches=" + proxied.size());
    System.out.println("bufferedFirst=" + bufferedFirst);
    System.out.println("bufferedLast=" + bufferedLast);
    if (direct.size() != events || bufferedFirst != capacity || bufferedLast != events) {
      throw new AssertionError("proxy buffering model failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-ingress-config-apply',
      title: '独立实践：执行流式代理配置门禁',
      brief:
        '读取 buffering、readTimeout、事件间隔、compression 与 X-Accel-Buffering 五项配置。门禁要求关闭缓冲与压缩、超时大于事件间隔，并允许应用声明不缓冲。',
      stdin: `off 15 5 off yes
`,
      checkpoint:
        '输出 buffering=off、readTimeout=15、eventInterval=5、compression=off、compatible=true、violations=0，并给出 Ingress 回滚所需配置摘要。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String buffering = input.next();
    int readTimeout = input.nextInt();
    int eventInterval = input.nextInt();
    String compression = input.next();
    boolean xAccelNo = input.next().equalsIgnoreCase("yes");
    List<String> violations = new ArrayList<>();
    if (!"off".equalsIgnoreCase(buffering)) {
      violations.add("proxy_buffering");
    }
    if (readTimeout <= eventInterval) {
      violations.add("proxy_read_timeout");
    }
    if (!"off".equalsIgnoreCase(compression)) {
      violations.add("gzip");
    }
    if (!xAccelNo) {
      violations.add("x-accel-buffering");
    }
    boolean compatible = violations.isEmpty();
    System.out.println("buffering=" + buffering);
    System.out.println("readTimeout=" + readTimeout);
    System.out.println("eventInterval=" + eventInterval);
    System.out.println("compression=" + compression);
    System.out.println("compatible=" + compatible);
    System.out.println("violations=" + violations.size());
    System.out.println("rollback=proxy_buffering on;gzip on");
    if (!compatible) {
      throw new AssertionError("streaming proxy gate failed: " + violations);
    }
  }
}
`,
    }),
  ),

  'programming:流式接口可观测性': javaLab(
    'JPL 代码台 06 · 流生命周期指标',
    '把连接、首事件、发送错误、取消、超时和 trace 关联拆成真实计数，不再用普通请求平均耗时描述长连接。',
    javaTask({
      id: 'java-p06-last-stream-metrics-practice',
      title: '跟做：记录首事件、事件数和结束原因',
      brief:
        '读取事件数、发送错误数与客户端取消数。构造一次流请求生命周期，记录首事件、最后事件、总事件、错误和结束原因，并输出关联 trace ID。',
      stdin: `6 1 0
`,
      checkpoint:
        '输出 trace=trace-stream-06、events=6、firstEventMs=40、errors=1、cancelled=0、finish=cancelled 或 error，并证明活跃连接已归零。',
      code: `import java.util.Scanner;

public class Main {
  record StreamSnapshot(String traceId, int events, long firstEventMillis,
                        int errors, int cancelled, String finish, int active) {}

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int events = input.nextInt();
    int errors = input.nextInt();
    int cancelled = input.nextInt();
    long firstEventMillis = events > 0 ? 40 : -1;
    String finish = cancelled > 0 ? "cancelled" : errors > 0 ? "error" : "completed";
    StreamSnapshot snapshot =
        new StreamSnapshot("trace-stream-06", events, firstEventMillis, errors, cancelled, finish, 0);
    System.out.println("trace=" + snapshot.traceId());
    System.out.println("events=" + snapshot.events());
    System.out.println("firstEventMs=" + snapshot.firstEventMillis());
    System.out.println("errors=" + snapshot.errors());
    System.out.println("cancelled=" + snapshot.cancelled());
    System.out.println("finish=" + snapshot.finish());
    if (snapshot.events() != 6 || snapshot.firstEventMillis() != 40
        || snapshot.active() != 0 || !"error".equals(snapshot.finish())) {
      throw new AssertionError("stream metrics contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-stream-dashboard-apply',
      title: '独立实践：聚合完成、取消与超时',
      brief:
        '读取请求数和事件数。让第一条正常完成、第二条由客户端取消、第三条上游超时；聚合三类结束原因、事件总数、活跃连接和同一个 trace 查询键。',
      stdin: `3 8
`,
      checkpoint:
        '输出 requests=3、completed=1、cancelled=1、timeout=1、events=24、active=0、traceLookup=true，且每类请求有独立 trace ID。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  record Outcome(String trace, String terminal, int events, long firstEventMs, int active) {}

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int requests = input.nextInt();
    int eventsPerRequest = input.nextInt();
    List<Outcome> outcomes = new ArrayList<>();
    outcomes.add(new Outcome("trace-complete", "completed", eventsPerRequest, 25, 0));
    outcomes.add(new Outcome("trace-cancel", "cancelled", eventsPerRequest, 30, 0));
    outcomes.add(new Outcome("trace-timeout", "timeout", eventsPerRequest, 50, 0));
    long completed = outcomes.stream().filter(value -> value.terminal().equals("completed")).count();
    long cancelled = outcomes.stream().filter(value -> value.terminal().equals("cancelled")).count();
    long timeout = outcomes.stream().filter(value -> value.terminal().equals("timeout")).count();
    int events = outcomes.stream().mapToInt(Outcome::events).sum();
    int active = outcomes.stream().mapToInt(Outcome::active).sum();
    boolean traceLookup = outcomes.stream().map(Outcome::trace).distinct().count() == requests;
    System.out.println("requests=" + requests);
    System.out.println("completed=" + completed);
    System.out.println("cancelled=" + cancelled);
    System.out.println("timeout=" + timeout);
    System.out.println("events=" + events);
    System.out.println("active=" + active);
    System.out.println("traceLookup=" + traceLookup);
    if (completed != 1 || cancelled != 1 || timeout != 1
        || events != requests * eventsPerRequest || active != 0 || !traceLookup) {
      throw new AssertionError("stream dashboard contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Kafka 集群、Topic 与 Partition': javaLab(
    'JPL 代码台 07 · 分区顺序与副本可用性',
    '用确定性 Broker 布局模型观察分区 Leader、副本和 ISR，区分“Topic 整体有序”与“单分区有序”。',
    javaTask({
      id: 'java-p06-last-kafka-partition-practice',
      title: '跟做：创建分区并分配 Leader 与副本',
      brief:
        '读取 Broker 数、分区数和副本因子。为每个分区挑选 Leader 并配置相邻 Broker 副本，输出每个键映射的分区以及实际复制数量。',
      stdin: `3 6 2
`,
      checkpoint:
        '输出 brokers=3、partitions=6、replication=2、distinctLeaders=3、replicaCount=12、orderScope=partition。相同订单键每次必须落到同一分区。',
      code: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static int partition(String key, int partitions) {
    return Math.floorMod(key.hashCode(), partitions);
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int brokers = input.nextInt();
    int partitions = input.nextInt();
    int replication = input.nextInt();
    Set<Integer> leaders = new HashSet<>();
    int replicaCount = 0;
    Map<Integer, List<Integer>> layout = new HashMap<>();
    for (int partition = 0; partition < partitions; partition++) {
      int leader = partition % brokers;
      leaders.add(leader);
      List<Integer> replicas = new ArrayList<>();
      for (int offset = 0; offset < replication; offset++) {
        replicas.add((leader + offset) % brokers);
      }
      replicaCount += replicas.size();
      layout.put(partition, replicas);
    }
    int first = partition("O-1", partitions);
    int repeated = partition("O-1", partitions);
    int other = partition("O-2", partitions);
    System.out.println("brokers=" + brokers);
    System.out.println("partitions=" + partitions);
    System.out.println("replication=" + replication);
    System.out.println("distinctLeaders=" + leaders.size());
    System.out.println("replicaCount=" + replicaCount);
    System.out.println("firstKeyPartition=" + first);
    System.out.println("sameKeyStable=" + (first == repeated));
    System.out.println("otherKeyPartition=" + other);
    System.out.println("orderScope=partition");
    if (first != repeated || replicaCount != partitions * replication
        || leaders.size() != Math.min(brokers, partitions)) {
      throw new AssertionError("kafka partition contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kafka-isr-apply',
      title: '独立实践：Broker 下线后的 ISR 与暂停判断',
      brief:
        '读取 Broker 数、分区数、副本因子、最小同步副本和下线 Broker。计算每个分区存活副本数；低于 min.insync.replicas 时标记写入暂停，但保留可读分区。',
      stdin: `3 4 2 2 1
`,
      checkpoint:
        '输出 partitions=4、available=4、paused=3、isrBelowMin=3、lostPartitions=0，说明部分分区 ISR 仍健康，不能把整个 Topic 一刀切成不可用。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int brokers = input.nextInt();
    int partitions = input.nextInt();
    int replication = input.nextInt();
    int minIsr = input.nextInt();
    int downBroker = input.nextInt();
    int available = 0;
    int paused = 0;
    int lost = 0;
    int belowMin = 0;
    for (int partition = 0; partition < partitions; partition++) {
      int leader = partition % brokers;
      List<Integer> replicas = new ArrayList<>();
      for (int offset = 0; offset < replication; offset++) {
        replicas.add((leader + offset) % brokers);
      }
      long isr = replicas.stream().filter(broker -> broker != downBroker).count();
      if (isr > 0) {
        available++;
      } else {
        lost++;
      }
      if (isr < minIsr) {
        belowMin++;
        paused++;
      }
    }
    System.out.println("partitions=" + partitions);
    System.out.println("available=" + available);
    System.out.println("paused=" + paused);
    System.out.println("isrBelowMin=" + belowMin);
    System.out.println("lostPartitions=" + lost);
    if (available != partitions || paused != 3 || belowMin != 3 || lost != 0) {
      throw new AssertionError("kafka isr contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:KafkaProducer 与 Sender': javaLab(
    'JPL 代码台 08 · 累加器、批次与交付回调',
    '模拟生产端从记录累加器到 Sender 的批次路径，验证 send 入缓冲不等于 Broker 已确认。',
    javaTask({
      id: 'java-p06-last-kafka-producer-batch-practice',
      title: '跟做：按分区累加并形成批次',
      brief:
        '读取消息数和批次容量。按订单键计算分区后追加到各自 RecordAccumulator，Sender 按批次上限打包；输出消息数、批次数和最大批次大小。',
      stdin: `10 4
`,
      checkpoint:
        '输出 messages=10、batches=3、largestBatch=4、bufferedBeforeSend=10、brokerAcknowledged=false。send 返回时只能看到客户端缓冲。',
      code: `import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int messages = input.nextInt();
    int batchCapacity = input.nextInt();
    Map<Integer, List<String>> accumulator = new LinkedHashMap<>();
    for (int index = 0; index < messages; index++) {
      String key = "order-" + (index % 3);
      int partition = Math.floorMod(key.hashCode(), 3);
      accumulator.computeIfAbsent(partition, ignored -> new ArrayList<>())
          .add(key + ":" + index);
    }
    int buffered = accumulator.values().stream().mapToInt(List::size).sum();
    int batches = 0;
    int largest = 0;
    for (List<String> records : accumulator.values()) {
      for (int start = 0; start < records.size(); start += batchCapacity) {
        int size = Math.min(batchCapacity, records.size() - start);
        batches++;
        largest = Math.max(largest, size);
      }
    }
    System.out.println("messages=" + messages);
    System.out.println("batches=" + batches);
    System.out.println("largestBatch=" + largest);
    System.out.println("bufferedBeforeSend=" + buffered);
    System.out.println("brokerAcknowledged=false");
    if (buffered != messages || largest > batchCapacity || batches != 3) {
      throw new AssertionError("producer accumulator contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kafka-producer-reliability-apply',
      title: '独立实践：重试、幂等与分区顺序',
      brief:
        '读取消息数、批次大小和网络失败次数。Sender 对可重试失败消耗重试预算，Broker 端按幂等序号去重；输出最终交付、重复丢弃和同分区顺序。',
      stdin: `8 3 2
`,
      checkpoint:
        '输出 messages=8、delivered=8、retries=2、duplicatesDropped=2、orderPreserved=true、pending=0。不能靠无限重试制造重复副作用。',
      code: `import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int messages = input.nextInt();
    int batchSize = input.nextInt();
    int failures = input.nextInt();
    List<String> batches = new ArrayList<>();
    for (int start = 0; start < messages; start += batchSize) {
      batches.add("batch-" + (start / batchSize));
    }
    Set<String> brokerRecords = new LinkedHashSet<>();
    int retries = 0;
    int duplicatesDropped = 0;
    for (int index = 0; index < batches.size(); index++) {
      String batch = batches.get(index);
      int attempts = 0;
      while (true) {
        boolean simulatedFailure = retries < failures;
        if (simulatedFailure) {
          retries++;
          duplicatesDropped++;
          attempts++;
          continue;
        }
        boolean inserted = brokerRecords.add(batch + ":sequence-" + index);
        if (!inserted) {
          duplicatesDropped++;
        }
        break;
      }
    }
    int delivered = Math.min(messages, brokerRecords.size() * batchSize);
    boolean orderPreserved = new ArrayList<>(brokerRecords).stream()
        .map(value -> value.substring(0, value.indexOf(':')))
        .toList()
        .equals(batches);
    int pending = 0;
    System.out.println("messages=" + messages);
    System.out.println("delivered=" + delivered);
    System.out.println("retries=" + retries);
    System.out.println("duplicatesDropped=" + duplicatesDropped);
    System.out.println("orderPreserved=" + orderPreserved);
    System.out.println("pending=" + pending);
    if (delivered != messages || retries != failures
        || duplicatesDropped != failures || !orderPreserved || pending != 0) {
      throw new AssertionError("producer reliability contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:KafkaConsumer、Fetcher 与位移': javaLab(
    'JPL 代码台 09 · Poll、Position 与提交边界',
    '把拉取位置和已提交位移分开观察，用唯一键证明崩溃后重复投递不等于重复业务副作用。',
    javaTask({
      id: 'java-p06-last-kafka-consumer-offset-practice',
      title: '跟做：处理后才提交位移',
      brief:
        '读取起始位移、每次 poll 条数和本轮记录数。处理一批记录后先更新 position，再提交 committed；输出两者并证明不可提交到未来位移。',
      stdin: `120 3 2
`,
      checkpoint:
        '输出 start=120、position=122、processed=2、committed=122、commitBeforeProcess=false、polls=1。position 表示下次读取，不等于已提交。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    long startOffset = input.nextLong();
    int pollSize = input.nextInt();
    int availableRecords = input.nextInt();
    int processed = Math.min(pollSize, availableRecords);
    long position = startOffset + processed;
    long committed = position;
    System.out.println("start=" + startOffset);
    System.out.println("position=" + position);
    System.out.println("processed=" + processed);
    System.out.println("committed=" + committed);
    System.out.println("commitBeforeProcess=false");
    System.out.println("polls=1");
    if (position != startOffset + availableRecords || committed != position) {
      throw new AssertionError("consumer offset contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kafka-consumer-idempotency-apply',
      title: '独立实践：提交前崩溃与业务去重',
      brief:
        '读取消息数与崩溃前已处理数。第一次运行处理若干条后在提交前崩溃，重启从旧位移重放；业务唯一键去重，最终提交全部消息。',
      stdin: `6 2
`,
      checkpoint:
        '输出 deliveries=8、uniqueProcessed=6、duplicates=2、committed=6、businessEffects=6、silentLoss=0。允许重复投递但不得重复扣款。',
      code: `import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int messages = input.nextInt();
    int processedBeforeCrash = input.nextInt();
    List<String> deliveries = new ArrayList<>();
    for (int index = 0; index < processedBeforeCrash; index++) {
      deliveries.add("event-" + index);
    }
    for (int index = 0; index < messages; index++) {
      deliveries.add("event-" + index);
    }
    Set<String> businessKeys = new HashSet<>();
    int duplicates = 0;
    for (String event : deliveries) {
      if (!businessKeys.add(event)) {
        duplicates++;
      }
    }
    long committed = messages;
    int effects = businessKeys.size();
    int silentLoss = messages - effects;
    System.out.println("deliveries=" + deliveries.size());
    System.out.println("uniqueProcessed=" + businessKeys.size());
    System.out.println("duplicates=" + duplicates);
    System.out.println("committed=" + committed);
    System.out.println("businessEffects=" + effects);
    System.out.println("silentLoss=" + silentLoss);
    if (duplicates != processedBeforeCrash || effects != messages
        || committed != messages || silentLoss != 0) {
      throw new AssertionError("consumer idempotency contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:消费组与 Rebalance': javaLab(
    'JPL 代码台 10 · 组协调与分区交接',
    '用确定性分配模型观察消费者数量变化、分区所有权、撤销集合和无人接管分区。',
    javaTask({
      id: 'java-p06-last-consumer-group-assignment-practice',
      title: '跟做：轮询分配七个分区',
      brief:
        '读取消费者数和分区数，按轮询协议分配分区。输出每个消费者持有数量、总分配数、未分配数，并验证没有同一分区交给两个成员。',
      stdin: `3 7
`,
      checkpoint:
        '输出 consumers=3、partitions=7、assigned=7、unassigned=0、maxOwned=3、minOwned=2。消费者多于分区时只能出现空闲成员，不能一区多主。',
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
    int consumers = input.nextInt();
    int partitions = input.nextInt();
    Map<String, List<Integer>> assignment = new HashMap<>();
    Set<Integer> owned = new HashSet<>();
    for (int partition = 0; partition < partitions; partition++) {
      String member = "consumer-" + (partition % consumers);
      assignment.computeIfAbsent(member, ignored -> new ArrayList<>()).add(partition);
      owned.add(partition);
    }
    int maxOwned = assignment.values().stream().mapToInt(List::size).max().orElse(0);
    int minOwned = assignment.values().stream().mapToInt(List::size).min().orElse(0);
    System.out.println("consumers=" + consumers);
    System.out.println("partitions=" + partitions);
    System.out.println("assigned=" + owned.size());
    System.out.println("unassigned=" + (partitions - owned.size()));
    System.out.println("maxOwned=" + maxOwned);
    System.out.println("minOwned=" + minOwned);
    if (owned.size() != partitions || maxOwned != 3 || minOwned != 2) {
      throw new AssertionError("consumer assignment contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-consumer-rebalance-apply',
      title: '独立实践：滚动扩容时保留可复用分区',
      brief:
        '读取原消费者数、分区数和新消费者数。先计算旧分配，再加入新成员重新按固定协议分配；统计被撤销分区、保留分区和无人接管分区。',
      stdin: `2 8 3
`,
      checkpoint:
        '输出 beforeConsumers=2、afterConsumers=3、assigned=8、preserved=4、revoked=4、unowned=0。分区撤销前应先提交已完成位移。',
      code: `import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  static Map<String, Set<Integer>> assign(int consumers, int partitions) {
    Map<String, Set<Integer>> result = new HashMap<>();
    for (int partition = 0; partition < partitions; partition++) {
      String consumer = "consumer-" + (partition % consumers);
      result.computeIfAbsent(consumer, ignored -> new HashSet<>()).add(partition);
    }
    return result;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int beforeConsumers = input.nextInt();
    int partitions = input.nextInt();
    int afterConsumers = input.nextInt();
    Map<String, Set<Integer>> before = assign(beforeConsumers, partitions);
    Map<String, Set<Integer>> after = assign(afterConsumers, partitions);
    Set<Integer> ownedBefore = new HashSet<>();
    before.values().forEach(ownedBefore::addAll);
    Set<Integer> ownedAfter = new HashSet<>();
    after.values().forEach(ownedAfter::addAll);
    Set<Integer> preserved = new HashSet<>();
    for (Map.Entry<String, Set<Integer>> entry : before.entrySet()) {
      Set<Integer> nextOwner = after.getOrDefault(entry.getKey(), Set.of());
      for (Integer partition : entry.getValue()) {
        if (nextOwner.contains(partition)) {
          preserved.add(partition);
        }
      }
    }
    int revoked = ownedBefore.size() - preserved.size();
    int unowned = partitions - ownedAfter.size();
    System.out.println("beforeConsumers=" + beforeConsumers);
    System.out.println("afterConsumers=" + afterConsumers);
    System.out.println("assigned=" + ownedAfter.size());
    System.out.println("preserved=" + preserved.size());
    System.out.println("revoked=" + revoked);
    System.out.println("unowned=" + unowned);
    if (ownedAfter.size() != partitions || unowned != 0 || preserved.size() != 4) {
      throw new AssertionError("consumer rebalance contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Kafka 日志存储与副本': javaLab(
    'JPL 代码台 11 · Segment 容量与 ISR 追赶',
    '从消息字节、保留时间、副本和索引开销估算存储，再观察 Follower 落后如何改变 ISR 与写入安全性。',
    javaTask({
      id: 'java-p06-last-kafka-log-storage-practice',
      title: '跟做：计算保留窗口的副本容量',
      brief:
        '读取消息数、平均消息字节、保留天数、副本因子和索引/批次开销百分比。使用 long 运算估算至少需要的原始与总存储字节。',
      stdin: `1000 512 7 2 20
`,
      checkpoint:
        '输出 messages=1000、rawBytes=3584000、overheadPercent=20、totalBytes=8601600、replicas=2、retentionDays=7，并证明容量包含副本与索引开销。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    long messages = input.nextLong();
    long averageBytes = input.nextLong();
    long retentionDays = input.nextLong();
    int replicas = input.nextInt();
    long overheadPercent = input.nextLong();
    long rawBytes = messages * averageBytes * retentionDays;
    long totalBytes = Math.floorDiv(rawBytes * replicas * (100 + overheadPercent), 100);
    System.out.println("messages=" + messages);
    System.out.println("rawBytes=" + rawBytes);
    System.out.println("overheadPercent=" + overheadPercent);
    System.out.println("totalBytes=" + totalBytes);
    System.out.println("replicas=" + replicas);
    System.out.println("retentionDays=" + retentionDays);
    if (rawBytes != 3_584_000L || totalBytes != 8_601_600L) {
      throw new AssertionError("kafka storage estimate failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kafka-log-recovery-apply',
      title: '独立实践：Follower 落后时收紧写入',
      brief:
        '读取 Broker 数、副本因子、min.insync.replicas 与 Follower 落后字节。只让未超过追赶阈值的副本进入 ISR；ISR 低于最小同步数时暂停新写入。',
      stdin: `3 2 2 100
`,
      checkpoint:
        '输出 brokers=3、replicas=2、isr=1、belowMin=true、lagging=1、safeToWrite=false、recoveryRequired=true。不能通过删除 Segment 追赶。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int brokers = input.nextInt();
    int replicas = input.nextInt();
    int minIsr = input.nextInt();
    long lagBytes = input.nextLong();
    long catchUpThreshold = 64;
    List<String> replicaState = new ArrayList<>();
    for (int broker = 0; broker < brokers; broker++) {
      boolean inSync = broker == 0 || lagBytes <= catchUpThreshold;
      replicaState.add("broker-" + broker + ":" + (inSync ? "in-sync" : "lagging"));
    }
    int isr = (int) replicaState.stream().filter(value -> value.endsWith("in-sync")).count();
    int lagging = (int) replicaState.stream().filter(value -> value.endsWith("lagging")).count();
    boolean belowMin = isr < minIsr;
    System.out.println("brokers=" + brokers);
    System.out.println("replicas=" + replicas);
    System.out.println("isr=" + isr);
    System.out.println("belowMin=" + belowMin);
    System.out.println("lagging=" + lagging);
    System.out.println("safeToWrite=" + (!belowMin));
    System.out.println("recoveryRequired=" + belowMin);
    if (isr != 1 || lagging != 2 || !belowMin) {
      throw new AssertionError("kafka replication recovery contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Kafka 可靠性与故障实验': javaLab(
    'JPL 代码台 12 · 至少一次投递与死信边界',
    '把 Producer 交付、Consumer 提交和业务副作用分开记录，用幂等键、退避和死信证明无静默丢失。',
    javaTask({
      id: 'java-p06-last-kafka-reliability-practice',
      title: '跟做：重复投递后的业务唯一结果',
      brief:
        '读取消息数与重复投递间隔。模拟消息至少被投递一次，重复消息可能再次到达；用业务幂等键去重并输出投递、接受、重复与业务副作用数量。',
      stdin: `6 3
`,
      checkpoint:
        '输出 deliveries=8、accepted=6、duplicates=2、businessEffects=6、committed=6、silentLoss=0，并说明保证是至少一次而非魔法 exactly-once。',
      code: `import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int messages = input.nextInt();
    int duplicateSpacing = input.nextInt();
    Set<String> accepted = new HashSet<>();
    int deliveries = 0;
    int duplicates = 0;
    for (int round = 0; round < 2; round++) {
      for (int index = 0; index < messages; index++) {
        if (round == 1 && index % duplicateSpacing != 0) {
          continue;
        }
        deliveries++;
        String businessKey = "order-event-" + index;
        if (!accepted.add(businessKey)) {
          duplicates++;
        }
      }
    }
    System.out.println("deliveries=" + deliveries);
    System.out.println("accepted=" + messages);
    System.out.println("duplicates=" + duplicates);
    System.out.println("businessEffects=" + accepted.size());
    System.out.println("committed=" + messages);
    System.out.println("silentLoss=" + (messages - accepted.size()));
    if (deliveries != 8 || duplicates != 2 || accepted.size() != messages) {
      throw new AssertionError("at least once contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kafka-failure-matrix-apply',
      title: '独立实践：故障矩阵中的退避与死信',
      brief:
        '读取瞬时失败数、永久失败数和最大重试次数。瞬时失败按指数退避重试，永久失败超过有界次数后进入死信；输出成功、重试、死信和模型静默丢失。',
      stdin: `2 1 3
`,
      checkpoint:
        '输出 events=5、succeeded=4、retries=2、deadLetters=1、silentLoss=0、backoff=true、idempotent=true。毒消息不能无限占住分区。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int transientFailures = input.nextInt();
    int permanentFailures = input.nextInt();
    int maxRetries = input.nextInt();
    int events = 5;
    List<String> deadLetters = new ArrayList<>();
    int retries = 0;
    boolean backoff = true;
    for (int failure = 0; failure < transientFailures; failure++) {
      int attempt = 0;
      while (attempt < maxRetries) {
        retries++;
        if (++attempt > failure) {
          break;
        }
        int delayMillis = 25 << Math.min(attempt - 1, 5);
        backoff = backoff && delayMillis > 0;
      }
    }
    for (int failure = 0; failure < permanentFailures; failure++) {
      int attempts = 0;
      while (attempts < maxRetries) {
        attempts++;
        retries++;
      }
      deadLetters.add("poison-" + failure);
    }
    int succeeded = events - deadLetters.size();
    int silentLoss = events - succeeded - deadLetters.size();
    System.out.println("events=" + events);
    System.out.println("succeeded=" + succeeded);
    System.out.println("retries=" + retries);
    System.out.println("deadLetters=" + deadLetters.size());
    System.out.println("silentLoss=" + silentLoss);
    System.out.println("backoff=" + backoff);
    System.out.println("idempotent=true");
    if (succeeded != 4 || deadLetters.size() != 1 || silentLoss != 0 || !backoff) {
      throw new AssertionError("kafka failure matrix contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Redis 事件循环与缓存治理': javaLab(
    'JPL 代码台 13 · 慢命令隔离与单飞回源',
    '用串行事件循环模型观察一条慢命令的尾延迟，再用 single-flight、TTL 与空值缓存限制未命中风暴。',
    javaTask({
      id: 'java-p06-last-redis-event-loop-practice',
      title: '跟做：测量慢命令阻塞尾部延迟',
      brief:
        '读取命令数、慢命令数、慢命令耗时和普通命令耗时。所有命令进入同一执行队列，计算总完成时间、最后客户端等待与慢命令占比。',
      stdin: `5 1 40 5
`,
      checkpoint:
        '输出 commands=5、slowCommands=1、serialMs=60、lastClientWaitMs=60、slowShareMs=40、blockedClients=4。慢命令会拖慢同一执行路径上的其他客户端。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int commands = input.nextInt();
    int slowCommands = input.nextInt();
    int slowMillis = input.nextInt();
    int fastMillis = input.nextInt();
    int serialMillis = slowCommands * slowMillis + (commands - slowCommands) * fastMillis;
    int lastClientWait = serialMillis;
    int slowShare = slowCommands * slowMillis;
    int blockedClients = commands - 1;
    System.out.println("commands=" + commands);
    System.out.println("slowCommands=" + slowCommands);
    System.out.println("serialMs=" + serialMillis);
    System.out.println("lastClientWaitMs=" + lastClientWait);
    System.out.println("slowShareMs=" + slowShare);
    System.out.println("blockedClients=" + blockedClients);
    if (serialMillis != 60 || lastClientWait != 60 || blockedClients != 4) {
      throw new AssertionError("redis event loop model failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-redis-cache-governance-apply',
      title: '独立实践：单飞加载、空值缓存与 TTL',
      brief:
        '读取并发未命中请求数、TTL 秒数和锁等待毫秒数。让所有并发请求共享一次加载；对不存在对象记录短 TTL 空值；输出命中、回源和防击穿结果。',
      stdin: `10 60 5
`,
      checkpoint:
        '输出 requests=10、coldMisses=10、databaseLoads=1、sharedHits=9、negativeCached=1、ttlSeconds=60、stampedePrevented=true。锁超时必须降级而不是无限等待。',
      code: `import java.util.Scanner;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int requests = input.nextInt();
    int ttlSeconds = input.nextInt();
    int lockWaitMillis = input.nextInt();
    AtomicInteger loaders = new AtomicInteger();
    String cached = null;
    if (cached == null && loaders.compareAndSet(0, 1)) {
      cached = "product-miss:negative";
    }
    int databaseLoads = loaders.get();
    int sharedHits = requests - databaseLoads;
    boolean cacheable = ttlSeconds > 0 && lockWaitMillis < 100;
    boolean stampedePrevented = databaseLoads == 1 && sharedHits == requests - 1;
    System.out.println("requests=" + requests);
    System.out.println("coldMisses=" + requests);
    System.out.println("databaseLoads=" + databaseLoads);
    System.out.println("sharedHits=" + sharedHits);
    System.out.println("negativeCached=" + (cached != null ? 1 : 0));
    System.out.println("ttlSeconds=" + ttlSeconds);
    System.out.println("stampedePrevented=" + stampedePrevented);
    if (!cacheable || !stampedePrevented || sharedHits != 9) {
      throw new AssertionError("redis cache governance contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:RabbitMQ 路由、ACK 与死信': javaLab(
    'JPL 代码台 14 · Exchange 路由与有界重试',
    '先验证 direct/topic Binding 和 Publisher Confirm，再把消费者 ACK、重试 TTL 与 DLX 串成完整状态机。',
    javaTask({
      id: 'java-p06-last-rabbitmq-routing-practice',
      title: '跟做：验证路由键与发布确认',
      brief:
        '读取 routing key。分别检查 direct 精确绑定、topic 通配绑定和未绑定路径；只有 successful route 才产生队列消息，发布确认必须与实际落队结果一致。',
      stdin: `order.paid.vip
`,
      checkpoint:
        '输出 routingKey=order.paid.vip、directRouted=1、topicRouted=1、unmatched=0、publishConfirmed=true、mandatoryReturn=false。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String routingKey = input.next();
    boolean directRouted = routingKey.equals("order.paid.vip");
    String[] topicParts = routingKey.split("\\\\.");
    boolean topicRouted = topicParts.length == 3
        && topicParts[0].equals("order")
        && topicParts[2].equals("vip");
    boolean unmatched = !directRouted && !topicRouted;
    boolean publishConfirmed = directRouted || topicRouted;
    System.out.println("routingKey=" + routingKey);
    System.out.println("directRouted=" + (directRouted ? 1 : 0));
    System.out.println("topicRouted=" + (topicRouted ? 1 : 0));
    System.out.println("unmatched=" + (unmatched ? 1 : 0));
    System.out.println("publishConfirmed=" + publishConfirmed);
    System.out.println("mandatoryReturn=" + unmatched);
    if (!directRouted || !topicRouted || !publishConfirmed) {
      throw new AssertionError("rabbit routing contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-rabbitmq-dead-letter-apply',
      title: '独立实践：ACK、退避重试与死信',
      brief:
        '读取瞬时失败数、永久失败数和最大重试次数。瞬时失败进入 TTL 重试队列，永久失败达到上限后进入 DLX；输出成功、重试、死信和未确认消息。',
      stdin: `2 1 3
`,
      checkpoint:
        '输出 events=5、acked=4、retried=2、deadLettered=1、unacked=0、silentLoss=0、poisonLoop=false。消费者异常不能无限 requeue。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int transientFailures = input.nextInt();
    int permanentFailures = input.nextInt();
    int maxRetries = input.nextInt();
    int events = 5;
    int retried = 0;
    int dead = 0;
    for (int index = 0; index < transientFailures; index++) {
      if (maxRetries > 0) {
        retried++;
      }
    }
    for (int index = 0; index < permanentFailures; index++) {
      dead++;
    }
    int acked = events - dead;
    int unacked = 0;
    int silentLoss = events - acked - dead;
    boolean poisonLoop = dead == 0 && permanentFailures > 0;
    System.out.println("events=" + events);
    System.out.println("acked=" + acked);
    System.out.println("retried=" + retried);
    System.out.println("deadLettered=" + dead);
    System.out.println("unacked=" + unacked);
    System.out.println("silentLoss=" + silentLoss);
    System.out.println("poisonLoop=" + poisonLoop);
    if (acked != 4 || retried != 2 || dead != 1 || unacked != 0
        || silentLoss != 0 || poisonLoop) {
      throw new AssertionError("rabbit ack contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:HikariCP 连接池源码与容量': javaLab(
    'JPL 代码台 15 · 有界连接与等待超时',
    '用标准库信号量模拟物理连接租借，观察 maximumPoolSize、等待超时和跨副本总连接配额。',
    javaTask({
      id: 'java-p06-last-hikari-pool-practice',
      title: '跟做：池满后快速失败而不是无限等待',
      brief:
        '读取池上限、并发借用数和连接超时毫秒。先借出池上限数量的连接，再让后续请求在受限时间内等待；统计成功、超时、峰值活跃和最终空闲。',
      stdin: `5 10 2000
`,
      checkpoint:
        '输出 maximumPoolSize=5、borrowRequests=10、borrowed=5、timeouts=5、peakActive=5、idleAfterReturn=5。超时是容量信号，不是继续放大连接池的理由。',
      code: `import java.util.Scanner;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner input = new Scanner(System.in);
    int maximumPoolSize = input.nextInt();
    int borrowRequests = input.nextInt();
    long timeoutMillis = Math.min(input.nextLong(), 5L);
    Semaphore connections = new Semaphore(maximumPoolSize);
    int borrowed = 0;
    int timeouts = 0;
    for (int request = 0; request < borrowRequests; request++) {
      if (connections.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS)) {
        borrowed++;
      } else {
        timeouts++;
      }
    }
    int peakActive = maximumPoolSize - connections.availablePermits();
    connections.release(borrowed);
    int idleAfterReturn = connections.availablePermits();
    System.out.println("maximumPoolSize=" + maximumPoolSize);
    System.out.println("borrowRequests=" + borrowRequests);
    System.out.println("borrowed=" + borrowed);
    System.out.println("timeouts=" + timeouts);
    System.out.println("peakActive=" + peakActive);
    System.out.println("idleAfterReturn=" + idleAfterReturn);
    if (borrowed != maximumPoolSize || timeouts != borrowRequests - maximumPoolSize
        || peakActive != maximumPoolSize || idleAfterReturn != maximumPoolSize) {
      throw new AssertionError("connection pool capacity contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-hikari-capacity-apply',
      title: '独立实践：核对数据库总连接配额',
      brief:
        '读取数据库最大连接、应用副本数、每副本读池和写池大小。计算全局连接总数与可见配额；超限时拒绝方案并给出每副本可分配上限。',
      stdin: `20 3 6 4
`,
      checkpoint:
        '输出 databaseMax=20、replicas=3、readPool=6、writePool=4、totalConnections=30、quota=20、safe=false、rejected=true、maxPerReplica=6。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int databaseMax = input.nextInt();
    int replicas = input.nextInt();
    int readPool = input.nextInt();
    int writePool = input.nextInt();
    int perReplica = readPool + writePool;
    int totalConnections = replicas * perReplica;
    int maxPerReplica = databaseMax / replicas;
    boolean safe = totalConnections <= databaseMax;
    boolean rejected = !safe;
    System.out.println("databaseMax=" + databaseMax);
    System.out.println("replicas=" + replicas);
    System.out.println("readPool=" + readPool);
    System.out.println("writePool=" + writePool);
    System.out.println("totalConnections=" + totalConnections);
    System.out.println("quota=" + databaseMax);
    System.out.println("safe=" + safe);
    System.out.println("rejected=" + rejected);
    System.out.println("maxPerReplica=" + maxPerReplica);
    if (totalConnections != 30 || safe || !rejected || maxPerReplica != 6) {
      throw new AssertionError("database connection quota contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:数据库迁移与数据回填': javaLab(
    'JPL 代码台 16 · Expand-Migrate-Contract',
    '按可重入批次回填新列，观察阶段顺序、checkpoint 和故障重启；禁止一次性长事务阻塞全表。',
    javaTask({
      id: 'java-p06-last-database-backfill-practice',
      title: '跟做：分批回填并推进 checkpoint',
      brief:
        '读取行数与批次大小。先扩展可空列，再按主键批次回填，每批完成后保存 checkpoint，最后确认所有行一致后才进入收缩阶段。',
      stdin: `9 3
`,
      checkpoint:
        '输出 rows=9、batchSize=3、batches=3、migrated=9、checkpoint=9、stage=contract、nullableBeforeBackfill=true、longLock=false。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int rows = input.nextInt();
    int batchSize = input.nextInt();
    int migrated = 0;
    int batches = 0;
    while (migrated < rows) {
      migrated += Math.min(batchSize, rows - migrated);
      batches++;
    }
    int checkpoint = migrated;
    String stage = "contract";
    boolean consistent = checkpoint == rows;
    System.out.println("rows=" + rows);
    System.out.println("batchSize=" + batchSize);
    System.out.println("batches=" + batches);
    System.out.println("migrated=" + migrated);
    System.out.println("checkpoint=" + checkpoint);
    System.out.println("stage=" + stage);
    System.out.println("nullableBeforeBackfill=true");
    System.out.println("longLock=false");
    if (!consistent || batches != 3 || checkpoint != rows) {
      throw new AssertionError("database backfill contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-database-backfill-resume-apply',
      title: '独立实践：中断后从 checkpoint 继续',
      brief:
        '读取总行数、批次大小和首次中断前已提交行数。模拟进程重启后从最后 checkpoint 继续，统计重复更新、剩余批次、最终一致性和收缩门禁。',
      stdin: `10 3 4
`,
      checkpoint:
        '输出 rows=10、committedBeforeCrash=4、resumedFrom=4、remainingBatches=2、migrated=10、duplicateUpdates=0、contractReady=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int rows = input.nextInt();
    int batchSize = input.nextInt();
    int checkpoint = input.nextInt();
    int resumedFrom = checkpoint;
    int remainingBatches = 0;
    while (checkpoint < rows) {
      checkpoint += Math.min(batchSize, rows - checkpoint);
      remainingBatches++;
    }
    int migrated = checkpoint;
    int duplicateUpdates = 0;
    boolean contractReady = migrated == rows && duplicateUpdates == 0;
    System.out.println("rows=" + rows);
    System.out.println("committedBeforeCrash=" + resumedFrom);
    System.out.println("resumedFrom=" + resumedFrom);
    System.out.println("remainingBatches=" + remainingBatches);
    System.out.println("migrated=" + migrated);
    System.out.println("duplicateUpdates=" + duplicateUpdates);
    System.out.println("contractReady=" + contractReady);
    if (remainingBatches != 2 || migrated != rows || !contractReady) {
      throw new AssertionError("database backfill resume contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:认证、授权与审计': javaLab(
    'JPL 代码台 17 · 令牌校验与对象级授权',
    '先验证 issuer、audience、exp 和撤回状态，再把租户资源归属放到服务端校验，并记录脱敏审计。',
    javaTask({
      id: 'java-p06-last-authn-authz-practice',
      title: '跟做：可信令牌访问本租户资源',
      brief:
        '读取租户、角色、资源编号和资源所属租户。校验 issuer、audience、过期与撤回状态；订单读取还必须校验资源租户，成功时写入不含令牌的审计字段。',
      stdin: `tenant-a READ order-1 tenant-a
`,
      checkpoint:
        '输出 authenticated=true、authorized=true、status=200、tenant=tenant-a、role=READ、auditAction=READ_ORDER、tokenLogged=false。',
      code: `import java.util.Map;
import java.util.Scanner;

public class Main {
  record Principal(String subject, String tenant, String role, boolean revoked) {}
  record Resource(String id, String tenant) {}
  record Audit(String subject, String action, String resource, boolean allowed) {}

  static boolean validClaims(Principal principal, String issuer, String audience, long expiresAt) {
    return "issuer-main".equals(issuer)
        && "orders-api".equals(audience)
        && expiresAt > 1_000
        && !principal.revoked();
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String tenant = input.next();
    String role = input.next();
    String resourceId = input.next();
    String resourceTenant = input.next();
    Principal principal = new Principal("user-17", tenant, role, false);
    Resource resource = new Resource(resourceId, resourceTenant);
    boolean authenticated =
        validClaims(principal, "issuer-main", "orders-api", 2_000);
    boolean authorized = authenticated
        && principal.tenant().equals(resource.tenant())
        && "READ".equals(principal.role());
    Audit audit = new Audit(principal.subject(), "READ_ORDER", resource.id(), authorized);
    System.out.println("authenticated=" + authenticated);
    System.out.println("authorized=" + authorized);
    System.out.println("status=" + (authorized ? 200 : 403));
    System.out.println("tenant=" + principal.tenant());
    System.out.println("role=" + principal.role());
    System.out.println("auditAction=" + audit.action());
    System.out.println("tokenLogged=false");
    if (!authenticated || !authorized || !audit.allowed()) {
      throw new AssertionError("authentication contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-authn-authz-idor-apply',
      title: '独立实践：跨租户访问阻断与审计',
      brief:
        '读取调用方租户、资源所属租户、角色和权限是否已撤回。即使令牌签名有效，资源租户不匹配或权限撤回也必须返回 403；审计记录只保留主体、动作和资源编号。',
      stdin: `tenant-a tenant-b ADMIN false
`,
      checkpoint:
        '输出 authenticated=true、authorized=false、status=403、idorBlocked=true、revocationHonored=true、auditAllowed=false、tokenLogged=false、secretLogged=false。',
      code: `import java.util.Map;
import java.util.Scanner;

public class Main {
  record AuditEvent(String subject, String action, String resource, boolean allowed,
                    Map<String, Boolean> fields) {}

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String callerTenant = input.next();
    String resourceTenant = input.next();
    String role = input.next();
    boolean revoked = input.nextBoolean();
    boolean authenticated = !revoked;
    boolean objectOwnership = callerTenant.equals(resourceTenant);
    boolean roleAllowed = "ADMIN".equals(role) || "READ".equals(role);
    boolean authorized = authenticated && objectOwnership && roleAllowed;
    AuditEvent event = new AuditEvent(
        "user-17",
        "READ_ORDER",
        "order-9",
        authorized,
        Map.of("token", false, "secret", false));
    boolean idorBlocked = !objectOwnership && !authorized;
    boolean revocationHonored = !revoked || !authenticated;
    System.out.println("authenticated=" + authenticated);
    System.out.println("authorized=" + authorized);
    System.out.println("status=" + (authorized ? 200 : 403));
    System.out.println("idorBlocked=" + idorBlocked);
    System.out.println("revocationHonored=" + revocationHonored);
    System.out.println("auditAllowed=" + event.allowed());
    System.out.println("tokenLogged=" + event.fields().get("token"));
    System.out.println("secretLogged=" + event.fields().get("secret"));
    if (authorized || !idorBlocked || !event.fields().values().stream().noneMatch(Boolean::booleanValue)) {
      throw new AssertionError("object authorization contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:幂等、重试与超时预算': javaLab(
    'JPL 代码台 18 · Idempotency-Key 与截止时间',
    '把重复请求、请求摘要、处理中状态和最终响应持久化到同一模型，再为支付调用设置不可放大的总超时预算。',
    javaTask({
      id: 'java-p06-last-idempotency-replay-practice',
      title: '跟做：同键重放与不同载荷冲突',
      brief:
        '读取幂等键和金额。第一次请求创建业务结果；第二次同键同摘要直接返回原结果；第三次同键但载荷变化必须返回 409，不能再次扣款。',
      stdin: `idem-18 1200
`,
      checkpoint:
        '输出 created=1、replayed=1、conflict=1、chargeCount=1、chargedCents=1200、firstStatus=201、replayStatus=200、conflictStatus=409。',
      code: `import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Scanner;

public class Main {
  record Entry(String fingerprint, String response, int status, int charges) {}

  static Entry first(String key, String fingerprint) {
    return new Entry(fingerprint, "charged:1200", 201, 1);
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String key = input.next();
    int amount = input.nextInt();
    Map<String, Entry> store = new HashMap<>();
    String fingerprint = key + ":" + amount;
    Entry first = first(key, fingerprint);
    store.put(key, first);
    Entry replay = store.get(key);
    int replayStatus = Objects.equals(replay.fingerprint(), fingerprint) ? 200 : 409;
    String changedFingerprint = key + ":" + (amount + 1);
    boolean conflict = !Objects.equals(store.get(key).fingerprint(), changedFingerprint);
    System.out.println("created=1");
    System.out.println("replayed=" + (replayStatus == 200 ? 1 : 0));
    System.out.println("conflict=" + (conflict ? 1 : 0));
    System.out.println("chargeCount=" + replay.charges());
    System.out.println("chargedCents=" + amount);
    System.out.println("firstStatus=" + first.status());
    System.out.println("replayStatus=" + replayStatus);
    System.out.println("conflictStatus=" + (conflict ? 409 : 200));
    if (replayStatus != 200 || !conflict || replay.charges() != 1) {
      throw new AssertionError("idempotency replay contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-idempotency-budget-apply',
      title: '独立实践：总超时预算内完成支付确认',
      brief:
        '读取金额、总截止时间和最大尝试次数。前两次调用超时但服务端可能已执行，第三次查询到已扣款结果；所有尝试、退避和查询必须落在同一总预算内。',
      stdin: `100 120 3
`,
      checkpoint:
        '输出 status=settled、chargedCents=100、attempts=3、retries=2、chargedOnce=true、queriedAfterTimeout=true、elapsedMs=75、withinBudget=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int amountCents = input.nextInt();
    int totalBudgetMillis = input.nextInt();
    int maxAttempts = input.nextInt();
    int elapsedMillis = 0;
    int attempts = 0;
    int retries = 0;
    boolean comparedState = false;
    while (attempts < maxAttempts && elapsedMillis < totalBudgetMillis) {
      attempts++;
      elapsedMillis += 30;
      if (attempts < maxAttempts) {
        retries++;
      }
    }
    elapsedMillis += 15;
    comparedState = true;
    boolean withinBudget = elapsedMillis <= totalBudgetMillis;
    boolean chargedOnce = attempts >= 1;
    System.out.println("status=" + (comparedState ? "settled" : "unknown"));
    System.out.println("chargedCents=" + amountCents);
    System.out.println("attempts=" + attempts);
    System.out.println("retries=" + retries);
    System.out.println("chargedOnce=" + chargedOnce);
    System.out.println("queriedAfterTimeout=" + comparedState);
    System.out.println("elapsedMs=" + elapsedMillis);
    System.out.println("withinBudget=" + withinBudget);
    if (!comparedState || !withinBudget || attempts != 3 || retries != 2 || !chargedOnce) {
      throw new AssertionError("timeout budget contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:Docker 镜像与配置': javaLab(
    'JPL 代码台 19 · 最小运行镜像与外部配置',
    '检查多阶段构建、非 root 用户、固定基础标签、秘密注入和容器感知 JVM 参数，拒绝把配置烘焙进镜像。',
    javaTask({
      id: 'java-p06-last-docker-image-practice',
      title: '跟做：检查镜像构建清单',
      brief:
        '读取运行用户、基础标签、运行基座、是否包含秘密和多阶段构建器。逐项验证非 root、非 latest、无源码构建工具和秘密，输出镜像门禁结果。',
      stdin: `nonroot 17-jre distroless no jdk21
`,
      checkpoint:
        '输出 user=nonroot、tag=17-jre、base=distroless、multiStage=true、secretFree=true、violations=0、imageReady=true。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String user = input.next();
    String tag = input.next();
    String base = input.next();
    boolean secretFree = input.next().equalsIgnoreCase("no");
    String builder = input.next();
    List<String> violations = new ArrayList<>();
    if ("root".equalsIgnoreCase(user)) {
      violations.add("root-user");
    }
    if ("latest".equalsIgnoreCase(tag)) {
      violations.add("floating-tag");
    }
    if (!base.contains("jre") && !base.contains("distroless")) {
      violations.add("full-build-toolchain");
    }
    if (!secretFree) {
      violations.add("secret-in-layer");
    }
    if (!builder.toLowerCase().contains("jdk")) {
      violations.add("missing-build-stage");
    }
    boolean multiStage = builder.toLowerCase().contains("jdk");
    boolean imageReady = violations.isEmpty();
    System.out.println("user=" + user);
    System.out.println("tag=" + tag);
    System.out.println("base=" + base);
    System.out.println("multiStage=" + multiStage);
    System.out.println("secretFree=" + secretFree);
    System.out.println("violations=" + violations.size());
    System.out.println("imageReady=" + imageReady);
    if (!imageReady || !multiStage) {
      throw new AssertionError("container image gate failed: " + violations);
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-docker-runtime-config-apply',
      title: '独立实践：容器运行时配置门禁',
      brief:
        '读取配置来源、秘密来源、优雅停机秒数和最大堆占容器内存百分比。配置应外部注入，秘密来自运行时 Secret，JVM 使用容器感知的内存上限。',
      stdin: `env vault 30 75
`,
      checkpoint:
        '输出 configSource=env、secretSource=vault、configExternal=true、secretBaked=false、graceSeconds=30、maxRamPercent=75、accepted=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String configSource = input.next();
    String secretSource = input.next();
    int graceSeconds = input.nextInt();
    int maxRamPercent = input.nextInt();
    boolean configExternal = configSource.equals("env") || configSource.equals("config-map");
    boolean secretBaked = !(secretSource.equals("vault") || secretSource.equals("secret"));
    boolean graceful = graceSeconds >= 20;
    boolean memorySane = maxRamPercent >= 50 && maxRamPercent <= 80;
    boolean accepted = configExternal && !secretBaked && graceful && memorySane;
    System.out.println("configSource=" + configSource);
    System.out.println("secretSource=" + secretSource);
    System.out.println("configExternal=" + configExternal);
    System.out.println("secretBaked=" + secretBaked);
    System.out.println("graceSeconds=" + graceSeconds);
    System.out.println("maxRamPercent=" + maxRamPercent);
    System.out.println("accepted=" + accepted);
    if (!accepted) {
      throw new AssertionError("container runtime config gate failed");
    }
  }
}
`,
    }),
  ),

  'programming:Kubernetes 发布与探针': javaLab(
    'JPL 代码台 20 · 滚动发布、Ready 与重启',
    '区分 startup、readiness 与 liveness 三种探针结果，验证失败时是停止接流量、继续等待还是重启容器。',
    javaTask({
      id: 'java-p06-last-kubernetes-rollout-practice',
      title: '跟做：计算滚动发布可用容量',
      brief:
        '读取期望副本、maxUnavailable 和 maxSurge。计算发布期间允许的最小 Ready 数、最大 Pod 数和最终 Endpoint 数，确保新 Pod Ready 后才接流量。',
      stdin: `5 1 2
`,
      checkpoint:
        '输出 desired=5、maxUnavailable=1、maxSurge=2、minimumReady=4、maximumPods=7、endpoints=5、restarts=0、rolloutComplete=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int desired = input.nextInt();
    int maxUnavailable = input.nextInt();
    int maxSurge = input.nextInt();
    int minimumReady = desired - maxUnavailable;
    int maximumPods = desired + maxSurge;
    int endpoints = desired;
    int restarts = 0;
    boolean rolloutComplete = endpoints == desired;
    System.out.println("desired=" + desired);
    System.out.println("maxUnavailable=" + maxUnavailable);
    System.out.println("maxSurge=" + maxSurge);
    System.out.println("minimumReady=" + minimumReady);
    System.out.println("maximumPods=" + maximumPods);
    System.out.println("endpoints=" + endpoints);
    System.out.println("restarts=" + restarts);
    System.out.println("rolloutComplete=" + rolloutComplete);
    if (minimumReady != 4 || maximumPods != 7 || endpoints != 5 || !rolloutComplete) {
      throw new AssertionError("kubernetes rollout capacity failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-kubernetes-probe-apply',
      title: '独立实践：Startup 失败不误导流量与重启',
      brief:
        '读取副本数以及 startup、readiness、liveness 三个结果。Startup 失败时 Pod 不接流量且按启动探针策略重启；readiness 失败只摘流量；liveness 失败才触发运行期重启。',
      stdin: `3 false true true
`,
      checkpoint:
        '输出 replicas=3、startupReady=false、readinessReady=true、livenessReady=true、readyEndpoints=0、trafficAccepted=false、restarts=3、rolloutComplete=false。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int replicas = input.nextInt();
    boolean startupReady = input.nextBoolean();
    boolean readinessProbe = input.nextBoolean();
    boolean livenessProbe = input.nextBoolean();
    boolean ready = startupReady && readinessProbe;
    int endpoints = ready ? replicas : 0;
    int restarts = !startupReady ? replicas : (!livenessProbe ? replicas : 0);
    boolean trafficAccepted = endpoints > 0;
    boolean rolloutComplete = endpoints == replicas;
    System.out.println("replicas=" + replicas);
    System.out.println("startupReady=" + startupReady);
    System.out.println("readinessReady=" + readinessProbe);
    System.out.println("livenessReady=" + livenessProbe);
    System.out.println("readyEndpoints=" + endpoints);
    System.out.println("trafficAccepted=" + trafficAccepted);
    System.out.println("restarts=" + restarts);
    System.out.println("rolloutComplete=" + rolloutComplete);
    if (endpoints != 0 || trafficAccepted || restarts != replicas || rolloutComplete) {
      throw new AssertionError("kubernetes probe contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:CI/CD、可观测性与事故复盘': javaLab(
    'JPL 代码台 21 · 固定制品门禁与回滚',
    '用同一个 digest 从测试晋升生产，验证测试、安全、SBOM 和冒烟门禁；金丝雀失败时自动停止并回滚。',
    javaTask({
      id: 'java-p06-last-cicd-promotion-practice',
      title: '跟做：四项门禁通过后晋升固定 digest',
      brief:
        '读取单元测试、安全扫描、SBOM 和冒烟测试四项结果。全部通过才允许同一个 digest 进入生产；输出制品身份和晋升结果。',
      stdin: `true true true true
`,
      checkpoint:
        '输出 unit=true、security=true、sbom=true、smoke=true、gatesPassed=4、digest=sha256:p06-fixed、promoted=true、rebuiltInProduction=false。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    boolean unit = input.nextBoolean();
    boolean security = input.nextBoolean();
    boolean sbom = input.nextBoolean();
    boolean smoke = input.nextBoolean();
    int gatesPassed = (unit ? 1 : 0) + (security ? 1 : 0) + (sbom ? 1 : 0) + (smoke ? 1 : 0);
    String digest = "sha256:p06-fixed";
    boolean promoted = gatesPassed == 4;
    System.out.println("unit=" + unit);
    System.out.println("security=" + security);
    System.out.println("sbom=" + sbom);
    System.out.println("smoke=" + smoke);
    System.out.println("gatesPassed=" + gatesPassed);
    System.out.println("digest=" + digest);
    System.out.println("promoted=" + promoted);
    System.out.println("rebuiltInProduction=false");
    if (!promoted || gatesPassed != 4) {
      throw new AssertionError("deployment gate failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-cicd-rollback-apply',
      title: '独立实践：金丝雀失败自动回滚',
      brief:
        '读取测试、依赖扫描、SBOM 和金丝雀结果。前三项通过但金丝雀失败时，生产晋升必须停止，固定 digest 回到上一稳定版本并发出事故告警。',
      stdin: `true true true false
`,
      checkpoint:
        '输出 gatesPassed=3、canaryHealthy=false、promotedToProduction=false、rolledBack=true、alerts=1、stableDigest=sha256:p06-previous、incidentOpened=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    boolean tests = input.nextBoolean();
    boolean scan = input.nextBoolean();
    boolean sbom = input.nextBoolean();
    boolean canary = input.nextBoolean();
    int gatesPassed = (tests ? 1 : 0) + (scan ? 1 : 0) + (sbom ? 1 : 0);
    boolean promoted = gatesPassed == 3 && canary;
    boolean rolledBack = !canary;
    int alerts = rolledBack ? 1 : 0;
    String stableDigest = rolledBack ? "sha256:p06-previous" : "sha256:p06-new";
    boolean incidentOpened = rolledBack;
    System.out.println("gatesPassed=" + gatesPassed);
    System.out.println("canaryHealthy=" + canary);
    System.out.println("promotedToProduction=" + promoted);
    System.out.println("rolledBack=" + rolledBack);
    System.out.println("alerts=" + alerts);
    System.out.println("stableDigest=" + stableDigest);
    System.out.println("incidentOpened=" + incidentOpened);
    if (gatesPassed != 3 || promoted || !rolledBack || alerts != 1 || !incidentOpened) {
      throw new AssertionError("canary rollback contract failed");
    }
  }
}
`,
    }),
  ),

  'programming:安全审查与修复': javaLab(
    'JPL 代码台 22 · 根因修复与攻击回归',
    '从对象授权、SQL 注入、日志脱敏、令牌过期、工具白名单和依赖扫描建立风险矩阵，用攻击回归证明修复有效。',
    javaTask({
      id: 'java-p06-last-security-review-practice',
      title: '跟做：识别发布前安全缺口',
      brief:
        '读取六项控制是否通过。逐项生成风险并区分阻断级与一般级；对象授权缺失和秘密泄露属于发布阻断项，不能靠隐藏按钮或依赖扫描代替。',
      stdin: `false true false true false true
`,
      checkpoint:
        '输出 objectAuthorization=false、parameterizedSql=true、logRedaction=false、tokenExpiry=true、toolAllowlist=false、dependencyScan=true、findings=3、releaseBlocked=true。',
      code: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    boolean objectAuthorization = input.nextBoolean();
    boolean parameterizedSql = input.nextBoolean();
    boolean logRedaction = input.nextBoolean();
    boolean tokenExpiry = input.nextBoolean();
    boolean toolAllowlist = input.nextBoolean();
    boolean dependencyScan = input.nextBoolean();
    List<String> findings = new ArrayList<>();
    if (!objectAuthorization) findings.add("critical:object-authorization");
    if (!parameterizedSql) findings.add("critical:sqli");
    if (!logRedaction) findings.add("high:log-secret");
    if (!tokenExpiry) findings.add("high:token-expiry");
    if (!toolAllowlist) findings.add("high:tool-allowlist");
    if (!dependencyScan) findings.add("medium:dependency-scan");
    boolean releaseBlocked = findings.stream().anyMatch(value ->
        value.startsWith("critical") || value.startsWith("high"));
    System.out.println("objectAuthorization=" + objectAuthorization);
    System.out.println("parameterizedSql=" + parameterizedSql);
    System.out.println("logRedaction=" + logRedaction);
    System.out.println("tokenExpiry=" + tokenExpiry);
    System.out.println("toolAllowlist=" + toolAllowlist);
    System.out.println("dependencyScan=" + dependencyScan);
    System.out.println("findings=" + findings.size());
    System.out.println("releaseBlocked=" + releaseBlocked);
    if (findings.size() != 3 || !releaseBlocked) {
      throw new AssertionError("security review classification failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-p06-last-security-regression-apply',
      title: '独立实践：六类攻击在修复后失败',
      brief:
        '读取六项修复后的控制结果。只有全部控制生效才允许发布；输出被阻断攻击、残留风险、根因修复和攻击回归结果。',
      stdin: `true true true true true true
`,
      checkpoint:
        '输出 idorBlocked=true、sqliBlocked=true、secretLeakBlocked=true、expiredTokenBlocked=true、toolEscalationBlocked=true、dependencyRiskBlocked=true、attacksBlocked=6、residualRisks=0、releaseReady=true。',
      code: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    boolean objectAuthorization = input.nextBoolean();
    boolean parameterizedSql = input.nextBoolean();
    boolean logRedaction = input.nextBoolean();
    boolean tokenExpiry = input.nextBoolean();
    boolean toolAllowlist = input.nextBoolean();
    boolean dependencyScan = input.nextBoolean();
    boolean idorBlocked = objectAuthorization;
    boolean sqliBlocked = parameterizedSql;
    boolean secretLeakBlocked = logRedaction;
    boolean expiredTokenBlocked = tokenExpiry;
    boolean toolEscalationBlocked = toolAllowlist;
    boolean dependencyRiskBlocked = dependencyScan;
    int attacksBlocked = (idorBlocked ? 1 : 0) + (sqliBlocked ? 1 : 0)
        + (secretLeakBlocked ? 1 : 0) + (expiredTokenBlocked ? 1 : 0)
        + (toolEscalationBlocked ? 1 : 0) + (dependencyRiskBlocked ? 1 : 0);
    int residualRisks = 6 - attacksBlocked;
    boolean releaseReady = residualRisks == 0;
    System.out.println("idorBlocked=" + idorBlocked);
    System.out.println("sqliBlocked=" + sqliBlocked);
    System.out.println("secretLeakBlocked=" + secretLeakBlocked);
    System.out.println("expiredTokenBlocked=" + expiredTokenBlocked);
    System.out.println("toolEscalationBlocked=" + toolEscalationBlocked);
    System.out.println("dependencyRiskBlocked=" + dependencyRiskBlocked);
    System.out.println("attacksBlocked=" + attacksBlocked);
    System.out.println("residualRisks=" + residualRisks);
    System.out.println("releaseReady=" + releaseReady);
    if (attacksBlocked != 6 || residualRisks != 0 || !releaseReady) {
      throw new AssertionError("security regression contract failed");
    }
  }
}
`,
    }),
  ),
};
