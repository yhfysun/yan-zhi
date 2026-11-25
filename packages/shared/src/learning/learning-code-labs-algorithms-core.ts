import type { LearningV2CodeLab } from './v2-types.js';

const NODE_RUNTIME = {
  requiredRuntime: 'node' as const,
  runtimeLabel: 'JavaScript / Node.js 内置运行时',
  docsUrl: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
  installSteps: [
    'JavaScript 由应用内置 Node.js 运行，无需安装。',
    '先按 stdin 中的输入手算预期结果，再运行程序。',
    '代码末尾的 assert 必须全部通过；若失败，先看断言中的实际值与索引。',
  ],
  languages: ['javascript'] as const,
};
const PYTHON_RUNTIME = {
  requiredRuntime: 'python' as const,
  runtimeLabel: 'Python 3 内置运行时',
  docsUrl: 'https://docs.python.org/zh-cn/3/',
  installSteps: [
    'Python 3 由应用内置运行，无需安装。',
    '先按 stdin 中的输入手算预期结果，再运行程序。',
    '代码末尾的 assert 必须全部通过；若失败，先看断言中的实际值与索引。',
  ],
  languages: ['python'] as const,
};

export const LEARNING_CODE_LABS_ALGORITHMS_CORE: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'algorithms:算法与数据结构 · 复杂度、正确性与测量：最坏、平均与摊还复杂度': {
    ...NODE_RUNTIME,
    title: '摊还复杂度代码台 · 扩容账单与最坏尖峰',
    description:
      '用真实的扩容搬移计数区分“每次操作最坏”与“一串操作平均”。先比较固定增量和倍增策略，再找出单次插入的搬移尖峰。',
    practice: {
      id: 'algorithms-amortized-growth-guided',
      title: '跟做：数清两种扩容策略的搬移',
      brief:
        '对同一串追加操作分别采用容量翻倍和每次加 4 的策略。程序输出总复制次数、最终容量以及平均每次追加的复制次数。',
      defaultLanguage: 'javascript',
      stdin: '32',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const n = Number(fs.readFileSync(0, 'utf8').trim());

function growByDouble(count) {
  let size = 0;
  let capacity = 1;
  let copies = 0;
  let growths = 0;

  for (let push = 1; push <= count; push += 1) {
    if (size === capacity) {
      copies += size;
      capacity *= 2;
      growths += 1;
    }
    size += 1;
  }
  return { size, capacity, copies, growths };
}

function growByFour(count) {
  let size = 0;
  let capacity = 1;
  let copies = 0;
  let growths = 0;

  for (let push = 1; push <= count; push += 1) {
    if (size === capacity) {
      copies += size;
      capacity += 4;
      growths += 1;
    }
    size += 1;
  }
  return { size, capacity, copies, growths };
}

const doubled = growByDouble(n);
const plusFour = growByFour(n);

console.log('double', doubled, 'average', (doubled.copies / n).toFixed(3));
console.log('plus4 ', plusFour, 'average', (plusFour.copies / n).toFixed(3));

assert(doubled.size === n && plusFour.size === n);
assert(doubled.copies === 31);
assert(plusFour.copies === 120);
assert(plusFour.copies > doubled.copies * 3);
`,
      },
      checkpoint:
        '运行后应看到 size=32；翻倍策略 copies=31，加 4 策略 copies=120。再手算 n=8 时两种策略的复制次数，结果应分别为 7 和 6。',
    },
    apply: {
      id: 'algorithms-amortized-growth-independent',
      title: '独立实践：定位倍增策略的最坏尖峰',
      brief:
        '记录每次翻倍追加的复制量，找出 n=1024 时最坏的一次复制。比较最坏单次复制与整串操作的平均复制，说明“摊还 O(1)”不等于“每次都 O(1)”。',
      defaultLanguage: 'javascript',
      stdin: '1024',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const n = Number(fs.readFileSync(0, 'utf8').trim());

let size = 0;
let capacity = 1;
let totalCopies = 0;
let maxSingleCopy = 0;
let maxCopyPush = 0;

for (let push = 1; push <= n; push += 1) {
  if (size === capacity) {
    const copiedNow = size;
    totalCopies += copiedNow;
    if (copiedNow > maxSingleCopy) {
      maxSingleCopy = copiedNow;
      maxCopyPush = push;
    }
    capacity *= 2;
  }
  size += 1;
}

const average = totalCopies / n;
console.log({
  n,
  finalCapacity: capacity,
  totalCopies,
  average,
  maxSingleCopy,
  maxCopyPush,
});

assert(size === 1024 && capacity === 1024);
assert(totalCopies === 1023);
assert(maxSingleCopy === 512);
assert(maxCopyPush === 513);
assert(average < 1 && maxSingleCopy / average > 500);
`,
      },
      checkpoint:
        '输出必须满足 totalCopies=1023、average<1、maxSingleCopy=512 且尖峰发生在第 513 次追加。能指出一串 1024 次追加的总搬移由几何级数上界约束。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：动态数组、扩容和缓存局部性': {
    ...PYTHON_RUNTIME,
    title: '动态数组代码台 · 扩容、缩容滞后与批量追加',
    description:
      '实现一个带容量记录的可增长数组，观察倍增扩容与四分之一阈值缩容如何避免临界点抖动，再用批量追加核对复制成本。',
    practice: {
      id: 'algorithms-dynamic-array-guided',
      title: '跟做：让扩容事件可见',
      brief:
        '从容量 2 开始追加 1 到 10，容量不足时翻倍并复制旧元素；当元素数降到容量四分之一以下时才减半。输出每次容量变化和最终数组快照。',
      defaultLanguage: 'python',
      stdin: '10',
      starterCode: {
        python: `import sys

n = int(sys.stdin.read().strip())


class GrowableArray:
    def __init__(self, capacity=2):
        self.data = [None] * capacity
        self.size = 0
        self.capacity = capacity
        self.events = []

    def append(self, value):
        if self.size == self.capacity:
            self._resize(self.capacity * 2, "grow")
        self.data[self.size] = value
        self.size += 1

    def pop(self):
        self.size -= 1
        value = self.data[self.size]
        self.data[self.size] = None
        if self.capacity > 2 and self.size * 4 < self.capacity:
            self._resize(self.capacity // 2, "shrink")
        return value

    def _resize(self, new_capacity, reason):
        old = self.data[: self.size]
        self.capacity = new_capacity
        self.data = old + [None] * (new_capacity - self.size)
        self.events.append((reason, self.size, self.capacity))

    def snapshot(self):
        return self.data[: self.size]


array = GrowableArray()
for value in range(1, n + 1):
    array.append(value)

print("grow events:", array.events)
print("snapshot:", array.snapshot(), "size/capacity:", array.size, array.capacity)

assert array.size == n
assert array.snapshot() == list(range(1, n + 1))
assert array.size < array.capacity < array.size * 2
assert [event[2] for event in array.events] == [4, 8, 16]
`,
      },
      checkpoint:
        'n=10 时扩容容量序列必须是 4、8、16，最终 size=10、capacity=16，快照必须逐项等于 1 到 10。',
    },
    apply: {
      id: 'algorithms-dynamic-array-independent',
      title: '独立实践：用缩容滞后消除临界抖动',
      brief:
        '连续在容量边界追加和删除，验证只在 size 小于 capacity/4 时缩容。记录 resize 次数和总复制元素数，并用断言证明不会在 8/9 元素间反复扩缩。',
      defaultLanguage: 'python',
      stdin: '9',
      starterCode: {
        python: `import sys

edge = int(sys.stdin.read().strip())
capacity = 4
size = 0
copies = 0
resizes = []


def resize(new_capacity, reason):
    global capacity, copies
    copies += size
    capacity = new_capacity
    resizes.append((reason, size, capacity))


for _ in range(edge):
    if size == capacity:
        resize(capacity * 2, "grow")
    size += 1

print("after appends:", size, capacity, resizes)
assert size == edge and capacity == 16

for _ in range(4):
    size -= 1
    if capacity > 4 and size * 4 < capacity:
        resize(capacity // 2, "shrink")

for _ in range(4):
    if size == capacity:
        resize(capacity * 2, "grow")
    size += 1

print("after delete/append:", size, capacity, resizes)
print("copies:", copies)

assert size == edge and capacity == 16
assert [item[0] for item in resizes] == ["grow", "grow"]
assert copies == 4 + 8
`,
      },
      checkpoint:
        '追加到 9 个元素时容量应为 16；删到 5 个仍不应缩容，随后追加回 9 也不应再扩容。最终 resizes 只有两次 grow，复制总量为 12。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：单链表、双链表与反转族': {
    ...NODE_RUNTIME,
    title: '链表代码台 · 指针反转与成环检测',
    description:
      '不使用数组复制，直接用节点引用完成原地反转；再构造带环链表，用快慢指针返回相遇点并定位环入口。',
    practice: {
      id: 'algorithms-linked-list-reverse-guided',
      title: '跟做：三指针原地反转',
      brief:
        '读取一行整数建立单链表，逐个修改 next 指针完成反转。输出反转前后序列以及循环次数。',
      defaultLanguage: 'javascript',
      stdin: '5\n1 2 3 4 5',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const n = Number(lines[0]);
const values = lines[1].split(/\\s+/).map(Number);

function buildList(items) {
  const dummy = { value: 0, next: null };
  let tail = dummy;
  for (const value of items) {
    tail.next = { value, next: null };
    tail = tail.next;
  }
  return dummy.next;
}

function collect(head) {
  const result = [];
  for (let node = head; node; node = node.next) result.push(node.value);
  return result;
}

function reverse(head) {
  let previous = null;
  let current = head;
  let steps = 0;
  while (current) {
    const next = current.next;
    current.next = previous;
    previous = current;
    current = next;
    steps += 1;
  }
  return { head: previous, steps };
}

const original = buildList(values);
const originalSnapshot = collect(original);
const result = reverse(original);
const reversedSnapshot = collect(result.head);

console.log('before:', originalSnapshot);
console.log('after :', reversedSnapshot, 'steps:', result.steps);

assert(values.length === n);
assert(result.steps === n);
assert(reversedSnapshot.join(',') === [...values].reverse().join(','));
assert(result.head.value === 5 && collect(result.head.next).join(',') === '4,3,2,1');
`,
      },
      checkpoint:
        '输入 5 个节点时循环必须恰好执行 5 次，输出 5 4 3 2 1。把循环中的临时 next 删除应立刻丢失后半条链，这是必须能解释的指针覆盖风险。',
    },
    apply: {
      id: 'algorithms-linked-list-cycle-independent',
      title: '独立实践：快慢指针找环入口',
      brief:
        '读取链表值和接回下标，先让快慢指针在环内相遇，再利用“头指针与相遇指针同步走”的距离关系定位入口。',
      defaultLanguage: 'javascript',
      stdin: '6\n10 20 30 40 50 60\n2',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);
const cycleIndex = Number(lines[2]);

const nodes = values.map((value) => ({ value, next: null }));
for (let i = 0; i + 1 < nodes.length; i += 1) nodes[i].next = nodes[i + 1];
nodes[nodes.length - 1].next = nodes[cycleIndex];

function cycleEntry(head) {
  let slow = head;
  let fast = head;
  let meetingSteps = 0;

  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    meetingSteps += 1;
    if (slow === fast) break;
  }

  if (!fast || !fast.next) return { hasCycle: false, meetingSteps, entryValue: null };

  let probe = head;
  let entrySteps = 0;
  while (probe !== slow) {
    probe = probe.next;
    slow = slow.next;
    entrySteps += 1;
  }

  return { hasCycle: true, meetingSteps, entrySteps, entryValue: probe.value };
}

const result = cycleEntry(nodes[0]);
console.log(result);

assert(result.hasCycle === true);
assert(result.entryValue === values[cycleIndex]);
assert(result.meetingSteps > 0 && result.entrySteps >= 0);
`,
      },
      checkpoint:
        '接回下标 2 时入口值必须是 30。若把快慢指针都前进两步，检测条件会失效；若定位入口时只移动相遇指针，也无法保证在头节点相遇。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：栈、表达式与单调栈': {
    ...NODE_RUNTIME,
    title: '栈代码台 · 单调栈与双栈表达式',
    description:
      '先用单调栈维护尚未找到更大值的下标，再用数字栈和运算符栈解析带括号的四则表达式，两个任务都以完整运行结果为验收。',
    practice: {
      id: 'algorithms-monotonic-stack-guided',
      title: '跟做：下一个更大元素',
      brief:
        '从左到右扫描数组，栈中只保留等待更大值的下标。遇到更大值时持续弹栈并写入答案，最后输出答案、压栈数和弹栈数。',
      defaultLanguage: 'javascript',
      stdin: '9\n3 1 4 1 5 9 2 6 5',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);

const answer = Array(values.length).fill(-1);
const stack = [];
let pops = 0;

for (let index = 0; index < values.length; index += 1) {
  while (stack.length > 0 && values[stack[stack.length - 1]] < values[index]) {
    const waitingIndex = stack.pop();
    answer[waitingIndex] = values[index];
    pops += 1;
  }
  stack.push(index);
}

console.log('values:', values);
console.log('answer:', answer);
console.log('pushes/pops:', values.length, pops);

assert(answer.join(',') === '4,4,5,5,9,-1,6,-1,-1');
assert(stack.length + pops === values.length);
`,
      },
      checkpoint:
        '答案必须为 4,4,5,5,9,-1,6,-1,-1；压栈 9 次、弹栈 7 次，结束时栈中只剩两个没有后继更大值的下标。',
    },
    apply: {
      id: 'algorithms-expression-stack-independent',
      title: '独立实践：双栈计算带括号表达式',
      brief:
        '数字栈与运算符栈分别保存操作数和优先级。遇到右括号先连续计算到左括号，末尾再清空运算符栈。',
      defaultLanguage: 'javascript',
      stdin: '(3+4)*2-5',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const expression = fs.readFileSync(0, 'utf8').trim();
const numbers = [];
const operators = [];
const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
let applied = 0;

function applyTop() {
  const op = operators.pop();
  const right = numbers.pop();
  const left = numbers.pop();
  if (op === '+') numbers.push(left + right);
  if (op === '-') numbers.push(left - right);
  if (op === '*') numbers.push(left * right);
  if (op === '/') numbers.push(Math.trunc(left / right));
  applied += 1;
}

for (let i = 0; i < expression.length; i += 1) {
  const token = expression[i];
  if (/\\d/.test(token)) {
    let number = 0;
    while (i < expression.length && /\\d/.test(expression[i])) {
      number = number * 10 + Number(expression[i]);
      i += 1;
    }
    i -= 1;
    numbers.push(number);
  } else if (token === '(') {
    operators.push(token);
  } else if (token === ')') {
    while (operators[operators.length - 1] !== '(') applyTop();
    operators.pop();
  } else if (token in precedence) {
    while (
      operators.length > 0 &&
      operators[operators.length - 1] !== '(' &&
      precedence[operators[operators.length - 1]] >= precedence[token]
    ) {
      applyTop();
    }
    operators.push(token);
  }
}

while (operators.length > 0) applyTop();

console.log({ expression, value: numbers[0], applied });
assert(numbers.length === 1);
assert(numbers[0] === 9);
assert(applied === 3);
`,
      },
      checkpoint:
        '表达式 (3+4)*2-5 应输出 9，并恰好应用 3 次运算符。把减号优先级误设为高于乘号会先算 2-5，输出会变成错误值。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：队列、双端队列与环形缓冲': {
    ...PYTHON_RUNTIME,
    title: '队列代码台 · 环形缓冲与轮转调度',
    description:
      '用 head、tail、size 三个状态维护固定容量环形队列，再用 FIFO 队列模拟时间片轮转，观察每个进程的剩余工作量与完成顺序。',
    practice: {
      id: 'algorithms-ring-buffer-guided',
      title: '跟做：不搬移元素的环形队列',
      brief:
        '按容量和操作序列执行入队、出队。tail 到达末尾后回到 0，队列满或空时输出明确错误，不让下标互相覆盖。',
      defaultLanguage: 'python',
      stdin: '4\nE 10\nE 20\nE 30\nD\nE 40\nE 50\nD\nE 60\nE 70',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
capacity = int(lines[0])
operations = lines[1:]


class RingQueue:
    def __init__(self, capacity):
        self.data = [None] * capacity
        self.head = 0
        self.tail = 0
        self.size = 0

    def enqueue(self, value):
        if self.size == len(self.data):
            return f"full:{value}"
        self.data[self.tail] = value
        self.tail = (self.tail + 1) % len(self.data)
        self.size += 1
        return "ok"

    def dequeue(self):
        if self.size == 0:
            return "empty"
        value = self.data[self.head]
        self.data[self.head] = None
        self.head = (self.head + 1) % len(self.data)
        self.size -= 1
        return value


queue = RingQueue(capacity)
outputs = []
for operation in operations:
    if operation.startswith("E "):
        outputs.append(queue.enqueue(int(operation[2:])))
    else:
        outputs.append(queue.dequeue())
    print(operation, "=>", outputs[-1], "state", queue.data, queue.head, queue.tail)

print("outputs:", outputs)
assert outputs == ["ok", "ok", "ok", 10, "ok", "ok", 20, "ok", "full:70"]
assert queue.size == 4 and queue.head == 2 and queue.tail == 2
`,
      },
      checkpoint:
        '输出序列必须是 ok,ok,ok,10,ok,ok,20,ok,full:70；最后 size=4，head=2，tail=2。队列满时只返回错误，不移动 tail。',
    },
    apply: {
      id: 'algorithms-round-robin-independent',
      title: '独立实践：时间片轮转调度',
      brief:
        '所有进程先入队，每次取出队首执行一个时间片。未完成的进程重新排到队尾，记录等待轮次和完成顺序。',
      defaultLanguage: 'python',
      stdin: '2\n3\nA 7\nB 4\nC 5',
      starterCode: {
        python: `import sys
from collections import deque

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
quantum = int(lines[0])
count = int(lines[1])
jobs = []
for item in lines[2 : 2 + count]:
    name, work = item.split()
    jobs.append([name, int(work)])

pending = deque((name, work, 0) for name, work in jobs)
clock = 0
finished = []
timeline = []

while pending:
    name, remaining, waited = pending.popleft()
    run = min(quantum, remaining)
    remaining -= run
    clock += run
    timeline.append((clock, name, run, remaining))
    if remaining == 0:
        finished.append((name, clock))
    else:
        pending.append((name, remaining, waited + 1))

print("timeline:", timeline)
print("finished:", finished)

assert [item[1] for item in timeline] == ["A", "B", "C", "A", "B", "C", "A", "C", "A"]
assert finished == [("B", 10), ("C", 15), ("A", 16)]
assert clock == 16
`,
      },
      checkpoint:
        '完成顺序必须是 B、C、A；A 因工作量 7 需要四轮，B 在两轮后完成，C 在三轮后完成，最终总时间为 16。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：哈希冲突、扩容和键设计': {
    ...PYTHON_RUNTIME,
    title: '哈希代码台 · 链地址法与开放寻址',
    description:
      '先观察多个键落入同一桶的链地址快照，再实现线性探测、装载因子和 rehash，比较探测次数而不是把哈希表当黑箱。',
    practice: {
      id: 'algorithms-hash-chaining-guided',
      title: '跟做：查看桶内冲突链',
      brief:
        '使用固定 5 个桶和整数取模建立链地址哈希表。输出每个桶中的键序列，并核对查找 32 与不存在的 42 的探测路径。',
      defaultLanguage: 'python',
      stdin: '5 7\n12 22 32 7 17 99 3',
      starterCode: {
        python: `import sys

header, *rows = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
bucket_count = int(header.split()[0])
keys = [int(value) for value in rows[0].split()]

buckets = [[] for _ in range(bucket_count)]
for key in keys:
    buckets[key % bucket_count].append(key)


def find(key):
    bucket = buckets[key % bucket_count]
    probes = 0
    for index, stored in enumerate(bucket):
        probes += 1
        if stored == key:
            return index, probes
    return -1, probes


print("buckets:", {index: chain for index, chain in enumerate(buckets) if chain})
print("find 32:", find(32))
print("find 42:", find(42))

assert buckets[2] == [12, 22, 32, 7, 17]
assert buckets[4] == [99]
assert find(32) == (2, 3)
assert find(42) == (-1, 5)
`,
      },
      checkpoint:
        '桶 2 的链必须保持 [12,22,32,7,17]，查找 32 需要比较 3 次；42 也落在桶 2，比较完整条五元素链后仍应返回未命中。',
    },
    apply: {
      id: 'algorithms-hash-open-addressing-independent',
      title: '独立实践：线性探测与扩容',
      brief:
        '实现容量为 4 的整数哈希表，装载率超过 0.75 时容量翻倍并 rehash。记录总探测数，插入结束后逐键查找验证没有丢数据。',
      defaultLanguage: 'python',
      stdin: '8\n1 9 17 2 10 18 3 11',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
keys = [int(value) for value in lines[1].split()]


class OpenAddressMap:
    def __init__(self):
        self.slots = [None] * 4
        self.size = 0
        self.total_probes = 0
        self.rehashes = []

    def put(self, key):
        if (self.size + 1) / len(self.slots) > 0.75:
            self.rehash()
        self._insert_no_resize(key)

    def _insert_no_resize(self, key):
        index = key % len(self.slots)
        probes = 1
        while self.slots[index] is not None and self.slots[index] != key:
            index = (index + 1) % len(self.slots)
            probes += 1
        if self.slots[index] is None:
            self.size += 1
        self.slots[index] = key
        self.total_probes += probes

    def contains(self, key):
        index = key % len(self.slots)
        probes = 1
        while self.slots[index] is not None:
            if self.slots[index] == key:
                return True, probes
            index = (index + 1) % len(self.slots)
            probes += 1
        return False, probes

    def rehash(self):
        old = self.slots
        self.slots = [None] * (len(old) * 2)
        self.size = 0
        self.rehashes.append(len(old))
        for key in old:
            if key is not None:
                self._insert_no_resize(key)


table = OpenAddressMap()
for key in keys:
    table.put(key)

print("slots:", table.slots)
print("size/capacity:", table.size, len(table.slots))
print("rehashes:", table.rehashes, "total probes:", table.total_probes)

assert table.size == len(keys) == 8
assert len(table.slots) == 16
assert table.rehashes == [4, 8]
assert all(table.contains(key)[0] for key in keys)
assert table.contains(99)[0] is False
`,
      },
      checkpoint:
        '8 个键全部可查到，99 必须未命中；容量应从 4 依次扩到 8、16，且每次 rehash 后旧键都重新进入新槽位。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：前缀和、差分与区间更新': {
    ...NODE_RUNTIME,
    title: '区间代码台 · 前缀和查询与差分区间加',
    description:
      '用前缀和把静态区间求和降到 O(1)，用差分数组把一次区间加降到两个端点修改，最后用线性前缀还原整张数组。',
    practice: {
      id: 'algorithms-prefix-sum-guided',
      title: '跟做：前缀和回答多次区间查询',
      brief:
        '构造长度 n+1 的前缀数组，使闭区间 [left,right] 的和等于 prefix[right+1]-prefix[left]。输出每个中间量。',
      defaultLanguage: 'javascript',
      stdin: '5\n2 -1 3 4 -2\n3\n1 3\n2 5\n1 5',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);
const queryCount = Number(lines[2]);
const queries = lines.slice(3, 3 + queryCount).map((line) => line.split(/\\s+/).map(Number));

const prefix = [0];
for (const value of values) prefix.push(prefix[prefix.length - 1] + value);

const answers = queries.map(([left, right]) => {
  const inclusive = right - 1;
  const sum = prefix[inclusive + 1] - prefix[left - 1];
  return { left, right, sum };
});

console.log('prefix:', prefix);
console.log('answers:', answers);

assert(prefix.join(',') === '0,2,1,4,8,6');
assert(answers.map((item) => item.sum).join(',') === '4,4,6');
`,
      },
      checkpoint:
        '前缀数组必须为 0,2,1,4,8,6，三个闭区间和依次为 4、4、6。把 right+1 写成 right 会少算区间最后一项。',
    },
    apply: {
      id: 'algorithms-difference-array-independent',
      title: '独立实践：差分数组完成多次区间加',
      brief:
        '每次对闭区间 [left,right] 增加 delta 时，只修改 diff[left] 加 delta、diff[right+1] 减 delta。全部操作结束后一次前缀还原目标数组。',
      defaultLanguage: 'javascript',
      stdin: '5\n0 0 0 0 0\n3\n1 3 2\n2 4 1\n5 5 5',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const initial = lines[1].split(/\\s+/).map(Number);
const n = initial.length;
const operationCount = Number(lines[2]);
const operations = lines.slice(3, 3 + operationCount).map((line) => line.split(/\\s+/).map(Number));

const diff = Array(n + 1).fill(0);
for (const [left, right, delta] of operations) {
  diff[left - 1] += delta;
  diff[right] -= delta;
}

const result = [];
let running = 0;
for (let index = 0; index < n; index += 1) {
  running += diff[index];
  result.push(initial[index] + running);
}

console.log('diff:', diff);
console.log('result:', result);

assert(result.join(',') === '2,3,3,1,5');
assert(diff[0] === 2 && diff[3] === -2);
`,
      },
      checkpoint:
        '还原数组必须是 2,3,3,1,5；diff[0]=2 来自第一次区间加，diff[3]=-2 表示第一段影响在右端点之后结束。',
    },
  },

  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：双指针、滑动窗口和去重': {
    ...PYTHON_RUNTIME,
    title: '滑动窗口代码台 · 唯一子串与最短覆盖和',
    description:
      '维护窗口、左端点和计数表，分别求最长无重复子串与正数数组中的最短达标连续段。重点是窗口何时扩张、何时收缩。',
    practice: {
      id: 'algorithms-longest-unique-window-guided',
      title: '跟做：最长无重复子串',
      brief:
        '右指针逐字符扩张，遇到重复字符时把左指针移动到旧位置之后。每次合法窗口都更新长度和当前最优子串。',
      defaultLanguage: 'python',
      stdin: 'abcabcbb',
      starterCode: {
        python: `import sys

text = sys.stdin.read().strip()
last_position = {}
left = 0
best_left = 0
best_right = 0

for right, char in enumerate(text):
    if char in last_position and last_position[char] >= left:
        left = last_position[char] + 1
    last_position[char] = right
    if right - left > best_right - best_left:
        best_left = left
        best_right = right
    print(right, char, "window", left, right, text[left : right + 1])

best = text[best_left : best_right + 1]
print("best:", best, "length:", len(best))

assert best == "abc" and len(best) == 3
assert best_left == 0 and best_right == 2
`,
      },
      checkpoint:
        'abcabcbb 的最优窗口应停在 [0,2]，输出 abc 和长度 3。左指针移动到旧位置之后而不是旧位置本身，否则窗口中仍保留重复字符。',
    },
    apply: {
      id: 'algorithms-min-window-sum-independent',
      title: '独立实践：正数数组最短达标窗口',
      brief:
        '右指针加入元素，当窗口和达到 target 后持续推动左指针收缩。每次合法时记录最短长度和实际下标区间。',
      defaultLanguage: 'python',
      stdin: '7 11\n1 2 3 4 5 6 7',
      starterCode: {
        python: `import sys

header, row = [line for line in sys.stdin.read().splitlines() if line.strip()]
n, target = map(int, header.split())
values = list(map(int, row.split()))

left = 0
window_sum = 0
best_length = float("inf")
best_range = None

for right, value in enumerate(values):
    window_sum += value
    while window_sum >= target:
        current_length = right - left + 1
        if current_length < best_length:
            best_length = current_length
            best_range = (left, right)
        window_sum -= values[left]
        left += 1

print("values:", values, "target:", target)
print("best:", best_range, "length:", best_length)

assert len(values) == n
assert best_length == 2
assert best_range == (4, 5)
assert sum(values[best_range[0] : best_range[1] + 1]) >= target
`,
      },
      checkpoint:
        '最短长度必须是 2，区间为下标 4 到 5，值为 5+6。收缩循环必须用 while；换成 if 时会漏掉同一个右端点下多次可行的左端点。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：二叉树遍历与递归边界': {
    ...NODE_RUNTIME,
    title: '二叉树代码台 · 迭代中序与层序右视图',
    description:
      '用显式栈完成不依赖递归栈的中序遍历，再用队列逐层处理节点并提取最右节点，观察空节点与单节点边界。',
    practice: {
      id: 'algorithms-tree-inorder-guided',
      title: '跟做：显式栈完成中序遍历',
      brief:
        '沿左孩子一路压栈，无法继续时弹出节点并记录，再转向右子树。输出遍历序列、弹栈数和最大栈深。',
      defaultLanguage: 'javascript',
      stdin: '7\n8 3 10 1 6 0 14',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);

function build(index) {
  if (index >= values.length || values[index] === 0) return null;
  return { value: values[index], left: build(index * 2 + 1), right: build(index * 2 + 2) };
}

function inorder(root) {
  const stack = [];
  const output = [];
  let node = root;
  let maxDepth = 0;

  while (node || stack.length > 0) {
    while (node) {
      stack.push(node);
      maxDepth = Math.max(maxDepth, stack.length);
      node = node.left;
    }
    node = stack.pop();
    output.push(node.value);
    node = node.right;
  }
  return { output, maxDepth };
}

const root = build(0);
const result = inorder(root);
console.log('inorder:', result.output, 'maxDepth:', result.maxDepth);

assert(result.output.join(',') === '1,3,6,8,10,14');
assert(result.maxDepth === 3);
`,
      },
      checkpoint:
        '中序序列必须是 1,3,6,8,10,14，最大显式栈深为 3。若先弹栈再压左孩子，序列会重复或错序。',
    },
    apply: {
      id: 'algorithms-tree-right-view-independent',
      title: '独立实践：层序遍历与右视图',
      brief:
        '每轮先记录当前队列长度，只处理这一层。层内最后一个节点写入右视图，孩子按左右顺序进入下一层队列。',
      defaultLanguage: 'javascript',
      stdin: '7\n8 3 10 1 6 0 14',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);

function build(index) {
  if (index >= values.length || values[index] === 0) return null;
  return { value: values[index], left: build(index * 2 + 1), right: build(index * 2 + 2) };
}

function levelView(root) {
  if (!root) return { levels: [], rightView: [] };
  const queue = [root];
  const levels = [];
  const rightView = [];

  while (queue.length > 0) {
    const levelSize = queue.length;
    const level = [];
    for (let i = 0; i < levelSize; i += 1) {
      const node = queue.shift();
      level.push(node.value);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    levels.push(level);
    rightView.push(level[level.length - 1]);
  }
  return { levels, rightView };
}

const result = levelView(build(0));
console.log(result);

assert(result.levels.map((level) => level.join(',')).join('|') === '8|3,10|1,6,14');
assert(result.rightView.join(',') === '8,10,14');
`,
      },
      checkpoint:
        '层序必须为 [8]、[3,10]、[1,6,14]，右视图为 8,10,14。每层必须固定 levelSize；直接循环到队列为空会把不同层的节点混在一起。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：BST、搜索与删除': {
    ...PYTHON_RUNTIME,
    title: '二叉搜索树代码台 · 上下界校验与删除',
    description:
      '递归传递每个节点允许的开区间上下界，避免只比较父子；再实现双孩子删除，用右子树最小节点替换当前键。',
    practice: {
      id: 'algorithms-bst-validate-guided',
      title: '跟做：用上下界验证 BST',
      brief:
        '每个节点必须满足 lower < value < upper。递归进入右子树时 lower 收紧为当前值，进入左子树时 upper 收紧为当前值。',
      defaultLanguage: 'python',
      stdin: '7\n8 3 10 1 6 0 14',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
values = list(map(int, lines[1].split()))


class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


def build(index):
    if index >= len(values) or values[index] == 0:
        return None
    node = Node(values[index])
    node.left = build(index * 2 + 1)
    node.right = build(index * 2 + 2)
    return node


def validate(node, lower=float("-inf"), upper=float("inf")):
    if node is None:
        return True
    if not (lower < node.value < upper):
        return False
    return validate(node.left, lower, node.value) and validate(node.right, node.value, upper)


root = build(0)
print("root:", root.value, "valid:", validate(root))
assert validate(root) is True

bad = Node(8)
bad.left = Node(3)
bad.left.right = Node(9)
print("local-parent-only valid?", bad.left.value < bad.value and bad.left.right.value > bad.left.value)
print("global-bound valid?", validate(bad))
assert validate(bad) is False
`,
      },
      checkpoint:
        '主树校验必须为 True；数值 9 位于 3 的右子树却大于根 8 的示例必须被上下界判为 False。仅比较父子局部关系会漏掉这个错误。',
    },
    apply: {
      id: 'algorithms-bst-delete-independent',
      title: '独立实践：搜索与双孩子删除',
      brief:
        '顺序插入键，查找两个目标，再删除有左右孩子的节点。双孩子节点用右子树最小后继替换，最后输出中序序列。',
      defaultLanguage: 'python',
      stdin: '8\n8 3 10 1 6 14 13 4\n6',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
keys = list(map(int, lines[1].split()))
target = int(lines[2])


class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


def insert(root, value):
    if root is None:
        return Node(value)
    if value < root.value:
        root.left = insert(root.left, value)
    elif value > root.value:
        root.right = insert(root.right, value)
    return root


def find(root, value):
    while root:
        if value == root.value:
            return root
        root = root.left if value < root.value else root.right
    return None


def delete(root, value):
    if root is None:
        return None
    if value < root.value:
        root.left = delete(root.left, value)
    elif value > root.value:
        root.right = delete(root.right, value)
    else:
        if root.left is None:
            return root.right
        if root.right is None:
            return root.left
        successor = root.right
        while successor.left:
            successor = successor.left
        root.value = successor.value
        root.right = delete(root.right, successor.value)
    return root


def inorder(root):
    return inorder(root.left) + [root.value] + inorder(root.right) if root else []


root = None
for key in keys:
    root = insert(root, key)

print("before:", inorder(root))
print("find 13/7:", bool(find(root, 13)), bool(find(root, 7)))
root = delete(root, target)
print("after delete", target, inorder(root))

assert inorder(root) == [1, 3, 4, 8, 10, 13, 14]
assert find(root, 13).value == 13
assert find(root, 7) is None
`,
      },
      checkpoint:
        '删除 6 后中序必须为 1,3,4,8,10,13,14；查找 13 成功、查找 7 返回 None。删除后仍须满足整棵树的 BST 上下界。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：堆、优先队列与 Top-K': {
    ...NODE_RUNTIME,
    title: '堆代码台 · 上浮下沉与 Top-K',
    description:
      '手写最小堆的上浮、下沉与交换计数，先连续弹出验证全局有序；再用频次堆保持出现次数最高的 K 个键。',
    practice: {
      id: 'algorithms-min-heap-guided',
      title: '跟做：构建并清空最小堆',
      brief:
        '逐个 push 元素，每次与父节点比较并上浮；pop 时把尾元素换到根再与较小孩子下沉。输出弹出序列和交换次数。',
      defaultLanguage: 'javascript',
      stdin: '7\n5 3 8 1 9 2 7',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);
const heap = [];
let swaps = 0;

function push(value) {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent] <= heap[index]) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    swaps += 1;
    index = parent;
  }
}

function pop() {
  if (heap.length === 1) return heap.pop();
  const root = heap[0];
  heap[0] = heap.pop();
  let index = 0;
  while (true) {
    let smallest = index;
    const left = index * 2 + 1;
    const right = left + 1;
    if (left < heap.length && heap[left] < heap[smallest]) smallest = left;
    if (right < heap.length && heap[right] < heap[smallest]) smallest = right;
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
    swaps += 1;
    index = smallest;
  }
  return root;
}

for (const value of values) push(value);
const popped = [];
while (heap.length > 0) popped.push(pop());

console.log('popped:', popped, 'swaps:', swaps);
assert(popped.join(',') === '1,2,3,5,7,8,9');
assert(swaps > 0);
`,
      },
      checkpoint:
        '全部弹出顺序必须是 1,2,3,5,7,8,9，且交换次数大于 0。下沉时必须先选出左右孩子中更小的一个，否则会破坏最小堆性质。',
    },
    apply: {
      id: 'algorithms-top-k-frequency-independent',
      title: '独立实践：频次堆提取 Top-K',
      brief:
        '先统计每个值的频次，再维护按“频次降序、同频值升序”比较的堆。弹出 K 次得到排序后的高频键。',
      defaultLanguage: 'javascript',
      stdin: '8 3\n1 1 1 2 2 3 4 4',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const [n, k] = lines[0].split(/\\s+/).map(Number);
const values = lines[1].split(/\\s+/).map(Number);
const frequency = new Map();
for (const value of values) frequency.set(value, (frequency.get(value) || 0) + 1);

function better(left, right) {
  return left[1] > right[1] || (left[1] === right[1] && left[0] < right[0]);
}

const heap = [];
function push(item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (better(heap[parent], heap[index])) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function pop() {
  const top = heap[0];
  const tail = heap.pop();
  if (heap.length > 0) {
    heap[0] = tail;
    let index = 0;
    while (true) {
      let best = index;
      const left = index * 2 + 1;
      const right = left + 1;
      if (left < heap.length && better(heap[left], heap[best])) best = left;
      if (right < heap.length && better(heap[right], heap[best])) best = right;
      if (best === index) break;
      [heap[index], heap[best]] = [heap[best], heap[index]];
      index = best;
    }
  }
  return top;
}

for (const item of frequency.entries()) push(item);
const topK = [];
for (let i = 0; i < k; i += 1) topK.push(pop()[0]);

console.log('frequency:', [...frequency.entries()]);
console.log('topK:', topK);

assert(values.length === n && k === 3);
assert(topK.join(',') === '1,2,4');
assert(frequency.get(1) === 3 && frequency.get(2) === 2 && frequency.get(4) === 2);
`,
      },
      checkpoint:
        '频次表应含 1:3、2:2、3:1、4:2，Top-3 按同频值升序输出 1,2,4。只按频次比较会让同频结果不稳定。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：归并、快排、堆排和稳定性': {
    ...PYTHON_RUNTIME,
    title: '排序代码台 · 稳定多关键字与逆序对',
    description:
      '先验证稳定排序保留同键输入顺序，再用归并过程统计逆序对，把“排序完成”和“比较关系的数量”同时作为证据。',
    practice: {
      id: 'algorithms-stable-sort-guided',
      title: '跟做：稳定处理相同排序键',
      brief:
        '记录按部门升序、分数降序排序前后的标签顺序。相同排序键的元素必须保持输入先后，不能靠排序结果碰巧正确。',
      defaultLanguage: 'python',
      stdin: '5\nA 2 100\nB 1 90\nC 2 80\nD 1 95\nE 2 70',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
rows = []
for line in lines[1:]:
    name, department, score = line.split()
    rows.append({"name": name, "department": int(department), "score": int(score)})

sorted_rows = sorted(rows, key=lambda row: (row["department"], -row["score"]))
print("sorted:", [(row["name"], row["department"], row["score"]) for row in sorted_rows])

same_department_two = [row["name"] for row in sorted_rows if row["department"] == 2]
same_department_one = [row["name"] for row in sorted_rows if row["department"] == 1]
assert same_department_two == ["A", "C", "E"]
assert same_department_one == ["D", "B"]
assert [row["name"] for row in sorted_rows] == ["D", "B", "A", "C", "E"]
`,
      },
      checkpoint:
        '部门 1 的顺序必须是 D、B，部门 2 必须是 A、C、E；整体标签顺序为 D,B,A,C,E。排序键相同的数据不能被额外比较打乱。',
    },
    apply: {
      id: 'algorithms-inversion-merge-independent',
      title: '独立实践：归并排序统计逆序对',
      brief:
        '归并两个有序段时，如果右段元素更小，则左段剩余元素都与它构成逆序对。累计该数量并返回完整有序数组。',
      defaultLanguage: 'python',
      stdin: '6\n5 1 4 2 3 2',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
values = list(map(int, lines[1].split()))


def count_sort(items):
    if len(items) <= 1:
        return items, 0
    middle = len(items) // 2
    left, left_count = count_sort(items[:middle])
    right, right_count = count_sort(items[middle:])
    merged = []
    inversions = left_count + right_count
    i = j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            inversions += len(left) - i
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged, inversions


sorted_values, inversions = count_sort(values)
print("sorted:", sorted_values, "inversions:", inversions)

assert sorted_values == [1, 2, 2, 3, 4, 5]
assert inversions == 9
assert sorted(values) == sorted_values
`,
      },
      checkpoint:
        '排序结果是 1,2,2,3,4,5，逆序对总数为 9。逆序对只能在取右段元素时累加，取左段时分母方向相反，不能混用。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：二分查找与答案空间二分': {
    ...NODE_RUNTIME,
    title: '二分代码台 · 重复元素边界与最小容量',
    description:
      '先用 lower_bound 处理重复值并返回插入位置，再在答案空间上二分最小运载容量，验证判定函数随容量单调成立。',
    practice: {
      id: 'algorithms-lower-bound-guided',
      title: '跟做：重复值的左边界',
      brief:
        '每次比较中间值与目标值，命中时也不立即返回，而是把右边界压到 middle，继续寻找更左的可行位置。',
      defaultLanguage: 'javascript',
      stdin: '9\n1 2 2 2 3 5 5 7 9\n3\n2\n5\n8',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const values = lines[1].split(/\\s+/).map(Number);
const queryCount = Number(lines[2]);
const targets = lines.slice(3, 3 + queryCount).map(Number);

function lowerBound(target) {
  let left = 0;
  let right = values.length;
  let comparisons = 0;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    comparisons += 1;
    if (values[middle] < target) left = middle + 1;
    else right = middle;
  }
  return { index: left, comparisons };
}

const results = targets.map((target) => ({ target, ...lowerBound(target) }));
console.log(results);

assert(results[0].index === 1);
assert(results[1].index === 5);
assert(results[2].index === 8);
assert(results.every((item) => item.comparisons <= 4));
`,
      },
      checkpoint:
        '目标 2、5、8 的左边界必须分别为 1、5、8；每次查找最多 4 次比较。返回 middle 而非 middle+1 是保留重复值左边界的关键。',
    },
    apply: {
      id: 'algorithms-capacity-binary-search-independent',
      title: '独立实践：二分最小运载容量',
      brief:
        '在最大单件重量与总重量之间二分容量。每次用贪心顺序装船，若所需趟数不超过限制则容量可行，继续向更小值收缩。',
      defaultLanguage: 'javascript',
      stdin: '5 3\n2 3 4 5 6',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const [n, trips] = lines[0].split(/\\s+/).map(Number);
const weights = lines[1].split(/\\s+/).map(Number);

function requiredTrips(capacity) {
  let used = 1;
  let current = 0;
  for (const weight of weights) {
    if (current + weight <= capacity) {
      current += weight;
    } else {
      used += 1;
      current = weight;
    }
  }
  return used;
}

let low = Math.max(...weights);
let high = weights.reduce((sum, value) => sum + value, 0);
let checks = 0;
while (low < high) {
  const middle = low + Math.floor((high - low) / 2);
  checks += 1;
  if (requiredTrips(middle) <= trips) high = middle;
  else low = middle + 1;
}

console.log({ capacity: low, trips: requiredTrips(low), checks });

assert(weights.length === n && trips === 3);
assert(low === 9);
assert(requiredTrips(8) > trips);
assert(requiredTrips(9) <= trips);
`,
      },
      checkpoint:
        '最小容量必须是 9；容量 8 需要多于 3 趟，容量 9 可在 3 趟内完成。若 low 从 0 开始，虽然可能得到答案却忽略了每个单独件都必须装得下的下界。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：线段树与 Fenwick 树': {
    ...PYTHON_RUNTIME,
    title: 'Fenwick 代码台 · 动态前缀和与逆序对',
    description:
      '用 lowbit 沿更新链和查询链移动，先完成点更新与区间和，再用离散化后的 Fenwick 统计逆序对。',
    practice: {
      id: 'algorithms-fenwick-range-sum-guided',
      title: '跟做：点更新与区间和',
      brief:
        'Fenwick 第 i 个位置管理长度 lowbit(i) 的区间。点更新沿 i+lowbit(i) 上行，前缀查询沿 i-lowbit(i) 下行。',
      defaultLanguage: 'python',
      stdin: '5\n3 1 4 1 5\n3\nA 3 2\nQ 1 4\nQ 3 5',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
values = list(map(int, lines[1].split()))
n = len(values)
tree = [0] * (n + 1)


def add(index, delta):
    while index <= n:
        tree[index] += delta
        index += index & -index


def prefix_sum(index):
    total = 0
    while index > 0:
        total += tree[index]
        index -= index & -index
    return total


for index, value in enumerate(values, start=1):
    add(index, value)

answers = []
for line in lines[3:]:
    parts = line.split()
    if parts[0] == "A":
        add(int(parts[1]), int(parts[2]))
    else:
        left, right = int(parts[1]), int(parts[2])
        answers.append(prefix_sum(right) - prefix_sum(left - 1))

print("tree:", tree)
print("answers:", answers)

assert answers == [11, 12]
assert prefix_sum(5) == 16
assert prefix_sum(2) == 4
`,
      },
      checkpoint:
        '点更新下标 3 加 2 后，区间 [1,4] 的和为 11、[3,5] 的和为 12，总和为 16。lowbit 链写错时通常只会漏掉某一段贡献。',
    },
    apply: {
      id: 'algorithms-fenwick-inversions-independent',
      title: '独立实践：离散化 Fenwick 统计逆序对',
      brief:
        '从左到右读取原数组，查询已加入元素中大于当前值的有多少个，再把当前值的位置加一。离散化保证大数值也能映射到小下标。',
      defaultLanguage: 'python',
      stdin: '6\n5 1 4 2 3 2',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
values = list(map(int, lines[1].split()))
ordered = sorted(set(values))
rank = {value: index + 1 for index, value in enumerate(ordered)}
tree = [0] * (len(ordered) + 1)


def add(index):
    while index < len(tree):
        tree[index] += 1
        index += index & -index


def prefix_sum(index):
    total = 0
    while index > 0:
        total += tree[index]
        index -= index & -index
    return total


seen = 0
inversions = 0
for value in values:
    position = rank[value]
    not_greater = prefix_sum(position)
    inversions += seen - not_greater
    add(position)
    seen += 1

print("ranks:", [rank[value] for value in values])
print("inversions:", inversions)

assert inversions == 9
assert inversions == sum(
    values[i] > values[j]
    for i in range(len(values))
    for j in range(i + 1, len(values))
)
`,
      },
      checkpoint:
        '排名序列为 5,1,4,2,3,2，逆序对数必须为 9，并与 O(n^2) 暴力统计完全一致。重复值不能互相计为逆序对。',
    },
  },

  'algorithms:算法与数据结构 · 图论、搜索与最短路：邻接表、邻接矩阵与稀疏图': {
    ...NODE_RUNTIME,
    title: '图结构代码台 · 邻接表与无权最短路',
    description:
      '先根据边集建立无向邻接表并计算度数，再用 BFS 队列求最短跳数，输出访问顺序与路径，验证稀疏图结构足够。',
    practice: {
      id: 'algorithms-adjacency-list-guided',
      title: '跟做：建邻接表并核对度数',
      brief:
        '无向边要在两个端点各加入一次。输出每个顶点的邻居与度数，最后用边数和度数和的关系校验结构没有漏边。',
      defaultLanguage: 'javascript',
      stdin: '6 7\n1 2\n1 3\n2 4\n3 4\n4 5\n5 6\n2 6',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const [n, m] = lines[0].split(/\\s+/).map(Number);
const edges = lines.slice(1, 1 + m).map((line) => line.split(/\\s+/).map(Number));
const graph = Array.from({ length: n + 1 }, () => []);

for (const [u, v] of edges) {
  graph[u].push(v);
  graph[v].push(u);
}

const neighbors = graph.map((items) => [...items].sort((a, b) => a - b));
const degrees = neighbors.map((items) => items.length);
console.log({ neighbors: neighbors.slice(1), degrees: degrees.slice(1) });

assert(edges.length === m && graph.length === n + 1);
assert(degrees.slice(1).join(',') === '2,3,2,3,2,2');
assert(degrees.slice(1).reduce((sum, value) => sum + value, 0) === 2 * m);
`,
      },
      checkpoint:
        '顶点 1 到 6 的度数必须为 2,3,2,3,2,2，度数和为 14，即 2m。无向边只插一次会导致度数和只有 m。',
    },
    apply: {
      id: 'algorithms-bfs-shortest-path-independent',
      title: '独立实践：BFS 最短跳数与路径',
      brief:
        '源点距离设为 0 并入队，出队时更新未访问邻居。第一次访问就是最短距离，最后沿 predecessor 反向恢复路径。',
      defaultLanguage: 'javascript',
      stdin: '6 7\n1 2\n1 3\n2 4\n3 4\n4 5\n5 6\n2 6\n1 6',
      starterCode: {
        javascript: `const fs = require('fs');
const assert = require('assert');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/);
const [n, m] = lines[0].split(/\\s+/).map(Number);
const edges = lines.slice(1, 1 + m).map((line) => line.split(/\\s+/).map(Number));
const [source, target] = lines[1 + m].split(/\\s+/).map(Number);
const graph = Array.from({ length: n + 1 }, () => []);
for (const [u, v] of edges) {
  graph[u].push(v);
  graph[v].push(u);
}
for (const items of graph) items.sort((a, b) => a - b);

const distance = Array(n + 1).fill(-1);
const previous = Array(n + 1).fill(null);
const queue = [source];
distance[source] = 0;
const visited = [];

while (queue.length > 0) {
  const node = queue.shift();
  visited.push(node);
  for (const next of graph[node]) {
    if (distance[next] !== -1) continue;
    distance[next] = distance[node] + 1;
    previous[next] = node;
    queue.push(next);
  }
}

const path = [];
for (let node = target; node !== null; node = previous[node]) path.push(node);
path.reverse();

console.log({ visited, distance: distance.slice(1), path });
assert(distance[target] === 2);
assert(path.join('->') === '1->2->6');
assert(visited[0] === source);
`,
      },
      checkpoint:
        'visited 从源点 1 开始，1 到 6 的距离必须是 2，路径为 1->2->6。入队时就标记距离，若等出队才标记会重复入队。',
    },
  },

  'algorithms:算法与数据结构 · 图论、搜索与最短路：并查集与动态连通': {
    ...PYTHON_RUNTIME,
    title: '并查集代码台 · 路径压缩与冗余边',
    description:
      '用 parent、size 和路径压缩维护连通块，先观察多组边如何合并，再用“已连通边即冗余边”判断动态图中形成的环。',
    practice: {
      id: 'algorithms-union-find-guided',
      title: '跟做：合并并统计连通分量',
      brief:
        '每次 find 递归压平路径，union 把小树挂到大树根。所有边处理完毕后统计不同根的数量，输出 parent 快照。',
      defaultLanguage: 'python',
      stdin: '6 5\n1 2\n2 3\n4 5\n5 6\n2 4',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n, m = map(int, lines[0].split())
edges = [tuple(map(int, line.split())) for line in lines[1 : 1 + m]]

parent = list(range(n + 1))
size = [1] * (n + 1)


def find(node):
    if parent[node] != node:
        parent[node] = find(parent[node])
    return parent[node]


def union(a, b):
    root_a, root_b = find(a), find(b)
    if root_a == root_b:
        return False
    if size[root_a] < size[root_b]:
        root_a, root_b = root_b, root_a
    parent[root_b] = root_a
    size[root_a] += size[root_b]
    return True


for u, v in edges:
    union(u, v)

roots = [find(node) for node in range(1, n + 1)]
print("parent:", parent[1:])
print("roots:", roots, "component count:", len(set(roots)))

assert len(edges) == m
assert set(roots) == {1}
assert len(set(roots)) == 1
assert all(parent[node] == find(node) for node in range(1, n + 1))
`,
      },
      checkpoint:
        '6 个顶点最终应只有一个连通分量，所有 find 结果相同。按 size 合并可避免长链，路径压缩必须回写到 parent[node]。',
    },
    apply: {
      id: 'algorithms-union-find-cycle-independent',
      title: '独立实践：动态判环与冗余边',
      brief:
        '逐条处理边：两个端点已在同一集合时，这条边会形成环，记录为冗余边；否则合并。输出全部冗余边和最终 parent。',
      defaultLanguage: 'python',
      stdin: '5 6\n0 1\n1 2\n2 0\n3 4\n1 3\n2 4',
      starterCode: {
        python: `import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n, m = map(int, lines[0].split())
edges = [tuple(map(int, line.split())) for line in lines[1 : 1 + m]]
parent = list(range(n))
tree_edges = []
redundant = []


def find(node):
    while parent[node] != node:
        parent[node] = parent[parent[node]]
        node = parent[node]
    return node


for u, v in edges:
    root_u, root_v = find(u), find(v)
    if root_u == root_v:
        redundant.append((u, v))
    else:
        parent[root_v] = root_u
        tree_edges.append((u, v))

print("tree edges:", tree_edges)
print("redundant:", redundant)
print("parent:", parent)

assert redundant == [(2, 0), (2, 4)]
assert len(tree_edges) == n - 1
assert len({find(node) for node in range(n)}) == 1
`,
      },
      checkpoint:
        '冗余边应为 (2,0) 与 (2,4)，生成树边恰好 4 条，最终所有 5 个顶点仍连通。路径压缩只改 parent，不改变两个元素是否同集的事实。',
    },
  },
};
