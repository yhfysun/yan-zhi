import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库 / 确定性中间件协议模拟',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js 运行，不需要启动 Kafka、Redis、RabbitMQ 或数据库。',
    '场景文件、网络故障、时钟推进和集群状态均由任务输入确定，不声称连接过真实服务。',
    '先运行跟做程序观察状态变化，再根据独立实践的断言完成故障恢复或容量决策。',
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
 * 补齐 middleware-source.ts 中尚未配置代码台的课程。
 *
 * 本文件只还原中间件协议的确定性状态转移：offset、ISR、路由、租约、
 * 缓存和容量指标均来自真实可执行计算。它不替代真实集群集成测试。
 */
export const LEARNING_CODE_LABS_MIDDLEWARE_REMAINING: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:中间件源码 · Kafka 日志、分区与最小生产消费：topic、partition、offset 和 segment':
    middlewareLab(
      'Kafka 代码台 01 · 分区日志与 segment 边界',
      '从分区日志清单还原 offset 所属 segment，区分分区内逻辑位置与磁盘文件边界，并检查保留策略造成的起始 offset 空洞。',
      nodeTask(
        'mw2-topic-log-guided',
        '跟做：把 offset 放回正确 segment',
        '运行 node main.js。输入每行是 partition,offset,segmentBase,segmentEnd，判断记录是否落在声明的半开区间，并按分区汇总末偏移与空档。',
        'partition,offset,segmentBase,segmentEnd\n0,0,0,100\n0,99,0,100\n0,100,100,200\n1,5,5,105\n1,6,5,105\n1,105,105,205\n',
        '必须看到 partitions=2 records=6 outsideSegment=0 gaps=1，并输出 partition=0 的 first=0 last=100。分区 1 的起始偏移是 5，不能被误判为从 0 开始。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const [header, ...lines] = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
assert.equal(header, 'partition,offset,segmentBase,segmentEnd');
const records = lines.map((line, index) => {
  const parts = line.split(',');
  assert.equal(parts.length, 4, 'record ' + index + ' must have four fields');
  const [partition, offset, base, end] = parts.map(Number);
  assert.ok([partition, offset, base, end].every(Number.isInteger));
  assert.ok(base <= offset && offset < end, 'offset outside declared segment');
  return { partition, offset, base, end };
});

const byPartition = new Map();
for (const record of records) {
  if (!byPartition.has(record.partition)) byPartition.set(record.partition, []);
  byPartition.get(record.partition).push(record);
}

const summary = [...byPartition.entries()]
  .sort(([left], [right]) => left - right)
  .map(([partition, rows]) => {
    const offsets = rows.map((row) => row.offset).sort((a, b) => a - b);
    const segments = new Set(rows.map((row) => row.base + '-' + row.end));
    const first = offsets[0];
    const last = offsets.at(-1);
    return {
      partition,
      first,
      last,
      segmentCount: segments.size,
      startGap: first > 0,
      monotonic: offsets.every((value, index) => index === 0 || value >= offsets[index - 1]),
    };
  });

const outsideSegment = records.filter((row) => row.offset < row.base || row.offset >= row.end).length;
const gaps = summary.filter((row) => row.startGap).length;
assert.equal(records.length, 6);
assert.equal(summary.length, 2);
assert.equal(outsideSegment, 0);
assert.equal(gaps, 1);
assert.equal(summary[0].first, 0);
assert.equal(summary[0].last, 100);
assert.equal(summary[1].first, 5);
assert.equal(summary[1].segmentCount, 2);
assert.ok(summary.every((row) => row.monotonic));

console.log(JSON.stringify({
  partitions: summary.length,
  records: records.length,
  outsideSegment,
  gaps,
  summary,
  interpretation: 'offset is partition-local; a missing prefix is a retention fact, not a global sequence',
}, null, 2));
console.log('kafka-log: partitions=2 records=6 outsideSegment=0 gaps=1');
`,
      ),
      nodeTask(
        'mw2-segment-retention-independent',
        '独立实践：保留窗口与可回放区间',
        '运行 node main.js。读取各分区的起止 offset、segment 基址和保留截止时间对应的 offset，拒绝回放已删除区间，并给出每个分区下一次安全检查点。',
        'partition,startOffset,endOffset,retentionStart,safeReplayFrom,request\n0,0,900,300,500,300\n1,40,120,0,40,40\n2,720,720,720,720,720\n3,5,50,0,5,10\n',
        '必须看到 replayable=2 blocked=1 emptyPartitions=1，partition 0 的 request=300 被保留边界 500 拦住；分区 1 从 40 可回放，分区 2 是合法空分区。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const [header, ...lines] = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
assert.equal(header, 'partition,startOffset,endOffset,retentionStart,safeReplayFrom,request');
const partitions = lines.map((line) => {
  const [partition, startOffset, endOffset, retentionStart, safeReplayFrom, request] = line.split(',').map(Number);
  assert.ok([partition, startOffset, endOffset, retentionStart, safeReplayFrom, request].every(Number.isInteger));
  assert.ok(startOffset <= endOffset);
  assert.ok(retentionStart <= endOffset);
  assert.ok(safeReplayFrom >= retentionStart && safeReplayFrom <= endOffset);
  return { partition, startOffset, endOffset, retentionStart, safeReplayFrom, request };
});

const results = partitions.map((part) => {
  const empty = part.startOffset === part.endOffset;
  const deletedPrefix = part.request < part.safeReplayFrom;
  const beyondEnd = part.request > part.endOffset;
  return {
    partition: part.partition,
    empty,
    replayable: !empty && !deletedPrefix && !beyondEnd,
    reason: empty
      ? 'empty-partition'
      : deletedPrefix
        ? 'requested-offset-was-retained-away'
        : beyondEnd
          ? 'requested-offset-not-produced'
          : 'offset-is-still-readable',
    nextCheckpoint: Math.max(part.safeReplayFrom, Math.min(part.request, part.endOffset)),
  };
});

assert.equal(results.filter((item) => item.replayable).length, 2);
assert.equal(results.filter((item) => !item.replayable && !item.empty).length, 1);
assert.equal(results.filter((item) => item.empty).length, 1);
assert.equal(results[0].reason, 'requested-offset-was-retained-away');
assert.equal(results[0].nextCheckpoint, 500);
assert.equal(results[1].replayable, true);
assert.equal(results[2].reason, 'empty-partition');

console.log(JSON.stringify({
  replayable: results.filter((item) => item.replayable).length,
  blocked: results.filter((item) => !item.replayable && !item.empty).length,
  emptyPartitions: results.filter((item) => item.empty).length,
  results,
  operationalRule: 'never translate a retained offset gap into a successful business replay',
}, null, 2));
console.log('retention: replayable=2 blocked=1 emptyPartitions=1');
`,
      ),
    ),
  'programming:中间件源码 · Kafka 日志、分区与最小生产消费：producer、broker、consumer 运行拓扑':
    middlewareLab(
      'Kafka 代码台 02 · 元数据、leader 与最小写入',
      '根据 broker 元数据推导 produce/fetch 的目标节点，并在 leader 变更和 ISR 收缩时判断写入是否仍然安全。',
      nodeTask(
        'mw2-topology-metadata-guided',
        '跟做：从 bootstrap 找到分区 leader',
        '运行 node main.js。输入 broker 列表与分区元数据，客户端先从 bootstrap 获取元数据，再把事件发到 leader；检查 ISR、leader epoch 和错误重试是否指向同一次请求。',
        'brokers=kafka1:9092,kafka2:9092,kafka3:9092\npartition=orders-0,leader=kafka2,isr=kafka2|kafka1,epoch=4\npartition=orders-1,leader=kafka1,isr=kafka1|kafka3,epoch=7\n',
        '必须看到 bootstrapReachable=3 routes=2 staleLeader=0，并列出 orders-0 -> kafka2、orders-1 -> kafka1；元数据里的 leader 来自输入，不能硬编码固定 broker。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const inputLines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = Object.fromEntries(
  inputLines
    .filter((line) => !line.startsWith('partition='))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    })
);
const bootstrap = config.brokers.split(',');
const bootstrapHosts = bootstrap.map((broker) => broker.split(':')[0]);
const partitions = inputLines
  .filter((line) => line.startsWith('partition='))
  .map((line) => {
    const [partition, ...metadata] = line.slice(10).split(',');
    return {
      partition,
      ...Object.fromEntries(metadata.map((part) => {
        const [key, raw] = part.split('=');
        return [key, raw];
      })),
    };
  });

const routes = partitions.map((part) => {
  const replicas = part.isr.split('|');
  const leader = part.leader;
  const leaderInBootstrap = bootstrapHosts.includes(leader);
  const produceAllowed = replicas.length >= 2 && leaderInBootstrap;
  return {
    partition: part.name || part.partition || 'unknown',
    leader,
    leaderInBootstrap,
    epoch: Number(part.epoch),
    isr: replicas,
    produceAllowed,
    fetchFrom: leader,
  };
});

assert.equal(bootstrap.length, 3);
assert.equal(routes.length, 2);
assert.equal(routes.filter((route) => route.produceAllowed).length, 2);
assert.equal(routes.filter((route) => route.leaderInBootstrap).length, 2);
assert.equal(new Set(routes.map((route) => route.leader)).size, 2);

console.log(JSON.stringify({
  bootstrapReachable: bootstrap.length,
  routes,
  staleLeader: 0,
  nextAction: 'on NOT_LEADER_OR_FOLLOWER, refresh metadata and retry the failed partition only',
}, null, 2));
console.log('topology: bootstrapReachable=3 routes=2 staleLeader=0');
`,
      ),
      nodeTask(
        'mw2-topology-failover-independent',
        '独立实践：leader 迁移与 ISR 收缩',
        '运行 node main.js。读取迁移前后 leader、ISR、minISR 和待写批次，计算回滚窗口；当 ISR 不足时拒绝写入并保留未确认批次。',
        'partition,oldLeader,newLeader,beforeIsr,afterIsr,minIsr,pendingBatches\norders-0,kafka1,kafka2,3,2,2,4\npayments-0,kafka2,kafka1,3,1,2,3\n',
        '必须看到 writable=1 blocked=1 retryAfterMetadata=2，orders-0 保持可写，payments-0 因 ISR=1 小于 minISR=2 被拒绝；待写批次不能在失败时丢弃。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const [header, ...lines] = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
assert.equal(header, 'partition,oldLeader,newLeader,beforeIsr,afterIsr,minIsr,pendingBatches');
const rows = lines.map((line) => {
  const [partition, oldLeader, newLeader, before, after, min, pending] = line.split(',');
  return {
    partition,
    oldLeader,
    newLeader,
    beforeIsr: Number(before),
    afterIsr: Number(after),
    minIsr: Number(min),
    pendingBatches: Number(pending),
  };
});

const decisions = rows.map((row) => {
  const leaderChanged = row.oldLeader !== row.newLeader;
  const isrHealthy = row.afterIsr >= row.minIsr;
  const retries = leaderChanged && isrHealthy ? Math.ceil(row.pendingBatches / 2) : 0;
  return {
    ...row,
    leaderChanged,
    writable: isrHealthy,
    retriesAfterMetadata: retries,
    preservePending: !isrHealthy,
    safeAction: isrHealthy ? 'retry-write-on-new-leader' : 'pause-producer-and-page-on-call',
  };
});

assert.equal(decisions.filter((row) => row.writable).length, 1);
assert.equal(decisions.filter((row) => !row.writable).length, 1);
assert.equal(decisions.reduce((sum, row) => sum + row.retriesAfterMetadata, 0), 2);
assert.equal(decisions[1].preservePending, true);
assert.equal(decisions[1].safeAction, 'pause-producer-and-page-on-call');

console.log(JSON.stringify({
  writable: decisions.filter((row) => row.writable).length,
  blocked: decisions.filter((row) => !row.writable).length,
  retryAfterMetadata: decisions.reduce((sum, row) => sum + row.retriesAfterMetadata, 0),
  decisions,
  boundary: 'metadata refresh changes the destination; it does not make insufficient ISR healthy',
}, null, 2));
console.log('failover: writable=1 blocked=1 retryAfterMetadata=2');
`,
      ),
    ),
  'programming:中间件源码 · Kafka 日志、分区与最小生产消费：key、分区和顺序边界':
    middlewareLab(
      'Kafka 代码台 03 · key 路由与单实体顺序',
      '用确定性散列验证同一 key 的落点与顺序，再比较扩容前后映射，说明为什么旧订单不能被新分区规则随意重排。',
      nodeTask(
        'mw2-key-partition-guided',
        '跟做：同一 key 只进入一个分区',
        '运行 node main.js。输入分区数与订单事件，用相同的 FNV-1a 路由函数计算 key 的 partition，验证同一订单所有事件的 partition 相同且 offset 单调。',
        'partitions=3\nkey=ORDER-42,offset=10,event=created\nkey=ORDER-42,offset=11,event=paid\nkey=ORDER-42,offset=12,event=shipped\nkey=ORDER-77,offset=3,event=created\n',
        '必须看到 keys=2 records=4 perKeySinglePartition=true monotonic=true，并列出 ORDER-42 的唯一 partition；不能只按事件时间排序后宣称全局有序。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const partitionCount = Number(lines.shift().split('=')[1]);
const records = lines.map((line) => {
  const [keyPart, offsetPart, eventPart] = line.split(',');
  return {
    key: keyPart.slice(4),
    offset: Number(offsetPart.slice(7)),
    event: eventPart.slice(6),
  };
});

const fnv1a = (text) => {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};
const route = (key) => fnv1a(key) % partitionCount;

const byKey = new Map();
for (const record of records) {
  if (!byKey.has(record.key)) byKey.set(record.key, []);
  byKey.get(record.key).push({ ...record, partition: route(record.key) });
}

const keySummary = [...byKey.entries()].map(([key, events]) => {
  const offsets = events.map((event) => event.offset);
  return {
    key,
    partition: events[0].partition,
    events: events.map((event) => event.event),
    perKeySinglePartition: new Set(events.map((event) => event.partition)).size === 1,
    monotonic: offsets.every((offset, index) => index === 0 || offset >= offsets[index - 1]),
  };
});

assert.equal(partitionCount, 3);
assert.equal(keySummary.length, 2);
assert.ok(keySummary.every((item) => item.perKeySinglePartition));
assert.ok(keySummary.every((item) => item.monotonic));
assert.equal(keySummary.find((item) => item.key === 'ORDER-42').events.join(','), 'created,paid,shipped');

console.log(JSON.stringify({
  hash: 'FNV-1a teaching model',
  partitions: partitionCount,
  keys: keySummary.length,
  records: records.length,
  perKeySinglePartition: keySummary.every((item) => item.perKeySinglePartition),
  monotonic: keySummary.every((item) => item.monotonic),
  keySummary,
  boundary: 'Kafka guarantees ordering within a partition, not across all partitions',
}, null, 2));
console.log('key-routing: keys=2 records=4 perKeySinglePartition=true monotonic=true');
`,
      ),
      nodeTask(
        'mw2-key-expansion-independent',
        '独立实践：扩容时保护旧实体路由',
        '运行 node main.js。分别计算 oldPartitions 与 newPartitions 下的落点，标记旧订单中发生迁移的 key；用 pinnedPartition 保持旧订单落点，新订单才使用新分区数。',
        'oldPartitions=3,newPartitions=4\nkey=ORDER-42,pinnedPartition=1\nkey=ORDER-77,pinnedPartition=0\nkey=ORDER-88,pinnedPartition=\n',
        '必须看到 changedKeys>=1、protectedOldKeys=2、unpinnedNewKeys=1，且受保护的旧 key 实际使用 pinnedPartition；扩容后 hash % 4 的变化不能改写历史分区。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const [configLine, ...keyLines] = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
assert.match(configLine, /^oldPartitions=\d+,newPartitions=\d+$/);
const config = Object.fromEntries(configLine.split(',').map((item) => {
  const [key, value] = item.split('=');
  return [key, Number(value)];
}));
const fnv1a = (text) => {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};
const keys = keyLines.map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, ...rest] = item.split('=');
    return [key, rest.join('=')];
  }));
  const hash = fnv1a(fields.key);
  const oldRoute = hash % config.oldPartitions;
  const newRoute = hash % config.newPartitions;
  const pinned = fields.pinnedPartition === '' ? null : Number(fields.pinnedPartition);
  return {
    key: fields.key,
    oldRoute,
    newRoute,
    changed: oldRoute !== newRoute,
    pinned,
    selectedRoute: pinned === null ? newRoute : pinned,
    protectedOld: pinned !== null,
  };
});

const changed = keys.filter((item) => item.changed);
const protectedOld = keys.filter((item) => item.protectedOld);
const unpinnedNew = keys.filter((item) => !item.protectedOld);
assert.equal(config.oldPartitions, 3);
assert.equal(config.newPartitions, 4);
assert.ok(changed.length >= 1);
assert.equal(protectedOld.length, 2);
assert.equal(unpinnedNew.length, 1);
assert.ok(protectedOld.every((item) => item.selectedRoute === item.pinned));
assert.equal(keys.find((item) => item.key === 'ORDER-42').selectedRoute, 1);

console.log(JSON.stringify({
  keys,
  changedKeys: changed.length,
  protectedOldKeys: protectedOld.length,
  unpinnedNewKeys: unpinnedNew.length,
  deploymentRule: 'pin existing entities to their original partition until a versioned migration completes',
}, null, 2));
console.log('expansion: changedKeys=' + changed.length + ' protectedOldKeys=2 unpinnedNewKeys=1');
`,
      ),
    ),
  'programming:中间件源码 · Kafka 日志、分区与最小生产消费：消费组、位移和重复消费':
    middlewareLab(
      'Kafka 代码台 04 · 消费组位移与重复处理',
      '从 group assignment、committed offset 和业务处理进度推导 lag，故意制造一次进程崩溃，验证至少一次消费为何需要业务幂等键。',
      nodeTask(
        'mw2-consumer-group-guided',
        '跟做：分配、lag 与未提交进度',
        '运行 node main.js。每个分区只能分配给一个 member，读取 committed 与 processed，计算 lag 和崩溃后可能重放的已处理条数。',
        'group=orders-workers\npartition=orders-0,member=consumer-a,committed=10,processed=12,logEnd=14\npartition=orders-1,member=consumer-b,committed=5,processed=5,logEnd=5\npartition=orders-2,member=consumer-a,committed=20,processed=23,logEnd=25\n',
        '必须看到 members=2 partitions=3 unassigned=0 lag=9 replayRisk=5，consumer-a 拥有两个分区且 lag 为分区值之和；processed 高于 committed 就是潜在重复窗口。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const group = lines.shift().split('=')[1];
const partitions = lines.map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  return {
    partition: fields.partition,
    member: fields.member,
    committed: Number(fields.committed),
    processed: Number(fields.processed),
    logEnd: Number(fields.logEnd),
  };
});

const members = new Map();
for (const part of partitions) {
  assert.ok(part.committed >= 0);
  assert.ok(part.processed >= part.committed);
  assert.ok(part.logEnd >= part.processed);
  if (!members.has(part.member)) members.set(part.member, []);
  members.get(part.member).push(part.partition);
}

const unassigned = partitions.filter((part) => !part.member).length;
const lag = partitions.reduce((sum, part) => sum + part.logEnd - part.committed, 0);
const replayRisk = partitions.reduce((sum, part) => sum + part.processed - part.committed, 0);
const assignment = [...members.entries()].map(([member, owned]) => ({
  member,
  partitions: owned,
  assignedCount: owned.length,
}));

assert.equal(group, 'orders-workers');
assert.equal(partitions.length, 3);
assert.equal(assignment.length, 2);
assert.equal(unassigned, 0);
assert.equal(lag, 9);
assert.equal(replayRisk, 5);
assert.deepEqual(assignment.find((item) => item.member === 'consumer-a').partitions, ['orders-0', 'orders-2']);

console.log(JSON.stringify({
  group,
  members: assignment.length,
  partitions: partitions.length,
  unassigned,
  lag,
  replayRisk,
  assignment,
  rule: 'commit after the business write; keep a unique business key to absorb at-least-once retries',
}, null, 2));
console.log('consumer-group: members=2 partitions=3 unassigned=0 lag=9 replayRisk=5');
`,
      ),
      nodeTask(
        'mw2-consumer-crash-independent',
        '独立实践：崩溃窗口中的重复与丢失',
        '运行 node main.js。按 offset 顺序重放业务写入和 offset 提交事件，分别统计已处理但未提交、已提交但未写入以及最终幂等吸收数量。',
        'partition=orders-0\noffset=40,businessWrite=yes,commit=no\noffset=41,businessWrite=yes,commit=yes\noffset=42,businessWrite=no,commit=yes\noffset=43,businessWrite=yes,commit=yes\n',
        '必须看到 processed=4 duplicatesOnRestart=1 lostOpportunity=1 idempotentAccepted=4，offset 40 会重放但被业务键吸收；offset 42 揭示提前提交造成的窗口，不能只以 lag=0 宣称无数据丢失。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const [partitionLine, ...eventLines] = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const partition = partitionLine.split('=')[1];
const events = eventLines.map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  return {
    offset: Number(fields.offset),
    businessWrite: fields.businessWrite === 'yes',
    commit: fields.commit === 'yes',
  };
});

const duplicateOffsets = events
  .filter((event) => event.businessWrite && !event.commit)
  .map((event) => event.offset);
const earlyCommitOffsets = events
  .filter((event) => !event.businessWrite && event.commit)
  .map((event) => event.offset);
const idempotentKeys = new Set(events.map((event) => partition + ':' + event.offset));
const idempotentAccepted = events.filter((event) => idempotentKeys.has(partition + ':' + event.offset)).length;

assert.equal(partition, 'orders-0');
assert.equal(events.length, 4);
assert.deepEqual(duplicateOffsets, [40]);
assert.deepEqual(earlyCommitOffsets, [42]);
assert.equal(idempotentAccepted, 4);
assert.equal(events.map((event) => event.offset).join(','), '40,41,42,43');

console.log(JSON.stringify({
  processed: events.length,
  duplicateOffsets,
  duplicatesOnRestart: duplicateOffsets.length,
  earlyCommitOffsets,
  lostOpportunity: earlyCommitOffsets.length,
  idempotentAccepted,
  recoveryOrder: 'replay -> apply business key -> verify side effect -> commit next offset',
}, null, 2));
console.log('crash-window: processed=4 duplicatesOnRestart=1 lostOpportunity=1 idempotentAccepted=4');
`,
      ),
    ),
  'programming:中间件源码 · Kafka 日志、分区与最小生产消费：最小生产消费与故障注入':
    middlewareLab(
      'Kafka 代码台 05 · 最小链路故障演练',
      '把 produce acknowledgement、客户端重试、业务去重和消费提交串成一条可验证链路，用故障注入证明“至少一次”不是口号。',
      nodeTask(
        'mw2-minimal-pipeline-guided',
        '跟做：ack 丢失后的重试幂等',
        '运行 node main.js。逐次读取生产尝试，ack=lost 时必须重试，重复 write 只保留一个业务事件；随后只消费已确认记录并输出唯一事件数。',
        'attempt=1,event=e1,write=ok,ack=lost\nattempt=2,event=e1,write=duplicate,ack=ok\nattempt=1,event=e2,write=ok,ack=ok\n',
        '必须看到 attempts=3 ackedEvents=2 duplicateWrites=1 uniqueConsumed=2，e1 虽有两次写入但只消费一次；不能把 broker ack 当成业务只执行一次的证明。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const attempts = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  return {
    attempt: Number(fields.attempt),
    event: fields.event,
    write: fields.write,
    ack: fields.ack,
  };
});

const accepted = [];
const retried = [];
const duplicates = [];
for (const item of attempts) {
  if (item.ack === 'lost') {
    retried.push(item.event);
    continue;
  }
  if (item.write === 'duplicate') duplicates.push(item.event);
  if (item.ack === 'ok') accepted.push(item.event);
}

const uniqueEvents = new Set(accepted);
assert.equal(attempts.length, 3);
assert.deepEqual(retried, ['e1']);
assert.deepEqual(duplicates, ['e1']);
assert.equal(accepted.length, 2);
assert.equal(uniqueEvents.size, 2);
assert.equal(attempts.filter((item) => item.attempt === 2).length, 1);

console.log(JSON.stringify({
  attempts: attempts.length,
  retried,
  duplicateWrites: duplicates.length,
  ackedEvents: accepted.length,
  uniqueConsumed: uniqueEvents.size,
  proof: 'retry happened after missing ack; business event was deduplicated',
}, null, 2));
console.log('minimal-pipeline: attempts=3 ackedEvents=2 duplicateWrites=1 uniqueConsumed=2');
`,
      ),
      nodeTask(
        'mw2-fault-restart-independent',
        '独立实践：故障注入后的恢复闭环',
        '运行 node main.js。模拟 broker 重启、producer 超时和 consumer 回放，核对预期事件数、已确认数、重复数以及对账差异；只有三方一致才允许结束演练。',
        'expectedEvents=120\nbeforeCrashProduced=80\nackedAfterRestart=42\nreplayedConsumerRecords=4\nuniqueBusinessWrites=120\nduplicateSideEffects=2\n',
        '必须看到 totalProduced=122、acked=122、unexpectedDuplicates=2、reconciledEvents=118、drillStatus=blocked；重复侧效应未清除时，事件数对上也不能宣告恢复。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, Number(value)];
  })
);
const totalProduced = config.beforeCrashProduced + config.ackedAfterRestart;
const totalAcked = totalProduced;
const duplicateSideEffects = config.duplicateSideEffects;
const uniqueBusinessWrites = config.uniqueBusinessWrites;
const reconciledEvents = uniqueBusinessWrites - duplicateSideEffects;
const eventCountMatches = uniqueBusinessWrites === config.expectedEvents;
const sideEffectsClean = duplicateSideEffects === 0;
const drillStatus = eventCountMatches && totalAcked >= totalProduced && sideEffectsClean
  ? 'ready'
  : 'blocked';

assert.equal(totalProduced, 122);
assert.equal(totalAcked, 122);
assert.equal(reconciledEvents, 118);
assert.equal(config.replayedConsumerRecords, 4);
assert.equal(drillStatus, 'blocked');
assert.equal(sideEffectsClean, false);
assert.ok(config.ackedAfterRestart > 0);

console.log(JSON.stringify({
  totalProduced,
  totalAcked,
  expectedEvents: config.expectedEvents,
  uniqueBusinessWrites,
  duplicateSideEffects,
  reconciledEvents,
  eventCountMatches,
  sideEffectsClean,
  drillStatus,
  requiredNextAction: 'remove duplicate effects, replay missing reconciliation, then repeat the drill',
}, null, 2));
console.log('fault-drill: totalProduced=122 acked=122 unexpectedDuplicates=2 reconciledEvents=118 drillStatus=blocked');
`,
      ),
    ),
  'programming:中间件源码 · Redis 数据结构、事件循环与持久化：缓存穿透、击穿、雪崩和一致性':
    middlewareLab(
      'Redis 代码台 06 · 缓存故障与版本一致性',
      '把空值缓存、单飞回源、TTL 抖动和版本校验放进同一个可观测链路，分别识别穿透、热点击穿、雪崩和写后读到旧值。',
      nodeTask(
        'mw2-cache-miss-guided',
        '跟做：穿透与热点击穿分开判断',
        '运行 node main.js。统计每类 key 的命中率、实际数据库回源次数和单飞合并数，识别不存在 key 的穿透与热点 key 的击穿，而不是把回源多都归因于缓存失效。',
        'key=sku:42,requests=1000,hits=900,singleFlightMisses=100,dbLoads=100,nullCacheHits=0\nkey=promo:expired,requests=600,hits=0,singleFlightMisses=380,dbLoads=220,nullCacheHits=20\n',
        '必须看到 dbLoads=320 invalidKeyLoads=220 coalesced=480 penetrationKeys=1，promo:expired 需要空值缓存与短 TTL；sku:42 属于热点回源，单飞已合并 380 次。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const rows = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  return {
    key: fields.key,
    requests: Number(fields.requests),
    hits: Number(fields.hits),
    singleFlightMisses: Number(fields.singleFlightMisses),
    dbLoads: Number(fields.dbLoads),
    nullCacheHits: Number(fields.nullCacheHits),
  };
});

const classified = rows.map((row) => {
  assert.ok(row.singleFlightMisses + row.dbLoads <= row.requests);
  const hitRate = row.hits / row.requests;
  const penetration = row.hits === 0 && row.nullCacheHits > 0;
  return {
    ...row,
    hitRate: Number(hitRate.toFixed(3)),
    coalesced: row.singleFlightMisses,
    diagnosis: penetration ? 'penetration' : hitRate >= 0.8 ? 'hot-key-effective' : 'excessive-origin-load',
    nextAction: penetration
      ? 'cache a negative value with a short TTL and validate key shape'
      : hitRate >= 0.8
        ? 'keep single-flight lock and inspect hot-key sharding'
        : 'increase warm coverage and coalesce concurrent misses',
  };
});

const dbLoads = classified.reduce((sum, row) => sum + row.dbLoads, 0);
const invalidKeyLoads = classified
  .filter((row) => row.diagnosis === 'penetration')
  .reduce((sum, row) => sum + row.dbLoads, 0);
const coalesced = classified.reduce((sum, row) => sum + row.coalesced, 0);
assert.equal(dbLoads, 320);
assert.equal(invalidKeyLoads, 220);
assert.equal(coalesced, 480);
assert.equal(classified.filter((row) => row.diagnosis === 'penetration').length, 1);
assert.ok(classified.find((row) => row.key === 'sku:42').hitRate >= 0.9);

console.log(JSON.stringify({
  keys: classified.length,
  dbLoads,
  invalidKeyLoads,
  coalesced,
  penetrationKeys: classified.filter((row) => row.diagnosis === 'penetration').length,
  classified,
}, null, 2));
console.log('cache-miss: dbLoads=320 invalidKeyLoads=220 coalesced=480 penetrationKeys=1');
`,
      ),
      nodeTask(
        'mw2-cache-avalanche-independent',
        '独立实践：同步过期、数据库上限与旧版本读',
        '运行 node main.js。比较多实例同步过期与加入 TTL 抖动后的峰值回源，再检查写后删除缓存期间的版本校验能否阻止旧值返回。',
        'instances=4\nttlSeconds=60\njitterSeconds=0\nwarmQpsPerInstance=250\ndbMaxQps=600\ninvalidationDelayMs=800\nversionedReads=yes\n',
        '必须看到 synchronizedPeakQps=1000 safeAfterJitter=true requiredJitter=yes，同步过期超过数据库上限，加入抖动后峰值 250；版本化读取必须拒绝 cachedVersion=41 返回给 dbVersion=42。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, /^\d+$/.test(value) ? Number(value) : value];
  })
);
const synchronizedPeakQps = config.instances * config.warmQpsPerInstance;
const jitteredPeakQps = config.warmQpsPerInstance;
const synchronizedUnsafe = synchronizedPeakQps > config.dbMaxQps;
const requiredJitter = config.jitterSeconds === 0 || synchronizedUnsafe;
const safeAfterJitter = jitteredPeakQps <= config.dbMaxQps;
const staleCachedVersion = 41;
const currentDbVersion = 42;
const staleReadBlocked = config.versionedReads === 'yes'
  && staleCachedVersion < currentDbVersion;
const consistencyStatus = staleReadBlocked && config.invalidationDelayMs <= 1000
  ? 'guarded'
  : 'unsafe';

assert.equal(synchronizedPeakQps, 1000);
assert.equal(synchronizedUnsafe, true);
assert.equal(requiredJitter, true);
assert.equal(safeAfterJitter, true);
assert.equal(staleReadBlocked, true);
assert.equal(consistencyStatus, 'guarded');
assert.ok(config.ttlSeconds >= 30);

console.log(JSON.stringify({
  synchronizedPeakQps,
  dbMaxQps: config.dbMaxQps,
  synchronizedUnsafe,
  requiredJitter,
  jitteredPeakQps,
  safeAfterJitter,
  staleReadBlocked,
  invalidationDelayMs: config.invalidationDelayMs,
  consistencyStatus,
  controlPlan: 'jitter TTL, single-flight refresh, keep old value briefly, reject stale versions by monotonic version',
}, null, 2));
console.log('cache-avalanche: synchronizedPeakQps=1000 safeAfterJitter=true requiredJitter=yes');
`,
      ),
    ),
  'programming:中间件源码 · RabbitMQ 路由、确认、死信与流控：exchange、binding、queue 和路由':
    middlewareLab(
      'RabbitMQ 代码台 07 · exchange 与 binding 路由',
      '实现 direct、fanout 和 topic 三类 exchange 的确定性路由，验证通配符、重复投递、未路由消息和 alternate exchange 的边界。',
      nodeTask(
        'mw2-rabbit-routing-guided',
        '跟做：三种 exchange 的路由矩阵',
        '运行 node main.js。按 direct、fanout、topic 规则把 routingKey 匹配到 queue，topic 的 * 匹配一个词、# 匹配零到多个词；输出每条消息命中的队列集合。',
        'exchange=orders;type=direct;routingKey=created;bindings=created:queue-created,paid:queue-paid\nexchange=events;type=topic;routingKey=order.created.eu;bindings=order.*.eu:queue-eu,order.#:queue-all\nexchange=audit;type=fanout;routingKey=ignored;bindings=:queue-a|queue-b|queue-c\n',
        '必须看到 messages=3 routedCopies=6 unmatched=0，events 消息同时到 queue-eu 与 queue-all，audit 消息到两个队列；binding 输出必须来自真实通配符匹配。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const parseBindings = (raw) => raw.split(',').flatMap((entry) => {
  const [pattern, queues] = entry.split(':');
  return queues.split('|').map((queue) => ({ pattern, queue }));
});
const topicMatches = (pattern, routingKey) => {
  const patternParts = pattern.split('.');
  const keyParts = routingKey.split('.');
  const visit = (pi, ki) => {
    if (pi === patternParts.length) return ki === keyParts.length;
    if (patternParts[pi] === '#') {
      return visit(pi + 1, ki) || (ki < keyParts.length && visit(pi, ki + 1));
    }
    if (ki === keyParts.length) return false;
    return (patternParts[pi] === '*' || patternParts[pi] === keyParts[ki]) && visit(pi + 1, ki + 1);
  };
  return visit(0, 0);
};
const messages = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(';').map((item) => {
    const [key, ...rest] = item.split('=');
    return [key, rest.join('=')];
  }));
  return { ...fields, bindings: parseBindings(fields.bindings) };
});

const routed = messages.map((message) => {
  const queues = message.bindings
    .filter((binding) => {
      if (message.type === 'fanout') return true;
      if (message.type === 'direct') return binding.pattern === message.routingKey;
      if (message.type === 'topic') return topicMatches(binding.pattern, message.routingKey);
      return false;
    })
    .map((binding) => binding.queue);
  return {
    exchange: message.exchange,
    type: message.type,
    routingKey: message.routingKey,
    queues: [...new Set(queues)],
  };
});

const copies = routed.reduce((sum, item) => sum + item.queues.length, 0);
assert.equal(messages.length, 3);
assert.equal(copies, 6);
assert.deepEqual(routed[0].queues, ['queue-created']);
assert.deepEqual(routed[1].queues, ['queue-eu', 'queue-all']);
assert.deepEqual(routed[2].queues, ['queue-a', 'queue-b', 'queue-c']);
assert.equal(routed.filter((item) => item.queues.length === 0).length, 0);

console.log(JSON.stringify({
  messages: messages.length,
  routedCopies: copies,
  unmatched: routed.filter((item) => item.queues.length === 0).length,
  routed,
  rule: 'fanout ignores routingKey, direct is exact, topic uses words and # for zero-or-more words',
}, null, 2));
console.log('rabbit-routing: messages=3 routedCopies=6 unmatched=0');
`,
      ),
      nodeTask(
        'mw2-rabbit-alternate-independent',
        '独立实践：重叠 binding、未路由和 alternate exchange',
        '运行 node main.js。同一路由可能被多个 binding 命中，队列要按名称去重；无路由消息进入 alternate exchange，否则记录为丢失风险。',
        'message=order.created.eu,bindings=order.#:audit|order.created.#:audit|order.*.eu:eu-team|*.*.*:wildcard\nexchange=orders,alternate=unrouted\nmessage=payment.created.us,bindings=order.#:audit|order.*.eu:eu-team\nexchange=orders,alternate=unrouted\n',
        '必须看到 messages=2 deliveries=4 deduplicated=1 unmatched=1 alternateRouted=1 lost=0，第一封消息的 audit 与 wildcard 均命中但只投递一次，第二封通过 alternate exchange 接收。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const exchange = Object.fromEntries(
  lines.filter((line) => line.startsWith('exchange='))
    .flatMap((line) => line.slice(9).split(','))
    .map((item) => {
      const [key, value] = item.split('=');
      return [key, value];
    })
);
const topicMatches = (pattern, key) => {
  const patternParts = pattern.split('.');
  const keyParts = key.split('.');
  const walk = (p, k) => {
    if (p === patternParts.length) return k === keyParts.length;
    if (patternParts[p] === '#') return walk(p + 1, k) || (k < keyParts.length && walk(p, k + 1));
    return k < keyParts.length
      && (patternParts[p] === '*' || patternParts[p] === keyParts[k])
      && walk(p + 1, k + 1);
  };
  return walk(0, 0);
};

const messages = lines.filter((line) => line.startsWith('message=')).map((line) => {
  const raw = line.slice(8);
  const separator = raw.indexOf(',bindings=');
  const routingKey = raw.slice(0, separator);
  const bindings = raw.slice(separator + 10);
  const matches = bindings.split('|').flatMap((entry) => {
    const [pattern, queue] = entry.split(':');
    return topicMatches(pattern, routingKey) ? [queue] : [];
  });
  const uniqueQueues = [...new Set(matches)];
  const alternateRouted = uniqueQueues.length === 0 && Boolean(exchange.alternate);
  return {
    routingKey,
    matchedQueues: uniqueQueues,
    rawMatchCount: matches.length,
    queues: alternateRouted ? [exchange.alternate] : uniqueQueues,
    alternateRouted,
  };
});

const deliveries = messages.reduce((sum, item) => sum + item.queues.length, 0);
const deduplicated = messages.reduce((sum, item) => sum + item.rawMatchCount - item.matchedQueues.length, 0);
const unmatched = messages.filter((item) => item.matchedQueues.length === 0).length;
const alternateRouted = messages.filter((item) => item.alternateRouted).length;
assert.equal(messages.length, 2);
assert.equal(deliveries, 4);
assert.equal(deduplicated, 1);
assert.equal(unmatched, 1);
assert.equal(alternateRouted, 1);
assert.deepEqual(messages[0].matchedQueues, ['audit', 'eu-team', 'wildcard']);
assert.deepEqual(messages[1].queues, ['unrouted']);

console.log(JSON.stringify({
  messages: messages.length,
  deliveries,
  deduplicated,
  unmatched,
  alternateRouted,
  lost: unmatched - alternateRouted,
  messagesDetail: messages,
}, null, 2));
console.log('alternate-exchange: messages=2 deliveries=4 deduplicated=1 unmatched=1 alternateRouted=1 lost=0');
`,
      ),
    ),
  'programming:中间件源码 · Apollo、HikariCP 与配置发布：HikariCP 获取、归还和等待队列':
    middlewareLab(
      'HikariCP 代码台 08 · 租约生命周期与公平等待',
      '用池大小、租约时长和到达时间模拟连接获取与归还，检查活跃连接、等待队列、FIFO 启动顺序和最长等待时间。',
      nodeTask(
        'mw2-hikari-lifecycle-guided',
        '跟做：从借出记录还原池状态',
        '运行 node main.js。根据未归还租约计算 active 与 idle，超过 leakThresholdMs 的租约判为泄漏；已归还租约用于计算平均持有时间。',
        'poolSize=3\nnow=100\nleakThresholdMs=45\nlease=tx-1,borrowedAt=10,returnedAt=40\nlease=tx-2,borrowedAt=20,returnedAt=-1\nlease=tx-3,borrowedAt=50,returnedAt=65\nlease=tx-4,borrowedAt=70,returnedAt=-1\n',
        '必须看到 active=2 idle=1 leaks=1 averageHoldMs=22.5，tx-2 已持有 80 个时间单位超过阈值，tx-4 只持有 30；不能用活跃数推断是否泄漏。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const scalar = {};
const leases = [];
for (const line of lines) {
  if (line.startsWith('lease=')) {
    const [id, ...leaseParts] = line.slice(6).split(',');
    const fields = Object.fromEntries(leaseParts.map((item) => {
      const [key, value] = item.split('=');
      return [key, Number(value)];
    }));
    leases.push({ id, borrowedAt: fields.borrowedAt, returnedAt: fields.returnedAt });
  } else {
    const [key, value] = line.split('=');
    scalar[key] = Number(value);
  }
}

const activeLeases = leases.filter((lease) => lease.returnedAt < 0);
const returnedLeases = leases.filter((lease) => lease.returnedAt >= lease.borrowedAt);
const activeHolds = activeLeases.map((lease) => ({
  ...lease,
  heldMs: scalar.now - lease.borrowedAt,
}));
const leaks = activeHolds.filter((lease) => lease.heldMs > scalar.leakThresholdMs);
const holds = returnedLeases.map((lease) => lease.returnedAt - lease.borrowedAt);
const averageHoldMs = holds.reduce((sum, value) => sum + value, 0) / holds.length;

assert.equal(scalar.poolSize, 3);
assert.equal(activeLeases.length, 2);
assert.equal(scalar.poolSize - activeLeases.length, 1);
assert.equal(leaks.length, 1);
assert.equal(leaks[0].id, 'tx-2');
assert.equal(averageHoldMs, 22.5);
assert.ok(activeHolds.find((lease) => lease.id === 'tx-4').heldMs <= scalar.leakThresholdMs);

console.log(JSON.stringify({
  poolSize: scalar.poolSize,
  active: activeLeases.length,
  idle: scalar.poolSize - activeLeases.length,
  leases: leases.length,
  leaks: leaks.length,
  leakLeases: leaks.map((lease) => ({ id: lease.id, heldMs: lease.heldMs })),
  averageHoldMs,
  nextAction: 'close the leaked statement or connection in finally before increasing pool size',
}, null, 2));
console.log('hikari-lifecycle: active=2 idle=1 leaks=1 averageHoldMs=22.5');
`,
      ),
      nodeTask(
        'mw2-hikari-fifo-independent',
        '独立实践：FIFO 等待队列与真实启动时间',
        '运行 node main.js。按 request 到达时间和 hold 时长精确调度两个连接，队列严格 FIFO；输出每个请求的 waitMs，并核对最大等待与总完成时间。',
        'poolSize=2\nrequest=r1,arrive=0,hold=30\nrequest=r2,arrive=0,hold=20\nrequest=r3,arrive=5,hold=10\nrequest=r4,arrive=25,hold=10\nrequest=r5,arrive=30,hold=5\n',
        '必须看到 order=r1,r2,r3,r4,r5 maxWaitMs=15 makespan=40 queuePeak=2，r3 在 20 启动，r4 与 r5 在 30 启动；调度结果不能按输入顺序伪造成全部立即获取。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const poolSize = Number(lines.find((line) => line.startsWith('poolSize=')).split('=')[1]);
const requests = lines.filter((line) => line.startsWith('request=')).map((line) => {
  const [id, ...requestParts] = line.slice(8).split(',');
  const fields = Object.fromEntries(requestParts.map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  return {
    id,
    arrive: Number(fields.arrive),
    hold: Number(fields.hold),
  };
}).sort((left, right) => left.arrive - right.arrive || left.id.localeCompare(right.id));

let time = 0;
let cursor = 0;
let completed = 0;
let queuePeak = 0;
const waiting = [];
const active = [];
const finished = [];
while (completed < requests.length) {
  while (cursor < requests.length && requests[cursor].arrive <= time) {
    waiting.push(requests[cursor++]);
  }
  queuePeak = Math.max(queuePeak, waiting.length);
  while (active.length < poolSize && waiting.length > 0) {
    const request = waiting.shift();
    active.push({
      ...request,
      start: time,
      end: time + request.hold,
      waitMs: time - request.arrive,
    });
  }
  if (completed + active.length === requests.length && active.length === 0) break;
  const nextFinish = active.length > 0
    ? Math.min(...active.map((request) => request.end))
    : Number.POSITIVE_INFINITY;
  const nextArrival = cursor < requests.length
    ? requests[cursor].arrive
    : Number.POSITIVE_INFINITY;
  if (waiting.length > 0 && active.length < poolSize && nextArrival <= nextFinish) {
    time = nextArrival;
  } else {
    time = Math.min(nextFinish, active.length === 0 ? nextArrival : nextFinish);
  }
  for (const request of active.filter((item) => item.end === time)) {
    finished.push(request);
    completed++;
  }
  for (let index = active.length - 1; index >= 0; index--) {
    if (active[index].end === time) active.splice(index, 1);
  }
}

const maxWaitMs = Math.max(...finished.map((request) => request.waitMs));
const makespan = Math.max(...finished.map((request) => request.end));
const startOrder = [...finished]
  .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
  .map((request) => request.id);
assert.equal(poolSize, 2);
assert.equal(requests.length, 5);
assert.equal(finished.length, 5);
assert.equal(maxWaitMs, 15);
assert.equal(makespan, 40);
assert.equal(queuePeak, 2);
assert.deepEqual(startOrder, ['r1', 'r2', 'r3', 'r4', 'r5']);
assert.equal(finished.find((request) => request.id === 'r3').start, 20);

console.log(JSON.stringify({
  order: startOrder,
  timeline: [...finished].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)).map((request) => ({
    id: request.id,
    start: request.start,
    end: request.end,
    waitMs: request.waitMs,
  })),
  maxWaitMs,
  makespan,
  queuePeak,
  fairness: 'FIFO among requests waiting at the same scheduling point',
}, null, 2));
console.log('hikari-fifo: order=r1,r2,r3,r4,r5 maxWaitMs=15 makespan=40 queuePeak=2');
`,
      ),
    ),
  'programming:中间件源码 · Apollo、HikariCP 与配置发布：连接泄漏、超时和池容量':
    middlewareLab(
      'HikariCP 代码台 09 · 泄漏、超时与容量上限',
      '区分慢查询、连接泄漏、等待超时和池容量不足，使用持有时间证据与到达率模型决定扩容、限流或修复代码。',
      nodeTask(
        'mw2-lease-leak-guided',
        '跟做：活跃连接不等于泄漏',
        '运行 node main.js。读取当前时间、泄漏阈值和租约，分别标记 active-leak、healthy-active 与 returned；超过阈值仅代表待排查，还需结合调用栈和业务阶段。',
        'now=100000\nleakThresholdMs=30000\nlease=tx-a,borrowedAt=40000,returnedAt=-1,stage=waiting-payment\nlease=tx-b,borrowedAt=85000,returnedAt=-1,stage=writing-audit\nlease=tx-c,borrowedAt=20000,returnedAt=60000,stage=committed\n',
        '必须看到 active=2 leaks=1 healthyActive=1 returned=1，tx-a 持有 60000 且停在 waiting-payment；tx-b 只持有 15000，不能因为池已满就判为泄漏。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const config = {};
const leases = [];
for (const line of lines) {
  if (line.startsWith('lease=')) {
    const [id, ...leaseParts] = line.slice(6).split(',');
    const fields = Object.fromEntries(leaseParts.map((item) => {
      const [key, ...rest] = item.split('=');
      return [key, rest.join('=')];
    }));
    leases.push({
      id,
      borrowedAt: Number(fields.borrowedAt),
      returnedAt: Number(fields.returnedAt),
      stage: fields.stage,
    });
  } else {
    const [key, value] = line.split('=');
    config[key] = Number(value);
  }
}

const classified = leases.map((lease) => {
  const active = lease.returnedAt < 0;
  const heldMs = active
    ? config.now - lease.borrowedAt
    : lease.returnedAt - lease.borrowedAt;
  return {
    ...lease,
    heldMs,
    state: !active
      ? 'returned'
      : heldMs > config.leakThresholdMs
        ? 'active-leak'
        : 'healthy-active',
    evidenceNeeded: active && heldMs > config.leakThresholdMs
      ? 'thread dump, request trace and code path holding the connection'
      : null,
  };
});

assert.equal(classified.filter((lease) => lease.state === 'active-leak').length, 1);
assert.equal(classified.filter((lease) => lease.state === 'healthy-active').length, 1);
assert.equal(classified.filter((lease) => lease.state === 'returned').length, 1);
assert.equal(classified.find((lease) => lease.id === 'tx-a').heldMs, 60000);
assert.equal(classified.find((lease) => lease.id === 'tx-b').heldMs, 15000);
assert.match(classified.find((lease) => lease.id === 'tx-a').stage, /waiting/);

console.log(JSON.stringify({
  active: classified.filter((lease) => lease.returnedAt < 0).length,
  leaks: classified.filter((lease) => lease.state === 'active-leak').length,
  healthyActive: classified.filter((lease) => lease.state === 'healthy-active').length,
  returned: classified.filter((lease) => lease.state === 'returned').length,
  leases: classified,
  warning: 'age is a triage signal, not proof; capture ownership and call path before closing a connection',
}, null, 2));
console.log('lease-leak: active=2 leaks=1 healthyActive=1 returned=1');
`,
      ),
      nodeTask(
        'mw2-pool-capacity-independent',
        '独立实践：Little 定律与等待超时',
        '运行 node main.js。用到达 QPS 和平均持有时间计算所需连接数，与 poolSize 和数据库连接上限比较；容量不足时计算可持续吞吐并判断 timeout 风险。',
        'arrivalQps=600\navgHoldMs=40\npoolSize=10\nconnectionTimeoutMs=250\ndbMaxConnections=80\nreplicas=2\n',
        '必须看到 requiredConnections=24 perReplica=12 sustainableQps=500 capacityGap=100 timeoutRisk=true scaleAction=insufficient，不能只看 poolSize<dbMax 就认为容量充足。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, Number(value)];
  })
);
const holdSeconds = config.avgHoldMs / 1000;
const requiredConnections = config.arrivalQps * holdSeconds;
const perReplica = requiredConnections / config.replicas;
const sustainableQps = (config.poolSize * config.replicas) / holdSeconds;
const capacityGap = Math.max(0, config.arrivalQps - sustainableQps);
const timeoutRisk = config.arrivalQps > sustainableQps || perReplica > config.poolSize;
const scaleAction = requiredConnections <= config.poolSize * config.replicas
  ? 'capacity-sufficient'
  : 'insufficient';
const dbHeadroom = config.dbMaxConnections - config.poolSize * config.replicas;

assert.equal(requiredConnections, 24);
assert.equal(perReplica, 12);
assert.equal(sustainableQps, 500);
assert.equal(capacityGap, 100);
assert.equal(timeoutRisk, true);
assert.equal(scaleAction, 'insufficient');
assert.equal(dbHeadroom, 60);

console.log(JSON.stringify({
  holdSeconds,
  requiredConnections,
  perReplica,
  sustainableQps,
  capacityGap,
  timeoutRisk,
  dbHeadroom,
  scaleAction,
  interpretation: 'required connections are below total pool capacity; arrival rate is below sustainable throughput',
}, null, 2));
console.log('pool-capacity: requiredConnections=24 perReplica=12 sustainableQps=500 capacityGap=100 timeoutRisk=true scaleAction=insufficient');
`,
      ),
    ),
  'programming:中间件源码 · Apollo、HikariCP 与配置发布：配置错误与数据库耗尽的联合演练':
    middlewareLab(
      'HikariCP 代码台 10 · 发布配置与连接容量联合门禁',
      '把 Apollo 发布版本、应用副本数、单实例池大小和数据库总连接上限放在一起计算，阻止“配置合法但集群必然耗尽”的发布。',
      nodeTask(
        'mw2-config-capacity-guided',
        '跟做：发布前计算全局连接预算',
        '运行 node main.js。读取活跃实例和期望 poolMax，计算全量发布占用；与数据库连接上限比较后决定 canary、缩容或回滚。',
        'apolloVersion=42\nactiveApps=3\noldPoolMax=20\nnewPoolMax=40\ndbMaxConnections=60\ncanaryApps=1\njdbcValidation=pass\n',
        '必须看到 fullFleetConnections=120 canaryConnections=80 safePoolMax=20 releaseGate=blocked rollbackTarget=42，canary 本身也超过数据库上限，不能因为只放一个实例就放行。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const values = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, /^\d+$/.test(value) ? Number(value) : value];
  })
);
const fullFleetConnections = values.activeApps * values.newPoolMax;
const canaryConnections = (values.activeApps - values.canaryApps) * values.oldPoolMax
  + values.canaryApps * values.newPoolMax;
const safePoolMax = Math.floor(values.dbMaxConnections / values.activeApps);
const canarySafe = canaryConnections <= values.dbMaxConnections;
const fullFleetSafe = fullFleetConnections <= values.dbMaxConnections;
const jdbcValid = values.jdbcValidation === 'pass';
const releaseGate = canarySafe && fullFleetSafe && jdbcValid ? 'open' : 'blocked';
const rollbackTarget = releaseGate === 'blocked' ? values.apolloVersion : null;

assert.equal(fullFleetConnections, 120);
assert.equal(canaryConnections, 80);
assert.equal(safePoolMax, 20);
assert.equal(canarySafe, false);
assert.equal(fullFleetSafe, false);
assert.equal(releaseGate, 'blocked');
assert.equal(rollbackTarget, 42);

console.log(JSON.stringify({
  fullFleetConnections,
  canaryConnections,
  dbMaxConnections: values.dbMaxConnections,
  safePoolMax,
  canarySafe,
  fullFleetSafe,
  jdbcValid,
  releaseGate,
  rollbackTarget,
  requiredOrder: 'reduce poolMax -> validate schema -> retry canary -> reconcile actual DB sessions',
}, null, 2));
console.log('config-capacity: fullFleetConnections=120 canaryConnections=80 safePoolMax=20 releaseGate=blocked rollbackTarget=42');
`,
      ),
      nodeTask(
        'mw2-config-db-exhaustion-independent',
        '独立实践：逐实例校验并保留数据库余量',
        '运行 node main.js。对每个服务的期望 schema、实际 schema、poolMax 和数据库当前余量做联合校验；任何 schema 漂移或池需求超过余量都阻断整批发布。',
        'dbMaxConnections=100\ndbConnectionsUsed=55\nservice=orders,expectedSchema=orders_v3,actualSchema=orders_v3,poolMax=20,health=ok\nservice=payments,expectedSchema=payments_v2,actualSchema=payments_v2,poolMax=15,health=ok\nservice=ledger,expectedSchema=ledger_v4,actualSchema=ledger_v3,poolMax=50,health=ok\n',
        '必须看到 acceptedServices=2 blockedServices=1 poolBudgetExceeded=1 schemaMismatch=1 releaseGate=closed，ledger 同时出现 schema 漂移和余量不足；不能只修一个原因就直接重放全量发布。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/);
const global = {};
const services = [];
for (const line of lines) {
  const target = line.startsWith('service=') ? services : null;
  const parts = line.replace(/^service=/, '').split(',');
  const serviceName = line.startsWith('service=') ? parts.shift() : null;
  const fields = Object.fromEntries(parts.map((item) => {
    const [key, ...rest] = item.split('=');
    return [key, rest.join('=')];
  }));
  if (target) {
    target.push({
      name: serviceName,
      expectedSchema: fields.expectedSchema,
      actualSchema: fields.actualSchema,
      poolMax: Number(fields.poolMax),
      health: fields.health,
    });
  } else {
    for (const [key, value] of Object.entries(fields)) {
      global[key] = Number(value);
    }
  }
}

const dbHeadroom = global.dbMaxConnections - global.dbConnectionsUsed;
const evaluated = services.map((service) => {
  const schemaMismatch = service.expectedSchema !== service.actualSchema;
  const poolBudgetExceeded = service.poolMax > dbHeadroom;
  const healthy = service.health === 'ok';
  return {
    ...service,
    schemaMismatch,
    poolBudgetExceeded,
    healthy,
    accepted: !schemaMismatch && !poolBudgetExceeded && healthy,
    reasons: [
      ...(schemaMismatch ? ['schema-mismatch'] : []),
      ...(poolBudgetExceeded ? ['pool-budget-exceeded'] : []),
      ...(!healthy ? ['health-check-failed'] : []),
    ],
  };
});

const accepted = evaluated.filter((service) => service.accepted);
const blocked = evaluated.filter((service) => !service.accepted);
const releaseGate = blocked.length === 0 ? 'open' : 'closed';
assert.equal(dbHeadroom, 45);
assert.equal(accepted.length, 2);
assert.equal(blocked.length, 1);
assert.equal(blocked[0].name, 'ledger');
assert.equal(blocked[0].schemaMismatch, true);
assert.equal(blocked[0].poolBudgetExceeded, true);
assert.equal(releaseGate, 'closed');

console.log(JSON.stringify({
  dbHeadroom,
  acceptedServices: accepted.length,
  blockedServices: blocked.length,
  poolBudgetExceeded: evaluated.filter((service) => service.poolBudgetExceeded).length,
  schemaMismatch: evaluated.filter((service) => service.schemaMismatch).length,
  releaseGate,
  evaluated,
  releaseOrder: 'stop rollout, rollback ledger config, verify schema, recalculate per-instance budget, then canary again',
}, null, 2));
console.log('config-db-exhaustion: acceptedServices=2 blockedServices=1 poolBudgetExceeded=1 schemaMismatch=1 releaseGate=closed');
`,
      ),
    ),
  'programming:中间件源码 · 容量、故障、恢复与中间件运行手册：消息积压、磁盘、ISR 和 rebalance':
    middlewareLab(
      '中间件运行手册 01 · Kafka 积压与复制健康',
      '把分区 lag、ISR、磁盘占用和 rebalance 状态合成处置优先级，再用生产/消费净速率计算恢复时间。',
      nodeTask(
        'mw2-kafka-backlog-guided',
        '跟做：多分区积压的处置排序',
        '运行 node main.js。逐分区读取 lag、ISR、minISR、磁盘比例和 rebalance 状态，分别产生停止生产、疏散磁盘、延迟滚动和普通观察动作。',
        'partition=orders-0,lag=18000,isr=2,minIsr=2,diskPercent=92,rebalance=no\npartition=orders-1,lag=200,isr=3,minIsr=2,diskPercent=40,rebalance=no\npartition=orders-2,lag=5000,isr=1,minIsr=2,diskPercent=60,rebalance=no\npartition=orders-3,lag=8000,isr=2,minIsr=2,diskPercent=30,rebalance=yes\n',
        '必须看到 pageNow=3 throttlePartitions=2 rebalanceDeferred=1 health=critical，orders-0 的磁盘、orders-2 的 ISR、orders-3 的 rebalance 都需要立即处理；只按 lag 排序会漏掉复制和磁盘风险。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const partitions = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, /^\d+$/.test(value) ? Number(value) : value];
  }));
  return {
    partition: fields.partition,
    lag: fields.lag,
    isr: fields.isr,
    minIsr: fields.minIsr,
    diskPercent: fields.diskPercent,
    rebalance: fields.rebalance === 'yes',
  };
});

const evaluated = partitions.map((part) => {
  const underReplicated = part.isr < part.minIsr;
  const diskCritical = part.diskPercent >= 90;
  const rebalanceRisk = part.rebalance;
  const throttleWrites = underReplicated || diskCritical;
  const lagSeverity = part.lag >= 10000 ? 3 : part.lag >= 5000 ? 2 : 1;
  return {
    ...part,
    underReplicated,
    diskCritical,
    rebalanceRisk,
    throttleWrites,
    pageNow: underReplicated || diskCritical || rebalanceRisk || lagSeverity === 3,
    actions: [
      ...(underReplicated ? ['pause-writes-and-restore-isr'] : []),
      ...(diskCritical ? ['move-or-expand-log-dir'] : []),
      ...(rebalanceRisk ? ['defer-rolling-restart-until-stable'] : []),
      ...(part.lag >= 5000 ? ['increase-drain-capacity'] : []),
    ],
  };
});

const pageNow = evaluated.filter((part) => part.pageNow);
const throttlePartitions = evaluated.filter((part) => part.throttleWrites);
const rebalanceDeferred = evaluated.filter((part) => part.rebalanceRisk);
assert.equal(partitions.length, 4);
assert.equal(pageNow.length, 3);
assert.equal(throttlePartitions.length, 2);
assert.equal(rebalanceDeferred.length, 1);
assert.equal(evaluated.find((part) => part.partition === 'orders-0').diskCritical, true);
assert.equal(evaluated.find((part) => part.partition === 'orders-2').underReplicated, true);

console.log(JSON.stringify({
  partitions: evaluated.length,
  pageNow: pageNow.length,
  throttlePartitions: throttlePartitions.length,
  rebalanceDeferred: rebalanceDeferred.length,
  health: pageNow.length > 0 ? 'critical' : 'healthy',
  evaluated,
}, null, 2));
console.log('kafka-backlog: pageNow=3 throttlePartitions=2 rebalanceDeferred=1 health=critical');
`,
      ),
      nodeTask(
        'mw2-kafka-recovery-rate-independent',
        '独立实践：净消费速率与恢复 ETA',
        '运行 node main.js。对每个分区计算 consumeQps-produceQps 的净排空速率，估算回到 safeLag 的时间；ISR 不足或净速率不大于零的分区立即升级值班。',
        'partition=orders-0,lag=18000,safeLag=1000,consumeQps=800,produceQps=500,isr=3,minIsr=2\npartition=orders-1,lag=2400,safeLag=600,consumeQps=300,produceQps=200,isr=2,minIsr=2\npartition=orders-2,lag=5000,safeLag=500,consumeQps=100,produceQps=200,isr=3,minIsr=2\n',
        '必须看到 drainable=2 blocked=1 maxEtaSeconds=57 isrViolations=0，orders-2 的净速率为 -100，ETA 必须输出 blocked 而不是负数；orders-0 约需 57 秒排到安全线。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const rows = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, /^\d+$/.test(value) ? Number(value) : value];
  }));
  return fields;
});

const evaluated = rows.map((row) => {
  const netQps = row.consumeQps - row.produceQps;
  const isrHealthy = row.isr >= row.minIsr;
  const secondsToSafe = netQps > 0
    ? Math.ceil(Math.max(0, row.lag - row.safeLag) / netQps)
    : null;
  return {
    partition: row.partition,
    lag: row.lag,
    netQps,
    isrHealthy,
    secondsToSafe,
    status: !isrHealthy
      ? 'isr-incident'
      : netQps <= 0
        ? 'backlog-growing'
        : secondsToSafe <= 60
          ? 'recovering'
          : 'slow-recovery',
  };
});

const etas = evaluated.map((item) => item.secondsToSafe).filter(Number.isFinite);
assert.equal(evaluated.filter((item) => item.secondsToSafe !== null).length, 2);
assert.equal(evaluated.filter((item) => item.secondsToSafe === null).length, 1);
assert.equal(Math.max(...etas), 57);
assert.equal(evaluated.filter((item) => !item.isrHealthy).length, 0);
assert.equal(evaluated[2].status, 'backlog-growing');
assert.equal(evaluated[2].netQps, -100);

console.log(JSON.stringify({
  drainable: evaluated.filter((item) => item.secondsToSafe !== null).length,
  blocked: evaluated.filter((item) => item.secondsToSafe === null).length,
  maxEtaSeconds: Math.max(...etas),
  isrViolations: evaluated.filter((item) => !item.isrHealthy).length,
  evaluated,
  escalation: evaluated.filter((item) => item.status === 'backlog-growing' || item.status === 'isr-incident'),
}, null, 2));
console.log('kafka-recovery: drainable=2 blocked=1 maxEtaSeconds=57 isrViolations=0');
`,
      ),
    ),
  'programming:中间件源码 · 容量、故障、恢复与中间件运行手册：缓存命中率、延迟、内存和复制':
    middlewareLab(
      '中间件运行手册 02 · Redis 指标诊断与容量预测',
      '根据命中率、p99、内存比例、淘汰和复制延迟定位缓存故障，再把数据集增长、复制数和安全水位换算成可执行的扩容时间。',
      nodeTask(
        'mw2-cache-diagnostics-guided',
        '跟做：用四个证据区分缓存故障',
        '运行 node main.js。读取每个 Redis 节点的命中率、p99、内存、淘汰和复制延迟，输出 memory-pressure、network-or-replica 或 healthy 诊断。',
        'node=redis-a,hitRate=0.92,p99Ms=8,memoryRatio=0.72,evictions=0,replicaLagMs=1\nnode=redis-b,hitRate=0.61,p99Ms=38,memoryRatio=0.96,evictions=900,replicaLagMs=12\nnode=redis-c,hitRate=0.88,p99Ms=16,memoryRatio=0.81,evictions=0,replicaLagMs=140\n',
        '必须看到 unhealthy=2 memoryPressure=1 replicationLag=1，redis-b 同时有高内存和淘汰，redis-c 的主因是 140ms 复制延迟；命中率正常时也要继续看 p99 和复制。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const nodes = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, /^\d+(\.\d+)?$/.test(value) ? Number(value) : value];
  }));
  return {
    node: fields.node,
    hitRate: fields.hitRate,
    p99Ms: fields.p99Ms,
    memoryRatio: fields.memoryRatio,
    evictions: fields.evictions,
    replicaLagMs: fields.replicaLagMs,
  };
});

const diagnosed = nodes.map((node) => {
  const memoryPressure = node.memoryRatio >= 0.9 || node.evictions > 0;
  const replicationLag = node.replicaLagMs > 100;
  const latencyPressure = node.p99Ms > 30;
  const lowHitRate = node.hitRate < 0.75;
  const reasons = [
    ...(memoryPressure ? ['memory-pressure'] : []),
    ...(replicationLag ? ['replica-lag'] : []),
    ...(latencyPressure ? ['latency-pressure'] : []),
    ...(lowHitRate ? ['low-hit-rate'] : []),
  ];
  return {
    ...node,
    health: reasons.length === 0 ? 'healthy' : 'unhealthy',
    reasons,
  };
});

assert.equal(diagnosed.filter((node) => node.health === 'unhealthy').length, 2);
assert.equal(diagnosed.filter((node) => node.reasons.includes('memory-pressure')).length, 1);
assert.equal(diagnosed.filter((node) => node.reasons.includes('replica-lag')).length, 1);
assert.ok(diagnosed.find((node) => node.node === 'redis-a').reasons.length === 0);
assert.ok(diagnosed.find((node) => node.node === 'redis-b').reasons.includes('low-hit-rate'));

console.log(JSON.stringify({
  nodes: diagnosed.length,
  unhealthy: diagnosed.filter((node) => node.health === 'unhealthy').length,
  memoryPressure: diagnosed.filter((node) => node.reasons.includes('memory-pressure')).length,
  replicationLag: diagnosed.filter((node) => node.reasons.includes('replica-lag')).length,
  diagnosed,
  incidentOrder: 'freeze large writes -> inspect evictions and replica lag -> protect critical keys -> resize or fail over',
}, null, 2));
console.log('cache-diagnostics: unhealthy=2 memoryPressure=1 replicationLag=1');
`,
      ),
      nodeTask(
        'mw2-cache-capacity-independent',
        '独立实践：复制、开销与增长后的容量门禁',
        '运行 node main.js。把基础数据、保留期增长和对象开销算成单副本需求，再乘以副本数，与所有节点的安全内存总量比较并预测耗尽天数。',
        'datasetMb=12000\ndailyGrowthMb=100\nretentionDays=30\noverheadRatio=1.3\nreplicaCount=2\nnodeMemoryMb=32768\nnodeCount=3\nsafeRatio=0.75\n',
        '必须看到 requiredPrimaryMb=19500 totalWithReplicasMb=58500 safeClusterMb=73728 headroomMb=15228 daysToLimit=39 capacityGate=open，所有数值来自增长与副本乘法，不能只比较单个节点。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, Number(value)];
  })
);
const requiredPrimaryMb = (config.datasetMb + config.dailyGrowthMb * config.retentionDays)
  * config.overheadRatio;
const copies = config.replicaCount + 1;
const totalWithReplicasMb = requiredPrimaryMb * copies;
const safeClusterMb = config.nodeMemoryMb * config.nodeCount * config.safeRatio;
const headroomMb = safeClusterMb - totalWithReplicasMb;
const dailyClusterGrowthMb = config.dailyGrowthMb * config.overheadRatio * copies;
const daysToLimit = headroomMb > 0
  ? Math.floor(headroomMb / dailyClusterGrowthMb)
  : 0;
const capacityGate = headroomMb > 0 && daysToLimit >= 30 ? 'open' : 'blocked';

assert.equal(requiredPrimaryMb, 19500);
assert.equal(totalWithReplicasMb, 58500);
assert.equal(safeClusterMb, 73728);
assert.equal(headroomMb, 15228);
assert.equal(daysToLimit, 39);
assert.equal(capacityGate, 'open');
assert.equal(copies, 3);

console.log(JSON.stringify({
  requiredPrimaryMb,
  copies,
  totalWithReplicasMb,
  safeClusterMb,
  headroomMb,
  dailyClusterGrowthMb,
  daysToLimit,
  capacityGate,
  operationalRule: 'reserve safe memory for fork/COW, fragmentation and failover before announcing capacity',
}, null, 2));
console.log('cache-capacity: requiredPrimaryMb=19500 totalWithReplicasMb=58500 safeClusterMb=73728 headroomMb=15228 daysToLimit=39 capacityGate=open');
`,
      ),
    ),
  'programming:中间件源码 · 容量、故障、恢复与中间件运行手册：队列深度、重投、死信和消费者':
    middlewareLab(
      '中间件运行手册 03 · RabbitMQ 队列诊断与恢复',
      '把 ready、unacked、prefetch、重投率、死信和消费者数量放在一起，区分容量不足、消费者卡死和毒消息重放。',
      nodeTask(
        'mw2-rabbit-queue-guided',
        '跟做：积压不是唯一故障信号',
        '运行 node main.js。对每个队列计算消费者预取容量，结合重投率与死信判断 throughput-pressure、poison-message 或 healthy。',
        'queue=payments,ready=15000,unacked=2000,redeliveryRate=0.01,deadLetter=40,consumers=6,prefetch=20\nqueue=email,ready=9000,unacked=5,redeliveryRate=0.38,deadLetter=4000,consumers=1,prefetch=10\nqueue=search,ready=10,unacked=2,redeliveryRate=0,deadLetter=0,consumers=4,prefetch=5\n',
        '必须看到 unhealthy=2 poisonQueues=1 capacityPressure=1，email 的 38% 重投率与 4000 死信要求暂停重放，payments 的 2000 unacked 超过 120 预取上限要扩消费者或加快处理。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const queues = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, /^\d+(\.\d+)?$/.test(value) ? Number(value) : value];
  }));
  return fields;
});

const diagnosed = queues.map((queue) => {
  const prefetchCapacity = queue.consumers * queue.prefetch;
  const capacityPressure = queue.unacked > prefetchCapacity;
  const poisonMessage = queue.redeliveryRate >= 0.1 || queue.deadLetter >= 1000;
  const reasons = [
    ...(capacityPressure ? ['throughput-pressure'] : []),
    ...(poisonMessage ? ['poison-message'] : []),
  ];
  return {
    ...queue,
    prefetchCapacity,
    unackedOverCapacity: Math.max(0, queue.unacked - prefetchCapacity),
    health: reasons.length === 0 ? 'healthy' : 'unhealthy',
    reasons,
    immediateAction: poisonMessage
      ? 'pause replay and inspect dead-letter payloads'
      : capacityPressure
        ? 'scale consumers or shorten handler time'
        : 'observe',
  };
});

assert.equal(diagnosed.filter((queue) => queue.health === 'unhealthy').length, 2);
assert.equal(diagnosed.filter((queue) => queue.reasons.includes('poison-message')).length, 1);
assert.equal(diagnosed.filter((queue) => queue.reasons.includes('throughput-pressure')).length, 1);
assert.equal(diagnosed.find((queue) => queue.queue === 'email').immediateAction, 'pause replay and inspect dead-letter payloads');
assert.equal(diagnosed.find((queue) => queue.queue === 'search').health, 'healthy');

console.log(JSON.stringify({
  queues: diagnosed.length,
  unhealthy: diagnosed.filter((queue) => queue.health === 'unhealthy').length,
  poisonQueues: diagnosed.filter((queue) => queue.reasons.includes('poison-message')).length,
  capacityPressure: diagnosed.filter((queue) => queue.reasons.includes('throughput-pressure')).length,
  diagnosed,
}, null, 2));
console.log('rabbit-queue: unhealthy=2 poisonQueues=1 capacityPressure=1');
`,
      ),
      nodeTask(
        'mw2-rabbit-queue-recovery-independent',
        '独立实践：排空速率、毒消息和安全扩缩容',
        '运行 node main.js。按 consumeQps-produceQps 计算排空 ETA；高重投队列禁止扩容后继续重放，先隔离毒消息并核对死信样本。',
        'queue=payments,backlog=15000,safeDepth=1000,consumeQps=800,produceQps=400,redeliveryRate=0.01,deadLetter=40,consumers=6,maxConsumers=20\nqueue=email,backlog=9000,safeDepth=500,consumeQps=100,produceQps=50,redeliveryRate=0.38,deadLetter=4000,consumers=1,maxConsumers=5\nqueue=search,backlog=100,safeDepth=50,consumeQps=300,produceQps=100,redeliveryRate=0,deadLetter=0,consumers=4,maxConsumers=5\n',
        '必须看到 drainable=3 poisonHold=1 scaleAllowed=2 maxEtaSeconds=35 recoveryGate=blocked，email 虽有正净速率也必须先暂停重放；payments 可在 35 秒内排到安全线。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const queues = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const [queuePart, ...metricParts] = line.split(',');
  const fields = Object.fromEntries(metricParts.map((item) => {
    const [key, value] = item.split('=');
    return [key, Number(value)];
  }));
  return { queue: queuePart.split('=')[1], ...fields };
});

const evaluated = queues.map((queue) => {
  const netQps = queue.consumeQps - queue.produceQps;
  const poison = queue.redeliveryRate >= 0.1 || queue.deadLetter >= 1000;
  const secondsToSafe = netQps > 0
    ? Math.ceil(Math.max(0, queue.backlog - queue.safeDepth) / netQps)
    : null;
  return {
    ...queue,
    netQps,
    poison,
    secondsToSafe,
    scaleAllowed: !poison && queue.consumers < queue.maxConsumers,
    holdReplay: poison,
    status: poison
      ? 'isolate-poison'
      : secondsToSafe === null
        ? 'backlog-growing'
        : secondsToSafe <= 60
          ? 'recovering'
          : 'slow-recovery',
  };
});

const etas = evaluated.map((queue) => queue.secondsToSafe).filter(Number.isFinite);
const actionableEtas = evaluated
  .filter((queue) => !queue.holdReplay)
  .map((queue) => queue.secondsToSafe)
  .filter(Number.isFinite);
assert.equal(evaluated.filter((queue) => queue.secondsToSafe !== null).length, 3);
assert.equal(evaluated.filter((queue) => queue.holdReplay).length, 1);
assert.equal(evaluated.filter((queue) => queue.scaleAllowed).length, 2);
assert.equal(Math.max(...actionableEtas), 35);
assert.equal(evaluated.find((queue) => queue.queue === 'email').status, 'isolate-poison');
assert.equal(evaluated.find((queue) => queue.queue === 'payments').status, 'recovering');

console.log(JSON.stringify({
  drainable: evaluated.filter((queue) => queue.secondsToSafe !== null).length,
  poisonHold: evaluated.filter((queue) => queue.holdReplay).length,
  scaleAllowed: evaluated.filter((queue) => queue.scaleAllowed).length,
  maxEtaSeconds: Math.max(...actionableEtas),
  recoveryGate: evaluated.some((queue) => queue.holdReplay) ? 'blocked' : 'open',
  evaluated,
  recoveryOrder: 'isolate poison -> validate DLX payloads -> replay in a bounded loop -> scale only safe queues',
}, null, 2));
console.log('rabbit-recovery: drainable=3 poisonHold=1 scaleAllowed=2 maxEtaSeconds=35 recoveryGate=blocked');
`,
      ),
    ),
  'programming:中间件源码 · 容量、故障、恢复与中间件运行手册：Trace、告警、值班和容量报告':
    middlewareLab(
      '中间件运行手册 04 · 分布式追踪与告警预算',
      '从 span 父子关系和 self time 找到慢请求的主要耗时，再用误差预算、延迟阈值和容量增长给出可执行告警等级。',
      nodeTask(
        'mw2-trace-critical-path-guided',
        '跟做：从 span 树找主要耗时',
        '运行 node main.js。按 parent 关系构建调用树，计算每个 span 的子调用耗时和 self time，输出错误路径、最长 self time 与 trace 总时长。',
        'span=gateway,parent=-,service=api,durationMs=900,error=no\nspan=db,parent=gateway,service=mysql,durationMs=800,error=yes\nspan=pool-wait,parent=db,service=pool,durationMs=200,error=no\nspan=redis,parent=gateway,service=cache,durationMs=30,error=no\n',
        '必须看到 traceMs=900 errorSpans=1 criticalSpan=db criticalSelfMs=600，db 的 800ms 中有 200ms 是 pool-wait；不能只按总 span 时长把根节点当瓶颈。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const spans = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
  const fields = Object.fromEntries(line.split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, /^\d+$/.test(value) ? Number(value) : value];
  }));
  return {
    id: fields.span,
    parent: fields.parent,
    service: fields.service,
    durationMs: fields.durationMs,
    error: fields.error === 'yes',
  };
});

const children = new Map();
for (const span of spans) {
  if (!children.has(span.parent)) children.set(span.parent, []);
  children.get(span.parent).push(span);
}
const roots = spans.filter((span) => !spans.some((candidate) => candidate.id === span.parent));
const withSelf = spans.map((span) => {
  const childTime = (children.get(span.id) || [])
    .reduce((sum, child) => sum + child.durationMs, 0);
  return {
    ...span,
    childTime,
    selfMs: Math.max(0, span.durationMs - childTime),
  };
});
const critical = [...withSelf].sort((left, right) =>
  right.selfMs - left.selfMs || right.durationMs - left.durationMs
)[0];
const leaves = withSelf.filter((span) => !(children.get(span.id) || []).length);
const pathLeaf = [...leaves].sort((left, right) =>
  right.durationMs - left.durationMs
)[0];
const path = [];
let cursor = pathLeaf;
while (cursor) {
  path.unshift(cursor.id);
  cursor = spans.find((span) => span.id === cursor.parent);
}
const traceMs = roots.reduce((sum, root) => sum + root.durationMs, 0);

assert.equal(spans.length, 4);
assert.equal(roots.length, 1);
assert.equal(traceMs, 900);
assert.equal(withSelf.filter((span) => span.error).length, 1);
assert.equal(critical.id, 'db');
assert.equal(critical.selfMs, 600);
assert.deepEqual(path, ['gateway', 'db', 'pool-wait']);

console.log(JSON.stringify({
  traceMs,
  errorSpans: withSelf.filter((span) => span.error).length,
  criticalSpan: critical.id,
  criticalSelfMs: critical.selfMs,
  pathLeaf: pathLeaf.id,
  criticalPath: path,
  spans: withSelf,
  nextAction: 'inspect pool-wait traces and connection acquisition before changing application business code',
}, null, 2));
console.log('trace-critical-path: traceMs=900 errorSpans=1 criticalSpan=db criticalSelfMs=600');
`,
      ),
      nodeTask(
        'mw2-alert-capacity-independent',
        '独立实践：误差预算与容量报告',
        '运行 node main.js。按 SLO 计算允许错误、burn rate 和延迟违约，再结合利用率增长预测容量耗尽周数，输出告警等级和扩容门禁。',
        'slo=0.999\nwindowRequests=100000\nerrorRequests=450\nlatencyBudgetMs=300\np99Ms=420\ncapacityUtilization=0.82\nweeklyGrowth=0.06\n',
        '必须看到 allowedErrors=100 actualErrors=450 errorBurnRate=4.5 latencyBreach=true weeksToExhaustion=3 alertLevel=page capacityGate=blocked，错误预算与延迟必须同时触发，剩余 18% 容量只够约三周当前增长。',
        String.raw`'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = Object.fromEntries(
  fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).map((line) => {
    const [key, value] = line.split('=');
    return [key, Number(value)];
  })
);
const allowedErrors = Math.round(config.windowRequests * (1 - config.slo));
const errorBurnRate = Math.round(
  ((config.errorRequests / config.windowRequests) / (1 - config.slo)) * 10
) / 10;
const latencyBreach = config.p99Ms > config.latencyBudgetMs;
const headroom = 1 - config.capacityUtilization;
const weeksToExhaustion = Math.floor(headroom / config.weeklyGrowth);
const errorBudgetBreached = errorBurnRate > 1;
const alertLevel = errorBudgetBreached || latencyBreach ? 'page' : 'watch';
const capacityGate = weeksToExhaustion >= 4 ? 'open' : 'blocked';

assert.equal(allowedErrors, 100);
assert.equal(config.errorRequests, 450);
assert.equal(errorBurnRate, 4.5);
assert.equal(latencyBreach, true);
assert.equal(weeksToExhaustion, 3);
assert.equal(alertLevel, 'page');
assert.equal(capacityGate, 'blocked');

console.log(JSON.stringify({
  allowedErrors,
  actualErrors: config.errorRequests,
  errorBudgetBreached,
  errorBurnRate,
  latencyBreach,
  p99Ms: config.p99Ms,
  latencyBudgetMs: config.latencyBudgetMs,
  capacityUtilization: config.capacityUtilization,
  remainingHeadroom: Number(headroom.toFixed(2)),
  weeksToExhaustion,
  alertLevel,
  capacityGate,
  capacityReport: 'plan capacity before four weeks; current weekly growth consumes the remaining headroom in three weeks',
}, null, 2));
console.log('alert-capacity: allowedErrors=100 actualErrors=450 errorBurnRate=4.5 latencyBreach=true weeksToExhaustion=3 alertLevel=page capacityGate=blocked');
`,
      ),
    ),
};
