import type {
  LearningV2CuratedCoursePlan,
  LearningV2Subject,
} from './v2-types.js';
import { ALGORITHM_HANDWRITTEN_TOPIC_PLANS } from './algorithm-handwritten/index.js';
import { ALGORITHM_HANDWRITTEN_QUIZ } from './algorithm-quiz/index.js';

export type AlgorithmTrack = {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly story: string;
  readonly goal: string;
  readonly topics: readonly string[];
  readonly sources: readonly string[];
};

export type AlgorithmLesson = {
  readonly id: string;
  readonly trackId: string;
  readonly trackTitle: string;
  readonly title: string;
  readonly courseName: string;
  readonly minutes: number;
};

export const ALGORITHM_TRACKS: readonly AlgorithmTrack[] = [
  {
    id: 'A0',
    title: '复杂度、正确性与测量',
    note: '先学会判断算法是否正确、为什么快，以及快多少',
    story: '你接手一家小店的排班、库存和订单记录，先学会用一张表把“要处理多少东西”和“电脑大概要跑多久”说清楚。',
    goal: '用输入规模、不变量、最坏情况和基准测试建立可证明的算法判断。',
    topics: [
      '输入规模与大 O',
      '最坏、平均与摊还复杂度',
      '循环不变量与终止性',
      '递归式与主定理直觉',
      '空间复杂度与缓存局部性',
      '正确性证明与反例设计',
      '基准测试、预热与火焰图',
      '多语言实现的数值与内存边界',
    ],
    sources: [
      'CLRS Introduction to Algorithms. https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/',
      'Princeton Algorithms. https://algs4.cs.princeton.edu/home/',
      'OI Wiki 复杂度. https://oi-wiki.org/basic/complexity/',
    ],
  },
  {
    id: 'A1',
    title: '线性结构、哈希与窗口',
    note: '数组、链表、栈、队列、哈希和滑动窗口的题型主干',
    story: '你来到一座快递分拣站：包裹排队、最近一单优先、同一收件人合并，不同数据结构就是不同的分拣规则。',
    goal: '根据访问、插入、顺序和范围模式选择线性结构，并写出可验证的边界。',
    topics: [
      '动态数组、扩容和缓存局部性',
      '单链表、双链表与反转族',
      '栈、表达式与单调栈',
      '队列、双端队列与环形缓冲',
      '哈希冲突、扩容和键设计',
      '前缀和、差分与区间更新',
      '双指针、滑动窗口和去重',
      'Trie、字符串哈希与前缀查询',
    ],
    sources: [
      'OI Wiki 数据结构. https://oi-wiki.org/ds/',
      'CP-Algorithms String Processing. https://cp-algorithms.com/string/',
      'VisuAlgo Data Structures. https://visualgo.net/en/list',
    ],
  },
  {
    id: 'A2',
    title: '树、堆、排序与索引',
    note: '有序性、优先级、范围查询和数据库索引的共同基础',
    story: '你成为图书馆管理员，要把新书排架、快速找书、按优先级处理预约，还要让每次新增都不把整座馆重新整理一遍。',
    goal: '用树、堆和排序维护有序性，并能把复杂度结论落实到索引与查询。',
    topics: [
      '二叉树遍历与递归边界',
      'BST、搜索与删除',
      '平衡树与红黑树不变量',
      '堆、优先队列与 Top-K',
      '归并、快排、堆排和稳定性',
      '二分查找与答案空间二分',
      'B 树、LSM 与数据库索引',
      '线段树与 Fenwick 树',
    ],
    sources: [
      'CLRS Binary Search Trees and Heaps. https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/',
      'OI Wiki 树状数组. https://oi-wiki.org/ds/fenwick/',
      'VisuAlgo Binary Heap. https://visualgo.net/en/heap',
    ],
  },
  {
    id: 'A3',
    title: '图论、搜索与最短路',
    note: '依赖关系、状态空间、路径规划和网络拓扑',
    story: '你负责城市地铁与道路调度：换乘是边、站点是点，临时封路和最短时间会让同一张地图产生不同答案。',
    goal: '把问题建模成图，选择 BFS、DFS、拓扑、最短路或并查集并证明适用条件。',
    topics: [
      '邻接表、邻接矩阵与稀疏图',
      'BFS、DFS 和连通分量',
      '拓扑排序与循环依赖',
      'Dijkstra 与非负权最短路',
      'Bellman-Ford 与负环',
      '并查集与动态连通',
      '最小生成树与网络设计',
      '匹配、网络流与二分图直觉',
    ],
    sources: [
      'CP-Algorithms Graph Theory. https://cp-algorithms.com/graph/',
      'OI Wiki 图论. https://oi-wiki.org/graph/',
      'VisuAlgo Graph Traversal. https://visualgo.net/en/dfsbfs',
    ],
  },
  {
    id: 'A4',
    title: '动态规划、贪心与回溯',
    note: '从子问题、状态和选择证明算法设计',
    story: '你带一支轻装旅行队穿过陌生城市，每天只能装有限物资、选择一条路线，还得解释为什么当前选择不会把后面堵死。',
    goal: '写出状态、转移、初值、遍历顺序和恢复路径，能判断贪心何时失效。',
    topics: [
      '递归、记忆化与重叠子问题',
      '线性 DP 与序列决策',
      '区间 DP 与合并顺序',
      '背包、配额与资源分配',
      '树形 DP 与子树状态',
      '状态压缩与集合 DP',
      '数位 DP 与概率期望',
      '回溯、剪枝和组合搜索',
    ],
    sources: [
      'OI Wiki 动态规划. https://oi-wiki.org/dp/',
      'CP-Algorithms Dynamic Programming. https://cp-algorithms.com/dynamic_programming/',
      'USACO Guide DP. https://usaco.guide/gold/dp',
    ],
  },
  {
    id: 'A5',
    title: '高级数据结构与竞赛专题',
    note: '面向竞赛与高难面试的区间、树上和离线技巧',
    story: '比赛教练递给你一个百宝箱：平时不急着打开每个工具，先看题目的时间限制和操作模式，再挑最轻的那一件。',
    goal: '识别需要高级结构的问题，能比较常数、复杂度和实现风险。',
    topics: [
      '带懒标记的线段树',
      'Fenwick 求第 K 小与二维前缀',
      '单调队列优化与滑动最值',
      '矩阵快速幂与线性递推',
      'Meet-in-the-Middle 与折半枚举',
      '分块、莫队与离线查询',
      'LCA、倍增与树上差分',
      '对拍、随机化和竞赛策略',
    ],
    sources: [
      'OI Wiki 线段树. https://oi-wiki.org/ds/seg/',
      'OI Wiki 莫队. https://oi-wiki.org/misc/modifiable-mo-algo/',
      'Codeforces Problemset. https://codeforces.com/problemset',
    ],
  },
  {
    id: 'A6',
    title: '面试高频、冷门原型与变形',
    note: '不是背题号，而是识别同一题族的模型变化',
    story: '你参加一场“换装面试”：面试官不断更换业务故事，但数据结构、状态和操作模式可能还是同一套。',
    goal: '把热门题、经典题、冷门模型和竞赛技巧转成可迁移的解题模板。',
    topics: [
      '数组与字符串高频题族',
      '链表、树与堆的面试变形',
      '滑动窗口与双指针题族',
      '图搜索与最短路场景识别',
      'DP 状态设计与降维',
      '冷门模型、构造与交互题',
      '复杂度反推与输入规模判断',
      '代码表达、调试与面试复盘',
    ],
    sources: [
      'LeetCode 题库. https://leetcode.cn/problemset/',
      'NowCoder 在线编程. https://www.nowcoder.com/exam/oj',
      'CSES Problem Set. https://cses.fi/problemset/',
    ],
  },
  {
    id: 'A7',
    title: '工程算法、性能与数据规模',
    note: '把算法从判题器带进缓存、检索、调度和分布式系统',
    story: '线上大促开始后，缓存、队列、分片和监控同时报警；你要在真实流量里选择算法、做取舍并留下可回滚证据。',
    goal: '在真实数据和资源约束下比较吞吐、延迟、内存与可维护性。',
    topics: [
      'LRU、LFU 与缓存淘汰',
      '优先队列、调度与任务分配',
      '倒排索引、检索与排序服务',
      '去重、布隆过滤器与近似计数',
      '一致性哈希、分片与热点倾斜',
      '数据规模、内存预算与流式处理',
      '性能剖析、回归与容量实验',
      '算法工程毕业项目与答辩',
    ],
    sources: [
      'Google SRE Book. https://sre.google/sre-book/table-of-contents/',
      'Kattis Problem Archive. https://open.kattis.com/',
      'AcWing 算法基础. https://www.acwing.com/problem/',
    ],
  },
] as const;

export const ALGORITHM_LESSONS: readonly AlgorithmLesson[] = ALGORITHM_TRACKS.flatMap(
  (track) => track.topics.map((title, index) => {
    const courseName = `算法与数据结构 · ${track.title}：${title}`;
    return {
      id: `${track.id.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
      trackId: track.id,
      trackTitle: track.title,
      title,
      courseName,
      minutes: 34 + index * 2,
    };
  }),
);

function algorithmPlan(track: AlgorithmTrack, lesson: AlgorithmLesson): LearningV2CuratedCoursePlan {
  const topic = lesson.title;
  const sourceText = track.sources.join('；');
  return {
    prerequisite: track.id === 'A0'
      ? '会一门语言的变量、函数、循环和基础测试；不要求竞赛经历。'
      : `先完成“${track.title}”前一课，保留手算过程、代码、反例和复杂度记录。`,
    plainLanguageGoal: `学完后能从输入规模反推可行复杂度，用“${topic}”建立模型、写出正确实现，并用反例和基准证明它没有偷换条件。`,
    guidedPractice: `为“${topic}”选择两个规模和三种边界输入，先手算，再实现，再记录调用次数、耗时、内存与失败结果。`,
    independentPractice: `完成一道原创变体和一道平台同型题，提交代码、复杂度说明、反例、修复记录与可迁移模板。`,
    commonErrors: [
      `只记“${topic}”的代码模板，不从输入规模、数据顺序和更新模式推导是否适用。`,
      `只测样例，没有覆盖空输入、重复值、极值、退化结构和最坏操作序列。`,
      `复杂度结论与实际实现不一致，例如循环嵌套、隐式复制或哈希退化被忽略。`,
    ],
    sourceRefs: [
      ...track.sources,
      'MIT 6.006 Introduction to Algorithms. https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
    ],
    steps: [
      {
        title: '拆题意与输入规模',
        body: `先把“${topic}”放进一个小故事：${track.story} 现在只观察故事里的数据、动作和目标，不急着写代码。列出输入类型、输出要求、是否在线、是否允许修改、是否有重复值和更新操作，再根据规模估计可接受复杂度：${track.goal}。`,
        note: '输入规模决定算法上限',
        objective: `能用自己的话复述“${topic}”的输入、输出、约束和不能违反的条件。`,
        practice: '写出三组数据：最小合法输入、业务常见输入、最坏输入，并标出预期输出。',
        checkpoint: '如果删掉一个约束，原算法是否仍正确？请用一个最小反例说明失效条件，并记录输入、预期答案和实际答案。',
      },
      {
        title: '手算、追踪与不变量',
        body: `用表格或图手动执行“${topic}”的前 8 步，记录每一步读取了哪些状态、写入了什么、为何可以丢弃其他可能。找出循环不变量和终止条件，不能靠代码跑通后才补解释。`,
        note: '手算暴露边界和状态错误',
        objective: '能在不写代码的情况下追踪状态，并指出第一次可能出错的位置。',
        practice: '至少手算一个重复值案例、一个空结构案例和一个会退化的案例。',
        checkpoint: '你的不变量在初始、每次迭代和结束时分别为什么成立？逐条写出证据，并指出第一次可能被破坏的位置。',
      },
      {
        title: '从模型到可读实现',
        body: `实现“${topic}”时先固定接口、索引含义、空值策略和返回类型，再处理主循环。变量名要表达数据含义；不能为了缩短代码把边界、错误分支和资源释放藏进副作用。`,
        note: '索引语义和边界先写清',
        objective: '能写出可调试、可测试的实现，并为每个分支给出一个输入。',
        practice: '先写伪代码和复杂度，再写正式代码；保留一次故意 bug 的定位与修复。',
        checkpoint: '如果输入规模扩大十倍，哪一行最先成为瓶颈？用计数器、profile 或基准数据确认，不要只凭代码外观猜测。',
      },
      {
        title: '题型族与迁移',
        body: `把“${topic}”与相邻题族比较：哪些题需要哈希、栈、树、图或 DP；哪些题只是换了业务外壳。记录触发词、状态表示和不可用条件，建立“看到什么条件选什么方法”的索引。`,
        note: '题型识别不是背题号',
        objective: '能识别同型题和假同型题，并说明迁移时需要替换的变量。',
        practice: '从题库中选热门、经典、冷门、竞赛各一题，写出题型判断与首次尝试策略。',
        checkpoint: '举出一个表面相似但不能使用当前方法的最小反例，说明哪个前提不成立，以及你会改用什么题型模型。',
      },
      {
        title: '复杂度、反例与优化',
        body: `为“${topic}”分别分析时间、空间、最坏情况和摊还成本。优化前先用计数器、profile 或基准测试证明瓶颈；优化后重跑同一输入、边界与反例，避免用更复杂结构换取未经证明的速度。`,
        note: '先测瓶颈，再改结构',
        objective: '能给出复杂度上界、实际瓶颈和一次可比较的优化记录。',
        practice: `对“${topic}”做一次基线、一次优化、一次回归，并比较不同数据规模的曲线。`,
        checkpoint: '当前复杂度结论在什么数据分布下不成立？过期缓存、并发访问或在线更新会怎样改变判断，请给出证据。',
      },
      {
        title: '工程与竞赛验收',
        body: `最后把“${topic}”放进真实边界：错误输入、超大流量、内存限制、并发更新或在线查询。竞赛场景要求对拍和构造反例，工程场景还要求日志、监控、回滚和可维护性。来源包括：${sourceText}。`,
        note: '正确、可测、可解释、可维护',
        objective: '能让另一名工程师按文档复现实验，并解释算法在生产中的代价。',
        practice: '提交代码、复杂度表、反例集、基准图、失败复盘和一页算法选型说明。',
        checkpoint: '如果数据规模再涨十倍、内存减半或输入改为在线，你会怎样改？写出新的资源预算、替代结构和需要重跑的反例。',
      },
    ],
  };
}

// 手写教案覆盖模板：键为课程主题（lesson.title），与 algorithm-handwritten/*.ts 的键一致。
// 任何主题缺手写条目时回退模板 —— algorithm-handwritten.test.ts 强制 64 门全覆盖。
const templatePlans: Readonly<Record<string, LearningV2CuratedCoursePlan>> =
  Object.fromEntries(ALGORITHM_LESSONS.map((lesson) => {
    const track = ALGORITHM_TRACKS.find((item) => item.id === lesson.trackId)!;
    return [`algorithms:${lesson.courseName}`, algorithmPlan(track, lesson)];
  }));

const handwrittenPlans: Record<string, LearningV2CuratedCoursePlan> = {};
for (const lesson of ALGORITHM_LESSONS) {
  const plan = ALGORITHM_HANDWRITTEN_TOPIC_PLANS[lesson.title];
  if (plan) {
    const quiz = ALGORITHM_HANDWRITTEN_QUIZ[lesson.title];
    handwrittenPlans[`algorithms:${lesson.courseName}`] = quiz ? { ...plan, quiz } : plan;
  }
}

export const ALGORITHM_CURATED_PLANS: Readonly<Record<string, LearningV2CuratedCoursePlan>> = {
  ...templatePlans,
  ...handwrittenPlans,
};

const firstCourse = ALGORITHM_LESSONS[0];
const firstPlan = ALGORITHM_CURATED_PLANS[`algorithms:${firstCourse.courseName}`];

export const ALGORITHM_SUBJECT: LearningV2Subject = {
  key: 'algorithms',
  name: '算法与数据结构',
  short: '算法',
  accent: '#0f766e',
  tint: '#ecfdf5',
  line: '跟着分拣站、图书馆、地铁、旅行队和大促现场的故事，从画图手算开始，一步一步把算法变成会用的工具。',
  current: {
    stage: 'A0 · 复杂度、正确性与测量',
    course: firstCourse.courseName,
    step: '模型',
    progress: 0,
    minutes: firstCourse.minutes,
  },
  stats: [
    [String(ALGORITHM_TRACKS.length), '学习阶段'],
    [String(ALGORITHM_LESSONS.length), '系统课程'],
    ['4320', '实战变体'],
  ],
  tracks: ALGORITHM_TRACKS.map((track) => ({
    name: `${track.id} · ${track.title}`,
    note: track.note,
    courses: ALGORITHM_LESSONS
      .filter((lesson) => lesson.trackId === track.id)
      .map((lesson) => ({
        name: lesson.courseName,
        meta: `${lesson.minutes} 分钟`,
      })),
  })),
  lesson: {
    labels: ['模型', '手算', '实现', '题型', '证明', '迁移'],
    eyebrow: '算法与数据结构 · 故事闯关 · 每题只走一小步',
    title: firstCourse.courseName,
    goal: firstPlan.plainLanguageGoal,
    minutes: firstCourse.minutes,
    steps: firstPlan.steps,
  },
  practice: {
    prompt: '输入规模为 n，内存只有 O(1) 额外空间，并需要在线回答区间最值。最先应检查什么？',
    options: [
      '数据是否只追加、是否需要撤销，以及单调结构与更新方式是否匹配',
      '直接写一个四重循环',
      '把所有输入复制到哈希表后不再检查空间',
    ],
    answer: 0,
    explanation: '算法选型先看操作模型和资源约束；在 O(1) 空间限制下，不能默认复制数据或维护可增长结构。',
    focus: '复杂度与操作模型',
  },
  review: {
    due: 6,
    mastery: 0,
    items: ['最坏与摊还复杂度', '循环不变量', '哈希退化', '二分边界', 'DP 状态定义', '反例设计'],
  },
  coach: {
    opening: '先用一句话把题目讲成故事，我会帮你找角色、动作和数据，再一起猜方法；不会一上来就甩公式。',
    prompts: [
      '从数据规模反推可行算法',
      '陪我做一道图论题的手算追踪',
      '审查 DP 状态和转移',
      '为竞赛题设计对拍与反例',
    ],
  },
  book: {
    shelf: ['CLRS 算法导论', '算法（第 4 版）', 'OI Wiki'],
    title: '算法设计与正确性手册',
    unit: '从暴力解到可证明优化',
    kind: '算法原典',
    original: 'Model -> Invariant -> Algorithm -> Bound -> Counterexample',
    translation: '先建模并写清不变量，再选择算法，给出复杂度上界，最后用反例和基准验证结论。',
    notes: [
      { term: '不变量', text: '每次迭代前后都必须成立，用来连接状态与最终答案。' },
      { term: '复杂度', text: '不仅看代码循环，还要看数据结构、复制、哈希退化和内存层级。' },
      { term: '反例', text: '一个有效反例比十个样例更能暴露算法适用条件。' },
    ],
    annotation: '算法能力不是背题号，而是先看懂故事里的对象和动作，再把它们画成表、树或图；方法是在故事里长出来的。',
    source: 'CLRS、Princeton Algorithms、OI Wiki、CP-Algorithms 与公开在线题库。',
  },
  studio: {
    type: '算法实验与题型实战',
    title: '从手算、伪代码到复杂度证据',
    task: '围绕当前算法主题完成模型、手算、实现、反例、基准和迁移练习。',
    steps: ['建模', '手算', '实现', '反例', '基准', '迁移'],
    output: '代码、状态表、复杂度证明、反例集、基准图和题型复盘',
    boundary: '只在本地环境和公开授权题库练习；不抓取、不复制受版权保护的原题全文。',
    features: ['原创变体', '热门题', '经典题', '冷门模型', '竞赛专题', '工程基准'],
  },
};
