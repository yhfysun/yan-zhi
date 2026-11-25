import type { LearningV2CodeLab } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js / JavaScript 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '应用内 Node.js 运行器执行单个 JavaScript 文件，任务只依赖标准库。',
    '先按 stdin 手算关键状态，再运行程序并核对断言与 checkpoint。',
    '断言失败会返回非零退出码；不能只看最后一行输出判断通过。',
  ],
  languages: ['javascript'],
} as const;

const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3 / 标准库',
  docsUrl: 'https://docs.python.org/zh-cn/3/library/',
  installSteps: [
    '应用内 Python 3 运行器执行单个文件，任务只依赖标准库。',
    '先按 stdin 写出小规模状态表，再运行程序并核对断言与 checkpoint。',
    '断言失败会返回非零退出码；不能只凭打印结果判断答案正确。',
  ],
  languages: ['python'],
} as const;

export const LEARNING_CODE_LABS_ALGORITHMS_FINAL_B: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：状态压缩与集合 DP': {
    ...nodeRuntime,
    title: '集合 DP 代码台 · 最短哈密顿路径与访问集合',
    description:
      '用 mask 记录已访问节点、用 last 记录当前落点，逐步扩展集合。两个任务都要求恢复具体路径或分配方案，避免只返回一个无法解释的数值。',
    practice: {
      id: 'algorithms-final-a4-subset-hamilton-guided',
      title: '跟做：mask 与落点双状态求最短路径',
      brief:
        '输入四座城市的单向距离矩阵，固定从 0 出发并访问每座城市一次。dp[mask][last] 保存最短代价，parent 保存上一个城市。',
      defaultLanguage: 'javascript',
      stdin:
        '4\n0 2 9 10\n1 0 6 4\n15 7 0 8\n6 3 3 0\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const n = Number(lines[0]);
const distance = lines.slice(1, n + 1).map((line) => line.split(/\s+/).map(Number));
const stateCount = 1 << n;
const inf = Number.POSITIVE_INFINITY;
const dp = Array.from({ length: stateCount }, () => Array(n).fill(inf));
const parent = Array.from({ length: stateCount }, () => Array(n).fill(-1));

dp[1][0] = 0;
for (let mask = 1; mask < stateCount; mask += 1) {
  if ((mask & 1) === 0) continue;
  for (let last = 0; last < n; last += 1) {
    if (dp[mask][last] === inf) continue;
    for (let next = 0; next < n; next += 1) {
      if ((mask & (1 << next)) !== 0) continue;
      const nextMask = mask | (1 << next);
      const candidate = dp[mask][last] + distance[last][next];
      if (candidate < dp[nextMask][next]) {
        dp[nextMask][next] = candidate;
        parent[nextMask][next] = last;
      }
    }
  }
}

const fullMask = stateCount - 1;
let last = 1;
for (let node = 1; node < n; node += 1) {
  if (dp[fullMask][node] < dp[fullMask][last]) last = node;
}

const path = [];
let mask = fullMask;
let cursor = last;
while (cursor !== -1) {
  path.push(cursor);
  const previous = parent[mask][cursor];
  mask ^= 1 << cursor;
  cursor = previous;
}
path.reverse();

console.log('shortest_path_cost=' + dp[fullMask][last]);
console.log('path=' + path.join('>'));
console.log('reachable_states=' + dp.flat().filter((value) => value < inf).length);

assert.equal(dp[fullMask][last], 9);
assert.equal(path.join('>'), '0>1>3>2');
`,
      },
      checkpoint:
        '必须输出 shortest_path_cost=9 与 path=0>1>3>2。手工核对边权为 2+4+3=9；恢复路径时先清掉当前城市的 mask 位，再读取 parent。',
    },
    apply: {
      id: 'algorithms-final-a4-assignment-dp-independent',
      title: '独立实践：工人分配与集合覆盖',
      brief:
        '四名工人依次分配不同任务，mask 表示已经被占用的任务集合。程序求出最小总成本，并逆推每名工人的任务编号。',
      defaultLanguage: 'python',
      stdin:
        '4\n8 4 7 9\n5 2 9 3\n3 6 1 8\n7 4 6 5\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n = int(lines[0])
cost = [list(map(int, line.split())) for line in lines[1:1 + n]]
inf = 10**9
limit = 1 << n
dp = [inf] * limit
choice = [-1] * limit
dp[0] = 0

for mask in range(limit):
    worker = mask.bit_count()
    if worker >= n or dp[mask] == inf:
        continue
    for job in range(n):
        if mask & (1 << job):
            continue
        next_mask = mask | (1 << job)
        candidate = dp[mask] + cost[worker][job]
        if candidate < dp[next_mask]:
            dp[next_mask] = candidate
            choice[next_mask] = job

assignment = [0] * n
mask = limit - 1
for worker in range(n - 1, -1, -1):
    job = choice[mask]
    assignment[worker] = job + 1
    mask ^= 1 << job

print("minimum_cost=" + str(dp[limit - 1]))
print("jobs_by_worker=" + ",".join(map(str, assignment)))
assert dp[limit - 1] == 15
assert assignment == [2, 1, 3, 4]
`,
      },
      checkpoint:
        'minimum_cost 必须为 15，jobs_by_worker 必须为 2,1,3,4。逆推时 mask 的位数决定当前工人，不能用已恢复的任务数代替 worker 下标。',
    },
  },

  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：数位 DP 与概率期望': {
    ...pythonRuntime,
    title: '数位与期望代码台 · 卡上界计数和吸收状态',
    description:
      '第一题用 tight 标记逐位统计不含禁用数字的整数，第二题把剩余距离作为期望状态，用精确有理数消除浮点累计误差。',
    practice: {
      id: 'algorithms-final-a4-digit-count-guided',
      title: '跟做：统计 1 到 n 中不含 4 的整数',
      brief:
        '记忆化状态只保留当前位与是否卡上界。前缀一旦小于上界，后续每一位都可自由选择除 4 以外的九个数字。',
      defaultLanguage: 'python',
      stdin: '234\n',
      starterCode: {
        python: String.raw`from functools import lru_cache
import sys

upper = int(sys.stdin.read().strip())
digits = tuple(map(int, str(upper)))


def count_from_zero(n):
    if n < 0:
        return 0
    target = tuple(map(int, str(n)))

    @lru_cache(maxsize=None)
    def visit(position, tight):
        if position == len(target):
            return 1
        limit = target[position] if tight else 9
        total = 0
        for digit in range(limit + 1):
            if digit == 4:
                continue
            total += visit(position + 1, tight and digit == limit)
        return total

    return visit(0, True)


answer = count_from_zero(upper) - 1
brute = sum("4" not in str(value) for value in range(1, upper + 1))
print("without_digit_4=" + str(answer))
print("memo_states=" + str((len(digits) + 1) * 2))
assert answer == 192
assert answer == brute
`,
      },
      checkpoint:
        '1 到 234 中不含 4 的整数必须是 192，并与逐数过滤完全一致。tight 为真时上限取当前上界位，否则只能取 9；漏掉这一步会统计越界数字。',
    },
    apply: {
      id: 'algorithms-final-a4-dice-expectation-independent',
      title: '独立实践：六面骰到达终点的期望步数',
      brief:
        '状态表示离终点还差的距离。每次掷出 1 到 6，超过或等于距离即结束；E(d)=1+平均(E(max(0,d-i)))。',
      defaultLanguage: 'python',
      stdin: '12\n',
      starterCode: {
        python: String.raw`from fractions import Fraction
import sys

target = int(sys.stdin.read().strip())
expected = [Fraction(0) for _ in range(target + 1)]

for distance in range(1, target + 1):
    continuation = sum(
        expected[max(0, distance - step)] for step in range(1, 7)
    ) / 6
    expected[distance] = 1 + continuation

answer = expected[target]
print("expected=" + str(answer))
print("decimal=" + format(float(answer), ".6f"))
print("states=" + str(target))
assert str(answer) == "1417221463/362797056"
assert abs(float(answer) - 3.906375312483241) < 1e-12
`,
      },
      checkpoint:
        '目标距离 12 时精确期望必须是 1417221463/362797056，约 3.906375。每次掷骰都会增加一步，超过终点的分支归入距离 0，不能继续累加负数状态。',
    },
  },

  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：回溯、剪枝和组合搜索': {
    ...nodeRuntime,
    title: '回溯代码台 · 同级去重与位掩码约束',
    description:
      '子集和用排序、剩余目标和与同级去重控制搜索树；N 皇后把列和两条对角线压成位掩码，每一步只枚举合法落点。',
    practice: {
      id: 'algorithms-final-a4-subset-dedup-guided',
      title: '跟做：重复元素子集和只输出一次',
      brief:
        '输入升序数组与目标和。递归选择后续下标，同一层跳过相同值；当前值大于剩余目标时，后续更大值都可直接剪掉。',
      defaultLanguage: 'javascript',
      stdin: '6 10\n2 3 5 5 7 8\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const [n, target] = lines[0].split(/\s+/).map(Number);
const values = lines[1].split(/\s+/).map(Number).sort((a, b) => a - b);
const answers = [];
let nodes = 0;

function search(start, remain, path) {
  nodes += 1;
  if (remain === 0) {
    answers.push(path.join('+'));
    return;
  }
  for (let index = start; index < values.length; index += 1) {
    if (index > start && values[index] === values[index - 1]) continue;
    if (values[index] > remain) break;
    path.push(values[index]);
    search(index + 1, remain - values[index], path);
    path.pop();
  }
}

search(0, target, []);
console.log('solutions=' + answers.join('|'));
console.log('visited_nodes=' + nodes);

assert.equal(values.length, n);
assert.equal(answers.join('|'), '2+3+5|2+8|3+7|5+5');
assert.ok(nodes < 40);
`,
      },
      checkpoint:
        '解集必须恰好为 2+3+5、2+8、3+7、5+5，不能输出两个重复的 5+5。同级去重条件使用 index > start，而不是 index > 0。',
    },
    apply: {
      id: 'algorithms-final-a4-n-queens-independent',
      title: '独立实践：位掩码 N 皇后计数',
      brief:
        'cols、diag1、diag2 分别标记列、主对角线和副对角线。每层只枚举 full 中尚可放置的位置，落子后左移或右移掩码传播攻击范围。',
      defaultLanguage: 'python',
      stdin: '6\n',
      starterCode: {
        python: String.raw`import sys

n = int(sys.stdin.read().strip())
full = (1 << n) - 1
solutions = []


def search(row, columns, diagonal_left, diagonal_right, board):
    if row == n:
        solutions.append(tuple(board))
        return
    available = full & ~(columns | diagonal_left | diagonal_right)
    while available:
        bit = available & -available
        available ^= bit
        column = bit.bit_length() - 1
        board.append(column)
        search(
            row + 1,
            columns | bit,
            ((diagonal_left | bit) << 1) & full,
            (diagonal_right | bit) >> 1,
            board,
        )
        board.pop()


search(0, 0, 0, 0, [])
print("solution_count=" + str(len(solutions)))
print("first_board=" + ",".join(map(str, solutions[0])))
assert len(solutions) == 4
assert all(len(set(board)) == n for board in solutions)
`,
      },
      checkpoint:
        '6 皇后必须恰好有 4 个解，first_board 的六个列号互不重复。两条对角线一条左移、一条右移后再与 full 对齐，方向写反会造成漏解或误判。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：带懒标记的线段树': {
    ...nodeRuntime,
    title: '懒线段树代码台 · 区间加与区间赋值',
    description:
      '第一题用加法标记维护区间和，第二题用可空赋值标记覆盖旧标记。核心检查是下传时增量乘区间长度，并且复合标记的优先级明确。',
    practice: {
      id: 'algorithms-final-a5-lazy-add-guided',
      title: '跟做：区间加与区间求和',
      brief:
        '在 1 到 8 上执行一次区间加，再查询整个区间与子区间。完全覆盖节点只更新 sum 和 lazy，查询遇到懒节点前先下传。',
      defaultLanguage: 'javascript',
      stdin:
        '8\n1 2 3 4 5 6 7 8\n3\nADD 2 5 3\nSUM 1 8\nSUM 3 4\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const n = Number(lines[0]);
const values = lines[1].split(/\s+/).map(Number);
const operationCount = Number(lines[2]);
const operations = lines.slice(3, 3 + operationCount);
const tree = new Array(4 * n).fill(0);
const lazy = new Array(4 * n).fill(0);

function build(node, left, right) {
  if (left === right) {
    tree[node] = values[left - 1];
    return;
  }
  const middle = (left + right) >> 1;
  build(node * 2, left, middle);
  build(node * 2 + 1, middle + 1, right);
  tree[node] = tree[node * 2] + tree[node * 2 + 1];
}

function push(node, left, right) {
  if (lazy[node] === 0 || left === right) return;
  const middle = (left + right) >> 1;
  const leftLength = middle - left + 1;
  const rightLength = right - middle;
  tree[node * 2] += lazy[node] * leftLength;
  tree[node * 2 + 1] += lazy[node] * rightLength;
  lazy[node * 2] += lazy[node];
  lazy[node * 2 + 1] += lazy[node];
  lazy[node] = 0;
}

function add(node, left, right, queryLeft, queryRight, delta) {
  if (queryLeft <= left && right <= queryRight) {
    tree[node] += delta * (right - left + 1);
    lazy[node] += delta;
    return;
  }
  push(node, left, right);
  const middle = (left + right) >> 1;
  if (queryLeft <= middle) add(node * 2, left, middle, queryLeft, queryRight, delta);
  if (queryRight > middle) add(node * 2 + 1, middle + 1, right, queryLeft, queryRight, delta);
  tree[node] = tree[node * 2] + tree[node * 2 + 1];
}

function query(node, left, right, queryLeft, queryRight) {
  if (queryLeft <= left && right <= queryRight) return tree[node];
  push(node, left, right);
  const middle = (left + right) >> 1;
  let total = 0;
  if (queryLeft <= middle) total += query(node * 2, left, middle, queryLeft, queryRight);
  if (queryRight > middle) total += query(node * 2 + 1, middle + 1, right, queryLeft, queryRight);
  return total;
}

build(1, 1, n);
const answers = [];
for (const operation of operations) {
  const parts = operation.split(/\s+/);
  const left = Number(parts[1]);
  const right = Number(parts[2]);
  if (parts[0] === 'ADD') {
    add(1, 1, n, left, right, Number(parts[3]));
  } else {
    answers.push(query(1, 1, n, left, right));
  }
}

console.log('query_answers=' + answers.join(','));
console.log('root_sum=' + tree[1]);
assert.deepEqual(answers, [48, 13]);
assert.equal(tree[1], 48);
`,
      },
      checkpoint:
        '查询答案必须为 48,13，根节点和为 48。区间 2 到 5 各加 3 共增加 12，原总和 36 变为 48；子区间 3 到 4 原和 7 加 6 得 13。',
    },
    apply: {
      id: 'algorithms-final-a5-lazy-assign-independent',
      title: '独立实践：区间赋值覆盖旧标记',
      brief:
        '赋值标记为 None 表示没有待下传操作。完整覆盖时把 sum 直接改为 value 乘区间长度，并覆盖 lazy；查询前先传播赋值。',
      defaultLanguage: 'python',
      stdin:
        '6\n2 1 4 3 5 6\n4\nSET 2 4 7\nSET 3 6 2\nSUM 2 5\nSUM 1 6\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n = int(lines[0])
values = list(map(int, lines[1].split()))
operation_count = int(lines[2])
operations = lines[3:3 + operation_count]
tree = [0] * (4 * n)
lazy = [None] * (4 * n)


def build(node, left, right):
    if left == right:
        tree[node] = values[left - 1]
        return
    middle = (left + right) // 2
    build(node * 2, left, middle)
    build(node * 2 + 1, middle + 1, right)
    tree[node] = tree[node * 2] + tree[node * 2 + 1]


def apply_assign(node, left, right, value):
    tree[node] = value * (right - left + 1)
    lazy[node] = value


def push(node, left, right):
    value = lazy[node]
    if value is None or left == right:
        return
    middle = (left + right) // 2
    apply_assign(node * 2, left, middle, value)
    apply_assign(node * 2 + 1, middle + 1, right, value)
    lazy[node] = None


def assign(node, left, right, query_left, query_right, value):
    if query_left <= left and right <= query_right:
        apply_assign(node, left, right, value)
        return
    push(node, left, right)
    middle = (left + right) // 2
    if query_left <= middle:
        assign(node * 2, left, middle, query_left, query_right, value)
    if query_right > middle:
        assign(node * 2 + 1, middle + 1, right, query_left, query_right, value)
    tree[node] = tree[node * 2] + tree[node * 2 + 1]


def query(node, left, right, query_left, query_right):
    if query_left <= left and right <= query_right:
        return tree[node]
    push(node, left, right)
    middle = (left + right) // 2
    total = 0
    if query_left <= middle:
        total += query(node * 2, left, middle, query_left, query_right)
    if query_right > middle:
        total += query(node * 2 + 1, middle + 1, right, query_left, query_right)
    return total


build(1, 1, n)
answers = []
for operation in operations:
    parts = operation.split()
    left, right = int(parts[1]), int(parts[2])
    if parts[0] == "SET":
        assign(1, 1, n, left, right, int(parts[3]))
    else:
        answers.append(query(1, 1, n, left, right))

print("answers=" + ",".join(map(str, answers)))
print("root_sum=" + str(tree[1]))
assert answers == [13, 17]
assert tree[1] == 17
`,
      },
      checkpoint:
        '两次查询必须为 13,17，最终根和也是 17。赋值标记必须直接用新值覆盖 lazy，不能与旧加法标记相加；None 与 0 的语义必须区分。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：Fenwick 求第 K 小与二维前缀': {
    ...nodeRuntime,
    title: 'Fenwick 代码台 · 排名倍增与二维矩形和',
    description:
      '权值树保存动态计数并用二进制倍增找第 k 小；二维树把行、列两层 lowbit 链结合起来，完成点加与矩形查询。',
    practice: {
      id: 'algorithms-final-a5-fenwick-kth-guided',
      title: '跟做：插入、删除与动态第 k 小',
      brief:
        '在固定值域 1 到 16 上维护频次。查找第 k 小时从最高二进制步长开始试探，累计计数仍小于 k 才向前跳。',
      defaultLanguage: 'javascript',
      stdin:
        '9\nI 1\nI 3\nI 3\nI 7\nK 2\nI 5\nD 3\nK 3\nK 4\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const operationCount = Number(lines[0]);
const operations = lines.slice(1, 1 + operationCount);
const limit = 16;
const tree = new Array(limit + 1).fill(0);

function update(index, delta) {
  while (index <= limit) {
    tree[index] += delta;
    index += index & -index;
  }
}

function kth(k) {
  let position = 0;
  let accumulated = 0;
  let step = 1;
  while (step * 2 <= limit) step *= 2;
  while (step > 0) {
    const next = position + step;
    if (next <= limit && accumulated + tree[next] < k) {
      position = next;
      accumulated += tree[next];
    }
    step >>= 1;
  }
  return position + 1;
}

const answers = [];
for (const operation of operations) {
  const [kind, rawValue] = operation.split(/\s+/);
  const value = Number(rawValue);
  if (kind === 'I') update(value, 1);
  if (kind === 'D') update(value, -1);
  if (kind === 'K') answers.push(kth(value));
}

console.log('kth_answers=' + answers.join(','));
console.log('tree_size=' + limit);
assert.deepEqual(answers, [3, 5, 7]);
`,
      },
      checkpoint:
        '三次第 k 小查询必须为 3,5,7。最终多重集是 1,3,5,7；倍增条件必须是 accumulated+tree[next] < k，等号写反会返回后一位。',
    },
    apply: {
      id: 'algorithms-final-a5-fenwick-2d-independent',
      title: '独立实践：二维点加与矩形求和',
      brief:
        '构建 4×4 矩阵的二维 Fenwick。点加同时更新行、列两层链，矩形和用四次前缀查询容斥。',
      defaultLanguage: 'python',
      stdin:
        '4 4\n1 2 3 4\n5 6 7 8\n1 1 1 1\n2 2 2 2\n3\nQ 2 2 3 3\nA 3 3 5\nQ 1 1 4 4\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
rows, cols = map(int, lines[0].split())
grid = [list(map(int, lines[row + 1].split())) for row in range(rows)]
operation_count = int(lines[rows + 1])
operations = lines[rows + 2:rows + 2 + operation_count]
bit = [[0] * (cols + 1) for _ in range(rows + 1)]


def add(row, col, delta):
    r = row
    while r <= rows:
        c = col
        while c <= cols:
            bit[r][c] += delta
            c += c & -c
        r += r & -r


def prefix(row, col):
    total = 0
    r = row
    while r > 0:
        c = col
        while c > 0:
            total += bit[r][c]
            c -= c & -c
        r -= r & -r
    return total


def rectangle(r1, c1, r2, c2):
    return (
        prefix(r2, c2)
        - prefix(r1 - 1, c2)
        - prefix(r2, c1 - 1)
        + prefix(r1 - 1, c1 - 1)
    )


for row in range(rows):
    for col in range(cols):
        add(row + 1, col + 1, grid[row][col])

answers = []
for operation in operations:
    parts = operation.split()
    values = list(map(int, parts[1:]))
    if parts[0] == "A":
        add(values[0], values[1], values[2])
    else:
        answers.append(rectangle(*values))

print("answers=" + ",".join(map(str, answers)))
print("whole_matrix=" + str(prefix(rows, cols)))
assert answers == [15, 53]
assert prefix(rows, cols) == 53
`,
      },
      checkpoint:
        '第一次矩形查询必须为 15，点 (3,3) 加 5 后全矩阵和必须为 53。二维更新两层都要沿 lowbit 前进，少写一层只会更新部分行。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：单调队列优化与滑动最值': {
    ...pythonRuntime,
    title: '单调队列代码台 · 窗口最大值与线性 DP',
    description:
      '第一题用下标队列维护窗口最大值，第二题把受限前驱区间压缩为 dp 值的单调队列，把 O(nk) 过渡压到 O(n)。',
    practice: {
      id: 'algorithms-final-a5-sliding-max-guided',
      title: '跟做：窗口最大值与过期下标',
      brief:
        '队列保存下标，对应值从队头到队尾递减。每次先移除出窗下标，再弹掉不可能成为最大值的尾部元素。',
      defaultLanguage: 'python',
      stdin: '8 3\n1 3 -1 -3 5 3 6 7\n',
      starterCode: {
        python: String.raw`from collections import deque
import sys

tokens = list(map(int, sys.stdin.read().split()))
n, window = tokens[0], tokens[1]
values = tokens[2:2 + n]
queue = deque()
answers = []
pushes = 0
pops = 0

for index, value in enumerate(values):
    while queue and values[queue[-1]] <= value:
        queue.pop()
        pops += 1
    queue.append(index)
    pushes += 1
    expired = index - window
    if queue[0] <= expired:
        queue.popleft()
        pops += 1
    if index >= window - 1:
        answers.append(values[queue[0]])

print("window_max=" + ",".join(map(str, answers)))
print("queue_operations=" + str(pushes + pops))
assert answers == [3, 3, 5, 5, 6, 7]
assert pushes + pops <= 2 * n
`,
      },
      checkpoint:
        '窗口最大值必须为 3,3,5,5,6,7，队列操作总数不超过 16。下标过期判断要在读取队头答案之前完成，否则会用到已离开窗口的值。',
    },
    apply: {
      id: 'algorithms-final-a5-monotonic-dp-independent',
      title: '独立实践：用单调队列优化跳跃 DP',
      brief:
        'dp[i] 表示到达第 i 级的最小代价，只能从前 k 级中任一级跳来。队列只需保存区间内 dp 值递增的候选下标。',
      defaultLanguage: 'python',
      stdin: '8 3\n4 2 7 1 3 5 2 6\n',
      starterCode: {
        python: String.raw`from collections import deque
import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n, limit = map(int, lines[0].split())
cost = list(map(int, lines[1].split()))
dp = [0] + [10**9] * n
candidates = deque([0])

for step in range(1, n + 1):
    while candidates[0] < step - limit:
        candidates.popleft()
    dp[step] = dp[candidates[0]] + cost[step - 1]
    while candidates and dp[candidates[-1]] >= dp[step]:
        candidates.pop()
    candidates.append(step)

brute = [0] + [10**9] * n
for step in range(1, n + 1):
    brute[step] = cost[step - 1] + min(
        brute[previous]
        for previous in range(max(0, step - limit), step)
    )

print("dp=" + ",".join(map(str, dp[1:])))
print("minimum_cost=" + str(dp[n]))
assert dp == brute
assert dp[n] == 11
`,
      },
      checkpoint:
        'dp 序列必须为 4,2,7,3,5,8,5,11，最小总代价为 11。只有前 k 级的 dp 值在窗口中，过期候选必须先出队。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：矩阵快速幂与线性递推': {
    ...nodeRuntime,
    title: '矩阵快速幂代码台 · Fibonacci 与三阶递推',
    description:
      '把线性递推写成矩阵乘向量，用二进制幂把 n 次递推压到 log n 次矩阵乘法；第二题在有模数环境中恢复三阶递推。',
    practice: {
      id: 'algorithms-final-a5-fibonacci-matrix-guided',
      title: '跟做：BigInt 矩阵快速幂求 Fibonacci',
      brief:
        '矩阵 [1 1; 1 0] 的 n 次幂右上角就是 F(n)。指数每次右移，底数每次平方，BigInt 避免 F(50) 以上的精度损失。',
      defaultLanguage: 'javascript',
      stdin: '50\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const n = BigInt(fs.readFileSync(0, 'utf8').trim());

function multiply(left, right) {
  return [
    [
      left[0][0] * right[0][0] + left[0][1] * right[1][0],
      left[0][0] * right[0][1] + left[0][1] * right[1][1],
    ],
    [
      left[1][0] * right[0][0] + left[1][1] * right[1][0],
      left[1][0] * right[0][1] + left[1][1] * right[1][1],
    ],
  ];
}

let power = n;
let base = [[1n, 1n], [1n, 0n]];
let result = [[1n, 0n], [0n, 1n]];
while (power > 0n) {
  if (power & 1n) result = multiply(result, base);
  base = multiply(base, base);
  power >>= 1n;
}

const answer = result[0][1];
console.log('fibonacci=' + answer.toString());
console.log('matrix_squarings=' + Math.floor(Math.log2(Number(n))) + 1);
assert.equal(answer.toString(), '12586269025');
`,
      },
      checkpoint:
        'F(50) 必须是 12586269025。指数为奇数才把底数乘入结果，底数无论当前位是否为 1 都要平方；使用普通 Number 会在更大输入上丢精度。',
    },
    apply: {
      id: 'algorithms-final-a5-tribonacci-matrix-independent',
      title: '独立实践：三阶递推与取模',
      brief:
        '递推 T(n)=T(n-1)+2T(n-2)+3T(n-3)。构造 3×3 转移矩阵，向量顺序为 T(2),T(1),T(0)，计算 n-2 次幂。',
      defaultLanguage: 'python',
      stdin: '20\n1 2 3\n1 2 3\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n = int(lines[0])
coefficients = list(map(int, lines[1].split()))
initial = list(map(int, lines[2].split()))
mod = 1_000_000_007


def multiply(left, right):
    size = len(left)
    result = [[0] * size for _ in range(size)]
    for row in range(size):
        for middle in range(size):
            if left[row][middle] == 0:
                continue
            for col in range(size):
                result[row][col] = (
                    result[row][col] + left[row][middle] * right[middle][col]
                ) % mod
    return result


def matrix_power(matrix, exponent):
    size = len(matrix)
    result = [[int(row == col) for col in range(size)] for row in range(size)]
    base = matrix
    while exponent:
        if exponent & 1:
            result = multiply(result, base)
        base = multiply(base, base)
        exponent >>= 1
    return result


transition = [
    coefficients,
    [1, 0, 0],
    [0, 1, 0],
]
powered = matrix_power(transition, n - 2)
vector = list(reversed(initial))
answer = sum(powered[0][index] * vector[index] for index in range(3)) % mod

sequence = initial[:]
for _ in range(3, n + 1):
    sequence.append(
        coefficients[0] * sequence[-1]
        + coefficients[1] * sequence[-2]
        + coefficients[2] * sequence[-3]
    )

print("tribonacci=" + str(answer))
print("iterative_check=" + str(sequence[n] % mod))
assert answer == 22383417
assert answer == sequence[n] % mod
`,
      },
      checkpoint:
        'n=20 的答案必须是 22383417，并与逐项递推一致。矩阵初值顺序必须与向量一致，指数写成 n 或 n-1 都会整体错位。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：Meet-in-the-Middle 与折半枚举': {
    ...pythonRuntime,
    title: '折半枚举代码台 · 子集计数与容量选择',
    description:
      '第一题把数组切成两半，枚举各半子集和并用哈希补数；第二题排序右半和，二分查找不超过容量减法限制的最大组合。',
    practice: {
      id: 'algorithms-final-a5-subset-count-mitm-guided',
      title: '跟做：两半子集和匹配目标和',
      brief:
        '长度 8 的数组拆成两个长度 4 的区间，各枚举 16 个掩码和。统计左右和相加等于 target 的组合数。',
      defaultLanguage: 'python',
      stdin: '8 10\n1 2 3 4 5 6 7 8\n',
      starterCode: {
        python: String.raw`from collections import Counter
import sys

tokens = list(map(int, sys.stdin.read().split()))
n, target = tokens[0], tokens[1]
values = tokens[2:2 + n]
middle = n // 2


def subset_sums(items):
    sums = []
    for mask in range(1 << len(items)):
        total = 0
        for index, value in enumerate(items):
            if mask & (1 << index):
                total += value
        sums.append(total)
    return sums


left_sums = subset_sums(values[:middle])
right_sums = subset_sums(values[middle:])
frequency = Counter(right_sums)
count = sum(frequency[target - value] for value in left_sums)

print("matching_subsets=" + str(count))
print("left_states=" + str(len(left_sums)))
print("right_states=" + str(len(right_sums)))
assert count == 8
assert len(left_sums) * len(right_sums) == 256
`,
      },
      checkpoint:
        '和为 10 的子集必须恰好有 8 个，左右状态各 16 个。两侧空集也会参与匹配，空加空只在 target 为 0 时计为一个合法子集。',
    },
    apply: {
      id: 'algorithms-final-a5-capacity-mitm-independent',
      title: '独立实践：折半枚举最大不超容量组合',
      brief:
        '12 个重量拆成两组各 6 个。列出右半全部和并排序，对每个左半和二分查找不超过剩余容量的最大右半和。',
      defaultLanguage: 'python',
      stdin:
        '12 35\n12 7 5 16 9 3 8 11 6 14 4 10\n',
      starterCode: {
        python: String.raw`from bisect import bisect_right
import sys

tokens = list(map(int, sys.stdin.read().split()))
n, capacity = tokens[0], tokens[1]
weights = tokens[2:2 + n]
split = n // 2


def enumerate_sums(items):
    results = []
    for mask in range(1 << len(items)):
        total = 0
        for index, weight in enumerate(items):
            if mask & (1 << index):
                total += weight
        results.append((total, mask))
    return results


left = enumerate_sums(weights[:split])
right = enumerate_sums(weights[split:])
right.sort()
right_values = [item[0] for item in right]
best = -1
witness = None

for left_sum, left_mask in left:
    if left_sum > capacity:
        continue
    position = bisect_right(right_values, capacity - left_sum) - 1
    if position < 0:
        continue
    total = left_sum + right[position][0]
    if total > best:
        best = total
        witness = (left_mask, right[position][1])

print("best_weight=" + str(best))
print("left_mask=" + str(witness[0]))
print("right_mask=" + str(witness[1]))
assert best == 35
assert 16 + 9 + 3 + 7 == 35
`,
      },
      checkpoint:
        '最大不超容量组合必须达到 35，例如 16+9+3+7。右半和必须先排序再二分；只看最接近剩余容量的一项，仍需检查左侧和本身是否超限。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：分块、莫队与离线查询': {
    ...pythonRuntime,
    title: '离线区间代码台 · 分块求和与莫队去重',
    description:
      '分块结构把点更新和区间查询压到根号级；莫队通过排序询问复用左右指针移动，并用计数跨零时刻维护不同元素个数。',
    practice: {
      id: 'algorithms-final-a5-block-sum-guided',
      title: '跟做：分块维护区间和',
      brief:
        '数组按固定块长切分，每个块保存自己的和。点更新同时修数组和块和，区间查询完整块直接累加、边缘块逐元素扫描。',
      defaultLanguage: 'python',
      stdin:
        '10\n5 2 8 1 9 4 7 3 6 0\n3\nA 4 5\nQ 2 7\nQ 1 10\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n = int(lines[0])
values = list(map(int, lines[1].split()))
operation_count = int(lines[2])
operations = lines[3:3 + operation_count]
block_size = int(n ** 0.5)
block_count = (n + block_size - 1) // block_size
blocks = [0] * block_count

for index, value in enumerate(values):
    blocks[index // block_size] += value


def add(index, delta):
    values[index] += delta
    blocks[index // block_size] += delta


def range_sum(left, right):
    total = 0
    while left <= right and left % block_size != 0:
        total += values[left]
        left += 1
    while left + block_size - 1 <= right:
        total += blocks[left // block_size]
        left += block_size
    while left <= right:
        total += values[left]
        left += 1
    return total


answers = []
for operation in operations:
    parts = operation.split()
    if parts[0] == "A":
        add(int(parts[1]) - 1, int(parts[2]))
    else:
        answers.append(range_sum(int(parts[1]) - 1, int(parts[2]) - 1))

print("answers=" + ",".join(map(str, answers)))
print("block_size=" + str(block_size))
assert answers == [36, 50]
`,
      },
      checkpoint:
        '区间查询答案必须为 36,50。块长取 floor(sqrt(n))，边缘先扫到块边界，再整块累加，最后处理尾部；三段顺序不能互相重叠。',
    },
    apply: {
      id: 'algorithms-final-a5-mo-distinct-independent',
      title: '独立实践：莫队统计区间不同元素',
      brief:
        '询问按左端块排序，同块按右端奇偶升降序。add/remove 只改一个计数，答案仅在计数从 0 变 1 或从 1 变 0 时调整。',
      defaultLanguage: 'python',
      stdin:
        '8 4\n1 2 1 3 4 2 5 1\n1 5\n2 6\n3 8\n4 4\n',
      starterCode: {
        python: String.raw`import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n, query_count = map(int, lines[0].split())
values = list(map(int, lines[1].split()))
queries = []
for index in range(query_count):
    left, right = map(int, lines[index + 2].split())
    queries.append((left - 1, right - 1, index))

block_size = max(1, int(n ** 0.5))
queries.sort(
    key=lambda item: (
        item[0] // block_size,
        item[1] if (item[0] // block_size) % 2 == 0 else -item[1],
    )
)

frequency = {}
answers = [0] * query_count
current_left = 0
current_right = -1
distinct = 0


def add(position):
    global distinct
    value = values[position]
    old = frequency.get(value, 0)
    if old == 0:
        distinct += 1
    frequency[value] = old + 1


def remove(position):
    global distinct
    value = values[position]
    old = frequency[value]
    if old == 1:
        distinct -= 1
    frequency[value] = old - 1


for left, right, index in queries:
    while current_left > left:
        current_left -= 1
        add(current_left)
    while current_right < right:
        current_right += 1
        add(current_right)
    while current_left < left:
        remove(current_left)
        current_left += 1
    while current_right > right:
        remove(current_right)
        current_right -= 1
    answers[index] = distinct

print("distinct_counts=" + ",".join(map(str, answers)))
print("block_size=" + str(block_size))
assert answers == [4, 4, 5, 1]
`,
      },
      checkpoint:
        '按原询问顺序输出必须为 4,4,5,1。答案只能在频次跨过 0 或 1 时变化，指针移动的四个 while 必须让当前区间最终精确等于询问区间。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：LCA、倍增与树上差分': {
    ...nodeRuntime,
    title: '树上路径代码台 · 倍增祖先与点覆盖差分',
    description:
      '先预处理深度和 2^k 级祖先，再用同层上跳与同步试探求 LCA；路径批量修改只落四个差分标记，最后自底向上汇总。',
    practice: {
      id: 'algorithms-final-a5-lca-binary-guided',
      title: '跟做：倍增求最近公共祖先',
      brief:
        '先把较深节点提到同层，再从最大 2 的幂向下试探；祖先不同才同步跳，最后返回父节点作为 LCA。',
      defaultLanguage: 'javascript',
      stdin:
        '7\n1 2\n1 3\n2 4\n2 5\n3 6\n6 7\n4\n4 5\n4 6\n7 3\n5 7\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const n = Number(lines[0]);
const graph = Array.from({ length: n + 1 }, () => []);
for (let index = 0; index < n - 1; index += 1) {
  const [u, v] = lines[index + 1].split(/\s+/).map(Number);
  graph[u].push(v);
  graph[v].push(u);
}
const log = Math.ceil(Math.log2(n)) + 1;
const depth = new Array(n + 1).fill(-1);
const parent = Array.from({ length: log }, () => new Array(n + 1).fill(0));
depth[1] = 0;
const order = [1];
for (let cursor = 0; cursor < order.length; cursor += 1) {
  const node = order[cursor];
  for (const next of graph[node]) {
    if (next === parent[0][node]) continue;
    parent[0][next] = node;
    depth[next] = depth[node] + 1;
    order.push(next);
  }
}
for (let level = 1; level < log; level += 1) {
  for (let node = 1; node <= n; node += 1) {
    parent[level][node] = parent[level - 1][parent[level - 1][node]];
  }
}

function lift(node, distance) {
  for (let level = 0; distance > 0; level += 1) {
    if (distance & 1) node = parent[level][node];
    distance >>= 1;
  }
  return node;
}

function lca(left, right) {
  if (depth[left] < depth[right]) [left, right] = [right, left];
  left = lift(left, depth[left] - depth[right]);
  if (left === right) return left;
  for (let level = log - 1; level >= 0; level -= 1) {
    if (parent[level][left] !== parent[level][right]) {
      left = parent[level][left];
      right = parent[level][right];
    }
  }
  return parent[0][left];
}

const queryCount = Number(lines[n]);
const queries = lines.slice(n + 1, n + 1 + queryCount);
const answers = queries.map((line) => {
  const [u, v] = line.split(/\s+/).map(Number);
  return lca(u, v);
});

console.log('lca_answers=' + answers.join(','));
console.log('depth=' + depth.slice(1).join(','));
assert.deepEqual(answers, [2, 1, 3, 1]);
`,
      },
      checkpoint:
        '四次 LCA 必须为 2,1,3,1。同层后若节点相同要立即返回；否则从大到小只在祖先不同时同步上跳，循环结束返回父节点。',
    },
    apply: {
      id: 'algorithms-final-a5-tree-difference-independent',
      title: '独立实践：树上路径点覆盖差分',
      brief:
        '每条 u 到 v 的路径执行 diff[u]+1、diff[v]+1、diff[lca]-1、diff[parent(lca)]-1，再一次后序遍历累加到父节点。',
      defaultLanguage: 'python',
      stdin:
        '7\n1 2\n1 3\n2 4\n2 5\n3 6\n6 7\n3\n4 5\n4 6\n7 3\n',
      starterCode: {
        python: String.raw`from collections import deque
import sys

lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
n = int(lines[0])
graph = [[] for _ in range(n + 1)]
for index in range(n - 1):
    u, v = map(int, lines[index + 1].split())
    graph[u].append(v)
    graph[v].append(u)

log = (n).bit_length()
parent = [[0] * (n + 1) for _ in range(log)]
depth = [-1] * (n + 1)
depth[1] = 0
order = [1]
queue = deque([1])
while queue:
    node = queue.popleft()
    for nxt in graph[node]:
        if nxt == parent[0][node]:
            continue
        parent[0][nxt] = node
        depth[nxt] = depth[node] + 1
        order.append(nxt)
        queue.append(nxt)

for level in range(1, log):
    for node in range(1, n + 1):
        parent[level][node] = parent[level - 1][parent[level - 1][node]]


def lca(u, v):
    if depth[u] < depth[v]:
        u, v = v, u
    difference = depth[u] - depth[v]
    level = 0
    while difference:
        if difference & 1:
            u = parent[level][u]
        difference >>= 1
        level += 1
    if u == v:
        return u
    for level in range(log - 1, -1, -1):
        if parent[level][u] != parent[level][v]:
            u = parent[level][u]
            v = parent[level][v]
    return parent[0][u]


query_count = int(lines[n])
paths = [tuple(map(int, lines[n + 1 + index].split())) for index in range(query_count)]
delta = [0] * (n + 1)
for u, v in paths:
    ancestor = lca(u, v)
    delta[u] += 1
    delta[v] += 1
    delta[ancestor] -= 1
    if parent[0][ancestor]:
        delta[parent[0][ancestor]] -= 1

coverage = delta[:]
for node in reversed(order[1:]):
    coverage[parent[0][node]] += coverage[node]

print("coverage=" + ",".join(map(str, coverage[1:])))
print("total_visits=" + str(sum(coverage[1:])))
assert coverage[1:] == [1, 2, 2, 2, 1, 2, 1]
assert sum(coverage[1:]) == 11
`,
      },
      checkpoint:
        '点覆盖次数必须为 1,2,2,2,1,2,1，总访问次数为 11。lca 的父节点为 0 时不要再写负下标，否则根节点计数会被错误扣除。',
    },
  },

  'algorithms:算法与数据结构 · 高级数据结构与竞赛专题：对拍、随机化和竞赛策略': {
    ...nodeRuntime,
    title: '随机化代码台 · 随机选择与可复现对拍',
    description:
      '第一题用固定种子驱动随机 pivot，验证随机选择仍返回精确第 k 小；第二题在数百组随机数据上让暴力与 Fenwick 对拍并固定种子复现。',
    practice: {
      id: 'algorithms-final-a5-random-quickselect-guided',
      title: '跟做：固定种子的随机化快速选择',
      brief:
        '每次在区间内随机选 pivot，把小于 pivot 的值放左、大于的放右。只递归包含目标排名的一侧，并与排序后的第 k 小核对。',
      defaultLanguage: 'javascript',
      stdin:
        '15 10 20261124\n11 3 19 7 2 15 12 1 18 6 14 9 4 17 5\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const [n, rank, rawSeed] = lines[0].split(/\s+/).map(Number);
const values = lines[1].split(/\s+/).map(Number);
let seed = rawSeed >>> 0;
let partitions = 0;
let comparisons = 0;

function randomBelow(limit) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % limit;
}

function select(left, right, k) {
  while (left <= right) {
    const pivotIndex = left + randomBelow(right - left + 1);
    const pivot = values[pivotIndex];
    [values[pivotIndex], values[right]] = [values[right], values[pivotIndex]];
    let store = left;
    for (let index = left; index < right; index += 1) {
      comparisons += 1;
      if (values[index] < pivot) {
        [values[store], values[index]] = [values[index], values[store]];
        store += 1;
      }
    }
    [values[store], values[right]] = [values[right], values[store]];
    partitions += 1;
    if (store === k) return values[store];
    if (store < k) left = store + 1;
    else right = store - 1;
  }
  throw new Error('目标排名越界');
}

const answer = select(0, n - 1, rank - 1);
const expected = values.slice().sort((a, b) => a - b)[rank - 1];
console.log('selected=' + answer);
console.log('partitions=' + partitions + ', comparisons=' + comparisons);
console.log('seed=' + rawSeed);
assert.equal(answer, 12);
assert.equal(answer, expected);
assert.ok(comparisons < n * n);
`,
      },
      checkpoint:
        '第 10 小必须是 12，并与排序结果一致。固定种子保证同一输入可复现；随机 pivot 只改变路径，不改变第 k 小答案。',
    },
    apply: {
      id: 'algorithms-final-a5-stress-test-independent',
      title: '独立实践：暴力与 Fenwick 的随机对拍',
      brief:
        '固定种子生成 300 组小数组，分别用 O(n²) 暴力与离散化 Fenwick 统计逆序对。任一不一致就打印种子、数组和两个结果并退出失败。',
      defaultLanguage: 'javascript',
      stdin: '300 20261124\n',
      starterCode: {
        javascript: String.raw`const fs = require('node:fs');
const assert = require('node:assert/strict');

const [rounds, initialSeed] = fs.readFileSync(0, 'utf8').trim().split(/\s+/).map(Number);
let seed = initialSeed >>> 0;

function nextRandom() {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 0x100000000;
}

function randomInt(low, high) {
  return low + Math.floor(nextRandom() * (high - low + 1));
}

function brute(values) {
  let count = 0;
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (values[left] > values[right]) count += 1;
    }
  }
  return count;
}

function fenwick(values) {
  const ordered = [...new Set(values)].sort((a, b) => a - b);
  const ranks = new Map(ordered.map((value, index) => [value, index + 1]));
  const tree = new Array(ordered.length + 1).fill(0);
  function add(index) {
    while (index < tree.length) {
      tree[index] += 1;
      index += index & -index;
    }
  }
  function prefix(index) {
    let total = 0;
    while (index > 0) {
      total += tree[index];
      index -= index & -index;
    }
    return total;
  }
  let answer = 0;
  let seen = 0;
  for (const value of values) {
    const rank = ranks.get(value);
    answer += seen - prefix(rank);
    add(rank);
    seen += 1;
  }
  return answer;
}

let checks = 0;
for (let round = 0; round < rounds; round += 1) {
  const roundSeed = seed;
  const size = randomInt(1, 24);
  const values = Array.from({ length: size }, () => randomInt(-8, 12));
  const expected = brute(values);
  const actual = fenwick(values);
  if (expected !== actual) {
    throw new Error(
      'mismatch seed=' + roundSeed + ' values=' + values.join(',') +
      ' brute=' + expected + ' fenwick=' + actual,
    );
  }
  checks += 1;
}

const edge = [9, 8, 7, 6, 5, 4, 3, 2, 1];
assert.equal(brute(edge), 36);
assert.equal(fenwick(edge), 36);
assert.equal(checks, 300);
console.log('rounds_passed=' + checks);
console.log('final_seed=' + seed);
`,
      },
      checkpoint:
        '必须完成 300 轮且无差异，递减序列 9 到 1 的逆序对数必须为 36。失败信息要包含当前种子和数组，才能脱离原运行复现同一反例。',
    },
  },
};
