import type { LearningV2CodeLab } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java / JDK 17+',
  docsUrl: 'https://docs.oracle.com/en/java/javase/17/',
  installSteps: [
    '应用内实验使用 JDK 17 或更高版本，主文件固定为 Main.java。',
    '代码只依赖 JDK 标准库，不需要 Maven、Gradle 或第三方包。',
    '先运行起始代码观察真实输出，再按 brief 修改并重新运行。',
  ],
  languages: ['java'],
} as const;

/**
 * Java 课程的单文件真实代码实验室。
 *
 * 课程键必须与 Java 课程目录中的课程名逐字一致。实验只使用 JDK
 * 标准库，并由 Main.java 的 public class Main 作为唯一公开主类。
 */
export const LEARNING_CODE_LABS_JAVA: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:变量、基本类型与类型转换': {
    title: 'J1 代码台 01 · 数值边界与精确金额',
    description:
      '先观察 int 溢出、long 扩宽和 double 小数误差，再把订单金额计算改成 BigDecimal 与整数分，留下运行前后的可验证差异。',
    ...javaRuntime,
    practice: {
      id: 'java-types-boundaries-guided',
      title: '跟做：让溢出和误差自己显形',
      brief:
        '运行 Main.java。重点核对 max + 1 的回绕值、max + 1L 的扩宽结果，以及 0.1 + 0.2 为什么不等于 0.3；不要通过格式化两位数来掩盖 double 误差。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  public static void main(String[] args) {
    int max = Integer.MAX_VALUE;
    int overflow = max + 1;
    long widened = max + 1L;
    double floatingSum = 0.1 + 0.2;

    System.out.println("max=" + max);
    System.out.println("overflow=" + overflow);
    System.out.println("widened=" + widened);
    System.out.println("0.1 + 0.2=" + floatingSum);
    System.out.println("equals 0.3? " + (floatingSum == 0.3));

    if (overflow != Integer.MIN_VALUE || widened != 2147483648L) {
      throw new IllegalStateException("整数边界结果不符合补码规则");
    }
  }
}
`,
      },
      checkpoint:
        '输出必须含 overflow=-2147483648、widened=2147483648、equals 0.3? false，且进程退出码为 0。若先转 double 再加 long，说明扩宽发生在表达式之后，需要重算。',
    },
    apply: {
      id: 'java-types-money-independent',
      title: '独立实践：把 double 金额迁移为精确计算',
      brief:
        '当前代码用 double 汇总两行小额商品，运行后会暴露二进制尾差。保留输入，改用 BigDecimal（从字符串构造）计算总额；同时补一个用整数分计算的版本，证明两种精确算法得到 30 分。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.List;

public class Main {
  record LineItem(String sku, double unitPrice, int quantity) {}

  static double total(List<LineItem> items) {
    double sum = 0;
    for (LineItem item : items) {
      sum += item.unitPrice() * item.quantity();
    }
    return sum;
  }

  public static void main(String[] args) {
    List<LineItem> items = List.of(
        new LineItem("PEN", 0.10, 1),
        new LineItem("NOTE", 0.20, 1)
    );
    double total = total(items);
    System.out.println("double total=" + total);
    System.out.println("binary artifact=" + (total - 0.30));
    System.out.println("TODO: replace double with BigDecimal and cents");
  }
}
`,
      },
      checkpoint:
        '起始代码应输出 double total=0.30000000000000004 和非零 binary artifact。完成后应同时输出 BigDecimal 总额 0.30 和整数分总额 30，并且比较逻辑不依赖容差，不能只在打印时四舍五入。',
    },
  },

  'programming:运算符、分支与循环': {
    title: 'J1 代码台 02 · 条件分支与受控循环',
    description:
      '从优惠资格判断进入 switch 表达式，再用 Collatz 循环验证终止条件、计数器和整数溢出保护。',
    ...javaRuntime,
    practice: {
      id: 'java-operators-discount-guided',
      title: '跟做：短路条件与穷尽分支',
      brief:
        '运行折扣计算。先根据会员标记和订单分判断优惠，再用 switch 表达式把优惠等级映射为文字。注意 && 的短路行为只会在前一项为 true 时计算后一项。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  record Order(boolean member, int subtotalCents) {}

  static int discount(Order order) {
    if (order.member() && order.subtotalCents() >= 10_000) {
      return 2_000;
    }
    if (order.subtotalCents() >= 5_000) {
      return 1_000;
    }
    return 0;
  }

  static String tier(int discount) {
    return switch (discount) {
      case 2_000 -> "MEMBER_PLUS";
      case 1_000 -> "STANDARD";
      case 0 -> "NONE";
      default -> throw new IllegalArgumentException("unknown discount: " + discount);
    };
  }

  public static void main(String[] args) {
    for (Order order : new Order[] {
        new Order(true, 12_000),
        new Order(false, 8_000),
        new Order(true, 4_200)
    }) {
      int value = discount(order);
      System.out.printf("subtotal=%d discount=%d tier=%s%n",
          order.subtotalCents(), value, tier(value));
    }
  }
}
`,
      },
      checkpoint:
        '输出三行应依次为 MEMBER_PLUS、STANDARD、NONE，折扣分别为 2000、1000、0。若去掉 switch 的 default 后再增加非法等级，应能解释编译器为什么要求分支完整。',
    },
    apply: {
      id: 'java-operators-collatz-independent',
      title: '独立实践：带溢出保护的 Collatz 循环',
      brief:
        '运行并核对从 27 开始的 Collatz 步数。再把硬编码起点改为遍历 1 到 30，输出步数最多的起点；乘三加一时使用 Math.multiplyExact 和 Math.addExact，不能静默溢出。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  static int collatzSteps(long start) {
    if (start <= 0) {
      throw new IllegalArgumentException("start must be positive");
    }

    long current = start;
    int steps = 0;
    while (current != 1) {
      if (current % 2 == 0) {
        current /= 2;
      } else {
        current = Math.addExact(Math.multiplyExact(current, 3), 1);
      }
      steps++;
      if (steps > 10_000) {
        throw new IllegalStateException("loop guard exceeded");
      }
    }
    return steps;
  }

  public static void main(String[] args) {
    int steps = collatzSteps(27);
    System.out.println("steps(27)=" + steps);
    System.out.println("TODO: scan 1..30 and report the longest run");

    if (steps != 111) {
      throw new IllegalStateException("unexpected Collatz step count");
    }
  }
}
`,
      },
      checkpoint:
        '起始代码必须输出 steps(27)=111；完成扫描后还要输出最佳起点 27 和 111 步。验证时至少尝试起点 0、负数与循环保护，确认失败来自明确异常而不是死循环。',
    },
  },

  'programming:异常体系、错误传播与资源关闭': {
    title: 'J1 代码台 03 · 异常链、抑制异常与资源清理',
    description:
      '用 try-with-resources 观察主异常与 close 异常的 suppressed 关系，再把库存、支付失败包装成保留根因的订单异常。',
    ...javaRuntime,
    practice: {
      id: 'java-exceptions-suppressed-guided',
      title: '跟做：看清关闭阶段抛出的异常',
      brief:
        '运行代码。业务体先抛 DomainException，第二个资源的 close 又抛异常；Java 会把 close 异常放入主异常的 suppressed 列表，而不是覆盖主异常。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  static final class DomainException extends Exception {
    DomainException(String message) {
      super(message);
    }
  }

  static final class Resource implements AutoCloseable {
    private final String name;
    private final boolean failOnClose;

    Resource(String name, boolean failOnClose) {
      this.name = name;
      this.failOnClose = failOnClose;
    }

    @Override
    public void close() throws Exception {
      System.out.println("close " + name);
      if (failOnClose) {
        throw new IllegalStateException(name + "-close-failed");
      }
    }
  }

  public static void main(String[] args) {
    try (Resource first = new Resource("first", false);
         Resource second = new Resource("second", true)) {
      throw new DomainException("business work failed");
    } catch (Exception error) {
      System.out.println("primary=" + error.getClass().getSimpleName()
          + ":" + error.getMessage());
      System.out.println("suppressedCount=" + error.getSuppressed().length);
      for (Throwable suppressed : error.getSuppressed()) {
        System.out.println("suppressed=" + suppressed.getMessage());
      }
    }
  }
}
`,
      },
      checkpoint:
        '预期 primary=DomainException:business work failed、suppressedCount=1、suppressed=second-close-failed，并且先关闭 second 再关闭 first。若只在 finally 中抛异常导致主异常丢失，实验不通过。',
    },
    apply: {
      id: 'java-exceptions-order-independent',
      title: '独立实践：保留根因并回收临时预占',
      brief:
        '运行订单流程：库存通过、支付失败时，订单异常应包装 PaymentException 作为 cause，同时 finally 必须把临时库存预占数恢复为 0。随后再补库存失败分支，确认两条失败链都没有资源泄漏。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  static final class InventoryException extends Exception {
    InventoryException(String message) {
      super(message);
    }
  }

  static final class PaymentException extends Exception {
    PaymentException(String message) {
      super(message);
    }
  }

  static final class OrderFailure extends Exception {
    OrderFailure(String message, Throwable cause) {
      super(message, cause);
    }
  }

  static int reservations = 0;

  static void placeOrder(boolean inventoryOk, boolean paymentOk) throws OrderFailure {
    boolean completed = false;
    reservations++;
    try {
      if (!inventoryOk) {
        throw new InventoryException("SKU out of stock");
      }
      if (!paymentOk) {
        throw new PaymentException("card declined");
      }
      completed = true;
      System.out.println("order completed");
    } catch (InventoryException | PaymentException error) {
      throw new OrderFailure("order-42 failed", error);
    } finally {
      if (!completed) {
        reservations--;
      }
    }
  }

  public static void main(String[] args) {
    try {
      placeOrder(true, false);
    } catch (OrderFailure failure) {
      System.out.println("failure=" + failure.getMessage());
      System.out.println("rootCause=" + failure.getCause().getClass().getSimpleName());
      System.out.println("reservations=" + reservations);
    }

    System.out.println("TODO: exercise inventoryOk=false as well");
  }
}
`,
      },
      checkpoint:
        '支付失败输出 rootCause=PaymentException 且 reservations=0；补测库存失败后根因应为 InventoryException，reservations 仍为 0。不能通过吞掉异常来让流程显示成功。',
    },
  },

  'programming:泛型、类型擦除与通配符': {
    title: 'J1 代码台 04 · 有界泛型与 PECS 复制',
    description:
      '先用 Number 上界和 Comparable 约束实现类型安全的最大值，再用 extends/super 通配符完成只读来源与可写目标的数据复制。',
    ...javaRuntime,
    practice: {
      id: 'java-generics-bounds-guided',
      title: '跟做：让编译器守住类型边界',
      brief:
        '运行泛型最大值与 Result 包装。compareTo 只能用于声明了 Comparable 上界的 T；若把上界删掉，调用 compareTo 会直接编译失败。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.List;

public class Main {
  record Result<T>(T value, String type) {}

  static <T extends Number & Comparable<T>> T maximum(List<T> values) {
    if (values.isEmpty()) {
      throw new IllegalArgumentException("values must not be empty");
    }
    T best = values.get(0);
    for (T candidate : values) {
      if (candidate.compareTo(best) > 0) {
        best = candidate;
      }
    }
    return best;
  }

  public static void main(String[] args) {
    Result<Integer> integer = new Result<>(
        maximum(List.of(8, 13, 5, 21, 2)), "Integer");
    Result<Double> decimal = new Result<>(
        maximum(List.of(3.5, 9.1, 2.8)), "Double");

    System.out.println(integer);
    System.out.println(decimal);

    if (integer.value() != 21 || decimal.value() != 9.1) {
      throw new IllegalStateException("generic maximum mismatch");
    }
  }
}
`,
      },
      checkpoint:
        '输出应分别包含 value=21, type=Integer 和 value=9.1, type=Double，退出码为 0。再把 List.of("a","b") 传给 maximum 应编译失败，证明上界不是装饰。',
    },
    apply: {
      id: 'java-generics-pecs-independent',
      title: '独立实践：只读来源与可写目标',
      brief:
        '完成 copy 与 mapAll 两个泛型方法：来源使用 ? extends T，目标使用 ? super T；转换函数接收 ? super T 并返回 ? extends R。起始代码已能运行，补上 copy 的调用并检查目标列表元素类型。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.List;
        import java.util.function.Function;

public class Main {
  record Event(String id, int priority) {}

  static <T> void copy(List<? extends T> source, List<? super T> target) {
    for (T item : source) {
      target.add(item);
    }
  }

  static <T, R> List<R> mapAll(
      List<? extends T> source,
      Function<? super T, ? extends R> mapper) {
    List<R> result = new ArrayList<>();
    for (T item : source) {
      result.add(mapper.apply(item));
    }
    return result;
  }

  public static void main(String[] args) {
    List<Event> events = List.of(
        new Event("E-1", 3),
        new Event("E-2", 8)
    );
    List<Event> copied = new ArrayList<>();
    copy(events, copied);

    List<String> labels = mapAll(events,
        event -> event.id() + ":" + event.priority());
    System.out.println("copied=" + copied);
    System.out.println("labels=" + labels);
    System.out.println("TODO: copy into a List<Object> target");
  }
}
`,
      },
      checkpoint:
        'copied 必须包含两个 Event，labels 必须为 [E-1:3, E-2:8]；补做 List<Object> 目标后仍应能通过 copy(events, objects)，而反向读取该目标元素时只能按 Object 使用。',
    },
  },

  'programming:List、Map 与 Set 的选型': {
    title: 'J1 代码台 05 · 用访问模式选择集合',
    description:
      '把学生名单分别放进 List、Set、Map 和 Deque，观察顺序、唯一性、按键访问与队首出队四种不同语义。',
    ...javaRuntime,
    practice: {
      id: 'java-collections-selection-guided',
      title: '跟做：同一批数据放进四种集合',
      brief:
        '运行代码。List 保留重复，Set 去重，Map 以专业为键聚合，Deque 支持两端操作；每个输出都要能对应一个具体访问需求。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayDeque;
        import java.util.ArrayList;
        import java.util.Deque;
        import java.util.LinkedHashMap;
        import java.util.LinkedHashSet;
        import java.util.List;
        import java.util.Map;
        import java.util.Set;

public class Main {
  record Student(String id, String name, String major) {}

  public static void main(String[] args) {
    List<Student> arrivals = new ArrayList<>(List.of(
        new Student("S-2", "Lin", "Java"),
        new Student("S-1", "Chen", "Data"),
        new Student("S-2", "Lin", "Java"),
        new Student("S-3", "Wang", "Java")
    ));

    Set<Student> unique = new LinkedHashSet<>(arrivals);
    Map<String, List<String>> byMajor = new LinkedHashMap<>();
    for (Student student : unique) {
      byMajor.computeIfAbsent(student.major(), key -> new ArrayList<>())
          .add(student.name());
    }

    Deque<Student> queue = new ArrayDeque<>(unique);
    Student first = queue.removeFirst();

    System.out.println("listSize=" + arrivals.size());
    System.out.println("uniqueSize=" + unique.size());
    System.out.println("byMajor=" + byMajor);
    System.out.println("firstInQueue=" + first.id());
  }
}
`,
      },
      checkpoint:
        '预期 listSize=4、uniqueSize=3、byMajor 中 Java 对应 Lin 和 Wang、firstInQueue=S-2。必须注意 record 的去重来自组件 equals/hashCode，不是字符串打印相同。',
    },
    apply: {
      id: 'java-collections-event-index-independent',
      title: '独立实践：构建事件索引并输出热点用户',
      brief:
        '运行事件聚合。用 List 保留原始顺序，用 Map 累加每用户秒数，用 Map<String, Set<String>> 记录用户触发的唯一事件类型，再按总秒数排序输出前两名。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.Comparator;
        import java.util.LinkedHashMap;
        import java.util.LinkedHashSet;
        import java.util.List;
        import java.util.Map;
        import java.util.Set;

public class Main {
  record Event(String user, String type, int seconds) {}

  public static void main(String[] args) {
    List<Event> events = new ArrayList<>(List.of(
        new Event("alice", "view", 12),
        new Event("bob", "click", 5),
        new Event("alice", "click", 8),
        new Event("carol", "view", 7),
        new Event("bob", "view", 9),
        new Event("alice", "view", 4)
    ));

    Map<String, Integer> totals = new LinkedHashMap<>();
    Map<String, Set<String>> types = new LinkedHashMap<>();
    for (Event event : events) {
      totals.merge(event.user(), event.seconds(), Integer::sum);
      types.computeIfAbsent(event.user(), key -> new LinkedHashSet<>())
          .add(event.type());
    }

    List<Map.Entry<String, Integer>> ranking = new ArrayList<>(totals.entrySet());
    ranking.sort(Map.Entry.<String, Integer>comparingByValue(
        Comparator.reverseOrder()).thenComparing(Map.Entry.comparingByKey()));

    System.out.println("totals=" + totals);
    System.out.println("types=" + types);
    System.out.println("top=" + ranking.subList(0, 2));
  }
}
`,
      },
      checkpoint:
        'totals 应为 alice=24、bob=14、carol=7；alice 的唯一类型应含 view 和 click；top 前两项必须是 alice=24、bob=14。若用普通 HashMap 又声称保留插入顺序，应判为未区分语义。',
    },
  },

  'programming:Lambda、函数式接口与 Stream': {
    title: 'J1 代码台 06 · 惰性流水线与终端聚合',
    description:
      '先按分类汇总已支付订单，再用 flatMap、takeWhile 与 teeing 完成订单明细的型号去重和数量统计。',
    ...javaRuntime,
    practice: {
      id: 'java-stream-grouping-guided',
      title: '跟做：中间操作不执行，终端操作才消费',
      brief:
        '运行订单汇总。过滤、映射和 groupingBy 构成流水线，直到 collect 才真正遍历；输出每个分类的已支付总金额。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.List;
        import java.util.Map;
        import java.util.stream.Collectors;

public class Main {
  record Order(String id, String category, long cents, boolean paid) {}

  public static void main(String[] args) {
    List<Order> orders = List.of(
        new Order("O-1", "book", 4_200, true),
        new Order("O-2", "book", 1_800, false),
        new Order("O-3", "tool", 9_900, true),
        new Order("O-4", "book", 3_000, true),
        new Order("O-5", "tool", 2_500, true)
    );

    Map<String, Long> paidByCategory = orders.stream()
        .filter(Order::paid)
        .collect(Collectors.groupingBy(
            Order::category,
            Collectors.summingLong(Order::cents)));

    System.out.println("paidByCategory=" + paidByCategory);
    System.out.println("orderCount=" + orders.stream().filter(Order::paid).count());
  }
}
`,
      },
      checkpoint:
        'paidByCategory 必须为 book=7200、tool=12400，orderCount=4。若删掉 collect 只保留 filter，应说明没有终端操作时不会产生汇总结果。',
    },
    apply: {
      id: 'java-stream-teeing-independent',
      title: '独立实践：一次流水线得到两个指标',
      brief:
        '运行明细聚合。用 flatMap 展平订单，用 takeWhile 限制前三条记录，再用 teeing 同时计算总件数和唯一 SKU 数；最后解释为什么 teeing 仍需要终端操作。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.List;
        import java.util.Map;
        import java.util.Set;
        import java.util.stream.Collectors;
        import java.util.stream.Stream;

public class Main {
  record Order(String id) {}
  record Item(String orderId, String sku, int quantity) {}
  record Stats(long units, long distinctSkus) {}

  public static void main(String[] args) {
    List<Order> orders = List.of(
        new Order("O-1"), new Order("O-2"), new Order("O-3"), new Order("O-4"));
    Map<String, List<Item>> details = Map.of(
        "O-1", List.of(new Item("O-1", "B", 2)),
        "O-2", List.of(new Item("O-2", "A", 1), new Item("O-2", "B", 3)),
        "O-3", List.of(new Item("O-3", "C", 4)),
        "O-4", List.of(new Item("O-4", "A", 9))
    );

    Stats stats = orders.stream()
        .flatMap(order -> details.getOrDefault(order.id(), List.of()).stream())
        .takeWhile(item -> !item.orderId().equals("O-4"))
        .collect(Collectors.teeing(
            Collectors.summingLong(Item::quantity),
            Collectors.mapping(Item::sku, Collectors.collectingAndThen(
                Collectors.toSet(), (Set<String> set) -> (long) set.size())),
            Stats::new));

    List<String> skuLabels = Stream.of("B", "A", "B", "C")
        .distinct()
        .sorted()
        .toList();

    System.out.println("stats=" + stats);
    System.out.println("skuLabels=" + skuLabels);

    if (!stats.equals(new Stats(10, 3)) || !skuLabels.equals(List.of("A", "B", "C"))) {
      throw new IllegalStateException("stream aggregation mismatch");
    }
  }
}
`,
      },
      checkpoint:
        '预期 stats=Stats[units=10, distinctSkus=3]、skuLabels=[A, B, C]，退出码为 0。把 takeWhile 改成 filter 后 O-4 的 9 件会进入结果，必须能说明两者处理后续元素策略不同。',
    },
  },

  'programming:ArrayList 扩容与迭代器失效': {
    title: 'J2 代码台 01 · 扩容复制与 fail-fast',
    description:
      '用自建数组列表数清扩容复制次数，再操作真实 ArrayList 的迭代器，观察结构性修改如何触发 ConcurrentModificationException。',
    ...javaRuntime,
    practice: {
      id: 'java-arraylist-growth-guided',
      title: '跟做：扩容时到底发生了什么',
      brief:
        '运行代码。GrowableIntList 每次满载时新建更大数组并复制旧元素；随后在真实 ArrayList 的迭代器活跃期间 add，观察下一次迭代访问触发的 fail-fast。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.ConcurrentModificationException;
        import java.util.Iterator;
        import java.util.List;

public class Main {
  static final class GrowableIntList {
    private int[] data = new int[2];
    private int size;
    private int copies;

    void add(int value) {
      if (size == data.length) {
        int[] larger = new int[data.length * 2];
        System.arraycopy(data, 0, larger, 0, data.length);
        data = larger;
        copies += data.length / 2;
      }
      data[size++] = value;
    }
  }

  public static void main(String[] args) {
    GrowableIntList growing = new GrowableIntList();
    for (int value = 1; value <= 9; value++) {
      growing.add(value);
    }
    System.out.println("size=" + growing.size + ", capacity=" + growing.data.length
        + ", copiedSlots=" + growing.copies);

    List<String> names = new ArrayList<>(List.of("Ada", "Linus"));
    Iterator<String> iterator = names.iterator();
    System.out.println("first=" + iterator.next());
    names.add("Grace");
    try {
      iterator.next();
    } catch (ConcurrentModificationException error) {
      System.out.println("failFast=" + error.getClass().getSimpleName());
    }
  }
}
`,
      },
      checkpoint:
        '预期 size=9、capacity=16、copiedSlots=14，并输出 failFast=ConcurrentModificationException。复制槽位依次来自旧数组长度 2、4、8，因此总数是 14，不是最终容量。',
    },
    apply: {
      id: 'java-arraylist-remove-independent',
      title: '独立实践：安全清理重复任务',
      brief:
        '当前代码先用 removeIf 清理无效项，再用 ListIterator 删除连续重复编号。补上每次删除后的游标位置检查，并输出清理前后大小，证明没有跳过相邻元素。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.List;
        import java.util.ListIterator;

public class Main {
  record Task(int id, boolean active) {}

  public static void main(String[] args) {
    List<Task> tasks = new ArrayList<>(List.of(
        new Task(1, true),
        new Task(1, true),
        new Task(2, false),
        new Task(3, true),
        new Task(3, true),
        new Task(3, true),
        new Task(4, true)
    ));

    int before = tasks.size();
    tasks.removeIf(task -> !task.active());

    ListIterator<Task> cursor = tasks.listIterator();
    Task previous = null;
    while (cursor.hasNext()) {
      Task current = cursor.next();
      if (previous != null && previous.id() == current.id()) {
        cursor.remove();
      } else {
        previous = current;
      }
    }

    System.out.println("before=" + before + ", after=" + tasks.size());
    System.out.println("tasks=" + tasks);
    System.out.println("TODO: verify cursor position after every remove");
  }
}
`,
      },
      checkpoint:
        '清理后应只剩编号 1、3、4 各一条，after=3。补做游标检查后，每次 remove 后 previous 必须继续代表上一条保留记录，不能因回退游标而再次删除或漏删。',
    },
  },

  'programming:HashMap 哈希冲突与树化': {
    title: 'J2 代码台 02 · 哈希契约、桶索引与扩容',
    description:
      '先制造可变键破坏 equals/hashCode 契约，再用 HashMap 高 16 位扰动函数计算同一批键在 4 桶与 8 桶中的分布。',
    ...javaRuntime,
    practice: {
      id: 'java-hashmap-contract-guided',
      title: '跟做：插入后改键为什么找不到',
      brief:
        '运行代码。MutableKey 的 equals 按 id 比较，但 hashCode 依赖可变 label；对象插入后再改 label，查找会先落到错误桶，因此即使同一个引用也找不到。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.HashMap;
        import java.util.Map;

public class Main {
  static final class MutableKey {
    final String id;
    String label;

    MutableKey(String id, String label) {
      this.id = id;
      this.label = label;
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof MutableKey key && id.equals(key.id);
    }

    @Override
    public int hashCode() {
      return label.hashCode();
    }
  }

  record StableKey(String id) {}

  public static void main(String[] args) {
    Map<MutableKey, String> mutableMap = new HashMap<>();
    MutableKey key = new MutableKey("ORDER-1", "draft");
    mutableMap.put(key, "payload");
    key.label = "paid";

    Map<StableKey, String> stableMap = new HashMap<>();
    StableKey stable = new StableKey("ORDER-1");
    stableMap.put(stable, "payload");

    System.out.println("mutableLookup=" + mutableMap.get(key));
    System.out.println("stableLookup=" + stableMap.get(new StableKey("ORDER-1")));
  }
}
`,
      },
      checkpoint:
        '预期 mutableLookup=null、stableLookup=payload。不要用遍历整个 Map 来“修复”可变键；正确做法是让参与 equals/hashCode 的字段不可变，并保证相等对象哈希一致。',
    },
    apply: {
      id: 'java-hashmap-buckets-independent',
      title: '独立实践：计算扰动后的桶索引',
      brief:
        '运行桶分布模拟。spread 对 hashCode 做高 16 位异或，再与容量减一相与；记录 4 桶和 8 桶中每个键的索引、最大冲突数与负载因子，并解释扩容为什么可能拆开冲突链。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.LinkedHashMap;
        import java.util.Map;

public class Main {
  static int spread(int hashCode, int capacity) {
    return (hashCode ^ (hashCode >>> 16)) & (capacity - 1);
  }

  static Map<String, Integer> distribution(int[] hashes, int capacity) {
    Map<String, Integer> buckets = new LinkedHashMap<>();
    for (int index = 0; index < capacity; index++) {
      buckets.put("bucket-" + index, 0);
    }
    for (int hash : hashes) {
      int index = spread(hash, capacity);
      buckets.computeIfPresent("bucket-" + index, (key, count) -> count + 1);
    }
    return buckets;
  }

  public static void main(String[] args) {
    int[] hashes = {0, 4, 8, 12, 16};
    System.out.println("capacity4=" + distribution(hashes, 4));
    System.out.println("capacity8=" + distribution(hashes, 8));
    System.out.println("TODO: print maxCollision and loadFactor for each capacity");
  }
}
`,
      },
      checkpoint:
        '容量 4 时五个键都落在 bucket-0；容量 8 时应拆成 bucket-0 三个、bucket-4 两个。完成统计后容量 8 的最大冲突数为 3，负载因子 5/8=0.625，并说明树化还需容量和链表长度条件。',
    },
  },

  'programming:synchronized 与监视器': {
    title: 'J2 代码台 03 · 监视器互斥与条件等待',
    description:
      '先对比普通自增与 synchronized 自增，再用 wait/notifyAll 实现有界单槽缓冲区，验证等待条件必须放在 while 中。',
    ...javaRuntime,
    practice: {
      id: 'java-monitor-counter-guided',
      title: '跟做：把复合自增放进同一把锁',
      brief:
        '运行 4 个任务各递增 50,000 次。safeCount 由 synchronized 方法保护，结果必须精确为 200,000；unsafeCount 的丢失更新数量可能因调度变化，但可用来解释读改写为何不是原子操作。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.concurrent.CountDownLatch;
        import java.util.concurrent.ExecutorService;
        import java.util.concurrent.Executors;
        import java.util.concurrent.TimeUnit;

public class Main {
  static int unsafeCount;
  static int safeCount;

  static synchronized void incrementSafe() {
    safeCount++;
  }

  public static void main(String[] args) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    CountDownLatch done = new CountDownLatch(4);

    for (int worker = 0; worker < 4; worker++) {
      pool.submit(() -> {
        try {
          for (int index = 0; index < 50_000; index++) {
            unsafeCount++;
            incrementSafe();
          }
        } finally {
          done.countDown();
        }
      });
    }

    if (!done.await(10, TimeUnit.SECONDS)) {
      throw new IllegalStateException("workers timed out");
    }
    pool.shutdown();
    pool.awaitTermination(5, TimeUnit.SECONDS);

    System.out.println("safeCount=" + safeCount);
    System.out.println("unsafeCount=" + unsafeCount);
    if (safeCount != 200_000) {
      throw new IllegalStateException("synchronized counter lost an update");
    }
  }
}
`,
      },
      checkpoint:
        'safeCount 必须每次都是 200000，退出码为 0；unsafeCount 应小于或等于 200000，高竞争时通常出现丢失。把四个任务改成同一实例的 synchronized 代码块，验证不同锁对象不能保护同一状态。',
    },
    apply: {
      id: 'java-monitor-buffer-independent',
      title: '独立实践：用 wait/notifyAll 传递数据',
      brief:
        '运行单槽缓冲区：生产者依次放入 1 到 5，消费者累加后退出。等待必须使用 while 而不是 if；完成基础链路后增加关闭标记，让空缓冲区在关闭时以明确异常结束。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.concurrent.ExecutorService;
        import java.util.concurrent.Executors;
        import java.util.concurrent.Future;

public class Main {
  static final class SingleSlotBuffer {
    private Integer value;

    synchronized void put(int next) throws InterruptedException {
      while (value != null) {
        wait();
      }
      value = next;
      notifyAll();
    }

    synchronized int take() throws InterruptedException {
      while (value == null) {
        wait();
      }
      int result = value;
      value = null;
      notifyAll();
      return result;
    }
  }

  public static void main(String[] args) throws Exception {
    SingleSlotBuffer buffer = new SingleSlotBuffer();
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<?> producer = pool.submit(() -> {
        try {
          for (int value = 1; value <= 5; value++) {
            buffer.put(value);
          }
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(error);
        }
      });

      Future<Integer> consumer = pool.submit(() -> {
        int sum = 0;
        try {
          for (int count = 0; count < 5; count++) {
            sum += buffer.take();
          }
        } catch (InterruptedException error) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException(error);
        }
        return sum;
      });

      producer.get();
      int sum = consumer.get();
      System.out.println("sum=" + sum);
      if (sum != 15) {
        throw new IllegalStateException("buffer lost or duplicated a value");
      }
    } finally {
      pool.shutdownNow();
    }
  }
}
`,
      },
      checkpoint:
        'sum 必须为 15，进程在超时前退出且没有丢值或重复值。增加 closed 标记后，关闭且无值时 take 应抛出带关闭信息的 IllegalStateException，不能用无限 wait 伪装成成功。',
    },
  },

  'programming:class 文件与字节码': {
    title: 'J2 代码台 04 · 读取自己的 class 文件',
    description:
      '直接读取 Main.class 的前四个魔数、版本号和常量池可读片段，再用反射与 StackWalker 观察编译后类、方法与调用帧。',
    ...javaRuntime,
    practice: {
      id: 'java-classfile-stack-guided',
      title: '跟做：class 文件与调用帧同时作证',
      brief:
        '运行代码。字节流前四字节应为 CAFEBABE，major version 对应当前 JDK；StackWalker 会输出 levelThree 到 main 的帧，证明调试信息映射的是 class 中的方法与源码位置。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.io.DataInputStream;
        import java.io.InputStream;
        import java.util.stream.Collectors;

public class Main {
  static void levelOne() {
    levelTwo();
  }

  static void levelTwo() {
    levelThree();
  }

  static void levelThree() {
    String frames = StackWalker.getInstance().walk(stream ->
        stream.limit(4)
            .map(frame -> frame.getMethodName() + ":" + frame.getLineNumber())
            .collect(Collectors.joining(" <- ")));
    System.out.println("frames=" + frames);
  }

  public static void main(String[] args) throws Exception {
    try (InputStream raw = Main.class.getResourceAsStream("Main.class")) {
      if (raw == null) {
        throw new IllegalStateException("Main.class resource not found");
      }
      try (DataInputStream input = new DataInputStream(raw)) {
        int magic = input.readInt();
        int minor = input.readUnsignedShort();
        int major = input.readUnsignedShort();
        System.out.printf("magic=%08X minor=%d major=%d%n", magic, minor, major);
        if (magic != 0xCAFEBABE) {
          throw new IllegalStateException("not a JVM class file");
        }
      }
    }
    levelOne();
  }
}
`,
      },
      checkpoint:
        '输出必须包含 magic=CAFEBABE 和 major 版本，frames 至少包含 levelThree、levelTwo、levelOne、main。把 levelTwo 删除后应出现编译错误或无帧结果，说明调用栈来自真实编译产物。',
    },
    apply: {
      id: 'java-classfile-method-independent',
      title: '独立实践：核对方法描述符与常量池',
      brief:
        '运行 class 文件检查。程序列出 calculate(int) 与 calculate(long) 的反射签名，并在字节流中查找方法名。请补一个无参 calculate()，观察方法重载如何生成不同参数描述符，而方法名文本仍相同。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.io.InputStream;
        import java.lang.reflect.Method;
        import java.nio.charset.StandardCharsets;
        import java.util.Arrays;
        import java.util.Comparator;

public class Main {
  static int calculate(int value) {
    return value * 2;
  }

  static long calculate(long value) {
    return value * 3;
  }

  static String parameters(Method method) {
    return Arrays.stream(method.getParameterTypes())
        .map(Class::getSimpleName)
        .reduce((left, right) -> left + "," + right)
        .orElse("none");
  }

  public static void main(String[] args) throws Exception {
    Method[] methods = Main.class.getDeclaredMethods();
    Arrays.sort(methods, Comparator.comparing(Method::getName)
        .thenComparing(Main::parameters));
    for (Method method : methods) {
      if (method.getName().equals("calculate")) {
        System.out.println("method=calculate parameters=" + parameters(method)
            + " returns=" + method.getReturnType().getSimpleName());
      }
    }

    byte[] classBytes;
    try (InputStream input = Main.class.getResourceAsStream("Main.class")) {
      if (input == null) {
        throw new IllegalStateException("class resource missing");
      }
      classBytes = input.readAllBytes();
    }
    String constantPoolText = new String(classBytes, StandardCharsets.ISO_8859_1);
    System.out.println("classBytes=" + classBytes.length);
    System.out.println("containsCalculate=" + constantPoolText.contains("calculate"));
    System.out.println("TODO: add calculate() and compare descriptors");
  }
}
`,
      },
      checkpoint:
        '起始输出必须同时列出 calculate(int) 和 calculate(long)，containsCalculate=true。补无参方法后应出现 parameters=none；解释重载由名称加参数描述符共同识别，不能只看方法名。',
    },
  },

  'programming:类加载与双亲委派': {
    title: 'J2 代码台 05 · 类加载器父子链与类身份',
    description:
      '先打印系统、平台和启动类加载器的父子关系，再用无父加载器定义同名 PluginType 字节，证明全限定名相同不代表 Class 对象相同。',
    ...javaRuntime,
    practice: {
      id: 'java-classloader-parent-guided',
      title: '跟做：沿父加载器查找 Main 和 String',
      brief:
        '运行加载器检查。应用类通常由系统类加载器加载，String 来自启动类加载器，因此 getClassLoader() 返回 null；平台加载器位于系统加载器与启动层之间。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  static String loaderName(ClassLoader loader) {
    return loader == null ? "bootstrap" : loader.getName();
  }

  public static void main(String[] args) {
    ClassLoader system = ClassLoader.getSystemClassLoader();
    ClassLoader platform = system.getParent();

    System.out.println("MainLoader=" + loaderName(Main.class.getClassLoader()));
    System.out.println("StringLoader=" + loaderName(String.class.getClassLoader()));
    System.out.println("system=" + system.getName());
    System.out.println("platform=" + loaderName(platform));
    System.out.println("platformParent=" + loaderName(platform == null ? null : platform.getParent()));
    System.out.println("sameSystem=" + (Main.class.getClassLoader() == system));
  }
}
`,
      },
      checkpoint:
        'MainLoader 和 system 应为同一个应用加载器名称，StringLoader=bootstrap，sameSystem=true；平台加载器的 parent 应为 bootstrap。若把 null 解释为“没有加载器”而不是启动层，概念未掌握。',
    },
    apply: {
      id: 'java-classloader-identity-independent',
      title: '独立实践：同一个类名，两个 Class 对象',
      brief:
        '运行隔离加载。ByteArrayLoader 的 parent 为 null，并直接从 PluginType.class 字节定义类；它与当前应用加载的 PluginType 名称相同，但 Class 对象不相等，静态状态也彼此隔离。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.io.InputStream;
        import java.lang.reflect.Method;

class PluginType {
  static int state = 1;

  public String describe() {
    state++;
    return "plugin-state=" + state;
  }
}

public class Main {
  static final class ByteArrayLoader extends ClassLoader {
    private final byte[] bytes;

    ByteArrayLoader(byte[] bytes) {
      super(null);
      this.bytes = bytes.clone();
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
      if (!name.equals("PluginType")) {
        throw new ClassNotFoundException(name);
      }
      return defineClass(name, bytes, 0, bytes.length);
    }
  }

  public static void main(String[] args) throws Exception {
    byte[] pluginBytes;
    try (InputStream input = Main.class.getResourceAsStream("PluginType.class")) {
      if (input == null) {
        throw new IllegalStateException("PluginType.class missing");
      }
      pluginBytes = input.readAllBytes();
    }

    Class<?> isolated = new ByteArrayLoader(pluginBytes).loadClass("PluginType");
    java.lang.reflect.Constructor<?> constructor = isolated.getDeclaredConstructor();
    constructor.setAccessible(true);
    Object instance = constructor.newInstance();
    Method describe = isolated.getMethod("describe");
    describe.setAccessible(true);

    String first = (String) describe.invoke(instance);
    String second = (String) describe.invoke(instance);
    System.out.println("sameName=" + isolated.getName().equals(PluginType.class.getName()));
    System.out.println("sameClass=" + (isolated == PluginType.class));
    System.out.println("sameLoader="
        + (isolated.getClassLoader() == PluginType.class.getClassLoader()));
    System.out.println("isolatedState=" + first + "," + second);
  }
}
`,
      },
      checkpoint:
        '预期 sameName=true、sameClass=false、sameLoader=false，isolatedState=plugin-state=2,plugin-state=3；当前应用中的 PluginType.state 不应被隔离实例修改。若自定义加载器仍请求父加载器先找到应用类，sameClass 会错误地变成 true。',
    },
  },

  'programming:JVM 运行时数据区': {
    title: 'J2 代码台 06 · 栈溢出与运行时内存快照',
    description:
      '用递归触发并捕获 StackOverflowError，再用 MemoryMXBean、MemoryPoolMXBean 与 ThreadMXBean 列出 Java 堆、非堆、内存池和线程数量。',
    ...javaRuntime,
    practice: {
      id: 'java-runtime-stack-guided',
      title: '跟做：线程栈耗尽的真实边界',
      brief:
        '运行代码。递归调用持续占用当前线程栈帧，最终抛出 StackOverflowError；它属于 Error，不应伪装成普通业务异常，但可以被诊断代码捕获并记录最大深度。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  static int depth;

  static void recurse() {
    depth++;
    recurse();
  }

  public static void main(String[] args) {
    Runtime runtime = Runtime.getRuntime();
    System.out.println("processors=" + runtime.availableProcessors());
    System.out.println("maxMemory=" + runtime.maxMemory());
    System.out.println("totalMemory=" + runtime.totalMemory());

    try {
      recurse();
    } catch (StackOverflowError error) {
      System.out.println("caught=" + error.getClass().getSimpleName());
      System.out.println("reachedDepth=" + depth);
    }
    System.out.println("currentStackFrames=" + Thread.currentThread().getStackTrace().length);
  }
}
`,
      },
      checkpoint:
        '输出必须包含 caught=StackOverflowError 和大于 0 的 reachedDepth；同一程序重启后深度可能变化，这是栈大小、调用帧和 JIT 状态不同造成的，不能把一次深度当固定 JVM 常量。',
    },
    apply: {
      id: 'java-runtime-pools-independent',
      title: '独立实践：把内存池和线程映射到运行时区域',
      brief:
        '运行 JVM 快照。列出每个 MemoryPool 的名称、类型、使用量和峰值，再打印活动线程数。请为输出补一张分类：哪些池属于 Java 堆，哪些属于非堆，以及线程栈为什么不等于堆池。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.management.ManagementFactory;
        import java.lang.management.MemoryMXBean;
        import java.lang.management.MemoryPoolMXBean;
        import java.lang.management.MemoryType;
        import java.lang.management.ThreadMXBean;
        import java.util.Comparator;

public class Main {
  public static void main(String[] args) {
    MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
    ThreadMXBean threads = ManagementFactory.getThreadMXBean();

    System.out.println("heapUsed=" + memory.getHeapMemoryUsage().getUsed());
    System.out.println("nonHeapUsed=" + memory.getNonHeapMemoryUsage().getUsed());
    System.out.println("liveThreads=" + threads.getThreadCount());

    ManagementFactory.getMemoryPoolMXBeans().stream()
        .sorted(Comparator.comparing(MemoryPoolMXBean::getName))
        .forEach(pool -> System.out.println(
            "pool=" + pool.getName()
                + " type=" + (pool.getType() == MemoryType.HEAP ? "HEAP" : "NON_HEAP")
                + " used=" + pool.getUsage().getUsed()
                + " peak=" + pool.getPeakUsage().getUsed()));

    System.out.println("TODO: classify pools and explain thread stacks");
  }
}
`,
      },
      checkpoint:
        '输出必须包含 heapUsed、nonHeapUsed、liveThreads，以及至少一个 HEAP 池和至少一个 NON_HEAP 池。分类说明中必须指出线程栈由线程私有栈帧组成，不是 MemoryPoolMXBean 的 Java 堆池；不能按数值大小猜区域。',
    },
  },

  'programming:Spring IoC 与 BeanDefinition': {
    title: 'J3 代码台 01 · 用标准库实现最小 IoC 容器',
    description:
      '用反射构造器注入接口实现，再扩展 BeanDefinition 的 singleton/prototype 作用域和初始化回调，理解容器如何控制对象创建而不是直接 new。',
    ...javaRuntime,
    practice: {
      id: 'java-spring-ioc-guided',
      title: '跟做：构造器依赖由容器解析',
      brief:
        '运行最小容器。register 登记接口实例，get(OrderService.class) 读取构造器参数类型并递归解析 Clock 与 OrderRepository；main 不直接 new OrderService。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.reflect.Constructor;
        import java.util.HashMap;
        import java.util.Map;

public class Main {
  interface Clock {
    String today();
  }

  interface OrderRepository {
    int orderCount();
  }

  static final class FixedClock implements Clock {
    public String today() {
      return "2026-11-24";
    }
  }

  static final class InMemoryRepository implements OrderRepository {
    public int orderCount() {
      return 7;
    }
  }

  static final class OrderService {
    private final Clock clock;
    private final OrderRepository repository;

    OrderService(Clock clock, OrderRepository repository) {
      this.clock = clock;
      this.repository = repository;
    }

    String summary() {
      return clock.today() + ":" + repository.orderCount();
    }
  }

  static final class Container {
    private final Map<Class<?>, Object> beans = new HashMap<>();

    <T> void register(Class<T> type, T instance) {
      beans.put(type, instance);
    }

    <T> T get(Class<T> type) {
      Object existing = beans.get(type);
      if (existing != null) {
        return type.cast(existing);
      }
      try {
        Constructor<?> constructor = type.getDeclaredConstructors()[0];
        Object[] arguments = new Object[constructor.getParameterCount()];
        Class<?>[] parameterTypes = constructor.getParameterTypes();
        for (int index = 0; index < parameterTypes.length; index++) {
          arguments[index] = get(parameterTypes[index]);
        }
        constructor.setAccessible(true);
        T created = type.cast(constructor.newInstance(arguments));
        beans.put(type, created);
        return created;
      } catch (ReflectiveOperationException error) {
        throw new IllegalStateException("cannot create bean " + type.getName(), error);
      }
    }
  }

  public static void main(String[] args) {
    Container container = new Container();
    container.register(Clock.class, new FixedClock());
    container.register(OrderRepository.class, new InMemoryRepository());

    OrderService service = container.get(OrderService.class);
    System.out.println("summary=" + service.summary());
    System.out.println("sameSingleton=" + (service == container.get(OrderService.class)));
  }
}
`,
      },
      checkpoint:
        '预期 summary=2026-11-24:7、sameSingleton=true。把 Clock 实现替换成另一个类时只改注册，不改 OrderService；若容器开始在各个业务类里直接 new，依赖方向已经退化。',
    },
    apply: {
      id: 'java-spring-scope-independent',
      title: '独立实践：singleton、prototype 与初始化回调',
      brief:
        '运行 BeanDefinition 容器。singleton 两次 get 必须返回同一对象，prototype 两次 get 必须返回不同对象；每次创建都调用 afterPropertiesSet，最终初始化计数应为 3。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.HashMap;
        import java.util.Map;
        import java.util.concurrent.atomic.AtomicInteger;
        import java.util.function.Supplier;

public class Main {
  interface InitializingBean {
    void afterPropertiesSet();
  }

  enum Scope {
    SINGLETON,
    PROTOTYPE
  }

  record BeanDefinition<T>(Scope scope, Supplier<T> factory) {}

  static class CounterBean implements InitializingBean {
    private static final AtomicInteger TOTAL_INITIALIZED = new AtomicInteger();
    private final int id;
    private boolean initialized;

    CounterBean(int id) {
      this.id = id;
    }

    public void afterPropertiesSet() {
      initialized = true;
      TOTAL_INITIALIZED.incrementAndGet();
    }

    boolean ready() {
      return initialized;
    }

    int id() {
      return id;
    }

    static int totalInitialized() {
      return TOTAL_INITIALIZED.get();
    }
  }

  static final class SingletonBean extends CounterBean {
    SingletonBean(int id) {
      super(id);
    }
  }

  static final class PrototypeBean extends CounterBean {
    PrototypeBean(int id) {
      super(id);
    }
  }

  static final class Container {
    private final Map<Class<?>, BeanDefinition<?>> definitions = new HashMap<>();
    private final Map<Class<?>, Object> singletons = new HashMap<>();

    <T> void register(Class<T> type, Scope scope, Supplier<T> factory) {
      definitions.put(type, new BeanDefinition<>(scope, factory));
    }

    <T> T get(Class<T> type) {
      BeanDefinition<?> definition = definitions.get(type);
      if (definition == null) {
        throw new IllegalArgumentException("no definition for " + type.getName());
      }
      if (definition.scope() == Scope.SINGLETON) {
        Object cached = singletons.get(type);
        if (cached != null) {
          return type.cast(cached);
        }
      }

      Object created = definition.factory().get();
      if (created instanceof InitializingBean bean) {
        bean.afterPropertiesSet();
      }
      if (definition.scope() == Scope.SINGLETON) {
        singletons.put(type, created);
      }
      return type.cast(created);
    }
  }

  public static void main(String[] args) {
    Container container = new Container();
    AtomicInteger sequence = new AtomicInteger();
    container.register(SingletonBean.class, Scope.SINGLETON,
        () -> new SingletonBean(sequence.incrementAndGet()));
    container.register(PrototypeBean.class, Scope.PROTOTYPE,
        () -> new PrototypeBean(sequence.incrementAndGet()));

    SingletonBean singletonFirst = container.get(SingletonBean.class);
    SingletonBean singletonSecond = container.get(SingletonBean.class);
    PrototypeBean prototypeFirst = container.get(PrototypeBean.class);
    PrototypeBean prototypeSecond = container.get(PrototypeBean.class);

    System.out.println("singletonSame=" + (singletonFirst == singletonSecond));
    System.out.println("prototypeSame=" + (prototypeFirst == prototypeSecond));
    System.out.println("ready=" + singletonFirst.ready() + "," + prototypeFirst.ready());
    System.out.println("initialized=" + CounterBean.totalInitialized());
  }
}
`,
      },
      checkpoint:
        '起始输出应为 singletonSame=true、prototypeSame=false、ready=true,true、initialized=3。继续增加 destroy 回调后，两次 singleton 获取只能销毁一次，两个 prototype 实例分别创建且不能参与单例销毁。',
    },
  },

  'programming:Spring AOP 与动态代理': {
    title: 'J3 代码台 02 · JDK 动态代理与自调用边界',
    description:
      '用 InvocationHandler 在接口调用前后记录日志，再复现目标方法内部调用另一个方法时不会经过代理的 Spring AOP 自调用问题。',
    ...javaRuntime,
    practice: {
      id: 'java-spring-aop-proxy-guided',
      title: '跟做：代理拦截外部接口调用',
      brief:
        '运行 JDK 动态代理。GreetingService 的 greet 和 fail 都通过代理调用；handler 记录方法名、参数，并在异常时记录类型后继续抛出。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.reflect.InvocationHandler;
        import java.lang.reflect.Proxy;

public class Main {
  interface GreetingService {
    String greet(String name);
    String fail();
  }

  static final class RealGreetingService implements GreetingService {
    public String greet(String name) {
      return "hello " + name;
    }

    public String fail() {
      throw new IllegalArgumentException("invalid recipient");
    }
  }

  public static void main(String[] args) {
    GreetingService target = new RealGreetingService();
    InvocationHandler handler = (proxy, method, arguments) -> {
      System.out.println("before=" + method.getName());
      try {
        Object result = method.invoke(target, arguments);
        System.out.println("after=" + method.getName());
        return result;
      } catch (java.lang.reflect.InvocationTargetException error) {
        Throwable cause = error.getCause();
        System.out.println("error=" + cause.getClass().getSimpleName());
        throw cause;
      }
    };

    GreetingService proxy = (GreetingService) Proxy.newProxyInstance(
        Main.class.getClassLoader(),
        new Class<?>[] {GreetingService.class},
        handler);

    System.out.println("result=" + proxy.greet("Ada"));
    try {
      proxy.fail();
    } catch (IllegalArgumentException expected) {
      System.out.println("observed=" + expected.getMessage());
    }
  }
}
`,
      },
      checkpoint:
        '输出必须包含 greet 与 fail 的 before/after 或 error 记录，并最终输出 observed=invalid recipient。若代理没有从 InvocationTargetException 中解包 cause，业务异常类型会被错误改写。',
    },
    apply: {
      id: 'java-spring-aop-self-invocation-independent',
      title: '独立实践：修复自调用导致的通知失效',
      brief:
        '运行当前代理。place 是外部代理入口，会记录 before/after；validate 由 place 内部直接调用，因此不出现 validate 拦截记录。把校验拆成注入的协作者接口，让 place 调用代理后的 validator，并验证两条拦截记录都出现。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.lang.reflect.InvocationHandler;
        import java.lang.reflect.Proxy;
        import java.util.ArrayList;
        import java.util.List;

public class Main {
  interface OrderOperations {
    void place(String sku);
  }

  static final class OrderService implements OrderOperations {
    private final List<String> audit = new ArrayList<>();

    public void place(String sku) {
      validate(sku);
      audit.add("place:" + sku);
    }

    private void validate(String sku) {
      audit.add("validate:" + sku);
    }

    List<String> audit() {
      return audit;
    }
  }

  public static void main(String[] args) {
    OrderService target = new OrderService();
    List<String> intercepted = new ArrayList<>();
    InvocationHandler logging = (proxy, method, arguments) -> {
      intercepted.add(method.getName());
      return method.invoke(target, arguments);
    };

    OrderOperations proxy = (OrderOperations) Proxy.newProxyInstance(
        Main.class.getClassLoader(),
        new Class<?>[] {OrderOperations.class},
        logging);
    proxy.place("SKU-1");

    System.out.println("audit=" + target.audit());
    System.out.println("intercepted=" + intercepted);
    System.out.println("TODO: move validate behind an injected proxied interface");
  }
}
`,
      },
      checkpoint:
        '起始 intercepted=[place] 可复现自调用失效。完成后 audit 仍应包含 place 与 validate 的事实，intercepted 必须同时出现 place 和 validate；不能把 validate 改 public 后继续用 this.validate 来假装修复。',
    },
  },

  'programming:Spring 事务与事务传播': {
    title: 'J3 代码台 03 · 事务模板与 REQUIRES_NEW',
    description:
      '用工作副本模拟事务提交和回滚，再实现 ThreadLocal 事务上下文，验证内层 REQUIRES_NEW 失败不会回滚已经存在的外层事务。',
    ...javaRuntime,
    practice: {
      id: 'java-spring-transaction-template-guided',
      title: '跟做：只有 commit 才发布工作副本',
      brief:
        '运行事务模板。成功事务把 pending 中的两条记录一次性加入数据库；失败事务抛出异常后 rollback 清空 pending，数据库不会出现半成品。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.List;
        import java.util.function.Function;

public class Main {
  static final class TransactionContext {
    final List<String> pending = new ArrayList<>();
  }

  static final class TransactionTemplate {
    private final List<String> database = new ArrayList<>();

    <T> T execute(Function<TransactionContext, T> callback) {
      TransactionContext context = new TransactionContext();
      try {
        T result = callback.apply(context);
        database.addAll(context.pending);
        return result;
      } catch (RuntimeException error) {
        context.pending.clear();
        throw error;
      }
    }

    void write(TransactionContext context, String row) {
      context.pending.add(row);
    }

    List<String> database() {
      return database;
    }
  }

  public static void main(String[] args) {
    TransactionTemplate template = new TransactionTemplate();

    Integer committed = template.execute(context -> {
      template.write(context, "order:created");
      template.write(context, "outbox:created");
      return 2;
    });

    try {
      template.execute(context -> {
        template.write(context, "order:should-rollback");
        throw new IllegalStateException("payment failed");
      });
    } catch (IllegalStateException expected) {
      System.out.println("rolledBack=" + expected.getMessage());
    }

    System.out.println("committedRows=" + committed);
    System.out.println("database=" + template.database());
  }
}
`,
      },
      checkpoint:
        'expected committedRows=2、database=[order:created, outbox:created]，rolledBack=payment failed。若异常被 catch 后没有重新抛出，事务模板会错误提交，必须说明传播给事务边界的原因。',
    },
    apply: {
      id: 'java-spring-requires-new-independent',
      title: '独立实践：让内层新事务独立回滚',
      brief:
        '运行传播实验。内层 REQUIRES_NEW 写入 audit:start 后失败，独立事务回滚；外层随后继续写 order:paid 并提交。请再增加一个 REQUIRED 内层失败场景，验证默认加入外层事务时会把外层标记为回滚。',
      defaultLanguage: 'java',
      starterCode: {
        java: `import java.util.ArrayList;
        import java.util.List;

public class Main {
  enum Propagation {
    REQUIRED,
    REQUIRES_NEW
  }

  static final class Transaction {
    final List<String> pending = new ArrayList<>();
  }

  static final class TransactionManager {
    private final ThreadLocal<Transaction> current = new ThreadLocal<>();
    private final List<String> committed = new ArrayList<>();
    private final List<String> rolledBack = new ArrayList<>();

    void execute(Propagation propagation, Runnable callback) {
      Transaction existing = current.get();
      if (propagation == Propagation.REQUIRED && existing != null) {
        callback.run();
        return;
      }

      Transaction transaction = new Transaction();
      current.set(transaction);
      try {
        callback.run();
        committed.addAll(transaction.pending);
      } catch (RuntimeException error) {
        rolledBack.addAll(transaction.pending);
        throw error;
      } finally {
        if (existing == null) {
          current.remove();
        } else {
          current.set(existing);
        }
      }
    }

    void write(String row) {
      Transaction transaction = current.get();
      if (transaction == null) {
        throw new IllegalStateException("no active transaction");
      }
      transaction.pending.add(row);
    }
  }

  public static void main(String[] args) {
    TransactionManager manager = new TransactionManager();
    manager.execute(Propagation.REQUIRED, () -> {
      manager.write("order:created");
      try {
        manager.execute(Propagation.REQUIRES_NEW, () -> {
          manager.write("audit:start");
          throw new IllegalStateException("audit unavailable");
        });
      } catch (IllegalStateException expected) {
        System.out.println("isolatedFailure=" + expected.getMessage());
      }
      manager.write("order:paid");
    });

    System.out.println("committed=" + manager.committed);
    System.out.println("rolledBack=" + manager.rolledBack);
    System.out.println("TODO: add REQUIRED inner failure scenario");
  }
}
`,
      },
      checkpoint:
        '起始场景 committed=[order:created, order:paid]、rolledBack=[audit:start]。补 REQUIRED 内层失败后，外层 captured 的 pending 应全部进入回滚，并明确外层异常最终是否被捕获；不能把 REQUIRES_NEW 当成普通方法调用。',
    },
  },
};
