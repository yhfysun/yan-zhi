export type AlgorithmProblemCategory = 'hot' | 'classic' | 'contest' | 'cold' | 'engineering';
export type AlgorithmProblemDifficulty = '入门' | '进阶' | '困难' | '竞赛';

export type AlgorithmResourceSite = {
  readonly name: string;
  readonly url: string;
  readonly focus: string;
  readonly useFor: string;
};

export type AlgorithmProblem = {
  readonly id: string;
  readonly title: string;
  readonly familyId: string;
  readonly familyTitle: string;
  readonly trackId: string;
  readonly category: AlgorithmProblemCategory;
  readonly categoryLabel: string;
  readonly difficulty: AlgorithmProblemDifficulty;
  readonly tags: readonly string[];
  readonly story: string;
  readonly objective: string;
  readonly input: string;
  readonly output: string;
  readonly model: string;
  readonly approach: string;
  readonly starterPseudo: readonly string[];
  readonly hints: readonly string[];
  readonly complexity: string;
  readonly pitfalls: readonly string[];
  readonly variant: string;
  readonly checklist: readonly string[];
  readonly flagship: boolean;
  readonly sourceNote: string;
};

export const ALGORITHM_CATEGORY_LABELS: Readonly<Record<AlgorithmProblemCategory, string>> = {
  hot: '热门题',
  classic: '经典题',
  contest: '竞赛题',
  cold: '冷门模型',
  engineering: '工程算法',
};

export const ALGORITHM_DIFFICULTIES: readonly AlgorithmProblemDifficulty[] = [
  '入门',
  '进阶',
  '困难',
  '竞赛',
];

export const ALGORITHM_RESOURCE_SITES: readonly AlgorithmResourceSite[] = [
  {
    name: 'LeetCode 中国',
    url: 'https://leetcode.cn/problemset/',
    focus: '面试高频、题单与周赛',
    useFor: '按标签做高频题和面试题族复盘，不背题号。',
  },
  {
    name: '洛谷',
    url: 'https://www.luogu.com.cn/problem/list',
    focus: '竞赛题单、OI 专题与难度梯度',
    useFor: '按算法标签做省选、NOI 和基础赛题。',
  },
  {
    name: 'Codeforces',
    url: 'https://codeforces.com/problemset',
    focus: 'Div. 2/3/4 与全球竞赛',
    useFor: '训练构造、贪心、图论和限时比赛节奏。',
  },
  {
    name: 'AtCoder',
    url: 'https://atcoder.jp/contests/',
    focus: 'ABC/ARC/AGC 题风',
    useFor: '训练思维、实现速度和数学建模。',
  },
  {
    name: 'CSES Problem Set',
    url: 'https://cses.fi/problemset/',
    focus: '系统算法题集',
    useFor: '按专题做完整题单，覆盖 DP、图和树。',
  },
  {
    name: 'USACO Guide',
    url: 'https://usaco.guide/',
    focus: '竞赛路线与分级专题',
    useFor: '从 Bronze 到 Platinum 查找前置和练习路线。',
  },
  {
    name: 'OI Wiki',
    url: 'https://oi-wiki.org/',
    focus: '中文算法百科与实现细节',
    useFor: '核对定理、模板、复杂度和边界。',
  },
  {
    name: 'CP-Algorithms',
    url: 'https://cp-algorithms.com/',
    focus: '竞赛算法证明与代码',
    useFor: '查图论、字符串、数论和高级结构。',
  },
  {
    name: 'VisuAlgo',
    url: 'https://visualgo.net/',
    focus: '算法可视化',
    useFor: '观察树、图、排序和 DP 的状态变化。',
  },
  {
    name: 'Kattis',
    url: 'https://open.kattis.com/',
    focus: '工程与 ICPC 风格题',
    useFor: '训练输入解析、实现稳定性和组合问题。',
  },
  {
    name: 'NowCoder',
    url: 'https://www.nowcoder.com/exam/oj',
    focus: '中文校招与在线编程',
    useFor: '做企业笔试题和基础数据结构专项。',
  },
  {
    name: 'AcWing',
    url: 'https://www.acwing.com/problem/',
    focus: '基础课、提高课与算法模板',
    useFor: '按课程顺序完成模板题和进阶题单。',
  },
] as const;

type PatternFamily = {
  readonly id: string;
  readonly title: string;
  readonly short: string;
  readonly trackId: string;
  readonly tags: readonly string[];
  readonly objective: string;
  readonly model: string;
  readonly approach: readonly [string, string, string, string];
  readonly complexity: string;
  readonly pitfall: string;
};

const FAMILIES: readonly PatternFamily[] = [
  {
    id: 'two-pointers',
    title: '双指针与滑动窗口',
    short: '窗口',
    trackId: 'A1',
    tags: ['双指针', '滑动窗口', '单调性'],
    objective: '在有序性或区间单调性下维护一个连续或两端窗口',
    model: '先证明窗口移动时答案不会漏掉，再固定左右边界和收缩条件。',
    approach: [
      '用暴力枚举写基准，再标出哪些区间可以被单调性跳过。',
      '维护窗口内计数和当前最值，明确右扩、左缩的触发条件。',
      '处理重复值、负数和窗口多次收缩，给每一步不变量写说明。',
      '证明每个元素最多进出窗口常数次，并处理多约束窗口。',
    ],
    complexity: '目标 O(n) 或 O(n log n)，额外空间 O(1) 到 O(k)。',
    pitfall: '窗口不满足单调性时直接套模板会漏解。',
  },
  {
    id: 'hash-prefix',
    title: '哈希、前缀与区间计数',
    short: '哈希',
    trackId: 'A1',
    tags: ['哈希表', '前缀和', '差分'],
    objective: '用状态频次或前缀关系把区间枚举降为单次扫描',
    model: '把区间条件改写成两个前缀状态之间的关系，再维护频次或最近位置。',
    approach: [
      '先用两层循环确定需要维护的前缀或频次。',
      '设计稳定键，处理重复值、空区间和键冲突。',
      '处理负数、溢出、取模和多条件计数，验证键是否可逆。',
      '用概率哈希或离线离散化控制冲突与内存。',
    ],
    complexity: '目标平均 O(n)，内存 O(k)；哈希退化时要说明最坏情况。',
    pitfall: '哈希键相同不代表业务状态相同。',
  },
  {
    id: 'stack-queue',
    title: '栈、队列与单调结构',
    short: '栈队',
    trackId: 'A1',
    tags: ['栈', '队列', '单调栈', '单调队列'],
    objective: '用后进先出、先进先出或单调性维护尚未结算的候选',
    model: '明确元素何时进入结构、何时被弹出，以及弹出后由谁结算答案。',
    approach: [
      '用暴力找最近更大、更小或过期元素，再抽象结构操作。',
      '为每个元素记录位置、值和结算时机，保持结构单调。',
      '处理相等元素、循环数组、懒删除和批量过期。',
      '证明每个元素只进入和离开一次，并处理在线更新。',
    ],
    complexity: '目标 O(n)，队列实现需避免数组头删除造成 O(n) 移动。',
    pitfall: '相等元素使用大于还是大于等于会改变答案归属。',
  },
  {
    id: 'binary-search',
    title: '二分、边界与答案空间',
    short: '二分',
    trackId: 'A2',
    tags: ['二分', '边界', '单调性', '答案二分'],
    objective: '利用有序性、单调谓词或可验证答案寻找第一条可行边界',
    model: '把问题写成单调布尔谓词，定义闭区间和终止时 left/right 的含义。',
    approach: [
      '从线性扫描和样例中找出单调谓词与目标边界。',
      '明确区间开闭、mid 取整和答案保存位置。',
      '处理重复边界、空数组、整数溢出和不可行答案。',
      '设计答案空间验证器，处理离散、浮点和多峰反例。',
    ],
    complexity: '目标 O(log n) 次谓词调用，谓词成本需要单独计算。',
    pitfall: '循环能结束不代表循环结束后下标仍表示目标边界。',
  },
  {
    id: 'tree-heap',
    title: '树、堆与有序查询',
    short: '树堆',
    trackId: 'A2',
    tags: ['树', '堆', '排序', '索引'],
    objective: '维护层级、优先级、范围或第 K 个有序元素',
    model: '选择树或堆前先确定查询、更新和删除比例，再定义节点维护的聚合量。',
    approach: [
      '用递归或遍历建立父子关系，先写空树和叶节点。',
      '维护子树大小、最值、和等聚合量，处理重复键。',
      '处理退化树、删除根节点、第 K 小和范围覆盖。',
      '比较平衡树、线段树与 Fenwick 的常数和实现风险。',
    ],
    complexity: '目标单次操作 O(log n)，遍历 O(n)，建树需说明排序或堆化成本。',
    pitfall: '递归深度可能超过数据高度，迭代写法也要处理父节点更新。',
  },
  {
    id: 'graph-search',
    title: '图搜索与最短路',
    short: '图搜索',
    trackId: 'A3',
    tags: ['图', 'BFS', 'DFS', '最短路'],
    objective: '把依赖、状态或网络建模成图，选择正确的搜索与距离算法',
    model: '先确定顶点、边、方向、权重和不可达语义，再选择 BFS、拓扑或最短路。',
    approach: [
      '用邻接表画出小图，手动执行 BFS/DFS 并记录访问状态。',
      '区分访问、入队、出队和完成状态，处理重复边。',
      '处理负权、环、多源、字典序和路径恢复。',
      '比较 Dijkstra、Bellman-Ford 和分层图，给出适用证明。',
    ],
    complexity: 'BFS/DFS 目标 O(V+E)，Dijkstra 目标 O((V+E)logV)。',
    pitfall: '把无权图的最短边数当成带权最短路，会得到错误答案。',
  },
  {
    id: 'union-find',
    title: '并查集与动态连通',
    short: '并查集',
    trackId: 'A3',
    tags: ['并查集', '连通性', '最小生成树'],
    objective: '在增量合并或离线操作中维护连通块和聚合信息',
    model: '定义代表元、合并方向和路径压缩后仍需维护的集合属性。',
    approach: [
      '先枚举每次合并后需要回答的连通问题。',
      '实现 find/union、路径压缩和按秩合并，记录连通块大小。',
      '处理带权边、删除操作和合并不满足交换律的情况。',
      '结合 Kruskal、离线倒序或可撤销并查集。',
    ],
    complexity: '目标近似 O(α(n)) 均摊，查询次数和排序成本需另算。',
    pitfall: '路径压缩后仍直接读取非根节点聚合值会得到旧状态。',
  },
  {
    id: 'dynamic-programming',
    title: '动态规划与状态设计',
    short: 'DP',
    trackId: 'A4',
    tags: ['动态规划', '状态', '转移', '背包'],
    objective: '把重叠子问题和决策过程压缩成可递推的状态',
    model: '先定义状态含义、初值、转移和遍历顺序，再讨论空间压缩与恢复方案。',
    approach: [
      '用递归枚举列出所有选择，找到重复子问题和边界。',
      '写出状态表和转移，逐个验证不重不漏。',
      '处理循环依赖、正负收益、区间合并和路径恢复。',
      '做状态压缩、单调优化或矩阵快速幂并证明等价。',
    ],
    complexity: '目标由状态数乘以单次转移成本决定，必须同时报告空间。',
    pitfall: '状态含义没有闭包，转移会丢失影响后续决策的信息。',
  },
  {
    id: 'greedy-backtracking',
    title: '贪心、回溯与构造',
    short: '贪心',
    trackId: 'A4',
    tags: ['贪心', '回溯', '剪枝', '构造'],
    objective: '在局部选择、搜索树或构造规则中找到可证明的全局解',
    model: '贪心必须给交换论证，回溯必须定义选择、约束、目标和剪枝边界。',
    approach: [
      '从全部可行解中观察局部选择，先找反例再尝试贪心。',
      '实现搜索树的路径、选择集合和撤销操作。',
      '处理相同元素、重复组合、构造无解和字典序要求。',
      '用交换论证、下界或构造不变量证明最优性。',
    ],
    complexity: '回溯需给出搜索树规模；贪心需证明排序或单次扫描成本。',
    pitfall: '样例最优不代表贪心选择可交换。',
  },
  {
    id: 'advanced-structures',
    title: '高级结构与离线技巧',
    short: '高级',
    trackId: 'A5',
    tags: ['线段树', 'Fenwick', '分块', '离线'],
    objective: '在区间更新、范围查询或大量离线问题中控制复杂度',
    model: '先确定操作代数、结合律、懒标记传播和查询顺序，再选择结构。',
    approach: [
      '写出朴素更新和查询，确认区间可分解。',
      '实现 push/pull 或离线排序，处理边界和单位元素。',
      '处理多标记组合、离散化和内存上限。',
      '比较分块、莫队和树套树的实现风险与常数。',
    ],
    complexity: '常见目标 O(log n) 查询；高级结构必须报告常数和内存。',
    pitfall: '标记组合顺序错误会在多次更新后才暴露。',
  },
  {
    id: 'string-automaton',
    title: '字符串、Trie 与自动机',
    short: '字符串',
    trackId: 'A6',
    tags: ['字符串', 'Trie', 'KMP', '自动机'],
    objective: '在文本、模式、前缀和编辑关系中定位可复用结构',
    model: '先明确字符集、模式数量、在线/离线和是否允许重叠，再选择哈希、Trie 或自动机。',
    approach: [
      '用朴素匹配建立基准并记录所有失败位置。',
      '构造前缀函数、Trie 节点或失败链接，处理空串和重复模式。',
      '处理大小写、Unicode、哈希冲突和大量模式。',
      '结合 AC 自动机、后缀结构或滚动哈希做批处理。',
    ],
    complexity: '目标 O(n+m) 或 O(n log n)，字符集和模式数会影响空间。',
    pitfall: '按字节处理 Unicode 会破坏字符边界。',
  },
  {
    id: 'engineering-algorithms',
    title: '工程算法、资源与近似',
    short: '工程',
    trackId: 'A7',
    tags: ['缓存', '调度', '分片', '性能'],
    objective: '在真实吞吐、内存、热点和故障约束下选择算法',
    model: '把资源预算、更新频率、数据分布和失败恢复写进目标函数，不能只追求理论复杂度。',
    approach: [
      '建立基线指标和最小可复现负载，确认真实瓶颈。',
      '实现数据结构并记录吞吐、P99、内存和错误率。',
      '处理热点倾斜、冷启动、抖动和无界内存增长。',
      '比较精确与近似、预计算与在线计算的业务代价。',
    ],
    complexity: '目标以资源预算和实测曲线表达，不只用大 O 代替工程结论。',
    pitfall: '忽略数据分布和常数，会让理论更优的算法在线下变慢。',
  },
] as const;

const CONTEXTS = [
  {
    scene: '订单流水',
    title: '订单流水',
    story: '你是夜班结算员，桌上不断送来订单。老板要你在关店前找出最值得先处理的几单，而且不能漏掉退款和重复提交。',
    input: '给定按时间追加的订单记录，每条包含编号、金额、状态和若干标签',
    variation: '订单状态会重复出现，金额可能为负',
  },
  {
    scene: '社交关系',
    title: '社交关系',
    story: '你负责组织一场社区活动，每个人带来一组好友关系。你需要判断谁和谁能坐在一起、哪些邀请会形成绕圈的关系。',
    input: '给定用户关系边、时间戳和可见性标记，关系会动态增加',
    variation: '图中可能出现重复边、孤立点和环',
  },
  {
    scene: '文件版本',
    title: '文件版本',
    story: '你是团队的文件管理员，每次保存都会留下一个新版本。大家总问“这份和三天前差在哪里”，你不能每次都从头翻。',
    input: '给定文件快照、父版本指针和变更块，需要回答历史与差异查询',
    variation: '版本树可能退化成链，变更块可能重叠',
  },
  {
    scene: '地图路径',
    title: '地图路径',
    story: '你是急救车调度员，城市里有些路临时封了。你要快速回答“从这里到那里最少要多久”，还要能说出实际路线。',
    input: '给定地点、道路、方向和通行成本，部分道路会临时关闭',
    variation: '存在不可达点、负收益或多目标路径',
  },
  {
    scene: '缓存请求',
    title: '缓存请求',
    story: '大促开始时，缓存空间突然只剩一半。你要决定哪些数据留下、哪些删除，并解释为什么热门对象不能因为一次冷启动就被赶走。',
    input: '给定请求序列、对象大小、过期时间和容量预算',
    variation: '请求有热点倾斜，对象会更新或删除',
  },
  {
    scene: '比赛评测',
    title: '比赛评测',
    story: '你坐在限时赛场上，题面故事换了三次，但数据规模从一千涨到一百万。你要先判断哪些老方法还能过，哪些必须换工具。',
    input: '给定多组输入规模、资源限制和在线询问，需要限时完成',
    variation: '边界包含极值、重复值、随机化和构造反例',
  },
] as const;

const CONSTRAINTS = [
  {
    title: '小规模暴力',
    input: 'n ≤ 1,000，允许 O(n²) 基线用于对拍',
    strategy: '先写可证明正确的暴力解，再找出可消除的重复计算',
    pitfall: '暴力解的边界与优化版必须完全一致',
  },
  {
    title: '单次大规模',
    input: 'n ≤ 100,000，总时间预算 1 秒',
    strategy: '目标 O(n log n) 或 O(n)，必须明确排序和哈希最坏成本',
    pitfall: '隐式复制、递归过深和哈希退化会让理论复杂度失真',
  },
  {
    title: '流式数据',
    input: 'n ≤ 1,000,000，内存 64 MB，数据一次到达',
    strategy: '保持 O(1) 到 O(k) 状态，并证明旧数据之后不会再影响答案',
    pitfall: '需要回溯或删除的状态不能假装可流式处理',
  },
  {
    title: '混合更新',
    input: 'q ≤ 200,000 次查询和更新交错，单次延迟上限 50 ms',
    strategy: '区分更新成本和查询成本，必要时使用索引或离线重排',
    pitfall: '查询和更新的顺序改变会破坏懒维护结论',
  },
  {
    title: '资源紧张',
    input: '总内存 32 MB，输入和输出都可能达到 10^7 个元素',
    strategy: '压缩状态、避免对象爆炸，并记录实际内存而不是只算变量个数',
    pitfall: '语言运行时开销、哈希桶和递归栈常被漏算',
  },
] as const;

const REQUIREMENTS = [
  {
    title: '最优值',
    suffix: '最优值',
    output: '返回最优目标值；若不存在合法方案，返回给定哨兵值',
    strategy: '维护当前最优候选并证明更新条件不会漏掉并列解',
  },
  {
    title: '完整方案',
    suffix: '方案恢复',
    output: '返回一组字典序最小的最优方案，并说明如何验证合法性',
    strategy: '在状态中保留前驱或选择，最后按反向指针恢复路径',
  },
  {
    title: '方案计数',
    suffix: '方案计数',
    output: '返回合法方案数量，并按题目要求对 1_000_000_007 取模',
    strategy: '把计数与最优化分开，验证重复方案不会被多次统计',
  },
] as const;

const CATEGORIES: readonly AlgorithmProblemCategory[] = ['hot', 'classic', 'contest', 'cold', 'engineering'];

export const ALGORITHM_PRACTICE_PROBLEMS: readonly AlgorithmProblem[] =
  FAMILIES.flatMap((family, familyIndex) =>
    CONTEXTS.flatMap((context, contextIndex) =>
      CONSTRAINTS.flatMap((constraint, constraintIndex) =>
        ALGORITHM_DIFFICULTIES.flatMap((difficulty, difficultyIndex) =>
          REQUIREMENTS.flatMap((requirement, requirementIndex) => {
            const category = CATEGORIES[
              (contextIndex + constraintIndex + difficultyIndex + requirementIndex)
              % CATEGORIES.length
            ];
            const flagship = contextIndex === 0 && requirementIndex === 0;
            const id = `alg-${family.id}-${contextIndex + 1}-${constraintIndex + 1}-${difficultyIndex + 1}-${requirementIndex + 1}`;
            return [{
            id,
            title: `${context.title} · ${family.short}${requirement.suffix} · ${difficulty}`,
            familyId: family.id,
            familyTitle: family.title,
            trackId: family.trackId,
            category,
            categoryLabel: ALGORITHM_CATEGORY_LABELS[category],
            difficulty,
            tags: [...family.tags, constraint.title, requirement.title],
            story: `${context.story} 这次的要求不是“直接写答案”，而是先把这个故事里的对象、动作和约束讲清楚，再选择 ${family.title} 来帮忙。`,
            objective: `在${context.scene}场景中，${family.objective}，最终${requirement.title}。`,
            input: `${context.input}。${constraint.input}。${context.variation}。`,
            output: requirement.output,
            model: `${family.model} 当前操作模型是“${constraint.title}”，输入中的变量必须满足资源约束后再选结构。`,
            approach: `${family.approach[difficultyIndex]} ${constraint.strategy}；最后执行“${requirement.strategy}”。`,
            starterPseudo: [
              `读取并校验输入：${context.title} 的每条记录先统一字段和索引含义`,
              `写出暴力版：枚举${family.short}的所有候选，确认小数据下答案正确`,
              `加入${family.title}：${constraint.strategy}`,
              `输出前复验：${requirement.output}`,
            ],
            hints: [
              `先用“${context.scene}”画一个不超过 8 个元素的例子，手写每步状态。`,
              `根据${constraint.input}反推复杂度上限，列出不可能通过的结构。`,
              `主动构造一个让${family.pitfall}成立的输入，再修复算法。`,
            ],
            complexity: family.complexity,
            pitfalls: [
              family.pitfall,
              constraint.pitfall,
              '只检查最终答案，不验证中间状态、空输入和退化结构。',
            ],
            variant: `把“${context.variation}”中的条件反转，或要求在线回答；重新判断算法是否仍成立。`,
            checklist: [
              '输入、输出和索引语义是否写清',
              '不变量和终止条件是否能独立证明',
              '最坏、重复和退化输入是否有反例测试',
              '实现、复杂度和基准结果是否相互一致',
            ],
            flagship,
            sourceNote: '原创教学变体，不复制第三方题面；可在同型官方题库做迁移练习。',
            } satisfies AlgorithmProblem];
          }),
        ),
      ),
    ),
  );

export function getAlgorithmProblemById(id: string): AlgorithmProblem | undefined {
  return ALGORITHM_PRACTICE_PROBLEMS.find((problem) => problem.id === id);
}
