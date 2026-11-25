import type { LearningV2CodeLab } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java / JDK 17+',
  docsUrl: 'https://docs.oracle.com/en/java/javase/17/',
  installSteps: [
    '应用内实验使用 JDK 17 或更高版本，主文件固定为 Main.java。',
    '所有任务只依赖 JDK 标准库，不下载 Spring、JUnit 或第三方基准库。',
    '先原样运行观察基线证据，再按 brief 修改代码并重新运行。',
  ],
  languages: ['java'],
} as const;

/**
 * Java 收尾批次代码实验室。
 *
 * 课程键与 java-foundations.ts、java-advanced.ts 中的真实课程名逐字一致。
 * Spring 相关任务使用 JDK 反射和显式小型容器模拟可观察契约，不伪装成
 * 在真实 Spring 运行时执行。
 */
export const LEARNING_CODE_LABS_JAVA_FINAL: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:构造器、this 与对象初始化': {
    title: 'J6 代码台 01 · 构造器不变量与安全发布',
    description:
      '先观察静态初始化、实例初始化和构造器链的真实顺序，再把“构造期间向注册表泄漏 this”重构成完整构造后的显式发布。',
    ...javaRuntime,
    practice: {
      id: 'java-final-constructor-order-guided',
      title: '跟做：让初始化顺序和构造器链可见',
      brief:
        '输入两行批次：批次号、数量、单价分。运行后核对 static、instance、constructor 的先后顺序，以及两个构造器都汇聚到最终校验入口。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  static final List<String> TRACE = new ArrayList<>();

  static final class Batch {
    static {
      TRACE.add("static");
    }

    private final String id;
    private final int quantity;
    private final long unitCents;

    {
      TRACE.add("instance");
    }

    Batch(String id) {
      this(id, 1, 100);
    }

    Batch(String id, int quantity, long unitCents) {
      if (id == null || id.isBlank()) {
        throw new IllegalArgumentException("ID_REQUIRED");
      }
      if (quantity <= 0 || unitCents < 0) {
        throw new IllegalArgumentException("INVALID_LINE");
      }
      this.id = id;
      this.quantity = quantity;
      this.unitCents = unitCents;
      TRACE.add("constructor");
    }

    long totalCents() {
      return Math.multiplyExact(quantity, unitCents);
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    long grandTotal = 0;
    int lineCount = 0;

    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] fields = line.split("\\\\s+");
      Batch batch = new Batch(
          fields[0],
          Integer.parseInt(fields[1]),
          Long.parseLong(fields[2]));
      grandTotal = Math.addExact(grandTotal, batch.totalCents());
      lineCount++;
    }

    System.out.println("trace=" + TRACE);
    System.out.println("lines=" + lineCount);
    System.out.println("total=" + grandTotal);

    if (lineCount != 2 || grandTotal != 2200) {
      throw new AssertionError("constructor input was not aggregated");
    }
    if (!TRACE.subList(0, 3).equals(List.of("static", "instance", "constructor"))) {
      throw new AssertionError("unexpected initialization order");
    }
  }
}
`,
      },
      stdin: `B-1 2 500
B-2 1 1200
`,
      checkpoint:
        '进程需输出 trace=[static, instance, constructor, instance, constructor]、lines=2、total=2200。静态块只出现一次；若在构造器里直接发布 this，必须改成工厂完成构造后再注册。',
    },
    apply: {
      id: 'java-final-constructor-safe-publish-apply',
      title: '独立实践：构造完成后再发布监听器',
      brief:
        '当前程序并排演示危险和安全两种注册。输入监听器编号，先观察危险构造器注册时字段仍为 null，再让 SafeListener 的 createAndRegister 在完整构造后才写入 Registry。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  static final class Registry {
    private final Map<String, Object> values = new LinkedHashMap<>();
    private final Map<String, String> visibleIds = new LinkedHashMap<>();

    void addUnsafe(String key, Object value, String currentId) {
      values.put(key, value);
      visibleIds.put(key, currentId);
    }

    void addAfterConstruction(String key, String id, Object value) {
      values.put(key, value);
      visibleIds.put(key, id);
    }
  }

  static final class UnsafeListener {
    private String id;

    UnsafeListener(String id, Registry registry) {
      registry.addUnsafe("unsafe", this, this.id);
      this.id = id;
    }
  }

  static final class SafeListener {
    private final String id;

    private SafeListener(String id) {
      if (id == null || id.isBlank()) {
        throw new IllegalArgumentException("ID_REQUIRED");
      }
      this.id = id;
    }

    static SafeListener createAndRegister(String id, Registry registry) {
      SafeListener listener = new SafeListener(id);
      registry.addAfterConstruction("safe", listener.id, listener);
      return listener;
    }
  }

  public static void main(String[] args) {
    String id = new Scanner(System.in).nextLine().trim();
    Registry registry = new Registry();
    new UnsafeListener(id, registry);
    SafeListener safe = SafeListener.createAndRegister(id, registry);

    System.out.println("unsafeVisible=" + registry.visibleIds.get("unsafe"));
    System.out.println("safeVisible=" + registry.visibleIds.get("safe"));
    System.out.println("sameInstance=" + (registry.values.get("safe") == safe));

    if (registry.visibleIds.get("unsafe") != null) {
      throw new AssertionError("unsafe publication should expose null");
    }
    if (!id.equals(registry.visibleIds.get("safe"))
        || registry.values.get("safe") != safe) {
      throw new AssertionError("safe publication did not preserve a complete object");
    }
  }
}
`,
      },
      stdin: `listener-42
`,
      checkpoint:
        '输入 listener-42 后需输出 unsafeVisible=null、safeVisible=listener-42、sameInstance=true。不能通过调整赋值顺序掩盖问题；完成版应删除构造器中的外部注册，只保留工厂发布。',
    },
  },

  'programming:封装、访问控制与不变量': {
    title: 'J6 代码台 02 · 状态不变量与防御性复制',
    description:
      '用账户扣款验证失败不改变余额，再用只读快照和业务方法保护购物车，避免调用方绕过对象规则。',
    ...javaRuntime,
    practice: {
      id: 'java-final-encapsulation-account-guided',
      title: '跟做：扣款失败必须保持原余额',
      brief:
        '输入初始余额、一次成功扣款和一次超额扣款。账户只暴露查询与 withdraw，不允许调用方直接改字段；超额时在写入前失败。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.Scanner;

public class Main {
  static final class Account {
    private long balanceCents;

    Account(long openingCents) {
      if (openingCents < 0) {
        throw new IllegalArgumentException("OPENING");
      }
      balanceCents = openingCents;
    }

    void withdraw(long amountCents) {
      if (amountCents <= 0) {
        throw new IllegalArgumentException("AMOUNT");
      }
      if (amountCents > balanceCents) {
        throw new IllegalStateException("INSUFFICIENT");
      }
      balanceCents -= amountCents;
    }

    long balanceCents() {
      return balanceCents;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    long opening = input.nextLong();
    long validWithdrawal = input.nextLong();
    long rejectedWithdrawal = input.nextLong();

    Account account = new Account(opening);
    account.withdraw(validWithdrawal);
    long afterValid = account.balanceCents();

    String rejection = "none";
    try {
      account.withdraw(rejectedWithdrawal);
    } catch (IllegalStateException error) {
      rejection = error.getMessage();
    }

    long afterFailure = account.balanceCents();
    System.out.println("afterValid=" + afterValid);
    System.out.println("rejection=" + rejection);
    System.out.println("afterFailure=" + afterFailure);
    System.out.println("unchanged=" + (afterValid == afterFailure));

    if (afterValid != 7000 || !"INSUFFICIENT".equals(rejection) || afterFailure != 7000) {
      throw new AssertionError("failed withdrawal changed account state");
    }
  }
}
`,
      },
      stdin: `10000 3000 8000
`,
      checkpoint:
        '预期 afterValid=7000、rejection=INSUFFICIENT、afterFailure=7000、unchanged=true。边界实验再加 7000，应成功归零；任何负余额都说明校验顺序错误。',
    },
    apply: {
      id: 'java-final-encapsulation-cart-apply',
      title: '独立实践：用只读快照保护购物车',
      brief:
        '输入商品行“SKU:数量:单价分”，用逗号连接，再输入折扣百分比。先计算合法总价，再尝试 150% 折扣；失败后商品列表、总价和版本都必须完全不变。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  record Line(String sku, int quantity, long unitCents) {
    Line {
      if (sku == null || sku.isBlank() || quantity <= 0 || unitCents < 0) {
        throw new IllegalArgumentException("INVALID_LINE");
      }
    }
  }

  record Snapshot(List<Line> lines, long totalCents, long version) {
    Snapshot {
      lines = List.copyOf(lines);
    }
  }

  static final class Cart {
    private final List<Line> lines = new ArrayList<>();
    private long version;

    void add(Line line) {
      lines.add(line);
      version++;
    }

    void applyDiscountPercent(int percent) {
      if (percent < 0 || percent > 100) {
        throw new IllegalArgumentException("DISCOUNT_RANGE");
      }
      version++;
    }

    long totalCents() {
      return lines.stream()
          .mapToLong(line -> Math.multiplyExact(line.quantity(), line.unitCents()))
          .sum();
    }

    Snapshot snapshot() {
      return new Snapshot(lines, totalCents(), version);
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String itemText = input.nextLine().trim();
    int requestedDiscount = Integer.parseInt(input.nextLine().trim());
    Cart cart = new Cart();

    for (String item : itemText.split(",")) {
      String[] fields = item.trim().split(":");
      cart.add(new Line(
          fields[0],
          Integer.parseInt(fields[1]),
          Long.parseLong(fields[2])));
    }

    Snapshot before = cart.snapshot();
    String rejection = "none";
    try {
      cart.applyDiscountPercent(requestedDiscount);
    } catch (IllegalArgumentException error) {
      rejection = error.getMessage();
    }
    Snapshot after = cart.snapshot();

    System.out.println("before=" + before);
    System.out.println("rejection=" + rejection);
    System.out.println("sameVersion=" + (before.version() == after.version()));
    System.out.println("sameTotal=" + (before.totalCents() == after.totalCents()));

    if (!"DISCOUNT_RANGE".equals(rejection)
        || before.version() != after.version()
        || before.totalCents() != after.totalCents()
        || before.lines().size() != 2) {
      throw new AssertionError("failed business operation leaked a partial change");
    }

    boolean immutable = false;
    try {
      after.lines().add(new Line("HACK", 1, 0));
    } catch (UnsupportedOperationException error) {
      immutable = true;
    }
    if (!immutable) {
      throw new AssertionError("snapshot leaked mutable collection");
    }
  }
}
`,
      },
      stdin: `PEN:2:100,NOTE:1:250
150
`,
      checkpoint:
        '折扣 150 必须输出 rejection=DISCOUNT_RANGE、sameVersion=true、sameTotal=true，且 after 列表只有 2 行。随后 add(HACK) 应抛 UnsupportedOperationException；改成 10 时版本才增加并正常结束。',
    },
  },

  'programming:接口、抽象类与依赖倒置': {
    title: 'J6 代码台 03 · 端口替换与模板流程',
    description:
      '先让应用服务依赖最小读接口，再比较抽象类模板方法如何固定支付流程、把差异留给具体实现。',
    ...javaRuntime,
    practice: {
      id: 'java-final-interface-ports-guided',
      title: '跟做：查询服务只依赖读取端口',
      brief:
        '输入订单号、区域和金额分。InMemoryOrderRepository 同时实现读写端口；查询服务只看到 OrderReader，支付服务再通过写端口保存状态。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Scanner;

public class Main {
  record Order(String id, String region, long totalCents, boolean priority) {
    Order markPriority() {
      return new Order(id, region, totalCents, true);
    }
  }

  interface OrderReader {
    Optional<Order> findById(String id);
  }

  interface OrderWriter {
    void save(Order order);
  }

  static final class InMemoryOrderRepository implements OrderReader, OrderWriter {
    private final Map<String, Order> rows = new HashMap<>();

    @Override
    public Optional<Order> findById(String id) {
      return Optional.ofNullable(rows.get(id));
    }

    @Override
    public void save(Order order) {
      rows.put(order.id(), order);
    }
  }

  static final class OrderQueryService {
    private final OrderReader reader;

    OrderQueryService(OrderReader reader) {
      this.reader = reader;
    }

    Order require(String id) {
      return reader.findById(id)
          .orElseThrow(() -> new IllegalArgumentException("ORDER_NOT_FOUND"));
    }
  }

  static final class PriorityOrderService {
    private final OrderReader reader;
    private final OrderWriter writer;

    PriorityOrderService(OrderReader reader, OrderWriter writer) {
      this.reader = reader;
      this.writer = writer;
    }

    Order promote(String id) {
      Order order = reader.findById(id)
          .orElseThrow(() -> new IllegalArgumentException("ORDER_NOT_FOUND"));
      Order changed = order.markPriority();
      writer.save(changed);
      return changed;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String id = input.next();
    String region = input.next();
    long total = input.nextLong();

    InMemoryOrderRepository repository = new InMemoryOrderRepository();
    repository.save(new Order(id, region, total, false));

    OrderQueryService query = new OrderQueryService(repository);
    PriorityOrderService priority = new PriorityOrderService(repository, repository);

    Order before = query.require(id);
    Order after = priority.promote(id);
    Order reloaded = query.require(id);

    System.out.println("beforePriority=" + before.priority());
    System.out.println("afterPriority=" + after.priority());
    System.out.println("reloaded=" + reloaded);

    if (before.priority()
        || !after.priority()
        || !reloaded.equals(after)
        || !region.equals(reloaded.region())) {
      throw new AssertionError("port implementation did not preserve the order contract");
    }
  }
}
`,
      },
      stdin: `O-1001 APAC 4300
`,
      checkpoint:
        '预期 beforePriority=false、afterPriority=true，reloaded 为 O-1001/APAC/4300/true。查询服务源码不应出现 save；若把整个仓储类直接注入，说明接口没有按调用方最小能力拆分。',
    },
    apply: {
      id: 'java-final-interface-payment-template-apply',
      title: '独立实践：抽象类固定支付流程',
      brief:
        '输入支付方式和金额分。PaymentFlow 的 final process 固定校验、授权、捕获和收据顺序；子类只实现 authorize 与 capture，不能跳过模板步骤。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  record Instruction(String method, long amountCents) {}
  record Receipt(String id, String method, long amountCents) {}

  static final List<String> AUDIT = new ArrayList<>();

  abstract static class PaymentFlow {
    final Receipt process(Instruction instruction) {
      validate(instruction);
      String authorization = authorize(instruction);
      String captureId = capture(instruction, authorization);
      Receipt receipt = new Receipt(captureId, instruction.method(), instruction.amountCents());
      AUDIT.add("receipt:" + receipt.id());
      return receipt;
    }

    private void validate(Instruction instruction) {
      if (!"CARD".equals(instruction.method())
          || instruction.amountCents() <= 0) {
        throw new IllegalArgumentException("UNSUPPORTED_PAYMENT");
      }
      AUDIT.add("validate");
    }

    protected abstract String authorize(Instruction instruction);

    protected abstract String capture(Instruction instruction, String authorization);
  }

  static final class CardPayment extends PaymentFlow {
    @Override
    protected String authorize(Instruction instruction) {
      String token = "AUTH-" + instruction.amountCents();
      AUDIT.add("authorize:" + token);
      return token;
    }

    @Override
    protected String capture(Instruction instruction, String authorization) {
      String id = "PAY-" + authorization.substring(5);
      AUDIT.add("capture:" + id);
      return id;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Instruction instruction = new Instruction(input.next(), input.nextLong());
    Receipt receipt = new CardPayment().process(instruction);

    System.out.println("audit=" + AUDIT);
    System.out.println("receipt=" + receipt);

    if (!receipt.equals(new Receipt("PAY-12000", "CARD", 12000))) {
      throw new AssertionError("template returned wrong receipt");
    }
    if (!AUDIT.equals(List.of(
        "validate",
        "authorize:AUTH-12000",
        "capture:PAY-12000",
        "receipt:PAY-12000"))) {
      throw new AssertionError("template order changed");
    }

    String rejection = "none";
    try {
      new CardPayment().process(new Instruction("CASH", 100));
    } catch (IllegalArgumentException error) {
      rejection = error.getMessage();
    }
    if (!"UNSUPPORTED_PAYMENT".equals(rejection)) {
      throw new AssertionError("invalid method bypassed validation");
    }
    System.out.println("invalid=" + rejection);
  }
}
`,
      },
      stdin: `CARD 12000
`,
      checkpoint:
        'audit 必须严格按 validate→authorize→capture→receipt 排列，收据为 PAY-12000。最后 invalid=UNSUPPORTED_PAYMENT，且失败请求没有新增 authorize 或 capture 记录。',
    },
  },

  'programming:TreeMap 排序与比较器': {
    title: 'J6 代码台 04 · 有序索引与比较器契约',
    description:
      '用 TreeMap 做时间区间索引，再用优先级、截止时间、编号三级比较器排出可解释任务顺序。',
    ...javaRuntime,
    practice: {
      id: 'java-final-treemap-interval-guided',
      title: '跟做：按开始时间查找覆盖区间',
      brief:
        '输入三行区间“开始 结束 编号”，再输入两个查询时刻。TreeMap 以开始时间为键，floorEntry 找到不晚于查询点的最近区间，再检查结束边界。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.Map;
import java.util.Scanner;
import java.util.TreeMap;

public class Main {
  record Interval(long startInclusive, long endExclusive, String id) {}

  static final class IntervalIndex {
    private final TreeMap<Long, Interval> byStart =
        new TreeMap<>();

    void add(Interval interval) {
      if (interval.startInclusive() >= interval.endExclusive()) {
        throw new IllegalArgumentException("EMPTY_INTERVAL");
      }
      Interval replaced = byStart.put(interval.startInclusive(), interval);
      if (replaced != null) {
        throw new IllegalArgumentException("DUPLICATE_START");
      }
    }

    String find(long instant) {
      Map.Entry<Long, Interval> candidate = byStart.floorEntry(instant);
      if (candidate == null) {
        return "none";
      }
      Interval interval = candidate.getValue();
      return instant < interval.endExclusive() ? interval.id() : "none";
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    IntervalIndex index = new IntervalIndex();
    for (int i = 0; i < 3; i++) {
      index.add(new Interval(input.nextLong(), input.nextLong(), input.next()));
    }
    long firstQuery = input.nextLong();
    long secondQuery = input.nextLong();

    String first = index.find(firstQuery);
    String second = index.find(secondQuery);
    System.out.println("first=" + first);
    System.out.println("second=" + second);
    System.out.println("startOrder=" + index.byStart.navigableKeySet());

    if (!"B".equals(first) || !"C".equals(second)) {
      throw new AssertionError("floorEntry interval lookup failed");
    }
    if (!index.byStart.navigableKeySet().toString().equals("[10, 15, 30]")) {
      throw new AssertionError("TreeMap ordering changed");
    }
  }
}
`,
      },
      stdin: `10 20 A
15 25 B
30 40 C
17
35
`,
      checkpoint:
        '预期 first=B、second=C、startOrder=[10, 15, 30]。查询 17 同时落在 A 和 B 中，floorEntry 选择最近起点 15，因此返回 B；查询 14 才返回 A，查询 25 返回 none。',
    },
    apply: {
      id: 'java-final-treemap-priority-apply',
      title: '独立实践：可解释的三级任务排序',
      brief:
        '输入四行任务“优先级 截止时刻 编号”，优先级数字越小越先。比较器依次比较优先级、截止时刻、编号，使用 TreeMap 保持唯一任务并提供最早截止查询。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Scanner;
import java.util.Set;
import java.util.TreeMap;

public class Main {
  record Job(int priority, long deadline, String id) {}

  static final Comparator<Job> JOB_ORDER =
      Comparator.comparingInt(Job::priority)
          .thenComparingLong(Job::deadline)
          .thenComparing(Job::id);

  static final class Planner {
    private final TreeMap<Job, String> queue = new TreeMap<>(JOB_ORDER);

    void add(Job job, String action) {
      if (queue.putIfAbsent(job, action) != null) {
        throw new IllegalArgumentException("DUPLICATE_JOB");
      }
    }

    Set<Job> ordered() {
      return queue.keySet();
    }

    Job next() {
      return queue.firstKey();
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Planner planner = new Planner();
    List<Job> inserted = new ArrayList<>();
    for (int i = 0; i < 4; i++) {
      Job job = new Job(input.nextInt(), input.nextLong(), input.next());
      inserted.add(job);
      planner.add(job, "run:" + job.id());
    }

    List<String> ids = planner.ordered().stream().map(Job::id).toList();
    System.out.println("inserted=" + inserted);
    System.out.println("ordered=" + ids);
    System.out.println("next=" + planner.next());

    if (!ids.equals(List.of("A", "C", "B", "D"))) {
      throw new AssertionError("comparator did not produce stable total ordering");
    }
    if (!planner.next().equals(new Job(1, 100, "A"))) {
      throw new AssertionError("firstKey is not the earliest executable job");
    }
  }
}
`,
      },
      stdin: `2 100 D
1 200 B
1 100 C
1 100 A
`,
      checkpoint:
        'ordered 必须为 [A, C, B, D]：A/C 同时刻时按编号，B 在相同优先级下截止更晚，D 优先级更低。请再测试比较器忽略编号而返回 0，导致 TreeMap 误判重复键的情况。',
    },
  },

  'programming:Set 唯一性与 equals/hashCode': {
    title: 'J6 代码台 05 · 业务主键与集合身份',
    description:
      '先复现可变键修改后查不到自己的哈希陷阱，再用不可变业务键完成保序去重。',
    ...javaRuntime,
    practice: {
      id: 'java-final-set-mutable-key-guided',
      title: '跟做：可变键如何从 HashSet 中消失',
      brief:
        '程序把一个可变 SKU 键放入 HashSet，再修改决定 hashCode 的字段。随后用同一引用 contains；结果仍可能为 false，因为对象已落在错误桶中。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.HashSet;
        import java.util.Objects;
        import java.util.Scanner;
        import java.util.Set;

public class Main {
  static final class MutableKey {
    private String sku;

    MutableKey(String sku) {
      this.sku = sku;
    }

    void rename(String sku) {
      this.sku = sku;
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof MutableKey key && Objects.equals(sku, key.sku);
    }

    @Override
    public int hashCode() {
      return Objects.hash(sku);
    }
  }

  record StableKey(String sku) {
    StableKey {
      if (sku == null || sku.isBlank()) {
        throw new IllegalArgumentException("SKU_REQUIRED");
      }
    }
  }

  public static void main(String[] args) {
    String firstSku = new Scanner(System.in).nextLine().trim();
    MutableKey mutable = new MutableKey(firstSku);
    Set<MutableKey> mutableSet = new HashSet<>();
    mutableSet.add(mutable);
    mutable.rename(firstSku + "-renamed");
    boolean mutableLookup = mutableSet.contains(mutable);

    Set<StableKey> stableSet = new HashSet<>();
    stableSet.add(new StableKey(firstSku));
    boolean stableLookup = stableSet.contains(new StableKey(firstSku));

    System.out.println("mutableLookup=" + mutableLookup);
    System.out.println("stableLookup=" + stableLookup);
    System.out.println("mutableSize=" + mutableSet.size());

    if (mutableLookup || !stableLookup || mutableSet.size() != 1) {
      throw new AssertionError("set identity experiment produced unexpected evidence");
    }
  }
}
`,
      },
      stdin: `SKU-1001
`,
      checkpoint:
        '预期 mutableLookup=false、stableLookup=true、mutableSize=1。解释必须同时涉及 equals/hashCode 和桶位置；修复方式是键不可变、先移除再修改，或改用稳定代理键。',
    },
    apply: {
      id: 'java-final-set-business-dedup-apply',
      title: '独立实践：保序去重与重复证据',
      brief:
        '输入事件行“订单号 版本 金额分”。业务主键由订单号和版本组成；重复事件只保留第一次出现。LinkedHashSet 要去重，LinkedHashMap 要保留金额和首次输入顺序。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
  record EventKey(String orderId, int version) {
    EventKey {
      if (orderId == null || orderId.isBlank() || version <= 0) {
        throw new IllegalArgumentException("INVALID_EVENT");
      }
    }
  }

  record Event(EventKey key, long amountCents) {}

  static final class EventStore {
    private final Set<EventKey> seen = new LinkedHashSet<>();
    private final Map<EventKey, Event> events = new LinkedHashMap<>();
    private final List<EventKey> duplicates = new ArrayList<>();

    boolean append(Event event) {
      if (!seen.add(event.key())) {
        duplicates.add(event.key());
        return false;
      }
      events.put(event.key(), event);
      return true;
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    EventStore store = new EventStore();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] fields = line.split("\\\\s+");
      store.append(new Event(
          new EventKey(fields[0], Integer.parseInt(fields[1])),
          Long.parseLong(fields[2])));
    }

    List<String> retained = store.events.values().stream()
        .map(event -> event.key().orderId() + "-" + event.key().version() + ":" + event.amountCents())
        .toList();
    System.out.println("retained=" + retained);
    System.out.println("duplicates=" + store.duplicates);
    System.out.println("size=" + store.events.size());

    if (!retained.equals(List.of(
        "O-1-1:1000",
        "O-2-1:2000",
        "O-1-2:1500"))) {
      throw new AssertionError("deduplication changed first-seen ordering");
    }
    if (store.duplicates.size() != 2 || store.events.size() != 3) {
      throw new AssertionError("duplicate evidence is incomplete");
    }
  }
}
`,
      },
      stdin: `O-1 1 1000
O-2 1 2000
O-1 1 9999
O-1 2 1500
O-2 1 8888
`,
      checkpoint:
        'retained 必须是 O-1-1:1000、O-2-1:2000、O-1-2:1500；金额 9999 和 8888 不能覆盖首条，duplicates 记录 2 个键，size=3。',
    },
  },

  'programming:Queue、Deque 与 PriorityQueue': {
    title: 'J6 代码台 06 · 队列顺序与双端窗口',
    description:
      '用 PriorityQueue 验证稳定优先级，用 ArrayDeque 实现有界最近记录和紧急任务插入。',
    ...javaRuntime,
    practice: {
      id: 'java-final-queue-priority-guided',
      title: '跟做：优先级相同时保持提交顺序',
      brief:
        '输入四行任务“优先级 到达序号 编号”。PriorityQueue 的比较器使用优先级后按序号打破平局；逐个 poll 验证不是全排序集合，而是堆顶始终最小。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Scanner;

public class Main {
  record Task(int priority, long sequence, String id) {}

  static final Comparator<Task> TASK_ORDER =
      Comparator.comparingInt(Task::priority)
          .thenComparingLong(Task::sequence);

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    PriorityQueue<Task> queue =
        new PriorityQueue<>(4, TASK_ORDER);
    for (int i = 0; i < 4; i++) {
      queue.add(new Task(input.nextInt(), input.nextLong(), input.next()));
    }

    List<String> drained = new ArrayList<>();
    while (!queue.isEmpty()) {
      drained.add(queue.poll().id());
    }
    System.out.println("drained=" + drained);
    System.out.println("empty=" + queue.isEmpty());

    if (!drained.equals(List.of("A", "B", "D", "C"))) {
      throw new AssertionError("priority or FIFO tie-break is wrong");
    }
    if (!queue.isEmpty()) {
      throw new AssertionError("queue was not drained");
    }
  }
}
`,
      },
      stdin: `1 20 B
1 10 A
3 40 C
2 30 D
`,
      checkpoint:
        '预期 drained=[A, B, D, C]、empty=true。A 与 B 优先级相同，但 A 的 sequence=10 更早；把初始容量设置为 0 应抛异常，不能依赖堆内部偶然顺序。',
    },
    apply: {
      id: 'java-final-deque-bounded-window-apply',
      title: '独立实践：有界最近事件与紧急插队',
      brief:
        '输入最多五条事件“编号 紧急标记”，最近窗口容量固定为 3。普通事件进入尾部，紧急事件进入头部；超过容量时分别从相反端淘汰，并输出最终顺序。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Scanner;

public class Main {
  static final class RecentEvents {
    private final int capacity;
    private final Deque<String> values = new ArrayDeque<>();
    private final Deque<String> evicted = new ArrayDeque<>();

    RecentEvents(int capacity) {
      if (capacity <= 0) {
        throw new IllegalArgumentException("CAPACITY");
      }
      this.capacity = capacity;
    }

    void add(String id, boolean urgent) {
      if (urgent) {
        values.addFirst(id);
        trimLast();
      } else {
        values.addLast(id);
        trimFirst();
      }
    }

    private void trimFirst() {
      while (values.size() > capacity) {
        evicted.addLast(values.removeFirst());
      }
    }

    private void trimLast() {
      while (values.size() > capacity) {
        evicted.addLast(values.removeLast());
      }
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    RecentEvents events = new RecentEvents(3);
    int count = 0;
    while (input.hasNextLine() && count < 5) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] fields = line.split("\\\\s+");
      events.add(fields[0], Boolean.parseBoolean(fields[1]));
      count++;
    }

    System.out.println("recent=" + events.values);
    System.out.println("evicted=" + events.evicted);

    if (!events.values.toString().equals("[U-5, U-4, E-1]")) {
      throw new AssertionError("deque order or capacity is wrong");
    }
    if (!events.evicted.toString().equals("[E-3, E-2]")) {
      throw new AssertionError("eviction evidence is incomplete");
    }
  }
}
`,
      },
      stdin: `E-1 false
E-2 false
E-3 false
U-4 true
U-5 true
`,
      checkpoint:
        '预期 recent=[U-5, U-4, E-1]、evicted=[E-3, E-2]。紧急项从头部进入，因此从尾部淘汰；再改容量为 1、处理空队列和非法容量，确认两端策略一致。',
    },
  },

  'programming:Stream 与 Collectors 的性能边界': {
    title: 'J6 代码台 07 · 惰性短路与聚合边界',
    description:
      '用 IntStream 证明中间操作只在终端操作时执行，再用 teeing 一次遍历得到订单数量与总金额。',
    ...javaRuntime,
    practice: {
      id: 'java-final-stream-lazy-guided',
      title: '跟做：短路后没有访问后续元素',
      brief:
        '输入四个整数，寻找第一个大于 5 的偶数。filter 与 peek 都是惰性中间操作，findFirst 短路后，后面的元素不应进入流水线。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.stream.IntStream;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Integer> values = new ArrayList<>();
    for (int i = 0; i < 4; i++) {
      values.add(input.nextInt());
    }

    List<Integer> visited = new ArrayList<>();
    int first = values.stream()
        .mapToInt(Integer::intValue)
        .filter(value -> {
          visited.add(value);
          return value > 5 && value % 2 == 0;
        })
        .findFirst()
        .orElse(-1);

    System.out.println("first=" + first);
    System.out.println("visited=" + visited);
    System.out.println("visitedCount=" + visited.size());

    if (first != 8 || !visited.equals(List.of(3, 8))) {
      throw new AssertionError("Stream did not short-circuit after first match");
    }
    long evenCount = IntStream.rangeClosed(1, 10)
        .filter(value -> value % 2 == 0)
        .count();
    if (evenCount != 5) {
      throw new AssertionError("terminal count result is wrong");
    }
  }
}
`,
      },
      stdin: `3 8 10 7
`,
      checkpoint:
        '预期 first=8、visited=[3, 8]、visitedCount=2；10 和 7 不能被 peek/filter 访问。若把 findFirst 改为 count，visited 应变成 4，说明终端操作决定实际工作量。',
    },
    apply: {
      id: 'java-final-stream-teeing-apply',
      title: '独立实践：一次遍历汇总订单',
      brief:
        '输入订单行“区域 状态 金额分”。过滤 PAID 后用 Collectors.teeing 同时计算数量与总金额，区域使用 TreeMap 保持字典序，最后输出每个区域的汇总。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.Map;
        import java.util.Scanner;
        import java.util.TreeMap;
        import java.util.stream.Collectors;

public class Main {
  record Order(String region, String status, long amountCents) {}
  record Summary(long count, long totalCents) {}

  public static void main(String[] args) {
    TreeMap<String, Summary> summaries = new Scanner(System.in)
        .tokens()
        .map(token -> token.split(":"))
        .map(fields -> new Order(
            fields[0],
            fields[1],
            Long.parseLong(fields[2])))
        .filter(order -> "PAID".equals(order.status()))
        .collect(Collectors.groupingBy(
            Order::region,
            TreeMap::new,
            Collectors.teeing(
                Collectors.counting(),
                Collectors.summingLong(Order::amountCents),
                Summary::new)));

    System.out.println("summaries=" + summaries);
    if (!summaries.equals(Map.of(
        "APAC", new Summary(2, 7300),
        "EMEA", new Summary(1, 2500)))) {
      throw new AssertionError("teeing aggregation produced wrong result");
    }
  }
}
`,
      },
      stdin: `APAC:PAID:4300
APAC:REFUNDED:900
EMEA:PAID:2500
APAC:PAID:3000
`,
      checkpoint:
        'summaries 必须为 {APAC=Summary[count=2, totalCents=7300], EMEA=Summary[count=1, totalCents=2500]}，输出顺序按 TreeMap 区域升序。退款订单不能计入金额或数量。',
    },
  },

  'programming:集合选型与基准测试': {
    title: 'J6 代码台 08 · 基准方法与小规模索引',
    description:
      '先建立有预热和重复样本的测量记录，再按读写模式组合 ArrayList 与 HashMap，而不是凭集合名称猜性能。',
    ...javaRuntime,
    practice: {
      id: 'java-final-collections-benchmark-guided',
      title: '跟做：预热、重复样本与结果校验',
      brief:
        '输入规模、预热轮数和测量轮数。程序执行同一整数累加任务，记录每轮纳秒样本并排序输出中位数；assert 只验证工作量，不把某次时间当唯一正确结果。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.Arrays;
import java.util.Scanner;

public class Main {
  static long work(int size) {
    long total = 0;
    for (int i = 1; i <= size; i++) {
      total += i;
    }
    return total;
  }

  static long sample(int size) {
    long started = System.nanoTime();
    long result = work(size);
    if (result <= 0) {
      throw new AssertionError("blackhole");
    }
    return System.nanoTime() - started;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int size = input.nextInt();
    int warmups = input.nextInt();
    int measurements = input.nextInt();
    for (int i = 0; i < warmups; i++) {
      sample(size);
    }

    long[] samples = new long[measurements];
    for (int i = 0; i < measurements; i++) {
      samples[i] = sample(size);
    }
    long[] sorted = samples.clone();
    Arrays.sort(sorted);
    long median = sorted[sorted.length / 2];
    long expected = (long) size * (size + 1L) / 2L;

    System.out.println("expected=" + expected);
    System.out.println("samples=" + Arrays.toString(samples));
    System.out.println("medianNanoseconds=" + median);
    System.out.println("measurements=" + measurements);

    if (expected != 500500 || measurements != 5 || median <= 0) {
      throw new AssertionError("benchmark harness did not collect real samples");
    }
  }
}
`,
      },
      stdin: `1000 20 5
`,
      checkpoint:
        '预期 expected=500500、measurements=5、medianNanoseconds>0，并打印五个测量样本。纳秒值不会固定；提交结论时至少给中位数、分位数和运行环境，不能用一次冷启动样本比较集合。',
    },
    apply: {
      id: 'java-final-collections-index-apply',
      title: '独立实践：保序列表加按键索引',
      brief:
        '输入事件行“编号 状态”。Catalog 用 HashMap 提供 O(1) 查找，用 ArrayList 保持展示顺序；状态更新必须原地替换列表元素并同步映射，不能产生重复行。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class Main {
  record Event(String id, String status) {}

  static final class EventCatalog {
    private final List<Event> ordered = new ArrayList<>();
    private final Map<String, Integer> positions = new HashMap<>();

    void upsert(Event event) {
      Integer position = positions.get(event.id());
      if (position == null) {
        positions.put(event.id(), ordered.size());
        ordered.add(event);
      } else {
        ordered.set(position, event);
      }
    }

    Event find(String id) {
      Integer position = positions.get(id);
      return position == null ? null : ordered.get(position);
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    EventCatalog catalog = new EventCatalog();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] fields = line.split("\\\\s+");
      catalog.upsert(new Event(fields[0], fields[1]));
    }

    System.out.println("ordered=" + catalog.ordered);
    System.out.println("E-2=" + catalog.find("E-2"));
    System.out.println("size=" + catalog.ordered.size());

    if (!catalog.ordered.toString().equals(
        "[Event[id=E-1, status=CLOSED], Event[id=E-2, status=OPEN], Event[id=E-3, status=OPEN]]")) {
      throw new AssertionError("catalog lost insertion order or duplicated an update");
    }
    if (!"CLOSED".equals(catalog.find("E-1").status())
        || catalog.ordered.size() != 3) {
      throw new AssertionError("index and list are inconsistent");
    }
  }
}
`,
      },
      stdin: `E-1 OPEN
E-2 OPEN
E-1 CLOSED
E-3 OPEN
E-2 OPEN
`,
      checkpoint:
        '预期 ordered 保留 E-1、E-2、E-3 三个位置，E-1 已变为 CLOSED，size=3，find(E-2) 为 OPEN。若只使用 ArrayList 做按键查找，规模增长后要说明线性扫描成本。',
    },
  },

  'programming:JIT、内联与去优化': {
    title: 'J6 代码台 09 · 预热证据与类型假设失效',
    description:
      '先从真实 HotSpot 进程读取编译环境并跑热身，再模拟单态调用点遇到新类型时的 profile 失效，明确区分运行证据与编译器内核模拟。',
    ...javaRuntime,
    practice: {
      id: 'java-final-jit-warmup-guided',
      title: '跟做：观察编译环境与预热工作量',
      brief:
        '程序从 java.lang.management 读取 JIT 名称与累计编译时间，并对同一计算方法先预热、再测量。代码只断言结果和样本存在，不把毫秒数伪装成跨机器固定值。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.management.CompilationMXBean;
import java.lang.management.ManagementFactory;
import java.util.Scanner;

public class Main {
  static long checksum(int limit) {
    long value = 17;
    for (int i = 1; i <= limit; i++) {
      value = (value * 31 + i) & 0x7fff_ffffL;
    }
    return value;
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    int rounds = input.nextInt();
    int limit = input.nextInt();

    long warmupResult = 0;
    for (int i = 0; i < rounds; i++) {
      warmupResult ^= checksum(limit);
    }

    long started = System.nanoTime();
    long measuredResult = checksum(limit);
    long elapsed = System.nanoTime() - started;

    CompilationMXBean compiler = ManagementFactory.getCompilationMXBean();
    String compilerName = compiler == null ? "disabled" : compiler.getName();
    long compileTime = compiler == null ? -1 : compiler.getTotalCompilationTime();
    int availableProcessors = Runtime.getRuntime().availableProcessors();

    System.out.println("compiler=" + compilerName);
    System.out.println("compileTimeMs=" + compileTime);
    System.out.println("processors=" + availableProcessors);
    System.out.println("warmupResult=" + warmupResult);
    System.out.println("measuredResult=" + measuredResult);
    System.out.println("elapsedNanoseconds=" + elapsed);

    if (warmupResult < 0 || measuredResult < 0 || elapsed <= 0) {
      throw new AssertionError("warmup workload did not produce evidence");
    }
    if (compiler != null && !compiler.isCompilationTimeMonitoringSupported()) {
      System.out.println("compileTimeSupported=false");
    }
  }
}
`,
      },
      stdin: `2000 500
`,
      checkpoint:
        '必须输出 compiler 名称、compileTimeMs、processors、两个 checksum 结果和正的 elapsedNanoseconds。若比较优化收益，先固定 JVM、CPU、数据和预热规模；单次纳秒值不能作为稳定结论。',
    },
    apply: {
      id: 'java-final-jit-deopt-profile-apply',
      title: '独立实践：单态调用点的类型假设失效',
      brief:
        '输入三行“类型 半径”。调用点首先只看到 Circle，随后出现 Square。程序用 ProfileGuard 模拟 JIT 的单态假设与去优化计数；这是语义模型，不声称直接读取 HotSpot 内部优化日志。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
  sealed interface Shape permits Circle, Square {}
  record Circle(int radius) implements Shape {}
  record Square(int side) implements Shape {}

  static final class ProfileGuard {
    private Class<?> assumedType;
    private int deoptimizations;

    int execute(Shape shape) {
      if (assumedType == null) {
        assumedType = shape.getClass();
      } else if (shape.getClass() != assumedType) {
        deoptimizations++;
        assumedType = null;
      }
      return area(shape);
    }

    Class<?> assumedType() {
      return assumedType;
    }

    int deoptimizations() {
      return deoptimizations;
    }
  }

  static int area(Shape shape) {
    if (shape instanceof Circle circle) {
      return circle.radius() * circle.radius();
    }
    if (shape instanceof Square square) {
      return square.side() * square.side();
    }
    throw new IllegalArgumentException("unknown shape");
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    List<Shape> calls = new ArrayList<>();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] fields = line.split("\\\\s+");
      int size = Integer.parseInt(fields[1]);
      calls.add("Circle".equals(fields[0])
          ? new Circle(size)
          : new Square(size));
    }

    ProfileGuard guard = new ProfileGuard();
    calls.forEach(guard::execute);
    System.out.println("calls=" + calls.size());
    System.out.println("assumedType=" + guard.assumedType());
    System.out.println("deoptimizations=" + guard.deoptimizations());

    if (calls.size() != 3 || guard.deoptimizations() != 1) {
      throw new AssertionError("profile assumption model did not invalidate once");
    }
    if (guard.assumedType() != Circle.class) {
      throw new AssertionError("repolling must establish a new monomorphic assumption");
    }
  }
}
`,
      },
      stdin: `Circle 3
Square 2
Circle 4
`,
      checkpoint:
        '预期 calls=3、deoptimizations=1、assumedType=class Main$Circle。第二次 Circle 调用使模型重新收集类型并建立新单态假设；真实 JVM 是否内联、何时去优化仍须用 PrintCompilation、JFR 和 JMH 验证。',
    },
  },

  'programming:依赖注入与 Bean 生命周期': {
    title: 'J6 代码台 10 · 构造器注入与生命周期',
    description:
      '用纯 JDK 实现最小 Bean 容器，验证构造器依赖、单例/原型作用域、初始化与销毁顺序，并识别循环依赖。',
    ...javaRuntime,
    practice: {
      id: 'java-final-di-constructor-cycle-guided',
      title: '跟做：按依赖拓扑创建 Bean 并报告环',
      brief:
        '第一行选择要获取的 Bean，后续每行“名称:依赖1,依赖2”。容器通过构造器工厂创建依赖，禁止字段回填；若存在环，必须打印稳定路径而不是栈溢出。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class Main {
  record Definition(List<String> dependencies, Object value) {}

  static final class MiniContainer {
    private final Map<String, Definition> definitions = new LinkedHashMap<>();
    private final Map<String, Object> singletons = new HashMap<>();
    private final Deque<String> path = new ArrayDeque<>();

    void register(String name, List<String> dependencies, Object value) {
      definitions.put(name, new Definition(List.copyOf(dependencies), value));
    }

    Object get(String name) {
      return resolve(name);
    }

    private Object resolve(String name) {
      if (singletons.containsKey(name)) {
        return singletons.get(name);
      }
      if (path.contains(name)) {
        List<String> nodes = new ArrayList<>(path);
        nodes.add(name);
        throw new IllegalStateException("CYCLE:" + String.join(">", nodes));
      }
      Definition definition = definitions.get(name);
      if (definition == null) {
        throw new IllegalArgumentException("MISSING_BEAN:" + name);
      }
      path.addLast(name);
      try {
        for (String dependency : definition.dependencies()) {
          resolve(dependency);
        }
        Object instance = definition.value();
        singletons.put(name, instance);
        return instance;
      } finally {
        path.removeLast();
      }
    }
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String requested = input.nextLine().trim();
    MiniContainer container = new MiniContainer();
    while (input.hasNextLine()) {
      String line = input.nextLine().trim();
      if (line.isEmpty()) {
        continue;
      }
      String[] declaration = line.split(":", 2);
      String[] parts = declaration.length == 1 || declaration[1].isBlank()
          ? new String[0]
          : declaration[1].split(",");
      List<String> dependencies = new ArrayList<>();
      for (String part : parts) {
        dependencies.add(part.trim());
      }
      container.register(
          declaration[0],
          dependencies,
          declaration[0] + "-instance");
    }

    Object first = container.get(requested);
    Object second = container.get(requested);
    System.out.println("instance=" + first);
    System.out.println("singleton=" + (first == second));

    MiniContainer cyclic = new MiniContainer();
    cyclic.register("a", List.of("b"), "a-instance");
    cyclic.register("b", List.of("a"), "b-instance");
    String cycle = "none";
    try {
      cyclic.get("a");
    } catch (IllegalStateException error) {
      cycle = error.getMessage();
    }
    System.out.println("cycle=" + cycle);

    if (!"repo-instance".equals(first)
        || first != second
        || !cycle.startsWith("CYCLE:a>b>a")) {
      throw new AssertionError("container violated injection or cycle contract");
    }
  }
}
`,
      },
      stdin: `repo
repo:
service:repo
`,
      checkpoint:
        '预期 instance=repo-instance、singleton=true，并输出 CYCLE:a>b>a。完成版应使用构造器参数注入真实依赖；若依赖在实例化后通过 setter 补填，就无法保证对象创建后立即合法。',
    },
    apply: {
      id: 'java-final-di-lifecycle-scope-apply',
      title: '独立实践：单例与原型生命周期',
      brief:
        '容器定义 orderRepository 为 singleton、requestContext 为 prototype。两者都经过 beforeInit、init、afterInit；关闭容器时按创建逆序销毁。输出两个上下文的身份差异和完整回调顺序。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.List;

public class Main {
  interface Managed {
    default void beforeInit() {}
    default void init() {}
    default void afterInit() {}
    default void destroy() {}
  }

  static final class Instance implements Managed {
    private final String name;
    private final int sequence;
    private final List<String> log;

    Instance(String name, int sequence, List<String> log) {
      this.name = name;
      this.sequence = sequence;
      this.log = log;
    }

    @Override
    public void beforeInit() {
      log.add(sequence + ":" + name + ":before");
    }

    @Override
    public void init() {
      log.add(sequence + ":" + name + ":init");
    }

    @Override
    public void afterInit() {
      log.add(sequence + ":" + name + ":after");
    }

    @Override
    public void destroy() {
      log.add(sequence + ":" + name + ":destroy");
    }
  }

  static final class LifecycleContainer {
    private int sequence;
    private final List<String> log = new ArrayList<>();
    private final List<Instance> destroyOrder = new ArrayList<>();
    private Instance singleton;

    Instance singleton() {
      if (singleton == null) {
        singleton = create("repository", true);
      }
      return singleton;
    }

    Instance prototype() {
      return create("request", true);
    }

    private Instance create(String name, boolean trackDestroy) {
      Instance instance = new Instance(name, ++sequence, log);
      instance.beforeInit();
      instance.init();
      instance.afterInit();
      if (trackDestroy) {
        destroyOrder.add(instance);
      }
      return instance;
    }

    void close() {
      for (int i = destroyOrder.size() - 1; i >= 0; i--) {
        destroyOrder.get(i).destroy();
      }
    }
  }

  public static void main(String[] args) {
    LifecycleContainer container = new LifecycleContainer();
    Instance repo1 = container.singleton();
    Instance repo2 = container.singleton();
    Instance request1 = container.prototype();
    Instance request2 = container.prototype();
    container.close();

    System.out.println("singletonSame=" + (repo1 == repo2));
    System.out.println("prototypeSame=" + (request1 == request2));
    System.out.println("lifecycle=" + container.log);

    if (repo1 != repo2 || request1 == request2) {
      throw new AssertionError("scope semantics are wrong");
    }
    if (!container.log.equals(List.of(
        "1:repository:before",
        "1:repository:init",
        "1:repository:after",
        "2:request:before",
        "2:request:init",
        "2:request:after",
        "3:request:before",
        "3:request:init",
        "3:request:after",
        "3:request:destroy",
        "2:request:destroy",
        "1:repository:destroy"))) {
      throw new AssertionError("lifecycle or destroy order is wrong");
    }
  }
}
`,
      },
      stdin: `ignored
`,
      checkpoint:
        '预期 singletonSame=true、prototypeSame=false，单例只初始化一次，两个原型各初始化一次；销毁顺序为 3、2、1。Spring 契约模拟边界是回调顺序与作用域语义，不代表真实容器实现细节。',
    },
  },

  'programming:Spring Boot 自动配置机制': {
    title: 'J6 代码台 11 · 条件装配与覆盖原因',
    description:
      '用 JDK 注解和反射实现最小自动配置评估器，观察属性条件、缺失 Bean 条件、用户覆盖和条件报告。',
    ...javaRuntime,
    practice: {
      id: 'java-final-autoconfig-conditions-guided',
      title: '跟做：条件满足才装配审计 Bean',
      brief:
        '输入 feature.audit 与 feature.audit.verbose 两个布尔值。审计自动配置只有在开关为 true 且容器尚无 auditSink 时生效；随后输出最终 Bean 来源和每条条件原因。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.annotation.ElementType;
        import java.lang.annotation.Retention;
        import java.lang.annotation.RetentionPolicy;
        import java.lang.annotation.Target;
        import java.util.ArrayList;
        import java.util.HashMap;
        import java.util.List;
        import java.util.Map;
        import java.util.Scanner;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE)
  @interface ConditionalOnProperty {
    String name();
    String havingValue();
  }

  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.TYPE)
  @interface ConditionalOnMissingBean {
    String type();
  }

  @ConditionalOnProperty(name = "feature.audit", havingValue = "true")
  @ConditionalOnMissingBean(type = "auditSink")
  static final class AuditAutoConfiguration {
    static String bean() {
      return "audit-auto-sink";
    }
  }

  record ConditionReport(String configuration, boolean matched, List<String> reasons) {
    ConditionReport {
      reasons = List.copyOf(reasons);
    }
  }

  static ConditionReport evaluate(
      Map<String, String> properties,
      Map<String, String> existingBeans) {
    Class<?> config = AuditAutoConfiguration.class;
    List<String> reasons = new ArrayList<>();
    boolean propertyMatches = false;
    boolean beanMissing = false;

    ConditionalOnProperty property =
        config.getAnnotation(ConditionalOnProperty.class);
    if (property != null) {
      String actual = properties.get(property.name());
      propertyMatches = property.havingValue().equals(actual);
      reasons.add(property.name() + "=" + actual + ",expected="
          + property.havingValue() + ",match=" + propertyMatches);
    }

    ConditionalOnMissingBean missing =
        config.getAnnotation(ConditionalOnMissingBean.class);
    if (missing != null) {
      beanMissing = !existingBeans.containsKey(missing.type());
      reasons.add("missingBean:" + missing.type() + "=" + beanMissing);
    }

    return new ConditionReport(
        config.getSimpleName(),
        propertyMatches && beanMissing,
        reasons);
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    String feature = input.next();
    String verbose = input.next();
    Map<String, String> properties = new HashMap<>();
    properties.put("feature.audit", feature);
    properties.put("feature.audit.verbose", verbose);
    Map<String, String> beans = new HashMap<>();

    ConditionReport report = evaluate(properties, beans);
    if (report.matched()) {
      beans.put("auditSink", AuditAutoConfiguration.bean());
    }

    System.out.println("report=" + report);
    System.out.println("auditSink=" + beans.get("auditSink"));

    if (!report.matched() || !"audit-auto-sink".equals(beans.get("auditSink"))) {
      throw new AssertionError("conditional auto-configuration did not apply");
    }
  }
}
`,
      },
      stdin: `true true
`,
      checkpoint:
        '预期 report.matched=true，reasons 同时包含 feature.audit=true 和 missingBean:auditSink=true，最终 auditSink=audit-auto-sink。把 feature.audit 改为 false 时应跳过装配并保留报告原因。',
    },
    apply: {
      id: 'java-final-autoconfig-override-apply',
      title: '独立实践：用户 Bean 覆盖自动配置',
      brief:
        '扩展条件报告：输入自动开关和 custom.auditSink 标记。若用户已注册自定义审计实现，自动配置必须跳过；最终报告要说明“属性匹配但 Bean 已存在”。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class Main {
  record ConditionOutcome(boolean matched, String reason) {}

  static final class AutoConfiguredAudit {
    static final String NAME = "autoAudit";
  }

  static ConditionOutcome evaluate(
      boolean enabled,
      boolean customSinkPresent,
      Map<String, String> beans) {
    if (!enabled) {
      return new ConditionOutcome(false, "SKIPPED_PROPERTY_FALSE");
    }
    if (customSinkPresent || beans.containsKey("auditSink")) {
      return new ConditionOutcome(false, "SKIPPED_EXISTING_BEAN");
    }
    beans.put("auditSink", AutoConfiguredAudit.NAME);
    return new ConditionOutcome(true, "APPLIED");
  }

  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    boolean enabled = Boolean.parseBoolean(input.next());
    boolean custom = Boolean.parseBoolean(input.next());
    Map<String, String> beans = new LinkedHashMap<>();
    if (custom) {
      beans.put("auditSink", "customAudit");
    }

    ConditionOutcome outcome = evaluate(enabled, custom, beans);
    System.out.println("outcome=" + outcome);
    System.out.println("bean=" + beans.get("auditSink"));

    if (outcome.matched()
        || !"SKIPPED_EXISTING_BEAN".equals(outcome.reason())
        || !"customAudit".equals(beans.get("auditSink"))) {
      throw new AssertionError("user bean did not override auto-configuration");
    }

    Map<String, String> empty = new LinkedHashMap<>();
    ConditionOutcome defaulted = evaluate(true, false, empty);
    if (!defaulted.matched()
        || !"autoAudit".equals(empty.get("auditSink"))) {
      throw new AssertionError("default auto-configuration failed");
    }
    System.out.println("default=" + defaulted + ",bean=" + empty.get("auditSink"));
  }
}
`,
      },
      stdin: `true true
`,
      checkpoint:
        '首个结果必须为 SKIPPED_EXISTING_BEAN 且 bean=customAudit；随后 default=APPLIED 且 bean=autoAudit。真实 Spring Boot 还应通过 --debug 的 ConditionEvaluationReport 确认同一判断，而不是只看日志里是否打印创建。',
    },
  },
};
