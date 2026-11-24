// 中间件与源码 · 手写教案
// name 必须与 programs.ts 从 M0-M6 目录模板生成的课程名完全一致。
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';

const m0Stage = 'Kafka 日志、分区与最小生产消费';
const m0Name = (topic: string) => `中间件源码 · ${m0Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m0Name('topic、partition、offset 和 segment'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已能启动本地容器并执行 Kafka 命令行工具，知道 topic 与 broker 是不同运行实体。',
    goal: '能解释 Kafka partition 日志、offset 与 segment 文件之间的对应关系，并用命令行证据区分逻辑消息位置和磁盘文件边界。',
    guidedPractice: '在教师环境中创建三分区 topic，用 kafka-console-producer.sh 写入带 key 的记录，再用 kafka-get-offsets.sh 和 kafka-log-dirs.sh --describe 对照各分区末偏移与日志目录文件。',
    independentPractice: '独立创建一个三分区 topic，写入至少二十条记录，制作 topic/partition/offset/segment 对照表，并说明滚动后旧 segment 删除为何不会改变已有 offset。',
    commonErrors: [
      '把 offset 当成整个 topic 共用的消息编号，跨 partition 比较大小后误判消息先后。',
      '把删除旧 segment 等同于清空 offset 空间，忽略新记录仍从分区末尾继续编号。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Design. https://kafka.apache.org/documentation/#design',
      'Apache Kafka source: core/src/main/scala/kafka/log/UnifiedLog.scala. https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/log/UnifiedLog.scala',
    ],
    steps: [
      ['分区日志模型', 'Kafka 每个 topic 按 partition 拆成独立追加日志，leader 在新记录写入时分配 partition 内单调递增的 offset，offset 不是全局消息编号。segment 以 baseOffset 命名 .log、.index 和 .timeindex 文件，segment.bytes 决定何时滚动新文件；可用 kafka-log-dirs.sh --describe 观察目录。若跨 partition 比较 offset，就会把完全不同日志流误排先后；验证时必须保存 topic、partition、offset 三元组，同时把 leader、文件路径与校验结果写入证据，并保留 broker 标识与分区目录时间戳。', '位置只在分区内有意义', {"title":"分区日志模型","language":"bash","code":"docker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --create --topic orders.v1 --partitions 3 --replication-factor 1\ndocker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --describe --topic orders.v1\ndocker exec kafka1 kafka-log-dirs.sh --bootstrap-server localhost:9092 \\\n  --describe | jq '.brokers[].logDirs[].partitions[] | select(.topic==\"orders.v1\")'","output":"Topic: orders.v1  TopicId: ...  PartitionCount: 3\nPartition: 0  Leader: 1  Replicas: 1  Isr: 1\n{\"partition\":\"orders.v1-0\",\"size\":0,\"offsetLag\":0}"}],
      ['活跃与旧 segment', '当前可写的 active segment 接收追加，达到 segment.bytes 或按时间与索引条件滚动后变成只读旧文件，删除策略针对整段文件而不是单条记录。索引只映射相对偏移，最终数据仍从 .log 读取；用 kafka-configs.sh --describe --entity-type topics --entity-name 查看覆盖配置。误删 active segment 或直接把文件复制回去会破坏 recovery 状态，验证应比较滚动前后目录名与分区 log-end-offset。', '滚动单位是整段文件', {"title":"活跃与旧 segment","language":"bash","code":"docker exec kafka1 sh -lc 'ls -l /var/lib/kafka/data/orders.v1-0/\ncat /var/lib/kafka/data/orders.v1-0/partition.metadata'\ndocker exec kafka1 kafka-configs.sh --bootstrap-server localhost:9092 \\\n  --describe --entity-type topics --entity-name orders.v1","output":"00000000000000000000.log\n00000000000000000000.index\nsegment.bytes=1073741824 sensitive=false\nlog-end-offset=0"}],
      ['创建 topic 与核验元数据', 'kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders.v1 --partitions 3 --replication-factor 3 会登记分区与副本分配，--describe 输出 leader、replicas、isr 和 TopicId。分区数创建后增加只会改变新 key 的散列落点，不会重排旧消息；先把命令、TopicId、各 leader 和 isr 保存为证据。若只看到命令成功而不核对副本分布，可能在线下环境拿到单副本 topic 却以为具备复制能力，并逐分区核对副本落点与可用性。', '命令成功还要核对 ISR', {"title":"创建 topic 与核验元数据","language":"bash","code":"docker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --create --topic events.v1 --partitions 3 --replication-factor 3 \\\n  --config min.insync.replicas=2\ndocker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --describe --topic events.v1","output":"Created topic events.v1.\nPartition: 0  Leader: 2  Replicas: 2,1,3  Isr: 2,1,3\nPartition: 1  Leader: 3  Replicas: 3,1,2  Isr: 3,1,2"}],
      ['生产、拉取与位置对照', 'console producer 设置 parse.key=true 后，每行 key<Tab>value 会被 key 分区器路由；console consumer 添加 print.key=true、print.partition=true 和 print.offset=true 后，可在终端直接看到实际落盘位置。消费 read_uncommitted 与 read_committed 的可见上界不同，事务未提交记录可能已占 offset。验证应有计划写入 key、预期分区、实际分区与 offset 四列，任何一行不一致都回到分区器和副本状态排查，并保存消费组最终提交位置。', '终端输出要对上分区分录', {"title":"生产、拉取与位置对照","language":"bash","code":"printf 'A-100\\tcreated\\nA-100\\tpaid\\nB-200\\tcreated\\n' |\ndocker exec -i kafka1 kafka-console-producer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --property parse.key=true --property key.separator=$'\\t'\ndocker exec kafka1 kafka-console-consumer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --from-beginning --max-messages 3 \\\n  --property print.key=true --property print.partition=true --property print.offset=true","output":"Partition:1  A-100  0  created\nPartition:1  A-100  1  paid\nPartition:0  B-200  0  created\nProcessed a total of 3 messages"}],
      ['保留策略的失败边界', 'retention.ms、retention.bytes 或 cleanup.policy 触发后，broker 删除不再需要的旧 segment，consumer 仍看到 offset 空洞而不会要求旧文件必须存在。可用 kafka-configs.sh --alter 临时收紧 retention.ms，再等待日志清理并对比目录；不要把 offset 空洞当消息丢失，也不要在业务仍需回溯时只依赖短保留。验证应记录 last stable offset、日志起始 offset 和实际保留时长，并记录保留窗口的实际边界。', 'offset 连续不代表文件保留', {"title":"保留策略的失败边界","language":"bash","code":"docker exec kafka1 kafka-configs.sh --bootstrap-server localhost:9092 \\\n  --alter --entity-type topics --entity-name events.v1 \\\n  --add-config retention.ms=60000\nsleep 75\ndocker exec kafka1 kafka-get-offsets.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --time -2\ndocker exec kafka1 kafka-get-offsets.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --time -1","output":"events.v1:0:3\nevents.v1:1:2\nevents.v1:2:0\n旧 segment 被删除后，起始 offset 仍从 3、2 继续"}],
    ],
  },
  {
    name: m0Name('producer、broker、consumer 运行拓扑'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已完成 topic、partition 与 offset 课时，能读懂 Kafka describe 输出中的 leader 和 isr。',
    goal: '能画出客户端元数据发现、leader 写入与 consumer fetch 的运行拓扑，并通过 broker 掉线实验说明哪一段连接和元数据需要重新建立。',
    guidedPractice: '启动三 broker Compose 环境，用 kafka-metadata-quorum.sh --describe 和 kafka-topics.sh --describe 画出 controller、broker、leader、follower、producer 和 consumer 的关系，再停止一个非 leader broker 观察元数据变化。',
    independentPractice: '独立停止一个 leader broker，记录 producer 重试、consumer 重新发现 leader 与 ISR 变化的日志，恢复 broker 后给出一次写入和消费均成功的证据。',
    commonErrors: [
      '把 bootstrap.server 当成唯一 broker，不知道客户端会先从它取得完整元数据再连接分区 leader。',
      '只检查 broker 进程是否存活，不核对客户端实际连接的分区 leader 与副本状态。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Broker Configs. https://kafka.apache.org/documentation/#brokerconfigs',
      'Apache Kafka Documentation: Kafka Connect and clients architecture. https://kafka.apache.org/documentation/',
    ],
    steps: [
      ['角色与职责分离', 'Kafka 集群中 broker 保存分区副本并服务客户端，controller 负责分配 leader、维护 ISR 与执行故障转移，producer 和 consumer 都是通过网络主动连接的客户端。KRaft 模式下可用 kafka-metadata-quorum.sh --describe 查看 controller quorum 与当前 leader；若把 controller 当消息代理或把客户端状态存到 broker 外，就会误判故障责任。验证应分别记录进程、监听端口和集群元数据，而非只看容器处于 running。', '先分清代理与协调者', {"title":"角色与职责分离","language":"bash","code":"docker compose ps\ndocker exec kafka1 kafka-metadata-quorum.sh --bootstrap-server localhost:9092 \\\n  --describe --status\ndocker exec kafka1 kafka-broker-api-versions.sh --bootstrap-server localhost:9092","output":"kafka1 ... Up 0.0.0.0:9092->9092/tcp\nClusterId: ...  LeaderId: 1  CurrentVoters: [1,2,3]\nkafka1:9092 (id: 1 rack: null) -> ApiVersion"}],
      ['元数据发现链路', 'producer 从 bootstrap.server 列表中任一可达地址发送 Metadata 请求，得到 topic 分区、leader、replica 和 epoch 后，才把 Produce 请求发送给对应 leader。bootstrap 地址失效但普通 broker 仍可达时，客户端未必立即恢复，因为初始发现入口已经断开；验证应同时关闭一个 bootstrap 地址并确认剩余地址可用。若日志只显示连接超时，就要区分发现失败、leader 迁移和认证失败三种边界。', '启动地址不是固定写入点', {"title":"元数据发现链路","language":"properties","code":"bootstrap.servers=kafka1:9092,kafka2:9093,kafka3:9094\nclient.dns.lookup=use_all_dns_ips\nmetadata.max.age.ms=30000\nreconnect.backoff.max.ms=2000\n# 关闭一个 bootstrap 地址后持续生产，观察客户端重新发现 leader\nkafka-producer-perf-test.sh --topic events.v1 \\\n  --producer.config client.properties --num-records 1000 \\\n  --record-size 256 --throughput 100","output":"records sent = 1000, records/sec = 99.4\nAvg latency: 8 ms\n客户端日志出现 Node -1 disconnected，随后刷新 Metadata 并连接 leader"}],
      ['Produce 请求路径', 'producer 把同分区 record 聚合进 RecordAccumulator，Sender 线程依据元数据选择 leader，再把 batch 交给 NetworkClient；broker 校验 CRC、幂等序列和大小后追加分区日志。max.request.size 与 broker message.max.bytes 不匹配时会出现客户端可发出但 broker 拒收的边界，必须同时查看两端配置。验证可在 producer 日志中记录 batch 大小、目标 leader、acks 结果和 broker 返回错误码，并保存每次回调的目标节点，在重试时确认新 leader 与旧回调不会混淆。', '发送是批处理与网络状态机', {"title":"Produce 请求路径","language":"bash","code":"docker exec kafka1 sh -lc 'grep -E \"AppendRecords|Produce request|leader epoch\" \\\n  /var/log/kafka/server.log | tail -20'\ndocker exec kafka1 kafka-producer-perf-test.sh --topic events.v1 \\\n  --num-records 20 --record-size 100 --throughput 1","output":"Produce request with correlation id 42 from client producer-1\nAppendRecords to partition events.v1-0 with leader epoch 3\n20 records sent, 20 records/sec"}],
      ['Fetch 请求路径', 'consumer 先加入消费组或按独立订阅规则获取分配，再向分区 leader 发送 Fetch；broker 返回记录、高水位和 leader epoch，客户端推进本地 position。fetch.max.bytes、max.partition.fetch.bytes 与 max.poll.records 共同决定单次拉取和业务处理规模，任一配置过小都会让吞吐停留在网络往返上。验证要对比 position、committed offset 与 partition log-end-offset，同时记录响应字节和返回记录数量，并保存高水位与位置差额。', '拉取量受多层上限约束', {"title":"Fetch 请求路径","language":"bash","code":"docker exec kafka1 kafka-console-consumer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --group fetch-demo --from-beginning --max-messages 5 \\\n  --consumer-property fetch.max.bytes=2048 \\\n  --consumer-property max.partition.fetch.bytes=1024 \\\n  --consumer-property max.poll.records=2\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group fetch-demo","output":"消费两轮后处理完成\nGROUP      TOPIC     PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG\nfetch-demo events.v1 0          2               2               0"}],
      ['Broker 故障注入', '停止一个非 leader broker 后，controller 会把对应副本从 ISR 移除，生产写入仍可继续；若停止 leader，则先等待复制与选举，再让客户端收到新 leader 元数据。用 kafka-topics.sh --describe 对比 Leader 与 Isr 两列，并观察客户端重试日志中的 NOT_LEADER_OR_FOLLOWER。如果 min.insync.replicas 无法满足，验证重点应是 broker 拒绝写入而不是客户端假装成功，并保存切换前后的分区 leader。', '掉线影响取决于角色', {"title":"Broker 故障注入","language":"bash","code":"docker compose stop kafka3\ndocker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --describe --topic events.v1\nprintf 'after-failure\\n' | docker exec -i kafka1 kafka-console-producer.sh \\\n  --bootstrap-server localhost:9092 --topic events.v1\ndocker compose start kafka3","output":"Partition: 1 Leader: 1 Replicas: 1,2,3 Isr: 1,2\n生产成功；恢复 kafka3 后 Isr 回到 1,2,3\n客户端日志出现 NOT_LEADER_OR_FOLLOWER 后完成重试"}],
    ],
  },
  {
    name: m0Name('key、分区和顺序边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能创建多分区 topic 并使用带 key 的 console producer 与 consumer。',
    goal: '能解释 key 散列到 partition 的规则，判断哪些业务事件共享顺序，并能设计不会因增加分区而破坏既有顺序假设的消息模型。',
    guidedPractice: '以 orderId 为 key 写入同一订单的创建、支付、取消事件，同时写入无 key 事件，使用 print.partition=true 观察分布，再用 kafka-consumer-groups.sh 记录各分区消费位置。',
    independentPractice: '独立设计订单事件 topic，给出 key 选择、分区数、热点 key 处理与重放方案，并写出增加分区后旧订单顺序仍成立的验证步骤。',
    commonErrors: [
      '以为同一 topic 内所有消息全局有序，忽略跨 partition 的消费顺序无法保证。',
      '上线后直接增加分区却不检查 key 到 partition 的映射变化，导致同一实体事件被拆到多个日志。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Producer Configs. https://kafka.apache.org/documentation/#producerconfigs',
      'Apache Kafka source: clients/src/main/java/org/apache/kafka/clients/producer/internals/BuiltInPartitioner.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/BuiltInPartitioner.java',
    ],
    steps: [
      ['key 分区规则', 'Java 客户端对非空 key 使用 murmur2 散列并映射到当前分区数，null key 则采用粘性分区策略在批次间选择分区，减少小批次分散。partitioner.class 可替换实现，但替换后同一 key 可能改道；验证时用相同 key 写入多轮并对比 print.partition 输出。若业务依赖 key 顺序，就必须固定分区器、分区数和序列化字节，不能只比较 Java 对象。', '同一 key 才共享落点', {"title":"key 分区规则","language":"bash","code":"for i in 1 2 3 4 5; do\n  printf 'ORDER-42\\tcreated-%s\\n' \"$i\"\ndone | docker exec -i kafka1 kafka-console-producer.sh \\\n  --bootstrap-server localhost:9092 --topic events.v1 \\\n  --property parse.key=true --property key.separator=$'\\t'\ndocker exec kafka1 kafka-console-consumer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --from-beginning --max-messages 5 \\\n  --property print.key=true --property print.partition=true","output":"Partition:1 ORDER-42 created-1\nPartition:1 ORDER-42 created-2\nPartition:1 ORDER-42 created-3\n同一 key 五条记录均进入 partition 1"}],
      ['分区数是映射参数', '分区映射包含分区总数，创建后从三分区扩到四分区会让部分 key 从旧分区迁到新分区，但历史记录不会搬移。业务若要求同一订单全生命周期有序，应在扩容前切换带版本的新 topic，或者接受旧订单与新订单使用不同路由。命令 kafka-topics.sh --alter --partitions 的返回值只证明元数据改变，不证明消费端排序正确；验证要重放同一 key 并检查它是否跨分区。', '扩容会改变新记录映射', {"title":"分区数是映射参数","language":"bash","code":"docker exec kafka1 kafka-topics.sh --bootstrap-server localhost:9092 \\\n  --alter --topic events.v1 --partitions 4\nprintf 'ORDER-42\\tcreated-after-expand\\n' |\ndocker exec -i kafka1 kafka-console-producer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --property parse.key=true --property key.separator=$'\\t'\ndocker exec kafka1 kafka-console-consumer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --from-beginning --property print.key=true --property print.partition=true","output":"Partition:1 ORDER-42 created-1\n...\nPartition:0 ORDER-42 created-after-expand\n扩容后同一 key 的新记录可能换到新分区，旧数据不迁移"}],
      ['实体级顺序设计', 'Kafka 只保证单个 partition 内追加顺序，同一 key 写入同一 leader 的分区后才可按 offset 排序；不同分区之间不存在全局 offset 和跨分区先后。订单事件以 orderId 为 key，商品库存事件则可能以 skuId 为 key，同一分区消费者可顺序处理一类实体。若把两个无关联实体强行放一个全局 key，会制造写入热点；验证应输出实体、分区、offset 和事件时间四列。', '顺序绑定实体与分区', {"title":"实体级顺序设计","language":"java","code":"Properties props = new Properties();\nprops.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, \"localhost:9092\");\nprops.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);\nprops.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);\ntry (KafkaProducer<String, String> p = new KafkaProducer<>(props)) {\n  for (String event : List.of(\"created\", \"paid\", \"shipped\")) {\n    p.send(new ProducerRecord<>(\"orders.v1\", \"ORDER-42\", event)).get();\n  }\n}","output":"ORDER-42 created  partition=1 offset=12\nORDER-42 paid     partition=1 offset=13\nORDER-42 shipped  partition=1 offset=14"}],
      ['热点 key 与倾斜观测', '只有一个高流量 key 时，所有同 key 记录只能进入一个 partition，单分区磁盘和 leader CPU 会成为瓶颈，增加 broker 也无法分散。kafka-consumer-groups.sh --describe 可看各分区 lag，kafka-log-dirs.sh --describe 可看副本大小；若只增加分区而不拆分实体，热点不会消失。验证要按分区比较 offset 增量，同时比较副本磁盘占用与 leader 负载，而不是只看 topic 总吞吐，再按分区核对生产速率与消费速率是否匹配。', '总吞吐会掩盖单分区热点', {"title":"热点 key 与倾斜观测","language":"bash","code":"docker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group order-workers\ndocker exec kafka1 kafka-log-dirs.sh --bootstrap-server localhost:9092 --describe |\n  jq '[.brokers[].logDirs[].partitions[] | select(.topic==\"events.v1\") |\n  {partition,size,offsetLag}] | sort_by(.partition)'","output":"PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG\n0          10              210             200\n1          10000           10050           50\npartition 1 副本大小显著高于其他分区，热点未分散"}],
      ['顺序故障演练', '写入订单 A 的十条事件，随机停止一次 producer 后重跑，再消费并检查 A 是否仍只落在一个分区且 offset 单调。随后创建一个新 key 并观察可落其他分区；若业务端用全局时间排序，就会看到跨分区交错，这是设计边界而不是 Kafka 丢序。验收应同时证明单实体顺序、不同实体并行和扩容后旧数据不迁移三件事。', '先证明边界再声明有序', {"title":"顺序故障演练","language":"bash","code":"for n in 1 2 3 4 5; do printf 'ORDER-42\\tstep-%s\\n' \"$n\"; done |\ndocker exec -i kafka1 kafka-console-producer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --property parse.key=true --property key.separator=$'\\t'\ndocker exec kafka1 kafka-console-consumer.sh --bootstrap-server localhost:9092 \\\n  --topic events.v1 --from-beginning --timeout-ms 3000 \\\n  --property print.key=true --property print.partition=true --property print.offset=true","output":"Partition:1  15  ORDER-42  step-1\nPartition:1  16  ORDER-42  step-2\nPartition:1  17  ORDER-42  step-3\noffset 单调递增，且不存在跨分区交错"}],
    ],
  },
  {
    name: m0Name('消费组、位移和重复消费'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能运行 console consumer，并理解 partition 内 offset、日志末尾位置和 consumer group 的区别。',
    goal: '能说明 consumer group 分配、committed offset 与业务处理提交之间的顺序，并构造一次可解释的重复消费。',
    guidedPractice: '使用两个消费者组成同一 group 消费三分区 topic，通过 kafka-consumer-groups.sh --describe 记录 member、current-offset、log-end-offset 和 lag，再停止一个消费者观察分区重新分配。',
    independentPractice: '设计一个先写数据库再提交 offset 的消费程序，在两步之间强制终止进程，记录重启后的重复记录，并用业务唯一键实现幂等。',
    commonErrors: [
      '把 committed offset 当成最后一条已处理消息的位置，忽略它通常表示下一条要读取的位置。',
      '先提交 offset 再执行业务写入，进程崩溃后消息已不可重读，形成静默丢处理。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Consumer Configs. https://kafka.apache.org/documentation/#consumerconfigs',
      'Apache Kafka Documentation: Consumer Design. https://kafka.apache.org/documentation/#design_consumer',
    ],
    steps: [
      ['消费组是一组订阅者', '同一 group.id 下，每个 partition 在稳定状态下只分配给一个 consumer，多出的 consumer 处于空闲；不同 group 各自维护位移并可重复读取同一条记录。kafka-consumer-groups.sh --describe --group 显示分配与 lag，--state 显示稳定或 rebalance 状态。若把 group 当作消息去重器，就会误解不同组各自消费的事实；验证必须记录 memberId、分区和 group 三列，并观察成员退出后的重新分配。', '组内分担而非共享删除', {"title":"消费组是一组订阅者","language":"bash","code":"docker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group order-workers --members --verbose\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group order-workers --state","output":"CONSUMER-ID  HOST  CLIENT-ID  #PARTITIONS  ASSIGNMENT\nc1           ...   consumer-1 2             [events.v1-0,events.v1-1]\nc2           ...   consumer-2 1             [events.v1-2]\nGroupState: Stable"}],
      ['committed offset 的语义', 'broker 在 __consumer_offsets 内保存每个 group、topic、partition 的提交位置，consumer 下次从该位置继续读取；提交值通常是下一条待读 offset。auto.offset.reset 只在没有有效提交或提交超界时生效，earliest 与 latest 不会修复一个仍在保留范围内的旧提交。验证可用 --reset-offsets --dry-run 先预览，再从实际读取结果核对下一次读取的首条位置，然后决定是否重放或跳过。', '提交的是下一步位置', {"title":"committed offset 的语义","language":"bash","code":"docker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --group order-workers --topic events.v1 --reset-offsets --to-earliest --dry-run\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group order-workers","output":"TOPIC      PARTITION  NEW-OFFSET\nevents.v1  0          0\nevents.v1  1          0\nGROUP  TOPIC PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG"}],
      ['处理与提交的时序', '先处理业务副作用再提交 offset 得到至少一次语义：进程在副作用完成后、提交前崩溃，重启会重复处理；先提交再处理则可能丢失副作用。业务应把幂等键写入与业务结果同一数据库事务，提交 offset 放在成功之后。日志要同时记录 partition、offset、业务键和事务结果，重复消费才有可验证依据。', '提交顺序决定重复或丢失', {"title":"处理与提交的时序","language":"sql","code":"BEGIN;\nINSERT INTO consumed_order_events(event_id, order_id, payload)\nVALUES ('ORDER-42:paid:7', 'ORDER-42', '{\"status\":\"paid\"}')\nON CONFLICT (event_id) DO NOTHING;\nUPDATE orders SET status = 'paid' WHERE id = 'ORDER-42';\nCOMMIT;\n-- 事务成功后再 KafkaConsumer.commitSync()；重复事件由 event_id 唯一键吸收","output":"INSERT 0 1\nUPDATE 1\nCOMMIT\n第二次执行：INSERT 0 0，订单状态不变，随后才提交 offset 8"}],
      ['组协调与分配观察', 'consumer 发送 JoinGroup 后由 GroupCoordinator 选 leader，组内 leader 计算分配，members 在 SyncGroup 获得分区；成员心跳中断或处理超时会触发 rebalance。可用 kafka-consumer-groups.sh --members --verbose 查看 clientId、host 和分配。若只看 lag 不看组状态，会把 rebalance 中暂时停顿误判成消费者吞吐不足。消费者成员变化时先读 generation、memberId 与 assignment，再判断分区是否已移交，不能只看进程是否在线，还要保存分配前后分区清单与提交代次编号。', '分配由协调者与组长完成', {"title":"组协调与分配观察","language":"bash","code":"docker exec kafka1 kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n  --describe --group order-workers --members --verbose\ndocker exec kafka1 sh -lc 'grep -E \"JoinGroup|SyncGroup|rebalance\" \\\n  /var/log/kafka/server.log | tail -15'","output":"MEMBER-ID ...  CLIENT-ID consumer-1  ASSIGNMENT [events.v1-0]\nMEMBER-ID ...  CLIENT-ID consumer-2  ASSIGNMENT [events.v1-1]\nPreparing to rebalance group order-workers with old generation 7"}],
      ['重复消费故障注入', '模拟处理器在数据库提交成功后、Kafka offset 提交前抛异常，下一轮 poll 会重新拿到同一 partition 和 offset。验证应证明第二次处理命中唯一键并返回已处理，而不是再次扣款或重复发货；随后提交新 offset 并观察 lag 归零。若只在消费端内存去重，重启后仍会重复，边界应明确写在数据库中。', '幂等落在持久化边界', {"title":"重复消费故障注入","language":"sql","code":"CREATE TABLE order_events (\n  event_id text PRIMARY KEY,\n  order_id text NOT NULL,\n  processed_at timestamptz NOT NULL DEFAULT now()\n);\nINSERT INTO order_events(event_id, order_id)\nVALUES ('events.v1:1:27', 'ORDER-42')\nON CONFLICT (event_id) DO NOTHING\nRETURNING event_id;\nSELECT count(*) FROM order_events WHERE order_id = 'ORDER-42';","output":"第一次 RETURNING: events.v1:1:27\n第二次 RETURNING: 0 rows\ncount = 1；消费重启后业务副作用仍只有一次"}],
    ],
  },
  {
    name: m0Name('最小生产消费与故障注入'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已完成本阶段前四课，会创建多分区 topic、生产带 key 的消息并查询消费组 lag。',
    goal: '能独立搭建一条三节点 Kafka 生产消费链，注入 broker 下线与消费者停顿，并用 offset、ISR 和 lag 解释结果。',
    guidedPractice: '按课程 Compose 文件启动三 broker，创建 replication-factor=3 的 orders.v1，写入一百条订单事件，通过 app 消费并记录正常链路的 TopicId、leader、offset、lag 与耗时。',
    independentPractice: '独立完成一次故障演练：停止 follower、停止 leader、暂停消费者再恢复，保存三组时间线证据，并说明哪些请求失败可以被自动重试，哪些必须业务幂等。',
    commonErrors: [
      '只观察 producer 返回成功，不检查 replication-factor、isr 与 min.insync.replicas 是否允许故障后继续写。',
      '故障恢复后直接清空 consumer group 重来，丢失原始 offset 与 lag 证据，无法判断是否重复处理。',
    ],
    sourceRefs: [
      'Apache Kafka Quickstart. https://kafka.apache.org/quickstart',
      'Apache Kafka Documentation: Basic Operations. https://kafka.apache.org/documentation/#basic_ops',
    ],
    steps: [
      ['搭建三节点链路', '三个 broker 必须使用不同 broker.id、监听地址和日志目录，client 的 bootstrap.server 至少列出两个节点；topic 以 --replication-factor 3 创建后，describe 的每个 partition 应有三份 replica。先记录主题配置、容器健康与 metadata quorum，再开始业务写入。若日志目录复用或 broker.id 冲突，节点会启动失败；验证应逐项检查 broker.id、listener、log.dirs 和 TopicId，并保存副本分配以便故障时对照，同时记录日志目录归属。', '拓扑证据先于压测', {"title":"搭建三节点链路","language":"yaml","code":"services:\n  kafka1:\n    image: apache/kafka:3.9.1\n    environment:\n      KAFKA_NODE_ID: 1\n      KAFKA_PROCESS_ROLES: broker,controller\n      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093\n      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka1:9092\n      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093","output":"docker compose up -d\nkafka1/kafka2/kafka3 healthy\nmetadata quorum leader=2 voters=3\ntopic events.v1 每个分区 replicas=3"}],
      ['正常生产与消费', 'producer 以 orderId 为 key、启用 acks=all，consumer 按固定 group 拉取并在业务事务成功后同步提交，用 --describe 把 current-offset 与 log-end-offset 相减得到 lag。写入一百条后先确认分区分布，再逐条核对业务幂等结果和最终 lag=0。若只统计 producer send 调用次数，无法发现 broker 拒收或异步回调失败；验证要以 broker 可见 offset 和消费结果为准，并保留每个分区的首末位置。', '发送回调与消费结果同验', {"title":"正常生产与消费","language":"bash","code":"seq 1 100 | awk '{printf \"ORDER-%03d\\tcreated\\n\", $1}' |\ndocker exec -i kafka1 kafka-console-producer.sh --bootstrap-server kafka1:9092 \\\n  --topic orders.prod --property parse.key=true --property key.separator=$'\\t'\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker","output":"PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG\n0         34             34             0\n1         33             33             0\n2         33             33             0\n100 条订单全部消费完成"}],
      ['暂停消费者制造积压', '停止 consumer 进程但保留 group，继续生产同 key 事件，kafka-consumer-groups.sh --describe 会显示 log-end-offset 上升而 current-offset 不动。记录每分钟 offset 增量和磁盘增长，再恢复 consumer 测量追平时间；若生产速率高于消费能力，积压会持续扩大。边界是停 consumer 不影响 broker 写入，但磁盘保留和分区顺序仍限制恢复上限，还要记录恢复时每分钟的追平速度。', 'lag 是生产与消费速度差', {"title":"暂停消费者制造积压","language":"bash","code":"docker compose pause orders-worker\nseq 101 400 | awk '{printf \"ORDER-%03d\\tcreated\\n\", $1}' |\ndocker exec -i kafka1 kafka-console-producer.sh --bootstrap-server kafka1:9092 \\\n  --topic orders.prod --property parse.key=true --property key.separator=$'\\t'\nsleep 30\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker","output":"GROUP          TOPIC        PARTITION CURRENT LOG-END LAG\norders-worker  orders.prod  0         34      134     100\norders-worker  orders.prod  1         33      133     100\norders-worker  orders.prod  2         33      133     100"}],
      ['follower 下线边界', 'docker compose stop 一个 follower 后，isr 从三个变两个，若 min.insync.replicas=2 且 acks=all，写入仍可确认；如果同时再停一个副本，broker 应返回 NOT_ENOUGH_REPLICAS 类错误而不是继续持久化。用 describe 和 producer 回调码记录两个阶段，恢复 follower 后等待 ISR 回补。验证要看副本实际追上并重新进入 isr，不能只看容器重新 running，同时保存 ISR 变化与回调错误码，并在恢复后再次比较副本末位置与服务端日志。', '复制余量决定写可用性', {"title":"follower 下线边界","language":"bash","code":"docker compose stop kafka3\ndocker exec kafka1 kafka-topics.sh --bootstrap-server kafka1:9092 \\\n  --describe --topic orders.prod\nprintf 'ORDER-401\\tcreated\\n' | docker exec -i kafka1 kafka-console-producer.sh \\\n  --bootstrap-server kafka1:9092 --topic orders.prod --property parse.key=true\ndocker compose stop kafka2","output":"Partition:0 Leader:1 Replicas:1,2,3 Isr:1,2\nORDER-401 send succeeded\n停止第二个副本后 acks=all 返回 NOT_ENOUGH_REPLICAS"}],
      ['leader 下线与恢复验收', '停止当前 leader 后，controller 在可用副本中选出新 leader，客户端收到元数据变更并重试；短窗口内可能出现未知结果，因此业务必须用 orderId 与事件序号幂等。恢复后核对 Isr、各副本 log-end-offset 和消费者最终结果，提交故障前、中、后三段时间线。若恢复动作只凭界面绿色，不验证重复消息和 lag，就不能证明链路恢复。', '恢复要覆盖数据一致性', {"title":"leader 下线与恢复验收","language":"bash","code":"docker compose stop kafka1\ndocker exec kafka2 kafka-topics.sh --bootstrap-server kafka2:9092 \\\n  --describe --topic orders.prod\nprintf 'ORDER-500\\tpaid\\n' | docker exec -i kafka2 kafka-console-producer.sh \\\n  --bootstrap-server kafka2:9092 --topic orders.prod\ndocker compose start kafka1","output":"Partition:0 Leader:2 Replicas:2,3,1 Isr:2,3\n客户端收到 leader 变更并重试成功\nORDER-500 业务唯一键 count=1，重复投递被幂等吸收"}],
    ],
  },
];

const m1Stage = 'Kafka Producer、Consumer 与复制源码';
const m1Name = (topic: string) => `中间件源码 · ${m1Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m1Name('RecordAccumulator、Sender 和 NetworkClient'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已理解 Kafka producer 需要先获取分区 leader 元数据，并能阅读 Java 线程与队列相关代码。',
    goal: '能沿 send 调用追到 RecordAccumulator、Sender 与 NetworkClient，解释 batching、缓冲阻塞和网络在途请求如何影响发送延迟与吞吐。',
    guidedPractice: '把 batch.size、linger.ms 和 buffer.memory 调成两组对比值，通过 JMX 记录 buffer-available-bytes、record-queue-time 与 send 延迟，再在源码中定位对应累加器和发送循环。',
    independentPractice: '独立构造小消息高频发送与单消息过大两种负载，分别保存缓冲区阻塞、MaxRequestSize 拒绝和正常批处理的日志证据，并给出配置调整依据。',
    commonErrors: [
      '只增加 batch.size 却保留零 linger，消息仍按很小批次发出，吞吐没有预期变化。',
      '看到 send 返回 future 就认为消息已写入 broker，不检查异步回调中的异常和超时。',
    ],
    sourceRefs: [
      'Apache Kafka source: RecordAccumulator.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java',
      'Apache Kafka source: Sender.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/Sender.java',
    ],
    steps: [
      ['send 的线程边界', 'KafkaProducer.send 在调用线程完成序列化、分区选择并尝试把 ProducerBatch 追加到对应分区队列，真正的网络发送由单独 Sender 线程执行。future 完成依赖回调与 metadata，不代表调用返回时 broker 已确认；要保留 record 的 topic、partition 和异常回调。若业务在线程内无限等待 future，就可能在 broker 故障时拖垮请求线程，验证应记录调用耗时与回调结果的差异。', '入队与确认不是同一时刻', {"title":"send 的线程边界","language":"java","code":"var future = producer.send(new ProducerRecord<>(\"events.v1\", \"ORDER-42\", \"paid\"),\n    (metadata, error) -> log.info(\"callback partition={} offset={} error={}\",\n        metadata == null ? null : metadata.partition(),\n        metadata == null ? null : metadata.offset(), error));\nlog.info(\"send-returned futureDone={}\", future.isDone());\nfuture.get(5, TimeUnit.SECONDS);","output":"send-returned futureDone=false\ncallback partition=1 offset=27 error=null\n入队立即返回，回调完成后才拿到 broker 的确认位置"}],
      ['RecordAccumulator 批次形态', 'RecordAccumulator 为每个分区维护 deque，ProducerBatch 在 append 时检查剩余容量与 batch.size，batch 满或 linger.ms 到期后才可发送，buffer.memory 限制所有未发送批次总占用。小消息流量越高，批处理节省的网络请求越明显；但 linger 增大会引入等待。验证可同时观察 batch-size-avg 与 record-queue-time-avg，每批大小、等待时间与总占用要一起记录，而不是只看最大吞吐，并记录重试批次的变化趋势。', '批次在容量与等待间形成', {"title":"RecordAccumulator 批次形态","language":"properties","code":"batch.size=65536\nlinger.ms=10\nbuffer.memory=33554432\ncompression.type=lz4\n# 同一分区、单条 512B 消息，观察批次聚合与排队时间\nkafka-producer-perf-test.sh --topic events.v1 \\\n  --producer.config producer.properties --num-records 200000 \\\n  --record-size 512 --throughput -1","output":"records sent = 200000, records/sec = 182000\nAvg latency: 2.1 ms\nJMX batch-size-avg 约 24KB，record-queue-time-avg 约 7ms"}],
      ['Sender 与 NetworkClient', 'Sender 周期调用 ready 找出可发送节点，把批次转成 Produce 请求交给 NetworkClient，再 poll 网络并处理响应；max.in.flight.requests.per.connection 限制每连接在途请求数。网络抖动时在途批次占用缓冲，buffer.memory 不足又反过来阻塞调用线程。源码锚点应从 Sender.runOnce 进入 accumulator.drain 与 client.poll，验证时对照 in-flight 指标和异常回调，确认请求确实进入网络，并在断网后核实每个在途批次的最终状态。', '发送循环受连接窗口约束', {"title":"Sender 与 NetworkClient","language":"properties","code":"bootstrap.servers=kafka1:9092\nacks=all\nmax.in.flight.requests.per.connection=5\nrequest.timeout.ms=3000\ndelivery.timeout.ms=10000\nenable.idempotence=true\n# 断网五秒后恢复，核对在途请求、重试与最终回调\ntc qdisc add dev eth0 root netem loss 100%\nsleep 5\ntc qdisc del dev eth0 root netem","output":"NetworkClient: Node 1 disconnected\nSender: Retrying batch for partition events.v1-1\ncallback error=null, attempts=2\n连接恢复后在途请求归零，批次完成或明确失败"}],
      ['缓冲耗尽的失败边界', '当 producer 发送速度高于 broker 接收或网络恢复速度，累积批次会耗尽 buffer.memory，send 最多等待 max.block.ms，随后抛出缓冲区超时。此错误发生在客户端入队阶段，消息未必到 broker；盲目重试同一条可能造成重复。验证应先重放回调失败事件，检查 buffer-available-bytes 与 broker 错误，再决定退避、增大缓冲或降低生产速率。', '入队超时不等于已落盘', {"title":"缓冲耗尽的失败边界","language":"java","code":"Properties p = new Properties();\np.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, \"kafka1:9092\");\np.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 32768);\np.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 1000);\np.put(ProducerConfig.LINGER_MS_CONFIG, 10000);\ntry (var producer = new KafkaProducer<String, byte[]>(p,\n    new StringSerializer(), new ByteArraySerializer())) {\n  for (int i = 0; i < 10000; i++) {\n    producer.send(new ProducerRecord<>(\"events.v1\", new byte[4096]));\n  }\n}","output":"org.apache.kafka.common.errors.TimeoutException:\nFailed to allocate memory within the configured max blocking time 1000 ms.\n此时消息可能尚未进入 broker，不能直接声明写入成功"}],
      ['参数对照实验', '固定消息大小与条数，第一组 linger.ms=0、batch.size=16KB，第二组 linger.ms=10、batch.size=64KB，逐轮记录 batch-size-avg、compression-rate、request-rate 和 p99 回调延迟。单次压测结果会被 broker 磁盘和网络波动污染，应至少重复三轮；若只改多项参数，就无法指出收益来自等待聚合还是压缩格式。验证结论应给出适用流量边界与不适用条件，同时保留机器规格、消息分布和压缩方式以便复测。', '一次只解释一个变量', {"title":"参数对照实验","language":"bash","code":"for cfg in fast-batch slow-batch; do\n  kafka-producer-perf-test.sh --topic events.v1 \\\n    --producer.config \"$cfg.properties\" --num-records 300000 \\\n    --record-size 1024 --throughput -1 > \"$cfg.out\"\ndone\npaste <(grep -E 'records/sec|Avg latency' fast-batch.out) \\\n      <(grep -E 'records/sec|Avg latency' slow-batch.out)","output":"fast-batch: 154000 records/sec  Avg latency: 2.8 ms\nslow-batch: 91000 records/sec   Avg latency: 4.1 ms\n相同 broker 条件下，仅 batch 与 linger 参数不同"}],
    ],
  },
  {
    name: m1Name('acks、幂等、重试与事务'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已能读懂 producer 回调与 leader 副本关系，知道 ISR 和 min.insync.replicas 的含义。',
    goal: '能区分 acks、重试、幂等 producer 与 Kafka 事务各自解决的失败，并设计 read_committed 消费边界。',
    guidedPractice: '分别使用 acks=1 与 acks=all、min.insync.replicas=2 写入，再停止副本观察回调错误；随后启用 enable.idempotence 并复制一条重试日志，最后运行一次 begin/commit 事务并用 read_committed 消费验证。',
    independentPractice: '为一个订单加支付事件设计生产者方案，说明业务唯一键、幂等序列、交易超时、read_committed 消费和外部数据库写入之间仍需哪些去重机制。',
    commonErrors: [
      '认为 acks=all 就等于 exactly-once，忽略重复发送、消费者重放和外部副作用。',
      '开启幂等后又随意修改 max.in.flight 或未检查事务隔离，误以为所有历史重复都能消失。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Message Delivery Semantics. https://kafka.apache.org/documentation/#semantics',
      'Apache Kafka source: TransactionManager.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/TransactionManager.java',
    ],
    steps: [
      ['acks 的确认范围', 'acks=0 时客户端不等待 broker 确认，acks=1 只等 leader 写入本地日志，acks=all 还要求当前 ISR 满足 min.insync.replicas 的复制条件。确认范围越大，跨机器耐久性越强但延迟和不可用窗口也越明显；leader 收到后很快掉线时，acks=1 可能丢失尚未复制的数据。验证应同时记录回调码和 describe 的 isr，不能只比较单次延迟与表面吞吐。', '确认范围是耐久性选择', {"title":"acks 的确认范围","language":"bash","code":"for acks in 0 1 all; do\n  kafka-producer-perf-test.sh --topic acks-demo \\\n    --num-records 10000 --record-size 256 --throughput 1000 \\\n    --producer-property acks=$acks \\\n    --producer-property delivery.timeout.ms=5000\ndone","output":"acks=0: 10000 records sent, 998.2 records/sec\nacks=1: 10000 records sent, 987.5 records/sec\nacks=all: 10000 records sent, 952.1 records/sec"}],
      ['重试与未知结果', '网络超时、leader 切换和可重试 broker 错误会触发重试，但客户端可能无法判断上一次 Produce 是否已在 broker 落盘，于是产生重复风险。retries 与 delivery.timeout.ms 限制总尝试窗口，request.timeout.ms 控制单请求等待；无限延长会卡住业务线程。验证应人为断开响应并检查回调状态，再根据业务唯一键识别同一条逻辑事件。', '超时后结果可能未知', {"title":"重试与未知结果","language":"java","code":"producer.send(record, (metadata, error) -> {\n  if (error == null) {\n    ledger.markConfirmed(record.value(), metadata.offset());\n  } else if (error instanceof TimeoutException) {\n    ledger.markUnknown(record.value(), error.getMessage());\n  } else {\n    ledger.markFailed(record.value(), error);\n  }\n});\nproducer.flush();\nledger.awaitUnknownDecisions(Duration.ofSeconds(15));","output":"confirmed=998 unknown=2 failed=0\nunknown 记录通过 eventId 查询 broker：\n2 条中 1 条已落盘，1 条未落盘；业务按唯一键重放"}],
      ['幂等 producer 序列', 'enable.idempotence=true 让 producer 获得 producerId 与 epoch，并按 partition 方向给记录分配序列号，broker 可识别同一次发送的重试并避免重复追加。开启后客户端会约束相关 acks 与在途请求配置；若 producer 重启，新会话序列状态重建，幂等只覆盖 Kafka 写入而非外部数据库副作用。验证可查看幂等启用配置和 broker 返回，而非只看应用日志。', '幂等只守代理端追加', {"title":"幂等 producer 序列","language":"properties","code":"enable.idempotence=true\nacks=all\nretries=2147483647\nmax.in.flight.requests.per.connection=5\n# 启动后查看 producer id 与 epoch，并注入一次响应丢失\nlogging.level.org.apache.kafka.clients.producer=DEBUG","output":"[Producer clientId=producer-1] Found no producerId\n[Producer clientId=producer-1] ProducerId set to 2401 with epoch 0\nbroker 对重复 batch 的序列号去重，offset 只推进一次"}],
      ['Kafka 事务边界', '带 transactional.id 的 producer 先 initTransactions，再 beginTransaction 写多个分区，commitTransaction 把结果原子标记为已提交，abortTransaction 则让 read_committed 消费者跳过这些记录。消费者 isolation.level=read_committed 只能看到已提交事务，未提交记录会增加 last stable offset。若事务超时或 coordinator 不可达，验证必须记录 abort 与重试，检查 read_committed 的可见位置，而不是把 begin 成功当业务提交，同时核对事务标记与业务结果。', '事务保护 Kafka 内原子可见', {"title":"Kafka 事务边界","language":"java","code":"Properties p = new Properties();\np.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, \"kafka1:9092\");\np.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, \"orders-tx-1\");\np.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, \"true\");\ntry (var producer = new KafkaProducer<String, String>(p,\n    new StringSerializer(), new StringSerializer())) {\n  producer.initTransactions();\n  producer.beginTransaction();\n  producer.send(new ProducerRecord<>(\"orders.v1\", \"ORDER-42\", \"paid\"));\n  producer.send(new ProducerRecord<>(\"audit.v1\", \"ORDER-42\", \"paid\"));\n  producer.commitTransaction();\n}","output":"initTransactions completed\nTransaction orders-tx-1 committed two records\nread_committed 消费者同时看到两个主题记录\nread_uncommitted 在提交前可见，但不能作为业务完成依据"}],
      ['组合方案验收', '订单消息写入 Kafka 与数据库扣款是两个系统，Kafka 事务无法自动回滚 SQL；常见方案是本地事务加 Outbox，再由幂等 producer 投递，消费端以事件 ID 去重。开启 read_committed 只证明跳过未提交记录，不证明外部副作用只执行一次。验收要注入 producer 重试和 consumer 崩溃，最终核对订单状态、数据库唯一键和 Kafka committed offset 三者一致。', '跨系统仍要靠业务约束', {"title":"组合方案验收","language":"sql","code":"BEGIN;\nUPDATE orders SET status = 'paid' WHERE id = 'ORDER-42';\nINSERT INTO outbox(id, topic, message_key, payload)\nVALUES ('ORDER-42:paid:1', 'orders.v1', 'ORDER-42', '{\"status\":\"paid\"}');\nCOMMIT;\n-- 投递器读取 outbox，发送后在同一事务标记 published_at，\n-- 消费端用 message_key + event_id 唯一键吸收重复。\nSELECT id, published_at FROM outbox WHERE id = 'ORDER-42:paid:1';","output":"UPDATE 1\nINSERT 0 1\nCOMMIT\n投递成功 published_at=2026-11-24 10:00:03\n消费端 count=1；重试后 count 仍为 1"}],
    ],
  },
  {
    name: m1Name('Fetcher、订阅状态和位移提交'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能解释 consumer poll、position 与 committed offset，并会使用 kafka-consumer-groups.sh --describe。',
    goal: '能从 Fetcher 的拉取请求走到订阅状态和位移管理，解释 fetch session、拉取上限和 dispatch 顺序如何影响消费吞吐。',
    guidedPractice: '在 KafkaConsumer 源码中跟踪 pollOnce、updateAssignmentMetadataIfNeeded 与 Fetcher.sendFetches 的调用方向，同时抓取 max.partition.fetch.bytes 调整前后的 poll 记录数与处理耗时。',
    independentPractice: '独立构造单分区大记录和多分区小记录两种负载，分别调整 fetch 配置并提交一份证据，说明瓶颈在网络请求数、单条大小还是业务处理。',
    commonErrors: [
      '把 max.poll.records 当作 broker 单次返回上限，不知道 broker 仍受 fetch 字节参数约束。',
      '提交 offset 后立即丢弃处理结果记录，后续失败时无法证明哪条业务消息已被消费。',
    ],
    sourceRefs: [
      'Apache Kafka source: Fetcher.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/consumer/internals/Fetcher.java',
      'Apache Kafka Documentation: Consumer Configs. https://kafka.apache.org/documentation/#consumerconfigs',
    ],
    steps: [
      ['订阅状态与分配', 'KafkaConsumer.subscribe 先登记 topic 模式，Coordinator 完成组成员协商后由 SubscriptionState 保存实际 assignment；assign 则绕过组协调直接指定分区。前者会随 rebalance 改变分区，后者由应用承担全部分配责任。订阅状态还保存 position、paused 与 fetch 选项，定位问题时不能只看构造参数。验证应打印 assignment 与 position，并保留 poll 前后实际变化，同时确认撤销分区后位置未被错误重置。', '订阅与手写分配不同', {"title":"订阅状态与分配","language":"java","code":"KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);\nconsumer.subscribe(List.of(\"events.v1\"), new ConsumerRebalanceListener() {\n  public void onPartitionsRevoked(Collection<TopicPartition> parts) {\n    log.info(\"revoked {}\", parts);\n  }\n  public void onPartitionsAssigned(Collection<TopicPartition> parts) {\n    log.info(\"assigned {}\", parts);\n  }\n});\nconsumer.poll(Duration.ofMillis(200));\nlog.info(\"assignment={} positions={}\", consumer.assignment(),\n    consumer.assignment().stream().collect(Collectors.toMap(x -> x, consumer::position)));","output":"assigned [events.v1-0, events.v1-1]\nassignment=[events.v1-0, events.v1-1]\npositions={events.v1-0=42, events.v1-1=18}"}],
      ['Fetcher 拉取循环', 'poll 期间 Fetcher 根据 position、fetch 配置与已暂停分区组装 Fetch 请求，broker 返回记录、高水位与分区状态，客户端再按分区放入待处理队列。fetch.min.bytes 和 fetch.max.wait.ms 控制 broker 等待，fetch.max.bytes 与 max.partition.fetch.bytes 限制响应规模；大 record 仍可能超限。验证要记录请求时间与 returned records，并对照业务处理耗时，不能把业务处理慢误归因于 broker，还要记录高水位、位置和完成数差异。', '拉取受时间与字节共同限制', {"title":"Fetcher 拉取循环","language":"bash","code":"docker exec kafka1 kafka-console-consumer.sh --bootstrap-server kafka1:9092 \\\n  --topic events.v1 --group fetch-lab --from-beginning \\\n  --consumer-property fetch.max.bytes=4096 \\\n  --consumer-property max.partition.fetch.bytes=2048 \\\n  --consumer-property max.poll.records=10 \\\n  --consumer-property fetch.max.wait.ms=500 --timeout-ms 10000","output":"poll returned 10 records, bytes=1948\nprocessed 10 records in 31ms\n下一轮 position 前进 10，无跨分区全局顺序假设"}],
      ['fetch session 复用', 'Kafka 使用增量 FetchSession 让后续请求只携带变化分区，减少订阅很多 topic 时的请求体积；metadata 版本变化或缓存失效会触发完整请求。max.in.flight.requests.per.connection 对 consumer 默认较小，避免多个响应乱序写入同一 position。若频繁出现完整 fetch 或 session 失效，应检查元数据更新与分区数量，而不是盲目提高 fetch.max.bytes 掩盖元数据抖动，并保存完整请求出现频率。', '会话复用降低元数据成本', {"title":"fetch session 复用","language":"properties","code":"logging.level.org.apache.kafka.clients.consumer.internals.Fetcher=DEBUG\nlogging.level.org.apache.kafka.clients.consumer.internals.FetchSessionHandler=DEBUG\nmetadata.max.age.ms=30000\nfetch.max.bytes=52428800\nmax.partition.fetch.bytes=1048576","output":"Sending incremental Fetch request for 6 partitions\nFetch session 9 received response with 6 partitions\nmetadata 更新时才出现 full fetch，稳定轮询没有重复发送全量分区"}],
      ['position 与 commit 分离', 'position 是客户端下一次 fetch 的位置，committed offset 是写回组协调者的可恢复位置；auto.commit.interval.ms 只决定自动提交频率，处理耗时超过间隔时仍可能提交到处理未完成的位置。commitSync 在提交成功后返回，commitAsync 需要回调处理失败且通常不应在回调内同步重试。验证应同时记录 position、committed 与业务事务完成数，并核对失败提交后的重试路径。', '本地进度不等于可恢复进度', {"title":"position 与 commit 分离","language":"java","code":"while (running) {\n  ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));\n  for (var record : records) {\n    business.applyOnce(record);\n  }\n  if (!records.isEmpty()) {\n    consumer.commitSync();\n    log.info(\"position={} committed={}\", consumer.position(records.partitions().iterator().next()),\n        consumer.committed(records.partitions().iterator().next()));\n  }\n}","output":"position=events.v1-0:58 committed=events.v1-0:57\n业务事务提交成功后才推进 committed\n进程崩溃会从 57 重读，唯一键阻止重复副作用"}],
      ['分发顺序与暂停边界', 'Fetcher 返回按分区有序的数据，但多分区完成记录经 CompletedFetch 分发后，应用看到的是分区内部有序、分区之间交错。暂停某分区只停止新 fetch，不自动清理已返回记录；若在处理逻辑中按全局顺序假设，就会得到错误判断。验证可暂停一个分区继续生产，确认 position 不动且其他分区前进，再恢复后观察 backlog。', '暂停不等于回滚位置', {"title":"分发顺序与暂停边界","language":"java","code":"TopicPartition p0 = new TopicPartition(\"events.v1\", 0);\nconsumer.assign(List.of(p0, new TopicPartition(\"events.v1\", 1)));\nconsumer.poll(Duration.ofMillis(100));\nconsumer.pause(List.of(p0));\nvar before = consumer.position(p0);\nvar next = consumer.poll(Duration.ofSeconds(1));\nlog.info(\"paused-position={} after={} records={}\", before,\n    consumer.position(p0), next.records(p0).size());\nconsumer.resume(List.of(p0));","output":"paused-position=events.v1-0:120 after=120 records=0\n同一轮 poll 中 partition 1 继续前进\n恢复后从 120 重新拉取，已返回缓存不自动回滚"}],
    ],
  },
  {
    name: m1Name('ConsumerCoordinator 与 rebalance'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已完成消费组与位移课时，能读懂 group member、assignment 和 lag 输出。',
    goal: '能解释 FindCoordinator、JoinGroup、SyncGroup 与心跳循环，区分会话超时、处理超时和 cooperative rebalance 的不同故障边界。',
    guidedPractice: '启动两个消费者后滚动重启其中一个，抓取 rebalance 日志中的 generationId、memberId 和 assigned partitions，并结合 group describe 与 JMX 指标画出一次完整再平衡时间线。',
    independentPractice: '独立比较 eager 与 cooperative 分配器在实例滚动重启时的停顿和撤销范围，为订单消费者配置心跳、会话和处理超时并写出容量依据。',
    commonErrors: [
      '把 session.timeout.ms 与 max.poll.interval.ms 混为一谈，忽略后者由业务处理速度决定。',
      '消费者处理线程阻塞导致 poll 停止，却只增加心跳线程参数，最终分区被协调者收回。',
    ],
    sourceRefs: [
      'Apache Kafka source: ConsumerCoordinator.java. https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/consumer/internals/ConsumerCoordinator.java',
      'Apache Kafka Documentation: Consumer Configs. https://kafka.apache.org/documentation/#consumerconfigs',
    ],
    steps: [
      ['协调者发现与加入组', 'consumer 先通过 FindCoordinator 定位 group 对应的 broker，再发送 JoinGroup 声明协议和元数据；协调者选一个成员作为 leader，leader 计算 assignment 并通过 SyncGroup 返回给所有成员。generationId 每次成功再平衡递增，旧 generation 的心跳和提交会被拒绝。验证应从客户端日志抓取 generationId 与 memberId，若只看到 CoordinatorNotAvailable，先查协调者迁移、组状态与分区分配而非业务代码，并关联心跳超时记录。', '加入与同步是两步协商', {"title":"协调者发现与加入组","language":"properties","code":"logging.level.org.apache.kafka.clients.consumer.internals.ConsumerCoordinator=DEBUG\ngroup.id=order-workers\ngroup.instance.id=order-worker-a\nsession.timeout.ms=10000\nheartbeat.interval.ms=3000\n# 启动消费者后抓取 FindCoordinator、JoinGroup、SyncGroup 与 generation\njava -jar consumer-demo.jar","output":"Discovered coordinator kafka2:9092 for group order-workers\nJoinGroup response MemberId=consumer-a-...\nSuccessfully joined group with generation 12\nReceived assignment [events.v1-0, events.v1-1]"}],
      ['心跳与会话超时', '后台心跳维持成员存活，session.timeout.ms 规定协调者多久没听到心跳就移出成员，heartbeat.interval.ms 应显著小于会话超时以容忍网络抖动。心跳线程健康不代表业务线程已处理完 poll 返回记录；把会话超时设得极短会让 GC 或网络停顿直接触发误踢。验证可在消费者暂停一次心跳并观察组成员消失时间和分区迁移。', '心跳存活只证明线程在线', {"title":"心跳与会话超时","language":"bash","code":"PID=$(jps -l | awk '/consumer-demo/{print $1}')\nkill -STOP \"$PID\"\nsleep 15\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group order-workers --members\nkill -CONT \"$PID\"","output":"consumer-a 在 10.2 秒后被移出成员列表\n剩余 consumer-b 接收 events.v1-0\n进程恢复后重新 JoinGroup，generation 从 12 变为 13"}],
      ['poll 处理超时', 'max.poll.interval.ms 从一次 poll 返回开始计算，到下一次 poll 调用超过阈值即表示处理循环失约，协调者会发起再平衡。批量写数据库、同步 HTTP 或人工断点在循环内执行都可能突破边界；应缩小 max.poll.records 或把耗时任务拆异步并确认消费语义。验证记录每轮处理耗时 p99 与分区撤销日志，不能只看平均耗时。', '业务停顿也会触发再平衡', {"title":"poll 处理超时","language":"java","code":"var props = Map.of(\n    ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, \"kafka1:9092\",\n    ConsumerConfig.GROUP_ID_CONFIG, \"poll-lab\",\n    ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, \"5000\",\n    ConsumerConfig.MAX_POLL_RECORDS_CONFIG, \"20\");\nwhile (true) {\n  var records = consumer.poll(Duration.ofMillis(500));\n  Thread.sleep(8000);\n  consumer.commitSync();\n}","output":"poll returned 20 records\n8 秒后才再次 poll，超过 max.poll.interval.ms=5000\nCoordinator 记录 member exceeded max poll interval，分区被撤销"}],
      ['eager 与 cooperative', 'eager 分配器先撤销全部分区再重新分配，期间整组暂停；cooperative 分配器只撤销需要迁移的分区，其他分区继续消费。partition.assignment.strategy 决定客户端协商结果，混用不同策略可能回退到共同支持项。验证滚动重启时应记录每轮 revoked 与 assigned，cooperative 下不应出现所有分区同时停顿，并对照重启前后 lag。', '再平衡范围取决于协议', {"title":"eager 与 cooperative","language":"properties","code":"partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor\ngroup.id=order-workers\nmax.poll.records=50\n# 滚动启动 consumer-b，抓取 revoked 与 assigned 日志\njava -jar consumer-demo.jar --instance=b","output":"consumer-b joins generation 14\nconsumer-a revoked [events.v1-1]\nconsumer-a 继续处理 events.v1-0\nconsumer-b assigned [events.v1-1]，整组未同时暂停"}],
      ['再平衡故障演练', '人为让一个 consumer 阻塞超过 max.poll.interval.ms，观察 group describe 的状态变化与剩余成员接管；恢复后检查重复消费窗口和提交 generation 错误。业务侧应在分区撤销回调中同步持久化可恢复状态，避免迁移时丢批次。验收要同时包含分区正确转移、无越界提交和重复事件可幂等处理三项证据。', '撤销回调承担交接责任', {"title":"再平衡故障演练","language":"bash","code":"docker compose start consumer-b\nsleep 2\ndocker compose stop consumer-b\nsleep 2\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group order-workers\ndocker exec kafka2 sh -lc 'grep -E \"rebalance|generation\" /var/log/kafka/server.log | tail -10'","output":"Preparing to rebalance group order-workers\nMember consumer-b has left group\nPartition 1 从 consumer-b 转移到 consumer-a\n提交 generation 不匹配的 pending offset 被拒绝并重试"}],
    ],
  },
  {
    name: m1Name('UnifiedLog、ReplicaManager、ISR 和高水位'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已完成 Kafka 复制拓扑课时，理解 LEO、leader、follower 与 partition 日志目录。',
    goal: '能沿 UnifiedLog append、ReplicaManager 复制与 ISR 更新解释高水位，判断消费者可见位置和故障转移可能丢数据的边界。',
    guidedPractice: '固定一个 Kafka 源码 tag，在 UnifiedLog.append、Partition.appendRecordsToLeader、ReplicaManager.fetchMessages 与 updateAssignmentAndISR 中标注调用方向，再把 describe 和 JMX 指标对应到日志位置。',
    independentPractice: '独立构造 follower 落后、ISR 收缩和 leader 切换三种场景，记录 LEO、高水位、消费者可见 slot 与恢复后的副本追赶过程。',
    commonErrors: [
      '把 leader 的 LEO 直接当成消费可见位置，忽略高水位会落后于尚未复制完成的日志。',
      '把 ISR 当成永久成员列表，不知道 follower 落后或失联后会收缩，恢复后还需要追平。',
    ],
    sourceRefs: [
      'Apache Kafka source: UnifiedLog.scala. https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/log/UnifiedLog.scala',
      'Apache Kafka source: ReplicaManager.scala. https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/server/ReplicaManager.scala',
    ],
    steps: [
      ['UnifiedLog 追加与 LEO', 'leader 的 UnifiedLog.append 把记录 batch 分配给 offset 区间并追加到当前 active segment，log-end-offset 指向下一条可写位置，物理写入成功不自动等于可被普通消费者读取。源码中 append 还要维护 producer 状态、时间索引和 leader epoch；任何大小或 CRC 校验失败应在写入前拒绝。验证应比较 append 返回区间、目录文件大小和 broker 的 log-end-offset 指标，再核对消费者可见位置。', '写入末尾不是消费上界', {"title":"UnifiedLog 追加与 LEO","language":"bash","code":"docker exec kafka1 kafka-get-offsets.sh --bootstrap-server kafka1:9092 \\\n  --topic events.v1 --time -1\ndocker exec kafka1 sh -lc 'ls -l /var/lib/kafka/data/events.v1-0/;\ndu -b /var/lib/kafka/data/events.v1-0/*.log'\ndocker exec kafka1 kafka-log-dirs.sh --bootstrap-server kafka1:9092 --describe","output":"events.v1:0:120\nevents.v1:1:42\n00000000000000000000.log bytes=48210\nclone.log offsetLag=0；LEO=120，普通消费者可见位置需再看高水位"}],
      ['ReplicaManager 复制路径', 'follower 周期向 leader 发送 Fetch 请求，ReplicaManager 从本地 log 读取并返回数据；follower 追加后推进自己的 LEO，再在后续请求报告已复制位置。leader 据此计算每个副本的 log-end-offset 并决定高水位，复制不是广播推送到所有 follower。验证可用副本 fetch 指标和 describe 的 isr 观察落后副本，不能只凭网络连通或进程存活判断数据已复制。', '副本通过拉取追赶 leader', {"title":"ReplicaManager 复制路径","language":"bash","code":"docker exec kafka2 sh -lc 'grep -E \"Fetch request from replica|AppendRecords\" \\\n  /var/log/kafka/server.log | tail -20'\ndocker exec kafka1 kafka-topics.sh --bootstrap-server kafka1:9092 \\\n  --describe --topic events.v1 | head -5","output":"Fetch request from replica 3 with fetchOffset 115\nAppendRecords to partition events.v1-0, current leader epoch 4\nPartition: 0 Leader: 1 Replicas: 1,2,3 Isr: 1,2,3"}],
      ['ISR 收缩与恢复', 'follower 在 replica.lag.time.max.ms 内未追上 leader 或因故障无法请求时，controller 可将其移出 ISR；写入是否继续取决于 acks 与 min.insync.replicas。恢复后的 follower 先追到 leader 当前 LEO，再重新进入 ISR，期间普通消费者仍只能读到高水位以内记录。验证要保存 ISR 变化时间与副本 LEO，不能把重新连接直接当成数据一致或副本已追平，还要在追平后再次对比高水位。', 'ISR 是动态复制集合', {"title":"ISR 收缩与恢复","language":"bash","code":"docker compose pause kafka3\nsleep 15\ndocker exec kafka1 kafka-topics.sh --bootstrap-server kafka1:9092 \\\n  --describe --topic events.v1\ndocker compose unpause kafka3\nsleep 20\ndocker exec kafka1 kafka-topics.sh --bootstrap-server kafka1:9092 \\\n  --describe --topic events.v1","output":"Isr: 1,2\nreplica 3 removed from ISR\n恢复后 follower 追到 LEO=128\nIsr: 1,2,3，副本末位置与 leader 一致"}],
      ['高水位的消费边界', '高水位表示已被所有 ISR 副本复制到的位置，普通消费者通常只能看到高水位以下记录；leader LEO 可能更大，因此 broker 磁盘有数据时客户端也可能暂时读不到。read_committed 还会受 last stable offset 约束，未完成事务会进一步限制可见范围。验证应在低流量环境中对比 LEO、高水位和 consumer position，明确差值来自复制还是事务。', '可见位置受复制与事务限制', {"title":"高水位的消费边界","language":"bash","code":"docker exec kafka1 kafka-get-offsets.sh --bootstrap-server kafka1:9092 \\\n  --topic events.v1 --time -1\ndocker exec kafka1 kafka-get-offsets.sh --bootstrap-server kafka1:9092 \\\n  --topic events.v1 --time -2\ndocker exec kafka1 kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group read-committed --offsets","output":"LOG-END-OFFSET 128\n起始可见 offset 13\nread_committed CURRENT-OFFSET 125\n差值来自复制进度或未完成事务，不可直接判定消息丢失"}],
      ['故障切换与 unclean 边界', '正常 leader 切换从 ISR 中选新 leader，可保留已提交到全体 ISR 的日志；若允许 unclean.leader.election，落后副本也可能成为 leader，未复制数据会被截断。生产环境要同时固定 min.insync.replicas、unclean 开关和 acks，并用受控 broker 下线验证 leader epoch 与日志截断日志。只恢复进程而不检查副本偏移和业务唯一键，无法证明切换没有丢数据，同时还要核对每个分区的末位置。', '选举策略决定数据代价', {"title":"故障切换与 unclean 边界","language":"bash","code":"docker exec kafka1 kafka-configs.sh --bootstrap-server kafka1:9092 \\\n  --alter --entity-type topics --entity-name events.v1 \\\n  --add-config unclean.leader.election.enable=false\ndocker compose stop kafka1\ndocker exec kafka2 kafka-topics.sh --bootstrap-server kafka2:9092 \\\n  --describe --topic events.v1\ndocker compose start kafka1","output":"Partition: 0 Leader: 2 Replicas: 1,2,3 Isr: 2,3\n新 leader 从 ISR 选出\n旧 leader 恢复后先截断未提交尾部，再追赶 ISR\n故障前后业务唯一键对账无丢失"}],
    ],
  },
];

const m2Stage = 'Redis 数据结构、事件循环与持久化';
const m2Name = (topic: string) => `中间件源码 · ${m2Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m2Name('事件循环与单线程命令模型'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已理解文件描述符、阻塞与非阻塞 IO，能在本地运行 redis-server 与 redis-cli。',
    goal: '能沿 ae.c 的事件循环解释 Redis 命令串行执行、网络读写和定时事件，并用 slowlog 与命令延迟证明阻塞边界。',
    guidedPractice: '启动单实例 Redis，执行 redis-cli monitor 另开终端发送 SET、GET、KEYS 与 SLEEP 类阻塞命令，观察 slowlog get、INFO commandstats 和 PING 延迟变化。',
    independentPractice: '独立构造大 key 扫描与普通 GET 两种负载，记录主线程阻塞期间延迟、slowlog 条目与客户端缓冲增长，并给出把重操作移出在线链路的方案。',
    commonErrors: [
      '把网络 IO 多线程或后台线程当成命令也并行执行，忽略数据修改仍在主线程串行完成。',
      '在生产路径执行 KEYS、全量 HGETALL 或超大 Lua 脚本，导致所有客户端共享同一次长阻塞。',
    ],
    sourceRefs: [
      'Redis source: src/ae.c. https://github.com/redis/redis/blob/unstable/src/ae.c',
      'Redis Documentation: Latency troubleshooting. https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/',
    ],
    steps: [
      ['ae 事件循环骨架', 'Redis 的 aeMain 循环调用 aeProcessEvents，先按最近定时事件计算 wait 时间，再处理已就绪的文件事件与时间事件。ae.c 把 epoll、kqueue 等后端抽象为统一事件表，网络连接可读可写并不等于命令并行；验证可在高并发客户端下查看 INFO clients 与命令延迟。若只根据线程数推断并发，会错判 KEYS 这类长命令的全局影响。', '就绪事件进入同一循环', {"title":"ae 事件循环骨架","language":"bash","code":"git clone --depth 1 https://github.com/redis/redis.git redis-src\ncd redis-src\nrg -n \"aeMain|aeProcessEvents|aeApiPoll|processTimeEvents\" src/ae.c\nsed -n '540,610p' src/ae.c","output":"src/ae.c:548:void aeMain(aeEventLoop *eventLoop)\nsrc/ae.c:553:aeProcessEvents(eventLoop, AE_ALL_EVENTS)\nsrc/ae.c:597:numevents = aeApiPoll(eventLoop, tvp)\n所有就绪文件事件在同一个循环里处理"}],
      ['命令解析与客户端缓冲', '客户端数据先进入 query buffer，解析器按 RESP 边界拆出命令，执行结果写入 reply buffer 并在可写事件中回送；单个连接输出积压会消耗内存。CLIENT LIST 的 qbuf 与 omem 字段可分别观察输入和输出压力，CLIENT OUTPUT LIMIT 可触发强制断开。若只查 used_memory，不区分客户端缓冲和大数据结构，会误认为缓存本身泄漏，并错过异常连接。', '连接内存也要单独观测', {"title":"命令解析与客户端缓冲","language":"bash","code":"redis-cli CLIENT LIST\nredis-cli INFO clients\nredis-cli CONFIG GET client-output-buffer-limit\nredis-cli CLIENT SETNAME cache-lab","output":"id=8 addr=127.0.0.1:53022 name= qbuf=0 qbuf-free=20448 omem=0\nconnected_clients:3\nnormal 0 0 0\nslave 268435456 67108864 60"}],
      ['串行命令与阻塞边界', 'Redis 主线程一次执行一条命令，普通 GET/SADD 很快返回，而 KEYS、FLUSHALL、大 ZUNIONSTORE 或长 Lua 会占住事件循环，期间其他连接只能等待。slowlog-log-slower-than 只记录执行时间超阈值的命令，不记录网络排队全部时间；验证应关联 slowlog、PING 延迟和 event loop 指标。边界是阻塞越久，客户端超时与复制延迟越容易同时出现，必须保留同一时间窗的旁路探测。', '一条慢命令拖慢所有连接', {"title":"串行命令与阻塞边界","language":"bash","code":"redis-cli --latency-history -i 1 > latency.log &\nredis-cli SET load:ready 1\nredis-cli KEYS '*'\nredis-cli SLOWLOG GET 5\nredis-cli PING","output":"latency: 0.31ms, 0.42ms, 18.7ms, 22.1ms\nPONG\nslowlog entry command=KEYS duration=17 us\n命令执行期间其他连接在事件循环中排队"}],
      ['阻塞命令的挂起机制', 'BLPOP、WAIT 等命令不会在主线程里忙等，而是把客户端挂起到条件满足或超时，随后事件循环继续服务其他连接。它们仍会占用连接与客户端对象，长时间不释放会消耗连接配额；验证用 CLIENT LIST 查看 flags 与 idle，并用超时参数确认客户端返回路径。若把阻塞命令当零成本，连接数升高时会出现资源耗尽而非 CPU 满载。', '挂起释放 CPU 不释放连接', {"title":"阻塞命令的挂起机制","language":"bash","code":"redis-cli DEL jobs:queue\nredis-cli BLPOP jobs:queue 5\nredis-cli CLIENT LIST | rg 'cmd=blpop|flags=b'\nredis-cli LPUSH jobs:queue job-42\nredis-cli LRANGE jobs:queue 0 -1","output":"第一终端阻塞等待 jobs:queue\nCLIENT LIST 显示 cmd=blpop flags=b\nLPUSH 后返回 [\"jobs:queue\",\"job-42\"]\n第二终端确认队列已为空"}],
      ['延迟实验与修复', '用 redis-cli --latency 建立基线，持续发送 KEYS * 并记录 p99 与 slowlog，再改为 SCAN 游标分批读取，确认延迟峰值下降。SCAN 只保证有限阶段内不阻塞，不保证快照一致性，业务还需处理重复与遗漏边界。验收应保留慢命令、PING 峰值、修改命令和结果正确性四组证据，而不是只写改用 SCAN，还应记录每批扫描数量。', 'SCAN 降低单次停顿', {"title":"延迟实验与修复","language":"bash","code":"redis-cli FLUSHDB\nfor i in $(seq 1 200000); do redis-cli SET \"k:$i\" \"$i\" >/dev/null; done\n/usr/bin/time -f 'KEYS %e s' redis-cli KEYS 'k:*' >/dev/null\nredis-cli --scan --pattern 'k:*' --count 100 | wc -l\nredis-cli --latency-history -i 1","output":"KEYS 1.84 s\nSCAN 分多轮返回 200000 行，单轮受 COUNT 建议约束\nKEYS 期间 PING 峰值超过 1.5s，SCAN 峰值显著降低"}],
    ],
  },
  {
    name: m2Name('dict、listpack、zset 与编码转换'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '会使用 TYPE、OBJECT ENCODING 与 MEMORY USAGE，理解 Redis 键值都指向堆上对象。',
    goal: '能解释 hash 表增量 rehash、listpack 紧凑布局和 zset 双结构切换，并依据 OBJECT ENCODING 与内存数据选择集合编码。',
    guidedPractice: '创建小 hash、小 zset 与小 list，逐一打印 OBJECT ENCODING，再按配置阈值追加元素触发 listpack 到 hashtable 或 skiplist 的转换，记录元素数、内存与命令耗时。',
    independentPractice: '独立为排行榜和字典缓存选择结构，分别构造一万成员 zset 与一万字段 hash，比较 MEMORY USAGE、范围查询和单点更新成本。',
    commonErrors: [
      '以为小集合始终用 listpack，不知道条目数或元素长度超过阈值会转换编码。',
      '把 HGETALL 当成适合任意规模对象的安全读取，忽略编码转换后大字典遍历仍会阻塞主线程。',
    ],
    sourceRefs: [
      'Redis source: src/dict.c. https://github.com/redis/redis/blob/unstable/src/dict.c',
      'Redis Documentation: Redis data types and encodings. https://redis.io/docs/latest/develop/data-types/',
    ],
    steps: [
      ['dict 增量 rehash', 'Redis 字典用两个哈希表承载键值，扩容或缩容时不是一次搬迁全部桶，而是在操作中逐步把旧桶迁移到新表，rehashidx 标记进度。dict.c 的 dictRehash 每次只处理有限桶，避免单次翻倍造成长停顿；负载因子与暂停 rehash 状态影响内存。验证可用 OBJECT ENCODING 与 INFO memory 观察大 hash 转换，不能仅凭条目数断言内存结构。', '迁移分摊到后续操作', {"title":"dict 增量 rehash","language":"bash","code":"redis-cli DEL cfg:big\nfor i in $(seq 1 20000); do redis-cli HSET cfg:big \"f:$i\" \"$i\" >/dev/null; done\nredis-cli OBJECT ENCODING cfg:big\nredis-cli INFO memory | rg 'used_memory_human|mem_fragmentation_ratio'\nredis-cli MEMORY USAGE cfg:big","output":"hashtable\nused_memory_human:6.42M\nmem_fragmentation_ratio:1.18\n(integer) 1328160\n大 hash 已进入 dict，容量和迁移状态可从内存指标观察"}],
      ['listpack 紧凑布局', 'listpack 把多个短元素连续编码在一块内存中，省去每个元素的独立分配与指针开销，适合小数量且短值的 hash、list 与 zset。hash-max-listpack-entries 和 hash-max-listpack-value 决定 hash 阈值，list-max-listpack-size 决定 list 边界；超过阈值会改用 dict 或 quicklist。验证应同时改数量和单值长度，确认触发原因不只是一项，并记录 OBJECT ENCODING 的变化，再保存转换前后的内存用量快照。', '紧凑结构换来遍历与分配优势', {"title":"listpack 紧凑布局","language":"bash","code":"redis-cli DEL small:hash\nredis-cli CONFIG SET hash-max-listpack-entries 128\nredis-cli CONFIG SET hash-max-listpack-value 64\nredis-cli HSET small:hash a 1 b 2 c 3\nredis-cli OBJECT ENCODING small:hash\nredis-cli HSET small:hash long \"$(printf 'x%.0s' $(seq 1 80))\"\nredis-cli OBJECT ENCODING small:hash","output":"listpack\nlistpack\nhashtable\n元素长度超过 64 字节后转换编码"}],
      ['zset 的双结构', '小 zset 可用 listpack 顺序保存成员和分值，超过 zset-max-listpack-entries 或成员长度阈值后转换为 skiplist 加分值字典：字典支持 O(1) 按成员查分，跳跃表支持有序范围与排名。ZRANGE 与 ZSCORE 的复杂度不同，排行榜规模决定是否需要分页与定期裁剪。验证可从 OBJECT ENCODING 看到转换，并用 MEMORY USAGE 对比转换前后同类数据的内存占用。', '小集合紧凑大集合有序索引', {"title":"zset 的双结构","language":"bash","code":"redis-cli DEL rank:demo\nredis-cli ZADD rank:demo 100 alice 90 bob 80 carol\nredis-cli OBJECT ENCODING rank:demo\nfor i in $(seq 1 200); do redis-cli ZADD rank:demo \"$i\" \"user:$i\" >/dev/null; done\nredis-cli OBJECT ENCODING rank:demo\nredis-cli ZRANGE rank:demo -3 -1 WITHSCORES","output":"listpack\nskiplist\nuser:198 198\nuser:199 199\nuser:200 200\n小集合转换后由 skiplist + dict 支撑排名与查分"}],
      ['编码转换边界', '编码阈值是 instance 配置，已有对象达到条目数或最长元素超限时触发转换，部分结构在元素减少后不会自动回到更紧凑编码。切换阈值前应先评估线上最大对象，而不是只按平均值设置；OBJECT ENCODING 是当前事实，不能代表历史写入。验证要记录转换前元素数、最长值、配置值与转换后内存，避免把一次大值写入误判为整体容量增长。', '达到边界后可能不再回退', {"title":"编码转换边界","language":"bash","code":"redis-cli CONFIG GET hash-max-listpack-entries\nredis-cli CONFIG GET zset-max-listpack-value\nredis-cli DEL convert:hash\nredis-cli HSET convert:hash a 1 b 2\nredis-cli HSET convert:hash oversized \"$(head -c 70 /dev/zero | tr '\\0' x)\"\nredis-cli OBJECT ENCODING convert:hash\nredis-cli HDEL convert:hash oversized\nredis-cli OBJECT ENCODING convert:hash","output":"hash-max-listpack-entries 512\nzset-max-listpack-value 64\nhashtable\nhashtable\n删除超长值后编码不会自动回退"}],
      ['结构与访问方式选型', 'hash 适合按字段更新，zset 适合按分数排名，listpack 适合小对象压缩，dict 适合大量散列字段；没有一种编码同时优化内存、单点访问和范围扫描。线上命令必须把对象规模一并记录，HGETALL、ZRANGE 0 -1 与 LRANGE 0 -1 在大结构上都会产生大回复。验证应以目标规模下的 MEMORY USAGE、命令耗时和客户端 omem 三项共同决定。', '按访问模式而非类型名选', {"title":"结构与访问方式选型","language":"bash","code":"redis-cli DEL product:1001 product:rank\nredis-cli HSET product:1001 id 1001 name phone price 5999 stock 20\nredis-cli ZADD product:rank 99.5 product:1001\nredis-cli HGET product:1001 price\nredis-cli ZREVRANGE product:rank 0 9 WITHSCORES\nredis-cli MEMORY USAGE product:1001\nredis-cli MEMORY USAGE product:rank","output":"\"5999\"\nproduct:1001 99.5\nproduct hash memory 176 bytes\nrank zset memory 96 bytes\n按字段更新用 hash，按分值排名用 zset"}],
    ],
  },
  {
    name: m2Name('过期、淘汰、内存碎片和大 key'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会读取 INFO memory、TTL 与 MEMORY USAGE，并能解释惰性删除和主动删除的差别。',
    goal: '能分析 Redis 过期扫描、maxmemory 淘汰、RSS 与分配器碎片，并定位大 key 造成的延迟与容量风险。',
    guidedPractice: '设置 maxmemory-policy allkeys-lru 与较小 maxmemory，分批写入带 TTL 的键，记录 used_memory、mem_fragmentation_ratio、evicted_keys，再用 redis-cli --bigkeys 找出大 key。',
    independentPractice: '独立构造“TTL 很多但内存未及时下降”和“单个大 list 删除卡顿”两种场景，分别用 MEMORY STATS、UNLINK 与分批删除验证处理结果。',
    commonErrors: [
      '以为设置 TTL 就会在到期瞬间释放内存，忽略过期采用惰性访问与周期扫描。',
      '只看 used_memory 排除内存问题，不区分 RSS、分配器碎片、复制缓冲与客户端输出缓冲。',
    ],
    sourceRefs: [
      'Redis Documentation: Memory optimization. https://redis.io/docs/latest/develop/tips/memory-optimization/',
      'Redis Documentation: Key eviction. https://redis.io/docs/latest/develop/reference/eviction/',
    ],
    steps: [
      ['被动与主动过期', '读取一个带 TTL 的键时会先检查过期时间，过期即删除并返回空；同时 serverCron 周期抽样过期字典，把过期键逐步清理，避免每秒遍历所有键。抽样强度与 hz 等配置影响回收速度，大量短 TTL 键可能短时间继续占内存。DEL 是同步释放，UNLINK 先把键从命名空间移除再由后台释放大对象；验证可对比过期前后 DBSIZE 与 used_memory。', '到期标记与物理释放分开', {"title":"被动与主动过期","language":"bash","code":"redis-cli SET short:ttl value PX 1000\nredis-cli PTTL short:ttl\nredis-cli DBSIZE\nsleep 2\nredis-cli EXISTS short:ttl\nredis-cli DBSIZE\nredis-cli INFO stats | rg 'expired_keys'","output":"PTTL 1000\nDBSIZE 1\nEXISTS 0\nDBSIZE 0\nexpired_keys:1"}],
      ['淘汰策略与 maxmemory', 'maxmemory 达到后按 maxmemory-policy 选择淘汰，noeviction 会让写命令返回 OOM，allkeys-lru、volatile-lru 等策略作用键集合不同，采样近似而非精确全局 LRU。淘汰只对可淘汰键生效，热缓存与持久数据混用同一实例会放大误删风险。验证应在独立测试实例写入超过上限，记录 evicted_keys 与被淘汰键类型，不能在生产实例直接压满。', '淘汰集合决定数据风险', {"title":"淘汰策略与 maxmemory","language":"bash","code":"docker run --rm -p 6380:6379 redis:7 redis-server \\\n  --maxmemory 8mb --maxmemory-policy noeviction &\nsleep 1\nredis-cli -p 6380 CONFIG GET maxmemory-policy\nredis-cli -p 6380 SET load:1 \"$(head -c 9000000 /dev/zero | tr '\\0' x)\"\nredis-cli -p 6380 INFO stats | rg 'evicted_keys|keyspace_hits'","output":"maxmemory-policy noeviction\n(error) OOM command not allowed when used memory > 'maxmemory'\nevicted_keys:0\n写命令被拒绝，验证淘汰策略边界"}],
      ['RSS、used_memory 与碎片', 'INFO memory 的 used_memory 是分配器记录的逻辑用量，used_memory_rss 是操作系统看到的进程常驻页，二者差异包含 allocator 碎片、共享页和未归还内存。mem_fragmentation_ratio 长期明显大于一且 active_defrag 关闭时，扩容前应考虑重启迁移或主动整理；它小于一通常意味着依赖 swap。验证应结合 MEMORY STATS、进程 RSS 与 maxmemory 判断，而不是只追一个比率并忽略危险阈值。', '分配器与操作系统口径不同', {"title":"RSS、used_memory 与碎片","language":"bash","code":"redis-cli INFO memory\nredis-cli MEMORY STATS\nps -o pid,rss,vsz,cmd -p $(pgrep -f 'redis-server.*6379')","output":"used_memory:1148576\nused_memory_rss:1458176\nmem_fragmentation_ratio:1.27\nallocator_frag_bytes:335872\nPID 1234 RSS 1458 VSZ 22000 redis-server"}],
      ['大 key 的延迟边界', '大 string、几十万元素 hash 或 list 在读取、删除、序列化和网络回送时都可能长时间占用主线程，CLIENT LIST 的 omem 会显示输出缓冲上升。redis-cli --bigkeys 只按类型抽样，集群要分节点执行，MEMORY USAGE key SAMPLES 可估算单对象成本。验证应先按 key 维度记录元素数与字节数，再在副本或测试实例执行分片读取，避免在线直接全量扫描。', '对象规模比总内存更关键', {"title":"大 key 的延迟边界","language":"bash","code":"redis-cli DEL big:list\nredis-cli RPUSH big:list $(seq 1 300000) >/dev/null\nredis-cli MEMORY USAGE big:list SAMPLES 0\nredis-cli --bigkeys\nredis-cli LRANGE big:list 0 100","output":"MEMORY USAGE: 1870400\nSampled 300000 keys in the keyspace\nBiggest list: big:list has 300000 items\n小页读取成功；全量 LRANGE 会让主线程和输出缓冲承压"}],
      ['容量与清理演练', '构造一个带大量子项的大 hash，分别测量 DEL、UNLINK 和 HSCAN 分批迁移对 PING 延迟的影响；正确处置是先停止新增、读取副本或分批搬迁，再在低峰释放，不能直接阻塞删除。验收要同时给出内存回落、延迟峰值、数据完整性和失败回滚。若只看到 used_memory 暂时下降，但 RSS 未归还，还需区分 allocator 行为与真实泄漏。', '释放动作也要控制停顿', {"title":"容量与清理演练","language":"bash","code":"/usr/bin/time -f 'DEL %e s' redis-cli DEL big:list\nredis-cli RPUSH big:list $(seq 1 300000) >/dev/null\n/usr/bin/time -f 'UNLINK %e s' redis-cli UNLINK big:list\nredis-cli INFO memory | rg 'used_memory_human|used_memory_rss_human'","output":"DEL 0.31 s，PING 峰值约 180ms\nUNLINK 0.00 s，键立即从命名空间消失\n后台释放后 used_memory 与 RSS 逐步回落"}],
    ],
  },
  {
    name: m2Name('RDB、AOF、复制和故障切换'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已完成 Redis 事件循环与内存课时，能用 INFO persistence 和 INFO replication 读取基础指标。',
    goal: '能区分 RDB 快照、AOF fsync、异步复制和故障切换各自的持久性窗口，并说明 WAIT 能证明什么。',
    guidedPractice: '启动主从两实例，写入键后执行 WAIT 1 100 与 INFO replication，再关闭从库重连观察 offset；分别触发 BGSAVE 和 appendfsync everysec 配置，记录 INFO persistence 变化。',
    independentPractice: '独立完成一次主库故障切换演练，记录故障前后已确认数据、复制 offset、丢失窗口与恢复步骤，并比较 RDB 与 AOF 配置下的差异。',
    commonErrors: [
      '认为主从复制同步完成，忽略复制默认异步，WAIT 也只确认当前连接到达了指定副本。',
      '把 RDB 快照频率当成零数据丢失保证，没有说明 since last fork 与故障时刻之间的窗口。',
    ],
    sourceRefs: [
      'Redis Documentation: Persistence. https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/',
      'Redis Documentation: Replication. https://redis.io/docs/latest/operate/oss_and_stack/management/replication/',
    ],
    steps: [
      ['RDB 快照与 fork', 'BGSAVE 创建子进程生成某一时刻的数据快照，fork 后写时复制减少父进程阻塞，但大量写入会触发更多页复制和内存增长。save 配置决定自动快照频率，lastsave 与 rdb_last_bgsave_status 可验证完成情况；两次快照之间的写入不在文件中。若把快照文件复制成功当数据完整，必须同时确认 RDB 校验、时间点与之后写入。', '快照只覆盖一个时点', {"title":"RDB 快照与 fork","language":"bash","code":"redis-cli CONFIG SET save \"900 1\"\nredis-cli SET orders:last 42\nredis-cli BGSAVE\nwhile [ \"$(redis-cli INFO persistence | awk -F: '/rdb_bgsave_in_progress/{print $2}')\" = \"1\" ]; do sleep 1; done\nredis-cli INFO persistence | rg 'rdb_last_bgsave_status|rdb_last_save_time'\nls -lh /data/dump.rdb","output":"Background saving started\nrdb_last_bgsave_status:ok\nrdb_last_save_time:1790000000\n-rw-r--r-- 1 redis redis 128K dump.rdb"}],
      ['AOF 与 fsync 边界', 'AOF 记录写命令，appendfsync always 每次写都同步刷盘，everysec 由后台通常每秒刷盘，no 交给操作系统；Redis 崩溃在未 fsync 窗口时可能丢命令，磁盘故障则取决于日志与副本。AOF rewrite 用临时文件压缩命令，仍要维护重写缓冲才能接上增量。验证应读取 aof_enabled、aof_last_bgrewrite_status 与磁盘错误日志，并用一次受控写入确认刷盘结果。', '刷盘策略就是持久性窗口', {"title":"AOF 与 fsync 边界","language":"bash","code":"redis-cli CONFIG SET appendonly yes\nredis-cli CONFIG SET appendfsync everysec\nredis-cli INFO persistence | rg 'aof_enabled|aof_last_bgrewrite_status'\nredis-cli BGREWRITEAOF\ntail -5 /data/appendonlydir/appendonly.aof.manifest","output":"aof_enabled:1\naof_last_bgrewrite_status:ok\nappendonly.aof.1.base.rdb\nappendonly.aof.1.incr.aof\neverysec 下最多存在约一秒刷盘窗口"}],
      ['复制回放与 offset', '从库连主库后先按需全量同步，再从 backlog 发送增量，主从各维护 master_repl_offset，从库上报 lag 与连接状态。复制是异步回放，主库向客户端返回成功不代表从库已应用；WAIT numreplicas timeout 只等待指定数量的连接达到当前写入位置。验证要在主库写后查 INFO replication 与 WAIT 返回值，不能只看到从库 ONLINE，还要核对两边 offset。', '写入成功不等于副本已见', {"title":"复制回放与 offset","language":"bash","code":"redis-cli -p 6380 REPLICAOF 127.0.0.1 6379\nredis-cli SET after:wait value\nredis-cli WAIT 1 100\nredis-cli INFO replication | rg 'master_repl_offset|connected_slaves'\nredis-cli -p 6380 INFO replication | rg 'master_link_status|slave_repl_offset'","output":"WAIT 返回 1\nconnected_slaves:1\nmaster_repl_offset:8241\nreplica master_link_status:up slave_repl_offset:8241"}],
      ['故障切换的数据边界', 'Sentinel 或编排层提升从库时，只有已复制到该从库的数据可用；主库突然失联且旧主仍有未复制写入，切换会产生分叉，旧主恢复时必须按新主重建或接受数据丢失。配置 min-replicas-to-write 可限制主库在副本不足时继续接受写，但会牺牲可用性。演练应记录旧主末 offset、新主 offset 和业务唯一键，明确丢失范围。', '提升从库只保已有副本', {"title":"故障切换的数据边界","language":"bash","code":"redis-cli -p 6380 REPLICAOF 127.0.0.1 6379\nredis-cli SET critical:1 before-failover\nredis-cli WAIT 1 100\nredis-cli -p 6380 REPLICAOF NO ONE\ndocker stop redis-master\nredis-cli -p 6380 GET critical:1\nredis-cli -p 6380 INFO replication | rg 'role:master'","output":"WAIT 返回 1\ncritical:1 = before-failover\n提升后 role:master\n故障前已同步键可用，未复制窗口内的键需要业务对账"}],
      ['备份恢复验收', '生产备份不能只验证文件存在，应在隔离实例用 redis-check-rdb 或 redis-check-aof 检查后加载，再抽样比对键数量、TTL、关键字段与大对象。恢复时间要包含下载、校验、加载和流量切换，恢复点要写清 RDB 时间或 AOF 末命令。验收至少要证明从空实例恢复到指定时间点、应用重连健康且重复写入被幂等控制。', '恢复演练要验证数据内容', {"title":"备份恢复验收","language":"bash","code":"cp dump.rdb /backup/dump.rdb\nredis-check-rdb /backup/dump.rdb\nmkdir -p /tmp/redis-restore\ncp /backup/dump.rdb /tmp/redis-restore/dump.rdb\nredis-server --port 6381 --dir /tmp/redis-restore --dbfilename dump.rdb &\nsleep 1\nredis-cli -p 6381 DBSIZE\nredis-cli -p 6381 GET orders:last","output":"[OK] RDB checksum is valid\nDBSIZE 1284\n\"42\"\n备份文件可校验、可加载，关键键抽样一致"}],
    ],
  },
  {
    name: m2Name('缓存穿透、击穿、雪崩和一致性'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '会使用 GET、SET、DEL 与 TTL，理解数据库查询失败和缓存未命中不是同一事件。',
    goal: '能针对不存在键、热点失效、批量过期和数据库更新设计缓存策略，并用指标与一致性实验验证边界。',
    guidedPractice: '在测试服务中模拟不存在的商品 ID、热点键过期和大量同时过期，分别测量数据库 QPS、Redis 命中率与请求延迟，再接入空值缓存、singleflight 和 TTL 抖动。',
    independentPractice: '独立为商品详情设计 cache-aside 流程，注入数据库成功但缓存删除失败的故障，证明最终一致性修复路径和监控告警能够发现陈旧数据。',
    commonErrors: [
      '把不存在的查询也无条件长期空值缓存，未设置短 TTL 或审计，导致新增数据长期不可见。',
      '数据库提交前删除缓存，并发读又把旧值写回，误以为一次 DEL 就完成一致性。',
    ],
    sourceRefs: [
      'Redis Documentation: Client-side caching. https://redis.io/docs/latest/develop/clients/client-side-caching/',
      'Redis Documentation: Keyspace notifications. https://redis.io/docs/latest/develop/keyspace-notifications/',
    ],
    steps: [
      ['穿透与不存在的键', '大量请求查询数据库不存在的 ID 时，缓存永不命中，流量直接落到数据库，这是穿透。可缓存带短 TTL 的空值标记，或在写路径维护 Bloom Filter 先挡住确定不存在的键；Bloom 会误判存在但不会漏掉已写入值。验证应分别测试不存在、刚创建和已删除三类键，确认空值不会阻止真实新增，并记录数据库 QPS。', '空值缓存必须有退出边界', {"title":"穿透与不存在的键","language":"bash","code":"redis-cli SET missing:product:9999 '__NULL__' EX 60 NX\nredis-cli GET missing:product:9999\nredis-cli TTL missing:product:9999\nredis-cli SET product:9999 real-product\nredis-cli DEL missing:product:9999\nredis-cli GET product:9999","output":"OK\n\"__NULL__\"\nTTL 58\nOK\nDEL 返回 1\n\"real-product\"\n短 TTL 空值挡住穿透，新增数据发生时主动删除标记"}],
      ['击穿与热点重建', '单个热点键过期瞬间，多个请求同时未命中并并发回源，形成击穿。进程内 singleflight 可合并同一 key 的回源，分布式环境可用短锁、租约或 stale-while-revalidate，但锁失效与持锁者崩溃必须处理。验证应制造热点键过期与一百个并发读，确认数据库只承受有限回源，而不是把锁等待变成新的超时雪崩。', '限制回源并发而非只延长 TTL', {"title":"击穿与热点重建","language":"lua","code":"local key = KEYS[1]\nlocal token = ARGV[1]\nlocal ttl = tonumber(ARGV[2])\nif redis.call('SET', key, token, 'NX', 'PX', ttl) then\n  return 1\nend\nreturn 0\n-- 调用：EVAL script 1 lock:product:1001 token-42 3000","output":"EVAL 返回 1，第一个请求获得重建租约\n其余 99 个并发请求返回 0，等待缓存或返回旧值\n持锁进程退出后 3 秒租约自动释放"}],
      ['雪崩与 TTL 分布', '大批键在同一时刻过期，或 Redis 集群不可用时，请求会同时压向数据库；给 TTL 加随机抖动、预热热点、设置本地降级与数据库连接池上限可削峰。Redis 故障不应被应用解释为无限回源许可，熔断与排队长度要有限。验证可在测试环境一次删除一批键，记录数据库 QPS、连接池等待和应用 5xx，确认保护阈值能触发。', '失效风暴需要限流兜底', {"title":"雪崩与 TTL 分布","language":"lua","code":"for i = 1, 5 do\n  local ttl = 300 + math.random(0, 60)\n  redis.call('SET', 'cache:item:' .. i, 'v' .. i, 'EX', ttl)\nend\nreturn redis.call('MGET', 'cache:item:1', 'cache:item:2')","output":"两条缓存值返回成功\nTTL 分别落在 300 到 360 秒范围\n批量重建不再集中到同一秒，数据库连接等待保持在上限内"}],
      ['cache-aside 一致性', '常见读路径先 GET，未命中查数据库再 SET；写路径先提交数据库再删除缓存。并发读可能在删除前把旧值重新写回，因此删除失败要进入重试队列、Outbox 或由 binlog 驱动失效，不能只打一条日志。对强一致读应直接查主库或使用版本号校验；验证要制造删除失败并观察修复时间，而不是只验证正常写后读。', '删除失败需要可恢复通道', {"title":"cache-aside 一致性","language":"javascript","code":"async function readProduct(id) {\n  const cached = await redis.get('product:' + id);\n  if (cached) return JSON.parse(cached);\n  const row = await db.one('SELECT * FROM products WHERE id=$1', [id]);\n  await redis.set('product:' + id, JSON.stringify(row), { EX: 300 });\n  return row;\n}\nasync function updateProduct(id, data) {\n  await db.tx(async tx => {\n    await tx.none('UPDATE products SET name=$2 WHERE id=$1', [id, data.name]);\n    await tx.none(\"INSERT INTO cache_invalidation(id) VALUES ($1)\", [id]);\n  });\n  await redis.del('product:' + id);\n}","output":"更新事务提交后 DELETE 返回 1\n注入 DELETE 失败时 cache_invalidation 仍保留记录\n失效消费者重试删除，下一次读取得到新名称"}],
      ['指标与故障演练', '监控 keyspace_hits、keyspace_misses、数据库来源 QPS、回源耗时、空值数量、singleflight 合并数与缓存删除失败数，才能区分穿透、击穿和雪崩。演练依次注入不存在 ID、热点过期、Redis 超时和数据库提交后删缓存失败，每项保留前后指标与业务结果。若只观察缓存命中率，低命中可能来自真实冷数据，无法证明故障策略有效。', '故障类型决定修复动作', {"title":"指标与故障演练","language":"bash","code":"redis-cli INFO stats | rg 'keyspace_hits|keyspace_misses'\nredis-cli INFO commandstats | rg 'cmds_get|cmds_set'\nmysql -N -e \"SHOW STATUS LIKE 'Questions'\"\nredis-cli SLOWLOG GET 10\nredis-cli CONFIG GET maxmemory-policy","output":"keyspace_hits:9821\nkeyspace_misses:179\ncmds_get:calls=10000\nQuestions 从 310 升到 492\n命中率下降 38% 时数据库 QPS 同步上升，触发缓存回源告警"}],
    ],
  },
];

const m3Stage = 'RabbitMQ 路由、确认、死信与流控';
const m3Name = (topic: string) => `中间件源码 · ${m3Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m3Name('exchange、binding、queue 和路由'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已启动 RabbitMQ Management，能区分 connection、channel、exchange 与 queue。',
    goal: '能解释 exchange 到 queue 的 binding 路由，使用 direct、topic、fanout 与 headers 验证匹配结果，并定位不可路由消息。',
    guidedPractice: '通过 rabbitmqadmin 声明 direct 与 topic exchange、多个 durable queue 和 binding，发布不同 routing key，再用 list_queues 与 get 命令核对每个队列收到的消息。',
    independentPractice: '独立设计订单事件路由，包含精确事件、通配订阅与审计广播，故意发布无匹配 key 的 mandatory 消息并保存返回事件。',
    commonErrors: [
      '把 routing key 当成 queue 名，发布后没有 binding 匹配，却只在应用日志中寻找消费者错误。',
      'topic 通配符写成多个点段后误以为星号可跨任意层级，实际匹配结果为空。',
    ],
    sourceRefs: [
      'RabbitMQ Documentation: Exchanges and routing. https://www.rabbitmq.com/docs/exchanges',
      'RabbitMQ source: deps/rabbit/src/rabbit_channel.erl. https://github.com/rabbitmq/rabbitmq-server/blob/main/deps/rabbit/src/rabbit_channel.erl',
    ],
    steps: [
      ['exchange 是路由器', 'producer 把消息发布到 exchange 并携带 routing key，exchange 根据类型和绑定决定复制到哪些 queue，自身不保存可长期消费的消息。没有匹配队列时消息可能被丢弃，除非设置 mandatory 并处理 basic.return。声明 exchange、queue 与 binding 都需一致参数，重复声明不兼容会关闭 channel；验证应读取 exchange 和 binding 列表，而非只确认 publish 方法返回并假定已路由，再核对消息实际进入的队列。', '发布成功不等于有队列接收', {"title":"exchange 是路由器","language":"bash","code":"rabbitmqadmin declare exchange name=orders.exchange type=direct durable=true\nrabbitmqadmin declare queue name=orders.created durable=true\nrabbitmqadmin declare binding source=orders.exchange destination=orders.created routing_key=order.created\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created payload='{\"id\":\"A-42\"}'\nrabbitmqadmin get queue=orders.created ackmode=ack_requeue_false count=1","output":"exchange declared\nqueue declared\nbinding declared\nmessage published\n{\"id\":\"A-42\"} routing_key=order.created"}],
      ['四种交换类型', 'direct 对 routing key 做完整相等匹配，topic 按点分词并支持 * 匹配一段、# 匹配零到多段，fanout 忽略 key 广播到所有绑定队列，headers 用消息头键值匹配。选择类型应依据路由表达能力和运维可见性，不能只因配置短；topic 的 # 范围过宽会意外放大订阅。验证要为每种 exchange 建立至少两个 binding，发布后读取实际队列深度。', '匹配规则决定消息副本', {"title":"四种交换类型","language":"bash","code":"rabbitmqadmin declare exchange name=audit.topic type=topic durable=true\nrabbitmqadmin declare queue name=audit.paid durable=true\nrabbitmqadmin declare binding source=audit.topic destination=audit.paid routing_key='order.*.paid'\nrabbitmqadmin publish exchange=audit.topic routing_key=order.cn.paid payload='CN'\nrabbitmqadmin publish exchange=audit.topic routing_key=order.cn.created payload='IGNORED'\nrabbitmqadmin get queue=audit.paid ackmode=ack_requeue_false count=10","output":"binding declared\nonly order.cn.paid 命中\nqueue 中读取 1 条 payload=CN\norder.cn.created 未被路由，计数保持 0"}],
      ['队列属性与生命周期', 'durable queue 在 broker 重启后保留定义，exclusive queue 仅限声明连接并随连接关闭删除，auto-delete queue 在最后一个消费者断开后删除；这些属性与消息 persistent 不同。同名队列参数不一致会导致 PRECONDITION_FAILED，客户端应把声明放在受控迁移中。验证应重启 broker 检查队列与消息，并断开消费者观察 auto-delete，不能只检查页面是否仍显示名称。', '队列存活与消息持久分开', {"title":"队列属性与生命周期","language":"bash","code":"rabbitmqadmin declare queue name=session.worker durable=false auto_delete=true exclusive=false\nrabbitmqadmin list queues name durable auto_delete messages consumers\ndocker compose restart rabbitmq\nrabbitmqadmin list queues name durable messages\ndocker exec rabbitmq rabbitmqctl list_queues name durable auto_delete messages","output":"session.worker durable=false auto_delete=true\n重启前 consumers=0\n重启后普通临时队列从定义列表消失\ndurable 队列仍存在，persistent 消息恢复"}],
      ['不可路由与 mandatory', 'publish 设置 mandatory=true 时，exchange 找不到 queue 会返回 basic.return，客户端必须注册 return listener 才能看到；不设置时 broker 可能静默丢弃。alternate exchange 可把未路由消息转送到兜底 exchange，便于审计和告警。验证应发布一个无绑定 key，断言收到 return 的 replyCode、exchange 与 routingKey，同时检查兜底队列深度，而不是只看 publish future 完成，并记录客户端的返回处理结果与返回交换机名称。', '无绑定消息需要显式出口', {"title":"不可路由与 mandatory","language":"javascript","code":"const amqp = require('amqplib');\nconst conn = await amqp.connect('amqp://guest:guest@localhost');\nconst ch = await conn.createChannel();\nch.on('return', msg => console.log('returned', {\n  exchange: msg.fields.exchange,\n  routingKey: msg.fields.routingKey,\n  replyCode: msg.fields.replyCode,\n}));\nch.publish('orders.exchange', 'order.missing', Buffer.from('x'), {\n  mandatory: true, contentType: 'application/json',\n});\nawait new Promise(r => setTimeout(r, 500));\nawait ch.close();","output":"returned {\n  exchange: 'orders.exchange',\n  routingKey: 'order.missing',\n  replyCode: 312\n}\nNO_ROUTE 事件已进入应用日志和兜底队列"}],
      ['路由故障实验', '删除一个 binding 后重发同一消息，先用 rabbitmqadmin list_bindings 确认差异，再从目标 queue get 不到消息；恢复 binding 后重发并读取 properties.routing_key。若业务端把 channel 级异常与路由失败混为一类，就会漏掉基本返回路径。验收应保存误路由、不可路由和恢复后成功三个队列观察结果，并核对消息属性没有被重新编码。', '先证明绑定再判断投递', {"title":"路由故障实验","language":"bash","code":"rabbitmqadmin delete binding source=orders.exchange destination=orders.created properties_key=order.created\nrabbitmqadmin list bindings source=orders.exchange\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created payload='lost-check'\nrabbitmqadmin get queue=orders.created count=1\nrabbitmqadmin declare binding source=orders.exchange destination=orders.created routing_key=order.created","output":"binding deleted\nsource=orders.exchange 返回空列表\nqueue 中读取 0 条\n恢复 binding 后重发，properties.routing_key=order.created"}],
    ],
  },
  {
    name: m3Name('publisher confirm 与持久化'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能出版并路由 message，知道 durable queue、persistent message 与 publisher confirm 是不同概念。',
    goal: '能说明 channel confirm、delivery tag、quorum queue 与磁盘刷写的关系，并在 broker 中断时处理确认结果不确定的情况。',
    guidedPractice: '在 publisher 上启用 confirm.select，发送 persistent 消息并记录 broker basic.ack 的 deliveryTag，再停止 broker 重复一次发布，比较确认超时、连接关闭与重连后的消息数量。',
    independentPractice: '独立实现批量发布加异步 confirm 跟踪，要求超时消息进入待重发表，并证明重复重发会被消费者幂等键吸收。',
    commonErrors: [
      '只把消息设置 delivery_mode=2，却声明非持久 queue 或使用 transient exchange，重启后消息仍可能消失。',
      '收到 confirm 超时就无限立即重发，忽略 broker 可能已经接收，造成大量重复消息。',
    ],
    sourceRefs: [
      'RabbitMQ Documentation: Publisher confirms. https://www.rabbitmq.com/docs/confirms',
      'RabbitMQ Documentation: Quorum queues. https://www.rabbitmq.com/docs/quorum-queues',
    ],
    steps: [
      ['channel 上的确认序号', 'channel 开启 confirm 后，publisher 每次 publish 获得递增 deliveryTag，broker 在消息负责保存后发送 basic.ack，无法处理时发送 basic.nack。确认归属于 channel，连接重连后状态必须重新建立；同步 publish 返回与 broker confirm 不是同一层事实。验证应关联 application messageId、channel 与 deliveryTag，记录确认时序与断线重连结果，不能只统计 ack 数量，并保存未确认集合在重连前后的变化与确认时间。', '确认以 channel 序号追踪', {"title":"channel 上的确认序号","language":"javascript","code":"const ch = await conn.createConfirmChannel();\nch.on('ack', tag => log.info('ack', { tag }));\nconst ok = ch.publish('orders.exchange', 'order.created',\n  Buffer.from(JSON.stringify({ id: 'A-42' })), {\n    persistent: true, messageId: 'A-42:created',\n  });\nlog.info('publish-returned', { ok });\nawait ch.waitForConfirms();\nlog.info('all-confirmed');","output":"publish-returned true\nack { tag: 1 }\nall-confirmed\n应用 messageId=A-42:created 与 broker deliveryTag=1 形成映射"}],
      ['持久化组合', 'durable queue 保存队列定义，persistent 消息要求可恢复存储，quorum queue 通过 Raft 复制到多个节点，经典 mirrored queue 已不适合作为新系统默认。三者组合仍受磁盘告警和写入策略影响；只设置一个属性不能保证重启恢复。验证应重启 broker、停止一个节点并检查 queue 与消息属性，不能只看 Management 页面队列名称仍在。', '定义、消息与副本共同作用', {"title":"持久化组合","language":"bash","code":"rabbitmqadmin declare queue name=orders.durable durable=true type=quorum\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created   payload='{\"id\":\"A-43\"}' properties='{\"delivery_mode\":2,\"message_id\":\"A-43\"}'\nrabbitmqadmin get queue=orders.durable ackmode=ack_requeue_false count=1\ndocker compose restart rabbitmq\nrabbitmqadmin get queue=orders.durable ackmode=ack_requeue_false count=1","output":"queue declared type=quorum\ndelivery_mode=2 message_id=A-43\n重启前消息存在\n重启后消息仍存在，publisher confirm 已完成"}],
      ['确认延迟与批量窗口', '异步 confirm 允许 publisher 连续发送后按 deliveryTag 回报，吞吐高于逐条等待，但未确认消息会占用内存和待处理表。超时时间过短会误判慢磁盘，过长则重发恢复变慢；应记录 outstanding confirms 与 confirm 延迟。验证可向磁盘较慢的测试节点发送批次，观察 ack 排序和未确认数量，而不是把 network timeout 直接当 broker 拒绝并立即重发。', '未确认批次形成在途窗口', {"title":"确认延迟与批量窗口","language":"javascript","code":"const pending = new Map();\nfor (let i = 0; i < 1000; i++) {\n  const tag = ch.publish('events.exchange', 'event.ok',\n    Buffer.from(String(i)), { persistent: true });\n  pending.set(tag, Date.now());\n  if (i % 100 === 0) ch.waitForConfirms().then(() => settleBatch(i));\n}\nsetInterval(() => gauge.set(pending.size), 1000);\nawait ch.waitForConfirms();\n","output":"outstanding-confirms: 100 -> 0\npublish throughput: 4210/s\nmax confirm latency: 183 ms\n未确认集合按 deliveryTag 清理"}],
      ['不确定结果与幂等重发', '连接在 publish 后、confirm 前断开时，publisher 不知道 broker 是否已保存消息，只能依据业务 messageId 重发，并让消费端用唯一键去重。confirm nack 则表示 broker 明确未成功处理，可进入退避重试；两者应走不同状态机。验证应断开网络制造 unknown outcome，最终核对 broker 消息数和业务副作用，不能单靠 deliveryTag 猜测，也不能假定重发一定重复。', '确认丢失不等于消息丢失', {"title":"不确定结果与幂等重发","language":"javascript","code":"try {\n  await ch.waitForConfirms();\n} catch (error) {\n  log.warn('confirm-timeout', { messageId: 'A-42:created', error });\n  await retryQueue.add({ messageId: 'A-42:created', reason: 'unknown' });\n}\ndb.prepare('INSERT OR IGNORE INTO processed(message_id) VALUES (?)')\n  .run('A-42:created');\nlog.info('consumer-idempotency-installed');","output":"confirm-timeout messageId=A-42:created\n消息进入 unknown 重试队列\nbroker 已保存时消费者命中唯一键\nprocessed 表中 message_id 只有一行"}],
      ['可靠性验收', '同时启用持久 queue、persistent message、publisher confirm 与消费者手动 ack，依次注入 broker 重启和发布连接断开，保存每一步 publish、confirm、消费与重启后消息数。若 min quorum 不可用，发布应报错或阻塞在受控超时，而不是无限占用生产者。验收必须覆盖不丢、允许重复、重复可吸收和超时未知四个边界，并核对重启后每条业务键只处理一次。', '可靠投递包含重复代价', {"title":"可靠性验收","language":"bash","code":"scripts/run-reliability.sh   --restart-broker   --drop-publisher-connection   --consumer-kill-after-db-commit\nrabbitmqctl list_queues name messages messages_unacknowledged\npsql -c \"SELECT message_id, count(*) FROM processed GROUP BY message_id HAVING count(*) > 1\"\nkafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups","output":"broker restart=pass publisher-kill=pass consumer-kill=pass\norders.durable messages=0 unacked=0\nprocessed 重复业务键查询返回 0 行\n所有故障阶段均有确认或未知结果证据"}],
    ],
  },
  {
    name: m3Name('consumer ack、nack 和重投'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能消费队列消息并读懂 deliveryTag，理解 prefetch 限制未确认消息数量。',
    goal: '能区分 ack、reject、nack 与重新入队的语义，解释消费者崩溃后的 redelivered 标记，并避免毒消息无限循环。',
    guidedPractice: '以 manual ack 消费一个队列，分别执行成功 ack、处理失败后 nack requeue=false、处理失败后 nack requeue=true，使用 rabbitmqctl list_queues 对比 ready 与 unacked 数量。',
    independentPractice: '独立实现带有限重试的消费者，根据 x-death 或自定义 headers 判断尝试次数，超过上限转死信而不是继续 requeue。',
    commonErrors: [
      '业务处理抛异常后自动 ack，消息被删除而实际副作用没有完成。',
      '对所有错误都 nack requeue=true，毒消息在消费者之间循环并占满 CPU。',
    ],
    sourceRefs: [
      'RabbitMQ Documentation: Consumer acknowledgements. https://www.rabbitmq.com/docs/confirms#consumer-acknowledgements',
      'RabbitMQ Documentation: Consumers and delivery. https://www.rabbitmq.com/docs/consumers',
    ],
    steps: [
      ['deliveryTag 与确认范围', 'broker 在 channel 内为 delivery 分配 deliveryTag，basic.ack 可确认单条，multiple=true 时确认该 tag 及之前所有未确认消息；确认只对当前 channel 有效。未确认消息计入 unacked，消费者断开后重新入队并带 redelivered 标记。验证应同时查看应用处理记录与 list_queues 的 messages_unacknowledged，并记录确认顺序，不能把收到 message 当确认成功，还要核对确认前后的队列计数与动作时间。', '确认不是消费回调返回', {"title":"deliveryTag 与确认范围","language":"javascript","code":"const consumeTag = await ch.consume('orders.created', async msg => {\n  if (!msg) return;\n  log.info('delivery', {\n    tag: msg.fields.deliveryTag,\n    redelivered: msg.fields.redelivered,\n    messageId: msg.properties.messageId,\n  });\n  await process(msg);\n  ch.ack(msg, false);\n}, { noAck: false });\nlog.info('consumer-tag', consumeTag);","output":"delivery tag=7 redelivered=false messageId=A-42\ndb commit finished\nch.ack(tag=7, multiple=false)\nqueue messages_ready 减少，unacked 在同一确认后归零"}],
      ['reject 与 nack', 'basic.reject 一次处理一条消息，可以 requeue 或丢弃；basic.nack 可配合 multiple 批量拒绝，并选择是否重新入队。重新入队会把消息放到原队列头部附近，没有延迟和次数上限，毒消息可能立即回到同一消费者。验证应记录 redelivered、x-death 与失败次数，并确认有限重试后才进入死信，同时观察队列是否出现热点循环。', '重投策略必须有限', {"title":"reject 与 nack","language":"javascript","code":"if (!canParse(msg)) {\n  ch.nack(msg, false, false);\n  log.warn('rejected-malformed', { messageId: msg.properties.messageId });\n} else if (isTransientError(err)) {\n  ch.nack(msg, false, true);\n} else {\n  ch.ack(msg, false);\n}\nawait ch.waitForConfirms();","output":"malformed 消息 nack requeue=false，进入死信\n临时错误 nack requeue=true，redelivered=true\n正常消息 ack\ndeliveryTag 8 没有被批量确认"}],
      ['处理成功与副作用提交', '数据写入数据库成功后应再 ack；若 ack 前崩溃，消息会重投并可能重复执行，因此持久副作用需使用消息 ID 唯一键。若业务要求先记录失败再 ack，失败记录必须持久且可补偿，不能吞掉异常。验证可让消费者在写库后 ack 前 kill，重启后确认同一条 redelivered 被幂等吸收，并保留两侧时间戳。', 'ack 位置对应副作用边界', {"title":"处理成功与副作用提交","language":"sql","code":"BEGIN;\nINSERT INTO shipped_orders(order_id, shipment_id)\nVALUES ('A-42', 'S-9001')\nON CONFLICT (order_id) DO NOTHING;\nUPDATE orders SET status = 'shipped' WHERE id = 'A-42';\nCOMMIT;\n-- COMMIT 返回后再执行 channel.ack(msg)\nSELECT order_id, shipment_id FROM shipped_orders WHERE order_id = 'A-42';","output":"INSERT 0 1\nUPDATE 1\nCOMMIT\nack 前杀进程，恢复后同一消息 redelivered=true\n第二次事务 INSERT 0 0，发货记录仍只有一条"}],
      ['未确认容量与连接损失', 'channel.prefetch 限制未确认数量，连接或 channel 关闭时所有未确认 delivery 会重新入队，其他消费者可接手。大量 unacked 会占用 broker 内存并掩盖实际处理能力，消费者数量多也不代表吞吐线性增加。验证可暂停处理观察 unacked 上升，再杀进程确认 ready 重新增加且消息未丢，并核对 redelivered 标记和最终完成消费者。', '断连会把未确认送回队列', {"title":"未确认容量与连接损失","language":"bash","code":"rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers\ndocker exec rabbitmq rabbitmqctl list_channels name number prefetch_count messages_unacknowledged\ndocker compose kill worker\nsleep 2\nrabbitmqctl list_queues name messages_ready messages_unacknowledged","output":"orders.created ready=0 unacked=50 consumers=1\nchannel prefetch_count=50\nworker 被杀后 ready=50 unacked=0\n消息重新入队，下个消费者看到 redelivered=true"}],
      ['有限重试实现', '处理失败时读取重试头，先 ack 当前投递，再向带 TTL 的重试 exchange 发布延迟副本，或直接 nack requeue=false 交给 DLX；次数到上限后进入隔离队列并告警。所有复制要保持原 messageId，消费者用幂等键避免重复副作用。验收要证明第一次失败可重试、超过上限只进入死信、正常消息继续流动且没有重复发布。', '重试与死信需要独立路径', {"title":"有限重试实现","language":"javascript","code":"const attempt = Number(msg.properties.headers?.['x-attempt'] ?? 0);\nif (attempt >= 3) {\n  ch.publish('dead.exchange', 'order.failed', msg.content, {\n    persistent: true,\n    messageId: msg.properties.messageId,\n    headers: { ...msg.properties.headers, 'x-final-reason': 'max-retries' },\n  });\n  ch.ack(msg);\n} else {\n  ch.publish('retry.exchange', 'order.retry', msg.content, {\n    persistent: true,\n    messageId: msg.properties.messageId,\n    headers: { ...msg.properties.headers, 'x-attempt': attempt + 1 },\n  });\n  ch.ack(msg);\n}","output":"attempt=0 发布 retry，x-attempt=1，原消息 ack\nattempt=1 和 2 继续延迟重试\nattempt=3 发布 dead，原消息 ack\ndead.queue ready=1，正常队列继续消费"}],
    ],
  },
  {
    name: m3Name('DLX、延迟、死信和幂等'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已能手动确认与拒绝消息，知道 queue arguments 会在声明时固定。',
    goal: '能设计死信 exchange、TTL 延迟队列与隔离队列，使失败消息有重试上限、可审计并在修复后安全重放。',
    guidedPractice: '声明带 x-dead-letter-exchange 的业务队列，分别制造 reject、消息 TTL 到期和队列超限三种死信条件，用 Management 与 rabbitmqctl 读取 x-death 头和死信队列深度。',
    independentPractice: '独立搭建两级延迟重试与最终死信队列，编写死信检查工具，要求能够修复原因后按原 messageId 重放而不重复副作用。',
    commonErrors: [
      '只在消费端记录失败次数，消息重投后计数器丢失，导致无限重试。',
      '把死信队列当作永久归档，不设置容量、告警和重放入口，最终形成无人处理的黑洞。',
    ],
    sourceRefs: [
      'RabbitMQ Documentation: Dead lettering. https://www.rabbitmq.com/docs/dlx',
      'RabbitMQ Documentation: Time-to-live and expiration. https://www.rabbitmq.com/docs/ttl',
    ],
    steps: [
      ['死信触发条件', '消息被拒绝且 requeue=false、达到消息或队列 TTL、超过队列最大长度或容量时，可被路由到 x-dead-letter-exchange；broker 会更新 x-death 记录原因、队列和次数。死信不是自动修复，只是把失败移到可观察位置。验证可在死信 header 中检查 reason 与 queue，并比较原队列和死信队列的计数，不能只看原队列深度下降，并保存死信头中的原因与计数。', '死信记录失败原因', {"title":"死信触发条件","language":"bash","code":"rabbitmqadmin declare queue name=orders.work durable=true arguments='{\"x-dead-letter-exchange\":\"dead.exchange\",\"x-message-ttl\":5000,\"x-max-length\":100}'\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created payload='reject-me'\nrabbitmqadmin get queue=orders.work ackmode=reject_requeue_false count=1\nrabbitmqadmin get queue=orders.dead count=1","output":"queue declared\nconsumer reject 后消息进入 dead.exchange\ndead queue payload=reject-me\nx-death reason=rejected count=1"}],
      ['DLX 与 DLK 配置', 'x-dead-letter-exchange 和 x-dead-letter-routing-key 在 queue 声明参数中固定，修改必须重建队列或做迁移；死信 exchange 本身仍需绑定死信 queue，否则消息会再次不可路由。参数变更与同名队列冲突会关闭 channel，部署脚本应显式版本化。验证应读取 queue arguments 和 binding，再制造一次拒绝并确认死信路由成功及原消息属性完整，同时核对死信队列绑定与参数一致。', '死信仍需要完整路由', {"title":"DLX 与 DLK 配置","language":"bash","code":"rabbitmqadmin declare exchange name=dead.direct type=direct durable=true\nrabbitmqadmin declare queue name=orders.dead durable=true type=quorum\nrabbitmqadmin declare binding source=dead.direct destination=orders.dead routing_key=order.dead\nrabbitmqadmin declare queue name=orders.retry durable=true arguments='{\"x-dead-letter-exchange\":\"dead.direct\",\"x-dead-letter-routing-key\":\"order.dead\"}'\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created payload='bad-order'\nrabbitmqctl list_queues name messages arguments","output":"dead.direct 与 orders.dead 声明成功\nretry queue argument x-dead-letter-routing-key=order.dead\nexpired/rejected 消息最终进入 orders.dead\nlist_queues 显示 retry messages=0"}],
      ['TTL 延迟队列', '消息级 expiration 从到达队列时计算，队列级 x-message-ttl 从入队时生效，队列头部消息未过期会阻塞后续消息被投递，因此不同延迟不适合共用一条 FIFO 延迟队列。常见做法按延迟档位分队列并结合 DLX，但高容量仍需核对队列和时间精度。验证要测头部长 TTL 与后续短 TTL，防止延迟顺序被 FIFO 卡住。', 'FIFO 头部决定延迟效果', {"title":"TTL 延迟队列","language":"bash","code":"rabbitmqadmin declare queue name=delay.30s durable=true arguments='{\"x-message-ttl\":30000,\"x-dead-letter-exchange\":\"orders.exchange\",\"x-dead-letter-routing-key\":\"order.created\"}'\nrabbitmqadmin publish exchange=orders.exchange routing_key=order.created payload='delayed-order'\nrabbitmqadmin get queue=delay.30s count=1\nsleep 31\nrabbitmqadmin get queue=orders.created count=1","output":"delay.30s ready=1\n立即读取 orders.created 为 0\n30 秒后消息被投回 orders.created\nx-death reason=expired，routing-key=order.created"}],
      ['幂等与重放身份', '每次重试应保留业务 messageId，并增加 attempt、firstSeenAt 与 failureReason 等头；消费端在数据库中以 messageId 建立唯一处理记录，成功后才 ack。死信修复后可重新发布原 payload，但必须允许已部分成功的步骤被检查或补偿。验证要重放同一 messageId 两次，确认只产生一次外部副作用并有审计记录，同时保留失败原因。', '重放身份先于重放动作', {"title":"幂等与重放身份","language":"sql","code":"CREATE TABLE message_receipts (\n  message_id text PRIMARY KEY,\n  payload_hash text NOT NULL,\n  received_at timestamptz NOT NULL DEFAULT now()\n);\nINSERT INTO message_receipts(message_id, payload_hash)\nVALUES ('A-42:created', 'sha256:2c6b...')\nON CONFLICT (message_id) DO NOTHING\nRETURNING message_id;\nSELECT count(*) FROM message_receipts WHERE message_id = 'A-42:created';","output":"第一次 RETURNING 返回 A-42:created\n重放同一 messageId 返回 0 行\ncount=1，业务副作用只执行一次\npayload_hash 不同则进入冲突告警"}],
      ['死信运行闭环', '监控死信队列深度、增长速度、最早消息年龄与失败原因分布，把超过阈值的事件发给负责人，并提供查询、修复、批量重放和暂停入口。重放前先验证消费者版本与数据已修复，重放后进行限速，避免积压瞬间冲击下游。验收应覆盖发现、定位、修复、限速重放和再次失败五步。', '死信必须有负责人和出口', {"title":"死信运行闭环","language":"bash","code":"rabbitmqctl list_queues name messages messages_unacknowledged | rg 'dead|retry'\nscripts/replay-dlx.sh --queue orders.dead --rate 20 --dry-run\nscripts/replay-dlx.sh --queue orders.dead --rate 20 --confirm\nrabbitmqctl list_queues name messages | rg 'orders.dead|orders.created'\npsql -c \"SELECT count(*) FROM processed WHERE message_id LIKE 'A-42:%'\"","output":"orders.dead messages=37\ndry-run 校验 37 个 messageId 和 payload hash\n限速 20/s 重放后 dead 逐步归零\norders.created 正常消费，processed=37 无重复"}],
    ],
  },
  {
    name: m3Name('流控、预取和消费者容量'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能读取队列 ready 与 unacked，理解 prefetch 与业务并发、数据库连接池之间的关系。',
    goal: '能根据消息处理时间和 prefetch 计算在途容量，识别 broker 内存或磁盘告警，并设计不会压垮下游的消费者扩缩容方案。',
    guidedPractice: '在 prefetch 为 1、10、100 三组配置下压入固定消息量，记录吞吐、p99、unacked、消费者 CPU 与数据库连接等待，再把结果画成容量曲线。',
    independentPractice: '独立为一个发信队列制定容量计划，给出消费者数量、prefetch、下游并发、重试队列和最大积压阈值，并完成一次十倍流量演练。',
    commonErrors: [
      '只增加消费者数量，不限制 prefetch，导致每个消费者一次拉取大量消息并压垮下游。',
      '把 messages_ready 当成全部积压，忽略 unacked 与 delayed 消息仍然占用容量和处理责任。',
    ],
    sourceRefs: [
      'RabbitMQ Documentation: Consumer prefetch. https://www.rabbitmq.com/docs/consumer-prefetch',
      'RabbitMQ Documentation: Flow control. https://www.rabbitmq.com/docs/flow-control',
    ],
    steps: [
      ['prefetch 是未确认窗口', 'basic.qos 的 prefetch_count 限制单 consumer 或 channel 未确认消息数量，global=false 通常按 consumer 生效；值越大，网络往返越少但内存与下游并发越高。窗口应覆盖处理时间乘以目标并发，而不是直接设为无限。验证可观察 unacked 是否稳定在设定附近，以及数据库活跃连接是否超过上限，并记录 p99 处理耗时与预取值的对照。', '预取量就是在途工作量', {"title":"prefetch 是未确认窗口","language":"javascript","code":"await ch.prefetch(20, false);\nawait ch.consume('orders.created', async msg => {\n  if (!msg) return;\n  const started = Date.now();\n  await handler.process(msg);\n  ch.ack(msg);\n  histogram.observe((Date.now() - started) / 1000);\n}, { noAck: false });\n","output":"channel prefetch_count=20\n单个消费者最多保留 20 条 unacked\nhandler 耗时 120ms 时单消费者理论吞吐约 166 条/秒\n超过窗口时 broker 停止继续投递"}],
      ['broker 流控与磁盘告警', 'RabbitMQ 在内存或磁盘低于阈值时会阻塞发布连接，防止自身耗尽资源，Management 显示 alarm 与 connection blocked。publish confirm 可能长时间不返回，应用必须有超时、暂停生产和背压信号，不能继续无限堆积本地队列。验证应在测试节点制造磁盘高水位并观察 blocked 原因与恢复信号，而不是直接操作生产磁盘。', '代理保护会反压生产者', {"title":"broker 流控与磁盘告警","language":"bash","code":"rabbitmqctl set_vm_memory_high_watermark 0.4\nrabbitmqctl set_disk_free_limit 2GB\nrabbitmqctl status | rg -A4 'memory|disk_free'\ndocker exec rabbitmq df -h /var/lib/rabbitmq\nrabbitmqctl set_disk_free_limit 5GB","output":"memory high watermark set to 40%\ndisk free limit set to 2GB\ndisk_free 1.4GB below limit\npublisher 被阻塞，management 显示 blocked=true"}],
      ['消费者容量计算', '若单条平均处理时间 T 秒、每消费者 prefetch P、消费者数 C，则理论上限约为 C×P/T，但受数据库连接、外部 API 和 CPU 限制。先把下游容量测成硬上限，再反推消费者与 prefetch；盲目扩容会制造更多锁竞争。验证要通过阶梯压测找到吞吐平台，并记录首超限资源而不是只看总 QPS 与消费者数量。', '瓶颈可能在代理之外', {"title":"消费者容量计算","language":"bash","code":"rabbitmqctl list_queues name messages consumers\nrabbitmqctl list_channels name prefetch_count messages_unacknowledged\npython3 - <<'PY'\nproducer_rate = 420\nconsumer_count = 6\nlatency_seconds = 0.18\nprint({'capacity': consumer_count / latency_seconds,\n       'required': producer_rate,\n       'surplus': consumer_count / latency_seconds - producer_rate})\nPY","output":"queue consumers=6\nprefetch_count=20 unacked 总量 72\n{'capacity': 33.33, 'required': 420, 'surplus': -386.67}\n当前消费者容量不足，扩消费者前先核对下游瓶颈"}],
      ['积压构成与处置顺序', 'queue 的 messages_ready、messages_unacknowledged 与 delayed 分别表示待投递、处理中与延迟消息；总积压需要相加并区分增长来源。处置顺序通常是先确认消费者健康与下游容量，再限速重放死信，最后按分区或路由拆队列；直接清空队列会丢失业务消息。验证应保存每类计数随时间变化的曲线，并核对消息来源。', '三类积压需要分开处理', {"title":"积压构成与处置顺序","language":"bash","code":"rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers\nrabbitmqadmin get queue=orders.created count=5 ackmode=ack_requeue_true\ncurl -s http://localhost:15672/api/queues/%2F/orders.created \\\n  -u guest:guest | jq '{messages, messages_ready, messages_unacknowledged, consumers}'","output":"messages=18000 ready=1200 unacked=16800 consumers=6\nprefetch 窗口被慢处理占满，不是单纯 ready 积压\n先降生产与处理耗时，再扩消费者；重放任务另限速"}],
      ['十倍流量演练', '保持消息体与失败率不变，把生产速率提升十倍十分钟，观察 ready、unacked、磁盘、publish blocked 与业务 p99。根据曲线决定扩消费者、降 prefetch、拆分队列或拒绝入口流量，并记录恢复所需时间。验收标准应包含无 broker 资源告警、下游不超连接池、积压可回落到阈值以下且死信原因可解释，并记录恢复后的正常流量占比。', '容量方案要能解释拐点', {"title":"十倍流量演练","language":"bash","code":"docker run --rm --network host pivotalrabbitmq/rabbitmq-perf-test:latest \\\n  --uri amqp://guest:guest@localhost:5672 --queue orders.created \\\n  --size 512 --time 10m --rate 1000 --producers 4 --consumers 8\nrabbitmqctl list_queues name messages messages_unacknowledged consumers\nrabbitmqctl list_channels name prefetch_count messages_unacknowledged","output":"sending rate avg: 1000 msg/s\nreceiving rate avg: 720 msg/s\norders.created messages=168000 unacked=160 consumers=8\n吞吐缺口来自消费处理，broker CPU 与磁盘仍在预算内"}],
    ],
  },
];

const m4Stage = 'Nginx、Gateway 与负载均衡';
const m4Name = (topic: string) => `中间件源码 · ${m4Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m4Name('event cycle、worker 和连接状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已理解 TCP 连接、文件描述符和 Linux 非阻塞 IO，能启动 Nginx 并读取 error.log。',
    goal: '能解释 Nginx master/worker、epoll 事件循环和连接状态，并用 stub_status 与文件描述符指标定位连接耗尽。',
    guidedPractice: '在启用 stub_status 的测试 Nginx 上保持多条长连接并发送慢请求，记录 Active、Reading、Writing、Waiting、worker_connections 与进程文件描述符数量。',
    independentPractice: '独立调低 worker_connections 复现连接耗尽，恢复配置后证明新连接可用，并说明 keepalive 与 upstream 连接池分别消耗在哪一层。',
    commonErrors: [
      '以为 worker_processes 越多越好，忽略每个 worker 的 worker_connections 和系统文件描述符上限。',
      '只看 Active 连接数，不区分 Waiting、Reading、Writing，误判连接池和慢后端造成的问题。',
    ],
    sourceRefs: [
      'Nginx Documentation: Connection processing methods. https://nginx.org/en/docs/events.html',
      'Nginx source: src/event/ngx_event.c. https://github.com/nginx/nginx/blob/master/src/event/ngx_event.c',
    ],
    steps: [
      ['master 与 worker 分工', 'master 读取配置、绑定监听端口并管理 worker，worker 以非 root 用户处理连接和上游请求，平滑 reload 时新旧 worker 短暂并存。每个 worker 独立维护事件循环，连接量不由 master 统一调度；验证应读取 worker 进程、监听 socket 与 nginx -T 的最终配置。若只看 master 进程存在，不能证明后端或配置已正常服务，还要核对 worker 的归属与监听端口。', '管理进程不处理业务连接', {"title":"master 与 worker 分工","language":"bash","code":"docker exec gateway nginx -t\ndocker exec gateway nginx -T | rg -n 'worker_processes|worker_connections|server_name'\ndocker exec gateway ps -eo pid,ppid,cmd | rg 'nginx: (master|worker)'\ndocker exec gateway nginx -s reload","output":"syntax is ok / test is successful\nworker_processes auto\nworker_connections 4096\n1 master + 8 worker\nreload 后旧 worker 优雅退出"}],
      ['epoll 事件循环', 'Linux 上 Nginx 使用 epoll 等事件驱动机制，在 ngx_event.c 与平台事件模块中把可读可写事件加入定时器与队列，同一个 worker 可管理大量空闲连接而不为每条连接创建线程。连接空闲会增加 Waiting，不一定消耗 CPU；大量活跃响应才会推高 CPU 与 Writing。验证要同时读取 stub_status 与 worker CPU，不能只按连接数扩容或仅凭 CPU 判断容量。', '事件就绪才处理', {"title":"epoll 事件循环","language":"bash","code":"PID=$(docker exec gateway pgrep -o -f 'nginx: worker process')\ndocker exec gateway timeout 3 strace -f -p \"$PID\" -e trace=epoll_wait,accept4,recvfrom,sendto\ndocker exec gateway cat /proc/$PID/status | rg 'Threads|voluntary_ctxt_switches'","output":"epoll_wait(12, [{EPOLLIN, {u32=...}}], 512, 1000) = 1\naccept4(8, ...) = 24\nThreads: 1\nvoluntary_ctxt_switches: 1821"}],
      ['连接与文件描述符预算', 'worker_connections 限制单 worker 可同时处理的连接，代理场景一条客户端连接通常还占用一条 upstream 连接，因此实际客户端容量小于该值；worker_rlimit_nofile 与 systemd LimitNOFILE 必须覆盖监听、日志、上游和临时文件。验证可在受限测试机观察 accept 失败与打开文件数，不能把 1024 默认值直接套到代理节点，并记录系统级限制。', '每条代理连接占两份配额', {"title":"连接与文件描述符预算","language":"bash","code":"docker exec gateway sh -lc 'ulimit -n; cat /proc/$(pgrep -o nginx)/limits'\ndocker exec gateway ss -s\ndocker exec gateway ss -tan state established '( sport = :80 )' | wc -l\ndocker exec gateway tail -20 /var/log/nginx/error.log","output":"1048576\nMax open files 1048576 1048576 files\nTCP: 8123 estab, 1024 timewait\n80 端口 established 约 4000\n日志出现 worker_connections are not enough"}],
      ['keepalive 与 upstream 池', '客户端 keepalive_timeout 延长复用窗口，upstream 块内 keepalive 指令缓存到后端的空闲连接，但还需 proxy_http_version 1.1 与 Connection 请求头清空才能按预期复用。池太小会出现频繁握手，池太大占用后端连接；验证可比较 upstream keepalive 数调整前后的连接建立率和后端并发，并确认请求头已被正确清理，同时保存连接复用率与握手次数。', '复用连接要两端协议配合', {"title":"keepalive 与 upstream 池","language":"nginx","code":"upstream api_pool {\n    server app1:8080;\n    server app2:8080;\n    keepalive 64;\n}\nserver {\n    location /api/ {\n        proxy_http_version 1.1;\n        proxy_set_header Connection \"\";\n        proxy_pass http://api_pool;\n    }\n}","output":"nginx -t 通过\n压测前 app1 ESTAB=0\n持续 500 rps 后每台 app ESTAB 稳定在 20-30\n没有为每个请求重新建立 TCP 连接"}],
      ['连接耗尽实验', '在隔离环境把 worker_connections 设成较小值，用并发长连接与慢响应占满配额，stub_status 与 error.log 应显示连接不足或上游等待；恢复配置并 reload 后验证新请求成功率。若只增加 worker_processes 而不调整文件描述符，仍可能失败。验收应记录 Active、fd 使用、错误日志、恢复时间和 reload 后的新连接结果，并核对 worker 配置是否真正重载。', '容量边界可观测才可运维', {"title":"连接耗尽实验","language":"bash","code":"docker exec gateway nginx -T | rg 'worker_connections'\nwrk -t8 -c5000 -d30s http://127.0.0.1/api/slow > wrk.out\ndocker exec gateway tail -50 /var/log/nginx/error.log\ndocker exec gateway ss -tan | awk '{print $1}' | sort | uniq -c","output":"worker_connections 1024\nnon-200 responses: 18342\nworker_connections are not enough\nSYN-SENT 2100 TIME-WAIT 900 ESTAB 1020\n连接配额不足时请求无法进入 upstream"}],
    ],
  },
  {
    name: m4Name('upstream、健康检查与负载策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能配置 proxy_pass 到上游服务，理解 Nginx 开源版与商业版功能边界。',
    goal: '能选择轮询、least_conn 与哈希策略，用被动 max_fails、fail_timeout 和 proxy_next_upstream 处理单实例故障。',
    guidedPractice: '启动两个返回实例标识的后端，配置 upstream 并分别使用轮询、least_conn 与 ip_hash，停止其中一个实例后记录客户端响应、Nginx error.log 和恢复时间。',
    independentPractice: '独立为状态服务设计保持会话方案，说明为何 ip_hash 不适用于 NAT 后大量客户端，并比较粘性 Cookie、外部分布式会话与无状态令牌的成本。',
    commonErrors: [
      '把 Nginx 开源版被动失败检测当作立即健康检查，不知道实例要失败并经过 fail_timeout 才会暂时摘除。',
      '使用 ip_hash 解决登录会话后，忽略 NAT 客户端共享 IP 造成的严重倾斜。',
    ],
    sourceRefs: [
      'Nginx Documentation: ngx_http_upstream_module. https://nginx.org/en/docs/http/ngx_http_upstream_module.html',
      'Nginx Documentation: ngx_http_proxy_module. https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
    ],
    steps: [
      ['upstream 与 proxy_pass', 'upstream 块给后端命名并保存 server 列表，location 中的 proxy_pass 把请求转到该组；proxy_set_header Host、X-Forwarded-For 与 X-Forwarded-Proto 要由入口层正确设置，否则后端生成错误链接与日志。DNS 解析时机、尾部斜杠和路径改写会改变实际 URI，验证必须从后端访问日志看 method、host、path 和来源地址，并核对原始 URI 与改写值，同时比较入口日志与响应头并保存响应头。', '代理规则要追到后端请求', {"title":"upstream 与 proxy_pass","language":"nginx","code":"upstream orders_api {\n    zone orders_api 64k;\n    server 10.0.0.11:8080 max_fails=3 fail_timeout=10s;\n    server 10.0.0.12:8080 max_fails=3 fail_timeout=10s;\n}\nserver {\n    location /orders/ {\n        proxy_set_header Host $host;\n        proxy_set_header X-Request-Id $request_id;\n        proxy_pass http://orders_api;\n    }\n}","output":"curl -i http://gateway/orders/42\nHTTP/1.1 200 OK\nX-Request-Id: 4b9c...\nupstream response 中 host 为 gateway，服务端可按共享 zone 维护状态"}],
      ['负载策略选择', '默认轮询按权重分配，least_conn 偏向当前活动连接较少的实例，ip_hash 按客户端地址稳定映射，hash 指令可按自定义 key 做一致性散列。策略只改变选择，不修复后端请求耗时差异；长连接和无状态服务通常优先 least_conn 或随机均衡。验证要按实例统计请求数、活跃连接与 p99，而不只比较总吞吐。', '策略匹配请求与实例特征', {"title":"负载策略选择","language":"nginx","code":"upstream cpu_bound { least_conn; server app1:8080; server app2:8080; }\nupstream session_pin {\n    ip_hash;\n    server app1:8080;\n    server app2:8080;\n}\n# 分别用相同请求序列压测，记录每实例完成数和 p99\nfor i in $(seq 1 20); do curl -s http://gateway/api/whoami; done","output":"least_conn: app1=84 app2=116, p99=92ms\nip_hash: app1=100 app2=100, p99=118ms\n长连接 CPU 型服务适合 least_conn\n会话共享仍应优先于客户端哈希"}],
      ['开源被动失败检测', 'Nginx 开源版 server 的 max_fails 与 fail_timeout 是失败次数和观察窗口，连接失败、超时或特定响应可计入失败；NGINX Plus 才提供主动 health_check。被动检测期间仍可能有请求先失败，需要客户端重试或入口保护。验证应停后端并检查首个失败请求、后续摘除窗口与自动恢复，不能把页面上仍显示 server 当健康。', '失败后摘除而不是提前探测', {"title":"开源被动失败检测","language":"nginx","code":"upstream orders_api {\n    server app1:8080 max_fails=2 fail_timeout=10s;\n    server app2:8080 max_fails=2 fail_timeout=10s;\n}\nserver {\n    location /api/ {\n        proxy_connect_timeout 1s;\n        proxy_next_upstream error timeout http_502 http_503;\n        proxy_pass http://orders_api;\n    }\n}","output":"docker stop app1\n前两次请求可能失败或重试\n10 秒窗口内 app1 被标记不可用\nhealthy 请求全部落到 app2，10 秒后重新尝试 app1"}],
      ['proxy_next_upstream', 'proxy_next_upstream 指定连接错误、超时、部分 5xx 等条件下尝试下一台，proxy_next_upstream_tries 和 timeout 限制重试预算；对非幂等 POST 盲目重试可能重复扣款。错误响应若未被列入条件，会直接返回客户端。验证应分别制造连接拒绝、读超时和业务 500，记录尝试次数与后端副作用，确认重试集合符合业务语义。', '代理重试必须尊重幂等性', {"title":"proxy_next_upstream","language":"nginx","code":"location /api/ {\n    proxy_next_upstream error timeout invalid_header http_502 http_503;\n    proxy_next_upstream_tries 2;\n    proxy_next_upstream_timeout 3s;\n    proxy_pass http://orders_api;\n}\n# 注入幂等 GET 与非幂等 POST，对比重试边界\ncurl -i -X GET http://gateway/api/orders/42\ncurl -i -X POST http://gateway/api/orders -d '{\"id\":\"A-42\"}'","output":"GET：app1 connection refused，重试 app2 后 200\nPOST：默认不因 502 无限重放\naccess log 记录 upstream_addr 与 request_id\n重试总耗时 31ms，未超过 3s"}],
      ['故障摘除与恢复演练', '停止一台后端后连续请求上游组，观察失败请求被转发到存活实例、max_fails 达到后暂时摘除，以及 fail_timeout 后试探恢复。若两台都失败，应返回明确 502 或 504 并触发入口告警。验收需要后端实例标识、Nginx error.log、请求状态码、恢复时间和重试次数五组证据，并记录摘除前后每台实例成功率。', '摘除和恢复都要验证', {"title":"故障摘除与恢复演练","language":"bash","code":"docker stop app1\nfor i in $(seq 1 10); do curl -s -o /dev/null -w '%{http_code} %{upstream_addr}\\n' http://gateway/api/health; done\ndocker start app1\nsleep 12\nfor i in $(seq 1 10); do curl -s -o /dev/null -w '%{http_code} %{upstream_addr}\\n' http://gateway/api/health; done","output":"停机后首轮出现 1 次 502，rest 200 均指向 app2\nerror.log 记录 connect refused\n恢复 10 秒后请求重新分散到 app1 与 app2\n健康摘除与恢复均有上游地址证据"}],
    ],
  },
  {
    name: m4Name('proxy buffering、超时和流式响应'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '已完成 upstream 路由课时，能区分连接建立超时、读超时与客户端写超时。',
    goal: '能解释 proxy_buffering、缓冲区与临时文件，分别配置普通 JSON、慢后端和 SSE，并证明各层超时的触发条件。',
    guidedPractice: '用同一后端提供普通响应、慢响应和持续事件流，切换 proxy_buffering on/off，记录客户端首字节时间、Nginx 临时文件与 proxy_read_timeout 错误日志。',
    independentPractice: '独立为订单查询与通知流配置两个 location，给出缓冲、超时、上传大小和连接头设置，并用 curl 与日志证明订单不被截断、事件流持续输出。',
    commonErrors: [
      '把 proxy_read_timeout 当成后端总处理时间，实际上它按两次读操作之间无数据计时。',
      '启用 buffering 同时希望 SSE 实时到达，未关闭缓冲或使用 X-Accel-Buffering。',
    ],
    sourceRefs: [
      'Nginx Documentation: proxy buffering and timeouts. https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
      'Nginx Documentation: WebSocket proxying. https://nginx.org/en/docs/http/websocket.html',
    ],
    steps: [
      ['proxy_buffering 机制', '开启 proxy_buffering 后 Nginx 尽快从后端读取响应到内存缓冲区，客户端按自身速度消费，缓冲区超出 proxy_buffers 可写临时文件，proxy_max_temp_file_size 可以关闭或限制这一能力。它解耦慢客户端和快后端，但会让首字节与后端真实推送时机分离；验证要观察日志中的 upstream 完成时间、临时文件增长与客户端首包时间。', '缓冲解耦两端速度', {"title":"proxy_buffering 机制","language":"nginx","code":"location /report/ {\n    proxy_buffering on;\n    proxy_buffers 8 16k;\n    proxy_buffer_size 8k;\n    proxy_busy_buffers_size 32k;\n    proxy_max_temp_file_size 64m;\n    proxy_pass http://report-api;\n}\ncurl -s -o /dev/null -w 'ttfb=%{time_starttransfer} total=%{time_total}\\n' http://gateway/report/10m","output":"report-api 分 20 块缓慢写 10MB\nNginx 先缓冲后向客户端发送\nttfb=0.92s total=1.10s\n客户端断开后 upstream 仍可短时间完成"}],
      ['超时类型边界', 'proxy_connect_timeout 限制与后端建立连接，proxy_send_timeout 限制向上游发送两次写之间的间隔，proxy_read_timeout 限制从上游读取两次数据之间的间隔，不是整个请求固定上限。后端持续发送小片段可让读超时反复重置，而完全没有数据才会触发。验证可分别模拟连接拒绝、发送停滞和读停滞，并在 error.log 中确认对应阶段。', '超时针对阶段间隔', {"title":"超时类型边界","language":"nginx","code":"location /slow/ {\n    proxy_connect_timeout 1s;\n    proxy_send_timeout 5s;\n    proxy_read_timeout 8s;\n    send_timeout 5s;\n    proxy_pass http://slow-api;\n}\ncurl -s -o /dev/null -w 'code=%{http_code} total=%{time_total}\\n' http://gateway/slow/9s\ntail -5 /var/log/nginx/error.log","output":"code=504 total=8.003\nupstream timed out (110: Connection timed out)\nwhile reading response header from upstream\n连接已建立，失败发生在读取 upstream 响应阶段"}],
      ['流式响应配置', 'SSE 或长轮询需要 proxy_buffering off 或后端返回 X-Accel-Buffering: no，同时使用 HTTP/1.1、空 Connection 与足够长的 proxy_read_timeout，避免 Nginx 聚合事件。压缩可能继续延迟小片段，应结合 gzip 条件评估。验证用 curl -N 记录事件到达间隔，并在客户端断开后确认上游连接释放，同时检查响应头与 chunk 边界，保存首包、尾包和断开时间，并记录每次推送与响应字节。', '流式路径要关闭聚合', {"title":"流式响应配置","language":"nginx","code":"location /events/ {\n    proxy_http_version 1.1;\n    proxy_set_header Connection \"\";\n    proxy_buffering off;\n    proxy_cache off;\n    chunked_transfer_encoding on;\n    proxy_read_timeout 1h;\n    proxy_pass http://sse-api;\n}\ncurl -N -s http://gateway/events/42 | head -3","output":"id: 1700000000001\ndata: {\"type\":\"status\",\"value\":\"queued\"}\nid: 1700000000002\n客户端在每个事件到达时立即收到，而非等待整段响应"}],
      ['请求体与上传边界', 'client_max_body_size 在请求体读取阶段限制大小，client_body_buffer_size 控制内存缓冲并可能写入临时文件，proxy_request_buffering off 可边收边发但会把慢客户端压力传给后端。上传接口应结合限速、临时目录和磁盘余量监控；验证应发送边界大小、超限体和慢上传，观察 413、临时文件与后端连接占用及清理结果，并核对超限上传的临时文件已清理。', '入站缓冲也有资源代价', {"title":"请求体与上传边界","language":"nginx","code":"client_max_body_size 8m;\nclient_body_timeout 10s;\nclient_body_buffer_size 128k;\nlocation /upload {\n    proxy_request_buffering on;\n    proxy_pass http://upload-api;\n}\nhead -c 9000000 /dev/zero > big.bin\ncurl -i -F file=@big.bin http://gateway/upload","output":"HTTP/1.1 413 Request Entity Too Large\n<html><center><h1>413 Request Entity Too Large</h1>\n应用未收到完整上传体\n小文件 7MB 返回 201，Content-Length 正确"}],
      ['超时与流式对照实验', '先让后端每两秒推送一次持续二十秒，确认 SSE location 客户端持续收到；再把普通 JSON location 的 proxy_read_timeout 调到低于后端无响应间隔，复现 504 并从日志定位。两个路径调试完成后，验收应保存首字节时间、事件间隔、状态码和后端取消行为，并确认超时路径没有继续占用上游连接，还要记录每次超时对应的实例。', '接口类型决定代理配置', {"title":"超时与流式对照实验","language":"bash","code":"for mode in buffered streamed; do\n  curl -N -s -o /dev/null -w \"$mode ttfb=%{time_starttransfer} total=%{time_total}\\n\"     \"http://gateway/$mode/event-stream\"\ndone\ndocker exec gateway tail -20 /var/log/nginx/error.log","output":"buffered ttfb=5.012 total=5.021\nstreamed ttfb=0.104 total=5.018\n开启 buffering 时首字节被延迟\n流式场景下 proxy_buffering off 明显降低 TTFB"}],
    ],
  },
  {
    name: m4Name('Gateway 路由、过滤器和全局异常'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已完成 Nginx 入口课时，了解 HTTP 路由、过滤器链与 WebFlux 非阻塞模型。',
    goal: '能配置 Spring Cloud Gateway 的 predicate 与 filter 顺序，处理全局异常和下游超时，并识别阻塞调用对事件循环的破坏。',
    guidedPractice: '用 YAML 声明路径与主机 predicate、StripPrefix 与限流过滤器，再加入一个记录耗时的 GlobalFilter，通过 actuator/gateway/routes 和下游日志核对最终路径与执行顺序。',
    independentPractice: '独立实现超时、重试与统一错误响应，要求只对幂等 GET 重试，并用测试证明 404、下游 503 与超时不会被包装成错误状态码。',
    commonErrors: [
      '普通 Filter 链里调用阻塞 JDBC 或同步 HTTP，耗尽 WebFlux 事件循环线程。',
      '只按 filter 名称猜测顺序，不知道 Ordered 值与多个 filter 的组合会改变请求和响应阶段。',
    ],
    sourceRefs: [
      'Spring Cloud Gateway Reference. https://docs.spring.io/spring-cloud-gateway/reference/',
      'Spring Framework WebFlux Reference. https://docs.spring.io/spring-framework/reference/web/webflux.html',
    ],
    steps: [
      ['Route 与 Predicate', '每条 Gateway route 由 id、目标 uri、predicate 集合与 filter 集合组成，路径、Host、Header、Method 等 predicate 都匹配才会进入该 route；顺序靠前的 route 先判断。uri 可以指向服务发现服务名或固定地址，lb 前缀使用负载均衡客户端。验证可从 actuator/gateway/routes 读取最终配置，并用不同 Host 与 path 请求确认只命中一个后端，同时记录命中的 route id，并保存最终路由表与命中次数。', '先匹配路由再执行过滤', {"title":"Route 与 Predicate","language":"yaml","code":"spring:\n  cloud:\n    gateway:\n      routes:\n        - id: orders-v1\n          uri: http://orders-api:8080\n          predicates:\n            - Path=/api/orders/**\n            - Header=X-Api-Version, v1\n          filters:\n            - StripPrefix=1\nmanagement:\n  endpoints:\n    web:\n      exposure:\n        include: gateway","output":"GET /api/orders/42 + X-Api-Version:v1\n下游收到 /orders/42，返回 200\n缺少版本头返回 404\n/actuator/gateway/routes 列出 orders-v1 predicate"}],
      ['Filter 顺序与请求改写', 'Gateway 把 RoutePredicateHandlerMapping、GatewayFilter 与 GlobalFilter 组成责任链，pre 阶段按顺序执行，post 阶段逆序返回；StripPrefix、RewritePath 与 AddRequestHeader 会改变下游看到的请求。Ordered 值相同时合并规则仍可能受注册顺序影响，必须通过下游访问日志验证 URI 与 headers。若只在入口打日志，无法看出改写后的真实请求与响应头变化，应逐层记录请求头与路径结果。', '入口与下游请求要分开核对', {"title":"Filter 顺序与请求改写","language":"yaml","code":"filters:\n  - AddRequestHeader=X-Gateway, edge\n  - AddRequestParameter=source, gateway\n  - name: RequestRateLimiter\n    args:\n      redis-rate-limiter.replenishRate: 20\n      redis-rate-limiter.burstCapacity: 40\n      key-resolver: \"#{@userKeyResolver}\"\n  - StripPrefix=1\ncurl -i http://gateway/api/orders/42","output":"downstream headers X-Gateway: edge\nquery source=gateway\n第 41 个突发请求返回 429\n扩展日志 order=AddHeader,AddParam,RateLimit,StripPrefix"}],
      ['异常响应边界', '下游连接失败、响应超时与业务 4xx 具有不同语义，GlobalFilter 和 ErrorWebExceptionHandler 应保留可识别状态码并返回统一错误体，不能把所有异常改成 200。重试过滤器只应覆盖幂等请求，且总时长与次数受全局 deadline 限制。验证分别制造 404、503、读超时和非法参数，检查状态码、错误码与 traceId 一致，并确认重试没有掩盖原始原因。', '异常映射不能吞掉状态', {"title":"异常响应边界","language":"javascript","code":"try {\n  await chain.filter(exchange);\n} catch (ResponseStatusException error) {\n  ServerHttpResponse response = exchange.getResponse();\n  if (response.isCommitted()) {\n    log.error('response already committed', error);\n    return;\n  }\n  response.setStatusCode(error.getStatusCode());\n  response.getHeaders().setContentType(MediaType.APPLICATION_JSON);\n  return response.writeWith(Mono.just(bufferFactory.wrap(\n    json.writeValueAsBytes(Map.of(\"code\", \"UPSTREAM_ERROR\"))\n  )));\n}","output":"下游连接失败且尚未提交响应\n客户端收到 502 与 {\"code\":\"UPSTREAM_ERROR\"}\n响应已提交后再次异常，只记录日志\n不会尝试写第二个状态码"}],
      ['WebFlux 阻塞边界', 'Gateway 运行在 WebFlux 响应式线程模型，自定义 filter 中的阻塞 JDBC、Thread.sleep 或同步 HTTP 会占住事件循环线程，使其他请求排队。需要阻塞资源时应隔离到 boundedElastic 并限制并发，不能简单 subscribe 后继续执行。验证可在 filter 中模拟阻塞并压测，观察事件循环线程数、队列长度与延迟之间的相关性，并保存线程状态与错误日志。', '阻塞调用会放大入口延迟', {"title":"WebFlux 阻塞边界","language":"java","code":"@Bean\npublic RouteLocator routes(RouteLocatorBuilder builder, WebClient client) {\n  return builder.routes()\n    .route(\"orders\", r -> r.path(\"/api/orders/**\")\n      .filters(f -> f.filter((exchange, chain) ->\n        Mono.fromCallable(() -> jdbcTemplate.queryForList(\"SELECT 1\"))\n          .subscribeOn(Schedulers.boundedElastic())\n          .then(chain.filter(exchange))))\n      .uri(\"http://orders-api:8080\"))\n    .build();\n}\nBlockHound.install();","output":"BlockHound 在阻塞 JDBC 调用处报告 event-loop 线程违规\n改用 boundedElastic 后警告消失\n10 并发下路由线程未被数据库等待占住\np99 从 2100ms 降到 180ms"}],
      ['路由热更新与故障验收', '配置中心更新 route 后，用 actuator 查询确认旧 route 与新的 predicate 已切换，再发起两套路径请求；若目标实例下线，LoadBalancer 与重试应返回受控错误并记录上游耗时。验收要保存路由快照、下游日志、错误码、恢复时间与请求命中 route id，避免只凭管理端点 JSON 判定生效，并核对旧路由已不可再次命中。', '配置生效要落到真实请求', {"title":"路由热更新与故障验收","language":"bash","code":"curl -s -X POST http://gateway/actuator/gateway/refresh | jq\ncurl -s http://gateway/actuator/gateway/routes | jq '.[].route_id'\ncurl -i http://gateway/api/orders/42\ndocker stop orders-api\ncurl -i http://gateway/api/orders/42\ndocker start orders-api","output":"refresh 返回 {\"refreshed\":true}\nroutes 列表保持 orders-v1\n正常时 200，停上游后 502\n重启后路由无需重启网关即可恢复 200\n事件记录刷新时间与两次错误码"}],
    ],
  },
  {
    name: m4Name('L4/L7、会话保持和故障域'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能区分 TCP 与 HTTP 请求，理解 Nginx upstream 和 Gateway 的基本路由。',
    goal: '能根据协议能力、粘性会话、健康检查和故障域选择 L4 或 L7 入口，并设计跨机房失效时的流量降级。',
    guidedPractice: '搭建一个 TCP 负载入口和一个 HTTP Gateway 入口，分别观察客户端 IP、Host、请求路径与连接复用，再停止一个可用区实例记录健康摘除和跨区流量。',
    independentPractice: '独立为 WebSocket 通知与普通 API 写入口层方案，说明 L4 透传、L7 路由、会话保持、跨区配额和回滚条件。',
    commonErrors: [
      '在 L4 层按 Host 或路径路由，忽略 TCP 负载器看不到加密后的 HTTP 内容。',
      '把会话粘性当作高可用，实例故障后内存会话仍丢失，用户被迫重新登录。',
    ],
    sourceRefs: [
      'Nginx Documentation: Load balancing. https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/',
      'Spring Cloud Gateway Reference: LoadBalancer. https://docs.spring.io/spring-cloud-gateway/reference/',
    ],
    steps: [
      ['L4 与 L7 能力边界', 'L4 负载器按 TCP/UDP 连接和源地址等传输信息转发，看不到 HTTP Host、路径与 Cookie，适合 TLS 透传和高吞吐连接；L7 代理终止或理解 HTTP，可做路径路由、头部改写、重试和观测，但需要处理证书、请求缓冲与协议解析。验证应分别从后端读取 SNI、Host、路径和客户端地址，确认入口实际暴露的信息。', '代理层级决定可见信息', {"title":"L4 与 L7 能力边界","language":"nginx","code":"stream {\n    upstream mysql_tcp {\n        server mysql1:3306;\n        server mysql2:3306;\n    }\n    server { listen 13306; proxy_pass mysql_tcp; }\n}\nhttp {\n    server {\n        listen 8080;\n        location /api/ { proxy_pass http://orders_api; }\n    }\n}","output":"mysql -h127.0.0.1 -P13306 成功建立 TCP 会话\nstream 层看不到 HTTP Host 与 Path\nhttp 层可按 /api/ 路由并改写 Header\n两层分别使用 13306 与 8080"}],
      ['连接级负载与请求级负载', 'L4 通常按新连接分配，长连接会让负载长期落在少数后端；L7 可逐请求选择 upstream，但 keepalive 连接池仍影响分布。least_conn、加权与哈希参数要结合请求耗时和连接复用判断，不能只看初始连接数。验证可在持续请求下统计每个后端的请求频率和活跃连接，观察长流与短 API 的差异。', '复用会改变分配粒度', {"title":"连接级负载与请求级负载","language":"bash","code":"wrk -t4 -c200 -d30s --latency http://gateway/api/quick\nmysqlslap --host=127.0.0.1 --port=13306 --concurrency=50   --iterations=5 --query='SELECT 1'\ndocker exec gateway ss -tan '( sport = :13306 or sport = :8080 )'","output":"HTTP 200 requests steady at 8200/s\nL4 连接集中在两台 MySQL，按新连接分配\n长连接 MySQL 客户端不会每查询重新负载\nHTTP 可按请求切分，L4 以连接为边界"}],
      ['会话保持方案', 'ip_hash 以客户端地址稳定映射，NAT 后大量用户共享地址会倾斜；Cookie 粘性把实例写入 Cookie，扩容会改变映射；无状态令牌或外部共享会话不依赖入口粘性。粘性只保路由，不保证实例故障后会话仍存在。验证应模拟客户端固定来源、实例下线与重新登录，比较会话丢失和分布均匀度。', '粘性不能替代共享状态', {"title":"会话保持方案","language":"nginx","code":"upstream portal {\n    hash $cookie_session consistent;\n    server portal1:8080;\n    server portal2:8080;\n}\nserver {\n    location /portal/ {\n        proxy_pass http://portal;\n        add_header Set-Cookie \"session=abc; Path=/; HttpOnly; Secure\" always;\n    }\n}","output":"相同 Cookie 的 10 次请求均落到 portal1\n清空 Cookie 后请求可落 portal2\nportal1 下线后 consistent hash 仅迁移其键\n服务端会话仍应外置到 Redis 以支持故障切换"}],
      ['健康检查与故障域', '入口健康检查应区分进程存活、依赖就绪和可接流量，跨可用区 upstream 要设置权重与最大故障域容量，避免一个区故障后剩余区被瞬间压垮。Nginx 开源被动检测需要请求先失败，Gateway 可结合服务发现状态；指标应记录实例、可用区和失败原因。验证需要停止单实例、再停止整个区，确认流量下降与恢复边界。', '可用区容量要预留余量', {"title":"健康检查与故障域","language":"nginx","code":"upstream orders_api {\n    zone orders_api 64k;\n    server app-az1:8080 max_fails=2 fail_timeout=5s;\n    server app-az2:8080 max_fails=2 fail_timeout=5s backup;\n}\nlocation /health {\n    proxy_pass http://orders_api/health;\n    proxy_next_upstream error timeout;\n}\ncurl -s -o /dev/null -w '%{http_code}\\n' http://gateway/health","output":"az1 正常时 backup 不接流量\naz1 两次连接失败后进入 fail_timeout\n请求切换到 az2，健康检查返回 200\n5 秒后恢复尝试 az1"}],
      ['双入口故障演练', '为同一服务保留 L4 与 L7 入口，停止一个 Nginx 实例和一组 Gateway 实例，记录 DNS 或 VIP 切换、TLS 握手、路由命中、上游重试和用户可见错误。验收要求单实例故障不造成全局失败、跨区容量不超过预算，并且回滚路径可在运行手册中逐步执行。只证明页面能打开不足以覆盖入口层。', '故障域决定入口冗余', {"title":"双入口故障演练","language":"bash","code":"curl -H 'Host: api.example.test' http://entry-a/health\ncurl -H 'Host: api.example.test' http://entry-b/health\ndocker stop entry-a\nfor i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: api.example.test' http://entry-b/health; done\ndocker start entry-a","output":"entry-a 与 entry-b 均返回 200\n停 entry-a 后 DNS 切流到 entry-b\n20 次请求全部 200，无连接拒绝\n两入口 upstream 健康状态分别留证"}],
    ],
  },
];

const m5Stage = 'Apollo、HikariCP 与配置发布';
const m5Name = (topic: string) => `中间件源码 · ${m5Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m5Name('Apollo Portal、Config Service 和客户端缓存'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能启动 Apollo 本地环境，理解应用配置与配置中心不是同一个运行进程。',
    goal: '能画出 Portal、Admin Service、Config Service 与客户端缓存的配置发布链路，并在 Config Service 短暂不可用时验证本地缓存兜底。',
    guidedPractice: '在 Apollo 测试环境创建应用与默认 namespace，发布一个键值，再在客户端打印配置来源和刷新时间，停止 Config Service 后重启客户端观察缓存读取。',
    independentPractice: '独立记录一次配置从 Portal 文本编辑到 release、客户端长轮询通知、内存生效和本地缓存落盘的完整时间线。',
    commonErrors: [
      '把 Portal 当客户端运行时依赖，Portal 不可用就认为应用不能启动或读取配置。',
      '只改草稿文本而没有创建 release，重启客户端后仍读到旧版本。',
    ],
    sourceRefs: [
      'Apollo Configuration Center Documentation. https://www.apolloconfig.com/',
      'Apollo Design. https://www.apolloconfig.com/#/zh/design/apollo-design',
    ],
    steps: [
      ['组件职责', 'Portal 提供人员操作和权限界面，Admin Service 处理应用、namespace 与 release 管理，Config Service 面向客户端提供配置读取，客户端通过 Meta Server 或配置地址发现服务。Portal 停机不应阻断运行时读取；验证应分别关闭 Portal 与 Config Service，记录客户端启动、刷新和错误行为。若把所有组件当单一 API，就无法解释控制面故障与数据面故障的差别。', '控制面与读取面分开', {"title":"组件职责","language":"bash","code":"docker compose ps apollo-portal apollo-configservice apollo-adminservice apollo-db\ncurl -fsS http://localhost:8080/services/config?appId=orders&ip=10.0.0.11\ncurl -fsS http://localhost:8090/health\ndocker logs --tail 20 apollo-configservice","output":"portal/configservice/adminservice/db all Up\n[{\"appName\":\"APOLLO-CONFIGSERVICE\",\"instanceId\":\"...\"}]\n{\"status\":\"UP\"}\nConfig Service 从 Eureka 返回可用实例"}],
      ['namespace 与键模型', 'Apollo 以 appId、cluster、namespace 定位配置，public namespace 可被多个应用关联，私有 namespace 只属于当前应用；键是字符串，类型校验与默认值通常在客户端绑定层完成。namespace 权限和发布范围决定影响面，不能把生产数据库密码放进公共 namespace。验证应查询目标 namespace 的实际 release 和键值，避免只按本地 properties 文件判断配置来源，并保留查询时间与操作人。', '定位三要素不可混用', {"title":"namespace 与键模型","language":"bash","code":"curl -s -u apollo:secret \\\n  'http://localhost:8070/apps/orders/envs/DEV/clusters/default/namespaces' |\n  jq '.[] | {namespaceName, format}'\ncurl -s -u apollo:secret \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/items' |\n  jq '.[] | select(.key|startswith(\"db.\"))'","output":"application JSON\norders.datasource JSON\n{\"key\":\"db.url\",\"value\":\"jdbc:mysql://...\",\"comment\":\"orders 主库\"}\n数据库键独立 namespace，避免与公共配置混写"}],
      ['客户端长轮询与缓存', '客户端启动时优先从本地缓存恢复，随后向 Config Service 请求配置并维护通知 ID，服务端没有变化时挂起通知请求，有变更时返回通知，客户端再拉取完整配置。Config Service 短暂不可达时，已缓存配置可让应用继续启动，但缓存可能是旧版本。验证要保存缓存文件路径、最后刷新时间和远程失败日志，明确降级边界。', '本地缓存保证可启动', {"title":"客户端长轮询与缓存","language":"bash","code":"find /opt/app/config-cache -type f -name 'orders+default+application.properties' -print\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.11'\ncurl -s -G 'http://localhost:8080/notifications/v2' \\\n  --data-urlencode 'appId=orders' --data-urlencode 'cluster=default' \\\n  --data-urlencode 'namespaceName=application' --data-urlencode 'notifications=[{\"namespaceName\":\"application\",\"notificationId\":-1}]'","output":"config-cache/orders+default+application.properties\n{\"configurations\":{\"feature.timeout\":\"3000\"}}\n首次长轮询立即返回，notificationId 增加\n后续 60 秒无变更时 request 保持挂起"}],
      ['发布链路与客户端生效', 'Portal 修改草稿后需创建 release，release 写入数据库并由 Admin Service 通知相关 Config Service，客户端收到通知后更新内存并触发变更监听。不是每次 getProperty 都访问远端，运行中读取通常走本地内存。验证应记录 release 版本、通知 ID 与监听器触发时间，若只打印最终值，无法区分是否在目标时刻、目标客户端生效。', '发布是版本化控制动作', {"title":"发布链路与客户端生效","language":"bash","code":"curl -s -u apollo:secret -X POST \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/items' \\\n  -H 'Content-Type: application/json' -d '{\"key\":\"feature.timeout\",\"value\":\"4500\"}'\ncurl -s -u apollo:secret -X POST \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases' \\\n  -H 'Content-Type: application/json' -d '{\"title\":\"调整超时\",\"releasedBy\":\"ops\"}'\nsleep 2\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.11' | jq '.configurations[\"feature.timeout\"]'","output":"item update 返回 200\nrelease 返回 releaseId=20261124001\n客户端长轮询收到通知并刷新缓存\n配置值变为 \"4500\"，无需重启应用"}],
      ['Config Service 故障演练', '停止一个 Config Service 实例后继续请求新客户端，已有缓存客户端应能启动并按退避重试；删除本地缓存再启动则可能无法获得配置。恢复服务后观察客户端重新同步的版本与时间。验收必须同时覆盖有缓存和无缓存两条路径，不能只验证服务恢复后页面可用。', '降级能力取决于缓存', {"title":"Config Service 故障演练","language":"bash","code":"docker compose stop apollo-configservice\nkill -0 $(pgrep -f orders-service)\ncurl -s http://orders-service:8080/actuator/env | jq '.propertySources[0].properties[\"feature.timeout\"]'\ndocker compose start apollo-configservice\nsleep 10\ndocker logs orders-service --since 2m | rg 'config.*refresh|connection refused'","output":"Config Service 停止期间应用进程仍在\n本地缓存返回 feature.timeout=4500\n未配置缓存的新实例启动失败并明确报错\n服务恢复后长轮询重建，旧实例无需重启"}],
    ],
  },
  {
    name: m5Name('命名空间、灰度、版本和回滚'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已能创建 Apollo namespace 和 release，理解应用与 cluster 的定位关系。',
    goal: '能用 namespace 隔离配置影响面，通过灰度规则限制发布范围，并依据 release 历史完成可审计回滚。',
    guidedPractice: '在测试应用创建公共与私有 namespace，发布一个灰度 release 仅命中指定客户端 IP，再回滚到上一版本，记录 release 编号、灰度规则、客户端生效和审计日志。',
    independentPractice: '独立设计一次连接池参数变更，要求先小范围灰度、观察指标、再全量，失败时回滚到明确 release 并验证旧配置恢复。',
    commonErrors: [
      '先修改公共 namespace 影响所有应用，再尝试在客户端代码中按应用忽略错误值。',
      '执行回滚只改文本草稿，没有发布新 release，客户端版本与审计记录仍停留在错误配置。',
    ],
    sourceRefs: [
      'Apollo Release Management. https://www.apolloconfig.com/#/zh/usage/apollo-user-guide?id=%E5%8F%91%E5%B8%83%E9%85%8D%E7%BD%AE',
      'Apollo Gray Release. https://www.apolloconfig.com/#/zh/usage/apollo-user-guide',
    ],
    steps: [
      ['namespace 影响面', '公共 namespace 通过关联让多个应用共享键，私有 namespace 只对当前应用可写，cluster 则用于同应用不同部署环境的差异。配置按应用、cluster、namespace 三层定位，任何一层写错都可能让目标实例读取另一份值。验证应从客户端日志打印 appId、cluster、namespace 与实际 release，不能只打开 Portal 的当前页查看目标值，并保存客户端上报的定位标签。', '共享范围决定风险范围', {"title":"namespace 影响面","language":"bash","code":"du -h /opt/app/config-cache/*.properties | sort -h\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.11' | jq '.configurations'\ncurl -s -u apollo:secret   'http://localhost:8070/apps/orders/envs/DEV/clusters/default/namespaces' | jq '.[].namespaceName'\nrg -n 'public-namespace|orders.datasource' deploy/","output":"application.properties 2.1KB\norders.datasource.properties 1.4KB\n3 个 namespace: application, orders.datasource, public\ndeploy 引用仅 application 与 orders.datasource\n公共 namespace 不应承载订单私密键"}],
      ['发布版本与审计', '每次 release 保存完整键值快照、发布人和发布时间，草稿修改不会自动进入客户端；审计还记录灰度规则变化。回滚应基于旧 release 创建新的发布动作，保留完整历史而不是删除记录。验证应比对 release key、JSON 内容、操作人和客户端拉取版本，确保错误值与正确值都有可追溯来源。', '版本快照支持可审计恢复', {"title":"发布版本与审计","language":"bash","code":"curl -s -u apollo:secret \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases' |\n  jq '.[0] | {id,title,operator,releaseTime}'\ncurl -s -u apollo:secret \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases/20261124001' |\n  jq '.configurations'\ngit show --stat HEAD","output":"releaseId 20261124001 title=调整超时 operator=ops\nreleaseTime=2026-11-24T10:00:00+08:00\n配置快照包含 feature.timeout=4500\n与部署提交、实例版本形成审计链"}],
      ['灰度规则生效', '灰度 release 只对匹配的客户端 IP 或 label 可见，其他实例继续读取全量旧版本；规则依赖客户端上报信息，代理、NAT 或错误 label 可能让命中范围偏离预期。验证应在至少两个客户端打印实例 IP、label、配置值和 release，确认命中与未命中两组证据。若只从一个实例读取，无法证明灰度边界。', '灰度必须对照命中组', {"title":"灰度规则生效","language":"bash","code":"curl -s -u apollo:secret -X POST \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"title\":\"灰度超时\",\"releasedBy\":\"ops\",\"grayReleaseRules\":[{\"clientIp\":\"10.0.0.11\"}]}'\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.11' |\n  jq '.configurations[\"feature.timeout\"]'\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.12' |\n  jq '.configurations[\"feature.timeout\"]'","output":"灰度 release 创建成功\n10.0.0.11 返回 4500\n10.0.0.12 仍返回 3000\n灰度实例日志记录配置刷新时间，未命中实例不变"}],
      ['回滚执行边界', '发布错误的最大连接数后，客户端可能已创建新连接池，单纯回滚配置不会自动关闭旧连接；回滚发布后还需触发安全重启、连接重建或应用级收敛逻辑。验证应记录错误 release、回滚 release、连接池指标恢复和业务请求结果。配置文件值恢复不等于运行时资源状态恢复，这一步是企业演练的关键。', '配置回滚不等于资源回滚', {"title":"回滚执行边界","language":"bash","code":"curl -s -u apollo:secret -X PUT \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases/20261124000' \\\n  -H 'Content-Type: application/json' -d '{\"operator\":\"oncall\"}'\ncurl -s 'http://localhost:8080/configs/orders/default/application?ip=10.0.0.11' |\n  jq '.configurations[\"feature.timeout\"]'\ndocker restart orders-service-1\ndocker logs orders-service-1 --since 2m | tail -20","output":"回滚到 release 20261124000\n旧实例收到通知后超时恢复 3000\n重启实例读取回滚快照 3000\n数据库连接池参数变化仍需重建运行时资源"}],
      ['配置变更联合验收', '为一次连接池上限调整建立变更单，包含目标 namespace、灰度实例、观察指标、失败阈值和回滚 release。按灰度发布后观察十分钟，再全量发布并核对所有实例 release；注入超时后执行回滚并验证旧值。验收要包含版本、实例、指标、审计与回滚耗时五条证据链，并核对发布后每个实例实际值。', '变更动作留下证据链', {"title":"配置变更联合验收","language":"bash","code":"scripts/check-config-release.sh --app orders --release 20261124002\ncurl -s http://orders-service:8080/actuator/health | jq\ncurl -s http://orders-service:8080/actuator/metrics/hikaricp.connections.active\npsql -c \"SELECT state, count(*) FROM pg_stat_activity WHERE datname='orders' GROUP BY state\"\ncurl -s -o /dev/null -w '%{http_code}\\n' http://gateway/api/orders/42","output":"release 配置与期望 diff 为空\nhealth=UP，数据库连接 active=8\npg sessions active=8 idle=2\n业务请求返回 200\n配置、运行时连接、数据库会话、业务链路四层一致"}],
    ],
  },
  {
    name: m5Name('HikariCP 获取、归还和等待队列'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能用 JDBC 执行查询，理解连接不是线程且数据库连接有独立会话状态。',
    goal: '能解释 HikariCP 的池化连接、ConcurrentBag 获取、close 归还与等待超时，并读懂 active、idle、waiting 指标。',
    guidedPractice: '把 maximumPoolSize 设为 2，启动十个并发查询并记录 HikariPool 指标、getConnection 等待和 connectionTimeout，再逐步归还连接观察 waiting 下降。',
    independentPractice: '独立构造连接获取超时与服务响应变慢两种负载，区分池耗尽与查询本身慢，并给出连接池大小和数据库连接预算。',
    commonErrors: [
      '把 maximumPoolSize 当作线程数，盲目调到几百，最终超过数据库 max_connections 并拖慢整库。',
      '调用 getConnection 后异常路径没有关闭，活跃连接长期不归还，线程池随后全部等待。',
    ],
    sourceRefs: [
      'HikariCP Documentation. https://github.com/brettwooldridge/HikariCP',
      'HikariCP source: ConcurrentBag.java. https://github.com/brettwooldridge/HikariCP/blob/dev/src/main/java/com/zaxxer/hikari/util/ConcurrentBag.java',
    ],
    steps: [
      ['池化连接的资源模型', 'HikariCP 在启动或最小空闲时创建物理 JDBC Connection，并把包装后的连接对象借给应用线程，close 表示归还而不是关闭物理连接。连接内含会话、事务和游标状态，异常路径必须回滚并 close；否则拿到同一物理连接的下一次请求会继承脏状态。验证应同时记录业务连接数、数据库会话数和池指标，而不是只看请求 QPS。', '借出与归还是核心协议', {"title":"池化连接的资源模型","language":"java","code":"HikariConfig config = new HikariConfig();\nconfig.setJdbcUrl(\"jdbc:postgresql://db:5432/orders\");\nconfig.setUsername(\"orders_app\");\nconfig.setPassword(System.getenv(\"DB_PASSWORD\"));\nconfig.setMaximumPoolSize(10);\nconfig.setMinimumIdle(2);\nconfig.setConnectionTimeout(3000);\nconfig.setPoolName(\"orders-pool\");\ntry (HikariDataSource ds = new HikariDataSource(config);\n     Connection connection = ds.getConnection();\n     PreparedStatement ps = connection.prepareStatement(\"SELECT 1\")) {\n  ps.executeQuery().next();\n}","output":"HikariPool-1 - Starting...\nHikariPool-1 - Added connection org.postgresql.jdbc.PgConnection\nHikariPool-1 - Start completed.\ntry block 关闭后连接归还，物理连接不销毁"}],
      ['ConcurrentBag 获取路径', 'ConcurrentBag 优先让请求线程从线程本地或共享空闲集合取得连接，空闲没有时再进入等待队列；新增连接与超时由 HouseKeeper 和池管理逻辑处理。maximumPoolSize 限制借出与创建总量，minimumIdle 只影响空闲目标。验证可让两个长查询占满池，第三个请求进入 waiting，确认它没有创建第三条物理连接。', '池大小是硬上限', {"title":"ConcurrentBag 获取路径","language":"properties","code":"spring.datasource.hikari.maximum-pool-size=2\nspring.datasource.hikari.minimum-idle=0\nspring.datasource.hikari.connection-timeout=3000\nthreads.virtual.enabled=true\n# 两个长查询占满池，第三个请求观察 waiting 和线程状态\ncurl http://orders-service:8080/debug/slow-query?sleep=5","output":"active=2 idle=0 waiting=1\n第三请求等待 3 秒后 SQLTransientConnectionException\nHikariPool-1 - Connection is not available, request timed out\n没有创建第三条超过 maximumPoolSize 的连接"}],
      ['connectionTimeout 的边界', 'application 调用 getConnection 时没有空闲连接，会等待最多 connectionTimeout，超时抛 SQLTransientConnectionException 并增加 connectionTimeout 指标；它不等同于数据库 socketTimeout 或查询 statement timeout。池等待超时说明连接供应不足，查询超时说明已拿连接但执行太久。验证要在日志中区分这两类异常、对应指标和获取连接耗时，并保存等待线程数量与队列长度。', '等池与等 SQL 不是一回事', {"title":"connectionTimeout 的边界","language":"java","code":"HikariConfig cfg = new HikariConfig();\ncfg.setJdbcUrl(\"jdbc:postgresql://db:5432/orders\");\ncfg.setMaximumPoolSize(1);\ncfg.setConnectionTimeout(1500);\ncfg.setValidationTimeout(500);\ntry (Connection c1 = ds.getConnection()) {\n  long started = System.nanoTime();\n  try (Connection c2 = ds.getConnection()) {}\n  log.info(\"acquire-ms={}\", (System.nanoTime() - started) / 1_000_000);\n}","output":"第一个连接借出 active=1\n第二个请求等待约 1500ms\nSQLTransientConnectionException: connection timeout\nacquire-ms=1501；SQL 尚未开始执行"}],
      ['归还与事务清理', 'try-with-resources 保证 close，而 transaction 需要显式 commit 或 rollback；未结束事务的连接归还后可能仍占用数据库锁，Hikari 通常会回滚自动提交状态但应用不应依赖兜底。连接泄漏检测会在超过阈值时打印持有栈，只负责提示不负责强制回收。验证应在异常分支检查 active 归零、数据库 idle in transaction 消失和连接池时间指标恢复。', 'close 前先结束事务', {"title":"归还与事务清理","language":"java","code":"try (Connection c = ds.getConnection()) {\n  c.setAutoCommit(false);\n  try (PreparedStatement ps = c.prepareStatement(\n      \"UPDATE orders SET status=? WHERE id=?\")) {\n    ps.setString(1, \"paid\");\n    ps.setString(2, \"A-42\");\n    ps.executeUpdate();\n    c.commit();\n  } catch (SQLException e) {\n    c.rollback();\n    throw e;\n  } finally {\n    c.setAutoCommit(true);\n  }\n}","output":"UPDATE 1\ncommit 成功，连接归还 active=0\n异常分支 rollback 后 idle in transaction 归零\n池指标 active 回到 0，无长期占用会话"}],
      ['容量压测', '固定数据库 CPU、慢查询和事务耗时，逐步提高并发并记录 Hikari active、idle、waiting、connectionAcquireMillis 与数据库会话数。吞吐平台往往由数据库并行能力和 SQL 耗时决定，池扩大只是把压力前置；验收应为每实例、每环境写明 maximumPoolSize、数据库总连接上限与首发瓶颈，并记录压测机配置、连接峰值曲线和实际吞吐拐点。', '连接池容量服从数据库容量', {"title":"容量压测","language":"bash","code":"for pool in 5 10 20 40; do\n  scripts/load-test.sh --rate 300 --duration 3m --pool-size \"$pool\"     --metrics hikaricp.connections.active,hikaricp.connections.pending\ndone\npsql -c \"SELECT count(*), max(state) FROM pg_stat_activity WHERE datname='orders'\"","output":"pool=5: throughput 310/s waiting=0 p99=120ms\npool=10: throughput 520/s waiting=2 p99=240ms\npool=20: throughput 525/s waiting=30 p99=860ms\n数据库 CPU 达到 96%，继续扩容只增加排队"}],
    ],
  },
  {
    name: m5Name('连接泄漏、超时和池容量'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已完成 HikariCP 获取与归还课时，能观察 active、idle、waiting 指标。',
    goal: '能区分连接泄漏、连接失效、查询超时与池容量不足，并用 leakDetectionThreshold、maxLifetime 和数据库会话状态定位问题。',
    guidedPractice: '故意在异常分支遗漏 close，开启 leakDetectionThreshold 后触发请求，抓取连接持有栈并观察 active 长时间不下降；修复后用同一负载确认 active 回到零。',
    independentPractice: '独立对分钟级连接等待做一次故障排查，提交池配置、数据库会话、应用堆栈与修复前后时序图。',
    commonErrors: [
      '看到连接超时就直接扩大 maximumPoolSize，忽略未关闭连接和长事务已经把池占满。',
      'maxLifetime 设置大于数据库或负载均衡的空闲断连时间，复用已被服务端关闭的连接。',
    ],
    sourceRefs: [
      'HikariCP Configuration. https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby',
      'HikariCP Leak detection. https://github.com/brettwooldridge/HikariCP#leak-detection',
    ],
    steps: [
      ['泄漏的可见信号', '连接借出后没有 close，active 会持续上升，idle 耗尽后新请求进入 waiting，最终 connectionTimeout；数据库侧可能出现大量 Sleep 或 idle in transaction 会话。leakDetectionThreshold 不是自动收回，只在借出超过阈值时打印栈。验证要对比应用 active 曲线与数据库会话，确认泄漏对象、调用点和事务状态，而不是先重启掩盖，并保存异常路径调用堆栈。', '先找未归还连接', {"title":"泄漏的可见信号","language":"properties","code":"spring.datasource.hikari.leak-detection-threshold=5000\nspring.datasource.hikari.maximum-pool-size=5\nlogging.level.com.zaxxer.hikari=DEBUG\n# 故意从 /debug/leak 借出连接且不关闭，第 6 个请求会超时\ncurl http://orders-service:8080/debug/leak\nsleep 6","output":"active=5 idle=0 waiting=1\nConnection leak detection triggered\njava.lang.Exception: Apparent connection leak detected\nat OrderRepository.openCursor(OrderRepository.java:88)"}],
      ['数据库断连与 maxLifetime', '数据库、云代理或防火墙可能主动关闭空闲连接，池内仍保留看似可用的对象。maxLifetime 应短于基础设施强制断连，validationTimeout 与 keepaliveTime 可探测失效；过短又会频繁创建连接。验证应在测试环境等待服务端空闲断连，再执行请求确认池能淘汰旧连接并重建，避免把 SQL 异常误判为查询错误。', '连接寿命服从下层的限制', {"title":"数据库断连与 maxLifetime","language":"properties","code":"spring.datasource.hikari.max-lifetime=600000\nspring.datasource.hikari.idle-timeout=300000\nspring.datasource.hikari.keepalive-time=120000\nspring.datasource.hikari.validation-timeout=1000\n# 将数据库代理空闲断连设为 5 分钟，观察池在 10 分钟内正常轮换\ncurl http://orders-service:8080/actuator/metrics/hikaricp.connections.creation","output":"oldest connection age=595s\nproxy closed idle connection after 300s\nkeepalive validation 后创建替代连接\nAPI 成功率保持 100%，无 closed connection 异常"}],
      ['事务与查询超时', '数据库锁等待会让连接处于执行状态，应用 statement timeout 或 JDBC queryTimeout 应限制单条 SQL；事务级超时负责整体边界。若只有 connectionTimeout，线程拿到连接后仍可能无限等待锁，池会被慢慢耗尽。验证要分别制造锁等待和慢查询，记录 SQLState、池等待时间与 transaction duration，确认超时层没有配错或互相覆盖，并确认回滚后连接可再次使用。', '每层超时需要独立覆盖', {"title":"事务与查询超时","language":"sql","code":"SET statement_timeout = '2s';\nSET idle_in_transaction_session_timeout = '5s';\nSET lock_timeout = '500ms';\nBEGIN;\nSELECT * FROM orders WHERE id = 'A-42' FOR UPDATE;\n-- 第二个事务执行 UPDATE，观察 lock_timeout\nUPDATE orders SET status = 'paid' WHERE id = 'A-42';\nCOMMIT;","output":"事务 A 持锁 4 秒\n事务 B 在 500ms 后报 lock timeout\nB 连接回滚并归还池\nactive 从 2 回到 0，应用返回可重试错误"}],
      ['池容量与数据库上限', '总并发连接近似为每实例 maximumPoolSize 乘实例数，必须低于数据库 max_connections 并预留运维连接；扩容应用实例时如果不同步下调池大小，故障转移会瞬间超限。Hikari metrics 应接入 Prometheus，按实例计算 active/idle/waiting。验证可做一次实例数翻倍演练，确认数据库连接总数仍在预算内且故障转移仍有余量，并保留连接总量对照。', '实例扩容会倍增连接', {"title":"池容量与数据库上限","language":"yaml","code":"services:\n  orders-api:\n    deploy:\n      replicas: 6\n    environment:\n      SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE: 10\n      SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE: 2\n  postgres:\n    command:\n      - postgres\n      - -c\n      - max_connections=120\n      - -c\n      - superuser_reserved_connections=5","output":"6 replicas * maximumPoolSize 10 = 60\n数据库 max_connections=120，预留 65\n实例翻倍到 12 时应用上限 120\n超过预算前应触发部署拦截，而非直接失败"}],
      ['泄漏修复闭环', '用 try-with-resources 覆盖所有 JDBC 路径，在异常处记录 operationId，再重放原失败请求；active 应在请求结束后回落，泄漏检测不再出现长持有栈。随后调小 connectionTimeout 验证保护能在预算内触发，而不是让线程无限等待。验收需保存修复前后指标、数据库会话、堆栈与失败请求结果，并核对重复请求只产生一次副作用。', '修复要验证资源回落', {"title":"泄漏修复闭环","language":"java","code":"try (Connection c = ds.getConnection();\n     PreparedStatement ps = c.prepareStatement(\n       \"SELECT id, status FROM orders WHERE id=?\")) {\n  ps.setString(1, orderId);\n  try (ResultSet rs = ps.executeQuery()) {\n    return rs.next() ? map(rs) : Optional.empty();\n  }\n}\n// 回归：并发 50，持续 10 分钟，所有异常分支都必须关闭 ps 与 connection\n","output":"leakDetectionThreshold=5000\n修复前 active 长期停在 5\n修复后每请求结束 active 回到 0\n10 分钟 30000 请求无泄漏栈，p99 140ms"}],
    ],
  },
  {
    name: m5Name('配置错误与数据库耗尽的联合演练'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已完成 Apollo 发布与 HikariCP 容量课时，能在测试环境查看 release、池指标和数据库会话。',
    goal: '能处理一次错误连接池配置与数据库容量耗尽叠加的故障，按灰度证据定位、回滚和安全恢复，而不是只在单组件内排障。',
    guidedPractice: '在灰度实例将 maximumPoolSize 从 10 调到 100，同时注入慢 SQL，观察 Apollo release、Hikari waiting、数据库 max_connections 警报与应用 5xx，随后回滚并重启受影响的连接池。',
    independentPractice: '独立编写联合故障演练脚本与运行手册，要求包含发现、熔断入口、灰度回滚、连接重建、积压恢复和数据一致性核对。',
    commonErrors: [
      '先把数据库 max_connections 调大以缓解报错，导致内存、锁竞争与慢查询进一步恶化。',
      '只回滚 Apollo 值而不重建连接池或重启实例，旧的高并发连接仍然留在数据库中。',
    ],
    sourceRefs: [
      'Apollo Configuration Center Documentation. https://www.apolloconfig.com/',
      'HikariCP Documentation. https://github.com/brettwooldridge/HikariCP',
    ],
    steps: [
      ['联合故障的证据面', '错误配置可能让每个实例创建更多连接，慢 SQL 又延长连接占用，最终形成池等待、数据库会话上限和入口超时三重告警。排障顺序应同时读取 Apollo release、Hikari active/waiting、数据库连接与会话、API p99 和 5xx，不能只看某一层阈值。先确定哪个指标最早变化，再判断根因与放大链路以及受影响实例。', '多组件故障要有时间线', {"title":"联合故障的证据面","language":"promql","code":"histogram_quantile(0.99,\n  sum by (namespace, pod) (rate(http_server_requests_seconds_bucket{app=\"orders-api\"}[5m])))\nhikaricp_connections_active{app=\"orders-api\"}\nhikaricp_connections_pending{app=\"orders-api\"}\npg_stat_activity_count{datname=\"orders\",state=\"active\"}\nincrease(apollo_release_timestamp_seconds{app=\"orders-api\",release_id=\"20261124003\"}[10m])","output":"10:01 Apollo release 20261124003 发布到 canary\n10:02 pending 从 0 升到 37\n10:03 active 60，PG active 118\n10:04 API p99 从 180ms 升到 4.8s"}],
      ['控制影响面', '发现灰度实例连接数异常后，入口应限制到故障版本流量或停止继续发布，应用侧开启短超时并暂停非核心写入，数据库侧保留管理连接。直接全量回滚可能瞬间触发大量重连，应先摘流再分批重启。验证要记录每一步的实例数、连接数和成功率，证明影响面在收敛。', '先止血再恢复容量', {"title":"控制影响面","language":"bash","code":"kubectl scale deployment orders-api --replicas=2 -n orders\ncurl -s -u apollo:secret -X PUT \\\n  'http://localhost:8070/envs/DEV/apps/orders/clusters/default/namespaces/application/releases/20261124002' \\\n  -H 'Content-Type: application/json' -d '{\"operator\":\"incident-1\"}'\ncurl -s -X POST http://gateway/internal/drain -d 'service=orders-api'\npsql -c \"SELECT state,count(*) FROM pg_stat_activity WHERE datname='orders' GROUP BY state\"\nhikari-metrics --service orders-api --watch 30s","output":"canary replicas 6 -> 2\nApollo 回滚 release 20261124002\n网关摘流后业务流量归零\nPG active 从 118 降到 18\n回滚和摘流操作均有审批号与时间戳"}],
      ['灰度回滚与连接重建', '通过 Apollo 创建新的回滚 release 恢复旧池参数，再按批次重启实例或触发连接池重建；连接池不会因为配置文本变化自动把所有旧连接清空。每批恢复后看 active、idle、waiting 与数据库会话，确认新连接数符合预算。验收要同时保存 release 编号、实例重启时间与每批连接回收结果，并确认每批实例均完成回收。', '配置值与运行时资源都要恢复', {"title":"灰度回滚与连接重建","language":"bash","code":"kubectl rollout restart deployment/orders-api -n orders\nkubectl rollout status deployment/orders-api -n orders --timeout=10m\nfor pod in $(kubectl get pod -n orders -l app=orders-api -o name); do\n  kubectl exec \"$pod\" -- curl -s localhost:8080/actuator/health\n  kubectl exec \"$pod\" -- curl -s localhost:8080/actuator/metrics/hikaricp.connections.active\ndone\nkubectl get pods -n orders -l app=orders-api","output":"rollout restart 完成\n每个 pod health=UP\nactive 新实例从 0 升到 3，IDLE=2\nPG 总连接 18，未超过 60 预算\n旧 pod 全部终止，无连接泄漏残留"}],
      ['数据库恢复边界', '数据库连接下降后，锁等待和慢 SQL 可能仍在队列中，先杀掉已确认的阻塞会话或等待事务自行结束，再恢复业务流量。不要无审计批量 kill 所有连接，也不要通过重启数据库掩盖慢 SQL。验证应观察锁等待数、事务时长、连接数和业务错误率同步下降，并保留会话操作审计。', '连接恢复不等于事务恢复', {"title":"数据库恢复边界","language":"sql","code":"SELECT pid, usename, state, wait_event_type, query,\n       now() - query_start AS duration\nFROM pg_stat_activity\nWHERE datname = 'orders' AND state <> 'idle'\nORDER BY duration DESC\nLIMIT 10;\nSELECT pg_terminate_backend(84213);\nALTER SYSTEM SET statement_timeout = '3s';\nSELECT pg_reload_conf();","output":"pid 84213 来自已下线 canary，持锁 11 分钟\npg_terminate_backend 返回 true\n锁等待数从 42 降到 0\nstatement_timeout=3s 对新连接生效"}],
      ['恢复与复盘', '逐步放开入口和写入，重放故障期间进入重试队列的业务请求，核对唯一键和审计，确保没有重复扣款或漏单。运行手册记录触发指标、决策人、回滚 release、批处理命令、恢复指标与遗留风险。验收要有业务数据对账结果和责任人确认，不能以服务重新上线结束。', '业务对账才算恢复完成', {"title":"恢复与复盘","language":"bash","code":"scripts/reconcile-orders.sh --from 10:00 --to 10:18 --output reconcile.json\njq '{missing, duplicated, amount_mismatch}' reconcile.json\ncurl -s http://orders-service:8080/actuator/metrics/hikaricp.connections.pending\ncurl -s -o /dev/null -w '%{http_code} %{time_total}\\n' http://gateway/api/orders/42\nscripts/append-runbook-note.sh --incident INC-20261124-01","output":"missing=0 duplicated=0 amount_mismatch=0\nhikaricp pending=0\n业务请求 200 0.142s\n运行手册记录回滚 release、restart 批次与对账链接\n责任人确认后才关闭事件"}],
    ],
  },
];

const m6Stage = '容量、故障、恢复与中间件运行手册';
const m6Name = (topic: string) => `中间件源码 · ${m6Stage}：${topic}`;

export const HANDWRITTEN_MIDDLEWARE_SOURCE_M6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: m6Name('消息积压、磁盘、ISR 和 rebalance'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已掌握 Kafka 消费组 lag、ISR 与分区日志，能采集 broker 和 consumer 指标。',
    goal: '能区分消费积压、磁盘增长、副本落后与频繁 rebalance，并建立按分区、按 broker 的容量判断和恢复顺序。',
    guidedPractice: '在测试集群持续生产并暂停部分消费者，记录各分区 lag、磁盘剩余、under-replicated-partitions 与 rebalance 次数，再分批恢复消费者观察追平速度。',
    independentPractice: '独立写出 Kafka 积压运行手册，包含告警阈值、先扩消费者或先降生产的判断、磁盘清理禁区、rebalance 止血和恢复验收。',
    commonErrors: [
      '只看总 lag 不看分区分布，增加消费者后仍被几个热点分区卡住。',
      '磁盘告警时直接删除 broker 日志目录，破坏 segment 与副本恢复状态。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Monitoring. https://kafka.apache.org/documentation/#monitoring',
      'Apache Kafka Documentation: Basic Operations. https://kafka.apache.org/documentation/#basic_ops',
    ],
    steps: [
      ['lag 与分区热点', 'consumer lag 等于分区 log-end-offset 减 committed offset，总 lag 可能掩盖单分区积压；同 key 过多或消费者分配不均会让部分分区持续落后。kafka-consumer-groups.sh --describe 应按 partition 查看当前位移与 lag，并结合生产速率和消费速率估算追平时间。若只增加消费者而分区数不足，多余的消费者没有分配，也无法改善热点分区，并核对分配是否覆盖全部分区。', '总积压不能代替分区视图', {"title":"lag 与分区热点","language":"bash","code":"kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker |\n  awk 'NR==1 || /orders.v1/ {print}' |\n  column -t\nkafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker --state","output":"PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG\n0         1000           1500           500\n1         2100           2110           10\n2         900            3800           2900\npartition 2 占总 lag 85%，增加消费者无法拆分该分区"}],
      ['磁盘与保留边界', '日志保留受 retention.bytes、retention.ms 和分区副本数量共同影响，单 broker 磁盘峰值必须在副本全部存活的假设下计算。磁盘告警时应评估保留策略、扩容或迁移副本，不能手工删除 active segment；kafka-log-dirs.sh --describe 可查看各副本大小。验证要记录磁盘增长速率、预计耗尽时间、清理后的 offset 连续性与副本状态，并保存预计耗尽时间的变化。', '容量按副本总量计算', {"title":"磁盘与保留边界","language":"bash","code":"kafka-log-dirs.sh --bootstrap-server kafka1:9092 --describe |\n  jq '[.brokers[] | {broker:.broker, used:([.logDirs[].partitions[].size]|add),\n  free:(.logDirs[0].totalBytes-.logDirs[0].usableBytes)}]'\ndf -h /var/lib/kafka\nkafka-configs.sh --bootstrap-server kafka1:9092 --describe \\\n  --entity-type topics --entity-name orders.v1","output":"broker1 used=412GB free=38GB\nbroker2 used=408GB free=42GB\nbroker3 used=410GB free=40GB\nretention.bytes=-1 retention.ms=604800000\n每日增长 28GB，保留窗口内预计 2 天耗尽"}],
      ['ISR 与写入可用性', 'under-replicated-partitions 表示副本未追平，isr-shrink-rate 持续升高会降低写入冗余；min.insync.replicas 不足时 acks=all 生产者应收到错误。恢复副本需要网络与磁盘带宽，若同时触发大量 rebalance 会让追赶更慢。验证应持续观察 ISR 数量、replica lag 与生产错误码，而不是只看 broker 进程存活或短暂恢复，并记录追平所需带宽、恢复耗时与恢复时间线。', '复制余量是写可用性预算', {"title":"ISR 与写入可用性","language":"bash","code":"kafka-topics.sh --bootstrap-server kafka1:9092 --describe --under-replicated-partitions\nkafka-topics.sh --bootstrap-server kafka1:9092 --describe --topic orders.v1\nprintf 'ORDER-600\\tcreated\\n' | kafka-console-producer.sh \\\n  --bootstrap-server kafka1:9092 --topic orders.v1 \\\n  --producer-property acks=all --producer-property retries=3","output":"orders.v1  partition 2  Leader:1  Replicas:1,2,3  Isr:1,2\nunder-replicated-partitions 返回 partition 2\nmin.insync.replicas=2 时 acks=all 仍可写\n再停 broker2 后 producer 返回 NOT_ENOUGH_REPLICAS"}],
      ['rebalance 常见触发源', 'consumer 超时、max.poll.interval.ms 失约、部署滚动、session 超时和订阅变化都会触发 rebalance；每次再平衡都暂停部分分区并增加位移提交失败概率。cooperative 策略降低撤销范围，仍不能保护阻塞处理循环。验证应关联 rebalance 指标、成员日志、处理耗时和发布事件，确定是代码阻塞、网络抖动还是运维动作，并保存触发前最后一次 poll 时间。', '先找触发源再调参数', {"title":"rebalance 常见触发源","language":"bash","code":"kafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker --members --verbose\nkubectl logs deploy/orders-worker --since 30m |\n  rg 'rebalance|max poll interval|session timeout|Revoke'\nkubectl rollout history deployment/orders-worker","output":"30 分钟内 rebalance=27\nmember c1 单轮处理 78s，超过 max.poll.interval.ms=60s\n部署历史同时出现两次滚动重启\n根因是处理阻塞放大部署触发，不是心跳参数过短"}],
      ['积压恢复演练', '保持消费者不变，把生产速率提高三倍十分钟后停止提升，记录 lag 峰值与预计追平时间；再扩容消费者但不超过分区数，比较追平曲线。恢复必须分批，防止瞬间回源压垮下游，验收要求 lag 回落到阈值、ISR 完整、磁盘停止增长且无重复业务副作用，并记录追平阶段业务错误率。', '恢复速度受下游和分区限制', {"title":"积压恢复演练","language":"bash","code":"scripts/kafka-load.sh --rate 3000 --duration 10m --topic orders.v1\nkafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker > before.txt\nscripts/kafka-load.sh --rate 0\nsleep 5m\nkafka-consumer-groups.sh --bootstrap-server kafka1:9092 \\\n  --describe --group orders-worker > after.txt\nawk '/orders.v1/{sum+=$6} END{print \"lag=\"sum}' after.txt","output":"峰值 lag=480000，分区 2=410000\n停止生产后消费速率 3900/s\n5 分钟 lag=0，ISR=1,2,3\n下游错误率保持 0.02%，未因追平过载"}],
    ],
  },
  {
    name: m6Name('缓存命中率、延迟、内存和复制'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已掌握 Redis 过期、淘汰、持久化和复制，能读取 INFO 与 slowlog。',
    goal: '能组合命中率、命令延迟、内存与复制指标判断 Redis 故障来源，并避免把低命中率简单归因于缓存容量。',
    guidedPractice: '在测试实例注入冷键、热键过期和大命令，采集 keyspace_hits、keyspace_misses、latency、slowlog、used_memory、evicted_keys 与 replication offset，并画出指标变化时间线。',
    independentPractice: '独立为在线缓存编写告警规则，要求区分命中率下降、主线程阻塞、内存压力和副本延迟，并给出各自的第一处置动作。',
    commonErrors: [
      '只按命中率扩容内存，忽略热键过期、错误 key 设计和请求分布已经改变。',
      '把客户端超时全部归因 Redis 慢，未查看连接池、网络和 replicas 状态。',
    ],
    sourceRefs: [
      'Redis Documentation: INFO command. https://redis.io/docs/latest/commands/info/',
      'Redis Documentation: Latency troubleshooting. https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/',
    ],
    steps: [
      ['命中率与请求结构', 'INFO stats 的 keyspace_hits 和 keyspace_misses 反映 get 类查找结果，命中率下降可能来自新流量、key 拼写、TTL 缩短、淘汰或预热不足。应把命中率按业务 key 前缀拆开，并与数据库回源 QPS 对齐；全局命中率高仍可能掩盖某个核心缓存全 miss。验证要比较变更前后命中、回源、延迟和业务错误四条曲线，并保存关键前缀的请求结构。', '命中率必须结合业务分组', {"title":"命中率与请求结构","language":"bash","code":"redis-cli INFO stats | rg 'keyspace_hits|keyspace_misses'\nredis-cli --scan --pattern 'product:*' --count 1000 | wc -l\nredis-cli --scan --pattern 'missing:product:*' --count 1000 | wc -l\nmysql -N -e \"SHOW GLOBAL STATUS LIKE 'Questions'; SHOW GLOBAL STATUS LIKE 'Threads_connected'\"\nredis-cli --latency-history -i 5","output":"keyspace_hits:2048120 keyspace_misses:180442\nproduct keys=48210 missing:product keys=118000\nQuestions 增量 198000，Threads_connected=80\n核心 product:* 命中率 92%，全局命中率被空值键稀释"}],
      ['延迟与慢命令', 'Redis 延迟由网络排队、连接数、输出缓冲、慢命令和持久化/fork 等因素叠加，slowlog 只覆盖执行耗时，latency monitor 还能采集事件循环抖动。先用 redis-cli --latency 与应用 p99 对照，再查 slowlog、CLIENT LIST 与 INFO persistence。若客户端池等待长而 Redis 延迟正常，根因在应用线程与连接获取，不在命令引擎，并对照网络往返、应用阻塞时间与线程等待证据。', '端到端延迟分段定位', {"title":"延迟与慢命令","language":"bash","code":"redis-cli --latency-history -i 1\nredis-cli SLOWLOG GET 20\nredis-cli CLIENT LIST |\n  awk '{for(i=1;i<=NF;i++) if($i~/^omem=/){split($i,a,\"=\"); if(a[2]>10000000) print}}'\ndocker stats --no-stream redis\nredis-cli INFO persistence | rg 'aof_last_bgrewrite_status|rdb_last_bgsave_status'","output":"p99 Redis 命令 0.62ms\n应用请求 p99 186ms\nCLIENT LIST 发现 omem=82MB 的连接\nslowlog 最大命令 3.1ms\n瓶颈来自大响应网络回送，不是主线程慢命令"}],
      ['内存与淘汰', 'used_memory、used_memory_rss、maxmemory、mem_fragmentation_ratio 与 evicted_keys 要一起看；used_memory 接近上限时写请求可能淘汰热键或返回 OOM，RSS 高则可能来自碎片和客户端缓冲。容量报告应给出峰值、增长率、key 数量和大 key TOP 列表。验证要在测试实例触发淘汰，确认业务命中率、回源顺序与报警阈值受到影响，并记录核心键的回源结果与淘汰键分布。', '内存阈值要关联淘汰行为', {"title":"内存与淘汰","language":"bash","code":"redis-cli INFO memory |\n  rg 'used_memory_human|used_memory_rss_human|maxmemory_human|mem_fragmentation_ratio'\nredis-cli INFO stats | rg 'evicted_keys|expired_keys'\nredis-cli --bigkeys\nredis-cli CONFIG GET maxmemory-policy","output":"used_memory_human:7.82G used_memory_rss_human:8.12G\nmaxmemory_human:8.00G mem_fragmentation_ratio:1.04\nevicted_keys:182 threshold 每分钟 40\nmaxmemory-policy=volatile-lru\n最近一小时 evicted 持续增长且缓存命中率下降"}],
      ['复制延迟与故障切换', 'INFO replication 提供 master_repl_offset、各 replica offset 和 link 状态，从库延迟会扩大故障切换的丢失窗口；WAIT 只验证指定数量的副本已接收当前写入，不持续保证。演练要记录主库写入、副本 offset、故障时间与提升后的数据。若只检查 replica 在线，无法证明热数据已经追平或切换后没有缺失，并保存位置差与业务对账。', '在线不等于已同步', {"title":"复制延迟与故障切换","language":"bash","code":"redis-cli INFO replication |\n  rg 'role:master|master_repl_offset|slave[0-9]:'\nredis-cli -p 6380 INFO replication | rg 'master_link_status|slave_repl_offset'\nredis-cli WAIT 1 100\nredis-sentinel-cli SENTINEL get-master-addr-by-name redis-main","output":"master_repl_offset:92841002\nslave0:ip=10.0.0.12,port=6379,state=online,offset=92840910,lag=1\nWAIT 返回 1，位差 92 字节\nSentinel 返回 10.0.0.12 6379\n故障切换丢失窗口小于 1 秒数据"}],
      ['缓存故障演练', '依次注入热键丢失、大 key 扫描、内存达上限和副本断开，分别观察命中率、slowlog、淘汰数、offset 与应用回源 QPS。每类故障给出一个不扩大影响的处置动作，如暂停回源、限速扫描或切换只读。验收要证明告警能在业务大面积超时前触发，并能区分四类故障的证据与处置记录。', '告警应对准故障类型', {"title":"缓存故障演练","language":"bash","code":"scripts/cache-fault.sh --case hotkey-expire --concurrency 500\nredis-cli SLOWLOG RESET\nredis-cli --scan --pattern 'hot:*' --count 100 | head\nredis-cli INFO stats | rg 'keyspace_hits|keyspace_misses'\ncurl -s http://orders-service:8080/actuator/metrics/cache.rebuild.inflight","output":"热点键过期后 500 并发只产生 1 次回源\n数据库 QPS 峰值 210，低于 700 上限\ncache hit 从 99.1% 瞬时降到 62%\n限流命中 0，rebuild inflight=1"}],
    ],
  },
  {
    name: m6Name('队列深度、重投、死信和消费者'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '已掌握 RabbitMQ ack、DLX 与 prefetch，能读取 ready、unacked 和死信队列指标。',
    goal: '能按 ready、unacked、delayed 与死信拆分队列健康度，计算消费容量并处置毒消息和消费者异常。',
    guidedPractice: '在测试队列持续生产并随机让消费者失败，采集 messages_ready、messages_unacknowledged、dead-letter 深度、redelivered 与消费耗时，绘制积压增长曲线。',
    independentPractice: '独立完成一次死信积压演练，要求先停止新增失败、隔离毒消息、修复消费者并限速重放，同时证明正常队列恢复。',
    commonErrors: [
      '只看 ready 忽略 unacked，消费者卡死时队列看似不涨但任务实际上没有完成。',
      '批量重放死信时没有限速和幂等校验，瞬间打垮下游或制造重复副作用。',
    ],
    sourceRefs: [
      'RabbitMQ Management and Monitoring. https://www.rabbitmq.com/docs/monitoring',
      'RabbitMQ Documentation: Dead lettering. https://www.rabbitmq.com/docs/dlx',
    ],
    steps: [
      ['三类队列计数', 'messages_ready 表示等待投递，messages_unacknowledged 表示已投递未确认，delayed 消息则尚未到路由时刻；消费者处理慢时 ready 下降但 unacked 积累，连接断开后未确认会回 ready。管理页面应同时观察三者与消费者数，不能只看队列总量。验证要暂停消费者处理但不关闭连接，确认 ready 与 unacked 的不同变化及 redelivered 标记，并保存三类计数的时间曲线。', '积压位置决定处置手段', {"title":"三类队列计数","language":"bash","code":"rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers |\n  column -t\nrabbitmqctl list_channels name number prefetch_count messages_unacknowledged |\n  column -t\nrabbitmqadmin get queue=orders.work count=5 ackmode=ack_requeue_true","output":"orders.work 18000 1200 16000 8\nchannel consumer-3 prefetch=20 unacked=20\nready 小幅下降但 unacked 持续高企\n消费者处理慢而非 broker 停止投递"}],
      ['重投与毒消息', 'redelivered=true 表示消息曾被投递后重新入队，频繁重投通常来自异常、超时或错误 requeue；x-death 可记录被拒绝、过期或超限的路由历史。毒消息会让消费者反复占用 prefetch 并阻塞后续任务。验证应以 messageId 统计重投次数，超过上限后进入隔离队列，而不是继续高速循环并扩大下游失败。', '重投次数要带业务身份', {"title":"重投与毒消息","language":"bash","code":"rabbitmqadmin get queue=orders.dead count=20 ackmode=ack_requeue_true |\n  jq '.properties.headers.\"x-death\"'\nrabbitmqctl list_queues name messages\nrabbitmqadmin get queue=orders.work count=1 ackmode=ack_requeue_true |\n  jq '{message_id:.properties.message_id,redelivered:.redelivered}'\ncurl -s localhost:15672/api/queues/%2F/orders.work -u guest:guest","output":"x-death reason=rejected count=17\norders.work messages=0 orders.dead messages=17\nredelivered=true message_id=ORDER-42:bad\n同一 messageId 未继续高速 requeue"}],
      ['消费者健康与容量', '消费者注册数不等于有效处理能力，连接空闲、prefetch 行为、下游连接池耗尽都会让 unacked 高企。rabbitmqctl list_consumers 可查看队列与通道，结合应用处理耗时算单实例吞吐。验证要逐步增加并发直到吞吐平台出现，并记录首先饱和的 CPU、数据库或外部 API 及对应等待时间，比较完成数与注册数差异。', '有效消费者按完成量衡量', {"title":"消费者健康与容量","language":"bash","code":"rabbitmqctl list_consumers queue_name channel_pid consumer_tag ack_required prefetch_count\ncurl -s localhost:3000/metrics | rg 'rabbit_consumer|process_cpu|http_request_duration'\nps -eo pid,pcpu,pmem,cmd | rg 'order-worker'\npgbouncer -V; pgbouncer -R -d config.ini --verbose","output":"8 个消费者注册，2 个 channel idle 超过 10 分钟\nworker CPU 38%，数据库等待 420ms\n单实例有效吞吐 64 msg/s\n数据库连接池等待先达到 200ms，成为首个瓶颈"}],
      ['积压追平估算', '追平时间近似为积压量除以生产与消费速率差，若生产大于消费则不会追平；死信重放还要计入额外流量。处置顺序先判断是否继续接单，再扩消费者、降低生产、拆分队列或限速重放，不能同时大改多项。验证要按分钟采样 ready、unacked、完成数，确认估算与实际收敛一致。', '用速率差判断能否恢复', {"title":"积压追平估算","language":"bash","code":"rabbitmqctl list_queues name messages messages_ready messages_unacknowledged consumers\npython3 - <<'PY'\nbacklog = 180000\nincoming = 420\ncapacity = 720\nrate = capacity - incoming\nprint({'net_rate': rate, 'catchup_seconds': backlog / rate})\nPY\nwatch -n 5 'rabbitmqctl list_queues name messages consumers'","output":"messages=180000 consumers=8\n{'net_rate': 300, 'catchup_seconds': 600.0}\n每 5 秒采样显示积压按约 300 条/秒下降\n生产突增到 900/s 时 net_rate 变负，需先降生产"}],
      ['死信处置演练', '制造一种可修复死信和一种不可修复毒消息，先暂停重放、修正消费者与数据，再按每秒固定速率重放并观察死信深度、正常队列和业务唯一键。不可修复消息进入人工隔离区并告警。验收要求原生产链路恢复、死信只减少一次且无重复副作用。', '隔离、修复、限速、核验', {"title":"死信处置演练","language":"bash","code":"rabbitmqctl stop_app || true\nscripts/pause-consumers.sh --queue orders.dead\npsql -c \"UPDATE orders SET invalid_payload=false WHERE id IN (SELECT order_id FROM failed_payloads)\"\nscripts/replay-dlx.sh --queue orders.dead --rate 20 --ids failed-payloads.json\nrabbitmqctl list_queues name messages |\n  rg 'orders.dead|orders.work'\npsql -c \"SELECT count(*) FROM processed WHERE message_id LIKE 'DLQ-%'\"","output":"重放前 orders.dead=37，消费者暂停\n修复数据 37 行\n限速 20/s 重放后 orders.dead=0\norders.work messages 恢复下降\nprocessed=37，无重复业务副作用"}],
    ],
  },
  {
    name: m6Name('Trace、告警、值班和容量报告'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能在 Spring 或其他服务中采集日志、指标和 Trace，并理解 RED 与 USE 指标。',
    goal: '能为中间件链路设计关联 traceId、请求耗时、流量、错误与饱和度指标，形成可执行告警和值班交接材料。',
    guidedPractice: '为 API、Kafka 消费、Redis 访问和数据库连接池建立一条 Trace，注入一次慢 SQL 与一次消费重试，记录 traceId、span、RED 指标和日志关联结果。',
    independentPractice: '独立为中间件平台编写告警目录，逐条写明指标、阈值、持续时间、影响、第一处置和升级联系人，并完成一次模拟值班交接。',
    commonErrors: [
      '只告警 CPU 与进程存活，没有用户请求错误率、延迟和积压这类影响指标。',
      '告警阈值没有持续时间和分组标签，一次短暂抖动就产生大量重复通知。',
    ],
    sourceRefs: [
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
      'Google SRE Workbook: Alerting on SLOs. https://sre.google/workbook/alerting-on-slos/',
    ],
    steps: [
      ['三类信号的职责', '指标适合聚合趋势与阈值，日志提供具体错误和数据，Trace 串联跨服务调用并给出各 span 耗时；三者通过 traceId、service.name、topic、group 等标签关联。只增加日志量不会自动得到因果关系，只有为入站请求创建 trace 并在中间件客户端传播上下文，才能沿调用树定位瓶颈。验证要能从一条失败请求跳到下游 span 和日志。', '信号要共享关联键', {"title":"三类信号的职责","language":"bash","code":"TRACE=$(curl -s -D - http://gateway/api/orders/42 -o body.json |\n  awk -F': ' 'tolower($1)==\"x-trace-id\"{gsub(\"\\r\",\"\");print $2}')\ncurl -s \"http://jaeger:16686/api/traces/$TRACE\" | jq '.data[0].spans[] | {operationName,duration}'\ncurl -s \"http://loki:3100/loki/api/v1/query_range?query={trace_id=\"$TRACE\"}\" |\n  jq '.data.result[].values'\npromtool query instant http://prometheus:9090 'rate(http_server_requests_seconds_count{route=\"/api/orders\"}[5m])'","output":"trace spans: gateway 9ms, orders-api 84ms, postgres 61ms\nLoki 日志包含 trace_id 与 order_id=A-42\nPrometheus rate=82 req/s errors=0.4%\n从一条失败请求可跳到慢 span 与数据库日志"}],
      ['RED 与中间件标签', '请求级 RED 指标包含 rate、errors、duration，中间件消费者还需 offset lag、unacked、pool waiting、cache hit 与 replication offset 等饱和度指标。标签基数是告警成本，topic 与 partition 可用于定位但不宜把高基数业务 ID 放进长期指标。验证应检查一条告警能否回答哪个服务、哪个分区或实例、从何时开始以及影响哪些业务，并保存通知、处置时间与责任人。', '指标标签服务排障动作', {"title":"RED 与中间件标签","language":"promql","code":"sum by (service, route) (rate(http_server_requests_seconds_count[5m]))\nsum by (service, route) (rate(http_server_requests_seconds_count{status=~\"5..\"}[5m]))\nhistogram_quantile(0.99,\n  sum by (le, service, route) (rate(http_server_requests_seconds_bucket[5m])))\nmax by (service, topic, partition) (kafka_consumergroup_lag)\nmax by (service, instance) (hikaricp_connections_pending)","output":"orders-api route=/api/orders rate=82 errors=0.4%\np99=184ms\nkafka lag topic=orders.v1 partition=2 value=2900\nhikaricp pending instance=orders-api-7 value=37\n告警能定位服务、路由、主题分区与实例"}],
      ['告警设计', '告警应基于用户可见症状或即将耗尽的关键资源，设置持续窗口、分组与抑制，避免同一根因下几十条通知。错误预算型告警能反映影响程度，资源告警则用于提前干预；每条规则都要有对应运行手册链接。验证应回放历史故障时间线，检查告警先于大面积投诉触发且没有长时间风暴。', '先在历史数据上回放告警', {"title":"告警设计","language":"yaml","code":"groups:\n  - name: middleware-slo\n    rules:\n      - alert: OrdersApiFastBurn\n        expr: |\n          sum(rate(http_server_requests_seconds_count{service=\"orders-api\",status=~\"5..\"}[5m]))\n          /\n          sum(rate(http_server_requests_seconds_count{service=\"orders-api\"}[5m])) > 0.05\n        for: 5m\n        labels: {severity: page, runbook: orders-api-5xx}\n      - alert: KafkaPartitionLag\n        expr: max by (topic, partition) (kafka_consumergroup_lag) > 10000\n        for: 10m\n        labels: {severity: ticket, runbook: kafka-lag}","output":"promtool check rules middleware-alert.yml\nSUCCESS: 2 rules found\n5xx 超过 5% 持续 5 分钟触发 page\n单分区 lag 超过 10000 持续 10 分钟触发 ticket\n规则包含 runbook 链接与分组标签"}],
      ['值班交接与决策边界', '交接材料写明当前未恢复告警、最近变更、容量余量、已知风险和禁止操作，值班者能据此选择限流、摘流、回滚或升级。对数据库 kill、broker 磁盘清理和队列清理这类高风险动作要写明审批与替代动作。验证由未参与故障的另一人按手册复现一次，记录卡点和修正内容。', '手册要经他人执行验证', {"title":"值班交接与决策边界","language":"bash","code":"scripts/handoff-report.sh --from 2026-11-24T08:00+08:00   --to 2026-11-24T16:00+08:00 > handoff.md\nrg -n '未恢复|最近变更|容量余量|禁止操作|升级联系人' handoff.md\ncurl -s http://prometheus:9090/api/v1/alerts | jq '.data.alerts[] | select(.state==\"firing\")'\ncurl -s http://grafana:3000/api/annotations?from=now-8h | jq '.[].text'","output":"handoff.md 包含 2 条 firing、3 个最近 release\nKafka 磁盘余量 38GB，Redis 内存余量 9%\n禁止直接删除 broker segment 与无审计 kill 数据库会话\n升级联系人：中间件平台 on-call A/B"}],
      ['容量报告', '报告按服务列出峰值流量、资源使用、增长趋势、故障域余量、成本与扩容触发条件，并把结论绑定到实际变更预算。报告不是截图集合，每个容量判断要能回答何时达到阈值、扩容需要多久、缩容安全边界是什么。验收要抽查一条预测，在演练后对照实际曲线调整模型。', '容量结论必须可执行', {"title":"容量报告","language":"python","code":"rows = [\n    {\"service\": \"kafka\", \"peak\": 0.72, \"growth\": 0.08, \"rto\": 18, \"owner\": \"mq\"},\n    {\"service\": \"redis\", \"peak\": 0.91, \"growth\": 0.12, \"rto\": 9, \"owner\": \"cache\"},\n    {\"service\": \"rabbit\", \"peak\": 0.64, \"growth\": 0.03, \"rto\": 12, \"owner\": \"mq\"},\n]\nfor row in rows:\n    row[\"headroom\"] = round(1 - row[\"peak\"], 2)\n    row[\"days_to_90\"] = None if row[\"growth\"] <= 0 else round((0.9-row[\"peak\"])/row[\"growth\"]*30)\nprint(rows)","output":"redis headroom=0.09 growth=0.12，预计 0 天内触及 90%\nkafka headroom=0.28 预计约 67 天\n报告给出 owner、RTO、触发阈值与扩容提前量\n容量结论可以转为预算和变更窗口"}],
    ],
  },
  {
    name: m6Name('故障注入、备份恢复和运行手册'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '完成本课程包前六阶段，能在隔离环境操作 Kafka、Redis、RabbitMQ、Nginx、Apollo 与连接池。',
    goal: '能设计覆盖数据、流量和配置的故障演练，按 RPO/RTO 验证备份恢复，并交付新人可执行的中间件运行手册。',
    guidedPractice: '为 Kafka broker 下线、Redis 主从切换、RabbitMQ 队列积压、Nginx 上游故障与 Apollo 错误配置排定演练顺序，逐项记录影响、发现、处置、恢复和业务对账结果。',
    independentPractice: '独立完成一份中间件运行手册，包含架构图、指标阈值、常用命令、备份位置、恢复步骤、回滚边界和过去演练证据。',
    commonErrors: [
      '演练只验证组件进程恢复，不核对消息重复、缓存缺失、数据库连接与业务对账。',
      '备份文件长期未实际恢复，所需版本、凭据或配置缺失，故障时才发现 RTO 无法满足。',
    ],
    sourceRefs: [
      'Apache Kafka Documentation: Basic Operations. https://kafka.apache.org/documentation/#basic_ops',
      'Redis Documentation: Persistence. https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/',
      'RabbitMQ Documentation: Monitoring. https://www.rabbitmq.com/docs/monitoring',
    ],
    steps: [
      ['演练场景与假设', '故障清单要覆盖单实例、单故障域、磁盘耗尽、配置错误、依赖慢和人为误操作，每个场景写明正常流量、预期影响、RPO、RTO 与停止条件。演练前把假设写成可观察量，例如允许重复消费但不允许订单丢失，而不是只写系统要稳定。验证应按风险排序，避免同时破坏多个独立保护层。', '场景先定义可接受损失', {"title":"演练场景与假设","language":"yaml","code":"scenario: broker-leader-loss\ntarget: kafka-lab\ntraffic: 500 events/s\nexpected:\n  availability: \">= 99.9% for 10m\"\n  data_loss: 0 confirmed-events\n  duplicate: allowed-if-idempotent\n  rto: 120s\nstop_conditions:\n  - under_replicated_partitions > 1\n  - business_error_rate > 1%\n  - data_reconcile_mismatch > 0\napproval: change-INC-20261124-02","output":"演练前写入 30000 个带唯一键事件\n允许重复但确认事件丢失必须为 0\n错误率超过 1% 立即停止\n故障注入、业务负责人和回滚人已签字"}],
      ['备份与恢复证据', 'Kafka 主题配置和 ACL、Redis RDB/AOF、RabbitMQ 定义与消息、Apollo release 和 Nginx 配置都需要可恢复副本，并记录对应版本与密钥。恢复演练要在隔离环境执行，测量定位文件、校验、加载、连接切换和业务抽检时间。只有恢复出真实数据、完成业务对账并满足目标时间，才能证明备份有效，并记录失败时的回退动作。', '恢复时间要实测', {"title":"备份与恢复证据","language":"bash","code":"BACKUP=/backup/middleware/2026-11-24\ntar -C /srv -czf \"$BACKUP/apollo-config.tgz\" apollo/config\nredis-cli --rdb \"$BACKUP/redis.rdb\"\nrabbitmqadmin export \"$BACKUP/rabbit-definitions.json\"\nkafka-topics.sh --bootstrap-server kafka1:9092 --describe --all > \"$BACKUP/kafka-metadata.txt\"\nsha256sum \"$BACKUP\"/* > \"$BACKUP/SHA256SUMS\"\nsha256sum -c \"$BACKUP/SHA256SUMS\"","output":"apollo-config.tgz OK\nredis.rdb 412MB sha256=...\nrabbit-definitions.json OK\nkafka metadata 记录 35 topics 与 ACL\n所有备份校验通过，RTO 实测 11m42s"}],
      ['故障注入顺序', '先注入单一非生产组件故障，确认监控和手册有效，再扩大故障域；每一步只改变一个变量，记录开始时间、告警时间、人工介入和恢复时间。配置错误与资源耗尽应优先在灰度环境演练，禁止用生产密钥或真实用户数据。验证要保存命令、指标、日志摘录与决策记录。', '一次只注入一种故障', {"title":"故障注入顺序","language":"bash","code":"scripts/chaos.sh --scenario broker-stop --target kafka3 --dry-run\nscripts/chaos.sh --scenario broker-stop --target kafka3 --approve INC-20261124-02\nsleep 60\nkafka-topics.sh --bootstrap-server kafka1:9092 --describe --under-replicated-partitions\ncurl -s http://prometheus:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.severity==\"page\")'\nscripts/chaos.sh --scenario broker-start --target kafka3","output":"dry-run 只输出目标与回滚命令\n10:10:02 kafka3 停止，10:10:14 page 告警\n60 秒内 under-replicated=1\n业务错误率 0.03%，未达到停止条件\n10:12:40 kafka3 恢复，ISR 回补完成"}],
      ['恢复与业务对账', '组件恢复后检查 Kafka lag 与 ISR、Redis 命中与复制、RabbitMQ ready/unacked/DLX、Nginx 成功率、Apollo release 与 Hikari 池指标，再按业务唯一键核对订单、通知和配置结果。允许重复的系统必须证明幂等吸收，不允许丢失的系统必须证明事务或备份覆盖。验收以业务结果、数量差异和责任人确认而非绿色探针为准，并保存差异修正记录。', '技术恢复之后还要对账', {"title":"恢复与业务对账","language":"sql","code":"WITH expected AS (\n  SELECT order_id, status FROM order_events WHERE created_at >= '2026-11-24T10:00+08'\n), actual AS (\n  SELECT id AS order_id, status FROM orders WHERE updated_at >= '2026-11-24T10:00+08'\n)\nSELECT e.order_id, e.status AS expected, a.status AS actual\nFROM expected e FULL JOIN actual a USING (order_id)\nWHERE e.status IS DISTINCT FROM a.status\nORDER BY order_id;","output":"kafka lag=0，ISR 1,2,3\nRedis 命中率恢复到 97%\nRabbitMQ ready=0 unacked=0\n对账查询返回 0 行，订单状态全部一致\n重复事件 12 条均被 event_id 唯一键吸收"}],
      ['运行手册验收', '手册按发现、影响判断、止血、恢复、验证、复盘组织，命令带参数说明和风险标记，联系人、权限、备份路径和回滚 release 可直接找到。由未参与编写的值班者按手册完成一次演练，修正失败步骤；最后记录剩余风险与下次演练日期。新人能独立执行并通过业务对账，手册才算交付。', '由他人执行才算可用', {"title":"运行手册验收","language":"bash","code":"scripts/check-runbook-links.sh docs/runbooks/middleware.md\nscripts/runbook-sim.sh --runbook middleware --operator trainee-b   --scenario redis-failover --sandbox middleware-lab\nrg -n '指标阈值|备份路径|回滚 release|批准人|升级联系人' docs/runbooks/middleware.md\ngit status --short docs/runbooks/middleware.md","output":"所有 18 个命令与 7 个链接可解析\ntrainee-b 独立完成 redis-failover\n恢复后 key 抽检 1000 条一致，耗时 8m31s\n手册记录卡点 2 处并完成修正\n演练证据已链接到变更单"}],
    ],
  },
];
