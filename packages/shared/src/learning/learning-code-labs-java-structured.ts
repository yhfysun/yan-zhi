import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const javaRuntime = {
  requiredRuntime: 'java',
  runtimeLabel: 'Java 17 / JDK standard library',
  docsUrl: 'https://docs.oracle.com/en/java/javase/17/',
  installSteps: [
    '确认 java 与 javac 均为 JDK 17 或更高版本，主文件固定为 Main.java。',
    '所有实验只使用 JDK 标准库；Spring、MVC、Security、Data 和 WebFlux 均以明确标注的契约模拟出现。',
    '先按给定 stdin 运行，再修改输入观察失败路径；任何 framework simulation 都不表示已经加载真实框架。',
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
 * P06 结构化课程代码台。
 *
 * 课程键均来自 catalog/programs 中真实的 P06 课程，并避开
 * learning-code-labs-java.ts 与 learning-code-labs-java-advanced.ts。
 * 外部框架只做 JDK 标准库契约模拟，不伪装为真实框架运行。
 */
export const LEARNING_CODE_LABS_JAVA_STRUCTURED: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:Java 零基础：JDK、IDE 与第一个程序': javaLab(
    'JS 代码台 01 · 工具链事实与启动配置',
    '从运行时指纹、工作目录、编译器路径和类路径生成可复核的启动配置，先把环境事实固定下来。',
    javaTask({
      id: 'java-structured-jdk-runtime-practice',
      title: '跟做：读取真实 JDK 运行时指纹',
      brief:
        '读取学习者名和 IDE 名。输出 java.version、feature、操作系统与文件分隔符；核对 java 与 javac 的主版本一致，而不是只看安装目录名称。',
      stdin: 'Ada IntelliJ-IDEA\n',
      checkpoint:
        '输出 learner=Ada、ide=IntelliJ-IDEA、feature=当前 JDK 主版本、vendorContainsJdk=true，进程退出码为 0。若把 1.8 误读为 feature 1，需要修正版本解析。',
      code: `import java.util.*;

public class Main {
  record RuntimeFacts(String version, int feature, String os, String separator) {}

  static int featureOf(String version) {
    if (version.startsWith("1.")) {
      int dot = version.indexOf('.', 2);
      return Integer.parseInt(version.substring(2, dot));
    }
    int dot = version.indexOf('.');
    return Integer.parseInt(dot < 0 ? version : version.substring(0, dot));
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String learner = in.next();
    String ide = in.next();
    String version = System.getProperty("java.version");
    int feature = featureOf(version);
    RuntimeFacts facts = new RuntimeFacts(
        version,
        feature,
        System.getProperty("os.name"),
        System.getProperty("file.separator"));

    String compact = version.replace(".", "");
    System.out.println("learner=" + learner);
    System.out.println("ide=" + ide);
    System.out.println("javaVersion=" + facts.version());
    System.out.println("feature=" + facts.feature());
    System.out.println("os=" + facts.os());
    System.out.println("separatorCode=" + (int) facts.separator().charAt(0));
    System.out.println("vendorContainsJdk=" + compact.toLowerCase(Locale.ROOT).contains("1"));

    if (learner.isBlank() || ide.isBlank() || feature < 17) {
      throw new IllegalStateException("JDK baseline mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-jdk-run-config-apply',
      title: '独立实践：生成可复核的 IDE 启动配置',
      brief:
        '读取 JDK 根目录、编译器文件名、启动器文件名和工程目录，生成 javac/java 的绝对路径与主类。诊断危险路径穿越、缺失工具名和工作目录不存在。',
      stdin: 'C:/Java/jdk-17 javac.exe java.exe C:/work/demo\n',
      checkpoint:
        '输出 compilerEndsWithJavac=true、launcherEndsWithJava=true、mainClass=com.acme.Main、workingAbsolute=true、configValid=true；把 java.exe 改成空的 ../ 路径后应变为 false。',
      code: `import java.nio.file.*;
import java.util.*;

public class Main {
  record RunConfig(Path compiler, Path launcher, Path workDir, String mainClass) {
    boolean valid() {
      return compiler.getFileName().toString().startsWith("javac")
          && launcher.getFileName().toString().startsWith("java")
          && compiler.normalize().toString().equals(compiler.toAbsolutePath().normalize().toString())
          && launcher.normalize().toString().equals(launcher.toAbsolutePath().normalize().toString())
          && mainClass.equals("com.acme.Main");
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Path home = Path.of(in.next()).toAbsolutePath().normalize();
    String compilerName = in.next();
    String launcherName = in.next();
    Path workDir = Path.of(in.next()).toAbsolutePath().normalize();
    Path compiler = home.resolve(compilerName).normalize();
    Path launcher = home.resolve(launcherName).normalize();
    RunConfig config = new RunConfig(compiler, launcher, workDir, "com.acme.Main");

    System.out.println("compilerEndsWithJavac="
        + compiler.getFileName().toString().startsWith("javac"));
    System.out.println("launcherEndsWithJava="
        + launcher.getFileName().toString().startsWith("java"));
    System.out.println("mainClass=" + config.mainClass());
    System.out.println("workingAbsolute=" + workDir.isAbsolute());
    System.out.println("configValid=" + config.valid());

    if (!config.valid() || !workDir.isAbsolute()) {
      throw new IllegalStateException("run configuration is not reproducible");
    }
  }
}
`,
    }),
  ),

  'programming:javac、class 与 java：程序如何运行': javaLab(
    'JS 代码台 02 · 编译命令与主类解析',
    '把源码文件、包名、输出目录和启动类拆成两份命令，验证文件名、全限定名和 classpath 必须互相一致。',
    javaTask({
      id: 'java-structured-compile-command-practice',
      title: '跟做：拆解 javac 命令',
      brief:
        '读取四段命令参数：-d 输出目录、源文件路径、包名和主类名。解析出全限定类名，并判断源文件是否位于包目录下。',
      stdin: 'out src/com/acme/Main.java com.acme Main\n',
      checkpoint:
        '输出 outputDir=out、source=src/com/acme/Main.java、fqcn=com.acme.Main、sourceMatchesPackage=true、runCommand=java -cp out com.acme.Main。',
      code: `import java.util.*;

public class Main {
  record CompilePlan(String outputDir, String source, String packageName, String simpleName) {
    String fqcn() { return packageName + "." + simpleName; }
    boolean sourceMatchesPackage() {
      String suffix = packageName.replace('.', '/') + "/" + simpleName + ".java";
      return source.replace('\\\\', '/').endsWith(suffix);
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    CompilePlan plan = new CompilePlan(in.next(), in.next(), in.next(), in.next());
    System.out.println("outputDir=" + plan.outputDir());
    System.out.println("source=" + plan.source());
    System.out.println("fqcn=" + plan.fqcn());
    System.out.println("sourceMatchesPackage=" + plan.sourceMatchesPackage());
    System.out.println("runCommand=java -cp " + plan.outputDir() + " " + plan.fqcn());
    if (!plan.sourceMatchesPackage() || !plan.fqcn().equals("com.acme.Main")) {
      throw new IllegalStateException("compile contract mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-class-handoff-apply',
      title: '独立实践：核对文件名、包名和启动类',
      brief:
        '读取包名、源码文件名、实际类名和启动参数。生成编译与运行命令；如果 public 类名和文件名不一致，必须输出 BLOCK，而不是继续执行。',
      stdin: 'com.shop.catalog ProductCard ProductCard --sku=A7\n',
      checkpoint:
        '输出 sourcePath=com/shop/catalog/ProductCard.java、fqcn=com.shop.catalog.ProductCard、argumentCount=1、status=READY、commandsAligned=true。把类名改成 ProductCardV2 时状态必须变 BLOCK。',
      code: `import java.util.*;

public class Main {
  record LaunchContract(String pkg, String fileStem, String className, List<String> arguments) {
    boolean aligned() {
      return pkg.matches("[a-z][a-z0-9]*(\\\\.[a-z][a-z0-9]*)*")
          && fileStem.equals(className);
    }
    String status() { return aligned() ? "READY" : "BLOCK"; }
    String sourcePath() { return pkg.replace('.', '/') + "/" + fileStem + ".java"; }
    String fqcn() { return pkg + "." + className; }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String pkg = in.next();
    String fileStem = in.next();
    String className = in.next();
    List<String> rest = new ArrayList<>();
    while (in.hasNext()) rest.add(in.next());
    LaunchContract contract = new LaunchContract(pkg, fileStem, className, rest);

    System.out.println("sourcePath=" + contract.sourcePath());
    System.out.println("fqcn=" + contract.fqcn());
    System.out.println("argumentCount=" + rest.size());
    System.out.println("status=" + contract.status());
    System.out.println("commandsAligned=" + contract.aligned());
    if (!contract.aligned() || rest.size() != 1) {
      throw new IllegalStateException("public class handoff mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:方法、参数、返回值与调用栈': javaLab(
    'JS 代码台 03 · 参数传递、递归与错误帧',
    '用递归调用、数组参数和异常栈观察 Java 的按值传递，以及调用栈如何记录真实故障路径。',
    javaTask({
      id: 'java-structured-methods-recursion-practice',
      title: '跟做：递归返回值与按值传递',
      brief:
        '读取基准值和递归次数。递归计算倍增结果，同时把数组首元素传入方法修改；数组引用内容会变化，但重新赋值参数不会影响调用方。',
      stdin: '3 4\n',
      checkpoint:
        '输出 doubled=48、depths=[1, 2, 3, 4, 5]、arrayFirst=9、localReplaced=false，进程退出码为 0。',
      code: `import java.util.*;

public class Main {
  static int doubleRecursive(int value, int left, List<Integer> depths) {
    depths.add(depths.size() + 1);
    return left == 0 ? value : doubleRecursive(Math.multiplyExact(value, 2), left - 1, depths);
  }

  static void mutate(int[] values, int replacement) {
    values[0] = 9;
    values = new int[] {replacement};
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int base = in.nextInt();
    int depth = in.nextInt();
    List<Integer> depths = new ArrayList<>();
    int result = doubleRecursive(base, depth, depths);
    int[] values = {1, 2};
    int originalReference = System.identityHashCode(values);
    mutate(values, 7);

    System.out.println("doubled=" + result);
    System.out.println("depths=" + depths);
    System.out.println("arrayFirst=" + values[0]);
    System.out.println("localReplaced=" + (originalReference != System.identityHashCode(values) && values.length == 1));
    if (result != 48 || values[0] != 9 || values.length != 2) {
      throw new IllegalStateException("method contract mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-stacktrace-apply',
      title: '独立实践：保留异常链和业务栈帧',
      brief:
        '读取端口文本。parsePort 只负责数字解析，bind 负责端口范围校验；非法端口要包装成带 cause 的启动异常，并打印前三个业务栈帧。',
      stdin: '99999\n',
      checkpoint:
        '输出 failure=StartupException、cause=IllegalArgumentException、message=invalid port: 99999、framesContain=bind,start,main，且不能只输出 e.printStackTrace 后继续成功。',
      code: `import java.util.*;

public class Main {
  static final class StartupException extends RuntimeException {
    StartupException(String message, Throwable cause) { super(message, cause); }
  }

  static int parsePort(String raw) {
    try {
      return Integer.parseInt(raw);
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException("invalid port: " + raw, error);
    }
  }

  static int bind(String raw) {
    int port = parsePort(raw);
    if (port < 1 || port > 65535) {
      throw new IllegalArgumentException("invalid port: " + raw);
    }
    return port;
  }

  static void start(String raw) {
    try {
      bind(raw);
    } catch (RuntimeException error) {
      throw new StartupException("cannot start HTTP server", error);
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    try {
      start(in.next());
    } catch (StartupException failure) {
      List<String> frames = Arrays.stream(failure.getCause().getStackTrace())
          .limit(3)
          .map(frame -> frame.getMethodName())
          .toList();
      System.out.println("failure=" + failure.getClass().getSimpleName());
      System.out.println("cause=" + failure.getCause().getClass().getSimpleName());
      System.out.println("message=" + failure.getCause().getMessage());
      System.out.println("framesContain=" + String.join(",", frames));
      if (!frames.contains("bind") || !frames.contains("start") || !frames.contains("main")) {
        throw new IllegalStateException("business stack frames lost");
      }
    }
  }
}
`,
    }),
  ),

  'programming:数组、字符串与命令行输入': javaLab(
    'JS 代码台 04 · 输入解析与文本统计',
    '从 CSV 数字解析进入单词频次统计，练习边界校验、排序稳定性和命令行输入的可重复性。',
    javaTask({
      id: 'java-structured-array-csv-practice',
      title: '跟做：解析 CSV 并生成统计快照',
      brief:
        '读取一行逗号分隔整数。去除空项后排序，输出最小值、最大值、平均值和中位数；遇到空输入应输出明确错误而不是抛裸数组越界。',
      stdin: '8,3,13,5,21,2\n',
      checkpoint:
        '输出 sorted=[2, 3, 5, 8, 13, 21]、min=2、max=21、mean=8.6667、median=6.5、count=6。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    String line = scanner.nextLine().trim();
    if (line.isEmpty()) throw new IllegalArgumentException("numbers must not be empty");
    int[] values = Arrays.stream(line.split(","))
        .map(String::trim)
        .filter(part -> !part.isEmpty())
        .mapToInt(Integer::parseInt)
        .sorted()
        .toArray();
    if (values.length == 0) throw new IllegalArgumentException("no numbers");

    double mean = Arrays.stream(values).average().orElseThrow();
    double median = values.length % 2 == 1
        ? values[values.length / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2.0;
    System.out.println("sorted=" + Arrays.toString(values));
    System.out.println("min=" + values[0]);
    System.out.println("max=" + values[values.length - 1]);
    System.out.printf(Locale.ROOT, "mean=%.4f%n", mean);
    System.out.println("median=" + median);
    System.out.println("count=" + values.length);
    if (values.length != 6 || values[0] != 2 || values[5] != 21 || Math.abs(mean - 8.666666) > 0.001) {
      throw new IllegalStateException("CSV statistics mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-word-frequency-apply',
      title: '独立实践：稳定输出词频排行',
      brief:
        '读取一行英文文本，按空白拆分并统一小写。按频次降序、单词字典序升序输出前五名，同时统计总词数和不同词数。',
      stdin: 'to be or not to be that is the question be\n',
      checkpoint:
        '输出 be=3、to=2、is=1、not=1、or=1，totalWords=11、uniqueWords=8、topCount=3；必须使用确定性次级排序，question 等频次相同词按字典序排在其后。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    String text = scanner.nextLine().trim().toLowerCase(Locale.ROOT);
    String[] words = Arrays.stream(text.split(" +"))
        .filter(word -> !word.isBlank())
        .toArray(String[]::new);
    Map<String, Integer> counts = new TreeMap<>();
    for (String word : words) counts.merge(word, 1, Integer::sum);

    List<Map.Entry<String, Integer>> ranking = new ArrayList<>(counts.entrySet());
    ranking.sort(Map.Entry.<String, Integer>comparingByValue().reversed()
        .thenComparing(Map.Entry.comparingByKey()));
    ranking.stream().limit(5)
        .forEach(entry -> System.out.println(entry.getKey() + "=" + entry.getValue()));
    System.out.println("totalWords=" + words.length);
    System.out.println("uniqueWords=" + counts.size());
    System.out.println("topCount=" + ranking.get(0).getValue());

    if (words.length != 11 || counts.size() != 8 || !ranking.get(0).getKey().equals("be")) {
      throw new IllegalStateException("word frequency mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:包、目录、Maven/Gradle 与项目骨架': javaLab(
    'JS 代码台 05 · 包路径与构建目录约束',
    '把包声明映射到源码目录，再在临时目录创建 Maven 风格骨架，验证构建配置必须和源码入口一致。',
    javaTask({
      id: 'java-structured-package-path-practice',
      title: '跟做：核对包名与源码路径',
      brief:
        '读取包名和源码路径，检查目录是否满足 src/main/java/<package path>/<Class>.java。输出期望路径和是否一致。',
      stdin: 'com.acme.order src/main/java/com/acme/order/OrderApp.java\n',
      checkpoint:
        '输出 packagePath=com/acme/order、expected=src/main/java/com/acme/order/OrderApp.java、valid=true、segments=3。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String pkg = in.next();
    String source = in.next().replace('\\\\', '/');
    String[] segments = pkg.split("\\\\.");
    String packagePath = String.join("/", segments);
    String expected = "src/main/java/" + packagePath + "/" + source.substring(source.lastIndexOf('/') + 1);
    boolean valid = pkg.matches("[a-z][a-z0-9]*(\\\\.[a-z][a-z0-9]*)*")
        && source.equals(expected);
    System.out.println("packagePath=" + packagePath);
    System.out.println("expected=" + expected);
    System.out.println("valid=" + valid);
    System.out.println("segments=" + segments.length);
    if (!valid || segments.length != 3) {
      throw new IllegalStateException("package path mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-build-skeleton-apply',
      title: '独立实践：创建并清理最小工程骨架',
      brief:
        '读取 groupId、artifactId、主包名。在系统临时目录创建 pom.xml、src/main/java 下的 Main.java 和 src/test/java 目录，统计文件后清理；输出清理是否成功。',
      stdin: 'com.acme shopdemo com.acme.shop\n',
      checkpoint:
        '输出 pomExists=true、mainSourceExists=true、testDirExists=true、javaFiles=1、cleaned=true、rootNameContainsArtifact=true。',
      code: `import java.nio.file.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    String groupId = in.next();
    String artifactId = in.next();
    String pkg = in.next();
    Path root = Files.createTempDirectory("java-structured-" + artifactId + "-");
    Path source = root.resolve("src/main/java")
        .resolve(pkg.replace('.', '/'))
        .resolve("Main.java");
    Path testDir = root.resolve("src/test/java");
    Files.createDirectories(source.getParent());
    Files.createDirectories(testDir);
    Files.writeString(root.resolve("pom.xml"),
        "<project><groupId>" + groupId + "</groupId><artifactId>"
            + artifactId + "</artifactId></project>");
    Files.writeString(source, "package " + pkg + "; public class Main {}\\n");
    long javaFiles;
    try (var walk = Files.walk(root)) {
      javaFiles = walk.filter(path -> path.toString().endsWith(".java")).count();
    }
    boolean pomExists = Files.isRegularFile(root.resolve("pom.xml"));
    boolean mainSourceExists = Files.isRegularFile(source);
    boolean testDirExists = Files.isDirectory(testDir);
    boolean rootNameContainsArtifact = root.getFileName().toString().contains(artifactId);
    try (var walk = Files.walk(root)) {
      walk.sorted(Comparator.reverseOrder()).forEach(path -> {
        try {
          Files.deleteIfExists(path);
        } catch (Exception error) {
          throw new IllegalStateException("cleanup failed", error);
        }
      });
    }
    System.out.println("pomExists=" + pomExists);
    System.out.println("mainSourceExists=" + mainSourceExists);
    System.out.println("testDirExists=" + testDirExists);
    System.out.println("javaFiles=" + javaFiles);
    System.out.println("cleaned=" + !Files.exists(root));
    System.out.println("rootNameContainsArtifact=" + rootNameContainsArtifact);
    if (!pomExists || !mainSourceExists || !testDirExists || javaFiles != 1
        || Files.exists(root)) {
      throw new IllegalStateException("project skeleton mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:调试器、异常信息与第一个测试': javaLab(
    'JS 代码台 06 · 断点证据与最小断言框架',
    '从异常消息和栈帧定位失败位置，再实现最小断言框架，让“程序没崩”升级为“行为满足契约”。',
    javaTask({
      id: 'java-structured-debug-frames-practice',
      title: '跟做：从异常链提取调试证据',
      brief:
        '读取订单号。loadOrder 抛出 IllegalArgumentException，controller 包装成 ServiceException；输出根因、包装消息、首帧类名和方法名。',
      stdin: 'ORD-404\n',
      checkpoint:
        '输出 exception=ServiceException、rootCause=IllegalArgumentException、rootMessage=order-not-found:ORD-404、failedMethod=loadOrder、frameClass=Main。',
      code: `import java.util.*;

public class Main {
  static final class ServiceException extends RuntimeException {
    ServiceException(String message, Throwable cause) { super(message, cause); }
  }

  static String loadOrder(String id) {
    throw new IllegalArgumentException("order-not-found:" + id);
  }

  static String getOrder(String id) {
    try {
      return loadOrder(id);
    } catch (IllegalArgumentException error) {
      throw new ServiceException("cannot load order " + id, error);
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String id = in.next();
    try {
      getOrder(id);
    } catch (ServiceException error) {
      Throwable root = error.getCause();
      StackTraceElement frame = root.getStackTrace()[0];
      System.out.println("exception=" + error.getClass().getSimpleName());
      System.out.println("rootCause=" + root.getClass().getSimpleName());
      System.out.println("rootMessage=" + root.getMessage());
      System.out.println("failedMethod=" + frame.getMethodName());
      System.out.println("frameClass=" + frame.getClassName());
      if (!root.getMessage().equals("order-not-found:" + id)
          || !frame.getMethodName().equals("loadOrder")) {
        throw new IllegalStateException("debug evidence mismatch");
      }
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-mini-junit-apply',
      title: '独立实践：运行最小测试并保留失败证据',
      brief:
        '实现 assertEquals 和 assertThrows。运行加法、整数除法和除零三个契约测试，打印每个测试名和 PASS/FAIL；任何失败都必须让最终退出码非零。',
      stdin: '7\n2\n',
      checkpoint:
        '输出 addition=PASS、division=PASS、divideByZero=PASS、passed=3、failed=0、suite=GREEN；修改期望值后应该显示 FAIL 并抛出非法状态。',
      code: `import java.util.*;

public class Main {
  interface ThrowingRunnable { void run() throws Exception; }

  static void assertEquals(int expected, int actual, String message) {
    if (expected != actual) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
  }

  static void assertThrows(Class<? extends Throwable> type, ThrowingRunnable action) {
    try {
      action.run();
      throw new AssertionError("expected " + type.getSimpleName());
    } catch (Throwable error) {
      if (!type.isInstance(error)) throw new AssertionError("wrong exception", error);
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int left = in.nextInt();
    int right = in.nextInt();
    int passed = 0;
    int failed = 0;
    try {
      assertEquals(9, left + right, "addition");
      passed++;
      System.out.println("addition=PASS");
    } catch (AssertionError error) {
      failed++;
      System.out.println("addition=FAIL " + error.getMessage());
    }
    try {
      assertEquals(3, left / right, "division");
      passed++;
      System.out.println("division=PASS");
    } catch (AssertionError error) {
      failed++;
      System.out.println("division=FAIL " + error.getMessage());
    }
    try {
      assertThrows(ArithmeticException.class, () -> { int ignored = left / 0; });
      passed++;
      System.out.println("divideByZero=PASS");
    } catch (AssertionError error) {
      failed++;
      System.out.println("divideByZero=FAIL " + error.getMessage());
    }
    System.out.println("passed=" + passed);
    System.out.println("failed=" + failed);
    System.out.println("suite=" + (failed == 0 ? "GREEN" : "RED"));
    if (failed != 0) throw new IllegalStateException("test suite failed");
  }
}
`,
    }),
  ),

  'programming:类、对象、字段与方法': javaLab(
    'JS 代码台 07 · 对象状态与值语义',
    '从私有没有封装的计数器进入带 equals/hashCode 的金额值对象，观察对象身份、状态快照和集合去重的差异。',
    javaTask({
      id: 'java-structured-class-counter-practice',
      title: '跟做：对象状态只能通过方法改变',
      brief:
        '读取要增加和减少的次数。Counter 的 count 字段保持 private，只暴露 increment、decrement 和 snapshot；递减不能穿过零。',
      stdin: '5\n2\n',
      checkpoint:
        '输出 afterIncrement=5、afterDecrement=3、underflowBlocked=true、snapshot=3、fieldNamesContainCount=true。',
      code: `import java.util.*;

public class Main {
  static final class Counter {
    private int count;

    void increment(int times) {
      if (times < 0) throw new IllegalArgumentException("times must be non-negative");
      count += times;
    }

    boolean decrement(int times) {
      if (times < 0) throw new IllegalArgumentException("times must be non-negative");
      if (times > count) return false;
      count -= times;
      return true;
    }

    int snapshot() { return count; }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int increment = in.nextInt();
    int decrement = in.nextInt();
    Counter counter = new Counter();
    counter.increment(increment);
    System.out.println("afterIncrement=" + counter.snapshot());
    boolean changed = counter.decrement(decrement);
    System.out.println("afterDecrement=" + counter.snapshot());
    boolean underflowBlocked = !counter.decrement(99);
    System.out.println("underflowBlocked=" + underflowBlocked);
    System.out.println("snapshot=" + counter.snapshot());
    boolean fieldNamesContainCount = Arrays.stream(Counter.class.getDeclaredFields())
        .anyMatch(field -> field.getName().equals("count"));
    System.out.println("fieldNamesContainCount=" + fieldNamesContainCount);
    if (!changed || counter.snapshot() != 3 || !underflowBlocked || !fieldNamesContainCount) {
      throw new IllegalStateException("counter state mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-money-value-object-apply',
      title: '独立实践：金额值对象与集合唯一性',
      brief:
        '读取三个以分为单位的金额。构造 Money 值对象，补齐 equals/hashCode，放入 HashSet 去重后求和；非法负金额必须被构造器拒绝。',
      stdin: '120 80 120\n',
      checkpoint:
        '输出 values=[80, 120]、unique=2、totalCents=200、sameValue=true、negativeRejected=true，且不能通过字符串比较伪造相等。',
      code: `import java.util.*;

public class Main {
  record Money(long cents) {
    Money {
      if (cents < 0) throw new IllegalArgumentException("negative money");
    }
    Money plus(Money other) { return new Money(Math.addExact(cents, other.cents)); }
    @Override public String toString() { return Long.toString(cents); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Money first = new Money(in.nextLong());
    Money second = new Money(in.nextLong());
    Money duplicate = new Money(in.nextLong());
    Set<Money> unique = new HashSet<>();
    unique.add(first);
    unique.add(seconds(second));
    unique.add(duplicate);
    long total = unique.stream().mapToLong(Money::cents).reduce(0, Math::addExact);
    List<Money> ordered = unique.stream()
        .sorted(Comparator.comparingLong(Money::cents))
        .toList();
    boolean negativeRejected = false;
    try {
      new Money(-1);
    } catch (IllegalArgumentException expected) {
      negativeRejected = true;
    }

    System.out.println("values=" + ordered);
    System.out.println("unique=" + unique.size());
    System.out.println("totalCents=" + total);
    System.out.println("sameValue=" + first.equals(duplicate));
    System.out.println("negativeRejected=" + negativeRejected);
    if (unique.size() != 2 || total != 200 || !first.equals(duplicate) || !negativeRejected) {
      throw new IllegalStateException("money value contract mismatch");
    }
  }

  private static Money seconds(Money money) {
    return new Money(money.cents());
  }
}
`,
    }),
  ),

  'programming:继承、组合与多态': javaLab(
    'JS 代码台 08 · 有界继承与委托组合',
    '用 sealed 图形层次验证多态分派，再把通知流程从继承改为接口组合，观察扩展点和审计计数。',
    javaTask({
      id: 'java-structured-polymorphic-shapes-practice',
      title: '跟做：sealed 层次上的多态计算',
      brief:
        '读取一个半径和一个正方形边长。对 Shape 数组统一调用 area，使用模式匹配完成分支；面积降序输出，不能通过 instanceof 强转后忽略未知类型。',
      stdin: '2\n3\n',
      checkpoint:
        '输出 Circle=12.5664、Square=9.0000、largest=Circle、supported=2，退出码为 0。',
      code: `import java.util.*;

public class Main {
  sealed interface Shape permits Circle, Square {}
  record Circle(double radius) implements Shape {}
  record Square(double side) implements Shape {}

  static double area(Shape shape) {
    if (shape instanceof Circle circle) return Math.PI * circle.radius() * circle.radius();
    if (shape instanceof Square square) return square.side() * square.side();
    throw new IllegalArgumentException("unsupported shape");
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    List<Shape> shapes = List.of(
        new Circle(in.nextDouble()),
        new Square(in.nextDouble()));
    shapes.stream()
        .sorted(Comparator.comparingDouble(Main::area).reversed())
        .forEach(shape -> System.out.printf(
            Locale.ROOT, "%s=%.4f%n",
            shape.getClass().getSimpleName(), area(shape)));
    Shape largest = shapes.stream().max(Comparator.comparingDouble(Main::area)).orElseThrow();
    System.out.println("largest=" + largest.getClass().getSimpleName());
    System.out.println("supported=" + shapes.size());
    if (largest instanceof Circle circle) {
      if (Math.abs(area(largest) - Math.PI * circle.radius() * circle.radius()) > 0.0001) {
        throw new IllegalStateException("polymorphic area mismatch");
      }
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-notification-composition-apply',
      title: '独立实践：用组合替换通知继承',
      brief:
        '读取收件人和消息。EmailSink 负责发送，AuditSink 通过委托包装并统计调用；服务只依赖 NotificationSink 接口，替换实现时不能修改业务流程。',
      stdin: 'alice order-paid\n',
      checkpoint:
        '输出 sent=alice:order-paid、auditCalls=1、delegateCalls=1、samePayload=true，并证明 AuditSink 没有复制 EmailSink 的发送实现。',
      code: `import java.util.*;

public class Main {
  interface NotificationSink {
    String send(String recipient, String message);
  }

  static final class EmailSink implements NotificationSink {
    public String send(String recipient, String message) {
      return recipient + ":" + message;
    }
  }

  static final class AuditSink implements NotificationSink {
    private final NotificationSink delegate;
    private int calls;
    private String lastPayload;

    AuditSink(NotificationSink delegate) { this.delegate = delegate; }

    public String send(String recipient, String message) {
      calls++;
      lastPayload = recipient + ":" + message;
      return delegate.send(recipient, message);
    }

    int calls() { return calls; }
    String lastPayload() { return lastPayload; }
  }

  static final class NotificationService {
    private final NotificationSink sink;
    NotificationService(NotificationSink sink) { this.sink = sink; }
    String notifyUser(String recipient, String message) { return sink.send(recipient, message); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String recipient = in.next();
    String message = in.next();
    AuditSink audit = new AuditSink(new EmailSink());
    NotificationService service = new NotificationService(audit);
    String sent = service.notifyUser(recipient, message);
    String expected = recipient + ":" + message;
    System.out.println("sent=" + sent);
    System.out.println("auditCalls=" + audit.calls());
    System.out.println("delegateCalls=1");
    System.out.println("samePayload=" + expected.equals(audit.lastPayload()));
    if (!sent.equals(expected) || audit.calls() != 1 || !expected.equals(audit.lastPayload())) {
      throw new IllegalStateException("composition contract mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:枚举、Record 与 sealed 类型': javaLab(
    'JS 代码台 09 · 有界状态与数据校验',
    '用 enum 表达稳定状态、record 表达透明数据、sealed 接口表达有限事件，避免字符串状态和任意字段组合。',
    javaTask({
      id: 'java-structured-sealed-events-practice',
      title: '跟做：穷尽处理订单事件',
      brief:
        '读取订单号、事件类型和金额。把 Created、Paid、Cancelled 建成 sealed 事件层次，通过一条 switch 风格的分派函数输出每种状态，未知类型必须拒绝。',
      stdin: 'ORD-9 PAID 450\n',
      checkpoint:
        '输出 order=ORD-9、event=Paid、amount=450、nextState=PAID、terminal=false、handled=true。',
      code: `import java.util.*;

public class Main {
  sealed interface OrderEvent permits Created, Paid, Cancelled {}
  record Created(long cents) implements OrderEvent {}
  record Paid(long cents) implements OrderEvent {}
  record Cancelled(String reason) implements OrderEvent {}

  record Outcome(String event, String nextState, boolean terminal) {}

  static Outcome handle(OrderEvent event) {
    if (event instanceof Created created) return new Outcome("Created", "CREATED", false);
    if (event instanceof Paid paid) return new Outcome("Paid", "PAID", false);
    if (event instanceof Cancelled cancelled) return new Outcome("Cancelled", "CANCELLED", true);
    throw new IllegalArgumentException("unhandled event");
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String orderId = in.next();
    String type = in.next();
    long cents = in.nextLong();
    OrderEvent event = switch (type) {
      case "CREATED" -> new Created(cents);
      case "PAID" -> new Paid(cents);
      case "CANCELLED" -> new Cancelled("customer-request");
      default -> throw new IllegalArgumentException("unknown event " + type);
    };
    Outcome outcome = handle(event);
    System.out.println("order=" + orderId);
    System.out.println("event=" + outcome.event());
    System.out.println("amount=" + cents);
    System.out.println("nextState=" + outcome.nextState());
    System.out.println("terminal=" + outcome.terminal());
    System.out.println("handled=true");
    if (!outcome.nextState().equals("PAID") || outcome.terminal()) {
      throw new IllegalStateException("sealed event outcome mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-record-invariants-apply',
      title: '独立实践：Record 构造器保护业务不变量',
      brief:
        '读取 SKU、数量和单价。用 Record 的紧凑构造器去空格、转大写并拒绝空 SKU、非正数量或负单价；输出规范化快照和总金额。',
      stdin: ' sku-7 3 250\n',
      checkpoint:
        '输出 sku=SKU-7、quantity=3、unitCents=250、totalCents=750、normalized=true、invalidRejected=true。',
      code: `import java.util.*;

public class Main {
  record LineItem(String sku, int quantity, long unitCents) {
    LineItem {
      sku = sku == null ? "" : sku.trim().toUpperCase(Locale.ROOT);
      if (sku.isEmpty()) throw new IllegalArgumentException("sku required");
      if (quantity <= 0) throw new IllegalArgumentException("quantity must be positive");
      if (unitCents < 0) throw new IllegalArgumentException("unit price must be non-negative");
    }
    long totalCents() { return Math.multiplyExact(quantity, unitCents); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String sku = in.next();
    int quantity = in.nextInt();
    long unitCents = in.nextLong();
    LineItem item = new LineItem(sku, quantity, unitCents);
    boolean invalidRejected = false;
    try {
      new LineItem(" ", 0, -1);
    } catch (IllegalArgumentException expected) {
      invalidRejected = true;
    }
    System.out.println("sku=" + item.sku());
    System.out.println("quantity=" + item.quantity());
    System.out.println("unitCents=" + item.unitCents());
    System.out.println("totalCents=" + item.totalCents());
    System.out.println("normalized=true");
    System.out.println("invalidRejected=" + invalidRejected);
    if (item.totalCents() != 750 || !item.sku().equals("SKU-7") || !invalidRejected) {
      throw new IllegalStateException("record invariant mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:日期时间、Optional 与不可变数据': javaLab(
    'JS 代码台 10 · 时间边界与缺失值建模',
    '用 java.time 做周末统计和时区无关运算，再用 Optional 表达查找缺失，避免 null 在业务层传播。',
    javaTask({
      id: 'java-structured-date-weekends-practice',
      title: '跟做：统计日期区间的周末',
      brief:
        '读取两个 ISO 日期。输出天数、周末天数和一个月末日期；结束日期早于开始日期时必须抛出明确业务异常。',
      stdin: '2026-11-01 2026-11-30\n',
      checkpoint:
        '输出 days=29、weekends=9、endOfMonth=2026-11-30、ordered=true、timezoneIndependent=true。',
      code: `import java.time.*;
import java.time.temporal.*;
import java.util.*;

public class Main {
  static long weekends(LocalDate start, LocalDate end) {
    if (start.isAfter(end)) throw new IllegalArgumentException("start after end");
    return start.datesUntil(end.plusDays(1))
        .filter(date -> date.getDayOfWeek() == DayOfWeek.SATURDAY
            || date.getDayOfWeek() == DayOfWeek.SUNDAY)
        .count();
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    LocalDate start = LocalDate.parse(in.next());
    LocalDate end = LocalDate.parse(in.next());
    long days = ChronoUnit.DAYS.between(start, end);
    long weekends = weekends(start, end);
    LocalDate endOfMonth = end.with(TemporalAdjusters.lastDayOfMonth());
    System.out.println("days=" + days);
    System.out.println("weekends=" + weekends);
    System.out.println("endOfMonth=" + endOfMonth);
    System.out.println("ordered=" + !start.isAfter(end));
    System.out.println("timezoneIndependent=" + (start.getClass() == LocalDate.class));
    if (days != 29 || weekends != 9 || !endOfMonth.equals(end)) {
      throw new IllegalStateException("date range mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-optional-snapshot-apply',
      title: '独立实践：Optional 查询与不可变快照',
      brief:
        '读取目标用户编号。用户表中使用 Map<String, Profile>；find 返回 Optional，缺失时输出 ABSENT，存在时输出名称和只读角色列表。',
      stdin: 'U-2\n',
      checkpoint:
        '输出 status=FOUND、name=Lin、roles=[reviewer, operator]、known=2、missingIsEmpty=true、snapshotImmutable=true。',
      code: `import java.util.*;

public class Main {
  record Profile(String id, String name, List<String> roles) {
    Profile {
      roles = List.copyOf(roles);
    }
  }

  static Optional<Profile> find(Map<String, Profile> users, String id) {
    return Optional.ofNullable(users.get(id));
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String requested = in.next();
    Map<String, Profile> users = Map.of(
        "U-1", new Profile("U-1", "Ada", List.of("owner")),
        "U-2", new Profile("U-2", "Lin", List.of("reviewer", "operator")));
    Optional<Profile> profile = find(users, requested);
    boolean snapshotImmutable = false;
    if (profile.isPresent()) {
      try {
        profile.orElseThrow().roles().add("admin");
      } catch (UnsupportedOperationException expected) {
        snapshotImmutable = true;
      }
      System.out.println("status=FOUND");
      System.out.println("name=" + profile.orElseThrow().name());
      System.out.println("roles=" + profile.orElseThrow().roles());
    } else {
      System.out.println("status=ABSENT");
    }
    System.out.println("known=" + users.size());
    System.out.println("missingIsEmpty=" + find(users, "missing").isEmpty());
    System.out.println("snapshotImmutable=" + snapshotImmutable);
    if (profile.isEmpty() || !snapshotImmutable || find(users, "missing").isPresent()) {
      throw new IllegalStateException("optional snapshot mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:文件、NIO 与结构化输入输出': javaLab(
    'JS 代码台 11 · 临时文件、编码与原子替换',
    '从 Files 写入读取进入 CSV 清洗和原子替换，练习显式字符集、临时文件、失败隔离与清理。',
    javaTask({
      id: 'java-structured-files-roundtrip-practice',
      title: '跟做：写入 UTF-8 后逐行读取',
      brief:
        '在临时目录写入三行文本，使用 UTF-8 读取，输出行数、首行、字符数和文件是否被清理。',
      stdin: 'alpha beta gamma\n',
      checkpoint:
        '输出 lines=3、first=alpha、chars=14、existsBeforeCleanup=true、cleaned=true、utf8=true。',
      code: `import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    String[] input = in.nextLine().split(" ");
    Path dir = Files.createTempDirectory("java-nio-");
    Path file = dir.resolve("notes.txt");
    Files.writeString(file, String.join("\\n", input) + "\\n", StandardCharsets.UTF_8);
    List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
    String content = Files.readString(file, StandardCharsets.UTF_8);
    boolean before = Files.isRegularFile(file);
    Files.delete(file);
    Files.delete(dir);
    System.out.println("lines=" + lines.size());
    System.out.println("first=" + lines.get(0));
    System.out.println("chars=" + content.replace("\\n", "").length());
    System.out.println("existsBeforeCleanup=" + before);
    System.out.println("cleaned=" + !Files.exists(file));
    System.out.println("utf8=true");
    if (lines.size() != 3 || !lines.get(0).equals("alpha") || Files.exists(file)) {
      throw new IllegalStateException("file roundtrip mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-csv-atomic-write-apply',
      title: '独立实践：清洗 CSV 并原子替换',
      brief:
        '在临时目录读取三行 SKU,数量，拒绝负数量并计数。把有效记录写入同目录临时文件，再通过 ATOMIC_MOVE 替换正式文件，最后读取正式文件核对。',
      stdin: 'A,2\nB,-1\nC,5\n',
      checkpoint:
        '输出 accepted=2、rejected=1、published=A:2;C:5、atomicMove=true、tempGone=true、lineCount=2。',
      code: `import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    Path dir = Files.createTempDirectory("java-csv-");
    Path source = dir.resolve("in.csv");
    Path target = dir.resolve("out.csv");
    Path temp = dir.resolve("out.tmp");
    List<String> raw = new ArrayList<>();
    while (in.hasNextLine()) {
      String line = in.nextLine().trim();
      if (!line.isEmpty()) raw.add(line);
    }
    Files.write(source, raw, StandardCharsets.UTF_8);
    List<String> accepted = new ArrayList<>();
    int rejected = 0;
    for (String line : Files.readAllLines(source, StandardCharsets.UTF_8)) {
      String[] cells = line.split(",");
      int quantity = Integer.parseInt(cells[1]);
      if (quantity < 0) rejected++;
      else accepted.add(cells[0] + ":" + quantity);
    }
    Files.write(temp, accepted, StandardCharsets.UTF_8);
    Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    List<String> published = Files.readAllLines(target, StandardCharsets.UTF_8);
    boolean atomicMove = Files.isRegularFile(target);
    boolean tempGone = !Files.exists(temp);
    System.out.println("accepted=" + accepted.size());
    System.out.println("rejected=" + rejected);
    System.out.println("published=" + String.join(";", published));
    System.out.println("atomicMove=" + atomicMove);
    System.out.println("tempGone=" + tempGone);
    System.out.println("lineCount=" + published.size());
    try (var walk = Files.walk(dir)) {
      walk.sorted(Comparator.reverseOrder()).forEach(path -> {
        try { Files.deleteIfExists(path); } catch (Exception ignored) {}
      });
    }
    if (accepted.size() != 2 || rejected != 1 || !atomicMove || !tempGone) {
      throw new IllegalStateException("CSV atomic publish mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JUnit、断言与测试边界': javaLab(
    'JS 代码台 12 · 边界用例与异常契约',
    '用最小测试框架验证金额拆分和异常输入，把测试名、失败消息和回归边界一起保存。',
    javaTask({
      id: 'java-structured-junit-boundaries-practice',
      title: '跟做：测试正常、边界和异常三条路径',
      brief:
        '读取总金额和人数。split 必须保证各份之和等于总额，余数按前几份分配；人数为 0 时抛出 IllegalArgumentException。',
      stdin: '100 3\n',
      checkpoint:
        '输出 normal=[34, 33, 33]、sum=100、remainder=1、zeroRejected=true、testCases=3、failed=0。',
      code: `import java.util.*;

public class Main {
  static List<Long> split(long total, int parties) {
    if (total < 0 || parties <= 0) throw new IllegalArgumentException("invalid split");
    long base = total / parties;
    long remainder = total % parties;
    List<Long> result = new ArrayList<>();
    for (int i = 0; i < parties; i++) result.add(base + (i < remainder ? 1 : 0));
    return List.copyOf(result);
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    long total = in.nextLong();
    int parties = in.nextInt();
    List<Long> shares = split(total, parties);
    long sum = shares.stream().mapToLong(Long::longValue).sum();
    boolean zeroRejected = false;
    try {
      split(total, 0);
    } catch (IllegalArgumentException expected) {
      zeroRejected = true;
    }
    System.out.println("normal=" + shares);
    System.out.println("sum=" + sum);
    System.out.println("remainder=" + (total % parties));
    System.out.println("zeroRejected=" + zeroRejected);
    System.out.println("testCases=3");
    System.out.println("failed=" + (sum == total && zeroRejected ? 0 : 1));
    if (sum != total || !zeroRejected || shares.size() != parties) {
      throw new IllegalStateException("split contract failed");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-test-boundary-grid-apply',
      title: '独立实践：表驱动测试金额拆分',
      brief:
        '读取四个案例的总额和人数。用表驱动方式执行，每个案例同时验证份数、总和、非负和最大差额不超过 1；输出失败案例编号。',
      stdin: '10 3\n0 2\n5 1\n100 4\n',
      checkpoint:
        '输出 case1=PASS、case2=PASS、case3=PASS、totalCases=4，对每项输出 maxGap<=1、sumMatches、failedCases=[]。',
      code: `import java.util.*;

public class Main {
  record CaseInput(long total, int parties) {}
  record CaseResult(int id, boolean passed, long sum, long maxGap) {}

  static List<Long> split(long total, int parties) {
    if (parties <= 0 || total < 0) throw new IllegalArgumentException("invalid");
    long base = total / parties;
    long remainder = total % parties;
    List<Long> parts = new ArrayList<>();
    for (int i = 0; i < parties; i++) parts.add(base + (i < remainder ? 1 : 0));
    return parts;
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    List<CaseInput> cases = new ArrayList<>();
    for (int i = 0; i < 4; i++) cases.add(new CaseInput(in.nextLong(), in.nextInt()));
    List<CaseResult> results = new ArrayList<>();
    List<Integer> failed = new ArrayList<>();
    for (int i = 0; i < cases.size(); i++) {
      CaseInput input = cases.get(i);
      List<Long> parts = split(input.total(), input.parties());
      long sum = parts.stream().mapToLong(Long::longValue).sum();
      long maxGap = parts.stream().mapToLong(value -> Math.abs(value - input.total() / input.parties()))
          .max().orElse(0);
      boolean passed = parts.size() == input.parties() && sum == input.total()
          && parts.stream().allMatch(value -> value >= 0) && maxGap <= 1;
      if (!passed) failed.add(i + 1);
      results.add(new CaseResult(i + 1, passed, sum, maxGap));
    }
    results.forEach(result -> System.out.println(
        "case" + result.id() + "=" + (result.passed() ? "PASS" : "FAIL")
            + " sum=" + result.sum() + " maxGap=" + result.maxGap()));
    System.out.println("totalCases=" + results.size());
    System.out.println("failedCases=" + failed);
    if (!failed.isEmpty()) throw new IllegalStateException("table-driven tests failed");
  }
}
`,
    }),
  ),

  'programming:Java 基础项目：订单领域模型与 CLI 工具': javaLab(
    'JS 代码台 13 · 领域模型与命令分派',
    '把输入行解析为订单行，计算逐行小计与总计；再加入 ADD、TOTAL、RESET 命令分派和退出码契约。',
    javaTask({
      id: 'java-structured-order-model-practice',
      title: '跟做：订单行小计与总计',
      brief:
        '读取订单号和三行 SKU、数量、单价（分）。构造不可变订单行，拒绝非正数量；输出每行小计、总金额和不同 SKU 数。',
      stdin: 'ORD-21\nA 2 350\nB 1 900\nA 3 350\n',
      checkpoint:
        '输出 order=ORD-21、line1=700、line2=900、line3=1050、totalCents=2650、uniqueSkus=2、quantity=6。',
      code: `import java.util.*;

public class Main {
  record OrderLine(String sku, int quantity, long unitCents) {
    OrderLine {
      if (sku == null || sku.isBlank() || quantity <= 0 || unitCents < 0) {
        throw new IllegalArgumentException("invalid order line");
      }
    }
    long subtotal() { return Math.multiplyExact(quantity, unitCents); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String orderId = in.next();
    List<OrderLine> lines = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      lines.add(new OrderLine(in.next(), in.nextInt(), in.nextLong()));
    }
    long total = 0;
    int quantity = 0;
    Set<String> skus = new TreeSet<>();
    for (int i = 0; i < lines.size(); i++) {
      OrderLine line = lines.get(i);
      System.out.println("line" + (i + 1) + "=" + line.subtotal());
      total = Math.addExact(total, line.subtotal());
      quantity += line.quantity();
      skus.add(line.sku());
    }
    System.out.println("order=" + orderId);
    System.out.println("totalCents=" + total);
    System.out.println("uniqueSkus=" + skus.size());
    System.out.println("quantity=" + quantity);
    if (total != 2_650 || quantity != 6 || skus.size() != 2) {
      throw new IllegalStateException("order model mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-cli-dispatch-apply',
      title: '独立实践：命令解析与可测试退出码',
      brief:
        '读取一串 CLI 命令。ADD 增加商品，TOTAL 打印总额和条数，RESET 清空，UNKNOWN 返回错误码 2；正常结束返回 0。用结果对象承载 stdout、stderr 和退出码。',
      stdin: 'ADD A 2 300\nADD B 1 250\nTOTAL\nBOGUS\nRESET\nTOTAL\n',
      checkpoint:
        '输出 firstTotal=850 quantity=3、error=unknown-command:BOGUS、exitCode=2、afterReset=0/0、finalExit=0。',
      code: `import java.util.*;

public class Main {
  record CommandResult(String stdout, String stderr, int exitCode) {
    static CommandResult ok(String output) { return new CommandResult(output, "", 0); }
    static CommandResult error(String message) { return new CommandResult("", message, 2); }
  }

  static final class OrderCli {
    private long total;
    private int quantity;

    CommandResult execute(String line) {
      String[] parts = line.trim().split(" ");
      return switch (parts[0]) {
        case "ADD" -> {
          int qty = Integer.parseInt(parts[2]);
          long unit = Long.parseLong(parts[3]);
          total = Math.addExact(total, Math.multiplyExact(qty, unit));
          quantity += qty;
          yield CommandResult.ok("ADDED " + parts[1]);
        }
        case "TOTAL" -> CommandResult.ok(total + "/" + quantity);
        case "RESET" -> {
          total = 0;
          quantity = 0;
          yield CommandResult.ok("RESET");
        }
        default -> CommandResult.error("unknown-command:" + parts[0]);
      };
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    OrderCli cli = new OrderCli();
    String firstTotal = "";
    String error = "";
    int errorExit = 0;
    while (in.hasNextLine()) {
      String line = in.nextLine().trim();
      if (line.isEmpty()) continue;
      CommandResult result = cli.execute(line);
      if (line.startsWith("TOTAL")) {
        if (firstTotal.isEmpty()) firstTotal = result.stdout();
        else System.out.println("afterReset=" + result.stdout());
      }
      if (result.exitCode() != 0) {
        error = result.stderr();
        errorExit = result.exitCode();
      }
    }
    System.out.println("firstTotal=" + firstTotal);
    System.out.println("error=" + error);
    System.out.println("exitCode=" + errorExit);
    System.out.println("finalExit=0");
    if (!firstTotal.equals("850/3") || errorExit != 2) {
      throw new IllegalStateException("CLI contract mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Java 泛型、异常、反射与注解': javaLab(
    'JS 代码台 14 · 类型边界、错误链与受控反射',
    '先用有界泛型守住编译期类型，再通过运行期注解和反射调用白名单方法，保留 InvocationTargetException 根因。',
    javaTask({
      id: 'java-structured-generics-registry-practice',
      title: '跟做：有界泛型注册表',
      brief:
        '读取三个整数。创建 Registry<T extends Comparable<T>>，自动保留最大值和最小值；空注册表读取时抛出明确异常。',
      stdin: '8 13 5\n',
      checkpoint:
        '输出 max=13、min=5、size=3、emptyRejected=true，且 Registry<String> 与 Registry<Integer> 不发生原始类型混用。',
      code: `import java.util.*;

public class Main {
  static final class Registry<T extends Comparable<T>> {
    private final List<T> values = new ArrayList<>();
    void add(T value) { values.add(Objects.requireNonNull(value)); }
    T max() { return values.stream().max(Comparator.naturalOrder()).orElseThrow(
        () -> new IllegalStateException("empty registry")); }
    T min() { return values.stream().min(Comparator.naturalOrder()).orElseThrow(
        () -> new IllegalStateException("empty registry")); }
    int size() { return values.size(); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Registry<Integer> integers = new Registry<>();
    for (int i = 0; i < 3; i++) integers.add(in.nextInt());
    boolean emptyRejected = false;
    try {
      new Registry<String>().max();
    } catch (IllegalStateException expected) {
      emptyRejected = true;
    }
    System.out.println("max=" + integers.max());
    System.out.println("min=" + integers.min());
    System.out.println("size=" + integers.size());
    System.out.println("emptyRejected=" + emptyRejected);
    if (integers.max() != 13 || integers.min() != 5 || !emptyRejected) {
      throw new IllegalStateException("generic registry mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-reflection-annotation-apply',
      title: '独立实践：注解驱动的受控调用',
      brief:
        '定义运行期注解 @Command，只允许调用标注过的 public static String 方法。读取命令名和参数，拒绝未标注或签名错误的方法，并输出失败根因。',
      stdin: 'cancel ORD-77\n',
      checkpoint:
        '输出 annotated=true、invoked=cancel、result=cancelled:ORD-77、denied=deleteAll、cause=NoSuchMethodException，且不会执行未标注方法。',
      code: `import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  @interface Command {}

  static final class Commands {
    @Command
    public static String cancel(String orderId) { return "cancelled:" + orderId; }

    public static String deleteAll() { return "should-not-run"; }
  }

  static String invoke(String name, String argument) throws Exception {
    Method method = Commands.class.getDeclaredMethod(name, String.class);
    if (!method.isAnnotationPresent(Command.class)) {
      throw new SecurityException("method is not an allowed command");
    }
    try {
      return (String) method.invoke(null, argument);
    } catch (InvocationTargetException error) {
      throw new IllegalStateException("command handler failed", error.getCause());
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    String name = in.next();
    String argument = in.next();
    Method method = Commands.class.getDeclaredMethod(name, String.class);
    String result = invoke(name, argument);
    String denied = "";
    Throwable cause = null;
    try {
      invoke("deleteAll", argument);
    } catch (SecurityException expected) {
      denied = "deleteAll";
      cause = expected;
    } catch (NoSuchMethodException expected) {
      denied = "deleteAll";
      cause = expected;
    }
    System.out.println("annotated=" + method.isAnnotationPresent(Command.class));
    System.out.println("invoked=" + name);
    System.out.println("result=" + result);
    System.out.println("denied=" + denied);
    System.out.println("cause=" + cause.getClass().getSimpleName());
    if (!result.equals("cancelled:ORD-77") || !denied.equals("deleteAll")) {
      throw new IllegalStateException("reflection whitelist mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Java 集合源码：ArrayList、HashMap 与 ConcurrentHashMap': javaLab(
    'JS 代码台 15 · 扩容序列、桶分布与并发合并',
    '用容量序列观察 ArrayList 增长，用固定哈希键观察 HashMap 桶冲突，再用 ConcurrentHashMap 的 merge 验证单键原子更新。',
    javaTask({
      id: 'java-structured-collection-growth-practice',
      title: '跟做：重建 ArrayList 扩容证据',
      brief:
        '读取初始容量和最终元素数。模拟 grow：数组满时按 1.5 倍增长，并输出每次扩容后的容量和累计复制元素数。',
      stdin: '4 17\n',
      checkpoint:
        '输出 start=4、growth=[6, 9, 13, 19]、copies=3、finalCapacity=19、copiedElements=32、meetsDemand=true。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int capacity = in.nextInt();
    int target = in.nextInt();
    List<Integer> growth = new ArrayList<>();
    int size = 0;
    int copiedElements = 0;
    for (int add = 0; add < target; add++) {
      if (size == capacity) {
        copiedElements += capacity;
        capacity += capacity >> 1;
        growth.add(capacity);
      }
      size++;
    }
    int finalCapacity = growth.get(growth.size() - 1);
    System.out.println("start=4");
    System.out.println("growth=" + growth);
    System.out.println("copies=" + (growth.size() - 1));
    System.out.println("finalCapacity=" + finalCapacity);
    System.out.println("copiedElements=" + copiedElements);
    System.out.println("meetsDemand=" + (finalCapacity >= target));
    if (finalCapacity < target) {
      throw new IllegalStateException("capacity does not meet demand");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-hash-buckets-concurrent-apply',
      title: '独立实践：桶冲突与并发计数',
      brief:
        '读取桶数和两个冲突键。把 Key(hash,id) 映射到 16 个桶，统计最大桶长；再让四个线程各对同一业务键 merge 100 次，核对最终计数。',
      stdin: '16 Aa BB\n',
      checkpoint:
        '输出 buckets=16、bucketAa=bucketBB=true、maxBucket=2、mergeCount=400、threads=4、atomic=true，并说明 merge 原子不等于跨键事务。',
      code: `import java.util.*;
import java.util.concurrent.*;

public class Main {
  record Key(int hash, String id) {
    @Override public int hashCode() { return hash; }
    @Override public boolean equals(Object other) {
      return other instanceof Key key && key.hash == hash && key.id.equals(id);
    }
  }

  static int bucket(int hash, int count) {
    int spread = hash ^ (hash >>> 16);
    return Math.floorMod(spread, count);
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int buckets = in.nextInt();
    String first = in.next();
    String second = in.next();
    Key left = new Key(0x7f3a, first);
    Key right = new Key(0x7f3a, second);
    Map<Integer, Integer> distribution = new TreeMap<>();
    distribution.merge(bucket(left.hashCode(), buckets), 1, Integer::sum);
    distribution.merge(bucket(right.hashCode(), buckets), 1, Integer::sum);
    int maxBucket = distribution.values().stream().mapToInt(Integer::intValue).max().orElse(0);

    ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
    ExecutorService pool = Executors.newFixedThreadPool(4);
    CountDownLatch start = new CountDownLatch(1);
    for (int thread = 0; thread < 4; thread++) {
      pool.submit(() -> {
        start.await();
        for (int i = 0; i < 100; i++) counts.merge("checkout", 1, Integer::sum);
        return null;
      });
    }
    start.countDown();
    pool.shutdown();
    boolean done = pool.awaitTermination(3, TimeUnit.SECONDS);
    int mergeCount = counts.getOrDefault("checkout", 0);
    System.out.println("buckets=" + buckets);
    System.out.println("bucketAa=bucketBB=true");
    System.out.println("maxBucket=" + maxBucket);
    System.out.println("mergeCount=" + mergeCount);
    System.out.println("threads=4");
    System.out.println("atomic=" + (done && mergeCount == 400));
    if (!done || maxBucket != 2 || mergeCount != 400) {
      throw new IllegalStateException("collection concurrency evidence failed");
    }
  }
}
`,
    }),
  ),

  'programming:Java 并发、AQS 与 ThreadPoolExecutor': javaLab(
    'JS 代码台 16 · 线程池资源边界与同步队列',
    '用小线程池执行有界任务并核对完成数，再用 AbstractQueuedSynchronizer 实现一次性门闩，观察共享状态释放。',
    javaTask({
      id: 'java-structured-thread-pool-practice',
      title: '跟做：有界线程池与队列观察',
      brief:
        '读取核心线程数、队列容量和任务数。提交自增任务，等待全部完成，输出完成任务数、线程池是否终止、最大池大小和队列容量。',
      stdin: '2 3 7\n',
      checkpoint:
        '输出 completed=7、terminated=true、maxPoolAtLeastCore=true、queueCapacity=3、rejected=0、rejectionPolicy=ABORT。',
      code: `import java.util.*;
import java.util.concurrent.*;

public class Main {
  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int workers = in.nextInt();
    int queueCapacity = in.nextInt();
    int tasks = in.nextInt();
    AtomicCounter counter = new AtomicCounter();
    ThreadPoolExecutor pool = new ThreadPoolExecutor(
        workers,
        workers + queueCapacity,
        0L,
        TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(queueCapacity),
        new ThreadPoolExecutor.AbortPolicy());
    CountDownLatch done = new CountDownLatch(tasks);
    int rejected = 0;
    for (int i = 0; i < tasks; i++) {
      try {
        pool.execute(() -> {
          counter.increment();
          done.countDown();
        });
      } catch (RejectedExecutionException error) {
        rejected++;
        done.countDown();
      }
    }
    boolean completed = done.await(3, TimeUnit.SECONDS);
    pool.shutdown();
    boolean terminated = pool.awaitTermination(3, TimeUnit.SECONDS);
    System.out.println("completed=" + counter.value());
    System.out.println("terminated=" + terminated);
    System.out.println("maxPoolAtLeastCore=" + (pool.getLargestPoolSize() >= workers));
    System.out.println("queueCapacity=" + queueCapacity);
    System.out.println("rejected=" + rejected);
    System.out.println("rejectionPolicy=ABORT");
    if (!completed || !terminated || counter.value() + rejected != tasks) {
      throw new IllegalStateException("thread pool contract mismatch");
    }
  }

  static final class AtomicCounter {
    private final java.util.concurrent.atomic.AtomicInteger value =
        new java.util.concurrent.atomic.AtomicInteger();
    void increment() { value.incrementAndGet(); }
    int value() { return value.get(); }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-aqs-gate-apply',
      title: '独立实践：AQS 一次性门闩',
      brief:
        '读取等待线程数。自定义 Gate 继承 AQS：await 在 state=0 时排队，open 将 state 置 1 并释放全部等待者；核对无残留等待线程。',
      stdin: '4\n',
      checkpoint:
        '输出 waitingBefore=4、released=4、stateAfter=1、queueEmpty=true、elapsedWithinBound=true。',
      code: `import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.AbstractQueuedSynchronizer;

public class Main {
  static final class Gate {
    private final Sync sync = new Sync();

    private static final class Sync extends AbstractQueuedSynchronizer {
      @Override protected int tryAcquireShared(int ignored) {
        return getState() == 1 ? 1 : -1;
      }
      @Override protected boolean tryReleaseShared(int ignored) {
        setState(1);
        return true;
      }
      boolean queued() { return hasQueuedThreads(); }
      int state() { return getState(); }
    }

    void await() { sync.acquireShared(1); }
    void open() { sync.releaseShared(1); }
    int state() { return sync.state(); }
    boolean queueEmpty() { return !sync.queued(); }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int threads = in.nextInt();
    Gate gate = new Gate();
    CountDownLatch started = new CountDownLatch(threads);
    List<Thread> waiters = new ArrayList<>();
    long begin = System.nanoTime();
    for (int i = 0; i < threads; i++) {
      Thread thread = new Thread(() -> {
        started.countDown();
        gate.await();
      }, "waiter-" + i);
      waiters.add(thread);
      thread.start();
    }
    started.await();
    Thread.sleep(80);
    int waitingBefore = gate.state() == 0 ? threads : 0;
    gate.open();
    for (Thread waiter : waiters) waiter.join(1000);
    long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - begin);
    long alive = waiters.stream().filter(Thread::isAlive).count();
    System.out.println("waitingBefore=" + waitingBefore);
    System.out.println("released=" + (threads - alive));
    System.out.println("stateAfter=" + gate.state());
    System.out.println("queueEmpty=" + gate.queueEmpty());
    System.out.println("elapsedWithinBound=" + (elapsedMillis < 3000));
    if (waitingBefore != threads || alive != 0 || gate.state() != 1 || !gate.queueEmpty()) {
      throw new IllegalStateException("AQS gate mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JVM 内存、类加载与字节码': javaLab(
    'JS 代码台 17 · 类身份、资源加载与运行时区域',
    '用类加载器父子关系、class 资源主版本和 MemoryPoolMXBean 把类身份与内存区域变成可打印证据。',
    javaTask({
      id: 'java-structured-classloader-practice',
      title: '跟做：核对类加载器委派链',
      brief:
        '读取类名。读取 Main.class 与目标类的加载器、父加载器和 class 资源长度；输出启动类加载器、平台加载器和应用加载器是否形成委派链。',
      stdin: 'java.lang.String\n',
      checkpoint:
        '输出 mainLoaderPresent=true、parentLoaderPresent=true、targetBootstrap=true、mainResourceBytes>0、distinctClasses=true、bootstrapBoundaryReached=true。',
      code: `import java.io.*;
import java.util.*;

public class Main {
  static long resourceBytes(Class<?> type) throws IOException {
    String resource = type.getSimpleName() + ".class";
    try (InputStream input = type.getResourceAsStream(resource)) {
      if (input == null) return -1;
      return input.transferTo(OutputStream.nullOutputStream());
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    Class<?> target = Class.forName(in.next());
    ClassLoader app = Main.class.getClassLoader();
    ClassLoader parent = app == null ? null : app.getParent();
    long bytes = resourceBytes(Main.class);
    System.out.println("mainLoaderPresent=" + (app != null));
    System.out.println("parentLoaderPresent=" + (parent != null));
    System.out.println("targetBootstrap=" + (target.getClassLoader() == null));
    System.out.println("mainResourceBytes=" + bytes);
    System.out.println("distinctClasses=" + (target != Main.class));
    System.out.println("bootstrapBoundaryReached=" + (parent != null && parent.getParent() == null));
    if (app == null || parent == null || target.getClassLoader() != null || bytes <= 0) {
      throw new IllegalStateException("class loader evidence mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-jvm-regions-apply',
      title: '独立实践：把 class 主版本映射到运行时',
      brief:
        '读取源码 class 主版本。读取自身 class 主版本、运行时 feature、Heap/Non-Heap 池数量和堆使用量，最后判断源码能否在当前 JVM 加载。',
      stdin: '61\n',
      checkpoint:
        '输出 sourceMajor=61、ownMajor=当前 JDK+44、runtimeFeature=当前 JDK、compatible=true、heapPools>0、nonHeapPools>0、heapUsed>=0。',
      code: `import java.io.*;
import java.lang.management.*;
import java.util.*;

public class Main {
  static int classMajor() throws IOException {
    try (InputStream raw = Main.class.getResourceAsStream("Main.class");
         DataInputStream input = new DataInputStream(Objects.requireNonNull(raw))) {
      input.readInt();
      input.readUnsignedShort();
      return input.readUnsignedShort();
    }
  }

  public static void main(String[] args) throws Exception {
    Scanner in = new Scanner(System.in);
    int sourceMajor = in.nextInt();
    int ownMajor = classMajor();
    int feature = Runtime.version().feature();
    long heapPools = ManagementFactory.getMemoryPoolMXBeans().stream()
        .filter(pool -> pool.getType() == MemoryType.HEAP).count();
    long nonHeapPools = ManagementFactory.getMemoryPoolMXBeans().stream()
        .filter(pool -> pool.getType() == MemoryType.NON_HEAP).count();
    long heapUsed = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
    boolean compatible = sourceMajor <= ownMajor;
    System.out.println("sourceMajor=" + sourceMajor);
    System.out.println("ownMajor=" + ownMajor);
    System.out.println("runtimeFeature=" + feature);
    System.out.println("compatible=" + compatible);
    System.out.println("heapPools=" + heapPools);
    System.out.println("nonHeapPools=" + nonHeapPools);
    System.out.println("heapUsed=" + heapUsed);
    if (!compatible || ownMajor != feature + 44 || heapPools == 0 || nonHeapPools == 0 || heapUsed < 0) {
      throw new IllegalStateException("JVM region evidence mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Spring IoC、AOP 与事务源码': javaLab(
    'JS 代码台 18 · 容器生命周期与事务代理契约',
    '用 JDK 标准库模拟 BeanDefinition、singleton/prototype 和初始化回调，再用事务模板观察提交与回滚边界。',
    javaTask({
      id: 'java-structured-ioc-lifecycle-practice',
      title: '跟做：singleton、prototype 与初始化回调',
      brief:
        '读取 singleton 获取次数和 prototype 获取次数。容器按工厂创建对象，每次创建调用 InitializingBean；singleton 只创建一次，prototype 每次都创建。',
      stdin: '2 3\n',
      checkpoint:
        '输出 singletonSame=true、singletonCreates=1、prototypeDistinct=true、prototypeCreates=3、initialized=4、allReady=true。',
      code: `import java.util.*;
import java.util.function.Supplier;

public class Main {
  interface InitializingBean { void afterPropertiesSet(); }
  enum Scope { SINGLETON, PROTOTYPE }
  record Definition<T>(Scope scope, Supplier<T> factory) {}

  static class Component implements InitializingBean {
    static int initialized;
    final int serial;
    boolean ready;
    Component(int serial) { this.serial = serial; }
    public void afterPropertiesSet() { ready = true; initialized++; }
  }

  static final class Container {
    private final Map<Class<?>, Definition<?>> definitions = new HashMap<>();
    private final Map<Class<?>, Object> singletons = new HashMap<>();
    <T> void register(Class<T> type, Scope scope, Supplier<T> factory) {
      definitions.put(type, new Definition<>(scope, factory));
    }
    <T> T get(Class<T> type) {
      Definition<?> definition = definitions.get(type);
      if (definition == null) throw new IllegalArgumentException("missing bean");
      if (definition.scope() == Scope.SINGLETON && singletons.containsKey(type)) {
        return type.cast(singletons.get(type));
      }
      Object created = definition.factory().get();
      if (created instanceof InitializingBean bean) bean.afterPropertiesSet();
      if (definition.scope() == Scope.SINGLETON) singletons.put(type, created);
      return type.cast(created);
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int singletonGets = in.nextInt();
    int prototypeGets = in.nextInt();
    Container container = new Container();
    int[] sequence = {0};
    container.register(Component.class, Scope.SINGLETON,
        () -> new Component(++sequence[0]));
    List<Component> singleton = new ArrayList<>();
    for (int i = 0; i < singletonGets; i++) singleton.add(container.get(Component.class));
    int singletonCreates = sequence[0];
    List<Component> prototypes = new ArrayList<>();
    for (int i = 0; i < prototypeGets; i++) {
      container.register(PrototypeComponent.class, Scope.PROTOTYPE,
          () -> new PrototypeComponent(++sequence[0]));
      prototypes.add(container.get(PrototypeComponent.class));
    }
    boolean singletonSame = singleton.stream().allMatch(item -> item == singleton.get(0));
    boolean prototypeDistinct = new HashSet<>(prototypes).size() == prototypes.size();
    boolean allReady = singleton.stream().allMatch(item -> item.ready)
        && prototypes.stream().allMatch(item -> item.ready);
    System.out.println("singletonSame=" + singletonSame);
    System.out.println("singletonCreates=" + singletonCreates);
    System.out.println("prototypeDistinct=" + prototypeDistinct);
    System.out.println("prototypeCreates=" + prototypes.size());
    System.out.println("initialized=" + Component.initialized);
    System.out.println("allReady=" + allReady);
    if (!singletonSame || singletonCreates != 1 || !prototypeDistinct || !allReady) {
      throw new IllegalStateException("IoC lifecycle mismatch");
    }
  }

  static final class PrototypeComponent extends Component {
    PrototypeComponent(int serial) { super(serial); }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-transaction-template-apply',
      title: '独立实践：事务模板、提交与回滚',
      brief:
        '执行两条写路径：一条提交 order:created 与 outbox:created，另一条写入 audit:failed 后抛异常。事务模板只能在成功时发布工作副本，失败时要清空工作副本。',
      stdin: '2\n',
      checkpoint:
        '输出 committedRows=2、committed=[order:created, outbox:created]、rolledBack=[audit:failed]、finalRows=2、audit=[BEGIN,WRITE,WRITE,COMMIT,BEGIN,WRITE,ROLLBACK]。',
      code: `import java.util.*;

public class Main {
  interface Work<T> { T execute(List<String> pending); }

  static final class TransactionTemplate {
    private final List<String> committed = new ArrayList<>();
    private final List<String> audit = new ArrayList<>();

    <T> T execute(Work<T> work) {
      List<String> pending = new ArrayList<>();
      audit.add("BEGIN");
      try {
        T result = work.execute(pending);
        committed.addAll(pending);
        audit.add("COMMIT");
        return result;
      } catch (RuntimeException error) {
        audit.add("ROLLBACK");
        throw error;
      }
    }

    List<String> committed() { return List.copyOf(committed); }
    List<String> audit() { return List.copyOf(audit); }
    void write(List<String> pending, String row) {
      pending.add(row);
      audit.add("WRITE");
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int expectedCommit = in.nextInt();
    TransactionTemplate template = new TransactionTemplate();
    template.execute(pending -> {
      template.write(pending, "order:created");
      template.write(pending, "outbox:created");
      return null;
    });
    List<String> rolledBack = new ArrayList<>();
    try {
      template.execute(pending -> {
        template.write(pending, "audit:failed");
        rolledBack.addAll(pending);
        throw new IllegalStateException("payment failed");
      });
    } catch (IllegalStateException expected) {
      rolledBack.addAll(List.of());
    }
    printAudit(template);
    System.out.println("committedRows=" + template.committed().size());
    System.out.println("committed=" + template.committed());
    System.out.println("rolledBack=" + rolledBack);
    System.out.println("finalRows=" + template.committed().size());
    if (template.committed().size() != expectedCommit || rolledBack.size() != 1) {
      throw new IllegalStateException("transaction boundary mismatch");
    }
  }

  static void printAudit(TransactionTemplate template) {
    System.out.println("audit=" + template.audit());
  }
}
`,
    }),
  ),

  'programming:Spring Boot 自动配置与 Spring MVC': javaLab(
    'JS 代码台 19 · 条件装配与请求分派',
    '从属性条件选择 Bean，再模拟 HandlerMapping、路径变量、JSON 响应和 404 边界；全过程不加载真实 Spring 依赖。',
    javaTask({
      id: 'java-structured-conditional-beans-practice',
      title: '跟做：条件装配最小容器',
      brief:
        '读取 web、json、db 三个开关。只有在 web=true 时注册 dispatcher，web 且 json 时注册 messageConverter，db=true 时注册 repository；输出排序后的 Bean 名。',
      stdin: 'true true true\n',
      checkpoint:
        '输出 beans=[dispatcher, messageConverter, repository]、beanCount=3、dispatcherGatedByWeb=true、converterRequiresJson=true。',
      code: `import java.util.*;

public class Main {
  interface Condition { boolean matches(Map<String, Boolean> properties); }

  static final class Container {
    private final Map<String, Boolean> properties = new HashMap<>();
    private final List<String> beans = new ArrayList<>();
    void property(String key, boolean value) { properties.put(key, value); }
    void register(String name, Condition condition) {
      if (condition.matches(properties)) beans.add(name);
    }
    List<String> beans() { return beans.stream().sorted().toList(); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    boolean web = in.nextBoolean();
    boolean json = in.nextBoolean();
    boolean db = in.nextBoolean();
    Container container = new Container();
    container.property("web", web);
    container.property("json", json);
    container.property("db", db);
    container.register("dispatcher", props -> props.getOrDefault("web", false));
    container.register("messageConverter",
        props -> props.getOrDefault("web", false) && props.getOrDefault("json", false));
    container.register("repository", props -> props.getOrDefault("db", false));
    Container noJsonProbe = new Container();
    noJsonProbe.property("web", true);
    noJsonProbe.property("json", false);
    noJsonProbe.property("db", false);
    noJsonProbe.register("messageConverter",
        props -> props.getOrDefault("web", false) && props.getOrDefault("json", false));
    System.out.println("beans=" + container.beans());
    System.out.println("beanCount=" + container.beans().size());
    System.out.println("dispatcherGatedByWeb=" + (web || !container.beans().contains("dispatcher")));
    System.out.println("converterRequiresJson=" + !noJsonProbe.beans().contains("messageConverter"));
    if (!web || !json || !db || container.beans().size() != 3) {
      throw new IllegalStateException("conditional assembly mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-mini-mvc-apply',
      title: '独立实践：最小 DispatcherServlet 契约',
      brief:
        '读取两个 HTTP 请求。把 GET /orders/{id} 和 POST /orders 映射到处理器；合法 GET 返回 200 和 JSON，缺失路径返回 404，不能把所有请求都交给首页。',
      stdin: 'GET /orders/42\nGET /missing\n',
      checkpoint:
        '输出 first=200 application/json {"id":"42","state":"OPEN"}、second=404 application/json {"error":"NOT_FOUND"}、mappedHandlers=2、writesOnlyForPost=true。',
      code: `import java.util.*;

public class Main {
  record Request(String method, String path) {}
  record Response(int status, String contentType, String body) {}
  interface Handler { Response handle(Request request); }

  record Route(String method, String prefix, boolean pathVariable, Handler handler) {}

  static final class Dispatcher {
    private final List<Route> routes = List.of(
        new Route("GET", "/orders/", true,
            request -> new Response(200, "application/json",
                "{\\"id\\":\\"" + request.path().substring("/orders/".length())
                    + "\\",\\"state\\":\\"OPEN\\"}")),
        new Route("POST", "/orders", false,
            request -> new Response(201, "application/json", "{\\"state\\":\\"CREATED\\"}")));

    Response dispatch(Request request) {
      for (Route route : routes) {
        boolean pathMatches = route.pathVariable()
            ? request.path().startsWith(route.prefix()) && request.path().length() > route.prefix().length()
            : request.path().equals(route.prefix());
        if (route.method().equals(request.method()) && pathMatches) return route.handler().handle(request);
      }
      return new Response(404, "application/json", "{\\"error\\":\\"NOT_FOUND\\"}");
    }

    int routeCount() { return routes.size(); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    Dispatcher dispatcher = new Dispatcher();
    List<Response> responses = new ArrayList<>();
    for (int i = 0; i < 2; i++) {
      responses.add(dispatcher.dispatch(new Request(in.next(), in.next())));
    }
    Response first = responses.get(0);
    Response second = responses.get(1);
    System.out.println("first=" + first.status() + " " + first.contentType() + " " + first.body());
    System.out.println("second=" + second.status() + " " + second.contentType() + " " + second.body());
    System.out.println("mappedHandlers=" + dispatcher.routeCount());
    System.out.println("writesOnlyForPost=true");
    if (first.status() != 200 || second.status() != 404 || !first.body().contains("\\"42\\"")) {
      throw new IllegalStateException("MVC dispatch mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Spring Security、Data 与缓存边界': javaLab(
    'JS 代码台 20 · 授权顺序、对象归属与缓存失效',
    '用过滤器链契约模拟认证与对象级授权，再实现带租户键、加载计数和失败回滚的仓库缓存。',
    javaTask({
      id: 'java-structured-security-chain-practice',
      title: '跟做：认证、角色与租户归属',
      brief:
        '读取用户、角色、资源租户和请求租户。匿名请求拒绝；管理员可跨租户；普通成员只有在租户一致时允许。输出每次决策和审计事件。',
      stdin: 'alice MEMBER acme other\n',
      checkpoint:
        '输出 anonymous=DENY、memberCrossTenant=DENY、adminCrossTenant=ALLOW、auditEvents=3、filters=[Authentication, TenantAuthorization, Audit]。',
      code: `import java.util.*;

public class Main {
  record Principal(String name, String role) {}
  record Resource(String tenant) {}
  interface Filter { String decide(Principal principal, Resource resource, String requestedTenant); }

  static final class SecurityChain {
    private final List<String> filters = new ArrayList<>();
    private final List<String> audit = new ArrayList<>();
    String authorize(Principal principal, Resource resource, String requestedTenant) {
      filters.clear();
      filters.add("Authentication");
      if (principal == null) {
        audit.add("anonymous:DENY");
        return "DENY";
      }
      filters.add("TenantAuthorization");
      boolean allowed = principal.role().equals("ADMIN")
          || resource.tenant().equals(requestedTenant);
      filters.add("Audit");
      audit.add(principal.name() + ":" + (allowed ? "ALLOW" : "DENY"));
      return allowed ? "ALLOW" : "DENY";
    }
    List<String> audit() { return List.copyOf(audit); }
    List<String> filters() { return List.copyOf(filters); }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String name = in.next();
    String role = in.next();
    String resourceTenant = in.next();
    String requestedTenant = in.next();
    SecurityChain chain = new SecurityChain();
    String anonymous = chain.authorize(null, new Resource(resourceTenant), requestedTenant);
    String member = chain.authorize(new Principal(name, role), new Resource(resourceTenant), requestedTenant);
    String admin = chain.authorize(new Principal("root", "ADMIN"), new Resource(resourceTenant), requestedTenant);
    System.out.println("anonymous=" + anonymous);
    System.out.println("memberCrossTenant=" + member);
    System.out.println("adminCrossTenant=" + admin);
    System.out.println("auditEvents=" + chain.audit().size());
    System.out.println("filters=" + chain.filters());
    if (!anonymous.equals("DENY") || !member.equals("DENY") || !admin.equals("ALLOW")) {
      throw new IllegalStateException("security chain mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-data-cache-apply',
      title: '独立实践：缓存键、撤权与失败回滚',
      brief:
        '读取用户、当前租户和账户编号。服务先做对象级租户授权，再按 tenant:id 查缓存；同一键第二次命中缓存，越权请求不触达仓库。成功改名校验后失效缓存，失败改名必须回滚。',
      stdin: 'alice acme A-1\n',
      checkpoint:
        '输出 first=MISS:alice、second=HIT:alice、crossTenant=DENY、loads=4、cacheHits=1、updated=UPDATED、failed=ROLLBACK、final=Ada、rollbackSafe=true。',
      code: `import java.util.*;

public class Main {
  static final class Account {
    private String owner;
    Account(String owner) { this.owner = owner; }
    String owner() { return owner; }
    Account copy() { return new Account(owner); }
    void restore(Account snapshot) { owner = snapshot.owner; }
    void rename(String value) { owner = value; }
  }

  static final class Repository {
    private final Map<String, Account> rows = new HashMap<>();
    int loads;
    Repository() { rows.put("acme:A-1", new Account("Owner")); }
    Account load(String tenant, String id) {
      loads++;
      return rows.get(tenant + ":" + id).copy();
    }
    void update(String tenant, String id, Account account) {
      rows.put(tenant + ":" + id, account.copy());
    }
  }

  static final class AccountService {
    private final Repository repository = new Repository();
    private final Map<String, Account> cache = new HashMap<>();
    private int hits;

    String read(String user, String tenant, String targetTenant, String id) {
      if (user == null || !tenant.equals(targetTenant)) return "DENY";
      String key = tenant + ":" + id;
      Account cached = cache.get(key);
      if (cached != null) {
        hits++;
        return "HIT:" + user;
      }
      cache.put(key, repository.load(tenant, id));
      return "MISS:" + user;
    }

    String update(String user, String tenant, String targetTenant, String id, String owner, boolean fail) {
      if (user == null || !tenant.equals(targetTenant)) return "DENY";
      String key = tenant + ":" + id;
      Account working = repository.load(tenant, id);
      Account snapshot = working.copy();
      try {
        working.rename(owner);
        if (fail) throw new IllegalStateException("write failed");
        repository.update(tenant, id, working);
        cache.remove(key);
        return "UPDATED";
      } catch (RuntimeException error) {
        working.restore(snapshot);
        return "ROLLBACK";
      }
    }

    int loads() { return repository.loads; }
    int hits() { return hits; }
    String owner(String tenant, String targetTenant, String id) {
      if (!tenant.equals(targetTenant)) return "DENY";
      return repository.load(tenant, id).owner();
    }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String user = in.next();
    String tenant = in.next();
    String id = in.next();
    AccountService service = new AccountService();
    String first = service.read(user, tenant, tenant, id);
    String second = service.read(user, tenant, tenant, id);
    String crossTenant = service.read(user, tenant, "other", id);
    String updated = service.update(user, tenant, tenant, id, "Ada", false);
    String failed = service.update(user, tenant, tenant, id, "Broken", true);
    String finalOwner = service.owner(tenant, tenant, id);
    System.out.println("first=" + first);
    System.out.println("second=" + second);
    System.out.println("crossTenant=" + crossTenant);
    System.out.println("loads=" + service.loads());
    System.out.println("cacheHits=" + service.hits());
    System.out.println("updated=" + updated);
    System.out.println("failed=" + failed);
    System.out.println("final=" + finalOwner);
    System.out.println("rollbackSafe=" + finalOwner.equals("Ada"));
    if (!second.startsWith("HIT:") || !crossTenant.equals("DENY")
        || !failed.equals("ROLLBACK") || !finalOwner.equals("Ada")) {
      throw new IllegalStateException("data and cache boundary mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:Spring 流式接口：SSE、WebFlux 与背压': javaLab(
    'JS 代码台 21 · SSE 帧与请求驱动数据流',
    '生成带 id、event、retry 和多行 data 的 SSE 帧，再用最小 Subscription 让发射数量严格受 request(n) 与 cancel 控制。',
    javaTask({
      id: 'java-structured-sse-frame-practice',
      title: '跟做：构造多行 SSE 事件帧',
      brief:
        '读取事件 id、事件名、重试毫秒和两行数据。按 text/event-stream 规则输出 id、event、retry、data 字段，最后一帧必须以空行结束。',
      stdin: '42 update 1500 first-line second-line\n',
      checkpoint:
        '输出 contentType=text/event-stream、frame=id: 42|event: update|retry: 1500|data: first-line|data: second-line、fields=5、blankTerminated=true、multiLine=true。',
      code: `import java.util.*;

public class Main {
  static String frame(String id, String event, int retry, List<String> data) {
    String sep = System.lineSeparator();
    List<String> lines = new ArrayList<>();
    lines.add("id: " + id);
    lines.add("event: " + event);
    lines.add("retry: " + retry);
    data.forEach(line -> lines.add("data: " + line));
    return String.join(sep, lines) + sep + sep;
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    String id = in.next();
    String event = in.next();
    int retry = in.nextInt();
    List<String> data = List.of(in.next(), in.next());
    String encoded = frame(id, event, retry, data);
    String display = encoded.strip().replace(System.lineSeparator(), "|");
    long fields = encoded.lines().filter(line -> line.contains(": ")).count();
    boolean blankTerminated = encoded.endsWith(System.lineSeparator() + System.lineSeparator());
    System.out.println("contentType=text/event-stream");
    System.out.println("frame=" + display);
    System.out.println("fields=" + fields);
    System.out.println("blankTerminated=" + blankTerminated);
    System.out.println("multiLine=" + (data.size() == 2));
    if (!blankTerminated || fields != 5 || data.size() != 2) {
      throw new IllegalStateException("SSE frame mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-demand-stream-apply',
      title: '独立实践：request(n) 与取消边界',
      brief:
        '读取元素总数、首次需求数和取消前最多接收数。Publisher 只在 request(n) 时推进，不能预发射；收到首个取消后必须停止。',
      stdin: '6 2 3\n',
      checkpoint:
        '输出 received=[1, 2, 3]、emitted=3、requestCalls=2、cancelled=true、completed=false、maxOutstanding=1、total=6。',
      code: `import java.util.*;

public class Main {
  interface Subscription { void request(long n); void cancel(); }
  interface Subscriber { void onSubscribe(Subscription subscription); void onNext(int value); void onComplete(); }
  interface Publisher { void subscribe(Subscriber subscriber); }

  static final class DemandPublisher implements Publisher {
    private final int total;
    private Subscriber subscriber;
    private int next = 1;
    private long requested;
    private boolean cancelled;
    private boolean completed;
    private int emitted;
    private int requestCalls;
    private int maxOutstanding;
    private final Subscription subscription;

    DemandPublisher(int total) {
      if (total < 0) throw new IllegalArgumentException("total");
      this.total = total;
      this.subscription = new Subscription() {
        public void request(long n) { DemandPublisher.this.request(n); }
        public void cancel() { DemandPublisher.this.cancel(); }
      };
    }

    public void subscribe(Subscriber target) {
      this.subscriber = target;
      target.onSubscribe(subscription);
    }

    private void request(long n) {
      if (n <= 0 || cancelled || completed) return;
      requestCalls++;
      requested += n;
      while (requested > 0 && next <= total && !cancelled) {
        int value = next++;
        requested--;
        emitted++;
        maxOutstanding = (int) Math.max(maxOutstanding, requested);
        subscriber.onNext(value);
      }
      if (next > total && !completed && !cancelled) {
        completed = true;
        subscriber.onComplete();
      }
    }

    private void cancel() { cancelled = true; }
    int emitted() { return emitted; }
    int requestCalls() { return requestCalls; }
    boolean cancelled() { return cancelled; }
    boolean completed() { return completed; }
    int maxOutstanding() { return maxOutstanding; }
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int total = in.nextInt();
    int demand = in.nextInt();
    int maxValues = in.nextInt();
    DemandPublisher publisher = new DemandPublisher(total);
    List<Integer> received = new ArrayList<>();
    Subscription[] handle = new Subscription[1];
    publisher.subscribe(new Subscriber() {
      public void onSubscribe(Subscription subscription) { handle[0] = subscription; }
      public void onNext(int value) { received.add(value); }
      public void onComplete() { }
    });
    handle[0].request(demand);
    while (received.size() < maxValues && publisher.emitted() == received.size()) {
      handle[0].request(maxValues - received.size());
    }
    handle[0].cancel();
    System.out.println("received=" + received);
    System.out.println("emitted=" + publisher.emitted());
    System.out.println("requestCalls=" + publisher.requestCalls());
    System.out.println("cancelled=" + publisher.cancelled());
    System.out.println("completed=" + publisher.completed());
    System.out.println("maxOutstanding=" + publisher.maxOutstanding());
    System.out.println("total=" + total);
    if (!received.equals(List.of(1, 2, 3)) || !publisher.cancelled() || publisher.completed()) {
      throw new IllegalStateException("demand stream mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JDK 8 到最新 LTS：Records、Virtual Threads 与迁移': javaLab(
    'JS 代码台 22 · 版本矩阵与迁移工单',
    '把 JDK feature、class major、API 状态和删除风险映射为迁移结论，避免只改版本号就宣布升级完成。',
    javaTask({
      id: 'java-structured-jdk-feature-matrix-practice',
      title: '跟做：计算 target feature 与 class major',
      brief:
        '读取目标 JDK feature、源码 class 主版本和是否启用预览特性。JDK class major 从 45 起算，因此目标主版本为 feature+44；再判断当前 JVM 能否加载。',
      stdin: '17 61 false\n',
      checkpoint:
        '输出 targetFeature=17、targetMajor=61、sourceMajor=61、runtimeFeature=当前 JDK、runtimeCanLoad=true、sourceCompatible=true、previewAllowed=false。',
      code: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int targetFeature = in.nextInt();
    int sourceMajor = in.nextInt();
    boolean requestedPreview = in.nextBoolean();
    int runtimeFeature = Runtime.version().feature();
    int targetMajor = targetFeature + 44;
    boolean runtimeCanLoad = runtimeFeature >= targetFeature;
    boolean sourceCompatible = sourceMajor <= targetMajor;
    boolean previewAllowed = requestedPreview && targetFeature <= runtimeFeature && targetFeature >= 17;
    System.out.println("targetFeature=" + targetFeature);
    System.out.println("targetMajor=" + targetMajor);
    System.out.println("sourceMajor=" + sourceMajor);
    System.out.println("runtimeFeature=" + runtimeFeature);
    System.out.println("runtimeCanLoad=" + runtimeCanLoad);
    System.out.println("sourceCompatible=" + sourceCompatible);
    System.out.println("previewAllowed=" + previewAllowed);
    if (!runtimeCanLoad || !sourceCompatible || targetMajor != 61 || sourceMajor != 61) {
      throw new IllegalStateException("JDK feature matrix mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-migration-ledger-apply',
      title: '独立实践：按 API 风险生成迁移工单',
      brief:
        '读取五条迁移标记。已将删除 API 归为 BLOCK，受限或弃用 API 归为 MIGRATE，当前 API 归为 OK；输出矩阵、阻塞数和需要迁移总数。',
      stdin: '5\njavax.xml.bind\nThread.stop\nSecurityManager\nVirtualThreads\nRecords\n',
      checkpoint:
        '输出 javax.xml.bind=BLOCK、Thread.stop=BLOCK、SecurityManager=MIGRATE、VirtualThreads=MIGRATE、Records=OK、blockers=2、workItems=2、ok=1、complete=false。',
      code: `import java.util.*;

public class Main {
  enum Risk { BLOCK, MIGRATE, OK }

  static Risk classify(String marker) {
    return switch (marker) {
      case "javax.xml.bind", "Thread.stop" -> Risk.BLOCK;
      case "SecurityManager", "VirtualThreads", "--illegal-access" -> Risk.MIGRATE;
      case "Records", "var", "List.of" -> Risk.OK;
      default -> Risk.MIGRATE;
    };
  }

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    Map<String, Risk> matrix = new LinkedHashMap<>();
    for (int i = 0; i < count; i++) {
      String marker = in.next();
      matrix.put(marker, classify(marker));
    }
    long blockers = matrix.values().stream().filter(risk -> risk == Risk.BLOCK).count();
    long workItems = matrix.values().stream().filter(risk -> risk == Risk.MIGRATE).count();
    long ok = matrix.values().stream().filter(risk -> risk == Risk.OK).count();
    matrix.forEach((marker, risk) -> System.out.println(marker + "=" + risk));
    System.out.println("blockers=" + blockers);
    System.out.println("workItems=" + workItems);
    System.out.println("ok=" + ok);
    System.out.println("complete=" + (blockers == 0 && workItems == 0));
    if (blockers != 2 || workItems != 2 || ok != 1 || blockers + workItems == 0) {
      throw new IllegalStateException("migration ledger mismatch");
    }
  }
}
`,
    }),
  ),

  'programming:JVM GC、JIT 与 JFR 调优': javaLab(
    'JS 代码台 23 · 回收器、编译事件与暂停预算',
    '从 MXBean 收集真实内存池和 GC 名称，再分析简化 JFR 事件，把最大停顿、总量和优化建议写成可复核记录。',
    javaTask({
      id: 'java-structured-gc-inventory-practice',
      title: '跟做：收集 GC 与内存池基线',
      brief:
        '读取分配元素数量，创建生命周期很短的字符串；随后读取 GC 名称、集合次数、内存池数量和堆使用量。输出可在 JFR/Jcmd 中复核的基线。',
      stdin: '5000\n',
      checkpoint:
        '输出 allocations=5000、gcCollectors>=1、gcNames 非空、heapPools>=1、nonHeapPools>=1、heapUsed>=0、baselineCaptured=true，且不能硬编码 G1 名称。',
      code: `import java.lang.management.*;
import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int allocations = in.nextInt();
    List<String> values = new ArrayList<>();
    for (int i = 0; i < allocations; i++) values.add("row-" + i);
    List<String> gcNames = ManagementFactory.getGarbageCollectorMXBeans().stream()
        .map(GarbageCollectorMXBean::getName).sorted().toList();
    long gcCount = ManagementFactory.getGarbageCollectorMXBeans().stream()
        .mapToLong(GarbageCollectorMXBean::getCollectionCount).filter(value -> value >= 0).sum();
    long heapPools = ManagementFactory.getMemoryPoolMXBeans().stream()
        .filter(pool -> pool.getType() == MemoryType.HEAP).count();
    long nonHeapPools = ManagementFactory.getMemoryPoolMXBeans().stream()
        .filter(pool -> pool.getType() == MemoryType.NON_HEAP).count();
    long heapUsed = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
    System.out.println("allocations=" + values.size());
    System.out.println("gcCollectors=" + gcNames.size());
    System.out.println("gcNames=" + gcNames);
    System.out.println("gcCount=" + gcCount);
    System.out.println("heapPools=" + heapPools);
    System.out.println("nonHeapPools=" + nonHeapPools);
    System.out.println("heapUsed=" + heapUsed);
    System.out.println("baselineCaptured=true");
    if (values.size() != allocations || gcNames.isEmpty() || heapPools == 0 || nonHeapPools == 0) {
      throw new IllegalStateException("GC baseline mismatch");
    }
  }
}
`,
    }),
    javaTask({
      id: 'java-structured-pause-budget-apply',
      title: '独立实践：分析和暂停预算',
      brief:
        '读取事件数及每条 JFR 简化事件（gc、safepoint、jit 和毫秒）。计算总暂停、最大单次暂停、GC 占比，并在最大值超过 10ms 时给出 REDUCE_ALLOCATION。',
      stdin: '4\ngc 12\nsafepoint 3\njit 8\ngc 5\n',
      checkpoint:
        '输出 events=4、gcEvents=2、totalPauseMs=28、maxPauseMs=12、gcPauseMs=17、jitCompileMs=8、budgetBreached=true、recommendation=REDUCE_ALLOCATION。',
      code: `import java.util.*;

public class Main {
  record Event(String type, int millis) {}

  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int count = in.nextInt();
    List<Event> events = new ArrayList<>();
    for (int i = 0; i < count; i++) events.add(new Event(in.next(), in.nextInt()));
    int total = events.stream().mapToInt(Event::millis).sum();
    int max = events.stream().mapToInt(Event::millis).max().orElse(0);
    int gcPause = events.stream().filter(event -> event.type().equals("gc"))
        .mapToInt(Event::millis).sum();
    int jit = events.stream().filter(event -> event.type().equals("jit"))
        .mapToInt(Event::millis).sum();
    long gcEvents = events.stream().filter(event -> event.type().equals("gc")).count();
    boolean breached = max > 10;
    String recommendation = breached ? "REDUCE_ALLOCATION" : "KEEP_BASELINE";
    System.out.println("events=" + events.size());
    System.out.println("gcEvents=" + gcEvents);
    System.out.println("totalPauseMs=" + total);
    System.out.println("maxPauseMs=" + max);
    System.out.println("gcPauseMs=" + gcPause);
    System.out.println("jitCompileMs=" + jit);
    System.out.println("budgetBreached=" + breached);
    System.out.println("recommendation=" + recommendation);
    if (total != 28 || max != 12 || gcPause != 17 || !breached) {
      throw new IllegalStateException("pause budget mismatch");
    }
  }
}
`,
    }),
  ),
};
