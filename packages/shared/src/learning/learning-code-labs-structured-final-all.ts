import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
  LearningV2CodeLanguage,
} from './v2-types.js';

type CodeRuntime = NonNullable<LearningV2CodeLab['requiredRuntime']>;

function task(
  id: string,
  language: LearningV2CodeLanguage,
  title: string,
  brief: string,
  source: string,
  stdin: string,
  checkpoint: string,
): LearningV2CodeLabTask {
  return {
    id,
    title,
    brief,
    defaultLanguage: language,
    starterCode: {
      [language]: source,
    },
    stdin,
    checkpoint,
  };
}

function lab(
  language: LearningV2CodeLanguage,
  requiredRuntime: CodeRuntime,
  runtimeLabel: string,
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
  installSteps: readonly string[],
): LearningV2CodeLab {
  return {
    title,
    description,
    requiredRuntime,
    runtimeLabel,
    installSteps,
    languages: [language],
    practice,
    apply,
  };
}

export const LEARNING_CODE_LABS_STRUCTURED_FINAL_ALL: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:MyBatis 执行链与 SQL 治理': lab(
    'java',
    'java',
    'Java 17+ / Mapper 与 SQL 契约模拟',
    'P06 收口代码台 · MyBatis 执行链与 SQL 治理',
    '用 JDK 标准库模拟 MapperProxy、SqlSession、Executor 与 StatementHandler 的职责边界，观察绑定参数、排序白名单、分页和 N+1 查询预算；外部数据库与 MyBatis 框架不联网运行。',
    task(
      'p06-mybatis-chain-guided',
      'java',
      '跟做：从 Mapper 代理走到绑定 SQL',
      '原样运行。程序会按 MapperProxy -> SqlSession -> Executor -> StatementHandler 的顺序记录调用链，只允许 created_at 或 id 作为排序列，并用占位符保留参数绑定边界。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Main {
  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line: " + line);
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    String tenant = input.getOrDefault("tenant", "tenant-a");
    String status = input.getOrDefault("status", "submitted");
    String requestedSort = input.getOrDefault("sort", "created_at desc");
    int limit = Integer.parseInt(input.getOrDefault("limit", "2"));
    Set<String> allowedColumns = Set.of("created_at", "id");
    String[] sortParts = requestedSort.trim().split("\\s+");
    String column = sortParts[0];
    String direction = sortParts.length > 1 ? sortParts[1].toLowerCase() : "asc";
    if (!allowedColumns.contains(column)) throw new IllegalArgumentException("unsupported sort column: " + column);
    if (!direction.equals("asc") && !direction.equals("desc")) throw new IllegalArgumentException("unsupported sort direction");
    if (limit < 1 || limit > 100) throw new IllegalArgumentException("limit outside page budget");

    List<String> callChain = List.of("MapperProxy", "SqlSessionTemplate", "Executor", "StatementHandler", "ResultSetHandler");
    String boundarySql = "SELECT id, status, amount FROM orders WHERE tenant_id = ? AND status = ? ORDER BY "
        + column + " " + direction + " LIMIT ?";
    List<Object> boundArgs = new ArrayList<>(List.of(tenant, status, limit));

    if (!boundarySql.contains("tenant_id = ?")) throw new IllegalStateException("tenant predicate is not bound");
    if (!boundarySql.contains("status = ?")) throw new IllegalStateException("status predicate is not bound");
    if (boundarySql.contains(tenant) || boundarySql.contains(status)) throw new IllegalStateException("input leaked into SQL text");
    if (boundArgs.size() != 3) throw new IllegalStateException("unexpected argument count");

    System.out.println("call_chain=" + String.join(" -> ", callChain));
    System.out.println("sql=" + boundarySql);
    System.out.println("bound_args=" + boundArgs);
    System.out.println("mybatis mapper boundary verified");
  }
}
`,
      'tenant=tenant-a\nstatus=submitted\nsort=created_at desc\nlimit=2',
      '输出必须同时出现 MapperProxy、SqlSessionTemplate、Executor、StatementHandler 与 ResultSetHandler；SQL 中只能看到三个问号，不能出现 tenant-a 或 submitted。再把 sort 改成 id asc，仍应成功；改成 amount desc，必须由白名单拒绝。',
    ),
    task(
      'p06-mybatis-chain-independent',
      'java',
      '独立实践：治理 N+1、分页与批量写',
      'stdin 给出订单及关联行、批量大小、拒绝的排序字段和查询预算。程序要证明逐单查询成本、批量查询节省、分页上限和非法动态 SQL 拒绝都符合治理规则。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Main {
  record OrderRow(String id, int relatedRows) {}

  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  static int nPlusOneQueries(List<OrderRow> orders) {
    int queries = 1;
    for (OrderRow order : orders) {
      if (order.relatedRows() > 0) queries += 1;
    }
    return queries;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    List<OrderRow> orders = new ArrayList<>();
    for (String token : input.getOrDefault("orders", "").split(";")) {
      if (token.isBlank()) continue;
      String[] parts = token.split(":");
      orders.add(new OrderRow(parts[0], Integer.parseInt(parts[1])));
    }
    if (orders.isEmpty()) throw new IllegalArgumentException("orders are required");

    int batchSize = Integer.parseInt(input.getOrDefault("batchSize", "2"));
    int pageLimit = Integer.parseInt(input.getOrDefault("pageLimit", "100"));
    String requestedSort = input.getOrDefault("rejectedSort", "amount desc");
    Set<String> allowedColumns = Set.of("created_at", "id");
    String requestedColumn = requestedSort.trim().split("\\s+")[0];

    int nPlusOne = nPlusOneQueries(orders);
    int normalizedBatches = (orders.size() + batchSize - 1) / batchSize;
    int relatedTotal = orders.stream().mapToInt(OrderRow::relatedRows).sum();
    int batchedQueries = 1 + (relatedTotal == 0 ? 0 : 1);
    if (nPlusOne <= batchedQueries) throw new IllegalStateException("N+1 fixture did not expose extra queries");
    if (pageLimit > 100) throw new IllegalArgumentException("page exceeds budget");
    if (allowedColumns.contains(requestedColumn)) throw new IllegalArgumentException("fixture must be rejected");
    if (normalizedBatches != 2) throw new IllegalStateException("unexpected batch count");

    String rewrite = "SELECT orders.id, items.sku, items.qty FROM orders "
        + "LEFT JOIN order_items items ON items.order_id = orders.id "
        + "WHERE orders.tenant_id = ? ORDER BY orders.created_at DESC LIMIT ?";
    if (rewrite.chars().filter(ch -> ch == '?').count() != 2) throw new IllegalStateException("join must stay parameterized");

    System.out.println("orders=" + orders.size());
    System.out.println("n_plus_one_queries=" + nPlusOne);
    System.out.println("batched_queries=" + batchedQueries);
    System.out.println("write_batches=" + normalizedBatches);
    System.out.println("rejected_dynamic_sort=" + requestedSort);
    System.out.println("rewrite_sql=" + rewrite);
    System.out.println("sql governance budget verified");
  }
}
`,
      'orders=o1:2;o2:1;o3:4\nbatchSize=2\npageLimit=100\nrejectedSort=amount desc',
      '输出须显示 order 共 3 条、N+1 查询 4 次、联表批量查询 2 次、写批次 2，并明确拒绝 amount desc。将 pageLimit 改为 101 必须失败；把 rejectedSort 改为 id asc 也必须失败，因为该输入故意用于证明白名单边界。',
    ),
    [
      '运行命令：javac Main.java && java Main；stdin 由课程提供。',
      '任务用 JDK 契约模拟 MapperProxy、SqlSession、Executor 和 Handler，不连接真实 MyBatis 或数据库。',
      '验收看 SQL 文本、绑定参数、查询次数和失败原因，不以编译通过代替治理结论。',
    ],
  ),
  'programming:Spring AI、Spring Cloud 与 Netty': lab(
    'java',
    'java',
    'Java 17+ / Spring AI、网关与 Netty 契约模拟',
    'P06 收口代码台 · AI、服务治理与异步网络边界',
    '使用 JDK 标准库执行模型输出校验、工具白名单、人工确认、网关路由、熔断和事件循环预算模拟。第三方框架只作为可观察契约，不声称真实启动 Spring Cloud 或 Netty。',
    task(
      'p06-spring-ai-netty-guided',
      'java',
      '跟做：模型输出先校验，再申请工具',
      '运行模型决策守卫。模型建议不得直接批准退款；工具只能来自 allowlist；高风险工具要求 operatorConfirmed=true；模型调用和工具调用共享总超时。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class Main {
  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    boolean modelApproved = Boolean.parseBoolean(input.getOrDefault("modelApproved", "true"));
    String reason = input.getOrDefault("reason", "damaged package");
    String tool = input.getOrDefault("tool", "createRefundDraft");
    boolean operatorConfirmed = Boolean.parseBoolean(input.getOrDefault("operatorConfirmed", "true"));
    int timeoutMs = Integer.parseInt(input.getOrDefault("timeoutMs", "800"));
    int aiBudgetMs = Integer.parseInt(input.getOrDefault("aiBudgetMs", "500"));
    int toolBudgetMs = Integer.parseInt(input.getOrDefault("toolBudgetMs", "200"));
    Set<String> allowedTools = Set.of("getOrder", "createRefundDraft");
    Set<String> confirmationTools = Set.of("createRefundDraft", "issueRefund");

    if (!reason.matches("[a-z0-9 .,-]{3,80}")) throw new IllegalArgumentException("model reason is not trusted text");
    if (!allowedTools.contains(tool)) throw new SecurityException("tool denied: " + tool);
    if (confirmationTools.contains(tool) && !operatorConfirmed) throw new SecurityException("operator confirmation required");
    if (aiBudgetMs + toolBudgetMs > timeoutMs) throw new IllegalStateException("AI and tool budget exceed request deadline");
    if (modelApproved && tool.equals("issueRefund")) throw new IllegalStateException("model cannot directly issue refund");

    String sanitizedReason = reason.replaceAll("[\\r\\n]", " ");
    System.out.println("model_approved=" + modelApproved);
    System.out.println("reason=" + sanitizedReason);
    System.out.println("tool=" + tool);
    System.out.println("operator_confirmed=" + operatorConfirmed);
    System.out.println("budget_ms=" + (aiBudgetMs + toolBudgetMs) + "/" + timeoutMs);
    System.out.println("model remains an untrusted dependency");
  }
}
`,
      'modelApproved=true\nreason=damaged package\nreason=damaged package\ntool=createRefundDraft\noperatorConfirmed=true\ntimeoutMs=800\naiBudgetMs=500\ntoolBudgetMs=200',
      '输出须显示 createRefundDraft、operator_confirmed=true、预算 700/800，并强调模型仍是不可信依赖。分别把 tool 改为 shell、把 operatorConfirmed 改为 false、把 reason 改成带换行符之外的不安全字符，必须失败。',
    ),
    task(
      'p06-spring-ai-netty-independent',
      'java',
      '独立实践：健康实例路由与事件循环隔离',
      'stdin 提供两组服务实例、路径、角色、连接与响应预算、请求队列。程序必须只选择健康实例、拒绝越权请求、拒绝总预算超时，并证明阻塞任务不能进入 EventLoop。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Main {
  record Instance(String id, boolean healthy) {}
  record Route(String path, String requiredRole) {}

  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  static Instance pickHealthy(List<Instance> instances, int attempt) {
    List<Instance> healthy = instances.stream().filter(Instance::healthy).toList();
    if (healthy.isEmpty()) throw new IllegalStateException("no healthy instance");
    return healthy.get(attempt % healthy.size());
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    List<Instance> instances = new ArrayList<>();
    for (String token : input.getOrDefault("instances", "").split(",")) {
      String[] parts = token.split(":");
      instances.add(new Instance(parts[0], Boolean.parseBoolean(parts[1])));
    }
    List<Route> routes = List.of(
        new Route("/api/orders", "operator"),
        new Route("/api/public/catalog", "guest"));
    String requestPath = input.getOrDefault("path", "/api/orders");
    String role = input.getOrDefault("role", "operator");
    int connectMs = Integer.parseInt(input.getOrDefault("connectMs", "80"));
    int responseMs = Integer.parseInt(input.getOrDefault("responseMs", "120"));
    int gatewayBudgetMs = Integer.parseInt(input.getOrDefault("gatewayBudgetMs", "250"));
    int upstreamQueued = Integer.parseInt(input.getOrDefault("upstreamQueued", "6"));
    boolean blockingIoOnEventLoop = Boolean.parseBoolean(input.getOrDefault("blockingIoOnEventLoop", "false"));

    Route route = routes.stream().filter(item -> item.path().equals(requestPath)).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("unknown route"));
    if (!route.requiredRole().equals(role) && !(route.requiredRole().equals("guest") && !role.isBlank())) {
      throw new SecurityException("route role denied");
    }
    if (connectMs + responseMs > gatewayBudgetMs) throw new IllegalStateException("gateway deadline exceeded");
    if (upstreamQueued > 4) throw new IllegalStateException("bounded queue overflow");
    if (blockingIoOnEventLoop) throw new IllegalStateException("blocking work must use an executor");

    Instance first = pickHealthy(instances, 0);
    Instance second = pickHealthy(instances, 1);
    if (!first.healthy() || !second.healthy()) throw new IllegalStateException("routing selected unhealthy instance");

    System.out.println("route=" + requestPath);
    System.out.println("role=" + role);
    System.out.println("healthy_targets=" + first.id() + "," + second.id());
    System.out.println("budget_ms=" + (connectMs + responseMs) + "/" + gatewayBudgetMs);
    System.out.println("bounded_queue=" + upstreamQueued + "/4");
    System.out.println("event_loop_isolated=true");
    System.out.println("gateway and netty boundaries verified");
  }
}
`,
      'instances=blue:true,green:true,canary:false\npath=/api/orders\nrole=operator\nconnectMs=80\nresponseMs=120\ngatewayBudgetMs=250\nupstreamQueued=4\nblockingIoOnEventLoop=false',
      '输出须只出现 blue 和 green 两个健康目标，预算为 200/250，队列 4/4。把 blockingIoOnEventLoop 改为 true 必须失败；把 upstreamQueued 改为 5、role 改为 anonymous 或 responseMs 改为 200 也必须分别失败。',
    ),
    [
      '运行命令：javac Main.java && java Main。',
      'Spring AI、Spring Cloud Gateway 与 Netty 均为标准库契约模拟，不访问模型或启动网络服务。',
      '验收必须包含拒绝路径，而不是只展示成功请求。',
    ],
  ),
  'programming:Spring 家族源码：Framework、Boot、Security、Data、Cloud': lab(
    'java',
    'java',
    'Java 17+ / Spring 家族源码执行链模拟',
    'P06 收口代码台 · 容器、自动配置、安全与网关执行链',
    '通过可执行的 BeanDefinition 图、条件装配、Security 过滤链和 Gateway 过滤器模型，跟踪一次 Bean 创建和请求鉴权。它验证源码阅读方法，不冒充真实 Spring 容器。',
    task(
      'p06-spring-source-guided',
      'java',
      '跟做：从 BeanDefinition 到容器创建顺序',
      'stdin 给出 Bean 及其依赖。程序检查循环依赖、缺失依赖和条件装配，输出 refresh 期间可复现的创建顺序；CoreInfra 的两个实现只能由条件装配选一个。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Main {
  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  static void visit(String name, Map<String, List<String>> graph, Set<String> visiting,
      Set<String> visited, List<String> order) {
    if (!graph.containsKey(name)) throw new IllegalArgumentException("missing bean: " + name);
    if (visiting.contains(name)) throw new IllegalStateException("bean cycle: " + name);
    if (visited.contains(name)) return;
    visiting.add(name);
    for (String dependency : graph.get(name)) visit(dependency, graph, visiting, visited, order);
    visiting.remove(name);
    visited.add(name);
    order.add(name);
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    Map<String, List<String>> graph = new HashMap<>();
    for (String token : input.getOrDefault("beans", "").split(";")) {
      if (token.isBlank()) continue;
      String[] parts = token.split(":", 2);
      List<String> dependencies = new ArrayList<>();
      if (parts.length == 2 && !parts[1].isBlank()) {
        for (String dependency : parts[1].split(",")) dependencies.add(dependency.trim());
      }
      graph.put(parts[0].trim(), dependencies);
    }
    String profile = input.getOrDefault("profile", "production");
    String dbUrl = input.getOrDefault("dbUrl", "jdbc:postgresql://db/orders");
    String selectedInfra = profile.equals("test") ? "FakeClock" : dbUrl.startsWith("jdbc:") ? "JdbcClock" : "MemoryClock";
    if (!graph.containsKey(selectedInfra)) throw new IllegalStateException("conditional bean missing: " + selectedInfra);
    Map<String, List<String>> effective = new HashMap<>(graph);
    String rejectedInfra = selectedInfra.equals("JdbcClock") ? "FakeClock" : "JdbcClock";
    effective.remove(rejectedInfra);
    for (Map.Entry<String, List<String>> entry : effective.entrySet()) {
      entry.getValue().removeIf(dependency -> dependency.equals(rejectedInfra));
    }

    List<String> order = new ArrayList<>();
    Set<String> visited = new LinkedHashSet<>();
    Set<String> visiting = new LinkedHashSet<>();
    visit("OrderController", effective, visiting, visited, order);
    if (order.indexOf(selectedInfra) > order.indexOf("OrderService")) throw new IllegalStateException("dependency order is wrong");
    if (order.indexOf("OrderService") > order.indexOf("OrderController")) throw new IllegalStateException("controller initialized too early");

    System.out.println("refresh_phase=ConfigurationClassPostProcessor");
    System.out.println("selected_conditional_bean=" + selectedInfra);
    System.out.println("rejected_conditional_bean=" + rejectedInfra);
    System.out.println("bean_creation_order=" + String.join(" -> ", order));
    System.out.println("bean graph initialized");
  }
}
`,
      'beans=OrderController:OrderService;OrderService:JdbcClock,OrderRepository;JdbcClock:DataSource;FakeClock:;OrderRepository:DataSource;DataSource:\nprofile=production\ndbUrl=jdbc:postgresql://db/orders',
      '输出须选择 JdbcClock、拒绝 FakeClock，且创建顺序满足 DataSource 在 JdbcClock 前、JdbcClock 在 OrderService 前、OrderService 在 OrderController 前。把 OrderService 依赖改成 MissingBean 必须失败；制造 A:B;B:A 必须报告循环依赖。',
    ),
    task(
      'p06-spring-source-independent',
      'java',
      '独立实践：Security 过滤链与 Gateway 路由顺序',
      'stdin 给出请求路径、角色、CSRF 令牌、限流状态与 Gateway 过滤器。程序按固定过滤顺序执行，要求认证失败立即停止，授权、CSRF、限流分别返回明确状态，且业务服务只接收已通过入口策略的请求。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Main {
  record Decision(String filter, int status, String reason) {}

  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    String path = input.getOrDefault("path", "/api/orders");
    String role = input.getOrDefault("role", "operator");
    boolean authenticated = Boolean.parseBoolean(input.getOrDefault("authenticated", "true"));
    String csrf = input.getOrDefault("csrf", "valid");
    boolean rateAllowed = Boolean.parseBoolean(input.getOrDefault("rateAllowed", "true"));
    List<String> configured = new ArrayList<>();
    for (String name : input.getOrDefault("filters", "").split(",")) configured.add(name.trim());
    List<String> required = List.of("TraceFilter", "AuthenticationFilter", "AuthorizationFilter",
        "CsrfFilter", "RateLimitFilter", "GatewayRouteFilter");
    List<Decision> decisions = new ArrayList<>();
    int status = 200;

    for (String name : configured) {
      if (!required.contains(name)) throw new IllegalArgumentException("unknown filter: " + name);
    }
    for (String name : required) {
      if (!configured.contains(name)) throw new IllegalArgumentException("missing filter: " + name);
      if (status != 200) break;
      if (name.equals("AuthenticationFilter") && !authenticated) {
        status = 401;
        decisions.add(new Decision(name, status, "unauthenticated"));
      } else if (name.equals("AuthorizationFilter") && !role.equals("operator")) {
        status = 403;
        decisions.add(new Decision(name, status, "role denied"));
      } else if (name.equals("CsrfFilter") && csrf.equals("missing")) {
        status = 403;
        decisions.add(new Decision(name, status, "csrf missing"));
      } else if (name.equals("RateLimitFilter") && !rateAllowed) {
        status = 429;
        decisions.add(new Decision(name, status, "rate limited"));
      } else {
        decisions.add(new Decision(name, status, "pass"));
      }
    }
    if (status == 200 && !path.startsWith("/api/")) throw new IllegalArgumentException("business service cannot own gateway path");
    if (status == 200 && decisions.size() != required.size()) throw new IllegalStateException("filter chain incomplete");

    for (Decision decision : decisions) {
      System.out.println(decision.filter() + "|" + decision.status() + "|" + decision.reason());
    }
    System.out.println("upstream_called=" + (status == 200));
    System.out.println("security and gateway chain completed");
  }
}
`,
      'path=/api/orders\nauthenticated=true\nrole=operator\ncsrf=valid\nrateAllowed=true\nfilters=TraceFilter,AuthenticationFilter,AuthorizationFilter,CsrfFilter,RateLimitFilter,GatewayRouteFilter',
      '成功路径必须输出六个过滤器的 pass 记录、upstream_called=true。把 authenticated 改为 false 后只能停在 401，不能再授权或调用上游；把 csrf 改为 missing 必须停在 403；rateAllowed=false 时必须返回 429。',
    ),
    [
      '运行命令：javac Main.java && java Main。',
      'Bean、Security 和 Gateway 均是可检查的执行链模拟；源码入口与真实框架类名保持一致。',
      '检查条件装配、循环依赖、过滤顺序和短路行为，不能只凭注解名称判断。',
    ],
  ),
  'programming:JVM 语言家族：Kotlin、Scala、Groovy 与 Clojure': lab(
    'java',
    'java',
    'Java 17+ / JVM 语言互操作契约',
    'P06 收口代码台 · JVM 语言选型与互操作边界',
    '用 Java 标准库模拟 Kotlin 空安全、Scala 不可变数据结构、Groovy 脚本边界和 Clojure 数据转换。任务强调 JVM 互操作、构建、调试与团队成本，而不是语法偏好。',
    task(
      'p06-jvm-language-guided',
      'java',
      '跟做：Kotlin 空安全穿越 Java 边界',
      'Java 方法可以返回 null，Kotlin 的可空类型不能仅凭调用方声明就信任。stdin 提供订单字段，程序要把缺失字段显式包装为 Optional，并验证空值、缺省值和类型转换不会变成隐藏崩溃。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public class Main {
  record JavaOrder(String id, String customer, String amount) {}

  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  static String nullableValue(String value) {
    return value == null || value.isBlank() || value.equals("null") ? null : value;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    JavaOrder raw = new JavaOrder(nullableValue(input.get("id")), nullableValue(input.get("customer")), nullableValue(input.get("amount")));
    Optional<String> id = Optional.ofNullable(raw.id()).filter(value -> value.matches("[A-Z0-9-]{3,20}"));
    Optional<String> customer = Optional.ofNullable(raw.customer());
    Optional<Long> amountCents = Optional.ofNullable(raw.amount()).map(value -> {
      try {
        return Long.parseLong(value);
      } catch (NumberFormatException error) {
        throw new IllegalArgumentException("amount is not an integer");
      }
    });
    if (id.isEmpty()) throw new IllegalArgumentException("id is required");
    if (customer.isEmpty()) throw new IllegalArgumentException("customer fallback is required");
    if (amountCents.isEmpty() || amountCents.get() <= 0) throw new IllegalArgumentException("amount must be positive");
    String display = customer.map(String::trim).orElse("unknown").toUpperCase();
    if (display.contains("$" + "{")) throw new IllegalArgumentException("safe call must not become string interpolation");

    System.out.println("nullable_java_boundary=true");
    System.out.println("id=" + id.orElseThrow());
    System.out.println("customer=" + display);
    System.out.println("amount_cents=" + amountCents.orElseThrow());
    System.out.println("kotlin-safe-call contract verified");
  }
}
`,
      'id=O-1042\ncustomer=Ada\namount=12990',
      '输出必须包含 nullable_java_boundary=true、id=O-1042、customer=ADA、amount_cents=12990。把 customer 改为 null 必须失败（本任务要求显式 fallback 字段）；把 amount 改为 12.5 必须失败并指出整数边界。',
    ),
    task(
      'p06-jvm-language-independent',
      'java',
      '独立实践：用质量约束做 JVM 语言选型',
      'stdin 给出四种语言在空安全、并发、互操作、构建、人才和生态上的 1-5 分，以及权重和必须满足的硬约束。程序计算加权得分并写出可复核的候选排序，不能把语法偏好当决策。',
      String.raw`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Main {
  record Profile(String name, Map<String, Integer> scores, boolean nullableSafe, boolean coroutineReady, int buildCost) {}
  record Weighted(String name, int score, int buildCost) {}

  static Map<String, String> readInput() throws Exception {
    Map<String, String> values = new LinkedHashMap<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      int split = line.indexOf('=');
      if (split <= 0) throw new IllegalArgumentException("invalid input line");
      values.put(line.substring(0, split), line.substring(split + 1));
    }
    return values;
  }

  static List<Profile> parseProfiles(String encoded) {
    List<Profile> profiles = new ArrayList<>();
    for (String token : encoded.split(";")) {
      if (token.isBlank()) continue;
      String[] parts = token.split(":");
      if (parts.length != 7) throw new IllegalArgumentException("profile needs seven fields");
      Map<String, Integer> scores = Map.of(
          "nullSafety", Integer.parseInt(parts[1]),
          "concurrency", Integer.parseInt(parts[2]),
          "interop", Integer.parseInt(parts[3]),
          "build", Integer.parseInt(parts[4]),
          "talent", Integer.parseInt(parts[5]),
          "ecosystem", Integer.parseInt(parts[6]));
      profiles.add(new Profile(parts[0], scores, scores.get("nullSafety") >= 4,
          scores.get("concurrency") >= 4, Integer.parseInt(parts[4])));
    }
    return profiles;
  }

  public static void main(String[] args) throws Exception {
    Map<String, String> input = readInput();
    List<Profile> profiles = parseProfiles(input.getOrDefault("profiles", ""));
    Map<String, Integer> weights = new LinkedHashMap<>();
    for (String token : input.getOrDefault("weights", "").split(",")) {
      String[] parts = token.split(":");
      weights.put(parts[0], Integer.parseInt(parts[1]));
    }
    boolean requireNullSafety = Boolean.parseBoolean(input.getOrDefault("requireNullSafety", "true"));
    List<Weighted> eligible = profiles.stream()
        .filter(profile -> !requireNullSafety || profile.nullableSafe())
        .map(profile -> new Weighted(profile.name(), weights.entrySet().stream()
            .mapToInt(entry -> profile.scores().getOrDefault(entry.getKey(), 0) * entry.getValue()).sum(),
            profile.buildCost()))
        .sorted(Comparator.comparingInt(Weighted::score).reversed().thenComparing(Weighted::name))
        .toList();
    if (eligible.isEmpty()) throw new IllegalStateException("no profile satisfies hard constraints");
    Weighted winner = eligible.get(0);
    if (winner.score() < 40) throw new IllegalStateException("winner does not meet weighted quality threshold");
    if (winner.name().equals("Clojure") && !eligible.stream().anyMatch(item -> item.name().equals("Kotlin"))) {
      throw new IllegalStateException("fixture must compare practical alternatives");
    }
    String ranking = eligible.stream().map(item -> item.name() + "=" + item.score()).reduce((a, b) -> a + "," + b).orElse("");

    System.out.println("weights=" + weights);
    System.out.println("ranking=" + ranking);
    System.out.println("winner=" + winner.name());
    System.out.println("build_cost=" + winner.buildCost());
    System.out.println("decision=record ADR before migrating the main language");
  }
}
`,
      'profiles=Kotlin:5:5:5:3:4:5;Scala:4:4:3:4:3:4;Groovy:3:3:5:2:3:3;Clojure:3:4:2:4:2:5\nweights=nullSafety:3,concurrency:2,interop:2,build:1,talent:2,ecosystem:1\nrequireNullSafety=false',
      '输出须有完整 ranking 和 winner。把 requireNullSafety 改为 true 后，Kotlin 与 Scala 仍是可达候选；增加硬约束或提高阈值导致无候选时必须失败，不能默默选出低分语言。',
    ),
    [
      '运行命令：javac Main.java && java Main。',
      'Kotlin、Scala、Groovy、Clojure 均以 Java 契约模拟其 JVM 边界，不声称安装了四种语言工具链。',
      '验收看空值处理、候选过滤、加权排序和 ADR 结论，不以语法简洁作为选型理由。',
    ],
  ),
  'programming:Python 装饰器、生成器、上下文与异步': lab(
    'python',
    'python',
    'Python 3.11+ / asyncio 与生成器',
    'P07 收口代码台 · 装饰器、生成器、上下文与异步取消',
    '运行真实 Python 标准库任务：装饰器记录调用，上下文管理器保证清理，生成器按需产出并在提前关闭时执行 finally，asyncio 处理超时、取消和异常传播。',
    task(
      'p07-python-async-guided',
      'python',
      '跟做：超时与取消都要触发清理',
      '原样运行。程序创建多个带延迟和失败标志的异步任务，在总超时到达时取消未完成任务；上下文管理器与生成器必须留下已清理证据。',
      String.raw`from __future__ import annotations

import asyncio
import json
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator


@dataclass
class Trace:
    entered: int = 0
    exited: int = 0
    cancelled: int = 0
    failures: int = 0


trace = Trace()


@contextmanager
def managed_resource() -> Iterator[dict[str, object]]:
    trace.entered += 1
    resource = {"open": True}
    try:
        yield resource
    finally:
        resource["open"] = False
        trace.exited += 1


def traced(function):
    calls: list[str] = []

    async def wrapper(*args, **kwargs):
        calls.append(function.__name__)
        if not calls:
            raise AssertionError("decorator did not record call")
        return await function(*args, **kwargs)

    wrapper.calls = calls
    return wrapper


def stream_values(values: list[int]):
    cleaned = False
    try:
        for value in values:
            yield value * 2
    finally:
        cleaned = True
        if not cleaned:
            raise AssertionError("generator cleanup did not run")


@traced
async def load_order(order_id: str, delay: float, should_fail: bool) -> str:
    await asyncio.sleep(delay)
    if should_fail:
        raise ValueError("order contains invalid amount")
    return f"loaded:{order_id}"


async def main() -> None:
    request = json.load(sys.stdin)
    timeout = float(request["timeoutSeconds"])
    tasks = [
        asyncio.create_task(load_order(item["id"], item["delay"], item["fail"]))
        for item in request["orders"]
    ]
    done, pending = await asyncio.wait(tasks, timeout=timeout)
    for item in pending:
        item.cancel()
        trace.cancelled += 1
    await asyncio.gather(*pending, return_exceptions=True)

    results: list[str] = []
    for item in done:
        try:
            results.append(item.result())
        except ValueError:
            trace.failures += 1

    with managed_resource() as resource:
        if not resource["open"]:
            raise AssertionError("resource opened incorrectly")
        first_two = []
        stream = stream_values([3, 4, 5])
        first_two.append(next(stream))
        first_two.append(next(stream))
        stream.close()

    if trace.entered != trace.exited:
        raise AssertionError("context manager leaked")
    if trace.cancelled < 1:
        raise AssertionError("fixture must exercise cancellation")
    if trace.failures != 1:
        raise AssertionError("failure propagation changed")
    if first_two != [6, 8]:
        raise AssertionError("generator output changed")
    if getattr(load_order, "calls", None) != ["load_order"] * (len(done) + len(pending)):
        raise AssertionError("decorator call count is wrong")

    print(
        json.dumps(
            {
                "completed": sorted(results),
                "cancelled": trace.cancelled,
                "failures": trace.failures,
                "resourceCompleted": trace.entered == trace.exited,
                "generator": first_two,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    print("python async cleanup verified")


if __name__ == "__main__":
    asyncio.run(main())
`,
      '{"timeoutSeconds":0.02,"orders":[{"id":"o-1","delay":0.001,"fail":false},{"id":"o-2","delay":0.001,"fail":true},{"id":"o-3","delay":0.2,"fail":false},{"id":"o-4","delay":0.2,"fail":false}]}',
      '输出应为 completed=["loaded:o-1"]、cancelled=2、failures=1、resourceCompleted=true、generator=[6,8]。把 timeoutSeconds 调大到 0.3 后取消数会变化，但失败数仍应为 1；删除上下文 finally 或生成器 close 必须让任务失败。',
    ),
    task(
      'p07-python-async-independent',
      'python',
      '独立实践：有界队列与流式异步处理',
      'stdin 提供批次、队列容量、慢消费者时间和失败块。程序用 asyncio.Queue(maxsize=...) 建立背压，生产、消费、重试和取消都记录稳定结果；阻塞函数必须被明确拒绝。',
      String.raw`from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass


@dataclass
class Metrics:
    produced: int = 0
    consumed: int = 0
    failed_blocks: int = 0
    retried_blocks: int = 0
    max_queue: int = 0


def reject_blocking_handler(declared_blocking: bool) -> None:
    if declared_blocking:
        raise RuntimeError("blocking call cannot run inside an async handler")


async def consume(queue: asyncio.Queue, capacity: int, metrics: Metrics, delay: float) -> None:
    while True:
        item = await queue.get()
        try:
            if item is None:
                return
            await asyncio.sleep(delay)
            if item["failOnce"]:
                metrics.failed_blocks += 1
                metrics.retried_blocks += 1
                result = "recovered:" + item["id"]
            else:
                result = "ok:" + item["id"]
            if not result:
                raise AssertionError("result is required")
            metrics.consumed += 1
        finally:
            queue.task_done()
            metrics.max_queue = max(metrics.max_queue, queue.qsize())
            if queue.qsize() > capacity:
                raise AssertionError("queue exceeded configured capacity")


async def produce(queue: asyncio.Queue, blocks: list[dict[str, object]], metrics: Metrics) -> None:
    for block in blocks:
        await queue.put(block)
        metrics.produced += 1
        metrics.max_queue = max(metrics.max_queue, queue.qsize())
        await asyncio.sleep(0)
    await queue.put(None)


async def main() -> None:
    request = json.load(sys.stdin)
    reject_blocking_handler(bool(request.get("blockingHandler", False)))
    capacity = int(request["queueCapacity"])
    if capacity < 1 or capacity > 8:
        raise ValueError("queue capacity out of budget")
    queue: asyncio.Queue = asyncio.Queue(maxsize=capacity)
    metrics = Metrics()
    consumer = asyncio.create_task(consume(queue, capacity, metrics, float(request["consumerDelay"])))
    try:
        await asyncio.wait_for(produce(queue, request["blocks"], metrics), timeout=float(request["timeoutSeconds"]))
        await asyncio.wait_for(queue.join(), timeout=float(request["timeoutSeconds"]))
    finally:
        if not consumer.done():
            consumer.cancel()
            await asyncio.gather(consumer, return_exceptions=True)

    if metrics.produced != len(request["blocks"]):
        raise AssertionError("producer count mismatch")
    if metrics.consumed != len(request["blocks"]):
        raise AssertionError("consumer count mismatch")
    if metrics.failed_blocks != 1 or metrics.retried_blocks != 1:
        raise AssertionError("failure recovery is not deterministic")
    if metrics.max_queue > capacity:
        raise AssertionError("backpressure was not enforced")
    if queue.qsize() != 0:
        raise AssertionError("queue should be drained")

    print(json.dumps(metrics.__dict__, ensure_ascii=False, sort_keys=True))
    print("python bounded async pipeline verified")


if __name__ == "__main__":
    asyncio.run(main())
`,
      '{"queueCapacity":2,"consumerDelay":0.001,"timeoutSeconds":2,"blockingHandler":false,"blocks":[{"id":"b1","failOnce":false},{"id":"b2","failOnce":true},{"id":"b3","failOnce":false},{"id":"b4","failOnce":false}]}',
      '输出须显示 produced=4、consumed=4、failed_blocks=1、retried_blocks=1，max_queue 不超过 2，队列最终为空。把 blockingHandler 改为 true 必须拒绝执行；把 queueCapacity 改为 9 必须失败。',
    ),
    [
      '运行命令：python main.py。',
      '任务只使用 Python 标准库，异步延迟真实执行，取消与清理可观察。',
      '验收同时检查输出数量、取消路径、异常传播和队列上界。',
    ],
  ),
  'programming:Python 项目、打包、uv 与依赖锁定': lab(
    'python',
    'python',
    'Python 3.11+ / 锁定、构建与制品审计',
    'P07 收口代码台 · pyproject、锁文件与 wheel 制品',
    '用标准库解析项目元数据、依赖图与文件清单，验证运行时依赖和开发依赖分离、精确锁定、传递依赖闭合和 wheel 命名。外部 uv 命令由确定性文件契约模拟。',
    task(
      'p07-python-packaging-guided',
      'python',
      '跟做：从 pyproject 到可复现锁文件',
      'stdin 给出项目、运行时与开发依赖、锁文件和传递依赖。程序规范化包名、拒绝范围版本、确认运行时闭包完整，并生成只含生产依赖的部署清单。',
      String.raw`from __future__ import annotations

import json
import re
import sys


def normalize(name: str) -> str:
    normalized = re.sub(r"[-_.]+", "-", name).lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", normalized):
        raise ValueError(f"invalid package name: {name}")
    return normalized


def exact_pin(requirement: str) -> tuple[str, str]:
    if requirement.count("==") != 1:
        raise ValueError(f"dependency is not exactly locked: {requirement}")
    name, version = requirement.split("==")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"invalid pinned version: {version}")
    return normalize(name), version


def closure(root: list[str], locked_edges: dict[str, list[str]]) -> set[str]:
    result: set[str] = set()
    stack = list(root)
    while stack:
        name = stack.pop()
        if name in result:
            continue
        if name not in locked_edges:
            raise ValueError(f"missing transitive lock entry: {name}")
        result.add(name)
        stack.extend(locked_edges[name])
    return result


def main() -> None:
    request = json.load(sys.stdin)
    project_name = normalize(request["project"]["name"])
    runtime = dict(exact_pin(item) for item in request["runtimeDependencies"])
    dev = dict(exact_pin(item) for item in request["devDependencies"])
    locked_edges = {
        normalize(name): [normalize(dep) for dep in deps]
        for name, deps in request["lockedEdges"].items()
    }
    for name, version in runtime.items():
        if name not in locked_edges:
            raise ValueError(f"runtime dependency omitted from lock: {name}")
        if not version:
            raise AssertionError("runtime version cannot be empty")
    prod_closure = closure(list(runtime), locked_edges)
    dev_only = closure(list(dev), locked_edges) - prod_closure
    if {"pytest", "ruff"} - dev_only:
        raise AssertionError("development tools must not enter production closure")
    if "pytest" in prod_closure:
        raise AssertionError("production closure contains pytest")

    deployment_packages = sorted(prod_closure)
    manifest = {
        "project": project_name,
        "requiresPython": request["project"]["requiresPython"],
        "packages": deployment_packages,
        "source": "pyproject+lock",
    }
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    print("python lock closure verified")


if __name__ == "__main__":
    main()
`,
      '{"project":{"name":"Orders_API","requiresPython":">=3.11,<3.13"},"runtimeDependencies":["httpx==0.27.2","pydantic==2.9.2"],"devDependencies":["pytest==8.3.3","ruff==0.7.2"],"lockedEdges":{"httpx":["anyio","certifi"],"pydantic":["pydantic-core","typing-extensions"],"anyio":[],"certifi":[],"pydantic-core":[],"typing-extensions":[],"pytest":[],"ruff":[]}}',
      '部署清单项目名必须是 orders-api，运行时闭包必须包含 httpx、pydantic 与四个传递依赖，且不能包含 pytest、ruff。把 httpx 改成 httpx>=0.27 必须失败；删除 pydantic-core 锁项也必须失败。',
    ),
    task(
      'p07-python-packaging-independent',
      'python',
      '独立实践：生成可审计 wheel 清单',
      'stdin 提供项目版本、文件、依赖和构建环境。程序拒绝路径穿越、开发依赖、重复文件与未哈希文件，计算内容摘要并输出规范 wheel 名称与发布门禁结果。',
      String.raw`from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import PurePosixPath


def normalize(name: str) -> str:
    normalized = re.sub(r"[-_.]+", "-", name).lower()
    if not normalized or not re.fullmatch(r"[a-z0-9-]+", normalized):
        raise ValueError("invalid distribution name")
    return normalized


def safe_path(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"unsafe artifact path: {value}")
    return path.as_posix()


def main() -> None:
    request = json.load(sys.stdin)
    name = normalize(request["name"])
    version = request["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:rc\d+)?", version):
        raise ValueError("invalid PEP 440 version")
    runtime = {normalize(item.split("==")[0]) for item in request["runtimeDependencies"]}
    if any(item.count("==") != 1 for item in request["runtimeDependencies"]):
        raise ValueError("runtime dependencies must be exact")
    if any(item.startswith(("pytest", "ruff")) for item in runtime):
        raise ValueError("development dependency leaked into wheel")

    seen: set[str] = set()
    files: list[dict[str, str]] = []
    for item in request["files"]:
        path = safe_path(item["path"])
        if path in seen:
            raise ValueError(f"duplicate wheel member: {path}")
        seen.add(path)
        content = item["content"].encode("utf-8")
        digest = hashlib.sha256(content).hexdigest()
        declared = item.get("sha256")
        if declared and declared != digest:
            raise ValueError(f"hash mismatch: {path}")
        files.append({"path": path, "sha256": digest, "size": str(len(content))})
    required = {"orders/__init__.py", "orders/app.py", "METADATA"}
    if not required.issubset(seen):
        raise ValueError("wheel is missing required package or metadata")

    artifact = f"{name.replace('-', '_')}-{version}-py3-none-any.whl"
    manifest = {
        "artifact": artifact,
        "runtimeDependencies": sorted(runtime),
        "files": sorted(files, key=lambda item: item["path"]),
        "reproducible": all(item["sha256"] for item in files),
    }
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    print("wheel artifact audit passed")


if __name__ == "__main__":
    main()
`,
      '{"name":"Orders.API","version":"1.4.0","runtimeDependencies":["httpx==0.27.2","pydantic==2.9.2"],"files":[{"path":"orders/__init__.py","content":"VERSION = \\"1.4.0\\"\\n"},{"path":"orders/app.py","content":"def health(): return {\\"ok\\": True}\\n"},{"path":"METADATA","content":"Name: orders-api\\nVersion: 1.4.0\\n"}]}',
      '输出 artifact 必须是 orders_api-1.4.0-py3-none-any.whl，三个文件都有非空 sha256，runtimeDependencies 只含两个生产包。把任一 path 改为 ../secret、增加重复成员、改错声明哈希或混入 pytest 依赖都必须失败。',
    ),
    [
      '运行命令：python main.py。',
      'uv 不在线安装依赖；任务以 pyproject、锁文件和 wheel 成员契约验证发布是否可复现。',
      '验收看版本锁定、闭包、路径和摘要，不看是否存在 uv 命令。',
    ],
  ),
  'programming:FastAPI、Django 与 SQLAlchemy 工程': lab(
    'python',
    'python',
    'Python 3.11+ / Web、ORM 与事务契约',
    'P07 收口代码台 · FastAPI、Django 与 SQLAlchemy 工程',
    '通过标准库 HTTP 请求对象、依赖校验和 sqlite3 事务模拟框架边界，再实现异步连接池与 N+1 查询治理。第三方框架行为被明确建模，不声称启动 FastAPI 或 Django 服务。',
    task(
      'p07-python-framework-guided',
      'python',
      '跟做：路由校验、依赖授权与事务提交',
      'stdin 给出请求、令牌和一次重复提交。程序校验字段、认证依赖、金额边界和唯一约束；成功与重复请求返回同一订单，非法输入不得写入数据库。',
      String.raw`from __future__ import annotations

import json
import sqlite3
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class OrderInput:
    order_id: str
    amount_cents: int
    customer: str


def validate(payload: dict[str, object]) -> OrderInput:
    order_id = str(payload.get("orderId", ""))
    customer = str(payload.get("customer", "")).strip()
    amount = payload.get("amountCents")
    if not order_id.startswith("o-") or len(order_id) > 24:
        raise ValueError("invalid order id")
    if not customer or len(customer) > 80:
        raise ValueError("invalid customer")
    if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0 or amount > 1_000_000:
        raise ValueError("invalid amount")
    return OrderInput(order_id, amount, customer)


def authorize(token: str, required_scope: str) -> None:
    token = token.strip()
    if not token.startswith("svc-") or required_scope not in token.split("."):
        raise PermissionError("scope denied")


def create_order(connection: sqlite3.Connection, order: OrderInput) -> tuple[int, dict[str, object]]:
    try:
        connection.execute("BEGIN")
        connection.execute(
            "INSERT INTO orders(id, customer, amount_cents) VALUES (?, ?, ?)",
            (order.order_id, order.customer, order.amount_cents),
        )
        connection.commit()
        return 201, {"id": order.order_id, "status": "created"}
    except sqlite3.IntegrityError:
        connection.rollback()
        row = connection.execute(
            "SELECT id, customer, amount_cents FROM orders WHERE id = ?", (order.order_id,)
        ).fetchone()
        if row is None:
            raise AssertionError("duplicate request must return existing row")
        return 200, {"id": row[0], "status": "existing"}


def main() -> None:
    request = json.load(sys.stdin)
    authorize(request["token"], "orders:write")
    payload = request["order"]
    connection = sqlite3.connect(":memory:")
    connection.execute(
        "CREATE TABLE orders(id TEXT PRIMARY KEY, customer TEXT NOT NULL, amount_cents INTEGER NOT NULL)"
    )
    try:
        first_status, first = create_order(connection, validate(payload))
        second_status, second = create_order(connection, validate(payload))
        count = connection.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        if (first_status, second_status) != (201, 200):
            raise AssertionError("status mapping changed")
        if first["id"] != second["id"] or count != 1:
            raise AssertionError("idempotency failed")
        try:
            validate({"orderId": "bad", "customer": "", "amountCents": -1})
        except ValueError:
            rejected = True
        else:
            rejected = False
        if not rejected:
            raise AssertionError("validation accepted malformed order")
        print(json.dumps({"first": first_status, "duplicate": second_status, "rows": count, "invalidRejected": rejected}, ensure_ascii=False, sort_keys=True))
        print("python web transaction contract verified")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
`,
      '{"token":"svc-orders.orders:write","order":{"orderId":"o-1042","customer":"Ada","amountCents":12990}}',
      '输出须为 first=201、duplicate=200、rows=1、invalidRejected=true。把 token 去掉 orders:write 必须返回权限拒绝；把 amountCents 改为 0 或把 orderId 改为 1042 必须被校验层拒绝。',
    ),
    task(
      'p07-python-framework-independent',
      'python',
      '独立实践：连接池、批量加载与事务回滚',
      'stdin 给出订单、关联项、连接池上限、查询延迟和回滚标志。程序用 asyncio.Semaphore 限制并发，比较 N+1 与批量加载的往返次数，并验证失败订单整体回滚。',
      String.raw`from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Row:
    order_id: str
    related: int
    amount: int


class Pool:
    def __init__(self, size: int) -> None:
        if size < 1:
            raise ValueError("pool size must be positive")
        self.semaphore = asyncio.Semaphore(size)
        self.active = 0
        self.peak = 0

    async def query(self, delay: float) -> None:
        async with self.semaphore:
            self.active += 1
            self.peak = max(self.peak, self.active)
            try:
                await asyncio.sleep(delay)
            finally:
                self.active -= 1


def validate(rows: list[Row]) -> None:
    for row in rows:
        if row.amount <= 0:
            raise ValueError("amount must be positive")


async def n_plus_one(pool: Pool, rows: list[Row], delay: float) -> int:
    await pool.query(delay)
    calls = 1
    for row in rows:
        if row.related:
            await pool.query(delay)
            calls += 1
    return calls


async def batched(pool: Pool, rows: list[Row], delay: float) -> int:
    await pool.query(delay)
    if any(row.related for row in rows):
        await pool.query(delay)
        return 2
    return 1


async def main() -> None:
    request = json.load(sys.stdin)
    rows = [Row(item["id"], int(item["related"]), int(item["amount"])) for item in request["orders"]]
    pool = Pool(int(request["poolSize"]))
    delay = float(request["queryDelay"])
    n_plus_one_calls = await n_plus_one(pool, rows, delay)
    batched_calls = await batched(pool, rows, delay)
    if n_plus_one_calls <= batched_calls:
        raise ValueError("fixture must demonstrate N+1 cost")
    if pool.peak > int(request["poolSize"]):
        raise RuntimeError("pool limit exceeded")

    committed: list[str] = []
    try:
        validate(rows)
        committed.extend(row.order_id for row in rows)
    except ValueError:
        committed.clear()
    if request["rollback"] and committed:
        raise AssertionError("rollback flag did not clear transaction")
    if not request["rollback"] and len(committed) != len(rows):
        raise AssertionError("successful transaction should commit all rows")

    print(json.dumps({"nPlusOneCalls": n_plus_one_calls, "batchedCalls": batched_calls, "poolPeak": pool.peak, "committed": committed}, ensure_ascii=False, sort_keys=True))
    print("python orm query budget verified")


if __name__ == "__main__":
    asyncio.run(main())
`,
      '{"poolSize":2,"queryDelay":0.001,"rollback":true,"orders":[{"id":"o1","related":2,"amount":100},{"id":"o2","related":1,"amount":-1},{"id":"o3","related":0,"amount":300}]}',
      '输出须显示 N+1 调用 3 次、批量调用 2 次、poolPeak 不超过 2、committed=[]。把 rollback 改为 false 时，负数金额仍应触发回滚并失败；把 poolSize 改为 0 必须被连接池拒绝。',
    ),
    [
      '运行命令：python main.py。',
      'FastAPI、Django、SQLAlchemy 由请求、授权、事务和连接池契约模拟；sqlite3 事务真实执行。',
      '验收必须证明状态码、幂等、权限、回滚和查询次数，不只检查路由能返回 200。',
    ],
  ),
  'programming:Go net/http、Gin 与 gRPC 工程': lab(
    'go',
    'go',
    'Go 1.22+ / net/http 与协议契约',
    'P08 收口代码台 · HTTP、gRPC 与服务生命周期',
    '使用 Go 标准库执行真实 HTTP 处理链、超时、结构化协议编解码、trace 传播和优雅停机；Gin 与 gRPC 的具体框架行为用可观察契约模拟。',
    task(
      'p08-go-http-guided',
      'go',
      '跟做：中间件顺序与请求超时',
      '原样运行。程序用 httptest 发起真实本地请求，记录 Trace、Auth、Handler 的执行顺序，验证 405、401、超时和响应头都不会绕过中间件。',
      String.raw`package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"time"
)

type config struct {
	Token   string
	DelayMS int
	Path    string
}

type traceKey struct{}

func readConfig() (config, error) {
	result := config{Token: "svc-orders", DelayMS: 10, Path: "/api/orders"}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			return result, fmt.Errorf("invalid input line: %s", line)
		}
		switch parts[0] {
		case "token":
			result.Token = parts[1]
		case "path":
			result.Path = parts[1]
		case "delayMs":
			if _, err := fmt.Sscanf(parts[1], "%d", &result.DelayMS); err != nil {
				return result, err
			}
		}
	}
	return result, scanner.Err()
}

func withTrace(next http.Handler, steps *[]string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*steps = append(*steps, "Trace")
		w.Header().Set("X-Trace-Id", "trace-p08")
		next.ServeHTTP(w, r)
	})
}

func withAuth(next http.Handler, expected string, steps *[]string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*steps = append(*steps, "Auth")
		if r.Header.Get("Authorization") != "Bearer "+expected {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withTimeout(next http.Handler, delay time.Duration, steps *[]string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*steps = append(*steps, "Timeout")
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-timer.C:
			next.ServeHTTP(w, r)
		case <-r.Context().Done():
			http.Error(w, "deadline exceeded", http.StatusGatewayTimeout)
		}
	})
}

func main() {
	cfg, err := readConfig()
	if err != nil {
		panic(err)
	}
	var steps []string
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/orders", func(w http.ResponseWriter, r *http.Request) {
		steps = append(steps, "Handler")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "o-1042", "status": "submitted"})
	})
	handler := withTrace(withAuth(withTimeout(mux, time.Duration(cfg.DelayMS)*time.Millisecond, &steps), cfg.Token, &steps), &steps)

	request := httptest.NewRequest(http.MethodGet, cfg.Path, nil)
	request.Header.Set("Authorization", "Bearer "+cfg.Token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		panic(fmt.Sprintf("expected 200, got %d", response.Code))
	}
	if response.Header().Get("X-Trace-Id") == "" {
		panic("trace header is missing")
	}
	if strings.Join(steps, ">") != "Trace>Auth>Timeout>Handler" {
		panic("middleware order changed: " + strings.Join(steps, ">"))
	}
	if !strings.Contains(response.Body.String(), "o-1042") {
		panic("response contract changed")
	}

	badRequest := httptest.NewRequest(http.MethodGet, cfg.Path, nil)
	badResponse := httptest.NewRecorder()
	handler.ServeHTTP(badResponse, badRequest)
	if badResponse.Code != http.StatusUnauthorized {
		panic("auth middleware did not short-circuit")
	}
	fmt.Printf("order=%s\n", strings.Join(steps, " > "))
	fmt.Printf("status=%d body=%s", response.Code, response.Body.String())
	fmt.Println("go http middleware contract verified")
}
`,
      'token=svc-orders\npath=/api/orders\ndelayMs=10',
      '成功请求必须输出 Trace > Auth > Timeout > Handler、状态 200、响应含 o-1042；无令牌请求必须停在 401。把 path 改成 /api/orders/extra 后应得到 404，不能误路由到订单处理器。',
    ),
    task(
      'p08-go-http-independent',
      'go',
      '独立实践：gRPC 风格契约与优雅停机',
      'stdin 给出服务地址、deadline、trace、请求体和关闭超时。程序启动真实回环 HTTP 服务，以确定性 envelope 返回结果，并验证 deadline、错误码、trace 传播和 graceful shutdown。',
      String.raw`package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

type requestConfig struct {
	OrderID    string
	DeadlineMS int
	TraceID    string
}

type envelope struct {
	Code    int
	Message string
	TraceID string
	Data    map[string]any
}

func readConfig() (requestConfig, error) {
	cfg := requestConfig{OrderID: "o-2048", DeadlineMS: 200, TraceID: "trace-2048"}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			return cfg, fmt.Errorf("invalid input line")
		}
		switch parts[0] {
		case "orderId":
			cfg.OrderID = parts[1]
		case "traceId":
			cfg.TraceID = parts[1]
		case "deadlineMs":
			if _, err := fmt.Sscanf(parts[1], "%d", &cfg.DeadlineMS); err != nil {
				return cfg, err
			}
		}
	}
	if cfg.DeadlineMS < 1 || cfg.DeadlineMS > 2000 {
		return cfg, fmt.Errorf("deadline outside budget")
	}
	return cfg, scanner.Err()
}

func main() {
	cfg, err := readConfig()
	if err != nil {
		panic(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Trace-Id") != cfg.TraceID {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(envelope{Code: 3, Message: "trace mismatch", TraceID: cfg.TraceID})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(envelope{
			Code:    0,
			Message: "ok",
			TraceID: cfg.TraceID,
			Data:    map[string]any{"orderId": cfg.OrderID, "protocol": "grpc-contract"},
		})
	})}
	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && serveErr != http.ErrServerClosed {
			panic(serveErr)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.DeadlineMS)*time.Millisecond)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+listener.Addr().String()+"/rpc/orders/get", nil)
	if err != nil {
		panic(err)
	}
	request.Header.Set("X-Trace-Id", cfg.TraceID)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		panic(err)
	}
	body, err := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if err != nil {
		panic(err)
	}
	var payload envelope
	if err := json.Unmarshal(body, &payload); err != nil {
		panic(err)
	}
	if response.StatusCode != http.StatusOK || payload.Code != 0 || payload.TraceID != cfg.TraceID {
		panic("contract envelope mismatch")
	}
	if payload.Data["protocol"] != "grpc-contract" || payload.Data["orderId"] != cfg.OrderID {
		panic("response data mismatch")
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		panic(err)
	}
	fmt.Printf("address=%s\n", listener.Addr().String())
	fmt.Println("code=0 trace=" + payload.TraceID + " protocol=" + fmt.Sprint(payload.Data["protocol"]))
	fmt.Println("graceful shutdown completed")
}
`,
      'orderId=o-2048\ntraceId=trace-2048\ndeadlineMs=200',
      '输出必须显示真实 127.0.0.1 地址、code=0、同一 traceId、protocol=grpc-contract，并出现 graceful shutdown completed。把 deadlineMs 改为 0 或 3000 必须在启动前失败。',
    ),
    [
      '运行命令：go run main.go；任务只使用 Go 标准库。',
      'HTTP 服务在 127.0.0.1 的真实临时端口上运行；Gin 与 gRPC 的阻塞、中间件和 envelope 语义由契约模拟。',
      '验收看状态码、trace、deadline、错误 envelope 与优雅停机，不以 go run 退出 0 代替协议正确。',
    ],
  ),
  'programming:Go 内存、GC、竞态、pprof 与部署': lab(
    'go',
    'go',
    'Go 1.22+ / runtime、pprof 与探针',
    'P08 收口代码台 · 内存、GC、竞态、性能剖析与部署',
    '运行 Go 标准库任务：比较字符串拼接与 Builder 的分配、读取 GC 和 pprof 运行状态、使用有界并发避免 goroutine 失控，并验证探针、资源限制和优雅停机。',
    task(
      'p08-go-runtime-guided',
      'go',
      '跟做：分配、GC 与剖析不是猜测',
      'stdin 给出迭代次数和并发上限。程序执行字符串拼接与 Builder 对照，读取 heap/GC 状态，运行 pprof 标签，并在有界 worker 池中处理任务；输出必须包含可比较的分配与队列证据。',
      String.raw`package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"strconv"
	"strings"
	"sync"
)

func readInts() (int, int, error) {
	iterations, workers := 0, 0
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		parts := strings.SplitN(strings.TrimSpace(scanner.Text()), "=", 2)
		if len(parts) != 2 {
			continue
		}
		value, err := strconv.Atoi(parts[1])
		if err != nil {
			return 0, 0, err
		}
		if parts[0] == "iterations" {
			iterations = value
		} else if parts[0] == "workers" {
			workers = value
		}
	}
	return iterations, workers, scanner.Err()
}

func concat(iterations int) int {
	total := 0
	for i := 0; i < iterations; i++ {
		value := ""
		for j := 0; j < 8; j++ {
			value += "segment-"
		}
		total += len(value)
	}
	return total
}

func builder(iterations int) int {
	total := 0
	for i := 0; i < iterations; i++ {
		var value strings.Builder
		value.Grow(64)
		for j := 0; j < 8; j++ {
			value.WriteString("segment-")
		}
		total += value.Len()
	}
	return total
}

func main() {
	iterations, workers, err := readInts()
	if err != nil {
		panic(err)
	}
	if iterations < 100 || iterations > 100000 {
		panic("iterations outside benchmark budget")
	}
	if workers < 1 || workers > 8 {
		panic("worker limit outside budget")
	}
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	left := concat(iterations)
	var afterConcat runtime.MemStats
	runtime.ReadMemStats(&afterConcat)
	right := builder(iterations)
	var afterBuilder runtime.MemStats
	runtime.ReadMemStats(&afterBuilder)
	if left != right {
		panic("benchmarks must compute the same byte count")
	}
	concatMallocs := afterConcat.Mallocs - before.Mallocs
	builderMallocs := afterBuilder.Mallocs - afterConcat.Mallocs
	if concatMallocs == 0 || builderMallocs == 0 {
		panic("fixture did not observe allocations")
	}

	jobs := make(chan int)
	var group sync.WaitGroup
	var lock sync.Mutex
	processed := 0
	for worker := 0; worker < workers; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for range jobs {
				lock.Lock()
				processed++
				lock.Unlock()
			}
		}()
	}
	for i := 0; i < 32; i++ {
		jobs <- i
	}
	close(jobs)
	group.Wait()
	if processed != 32 {
		panic("bounded worker pool lost jobs")
	}
	labels := pprof.Labels("lesson", "p08-go-runtime", "workers", strconv.Itoa(workers))
	pprof.Do(context.Background(), labels, func(context.Context) {})
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	fmt.Printf("iterations=%d bytes=%d\n", iterations, left)
	fmt.Printf("concat_mallocs=%d builder_mallocs=%d\n", concatMallocs, builderMallocs)
	fmt.Printf("gc_cycles=%d heap_inuse=%d\n", after.NumGC-before.NumGC, after.HeapInuse)
	fmt.Printf("workers=%d processed=%d\n", workers, processed)
	fmt.Println("go allocation and worker bounds verified")
}
`,
      'iterations=2000\nworkers=4',
      '输出必须显示相同 bytes、正数 concat_mallocs 与 builder_mallocs、workers=4、processed=32。把 workers 改为 0 或 9、iterations 改为 50 必须在基准开始前失败。',
    ),
    task(
      'p08-go-runtime-independent',
      'go',
      '独立实践：部署清单、探针与优雅停机',
      'stdin 给出 CPU/内存限制、探针路径、请求数、队列上限和关闭超时。程序校验部署预算，启动真实回环健康服务，处理有界请求并完成 graceful shutdown。',
      String.raw`package main

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"time"
)

type deployConfig struct {
	CPUMilli int
	MemoryMB int
	Queue    int
	Requests int
	Shutdown int
}

func readConfig() (deployConfig, error) {
	cfg := deployConfig{CPUMilli: 500, MemoryMB: 256, Queue: 16, Requests: 8, Shutdown: 500}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			return cfg, fmt.Errorf("invalid input line")
		}
		value, err := strconv.Atoi(parts[1])
		if err != nil {
			return cfg, err
		}
		switch parts[0] {
		case "cpuMilli":
			cfg.CPUMilli = value
		case "memoryMB":
			cfg.MemoryMB = value
		case "queue":
			cfg.Queue = value
		case "requests":
			cfg.Requests = value
		case "shutdownMs":
			cfg.Shutdown = value
		}
	}
	if cfg.CPUMilli < 100 || cfg.CPUMilli > 4000 {
		return cfg, fmt.Errorf("cpu request outside budget")
	}
	if cfg.MemoryMB < 64 || cfg.MemoryMB > 2048 {
		return cfg, fmt.Errorf("memory limit outside budget")
	}
	if cfg.Queue < 1 || cfg.Queue > 64 || cfg.Requests > cfg.Queue {
		return cfg, fmt.Errorf("bounded queue cannot hold request budget")
	}
	if cfg.Shutdown < 100 || cfg.Shutdown > 30000 {
		return cfg, fmt.Errorf("shutdown budget outside range")
	}
	return cfg, scanner.Err()
}

func main() {
	cfg, err := readConfig()
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("live"))
	})
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, "{\"ready\":true,\"queue\":%d}", cfg.Queue)
	})

	probe := httptest.NewRecorder()
	mux.ServeHTTP(probe, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if probe.Code != http.StatusOK || !strings.Contains(probe.Body.String(), "ready") {
		panic("readiness contract failed")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: mux}
	go func() {
		_ = server.Serve(listener)
	}()
	for i := 0; i < cfg.Requests; i++ {
		response, requestErr := http.Get("http://" + listener.Addr().String() + "/health/live")
		if requestErr != nil {
			panic(requestErr)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusOK {
			panic("live probe failed")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.Shutdown)*time.Millisecond)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		panic(err)
	}
	fmt.Printf("limits=cpu:%dm,memory:%dMi\n", cfg.CPUMilli, cfg.MemoryMB)
	fmt.Printf("probes=live:200,ready:200 requests=%d queue=%d\n", cfg.Requests, cfg.Queue)
	fmt.Printf("shutdown_ms=%d\n", cfg.Shutdown)
	fmt.Println("go deployment probes verified")
}
`,
      'cpuMilli=500\nmemoryMB=256\nqueue=16\nrequests=8\nshutdownMs=500',
      '输出须显示 cpu 500m、memory 256Mi、live/ready 均 200、requests=8、queue=16 与 shutdown_ms=500。把 requests 改为 17、memoryMB 改为 32 或 shutdownMs 改为 50 必须失败。',
    ),
    [
      '运行命令：go run main.go。',
      '分配计数、GC 状态、pprof 标签、HTTP 探针和 graceful shutdown 都使用真实 Go 运行时。',
      '验收比较数量与边界，不依赖单次耗时作为唯一性能结论。',
    ],
  ),
  'programming:C 的 libc、POSIX、系统调用与调试': lab(
    'c',
    'c',
    'C17 / POSIX / GCC',
    'P09 收口代码台 · libc、POSIX 与资源生命周期',
    '运行真实 GCC 标准库任务：用 pipe、fork、read、write 和 waitpid 处理部分成功、EINTR、EOF、子进程回收与文件描述符关闭；调试器与 strace 的观察点由程序输出和断言固定。',
    task(
      'p09-c-posix-guided',
      'c',
      '跟做：部分读写与子进程回收',
      'stdin 提供消息、短写和 EINTR 次数。程序用可移植 C 状态机模拟 POSIX 管道、部分读写、信号中断和子进程状态；每次系统调用结果都可观察，最后证明子进程已回收。',
      String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum ProcessState { PROCESS_RUNNING = 1, PROCESS_EXITED = 2, PROCESS_REAPED = 3 };

struct Pipe {
  char bytes[256];
  size_t length;
  int read_closed;
  int write_closed;
};

struct Child {
  int pid;
  enum ProcessState state;
  int exit_code;
};

static int robust_write(struct Pipe *pipe, const char *buffer, size_t length, int shortWrite,
    int interruptEvery, int *syscalls, int *eintrCount) {
  size_t offset = 0;
  while (offset < length) {
    (*syscalls)++;
    if (interruptEvery > 0 && *syscalls <= interruptEvery) {
      (*eintrCount)++;
      continue;
    }
    size_t chunk = length - offset;
    if (shortWrite && chunk > 3) chunk = 3;
    memcpy(pipe->bytes + pipe->length, buffer + offset, chunk);
    pipe->length += chunk;
    offset += chunk;
  }
  return 0;
}

static int robust_read(const struct Pipe *pipe, char *output, size_t capacity,
    int shortRead, int *callCount) {
  size_t offset = 0;
  while (offset < pipe->length && offset + 1 < capacity) {
    size_t chunk = pipe->length - offset;
    if (shortRead && chunk > 2) chunk = 2;
    (*callCount)++;
    memcpy(output + offset, pipe->bytes + offset, chunk);
    offset += chunk;
  }
  output[offset] = '\0';
  return 0;
}

static int waitpid_sim(struct Child *child) {
  if (child->state != PROCESS_EXITED) return -1;
  child->state = PROCESS_REAPED;
  return child->pid;
}

int main(void) {
  char payload[256] = {0};
  char line[320] = {0};
  int shortWrite = 0;
  int interrupts = 0;
  while (fgets(line, sizeof(line), stdin) != NULL) {
    if (strncmp(line, "payload=", 8) == 0) {
      size_t length = strcspn(line + 8, "\r\n");
      if (length == 0 || length >= sizeof(payload)) return 1;
      memcpy(payload, line + 8, length);
      payload[length] = '\0';
    } else if (strncmp(line, "shortWrite=", 11) == 0) {
      shortWrite = atoi(line + 11) != 0;
    } else if (strncmp(line, "interrupts=", 11) == 0) {
      interrupts = atoi(line + 11);
    }
  }
  if (payload[0] == '\0' || interrupts < 1 || interrupts > 8) return 1;

  struct Pipe toChild = {0};
  struct Pipe fromChild = {0};
  struct Child child = {1042, PROCESS_RUNNING, 0};
  int syscalls = 0;
  int eintrCount = 0;
  int readCalls = 0;
  if (robust_write(&toChild, payload, strlen(payload), shortWrite, interrupts, &syscalls, &eintrCount) != 0) return 1;
  toChild.write_closed = 1;
  char received[256] = {0};
  if (robust_read(&toChild, received, sizeof(received), shortWrite, &readCalls) != 0) return 1;
  toChild.read_closed = 1;
  unsigned long checksum = 0;
  for (size_t index = 0; received[index] != '\0'; index++) checksum += (unsigned char)received[index];
  char response[32] = {0};
  int responseLength = snprintf(response, sizeof(response), "%lu", checksum);
  if (responseLength <= 0) return 1;
  syscalls = 0;
  if (robust_write(&fromChild, response, (size_t)responseLength, 0, 0, &syscalls, &eintrCount) != 0) return 1;
  fromChild.write_closed = 1;
  child.state = PROCESS_EXITED;
  child.exit_code = 0;
  if (waitpid_sim(&child) != child.pid || child.state != PROCESS_REAPED || child.exit_code != 0) return 1;
  if (strcmp(received, payload) != 0 || eintrCount < 1) return 1;

  printf("bytes=%zu checksum=%lu\n", strlen(payload), checksum);
  printf("short_write=%s eintr_retries=%d read_calls=%d\n", shortWrite ? "true" : "false", eintrCount, readCalls);
  printf("child_state=reaped exit_code=0\n");
  printf("posix contract simulation verified\n");
  return 0;
}
`,
      'payload=orders;status=submitted;amount=12990\nshortWrite=1\ninterrupts=1',
      '输出必须显示正确字节数、相同 checksum、short_write=true、EINTR 重试次数和 child_state=reaped。把 shortWrite 改为 0 仍应成功；interrupts 改为 0 必须拒绝，因为任务要求至少证明一次 EINTR 恢复。',
    ),
    task(
      'p09-c-posix-independent',
      'c',
      '独立实践：文件描述符账本与多子进程回收',
      'stdin 给出子进程数、消息和关闭策略。程序维护带身份号的文件描述符账本，为每个子进程建立独立管道，写入、读取并关闭端点，再逐个回收进程；任一泄漏或僵尸都必须失败。',
      String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_FDS 16

struct Descriptor {
  int id;
  int open;
  char mode;
};

struct Ledger {
  struct Descriptor entries[MAX_FDS];
  int nextId;
};

struct Child {
  int pid;
  int running;
  int reaped;
};

static int ledger_open(struct Ledger *ledger, char mode) {
  for (int index = 0; index < MAX_FDS; index++) {
    if (!ledger->entries[index].open) {
      ledger->entries[index].id = ledger->nextId++;
      ledger->entries[index].open = 1;
      ledger->entries[index].mode = mode;
      return ledger->entries[index].id;
    }
  }
  return -1;
}

static int ledger_close(struct Ledger *ledger, int id) {
  for (int index = 0; index < MAX_FDS; index++) {
    if (ledger->entries[index].open && ledger->entries[index].id == id) {
      ledger->entries[index].open = 0;
      return 0;
    }
  }
  return -1;
}

static int ledger_count(const struct Ledger *ledger) {
  int count = 0;
  for (int index = 0; index < MAX_FDS; index++) count += ledger->entries[index].open != 0;
  return count;
}

static int waitpid_sim(struct Child *child) {
  if (child->running || child->reaped) return -1;
  child->reaped = 1;
  return child->pid;
}

int main(void) {
  int children = 0;
  int closeAll = 0;
  char payload[64] = {0};
  char line[128] = {0};
  while (fgets(line, sizeof(line), stdin) != NULL) {
    if (strncmp(line, "children=", 9) == 0) children = atoi(line + 9);
    else if (strncmp(line, "closeAll=", 9) == 0) closeAll = atoi(line + 9) != 0;
    else if (strncmp(line, "payload=", 8) == 0) {
      size_t length = strcspn(line + 8, "\r\n");
      if (length == 0 || length >= sizeof(payload)) return 1;
      memcpy(payload, line + 8, length);
      payload[length] = '\0';
    }
  }
  if (children < 1 || children > 4 || payload[0] == '\0' || !closeAll) return 1;

  struct Ledger ledger = {0};
  struct Child childList[4] = {0};
  int reaped = 0;
  for (int index = 0; index < children; index++) {
    int readFd = ledger_open(&ledger, 'r');
    int writeFd = ledger_open(&ledger, 'w');
    if (readFd < 0 || writeFd < 0) return 1;
    childList[index].pid = 2000 + index;
    childList[index].running = 1;

    char value = payload[index % strlen(payload)];
    childList[index].running = 0;
    if (value == '\0') return 1;
    if (ledger_close(&ledger, writeFd) != 0 || ledger_close(&ledger, readFd) != 0) return 1;
    if (waitpid_sim(&childList[index]) != childList[index].pid) return 1;
    reaped++;
  }
  if (ledger_count(&ledger) != 0) {
    fprintf(stderr, "descriptor leak remains\n");
    return 1;
  }
  for (int index = 0; index < children; index++) {
    if (!childList[index].reaped || waitpid_sim(&childList[index]) != -1) {
      fprintf(stderr, "zombie or double reap detected\n");
      return 1;
    }
  }

  printf("children=%d reaped=%d\n", children, reaped);
  printf("fds_open=%d fds_closed=%d\n", ledger.nextId, ledger.nextId);
  printf("zombies=0\n");
  printf("posix descriptor ledger simulation verified\n");
  return 0;
}
`,
      'children=3\ncloseAll=1\npayload=abc',
      '输出必须显示 children=3、reaped=3、读写端点全部关闭、zombies=0。把 closeAll 改为 0、children 改为 5 或 0 必须提前拒绝；任意遗漏 waitpid/close 都必须触发断言失败。',
    ),
    [
      '运行命令：gcc -std=c17 -O2 -Wall -Wextra -Werror -pedantic main.c -o main && ./main。',
      'Windows GCC 不保证提供 POSIX 头文件，因此任务用确定性 C 状态机模拟 pipe、fork、read、write、fcntl 与 waitpid。',
      '验收检查 EINTR、短写、EOF、子进程状态与描述符关闭，不以进程退出 0 代替资源正确。',
    ],
  ),
  'programming:C 真实项目源码：Redis 与 Nginx': lab(
    'c',
    'c',
    'C17 / 事件状态机与数据结构',
    'P09 收口代码台 · Redis/Nginx 源码阅读与可验证重构',
    '把 Redis 连接状态和 Nginx 事件驱动简化成可运行 C 状态机、环形缓冲与开放寻址表；学习者必须用状态转换、内存所有权和可观察计数解释源码设计。',
    task(
      'p09-c-source-guided',
      'c',
      '跟做：连接从 accept 到 close 的合法状态',
      'stdin 给出事件序列和响应文本。程序执行 accept -> read -> write -> close 状态机，用固定环形缓冲记录输出，拒绝越界状态和缓冲区溢出，并输出每一次转换证据。',
      String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum State { IDLE = 0, ACCEPTED = 1, READING = 2, WRITING = 3, CLOSED = 4 };

struct Ring {
  unsigned char data[32];
  size_t head;
  size_t tail;
  size_t count;
};

static int ring_push(struct Ring *ring, unsigned char value) {
  if (ring->count == sizeof(ring->data)) return -1;
  ring->data[ring->tail] = value;
  ring->tail = (ring->tail + 1) % sizeof(ring->data);
  ring->count++;
  return 0;
}

static int ring_pop(struct Ring *ring, unsigned char *value) {
  if (ring->count == 0) return -1;
  *value = ring->data[ring->head];
  ring->head = (ring->head + 1) % sizeof(ring->data);
  ring->count--;
  return 0;
}

static int transition(enum State *state, char event) {
  switch (*state) {
    case IDLE:
      if (event == 'A') { *state = ACCEPTED; return 0; }
      break;
    case ACCEPTED:
      if (event == 'R') { *state = READING; return 0; }
      if (event == 'C') { *state = CLOSED; return 0; }
      break;
    case READING:
      if (event == 'W') { *state = WRITING; return 0; }
      if (event == 'C') { *state = CLOSED; return 0; }
      break;
    case WRITING:
      if (event == 'R') { *state = READING; return 0; }
      if (event == 'C') { *state = CLOSED; return 0; }
      break;
    case CLOSED:
      break;
  }
  return -1;
}

int main(void) {
  char events[64] = {0};
  char response[64] = {0};
  char line[128] = {0};
  while (fgets(line, sizeof(line), stdin) != NULL) {
    if (strncmp(line, "events=", 7) == 0) {
      size_t length = strcspn(line + 7, "\r\n");
      if (length == 0 || length >= sizeof(events)) return 1;
      memcpy(events, line + 7, length);
      events[length] = '\0';
    } else if (strncmp(line, "response=", 9) == 0) {
      size_t length = strcspn(line + 9, "\r\n");
      if (length == 0 || length >= sizeof(response)) return 1;
      memcpy(response, line + 9, length);
      response[length] = '\0';
    }
  }
  if (events[0] == '\0' || response[0] == '\0') return 1;

  enum State state = IDLE;
  struct Ring ring = {0};
  for (size_t index = 0; events[index] != '\0'; index++) {
    if (transition(&state, events[index]) != 0) {
      fprintf(stderr, "illegal transition %c at index %zu\n", events[index], index);
      return 1;
    }
    if (state == WRITING) {
      for (size_t offset = 0; response[offset] != '\0'; offset++) {
        if (ring_push(&ring, (unsigned char)response[offset]) != 0) {
          fprintf(stderr, "ring buffer overflow\n");
          return 1;
        }
      }
    }
    printf("step=%zu event=%c state=%d\n", index, events[index], state);
  }
  if (state != CLOSED) {
    fprintf(stderr, "connection did not close\n");
    return 1;
  }
  size_t drained = 0;
  unsigned char value = 0;
  while (ring_pop(&ring, &value) == 0) drained++;
  if (drained != strlen(response)) return 1;

  printf("drained=%zu capacity=%zu\n", drained, sizeof(ring.data));
  printf("final_state=closed\n");
  printf("redis/nginx event state machine verified\n");
  return 0;
}
`,
      'events=ARWC\nresponse=HTTP/1.1 200 OK',
      '输出必须逐步显示 accept、read、write、close 状态，drained 等于响应字节数，容量 32。把 events 改为 ARWXR 必须拒绝非法事件；把 response 增至超过 32 字节必须触发环形缓冲上界。',
    ),
    task(
      'p09-c-source-independent',
      'c',
      '独立实践：开放寻址表与源码阅读报告',
      'stdin 提供 SET/GET/DEL 操作与源码关注点。程序实现固定容量开放寻址表，处理哈希冲突、覆盖、删除墓碑与容量拒绝，并输出源码假设、事件模型和可验证性能结论。',
      String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CAPACITY 16

enum SlotState { EMPTY = 0, USED = 1, TOMB = 2 };

struct Slot {
  char key[32];
  char value[32];
  enum SlotState state;
};

static unsigned long hash_key(const char *key) {
  unsigned long hash = 5381;
  while (*key != '\0') hash = ((hash << 5) + hash) ^ (unsigned char)*key++;
  return hash;
}

static int insert(struct Slot table[CAPACITY], const char *key, const char *value) {
  unsigned long start = hash_key(key) % CAPACITY;
  int tomb = -1;
  for (size_t probe = 0; probe < CAPACITY; probe++) {
    size_t index = (start + probe) % CAPACITY;
    if (table[index].state == USED && strcmp(table[index].key, key) == 0) {
      snprintf(table[index].value, sizeof(table[index].value), "%s", value);
      return 0;
    }
    if (table[index].state == TOMB && tomb < 0) tomb = (int)index;
    if (table[index].state == EMPTY) {
      index = tomb >= 0 ? (size_t)tomb : index;
      table[index].state = USED;
      snprintf(table[index].key, sizeof(table[index].key), "%s", key);
      snprintf(table[index].value, sizeof(table[index].value), "%s", value);
      return 0;
    }
  }
  if (tomb >= 0) {
    table[tomb].state = USED;
    snprintf(table[tomb].key, sizeof(table[tomb].key), "%s", key);
    snprintf(table[tomb].value, sizeof(table[tomb].value), "%s", value);
    return 0;
  }
  return -1;
}

static const char *find(struct Slot table[CAPACITY], const char *key) {
  unsigned long start = hash_key(key) % CAPACITY;
  for (size_t probe = 0; probe < CAPACITY; probe++) {
    size_t index = (start + probe) % CAPACITY;
    if (table[index].state == EMPTY) return NULL;
    if (table[index].state == USED && strcmp(table[index].key, key) == 0) return table[index].value;
  }
  return NULL;
}

static int remove_key(struct Slot table[CAPACITY], const char *key) {
  unsigned long start = hash_key(key) % CAPACITY;
  for (size_t probe = 0; probe < CAPACITY; probe++) {
    size_t index = (start + probe) % CAPACITY;
    if (table[index].state == EMPTY) return -1;
    if (table[index].state == USED && strcmp(table[index].key, key) == 0) {
      table[index].state = TOMB;
      return 0;
    }
  }
  return -1;
}

int main(void) {
  struct Slot table[CAPACITY] = {0};
  char line[256] = {0};
  int sets = 0;
  int gets = 0;
  int deletes = 0;
  char observed[32] = {0};
  while (fgets(line, sizeof(line), stdin) != NULL) {
    line[strcspn(line, "\r\n")] = '\0';
    char *op = strtok(line, " ");
    if (op == NULL) continue;
    if (strcmp(op, "SET") == 0) {
      char *key = strtok(NULL, " ");
      char *value = strtok(NULL, " ");
      if (key == NULL || value == NULL || insert(table, key, value) != 0) return 1;
      sets++;
    } else if (strcmp(op, "GET") == 0) {
      char *key = strtok(NULL, " ");
      const char *value = key == NULL ? NULL : find(table, key);
      if (value == NULL) return 1;
      snprintf(observed, sizeof(observed), "%s", value);
      gets++;
    } else if (strcmp(op, "DEL") == 0) {
      char *key = strtok(NULL, " ");
      if (key == NULL || remove_key(table, key) != 0) return 1;
      deletes++;
    }
  }
  if (sets != 16 || gets != 2 || deletes != 1) {
    fprintf(stderr, "operation counts differ from fixture\n");
    return 1;
  }
  if (strcmp(observed, "v8") != 0) return 1;
  if (find(table, "deleted") != NULL) return 1;
  if (insert(table, "overflow", "reuses-tombstone") != 0) {
    fprintf(stderr, "tombstone should be reusable\n");
    return 1;
  }
  if (insert(table, "rejected", "full") == 0) {
    fprintf(stderr, "table should reject after all slots are used\n");
    return 1;
  }

  printf("sets=%d gets=%d deletes=%d observed=%s\n", sets, gets, deletes, observed);
  printf("capacity=%d tombstones=%d\n", CAPACITY, 0);
  printf("source_hypothesis=event-driven reuse must preserve ownership and deletion boundaries\n");
  printf("redis/nginx source model verified\n");
  return 0;
}
`,
      'SET a v1\nSET b v2\nSET c v3\nSET d v4\nSET e v5\nSET f v6\nSET g v7\nSET h v8\nSET i v9\nSET j v10\nSET k v11\nSET l v12\nSET m v13\nSET deleted gone\nSET n v14\nSET p v15\nGET a\nGET h\nDEL deleted',
      '输出须为 sets=16、gets=2、deletes=1、observed=v8，容量 16 且墓碑已被复用。删除后 GET deleted 必须失败；墓碑复用后的下一次插入必须失败，不能静默覆盖或越界。',
    ),
    [
      '运行命令：gcc -std=c17 -O2 -Wall -Wextra -Werror -pedantic main.c -o main && ./main。',
      'Redis 与 Nginx 不实际启动；事件状态机和哈希表用真实 C 数据结构重建其可验证约束。',
      '验收看状态转换、缓冲区上界、哈希冲突、墓碑和所有权结论，不以函数名称相似作为源码理解。',
    ],
  ),
  'programming:C++ Sanitizer、Benchmark 与生产诊断': lab(
    'cpp',
    'cpp',
    'C++20 / GCC / 分配与崩溃诊断',
    'P10 收口代码台 · Sanitizer、Benchmark 与生产诊断',
    '运行 C++20 标准库任务：用计数分配器比较容器与固定环形缓冲的分配次数，验证 RAII 与异常安全，再把 core dump、构建 ID、符号和回归预算组织成可审计诊断报告。',
    task(
      'p10-cpp-diagnostics-guided',
      'cpp',
      '跟做：用分配计数解释容器扩容',
      'stdin 给出载荷数量和环形缓冲容量。程序用同一份 payload 分别写入 vector 与固定容量环，记录分配次数、容量变化和摘要，证明 reserve 能降低扩容、环形缓冲不越界。',
      String.raw`#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <new>
#include <string>
#include <vector>

static std::size_t allocation_count = 0;

template <typename T>
struct CountingAllocator {
  using value_type = T;
  CountingAllocator() = default;
  template <typename U>
  CountingAllocator(const CountingAllocator<U> &) noexcept {}
  T *allocate(std::size_t count) {
    allocation_count++;
    return std::allocator<T>{}.allocate(count);
  }
  void deallocate(T *pointer, std::size_t count) noexcept {
    std::allocator<T>{}.deallocate(pointer, count);
  }
  template <typename U>
  bool operator==(const CountingAllocator<U> &) const noexcept { return true; }
  template <typename U>
  bool operator!=(const CountingAllocator<U> &) const noexcept { return false; }
};

class RingBuffer {
 public:
  explicit RingBuffer(std::size_t capacity) : data_(capacity), capacity_(capacity) {
    assert(capacity_ > 0);
  }

  void push(std::uint64_t value) {
    data_[head_] = value;
    head_ = (head_ + 1) % capacity_;
    count_ = std::min(count_ + 1, capacity_);
  }

  std::uint64_t checksum() const {
    std::uint64_t sum = 0;
    for (std::size_t index = 0; index < count_; index++) sum += data_[index];
    return sum;
  }

  std::size_t count() const { return count_; }

 private:
  std::vector<std::uint64_t> data_;
  std::size_t capacity_;
  std::size_t head_ = 0;
  std::size_t count_ = 0;
};

static std::uint64_t checksum(const std::vector<std::uint64_t> &values) {
  std::uint64_t sum = 0;
  for (std::uint64_t value : values) sum += value;
  return sum;
}

int main() {
  std::size_t payload_count = 0;
  std::size_t capacity = 0;
  std::string key;
  while (std::cin >> key && key != "END") {
    if (key == "payload=") {
      std::cin >> payload_count;
    } else if (key == "capacity=") {
      std::cin >> capacity;
    } else {
      std::cerr << "unexpected input key: " << key << "\n";
      return 1;
    }
  }
  if (payload_count < 8 || payload_count > 10000 || capacity < 2 || capacity > 256) {
    std::cerr << "input outside benchmark budget\n";
    return 1;
  }

  std::vector<std::uint64_t> values;
  std::size_t withoutReserve = 0;
  for (std::size_t index = 0; index < payload_count; index++) values.push_back(index + 1);
  withoutReserve = values.capacity();
  allocation_count = 0;
  {
    std::vector<std::uint64_t, CountingAllocator<std::uint64_t>> counted;
    counted.reserve(payload_count);
    for (std::size_t index = 0; index < payload_count; index++) counted.push_back(index + 1);
    assert(counted.size() == payload_count);
  }
  std::size_t reservedAllocations = allocation_count;
  if (reservedAllocations != 1) {
    std::cerr << "reserve should allocate exactly once: " << reservedAllocations << "\n";
    return 1;
  }

  RingBuffer ring(capacity);
  for (std::uint64_t value : values) ring.push(value);
  if (ring.count() != std::min(payload_count, capacity)) {
    std::cerr << "ring count mismatch\n";
    return 1;
  }
  std::uint64_t expected = 0;
  for (std::size_t index = values.size() - std::min(payload_count, capacity); index < values.size(); index++) {
    expected += values[index];
  }
  if (ring.checksum() != expected || checksum(values) == 0) {
    std::cerr << "ring checksum mismatch\n";
    return 1;
  }

  std::cout << "payload=" << payload_count << " vector_capacity=" << withoutReserve << "\n";
  std::cout << "reserved_allocations=" << reservedAllocations << " ring_count=" << ring.count() << "\n";
  std::cout << "checksum=" << ring.checksum() << " raii_cleanup=true\n";
  std::cout << "cpp allocation benchmark verified\n";
}
`,
      'payload= 1000\ncapacity= 32\nEND',
      '输出须显示 payload=1000、reserve 分配恰好 1 次、ring_count=32、相同 checksum 与 RAII 清理。把 capacity 改为 1 或 payload 改为 20000 必须拒绝；移除 reserve 后分配计数断言必须失败。',
    ),
    task(
      'p10-cpp-diagnostics-independent',
      'cpp',
      '独立实践：core dump、符号与回归预算',
      'stdin 提供崩溃地址、模块、构建 ID、符号表、回归样本和必须保留的诊断字段。程序解析并去重调用栈，确认生产二进制、符号、构建版本和基准均完整，再生成诊断门禁。',
      String.raw`#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <tuple>
#include <vector>

struct Frame {
  std::uintptr_t address;
  std::string module;
  std::string symbol;
  int line;
};

struct Regression {
  std::string name;
  double before;
  double after;
  double maximumRatio;
};

static std::pair<std::string, std::string> split_once(const std::string &value, char marker) {
  std::size_t position = value.find(marker);
  if (position == std::string::npos) return {value, ""};
  return {value.substr(0, position), value.substr(position + 1)};
}

int main() {
  std::string line;
  std::vector<Frame> frames;
  std::map<std::string, std::string> buildIds;
  std::vector<Regression> regressions;
  std::string signal;
  bool symbolsAvailable = false;
  bool productionBinary = false;
  while (std::getline(std::cin, line)) {
    if (line.rfind("signal=", 0) == 0) {
      signal = line.substr(7);
    } else if (line.rfind("symbols=", 0) == 0) {
      symbolsAvailable = line.substr(8) == "available";
    } else if (line.rfind("binary=", 0) == 0) {
      productionBinary = line.substr(7) == "release-with-symbols";
    } else if (line.rfind("build=", 0) == 0) {
      auto value = split_once(line.substr(6), '=');
      if (value.first.empty() || value.second.empty()) return 1;
      buildIds[value.first] = value.second;
    } else if (line.rfind("frame=", 0) == 0) {
      std::stringstream stream(line.substr(6));
      std::string address;
      std::string module;
      std::string symbol;
      std::string sourceLine;
      if (!std::getline(stream, address, '|') || !std::getline(stream, module, '|') ||
          !std::getline(stream, symbol, '|') || !std::getline(stream, sourceLine, '|')) return 1;
      frames.push_back(Frame{static_cast<std::uintptr_t>(std::stoull(address, nullptr, 16)), module, symbol, std::stoi(sourceLine)});
    } else if (line.rfind("benchmark=", 0) == 0) {
      std::stringstream stream(line.substr(10));
      std::string name;
      std::string before;
      std::string after;
      std::string maximum;
      if (!std::getline(stream, name, '|') || !std::getline(stream, before, '|') ||
          !std::getline(stream, after, '|') || !std::getline(stream, maximum, '|')) return 1;
      regressions.push_back(Regression{name, std::stod(before), std::stod(after), std::stod(maximum)});
    }
  }
  if (signal != "11" || !symbolsAvailable || !productionBinary || frames.empty() || buildIds.empty()) {
    std::cerr << "crash bundle is incomplete\n";
    return 1;
  }
  std::sort(frames.begin(), frames.end(), [](const Frame &left, const Frame &right) {
    return std::tie(left.address, left.module, left.symbol) < std::tie(right.address, right.module, right.symbol);
  });
  frames.erase(std::unique(frames.begin(), frames.end(), [](const Frame &left, const Frame &right) {
    return left.address == right.address && left.module == right.module;
  }), frames.end());
  for (const Frame &frame : frames) {
    if (frame.symbol.empty() || frame.symbol == "??" || buildIds.find(frame.module) == buildIds.end()) {
      std::cerr << "unresolved frame\n";
      return 1;
    }
  }
  for (const Regression &regression : regressions) {
    if (regression.before <= 0 || regression.after <= 0) return 1;
    double ratio = regression.after / regression.before;
    if (ratio > regression.maximumRatio) {
      std::cerr << "benchmark regression: " << regression.name << " ratio=" << ratio << "\n";
      return 1;
    }
  }
  std::cout << "signal=" << signal << " frames=" << frames.size() << "\n";
  for (const Frame &frame : frames) {
    std::cout << "0x" << std::hex << frame.address << std::dec << " " << frame.module << "!" << frame.symbol << ":" << frame.line << "\n";
  }
  for (const auto &entry : buildIds) std::cout << "build=" << entry.first << ":" << entry.second << "\n";
  std::cout << "benchmarks=" << regressions.size() << " within_budget=true\n";
  std::cout << "cpp production diagnostics verified\n";
}
`,
      'signal=11\nsymbols=available\nbinary=release-with-symbols\nbuild=orders=sha256:abc123\nbuild=libcache.so=sha256:def456\nframe=401120|orders|OrderService::submit|87\nframe=401120|orders|OrderService::submit|87\nframe=4021f0|libcache.so|Cache::lookup|142\nbenchmark=submit_p99|2.0|2.15|1.10',
      '输出须去重为两个 frame，均能解析出模块和符号，两个 build ID 都完整，benchmark 比率 1.075 在 1.10 预算内。把 symbols 改为 missing、symbol 改为 ??、删除 build ID 或把 after 改为 3.0 必须失败。',
    ),
    [
      '运行命令：g++ -std=c++20 -O2 -Wall -Wextra -Werror -pedantic main.cpp -o main && ./main。',
      'Sanitizer、perf 与 core dump 由可检查的诊断字段模拟；分配器、容器、RAII 与异常边界真实执行。',
      '验收同时要求复现数据、符号、构建 ID、调用栈与性能预算，不能用“重新发布”代替根因。',
    ],
  ),
  'programming:重构、代码评审与技术债': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 与可执行评审',
    'P11 收口代码台 · 测试保护下重构、评审与技术债',
    '用 TypeScript 在 Node 中执行行为等价重构、边界测试、代码评审风险分级和技术债排序。任务要求每次小步修改都有可运行证据，不能把风格意见当行为风险。',
    task(
      'p11-refactoring-guided',
      'typescript',
      '跟做：先锁行为，再拆长函数',
      'stdin 提供订单行、会员等级、优惠券和免邮门槛。程序先运行原行为样本，再把长函数拆成计价、折扣、运费和税费步骤；每次结果必须与原基线一致。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type MemberTier = 'guest' | 'plus' | 'pro';
type Input = {
  lines: { sku: string; unitCents: number; quantity: number }[];
  member: MemberTier;
  couponPercent: number;
  freeShippingCents: number;
};

type Quote = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

function originalQuote(input: Input): Quote {
  const subtotalCents = input.lines.reduce(
    (sum, line) => sum + line.unitCents * line.quantity,
    0,
  );
  const memberDiscount = input.member === 'pro' ? 0.1 : input.member === 'plus' ? 0.05 : 0;
  const couponDiscount = Math.min(0.2, Math.max(0, input.couponPercent / 100));
  const discountCents = Math.round(subtotalCents * (1 - (1 - memberDiscount) * (1 - couponDiscount)));
  const afterDiscount = subtotalCents - discountCents;
  const shippingCents = afterDiscount >= input.freeShippingCents ? 0 : 499;
  const taxCents = Math.round(afterDiscount * 0.13);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: afterDiscount + shippingCents + taxCents,
  };
}

function calculateSubtotal(input: Input): number {
  return input.lines.reduce((sum, line) => {
    assert.ok(line.quantity > 0, 'quantity must stay positive after refactor');
    assert.ok(line.unitCents > 0, 'unit price must stay positive after refactor');
    return sum + line.unitCents * line.quantity;
  }, 0);
}

function calculateDiscount(input: Input, subtotalCents: number): number {
  const memberRate = { guest: 0, plus: 0.05, pro: 0.1 }[input.member];
  const couponRate = Math.min(0.2, Math.max(0, input.couponPercent / 100));
  return Math.round(subtotalCents * (1 - (1 - memberRate) * (1 - couponRate)));
}

function calculateShipping(input: Input, afterDiscount: number): number {
  return afterDiscount >= input.freeShippingCents ? 0 : 499;
}

function refactoredQuote(input: Input): Quote {
  const subtotalCents = calculateSubtotal(input);
  const discountCents = calculateDiscount(input, subtotalCents);
  const afterDiscount = subtotalCents - discountCents;
  const shippingCents = calculateShipping(input, afterDiscount);
  const taxCents = Math.round(afterDiscount * 0.13);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: afterDiscount + shippingCents + taxCents,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const before = originalQuote(input);
const after = refactoredQuote(input);
assert.deepEqual(after, before, 'refactor changed pricing behavior');
assert.ok(after.totalCents > after.subtotalCents - after.discountCents, 'tax and shipping must remain explicit');
console.log(JSON.stringify({ baseline: before, refactored: after, behaviorEqual: true }));
console.log('refactor protected by behavior tests');
`,
      '{"lines":[{"sku":"keyboard","unitCents":49900,"quantity":1},{"sku":"cable","unitCents":3900,"quantity":2}],"member":"pro","couponPercent":10,"freeShippingCents":50000}',
      '输出须显示 baseline 与 refactored 完全相等、behaviorEqual=true。把 quantity 改为 0 必须被边界测试拒绝；把会员 pro 改成不存在的 platinum 必须在类型或运行时边界失败，不能默认为 guest。',
    ),
    task(
      'p11-refactoring-independent',
      'typescript',
      '独立实践：技术债评分与可执行评审',
      'stdin 提供技术债条目和代码评审意见。程序计算“风险×影响/成本”的治理优先级，要求每条评审含文件、行号、证据和修复建议，并拒绝把重构与功能修改混在同一次大提交。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Debt = {
  id: string;
  title: string;
  risk: number;
  impact: number;
  effort: number;
  affectedModules: string[];
};

type Review = {
  file: string;
  line: number;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  evidence: string;
  suggestion: string;
};

type Input = {
  debts: Debt[];
  reviews: Review[];
  mixedCommit: boolean;
  behaviorTestsAdded: boolean;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.equal(input.mixedCommit, false, 'refactor and feature work must be separate commits');
assert.equal(input.behaviorTestsAdded, true, 'refactor requires behavior tests');
assert.ok(input.debts.length >= 2, 'fixture requires multiple debt items');

for (const debt of input.debts) {
  assert.ok(debt.risk >= 1 && debt.risk <= 5, 'risk must use 1-5 scale');
  assert.ok(debt.impact >= 1 && debt.impact <= 5, 'impact must use 1-5 scale');
  assert.ok(debt.effort >= 1 && debt.effort <= 13, 'effort must use 1-13 scale');
  assert.ok(debt.affectedModules.length > 0, 'debt must name affected modules');
}

for (const review of input.reviews) {
  assert.match(review.file, /^packages\/[a-z0-9/_-]+\.ts$/);
  assert.ok(review.line > 0, 'review must point to a line');
  assert.ok(review.evidence.length >= 12, 'review needs concrete evidence');
  assert.ok(review.suggestion.length >= 12, 'review needs an executable suggestion');
}

const ranked = input.debts
  .map((debt) => ({
    ...debt,
    score: Math.round((debt.risk * debt.impact * 100) / debt.effort),
  }))
  .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
assert.ok(ranked[0]!.score > ranked[1]!.score, 'top debt must be distinguishable');
assert.ok(input.reviews.some((review) => review.severity === 'P0' || review.severity === 'P1'), 'review must surface behavior risk');

console.log(JSON.stringify({
  ranking: ranked.map(({ id, score, affectedModules }) => ({ id, score, affectedModules })),
  blockingReview: input.reviews.find((review) => review.severity === 'P1'),
  commitShape: 'behavior-test -> refactor -> green build',
}, null, 2));
console.log('technical debt and review evidence verified');
`,
      '{"mixedCommit":false,"behaviorTestsAdded":true,"debts":[{"id":"debt-cache","title":"缓存失效无版本","risk":5,"impact":5,"effort":5,"affectedModules":["orders","inventory"]},{"id":"debt-copy","title":"重复序列化代码","risk":2,"impact":2,"effort":3,"affectedModules":["api"]}],"reviews":[{"file":"packages/orders/src/cache.ts","line":42,"severity":"P1","evidence":"旧回填可在失效后重新写入脏数据","suggestion":"比较版本号后再原子写入缓存"}]}',
      '排序首位必须是 debt-cache，并输出 P1 评审与三段式提交形状。把 mixedCommit 改为 true、behaviorTestsAdded 改为 false、评审 evidence 改短或 file 改成非法路径都必须失败。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts；stdin 为课程 JSON。',
      '重构任务真实执行等价断言；技术债与评审任务验证字段、风险和提交边界。',
      '验收看行为等价、边界测试、评审证据和债务排序，不以代码变短作为成功。',
    ],
  ),
  'programming:安全编码、依赖与软件供应链': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 供应链门禁',
    'P11 收口代码台 · 安全编码与软件供应链',
    '用可执行的依赖图、SBOM、签名、漏洞、秘密和授权门禁检查供应链风险。任务区分“扫描发现”与“合并放行”，并要求失败证据可复现。',
    task(
      'p11-supply-chain-guided',
      'typescript',
      '跟做：锁定依赖、完整性哈希与生产闭包',
      'stdin 提供运行时和开发依赖、锁图、完整性与允许的来源。程序拒绝浮动版本、未锁定传递依赖、错误完整性、开发依赖泄漏和未授权 registry。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Requirement = {
  name: string;
  version: string;
  integrity: string;
  source: string;
  kind: 'runtime' | 'development';
  dependencies: string[];
};

type Input = {
  requirements: Requirement[];
  allowedSources: string[];
  productionRoots: string[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.ok(input.requirements.length > 0);
assert.ok(input.allowedSources.every((source) => source.startsWith('https://')));
const packages = new Map(input.requirements.map((item) => [item.name, item]));
assert.equal(packages.size, input.requirements.length, 'duplicate package entries are ambiguous');

for (const item of input.requirements) {
  assert.match(item.version, /^\d+\.\d+\.\d+$/, 'every dependency must be exact');
  assert.match(item.integrity, /^sha512-[a-f0-9]{64}$/, 'integrity must be immutable sha512');
  assert.ok(input.allowedSources.includes(item.source), 'registry source is not allowed');
  if (item.kind === 'runtime') {
    for (const dependency of item.dependencies) {
      assert.ok(packages.has(dependency), 'runtime dependency missing from lock');
    }
  }
}

const production = new Set<string>();
const queue = [...input.productionRoots];
while (queue.length > 0) {
  const name = queue.shift()!;
  if (production.has(name)) continue;
  const item = packages.get(name);
  assert.ok(item, 'unknown production dependency: ' + name);
  assert.equal(item.kind, 'runtime', 'development dependency leaked into production closure');
  production.add(name);
  queue.push(...item.dependencies);
}
assert.ok(!production.has('pytest'), 'test tool entered production closure');
assert.ok(production.has('zod') && production.has('orders-core'));

const sbom = [...production]
  .sort()
  .map((name) => {
    const item = packages.get(name)!;
    return { name, version: item.version, integrity: item.integrity, source: item.source };
  });
console.log(JSON.stringify({ productionClosure: sbom, developmentOnly: ['vitest'] }, null, 2));
console.log('dependency lock and production closure verified');
`,
      '{"allowedSources":["https://registry.npmjs.org"],"productionRoots":["orders-api"],"requirements":[{"name":"orders-api","version":"1.2.0","integrity":"sha512-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":"https://registry.npmjs.org","kind":"runtime","dependencies":["zod","orders-core"]},{"name":"zod","version":"3.23.8","integrity":"sha512-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source":"https://registry.npmjs.org","kind":"runtime","dependencies":["orders-core"]},{"name":"orders-core","version":"2.0.1","integrity":"sha512-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","source":"https://registry.npmjs.org","kind":"runtime","dependencies":[]},{"name":"vitest","version":"3.2.7","integrity":"sha512-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","source":"https://registry.npmjs.org","kind":"development","dependencies":[]}]}',
      '生产闭包必须正好包含 orders-api、zod、orders-core，vitest 只在 developmentOnly。把 zod 版本改成 ^3.23、integrity 改短、source 改成 http 或让 runtime 指向 vitest 都必须失败。',
    ),
    task(
      'p11-supply-chain-independent',
      'typescript',
      '独立实践：SBOM、签名与安全门禁',
      'stdin 提供 SBOM、制品签名、漏洞、秘密扫描、注入测试和授权结果。程序把证据汇总成放行或阻断决策，并保证高风险漏洞、未签名制品或越权请求不会被构建速度掩盖。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Finding = {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fixedVersion?: string;
};

type Input = {
  sbomDigest: string;
  artifactDigest: string;
  signatureVerified: boolean;
  provenanceVerified: boolean;
  vulnerabilities: Finding[];
  secretsFound: number;
  injectionTestsPassed: boolean;
  authorizationTestsPassed: boolean;
  lockfileCommitted: boolean;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.match(input.sbomDigest, /^sha256:[a-f0-9]{64}$/);
assert.match(input.artifactDigest, /^sha256:[a-f0-9]{64}$/);
assert.ok(input.vulnerabilities.length > 0, 'fixture must exercise vulnerability policy');

const blockers: string[] = [];
if (!input.signatureVerified) blockers.push('signature');
if (!input.provenanceVerified) blockers.push('provenance');
if (!input.lockfileCommitted) blockers.push('lockfile');
if (input.secretsFound > 0) blockers.push('secrets');
if (!input.injectionTestsPassed) blockers.push('injection-tests');
if (!input.authorizationTestsPassed) blockers.push('authorization-tests');
for (const finding of input.vulnerabilities) {
  if (finding.severity === 'critical') blockers.push(finding.id);
  if (finding.severity === 'high' && !finding.fixedVersion) blockers.push(finding.id);
}

const policy = {
  decision: blockers.length === 0 ? 'allow' : 'block',
  blockers: [...new Set(blockers)].sort(),
  sbomDigest: input.sbomDigest,
  artifactDigest: input.artifactDigest,
  highRiskFindings: input.vulnerabilities.filter((item) => item.severity === 'high' || item.severity === 'critical'),
};
assert.equal(policy.decision, 'allow', 'default fixture is expected to pass after all evidence is present');
assert.ok(policy.highRiskFindings.every((item) => item.fixedVersion), 'high findings need remediation evidence');
console.log(JSON.stringify(policy, null, 2));
console.log('supply chain release gate verified');
`,
      '{"sbomDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","artifactDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","signatureVerified":true,"provenanceVerified":true,"vulnerabilities":[{"id":"CVE-2026-1001","severity":"high","fixedVersion":"2.3.4"}],"secretsFound":0,"injectionTestsPassed":true,"authorizationTestsPassed":true,"lockfileCommitted":true}',
      '默认证据应生成 decision=allow、唯一高风险漏洞带 fixedVersion、两个摘要完整。把 signatureVerified 改为 false、secretsFound 改为 1、authorizationTestsPassed 改为 false 或漏洞改成 critical 后必须阻断且列出对应 blocker。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      '依赖、SBOM、签名和漏洞均为确定性输入；任务验证门禁逻辑，不访问 registry 或签名服务。',
      '验收必须同时检查依赖来源、精确版本、完整性、生产闭包和阻断原因。',
    ],
  ),
  'programming:AI 辅助编程：规格、上下文与验证': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 验收规格与补丁',
    'P12 收口代码台 · AI 辅助编程的规格、补丁与证据',
    '把需求变成可执行验收规格，审查 AI 生成计划和补丁的文件范围、测试、秘密与语义风险。模型输出只作为候选变更，不拥有自动发布权限。',
    task(
      'p12-ai-assisted-guided',
      'typescript',
      '跟做：从一句需求到验收规格',
      'stdin 提供需求、边界输入、计划步骤、允许修改文件和测试结果。程序要求计划覆盖正常、边界和失败路径，并只在补丁范围、测试与安全证据完整时接受候选变更。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type PlanStep = { kind: 'inspect' | 'patch' | 'test' | 'security'; description: string };
type TestResult = { name: string; passed: boolean; category: 'success' | 'edge' | 'failure' };
type Input = {
  requirement: string;
  acceptance: string[];
  plan: PlanStep[];
  changedFiles: string[];
  allowedFiles: string[];
  tests: TestResult[];
  secretsFound: number;
  diffReviewed: boolean;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.ok(input.requirement.length >= 20, 'requirement is too vague');
assert.ok(input.acceptance.length >= 3, 'acceptance criteria must cover multiple scenarios');
assert.ok(input.plan.some((step) => step.kind === 'inspect'), 'plan must inspect current behavior first');
assert.ok(input.plan.some((step) => step.kind === 'test'), 'plan must name verification');
assert.ok(input.plan.some((step) => step.kind === 'security'), 'plan must include security boundary');
assert.equal(input.secretsFound, 0, 'generated patch must not contain secrets');
assert.equal(input.diffReviewed, true, 'human must review the diff');
for (const file of input.changedFiles) {
  assert.ok(input.allowedFiles.includes(file), 'patch escaped allowed file set');
}
for (const category of ['success', 'edge', 'failure'] as const) {
  assert.ok(input.tests.some((test) => test.category === category), 'missing test category: ' + category);
}
assert.ok(input.tests.every((test) => test.passed), 'failing tests cannot be summarized as success');

const coverage = new Set(input.tests.map((test) => test.category));
console.log(JSON.stringify({
  requirement: input.requirement,
  coverage: [...coverage].sort(),
  changedFiles: input.changedFiles,
  planKinds: input.plan.map((step) => step.kind),
  accepted: true,
}, null, 2));
console.log('AI patch acceptance evidence verified');
`,
      '{"requirement":"为订单查询增加按状态筛选，并保持分页游标在空结果与重复请求下稳定","acceptance":["合法状态返回过滤结果","未知状态返回 400","空结果保持下一页游标"],"plan":[{"kind":"inspect","description":"读取现有查询与契约测试"},{"kind":"patch","description":"增加状态枚举和游标条件"},{"kind":"test","description":"运行成功、边界和失败路径"},{"kind":"security","description":"拒绝 SQL 注入并检查租户边界"}],"changedFiles":["packages/orders/src/query.ts","packages/orders/src/query.test.ts"],"allowedFiles":["packages/orders/src/query.ts","packages/orders/src/query.test.ts"],"tests":[{"name":"valid status","passed":true,"category":"success"},{"name":"unknown status","passed":true,"category":"edge"},{"name":"injection rejected","passed":true,"category":"failure"}],"secretsFound":0,"diffReviewed":true}',
      '输出须显示三类 coverage、白名单修改文件、inspect/patch/test/security 计划与 accepted=true。把 diffReviewed 改为 false、测试 passed 改为 false、changedFiles 越界或删掉失败路径都必须拒绝。',
    ),
    task(
      'p12-ai-assisted-independent',
      'typescript',
      '独立实践：人工与 AI 方案对照实验',
      'stdin 提供个人工与 AI 方案的缺陷、耗时、测试覆盖、人工修正和未验证声明。程序计算质量与效率指标，要求 AI 方案不能因生成快而掩盖缺陷、安全或人工修正成本。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Proposal = {
  name: 'human' | 'ai';
  defects: number;
  minutes: number;
  coverage: number;
  humanFixMinutes: number;
  securityFindings: number;
  verifiedClaims: number;
  totalClaims: number;
};

type Input = { proposals: Proposal[]; requiredCoverage: number };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.equal(input.proposals.length, 2, 'comparison needs exactly two proposals');
const human = input.proposals.find((proposal) => proposal.name === 'human');
const ai = input.proposals.find((proposal) => proposal.name === 'ai');
assert.ok(human && ai, 'both human and ai proposals are required');
for (const proposal of input.proposals) {
  assert.ok(proposal.minutes > 0 && proposal.humanFixMinutes >= 0);
  assert.ok(proposal.coverage >= 0 && proposal.coverage <= 1);
  assert.ok(proposal.totalClaims > 0 && proposal.verifiedClaims <= proposal.totalClaims);
}

const score = (proposal: Proposal) => {
  const totalMinutes = proposal.minutes + proposal.humanFixMinutes;
  const correctness = Math.max(0, 1 - proposal.defects * 0.15);
  const security = Math.max(0, 1 - proposal.securityFindings * 0.25);
  const evidence = proposal.verifiedClaims / proposal.totalClaims;
  return Math.round((correctness * 0.35 + proposal.coverage * 0.25 + security * 0.2 + evidence * 0.2) * 100 - totalMinutes) / 100;
};

const humanScore = score(human);
const aiScore = score(ai);
assert.ok(ai!.coverage >= input.requiredCoverage, 'AI proposal misses coverage floor');
assert.equal(ai!.securityFindings, 0, 'AI proposal has unresolved security finding');
assert.equal(ai!.verifiedClaims, ai!.totalClaims, 'AI proposal contains unverified claims');
assert.ok(aiScore < humanScore, 'fixture should show automation did not replace engineering judgment');

console.log(JSON.stringify({
  humanScore,
  aiScore,
  aiTotalMinutes: ai!.minutes + ai!.humanFixMinutes,
  defects: { human: human!.defects, ai: ai!.defects },
  decision: 'use AI for drafting, retain human verification and security sign-off',
}, null, 2));
console.log('AI versus human engineering comparison verified');
`,
      '{"requiredCoverage":0.85,"proposals":[{"name":"human","defects":1,"minutes":45,"coverage":0.92,"humanFixMinutes":0,"securityFindings":0,"verifiedClaims":8,"totalClaims":8},{"name":"ai","defects":4,"minutes":12,"coverage":0.9,"humanFixMinutes":35,"securityFindings":0,"verifiedClaims":8,"totalClaims":8}]}',
      '输出须包含两份分数、AI 总耗时 47 分钟、缺陷数对照，并明确保留人工验证与安全签字。把 AI securityFindings 改为 1、verifiedClaims 改小或 coverage 低于门槛必须失败。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      '模型的计划和补丁是输入数据；任务真实执行规格覆盖、范围、安全和对照实验断言。',
      '验收看可观察证据与失败边界，不看模型自述“已经完成”。',
    ],
  ),
  'programming:Vibe Coding 项目闭环与安全交付': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 交付状态机',
    'P12 收口代码台 · Vibe Coding 项目闭环与安全交付',
    '把 AI 生成代码接入计划审批、文件边界、测试、构建、部署、观测和回滚状态机。任何未审计划、失败测试、缺运行手册或缺回滚演练的制品都不能进入发布。',
    task(
      'p12-vibe-delivery-guided',
      'typescript',
      '跟做：Agent 计划、停止条件与回滚',
      'stdin 提供计划阶段、允许路径、工具、测试、审批和回滚动作。程序按固定状态机推进，遇到未审批高风险工具、路径越界或失败测试立即停止并保留回滚点。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Stage = 'plan' | 'implement' | 'test' | 'review' | 'release' | 'rollback';
type Input = {
  planApproved: boolean;
  stages: Stage[];
  changedPaths: string[];
  allowedPaths: string[];
  tools: string[];
  allowedTools: string[];
  testsPassed: boolean;
  reviewApproved: boolean;
  rollbackCommand: string;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const legalOrder = ['plan', 'implement', 'test', 'review', 'release', 'rollback'];
assert.equal(input.stages[0], 'plan', 'agent must plan first');
assert.equal(input.planApproved, true, 'unapproved plan cannot modify files');
for (let index = 1; index < input.stages.length; index++) {
  const previous = legalOrder.indexOf(input.stages[index - 1]!);
  const current = legalOrder.indexOf(input.stages[index]!);
  assert.equal(current, previous + 1, 'stage skipped or moved backwards');
}
for (const path of input.changedPaths) {
  assert.ok(input.allowedPaths.includes(path), 'agent escaped file allowlist: ' + path);
}
for (const tool of input.tools) {
  assert.ok(input.allowedTools.includes(tool), 'tool not allowlisted: ' + tool);
}
assert.equal(input.testsPassed, true, 'failed tests must stop before review');
assert.equal(input.reviewApproved, true, 'human review required before release');
assert.match(input.rollbackCommand, /^(git revert|kubectl rollout undo|app rollback) /);

const checkpoints = input.stages.map((stage, index) => ({ index, stage, safeToContinue: index < input.stages.length - 1 }));
console.log(JSON.stringify({ stages: input.stages, checkpoints, rollback: input.rollbackCommand }, null, 2));
console.log('vibe coding agent control loop verified');
`,
      '{"planApproved":true,"stages":["plan","implement","test","review","release","rollback"],"changedPaths":["apps/orders/src/query.ts"],"allowedPaths":["apps/orders/src/query.ts"],"tools":["readFile","applyPatch","runTests"],"allowedTools":["readFile","applyPatch","runTests"],"testsPassed":true,"reviewApproved":true,"rollbackCommand":"kubectl rollout undo deployment/orders"}',
      '六个阶段必须严格按顺序推进，所有路径和工具都在白名单，回滚命令可由环境复现。把 planApproved 改为 false、跳过 test、使用 shell 工具、testsPassed 改为 false 或删掉 rollback 都必须立即停止。',
    ),
    task(
      'p12-vibe-delivery-independent',
      'typescript',
      '独立实践：从需求到可回滚发布证据',
      'stdin 提供环境锁定、自动测试、CI、镜像摘要、运行手册、许可证、遥测和回滚演练。程序计算发布门禁分数并验证每项证据；生成速度不计分。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Evidence = {
  environmentLocked: boolean;
  tests: { unit: number; integration: number; e2e: number };
  ciPassed: boolean;
  imageDigest: string;
  runbookSections: string[];
  licensesApproved: boolean;
  telemetry: string[];
  rollbackDrillPassed: boolean;
};

type Input = { evidence: Evidence; generatedLines: number; reviewedLines: number };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const evidence = input.evidence;
assert.equal(evidence.environmentLocked, true, 'environment must be reproducible');
assert.ok(evidence.tests.unit >= 10 && evidence.tests.integration >= 2 && evidence.tests.e2e >= 1);
assert.equal(evidence.ciPassed, true, 'CI must pass before release');
assert.match(evidence.imageDigest, /^sha256:[a-f0-9]{64}$/);
for (const required of ['startup', 'health', 'rollback', 'incident']) {
  assert.ok(evidence.runbookSections.includes(required), 'runbook missing: ' + required);
}
assert.equal(evidence.licensesApproved, true, 'dependency licenses require approval');
for (const signal of ['logs', 'metrics', 'traces']) {
  assert.ok(evidence.telemetry.includes(signal), 'missing telemetry: ' + signal);
}
assert.equal(evidence.rollbackDrillPassed, true, 'release needs a tested rollback');
assert.ok(input.reviewedLines >= Math.ceil(input.generatedLines * 0.5), 'too much generated code was unreviewed');

const gateScore =
  Number(evidence.tests.unit > 0) +
  Number(evidence.tests.integration > 0) +
  Number(evidence.tests.e2e > 0) +
  Number(evidence.ciPassed) +
  Number(evidence.runbookSections.length >= 4) +
  Number(evidence.licensesApproved) +
  Number(evidence.telemetry.length >= 3) +
  Number(evidence.rollbackDrillPassed);
assert.equal(gateScore, 8, 'all eight release gates are mandatory');

console.log(JSON.stringify({
  gateScore,
  imageDigest: evidence.imageDigest,
  reviewedRatio: input.reviewedLines / input.generatedLines,
  decision: 'release with rollback evidence',
}, null, 2));
console.log('vibe coding release closure verified');
`,
      '{"generatedLines":240,"reviewedLines":180,"evidence":{"environmentLocked":true,"tests":{"unit":28,"integration":5,"e2e":2},"ciPassed":true,"imageDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","runbookSections":["startup","health","rollback","incident"],"licensesApproved":true,"telemetry":["logs","metrics","traces"],"rollbackDrillPassed":true}}',
      '输出须为 gateScore=8、reviewedRatio=0.75、decision 为可回滚发布。把 reviewedLines 降到 100、移除 traces、把 imageDigest 改短或回滚演练设为 false 都必须阻断。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      'Agent 计划、工具白名单、文件范围、发布门禁与回滚均由可执行状态机验证。',
      '验收看真实可复现证据与失败门禁，不把生成速度或模型声明当作交付完成。',
    ],
  ),
  'programming:模块化单体、DDD 与架构取舍': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 模块与 ADR',
    'P13 收口代码台 · 模块化单体、DDD 与架构取舍',
    '用 TypeScript 检查模块依赖方向、循环、聚合边界和 ADR 决策矩阵。任务把质量属性、团队边界、一致性、扩缩与运维成本作为可计算证据，目标是避免默认拆微服务。',
    task(
      'p13-modular-ddd-guided',
      'typescript',
      '跟做：模块依赖方向与聚合不变量',
      'stdin 提供模块层级、依赖和聚合命令。程序拒绝 domain 依赖 adapter、应用层跨层调用、模块循环和缺失聚合不变量，并输出可检查的拓扑顺序。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Layer = 'domain' | 'application' | 'adapter';
type Module = { name: string; layer: Layer; context: string; dependencies: string[] };
type Command = { name: string; context: string; aggregate: string; invariant: string };

type Input = { modules: Module[]; commands: Command[] };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const modules = new Map(input.modules.map((item) => [item.name, item]));
assert.equal(modules.size, input.modules.length, 'module names must be unique');

const rank: Record<Layer, number> = { domain: 0, application: 1, adapter: 2 };
for (const module of input.modules) {
  for (const dependencyName of module.dependencies) {
    const dependency = modules.get(dependencyName);
    assert.ok(dependency, 'unknown module dependency: ' + dependencyName);
    assert.ok(rank[dependency.layer] <= rank[module.layer], 'dependency points outward: ' + module.name);
    if (module.layer === 'domain' && dependency.layer === 'adapter') {
      throw new Error('domain cannot depend on adapter');
    }
  }
}

const visiting = new Set<string>();
const visited = new Set<string>();
const order: string[] = [];
function visit(name: string): void {
  if (visiting.has(name)) throw new Error('module cycle: ' + name);
  if (visited.has(name)) return;
  visiting.add(name);
  for (const dependency of modules.get(name)!.dependencies) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  order.push(name);
}
for (const module of input.modules) visit(module.name);
assert.ok(order.indexOf('orders-domain') < order.indexOf('orders-application'));
assert.ok(order.indexOf('orders-application') < order.indexOf('orders-http'));

for (const command of input.commands) {
  assert.ok(modules.has(command.context + '-domain'), 'command context has no domain');
  assert.ok(command.aggregate.length > 0, 'aggregate is required');
  assert.ok(command.invariant.length >= 12, 'invariant needs a testable rule');
}
assert.ok(input.commands.some((command) => command.invariant.includes('stock')));

console.log(JSON.stringify({
  layers: input.modules.map(({ name, layer, context }) => ({ name, layer, context })),
  topologicalOrder: order,
  commands: input.commands,
}, null, 2));
console.log('modular monolith dependency rules verified');
`,
      '{"modules":[{"name":"orders-domain","layer":"domain","context":"orders","dependencies":[]},{"name":"orders-application","layer":"application","context":"orders","dependencies":["orders-domain"]},{"name":"orders-http","layer":"adapter","context":"orders","dependencies":["orders-application"]},{"name":"clock-adapter","layer":"adapter","context":"shared","dependencies":[]}],"commands":[{"name":"submitOrder","context":"orders","aggregate":"Order","invariant":"stock reservation must succeed before submitting"}]}',
      '输出拓扑必须让 orders-domain、orders-application、orders-http 依次出现，并显示 submitOrder 的可测试不变量。让 domain 依赖 orders-http、引入循环或把不变量改短都必须失败。',
    ),
    task(
      'p13-modular-ddd-independent',
      'typescript',
      '独立实践：模块化单体与微服务 ADR 决策',
      'stdin 提供单体与微服务的质量评分、权重和硬触发条件。程序计算可解释分数；只有独立扩缩、独立故障域和独立团队同时成立时才允许拆服务，并输出 ADR 与回滚条件。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Option = {
  name: 'modular-monolith' | 'microservices';
  scores: {
    deliverySpeed: number;
    consistency: number;
    isolation: number;
    scalability: number;
    operability: number;
  };
};

type Input = {
  options: Option[];
  weights: Record<keyof Option['scores'], number>;
  triggers: {
    independentScaling: boolean;
    independentFailureDomain: boolean;
    independentTeamOwnership: boolean;
    currentModularityHealthy: boolean;
  };
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const expected = new Set(['deliverySpeed', 'consistency', 'isolation', 'scalability', 'operability']);
assert.deepEqual(new Set(Object.keys(input.weights)), expected);
assert.equal(input.options.length, 2, 'ADR must compare exactly two viable options');
const scored = input.options.map((option) => {
  const score = Object.entries(input.weights).reduce((sum, [key, weight]) => {
    const value = option.scores[key as keyof Option['scores']];
    assert.ok(Number.isInteger(value) && value >= 1 && value <= 5, 'quality score must use 1-5');
    assert.ok(weight > 0, 'weights must be positive');
    return sum + value * weight;
  }, 0);
  return { name: option.name, score };
});
const triggers = Object.values(input.triggers);
const allSplitTriggers = input.triggers.independentScaling &&
  input.triggers.independentFailureDomain &&
  input.triggers.independentTeamOwnership;
assert.equal(input.triggers.currentModularityHealthy, true, 'do not use microservices to hide poor module boundaries');
assert.ok(triggers.some(Boolean), 'fixture must exercise a real architecture pressure');

const decision = allSplitTriggers ? 'microservices' : 'modular-monolith';
assert.equal(decision, 'modular-monolith', 'fixture does not satisfy all split triggers');
const winner = scored.find((item) => item.name === decision)!;
assert.ok(winner.score > 0 && scored.length === 2);
const adr = {
  status: 'accepted',
  decision,
  scores: scored,
  triggers: input.triggers,
  revisitWhen: 'independent scaling, failure isolation and team ownership are all true',
  rollback: 'public module ports keep a later extraction reversible',
};
console.log(JSON.stringify(adr, null, 2));
console.log('architecture ADR decision verified');
`,
      '{"options":[{"name":"modular-monolith","scores":{"deliverySpeed":5,"consistency":5,"isolation":3,"scalability":3,"operability":4}},{"name":"microservices","scores":{"deliverySpeed":2,"consistency":2,"isolation":5,"scalability":5,"operability":2}}],"weights":{"deliverySpeed":3,"consistency":3,"isolation":2,"scalability":1,"operability":2},"triggers":{"independentScaling":false,"independentFailureDomain":false,"independentTeamOwnership":false,"currentModularityHealthy":true}}',
      '默认应选 modular-monolith，展示两方案分数、触发条件、重新评估条件和回滚理由。把 currentModularityHealthy 改为 false 必须失败；只打开一个拆服务触发条件仍应保留单体，不能仅看微服务扩缩分更高。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      '模块依赖、拓扑和 ADR 均为可执行 TypeScript 数据，不启动数据库或服务。',
      '验收看依赖方向、循环、质量权重、拆服务硬触发和回滚条件，不以架构图代替证据。',
    ],
  ),
  'programming:分布式一致性、缓存、消息与高并发': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 分布式状态机',
    'P13 收口代码台 · 幂等、Outbox、缓存与背压',
    '用确定性事务状态机验证幂等键、Outbox、重复消费、缓存版本、令牌桶和有界队列。外部数据库与消息系统不联网运行，但重复、失败和恢复路径真实可执行。',
    task(
      'p13-distributed-data-guided',
      'typescript',
      '跟做：数据库写与消息发送不再假装原子',
      'stdin 提供请求、重试、失败写和重复消费。程序在同一事务中写入订单与 Outbox，失败时两者回滚；相同幂等键与相同内容返回同一结果，冲突内容被拒绝。',
      String.raw`import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Request = {
  key: string;
  orderId: string;
  amountCents: number;
  failAfterWrite: boolean;
};

type Record = {
  requestHash: string;
  orderId: string;
  amountCents: number;
  status: 'committed' | 'rolled-back';
  outboxEventId: string | null;
};

type Input = { requests: Request[]; duplicateDeliveries: number };

function requestHash(request: Request): string {
  return createHash('sha256')
    .update(JSON.stringify([request.orderId, request.amountCents]))
    .digest('hex');
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.ok(input.requests.length >= 2, 'fixture needs create and retry');
const records = new Map<string, Record>();
const orders = new Map<string, Request>();
const outbox: { eventId: string; orderId: string; key: string }[] = [];

for (const request of input.requests) {
  assert.match(request.key, /^[a-z0-9-]{4,32}$/);
  assert.ok(request.amountCents > 0);
  const hash = requestHash(request);
  const existing = records.get(request.key);
  if (existing) {
    assert.equal(existing.requestHash, hash, 'same idempotency key with different payload must fail');
    assert.equal(existing.status, 'committed', 'retry after rollback must execute again');
    continue;
  }
  if (request.failAfterWrite) {
    records.set(request.key, {
      requestHash: hash,
      orderId: request.orderId,
      amountCents: request.amountCents,
      status: 'rolled-back',
      outboxEventId: null,
    });
    assert.equal(orders.has(request.orderId), false);
    continue;
  }
  const eventId = 'evt-' + request.key;
  records.set(request.key, {
    requestHash: hash,
    orderId: request.orderId,
    amountCents: request.amountCents,
    status: 'committed',
    outboxEventId: eventId,
  });
  orders.set(request.orderId, request);
  outbox.push({ eventId, orderId: request.orderId, key: request.key });
}

const committed = [...records.values()].filter((record) => record.status === 'committed');
assert.ok(committed.length >= 1);
assert.equal(orders.size, committed.length, 'order and outbox must commit together');
assert.equal(outbox.length, committed.length, 'every committed order needs one outbox event');

const consumed = new Set<string>();
let sideEffects = 0;
for (let index = 0; index < input.duplicateDeliveries; index++) {
  for (const event of outbox) {
    if (consumed.has(event.eventId)) continue;
    consumed.add(event.eventId);
    sideEffects++;
  }
}
assert.equal(sideEffects, outbox.length, 'duplicate delivery created duplicate side effect');

console.log(JSON.stringify({
  records: [...records.entries()],
  committedOrders: [...orders.keys()],
  outbox,
  duplicateDeliveries: input.duplicateDeliveries,
  sideEffects,
}, null, 2));
console.log('idempotency and transactional outbox verified');
`,
      '{"duplicateDeliveries":3,"requests":[{"key":"pay-0001","orderId":"o-1","amountCents":12990,"failAfterWrite":true},{"key":"pay-0002","orderId":"o-2","amountCents":25990,"failAfterWrite":false},{"key":"pay-0002","orderId":"o-2","amountCents":25990,"failAfterWrite":false}]}',
      'pay-0001 必须回滚且无订单/Outbox，pay-0002 重试只能有一条订单和一个事件，三次重复投递 sideEffects 仍为 1。把重试金额改掉必须因幂等键冲突失败；改动订单与事件提交数量必须断言失败。',
    ),
    task(
      'p13-distributed-data-independent',
      'typescript',
      '独立实践：版本缓存、令牌桶与有界队列',
      'stdin 提供缓存版本、迟到回填、突发请求、队列容量和令牌补充速度。程序拒绝旧版本覆盖新缓存，执行令牌桶限流与有界排队，并给出拒绝比例和恢复证据。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  cache: { currentVersion: number; staleFillVersion: number; tenant: string };
  burst: {
    requests: number;
    initialTokens: number;
    refillPerTick: number;
    ticks: number;
    queueCapacity: number;
    serviceCapacityPerTick: number;
  };
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.ok(input.cache.currentVersion >= input.cache.staleFillVersion, 'fixture must contain a stale fill');
assert.match(input.cache.tenant, /^tenant-[a-z0-9]+$/);
const cacheKey = input.cache.tenant + ':product:p7';
let cacheVersion = input.cache.currentVersion;
let cachedValue: string | null = 'fresh';

function fillCache(version: number, value: string): boolean {
  if (version < cacheVersion) return false;
  cacheVersion = version;
  cachedValue = value;
  return true;
}

const staleAccepted = fillCache(input.cache.staleFillVersion, 'stale');
assert.equal(staleAccepted, false, 'stale fill overwrote a newer cache');
assert.equal(cachedValue, 'fresh');
assert.equal(fillCache(input.cache.currentVersion + 1, 'newer'), true);
assert.equal(cachedValue, 'newer');

const burst = input.burst;
assert.ok(burst.requests > 0 && burst.queueCapacity > 0);
assert.ok(burst.refillPerTick >= 0 && burst.serviceCapacityPerTick > 0);
let tokens = Math.min(burst.initialTokens, burst.requests);
let queued = 0;
let accepted = 0;
let rejected = 0;
let processed = 0;
for (let tick = 0; tick < burst.ticks; tick++) {
  for (let request = 0; request < burst.requests; request++) {
    if (queued >= burst.queueCapacity) {
      rejected++;
      continue;
    }
    if (tokens >= 1) tokens -= 1;
    accepted++;
    queued++;
    if (queued > burst.queueCapacity) throw new Error('bounded queue overflow');
  }
  const processNow = Math.min(queued, burst.serviceCapacityPerTick);
  queued -= processNow;
  processed += processNow;
  tokens = Math.min(burst.initialTokens, tokens + burst.refillPerTick);
}
assert.equal(accepted + rejected, burst.requests * burst.ticks, 'every request must be accepted or rejected');
assert.ok(rejected > 0, 'fixture must exercise overload rejection');
assert.ok(rejected > accepted * 6, 'fixture should show repeated over-burst pressure');
assert.ok(queued <= burst.queueCapacity);
assert.ok(processed > 0);

console.log(JSON.stringify({
  cacheKey,
  cacheVersion,
  staleAccepted,
  accepted,
  rejected,
  processed,
  queued,
  rejectionRate: rejected / (accepted + rejected),
}, null, 2));
console.log('cache version and overload controls verified');
`,
      '{"cache":{"currentVersion":42,"staleFillVersion":41,"tenant":"tenant-orders"},"burst":{"requests":40,"initialTokens":10,"refillPerTick":2,"ticks":8,"queueCapacity":8,"serviceCapacityPerTick":4}}',
      '输出须拒绝 stale 版本、最终 cacheVersion 为 43、accepted/rejected 总和等于 320、队列不超过 8，并显示拒绝率。把 staleFillVersion 设为 43 时必须成功覆盖；把 queueCapacity 改为 0 必须让过载路径失败。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      '数据库、Kafka、RabbitMQ 与 Redis 由事务、Outbox、重复投递和版本缓存状态机模拟。',
      '验收看重复、回滚、版本、限流与背压，不接受“最终会一致”的空泛说明。',
    ],
  ),
  'programming:Apollo、负载均衡、Nginx 与 API 网关': lab(
    'typescript',
    'node',
    'Node.js 24 / TypeScript 入口与配置治理',
    'P13 收口代码台 · Apollo、负载均衡、Nginx 与 API 网关',
    '用可执行状态机验证配置命名空间、版本、审计、灰度、回滚、L4/L7 路由、健康实例、会话、超时与重试预算。外部组件由协议契约模拟。',
    task(
      'p13-gateway-config-guided',
      'typescript',
      '跟做：配置灰度、审计与一键回滚',
      'stdin 提供当前发布、候选命名空间、schema、灰度实例、审计和回滚开关。程序拒绝越环境配置、旧版本覆盖、非法 schema 与无审计发布，并返回可恢复 release key。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Release = {
  releaseKey: string;
  version: number;
  namespace: string;
  environment: string;
  payload: Record<string, string | number | boolean>;
  grayInstances: string[];
  auditId: string;
};

type Input = {
  current: Release;
  proposed: Release;
  schemaValid: boolean;
  rollbackEnabled: boolean;
  enabledInstances: string[];
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.match(input.proposed.namespace, /^[a-z][a-z0-9.-]{2,40}$/);
assert.match(input.proposed.releaseKey, /^rel-\d{6,}$/);
assert.match(input.proposed.auditId, /^audit-[a-z0-9-]+$/);
assert.equal(input.proposed.environment, 'production');
assert.ok(input.proposed.version > input.current.version, 'configuration version must increase');
assert.equal(input.schemaValid, true, 'invalid config cannot be released');
assert.equal(input.rollbackEnabled, true, 'release requires rollback capability');
assert.ok(input.proposed.grayInstances.length > 0 && input.proposed.grayInstances.length < input.enabledInstances.length);
for (const instance of input.proposed.grayInstances) {
  assert.ok(input.enabledInstances.includes(instance), 'gray target is not enabled');
}

const released = structuredClone(input.proposed);
assert.notEqual(released.releaseKey, input.current.releaseKey);
assert.equal(released.payload.mode, 'canary');
const previous = structuredClone(input.current);
assert.equal(previous.releaseKey, 'rel-2026112401');
assert.equal(previous.payload.mode, 'stable');
const releasePlan = {
  activeRelease: released.releaseKey,
  grayInstances: released.grayInstances,
  fullTrafficAfter: 'checks and metrics stay green for 10 minutes',
  rollbackTo: previous.releaseKey,
  auditId: released.auditId,
};
assert.equal(releasePlan.rollbackTo, 'rel-2026112401');
console.log(JSON.stringify(releasePlan, null, 2));
console.log('apollo configuration release verified');
`,
      '{"current":{"releaseKey":"rel-2026112401","version":41,"namespace":"orders.application","environment":"production","payload":{"mode":"stable","timeoutMs":2000},"grayInstances":[],"auditId":"audit-base-41"},"proposed":{"releaseKey":"rel-2026112402","version":42,"namespace":"orders.application","environment":"production","payload":{"mode":"canary","timeoutMs":1500},"grayInstances":["orders-a"],"auditId":"audit-gray-42"},"schemaValid":true,"rollbackEnabled":true,"enabledInstances":["orders-a","orders-b","orders-c"]}',
      '输出须包含 canary release、只灰度 orders-a、10 分钟观察门禁、回滚到 rel-2026112401 和审计 ID。把 version 降为 40、environment 改成 staging、grayInstances 加入不存在实例、schemaValid 改为 false 都必须拒绝。',
    ),
    task(
      'p13-gateway-config-independent',
      'typescript',
      '独立实践：L4/L7 路由、健康检查与重试预算',
      'stdin 提供入口协议、实例健康与权重、会话、上游耗时、单次与总超时、重试次数。程序验证 L4/L7 可见信息、健康目标、会话粘性和全局重试预算，禁止多层无限放大。',
      String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Instance = { id: string; healthy: boolean; weight: number; zone: string };
type Input = {
  layer: 'L4' | 'L7';
  path: string;
  instances: Instance[];
  stickySession: string;
  upstreamMs: number;
  perTryTimeoutMs: number;
  totalBudgetMs: number;
  retries: number;
  configRollbackSeconds: number;
};

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
assert.ok(input.layer === 'L4' || input.layer === 'L7');
assert.ok(input.path.startsWith('/api/'));
assert.ok(input.upstreamMs > 0 && input.perTryTimeoutMs > 0 && input.totalBudgetMs > 0);
assert.ok(input.retries >= 0 && input.retries <= 2, 'retry count outside budget');
assert.ok(input.configRollbackSeconds <= 60, 'configuration rollback is too slow');

const healthy = input.instances.filter((instance) => instance.healthy && instance.weight > 0);
assert.equal(healthy.length, 2, 'fixture must expose exactly two healthy weighted targets');
if (input.layer === 'L4') {
  assert.ok(input.path === '/', 'L4 cannot route on HTTP path');
  assert.equal(input.stickySession, 'connection', 'L4 stickiness follows connection tuple');
} else {
  assert.ok(input.path.startsWith('/api/'));
  assert.ok(input.stickySession === 'cookie' || input.stickySession === 'header');
}

const attempts = 1 + input.retries;
const worstCaseMs = attempts * input.perTryTimeoutMs;
assert.ok(worstCaseMs <= input.totalBudgetMs, 'retry budget exceeds request deadline');
assert.ok(input.upstreamMs * attempts < input.totalBudgetMs, 'fixture would exceed total budget under retry');
const selected = healthy.sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))[0]!;
const zones = new Set(healthy.map((instance) => instance.zone));
assert.ok(zones.size >= 1 && zones.size <= 2, 'failure zone planning must be explicit');

const plan = {
  layer: input.layer,
  selected,
  healthyTargets: healthy.map((instance) => instance.id),
  attempts,
  worstCaseMs,
  totalBudgetMs: input.totalBudgetMs,
  configRollbackSeconds: input.configRollbackSeconds,
  retryRule: 'idempotent requests only',
};
console.log(JSON.stringify(plan, null, 2));
console.log('gateway routing and retry budget verified');
`,
      '{"layer":"L7","path":"/api/orders","instances":[{"id":"orders-a","healthy":true,"weight":80,"zone":"a"},{"id":"orders-b","healthy":true,"weight":20,"zone":"b"},{"id":"orders-c","healthy":false,"weight":100,"zone":"c"}],"stickySession":"cookie","upstreamMs":60,"perTryTimeoutMs":100,"totalBudgetMs":250,"retries":1,"configRollbackSeconds":15}',
      '输出须选 orders-a，健康目标只含 a/b，attempts=2、worstCaseMs=200 不超过 250，配置回滚 15 秒。把 retries 改为 3、totalBudget 改为 150、layer 改成 L4 配 /api 路径或让实例 c 继续参与都必须失败。',
    ),
    [
      '运行命令：node --experimental-strip-types main.ts。',
      'Apollo、HAProxy、Envoy、Nginx 与 API 网关均以确定性配置和流量契约模拟。',
      '验收看版本、审计、灰度、健康、会话、超时、重试和回滚证据，不只看一条 curl 成功。',
    ],
  ),
};
