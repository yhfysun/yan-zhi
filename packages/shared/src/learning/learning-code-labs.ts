import type { LearningV2CodeLab } from './v2-types.js';
import { PROGRAMMING_FOUNDATION_F0_F1_CODE_LABS } from './learning-code-labs-programming-foundations-f0-f1.js';
import { JAVASCRIPT_CODE_LABS } from './learning-code-labs-javascript.js';
import { PYTHON_CODE_LABS } from './learning-code-labs-python.js';
import { LEARNING_CODE_LABS_C_C_CPP } from './learning-code-labs-c-cpp.js';
import { LEARNING_CODE_LABS_JAVA } from './learning-code-labs-java.js';
import { LEARNING_CODE_LABS_ALGORITHMS_CORE } from './learning-code-labs-algorithms-core.js';
import { LEARNING_CODE_LABS_ALGORITHMS_ADVANCED } from './learning-code-labs-algorithms-advanced.js';
import { LEARNING_CODE_LABS_GO } from './learning-code-labs-go.js';
import { LEARNING_CODE_LABS_ENGINEERING } from './learning-code-labs-engineering.js';
import { LEARNING_CODE_LABS_GO_ADVANCED } from './learning-code-labs-go-advanced.js';
import { LEARNING_CODE_LABS_P15_NIMBUS_LOGFORGE } from './learning-code-labs-p15-nimbus-logforge.js';
import { LEARNING_CODE_LABS_P15_STUDIO_PULSE } from './learning-code-labs-p15-studio-pulse.js';
import { LEARNING_CODE_LABS_P15_TEAMFLOW_COMMERCE } from './learning-code-labs-p15-teamflow-commerce.js';
import { LEARNING_CODE_LABS_P15_ORBIT_ATLAS } from './learning-code-labs-p15-orbit-atlas.js';
import { LEARNING_CODE_LABS_P15_DEVKIT } from './learning-code-labs-p15-devkit.js';
import { LEARNING_CODE_LABS_P15_LAUNCHPAD_CANVAS } from './learning-code-labs-p15-launchpad-canvas.js';
import { LEARNING_CODE_LABS_TYPESCRIPT } from './learning-code-labs-typescript.js';
import { LEARNING_CODE_LABS_PYTHON_ADVANCED } from './learning-code-labs-python-advanced.js';
import { LEARNING_CODE_LABS_P15_DATAFLOW_SECUREVAULT } from './learning-code-labs-p15-dataflow-securevault.js';
import { LEARNING_CODE_LABS_JAVA_ADVANCED } from './learning-code-labs-java-advanced.js';
import { LEARNING_CODE_LABS_GO_REMAINING } from './learning-code-labs-go-remaining.js';
import { LEARNING_CODE_LABS_STRUCTURED } from './learning-code-labs-structured.js';
import { LEARNING_CODE_LABS_ENGINEERING_ADVANCED } from './learning-code-labs-engineering-advanced.js';
import { LEARNING_CODE_LABS_MIDDLEWARE } from './learning-code-labs-middleware.js';
import { LEARNING_CODE_LABS_NATIVE_ADVANCED } from './learning-code-labs-native-advanced.js';
import { LEARNING_CODE_LABS_HTML_CSS } from './learning-code-labs-html-css.js';
import { LEARNING_CODE_LABS_MIDDLEWARE_REMAINING } from './learning-code-labs-middleware-remaining.js';
import { LEARNING_CODE_LABS_JAVA_STRUCTURED } from './learning-code-labs-java-structured.js';
import { LEARNING_CODE_LABS_REACT_VUE } from './learning-code-labs-react-vue.js';
import { LEARNING_CODE_LABS_HTML_CSS_REMAINING } from './learning-code-labs-html-css-remaining.js';
import { LEARNING_CODE_LABS_FRONTEND_STRUCTURED } from './learning-code-labs-frontend-structured.js';
import { LEARNING_CODE_LABS_PYTHON_FINAL } from './learning-code-labs-python-final.js';
import { LEARNING_CODE_LABS_HTML_CSS_FINAL } from './learning-code-labs-html-css-final.js';
import { LEARNING_CODE_LABS_NATIVE_REMAINING } from './learning-code-labs-native-remaining.js';
import { LEARNING_CODE_LABS_TYPESCRIPT_FINAL } from './learning-code-labs-typescript-final.js';
import { LEARNING_CODE_LABS_BACKEND_STRUCTURED } from './learning-code-labs-backend-structured.js';
import { LEARNING_CODE_LABS_JAVA_FINAL } from './learning-code-labs-java-final.js';
import { LEARNING_CODE_LABS_REACT_VUE_REMAINING } from './learning-code-labs-react-vue-remaining.js';
import { LEARNING_CODE_LABS_NATIVE_FINAL_A } from './learning-code-labs-native-final-a.js';
import { LEARNING_CODE_LABS_JAVASCRIPT_REMAINING } from './learning-code-labs-javascript-remaining.js';
import { LEARNING_CODE_LABS_REACT_VUE_FINAL } from './learning-code-labs-react-vue-final.js';
import { LEARNING_CODE_LABS_JAVA_STRUCTURED_FINAL } from './learning-code-labs-java-structured-final.js';
import { LEARNING_CODE_LABS_P00 } from './learning-code-labs-p00.js';
import { LEARNING_CODE_LABS_REACT_VUE_LAST } from './learning-code-labs-react-vue-last.js';
import { LEARNING_CODE_LABS_ENGINEERING_FINAL } from './learning-code-labs-engineering-final.js';
import { LEARNING_CODE_LABS_ALGORITHMS_FINAL_C } from './learning-code-labs-algorithms-final-c.js';
import { LEARNING_CODE_LABS_ALGORITHMS_FINAL_B } from './learning-code-labs-algorithms-final-b.js';
import { LEARNING_CODE_LABS_ALGORITHMS_FINAL_A } from './learning-code-labs-algorithms-final-a.js';
import { LEARNING_CODE_LABS_JAVA_STRUCTURED_NEXT } from './learning-code-labs-java-structured-next.js';
import { LEARNING_CODE_LABS_ENGINEERING_FINAL2 } from './learning-code-labs-engineering-final2.js';
import { LEARNING_CODE_LABS_FOUNDATIONS_REMAINING } from './learning-code-labs-foundations-remaining.js';
import { LEARNING_CODE_LABS_STRUCTURED_FINAL_ALL } from './learning-code-labs-structured-final-all.js';
import { LEARNING_CODE_LABS_JAVA_P06_LAST } from './learning-code-labs-java-p06-last.js';
import { LEARNING_CODE_LABS_ENGINEERING_FINAL3 } from './learning-code-labs-engineering-final3.js';
import { LEARNING_CODE_LABS_FOUNDATIONS_FINAL } from './learning-code-labs-foundations-final.js';
import { LEARNING_CODE_LABS_ENGINEERING_LAST } from './learning-code-labs-engineering-last.js';

/**
 * 课程级真实代码实验室。
 *
 * 只登记已经逐课核对过起始代码、运行边界与验收动作的课题；
 * 不用通用模板批量补齐。编程其余课程与算法其余讲次继续按
 * docs/编程课程教案重写进度-2026-11-21.md 的看板分批接入。
 */
export const LEARNING_V2_CODE_LABS: Readonly<Record<string, LearningV2CodeLab>> = {
  ...PROGRAMMING_FOUNDATION_F0_F1_CODE_LABS,
  ...JAVASCRIPT_CODE_LABS,
  ...PYTHON_CODE_LABS,
  ...LEARNING_CODE_LABS_C_C_CPP,
  ...LEARNING_CODE_LABS_JAVA,
  ...LEARNING_CODE_LABS_ALGORITHMS_CORE,
  ...LEARNING_CODE_LABS_ALGORITHMS_ADVANCED,
  ...LEARNING_CODE_LABS_GO,
  ...LEARNING_CODE_LABS_ENGINEERING,
  ...LEARNING_CODE_LABS_GO_ADVANCED,
  ...LEARNING_CODE_LABS_P15_NIMBUS_LOGFORGE,
  ...LEARNING_CODE_LABS_P15_STUDIO_PULSE,
  ...LEARNING_CODE_LABS_P15_TEAMFLOW_COMMERCE,
  ...LEARNING_CODE_LABS_P15_ORBIT_ATLAS,
  ...LEARNING_CODE_LABS_P15_DEVKIT,
  ...LEARNING_CODE_LABS_P15_LAUNCHPAD_CANVAS,
  ...LEARNING_CODE_LABS_TYPESCRIPT,
  ...LEARNING_CODE_LABS_PYTHON_ADVANCED,
  ...LEARNING_CODE_LABS_P15_DATAFLOW_SECUREVAULT,
  ...LEARNING_CODE_LABS_JAVA_ADVANCED,
  ...LEARNING_CODE_LABS_GO_REMAINING,
  ...LEARNING_CODE_LABS_STRUCTURED,
  ...LEARNING_CODE_LABS_ENGINEERING_ADVANCED,
  ...LEARNING_CODE_LABS_MIDDLEWARE,
  ...LEARNING_CODE_LABS_NATIVE_ADVANCED,
  ...LEARNING_CODE_LABS_HTML_CSS,
  ...LEARNING_CODE_LABS_MIDDLEWARE_REMAINING,
  ...LEARNING_CODE_LABS_JAVA_STRUCTURED,
  ...LEARNING_CODE_LABS_REACT_VUE,
  ...LEARNING_CODE_LABS_HTML_CSS_REMAINING,
  ...LEARNING_CODE_LABS_FRONTEND_STRUCTURED,
  ...LEARNING_CODE_LABS_PYTHON_FINAL,
  ...LEARNING_CODE_LABS_HTML_CSS_FINAL,
  ...LEARNING_CODE_LABS_NATIVE_REMAINING,
  ...LEARNING_CODE_LABS_TYPESCRIPT_FINAL,
  ...LEARNING_CODE_LABS_BACKEND_STRUCTURED,
  ...LEARNING_CODE_LABS_JAVA_FINAL,
  ...LEARNING_CODE_LABS_REACT_VUE_REMAINING,
  ...LEARNING_CODE_LABS_NATIVE_FINAL_A,
  ...LEARNING_CODE_LABS_JAVASCRIPT_REMAINING,
  ...LEARNING_CODE_LABS_REACT_VUE_FINAL,
  ...LEARNING_CODE_LABS_JAVA_STRUCTURED_FINAL,
  ...LEARNING_CODE_LABS_P00,
  ...LEARNING_CODE_LABS_REACT_VUE_LAST,
  ...LEARNING_CODE_LABS_ENGINEERING_FINAL,
  ...LEARNING_CODE_LABS_ALGORITHMS_FINAL_C,
  ...LEARNING_CODE_LABS_ALGORITHMS_FINAL_B,
  ...LEARNING_CODE_LABS_ALGORITHMS_FINAL_A,
  ...LEARNING_CODE_LABS_JAVA_STRUCTURED_NEXT,
  ...LEARNING_CODE_LABS_ENGINEERING_FINAL2,
  ...LEARNING_CODE_LABS_FOUNDATIONS_REMAINING,
  ...LEARNING_CODE_LABS_STRUCTURED_FINAL_ALL,
  ...LEARNING_CODE_LABS_JAVA_P06_LAST,
  ...LEARNING_CODE_LABS_ENGINEERING_FINAL3,
  ...LEARNING_CODE_LABS_FOUNDATIONS_FINAL,
  ...LEARNING_CODE_LABS_ENGINEERING_LAST,
  'programming:Java 零基础：JDK、IDE 与第一个程序': {
    title: '第 1 课代码台 · JDK、Main.java 与真实运行',
    description:
      '先确认 java 和 javac 来自同一个 JDK，再在应用内修改、编译并运行 Main.java。运行成功后把版本、java.home、退出码和耗时记入本课证据。',
    requiredRuntime: 'java',
    runtimeLabel: 'Java / JDK 21 LTS',
    downloadUrl: 'https://adoptium.net/temurin/releases/',
    docsUrl: 'https://docs.oracle.com/en/java/javase/21/',
    installSteps: [
      '安装 Eclipse Temurin JDK 21，并勾选把 JAVA_HOME 写入系统环境变量。',
      '关闭并重新打开应用，让新的 PATH 生效。',
      '点击重新检测，确认 java 与 javac 都能定位到同一个 JDK。',
    ],
    languages: ['java'],
    practice: {
      id: 'java-first-program-guided',
      title: '跟做：让程序自己报告 JDK',
      brief:
        '先原样运行一次。程序会打印 Java 版本和 java.home；这两项就是本机 JDK 是否真正参与编译运行的可观察证据。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  public static void main(String[] args) {
    String version = System.getProperty("java.version");
    String javaHome = System.getProperty("java.home");

    System.out.println("JDK 版本: " + version);
    System.out.println("java.home: " + javaHome);
    System.out.println("第一段 Java 程序已运行。");
  }
}
`,
      },
      checkpoint:
        '运行通过后核对三项：exit 0、输出含 JDK 版本、控制台没有编译错误。再在 PowerShell 执行 javac -version，版本应与程序输出同一主线。',
    },
    apply: {
      id: 'java-first-program-independent',
      title: '独立实践：完成你的环境卡程序',
      brief:
        '把 learnerName 改成你的名字，再增加一行“编译命令：javac Main.java”和“运行命令：java Main”。程序必须能编译并通过运行。',
      defaultLanguage: 'java',
      starterCode: {
        java: `public class Main {
  public static void main(String[] args) {
    String learnerName = "TODO: 改成你的名字";
    String version = System.getProperty("java.version");
    String javaHome = System.getProperty("java.home");

    System.out.println("学习者: " + learnerName);
    System.out.println("JDK 版本: " + version);
    System.out.println("java.home: " + javaHome);
    System.out.println("TODO: 输出 javac 与 java 两条命令");
  }
}
`,
      },
      checkpoint:
        '验收不是“看见绿色按钮”，而是：源码文件名与公开类名都是 Main、javac 编译成功、java 启动成功、exit code 为 0，且输出能作为环境卡证据。',
    },
  },
  'algorithms:算法与数据结构 · 复杂度、正确性与测量：输入规模与大 O': {
    title: '第 1 讲代码台 · 把操作次数跑出来',
    description:
      '同一段 O(n^2) 计数分别跑 n=10、100、1000，观察操作次数怎样增长。先在纸面估算，再让代码给出可复核数字。',
    runtimeLabel: 'JavaScript / Python 内置运行时',
    docsUrl: 'https://oi-wiki.org/basic/complexity/',
    installSteps: [
      'JavaScript 与 Python 由应用提供，无需配置本机环境。',
      '先手算 n=10 的两两比较次数，再运行代码核对。',
      '改变规模时只改变 n，不同时修改计数规则。',
    ],
    languages: ['javascript', 'python'],
    practice: {
      id: 'algorithm-first-big-o-guided',
      title: '跟做：数清两两比较',
      brief:
        'pairChecks 用双重循环统计无序元素对的比较次数。预测每增加十倍规模，计数会变成多少倍，再运行确认。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `function pairChecks(n) {
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      count += 1;
    }
  }
  return count;
}

for (const n of [10, 100, 1000]) {
  console.log(\`n=\${n}, checks=\${pairChecks(n)}\`);
}
`,
        python: `def pair_checks(n: int) -> int:
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            count += 1
    return count


for n in (10, 100, 1000):
    print(f"n={n}, checks={pair_checks(n)}")
`,
      },
      checkpoint:
        'n=10 时输出 45，n=100 时输出 4950；这两项与 n(n-1)/2 手算一致，才进入实践。',
    },
    apply: {
      id: 'algorithm-first-big-o-independent',
      title: '独立实践：比较两种计数口径',
      brief:
        '实现 comparisons 统计一次单循环求最大值，并在同一组规模上对 pairChecks 做对照。输出两列数字，用数据说明平方增长与线性增长。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: `function comparisons(n) {
  const values = Array.from({ length: n }, (_, index) => n - index);
  let best = values[0];
  let count = 0;

  for (let i = 1; i < values.length; i += 1) {
    count += 1;
    if (values[i] > best) best = values[i];
  }
  return count;
}

function pairChecks(n) {
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) count += 1;
  }
  return count;
}

for (const n of [10, 100, 1000]) {
  console.log(\`n=\${n}, linear=\${comparisons(n)}, quadratic=\${pairChecks(n)}\`);
}
`,
        python: `def comparisons(n: int) -> int:
    values = list(range(n, 0, -1))
    best = values[0]
    count = 0
    for value in values[1:]:
        count += 1
        if value > best:
            best = value
    return count


def pair_checks(n: int) -> int:
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            count += 1
    return count


for n in (10, 100, 1000):
    print(f"n={n}, linear={comparisons(n)}, quadratic={pair_checks(n)}")
`,
      },
      checkpoint:
        '线性计数应始终等于 n-1；平方计数应等于 n(n-1)/2。两组数字同时成立，才能说明你测到的是操作次数，而不是机器偶然快慢。',
    },
  },
};
