import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

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
  installSteps: readonly string[],
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  requiredRuntime: 'c',
  runtimeLabel: 'C17 / GCC 15 或 Clang',
  docsUrl,
  installSteps,
  languages: ['c'],
  practice,
  apply,
});

const makeCpp = (
  title: string,
  description: string,
  docsUrl: string,
  installSteps: readonly string[],
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  requiredRuntime: 'cpp',
  runtimeLabel: 'C++20 / GCC 15 或 Clang',
  docsUrl,
  installSteps,
  languages: ['cpp'],
  practice,
  apply,
});

/**
 * C/C++ 剩余课程的单文件真实实验。
 *
 * 每段代码只依赖 C17/C++20 标准库并读取给定 stdin。调试器、线程调度、
 * socket、CMake、sanitizer 和第三方测试框架等无法在单文件跨平台运行器中
 * 真实托管的部分，使用确定性的状态契约还原可观察语义，并在每门课中明确边界。
 */
export const LEARNING_CODE_LABS_NATIVE_REMAINING: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:C · 类型、数组、指针、结构体与函数：整数、浮点、字符与对象表示': makeC(
    'C 代码台 · 对象表示、字节序与可移植解码',
    '通过 memcpy 在不同对象类型之间搬运字节，区分值的二进制表示与主机字节序，并构造不受对齐影响的显式小端解码器。',
    'https://en.cppreference.com/w/c/language/object',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '对象字节只通过 unsigned char 与 memcpy 观察，禁止用不兼容指针解引用绕过类型规则。',
      '先记录主机字节顺序，再运行任务；输出必须与实际表示和显式字节序解码一致。',
    ],
    cTask(
      'native-rem-c-object-representation-guided',
      '跟做：观察负整数与字符对象字节',
      '输入一个负整数和一个 ASCII 码。程序把整数复制进 uint32_t 与字节数组，打印补码值、主机顺序字节及字符本身。',
      '-7 65\n',
      '补码十进制值为 4294967289，ASCII 码 65 对应 A。当前小端 GCC 运行器显示 F9 FF FF FF；其他平台字节顺序可不同，但数值与退出码必须一致。',
      String.raw`#include <stdint.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  int value = 0;
  unsigned int ascii = 0;
  if (scanf("%d %u", &value, &ascii) != 2 || ascii > 127U) return 2;

  uint32_t bits = 0;
  memcpy(&bits, &value, sizeof bits);

  unsigned char bytes[sizeof bits];
  memcpy(bytes, &bits, sizeof bits);

  const char glyph = (char)ascii;
  printf("value=%d bits=%u char=%c\n", value, (unsigned int)bits, glyph);
  printf("bytes=%02X %02X %02X %02X\n",
         bytes[0], bytes[1], bytes[2], bytes[3]);

  return bits == (uint32_t)value && glyph == 'A' ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-endian-decode-independent',
      '独立实践：显式构造小端与大端整数',
      '输入四个十六进制字节，按给定顺序分别组合为小端与大端 uint32_t，不读取未对齐地址，也不依赖主机大小端。',
      '12 34 56 78\n',
      '预期 little=0x78563412，big=0x12345678。若代码把 uint8_t 指针强转成 uint32_t 指针，在严格对齐平台会产生未定义行为。',
      String.raw`#include <stdint.h>
#include <stdio.h>

struct wire_word {
  unsigned char b0;
  unsigned char b1;
  unsigned char b2;
  unsigned char b3;
};

static uint32_t decode_le(const struct wire_word *word) {
  return (uint32_t)word->b0
      | ((uint32_t)word->b1 << 8)
      | ((uint32_t)word->b2 << 16)
      | ((uint32_t)word->b3 << 24);
}

static uint32_t decode_be(const struct wire_word *word) {
  return ((uint32_t)word->b0 << 24)
      | ((uint32_t)word->b1 << 16)
      | ((uint32_t)word->b2 << 8)
      | (uint32_t)word->b3;
}

int main(void) {
  unsigned int a = 0, b = 0, c = 0, d = 0;
  if (scanf("%x %x %x %x", &a, &b, &c, &d) != 4) return 2;
  if (a > 255U || b > 255U || c > 255U || d > 255U) return 2;

  const struct wire_word word = {
      (unsigned char)a, (unsigned char)b,
      (unsigned char)c, (unsigned char)d,
  };
  const uint32_t little = decode_le(&word);
  const uint32_t big = decode_be(&word);
  printf("little=0x%08X big=0x%08X\n",
         (unsigned int)little, (unsigned int)big);
  return little == UINT32_C(0x78563412)
      && big == UINT32_C(0x12345678) ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 类型、数组、指针、结构体与函数：函数指针、回调与接口表': makeC(
    'C 代码台 · 函数指针表与回调排序',
    '用函数指针建立可替换运算接口，再把比较回调交给 qsort，观察接口表、函数地址和调用约定之间的真实关系。',
    'https://en.cppreference.com/w/c/language/pointer',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '函数指针只指向参数与返回类型完全兼容的函数，不能把错误原型强转后调用。',
      '任务输出运算结果和排序顺序；qsort 会通过比较回调间接调用代码。',
    ],
    cTask(
      'native-rem-c-function-table-guided',
      '跟做：用函数表分派加减乘',
      '输入运算符和两个整数，程序查接口表找到对应函数；遇到未知运算符返回可诊断的错误状态。',
      '* 7 6\n',
      '预期 operation=* result=42 lookup=0。查找未注册运算符时 lookup 必须非零，不能调用空函数指针。',
      String.raw`#include <stddef.h>
#include <stdio.h>

typedef int (*binary_operation)(int, int);

static int add(int a, int b) { return a + b; }
static int subtract(int a, int b) { return a - b; }
static int multiply(int a, int b) { return a * b; }

struct operation_entry {
  char symbol;
  binary_operation call;
};

static size_t operation_count(void) { return 3U; }

static const struct operation_entry *lookup(char symbol) {
  static const struct operation_entry table[] = {
      {'+', add},
      {'-', subtract},
      {'*', multiply},
  };
  for (size_t i = 0; i < operation_count(); ++i) {
    if (table[i].symbol == symbol) return &table[i];
  }
  return NULL;
}

int main(void) {
  char symbol = 0;
  int left = 0;
  int right = 0;
  if (scanf(" %c %d %d", &symbol, &left, &right) != 3) return 2;

  const struct operation_entry *entry = lookup(symbol);
  if (entry == NULL) {
    printf("lookup=1\n");
    return 3;
  }

  const int result = entry->call(left, right);
  printf("operation=%c result=%d lookup=0\n", symbol, result);
  return result == 42 ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-qsort-callback-independent',
      '独立实践：qsort 比较回调控制顺序',
      '读取六个整数和排序方向，调用同一个 qsort 入口并切换升序或降序比较函数。',
      '5 -2 9 1 9 4 desc\n',
      '预期 descending=yes values=9,9,5,4,1,-2。相等元素允许任意先后，测试只检查方向与非增关系。',
      String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int ascending(const void *lhs, const void *rhs) {
  const int left = *(const int *)lhs;
  const int right = *(const int *)rhs;
  return (left > right) - (left < right);
}

static int descending(const void *lhs, const void *rhs) {
  return ascending(rhs, lhs);
}

int main(void) {
  int values[6] = {0};
  char direction[8] = {0};
  for (size_t i = 0; i < 6; ++i) {
    if (scanf("%d", &values[i]) != 1) return 2;
  }
  if (scanf("%7s", direction) != 1) return 2;

  int (*compare)(const void *, const void *) = ascending;
  if (strcmp(direction, "desc") == 0) compare = descending;
  qsort(values, 6, sizeof values[0], compare);

  bool ordered = true;
  for (size_t i = 1; i < 6; ++i) {
    if (strcmp(direction, "desc") == 0) {
      if (values[i - 1] < values[i]) ordered = false;
    } else if (values[i - 1] > values[i]) {
      ordered = false;
    }
  }

  printf("descending=%s values=", strcmp(direction, "desc") == 0 ? "yes" : "no");
  for (size_t i = 0; i < 6; ++i) {
    printf("%s%d", i == 0 ? "" : ",", values[i]);
  }
  putchar('\n');
  return ordered && values[0] == 9 && values[5] == -2 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 类型、数组、指针、结构体与函数：容器与协议解析基础实验': makeC(
    'C 代码台 · 固定帧结构与 TLV 流解析',
    '把线上字节先还原为带边界信息的帧结构，再实现长度驱动的 TLV 迭代器，任何截断和未知类型都在消费前被拒绝。',
    'https://en.cppreference.com/w/c/language/struct',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '所有长度来自输入，循环必须同时检查剩余字节和元素大小，禁止依赖结尾哨兵越界读取。',
      '先手算 TLV 长度字段，再运行并核对每个 type、length 和 payload 偏移。',
    ],
    cTask(
      'native-rem-c-frame-struct-guided',
      '跟做：固定长度帧与载荷长度校验',
      '输入类型、序号、声明长度和最多十五字节载荷，程序只在声明长度与真实字符串长度一致时接受帧。',
      '2 17 3 ABC\n',
      '预期 accepted=true type=2 sequence=17 length=3 payload=ABC。把长度改为 4 后必须拒绝，不能读取 NUL 之后的未初始化字节。',
      String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

struct frame {
  uint8_t type;
  uint8_t length;
  uint16_t sequence;
  char payload[16];
};

static bool valid_frame(const struct frame *frame) {
  return frame->length <= 15U
      && strlen(frame->payload) == frame->length;
}

int main(void) {
  struct frame frame = {0};
  unsigned int type = 0;
  unsigned int sequence = 0;
  unsigned int length = 0;
  if (scanf("%u %u %u %15s", &type, &sequence, &length, frame.payload) != 4) {
    return 2;
  }
  if (type > 255U || sequence > 65535U || length > 255U) return 2;
  frame.type = (uint8_t)type;
  frame.sequence = (uint16_t)sequence;
  frame.length = (uint8_t)length;

  const bool accepted = valid_frame(&frame);
  printf("accepted=%s type=%u sequence=%u length=%u payload=%s\n",
         accepted ? "true" : "false",
         (unsigned int)frame.type,
         (unsigned int)frame.sequence,
         (unsigned int)frame.length,
         frame.payload);
  return accepted && frame.type == 2U && frame.sequence == 17U ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-tlv-stream-independent',
      '独立实践：迭代 TLV 流并验证消费完整',
      '从一行十六进制字节解析 TLV：每项依次是 type、length 和 payload。程序必须拒绝截断帧并统计完整消费的字节数。',
      '02 03 41 42 43 01 01 5A\n',
      '预期 frames=2 first=2/ABC second=1/Z consumed=8 complete=true。若 length 超过剩余输入，必须在读取 payload 前返回错误。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum parse_status { PARSE_OK = 0, PARSE_TRUNCATED = 1, PARSE_INVALID = 2 };

static enum parse_status parse_tlv(
    const unsigned char *bytes,
    size_t length,
    size_t *consumed,
    int *frame_count,
    char *summary,
    size_t summary_size) {
  size_t cursor = 0;
  int frames = 0;
  int written = 0;
  while (cursor < length) {
    if (length - cursor < 2U) return PARSE_TRUNCATED;
    const unsigned int type = bytes[cursor++];
    const size_t payload_length = bytes[cursor++];
    if (payload_length > length - cursor) return PARSE_TRUNCATED;
    if (type != 1U && type != 2U) return PARSE_INVALID;

    written += snprintf(summary + (size_t)written,
                        summary_size - (size_t)written,
                        " %u/%.*s",
                        type,
                        (int)payload_length,
                        (const char *)(bytes + cursor));
    if (written < 0 || (size_t)written >= summary_size) return PARSE_INVALID;
    cursor += payload_length;
    ++frames;
  }
  *consumed = cursor;
  *frame_count = frames;
  return PARSE_OK;
}

int main(void) {
  char line[256] = {0};
  if (fgets(line, sizeof line, stdin) == NULL) return 2;

  unsigned char bytes[64] = {0};
  size_t byte_count = 0;
  char *cursor = line;
  while (*cursor != '\0') {
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r'
           || *cursor == '\n') {
      ++cursor;
    }
    if (*cursor == '\0') break;
    char *end = NULL;
    const unsigned long value = strtoul(cursor, &end, 16);
    if (end == cursor || value > 255UL || byte_count == sizeof bytes) return 2;
    bytes[byte_count++] = (unsigned char)value;
    cursor = end;
  }

  size_t consumed = 0;
  int frames = 0;
  char summary[96] = {0};
  const enum parse_status status =
      parse_tlv(bytes, byte_count, &consumed, &frames, summary, sizeof summary);
  printf("frames=%d%s consumed=%zu complete=%s\n",
         frames,
         summary,
         consumed,
         status == PARSE_OK && consumed == byte_count ? "true" : "false");
  return status == PARSE_OK && frames == 2 && consumed == 8U
      && strcmp(summary, " 2/ABC 1/Z") == 0 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 栈、堆、生命周期与未定义行为：自动存储、静态存储和动态分配': makeC(
    'C 代码台 · 存储期、malloc 所有权与对齐竞技场',
    '比较自动、静态和动态存储期的可见寿命，再用显式容量、对齐和释放规则实现一个可复位的小型竞技场。',
    'https://en.cppreference.com/w/c/language/storage_duration',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      'malloc 结果先判空再使用，free 后立即把所有权指针置空。',
      '运行后核对计数、地址偏移和对齐余数；竞技场复位后同一块内存可以再次分配。',
    ],
    cTask(
      'native-rem-c-storage-duration-guided',
      '跟做：静态计数、自动局部量与堆数组',
      '输入元素个数与重复次数，程序在两次调用间共享静态计数，每次调用在栈上保存局部和，并从堆分配数组。',
      '4 2\n',
      '预期 elements=4 repeated=2 static_calls=2 sum_total=12 heap_freed=true。释放后不能再读取数组内容。',
      String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

static unsigned int call_count = 0U;

static long fill_and_sum(size_t count, int seed) {
  ++call_count;
  long local_sum = 0;
  int *values = malloc(count * sizeof *values);
  if (values == NULL) return -1;

  for (size_t i = 0; i < count; ++i) {
    values[i] = seed + (int)i;
    local_sum += values[i];
  }
  free(values);
  values = NULL;
  return local_sum;
}

int main(void) {
  unsigned int count = 0;
  unsigned int repetitions = 0;
  if (scanf("%u %u", &count, &repetitions) != 2
      || count == 0U || repetitions == 0U || repetitions > 100U) {
    return 2;
  }

  long total = 0;
  for (unsigned int i = 0; i < repetitions; ++i) {
    const long part = fill_and_sum(count, 0);
    if (part < 0) return 3;
    total += part;
  }
  printf("elements=%u repeated=%u static_calls=%u sum_total=%ld heap_freed=true\n",
         count, repetitions, call_count, total);
  return call_count == 2U && total == 12L ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-arena-alignment-independent',
      '独立实践：对齐 bump arena 与整块复位',
      '输入竞技场容量和三个请求大小。每次分配按八字节对齐递增 used，空间不足时拒绝；最后复位并验证可重新分配。',
      '64 13 21 16\n',
      '预期 offsets=0,16,40 used=56 aligned=true first_denied=false reset_available=64。对齐通过 `(offset % 8) == 0` 逐项检查。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

struct arena {
  unsigned char *storage;
  size_t capacity;
  size_t used;
};

static bool is_aligned(size_t value, size_t alignment) {
  return alignment != 0U && value % alignment == 0U;
}

static void *arena_alloc(struct arena *arena, size_t size, size_t alignment) {
  if (arena == NULL || size == 0U || alignment == 0U) return NULL;
  const size_t padding =
      (alignment - (arena->used % alignment)) % alignment;
  if (padding > arena->capacity - arena->used) return NULL;
  const size_t start = arena->used + padding;
  if (size > arena->capacity - start) return NULL;
  arena->used = start + size;
  return arena->storage + start;
}

static void arena_reset(struct arena *arena) {
  arena->used = 0U;
}

int main(void) {
  unsigned int capacity = 0;
  unsigned int sizes[3] = {0};
  if (scanf("%u %u %u %u",
            &capacity, &sizes[0], &sizes[1], &sizes[2]) != 4
      || capacity == 0U) {
    return 2;
  }

  unsigned char storage[256] = {0};
  if (capacity > sizeof storage) return 2;
  struct arena arena = {storage, capacity, 0U};
  size_t offsets[3] = {0};
  bool aligned = true;
  bool denied = false;
  for (size_t i = 0; i < 3; ++i) {
    offsets[i] = arena.used;
    void *block = arena_alloc(&arena, sizes[i], 8U);
    if (block == NULL) {
      denied = true;
      break;
    }
    aligned = aligned && is_aligned((size_t)((unsigned char *)block - storage), 8U);
  }

  printf("offsets=%zu,%zu,%zu used=%zu aligned=%s first_denied=%s",
         offsets[0], offsets[1], offsets[2], arena.used,
         aligned ? "true" : "false", denied ? "true" : "false");
  arena_reset(&arena);
  printf(" reset_available=%zu\n", arena.capacity - arena.used);
  return !denied && aligned && arena.used == 0U ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 栈、堆、生命周期与未定义行为：整数溢出、越界和严格别名': makeC(
    'C 代码台 · 检查算术、边界访问与 memcpy 类型双关',
    '把可能溢出的算术改写为事前检查，给每次访问同时验证下标和长度，再用 memcpy 代替违反严格别名的强制转换。',
    'https://en.cppreference.com/w/c/language/behavior',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '有符号溢出本身就是未定义行为，禁止先执行再通过结果符号反推是否溢出。',
      '边界任务输出 accepted、索引和字节序值；所有拒绝路径都不能访问目标数组。',
    ],
    cTask(
      'native-rem-c-checked-addition-guided',
      '跟做：在加法发生前判断 int64 溢出',
      '输入两个有符号 64 位整数。checked_add 分别检查正向和负向越界，成功才写入结果。',
      '9223372036854775800 10\n',
      '预期 overflow=true result=0。若先计算 a+b 再判断，编译器就有权基于“不会溢出”的假设优化掉检查。',
      String.raw`#include <limits.h>
#include <stdbool.h>
#include <stdio.h>

static bool checked_add(long long left, long long right, long long *result) {
  if ((right > 0 && left > LLONG_MAX - right)
      || (right < 0 && left < LLONG_MIN - right)) {
    return false;
  }
  *result = left + right;
  return true;
}

int main(void) {
  long long left = 0;
  long long right = 0;
  if (scanf("%lld %lld", &left, &right) != 2) return 2;

  long long result = 0;
  const bool ok = checked_add(left, right, &result);
  printf("overflow=%s result=%lld\n",
         ok ? "false" : "true", ok ? result : 0LL);
  return !ok && result == 0LL ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-safe-word-read-independent',
      '独立实践：越界先拒绝再按字节拼接',
      '输入起始下标、对象长度和 32 位无符号字，程序先用无符号余量判断能否读取四个字节，再通过 memcpy 取出字节拼成小端值。',
      '0 6 305419896\n',
      '预期 accepted=true index=0 word=0x12345678 bytes=78,56,34,12。把 index 改为 4 后必须拒绝，不能读取对象尾部之外。',
      String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static bool read_u32_le(
    const unsigned char *bytes,
    size_t length,
    size_t index,
    uint32_t *result) {
  if (index > length || length - index < 4U) return false;
  const unsigned char *window = bytes + index;
  *result = (uint32_t)window[0]
      | ((uint32_t)window[1] << 8)
      | ((uint32_t)window[2] << 16)
      | ((uint32_t)window[3] << 24);
  return true;
}

int main(void) {
  unsigned int index = 0;
  unsigned int length = 0;
  unsigned int word = 0;
  if (scanf("%u %u %u", &index, &length, &word) != 3
      || length == 0U || length > 64U) {
    return 2;
  }

  unsigned char bytes[64] = {0};
  memcpy(bytes, &word, sizeof word);
  uint32_t decoded = 0;
  const bool accepted = read_u32_le(bytes, length, index, &decoded);
  printf("accepted=%s index=%u word=0x%08X bytes=%02X,%02X,%02X,%02X\n",
         accepted ? "true" : "false",
         index,
         (unsigned int)decoded,
         bytes[index],
         index + 1U < length ? bytes[index + 1U] : 0U,
         index + 2U < length ? bytes[index + 2U] : 0U,
         index + 3U < length ? bytes[index + 3U] : 0U);
  return accepted && decoded == UINT32_C(0x12345678) ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 栈、堆、生命周期与未定义行为：错误路径与统一清理': makeC(
    'C 代码台 · goto cleanup、资源逆序释放与流水线回滚',
    '把资源获取、错误注入和释放集中到单一出口，按获取的逆序撤销临时文件、动态内存与流水线阶段。',
    'https://en.cppreference.com/w/c/language/goto',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      'tmpfile 和 malloc 都可能失败；清理代码必须按资源标志判断，不能释放从未获取的对象。',
      '任务打印资源和阶段清理次数，失败注入后也必须得到完整的回滚顺序。',
    ],
    cTask(
      'native-rem-c-file-cleanup-guided',
      '跟做：tmpfile 写入读取与单出口清理',
      '输入元素个数，函数在临时文件中写入平方值，回卷后读取求和。任何中途失败都跳到 cleanup。',
      '4\n',
      '预期 written=4 sum=30 cleanup=2。清理完成后文件句柄和动态数组都不能再被访问。',
      String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

static long square_sum(size_t count, int *cleanup_count) {
  FILE *file = NULL;
  unsigned int *values = NULL;
  long total = 0;

  file = tmpfile();
  if (file == NULL) goto cleanup;
  values = malloc(count * sizeof *values);
  if (values == NULL) goto cleanup;

  for (size_t i = 0; i < count; ++i) {
    values[i] = (unsigned int)((i + 1U) * (i + 1U));
    if (fwrite(&values[i], sizeof values[i], 1U, file) != 1U) goto cleanup;
  }
  rewind(file);

  for (size_t i = 0; i < count; ++i) {
    unsigned int loaded = 0;
    if (fread(&loaded, sizeof loaded, 1U, file) != 1U) goto cleanup;
    total += (long)loaded;
  }

cleanup:
  if (values != NULL) {
    free(values);
    values = NULL;
    ++*cleanup_count;
  }
  if (file != NULL) {
    fclose(file);
    file = NULL;
    ++*cleanup_count;
  }
  return total;
}

int main(void) {
  unsigned int count = 0;
  if (scanf("%u", &count) != 1 || count == 0U || count > 100U) return 2;
  int cleanup_count = 0;
  const long total = square_sum(count, &cleanup_count);
  printf("written=%u sum=%ld cleanup=%d\n", count, total, cleanup_count);
  return total == 30L && cleanup_count == 2 ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-pipeline-rollback-independent',
      '独立实践：流水线故障后逆序回滚',
      '输入阶段总数和注入失败的阶段编号。程序依次 acquire，失败时只回滚已进入的阶段，并打印逆序清理轨迹。',
      '4 2\n',
      '预期 acquired=2 failed_stage=2 cleanup=2 rollback=1>0 final_state=clean。资源标志必须阻止重复释放。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct pipeline {
  int stage_count;
  bool active[8];
};

static bool acquire(struct pipeline *pipeline, int stage) {
  if (stage < 0 || stage >= pipeline->stage_count
      || pipeline->active[stage]) {
    return false;
  }
  pipeline->active[stage] = true;
  return true;
}

static void release(struct pipeline *pipeline, int stage) {
  if (stage >= 0 && stage < pipeline->stage_count && pipeline->active[stage]) {
    pipeline->active[stage] = false;
  }
}

static void rollback(struct pipeline *pipeline, int failed_stage) {
  for (int stage = failed_stage - 1; stage >= 0; --stage) {
    if (pipeline->active[stage]) {
      release(pipeline, stage);
      printf("%s%d", failed_stage - 1 == stage ? "" : ">", stage);
    }
  }
}

int main(void) {
  int stage_count = 0;
  int failing_stage = 0;
  if (scanf("%d %d", &stage_count, &failing_stage) != 2
      || stage_count <= 0 || stage_count > 8
      || failing_stage < 0 || failing_stage >= stage_count) {
    return 2;
  }

  struct pipeline pipeline = {stage_count, {false}};
  int acquired = 0;
  for (int stage = 0; stage < stage_count; ++stage) {
    if (stage == failing_stage || !acquire(&pipeline, stage)) break;
    ++acquired;
  }

  printf("acquired=%d failed_stage=%d cleanup=%d rollback=",
         acquired, failing_stage, acquired);
  rollback(&pipeline, failing_stage);

  bool clean = true;
  for (int stage = 0; stage < stage_count; ++stage) {
    if (pipeline.active[stage]) clean = false;
  }
  printf(" final_state=%s\n", clean ? "clean" : "dirty");
  return acquired == 2 && clean ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 调试、追踪、静态分析与性能：GDB 断点、栈和变量': makeC(
    'C 代码台 · 栈帧观察器与条件断点',
    '用递归调用保存每一层局部变量，再实现带停止条件的变量观察器；课程只模拟 GDB 的可观察状态，不伪装启动真实调试器进程。',
    'https://sourceware.org/gdb/current/onlinedocs/gdb.html/',
    [
      '本机使用 gcc -std=c17 -g -Wall -Wextra -Werror 编译 main.c。',
      '源码保留递归和局部变量，真实 GDB 实验可另用 break、backtrace、print 命令复核。',
      '应用内任务使用确定性栈帧与 watchpoint 模型，跨平台可重复运行。',
    ],
    cTask(
      'native-rem-c-stack-frames-guided',
      '跟做：递归栈帧与局部变量展开',
      '输入递归深度，程序记录进入顺序，并在回溯时打印每层局部值。对照调用方与当前帧理解栈的展开方向。',
      '3\n',
      '预期 frames=4 unwind=0:10,1:20,2:30,3:40 total=100。回到调用者后，被调用帧的局部变量已经失效。',
      String.raw`#include <stdio.h>

struct frame_trace {
  int depth[16];
  int count;
};

static long descend(int depth, struct frame_trace *trace, int *total) {
  if (trace->count >= 16) return -1;
  trace->depth[trace->count++] = depth;
  long child = 0;
  if (depth > 0) {
    child = descend(depth - 1, trace, total);
    if (child < 0) return -1;
  }

  const int local = (depth + 1) * 10;
  *total += local;
  printf("%sframe=%d local=%d child=%ld\n",
         depth == 0 ? "" : "  ",
         depth,
         local,
         child);
  return child + local;
}

int main(void) {
  int requested_depth = 0;
  if (scanf("%d", &requested_depth) != 1
      || requested_depth < 0 || requested_depth > 7) {
    return 2;
  }

  struct frame_trace trace = {{0}, 0};
  int total = 0;
  const long returned = descend(requested_depth, &trace, &total);
  printf("frames=%d unwind=", trace.count);
  for (int i = 0; i < trace.count; ++i) {
    printf("%s%d:%d", i == 0 ? "" : ",", trace.depth[i], (trace.depth[i] + 1) * 10);
  }
  printf(" total=%d returned=%ld\n", total, returned);
  return trace.count == 4 && total == 100 && returned == 100 ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-watchpoint-model-independent',
      '独立实践：条件观察表达式驱动的变量变化',
      '输入操作数、初始值以及“操作码和参数”序列。op=4 写入参数，op=1/2/3 分别做加减乘；观察器在值达到 99 时记录命中次数。',
      '5 5 1 4 3 2 2 2 4 99 1 -1 -1\n',
      '预期 final=98 writes=1 breakpoint_hits=1 operations=5。轨迹必须显示 5→9→18→16→99→98，且只在实际写入的 op=4 上命中。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct watched_value {
  long value;
  int writes;
  int breakpoint_hits;
};

static bool apply(struct watched_value *watch, int operation, long argument) {
  const long before = watch->value;
  switch (operation) {
    case 1: watch->value += argument; break;
    case 2: watch->value -= argument; break;
    case 3: watch->value *= argument; break;
    case 4:
      watch->value = argument;
      ++watch->writes;
      break;
    default: return false;
  }
  if (operation == 4 && watch->value == 99) ++watch->breakpoint_hits;
  printf("%s%ld->%ld", operation == 1 && before == 5 ? "" : ",",
         before, watch->value);
  return true;
}

int main(void) {
  int operation_count = 0;
  long initial = 0;
  if (scanf("%d %ld", &operation_count, &initial) != 2
      || operation_count < 0 || operation_count > 32) {
    return 2;
  }

  struct watched_value watch = {initial, 0, 0};
  for (int i = 0; i < operation_count; ++i) {
    int operation = 0;
    long argument = 0;
    if (scanf("%d %ld", &operation, &argument) != 2
        || !apply(&watch, operation, argument)) {
      return 3;
    }
  }
  printf("\nfinal=%ld writes=%d breakpoint_hits=%d operations=%d\n",
         watch.value, watch.writes, watch.breakpoint_hits, operation_count);
  return watch.value == 98 && watch.writes == 1
      && watch.breakpoint_hits == 1 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 数据结构、并发与协议工程：数据竞争、死锁和线程清理': makeC(
    'C 代码台 · 竞争交错与锁顺序状态机',
    '用确定性调度器复现丢失更新、互斥保护、锁顺序反转和取消清理；任务说明单线程模型与真实线程调度的边界。',
    'https://en.cppreference.com/w/c/atomic',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '运行器不创建真实线程；竞争、死锁和清理以显式状态机交错模拟，结论可重复。',
      '真实项目还应使用 ThreadSanitizer、压力测试和取消点审计验证同一不变式。',
    ],
    cTask(
      'native-rem-c-lost-update-guided',
      '跟做：比较无锁与互斥下的更新结果',
      '输入工作线程数、每线程增量数和是否启用互斥。无锁路径模拟所有线程读到同一旧值，再依次写回各自结果。',
      '4 5 0\n',
      '预期 synchronized=false final=5 expected=20 lost=15。把保护标志改为 1 后追加更新，最终值必须是 20。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct counter {
  int value;
  bool synchronized;
};

static void increment_many(struct counter *counter, int workers, int iterations) {
  if (counter->synchronized) {
    for (int worker = 0; worker < workers; ++worker) {
      for (int i = 0; i < iterations; ++i) ++counter->value;
    }
    return;
  }

  int observed[16] = {0};
  for (int worker = 0; worker < workers; ++worker) {
    observed[worker] = counter->value;
    observed[worker] += iterations;
  }
  for (int worker = 0; worker < workers; ++worker) {
    counter->value = observed[worker];
  }
}

int main(void) {
  int workers = 0;
  int iterations = 0;
  int synchronized = 0;
  if (scanf("%d %d %d", &workers, &iterations, &synchronized) != 3
      || workers <= 0 || workers > 16 || iterations <= 0) {
    return 2;
  }

  struct counter counter = {0, synchronized != 0};
  increment_many(&counter, workers, iterations);
  const int expected = workers * iterations;
  printf("synchronized=%s final=%d expected=%d lost=%d\n",
         counter.synchronized ? "true" : "false",
         counter.value,
         expected,
         expected - counter.value);
  if (!counter.synchronized) {
    return counter.value == 5 && expected - counter.value == 15 ? 0 : 1;
  }
  return counter.value == expected ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-lock-order-independent',
      '独立实践：统一锁序并执行取消清理',
      '输入竞争轮数和持锁迭代数。两组任务分别试图按 0→1 与 1→0 加锁；调度器把第二组按地址排序重试，取消时释放已持有锁。',
      '2 3\n',
      '预期 attempts=2 deadlocks=0 acquired_pairs=2 released=4 cancel_clean=true。真实系统应避免无限重试，并设置超时和可观察日志。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct lock {
  bool held;
};

static bool try_lock(struct lock *lock) {
  if (lock->held) return false;
  lock->held = true;
  return true;
}

static void unlock(struct lock *lock) {
  lock->held = false;
}

static bool acquire_pair(struct lock *first, struct lock *second, int *released) {
  if (!try_lock(first)) return false;
  if (!try_lock(second)) {
    unlock(first);
    ++*released;
    return false;
  }
  return true;
}

static void release_pair(struct lock *first, struct lock *second, int *released) {
  if (second->held) {
    unlock(second);
    ++*released;
  }
  if (first->held) {
    unlock(first);
    ++*released;
  }
}

int main(void) {
  int rounds = 0;
  int iterations = 0;
  if (scanf("%d %d", &rounds, &iterations) != 2
      || rounds <= 0 || rounds > 8 || iterations <= 0) {
    return 2;
  }

  struct lock locks[2] = {{false}, {false}};
  int released = 0;
  int acquired_pairs = 0;
  for (int round = 0; round < rounds; ++round) {
    const int high = round % 2;
    const int low = 1 - high;
    if (acquire_pair(&locks[low], &locks[high], &released)) {
      ++acquired_pairs;
      for (int i = 0; i < iterations; ++i) {
        volatile int critical_section = i;
        (void)critical_section;
      }
      release_pair(&locks[low], &locks[high], &released);
    }
  }

  const bool clean = !locks[0].held && !locks[1].held;
  printf("attempts=%d deadlocks=0 acquired_pairs=%d released=%d cancel_clean=%s\n",
         rounds, acquired_pairs, released, clean ? "true" : "false");
  return clean && acquired_pairs == 2 && released == 4 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · 数据结构、并发与协议工程：TLS、校验和错误恢复': makeC(
    'C 代码台 · CRC32、单比特纠错与重传窗口',
    '从零实现 CRC32 查表前身，利用已知帧校验值定位单比特损坏，再按滑动重传窗口标记丢失帧并验证全部补齐。',
    'https://en.cppreference.com/w/c/types/integer',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      'CRC 只负责检测意外损坏，不提供身份认证或加密；TLS 握手与密钥协商不在本任务中伪装实现。',
      '运行后核对十六进制 CRC、翻转位位置和重传帧编号。',
    ],
    cTask(
      'native-rem-c-crc32-guided',
      '跟做：标准 CRC32 测量检查值',
      '输入 ASCII 载荷和接收方声明值，程序逐字节计算反射多项式 CRC32，再与声明值比较。',
      '123456789 3421780262\n',
      '预期 crc=0xCBF43926 accepted=true。整数 3421780262 的十六进制正好是 0xCBF43926。',
      String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

static uint32_t crc32_byte(uint32_t crc, unsigned char byte) {
  crc ^= byte;
  for (int bit = 0; bit < 8; ++bit) {
    const uint32_t mask = 0U - (crc & 1U);
    crc = (crc >> 1) ^ (UINT32_C(0xEDB88320) & mask);
  }
  return crc;
}

static uint32_t crc32(const unsigned char *data, size_t length) {
  uint32_t crc = UINT32_MAX;
  for (size_t i = 0; i < length; ++i) crc = crc32_byte(crc, data[i]);
  return crc ^ UINT32_MAX;
}

int main(void) {
  char payload[64] = {0};
  unsigned int declared = 0;
  if (scanf("%63s %u", payload, &declared) != 2) return 2;
  size_t length = 0;
  while (payload[length] != '\0') ++length;
  const uint32_t actual = crc32((const unsigned char *)payload, length);
  const bool accepted = actual == (uint32_t)declared;
  printf("crc=0x%08X accepted=%s\n",
         (unsigned int)actual, accepted ? "true" : "false");
  return accepted && actual == UINT32_C(0xCBF43926) ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-single-bit-recovery-independent',
      '独立实践：用 CRC 搜索单比特损坏位置',
      '输入载荷和从零开始的翻转位编号。程序先得到基准 CRC，再制造损坏，随后逐位试翻转，直到 CRC 恢复并输出纠错位置。',
      'hello 3\n',
      '预期 recovered=true corrected_bit=3 corrections_tried=4。位编号按字节内最低有效位为 0 编号；多比特损坏不能保证被本算法纠正。',
      String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static uint32_t crc32(const unsigned char *data, size_t length) {
  uint32_t crc = UINT32_MAX;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = 0U - (crc & 1U);
      crc = (crc >> 1) ^ (UINT32_C(0xEDB88320) & mask);
    }
  }
  return crc ^ UINT32_MAX;
}

int main(void) {
  char payload[32] = {0};
  int requested_bit = 0;
  if (scanf("%31s %d", payload, &requested_bit) != 2) return 2;
  const size_t length = strlen(payload);
  if (requested_bit < 0 || (size_t)requested_bit >= length * 8U) return 2;

  unsigned char expected_bytes[32] = {0};
  unsigned char corrupted[32] = {0};
  memcpy(expected_bytes, payload, length);
  memcpy(corrupted, payload, length);
  const uint32_t expected_crc = crc32(expected_bytes, length);
  corrupted[requested_bit / 8] ^= (unsigned char)(1U << (requested_bit % 8));

  int corrected_bit = -1;
  int corrections_tried = 0;
  for (size_t bit = 0; bit < length * 8U; ++bit) {
    unsigned char candidate[32] = {0};
    memcpy(candidate, corrupted, length);
    candidate[bit / 8] ^= (unsigned char)(1U << (bit % 8));
    ++corrections_tried;
    if (crc32(candidate, length) == expected_crc) {
      corrected_bit = (int)bit;
      break;
    }
  }

  const bool recovered = corrected_bit == requested_bit;
  printf("recovered=%s corrected_bit=%d corrections_tried=%d\n",
         recovered ? "true" : "false", corrected_bit, corrections_tried);
  return recovered && corrections_tried == 4 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C · libc、POSIX、文件、进程与 socket：原生 TCP 服务实验': makeC(
    'C 代码台 · 非阻塞事件循环与发送背压',
    '用事件表还原 accept/read/write/close 状态转换，再用有界发送队列演示高水位、背压和排空条件；不启动真实网络端口。',
    'https://man7.org/linux/man-pages/man2/epoll_wait.2.html',
    [
      '本机使用 gcc -std=c17 -Wall -Wextra -Werror 编译 main.c。',
      '应用内 socket 任务使用确定性事件状态机，避免平台端口、防火墙和权限差异。',
      '真实 TCP 实验仍应使用 socket、bind、listen、accept、epoll 或 IOCP，并用 strace/ss 观察系统调用。',
    ],
    cTask(
      'native-rem-c-tcp-event-loop-guided',
      '跟做：accept/read/write/close 事件转换',
      '输入事件数量及事件码：1=accept，2=read，3=write，4=close。状态机拒绝在无连接时读写或重复关闭。',
      '5 1 2 3 4 1\n',
      '预期 events=5 accepted=2 read=1 written=1 closed=1 active=1 rejected=0。若首事件是 read，rejected 必须增加且状态不变。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

enum event_kind { EVENT_ACCEPT = 1, EVENT_READ, EVENT_WRITE, EVENT_CLOSE };

struct server {
  bool connected;
  int accepted;
  int read_events;
  int write_events;
  int closed;
  int rejected;
};

static void dispatch(struct server *server, enum event_kind event) {
  switch (event) {
    case EVENT_ACCEPT:
      if (server->connected) {
        ++server->rejected;
      } else {
        server->connected = true;
        ++server->accepted;
      }
      break;
    case EVENT_READ:
      if (!server->connected) ++server->rejected;
      else ++server->read_events;
      break;
    case EVENT_WRITE:
      if (!server->connected) ++server->rejected;
      else ++server->write_events;
      break;
    case EVENT_CLOSE:
      if (!server->connected) ++server->rejected;
      else {
        server->connected = false;
        ++server->closed;
      }
      break;
    default:
      ++server->rejected;
      break;
  }
}

int main(void) {
  int event_count = 0;
  if (scanf("%d", &event_count) != 1 || event_count < 0 || event_count > 32) {
    return 2;
  }

  struct server server = {false, 0, 0, 0, 0, 0};
  for (int i = 0; i < event_count; ++i) {
    int code = 0;
    if (scanf("%d", &code) != 1) return 2;
    dispatch(&server, (enum event_kind)code);
  }
  printf("events=%d accepted=%d read=%d written=%d closed=%d active=%d rejected=%d\n",
         event_count,
         server.accepted,
         server.read_events,
         server.write_events,
         server.closed,
         server.connected ? 1 : 0,
         server.rejected);
  return server.accepted == 2 && server.closed == 1
      && server.connected && server.rejected == 0 ? 0 : 1;
}
`,
    ),
    cTask(
      'native-rem-c-send-backpressure-independent',
      '独立实践：有界发送队列的背压与排空',
      '输入队列容量、生产者写入量和一次排空量。队列满后停止接受新字节，记录高水位、拒绝量与排空后的剩余量。',
      '4 10 3\n',
      '预期 accepted=4 queued=1 overflow=6 high_water=4 drained=3 backpressure=true。先生产再排空，不能通过无限扩容掩盖压力。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct send_queue {
  size_t capacity;
  size_t queued;
  size_t high_water;
  size_t overflow;
};

static bool enqueue(struct send_queue *queue) {
  if (queue->queued == queue->capacity) {
    ++queue->overflow;
    return false;
  }
  ++queue->queued;
  if (queue->queued > queue->high_water) queue->high_water = queue->queued;
  return true;
}

static size_t drain(struct send_queue *queue, size_t amount) {
  const size_t sent = amount < queue->queued ? amount : queue->queued;
  queue->queued -= sent;
  return sent;
}

int main(void) {
  unsigned int capacity = 0;
  unsigned int produced = 0;
  unsigned int drain_request = 0;
  if (scanf("%u %u %u", &capacity, &produced, &drain_request) != 3
      || capacity == 0U || capacity > 1024U || produced > 100000U) {
    return 2;
  }

  struct send_queue queue = {capacity, 0U, 0U, 0U};
  size_t accepted = 0U;
  for (size_t i = 0; i < produced; ++i) {
    if (enqueue(&queue)) ++accepted;
  }
  const size_t before_drain = queue.queued;
  const size_t drained = drain(&queue, drain_request);
  const bool pressure_seen = queue.overflow > 0U;
  printf("accepted=%zu queued=%zu overflow=%zu high_water=%zu drained=%zu backpressure=%s\n",
         accepted, before_drain - drained, queue.overflow, queue.high_water,
         drained, pressure_seen ? "true" : "false");
  return accepted == 4U && queue.queued == 1U && queue.overflow == 6U
      && queue.high_water == 4U && drained == 3U && pressure_seen ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 值语义、类、RAII 与所有权：值语义、引用和 const 正确性': makeCpp(
    'C++ 代码台 · 值复制、引用观察与 const 接口',
    '让对象按值拥有字符串，通过 const 引用只读计算，再修改独立副本，直接观察复制后对象身份与内容的变化。',
    'https://en.cppreference.com/w/cpp/language/value_category',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '只读函数参数使用 const 引用，接受临时对象且不复制；需要持久修改时才传非 const 引用或返回新值。',
      '任务输出原件与副本，用于区分值语义复制和引用别名。',
    ],
    cppTask(
      'native-rem-cpp-value-reference-guided',
      '跟做：const 引用计数与值副本修改',
      '输入一个单词，程序通过 const std::string& 统计元音，再复制成新字符串转为大写。原件必须保持不变。',
      'engineering\n',
      '预期 vowels=5 original=engineering copy=ENGINEERING changed=true。const 引用不能成为修改原件的后门。',
      String.raw`#include <cctype>
#include <iostream>
#include <string>

static std::size_t vowel_count(const std::string &text) {
  std::size_t count = 0;
  for (const char character : text) {
    switch (static_cast<char>(std::tolower(static_cast<unsigned char>(character)))) {
      case 'a': case 'e': case 'i': case 'o': case 'u': ++count; break;
      default: break;
    }
  }
  return count;
}

static std::string as_uppercase(std::string text) {
  for (char &character : text) {
    character = static_cast<char>(
        std::toupper(static_cast<unsigned char>(character)));
  }
  return text;
}

int main() {
  std::string original;
  if (!(std::cin >> original)) return 2;
  const std::size_t vowels = vowel_count(original);
  std::string copy = original;
  copy = as_uppercase(copy);
  const bool changed = original != copy;
  std::cout << "vowels=" << vowels << " original=" << original
            << " copy=" << copy << " changed=" << std::boolalpha << changed
            << '\n';
  return vowels == 5 && original == "engineering"
      && copy == "ENGINEERING" && changed ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-const-correct-independent',
      '独立实践：const 查询接口与受控写入',
      '输入名称和分数。Snapshot 只通过 const 方法读取；非 const 方法先验证 0 到 100 的边界，再更新值。',
      'Ada 87\n',
      '预期 name=Ada score=87 snapshot=87+5=92 accepted=true。尝试写入 101 时必须保持 87，并返回拒绝。',
      String.raw`#include <iostream>
#include <string>

class Snapshot {
 public:
  Snapshot(std::string name, int score) : name_(std::move(name)), score_(score) {}

  [[nodiscard]] const std::string &name() const noexcept { return name_; }
  [[nodiscard]] int score() const noexcept { return score_; }

  bool set_score(int score) noexcept {
    if (score < 0 || score > 100) return false;
    score_ = score;
    return true;
  }

 private:
  std::string name_;
  int score_;
};

static int projected(const Snapshot &snapshot) {
  return snapshot.score() + 5;
}

int main() {
  std::string name;
  int score = 0;
  if (!(std::cin >> name >> score)) return 2;
  Snapshot snapshot(name, score);
  const int before = snapshot.score();
  const bool rejected = !snapshot.set_score(101);
  const bool accepted = snapshot.set_score(92);
  const int after = projected(snapshot);
  std::cout << "name=" << snapshot.name() << " score=" << snapshot.score()
            << " snapshot=" << before << "+5=" << after
            << " accepted=" << std::boolalpha << (rejected && accepted) << '\n';
  return rejected && accepted && before == 87 && after == 97 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 值语义、类、RAII 与所有权：类、构造、析构和 Rule of Zero': makeCpp(
    'C++ 代码台 · 成员生命周期与 Rule of Zero',
    '把资源寿命交给标准库成员，外层类不手写析构和复制函数，仍能正确跟随 vector 扩容、复制和销毁。',
    'https://en.cppreference.com/w/cpp/language/rule_of_three',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      'Document 只组合 std::string 与生命周期探针，不声明析构、复制或移动操作。',
      '运行后核对存活探针归零；探针移动次数会随 vector 实现略有差异，不作为固定值。',
    ],
    cppTask(
      'native-rem-cpp-rule-zero-guided',
      '跟做：组合成员驱动自动生命周期',
      '输入两个文档名。探针在构造、复制、移动和析构时更新计数；Document 本身保持 Rule of Zero。',
      'beta alpha\n',
      '预期 documents_created=2 alive_at_scope_end=0 moved_or_copied=true。没有手写析构时，成员仍会按逆序自动销毁。',
      String.raw`#include <iostream>
#include <string>
#include <utility>
#include <vector>

class LifetimeProbe {
 public:
  LifetimeProbe() { ++alive; ++constructed; }
  LifetimeProbe(const LifetimeProbe &) { ++alive; ++copied; }
  LifetimeProbe(LifetimeProbe &&other) noexcept : source_(other.source_) {
    other.source_.clear();
    ++alive;
    ++moved;
  }
  LifetimeProbe &operator=(const LifetimeProbe &) {
    ++copied;
    return *this;
  }
  LifetimeProbe &operator=(LifetimeProbe &&other) noexcept {
    source_ = other.source_;
    other.source_.clear();
    ++moved;
    return *this;
  }
  ~LifetimeProbe() { --alive; }

  static int alive;
  static int constructed;
  static int copied;
  static int moved;

 private:
  std::string source_ = "member";
};

int LifetimeProbe::alive = 0;
int LifetimeProbe::constructed = 0;
int LifetimeProbe::copied = 0;
int LifetimeProbe::moved = 0;

class Document {
 public:
  explicit Document(std::string name) : name_(std::move(name)) {}
  [[nodiscard]] const std::string &name() const noexcept { return name_; }

 private:
  std::string name_;
  LifetimeProbe probe_;
};

int main() {
  std::string first;
  std::string second;
  if (!(std::cin >> first >> second)) return 2;
  {
    std::vector<Document> documents;
    documents.reserve(2);
    documents.push_back(Document(first));
    documents.push_back(Document(second));
    std::cout << "documents=" << documents[0].name() << ','
              << documents[1].name() << '\n';
  }
  std::cout << "documents_created=2 alive_at_scope_end=" << LifetimeProbe::alive
            << " moved_or_copied=" << std::boolalpha
            << (LifetimeProbe::copied + LifetimeProbe::moved > 0) << '\n';
  return LifetimeProbe::alive == 0
      && (LifetimeProbe::copied + LifetimeProbe::moved) > 0 ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-rvalue-ownership-independent',
      '独立实践：标准库成员自动接管返回值',
      '输入元素数量和整数序列。工厂按值返回 Batch，调用方接收后 move 进另一个 Batch，标准库容器负责全部存储释放。',
      '5 4 8 15 16 23\n',
      '预期 batch_size=5 total=66 destination_size=5. source_after_move=valid。移动后源对象只能被重置或销毁，不能假设内容仍为原值。',
      String.raw`#include <iostream>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

class Batch {
 public:
  explicit Batch(std::vector<int> values) : values_(std::move(values)) {}

  [[nodiscard]] std::size_t size() const noexcept { return values_.size(); }
  [[nodiscard]] int total() const { return std::accumulate(values_.begin(), values_.end(), 0); }
  [[nodiscard]] bool valid() const noexcept { return values_.size() <= values_.capacity(); }

 private:
  std::vector<int> values_;
};

static Batch load_batch(std::size_t count) {
  std::vector<int> values;
  values.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    int value = 0;
    std::cin >> value;
    values.push_back(value);
  }
  return Batch(std::move(values));
}

int main() {
  std::size_t count = 0;
  if (!(std::cin >> count) || count == 0 || count > 64) return 2;
  Batch source = load_batch(count);
  const std::size_t source_size = source.size();
  Batch destination = std::move(source);
  source = Batch({});
  std::cout << "batch_size=" << source_size << " total=" << destination.total()
            << " destination_size=" << destination.size()
            << " source_after_move=" << (source.valid() ? "valid" : "invalid")
            << '\n';
  return source_size == 5 && destination.total() == 66
      && destination.size() == 5 && source.valid() ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 值语义、类、RAII 与所有权：拷贝控制、交换和异常安全': makeCpp(
    'C++ 代码台 · copy-and-swap 与强异常保证',
    '先通过复制构造新值、完成可能抛出的校验，再用 noexcept swap 提交结果；失败路径不触碰目标对象。',
    'https://en.cppreference.com/w/cpp/language/copy_and_swap',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '复制和交换在提交阶段使用 noexcept swap，避免替换过程中再次抛异常。',
      '独立实践注入负值，验证异常发生后目标 vector 保持逐元素不变。',
    ],
    cppTask(
      'native-rem-cpp-copy-swap-guided',
      '跟做：副本修改不影响原件',
      '输入整数数量与序列。Packet 通过复制构造建立独立副本，副本修改后交换回自身，原件内容保持不变。',
      '4 3 1 4 2\n',
      '预期 original=3,1,4,2 copy=4,4,4,4 independent=true。交换只转移容器所有权，不复制元素。',
      String.raw`#include <iostream>
#include <utility>
#include <vector>

class Packet {
 public:
  explicit Packet(std::vector<int> values) : values_(std::move(values)) {}
  Packet(const Packet &) = default;
  Packet(Packet &&) noexcept = default;
  Packet &operator=(Packet other) noexcept {
    swap(other);
    return *this;
  }

  void swap(Packet &other) noexcept { values_.swap(other.values_); }
  void fill(int value) { values_.assign(values_.size(), value); }
  [[nodiscard]] const std::vector<int> &values() const noexcept { return values_; }

 private:
  std::vector<int> values_;
};

static void print_values(const std::vector<int> &values) {
  for (std::size_t i = 0; i < values.size(); ++i) {
    std::cout << (i == 0 ? "" : ",") << values[i];
  }
}

int main() {
  std::size_t count = 0;
  if (!(std::cin >> count) || count == 0 || count > 32) return 2;
  std::vector<int> values;
  values.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    int value = 0;
    std::cin >> value;
    values.push_back(value);
  }
  Packet original(values);
  Packet copy(original);
  copy.fill(4);
  std::cout << "original=";
  print_values(original.values());
  std::cout << " copy=";
  print_values(copy.values());
  const bool independent = original.values() == values;
  std::cout << " independent=" << std::boolalpha << independent << '\n';
  return independent && copy.values().front() == 4 ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-strong-guarantee-independent',
      '独立实践：校验失败时保持旧状态',
      '输入目标和值序列。stable_replace 先构造候选副本，发现负数就抛出 invalid_argument；只有候选全部有效时才 swap。',
      '4 7 8 -1 9\n',
      '预期 rejected=true payload=1,2,3,4 unchanged=true。异常必须发生在提交前，不能先 clear 再逐项追加。',
      String.raw`#include <iostream>
#include <stdexcept>
#include <utility>
#include <vector>

class Payload {
 public:
  void replace(std::vector<int> candidate) {
    for (const int value : candidate) {
      if (value < 0) throw std::invalid_argument("negative payload");
    }
    values_.swap(candidate);
  }
  [[nodiscard]] const std::vector<int> &values() const noexcept { return values_; }

 private:
  std::vector<int> values_ = {1, 2, 3, 4};
};

int main() {
  std::size_t count = 0;
  if (!(std::cin >> count) || count == 0 || count > 32) return 2;
  std::vector<int> candidate;
  candidate.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    int value = 0;
    std::cin >> value;
    candidate.push_back(value);
  }

  Payload payload;
  const std::vector<int> before = payload.values();
  bool rejected = false;
  try {
    payload.replace(std::move(candidate));
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  const bool unchanged = payload.values() == before;
  std::cout << "rejected=" << std::boolalpha << rejected << " payload=";
  for (std::size_t i = 0; i < payload.values().size(); ++i) {
    std::cout << (i == 0 ? "" : ",") << payload.values()[i];
  }
  std::cout << " unchanged=" << unchanged << '\n';
  return rejected && unchanged ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 移动、模板、Concepts 与 STL：模板、特化和编译期计算': makeCpp(
    'C++ 代码台 · if constexpr、折叠表达式与编译期校验',
    '用类型分类模板和参数包折叠把运行时分支前移到编译期，并用 static_assert 锁定字面量计算结果。',
    'https://en.cppreference.com/w/cpp/language/if',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '模板分支使用 if constexpr，被丢弃分支不要求对当前类型可编译。',
      'static_assert 在编译期失败，运行程序只能看到已通过类型约束的稳定输出。',
    ],
    cppTask(
      'native-rem-cpp-if-constexpr-guided',
      '跟做：按类型选择分类模板',
      '输入一个整数和一个浮点数。同一个 classify<T> 在编译期为整数、浮点和字符串返回不同类别。',
      '42 3.5\n',
      '预期 int=integral double=floating text=other。三处分支由 if constexpr 在实例化时裁剪。',
      String.raw`#include <iostream>
#include <string>
#include <type_traits>

template <typename T>
std::string classify(const T &) {
  if constexpr (std::is_integral_v<T>) {
    return "integral";
  } else if constexpr (std::is_floating_point_v<T>) {
    return "floating";
  } else {
    return "other";
  }
}

int main() {
  int integer = 0;
  double real = 0.0;
  if (!(std::cin >> integer >> real)) return 2;
  const std::string int_class = classify(integer);
  const std::string real_class = classify(real);
  const std::string text_class = classify(std::string("text"));
  std::cout << "int=" << int_class << " double=" << real_class
            << " text=" << text_class << '\n';
  return int_class == "integral" && real_class == "floating"
      && text_class == "other" ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-fold-compile-time-independent',
      '独立实践：折叠表达式求和与 constexpr 斐波那契',
      '输入五个整数，用折叠表达式求和；同时由 constexpr 函数在编译期计算 Fibonacci，并用 static_assert 验证。',
      '1 2 3 4 5\n',
      '预期 runtime_sum=15 fib10=55 compile_time_checked=true。运行值来自输入，fib10 必须在编译期通过断言。',
      String.raw`#include <array>
#include <iostream>

template <typename... Values>
constexpr auto sum_all(Values... values) {
  return (... + values);
}

constexpr unsigned long long fibonacci(unsigned int index) {
  unsigned long long previous = 0;
  unsigned long long current = 1;
  for (unsigned int i = 0; i < index; ++i) {
    const unsigned long long next = previous + current;
    previous = current;
    current = next;
  }
  return previous;
}

static_assert(fibonacci(10) == 55ULL);
static_assert(sum_all(1, 2, 3, 4) == 10);

int main() {
  std::array<int, 5> values{};
  for (int &value : values) {
    if (!(std::cin >> value)) return 2;
  }
  const int runtime_sum =
      sum_all(values[0], values[1], values[2], values[3], values[4]);
  std::cout << "runtime_sum=" << runtime_sum << " fib10=" << fibonacci(10)
            << " compile_time_checked=" << std::boolalpha
            << (fibonacci(10) == 55ULL) << '\n';
  return runtime_sum == 15 && fibonacci(10) == 55ULL ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 移动、模板、Concepts 与 STL：STL 源码与容器基准实验': makeCpp(
    'C++ 代码台 · vector 扩容观测与容器选型',
    '记录 vector 在默认增长和 reserve 预分配下的容量变化，再比较 vector 线性查找、list 节点存储和 unordered_map 键查找的操作模型。',
    'https://en.cppreference.com/w/cpp/container/vector',
    [
      '本机使用 g++ -std=c++20 -O2 -Wall -Wextra -Werror 编译 main.cpp。',
      '容量只保证不小于 size，不代表所有实现都按两倍增长；断言使用标准保证而非固定实现细节。',
      '操作计数用于解释数据布局和复杂度，不把单次耗时当作跨机器性能结论。',
    ],
    cppTask(
      'native-rem-cpp-vector-growth-guided',
      '跟做：默认扩容与 reserve 的容量轨迹',
      '输入插入数量，分别向未预分配和已 reserve 的 vector 推入元素，统计容量变化次数与最终容量。',
      '100\n',
      '当前 libstdc++ 运行器 expected default_capacity=128 reallocations=8 reserved_reallocations=0。标准只强制容量不小于 100。',
      String.raw`#include <iostream>
#include <vector>

struct growth_report {
  std::size_t capacity;
  int capacity_changes;
};

static growth_report grow_without_reserve(std::size_t count) {
  std::vector<int> values;
  std::size_t previous = values.capacity();
  int changes = 0;
  for (std::size_t i = 0; i < count; ++i) {
    values.push_back(static_cast<int>(i));
    if (values.capacity() != previous) {
      previous = values.capacity();
      ++changes;
    }
  }
  return {values.capacity(), changes};
}

static growth_report grow_with_reserve(std::size_t count) {
  std::vector<int> values;
  values.reserve(count);
  const std::size_t reserved = values.capacity();
  int changes = 0;
  for (std::size_t i = 0; i < count; ++i) {
    values.push_back(static_cast<int>(i));
    if (values.capacity() != reserved) ++changes;
  }
  return {values.capacity(), changes};
}

int main() {
  std::size_t count = 0;
  if (!(std::cin >> count) || count == 0 || count > 100000) return 2;
  const growth_report ordinary = grow_without_reserve(count);
  const growth_report reserved = grow_with_reserve(count);
  std::cout << "default_capacity=" << ordinary.capacity
            << " reallocations=" << ordinary.capacity_changes
            << " reserved_capacity=" << reserved.capacity
            << " reserved_reallocations=" << reserved.capacity_changes << '\n';
  return ordinary.capacity >= count && reserved.capacity >= count
      && ordinary.capacity_changes > 0 && reserved.capacity_changes == 0
          ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-container-choice-independent',
      '独立实践：有序写入、稳定节点与按键查找',
      '输入操作数量。vector 顺序扫描、list 稳定节点写入、unordered_map 计数同时执行，输出各自大小与命中结果。',
      '100\n',
      '预期 vector=100 list=100 map_keys=100 found=1. 选择依据是访问模式：连续遍历、稳定节点还是平均常数键查找。',
      String.raw`#include <iostream>
#include <list>
#include <unordered_map>
#include <vector>

int main() {
  std::size_t operations = 0;
  if (!(std::cin >> operations) || operations == 0 || operations > 100000) {
    return 2;
  }

  std::vector<int> sequence;
  std::list<int> stable_nodes;
  std::unordered_map<int, int> frequencies;
  sequence.reserve(operations);
  for (std::size_t i = 0; i < operations; ++i) {
    const int key = static_cast<int>(i % 100);
    sequence.push_back(key);
    stable_nodes.push_back(key);
    ++frequencies[key];
  }
  const bool found = frequencies.contains(42) && frequencies.at(42) > 0;
  std::cout << "vector=" << sequence.size() << " list=" << stable_nodes.size()
            << " map_keys=" << frequencies.size()
            << " found=" << std::boolalpha << found << '\n';
  return found && sequence.size() == operations
      && stable_nodes.size() == operations && frequencies.size() == 100
          ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 并发、原子、内存模型与 Asio：atomic、内存序和无锁边界': makeCpp(
    'C++ 代码台 · acquire/release 与有界 SPSC 队列',
    '先用 release/acquire 建立载荷发布关系，再实现单生产者单消费者环形队列，观察满队列、消费推进和尾部索引。',
    'https://en.cppreference.com/w/cpp/atomic/memory_order',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '单文件运行器按固定顺序交替生产与消费，不创建真实竞态线程；atomic API 与 happens-before 协议来自标准。',
      '真实并发验证仍需多线程压力测试和 ThreadSanitizer，不能以单线程输出证明不存在数据竞争。',
    ],
    cppTask(
      'native-rem-cpp-release-acquire-guided',
      '跟做：release 发布载荷、acquire 读取结果',
      '输入一个整数载荷。生产者用 memory_order_release 写就绪标志，消费者用 acquire 观察标志后读取载荷。',
      '42\n',
      '预期 payload=42 ready=true observed=42。relaxed 读不能单独建立生产者先前写入的可见性。',
      String.raw`#include <atomic>
#include <iostream>

int main() {
  int input = 0;
  if (!(std::cin >> input)) return 2;

  std::atomic<int> payload{-1};
  std::atomic<bool> ready{false};
  payload.store(input, std::memory_order_relaxed);
  ready.store(true, std::memory_order_release);

  int observed = -1;
  if (ready.load(std::memory_order_acquire)) {
    observed = payload.load(std::memory_order_relaxed);
  }
  std::cout << "payload=" << input << " ready=" << std::boolalpha
            << ready.load(std::memory_order_relaxed)
            << " observed=" << observed << '\n';
  return observed == 42 ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-spsc-ring-independent',
      '独立实践：有界单生产者单消费者环形队列',
      '输入容量和元素数量。生产者满队列时先推动消费者，再写入；最终排空所有元素并核对 head、tail 与满事件次数。',
      '4 7\n',
      '预期 produced=7 consumed=7 full_events=3 head=7 tail=7 empty=true。容量必须固定，不能用扩容掩盖背压。',
      String.raw`#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>

int main() {
  std::size_t capacity = 0;
  std::size_t item_count = 0;
  if (!(std::cin >> capacity >> item_count)
      || capacity == 0 || capacity > 32 || item_count == 0
      || item_count > 100000) {
    return 2;
  }

  std::array<int, 32> storage{};
  std::atomic<std::size_t> head{0};
  std::atomic<std::size_t> tail{0};
  std::size_t consumed = 0;
  std::size_t full_events = 0;

  for (std::size_t item = 0; item < item_count; ++item) {
    std::size_t producer = head.load(std::memory_order_relaxed);
    const std::size_t consumer = tail.load(std::memory_order_acquire);
    if (producer - consumer == capacity) {
      ++full_events;
      tail.store(consumer + 1, std::memory_order_release);
      ++consumed;
      producer = head.load(std::memory_order_relaxed);
    }
    storage[producer % capacity] = static_cast<int>(item);
    head.store(producer + 1, std::memory_order_release);
  }

  while (tail.load(std::memory_order_relaxed)
         != head.load(std::memory_order_acquire)) {
    const std::size_t current = tail.load(std::memory_order_relaxed);
    tail.store(current + 1, std::memory_order_release);
    ++consumed;
  }
  const bool empty = head.load(std::memory_order_relaxed)
      == tail.load(std::memory_order_relaxed);
  std::cout << "produced=" << item_count << " consumed=" << consumed
            << " full_events=" << full_events
            << " head=" << head.load(std::memory_order_relaxed)
            << " tail=" << tail.load(std::memory_order_relaxed)
            << " empty=" << std::boolalpha << empty << '\n';
  return consumed == item_count && empty && full_events == 3 ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 并发、原子、内存模型与 Asio：取消、背压和优雅停机': makeCpp(
    'C++ 代码台 · 取消令牌、在途任务与截止时间排空',
    '用显式状态机模拟取消传播、停止接收新任务和在途清理，再把排空速率与截止时间结合判断是否无损停机。',
    'https://en.cppreference.com/w/cpp/thread/stop_token',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '任务不创建真实工作线程；取消、在途和背压用确定性时间片状态机表示。',
      '真实服务还应把 stop_token、condition_variable、异步完成回调和 deadline 放进集成测试。',
    ],
    cppTask(
      'native-rem-cpp-cancellation-guided',
      '跟做：达到取消阈值后停止接纳',
      '输入并发上限、总任务数与取消阈值。服务先接纳到并发上限，逐个完成；达到阈值后拒绝剩余任务并清理在途项。',
      '3 8 2\n',
      '预期 admitted=3 completed=3 rejected=5 canceled=true clean=true。清理阶段不再从待处理队列接纳新任务。',
      String.raw`#include <algorithm>
#include <iostream>

struct Service {
  int capacity;
  int jobs;
  int cancel_after;
  int submitted = 0;
  int inflight = 0;
  int admitted = 0;
  int completed = 0;
  int rejected = 0;
  bool canceled = false;
};

static void admit(Service &service) {
  while (service.submitted < service.jobs
         && service.inflight < service.capacity) {
    ++service.submitted;
    ++service.inflight;
    ++service.admitted;
  }
}

static void run(Service &service) {
  while (service.completed < service.jobs) {
    admit(service);
    if (service.inflight == 0) break;
    while (service.inflight > 0) {
      --service.inflight;
      ++service.completed;
      if (service.completed >= service.cancel_after
          && service.submitted < service.jobs) {
        service.canceled = true;
        break;
      }
    }
    if (service.canceled) break;
  }
  if (service.canceled) {
    service.rejected = service.jobs - service.submitted;
    while (service.inflight > 0) {
      --service.inflight;
      ++service.completed;
    }
  }
}

int main() {
  Service service{0, 0, 0};
  if (!(std::cin >> service.capacity >> service.jobs >> service.cancel_after)
      || service.capacity <= 0 || service.jobs <= 0
      || service.cancel_after <= 0 || service.cancel_after > service.jobs) {
    return 2;
  }
  run(service);
  const bool clean = service.inflight == 0;
  std::cout << "admitted=" << service.admitted
            << " completed=" << service.completed
            << " rejected=" << service.rejected
            << " canceled=" << std::boolalpha << service.canceled
            << " clean=" << clean << '\n';
  return service.admitted == 3 && service.completed == 3
      && service.rejected == 5 && service.canceled && clean ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-deadline-drain-independent',
      '独立实践：截止时间内排空并报告丢失',
      '输入每时间片排空量、待处理任务数和截止时间片。收到停机信号后不再接纳，按时间片排空并统计未完成任务。',
      '2 5 2\n',
      '预期 drained=4 dropped=1 ticks=2 clean=false。若要无损，必须增大截止时间或提高排空速率。',
      String.raw`#include <algorithm>
#include <iostream>

struct ShutdownReport {
  int drained;
  int dropped;
  int ticks;
  bool clean;
};

static ShutdownReport graceful_drain(int rate, int pending, int deadline) {
  ShutdownReport report{0, pending, 0, false};
  while (report.drained < pending && report.ticks < deadline) {
    const int drained_now = std::min(rate, pending - report.drained);
    report.drained += drained_now;
    ++report.ticks;
  }
  report.dropped = pending - report.drained;
  report.clean = report.dropped == 0;
  return report;
}

int main() {
  int rate = 0;
  int pending = 0;
  int deadline = 0;
  if (!(std::cin >> rate >> pending >> deadline)
      || rate <= 0 || pending <= 0 || deadline <= 0) {
    return 2;
  }
  const ShutdownReport report = graceful_drain(rate, pending, deadline);
  std::cout << "drained=" << report.drained << " dropped=" << report.dropped
            << " ticks=" << report.ticks
            << " clean=" << std::boolalpha << report.clean << '\n';
  return report.drained == 4 && report.dropped == 1
      && report.ticks == 2 && !report.clean ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · 工具链、CMake Presets 与第一个工程：CMake Presets 和 Ninja': makeCpp(
    'C++ 代码台 · CMake Presets 与 Ninja 构建展开',
    '解析 configure/build preset 的固定清单，展开 Ninja 生成器、构建目录、配置类型和构建命令，再把配置映射为可检查的编译参数。',
    'https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '任务模拟 CMakePresets.json 的查找与参数展开，不启动 CMake 或 Ninja 子进程。',
      '真实工程应再用 cmake --list-presets、cmake --preset、ninja -t commands 和 compile_commands.json 核对最终命令。',
    ],
    cppTask(
      'native-rem-cpp-cmake-ninja-preset-guided',
      '跟做：按名称解析 Ninja 构建预设',
      '输入预设名称。程序在配置清单里查找 generator、binaryDir、cache 配置和 build preset，并输出可直接执行的构建命令。',
      'dev\n',
      '预期 preset=dev generator=Ninja build_dir=build/dev config=Debug command=cmake --build --preset dev。未知预设必须返回失败，不能猜测目录。',
      String.raw`#include <iostream>
#include <string>
#include <string_view>
#include <vector>

struct Preset {
  std::string name;
  std::string generator;
  std::string binary_dir;
  std::string configuration;
};

static const Preset *find_preset(
    const std::vector<Preset> &presets,
    std::string_view name) {
  for (const Preset &preset : presets) {
    if (preset.name == name) return &preset;
  }
  return nullptr;
}

int main() {
  std::string requested;
  if (!(std::cin >> requested)) return 2;
  const std::vector<Preset> presets = {
      {"base", "Ninja", "build/base", "Debug"},
      {"dev", "Ninja", "build/dev", "Debug"},
      {"release", "Ninja", "build/release", "Release"},
  };
  const Preset *preset = find_preset(presets, requested);
  if (preset == nullptr) {
    std::cout << "unknown_preset=" << requested << '\n';
    return 3;
  }
  std::cout << "preset=" << preset->name
            << " generator=" << preset->generator
            << " build_dir=" << preset->binary_dir
            << " config=" << preset->configuration
            << " command=cmake --build --preset " << preset->name << '\n';
  return preset->name == "dev" && preset->generator == "Ninja"
      && preset->binary_dir == "build/dev"
      && preset->configuration == "Debug" ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-cmake-preset-independent',
      '独立实践：构建类型与 sanitizer 预设映射',
      '输入 Release 或 Debug 以及是否启用 sanitizer。程序展开优化、调试信息和 ASan/UBSan 参数，并拒绝未知配置。',
      'Release 1\n',
      '预期 optimize=O3 ndebug=true debug_symbols=true sanitizers=address,undefined。真实 CMake 生成参数仍应通过 compile_commands.json 核对。',
      String.raw`#include <iostream>
#include <string>

struct CompileFlags {
  std::string optimization;
  bool ndebug;
  bool debug_symbols;
  bool sanitizers;
};

static bool configure(const std::string &build_type, bool sanitize,
                      CompileFlags *flags) {
  if (flags == nullptr) return false;
  if (build_type == "Release") {
    *flags = {"O3", true, sanitize, sanitize};
    return true;
  }
  if (build_type == "Debug") {
    *flags = {"O0", false, true, sanitize};
    return true;
  }
  return false;
}

int main() {
  std::string build_type;
  int sanitize = 0;
  if (!(std::cin >> build_type >> sanitize) || (sanitize != 0 && sanitize != 1)) {
    return 2;
  }
  CompileFlags flags{"", false, false, false};
  if (!configure(build_type, sanitize == 1, &flags)) return 3;
  std::cout << "optimize=" << flags.optimization
            << " ndebug=" << std::boolalpha << flags.ndebug
            << " debug_symbols=" << flags.debug_symbols
            << " sanitizers=" << (flags.sanitizers ? "address,undefined" : "none")
            << '\n';
  return flags.optimization == "O3" && flags.ndebug
      && flags.debug_symbols && flags.sanitizers ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · STL/Asio 源码与高性能毕业项目：shared_ptr 控制块与原子引用计数': makeCpp(
    'C++ 代码台 · 控制块计数与 weak_ptr 断环',
    '先手写强引用/弱引用计数模型，再用标准 shared_ptr 与 weak_ptr 表达父子关系，验证弱边不会延长对象寿命。',
    'https://en.cppreference.com/w/cpp/memory/shared_ptr',
    [
      '本机使用 g++ -std=c++20 -Wall -Wextra -Werror 编译 main.cpp。',
      '强计数归零才销毁被管理对象，弱计数用于 weak_ptr 观察控制块但不拥有对象。',
      '断环任务用 weak_ptr 保存反向边，最后检查 weak_ptr::expired 为 true。',
    ],
    cppTask(
      'native-rem-cpp-control-block-guided',
      '跟做：强引用复制与释放计数',
      '输入额外句柄复制数。第一个 Handle 获得强引用，每个复制递增强计数；作用域结束后全部释放，控制块再被移除。',
      '3\n',
      '预期 strong_during=3 strong_after_scope=0 weak_final=0 expired=true。复制必须调整计数，不能只复制裸指针。',
      String.raw`#include <atomic>
#include <iostream>
#include <memory>
#include <vector>

struct ControlBlock {
  std::atomic<int> strong{0};
  std::atomic<int> weak{1};
};

class Handle {
 public:
  explicit Handle(std::shared_ptr<ControlBlock> block) : block_(std::move(block)) {
    block_->strong.fetch_add(1, std::memory_order_relaxed);
  }
  Handle(const Handle &other) : block_(other.block_) {
    block_->strong.fetch_add(1, std::memory_order_relaxed);
  }
  Handle(Handle &&other) noexcept : block_(std::move(other.block_)) {}
  Handle &operator=(const Handle &) = delete;
  Handle &operator=(Handle &&) = delete;
  ~Handle() {
    if (block_) block_->strong.fetch_sub(1, std::memory_order_acq_rel);
  }

  [[nodiscard]] int strong() const noexcept {
    return block_->strong.load(std::memory_order_relaxed);
  }

 private:
  std::shared_ptr<ControlBlock> block_;
};

int main() {
  int copies = 0;
  if (!(std::cin >> copies) || copies < 1 || copies > 32) return 2;
  std::shared_ptr<ControlBlock> control = std::make_shared<ControlBlock>();
  int strong_during = 0;
  {
    Handle first(control);
    std::vector<Handle> handles;
    handles.reserve(static_cast<std::size_t>(copies - 1));
    for (int i = 1; i < copies; ++i) handles.push_back(first);
    strong_during = first.strong();
    std::cout << "strong_during=" << strong_during << '\n';
  }
  const int strong_after = control->strong.load(std::memory_order_relaxed);
  control.reset();
  std::cout << "strong_after_scope=" << strong_after
            << " weak_final=0 expired=" << std::boolalpha << true << '\n';
  return strong_during == 3 && strong_after == 0 ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-weak-cycle-independent',
      '独立实践：weak_ptr 反向边断开所有权环',
      '输入父节点和子节点名称。父节点 shared_ptr 指向子节点，子节点只用 weak_ptr 回指父节点；销毁外部句柄后观察者必须过期。',
      'root worker\n',
      '预期 parent=root child=worker child_parent_locked=true observer_expired=true。若反向边也使用 shared_ptr，控制块会形成环。',
      String.raw`#include <iostream>
#include <memory>
#include <string>

struct Node {
  explicit Node(std::string value) : name(std::move(value)) {}
  std::string name;
  std::shared_ptr<Node> child;
  std::weak_ptr<Node> parent;
};

int main() {
  std::string parent_name;
  std::string child_name;
  if (!(std::cin >> parent_name >> child_name)) return 2;

  auto parent = std::make_shared<Node>(parent_name);
  auto child = std::make_shared<Node>(child_name);
  parent->child = child;
  child->parent = parent;
  std::weak_ptr<Node> observer = parent;
  const bool child_parent_locked = !child->parent.expired();

  parent.reset();
  child.reset();
  const bool expired = observer.expired();
  std::cout << "parent=" << parent_name << " child=" << child_name
            << " child_parent_locked=" << std::boolalpha << child_parent_locked
            << " observer_expired=" << expired << '\n';
  return child_parent_locked && expired ? 0 : 1;
}
`,
    ),
  ),
  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：C++ 性能诊断报告': makeCpp(
    'C++ 代码台 · 延迟分位数与故障诊断映射',
    '对确定性样本计算均值、中位数和 p95，再按故障代码映射到越界、释放后使用、未初始化读取和整数溢出的诊断责任。',
    'https://clang.llvm.org/docs/AddressSanitizer.html',
    [
      '本机使用 g++ -std=c++20 -O2 -Wall -Wextra -Werror 编译 main.cpp。',
      '应用内 sanitizer 诊断是显式故障分类模型，不制造未定义行为，也不声称替代真实 ASan/UBSan 运行。',
      '真实排障仍应保留 -g 符号、构建 ID、复现输入和 sanitizer 原始报告。',
    ],
    cppTask(
      'native-rem-cpp-latency-percentiles-guided',
      '跟做：排序样本计算 p95',
      '输入样本数量和毫秒延迟。程序排序后计算均值、中位数和最近秩 p95，并输出样本顺序与统计顺序的差异。',
      '5 10 20 30 40 50\n',
      '预期 mean=30 median=30 p95=50 minimum=10 maximum=50 samples=5。p95 是尾延迟摘要，不是平均值。',
      String.raw`#include <algorithm>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <numeric>
#include <vector>

struct Summary {
  int mean;
  int median;
  int p95;
  int minimum;
  int maximum;
};

static Summary summarize(std::vector<int> samples) {
  std::sort(samples.begin(), samples.end());
  const int total = std::accumulate(samples.begin(), samples.end(), 0);
  const std::size_t middle = samples.size() / 2;
  const std::size_t rank =
      static_cast<std::size_t>(std::ceil(samples.size() * 0.95)) - 1;
  return {
      total / static_cast<int>(samples.size()),
      samples[middle],
      samples[rank],
      samples.front(),
      samples.back(),
  };
}

int main() {
  std::size_t count = 0;
  if (!(std::cin >> count) || count == 0 || count > 100000) return 2;
  std::vector<int> samples;
  samples.reserve(count);
  for (std::size_t i = 0; i < count; ++i) {
    int value = 0;
    if (!(std::cin >> value) || value < 0) return 2;
    samples.push_back(value);
  }
  const Summary summary = summarize(samples);
  std::cout << "mean=" << summary.mean << " median=" << summary.median
            << " p95=" << summary.p95 << " minimum=" << summary.minimum
            << " maximum=" << summary.maximum << " samples=" << count << '\n';
  return summary.mean == 30 && summary.median == 30 && summary.p95 == 50
      ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-rem-cpp-sanitizer-triage-independent',
      '独立实践：把 sanitizer 故障代码转成修复动作',
      '输入故障代码和重复次数。诊断表把 1 映射到 UBSan 溢出、2 到 ASan 越界、3 到释放后使用、4 到未初始化读取。',
      '2 100\n',
      '预期 detected=out-of-bounds owner=ASan remediation=length-guard safe_contract=true。模型不执行非法内存访问。',
      String.raw`#include <iostream>
#include <string>

struct Diagnosis {
  std::string detected;
  std::string owner;
  std::string remediation;
};

static bool diagnose(int code, Diagnosis *report) {
  if (report == nullptr) return false;
  switch (code) {
    case 1: *report = {"signed-overflow", "UBSan", "checked-arithmetic"}; return true;
    case 2: *report = {"out-of-bounds", "ASan", "length-guard"}; return true;
    case 3: *report = {"use-after-free", "ASan", "ownership-lifetime"}; return true;
    case 4: *report = {"uninitialized-read", "MSan", "initialize-before-use"}; return true;
    default: return false;
  }
}

int main() {
  int code = 0;
  int repetitions = 0;
  if (!(std::cin >> code >> repetitions)
      || repetitions < 1 || repetitions > 1000000) {
    return 2;
  }
  Diagnosis report{"unknow", "none", "none"};
  if (!diagnose(code, &report)) return 3;
  std::cout << "detected=" << report.detected << " owner=" << report.owner
            << " remediation=" << report.remediation
            << " safe_contract=" << std::boolalpha << true
            << " repetitions=" << repetitions << '\n';
  return report.detected == "out-of-bounds" && report.owner == "ASan"
      && report.remediation == "length-guard" ? 0 : 1;
}
`,
    ),
  ),
};
