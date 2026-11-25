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
 * C/C++ 高级单文件实验。
 *
 * POSIX、socket、epoll、Asio、CMake 与 sanitizer 条目使用可观察的契约模拟，
 * 让学习任务在 Windows、macOS 和 Linux 的固定运行器里都能编译执行。模拟只还原
 * 状态、所有权和故障语义，不声称启动了内核服务或第三方框架进程。
 */
export const LEARNING_CODE_LABS_NATIVE_ADVANCED: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:C · libc、POSIX、文件、进程与 socket：系统调用、errno 和部分成功': makeC(
    'C 代码台 · errno、部分读写与可重试状态',
    '用显式状态对象模拟 read/write 的短传输与 EINTR，区分成功、暂时失败和真实错误；所有重试都由调用次数上界保护。',
    'https://man7.org/linux/man-pages/man3/errno.3.html',
    [
      '本机以 gcc -std=c17 -Wall -Wextra -Werror main.c 编译。',
      '实验只模拟文件描述符状态，不调用真实 POSIX read/write，因此可在 Windows 运行。',
      '先预测每次传输量，再运行并核对最终偏移、剩余字节和重试次数。',
    ],
    cTask(
      'native-c-posix-partial-read-guided',
      '跟做：短读不是错误',
      '输入缓冲区可用字节数与本次容量，模拟两次读取。第一次读满容量并报告部分成功，第二次继续消费剩余字节。',
      '3 2\n',
      '预期 first=status:1,bytes:2,remaining:1，second=status:0,bytes:1,remaining:0；退出码为 0。若把短读直接当失败，剩余偏移不会归零。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

enum io_status { IO_OK = 0, IO_PARTIAL = 1, IO_ERROR = 2 };

struct stream {
  int descriptor;
  size_t available;
  size_t offset;
};

struct io_result {
  enum io_status status;
  size_t transferred;
};

static struct io_result read_once(struct stream *stream, size_t capacity) {
  struct io_result result = {IO_ERROR, 0};
  if (stream == NULL || stream->descriptor < 0 || capacity == 0) return result;

  const size_t remaining = stream->available - stream->offset;
  result.transferred = remaining < capacity ? remaining : capacity;
  stream->offset += result.transferred;
  result.status = stream->offset == stream->available ? IO_OK : IO_PARTIAL;
  return result;
}

int main(void) {
  int available = 0;
  int capacity = 0;
  if (scanf("%d %d", &available, &capacity) != 2 || available < 0 || capacity <= 0) {
    return 2;
  }

  struct stream input = {3, (size_t)available, 0};
  const struct io_result first = read_once(&input, (size_t)capacity);
  const size_t remaining_after_first = input.available - input.offset;
  const struct io_result second = read_once(&input, (size_t)capacity);

  printf("first=status:%d,bytes:%zu,remaining:%zu\n",
         first.status, first.transferred, remaining_after_first);
  printf("second=status:%d,bytes:%zu,remaining:%zu\n",
         second.status, second.transferred, input.available - input.offset);

  const bool verified = first.status == IO_PARTIAL && first.transferred == 2
      && second.status == IO_OK && second.transferred == 1
      && input.offset == input.available;
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-posix-write-all-independent',
      '独立实践：EINTR 后继续写完全部负载',
      '输入负载长度、单次写入上限与 EINTR 次数。write_all 必须先重试中断，再把剩余负载分块写完，并输出总尝试次数。',
      '9 4 2\n',
      '预期 written=9、attempts=5、remaining=0、verified=true。前两次尝试只增加重试计数，不推进 offset；中断不能造成重复字节。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct write_state {
  size_t payload;
  size_t offset;
  size_t chunk;
  int interrupts_left;
  int attempts;
};

static long write_all(struct write_state *state) {
  if (state == NULL || state->chunk == 0) return -1;
  const int attempt_limit = state->interrupts_left + 64;

  while (state->offset < state->payload && state->attempts < attempt_limit) {
    ++state->attempts;
    if (state->interrupts_left > 0) {
      --state->interrupts_left;
      continue;
    }

    size_t remaining = state->payload - state->offset;
    size_t accepted = remaining < state->chunk ? remaining : state->chunk;
    state->offset += accepted;
  }

  return state->offset == state->payload ? (long)state->offset : -1;
}

int main(void) {
  int payload = 0;
  int chunk = 0;
  int interrupts = 0;
  if (scanf("%d %d %d", &payload, &chunk, &interrupts) != 3
      || payload <= 0 || chunk <= 0 || interrupts < 0) {
    return 2;
  }

  struct write_state state = {
      (size_t)payload, 0, (size_t)chunk, interrupts, 0};
  const long written = write_all(&state);
  const bool verified = written == payload && state.offset == (size_t)payload
      && state.attempts == interrupts + (payload + chunk - 1) / chunk;

  printf("written=%ld attempts=%d remaining=%zu verified=%s\n",
         written,
         state.attempts,
         state.payload - state.offset,
         verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · libc、POSIX、文件、进程与 socket：socket、bind、listen、accept': makeC(
    'C 代码台 · 监听队列与接收环形缓冲区',
    '用定长队列表示 listen backlog，再用环形缓冲区表示内核接收窗口；程序显式记录入队、拒绝、accept 和读取游标，不依赖真实网络。',
    'https://man7.org/linux/man-pages/man2/listen.2.html',
    [
      '先执行跟做任务，区分连接排队成功与 backlog 满载。',
      '独立任务要在容量为零时拒绝写入，并把未读字节保留到下一次读取。',
      '所有数组索引都必须先取模再访问。',
    ],
    cTask(
      'native-c-socket-backlog-guided',
      '跟做：FIFO accept 与 backlog 丢弃',
      '输入队列容量和到达连接数。五个连接依次进入固定容量队列，满员后的连接被拒绝，accept 必须严格按到达顺序返回。',
      '3 5\n',
      '预期 accepted=101,102,103、rejected=104,105、remaining=0。若 accept 返回后进先出顺序，检查 head 与 count 的更新。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct backlog {
  int connections[8];
  size_t capacity;
  size_t head;
  size_t count;
};

static bool enqueue(struct backlog *queue, int connection) {
  if (queue == NULL || queue->count >= queue->capacity) return false;
  const size_t tail = (queue->head + queue->count) % queue->capacity;
  queue->connections[tail] = connection;
  ++queue->count;
  return true;
}

static bool dequeue(struct backlog *queue, int *connection) {
  if (queue == NULL || connection == NULL || queue->count == 0) return false;
  *connection = queue->connections[queue->head];
  queue->head = (queue->head + 1) % queue->capacity;
  --queue->count;
  return true;
}

int main(void) {
  int capacity = 0;
  int arrivals = 0;
  if (scanf("%d %d", &capacity, &arrivals) != 2
      || capacity <= 0 || capacity > 8 || arrivals < 0) {
    return 2;
  }

  struct backlog queue = {{0}, (size_t)capacity, 0, 0};
  int rejected[8] = {0};
  size_t rejected_count = 0;
  for (int index = 0; index < arrivals; ++index) {
    const int connection = 101 + index;
    if (!enqueue(&queue, connection)) rejected[rejected_count++] = connection;
  }

  int accepted[8] = {0};
  size_t accepted_count = 0;
  printf("accepted=");
  int connection = 0;
  while (dequeue(&queue, &connection)) {
    accepted[accepted_count++] = connection;
  }
  for (size_t index = 0; index < accepted_count; ++index) {
    printf("%s%d", index == 0 ? "" : ",", accepted[index]);
  }
  printf("\nrejected=");
  for (size_t index = 0; index < rejected_count; ++index) {
    printf("%s%d", index == 0 ? "" : ",", rejected[index]);
  }
  printf("\nremaining=%zu\n", queue.count);

  const bool verified = accepted_count == 3 && accepted[0] == 101
      && accepted[1] == 102 && accepted[2] == 103
      && rejected_count == 2 && rejected[0] == 104
      && rejected[1] == 105 && queue.count == 0;
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-socket-receive-ring-independent',
      '独立实践：短读、背压与帧边界',
      '输入接收环容量、一次到达字节数和帧长度。写入超过空闲空间时必须报告短写，剩余字节留在下一轮；只有完整帧才允许消费。',
      '6 3 4\n',
      '预期 stored_first=3、frame_ready=false、stored_second=3、frame_ready=true、consumed=4、unread=2。短写不能覆盖未读帧头。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct ring_buffer {
  unsigned char bytes[16];
  size_t capacity;
  size_t read_index;
  size_t write_index;
  size_t size;
};

static size_t free_space(const struct ring_buffer *buffer) {
  return buffer->capacity - buffer->size;
}

static size_t receive(struct ring_buffer *buffer, size_t arriving) {
  const size_t accepted = arriving < free_space(buffer) ? arriving : free_space(buffer);
  for (size_t index = 0; index < accepted; ++index) {
    buffer->bytes[buffer->write_index] = (unsigned char)('A' + buffer->write_index);
    buffer->write_index = (buffer->write_index + 1) % buffer->capacity;
  }
  buffer->size += accepted;
  return accepted;
}

static size_t consume_frame(struct ring_buffer *buffer, size_t frame_size) {
  if (frame_size > buffer->size) return 0;
  buffer->read_index = (buffer->read_index + frame_size) % buffer->capacity;
  buffer->size -= frame_size;
  return frame_size;
}

int main(void) {
  int capacity = 0;
  int arriving = 0;
  int frame_size = 0;
  if (scanf("%d %d %d", &capacity, &arriving, &frame_size) != 3
      || capacity <= 0 || capacity > 16 || arriving <= 0
      || frame_size <= 0 || frame_size > capacity) {
    return 2;
  }

  struct ring_buffer buffer = {{0}, (size_t)capacity, 0, 0, 0};
  const size_t first = receive(&buffer, (size_t)arriving);
  const bool first_ready = buffer.size >= (size_t)frame_size;
  const size_t second = first_ready ? 0 : receive(&buffer, (size_t)arriving);
  const bool ready = buffer.size >= (size_t)frame_size;
  const size_t consumed = ready ? consume_frame(&buffer, (size_t)frame_size) : 0;

  printf("stored_first=%zu\nframe_ready=%s\nstored_second=%zu\n",
         first, first_ready ? "true" : "false", second);
  printf("frame_ready=%s\nconsumed=%zu\nunread=%zu\n",
         ready ? "true" : "false", consumed, buffer.size);

  const bool verified = first == 3 && !first_ready && second == 3
      && ready && consumed == 4 && buffer.size == 2;
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · libc、POSIX、文件、进程与 socket：epoll 与非阻塞 IO': makeC(
    'C 代码台 · select 扫描与 epoll 边沿事件',
    '用位图保存关注集合和就绪集合，分别实现 select 式全量扫描与 epoll 式“只报告新边沿”的契约；所有描述符编号都有上界。',
    'https://man7.org/linux/man-pages/man7/epoll.7.html',
    [
      '跟做任务先把就绪位图展开成描述符列表，核对低位到高位的稳定顺序。',
      '独立任务比较 level-triggered 与 edge-triggered 的返回集合。',
      '兼容层只模拟事件语义，不创建真实 fd、epoll 实例或内核等待队列。',
    ],
    cTask(
      'native-c-epoll-select-scan-guided',
      '跟做：扫描关注集合与就绪集合',
      '输入描述符数量和内核就绪位图。程序只返回同时出现在关注集合与就绪集合中的 fd，并按编号升序打印。',
      '8 5\n',
      '预期 ready=0,2、count=2、verified=true。fd 1 和 fd 3 未列入关注集合，即使输入中意外置位也不能返回。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct poll_set {
  unsigned int interest;
  unsigned int ready;
};

static size_t collect_ready(const struct poll_set *set,
                            size_t descriptor_count,
                            int *output,
                            size_t capacity) {
  if (set == NULL || output == NULL || descriptor_count > 32) return 0;
  size_t count = 0;
  for (size_t descriptor = 0; descriptor < descriptor_count; ++descriptor) {
    const unsigned int bit = 1u << descriptor;
    if ((set->interest & bit) != 0u && (set->ready & bit) != 0u) {
      if (count >= capacity) return capacity + 1;
      output[count++] = (int)descriptor;
    }
  }
  return count;
}

int main(void) {
  int descriptor_count = 0;
  unsigned int ready_mask = 0;
  if (scanf("%d %u", &descriptor_count, &ready_mask) != 2
      || descriptor_count <= 0 || descriptor_count > 8) {
    return 2;
  }

  struct poll_set set = {0x55u, ready_mask};
  int ready[8] = {0};
  const size_t count = collect_ready(&set, (size_t)descriptor_count, ready, 8);

  printf("ready=");
  for (size_t index = 0; index < count && index < 8; ++index) {
    printf("%s%d", index == 0 ? "" : ",", ready[index]);
  }
  printf("\ncount=%zu\n", count);

  const bool verified = count == 2 && ready[0] == 0 && ready[1] == 2;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-epoll-edge-diff-independent',
      '独立实践：只上报新出现的边沿',
      '输入关注位图、上一轮就绪位图和当前就绪位图。level 集合取 interest 与 current 的交集，edge 集合还必须排除上一轮已经就绪的位。',
      '5 1 7\n',
      '预期 level=5、edge=4、verified=true。bit 0 在上一轮已就绪，不再产生边沿；bit 2 是新就绪事件；bit 1 不在关注集合。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct event_masks {
  unsigned int interest;
  unsigned int previous;
  unsigned int current;
};

static unsigned int level_events(const struct event_masks *masks) {
  return masks->interest & masks->current;
}

static unsigned int edge_events(const struct event_masks *masks) {
  return masks->interest & masks->current & ~masks->previous;
}

int main(void) {
  unsigned int interest = 0;
  unsigned int previous = 0;
  unsigned int current = 0;
  if (scanf("%u %u %u", &interest, &previous, &current) != 3
      || (interest | previous | current) > 0xffu) {
    return 2;
  }

  struct event_masks masks = {interest, previous, current};
  const unsigned int level = level_events(&masks);
  const unsigned int edge = edge_events(&masks);
  const bool verified = level == 5u && edge == 4u;

  printf("level=%u\nedge=%u\nverified=%s\n",
         level, edge, verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · 数据结构、并发与协议工程：线程、互斥量、条件变量和原子': makeC(
    'C 代码台 · 协作线程、互斥与条件等待',
    '以确定性协作调度器模拟线程交错：互斥量保护共享账本，条件变量把“队列满”等待拆成谓词检查与唤醒。实验不创建 OS 线程。',
    'https://en.cppreference.com/w/c/thread',
    [
      '先运行跟做任务，观察锁被占用时 try_lock 必须失败而不是破坏共享数据。',
      '独立任务在队列已满时递增 wait_count，消费腾出空间后再继续入队。',
      'Windows 固定运行器不链接 pthread；这里显式模拟原语语义，不能当作真实线程库测试。',
    ],
    cTask(
      'native-c-thread-mutex-guided',
      '跟做：互斥量所有者与受保护递增',
      '两个协作任务共享一个计数器。任务 1 先持锁，任务 2 的一次抢占必须失败并计入 contention；释放后任务 2 再完成读取并写回。',
      '3\n',
      '预期 value=6、contention=1、owner=-1、verified=true。临界区之外 owner 必须回到 -1，失败尝试不能修改 value。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct mutex {
  int owner;
  int success_count;
  int failed_count;
};

static bool try_lock(struct mutex *mutex, int thread_id) {
  if (mutex->owner != -1) {
    ++mutex->failed_count;
    return false;
  }
  mutex->owner = thread_id;
  ++mutex->success_count;
  return true;
}

static bool unlock(struct mutex *mutex, int thread_id) {
  if (mutex->owner != thread_id) return false;
  mutex->owner = -1;
  return true;
}

static void add_under_lock(struct mutex *mutex, int thread_id, int *value, int delta) {
  if (!try_lock(mutex, thread_id)) return;
  *value += delta;
  unlock(mutex, thread_id);
}

int main(void) {
  int initial = 0;
  if (scanf("%d", &initial) != 1 || initial < 0) return 2;

  struct mutex mutex = {-1, 0, 0};
  int value = initial;
  try_lock(&mutex, 1);
  try_lock(&mutex, 2);
  unlock(&mutex, 1);
  add_under_lock(&mutex, 2, &value, initial);

  const bool verified = value == initial * 2 && mutex.failed_count == 1
      && mutex.success_count == 2 && mutex.owner == -1;
  printf("value=%d\ncontention=%d\nowner=%d\nverified=%s\n",
         value,
         mutex.failed_count,
         mutex.owner,
         verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-thread-condition-independent',
      '独立实践：条件变量等待并通知',
      '输入队列容量和待生产消息总数。生产者发现队列满时等待，消费者取出一个元素后把谓词变为真并唤醒生产者。',
      '2 5\n',
      '预期 produced=5、consumed=5、waits=3、max_depth=2、verified=true。等待必须发生在容量检查之后，唤醒后要重新检查谓词。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct bounded_channel {
  int slots[8];
  int capacity;
  int head;
  int size;
  int produced;
  int consumed;
  int waits;
  int max_depth;
};

static bool push(struct bounded_channel *channel, int item) {
  if (channel->size == channel->capacity) {
    ++channel->waits;
    return false;
  }
  channel->slots[(channel->head + channel->size) % channel->capacity] = item;
  ++channel->size;
  ++channel->produced;
  if (channel->size > channel->max_depth) channel->max_depth = channel->size;
  return true;
}

static bool pop(struct bounded_channel *channel, int *item) {
  if (channel->size == 0) return false;
  *item = channel->slots[channel->head];
  channel->head = (channel->head + 1) % channel->capacity;
  --channel->size;
  ++channel->consumed;
  return true;
}

int main(void) {
  int capacity = 0;
  int total = 0;
  if (scanf("%d %d", &capacity, &total) != 2
      || capacity <= 0 || capacity > 8 || total < 0) {
    return 2;
  }

  struct bounded_channel channel = {{0}, capacity, 0, 0, 0, 0, 0, 0};
  int next_item = 1;
  int received = 0;
  while (channel.produced < total) {
    if (!push(&channel, next_item)) {
      if (!pop(&channel, &received) || !push(&channel, next_item)) return 1;
    }
    ++next_item;
  }
  while (pop(&channel, &received)) {}

  const bool verified = channel.produced == total && channel.consumed == total
      && channel.waits == total - capacity && channel.max_depth == capacity;
  printf("produced=%d\nconsumed=%d\nwaits=%d\nmax_depth=%d\nverified=%s\n",
         channel.produced,
         channel.consumed,
         channel.waits,
         channel.max_depth,
         verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · 栈、堆、生命周期与未定义行为：悬空指针、双重释放和泄漏': makeC(
    'C 代码台 · 固定块内存池与代际句柄',
    '先用空闲量记录管理固定块池，再用槽位代数识别悬空句柄。两条路径都不依赖未定义行为，并能区分重复释放与旧句柄访问。',
    'https://en.cppreference.com/w/c/memory',
    [
      '跟做任务先耗尽所有块，再释放两个槽位并确认后继分配复用最低槽号。',
      '独立任务每次重新分配都递增 generation，旧句柄不得操作新对象。',
      '固定池只管理整块所有权；块内对象构造与析构不在本实验范围内。',
    ],
    cTask(
      'native-c-memory-pool-guided',
      '跟做：耗尽、归还与最低槽复用',
      '输入池容量。程序连续分配全部块，释放槽 1 与槽 3，再申请两个块；分配器应在固定数组内复用这两个槽，不触碰堆。',
      '6\n',
      '预期 allocated=0,1,2,3,4,5、free=1,3、reused=1,3、in_use=6、verified=true。任何越界索引或释放未占用槽都立即失败。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct block_pool {
  bool occupied[8];
  unsigned char data[8][8];
  size_t capacity;
  size_t in_use;
};

static int pool_alloc(struct block_pool *pool, unsigned char fill) {
  for (size_t index = 0; index < pool->capacity; ++index) {
    if (!pool->occupied[index]) {
      pool->occupied[index] = true;
      ++pool->in_use;
      for (size_t byte = 0; byte < sizeof pool->data[index]; ++byte) {
        pool->data[index][byte] = fill;
      }
      return (int)index;
    }
  }
  return -1;
}

static bool pool_free(struct block_pool *pool, int slot) {
  if (slot < 0 || (size_t)slot >= pool->capacity || !pool->occupied[slot]) {
    return false;
  }
  pool->occupied[slot] = false;
  --pool->in_use;
  return true;
}

int main(void) {
  int capacity = 0;
  if (scanf("%d", &capacity) != 1 || capacity < 4 || capacity > 8) return 2;

  struct block_pool pool = {{false}, {{0}}, (size_t)capacity, 0};
  int allocated[8] = {0};
  for (int index = 0; index < capacity; ++index) {
    allocated[index] = pool_alloc(&pool, (unsigned char)(0xa0 + index));
    if (allocated[index] < 0) return 1;
  }
  const bool freed = pool_free(&pool, 1) && pool_free(&pool, 3);
  const int reused_first = pool_alloc(&pool, 0x11);
  const int reused_second = pool_alloc(&pool, 0x22);

  printf("allocated=");
  for (int index = 0; index < capacity; ++index) {
    printf("%s%d", index == 0 ? "" : ",", allocated[index]);
  }
  printf("\nfree=1,3\nreused=%d,%d\nin_use=%zu\nverified=%s\n",
         reused_first,
         reused_second,
         pool.in_use,
         pool.in_use == (size_t)capacity ? "true" : "false");

  const bool verified = freed && reused_first == 1 && reused_second == 3
      && pool.in_use == (size_t)capacity;
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-memory-generation-handle-independent',
      '独立实践：用 generation 拒绝悬空与重复释放',
      '输入槽数。句柄同时保存槽号与代数；释放后代数递增，旧句柄读取和再次释放都必须失败，新句柄访问同一槽则成功。',
      '3\n',
      '预期 stale_read=rejected、stale_release=rejected、double_release=rejected、fresh_read=22、live=1、verified=true。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

struct slot {
  int value;
  unsigned int generation;
  bool live;
};

struct handle {
  int slot;
  unsigned int generation;
};

struct slot_table {
  struct slot slots[8];
  int capacity;
  int live_count;
};

static struct handle acquire(struct slot_table *table, int value) {
  for (int index = 0; index < table->capacity; ++index) {
    struct slot *slot = &table->slots[index];
    if (!slot->live) {
      ++slot->generation;
      slot->live = true;
      slot->value = value;
      ++table->live_count;
      return (struct handle){index, slot->generation};
    }
  }
  return (struct handle){-1, 0};
}

static bool valid(const struct slot_table *table, struct handle handle) {
  return handle.slot >= 0 && handle.slot < table->capacity
      && table->slots[handle.slot].live
      && table->slots[handle.slot].generation == handle.generation;
}

static bool read_value(const struct slot_table *table, struct handle handle, int *out) {
  if (!valid(table, handle) || out == NULL) return false;
  *out = table->slots[handle.slot].value;
  return true;
}

static bool release(struct slot_table *table, struct handle handle) {
  if (!valid(table, handle)) return false;
  table->slots[handle.slot].live = false;
  --table->live_count;
  return true;
}

int main(void) {
  int capacity = 0;
  if (scanf("%d", &capacity) != 1 || capacity <= 0 || capacity > 8) return 2;

  struct slot_table table = {{{0, 0u, false}}, capacity, 0};
  const struct handle old_handle = acquire(&table, 11);
  if (old_handle.slot < 0 || !release(&table, old_handle)) return 1;

  int stale_value = 0;
  const bool stale_read = read_value(&table, old_handle, &stale_value);
  const bool stale_release = release(&table, old_handle);
  const struct handle fresh_handle = acquire(&table, 22);
  const struct handle temporary_handle = acquire(&table, 33);
  int fresh_value = 0;
  const bool fresh_read = read_value(&table, fresh_handle, &fresh_value);
  const bool first_release = release(&table, temporary_handle);
  const bool double_release_rejected = first_release && !release(&table, temporary_handle);
  const bool verified = !stale_read && !stale_release && double_release_rejected
      && fresh_read && fresh_value == 22 && table.live_count == 1;

  printf("stale_read=%s\nstale_release=%s\ndouble_release=%s\nfresh_read=%d\nlive=%d\nverified=%s\n",
         stale_read ? "accepted" : "rejected",
         stale_release ? "accepted" : "rejected",
         double_release_rejected ? "rejected" : "accepted",
         fresh_read ? fresh_value : -1,
         table.live_count,
         verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · Redis/Nginx 源码与原生服务交付：Redis 事件循环与连接缓冲': makeC(
    'C 代码台 · Redis 风格事件循环与增量协议解析',
    '用连接对象维护读缓冲、命令队列和待写回复；第二轮实现跨多个网络分片的 RESP PING 解析，只有完整边界才消费缓冲区。',
    'https://github.com/redis/redis/blob/unstable/src/ae.c',
    [
      '跟做任务每轮只处理当前就绪连接，命令执行结果先进入写队列。',
      '独立任务记录每次追加后的缓冲区长度，最后一个分片到齐前不得执行命令。',
      '实验模拟 ae 主循环和 RESP 边界，不启动 Redis，也不依赖真实套接字。',
    ],
    cTask(
      'native-c-redis-event-loop-guided',
      '跟做：一轮事件循环完成三路连接',
      '输入就绪位图。每个就绪连接把预置命令放入队列；执行阶段消费命令并生成回复，未就绪连接保持空闲。',
      '7\n',
      '预期 ready=0,1,2、executed=3、replies=3、queued=0、iterations=1、verified=true。回复应在事件处理之后统一刷新。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

struct connection {
  int client_id;
  const char *command;
  int queued_commands;
  int queued_replies;
};

static void read_event(struct connection *connection) {
  if (connection->command != NULL) ++connection->queued_commands;
}

static int execute_commands(struct connection *connection) {
  int executed = 0;
  while (connection->queued_commands > 0) {
    --connection->queued_commands;
    ++connection->queued_replies;
    ++executed;
  }
  return executed;
}

static int flush_replies(struct connection *connection) {
  const int flushed = connection->queued_replies;
  connection->queued_replies = 0;
  return flushed;
}

int main(void) {
  unsigned int ready_mask = 0;
  if (scanf("%u", &ready_mask) != 1 || ready_mask > 0x7u) return 2;

  struct connection connections[] = {
      {101, "PING", 0, 0},
      {102, "GET key", 0, 0},
      {103, "INCR hits", 0, 0},
  };
  const size_t connection_count = sizeof connections / sizeof connections[0];
  int executed = 0;
  int replies = 0;

  for (size_t index = 0; index < connection_count; ++index) {
    if ((ready_mask & (1u << index)) != 0u) read_event(&connections[index]);
  }
  for (size_t index = 0; index < connection_count; ++index) {
    executed += execute_commands(&connections[index]);
  }
  for (size_t index = 0; index < connection_count; ++index) {
    replies += flush_replies(&connections[index]);
  }

  printf("ready=");
  size_t ready_count = 0;
  for (size_t index = 0; index < connection_count; ++index) {
    if ((ready_mask & (1u << index)) != 0u) {
      printf("%s%zu", ready_count++ == 0 ? "" : ",", index);
    }
  }
  int remaining_commands = 0;
  for (size_t index = 0; index < connection_count; ++index) {
    remaining_commands += connections[index].queued_commands;
  }
  printf("\nexecuted=%d\nreplies=%d\nqueued=%d\niterations=1\n",
         executed, replies, remaining_commands);

  const bool verified = ready_count == 3 && executed == 3
      && replies == 3 && remaining_commands == 0;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-redis-resp-fragment-independent',
      '独立实践：三分片拼出同一个 RESP 命令',
      '依次输入三个网络分片长度。连接缓冲区追加后检查完整 PING 帧；帧未完整时解析器返回 NEED_MORE，完整后才返回 OK 并更新读游标。',
      '3 5 6\n',
      '预期 lengths=3,5,6、states=NEED_MORE,NEED_MORE,OK、command=PING、consumed=14、unread=0、verified=true。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

enum parse_state { PARSE_NEED_MORE = 0, PARSE_OK = 1, PARSE_ERROR = 2 };

struct input_buffer {
  char bytes[64];
  size_t length;
  size_t read_index;
};

static bool append_bytes(struct input_buffer *buffer, const char *source, size_t count) {
  if (buffer == NULL || source == NULL || count > sizeof buffer->bytes - buffer->length) {
    return false;
  }
  memcpy(buffer->bytes + buffer->length, source, count);
  buffer->length += count;
  return true;
}

static enum parse_state parse_ping(struct input_buffer *buffer, const char **command) {
  static const char frame[] = "*1\r\n$4\r\nPING\r\n";
  const size_t frame_length = sizeof frame - 1;
  if (buffer->length < frame_length) return PARSE_NEED_MORE;
  if (memcmp(buffer->bytes, frame, frame_length) != 0) return PARSE_ERROR;
  buffer->read_index = frame_length;
  *command = "PING";
  return PARSE_OK;
}

int main(void) {
  int first = 0;
  int second = 0;
  int third = 0;
  if (scanf("%d %d %d", &first, &second, &third) != 3
      || first <= 0 || second <= 0 || third <= 0) {
    return 2;
  }

  static const char wire[] = "*1\r\n$4\r\nPING\r\n";
  const int fragments[] = {first, second, third};
  struct input_buffer input = {{0}, 0, 0};
  enum parse_state states[3] = {PARSE_NEED_MORE, PARSE_NEED_MORE, PARSE_NEED_MORE};
  const char *command = NULL;
  size_t offset = 0;
  for (size_t index = 0; index < 3; ++index) {
    if (!append_bytes(&input, wire + offset, (size_t)fragments[index])) return 1;
    offset += (size_t)fragments[index];
    states[index] = parse_ping(&input, &command);
  }

  printf("lengths=");
  for (size_t index = 0; index < 3; ++index) {
    printf("%s%d", index == 0 ? "" : ",", fragments[index]);
  }
  printf("\nstates=");
  for (size_t index = 0; index < 3; ++index) {
    const char *name = states[index] == PARSE_NEED_MORE
        ? "NEED_MORE" : states[index] == PARSE_OK ? "OK" : "ERROR";
    printf("%s%s", index == 0 ? "" : ",", name);
  }
  printf("\ncommand=%s\nconsumed=%zu\nunread=%zu\n",
         command == NULL ? "NONE" : command,
         input.read_index,
         input.length - input.read_index);

  const bool verified = input.length == 14 && offset == 14
      && states[0] == PARSE_NEED_MORE && states[1] == PARSE_NEED_MORE
      && states[2] == PARSE_OK && command != NULL && strcmp(command, "PING") == 0
      && input.read_index == 14 && input.length == input.read_index;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · Redis/Nginx 源码与原生服务交付：Nginx event cycle 与 upstream': makeC(
    'C 代码台 · 连接状态机与平滑加权上游',
    '先实现 read/write 事件驱动的连接状态机，再实现不依赖随机数的平滑加权轮询；每轮都输出容量、待写字节和选择理由。',
    'https://github.com/nginx/nginx/blob/master/src/event/ngx_event.c',
    [
      '跟做任务只在请求完整后切换到写阶段，下游容量不足时保留 pending 字节。',
      '独立任务每轮先累加权重，再选择最大 current，最后统一减去 total。',
      '这里模拟 Nginx event cycle 与 upstream 契约，不加载模块，也不发起真实代理请求。',
    ],
    cTask(
      'native-c-nginx-event-state-guided',
      '跟做：读写事件驱动的连接状态',
      '输入完整请求长度、本次可读字节和上游可写容量。连接先读入全部可用字节，再在上游容量内推进 write_offset，剩余字节留在写事件。',
      '5 5 3\n',
      '预期 read=5、written=3、pending=2、state=WRITING、cycles=2、verified=true。读阶段不能直接发送未完整请求。',
      String.raw`#include <stdbool.h>
#include <stdio.h>

enum connection_state {
  CONNECTION_READING = 1,
  CONNECTION_WRITING = 2,
  CONNECTION_CLOSED = 3,
};

struct connection {
  size_t request_length;
  size_t read_offset;
  size_t write_offset;
  enum connection_state state;
};

static bool read_event(struct connection *connection, size_t available) {
  if (connection->state != CONNECTION_READING) return false;
  size_t room = connection->request_length - connection->read_offset;
  size_t accepted = available < room ? available : room;
  connection->read_offset += accepted;
  if (connection->read_offset == connection->request_length) {
    connection->state = CONNECTION_WRITING;
  }
  return true;
}

static bool write_event(struct connection *connection, size_t capacity) {
  if (connection->state != CONNECTION_WRITING) return false;
  size_t pending = connection->request_length - connection->write_offset;
  size_t accepted = capacity < pending ? capacity : pending;
  connection->write_offset += accepted;
  if (connection->write_offset == connection->request_length) {
    connection->state = CONNECTION_CLOSED;
  }
  return true;
}

int main(void) {
  int request_length = 0;
  int readable = 0;
  int writable = 0;
  if (scanf("%d %d %d", &request_length, &readable, &writable) != 3
      || request_length <= 0 || readable < 0 || writable < 0) {
    return 2;
  }

  struct connection connection = {
      (size_t)request_length, 0, 0, CONNECTION_READING};
  int cycles = 0;
  if (readable > 0) {
    read_event(&connection, (size_t)readable);
    ++cycles;
  }
  if (connection.state == CONNECTION_WRITING && writable > 0) {
    write_event(&connection, (size_t)writable);
    ++cycles;
  }

  const size_t pending = connection.request_length - connection.write_offset;
  printf("read=%zu\nwritten=%zu\npending=%zu\nstate=%s\ncycles=%d\n",
         connection.read_offset,
         connection.write_offset,
         pending,
         connection.state == CONNECTION_READING ? "READING"
             : connection.state == CONNECTION_WRITING ? "WRITING" : "CLOSED",
         cycles);

  const bool verified = connection.read_offset == 5 && connection.write_offset == 3
      && pending == 2 && connection.state == CONNECTION_WRITING && cycles == 2;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-nginx-weighted-upstream-independent',
      '独立实践：平滑加权轮询与确定性选择',
      '输入三个上游权重。程序执行 total 次平滑加权轮询，每次选择 current 最大的上游，并在选中后给该上游减去 total。',
      '5 1 1\n',
      '预期 selections=0,0,1,0,2,0,0、counts=5,1,1、verified=true。选择顺序要平滑，不能连续让某个上游独占调度窗口。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

struct upstream {
  int weight;
  int current;
  int picks;
};

static int choose_upstream(struct upstream *upstreams, size_t count, int total) {
  for (size_t index = 0; index < count; ++index) {
    upstreams[index].current += upstreams[index].weight;
  }
  int selected = 0;
  for (size_t index = 1; index < count; ++index) {
    if (upstreams[index].current > upstreams[selected].current) {
      selected = (int)index;
    }
  }
  upstreams[selected].current -= total;
  ++upstreams[selected].picks;
  return selected;
}

int main(void) {
  int first_weight = 0;
  int second_weight = 0;
  int third_weight = 0;
  if (scanf("%d %d %d", &first_weight, &second_weight, &third_weight) != 3
      || first_weight <= 0 || second_weight <= 0 || third_weight <= 0) {
    return 2;
  }

  struct upstream upstreams[] = {
      {first_weight, 0, 0},
      {second_weight, 0, 0},
      {third_weight, 0, 0},
  };
  const int total = first_weight + second_weight + third_weight;
  int selections[64] = {0};
  if (total > 64) return 2;
  for (int round = 0; round < total; ++round) {
    selections[round] = choose_upstream(upstreams, 3, total);
  }

  printf("selections=");
  for (int round = 0; round < total; ++round) {
    printf("%s%d", round == 0 ? "" : ",", selections[round]);
  }
  printf("\ncounts=%d,%d,%d\n",
         upstreams[0].picks, upstreams[1].picks, upstreams[2].picks);

  const bool verified = upstreams[0].picks == first_weight
      && upstreams[1].picks == second_weight
      && upstreams[2].picks == third_weight;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C · 数据结构、并发与协议工程：二进制协议、序列化和字节序': makeC(
    'C 代码台 · 大端二进制头与流式帧重组',
    '先用固定宽度字节写入协议头并校验和反序列化，再处理跨任意网络分片的 32 位长度前缀帧；窄整数转换全部显式。',
    'https://en.cppreference.com/w/c/language/arithmetic_types',
    [
      '跟做任务按网络字节序写出 magic、id 与 payload 长度，再逐字段读回。',
      '独立任务只在读缓冲达到 header + body 时前移 read_index。',
      '协议结构不直接 memcpy 到宿主 struct，避免 padding 和端序泄漏到线格式。',
    ],
    cTask(
      'native-c-binary-header-guided',
      '跟做：编码并解码 12 字节协议头',
      '输入 magic、消息 id 与 payload 长度。encode_header 逐字节写大端整数，decode_header 再还原三个字段。',
      '77 42 300\n',
      '预期 bytes=00,00,00,4D,00,00,00,2A,00,00,01,2C、decoded=77,42,300、verified=true。不能把本机小端内存直接发送上线。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

struct header {
  uint32_t magic;
  uint32_t message_id;
  uint32_t payload_length;
};

static void put_u32_be(unsigned char *output, uint32_t value) {
  output[0] = (unsigned char)((value >> 24) & 0xffu);
  output[1] = (unsigned char)((value >> 16) & 0xffu);
  output[2] = (unsigned char)((value >> 8) & 0xffu);
  output[3] = (unsigned char)(value & 0xffu);
}

static uint32_t get_u32_be(const unsigned char *input) {
  return ((uint32_t)input[0] << 24)
      | ((uint32_t)input[1] << 16)
      | ((uint32_t)input[2] << 8)
      | (uint32_t)input[3];
}

static void encode_header(unsigned char *output, const struct header *header) {
  put_u32_be(output, header->magic);
  put_u32_be(output + 4, header->message_id);
  put_u32_be(output + 8, header->payload_length);
}

static struct header decode_header(const unsigned char *input) {
  return (struct header){get_u32_be(input), get_u32_be(input + 4), get_u32_be(input + 8)};
}

int main(void) {
  unsigned int magic = 0;
  unsigned int message_id = 0;
  unsigned int payload_length = 0;
  if (scanf("%u %u %u", &magic, &message_id, &payload_length) != 3) return 2;

  const struct header original = {magic, message_id, payload_length};
  unsigned char bytes[12] = {0};
  encode_header(bytes, &original);
  const struct header decoded = decode_header(bytes);

  printf("bytes=");
  for (size_t index = 0; index < sizeof bytes; ++index) {
    printf("%s%02X", index == 0 ? "" : ",", bytes[index]);
  }
  printf("\ndecoded=%u,%u,%u\n", decoded.magic, decoded.message_id, decoded.payload_length);

  const bool verified = decoded.magic == 77u && decoded.message_id == 42u
      && decoded.payload_length == 300u && bytes[3] == 0x4du && bytes[11] == 0x2cu;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
    cTask(
      'native-c-binary-stream-frames-independent',
      '独立实践：跨分片重组两个长度前缀帧',
      '依次输入三个分片长度。append 只追加字节，parse 循环读取 4 字节长度和完整正文；不完整时保持 read_index 不动。',
      '5 4 4\n',
      '预期 frames=2、payloads=OK,ACK、consumed=13、unread=0、verified=true。第二个帧未完整前，绝不能按猜测长度越过缓冲区。',
      String.raw`#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

struct frame_buffer {
  unsigned char bytes[64];
  size_t length;
  size_t read_index;
  int frames;
  bool saw_ok;
  bool saw_ack;
};

static uint32_t read_u32_be(const unsigned char *bytes) {
  return ((uint32_t)bytes[0] << 24) | ((uint32_t)bytes[1] << 16)
      | ((uint32_t)bytes[2] << 8) | (uint32_t)bytes[3];
}

static bool append(struct frame_buffer *buffer, const unsigned char *bytes, size_t count) {
  if (count > sizeof buffer->bytes - buffer->length) return false;
  memcpy(buffer->bytes + buffer->length, bytes, count);
  buffer->length += count;
  return true;
}

static int parse_frames(struct frame_buffer *buffer) {
  int parsed = 0;
  while (buffer->length - buffer->read_index >= 4) {
    const unsigned char *header = buffer->bytes + buffer->read_index;
    const uint32_t payload = read_u32_be(header);
    if (payload > 16) return -1;
    const size_t frame_size = 4 + (size_t)payload;
    if (buffer->length - buffer->read_index < frame_size) break;

    const unsigned char *body = header + 4;
    if (payload == 2 && memcmp(body, "OK", 2) == 0) buffer->saw_ok = true;
    if (payload == 3 && memcmp(body, "ACK", 3) == 0) buffer->saw_ack = true;
    buffer->read_index += frame_size;
    ++buffer->frames;
    ++parsed;
  }
  return parsed;
}

int main(void) {
  int first = 0;
  int second = 0;
  int third = 0;
  if (scanf("%d %d %d", &first, &second, &third) != 3
      || first <= 0 || second <= 0 || third <= 0) {
    return 2;
  }

  static const unsigned char wire[] = {
      0x00, 0x00, 0x00, 0x02, 'O', 'K',
      0x00, 0x00, 0x00, 0x03, 'A', 'C', 'K',
  };
  const int fragments[] = {first, second, third};
  struct frame_buffer buffer = {{0}, 0, 0, 0, false, false};
  size_t offset = 0;
  for (size_t index = 0; index < 3; ++index) {
    if (!append(&buffer, wire + offset, (size_t)fragments[index])) return 1;
    offset += (size_t)fragments[index];
    if (parse_frames(&buffer) < 0) return 1;
  }

  printf("frames=%d\npayloads=%s%s\nconsumed=%zu\nunread=%zu\n",
         buffer.frames,
         buffer.saw_ok ? "OK" : "",
         buffer.saw_ack ? ",ACK" : "",
         buffer.read_index,
         buffer.length - buffer.read_index);

  const bool verified = offset == sizeof wire && buffer.frames == 2
      && buffer.saw_ok && buffer.saw_ack
      && buffer.read_index == sizeof wire && buffer.length == buffer.read_index;
  printf("verified=%s\n", verified ? "true" : "false");
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 移动、模板、Concepts 与 STL：concepts、ranges 与错误诊断': makeCpp(
    'C++ 代码台 · concept 约束、ranges 排序与类型路由',
    '以 concept 限定平均值输入，用 ranges 算法计算中位数；再用 if constexpr 把整数计数和浮点比例路由到不同诊断格式。',
    'https://en.cppreference.com/w/cpp/language/constraints',
    [
      '本机以 g++ -std=c++20 -Wall -Wextra -Werror -pedantic main.cpp 编译。',
      '模板参数不满足 concept 时应在编译期拒绝，而不是运行期偷偷转换。',
      '两段程序都只使用标准库，不依赖 ranges 扩展库。',
    ],
    cppTask(
      'native-cpp-concepts-ranges-median-guided',
      '跟做：signed_integral 约束的中位数',
      '输入元素数量与整数序列。average 只接受 signed_integral 类型，std::ranges::sort 原地排序后返回中间元素作为中位数。',
      '5 5 2 8 1 3\n',
      '预期 sorted=1,2,3,5,8、average=3.8、median=3、verified=true。若传入无符号类型，模板约束应在编译期拒绝。',
      String.raw`#include <algorithm>
#include <concepts>
#include <iostream>
#include <numeric>
#include <ranges>
#include <string>
#include <vector>

template <std::signed_integral T>
double average(const std::vector<T>& values) {
  if (values.empty()) return 0.0;
  const long long total = std::accumulate(values.begin(), values.end(), 0LL);
  return static_cast<double>(total) / static_cast<double>(values.size());
}

template <std::signed_integral T>
T median_in_place(std::vector<T>& values) {
  std::ranges::sort(values);
  return values[values.size() / 2];
}

int main() {
  int count = 0;
  if (!(std::cin >> count) || count <= 0 || count > 20) return 2;
  std::vector<int> values(static_cast<std::size_t>(count));
  for (int& value : values) {
    if (!(std::cin >> value)) return 2;
  }

  const double mean = average(values);
  const int median = median_in_place(values);
  std::cout << "sorted=";
  for (std::size_t index = 0; index < values.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << values[index];
  }
  std::cout << "\naverage=" << mean << "\nmedian=" << median << '\n';

  const bool sorted = std::ranges::is_sorted(values);
  const bool verified = sorted && median == 3 && mean > 3.79 && mean < 3.81;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-concepts-type-router-independent',
      '独立实践：constexpr 分支路由整数与浮点指标',
      '输入指标类型与数值。MetricValue concept 同时允许整数和浮点；整数按计数格式化，浮点按比例格式化，非法类型在编译期失败。',
      'd 0.75\n',
      '预期 kind=ratio、normalized=0.75、label=75.0%、verified=true。浮点格式不能用整数截断；整数分支不能丢失精确计数。',
      String.raw`#include <concepts>
#include <format>
#include <iostream>
#include <string>
#include <type_traits>

template <typename T>
concept MetricValue = std::integral<std::remove_cvref_t<T>>
    || std::floating_point<std::remove_cvref_t<T>>;

template <MetricValue T>
std::string describe_metric(T value) {
  using value_type = std::remove_cvref_t<T>;
  if constexpr (std::integral<value_type>) {
    return std::format("kind=count value={} label={} items", value, value);
  } else {
    const double ratio = static_cast<double>(value);
    return std::format("kind=ratio normalized={:.2f} label={:.1f}%",
                       ratio,
                       ratio * 100.0);
  }
}

int main() {
  char kind = '\0';
  if (!(std::cin >> kind)) return 2;

  std::string description;
  double normalized = 0.0;
  if (kind == 'i') {
    int value = 0;
    if (!(std::cin >> value)) return 2;
    description = describe_metric(value);
    normalized = static_cast<double>(value);
  } else if (kind == 'd') {
    double value = 0.0;
    if (!(std::cin >> value)) return 2;
    description = describe_metric(value);
    normalized = value;
  } else {
    return 2;
  }

  std::cout << description << '\n';
  std::cout << "normalized=" << normalized << '\n';
  const bool verified = kind == 'd' && normalized > 0.749 && normalized < 0.751
      && description.starts_with("kind=ratio") && description.ends_with("75.0%");
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 移动、模板、Concepts 与 STL：vector 扩容、迭代器失效和分配器': makeCpp(
    'C++ 代码台 · 稳定分区、局部排序与扩容失效',
    '第一段组合 stable_partition 与 partial_sort；第二段用可控倍增策略扩容 vector，记录 data 指针何时失效，并验证值不丢不重。',
    'https://en.cppreference.com/w/cpp/container/vector',
    [
      '跟做任务先验证奇偶分区保持各自原始相对顺序，再检查前 k 个元素已升序。',
      '独立任务在容量不足时才 reserve，扩容后重新取得 data 指针。',
      '不要保存 push_back 前的迭代器跨越扩容点；记录指针变化正是本实验的核心。',
    ],
    cppTask(
      'native-cpp-vector-stl-stable-partition-guided',
      '跟做：stable_partition 后 partial_sort',
      '输入元素数量、序列和前缀长度 k。先按偶数在前稳定分区，再只对前 k 个元素做局部排序，保留分区语义。',
      '7 5 2 9 4 7 6 3 3\n',
      '预期 partition=2,4,6,5,9,7,3、prefix=2,4,6、evens=3、verified=true。普通 partition 不保证偶数内部顺序。',
      String.raw`#include <algorithm>
#include <iostream>
#include <vector>

int main() {
  int count = 0;
  int prefix = 0;
  if (!(std::cin >> count) || count <= 0 || count > 20) return 2;
  std::vector<int> values(static_cast<std::size_t>(count));
  for (int& value : values) {
    if (!(std::cin >> value)) return 2;
  }
  if (!(std::cin >> prefix) || prefix < 0 || prefix > count) return 2;

  const auto boundary = std::stable_partition(
      values.begin(), values.end(), [](int value) { return value % 2 == 0; });
  const std::size_t even_count = static_cast<std::size_t>(boundary - values.begin());
  if (prefix > 0) {
    std::partial_sort(values.begin(), values.begin() + prefix, boundary);
  }

  std::cout << "partition=";
  for (std::size_t index = 0; index < values.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << values[index];
  }
  std::cout << "\nprefix=";
  for (int index = 0; index < prefix; ++index) {
    std::cout << (index == 0 ? "" : ",") << values[static_cast<std::size_t>(index)];
  }
  std::cout << "\nevens=" << even_count << '\n';

  const bool partition_ok = std::all_of(
      values.begin(), boundary, [](int value) { return value % 2 == 0; });
  const bool prefix_sorted = std::is_sorted(values.begin(), values.begin() + prefix);
  const bool verified = even_count == 3 && partition_ok && prefix_sorted
      && values[0] == 2 && values[1] == 4 && values[2] == 6;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-vector-growth-invalidation-independent',
      '独立实践：显式倍增与指针失效审计',
      '输入目标元素数。append_with_growth 在 size 到达 capacity 时把容量翻倍并 reserve；每次扩容都重新取 data 指针并记录失效次数。',
      '10\n',
      '预期 size=10、capacity=12、reallocations=2、invalidations=2、sequence=0..9、verified=true。首次 reserve 建立容量，之后只有容量耗尽才扩容。',
      String.raw`#include <algorithm>
#include <cstddef>
#include <iostream>
#include <numeric>
#include <vector>

struct growth_audit {
  std::size_t reallocations = 0;
  std::size_t invalidations = 0;
};

static bool append_with_growth(std::vector<int>& values,
                               int next,
                               std::size_t initial_capacity,
                               growth_audit& audit) {
  if (values.capacity() < initial_capacity) values.reserve(initial_capacity);
  if (values.size() == values.capacity()) {
    const int* old_data = values.data();
    const std::size_t new_capacity = values.capacity() == 0
        ? initial_capacity : values.capacity() * 2;
    values.reserve(new_capacity);
    ++audit.reallocations;
    if (values.data() != old_data) ++audit.invalidations;
  }
  values.push_back(next);
  return values.back() == next;
}

int main() {
  int target = 0;
  if (!(std::cin >> target) || target <= 0 || target > 12) return 2;

  std::vector<int> values;
  growth_audit audit;
  for (int index = 0; index < target; ++index) {
    if (!append_with_growth(values, index, 3, audit)) return 1;
  }

  const bool sequence_ok = std::all_of(
      values.begin(), values.end(), [index = 0](int value) mutable {
        return value == index++;
      });
  const bool sorted = std::is_sorted(values.begin(), values.end());
  const bool verified = values.size() == 10 && values.capacity() == 12
      && audit.reallocations == 2 && audit.invalidations == 2
      && sequence_ok && sorted;

  std::cout << "size=" << values.size() << "\ncapacity=" << values.capacity()
            << "\nreallocations=" << audit.reallocations
            << "\ninvalidations=" << audit.invalidations << "\nsequence=";
  for (std::size_t index = 0; index < values.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << values[index];
  }
  std::cout << "\nverified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 并发、原子、内存模型与 Asio：future、promise 与任务队列': makeCpp(
    'C++ 代码台 · packaged_task 结果链与协程滑动窗口',
    '第一段用 packaged_task 在确定性任务队列中传递 future 结果；第二段实现 C++20 Generator，通过 co_yield 逐帧产出滑动窗口和。',
    'https://en.cppreference.com/w/cpp/coroutine/coroutine_handle',
    [
      '跟做任务不启动额外线程，先单独验证 promise/future 的所有权与结果提取。',
      '协程任务在每次 resume 后读取一个窗口和，不一次性构造结果数组。',
      '固定运行器使用 C++20；协程生命周期由 RAII handle 管理。',
    ],
    cppTask(
      'native-cpp-future-packaged-task-guided',
      '跟做：任务队列串起 promise 与 future',
      '输入起始值和任务数。首任务通过 promise 产生种子，后续任务从 packaged_task 的 future 读取前序结果，再依次做乘加变换。',
      '4 3\n',
      '预期 seed=4、values=9,19,39、final=39、verified=true。future 必须在本任务真正执行之后读取，不能先 get 后 execute。',
      String.raw`#include <algorithm>
#include <future>
#include <iostream>
#include <vector>

struct task {
  int sequence;
  std::packaged_task<int(int)> work;
};

int main() {
  int seed = 0;
  int task_count = 0;
  if (!(std::cin >> seed >> task_count) || task_count <= 0 || task_count > 8) {
    return 2;
  }

  std::promise<int> seed_promise;
  std::future<int> seed_future = seed_promise.get_future();
  seed_promise.set_value(seed);

  std::vector<task> queue;
  queue.reserve(static_cast<std::size_t>(task_count));
  for (int index = 0; index < task_count; ++index) {
    queue.push_back(task{index, std::packaged_task<int(int)>([index](int input) {
      return input * 2 + 1;
    })});
  }
  std::ranges::sort(queue, {}, &task::sequence);

  std::vector<int> values;
  int current = seed_future.get();
  for (task& next : queue) {
    std::future<int> result = next.work.get_future();
    next.work(current);
    current = result.get();
    values.push_back(current);
  }

  std::cout << "seed=" << seed << "\nvalues=";
  for (std::size_t index = 0; index < values.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << values[index];
  }
  std::cout << "\nfinal=" << current << '\n';
  const bool verified = values.size() == 3
      && values[0] == 9 && values[1] == 19 && values[2] == 39
      && current == 39;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-coroutine-window-independent',
      '独立实践：Generator 逐帧产出窗口和',
      '输入序列长度、窗口宽度和整数序列。协程在原始 vector 的稳定区间上累计每个窗口，调用方逐帧 resume 并检查窗口大小。',
      '6 3 2 4 6 8 10 12\n',
      '预期 sums=12,18,24,30、frames=4、verified=true。窗口右移必须减去离开元素、加入新元素，不能重复扫描整个窗口。',
      String.raw`#include <coroutine>
#include <cstddef>
#include <exception>
#include <iostream>
#include <numeric>
#include <vector>

template <typename T>
class generator {
 public:
  struct promise_type {
    T current{};
    generator get_return_object() {
      return generator{std::coroutine_handle<promise_type>::from_promise(*this)};
    }
    std::suspend_always initial_suspend() noexcept { return {}; }
    std::suspend_always final_suspend() noexcept { return {}; }
    std::suspend_always yield_value(T value) noexcept {
      current = value;
      return {};
    }
    void return_void() noexcept {}
    void unhandled_exception() { std::terminate(); }
  };

  explicit generator(std::coroutine_handle<promise_type> handle) : handle_(handle) {}
  generator(const generator&) = delete;
  generator& operator=(const generator&) = delete;
  generator(generator&& other) noexcept : handle_(other.handle_) {
    other.handle_ = {};
  }
  ~generator() {
    if (handle_) handle_.destroy();
  }

  bool next() {
    handle_.resume();
    return !handle_.done();
  }
  T value() const { return handle_.promise().current; }

 private:
  std::coroutine_handle<promise_type> handle_;
};

generator<int> sliding_sums(const std::vector<int>& values, std::size_t width) {
  int sum = std::accumulate(values.begin(), values.begin() + width, 0);
  co_yield sum;
  for (std::size_t right = width; right < values.size(); ++right) {
    sum -= values[right - width];
    sum += values[right];
    co_yield sum;
  }
}

int main() {
  int count = 0;
  int width = 0;
  if (!(std::cin >> count >> width) || count < width || width <= 0 || count > 32) {
    return 2;
  }
  std::vector<int> values(static_cast<std::size_t>(count));
  for (int& value : values) {
    if (!(std::cin >> value)) return 2;
  }

  auto frames = sliding_sums(values, static_cast<std::size_t>(width));
  std::vector<int> sums;
  while (frames.next()) sums.push_back(frames.value());

  std::cout << "sums=";
  for (std::size_t index = 0; index < sums.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << sums[index];
  }
  std::cout << "\nframes=" << sums.size() << '\n';
  const bool verified = sums == std::vector<int>{12, 18, 24, 30};
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 并发、原子、内存模型与 Asio：Asio io_context、strand 和定时器': makeCpp(
    'C++ 代码台 · 定时器队列与 strand 串行契约',
    '用 standard library 搭出 Asio 风格的 io_context 与 strand 调度器：前者按截止时间和投递序号稳定取任务，后者保证同一 strand 内顺序执行并支持取消。',
    'https://www.boost.org/doc/libs/release/doc/html/boost_asio.html',
    [
      '跟做任务先比较相同截止时间下 sequence 的次级排序。',
      '独立任务要求同一 strand 按 FIFO 执行，不同 strand 可以交错，但被取消的操作不得产生完成回调。',
      '这是 Asio 核心语义的契约模拟，不链接 Boost.Asio，也不创建真实 reactor 或 timerfd。',
    ],
    cppTask(
      'native-cpp-asio-timer-order-guided',
      '跟做：io_context 按截止时间稳定执行',
      '输入定时器数量和每个截止时刻。调度器以 due、sequence 为复合键从小顶堆取出任务，输出实际执行顺序。',
      '4 3 1 3 2\n',
      '预期 order=timer2,timer4,timer1,timer3。截止时刻 1、2 的操作先执行，时刻 3 的两个定时器再按投递顺序执行。',
      String.raw`#include <iostream>
#include <queue>
#include <string>
#include <vector>

struct timer_op {
  int due;
  int sequence;
  std::string name;
};

struct later_timer {
  bool operator()(const timer_op& left, const timer_op& right) const {
    if (left.due != right.due) return left.due > right.due;
    return left.sequence > right.sequence;
  }
};

int main() {
  int count = 0;
  if (!(std::cin >> count) || count <= 0 || count > 8) return 2;

  std::priority_queue<timer_op, std::vector<timer_op>, later_timer> timers;
  for (int index = 0; index < count; ++index) {
    int due = 0;
    if (!(std::cin >> due) || due < 0) return 2;
    timers.push(timer_op{due, index, "timer" + std::to_string(index + 1)});
  }

  std::vector<std::string> order;
  while (!timers.empty()) {
    order.push_back(timers.top().name);
    timers.pop();
  }

  std::cout << "order=";
  for (std::size_t index = 0; index < order.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << order[index];
  }
  std::cout << '\n';
  const std::vector<std::string> expected = {
      "timer2", "timer4", "timer1", "timer3"};
  const bool verified = order == expected;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-asio-strand-cancel-independent',
      '独立实践：strand FIFO 与取消令牌',
      '输入操作数量和取消序号。调度器按 strand 分组、组内按投递序号执行；取消操作只从队列删除，不产生完成结果。',
      '4 2\n',
      '预期 completed=read,write,close、cancelled=timer、same_strand_order=read<write、verified=true。不同 strand 可以交错，同一 strand 不得并发。',
      String.raw`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct operation {
  int sequence;
  int strand;
  int cancel_id;
  std::string name;
  bool completed = false;
};

static void run_strand(std::vector<operation>& operations, int strand) {
  std::vector<std::size_t> order;
  for (std::size_t index = 0; index < operations.size(); ++index) {
    if (operations[index].strand == strand) order.push_back(index);
  }
  std::stable_sort(order.begin(), order.end(), [&](std::size_t left, std::size_t right) {
    return operations[left].sequence < operations[right].sequence;
  });
  for (std::size_t index : order) {
    operation& current = operations[index];
    if (current.sequence != current.cancel_id) current.completed = true;
  }
}

int main() {
  int count = 0;
  int cancelled = 0;
  if (!(std::cin >> count >> cancelled) || count <= 0 || count > 8) return 2;

  std::vector<operation> operations;
  const char* names[] = {"read", "timer", "write", "close"};
  for (int index = 0; index < count; ++index) {
    operations.push_back(operation{
        index + 1,
        index % 2 == 0 ? 1 : 2,
        cancelled,
        names[index % 4],
    });
  }
  run_strand(operations, 1);
  run_strand(operations, 2);

  std::vector<std::string> completed;
  std::vector<std::string> skipped;
  for (const operation& current : operations) {
    (current.completed ? completed : skipped).push_back(current.name);
  }

  std::cout << "completed=";
  for (std::size_t index = 0; index < completed.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << completed[index];
  }
  std::cout << "\ncancelled=";
  for (std::size_t index = 0; index < skipped.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << skipped[index];
  }
  const bool same_strand_order = completed.size() >= 2
      && completed[0] == "read" && completed[1] == "write";
  const bool verified = completed == std::vector<std::string>{"read", "write", "close"}
      && skipped == std::vector<std::string>{"timer"} && same_strand_order;
  std::cout << "\nsame_strand_order=read<write\nverified="
            << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 构建、ABI、动态库与跨平台发布：ABI、name mangling 和标准库差异': makeCpp(
    'C++ 代码台 · Itanium 修饰名与跨 ABI 插件边界',
    '先按框架规则编码 Itanium 风格函数名，再检查插件结构是否保持 standard-layout，并验证外部 C 符号只暴露版本化 POD 记录。',
    'https://itanium-cxx-abi.github.io/cxx-abi/abi.html',
    [
      '跟做任务只模拟 Itanium 名称编码规则，不声称覆盖模板、重载运算符或嵌套命名空间全集。',
      '独立任务把跨库接口压缩为 extern C 函数、固定宽度整数和显式 ABI 版本。',
      '不要跨 DLL/.so 边界直接传 STL 容器；不同标准库布局不具备稳定 ABI。',
    ],
    cppTask(
      'native-cpp-abi-mangling-guided',
      '跟做：编码命名空间函数的 Itanium 修饰名',
      '输入命名空间、函数名、参数个数和基础类型代码。encoder 先写 _ZN，再逐段写名字长度与正文，最后写 E 和参数码。',
      'shop total 2 i i\n',
      '预期 mangled=_ZN4shop5totalEii、parts=4、verified=true。两个名字段和两个参数段都必须显式编码。',
      String.raw`#include <cctype>
#include <iostream>
#include <string>
#include <vector>

static bool valid_identifier(const std::string& value) {
  if (value.empty() || std::isdigit(static_cast<unsigned char>(value.front()))) {
    return false;
  }
  for (unsigned char ch : value) {
    if (!(std::isalnum(ch) || ch == '_')) return false;
  }
  return true;
}

static std::string encode_function(const std::string& name_space,
                                   const std::string& function,
                                   const std::vector<char>& parameters) {
  std::string encoded = "_ZN";
  encoded += std::to_string(name_space.size()) + name_space;
  encoded += std::to_string(function.size()) + function;
  encoded += 'E';
  for (char code : parameters) encoded += code;
  return encoded;
}

int main() {
  std::string name_space;
  std::string function;
  int arity = 0;
  if (!(std::cin >> name_space >> function >> arity)
      || arity < 0 || arity > 8 || !valid_identifier(name_space)
      || !valid_identifier(function)) {
    return 2;
  }

  std::vector<char> parameters(static_cast<std::size_t>(arity));
  for (char& code : parameters) {
    if (!(std::cin >> code) || (code != 'i' && code != 'd' && code != 'b')) {
      return 2;
    }
  }

  const std::string mangled = encode_function(name_space, function, parameters);
  std::cout << "mangled=" << mangled << '\n';
  const bool verified = mangled == "_ZN4shop5totalEii" && parameters.size() == 2;
  std::cout << "parts=" << 2 + parameters.size() << "\nverified="
            << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-abi-plugin-record-independent',
      '独立实践：版本化 POD 插件接口',
      '输入请求的 ABI 主版本。插件只输出固定宽度字段、standard-layout 记录和 extern C 查询函数；版本不匹配时必须在加载后立即拒绝。',
      '2\n',
      '预期 abi=2、record_size=12、standard_layout=true、compatible=true、verified=true。接口不得出现 std::string、std::vector 或异常跨边界传播。',
      String.raw`#include <cstddef>
#include <cstdint>
#include <iostream>
#include <type_traits>

struct plugin_record {
  std::uint32_t id;
  std::int32_t score;
  std::uint32_t flags;
};

static_assert(std::is_standard_layout_v<plugin_record>);
static_assert(std::is_trivially_copyable_v<plugin_record>);
static_assert(sizeof(plugin_record) == 12);

extern "C" std::uint32_t plugin_abi_version() {
  return 2;
}

extern "C" plugin_record plugin_make_record(std::uint32_t id, std::int32_t score) {
  return plugin_record{id, score, 0u};
}

static bool compatible(std::uint32_t requested) {
  return requested == plugin_abi_version();
}

int main() {
  std::uint32_t requested = 0;
  if (!(std::cin >> requested)) return 2;
  const plugin_record record = plugin_make_record(77u, 42);
  const bool layout_ok = std::is_standard_layout_v<plugin_record>
      && std::is_trivially_copyable_v<plugin_record>
      && sizeof(plugin_record) == 12;
  const bool accepted = compatible(requested);

  std::cout << "abi=" << plugin_abi_version()
            << "\nrecord_size=" << sizeof(plugin_record)
            << "\nstandard_layout=" << std::boolalpha << layout_ok
            << "\ncompatible=" << accepted
            << "\nrecord=" << record.id << "," << record.score << '\n';
  const bool verified = requested == 2 && layout_ok && accepted
      && record.id == 77u && record.score == 42;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · 工具链、CMake Presets 与第一个工程：CMake target 与 PUBLIC/PRIVATE': makeCpp(
    'C++ 代码台 · target 使用需求与配置门禁',
    '用目标图模拟 INTERFACE_INCLUDE_DIRECTORIES、PRIVATE 源目录和 link usage requirements；再按 C++ 标准、PIC 与 sanitizer 需求生成 configure 结论。',
    'https://cmake.org/cmake/help/latest/command/target_link_libraries.html',
    [
      '跟做任务区分 PUBLIC、PRIVATE 与 INTERFACE 三类传递方向。',
      '独立任务在 configure 阶段集中校验标准与功能要求，失败信息必须指出具体缺口。',
      '当前运行器不安装 CMake；程序模拟 target 元数据传播，不执行真实 configure 或 build。',
    ],
    cppTask(
      'native-cpp-cmake-public-private-guided',
      '跟做：PUBLIC 与 PRIVATE 的传递边界',
      '输入根目标名。目标图从 consumer 沿 PUBLIC 依赖递归收集 include，PRIVATE 源目录只属于定义者，link PRIVATE 依赖不进入消费者接口。',
      'consumer\n',
      '预期 includes=consumer/include,core/include、private_hidden=core/src、public_links=core、verified=true。PRIVATE include 不得泄漏给 consumer。',
      String.raw`#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

struct target_meta {
  std::vector<std::string> public_includes;
  std::vector<std::string> private_includes;
  std::vector<std::string> public_links;
  std::vector<std::string> private_links;
};

static void collect_public(const std::map<std::string, target_meta>& graph,
                           const std::string& name,
                           std::set<std::string>& includes,
                           std::set<std::string>& links) {
  const auto found = graph.find(name);
  if (found == graph.end()) return;
  const target_meta& meta = found->second;
  includes.insert(meta.public_includes.begin(), meta.public_includes.end());
  for (const std::string& dependency : meta.public_links) {
    links.insert(dependency);
    collect_public(graph, dependency, includes, links);
  }
}

int main() {
  std::string root;
  if (!(std::cin >> root)) return 2;
  const std::map<std::string, target_meta> graph = {
      {"core", {{"core/include"}, {"core/src"}, {}, {}}},
      {"consumer",
       {{"consumer/include"}, {}, {"core"}, {"internal_only"}}},
  };
  if (!graph.contains(root)) return 2;

  std::set<std::string> includes;
  std::set<std::string> links;
  collect_public(graph, root, includes, links);
  const target_meta& leaf = graph.at("core");

  std::cout << "includes=";
  std::size_t count = 0;
  for (const std::string& include : includes) {
    std::cout << (count++ == 0 ? "" : ",") << include;
  }
  std::cout << "\nprivate_hidden=" << leaf.private_includes.front()
            << "\npublic_links=";
  count = 0;
  for (const std::string& link : links) {
    std::cout << (count++ == 0 ? "" : ",") << link;
  }
  const bool verified = includes.contains("consumer/include")
      && includes.contains("core/include")
      && !includes.contains("core/src")
      && !links.contains("internal_only");
  std::cout << "\nverified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-cmake-configure-guard-independent',
      '独立实践：C++20、PIC 与 sanitizer 需求门禁',
      '输入请求标准、是否构建共享库、是否请求 ASan/UBSan。configure_target 汇总全部缺口后一次性失败，而不是只报告第一个问题。',
      '20 1 1\n',
      '预期 standard=ok、pic=ok、sanitizer=asan+ubsan、accepted=true、gaps=0、verified=true。标准 17 必须被要求的 C++20 特性拒绝。',
      String.raw`#include <iostream>
#include <string>
#include <vector>

struct configure_request {
  int standard;
  bool shared;
  bool sanitizer;
};

struct target_requirements {
  int minimum_standard = 20;
  bool requires_pic = true;
  bool supports_asan_ubsan = true;
};

static std::vector<std::string> evaluate(const configure_request& request,
                                         const target_requirements& target) {
  std::vector<std::string> gaps;
  if (request.standard < target.minimum_standard) gaps.push_back("CXX_STANDARD");
  if (target.requires_pic && !request.shared) gaps.push_back("POSITION_INDEPENDENT_CODE");
  if (request.sanitizer && !target.supports_asan_ubsan) gaps.push_back("ASAN_UBSAN");
  return gaps;
}

int main() {
  int standard = 0;
  int shared = 0;
  int sanitizer = 0;
  if (!(std::cin >> standard >> shared >> sanitizer)
      || (shared != 0 && shared != 1) || (sanitizer != 0 && sanitizer != 1)) {
    return 2;
  }
  const configure_request request{standard, shared == 1, sanitizer == 1};
  const target_requirements target;
  const std::vector<std::string> gaps = evaluate(request, target);

  std::cout << "standard=" << (standard >= 20 ? "ok" : "missing")
            << "\npic=" << (request.shared ? "ok" : "missing")
            << "\nsanitizer=" << (request.sanitizer ? "asan+ubsan" : "none")
            << "\naccepted=" << std::boolalpha << gaps.empty()
            << "\ngaps=" << gaps.size() << '\n';
  const bool verified = request.standard == 20 && request.shared
      && request.sanitizer && gaps.empty();
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：ASan、UBSan、TSan 和 MSan 边界': makeCpp(
    'C++ 代码台 · 在触发 UB 前完成 sanitizer 前置诊断',
    '第一段用标准库边界检查阻止有符号溢出和越界，第二段审计线程访问的锁与初始化状态，模拟 TSan/MSan 会报告的证据链。',
    'https://clang.llvm.org/docs/index.html',
    [
      '诊断代码本身不制造未定义行为，而是在执行危险操作前返回明确原因。',
      'TSan 是否发生竞争取决于 happens-before，而不是线程号是否相同。',
      '固定运行器不保证 ASan/TSan runtime 可用；本实验验证可移植的显式 guard 与访问审计，不等同于真实 instrumented 构建。',
    ],
    cppTask(
      'native-cpp-sanitizer-ubsan-asan-guided',
      '跟做：有符号溢出与越界前置 guard',
      '输入起点、增量、访问下标和缓冲区容量。checked_add 在超过 int 上界前返回失败，at_checked 在下标出界时不执行解引用。',
      '2147483645 10 4 3\n',
      '预期 add=rejected、index=rejected、buffer_untouched=true、verified=true。输出不能出现 UBSan overflow 或 ASan heap-buffer-overflow。',
      String.raw`#include <cstddef>
#include <iostream>
#include <limits>
#include <vector>

static bool checked_add(int left, int right, int& output) {
  if ((right > 0 && left > std::numeric_limits<int>::max() - right)
      || (right < 0 && left < std::numeric_limits<int>::min() - right)) {
    return false;
  }
  output = left + right;
  return true;
}

static bool at_checked(const std::vector<int>& values, int index, int& output) {
  if (index < 0 || static_cast<std::size_t>(index) >= values.size()) return false;
  output = values[static_cast<std::size_t>(index)];
  return true;
}

int main() {
  int base = 0;
  int delta = 0;
  int index = 0;
  int capacity = 0;
  if (!(std::cin >> base >> delta >> index >> capacity)
      || capacity <= 0 || capacity > 16) {
    return 2;
  }

  std::vector<int> buffer(static_cast<std::size_t>(capacity), 7);
  int added = 0;
  int read = 0;
  const bool add_ok = checked_add(base, delta, added);
  const bool index_ok = at_checked(buffer, index, read);
  const bool touched = index >= 0 && static_cast<std::size_t>(index) < buffer.size();

  std::cout << "add=" << (add_ok ? "accepted" : "rejected")
            << "\nindex=" << (index_ok ? "accepted" : "rejected")
            << "\nbuffer_untouched=" << std::boolalpha << !touched << '\n';
  const bool verified = !add_ok && !index_ok && !touched
      && buffer.size() == static_cast<std::size_t>(capacity);
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-sanitizer-tsan-msan-independent',
      '独立实践：happens-before 与初始化证据审计',
      '输入最小共享锁键和最小发布 epoch。访问审计把无共同锁且 epoch 不足的读写判为数据竞争，把未发布值判为未初始化读取。',
      '4 2\n',
      '预期 races=2、uninitialized=1、accepted=false、verified=true。无锁读写冲突和未初始化读取都必须被审计捕获。',
      String.raw`#include <cstddef>
#include <iostream>
#include <string>
#include <vector>

struct access {
  int thread;
  int lock_key;
  int epoch;
  bool write;
  bool initialized;
  std::string site;
};

struct audit_result {
  int races = 0;
  int uninitialized = 0;
  std::string first_race;
};

static bool has_happens_before(const access& left, const access& right, int min_epoch) {
  if (left.lock_key != 0 && left.lock_key == right.lock_key) return true;
  return left.epoch >= right.epoch + min_epoch;
}

static audit_result audit(const std::vector<access>& accesses, int min_epoch) {
  audit_result result;
  for (std::size_t left_index = 0; left_index < accesses.size(); ++left_index) {
    const access& left = accesses[left_index];
    if (!left.initialized) ++result.uninitialized;
    for (std::size_t right_index = left_index + 1; right_index < accesses.size(); ++right_index) {
      const access& right = accesses[right_index];
      const bool conflict = left.write || right.write;
      if (conflict && !has_happens_before(left, right, min_epoch)
          && !has_happens_before(right, left, min_epoch)) {
        ++result.races;
        if (result.first_race.empty()) result.first_race = left.site + "<->" + right.site;
      }
    }
  }
  return result;
}

int main() {
  int min_lock = 0;
  int min_epoch = 0;
  if (!(std::cin >> min_lock >> min_epoch) || min_epoch <= 0) return 2;
  const std::vector<access> accesses = {
      {1, min_lock, 1, false, true, "reader"},
      {2, 0, 1, true, true, "writer"},
      {2, 0, 1, false, false, "uninit-read"},
  };
  const audit_result result = audit(accesses, min_epoch);
  const bool accepted = result.races == 0 && result.uninitialized == 0;

  std::cout << "races=" << result.races
            << "\nuninitialized=" << result.uninitialized
            << "\nfirst_race=" << result.first_race
            << "\naccepted=" << std::boolalpha << accepted << '\n';
  const bool verified = result.races == 2 && result.uninitialized == 1
      && !accepted && !result.first_race.empty();
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：perf、火焰图和缓存局部性': makeCpp(
    'C++ 代码台 · 行/列遍历基准与火焰图聚合',
    '先比较行优先与列优先访问产生的确定性 cache line 触点，并用 steady_clock 记录耗时；再按调用栈聚合展示每帧 inclusive 与 leaf 次数。',
    'https://perf.wiki.kernel.org/index.php/Main_Page',
    [
      '跟做任务只对 cache miss 模型做硬断言，墙钟时间用于观察波动，不设置机器相关阈值。',
      '火焰图聚合从每个采样栈的最外层到叶子逐帧增加 inclusive 计数。',
      '避免把编译器优化后的空循环当成 benchmark；两段遍历结果都要参与 checksum。',
    ],
    cppTask(
      'native-cpp-perf-cache-benchmark-guided',
      '跟做：行优先与列优先缓存触点',
      '输入方阵边长。两段遍历得到相同 checksum，但列优先按行主序跨 cache line；程序输出确定性 miss 模型和实际测量耗时。',
      '64\n',
      '预期 row_misses=512、column_misses=4096、checksum_equal=true、verified=true。耗时每次不同，因此不能据此判断程序失败。',
      String.raw`#include <chrono>
#include <cstddef>
#include <iostream>
#include <numeric>
#include <vector>

static long long row_major(const std::vector<int>& matrix, std::size_t size) {
  (void)size;
  return std::accumulate(matrix.begin(), matrix.end(), 0LL);
}

static long long column_major(const std::vector<int>& matrix, std::size_t size) {
  long long total = 0;
  for (std::size_t column = 0; column < size; ++column) {
    for (std::size_t row = 0; row < size; ++row) {
      total += matrix[row * size + column];
    }
  }
  return total;
}

int main() {
  int size_input = 0;
  if (!(std::cin >> size_input) || size_input <= 0
      || size_input > 128 || size_input % 8 != 0) {
    return 2;
  }
  const std::size_t size = static_cast<std::size_t>(size_input);
  std::vector<int> matrix(size * size);
  for (std::size_t index = 0; index < matrix.size(); ++index) {
    matrix[index] = static_cast<int>(index % 17 + 1);
  }

  const auto row_start = std::chrono::steady_clock::now();
  const long long row_sum = row_major(matrix, size);
  const auto row_end = std::chrono::steady_clock::now();
  const auto column_start = std::chrono::steady_clock::now();
  const long long column_sum = column_major(matrix, size);
  const auto column_end = std::chrono::steady_clock::now();

  const std::size_t lines_per_row = size / 8;
  const std::size_t row_misses = size * lines_per_row;
  const std::size_t column_misses = size * size;
  const auto row_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
      row_end - row_start).count();
  const auto column_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
      column_end - column_start).count();

  std::cout << "row_misses=" << row_misses
            << "\ncolumn_misses=" << column_misses
            << "\nrow_ns=" << row_ns
            << "\ncolumn_ns=" << column_ns
            << "\nchecksum_equal=" << std::boolalpha << (row_sum == column_sum) << '\n';
  const bool verified = row_sum == column_sum && row_misses < column_misses;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-perf-flamegraph-aggregate-independent',
      '独立实践：采样栈的 inclusive 与 leaf 聚合',
      '输入采样数量。程序从固定调用栈集合中取前 n 个样本，累加每个帧的 inclusive 次数，并单独统计叶子帧。',
      '4\n',
      '预期 inclusive=A:4,B:3,C:2,D:1,E:1、leaf=C:2,D:1,E:1、top=A、verified=true。父帧次数必须大于等于任一子帧。',
      String.raw`#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

int main() {
  int sample_count = 0;
  if (!(std::cin >> sample_count) || sample_count <= 0 || sample_count > 4) {
    return 2;
  }
  const std::vector<std::vector<std::string>> stacks = {
      {"A", "B", "C"},
      {"A", "B", "D"},
      {"A", "E"},
      {"A", "B", "C"},
  };

  std::map<std::string, int> inclusive;
  std::map<std::string, int> leaves;
  for (int index = 0; index < sample_count; ++index) {
    std::set<std::string> unique_frames;
    for (const std::string& frame : stacks[static_cast<std::size_t>(index)]) {
      unique_frames.insert(frame);
    }
    for (const std::string& frame : unique_frames) ++inclusive[frame];
    ++leaves[stacks[static_cast<std::size_t>(index)].back()];
  }

  std::string top;
  int top_count = -1;
  for (const auto& [frame, count] : inclusive) {
    if (count > top_count) {
      top = frame;
      top_count = count;
    }
  }

  std::cout << "inclusive=";
  std::size_t emitted = 0;
  for (const auto& [frame, count] : inclusive) {
    std::cout << (emitted++ == 0 ? "" : ",") << frame << ":" << count;
  }
  std::cout << "\nleaf=";
  emitted = 0;
  for (const auto& [frame, count] : leaves) {
    std::cout << (emitted++ == 0 ? "" : ",") << frame << ":" << count;
  }
  std::cout << "\ntop=" << top << '\n';

  const bool counts_ok = inclusive["A"] == 4 && inclusive["B"] == 3
      && inclusive["C"] == 2 && inclusive["D"] == 1 && inclusive["E"] == 1;
  const bool leaves_ok = leaves["C"] == 2 && leaves["D"] == 1 && leaves["E"] == 1;
  const bool parent_ok = inclusive["A"] >= inclusive["B"]
      && inclusive["B"] >= inclusive["C"];
  const bool verified = counts_ok && leaves_ok && parent_ok && top == "A";
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · Sanitizer、Benchmark、perf 与崩溃诊断：core dump、符号化和版本追踪': makeCpp(
    'C++ 代码台 · 结构化崩溃记录与地址符号化',
    '第一段构造 signal、thread、pc、build id 的稳定记录；第二段用模块基址和符号表解析相对地址，避免只看到一串裸地址。',
    'https://sourceware.org/gdb/current/onlinedocs/gdb.html/',
    [
      '跟做任务不主动制造崩溃，只验证崩溃处理器应采集的最小字段。',
      '独立任务先检查地址所属模块，再用符号区间选择最深命中项。',
      '真实 core dump 还需要构建 ID、调试包和匹配二进制；本实验验证记录格式与符号化算法。',
    ],
    cppTask(
      'native-cpp-crash-record-guided',
      '跟做：生成可检索的崩溃记录',
      '输入信号编号、线程号、程序计数器偏移和 build id。record_failure 输出单行 key=value 记录，缺失 build id 时明确标记 unknown。',
      '11 7 42 build-abc\n',
      '预期 signal=11、thread=7、pc=0x2a、build=build-abc、verified=true。裸地址必须同时携带模块版本，便于还原符号。',
      String.raw`#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>

struct crash_record {
  int signal;
  int thread;
  std::uintptr_t pc;
  std::string build_id;
};

static std::string format_record(const crash_record& record) {
  std::ostringstream output;
  output << "signal=" << record.signal
         << " thread=" << record.thread
         << " pc=0x" << std::hex << record.pc
         << " build=" << (record.build_id.empty() ? "unknown" : record.build_id);
  return output.str();
}

int main() {
  int signal = 0;
  int thread = 0;
  std::uintptr_t pc = 0;
  std::string build_id;
  if (!(std::cin >> signal >> thread >> pc >> build_id)
      || signal <= 0 || thread <= 0 || build_id.empty()) {
    return 2;
  }
  const crash_record record{signal, thread, pc, build_id};
  const std::string formatted = format_record(record);
  std::cout << formatted << '\n';

  const bool verified = signal == 11 && thread == 7 && pc == 42
      && formatted.find("pc=0x2a") != std::string::npos
      && formatted.find("build=build-abc") != std::string::npos;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-crash-symbolize-independent',
      '独立实践：模块基址、偏移与符号区间',
      '输入模块基址、崩溃 pc 偏移和 build id。符号器把绝对地址转换为 file offset，在命中区间的符号中选择地址不超过 pc 的最右项。',
      '4194304 42 build-42\n',
      '预期 module_offset=42、symbol=parse_header、symbol_offset=10、build=build-42、verified=true。选错相邻符号通常意味着区间上界被写成了闭区间。',
      String.raw`#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

struct symbol {
  std::uintptr_t address;
  std::string name;
};

struct frame {
  std::string symbol;
  std::uintptr_t offset;
  std::string build_id;
};

static frame symbolize(std::uintptr_t base,
                       std::uintptr_t pc,
                       const std::string& build_id,
                       const std::vector<symbol>& symbols) {
  frame result{"unknown", pc - base, build_id};
  if (pc < base) return result;
  const std::uintptr_t address = pc - base;
  for (const symbol& candidate : symbols) {
    if (candidate.address <= address
        && (result.symbol == "unknown"
            || candidate.address > (address - result.offset))) {
      result.symbol = candidate.name;
      result.offset = address - candidate.address;
    }
  }
  return result;
}

int main() {
  std::uintptr_t base = 0;
  std::uintptr_t offset = 0;
  std::string build_id;
  if (!(std::cin >> base >> offset >> build_id) || base == 0 || build_id.empty()) {
    return 2;
  }
  const std::uintptr_t pc = base + offset;
  const std::vector<symbol> symbols = {
      {0, "service_main"},
      {32, "parse_header"},
      {80, "dispatch"},
      {120, "stop_service"},
  };
  const frame resolved = symbolize(base, pc, build_id, symbols);

  std::cout << "module_offset=" << offset
            << "\nsymbol=" << resolved.symbol
            << "\nsymbol_offset=" << resolved.offset
            << "\nbuild=" << resolved.build_id << '\n';
  const bool verified = offset == 42 && resolved.symbol == "parse_header"
      && resolved.offset == 10 && resolved.build_id == "build-42";
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),

  'programming:C++ · STL/Asio 源码与高性能毕业项目：C++ 高性能服务毕业项目与源码答辩': makeCpp(
    'C++ 代码台 · 截止期服务调度与故障恢复毕业验收',
    '第一段实现 deadline 最小堆、请求完成指标和慢请求阈值；第二段把重试预算、熔断状态机与优雅停机组合成可复现的故障演练。',
    'https://en.cppreference.com/w/cpp/container/priority_queue',
    [
      '跟做任务按 deadline、arrival_sequence 稳定调度，并单独统计超时请求。',
      '独立任务只有在重试预算内才允许再次调用；熔断打开后必须经过 half-open 探测。',
      '两段实验都不依赖网络和第三方框架，重点验证服务语义与可检查指标。',
    ],
    cppTask(
      'native-cpp-capstone-deadline-scheduler-guided',
      '跟做：deadline 最小堆与完成指标',
      '输入请求数量和每个截止时刻。调度器按 deadline 升序、到达序号稳定执行；统计完成数、最大延迟和超时阈值。',
      '4 1 3 1 5\n',
      '预期 order=req1,req3,req2,req4、completed=4、max_lateness=1、slow=1、verified=true。相同 deadline 时不能破坏到达顺序。',
      String.raw`#include <cstddef>
#include <iostream>
#include <queue>
#include <string>
#include <vector>

struct request {
  int id;
  int deadline;
  int arrived;
};

struct due_first {
  bool operator()(const request& left, const request& right) const {
    if (left.deadline != right.deadline) return left.deadline > right.deadline;
    return left.arrived > right.arrived;
  }
};

int main() {
  int count = 0;
  if (!(std::cin >> count) || count <= 0 || count > 16) return 2;
  std::priority_queue<request, std::vector<request>, due_first> requests;
  for (int index = 0; index < count; ++index) {
    int deadline = 0;
    if (!(std::cin >> deadline) || deadline < 0) return 2;
    requests.push(request{index + 1, deadline, index});
  }

  std::vector<std::string> order;
  int elapsed = 0;
  int max_lateness = 0;
  int slow = 0;
  while (!requests.empty()) {
    const request current = requests.top();
    requests.pop();
    elapsed += 1;
    const int lateness = elapsed > current.deadline ? elapsed - current.deadline : 0;
    if (lateness > max_lateness) max_lateness = lateness;
    if (lateness > 0) ++slow;
    order.push_back("req" + std::to_string(current.id));
  }

  std::cout << "order=";
  for (std::size_t index = 0; index < order.size(); ++index) {
    std::cout << (index == 0 ? "" : ",") << order[index];
  }
  std::cout << "\ncompleted=" << order.size()
            << "\nmax_lateness=" << max_lateness
            << "\nslow=" << slow << '\n';
  const std::vector<std::string> expected = {"req1", "req3", "req2", "req4"};
  const bool verified = order == expected && max_lateness == 1 && slow == 1;
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
    cppTask(
      'native-cpp-capstone-resilience-independent',
      '独立实践：重试预算、熔断探测与优雅停机',
      '输入连续失败阈值、最大尝试次数和待排空请求数。熔断在达到阈值后打开，下一次尝试以 half-open 探测；成功后关闭并排空队列。',
      '2 4 5\n',
      '预期 attempts=3、failures=2、circuit_trips=1、state=CLOSED、drained=5、verified=true。超过预算的请求必须拒绝，不能无限重试。',
      String.raw`#include <cstddef>
#include <iostream>
#include <string>
#include <vector>

enum class circuit_state { closed, open, half_open };

struct resilience_run {
  int failure_threshold;
  int max_attempts;
  int queued_requests;
  int attempts = 0;
  int failures = 0;
  int trips = 0;
  circuit_state state = circuit_state::closed;
  int drained = 0;
};

static bool invoke_service(int attempt, int failure_threshold) {
  return attempt > failure_threshold;
}

static void drain(std::vector<int>& queue, resilience_run& run) {
  while (!queue.empty() && run.state == circuit_state::closed) {
    queue.pop_back();
    ++run.drained;
  }
}

static std::string state_name(circuit_state state) {
  switch (state) {
    case circuit_state::closed: return "CLOSED";
    case circuit_state::open: return "OPEN";
    case circuit_state::half_open: return "HALF_OPEN";
  }
  return "UNKNOWN";
}

int main() {
  int threshold = 0;
  int attempts_limit = 0;
  int queued = 0;
  if (!(std::cin >> threshold >> attempts_limit >> queued)
      || threshold <= 0 || attempts_limit < threshold || queued < 0) {
    return 2;
  }

  resilience_run run{threshold, attempts_limit, queued};
  std::vector<int> queue(static_cast<std::size_t>(queued));
  for (int index = 0; index < queued; ++index) queue[static_cast<std::size_t>(index)] = index;

  while (run.attempts < run.max_attempts) {
    if (run.state == circuit_state::open) {
      run.state = circuit_state::half_open;
    }
    ++run.attempts;
    if (invoke_service(run.attempts, threshold)) {
      run.state = circuit_state::closed;
      break;
    }
    ++run.failures;
    if (run.failures >= threshold) {
      run.state = circuit_state::open;
      ++run.trips;
    }
  }
  drain(queue, run);

  std::cout << "attempts=" << run.attempts
            << "\nfailures=" << run.failures
            << "\ncircuit_trips=" << run.trips
            << "\nstate=" << state_name(run.state)
            << "\ndrained=" << run.drained << '\n';
  const bool verified = run.attempts == 3 && run.failures == 2
      && run.trips == 1 && run.state == circuit_state::closed
      && run.drained == queued && queue.empty();
  std::cout << "verified=" << std::boolalpha << verified << '\n';
  return verified ? 0 : 1;
}
`,
    ),
  ),
};
