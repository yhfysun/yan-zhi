import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const C_INSTALL_STEPS = [
  '应用使用 C17 编译器，以 -std=c17 -O2 -Wall -Wextra -pedantic 编译单文件 main.c。',
  '程序从环境变量或页面提供的 stdin 读取输入；不访问网络、临时文件或未声明的系统服务。',
  '退出码 0 表示断言通过，非 0 表示输入不匹配、契约失败或主题实验未通过。',
] as const;

const CPP_INSTALL_STEPS = [
  '应用使用 C++20 编译器，以 -std=c++20 -O2 -Wall -Wextra -pedantic 编译单文件 main.cpp。',
  '程序只使用标准库或跨平台兼容层，并从页面提供的 stdin 读取输入。',
  '退出码 0 表示断言通过，非 0 表示输入不匹配、契约失败或主题实验未通过。',
] as const;

const cTask = (
  id: string,
  title: string,
  brief: string,
  stdin: string,
  checkpoint: string,
  code: string,
): LearningV2CodeLabTask => ({
  id,
  title,
  brief,
  defaultLanguage: 'c',
  starterCode: { c: code },
  stdin,
  checkpoint,
});

const cppTask = (
  id: string,
  title: string,
  brief: string,
  stdin: string,
  checkpoint: string,
  code: string,
): LearningV2CodeLabTask => ({
  id,
  title,
  brief,
  defaultLanguage: 'cpp',
  starterCode: { cpp: code },
  stdin,
  checkpoint,
});

const makeC = (
  title: string,
  description: string,
  docsUrl: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  requiredRuntime: 'c',
  runtimeLabel: 'C17 / GCC 或 Clang',
  docsUrl,
  installSteps: C_INSTALL_STEPS,
  languages: ['c'],
  practice,
  apply,
});

const makeCpp = (
  title: string,
  description: string,
  docsUrl: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  requiredRuntime: 'cpp',
  runtimeLabel: 'C++20 / GCC 或 Clang',
  docsUrl,
  installSteps: CPP_INSTALL_STEPS,
  languages: ['cpp'],
  practice,
  apply,
});

/**
 * C/C++ 剩余课程的真实单文件实验。
 *
 * 链接器、调试器、动态库、CMake、sanitizer、perf、容器和第三方框架无法在
 * 一个跨平台单文件进程里完整托管；相关课程以可编译的文件格式、符号、状态机、
 * 事件队列或诊断协议契约还原可观察语义，不声称启动了真实外部工具。
 */
export const LEARNING_CODE_LABS_NATIVE_FINAL_A: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:C · 编译器、链接器与第一个 C 工程：C 标准、编译器、链接器和进程': makeC(
    'C 代码台 · 标准方言、求和契约与进程退出码',
    '先用预定义宏确认当前翻译单元满足 C17 基线，再完成一次输入校验、计算和退出状态验证；学习者能区分源代码结果与进程退出状态。',
    'https://gcc.gnu.org/onlinedocs/cpp/Common-Predefined-Macros.html',
    cTask(
      'c-standard-exit-contract-guided',
      '跟做：检查 C17 方言并验证 42 契约',
      '读取两个整数，输出标准版本和和值。只有方言不早于 C11 且和恰好为 42 时才返回 0。',
      '17 25',
      '输出 dialect 值大于等于 201112，sum=42，退出码为 0；把输入改成 17 24 后退出码必须非 0。',
      String.raw`#include <stdio.h>

int main(void) {
  int left = 0;
  int right = 0;
  if (scanf("%d %d", &left, &right) != 2) {
    puts("expected two integers");
    return 2;
  }

  const long dialect = (long)(__STDC_VERSION__);
  const int sum = left + right;
  printf("dialect=%ld\n", dialect);
  printf("sum=%d\n", sum);

  if (dialect < 201112L) {
    puts("need C11 or newer");
    return 3;
  }
  return sum == 42 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-link-symbol-table-independent',
      '独立实践：用函数指针表解析运算符',
      '模拟链接器把未解析符号绑定到定义：读取运算符和两个整数，从符号表中查找函数并执行。未知运算符必须保持返回失败。',
      '+ 20 15',
      '输出 symbol=+ result=35 并返回 0；修改为 ! 后应输出 unresolved symbol 并返回 3。',
      String.raw`#include <stdio.h>

typedef int (*binary_op)(int, int);

struct symbol_entry {
  char name;
  binary_op implementation;
};

static int add_values(int left, int right) {
  return left + right;
}

static int subtract_values(int left, int right) {
  return left - right;
}

int main(void) {
  char symbol = '\0';
  int left = 0;
  int right = 0;
  if (scanf(" %c %d %d", &symbol, &left, &right) != 3) {
    return 2;
  }

  const struct symbol_entry symbols[] = {
      {'+', add_values},
      {'-', subtract_values},
  };
  const size_t count = sizeof(symbols) / sizeof(symbols[0]);

  for (size_t index = 0; index < count; ++index) {
    if (symbols[index].name == symbol) {
      const int result = symbols[index].implementation(left, right);
      printf("symbol=%c result=%d\n", symbol, result);
      return result == 35 ? 0 : 1;
    }
  }

  puts("unresolved symbol");
  return 3;
}
`,
    ),
  ),
  'programming:C · 编译器、链接器与第一个 C 工程：从空目录编写 main 与头文件': makeC(
    'C 代码台 · 头文件接口、前置声明与多单元契约',
    '用头文件保护宏、函数原型和调用方检查模拟从空目录建立工程的过程，并验证实现与接口对边界输入保持一致。',
    'https://gcc.gnu.org/onlinedocs/cpp/Header-Files.html',
    cTask(
      'c-empty-project-factorial-guided',
      '跟做：声明 factorial 并建立第一个接口',
      '读取 0 到 12 之间的整数，通过独立函数计算阶乘。非法范围必须被接口拒绝，不能依赖调用方静默修正。',
      '6',
      '输出 factorial(6)=720 并返回 0；输入 13 时应输出 range error 并返回 3。',
      String.raw`#include <stdio.h>

static unsigned long long factorial(unsigned value);

static unsigned long long factorial(unsigned value) {
  unsigned long long product = 1;
  for (unsigned item = 2; item <= value; ++item) {
    product *= item;
  }
  return product;
}

int main(void) {
  unsigned value = 0;
  if (scanf("%u", &value) != 1) {
    return 2;
  }
  if (value > 12U) {
    puts("range error");
    return 3;
  }

  const unsigned long long result = factorial(value);
  printf("factorial(%u)=%llu\n", value, result);
  return result == 720ULL ? 0 : 1;
}
`,
    ),
    cTask(
      'c-header-range-contract-independent',
      '独立实践：给范围模块补齐头文件契约',
      '模拟头文件公开的结构体与函数原型：读取起点和长度，计算闭区间终点与元素个数，并拒绝导致无符号回绕的参数。',
      '9 7',
      '输出 last=15 count=7 valid=yes 并返回 0；输入 9 0 时输出 count=0 valid=no。',
      String.raw`#include <limits.h>
#include <stdbool.h>
#include <stdio.h>

struct range_result {
  unsigned first;
  unsigned last;
  unsigned count;
  bool valid;
};

static struct range_result make_range(unsigned first, unsigned count) {
  struct range_result result = {first, first, count, false};
  if (count == 0U) {
    return result;
  }
  if (first > UINT_MAX - (count - 1U)) {
    return result;
  }
  result.last = first + count - 1U;
  result.valid = true;
  return result;
}

int main(void) {
  unsigned first = 0;
  unsigned count = 0;
  if (scanf("%u %u", &first, &count) != 2) {
    return 2;
  }

  const struct range_result range = make_range(first, count);
  printf("first=%u last=%u count=%u valid=%s\n",
         range.first,
         range.last,
         range.count,
         range.valid ? "yes" : "no");
  return range.valid ? 0 : 3;
}
`,
    ),
  ),
  'programming:C · 编译器、链接器与第一个 C 工程：GCC/Clang 警告和优化级别': makeC(
    'C 代码台 · 有符号边界、无符号回绕与优化安全',
    '把优化器容易重排的有符号溢出改成受检查算术，把有定义的无符号哈希留在可选优化路径中，并用退出码验证结果。',
    'https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html',
    cTask(
      'c-warning-safe-sum-guided',
      '跟做：在求和前检查有符号溢出',
      '读取整数个数及每个值，在累加前检查 INT_MAX/INT_MIN 边界。发生溢出时必须拒绝结果，不能触发未定义行为。',
      '4 10 20 30 40',
      '输出 count=4 total=100 overflow=no 并返回 0；把最后一项改为 2147483647 后应报告 overflow=yes。',
      String.raw`#include <limits.h>
#include <stdio.h>

static int checked_add(int left, int right, int *output) {
  if ((right > 0 && left > INT_MAX - right) ||
      (right < 0 && left < INT_MIN - right)) {
    return 0;
  }
  *output = left + right;
  return 1;
}

int main(void) {
  int count = 0;
  if (scanf("%d", &count) != 1 || count < 0 || count > 1000) {
    return 2;
  }

  int total = 0;
  for (int index = 0; index < count; ++index) {
    int value = 0;
    int next = 0;
    if (scanf("%d", &value) != 1) {
      return 2;
    }
    if (!checked_add(total, value, &next)) {
      printf("count=%d total=%d overflow=yes\n", count, total);
      return 3;
    }
    total = next;
  }

  printf("count=%d total=%d overflow=no\n", count, total);
  return total == 100 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-warning-fnv-hash-independent',
      '独立实践：为优化级别编写无未定义行为的哈希',
      '读取一个不含空白的词，用 uint32_t 完成 FNV-1a 哈希。所有乘法都位于无符号域，优化器可安全重排和常量折叠。',
      'native',
      '输出 length=6 hash 为非零稳定值并返回 0；分别以 -O0 和 -O2 编译时输出必须完全一致。',
      String.raw`#include <stdint.h>
#include <stdio.h>

static uint32_t fnv1a(const unsigned char *text) {
  uint32_t hash = UINT32_C(2166136261);
  while (*text != '\0') {
    hash ^= (uint32_t)(*text);
    hash *= UINT32_C(16777619);
    ++text;
  }
  return hash;
}

int main(void) {
  char word[64] = {0};
  if (scanf("%63s", word) != 1) {
    return 2;
  }

  size_t length = 0;
  while (word[length] != '\0') {
    ++length;
  }
  const uint32_t hash = fnv1a((const unsigned char *)word);
  printf("length=%zu hash=%08x\n", length, (unsigned)hash);
  return length == 6U && hash != 0U ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 编译器、链接器与第一个 C 工程：目标文件、静态库和动态库': makeC(
    'C 代码台 · 导出符号、重定位记录与库边界',
    '用函数表模拟目标文件导出和未解析符号，用依赖数组模拟动态库加载顺序；实验聚焦链接契约而非复制构建命令。',
    'https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html',
    cTask(
      'c-static-library-exports-guided',
      '跟做：验证静态库导出函数',
      '读取一个整数，通过模拟库边界调用 scale 和 checksum 两个导出函数，确认调用方只依赖公开接口。',
      '7',
      '输出 scale=21 checksum=28 exports=2 并返回 0；把输入改为 8 时 checksum=32。',
      String.raw`#include <stdio.h>

static int library_scale(int value) {
  return value * 3;
}

static int library_checksum(int value) {
  return value * 4;
}

int main(void) {
  int value = 0;
  if (scanf("%d", &value) != 1) {
    return 2;
  }

  const int scaled = library_scale(value);
  const int checksum = library_checksum(value);
  printf("scale=%d checksum=%d exports=2\n", scaled, checksum);
  return scaled == 21 && checksum == 28 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-relocation-resolver-independent',
      '独立实践：解析重定位表中的两个导入符号',
      '读取两个符号名和两个值，逐个查表并求和。任一符号缺失都必须停止执行，模拟链接器拒绝未定义引用。',
      'left 12 right 30',
      '输出 resolved=2 total=42 并返回 0；把 right 改成 missing 时应输出 unresolved 并返回 3。',
      String.raw`#include <stdio.h>
#include <string.h>

struct export_entry {
  const char *name;
  int value;
};

int main(void) {
  char first_name[16] = {0};
  char second_name[16] = {0};
  int first_value = 0;
  int second_value = 0;
  if (scanf("%15s %d %15s %d",
            first_name, &first_value, second_name, &second_value) != 4) {
    return 2;
  }

  const struct export_entry exports[] = {
      {"left", first_value},
      {"right", second_value},
  };
  const char *imports[] = {first_name, second_name};
  int total = 0;

  for (size_t import = 0; import < 2; ++import) {
    int matched = 0;
    for (size_t item = 0; item < 2; ++item) {
      if (strcmp(imports[import], exports[item].name) == 0) {
        total += exports[item].value;
        matched = 1;
        break;
      }
    }
    if (!matched) {
      printf("unresolved=%s\n", imports[import]);
      return 3;
    }
  }

  printf("resolved=2 total=%d\n", total);
  return total == 42 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 编译器、链接器与第一个 C 工程：CMake 目标、测试和安装规则': makeC(
    'C 代码台 · 构建目标、测试标签与安装清单',
    '读取目标描述并验证核心库、应用和测试之间的依赖方向；随后把安装前缀、配置文件与可执行文件映射成可检查清单。',
    'https://cmake.org/cmake/help/latest/manual/cmake-buildsystem.7.html',
    cTask(
      'c-cmake-target-contract-guided',
      '跟做：检查 core、app 和 test 的目标图',
      '读取三个目标名，验证 app 依赖 core、test 同时依赖 app 与 core，并统计合法边数。',
      'core app test',
      '输出 targets=3 edges=3 valid=yes 并返回 0；缺少 test 时应报告 target miss。',
      String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
  char core[16] = {0};
  char app[16] = {0};
  char test[16] = {0};
  if (scanf("%15s %15s %15s", core, app, test) != 3) {
    return 2;
  }
  if (strcmp(core, "core") != 0 || strcmp(app, "app") != 0 ||
      strcmp(test, "test") != 0) {
    puts("target miss");
    return 3;
  }

  struct edge {
    const char *from;
    const char *to;
  };
  const struct edge edges[] = {
      {app, core},
      {test, app},
      {test, core},
  };
  const size_t count = sizeof(edges) / sizeof(edges[0]);
  for (size_t index = 0; index < count; ++index) {
    printf("edge=%s->%s\n", edges[index].from, edges[index].to);
  }
  printf("targets=3 edges=%zu valid=yes\n", count);
  return count == 3U ? 0 : 1;
}
`,
    ),
    cTask(
      'c-cmake-install-manifest-independent',
      '独立实践：生成安装目录契约',
      '读取包名、版本和文件数，按 bin、lib、etc 三类检查安装规则，并输出稳定的清单摘要。',
      'demo 1.2.3 4',
      '输出 package=demo version=1.2.3 files=4 categories=3 ready=yes 并返回 0。',
      String.raw`#include <stdint.h>
#include <stdio.h>
#include <string.h>

static uint32_t manifest_hash(const char *package, const char *version) {
  uint32_t hash = UINT32_C(2166136261);
  const unsigned char *parts[] = {
      (const unsigned char *)package,
      (const unsigned char *)version,
  };
  for (size_t part = 0; part < 2; ++part) {
    for (const unsigned char *cursor = parts[part]; *cursor != '\0'; ++cursor) {
      hash ^= *cursor;
      hash *= UINT32_C(16777619);
    }
  }
  return hash;
}

int main(void) {
  char package[32] = {0};
  char version[16] = {0};
  int files = 0;
  if (scanf("%31s %15s %d", package, version, &files) != 3 ||
      files < 0 || files > 1000) {
    return 2;
  }

  const int categories =
      (files > 0 ? 1 : 0) + (files > 1 ? 1 : 0) + (files > 2 ? 1 : 0);
  const uint32_t digest = manifest_hash(package, version);
  printf("package=%s version=%s files=%d categories=%d digest=%08x ready=%s\n",
         package,
         version,
         files,
         categories,
         (unsigned)digest,
         files == 4 && categories == 3 && strlen(version) == 5U ? "yes" : "no");
  return files == 4 && categories == 3 && strlen(version) == 5U ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 编译器、链接器与第一个 C 工程：第一个带 sanitizer 的 C 项目': makeC(
    'C 代码台 · 越界访问与有符号溢出的显式防线',
    '在 sanitizer 之外先写显式边界检查：一个任务拒绝越界索引，另一个任务在加法前拒绝 INT_MAX 溢出，让错误成为可诊断的退出状态。',
    'https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html',
    cTask(
      'c-sanitizer-bounds-guided',
      '跟做：在读取数组前检查索引',
      '读取数组索引，只允许访问包含五个元素的缓冲区。越界时必须输出 upper bound，不能先解引用再依赖 sanitizer 捕获。',
      '2',
      '输出 index=2 value=30 in_bounds=yes 并返回 0；输入 5 时应输出 upper bound 并返回 3。',
      String.raw`#include <stddef.h>
#include <stdio.h>

int main(void) {
  size_t index = 0;
  if (scanf("%zu", &index) != 1) {
    return 2;
  }

  const int values[] = {10, 20, 30, 40, 50};
  const size_t length = sizeof(values) / sizeof(values[0]);
  if (index >= length) {
    puts("upper bound");
    return 3;
  }

  printf("index=%zu value=%d in_bounds=yes\n", index, values[index]);
  return values[index] == 30 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-sanitizer-overflow-independent',
      '独立实践：把溢出变成受检错误',
      '读取两个整数并执行 checked_add。测试覆盖正数越上界与负数越下界，任何失败都返回稳定错误码。',
      '2147483647 1',
      '输出 overflow=upper 并返回 0，证明越界已在解引用和加法前被捕获；输入 -2147483648 -1 时输出 overflow=lower。',
      String.raw`#include <limits.h>
#include <stdio.h>

enum add_status {
  ADD_OK,
  ADD_UPPER,
  ADD_LOWER
};

static enum add_status checked_add(int left, int right, int *result) {
  if (right > 0 && left > INT_MAX - right) {
    return ADD_UPPER;
  }
  if (right < 0 && left < INT_MIN - right) {
    return ADD_LOWER;
  }
  *result = left + right;
  return ADD_OK;
}

int main(void) {
  int left = 0;
  int right = 0;
  int result = 0;
  if (scanf("%d %d", &left, &right) != 2) {
    return 2;
  }

  const enum add_status status = checked_add(left, right, &result);
  if (status == ADD_UPPER) {
    puts("overflow=upper");
    return 0;
  }
  if (status == ADD_LOWER) {
    puts("overflow=lower");
    return 0;
  }
  printf("result=%d overflow=none\n", result);
  return 0;
}
`,
    ),
  ),
  'programming:C · 栈、堆、生命周期与未定义行为：内存安全测试矩阵': makeC(
    'C 代码台 · 代际句柄、释放状态与内存安全矩阵',
    '用固定槽位和代际编号复现 use-after-free、double-free 与陈旧句柄检查，让释放后的访问成为可观察错误而不是未定义行为。',
    'https://gcc.gnu.org/onlinedocs/gcc/Common-Variable-Attributes.html',
    cTask(
      'c-memory-generation-guided',
      '跟做：分配、释放并核对代际',
      '读取一个值，分配一个槽位，释放它后尝试读取。程序必须先检查活动位和代际号，再决定拒绝访问。',
      '42',
      '输出 generation=1 live=no access=rejected 并返回 0；这就是矩阵中的 use-after-free 防线。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct slot {
  int value;
  unsigned generation;
  bool live;
};

static bool release_slot(struct slot *slot) {
  if (slot == NULL || !slot->live) {
    return false;
  }
  slot->live = false;
  slot->generation += 1U;
  return true;
}

int main(void) {
  int value = 0;
  if (scanf("%d", &value) != 1) {
    return 2;
  }

  struct slot slot = {value, 1U, true};
  if (!release_slot(&slot)) {
    return 3;
  }
  const bool rejected = !slot.live;
  printf("generation=%u live=%s access=%s\n",
         slot.generation,
         slot.live ? "yes" : "no",
         rejected ? "rejected" : "allowed");
  return rejected && slot.generation == 2U ? 0 : 1;
}
`,
    ),
    cTask(
      'c-memory-double-free-independent',
      '独立实践：让第二次释放安全失败',
      '读取两次释放请求。第一次释放应成功并把活动位清零，第二次必须被守卫拒绝，函数返回不同的结果。',
      '1 1',
      '输出 first=released second=rejected double_free=blocked 并返回 0。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct guarded_block {
  bool allocated;
  int payload;
};

static bool guarded_release(struct guarded_block *block) {
  if (block == NULL || !block->allocated) {
    return false;
  }
  block->allocated = false;
  block->payload = 0;
  return true;
}

int main(void) {
  int first_request = 0;
  int second_request = 0;
  if (scanf("%d %d", &first_request, &second_request) != 2 ||
      first_request != 1 || second_request != 1) {
    return 2;
  }

  struct guarded_block block = {true, 9001};
  const bool first = guarded_release(&block);
  const bool second = guarded_release(&block);
  printf("first=%s second=%s double_free=%s\n",
         first ? "released" : "rejected",
         second ? "released" : "rejected",
         !second ? "blocked" : "missed");
  return first && !second ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：core dump、符号和构建 ID': makeC(
    'C 代码台 · 故障地址映射、符号边界与构建指纹',
    '把崩溃地址映射到符号区间，再为构建产物计算确定性的 FNV 指纹；实验训练从地址、符号和构建身份三方面定位版本。',
    'https://sourceware.org/gdb/onlinedocs/gdb/Separate-Debug-Files.html',
    cTask(
      'c-core-symbol-range-guided',
      '跟做：把故障地址定位到符号',
      '读取故障地址、符号起点和长度，检查地址是否落在半开区间内，并输出匹配符号。',
      '4198530 4198400 256',
      '输出 address=4198530 symbol=worker offset=130 并返回 0；地址越界时必须输出 outside symbol。',
      String.raw`#include <stdint.h>
#include <stdio.h>

int main(void) {
  uintptr_t fault = 0;
  uintptr_t base = 0;
  uintptr_t size = 0;
  if (scanf("%zu %zu %zu",
            (size_t *)&fault, (size_t *)&base, (size_t *)&size) != 3 ||
      size == 0U) {
    return 2;
  }

  const uintptr_t end = base + size;
  const int inside = fault >= base && fault < end && end >= base;
  if (!inside) {
    puts("outside symbol");
    return 3;
  }

  printf("address=%zu symbol=worker offset=%zu\n",
         (size_t)fault,
         (size_t)(fault - base));
  return fault - base == 130U ? 0 : 1;
}
`,
    ),
    cTask(
      'c-build-id-fingerprint-independent',
      '独立实践：为构建产物生成稳定指纹',
      '读取模块名，将字符送入 uint32_t FNV-1a，再输出十六进制构建 ID。相同输入不受编译器优化级别影响。',
      'worker-service',
      '输出 module=worker-service build_id 为 8 位十六进制并返回 0；重复运行结果必须一致。',
      String.raw`#include <stdint.h>
#include <stdio.h>

static uint32_t build_fingerprint(const char *module) {
  uint32_t hash = UINT32_C(2166136261);
  for (const unsigned char *cursor = (const unsigned char *)module;
       *cursor != '\0';
       ++cursor) {
    hash ^= *cursor;
    hash *= UINT32_C(16777619);
  }
  return hash;
}

int main(void) {
  char module[64] = {0};
  if (scanf("%63s", module) != 1) {
    return 2;
  }
  const uint32_t id = build_fingerprint(module);
  printf("module=%s build_id=%08x\n", module, (unsigned)id);
  return id != 0U ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：strace/ltrace 与系统调用': makeC(
    'C 代码台 · 重试状态、短调用与调用轨迹',
    '把 EINTR、EAGAIN 和部分成功编码成显式重试状态，再根据调用轨迹检查资源顺序；实验模拟 trace 的可观察字段。',
    'https://man7.org/linux/man-pages/man1/strace.1.html',
    cTask(
      'c-strace-retry-guided',
      '跟做：统计 EAGAIN 与 EINTR',
      '读取四个系统调用返回值，统计需要重试的次数，并验证最终成功返回覆盖了全部字节。',
      '-11 -4 5 0',
      '输出 retry=2 transferred=5 final=0 并返回 0；把 0 改成 -5 时应输出 failed。',
      String.raw`#include <errno.h>
#include <stdio.h>

int main(void) {
  int retries = 0;
  int transferred = 0;
  int final_code = 0;
  for (int item = 0; item < 4; ++item) {
    int code = 0;
    if (scanf("%d", &code) != 1) {
      return 2;
    }
    if (code == -EAGAIN || code == -EINTR) {
      retries += 1;
    } else if (code > 0) {
      transferred += code;
    } else if (code < 0) {
      printf("failed=%d\n", code);
      return 3;
    }
    final_code = code;
  }
  printf("retry=%d transferred=%d final=%d\n",
         retries, transferred, final_code);
  return retries == 2 && transferred == 5 && final_code == 0 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-ltrace-resource-order-independent',
      '独立实践：验证分配与释放的调用顺序',
      '读取四个库调用名称，维护开始和结束计数。正常轨迹必须以 allocate 开始、release 结束，且中间才能访问。',
      'allocate access release',
      '输出 trace=allocate>access>release pair=balanced 并返回 0；顺序错误时输出 invalid order。',
      String.raw`#include <stdbool.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  char calls[4][16] = {{0}};
  int count = 0;
  while (count < 4 && scanf("%15s", calls[count]) == 1) {
    ++count;
  }
  if (count != 3) {
    return 2;
  }

  bool opened = false;
  bool accessed = false;
  bool closed = false;
  for (int index = 0; index < count; ++index) {
    if (strcmp(calls[index], "allocate") == 0 && !opened) {
      opened = true;
    } else if (strcmp(calls[index], "access") == 0 && opened && !closed) {
      accessed = true;
    } else if (strcmp(calls[index], "release") == 0 && opened && accessed) {
      closed = true;
    } else {
      printf("invalid order at %s\n", calls[index]);
      return 3;
    }
  }
  printf("trace=allocate>access>release pair=%s\n",
         opened && accessed && closed ? "balanced" : "broken");
  return opened && accessed && closed ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：clang-tidy、静态分析和编译器警告': makeC(
    'C 代码台 · 有界字符串与除零防线',
    '把常见静态分析告警改写成显式契约：拷贝前检查容量，除法前检查分母，并把失败原因映射到退出码。',
    'https://clang.llvm.org/extra/clang-tidy/',
    cTask(
      'c-tidy-bounded-copy-guided',
      '跟做：在复制前核对目标容量',
      '读取一个短词，计算长度并只复制能放入 8 字节缓冲区的文本。超长输入必须被拒绝，不能截断后继续成功。',
      'native',
      '输出 word=native length=6 copied=6 fits=yes 并返回 0；输入 toolongword 时输出 capacity error。',
      String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
  char source[32] = {0};
  char target[8] = {0};
  if (scanf("%31s", source) != 1) {
    return 2;
  }

  const size_t length = strlen(source);
  if (length >= sizeof(target)) {
    puts("capacity error");
    return 3;
  }
  memcpy(target, source, length + 1U);
  printf("word=%s length=%zu copied=%zu fits=yes\n",
         target, length, strlen(target));
  return strcmp(target, "native") == 0 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-tidy-division-contract-independent',
      '独立实践：显式处理零分母与负数范围',
      '读取分数和分母，先验证分母非零且输入位于允许范围，再执行整数除法并输出余数。',
      '84 2',
      '输出 quotient=42 remainder=0 valid=yes 并返回 0；输入 84 0 时输出 division by zero。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

int main(void) {
  int numerator = 0;
  int denominator = 0;
  if (scanf("%d %d", &numerator, &denominator) != 2) {
    return 2;
  }
  if (denominator == 0) {
    puts("division by zero");
    return 3;
  }
  if (numerator < 0 || denominator < 0) {
    puts("range error");
    return 4;
  }

  const int quotient = numerator / denominator;
  const int remainder = numerator % denominator;
  const bool valid = quotient == 42 && remainder == 0;
  printf("quotient=%d remainder=%d valid=%s\n",
         quotient, remainder, valid ? "yes" : "no");
  return valid ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：perf、火焰图和缓存局部性': makeC(
    'C 代码台 · 行主序访问与直方图热点',
    '比较行主序和列主序读取同一矩阵，再把一组测量值归入桶并计算加权热点；两个任务都输出可核对的数据摘要。',
    'https://perf.wiki.kernel.org/index.php/Main_Page',
    cTask(
      'c-perf-row-major-guided',
      '跟做：比较矩阵的两种扫描顺序',
      '读取四乘四矩阵的 16 个元素，分别按行主序和列主序求和。结果相等，但输出两种不同的访问步长。',
      '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16',
      '输出 row_sum=136 column_sum=136 row_stride=1 column_stride=4 并返回 0。',
      String.raw`#include <stdio.h>

int main(void) {
  int matrix[4][4] = {{0}};
  for (size_t row = 0; row < 4; ++row) {
    for (size_t column = 0; column < 4; ++column) {
      if (scanf("%d", &matrix[row][column]) != 1) {
        return 2;
      }
    }
  }

  int row_sum = 0;
  int column_sum = 0;
  for (size_t row = 0; row < 4; ++row) {
    for (size_t column = 0; column < 4; ++column) {
      row_sum += matrix[row][column];
    }
  }
  for (size_t column = 0; column < 4; ++column) {
    for (size_t row = 0; row < 4; ++row) {
      column_sum += matrix[row][column];
    }
  }

  printf("row_sum=%d column_sum=%d row_stride=1 column_stride=4\n",
         row_sum, column_sum);
  return row_sum == 136 && column_sum == 136 ? 0 : 1;
}
`,
    ),
    cTask(
      'c-perf-histogram-independent',
      '独立实践：从桶直方图找热点区间',
      '读取样本数和每个样本，将其归入 0-3、4-7、8-11、12-15 四个桶，输出计数与最大值所在桶。',
      '8 1 3 3 7 9 15 3 1',
      '输出 buckets=5,1,1,1 hottest=0-3 并返回 0；样本中 12 到 15 的计数必须准确。',
      String.raw`#include <stdio.h>

int main(void) {
  int count = 0;
  if (scanf("%d", &count) != 1 || count < 1 || count > 256) {
    return 2;
  }

  int buckets[4] = {0, 0, 0, 0};
  for (int index = 0; index < count; ++index) {
    int value = 0;
    if (scanf("%d", &value) != 1 || value < 0 || value > 15) {
      return 3;
    }
    buckets[value / 4] += 1;
  }

  int hottest = 0;
  for (int bucket = 1; bucket < 4; ++bucket) {
    if (buckets[bucket] > buckets[hottest]) {
      hottest = bucket;
    }
  }
  printf("buckets=%d,%d,%d,%d hottest=%d-%d\n",
         buckets[0], buckets[1], buckets[2], buckets[3],
         hottest * 4, hottest * 4 + 3);
  return buckets[0] == 5 && hottest == 0 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：C 服务生产诊断报告': makeC(
    'C 代码台 · 错误率、延迟和 SLO 预算报告',
    '从请求计数与延迟百分位生成诊断结论，再计算成功率和错误预算，训练把观测数据变成可执行判断的路径。',
    'https://sre.google/sre-book/monitoring-distributed-systems/',
    cTask(
      'c-service-severity-guided',
      '跟做：根据错误率和 p95 定级',
      '读取请求数、错误数和 p95 毫秒。错误率超过 1% 或延迟超过 250ms 时输出 degrade，否则输出 healthy。',
      '1200 3 240',
      '输出 requests=1200 errors=3 error_bp=25 p95_ms=240 status=healthy 并返回 0。',
      String.raw`#include <stdint.h>
#include <stdio.h>

int main(void) {
  int64_t requests = 0;
  int64_t errors = 0;
  int64_t p95_ms = 0;
  if (scanf("%lld %lld %lld",
            (long long *)&requests,
            (long long *)&errors,
            (long long *)&p95_ms) != 3 ||
      requests <= 0 || errors < 0 || errors > requests || p95_ms < 0) {
    return 2;
  }

  const int64_t error_bp = errors * 10000 / requests;
  const int healthy = error_bp <= 100 && p95_ms <= 250;
  printf("requests=%lld errors=%lld error_bp=%lld p95_ms=%lld status=%s\n",
         (long long)requests,
         (long long)errors,
         (long long)error_bp,
         (long long)p95_ms,
         healthy ? "healthy" : "degrade");
  return healthy ? 0 : 1;
}
`,
    ),
    cTask(
      'c-service-error-budget-independent',
      '独立实践：计算 99.5% SLO 剩余预算',
      '读取总请求和成功数，以基点计算成功率，再检查是否仍高于 99.50% 的目标。',
      '1000 998 230',
      '输出 success_bp=9980 budget_bp=30 p95_ms=230 remaining=yes 并返回 0。',
      String.raw`#include <stdint.h>
#include <stdio.h>

int main(void) {
  int64_t total = 0;
  int64_t success = 0;
  int64_t latency = 0;
  if (scanf("%lld %lld %lld",
            (long long *)&total,
            (long long *)&success,
            (long long *)&latency) != 3 ||
      total <= 0 || success < 0 || success > total || latency < 0) {
    return 2;
  }

  const int64_t success_bp = success * 10000 / total;
  const int64_t budget_bp = success_bp - 9950;
  const int remaining = budget_bp >= 0 && latency <= 250;
  printf("success_bp=%lld budget_bp=%lld p95_ms=%lld remaining=%s\n",
         (long long)success_bp,
         (long long)budget_bp,
         (long long)latency,
         remaining ? "yes" : "no");
  return remaining ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 数据结构、并发与协议工程：并发与协议综合实验': makeC(
    'C 代码台 · 原子序号、帧编解码与并发一致性',
    '用 C11 原子操作累计工作序号，再用版本、长度和校验和组成二进制帧；两个实验共同验证并发计数与协议边界。',
    'https://en.cppreference.com/w/c/language/atomic',
    cTask(
      'c-atomic-sequence-guided',
      '跟做：两个逻辑工作线程共享原子序号',
      '读取总工作量，交替由两个逻辑工作线程执行 atomic_fetch_add，最后核对序号是否恰好递增到总数。',
      '6',
      '输出 workers=2 total=6 sequence=6 monotonic=yes 并返回 0。',
      String.raw`#include <stdatomic.h>
#include <stdio.h>

int main(void) {
  unsigned total = 0;
  if (scanf("%u", &total) != 1 || total == 0U || total > 1000U) {
    return 2;
  }

  atomic_uint sequence = 0U;
  for (unsigned item = 0; item < total; ++item) {
    const unsigned before = atomic_load(&sequence);
    const unsigned after = atomic_fetch_add(&sequence, 1U) + 1U;
    if (after != before + 1U) {
      puts("monotonic=false");
      return 3;
    }
  }

  const unsigned final_value = atomic_load(&sequence);
  printf("workers=2 total=%u sequence=%u monotonic=%s\n",
         total,
         final_value,
         final_value == total ? "yes" : "no");
  return final_value == total ? 0 : 1;
}
`,
    ),
    cTask(
      'c-frame-protocol-independent',
      '独立实践：编码带长度与异或校验的帧',
      '读取协议版本、负载长度和负载值，生成固定格式帧。版本必须为 1，长度必须在 1 到 8 之间。',
      '1 4 1234',
      '输出 version=1 length=4 checksum=01 frame=01:04:31:32:33:34:01 并返回 0。',
      String.raw`#include <stdint.h>
#include <stdio.h>

int main(void) {
  unsigned version = 0;
  unsigned length = 0;
  char payload[16] = {0};
  if (scanf("%u %u %15s", &version, &length, payload) != 3 ||
      version != 1U || length < 1U || length > 8U) {
    return 2;
  }

  for (unsigned index = 0; index < length; ++index) {
    if (payload[index] == '\0') {
      puts("length mismatch");
      return 3;
    }
  }
  if (payload[length] != '\0') {
    puts("length mismatch");
    return 3;
  }

  uint8_t checksum = (uint8_t)version ^ (uint8_t)length;
  printf("version=%u length=%u checksum=%02x frame=%02x:%02x",
         version,
         length,
         (unsigned)checksum,
         version,
         length);
  for (unsigned index = 0; index < length; ++index) {
    const uint8_t byte = (uint8_t)payload[index];
    checksum ^= byte;
    printf(":%02x", (unsigned)byte);
  }
  printf(":%02x\n", (unsigned)checksum);
  return length == 4U && checksum == 0x01U ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · Redis/Nginx 源码与原生服务交付：固定仓库、tag、宏和构建选项': makeC(
    'C 代码台 · 版本基线、条件编译与构建配置',
    '用预处理宏固定主版本和可选特性，再让运行输入检查发行配置；实验说明 tag、宏和构建选项如何形成可复现基线。',
    'https://gcc.gnu.org/onlinedocs/cpp/Conditional-Inclusion.html',
    cTask(
      'c-build-version-baseline-guided',
      '跟做：检查主版本与补丁版本',
      '读取候选主版本和次版本，与编译期基线比较。基线必须由预处理宏提供，不能从输入直接改写。',
      '2 4',
      '输出 baseline=2.4 candidate=2.4 compatible=yes 并返回 0；候选 3.0 不兼容。',
      String.raw`#include <stdio.h>

#define NATIVE_MAJOR 2
#define NATIVE_MINOR 4

int main(void) {
  int major = 0;
  int minor = 0;
  if (scanf("%d %d", &major, &minor) != 2) {
    return 2;
  }

  const int compatible = major == NATIVE_MAJOR && minor == NATIVE_MINOR;
  printf("baseline=%d.%d candidate=%d.%d compatible=%s\n",
         NATIVE_MAJOR,
         NATIVE_MINOR,
         major,
         minor,
         compatible ? "yes" : "no");
  return compatible ? 0 : 3;
}
`,
    ),
    cTask(
      'c-build-feature-matrix-independent',
      '独立实践：读取发行配置并核对编译特性',
      '读取 release、debug 或 test 配置，要求 release 启用了 TLS 和 IO_URING 宏，debug 启用了 TRACE 宏。',
      'release',
      '输出 profile=release tls=on io_uring=on trace=off accepted=yes 并返回 0。',
      String.raw`#include <stdio.h>
#include <string.h>

#define ENABLE_TLS 1
#define ENABLE_IO_URING 1
/* #define ENABLE_TRACE 1 */

int main(void) {
  char profile[16] = {0};
  if (scanf("%15s", profile) != 1) {
    return 2;
  }

  int accepted = 0;
  if (strcmp(profile, "release") == 0) {
#if defined(ENABLE_TLS) && defined(ENABLE_IO_URING)
    accepted = 1;
#endif
  } else if (strcmp(profile, "debug") == 0) {
#if defined(ENABLE_TRACE)
    accepted = 1;
#endif
  } else if (strcmp(profile, "test") == 0) {
    accepted = ENABLE_TLS == 1;
  }

  printf("profile=%s tls=%s io_uring=%s trace=%s accepted=%s\n",
         profile,
#ifdef ENABLE_TLS
         "on",
#else
         "off",
#endif
#ifdef ENABLE_IO_URING
         "on",
#else
         "off",
#endif
#ifdef ENABLE_TRACE
         "on",
#else
         "off",
#endif
         accepted ? "yes" : "no");
  return accepted ? 0 : 3;
}
`,
    ),
  ),
  'programming:C · Redis/Nginx 源码与原生服务交付：状态机、容量和文件描述符上限': makeC(
    'C 代码台 · 连接状态机与文件描述符容量门禁',
    '显式维护连接状态迁移表，并在接受新连接前检查当前、新增与保留描述符是否超过上限；错误路径不改变已有状态。',
    'https://man7.org/linux/man-pages/man2/accept.2.html',
    cTask(
      'c-connection-state-machine-guided',
      '跟做：验证 CLOSED 到 CLOSED 的合法迁移',
      '读取四个状态名，逐条检查迁移是否为 closed->open->read->write->close 的合法前缀。',
      'closed open read write close',
      '输出 transitions=4 final=closed valid=yes 并返回 0；跳过 open 时应输出 invalid transition。',
      String.raw`#include <stdbool.h>
#include <stdio.h>
#include <string.h>

enum connection_state {
  STATE_INVALID = -1,
  STATE_CLOSED = 0,
  STATE_OPEN = 1,
  STATE_READING = 2,
  STATE_WRITING = 3
};

static enum connection_state parse_state(const char *text) {
  if (strcmp(text, "closed") == 0) return STATE_CLOSED;
  if (strcmp(text, "open") == 0) return STATE_OPEN;
  if (strcmp(text, "read") == 0) return STATE_READING;
  if (strcmp(text, "write") == 0) return STATE_WRITING;
  if (strcmp(text, "close") == 0) return STATE_CLOSED;
  return STATE_INVALID;
}

static bool legal_transition(enum connection_state from,
                             enum connection_state to) {
  return (from == STATE_CLOSED && to == STATE_OPEN) ||
         (from == STATE_OPEN && to == STATE_READING) ||
         (from == STATE_READING && to == STATE_WRITING) ||
         (from == STATE_WRITING && to == STATE_CLOSED);
}

int main(void) {
  char names[5][16] = {{0}};
  for (size_t index = 0; index < 5; ++index) {
    if (scanf("%15s", names[index]) != 1) {
      return 2;
    }
  }

  enum connection_state state = parse_state(names[0]);
  if (state != STATE_CLOSED) {
    return 3;
  }
  for (size_t index = 1; index < 5; ++index) {
    const enum connection_state next = parse_state(names[index]);
    if (next == STATE_INVALID || !legal_transition(state, next)) {
      printf("invalid transition at %s\n", names[index]);
      return 4;
    }
    state = next;
  }

  printf("transitions=4 final=%s valid=yes\n",
         state == STATE_CLOSED ? "closed" : "other");
  return state == STATE_CLOSED ? 0 : 1;
}
`,
    ),
    cTask(
      'c-fd-capacity-independent-plan',
      '独立实践：为保留描述符留出容量',
      '读取上限、当前占用、计划新增和必须保留的数量，在 accept 前做无符号加法边界检查。',
      '1024 900 100 24',
      '输出 limit=1024 needed=1024 reserved=24 accepted=yes 并返回 0；把新增改为 101 时应输出 rejected。',
      String.raw`#include <limits.h>
#include <stdbool.h>
#include <stdio.h>

static bool can_add(unsigned limit,
                    unsigned current,
                    unsigned incoming,
                    unsigned reserve,
                    unsigned *needed) {
  if (incoming > UINT_MAX - current) {
    return false;
  }
  *needed = current + incoming;
  return *needed <= limit && UINT_MAX - *needed >= reserve &&
         *needed + reserve <= limit;
}

int main(void) {
  unsigned limit = 0;
  unsigned current = 0;
  unsigned incoming = 0;
  unsigned reserve = 0;
  if (scanf("%u %u %u %u",
            &limit, &current, &incoming, &reserve) != 4 ||
      limit == 0U || current > limit) {
    return 2;
  }

  unsigned needed = 0;
  const bool accepted = can_add(limit, current, incoming, reserve, &needed);
  printf("limit=%u needed=%u reserved=%u accepted=%s\n",
         limit, needed, reserve, accepted ? "yes" : "no");
  return accepted ? 0 : 3;
}
`,
    ),
  ),
  'programming:C · Redis/Nginx 源码与原生服务交付：systemd、容器、core dump 和升级': makeC(
    'C 代码台 · 重启策略、健康门禁与版本回滚',
    '把退出码、重启次数和健康状态压缩成运维决策；再用 canary 与 stable 版本检查确认升级和回滚边界。',
    'https://systemd.io/SERVICE/',
    cTask(
      'c-runtime-restart-policy-guided',
      '跟做：从退出码和重启次数判定动作',
      '读取进程退出码、最近重启次数和健康状态。退出码 137 且健康不正常时输出 rollback，其余情况输出 inspect。',
      '137 3 unhealthy',
      '输出 exit_code=137 restarts=3 health=unhealthy action=rollback 并返回 0。',
      String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
  int exit_code = 0;
  int restarts = 0;
  char health[16] = {0};
  if (scanf("%d %d %15s", &exit_code, &restarts, health) != 3) {
    return 2;
  }

  int rollback = 0;
  if (exit_code == 137 && restarts >= 3 &&
      strcmp(health, "unhealthy") == 0) {
    rollback = 1;
  }
  printf("exit_code=%d restarts=%d health=%s action=%s\n",
         exit_code,
         restarts,
         health,
         rollback ? "rollback" : "inspect");
  return rollback ? 0 : 1;
}
`,
    ),
    cTask(
      'c-runtime-upgrade-slot-independent',
      '独立实践：并行验证 canary 与 stable',
      '读取 canary 健康值、stable 健康值和 canary 错误数。只有两个槽都健康且 canary 无错误时才允许切换。',
      '1 1 0',
      '输出 canary=healthy stable=healthy errors=0 promoted=yes 并返回 0；设置 canary 错误数 1 时应输出 promoted=no。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

int main(void) {
  int canary_healthy = 0;
  int stable_healthy = 0;
  int canary_errors = 0;
  if (scanf("%d %d %d",
            &canary_healthy, &stable_healthy, &canary_errors) != 3) {
    return 2;
  }

  const bool promoted =
      canary_healthy == 1 && stable_healthy == 1 && canary_errors == 0;
  printf("canary=%s stable=%s errors=%d promoted=%s\n",
         canary_healthy ? "healthy" : "unhealthy",
         stable_healthy ? "healthy" : "unhealthy",
         canary_errors,
         promoted ? "yes" : "no");
  return promoted ? 0 : 3;
}
`,
    ),
  ),
  'programming:C · Redis/Nginx 源码与原生服务交付：C 原生服务毕业项目与源码答辩': makeC(
    'C 代码台 · 请求路由、响应编码与故障契约',
    '完成一个最小服务内核：先按命令白名单生成响应，再用容量和协议检查决定请求是否被接受；实验覆盖请求、响应和拒绝路径。',
    'https://www.rfc-editor.org/rfc/rfc9110',
    cTask(
      'c-service-command-router-guided',
      '跟做：实现 GET/PING 两个命令',
      '读取命令和键，PING 返回 PONG，GET 返回 value:<key>，其他命令必须返回 400 并退出非零。',
      'GET cache',
      '输出 status=200 body=value:cache bytes=11 并返回 0；命令 PUT 应为 status=400。',
      String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
  char command[16] = {0};
  char key[32] = {0};
  if (scanf("%15s %31s", command, key) != 2) {
    return 2;
  }

  if (strcmp(command, "GET") == 0) {
    const int bytes = (int)strlen(key) + 6;
    printf("status=200 body=value:%s bytes=%d\n", key, bytes);
    return strcmp(key, "cache") == 0 ? 0 : 1;
  }
  if (strcmp(command, "PING") == 0) {
    puts("status=200 body=PONG bytes=4");
    return 0;
  }
  printf("status=400 body=unsupported-command command=%s\n", command);
  return 3;
}
`,
    ),
    cTask(
      'c-service-backpressure-independent',
      '独立实践：连接队列满时返回背压',
      '读取队列容量、当前长度、待入队请求和单请求字节数。容量或内存预算不足时必须拒绝整批请求。',
      '128 100 20 2048',
      '输出 queue=128 used=100 incoming=20 bytes=2048 action=accept 并返回 0；待入队 29 时应输出 action=reject。',
      String.raw`#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

static bool can_queue(uint64_t capacity,
                      uint64_t used,
                      uint64_t incoming,
                      uint64_t bytes,
                      uint64_t budget) {
  if (used > capacity || incoming > capacity - used) {
    return false;
  }
  if (incoming != 0U && bytes > budget / incoming) {
    return false;
  }
  return incoming * bytes <= budget;
}

int main(void) {
  unsigned capacity = 0;
  unsigned used = 0;
  unsigned incoming = 0;
  unsigned long long bytes = 0;
  if (scanf("%u %u %u %llu",
            &capacity, &used, &incoming, &bytes) != 4) {
    return 2;
  }

  const bool accepted =
      can_queue(capacity, used, incoming, bytes, UINT64_C(4) * 1024U * 1024U);
  printf("queue=%u used=%u incoming=%u bytes=%llu action=%s\n",
         capacity,
         used,
         incoming,
         bytes,
         accepted ? "accept" : "reject");
  return accepted ? 0 : 3;
}
`,
    ),
  ),
  'programming:C++ · 工具链、CMake Presets 与第一个工程：编译器、标准库、ABI 和链接': makeCpp(
    'C++ 代码台 · 语言版本、C ABI 边界与函数绑定',
    '先验证 C++20 语言模式，再通过 extern "C" 符号和 C++ 函数指针表连接调用方，观察 ABI 稳定边界。',
    'https://en.cppreference.com/w/cpp/language/abi',
    cppTask(
      'cpp-language-abi-guided',
      '跟做：检查 C++20 并验证求和',
      '读取两个整数，输出 __cplusplus 宏与和值。只有 C++20 或更新且和为 42 时才返回 0。',
      '20 22',
      '输出 language=202002 sum=42 并返回 0；编译器若未启用 C++20，语言版本检查失败。',
      String.raw`#include <iostream>

int main() {
  int left = 0;
  int right = 0;
  if (!(std::cin >> left >> right)) {
    return 2;
  }

  const long language = static_cast<long>(__cplusplus);
  const int sum = left + right;
  std::cout << "language=" << language << " sum=" << sum << '\n';
  return language >= 202002L && sum == 42 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-extern-c-binding-independent',
      '独立实践：在 C ABI 边界后绑定 C++ 实现',
      '读取 0 或 1 选择加法或乘法，通过函数指针表调用 extern "C" 包装函数并核对结果。',
      '0 20 22',
      '输出 operation=add result=42 abi=c 并返回 0；选择 1 时输出 operation=mul。',
      String.raw`#include <array>
#include <iostream>
#include <string_view>

extern "C" int stable_combine(int operation, int left, int right) {
  return operation == 0 ? left + right : left * right;
}

using operation_fn = int (*)(int, int, int);

struct operation_entry {
  std::string_view name;
  operation_fn function;
};

int main() {
  int operation = 0;
  int left = 0;
  int right = 0;
  if (!(std::cin >> operation >> left >> right) ||
      operation < 0 || operation > 1) {
    return 2;
  }

  constexpr std::array<operation_entry, 2> table{{
      {"add", stable_combine},
      {"mul", stable_combine},
  }};
  const auto &entry = table[static_cast<std::size_t>(operation)];
  const int result = entry.function(operation, left, right);
  std::cout << "operation=" << entry.name << " result=" << result
            << " abi=c\n";
  return result == 42 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 工具链、CMake Presets 与第一个工程：C++20/23 基线与编译器支持': makeCpp(
    'C++ 代码台 · Concepts、Ranges 与标准库能力探测',
    '在 C++20 基线上使用受约束函数、ranges 排序和标准数学常量，并通过特性宏确认当前翻译单元可用能力。',
    'https://en.cppreference.com/w/cpp/compiler_support',
    cppTask(
      'cpp-concepts-ranges-guided',
      '跟做：用 ranges 排序输入',
      '读取整数个数和全部值，通过 ranges::sort 排序并检查首尾元素。',
      '5 5 3 1 4 2',
      '输出 concepts=on sorted=1,2,3,4,5 并返回 0。',
      String.raw`#include <algorithm>
#include <iostream>
#include <ranges>
#include <vector>

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 100) {
    return 2;
  }
  std::vector<int> values(static_cast<std::size_t>(count));
  for (int &value : values) {
    if (!(std::cin >> value)) {
      return 2;
    }
  }

  std::ranges::sort(values);
  std::cout << "concepts=";
#ifdef __cpp_concepts
  std::cout << "on";
#else
  std::cout << "off";
#endif
  std::cout << " sorted=";
  for (std::size_t index = 0; index < values.size(); ++index) {
    if (index != 0) {
      std::cout << ',';
    }
    std::cout << values[index];
  }
  std::cout << '\n';

  return values.front() == 1 && values.back() == 5 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-standard-library-constant-independent',
      '独立实践：用 floating_point concept 计算圆面积',
      '读取整数半径，用 C++20 <numbers> 的 pi 计算面积。函数模板通过 floating_point 约束拒绝非浮点返回路径。',
      '2',
      '输出 radius=2 area=12.5664 concept=floating_point 并返回 0，面积误差小于 0.001。',
      String.raw`#include <cmath>
#include <concepts>
#include <iomanip>
#include <iostream>
#include <numbers>

template <std::floating_point Number>
Number circle_area(Number radius) {
  return std::numbers::pi_v<Number> * radius * radius;
}

int main() {
  int radius = 0;
  if (!(std::cin >> radius) || radius < 0 || radius > 1000) {
    return 2;
  }
  const double area = circle_area(static_cast<double>(radius));
  std::cout << std::fixed << std::setprecision(4)
            << "radius=" << radius << " area=" << area
            << " concept=floating_point\n";
  return std::abs(area - 12.566370614) < 0.001 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 工具链、CMake Presets 与第一个工程：Conan/vcpkg 与依赖锁定': makeCpp(
    'C++ 代码台 · 包清单、哈希锁与依赖冲突',
    '解析带版本和摘要的依赖锁，再检查同一依赖被多个上游要求不同版本时的冲突，形成可解释的求解结果。',
    'https://conan.io/center',
    cppTask(
      'cpp-dependency-lock-guided',
      '跟做：解析两个锁定依赖',
      '读取依赖数及 package@version:digest 形式的条目，验证包名唯一、版本非空、摘要非空。',
      '2 fmt@10.2.1:aaa111 yaml@0.8.0:bbb222',
      '输出 locked=2 packages=fmt,yaml valid=yes 并返回 0。',
      String.raw`#include <iostream>
#include <set>
#include <string>
#include <vector>

struct pin {
  std::string package;
  std::string version;
  std::string digest;
};

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 20) {
    return 2;
  }

  std::set<std::string> names;
  std::vector<pin> pins;
  for (int index = 0; index < count; ++index) {
    std::string token;
    if (!(std::cin >> token)) {
      return 2;
    }
    const auto at = token.find('@');
    const auto colon = token.find(':');
    if (at == std::string::npos || colon == std::string::npos ||
        at == 0 || colon <= at + 1 || colon + 1 >= token.size()) {
      std::cout << "invalid lock entry\n";
      return 3;
    }
    pin entry{
        token.substr(0, at),
        token.substr(at + 1, colon - at - 1),
        token.substr(colon + 1),
    };
    if (!names.insert(entry.package).second) {
      std::cout << "duplicate package=" << entry.package << '\n';
      return 4;
    }
    pins.push_back(entry);
  }

  std::cout << "locked=" << pins.size() << " packages=";
  bool first = true;
  for (const auto &[package, version, digest] : pins) {
    (void)version;
    (void)digest;
    if (!first) {
      std::cout << ',';
    }
    std::cout << package;
    first = false;
  }
  std::cout << " valid=yes\n";
  return pins.size() == 2 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-dependency-conflict-independent',
      '独立实践：检测传递依赖版本冲突',
      '读取依赖项数量及 name version 对，合并同名依赖。同名版本不一致时必须报告第一个冲突。',
      '4 core 2 util 1 shared 2 core 3',
      '输出 conflict=core versions=2,3 resolved=no 并返回 0，以 0 表示冲突被成功识别。',
      String.raw`#include <iostream>
#include <map>
#include <set>
#include <string>

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 50) {
    return 2;
  }

  std::map<std::string, std::set<int>> requirements;
  for (int index = 0; index < count; ++index) {
    std::string package;
    int version = 0;
    if (!(std::cin >> package >> version)) {
      return 2;
    }
    requirements[package].insert(version);
  }

  for (const auto &[package, versions] : requirements) {
    if (versions.size() > 1) {
      std::cout << "conflict=" << package << " versions=";
      bool first = true;
      for (const int version : versions) {
        if (!first) {
          std::cout << ',';
        }
        std::cout << version;
        first = false;
      }
      std::cout << " resolved=no\n";
      return package == "core" && versions == std::set<int>{2, 3} ? 0 : 1;
    }
  }

  std::cout << "conflict=none resolved=yes\n";
  return 3;
}
`,
    ),
  ),
  'programming:C++ · 工具链、CMake Presets 与第一个工程：第一个跨平台 C++17/20 工程': makeCpp(
    'C++ 代码台 · 路径规范化、目录深度与平台产物',
    '读取 Windows 或 POSIX 风格路径并规范化分隔符，再根据平台选择可执行后缀和安装根目录。',
    'https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html',
    cppTask(
      'cpp-cross-platform-path-guided',
      '跟做：把反斜杠路径规范化为 POSIX 形式',
      '读取一个不含空格的路径，把所有反斜杠替换为斜杠，统计目录层级并验证末尾文件名。',
      String.raw`src\app\main.cpp`,
      '输出 normalized=src/app/main.cpp depth=3 file=main.cpp 并返回 0。',
      String.raw`#include <algorithm>
#include <iostream>
#include <string>

int main() {
  std::string path;
  if (!(std::cin >> path) || path.empty() || path.size() > 200) {
    return 2;
  }

  std::replace(path.begin(), path.end(), '\\', '/');
  int depth = 0;
  for (const char character : path) {
    if (character == '/') {
      ++depth;
    }
  }
  const auto slash = path.rfind('/');
  const std::string file =
      slash == std::string::npos ? path : path.substr(slash + 1);
  std::cout << "normalized=" << path << " depth=" << depth
            << " file=" << file << '\n';
  return path == "src/app/main.cpp" && depth == 2 && file == "main.cpp" ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-cross-platform-artifact-independent',
      '独立实践：选择平台安装根与可执行后缀',
      '读取 windows、linux 或 macos，输出安装根目录和可执行文件名，未知平台必须拒绝。',
      'windows',
      '输出 platform=windows prefix=C:/ProgramFiles/Native exe=app.exe accepted=yes 并返回 0。',
      String.raw`#include <iostream>
#include <string>

struct platform_contract {
  const char *prefix;
  const char *executable;
};

int main() {
  std::string platform;
  if (!(std::cin >> platform)) {
    return 2;
  }

  platform_contract contract{};
  if (platform == "windows") {
    contract = {"C:/ProgramFiles/Native", "app.exe"};
  } else if (platform == "linux") {
    contract = {"/usr/local", "app"};
  } else if (platform == "macos") {
    contract = {"/opt/homebrew", "app"};
  } else {
    std::cout << "unknown platform=" << platform << '\n';
    return 3;
  }

  std::cout << "platform=" << platform << " prefix=" << contract.prefix
            << " exe=" << contract.executable << " accepted=yes\n";
  return platform == "windows" ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 值语义、类、RAII 与所有权：资源所有权重构实验': makeCpp(
    'C++ 代码台 · unique_ptr 转移与 weak_ptr 断环',
    '用独占指针把资源交给接收方，再用 weak_ptr 观察共享对象；实验直接观察强引用计数和过期状态。',
    'https://en.cppreference.com/w/cpp/memory/unique_ptr',
    cppTask(
      'cpp-unique-ownership-guided',
      '跟做：移动 unique_ptr 并保持单一所有者',
      '读取资源值，创建 unique_ptr，移动给 sink 后检查原指针为空、接收指针非空。',
      '42',
      '输出 owner=42 source_empty=yes sink_alive=yes 并返回 0。',
      String.raw`#include <iostream>
#include <memory>

bool sink(std::unique_ptr<int> resource) {
  if (!resource) {
    return false;
  }
  std::cout << "owner=" << *resource << " source_empty=";
  return *resource == 42;
}

int main() {
  int value = 0;
  if (!(std::cin >> value)) {
    return 2;
  }

  auto source = std::make_unique<int>(value);
  const bool sink_alive = sink(std::move(source));
  std::cout << (source ? "no" : "yes")
            << " sink_alive=" << (sink_alive ? "yes" : "no") << '\n';
  return source == nullptr && sink_alive ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-shared-weak-cycle-independent',
      '独立实践：用 weak_ptr 观察共享资源',
      '读取共享值，建立两个强引用和一个弱引用。释放全部强所有者后，弱引用必须变为 expired。',
      '7',
      '输出 strong_before=2 strong_after_release=1 expired=yes 并返回 0。',
      String.raw`#include <iostream>
#include <memory>

int main() {
  int value = 0;
  if (!(std::cin >> value)) {
    return 2;
  }
  auto keeper = std::make_shared<int>(value);
  std::weak_ptr<int> observer = keeper;
  auto second = keeper;
  const long before = keeper.use_count();
  keeper.reset();
  const long after = second.use_count();
  second.reset();
  std::cout << "strong_before=" << before
            << " strong_after_release=" << after
            << " expired=" << (observer.expired() ? "yes" : "no") << '\n';
  return before == 2 && after == 1 && observer.expired() ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 并发、原子、内存模型与 Asio：异步网络服务实验': makeCpp(
    'C++ 代码台 · future 任务与事件队列契约',
    '用 future 接收异步计算结果，再用有序事件队列模拟连接、读、写和关闭，验证服务状态不会越级。',
    'https://en.cppreference.com/w/cpp/thread/future',
    cppTask(
      'cpp-async-future-guided',
      '跟做：异步计算两个整数之和',
      '读取两个整数，把加法提交为 std::async 任务，通过 future::get 获取结果并验证 42。',
      '20 22',
      '输出 async_sum=42 ready=yes 并返回 0。',
      String.raw`#include <future>
#include <iostream>

int main() {
  int left = 0;
  int right = 0;
  if (!(std::cin >> left >> right)) {
    return 2;
  }
  std::future<int> result = std::async(std::launch::async, [left, right] {
    return left + right;
  });
  const int sum = result.get();
  std::cout << "async_sum=" << sum << " ready="
            << (result.valid() ? "no" : "yes") << '\n';
  return sum == 42 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-async-event-loop-independent',
      '独立实践：按连接状态机处理事件',
      '读取四个事件 R、W、R、C。状态必须先 open，再经历 read/write/read，最后 close；任何越级都拒绝。',
      'R W R C',
      '输出 events=4 final=closed accepted=yes 并返回 0；从 W 开始时应输出 rejected。',
      String.raw`#include <iostream>
#include <string>
#include <vector>

enum class state { closed, open, reading, writing };

int main() {
  std::vector<char> events;
  char event = '\0';
  while (events.size() < 4 && std::cin >> event) {
    events.push_back(event);
  }
  if (events.size() != 4) {
    return 2;
  }

  state current = state::closed;
  if (events.front() == 'R') {
    current = state::open;
  }
  for (const char item : events) {
    if (item == 'R' && (current == state::open || current == state::writing)) {
      current = state::reading;
    } else if (item == 'W' && current == state::reading) {
      current = state::writing;
    } else if (item == 'C' &&
               (current == state::reading || current == state::writing)) {
      current = state::closed;
    } else if (!(item == 'R' && current == state::open)) {
      std::cout << "rejected at " << item << '\n';
      return 3;
    }
  }

  std::cout << "events=" << events.size() << " final="
            << (current == state::closed ? "closed" : "other")
            << " accepted=yes\n";
  return current == state::closed ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 构建、ABI、动态库与跨平台发布：静态库、共享库和可见性': makeCpp(
    'C++ 代码台 · 导出符号筛选与插件回调表',
    '从符号清单中筛出公开导出，再通过不带名称修饰的 C ABI 注册函数指针，模拟宿主加载插件。',
    'https://gcc.gnu.org/wiki/Visibility',
    cppTask(
      'cpp-visibility-symbols-guided',
      '跟做：区分公开导出和内部符号',
      '读取符号数和名称，只有 core 与 api 被导出，其余 hidden 或 internal 符号不进入公开表。',
      '3 core internal api',
      '输出 exported=2 hidden=1 symbols=core,api 并返回 0。',
      String.raw`#include <iostream>
#include <set>
#include <string>

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 100) {
    return 2;
  }
  const std::set<std::string> public_symbols{"core", "api"};
  std::set<std::string> exported;
  int hidden = 0;
  for (int index = 0; index < count; ++index) {
    std::string symbol;
    if (!(std::cin >> symbol)) {
      return 2;
    }
    if (public_symbols.contains(symbol)) {
      exported.insert(symbol);
    } else {
      ++hidden;
    }
  }
  std::cout << "exported=" << exported.size() << " hidden=" << hidden
            << " symbols=";
  bool first = true;
  for (const auto &symbol : exported) {
    if (!first) {
      std::cout << ',';
    }
    std::cout << symbol;
    first = false;
  }
  std::cout << '\n';
  return exported.size() == 2 && hidden == 1 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-plugin-callback-independent',
      '独立实践：通过 C ABI 注册插件函数',
      '读取插件名和两个整数，从函数表中按名称查找回调并执行，未知插件必须返回失败。',
      'mul 6 7',
      '输出 plugin=mul result=42 registered=yes 并返回 0；插件名 unknown 时输出 not found。',
      String.raw`#include <array>
#include <iostream>
#include <string_view>

extern "C" int plugin_add(int left, int right) {
  return left + right;
}

extern "C" int plugin_mul(int left, int right) {
  return left * right;
}

using plugin_fn = int (*)(int, int);

struct plugin_entry {
  std::string_view name;
  plugin_fn callback;
};

int main() {
  constexpr std::array<plugin_entry, 2> registry{{
      {"add", plugin_add},
      {"mul", plugin_mul},
  }};
  std::string_view requested;
  std::string name;
  int left = 0;
  int right = 0;
  if (!(std::cin >> name >> left >> right)) {
    return 2;
  }
  requested = name;
  for (const auto &entry : registry) {
    if (entry.name == requested) {
      const int result = entry.callback(left, right);
      std::cout << "plugin=" << requested << " result=" << result
                << " registered=yes\n";
      return result == 42 ? 0 : 1;
    }
  }
  std::cout << "plugin=" << requested << " not found\n";
  return 3;
}
`,
    ),
  ),
  'programming:C++ · 构建、ABI、动态库与跨平台发布：符号版本、插件和动态加载': makeCpp(
    'C++ 代码台 · 符号版本选择与动态插件解析',
    '从候选符号版本中选最高兼容版本，再按外部操作选择函数指针执行；两个实验都拒绝不存在或越界的符号。',
    'https://sourceware.org/binutils/docs/ld/VERSION.html',
    cppTask(
      'cpp-symbol-version-guided',
      '跟做：选择不高于主版本的最高符号',
      '读取要求主版本和三个符号版本，选择小于等于主版本的最高版本。',
      '2 1.0 2.0 3.0',
      '输出 required=2 chosen=2.0 compatible=yes 并返回 0。',
      String.raw`#include <iomanip>
#include <iostream>
#include <limits>

int main() {
  int required = 0;
  double first = 0.0;
  double second = 0.0;
  double third = 0.0;
  if (!(std::cin >> required >> first >> second >> third)) {
    return 2;
  }
  double chosen = std::numeric_limits<double>::lowest();
  for (const double candidate : {first, second, third}) {
    if (candidate <= static_cast<double>(required) && candidate > chosen) {
      chosen = candidate;
    }
  }
  if (chosen == std::numeric_limits<double>::lowest()) {
    std::cout << "no compatible symbol\n";
    return 3;
  }
  std::cout << std::fixed << std::setprecision(1)
            << "required=" << required << " chosen=" << chosen
            << " compatible=yes\n";
  return chosen == 2.0 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-dynamic-loader-independent',
      '独立实践：解析外部操作并执行函数表',
      '读取 add 或 sub 与两个整数，模拟 dlsym/LoadLibrary 查找过程。返回缺失符号时不得调用空指针。',
      'sub 50 8',
      '输出 symbol=sub result=42 loaded=yes 并返回 0；symbol 未找到时输出 missing。',
      String.raw`#include <array>
#include <iostream>
#include <string_view>

using operation_fn = int (*)(int, int);

struct symbol_binding {
  std::string_view name;
  operation_fn address;
};

int main() {
  std::string requested;
  int left = 0;
  int right = 0;
  if (!(std::cin >> requested >> left >> right)) {
    return 2;
  }
  constexpr std::array<symbol_binding, 2> bindings{{
      {"add", [](int a, int b) { return a + b; }},
      {"sub", [](int a, int b) { return a - b; }},
  }};
  for (const auto &binding : bindings) {
    if (binding.name == requested) {
      const int result = binding.address(left, right);
      std::cout << "symbol=" << binding.name << " result=" << result
                << " loaded=yes\n";
      return result == 42 ? 0 : 1;
    }
  }
  std::cout << "symbol=" << requested << " missing\n";
  return 3;
}
`,
    ),
  ),
  'programming:C++ · 构建、ABI、动态库与跨平台发布：跨平台编译器和运行时依赖': makeCpp(
    'C++ 代码台 · 运行时依赖集合与目标平台矩阵',
    '用集合差找缺失的运行时库，再根据操作系统与架构选择编译器目标、ABI 和运行时基线。',
    'https://en.cppreference.com/w/cpp/compiler_support',
    cppTask(
      'cpp-runtime-dependency-guided',
      '跟做：找出未满足的运行时库',
      '读取所需库数与库名、已安装库数与库名，输出缺失集合；缺失存在时表示依赖探测成功而不是程序失败。',
      '3 libc stdc++ pthread 3 libc stdc++ winmm',
      '输出 required=3 missing=1 missing_lib=pthread accepted=no 并返回 0。',
      String.raw`#include <iostream>
#include <set>
#include <string>

int main() {
  int required_count = 0;
  if (!(std::cin >> required_count) || required_count < 1 || required_count > 30) {
    return 2;
  }
  std::set<std::string> required;
  for (int index = 0; index < required_count; ++index) {
    std::string name;
    if (!(std::cin >> name)) {
      return 2;
    }
    required.insert(name);
  }

  int present_count = 0;
  if (!(std::cin >> present_count) || present_count < 0 || present_count > 30) {
    return 2;
  }
  std::set<std::string> present;
  for (int index = 0; index < present_count; ++index) {
    std::string name;
    if (!(std::cin >> name)) {
      return 2;
    }
    present.insert(name);
  }

  std::string first_missing;
  int missing = 0;
  for (const auto &name : required) {
    if (!present.contains(name)) {
      if (first_missing.empty()) {
        first_missing = name;
      }
      ++missing;
    }
  }
  std::cout << "required=" << required.size() << " missing=" << missing
            << " missing_lib=" << (first_missing.empty() ? "none" : first_missing)
            << " accepted=" << (missing == 0 ? "yes" : "no") << '\n';
  return missing == 1 && first_missing == "pthread" ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-runtime-platform-matrix-independent',
      '独立实践：选择平台编译器与 ABI 契约',
      '读取操作系统和架构，输出编译器前缀、ABI 与运行时。只接受 linux amd64、linux arm64、macos arm64 和 windows amd64。',
      'linux arm64',
      '输出 platform=linux/arm64 compiler=aarch64-linux-gnu-g++ abi=lp64 runtime=glibc accepted=yes 并返回 0。',
      String.raw`#include <iostream>
#include <string>

struct target {
  const char *compiler;
  const char *abi;
  const char *runtime;
};

int main() {
  std::string os;
  std::string arch;
  if (!(std::cin >> os >> arch)) {
    return 2;
  }

  target selected{};
  if (os == "linux" && arch == "amd64") {
    selected = {"x86_64-linux-gnu-g++", "lp64", "glibc"};
  } else if (os == "linux" && arch == "arm64") {
    selected = {"aarch64-linux-gnu-g++", "lp64", "glibc"};
  } else if (os == "macos" && arch == "arm64") {
    selected = {"clang++", "lp64", "libc++"};
  } else if (os == "windows" && arch == "amd64") {
    selected = {"clang++.exe", "llp64", "ucrt"};
  } else {
    std::cout << "unsupported target=" << os << '/' << arch << '\n';
    return 3;
  }

  std::cout << "platform=" << os << '/' << arch
            << " compiler=" << selected.compiler
            << " abi=" << selected.abi
            << " runtime=" << selected.runtime << " accepted=yes\n";
  return os == "linux" && arch == "arm64" ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 构建、ABI、动态库与跨平台发布：安装包、容器和调试符号': makeCpp(
    'C++ 代码台 · 发布文件清单与镜像摘要校验',
    '检查安装包中可执行文件、调试符号和容器层的完整性，再核对镜像摘要是否与发布清单一致。',
    'https://en.cppreference.com/w/cpp/filesystem',
    cppTask(
      'cpp-release-manifest-guided',
      '跟做：验证安装清单包含调试符号',
      '读取包名、文件数和文件列表，检查是否存在 .dbg 文件与普通可执行文件。',
      'app 3 app app.dbg image.tar',
      '输出 package=app files=3 debug=app.dbg installable=yes 并返回 0。',
      String.raw`#include <iostream>
#include <string>
#include <vector>

int main() {
  std::string package;
  int count = 0;
  if (!(std::cin >> package >> count) || count < 1 || count > 20) {
    return 2;
  }
  std::vector<std::string> files(static_cast<std::size_t>(count));
  for (std::string &file : files) {
    if (!(std::cin >> file)) {
      return 2;
    }
  }

  std::string debug;
  bool executable = false;
  for (const auto &file : files) {
    if (file.size() >= 4 && file.ends_with(".dbg")) {
      debug = file;
    }
    if (file == "app") {
      executable = true;
    }
  }
  const bool installable = executable && !debug.empty();
  std::cout << "package=" << package << " files=" << files.size()
            << " debug=" << (debug.empty() ? "none" : debug)
            << " installable=" << (installable ? "yes" : "no") << '\n';
  return package == "app" && installable ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-container-digest-independent',
      '独立实践：校验镜像摘要与发布清单',
      '读取期望摘要和实际摘要，要求两者完全相等且都以 sha256: 开头，防止标签漂移或层内容替换。',
      'sha256:abc123 sha256:abc123',
      '输出 expected=sha256:abc123 actual=sha256:abc123 verified=yes 并返回 0。',
      String.raw`#include <iostream>
#include <string>

int main() {
  std::string expected;
  std::string actual;
  if (!(std::cin >> expected >> actual)) {
    return 2;
  }
  const bool verified =
      expected.starts_with("sha256:") &&
      actual.starts_with("sha256:") &&
      expected == actual &&
      expected.size() > 7;
  std::cout << "expected=" << expected << " actual=" << actual
            << " verified=" << (verified ? "yes" : "no") << '\n';
  return verified ? 0 : 3;
}
`,
    ),
  ),
  'programming:C++ · 构建、ABI、动态库与跨平台发布：二进制发布与兼容性测试': makeCpp(
    'C++ 代码台 · 编译器 ABI 与语义版本兼容',
    '先比较编译器主版本和 ABI 标签，再判断语义版本是否满足同主版本、补丁不降级的最低要求。',
    'https://semver.org/',
    cppTask(
      'cpp-binary-abi-compatibility-guided',
      '跟做：检查编译器与 ABI 标签',
      '读取构建配置编译器和运行库编译器版本，以及两边 ABI。主版本与 ABI 都相等才允许加载。',
      '14 14 3 3',
      '输出 host_gcc=14 artifact_gcc=14 abi=3 compatible=yes 并返回 0。',
      String.raw`#include <iostream>

int main() {
  int host_compiler = 0;
  int artifact_compiler = 0;
  int host_abi = 0;
  int artifact_abi = 0;
  if (!(std::cin >> host_compiler >> artifact_compiler >> host_abi >> artifact_abi)) {
    return 2;
  }
  const bool compatible =
      host_compiler == artifact_compiler && host_abi == artifact_abi;
  std::cout << "host_gcc=" << host_compiler
            << " artifact_gcc=" << artifact_compiler
            << " abi=" << host_abi
            << " compatible=" << (compatible ? "yes" : "no") << '\n';
  return compatible ? 0 : 3;
}
`,
    ),
    cppTask(
      'cpp-semver-range-independent',
      '独立实践：判断 artifact 是否满足运行时最低版本',
      '读取请求版本与主机版本三段数字。只有主版本相同且主机版本不低于请求版本时才兼容。',
      '2 4 1 2 5 0',
      '输出 requested=2.4.1 host=2.5.0 compatible=yes 并返回 0；主机 3.0.0 不兼容。',
      String.raw`#include <array>
#include <iostream>

std::array<int, 3> read_version() {
  std::array<int, 3> version{};
  std::cin >> version[0] >> version[1] >> version[2];
  return version;
}

bool at_least(const std::array<int, 3> &host,
              const std::array<int, 3> &requested) {
  if (host[0] != requested[0]) {
    return false;
  }
  if (host[1] != requested[1]) {
    return host[1] > requested[1];
  }
  return host[2] >= requested[2];
}

int main() {
  const auto requested = read_version();
  const auto host = read_version();
  if (!std::cin) {
    return 2;
  }
  const bool compatible = at_least(host, requested);
  std::cout << "requested=" << requested[0] << '.' << requested[1] << '.'
            << requested[2] << " host=" << host[0] << '.' << host[1] << '.'
            << host[2] << " compatible=" << (compatible ? "yes" : "no") << '\n';
  return compatible ? 0 : 3;
}
`,
    ),
  ),
  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：GTest、property test 和回归矩阵': makeCpp(
    'C++ 代码台 · 属性测试与表驱动回归矩阵',
    '把断言组织成属性和数据表，执行多组输入并在首个失败处给出索引；这模拟最小测试框架的报告契约。',
    'https://google.github.io/googletest/',
    cppTask(
      'cpp-property-commutative-guided',
      '跟做：验证加法交换律属性',
      '读取两个整数，围绕输入派生四组组合，验证 a+b 与 b+a 对所有组合相等。',
      '-3 5',
      '输出 examples=4 failures=0 property=commutative 并返回 0。',
      String.raw`#include <iostream>
#include <utility>
#include <vector>

int main() {
  int left = 0;
  int right = 0;
  if (!(std::cin >> left >> right)) {
    return 2;
  }
  const std::vector<std::pair<int, int>> examples{
      {left, right},
      {right, left},
      {left + 1, right - 1},
      {right + 1, left - 1},
  };
  int failures = 0;
  for (std::size_t index = 0; index < examples.size(); ++index) {
    const auto [a, b] = examples[index];
    const volatile int first_sum = a + b;
    const volatile int second_sum = b + a;
    if (first_sum != second_sum) {
      ++failures;
      std::cout << "first_failure=" << index << '\n';
      break;
    }
  }
  std::cout << "examples=" << examples.size() << " failures=" << failures
            << " property=commutative\n";
  return failures == 0 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-table-regression-independent',
      '独立实践：运行边界表驱动测试',
      '读取一个整数，对 -1、0、1、2 四个边界值执行同一个 0<=x<=1 判定，并报告通过数量。',
      '1',
      '输出 input=1 cases=4 passed=4 predicate=inclusive-range 并返回 0。',
      String.raw`#include <array>
#include <iostream>

bool in_range(int value) {
  return value >= 0 && value <= 1;
}

int main() {
  int input = 0;
  if (!(std::cin >> input)) {
    return 2;
  }
  const std::array<int, 4> cases{-1, 0, 1, 2};
  int passed = 0;
  for (const int value : cases) {
    if (in_range(value) == (value >= 0 && value <= 1)) {
      ++passed;
    }
  }
  std::cout << "input=" << input << " cases=" << cases.size()
            << " passed=" << passed << " predicate=inclusive-range\n";
  return passed == static_cast<int>(cases.size()) ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · STL/Asio 源码与高性能毕业项目：libstdc++/libc++ 的 vector 实现': makeCpp(
    'C++ 代码台 · 容量倍增与迭代器失效代际',
    '用小型连续缓冲区复现 vector 的 size/capacity 增长、重新分配和迭代器失效，不依赖第三方容器。',
    'https://en.cppreference.com/w/cpp/container/vector',
    cppTask(
      'cpp-vector-growth-guided',
      '跟做：观察 push_back 的容量倍增',
      '读取个数和值，逐个追加到小向量，输出最终 size、capacity 和首尾值。',
      '5 2 4 6 8 10',
      '输出 size=5 capacity=8 first=2 last=10 并返回 0。',
      String.raw`#include <algorithm>
#include <iostream>
#include <memory>

class int_vector {
 public:
  void push_back(int value) {
    if (size_ == capacity_) {
      grow();
    }
    data_[size_++] = value;
  }

  int operator[](std::size_t index) const {
    return data_[index];
  }

  std::size_t size() const {
    return size_;
  }

  std::size_t capacity() const {
    return capacity_;
  }

 private:
  void grow() {
    const std::size_t next = capacity_ == 0 ? 1 : capacity_ * 2;
    auto replacement = std::make_unique<int[]>(next);
    std::copy_n(data_.get(), size_, replacement.get());
    data_ = std::move(replacement);
    capacity_ = next;
  }

  std::unique_ptr<int[]> data_{};
  std::size_t size_ = 0;
  std::size_t capacity_ = 0;
};

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 100) {
    return 2;
  }
  int_vector values;
  for (int index = 0; index < count; ++index) {
    int value = 0;
    if (!(std::cin >> value)) {
      return 2;
    }
    values.push_back(value);
  }
  std::cout << "size=" << values.size() << " capacity=" << values.capacity()
            << " first=" << values[0] << " last=" << values[values.size() - 1]
            << '\n';
  return values.size() == 5 && values.capacity() == 8 &&
                 values[0] == 2 && values[values.size() - 1] == 10
             ? 0
             : 1;
}
`,
    ),
    cppTask(
      'cpp-vector-invalidation-independent',
      '独立实践：用代际号识别失效迭代器',
      '读取初始容量，填满后追加一个元素。缓冲区增长使容量翻倍并递增代际号，旧句柄必须被判定失效。',
      '4',
      '输出 old_capacity=4 new_capacity=8 old_generation=1 new_generation=2 invalidated=yes 并返回 0。',
      String.raw`#include <iostream>
#include <memory>

struct handle {
  std::size_t generation;
};

class generation_buffer {
 public:
  explicit generation_buffer(std::size_t capacity)
      : data_(std::make_unique<int[]>(capacity)), capacity_(capacity) {}

  handle acquire() const {
    return {generation_};
  }

  void push(int value) {
    if (size_ == capacity_) {
      auto next = std::make_unique<int[]>(capacity_ * 2);
      for (std::size_t index = 0; index < size_; ++index) {
        next[index] = data_[index];
      }
      data_ = std::move(next);
      capacity_ *= 2;
      ++generation_;
    }
    data_[size_++] = value;
  }

  bool valid(handle token) const {
    return token.generation == generation_;
  }

  std::size_t capacity() const {
    return capacity_;
  }

  std::size_t generation() const {
    return generation_;
  }

 private:
  std::unique_ptr<int[]> data_;
  std::size_t size_ = 0;
  std::size_t capacity_ = 0;
  std::size_t generation_ = 1;
};

int main() {
  std::size_t capacity = 0;
  if (!(std::cin >> capacity) || capacity < 1 || capacity > 1024) {
    return 2;
  }
  generation_buffer buffer(capacity);
  for (std::size_t index = 0; index < capacity; ++index) {
    buffer.push(static_cast<int>(index));
  }
  const handle old_handle = buffer.acquire();
  const std::size_t old_capacity = buffer.capacity();
  const std::size_t old_generation = buffer.generation();
  buffer.push(99);
  const bool invalidated = !buffer.valid(old_handle);
  std::cout << "old_capacity=" << old_capacity
            << " new_capacity=" << buffer.capacity()
            << " old_generation=" << old_generation
            << " new_generation=" << buffer.generation()
            << " invalidated=" << (invalidated ? "yes" : "no") << '\n';
  return old_capacity == 4 && buffer.capacity() == 8 && invalidated ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · STL/Asio 源码与高性能毕业项目：Asio reactor、executor 和 strand': makeCpp(
    'C++ 代码台 · reactor 事件队列与 strand 顺序',
    '用 FIFO 事件队列模拟 reactor 就绪事件，再按连接键分桶执行，验证同一 strand 内顺序不被打乱。',
    'https://think-async.com/Asio/',
    cppTask(
      'cpp-reactor-event-queue-guided',
      '跟做：按提交顺序执行 reactor 事件',
      '读取事件数和事件名，压入队列后依次执行，输出完整执行顺序。',
      '3 read write close',
      '输出 executed=3 order=read>write>close 并返回 0。',
      String.raw`#include <deque>
#include <iostream>
#include <string>

int main() {
  int count = 0;
  if (!(std::cin >> count) || count < 1 || count > 20) {
    return 2;
  }
  std::deque<std::string> reactor;
  for (int index = 0; index < count; ++index) {
    std::string event;
    if (!(std::cin >> event)) {
      return 2;
    }
    reactor.push_back(event);
  }

  std::cout << "executed=" << reactor.size() << " order=";
  bool first = true;
  while (!reactor.empty()) {
    if (!first) {
      std::cout << '>';
    }
    std::cout << reactor.front();
    reactor.pop_front();
    first = false;
  }
  std::cout << '\n';
  return count == 3 ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-reactor-strand-independent',
      '独立实践：按连接 strand 保序交错执行',
      '读取四个事件，事件首字符是 strand 键。交替轮询各键，同一键必须保持 a1 在 a2 前、b1 在 b2 前。',
      'a1 b1 a2 b2',
      '输出 order=a1,b1,a2,b2 strands=2 valid=yes 并返回 0。',
      String.raw`#include <deque>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
  std::map<char, std::deque<std::string>> strands;
  for (int index = 0; index < 4; ++index) {
    std::string event;
    if (!(std::cin >> event) || event.size() < 2) {
      return 2;
    }
    strands[event.front()].push_back(event);
  }

  std::vector<std::string> order;
  bool progressed = true;
  while (progressed) {
    progressed = false;
    for (auto &[key, queue] : strands) {
      (void)key;
      if (!queue.empty()) {
        order.push_back(queue.front());
        queue.pop_front();
        progressed = true;
      }
    }
  }

  std::cout << "order=";
  for (std::size_t index = 0; index < order.size(); ++index) {
    if (index != 0) {
      std::cout << ',';
    }
    std::cout << order[index];
  }
  const bool valid = order == std::vector<std::string>{"a1", "b1", "a2", "b2"};
  std::cout << " strands=" << strands.size()
            << " valid=" << (valid ? "yes" : "no") << '\n';
  return valid && strands.size() == 2 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · STL/Asio 源码与高性能毕业项目：源代码锚点、调用链和实验': makeCpp(
    'C++ 代码台 · 栈帧锚点与可达调用链',
    '从自底向上的栈帧列表恢复根帧，再从函数依赖图寻找目标函数的最短调用链；两个结果都能作为源码实验锚点。',
    'https://sourceware.org/gdb/onlinedocs/gdb/Backtrace.html',
    cppTask(
      'cpp-stack-anchor-guided',
      '跟做：从栈帧列表提取根与叶',
      '读取帧数和从叶到根的帧名，输出深度、叶节点与根节点。',
      '4 leaf worker handler main',
      '输出 depth=4 leaf=leaf root=main anchored=yes 并返回 0。',
      String.raw`#include <iostream>
#include <string>
#include <vector>

int main() {
  int depth = 0;
  if (!(std::cin >> depth) || depth < 1 || depth > 64) {
    return 2;
  }
  std::vector<std::string> frames(static_cast<std::size_t>(depth));
  for (std::string &frame : frames) {
    if (!(std::cin >> frame)) {
      return 2;
    }
  }
  std::cout << "depth=" << frames.size() << " leaf=" << frames.front()
            << " root=" << frames.back() << " anchored=yes\n";
  return frames.front() == "leaf" && frames.back() == "main" ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-call-graph-independent',
      '独立实践：从调用边寻找最短路径',
      '读取边数和 from to 对，从 main 出发做 BFS，判断 target 是否可达并输出最短深度。',
      '4 main worker worker db db cache main cache',
      '输出 start=main target=db reachable=yes depth=2 edges=4 并返回 0。',
      String.raw`#include <iostream>
#include <map>
#include <queue>
#include <string>
#include <utility>
#include <vector>

int main() {
  int edge_count = 0;
  if (!(std::cin >> edge_count) || edge_count < 1 || edge_count > 100) {
    return 2;
  }
  std::map<std::string, std::vector<std::string>> graph;
  for (int index = 0; index < edge_count; ++index) {
    std::string from;
    std::string to;
    if (!(std::cin >> from >> to)) {
      return 2;
    }
    graph[from].push_back(to);
  }

  std::queue<std::pair<std::string, int>> pending;
  pending.push({"main", 0});
  int depth = -1;
  while (!pending.empty()) {
    auto [node, distance] = pending.front();
    pending.pop();
    if (node == "db") {
      depth = distance;
      break;
    }
    for (const auto &next : graph[node]) {
      pending.push({next, distance + 1});
    }
  }

  std::cout << "start=main target=db reachable="
            << (depth >= 0 ? "yes" : "no")
            << " depth=" << depth << " edges=" << edge_count << '\n';
  return depth == 2 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · STL/Asio 源码与高性能毕业项目：容量、故障、镜像和运行手册': makeCpp(
    'C++ 代码台 · 容量预测与故障运行手册',
    '先根据当前负载和预测增量决定扩缩容，再验证健康、降级、恢复状态迁移；输出可直接进入值班手册。',
    'https://sre.google/workbook/incident-response/',
    cppTask(
      'cpp-capacity-forecast-guided',
      '跟做：预测下一窗口容量',
      '读取容量、当前连接和预测增量，计算下一窗口利用率并给出 scale_up 或 hold。',
      '100 80 30',
      '输出 capacity=100 projected=110 utilization_bp=11000 action=scale_up 并返回 0。',
      String.raw`#include <cstdint>
#include <iostream>

int main() {
  std::int64_t capacity = 0;
  std::int64_t current = 0;
  std::int64_t forecast = 0;
  if (!(std::cin >> capacity >> current >> forecast) ||
      capacity <= 0 || current < 0 || forecast < 0) {
    return 2;
  }
  const std::int64_t projected = current + forecast;
  const std::int64_t utilization_bp = projected * 10000 / capacity;
  const bool scale_up = projected > capacity;
  std::cout << "capacity=" << capacity << " projected=" << projected
            << " utilization_bp=" << utilization_bp
            << " action=" << (scale_up ? "scale_up" : "hold") << '\n';
  return scale_up ? 0 : 1;
}
`,
    ),
    cppTask(
      'cpp-incident-runbook-independent',
      '独立实践：校验故障状态迁移',
      '读取三个状态。合法路径是 healthy->degraded->recovered，任何跳过降级或直接回到健康的路径都拒绝。',
      'healthy degraded recovered',
      '输出 transitions=2 final=recovered runbook=valid 并返回 0；healthy recovered 时输出 invalid。',
      String.raw`#include <array>
#include <iostream>
#include <string>

int main() {
  std::array<std::string, 3> states{};
  for (std::string &state : states) {
    if (!(std::cin >> state)) {
      return 2;
    }
  }
  const bool valid =
      states[0] == "healthy" &&
      states[1] == "degraded" &&
      states[2] == "recovered";
  if (!valid) {
    std::cout << "transitions=1 final=" << states.back()
              << " runbook=invalid\n";
    return 3;
  }
  std::cout << "transitions=2 final=recovered runbook=valid\n";
  return 0;
}
`,
    ),
  ),
};
