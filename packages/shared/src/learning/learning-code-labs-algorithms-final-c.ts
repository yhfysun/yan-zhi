import type { LearningV2CodeLab } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 20+ / 单文件 JavaScript',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '应用内 Node 运行器执行单个 main.js，标准输入已由任务完整给出。',
    '先原样运行并核对 checkpoint，再修改输入或实现观察断言变化。',
    '断言失败会返回非零退出码，验收必须同时检查输出和退出码。',
  ],
  languages: ['javascript'],
} as const;

const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3.11+ / 单文件标准库',
  docsUrl: 'https://docs.python.org/3/library/',
  installSteps: [
    '应用内 Python 运行器执行单个 main.py，标准输入已由任务完整给出。',
    '代码只使用 Python 标准库，先原样运行并核对 checkpoint。',
    '断言失败会返回非零退出码，不能仅凭最后一行输出判断通过。',
  ],
  languages: ['python'],
} as const;

export const LEARNING_CODE_LABS_ALGORITHMS_FINAL_C: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：数组与字符串高频题族': {
    ...nodeRuntime,
    title: 'A6 代码台 01 · 字符统计、原地旋转与删除',
    description:
      '先在一次扫描里找首个唯一字符并压缩相邻游程，再用读写下标区分原地旋转和覆盖删除，观察哪些操作必须暂存旧值。',
    practice: {
      id: 'algorithms-a6-array-string-guided',
      title: '跟做：首个唯一字符与游程压缩',
      brief:
        '读取一行 ASCII 文本，统计字符频次，输出第一个只出现一次的字符，再把连续相同字符压缩为“字符+次数”。',
      defaultLanguage: 'javascript',
      stdin: 'swiss\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const text = fs.readFileSync(0, 'utf8').trim();

const counts = new Map();
for (const ch of text) {
  counts.set(ch, (counts.get(ch) || 0) + 1);
}

let firstUnique = '';
for (const ch of text) {
  if (counts.get(ch) === 1) {
    firstUnique = ch;
    break;
  }
}

const runs = [];
let runStart = 0;
for (let i = 1; i <= text.length; i += 1) {
  if (i === text.length || text[i] !== text[runStart]) {
    runs.push(text[runStart] + String(i - runStart));
    runStart = i;
  }
}
const compressed = runs.join('');

console.log('first_unique=' + firstUnique);
console.log('compressed=' + compressed);
console.log('distinct=' + counts.size);

assert.equal(firstUnique, 'w');
assert.equal(compressed, 's1w1i1s2');
assert.equal(counts.size, 3);
`,
      },
      checkpoint:
        '必须输出 first_unique=w、compressed=s1w1i1s2、distinct=3。压缩统计的是相邻游程，因此首尾两个 s 不会被合并。',
    },
    apply: {
      id: 'algorithms-a6-array-string-independent',
      title: '独立实践：三次反转与稳定覆盖删除',
      brief:
        '输入数组长度、右旋步数和待删除值。只用常数个辅助变量完成右旋，再在原地删除目标值并保持其余元素相对顺序。',
      defaultLanguage: 'javascript',
      stdin: '5 2 4\n1 2 3 4 5\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const [length, requestedShift, target] = lines[0].split(/\s+/).map(Number);
const values = lines[1].split(/\s+/).map(Number);
assert.equal(values.length, length);
let writes = 0;

function reverseRange(items, left, right) {
  while (left < right) {
    const saved = items[left];
    items[left] = items[right];
    items[right] = saved;
    writes += 2;
    left += 1;
    right -= 1;
  }
}

const shift = requestedShift % values.length;
reverseRange(values, 0, values.length - 1);
reverseRange(values, 0, shift - 1);
reverseRange(values, shift, values.length - 1);
const rotated = values.slice();

let write = 0;
for (let read = 0; read < values.length; read += 1) {
  if (values[read] !== target) {
    values[write] = values[read];
    write += 1;
  }
}
values.length = write;

console.log('rotated=' + rotated.join(','));
console.log('removed=' + values.join(','));
console.log('writes=' + writes);

assert.deepEqual(rotated, [4, 5, 1, 2, 3]);
assert.deepEqual(values, [5, 1, 2, 3]);
assert.ok(writes <= 2 * length);
`,
      },
      checkpoint:
        '输出必须为 rotated=4,5,1,2,3 与 removed=5,1,2,3。删除时 read 始终领先 write；两者混用会覆盖尚未读取的元素。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：链表、树与堆的面试变形': {
    ...nodeRuntime,
    title: 'A6 代码台 02 · 指针反转、Top-K 与根到叶路径',
    description:
      '用暂存后继完成链表反转，再用小顶堆维护流式 Top-K，并以 DFS 统计二叉树中满足目标和的根到叶路径。',
    practice: {
      id: 'algorithms-a6-linked-tree-heap-guided',
      title: '跟做：三指针反转单链表',
      brief:
        '原地反转 1 到 5 的单链表。程序记录每次改变后继的次数，并从新头开始输出反转后的节点值。',
      defaultLanguage: 'javascript',
      stdin: '5\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const count = Number(fs.readFileSync(0, 'utf8').trim());

function makeList(n) {
  let head = null;
  for (let value = n; value >= 1; value -= 1) {
    head = { value, next: head };
  }
  return head;
}

let previous = null;
let current = makeList(count);
let pointerChanges = 0;
while (current) {
  const next = current.next;
  current.next = previous;
  pointerChanges += 1;
  previous = current;
  current = next;
}

const output = [];
for (let node = previous; node; node = node.next) {
  output.push(node.value);
}

console.log('reversed=' + output.join(','));
console.log('pointer_changes=' + pointerChanges);
assert.deepEqual(output, [5, 4, 3, 2, 1]);
assert.equal(pointerChanges, count);
`,
      },
      checkpoint:
        '必须输出 reversed=5,4,3,2,1 和 pointer_changes=5。循环第一行必须暂存 next，否则改写 current.next 后会丢失后半条链。',
    },
    apply: {
      id: 'algorithms-a6-linked-tree-heap-independent',
      title: '独立实践：小顶堆 Top-K 与目标路径计数',
      brief:
        '读取 k、一串整数和层序二叉树。用大小为 k 的小顶堆保留最大 k 个数，同时统计根到叶路径和为目标值的路径数。',
      defaultLanguage: 'javascript',
      stdin: '3\n7 10 4 3 20 15 8\n5 4 8 11 null 13 4 7 2 null null null 1\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const k = Number(lines[0]);
const values = lines[1].split(/\s+/).map(Number);
const treeValues = lines[2].split(/\s+/);

class MinHeap {
  constructor() { this.items = []; }
  peek() { return this.items[0]; }
  push(value) {
    this.items.push(value);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent] <= this.items[i]) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last !== undefined) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.items[left] < this.items[smallest]) smallest = left;
        if (right < this.items.length && this.items[right] < this.items[smallest]) smallest = right;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

const heap = new MinHeap();
for (const value of values) {
  if (heap.items.length < k) heap.push(value);
  else if (value > heap.peek()) {
    heap.pop();
    heap.push(value);
  }
}
const topK = heap.items.slice().sort((a, b) => a - b);

function makeTree(tokens) {
  if (!tokens.length || tokens[0] === 'null') return null;
  const root = { value: Number(tokens[0]), left: null, right: null };
  const queue = [root];
  let cursor = 1;
  while (queue.length && cursor < tokens.length) {
    const node = queue.shift();
    if (tokens[cursor] !== 'null') {
      node.left = { value: Number(tokens[cursor]), left: null, right: null };
      queue.push(node.left);
    }
    cursor += 1;
    if (cursor < tokens.length && tokens[cursor] !== 'null') {
      node.right = { value: Number(tokens[cursor]), left: null, right: null };
      queue.push(node.right);
    }
    cursor += 1;
  }
  return root;
}

let matchingPaths = 0;
function visit(node, sum) {
  if (!node) return;
  const next = sum + node.value;
  if (!node.left && !node.right && next === 22) matchingPaths += 1;
  visit(node.left, next);
  visit(node.right, next);
}
visit(makeTree(treeValues), 0);

console.log('top_k=' + topK.join(','));
console.log('matching_paths=' + matchingPaths);
assert.deepEqual(topK, [10, 15, 20]);
assert.equal(matchingPaths, 1);
`,
      },
      checkpoint:
        '必须得到 top_k=10,15,20 与 matching_paths=1。堆中始终只保留 k 个值；路径只在叶节点判定，不能把中间节点提前计入。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：滑动窗口与双指针题族': {
    ...nodeRuntime,
    title: 'A6 代码台 03 · 最短达标窗口与最长无重复区间',
    description:
      '同向窗口通过右端扩张、左端收缩维护区间性质；再用哈希表记录最近位置，比较收缩循环和跳左端点两种写法。',
    practice: {
      id: 'algorithms-a6-sliding-window-guided',
      title: '跟做：正数数组的最短达标子数组',
      brief:
        '读取正整数数组和目标值，找出和至少达到目标的最短连续子数组，输出长度与具体元素。',
      defaultLanguage: 'javascript',
      stdin: '7 8\n3 1 2 2 4 3 1\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const [n, target] = lines[0].split(/\s+/).map(Number);
const values = lines[1].split(/\s+/).map(Number);
assert.equal(values.length, n);

let left = 0;
let sum = 0;
let bestLength = Infinity;
let bestStart = -1;
let expansions = 0;
let contractions = 0;

for (let right = 0; right < values.length; right += 1) {
  sum += values[right];
  expansions += 1;
  while (sum >= target) {
    const length = right - left + 1;
    if (length < bestLength) {
      bestLength = length;
      bestStart = left;
    }
    sum -= values[left];
    left += 1;
    contractions += 1;
  }
}

const segment = values.slice(bestStart, bestStart + bestLength);
console.log('best_length=' + bestLength);
console.log('segment=' + segment.join(','));
console.log('moves=' + (expansions + contractions));
assert.equal(bestLength, 3);
assert.deepEqual(segment, [2, 2, 4]);
assert.equal(expansions, 7);
`,
      },
      checkpoint:
        'best_length 必须为 3，segment 必须为 2,2,4。内层收缩使用 while；改成 if 会漏掉连续移除多个左侧元素的情况。',
    },
    apply: {
      id: 'algorithms-a6-sliding-window-independent',
      title: '独立实践：最长无重复子串与双指针边界',
      brief:
        '读取两行文本，分别求最长无重复字符子串和最长只含两种字符子串。输出长度、片段和窗口移动次数。',
      defaultLanguage: 'python',
      stdin: 'abcabd\neceba\n',
      starterCode: {
        python: String.raw`import sys


first, second = sys.stdin.read().splitlines()


def longest_unique(text):
    last = {}
    left = 0
    best_left = 0
    best_right = 0
    moves = 0
    for right, ch in enumerate(text):
        moves += 1
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        if right - left > best_right - best_left:
            best_left, best_right = left, right
    return best_right - best_left + 1, text[best_left:best_right + 1], moves


def longest_two(text):
    counts = {}
    left = 0
    best = (0, 0)
    for right, ch in enumerate(text):
        counts[ch] = counts.get(ch, 0) + 1
        while len(counts) > 2:
            counts[text[left]] -= 1
            if counts[text[left]] == 0:
                del counts[text[left]]
            left += 1
        if right - left > best[1] - best[0]:
            best = (left, right)
    left, right = best
    return right - left + 1, text[left:right + 1]


unique_length, unique_segment, moves = longest_unique(first)
two_length, two_segment = longest_two(second)
print("unique=", unique_length, unique_segment, "moves=", moves)
print("two_distinct=", two_length, two_segment)
assert (unique_length, unique_segment) == (4, "cabd")
assert moves == len(first)
assert (two_length, two_segment) == (3, "ece")
`,
      },
      checkpoint:
        '第一行必须为 unique= 4 cabd，第二行必须为 two_distinct= 3 ece。无重复窗口用最近位置直接跳左端；双种类窗口必须用 while 收缩。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：图搜索与最短路场景识别': {
    ...nodeRuntime,
    title: 'A6 代码台 04 · 网格 BFS 与加权 DAG 最短路',
    description:
      '先按边权是否统一选择 BFS，再在带权有向无环图上同时执行拓扑排序和 Dijkstra，区分“可达层数”和“累计代价”。',
    practice: {
      id: 'algorithms-a6-graph-search-guided',
      title: '跟做：网格最短步数与访问边界',
      brief:
        '读取由 S、E、点和井号组成的网格，用四方向 BFS 求 S 到 E 的最短步数，并输出访问节点数。',
      defaultLanguage: 'javascript',
      stdin: '3 4\nS...\n###.\n...E\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const [rows, cols] = lines[0].split(/\s+/).map(Number);
const grid = lines.slice(1);
assert.equal(grid.length, rows);
assert.ok(grid.every((row) => row.length === cols));

let start = null;
let end = null;
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    if (grid[r][c] === 'S') start = [r, c];
    if (grid[r][c] === 'E') end = [r, c];
  }
}

const distance = Array.from({ length: rows }, () => Array(cols).fill(-1));
const queue = [[start[0], start[1]]];
distance[start[0]][start[1]] = 0;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let head = 0;
while (head < queue.length) {
  const [r, c] = queue[head];
  head += 1;
  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (grid[nr][nc] === '#' || distance[nr][nc] !== -1) continue;
    distance[nr][nc] = distance[r][c] + 1;
    queue.push([nr, nc]);
  }
}

const answer = distance[end[0]][end[1]];
console.log('shortest_steps=' + answer);
console.log('visited=' + queue.length);
assert.equal(answer, 5);
assert.equal(queue.length, 9);
`,
      },
      checkpoint:
        '必须输出 shortest_steps=5 与 visited=9。BFS 入队时就标记距离，等到出队才标记会让同一节点多次入队。',
    },
    apply: {
      id: 'algorithms-a6-graph-search-independent',
      title: '独立实践：拓扑序与加权最短路',
      brief:
        '读取带非负权重的有向无环图，输出一个合法拓扑序，并求起点 0 到终点 3 的最短距离与路径。',
      defaultLanguage: 'python',
      stdin: '4 5\n0 1 2\n0 2 5\n1 2 1\n1 3 6\n2 3 2\n',
      starterCode: {
        python: String.raw`import heapq
import sys


lines = sys.stdin.read().strip().splitlines()
n, m = map(int, lines[0].split())
graph = [[] for _ in range(n)]
indegree = [0] * n
for line in lines[1:1 + m]:
    u, v, weight = map(int, line.split())
    graph[u].append((v, weight))
    indegree[v] += 1

queue = [node for node in range(n) if indegree[node] == 0]
topological = []
for node in queue:
    topological.append(node)
    for neighbor, _ in graph[node]:
        indegree[neighbor] -= 1
        if indegree[neighbor] == 0:
            queue.append(neighbor)

distance = [float("inf")] * n
parent = [-1] * n
distance[0] = 0
heap = [(0, 0)]
while heap:
    cost, node = heapq.heappop(heap)
    if cost != distance[node]:
        continue
    for neighbor, weight in graph[node]:
        candidate = cost + weight
        if candidate < distance[neighbor]:
            distance[neighbor] = candidate
            parent[neighbor] = node
            heapq.heappush(heap, (candidate, neighbor))

path = []
cursor = 3
while cursor != -1:
    path.append(cursor)
    cursor = parent[cursor]
path.reverse()

print("topological=" + ",".join(map(str, topological)))
print("distance=", distance[3])
print("path=" + ",".join(map(str, path)))
assert len(topological) == n
assert distance[3] == 5
assert path == [0, 1, 2, 3]
`,
      },
      checkpoint:
        '必须输出 topological=0,1,2,3、distance= 5、path=0,1,2,3。无权图求最少边数用 BFS；带权图必须累计边权，不能继续按层数判最短。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：DP 状态设计与降维': {
    ...nodeRuntime,
    title: 'A6 代码台 05 · 状态机 DP 与滚动数组',
    description:
      '用持有、卖出、冷却三个状态表达股票交易约束，再把二维网格路径 DP 压缩为一行，核对降维后的覆盖顺序。',
    practice: {
      id: 'algorithms-a6-dp-state-guided',
      title: '跟做：带冷却期的三状态转移',
      brief:
        '读取每日价格，用持有、卖出、冷却三个状态求最大利润。交易后必须至少冷却一天，不能在同一状态更新中混用新值。',
      defaultLanguage: 'javascript',
      stdin: '5\n1 2 3 0 2\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const n = Number(lines[0]);
const prices = lines[1].split(/\s+/).map(Number);
assert.equal(prices.length, n);

let hold = -prices[0];
let sold = 0;
let rest = 0;
const history = [];

for (let day = 1; day < n; day += 1) {
  const previousHold = hold;
  const previousSold = sold;
  const previousRest = rest;
  hold = Math.max(previousHold, previousRest - prices[day]);
  sold = previousHold + prices[day];
  rest = Math.max(previousRest, previousSold);
  history.push({ day, hold, sold, rest });
}

const answer = Math.max(sold, rest);
console.log('max_profit=' + answer);
console.log('final_states=' + [hold, sold, rest].join(','));
console.log('last_rest=' + history.at(-1).rest);
assert.equal(answer, 3);
assert.equal(hold, 1);
assert.equal(sold, 3);
`,
      },
      checkpoint:
        'max_profit 必须为 3，final_states 必须为 1,3,2。三行转移都只能读取 previous 状态；先改 hold 再用新 hold 算 sold 会允许同日买卖。',
    },
    apply: {
      id: 'algorithms-a6-dp-state-independent',
      title: '独立实践：网格路径 DP 压成一行',
      brief:
        '读取网格代价，求从左上到右下的最小路径和。只保留一行 DP，输出最小代价、辅助空间格数以及未降维时的状态数。',
      defaultLanguage: 'python',
      stdin: '3 4\n1 3 1 2\n1 5 1 3\n4 2 1 1\n',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().strip().splitlines()
rows, cols = map(int, lines[0].split())
grid = [list(map(int, line.split())) for line in lines[1:1 + rows]]
assert len(grid) == rows and all(len(row) == cols for row in grid)

dp = [float("inf")] * cols
dp[0] = 0
for row in range(rows):
    dp[0] += grid[row][0]
    for col in range(1, cols):
        dp[col] = min(dp[col], dp[col - 1]) + grid[row][col]

full_cells = rows * cols
print("min_path=", dp[-1])
print("rolling_cells=", len(dp))
print("full_cells=", full_cells)
assert dp[-1] == 8
assert len(dp) == cols
assert full_cells == 12
`,
      },
      checkpoint:
        '必须得到 min_path= 8、rolling_cells=4、full_cells=12。dp[col] 在本行更新前代表上一行同列值，dp[col-1] 已代表本行左侧值。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：复杂度反推与输入规模判断': {
    ...nodeRuntime,
    title: 'A6 代码台 06 · 从数据范围淘汰候选算法',
    description:
      '先把时限换算成操作预算，再按 n、n log n、n√n、n² 的增长量级筛选方案，最后用实际比较次数验证二分档位。',
    practice: {
      id: 'algorithms-a6-complexity-guided',
      title: '跟做：操作预算表与候选淘汰',
      brief:
        '读取 n 与一秒操作预算，估算线性、线性对数、n 的 1.5 次方和平方级四种方案，输出通过或超预算。',
      defaultLanguage: 'javascript',
      stdin: '100000 100000000\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const [n, budget] = fs.readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);

const candidates = [
  ['O(n)', n],
  ['O(n log n)', n * Math.ceil(Math.log2(n))],
  ['O(n sqrt n)', n * Math.ceil(Math.sqrt(n))],
  ['O(n^2)', n * n],
];

const report = candidates.map(([name, operations]) => ({
  name,
  operations,
  verdict: operations <= budget ? 'PASS' : 'FAIL',
}));
for (const row of report) {
  console.log(row.name + '=' + row.operations + ':' + row.verdict);
}

const passed = report.filter((row) => row.verdict === 'PASS').map((row) => row.name);
console.log('candidates=' + passed.join('|'));
assert.deepEqual(passed, ['O(n)', 'O(n log n)', 'O(n sqrt n)']);
assert.equal(report[3].operations, 10000000000);
`,
      },
      checkpoint:
        '通过项必须恰好是 O(n)、O(n log n)、O(n sqrt n)，平方级操作数必须是 10000000000。数据规模先乘出操作量，再决定值不值得写复杂算法。',
    },
    apply: {
      id: 'algorithms-a6-complexity-independent',
      title: '独立实践：线性扫描与二分的比较次数',
      brief:
        '读取有序整数范围长度和末位目标，统计线性查找与二分查找的比较次数，并验证二分不超过对数上界。',
      defaultLanguage: 'python',
      stdin: '200000 199999\n',
      starterCode: {
        python: String.raw`import bisect
import math
import sys


n, target = map(int, sys.stdin.read().split())

linear_comparisons = 0
linear_index = -1
for index in range(n):
    linear_comparisons += 1
    if index == target:
        linear_index = index
        break

low = 0
high = n - 1
binary_comparisons = 0
binary_index = -1
while low <= high:
    mid = low + (high - low) // 2
    binary_comparisons += 1
    if mid == target:
        binary_index = mid
        break
    if mid < target:
        low = mid + 1
    else:
        high = mid - 1

upper_bound = math.ceil(math.log2(n))
print("linear_index=", linear_index, "comparisons=", linear_comparisons)
print("binary_index=", binary_index, "comparisons=", binary_comparisons)
print("log_bound=", upper_bound)
assert linear_index == binary_index == n - 1
assert linear_comparisons == n
assert binary_comparisons <= upper_bound
`,
      },
      checkpoint:
        'linear_comparisons 必须等于 200000，binary_index 必须命中 199999，binary_comparisons 不超过 log_bound=18。比较次数随 n 线性增长还是按对数增长，是两种档位的直接证据。',
    },
  },

  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：代码表达、调试与面试复盘': {
    ...nodeRuntime,
    title: 'A6 代码台 07 · 可追踪二分与随机差分测试',
    description:
      '给关键循环增加可解释状态，再用随机小数据把优化实现与简单判定器对拍，定位边界错误而不是靠反复猜改。',
    practice: {
      id: 'algorithms-a6-debug-review-guided',
      title: '跟做：带比较轨迹的二分查找',
      brief:
        '读取有序数组和目标值，使用防溢出的中点公式查找目标，输出比较次数和每一步 low、mid、high。',
      defaultLanguage: 'javascript',
      stdin: '1 3 5 7 9\n7\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const values = lines[0].split(/\s+/).map(Number);
const target = Number(lines[1]);

let low = 0;
let high = values.length - 1;
let comparisons = 0;
const trace = [];
let found = -1;
while (low <= high) {
  const mid = low + Math.floor((high - low) / 2);
  comparisons += 1;
  trace.push('L' + low + '/M' + mid + '/H' + high);
  if (values[mid] === target) {
    found = mid;
    break;
  }
  if (values[mid] < target) low = mid + 1;
  else high = mid - 1;
}

console.log('found=' + found);
console.log('comparisons=' + comparisons);
console.log('trace=' + trace.join('|'));
assert.equal(found, 3);
assert.equal(comparisons, 2);
assert.deepEqual(trace, ['L0/M2/H4', 'L3/M3/H4']);
`,
      },
      checkpoint:
        '必须找到下标 3，比较 2 次，轨迹为 L0/M2/H4|L3/M3/H4。中点使用 low+(high-low)/2，避免两个大下标相加溢出。',
    },
    apply: {
      id: 'algorithms-a6-debug-review-independent',
      title: '独立实践：区间合并与随机小数据对拍',
      brief:
        '先按左端点排序并合并重叠区间，再用坐标涂色法作为朴素判定器，对 150 组固定种子随机数据逐组比较结果。',
      defaultLanguage: 'python',
      stdin: '5\n1 3\n2 6\n8 10\n15 18\n17 20\n',
      starterCode: {
        python: String.raw`import random
import sys


lines = sys.stdin.read().strip().splitlines()
n = int(lines[0])
intervals = [tuple(map(int, line.split())) for line in lines[1:1 + n]]


def merge(items):
    ordered = sorted(items)
    result = []
    for start, end in ordered:
        if not result or start > result[-1][1]:
            result.append([start, end])
        else:
            result[-1][1] = max(result[-1][1], end)
    return [tuple(item) for item in result]


def oracle(items):
    covered = [False] * 25
    for start, end in items:
        for point in range(start, end):
            covered[point] = True
    result = []
    index = 0
    while index < len(covered):
        if not covered[index]:
            index += 1
            continue
        start = index
        while index < len(covered) and covered[index]:
            index += 1
        result.append((start, index))
    return result


merged = merge(intervals)
print("merged=" + ";".join(f"{a}-{b}" for a, b in merged))
assert merged == [(1, 6), (8, 10), (15, 20)]

randomizer = random.Random(7)
for _ in range(150):
    size = randomizer.randint(0, 7)
    sample = []
    for _ in range(size):
        start = randomizer.randint(0, 20)
        end = randomizer.randint(start + 1, 24)
        sample.append((start, end))
    assert merge(sample) == oracle(sample), sample
print("differential_cases=150")
`,
      },
      checkpoint:
        '必须输出 merged=1-6;8-10;15-20 与 differential_cases=150。随机样例要固定种子；对拍失败时先打印最小输入，再定位排序边界或合并条件。',
    },
  },

  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：倒排索引、检索与排序服务': {
    ...nodeRuntime,
    title: 'A7 代码台 01 · 倒排交集、词频打分与删除更新',
    description:
      '先为小语料建立词到有序文档号的映射，再用双指针求交；随后加入词频评分并删除一篇文档，验证索引不会返回悬挂结果。',
    practice: {
      id: 'algorithms-a7-inverted-index-guided',
      title: '跟做：多词查询的双指针交集',
      brief:
        '读取文档数、每篇文档标识与正文、以及一行查询词。词形统一小写，输出命中文档标识和倒排表长度。',
      defaultLanguage: 'javascript',
      stdin: '3\nD1 Cache hit cache\nD2 cache consistency\nD3 Hit cache\ncache hit\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const n = Number(lines[0]);
const index = new Map();

function tokens(line) {
  return line.toLowerCase().match(/[a-z0-9]+/g) || [];
}

for (const line of lines.slice(1, 1 + n)) {
  const parts = line.split(/\s+/);
  const docId = parts.shift();
  for (const term of new Set(tokens(parts.join(' ')))) {
    if (!index.has(term)) index.set(term, []);
    index.get(term).push(docId);
  }
}
const query = tokens(lines[1 + n]);

function intersect(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push(left[i]);
      i += 1;
      j += 1;
    } else if (left[i] < right[j]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return result;
}

let matches = index.get(query[0]) || [];
for (const term of query.slice(1)) {
  matches = intersect(matches, index.get(term) || []);
}

console.log('query=' + query.join('+'));
console.log('matches=' + matches.join(','));
console.log('cache_postings=' + index.get('cache').length);
assert.deepEqual(matches, ['D1', 'D3']);
assert.equal(index.get('cache').length, 3);
assert.deepEqual(index.get('hit'), ['D1', 'D3']);
`,
      },
      checkpoint:
        '必须得到 matches=D1,D3、cache_postings=3、hit 倒排表为 D1,D3。双指针只在两张升序表上成立；插入文档后必须保持有序且去重。',
    },
    apply: {
      id: 'algorithms-a7-inverted-index-independent',
      title: '独立实践：词频评分、稳定排序与文档删除',
      brief:
        '读取文档与查询词，按各查询词词频之和排序；再删除指定文档并重新查询，确认空倒排表得到空结果。',
      defaultLanguage: 'python',
      stdin: '3\nD1 alpha beta alpha\nD2 beta gamma\nD3 alpha gamma gamma\nbeta gamma\nD2\n',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().strip().splitlines()
n = int(lines[0])
index = {}
term_counts = {}
for line in lines[1:1 + n]:
    parts = line.split()
    doc_id = parts[0]
    words = [word.lower() for word in parts[1:]]
    counts = {}
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    term_counts[doc_id] = counts
    for word, frequency in counts.items():
        index.setdefault(word, {})[doc_id] = frequency

query = lines[1 + n].lower().split()
deleted = lines[2 + n].strip()


def search(terms):
    candidates = set()
    for term in terms:
        candidates.update(index.get(term, {}))
    scored = []
    for doc_id in candidates:
        score = sum(index.get(term, {}).get(doc_id, 0) for term in terms)
        if score:
            scored.append((score, doc_id))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return scored


before = search(query)
for word, postings in index.items():
    postings.pop(deleted, None)
term_counts.pop(deleted, None)
after = search(query)

print("before=" + ",".join(f"{doc}:{score}" for score, doc in before))
print("after=" + ",".join(f"{doc}:{score}" for score, doc in after))
print("removed_postings=" + str(sum(1 for postings in index.values() if deleted not in postings)))
assert before == [(2, "D2"), (2, "D3"), (1, "D1")]
assert after == [(2, "D3"), (1, "D1")]
assert deleted not in index.get("beta", {})
`,
      },
      checkpoint:
        'before 必须为 D2:2,D3:2,D1:1，after 必须为 D3:2,D1:1，且 D2 不再出现在任何倒排表。排序必须带文档标识作为次级键，避免同分结果漂移。',
    },
  },

  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：去重、布隆过滤器与近似计数': {
    ...nodeRuntime,
    title: 'A7 代码台 02 · 布隆过滤与 Count-Min Sketch',
    description:
      '用多个独立哈希位实现只允许假阳性的集合判定，再用多行计数草图估计流式频次，比较近似误差和内存状态。',
    practice: {
      id: 'algorithms-a7-dedup-guided',
      title: '跟做：确定性布隆过滤器',
      brief:
        '读取已插入键和查询键，使用 256 位与两组哈希函数。已插入键绝不能假阴性，额外键允许假阳性。',
      defaultLanguage: 'javascript',
      stdin: 'cache,user:42,order:9,api,cache\nuser:42\nmissing-key\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const insertions = lines[0].split(',').filter(Boolean);
const queries = lines.slice(1);
const bits = new Uint8Array(256);

function hash(text, seed) {
  let value = (2166136261 ^ seed) >>> 0;
  for (const ch of text) {
    value = Math.imul(value ^ ch.codePointAt(0), 16777619) >>> 0;
  }
  return value;
}

function positions(key) {
  return [hash(key, 17) % bits.length, hash(key, 257) % bits.length];
}

function add(key) {
  for (const position of positions(key)) bits[position] = 1;
}

function mightContain(key) {
  return positions(key).every((position) => bits[position] === 1);
}

for (const key of insertions) add(key);
const results = queries.map((key) => [key, mightContain(key)]);
const bitCount = bits.reduce((sum, bit) => sum + bit, 0);

console.log('results=' + results.map(([key, value]) => key + ':' + value).join(','));
console.log('bit_count=' + bitCount);
assert.ok(insertions.every((key) => mightContain(key)));
assert.deepEqual(results, [['user:42', true], ['missing-key', false]]);
assert.ok(bitCount >= 6 && bitCount <= 9);
`,
      },
      checkpoint:
        'user:42 必须为 true，missing-key 在此输入上必须为 false，bit_count 应在 6 到 9 之间。布隆过滤器只能保证“可能存在”，不能把 false 解释成存在。',
    },
    apply: {
      id: 'algorithms-a7-dedup-independent',
      title: '独立实践：Count-Min Sketch 高频估计',
      brief:
        '读取词流，使用 16 列、3 行计数草图估计频次，输出最重的三个词、估计值与精确值，并核对估计永不低于真实计数。',
      defaultLanguage: 'javascript',
      stdin: '32\na a a a b b b c c d e\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const width = Number(lines[0]);
const stream = lines[1].split(/\s+/).filter(Boolean);
const depth = 3;
const table = Array.from({ length: depth }, () => new Uint16Array(width));
const exact = new Map();

function hash(text, seed) {
  let value = (2166136261 ^ seed) >>> 0;
  for (const ch of text) value = Math.imul(value ^ ch.codePointAt(0), 16777619) >>> 0;
  return value;
}

for (const token of stream) {
  exact.set(token, (exact.get(token) || 0) + 1);
  for (let row = 0; row < depth; row += 1) {
    table[row][hash(token, row * 4099 + 11) % width] += 1;
  }
}

function estimate(token) {
  let minimum = Infinity;
  for (let row = 0; row < depth; row += 1) {
    minimum = Math.min(minimum, table[row][hash(token, row * 4099 + 11) % width]);
  }
  return minimum;
}

const ranked = [...exact.entries()]
  .map(([token, count]) => ({ token, count, guess: estimate(token) }))
  .sort((left, right) => right.guess - left.guess || left.token.localeCompare(right.token))
  .slice(0, 3);

console.log('top=' + ranked.map((row) => row.token + ':' + row.guess + '/' + row.count).join(','));
console.log('distinct=' + exact.size);
assert.deepEqual(ranked.map((row) => row.token), ['a', 'b', 'c']);
assert.deepEqual(ranked.map((row) => row.count), [4, 3, 2]);
assert.ok(ranked.every((row) => row.guess >= row.count));
assert.equal(exact.size, 5);
`,
      },
      checkpoint:
        'top 必须依次为 a:4/4、b:3/3、c:2/2，distinct=5，所有估计值不得小于真实值。Count-Min 的误差来自哈希碰撞，只会上偏，不会下偏。',
    },
  },

  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：一致性哈希、分片与热点倾斜': {
    ...nodeRuntime,
    title: 'A7 代码台 03 · 虚拟节点迁移与加权热点分配',
    description:
      '比较增加节点前后的键归属，量化真正迁移的比例；再用加权 rendezvous 哈希分配热点键，观察权重与最终负载的关系。',
    practice: {
      id: 'algorithms-a7-consistent-hashing-guided',
      title: '跟做：增加节点后的最小迁移',
      brief:
        '用 40 个虚拟节点把 40 个键分配到 A、B、C 三个节点，再加入 D，统计每个节点负载和发生迁移的键数。',
      defaultLanguage: 'javascript',
      stdin: '40 40\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const [keyCount, replicas] = fs.readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);

function hash(text) {
  let value = 2166136261;
  for (const ch of text) value = Math.imul(value ^ ch.codePointAt(0), 16777619) >>> 0;
  return value >>> 0;
}

function buildRing(nodes) {
  const ring = [];
  for (const node of nodes) {
    for (let replica = 0; replica < replicas; replica += 1) {
      ring.push({ point: hash(node + '#' + replica), node });
    }
  }
  return ring.sort((left, right) => left.point - right.point);
}

function owner(ring, key) {
  const point = hash(key);
  let low = 0;
  let high = ring.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ring[mid].point < point) low = mid + 1;
    else high = mid;
  }
  return ring[low % ring.length].node;
}

function assign(nodes) {
  const ring = buildRing(nodes);
  return Array.from({ length: keyCount }, (_, index) => owner(ring, 'key:' + index));
}

const before = assign(['A', 'B', 'C']);
const after = assign(['A', 'B', 'C', 'D']);
const remapped = before.reduce((count, node, index) => count + (node !== after[index] ? 1 : 0), 0);
const load = after.reduce((counts, node) => {
  counts[node] = (counts[node] || 0) + 1;
  return counts;
}, {});

console.log('load=' + Object.entries(load).sort().map(([node, count]) => node + ':' + count).join(','));
console.log('remapped=' + remapped);
assert.equal(before.length, keyCount);
assert.equal(after.length, keyCount);
assert.ok(remapped > 0 && remapped < keyCount);
assert.ok((load.D || 0) > 0);
`,
      },
      checkpoint:
        '必须输出四节点负载、remapped 大于 0 且小于 40。加入一个节点只应迁移它接管的区间；若每次大量全量重排，说明哈希环实现或排序有误。',
    },
    apply: {
      id: 'algorithms-a7-consistent-hashing-independent',
      title: '独立实践：加权 rendezvous 与热点负载',
      brief:
        '读取键数量，按权重 A=1、B=3、C=2 为每个键独立计算优先值，统计负载与最大份额，验证加权节点承担更多键。',
      defaultLanguage: 'javascript',
      stdin: '6000\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const keyCount = Number(fs.readFileSync(0, 'utf8').trim());
const nodes = [
  { name: 'A', weight: 1 },
  { name: 'B', weight: 3 },
  { name: 'C', weight: 2 },
];

function hash(text) {
  let value = 2166136261;
  for (const ch of text) value = Math.imul(value ^ ch.codePointAt(0), 16777619) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value >>> 0;
}

const load = { A: 0, B: 0, C: 0 };
for (let index = 0; index < keyCount; index += 1) {
  let winner = null;
  let winnerScore = Infinity;
  for (const node of nodes) {
    const unit = (hash('key:' + index + '|' + node.name) + 1) / 4294967297;
    const score = -Math.log(unit) / node.weight;
    if (score < winnerScore) {
      winnerScore = score;
      winner = node.name;
    }
  }
  load[winner] += 1;
}

const maximum = Math.max(...Object.values(load));
console.log('load=' + Object.entries(load).map(([node, count]) => node + ':' + count).join(','));
console.log('max_share=' + (maximum / keyCount).toFixed(3));
assert.equal(Object.values(load).reduce((sum, count) => sum + count, 0), keyCount);
assert.ok(load.B > load.C && load.C > load.A);
assert.ok(maximum / keyCount > 0.45);
`,
      },
      checkpoint:
        'B 的负载必须高于 C，C 必须高于 A，且最大单节点份额超过 45%。加权 rendezvous 选择指数优先级最小者，实际负载会在权重比例附近波动。',
    },
  },

  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：数据规模、内存预算与流式处理': {
    ...nodeRuntime,
    title: 'A7 代码台 04 · 峰值内存预算与单遍流式聚合',
    description:
      '先按数据总量计算整表加载的峰值预算，再用固定状态完成计数、最大值和 Top-K，验证结果不需要保存全部输入。',
    practice: {
      id: 'algorithms-a7-memory-budget-guided',
      title: '跟做：整表加载与流式预算对照',
      brief:
        '读取行数、每行有效字节和内存上限，估算整表数组与流式缓冲的峰值内存，输出两条预算和判定。',
      defaultLanguage: 'javascript',
      stdin: '20000000 100 2048\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const [rows, payloadBytes, budgetMb] = fs.readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);
const recordOverhead = 40;
const indexOverhead = 24;
const wholeBytes = rows * (payloadBytes + recordOverhead + indexOverhead);
const streamStateBytes = 64 * 1024 + 512 + 64;
const budgetBytes = budgetMb * 1024 * 1024;

console.log('whole_mb=' + (wholeBytes / 1024 / 1024).toFixed(1));
console.log('stream_kb=' + (streamStateBytes / 1024).toFixed(1));
console.log('whole_verdict=' + (wholeBytes <= budgetBytes ? 'FIT' : 'OVER'));
console.log('stream_verdict=' + (streamStateBytes <= budgetBytes ? 'FIT' : 'OVER'));
assert.equal(wholeBytes, 3280000000);
assert.equal(wholeBytes <= budgetBytes, false);
assert.equal(streamStateBytes <= budgetBytes, true);
`,
      },
      checkpoint:
        'whole_mb 必须为 3128.1、whole_verdict=OVER，stream_kb 必须为 64.6、stream_verdict=FIT。流式峰值由缓冲和固定状态决定，不能随已处理行数增长。',
    },
    apply: {
      id: 'algorithms-a7-memory-budget-independent',
      title: '独立实践：固定状态流式统计',
      brief:
        '读取总条数、随机种子与 K，用确定性线性同余生成器逐项处理，维护总和、最大值、平方和与 K 个最大项，再与一次性数组结果对账。',
      defaultLanguage: 'python',
      stdin: '200000 17 8\n',
      starterCode: {
        python: String.raw`import heapq
import sys


n, seed, k = map(int, sys.stdin.read().split())
MOD = 1_000_003


def generate(seed_value, count):
    state = seed_value
    for _ in range(count):
        state = (state * 48271) % 2147483647
        yield state % MOD


total = 0
maximum = -1
square_sum = 0
top_k = []
for value in generate(seed, n):
    total += value
    square_sum += value * value
    maximum = max(maximum, value)
    if len(top_k) < k:
        heapq.heappush(top_k, value)
    elif value > top_k[0]:
        heapq.heapreplace(top_k, value)

expected = list(generate(seed, n))
assert total == sum(expected)
assert maximum == max(expected)
assert square_sum == sum(value * value for value in expected)
assert sorted(top_k) == sorted(expected)[-k:]

print("sum=", total)
print("max=", maximum)
print("square_sum=", square_sum)
print("top_k=" + ",".join(map(str, sorted(top_k, reverse=True))))
print("state_items=", len(top_k) + 3)
`,
      },
      checkpoint:
        '输出总和、最大值、平方和与 Top-K 必须和一次性数组对账完全一致，state_items 必须为 K+3。随机输入要固定种子，才能既对账又能复现问题。',
    },
  },

  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：算法工程毕业项目与答辩': {
    ...nodeRuntime,
    title: 'A7 代码台 05 · 容量实验与发布门禁',
    description:
      '先对多个缓存容量跑同一访问序列，按命中率和内存约束选最小可行容量；再根据延迟、命中率、内存、错误率与回滚证据做发布判定。',
    practice: {
      id: 'algorithms-a7-capstone-guided',
      title: '跟做：用容量实验选择最小可行缓存',
      brief:
        '在同一合成访问序列上模拟容量 16、32、64 的 LRU 缓存，输出命中率、估算内存，并选出命中率达到 70% 的最小容量。',
      defaultLanguage: 'javascript',
      stdin: '4000 0.70 16 32 64\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const [requestCount, target, ...capacities] = fs.readFileSync(0, 'utf8')
  .trim().split(/\s+/).map(Number);

const requests = [];
let state = 17;
for (let index = 0; index < requestCount; index += 1) {
  state = (state * 48271) % 2147483647;
  const key = state % 64;
  requests.push(index % 13 === 0 ? 1000 + index : key);
}

function simulate(capacity) {
  const entries = new Map();
  let hits = 0;
  for (const key of requests) {
    if (entries.has(key)) {
      hits += 1;
      entries.delete(key);
    } else if (entries.size >= capacity) {
      entries.delete(entries.keys().next().value);
    }
    entries.set(key, true);
  }
  return hits / requests.length;
}

const report = capacities.map((capacity) => ({
  capacity,
  hitRate: simulate(capacity),
  memoryKb: capacity * 96 / 1024,
}));
const selected = report.find((row) => row.hitRate >= target);
console.log('report=' + report.map((row) => row.capacity + ':' + row.hitRate.toFixed(3)).join(','));
console.log('selected=' + selected.capacity);
assert.equal(requestCount, 4000);
assert.ok(report[0].hitRate < report[1].hitRate && report[1].hitRate < report[2].hitRate);
assert.equal(selected.capacity, 64);
`,
      },
      checkpoint:
        '容量 16、32、64 的命中率必须递增，最终 selected=64。容量实验只改一个变量并使用同一序列，答辩时要能复跑并解释命中率跃迁。',
    },
    apply: {
      id: 'algorithms-a7-capstone-independent',
      title: '独立实践：发布门禁与回滚证据',
      brief:
        '读取一次灰度实验指标，检查 P95、命中率、内存、错误率和回滚时长五项门禁；再构造一个失败场景，验证拒绝发布。',
      defaultLanguage: 'javascript',
      stdin: '{"p95":180,"slo":200,"hitRate":0.87,"minHitRate":0.85,"memoryMb":920,"budgetMb":1024,"canaryErrorRate":0.004,"maxErrorRate":0.01,"rollbackSeconds":75,"maxRollbackSeconds":120}\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');
const metrics = JSON.parse(fs.readFileSync(0, 'utf8').trim());

function evaluate(input) {
  const checks = [
    ['latency', input.p95 <= input.slo],
    ['hit_rate', input.hitRate >= input.minHitRate],
    ['memory', input.memoryMb <= input.budgetMb],
    ['error_rate', input.canaryErrorRate <= input.maxErrorRate],
    ['rollback', input.rollbackSeconds <= input.maxRollbackSeconds],
  ];
  return {
    verdict: checks.every(([, passed]) => passed) ? 'RELEASE' : 'BLOCK',
    failed: checks.filter(([, passed]) => !passed).map(([name]) => name),
    headroom: {
      latencyMs: input.slo - input.p95,
      memoryMb: input.budgetMb - input.memoryMb,
      errorRate: input.maxErrorRate - input.canaryErrorRate,
    },
  };
}

const accepted = evaluate(metrics);
const rejected = evaluate({ ...metrics, p95: 230, memoryMb: 1100 });
console.log('accepted=' + accepted.verdict + ':' + accepted.failed.join(','));
console.log('rejected=' + rejected.verdict + ':' + rejected.failed.join(','));
console.log('latency_headroom=' + accepted.headroom.latencyMs);
assert.equal(accepted.verdict, 'RELEASE');
assert.deepEqual(accepted.failed, []);
assert.equal(rejected.verdict, 'BLOCK');
assert.deepEqual(rejected.failed, ['latency', 'memory']);
assert.equal(accepted.headroom.latencyMs, 20);
assert.equal(accepted.headroom.errorRate, 0.006);
`,
      },
      checkpoint:
        'accepted 必须为 RELEASE，rejected 必须为 BLOCK:latency,memory，延迟余量必须为 20ms。发布结论必须能指出失败门禁，回滚时长也是验收项而不是口头承诺。',
    },
  },
};
