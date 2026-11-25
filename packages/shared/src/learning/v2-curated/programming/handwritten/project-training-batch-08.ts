// P15 综合训练第八批手写样板：Canvas 实时协作 10 个阶段。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;
const sourceRefs = [
  'Yjs Documentation. https://docs.yjs.dev/',
  'WebSocket API. https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
  'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
];

const makeCourse = (
  phase: string,
  minutes: number,
  goal: string,
  steps: readonly [string, string, string][],
): ProgrammingCourseSeed => ({
  name: `综合训练 · Canvas 实时协作 · ${phase}`,
  track,
  contentStatus: 'reviewed',
  minutes,
  prerequisite: '完成至少一个全栈项目，理解 HTTP、WebSocket、数据库事务和前端状态。',
  goal,
  guidedPractice: `围绕“${phase}”完成可观察实验：${steps[0][1]} 记录网络消息、合并结果、失败状态和恢复证据。`,
  independentPractice: '独立交付阶段产物，并用两到三个客户端并发操作、断线和重连验证最终一致性。',
  commonErrors: [
    '冲突只在客户端按顺序覆盖，没有使用可合并数据类型或服务端版本。',
    '断线重连后直接重放旧消息，没有检查文档版本、权限和撤销状态。',
  ],
  sourceRefs,
  steps,
});

const CANVAS_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  makeCourse('业务理解与用户任务', 42, '能区分协作者、访客、版主和运维的任务，建立离线编辑、合并、撤销、权限和故障恢复的协作链路。', [
    ['按角色拆协作任务', '协作者关注光标、文本和图形是否实时合并，访客关注只读链接，版主关注权限和撤回，运维关注断线、消息积压和数据恢复。每个角色写清输入、成功证据和冲突处理入口。', '协作任务不能只看实时光标'],
    ['把离线到重连拆成状态链', '本地编辑先形成更新，WebSocket 在可连接时发送，服务端验证权限和文档版本后持久化并广播。断线期间保留本地操作，重连后拉取最新状态再合并。', '离线状态必须可恢复'],
    ['区分临时 UI 与持久文档', '光标、选区和正在拖拽属于临时状态，不必永久保存；文本、图形和评论是文档状态，需要版本、权限和可审计更新。', '先判断数据寿命再存'],
    ['记录冲突与撤销边界', '并发编辑应自动合并，真正业务冲突如锁定图形或删除评论要显式提示。撤销只撤销当前用户的可撤销操作，不覆盖其他协作者的新内容。', '撤销不是回滚全局版本'],
    ['形成首版闭环', '首版做文本协作、在线状态、离线编辑、重连、评论和权限；不做完整图形编辑器和跨区域多活。', '首版先验证合并与恢复'],
  ]),
  makeCourse('范围、验收与非功能目标', 40, '能把首版限定为文本协作、在线状态、离线合并、评论和权限，写出多客户端收敛、断线恢复、撤销、权限和延迟验收。', [
    ['范围围绕协作闭环', '首版必须能多人同时编辑同一文档、看到在线状态、断线后继续编辑、重连合并、评论和按角色只读。', '闭环必须包含断线'],
    ['收敛验收使用多客户端', '三客户端并发插入、删除和撤销后，等待网络稳定，所有客户端文档状态和版本必须一致。', '最终状态一致才算通过'],
    ['离线和重连有指标', '记录本地积压更新数、重连耗时、失败次数和合并后大小，长时间离线要有上限和用户提示。', '离线不是永久无限缓存'],
    ['权限和共享链接必须服务端校验', '只读、评论和编辑权限在消息入口和持久化层检查，前端隐藏按钮不是安全边界。', '每个更新验证主体'],
    ['延迟目标绑定上下文', '在固定网络和文档大小下测量本地输入回显、远端更新延迟和重连时间，目标不能只看平均。', '实时体验看尾延迟'],
  ]),
  makeCourse('API 契约与前端数据边界', 48, '能定义文档、更新、评论、在线状态和权限接口，明确 WebSocket 消息、版本向量、断线重连和错误语义。', [
    ['REST 负责资源，WebSocket 负责流', '文档、权限和评论通过 REST 获取或变更，编辑更新与在线状态通过 WebSocket。两个通道共享文档 ID、用户和版本。', '传输通道职责分开'],
    ['更新消息包含文档与来源', '每条更新包含 docId、clientId、updateId、二进制更新和权限上下文；服务端返回确认版本或拒绝原因。', '更新必须可追踪'],
    ['重连先同步快照再补差量', '客户端重连时先获取最新快照和版本，再发送本地待同步更新。不能假设断线期间服务端没有变化。', '重连不是简单重发'],
    ['在线状态与文档数据分离', '光标、选区和在线用户属于短暂状态，使用不同消息频道和过期时间，不写入不可变文档历史。', '临时状态不要污染正文'],
    ['错误区分权限、冲突和版本', '协议错误、无权限、文档不存在、版本过旧和限流使用稳定 code，客户端按 code 恢复而不是解析消息文本。', '错误码驱动重连策略'],
  ]),
  makeCourse('数据模型、约束与迁移', 48, '能设计文档快照、增量更新、评论、权限、审计和在线状态模型，处理版本压缩、迁移、备份和恢复。', [
    ['快照与增量分层保存', '文档表保存当前快照和版本，更新表按序保存增量，定期压缩旧更新。读取先快照再补差量。', '增量历史需要压缩'],
    ['权限与租户进入查询条件', '文档成员、租户和角色作为独立约束，评论和更新入口检查文档归属。共享链接保存过期和权限范围。', '权限不能只靠 URL 秘密'],
    ['评论保留作者和时间', '评论保存作者、时间、锚点、状态和编辑历史，删除使用软删除并保留审计。', '评论也是协作正文'],
    ['在线状态使用 TTL', '在线用户、光标和选区存入 Redis 或内存并设置 TTL，服务重启后可重建，不做永久事实。', '临时状态可丢失'],
    ['迁移保留可读快照', '更新格式或 CRDT 版本变化时先双读验证，再生成新快照，保留旧版本回滚路径。', '迁移不能破坏历史文档'],
  ]),
  makeCourse('项目骨架、模块边界与本地环境', 50, '能建立 React 客户端、Go/Node WebSocket 服务和 PostgreSQL、Redis 本地环境，固定协议、权限、重连和测试入口。', [
    ['客户端拆分文档与连接层', '文档模型、CRDT 状态、网络连接和 UI 分离；连接层负责重连与协议，组件只订阅文档和在线状态。', '网络逻辑不要散在组件'],
    ['服务端拆分鉴权、文档和广播', '鉴权入口验证用户和文档权限，文档服务应用更新并持久化，广播层只向有权限连接分发。', '广播前再次检查权限'],
    ['本地环境模拟多客户端', 'Compose 启动 PostgreSQL、Redis 和 WebSocket 服务，测试脚本启动至少三个客户端操作同一文档。', '本地必须能制造并发'],
    ['配置和版本显式', '协议版本、文档版本、连接心跳和最大消息大小进入配置，客户端和服务端启动时校验兼容。', '协议版本参与握手'],
    ['README 跑通离线重连', '从空目录启动后完成双客户端编辑、断网、继续编辑、重连和收敛，结果可在数据库和界面验证。', '重连路径要可复现'],
  ]),
  makeCourse('后端核心链路与异常恢复', 56, '能实现 WebSocket 鉴权、更新校验、持久化、广播、快照压缩、断线重连和限流，处理重复、乱序和大文档。', [
    ['连接握手完成鉴权', 'WebSocket 建立前验证 token、文档权限和协议版本，连接绑定用户和文档，不允许匿名越权订阅。', '握手阶段就拒绝越权'],
    ['更新先校验再合并', '限制消息大小、频率和文档版本，使用 CRDT 合并后持久化，再广播确认版本。失败返回可重试或拒绝状态。', '服务端是持久化边界'],
    ['重连拉快照和差量', '客户端重连后获取最新快照与版本，只发送服务端尚未确认的本地更新，避免重复应用。', '确认版本减少重复'],
    ['快照压缩不阻塞在线编辑', '后台压缩旧更新生成新快照，使用版本和校验保证一致性；压缩期间新更新继续追加。', '压缩与在线写入并存'],
    ['限流和背压保护服务', '按连接、文档和用户限制消息率与缓存，慢消费者积压超限时断开并提示重新同步。', '广播也要有背压'],
  ]),
  makeCourse('前端页面、状态与可访问交互', 54, '能实现文档编辑、在线光标、评论、只读分享、断线提示和重连状态，保证键盘、触屏和屏幕阅读器可用。', [
    ['编辑状态与连接状态分开', '文档内容在离线时仍可编辑，连接条独立显示在线、重连和只读状态，不能让网络状态冻结输入。', '断线不等于禁止编辑'],
    ['在线光标不遮挡正文', '远端光标和选区使用低干扰样式，支持关闭，正文颜色和焦点保持可读。', '装饰不能压过内容'],
    ['评论与正文锚点关联', '评论列表和正文锚点可互相定位，键盘操作能打开、关闭和返回，删除评论有确认。', '评论导航需要可达'],
    ['只读分享明确权限', '只读页面隐藏编辑入口但仍展示内容和评论，权限变化后及时刷新，不依赖旧连接。', '只读也是服务端状态'],
    ['移动端与屏幕阅读器验收', '触控目标、虚拟键盘、长文档滚动和动态在线提示都可使用，aria-live 只播报必要事件。', '动态协作不能制造噪声'],
  ]),
  makeCourse('联调、测试、安全与性能', 56, '能验证多客户端收敛、断线重连、重复更新、权限、撤销、消息大小和尾延迟，并完成安全回归。', [
    ['收敛测试自动运行', '三个以上客户端并发插入删除，记录最终内容和版本，断线重连后仍一致。', '收敛测试要可重复'],
    ['权限测试覆盖连接与消息', '只读用户不能订阅写频道，越权评论和文档访问被服务端拒绝并审计。', 'WebSocket 也不能绕过授权'],
    ['重复与乱序更新幂等', '同一 updateId 重发不重复应用，旧确认不能覆盖新版本，客户端能丢弃无效消息。', '消息层需要幂等'],
    ['压力和尾延迟测量', '记录消息大小、每秒更新、广播人数、远端延迟和重连时间，慢消费者不能拖垮服务。', '广播容量独立测量'],
    ['安全边界覆盖内容注入', '评论和文档按文本渲染，URL 和权限字段校验，日志不记录全文和令牌。', '协作文档也是不可信输入'],
  ]),
  makeCourse('容器、CI/CD、可观测与发布', 54, '能为客户端和实时服务构建固定制品，配置 WebSocket 代理、会话黏性、指标、Trace 和回滚。', [
    ['制品版本与协议版本同步', '前端、服务端和 CRDT 协议版本一起发布，握手拒绝不兼容客户端并提示刷新。', '版本不兼容要显式'],
    ['WebSocket 代理配置正确', 'Ingress/LB 支持升级、空闲超时和连接数上限，多实例需要广播或共享订阅策略。', 'HTTP 配置不能直接复用'],
    ['指标覆盖连接和文档', '观察连接数、重连、消息率、广播延迟、冲突、快照大小和错误率，Trace 关联 docId 与 clientId。', '连接健康和业务健康同时看'],
    ['灰度发布保留旧协议', '先让服务端兼容旧客户端，再灰度前端；回滚时保持旧快照和协议可读。', '实时协议需要滚动兼容'],
    ['发布后验证收敛', '冒烟用多客户端编辑、断线和重连，确认版本一致、权限有效和指标正常。', '实时系统发布要实测'],
  ]),
  makeCourse('故障演练、回滚与项目答辩', 52, '能演练服务重启、Redis 故障、广播积压、慢消费者、错误快照和权限撤销，完成恢复与答辩。', [
    ['服务重启演练恢复连接', '重启 WebSocket 服务后客户端自动重连，拉取快照和差量，本地离线更新最终合并。', '重启不能丢本地更新'],
    ['Redis 故障保护在线状态', '在线状态可丢失，但文档快照和更新不能依赖临时缓存，恢复后重新注册连接。', '临时状态可降级'],
    ['慢消费者演练背压', '制造慢客户端和广播积压，服务按连接限流并断开超限消费者。', '慢连接不能拖垮全体'],
    ['错误快照演练回滚', '注入错误快照或压缩失败，切回上一快照并重放有效增量。', '快照必须可回滚'],
    ['答辩解释冲突与一致性', '回答为何选 CRDT、如何做权限、断线如何恢复、撤销边界和快照压缩，使用收敛测试和故障数据支撑。', '实时协作答辩以收敛为核心'],
  ]),
];

const CANVAS_STEP_SUFFIXES: Readonly<Record<string, string>> = {
  '区分临时 UI 与持久文档': '光标和选区设置过期时间，断线后由服务端清理。',
  '记录冲突与撤销边界': '撤销栈按用户和操作范围隔离，并记录可撤销更新编号。',
  '形成首版闭环': '每个非目标都说明何时重新评估以及需要的安全证据，并记录负责人。',
  '范围围绕协作闭环': '首版验收必须包含两个以上客户端和一次真实断线。',
  '收敛验收使用多客户端': '保存每个客户端快照、版本、最终内容摘要、失败消息和测试时间。',
  '离线和重连有指标': '记录积压更新数、重连耗时、失败次数、恢复结果和恢复时间。',
  '权限和共享链接必须服务端校验': '连接握手和每条更新都重复检查文档归属、租户、链接过期和角色版本。',
  '延迟目标绑定上下文': '目标同时绑定文档大小、在线人数、网络条件和测试版本。',
  'REST 负责资源，WebSocket 负责流': '两条通道共享主体、文档 ID 和协议版本。',
  '更新消息包含文档与来源': '确认消息返回服务端版本和拒绝原因。',
  '重连先同步快照再补差量': '本地待发送队列只保留服务端未确认更新和失败原因。',
  '在线状态与文档数据分离': '临时状态使用 TTL 和独立频道，不进入快照。',
  '错误区分权限、冲突和版本': '客户端按稳定 code 决定刷新、重连或停止。',
  '快照与增量分层保存': '压缩后的旧增量进入归档并保留校验值、压缩批次和归档结果。',
  '权限与租户进入查询条件': '文档、评论和更新查询都带主体、租户和权限版本。',
  '评论保留作者和时间': '评论锚点使用稳定 ID，正文移动时仍可定位、审计、删除、恢复和导出。',
  '在线状态使用 TTL': '连接数按文档聚合，过期状态由清理任务移除。',
  '迁移保留可读快照': '旧快照和新更新格式在滚动升级期间双读、比较结果并记录回滚。',
  '客户端拆分文档与连接层': '连接层只处理协议、确认、重连和错误。',
  '服务端拆分鉴权、文档和广播': '广播失败不能回滚已持久化文档更新，并记录失败连接。',
  '本地环境模拟多客户端': '测试脚本提供断网、重连和并发编辑开关。',
  '配置和版本显式': '握手拒绝不兼容协议并返回可读升级提示和最低版本。',
  'README 跑通离线重连': '文档包含断网步骤、预期差量和最终收敛结果。',
  '连接握手完成鉴权': '匿名连接、过期 token 和只读越权都要拒绝。',
  '更新先校验再合并': '消息大小、频率和版本超限返回明确错误。',
  '重连拉快照和差量': '客户端只发送未确认更新，服务端重复应用仍幂等并返回确认。',
  '快照压缩不阻塞在线编辑': '压缩任务记录源版本、结果版本、校验摘要、耗时、批次和失败重试。',
  '限流和背压保护服务': '慢消费者超过积压阈值时断开并要求重新同步，同时计数并记录连接。',
  '编辑状态与连接状态分开': '断线提示不能阻塞输入，重连后继续合并本地更新。',
  '在线光标不遮挡正文': '光标可关闭，正文对比度、焦点、选择状态、高对比主题和动效偏好保持可读。',
  '评论与正文锚点关联': '评论打开、关闭、删除和返回都保持键盘焦点连续并支持屏幕阅读器。',
  '只读分享明确权限': '权限撤销后旧连接收到关闭或降级消息、刷新页面并断开旧写连接。',
  '移动端与屏幕阅读器验收': '动效和在线播报遵守 reduced-motion 与 aria-live。',
  '收敛测试自动运行': '测试保存三个客户端的更新顺序、失败消息、最终版本并输出摘要和日志。',
  '权限测试覆盖连接与消息': '只读、评论和编辑角色分别验证通道、API、审计、拒绝原因、恢复和日志。',
  '重复与乱序更新幂等': '重复 updateId 不重复应用，旧消息被丢弃。',
  '压力和尾延迟测量': '记录广播人数、消息大小、P95、失败率、慢消费者数量和环境配置。',
  '安全边界覆盖内容注入': '文档、评论和链接都以文本渲染并校验 URL、长度和协议，记录拒绝原因。',
  '制品版本与协议版本同步': '握手返回最低客户端版本、服务端版本、兼容告警和握手结果。',
  'WebSocket 代理配置正确': '升级头、空闲超时、连接上限和共享广播都要验证。',
  '指标覆盖连接和文档': '连接、重连、广播、快照和错误率进入同一仪表盘。',
  '灰度发布保留旧协议': '新旧客户端在灰度期都可编辑并最终收敛，且记录客户端版本和协议错误。',
  '发布后验证收敛': '冒烟执行双客户端编辑、断线、重连和撤销后比较内容并保存报告。',
  '服务重启演练恢复连接': '客户端自动重连并补发未确认更新，旧连接不残留。',
  'Redis 故障保护在线状态': '在线状态降级时正文仍可读写，恢复后重新注册、核对连接和降级时间。',
  '慢消费者演练背压': '慢连接被断开，健康连接延迟、文档收敛不受影响并保存断开原因、连接数和指标。',
  '错误快照演练回滚': '错误快照隔离并切回上一有效快照、增量、校验记录、恢复时间线、影响范围和负责人。',
  '答辩解释冲突与一致性': '用收敛、断线和性能数据支撑 CRDT 与权限取舍。',
};

const CANVAS_EXAMPLE_ENTRIES: readonly [string, LearningV2LessonExample][] = [
  ['按角色拆协作任务', {
    title: '用角色任务表验证协作入口',
    language: 'JSON',
    code: `{
  "roles": {
    "editor": {"actions": ["edit", "comment", "undo"], "mustSee": ["presence", "saveState"]},
    "viewer": {"actions": ["read", "openComment"], "mustNotSee": ["editToolbar"]},
    "moderator": {"actions": ["removeComment", "revokeShare"], "requiresAudit": true},
    "operator": {"actions": ["inspectConnections", "rebuildSnapshot"], "requiresEvidence": true}
  },
  "acceptance": ["editor offline edit", "viewer denied update", "operator connection count"]
}
// jq -e '.roles.editor.actions | index("undo")' role-tasks.json`,
    output: `jq 返回 0，编辑器拥有 undo；viewer 的动作列表没有 edit，版主和运维动作分别要求审计或证据。
失败边界：只定义角色名称而没有每个角色可执行动作和可见证据，无法验收；权限必须由服务端再次检查。`,
  }],
  ['把离线到重连拆成状态链', {
    title: '实现离线编辑与重连状态机',
    language: 'TypeScript',
    code: `type ConnectionState = 'online' | 'offline' | 'syncing' | 'conflict' | 'readonly';
type Event = 'socket-open' | 'socket-close' | 'snapshot-loaded' | 'auth-revoked' | 'merge-done';
export function reduce(state: ConnectionState, event: Event): ConnectionState {
  if (event === 'socket-close' && state !== 'readonly') return 'offline';
  if (event === 'socket-open' && state === 'offline') return 'syncing';
  if (event === 'snapshot-loaded' && state === 'syncing') return 'online';
  if (event === 'auth-revoked') return 'readonly';
  if (event === 'merge-done' && state === 'syncing') return 'online';
  return state;
}
console.log(reduce(reduce('online', 'socket-close'), 'socket-open'));`,
    output: `输出 syncing，表示断线后本地继续编辑、重新连接时正在补快照；收到快照和确认后才回到 online。
失败边界：socket 关闭不能让输入禁用；权限撤销优先进入 readonly，不能在重连后继续发送写入。`,
  }],
  ['区分临时 UI 与持久文档', {
    title: '把光标状态留在 Awareness 而不写入正文',
    language: 'TypeScript',
    code: `import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
const doc = new Y.Doc();
const awareness = new Awareness(doc);
awareness.setLocalStateField('cursor', {anchor: 12, head: 18, color: '#2f6fed'});
awareness.setLocalStateField('selection', {blockId: 'paragraph-4'});
doc.getText('body').insert(0, '持久正文');
console.log(JSON.stringify({awareness: awareness.getLocalState(), text: doc.getText('body').toString()}));
awareness.destroy();`,
    output: `输出中 cursor/selection 位于 awareness 本地状态，持久正文只有“持久正文”；新客户端可读取光标，但快照不需要保存它。
失败边界：把光标写入 Y.Doc 会污染文档历史；不设置过期或清理则断线用户的光标会长期残留。`,
  }],
  ['记录冲突与撤销边界', {
    title: '仅撤销当前用户的可撤销操作',
    language: 'TypeScript',
    code: `import * as Y from 'yjs';
import { UndoManager } from 'yjs';
const doc = new Y.Doc();
const text = doc.getText('body');
const localOrigin = Symbol('alice');
const undo = new UndoManager(text, {trackedOrigins: new Set([localOrigin])});
text.insert(0, 'Alice', localOrigin);
text.insert(5, ' Bob', Symbol('bob'));
undo.undo();
console.log(text.toString());
console.log({undoStack: undo.undoStack.length, redoStack: undo.redoStack.length});`,
    output: `撤销只移除 trackedOrigin 的 Alice 更新，Bob 的新内容仍在；输出正文不含 Alice，undoStack 降为 0。
失败边界：全局撤销会误删协作者输入；undo/redo 必须绑定用户、版本和权限，撤销后远端仍需收敛。`,
  }],
  ['形成首版闭环', {
    title: '冻结实时协作首版能力矩阵',
    language: 'YAML',
    code: `release: canvas-mvp
included:
  - concurrent-text-edit
  - presence-cursor
  - offline-queue
  - reconnect-snapshot
  - comments
  - server-side-permissions
  - metrics-and-tracing
deferred:
  - full-shape-editor
  - multi-region-active-active
acceptance:
  - three-clients-converge
  - offline-reconnect
  - viewer-write-denied
command: yq '.included | length' canvas-scope.yaml`,
    output: `yq 输出 7，首版以文本协作、离线、重连、评论和权限形成闭环；图形编辑和多区域多活明确延期。
失败边界：若首版无法用两个以上客户端复现断线合并，就不算完成；会议纪要中的愿望不能绕过验收标准。`,
  }],
  ['范围围绕协作闭环', {
    title: '用双客户端完成最小协作会话',
    language: 'TypeScript',
    code: `import { chromium } from 'playwright';
const browser = await chromium.launch();
const alice = await browser.newPage();
const bob = await browser.newPage();
await alice.goto('http://localhost:5173/share/doc-42');
await bob.goto('http://localhost:5173/share/doc-42');
await alice.getByRole('textbox', {name: '文档正文'}).fill('Alice: hello');
await bob.getByRole('textbox', {name: '文档正文'}).waitFor();
await bob.getByRole('textbox', {name: '文档正文'}).press('End');
await bob.keyboard.type(' Bob');
await alice.waitForTimeout(300);
console.log(await bob.getByRole('textbox', {name: '文档正文'}).inputValue());`,
    output: `两个页面最终正文为“Alice: hello Bob”，在线状态同时显示两名用户；控制台没有未处理 WebSocket 错误。
失败边界：只用一个浏览器标签或只测静态文本不算协作；刷新页面后应能从服务端快照恢复同一内容。`,
  }],
  ['收敛验收使用多客户端', {
    title: '三客户端并发后比较 Yjs 状态',
    language: 'TypeScript',
    code: `import * as Y from 'yjs';
const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
const updates: Uint8Array[] = [];
docs.forEach((doc, i) => {
  const text = doc.getText('body');
  doc.on('update', (update: Uint8Array) => updates.push(update));
  text.insert(0, ['A', 'B', 'C'][i]);
});
for (const update of updates) for (const doc of docs) Y.applyUpdate(doc, update);
const states = docs.map((doc) => doc.getText('body').toString());
if (new Set(states).size !== 1) throw new Error('clients diverged');
console.log({converged: states[0], stateVector: states.length});`,
    output: `三个客户端最终正文完全一致，converged 输出最终文本，测试说明合并不依赖接收顺序。
失败边界：只等待固定 100 毫秒可能掩盖问题；测试应保存每轮更新顺序、失败客户端和最终状态向量。`,
  }],
  ['离线和重连有指标', {
    title: '记录积压更新和重连耗时',
    language: 'TypeScript',
    code: `const startedAt = performance.now();
let pendingUpdates = 0;
const metrics = {reconnectTotal: 0, mergeFailed: 0, offlineMs: 0, pendingMax: 0};
window.addEventListener('offline', () => { metrics.offlineMs = performance.now(); });
window.addEventListener('online', async () => {
  metrics.reconnectTotal += 1;
  pendingUpdates = queue.length;
  try { await resync(queue); metrics.mergeFailed += 0; }
  catch { metrics.mergeFailed += 1; }
  console.info('collab-reconnect', {...metrics, pendingUpdates, elapsedMs: performance.now() - startedAt});
});
// 重连超过 30 秒时显示“正在恢复，本地编辑已保留”并保留待发送更新。`,
    output: `console.info 输出 reconnectTotal、pendingUpdates、mergeFailed 和 elapsedMs；离线期间编辑不会丢失，恢复状态可观测。
失败边界：只统计 socket close 不统计恢复失败，无法判断用户是否真正继续协作；积压队列必须有上限和持久化策略。`,
  }],
  ['权限和共享链接必须服务端校验', {
    title: '在 WebSocket 更新入口再次校验权限',
    language: 'TypeScript',
    code: `async function authorizeUpdate(userId: string, docId: string, required: 'read' | 'write') {
  const membership = await db.documentMember.findUnique({where: {docId_userId: {docId, userId}}});
  const link = await db.shareLink.findFirst({where: {docId, userId, revokedAt: null}});
  const allowed = membership?.role === 'editor' || (link && link.expiresAt > new Date() && required === 'read');
  await audit.write({userId, docId, required, allowed});
  return allowed;
}
const canWrite = await authorizeUpdate('viewer-1', 'doc-42', 'write');
if (!canWrite) throw new Error('DOC_WRITE_FORBIDDEN');
console.log({canWrite});`,
    output: `viewer 的写入检查得到 canWrite=false 并抛出 DOC_WRITE_FORBIDDEN，审计记录同时写入角色和请求动作。
失败边界：只读链接不能因客户端发送 update 变成写权限；权限被撤销后旧连接必须重新验证，不能永久信任握手时缓存。`,
  }],
  ['延迟目标绑定上下文', {
    title: '测量实时编辑的远端尾延迟',
    language: 'TypeScript',
    code: `const samples: number[] = [];
const sentAt = new Map<string, number>();
function markSent(updateId: string) { sentAt.set(updateId, performance.now()); }
function onRemoteApplied(updateId: string) {
  const start = sentAt.get(updateId);
  if (start) samples.push(performance.now() - start);
  if (samples.length === 100) {
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.info('collab-latency', {p95Ms: p95, sampleCount: samples.length, docKb: documentBytes / 1024, clients: 3});
  }
}
// 场景：3 客户端、100KB 文档、同城网络；目标 p95 < 150ms。`,
    output: `样本达到 100 后输出 p95Ms、docKb 和 clients；例如 p95Ms=138、docKb=100、clients=3，满足场景目标。
失败边界：不记录文档大小、客户端数和网络条件就宣称实时；平均延迟低但 p95 高仍需排查慢消费者和广播。`,
  }],
  ['REST 负责资源，WebSocket 负责流', {
    title: '分开拉取文档资源与订阅更新流',
    language: 'TypeScript',
    code: `const snapshot = await fetch('/api/docs/42', {headers: {authorization: token}}).then((r) => r.json());
const socket = new WebSocket('wss://collab.test/docs/42/stream?protocol=v3');
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({type: 'subscribe', docId: snapshot.id, fromVersion: snapshot.version}));
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'update') applyUpdate(snapshot.id, message.update, message.version);
});
console.log({snapshotVersion: snapshot.version, protocol: snapshot.protocolVersion});`,
    output: `REST 返回文档快照与版本，WebSocket 只订阅 fromVersion 之后的更新；两条通道使用同一 docId 和协议版本。
失败边界：不能通过 WebSocket 绕过 REST 的文档权限；REST 成功而 WS 握手失败时应展示只读或重试状态，不能静默丢编辑。`,
  }],
  ['更新消息包含文档与来源', {
    title: '解析带来源和版本的协作消息',
    language: 'TypeScript',
    code: `type WireUpdate = {type: 'update'; docId: string; clientId: string; updateId: string; version: number; payload: string};
function parseUpdate(raw: string): WireUpdate {
  const value = JSON.parse(raw) as Partial<WireUpdate>;
  if (value.type !== 'update' || !value.docId || !value.clientId || !value.updateId || typeof value.version !== 'number' || !value.payload) {
    throw new Error('INVALID_UPDATE_MESSAGE');
  }
  if (value.payload.length > 256_000) throw new Error('UPDATE_TOO_LARGE');
  return value as WireUpdate;
}
console.log(parseUpdate(JSON.stringify({type:'update',docId:'42',clientId:'c1',updateId:'u9',version:3,payload:'base64'})));`,
    output: `合法消息返回 docId、clientId、updateId、version 与 payload；缺字段抛 INVALID_UPDATE_MESSAGE，超限抛 UPDATE_TOO_LARGE。
失败边界：只依赖客户端自报 version 不够，服务端必须重新检查文档归属、协议版本和当前权限，拒绝后返回 stable code。`,
  }],
  ['重连先同步快照再补差量', {
    title: '断线重连先拉快照再发送待同步队列',
    language: 'TypeScript',
    code: `async function reconnect(docId: string) {
  const snapshot = await fetch('/api/docs/' + docId + '/snapshot').then((r) => r.json());
  await localDoc.applySnapshot(snapshot.update, snapshot.stateVector);
  const unacknowledged = localQueue.filter((item) => item.updateId > snapshot.lastAcceptedUpdateId);
  for (const item of unacknowledged) await socket.send(item);
  localQueue = localQueue.filter((item) => !unacknowledged.includes(item));
  return {snapshotVersion: snapshot.version, queued: unacknowledged.length};
}
console.log(await reconnect('42'));`,
    output: `重连结果返回服务端 snapshotVersion 和仍待发送的 queued 数；先应用快照再发送未确认更新，避免旧状态覆盖新内容。
失败边界：简单重发整条历史会制造重复更新；快照版本高于本地队列记录时必须重新合并并保留冲突证据。`,
  }],
  ['在线状态与文档数据分离', {
    title: '设置 Awareness 在线状态过期时间',
    language: 'TypeScript',
    code: `import { Awareness } from 'y-protocols/awareness';
const awareness = new Awareness(doc);
const seenAt = new Map<string, number>();
awareness.on('update', ({added, updated}) => {
  for (const clientId of [...added, ...updated]) seenAt.set(String(clientId), Date.now());
});
const timer = setInterval(() => {
  const expired = [...seenAt.entries()].filter(([, at]) => Date.now() - at > 30_000).map(([id]) => id);
  for (const id of expired) { awareness.states.delete(Number(id)); seenAt.delete(id); }
}, 5_000);
console.info({online: awareness.getStates().size, ttlSeconds: 30});`,
    output: `在线用户数和 ttlSeconds 被记录，30 秒无心跳的临时状态被清理；正文快照仍保留，不受连接清理影响。
失败边界：不能把在线用户写进每一条文档更新，否则历史被临时状态污染；清理任务必须避免删除仍有活跃心跳的用户。`,
  }],
  ['错误区分权限、冲突和版本', {
    title: '用稳定错误码驱动客户端恢复',
    language: 'TypeScript',
    code: `type CollabError = {code: 'DOC_FORBIDDEN' | 'DOC_NOT_FOUND' | 'VERSION_STALE' | 'UPDATE_CONFLICT' | 'RATE_LIMITED'; retry: boolean};
const handlers: Record<CollabError['code'], (code: CollabError['code']) => void> = {
  DOC_FORBIDDEN: () => showReadonly('权限已撤销'),
  DOC_NOT_FOUND: () => navigate('/404'),
  VERSION_STALE: () => scheduleSnapshotReload(),
  UPDATE_CONFLICT: () => openMergeReview(),
  RATE_LIMITED: () => backoffAndRetry(),
};
function handle(error: CollabError) { handlers[error.code](error.code); }
handle({code: 'RATE_LIMITED', retry: true});
// 客户端不得通过 message 文本判断错误。`,
    output: `RATE_LIMITED 进入 backoffAndRetry，DOC_FORBIDDEN 进入只读提示；不同错误不会被统一显示成“连接失败”。
失败边界：没有 retryable 标记会导致权限错误无限重试；服务端错误码变更必须维护兼容映射和日志。`,
  }],
  ['快照与增量分层保存', {
    title: '按快照和增量顺序恢复文档',
    language: 'SQL',
    code: `SELECT snapshot.document_id, snapshot.version AS snapshot_version, snapshot.payload
FROM document_snapshot snapshot
WHERE snapshot.document_id = 'doc-42';
SELECT update_id, revision, payload
FROM document_update
WHERE document_id = 'doc-42' AND revision > 17
ORDER BY revision ASC;
INSERT INTO document_snapshot (document_id, version, payload, checksum)
SELECT 'doc-42', max(revision), 'compressed-update', '8a9f'
FROM document_update WHERE document_id = 'doc-42' AND revision > 17;
-- 压缩后旧增量保留在 archive_update，校验 coverage 和 checksum`,
    output: `快照查询返回 version=17，增量查询返回 revision>17 的有序更新；压缩后生成新快照并保留归档覆盖范围。
失败边界：没有 revision 顺序与 checksum 的增量会重复应用或丢失；不能在请求路径同步压缩大量更新影响在线编辑。`,
  }],
  ['权限与租户进入查询条件', {
    title: '用租户与成员约束读取文档',
    language: 'SQL',
    code: `CREATE TABLE document_member (
  tenant_id text NOT NULL, doc_id uuid NOT NULL, user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  revoked_at timestamptz, PRIMARY KEY (tenant_id, doc_id, user_id)
);
SELECT d.id, d.title, m.role
FROM document d JOIN document_member m ON m.doc_id = d.id AND m.tenant_id = d.tenant_id
WHERE d.id = '11111111-1111-1111-1111-111111111111'
  AND m.user_id = 'viewer-1' AND m.revoked_at IS NULL;
-- 写入路径再检查 role IN ('owner','editor')`,
    output: `viewer-1 查询返回 doc-42 和 role=viewer；撤销成员后查询为空，写更新被拒绝，而不是仅隐藏前端按钮。
失败边界：只以 docId 查询会跨租户泄露；共享链接必须单独验证过期时间和 scope，不能绕过成员权限版本。`,
  }],
  ['评论保留作者和时间', {
    title: '保存评论锚点和编辑历史',
    language: 'SQL',
    code: `CREATE TABLE comment (
  id uuid PRIMARY KEY, doc_id uuid NOT NULL, author_id text NOT NULL,
  anchor text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz, deleted_at timestamptz, deleted_by text
);
INSERT INTO comment (id, doc_id, author_id, anchor, body)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'alice', 'block-4', '这里的状态是否已同步？');
SELECT id, author_id, anchor, body, created_at, deleted_at FROM comment WHERE doc_id = '11111111-1111-1111-1111-111111111111';`,
    output: `查询返回作者 alice、锚点 block-4、创建时间和未删除状态；删除评论时只写 deleted_at，不改正文历史。
失败边界：评论锚点不能只存像素位置，正文重排后会失效；删除必须校验版主权限并记录 deleted_by。`,
  }],
  ['在线状态使用 TTL', {
    title: '用 Redis TTL 保存在线连接',
    language: 'Shell',
    code: `redis-cli HSET collab:presence:doc-42 client-1 '{"user":"alice","cursor":12,"color":"#2f6fed"}'
redis-cli HEXPIRE collab:presence:doc-42 30 FIELDS 1 client-1
redis-cli HGETALL collab:presence:doc-42
sleep 31
redis-cli HGETALL collab:presence:doc-42
redis-cli SCARD collab:connections:doc-42`,
    output: `第一次 HGETALL 返回 client-1 状态，31 秒后为空；连接计数由独立集合维护，可定期清理并重建。
失败边界：仅依赖 Redis 状态保存永久在线会让崩溃连接残留；Redis 不可用时应降级在线展示，但不丢失文档快照。`,
  }],
  ['迁移保留可读快照', {
    title: '双读旧快照并生成新格式快照',
    language: 'TypeScript',
    code: `async function migrateDocument(docId: string) {
  const legacy = await db.snapshot.findFirst({where: {docId, format: 'v1'}, orderBy: {version: 'desc'}});
  const decodedOld = decodeV1(legacy.payload);
  const decodedNew = convertV1ToV2(decodedOld);
  const roundTrip = convertV2ToV1(decodedNew);
  if (JSON.stringify(roundTrip) !== JSON.stringify(decodedOld)) throw new Error('MIGRATION_ROUNDTRIP_FAILED');
  await db.snapshot.create({data: {docId, format: 'v2', version: legacy.version + 1, payload: encodeV2(decodedNew)}});
  return {docId, oldVersion: legacy.version, newVersion: legacy.version + 1};
}
console.log(await migrateDocument('doc-42'));`,
    output: `迁移返回 oldVersion 和 newVersion，round-trip 一致后才写入 v2 快照；旧快照仍保留可回滚。
失败边界：直接覆盖旧快照无法回退；迁移期间在线客户端必须能读旧格式或收到可恢复的版本升级提示。`,
  }],
  ['客户端拆分文档与连接层', {
    title: '让网络层只处理版本和重连',
    language: 'TypeScript',
    code: `export class CollabConnection {
  constructor(private socket: WebSocket, private document: Y.Doc, private protocolVersion = 3) {}
  send(update: Uint8Array) {
    const message = {type: 'update', protocolVersion: this.protocolVersion, update: toBase64(update), updateId: crypto.randomUUID()};
    this.socket.send(JSON.stringify(message));
  }
  receive(event: MessageEvent) {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') this.document.applyUpdate(message.update);
    if (message.type === 'update') this.document.applyUpdate(fromBase64(message.update));
  }
}
const connection = new CollabConnection(socket, doc);
connection.send(Y.encodeStateAsUpdate(doc));`,
    output: `连接层发送协议版本、updateId 和二进制更新，接收快照或增量后交给 Y.Doc；UI 不直接拼 WebSocket 消息。
失败边界：断线队列不能散落在组件；连接层必须暴露 ready、syncing、readonly 和错误状态，避免组件各自猜测。`,
  }],
  ['服务端拆分鉴权、文档和广播', {
    title: '先鉴权、应用更新、再广播',
    language: 'TypeScript',
    code: `wss.on('connection', async (socket, request) => {
  const user = await authenticate(request);
  socket.on('message', async (raw) => {
    const message = parseUpdate(raw);
    if (!await canWrite(user.id, message.docId)) return reject(socket, 'DOC_WRITE_FORBIDDEN');
    const result = await documentService.apply(message, user.id);
    await broadcast(message.docId, {...message, revision: result.revision});
  });
});
// 连接注册与权限撤销走独立通道，广播层不重新执行文档权限逻辑。`,
    output: `未授权连接收到 DOC_WRITE_FORBIDDEN；合法更新持久化后才广播 revision，广播对象只包含当前文档订阅者。
失败边界：广播失败不能回滚已提交文档，应记录断线订阅者；权限撤销后旧连接需被主动关闭或降级。`,
  }],
  ['本地环境模拟多客户端', {
    title: 'Compose 启动三个并发协作客户端',
    language: 'YAML',
    code: `services:
  collab:
    build: ./apps/collab
    environment:
      DATABASE_URL: postgres://postgres:local@postgres:5432/collab
      REDIS_URL: redis://redis:6379
      WS_ORIGIN: http://localhost:5173
    ports: ["8088:8088"]
  web:
    build: ./apps/web
    environment: {VITE_WS_URL: ws://localhost:8088}
    ports: ["5173:5173"]
  harness:
    build: ./tools/collab-harness
    command: ["pnpm", "test", "--clients=3", "--offline-after=2"]
    depends_on: [collab, web]`,
    output: `docker compose up --build 后 harness 启动三个客户端，两个在线编辑、一个断网后继续编辑，最终打印收敛摘要。
失败边界：本地只模拟 socket open/close 不足以验证真实重连；harness 必须保留未确认更新并对服务端快照做恢复。`,
  }],
  ['配置和版本显式', {
    title: '启动时拒绝不兼容的协作协议',
    language: 'TypeScript',
    code: `const MIN_CLIENT_PROTOCOL = 3;
const SERVER_PROTOCOL = 3;
function assertProtocol(clientProtocol: number) {
  if (!Number.isInteger(clientProtocol) || clientProtocol < MIN_CLIENT_PROTOCOL) {
    throw Object.assign(new Error('CLIENT_PROTOCOL_TOO_OLD'), {code: 'PROTOCOL_UPGRADE_REQUIRED'});
  }
  if (clientProtocol > SERVER_PROTOCOL) throw new Error('SERVER_PROTOCOL_TOO_OLD');
}
try { assertProtocol(2); } catch (error) { console.error(error.code, error.message); }
console.log({min: MIN_CLIENT_PROTOCOL, server: SERVER_PROTOCOL});`,
    output: `旧客户端收到 PROTOCOL_UPGRADE_REQUIRED，服务端仍输出 min=3/server=3；新客户端连接时还需要交换 snapshot 版本。
失败边界：只在客户端检查版本不能阻止旧客户端写入；版本不兼容时要拒绝握手并给出刷新提示，不能静默降级到未知协议。`,
  }],
  ['README 跑通离线重连', {
    title: '按 README 步骤复现离线编辑与恢复',
    language: 'PowerShell',
    code: `pnpm install --frozen-lockfile
docker compose up -d postgres redis collab web
pnpm exec playwright test tests/collab-offline.spec.ts --project=chromium
$report = Get-Content .\\artifacts\\collab-offline.json | ConvertFrom-Json
if ($report.finalStates -notcontains 'A+B') { throw 'clients did not converge' }
if ($report.reconnectCount -lt 1) { throw 'offline path was not exercised' }
"README verification passed: attempts=$($report.reconnectCount) final=$($report.finalStates -join ',')"`,
    output: `Playwright 完成双客户端离线、继续输入和重连，报告最终状态一致且 reconnectCount 至少为 1，PowerShell 输出通过摘要。
失败边界：只打开页面或只测在线输入不算 README 跑通；断线期间没有本地编辑时不能宣称验证了离线合并。`,
  }],
  ['连接握手完成鉴权', {
    title: '在 WebSocket upgrade 阶段验证令牌',
    language: 'TypeScript',
    code: `server.on('upgrade', async (request, socket, head) => {
  const token = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token');
  const docId = request.url?.split('/').pop();
  try {
    const user = await verifyToken(token);
    const allowed = await canRead(user.id, docId, request.headers.cookie);
    if (!allowed) throw new Error('DOC_FORBIDDEN');
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, user, docId));
  } catch (error) {
    socket.write('HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n');
    socket.destroy();
  }
});
// 测试匿名、过期 token、只读用户越权订阅写频道。`,
    output: `无 token 返回 401，越权文档返回 403；合法 editor 完成 upgrade 并绑定 user/docId，匿名连接没有进入 wss 连接列表。
失败边界：先建立连接再检查权限会暴露订阅面；token 过期、租户不匹配和分享链接过期都要在握手阶段拒绝并审计。`,
  }],
  ['更新先校验再合并', {
    title: '限制消息大小并校验更新结构',
    language: 'TypeScript',
    code: `const MAX_BYTES = 256_000;
function validateClientUpdate(raw: string, doc: Y.Doc) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('UPDATE_TOO_LARGE');
  const parsed = JSON.parse(raw) as {type: string; payload: string; docId: string};
  if (parsed.type !== 'update' || parsed.docId !== 'doc-42' || typeof parsed.payload !== 'string') throw new Error('UPDATE_INVALID');
  const update = Buffer.from(parsed.payload, 'base64');
  const before = doc.getText('body').length;
  Y.applyUpdate(doc, update, 'server');
  return {bytes: update.byteLength, before, after: doc.getText('body').length};
}
console.log(validateClientUpdate(JSON.stringify({type:'update',docId:'doc-42',payload:'AC8B'}), new Y.Doc()));`,
    output: `合法更新返回字节数、合并前后正文长度；超过 256KB 抛 UPDATE_TOO_LARGE，docId 不符抛 UPDATE_INVALID。
失败边界：只在客户端限制大小可被绕过；服务端还需限频、检查权限和版本，合并异常不能写入部分状态。`,
  }],
  ['重连拉快照和差量', {
    title: '只补发服务端未确认的更新',
    language: 'TypeScript',
    code: `async function resume(docId: string, localQueue: PendingUpdate[]) {
  const snapshot = await api.getSnapshot(docId);
  const confirmed = new Set(snapshot.acceptedUpdateIds);
  const pending = localQueue.filter((item) => !confirmed.has(item.updateId));
  for (const item of pending) await sendUpdate(item);
  return {accepted: snapshot.acceptedUpdateIds.length, remaining: pending.length, version: snapshot.version};
}
const result = await resume('doc-42', [{updateId:'u1'}, {updateId:'u2'}, {updateId:'u3'}]);
console.log(result);`,
    output: `服务端 acceptedUpdateIds 含 u1 时只补发 u2/u3，结果 remaining=2；重复请求不会变更文档版本。
失败边界：只依据本地断线时间重发会重复；服务端确认列表缺失时要回到完整快照，不能假定已有更新已落地。`,
  }],
  ['快照压缩不阻塞在线编辑', {
    title: '合并旧增量生成新 Yjs 快照',
    language: 'TypeScript',
    code: `import * as Y from 'yjs';
const doc = new Y.Doc();
const updates = await db.documentUpdate.findMany({where: {docId: 'doc-42'}, orderBy: {revision: 'asc'}});
for (const row of updates) Y.applyUpdate(doc, row.payload);
const snapshot = Y.encodeStateAsUpdate(doc);
const stateVector = Y.encodeStateVector(doc);
await db.documentSnapshot.create({data: {docId: 'doc-42', version: 18, payload: snapshot, stateVector, checksum: sha256(snapshot)}});
for (const row of updates) await archive(row);
console.log({sourceUpdates: updates.length, snapshotBytes: snapshot.byteLength, version: 18});`,
    output: `旧更新合并为 version 18 快照，输出 sourceUpdates 数和 snapshotBytes；压缩期间新更新继续按版本追加。
失败边界：压缩读取与归档必须核对 revision 上界；不保存 stateVector/checksum 无法验证恢复是否覆盖全部历史。`,
  }],
  ['限流和背压保护服务', {
    title: '慢消费者超过缓冲阈值即断开',
    language: 'TypeScript',
    code: `const MAX_BUFFERED = 1_000_000;
function sendSafely(socket: WebSocket, data: string, clientId: string) {
  if (socket.bufferedAmount > MAX_BUFFERED) {
    socket.close(1013, 'slow-consumer');
    metrics.increment('collab_slow_consumer_closed', {clientId});
    return false;
  }
  socket.send(data);
  return true;
}
const limiter = new RateLimiter({windowMs: 1000, max: 30});
socket.on('message', (raw) => limiter.consume(socket) || socket.close(1008, 'rate-limit'));
console.log({maxBufferedBytes: MAX_BUFFERED, messagesPerSecond: 30});`,
    output: `慢连接 bufferedAmount 超过 1MB 后以 1013 关闭并计数，单连接每秒超过 30 条消息以 1008 关闭。
失败边界：只断开不通知客户端会反复重连风暴；服务端还要按文档和租户限流，并保留正常连接尾延迟指标。`,
  }],
  ['编辑状态与连接状态分开', {
    title: '断线时保留输入并显示独立连接条',
    language: 'Vue',
    code: `<script setup lang="ts">
const connection = shallowRef<'online' | 'offline' | 'syncing' | 'readonly'>('online');
const text = ref('本地保留的正文');
const onChange = (value: string) => {
  text.value = value;
  queueLocalUpdate(value);
  if (connection.value === 'offline') status.value = '30 条更新待同步';
};
</script>
<template>
  <textarea v-model="text" aria-label="文档正文" @input="onChange($event.target.value)" />
  <p role="status" :data-state="connection">{{ connection === 'offline' ? '离线编辑中，重连后合并' : connection }}</p>
</template>`,
    output: `断线时 textarea 仍可输入，连接条显示“离线编辑中，重连后合并”并统计待同步更新；网络恢复后只更新连接条。
失败边界：网络断开不能 disable 编辑；readonly 权限撤销必须立即阻止输入并保留已经提交的内容。`,
  }],
  ['在线光标不遮挡正文', {
    title: '渲染低干扰的协作者光标',
    language: 'CSS',
    code: `.collab-editor { position: relative; line-height: 1.7; color: #172033; }
.remote-caret { position: absolute; width: 2px; height: 1.4em; pointer-events: none; opacity: .75; }
.remote-caret::after { content: attr(data-user); position: absolute; top: -.35em; left: 2px; font-size: 10px; color: #fff; background: var(--remote-color); padding: 1px 4px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .remote-caret { transition: none; } }
/* 通过“显示协作者光标”开关可完全移除装饰层，正文选择与焦点不被覆盖。 */`,
    output: `远端光标为 2px 宽且 pointer-events:none，标签不覆盖正文选择；减少动效偏好下没有移动过渡。
失败边界：光标出现不能改变行高或遮挡文字；若颜色是唯一协作者身份提示，屏幕阅读器和色弱用户无法区分。`,
  }],
  ['评论与正文锚点关联', {
    title: '键盘打开评论并返回原锚点',
    language: 'Vue',
    code: `<script setup lang="ts">
const comments = ref([{id:'c1', anchor:'block-4', body:'这里需要补一条边界'}]);
const active = ref<string | null>(null);
function openComment(id: string) { active.value = id; document.getElementById('comment-' + id)?.focus(); }
function closeComment() { active.value = null; document.getElementById('anchor-block-4')?.focus(); }
</script>
<template>
  <mark id="anchor-block-4" tabindex="0" @keydown.enter="openComment('c1')">需要讨论的段落</mark>
  <aside v-if="active" role="dialog" aria-labelledby="comment-title">
    <h3 id="comment-title">评论 c1</h3><button @click="closeComment">返回正文</button>
  </aside>
</template>`,
    output: `正文 anchor 可用 Enter 打开评论，关闭按钮把焦点送回 anchor-block-4；评论标题与正文内容可被读屏识别。
失败边界：关闭后焦点落到 body 会丢失位置；删除评论时必须保留确认并把焦点移到相邻评论或明确锚点。`,
  }],
  ['只读分享明确权限', {
    title: '只读链接拒绝更新并关闭写连接',
    language: 'TypeScript',
    code: `app.get('/share/:token', async (req, res) => {
  const link = await db.shareLink.findUnique({where: {token: req.params.token}});
  if (!link || link.revokedAt || link.expiresAt < new Date()) return res.status(410).json({code: 'SHARE_EXPIRED'});
  res.json({docId: link.docId, permission: link.permission, expiresAt: link.expiresAt});
});
server.on('share-revoked', (docId) => {
  for (const socket of socketsByDoc.get(docId) ?? []) socket.send(JSON.stringify({type: 'permission', permission: 'closed'}));
});
console.log({readonly: true, writeUpdatesAccepted: 0});`,
    output: `有效分享返回 permission=viewer；过期 token 返回 410；分享撤销后连接收到 closed，只读用户不能发送更新。
失败边界：只读页面隐藏工具栏不是安全；权限变化后必须阻止旧连接继续写，并记录撤销时间和操作者。`,
  }],
  ['移动端与屏幕阅读器验收', {
    title: '移动视口验证协作状态和触控目标',
    language: 'TypeScript',
    code: `import { test, expect } from '@playwright/test';
test.use({viewport: {width: 375, height: 812}});
test('mobile collaboration controls remain reachable', async ({page}) => {
  await page.goto('/docs/42');
  await expect(page.getByRole('textbox', {name: '文档正文'})).toBeVisible();
  await page.getByRole('button', {name: '评论'}).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[role="status"]')).toContainText('2 人在线');
  const box = await page.getByRole('button', {name: '返回正文'}).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});`,
    output: `375x812 上输入框、评论按钮和返回正文均可见，状态显示在线人数，触控目标高度至少 44px。
失败边界：动态在线播报不能刷屏，aria-live 应只播报连接状态变化；页面不得因评论面板出现横向溢出。`,
  }],
  ['收敛测试自动运行', {
    title: '自动记录三客户端最终状态',
    language: 'TypeScript',
    code: `import { expect, test } from 'vitest';
test('three clients converge after reordered updates', () => {
  const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
  const updates: Uint8Array[] = [];
  docs.forEach((doc, i) => doc.on('update', (u: Uint8Array) => updates.push(u)));
  docs[0].getText('body').insert(0, 'A');
  docs[1].getText('body').insert(0, 'B');
  docs[2].getText('body').insert(0, 'C');
  for (const update of updates.reverse()) for (const doc of docs) Y.applyUpdate(doc, update);
  const values = docs.map((doc) => doc.getText('body').toString());
  expect(new Set(values).size).toBe(1);
  console.log(JSON.stringify({updates: updates.length, final: values[0]}));
});`,
    output: `测试通过并打印 update 数量和 final 文本；反向应用更新后三份文档仍相同，便于定位收敛失败。
失败边界：测试只验证内存 CRDT 不验证鉴权、持久化和广播；CI 必须保存失败更新序列和每个客户端状态。`,
  }],
  ['权限测试覆盖连接与消息', {
    title: '验证只读用户无法订阅写频道',
    language: 'TypeScript',
    code: `const viewerToken = await tokenFor({userId: 'viewer-1', role: 'viewer'});
const socket = new WebSocket('ws://localhost:8088/docs/42?token=' + viewerToken);
await once(socket, 'open');
socket.send(JSON.stringify({type: 'subscribe', channel: 'updates'}));
const denied = await nextMessage(socket);
expect(denied).toEqual({type: 'error', code: 'DOC_WRITE_FORBIDDEN'});
socket.send(JSON.stringify({type: 'subscribe', channel: 'presence'}));
expect(await nextMessage(socket)).toMatchObject({type: 'presence', docId: '42'});
await auditExpect({userId: 'viewer-1', docId: '42', action: 'subscribe-updates', result: 'denied'});`,
    output: `viewer 订阅 updates 收到 DOC_WRITE_FORBIDDEN，订阅 presence 成功，审计断言存在 denied 事件。
失败边界：只测 HTTP API 权限会漏掉 WebSocket 通道；editor 被撤销权限后连接也必须收到关闭或降级消息。`,
  }],
  ['重复与乱序更新幂等', {
    title: '按 updateId 丢弃重复与旧消息',
    language: 'TypeScript',
    code: `const seen = new Map<string, number>();
function applyIncoming(updateId: string, revision: number, apply: () => void) {
  if (seen.has(updateId)) return {applied: false, reason: 'duplicate'};
  const latest = Math.max(0, ...seen.values());
  if (revision <= latest) return {applied: false, reason: 'stale'};
  seen.set(updateId, revision);
  apply();
  return {applied: true, revision};
}
console.log(applyIncoming('u1', 1, () => {}));
console.log(applyIncoming('u1', 1, () => {}));
console.log(applyIncoming('u2', 0, () => {}));`,
    output: `第一次 applied=true，重复 u1 返回 duplicate，revision=0 的 u2 返回 stale；文档状态不会被旧消息倒退。
失败边界：网络重发和真实新版本不能只按时间戳判断；服务端幂等与客户端去重必须同时存在，并记录拒绝计数。`,
  }],
  ['压力和尾延迟测量', {
    title: '压测广播人数与远端延迟',
    language: 'JavaScript',
    code: `export const options = {
  scenarios: {broadcast: {executor: 'constant-vus', vus: 50, duration: '2m'}},
  thresholds: {'ws_session_duration{scenario:broadcast}': ['p(95)<2000'], 'checks': ['rate>0.99']},
};
export default function () {
  const socket = new WebSocket('ws://localhost:8088/docs/42?token=load-test');
  socket.onopen = () => socket.send(JSON.stringify({type: 'update', updateId: crypto.randomUUID(), payload: 'small'}));
  socket.onmessage = (event) => {
    const ms = Date.now() - Number(JSON.parse(event.data).sentAt);
    if (ms > 500) console.log('slow-broadcast', ms);
  };
  sleep(1);
}`,
    output: `k6 输出广播事件和 p95 延迟，50 个客户端下正常消息仍能达到阈值，慢消费者数量单独记录。
失败边界：只压连接建立不压广播不能证明实时性；高 CPU、掉线或 OOM 时还要检查服务端与客户端两侧指标。`,
  }],
  ['安全边界覆盖内容注入', {
    title: '以文本渲染评论并拒绝危险链接',
    language: 'TypeScript',
    code: `const allowedProtocols = new Set(['https:', 'http:']);
function renderComment(input: {body: string; link?: string}) {
  const link = input.link ? new URL(input.link) : null;
  if (link && !allowedProtocols.has(link.protocol)) throw new Error('UNSAFE_COMMENT_LINK');
  return {body: input.body, link: link?.toString() ?? null, renderedAs: 'text'};
}
const comment = renderComment({body: '<img src=x onerror=alert(1)>', link: 'https://docs.example/item/4'});
console.log({...comment, bodyEscaped: comment.body.replace(/</g, '&lt;')});
// Content-Security-Policy: default-src 'self'; img-src 'self' data:; object-src 'none'`,
    output: `评论正文按文本输出并转义尖括号，只有 http/https 链接被接受；不安全协议抛 UNSAFE_COMMENT_LINK。
失败边界：前端 sanitize 不能替代服务端校验；日志、错误页和告警通知也必须避免明文注入和令牌泄露。`,
  }],
  ['制品版本与协议版本同步', {
    title: '构建前校验客户端与服务端协议一致',
    language: 'TypeScript',
    code: `import { readFile } from 'node:fs/promises';
const client = JSON.parse(await readFile('apps/web/package.json', 'utf8'));
const server = JSON.parse(await readFile('apps/collab/package.json', 'utf8'));
const manifest = JSON.parse(await readFile('release-manifest.json', 'utf8'));
const compatible = client.collabProtocol === server.collabProtocol && server.collabProtocol >= server.minClientProtocol;
if (!compatible) throw new Error('COLLAB_PROTOCOL_MISMATCH');
const artifact = {web: client.version, server: server.version, protocol: server.collabProtocol, gitSha: process.env.GIT_SHA};
await writeFile('artifacts/release-labels.json', JSON.stringify({...artifact, web: manifest.web}));
console.log(artifact);`,
    output: `协议版本一致时生成 release-labels.json，包含 web/server 版本、protocol 和 gitSha；不一致时构建在发布前失败。
失败边界：只给镜像打 latest 标签无法追踪兼容性；服务端升级必须先兼容旧协议，再切换前端。`,
  }],
  ['WebSocket 代理配置正确', {
    title: 'Nginx 保留 WebSocket 升级和空闲超时',
    language: 'Nginx',
    code: `map $http_upgrade $connection_upgrade { default upgrade; '' close; }
upstream collab_backend { server collab:8088; keepalive 32; }
server {
  listen 443 ssl;
  location /docs/ {
    proxy_pass http://collab_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
  }
}`,
    output: `curl --http1.1 -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' https://collab.test/docs/42 返回 101 Switching Protocols，连接至少保持一小时。
失败边界：缺少 Upgrade/Connection 会返回普通 HTTP；代理缓冲和短超时会造成重连风暴，必须用真实 WS 客户端验证。`,
  }],
  ['指标覆盖连接和文档', {
    title: '记录连接、广播与快照指标',
    language: 'TypeScript',
    code: `function observeCollab(docId: string, clientId: string, operation: string, durationMs: number, result: string) {
  metrics.counter('collab_operation_total', 1, {operation, result});
  metrics.histogram('collab_operation_duration_ms', durationMs, {operation});
  tracing.startSpan('collab.' + operation, {docId, clientId, result}).end();
  if (operation === 'snapshot') metrics.gauge('collab_snapshot_bytes', currentSnapshotBytes, {docId});
}
observeCollab('doc-42', 'client-1', 'broadcast', 84, 'success');
observeCollab('doc-42', 'client-1', 'snapshot', 230, 'success');
console.log({dashboards: ['connections', 'broadcast-latency', 'snapshot-size', 'reconnect-errors']});`,
    output: `指标标签包含 operation/result/docId，Trace 能定位同一次广播；快照大小和重连错误进入同一仪表盘。
失败边界：以 clientId 作为高基数标签可能撑爆 Prometheus；日志不应记录完整文档或令牌，指标需设置保留和聚合策略。`,
  }],
  ['灰度发布保留旧协议', {
    title: '用协议开关回退旧客户端',
    language: 'TypeScript',
    code: `const protocols = new Set(['v2', 'v3']);
function negotiate(clientVersion: string) {
  if (!protocols.has(clientVersion)) return {accepted: false, code: 'PROTOCOL_UPGRADE_REQUIRED'};
  return {accepted: true, serverMode: clientVersion === 'v2' ? 'compat-read-write' : 'native', clientVersion};
}
console.log(negotiate('v2'));
console.log(negotiate('v3'));
// 灰度比例来自 feature-flags.json，全部客户端收敛后再关闭 v2 兼容层。`,
    output: `v2 返回 compat-read-write，v3 返回 native；灰度期间两代客户端继续写入同一文档并最终收敛。
失败边界：直接停止 v2 会让旧标签页无法恢复；兼容层必须覆盖握手、快照格式和撤销语义，并记录 clientVersion。`,
  }],
  ['发布后验证收敛', {
    title: '发布后自动执行双客户端冒烟',
    language: 'TypeScript',
    code: `test('post-deploy convergence smoke', async ({browser}) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await a.goto(process.env.APP_URL + '/docs/42');
  await b.goto(process.env.APP_URL + '/docs/42');
  await a.getByRole('textbox').fill('release-a');
  await b.getByRole('textbox').press('End');
  await b.keyboard.type('+release-b');
  await expect(a.getByRole('textbox')).toHaveValue(/release-a\\+release-b/);
  await b.reload();
  await expect(b.getByRole('textbox')).toHaveValue(/release-a\\+release-b/);
  console.log('post-deploy convergence passed');
});`,
    output: `两个客户端写入后内容一致，刷新 b 仍能从快照恢复；控制台输出 post-deploy convergence passed。
失败边界：只看健康检查 200 不代表协作可用；发布冒烟必须包含真实编辑、刷新和至少一次离线恢复。`,
  }],
  ['服务重启演练恢复连接', {
    title: '重启协作服务后合并本地更新',
    language: 'Shell',
    code: `set -euo pipefail
docker compose restart collab
sleep 2
curl -fsS http://localhost:8088/healthz | jq -e '.status == "ok"'
pnpm exec playwright test tests/collab-reconnect.spec.ts --project=chromium
jq '{reconnected, queued, finalState}' artifacts/collab-reconnect.json
test "$(jq -r .reconnected artifacts/collab-reconnect.json)" = true
test "$(jq -r .queued artifacts/collab-reconnect.json)" = 2
echo 'restart recovery passed'`,
    output: `服务健康后重连测试通过，报告显示 reconnected=true、queued=2，最终文档包含断线期间的本地更新。
失败边界：客户端只在内存保存更新时进程崩溃会丢失；server 重启前未持久化的确认也要从快照/队列恢复。`,
  }],
  ['Redis 故障保护在线状态', {
    title: 'Redis 不可用仍允许文档持久化',
    language: 'Shell',
    code: `docker compose stop redis
STATUS=$(curl -s -o redis-error.json -w '%{http_code}' http://localhost:8088/api/docs/42/update -X POST -H 'content-type: application/json' -d '{"updateId":"u7","payload":"small"}')
test "$STATUS" = 201
jq '{saved, presence: .presence, code: .code}' redis-error.json
psql "$DATABASE_URL" -Atc "select count(*) from document_update where doc_id='doc-42' and update_id='u7'"
docker compose start redis
curl -fsS http://localhost:8088/api/docs/42/presence | jq .`,
    output: `Redis 停止时文档更新返回 201 并写入 PostgreSQL，presence 降级为空且带 code；Redis 恢复后在线状态重新建立。
失败边界：文档持久化不能依赖 Redis；在线人数缺失要标记为未知而非 0，恢复时避免把旧连接误判在线。`,
  }],
  ['慢消费者演练背压', {
    title: '制造慢客户端并观察断开原因',
    language: 'Shell',
    code: `pnpm exec tsx tools/slow-consumer.ts --url ws://localhost:8088/docs/42 --pause-ms=5000 &
SLOW_PID=$!
sleep 8
curl -fsS http://localhost:8088/metrics | rg 'collab_slow_consumer_closed'
psql "$DATABASE_URL" -Atc "select reason, client_id from collab_disconnect order by occurred_at desc limit 1"
wait $SLOW_PID || true
echo 'slow consumer isolated'`,
    output: `指标 collab_slow_consumer_closed 增加，最近断开记录 reason=slow-consumer；健康客户端仍能继续编辑并收敛。
失败边界：不能用全局暂停广播处理慢连接；断开后应提示重新同步，并确认文档更新已持久化而不是只留在广播队列。`,
  }],
  ['错误快照演练回滚', {
    title: '校验失败时切回上一有效快照',
    language: 'Shell',
    code: `set -euo pipefail
CURRENT=$(psql "$DATABASE_URL" -Atc "select id from document_snapshot where doc_id='doc-42' order by version desc limit 1")
psql "$DATABASE_URL" -c "insert into snapshot_validation (snapshot_id, expected, actual, result) values ('$CURRENT', '8a9f', '0000', 'failed');"
VALID=$(psql "$DATABASE_URL" -Atc "select id from document_snapshot where doc_id='doc-42' and checksum='8a9f' order by version desc limit 1")
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "update document set active_snapshot_id='$VALID' where id='doc-42';"
curl -fsS http://localhost:8088/api/docs/42 | jq '{snapshotVersion,checksum}'
echo "rolled back snapshot from $CURRENT to $VALID"`,
    output: `错误快照验证失败后，document.active_snapshot_id 指向上一有效版本，查询返回旧 checksum 和版本号。
失败边界：回滚后仍要重放有效增量并做校验；不能直接删除错误快照，证据要保留在隔离区。`,
  }],
  ['答辩解释冲突与一致性', {
    title: '生成收敛、断线和权限证据报告',
    language: 'TypeScript',
    code: `const report = {
  project: 'Canvas realtime collaboration',
  invariant: 'all clients converge to same state after finite updates',
  evidence: {
    convergence: await readJson('artifacts/convergence.json'),
    offlineReconnect: await readJson('artifacts/collab-reconnect.json'),
    permissionDenied: await readJson('artifacts/viewer-denied.json'),
    p95BroadcastMs: await readMetric('collab_broadcast_duration_ms'),
  },
  tradeoffs: ['CRDT metadata cost', 'snapshot compression', 'server-side authorization at every update'],
};
await writeJson('artifacts/defense-report.json', report);
console.log({sections: Object.keys(report.evidence), finalReport: 'defense-report.json'});`,
    output: `报告包含收敛、离线重连、权限拒绝和广播 P95 四类证据，并明确 CRDT 元数据、快照压缩和逐更新鉴权取舍。
失败边界：没有真实断线和越权样本时不能只引用架构图；指标与权限证据必须能追溯到版本、时间和操作人。`,
  }],
];

const CANVAS_STEP_EXAMPLES = Object.fromEntries(
  CANVAS_EXAMPLE_ENTRIES,
) as Readonly<Record<string, LearningV2LessonExample>>;

export const PROGRAMMING_PROJECT_TRAINING_BATCH_08_COURSES =
  CANVAS_COURSES_BASE.map((course) => ({
    ...course,
    steps: course.steps.map((step) => {
      const suffix = CANVAS_STEP_SUFFIXES[step[0]];
      return [
        step[0],
        suffix ? `${step[1]} ${suffix}` : step[1],
        step[2],
        CANVAS_STEP_EXAMPLES[step[0]],
      ] as const;
    }),
  }));
