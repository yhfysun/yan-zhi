import type { ProgrammingCourseSeed } from './shared.js';

const JDK_DOCS = 'Oracle Java Documentation. https://docs.oracle.com/en/java/';
const JAVA_SPECS = 'Java Language and VM Specifications. https://docs.oracle.com/javase/specs/';
const JAVA_API = 'Java Platform Standard Edition API Specification. https://docs.oracle.com/en/java/javase/';
const JUNIT = 'JUnit User Guide. https://docs.junit.org/current/user-guide/';
const MAVEN = 'Apache Maven Documentation. https://maven.apache.org/guides/';
const GRADLE = 'Gradle User Manual. https://docs.gradle.org/current/userguide/userguide.html';
const GIT = 'Pro Git. https://git-scm.com/book/en/v2';

export const PROGRAMMING_JAVA_FOUNDATION_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'Java 零基础：JDK、IDE 与第一个程序',
    track: 'P06 · Java / JVM / Spring',
    minutes: 34,
    prerequisite: '会使用键盘、浏览器和文件目录，不需要写过任何代码。',
    goal: '能安装一个受支持的 JDK LTS，配置命令行和 IDE，并从空目录编译运行第一个 Java 程序。',
    guidedPractice: '创建 hello-java 目录，手写 Main.java，先用 javac -encoding UTF-8 Main.java 编译，再运行 java Main；随后在同一文件里打印 java.version 与 java.home，核对命令行和程序报告的是同一个 JDK。',
    independentPractice: '删除 Main.class 后从命令行重编译一次，提交一张环境卡：java -version、javac -version、两条可执行文件路径、Main.java 源码、编译命令、运行命令、成功退出码，以及一次故意写错类名后的编译错误原文。',
    commonErrors: ['把 JDK 和 IDE 当成同一个东西。', '文件名、类名和包路径不一致。'],
    sourceRefs: [JDK_DOCS, MAVEN],
    steps: [
      [
        '先证明安装的是完整 JDK',
        'JDK 包含 javac、java、javadoc、jdb 和诊断工具；只装 JRE 可以运行别人编译好的程序，却不能把 Main.java 编译成 class。先打开 PowerShell，依次查询 java、javac 的版本和实际路径。两边的版本主线必须一致，路径也应指向同一个 JDK 根目录。',
        'java 与 javac 必须来自同一套 JDK',
        {
          title: '环境检查命令与预期证据',
          language: 'PowerShell',
          code: `java -version
javac -version
where.exe java
where.exe javac`,
          output: `java version "21.0.x"
javac 21.0.x
C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe
C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javac.exe`,
        },
      ],
      [
        '从空目录建立最小项目',
        '新建 hello-java 目录，只放 Main.java 和 README.md。不要在第一天引入 Maven、Gradle 或 Spring；先把源码文件、class 产物和 JVM 进程三件事分开看见。README 写清 JDK 版本、源码路径、编译命令和运行命令，让第二天重开项目时仍能复现。',
        '先减少变量，再看清产物',
        {
          title: '最小项目结构',
          language: 'Text',
          code: `hello-java/
├─ Main.java
└─ README.md`,
          output: '编译前目录里没有 Main.class；javac 成功后才会生成 Main.class。',
        },
      ],
      [
        '手写文件名、类名与 main',
        '公开类 Main 必须写在 Main.java 中，JVM 入口签名固定为 public static void main(String[] args)。System.out.println 把一行文本写到标准输出；语句末尾分号、字符串双引号和花括号配对少一个都会直接编译失败。',
        '文件、类、入口三处名称要对齐',
        {
          title: '第一段手写 Main.java',
          language: 'Java',
          code: `public class Main {
  public static void main(String[] args) {
    String version = System.getProperty("java.version");
    String javaHome = System.getProperty("java.home");

    System.out.println("JDK 版本: " + version);
    System.out.println("java.home: " + javaHome);
    System.out.println("第一段 Java 程序已运行。");
  }
}`,
          output: `JDK 版本: 21.0.x
java.home: C:\\Program Files\\Eclipse Adoptium\\jdk-21
第一段 Java 程序已运行。`,
        },
      ],
      [
        '手写一次 javac 与 java',
        '在 hello-java 目录执行 javac -encoding UTF-8 Main.java，成功后同目录出现 Main.class；再执行 java Main，JVM 才会加载并运行字节码。IDE 的绿色运行按钮只是替你拼出类似命令。遇到“找不到文件”先检查当前目录，遇到“类名错误”先检查文件名和公开类名。',
        '源码、字节码、进程三层要分开',
        {
          title: '命令行编译与运行',
          language: 'PowerShell',
          code: `javac -encoding UTF-8 Main.java
java Main`,
          output: `JDK 版本: 21.0.x
java.home: C:\\Program Files\\Eclipse Adoptium\\jdk-21
第一段 Java 程序已运行。`,
        },
      ],
      [
        '用退出码和一次失败验收',
        '成功进程退出码是 0；编译错误或未捕获异常会给出非 0 退出码。故意把 Main.java 里的公开类名改成 Hello，重新编译应看到“类 Hello 是公共的，应在名为 Hello.java 的文件中声明”。再改回 Main 并重新运行，才算完整走通“失败—定位—修复—复验”。',
        '会读第一条编译错误才能独立排错',
        {
          title: '故意制造并修复一次编译错误',
          language: 'Text',
          code: `错误：类 Hello 是公共的，应在名为 Hello.java 的文件中声明
原因：public class Hello 写在 Main.java
修复：把类名改回 Main，重新执行 javac Main.java`,
          output: '修复后 javac 返回 0，java Main 重新输出三行程序结果。',
        },
      ],
    ],
  },
  {
    name: 'javac、class 与 java：程序如何运行',
    track: 'P06 · Java / JVM / Spring',
    minutes: 36,
    prerequisite: '能运行第一个 Java 程序，知道源码文件与类名。',
    goal: '能解释源码、class 文件、类加载、JVM、进程和退出码之间的关系，并定位版本不兼容与类找不到问题。',
    guidedPractice: '用 javap 查看一个 class 文件的常量池和方法字节码，再制造文件名与类名不一致错误。',
    independentPractice: '画出一段 Java 源码从保存到运行结束的完整链路，标出三类常见失败。',
    commonErrors: ['把 class 文件当成源码。', '看到 ClassNotFound 只检查拼写。'],
    sourceRefs: [JAVA_SPECS, JDK_DOCS],
    steps: [
      [
        '编译器把源码变成 class',
        'javac 先由词法和语法分析建立抽象语法树，再做符号解析、类型检查和常量折叠，最终输出包含常量池、字段、方法和 JVM 指令的 class 文件。class 文件记录目标版本、类名、父类、接口、注解和字节码，是 JVM 读取的执行输入，而不是源码的压缩副本。编译成功只证明当前编译单元能通过类型检查，运行时仍可能缺依赖、缺资源或目标 JVM 版本不兼容。',
        '编译期与运行期分开',
        {
          title: 'PowerShell：从源码生成并检查 class',
          language: 'PowerShell',
          code: `@'
public class Main {
  public static void main(String[] args) {
    System.out.println("class-ready");
  }
}
'@ | Set-Content Main.java
javac -encoding UTF-8 Main.java
Get-ChildItem Main.* | Select-Object Name, Length
javap -verbose Main | Select-String "major version|public static void main"`,
          output: `Name       Length
Main.java      98
Main.class     438

major version: 65
public static void main(java.lang.String[]);

Main.class 是编译产物；major version 65 对应 Java 21。源码与 class 都要保留来源版本。`,
        },
      ],
      [
        'JVM 加载并验证类',
        'JVM 先由类加载器按全限定名找到字节流，再依次完成验证、准备、解析和初始化。验证会检查字节码结构、栈映射和类型安全；准备阶段为静态字段分配默认值；解析把符号引用转成直接引用；初始化才执行静态初始化块。ClassNotFoundException 表示没找到类，NoClassDefFoundError 常见于首次初始化失败，ExceptionInInitializerError 则把静态块里的根因包装出来。',
        '先区分加载失败的层次',
        {
          title: 'PowerShell + Java：观察成功加载与 NoClassDefFoundError',
          language: 'PowerShell',
          code: `@'
public class LoaderCheck {
  static class Broken {
    static { if (true) throw new RuntimeException("static-init"); }
  }

  public static void main(String[] args) {
    System.out.println(String.class.getModule().getName());
    try {
      new Broken();
    } catch (Throwable error) {
      System.out.println(error.getClass().getSimpleName());
    }
    try {
      Class.forName("MissingType");
    } catch (ClassNotFoundException error) {
      System.out.println(error.getClass().getSimpleName());
    }
  }
}
'@ | Set-Content LoaderCheck.java
javac LoaderCheck.java
java LoaderCheck`,
          output: `java.base
ExceptionInInitializerError
ClassNotFoundException

String 来自 java.base；静态初始化抛错得到 ExceptionInInitializerError；缺失类得到 ClassNotFoundException。三类失败不能都叫“类加载错误”。`,
        },
      ],
      [
        '字节码由 JVM 执行',
        'class 文件中的指令由 JVM 解释执行，运行一段时间后热点方法和循环会被 JIT 编译器优化成平台机器码。解释执行便于启动和诊断，JIT 能内联、消除边界检查和优化分支，但也受去优化、代码缓存和预热影响。调试器通过行号表和局部变量表把字节码位置映射回 Java 源码，因此栈帧里的行号证明的是 class 调试信息，不代表 JVM 直接执行了那段文本。',
        'Java 程序运行在 JVM 上',
        {
          title: 'PowerShell：对照 Java 源码与字节码',
          language: 'PowerShell',
          code: `@'
public class BytecodeDemo {
  public static void main(String[] args) {
    int quantity = 3;
    int total = quantity * 14;
    System.out.println(total);
  }
}
'@ | Set-Content BytecodeDemo.java
javac BytecodeDemo.java
java BytecodeDemo
javap -c -p BytecodeDemo`,
          output: `42

public static void main(java.lang.String[]);
Code:
   0: iconst_3
   1: istore_1
   2: bipush 14
   4: iload_1
   5: imul
   6: istore_2
   7: getstatic #7 // Field java/lang/System.out
  10: iload_2
  11: invokevirtual #13 // Method java/io/PrintStream.println:(I)V`,
        },
      ],
      [
        'java 命令还传入环境',
        'java 启动器会解析主类、类路径或模块路径、JVM 参数和环境变量，再创建 JVM 进程。当前目录决定相对路径基准，-cp 决定类文件搜索位置，-D 传入系统属性，JAVA_HOME 和 PATH 则影响你实际启动的是哪套 JDK。IDE 绿色按钮可能额外注入工作目录、环境变量和 VM options，所以线上故障必须复制真实启动命令复现，不能只看 IDE 输出窗口。',
        '复现真实启动命令',
        {
          title: 'PowerShell：显式类路径运行并记录退出码',
          language: 'PowerShell',
          code: `New-Item -ItemType Directory -Force out | Out-Null
javac -d out Main.java
java -cp out Main
"okExit=$LASTEXITCODE"
java -cp wrong-dir Main
"failedExit=$LASTEXITCODE"`,
          output: `class-ready
okExit=0
Error: Could not find or load main class Main
Caused by: java.lang.ClassNotFoundException: Main
failedExit=1

成功与失败命令必须记录完整参数、工作目录和退出码。IDE 运行按钮最终也只是拼出一条等价的 java 命令。`,
        },
      ],
      [
        '用 javap 和异常链验证',
        'javap 能展示访问修饰符、字段描述符、方法签名、常量池和 Code 指令，用来核对源码改动是否真的进入 class。运行失败时先保存退出码，再把 stdout 和 stderr 分开记录；异常栈顶指出直接失败方法，向下各层展示传播路径，包装异常还要沿 cause 找到最初根因。只看最后一句错误消息容易漏掉 ClassNotFound、版本不兼容或静态初始化失败的真实层次。',
        '证据链从编译到退出',
        {
          title: 'PowerShell + Java：保留异常栈和进程退出码',
          language: 'PowerShell',
          code: `@'
public class FailureCheck {
  public static void main(String[] args) {
    System.out.println("before");
    Integer.parseInt("not-a-number");
  }
}
'@ | Set-Content FailureCheck.java
javac FailureCheck.java
java FailureCheck 2> failure.log
"exit=$LASTEXITCODE"
Get-Content failure.log -TotalCount 8
javap -c -p FailureCheck | Select-String "Integer.parseInt"`,
          output: `before
exit=1
Exception in thread "main" java.lang.NumberFormatException: For input string: "not-a-number"
  at java.base/java.lang.NumberFormatException.forInputString(...)
  at java.base/java.lang.Integer.parseInt(...)
  at FailureCheck.main(FailureCheck.java:4)

invokevirtual #7 // Method java/lang/Integer.parseInt

栈顶给异常类型，下一层给 JDK 方法，FailureCheck.main 才是调用入口。`,
        },
      ],
    ],
  },
  {
    name: '变量、基本类型与类型转换',
    track: 'P06 · Java / JVM / Spring',
    minutes: 38,
    prerequisite: '能编译运行 Java 程序并读取编译错误。',
    goal: '能正确选择基本类型、引用类型和 var，理解整数溢出、浮点误差、自动装箱与显式类型转换。',
    guidedPractice: '写一个金额和数量计算程序，分别用 int、long、double 和 BigDecimal，比较结果与精度。',
    independentPractice: '修复一个整数溢出和浮点金额比较问题，补充最小值、最大值、符号和精度边界测试，并解释为什么选择该类型。',
    commonErrors: ['用 double 表示精确金额。', '以为类型转换总是安全。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '基本类型直接保存值',
        'byte、short、int、long、float、double、char 和 boolean 直接保存二进制值，各自有固定位宽、默认值和取值范围。整数溢出按照补码规则回绕，窄化转换会截断高位；float 和 double 使用 IEEE 754 符号位、指数和尾数表示近似值。选择类型时先看业务值域和精度，而不是只看当前样例大小；最大值、最小值、零、负数以及加减乘除后的边界都应写入测试。',
        '先确定值域',
        {
          title: 'Java：观察整数边界与回绕',
          language: 'Java',
          code: `public class IntegerBounds {
  public static void main(String[] args) {
    int max = Integer.MAX_VALUE;
    long wide = max;
    int overflow = max + 1;

    System.out.println("max=" + max);
    System.out.println("wide=" + wide);
    System.out.println("overflow=" + overflow);
    System.out.println("longExpression=" + (max + 1L));
  }
}`,
          output: `max=2147483647
wide=2147483647
overflow=-2147483648
longExpression=2147483648

max + 1 先在 int 内计算并回绕；max + 1L 把表达式提升为 long，结果才正确。`,
        },
      ],
      [
        '引用类型指向对象',
        'String、数组、枚举和自定义类变量保存的是对象引用，变量本身不直接包含对象字段。两个引用相等说明它们指向同一个对象，equals 相等则表达业务意义上的内容相同；hashCode 必须与 equals 保持一致，否则 HashMap 和 HashSet 会找不到相等对象。String 字面量可能被常量池复用，new String 则创建不同实例，所以引用比较不能替代内容比较，null 也要在调用对象方法前单独判断。',
        '== 与 equals 分工不同',
        {
          title: 'Java：比较字符串引用与内容',
          language: 'Java',
          code: `public class ReferenceEquality {
  public static void main(String[] args) {
    String literal = "orders";
    String literalAgain = "orders";
    String created = new String("orders");

    System.out.println(literal == literalAgain);
    System.out.println(literal == created);
    System.out.println(literal.equals(created));
    System.out.println(literal.hashCode() == created.hashCode());
  }
}`,
          output: `true
false
true
true

常量池可能复用相同字面量，但业务代码不能依赖。判断对象内容必须使用 equals，判断是否为同一对象才使用 ==。`,
        },
      ],
      [
        'var 只是局部类型推断',
        'var 让编译器根据初始化表达式的静态类型推断局部变量类型，方法参数、字段和返回值不能依赖它。var 不会生成动态变量，也不会改变运行时类型；初始化表达式决定类型后，变量仍受完整类型检查。适合 var 的场景是类型从右侧已经非常清楚，例如 var orders = new ArrayList<Order>()；若右侧是工厂方法或泛型推断，保留显式类型或变量名中的业务含义更能帮助阅读。',
        'var 不改变静态类型',
        {
          title: 'Java：确认 var 的静态类型',
          language: 'Java',
          code: `public class VarInference {
  public static void main(String[] args) {
    var quantity = 3;
    var unitPrice = 14.5;
    var total = quantity * unitPrice;

    System.out.println(quantity + ":" + ((Object) quantity).getClass().getSimpleName());
    System.out.println(unitPrice + ":" + ((Object) unitPrice).getClass().getSimpleName());
    System.out.println(total + ":" + ((Object) total).getClass().getSimpleName());
  }
}`,
          output: `3:Integer
14.5:Double
43.5:Double

var 只是省略左侧类型名，编译后仍是 Integer、Double 等静态类型。重新赋值为不兼容类型会直接编译失败。`,
        },
      ],
      [
        '转换有扩宽、缩窄与装箱',
        'byte 到 int、int 到 long 等扩宽转换通常安全，因为目标类型能表示源类型全部值；long 到 int、double 到 int 等缩窄转换要显式写出，并可能截断小数、丢高位或得到业务上不可接受的值。自动装箱把 int 变成 Integer，拆箱则把对象转回基本值，集合、泛型和 null 混合时可能出现对象分配或 NullPointerException。转换前应验证范围，转换后立刻断言关键边界，避免错误值在后续计算中扩散。',
        '转换风险要写进边界',
        {
          title: 'Java：观察窄化转换和 Integer 缓存',
          language: 'Java',
          code: `public class ConversionBoundary {
  public static void main(String[] args) {
    int roundedDown = (int) 3.9;
    byte wrapped = (byte) 130;
    Integer smallA = 127;
    Integer smallB = 127;
    Integer largeA = 128;
    Integer largeB = 128;

    System.out.println("double-to-int=" + roundedDown);
    System.out.println("int-to-byte=" + wrapped);
    System.out.println("cache127=" + (smallA == smallB));
    System.out.println("cache128=" + (largeA == largeB));
    System.out.println("equals128=" + largeA.equals(largeB));
  }
}`,
          output: `double-to-int=3
int-to-byte=-126
cache127=true
cache128=false
equals128=true

窄化转换会截断或回绕。自动装箱对象比较必须使用 equals，不能用 == 依赖缓存范围。`,
        },
      ],
      [
        '金额和精度要用合适类型',
        'float 和 double 用二进制分数近似表示十进制小数，0.1 与 0.2 相加不一定等于 0.3，因此不能直接承担需要精确结算的金额。BigDecimal 保存十进制精度，但构造方式、scale 和舍入规则仍会改变结果：金额应从字符串或整数分构造，运算时明确小数位和 RoundingMode，比较使用 compareTo。数据库、API、日志和界面还要统一单位是元还是分，避免同一字段在不同层换单位后产生百倍误差。',
        '业务语义决定数值类型',
        {
          title: 'Java：比较 double 与 BigDecimal 金额',
          language: 'Java',
          code: `import java.math.BigDecimal;
import java.math.RoundingMode;

public class MoneyPrecision {
  public static void main(String[] args) {
    double binary = 0.1 + 0.2;
    BigDecimal left = new BigDecimal("0.1");
    BigDecimal right = new BigDecimal("0.2");
    BigDecimal total = left.add(right).setScale(2, RoundingMode.UNNECESSARY);

    System.out.println("double=" + binary);
    System.out.println("doubleEq=" + (binary == 0.3));
    System.out.println("decimal=" + total);
    System.out.println("decimalEq=" + (total.compareTo(new BigDecimal("0.30")) == 0));
  }
}`,
          output: `double=0.30000000000000004
doubleEq=false
decimal=0.30
decimalEq=true

金额由字符串构造 BigDecimal，并显式规定小数位和舍入规则。比较数值使用 compareTo，equals 还会比较 scale。`,
        },
      ],
    ],
  },
  {
    name: '运算符、分支与循环',
    track: 'P06 · Java / JVM / Spring',
    minutes: 36,
    prerequisite: '掌握变量、基本类型和布尔表达式。',
    goal: '能使用运算符、if、switch、for、while 和 break/continue 写出可读的控制流，并避免空指针与边界错误。',
    guidedPractice: '实现一个分数等级和循环统计程序，覆盖边界值、空集合和非法输入。',
    independentPractice: '把一个嵌套五层的条件逻辑改成提前返回和规则表，补充空输入、临界值和非法枚举测试，并保持原行为不变。',
    commonErrors: ['浮点数直接判断相等。', 'switch 分支漏写 break。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '布尔表达式决定分支',
        '条件通常由关系运算、逻辑运算和布尔变量组合而成，&& 与 || 会按短路规则决定右侧是否求值。短路可以避免空指针或不必要计算，但把赋值、函数调用和外部副作用塞进条件会让执行顺序难以测试。复杂条件应先拆成有业务名称的布尔方法，每个方法只回答一个判断；null、空字符串、零值和无权限输入优先用卫语句处理，再进入主流程。',
        '条件要能单独测试',
        {
          title: 'Java：观察 && 与 || 的短路',
          language: 'Java',
          code: `public class ShortCircuit {
  static boolean fail(String name) {
    System.out.println("evaluate:" + name);
    return true;
  }

  public static void main(String[] args) {
    boolean left = false && fail("and-right");
    boolean right = true || fail("or-right");
    boolean both = true && fail("and-both");
    System.out.println(left + "," + right + "," + both);
  }
}`,
          output: `evaluate:and-both
false,true,true

&& 左侧 false、|| 左侧 true 时右侧不执行。依赖短路写业务副作用会制造隐藏行为，条件应尽量保持无副作用。`,
        },
      ],
      [
        'if 适合表达业务规则',
        'if 适合表达少量、顺序明确的业务规则。提前返回把非法输入、缺失配置和无权限情况先处理掉，主流程保持在较低缩进；每个条件应能对应一句业务语言，例如“金额不足”“国家不支持”“状态已终结”。当规则组合快速膨胀时，继续堆叠 if/else 只会隐藏优先级，应改为规则表、策略对象或枚举映射，并用参数化测试固定边界与冲突顺序。',
        '先处理非法和特殊情况',
        {
          title: 'Java：用卫语句降低嵌套',
          language: 'Java',
          code: `public class ShippingRule {
  static String route(String country, int amountCents) {
    if (country == null || country.isBlank()) return "ADDRESS_INVALID";
    if (amountCents <= 0) return "AMOUNT_INVALID";
    if ("CN".equals(country)) {
      return amountCents >= 9900 ? "CN_FREE" : "CN_STANDARD";
    }
    return "INTERNATIONAL";
  }

  public static void main(String[] args) {
    System.out.println(route(null, 9900));
    System.out.println(route("CN", 0));
    System.out.println(route("CN", 9900));
    System.out.println(route("JP", 5000));
  }
}`,
          output: `ADDRESS_INVALID
AMOUNT_INVALID
CN_FREE
INTERNATIONAL

非法和特殊情况先返回，主流程留在最后。独立规则容易逐条测试，也避免五层 if 嵌套。`,
        },
      ],
      [
        'switch 适合有限离散分支',
        'switch 适合枚举、有限状态码和少量固定命令等离散集合。现代 Java 的箭头分支不会自动穿透，switch 表达式还能直接返回值；对枚举做穷尽分支时，新增成员会让编译器提醒遗漏。字符串或数字 switch 仍要明确未知值处理，不能让默认分支悄悄吞掉错误状态。状态转换若涉及复杂条件，应把合法性放在领域方法中，不能只靠 switch 外观判断安全。',
        '离散状态用离散分支',
        {
          title: 'Java：用枚举和 switch 表达式映射状态',
          language: 'Java',
          code: `enum OrderStatus { PENDING, PAID, SHIPPED, CANCELLED }

public class StatusLabel {
  static String label(OrderStatus status) {
    return switch (status) {
      case PENDING -> "待支付";
      case PAID -> "已支付";
      case SHIPPED -> "已发货";
      case CANCELLED -> "已取消";
    };
  }

  public static void main(String[] args) {
    for (OrderStatus status : OrderStatus.values()) {
      System.out.println(status + "=" + label(status));
    }
  }
}`,
          output: `PENDING=待支付
PAID=已支付
SHIPPED=已发货
CANCELLED=已取消

switch 表达式必须覆盖所有枚举值并返回值。新增状态而漏处理会编译失败，比字符串相等更安全。`,
        },
      ],
      [
        '循环需要明确终止条件',
        'for 循环要写清初始化、终止条件和每轮变化，while 要让状态朝终止条件推进，增强 for 则适合完整遍历集合或数组。循环变量应在最小作用域内声明，break 和 continue 只用于表达提前结束或跳过当前项，不能把多个退出状态藏在深层嵌套里。遍历 ArrayList、HashMap 等集合时直接增删结构可能触发 ConcurrentModificationException，应改用迭代器、removeIf 或收集后统一修改。',
        '终止条件必须可证明',
        {
          title: 'Java：循环统计与提前结束',
          language: 'Java',
          code: `import java.util.List;

public class LoopControl {
  public static void main(String[] args) {
    List<Integer> values = List.of(3, 5, 8, 13, 21);
    int total = 0;
    for (int value : values) {
      if (value % 2 == 0) continue;
      total += value;
      if (total >= 20) break;
    }

    int countdown = 3;
    while (countdown > 0) {
      System.out.println("tick=" + countdown);
      countdown--;
    }
    System.out.println("oddTotal=" + total);
  }
}`,
          output: `tick=3
tick=2
tick=1
oddTotal=21

增强 for 负责遍历，continue 跳过偶数，break 在累计达到阈值后结束。while 的 countdown-- 保证终止。`,
        },
      ],
      [
        '边界和空输入最先测试',
        '控制流缺陷最常见于边界：零次、一次、最大次数、空集合、null、非法枚举和刚好达到阈值的输入。测试应把临界值成组列出，并包含临界前一格、临界值、越界值，避免只验证“看着正常”的中间数据。浮点数不能直接用 == 比较金额或计算结果，应使用误差范围、BigDecimal 或整数单位。每个失败分支还要断言错误类型和消息，保证控制流不仅在成功路径正确。',
        '边界测试优先',
        {
          title: 'Java + JUnit：一次覆盖四个控制流边界',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class LevelTest {
  static String level(int score) {
    if (score < 0 || score > 100) return "INVALID";
    if (score >= 90) return "A";
    if (score >= 60) return "PASS";
    return "FAIL";
  }

  @ParameterizedTest
  @CsvSource({ "-1,INVALID", "0,FAIL", "59,FAIL", "60,PASS", "90,A", "101,INVALID" })
  void checksBoundaries(int score, String expected) {
    assertEquals(expected, level(score));
  }
}`,
          output: `✔ checksBoundaries(int, String): 6 tests passed

参数化测试把临界值集中展示：小于零、下界、临界前一格、临界值、上界和越界。`,
        },
      ],
    ],
  },
  {
    name: '方法、参数、返回值与调用栈',
    track: 'P06 · Java / JVM / Spring',
    minutes: 36,
    prerequisite: '能使用变量、分支和循环。',
    goal: '能设计方法签名、重载和返回值，理解值传递、递归、调用栈和异常回溯。',
    guidedPractice: '实现一个参数校验、计算和格式化分层的方法链，在每一步打断点观察调用栈。',
    independentPractice: '重构一个百行长方法，按职责拆成可测试方法，并保持所有边界行为。',
    commonErrors: ['方法既修改参数又返回不同含义。', '重载靠隐式转换产生歧义。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '方法签名表达输入与输出',
        '方法名、参数、返回类型和声明的受检异常共同构成调用契约。参数名要写清单位和含义，返回类型要覆盖正常结果范围，非法输入则使用一致的异常或结果类型表达；不要用 null 同时表示未找到、失败和未初始化。重载方法要靠参数数量和类型清楚区分，避免调用方依赖隐式转换猜分支。方法越小，签名越容易只表达一个动作，也越容易用输入输出测试固定行为。',
        '签名就是小型接口',
        {
          title: 'Java：用小方法表达价格计算契约',
          language: 'Java',
          code: `public class PriceCalculator {
  static long calculateTotal(long unitPriceCents, int quantity) {
    if (unitPriceCents < 0) throw new IllegalArgumentException("unitPriceCents < 0");
    if (quantity <= 0) throw new IllegalArgumentException("quantity <= 0");
    return Math.multiplyExact(unitPriceCents, quantity);
  }

  public static void main(String[] args) {
    System.out.println(calculateTotal(4200, 3));
    try {
      calculateTotal(4200, 0);
    } catch (IllegalArgumentException error) {
      System.out.println(error.getMessage());
    }
  }
}`,
          output: `12600
quantity <= 0

方法名表达动作，参数单位 Cents 明确，返回 long 避免常见金额溢出；非法输入通过单一异常类型表达。`,
        },
      ],
      [
        'Java 参数按值传递',
        'Java 永远按值传递：基本类型复制数值，对象类型复制引用本身。方法可以通过复制的引用修改同一对象的字段，却不能让调用方变量改指向另一个新对象。数组传入方法时同样复制引用，因此方法能修改元素，但重新赋值参数变量只影响方法内部。理解这一区别能解释“为什么对象被改了”“为什么替换参数没生效”以及防御性复制、不可变对象这些设计为何重要。',
        '引用可修改对象，不可换引用',
        {
          title: 'Java：验证参数值复制和引用修改',
          language: 'Java',
          code: `public class PassByValue {
  static class Order {
    int quantity;
    Order(int quantity) { this.quantity = quantity; }
  }

  static void changePrimitive(int value) {
    value = 99;
  }

  static void mutateObject(Order order) {
    order.quantity = 5;
  }

  static void replaceReference(Order order) {
    order = new Order(9);
  }

  public static void main(String[] args) {
    int quantity = 1;
    Order order = new Order(2);
    changePrimitive(quantity);
    mutateObject(order);
    replaceReference(order);
    System.out.println("primitive=" + quantity);
    System.out.println("object=" + order.quantity);
  }
}`,
          output: `primitive=1
object=5

primitive 副本修改不影响调用方；mutateObject 通过复制的引用修改同一对象；replaceReference 只替换局部副本指向。`,
        },
      ],
      [
        '返回值要区分成功与失败',
        '简单计算可以直接返回结果，外部故障或调用方必须处理的非法状态可使用异常，可预期的业务分支则适合 sealed 结果对象。一个方法不能有时返回 null、有时返回错误码、有时又抛异常，否则调用方必须实现三套判断。返回值还应保留足够错误上下文，例如稳定错误码和可行动消息，而不是只返回 boolean。成功与失败类型明确后，测试可以分别覆盖每个分支，API 边界也更容易转换成正确状态码。',
        '错误模型保持一致',
        {
          title: 'Java：用 sealed 结果表达成功与失败',
          language: 'Java',
          code: `public class ParseResultDemo {
  sealed interface ParseResult permits Success, Failure {}
  record Success(int quantity) implements ParseResult {}
  record Failure(String code, String message) implements ParseResult {}

  static ParseResult parseQuantity(String input) {
    try {
      int value = Integer.parseInt(input);
      if (value <= 0) return new Failure("RANGE", "数量必须大于 0");
      return new Success(value);
    } catch (NumberFormatException error) {
      return new Failure("FORMAT", "数量必须是整数");
    }
  }

  public static void main(String[] args) {
    System.out.println(parseQuantity("3"));
    System.out.println(parseQuantity("0"));
    System.out.println(parseQuantity("abc"));
  }
}`,
          output: `Success[quantity=3]
Failure[code=RANGE, message=数量必须大于 0]
Failure[code=FORMAT, message=数量必须是整数]

调用方必须先判断结果类型，不能同时猜 null、异常和返回码。sealed 还保证其他实现不会悄悄加入。`,
        },
      ],
      [
        '调用栈解释执行顺序',
        '每次方法调用都会在当前线程创建栈帧，保存参数、局部变量、返回位置和操作数状态；正常返回时栈帧弹出，异常则沿调用者逐层向上传播，直到被 catch 或终止线程。栈顶通常是最直接的失败位置，栈底附近才是程序入口，中间帧展示传播路径。调试时应从最早业务输入、栈顶异常类型和第一个属于自己项目的栈帧三处交叉定位，不要只看最后一行日志。',
        '从调用关系理解异常',
        {
          title: 'Java：制造并读取三层调用栈',
          language: 'Java',
          code: `public class CallStackDemo {
  static int parse(String input) {
    return Integer.parseInt(input);
  }

  static int quantity(String input) {
    return parse(input);
  }

  public static void main(String[] args) {
    System.out.println("entry");
    quantity("many");
  }
}`,
          output: `entry
Exception in thread "main" java.lang.NumberFormatException: For input string: "many"
  at java.base/java.lang.Integer.parseInt(Integer.java:...)
  at CallStackDemo.parse(CallStackDemo.java:3)
  at CallStackDemo.quantity(CallStackDemo.java:7)
  at CallStackDemo.main(CallStackDemo.java:12)

栈顶是异常发生处，中间的 parse/quantity 是传播路径，main 是入口。修复前先确认真正无效输入来自哪里。`,
        },
      ],
      [
        '小方法与行为测试',
        '一个方法最好对应一个可以用业务语言命名的行为，例如计算总价、校验库存或格式化错误，而不是同时读输入、查数据库、计算和打印。重构百行长方法时先补行为测试，覆盖正常、边界、错误和状态变化，再按职责拆分；原方法只负责编排，子方法保持可独立测试。每次只改变一处结构并重跑同一组断言，如果测试必须大改才能通过，说明重构可能改变了外部契约。',
        '每次重构保持行为不变',
        {
          title: 'Java + JUnit：为拆分后的方法锁定行为',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

class PriceCalculatorTest {
  @Test
  void multipliesUnitPriceAndQuantity() {
    assertEquals(12600, PriceCalculator.calculateTotal(4200, 3));
  }

  @Test
  void rejectsNonPositiveQuantity() {
    IllegalArgumentException error = assertThrows(
      IllegalArgumentException.class,
      () -> PriceCalculator.calculateTotal(4200, 0)
    );
    assertEquals("quantity <= 0", error.getMessage());
  }
}`,
          output: `✔ multipliesUnitPriceAndQuantity()
✔ rejectsNonPositiveQuantity()
Tests 2 passed

测试锁定正常结果和错误消息。拆分长方法后重跑同一组行为测试，才能证明重构没有改变契约。`,
        },
      ],
    ],
  },
  {
    name: '数组、字符串与命令行输入',
    track: 'P06 · Java / JVM / Spring',
    minutes: 40,
    prerequisite: '能编写方法和控制流。',
    goal: '能安全使用数组、String、StringBuilder 和 Scanner，处理索引边界、不可变字符串和用户输入。',
    guidedPractice: '实现一个命令行词频统计器，读取多行输入，拆分单词并按频率排序。',
    independentPractice: '修复数组越界、空输入和 Unicode 字符处理问题，补边界测试。',
    commonErrors: ['数组长度与最后索引混淆。', '循环中反复拼接大字符串。'],
    sourceRefs: [JAVA_API, JAVA_SPECS],
    steps: [
      [
        '数组长度固定且索引从零开始',
        '数组创建后长度固定，元素按从零开始的连续索引访问，合法范围是 0 到 length - 1。读取或写入越界会抛 ArrayIndexOutOfBoundsException，负索引也非法；数组变量可以为 null，调用 length 或访问元素前要区分空数组与未初始化引用。循环条件应使用 index < values.length，外部输入转换为索引时还要先验证范围。异常中的索引和长度能帮助定位第一个越界位置，但根因通常在循环终止条件或输入校验。',
        '边界检查先于访问',
        {
          title: 'Java：观察合法索引与越界异常',
          language: 'Java',
          code: `public class ArrayBounds {
  public static void main(String[] args) {
    int[] values = { 10, 20, 30 };
    System.out.println("length=" + values.length);
    System.out.println("first=" + values[0]);
    System.out.println("last=" + values[values.length - 1]);
    try {
      System.out.println(values[3]);
    } catch (ArrayIndexOutOfBoundsException error) {
      System.out.println(error.getMessage());
    }
  }
}`,
          output: `length=3
first=10
last=30
Index 3 out of bounds for length 3

最后一个合法索引是 length - 1。异常直接给出越界索引和数组长度，应优先检查循环终止条件和外部输入。`,
        },
      ],
      [
        'String 是不可变对象',
        'String 的内容在创建后不可变，substring、concat、replace 等操作返回新对象，原引用保持不变。少量拼接可读性优先，循环或大文本累积应使用 StringBuilder，避免每轮生成临时字符串和复制字符数组。StringBuilder 也只是一个可变缓冲区，不是线程安全的共享类型；跨线程共享时要明确同步或改为不可变快照。最终调用 toString 后得到稳定字符串，之后不应再修改 builder 假设结果会同步变化。',
        '不可变带来安全也带来分配',
        {
          title: 'Java：比较字符串拼接与 StringBuilder',
          language: 'Java',
          code: `public class StringBuildDemo {
  public static void main(String[] args) {
    String source = "order";
    String appended = source.concat("-1001");
    StringBuilder builder = new StringBuilder(source.length() + 8);
    builder.append(source).append("-1001");

    System.out.println("source=" + source);
    System.out.println("appended=" + appended);
    System.out.println("builder=" + builder);
    System.out.println("sameObject=" + (source == appended));
  }
}`,
          output: `source=order
appended=order-1001
builder=order-1001
sameObject=false

concat 和 + 会产生新字符串；StringBuilder 在循环中复用可变缓冲区。固定少量拼接优先保持简单。`,
        },
      ],
      [
        '字符、码点和用户可见字符不同',
        'Java char 是 16 位 UTF-16 代码单元，基本拉丁字符通常占一个 char，但 emoji 等增补字符占两个代理项，带组合重音的可见字符还可能由多个码点组成。String.length 返回代码单元数量，codePointCount 返回码点数量，字素簇则更接近用户感知字符。涉及截断、反转、光标移动和长度限制时，应先确认业务需要哪一种单位，不能简单用 substring 按 char 切割，否则可能留下半个代理项。',
        '字符长度不总是用户字符数',
        {
          title: 'Java：比较 UTF-16 长度与码点数量',
          language: 'Java',
          code: `public class UnicodeBoundary {
  public static void main(String[] args) {
    String text = "A😀B";
    System.out.println("chars=" + text.length());
    System.out.println("codePoints=" + text.codePointCount(0, text.length()));
    text.codePoints().forEach(codePoint ->
      System.out.println(Integer.toHexString(codePoint))
    );
  }
}`,
          output: `chars=4
codePoints=3
41
1f600
42

emoji 需要两个 UTF-16 code unit。反转、截断和计数应按业务要求选择 codePoint 或字素簇，不能直接按 char。`,
        },
      ],
      [
        '命令行输入需要校验',
        'Scanner 按分隔符切分文本，再按 nextInt、nextLine 等方法解析目标类型；换行符、空白和不同方法的读取边界容易混用。非法数字会抛 InputMismatchException，流结束会得到 hasNext 为 false，空输入也可能产生空集合而不是异常。命令行程序必须定义空行、退出命令、无输入和非法格式的行为，并返回稳定退出码。测试时把标准输入和标准输出包装在边界层，业务解析保持纯函数，避免测试依赖真实控制台。',
        '输入边界属于业务边界',
        {
          title: 'PowerShell + Java：读取命令行词频输入',
          language: 'PowerShell',
          code: `@'
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Scanner;

public class WordCount {
  public static void main(String[] args) {
    Map<String, Integer> counts = new LinkedHashMap<>();
    try (Scanner scanner = new Scanner(System.in)) {
      while (scanner.hasNextLine()) {
        String line = scanner.nextLine().trim();
        if (line.isEmpty()) continue;
        for (String word : line.split("\\\\s+")) {
          counts.merge(word.toLowerCase(), 1, Integer::sum);
        }
      }
    }
    if (counts.isEmpty()) {
      System.err.println("INPUT_EMPTY");
      System.exit(2);
    }
    counts.forEach((word, count) -> System.out.println(word + "=" + count));
  }
}
'@ | Set-Content WordCount.java
javac WordCount.java
@("Java java", "scanner") | java WordCount
"emptyExit=2"`,
          output: `java=2
scanner=1
emptyExit=2

空行被跳过，单词转小写后计数。完全没有输入时返回稳定错误和退出码 2，而不是输出空结果假装成功。`,
        },
      ],
      [
        '从纯函数开始测试',
        '把拆分、统计、排序和格式化提取成接收字符串或集合并返回结果的方法，输入相同就必须得到相同输出，不直接读写 System.in、System.out 或静态可变状态。命令行 main 只负责收集输入、调用纯函数、输出结果和设置退出码。这样测试可以覆盖空字符串、连续空白、大小写、Unicode、排序稳定性和超大输入，不必启动真实进程。边界层再单独做少量集成测试，定位失败时也能区分业务错误和输入输出错误。',
        'I/O 与业务逻辑分离',
        {
          title: 'Java + JUnit：测试纯词频函数',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WordCounterTest {
  static Map<String, Integer> count(String text) {
    return java.util.Arrays.stream(text.trim().split("\\\\s+"))
      .filter(word -> !word.isBlank())
      .map(String::toLowerCase)
      .collect(java.util.stream.Collectors.toMap(
        word -> word,
        word -> 1,
        Integer::sum
      ));
  }

  @Test
  void countsWordsIgnoringCase() {
    assertEquals(Map.of("java", 2, "scanner", 1), count("Java java scanner"));
  }
}`,
          output: `✔ countsWordsIgnoringCase()
Tests 1 passed

业务函数只接收字符串并返回 Map，不直接读 System.in。命令行适配器负责 I/O，测试无需模拟标准输入。`,
        },
      ],
    ],
  },
  {
    name: '包、目录、Maven/Gradle 与项目骨架',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '能编写多个类和命令行程序。',
    goal: '能从空目录建立规范 Java 项目，理解 package、源码目录、依赖、构建生命周期和可执行 JAR。',
    guidedPractice: '用 Maven 或 Gradle 建立 src/main/java 与 src/test/java，加入一个依赖并生成可执行制品。',
    independentPractice: '删除构建工具生成内容，按 README 重建目录并解释每个配置文件的职责。',
    commonErrors: ['package 名与目录不一致。', '只会在 IDE 点运行，不会命令行构建。'],
    sourceRefs: [MAVEN, GRADLE, GIT],
    steps: [
      [
        '包名对应目录和命名空间',
        'package 把类分组并形成全限定名，既避免不同库之间的简单类名冲突，也表达模块、领域和发布边界。公开类文件应位于与 package 完全对应的目录，例如 com.example.orders.Order 放在 com/example/orders/Order.java。源码目录层级错误、package 声明缺包子句或大小写不一致，都会导致 javac 找不到类。包名还会进入 import、配置、反射和序列化兼容性，因此创建后应保持稳定。',
        '包结构表达模块边界',
        {
          title: 'PowerShell + Java：从包目录编译并运行',
          language: 'PowerShell',
          code: `$src = 'src/main/java/com/example/orders'
New-Item -ItemType Directory -Force $src | Out-Null
@'
package com.example.orders;

public class OrderApp {
  public static void main(String[] args) {
    System.out.println("package-ok");
  }
}
'@ | Set-Content "$src/OrderApp.java"
javac -d out (Get-ChildItem src -Recurse -Filter *.java).FullName
java -cp out com.example.orders.OrderApp
Get-ChildItem out -Recurse -Filter *.class | Select-Object FullName`,
          output: `package-ok

FullName
C:\\work\\demo\\out\\com\\example\\orders\\OrderApp.class

类必须使用全限定名启动；class 输出目录也按包结构展开。`,
        },
      ],
      [
        '标准目录让工具可预测',
        'Maven 和 Gradle 通过固定目录约定发现生产源码、测试源码和资源：src/main/java 放生产代码，src/main/resources 放运行配置和静态资源，src/test/java 放测试代码，src/test/resources 放测试夹具。工具能推断编译顺序、测试类路径和打包内容，IDE 也按同一约定建立模块。把测试放进 main 会把测试依赖带入生产制品，把真实 secrets 放进 resources 则可能直接被打进 JAR。',
        '目录约定也是接口',
        {
          title: 'PowerShell：生成标准 Maven 骨架并运行测试',
          language: 'PowerShell',
          code: `mvn archetype:generate -DgroupId=com.example -DartifactId=orders-demo -DinteractiveMode=false
Set-Location orders-demo
Get-ChildItem -Recurse src | Select-Object FullName
mvn -q test
Get-ChildItem target -Force | Select-Object Name`,
          output: `src/main/java/com/example/App.java
src/main/resources
src/test/java/com/example/AppTest.java
src/test/resources

Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
classes
test-classes
surefire-reports

生产 class 与测试 class 进入不同输出目录；测试夹具和测试依赖不会自动进入最终 JAR。`,
        },
      ],
      [
        '依赖声明不等于依赖存在',
        '构建文件声明某个库之后，Maven/Gradle 还要解析直接与传递依赖、选择版本、从仓库下载并建立类路径。同一库可能被多条路径以不同版本引入，最终解析版本未必等于你写的那一行；仓库不可达、校验失败或企业镜像缺包也会让构建失败。排查时先运行依赖树，确认实际版本和来源，再看最终 JAR 或 lib 目录，不能只凭 pom.xml 猜。',
        '构建输入必须锁定',
        {
          title: 'PowerShell：查看依赖树和运行时类路径',
          language: 'PowerShell',
          code: `mvn dependency:tree -Dincludes=com.fasterxml.jackson.core:jackson-databind
mvn dependency:build-classpath -Dmdep.outputFile=classpath.txt
Get-Content classpath.txt
mvn -q package
jar tf target/orders-demo-1.0-SNAPSHOT.jar | Select-String jackson`,
          output: `com.fasterxml.jackson.core:jackson-databind:jar:2.17.2:compile

classpath.txt 中列出实际解析后的 jar 路径。

若最终 JAR 不包含第三方依赖，说明它是薄 JAR，需要 lib 目录、classpath 或 Shade/Boot 插件生成可执行制品。`,
        },
      ],
      [
        '理解编译、测试、打包、发布',
        'Maven/Gradle 生命周期把验证、编译、测试、打包、安装和部署拆成阶段，每一步读取上一步产物并可能失败。clean 删除构建目录，compile 只编译生产代码，test 运行测试，package 生成 JAR/WAR，verify 执行集成检查。生产部署应拿到测试过的固定制品和校验和，不能登录服务器后再临时下载依赖和编译，否则部署环境、网络和源码状态都会成为未受控变量。',
        '每条命令产出明确文件',
        {
          title: 'PowerShell：清理、测试、打包并检查制品',
          language: 'PowerShell',
          code: `mvn clean verify
"exit=$LASTEXITCODE"
Get-FileHash target/orders-demo-1.0-SNAPSHOT.jar -Algorithm SHA256
jar tf target/orders-demo-1.0-SNAPSHOT.jar | Select-Object -First 12
java -jar target/orders-demo-1.0-SNAPSHOT.jar`,
          output: `Tests run: 3, Failures: 0, Errors: 0
exit=0

SHA256 98D2...A71C
META-INF/MANIFEST.MF
com/example/App.class

若 manifest 没有 Main-Class，java -jar 报 no main manifest attribute；应修打包插件，而不是拿 IDE 结果当制品。`,
        },
      ],
      [
        'Git 与构建文件同步管理',
        'pom.xml/build.gradle、wrapper、锁文件和 README 都是构建输入，必须进入版本控制；target、build、.idea 和本地 .env 属于生成或私有文件，不应提交。README 要记录 JDK 版本、构建工具版本、依赖下载方式、测试命令、打包命令、运行命令和常见失败。这样新成员从干净克隆开始，按同一条路径生成相同制品；如果离开某台机器缓存就无法构建，说明依赖输入还未被完整管理。',
        '新成员能按文档复现',
        {
          title: 'PowerShell + Git：检查提交边界和干净重建',
          language: 'PowerShell',
          code: `Get-Content .gitignore
git status --short
git check-ignore -v target mvnw mvnw.cmd pom.xml
mvn clean verify
java -jar target/orders-demo-1.0-SNAPSHOT.jar`,
          output: `target/
*.log
.env

target/ 被 .gitignore 命中；pom.xml、mvnw、mvnw.cmd 未被忽略。
Tests run: 3, Failures: 0, Errors: 0
package-ok

目标是在新克隆、干净缓存环境下复现；README 缺少 JDK 或 Wrapper 版本时，首次构建仍不可交接。`,
        },
      ],
    ],
  },
  {
    name: '调试器、异常信息与第一个测试',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '能从命令行或 IDE 运行多类 Java 项目。',
    goal: '能设置断点、观察变量、阅读异常栈，并用 JUnit 写第一个可重复测试。',
    guidedPractice: '制造空指针、数组越界和断言失败，逐一从栈顶、cause 和输入定位，再写测试复现。',
    independentPractice: '为一个字符串工具建立测试集，覆盖正常、空值和边界输入，并修复一个真实缺陷。',
    commonErrors: ['只打印“出错了”，不保留异常栈。', '测试依赖执行顺序和真实时间。'],
    sourceRefs: [JUNIT, JAVA_API],
    steps: [
      [
        '先稳定复现问题',
        '稳定复现要固定输入、执行步骤、JDK 版本、操作系统、工作目录和配置，再记录期望结果与实际结果。最小样例应删除与故障无关的框架和业务字段，只保留触发路径；如果问题只能偶发出现，就增加关联 ID、时间、并发量和关键状态日志。没有稳定复现就开始改代码，会把修复建立在猜测上，也无法证明问题真的消失。',
        '复现是调试起点',
        {
          title: 'PowerShell + Java：把故障缩成单文件样例',
          language: 'PowerShell',
          code: `@'
public class Reproduce {
  public static void main(String[] args) {
    String value = null;
    System.out.println("before");
    System.out.println(value.trim());
  }
}
'@ | Set-Content Reproduce.java
javac -encoding UTF-8 Reproduce.java
java Reproduce 2> reproduce.log
"exit=$LASTEXITCODE"
Get-Content reproduce.log -TotalCount 8`,
          output: `before
exit=1
Exception in thread "main" java.lang.NullPointerException:
  Cannot invoke "String.trim()" because "value" is null
  at Reproduce.main(Reproduce.java:5)

记录 JDK、命令、输出和退出码后，样例已经能稳定复现，下一步才是定位 value 为什么为 null。`,
        },
      ],
      [
        '断点让状态可见',
        '断点暂停程序并展示当前线程、调用栈、局部变量和对象引用，比连续打印更接近真实状态。条件断点只在某个订单 ID、输入长度或循环下标命中时暂停，适合高频调用和偶发数据。调试时先看事实：参数是否 null、集合是否为空、分支是否按预期进入，再形成假设并单步验证。修改变量或跳过帧只用于诊断，不能把这些调试操作当成生产修复。',
        '先看事实，再猜原因',
        {
          title: 'JDK jdb：在异常入口暂停并查看变量',
          language: 'PowerShell',
          code: `javac -g Reproduce.java
jdb Reproduce

# jdb 交互命令
stop in Reproduce.main
run
locals
print value
where
cont`,
          output: `Breakpoint hit: "thread=main", Reproduce.main(), line=4 bci=0
main[1] locals
Method arguments:
Local variables:
value = null
main[1] where
[1] Reproduce.main (Reproduce.java:4)

locals 直接证明 value 尚未赋值；where 展示当前线程调用链。IDE 断点提供相同信息。`,
        },
      ],
      [
        '异常链要读到底层 cause',
        '外层异常常被用于添加业务上下文，真正的根因保存在 cause 中。例如订单服务包装 SQLException，API 再包装业务异常；只打印最外层 message 会丢失连接拒绝、约束冲突或超时类型。异常栈应保留异常类型、消息、cause、业务 ID 和 requestId，同时用 getRootCause 或循环遍历 cause 定位最底层。catch 后既不处理也不重抛会彻底吞掉证据。',
        '不要用空 catch 吞掉原因',
        {
          title: 'Java：保留 cause 并打印根因',
          language: 'Java',
          code: `public class CauseChain {
  static void load() {
    try {
      throw new IllegalStateException("database unavailable");
    } catch (RuntimeException cause) {
      throw new RuntimeException("load order failed: O-1001", cause);
    }
  }

  public static void main(String[] args) {
    try {
      load();
    } catch (RuntimeException error) {
      Throwable root = error;
      while (root.getCause() != null) root = root.getCause();
      System.out.println("outer=" + error.getMessage());
      System.out.println("root=" + root.getMessage());
    }
  }
}`,
          output: `outer=load order failed: O-1001
root=database unavailable

构造 RuntimeException(message, cause) 保留原始异常；日志应记录完整异常链，而不只是 outer。`,
        },
      ],
      [
        '测试固定可观察行为',
        'Arrange 准备输入和依赖，Act 执行一个业务动作，Assert 检查调用方能够观察到的结果或错误。测试名应描述条件和预期，例如 rejectsZeroQuantity；断言应围绕一个行为概念，覆盖关键状态和失败后副作用。不要断言私有字段、内部调用顺序或临时日志，否则重构会频繁坏掉。测试数据要自包含，执行顺序、真实时间和外部网络都不应改变结果。',
        '测试是行为证据',
        {
          title: 'Java + JUnit：AAA 结构与异常断言',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

class PriceCalculatorTest {
  @Test
  void multipliesUnitPriceAndQuantity() {
    long unitPrice = 4200;
    int quantity = 3;

    long total = PriceCalculator.calculateTotal(unitPrice, quantity);

    assertEquals(12600, total);
  }

  @Test
  void rejectsZeroQuantity() {
    IllegalArgumentException error = assertThrows(
      IllegalArgumentException.class,
      () -> PriceCalculator.calculateTotal(4200, 0)
    );
    assertEquals("quantity <= 0", error.getMessage());
  }
}`,
          output: `✔ multipliesUnitPriceAndQuantity()
✔ rejectsZeroQuantity()
Tests 2 passed

测试只依赖公开方法和错误契约，不依赖 calculateTotal 内部如何拆分。`,
        },
      ],
      [
        '测试先于重构',
        '发现缺陷后先写一个应该在当前代码上失败的测试，确认失败原因正是报告中的问题，再修改实现。修复后同一测试应通过，同时保留原有回归测试，证明没有破坏其他行为。重构阶段不改变测试表达的外部契约，只调整内部结构；如果为了通过必须重写大量断言，说明行为边界本身被改变了，需要重新评审需求。',
        '每个修复都有回归保护',
        {
          title: 'Java + JUnit：失败测试驱动修复',
          language: 'Java',
          code: `@Test
void preservesInputOrderForEqualTotals() {
  List<String> result = OrderSorter.sort(List.of(
    new Order("O-1", 100),
    new Order("O-2", 100),
    new Order("O-3", 50)
  ));

  assertEquals(List.of("O-1", "O-2", "O-3"), result.stream().map(Order::id).toList());
}

// 1. 先运行：当前实现可能输出 O-2,O-1,O-3 → 失败
// 2. 修复比较器，保证总价相同按原顺序稳定排序
// 3. 重跑该测试和原有排序测试`,
          output: `修复前：expected [O-1, O-2, O-3] but was [O-2, O-1, O-3]
修复后：✔ preservesInputOrderForEqualTotals()

失败测试、修复差异和通过输出共同构成回归证据。`,
        },
      ],
    ],
  },
  {
    name: '类、对象、字段与方法',
    track: 'P06 · Java / JVM / Spring',
    minutes: 40,
    prerequisite: '熟悉变量、方法和多文件项目。',
    goal: '能从业务概念建立类与对象，区分静态成员、实例成员、字段封装和方法职责。',
    guidedPractice: '建立 Order、Customer 和 OrderItem 类，创建对象并调用计算方法，观察对象身份和状态。',
    independentPractice: '把一组散落的 Map 和函数重构成带不变量的小型领域对象。',
    commonErrors: ['用 public 字段暴露所有状态。', '一个类同时负责存储、计算、打印和数据库。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '类是类型，对象是实例',
        '类是编译期类型和运行时对象的模板，定义字段结构、方法、构造器和访问规则；对象是 new 后在堆上创建的具体实例，每个实例拥有独立字段值。两个引用变量可以指向同一对象，所以通过任一引用修改状态，另一方也能看到；两个内容相同但分别 new 的对象仍是不同实例。调试对象问题时，要同时区分类型、引用身份和字段快照。',
        '类型与实例分开',
        {
          title: 'Java：观察对象独立状态与共享引用',
          language: 'Java',
          code: `class Counter {
  int value;
  Counter(int value) { this.value = value; }
}

public class ObjectIdentity {
  public static void main(String[] args) {
    Counter first = new Counter(1);
    Counter second = new Counter(1);
    Counter alias = first;
    alias.value = 9;

    System.out.println(first == second);
    System.out.println(first == alias);
    System.out.println(first.value + "," + second.value);
  }
}`,
          output: `false
true
9,1

first 与 second 是两个实例；alias 与 first 指向同一对象，因此修改通过 alias 可见。`,
        },
      ],
      [
        '静态成员属于类型',
        'static 字段和方法属于 Class 对象，而不是某个实例，所有实例和调用方共享同一个静态字段。static 适合无状态工具方法、常量和进程级单例，不适合保存当前用户、当前请求、订单草稿等请求级状态；多个线程或用户会互相覆盖。静态初始化在类首次主动使用时执行一次，失败会留下 NoClassDefFoundError。业务对象通常使用实例字段，进程级资源则明确交给容器管理。',
        '避免用静态变量存请求状态',
        {
          title: 'Java：验证静态共享与实例隔离',
          language: 'Java',
          code: `class RequestContext {
  static String currentUser;
  String instanceUser;

  RequestContext(String user) {
    currentUser = user;
    instanceUser = user;
  }
}

public class StaticState {
  public static void main(String[] args) {
    RequestContext first = new RequestContext("Ada");
    RequestContext second = new RequestContext("Grace");
    System.out.println(RequestContext.currentUser);
    System.out.println(first.instanceUser);
    System.out.println(second.instanceUser);
  }
}`,
          output: `Grace
Ada
Grace

currentUser 被第二次构造覆盖，证明它不能表达请求级用户。实例字段才分别保存 Ada 和 Grace。`,
        },
      ],
      [
        '封装保护不变量',
        '封装不是机械添加 getter/setter，而是让对象只能通过合法业务动作改变状态。字段保持 private，构造器建立初始不变量，修改方法在同一处校验并更新相关字段。例如订单状态和支付时间必须同步变化，就不能分别暴露 setter。调用方看到的是可命名业务能力，而不是对象内部数据布局，后续修改存储方式也更容易。',
        '对象创建后保持合法',
        {
          title: 'Java：用私有字段和方法维护订单状态',
          language: 'Java',
          code: `public class OrderState {
  private String status = "PENDING";
  private String paidAt;

  public void pay(String timestamp) {
    if (!"PENDING".equals(status)) throw new IllegalStateException("NOT_PAYABLE");
    if (timestamp == null || timestamp.isBlank()) throw new IllegalArgumentException("PAID_AT");
    status = "PAID";
    paidAt = timestamp;
  }

  public String status() { return status; }
  public String paidAt() { return paidAt; }
}`,
          output: `status 与 paidAt 只能通过 pay 一起改变；重复支付会抛 NOT_PAYABLE。

外部无法把 status 单独设成 PAID 而漏掉 paidAt，非法状态被封装在对象内部阻止。`,
        },
      ],
      [
        '方法职责要可命名',
        '一个方法应对应一个可以用业务语言命名的行为，例如 calculateTotal、addItem、markPaid，而不是同时查询数据库、计算、打印并发送邮件。查询方法应返回结果，不修改状态；修改方法应表达动作并维护不变量；持久化、HTTP、日志和消息交给应用服务或适配器。方法职责清晰后，单测可以直接构造真实对象，不需要启动数据库和 Web 容器。',
        '领域对象不承担基础设施',
        {
          title: 'Java：把业务计算与打印持久化分开',
          language: 'Java',
          code: `import java.util.ArrayList;
import java.util.List;

class Order {
  private final List<Integer> cents = new ArrayList<>();

  void addItem(int priceCents) {
    if (priceCents < 0) throw new IllegalArgumentException("PRICE");
    cents.add(priceCents);
  }

  long totalCents() {
    return cents.stream().mapToLong(Integer::longValue).sum();
  }
}

System.out.println(order.totalCents());

// 打印、JDBC、HTTP 和消息发送放在应用服务/适配器
repository.save(order);
mailer.sendReceipt(order);`,
          output: `addItem 只维护订单明细不变量，totalCents 只查询，repository 和 mailer 位于边界。

若 order 同时打开数据库连接和发邮件，测试必须准备基础设施，职责也无法用一句业务语言命名。`,
        },
      ],
      [
        '对象身份与相等性分开',
        '== 判断两个引用是否指向同一对象，equals 表达业务上是否相等。equals 与 hashCode 必须基于稳定字段并保持一致：相等对象哈希相同，不相等对象也允许碰撞。订单通常按全局订单 ID 判等，数据库实体按主键判等；可变业务字段不适合进入哈希。继承、代理和 JPA 延迟对象还会让 equals 设计更复杂，必须先明确业务主键和生命周期。',
        '引用相等不等于业务相等',
        {
          title: 'Java：为订单定义 equals 与 hashCode',
          language: 'Java',
          code: `import java.util.Objects;

final class OrderId {
  private final String value;

  OrderId(String value) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException("ORDER_ID");
    this.value = value;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof OrderId id && value.equals(id.value);
  }

  @Override
  public int hashCode() {
    return Objects.hash(value);
  }
}

OrderId first = new OrderId("O-1001");
OrderId second = new OrderId("O-1001");
System.out.println(first == second);
System.out.println(first.equals(second));`,
          output: `false
true

两个对象身份不同，但业务主键同为 O-1001。value 为 final，避免放入集合后哈希值变化。`,
        },
      ],
    ],
  },
  {
    name: '构造器、this 与对象初始化',
    track: 'P06 · Java / JVM / Spring',
    minutes: 38,
    prerequisite: '会创建类与对象并调用方法。',
    goal: '能设计构造器、重载、this、静态初始化和不可变对象，理解对象创建顺序。',
    guidedPractice: '设计一个不可变订单编号类，使用构造器校验、this 链式调用和静态常量，观察初始化顺序。',
    independentPractice: '修复一个构造器过早泄漏 this 导致半初始化对象被使用的问题。',
    commonErrors: ['构造器只赋值不校验。', '在构造器中启动线程或调用可覆写方法。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '构造器建立初始合法状态',
        '构造器负责让对象创建完成后立即满足全部不变量，而不是先创建一个字段缺失的“半对象”等待调用方补齐。参数为空、金额为负、开始时间晚于结束时间或状态与时间矛盾时，应在对象发布前抛异常。构造器也不应执行难以回滚的外部副作用；需要磁盘、网络或消息时，把对象构造与生命周期动作分开。创建成功即合法，能减少所有下游方法重复检查。',
        '非法对象不能创建成功',
        {
          title: 'Java：构造器校验订单金额和客户',
          language: 'Java',
          code: `final class Order {
  private final String customerId;
  private final long totalCents;

  Order(String customerId, long totalCents) {
    if (customerId == null || customerId.isBlank()) throw new IllegalArgumentException("CUSTOMER");
    if (totalCents < 0) throw new IllegalArgumentException("TOTAL");
    this.customerId = customerId;
    this.totalCents = totalCents;
  }
}

try {
  new Order("", -1);
} catch (IllegalArgumentException error) {
  System.out.println(error.getMessage());
}`,
          output: `CUSTOMER

只要构造成功，customerId 与 totalCents 一定满足规则；所有实例方法无需再次防御这些非法状态。`,
        },
      ],
      [
        'this 表示当前实例',
        'this 是当前对象引用；this.field 用于区分同名字段和参数，this.method() 调用当前实例方法，this(...) 只能出现在构造器第一行，用于委派到同类另一个构造器。构造器重载应让最简单构造器最终汇聚到一个完整入口，其他构造器只填默认值后调用它，避免多条初始化路径逐渐不一致。构造器链不是继承调用，super(...) 才用于父类构造。',
        '初始化路径保持单一',
        {
          title: 'Java：用 this(...) 汇聚构造器链',
          language: 'Java',
          code: `final class Customer {
  private final String id;
  private final String name;
  private final boolean active;

  Customer(String id) {
    this(id, id, true);
  }

  Customer(String id, String name) {
    this(id, name, true);
  }

  Customer(String id, String name, boolean active) {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("ID");
    this.id = id;
    this.name = name == null ? "" : name.trim();
    this.active = active;
  }
}`,
          output: `前两个构造器都委派到完整构造器，校验和字段赋值只维护一份。

若每个构造器各写一套赋值，新增字段时很容易漏掉某条入口。`,
        },
      ],
      [
        '静态初始化先于实例使用',
        '类第一次被主动使用时会执行静态字段初始化和静态代码块，随后才创建实例。静态初始化只应做确定、快速、无外部依赖的准备工作，例如常量和不可变映射；读取文件、连接数据库、访问环境变量或启动线程会让类加载时机难以预测。静态块抛异常会包装成 ExceptionInInitializerError，后续使用同一类常见 NoClassDefFoundError。',
        '静态初始化要简单',
        {
          title: 'Java：观察静态块与实例块顺序',
          language: 'Java',
          code: `class InitOrder {
  static int version = 1;
  static { System.out.println("static:" + version); }

  { System.out.println("instance-block"); }

  InitOrder() {
    System.out.println("constructor");
  }

  public static void main(String[] args) {
    System.out.println("main");
    new InitOrder();
  }
}`,
          output: `static:1
main
instance-block
constructor

静态初始化先发生一次，实例块和构造器在每次 new 时执行。静态块中不要连接数据库或启动后台服务。`,
        },
      ],
      [
        '避免构造期间泄漏 this',
        '构造器执行完成前对象仍可能缺少字段，把 this 传给事件总线、线程池、缓存或可覆写方法会让外部提前持有半初始化对象。可覆写方法在子类中可能访问尚未初始化的子类字段，启动线程也可能在构造结束前读取对象状态。正确做法是先完成构造和校验，再通过工厂方法显式 start/register，或把依赖注入与生命周期启动分离。',
        '对象先构造完再发布',
        {
          title: 'Java：把注册动作移出构造器',
          language: 'Java',
          code: `class BadListener {
  private final String id;
  BadListener(Registry registry) {
    registry.add(this); // 错误：外部可能立刻调用 before id 赋值
    this.id = "L-1";
  }
  String id() { return id; }
}

final class SafeListener {
  private final String id;
  private SafeListener(String id) { this.id = id; }

  static SafeListener createAndRegister(String id, Registry registry) {
    SafeListener listener = new SafeListener(id);
    registry.add(listener);
    return listener;
  }
}`,
          output: `BadListener 注册时 id 仍为 null；SafeListener 先完成构造，再发布到 Registry。

工厂方法显式表达“构造 + 注册”两个阶段，失败时可以停止注册。`,
        },
      ],
      [
        '不可变对象优先',
        '不可变对象的所有字段在构造时确定且之后不变，通常使用 final、私有字段、不可变组件和防御性复制。它可以安全跨线程共享，equals/hashCode 稳定，也更容易推理状态转换。不可变不代表所有业务对象永远不变，而是每次变化创建新值；订单状态机可以返回新快照，由存储层按版本更新。对集合和日期等可变组件要先复制或转成不可变视图。',
        '不可变降低并发风险',
        {
          title: 'Java：record 与不可变订单快照',
          language: 'Java',
          code: `import java.time.Instant;
import java.util.List;

record OrderSnapshot(String id, long totalCents, List<String> items, Instant createdAt) {
  OrderSnapshot {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("ID");
    if (totalCents < 0) throw new IllegalArgumentException("TOTAL");
    items = List.copyOf(items);
  }
}

OrderSnapshot first = new OrderSnapshot("O-1", 4200, List.of("A"), Instant.now());
OrderSnapshot paid = new OrderSnapshot(first.id(), first.totalCents(), first.items(), first.createdAt());
System.out.println(first.items() == paid.items());`,
          output: `true

List.copyOf 防止外部修改内部集合；创建新快照表达状态变化，不原地修改旧对象。`,
        },
      ],
    ],
  },
  {
    name: '封装、访问控制与不变量',
    track: 'P06 · Java / JVM / Spring',
    minutes: 38,
    prerequisite: '掌握类、构造器和实例方法。',
    goal: '能用访问控制和领域方法维护不变量，识别无效状态、可变集合泄漏和贫血模型。',
    guidedPractice: '设计一个账户余额类，禁止直接改字段，并测试转账、扣款和异常后的状态。',
    independentPractice: '审查一个暴露集合和字段的类，改成受控接口并补充不变量测试。',
    commonErrors: ['返回内部可变集合。', '每次都提供无脑 setter。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '不变量是对象始终满足的规则',
        '不变量是对象在构造后和每次公开操作后都必须成立的条件，例如余额不能为负、结束时间必须晚于开始时间、已支付订单必须有支付时间。规则应放在拥有数据的对象中，由构造器和方法统一维护，而不是散落在 Controller、前端和定时任务里。每个公开操作还要定义失败时状态是否保持原样，避免先扣款再校验导致部分更新。',
        '规则靠近数据',
        {
          title: 'Java：账户余额不出现负数',
          language: 'Java',
          code: `final class Account {
  private long balanceCents;

  Account(long openingCents) {
    if (openingCents < 0) throw new IllegalArgumentException("OPENING");
    balanceCents = openingCents;
  }

  void withdraw(long amountCents) {
    if (amountCents <= 0) throw new IllegalArgumentException("AMOUNT");
    if (amountCents > balanceCents) throw new IllegalStateException("INSUFFICIENT");
    balanceCents -= amountCents;
  }

  long balanceCents() { return balanceCents; }
}`,
          output: `构造和每次 withdraw 后 balanceCents 都非负；超额取款在扣减前失败，余额保持原值。

调用方无法绕过规则直接改余额。`,
        },
      ],
      [
        '访问级别表达设计边界',
        'private 只在当前类可见，package-private 在同一个包内协作，protected 允许子类访问但契约更复杂，public 会成为所有调用方依赖的长期 API。默认应选择最小可见范围，只在确实需要跨模块调用时扩大。公开方法、字段和构造器都要考虑兼容和测试成本；把实现类、缓存结构和临时字段设为 public，会让内部重构变成破坏性变更。',
        '公开范围就是维护承诺',
        {
          title: 'Java：用最小访问级别保护实现',
          language: 'Java',
          code: `package com.example.account;

public final class Account {
  private long balance;
  private String internalNote;

  public long balance() { return balance; }
  public void deposit(long amount) {
    if (amount <= 0) throw new IllegalArgumentException("AMOUNT");
    balance += amount;
  }

  void attachAuditNote(String note) { internalNote = note; }
}`,
          output: `外部模块只能调用 balance/deposit；attachAuditNote 仅包内使用，internalNote 完全私有。

若 balance 为 public，调用方可直接赋负数，封装失效；若 internalNote 公开，未来改名会破坏外部代码。`,
        },
      ],
      [
        '领域方法替代字段修改',
        '业务动作应通过有意义的方法完成，如 deposit、withdraw、cancel、submit，而不是为每个字段生成 setStatus/setPaidAt。领域方法在一次调用中校验权限、状态和参数，同时更新互相关联的字段，并保留失败前状态。方法名直接表达业务语言，测试也按业务场景命名；这样调用方看到的是能力，不是对象内部布局。',
        '使用业务语言修改状态',
        {
          title: 'Java：用 submit 和 cancel 维护状态机',
          language: 'Java',
          code: `final class Draft {
  private String status = "DRAFT";

  void submit() {
    if (!"DRAFT".equals(status)) throw new IllegalStateException("NOT_DRAFT");
    status = "SUBMITTED";
  }

  void cancel() {
    if ("CANCELLED".equals(status)) throw new IllegalStateException("ALREADY_CANCELLED");
    if ("SUBMITTED".equals(status)) throw new IllegalStateException("NEEDS_WITHDRAW");
    status = "CANCELLED";
  }

  String status() { return status; }
}`,
          output: `submit 只允许 DRAFT→SUBMITTED，cancel 明确哪些状态允许取消。

没有 setStatus 暴露任意跳转；状态机规则集中在对象中。`,
        },
      ],
      [
        '集合要防泄漏',
        '返回内部 List、Map 或数组会泄露可变引用，调用方可以绕过 addItem、removeItem 等校验直接修改内容。构造器接收集合时也要防御性复制，避免外部保留原引用后继续修改对象内部状态。可以返回 List.copyOf 快照、Collections.unmodifiableList 只读视图或专用查询结果；选择快照还是视图要明确性能与实时性语义。',
        '引用泄漏也是状态泄漏',
        {
          title: 'Java：复制输入并返回只读快照',
          language: 'Java',
          code: `import java.util.ArrayList;
import java.util.List;

final class Cart {
  private final List<String> items = new ArrayList<>();

  void add(String sku) {
    if (sku == null || sku.isBlank()) throw new IllegalArgumentException("SKU");
    items.add(sku);
  }

  List<String> items() {
    return List.copyOf(items);
  }
}

List<String> leaked = cart.items();
try {
  leaked.add("HACK");
} catch (UnsupportedOperationException error) {
  System.out.println("readonly");
}`,
          output: `readonly

外部拿到的只是不可修改快照，无法跳过 add 校验。生产大量读取时可缓存只读视图，但要重新评估内存与一致性。`,
        },
      ],
      [
        '不变量用测试固定',
        '每个不变量至少需要成功和失败两类测试：合法输入应得到正确状态，非法输入应产生明确错误且不修改原状态。测试还应覆盖边界值、重复操作和状态转换；例如重复支付、余额刚好等于取款额、取消后再次取消。断言公开余额、状态和错误类型，不读取私有字段。失败测试是对象契约的一部分，能防止未来优化悄悄放宽规则。',
        '验证失败也是状态验证',
        {
          title: 'Java + JUnit：失败操作不改变余额',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

class AccountTest {
  @Test
  void failedWithdrawalKeepsOriginalBalance() {
    Account account = new Account(5000);
    assertThrows(IllegalStateException.class, () -> account.withdraw(6000));
    assertEquals(5000, account.balanceCents());
  }

  @Test
  void allowsWithdrawalEqualToBalance() {
    Account account = new Account(5000);
    account.withdraw(5000);
    assertEquals(0, account.balanceCents());
  }
}`,
          output: `✔ failedWithdrawalKeepsOriginalBalance()
✔ allowsWithdrawalEqualToBalance()
Tests 2 passed

测试同时验证异常和失败后的状态，证明操作具备原子性。`,
        },
      ],
    ],
  },
  {
    name: '继承、组合与多态',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '掌握类、接口前概念和不变量。',
    goal: '能在继承和组合之间做取舍，理解方法分派、覆写规则和脆弱基类问题。',
    guidedPractice: '分别用继承和组合实现折扣策略，比较扩展、测试和修改基类带来的影响。',
    independentPractice: '重构一个三层继承模型为组合结构，保持行为并减少重复。',
    commonErrors: ['为了复用几行代码就继承。', '子类覆写方法违反父类契约。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '继承表达可替代关系',
        '继承表达 is-a 关系：子类对象应能在不破坏调用方预期的前提下替代父类。父类公开的输入范围、返回含义、异常、副作用和线程约束都构成契约，子类只能保持或加强前置条件、保持后置结果。若子类只是复用几行代码，却并不真正属于同一业务概念，继承会把两者生命周期永久绑定。判断继承是否合理，要看调用方能否只依赖父类契约工作。',
        '能替代才能继承',
        {
          title: 'Java：抽象折扣策略的可替代实现',
          language: 'Java',
          code: `abstract class DiscountPolicy {
  abstract long discount(long subtotalCents);
}

final class NoDiscount extends DiscountPolicy {
  long discount(long subtotalCents) { return 0; }
}

final class PercentDiscount extends DiscountPolicy {
  private final int percent;
  PercentDiscount(int percent) { this.percent = percent; }
  long discount(long subtotalCents) {
    return subtotalCents * percent / 100;
  }
}

DiscountPolicy policy = new PercentDiscount(10);
System.out.println(policy.discount(5000));`,
          output: `500

调用方只依赖 discount 契约。任何实现都应返回 0 到 subtotalCents 范围内的折扣，不能通过继承改变这个含义。`,
        },
      ],
      [
        '组合表达拥有和协作',
        '组合通过对象持有另一个能力并委派调用，表达 has-a 或 uses-a 关系。订单服务可以持有一个折扣策略接口，在运行时替换固定折扣、百分比折扣或活动规则，而不需要继承整棵订单类层级。依赖保持窄接口后，测试可以注入假策略，变化被限制在一个协作点。组合不是绝对优于继承，而是在能力组合和独立变化场景中更容易替换、隔离和演进。',
        '优先组合小对象',
        {
          title: 'Java：订单服务组合折扣能力',
          language: 'Java',
          code: `interface DiscountPolicy {
  long discount(long subtotalCents);
}

final class CheckoutService {
  private final DiscountPolicy discountPolicy;

  CheckoutService(DiscountPolicy discountPolicy) {
    this.discountPolicy = discountPolicy;
  }

  long payable(long subtotalCents) {
    return subtotalCents - discountPolicy.discount(subtotalCents);
  }
}

CheckoutService service = new CheckoutService(subtotal -> 500);
System.out.println(service.payable(4200));`,
          output: `3700

CheckoutService 不继承任何折扣类，只持有一个可替换能力。测试可传 lambda，生产可组合会员价、优惠券和活动规则。`,
        },
      ],
      [
        '多态在运行时选择实现',
        '多态让调用方使用父类型或接口类型编程，运行时根据实际对象选择覆写实现。方法调用通常按实例类型动态分派，字段访问和静态方法则不会以同样方式多态。多态适合隔离同一契约下的不同算法或外部实现，但调用方仍必须理解共同契约；若每个实现返回语义完全不同，接口只是共享方法名，无法安全替换。',
        '接口稳定，实现可替换',
        {
          title: 'Java：同一契约运行多种折扣实现',
          language: 'Java',
          code: `import java.util.List;

List<DiscountPolicy> policies = List.of(
  subtotal -> 0,
  subtotal -> Math.min(500, subtotal),
  subtotal -> subtotal * 15 / 100
);

for (DiscountPolicy policy : policies) {
  System.out.println(policy.getClass().getSimpleName() + ":" + policy.discount(4200));
}

Object reference = new PercentDiscount(10);
// reference.discount(4200); // 编译失败：Object 没有该契约`,
          output: `Lambda$1:0
Lambda$2:500
Lambda$3:630

编译错误：找不到符号 discount。多态依赖编译期可见类型与运行期实际实现的共同契约。`,
        },
      ],
      [
        '覆写不能收窄契约',
        '覆写必须保持方法签名兼容，不能降低可见性、扩大受检异常或把父类允许的输入变成非法。里氏替换关注行为合同：父类承诺可读的集合，子类不能变成只读；父类承诺总额非负，子类不能返回别的单位。为了复用内部结构而继承 ArrayList、HashMap 等可变容器，很容易覆写部分方法后让其他方法绕过约束。',
        '覆写保持可替代',
        {
          title: 'Java：只读子类为何破坏契约',
          language: 'Java',
          code: `import java.util.ArrayList;

class ReadOnlyList<E> extends ArrayList<E> {
  @Override
  public boolean add(E value) {
    throw new UnsupportedOperationException("read-only");
  }
}

ArrayList<String> list = new ReadOnlyList<>();
list.add("A");`,
          output: `运行时抛出 UnsupportedOperationException。

问题不是异常本身，而是变量声明为可修改 ArrayList 后，调用方合理认为 add 可用。应返回 List.copyOf 或使用组合接口，而不是伪装成可变子类。`,
        },
      ],
      [
        '用场景测试比较设计',
        '设计取舍要用变化场景验证：新增一种折扣、改变订单流程、独立测试策略、替换外部依赖时分别需要修改哪些类。继承方案可能让子类依赖基类内部顺序；组合方案则通过构造函数或工厂注入能力。比较编译依赖、测试夹具、覆写数量和爆炸式子类组合，而不是只数代码行。能以更小差异安全支持下一项需求，才是更好的结构。',
        '设计取舍以变化为中心',
        {
          title: 'Java + JUnit：锁定组合策略行为',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class CheckoutServiceTest {
  @Test
  void appliesInjectedDiscountWithoutInheritance() {
    CheckoutService service = new CheckoutService(subtotal -> Math.min(500, subtotal));
    assertEquals(3700, service.payable(4200));
  }

  @Test
  void neverReturnsNegativeAmount() {
    CheckoutService service = new CheckoutService(subtotal -> Math.min(subtotal, 500));
    assertEquals(0, service.payable(500));
  }
}`,
          output: `✔ appliesInjectedDiscountWithoutInheritance()
✔ neverReturnsNegativeAmount()
Tests 2 passed

新增折扣只需新增策略实现和测试，不必创建 CheckoutV2、CheckoutWithCoupon 等继承子类。`,
        },
      ],
    ],
  },
  {
    name: '接口、抽象类与依赖倒置',
    track: 'P06 · Java / JVM / Spring',
    minutes: 40,
    prerequisite: '掌握继承、组合和多态。',
    goal: '能设计小接口和抽象边界，让领域逻辑依赖稳定契约，而不直接依赖数据库、HTTP 或第三方库。',
    guidedPractice: '为订单存储定义领域端口，分别实现内存版和 JDBC 版适配器，在测试中替换。',
    independentPractice: '把一个 Controller 中的业务逻辑抽到应用服务，并依赖仓储接口。',
    commonErrors: ['一个接口包含几十个不相关方法。', '接口只是给每个类复制实现。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '接口定义可替换能力',
        '接口应围绕调用方真正需要的能力设计，而不是把一个实现类的方法全部复制出来。读取订单的代码只需要 findById 或 listByStatus，不必同时依赖删除、迁移和审计方法。窄接口更容易做假实现、适配外部系统和按需组合；过宽接口会迫使每个实现处理无关方法，并让任何新增方法成为全实现破坏性变更。',
        '接口由使用方需求驱动',
        {
          title: 'Java：按读取和写入拆分订单接口',
          language: 'Java',
          code: `import java.util.Optional;

interface OrderReader {
  Optional<Order> findById(String id);
}

interface OrderWriter {
  void save(Order order);
}

final class OrderQueryService {
  private final OrderReader reader;
  OrderQueryService(OrderReader reader) { this.reader = reader; }
  Order load(String id) {
    return reader.findById(id).orElseThrow(() -> new IllegalArgumentException("NOT_FOUND"));
  }
}`,
          output: `查询服务只依赖 OrderReader，不需要知道保存或删除能力。

存储实现可以同时实现两个接口，但调用方只看到自己需要的最小契约。`,
        },
      ],
      [
        '抽象类共享部分实现',
        '抽象类适合一组相关类型共享字段、构造器、受保护模板方法和固定流程，例如支付处理器统一校验订单、记录开始时间和调用抽象 doPay。接口表达能力，抽象类表达部分实现和继承骨架。抽象类会占用唯一继承位置并形成更强耦合，因此只有在共享状态与算法骨架确实稳定时使用。不要为了省几个方法复制就把所有策略塞进一个巨型抽象基类。',
        '契约与共享实现分开',
        {
          title: 'Java：抽象类提供支付模板流程',
          language: 'Java',
          code: `abstract class PaymentProcessor {
  final PaymentResult process(Order order) {
    validate(order);
    long started = System.nanoTime();
    try {
      return doPay(order);
    } finally {
      System.out.println("elapsed=" + (System.nanoTime() - started));
    }
  }

  protected abstract PaymentResult doPay(Order order);

  private void validate(Order order) {
    if (order.totalCents() <= 0) throw new IllegalArgumentException("TOTAL");
  }
}`,
          output: `所有支付实现共享参数校验、计时和异常出口，只实现 doPay。

若模板流程仍频繁变化，就应先抽小接口和组合服务，而不是把更多开关塞进抽象基类。`,
        },
      ],
      [
        '依赖倒置改变源码方向',
        '依赖倒置要求高层应用服务定义它需要的端口，数据库、HTTP 客户端和消息系统等低层实现去适配端口。源码依赖从 Controller→具体数据库变成 Application→OrderRepository 接口，基础设施在启动时注入实现。领域层不 import JDBC、Spring Data 或外部 SDK，因此可以独立测试和替换；是否真的需要接口取决于边界复杂度，而不是每个类都必须有。',
        '领域不依赖框架',
        {
          title: 'Java：应用服务依赖仓储端口',
          language: 'Java',
          code: `interface OrderRepository {
  Optional<Order> findById(String id);
  void save(Order order);
}

final class PayOrder {
  private final OrderRepository repository;

  PayOrder(OrderRepository repository) {
    this.repository = repository;
  }

  void execute(String orderId) {
    Order order = repository.findById(orderId)
      .orElseThrow(() -> new IllegalArgumentException("NOT_FOUND"));
    order.pay();
    repository.save(order);
  }
}

// main / 配置层注入 JdbcOrderRepository`,
          output: `PayOrder 只包含业务编排，不出现 DataSource、SQL 或 Spring 注解。

JDBC 适配器负责映射数据库行；启动配置决定具体实现。`,
        },
      ],
      [
        '端口适配器隔离外部系统',
        '端口是领域或应用层定义的接口，适配器负责与数据库、HTTP、消息、文件或第三方 SDK 交互。入站适配器把 HTTP/CLI 请求转换为应用命令，出站适配器把领域请求转换为 SQL 或 API 调用。传输 DTO、ORM Entity 和框架异常应在边界转换，不能直接泄漏进领域对象。这样外部协议升级不会迫使业务模型跟着改变。',
        '边界处做模型转换',
        {
          title: 'Java：HTTP DTO 转应用命令',
          language: 'Java',
          code: `record CreateOrderRequest(String customerId, long totalCents) {}
record CreateOrderCommand(String customerId, long totalCents) {}

final class CreateOrderController {
  private final CreateOrder useCase;

  CreateOrderController(CreateOrder useCase) {
    this.useCase = useCase;
  }

  Response create(CreateOrderRequest request) {
    try {
      CreateOrderResult result = useCase.execute(
        new CreateOrderCommand(request.customerId(), request.totalCents())
      );
      return Response.created(result.orderId());
    } catch (IllegalArgumentException error) {
      return Response.badRequest(error.getMessage());
    }
  }
}`,
          output: `HTTP DTO 只在控制器出现，应用用例接收 CreateOrderCommand。

错误在边界映射成 400；领域不依赖 Response、HTTP header 或 JSON。`,
        },
      ],
      [
        '测试证明可替换性',
        '一组契约测试应验证同一接口的不同实现具有相同可观察行为：缺失资源返回空、重复保存幂等、查询过滤一致、异常类型一致。内存实现适合快速单元测试，真实 JDBC 实现还要验证事务、约束和数据库差异。只证明接口能编译不代表可替换；若两个实现错误语义不同，生产切换会产生隐蔽回归。',
        '接口契约需要共同测试',
        {
          title: 'Java + JUnit：参数化运行仓储契约',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

abstract class OrderRepositoryContract {
  abstract OrderRepository repository();

  @Test
  void returnsEmptyForMissingOrder() {
    assertTrue(repository().findById("missing").isEmpty());
  }

  @Test
  void savesAndReloadsOrder() {
    repository().save(new Order("O-1", 4200));
    assertEquals(4200, repository().findById("O-1").orElseThrow().totalCents());
  }
}

class InMemoryOrderRepositoryTest extends OrderRepositoryContract {
  private final OrderRepository repo = new InMemoryOrderRepository();
  OrderRepository repository() { return repo; }
}`,
          output: `JUnit 执行 InMemoryOrderRepositoryTest 的同一组契约测试。

真实数据库测试继承同一基类，并额外处理清理、事务和容器启动。`,
        },
      ],
    ],
  },
  {
    name: '枚举、Record 与 sealed 类型',
    track: 'P06 · Java / JVM / Spring',
    minutes: 40,
    prerequisite: '掌握类、接口、封装和不可变对象。',
    goal: '能用 enum、record 和 sealed 表达有界状态与不可变数据，并理解它们在序列化、框架和 API 中的边界。',
    guidedPractice: '用 enum 表达订单状态，用 record 表达订单快照，用 sealed 限制支付结果类型并做穷尽分支。',
    independentPractice: '重构一组字符串状态和 Map DTO，改成类型安全的有限模型，并更新 API 映射。',
    commonErrors: ['状态用任意字符串表达。', '把 record 当作可变数据库实体。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '枚举表达有限稳定状态',
        'enum 把状态集合限制为编译期已知的常量，避免字符串拼写错误、任意状态注入和分支遗漏。枚举可以带字段、方法和构造器，但仍只是状态类型，不等于允许任意跳转；状态转换必须集中在业务对象或状态机中。数据库、JSON 和界面边界仍需把外部值解析为枚举，并对未知值明确拒绝。',
        '状态类型与状态机一起设计',
        {
          title: 'Java：枚举与显式状态转换',
          language: 'Java',
          code: `enum OrderStatus {
  PENDING, PAID, SHIPPED, CANCELLED;

  boolean canPay() { return this == PENDING; }
}

final class Order {
  private OrderStatus status = OrderStatus.PENDING;

  void pay() {
    if (!status.canPay()) throw new IllegalStateException("NOT_PAYABLE");
    status = OrderStatus.PAID;
  }

  OrderStatus status() { return status; }
}`,
          output: `status 只能是四个枚举值；重复支付会抛 NOT_PAYABLE。

字符串 "PAYED" 或空值无法绕过编译检查；API 边界解析未知值时仍应返回 400。`,
        },
      ],
      [
        'Record 表达透明数据',
        'record 适合表达不可变值对象、命令、快照和查询结果，自动生成访问器、equals、hashCode 与 toString。字段隐式 final，但组件若引用可变集合或数组，record 本身不能阻止内容被修改。紧凑构造器可以校验参数、规范化字段并做防御性复制。record 不等于数据库实体或可变领域对象，复杂状态转换仍应使用普通类。',
        'Record 是数据载体，不是万能实体',
        {
          title: 'Java：定义不可变订单快照',
          language: 'Java',
          code: `import java.util.List;

record OrderSnapshot(String id, long totalCents, List<String> items) {
  OrderSnapshot {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("ID");
    if (totalCents < 0) throw new IllegalArgumentException("TOTAL");
    items = List.copyOf(items);
  }
}

OrderSnapshot snapshot = new OrderSnapshot("O-1", 4200, List.of("A"));
System.out.println(snapshot);
System.out.println(snapshot.items().getClass());`,
          output: `OrderSnapshot[id=O-1, totalCents=4200, items=[A]]
class java.util.ImmutableCollections$ListN

紧凑构造器校验并复制集合，外部无法通过原列表修改快照。`,
        },
      ],
      [
        'sealed 限制可扩展类型集合',
        'sealed 类型声明允许的实现者，形成可穷尽检查的封闭层级，适合支付结果、命令、事件和状态变体。switch 覆盖全部 permits 实现时无需默认分支；新增实现而忘记处方法会编译失败。sealed 只限制直接继承者，不保证字段不可变，也不替代业务校验。实现者通常使用 final、record 或同为 sealed 的中间类型。',
        '有界类型便于穷尽检查',
        {
          title: 'Java：sealed 支付结果和穷尽 switch',
          language: 'Java',
          code: `sealed interface PaymentResult
  permits Approved, Declined, Pending {}
record Approved(String transactionId, long amountCents) implements PaymentResult {}
record Declined(String code) implements PaymentResult {}
record Pending(String providerReference) implements PaymentResult {}

static String describe(PaymentResult result) {
  return switch (result) {
    case Approved approved -> "approved:" + approved.amountCents();
    case Declined declined -> "declined:" + declined.code();
    case Pending pending -> "pending:" + pending.providerReference();
  };
}`,
          output: `输入 Approved 返回 approved:4200；Declined 返回 declined:INSUFFICIENT。

若新增 Refunded 实现但不更新 switch，javac 报 switch 表达式未覆盖全部可能值。`,
        },
      ],
      [
        '框架边界要核对支持',
        'record 和 sealed 是语言特性，但序列化、ORM、反射、参数绑定和旧版库是否支持取决于实际版本。Jackson 需要正确模块和参数名信息，JPA 实体通常要求可变类和无参构造，部分框架无法代理 final 类型，sealed 的多态 JSON 还需要类型标识与白名单。进入框架边界前应固定版本并写往返测试，不能只在普通 Java main 中验证后假设 ORM 也能用。',
        '语言特性要验证运行时生态',
        {
          title: 'Java + Jackson：记录序列化往返',
          language: 'Java',
          code: `ObjectMapper mapper = new ObjectMapper()
  .registerModule(new ParameterNamesModule());

OrderSnapshot source = new OrderSnapshot("O-1", 4200, List.of("A"));
String json = mapper.writeValueAsString(source);
OrderSnapshot restored = mapper.readValue(json, OrderSnapshot.class);

System.out.println(json);
System.out.println(source.equals(restored));`,
          output: `{"id":"O-1","totalCents":4200,"items":["A"]}
true

若框架缺少 record 支持，可能报 cannot deserialize；应升级依赖并补往返测试，而不是把 record 改回任意 Map。`,
        },
      ],
      [
        '用类型消除非法状态',
        '多个 boolean、String status 和可空字段会组合出大量非法状态：loading 与 error 同时为真、PAID 却没有支付时间、CANCELLED 仍有发货号。枚举、record 和 sealed 能把每种合法状态建模为独立分支，只让当前状态携带允许字段。类型越精确，调用方需要的 if 越少，测试组合也越可控；但边界输入仍要运行时解析。',
        '让非法组合无法表示',
        {
          title: 'Java：用 variant 替代互斥布尔值',
          language: 'Java',
          code: `sealed interface SyncState
  permits Idle, Syncing, Synced, SyncFailed {}
record Idle() implements SyncState {}
record Syncing(int progress) implements SyncState {}
record Synced(String revision) implements SyncState {}
record SyncFailed(String code, boolean retryable) implements SyncState {}

static boolean canStart(SyncState state) {
  return state instanceof Idle || state instanceof SyncFailed failed && failed.retryable();
}`,
          output: `Idle 可开始；Syncing 禁止重复启动；Synced 无需启动；SyncFailed 仅在 retryable=true 时允许重试。

不存在 loading=true、error=true、success=true 同时出现的组合。`,
        },
      ],
    ],
  },
  {
    name: '异常体系、错误传播与资源关闭',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '会写方法、类并阅读异常栈。',
    goal: '能区分受检异常、运行时异常和业务失败，保留异常原因并使用 try-with-resources 安全关闭资源。',
    guidedPractice: '实现文件读取和业务校验，分别处理受检异常、运行时错误和资源关闭异常。',
    independentPractice: '重构一个全捕获 Exception 的模块，建立稳定错误类型和边界转换。',
    commonErrors: ['catch 后只打印不处理。', '捕获宽泛异常后丢失 cause。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '异常表达无法正常返回的结果',
        '受检异常迫使调用方在编译期决定恢复、转换或继续传播，适合文件不存在、网络失败等外部可恢复问题；运行时异常通常表示参数违反契约、状态非法或程序缺陷，调用方不应靠到处 catch 来正常控制流程。异常分类服务调用方决策，不只是语法选择。可预期的“没有结果”可以使用 Optional 或结果对象，异常则用于不能按正常返回值继续的情况。',
        '异常类型表达恢复策略',
        {
          title: 'Java：受检异常与运行时异常分开',
          language: 'Java',
          code: `import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

static String loadConfig(Path path) throws IOException {
  return Files.readString(path);
}

static int quantity(int value) {
  if (value <= 0) throw new IllegalArgumentException("QUANTITY");
  return value;
}

try {
  System.out.println(loadConfig(Path.of("missing.txt")));
} catch (IOException error) {
  System.out.println("CONFIG_UNAVAILABLE");
}`,
          output: `CONFIG_UNAVAILABLE

IO 故障可由调用方重试、降级或提示；quantity 的非法参数属于调用契约错误，通常不应被普通业务流程静默吞掉。`,
        },
      ],
      [
        '包装异常必须保留原因',
        '包装异常用于添加业务上下文，例如订单 ID、阶段或外部系统名，但必须把原始异常作为 cause 保留。只拼接 message 会丢失类型、堆栈和底层错误码；只打印再抛出新的空异常会截断因果链。日志应记录最外层上下文以及 root cause，API 响应只返回稳定错误码和 requestId。重复记录同一异常会造成噪声，选择一个明确边界负责记录。',
        '上下文追加，原因不丢',
        {
          title: 'Java：保留异常 cause 链',
          language: 'Java',
          code: `class PaymentException extends RuntimeException {
  PaymentException(String message, Throwable cause) {
    super(message, cause);
  }
}

try {
  throw new IllegalStateException("gateway timeout");
} catch (RuntimeException cause) {
  throw new PaymentException("pay order O-1001 failed", cause);
}

// 捕获端
Throwable root = error;
while (root.getCause() != null) root = root.getCause();
System.out.println(error.getMessage());
System.out.println(root.getMessage());`,
          output: `pay order O-1001 failed
gateway timeout

外层消息提供业务上下文，root cause 保留超时根因。日志同时记录 requestId 和完整 cause 链。`,
        },
      ],
      [
        '业务错误在边界转换',
        '领域层应使用有业务含义的错误类型或结果对象，例如 INSUFFICIENT_STOCK、ORDER_ALREADY_PAID，而不是依赖 HTTP 状态或 JSON 结构。Controller/消息适配器在边界把业务错误转换为 400、404、409 或 422，并补充 requestId；未知异常转换为 500 且隐藏堆栈。这样同一业务错误可以由 HTTP、CLI 或消息消费者用不同方式呈现，而领域不被传输协议污染。',
        '领域语义与协议错误分层',
        {
          title: 'Java：业务异常映射为 HTTP 契约',
          language: 'Java',
          code: `class BusinessException extends RuntimeException {
  private final String code;
  BusinessException(String code, String message) {
    super(message);
    this.code = code;
  }
  String code() { return code; }
}

Response handle(Runnable action, String requestId) {
  try {
    action.run();
    return Response.ok();
  } catch (BusinessException error) {
    int status = switch (error.code()) {
      case "NOT_FOUND" -> 404;
      case "ALREADY_PAID" -> 409;
      default -> 422;
    };
    return Response.error(status, error.code(), error.getMessage(), requestId);
  } catch (RuntimeException error) {
    return Response.error(500, "INTERNAL_ERROR", "请稍后重试", requestId);
  }
}`,
          output: `ALREADY_PAID → HTTP 409，响应保留稳定 code 和 requestId。

未知 RuntimeException → HTTP 500，用户看不到堆栈；完整异常进入服务端受控日志。`,
        },
      ],
      [
        'try-with-resources 管理多个资源',
        '实现 AutoCloseable 的资源应在 try-with-resources 中声明，作用域结束时按创建逆序自动关闭。多个关闭异常会被 addSuppressed 附加到主异常，避免覆盖真正的业务失败。不要手工写重复 finally，也不要在 try 外获取资源导致中途失败无法关闭。需要保留资源到更长生命周期时，由明确的所有者负责关闭，而不是传给多个方法互相猜。',
        '资源生命周期自动化',
        {
          title: 'Java：多资源逆序关闭',
          language: 'Java',
          code: `class Resource implements AutoCloseable {
  private final String name;
  Resource(String name) { this.name = name; }
  public void close() { System.out.println("close:" + name); }
}

try (
  Resource first = new Resource("first");
  Resource second = new Resource("second")
) {
  System.out.println("body");
}`,
          output: `body
close:second
close:first

关闭顺序与声明顺序相反；若 body 抛异常且 close 也失败，close 异常会作为 suppressed 保留。`,
        },
      ],
      [
        '错误路径必须有测试',
        '异常测试要验证错误类型、稳定 code、消息是否可行动、cause 是否保留，以及失败后状态和资源是否恢复。对资源关闭，可用记录型假资源断言 close 被调用；对 API 边界，断言状态码和响应体不泄漏堆栈；对事务，验证回滚和重试策略。只测试成功路径会让错误语义在重构中悄悄改变，生产事故时才发现客户端无法据此恢复。',
        '失败也是产品行为',
        {
          title: 'Java + JUnit：异常和关闭都验证',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class OperationTest {
  @Test
  void wrapsCauseAndDoesNotLeakInternalMessage() {
    BusinessException error = assertThrows(
      BusinessException.class,
      () -> service.pay("O-1")
    );
    assertEquals("PAYMENT_FAILED", error.code());
    assertEquals("gateway timeout", error.getCause().getMessage());
  }

  @Test
  void closesResourceOnFailure() {
    FakeResource resource = new FakeResource();
    assertThrows(IllegalStateException.class, () -> operation.run(resource));
    assertTrue(resource.closed);
  }
}`,
          output: `✔ wrapsCauseAndDoesNotLeakInternalMessage()
✔ closesResourceOnFailure()
Tests 2 passed

测试同时锁定对外错误契约、内部 cause 和失败后的资源状态。`,
        },
      ],
    ],
  },
  {
    name: '泛型、类型擦除与通配符',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '掌握类、接口、集合概况和异常。',
    goal: '能使用泛型类、泛型方法和通配符保持类型关系，理解擦除、边界和运行时限制。',
    guidedPractice: '实现一个类型安全的仓库接口，使用有界泛型和通配符读取集合，再观察编译错误。',
    independentPractice: '重构一个 Object 和强制转换的缓存，改成泛型 API 并补类型边界测试。',
    commonErrors: ['到处使用原始类型。', '认为泛型在运行时保留完整类型。'],
    sourceRefs: [JAVA_SPECS, JAVA_API],
    steps: [
      [
        '泛型保持输入输出关系',
        '泛型的价值是让同一算法在多个位置共享类型关系：Repository<T> 的 save 接收 T，findById 返回 T；Result<T> 成功时携带 T，失败时只带错误。编译器能阻止把订单 Repository 返回的 Customer 直接赋给 Order，也避免每处 Object 强制转换。泛型参数应在两个以上位置建立关系；若 T 只出现一次，通常没有带来真实约束。',
        '泛型用于表达关系',
        {
          title: 'Java：用泛型仓库消除强制转换',
          language: 'Java',
          code: `import java.util.Optional;

interface Repository<T, ID> {
  Optional<T> findById(ID id);
  void save(T entity);
}

final class OrderRepository implements Repository<Order, String> {
  public Optional<Order> findById(String id) { return Optional.empty(); }
  public void save(Order order) {}
}

Order order = repository.findById("O-1").orElseThrow();
// Customer customer = repository.findById("C-1").orElseThrow(); // 编译失败`,
          output: `order 的类型被推断为 Order，不需要 (Order) 强转。

把返回值赋给 Customer 会在编译期失败，类型关系没有被擦除到调用端。`,
        },
      ],
      [
        '擦除影响运行时能力',
        'Java 泛型主要通过编译期检查实现，运行时大多擦除为边界类型，因此不能直接 new T()、new T[] 或依赖 List<Order>.class 判断元素类型。需要创建对象或数组时传入 Class<T>、Supplier<T> 或 TypeToken；反序列化也应提供目标类型。擦除还导致重载冲突和方法桥接，但这些限制不削弱正常集合的类型安全。',
        '编译期类型不等于运行时类型',
        {
          title: 'Java：通过 Class<T> 恢复运行时类型',
          language: 'Java',
          code: `import java.lang.reflect.Array;

final class TypedArray<T> {
  private final Class<T> type;

  TypedArray(Class<T> type) {
    this.type = type;
  }

  T[] create(int size) {
    return (T[]) Array.newInstance(type, size);
  }
}

String[] values = new TypedArray<>(String.class).create(3);
System.out.println(values.getClass().getComponentType().getName());`,
          output: `java.lang.String

Class<T> 把运行时类型信息显式传入。若省略，就无法安全创建 String[]；创建 Object[] 再强转会在运行时失败。`,
        },
      ],
      [
        '有界类型约束能力',
        '类型参数可以声明 extends 上界，要求元素拥有某个接口或类能力。边界应表达算法真正依赖的最小契约：求和使用 Number 子类，排序使用 Comparable<T>，持久化使用带 id() 的 Entity。过宽边界失去类型安全，过窄边界限制复用；多个边界写成 T extends A & B。边界也会成为擦除后的运行时类型。',
        '边界表达最小能力',
        {
          title: 'Java：只对可比较元素排序',
          language: 'Java',
          code: `import java.util.List;

static <T extends Comparable<T>> T min(List<T> values) {
  if (values.isEmpty()) throw new IllegalArgumentException("EMPTY");
  T result = values.get(0);
  for (T value : values) {
    if (value.compareTo(result) < 0) result = value;
  }
  return result;
}

System.out.println(min(List.of(3, 1, 2)));

class NotComparable {}
// min(List.of(new NotComparable())); // 编译失败`,
          output: `1

min 只依赖 compareTo，因此适用于 Integer、String 和任何实现 Comparable<T> 的类型。`,
        },
      ],
      [
        '通配符表达使用方视角',
        '通配符表达调用方可以接受的一组泛型类型。生产者读取用 ? extends T：可以从 List<Integer> 读出 Number；消费者写入用 ? super T：可以把 Integer 放进 List<Number>。PECS 只是记忆法，核心是数据流向。若方法既不读也不写或需要保持同一精确类型，就不应机械添加通配符。',
        '先看读写方向',
        {
          title: 'Java：PECS 拷贝集合',
          language: 'Java',
          code: `import java.util.List;

static <T> void copy(
  List<? extends T> source,
  List<? super T> target
) {
  for (T value : source) target.add(value);
}

List<Integer> source = List.of(1, 2, 3);
List<Number> target = new ArrayList<>();
copy(source, target);
System.out.println(target);`,
          output: `[1, 2, 3]

source 是 T 的生产者，target 是消费者；这比要求两边完全同型 List<T> 更灵活，同时保持写入类型安全。`,
        },
      ],
      [
        '难以解释时先简化',
        '复杂嵌套泛型、递归边界和多层通配符会增加阅读与错误信息成本。先问问题是否能用小接口、普通父类或明确的中间类型解决；若一个泛型签名需要长篇注释才能理解，调用方很可能难以正确使用。保留类型安全，但优先命名领域类型、拆小方法、减少参数数量。复杂类型只有在消除真实重复和保持关键关系时才值得。',
        '类型系统服务可维护性',
        {
          title: 'Java：复杂签名与命名字段对比',
          language: 'Java',
          code: `// 难读：调用方需要理解多层关系
Map<String, List<? extends Map<String, ? super Number>>> data;

// 更清晰：用领域类型表达同一意图
record MetricSeries(String name, List<Number> points) {}
Map<String, MetricSeries> metrics;

// 编译期限制
metrics.put("cpu", new MetricSeries("cpu", List.of(0.3, 0.8)));`,
          output: `MetricSeries 表达了“指标名与数值序列”的业务含义，替换了难读嵌套泛型。

若后续不同指标需要不同数值类型，再为关系引入最小泛型，而不是一开始就堆类型体操。`,
        },
      ],
    ],
  },
  {
    name: 'List、Map 与 Set 的选型',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '掌握泛型、对象相等性和基本数据结构。',
    goal: '能按访问模式选择 List、Map、Set、Queue，并理解顺序、唯一性、复杂度、空值和线程安全边界。',
    guidedPractice: '用 ArrayList、LinkedList、HashMap、LinkedHashMap 和 TreeMap 完成同一数据集操作，记录顺序和耗时。',
    independentPractice: '为一个订单查询功能选择集合和 Map 键，写出复杂度、顺序和并发假设。',
    commonErrors: ['默认所有列表都用 ArrayList 却说不清原因。', 'HashMap 的键使用可变对象。'],
    sourceRefs: [JAVA_API, JAVA_SPECS],
    steps: [
      [
        '先写访问模式',
        '选择集合前先列出操作和频率：按索引随机读取、尾部追加、按键查找、范围排序、保持插入顺序、去重、双端队列、并发写入。访问模式决定接口和实现，而不是“团队一直用 ArrayList”。还要估算元素数量、对象大小、峰值写入和生命周期；一次请求内的小集合与长期缓存的高频 Map，容量和失效策略完全不同。',
        '先写操作和频率',
        {
          title: 'Java：用操作表选择集合',
          language: 'Java',
          code: `import java.util.*;

List<String> byIndex = new ArrayList<>();       // 随机读、尾部追加
Deque<String> queue = new ArrayDeque<>();      // 双端队列
Map<String, String> byId = new HashMap<>();    // 键值查找
Set<String> unique = new LinkedHashSet<>();     // 去重且保留首次顺序

byIndex.add("O-1");
queue.addLast("task-1");
byId.put("O-1", "PAID");
unique.add("O-1");
unique.add("O-1");

System.out.println(unique.size());
System.out.println(byId.get("O-1"));`,
          output: `1
PAID

LinkedHashSet 去重后仍只有一项；Map 按键直接取值。每项选择都对应明确操作，而不是默认习惯。`,
        },
      ],
      [
        'List 表达有序序列',
        'ArrayList 用连续数组保存元素，随机索引和尾部追加通常高效，中间插入删除需要移动元素，扩容会复制数组。LinkedList 由双向节点组成，首尾增删灵活，但按索引读取要先遍历，节点对象和缓存未命中会增加成本。多数业务列表以遍历和尾部追加为主，ArrayList 更常见；需要双端队列时应优先 ArrayDeque，而不是把 LinkedList 当通用列表。',
        '列表顺序与索引成本',
        {
          title: 'Java：比较 ArrayList 与 LinkedList 随机访问',
          language: 'Java',
          code: `List<Integer> array = new ArrayList<>();
List<Integer> linked = new LinkedList<>();
for (int index = 0; index < 20_000; index++) {
  array.add(index);
  linked.add(index);
}

long start = System.nanoTime();
long arraySum = 0;
for (int index = 0; index < array.size(); index += 100) {
  arraySum += array.get(index);
}
long arrayMs = (System.nanoTime() - start) / 1_000_000;

start = System.nanoTime();
long linkedSum = 0;
for (int index = 0; index < linked.size(); index += 100) {
  linkedSum += linked.get(index);
}
long linkedMs = (System.nanoTime() - start) / 1_000_000;

System.out.println(arrayMs + "," + linkedMs + "," + (arraySum == linkedSum));`,
          output: `0,34,true

数值随机器变化，但索引访问 LinkedList 需要逐个节点定位，通常明显更慢。基准只比较访问模式，不代表所有操作。`,
        },
      ],
      [
        'Map 表达键值关系',
        'HashMap 用 hashCode 定位桶，再通过 equals 确认键相等；LinkedHashMap 保留插入或访问顺序；TreeMap 用比较器排序。键必须具有稳定相等性，最好不可变；把对象加入 Map 后再修改参与 hashCode 的字段，会让查找落到错误桶。需要排序时先确认 TreeMap 比较结果为 0 是否真的代表业务同键。',
        '键的相等性决定语义',
        {
          title: 'Java：可变键导致 Map 查找失败',
          language: 'Java',
          code: `import java.util.*;

class Key {
  String id;
  Key(String id) { this.id = id; }
  public boolean equals(Object other) { return other instanceof Key k && id.equals(k.id); }
  public int hashCode() { return id.hashCode(); }
}

Map<Key, String> map = new HashMap<>();
Key key = new Key("O-1");
map.put(key, "PAID");
key.id = "O-2";
System.out.println(map.get(key));
System.out.println(map.get(new Key("O-1")));`,
          output: `null
null

修改 key 后哈希桶变化，原条目仍留在旧桶但已无法定位。Map 键应使用不可变 ID 值对象。`,
        },
      ],
      [
        'Set 表达唯一集合',
        'Set 的唯一性完全由 equals/hashCode 或 TreeSet 的比较器决定。HashSet 不保证遍历顺序，LinkedHashSet 保留首次插入顺序，TreeSet 按比较顺序遍历。业务去重应先定义身份键：订单按 orderId，用户按 tenantId+userId；仅名称相同不代表同一实体。必要时先用 LinkedHashMap 按业务键保留最新记录，再输出不可变集合。',
        '唯一性必须有稳定定义',
        {
          title: 'Java：按业务键去重并保留顺序',
          language: 'Java',
          code: `import java.util.*;

record Order(String id, String status) {}

List<Order> input = List.of(
  new Order("O-1", "PENDING"),
  new Order("O-1", "PAID"),
  new Order("O-2", "PAID")
);

Map<String, Order> byId = new LinkedHashMap<>();
for (Order order : input) byId.put(order.id(), order);
Collection<Order> unique = byId.values();
System.out.println(unique);`,
          output: `[Order[id=O-1, status=PAID], Order[id=O-2, status=PAID]]

后出现的同 ID 订单替换旧状态，同时保留第一次出现的位置；这比简单 Set 更明确“哪条记录获胜”。`,
        },
      ],
      [
        '并发集合不是万能锁',
        'ConcurrentHashMap 保证单次 get/put/compute 等操作线程安全，但“先读再判断再写”仍可能被其他线程穿插。计数、限额和状态转换应使用 merge、compute、原子类或数据库条件更新，把业务判断放进一个原子操作。集合线程安全不等于业务事务安全；多字段一致性和外部副作用仍需锁、事务或幂等设计。',
        '单操作安全不等于业务安全',
        {
          title: 'Java：用 compute 原子累计订单数',
          language: 'Java',
          code: `import java.util.concurrent.*;

ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
List<String> events = List.of("paid", "paid", "failed", "paid");

for (String event : events) {
  counts.compute(event, (key, current) -> current == null ? 1 : current + 1);
}
System.out.println(counts);

Map<String, Integer> wrong = new ConcurrentHashMap<>();
for (String event : events) {
  Integer current = wrong.get(event);
  wrong.put(event, current == null ? 1 : current + 1);
}`,
          output: `{paid=3, failed=1}

compute 在同一键的并发更新中原子执行；若替换为 get+put，多线程可能同时读到旧值并丢失更新。`,
        },
      ],
    ],
  },
  {
    name: 'Lambda、函数式接口与 Stream',
    track: 'P06 · Java / JVM / Spring',
    minutes: 44,
    prerequisite: '掌握接口、泛型和集合。',
    goal: '能使用 Lambda、方法引用、Stream、Collectors 和 Optional 编写清晰数据处理，并识别惰性求值、副作用和性能边界。',
    guidedPractice: '把一组订单数据用循环和 Stream 两种方式完成过滤、分组、排序和汇总，比较可读性与调试方式。',
    independentPractice: '重构一个复杂 Stream 链，拆成命名步骤，消除副作用并为结果补测试。',
    commonErrors: ['在 Stream 中修改外部集合。', '所有循环都强行改成 Stream。'],
    sourceRefs: [JAVA_API, JAVA_SPECS],
    steps: [
      [
        'Lambda 实现函数式接口',
        '函数式接口只有一个抽象方法，Lambda 提供该方法实现；方法引用适合直接复用已有方法而不写转调。Predicate、Function、Consumer、Supplier 和 Comparator 是最常见形状。Lambda 应保持短小，业务分支多时提取命名方法，让调用点表达“做什么”，方法体负责“怎么做”。捕获外部可变状态会破坏可测试性和并行安全。',
        '函数式代码也要可命名',
        {
          title: 'Java：Lambda、方法引用与命名谓词',
          language: 'Java',
          code: `import java.util.*;
import java.util.function.Predicate;

record Order(String id, long cents, boolean paid) {}

Predicate<Order> isPaid = Order::paid;
Predicate<Order> isLarge = order -> order.cents() >= 10_000;

List<Order> orders = List.of(
  new Order("O-1", 12_000, true),
  new Order("O-2", 8_000, true),
  new Order("O-3", 20_000, false)
);

List<String> ids = orders.stream()
  .filter(isPaid.and(isLarge))
  .map(Order::id)
  .toList();
System.out.println(ids);`,
          output: `[O-1]

谓词有业务名称，组合关系清楚。方法引用 Order::paid 和 Order::id 只复用已有访问器，不隐藏复杂逻辑。`,
        },
      ],
      [
        'Stream 是数据流水线',
        'Stream 的 filter、map、sorted 等中间操作是惰性的，只有 collect、toList、forEach、reduce 等终端操作才触发遍历。一个 Stream 只能消费一次，重复使用会抛 IllegalStateException。短路的 findFirst、anyMatch 可在得到结果后停止，但 sorted、全量 list 和分组仍需遍历全部输入。延迟执行也意味着异常和副作用发生时机要清楚。',
        '先建流水线，再终端消费',
        {
          title: 'Java：观察惰性求值与短路',
          language: 'Java',
          code: `import java.util.stream.Stream;

Stream<Integer> pipeline = Stream.of(1, 2, 3, 4)
  .filter(value -> {
    System.out.println("filter:" + value);
    return value % 2 == 0;
  })
  .map(value -> {
    System.out.println("map:" + value);
    return value * 10;
  });

System.out.println("before-terminal");
int first = pipeline.findFirst().orElseThrow();
System.out.println("result=" + first);`,
          output: `before-terminal
filter:1
filter:2
map:2
result=20

没有终端操作前流水线不执行；findFirst 命中 2 后短路，不再处理 3、4。`,
        },
      ],
      [
        'Collectors 表达聚合结果',
        'Collectors 把流元素汇总为 List、Set、Map、字符串或统计值，groupingBy、partitioningBy 和下游 Collector 可以组合。分组键和值类型要明确，重复键要指定合并规则，否则 toMap 会抛异常。复杂聚合先在纸上设计目标结构和排序，再写流水线；不要把一个巨大表达式塞进单行。',
        '聚合结构先设计',
        {
          title: 'Java：按状态分组并统计金额',
          language: 'Java',
          code: `import java.util.*;
import java.util.stream.*;

record Order(String id, String status, long cents) {}

Map<String, Long> totals = List.of(
  new Order("O-1", "PAID", 4200),
  new Order("O-2", "PAID", 800),
  new Order("O-3", "PENDING", 2000)
).stream().collect(Collectors.groupingBy(
  Order::status,
  TreeMap::new,
  Collectors.summingLong(Order::cents)
));

System.out.println(totals);`,
          output: `{PAID=5000, PENDING=2000}

外层 TreeMap 保证键排序，下游 summingLong 聚合金额。结果结构在设计时已明确为 Map<String, Long>。`,
        },
      ],
      [
        '副作用留在边界',
        'Stream 最适合无副作用转换：过滤、映射、排序和聚合。在流水线中修改外部集合、写文件、调用远程服务或打印大量日志，会让结果依赖执行顺序、短路和 parallel 行为。需要审计或通知时，先得到稳定结果，再在应用边界统一执行副作用；必要时对每个元素收集结果后批量处理。',
        '流水线保持纯函数',
        {
          title: 'Java：先计算再发送通知',
          language: 'Java',
          code: `import java.util.*;

List<String> emails = List.of("a@example.com", "bad", "b@example.com");

List<String> validEmails = emails.stream()
  .filter(email -> email.contains("@"))
  .map(String::trim)
  .distinct()
  .toList();

for (String email : validEmails) {
  mailer.enqueue(email);
}`,
          output: `validEmails=[a@example.com, b@example.com]

Stream 只做纯过滤和规范化；发送通知在终端收集后执行，失败重试和审计不会污染流水线。`,
        },
      ],
      [
        'Optional 表达可能缺失',
        'Optional 适合方法返回值，明确告诉调用方结果可能不存在；它不应作为字段、集合元素或大量参数，也不应把 get() 当默认路径。缺失和业务错误不同：找不到资源返回 Optional.empty，权限失败或数据库故障应抛异常/返回错误结果。调用方应使用 orElse、orElseThrow、map 或 ifPresent 提供明确业务行为。',
        '缺失是业务状态',
        {
          title: 'Java：Optional 提供显式缺失分支',
          language: 'Java',
          code: `import java.util.*;

class OrderRepository {
  private final Map<String, Order> rows = Map.of("O-1", new Order("O-1", 4200));

  Optional<Order> findById(String id) {
    return Optional.ofNullable(rows.get(id));
  }
}

Order found = repo.findById("O-1").orElseThrow(() -> new IllegalArgumentException("NOT_FOUND"));
Order failed = repo.findById("O-404")
  .orElseThrow(() -> new NoSuchElementException("ORDER_NOT_FOUND"));
System.out.println(found.id());`,
          output: `O-1

第一次调用返回现成订单；第二次进入明确异常分支。没有用 optional.get() 跳过缺失处理。`,
        },
      ],
    ],
  },
  {
    name: '日期时间、Optional 与不可变数据',
    track: 'P06 · Java / JVM / Spring',
    minutes: 40,
    prerequisite: '掌握对象相等性、集合和 Stream。',
    goal: '能使用 java.time、Optional 和不可变数据结构建立清晰的时间、缺失值和值对象边界。',
    guidedPractice: '实现订单创建时间、支付时间和时区转换，比较 LocalDateTime、Instant 与 ZonedDateTime。',
    independentPractice: '修复一个时区错乱和 null 含义模糊的订单模块，补边界测试。',
    commonErrors: ['把 LocalDateTime 当全球时间点。', '用 null 同时表示未知和无值。'],
    sourceRefs: [JAVA_API, JAVA_SPECS],
    steps: [
      [
        '先区分时间点和本地时间',
        'Instant 表示 UTC 时间线上的一个点，适合记录事件发生时刻；LocalDateTime 只有日期和时间，没有时区，适合表达“本地钟表时间”但不知道对应哪个全球时刻；ZonedDateTime 同时携带 ZoneId 和时区规则。API 存储应优先用 Instant 或带偏移的标准时间，展示时再按用户 ZoneId 格式化。把 LocalDateTime 当全球时间点会丢失跨时区语义。',
        '时间语义先于格式化',
        {
          title: 'Java：Instant 与 LocalDateTime 对照',
          language: 'Java',
          code: `import java.time.*;

Instant instant = Instant.parse("2026-11-23T08:00:00Z");
LocalDateTime local = LocalDateTime.of(2026, 11, 23, 16, 0);
ZonedDateTime shanghai = instant.atZone(ZoneId.of("Asia/Shanghai"));

System.out.println(instant);
System.out.println(local);
System.out.println(shanghai);
System.out.println(shanghai.toInstant().equals(instant));`,
          output: `2026-11-23T08:00:00Z
2026-11-23T16:00
2026-11-23T16:00+08:00[Asia/Shanghai]
true

LocalDateTime 不知道自己是哪个时区；Instant 与 ZonedDateTime 能准确回到同一全球时刻。`,
        },
      ],
      [
        '时区与夏令时是规则',
        '时区不是固定偏移，而是由地区历史和夏令时规则决定。America/New_York 在一年中可能使用 -05:00 或 -04:00，某些本地时间还可能不存在或重复。跨时区转换应保存 ZoneId 或 Instant，不能手写 +8 小时。数据库、JSON 和日志要统一格式，测试覆盖切换日、重复小时和未来规则更新。',
        '保存 Instant，展示带 ZoneId',
        {
          title: 'Java：夏令时切换日的本地时间',
          language: 'Java',
          code: `ZoneId newYork = ZoneId.of("America/New_York");
LocalDate date = LocalDate.of(2026, 3, 8);
for (int hour = 0; hour <= 4; hour++) {
  LocalDateTime local = date.atTime(hour, 30);
  ZonedDateTime zoned = local.atZone(newYork);
  System.out.println(local + " -> " + zoned.getOffset());
}`,
          output: `2026-03-08T00:30 -> -05:00
2026-03-08T01:30 -> -05:00
2026-03-08T02:30 -> -04:00
2026-03-08T03:30 -> -04:00
2026-03-08T04:30 -> -04:00

02:30 不存在于该地区本地钟表，atZone 会按规则调整；真实业务要显式检测 gap/overlap，而不是假设每小时都连续。`,
        },
      ],
      [
        'Duration 与 Period 分工不同',
        'Duration 表示精确的机器时间长度，例如 90 分钟或 2 小时；Period 表示日历日期差，例如 1 个月或 3 天。月份和年份长度不固定，不能用固定秒数替代日历规则。ChronoUnit.between 可以选择单位，但跨越夏令时和月末时要明确语义。超时、缓存 TTL 和任务耗时用 Duration；会员期限、账单周期和生日用 Period 或 LocalDate 规则。',
        '机器时间与日历时间分开',
        {
          title: 'Java：Duration 与 Period 对比',
          language: 'Java',
          code: `import java.time.*;

Instant start = Instant.parse("2026-01-31T23:00:00Z");
Instant end = Instant.parse("2026-02-01T01:30:00Z");
Duration duration = Duration.between(start, end);

LocalDate first = LocalDate.of(2026, 1, 31);
LocalDate next = first.plusMonths(1);
Period period = Period.between(first, next);

System.out.println(duration);
System.out.println(duration.toMinutes());
System.out.println(period);`,
          output: `PT2H30M
150
P1M

Duration 是精确 150 分钟；1 月 31 日到 2 月 28 日按日历得到 P28D 或月末规则，不能用固定 30 天替代。`,
        },
      ],
      [
        'Optional 只表达返回缺失',
        'Optional 让方法返回值显式表达“可能没有结果”，调用方必须选择默认值、抛业务错误或继续映射。它不是 null 的全局替代，也不适合字段、集合元素、方法参数和序列化模型。多个失败原因应使用 sealed 结果或业务异常，而不是 Optional 加空字符串。返回 Optional 的仓储查询代表资源不存在，数据库故障仍是异常。',
        '缺失不等于错误',
        {
          title: 'Java：Optional 映射和默认值',
          language: 'Java',
          code: `import java.util.Optional;

record Customer(String name) {}

Optional<Customer> find(String id) {
  return "C-1".equals(id) ? Optional.of(new Customer("Ada")) : Optional.empty();
}

String display = find("C-404")
  .map(Customer::name)
  .orElse("未绑定客户");

Customer required = find("C-404")
  .orElseThrow(() -> new IllegalArgumentException("CUSTOMER_NOT_FOUND"));
System.out.println(display);`,
          output: `未绑定客户
随后 required 进入 CUSTOMER_NOT_FOUND 分支。

展示场景有合法默认值；必须绑定客户的场景明确失败。缺失语义没有被 null 混淆。`,
        },
      ],
      [
        '不可变值对象封装规则',
        '金额、时间范围、订单编号和数量适合封装为不可变值对象，在构造时校验单位、精度、开始结束顺序和边界。record 可以简洁实现，但若需要隐藏组件或复杂派生字段可用 final 类。值对象相等性按内容和单位判断，创建后不可变，适合放入集合和 Map。跨层传输时仍要按 API 契约解析，不直接相信外部 JSON。',
        '边界处校验，内部可信',
        {
          title: 'Java：不可变时间范围值对象',
          language: 'Java',
          code: `import java.time.Instant;

record TimeRange(Instant start, Instant end) {
  TimeRange {
    if (start == null || end == null) throw new IllegalArgumentException("RANGE_NULL");
    if (start.isAfter(end)) throw new IllegalArgumentException("RANGE_ORDER");
  }

  boolean contains(Instant value) {
    return !value.isBefore(start) && !value.isAfter(end);
  }
}

TimeRange range = new TimeRange(
  Instant.parse("2026-11-23T00:00:00Z"),
  Instant.parse("2026-11-24T00:00:00Z")
);
System.out.println(range.contains(Instant.parse("2026-11-23T12:00:00Z")));`,
          output: `true

构造后 start/end 不可修改，所有时间判断自动满足范围顺序。非法范围在边界处立即失败。`,
        },
      ],
    ],
  },
  {
    name: '文件、NIO 与结构化输入输出',
    track: 'P06 · Java / JVM / Spring',
    minutes: 44,
    prerequisite: '掌握异常、资源关闭、字符串和集合。',
    goal: '能使用 Path、Files、Buffer、Channel 和字符编码安全处理文件，理解阻塞 IO、缓冲和错误恢复。',
    guidedPractice: '读取 CSV 订单文件，按 UTF-8 解析、校验并在遇到坏行时生成可追踪错误报告。',
    independentPractice: '实现原子写入和临时文件替换，验证进程中断时不会破坏原文件。',
    commonErrors: ['依赖平台默认编码。', '直接覆盖目标文件导致失败后数据丢失。'],
    sourceRefs: [JAVA_API, JAVA_SPECS],
    steps: [
      [
        'Path 表示位置，Files 执行操作',
        'Path 是平台无关路径值，可用 resolve、normalize、toAbsolutePath 组合和规范化，Files 负责存在性、读取、写入、复制、移动和目录遍历。相对路径按进程当前工作目录解析，桌面、服务和测试启动目录可能不同；业务路径应来自配置并转为绝对路径。拼接不要手写字符串，以免分隔符、上级目录和 Windows 盘符处理错误。',
        '路径与内容操作分开',
        {
          title: 'Java：从配置目录解析并校验文件',
          language: 'Java',
          code: `import java.nio.file.*;

Path base = Path.of("data").toAbsolutePath().normalize();
Path input = base.resolve("../imports/orders.csv").normalize();
Files.createDirectories(base);

if (!input.startsWith(base.getParent())) {
  throw new IllegalArgumentException("PATH_ESCAPE");
}
System.out.println(input);
System.out.println(Files.exists(input));`,
          output: `C:\\work\\app\\imports\\orders.csv
false

resolve 组合路径，normalize 处理 ..；startsWith 阻止配置或用户输入逃逸到不允许的根目录。`,
        },
      ],
      [
        '字符编码必须显式',
        '文本文件是字节加编码规则。UTF-8、GBK、UTF-16 对同一中文字符产生不同字节，使用错误编码会乱码或抛 MalformedInputException。读取和写入都应显式指定 StandardCharsets.UTF_8 或协议声明编码；CSV 还要明确分隔符、引号、BOM 和换行规则。平台默认编码会随操作系统和启动环境变化，是隐蔽回归来源。',
        '编码是文件契约',
        {
          title: 'Java：显式 UTF-8 写入和读取',
          language: 'Java',
          code: `import java.nio.charset.*;
import java.nio.file.*;

Path file = Path.of("orders.txt");
Files.writeString(file, "订单：1001\\n客户：张三\\n", StandardCharsets.UTF_8);
String text = Files.readString(file, StandardCharsets.UTF_8);

System.out.println(text.contains("张三"));
System.out.println(Files.size(file));`,
          output: `true
34

编写和读取使用同一编码。若外部文件来自其他系统，应先确认编码并用严格解码策略，不要静默替换坏字节。`,
        },
      ],
      [
        '缓冲减少系统调用',
        '每次直接读写小块都会产生系统调用和内核态切换开销，BufferedReader/Writer 或 NIO ByteBuffer 可减少次数。大文件应逐行或按块处理，避免 Files.readAllLines 一次装入内存；需要随机访问时再考虑 FileChannel。缓冲不是自动正确性，仍要限制单行长度、文件大小和处理时间，防止恶意输入耗尽内存。',
        '先看文件规模和内存上限',
        {
          title: 'Java：流式读取大文件并限制单行',
          language: 'Java',
          code: `import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

long lines = 0;
try (BufferedReader reader = Files.newBufferedReader(Path.of("orders.csv"), StandardCharsets.UTF_8)) {
  String line;
  while ((line = reader.readLine()) != null) {
    if (line.length() > 10_000) throw new IllegalArgumentException("LINE_TOO_LONG");
    lines++;
  }
}
System.out.println("lines=" + lines);`,
          output: `lines=250000

文件内容没有一次性进入内存。单行长度限制防止坏文件导致超大字符串；统计过程可继续按块解析。`,
        },
      ],
      [
        '原子写入保护原文件',
        '直接覆盖目标文件时，如果进程崩溃、磁盘满或序列化失败，旧文件已经被截断，最终可能两者都没有。更安全路径是在同目录写临时文件，flush/close 并校验后使用 ATOMIC_MOVE 替换目标；同一文件系统内原子替换更可靠。还需同步目录元数据和备份策略，跨文件系统 move 可能退化为复制。',
        '失败时保留旧版本',
        {
          title: 'Java：临时文件原子替换',
          language: 'Java',
          code: `import java.nio.charset.StandardCharsets;
import java.nio.file.*;

Path target = Path.of("orders.json");
Path temp = Files.createTempFile(target.toAbsolutePath().getParent(), "orders-", ".tmp");
try {
  Files.writeString(temp, "{\\"status\\":\\"ok\\"}\\n", StandardCharsets.UTF_8);
  try {
    Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
  } catch (AtomicMoveNotSupportedException error) {
    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
  }
} finally {
  Files.deleteIfExists(temp);
}`,
          output: `目标文件只在完整内容写入后替换；写入或校验失败时，旧 orders.json 仍保留。

回退到普通 move 时要明确该文件系统不保证原子性，并保留备份和恢复策略。`,
        },
      ],
      [
        '坏数据要定位到行和列',
        '解析 CSV/JSON 时错误要包含文件、行号、列名、原始值和原因，才能让人修复或隔离。坏行策略应由业务决定：整批失败适合强一致导入，跳过并生成错误报告适合批量补录，隔离到死信文件适合异步处理。错误报告不要包含密钥和个人敏感数据；日志与导出分别控制字段。',
        '输入错误必须可追踪',
        {
          title: 'Java：坏行生成结构化错误',
          language: 'Java',
          code: `import java.util.ArrayList;
import java.util.List;

record RowError(int line, String column, String code, String raw) {}

List<RowError> errors = new ArrayList<>();
for (int line = 1; line <= 3; line++) {
  String rawTotal = line == 2 ? "abc" : "4200";
  try {
    Long.parseLong(rawTotal);
  } catch (NumberFormatException error) {
    errors.add(new RowError(line, "totalCents", "INVALID_NUMBER", rawTotal));
  }
}
System.out.println(errors);`,
          output: `[RowError[line=2, column=totalCents, code=INVALID_NUMBER, raw=abc]]

报告精确定位到第 2 行和 totalCents 列；生产导出应限制 raw 长度并避免敏感字段。`,
        },
      ],
    ],
  },
  {
    name: 'JUnit、断言与测试边界',
    track: 'P06 · Java / JVM / Spring',
    minutes: 42,
    prerequisite: '能编写多类项目并处理异常。',
    goal: '能用 JUnit 组织单元测试、参数化测试和异常测试，区分单元、集成与端到端测试边界。',
    guidedPractice: '为一个领域对象写正常、边界、异常和状态机测试，并运行单个测试和全量测试。',
    independentPractice: '审查一个过度使用 mock 的测试集，改成真实领域对象加少量边界替身。',
    commonErrors: ['一个测试断言十几个无关行为。', '测试实现细节导致重构必坏。'],
    sourceRefs: [JUNIT, JAVA_SPECS],
    steps: [
      [
        '测试名称描述规则',
        '测试名应写清给定条件、执行动作和预期结果，例如 rejectsWithdrawalAboveBalance 或 keepsDraftWhenValidationFails。失败报告里首先看到名称，名称模糊会让团队打开代码猜意图。测试类按被测行为或业务用例组织，不按私有方法机械对应；一个测试可以覆盖同一业务概念的多个副作用，但不要同时验证无关功能。',
        '测试名是行为规格',
        {
          title: 'JUnit：行为式测试名',
          language: 'Java',
          code: `class AccountTest {
  @Test
  void rejectsWithdrawalAboveBalance() {
    Account account = new Account(5000);
    assertThrows(IllegalStateException.class, () -> account.withdraw(6000));
  }

  @Test
  void keepsBalanceWhenWithdrawalIsRejected() {
    Account account = new Account(5000);
    assertThrows(IllegalStateException.class, () -> account.withdraw(6000));
    assertEquals(5000, account.balanceCents());
  }
}`,
          output: `✔ rejectsWithdrawalAboveBalance()
✔ keepsBalanceWhenWithdrawalIsRejected()

名称已经说明条件和预期，失败时无需先读实现才能理解业务规则。`,
        },
      ],
      [
        '一个概念可以有多个断言',
        '不必强行“一个测试只能一个 assert”。若多个断言都属于同一结果概念，例如订单支付成功后状态、支付时间、余额和审计记录都应一致，可以在同一测试中验证。相反，把登录、创建订单和发送邮件放在一个测试里，会在失败时无法判断哪条规则坏。断言应围绕可观察行为，并保留足够失败消息。',
        '断言围绕一个概念',
        {
          title: 'JUnit：同一业务结果的多项断言',
          language: 'Java',
          code: `@Test
  void payingOrderUpdatesStateAtomically() {
    Order order = new Order("O-1", 4200);
    order.pay("2026-11-23T08:00:00Z");

    assertEquals("PAID", order.status());
    assertEquals("2026-11-23T08:00:00Z", order.paidAt());
    assertEquals(4200, order.totalCents());
  }`,
          output: `✔ payingOrderUpdatesStateAtomically()

三个断言都属于“支付成功后的订单状态”这一个概念；失败时可以指出哪一项未保持一致。`,
        },
      ],
      [
        '参数化覆盖边界矩阵',
        '参数化测试把多组输入和期望集中成数据表，适合金额范围、状态码、日期边界和权限角色。每个案例应有可读标签，覆盖最小值、临界值、越界、空值和非法格式。避免只重复普通成功值；边界矩阵应来自业务规则，而不是随机堆数据。大量复杂对象案例可改用 ArgumentSource 或工厂方法。',
        '边界数据集中维护',
        {
          title: 'JUnit：参数化等级边界',
          language: 'Java',
          code: `import org.junit.jupiter.params.*;
import org.junit.jupiter.params.provider.*;

@ParameterizedTest(name = "score={0} => {1}")
@CsvSource({
  "-1,INVALID",
  "0,FAIL",
  "59,FAIL",
  "60,PASS",
  "89,PASS",
  "90,A",
  "100,A",
  "101,INVALID"
})
void mapsScoreBoundaries(int score, String expected) {
  assertEquals(expected, Level.of(score));
}`,
          output: `✔ score=-1 => INVALID
✔ score=0 => FAIL
✔ score=60 => PASS
✔ score=90 => A
✔ score=101 => INVALID

输出直接显示每组参数；新增边界只需补一行数据，不必复制测试方法。`,
        },
      ],
      [
        '测试替身只在边界使用',
        '领域对象、值对象和纯函数应优先用真实实现测试，不必 mock；数据库、网络、时间、随机数和消息系统等不确定边界可以用 fake、stub 或可控时钟。mock 调用次数会把测试绑定到实现顺序，重构时大量假失败。更稳的做法是定义窄接口，用内存 fake 观察业务结果，必要时只对关键副作用做少量验证。',
        '少 mock，真行为',
        {
          title: 'JUnit：内存仓储而非 mock 调用顺序',
          language: 'Java',
          code: `final class InMemoryOrderRepository implements OrderRepository {
  private final Map<String, Order> rows = new HashMap<>();
  public Optional<Order> findById(String id) { return Optional.ofNullable(rows.get(id)); }
  public void save(Order order) { rows.put(order.id(), order); }
}

@Test
void paysAndPersistsOrder() {
  InMemoryOrderRepository repository = new InMemoryOrderRepository();
  repository.save(new Order("O-1", 4200));

  new PayOrder(repository).execute("O-1");

  assertEquals("PAID", repository.findById("O-1").orElseThrow().status());
}`,
          output: `✔ paysAndPersistsOrder()

测试使用真实领域对象与内存适配器，验证业务结果，不依赖 save 被调用几次或方法内部顺序。`,
        },
      ],
      [
        '测试层级匹配风险',
        '单元测试快速验证领域规则和分支，集成测试验证数据库、HTTP、消息、序列化和框架事务，端到端测试只覆盖少量关键用户流程。越靠近故障边界的测试越能定位问题；把全部规则都放到 E2E 会慢且不稳定，只写单元测试又可能漏掉 SQL、配置和代理问题。测试金字塔不是固定比例，而是按风险和失败模式分配。',
        '越靠近故障边界越有效',
        {
          title: 'PowerShell：分层运行测试',
          language: 'PowerShell',
          code: `mvn -q -Dtest=AccountTest test
mvn -q -Dtest=*RepositoryIntegrationTest test
mvn -q verify
Get-ChildItem target/surefire-reports,target/failsafe-reports -ErrorAction SilentlyContinue |
  Select-Object Name, Length`,
          output: `AccountTest: 8 tests passed
RepositoryIntegrationTest: 3 tests passed
Total: unit + integration passed
surefire-reports 与 failsafe-reports 保留逐类结果和失败堆栈。`,
        },
      ],
    ],
  },
  {
    name: 'Java 基础项目：订单领域模型与 CLI 工具',
    track: 'P06 · Java / JVM / Spring',
    minutes: 58,
    prerequisite: '完成 Java 零基础、语言核心、OOP、集合、异常、IO 和测试课程。',
    goal: '能从空项目完成一个可测试、可运行、可打包的订单 CLI 工具，并把 J0-J3 知识连成完整工程。',
    guidedPractice: '实现订单创建、商品添加、价格计算、文件保存、查询和错误报告，使用领域对象、集合、异常、IO 和 JUnit。',
    independentPractice: '按验收场景从空目录重建项目，生成可执行制品并写运行手册。',
    commonErrors: ['所有逻辑写在 main 中。', '项目能运行但没有测试和构建说明。'],
    sourceRefs: [MAVEN, JUNIT, GIT, JAVA_API],
    steps: [
      [
        '先定义领域和用例',
        '项目从业务语言开始：订单有唯一编号、客户、明细、状态和创建时间；商品项有 SKU、单价和数量；金额使用整数分或 BigDecimal 统一单位。列出创建订单、添加商品、支付、取消、查询和保存文件等用例，再决定文件格式和 CLI 参数。先定义不变量与失败语义，可以避免把结构直接绑死在某个 JSON 字段或命令参数上。',
        '从业务语言进入代码',
        {
          title: 'Java：先写领域模型和用例接口',
          language: 'Java',
          code: `record OrderItem(String sku, long unitCents, int quantity) {
  OrderItem {
    if (sku == null || sku.isBlank()) throw new IllegalArgumentException("SKU");
    if (unitCents < 0 || quantity <= 0) throw new IllegalArgumentException("ITEM");
  }
}

record CreateOrderCommand(String orderId, String customerId, List<OrderItem> items) {}
record OrderView(String id, String status, long totalCents) {}

interface CreateOrder {
  OrderView execute(CreateOrderCommand command);
}

interface FindOrder {
  Optional<OrderView> execute(String orderId);
}`,
          output: `领域模型先固定 SKU、金额单位和数量规则；用例接口只接收命令并返回稳定视图。

JSON、SQL 和 CLI 参数尚未泄漏进领域。`,
        },
      ],
      [
        '建立分层但不过度设计',
        '小项目也需要明确层次，但不需要复制企业框架。domain 放实体、值对象和规则，application 放用例编排，adapter 放 CLI、JSON 文件或数据库，bootstrap 负责组装依赖。依赖方向从边界指向应用和领域，领域不知道 Spring、JDBC 或 System.out。目录与包名一致，每一层只承担一种变化，未来增加 HTTP 或数据库时无需重写业务规则。',
        '每层只承担一种变化',
        {
          title: 'PowerShell：建立可解释的项目目录',
          language: 'PowerShell',
          code: `$root='orders-cli/src/main/java/com/example/orders'
New-Item -ItemType Directory -Force "$root/domain","$root/application","$root/adapter/cli","$root/adapter/json","$root/bootstrap" | Out-Null
Get-ChildItem orders-cli/src/main/java -Recurse -Directory |
  ForEach-Object { $_.FullName.Replace((Resolve-Path orders-cli).Path, '.') }`,
          output: `.\\src\\main\\java\\com\\example\\orders\\domain
.\\src\\main\\java\\com\\example\\orders\\application
.\\src\\main\\java\\com\\example\\orders\\adapter\\cli
.\\src\\main\\java\\com\\example\\orders\\adapter\\json
.\\src\\main\\java\\com\\example\\orders\\bootstrap

domain 不 import adapter；bootstrap 在启动时把 JsonOrderRepository 注入应用服务。`,
        },
      ],
      [
        '用测试驱动关键规则',
        '优先测试金额、数量、状态转换、重复订单、坏文件和查询缺失。测试从真实领域对象和应用用例出发，边界适配器用内存或临时目录；不必为每个 getter 写测试，也不要只测 main 输出的字符串。每发现一个缺陷先写失败回归，再修实现。关键规则覆盖后，CLI、文件格式和重构都可以快速验证是否有行为回归。',
        '把关键规则钉死',
        {
          title: 'Java + JUnit：订单用例行为测试',
          language: 'Java',
          code: `import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class CreateOrderTest {
  @Test
  void calculatesTotalAndStoresOrder() {
    InMemoryOrderRepository repository = new InMemoryOrderRepository();
    CreateOrder useCase = new CreateOrderService(repository);

    OrderView view = useCase.execute(new CreateOrderCommand(
      "O-1", "C-1",
      List.of(new OrderItem("A", 4200, 2), new OrderItem("B", 1000, 1))
    ));

    assertEquals(9400, view.totalCents());
    assertEquals("PENDING", view.status());
    assertTrue(repository.findById("O-1").isPresent());
  }
}`,
          output: `✔ calculatesTotalAndStoresOrder()

测试验证金额、初始状态和持久化结果，不依赖 CLI 文本格式。`,
        },
      ],
      [
        '打包并在命令行验收',
        '把测试通过的代码打成可执行 JAR，记录 manifest、主类和依赖形态。验收从项目外目录执行 help、create、find 和错误命令，确认不会依赖 IDE 工作目录、本地 classpath 或源码目录。输入文件、输出文件和退出码都要检查；成功返回 0，参数错误返回非 0，业务失败使用稳定错误码。',
        '真实制品才算交付',
        {
          title: 'PowerShell：从制品执行业务验收',
          language: 'PowerShell',
          code: `mvn clean verify
java -jar target/orders-cli.jar help
java -jar target/orders-cli.jar create --id O-1 --customer C-1 --item A:4200:2
java -jar target/orders-cli.jar find --id O-1
java -jar target/orders-cli.jar find --id missing
"missingExit=$LASTEXITCODE"
Get-FileHash target/orders-cli.jar -Algorithm SHA256`,
          output: `total=9400 status=PENDING
O-1 PENDING 9400
ORDER_NOT_FOUND
missingExit=2
SHA256 1A9F...C220

制品在没有 IDE 的目录下可运行，成功与失败退出码都可被脚本判断。`,
        },
      ],
      [
        '交接文档和下一阶段入口',
        'README 要包含 JDK 和 Maven 版本、目录说明、构建命令、测试命令、CLI 示例、数据文件位置、退出码和已知边界。另写运行手册说明如何备份、恢复和排查坏文件。项目完成后保留清晰演进点：用 JDBC 替换 JSON 适配器、用 HTTP 替换 CLI、为并发写入加事务；这些变化应主要发生在 adapter/application，而不是重写领域规则。',
        '基础项目是企业项目起点',
        {
          title: 'README：可复制运行手册',
          language: 'Markdown',
          code: `# orders-cli

## 环境
- JDK 21
- Maven 3.9+

## 构建与测试
\`\`\`powershell
mvn clean verify
\`\`\`

## 运行
\`\`\`powershell
java -jar target/orders-cli.jar create --id O-1 --customer C-1 --item A:4200:2
java -jar target/orders-cli.jar find --id O-1
\`\`\`

## 退出码
- 0：成功
- 2：业务或参数错误
- 1：未捕获系统错误

## 数据与恢复
- 数据文件：./data/orders.json
- 写入使用临时文件 + 原子替换
- 恢复：停进程，替换备份，再执行 verify`,
          output: `新成员从仓库根目录按 README 即可安装、测试、构建和运行。

下一阶段可将 JSON 适配器替换为 JDBC，并保留同一应用用例与领域测试。`,
        },
      ],
    ],
  },
];
