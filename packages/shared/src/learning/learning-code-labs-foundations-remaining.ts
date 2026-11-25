import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

/**
 * 编程通识 F2-F5、H0-H5 的剩余真实代码实验室。
 *
 * 课程键逐字取自 handwritten/programming-foundations.ts，且不与
 * learning-code-labs-programming-foundations-f0-f1.ts 的 F0-F1
 * 实验重叠。所有程序只使用 Node.js 标准库；数据库任务使用
 * node:sqlite，文件和子进程只写入系统临时目录。HTML、CSS、Docker、
 * Compose 等无法由 Node 直接渲染或启动的部分使用明确标注的确定性
 * 契约模型，不把这些模型伪装成真实浏览器或容器运行时。
 */

type LabTaskSeed = {
  readonly title: string;
  readonly brief: string;
  readonly input: unknown;
  readonly source: string;
  readonly checkpoint: string;
};

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库实验台',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    'Node.js 由应用内置，不需要安装第三方 npm 包。',
    '先运行跟做代码并核对 checkpoint，再完成独立实践。',
    '临时数据库、仓库、证书和进程只写入系统临时目录并在结束时清理。',
    'Docker、Compose、HTML/CSS 和 DevTools 使用任务说明中写明的确定性契约模型，不声称启动了真实容器、浏览器或集群。',
  ],
  languages: ['javascript'],
} as const;

const sourceFor = (body: string): string => `const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
${body.trim()}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

const makeTask = (id: string, seed: LabTaskSeed): LearningV2CodeLabTask => ({
  id,
  title: seed.title,
  brief: seed.brief,
  defaultLanguage: 'javascript',
  starterCode: { javascript: sourceFor(seed.source) },
  stdin: JSON.stringify(seed.input),
  checkpoint: seed.checkpoint,
});

const makeLab = (
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  ...nodeRuntime,
  practice,
  apply,
});

export const LEARNING_CODE_LABS_FOUNDATIONS_REMAINING: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:编程通识 · 操作系统、并发与网络：进程、线程、调度与上下文切换': makeLab(
    'F2 代码台 01 · 调度器与真实工作线程',
    '先用确定性的时间片轮转调度器观察等待、运行和上下文切换，再启动共享内存的 Worker 线程验证原子操作。',
    makeTask('foundations-remaining-f2-scheduler-guided', {
      title: '跟做：时间片轮转调度',
      brief:
        '运行 node main.js。stdin 给出时间片和作业列表；模拟每个作业运行一个 quantum，记录剩余时间、完成顺序和切换次数。',
      input: {
        quantum: 2,
        jobs: [
          { id: 'compile', burst: 5 },
          { id: 'test', burst: 3 },
          { id: 'lint', burst: 2 },
        ],
      },
      source: `
assert.ok(Number.isInteger(input.quantum) && input.quantum > 0);
const queue = input.jobs.map((job) => ({ ...job, remaining: job.burst }));
const timeline = [];
const completed = [];
let switches = 0;
while (queue.length > 0) {
  const job = queue.shift();
  const used = Math.min(input.quantum, job.remaining);
  job.remaining -= used;
  timeline.push(job.id + ':' + used);
  if (job.remaining === 0) completed.push(job.id);
  else {
    queue.push(job);
    switches += 1;
  }
}
assert.deepEqual(completed, ['lint', 'test', 'compile']);
assert.equal(timeline.join(' '), 'compile:2 test:2 lint:2 compile:2 test:1 compile:1');
console.log('timeline:', timeline.join(' -> '));
console.log('context switches:', switches);
console.log('completed:', completed.join(','));
`,
      checkpoint:
        '必须看到 compile、test、lint 的切片交错，context switches 为 3，完成顺序为 lint,test,compile。失败边界是每个作业一次跑完、未把未完成作业重新入队，或把线程切换成本误当成零成本。',
    }),
    makeTask('foundations-remaining-f2-scheduler-independent', {
      title: '独立实践：Worker 共享计数与原子更新',
      brief:
        '运行 node main.js。创建多个 Worker，对同一个 SharedArrayBuffer 计数；每个 Worker 用 Atomics.add 累加固定次数，主线程汇总结果。',
      input: { workers: 4, iterations: 2500 },
      source: `
const { Worker } = require('node:worker_threads');
const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
const counter = new Int32Array(shared);
const workerCode = [
  "const { parentPort, workerData } = require('node:worker_threads');",
  'const counter = new Int32Array(workerData.shared);',
  'for (let i = 0; i < workerData.iterations; i += 1) Atomics.add(counter, 0, 1);',
  'parentPort.postMessage(counter[0]);',
].join('\\n');
const workers = Array.from({ length: input.workers }, () => new Promise((resolve, reject) => {
  const worker = new Worker(workerCode, {
    eval: true,
    workerData: { shared, iterations: input.iterations },
  });
  worker.once('exit', (code) => code === 0 ? resolve(true) : reject(new Error('worker exit ' + code)));
  worker.once('error', reject);
}));
Promise.all(workers).then(() => {
  const expected = input.workers * input.iterations;
  assert.equal(Atomics.load(counter, 0), expected);
  console.log('workers:', input.workers);
  console.log('atomic total:', Atomics.load(counter, 0));
});
`,
      checkpoint:
        'atomic total 必须等于 workers × iterations，当前为 10000，且退出码为 0。失败边界是普通 counter += 1 造成丢失更新、把 Worker 当异步 I/O 线程，或忘记等待全部 Worker 完成。',
    }),
  ),

  'programming:编程通识 · 操作系统、并发与网络：虚拟内存、栈、堆与文件映射': makeLab(
    'F2 代码台 02 · 页表、映射区和越界',
    '用页对齐检查虚拟地址区间是否重叠，并通过页表把虚拟页翻译为物理页；错误示范会明确触发越界断言。',
    makeTask('foundations-remaining-f2-memory-guided', {
      title: '跟做：对齐栈、堆和文件映射',
      brief:
        '运行 node main.js。stdin 提供页大小和栈、堆、文件映射区间；代码做页对齐、区间重叠检测并输出每个区域的页数。',
      input: {
        pageSize: 4096,
        regions: [
          { name: 'stack', start: 140737488355328, end: 140737488359424, writable: true },
          { name: 'heap', start: 140245000003584, end: 140245000011776, writable: true },
          { name: 'file', start: 140245100003328, end: 140245100007424, writable: false },
        ],
      },
      source: `
const pageSize = input.pageSize;
const regions = input.regions.map((region) => {
  assert.ok(region.end >= region.start);
  assert.equal(region.start % pageSize, 0, region.name + ' start is not page aligned');
  assert.equal(region.end % pageSize, 0, region.name + ' end is not page aligned');
  return { ...region, pages: (region.end - region.start) / pageSize };
});
const ordered = [...regions].sort((a, b) => a.start - b.start);
for (let index = 1; index < ordered.length; index += 1) {
  assert.ok(ordered[index - 1].end <= ordered[index].start, 'virtual regions overlap');
}
console.log('regions:', regions.map((item) => item.name + '=' + item.pages + ' pages').join(', '));
console.log('writable:', regions.filter((item) => item.writable).map((item) => item.name).join(','));
`,
      checkpoint:
        'stack=1 pages、heap=2 pages、file=1 page，writable 为 stack,heap，且无区间重叠。失败边界是把字节数直接当页数、忽略页对齐，或让栈与堆地址区间相交。',
    }),
    makeTask('foundations-remaining-f2-memory-independent', {
      title: '独立实践：页表翻译与越界保护',
      brief:
        '运行 node main.js。根据虚拟页到物理页的映射和读写权限翻译访问列表；未映射页记为 page fault，越权写记为 protection fault。',
      input: {
        mappings: [
          { virtual: 8, physical: 3, writable: false },
          { virtual: 9, physical: 7, writable: true },
        ],
        accesses: [
          { virtual: 8, mode: 'read' },
          { virtual: 8, mode: 'write' },
          { virtual: 9, mode: 'write' },
          { virtual: 12, mode: 'read' },
        ],
      },
      source: `
const table = new Map(input.mappings.map((item) => [item.virtual, item]));
const results = input.accesses.map((access) => {
  const mapping = table.get(access.virtual);
  if (!mapping) return { ...access, result: 'page fault' };
  if (access.mode === 'write' && !mapping.writable) {
    return { ...access, physical: mapping.physical, result: 'protection fault' };
  }
  return { ...access, physical: mapping.physical, result: 'ok' };
});
assert.deepEqual(results.map((item) => item.result), [
  'ok',
  'protection fault',
  'ok',
  'page fault',
]);
console.log(JSON.stringify(results));
console.log('physical pages:', results.filter((item) => item.physical !== undefined).map((item) => item.physical).join(','));
`,
      checkpoint:
        '四次访问结果必须依次为 ok、protection fault、ok、page fault，物理页证据包含 3 和 7。失败边界是只做地址加减、忽略页表权限，或把未映射访问当成普通内存读取。',
    }),
  ),

  'programming:编程通识 · 操作系统、并发与网络：阻塞、非阻塞与 IO 多路复用': makeLab(
    'F2 代码台 03 · 就绪队列与真实回环请求',
    '先用确定性事件循环模型处理计时器、可读和可写事件，再启动真实本地 HTTP 服务并发发出请求。',
    makeTask('foundations-remaining-f2-io-guided', {
      title: '跟做：事件循环的就绪队列',
      brief:
        '运行 node main.js。stdin 给出带时刻的文件描述符事件；代码按时刻排序，把可读和可写队列分别处理，统计每次轮询的 ready 数量。',
      input: {
        events: [
          { at: 12, fd: 7, type: 'read' },
          { at: 4, fd: 3, type: 'write' },
          { at: 4, fd: 9, type: 'read' },
          { at: 20, fd: 3, type: 'read' },
        ],
      },
      source: `
const events = [...input.events].sort((a, b) => a.at - b.at || a.fd - b.fd);
const rounds = [];
let index = 0;
while (index < events.length) {
  const at = events[index].at;
  const ready = [];
  while (index < events.length && events[index].at === at) {
    ready.push(events[index]);
    index += 1;
  }
  rounds.push({
    at,
    read: ready.filter((item) => item.type === 'read').map((item) => item.fd),
    write: ready.filter((item) => item.type === 'write').map((item) => item.fd),
  });
}
assert.deepEqual(rounds, [
  { at: 4, read: [9], write: [3] },
  { at: 12, read: [7], write: [] },
  { at: 20, read: [3], write: [] },
]);
console.log(JSON.stringify(rounds));
`,
      checkpoint:
        '必须得到三轮就绪结果：时刻 4 同时有 read fd 9 与 write fd 3；时刻 12 只有 read 7；时刻 20 只有 read 3。失败边界是把接受连接当读取数据、阻塞等待单个 fd，或把 ready 数量当成字节数。',
    }),
    makeTask('foundations-remaining-f2-io-independent', {
      title: '独立实践：本地 HTTP 并发与完成顺序',
      brief:
        '运行 node main.js。启动真实 127.0.0.1 HTTP 服务，并行请求快、慢两个路径；记录完成顺序，证明慢请求没有阻塞快请求。',
      input: { slowDelayMs: 45, fastDelayMs: 2 },
      source: `
const http = require('node:http');
const server = http.createServer((request, response) => {
  const delay = request.url === '/slow' ? input.slowDelayMs : input.fastDelayMs;
  setTimeout(() => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ path: request.url }));
  }, delay);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const request = (path) => new Promise((resolve, reject) => {
  const started = Date.now();
  http.get({ host: '127.0.0.1', port, path }, (response) => {
    response.resume();
    response.once('end', () => resolve({ path, elapsed: Date.now() - started }));
  }).once('error', reject);
});
const completed = [];
await Promise.all([
  request('/slow').then((item) => completed.push(item)),
  request('/fast').then((item) => completed.push(item)),
]).finally(() => server.close());
assert.equal(completed[0].path, '/fast');
assert.equal(completed[1].path, '/slow');
console.log('completion order:', completed.map((item) => item.path).join(' -> '));
console.log('elapsed:', completed.map((item) => item.path + '=' + item.elapsed + 'ms').join(', '));
server.closeAllConnections();
`,
      checkpoint:
        'completion order 必须是 /fast -> /slow，且快请求先完成、慢请求后完成。失败边界是串行 await 导致请求被故意排队、把 setTimeout 当成内核阻塞，或未关闭本地服务。',
    }),
  ),

  'programming:编程通识 · 操作系统、并发与网络：TCP、TLS、DNS 与 HTTP': makeLab(
    'F2 代码台 04 · 连接复用与报文边界',
    '用真实回环 HTTP Agent 验证 keep-alive 连接复用，再用确定性报文契约解析 DNS 选择、请求头和 Content-Length 边界。',
    makeTask('foundations-remaining-f2-http-guided', {
      title: '跟做：keep-alive 复用同一 TCP 连接',
      brief:
        '运行 node main.js。启动本地 HTTP 服务，Agent 设 maxSockets=1 和 keepAlive=true；串行请求两次并记录服务端看到的连接 id。',
      input: { requests: 2 },
      source: `
const http = require('node:http');
let nextConnection = 0;
const connections = [];
const server = http.createServer((request, response) => {
  response.setHeader('connection', 'keep-alive');
  response.end('ok');
});
server.on('connection', (socket) => {
  socket.labId = nextConnection += 1;
  connections.push(socket.labId);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
const seen = [];
for (let index = 0; index < input.requests; index += 1) {
  await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/item/' + index, agent }, (response) => {
      seen.push(response.headers.connection);
      response.resume();
      response.once('end', resolve);
    }).once('error', reject);
  });
}
agent.destroy();
await new Promise((resolve) => server.close(resolve));
assert.equal(connections.length, 1);
assert.deepEqual(seen, ['keep-alive', 'keep-alive']);
console.log('accepted tcp connections:', connections.length);
console.log('response connection headers:', seen.join(','));
`,
      checkpoint:
        'accepted tcp connections 必须为 1，两次响应头都是 keep-alive。失败边界是每次新建 Agent 或 socket、把 HTTP 请求数等同于 TCP 连接数，或忽略服务端主动关闭连接。',
    }),
    makeTask('foundations-remaining-f2-http-independent', {
      title: '独立实践：DNS 记录选择与 HTTP 报文切分',
      brief:
        '运行 node main.js。按 TTL 选择合适的 DNS 记录，再用 Content-Length 把连续到达的两条 HTTP 请求切分成独立消息。',
      input: {
        now: 120,
        dns: [
          { host: 'api.test', ip: '10.0.0.2', expiresAt: 150 },
          { host: 'api.test', ip: '10.0.0.1', expiresAt: 90 },
          { host: 'api.test', ip: '10.0.0.3', expiresAt: 160 },
        ],
        wire:
          'POST /orders HTTP/1.1\r\nHost: api.test\r\nContent-Length: 7\r\n\r\norder=1' +
          'GET /health HTTP/1.1\r\nHost: api.test\r\nContent-Length: 0\r\n\r\n',
      },
      source: `
const records = input.dns
  .filter((record) => record.host === 'api.test' && record.expiresAt > input.now)
  .sort((a, b) => a.ip.localeCompare(b.ip));
assert.ok(records.length > 0);
const chosenIp = records[0].ip;
const messages = [];
let offset = 0;
while (offset < input.wire.length) {
  const headerEnd = input.wire.indexOf('\\r\\n\\r\\n', offset);
  assert.ok(headerEnd >= offset, 'missing header terminator');
  const head = input.wire.slice(offset, headerEnd);
  const lines = head.split('\\r\\n');
  const [method, path] = lines[0].split(' ');
  const headers = Object.fromEntries(lines.slice(1).map((line) => {
    const split = line.indexOf(':');
    return [line.slice(0, split).toLowerCase(), line.slice(split + 1).trim()];
  }));
  const length = Number(headers['content-length']);
  assert.ok(Number.isInteger(length) && length >= 0);
  const bodyStart = headerEnd + 4;
  messages.push({ method, path, body: input.wire.slice(bodyStart, bodyStart + length), ip: chosenIp });
  offset = bodyStart + length;
}
assert.deepEqual(messages.map((item) => item.path), ['/orders', '/health']);
assert.equal(messages[0].body, 'order=1');
console.log('dns candidate:', records.map((item) => item.ip).join(','));
console.log('chosen ip:', chosenIp);
console.log('http messages:', JSON.stringify(messages));
`,
      checkpoint:
        'DNS 候选只保留未过期的 10.0.0.2、10.0.0.3，并按地址选择 10.0.0.2；两条请求路径为 /orders 与 /health，第一条 body 为 order=1。失败边界是按到达顺序把过期记录当可用、只按换行切包，或忽略 Content-Length 读取第二条请求。',
    }),
  ),

  'programming:编程通识 · 操作系统、并发与网络：并发、锁、竞态与背压': makeLab(
    'F2 代码台 05 · 自旋锁与有界队列',
    '用 Atomics.compareExchange 实现共享内存自旋锁，再用异步有界队列让生产者在容量满时等待，验证背压而不是无限堆积。',
    makeTask('foundations-remaining-f2-lock-guided', {
      title: '跟做：共享内存自旋锁保护计数器',
      brief:
        '运行 node main.js。多个 Worker 在 SharedArrayBuffer 上通过 CAS 获取锁、修改计数、释放锁，主线程校验最终计数。',
      input: { workers: 4, iterations: 1200 },
      source: `
const { Worker } = require('node:worker_threads');
const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
const state = new Int32Array(shared);
const workerCode = [
  "const { parentPort, workerData } = require('node:worker_threads');",
  'const state = new Int32Array(workerData.shared);',
  'for (let i = 0; i < workerData.iterations; i += 1) {',
  '  while (Atomics.compareExchange(state, 1, 0, 1) !== 0) Atomics.wait(new Int32Array(workerData.shared), 1, 1, 1);',
  '  Atomics.store(state, 0, Atomics.load(state, 0) + 1);',
  '  Atomics.store(state, 1, 0);',
  '  Atomics.notify(state, 1);',
  '}',
  'parentPort.postMessage(Atomics.load(state, 0));',
].join('\\n');
const workers = Array.from({ length: input.workers }, () => new Promise((resolve, reject) => {
  const worker = new Worker(workerCode, { eval: true, workerData: { shared, iterations: input.iterations } });
  worker.once('message', resolve);
  worker.once('error', reject);
}));
Promise.all(workers).then((values) => {
  const expected = input.workers * input.iterations;
  assert.equal(Atomics.load(state, 0), expected);
  assert.equal(Math.max(...values), expected);
  console.log('workers:', input.workers);
  console.log('locked counter:', Atomics.load(state, 0));
  console.log('expected:', expected);
});
`,
      checkpoint:
        'locked counter 与 expected 都必须为 4800，退出码为 0。失败边界是忙等时不释放 CPU、用普通读写替代 Atomics，或释放锁后没有 notify 等待者。',
    }),
    makeTask('foundations-remaining-f2-lock-independent', {
      title: '独立实践：有界队列施加背压',
      brief:
        '运行 node main.js。四个生产者向容量为 2 的队列写入，慢消费者逐项取出；记录峰值队列长度，验证生产者在满时真实等待。',
      input: { producers: 4, itemsPerProducer: 3, capacity: 2, consumeDelayMs: 3 },
      source: `
const queue = [];
let waiters = [];
let maxSize = 0;
let consumed = 0;
const total = input.producers * input.itemsPerProducer;
const wakeProducer = () => {
  const waiter = waiters.shift();
  if (waiter) waiter();
};
const enqueue = async (item) => {
  while (queue.length >= input.capacity) {
    await new Promise((resolve) => waiters.push(resolve));
  }
  queue.push(item);
  maxSize = Math.max(maxSize, queue.length);
};
const consumer = (async () => {
  while (consumed < total) {
    if (queue.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      continue;
    }
    queue.shift();
    consumed += 1;
    wakeProducer();
    await new Promise((resolve) => setTimeout(resolve, input.consumeDelayMs));
  }
})();
await Promise.all(Array.from({ length: input.producers }, async (_, producer) => {
  for (let index = 0; index < input.itemsPerProducer; index += 1) {
    await enqueue('p' + producer + '-' + index);
  }
}));
await consumer;
assert.equal(consumed, total);
assert.ok(maxSize <= input.capacity);
assert.ok(maxSize >= 1);
console.log('consumed:', consumed);
console.log('maximum queue size:', maxSize);
console.log('capacity:', input.capacity);
`,
      checkpoint:
        'consumed 必须为 12，maximum queue size 不能超过 capacity=2，且最终队列为空。失败边界是只把数组无限 push、让生产者忙等阻塞事件循环，或消费者漏掉唤醒导致程序不结束。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：表、键、约束与规范化': makeLab(
    'F3 代码台 01 · 约束检查与拆分重复数据',
    '先逐行执行主键、外键、非空和 CHECK 约束，再把一张混有客户与订单信息的宽表拆成可关联的规范结构。',
    makeTask('foundations-remaining-f3-model-guided', {
      title: '跟做：在写入前检查四类约束',
      brief:
        '运行 node main.js。stdin 给出用户行和订单行；代码检查用户主键唯一、邮箱非空、金额非负以及订单外键存在。',
      input: {
        users: [
          { id: 1, email: 'a@example.test' },
          { id: 2, email: '' },
          { id: 1, email: 'dup@example.test' },
        ],
        orders: [
          { id: 10, userId: 1, total: 99 },
          { id: 11, userId: 9, total: -1 },
        ],
      },
      source: `
const failures = [];
const userIds = new Set();
for (const user of input.users) {
  if (userIds.has(user.id)) failures.push('users.pk:' + user.id);
  userIds.add(user.id);
  if (!user.email.trim()) failures.push('users.email.not_null:' + user.id);
}
const orderIds = new Set();
for (const order of input.orders) {
  if (orderIds.has(order.id)) failures.push('orders.pk:' + order.id);
  orderIds.add(order.id);
  if (!userIds.has(order.userId)) failures.push('orders.user_id.fk:' + order.id);
  if (!(order.total >= 0)) failures.push('orders.total.check:' + order.id);
}
assert.deepEqual(failures, [
  'users.email.not_null:2',
  'users.pk:1',
  'orders.user_id.fk:11',
  'orders.total.check:11',
]);
console.log('constraint failures:', failures.join(' | '));
`,
      checkpoint:
        '必须报告空邮箱、重复用户主键、订单 11 的外键失败和金额 CHECK 失败。失败边界是只在应用层查一次就信任数据、先插子表再插父表，或把 null 与空字符串混为一谈。',
    }),
    makeTask('foundations-remaining-f3-model-independent', {
      title: '独立实践：把订单宽表拆成三张规范化表',
      brief:
        '运行 node main.js。把包含客户邮箱、订单和商品行的宽表拆为 users、orders、order_items，保留组合主键并消除重复客户信息。',
      input: {
        rows: [
          { customerId: 1, email: 'ada@example.test', orderId: 20, item: 7, qty: 2, price: 300 },
          { customerId: 1, email: 'ada@example.test', orderId: 20, item: 8, qty: 1, price: 120 },
          { customerId: 2, email: 'lin@example.test', orderId: 21, item: 7, qty: 1, price: 300 },
        ],
      },
      source: `
const customers = new Map();
const orders = new Map();
const items = new Map();
for (const row of input.rows) {
  const customer = { id: row.customerId, email: row.email };
  const knownCustomer = customers.get(customer.id);
  if (knownCustomer) assert.equal(knownCustomer.email, customer.email);
  else customers.set(customer.id, customer);
  const order = { id: row.orderId, customerId: row.customerId };
  const knownOrder = orders.get(order.id);
  if (knownOrder) assert.equal(knownOrder.customerId, order.customerId);
  else orders.set(order.id, order);
  const key = row.orderId + ':' + row.item;
  assert.ok(!items.has(key), 'duplicate composite primary key ' + key);
  items.set(key, { orderId: row.orderId, item: row.item, qty: row.qty, price: row.price });
}
assert.equal(customers.size, 2);
assert.equal(orders.size, 2);
assert.equal(items.size, 3);
assert.equal([...customers.values()].filter((item) => item.email === 'ada@example.test').length, 1);
console.log('customers:', JSON.stringify([...customers.values()]));
console.log('orders:', JSON.stringify([...orders.values()]));
console.log('order item keys:', [...items.keys()].join(','));
`,
      checkpoint:
        '规范化结果必须为 customers=2、orders=2、order_items=3，客户 ada 的邮箱只保存一次。失败边界是保留重复客户行、订单商品缺少组合键，或拆分后丢失客户与订单的关联。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：SQL 查询、连接与分页': makeLab(
    'F3 代码台 02 · 真实 SQLite 连接与游标分页',
    '使用 Node 内置 node:sqlite 创建真实数据库，完成 JOIN 聚合统计与稳定键集分页，不依赖模拟字符串拼 SQL。',
    makeTask('foundations-remaining-f3-query-guided', {
      title: '跟做：JOIN、GROUP BY 与金额汇总',
      brief:
        '运行 node main.js。创建 SQLite 内存库，插入客户和订单，用参数绑定和 JOIN 查出每位客户的订单数与总额，并按总额降序。',
      input: {
        customers: [
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Lin' },
          { id: 3, name: 'Mo' },
        ],
        orders: [
          { id: 10, customerId: 1, total: 80 },
          { id: 11, customerId: 1, total: 45 },
          { id: 12, customerId: 2, total: 200 },
        ],
      },
      source: `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), total INTEGER NOT NULL CHECK(total >= 0))');
const insertCustomer = db.prepare('INSERT INTO customers VALUES (?, ?)');
for (const item of input.customers) insertCustomer.run(item.id, item.name);
const insertOrder = db.prepare('INSERT INTO orders VALUES (?, ?, ?)');
for (const item of input.orders) insertOrder.run(item.id, item.customerId, item.total);
const rows = db.prepare(\`
  SELECT c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS total
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id
  GROUP BY c.id, c.name
  ORDER BY total DESC, c.name ASC
\`).all();
assert.deepEqual(rows.map((row) => [row.name, row.order_count, row.total]), [
  ['Lin', 1, 200],
  ['Ada', 2, 125],
  ['Mo', 0, 0],
]);
console.log(JSON.stringify(rows));
`,
      checkpoint:
        '结果顺序必须为 Lin/1/200、Ada/2/125、Mo/0/0。失败边界是用 INNER JOIN 漏掉零订单客户、把 COUNT(o.id) 写成 COUNT(*)，或把金额拼接成字符串。',
    }),
    makeTask('foundations-remaining-f3-query-independent', {
      title: '独立实践：稳定键集分页',
      brief:
        '运行 node main.js。按 created_at、id 双字段游标分页，每页最多 2 条；验证跨页无重复、无遗漏，并说明为什么 offset 在并发写入时会漂移。',
      input: {
        pageSize: 2,
        rows: [
          { id: 5, createdAt: '2026-01-03' },
          { id: 2, createdAt: '2026-01-01' },
          { id: 4, createdAt: '2026-01-02' },
          { id: 7, createdAt: '2026-01-03' },
          { id: 1, createdAt: '2026-01-01' },
        ],
      },
      source: `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO events VALUES (?, ?)');
for (const row of input.rows) insert.run(row.id, row.createdAt);
const firstPageQuery = db.prepare('SELECT id, created_at FROM events ORDER BY created_at DESC, id DESC LIMIT ?');
const nextPageQuery = db.prepare(\`
  SELECT id, created_at
  FROM events
  WHERE (created_at, id) < (?, ?)
  ORDER BY created_at DESC, id DESC
  LIMIT ?
\`);
const pages = [];
let cursor = null;
while (true) {
  const rows = cursor
    ? nextPageQuery.all(cursor.createdAt, cursor.id, input.pageSize)
    : firstPageQuery.all(input.pageSize);
  if (rows.length === 0) break;
  pages.push(rows);
  const last = rows.at(-1);
  cursor = { createdAt: last.created_at, id: last.id };
}
const ids = pages.flat().map((row) => row.id);
assert.deepEqual(ids, [7, 5, 4, 2, 1]);
assert.equal(new Set(ids).size, input.rows.length);
console.log('pages:', pages.map((page) => page.map((row) => row.id).join(',')).join(' | '));
console.log('cursor after last page:', JSON.stringify(cursor));
`,
      checkpoint:
        '分页结果必须为 [7,5]、[4,2]、[1]，所有 id 唯一且总数为 5。失败边界是只按 created_at 分页导致同日数据重复、忘记第二排序键，或沿用旧 offset 跨并发写读取。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：索引、选择性与执行计划': makeLab(
    'F3 代码台 03 · 用 EXPLAIN QUERY PLAN 验证索引',
    '在真实 SQLite 数据上读取执行计划：先观察全表扫描，再创建合适索引，验证查询从 SCAN 变为 SEARCH，而不是凭列名猜索引是否生效。',
    makeTask('foundations-remaining-f3-index-guided', {
      title: '跟做：从全表扫描到索引搜索',
      brief:
        '运行 node main.js。创建订单表并插入数据，比较按 customer_id 查询前后的 EXPLAIN QUERY PLAN。',
      input: {
        orders: [
          { id: 1, customerId: 10, status: 'paid' },
          { id: 2, customerId: 11, status: 'paid' },
          { id: 3, customerId: 10, status: 'pending' },
        ],
        queryCustomerId: 10,
      },
      source: `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, status TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO orders VALUES (?, ?, ?)');
for (const row of input.orders) insert.run(row.id, row.customerId, row.status);
const sql = 'SELECT id FROM orders WHERE customer_id = ?';
const before = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(input.queryCustomerId);
db.exec('CREATE INDEX orders_customer_id_idx ON orders(customer_id)');
const after = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(input.queryCustomerId);
const beforeDetail = before.map((row) => row.detail).join(' | ');
const afterDetail = after.map((row) => row.detail).join(' | ');
assert.match(beforeDetail, /SCAN orders/);
assert.match(afterDetail, /SEARCH orders USING (COVERING )?INDEX orders_customer_id_idx/);
console.log('before:', beforeDetail);
console.log('after:', afterDetail);
console.log('rows:', db.prepare(sql).all(input.queryCustomerId).map((row) => row.id).join(','));
`,
      checkpoint:
        'before 必须出现 SCAN orders，after 必须出现 SEARCH orders USING INDEX orders_customer_id_idx，查询返回订单 1 和 3。失败边界是索引建在错误列、低选择性布尔列导致仍扫全表，或只看 SQL 不读执行计划。',
    }),
    makeTask('foundations-remaining-f3-index-independent', {
      title: '独立实践：复合索引与覆盖查询',
      brief:
        '运行 node main.js。为租户、状态、创建时间建立复合索引，验证查询计划使用该索引，并比较只选索引列与额外取大字段的计划差异。',
      input: {
        tenantId: 7,
        status: 'paid',
        rows: [
          { id: 1, tenantId: 7, status: 'paid', createdAt: '2026-01-01', payload: 'a' },
          { id: 2, tenantId: 7, status: 'paid', createdAt: '2026-01-03', payload: 'b' },
          { id: 3, tenantId: 8, status: 'paid', createdAt: '2026-01-04', payload: 'c' },
          { id: 4, tenantId: 7, status: 'pending', createdAt: '2026-01-02', payload: 'd' },
        ],
      },
      source: `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE invoices (id INTEGER PRIMARY KEY, tenant_id INTEGER, status TEXT, created_at TEXT, payload TEXT)');
const insert = db.prepare('INSERT INTO invoices VALUES (?, ?, ?, ?, ?)');
for (const row of input.rows) insert.run(row.id, row.tenantId, row.status, row.createdAt, row.payload);
db.exec('CREATE INDEX invoices_tenant_status_created_idx ON invoices(tenant_id, status, created_at, id)');
const sql = 'SELECT id, created_at FROM invoices WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC, id DESC';
const plan = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(input.tenantId, input.status);
const detail = plan.map((row) => row.detail).join(' | ');
assert.match(detail, /USING (COVERING )?INDEX invoices_tenant_status_created_idx/);
const rows = db.prepare(sql).all(input.tenantId, input.status);
assert.deepEqual(rows.map((row) => row.id), [2, 1]);
console.log('plan:', detail);
console.log('result ids:', rows.map((row) => row.id).join(','));
`,
      checkpoint:
        '执行计划必须使用 invoices_tenant_status_created_idx，结果按创建时间倒序为订单 2、1。失败边界是索引顺序与 WHERE 前缀不匹配、忽略 ORDER BY 导致临时排序，或认为任何索引都会消除所有读取。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：事务、隔离级别与锁': makeLab(
    'F3 代码台 04 · 回滚、快照与写冲突',
    '用真实 SQLite 事务验证失败时整笔回滚，再打开两个连接观察 WAL 快照读和 BEGIN IMMEDIATE 的写锁冲突。',
    makeTask('foundations-remaining-f3-transaction-guided', {
      title: '跟做：约束失败后整笔回滚',
      brief:
        '运行 node main.js。在一个事务中插入两条流水，第二条故意违约；捕获错误后 rollback，并核对表内没有半笔数据。',
      input: {
        accountId: 1,
        entries: [
          { id: 100, amount: 50 },
          { id: 100, amount: -10 },
        ],
      },
      source: `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE ledgers (id INTEGER PRIMARY KEY, account_id INTEGER, amount INTEGER NOT NULL)');
db.exec('BEGIN IMMEDIATE');
let errorCode = null;
try {
  const insert = db.prepare('INSERT INTO ledgers VALUES (?, ?, ?)');
  for (const entry of input.entries) insert.run(entry.id, input.accountId, entry.amount);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  errorCode = error.code || error.message;
}
const count = db.prepare('SELECT COUNT(*) AS n FROM ledgers').get().n;
assert.equal(count, 0);
assert.ok(errorCode);
console.log('rollback error:', errorCode);
console.log('rows after rollback:', count);
`,
      checkpoint:
        '错误码应体现 PRIMARY KEY 冲突，rows after rollback 必须为 0。失败边界是 catch 后继续 COMMIT、自动提交模式下逐条写入，或只删除第二条而保留第一条形成半笔账。',
    }),
    makeTask('foundations-remaining-f3-transaction-independent', {
      title: '独立实践：WAL 快照与写锁竞争',
      brief:
        '运行 node main.js。两个连接打开同一个临时 WAL 数据库；连接 A 持有 IMMEDIATE 事务时，B 的快照读取旧值，B 的写入必须收到 busy 锁冲突。',
      input: { initialValue: 1, nextValue: 2 },
      source: `
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-transaction-'));
const file = path.join(dir, 'lock.db');
const a = new DatabaseSync(file);
const b = new DatabaseSync(file);
try {
  a.exec('PRAGMA journal_mode = WAL');
  a.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
  a.prepare('INSERT INTO state VALUES (1, ?)').run(input.initialValue);
  a.exec('BEGIN IMMEDIATE');
  a.prepare('UPDATE state SET value = ? WHERE id = 1').run(input.nextValue);
  const snapshot = b.prepare('SELECT value FROM state WHERE id = 1').get().value;
  let writeError = null;
  try {
    b.exec('BEGIN IMMEDIATE');
    b.prepare('UPDATE state SET value = 99 WHERE id = 1').run();
  } catch (error) {
    writeError = [error.code, error.message].filter(Boolean).join(': ');
  } finally {
    try { b.exec('ROLLBACK'); } catch {}
  }
  a.exec('COMMIT');
  const committed = b.prepare('SELECT value FROM state WHERE id = 1').get().value;
  assert.equal(snapshot, input.initialValue);
  assert.match(String(writeError), /BUSY|locked/i);
  assert.equal(committed, input.nextValue);
  console.log('reader snapshot before commit:', snapshot);
  console.log('second writer error:', writeError);
  console.log('value after commit:', committed);
} finally {
  a.close();
  b.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      checkpoint:
        'reader snapshot before commit 必须为 1，second writer error 应包含 BUSY/locked，提交后 value 为 2。失败边界是把快照读当脏读、B 阻塞后忘记回滚，或把 busy 自动重试成静默覆盖。',
    }),
  ),

  'programming:编程通识 · 数据库、事务与数据建模：备份、恢复与一致性校验': makeLab(
    'F3 代码台 05 · 可校验备份与恢复计划',
    '用 SQLite VACUUM INTO 和 SHA-256 生成可验证备份，再根据备份清单、完整性和恢复时点选择真正能恢复的数据。',
    makeTask('foundations-remaining-f3-backup-guided', {
      title: '跟做：生成备份、破坏主库并恢复',
      brief:
        '运行 node main.js。创建临时 SQLite 文件，VACUUM INTO 生成备份并记录哈希；修改主库后把备份复制回来，核对旧值恢复。',
      input: {
        rows: [
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Lin' },
        ],
        updateName: 'Changed',
      },
      source: `
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-backup-'));
const liveFile = path.join(dir, 'live.db');
const backupFile = path.join(dir, 'backup.db');
try {
  const live = new DatabaseSync(liveFile);
  live.exec('CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const insert = live.prepare('INSERT INTO people VALUES (?, ?)');
  for (const row of input.rows) insert.run(row.id, row.name);
  live.exec("VACUUM INTO '" + backupFile.replaceAll("'", "''") + "'");
  live.prepare('UPDATE people SET name = ? WHERE id = 1').run(input.updateName);
  const changed = live.prepare('SELECT name FROM people WHERE id = 1').get().name;
  live.close();
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  fs.copyFileSync(backupFile, liveFile);
  const restored = new DatabaseSync(liveFile);
  const restoredName = restored.prepare('SELECT name FROM people WHERE id = 1').get().name;
  const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
  restored.close();
  assert.equal(changed, input.updateName);
  assert.equal(restoredName, 'Ada');
  assert.equal(integrity, 'ok');
  console.log('changed before restore:', changed);
  console.log('restored value:', restoredName);
  console.log('backup sha256:', checksum.slice(0, 16));
  console.log('integrity_check:', integrity);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
`,
      checkpoint:
        'changed before restore 为 Changed，restored value 回到 Ada，integrity_check 为 ok，并输出备份哈希前 16 位。失败边界是只备份 WAL 而漏备份主文件、恢复后不校验，或把可写主库当成备份。',
    }),
    makeTask('foundations-remaining-f3-backup-independent', {
      title: '独立实践：按恢复点选择可信备份',
      brief:
        '运行 node main.js。从备份清单中排除过期、校验失败的候选，在恢复目标时刻之前选择最新的可信全量备份，并输出需要重放的日志区间。',
      input: {
        recoveryTime: '2026-01-05T12:00:00Z',
        backups: [
          { id: 'full-01', at: '2026-01-01T00:00:00Z', checksumOk: true, integrity: 'ok' },
          { id: 'full-03', at: '2026-01-03T00:00:00Z', checksumOk: true, integrity: 'ok' },
          { id: 'full-04', at: '2026-01-04T00:00:00Z', checksumOk: false, integrity: 'ok' },
          { id: 'full-06', at: '2026-01-06T00:00:00Z', checksumOk: true, integrity: 'ok' },
        ],
        logs: [
          { id: 'wal-01', from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', checksumOk: true },
          { id: 'wal-03', from: '2026-01-03T00:00:00Z', to: '2026-01-05T12:00:00Z', checksumOk: true },
        ],
      },
      source: `
const target = Date.parse(input.recoveryTime);
const candidates = input.backups
  .filter((item) => Date.parse(item.at) <= target && item.checksumOk && item.integrity === 'ok')
  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const selected = candidates[0];
const start = Date.parse(selected.at);
const logs = input.logs
  .filter((item) => Date.parse(item.from) >= start && Date.parse(item.to) <= target && item.checksumOk)
  .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
const coveredUntil = logs.at(-1)?.to || selected.at;
assert.equal(selected.id, 'full-03');
assert.deepEqual(logs.map((item) => item.id), ['wal-03']);
assert.equal(coveredUntil, input.recoveryTime);
console.log('selected backup:', selected.id);
console.log('replay logs:', logs.map((item) => item.id).join(','));
console.log('covered until:', coveredUntil);
`,
      checkpoint:
        '必须选择 full-03，重放 wal-03，covered until 恰好是恢复目标时间。失败边界是选择更晚但校验失败的 full-04、选择目标之后的全量备份，或恢复后不重放目标时间前的日志。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：单元、集成、契约与端到端测试': makeLab(
    'F4 代码台 01 · 四层测试与变异杀伤',
    '用一个可观察的折扣服务分别验证单元、集成、契约和端到端断言，再用变异体检查测试是否真的能发现逻辑被改坏。',
    makeTask('foundations-remaining-f4-tests-guided', {
      title: '跟做：同一业务穿过四层测试',
      brief:
        '运行 node main.js。分别执行纯函数断言、内存仓储集成、响应契约和用户流程断言，输出每层通过的测试名。',
      input: {
        orders: [
          { id: 1, total: 100, member: true },
          { id: 2, total: 50, member: false },
        ],
      },
      source: `
const discount = (total, member) => total >= 100 && member ? total * 0.9 : total;
const repository = {
  rows: [...input.orders],
  find(id) { return this.rows.find((row) => row.id === id); },
};
const service = (id) => {
  const row = repository.find(id);
  if (!row) throw new Error('not found');
  return { id, payable: discount(row.total, row.member), currency: 'CNY' };
};
const passed = [];
assert.equal(discount(100, true), 90);
passed.push('unit');
const saved = service(1);
assert.equal(saved.payable, 90);
passed.push('integration');
assert.deepEqual(Object.keys(saved).sort(), ['currency', 'id', 'payable']);
passed.push('contract');
const flow = service(repository.rows[0].id);
assert.equal(flow.currency, 'CNY');
assert.equal(flow.payable, 90);
passed.push('e2e');
assert.deepEqual(passed, ['unit', 'integration', 'contract', 'e2e']);
console.log('passed layers:', passed.join(' -> '));
console.log('saved response:', JSON.stringify(saved));
`,
      checkpoint:
        '四层测试必须依次通过 unit、integration、contract、e2e，响应包含 id、payable、currency 且 payable=90。失败边界是只测纯函数、契约只比较 HTTP 200、端到端测试重复单元断言而没有穿过流程。',
    }),
    makeTask('foundations-remaining-f4-tests-independent', {
      title: '独立实践：变异测试必须杀死每个缺陷',
      brief:
        '运行 node main.js。对运费函数制造四个变异体，执行一组边界测试；任何存活变异体都会让实验失败。',
      input: {
        cases: [
          { total: 99, expected: 8 },
          { total: 100, expected: 0 },
          { total: 101, expected: 0 },
        ],
      },
      source: `
const correct = (total) => total >= 100 ? 0 : 8;
const mutants = [
  { name: 'strict-greater', fn: (total) => total > 100 ? 0 : 8 },
  { name: 'always-free', fn: () => 0 },
  { name: 'always-eight', fn: () => 8 },
  { name: 'inverted', fn: (total) => total >= 100 ? 8 : 0 },
];
const runTests = (fn) => input.cases.every((item) => fn(item.total) === item.expected);
assert.equal(runTests(correct), true);
const survived = mutants.filter((mutant) => runTests(mutant.fn)).map((mutant) => mutant.name);
assert.deepEqual(survived, []);
console.log('correct implementation passed:', runTests(correct));
console.log('killed mutants:', mutants.map((item) => item.name).join(','));
console.log('survived mutants:', survived.length);
`,
      checkpoint:
        '正确实现必须通过，四个变异体全部被杀死，survived mutants 为 0。失败边界是测试只覆盖 100 以上、遗漏 99 边界，或把实现自身输出当期望值造成同义反复。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：断点、日志、堆栈与最小复现': makeLab(
    'F4 代码台 02 · 堆栈定位与自动最小化',
    '先解析异常堆栈并找出业务帧与最后一个状态变化，再用 delta debugging 删除无关步骤，留下仍能复现故障的最小事件序列。',
    makeTask('foundations-remaining-f4-debug-guided', {
      title: '跟做：从堆栈回到最后一个业务事件',
      brief:
        '运行 node main.js。stdin 提供异常堆栈和事件时间线；过滤 node_modules 帧，选择最上层业务帧，并定位最后一个改变状态的事件。',
      input: {
        targetFile: 'src/cart/service.js',
        stack: [
          'Error: total is not a function',
          '    at renderTotal (/app/node_modules/render/index.js:20:9)',
          '    at calculateTotal (/app/src/cart/service.js:44:12)',
          '    at checkout (/app/src/checkout.js:18:5)',
        ],
        events: [
          { at: 1, type: 'add-item', totalType: 'number' },
          { at: 2, type: 'apply-coupon', totalType: 'number' },
          { at: 3, type: 'legacy-adapter', totalType: 'string' },
          { at: 4, type: 'render-total', totalType: 'string' },
        ],
      },
      source: `
const frames = input.stack.filter((line) => line.includes(' (/'))
  .map((line) => {
    const match = line.match(/at .* \\((.+):(\\d+):(\\d+)\\)/);
    return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
  });
const businessFrame = frames.find((frame) => frame.file.replace(/^\\/app\\//, '').includes(input.targetFile));
const lastMutation = [...input.events].reverse().find((event, index, all) => {
  const previous = all[index + 1];
  return !previous || previous.totalType !== event.totalType;
});
assert.equal(businessFrame.file.replace(/^\\/app\\//, ''), 'src/cart/service.js');
assert.equal(businessFrame.line, 44);
assert.equal(lastMutation.type, 'legacy-adapter');
assert.equal(lastMutation.totalType, 'string');
console.log('business frame:', businessFrame.file + ':' + businessFrame.line);
console.log('type changed at:', lastMutation.type);
console.log('observed type:', lastMutation.totalType);
`,
      checkpoint:
        '业务帧必须是 src/cart/service.js:44，类型从 number 变成 string 的首个事件是 legacy-adapter。失败边界是只看最顶层第三方帧、把报错行当根因、忽略事件之间的状态类型变化。',
    }),
    makeTask('foundations-remaining-f4-debug-independent', {
      title: '独立实践：ddmin 删除无关复现步骤',
      brief:
        '运行 node main.js。测试函数只在同时出现缓存空值和缺少空值保护时失败；用逐步删除法得到仍能失败的最小事件集合。',
      input: {
        events: ['login', 'seed-cache', 'cache-expired', 'render-profile', 'missing-null-check', 'collect-metrics'],
      },
      source: `
const fails = (events) => events.includes('cache-expired') && events.includes('missing-null-check');
assert.equal(fails(input.events), true);
let minimal = [...input.events];
let changed = true;
while (changed) {
  changed = false;
  for (let index = 0; index < minimal.length; index += 1) {
    const candidate = minimal.filter((_, current) => current !== index);
    if (fails(candidate)) {
      minimal = candidate;
      changed = true;
      break;
    }
  }
}
assert.deepEqual(minimal, ['cache-expired', 'missing-null-check']);
for (const event of minimal) {
  const without = minimal.filter((item) => item !== event);
  assert.equal(fails(without), false);
}
console.log('original events:', input.events.length);
console.log('minimal reproduction:', minimal.join(' -> '));
console.log('each remaining item is necessary:', true);
`,
      checkpoint:
        '最小复现必须只剩 cache-expired 与 missing-null-check，且删掉任一项都不再失败。失败边界是保留无关 login/seed 事件、只截取异常消息当复现，或删除过度后测试连问题本身都不触发。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：错误模型与失败注入': makeLab(
    'F4 代码台 03 · 问题详情与重试预算',
    '把内部异常映射成稳定外部错误，再对瞬时错误执行有上限的指数退避；永久错误和越权错误不得被盲目重试。',
    makeTask('foundations-remaining-f4-errors-guided', {
      title: '跟做：不泄露内部细节的问题详情',
      brief:
        '运行 node main.js。把数据库超时、字段校验和未登录异常映射为 problem details，保留 trace_id 并移除 SQL、主机名和堆栈。',
      input: {
        traceId: 'trace-7f2a',
        errors: [
          { code: 'VALIDATION', field: 'email', message: 'must contain @' },
          { code: 'UNAUTHENTICATED', message: 'token expired' },
          { code: 'DB_TIMEOUT', message: 'connect 10.0.0.8:5432 select * from users' },
        ],
      },
      source: `
const map = {
  VALIDATION: { status: 422, title: 'Request validation failed' },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  DB_TIMEOUT: { status: 503, title: 'Service temporarily unavailable' },
};
const problems = input.errors.map((error) => {
  const base = map[error.code];
  assert.ok(base, 'unmapped error ' + error.code);
  const problem = {
    type: 'urn:problem:' + error.code.toLowerCase(),
    title: base.title,
    status: base.status,
    traceId: input.traceId,
  };
  if (error.code === 'VALIDATION') problem.errors = [{ field: error.field, message: error.message }];
  return problem;
});
assert.deepEqual(problems.map((item) => item.status), [422, 401, 503]);
assert.equal(JSON.stringify(problems).includes('select *'), false);
assert.equal(JSON.stringify(problems).includes('10.0.0.8'), false);
console.log(JSON.stringify(problems));
`,
      checkpoint:
        '问题详情状态必须依次为 422、401、503，并只带公开字段且每项含 traceId；输出不得包含 SQL 或数据库主机 10.0.0.8。失败边界是把异常 message 原样返回、所有错误都映射 500，或丢失排障所需 trace id。',
    }),
    makeTask('foundations-remaining-f4-errors-independent', {
      title: '独立实践：按错误类别消耗重试预算',
      brief:
        '运行 node main.js。瞬时错误按指数退避和固定抖动重试，直到成功或预算耗尽；永久错误和认证错误立即停止。',
      input: {
        maxAttempts: 4,
        attempts: [
          { id: 1, code: 'TIMEOUT', kind: 'transient' },
          { id: 2, code: 'UNAVAILABLE', kind: 'transient' },
          { id: 3, code: 'INVALID_REQUEST', kind: 'permanent' },
          { id: 4, code: 'OK', kind: 'success' },
        ],
        jitter: [5, 13, 3],
      },
      source: `
const results = [];
let attemptIndex = 0;
let retries = 0;
while (attemptIndex < input.attempts.length && retries < input.maxAttempts) {
  const attempt = input.attempts[attemptIndex];
  results.push({ id: attempt.id, code: attempt.code, decision: attempt.kind });
  if (attempt.kind === 'success' || attempt.kind === 'permanent') break;
  if (attempt.kind === 'auth') break;
  const delay = 10 * (2 ** retries) + input.jitter[retries];
  results.at(-1).delayMs = delay;
  retries += 1;
  attemptIndex += 1;
}
assert.equal(results.at(-1).code, 'INVALID_REQUEST');
assert.equal(results.at(-1).delayMs, undefined);
assert.equal(retries, 2);
console.log(JSON.stringify(results));
console.log('retry budget consumed:', retries);
`,
      checkpoint:
        '第三次 INVALID_REQUEST 后必须立即停止，之前两次瞬时错误产生延迟 15ms 与 33ms，实际重试次数为 2。失败边界是永久错误继续重试、无限重试、忽略抖动上限，或在认证失败时反复刷新同一凭据。',
    }),
  ),

  'programming:编程通识 · 测试、调试与安全工程：依赖、秘密与供应链风险': makeLab(
    'F4 代码台 04 · 锁文件、SBOM 与秘密泄漏',
    '先比对 lockfile 与 SBOM 发现未锁定依赖和缺失传递依赖，再扫描日志中的令牌与密码，验证脱敏后仍能保留排障定位信息。',
    makeTask('foundations-remaining-f4-supply-guided', {
      title: '跟做：核对锁定版本与完整性哈希',
      brief:
        '运行 node main.js。stdin 提供 package 清单、lockfile 与 SBOM；找出范围版本、哈希不一致和 SBOM 漏项。',
      input: {
        manifest: { app: '1.0.0', 'left-pad': '^1.3.0', 'tiny-log': '2.1.0' },
        lock: [
          { name: 'left-pad', version: '1.3.0', integrity: 'sha-a' },
          { name: 'tiny-log', version: '2.1.0', integrity: 'sha-b' },
          { name: 'log-core', version: '0.4.0', integrity: 'sha-c' },
        ],
        sbom: [
          { name: 'left-pad', version: '1.3.0', integrity: 'sha-a' },
          { name: 'tiny-log', version: '2.1.0', integrity: 'sha-x' },
        ],
      },
      source: `
const issues = [];
for (const [name, range] of Object.entries(input.manifest)) {
  if (name === 'app') continue;
  if (/^[~^*]/.test(range)) issues.push('range-version:' + name);
  if (!input.lock.some((item) => item.name === name)) issues.push('missing-lock:' + name);
}
for (const locked of input.lock) {
  const bomItem = input.sbom.find((item) => item.name === locked.name);
  if (!bomItem) issues.push('missing-sbom:' + locked.name);
  else if (bomItem.integrity !== locked.integrity) issues.push('hash-mismatch:' + locked.name);
}
assert.deepEqual(issues, [
  'range-version:left-pad',
  'hash-mismatch:tiny-log',
  'missing-sbom:log-core',
]);
console.log('supply-chain issues:', issues.join(' | '));
console.log('locked components:', input.lock.map((item) => item.name + '@' + item.version).join(','));
`,
      checkpoint:
        '必须报告 left-pad 范围版本、log-core 缺 SBOM、tiny-log 哈希不一致。失败边界是只检查直接依赖、把锁文件存在当所有依赖可信，或忽略未出现在 SBOM 的传递依赖。',
    }),
    makeTask('foundations-remaining-f4-supply-independent', {
      title: '独立实践：日志秘密扫描与可排障脱敏',
      brief:
        '运行 node main.js。扫描日志中的 Bearer token、密码和邮箱，做不可逆掩码；保留请求 id 和错误位置用于排障。',
      input: {
        lines: [
          'level=info request=req-1 user=ada@example.test',
          'level=debug request=req-2 authorization=Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
          'level=error request=req-3 password=hunter2 at=db.connect',
        ],
      },
      source: `
const redact = (line) => line
  .replace(/Bearer\\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
  .replace(/password=([^\\s]+)/gi, 'password=[REDACTED]')
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g, '[EMAIL]');
const redacted = input.lines.map(redact);
const joined = redacted.join('\\n');
assert.equal(joined.includes('hunter2'), false);
assert.equal(joined.includes('payload.signature'), false);
assert.equal(joined.includes('ada@example.test'), false);
assert.match(joined, /request=req-2/);
assert.match(joined, /request=req-3/);
assert.match(joined, /at=db\\.connect/);
console.log(redacted.join('\\n'));
`,
      checkpoint:
        '输出必须清除 token、密码和邮箱，但仍保留 req-2、req-3 与 at=db.connect。失败边界是只删整行日志、用可逆 Base64 当脱敏，或连请求 id 一起删除导致无法关联事故。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：镜像分层与多阶段构建': makeLab(
    'F5 代码台 01 · Dockerfile 契约与多阶段产物',
    '用确定性模型检查 Dockerfile 已固定基础镜像、未写入秘密并按层聚合命令，再追踪多阶段构建只把运行产物复制到最终镜像。',
    makeTask('foundations-remaining-f5-image-guided', {
      title: '跟做：解析 Dockerfile 的层与风险',
      brief:
        '运行 node main.js。stdin 提供 Dockerfile 行；解析 FROM、WORKDIR、COPY、RUN，标记 latest 标签、秘密环境变量和连续 RUN 层。',
      input: {
        dockerfile: [
          'FROM node:24-bookworm AS build',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci',
          'RUN npm run build',
          'ENV NPM_TOKEN=secret-value',
          'COPY dist ./dist',
        ],
      },
      source: `
const instructions = input.dockerfile.map((raw, index) => {
  const [verb, ...rest] = raw.trim().split(/\\s+/);
  return { index, verb: verb.toUpperCase(), args: rest.join(' ') };
});
const from = instructions.filter((item) => item.verb === 'FROM');
const runLayers = instructions.filter((item) => item.verb === 'RUN');
const risks = [];
if (from.some((item) => /:latest\\b|\\bFROM\\s+[^:\\s]+(?:\\s|$)/.test(item.args))) risks.push('mutable-base');
if (instructions.some((item) => item.verb === 'ENV' && /(?:TOKEN|PASSWORD|SECRET)=/i.test(item.args))) risks.push('secret-in-layer');
if (runLayers.length > 1) risks.push('extra-cache-layer');
assert.deepEqual(risks, ['secret-in-layer', 'extra-cache-layer']);
assert.equal(runLayers.length, 2);
console.log('FROM stages:', from.map((item) => item.args).join(' | '));
console.log('RUN layers:', runLayers.length);
console.log('risks:', risks.join(','));
`,
      checkpoint:
        '必须识别 NPM_TOKEN 明文进入 ENV 层，以及两条本可合并的 RUN 层；解析出 build 阶段。失败边界是把密码写进 ARG/ENV、每次 RUN 都新增层却以为构建器会自动合并，或使用 node:latest。',
    }),
    makeTask('foundations-remaining-f5-image-independent', {
      title: '独立实践：只复制运行产物到最终镜像',
      brief:
        '运行 node main.js。按构建阶段依赖拓扑展开，验证最终运行阶段只复制编译产物和锁文件，不复制源码、测试或开发依赖。',
      input: {
        stages: [
          { name: 'deps', needs: [], outputBytes: 420 },
          { name: 'build', needs: ['deps'], outputBytes: 900 },
          { name: 'runtime', needs: ['build'], outputBytes: 180 },
        ],
        runtimeCopies: ['dist', 'package.json', 'package-lock.json'],
        forbiddenPaths: ['src', 'tests', 'node_modules'],
      },
      source: `
const byName = new Map(input.stages.map((stage) => [stage.name, stage]));
const order = [];
const visiting = new Set();
const visit = (name) => {
  assert.ok(byName.has(name), 'unknown stage ' + name);
  assert.equal(visiting.has(name), false, 'cycle at ' + name);
  if (order.includes(name)) return;
  visiting.add(name);
  for (const need of byName.get(name).needs) visit(need);
  visiting.delete(name);
  order.push(name);
};
for (const stage of input.stages) visit(stage.name);
const runtime = byName.get('runtime');
const copiedForbidden = input.runtimeCopies.filter((path) => input.forbiddenPaths.some((bad) => path === bad || path.startsWith(bad + '/')));
assert.deepEqual(order, ['deps', 'build', 'runtime']);
assert.deepEqual(copiedForbidden, []);
assert.ok(runtime.outputBytes < byName.get('build').outputBytes);
console.log('stage order:', order.join(' -> '));
console.log('runtime copies:', input.runtimeCopies.join(','));
console.log('runtime bytes:', runtime.outputBytes);
`,
      checkpoint:
        '阶段顺序必须是 deps、build、runtime，运行镜像只复制 dist 和两个包清单，runtime 体积小于 build。失败边界是把整个仓库 COPY 到运行阶段、把 node_modules 作为运行产物，或让循环依赖不报错。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：Compose、数据卷与健康检查': makeLab(
    'F5 代码台 02 · Compose 依赖顺序与真实健康进程',
    '先按 depends_on 拓扑排序并核对数据卷和 healthcheck，再启动两个真实 Node 回环 HTTP 子进程，等待依赖健康后才标记下一服务可用。',
    makeTask('foundations-remaining-f5-compose-guided', {
      title: '跟做：服务依赖、卷和健康检查',
      brief:
        '运行 node main.js。stdin 用规范化 Compose 契约描述 web、api、db；验证依赖顺序、持久卷挂载与 API 健康检查。',
      input: {
        services: {
          db: { dependsOn: [], healthcheck: 'pg_isready', volumes: ['pgdata:/var/lib/postgresql/data'] },
          api: { dependsOn: ['db'], healthcheck: '/healthz', volumes: [] },
          web: { dependsOn: ['api'], healthcheck: 'GET /', volumes: [] },
        },
        volumes: { pgdata: 'local' },
      },
      source: `
const order = [];
const visiting = new Set();
const visit = (name) => {
  assert.ok(input.services[name], 'unknown service ' + name);
  assert.equal(visiting.has(name), false, 'dependency cycle at ' + name);
  if (order.includes(name)) return;
  visiting.add(name);
  for (const dependency of input.services[name].dependsOn) visit(dependency);
  visiting.delete(name);
  order.push(name);
};
for (const name of Object.keys(input.services)) visit(name);
const dbMounts = input.services.db.volumes.map((mount) => mount.split(':')[0]);
assert.deepEqual(order, ['db', 'api', 'web']);
assert.equal(input.volumes.pgdata, 'local');
assert.deepEqual(dbMounts, ['pgdata']);
assert.ok(Object.values(input.services).every((service) => service.healthcheck));
console.log('startup order:', order.join(' -> '));
console.log('persistent volumes:', dbMounts.join(','));
console.log('healthchecks:', Object.entries(input.services).map(([name, item]) => name + '=' + item.healthcheck).join(', '));
`,
      checkpoint:
        '启动顺序必须为 db -> api -> web，pgdata 是持久卷，三个服务都有健康检查。失败边界是把 depends_on 当自动等待健康、把匿名目录误当持久卷，或循环依赖时仍继续启动。',
    }),
    makeTask('foundations-remaining-f5-compose-independent', {
      title: '独立实践：本地进程健康门禁',
      brief:
        '运行 node main.js。启动真实 Node HTTP 子进程模拟 db 与 api；只有依赖的 /health 返回 200，才启动下一服务，结束后终止两个进程。',
      input: { readinessDelayMs: 15 },
      source: `
const http = require('node:http');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const startService = async (name) => {
  const code = [
    "const http = require('node:http');",
    'const name = process.argv[1];',
    'const delay = Number(process.argv[2]);',
    "const server = http.createServer((request, response) => response.end(JSON.stringify({ ok: true, name })));",
    "setTimeout(() => server.listen(0, '127.0.0.1', () => { console.log(JSON.stringify({ port: server.address().port })); }), delay);",
  ].join('\\n');
  const child = spawn(process.execPath, ['-e', code, name, String(input.readinessDelayMs)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const line = await new Promise((resolve, reject) => {
    const reader = readline.createInterface({ input: child.stdout });
    reader.once('line', resolve);
    child.once('error', reject);
  });
  return { child, port: JSON.parse(line).port };
};
const health = (port) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/health' }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.once('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
  }).once('error', reject);
});
const events = [];
const db = await startService('db');
events.push('db:listening');
const dbHealth = await health(db.port);
assert.equal(dbHealth.body.name, 'db');
events.push('db:healthy');
const api = await startService('api');
events.push('api:listening');
const apiHealth = await health(api.port);
assert.equal(apiHealth.body.name, 'api');
events.push('api:healthy');
db.child.kill();
api.child.kill();
await Promise.all([new Promise((resolve) => db.child.once('exit', resolve)), new Promise((resolve) => api.child.once('exit', resolve))]);
assert.deepEqual(events, ['db:listening', 'db:healthy', 'api:listening', 'api:healthy']);
console.log('lifecycle:', events.join(' -> '));
console.log('http status:', dbHealth.status + ',' + apiHealth.status);
`,
      checkpoint:
        '生命周期必须为 db:listening -> db:healthy -> api:listening -> api:healthy，两个 HTTP 状态均为 200。失败边界是只检查进程存在不检查健康、依赖未健康就启动 API，或测试后残留监听进程。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：CI 缓存、测试矩阵与制品': makeLab(
    'F5 代码台 03 · 可失效缓存键与流水线依赖图',
    '缓存键必须同时包含锁文件、平台和工具链，测试矩阵覆盖目标组合；再把构建、测试、发布编排成带制品校验的依赖图。',
    makeTask('foundations-remaining-f5-ci-guided', {
      title: '跟做：计算缓存键并展开测试矩阵',
      brief:
        '运行 node main.js。根据锁文件内容、操作系统和 Node 版本生成缓存键，再展开测试矩阵并断言每个组合的唯一键。',
      input: {
        lockfile: 'lock:sha256:abc123',
        platforms: ['linux', 'windows'],
        nodeVersions: ['20', '24'],
        cachePath: '~/.pnpm-store',
      },
      source: `
const crypto = require('node:crypto');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
const matrix = input.platforms.flatMap((os) => input.nodeVersions.map((node) => ({ os, node })));
const entries = matrix.map((item) => ({
  ...item,
  cacheKey: 'node-' + hash([input.lockfile, item.os, item.node].join('|')),
}));
assert.equal(entries.length, 4);
assert.equal(new Set(entries.map((item) => item.cacheKey)).size, 4);
assert.equal(new Set(entries.map((item) => item.os + '-' + item.node)).size, 4);
console.log('matrix:', entries.map((item) => item.os + '/node-' + item.node).join(', '));
console.log('cache keys:', entries.map((item) => item.cacheKey).join(','));
console.log('cache path:', input.cachePath);
`,
      checkpoint:
        '矩阵必须展开 4 个组合、生成 4 个不同缓存键，并输出 pnpm store 路径。失败边界是缓存键缺平台或锁文件、用日期让缓存永远不命中，或多个矩阵任务共享一个会相互覆盖的构建目录。',
    }),
    makeTask('foundations-remaining-f5-ci-independent', {
      title: '独立实践：依赖图、制品哈希与失败短路',
      brief:
        '运行 node main.js。按 needs 调度 build、unit、e2e、package、deploy；校验制品摘要，并在依赖失败时阻止后续任务。',
      input: {
        jobs: [
          { id: 'build', needs: [], output: 'dist', integrity: 'sha-app' },
          { id: 'unit', needs: ['build'], output: 'reports/unit.xml' },
          { id: 'e2e', needs: ['build'], output: 'reports/e2e.xml' },
          { id: 'package', needs: ['unit', 'e2e'], output: 'app.tgz', integrity: 'sha-app' },
          { id: 'deploy', needs: ['package'], output: 'deployment-id' },
        ],
        expectedArtifact: 'sha-app',
      },
      source: `
const byId = new Map(input.jobs.map((job) => [job.id, job]));
const state = new Map();
const order = [];
const run = (id) => {
  if (state.has(id)) return state.get(id);
  const job = byId.get(id);
  assert.ok(job, 'unknown job ' + id);
  const dependenciesOk = job.needs.every((need) => run(need) === 'success');
  if (!dependenciesOk) {
    state.set(id, 'blocked');
    return 'blocked';
  }
  if (job.integrity && job.integrity !== input.expectedArtifact) {
    state.set(id, 'failed-integrity');
    return 'failed-integrity';
  }
  order.push(id);
  state.set(id, 'success');
  return 'success';
};
const result = run('deploy');
assert.equal(result, 'success');
assert.deepEqual(order, ['build', 'unit', 'e2e', 'package', 'deploy']);
assert.equal(state.get('deploy'), 'success');
console.log('execution order:', order.join(' -> '));
console.log('artifact integrity:', input.expectedArtifact);
console.log('deploy state:', result);
`,
      checkpoint:
        '执行顺序必须是 build -> unit -> e2e -> package -> deploy，且制品摘要与期望 sha-app 一致。失败边界是 e2e 未完成就打包、忽略制品哈希，或上游失败后仍部署旧产物。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：日志、指标、Trace 与告警': makeLab(
    'F5 代码台 04 · 结构化日志、SLO 与可行动告警',
    '先把 NDJSON 日志按 trace id 关联并脱敏，再从请求样本计算可用率、延迟分位数和错误预算燃烧率，生成可执行告警。',
    makeTask('foundations-remaining-f5-observability-guided', {
      title: '跟做：关联日志并保留排障字段',
      brief:
        '运行 node main.js。解析每行 JSON 日志，按 trace_id 聚合 span，脱敏邮箱并输出失败请求的首次错误和服务链。',
      input: {
        lines: [
          '{"ts":1,"trace_id":"t1","service":"web","event":"request","user":"ada@example.test"}',
          '{"ts":2,"trace_id":"t1","service":"api","event":"db-timeout","error":"deadline"}',
          '{"ts":3,"trace_id":"t1","service":"web","event":"response","status":503}',
          '{"ts":4,"trace_id":"t2","service":"web","event":"response","status":200}',
        ],
      },
      source: `
const records = input.lines.map((line) => JSON.parse(line));
const traces = new Map();
for (const record of records) {
  if (!traces.has(record.trace_id)) traces.set(record.trace_id, []);
  traces.get(record.trace_id).push(record);
}
const failed = [...traces.entries()].find(([, spans]) => spans.some((span) => span.status >= 500));
const [traceId, spans] = failed;
const firstError = spans.find((span) => span.error);
const services = spans.map((span) => span.service);
const redacted = records.map((record) => ({
  ...record,
  user: record.user ? record.user.replace(/^[^@]+/, '[USER]') : undefined,
}));
assert.equal(traceId, 't1');
assert.equal(firstError.service, 'api');
assert.equal(firstError.error, 'deadline');
assert.deepEqual(services, ['web', 'api', 'web']);
assert.equal(JSON.stringify(redacted).includes('ada@example.test'), false);
console.log('failed trace:', traceId);
console.log('service chain:', services.join(' -> '));
console.log('first actionable error:', firstError.service + ': ' + firstError.error);
`,
      checkpoint:
        '失败 trace 必须是 t1，服务链为 web -> api -> web，首个可行动错误为 api: deadline，并移除完整用户邮箱。失败边界是只按时间排序而不按 trace 串联、取最后一条 503 当根因，或把脱敏做成整条日志丢失。',
    }),
    makeTask('foundations-remaining-f5-observability-independent', {
      title: '独立实践：分位数、错误预算与告警',
      brief:
        '运行 node main.js。从请求样本计算可用率、P95 和 5% 错误预算燃烧率；只有影响用户且超出目标时才触发高优先级告警。',
      input: {
        windowSeconds: 300,
        objective: 0.99,
        samples: [
          { status: 200, latencyMs: 40 },
          { status: 200, latencyMs: 50 },
          { status: 200, latencyMs: 60 },
          { status: 500, latencyMs: 90 },
          { status: 200, latencyMs: 100 },
        ],
      },
      source: `
const good = input.samples.filter((item) => item.status < 500).length;
const availability = good / input.samples.length;
const allowedErrorRate = 1 - input.objective;
const actualErrorRate = 1 - availability;
const burnRate = actualErrorRate / allowedErrorRate;
const latencies = input.samples.map((item) => item.latencyMs).sort((a, b) => a - b);
const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
const alert = {
  severity: burnRate > 1 ? 'page' : 'none',
  summary: 'Checkout availability below SLO',
  runbook: 'restore-database-connectivity',
};
assert.equal(availability, 0.8);
assert.ok(Math.abs(burnRate - 20) < 1e-9);
assert.equal(p95, 100);
assert.equal(alert.severity, 'page');
console.log('availability:', availability);
console.log('burn rate:', burnRate);
console.log('p95 latency ms:', p95);
console.log('alert:', JSON.stringify(alert));
`,
      checkpoint:
        'availability 必须为 0.8，burn rate 为 20，P95 为 100ms，告警级别为 page 且带 runbook。失败边界是平均值掩盖长尾、错误预算未按目标换算，或只有 CPU 高但无用户影响的告警。',
    }),
  ),

  'programming:编程通识 · Docker、CI/CD 与运行手册：备份、回滚、容量与运行手册': makeLab(
    'F5 代码台 05 · 按峰值扩容与按检查点回滚',
    '先按峰值 QPS、单实例能力和数据库连接池计算容量余量，再执行带前置检查、兼容迁移和恢复验证的发布回滚状态机。',
    makeTask('foundations-remaining-f5-capacity-guided', {
      title: '跟做：容量按峰值而不是平均值估算',
      brief:
        '运行 node main.js。根据峰值 QPS、单实例安全吞吐、故障余量和每实例连接数计算实例数与总连接需求，并校验连接池上限。',
      input: {
        peakQps: 540,
        perInstanceQps: 100,
        redundancyInstances: 1,
        connectionsPerInstance: 12,
        databasePoolMax: 100,
      },
      source: `
const requiredForPeak = Math.ceil(input.peakQps / input.perInstanceQps);
const instances = requiredForPeak + input.redundancyInstances;
const connectionDemand = instances * input.connectionsPerInstance;
const sparePercent = ((instances * input.perInstanceQps) - input.peakQps) / input.peakQps * 100;
assert.equal(requiredForPeak, 6);
assert.equal(instances, 7);
assert.equal(connectionDemand, 84);
assert.ok(connectionDemand <= input.databasePoolMax);
assert.equal(sparePercent.toFixed(2), '29.63');
console.log('instances:', instances);
console.log('connection demand:', connectionDemand);
console.log('spare capacity percent:', sparePercent.toFixed(2));
`,
      checkpoint:
        '峰值需要 6 个实例，再加 1 个故障余量得到 7 个，数据库连接需求 84 不超过池上限 100，余量约 29.63%。失败边界是按平均 QPS 规划、只扩应用不给连接池留余量，或忽略缺一台实例时的容量。',
    }),
    makeTask('foundations-remaining-f5-capacity-independent', {
      title: '独立实践：发布、健康门禁与回滚',
      brief:
        '运行 node main.js。执行预检、兼容迁移、灰度、全量、健康验证；错误率越线时按反向顺序回滚并确认备份可用。',
      input: {
        errorBudget: 0.01,
        steps: [
          { name: 'precheck', errorRate: 0, backupOk: true },
          { name: 'expand-migration', errorRate: 0, backupOk: true },
          { name: 'canary', errorRate: 0.004, backupOk: true },
          { name: 'full-rollout', errorRate: 0.03, backupOk: true },
          { name: 'verify', errorRate: 0.03, backupOk: true },
        ],
      },
      source: `
const completed = [];
let rollbackReason = null;
for (const step of input.steps) {
  if (!step.backupOk) {
    rollbackReason = 'backup unavailable before ' + step.name;
    break;
  }
  completed.push(step.name);
  if (step.errorRate > input.errorBudget) {
    rollbackReason = step.name + ' error rate ' + step.errorRate;
    break;
  }
}
const rollbackOrder = [...completed].reverse();
assert.equal(completed.at(-1), 'full-rollout');
assert.match(rollbackReason, /full-rollout error rate 0\\.03/);
assert.deepEqual(rollbackOrder, ['full-rollout', 'canary', 'expand-migration', 'precheck']);
assert.equal(input.steps.every((step) => step.backupOk), true);
console.log('completed before gate:', completed.join(' -> '));
console.log('rollback reason:', rollbackReason);
console.log('rollback order:', rollbackOrder.join(' -> '));
`,
      checkpoint:
        'full-rollout 后错误率 3% 超预算，回滚顺序为 full-rollout、canary、expand-migration、precheck，且备份全部可用。失败边界是扩容迁移不可回退、继续健康检查后才回滚，或在无可用备份时执行破坏性恢复。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：浏览器如何请求和解析 HTML': makeLab(
    'H0 代码台 01 · 请求扫描与 DOM 树模型',
    '用确定性解析器扫描样式表、脚本、图片请求并识别渲染阻塞，再用标签栈构造 DOM 树。这个实验是解析契约模型，不声称启动真实浏览器。',
    makeTask('foundations-remaining-h0-request-guided', {
      title: '跟做：从 HTML 生成资源请求队列',
      brief:
        '运行 node main.js。扫描 HTML 中的 stylesheet、script、img，记录请求顺序和阻塞属性，并统计首屏关键请求。',
      input: {
        html: [
          '<!doctype html>',
          '<html><head>',
          '<link rel="stylesheet" href="/app.css">',
          '<script src="/boot.js"></script>',
          '<script src="/analytics.js" defer></script>',
          '</head><body>',
          '<img src="/hero.webp" alt="Product">',
          '<img src="/below.webp" alt="Details" loading="lazy">',
          '</body></html>',
        ].join('\n'),
      },
      source: `
const readAttrs = (text) => Object.fromEntries([...text.matchAll(/([:\\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const requests = [];
for (const match of input.html.matchAll(/<(link|script|img)\\b([^>]*)>/gi)) {
  const tag = match[1].toLowerCase();
  const attrs = readAttrs(match[2]);
  if (tag === 'link' && attrs.rel === 'stylesheet') requests.push({ type: 'css', url: attrs.href, blocking: true });
  if (tag === 'script' && attrs.src) requests.push({ type: 'js', url: attrs.src, blocking: !/\\b(?:defer|async)\\b/i.test(match[2]) });
  if (tag === 'img' && attrs.src) requests.push({ type: 'image', url: attrs.src, blocking: false, lazy: attrs.loading === 'lazy' });
}
assert.deepEqual(requests.map((item) => item.url), ['/app.css', '/boot.js', '/analytics.js', '/hero.webp', '/below.webp']);
assert.deepEqual(requests.filter((item) => item.blocking).map((item) => item.url), ['/app.css', '/boot.js']);
assert.equal(requests.at(-1).lazy, true);
console.log(JSON.stringify(requests));
console.log('render blocking requests:', requests.filter((item) => item.blocking).length);
`,
      checkpoint:
        '请求顺序必须是 app.css、boot.js、analytics.js、hero.webp、below.webp；阻塞请求只有 CSS 和未声明 defer/async 的 boot.js，below.webp 为 lazy。失败边界是把所有脚本都当阻塞、忽略 defer，或把图片存在当图片已成功解码。',
    }),
    makeTask('foundations-remaining-h0-request-independent', {
      title: '独立实践：标签栈构造 DOM 与祖先路径',
      brief:
        '运行 node main.js。用起始/结束标签和 void 标签规则建树，恢复漏写 li 结束标签后的层级，并输出目标按钮的祖先链。',
      input: {
        html: [
          '<main id="root">',
          '<article class="card">',
          '<h1>Keyboard guide</h1>',
          '<ul><li>Tab<button id="target">Open</button>',
          '<li>Enter</ul>',
          '</article>',
          '</main>',
        ].join(''),
        targetId: 'target',
      },
      source: `
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const roots = [];
const stack = [];
const nodes = [];
for (const token of input.html.matchAll(/<\\/?([a-z][\\w-]*)\\b([^>]*)>/gi)) {
  const closing = token[0].startsWith('</');
  const tag = token[1].toLowerCase();
  if (closing) {
    const index = stack.map((node) => node.tag).lastIndexOf(tag);
    if (index >= 0) stack.length = index;
    continue;
  }
  const attrs = Object.fromEntries([...token[2].matchAll(/([\\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  const node = { tag, attrs, children: [], parent: stack.at(-1) || null };
  if (node.parent) node.parent.children.push(node);
  else roots.push(node);
  nodes.push(node);
  if (!voidTags.has(tag)) stack.push(node);
}
const target = nodes.find((node) => node.attrs.id === input.targetId);
const ancestors = [];
for (let current = target; current; current = current.parent) ancestors.unshift(current.tag);
assert.equal(roots.length, 1);
assert.equal(roots[0].tag, 'main');
assert.deepEqual(ancestors, ['main', 'article', 'ul', 'li', 'button']);
assert.equal(target.parent.tag, 'li');
console.log('ancestor path:', ancestors.join(' > '));
console.log('root children:', roots[0].children.map((node) => node.tag).join(','));
`,
      checkpoint:
        '根节点只能是 main，目标按钮祖先链必须为 main > article > ul > li > button。失败边界是把 void 标签压栈、遇到错误闭合标签清空整棵树，或依赖字符串位置而不是父子关系定位元素。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：DOCTYPE、head、body 与文档树': makeLab(
    'H0 代码台 02 · 文档模式与 head/body 边界',
    '先检查 DOCTYPE、html/head/body 唯一性和 head 中的可见内容，再把错误放置的标题、样式和段落重新归位。',
    makeTask('foundations-remaining-h0-document-guided', {
      title: '跟做：验证标准文档骨架',
      brief:
        '运行 node main.js。扫描文档开始和结束标签，检查 DOCTYPE、根标签、head/body 数量以及 h1 是否误入 head。',
      input: {
        html: [
          '<!doctype html>',
          '<html lang="zh-CN">',
          '<head><title>Guide</title><link rel="stylesheet" href="/app.css"><h1>Wrong place</h1></head>',
          '<body><h1>Course</h1><p>Body content</p></body>',
          '</html>',
        ].join(''),
      },
      source: `
assert.match(input.html, /^<!doctype html>/i);
const counts = {};
for (const match of input.html.matchAll(/<(\\/?)(html|head|body)\\b[^>]*>/gi)) {
  if (match[1]) continue;
  const tag = match[2].toLowerCase();
  counts[tag] = (counts[tag] || 0) + 1;
}
const headText = input.html.match(/<head\\b[^>]*>([\\s\\S]*?)<\\/head>/i)?.[1] || '';
const visibleInHead = /<(h[1-6]|p|main|section|article)\\b/i.test(headText);
const issues = [];
if (counts.html !== 1 || counts.head !== 1 || counts.body !== 1) issues.push('bad-root-count');
if (visibleInHead) issues.push('visible-in-head');
assert.deepEqual(counts, { html: 1, head: 1, body: 1 });
assert.deepEqual(issues, ['visible-in-head']);
console.log('root counts:', JSON.stringify(counts));
console.log('issues:', issues.join(','));
`,
      checkpoint:
        'DOCTYPE 必须存在，html/head/body 各 1 个，并识别 head 中错误出现的 h1。失败边界是缺少 DOCTYPE 进入怪异模式、把可见内容塞进 head，或依赖浏览器的错误恢复掩盖非法结构。',
    }),
    makeTask('foundations-remaining-h0-document-independent', {
      title: '独立实践：重新归位 head 与 body 内容',
      brief:
        '运行 node main.js。把 title/meta/link/style 归入 head，把 h1/p/button 归入 body，并重新输出规范骨架。',
      input: {
        elements: [
          { tag: 'h1', text: 'Company', belongsTo: 'body' },
          { tag: 'meta', attrs: 'name="description" content="Demo"', belongsTo: 'head' },
          { tag: 'style', text: 'body{font-family:system-ui}', belongsTo: 'head' },
          { tag: 'p', text: 'Visible text', belongsTo: 'body' },
          { tag: 'button', text: 'Contact', belongsTo: 'body' },
        ],
      },
      source: `
const headTags = new Set(['base', 'link', 'meta', 'style', 'title']);
const bodyTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'main', 'section', 'article']);
const head = [];
const body = [];
for (const element of input.elements) {
  assert.ok(headTags.has(element.tag) || bodyTags.has(element.tag), 'unknown tag ' + element.tag);
  const rendered = '<' + element.tag + (element.attrs ? ' ' + element.attrs : '') + '>' + (element.text || '') + '</' + element.tag + '>';
  if (headTags.has(element.tag)) {
    assert.equal(element.belongsTo, 'head');
    head.push(rendered);
  } else {
    assert.equal(element.belongsTo, 'body');
    body.push(rendered);
  }
}
const repaired = '<!doctype html><html lang="zh-CN"><head>' + head.join('') + '</head><body>' + body.join('') + '</body></html>';
const repairedHead = repaired.match(/<head>([\\s\\S]*?)<\\/head>/)[1];
const repairedBody = repaired.match(/<body>([\\s\\S]*?)<\\/body>/)[1];
assert.equal(/<(h1|p|button)\\b/.test(repairedHead), false);
assert.equal(/<(meta|style)\\b/.test(repairedBody), false);
assert.match(repaired, /^<!doctype html>/);
console.log('head count:', (repairedHead.match(/<[a-z]/g) || []).length);
console.log('body count:', (repairedBody.match(/<[a-z]/g) || []).length);
console.log('repaired prefix:', repaired.slice(0, 72));
`,
      checkpoint:
        '修复后 head 含 meta 与 style，body 含 h1、p、button，可见标题不出现在 head。失败边界是只调整缩进不移动元素、丢掉 lang/DOCTYPE，或把 title 当页面可见正文。',
    }),
  ),

  'programming:编程通识 · 浏览器、文档与开发工具：DevTools、验证器与最小调试': makeLab(
    'H0 代码台 03 · 控制台堆栈与样式覆盖',
    '先把脚本错误定位到真实源文件，再按选择器权重和源码顺序计算最终样式；最后删除无关节点，留下仍触发问题的最小 DOM。',
    makeTask('foundations-remaining-h0-devtools-guided', {
      title: '跟做：读控制台并解释样式未生效',
      brief:
        '运行 node main.js。解析控制台堆栈，过滤浏览器扩展帧；计算两个样式声明的 specificity 与生效顺序。',
      input: {
        stack: [
          'TypeError: null is not an object',
          '    at bindMenu (/app/src/menu.js:31:8)',
          '    at chrome-extension://abc/inject.js:9:2',
        ],
        rules: [
          { selector: '.nav .item', source: 'app.css:10', specificities: [0, 2, 0], order: 1, display: 'block' },
          { selector: '.nav .item.is-hidden', source: 'utility.css:4', specificities: [0, 3, 0], order: 2, display: 'none' },
        ],
      },
      source: `
const appFrames = input.stack.filter((line) => line.includes('(/app/'));
const frame = appFrames[0];
const match = frame.match(/at ([^ ]+) \\(([^)]+):(\\d+):(\\d+)\\)/);
const error = {
  function: match[1],
  file: match[2],
  line: Number(match[3]),
  column: Number(match[4]),
};
const compare = (a, b) => {
  for (let index = 0; index < Math.max(a.specificities.length, b.specificities.length); index += 1) {
    const diff = (a.specificities[index] || 0) - (b.specificities[index] || 0);
    if (diff !== 0) return diff;
  }
  return a.order - b.order;
};
const winner = [...input.rules].sort(compare).at(-1);
assert.deepEqual(error, { function: 'bindMenu', file: '/app/src/menu.js', line: 31, column: 8 });
assert.equal(winner.selector, '.nav .item.is-hidden');
assert.equal(winner.display, 'none');
console.log('error frame:', JSON.stringify(error));
console.log('winning rule:', winner.selector + ' from ' + winner.source);
console.log('computed display:', winner.display);
`,
      checkpoint:
        '错误帧必须是 bindMenu 位于 /app/src/menu.js:31:8，获胜规则为 .nav .item.is-hidden，display=none。失败边界是直接看扩展注入帧、按文件先后而不看 specificity，或修改源码却不看实际命中的规则。',
    }),
    makeTask('foundations-remaining-h0-devtools-independent', {
      title: '独立实践：删除无关节点得到最小复现',
      brief:
        '运行 node main.js。页面在 nav 与缺失菜单节点同时存在时失败；逐步删除无关 DOM，得到仍失败的最小节点集合。',
      input: {
        nodes: ['header', 'nav', 'menu-root', 'footer', 'cookie-banner'],
        required: ['nav', 'menu-root'],
      },
      source: `
const fails = (nodes) => input.required.every((node) => nodes.includes(node));
let minimal = [...input.nodes];
let changed = true;
while (changed) {
  changed = false;
  for (let index = 0; index < minimal.length; index += 1) {
    const candidate = minimal.filter((_, current) => current !== index);
    if (fails(candidate)) {
      minimal = candidate;
      changed = true;
      break;
    }
  }
}
assert.deepEqual(minimal, ['nav', 'menu-root']);
for (const node of minimal) {
  assert.equal(fails(minimal.filter((item) => item !== node)), false);
}
console.log('original nodes:', input.nodes.join(','));
console.log('minimal DOM:', minimal.join(' > '));
console.log('console reproduction remains:', fails(minimal));
`,
      checkpoint:
        '最小 DOM 必须只剩 nav 与 menu-root，删除任一节点后问题不再复现。失败边界是保留 header/footer 等无关节点、直接贴整页源码，或删除过度让错误消失却无法定位根因。',
    }),
  ),

  'programming:编程通识 · 语义、结构与企业页面骨架：header、nav、main 与 footer': makeLab(
    'H1 代码台 01 · landmark 区域与企业页骨架',
    '解析语义区域，验证每页只有一个 main、导航有名称、页头页脚没有嵌套正文；再把 data-role 的 div 骨架重建为语义标签。',
    makeTask('foundations-remaining-h1-landmarks-guided', {
      title: '跟做：检查 landmark 与标题大纲',
      brief:
        '运行 node main.js。扫描 header、nav、main、footer，检查 main 唯一、nav 有 aria-label，并计算标题层级。',
      input: {
        html: [
          '<header><a href="/">Acme</a></header>',
          '<nav aria-label="Primary"><a href="/products">Products</a></nav>',
          '<main><h1>Store</h1><section><h2>Plans</h2><h4>Skipped</h4></section></main>',
          '<footer><p>Copyright</p></footer>',
        ].join(''),
      },
      source: `
const counts = {};
for (const match of input.html.matchAll(/<(header|nav|main|footer)\\b([^>]*)>/gi)) {
  const tag = match[1].toLowerCase();
  counts[tag] = (counts[tag] || 0) + 1;
  if (tag === 'nav') assert.match(match[2], /aria-label="[^"]+"/);
}
const headings = [...input.html.matchAll(/<h([1-6])\\b/g)].map((match) => Number(match[1]));
const jumps = headings.slice(1).filter((level, index) => level - headings[index] > 1);
assert.deepEqual(counts, { header: 1, nav: 1, main: 1, footer: 1 });
assert.deepEqual(headings, [1, 2, 4]);
assert.deepEqual(jumps, [4]);
console.log('landmarks:', JSON.stringify(counts));
console.log('heading levels:', headings.join(' > '));
console.log('skipped level:', jumps.join(','));
`,
      checkpoint:
        'landmark 计数必须各为 1，标题序列为 1 > 2 > 4，并报告从 2 跳到 4。失败边界是多个 main、把主导航塞进 footer，或用 h4 只为了视觉字号造成大纲断层。',
    }),
    makeTask('foundations-remaining-h1-landmarks-independent', {
      title: '独立实践：把 div 骨架重建为语义区域',
      brief:
        '运行 node main.js。根据 data-role 把页头、主导航、主体和页脚转换为语义标签，保留 class、id 与链接结构。',
      input: {
        skeleton: [
          '<div data-role="header" class="site-head"><a href="/">Acme</a></div>',
          '<div data-role="nav" aria-label="Primary"><a href="/shop">Shop</a></div>',
          '<div data-role="main"><h1>Shop</h1><p>Products</p></div>',
          '<div data-role="footer"><p>Copyright</p></div>',
        ].join(''),
      },
      source: `
const tags = { header: 'header', nav: 'nav', main: 'main', footer: 'footer' };
const roleStack = [];
const fixed = input.skeleton.replace(/<div\\b([^>]*)>|<\\/div>/g, (all, attrs) => {
  if (!attrs) return '</' + roleStack.pop() + '>';
  const role = /data-role="([^"]+)"/.exec(attrs)?.[1];
  assert.ok(tags[role], 'unsupported role ' + role);
  roleStack.push(tags[role]);
  return '<' + tags[role] + attrs.replace(/\\s*data-role="[^"]+"/, '') + '>';
});
assert.deepEqual(roleStack, []);
assert.equal(/data-role=/.test(fixed), false);
for (const tag of ['header', 'nav', 'main', 'footer']) assert.match(fixed, new RegExp('<' + tag + '\\\\b'));
assert.equal((fixed.match(/<main\\b/g) || []).length, 1);
assert.match(fixed, /<nav[^>]+aria-label="Primary"/);
console.log(fixed);
`,
      checkpoint:
        '输出必须不含 data-role，并各有一个 header、nav、main、footer；主导航保留 aria-label，正文 h1 仍在 main 内。失败边界是只替换开始标签留下不匹配的 div、创建多个 main，或丢失 class/id 让样式失效。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：form、label 与输入控件关联': makeLab(
    'H2 代码台 01 · 标签关联、类型与移动键盘',
    '先解析每个控件的可访问名称和自动填充提示，再修复缺失 id 的 label、错误输入类型与不适合手机键盘的字段。',
    makeTask('foundations-remaining-h2-label-guided', {
      title: '跟做：解析 label for 与控件名称',
      brief:
        '运行 node main.js。从 label for/id 和包裹式 label 建立关联，检查重复 id、缺失名称与 email 输入类型。',
      input: {
        html: [
          '<label for="email">Work email</label>',
          '<input id="email" type="email" autocomplete="email">',
          '<label>Phone <input id="phone" type="tel" autocomplete="tel"></label>',
          '<label for="missing">Missing</label>',
          '<input id="email2" type="text">',
        ].join(''),
      },
      source: `
const readAttrs = (text) => Object.fromEntries([...text.matchAll(/([\\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const labels = [...input.html.matchAll(/<label(?:\\s+for="([^"]+)")?[^>]*>([\\s\\S]*?)<\\/label>/g)].map((match) => {
  const controls = [...match[2].matchAll(/<input\\b([^>]*)>/g)];
  return {
    for: match[1],
    text: match[2].replace(/<[^>]+>/g, '').trim(),
    wrappedId: controls.length ? readAttrs(controls[0][1]).id : null,
  };
});
const controls = [...input.html.matchAll(/<input\\b([^>]*)>/g)].map((match) => readAttrs(match[1]));
const ids = controls.map((control) => control.id).filter(Boolean);
const missingFor = labels.filter((label) => label.for && !ids.includes(label.for)).map((label) => label.for);
assert.equal(labels[0].text, 'Work email');
assert.equal(labels[1].wrappedId, 'phone');
assert.deepEqual(missingFor, ['missing']);
assert.equal(controls.find((control) => control.id === 'email').type, 'email');
assert.equal(controls.find((control) => control.id === 'phone').autocomplete, 'tel');
console.log('associations:', labels.map((label) => label.for || label.wrappedId).filter(Boolean).join(','));
console.log('broken label targets:', missingFor.join(','));
`,
      checkpoint:
        'Work email 关联 email，包裹式 label 关联 phone，missing label 被报告断链；email 类型为 email，phone 自动填充为 tel。失败边界是只写 placeholder 当标签、label for 与 id 拼写不一致，或电话字段使用 text 弹出错误键盘。',
    }),
    makeTask('foundations-remaining-h2-label-independent', {
      title: '独立实践：修复表单元数据与关联',
      brief:
        '运行 node main.js。为字段补齐唯一 id、label、input type、autocomplete 和 inputmode，并验证每个控件都有可访问名称。',
      input: {
        fields: [
          { name: 'email', label: 'Email', valueKind: 'email' },
          { name: 'phone', label: 'Phone', valueKind: 'tel' },
          { name: 'postal', label: 'Postal code', valueKind: 'numeric-code' },
        ],
      },
      source: `
const presets = {
  email: { type: 'email', autocomplete: 'email', inputmode: 'email' },
  tel: { type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
  'numeric-code': { type: 'text', autocomplete: 'postal-code', inputmode: 'numeric' },
};
const seen = new Set();
const controls = input.fields.map((field) => {
  const id = 'field-' + field.name;
  assert.equal(seen.has(id), false);
  seen.add(id);
  const preset = presets[field.valueKind];
  assert.ok(preset);
  return { id, name: field.name, label: field.label, ...preset, ariaDescribedby: id + '-help' };
});
assert.deepEqual(controls.map((item) => item.type), ['email', 'tel', 'text']);
assert.deepEqual(controls.map((item) => item.inputmode), ['email', 'tel', 'numeric']);
assert.equal(controls.every((item) => item.id && item.label && item.autocomplete), true);
console.log(JSON.stringify(controls));
console.log('unique ids:', new Set(controls.map((item) => item.id)).size);
`,
      checkpoint:
        '三个控件必须有唯一 id、非空 label，类型依次为 email、tel、text，inputmode 为 email、tel、numeric。失败边界是重复 id、把邮政编码设为 number 丢失前导零，或只靠 placeholder 和视觉星号表达必填。',
    }),
  ),

  'programming:编程通识 · 表单、输入与验证：可访问表单的完整实验': makeLab(
    'H2 代码台 02 · 错误摘要、焦点与幂等提交',
    '先验证 fieldset/legend、错误摘要、aria-describedby 和提交状态，再用状态机阻止重复提交并让服务端错误回到对应字段。',
    makeTask('foundations-remaining-h2-form-guided', {
      title: '跟做：提交前检查可访问表单契约',
      brief:
        '运行 node main.js。检查分组 legend、错误摘要链接、字段描述引用、禁用提交和焦点顺序。',
      input: {
        groups: [{ legend: 'Shipping address', controls: ['street', 'city'] }],
        errorSummary: { items: [{ field: 'street', message: 'Street is required' }] },
        controls: [
          { id: 'street', describedBy: 'street-error', invalid: true },
          { id: 'city', describedBy: 'city-help', invalid: false },
        ],
        submit: { disabled: true, pending: false },
      },
      source: `
assert.equal(input.groups.every((group) => group.legend && group.controls.length > 0), true);
const summaryTargets = input.errorSummary.items.map((item) => item.field);
const invalidIds = input.controls.filter((item) => item.invalid).map((item) => item.id);
const described = Object.fromEntries(input.controls.map((item) => [item.id, item.describedBy]));
assert.deepEqual(summaryTargets, invalidIds);
assert.equal(described.street, 'street-error');
assert.equal(described.city, 'city-help');
assert.equal(input.submit.disabled, true);
assert.equal(input.submit.pending, false);
console.log('fieldset legend:', input.groups[0].legend);
console.log('error summary targets:', summaryTargets.join(','));
console.log('first invalid field:', invalidIds[0]);
`,
      checkpoint:
        '错误摘要必须只指向 street，street 的描述引用 street-error，提交前 disabled=true 且 pending=false。失败边界是只把错误文字染红、焦点留在提交按钮，或重复点击可创建多个请求。',
    }),
    makeTask('foundations-remaining-h2-form-independent', {
      title: '独立实践：校验、焦点和 idempotency key',
      brief:
        '运行 node main.js。执行提交状态机：本地校验失败时聚焦第一个错误；提交中拒绝重复点击；服务端成功只接受一次请求。',
      input: {
        fields: [
          { id: 'email', value: '' },
          { id: 'name', value: 'Ada' },
        ],
        submitEvents: ['click', 'fill-email', 'click', 'click', 'server-success', 'click'],
      },
      source: `
const state = { phase: 'idle', requests: [], focused: null, acceptedResponses: 0, key: 'order-2026-01', duplicateBlocked: 0 };
for (const event of input.submitEvents) {
  if (event === 'fill-email') {
    input.fields.find((field) => field.id === 'email').value = 'ada@example.test';
    continue;
  }
  if (event === 'click') {
    if (state.phase === 'pending' || state.phase === 'success') {
      state.duplicateBlocked += 1;
      continue;
    }
    const invalid = input.fields.find((field) => !field.value.trim());
    if (invalid) {
      state.phase = 'invalid';
      state.focused = invalid.id;
      continue;
    }
    state.phase = 'pending';
    state.requests.push({ key: state.key, values: input.fields.map((field) => field.value) });
  }
  if (event === 'server-success') {
    assert.equal(state.phase, 'pending');
    state.phase = 'success';
    state.acceptedResponses += 1;
  }
}
assert.equal(state.phase, 'success');
assert.equal(state.focused, 'email');
assert.equal(state.requests.length, 1);
assert.equal(state.acceptedResponses, 1);
assert.equal(state.duplicateBlocked, 2);
console.log('final phase:', state.phase);
console.log('focused field:', state.focused);
console.log('outbound requests:', state.requests.length);
`,
      checkpoint:
        '最终状态为 success，焦点曾落到 email，出站请求与成功响应各 1 次，提交中和服务端成功后的两次点击被阻止。失败边界是无效表单仍发请求、提交中可重复点击，或响应回来后又能发送另一个请求。',
    }),
  ),

  'programming:编程通识 · 媒体、表格与内容表达：meta、Open Graph 与结构化数据': makeLab(
    'H3 代码台 01 · 页面元数据与结构化数据校验',
    '从 head 解析 title、description、canonical、Open Graph 和 JSON-LD，检查长度、绝对地址和实体类型，再为文章生成一组可通过契约校验的元数据。',
    makeTask('foundations-remaining-h3-meta-guided', {
      title: '跟做：找出 SEO 元数据缺口',
      brief:
        '运行 node main.js。扫描 meta 与 link，验证 title、description、canonical、og:title、og:image 和 Article JSON-LD。',
      input: {
        html: [
          '<head>',
          '<title>Keyboard guide for support teams</title>',
          '<meta name="description" content="Short">',
          '<link rel="stylesheet" href="/app.css">',
          '<meta property="og:title" content="Keyboard guide">',
          '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Keyboard guide"}</script>',
          '</head>',
        ].join(''),
      },
      source: `
const title = input.html.match(/<title>([^<]+)<\\/title>/i)?.[1];
const description = input.html.match(/<meta\\s+name="description"\\s+content="([^"]*)"/i)?.[1];
const canonical = input.html.match(/<link\\s+rel="canonical"\\s+href="([^"]+)"/i)?.[1];
const openGraph = Object.fromEntries([...input.html.matchAll(/<meta\\s+property="(og:[^"]+)"\\s+content="([^"]*)"/gi)].map((match) => [match[1], match[2]]));
const jsonLd = JSON.parse(input.html.match(/<script type="application\\/ld\\+json">([\\s\\S]*?)<\\/script>/i)[1]);
const issues = [];
if (!title || title.length < 20 || title.length > 60) issues.push('title-length');
if (!description || description.length < 50) issues.push('description-short');
if (!canonical) issues.push('canonical-missing');
if (!openGraph['og:image']) issues.push('og-image-missing');
if (jsonLd['@type'] !== 'Article') issues.push('schema-type');
assert.deepEqual(issues, ['description-short', 'canonical-missing', 'og-image-missing']);
console.log('title:', title);
console.log('open graph keys:', Object.keys(openGraph).join(','));
console.log('schema type:', jsonLd['@type']);
console.log('issues:', issues.join(','));
`,
      checkpoint:
        '必须保留有效 title 与 Article 类型，并报告描述过短、canonical 缺失和 og:image 缺失。失败边界是把 CSS link 当 canonical、JSON-LD 类型与页面实体不一致，或用关键词堆砌替代描述。',
    }),
    makeTask('foundations-remaining-h3-meta-independent', {
      title: '独立实践：生成可验证的文章元数据',
      brief:
        '运行 node main.js。从文章数据生成绝对 canonical、Open Graph、Twitter 卡和 Article JSON-LD，并校验所有必填字段与 URL。',
      input: {
        baseUrl: 'https://example.test',
        article: {
          slug: 'keyboard-navigation',
          title: 'Keyboard navigation for enterprise forms',
          description: 'A practical guide to labels, focus order, validation summaries and reliable form submission for support teams.',
          image: '/images/forms.webp',
          author: 'Ada Lin',
          published: '2026-01-08',
        },
      },
      source: `
const absolute = (path) => new URL(path, input.baseUrl).href;
const canonical = absolute('/guides/' + input.article.slug);
const image = absolute(input.article.image);
const meta = {
  title: input.article.title,
  description: input.article.description,
  canonical,
  og: { type: 'article', title: input.article.title, description: input.article.description, image },
  twitter: { card: 'summary_large_image', title: input.article.title, image },
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.article.title,
    datePublished: input.article.published,
    author: { '@type': 'Person', name: input.article.author },
    image,
    mainEntityOfPage: canonical,
  },
};
for (const url of [meta.canonical, meta.og.image, meta.jsonLd.mainEntityOfPage]) assert.match(url, /^https:\\/\\//);
assert.equal(meta.og.type, 'article');
assert.equal(meta.twitter.card, 'summary_large_image');
assert.equal(meta.jsonLd.mainEntityOfPage, meta.canonical);
assert.ok(meta.description.length >= 50);
console.log('canonical:', meta.canonical);
console.log('image:', meta.og.image);
console.log('json-ld type:', meta.jsonLd['@type']);
`,
      checkpoint:
        'canonical 必须为 https://example.test/guides/keyboard-navigation，图片为绝对 URL，JSON-LD 类型 Article 且 mainEntityOfPage 与 canonical 一致。失败边界是使用相对 canonical、OG 类型仍为 website，或图片 URL 与 JSON-LD 不一致。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：ARIA 的角色、名称和状态': makeLab(
    'H4 代码台 01 · 可访问名称与 tab 组件状态',
    '按 aria-labelledby、aria-label、文本和 alt 的优先顺序计算名称，再修复 tablist 的 role、选中状态、roving tabindex 与键盘切换。',
    makeTask('foundations-remaining-h4-aria-guided', {
      title: '跟做：计算名称并检查 ARIA 状态',
      brief:
        '运行 node main.js。为按钮、图片按钮和 tab 计算可访问名称，检查 tablist 中唯一 selected 与唯一 tabindex=0。',
      input: {
        labels: { title: 'Account settings' },
        controls: [
          { role: 'button', labelledBy: 'title', text: 'ignored' },
          { role: 'button', ariaLabel: 'Close dialog', text: 'X' },
          { role: 'tab', text: 'Profile', selected: true, tabindex: 0 },
          { role: 'tab', text: 'Security', selected: false, tabindex: -1 },
        ],
      },
      source: `
const nameOf = (control) => {
  if (control.labelledBy) return input.labels[control.labelledBy];
  if (control.ariaLabel) return control.ariaLabel;
  return control.text;
};
const names = input.controls.map(nameOf);
const tabs = input.controls.filter((control) => control.role === 'tab');
assert.deepEqual(names, ['Account settings', 'Close dialog', 'Profile', 'Security']);
assert.equal(tabs.filter((tab) => tab.selected).length, 1);
assert.equal(tabs.filter((tab) => tab.tabindex === 0).length, 1);
assert.equal(tabs.find((tab) => tab.selected).tabindex, 0);
console.log('accessible names:', names.join(' | '));
console.log('selected tab:', tabs.find((tab) => tab.selected).text);
console.log('tab stops:', tabs.filter((tab) => tab.tabindex === 0).length);
`,
      checkpoint:
        '四个名称必须依次为 Account settings、Close dialog、Profile、Security，tablist 只有一个 selected 和一个 tabindex=0。失败边界是只读可见文本忽略 aria-label、所有 tab 都进 Tab 顺序，或 selected 与 tabindex 不一致。',
    }),
    makeTask('foundations-remaining-h4-aria-independent', {
      title: '独立实践：修复 tabs 与 modal 交互契约',
      brief:
        '运行 node main.js。修复 tab 角色、名称、aria-controls、选中态和 roving tabindex，并为对话框设置 modal、可访问名称与焦点返回。',
      input: {
        tabs: [
          { id: 'tab-profile', panel: 'panel-profile', label: 'Profile' },
          { id: 'tab-security', panel: 'panel-security', label: 'Security' },
        ],
        dialog: { trigger: 'open-settings', title: 'Settings' },
      },
      source: `
const repairedTabs = input.tabs.map((tab, index) => ({
  role: 'tab',
  id: tab.id,
  text: tab.label,
  ariaControls: tab.panel,
  ariaSelected: index === 0,
  tabindex: index === 0 ? 0 : -1,
}));
const repairedDialog = {
  role: 'dialog',
  ariaModal: true,
  accessibleName: input.dialog.title,
  labelledBy: 'dialog-title',
  returnFocusTo: input.dialog.trigger,
};
assert.equal(repairedTabs.every((tab) => tab.role === 'tab' && tab.ariaControls && tab.text), true);
assert.equal(repairedTabs.filter((tab) => tab.ariaSelected).length, 1);
assert.equal(repairedTabs.filter((tab) => tab.tabindex === 0).length, 1);
assert.deepEqual(
  [repairedDialog.role, repairedDialog.ariaModal, repairedDialog.accessibleName, repairedDialog.returnFocusTo],
  ['dialog', true, 'Settings', 'open-settings'],
);
console.log(JSON.stringify(repairedTabs));
console.log(JSON.stringify(repairedDialog));
`,
      checkpoint:
        '两个 tab 必须有 role、名称和 aria-controls，第一个 selected 且 tabindex=0；对话框必须是 modal dialog、名称为 Settings、关闭后焦点返回 open-settings。失败边界是用 div 无角色冒充 tab、焦点逃出模态框，或关闭后焦点丢到 body。',
    }),
  ),

  'programming:编程通识 · 可访问性、SEO 与国际化：无障碍与 SEO 联合验收': makeLab(
    'H4 代码台 02 · 联合审计与阻断问题清零',
    '把语言、标题、描述、canonical、robots、landmark、标题大纲和图片 alt 放进同一份验收模型，区分阻断项、警告和修复后的零回归结果。',
    makeTask('foundations-remaining-h4-audit-guided', {
      title: '跟做：生成无障碍与 SEO 联合审计',
      brief:
        '运行 node main.js。检查 html lang、唯一 h1、图片 alt、页面 main、canonical、description 和 robots noindex。',
      input: {
        lang: '',
        title: 'Guide',
        description: '',
        canonical: '',
        robots: 'noindex',
        headings: [2, 3],
        mainCount: 0,
        images: [{ src: 'hero.webp', alt: '' }, { src: 'icon.svg', alt: null, decorative: true }],
      },
      source: `
const blockers = [];
const warnings = [];
if (!input.lang) blockers.push('html-lang');
if (!input.title) blockers.push('title');
if (!input.description) warnings.push('description');
if (!input.canonical) warnings.push('canonical');
if (input.robots.includes('noindex')) blockers.push('robots-noindex');
if (input.headings.filter((level) => level === 1).length !== 1) blockers.push('single-h1');
if (input.mainCount !== 1) blockers.push('single-main');
for (const image of input.images) {
  if (image.alt === null && image.decorative !== true) blockers.push('image-alt:' + image.src);
  if (image.alt === '' && image.decorative !== true) blockers.push('image-empty-alt:' + image.src);
}
assert.deepEqual(blockers, ['html-lang', 'robots-noindex', 'single-h1', 'single-main', 'image-empty-alt:hero.webp']);
assert.deepEqual(warnings, ['description', 'canonical']);
console.log('blockers:', blockers.join(','));
console.log('warnings:', warnings.join(','));
`,
      checkpoint:
        '阻断项必须包含缺 lang、noindex、缺唯一 h1、缺 main 和内容图空 alt；描述与 canonical 只算警告。失败边界是装饰图标空 alt 被误报、把 description 缺失当可访问性错误，或 noindex 发布后仍判通过。',
    }),
    makeTask('foundations-remaining-h4-audit-independent', {
      title: '独立实践：修复后重跑同一验收器',
      brief:
        '运行 node main.js。对原页面补齐 lang、唯一 h1、main、描述、canonical、robots 与图片 alt，再用同一审计函数确认阻断项清零。',
      input: {
        broken: {
          lang: '',
          description: '',
          canonical: '',
          robots: 'noindex',
          headings: [2, 2],
          mainCount: 0,
          images: [{ src: 'hero.webp', alt: '' }],
        },
      },
      source: `
const audit = (page) => {
  const blockers = [];
  if (!page.lang) blockers.push('html-lang');
  if (!page.description) blockers.push('description');
  if (!page.canonical) blockers.push('canonical');
  if (page.robots !== 'index,follow') blockers.push('robots');
  if (page.headings.filter((level) => level === 1).length !== 1) blockers.push('h1');
  if (page.mainCount !== 1) blockers.push('main');
  for (const image of page.images) if (!image.alt && !image.decorative) blockers.push('alt:' + image.src);
  return blockers;
};
const fixed = {
  lang: 'zh-CN',
  description: 'Practical accessibility and SEO checklists for enterprise course delivery.',
  canonical: 'https://example.test/guides/accessibility',
  robots: 'index,follow',
  headings: [1, 2],
  mainCount: 1,
  images: [{ src: 'hero.webp', alt: 'Instructor reviewing a focus outline' }, { src: 'icon.svg', alt: '', decorative: true }],
};
const before = audit(input.broken);
const after = audit(fixed);
assert.ok(before.length >= 7);
assert.deepEqual(after, []);
assert.match(fixed.canonical, /^https:\\/\\//);
console.log('blockers before:', before.length);
console.log('blockers after:', after.length);
console.log('canonical:', fixed.canonical);
`,
      checkpoint:
        '修复前至少 7 个阻断项，修复后必须为 0，装饰图标仍允许空 alt，canonical 为绝对 HTTPS URL。失败边界是只修 SEO 不修语义、给装饰图标编造 alt，或审计器前后使用不同标准。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：关键 HTML、CSS、字体与脚本': makeLab(
    'H5 代码台 01 · 关键请求链与阻塞优化',
    '先构建 HTML、CSS、字体和脚本的请求依赖链，识别渲染阻塞资源；再内联关键 CSS、预加载字体并延迟非关键脚本，比较首屏关键路径长度。',
    makeTask('foundations-remaining-h5-critical-guided', {
      title: '跟做：找出首屏阻塞链',
      brief:
        '运行 node main.js。解析 link、script 和 CSS 字体地址，构造关键请求链，列出阻塞资源与优先级。',
      input: {
        html: [
          '<link rel="stylesheet" href="/app.css">',
          '<script src="/app.js"></script>',
          '<script src="/analytics.js" async></script>',
          '<style>@font-face{font-family:Brand;src:url("/brand.woff2")}</style>',
        ].join(''),
      },
      source: `
const resources = [];
for (const match of input.html.matchAll(/<(link|script)\\b([^>]*)>/gi)) {
  const tag = match[1].toLowerCase();
  const attrs = Object.fromEntries([...match[2].matchAll(/([\\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
  if (tag === 'link' && attrs.rel === 'stylesheet') resources.push({ type: 'css', url: attrs.href, blocking: true, after: 'html' });
  if (tag === 'script' && attrs.src) resources.push({ type: 'js', url: attrs.src, blocking: !/\\b(?:async|defer)\\b/i.test(match[2]), after: 'html' });
}
for (const style of input.html.matchAll(/<style\\b[^>]*>([\\s\\S]*?)<\\/style>/gi)) {
  for (const font of style[1].matchAll(/url\\("([^"]+)"\\)/g)) resources.push({ type: 'font', url: font[1], blocking: false, after: 'css' });
}
assert.deepEqual(resources.map((item) => item.url), ['/app.css', '/app.js', '/analytics.js', '/brand.woff2']);
assert.deepEqual(resources.filter((item) => item.blocking).map((item) => item.url), ['/app.css', '/app.js']);
assert.equal(resources.find((item) => item.url === '/brand.woff2').after, 'css');
console.log('critical request chain:', ['html', 'css', 'font'].join(' -> '));
console.log('blocking resources:', resources.filter((item) => item.blocking).map((item) => item.url).join(','));
console.log('font dependent on css:', resources.find((item) => item.type === 'font').url);
`,
      checkpoint:
        'CSS、同步 app.js 必须阻塞，async analytics 不阻塞；字体在 CSS 之后被发现，关键链为 html -> css -> font。失败边界是把 async/defer 当同步阻塞、忘记字体由 CSS 间接发现，或只按资源体积排序。',
    }),
    makeTask('foundations-remaining-h5-critical-independent', {
      title: '独立实践：压缩关键路径并保序',
      brief:
        '运行 node main.js。比较多套资源加载策略，选择内联关键 CSS、preload 字体和 defer 业务脚本的组合，确保脚本顺序与 DOM 依赖不被破坏。',
      input: {
        strategies: [
          { id: 'baseline', inlineCriticalCss: false, fontPreload: false, app: 'sync', analytics: 'sync', appBeforeAnalytics: true },
          { id: 'fast-break', inlineCriticalCss: true, fontPreload: true, app: 'async', analytics: 'async', appBeforeAnalytics: false },
          { id: 'fast-safe', inlineCriticalCss: true, fontPreload: true, app: 'defer', analytics: 'defer', appBeforeAnalytics: true },
        ],
      },
      source: `
const score = (strategy) => {
  let latency = 300;
  if (!strategy.inlineCriticalCss) latency += 180;
  if (!strategy.fontPreload) latency += 90;
  if (strategy.app === 'sync') latency += 120;
  if (strategy.analytics === 'sync') latency += 60;
  return latency;
};
const valid = input.strategies.filter((strategy) =>
  strategy.inlineCriticalCss &&
  strategy.fontPreload &&
  strategy.app === 'defer' &&
  strategy.analytics === 'defer' &&
  strategy.appBeforeAnalytics
);
const baseline = input.strategies.find((item) => item.id === 'baseline');
const selected = valid.sort((a, b) => score(a) - score(b))[0];
assert.equal(selected.id, 'fast-safe');
assert.ok(score(selected) < score(baseline));
assert.equal(selected.appBeforeAnalytics, true);
console.log('baseline score:', score(baseline));
console.log('selected strategy:', selected.id);
console.log('optimized score:', score(selected));
`,
      checkpoint:
        '只能选择 fast-safe，优化分数 300 必须低于 baseline 750，且 app 与 analytics 均 defer 并保序。失败边界是 async 打乱依赖、只优化字体不处理阻塞 CSS，或为分数牺牲脚本执行顺序。',
    }),
  ),

  'programming:编程通识 · 页面性能与企业站点交付：缓存、压缩与 CDN 静态发布': makeLab(
    'H5 代码台 02 · 内容哈希、缓存策略与灰度发布',
    '先按 Cache-Control、Age 和文件名哈希判断 fresh、revalidate 与 immutable，再模拟带内容哈希的静态发布、HTML 短缓存和 CDN 预热门禁。',
    makeTask('foundations-remaining-h5-cache-guided', {
      title: '跟做：判断资源是否可复用缓存',
      brief:
        '运行 node main.js。根据缓存头和当前 Age 判断 HTML 与哈希静态资源状态，并检查带哈希文件名是否使用 immutable。',
      input: {
        resources: [
          { url: '/index.html', cacheControl: 'no-cache', age: 0, contentHash: false },
          { url: '/assets/app.8f31a2.js', cacheControl: 'public,max-age=31536000,immutable', age: 4000, contentHash: true },
          { url: '/assets/old.js', cacheControl: 'public,max-age=60', age: 90, contentHash: false },
        ],
      },
      source: `
const directive = (value, name) => new RegExp('(?:^|,)' + name + '(?:=|,|$)([^,]*)?').exec(value.replaceAll(' ', ''))?.[1];
const decisions = input.resources.map((resource) => {
  const maxAge = Number(directive(resource.cacheControl, 'max-age') || 0);
  const immutable = resource.cacheControl.includes('immutable');
  if (resource.cacheControl.includes('no-cache')) return { url: resource.url, action: 'revalidate' };
  if (immutable && resource.contentHash) return { url: resource.url, action: 'immutable-hit' };
  return { url: resource.url, action: resource.age <= maxAge ? 'fresh-hit' : 'stale-revalidate' };
});
assert.deepEqual(decisions.map((item) => item.action), ['revalidate', 'immutable-hit', 'stale-revalidate']);
assert.equal(input.resources.filter((item) => item.contentHash).every((item) => item.url.includes('.') && item.cacheControl.includes('immutable')), true);
console.log(JSON.stringify(decisions));
`,
      checkpoint:
        'index.html 必须协商，app.8f31a2.js 为 immutable-hit，old.js 已过期需 stale-revalidate。失败边界是给 HTML 一年长缓存、immutable 用在无哈希文件名上，或只按 Age 判断忽略 no-cache。',
    }),
    makeTask('foundations-remaining-h5-cache-independent', {
      title: '独立实践：哈希发布、CDN 预热与回滚',
      brief:
        '运行 node main.js。发布带新哈希的 JS/CSS 和短缓存 HTML，预热边缘节点并验证入口引用；失败时回退 HTML 但仍保留旧哈希文件供未刷新页面使用。',
      input: {
        release: { html: 'sha-a11', js: 'sha-b22', css: 'sha-c33' },
        previous: { html: 'sha-old', js: 'sha-old-js', css: 'sha-old-css' },
        edges: ['cn-east', 'cn-south', 'ap-southeast'],
        prewarmFailedEdge: 'ap-southeast',
      },
      source: `
const paths = {
  html: '/index.html',
  js: '/assets/app.' + input.release.js + '.js',
  css: '/assets/app.' + input.release.css + '.css',
};
const headers = {
  html: 'Cache-Control: no-cache',
  immutable: 'Cache-Control: public,max-age=31536000,immutable',
};
const warmed = [];
const failed = [];
for (const edge of input.edges) {
  if (edge === input.prewarmFailedEdge) failed.push(edge);
  else warmed.push({ edge, path: paths.js });
}
const decision = failed.length
  ? { action: 'keep-previous-html', activeHtml: input.previous.html, retainedAssets: [paths.js, paths.css] }
  : { action: 'publish', activeHtml: input.release.html };
assert.equal(paths.js.includes(input.release.js), true);
assert.match(headers.html, /no-cache/);
assert.match(headers.immutable, /immutable/);
assert.deepEqual(warmed.map((item) => item.edge), ['cn-east', 'cn-south']);
assert.equal(decision.action, 'keep-previous-html');
assert.equal(decision.retainedAssets.length, 2);
console.log('warmed edges:', warmed.map((item) => item.edge).join(','));
console.log('failed edges:', failed.join(','));
console.log('release decision:', JSON.stringify(decision));
`,
      checkpoint:
        '三个边缘节点中只预热 cn-east、cn-south；ap-southeast 失败时保持旧 HTML，但保留新 JS/CSS 哈希资源供回滚期间访问。失败边界是 HTML 与资源同一长缓存、失败节点仍切换全量入口，或回滚时删除旧哈希文件造成二次故障。',
    }),
  ),
};
