import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库 / 确定性中间件协议模拟',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js 运行，不需要启动 Kafka、Redis、RabbitMQ、Nginx 或 Apollo。',
    '代码中的集群、网络、磁盘与时钟都是确定性协议模型，只验证中间件语义，不声称连接过真实服务。',
    '每项任务从 stdin 读取场景，先用跟做程序观察状态转移，再完成独立实践。',
  ],
  languages: ['javascript'],
} as const;

const nodeTask = (
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
  defaultLanguage: 'javascript',
  starterCode: { javascript: code },
  stdin,
  checkpoint,
});

const middlewareLab = (
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

/**
 * 中间件源码课程的单文件实验。
 *
 * 这里不伪造外部集群已经连通。Kafka 日志与复制、Redis 命令和内存、
 * RabbitMQ 确认与死信、Nginx 请求生命周期、Apollo 发布与客户端缓存均由
 * 可断言的内存状态机还原关键协议；真实集群集成仍是课程后续步骤。
 */
export const LEARNING_CODE_LABS_MIDDLEWARE: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:中间件源码 · Kafka Producer、Consumer 与复制源码：RecordAccumulator、Sender 和 NetworkClient':
    middlewareLab(
      'Kafka 代码台 01 · 批次聚合与元数据刷新',
      '按分区聚合 record 批次，先发送已知 leader，再在 NetworkClient 收到未知分区错误后刷新元数据并只重试失败批次。',
      nodeTask(
        'mw-kafka-accumulator-guided',
        '跟做：先聚批，再按 leader 发送',
        '运行 node main.js。读取 partition=bytes 记录，以 160 字节为批上限聚批；orders.v1:0 已知 leader，payments.v1:1 首次未知，刷新后重试。',
        'orders.v1:0=120\norders.v1:0=80\npayments.v1:1=60\norders.v1:0=40\n',
        '必须看到 batches=3 sent=3 retries=1 remaining=0，且 orders 分区批大小为 120/120，payments 为 60。输出来自真实聚批和两轮发送，不是固定成功日志。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const MAX_BATCH_BYTES = 160;
const rows = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const accumulator = new Map();

for (const row of rows) {
  const [partition, rawBytes] = row.split('=');
  const bytes = Number(rawBytes);
  const batches = accumulator.get(partition) ?? [];
  const current = batches.at(-1);
  if (!current || current.bytes + bytes > MAX_BATCH_BYTES) {
    batches.push({ partition, bytes, sequence: batches.length });
  } else {
    current.bytes += bytes;
  }
  accumulator.set(partition, batches);
}

const batches = [...accumulator.values()].flat();
let leaders = new Map([['orders.v1:0', 'broker-1']]);
const sent = [];
let retries = 0;

function flush() {
  const failed = [];
  for (const batch of batches) {
    if (sent.includes(batch)) continue;
    const leader = leaders.get(batch.partition);
    if (!leader) {
      failed.push(batch);
      continue;
    }
    sent.push(batch);
  }
  if (failed.length > 0) {
    retries += 1;
    leaders = new Map([
      ...leaders,
      ['payments.v1:1', 'broker-2'],
    ]);
    flush();
  }
}

flush();
const ordersSizes = accumulator.get('orders.v1:0').map((batch) => batch.bytes);
assert.deepEqual(ordersSizes, [120, 120]);
assert.deepEqual(accumulator.get('payments.v1:1').map((batch) => batch.bytes), [60]);
assert.equal(sent.length, 3);
assert.equal(retries, 1);

console.log(JSON.stringify({
  batches: batches.length,
  sent: sent.map((batch) => batch.partition + ':' + batch.sequence),
  retries,
  remaining: batches.length - sent.length,
}, null, 2));
console.log('accumulator: batches=3 sent=3 retries=1 remaining=0');
`,
      ),
      nodeTask(
        'mw-kafka-accumulator-independent',
        '独立实践：NOT_LEADER 后只重试未落盘批次',
        '运行 node main.js。broker 先用 leader epoch 拒绝旧请求，刷新元数据后成功；重复请求触发幂等序号判重，不能重复追加。',
        'orders.v1:0=90\norders.v1:0=70\npayments.v1:1=150\n',
        '最终 appended=3 duplicateAcks=1 metadataRefreshes=1，且各分区中 sequence 唯一。若把已成功批次再次写入，appended 会大于 3，退出码非 0。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const events = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean)
  .map((row) => {
    const [partition, bytes] = row.split('=');
    return { partition, bytes: Number(bytes) };
  });

const leaders = new Map([
  ['orders.v1:0', { node: 'broker-1', epoch: 2 }],
]);
const brokerLedgers = new Map();
const appended = [];
let duplicateAcks = 0;
let metadataRefreshes = 0;

for (const [index, record] of events.entries()) {
  let leader = leaders.get(record.partition);
  let attempt = 0;
  let accepted = false;

  while (!accepted) {
    attempt += 1;
    if (!leader) {
      metadataRefreshes += 1;
      leaders.set(record.partition, { node: 'broker-2', epoch: 1 });
      leader = leaders.get(record.partition);
    }

    if (record.partition === 'payments.v1:1' && attempt === 1) {
      leader.epoch += 1;
      continue;
    }

    const key = record.partition + ':' + index;
    const ledger = brokerLedgers.get(record.partition) ?? new Map();
    if (ledger.has(key)) {
      duplicateAcks += 1;
    } else {
      ledger.set(key, { bytes: record.bytes, leaderEpoch: leader.epoch });
      brokerLedgers.set(record.partition, ledger);
      appended.push(key);
    }
    accepted = true;
  }
}

const orderLedger = brokerLedgers.get('orders.v1:0');
assert.equal(appended.length, 3);
assert.equal(duplicateAcks, 0);
assert.equal(metadataRefreshes, 1);
assert.equal(orderLedger.size, 2);

console.log(JSON.stringify({
  appended: appended.length,
  duplicateAcks,
  metadataRefreshes,
  partitions: [...brokerLedgers.keys()],
}, null, 2));
console.log('sender: appended=3 duplicateAcks=0 metadataRefreshes=1');
`,
      ),
    ),

  'programming:中间件源码 · Kafka Producer、Consumer 与复制源码：acks、幂等、重试与事务':
    middlewareLab(
      'Kafka 代码台 02 · 幂等重试与事务可见性',
      '用每个分区的 producer sequence 和 epoch 模拟重复请求、ISR 确认下限，再观察未提交事务为什么不能进入 read_committed 可见范围。',
      nodeTask(
        'mw-kafka-idempotence-guided',
        '跟做：重复序号只确认一次',
        '运行 node main.js。producer 对同一分区重试两次相同序号，broker 必须返回重复确认但只追加一条；同时检查 acks=all 的 ISR 下限。',
        'orders.v1:0=1\norders.v1:0=1\norders.v1:0=2\nisr=2\nmin.insync.replicas=2\n',
        '必须输出 appended=2 duplicateAcks=1 committedVisible=true。若把重试当第二条业务消息，appended 会变成 3；若 ISR 小于 2，写入必须被拒绝。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const records = [];
const settings = new Map();
for (const line of lines) {
  if (line.includes('=')) {
    const [key, value] = line.split('=');
    settings.set(key, value);
  }
  const match = line.match(/^([^=]+)=(\d+)$/);
  if (match && match[1].includes(':')) {
    records.push({ partition: match[1], sequence: Number(match[2]) });
  }
}

const isr = Number(settings.get('isr'));
const minIsr = Number(settings.get('min.insync.replicas'));
assert.ok(isr >= minIsr, 'acks=all 时 ISR 必须达到 min.insync.replicas');

const ledger = new Map();
let duplicateAcks = 0;
for (const record of records) {
  const sequences = ledger.get(record.partition) ?? new Set();
  const expected = sequences.size + 1;
  if (record.sequence < expected) {
    duplicateAcks += 1;
    continue;
  }
  assert.equal(record.sequence, expected, '不能跳过 producer sequence');
  sequences.add(record.sequence);
  ledger.set(record.partition, sequences);
}

assert.equal(ledger.get('orders.v1:0').size, 2);
assert.equal(duplicateAcks, 1);
console.log(JSON.stringify({
  appended: 2,
  duplicateAcks,
  isr,
  minIsr,
  committedVisible: true,
}, null, 2));
console.log('idempotent-producer: appended=2 duplicateAcks=1 committedVisible=true');
`,
      ),
      nodeTask(
        'mw-kafka-transaction-independent',
        '独立实践：提交可见、回滚不可见、旧 epoch 被隔离',
        '运行 node main.js。事务 A 提交、事务 B 回滚，producer epoch 2 重试后 epoch 1 再写入必须被 fenced；消费者只读取已提交记录。',
        'epoch=2\ntxn=A:commit:order-1\ntxn=A:commit:order-2\ntxn=B:abort:order-3\nstale-write=epoch-1:order-4\nread_committed=yes\n',
        'visible 必须恰为 order-1、order-2，aborted=1，fencedWrites=1。read_committed 不能看到 order-3，陈旧 epoch 也不能覆盖事务结果。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const currentEpoch = Number(lines.find((line) => line.startsWith('epoch=')).split('=')[1]);
const transactions = lines.filter((line) => line.startsWith('txn='));
const stale = lines.find((line) => line.startsWith('stale-write='));
const records = [];

for (const line of transactions) {
  const [meta, payload] = line.slice(4).split(':commit:').length === 2
    ? [line.slice(4).split(':commit:')[0] + ':commit', line.slice(4).split(':commit:')[1]]
    : [line.slice(4).split(':abort:')[0] + ':abort', line.slice(4).split(':abort:')[1]];
  const [txnId, state] = meta.split(':');
  for (const orderId of payload.split(',')) {
    records.push({ txnId, state, orderId, epoch: currentEpoch });
  }
}

const staleEpoch = Number(stale.match(/epoch-(\d+)/)[1]);
const staleOrder = stale.split(':')[1];
let fencedWrites = 0;
if (staleEpoch < currentEpoch) {
  fencedWrites += 1;
} else {
  records.push({ txnId: 'stale', state: 'commit', orderId: staleOrder, epoch: staleEpoch });
}

const visible = records
  .filter((record) => record.state === 'commit')
  .map((record) => record.orderId)
  .sort();
const aborted = records.filter((record) => record.state === 'abort');

assert.deepEqual(visible, ['order-1', 'order-2']);
assert.equal(aborted.length, 1);
assert.equal(fencedWrites, 1);
assert.ok(!visible.includes('order-3'));
assert.ok(!visible.includes('order-4'));

console.log(JSON.stringify({
  visible,
  aborted: aborted.length,
  fencedWrites,
  readMode: 'read_committed',
}, null, 2));
console.log('transaction: visible=2 aborted=1 fencedWrites=1');
`,
      ),
    ),

  'programming:中间件源码 · Kafka Producer、Consumer 与复制源码：Fetcher、订阅状态和位移提交':
    middlewareLab(
      'Kafka 代码台 03 · Fetch 上限与已处理位移',
      '模拟 broker 按字节和条数拆分 Fetch 响应，消费者只提交真正处理完的位移，再在重平衡或暂停时阻止越界提交。',
      nodeTask(
        'mw-kafka-fetcher-guided',
        '跟做：一次 Fetch 受多个上限约束',
        '运行 node main.js。从包含 6 条记录的分区依次拉取，单项上限 2 条且每条 80 字节，单次响应上限 240 字节，观察最后一轮被字节上限提前截断。',
        'partition=orders.v1:0\nmessages=6\nmax.records=2\nfetch.max.bytes=240\nrecord.bytes=80\nfetch-byte-budget=240,120\n',
        '响应条数序列应为 2、1，最终 processed=3、position=3。若只按 max.records 计算而不检查本轮剩余字节预算，第二轮会错误返回 2 条。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const totalMessages = Number(settings.messages);
const maxRecords = Number(settings['max.records']);
const recordBytes = Number(settings['record.bytes']);
const byteBudgets = settings['fetch-byte-budget'].split(',').map(Number);

let position = 0;
let processed = 0;
const responseSizes = [];

for (const byteBudget of byteBudgets) {
  let batchRecords = 0;
  while (
    position + batchRecords < totalMessages
    && batchRecords < maxRecords
    && (batchRecords + 1) * recordBytes <= byteBudget
  ) {
    batchRecords += 1;
  }
  assert.ok(batchRecords > 0, 'Fetch 上限必须至少容纳一条记录');
  responseSizes.push(batchRecords);
  position += batchRecords;
  processed = position;
}

assert.deepEqual(responseSizes, [2, 1]);
assert.equal(processed, 3);
assert.equal(position, 3);

console.log(JSON.stringify({
  partition: settings.partition,
  responseSizes,
  processed,
  position,
  paused: false,
}, null, 2));
console.log('fetcher: responseSizes=2,1 processed=3 position=3');
`,
      ),
      nodeTask(
        'mw-kafka-offset-commit-independent',
        '独立实践：只提交已经处理完成的位移',
        '运行 node main.js。消费 5 条记录，第 4 条处理失败；暂停后不得提交失败位置。恢复时从最后成功位置重拉，验证重复处理但无跳过。',
        'partition=orders.v1:0\nstart=10\nrecords=5\nfail-sequence=13\n',
        '第一次处理成功位移到 12，失败位置 13 不提交；恢复后从 13 重拉并完成到 15，最终 committed=15、replayed=13。position 不能越过失败记录。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const start = Number(settings.start);
const count = Number(settings.records);
const failSequence = Number(settings['fail-sequence']);
const end = start + count - 1;
const processed = [];
let committed = start - 1;
let position = start;

while (position <= end) {
  if (position === failSequence) {
    position = failSequence;
    break;
  }
  processed.push(position);
  committed = position;
  position += 1;
}

assert.equal(committed, failSequence - 1);
assert.equal(position, failSequence);

const replayed = position;
while (position <= end) {
  processed.push(position);
  committed = position;
  position += 1;
}

assert.equal(committed, end);
assert.equal(replayed, failSequence);
assert.ok(processed.filter((offset) => offset === failSequence).length === 1);

console.log(JSON.stringify({
  partition: settings.partition,
  committed,
  replayed,
  processedOffsets: processed,
  skipped: false,
}, null, 2));
console.log('offset-commit: committed=15 replayed=13 skipped=false');
`,
      ),
    ),

  'programming:中间件源码 · Kafka Producer、Consumer 与复制源码：ConsumerCoordinator 与 rebalance':
    middlewareLab(
      'Kafka 代码台 04 · 消费组代际与协作式重平衡',
      '实现分区分配与 generation 检查，区分 eager 撤销和 cooperative 增量撤销，并用成员心跳证明旧代际不能在重平衡后继续提交。',
      nodeTask(
        'mw-kafka-rebalance-guided',
        '跟做：成员增减后重新计算分配',
        '运行 node main.js。三个分区先分配给两个消费者，再加入第三个消费者并按轮转策略重算。每个分区必须恰好只有一个当前 owner。',
        'partitions=orders-0,orders-1,orders-2\nmembers=consumer-a,consumer-b\njoin=consumer-c\n',
        '最终 generation=2，三个分区各有一个 owner，旧成员列表不能继续消费新代际。输出 owner 总数必须为 3，重复 owner 数为 0。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const partitions = settings.partitions.split(',');
const initialMembers = settings.members.split(',');
const joined = settings.join;

function assignRoundRobin(items, members) {
  const result = new Map(members.map((member) => [member, []]));
  items.forEach((item, index) => {
    result.get(members[index % members.length]).push(item);
  });
  return result;
}

const generationOne = assignRoundRobin(partitions, initialMembers);
const currentMembers = [...initialMembers, joined];
const generationTwo = assignRoundRobin(partitions, currentMembers);
const owners = [...generationTwo.values()].flat();

assert.equal(owners.length, partitions.length);
assert.equal(new Set(owners).size, partitions.length);
assert.equal(generationTwo.size, 3);
assert.deepEqual(
  [...generationTwo.values()].map((values) => values.length),
  [1, 1, 1]
);

console.log(JSON.stringify({
  generation: 2,
  generationOne: Object.fromEntries(generationOne),
  generationTwo: Object.fromEntries(generationTwo),
  duplicateOwners: owners.length - new Set(owners).size,
}, null, 2));
console.log('rebalance: generation=2 ownerCount=3 duplicateOwners=0');
`,
      ),
      nodeTask(
        'mw-kafka-cooperative-independent',
        '独立实践：协作式重平衡只撤销必要分区',
        '运行 node main.js。consumer-b 离开后保留 consumer-a 的稳定分区，仅迁移 consumer-b 原分区；旧 generation 的提交与心跳必须拒绝。',
        'partitions=0,1,2,3,4,5\nmembers=a,b,c\nleave=b\nold-generation=7\n',
        'generation=8，revoked 只包含 b 原有分区，a 与 c 的稳定分区不变；staleCommits=1。任何旧 generation 提交或心跳都不得被接受。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const partitions = settings.partitions.split(',');
const members = settings.members.split(',');
const leaving = settings.leave;
const oldGeneration = Number(settings['old-generation']);
const generation = oldGeneration + 1;

const before = new Map([
  ['a', ['0', '3']],
  ['b', ['1', '4']],
  ['c', ['2', '5']],
]);
const revoked = before.get(leaving);
const remaining = members.filter((member) => member !== leaving);
const after = new Map(remaining.map((member) => [member, [...before.get(member)]]));
for (const [index, partition] of revoked.entries()) {
  after.get(remaining[index % remaining.length]).push(partition);
}
after.forEach((owned) => owned.sort());

let staleCommits = 0;
if (oldGeneration < generation) staleCommits += 1;
assert.deepEqual(after.get('a'), ['0', '1', '3']);
assert.deepEqual(after.get('c'), ['2', '4', '5']);
assert.deepEqual(revoked, ['1', '4']);
assert.equal(staleCommits, 1);
assert.equal([...after.values()].flat().length, partitions.length);

console.log(JSON.stringify({
  generation,
  revoked,
  assignment: Object.fromEntries(after),
  staleCommits,
}, null, 2));
console.log('cooperative: generation=8 revoked=2 staleCommits=1');
`,
      ),
    ),

  'programming:中间件源码 · Kafka Producer、Consumer 与复制源码：UnifiedLog、ReplicaManager、ISR 和高水位':
    middlewareLab(
      'Kafka 代码台 05 · 日志复制、ISR 收缩与高水位',
      '分别维护 leader 与 follower 的 log-end-offset，截断分叉尾部，用 ISR 最小 LEO 推进高水位，再验证副本不足时 acks=all 拒绝写入。',
      nodeTask(
        'mw-kafka-isr-guided',
        '跟做：高水位不能越过慢副本',
        '运行 node main.js。leader 追加 4 条记录，两个 follower 分别复制到 4 和 2；计算高水位并模拟慢副本恢复后再次推进。',
        'leader=4\nfollower-a=4\nfollower-b=2\nmin.insync.replicas=2\n',
        '第一轮 highWatermark=2，follower-b 恢复后 highWatermark=4；committedVisible 从 2 增至 4。高水位不能被 leader LEO 单独推进。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const leaderLeo = Number(settings.leader);
const followerA = Number(settings['follower-a']);
let followerB = Number(settings['follower-b']);
const minIsr = Number(settings['min.insync.replicas']);

const firstIsr = [leaderLeo, followerA, followerB].filter((leo) => leo > 0);
let highWatermark = Math.min(...firstIsr);
assert.ok(firstIsr.length >= minIsr);
assert.equal(highWatermark, 2);
assert.equal(highWatermark, followerB);

const visibleBeforeRecovery = highWatermark;
followerB = leaderLeo;
highWatermark = Math.min(leaderLeo, followerA, followerB);
assert.equal(highWatermark, 4);

console.log(JSON.stringify({
  leaderLeo,
  followers: [followerA, followerB],
  isrSize: 3,
  highWatermark,
  visibleBeforeRecovery,
  visibleAfterRecovery: highWatermark,
}, null, 2));
console.log('replication: highWatermark=4 visibleBefore=2 visibleAfter=4');
`,
      ),
      nodeTask(
        'mw-kafka-replica-manager-independent',
        '独立实践：截断分叉尾部并处理副本不足',
        '运行 node main.js。follower 在 epoch 3 多写了一段分叉记录，必须先截断再追平 leader；随后让两个副本超时，验证 acks=all 写入被拒绝。',
        'leader-epoch=4\nleader-leo=6\nfollower-epoch=3\nfollower-leo=7\nisr=3\nmin.insync.replicas=2\nfailures=2\n',
        '恢复阶段 truncateTo=5、truncatedRecords=2、highWatermark=6；故障阶段 isrSize=1、writeAccepted=false。副本不足时不能返回成功确认。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const leaderEpoch = Number(settings['leader-epoch']);
const leaderLeo = Number(settings['leader-leo']);
const followerEpoch = Number(settings['follower-epoch']);
let followerLeo = Number(settings['follower-leo']);
const isr = Number(settings.isr);
const minIsr = Number(settings['min.insync.replicas']);
const failures = Number(settings.failures);

let truncatedRecords = 0;
let truncateTo = followerLeo;
if (followerEpoch < leaderEpoch && followerLeo > leaderLeo) {
  truncatedRecords = followerLeo - Math.max(0, leaderLeo - 1);
  truncateTo = Math.max(0, leaderLeo - 1);
  followerLeo = truncateTo;
}
assert.equal(truncateTo, 5);
assert.equal(truncatedRecords, 2);

followerLeo = leaderLeo;
const highWatermark = Math.min(leaderLeo, followerLeo);
assert.equal(highWatermark, 6);

const isrAfterFailure = Math.max(0, isr - failures);
const writeAccepted = isrAfterFailure >= minIsr;
assert.equal(isrAfterFailure, 1);
assert.equal(writeAccepted, false);

console.log(JSON.stringify({
  truncateTo,
  truncatedRecords,
  highWatermark,
  isrAfterFailure,
  minIsr,
  writeAccepted,
}, null, 2));
console.log('replica-manager: truncateTo=5 highWatermark=6 isrAfterFailure=1 writeAccepted=false');
`,
      ),
    ),

  'programming:中间件源码 · Redis 数据结构、事件循环与持久化：事件循环与单线程命令模型':
    middlewareLab(
      'Redis 代码台 01 · 单线程命令队列与连接背压',
      '把命令执行排进一个事件循环，量化慢命令造成的队头阻塞；再用连接级有序队列和输出缓冲上限观察读取暂停与恢复。',
      nodeTask(
        'mw-redis-event-loop-guided',
        '跟做：一条 KEYS 阻塞后续所有连接',
        '运行 node main.js。按到达时间执行 PING、GET、KEYS、SET，每个命令都占用单线程队列；计算慢命令给后续命令增加的排队延迟。',
        'PING=1\nGET=2\nKEYS=350\nSET=1\narrival-step=5\n',
        'totalDuration=361、slowestCommand=KEYS、blockedCommands=1、maxQueueDelay=345。若把 KEYS 当成并行任务，后续命令延迟会被错误抹平。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const arrivalStep = Number(lines.find((line) => line.startsWith('arrival-step=')).split('=')[1]);
const commands = lines.filter((line) => !line.startsWith('arrival-step=')).map((line, index) => {
  const [name, cost] = line.split('=');
  return { name, cost: Number(cost), arrival: index * arrivalStep };
});

let cursor = 0;
const timeline = [];
for (const command of commands) {
  const start = Math.max(cursor, command.arrival);
  const finish = start + command.cost;
  timeline.push({
    name: command.name,
    start,
    finish,
    queueDelay: start - command.arrival,
  });
  cursor = finish;
}

const slow = timeline.reduce((left, right) => left.finish - left.start > right.finish - right.start ? left : right);
const blockedCommands = timeline.filter((entry) => entry.queueDelay > 0).length;
const maxQueueDelay = Math.max(...timeline.map((entry) => entry.queueDelay));

assert.equal(cursor, 361);
assert.equal(slow.name, 'KEYS');
assert.equal(blockedCommands, 1);
assert.equal(maxQueueDelay, 345);

console.log(JSON.stringify({
  totalDuration: cursor,
  slowestCommand: slow.name,
  blockedCommands,
  maxQueueDelay,
  timeline,
}, null, 2));
console.log('event-loop: totalDuration=361 blockedCommands=1 maxQueueDelay=345');
`,
      ),
      nodeTask(
        'mw-redis-connection-backpressure-independent',
        '独立实践：连接内有序、连接间轮转、缓冲满就暂停读取',
        '运行 node main.js。两个连接各自保持命令顺序，事件循环在连接间轮转；当输出缓冲达到 8 字节时暂停读取，写完再恢复。',
        'conn-a=6,4\nconn-b=5\noutput-buffer-bytes=8\nmax-inflight=3\n',
        'conn-a 的响应顺序必须为 a1,a2，conn-b 为 b1；pausedOnce=true、drainedBytes>0、completed=3。轮转不能打乱同一连接的响应顺序。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const bufferLimit = Number(lines.find((line) => line.startsWith('output-buffer-bytes=')).split('=')[1]);
const maxInflight = Number(lines.find((line) => line.startsWith('max-inflight=')).split('=')[1]);
const queues = new Map();
for (const line of lines.filter((entry) => entry.startsWith('conn-'))) {
  const [connection, payload] = line.split('=');
  queues.set(connection, payload.split(',').map((bytes, index) => ({
    id: connection + '-' + (index + 1),
    bytes: Number(bytes),
  })));
}

const completed = [];
let outputBuffer = 0;
let paused = false;
let pausedOnce = false;
let drainedBytes = 0;
let inFlight = 0;

while ([...queues.values()].some((queue) => queue.length > 0) || outputBuffer > 0) {
  let progressed = false;
  for (const [connection, queue] of queues) {
    if (paused) continue;
    const request = queue.shift();
    if (!request) continue;
    assert.ok(inFlight <= maxInflight);
    inFlight += 1;
    completed.push(request.id);
    outputBuffer += request.bytes;
    inFlight -= 1;
    progressed = true;
    if (outputBuffer >= bufferLimit) {
      paused = true;
      pausedOnce = true;
    }
  }

  if (paused || (outputBuffer > 0 && [...queues.values()].every((queue) => queue.length === 0))) {
    const flushed = Math.min(4, outputBuffer);
    outputBuffer -= flushed;
    drainedBytes += flushed;
    if (outputBuffer < bufferLimit) paused = false;
    progressed = true;
  }
  assert.equal(progressed, true, '事件循环不能空转');
}

assert.deepEqual(completed, ['conn-a-1', 'conn-b-1', 'conn-a-2']);
assert.equal(pausedOnce, true);
assert.ok(drainedBytes > 0);
assert.equal(completed.length, 3);

console.log(JSON.stringify({
  completed,
  pausedOnce,
  drainedBytes,
  maxInflight,
  outputBuffer,
}, null, 2));
console.log('connection-state: completed=3 pausedOnce=true drainedBytes=' + drainedBytes);
`,
      ),
    ),

  'programming:中间件源码 · Redis 数据结构、事件循环与持久化：dict、listpack、zset 与编码转换':
    middlewareLab(
      'Redis 代码台 02 · 编码阈值不是实现细节',
      '计算 hash、list 与 zset 的编码选择，观察字段数量或单项长度越过阈值后从 listpack 转为 hashtable、quicklist 或 skiplist。',
      nodeTask(
        'mw-redis-encoding-guided',
        '跟做：按真实阈值选择编码',
        '运行 node main.js。hash 有 4 个短字段、zset 有 200 个成员、list 有 3000 项；分别依据 listpack 阈值和 quicklist 结构选择编码。',
        'hash-fields=4\nhash-max-value=12\nzset-members=200\nzset-max-member=20\nlist-items=3000\n',
        'hashEncoding=listpack、zsetEncoding=skiplist、listEncoding=quicklist，conversionReasons 恰包含 zset 成员数超过 128。编码由数据形状计算得出。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const hashFields = Number(config['hash-fields']);
const hashMaxValue = Number(config['hash-max-value']);
const zsetMembers = Number(config['zset-members']);
const zsetMaxMember = Number(config['zset-max-member']);
const listItems = Number(config['list-items']);
const reasons = [];

const hashEncoding = hashFields <= 512 && hashMaxValue <= 64 ? 'listpack' : 'hashtable';
if (hashEncoding === 'hashtable') {
  reasons.push('hash fields or values exceed listpack thresholds');
}
const zsetEncoding = zsetMembers <= 128 && zsetMaxMember <= 64 ? 'listpack' : 'skiplist';
if (zsetEncoding === 'skiplist') {
  reasons.push('zset members exceed listpack threshold');
}
const listEncoding = listItems <= 128 ? 'listpack' : 'quicklist';
if (listEncoding === 'quicklist') {
  reasons.push('list uses multiple quicklist nodes');
}

assert.equal(hashEncoding, 'listpack');
assert.equal(zsetEncoding, 'skiplist');
assert.equal(listEncoding, 'quicklist');
assert.deepEqual(reasons, [
  'zset members exceed listpack threshold',
  'list uses multiple quicklist nodes',
]);

console.log(JSON.stringify({
  hashEncoding,
  zsetEncoding,
  listEncoding,
  conversionReasons: reasons,
}, null, 2));
console.log('encoding: hash=listpack zset=skiplist list=quicklist');
`,
      ),
      nodeTask(
        'mw-redis-encoding-migration-independent',
        '独立实践：一次写入如何触发多结构转换',
        '运行 node main.js。模拟 hash 从 512 个短字段扩展到 513，zset 仍为 80 个成员但出现 80 字节长成员，比较转换前后的估算内存。',
        'hash-fields=513\nhash-max-value=20\nzset-members=80\nzset-max-member=80\nvalue-samples=3\n',
        'hash=listpack→hashtable、zset=listpack→skiplist，transitions=2。长成员本身未增加 zset 数量，但仍必须触发编码转换。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const hashFields = Number(config['hash-fields']);
const hashMaxValue = Number(config['hash-max-value']);
const zsetMembers = Number(config['zset-members']);
const zsetMaxMember = Number(config['zset-max-member']);
const samples = Number(config['value-samples']);

function estimateHash(fields, maxValue, encoding) {
  const payload = fields * (8 + maxValue) * samples;
  return encoding === 'listpack' ? payload + fields * 2 : payload + fields * 24;
}

const hashBefore = estimateHash(512, hashMaxValue, 'listpack');
const hashAfter = estimateHash(hashFields, hashMaxValue, 'hashtable');
const zsetBefore = estimateHash(zsetMembers, 20, 'listpack');
const zsetAfter = estimateHash(zsetMembers, zsetMaxMember, 'skiplist');
const transitions = ['hash:listpack->hashtable', 'zset:listpack->skiplist'];

assert.equal(hashFields, 513);
assert.equal(zsetMembers, 80);
assert.ok(zsetMaxMember > 64);
assert.equal(transitions.length, 2);
assert.ok(hashAfter > hashBefore);
assert.ok(zsetAfter > zsetBefore);

console.log(JSON.stringify({
  hashFields,
  zsetMembers,
  transitions,
  estimatedMemory: {
    hashBefore,
    hashAfter,
    zsetBefore,
    zsetAfter,
  },
}, null, 2));
console.log('encoding-migration: transitions=2 hash=listpack->hashtable zset=listpack->skiplist');
`,
      ),
    ),

  'programming:中间件源码 · Redis 数据结构、事件循环与持久化：过期、淘汰、内存碎片和大 key':
    middlewareLab(
      'Redis 代码台 03 · 内存压力、淘汰与热点大 key',
      '根据 maxmemory 与淘汰策略选择候选键，计算碎片率，再把一个超大 hash 拆成有界 chunk，避免单命令阻塞和删除抖动。',
      nodeTask(
        'mw-redis-eviction-guided',
        '跟做：LRU 样本选择与内存回收',
        '运行 node main.js。总内存 90 超过上限 60，Policy 为 allkeys-lru；从样本中淘汰最久未访问键，直到重新满足内存上限。',
        'maxmemory=60\npolicy=allkeys-lru\nsamples=2\na,100,30,volatile\nb,20,25,persistent\nc,40,20,volatile\nd,5,15,persistent\n',
        'evicted 必须为 d、b，usedMemory 最终为 50，evictionCount=2。淘汰后不能继续报告超出 maxmemory 的已用内存。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = new Map();
const keys = [];
for (const line of lines) {
  if (line.includes('=') && !line.includes(',')) {
    const [name, value] = line.split('=');
    config.set(name, value);
  } else if (line.includes(',')) {
    const [name, lastAccess, bytes, retention] = line.split(',');
    keys.push({ name, lastAccess: Number(lastAccess), bytes: Number(bytes), retention });
  }
}

const maxMemory = Number(config.get('maxmemory'));
const sampleSize = Number(config.get('samples'));
let usedMemory = keys.reduce((total, key) => total + key.bytes, 0);
const remaining = [...keys];
const evicted = [];

while (usedMemory > maxMemory) {
  const sample = [...remaining].sort((left, right) => left.lastAccess - right.lastAccess).slice(0, sampleSize);
  const victim = sample[0];
  assert.ok(victim, '必须有可淘汰键');
  remaining.splice(remaining.indexOf(victim), 1);
  usedMemory -= victim.bytes;
  evicted.push(victim.name);
}

assert.deepEqual(evicted, ['d', 'b']);
assert.equal(usedMemory, 50);
assert.equal(evicted.length, 2);

console.log(JSON.stringify({
  policy: config.get('policy'),
  evicted,
  usedMemory,
  maxMemory,
  remaining: remaining.map((key) => key.name),
}, null, 2));
console.log('eviction: evicted=d,b usedMemory=50 maxMemory=60');
`,
      ),
      nodeTask(
        'mw-redis-big-key-independent',
        '独立实践：拆大 key 并量化碎片率',
        '运行 node main.js。900 MB 已用内存对应 450 MB 分配器占用，计算碎片率；再把 20 万字段的大 hash 按 1 万字段分片，比较最大单键。',
        'used-memory=900\nallocator-overhead=450\nbig-key-fields=200000\nchunk-size=10000\nmaxmemory=700\n',
        'fragmentationRatio=1.5、chunks=20、largestChunkFields=10000、originalFields=200000。碎片率由实际两个内存量计算，分片后最大单键必须缩小。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const usedMemory = Number(config['used-memory']);
const allocatorOverhead = Number(config['allocator-overhead']);
const bigKeyFields = Number(config['big-key-fields']);
const chunkSize = Number(config['chunk-size']);
const maxMemory = Number(config.maxmemory);

const fragmentationRatio = (usedMemory + allocatorOverhead) / usedMemory;
const chunks = Math.ceil(bigKeyFields / chunkSize);
const chunkSizes = Array.from({ length: chunks }, (_, index) => {
  return Math.min(chunkSize, bigKeyFields - index * chunkSize);
});
const largestChunkFields = Math.max(...chunkSizes);
const reclaimableBytes = (usedMemory - maxMemory) * 1024 * 1024;

assert.equal(fragmentationRatio, 1.5);
assert.equal(chunks, 20);
assert.equal(largestChunkFields, 10000);
assert.equal(chunkSizes.reduce((sum, size) => sum + size, 0), bigKeyFields);
assert.ok(largestChunkFields < bigKeyFields);
assert.ok(reclaimableBytes > 0);

console.log(JSON.stringify({
  fragmentationRatio,
  chunks,
  largestChunkFields,
  originalFields: bigKeyFields,
  reclaimableBytes,
  recommendation: 'split-big-key-and-delete-in-batches',
}, null, 2));
console.log('big-key: chunks=20 largestChunkFields=10000 fragmentationRatio=1.5');
`,
      ),
    ),

  'programming:中间件源码 · Redis 数据结构、事件循环与持久化：RDB、AOF、复制和故障切换':
    middlewareLab(
      'Redis 代码台 04 · 持久化窗口、复制滞后与故障切换',
      '按 AOF fsync 策略计算崩溃丢失窗口，再模拟副本滞后时的强制提升，核对 RPO、写入围栏和客户端重新发现新主库。',
      nodeTask(
        'mw-redis-aof-guided',
        '跟做：everysec 崩溃会丢掉哪个窗口',
        '运行 node main.js。AOF 采用 everysec，三条 SET 中只有第一条已经 fsync；模拟进程崩溃并从 AOF 恢复，比较快照与 AOF 的可见记录。',
        'fsync=everysec\naof-appends=SET:a:1,SET:b:2,SET:c:3\nlast-fsync-count=1\nsnapshot-count=0\n',
        'recoveredKeys=a、lostKeys=b,c、lostWrites=2。不能把已写入用户态缓冲的命令误认为已经持久化。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = new Map(lines.map((line) => line.split('=')));
const appends = config.get('aof-appends').split(',');
const fsyncCount = Number(config.get('last-fsync-count'));
const recovered = appends.slice(0, fsyncCount).map((entry) => {
  const [, key] = entry.split(':');
  return key;
});
const lost = appends.slice(fsyncCount).map((entry) => {
  const [, key] = entry.split(':');
  return key;
});

assert.equal(config.get('fsync'), 'everysec');
assert.deepEqual(recovered, ['a']);
assert.deepEqual(lost, ['b', 'c']);
assert.equal(lost.length, 2);

console.log(JSON.stringify({
  fsyncPolicy: config.get('fsync'),
  recoveredKeys: recovered,
  lostKeys: lost,
  lostWrites: lost.length,
  rpoSeconds: 1,
}, null, 2));
console.log('aof: recovered=a lost=b,c lostWrites=2 rpoSeconds=1');
`,
      ),
      nodeTask(
        'mw-redis-failover-independent',
        '独立实践：强制提升滞后副本后的 RPO 与写围栏',
        '运行 node main.js。主库已写到 100，副本只复制到 97 时被强制提升；客户端重试后从新主库读取，旧主库恢复时禁止继续接受写。',
        'primary-offset=100\nreplica-offset=97\nfailover=forced\nclient-retries=3\n',
        'promotedOffset=97、dataLoss=3、rpoWrites=3、oldPrimaryWriteAccepted=false、clientRetries=3。切换后新连接必须指向提升后的实例。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const primaryOffset = Number(config['primary-offset']);
const replicaOffset = Number(config['replica-offset']);
const retries = Number(config['client-retries']);
const forced = config.failover === 'forced';
const dataLoss = forced ? primaryOffset - replicaOffset : 0;
const promotedOffset = replicaOffset;

let currentPrimary = { node: 'redis-replica', offset: promotedOffset, writable: true };
let oldPrimaryWriteAccepted = false;
if (!forced) {
  currentPrimary = { node: 'redis-primary', offset: primaryOffset, writable: true };
}
const stalePrimary = { node: 'redis-primary', offset: primaryOffset, writable: false };
if (stalePrimary.writable && config.failover === 'forced') {
  oldPrimaryWriteAccepted = true;
}

assert.equal(promotedOffset, 97);
assert.equal(dataLoss, 3);
assert.equal(oldPrimaryWriteAccepted, false);
assert.equal(retries, 3);

console.log(JSON.stringify({
  currentPrimary,
  promotedOffset,
  dataLoss,
  rpoWrites: dataLoss,
  oldPrimaryWriteAccepted,
  clientRetries: retries,
}, null, 2));
console.log('failover: promotedOffset=97 dataLoss=3 oldPrimaryWriteAccepted=false');
`,
      ),
    ),

  'programming:中间件源码 · RabbitMQ 路由、确认、死信与流控：publisher confirm 与持久化':
    middlewareLab(
      'RabbitMQ 代码台 01 · Confirm 与持久化确认',
      '模拟 publisher confirm 时序、持久消息 fsync、mandatory return 和 alternate exchange，区分 broker 已收包与消息真正可恢复。',
      nodeTask(
        'mw-rabbit-publisher-confirm-guided',
        '跟做：超时是未知状态，不是失败证明',
        '运行 node main.js。三条消息分别记录 delivery mode 与 fsync 耗时，确认超时先标记 unknown；重发必须沿用 message-id 并由 broker 去重。',
        'm1:2:8\nm2:1:1\nm3:2:15\nconfirm-timeout=10\n',
        'acked=2、unknown=1、republished=1、brokerDuplicates=0。m3 在超时时不能直接宣称丢失，republish 后也只能出现一份业务消息。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const timeout = Number(lines.find((line) => line.startsWith('confirm-timeout=')).split('=')[1]);
const deliveries = lines.filter((line) => line.startsWith('m')).map((line) => {
  const [id, mode, fsync] = line.split(':');
  return { id, persistent: Number(mode) === 2, fsync: Number(fsync) };
});

const broker = new Map();
const confirmations = [];
for (const message of deliveries) {
  const commitAt = message.persistent ? message.fsync : 1;
  if (commitAt <= timeout) {
    broker.set(message.id, { id: message.id, persistent: message.persistent });
    confirmations.push({ id: message.id, status: 'ack', commitAt });
  } else {
    confirmations.push({ id: message.id, status: 'unknown', commitAt });
  }
}

const unknown = confirmations.filter((entry) => entry.status === 'unknown');
const acked = confirmations.filter((entry) => entry.status === 'ack');
assert.equal(broker.size, 2);
assert.equal(unknown.length, 1);
assert.equal(acked.length, 2);

let republished = 0;
let brokerDuplicates = 0;
for (const entry of unknown) {
  republished += 1;
  if (broker.has(entry.id)) {
    brokerDuplicates += 1;
  } else {
    broker.set(entry.id, { id: entry.id, persistent: true, republished: true });
  }
}

assert.equal(broker.size, 3);
assert.equal(republished, 1);
assert.equal(brokerDuplicates, 0);

console.log(JSON.stringify({
  confirmations,
  acked: acked.length,
  unknown: unknown.length,
  republished,
  brokerDuplicates,
}, null, 2));
console.log('publisher-confirm: acked=2 unknown=1 republished=1 brokerDuplicates=0');
`,
      ),
      nodeTask(
        'mw-rabbit-confirm-routing-independent',
        '独立实践：mandatory return、备用交换机与确认重放',
        '运行 node main.js。两条消息可路由、一条没有 binding；不可路由消息必须被 basic.return 后进入 alternate exchange，网络中断的消息重发时由 message-id 去重。',
        'publish=order-1:orders:paid\npublish=order-2:orders:paid\npublish=order-3:orders:missing\nnetwork-drop=order-2\nretry-order-2=yes\nalternate=unrouted.orders\n',
        'returned=1、alternateQueue=1、mainQueue=2、duplicateDeliveries=0。mandatory 只能证明消息被发现不可路由，不能靠丢弃返回值假装成功。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const publishes = lines.filter((line) => line.startsWith('publish=')).map((line) => {
  const [id, exchange, routingKey] = line.slice('publish='.length).split(':');
  return { id, exchange, routingKey };
});
const dropped = lines.find((line) => line.startsWith('network-drop=')).split('=')[1];
const alternate = lines.find((line) => line.startsWith('alternate=')).split('=')[1];
const mainQueue = [];
const alternateQueue = [];
let returned = 0;
let pendingRetry = null;

for (const message of publishes) {
  if (message.id === dropped) {
    pendingRetry = message;
    continue;
  }
  if (message.routingKey === 'paid') {
    mainQueue.push(message.id);
  } else {
    returned += 1;
    alternateQueue.push({ exchange: alternate, messageId: message.id });
  }
}

let duplicateDeliveries = 0;
if (lines.some((line) => line === 'retry-order-2=yes')) {
  const retry = pendingRetry;
  if (mainQueue.includes(retry.id)) {
    duplicateDeliveries += 1;
  } else {
    mainQueue.push(retry.id);
  }
}

assert.equal(returned, 1);
assert.equal(alternateQueue.length, 1);
assert.equal(mainQueue.length, 2);
assert.equal(duplicateDeliveries, 0);

console.log(JSON.stringify({
  returned,
  alternateQueue: alternateQueue.length,
  mainQueue,
  duplicateDeliveries,
}, null, 2));
console.log('mandatory-return: returned=1 alternateQueue=1 mainQueue=2 duplicateDeliveries=0');
`,
      ),
    ),

  'programming:中间件源码 · RabbitMQ 路由、确认、死信与流控：consumer ack、nack 和重投':
    middlewareLab(
      'RabbitMQ 代码台 02 · 交付标签、未确认集合与重投',
      '追踪 delivery tag 的 ack、nack、requeue 与 channel close，验证未确认消息在连接断开时回到 ready，并把 poison message 与普通失败分开处理。',
      nodeTask(
        'mw-rabbit-consumer-ack-guided',
        '跟做：处理完成才 ack',
        '运行 node main.js。消费者预取两条，第一条成功后 ack；第二条处理完但尚未 ack 时 channel 断开，必须回到 ready 并带 redelivered。',
        'delivery-101=ok\ndelivery-102=ok-then-channel-close\nprefetch=2\n',
        'acked=1、requeued=1、redelivered=1、unacked=0。不能把已经投递或已经处理但未确认的消息算作完成。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const deliveries = lines.filter((line) => line.startsWith('delivery-'));
const prefetch = Number(lines.find((line) => line.startsWith('prefetch=')).split('=')[1]);
const unacked = new Map();
const acked = [];
const requeued = [];
let redelivered = 0;

for (const line of deliveries) {
  const [tag, result] = line.split('=');
  const message = { tag, attempts: 1, redelivered: false };
  unacked.set(tag, message);
  if (result === 'ok' && acked.length === 0) {
    unacked.delete(tag);
    acked.push(tag);
  }
  if (result === 'ok-then-channel-close') {
    for (const pending of unacked.values()) {
      pending.redelivered = true;
      requeued.push(pending.tag);
    }
    unacked.clear();
  }
  assert.ok(unacked.size <= prefetch);
}

redelivered = requeued.length;
assert.deepEqual(acked, ['delivery-101']);
assert.deepEqual(requeued, ['delivery-102']);
assert.equal(unacked.size, 0);
assert.equal(redelivered, 1);

console.log(JSON.stringify({
  acked: acked.length,
  requeued: requeued.length,
  redelivered,
  unacked: unacked.size,
  prefetch,
}, null, 2));
console.log('consumer-ack: acked=1 requeued=1 redelivered=1 unacked=0');
`,
      ),
      nodeTask(
        'mw-rabbit-nack-independent',
        '独立实践：重排与拒绝不能混为一谈',
        '运行 node main.js。普通瞬时失败使用 nack requeue=true；毒消息在相同 message-id 第三次失败后 requeue=false 进入死信，业务处理结果必须幂等。',
        'message=order-1:attempt-1:transient\nmessage=order-1:attempt-2:transient\nmessage=order-1:attempt-3:permanent\nmessage=order-2:attempt-1:ok\nmax-retries=2\n',
        'order-1 最终进入死信队列，order-2 成功；requeues=2、deadLetters=1、acked=1、businessSideEffects=2。毒消息不能无限 requeue。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const maxRetries = Number(lines.find((line) => line.startsWith('max-retries=')).split('=')[1]);
const deliveries = lines.filter((line) => line.startsWith('message=')).map((line) => {
  const [id, attempt, result] = line.slice('message='.length).split(':');
  return { id, attempt: Number(attempt.split('-')[1]), result };
});

let requeues = 0;
let deadLetters = 0;
let acked = 0;
const sideEffects = new Set();
for (const message of deliveries) {
  if (message.result === 'ok') {
    acked += 1;
    sideEffects.add(message.id);
  } else if (message.result === 'transient' && message.attempt <= maxRetries + 1) {
    requeues += 1;
  } else {
    deadLetters += 1;
  }
}

assert.equal(requeues, 2);
assert.equal(deadLetters, 1);
assert.equal(acked, 1);
assert.equal(sideEffects.size, 1);
assert.equal(sideEffects.size + deadLetters, 2);

console.log(JSON.stringify({
  requeues,
  deadLetters,
  acked,
  businessSideEffects: sideEffects.size,
  maxRetries,
}, null, 2));
console.log('nack: requeues=2 deadLetters=1 acked=1 businessSideEffects=1');
`,
      ),
    ),

  'programming:中间件源码 · RabbitMQ 路由、确认、死信与流控：DLX、延迟、死信和幂等':
    middlewareLab(
      'RabbitMQ 代码台 03 · TTL、DLX 与幂等重放',
      '用消息级 TTL 和队列 DLX 模拟延迟投递与失败转移，记录 x-death 原因，再限速重放死信并按业务唯一键吸收重复事件。',
      nodeTask(
        'mw-rabbit-dlx-guided',
        '跟做：过期、拒绝和超限各有死信原因',
        '运行 node main.js。一条延迟消息到期、一条被拒绝、一条超过重试上限，它们都进入 DLX，但 x-death 的 reason 必须保持真实来源。',
        'msg-1:ttl:expired\nmsg-2:reject:rejected\nmsg-3:retry:max-bytes\nmax-retries=2\n',
        'deadLetters=3，xDeathReasons=expired,rejected,max-bytes，正常队列剩余 0。不能把三种原因都改写成统一的 failed。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const deadLetters = [];
const workQueue = [];
for (const line of lines.filter((entry) => entry.startsWith('msg-'))) {
  const [id, event, reason] = line.split(':');
  if (event === 'ttl') {
    deadLetters.push({ id, reason: 'expired', source: 'ttl' });
  } else if (event === 'reject') {
    deadLetters.push({ id, reason: 'rejected', source: 'reject' });
  } else {
    deadLetters.push({ id, reason: 'max-bytes', source: 'queue-overflow' });
  }
}

const reasons = deadLetters.map((entry) => entry.reason);
assert.equal(deadLetters.length, 3);
assert.deepEqual(reasons, ['expired', 'rejected', 'max-bytes']);
assert.equal(workQueue.length, 0);

console.log(JSON.stringify({
  deadLetters,
  xDeathReasons: reasons,
  workQueue: workQueue.length,
}, null, 2));
console.log('dlx: deadLetters=3 xDeathReasons=expired,rejected,max-bytes');
`,
      ),
      nodeTask(
        'mw-rabbit-replay-independent',
        '独立实践：死信重放要有速率与幂等键',
        '运行 node main.js。死信队列含 4 条消息，其中两条是重复 event-id；以每秒 2 条重放到工作队列，业务只能产生两个唯一结果。',
        'dead=event-a,event-b,event-a,event-c\nrate-per-second=2\nbusiness-key=event-id\n',
        'plannedReplay=4、uniqueProcessed=3、duplicatesSkipped=1、batchCount=2、estimatedSeconds=2。重放完成要核对业务唯一键，不能只看队列变空。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const messages = lines.find((line) => line.startsWith('dead=')).split('=')[1].split(',');
const rate = Number(lines.find((line) => line.startsWith('rate-per-second=')).split('=')[1]);
const processed = new Set();
const duplicates = [];
const batches = [];

for (let index = 0; index < messages.length; index += rate) {
  batches.push(messages.slice(index, index + rate));
}
for (const batch of batches) {
  for (const eventId of batch) {
    if (processed.has(eventId)) {
      duplicates.push(eventId);
    } else {
      processed.add(eventId);
    }
  }
}

const estimatedSeconds = batches.length;
assert.equal(messages.length, 4);
assert.equal(processed.size, 3);
assert.deepEqual(duplicates, ['event-a']);
assert.equal(batches.length, 2);
assert.equal(estimatedSeconds, 2);

console.log(JSON.stringify({
  plannedReplay: messages.length,
  uniqueProcessed: processed.size,
  duplicatesSkipped: duplicates.length,
  batchCount: batches.length,
  estimatedSeconds,
}, null, 2));
console.log('replay: planned=4 uniqueProcessed=3 duplicatesSkipped=1 estimatedSeconds=2');
`,
      ),
    ),

  'programming:中间件源码 · RabbitMQ 路由、确认、死信与流控：流控、预取和消费者容量':
    middlewareLab(
      'RabbitMQ 代码台 04 · Prefetch、未确认上限与追平时间',
      '把 ready 与 unacked 分开建模，按消费者数量、预取窗口和处理速率计算能否追平积压；用暂停、扩消费者和降生产验证恢复。',
      nodeTask(
        'mw-rabbit-prefetch-guided',
        '跟做：消费者注册数不等于吞吐',
        '运行 node main.js。8 个消费者、每个预取 20 条、单消费者每秒处理 10 条，计算未确认上限与每分钟有效吞吐，再判断当前输入 120/s 是否追平。',
        'consumers=8\nprefetch=20\nprocessing-per-second=10\nincoming-per-second=120\nbacklog=18000\n',
        'unackedCap=160、effectiveThroughput=80、incoming=120、netDrain=-40、catchUp=false。ready 下降但 unacked 满载时仍不能算积压已恢复。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const consumers = Number(config.consumers);
const prefetch = Number(config.prefetch);
const perConsumer = Number(config['processing-per-second']);
const incoming = Number(config['incoming-per-second']);
const backlog = Number(config.backlog);
const unackedCap = consumers * prefetch;
const effectiveThroughput = consumers * perConsumer;
const netDrain = effectiveThroughput - incoming;
const catchUp = netDrain > 0;
const firstMinuteReady = backlog - netDrain * 60;

assert.equal(unackedCap, 160);
assert.equal(effectiveThroughput, 80);
assert.equal(netDrain, -40);
assert.equal(catchUp, false);
assert.ok(firstMinuteReady > backlog);

console.log(JSON.stringify({
  unackedCap,
  effectiveThroughput,
  incoming,
  netDrain,
  catchUp,
  firstMinuteReady,
}, null, 2));
console.log('capacity: unackedCap=160 effectiveThroughput=80 netDrain=-40 catchUp=false');
`,
      ),
      nodeTask(
        'mw-rabbit-capacity-recovery-independent',
        '独立实践：先暂停生产，再扩消费者并限速重放',
        '运行 node main.js。当前 180000 条积压，生产 420/s、8 个消费者共 720/s；计算追平时间。再暂停死信重放并扩到 12 个消费者，验证新净吞吐。',
        'backlog=180000\nincoming=420\nconsumers=8\nper-consumer=90\nexpanded-consumers=12\nreplay-rate=20\nmax-replay-rate=20\n',
        'beforeNetRate=300、initialCatchUpSeconds=600；expandedCapacity=1080、afterNetRate=640、afterCatchUpSeconds=282。重放速率不得超过 20/s，暂停和扩容后的速率差必须为正。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const backlog = Number(config.backlog);
const incoming = Number(config.incoming);
const consumers = Number(config.consumers);
const perConsumer = Number(config['per-consumer']);
const expandedConsumers = Number(config['expanded-consumers']);
const replayRate = Number(config['replay-rate']);
const maxReplayRate = Number(config['max-replay-rate']);

const initialCapacity = consumers * perConsumer;
const initialNetRate = initialCapacity - incoming;
const initialCatchUpSeconds = initialNetRate > 0 ? Math.ceil(backlog / initialNetRate) : null;
const expandedCapacity = expandedConsumers * perConsumer;
const afterNetRate = expandedCapacity - incoming - replayRate;
const afterCatchUpSeconds = Math.ceil(backlog / afterNetRate);

assert.equal(initialCapacity, 720);
assert.equal(initialNetRate, 300);
assert.equal(initialCatchUpSeconds, 600);
assert.equal(expandedCapacity, 1080);
assert.equal(afterNetRate, 640);
assert.equal(afterCatchUpSeconds, 282);
assert.ok(replayRate <= maxReplayRate);

console.log(JSON.stringify({
  initialCapacity,
  initialNetRate,
  initialCatchUpSeconds,
  expandedCapacity,
  afterNetRate,
  afterCatchUpSeconds,
  replayWithinLimit: replayRate <= maxReplayRate,
}, null, 2));
console.log('recovery: initialCatchUpSeconds=600 afterNetRate=640 afterCatchUpSeconds=282');
`,
      ),
    ),

  'programming:中间件源码 · Nginx、Gateway 与负载均衡：event cycle、worker 和连接状态':
    middlewareLab(
      'Nginx 代码台 01 · 非阻塞事件循环与连接生命周期',
      '把慢上游拆成事件循环切片并测量定时器漂移，再模拟 worker 的连接上限、keepalive、排队与 idle timeout。',
      nodeTask(
        'mw-nginx-event-cycle-guided',
        '跟做：慢 I/O 不应独占事件循环',
        '运行 node main.js。一个 180ms 的慢上游被切成 18 个非阻塞切片，20ms 与 60ms 定时器必须在期间准时触发，而不是等上游全部结束。',
        'slow-upstream-ms=180\nevent-loop-slice-ms=10\ntimers=20,60\n',
        'slices=18、maxTimerDrift=0、loopCompletedAt=180。若把慢 I/O 当同步 sleep，两个定时器都会推迟到 180ms。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const slowMs = Number(config['slow-upstream-ms']);
const sliceMs = Number(config['event-loop-slice-ms']);
const timers = config.timers.split(',').map(Number);
const slices = slowMs / sliceMs;
const firedAt = new Map();

for (let elapsed = 0; elapsed <= slowMs; elapsed += sliceMs) {
  for (const timer of timers) {
    if (timer <= elapsed && !firedAt.has(timer)) {
      firedAt.set(timer, elapsed);
    }
  }
}

const timerRecords = timers.map((timer) => ({
  timer,
  firedAt: firedAt.get(timer),
  drift: firedAt.get(timer) - timer,
}));
const maxTimerDrift = Math.max(...timerRecords.map((record) => record.drift));

assert.equal(slices, 18);
assert.equal(maxTimerDrift, 0);
assert.equal(slowMs, 180);
assert.deepEqual([...firedAt.keys()], [20, 60]);

console.log(JSON.stringify({
  slices,
  timerRecords,
  maxTimerDrift,
  loopCompletedAt: slowMs,
}, null, 2));
console.log('event-cycle: slices=18 maxTimerDrift=0 loopCompletedAt=180');
`,
      ),
      nodeTask(
        'mw-nginx-connection-state-independent',
        '独立实践：连接上限、keepalive 与空闲回收',
        '运行 node main.js。两个 worker 共允许 100 个连接，120 个连接进入排队；keepalive 连接在 30ms 释放一半，空闲连接在 65ms 超时关闭。',
        'workers=2\nmax-connections-per-worker=50\nconnections=120\nrelease-at-ms=30\nrelease-count=30\nidle-timeout-ms=65\n',
        'maxAccepted=100、peakQueued=20、acceptedAfterRelease=120、idleClosed=90。排队连接不能在达到上限前被虚假标记为已服务。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const workers = Number(config.workers);
const perWorker = Number(config['max-connections-per-worker']);
const totalConnections = Number(config.connections);
const releaseCount = Number(config['release-count']);
const capacity = workers * perWorker;
let active = Math.min(capacity, totalConnections);
let queued = Math.max(0, totalConnections - capacity);
const peakQueued = queued;
const maxAccepted = active;

active -= releaseCount;
assert.ok(active >= 0);
const admitted = Math.min(queued, active === 0 ? capacity : releaseCount);
active += admitted;
queued -= admitted;
const acceptedAfterRelease = maxAccepted + admitted;

assert.equal(capacity, 100);
assert.equal(maxAccepted, 100);
assert.equal(peakQueued, 20);
assert.equal(acceptedAfterRelease, totalConnections);
assert.equal(active, 90);
assert.equal(queued, 0);

console.log(JSON.stringify({
  workerCapacity: capacity,
  maxAccepted,
  peakQueued,
  acceptedAfterRelease,
  idleClosed: active,
  queued,
}, null, 2));
console.log('connections: maxAccepted=100 peakQueued=20 acceptedAfterRelease=120 idleClosed=90');
`,
      ),
    ),

  'programming:中间件源码 · Nginx、Gateway 与负载均衡：upstream、健康检查与负载策略':
    middlewareLab(
      'Nginx 代码台 02 · 加权轮转、健康摘除与重试预算',
      '按 weight 做确定性轮转，注入主动健康检查失败和连接超时；比较摘除故障节点前后流量，并把重试限制在幂等请求和固定预算内。',
      nodeTask(
        'mw-nginx-upstream-guided',
        '跟做：故障节点先摘除，再重算权重',
        '运行 node main.js。a、b、c 权重为 3:1:1，先生成十个分配；b 健康检查连续失败后摘除，再生成十个分配。',
        'a=3\nb=1\nc=1\nrequests=10\nb-failures=3\nhealth-threshold=3\n',
        'healthyDistribution 中 a=6,b=2,c=2；afterFailure 中 b=0、a=8,c=2。已摘除节点不能再接新请求。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const requests = Number(config.requests);
const threshold = Number(config['health-threshold']);
const failures = Number(config['b-failures']);
const originalUpstreams = ['a', 'b', 'c'].map((name) => ({
  name,
  weight: Number(config[name]),
  healthy: true,
}));

function weightedRoundRobin(upstreams, count) {
  const active = upstreams.filter((upstream) => upstream.healthy);
  const expanded = active.flatMap((upstream) => Array(upstream.weight).fill(upstream.name));
  return Array.from({ length: count }, (_, index) => expanded[index % expanded.length]);
}

const healthyDistribution = weightedRoundRobin(originalUpstreams, requests);
const afterFailureUpstreams = originalUpstreams.map((upstream) => ({
  ...upstream,
  healthy: upstream.name !== 'b' || failures < threshold,
}));
const afterFailure = weightedRoundRobin(afterFailureUpstreams, requests);

function countNames(entries) {
  return Object.fromEntries(['a', 'b', 'c'].map((name) => [
    name,
    entries.filter((entry) => entry === name).length,
  ]));
}

assert.deepEqual(countNames(healthyDistribution), { a: 6, b: 2, c: 2 });
assert.deepEqual(countNames(afterFailure), { a: 8, b: 0, c: 2 });
assert.equal(failures, threshold);

console.log(JSON.stringify({
  healthyDistribution: countNames(healthyDistribution),
  afterFailure: countNames(afterFailure),
  healthState: Object.fromEntries(afterFailureUpstreams.map((upstream) => [upstream.name, upstream.healthy])),
}, null, 2));
console.log('upstream: healthy=a:6,b:2,c:2 afterFailure=a:8,b:0,c:2');
`,
      ),
      nodeTask(
        'mw-nginx-upstream-retry-independent',
        '独立实践：超时、重试预算与幂等边界',
        '运行 node main.js。首个上游连接超时，a 在重试预算内切到 b；非幂等 POST 不能自动重放，超过预算的请求返回 502 并保留 request-id。',
        'upstream-a=timeout\nupstream-b=ok\nretry-budget=1\nrequest-method=POST\nrequest-id=req-42\nidempotent=false\ntimeout-ms=30\n',
        '幂等请求反事实路径会重试 1 次并成功；当前 POST 因 idempotent=false 不重放，最终 status=502、requestId=req-42、upstreamAttempts=1、retryBudgetUsed=0。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const retryBudget = Number(config['retry-budget']);
const idempotent = config.idempotent === 'true';
const attempts = [{ upstream: 'a', result: config['upstream-a'], elapsed: Number(config['timeout-ms']) }];
let retryBudgetUsed = 0;
let status = 504;

if (idempotent && retryBudgetUsed < retryBudget) {
  retryBudgetUsed += 1;
  attempts.push({ upstream: 'b', result: config['upstream-b'], elapsed: 12 });
  status = attempts.at(-1).result === 'ok' ? 200 : 502;
} else {
  status = 502;
}

const requestId = config['request-id'];
const idempotentPath = [
  { upstream: 'a', result: config['upstream-a'], elapsed: Number(config['timeout-ms']) },
  { upstream: 'b', result: config['upstream-b'], elapsed: 12 },
];
assert.equal(config['request-method'], 'POST');
assert.equal(idempotent, false);
assert.equal(attempts.length, 1);
assert.equal(retryBudgetUsed, 0);
assert.equal(status, 502);
assert.equal(requestId, 'req-42');
assert.equal(idempotentPath.length, 2);
assert.equal(idempotentPath.at(-1).result, 'ok');

console.log(JSON.stringify({
  status,
  requestId,
  upstreamAttempts: attempts.length,
  retryBudgetUsed,
  attempts,
  idempotentRetryCount: idempotentPath.length - 1,
  idempotentStatus: 200,
}, null, 2));
console.log('retry: status=502 requestId=req-42 upstreamAttempts=1 retryBudgetUsed=0');
`,
      ),
    ),

  'programming:中间件源码 · Nginx、Gateway 与负载均衡：proxy buffering、超时和流式响应':
    middlewareLab(
      'Nginx 代码台 03 · 缓冲、临时文件与流式断开',
      '模拟 proxy_buffering 对快上游/慢客户端的影响，区分 buffer、temp file 和直接流式转发；再验证 SSE 客户端断开后上游及时取消。',
      nodeTask(
        'mw-nginx-buffering-guided',
        '跟做：上游先完成不代表客户端已经收到',
        '运行 node main.js。上游 1 秒生成 1000 字节，客户端每秒读 100 字节，内存缓冲上限 300 字节；计算内存、临时文件和完成时间。',
        'upstream-bytes=1000\nupstream-duration-ms=1000\nclient-bytes-per-second=100\nmemory-buffer-bytes=300\nproxy-buffering=on\n',
        'memoryBuffered=300、tempFileBytes=700、upstreamCompletedMs=1000、clientCompletedMs=10000。缓冲区满后必须进入临时文件，不能把全部数据留在内存。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const upstreamBytes = Number(config['upstream-bytes']);
const upstreamDuration = Number(config['upstream-duration-ms']);
const clientRate = Number(config['client-bytes-per-second']);
const memoryLimit = Number(config['memory-buffer-bytes']);
const buffering = config['proxy-buffering'] === 'on';
const memoryBuffered = buffering ? Math.min(upstreamBytes, memoryLimit) : 0;
const tempFileBytes = buffering ? Math.max(0, upstreamBytes - memoryLimit) : 0;
const clientCompletedMs = Math.ceil(upstreamBytes / clientRate) * 1000;

assert.equal(memoryBuffered, 300);
assert.equal(tempFileBytes, 700);
assert.equal(upstreamDuration, 1000);
assert.equal(clientCompletedMs, 10000);
assert.ok(clientCompletedMs > upstreamDuration);

console.log(JSON.stringify({
  buffering,
  memoryBuffered,
  tempFileBytes,
  upstreamCompletedMs: upstreamDuration,
  clientCompletedMs,
  memoryLimit,
}, null, 2));
console.log('buffering: memory=300 temp=700 upstream=1000ms client=10000ms');
`,
      ),
      nodeTask(
        'mw-nginx-streaming-disconnect-independent',
        '独立实践：SSE 关闭缓冲并在客户端断开时取消上游',
        '运行 node main.js。SSE 每 50ms 生成 64 字节，客户端在收到 3 个事件后断开；缓冲必须关闭，关闭后不得继续保留或排队全部 20 个事件。',
        'proxy-buffering=off\nchunk-bytes=64\nchunk-count=20\nchunk-interval-ms=50\nclient-disconnect-after-events=3\n',
        'emittedEvents=3、retainedBytes=0、upstreamCancelled=true、generatedAfterDisconnect=0。客户端断开后，关闭缓冲仍需要传播取消，不能继续无限生成。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const buffering = config['proxy-buffering'];
const chunkBytes = Number(config['chunk-bytes']);
const chunkCount = Number(config['chunk-count']);
const interval = Number(config['chunk-interval-ms']);
const disconnectAfter = Number(config['client-disconnect-after-events']);

let emittedEvents = 0;
let generatedAfterDisconnect = 0;
let upstreamCancelled = false;
for (let index = 0; index < chunkCount; index += 1) {
  if (emittedEvents >= disconnectAfter) break;
  emittedEvents += 1;
  if (emittedEvents === disconnectAfter) {
    upstreamCancelled = true;
  }
}

const retainedBytes = buffering === 'off' ? 0 : (chunkCount - disconnectAfter) * chunkBytes;
assert.equal(buffering, 'off');
assert.equal(emittedEvents, 3);
assert.equal(retainedBytes, 0);
assert.equal(upstreamCancelled, true);
assert.equal(generatedAfterDisconnect, 0);
assert.equal(disconnectAfter * interval, 150);

console.log(JSON.stringify({
  buffering,
  emittedEvents,
  retainedBytes,
  upstreamCancelled,
  generatedAfterDisconnect,
  elapsedBeforeDisconnectMs: disconnectAfter * interval,
}, null, 2));
console.log('streaming: emitted=3 retainedBytes=0 upstreamCancelled=true');
`,
      ),
    ),

  'programming:中间件源码 · Nginx、Gateway 与负载均衡：Gateway 路由、过滤器和全局异常':
    middlewareLab(
      'Nginx 代码台 04 · 路由匹配、代理缓存与请求限流',
      '按 host 与最长前缀选择路由，让过滤器统一注入 request-id；再模拟 proxy_cache 命中、TTL 过期和 limit_req 的突发令牌桶。',
      nodeTask(
        'mw-nginx-gateway-routing-guided',
        '跟做：最长前缀和过滤器顺序可观察',
        '运行 node main.js。三个请求分别命中订单路由、用户路由和未知路径；过滤器为前两者加 request-id，未知路径返回统一 JSON 404。',
        'request-1=shop.example/api/orders/42\nrequest-2=shop.example/api/users/7\nrequest-3=shop.example/api/nope\nroute-orders=/api/orders\nroute-users=/api/users\n',
        'matched=2、notFound=1、requestIdsInjected=2；/api/orders/42 不能被更短的 /api 路由抢走，未知路径不能泄漏上游地址。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const requests = lines.filter((line) => line.startsWith('request-')).map((line) => {
  const [, hostPath] = line.split('=');
  return { hostPath, path: '/' + hostPath.split('/').slice(1).join('/') };
});
const config = Object.fromEntries(lines.filter((line) => line.startsWith('route-')).map((line) => line.split('=')));
const routes = [
  { prefix: config['route-orders'], upstream: 'orders-service' },
  { prefix: config['route-users'], upstream: 'users-service' },
].sort((left, right) => right.prefix.length - left.prefix.length);

const results = requests.map((request, index) => {
  const route = routes.find((candidate) => request.path.startsWith(candidate.prefix));
  return route
    ? {
        request: 'request-' + (index + 1),
        upstream: route.upstream,
        status: 200,
        requestId: 'req-' + (index + 1),
      }
    : {
        request: 'request-' + (index + 1),
        status: 404,
        code: 'ROUTE_NOT_FOUND',
      };
});

assert.equal(results.filter((result) => result.status === 200).length, 2);
assert.equal(results.filter((result) => result.status === 404).length, 1);
assert.equal(results.find((result) => result.status === 200).upstream, 'orders-service');
assert.equal(results.at(-1).code, 'ROUTE_NOT_FOUND');

console.log(JSON.stringify({ results }, null, 2));
console.log('gateway-routing: matched=2 notFound=1 requestIdsInjected=2');
`,
      ),
      nodeTask(
        'mw-nginx-cache-ratelimit-independent',
        '独立实践：缓存命中与令牌桶同时生效',
        '运行 node main.js。GET /catalog 在 TTL 内重复两次，只有第一次回源；随后 5 个并发请求使用 2 r/s、burst=1 的令牌桶，超限请求返回 429。',
        'cache-key=GET:/catalog\nttl-ms=60000\nrequests=catalog,catalog,catalog,catalog,catalog\nrate-per-second=2\nburst=1\narrival-ms=0,100,200,300,400\n',
        'upstreamRequests=1、cacheHits=1、rateLimited=3、accepted=2。缓存命中和限流是两个独立阶段，不能让 429 请求污染缓存或回源。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = lines.filter((line) => line.includes('=') && !line.startsWith('requests=') && !line.startsWith('arrival-ms='))
  .reduce((result, line) => {
    const [key, value] = line.split('=');
    result[key] = value;
    return result;
  }, {});
const arrivals = lines.find((line) => line.startsWith('arrival-ms=')).split('=')[1].split(',').map(Number);
const rate = Number(config['rate-per-second']);
const burst = Number(config.burst);
const ttl = Number(config['ttl-ms']);
const tokenCapacity = rate;
let tokens = tokenCapacity;
let lastRefillAt = arrivals[0];
let upstreamRequests = 0;
let cacheHits = 0;
let rateLimited = 0;
let accepted = 0;
let cachedAt = null;

for (const now of arrivals) {
  const refill = Math.floor(((now - lastRefillAt) / 1000) * rate);
  tokens = Math.min(tokenCapacity, tokens + refill);
  if (refill > 0) {
    lastRefillAt += Math.ceil(refill / rate * 1000);
  }
  if (tokens <= 0) {
    rateLimited += 1;
    continue;
  }
  tokens -= 1;
  accepted += 1;
  if (cachedAt === null || now - cachedAt >= ttl) {
    upstreamRequests += 1;
    cachedAt = now;
  } else {
    cacheHits += 1;
  }
}

assert.equal(upstreamRequests, 1);
assert.equal(cacheHits, 1);
assert.equal(rateLimited, 3);
assert.equal(accepted, 2);

console.log(JSON.stringify({
  upstreamRequests,
  cacheHits,
  rateLimited,
  accepted,
  rate,
  burst,
}, null, 2));
console.log('cache-ratelimit: upstreamRequests=1 cacheHits=1 rateLimited=3 accepted=2');
`,
      ),
    ),

  'programming:中间件源码 · Nginx、Gateway 与负载均衡：L4/L7、会话保持和故障域':
    middlewareLab(
      'Nginx 代码台 05 · 会话粘滞、协议层级与故障域',
      '比较 L4 连接旁路和 L7 请求路由，用一致性哈希保持会话，再模拟 AZ 摘流：L7 可重试到另一故障域，已建立 L4 连接不能被透明迁移。',
      nodeTask(
        'mw-nginx-sticky-guided',
        '跟做：同一会话落到同一后端',
        '运行 node main.js。用 cookie 的稳定哈希把 user-42 路由到两个后端。连续三次请求得到同一 upstream，其他用户仍可分散。',
        'cookie=user-42\nupstreams=a,b,c\nrequests=3\n',
        'stickyTarget 必须始终相同，distinctTargets=1，fallbackAttempts=0。这里模拟一致性哈希，不声称启动了真实 Nginx。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const cookie = config.cookie;
const upstreams = config.upstreams.split(',');
const requests = Number(config.requests);
function hash(value) {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
}

const target = upstreams[hash(cookie) % upstreams.length];
const routed = Array.from({ length: requests }, () => target);
const distinctTargets = new Set(routed).size;
const users = ['user-42', 'user-7', 'user-99', 'user-123'].map((user) => ({
  user,
  upstream: upstreams[hash(user) % upstreams.length],
}));

assert.equal(distinctTargets, 1);
assert.equal(target, routed[0]);
assert.ok(new Set(users.map((entry) => entry.upstream)).size > 1);

console.log(JSON.stringify({
  cookie,
  stickyTarget: target,
  distinctTargets,
  fallbackAttempts: 0,
  sampleUsers: users,
}, null, 2));
console.log('sticky: cookie=user-42 distinctTargets=1 fallbackAttempts=0');
`,
      ),
      nodeTask(
        'mw-nginx-fault-domain-independent',
        '独立实践：L7 可重试，L4 已建连接不能瞬间迁移',
        '运行 node main.js。AZ-a 进入 draining，新请求全部去 AZ-b；一个已建立的 L4 连接继续在 AZ-a 上完成到 2 秒，L7 幂等请求则在预算内重试到 AZ-b。',
        'az-a=degraded\naz-b=healthy\nl4-established=az-a\nl4-request-duration-ms=2000\ndrain-at-ms=500\nretry-budget=1\nl7-idempotent=true\n',
        'l4Migration=false、l7RetryTarget=az-b、l7Attempts=2、newRequestsToA=0。切流配置不会把已建立 TCP 连接瞬间搬走。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const drainAt = Number(config['drain-at-ms']);
const l4FinishAt = Number(config['l4-request-duration-ms']);
const retryBudget = Number(config['retry-budget']);
const idempotent = config['l7-idempotent'] === 'true';
const newRequests = [
  { at: drainAt + 1, target: 'az-b' },
  { at: drainAt + 20, target: 'az-b' },
];
const l4 = {
  establishedOn: config['l4-established'],
  migrated: false,
  finishedAt: l4FinishAt,
};
const l7Attempts = idempotent && retryBudget > 0
  ? [{ target: 'az-a', result: 'drained' }, { target: 'az-b', result: 'ok' }]
  : [{ target: 'az-a', result: 'drained' }];

assert.equal(l4.migrated, false);
assert.equal(l4.finishedAt, 2000);
assert.equal(newRequests.filter((request) => request.target === 'az-a').length, 0);
assert.equal(l7Attempts.length, 2);
assert.equal(l7Attempts.at(-1).target, 'az-b');

console.log(JSON.stringify({
  drainAt,
  l4,
  l4Migration: l4.migrated,
  l7Attempts,
  l7RetryTarget: l7Attempts.at(-1).target,
  newRequests,
}, null, 2));
console.log('fault-domain: l4Migration=false l7RetryTarget=az-b l7Attempts=2 newRequestsToA=0');
`,
      ),
    ),

  'programming:中间件源码 · Apollo、HikariCP 与配置发布：Apollo Portal、Config Service 和客户端缓存':
    middlewareLab(
      'Apollo 代码台 01 · 发布通知、长轮询与客户端快照',
      '模拟 Portal 发布 release、Config Service 通知、客户端长轮询拉取和本地缓存；服务暂时不可用时只允许读取最后已验证快照，并显式标记 stale。',
      nodeTask(
        'mw-apollo-release-guided',
        '跟做：发布版本到达客户端后再写入缓存',
        '运行 node main.js。初始版本 1 的 timeout=3000，发布版本 2 后长轮询触发；随后 Config Service 断开，客户端必须继续用版本 2 的最后有效快照。',
        'initial-timeout=3000\nrelease-version=2\nrelease-timeout=1500\nlong-poll-timeout-ms=30000\nservice-outage=yes\n',
        'afterPublish.timeout=1500、cache.version=2、outage.source=cache、outage.stale=true。服务不可用时不能回退到旧版本 1 并假装仍是实时配置。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const initial = { version: 1, timeout: Number(config['initial-timeout']) };
let cache = { ...initial, source: 'config-service', stale: false };
const release = {
  version: Number(config['release-version']),
  timeout: Number(config['release-timeout']),
};
assert.ok(release.version > cache.version);
cache = { ...release, source: 'config-service', stale: false };

let outageSource = cache.source;
let outageStale = cache.stale;
if (config['service-outage'] === 'yes') {
  outageSource = 'cache';
  outageStale = true;
}

assert.equal(cache.timeout, 1500);
assert.equal(cache.version, 2);
assert.equal(outageSource, 'cache');
assert.equal(outageStale, true);

console.log(JSON.stringify({
  afterPublish: { version: cache.version, timeout: cache.timeout },
  cache: { version: cache.version, timeout: cache.timeout, stale: cache.stale },
  outage: { source: outageSource, stale: outageStale },
}, null, 2));
console.log('apollo-cache: version=2 timeout=1500 outageSource=cache stale=true');
`,
      ),
      nodeTask(
        'mw-apollo-cache-validation-independent',
        '独立实践：非法发布不能覆盖最后有效快照',
        '运行 node main.js。版本 4 合法发布并写入本地快照；版本 5 含非法 timeout 被拒绝，Config Service 随后不可用，客户端继续读取版本 4。',
        'current-version=3\ncurrent-timeout=2000\nvalid-release=4:1800\ninvalid-release=5:-1\nvalidation=positive-integer\nservice-outage=yes\n',
        'activeVersion=4、activeTimeout=1800、rejectedVersion=5、cacheFallbackVersion=4、stale=true。非法配置必须阻止发布，而不是交给客户端自行容错。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = {};
for (const line of lines) {
  const [key, ...value] = line.split('=');
  config[key] = value.join('=');
}
const currentVersion = Number(config['current-version']);
const [validVersion, validTimeout] = config['valid-release'].split(':').map(Number);
const [invalidVersion, invalidTimeout] = config['invalid-release'].split(':').map(Number);
assert.ok(validVersion > currentVersion);

let active = { version: validVersion, timeout: validTimeout, source: 'config-service' };
let rejectedVersion = null;
if (!Number.isInteger(invalidTimeout) || invalidTimeout <= 0) {
  rejectedVersion = invalidVersion;
}
const stale = config['service-outage'] === 'yes';

assert.equal(active.version, 4);
assert.equal(active.timeout, 1800);
assert.equal(rejectedVersion, 5);
assert.equal(stale, true);

console.log(JSON.stringify({
  activeVersion: active.version,
  activeTimeout: active.timeout,
  rejectedVersion,
  cacheFallbackVersion: active.version,
  stale,
}, null, 2));
console.log('apollo-validation: activeVersion=4 rejectedVersion=5 cacheFallbackVersion=4 stale=true');
`,
      ),
    ),

  'programming:中间件源码 · Apollo、HikariCP 与配置发布：命名空间、灰度、版本和回滚':
    middlewareLab(
      'Apollo 代码台 02 · 灰度命中、命名空间优先级与回滚',
      '按客户端标签做灰度发布，明确命名空间覆盖顺序与版本单调性；当灰度指标越线或配置校验失败时，自动回滚到稳定版本。',
      nodeTask(
        'mw-apollo-canary-guided',
        '跟做：只让命中标签的客户端看到灰度值',
        '运行 node main.js。稳定版本 8 的 feature.timeout=3000，灰度版本 9 只发给 `beta` 标签；普通客户端仍读取稳定版本。',
        'stable-version=8\nstable-value=3000\ncanary-version=9\ncanary-value=1500\ncanary-label=beta\nclients=beta-1:beta,prod-1:stable,beta-2:beta,prod-2:stable\n',
        'canaryClients=2、stableClients=2、canaryValues=1500、stableValues=3000。版本号必须递增，且没有标签的客户端不能误命中灰度。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = Object.fromEntries(lines.filter((line) => !line.startsWith('clients=')).map((line) => line.split('=')));
const clients = lines.find((line) => line.startsWith('clients=')).split('=')[1].split(',').map((entry) => {
  const [id, label] = entry.split(':');
  return { id, label };
});
const stableVersion = Number(config['stable-version']);
const canaryVersion = Number(config['canary-version']);
const canaryLabel = config['canary-label'];
assert.ok(canaryVersion > stableVersion);

const resolved = clients.map((client) => ({
  ...client,
  version: client.label === canaryLabel ? canaryVersion : stableVersion,
  value: client.label === canaryLabel ? Number(config['canary-value']) : Number(config['stable-value']),
}));
const canary = resolved.filter((client) => client.version === canaryVersion);
const stable = resolved.filter((client) => client.version === stableVersion);

assert.equal(canary.length, 2);
assert.equal(stable.length, 2);
assert.ok(canary.every((client) => client.value === 1500));
assert.ok(stable.every((client) => client.value === 3000));

console.log(JSON.stringify({
  canaryClients: canary.length,
  stableClients: stable.length,
  resolved,
}, null, 2));
console.log('canary: canaryClients=2 stableClients=2 canaryValue=1500 stableValue=3000');
`,
      ),
      nodeTask(
        'mw-apollo-rollback-independent',
        '独立实践：命名空间覆盖后做指标门禁与回滚',
        '运行 node main.js。application 与 feature 命名空间按显式顺序合并，灰度版本 11 的错误率 8% 超过 5% 门禁，必须恢复到版本 10。',
        'namespace-order=application:timeout=3000,feature:timeout=1800\nstable-version=10\nstable-timeout=1800\ncanary-version=11\ncanary-timeout=1200\ncanary-error-rate=0.08\nrollback-threshold=0.05\n',
        'resolvedTimeout=1800、publishVersion=11、rollbackVersion=10、businessImpactStopped=true。回滚后客户端读到稳定值，版本不能倒退到更旧配置。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = {};
for (const line of lines) {
  if (line.startsWith('namespace-order=')) {
    config.namespaces = line.slice('namespace-order='.length).split(',').map((entry) => {
      const [name, value] = entry.split(':');
      return { name, timeout: Number(value.split('=')[1]) };
    });
  } else {
    const [key, value] = line.split('=');
    config[key] = value;
  }
}

const merged = {};
for (const namespace of config.namespaces) {
  merged.timeout = namespace.timeout;
}
const stableVersion = Number(config['stable-version']);
const canaryVersion = Number(config['canary-version']);
const errorRate = Number(config['canary-error-rate']);
const threshold = Number(config['rollback-threshold']);
const shouldRollback = errorRate > threshold;
const activeVersion = shouldRollback ? stableVersion : canaryVersion;
const activeTimeout = shouldRollback
  ? Number(config['stable-timeout'])
  : Number(config['canary-timeout']);

assert.ok(canaryVersion > stableVersion);
assert.equal(merged.timeout, 1800);
assert.equal(shouldRollback, true);
assert.equal(activeVersion, 10);
assert.equal(activeTimeout, 1800);

console.log(JSON.stringify({
  resolvedTimeout: merged.timeout,
  publishVersion: canaryVersion,
  activeVersion,
  activeTimeout,
  rollbackVersion: activeVersion,
  businessImpactStopped: shouldRollback,
}, null, 2));
console.log('rollback: resolvedTimeout=1800 publishVersion=11 activeVersion=10 businessImpactStopped=true');
`,
      ),
    ),

  'programming:中间件源码 · 容量、故障、恢复与中间件运行手册：故障注入、备份恢复和运行手册':
    middlewareLab(
      '中间件代码台 · 联合故障演练与恢复对账',
      '把 Kafka、Redis、RabbitMQ、Nginx、Apollo 的状态合并成一份值班决策，随后按备份清单恢复、重放并做业务唯一键对账，未对平前不得放量。',
      nodeTask(
        'mw-fault-drill-guided',
        '跟做：先控制影响面，再逐项恢复',
        '运行 node main.js。Kafka 单 broker 下线、Redis 内存 91%、Rabbit 积压、Nginx 上游 502、Apollo 非法发布同时出现；先生成隔离、止血、恢复顺序和停止条件。',
        'kafka=broker-down:under-replicated=1\nredis=memory-ratio=0.91\nrabbit=ready=180000\ningress=upstream-502\napollo=invalid-release\n',
        '顺序必须为 apollo、ingress、redis、kafka、rabbit；每项包含止血、恢复条件、证据和停止条件，destructiveActions=0。故障未确认前不能同时执行多项高风险变更。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const status = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => [line.split('=')[0], line.slice(line.indexOf('=') + 1)])
);
const priorities = ['apollo', 'ingress', 'redis', 'kafka', 'rabbit'];
const playbook = {
  apollo: {
    containment: 'stop publish and keep last validated release',
    recovery: 'schema validation passes and active release equals stable version',
    evidence: ['release version', 'validation result', 'client cache version'],
    stop: 'reject new publish if current clients still read stale config',
  },
  ingress: {
    containment: 'drain failing upstream and keep a bounded retry path',
    recovery: '5xx rate below 0.1% for 10 minutes',
    evidence: ['upstream health', '5xx rate', 'request id sample'],
    stop: 'do not retry non-idempotent requests without a business key',
  },
  redis: {
    containment: 'cap write rate and serve bounded stale cache',
    recovery: 'memory below 80% and replica offset caught up',
    evidence: ['memory ratio', 'evictions', 'replica offset'],
    stop: 'stop replay if database miss rate exceeds budget',
  },
  kafka: {
    containment: 'pause optional consumers and protect acknowledged events',
    recovery: 'ISR restored and consumer lag decreasing',
    evidence: ['leader epoch', 'ISR', 'consumer lag'],
    stop: 'do not delete segment files to free disk',
  },
  rabbit: {
    containment: 'pause batch replay and isolate poison messages',
    recovery: 'ready and unacked queues below threshold after reconciliation',
    evidence: ['ready', 'unacked', 'dead-letter depth'],
    stop: 'stop replay if duplicate side effects appear',
  },
};

assert.deepEqual(Object.keys(playbook), priorities);
assert.deepEqual(priorities, ['apollo', 'ingress', 'redis', 'kafka', 'rabbit']);
assert.ok(playbook.kafka.stop.includes('segment'));
assert.ok(playbook.rabbit.stop.includes('duplicate'));
assert.ok(playbook.apollo.recovery.length > 20);
assert.equal(Object.values(playbook).flatMap((entry) => entry.evidence).length, 15);
assert.equal(status.apollo, 'invalid-release');
assert.equal(status['redis'], 'memory-ratio=0.91');

console.log(JSON.stringify({
  order: priorities,
  playbook,
  destructiveActions: 0,
  releaseTrafficOnlyAfter: 'all recovery checks and business reconciliation pass',
}, null, 2));
console.log('fault-drill: order=apollo,ingress,redis,kafka,rabbit destructiveActions=0');
`,
      ),
      nodeTask(
        'mw-fault-recovery-independent',
        '独立实践：备份校验、恢复、重放和对账',
        '运行 node main.js。五类备份都在且校验通过；恢复后 Kafka 少 3 条事件、Rabbit 有 12 条重复、Redis 为冷缓存；只有对账差异清零后才允许全量放量。',
        'backup=kafka,redis,rabbit,apollo,nginx\nchecksums=pass\nexpected-events=30000\nrestored-events=29997\nreplayed-events=3\nrabbit-duplicates=12\nrabbit-deduped=yes\nredis-cache=warm\nreconcile-mismatches=0\ntraffic-percent=25\n',
        'missingBackups=0、restoredEvents=30000、duplicateSideEffects=0、reconcileMismatches=0、trafficGate=open。恢复事件数与重放数必须同时核对，重复消息要按业务键吸收。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => line.split('='))
);
const requiredBackups = ['kafka', 'redis', 'rabbit', 'apollo', 'nginx'];
const presentBackups = config.backup.split(',');
const missingBackups = requiredBackups.filter((name) => !presentBackups.includes(name));
const checksumsPass = config.checksums === 'pass';
const expectedEvents = Number(config['expected-events']);
const restoredEvents = Number(config['restored-events']) + Number(config['replayed-events']);
const replayedRabbitMessages = Number(config['rabbit-duplicates']);
const duplicateSideEffects = config['rabbit-deduped'] === 'yes' ? 0 : replayedRabbitMessages;
const mismatches = Number(config['reconcile-mismatches']);
const trafficPercent = Number(config['traffic-percent']);
const trafficGate = missingBackups.length === 0
  && checksumsPass
  && restoredEvents === expectedEvents
  && duplicateSideEffects === 0
  && mismatches === 0
  ? 'open'
  : 'closed';

assert.equal(missingBackups.length, 0);
assert.equal(checksumsPass, true);
assert.equal(restoredEvents, 30000);
assert.equal(duplicateSideEffects, 0);
assert.equal(mismatches, 0);
assert.equal(trafficGate, 'open');
assert.ok(trafficPercent > 0 && trafficPercent < 100);

console.log(JSON.stringify({
  missingBackups: missingBackups.length,
  restoredEvents,
  duplicateSideEffects,
  replayedRabbitMessages,
  reconcileMismatches: mismatches,
  trafficPercent,
  trafficGate,
  nextAction: 'increase gradually while watching error, latency, lag and reconciliation',
}, null, 2));
console.log('recovery: restoredEvents=30000 duplicateSideEffects=0 mismatches=0 trafficGate=open');
`,
      ),
    ),
};
