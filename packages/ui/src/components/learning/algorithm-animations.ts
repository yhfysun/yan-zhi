export type AlgorithmAnimationKind =
  | 'bars'
  | 'linked-list'
  | 'stack-queue'
  | 'tree'
  | 'graph'
  | 'heap'
  | 'hash'
  | 'grid'
  | 'window';

export type AlgorithmAnimationNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  parent?: string;
};

export type AlgorithmAnimationEdge = {
  from: string;
  to: string;
};

export type AlgorithmAnimationBucket = {
  index: number;
  values: string[];
};

export type AlgorithmAnimationFrame = {
  kind: AlgorithmAnimationKind;
  values?: number[];
  active?: number[];
  compare?: number[];
  done?: number[];
  doneNodes?: string[];
  left?: number;
  right?: number;
  mid?: number;
  target?: number;
  found?: boolean;
  nodes?: AlgorithmAnimationNode[];
  edges?: AlgorithmAnimationEdge[];
  next?: Record<string, string | null>;
  current?: string | null;
  previous?: string | null;
  stack?: number[];
  queue?: string[];
  focusArea?: 'stack' | 'queue';
  operation?: string;
  visited?: string[];
  frontier?: string[];
  activeNode?: string;
  buckets?: AlgorithmAnimationBucket[];
  activeBucket?: number;
  rows?: string[];
  columns?: string[];
  matrix?: Array<Array<number | null>>;
  activeCell?: [number, number];
  tokens?: string[];
  windowLeft?: number;
  windowRight?: number;
  windowLength?: number;
  bestLength?: number;
  duplicate?: boolean;
};

export type AlgorithmAnimationStep = {
  title: string;
  narration: string;
  invariant: string;
  frame: AlgorithmAnimationFrame;
};

export type AlgorithmAnimationScene = {
  id: string;
  title: string;
  category: string;
  story: string;
  question: string;
  complexity: string;
  code: string;
  steps: AlgorithmAnimationStep[];
};

function bubbleSortSteps(): AlgorithmAnimationStep[] {
  const values = [5, 1, 4, 2, 8];
  const steps: AlgorithmAnimationStep[] = [{
    title: '先把队伍摆出来',
    narration: '五个包裹贴着数字标签，目标是从小到大排队。先不急着交换，盯住相邻的一对。',
    invariant: '每一轮结束后，未排序区间里最大的包裹会站到最右边。',
    frame: {
      kind: 'bars',
      values: [...values],
      active: [],
      compare: [],
      done: [],
      operation: '初始队伍',
    },
  }];

  for (let end = values.length - 1; end > 0; end -= 1) {
    for (let index = 0; index < end; index += 1) {
      const done = Array.from({ length: values.length }, (_, item) => item).filter((item) => item > end);
      steps.push({
        title: `比较 ${values[index]} 和 ${values[index + 1]}`,
        narration: values[index] > values[index + 1]
          ? `${values[index]} 比 ${values[index + 1]} 大，左边的包裹应该往右挪。`
          : `${values[index]} 不大于 ${values[index + 1]}，这一对已经有序，继续向右看。`,
        invariant: '只比较相邻元素；前面的较小元素不会影响后面已经确认的位置。',
        frame: {
          kind: 'bars',
          values: [...values],
          active: [index, index + 1],
          compare: [index, index + 1],
          done,
          operation: '相邻比较',
        },
      });
      if (values[index] > values[index + 1]) {
        [values[index], values[index + 1]] = [values[index + 1], values[index]];
        steps.push({
          title: '交换这一对',
          narration: `交换后，${values[index]} 到了左边，${values[index + 1]} 到了右边。局部顺序恢复。`,
          invariant: '交换只修复当前相邻逆序，不改变这一对以外的元素。',
          frame: {
            kind: 'bars',
            values: [...values],
            active: [index, index + 1],
            compare: [index, index + 1],
            done,
            operation: '发生交换',
          },
        });
      }
    }
    steps.push({
      title: `第 ${values.length - end} 轮收尾`,
      narration: `${values[end]} 已经站到本轮终点，下一轮只处理它左边的包裹。`,
      invariant: '右侧的 done 区从大到小固定，之后不再参与比较。',
      frame: {
        kind: 'bars',
        values: [...values],
        active: [end],
        compare: [],
        done: Array.from({ length: values.length }, (_, item) => item).filter((item) => item >= end),
        operation: '固定本轮最大值',
      },
    });
  }
  steps.push({
    title: '整支队伍有序',
    narration: `最终顺序是 ${values.join(' → ')}。没有跳过任何一对相邻元素，所以结果可信。`,
    invariant: '排序完成的依据是所有元素都落在非递减位置，而不只是“看起来差不多”。',
    frame: {
      kind: 'bars',
      values: [...values],
      active: [],
      compare: [],
      done: values.map((_, index) => index),
      operation: '排序完成',
    },
  });
  return steps;
}

function binarySearchSteps(): AlgorithmAnimationStep[] {
  const values = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
  const target = 23;
  let left = 0;
  let right = values.length - 1;
  const steps: AlgorithmAnimationStep[] = [{
    title: '找出搜索区间',
    narration: `书架上的编号已经排好序，要找 ${target}。先盯住整段区间，而不是从头翻。`,
    invariant: '目标如果存在，只可能落在闭区间 [left, right] 里。',
    frame: {
      kind: 'bars',
      values,
      active: [],
      done: [],
      left,
      right,
      target,
      operation: '完整有序区间',
    },
  }];
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    steps.push({
      title: `看正中间：${values[mid]}`,
      narration: `中点编号是 ${mid}，值为 ${values[mid]}。它把候选区间切成两半。`,
      invariant: '中点左侧都更小，中点右侧都更大；比较一次就能排除一半。',
      frame: {
        kind: 'bars',
        values,
        active: [mid],
        done: values.map((_, index) => index).filter((index) => index < left || index > right),
        left,
        right,
        mid,
        target,
        operation: '取中点',
      },
    });
    if (values[mid] === target) {
      steps.push({
        title: '命中目标',
        narration: `${values[mid]} 正好等于 ${target}，搜索结束。`,
        invariant: '我们从未丢弃可能包含目标的那一半，因此命中位置就是答案。',
        frame: {
          kind: 'bars',
          values,
          active: [mid],
          done: values.map((_, index) => index).filter((index) => index !== mid),
          left,
          right,
          mid,
          target,
          found: true,
          operation: '查找成功',
        },
      });
      break;
    }
    if (values[mid] < target) {
      left = mid + 1;
      steps.push({
        title: '丢掉左半边',
        narration: `${values[mid]} 小于 ${target}，目标不会出现在它左侧，新区间从 mid + 1 开始。`,
        invariant: '已排除区间的所有值都小于目标，目标只能留在剩余区间。',
        frame: {
          kind: 'bars',
          values,
          active: [],
          done: values.map((_, index) => index).filter((index) => index < left || index > right),
          left,
          right,
          target,
          operation: '收缩左边界',
        },
      });
    } else {
      right = mid - 1;
      steps.push({
        title: '丢掉右半边',
        narration: `${values[mid]} 大于 ${target}，目标不会出现在它右侧，新区间到 mid - 1 结束。`,
        invariant: '已排除区间的所有值都大于目标，目标只能留在剩余区间。',
        frame: {
          kind: 'bars',
          values,
          active: [],
          done: values.map((_, index) => index).filter((index) => index < left || index > right),
          left,
          right,
          target,
          operation: '收缩右边界',
        },
      });
    }
  }
  return steps;
}

function linkedListSteps(): AlgorithmAnimationStep[] {
  const nodes = [
    { id: 'A', label: '3', x: 0, y: 0 },
    { id: 'B', label: '7', x: 1, y: 0 },
    { id: 'C', label: '9', x: 2, y: 0 },
    { id: 'D', label: '11', x: 3, y: 0 },
  ];
  const next: Record<string, string | null> = { A: 'B', B: 'C', C: 'D', D: null };
  const steps: AlgorithmAnimationStep[] = [{
    title: '只能顺着指针走',
    narration: '链表像一串藏宝图，每张纸只告诉你下一张在哪里。这里要把它整串倒过来。',
    invariant: 'prev 指向已经反转的链头，current 指向尚未处理的第一个节点。',
    frame: {
      kind: 'linked-list',
      nodes,
      next: { ...next },
      current: 'A',
      previous: null,
      doneNodes: [],
      operation: '初始链表',
    },
  }];
  let previous: string | null = null;
  let current: string | null = 'A';
  const done: string[] = [];
  while (current) {
    const saved: string | null = next[current];
    steps.push({
      title: `记住 ${current} 后面的路`,
      narration: `先保存 next = ${saved ?? 'null'}。如果先改指针，再找下一站就迷路了。`,
      invariant: '保存 next 是反转单链表不可省略的第一步。',
      frame: {
        kind: 'linked-list',
        nodes,
        next: { ...next },
        current,
        previous,
        doneNodes: [...done],
        operation: '暂存后继',
      },
    });
    next[current] = previous;
    done.push(current);
    steps.push({
      title: `把 ${current} 的箭头掉头`,
      narration: `${current} 现在指向 ${previous ?? 'null'}。已经处理过的节点形成了一条新链。`,
      invariant: '已反转段内部不会再被修改，尚未访问段仍由保存的 next 接住。',
      frame: {
        kind: 'linked-list',
        nodes,
        next: { ...next },
        current,
        previous,
        doneNodes: [...done],
        operation: '反转一条边',
      },
    });
    previous = current;
    current = saved;
  }
  steps.push({
    title: '新链头出现了',
    narration: 'current 变成 null 时，previous 正好停在原链表尾部，也就是反转后的头节点。',
    invariant: '循环退出时，所有节点都只被反转一次，因此原链完整地变成逆序。',
    frame: {
      kind: 'linked-list',
      nodes,
      next: { ...next },
      current: null,
      previous,
      doneNodes: [...done],
      operation: '反转完成',
    },
  });
  return steps;
}

function stackQueueSteps(): AlgorithmAnimationStep[] {
  return [
    {
      title: '奶茶订单排成队',
      narration: '队列像奶茶店取餐口：先来的订单先被叫到，这叫先进先出。',
      invariant: '队首离出口最近，队尾只负责接收新订单。',
      frame: { kind: 'stack-queue', stack: [], queue: [], focusArea: 'queue', operation: '队列为空' },
    },
    {
      title: '三个订单入队',
      narration: 'A、B、C 依次从队尾进入。A 仍然最靠近出口。',
      invariant: '入队只改变队尾，不改变已有元素的相对顺序。',
      frame: { kind: 'stack-queue', stack: [], queue: ['A', 'B', 'C'], focusArea: 'queue', operation: 'enqueue × 3' },
    },
    {
      title: 'A 先离开',
      narration: 'dequeue 只从队首取走 A，B 自动成为新队首。',
      invariant: '队列只允许队首出、队尾入，因此满足 FIFO。',
      frame: { kind: 'stack-queue', stack: [], queue: ['B', 'C'], focusArea: 'queue', operation: 'dequeue → A' },
    },
    {
      title: '杯子叠成一摞',
      narration: '栈像一摞杯子：最后放上去的杯子，最先被拿走。',
      invariant: '栈只操作顶端，其他位置既不可见也不可直接访问。',
      frame: { kind: 'stack-queue', stack: [2, 4], queue: ['B', 'C'], focusArea: 'stack', operation: '栈里有 2、4' },
    },
    {
      title: '再压一个 7',
      narration: 'push(7) 后，7 站在最顶端，成为下一次唯一能直接弹出的元素。',
      invariant: '压栈只改变 top，不移动下面的元素。',
      frame: { kind: 'stack-queue', stack: [2, 4, 7], queue: ['B', 'C'], focusArea: 'stack', operation: 'push(7)' },
    },
    {
      title: '弹出最后进来的 7',
      narration: 'pop 先拿走 7，然后才是 4。这个顺序叫后进先出。',
      invariant: 'FIFO 与 LIFO 的差别来自允许删除的位置，而不是元素本身。',
      frame: { kind: 'stack-queue', stack: [2, 4], queue: ['B', 'C'], focusArea: 'stack', operation: 'pop → 7' },
    },
  ];
}

function treeTraversalSteps(): AlgorithmAnimationStep[] {
  const nodes: AlgorithmAnimationNode[] = [
    { id: '1', label: '1', x: 260, y: 42 },
    { id: '2', label: '2', x: 142, y: 132, parent: '1' },
    { id: '3', label: '3', x: 378, y: 132, parent: '1' },
    { id: '4', label: '4', x: 72, y: 230, parent: '2' },
    { id: '5', label: '5', x: 210, y: 230, parent: '2' },
    { id: '6', label: '6', x: 310, y: 230, parent: '3' },
    { id: '7', label: '7', x: 448, y: 230, parent: '3' },
  ];
  const order = ['1', '2', '3', '4', '5', '6', '7'];
  const steps: AlgorithmAnimationStep[] = [{
    title: '从根节点排队',
    narration: 'BFS 像一层一层查楼层。先把根节点 1 放进队列。',
    invariant: '队列中保存的是“已发现但还没展开”的节点。',
    frame: {
      kind: 'tree',
      nodes,
      visited: [],
      frontier: ['1'],
      activeNode: '1',
      operation: '根节点入队',
    },
  }];
  const visited: string[] = [];
  const frontier: string[] = ['1'];
  order.forEach((nodeId) => {
    const node = nodes.find((item) => item.id === nodeId) as AlgorithmAnimationNode;
    frontier.shift();
    visited.push(node.id);
    const children = nodes.filter((item) => item.parent === node.id);
    frontier.push(...children.map((item) => item.id));
    steps.push({
      title: `展开节点 ${node.label}`,
      narration: children.length
        ? `节点 ${node.label} 从队列出来，并把孩子 ${children.map((item) => item.label).join('、')} 按从左到右的顺序加入队尾。`
        : `节点 ${node.label} 是叶子，出队后没有新孩子加入，队列继续处理后面的节点。`,
      invariant: '队列顺序保证浅层节点总在更深层节点之前被处理。',
      frame: {
        kind: 'tree',
        nodes,
        visited: [...visited],
        frontier: [...frontier],
        activeNode: node.id,
        operation: '出队并展开',
      },
    });
  });
  return steps;
}

function graphSearchSteps(): AlgorithmAnimationStep[] {
  const nodes: AlgorithmAnimationNode[] = [
    { id: 'A', label: 'A', x: 65, y: 145 },
    { id: 'B', label: 'B', x: 180, y: 62 },
    { id: 'C', label: 'C', x: 180, y: 228 },
    { id: 'D', label: 'D', x: 315, y: 62 },
    { id: 'E', label: 'E', x: 315, y: 228 },
    { id: 'F', label: 'F', x: 455, y: 145 },
  ];
  const edges: AlgorithmAnimationEdge[] = [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'E' },
    { from: 'D', to: 'F' },
    { from: 'E', to: 'F' },
  ];
  return [
    {
      title: '从 A 出发',
      narration: '把地铁站 A 作为起点。BFS 会先访问所有相邻站，再往下一圈走。',
      invariant: '访问集合防止绕圈，队列保存下一批候选站。',
      frame: { kind: 'graph', nodes, edges, visited: [], frontier: ['A'], activeNode: 'A', operation: '起点入队' },
    },
    {
      title: 'A 的邻居一起入队',
      narration: '访问 A，发现 B 与 C。两者离起点都只有一步。',
      invariant: '队列中的节点到起点距离不会突然跳级。',
      frame: { kind: 'graph', nodes, edges, visited: ['A'], frontier: ['B', 'C'], activeNode: 'A', operation: '发现一层邻居' },
    },
    {
      title: '先展开 B',
      narration: 'B 出队，发现更远的 D。C 仍在队列里等待。',
      invariant: '先入队的同层节点先展开，搜索按层推进。',
      frame: { kind: 'graph', nodes, edges, visited: ['A', 'B'], frontier: ['C', 'D'], activeNode: 'B', operation: 'B 出队' },
    },
    {
      title: '再展开 C',
      narration: 'C 出队并发现 E。此时第二层 B、C 都处理完。',
      invariant: '同一层的全部节点处理完之前，不会先深入第三层。',
      frame: { kind: 'graph', nodes, edges, visited: ['A', 'B', 'C'], frontier: ['D', 'E'], activeNode: 'C', operation: 'C 出队' },
    },
    {
      title: 'D 把路接到 F',
      narration: 'D 出队，发现终点 F。F 进入队列，但还要按顺序等待。',
      invariant: '第一次发现节点时得到的就是最短边数距离。',
      frame: { kind: 'graph', nodes, edges, visited: ['A', 'B', 'C', 'D'], frontier: ['E', 'F'], activeNode: 'D', operation: '发现终点 F' },
    },
    {
      title: 'F 在第三层被确认',
      narration: 'E 和 F 依次出队。A → B → D → F 是三条边的最短路线。',
      invariant: '目标第一次出队时，已经不存在更少边数的未探索路径。',
      frame: { kind: 'graph', nodes, edges, visited: ['A', 'B', 'C', 'D', 'E', 'F'], frontier: [], activeNode: 'F', operation: '最短层数 = 3' },
    },
  ];
}

function heapSteps(): AlgorithmAnimationStep[] {
  const values = [42, 17, 29, 8, 13, 20];
  const steps: AlgorithmAnimationStep[] = [{
    title: '最大堆的队形',
    narration: '每个家长都不小于自己的孩子。根节点 42 是当前最大值。',
    invariant: '对每个下标 i，parent(i) 的值不小于 i 的值。',
    frame: { kind: 'heap', values: [...values], active: [], done: [], operation: '合法最大堆' },
  }];
  values.push(35);
  steps.push({
    title: '35 先站到队尾',
    narration: '新元素只能先放到数组末尾，再沿父链向上调整。',
    invariant: '插入后只有新节点与祖先可能破坏堆序。',
    frame: { kind: 'heap', values: [...values], active: [6], done: [], operation: '插入 35' },
  });
  [values[2], values[6]] = [values[6], values[2]];
  steps.push({
    title: '35 比父节点 29 大',
    narration: '交换 35 和 29。35 继续和新的父节点 42 比较。',
    invariant: 'sift-up 每次只修复一条从叶子到根的路径。',
    frame: { kind: 'heap', values: [...values], active: [2], done: [], operation: '上浮一次' },
  });
  steps.push({
    title: '35 小于 42，停下',
    narration: '父节点已经不小于 35，堆序恢复。sift-up 不需要继续检查别的分支。',
    invariant: '停止条件是到达根或 parent >= current。',
    frame: { kind: 'heap', values: [...values], active: [2], done: [0], operation: '插入完成' },
  });
  values[0] = values.pop() as number;
  steps.push({
    title: '弹出最大值 42',
    narration: '先把队尾元素搬到根，数组长度减一，再让根向下沉。',
    invariant: '删除最大值后，只有根位置可能违反堆序。',
    frame: { kind: 'heap', values: [...values], active: [0], done: [], operation: '取走根节点' },
  });
  steps.push({
    title: '根 29 比孩子 35 小',
    narration: '29 需要和更大的孩子 35 交换。选择较大孩子才能让新的根继续是最大值。',
    invariant: '下沉每一步都要比较两个孩子，并选择较大的那个交换。',
    frame: { kind: 'heap', values: [...values], active: [0, 2], done: [], operation: '比较根与孩子' },
  });
  [values[0], values[2]] = [values[2], values[0]];
  steps.push({
    title: '29 和较大的孩子 35 交换',
    narration: '下沉时选择更大的孩子交换，否则会把更小值顶上来。',
    invariant: '每一步都恢复当前父子关系，并继续检查被换下去的位置。',
    frame: { kind: 'heap', values: [...values], active: [2], done: [0], operation: 'sift-down' },
  });
  steps.push({
    title: '新的最大值 35 到根',
    narration: '29 已经被换到叶子位置，没有孩子需要比较，下沉结束。下一次弹出会得到 35。',
    invariant: '完全二叉树仍然填满，堆序也在整棵树成立。',
    frame: { kind: 'heap', values: [...values], active: [], done: [0], operation: '弹出完成' },
  });
  return steps;
}

function hashTableSteps(): AlgorithmAnimationStep[] {
  const buckets: AlgorithmAnimationBucket[] = [
    { index: 0, values: [] },
    { index: 1, values: [] },
    { index: 2, values: [] },
    { index: 3, values: [] },
    { index: 4, values: [] },
    { index: 5, values: [] },
    { index: 6, values: [] },
  ];
  const clone = () => buckets.map((bucket) => ({ ...bucket, values: [...bucket.values] }));
  const insert = (value: string, index: number) => {
    buckets[index].values.push(value);
    return clone();
  };
  const first = insert('grape', 3);
  const second = insert('melon', 3);
  const third = insert('apple', 1);
  return [
    {
      title: '快递柜先看编号',
      narration: '哈希表像一排快递柜：先由哈希函数把包裹名换算成柜号，再去对应位置找。',
      invariant: '同一个 key 每次必须得到同一个桶下标。',
      frame: { kind: 'hash', buckets: clone(), activeBucket: 3, operation: '7 个空桶' },
    },
    {
      title: 'grape 落到 3 号柜',
      narration: 'hash("grape") % 7 = 3。只要读取 3 号柜即可，不必扫完整张表。',
      invariant: '理想情况下查找、插入都接近 O(1)。',
      frame: { kind: 'hash', buckets: first, activeBucket: 3, operation: '插入 grape' },
    },
    {
      title: 'melon 也落到 3 号柜',
      narration: '两个不同 key 落到同一桶，发生哈希冲突。它们用链式结构排在一起。',
      invariant: '冲突并不代表哈希失败，只要桶内比较 key 仍能保持正确性。',
      frame: { kind: 'hash', buckets: second, activeBucket: 3, operation: '冲突 → 链式存储' },
    },
    {
      title: 'apple 去 1 号柜',
      narration: 'apple 的桶号是 1，所以它与 grape、melon 互不干扰。',
      invariant: '桶越多冲突通常越少，但空间开销也更大。',
      frame: { kind: 'hash', buckets: third, activeBucket: 1, operation: '插入 apple' },
    },
    {
      title: '查 grape 只去 3 号柜',
      narration: '先算桶号 3，再比较桶内的 key。找到 grape 后立即返回。',
      invariant: '查找代价 = 计算哈希 + 比较该桶内的元素。',
      frame: { kind: 'hash', buckets: third, activeBucket: 3, operation: '查找 grape → 命中' },
    },
    {
      title: '最坏情况仍会退化',
      narration: '如果所有 key 都撞进同一个桶，桶内比较会退化成 O(n)。',
      invariant: '哈希表的平均性能依赖哈希分布和冲突处理策略。',
      frame: { kind: 'hash', buckets: third, activeBucket: 3, operation: '记住最坏情况 O(n)' },
    },
  ];
}

function editDistanceFrames(): AlgorithmAnimationStep[] {
  const source = 'kitten';
  const target = 'sitting';
  const rows = ['', ...source.split('')];
  const columns = ['', ...target.split('')];
  const matrix: Array<Array<number | null>> = matrixBase(rows.length, columns.length);
  for (let index = 0; index < rows.length; index += 1) matrix[index][0] = index;
  for (let index = 0; index < columns.length; index += 1) matrix[0][index] = index;
  const clone = () => matrix.map((row) => [...row]);
  const steps: AlgorithmAnimationStep[] = [{
    title: '先搭好边界',
    narration: '把空串变成前缀需要的次数写在第一行和第一列，这是所有递推的起点。',
    invariant: 'dp[i][j] 表示 source 前 i 个字符变成 target 前 j 个字符的最少操作数。',
    frame: {
      kind: 'grid',
      rows,
      columns,
      matrix: clone(),
      activeCell: [0, 0],
      operation: '初始化边界',
    },
  }];
  for (let i = 1; i < rows.length; i += 1) {
    for (let j = 1; j < columns.length; j += 1) {
      const replaceCost = source[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        (matrix[i - 1][j] as number) + 1,
        (matrix[i][j - 1] as number) + 1,
        (matrix[i - 1][j - 1] as number) + replaceCost,
      );
    }
    steps.push({
      title: `填完第 ${i} 行`,
      narration: `字符 ${source[i - 1]} 与目标前缀逐格比较。每个格子只取删除、插入、替换三条路里最小的一条。`,
      invariant: '当前行依赖上一行和本行左侧，已经填过的格子不会再次改变。',
      frame: {
        kind: 'grid',
        rows,
        columns,
        matrix: clone(),
        activeCell: [i, columns.length - 1],
        operation: `source "${source.slice(0, i)}"`,
      },
    });
  }
  steps.push({
    title: '右下角就是答案',
    narration: `kitten 变成 sitting 最少需要 ${matrix[rows.length - 1][columns.length - 1]} 次编辑。`,
    invariant: '最优子结构把整串问题拆成了可复用的小前缀问题。',
    frame: {
      kind: 'grid',
      rows,
      columns,
      matrix: clone(),
      activeCell: [rows.length - 1, columns.length - 1],
      operation: '编辑距离完成',
    },
  });
  return steps;
}

function matrixBase(rows: number, columns: number): Array<Array<number | null>> {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => null));
}

function windowSteps(): AlgorithmAnimationStep[] {
  const tokens = 'abcabcbb'.split('');
  const steps: AlgorithmAnimationStep[] = [{
    title: '窗口先放进一个 a',
    narration: '滑动窗口像一扇可伸缩的取景框：右边界负责发现新字符，左边界负责赶走重复。',
    invariant: '窗口内部始终没有重复字符。',
    frame: {
      kind: 'window',
      tokens,
      windowLeft: 0,
      windowRight: 0,
      windowLength: 1,
      bestLength: 1,
      operation: '初始窗口',
    },
  }];
  const seen = new Map<string, number>();
  let left = 0;
  let best = 0;
  for (let right = 0; right < tokens.length; right += 1) {
    const token = tokens[right];
    const previous = seen.get(token);
    if (previous !== undefined && previous >= left) {
      steps.push({
        title: `发现重复的 ${token}`,
        narration: `${token} 已经在窗口里。如果继续保留左边界，这个窗口就不合法。`,
        invariant: '重复字符的位置决定左边界至少要跳到哪里。',
        frame: {
          kind: 'window',
          tokens,
          windowLeft: left,
          windowRight: right,
          windowLength: right - left + 1,
          bestLength: best,
          duplicate: true,
          operation: '检测到重复',
        },
      });
      left = previous + 1;
    }
    seen.set(token, right);
    best = Math.max(best, right - left + 1);
    steps.push({
      title: `窗口扩到 ${tokens.slice(left, right + 1).join('')}`,
      narration: `把 ${token} 纳入窗口，当前长度 ${right - left + 1}，历史最好 ${best}。`,
      invariant: '每一步都只向右移动，left 与 right 都不会回退，所以总时间是线性的。',
      frame: {
        kind: 'window',
        tokens,
        windowLeft: left,
        windowRight: right,
        windowLength: right - left + 1,
        bestLength: best,
        duplicate: false,
        operation: '窗口合法',
      },
    });
  }
  steps.push({
    title: `最长长度是 ${best}`,
    narration: '扫描结束时，best 记录过所有合法窗口中的最大长度。',
    invariant: '每个字符最多进入和离开窗口一次，所以复杂度是 O(n)。',
    frame: {
      kind: 'window',
      tokens,
      windowLeft: left,
      windowRight: tokens.length - 1,
      windowLength: tokens.length - left,
      bestLength: best,
      duplicate: false,
      operation: '扫描完成',
    },
  });
  return steps;
}

export const ALGORITHM_ANIMATION_SCENES: AlgorithmAnimationScene[] = [
  {
    id: 'bubble-sort',
    title: '冒泡排序',
    category: '排序',
    story: '快递站按编号排队，每次只检查相邻的两个包裹。',
    question: '为什么一轮结束，最大的包裹一定到了最右边？',
    complexity: '时间 O(n²) · 原地 O(1)',
    code: 'for (let end = n - 1; end > 0; end--)\n  for (let i = 0; i < end; i++)\n    if (a[i] > a[i + 1]) swap(a, i, i + 1);',
    steps: bubbleSortSteps(),
  },
  {
    id: 'binary-search',
    title: '二分查找',
    category: '查找',
    story: '找一本按编号排好的书，不必从第一页翻到最后。',
    question: '每次比较后，为什么可以放心扔掉一半候选？',
    complexity: '时间 O(log n) · 空间 O(1)',
    code: 'while (left <= right) {\n  const mid = (left + right) >> 1;\n  if (a[mid] === target) return mid;\n  if (a[mid] < target) left = mid + 1;\n  else right = mid - 1;\n}',
    steps: binarySearchSteps(),
  },
  {
    id: 'linked-list-reverse',
    title: '链表反转',
    category: '线性结构',
    story: '一张纸条只写着下一张纸条的位置，要把整串藏宝图倒过来。',
    question: '为什么改箭头之前必须先保存 next？',
    complexity: '时间 O(n) · 空间 O(1)',
    code: 'let prev = null;\nwhile (cur) {\n  const next = cur.next;\n  cur.next = prev;\n  prev = cur;\n  cur = next;\n}',
    steps: linkedListSteps(),
  },
  {
    id: 'stack-queue',
    title: '栈与队列',
    category: '线性结构',
    story: '奶茶订单排队，杯子却是一摞一摞地叠。',
    question: 'FIFO 和 LIFO 的差别到底来自哪条规则？',
    complexity: '入队/出队 O(1) · 压栈/弹栈 O(1)',
    code: 'queue.push(order);   // 队尾进入\nconst first = queue.shift();\n\nstack.push(cup);      // 顶端进入\nconst top = stack.pop();',
    steps: stackQueueSteps(),
  },
  {
    id: 'tree-bfs',
    title: '二叉树层序遍历',
    category: '树',
    story: '查宿舍时先查完一楼，再查二楼和更深的楼层。',
    question: '队列为什么能自然地保证一层一层访问？',
    complexity: '时间 O(n) · 空间 O(宽度)',
    code: 'const queue = [root];\nwhile (queue.length) {\n  const node = queue.shift();\n  visit(node);\n  queue.push(...node.children);\n}',
    steps: treeTraversalSteps(),
  },
  {
    id: 'graph-bfs',
    title: '图的最短路径',
    category: '图',
    story: '换乘地铁时，先看所有一站可达的站，再看两站可达的站。',
    question: '为什么 BFS 第一次到达终点时就是最少边数？',
    complexity: '时间 O(V + E) · 空间 O(V)',
    code: 'const queue = [start];\nconst seen = new Set(queue);\nwhile (queue.length) {\n  const node = queue.shift();\n  for (const next of graph[node])\n    if (!seen.has(next)) { seen.add(next); queue.push(next); }\n}',
    steps: graphSearchSteps(),
  },
  {
    id: 'max-heap',
    title: '最大堆',
    category: '堆',
    story: '急诊分诊台总把最紧急的病人放在最前面更新。',
    question: '插入和弹出时，为什么只沿一条父子路径调整？',
    complexity: '插入 O(log n) · 弹堆顶 O(log n)',
    code: 'function push(x) {\n  heap.push(x);\n  siftUp(heap.length - 1);\n}\nfunction pop() {\n  swap(0, heap.length - 1);\n  const top = heap.pop();\n  siftDown(0);\n  return top;\n}',
    steps: heapSteps(),
  },
  {
    id: 'hash-table',
    title: '哈希表',
    category: '哈希',
    story: '一排快递柜先按编号找位置，偶尔两个包裹会撞到同一个柜子。',
    question: '平均 O(1) 与最坏 O(n) 分别在什么情况下成立？',
    complexity: '平均 O(1) · 最坏 O(n)',
    code: 'const bucket = hash(key) % capacity;\nfor (const entry of table[bucket])\n  if (entry.key === key) return entry.value;\ntable[bucket].push({ key, value });',
    steps: hashTableSteps(),
  },
  {
    id: 'edit-distance',
    title: '动态规划：编辑距离',
    category: '动态规划',
    story: '把错别字“kitten”修成“sitting”，每次只能删、插或换一个字母。',
    question: '一个格子的答案为什么只依赖左、上、左上三个格子？',
    complexity: '时间 O(mn) · 空间 O(mn)',
    code: 'dp[i][j] = Math.min(\n  dp[i - 1][j] + 1,\n  dp[i][j - 1] + 1,\n  dp[i - 1][j - 1] + cost\n);',
    steps: editDistanceFrames(),
  },
  {
    id: 'sliding-window',
    title: '滑动窗口',
    category: '双指针',
    story: '拿一个会伸缩的取景框扫过字符串，框里不能出现两个相同字符。',
    question: 'left 和 right 为什么都只会向右走？',
    complexity: '时间 O(n) · 空间 O(字符集)',
    code: 'for (let right = 0; right < text.length; right++) {\n  while (window.has(text[right])) {\n    window.delete(text[left++]);\n  }\n  window.add(text[right]);\n  best = Math.max(best, right - left + 1);\n}',
    steps: windowSteps(),
  },
];
