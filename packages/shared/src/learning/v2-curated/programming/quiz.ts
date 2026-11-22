import type { LearningV2Practice } from '../../v2-types.js';

/**
 * 编程课程章节题库：键 = 课程名（必须与 catalog 里的课程名完全一致）。
 * · 每门课 3~6 道选择题，题目必须能在本课步骤内容里找到依据，不允许臆造 API 或版本细节。
 * · 没有配置题库的课程：练习页回退到科目综合题 + 课程步骤自测清单（checkpoint）。
 * · 后续扩展：按「编程课程教案重写进度」的节奏逐课补题，写完一门挂一门。
 */
export const PROGRAMMING_COURSE_QUIZ: Readonly<
  Record<string, readonly LearningV2Practice[]>
> = {
  'Java 零基础：JDK、IDE 与第一个程序': [
    {
      prompt: '第一次运行 Java 程序时，最需要先确认什么？',
      options: [
        'java 与 javac 来自同一套 JDK，包名、文件名和类名一致',
        '直接把内存调到最大',
        '先安装 Spring Boot',
      ],
      answer: 0,
      explanation:
        '初学者环境问题几乎都出在「命令来自哪套工具」和「源码结构与类名不一致」。先确认 java/javac 可用且属于同一套 JDK，再核对文件名、类名与包声明一致，才谈得上运行。',
      focus: 'Java 零基础 · 环境确认',
    },
    {
      prompt: 'javac 与 java 两条命令分别负责什么？',
      options: [
        'javac 把 .java 源码编译成 .class 字节码；java 启动 JVM 加载并运行字节码',
        'javac 负责运行字节码；java 负责把源码编译成字节码',
        '两者都是打包工具，可以互相替代',
        'javac 只在发布打包时使用，本地运行用不到它',
      ],
      answer: 0,
      explanation:
        'javac 是编译器：把人能读的 .java 编译成平台无关的 .class 字节码；java 命令启动 JVM，由它加载并执行字节码。方向记反了，报错就会完全对不上。',
      focus: 'Java 零基础 · 编译与运行',
    },
    {
      prompt: 'JDK、JRE、JVM 三者的包含关系是？',
      options: [
        'JDK 包含 JRE，JRE 包含 JVM',
        'JRE 包含 JDK，JDK 包含 JVM',
        '三者互相独立，装任意一个即可编译运行',
        'JVM 包含 JDK 与 JRE',
      ],
      answer: 0,
      explanation:
        'JDK = 开发工具（javac、javadoc 等）+ JRE；JRE = JVM + 核心类库。只想运行程序装 JRE 即可，要编译源码就必须装 JDK。',
      focus: 'Java 零基础 · 工具链',
    },
    {
      prompt: '下面哪一个是 JVM 认可的程序入口签名？',
      options: [
        'public static void main(String[] args)',
        'public void Main(string args)',
        'static int main()',
        'public static main(String args)',
      ],
      answer: 0,
      explanation:
        'JVM 的入口约定是 public static void main(String[] args)：访问修饰符、static、返回类型 void、参数形式缺一不可，否则运行时报「main 方法找不到」。',
      focus: 'Java 零基础 · 程序入口',
    },
    {
      prompt: '程序运行后控制台没有输出、进程退出码非 0，最合理的下一步是什么？',
      options: [
        '先读异常堆栈和退出码，判断是编译错误还是运行时异常，再定位代码',
        '立刻卸载并重装 JDK',
        '把分配内存调大再跑一遍',
        '把整个工程的代码全部注释掉逐行恢复',
      ],
      answer: 0,
      explanation:
        '非零退出码说明进程异常结束。排查顺序应当是：读堆栈/日志 → 区分编译期与运行期错误 → 缩小到可疑代码段。跳过证据直接重装环境或盲改代码，只会掩盖问题。',
      focus: 'Java 零基础 · 排错路径',
    },
  ],
};
