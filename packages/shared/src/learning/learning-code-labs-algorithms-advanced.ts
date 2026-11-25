import type { LearningV2CodeLab } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 20+ / 单文件 JavaScript',
  docsUrl: 'https://nodejs.org/api/fs.html',
  installSteps: [
    '应用内 Node 运行器执行单个 main.js，标准输入已在任务中完整给出。',
    '先原样运行并核对 checkpoint，再修改算法或输入观察结果变化。',
    '代码中的断言失败会返回非零退出码；不要只根据最后一行口号判断通过。',
  ],
  languages: ['javascript'],
} as const;

const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3.11+ / 单文件标准库',
  docsUrl: 'https://docs.python.org/3/library/',
  installSteps: [
    '应用内 Python 运行器执行单个 main.py，标准输入已在任务中完整给出。',
    '先原样运行并核对 checkpoint，所需模块全部来自 Python 标准库。',
    '代码中的 assert 失败会返回非零退出码；验收必须同时看输出与退出码。',
  ],
  languages: ['python'],
} as const;

/**
 * 算法与数据结构高级专题的单文件代码实验室。
 *
 * 课程键逐字对应 algorithm-handwritten/a1.ts、a3.ts、a4.ts、a5.ts、
 * a6.ts、a7.ts 中的真实课程名。任务不依赖第三方包，均从 stdin 读取
 * 完整输入，并通过断言或校验行验证关键结果。
 */
export const LEARNING_CODE_LABS_ALGORITHMS_ADVANCED: Readonly<Record<string, LearningV2CodeLab>> = {
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：递归、记忆化与重叠子问题': {
    title: '高级算法代码台 01 · 从调用次数到状态转移',
    description:
      '先用带缓存的递归观察 Fibonacci 计算了多少个不同状态，再用自底向上的最少硬币转移处理无解情况与路径回溯。',
    ...nodeRuntime,
    practice: {
      id: 'algo-memo-fibonacci-guided',
      title: '跟做：缓存让重复子问题只算一次',
      brief:
        '输入 n=40。程序用 Map 缓存 fib(k)，同时累计真正发生加法的状态数。输出必须给出最终值和 computed_states。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const n = Number(fs.readFileSync(0, "utf8").trim());
const memo = new Map([[0, 0], [1, 1]]);
let computedStates = 0;

function fib(k) {
  if (memo.has(k)) return memo.get(k);
  const value = fib(k - 1) + fib(k - 2);
  memo.set(k, value);
  computedStates += 1;
  return value;
}

const answer = fib(n);
console.log("fib(" + n + ")=" + answer);
console.log("computed_states=" + computedStates);

if (answer !== 102334155 || computedStates !== n - 1) {
  throw new Error("缓存状态数与 Fibonacci 结果不符合预期");
}
`,
      },
      stdin: '40\n',
      checkpoint:
        '必须输出 fib(40)=102334155 和 computed_states=39，且退出码为 0。39 表示除 0、1 两个初值外，只真正计算了 2 到 40 的 39 个状态。',
    },
    apply: {
      id: 'algo-memo-coin-change-independent',
      title: '独立实践：最少硬币、无解哨兵与路径回溯',
      brief:
        '输入目标金额 11 与面值 1、2、5。代码用 INF 表示不可达状态，计算最少硬币数并保存 parent，最后反向恢复实际方案。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const target = Number(lines[0]);
const coins = lines[1].split(/\s+/).map(Number);
const INF = Number.POSITIVE_INFINITY;
const dp = Array(target + 1).fill(INF);
const parent = Array(target + 1).fill(-1);
dp[0] = 0;

for (let amount = 1; amount <= target; amount += 1) {
  for (const coin of coins) {
    if (coin <= amount && dp[amount - coin] + 1 < dp[amount]) {
      dp[amount] = dp[amount - coin] + 1;
      parent[amount] = coin;
    }
  }
}

const path = [];
for (let amount = target; amount > 0; amount -= parent[amount]) {
  if (parent[amount] < 0) break;
  path.push(parent[amount]);
}

console.log("min_coins=" + dp[target]);
console.log("coins=" + path.join(","));
console.log("unreachable_target=" + dp[3] + " (for coins [2,4])");

const impossible = new Array(4).fill(INF);
impossible[0] = 0;
for (let amount = 1; amount < impossible.length; amount += 1) {
  for (const coin of [2, 4]) {
    if (coin <= amount) {
      impossible[amount] = Math.min(impossible[amount], impossible[amount - coin] + 1);
    }
  }
}
if (dp[target] !== 3 || impossible[3] !== INF) {
  throw new Error("最少硬币或无解哨兵状态错误");
}
`,
      },
      stdin: '11\n1 2 5\n',
      checkpoint:
        '必须得到 min_coins=3，coins 行恰好有 3 个面值且总和为 11；unreachable_target 必须保持 Infinity。若把 INF 加一直接参与比较，会让无解状态伪装成有限值。',
    },
  },
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：线性 DP 与序列决策': {
    title: '高级算法代码台 02 · 序列上的一维状态设计',
    description:
      '用耐心排序维护 LIS 的最小尾值，再在编辑距离中保存二维决策表，观察“每个位置保留什么状态”如何决定转移。',
    ...pythonRuntime,
    practice: {
      id: 'algo-linear-lis-guided',
      title: '跟做：LIS 只保留每个长度的最小尾值',
      brief:
        '输入 8 个整数。程序用 bisect_left 找到当前值应替换的位置，tails 不是一条具体子序列，而是各长度能够取得的最小结尾值。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from bisect import bisect_left
import sys


tokens = list(map(int, sys.stdin.read().split()))
n = tokens[0]
values = tokens[1:1 + n]
tails = []

for value in values:
    position = bisect_left(tails, value)
    if position == len(tails):
        tails.append(value)
    else:
        tails[position] = value

print(f"lis_length={len(tails)}")
print("tails=" + ",".join(map(str, tails)))
assert len(tails) == 4
assert tails == [2, 3, 7, 18]
`,
      },
      stdin: '8\n10 9 2 5 3 7 101 18\n',
      checkpoint:
        '输出必须为 lis_length=4 与 tails=2,3,7,18，退出码为 0。重点核对 tails 中 3 替换了 5、7 替换了 101、18 又替换了 101。',
    },
    apply: {
      id: 'algo-linear-edit-distance-independent',
      title: '独立实践：编辑距离与决策路径',
      brief:
        '输入两行字符串，计算把第一行变成第二行的最少插入、删除或替换次数，并从 dp 表反向恢复一条编辑路径。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


source, target = sys.stdin.read().splitlines()
rows = len(source) + 1
cols = len(target) + 1
dp = [[0] * cols for _ in range(rows)]

for i in range(rows):
    dp[i][0] = i
for j in range(cols):
    dp[0][j] = j

for i in range(1, rows):
    for j in range(1, cols):
        replace_cost = 0 if source[i - 1] == target[j - 1] else 1
        dp[i][j] = min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + replace_cost,
        )

path = []
i, j = len(source), len(target)
while i > 0 or j > 0:
    if i > 0 and j > 0 and source[i - 1] == target[j - 1] and dp[i][j] == dp[i - 1][j - 1]:
        path.append("keep:" + source[i - 1])
        i, j = i - 1, j - 1
    elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
        path.append("replace:" + source[i - 1] + "->" + target[j - 1])
        i, j = i - 1, j - 1
    elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
        path.append("delete:" + source[i - 1])
        i -= 1
    else:
        path.append("insert:" + target[j - 1])
        j -= 1

print(f"distance={dp[-1][-1]}")
print("edit_path=" + "|".join(reversed(path)))
assert dp[-1][-1] == 3
assert len(path) == 7
`,
      },
      stdin: 'kitten\nsitting\n',
      checkpoint:
        'distance 必须为 3。edit_path 必须包含 7 个动作且逐步应用后从 kitten 得到 sitting；其中 keep 动作不计编辑成本，3 个 replace/insert 动作各成本 1。',
    },
  },
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：区间 DP 与合并顺序': {
    title: '高级算法代码台 03 · 枚举最后一步的区间转移',
    description:
      '矩阵链用切分点枚举合并成本，戳气球用“最后戳破”避免删除后下标漂移。两题都要求解释 dp[i][j] 的明确含义。',
    ...nodeRuntime,
    practice: {
      id: 'algo-interval-matrix-chain-guided',
      title: '跟做：矩阵链的最小乘法次数',
      brief:
        '输入矩阵个数 n 与 n+1 个维度。dp[i][j] 表示合并第 i 到第 j 个矩阵的最少标量乘法次数，split 记录最优断点。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = tokens[0];
const dimensions = tokens.slice(1, n + 2);
const dp = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0));
const split = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0));

for (let length = 2; length <= n; length += 1) {
  for (let left = 1; left + length - 1 <= n; left += 1) {
    const right = left + length - 1;
    dp[left][right] = Number.POSITIVE_INFINITY;
    for (let pivot = left; pivot < right; pivot += 1) {
      const cost =
        dp[left][pivot] +
        dp[pivot + 1][right] +
        dimensions[left - 1] * dimensions[pivot] * dimensions[right];
      if (cost < dp[left][right]) {
        dp[left][right] = cost;
        split[left][right] = pivot;
      }
    }
  }
}

function order(left, right) {
  if (left === right) return "A" + left;
  const pivot = split[left][right];
  return "(" + order(left, pivot) + " x " + order(pivot + 1, right) + ")";
}

console.log("min_scalar_multiplications=" + dp[1][n]);
console.log("parenthesization=" + order(1, n));
console.log("first_split=" + split[1][n]);
if (dp[1][n] !== 26000 || split[1][n] !== 3) {
  throw new Error("矩阵链最优值或切分点错误");
}
`,
      },
      stdin: '4\n40 20 30 10 30\n',
      checkpoint:
        'min_scalar_multiplications 必须为 26000，first_split 必须为 3。按 ((A1 × (A2 × A3)) × A4) 手算为 6000 + 8000 + 12000 = 26000。',
    },
    apply: {
      id: 'algo-interval-burst-balloons-independent',
      title: '独立实践：最后戳破气球',
      brief:
        '为输入序列两侧补 1。dp[i][j] 表示只考虑开区间 (i,j) 时能获得的最大硬币，k 被当作该区间最后一个戳破的气球。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const count = tokens[0];
const values = [1, ...tokens.slice(1, count + 1), 1];
const size = values.length;
const dp = Array.from({ length: size }, () => Array(size).fill(0));
const last = Array.from({ length: size }, () => Array(size).fill(-1));

for (let length = 1; length <= count; length += 1) {
  for (let left = 1; left + length - 1 <= count; left += 1) {
    const right = left + length - 1;
    for (let k = left; k <= right; k += 1) {
      const candidate =
        dp[left][k - 1] +
        dp[k + 1][right] +
        values[left - 1] * values[k] * values[right + 1];
      if (candidate > dp[left][right]) {
        dp[left][right] = candidate;
        last[left][right] = k;
      }
    }
  }
}

console.log("max_coins=" + dp[1][count]);
console.log("last_balloon_index=" + last[1][count]);
if (dp[1][count] !== 167) {
  throw new Error("戳气球最大值错误");
}
`,
      },
      stdin: '4\n3 1 5 8\n',
      checkpoint:
        'max_coins 必须为 167。可用路径 3→5→1→8 手算：15 + 40 + 40 + 72 = 167；若按“先戳再分裂”设计转移，需额外处理下标移动。',
    },
  },
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：背包、配额与资源分配': {
    title: '高级算法代码台 04 · 容量维度与选择回溯',
    description:
      '先完成一维 0/1 背包并回溯物品，再把状态扩展到重量与体积两个配额，检查逆序更新为何能防止同一物品重复选择。',
    ...pythonRuntime,
    practice: {
      id: 'algo-knapsack-01-guided',
      title: '跟做：一维 0/1 背包与物品回溯',
      brief:
        '输入物品数、容量、重量和价值。dp[c] 表示容量 c 内可获得的最大价值，容量必须从大到小更新。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


tokens = list(map(int, sys.stdin.read().split()))
it = iter(tokens)
n = next(it)
capacity = next(it)
weights = [next(it) for _ in range(n)]
values = [next(it) for _ in range(n)]

dp = [0] * (capacity + 1)
take = [[False] * (capacity + 1) for _ in range(n)]

for i, (weight, value) in enumerate(zip(weights, values)):
    for current in range(capacity, weight - 1, -1):
        candidate = dp[current - weight] + value
        if candidate > dp[current]:
            dp[current] = candidate
            take[i][current] = True

chosen = []
current = capacity
for i in range(n - 1, -1, -1):
    if take[i][current]:
        chosen.append(i + 1)
        current -= weights[i]

print(f"max_value={dp[capacity]}")
print("chosen_items=" + ",".join(map(str, reversed(chosen))))
assert dp[capacity] == 11
assert sum(values[i - 1] for i in chosen) == 11
`,
      },
      stdin: '4 7\n2 3 4 5\n3 4 5 8\n',
      checkpoint:
        'max_value 必须为 11；chosen_items 的重量和不得超过 7、价值和必须等于 11。若把容量改成从小到大，同一物品可能被重复选入。',
    },
    apply: {
      id: 'algo-knapsack-two-quotas-independent',
      title: '独立实践：重量与体积双配额',
      brief:
        '每个物品同时消耗重量和体积。把 dp 扩展为二维并在两个维度上逆序遍历，求出容量 4×4 下的最大价值。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


rows = [list(map(int, line.split())) for line in sys.stdin.read().strip().splitlines()]
n, weight_cap, volume_cap = rows[0]
items = [tuple(rows[i]) for i in range(1, n + 1)]
dp = [[0] * (volume_cap + 1) for _ in range(weight_cap + 1)]

for weight, volume, value in items:
    for w in range(weight_cap, weight - 1, -1):
        for v in range(volume_cap, volume - 1, -1):
            dp[w][v] = max(dp[w][v], dp[w - weight][v - volume] + value)

print(f"max_value={dp[weight_cap][volume_cap]}")
print(f"state_cells={(weight_cap + 1) * (volume_cap + 1)}")
assert dp[weight_cap][volume_cap] == 10
`,
      },
      stdin: '4 4 4\n2 2 4\n3 1 5\n1 3 3\n2 2 6\n',
      checkpoint:
        'max_value 必须为 10，state_cells 必须为 25。最优组合是物品 1 与物品 4，其重量和 4、体积和 4、价值和 10。',
    },
  },
  'algorithms:算法与数据结构 · 动态规划、贪心与回溯：树形 DP 与子树状态': {
    title: '高级算法代码台 05 · 自底向上的子树状态合并',
    description:
      '公司聚会题在 take/skip 两个状态间做选择，树的直径则合并每个子树向下的最长两条路径。两题都按后序计算。',
    ...nodeRuntime,
    practice: {
      id: 'algo-tree-party-guided',
      title: '跟做：树上最大权独立集',
      brief:
        '输入每个节点的权重与 n-1 条父子边。take[u] 表示选择 u，skip[u] 表示不选择 u；父节点状态由所有子树的两种状态汇总。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let cursor = 0;
const n = tokens[cursor++];
const weights = [0];
for (let i = 1; i <= n; i += 1) weights.push(tokens[cursor++]);
const children = Array.from({ length: n + 1 }, () => []);
for (let i = 2; i <= n; i += 1) {
  const child = tokens[cursor++];
  const parent = tokens[cursor++];
  children[parent].push(child);
}

const order = [];
const stack = [1];
while (stack.length > 0) {
  const node = stack.pop();
  order.push(node);
  for (const child of children[node]) stack.push(child);
}
order.reverse();

const take = Array(n + 1).fill(0);
const skip = Array(n + 1).fill(0);
for (const node of order) {
  take[node] = weights[node];
  for (const child of children[node]) {
    take[node] += skip[child];
    skip[node] += Math.max(take[child], skip[child]);
  }
}

const answer = Math.max(take[1], skip[1]);
console.log("max_independent_weight=" + answer);
console.log("take_root=" + take[1] + ", skip_root=" + skip[1]);
if (answer !== 160 || take[1] !== 160 || skip[1] !== 150) {
  throw new Error("树形独立集状态错误");
}
`,
      },
      stdin:
        '6\n10 20 30 40 50 60\n2 1\n3 1\n4 2\n5 2\n6 3\n',
      checkpoint:
        'max_independent_weight 必须为 160，take_root=160、skip_root=150。最优选择是根 1 及节点 4、5、6；若直接累加最大子状态，会错误地同时选父子。',
    },
    apply: {
      id: 'algo-tree-diameter-independent',
      title: '独立实践：带权树直径',
      brief:
        '输入根为 1 的带权树。对每个节点保留向下的最长路径，并把孩子贡献的前两名相加，得到经过该节点的最长路径。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const n = tokens[0];
const graph = Array.from({ length: n + 1 }, () => []);
let cursor = 1;
for (let child = 2; child <= n; child += 1) {
  const node = tokens[cursor++];
  const parent = tokens[cursor++];
  const weight = tokens[cursor++];
  graph[parent].push([node, weight]);
  graph[node].push([parent, weight]);
}

const parent = Array(n + 1).fill(0);
const parentWeight = Array(n + 1).fill(0);
const order = [1];
for (let i = 0; i < order.length; i += 1) {
  const node = order[i];
  for (const [next, weight] of graph[node]) {
    if (next === parent[node]) continue;
    parent[next] = node;
    parentWeight[next] = weight;
    order.push(next);
  }
}

const down = Array(n + 1).fill(0);
let diameter = 0;
for (let i = order.length - 1; i >= 0; i -= 1) {
  const node = order[i];
  const branches = [];
  for (const [next, weight] of graph[node]) {
    if (parent[next] === node) branches.push(down[next] + weight);
  }
  branches.sort((a, b) => b - a);
  down[node] = branches[0] ?? 0;
  diameter = Math.max(diameter, (branches[0] ?? 0) + (branches[1] ?? 0));
}

console.log("tree_diameter=" + diameter);
console.log("root_down_path=" + down[1]);
if (diameter !== 16) {
  throw new Error("带权树直径错误");
}
`,
      },
      stdin: '6\n2 1 3\n3 1 2\n4 2 4\n5 2 5\n6 3 6\n',
      checkpoint:
        'tree_diameter 必须为 16，root_down_path 也为 8。最长路径是 5→2→1→3→6，权值为 5+3+2+6=16。',
    },
  },
  'algorithms:算法与数据结构 · 图论、搜索与最短路：Dijkstra 与非负权最短路': {
    title: '高级算法代码台 06 · 最短距离与路径证据',
    description:
      '堆优化 Dijkstra 处理非负权图，不仅输出距离，还保存 parent 恢复路径；第二个任务用同一距离模板完成预算内可达性统计。',
    ...pythonRuntime,
    practice: {
      id: 'algo-dijkstra-path-guided',
      title: '跟做：最短距离与路径恢复',
      brief:
        '输入无向图、起点。每次从堆中取出当前最短候选，跳过过期记录；更新距离时同步保存 parent。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from heapq import heappop, heappush
import sys


tokens = list(map(int, sys.stdin.read().split()))
it = iter(tokens)
n = next(it)
m = next(it)
source = next(it)
graph = [[] for _ in range(n + 1)]
for _ in range(m):
    u = next(it)
    v = next(it)
    weight = next(it)
    graph[u].append((v, weight))
    graph[v].append((u, weight))

inf = float("inf")
distance = [inf] * (n + 1)
parent = [0] * (n + 1)
distance[source] = 0
heap = [(0, source)]

while heap:
    current_distance, node = heappop(heap)
    if current_distance != distance[node]:
        continue
    for neighbor, weight in graph[node]:
        candidate = current_distance + weight
        if candidate < distance[neighbor]:
            distance[neighbor] = candidate
            parent[neighbor] = node
            heappush(heap, (candidate, neighbor))

path = []
node = 5
while node:
    path.append(node)
    if node == source:
        break
    node = parent[node]
path.reverse()

print("distance=" + " ".join(str(distance[i]) for i in range(1, n + 1)))
print("path_to_5=" + "->".join(map(str, path)))
assert distance[1:] == [0, 3, 2, 8, 10]
assert path == [1, 3, 2, 4, 5]
`,
      },
      stdin: '5 6 1\n1 2 4\n1 3 2\n3 2 1\n2 4 5\n3 4 8\n4 5 2\n',
      checkpoint:
        'distance 必须为 0 3 2 8 10，path_to_5 必须为 1->3->2->4->5。第二行证明最短距离也保存了可复核的路径。',
    },
    apply: {
      id: 'algo-dijkstra-budget-independent',
      title: '独立实践：预算内服务半径',
      brief:
        '输入有向图、起点与预算。先用 Dijkstra 求全部最短距离，再统计距离不超过预算的节点数，并打印每个可达节点花费。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from heapq import heappop, heappush
import sys


tokens = list(map(int, sys.stdin.read().split()))
it = iter(tokens)
n = next(it)
m = next(it)
source = next(it)
budget = next(it)
graph = [[] for _ in range(n + 1)]
for _ in range(m):
    u = next(it)
    v = next(it)
    weight = next(it)
    graph[u].append((v, weight))

inf = float("inf")
distance = [inf] * (n + 1)
distance[source] = 0
heap = [(0, source)]
while heap:
    current_distance, node = heappop(heap)
    if current_distance != distance[node]:
        continue
    for neighbor, weight in graph[node]:
        candidate = current_distance + weight
        if candidate < distance[neighbor]:
            distance[neighbor] = candidate
            heappush(heap, (candidate, neighbor))

reachable = [node for node in range(1, n + 1) if distance[node] <= budget]
print("costs=" + " ".join(f"{node}:{distance[node]}" for node in range(1, n + 1)))
print(f"within_budget={len(reachable)}")
assert distance[1:] == [0, 2, 3, 5, 6, 8]
assert reachable == [1, 2, 3, 4, 5]
`,
      },
      stdin: '6 8 1 7\n1 2 2\n1 3 5\n2 3 1\n2 4 7\n3 4 2\n4 5 1\n3 5 8\n5 6 2\n',
      checkpoint:
        'costs 必须为 1:0 2:2 3:3 4:5 5:6 6:8，within_budget 必须为 5。节点 6 花费 8，刚好超过预算 7。',
    },
  },
  'algorithms:算法与数据结构 · 图论、搜索与最短路：Bellman-Ford 与负环': {
    title: '高级算法代码台 07 · 逐轮松弛与负环传播',
    description:
      '第一段用有限轮松弛求含负边但无负环的最短路，第二段多跑一轮识别负环，并沿有向边标出所有会被负环继续缩短的节点。',
    ...nodeRuntime,
    practice: {
      id: 'algo-bellman-ford-basic-guided',
      title: '跟做：负边最短路必须跑满 n-1 轮',
      brief:
        '输入有向图与起点。所有边每轮都可松弛一次；只要上一轮没有变化就提前停止，但正确性上界仍是 n-1 轮。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let cursor = 0;
const n = tokens[cursor++];
const m = tokens[cursor++];
const source = tokens[cursor++];
const edges = [];
for (let i = 0; i < m; i += 1) {
  edges.push([tokens[cursor++], tokens[cursor++], tokens[cursor++]]);
}

const INF = Number.POSITIVE_INFINITY;
const distance = Array(n + 1).fill(INF);
distance[source] = 0;
let rounds = 0;

for (let round = 0; round < n - 1; round += 1) {
  let changed = false;
  rounds += 1;
  for (const [u, v, weight] of edges) {
    if (distance[u] !== INF && distance[u] + weight < distance[v]) {
      distance[v] = distance[u] + weight;
      changed = true;
    }
  }
  if (!changed) break;
}

console.log("distance=" + distance.slice(1).join(" "));
console.log("rounds_used=" + rounds);
if (distance.slice(1).join(" ") !== "0 6 7 3 10") {
  throw new Error("Bellman-Ford 距离错误");
}
`,
      },
      stdin:
        '5 7 1\n1 2 6\n1 3 7\n2 4 5\n2 3 8\n3 4 -4\n3 5 9\n4 5 7\n',
      checkpoint:
        'distance 必须为 0 6 7 3 10。节点 4 的 3 来自 1→3→4 的 7-4，说明含负边时不能只做一轮贪心更新。',
    },
    apply: {
      id: 'algo-bellman-ford-negative-cycle-independent',
      title: '独立实践：负环检测与受影响节点',
      brief:
        '完成 n-1 轮后，所有仍可松弛的边都属于负环或从负环可达。把这些终点作为种子做图搜索，输出会被继续缩短的节点。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let cursor = 0;
const n = tokens[cursor++];
const m = tokens[cursor++];
const source = tokens[cursor++];
const edges = [];
const graph = Array.from({ length: n + 1 }, () => []);
for (let i = 0; i < m; i += 1) {
  const u = tokens[cursor++];
  const v = tokens[cursor++];
  const weight = tokens[cursor++];
  edges.push([u, v, weight]);
  graph[u].push(v);
}

const INF = Number.POSITIVE_INFINITY;
const distance = Array(n + 1).fill(INF);
distance[source] = 0;
for (let round = 0; round < n - 1; round += 1) {
  for (const [u, v, weight] of edges) {
    if (distance[u] !== INF && distance[u] + weight < distance[v]) {
      distance[v] = distance[u] + weight;
    }
  }
}

const affected = new Set();
const queue = [];
for (const [u, v, weight] of edges) {
  if (distance[u] !== INF && distance[u] + weight < distance[v]) {
    if (!affected.has(v)) {
      affected.add(v);
      queue.push(v);
    }
  }
}
for (let head = 0; head < queue.length; head += 1) {
  for (const next of graph[queue[head]]) {
    if (!affected.has(next)) {
      affected.add(next);
      queue.push(next);
    }
  }
}

const nodes = [...affected].sort((a, b) => a - b);
console.log("negative_cycle=true");
console.log("affected_nodes=" + nodes.join(","));
if (nodes.join(",") !== "2,3,4") {
  throw new Error("负环影响节点集合错误");
}
`,
      },
      stdin: '4 4 1\n1 2 1\n2 3 -2\n3 2 -2\n3 4 1\n',
      checkpoint:
        'negative_cycle 必须为 true，affected_nodes 必须为 2,3,4。2↔3 的环权值为 -4，节点 4 从环可达，因此距离不存在有限下界。',
    },
  },
  'algorithms:算法与数据结构 · 图论、搜索与最短路：最小生成树与网络设计': {
    title: '高级算法代码台 08 · 全局最小骨架与最坏边',
    description:
      'Kruskal 通过边排序与并查集构造最小生成树，Prim 从起点扩展并额外输出树中最大边，为网络最坏链路提供证据。',
    ...pythonRuntime,
    practice: {
      id: 'algo-mst-kruskal-guided',
      title: '跟做：Kruskal 与并查集选边',
      brief:
        '输入无向带权图。按权值升序尝试边，只有两端属于不同集合时才选入；恰好选择 n-1 条边即可停止。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


tokens = list(map(int, sys.stdin.read().split()))
it = iter(tokens)
n = next(it)
m = next(it)
edges = []
for _ in range(m):
    u = next(it)
    v = next(it)
    weight = next(it)
    edges.append((weight, u, v))
edges.sort()

parent = list(range(n + 1))
size = [1] * (n + 1)


def find(node):
    while parent[node] != node:
        parent[node] = parent[parent[node]]
        node = parent[node]
    return node


def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb:
        return False
    if size[ra] < size[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    return True


chosen = []
total = 0
for weight, u, v in edges:
    if union(u, v):
        chosen.append((u, v, weight))
        total += weight
        if len(chosen) == n - 1:
            break

print(f"kruskal_total={total}")
print("edges=" + " ".join(f"{u}-{v}:{w}" for u, v, w in chosen))
assert total == 11
assert len(chosen) == 5
`,
      },
      stdin:
        '6 8\n1 2 3\n2 3 1\n1 3 5\n3 5 2\n5 6 1\n3 4 4\n2 4 6\n4 5 7\n',
      checkpoint:
        'kruskal_total 必须为 11，edges 必须恰好 5 条。按权排序后应依次选 2-3:1、5-6:1、3-5:2、1-2:3、3-4:4。',
    },
    apply: {
      id: 'algo-mst-prim-bottleneck-independent',
      title: '独立实践：Prim 与最坏链路',
      brief:
        '从起点 1 用最小堆扩展生成树，记录总权值与树中最大单边。最大单边就是当前最小生成树上的瓶颈容量。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from heapq import heappop, heappush
import sys


tokens = list(map(int, sys.stdin.read().split()))
it = iter(tokens)
n = next(it)
m = next(it)
start = next(it)
graph = [[] for _ in range(n + 1)]
for _ in range(m):
    u = next(it)
    v = next(it)
    weight = next(it)
    graph[u].append((weight, v))
    graph[v].append((weight, u))

visited = [False] * (n + 1)
heap = [(0, start)]
total = 0
maximum_edge = 0
visited_count = 0

while heap and visited_count < n:
    weight, node = heappop(heap)
    if visited[node]:
        continue
    visited[node] = True
    visited_count += 1
    total += weight
    maximum_edge = max(maximum_edge, weight)
    for next_weight, neighbor in graph[node]:
        if not visited[neighbor]:
            heappush(heap, (next_weight, neighbor))

print(f"prim_total={total}")
print(f"maximum_tree_edge={maximum_edge}")
assert visited_count == n
assert total == 14
assert maximum_edge == 8
`,
      },
      stdin:
        '5 6 1\n1 2 4\n1 3 1\n2 3 2\n3 4 8\n4 5 3\n3 5 9\n',
      checkpoint:
        'prim_total 必须为 14，maximum_tree_edge 必须为 8。选边为 1-3:1、2-3:2、4-5:3、3-4:8；树不是按边权全部排序后无条件选取。',
    },
  },
  'algorithms:算法与数据结构 · 图论、搜索与最短路：匹配、网络流与二分图直觉': {
    title: '高级算法代码台 09 · 增广路径与残余网络',
    description:
      '二分匹配通过递归改配寻找增广路，最大流用残余容量持续寻找 s→t 路径；最后用源点可达集合验证最大流等于最小割。',
    ...nodeRuntime,
    practice: {
      id: 'algo-bipartite-matching-guided',
      title: '跟做：Kuhn 算法翻转已有匹配',
      brief:
        '输入左右点数和边。为每个左点重置访问标记并尝试增广；若候选右点已匹配，就递归让原配改找其他点。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let cursor = 0;
const leftCount = tokens[cursor++];
const rightCount = tokens[cursor++];
const edgeCount = tokens[cursor++];
const graph = Array.from({ length: leftCount + 1 }, () => []);
for (let i = 0; i < edgeCount; i += 1) {
  const left = tokens[cursor++];
  const right = tokens[cursor++];
  graph[left].push(right);
}

const matchLeft = Array(leftCount + 1).fill(-1);
const matchRight = Array(rightCount + 1).fill(-1);
let visited = Array(rightCount + 1).fill(false);

function augment(left) {
  for (const right of graph[left]) {
    if (visited[right]) continue;
    visited[right] = true;
    if (matchRight[right] === -1 || augment(matchRight[right])) {
      matchLeft[left] = right;
      matchRight[right] = left;
      return true;
    }
  }
  return false;
}

for (let left = 1; left <= leftCount; left += 1) {
  visited = Array(rightCount + 1).fill(false);
  augment(left);
}

const pairs = [];
for (let left = 1; left <= leftCount; left += 1) {
  if (matchLeft[left] !== -1) pairs.push(left + "-" + matchLeft[left]);
}
console.log("matching_size=" + pairs.length);
console.log("pairs=" + pairs.join(" "));
if (pairs.join(" ") !== "1-1 2-2 3-3") {
  throw new Error("二分图最大匹配错误");
}
`,
      },
      stdin: '3 3 5\n1 1\n1 2\n2 2\n3 2\n3 3\n',
      checkpoint:
        'matching_size 必须为 3，pairs 必须为 1-1 2-2 3-3。若为左点 3 找路径时忘记清除 visited，已有匹配可能无法改配。',
    },
    apply: {
      id: 'algo-network-flow-edmonds-karp-independent',
      title: '独立实践：Edmonds-Karp 与最小割校验',
      brief:
        '用残余容量矩阵做 BFS 增广。最大流结束后，从源点沿正残余容量搜索可达集合，并累加所有从可达区指向非可达区的原始容量。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const tokens = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
let cursor = 0;
const n = tokens[cursor++];
const m = tokens[cursor++];
const source = tokens[cursor++];
const sink = tokens[cursor++];
const capacity = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0));
for (let i = 0; i < m; i += 1) {
  const u = tokens[cursor++];
  const v = tokens[cursor++];
  capacity[u][v] += tokens[cursor++];
}

const residual = capacity.map((row) => row.slice());
const original = capacity.map((row) => row.slice());
let maximumFlow = 0;

while (true) {
  const parent = Array(n + 1).fill(0);
  parent[source] = source;
  const queue = [source];
  for (let head = 0; head < queue.length && parent[sink] === 0; head += 1) {
    const u = queue[head];
    for (let v = 1; v <= n; v += 1) {
      if (parent[v] === 0 && residual[u][v] > 0) {
        parent[v] = u;
        queue.push(v);
      }
    }
  }
  if (parent[sink] === 0) break;

  let pushed = Number.POSITIVE_INFINITY;
  for (let v = sink; v !== source; v = parent[v]) {
    pushed = Math.min(pushed, residual[parent[v]][v]);
  }
  for (let v = sink; v !== source; v = parent[v]) {
    const u = parent[v];
    residual[u][v] -= pushed;
    residual[v][u] += pushed;
  }
  maximumFlow += pushed;
}

const reachable = Array(n + 1).fill(false);
reachable[source] = true;
const queue = [source];
for (let head = 0; head < queue.length; head += 1) {
  const u = queue[head];
  for (let v = 1; v <= n; v += 1) {
    if (!reachable[v] && residual[u][v] > 0) {
      reachable[v] = true;
      queue.push(v);
    }
  }
}

let cutCapacity = 0;
for (let u = 1; u <= n; u += 1) {
  if (!reachable[u]) continue;
  for (let v = 1; v <= n; v += 1) {
    if (!reachable[v]) cutCapacity += original[u][v];
  }
}

console.log("max_flow=" + maximumFlow);
console.log("min_cut_capacity=" + cutCapacity);
if (maximumFlow !== 26 || cutCapacity !== maximumFlow) {
  throw new Error("最大流与最小割不一致");
}
`,
      },
      stdin:
        '6 8 1 5\n1 2 16\n1 3 13\n2 3 10\n3 2 4\n2 4 12\n4 3 9\n3 5 14\n4 5 20\n',
      checkpoint:
        'max_flow 与 min_cut_capacity 都必须为 26。残余网络中的路径决定最终流值，最小割则给出无法继续增广的结构性证据。',
    },
  },
  'algorithms:算法与数据结构 · 线性结构、哈希与窗口：Trie、字符串哈希与前缀查询': {
    title: '高级算法代码台 10 · 前缀树与滚动哈希',
    description:
      'Trie 精确区分整词计数与前缀计数，双模数滚动哈希在 O(n) 内统计固定长度重复子串，并保留逐字符复核边界。',
    ...pythonRuntime,
    practice: {
      id: 'algo-trie-prefix-guided',
      title: '跟做：整词计数不能混同前缀计数',
      brief:
        '输入词典、查询。每个节点维护经过它的单词数 prefix，以及恰好在该节点结束的单词数 end；两种查询使用不同字段。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().strip().splitlines()
cursor = 0
word_count = int(lines[cursor])
cursor += 1
words = lines[cursor:cursor + word_count]
cursor += word_count
query_count = int(lines[cursor])
cursor += 1
queries = lines[cursor:cursor + query_count]

root = {"children": {}, "end": 0, "prefix": 0}
for word in words:
    node = root
    node["prefix"] += 1
    for ch in word:
        node = node["children"].setdefault(ch, {"children": {}, "end": 0, "prefix": 0})
        node["prefix"] += 1
    node["end"] += 1


def exact(word):
    node = root
    for ch in word:
        if ch not in node["children"]:
            return 0
        node = node["children"][ch]
    return node["end"]


def prefix_count(prefix):
    node = root
    for ch in prefix:
        if ch not in node["children"]:
            return 0
        node = node["children"][ch]
    return node["prefix"]


results = []
for query in queries:
    kind, text = query.split(maxsplit=1)
    results.append(exact(text) if kind == "query" else prefix_count(text))

print("results=" + ",".join(map(str, results)))
assert results == [1, 4, 0, 0]
`,
      },
      stdin:
        '5\ncat\ncar\ncard\ndog\ncar\n4\nquery cat\nprefix ca\nquery care\nprefix z\n',
      checkpoint:
        'results 必须为 1,4,0,0。cat 作为整词出现 1 次，ca 作为前缀覆盖 cat、car、card 以及重复出现的 car，共 4 次。',
    },
    apply: {
      id: 'algo-rolling-hash-duplicates-independent',
      title: '独立实践：双模数哈希统计等长子串',
      brief:
        '输入字符串与长度 k。用两个模数构造滚动哈希，以哈希对作为键统计窗口；每一类保留一个真实子串作为可读证据。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


first, text = sys.stdin.read().splitlines()
length = int(first.split()[0])
mod1 = 1_000_000_007
mod2 = 1_000_000_009
base = 911382323
windows = {}

for start in range(len(text) - length + 1):
    piece = text[start:start + length]
    h1 = 0
    h2 = 0
    for ch in piece:
        code = ord(ch)
        h1 = (h1 * base + code) % mod1
        h2 = (h2 * base + code) % mod2
    key = (h1, h2)
    if key not in windows:
        windows[key] = [piece, 0]
    windows[key][1] += 1

repeated = sorted(
    (representative, count)
    for representative, count in windows.values()
    if count >= 2
)
print("repeated=" + " ".join(f"{piece}:{count}" for piece, count in repeated))
print(f"distinct_windows={len(windows)}")
assert repeated == [("abc", 2), ("bca", 2)]
assert len(windows) == 3
`,
      },
      stdin: '3\nabcabca\n',
      checkpoint:
        'repeated 必须为 abc:2 bca:2，distinct_windows 必须为 3。cab 只出现一次；双模数降低了碰撞概率，但生产验收仍应对命中桶做真实字符串复核。',
    },
  },
  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：优先队列、调度与任务分配': {
    title: '高级算法代码台 11 · 结束时间与截止期贪心',
    description:
      '第一段按结束时间选择最多不重叠区间，第二段按利润从高到低为截止期任务占用最晚可用时间槽，用并查集加速槽位查找。',
    ...nodeRuntime,
    practice: {
      id: 'algo-interval-scheduling-guided',
      title: '跟做：按最早结束时间选择区间',
      brief:
        '输入若干闭区间 [start,end]。按 end 升序排序，选择起点不早于上次结束的区间，并打印选中顺序。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const n = Number(lines[0]);
const intervals = lines.slice(1, n + 1).map((line, index) => {
  const [start, end] = line.split(/\s+/).map(Number);
  return { start, end, index: index + 1 };
});
intervals.sort((a, b) => a.end - b.end || a.start - b.start);

const selected = [];
let lastEnd = Number.NEGATIVE_INFINITY;
for (const interval of intervals) {
  if (interval.start >= lastEnd) {
    selected.push(interval);
    lastEnd = interval.end;
  }
}

console.log("selected_count=" + selected.length);
console.log("selected=" + selected.map((item) => item.index + ":" + item.start + "-" + item.end).join(" "));
if (selected.length !== 4) {
  throw new Error("区间调度最大数量错误");
}
`,
      },
      stdin: '5\n1 3\n2 4\n3 5\n6 7\n5 6\n',
      checkpoint:
        'selected_count 必须为 4。按结束时间可选中 1:1-3、3:3-5、5:5-6、4:6-7；区间在端点相等时仍相容。',
    },
    apply: {
      id: 'algo-deadline-profit-independent',
      title: '独立实践：截止期任务与最晚可用槽',
      brief:
        '每个任务耗时 1 单位、收益不同。按收益降序处理，为任务找不晚于 deadline 的最晚空闲槽；并查集把已占槽链接到前一个槽。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const n = Number(lines[0]);
const jobs = lines.slice(1, n + 1).map((line, index) => {
  const [deadline, profit] = line.split(/\s+/).map(Number);
  return { deadline, profit, index: index + 1 };
});
jobs.sort((a, b) => b.profit - a.profit || a.deadline - b.deadline);

const maxDeadline = Math.max(...jobs.map((job) => job.deadline));
const parent = Array.from({ length: maxDeadline + 1 }, (_, i) => i);
function find(slot) {
  if (parent[slot] !== slot) parent[slot] = find(parent[slot]);
  return parent[slot];
}

const scheduled = [];
let totalProfit = 0;
for (const job of jobs) {
  const slot = find(Math.min(job.deadline, maxDeadline));
  if (slot === 0) continue;
  scheduled.push({ ...job, slot });
  totalProfit += job.profit;
  parent[slot] = find(slot - 1);
}

scheduled.sort((a, b) => a.slot - b.slot);
console.log("total_profit=" + totalProfit);
console.log("slot_plan=" + scheduled.map((job) => job.slot + ":task" + job.index).join(" "));
if (totalProfit !== 47) {
  throw new Error("截止期任务最大收益错误");
}
`,
      },
      stdin: '5\n2 10\n1 5\n2 15\n3 20\n3 12\n',
      checkpoint:
        'total_profit 必须为 47，slot_plan 必须为 1:task5 2:task3 3:task4。任务 1 与任务 2 在更晚槽位被占后无法再加入。',
    },
  },
  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：LRU、LFU 与缓存淘汰': {
    title: '高级算法代码台 12 · 最近最少使用与最少频次淘汰',
    description:
      'LRU 用有序字典维护访问顺序，LFU 用频次桶维护频次与同频次内的最近使用顺序，并通过真实操作流打印淘汰键。',
    ...pythonRuntime,
    practice: {
      id: 'algo-lru-cache-guided',
      title: '跟做：LRU 命中后立即刷新顺序',
      brief:
        '输入容量与操作流。get 命中时把键移到最近使用端，put 新键超容量时淘汰最久未使用端。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from collections import OrderedDict
import sys


lines = sys.stdin.read().strip().splitlines()
capacity = int(lines[0].split()[0])
cache = OrderedDict()
evicted = []

for line in lines[1:]:
    parts = line.split()
    if parts[0] == "put":
        key, value = parts[1], int(parts[2])
        if key in cache:
            cache.move_to_end(key)
        cache[key] = value
        if len(cache) > capacity:
            evicted_key, _ = cache.popitem(last=False)
            evicted.append(evicted_key)
    else:
        key = parts[1]
        if key in cache:
            value = cache[key]
            cache.move_to_end(key)
            print(f"get:{key}={value}")
        else:
            print(f"get:{key}=MISS")

print("evicted=" + ",".join(evicted))
print("final_order=" + ",".join(cache.keys()))
assert evicted == ["2"]
assert list(cache.keys()) == ["1", "3"]
`,
      },
      stdin:
        '2 5\nput 1 10\nput 2 20\nget 1\nput 3 30\nget 2\n',
      checkpoint:
        '必须输出 get:1=10、get:2=MISS，evicted=2、final_order=1,3，退出码为 0。第二次 get 不应改变最终最近使用顺序。',
    },
    apply: {
      id: 'algo-lfu-cache-independent',
      title: '独立实践：LFU 的频次桶与平局顺序',
      brief:
        '输入容量与操作流。每个字段记录 value 与 freq，buckets[freq] 保存同频次键的有序集合；淘汰最小频次桶的最旧键。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`from collections import OrderedDict, defaultdict
import sys


lines = sys.stdin.read().strip().splitlines()
capacity = int(lines[0].split()[0])
values = {}
frequencies = {}
buckets = defaultdict(OrderedDict)
minimum_frequency = 0
evicted = []


def touch(key):
    global minimum_frequency
    old = frequencies[key]
    del buckets[old][key]
    if not buckets[old] and minimum_frequency == old:
        minimum_frequency += 1
    frequencies[key] = old + 1
    buckets[old + 1][key] = None


for line in lines[1:]:
    parts = line.split()
    if parts[0] == "put":
        key, value = parts[1], int(parts[2])
        if capacity == 0:
            continue
        if key in values:
            values[key] = value
            touch(key)
            continue
        if len(values) == capacity:
            victim, _ = buckets[minimum_frequency].popitem(last=False)
            evicted.append(victim)
            del values[victim]
            del frequencies[victim]
        values[key] = value
        frequencies[key] = 1
        buckets[1][key] = None
        minimum_frequency = 1
    else:
        key = parts[1]
        if key not in values:
            print(f"get:{key}=MISS")
        else:
            touch(key)
            print(f"get:{key}={values[key]}")

print("evicted=" + ",".join(evicted))
print("frequencies=" + " ".join(f"{key}:{frequencies[key]}" for key in sorted(frequencies)))
assert evicted == ["2", "3"]
assert frequencies == {"1": 3, "4": 1}
`,
      },
      stdin:
        '2 7\nput 1 10\nput 2 20\nget 1\nput 3 30\nput 4 40\nget 2\nget 1\n',
      checkpoint:
        'evicted 必须为 2,3，frequencies 必须为 1:3 4:1。键 2 与 3 都处于频次 1 时，先插入的 2 先淘汰；键 3 随后也作为最低频次被淘汰，键 1 被 get 两次后频次为 3。',
    },
  },
  'algorithms:算法与数据结构 · 工程算法、性能与数据规模：性能剖析、回归与容量实验': {
    title: '高级算法代码台 13 · 操作计数、预热与内存访问',
    description:
      '先用精确操作次数验证 O(n²) 与 O(n) 的差距，再对矩阵行优先、列优先访问做预热和多轮测量，保留校验和而非只比较偶然耗时。',
    ...nodeRuntime,
    practice: {
      id: 'algo-profiling-operation-count-guided',
      title: '跟做：先数操作，再解释耗时',
      brief:
        '输入 n。构造 0 到 n-1 的不同整数，目标为 n-1。双重循环精确统计比较次数，哈希扫描精确统计探测次数。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
const n = Number(fs.readFileSync(0, "utf8").trim());
const values = Array.from({ length: n }, (_, index) => index);
const target = n - 1;

let quadraticComparisons = 0;
let pairCount = 0;
const startQuadratic = performance.now();
for (let i = 0; i < n; i += 1) {
  for (let j = i + 1; j < n; j += 1) {
    quadraticComparisons += 1;
    if (values[i] + values[j] === target) pairCount += 1;
  }
}
const quadraticMs = performance.now() - startQuadratic;

const seen = new Set();
let linearProbes = 0;
let hashPairCount = 0;
const startLinear = performance.now();
for (const value of values) {
  linearProbes += 1;
  if (seen.has(target - value)) hashPairCount += 1;
  seen.add(value);
}
const linearMs = performance.now() - startLinear;

console.log("quadratic_comparisons=" + quadraticComparisons);
console.log("linear_probes=" + linearProbes);
console.log("pair_count=" + pairCount + ", hash_pair_count=" + hashPairCount);
console.log("timing_ms=" + quadraticMs.toFixed(3) + "," + linearMs.toFixed(3));
if (quadraticComparisons !== n * (n - 1) / 2 || pairCount !== n / 2 || hashPairCount !== n / 2) {
  throw new Error("操作计数或配对数错误");
}
`,
      },
      stdin: '1200\n',
      checkpoint:
        'quadratic_comparisons 必须为 719400，linear_probes 必须为 1200，两种 pair_count 都必须是 600。timing_ms 是环境证据，允许随机器波动，不能代替计数断言。',
    },
    apply: {
      id: 'algo-profiling-cache-experiment-independent',
      title: '独立实践：行优先与列优先的容量实验',
      brief:
        '输入行列数与种子。构造二维矩阵后分别按行、按列遍历，各预热两轮再采样五轮；两次校验和必须相同。',
      defaultLanguage: 'javascript',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
const [rows, cols, seed] = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const matrix = Array.from({ length: rows }, (_, r) =>
  Array.from({ length: cols }, (_, c) => (r * 131 + c * 17 + seed) % 1009)
);

function rowMajor() {
  let checksum = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) checksum = (checksum + matrix[r][c]) % 1000003;
  }
  return checksum;
}

function columnMajor() {
  let checksum = 0;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) checksum = (checksum + matrix[r][c]) % 1000003;
  }
  return checksum;
}

for (let i = 0; i < 2; i += 1) {
  rowMajor();
  columnMajor();
}

const rowSamples = [];
const columnSamples = [];
for (let i = 0; i < 5; i += 1) {
  let start = performance.now();
  const rowChecksum = rowMajor();
  rowSamples.push(performance.now() - start);
  start = performance.now();
  const columnChecksum = columnMajor();
  columnSamples.push(performance.now() - start);
  if (rowChecksum !== columnChecksum) throw new Error("访问顺序改变了校验和");
}

function median(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

console.log("cells=" + rows * cols);
console.log("checksum=" + rowMajor());
console.log("row_median_ms=" + median(rowSamples).toFixed(3));
console.log("column_median_ms=" + median(columnSamples).toFixed(3));
if (median(rowSamples) <= 0 || median(columnSamples) <= 0) {
  throw new Error("计时器没有采集到有效样本");
}
`,
      },
      stdin: '420 420 17\n',
      checkpoint:
        'cells 必须为 176400，两种访问顺序的 checksum 必须完全相同。输出五轮样本的中位数；如果机器上差异不明显，应扩大矩阵或检查计时范围，而不是伪造快慢结论。',
    },
  },
  'algorithms:算法与数据结构 · 面试高频、冷门原型与变形：冷门模型、构造与交互题': {
    title: '高级算法代码台 14 · 计算几何与分治构造',
    description:
      '单调链求凸包并用鞋带公式计算面积，分治最近点对维护按 x 排序的递归结构与条带候选，得到可手算的平方距离。',
    ...pythonRuntime,
    practice: {
      id: 'algo-geometry-convex-hull-guided',
      title: '跟做：凸包与鞋带面积',
      brief:
        '输入点集，先按 x、y 排序并去重，再分别构造下凸包和上凸包。叉积不严格为正时弹出共线中间点。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().strip().splitlines()
n = int(lines[0])
points = sorted(set(tuple(map(int, line.split())) for line in lines[1:1 + n]))


def cross(origin, a, b):
    return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])


lower = []
for point in points:
    while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
        lower.pop()
    lower.append(point)

upper = []
for point in reversed(points):
    while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
        upper.pop()
    upper.append(point)

hull = lower[:-1] + upper[:-1]
twice_area = 0
for i, point in enumerate(hull):
    nxt = hull[(i + 1) % len(hull)]
    twice_area += point[0] * nxt[1] - point[1] * nxt[0]

print("hull=" + " ".join(f"({x},{y})" for x, y in hull))
print(f"area={abs(twice_area) / 2:.1f}")
assert hull == [(0, 0), (2, 0), (2, 2), (0, 2)]
assert abs(twice_area) == 8
`,
      },
      stdin: '7\n0 0\n2 0\n2 2\n0 2\n1 1\n1 0\n1 2\n',
      checkpoint:
        'hull 必须为 (0,0) (2,0) (2,2) (0,2)，area 必须为 4.0。点 (1,0) 与 (1,2) 位于边上，不应成为凸包顶点。',
    },
    apply: {
      id: 'algo-geometry-closest-pair-independent',
      title: '独立实践：分治最近点对',
      brief:
        '输入点集。按 x 排序后递归左右半区，取较小平方距离；只检查距离中线小于当前答案的点，并按 y 排序扫描条带。',
      defaultLanguage: 'python',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().strip().splitlines()
n = int(lines[0])
points = sorted(set(tuple(map(int, line.split())) for line in lines[1:1 + n]))


def distance_squared(a, b):
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def brute(collection):
    best = 10**30
    for i in range(len(collection)):
        for j in range(i + 1, len(collection)):
            best = min(best, distance_squared(collection[i], collection[j]))
    return best


def closest(px):
    if len(px) <= 3:
        return brute(px)
    middle = len(px) // 2
    middle_x = px[middle][0]
    best = min(closest(px[:middle]), closest(px[middle:]))
    strip = [point for point in px if (point[0] - middle_x) ** 2 < best]
    strip.sort(key=lambda point: point[1])
    for i in range(len(strip)):
        j = i + 1
        while j < len(strip) and (strip[j][1] - strip[i][1]) ** 2 < best:
            best = min(best, distance_squared(strip[i], strip[j]))
            j += 1
    return best


best_squared = closest(points)
print(f"closest_distance_squared={best_squared}")
print(f"closest_distance={best_squared ** 0.5:.6f}")
assert best_squared == 2
`,
      },
      stdin: '6\n0 0\n5 0\n1 1\n4 3\n2 2\n10 10\n',
      checkpoint:
        'closest_distance_squared 必须为 2，closest_distance 必须为 1.414214。最近点对是 (0,0)-(1,1) 或 (1,1)-(2,2)，两者平方距离都为 2。',
    },
  },
};
