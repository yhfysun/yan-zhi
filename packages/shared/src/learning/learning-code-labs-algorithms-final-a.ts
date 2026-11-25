import type { LearningV2CodeLab } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 内置运行时 / 单文件 JavaScript',
  docsUrl: 'https://nodejs.org/api/index.html',
  installSteps: [
    '应用内 Node.js 运行器执行单个 main.js，全部输入已写入 stdin。',
    '先手算关键状态，再运行程序核对断言与 checkpoint。',
    '断言失败会返回非零退出码；以退出码和完整输出共同验收。',
  ],
  languages: ['javascript'],
} as const;

const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3 内置运行时 / 单文件标准库',
  docsUrl: 'https://docs.python.org/3/library/',
  installSteps: [
    '应用内 Python 运行器执行单个 main.py，全部输入已写入 stdin。',
    '先根据输入手算路径、计数或不变量，再运行代码核对。',
    '代码只使用标准库；assert 失败会返回非零退出码。',
  ],
  languages: ['python'],
} as const;

export const LEARNING_CODE_LABS_ALGORITHMS_FINAL_A: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'algorithms:算法与数据结构 · 复杂度、正确性与测量：循环不变量与终止性': {
    ...nodeRuntime,
    title: '不变量代码台 · lower_bound 与欧几里得终止性',
    description:
      '先用可检查的区间不变量实现 lower_bound，再用最大公约数不变式和严格下降的势函数证明欧几里得循环必然终止。',
    practice: {
      id: 'algo-final-a-invariant-lower-bound',
      title: '跟做：每一步都检查 lower_bound 不变量',
      brief:
        '输入一个有序数组和目标值。二分区间采用左闭右开 [lo, hi)，每轮验证 lo 左侧都小于目标、hi 右侧都不小于目标，最后返回首个可插入位置。',
      defaultLanguage: 'javascript',
      stdin: '8\n1 3 3 5 8 8 13 21\n8\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const values = lines[1].split(/\s+/).map(Number);
const target = Number(lines[2]);

function lowerBound(items, wanted) {
  let lo = 0;
  let hi = items.length;
  let rounds = 0;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    for (let i = 0; i < lo; i += 1) assert(items[i] < wanted);
    for (let i = hi; i < items.length; i += 1) assert(items[i] >= wanted);
    rounds += 1;

    if (items[mid] < wanted) lo = mid + 1;
    else hi = mid;
  }

  for (let i = 0; i < lo; i += 1) assert(items[i] < wanted);
  for (let i = lo; i < items.length; i += 1) assert(items[i] >= wanted);
  return { index: lo, rounds };
}

const result = lowerBound(values, target);
console.log("index=" + result.index);
console.log("rounds=" + result.rounds);
assert.deepEqual(result, { index: 4, rounds: 3 });
assert.equal(values[result.index], 8);
assert(values[result.index - 1] < target);
`,
      },
      checkpoint:
        '输出必须是 index=4、rounds=3。三次收缩分别把 hi 改为 4、lo 改为 3、lo 再改为 4；退出时前四个元素小于 8，从下标 4 起均不小于 8。',
    },
    apply: {
      id: 'algo-final-a-termination-gcd',
      title: '独立实践：用势函数证明 gcd 循环终止',
      brief:
        '读取两个非负整数，用欧几里得算法求 gcd。记录每轮 (a,b) 和 a+b，并验证 gcd 不变量与势函数严格下降。',
      defaultLanguage: 'javascript',
      stdin: '1071 462\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const [startA, startB] = fs.readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
assert(Number.isSafeInteger(startA) && Number.isSafeInteger(startB));
assert(startA >= 0 && startB >= 0 && startA + startB > 0);

function gcdInvariant(x, y) {
  if (y === 0) return x;
  return gcdInvariant(y, x % y);
}

let a = startA;
let b = startB;
let previousPotential = a + b;
let rounds = 0;

while (b !== 0) {
  assert.equal(gcdInvariant(a, b), gcdInvariant(startA, startB));
  const nextA = b;
  const nextB = a % b;
  const nextPotential = nextA + nextB;
  console.log("a=" + a + ",b=" + b + ",potential=" + nextPotential);
  assert(nextPotential < previousPotential);
  assert(nextB < nextA);
  [a, b] = [nextA, nextB];
  previousPotential = nextPotential;
  rounds += 1;
}

console.log("gcd=" + a);
console.log("rounds=" + rounds);
assert.equal(a, 21);
assert.equal(rounds, 3);
`,
      },
      checkpoint:
        '输出 gcd=21、rounds=3，三轮势函数分别为 609、168、21，始终严格下降。循环结束时 b=0，而 gcd(a,0)=a 是最后不变量，因此返回的 21 正是原两数的最大公约数。',
    },
  },

  'algorithms:算法与数据结构 · 复杂度、正确性与测量：递归式与主定理直觉': {
    ...pythonRuntime,
    title: '递归式代码台 · 展开每层成本并判断主定理情形',
    description:
      '先按层展开 T(n)=2T(n/2)+n 核对总成本，再比较 a 与 b^d 判断主定理三种情形，避免只背结论。',
    practice: {
      id: 'algo-final-a-recurrence-levels',
      title: '跟做：逐层核算归并递归成本',
      brief:
        '输入 n=16，按 T(n)=2T(n/2)+n 精确展开。程序输出每层子问题数与当层总成本，并验证总成本等于 80。',
      defaultLanguage: 'python',
      stdin: '16\n',
      starterCode: {
        python: String.raw`import sys


n = int(sys.stdin.read().strip())
levels = []


def expand(size, depth):
    while len(levels) <= depth:
        levels.append({"problems": 0, "cost": 0})
    levels[depth]["problems"] += 1
    levels[depth]["cost"] += size
    if size == 1:
        return size
    assert size % 2 == 0
    return size + expand(size // 2, depth + 1) + expand(size // 2, depth + 1)


total = expand(n, 0)
for depth, row in enumerate(levels):
    print(
        f"depth={depth},problems={row['problems']},"
        f"size_each={n // (2 ** depth)},layer_cost={row['cost']}"
    )
print(f"total={total}")
print(f"depth_count={len(levels)}")
assert [row["cost"] for row in levels] == [16, 16, 16, 16, 16]
assert total == 80
assert len(levels) == 5
`,
      },
      checkpoint:
        '五层每层成本都是 16，总成本 80，递归深度为 log2(16)+1=5 层。若只数叶子会有 16 个单位成本，必须再把四层合并成本各 16 加回来。',
    },
    apply: {
      id: 'algo-final-a-master-classifier',
      title: '独立实践：按 a、b、d 判断三种情形',
      brief:
        '输入若干组 a、b、d，对应 T(n)=aT(n/b)+n^d。程序比较 a 与 b^d，输出情形、渐近量级以及 n=64 的叶子和总成本。',
      defaultLanguage: 'python',
      stdin: '2 2 1\n2 2 2\n4 2 1\n',
      starterCode: {
        python: String.raw`import math
import sys


rows = [tuple(map(int, line.split())) for line in sys.stdin.read().splitlines()]
results = []

for a, b, d in rows:
    assert a >= 1 and b >= 1 and d >= 0
    critical = b ** d
    leaves_at_64 = a ** round(math.log(64, b))
    total_at_64 = sum(
        (a ** level) * ((64 / (b ** level)) ** d)
        for level in range(round(math.log(64, b)) + 1)
    )

    if a < critical:
        case_name = "leaf-dominated"
        growth = f"O(n^{d})"
    elif a == critical:
        case_name = "balanced"
        growth = f"O(n^{d} log n)"
    else:
        case_name = "root-dominated"
        growth = f"O(n^{math.log(a, b):.3f})"

    print(
        f"a={a},b={b},d={d},case={case_name},"
        f"growth={growth},leaves64={leaves_at_64},total64={total_at_64:g}"
    )
    results.append((case_name, leaves_at_64, total_at_64))

assert [row[0] for row in results] == [
    "balanced",
    "leaf-dominated",
    "root-dominated",
]
assert results[0][1] == 64
assert results[0][2] == 448
assert results[1][1] == 64
assert results[1][2] == 8128
assert results[2][1] == 4096
assert results[2][2] == 8128
`,
      },
      checkpoint:
        '三组必须是 balanced、leaf-dominated、root-dominated。第一组为 O(n log n)，第二组为 O(n^2)，第三组为 O(n^2)；在 n=64 时总成本分别为 448、8128、8128，说明即使总成本碰巧相同，叶层占比与渐近增长仍可能不同。',
    },
  },

  'algorithms:算法与数据结构 · 复杂度、正确性与测量：空间复杂度与缓存局部性': {
    ...nodeRuntime,
    title: '空间与缓存代码台 · 行扫描、列扫描与滚动数组',
    description:
      '用缓存行集合计数比较二维数组的行优先与列优先访问，再比较 LCS 全表与单行滚动版本的空间占用。',
    practice: {
      id: 'algo-final-a-cache-lines',
      title: '跟做：数清行优先与列优先访问的缓存行',
      brief:
        '输入 rows、cols 与每条缓存行容纳的整数个数。同一块二维数据分别按行和按列访问，统计实际触达的不同缓存行数量。',
      defaultLanguage: 'javascript',
      stdin: '24 64 8\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const [rows, cols, intsPerLine] = fs
  .readFileSync(0, "utf8")
  .trim()
  .split(/\s+/)
  .map(Number);

assert(rows > 0 && cols > 0 && intsPerLine > 0);
const totalCells = rows * cols;

function countMisses(visitOrder) {
  const cache = [];
  let accesses = 0;
  let misses = 0;
  for (const [row, col] of visitOrder) {
    const linearIndex = row * cols + col;
    const line = Math.floor(linearIndex / intsPerLine);
    const position = cache.indexOf(line);
    if (position >= 0) {
      cache.splice(position, 1);
    } else {
      misses += 1;
      if (cache.length === 8) cache.shift();
    }
    cache.push(line);
    accesses += 1;
  }
  assert.equal(accesses, totalCells);
  return misses;
}

function* rowOrder() {
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) yield [row, col];
  }
}

function* columnOrder() {
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) yield [row, col];
  }
}

const rowLines = countMisses(rowOrder());
const columnLines = countMisses(columnOrder());
console.log("cells=" + totalCells);
console.log("row_cache_lines=" + rowLines);
console.log("column_cache_lines=" + columnLines);
console.log("ratio=" + (columnLines / rowLines).toFixed(1));

assert.equal(rowLines, 192);
assert.equal(columnLines, 1536);
assert.equal(columnLines / rowLines, 8);
`,
      },
      checkpoint:
        '共访问 1536 个格子；在只能驻留 8 条缓存行的模型中，行优先未命中 192 次，列优先未命中 1536 次，相差 8 倍。原因是列扫描每次跨过整行，刚装载的行很快被其他行逐出，等下一列再回来时无法复用。',
    },
    apply: {
      id: 'algo-final-a-rolling-lcs',
      title: '独立实践：把 LCS 二维表压成一行',
      brief:
        '输入两个字符串，分别用完整二维表和只有一行的滚动表计算最长公共子序列长度。验证结果一致并统计保存的整数格数。',
      defaultLanguage: 'javascript',
      stdin: 'AGGTAB\nGXTXAYB\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const [left, right] = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);

function fullTable(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return { length: dp[a.length][b.length], cells: (a.length + 1) * (b.length + 1) };
}

function rollingTable(a, b) {
  let previous = new Array(b.length + 1).fill(0);
  let current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = 0;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
  }
  return { length: previous[b.length], cells: previous.length };
}

const full = fullTable(left, right);
const rolling = rollingTable(left, right);
console.log("left=" + left + ",right=" + right);
console.log("lcs_length=" + full.length);
console.log("full_cells=" + full.cells);
console.log("rolling_cells=" + rolling.cells);
console.log("cells_saved=" + (full.cells - rolling.cells));

assert.equal(full.length, 4);
assert.equal(rolling.length, full.length);
assert.equal(full.cells, 56);
assert.equal(rolling.cells, 8);
assert.equal(full.cells - rolling.cells, 48);
`,
      },
      checkpoint:
        '两种实现的 LCS 长度都必须是 4。完整表保存 56 个整数格，滚动版只保留 8 个整数格，少 48 格；代价是滚动版丢失完整决策表，若不额外保存选择就无法直接恢复具体公共子序列。',
    },
  },

  'algorithms:算法与数据结构 · 复杂度、正确性与测量：正确性证明与反例设计': {
    ...pythonRuntime,
    title: '正确性代码台 · 候选验证与最小反例',
    description:
      '用投票算法的候选加复核证明“候选非多数”这一边界，再通过穷举搜索找出贪心硬币算法的最小失败输入。',
    practice: {
      id: 'algo-final-a-majority-certificate',
      title: '跟做：候选不等于多数派',
      brief:
        '输入一组整数，运行 Boyer-Moore 投票得到候选，再扫描确认候选出现次数。分别用一个真有多数派的输入和一个只有候选的输入验证结论。',
      defaultLanguage: 'python',
      stdin: '2 2 1 1 1 2 2\n',
      starterCode: {
        python: String.raw`import sys


values = list(map(int, sys.stdin.read().split()))
assert values


def candidate_of(items):
    candidate = None
    balance = 0
    for value in items:
        if balance == 0:
            candidate = value
        balance += 1 if value == candidate else -1
    return candidate


def certified_majority(items):
    candidate = candidate_of(items)
    count = sum(1 for value in items if value == candidate)
    return candidate, count, count > len(items) // 2


candidate, count, is_majority = certified_majority(values)
no_majority_case = [1, 2, 3]
fallback, fallback_count, fallback_ok = certified_majority(no_majority_case)

print(f"candidate={candidate},count={count},majority={is_majority}")
print(
    f"counterexample={no_majority_case},candidate={fallback},"
    f"count={fallback_count},majority={fallback_ok}"
)
assert candidate == 2
assert count == 4
assert is_majority is True
assert fallback == 3
assert fallback_count == 1
assert fallback_ok is False
`,
      },
      checkpoint:
        '第一组候选为 2、出现 4 次，严格超过 7 的一半；反例 [1,2,3] 的候选是 3 但只出现 1 次。结论必须写成“候选是必要证书，再计数才是充分验证”，不能把候选直接当多数派。',
    },
    apply: {
      id: 'algo-final-a-coin-counterexample',
      title: '独立实践：找出贪心硬币的最小反例',
      brief:
        '面值为 1、3、4，目标是 1 到 20。贪心每次取最大面值，程序用动态规划求真正最优值，输出第一个目标、贪心硬币数和最优硬币数。',
      defaultLanguage: 'python',
      stdin: '20\n',
      starterCode: {
        python: String.raw`import sys


limit = int(sys.stdin.read().strip())
coins = [4, 3, 1]


def greedy(amount):
    picked = []
    remaining = amount
    for coin in coins:
        while remaining >= coin:
            picked.append(coin)
            remaining -= coin
    assert remaining == 0
    return picked


infinity = float("inf")
best = [infinity] * (limit + 1)
best[0] = 0
for amount in range(1, limit + 1):
    for coin in coins:
        if coin <= amount:
            best[amount] = min(best[amount], best[amount - coin] + 1)

counterexamples = []
for amount in range(1, limit + 1):
    greedy_picks = greedy(amount)
    if len(greedy_picks) != best[amount]:
        counterexamples.append(
            {
                "amount": amount,
                "greedy_picks": "+".join(map(str, greedy_picks)),
                "greedy_count": len(greedy_picks),
                "optimal_count": int(best[amount]),
            }
        )

print(f"first_counterexample={counterexamples[0]}")
print(f"counterexample_count={len(counterexamples)}")
assert counterexamples[0]["amount"] == 6
assert counterexamples[0]["greedy_picks"] == "4+1+1"
assert counterexamples[0]["greedy_count"] == 3
assert counterexamples[0]["optimal_count"] == 2
assert len(counterexamples) >= 1
`,
      },
      checkpoint:
        '第一个反例必须是金额 6：贪心选 4+1+1 共 3 枚，而最优是 3+3 共 2 枚。证明“贪心最优”需要覆盖所有输入，只需一个可复核反例就能否定该命题；这里的最小失败目标就是 6。',
    },
  },

  'algorithms:算法与数据结构 · 复杂度、正确性与测量：基准测试、预热与火焰图': {
    ...nodeRuntime,
    title: '基准代码台 · 预热、分位数与调用采样',
    description:
      '用真实高精度计时完成预热和重复采样，再比较两种实现。除耗时外还聚合确定性的调用树采样，区分总样本与自身样本。',
    practice: {
      id: 'algo-final-a-warmup-median',
      title: '跟做：预热后取中位数而不是单次计时',
      brief:
        '输入工作量、批次数和采样次数。先做 3 次预热，再执行多批确定性循环并取排序后的中位耗时；同时核对每次运行都产生相同校验和。',
      defaultLanguage: 'javascript',
      stdin: '20000 5 9\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const [size, batchedRounds, samples] = fs
  .readFileSync(0, "utf8")
  .trim()
  .split(/\s+/)
  .map(Number);
assert(size > 0 && batchedRounds > 0 && samples >= 3);

function workload(n, rounds) {
  let checksum = 0;
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < n; i += 1) {
      checksum = (checksum + ((i * 2654435761) >>> 0)) >>> 0;
    }
  }
  return checksum;
}

function measureOnce(n, rounds) {
  const started = process.hrtime.bigint();
  const checksum = workload(n, rounds);
  const elapsedNs = Number(process.hrtime.bigint() - started);
  return { checksum, elapsedNs };
}

for (let i = 0; i < 3; i += 1) measureOnce(size, 1);
const timed = Array.from({ length: samples }, () => measureOnce(size, batchedRounds));
const ordered = timed.map((row) => row.elapsedNs).sort((a, b) => a - b);
const middle = Math.floor(ordered.length / 2);
const medianNs = ordered[middle];
const expectedChecksum = workload(size, batchedRounds);

console.log("checksum=" + timed[0].checksum);
console.log("samples=" + samples);
console.log("min_ns=" + ordered[0]);
console.log("median_ns=" + medianNs);
console.log("max_ns=" + ordered.at(-1));
console.log("batched_operations=" + size * batchedRounds);

assert(timed.every((row) => row.checksum === expectedChecksum));
assert(ordered.every((value) => Number.isInteger(value) && value >= 0));
assert(medianNs >= ordered[0] && medianNs <= ordered.at(-1));
assert.equal(samples, 9);
assert.equal(timed[0].checksum, expectedChecksum);
`,
      },
      checkpoint:
        '9 个样本必须拥有同一 checksum，min_ns <= median_ns <= max_ns，总操作数是 100000。中位数降低单次调度抖动的影响；预热单独记录、不混入 9 个正式样本，代码也会显式校验这两个条件。',
    },
    apply: {
      id: 'algo-final-a-ab-profile',
      title: '独立实践：A/B 基准与调用树采样',
      brief:
        '输入数据规模和重复次数。比较线性扫描与双指针查找，各自预热后取中位耗时；同时聚合一棵调用树的 inclusive 与 self 样本数。',
      defaultLanguage: 'javascript',
      stdin: '20000 7\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const [size, repeats] = fs
  .readFileSync(0, "utf8")
  .trim()
  .split(/\s+/)
  .map(Number);
const values = Array.from({ length: size }, (_, index) => index * 2);
const target = size - 2;

function linear(items, wanted) {
  const seen = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const needed = wanted - items[index];
    if (seen.has(needed)) return [seen.get(needed), index];
    seen.set(items[index], index);
  }
  throw new Error("unreachable");
}

function twoPointer(items, wanted) {
  let left = 0;
  let right = items.length - 1;
  while (left < right) {
    const sum = items[left] + items[right];
    if (sum === wanted) return [left, right];
    if (sum < wanted) left += 1;
    else right -= 1;
  }
  throw new Error("unreachable");
}

function medianNs(run) {
  for (let i = 0; i < 3; i += 1) run();
  const samples = [];
  for (let i = 0; i < repeats; i += 1) {
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const pairA = linear(values, target);
const pairB = twoPointer(values, target);
assert.equal(values[pairA[0]] + values[pairA[1]], target);
assert.equal(values[pairB[0]] + values[pairB[1]], target);
assert(pairA[0] < pairA[1] && pairB[0] < pairB[1]);

const callTree = [
  { frame: "run_benchmark", inclusive: 100, self: 12 },
  { frame: "scan_array", inclusive: 54, self: 37 },
  { frame: "compare_pair", inclusive: 17, self: 17 },
];
const inclusive = callTree.reduce((sum, row) => sum + row.inclusive, 0);
const own = callTree.reduce((sum, row) => sum + row.self, 0);

console.log("linear_pair=" + pairA.join(","));
console.log("two_pointer_pair=" + pairB.join(","));
console.log("linear_median_ns=" + medianNs(() => linear(values, target)));
console.log("two_pointer_median_ns=" + medianNs(() => twoPointer(values, target)));
console.log("profile_inclusive=" + inclusive + ",profile_self=" + own);

assert.equal(inclusive, 171);
assert.equal(own, 66);
assert.equal(repeats, 7);
`,
      },
      checkpoint:
        '两种实现返回的下标对都必须真正满足目标之和，但不要求下标完全相同；重复的配对和可能让两种扫描顺序选中不同解。两个中位耗时都来自 3 次预热后的 7 个正式样本，且只能报告实测值。调用树样本的 inclusive 总和为 171、self 总和为 66；这说明采样摘要和墙钟基准回答的是不同问题。',
    },
  },

  'algorithms:算法与数据结构 · 复杂度、正确性与测量：多语言实现的数值与内存边界': {
    ...pythonRuntime,
    title: '数值边界代码台 · 安全整数、回绕与编码宽度',
    description:
      '先比较 JavaScript Number 的安全整数边界与 32 位回绕，再用 Python 实测 UTF-8、UTF-16 和二进制宽度，避免把“字符数”当成存储字节数。',
    practice: {
      id: 'algo-final-a-number-boundary',
      title: '跟做：同一个大整数在 BigInt 与 Number 中不同',
      brief:
        '输入一个超过 2^53 的整数、一个 32 位无符号值和一个浮点表达式。程序分别展示 BigInt 精确值、Number 舍入、Int32Array 回绕和二进制浮点误差。',
      defaultLanguage: 'python',
      stdin: '9007199254740993 4294967295\n',
      starterCode: {
        python: String.raw`import struct
import sys


big_text, unsigned_text = sys.stdin.read().split()
big_exact = int(big_text)
unsigned_value = int(unsigned_text)

serialized_u32 = struct.pack("<I", unsigned_value)
wrapped_s32 = struct.unpack("<i", serialized_u32)[0]
rounded_float = float(big_exact)
binary_float = float(0.1) + float(0.2)

print(f"big_exact={big_exact}")
print(f"float_roundtrip={int(rounded_float)}")
print(f"float_loss={int(rounded_float) - big_exact}")
print(f"u32_bytes={serialized_u32.hex()},wrapped_s32={wrapped_s32}")
print(f"0.1+0.2={binary_float:.17f},equals_0.3={binary_float == 0.3}")

assert big_exact == 9007199254740993
assert int(rounded_float) == 9007199254740992
assert wrapped_s32 == -1
assert binary_float != 0.3
`,
      },
      checkpoint:
        '9007199254740993 转成二进制浮点时变成 9007199254740992，损失 1；0xffffffff 按有符号 32 位解释为 -1；0.1+0.2 的 17 位结果不是精确的 0.3。金额、ID 和协议字段必须根据边界选择定点数、BigInt 或显式字节布局。',
    },
    apply: {
      id: 'algo-final-a-encoding-memory',
      title: '独立实践：字符数、码点数与存储字节数',
      brief:
        '输入重复次数，对含中文字符、ASCII 和补充平面 emoji 的文本分别统计 Unicode 码点数、UTF-8 字节、UTF-16 码元和固定 32 位数组大小。',
      defaultLanguage: 'python',
      stdin: '3\n',
      starterCode: {
        python: String.raw`import array
import sys


repeats = int(sys.stdin.read().strip())
text = "算法A🙂" * repeats
code_points = len(text)
utf8_bytes = len(text.encode("utf-8"))
utf16_units = len(text.encode("utf-16-le")) // 2
utf16_bytes = len(text.encode("utf-16-le"))
u32_cells = array.array("I", (ord(char) for char in text))

print(f"text={text}")
print(f"code_points={code_points}")
print(f"utf8_bytes={utf8_bytes}")
print(f"utf16_units={utf16_units},utf16_bytes={utf16_bytes}")
print(f"u32_cells={len(u32_cells)},u32_bytes={len(u32_cells) * 4}")

assert repeats == 3
assert code_points == 12
assert utf8_bytes == 33
assert utf16_units == 15
assert utf16_bytes == 30
assert len(u32_cells) == 12
assert len(u32_cells) * 4 == 48
`,
      },
      checkpoint:
        '重复 3 次后是 12 个码点、33 个 UTF-8 字节、15 个 UTF-16 码元和 48 字节固定 32 位数组。emoji 🙂 在 UTF-16 中占两个码元，在 UTF-8 中占四个字节；任何按“字符数乘固定字节”估算内存的步骤都必须先声明编码与内部表示。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：平衡树与红黑树不变量': {
    ...nodeRuntime,
    title: '平衡树代码台 · AVL 旋转与红黑树五条不变量',
    description:
      '先观察 AVL 在升序插入时如何靠旋转压低高度，再用父指针实现红黑树插入修复，完整检查根黑、红节点孩子、有序性与黑高一致。',
    practice: {
      id: 'algo-final-a-avl-rotations',
      title: '跟做：升序插入触发 AVL 旋转',
      brief:
        '输入一组互不相同的整数，按顺序插入 AVL 树。程序维护高度与平衡因子，在 LL、RR、LR、RL 四种失衡上执行旋转，并输出最终高度和中序序列。',
      defaultLanguage: 'javascript',
      stdin: '7\n10 20 30 40 50 25\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const values = lines[1].split(/\s+/).map(Number);

class Node {
  constructor(key) {
    this.key = key;
    this.left = null;
    this.right = null;
    this.height = 1;
  }
}

function height(node) {
  return node ? node.height : 0;
}

function refresh(node) {
  node.height = 1 + Math.max(height(node.left), height(node.right));
  return node;
}

function rotateRight(node) {
  const pivot = node.left;
  node.left = pivot.right;
  pivot.right = node;
  refresh(node);
  return refresh(pivot);
}

function rotateLeft(node) {
  const pivot = node.right;
  node.right = pivot.left;
  pivot.left = node;
  refresh(node);
  return refresh(pivot);
}

function insert(node, key) {
  if (!node) return new Node(key);
  if (key < node.key) node.left = insert(node.left, key);
  else if (key > node.key) node.right = insert(node.right, key);
  else throw new Error("duplicate key");
  refresh(node);

  const balance = height(node.left) - height(node.right);
  if (balance > 1 && key < node.left.key) return rotateRight(node);
  if (balance < -1 && key > node.right.key) return rotateLeft(node);
  if (balance > 1 && key > node.left.key) {
    node.left = rotateLeft(node.left);
    return rotateRight(node);
  }
  if (balance < -1 && key < node.right.key) {
    node.right = rotateRight(node.right);
    return rotateLeft(node);
  }
  return node;
}

function inorder(node, output = []) {
  if (!node) return output;
  inorder(node.left, output);
  output.push(node.key);
  inorder(node.right, output);
  return output;
}

function validate(node, low = -Infinity, high = Infinity) {
  if (!node) return 0;
  assert(node.key > low && node.key < high);
  const leftHeight = validate(node.left, low, node.key);
  const rightHeight = validate(node.right, node.key, high);
  assert(Math.abs(leftHeight - rightHeight) <= 1);
  return 1 + Math.max(leftHeight, rightHeight);
}

let root = null;
for (const value of values) root = insert(root, value);
const measuredHeight = validate(root);
console.log("inorder=" + inorder(root).join(","));
console.log("height=" + measuredHeight);
assert.deepEqual(inorder(root), [10, 20, 25, 30, 40, 50]);
assert.equal(measuredHeight, 3);
`,
      },
      checkpoint:
        '中序必须为 10,20,25,30,40,50，最终高度为 3。六次插入中 10-20-30 触发 RR、30-40-50 触发 RR，插入 25 时先形成 20-25-30 的 LR 局部结构，再通过双旋保持高度差不超过 1。',
    },
    apply: {
      id: 'algo-final-a-red-black-invariants',
      title: '独立实践：红黑树插入后检查全部不变量',
      brief:
        '输入一组互不相同的整数，按顺序插入带父指针的红黑树。程序执行变色与旋转，最后检查 BST 顺序、根为黑、红节点无红孩子、父指针一致和每条路径黑高相同。',
      defaultLanguage: 'javascript',
      stdin: '11\n7 3 18 10 22 8 11 26 2 6 13\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const keys = lines[1].split(/\s+/).map(Number);

class Node {
  constructor(key) {
    this.key = key;
    this.red = true;
    this.left = null;
    this.right = null;
    this.parent = null;
  }
}

let root = null;

function rotateLeft(node) {
  const pivot = node.right;
  node.right = pivot.left;
  if (pivot.left) pivot.left.parent = node;
  pivot.parent = node.parent;
  if (!node.parent) root = pivot;
  else if (node === node.parent.left) node.parent.left = pivot;
  else node.parent.right = pivot;
  pivot.left = node;
  node.parent = pivot;
}

function rotateRight(node) {
  const pivot = node.left;
  node.left = pivot.right;
  if (pivot.right) pivot.right.parent = node;
  pivot.parent = node.parent;
  if (!node.parent) root = pivot;
  else if (node === node.parent.right) node.parent.right = pivot;
  else node.parent.left = pivot;
  pivot.right = node;
  node.parent = pivot;
}

function repair(node) {
  while (node.parent && node.parent.red) {
    const parent = node.parent;
    const grand = parent.parent;
    assert(grand);
    const uncle = parent === grand.left ? grand.right : grand.left;
    if (uncle && uncle.red) {
      parent.red = false;
      uncle.red = false;
      grand.red = true;
      node = grand;
    } else if (parent === grand.left) {
      if (node === parent.right) {
        node = parent;
        rotateLeft(node);
      }
      node.parent.red = false;
      node.parent.parent.red = true;
      rotateRight(node.parent.parent);
    } else {
      if (node === parent.left) {
        node = parent;
        rotateRight(node);
      }
      node.parent.red = false;
      node.parent.parent.red = true;
      rotateLeft(node.parent.parent);
    }
  }
  root.red = false;
}

function insert(key) {
  let parent = null;
  let cursor = root;
  while (cursor) {
    parent = cursor;
    if (key === cursor.key) throw new Error("duplicate key");
    cursor = key < cursor.key ? cursor.left : cursor.right;
  }
  const node = new Node(key);
  node.parent = parent;
  if (!parent) root = node;
  else if (key < parent.key) parent.left = node;
  else parent.right = node;
  repair(node);
}

function validate(node, low, high) {
  if (!node) return 1;
  assert(node.key > low && node.key < high);
  if (node.left) assert.equal(node.left.parent, node);
  if (node.right) assert.equal(node.right.parent, node);
  if (node.red) {
    assert(!node.left || !node.left.red);
    assert(!node.right || !node.right.red);
  }
  const leftBlack = validate(node.left, low, node.key);
  const rightBlack = validate(node.right, node.key, high);
  assert.equal(leftBlack, rightBlack);
  return leftBlack + (node.red ? 0 : 1);
}

function inorder(node, output = []) {
  if (!node) return output;
  inorder(node.left, output);
  output.push(node.key);
  inorder(node.right, output);
  return output;
}

for (const key of keys) insert(key);
assert(root && !root.red);
const blackHeight = validate(root, -Infinity, Infinity) - 1;
const sorted = inorder(root);
console.log("root=" + root.key);
console.log("inorder=" + sorted.join(","));
console.log("black_height_excluding_root=" + blackHeight);
console.log("node_count=" + sorted.length);
assert.deepEqual(sorted, [2, 3, 6, 7, 8, 10, 11, 13, 18, 22, 26]);
assert.equal(sorted.length, 11);
assert(blackHeight >= 2);
`,
      },
      checkpoint:
        '中序必须覆盖全部 11 个键且严格升序，根为黑色，黑高至少为 2。每次修复后都检查父指针；无论插入顺序如何，红色节点都不能有红色孩子，且从根到任一空叶子的黑节点数必须相等。',
    },
  },

  'algorithms:算法与数据结构 · 树、堆、排序与索引：B 树、LSM 与数据库索引': {
    ...pythonRuntime,
    title: '索引代码台 · B 树页查找与 LSM 墓碑合并',
    description:
      '先按内部页分隔键进入子页完成 B 树点查，再实现带 memtable、SSTable、删除墓碑和压缩的最新值查询。',
    practice: {
      id: 'algo-final-a-btree-page-search',
      title: '跟做：沿内部页键选择 B 树子页',
      brief:
        '输入多个键。程序在一棵固定高度为 3 的 B 树索引中查找，记录经过的页号、每页比较过的分隔键与是否命中叶子。',
      defaultLanguage: 'python',
      stdin: '2\n12 31 99\n',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().splitlines()
queries = list(map(int, lines[1].split()))

root = {
    "page": 1,
    "separators": [20, 40],
    "children": [
        {"page": 2, "keys": [5, 12, 18]},
        {"page": 3, "keys": [20, 31, 38]},
        {"page": 4, "keys": [40, 52, 67]},
    ],
}


def locate(key):
    path = []
    chosen = 0
    for index, separator in enumerate(root["separators"]):
        path.append(f"page1:compare:{separator}")
        if key >= separator:
            chosen = index + 1
    page = root["children"][chosen]
    path.append(f"page1:choose:{page['page']}")
    for value in page["keys"]:
        path.append(f"page{page['page']}:compare:{value}")
        if value == key:
            return page["page"], True, path
    return page["page"], False, path


results = []
for query in queries:
    page, found, path = locate(query)
    print(f"key={query},page={page},found={found},path={'|'.join(path)}")
    results.append((query, page, found))

assert results == [(12, 2, True), (31, 3, True), (99, 4, False)]
assert "page1:compare:20" in locate(12)[2]
assert "page1:choose:3" in locate(31)[2]
`,
      },
      checkpoint:
        '12 命中页 2，31 命中页 3，99 走页 4 但未命中。每次查找先比较根页分隔键 20、40，再进入一个叶子页顺序比较；这说明 B 树减少的是页读取次数，叶页内部仍需精确查找。',
    },
    apply: {
      id: 'algo-final-a-lsm-tombstone',
      title: '独立实践：LSM 写入、刷盘、墓碑与压缩',
      brief:
        '读取一组 put、delete、flush、compact、query 命令。查询先看 memtable，再从新到旧扫描 SSTable；压缩时保留每个键的最新版本并清除最老层墓碑。',
      defaultLanguage: 'python',
      stdin: 'put a 1\nput b 2\ndelete a\nput c 3\nflush\nput a 9\nflush\ncompact\nquery a\nquery b\nquery c\n',
      starterCode: {
        python: String.raw`import sys


commands = [line.strip() for line in sys.stdin if line.strip()]
memtable = {}
sstables = []
removed_during_compaction = 0


def flush_memtable():
    global memtable
    if memtable:
        sstables.append(dict(memtable))
        memtable = {}


def query(key):
    if key in memtable:
        return memtable[key], "memtable"
    for table in reversed(sstables):
        if key in table:
            return table[key], "sstable"
    return None, "missing"


for command in commands:
    parts = command.split()
    action = parts[0]
    if action == "put":
        memtable[parts[1]] = parts[2]
    elif action == "delete":
        memtable[parts[1]] = None
    elif action == "flush":
        flush_memtable()
    elif action == "compact" and sstables:
        merged = {}
        for table in reversed(sstables):
            for key, value in table.items():
                if key not in merged:
                    merged[key] = value
                elif value is None:
                    removed_during_compaction += 1
        for key in list(merged):
            if merged[key] is None:
                removed_during_compaction += 1
                del merged[key]
        sstables = [merged]
    elif action == "query":
        key = parts[1]
        value, source = query(key)
        print(f"query key={key},value={value},source={source}")

assert query("a") == ("9", "sstable")
assert query("b") == ("2", "sstable")
assert query("c") == ("3", "sstable")
assert len(sstables) == 1
assert removed_during_compaction == 1
assert sstables[0] == {"b": "2", "c": "3", "a": "9"}
print(f"sstable_count={len(sstables)}")
print(f"tombstones_removed={removed_during_compaction}")
`,
      },
      checkpoint:
        '最终 a=9、b=2、c=3，压缩后只剩一张 SSTable，并清除了 a 的旧墓碑。查询必须保持“新层覆盖旧层”的优先级；如果压缩时先读旧表，或把墓碑当普通值丢弃前未确认没有更旧版本，就可能复活已删除键。',
    },
  },

  'algorithms:算法与数据结构 · 图论、搜索与最短路：BFS、DFS 和连通分量': {
    ...nodeRuntime,
    title: '图遍历代码台 · BFS 层次与 DFS 连通分量',
    description:
      '先用 BFS 求无权图最短距离和路径，再用带栈帧的 DFS 区分发现/完成顺序并统计无向图连通分量。',
    practice: {
      id: 'algo-final-a-bfs-distance',
      title: '跟做：BFS 队列层次与最短路径',
      brief:
        '输入无向无权图的顶点数、边、源点和终点。程序用队列逐层扩展，记录访问顺序、距离与 predecessor，输出一条最短路径。',
      defaultLanguage: 'javascript',
      stdin: '6 7\n1 2\n1 3\n2 4\n3 4\n4 5\n2 6\n6 5\n1 5\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const [vertexCount, edgeCount] = lines[0].split(/\s+/).map(Number);
const graph = Array.from({ length: vertexCount + 1 }, () => []);

for (let i = 1; i <= edgeCount; i += 1) {
  const [u, v] = lines[i].split(/\s+/).map(Number);
  graph[u].push(v);
  graph[v].push(u);
}
for (const neighbors of graph) neighbors.sort((a, b) => a - b);
const [source, target] = lines[edgeCount + 1].split(/\s+/).map(Number);

const distance = new Array(vertexCount + 1).fill(-1);
const previous = new Array(vertexCount + 1).fill(0);
const queue = [source];
distance[source] = 0;
const order = [];

for (let head = 0; head < queue.length; head += 1) {
  const node = queue[head];
  order.push(node);
  for (const next of graph[node]) {
    if (distance[next] !== -1) continue;
    distance[next] = distance[node] + 1;
    previous[next] = node;
    queue.push(next);
  }
}

const path = [];
for (let node = target; node !== 0; node = previous[node]) {
  path.push(node);
  if (node === source) break;
}
path.reverse();

console.log("visit_order=" + order.join(","));
console.log("distance=" + distance[target]);
console.log("path=" + path.join("->"));
assert.deepEqual(order, [1, 2, 3, 4, 6, 5]);
assert.equal(distance[target], 3);
assert.deepEqual(path, [1, 2, 4, 5]);
`,
      },
      checkpoint:
        'BFS 顺序必须是 1,2,3,4,6,5，到 5 的距离为 3，输出路径 1->2->4->5。队列保证第一次发现某点时的距离已经最短；若把队列换成栈，虽然仍能访问全部点，却不一定得到最短边数路径。',
    },
    apply: {
      id: 'algo-final-a-dfs-components',
      title: '独立实践：迭代 DFS、回边与连通分量',
      brief:
        '输入无向图的顶点和边。程序用显式栈执行三色 DFS，记录发现/完成序号，检测回边所对应的环，并输出每个连通分量。',
      defaultLanguage: 'javascript',
      stdin: '8 5\n1 2\n2 3\n3 1\n4 5\n6 7\n',
      starterCode: {
        javascript: String.raw`const fs = require("node:fs");
const assert = require("node:assert/strict");
const lines = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
const [vertexCount, edgeCount] = lines[0].split(/\s+/).map(Number);
const graph = Array.from({ length: vertexCount + 1 }, () => []);

for (let i = 1; i <= edgeCount; i += 1) {
  const [u, v] = lines[i].split(/\s+/).map(Number);
  graph[u].push(v);
  graph[v].push(u);
}
for (const neighbors of graph) neighbors.sort((a, b) => a - b);

const color = new Array(vertexCount + 1).fill(0);
const discovery = new Array(vertexCount + 1).fill(0);
const finish = new Array(vertexCount + 1).fill(0);
const components = [];
let clock = 0;
let hasCycle = false;

for (let start = 1; start <= vertexCount; start += 1) {
  if (color[start] !== 0) continue;
  const component = [];
  color[start] = 1;
  discovery[start] = ++clock;
  const stack = [{ node: start, parent: 0, next: 0 }];

  while (stack.length > 0) {
    const frame = stack.at(-1);
    component.push(frame.node);
    const neighbors = graph[frame.node];
    if (frame.next === neighbors.length) {
      color[frame.node] = 2;
      finish[frame.node] = ++clock;
      stack.pop();
      continue;
    }

    const next = neighbors[frame.next++];
    if (next === frame.parent) continue;
    if (color[next] === 1) {
      hasCycle = true;
    } else if (color[next] === 0) {
      color[next] = 1;
      discovery[next] = ++clock;
      stack.push({ node: next, parent: frame.node, next: 0 });
    }
  }
  components.push(component);
}

console.log("components=" + components.map((part) => "(" + part.join(",") + ")").join("|"));
console.log("has_cycle=" + hasCycle);
console.log("discovery=" + discovery.slice(1).join(","));
console.log("finish=" + finish.slice(1).join(","));
assert.equal(components.length, 4);
assert.deepEqual(components.map((part) => [...new Set(part)].sort()), [
  [1, 2, 3],
  [4, 5],
  [6, 7],
  [8],
]);
assert.equal(hasCycle, true);
assert(discovery.every((value, index) => index === 0 || value > 0));
assert(finish.every((value, index) => index === 0 || value > 0));
`,
      },
      checkpoint:
        '结果必须为 4 个连通分量：(1,2,3)、(4,5)、(6,7)、(8)，并检测到 1-2-3-1 的环。迭代 DFS 的栈帧保存 next 下标，等价于带回溯位置的递归调用；仅用普通 LIFO 却丢失帧，会重复访问或误判环。',
    },
  },

  'algorithms:算法与数据结构 · 图论、搜索与最短路：拓扑排序与循环依赖': {
    ...pythonRuntime,
    title: '依赖图代码台 · Kahn 队列与 DFS 三色拓扑',
    description:
      '先用入度队列得到合法构建顺序，再用 DFS 的灰/黑状态验环；独立实践会把非法回边定位到具体依赖，而不是只报告“有环”。',
    practice: {
      id: 'algo-final-a-kahn-topology',
      title: '跟做：用入度队列排出合法构建顺序',
      brief:
        '输入有向图的顶点数、边以及每条 u->v 依赖。程序维护入度与零入度最小堆，输出确定性拓扑序和每一步被释放的邻居。',
      defaultLanguage: 'python',
      stdin: '6 6\n1 2\n1 3\n2 4\n3 4\n4 5\n2 5\n',
      starterCode: {
        python: String.raw`import heapq
import sys


lines = sys.stdin.read().splitlines()
vertex_count, edge_count = map(int, lines[0].split())
graph = [[] for _ in range(vertex_count + 1)]
indegree = [0] * (vertex_count + 1)

for line in lines[1:1 + edge_count]:
    u, v = map(int, line.split())
    graph[u].append(v)
    indegree[v] += 1

ready = [node for node in range(1, vertex_count + 1) if indegree[node] == 0]
heapq.heapify(ready)
order = []
released_edges = []

while ready:
    node = heapq.heappop(ready)
    order.append(node)
    for neighbor in sorted(graph[node]):
        indegree[neighbor] -= 1
        released_edges.append((node, neighbor, indegree[neighbor]))
        if indegree[neighbor] == 0:
            heapq.heappush(ready, neighbor)

print("topological_order=" + ",".join(map(str, order)))
print("released_edges=" + str(released_edges))
assert order == [1, 2, 3, 4, 5, 6]
assert len(released_edges) == edge_count
assert all(degree == 0 for degree in indegree[1:])
`,
      },
      checkpoint:
        '最小堆让第三、第四步稳定选择 3 再 4，最终顺序为 1,2,3,4,5,6；孤立点 6 同样进入零入度队列。只有处理完所有顶点才说明无环，任何顶点处理数少于 n 都表示剩余子图中仍有循环依赖。',
    },
    apply: {
      id: 'algo-final-a-dfs-cycle-edge',
      title: '独立实践：三色 DFS 定位循环依赖回边',
      brief:
        '输入一组 u->v 依赖。程序递归 DFS，用白色未访问、灰色在栈、黑色已完成维护状态；遇到灰色邻居时报告对应回边，否则输出满足所有边的拓扑序。',
      defaultLanguage: 'python',
      stdin: '5 5\nbuild core\ncore api\nbuild ui\nui api\napi test\n',
      starterCode: {
        python: String.raw`import sys


lines = sys.stdin.read().splitlines()
vertex_count, edge_count = map(int, lines[0].split())
graph = {}
vertices = set()

for line in lines[1:1 + edge_count]:
    source, target = line.split()
    graph.setdefault(source, []).append(target)
    vertices.update((source, target))
    assert source != target

color = {node: 0 for node in vertices}
finished = []
back_edge = [None]


def visit(node):
    color[node] = 1
    for neighbor in sorted(graph.get(node, [])):
        if color[neighbor] == 1:
            back_edge[0] = (node, neighbor)
            return
        if color[neighbor] == 0:
            visit(neighbor)
            if back_edge[0] is not None:
                return
    color[node] = 2
    finished.append(node)


for node in sorted(vertices):
    if color[node] == 0:
        visit(node)
        if back_edge[0] is not None:
            break

order = list(reversed(finished))
print("topological_order=" + ",".join(order))
print("back_edge=" + str(back_edge[0]))

for source, targets in graph.items():
    for target in targets:
        assert order.index(source) < order.index(target)

demo_graph = {"api": ["core"], "core": ["db"], "db": ["api"]}
demo_color = {node: 0 for node in ("api", "core", "db")}
demo_back_edge = [None]


def demo_visit(node):
    demo_color[node] = 1
    for neighbor in demo_graph.get(node, []):
        if demo_color[neighbor] == 1:
            demo_back_edge[0] = (node, neighbor)
            return
        if demo_color[neighbor] == 0:
            demo_visit(neighbor)


demo_visit("api")
print("cycle_example=" + str(demo_back_edge[0]))
assert demo_back_edge[0] == ("db", "api")
assert order.index("build") < order.index("api")
assert order.index("api") < order.index("test")
`,
      },
      checkpoint:
        '正常依赖的输出必须满足 build 在 core/ui 前、core/ui 在 api 前、api 在 test 前。第二个示例找到回边 db->api，而只有从一条仍在递归栈中的灰色节点指出去的回边才构成环；指向黑色的交叉边不能误报为循环。',
    },
  },
};
