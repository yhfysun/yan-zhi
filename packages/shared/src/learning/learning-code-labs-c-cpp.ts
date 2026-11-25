import type { LearningV2CodeLab } from './v2-types.js';

/**
 * C 与 C++ 单文件真实代码实验室。
 *
 * 课程键逐字对应 handwritten/c-systems.ts 与 handwritten/cpp-performance.ts。
 * 所有 C 源码只依赖 C17 标准库，所有 C++ 源码只依赖 C++20 标准库；
 * 不假设应用内可以链接第三方库，也不把命令行工程任务伪装成单文件实验。
 */
export const LEARNING_CODE_LABS_C_C_CPP: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:C · 类型、数组、指针、结构体与函数：数组、指针算术和边界': {
    title: 'C 代码台 01 · 指针跨度、行边界与双指针原地划分',
    description:
      '把一组行数据看成连续的一维对象，用 begin/end 半开区间逐行遍历，再通过双指针在原数组内划分奇偶数。每个循环都只访问已证明在界内的元素。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / GCC 或 Clang',
    docsUrl: 'https://en.cppreference.com/w/c/language/pointer',
    installSteps: [
      '应用通过本机 C 编译器以 -std=c17 -O2 编译 main.c。',
      '先运行跟做任务，核对最佳行和元素偏移；源码不使用动态内存。',
      '实践任务必须在原数组内交换元素，不允许创建第二份结果数组。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-arrays-pointer-row-span-guided',
      title: '跟做：用半开指针区间求最佳行',
      brief:
        '程序把每行首元素作为 begin、首元素之后的一格作为 end，累计行和并保留第一个最大值。先预测最佳行，再运行并核对输出。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stddef.h>
#include <stdio.h>

static long row_sum(const int *begin, size_t width) {
  const int *end = begin + width;
  long sum = 0;
  for (const int *cursor = begin; cursor < end; ++cursor) {
    sum += *cursor;
  }
  return sum;
}

static size_t best_row(const int *rows, size_t row_count, size_t width) {
  size_t best_index = 0;
  long best_value = row_sum(rows, width);
  for (size_t row = 1; row < row_count; ++row) {
    const long candidate = row_sum(rows + row * width, width);
    if (candidate > best_value) {
      best_value = candidate;
      best_index = row;
    }
  }
  return best_index;
}

int main(void) {
  const int scores[] = {
      7, 8, 6, 9,
      10, 12, 11, 13,
      4, 5, 8, 7,
  };
  const size_t chosen = best_row(scores, 3, 4);
  for (size_t row = 0; row < 3; ++row) {
    printf("row%zu sum=%ld offset=%zu\n",
           row,
           row_sum(scores + row * 4, 4),
           row * 4);
  }
  printf("best_row=%zu\n", chosen);
  return chosen == 1 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 best_row=1，三行和依次为 30、46、24，偏移依次为 0、4、8。退出码必须为 0；若最佳行不是 1 或指针偏移不是按每行 4 个 int 递增，实验未通过。',
    },
    apply: {
      id: 'c-arrays-pointer-partition-independent',
      title: '独立实践：双指针原地分离奇偶数',
      brief:
        '完成 partition_even_odd：左指针向右找奇数，右指针向左找偶数，交换后继续。函数返回偶数的数量，调用方据此检查划分是否成立。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

static void swap_int(int *left, int *right) {
  const int saved = *left;
  *left = *right;
  *right = saved;
}

static size_t partition_even_odd(int *begin, size_t length) {
  if (begin == NULL || length == 0) return 0;
  size_t left = 0;
  size_t right = length - 1;
  while (left < right) {
    while (left < right && begin[left] % 2 == 0) ++left;
    while (left < right && begin[right] % 2 != 0) --right;
    if (left < right) {
      swap_int(&begin[left], &begin[right]);
      ++left;
      if (right == 0) break;
      --right;
    }
  }
  size_t even_count = 0;
  for (size_t index = 0; index < length; ++index) {
    if (begin[index] % 2 == 0) ++even_count;
  }
  return even_count;
}

int main(void) {
  int values[] = {1, 2, 3, 4, 5, 6, 7, 8};
  const size_t length = sizeof values / sizeof values[0];
  const size_t even_count = partition_even_odd(values, length);

  printf("even_count=%zu values=", even_count);
  for (size_t index = 0; index < length; ++index) {
    printf("%s%d", index == 0 ? "" : ",", values[index]);
  }
  printf("\n");

  for (size_t index = 0; index < even_count; ++index) {
    if (values[index] % 2 != 0) return 1;
  }
  for (size_t index = even_count; index < length; ++index) {
    if (values[index] % 2 == 0) return 1;
  }
  return even_count == 4 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 even_count=4，前四个位置全为偶数、后四个位置全为奇数，退出码为 0。输出顺序可以变化，但元素集合必须仍是 1..8；越界写、遗漏元素或为奇偶划分另建数组都算失败。',
    },
  },

  'programming:C · 类型、数组、指针、结构体与函数：字符串、缓冲区与安全拼接': {
    title: 'C 代码台 02 · 定长缓冲区的长度账本与百分号编码',
    description:
      '先实现能报告截断的字符串追加器，再实现逐字符增长的 URL 百分号编码。每次写入前都把分隔符、正文和结尾 NUL 一起计入剩余容量。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 标准字符串与缓冲区',
    docsUrl: 'https://en.cppreference.com/w/c/string/byte',
    installSteps: [
      '先运行跟做任务，确认正常追加成功而超长追加返回 false。',
      '实践任务只允许写入调用方提供的固定缓冲区，不使用 strcat。',
      '每次写入后都保留 NUL 终止符，并用 strlen 或索引核对最终长度。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-string-buffer-append-guided',
      title: '跟做：让追加函数拒绝溢出',
      brief:
        'append_tag 在写入前一次算清逗号、标签正文和 NUL 所需空间。程序先成功追加三个标签，再尝试一个必然超长的标签并打印失败原因。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

static bool append_tag(char *buffer,
                       size_t capacity,
                       size_t *used,
                       const char *tag) {
  if (buffer == NULL || used == NULL || tag == NULL || capacity == 0) return false;
  if (*used >= capacity) return false;
  const size_t separator = *used == 0 ? 0 : 1;
  const size_t tag_length = strlen(tag);
  if (separator > capacity - 1 - *used) return false;
  if (tag_length > capacity - 1 - *used - separator) return false;

  size_t cursor = *used;
  if (separator == 1) buffer[cursor++] = ',';
  memcpy(buffer + cursor, tag, tag_length);
  cursor += tag_length;
  buffer[cursor] = '\0';
  *used = cursor;
  return true;
}

int main(void) {
  char tags[24] = {0};
  size_t used = 0;
  const char *accepted[] = {"c", "systems", "labs"};
  for (size_t index = 0; index < 3; ++index) {
    const bool ok = append_tag(tags, sizeof tags, &used, accepted[index]);
    printf("append %s -> %s\n", accepted[index], ok ? "true" : "false");
    if (!ok) return 1;
  }

  const bool overflow = append_tag(
      tags, sizeof tags, &used, "this-tag-must-not-fit-in-the-buffer");
  printf("tags=%s\n", tags);
  printf("used=%zu length=%zu rejected=%s\n",
         used, strlen(tags), overflow ? "false" : "true");
  if (overflow) return 1;
  return strcmp(tags, "c,systems,labs") == 0 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期输出 tags=c,systems,labs、used=14、length=14、rejected=true；超长追加后缓冲区内容不能改变。若看到越界写、没有 NUL 或拒绝后字符串被截断，实验失败。',
    },
    apply: {
      id: 'c-string-buffer-percent-encode-independent',
      title: '独立实践：用长度账本完成 URL 百分号编码',
      brief:
        '补完 append_encoded：字母、数字及 - _ . ~ 原样输出，其余字节写成大写两位十六进制。每写一个字符前都检查 capacity 是否还给结尾 NUL 留位置。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static bool unreserved(unsigned char value) {
  return (value >= 'a' && value <= 'z')
      || (value >= 'A' && value <= 'Z')
      || (value >= '0' && value <= '9')
      || value == '-' || value == '_' || value == '.' || value == '~';
}

static bool append_encoded(char *output,
                           size_t capacity,
                           size_t *used,
                           const char *input) {
  static const char hex[] = "0123456789ABCDEF";
  if (output == NULL || used == NULL || input == NULL || capacity == 0) return false;
  size_t cursor = *used;
  if (cursor >= capacity) return false;

  size_t required = 0;
  for (const unsigned char *source = (const unsigned char *)input;
       *source != '\0'; ++source) {
    const size_t needed = unreserved(*source) ? 1 : 3;
    if (needed > SIZE_MAX - required) return false;
    required += needed;
  }
  if (required > capacity - 1 - cursor) return false;

  for (const unsigned char *source = (const unsigned char *)input;
       *source != '\0'; ++source) {
    const size_t needed = unreserved(*source) ? 1 : 3;
    if (needed == 1) {
      output[cursor++] = (char)*source;
    } else {
      output[cursor++] = '%';
      output[cursor++] = hex[*source >> 4];
      output[cursor++] = hex[*source & 0x0f];
    }
  }
  output[cursor] = '\0';
  *used = cursor;
  return true;
}

int main(void) {
  char query[64] = {0};
  size_t used = 0;
  const bool ok = append_encoded(
      query, sizeof query, &used, "pointer & memory/安全");
  const bool rejected = append_encoded(
      query, sizeof query, &used,
      "&this-extra-part-must-not-fit-into-the-remaining-space");

  printf("encoded=%s\n", query);
  printf("length=%zu rejected=%s\n", used, rejected ? "false" : "true");
  if (!ok || rejected) return 1;
  return strcmp(
      query,
      "pointer%20%26%20memory%2F%E5%AE%89%E5%85%A8") == 0 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 encoded=pointer%20%26%20memory%2F%E5%AE%89%E5%85%A8，rejected=true，退出码为 0。中文 UTF-8 的每个字节都必须编码成 %XX；空格、& 或 / 原样出现都算失败。',
    },
  },

  'programming:C · 类型、数组、指针、结构体与函数：结构体、联合体和对齐': {
    title: 'C 代码台 03 · 成员偏移、浮点位模式与带标签联合体',
    description:
      '先观察结构体成员的偏移和对齐，再用 memcpy 读取 float 的位模式。实践任务把 tick、score 和 message 放进带标签联合体，只按当前标签读取对应成员。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 对象表示与对齐',
    docsUrl: 'https://en.cppreference.com/w/c/language/object',
    installSteps: [
      '先记录跟做输出的 sizeof 和每个 offsetof，不必与他人机器上的数字相同。',
      '浮点转位模式必须通过 memcpy 或字符数组观察，不用类型双关指针。',
      '实践任务要先检查 event->kind，再读取 union 的成员。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-struct-layout-float-bits-guided',
      title: '跟做：读懂偏移、填充和对象表示',
      brief:
        'Record 包含 32 位整数、8 位枚举式字段、16 位分数和 double。程序打印偏移、大小与对齐，再用 memcpy 得到 1.5f 的 32 位位模式。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef struct {
  uint32_t id;
  uint8_t kind;
  uint16_t score;
  double ratio;
} Record;

int main(void) {
  const Record sample = {.id = 42, .kind = 7, .score = 900, .ratio = 0.875};
  const float value = 1.5f;
  uint32_t bits = 0;
  memcpy(&bits, &value, sizeof bits);

  printf("sizeof=%zu align=%zu\n", sizeof(Record), _Alignof(Record));
  printf("id=%zu kind=%zu score=%zu ratio=%zu\n",
         offsetof(Record, id),
         offsetof(Record, kind),
         offsetof(Record, score),
         offsetof(Record, ratio));
  printf("sample=%u/%u/%u/%.3f\n",
         sample.id, sample.kind, sample.score, sample.ratio);
  printf("float_bits=0x%08X\n", bits);

  return offsetof(Record, id) == 0
      && offsetof(Record, kind) < sizeof(Record)
      && offsetof(Record, score) < sizeof(Record)
      && offsetof(Record, ratio) < sizeof(Record)
      && bits == 0x3FC00000u ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 sample=42/7/900/0.875，float_bits=0x3FC00000，且 id 偏移为 0。sizeof、对齐和各成员偏移由平台 ABI 决定，只要求成员都落在对象内且程序退出码为 0。',
    },
    apply: {
      id: 'c-struct-tagged-union-independent',
      title: '独立实践：只读取当前标签对应的联合体成员',
      brief:
        '实现 event_value：EVENT_TICK 返回 tick，EVENT_SCORE 返回 points，EVENT_MESSAGE 返回消息长度。其他标签必须返回默认值并打印错误，不允许读取未激活成员。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdio.h>
#include <string.h>

typedef enum {
  EVENT_TICK,
  EVENT_SCORE,
  EVENT_MESSAGE,
  EVENT_UNKNOWN
} EventKind;

typedef struct {
  EventKind kind;
  union {
    long tick;
    struct {
      int points;
      int grade;
    } score;
    char message[24];
  } data;
} Event;

static long event_value(const Event *event) {
  if (event == NULL) return -1;
  switch (event->kind) {
    case EVENT_TICK:
      return event->data.tick;
    case EVENT_SCORE:
      return event->data.score.points;
    case EVENT_MESSAGE:
      return (long)strlen(event->data.message);
    default:
      return 0;
  }
}

int main(void) {
  Event events[3] = {0};
  events[0].kind = EVENT_TICK;
  events[0].data.tick = 120;
  events[1].kind = EVENT_SCORE;
  events[1].data.score.points = 95;
  events[1].data.score.grade = 3;
  events[2].kind = EVENT_MESSAGE;
  snprintf(events[2].data.message, sizeof events[2].data.message, "memory");

  long total = 0;
  for (size_t index = 0; index < 3; ++index) {
    const long value = event_value(&events[index]);
    printf("event%zu kind=%d value=%ld\n",
           index, (int)events[index].kind, value);
    total += value;
  }
  printf("total=%ld\n", total);
  return total == 221 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期三行 value 依次为 120、95、6，total=221，退出码为 0。EVENT_SCORE 只能读 score.points；若用 message 长度、错误标签或未初始化成员凑出 221，实验失败。',
    },
  },

  'programming:C · 栈、堆、生命周期与未定义行为：malloc/realloc/free 与所有权': {
    title: 'C 代码台 04 · 扩容事务与可转移的三态所有权',
    description:
      '先实现只在 realloc 成功后更新指针的动态整数数组，再实现 TextOwner 的深拷贝和所有权转移。指针、长度和容量始终一起更新。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 动态内存与所有权',
    docsUrl: 'https://en.cppreference.com/w/c/memory/realloc',
    installSteps: [
      '先运行跟做任务，观察 capacity 如何按倍增策略增长。',
      '任何 realloc 调用都把返回值先存入临时变量，避免失败时丢失原指针。',
      '实践任务结束时检查源拥有者为空，并确保每条分配路径只释放一次。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-dynamic-vector-realloc-guided',
      title: '跟做：容量翻倍而不丢失旧指针',
      brief:
        'IntVec 由指针、长度和容量组成。int_vec_push 先计算安全的新容量，再 realloc；失败时原数组仍可释放，成功后才写入新元素。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct {
  int *items;
  size_t length;
  size_t capacity;
} IntVec;

static bool int_vec_reserve(IntVec *vector, size_t needed) {
  if (vector == NULL) return false;
  if (vector->capacity >= needed) return true;
  size_t next = vector->capacity == 0 ? 2 : vector->capacity;
  while (next < needed) {
    if (next > SIZE_MAX / 2) return false;
    next *= 2;
  }
  int *grown = (int *)realloc(vector->items, next * sizeof *grown);
  if (grown == NULL) return false;
  vector->items = grown;
  vector->capacity = next;
  return true;
}

static bool int_vec_push(IntVec *vector, int value) {
  if (!int_vec_reserve(vector, vector->length + 1)) return false;
  vector->items[vector->length++] = value;
  return true;
}

int main(void) {
  IntVec squares = {0};
  for (int value = 1; value <= 32; ++value) {
    if (!int_vec_push(&squares, value * value)) {
      free(squares.items);
      return 1;
    }
  }
  printf("length=%zu capacity=%zu first=%d last=%d\n",
         squares.length, squares.capacity,
         squares.items[0], squares.items[squares.length - 1]);
  const bool ok = squares.length == 32
      && squares.capacity >= 32
      && squares.items[31] == 1024;
  free(squares.items);
  return ok ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 length=32、capacity 至少为 32、first=1、last=1024，退出码为 0。若 realloc 后旧指针仍被使用、容量更新早于分配成功或末尾未释放，实验失败。',
    },
    apply: {
      id: 'c-dynamic-text-owner-transfer-independent',
      title: '独立实践：深拷贝与所有权转移',
      brief:
        '补完 text_owner_clone 和 text_owner_transfer。clone 必须分配新内存，transfer 把指针与长度交给目标并把源清空；目标原有资源要先释放。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  char *text;
  size_t length;
} TextOwner;

static void text_owner_clear(TextOwner *owner) {
  free(owner->text);
  owner->text = NULL;
  owner->length = 0;
}

static bool text_owner_clone(TextOwner *target, const TextOwner *source) {
  text_owner_clear(target);
  if (source->text == NULL) return true;
  char *copy = (char *)malloc(source->length + 1);
  if (copy == NULL) return false;
  memcpy(copy, source->text, source->length + 1);
  target->text = copy;
  target->length = source->length;
  return true;
}

static void text_owner_transfer(TextOwner *target, TextOwner *source) {
  text_owner_clear(target);
  target->text = source->text;
  target->length = source->length;
  source->text = NULL;
  source->length = 0;
}

int main(void) {
  TextOwner original = {(char *)malloc(10), 9};
  if (original.text == NULL) return 1;
  memcpy(original.text, "ownership", 10);

  TextOwner clone = {0};
  TextOwner moved = {0};
  if (!text_owner_clone(&clone, &original)) {
    text_owner_clear(&original);
    return 1;
  }
  const bool distinct = clone.text != original.text;
  text_owner_transfer(&moved, &original);

  printf("clone=%s distinct=%s\n", clone.text, distinct ? "true" : "false");
  printf("moved=%s source_empty=%s\n",
         moved.text ? moved.text : "(null)",
         original.text == NULL ? "true" : "false");

  const bool ok = distinct
      && strcmp(clone.text, "ownership") == 0
      && moved.text != NULL
      && strcmp(moved.text, "ownership") == 0
      && original.text == NULL
      && original.length == 0;
  text_owner_clear(&clone);
  text_owner_clear(&moved);
  return ok ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 clone=ownership、distinct=true、moved=ownership、source_empty=true，退出码为 0。clone 与 moved 必须指向同一块转移后的内存并各释放一次；重复释放或只复制指针都算失败。',
    },
  },

  'programming:C · libc、POSIX、文件、进程与 socket：文件描述符、read/write 和缓冲区': {
    title: 'C 代码台 05 · FILE 流、刷新点与定长记录往返',
    description:
      '本节单文件实验使用标准 C 的 FILE 流观察用户态缓冲：先写文本并显式刷新，再以二进制模式写入结构体数组、回卷并逐条读回。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 标准文件流',
    docsUrl: 'https://en.cppreference.com/w/c/io',
    installSteps: [
      '跟做任务使用 tmpfile，实践任务在当前临时目录创建并删除命名文件。',
      '每次写入后检查 fwrite 返回值，并在切换读写方向前调用 fflush 或定位。',
      '读回时比较字段，不仅比较字节数；实验结束必须关闭或删除文件。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-file-stream-buffer-guided',
      title: '跟做：观察刷新前后与文本流回卷',
      brief:
        '程序创建一个 tmpfile，为它指定显式缓冲区，写入三行后调用 fflush，再 rewind 逐字符读回。统计字节与换行数量，关闭前检查所有返回值。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdio.h>

int main(void) {
  FILE *stream = tmpfile();
  if (stream == NULL) {
    perror("tmpfile");
    return 1;
  }

  char buffer[128];
  setvbuf(stream, buffer, _IOFBF, sizeof buffer);
  const char payload[] = "fd=3 read=64\nfd=4 read=128\nfd=5 read=256\n";
  const size_t payload_length = sizeof payload - 1;
  const size_t written = fwrite(payload, 1, payload_length, stream);
  const bool flushed = fflush(stream) == 0;
  rewind(stream);

  size_t bytes = 0;
  size_t lines = 0;
  int value = 0;
  while ((value = fgetc(stream)) != EOF) {
    ++bytes;
    if (value == '\n') ++lines;
  }
  const bool closed = fclose(stream) == 0;

  printf("written=%zu bytes=%zu lines=%zu flushed=%s closed=%s\n",
         written, bytes, lines,
         flushed ? "true" : "false",
         closed ? "true" : "false");
  return written == payload_length && bytes == payload_length
      && lines == 3 && flushed && closed
      ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 written=41、bytes=41、lines=3、flushed=true、closed=true，退出码为 0。若忘记 rewind、切换方向前没有刷新、fwrite 短写未检查或关闭失败，实验不通过。',
    },
    apply: {
      id: 'c-file-record-roundtrip-independent',
      title: '独立实践：定长二进制记录写入与读回',
      brief:
        '创建一个 w+b 文件，以无缓冲模式写入五条 Record，刷新后回卷逐条读取。每条记录的 id/value 必须与内存数组一致，最后删除文件。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

typedef struct {
  uint32_t id;
  int32_t value;
} Record;

int main(void) {
  const Record expected[] = {
      {1, 100}, {2, 200}, {3, 300}, {4, 400}, {5, 500},
  };
  const size_t count = sizeof expected / sizeof expected[0];
  const char *path = "c-record-lab.bin";
  FILE *stream = fopen(path, "w+b");
  if (stream == NULL) {
    perror("fopen");
    return 1;
  }
  setvbuf(stream, NULL, _IONBF, 0);

  const size_t written = fwrite(expected, sizeof expected[0], count, stream);
  const bool flushed = fflush(stream) == 0;
  rewind(stream);

  size_t matched = 0;
  for (size_t index = 0; index < count; ++index) {
    Record actual = {0};
    if (fread(&actual, sizeof actual, 1, stream) != 1) break;
    if (actual.id == expected[index].id
        && actual.value == expected[index].value) {
      ++matched;
    }
  }
  printf("written=%zu matched=%zu\n", written, matched);

  const bool closed = fclose(stream) == 0;
  const bool removed = remove(path) == 0;
  printf("flushed=%s closed=%s removed=%s\n",
         flushed ? "true" : "false",
         closed ? "true" : "false",
         removed ? "true" : "false");
  return written == count && matched == count && flushed && closed && removed
      ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 written=5、matched=5、flushed=true、closed=true、removed=true，退出码为 0。若用文本模式读写结构体导致字节解释不一致、短写未检查或残留文件，实验失败。',
    },
  },

  'programming:C · libc、POSIX、文件、进程与 socket：fork、exec、wait 与信号': {
    title: 'C 代码台 06 · 标准 C 子进程边界与父进程继续执行',
    description:
      '单文件代码台用标准 C 的 system 启动真实子进程，而不假设 Windows 与 POSIX 都有 fork。先让子进程写标记文件，再让失败子进程返回非零，父进程读取并解释原始状态。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 标准 C 进程边界',
    docsUrl: 'https://en.cppreference.com/w/c/program/system',
    installSteps: [
      '应用只给本实验六秒运行时间；system 调用必须在子进程完成后才返回。',
      '跟做任务验证子进程的副作用，实践任务验证非零子进程不会终止父进程。',
      '原始 system 状态在 Windows 与 POSIX 上编码不同，不要跨平台硬编码退出码。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-process-system-marker-guided',
      title: '跟做：等待子进程写完标记文件',
      brief:
        '根据 _WIN32 选择不同 shell 命令启动子进程，写出 child-ran，然后由父进程 fopen 读取。只有子进程成功且父进程读到标记，实验才算通过。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
#if defined(_WIN32)
  const char *command = "echo child-ran>C-process-marker.txt";
#else
  const char *command = "printf 'child-ran\n' > C-process-marker.txt";
#endif
  const int raw_status = system(command);
  printf("child_raw_status=%d\n", raw_status);

  FILE *marker = fopen("C-process-marker.txt", "r");
  char text[32] = {0};
  const bool read_ok = marker != NULL
      && fgets(text, (int)sizeof text, marker) != NULL;
  if (marker != NULL) fclose(marker);

  printf("marker=%s", text);
  const bool ok = raw_status == 0 && read_ok;
  printf("parent_continued=%s\n", ok ? "true" : "false");
  remove("C-process-marker.txt");
  return ok ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 child_raw_status=0、marker=child-ran、parent_continued=true，退出码为 0。若子进程命令失败、父进程未读取到文件、标记文件残留或 system 返回值含义被误读，实验失败。',
    },
    apply: {
      id: 'c-process-failure-observe-independent',
      title: '独立实践：让子进程失败而父进程继续',
      brief:
        '启动一个以 7 退出的子进程，记录 system 原始状态，再检查父进程仍能输出结果并返回 0。不要直接比较 raw_status 是否等于 7。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
#if defined(_WIN32)
  const char *failing_command = "exit /b 7";
#else
  const char *failing_command = "exit 7";
#endif
  const bool shell_available = system(NULL) != 0;
  const int raw_status = system(failing_command);

  printf("shell_available=%s\n", shell_available ? "true" : "false");
  printf("raw_status_nonzero=%s\n", raw_status != 0 ? "true" : "false");
  printf("parent_still_running=true\n");

  const bool ok = shell_available && raw_status != 0;
  return ok ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 shell_available=true、raw_status_nonzero=true、parent_still_running=true，父进程退出码为 0。POSIX 的原始状态可能是 1792 而不是 7；若把平台编码混为一谈，或子进程失败导致父进程直接失败，实验不通过。',
    },
  },

  'programming:C · 数据结构、并发与协议工程：哈希表、链表、队列和内存池': {
    title: 'C 代码台 07 · 固定节点池哈希表与环形队列',
    description:
      '跟做任务用固定 Entry 节点池组织分离链哈希表，避免每个键单独 malloc；实践任务实现固定容量环形队列，区分空、满和覆盖。',
    requiredRuntime: 'c',
    runtimeLabel: 'C17 / 容器与内存池',
    docsUrl: 'https://en.cppreference.com/w/c/language/struct',
    installSteps: [
      '先运行跟做任务，核对节点池用量、碰撞数和键值查询。',
      '实践任务用 head、length、capacity 三个字段表达队列状态，不靠哨兵猜测。',
      '入队前检查容量，出队前检查长度；任何下标都回到 [0, capacity)。',
    ],
    languages: ['c'],
    practice: {
      id: 'c-pooled-hash-table-guided',
      title: '跟做：链表桶共用固定节点池',
      brief:
        'insert 会先查找同键，再决定复用还是从节点池分配；hash 把整数键映射到八个桶。程序插入十二个键，统计碰撞并验证两个查询。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define BUCKET_COUNT 8
#define NODE_COUNT 16

typedef struct {
  int key;
  int value;
  int next;
} Entry;

typedef struct {
  int heads[BUCKET_COUNT];
  Entry nodes[NODE_COUNT];
  size_t used;
  size_t collisions;
} Table;

static void table_init(Table *table) {
  table->used = 0;
  table->collisions = 0;
  for (size_t index = 0; index < BUCKET_COUNT; ++index) {
    table->heads[index] = -1;
  }
}

static int table_find(const Table *table, int key) {
  const size_t bucket = (size_t)((unsigned)key % BUCKET_COUNT);
  for (int index = table->heads[bucket]; index >= 0; index = table->nodes[index].next) {
    if (table->nodes[index].key == key) return table->nodes[index].value;
  }
  return -1;
}

static bool table_put(Table *table, int key, int value) {
  const size_t bucket = (size_t)((unsigned)key % BUCKET_COUNT);
  if (table->heads[bucket] >= 0) ++table->collisions;
  for (int index = table->heads[bucket]; index >= 0; index = table->nodes[index].next) {
    if (table->nodes[index].key == key) {
      table->nodes[index].value = value;
      return true;
    }
  }
  if (table->used >= NODE_COUNT) return false;
  const size_t fresh = table->used++;
  table->nodes[fresh] = (Entry){key, value, table->heads[bucket]};
  table->heads[bucket] = (int)fresh;
  return true;
}

int main(void) {
  Table table;
  table_init(&table);
  for (int key = 0; key < 12; ++key) {
    if (!table_put(&table, key, key * 10)) return 1;
  }
  printf("used=%zu collisions=%zu\n", table.used, table.collisions);
  printf("lookup7=%d lookup99=%d\n", table_find(&table, 7), table_find(&table, 99));
  return table.used == 12
      && table.collisions > 0
      && table_find(&table, 7) == 70
      && table_find(&table, 99) == -1 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 used=12、collisions>0、lookup7=70、lookup99=-1，退出码为 0。更新已有键不能新增节点；节点池满后必须返回 false，不能写到 nodes[16] 之外。',
    },
    apply: {
      id: 'c-ring-queue-state-independent',
      title: '独立实践：环形队列的空满判定',
      brief:
        '补完 queue_push 和 queue_pop。head 指向队首，length 表示元素数，tail 由 head+length 对 capacity 取模得到；八槽队列要能完整走一圈。',
      defaultLanguage: 'c',
      starterCode: {
        c: String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

typedef struct {
  int items[8];
  size_t head;
  size_t length;
  size_t capacity;
} RingQueue;

static void queue_init(RingQueue *queue) {
  queue->head = 0;
  queue->length = 0;
  queue->capacity = 8;
}

static bool queue_push(RingQueue *queue, int value) {
  if (queue->length >= queue->capacity) return false;
  const size_t tail = (queue->head + queue->length) % queue->capacity;
  queue->items[tail] = value;
  ++queue->length;
  return true;
}

static bool queue_pop(RingQueue *queue, int *value) {
  if (queue->length == 0 || value == NULL) return false;
  *value = queue->items[queue->head];
  queue->head = (queue->head + 1) % queue->capacity;
  --queue->length;
  return true;
}

int main(void) {
  RingQueue queue;
  queue_init(&queue);
  for (int value = 1; value <= 6; ++value) {
    if (!queue_push(&queue, value)) return 1;
  }
  int removed[4] = {0};
  for (size_t index = 0; index < 4; ++index) {
    if (!queue_pop(&queue, &removed[index])) return 1;
  }
  for (int value = 7; value <= 10; ++value) {
    if (!queue_push(&queue, value)) return 1;
  }
  if (!queue_push(&queue, 98)) return 1;
  if (!queue_push(&queue, 99)) return 1;
  const bool overflow_rejected = !queue_push(&queue, 100);

  printf("removed=");
  for (size_t index = 0; index < 4; ++index) {
    printf("%s%d", index == 0 ? "" : ",", removed[index]);
  }
  printf("\nremaining=");
  int value = 0;
  while (queue_pop(&queue, &value)) {
    printf("%d ", value);
  }
  printf("\noverflow_rejected=%s\n",
         overflow_rejected ? "true" : "false");

  return removed[0] == 1 && removed[3] == 4 && overflow_rejected ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 removed=1,2,3,4；remaining=5 6 7 8 9 10 98 99；overflow_rejected=true。若队尾取模错误、满队列覆盖元素或 length/head 更新次序导致丢值，实验失败。',
    },
  },

  'programming:C++ · 值语义、类、RAII 与所有权：RAII 管理文件、锁和网络资源': {
    title: 'C++ 代码台 08 · 文件句柄与互斥锁的析构收尾',
    description:
      '先用 unique_ptr 的定制删除器自动关闭 FILE，再用 lock_guard 限定临界区。两段代码都在作用域结束时自动释放资源，不依赖手工 finally。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / 标准库 RAII',
    docsUrl: 'https://en.cppreference.com/w/cpp/memory/unique_ptr',
    installSteps: [
      '应用通过本机 C++ 编译器以 -std=c++20 -O2 编译 main.cpp。',
      '跟做任务观察 FileHandle 离开作用域后自动 fclose，临时文件可由 FILE 自动回收。',
      '实践任务不加手写 unlock，必须由 lock_guard 的析构完成解锁。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-raii-file-handle-guided',
      title: '跟做：unique_ptr 定制删除器关闭 FILE',
      brief:
        'FileHandle 用 decltype(&std::fclose) 保存关闭函数，移动后源对象自然为空。程序写入两行、刷新、回卷并读回，最后调用 close 检查结果。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <cstdio>
#include <iostream>
#include <memory>
#include <string>

class FileHandle {
 public:
  explicit FileHandle(std::FILE* file)
      : file_(file, &std::fclose) {}

  FileHandle(FileHandle&&) noexcept = default;
  FileHandle& operator=(FileHandle&&) noexcept = default;
  FileHandle(const FileHandle&) = delete;
  FileHandle& operator=(const FileHandle&) = delete;

  std::FILE* get() const noexcept { return file_.get(); }
  bool close() noexcept {
    file_.reset();
    return !file_;
  }

 private:
  std::unique_ptr<std::FILE, decltype(&std::fclose)> file_;
};

int main() {
  FileHandle file(std::tmpfile());
  if (!file.get()) {
    std::perror("tmpfile");
    return 1;
  }

  std::fputs("raii-file\n", file.get());
  std::fputs("scope-close\n", file.get());
  if (std::fflush(file.get()) != 0) return 2;
  std::rewind(file.get());

  std::string line;
  int lines = 0;
  char buffer[64];
  while (std::fgets(buffer, sizeof buffer, file.get())) {
    line += buffer;
    ++lines;
  }
  const bool closed = file.close();
  std::cout << "lines=" << lines << " closed=" << std::boolalpha << closed
            << " text=" << line;
  return lines == 2 && closed ? 0 : 3;
}
`,
      },
      checkpoint:
        '预期 lines=2、closed=true，并输出 raii-file 与 scope-close 两行文本，退出码为 0。若忘记定制删除器、显式 fclose 后 unique_ptr 再次关闭导致双重释放，或源文件仍可拷贝，实验失败。',
    },
    apply: {
      id: 'cpp-raii-mutex-scope-independent',
      title: '独立实践：用 lock_guard 管理临界区',
      brief:
        'Counter 的 increment 和 read 必须持有同一个 mutex。主程序把累加放进嵌套作用域，离开后只通过 read 获取结果，并打印锁外读取的值。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <iostream>
#include <mutex>

class Counter {
 public:
  void increment(int amount) {
    std::lock_guard<std::mutex> guard(mutex_);
    value_ += amount;
  }

  int read() const {
    std::lock_guard<std::mutex> guard(mutex_);
    return value_;
  }

 private:
  mutable std::mutex mutex_;
  int value_ = 0;
};

int main() {
  Counter counter;
  {
    counter.increment(2);
    counter.increment(3);
  }
  const int locked_read = counter.read();
  std::cout << "value=" << locked_read << '\n';
  return locked_read == 5 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 value=5，退出码为 0。两次 increment 各自在内部用 lock_guard 建立临界区，read 也走同一把锁；若公开 mutex 让调用方手工 unlock，或 read 不加锁，实验失败。',
    },
  },

  'programming:C++ · 值语义、类、RAII 与所有权：unique_ptr、shared_ptr 与 weak_ptr': {
    title: 'C++ 代码台 09 · 强引用计数、弱边与观察者过期',
    description:
      '先构建两个节点，用 shared_ptr 拥有 next、用 weak_ptr 记录 back，避免环引用；再用 weak_ptr 观察对象是否仍存活。实践任务实现自动清理过期观察者。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / 智能指针',
    docsUrl: 'https://en.cppreference.com/w/cpp/memory/weak_ptr',
    installSteps: [
      '跟做任务先记录 use_count，再逐个 reset 强引用，观察 weak_ptr::expired 的变化。',
      '实践任务每次通知前都 lock weak_ptr，不能直接解引用 weak_ptr。',
      '清理阶段使用 erase_if 删除 expired 项，保留仍存活观察者。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-smart-pointer-weak-backedge-guided',
      title: '跟做：弱反向边打断强引用环',
      brief:
        'Node A 强持有 B，B 只弱引用 A。程序打印两边强计数，然后清空 B 和 A 的强引用，确认两个弱观察都进入 expired。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <iostream>
#include <memory>
#include <string>

struct Node {
  std::string name;
  std::shared_ptr<Node> next;
  std::weak_ptr<Node> back;
};

int main() {
  auto first = std::make_shared<Node>(Node{"first", nullptr, {}});
  auto second = std::make_shared<Node>(Node{"second", nullptr, {}});
  first->next = second;
  second->back = first;

  const long first_count = first.use_count();
  const long second_count = second.use_count();
  const bool back_alive = !second->back.expired();
  std::cout << "first_count=" << first_count
            << " second_count=" << second_count
            << " back_alive=" << std::boolalpha << back_alive << '\n';

  std::weak_ptr<Node> first_weak = first;
  std::weak_ptr<Node> second_weak = second;
  second.reset();
  first.reset();
  std::cout << "first_expired=" << first_weak.expired()
            << " second_expired=" << second_weak.expired() << '\n';
  return first_count == 1 && second_count == 2
      && back_alive
      && first_weak.expired()
      && second_weak.expired() ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 first_count=1、second_count=2、back_alive=true，清空后 first_expired=true、second_expired=true，退出码为 0。若把 back 改成 shared_ptr，节点会因环引用泄漏并出现 expired=false。',
    },
    apply: {
      id: 'cpp-weak-observer-registry-independent',
      title: '独立实践：通知存活观察者并清理过期项',
      brief:
        'Observer 只有一个 id。注册两个 weak_ptr 后让其中一个强引用失效，notify 只会调用仍存活对象；随后清理 vector 并打印保留数量。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <algorithm>
#include <iostream>
#include <memory>
#include <vector>

struct Observer {
  int id;
  void notify(int value) const {
    std::cout << "observer=" << id << " value=" << value << '\n';
  }
};

class Registry {
 public:
  void add(const std::shared_ptr<Observer>& observer) {
    observers_.push_back(observer);
  }

  int notify(int value) {
    int delivered = 0;
    for (const std::weak_ptr<Observer>& weak : observers_) {
      if (auto observer = weak.lock()) {
        observer->notify(value);
        ++delivered;
      }
    }
    return delivered;
  }

  void prune() {
    std::erase_if(observers_, [](const std::weak_ptr<Observer>& weak) {
      return weak.expired();
    });
  }

  std::size_t size() const { return observers_.size(); }

 private:
  std::vector<std::weak_ptr<Observer>> observers_;
};

int main() {
  Registry registry;
  auto keep = std::make_shared<Observer>(Observer{7});
  auto dropped = std::make_shared<Observer>(Observer{9});
  registry.add(keep);
  registry.add(dropped);
  dropped.reset();

  const int delivered = registry.notify(42);
  registry.prune();
  std::cout << "delivered=" << delivered << " retained=" << registry.size()
            << '\n';
  return delivered == 1 && registry.size() == 1 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期只输出 observer=7 value=42，随后 delivered=1、retained=1，退出码为 0。若 weak.lock 失败仍被通知、过期项未删除，或注册表持有 shared_ptr 导致 dropped 不释放，实验失败。',
    },
  },

  'programming:C++ · 移动、模板、Concepts 与 STL：左值、右值、移动与完美转发': {
    title: 'C++ 代码台 10 · 移动后的空源与转发构造任务',
    description:
      '先实现只可移动的 Buffer，观察 std::move 后源对象 size 为 0；再实现 forwarding factory，把参数直接构造成 move-only Task 并放入 vector。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / 移动语义与完美转发',
    docsUrl: 'https://en.cppreference.com/w/cpp/utility/move',
    installSteps: [
      '跟做任务只使用指针与 size 观察移动，不打印已被移走对象的旧缓冲区内容。',
      '移动构造与移动赋值标记 noexcept，vector 扩容时才可安全选择移动。',
      '实践任务必须使用 std::forward 转发构造参数，并使用 move-only 类型阻止隐式拷贝。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-move-only-buffer-guided',
      title: '跟做：移动后让源对象处于可析构空态',
      brief:
        'Buffer 删除拷贝，移动构造窃取指针和长度后把源清空。程序把对象移入 vector，再输出两个对象的大小与首尾值。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <algorithm>
#include <iostream>
#include <utility>
#include <vector>

class Buffer {
 public:
  Buffer(std::size_t size, int fill)
      : data_(new int[size]), size_(size) {
    std::fill(data_, data_ + size_, fill);
  }

  ~Buffer() { delete[] data_; }

  Buffer(const Buffer&) = delete;
  Buffer& operator=(const Buffer&) = delete;

  Buffer(Buffer&& other) noexcept
      : data_(std::exchange(other.data_, nullptr)),
        size_(std::exchange(other.size_, 0)) {}

  Buffer& operator=(Buffer&& other) noexcept {
    if (this != &other) {
      delete[] data_;
      data_ = std::exchange(other.data_, nullptr);
      size_ = std::exchange(other.size_, 0);
    }
    return *this;
  }

  std::size_t size() const noexcept { return size_; }
  int front() const { return data_[0]; }
  int back() const { return data_[size_ - 1]; }

 private:
  int* data_;
  std::size_t size_;
};

int main() {
  Buffer source(4, 7);
  Buffer moved(std::move(source));
  std::vector<Buffer> values;
  values.push_back(Buffer(3, 9));
  values.push_back(Buffer(5, 11));

  std::cout << "source_size=" << source.size()
            << " moved=" << moved.size() << ":" << moved.front() << "-"
            << moved.back() << '\n';
  std::cout << "vector=" << values.size() << " first=" << values[0].size()
            << " last=" << values[1].size() << '\n';
  return source.size() == 0 && moved.size() == 4
      && values.size() == 2 && values[1].size() == 5 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 source_size=0、moved=4:7-7、vector=2 first=3 last=5，退出码为 0。移动后源对象必须为空且仍可析构；若移动构造仍复制、未清空源或 noexcept 缺失，实验失败。',
    },
    apply: {
      id: 'cpp-perfect-forward-task-independent',
      title: '独立实践：用 std::forward 构造 move-only Task',
      brief:
        '补完 make_owned，让任意构造参数通过 std::forward 转发给 T。Task 独占地持有一个 int，生成后移入 vector，打印地址是否变化和目标值。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <iostream>
#include <memory>
#include <utility>
#include <vector>

template <class T, class... Args>
T make_owned(Args&&... args) {
  return T(std::forward<Args>(args)...);
}

class Task {
 public:
  explicit Task(int value)
      : payload_(std::make_unique<int>(value)) {}

  Task(Task&&) noexcept = default;
  Task& operator=(Task&&) noexcept = default;
  Task(const Task&) = delete;
  Task& operator=(const Task&) = delete;

  const int* address() const noexcept { return payload_.get(); }
  int value() const { return *payload_; }

 private:
  std::unique_ptr<int> payload_;
};

int main() {
  Task task = make_owned<Task>(42);
  const int* before = task.address();
  std::vector<Task> tasks;
  tasks.push_back(std::move(task));
  const int* after = tasks.front().address();

  std::cout << "value=" << tasks.front().value()
            << " pointer_stable=" << std::boolalpha << (before == after)
            << '\n';
  return tasks.size() == 1
      && tasks.front().value() == 42
      && before == after ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 value=42、pointer_stable=true，退出码为 0。移动的是 unique_ptr 所有权，堆上的 int 地址不应变化；若把 Task 改成可拷贝或在工厂里复制参数，实验失败。',
    },
  },

  'programming:C++ · 移动、模板、Concepts 与 STL：unordered_map、红黑树与算法选型': {
    title: 'C++ 代码台 11 · 有序树、哈希表与 list+unordered_map LRU',
    description:
      '先对同一组确定性键分别使用 map 与 unordered_map，核对结果一致并记录耗时；再组合 list 与 unordered_map 实现 O(1) 查找和移动的 LRU 缓存。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / STL 容器选型',
    docsUrl: 'https://en.cppreference.com/w/cpp/container',
    installSteps: [
      '跟做任务使用同一批键和同样多的查找次数，两种容器只比较查询入口。',
      '实践任务让 list 保存访问顺序，unordered_map 保存 key 到 list iterator。',
      '淘汰时先删哈希表项再删链表尾节点，不能留下悬空 iterator。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-stl-map-hash-guided',
      title: '跟做：有序树与哈希表回答同一问题',
      brief:
        '生成一千个确定性整数，分别放入 map 和 unordered_map，再做六百次查找。程序核对命中数、校验和与耗时，不把偶然快慢当成唯一选型依据。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <chrono>
#include <cstdint>
#include <iostream>
#include <map>
#include <unordered_map>

int main() {
  constexpr int key_count = 1000;
  constexpr int query_count = 600;
  std::map<int, int> ordered;
  std::unordered_map<int, int> hashed;
  for (int index = 0; index < key_count; ++index) {
    const int key = static_cast<int>(
        (static_cast<std::uint32_t>(index) * 2654435761u) % 100000u);
    ordered[key] = index;
    hashed[key] = index;
  }

  const auto ordered_start = std::chrono::steady_clock::now();
  long long ordered_checksum = 0;
  for (int query = 0; query < query_count; ++query) {
    const int source_index = query % key_count;
    const int key = static_cast<int>(
        (static_cast<std::uint32_t>(source_index) * 2654435761u) % 100000u);
    if (auto found = ordered.find(key); found != ordered.end()) {
      ordered_checksum += found->second;
    }
  }
  const auto ordered_end = std::chrono::steady_clock::now();

  const auto hashed_start = std::chrono::steady_clock::now();
  long long hashed_checksum = 0;
  for (int query = 0; query < query_count; ++query) {
    const int source_index = query % key_count;
    const int key = static_cast<int>(
        (static_cast<std::uint32_t>(source_index) * 2654435761u) % 100000u);
    if (auto found = hashed.find(key); found != hashed.end()) {
      hashed_checksum += found->second;
    }
  }
  const auto hashed_end = std::chrono::steady_clock::now();

  const auto ordered_us = std::chrono::duration_cast<std::chrono::microseconds>(
      ordered_end - ordered_start).count();
  const auto hashed_us = std::chrono::duration_cast<std::chrono::microseconds>(
      hashed_end - hashed_start).count();
  std::cout << "sizes=" << ordered.size() << "/" << hashed.size()
            << " checksums=" << ordered_checksum << "/" << hashed_checksum
            << " micros=" << ordered_us << "/" << hashed_us << '\n';
  return ordered.size() == key_count
      && hashed.size() == key_count
      && ordered_checksum == hashed_checksum ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 sizes=1000/1000，两列 checksums 完全相同，micros 两个非负数字，退出码为 0。耗时只作观察；若输入或查询序列不同、校验和不同，实验无效。',
    },
    apply: {
      id: 'cpp-lru-list-hash-independent',
      title: '独立实践：组合 list 与 unordered_map 实现 LRU',
      brief:
        '补完 get 和 put。命中时把节点 splice 到链表头；已满且插入新键时淘汰链表尾。容量二的缓存依次访问 1、2、1、3，最终保留 1 和 3。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <iostream>
#include <list>
#include <optional>
#include <unordered_map>
#include <utility>

class LruCache {
 public:
  explicit LruCache(std::size_t capacity) : capacity_(capacity) {}

  std::optional<int> get(int key) {
    auto found = positions_.find(key);
    if (found == positions_.end()) return std::nullopt;
    items_.splice(items_.begin(), items_, found->second);
    found->second = items_.begin();
    return found->second->second;
  }

  void put(int key, int value) {
    if (capacity_ == 0) return;
    if (auto found = positions_.find(key); found != positions_.end()) {
      found->second->second = value;
      items_.splice(items_.begin(), items_, found->second);
      found->second = items_.begin();
      return;
    }
    if (items_.size() == capacity_) {
      const int victim = items_.back().first;
      positions_.erase(victim);
      items_.pop_back();
    }
    items_.push_front({key, value});
    positions_[key] = items_.begin();
  }

  bool contains(int key) const { return positions_.contains(key); }

 private:
  std::size_t capacity_;
  std::list<std::pair<int, int>> items_;
  std::unordered_map<int, std::list<std::pair<int, int>>::iterator> positions_;
};

int main() {
  LruCache cache(2);
  cache.put(1, 10);
  cache.put(2, 20);
  cache.get(1);
  cache.put(3, 30);

  std::cout << "has1=" << std::boolalpha << cache.contains(1)
            << " has2=" << cache.contains(2)
            << " has3=" << cache.contains(3)
            << " value1=" << cache.get(1).value_or(-1) << '\n';
  return cache.contains(1) && !cache.contains(2)
      && cache.contains(3) && cache.get(1).value_or(-1) == 10 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 has1=true、has2=false、has3=true、value1=10，退出码为 0。若命中后未移动到队首、哈希表保留被淘汰键，或 get 返回引用后在 splice 中失效，实验失败。',
    },
  },

  'programming:C++ · 并发、原子、内存模型与 Asio：thread、mutex、condition_variable': {
    title: 'C++ 代码台 12 · 条件变量工作队列与 acquire/release 握手',
    description:
      '先用 mutex、condition_variable 和 deque 在生产者、消费者之间传值；再用 atomic<bool> 的 release/acquire 建立 happens-before，让普通结构体安全跨线程发布。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / thread 与原子操作',
    docsUrl: 'https://en.cppreference.com/w/cpp/thread',
    installSteps: [
      '先运行跟做任务，确认消费者在收到结束信号后处理完剩余任务再退出。',
      '等待条件必须使用带谓词的 wait，处理虚假唤醒。',
      '实践任务用 ready 的 release/acquire 建立同步；不把 payload 本身写成 atomic。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-concurrency-condition-queue-guided',
      title: '跟做：生产者与消费者共享有界协议',
      brief:
        'WorkQueue 用 mutex 保护 deque，用 condition_variable 唤醒消费者。主线程推入 1..10、标记结束并 join，消费者累加后核对总和为 55。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <condition_variable>
#include <iostream>
#include <mutex>
#include <optional>
#include <queue>
#include <thread>

class WorkQueue {
 public:
  void push(int value) {
    {
      std::lock_guard<std::mutex> guard(mutex_);
      values_.push(value);
    }
    ready_.notify_one();
  }

  void finish() {
    {
      std::lock_guard<std::mutex> guard(mutex_);
      done_ = true;
    }
    ready_.notify_all();
  }

  std::optional<int> pop() {
    std::unique_lock<std::mutex> lock(mutex_);
    ready_.wait(lock, [this] { return done_ || !values_.empty(); });
    if (values_.empty()) return std::nullopt;
    const int value = values_.front();
    values_.pop();
    return value;
  }

 private:
  std::mutex mutex_;
  std::condition_variable ready_;
  std::queue<int> values_;
  bool done_ = false;
};

int main() {
  WorkQueue queue;
  long long sum = 0;
  std::thread consumer([&] {
    while (auto value = queue.pop()) {
      sum += *value;
    }
  });

  for (int value = 1; value <= 10; ++value) queue.push(value);
  queue.finish();
  consumer.join();

  std::cout << "sum=" << sum << '\n';
  return sum == 55 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 sum=55，退出码为 0。若消费者在任务未空时提前退出、wait 没有谓词、push 在解锁前 notify 且逻辑依赖唤醒时机，实验失败。',
    },
    apply: {
      id: 'cpp-concurrency-acquire-release-independent',
      title: '独立实践：release 发布、acquire 接收普通数据',
      brief:
        '生产者先写普通 Payload，再以 release 存 ready=true；消费者以 acquire 读取 ready 后才读取 Payload。程序核对序号、校验和与 ready。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <atomic>
#include <iostream>
#include <thread>

struct Payload {
  int sequence;
  int checksum;
};

int main() {
  Payload payload{0, 0};
  std::atomic<bool> ready{false};

  std::thread consumer([&] {
    while (!ready.load(std::memory_order_acquire)) {
      std::this_thread::yield();
    }
    const int observed_sequence = payload.sequence;
    const int observed_checksum = payload.checksum;
    std::cout << "observed=" << observed_sequence << "/" << observed_checksum
              << '\n';
  });

  payload.sequence = 73;
  payload.checksum = 73 * 31;
  ready.store(true, std::memory_order_release);
  consumer.join();

  std::cout << "ready=" << std::boolalpha << ready.load() << '\n';
  return ready.load() && payload.sequence == 73
      ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 observed=73/2263、ready=true，退出码为 0。若 ready 用 relaxed 却没有其他同步、消费者在读 payload 前没有 acquire 轮询，或手动 sleep 代替条件判断，实验失败。',
    },
  },

  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：Google Benchmark 与统计波动': {
    title: 'C++ 代码台 13 · 不用第三方库的多轮中位数基准',
    description:
      '应用内不链接 Google Benchmark，因此用 chrono 手写同口径基准：固定输入，多轮测量线性查找与二分查找，报告每轮耗时和中位数，并核对结果。',
    requiredRuntime: 'cpp',
    runtimeLabel: 'C++20 / chrono 基准与统计',
    docsUrl: 'https://en.cppreference.com/w/cpp/chrono',
    installSteps: [
      '先运行跟做任务，确认 warm-up 后才计时，并且每轮使用同一批查询。',
      '实践任务比较 vector 线性扫描与 unordered_set 查询，所有轮次结果必须一致。',
      '本实验不会给耗时设硬阈值；报告输入规模、轮数、中位数和校验和才有解释价值。',
    ],
    languages: ['cpp'],
    practice: {
      id: 'cpp-benchmark-linear-binary-guided',
      title: '跟做：线性查找与二分查找同输入对照',
      brief:
        '排序后的四千个整数执行一千二百次查询，每次分别用 find 和 binary_search。程序先做一轮不计时 warm-up，再跑五轮并取耗时中位数。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <vector>

using Clock = std::chrono::steady_clock;

template <class Function>
double median_micros(Function&& function) {
  std::array<double, 5> samples{};
  for (double& sample : samples) {
    const auto start = Clock::now();
    function();
    const auto end = Clock::now();
    sample = std::chrono::duration<double, std::micro>(end - start).count();
  }
  std::sort(samples.begin(), samples.end());
  return samples[samples.size() / 2];
}

int main() {
  std::vector<int> values(4000);
  for (int index = 0; index < 4000; ++index) values[index] = index * 2;
  std::vector<int> queries(1200);
  for (int index = 0; index < 1200; ++index) {
    queries[index] = static_cast<int>(
        (static_cast<std::uint32_t>(index) * 2654435761u) % 9000u);
  }

  int linear_hits = 0;
  int binary_hits = 0;
  auto linear = [&] {
    for (int query : queries) {
      if (std::find(values.begin(), values.end(), query) != values.end()) {
        ++linear_hits;
      }
    }
  };
  auto binary = [&] {
    for (int query : queries) {
      if (std::binary_search(values.begin(), values.end(), query)) {
        ++binary_hits;
      }
    }
  };

  linear();
  binary();
  const int linear_warm = linear_hits;
  const int binary_warm = binary_hits;
  linear_hits = 0;
  binary_hits = 0;
  const double linear_ms = median_micros(linear) / 1000.0;
  const double binary_ms = median_micros(binary) / 1000.0;

  std::cout << "runs=5 size=" << values.size() << " queries=" << queries.size()
            << " linear_median_ms=" << linear_ms
            << " binary_median_ms=" << binary_ms
            << " hits=" << linear_hits / 5 << "/" << binary_hits / 5
            << " warm_hits=" << linear_warm << "/" << binary_warm << '\n';
  return linear_hits / 5 == binary_hits / 5 ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 runs=5、size=4000、queries=1200，linear_median_ms 与 binary_median_ms 均为非负数字，两列 hits 完全一致，退出码为 0。耗时数字允许机器差异；输入不同或命中结果不同则无效。',
    },
    apply: {
      id: 'cpp-benchmark-vector-hashset-independent',
      title: '独立实践：线性扫描与哈希集合的多轮中位数',
      brief:
        '生成固定随机种子下的五千个候选值和一万次查询，分别用 vector find 与 unordered_set contains 统计命中。先 warm-up，再跑七轮，输出中位数与相同校验和。',
      defaultLanguage: 'cpp',
      starterCode: {
        cpp: String.raw`#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <random>
#include <unordered_set>
#include <vector>

using Clock = std::chrono::steady_clock;

template <class Function>
double median_micros(Function&& function) {
  std::array<double, 7> samples{};
  for (double& sample : samples) {
    const auto start = Clock::now();
    function();
    const auto end = Clock::now();
    sample = std::chrono::duration<double, std::micro>(end - start).count();
  }
  std::sort(samples.begin(), samples.end());
  return samples[samples.size() / 2];
}

int main() {
  std::mt19937 generator(20261124u);
  std::uniform_int_distribution<int> keys(0, 100000);
  std::vector<int> values(5000);
  for (int& value : values) value = keys(generator);
  std::vector<int> queries(10000);
  for (int& query : queries) query = keys(generator);
  const std::unordered_set<int> hashed(values.begin(), values.end());

  long long vector_checksum = 0;
  long long hash_checksum = 0;
  auto scan = [&] {
    for (int query : queries) {
      if (std::find(values.begin(), values.end(), query) != values.end()) {
        vector_checksum += query;
      }
    }
  };
  auto contains = [&] {
    for (int query : queries) {
      if (hashed.contains(query)) hash_checksum += query;
    }
  };

  scan();
  contains();
  const long long expected_checksum = vector_checksum;
  vector_checksum = 0;
  hash_checksum = 0;
  const double scan_ms = median_micros(scan) / 1000.0;
  const double hash_ms = median_micros(contains) / 1000.0;
  const long long per_round_scan = vector_checksum / 7;
  const long long per_round_hash = hash_checksum / 7;

  std::cout << "runs=7 values=" << values.size() << " queries=" << queries.size()
            << " scan_median_ms=" << scan_ms
            << " hash_median_ms=" << hash_ms
            << " checksums=" << per_round_scan << "/" << per_round_hash
            << '\n';
  return expected_checksum == per_round_scan
      && per_round_scan == per_round_hash ? 0 : 1;
}
`,
      },
      checkpoint:
        '预期 runs=7、values=5000、queries=10000，scan/hash 两个中位数均非负，checksums 完全相同，退出码为 0。必须保留固定种子与七轮口径；单轮数字、不同查询集或不同校验和都不能支撑选型。',
    },
  },
};
