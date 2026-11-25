// P15 综合训练第十批手写样板：SecureVault 安全笔记 10 个阶段。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;
const sources = [
  'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
  'OIDC Core. https://openid.net/specs/openid-connect-core-1_0.html',
  'MDN Web Crypto API. https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API',
];
const course = (phase: string, minutes: number, goal: string, steps: readonly [string, string, string][]): ProgrammingCourseSeed => ({
  name: `综合训练 · SecureVault 安全笔记 · ${phase}`,
  track,
  contentStatus: 'reviewed',
  minutes,
  prerequisite: '完成一个全栈项目，理解 OIDC、对象授权、浏览器存储和密钥管理基础。',
  goal,
  guidedPractice: `用两个租户、多个角色和攻击样本验证“${phase}”：${steps[0][1]} 记录身份、权限、密文、nonce、审计和恢复证据。`,
  independentPractice: '交付阶段产物，并证明正常用户可用、越权被拒绝、密钥或服务故障后不会泄露敏感数据。',
  commonErrors: ['只检查 URL 或前端按钮权限，没有对象级授权。', '把明文、令牌或客户端密钥写入日志和备份。'],
  sourceRefs: sources,
  steps,
});

const SECUREVAULT_COURSES_BASE: readonly ProgrammingCourseSeed[] = [
  course('业务理解与用户任务', 42, '能区分普通用户、团队管理员、安全审核员和 SRE 的任务，建立登录、解锁、加密、分享、撤权和审计的用户链路。', [
    ['按角色拆安全任务', '用户要安全创建和阅读笔记，管理员要邀请与撤权，审核员要验证加密和越权，SRE 要响应密钥泄露和服务故障。每个任务都要定义成功证据和敏感边界。', '角色任务绑定安全证据'],
    ['画清端到端加密链路', '正文在客户端加密后上传，服务端保存密文、nonce 和密钥版本；分享时重新封装密钥，撤权后新会话无解密权限。服务端不能靠日志还原正文。', '服务端不读取正文'],
    ['先定义信任边界', '浏览器、API、数据库、KMS、日志和备份拥有不同信任级别。客户端密钥不得进入 localStorage，服务端秘密不得下发浏览器。', '先写信任边界'],
    ['记录泄露与恢复路径', '密钥泄露、nonce 复用、撤权延迟和备份泄露都要有停止、轮换、审计和通知步骤，不能只靠删除记录。', '每个敏感资产都有响应路径'],
    ['形成首版闭环', '首版做 OIDC 登录、保险库、加密笔记、分享、撤权和审计；不做匿名分享、自研密码算法和明文恢复密码。', '安全边界优先于功能数量'],
  ]),
  course('范围、验收与非功能目标', 40, '能把首版限定为多租户保险库、密文笔记、对象授权、分享和审计，写出越权、撤权、nonce、日志和恢复验收。', [
    ['范围围绕加密闭环', '用户能登录、创建保险库、加密笔记、授权成员、撤回权限和查看审计，审核员能验证服务端没有明文。', '功能闭环必须含解密权限'],
    ['越权验收覆盖对象级', '跨租户读取、修改、分享和删除全部拒绝，错误响应不能泄露资源是否存在。每个入口使用真实第二租户测试。', '对象授权必须逐接口验证'],
    ['撤权验收看缓存和新会话', '撤权后旧会话、缓存和新请求都不能继续解密；必要时轮换分享密钥并记录传播时间。', '撤权不能只删成员行'],
    ['日志和备份验收脱敏', '日志、Trace、错误和备份中不得出现正文、明文密钥和访问令牌，测试通过样本搜索和密钥扫描验证。', '敏感数据不能随机命中'],
    ['冻结安全首版', '新增分享或恢复能力必须说明密钥生命周期、权限传播和泄露响应，没有威胁模型的入口不进入首版。', '范围变化更新威胁模型'],
  ]),
  course('API 契约与前端数据边界', 48, '能定义身份、保险库、笔记、分享、密钥和审计接口，明确密文格式、nonce、版本、对象授权和错误语义。', [
    ['资源与权限字段稳定', 'vault、note、member、share 和 key 使用稳定 ID，接口同时返回当前主体可执行动作，但服务端每次重新授权。', '前端动作提示不是权限真相'],
    ['密文契约包含算法与版本', '上传正文包含 ciphertext、nonce、algorithm、keyVersion 和 aad，服务端验证格式与大小，不能接受任意加密字符串冒充有效密文。', '密文必须有可验证结构'],
    ['分享返回重新封装密钥', '分享请求为收件人公钥或 KMS 包装生成密钥包，服务端只存密文和权限，解密责任留在客户端。', '分享不发送明文密钥'],
    ['错误不泄露资源存在', '无权限、资源不存在和已删除使用统一外部错误，内部审计保留真实原因和 requestId。', '安全错误最小信息披露'],
    ['契约样例覆盖攻击路径', '样例包含跨租户、撤权后、过期分享、重复 nonce 和错误 keyVersion，供前后端共同测试。', '攻击响应也是契约'],
  ]),
  course('数据模型、约束与迁移', 48, '能设计租户、成员、密文笔记、密钥版本、分享和审计模型，用唯一约束、版本和软删除保护不变量。', [
    ['租户与成员独立建模', 'vault 保存租户边界，member 保存主体和角色，note 同时带 vaultId 与 ownerId，所有查询包含租户条件。', '租户是查询必要字段'],
    ['密文与密钥版本不可变', '每次正文更新生成新 note version，保存 ciphertext、nonce、algorithm、keyVersion 和作者；旧版本用于审计与恢复。', '写操作不覆盖密文历史'],
    ['nonce 必须唯一', '对同一密钥版本建立 nonce 唯一约束或服务端重复检测，冲突拒绝写入并告警，绝不能复用 nonce。', 'nonce 复用会破坏加密'],
    ['分享保留范围和过期', 'share 保存收件人、权限、密钥包、createdAt 和 expiresAt，撤权记录独立审计，查询过滤过期状态。', '分享是可撤销授权'],
    ['迁移不引入明文', '新增字段迁移和回填不能经过日志或临时明文表，加密版本变化保留旧版本解密路径和回滚窗口。', '数据迁移也受威胁模型约束'],
  ]),
  course('项目骨架、模块边界与本地环境', 50, '能建立 React 客户端、Go API、PostgreSQL 和本地 KMS 适配器，固定 OIDC、加密、权限和测试入口。', [
    ['客户端加密层独立', 'WebCrypto、密钥存储、nonce 生成和序列化放在独立模块，UI 不直接管理原始密钥，服务端只接收密文包。', '加密逻辑集中审计'],
    ['服务端拆分身份、资源和审计', 'OIDC 验证、保险库授权、密钥包存储和审计分别有边界，控制器不直接拼 SQL 或读取秘密。', '安全模块职责单一'],
    ['本地秘密可替换', '开发环境使用临时 KMS 适配器和测试密钥，生产通过外部密钥管理注入，仓库不提交真实秘密。', '本地与生产密钥分离'],
    ['测试可覆盖攻击样本', '集成环境支持两个租户、多个角色和过期分享，测试可注入撤权、nonce 冲突和 KMS 故障。', '安全测试需要敌对数据'],
    ['README 跑通加密分享', '从空目录启动 OIDC 模拟、API 和数据库，创建加密笔记、分享、撤权并检查审计。', '首次安全链路可复现'],
  ]),
  course('后端核心链路与异常恢复', 56, '能实现 OIDC 校验、对象授权、密文写入、分享、撤权、KMS 失败和审计，处理并发与重复请求。', [
    ['OIDC 身份映射到内部主体', '验证 issuer、audience、签名和过期时间，再把 sub 映射到用户；不能信任前端传来的 userId。', '身份来自验证后的令牌'],
    ['每个资源动作重新授权', '读取、更新、分享和删除都检查租户、成员和资源归属，授权不依赖缓存中的旧角色。', '对象授权在服务端执行'],
    ['密文写入先校验再提交', '检查密文大小、算法、nonce、keyVersion 和 aad 关联，数据库事务与审计同提交，日志不记录正文。', '安全元数据与数据同验'],
    ['撤权和密钥轮换传播', '撤权更新成员状态并删除相关缓存，必要时生成新 vault 密钥和重封装密钥包，旧会话在新请求被拒绝。', '撤权必须传播到解密路径'],
    ['故障保持失败关闭', 'KMS、数据库或审计不可用时默认拒绝敏感操作，记录安全失败，不把密文降级成明文。', '安全组件失败默认拒绝'],
  ]),
  course('前端页面、状态与可访问交互', 54, '能实现登录、保险库、加密笔记、分享、撤权和审计页面，处理解锁失败、权限变化和移动端输入。', [
    ['解锁流程不持久化密钥', '密钥只保存在内存或受保护存储，离开保险库后清理；刷新需要重新解锁或验证。', '客户端密钥最小驻留'],
    ['权限状态来自服务端', '按钮根据可执行动作提示，但每次操作处理服务端错误；撤权后页面立即切为只读并清理解密缓存。', '前端提示不能代替授权'],
    ['错误不泄露敏感细节', '登录、解密、分享和审计使用稳定错误码，页面不显示堆栈、密钥版本细节或其他租户信息。', '安全错误要可恢复但不泄密'],
    ['危险操作有确认和审计', '撤权、删除、导出和轮换显示影响范围、收件人和不可逆性，执行后展示审计记录。', '安全动作必须可追踪'],
    ['键盘和移动端可用', '解锁、编辑、分享、撤权和审计都可键盘操作，输入不被遮罩，触控目标达标。', '安全体验不能依赖鼠标'],
  ]),
  course('联调、测试、安全与性能', 56, '能验证 OIDC、对象授权、跨租户、撤权、nonce、日志脱敏、密钥轮换和性能，并建立攻击回归。', [
    ['身份与授权矩阵自动测试', '覆盖普通成员、管理员、外部用户和已撤权会话对读取、写入、分享、删除的动作。', '权限矩阵必须正反都有'],
    ['加密元数据攻击测试', '重复 nonce、错误算法、伪造 keyVersion 和篡改 aad 必须被拒绝并审计。', '密文包也要输入校验'],
    ['日志与备份扫描', '在日志、Trace、导出和备份样本中搜索正文、令牌和密钥，命中即测试失败。', '脱敏需要机器验证'],
    ['撤权和轮换集成测试', '撤权后旧缓存、分享链接和旧密钥包失效，轮换后新写入可用、旧内容有受控迁移路径。', '密钥生命周期端到端验收'],
    ['性能和容量测试', '记录登录、解密、保存和审计查询延迟，密钥轮换与批量分享有资源上限。', '安全操作也要可用'],
  ]),
  course('容器、CI/CD、可观测与发布', 54, '能构建安全制品，配置秘密管理、TLS、安全头、扫描、审计存储、指标和回滚。', [
    ['制品最小且无秘密', '多阶段构建、非 root、只读文件系统和固定依赖，镜像和 SBOM 经验证不包含密钥与测试数据。', '镜像不能携带秘密'],
    ['CI 安全门禁分层', '依赖扫描、SAST、秘密扫描、集成越权测试和加密契约测试分别执行，失败有豁免期限。', '安全门禁不能只跑一次'],
    ['运行指标含安全事件', '监控授权拒绝、KMS 错误、撤权传播、轮换状态、异常 nonce 和审计写入失败。', '安全事件需要可观测'],
    ['发布保持密钥兼容', '先发布可读旧 keyVersion 的版本，再切换写入算法；回滚时保留密文和密钥元数据。', '密钥版本参与滚动发布'],
    ['发布后执行安全冒烟', '两个租户登录、加密、分享、撤权、审计和越权拒绝全部验证后才扩大流量。', '安全冒烟是发布门禁'],
  ]),
  course('故障演练、回滚与项目答辩', 52, '能演练 KMS 故障、密钥泄露、撤权延迟、nonce 冲突、备份泄露和错误发布，完成隔离、恢复和答辩。', [
    ['KMS 故障演练失败关闭', '停用 KMS 后敏感写入和解密按策略拒绝，服务端不降级明文，告警包含影响租户和请求。', '密钥不可用不能绕过加密'],
    ['密钥泄露响应', '模拟密钥泄露后停止相关分享、轮换密钥、重封装允许内容、通知受影响用户并保留下载审计。', '泄露响应覆盖数据和权限'],
    ['撤权延迟演练', '撤销成员后检查旧会话、缓存、分享链接和新请求，记录传播时间和未失效路径。', '撤权完成以无法解密为准'],
    ['备份与恢复演练', '恢复后验证密文、nonce、keyVersion 和权限一致，日志中仍无明文，撤销状态不回退。', '恢复不能恢复已撤权访问'],
    ['答辩解释安全取舍', '回答为何服务端不持明文、如何做对象授权、密钥轮换、撤权和失败关闭，用攻击样本和演练证据支撑。', '安全答辩以证据为核心'],
  ]),
];

type StepExample = NonNullable<ProgrammingStepSeed[3]>;

const SECUREVAULT_EXAMPLES: Readonly<Record<string, StepExample>> = {
  '按角色拆安全任务': {
    title: 'TypeScript：用角色能力矩阵锁定越权边界',
    language: 'TypeScript',
    code: `type Role = 'owner' | 'member' | 'auditor' | 'sre';
const capabilities: Record<Role, readonly string[]> = {
  owner: ['note:read', 'note:write', 'share:create', 'audit:read'],
  member: ['note:read', 'note:write', 'share:create'],
  auditor: ['audit:read'],
  sre: ['ops:read'],
};
const required = ['note:read', 'note:write', 'share:create'] as const;
for (const role of Object.keys(capabilities) as Role[]) {
  const missing = required.filter((item) => !capabilities[role].includes(item));
  console.log(role, missing.length === 0 ? 'CAN_EDIT' : 'READ_ONLY');
}`,
    output: `owner CAN_EDIT
member CAN_EDIT
auditor READ_ONLY
sre READ_ONLY

角色矩阵把 UI 提示和服务端授权检查分开，审计员与 SRE 不具备编辑能力。`,
  },
  '画清端到端加密链路': {
    title: 'Web Crypto：生成 AES-GCM 密文、nonce 与 AAD',
    language: 'TypeScript',
    code: `const encoder = new TextEncoder();
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
const nonce = crypto.getRandomValues(new Uint8Array(12));
const aad = encoder.encode('vault:42:note:7:key-version:3');
const sealed = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: nonce, additionalData: aad },
  key,
  encoder.encode('季度预算与访谈记录'),
);
console.log({ nonceBytes: nonce.length, cipherBytes: sealed.byteLength, aad: 'bound' });`,
    output: `{ nonceBytes: 12, cipherBytes: 36, aad: 'bound' }

服务端只保存算法、keyVersion、nonce 和密文；AAD 把密文绑定到保险库、笔记和密钥版本。`,
  },
  '先定义信任边界': {
    title: 'Compose：把浏览器、API 与 KMS 放到不同信任区',
    language: 'YAML',
    code: `services:
  api:
    networks: [edge, private]
    read_only: true
  kms:
    networks: [private]
    expose: ["8080"]
  postgres:
    networks: [private]
    expose: ["5432"]
networks:
  edge: {}
  private:
    internal: true`,
    output: `$ docker compose config --quiet && echo TRUST_BOUNDARY_OK
TRUST_BOUNDARY_OK
docker compose config 没有暴露 KMS 或 PostgreSQL 的宿主端口，只有 API 可连接 edge。`,
  },
  '记录泄露与恢复路径': {
    title: 'jq：在事故手册上执行停止、轮换与通知门禁',
    language: 'Shell',
    code: `set -eu
cat > incident.json <<'JSON'
{"severity":"P1","owner":"secops","steps":[
  {"name":"disable-share","owner":"api-oncall","deadline":"T+5m"},
  {"name":"rotate-kms-key","owner":"secops","deadline":"T+15m"},
  {"name":"notify-tenant","owner":"privacy","deadline":"T+60m"}
]}
JSON
jq -e '(.steps | length) == 3 and all(.steps[]; .owner != "" and .deadline != "")' incident.json`,
    output: `true

任一步缺少负责人或时限时 jq 返回非零，事故演练不得进入“完成”状态。`,
  },
  '形成首版闭环': {
    title: 'Cucumber：加密创建、授权分享与撤权验收',
    language: 'Gherkin',
    code: `Feature: 加密笔记最小闭环
  Scenario: 撤回成员后无法再次解密
    Given 用户 A 在租户 alpha 创建加密笔记 "预算"
    And 用户 B 获得 share:read 权限
    When 用户 A 撤回用户 B 的分享
    Then 用户 B 的旧会话收到 403
    And 新请求无法取得密钥包
    And 审计中存在 "share.revoked" 事件`,
    output: `$ npx cucumber-js features/secure-note.feature --dry-run
1 scenario (1 passed)
3 steps (3 passed)
首版闭环同时覆盖正常解密、撤权后的失败路径和审计证据。`,
  },
  '范围围绕加密闭环': {
    title: 'OpenAPI：冻结首版允许暴露的五个资源动作',
    language: 'YAML',
    code: `openapi: 3.1.0
paths:
  /v1/vaults/{vaultId}/notes:
    get:
      operationId: listNotes
    post:
      operationId: createEncryptedNote
  /v1/notes/{noteId}/shares:
    post:
      operationId: shareNote
  /v1/shares/{shareId}:
    delete:
      operationId: revokeShare
  /v1/audit-events:
    get:
      operationId: listAuditEvents`,
    output: `$ npx @redocly/cli lint openapi.yaml
valid
首版只开放列表、创建、分享、撤权和审计查询；匿名分享和明文导出不在契约中。`,
  },
  '越权验收覆盖对象级': {
    title: 'Go：用第二租户请求证明对象级授权',
    language: 'Go',
    code: `func TestCrossTenantNoteIsHidden(t *testing.T) {
  h := newTestHandler(t)
  req := httptest.NewRequest(http.MethodGet, "/v1/notes/note-alpha", nil)
  req = withPrincipal(req, Principal{UserID: "bob", TenantID: "beta"})
  rec := httptest.NewRecorder()
  h.ServeHTTP(rec, req)
  if rec.Code != http.StatusNotFound {
    t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
  }
}`,
    output: `$ go test ./internal/http -run TestCrossTenantNoteIsHidden -v
=== RUN   TestCrossTenantNoteIsHidden
--- PASS: TestCrossTenantNoteIsHidden (0.01s)
PASS`,
  },
  '撤权验收看缓存和新会话': {
    title: 'Redis：撤权后删除授权缓存并递增会话版本',
    language: 'Shell',
    code: `set -eu
share_id=share-7f2c
redis-cli DEL "share:$share_id"
redis-cli INCR "tenant:alpha:authz-version"
curl -sS -o /tmp/revoked.json -w '%{http_code}\n' \
  -H 'Authorization: Bearer revoked-session' \
  "http://localhost:8080/v1/shares/$share_id/key-package"
jq -r '.code' /tmp/revoked.json`,
    output: `1
42
403
authorization_revoked

缓存删除只是第一步；会话版本和新的密钥包查询也必须拒绝旧权限。`,
  },
  '日志和备份验收脱敏': {
    title: 'gitleaks：扫描日志与备份制品中的敏感材料',
    language: 'Shell',
    code: `set -eu
mkdir -p evidence/scans
gitleaks detect \\
  --source apps/api/var/audit \\
  --report-format json \\
  --report-path evidence/scans/audit.json \\
  --exit-code 7
test "$(jq 'length' evidence/scans/audit.json)" -eq 0
echo BACKUP_AND_LOGS_CLEAN`,
    output: `$ ./scripts/scan-sensitive-artifacts.sh
0 leaks found
BACKUP_AND_LOGS_CLEAN
发现正文、Bearer token、私钥或 KEK 时返回 7，CI 直接阻断发布。`,
  },
  '冻结安全首版': {
    title: 'ADR：把新增功能挡在威胁模型评审之前',
    language: 'Markdown',
    code: `# ADR-001：SecureVault 安全首版冻结

状态：Accepted

首版只包含 OIDC、加密笔记、显式分享、撤权和审计。
任何匿名分享、客户端密钥导出或服务端明文恢复都必须先补充：

1. 资产与攻击者模型
2. 密钥生命周期与撤回策略
3. 越权、泄露和恢复测试

没有完成以上证据的功能不得进入 release/1.x。`,
    output: `$ rg -n "匿名分享|明文恢复|密钥导出" docs/adr/001-security-scope.md
13:任何匿名分享、客户端密钥导出或服务端明文恢复都必须先补充：
评审记录把危险能力变成显式触发条件，而不是藏在待办列表里。`,
  },
  '资源与权限字段稳定': {
    title: 'OpenAPI：资源 ID 与可执行动作分开返回',
    language: 'YAML',
    code: `components:
  schemas:
    Note:
      type: object
      required: [id, vaultId, ownerId, keyVersion, actions]
      properties:
        id: { type: string, pattern: '^note_[a-z0-9]+$' }
        vaultId: { type: string }
        ownerId: { type: string }
        keyVersion: { type: integer, minimum: 1 }
        actions:
          type: array
          items: { enum: [read, update, share, revoke] }`,
    output: `$ npx @redocly/cli lint contracts/openapi.yaml
contracts/openapi.yaml: validated in 94ms
actions 只是 UI 提示；服务端每次请求仍从当前主体和资源关系重新计算权限。`,
  },
  '密文契约包含算法与版本': {
    title: 'Ajv：拒绝缺 nonce、版本或 AAD 的密文包',
    language: 'TypeScript',
    code: `import Ajv from 'ajv';
const schema = {
  type: 'object',
  required: ['ciphertext', 'nonce', 'algorithm', 'keyVersion', 'aad'],
  additionalProperties: false,
  properties: {
    ciphertext: { type: 'string', minLength: 24 },
    nonce: { type: 'string', pattern: '^[A-Za-z0-9_-]{16}$' },
    algorithm: { const: 'AES-256-GCM' },
    keyVersion: { type: 'integer', minimum: 1 },
    aad: { type: 'string', minLength: 16 },
  },
} as const;
const validate = new Ajv({ allErrors: true }).compile(schema);
console.log(validate({ ciphertext: 'abc', keyVersion: 0 }), validate.errors?.length);`,
    output: `false 10

服务端在写库前拒绝短密文、错误 nonce、旧算法、非法密钥版本和缺失 AAD。`,
  },
  '分享返回重新封装密钥': {
    title: 'Web Crypto：用 AES-KW 为收件人重新封装内容密钥',
    language: 'TypeScript',
    code: `const contentKey = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt'],
);
const wrappingKey = await crypto.subtle.generateKey(
  { name: 'AES-KW', length: 256 },
  true,
  ['wrapKey', 'unwrapKey'],
);
const wrapped = await crypto.subtle.wrapKey('raw', contentKey, wrappingKey, 'AES-KW');
console.log({ wrappedBytes: wrapped.byteLength, sentPlaintextKey: false });`,
    output: `{ wrappedBytes: 40, sentPlaintextKey: false }
分享接口只接收收件人包装后的密钥包；服务端不能读取或返回原始内容密钥。`,
  },
  '错误不泄露资源存在': {
    title: 'Go：把无权与不存在统一为同一外部错误',
    language: 'Go',
    code: `func noteError(w http.ResponseWriter, r *http.Request, err error) {
  if errors.Is(err, ErrNotFound) || errors.Is(err, ErrForbidden) {
    w.Header().Set("Content-Type", "application/problem+json")
    w.WriteHeader(http.StatusNotFound)
    _ = json.NewEncoder(w).Encode(map[string]string{
      "code": "resource_unavailable", "requestId": requestID(r.Context()),
    })
    return
  }
  writeProblem(w, r, http.StatusInternalServerError, "internal_error")
}`,
    output: `$ curl -sS http://localhost:8080/v1/notes/note-beta | jq
{
  "code": "resource_unavailable",
  "requestId": "req_01HR..."
}
外部响应不区分“不存在”和“无权”，真实原因只写内部审计。`,
  },
  '契约样例覆盖攻击路径': {
    title: 'Node test：把越权、过期分享和 nonce 冲突纳入契约夹具',
    language: 'TypeScript',
    code: `import assert from 'node:assert/strict';
import fixtures from './contract-fixtures.json' with { type: 'json' };
assert.deepEqual(
  fixtures.cases.map((item) => item.name),
  ['cross-tenant-read', 'expired-share', 'nonce-reuse', 'stale-key-version'],
);
for (const item of fixtures.cases) {
  assert.equal(item.expected.status, 404, item.name);
  assert.equal(item.expected.body.code, 'resource_unavailable', item.name);
}
console.log('validated ' + fixtures.cases.length + ' attack contracts');`,
    output: `$ node --test contract-fixtures.test.mjs
validated 4 attack contracts
跨租户、过期分享、复用 nonce 和旧 keyVersion 都有可自动执行的外部响应断言。`,
  },
  '租户与成员独立建模': {
    title: 'PostgreSQL：用复合外键阻止跨租户笔记关联',
    language: 'SQL',
    code: `CREATE TABLE vaults (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE notes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  vault_id text NOT NULL,
  owner_id text NOT NULL,
  FOREIGN KEY (tenant_id, vault_id) REFERENCES vaults (tenant_id, id)
);
INSERT INTO notes VALUES ('n-cross', 'beta', 'vault-alpha', 'u1');`,
    output: `ERROR: insert or update on table "notes" violates foreign key constraint "notes_tenant_id_vault_id_fkey"
DETAIL: Key (tenant_id, vault_id)=(beta, vault-alpha) is not present in table "vaults".
数据库本身阻止带错租户的笔记写入。`,
  },
  '密文与密钥版本不可变': {
    title: 'PostgreSQL trigger：禁止覆盖旧密文版本',
    language: 'SQL',
    code: `CREATE FUNCTION reject_note_version_update() RETURNS trigger AS $$
BEGIN
  IF OLD.ciphertext IS DISTINCT FROM NEW.ciphertext
     OR OLD.nonce IS DISTINCT FROM NEW.nonce
     OR OLD.key_version IS DISTINCT FROM NEW.key_version THEN
    RAISE EXCEPTION 'note versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER note_versions_immutable
BEFORE UPDATE ON note_versions
FOR EACH ROW EXECUTE FUNCTION reject_note_version_update();`,
    output: `UPDATE 0
ERROR: note versions are immutable
CONTEXT: PL/pgSQL function reject_note_version_update() line 4 at RAISE
更新必须插入新版本，审计和旧内容恢复不能依赖覆盖历史行。`,
  },
  'nonce 必须唯一': {
    title: 'PostgreSQL：按密钥版本建立 nonce 唯一约束',
    language: 'SQL',
    code: `ALTER TABLE note_versions
  ADD CONSTRAINT nonce_unique_per_key
  UNIQUE (vault_id, key_version, nonce);

INSERT INTO note_versions
  (id, vault_id, key_version, nonce, ciphertext, aad)
VALUES
  ('nv-2', 'vault-alpha', 3, 'AAECAwQFBgcICQoL', 'cipher-2', 'vault:alpha');
-- 再插入相同 vault_id + key_version + nonce 会被拒绝`,
    output: `INSERT 0 1
ERROR: duplicate key value violates unique constraint "nonce_unique_per_key"
DETAIL: Key (vault_id, key_version, nonce)=(vault-alpha, 3, AAECAwQFBgcICQoL) already exists.
`,
  },
  '分享保留范围和过期': {
    title: 'SQL：只返回未过期且仍启用的分享',
    language: 'SQL',
    code: `SELECT id, recipient_id, permission, expires_at
FROM note_shares
WHERE note_id = $1
  AND revoked_at IS NULL
  AND expires_at > now()
  AND permission = ANY ($2::text[])
ORDER BY expires_at;

UPDATE note_shares
SET revoked_at = now()
WHERE id = $3 AND revoked_at IS NULL
RETURNING id, revoked_at;`,
    output: `                  id                  | recipient_id | permission |       expires_at
--------------------------------------+--------------+------------+------------------------
share_01HR7                         | user_42      | read       | 2026-11-30 12:00:00+08
`,
  },
  '迁移不引入明文': {
    title: 'PostgreSQL：在事务内只回填密文元数据',
    language: 'SQL',
    code: `BEGIN;
ALTER TABLE notes ADD COLUMN encryption_version integer;
UPDATE notes
SET encryption_version = COALESCE(
  (payload->>'version')::integer,
  1
)
WHERE encryption_version IS NULL;
ALTER TABLE notes ALTER COLUMN encryption_version SET NOT NULL;
COMMIT;
SELECT count(*) FROM notes
WHERE payload ? 'plaintext' OR payload ? 'rawKey';`,
    output: `ALTER TABLE
UPDATE 128
ALTER TABLE
COMMIT
 count
-------
     0
迁移只读取密文包里的版本元数据，扫描结果证明没有回填或保留明文字段。`,
  },
  '客户端加密层独立': {
    title: 'TypeScript：建立不暴露原始密钥的加密模块',
    language: 'TypeScript',
    code: `export class VaultCipher {
  readonly #key: CryptoKey;
  constructor(key: CryptoKey) { this.#key = key; }
  async seal(noteId: string, plaintext: string, keyVersion: number) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode('note:' + noteId + ':v' + keyVersion);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      this.#key,
      new TextEncoder().encode(plaintext),
    );
    return { ciphertext, nonce, keyVersion, algorithm: 'AES-256-GCM' };
  }
}`,
    output: `$ vitest run src/crypto/VaultCipher.test.ts
✓ hides key material from component state
✓ binds nonce and aad to note version
2 tests passed
UI 只能拿到 seal/open 结果，不能直接读取 CryptoKey 或拼接 AAD。`,
  },
  '服务端拆分身份、资源和审计': {
    title: 'Go：用接口隔离身份、授权和审计职责',
    language: 'Go',
    code: `type IdentityResolver interface {
  Resolve(ctx context.Context, token string) (Principal, error)
}
type NoteAuthorizer interface {
  Authorize(ctx context.Context, p Principal, noteID string, action Action) error
}
type AuditSink interface {
  Append(ctx context.Context, event AuditEvent) error
}
type NoteService struct {
  identity IdentityResolver
  authz NoteAuthorizer
  audit AuditSink
  repo NoteRepository
}`,
    output: `$ go test ./internal/notes -run TestServiceWiring -v
=== RUN   TestServiceWiring
--- PASS: TestServiceWiring (0.00s)
身份验证、对象授权、审计和存储可独立替换，HTTP handler 不直接读取令牌或拼 SQL。`,
  },
  '本地秘密可替换': {
    title: 'Compose：用开发 KMS 适配器替代生产密钥',
    language: 'YAML',
    code: `services:
  api:
    environment:
      KMS_ENDPOINT: http://kms-dev:8080
      KMS_KEY_ID: dev-only-keystore
  kms-dev:
    image: local/securevault-kms-dev:0.3.1
    environment:
      MASTER_KEY_FILE: /run/secrets/dev-kek
    secrets: [dev-kek]
secrets:
  dev-kek:
    file: ./.local/dev-kek.txt`,
    output: `$ docker compose --profile dev up -d && ./scripts/check-dev-secrets.sh
KMS_ENDPOINT=http://kms-dev:8080
production-key-id=<absent>
DEV_SECRETS_ISOLATED
.local/ 已加入 .gitignore，CI 还执行 secret scan 防止开发因子进入镜像。`,
  },
  '测试可覆盖攻击样本': {
    title: 'YAML：把跨租户和撤权攻击注入测试环境',
    language: 'YAML',
    code: `tenants:
  alpha:
    users: [alice, bob]
    vaults: [vault-alpha]
  beta:
    users: [mallory]
    vaults: [vault-beta]
fixtures:
  - id: cross-tenant-read
    actor: mallory
    request: { method: GET, path: /v1/notes/note-alpha }
    expect: { status: 404, code: resource_unavailable }
  - id: revoked-session
    actor: bob
    mutate: revoke-share
    request: { method: GET, path: /v1/shares/share-alpha/key-package }
    expect: { status: 403, code: authorization_revoked }`,
    output: `$ pnpm exec tsx tools/seed-security-fixtures.ts && go test ./test/security -v
✓ cross-tenant-read
✓ revoked-session
2 security scenarios passed`,
  },
  'README 跑通加密分享': {
    title: 'Shell：从干净环境完成创建、分享和撤权',
    language: 'Shell',
    code: `set -euo pipefail
docker compose up -d --build
pnpm exec tsx scripts/bootstrap-local.mjs
TOKEN=$(pnpm exec tsx scripts/dev-token.ts alice alpha)
make note-payload > /tmp/note.json
NOTE_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  --data-binary @/tmp/note.json localhost:8080/v1/vaults/vault-alpha/notes | jq -r .id)
SHARE_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' -d '{"recipient":"bob"}' \\
  localhost:8080/v1/notes/$NOTE_ID/shares | jq -r .id)
curl -fsS -X DELETE -H "Authorization: Bearer $TOKEN" \\
  localhost:8080/v1/shares/$SHARE_ID >/dev/null
echo "note=$NOTE_ID share=$SHARE_ID REVOKED"`,
    output: `[+] Running 4/4
note=note_01HR7 share=share_01HR9 REVOKED
本地脚本验证了密文创建、密钥包分享和撤权三个关键步骤，而不是只打开空白 UI。`,
  },
  'OIDC 身份映射到内部主体': {
    title: 'Go：验证 issuer、audience 和签名后映射内部用户',
    language: 'Go',
    code: `verifier := oidc.NewVerifier(
  cfg.Issuer,
  oidc.NewRemoteKeySet(ctx, cfg.JWKSURL),
  &oidc.Config{ClientID: cfg.Audience},
)
rawIDToken, err := authenticator.Verify(r.Context(), token)
if err != nil { deny401(w, r); return }
idToken, err := verifier.Verify(r.Context(), rawIDToken)
if err != nil { deny401(w, r); return }
claims := struct{ Subject string \`json:"sub"\` }{}
if err := idToken.Claims(&claims); err != nil { deny401(w, r); return }
principal, err := users.UpsertExternal(r.Context(), cfg.Issuer, claims.Subject)`,
    output: `$ go test ./internal/auth -run TestOIDC -v
=== RUN   TestOIDC_RejectsWrongAudience
=== RUN   TestOIDC_MapsSubjectToPrincipal
--- PASS: TestOIDC (0.02s)
userId 只由通过签名校验的 issuer+sub 生成，前端提交的 userId 完全不参与授权。`,
  },
  '每个资源动作重新授权': {
    title: 'Go：读取、更新、分享、删除统一走对象授权',
    language: 'Go',
    code: `func (s *Service) authorize(ctx context.Context, p Principal, noteID string, action Action) error {
  note, err := s.repo.FindNote(ctx, p.TenantID, noteID)
  if errors.Is(err, ErrNotFound) { return ErrForbidden }
  if err != nil { return err }
  switch action {
  case ActionRead:
    if note.OwnerID == p.UserID || note.MemberIDs.Contains(p.UserID) { return nil }
  case ActionUpdate, ActionShare, ActionDelete:
    if note.OwnerID == p.UserID { return nil }
  }
  return ErrForbidden
}`,
    output: `$ go test ./internal/notes -run TestAuthorizationMatrix -v
=== RUN   TestAuthorizationMatrix/read_member
=== RUN   TestAuthorizationMatrix/share_non_owner
=== RUN   TestAuthorizationMatrix/delete_owner
--- PASS: TestAuthorizationMatrix (0.01s)`,
  },
  '密文写入先校验再提交': {
    title: 'Go：在数据库事务中校验密文并写审计',
    language: 'Go',
    code: `func (r *Repo) CreateNote(ctx context.Context, p Principal, in CipherInput) (string, error) {
  if err := in.Validate(); err != nil { return "", fmt.Errorf("cipher: %w", err) }
  tx, err := r.db.Begin(ctx)
  if err != nil { return "", err }
  defer tx.Rollback(ctx)
  var id string
  err = tx.QueryRow(ctx, \`INSERT INTO note_versions
    (vault_id, owner_id, ciphertext, nonce, algorithm, key_version, aad)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id\`,
    in.VaultID, p.UserID, in.Ciphertext, in.Nonce, in.Algorithm, in.KeyVersion, in.AAD).Scan(&id)
  if err != nil { return "", err }
  if err = r.audit.Append(ctx, tx, AuditEvent{Action: "note.created", ResourceID: id, ActorID: p.UserID}); err != nil {
    return "", err
  }
  return id, tx.Commit(ctx)
}`,
    output: `$ go test ./internal/storage -run TestCipherAndAuditCommitTogether
--- PASS: TestCipherAndAuditCommitTogether (0.03s)
密文格式失败或审计写入失败时事务整体回滚，不会产生无审计的敏感写入。`,
  },
  '撤权和密钥轮换传播': {
    title: 'Shell：撤权、轮换密钥并等待缓存版本传播',
    language: 'Shell',
    code: `set -eu
curl -fsS -X DELETE -H "Authorization: Bearer $ADMIN" \\
  localhost:8080/v1/shares/share-42 >/dev/null
curl -fsS -X POST -H "Authorization: Bearer $ADMIN" \\
  localhost:8080/v1/vaults/vault-alpha/key-rotations \\
  -d '{"reason":"member-revoked"}' | jq -r '.newKeyVersion'
for attempt in 1 2 3 4 5; do
  value=$(redis-cli GET tenant:alpha:key-version)
  test "$value" = "4" && echo "rotation-visible attempt=$attempt" && exit 0
  sleep 1
done
exit 1`,
    output: `4
rotation-visible attempt=2
撤权先切断分享权限，再等待新密钥版本进入缓存；超时脚本失败，不允许把“已提交”误报成“已传播”。`,
  },
  '故障保持失败关闭': {
    title: 'Go：KMS 超时返回拒绝而不是明文降级',
    language: 'Go',
    code: `func (s *VaultService) Decrypt(ctx context.Context, req DecryptRequest) ([]byte, error) {
  if req.Algorithm != "AES-256-GCM" || req.KeyVersion < 1 {
    return nil, ErrInvalidCipher
  }
  key, err := s.kms.Unwrap(ctx, req.WrappedKey)
  if errors.Is(err, context.DeadlineExceeded) {
    s.metrics.Inc("kms_timeout_total")
    return nil, ErrSecureUnavailable
  }
  if err != nil { return nil, ErrSecureUnavailable }
  return s.cipher.Open(key, req)
}`,
    output: `$ go test ./internal/vault -run TestKMSFailureFailsClosed
--- PASS: TestKMSFailureFailsClosed (0.01s)
handler returned 503 secure_unavailable; plaintext fallback called 0 times`,
  },
  '解锁流程不持久化密钥': {
    title: 'Playwright：刷新后清除内存密钥并重新要求解锁',
    language: 'TypeScript',
    code: `import { test, expect } from '@playwright/test';
test('vault key is not persisted across reload', async ({ page }) => {
  await page.goto('/vaults/vault-alpha');
  await page.getByLabel('主密码').fill('correct horse battery staple');
  await page.getByRole('button', { name: '解锁' }).click();
  await expect(page.getByText('季度预算')).toBeVisible();
  const stored = await page.evaluate(() => ({ ...localStorage, ...sessionStorage }));
  expect(JSON.stringify(stored)).not.toContain('CryptoKey');
  await page.reload();
  await expect(page.getByRole('button', { name: '解锁' })).toBeVisible();
});`,
    output: `$ npx playwright test tests/unlock.spec.ts --project=chromium
✓ 1 [chromium] › tests/unlock.spec.ts:2:1 › vault key is not persisted
1 passed
刷新后必须重新解锁，浏览器持久存储没有出现密钥材料。`,
  },
  '权限状态来自服务端': {
    title: 'TypeScript：动作提示失效时立即回落只读',
    language: 'TypeScript',
    code: `async function loadNote(id: string) {
  const response = await fetch('/v1/notes/' + id);
  if (response.status === 403 || response.status === 404) {
    return { note: null, readonly: true, reason: 'resource_unavailable' };
  }
  if (!response.ok) throw new Error('note request failed: ' + response.status);
  const note = await response.json();
  return { note, readonly: !note.actions.includes('update'), reason: null };
}
const state = await loadNote('note-42');
console.log(state.readonly, state.reason);`,
    output: `true authorization_revoked

按钮是否显示来自服务端 actions，但真正操作仍要处理 403；前端旧状态不能变成权限来源。`,
  },
  '错误不泄露敏感细节': {
    title: 'cURL：断言登录失败响应不包含密钥或租户信息',
    language: 'Shell',
    code: `set -eu
body=$(mktemp)
status=$(curl -sS -o "$body" -w '%{http_code}' \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"alice@example.com","password":"wrong"}' \\
  localhost:8080/v1/session)
test "$status" = "401"
jq -e '(.code == "authentication_failed") and (has("stack") | not) and (has("keyVersion") | not)' "$body"
if rg -q 'vault-alpha|CryptoKey|SQLSTATE' "$body"; then exit 9; fi
echo SAFE_AUTH_ERROR`,
    output: `401
true
SAFE_AUTH_ERROR

错误保持可恢复，但不返回用户是否存在、数据库错误、密钥版本或其他租户线索。`,
  },
  '危险操作有确认和审计': {
    title: 'Playwright：撤权确认后展示影响范围与审计事件',
    language: 'TypeScript',
    code: `import { test, expect } from '@playwright/test';
test('revoke share requires explicit scope confirmation', async ({ page }) => {
  await page.goto('/shares/share-42');
  await page.getByRole('button', { name: '撤销分享' }).click();
  const dialog = page.getByRole('dialog', { name: '确认撤销分享' });
  await expect(dialog).toContainText('bob@example.com');
  await expect(dialog).toContainText('立即失效');
  await dialog.getByLabel('我理解影响范围').check();
  await dialog.getByRole('button', { name: '确认撤销' }).click();
  await expect(page.getByRole('status')).toContainText('share.revoked');
});`,
    output: `$ npx playwright test tests/revoke-share.spec.ts --project=chromium
✓ revoke share requires explicit scope confirmation
1 passed
确认框明确收件人、权限与不可逆影响，完成后从服务端审计回显真实事件。`,
  },
  '键盘和移动端可用': {
    title: 'Playwright：390px 触屏与键盘均可完成解锁和分享',
    language: 'TypeScript',
    code: `import { test, expect, devices } from '@playwright/test';
test.use({ ...devices['iPhone 13'] });
test('mobile vault flow has no clipped controls', async ({ page }) => {
  await page.goto('/vaults/vault-alpha');
  await page.getByLabel('主密码').fill('correct horse battery staple');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '分享笔记 预算' }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBe(390);
});`,
    output: `$ npx playwright test tests/mobile-vault.spec.ts
✓ mobile vault flow has no clipped controls (1.7s)
1 passed
390px 视口无横向溢出，虚拟键盘 Enter 解锁和触屏分享入口均可用。`,
  },
  '身份与授权矩阵自动测试': {
    title: 'Go：用表驱动测试执行完整授权矩阵',
    language: 'Go',
    code: `func TestAuthorizationMatrix(t *testing.T) {
  cases := []struct { role, action string; want int }{
    {"owner", "read", 200}, {"owner", "share", 200}, {"owner", "delete", 200},
    {"member", "read", 200}, {"member", "share", 200}, {"member", "delete", 404},
    {"auditor", "read", 404}, {"revoked", "read", 404}, {"outsider", "read", 404},
  }
  for _, tc := range cases {
    t.Run(tc.role+"_"+tc.action, func(t *testing.T) {
      got := requestAs(t, tc.role, tc.action, "note-alpha")
      if got != tc.want { t.Fatalf("want %d, got %d", tc.want, got) }
    })
  }
}`,
    output: `$ go test ./test/security -run TestAuthorizationMatrix -v
--- PASS: TestAuthorizationMatrix/owner_delete
--- PASS: TestAuthorizationMatrix/member_delete
--- PASS: TestAuthorizationMatrix/revoked_read
PASS`,
  },
  '加密元数据攻击测试': {
    title: 'Go：重复 nonce、错误算法和篡改 AAD 全部拒绝',
    language: 'Go',
    code: `func TestRejectsForgedCipherEnvelope(t *testing.T) {
  valid := CipherInput{Ciphertext: "cipher", Nonce: "AAECAwQFBgcICQoL", Algorithm: "AES-256-GCM", KeyVersion: 3, AAD: "vault:alpha:note:1"}
  cases := map[string]func(*CipherInput){
    "empty-nonce": func(v *CipherInput) { v.Nonce = "" },
    "wrong-algorithm": func(v *CipherInput) { v.Algorithm = "AES-CBC" },
    "stale-version": func(v *CipherInput) { v.KeyVersion = 0 },
    "missing-aad": func(v *CipherInput) { v.AAD = "" },
  }
  for name, mutate := range cases {
    t.Run(name, func(t *testing.T) {
      input := valid; mutate(&input)
      if err := input.Validate(); err == nil { t.Fatal("malformed envelope accepted") }
    })
  }
}`,
    output: `$ go test ./internal/crypto -run TestRejectsForgedCipherEnvelope -v
--- PASS: TestRejectsForgedCipherEnvelope/empty_nonce
--- PASS: TestRejectsForgedCipherEnvelope/wrong_algorithm
--- PASS: TestRejectsForgedCipherEnvelope/missing_aad
PASS`,
  },
  '日志与备份扫描': {
    title: 'Shell：发布前扫描日志、Trace 与备份清单',
    language: 'Shell',
    code: `set -eu
find artifacts/logs artifacts/traces artifacts/backups -type f -print0 \\
  | xargs -0 rg -n -i \\
    -e 'Bearer [A-Za-z0-9._~-]+' \\
    -e '"(plaintext|cipherKey|privateKey)"\\s*:' \\
    -e 'vault-[a-z0-9]+/note-[a-z0-9]+' \\
    > sensitive-hits.txt || true
test ! -s sensitive-hits.txt
tar -czf evidence/sensitive-artifacts-scan.tgz sensitive-hits.txt
echo SENSITIVE_ARTIFACTS_SCAN_PASS`,
    output: `$ scripts/scan-sensitive-artifacts.sh
SENSITIVE_ARTIFACTS_SCAN_PASS
sensitive-hits.txt 为空；扫描范围包含日志、Trace 和备份清单，失败时保留命中样本供审计。`,
  },
  '撤权和轮换集成测试': {
    title: 'Shell：旧分享失效后再确认新密钥可写',
    language: 'Shell',
    code: `set -eu
old_status=$(curl -sS -o /tmp/old-share.json -w '%{http_code}' \\
  -H "Authorization: Bearer $BOB_OLD" \\
  localhost:8080/v1/shares/share-42/key-package)
test "$old_status" = "403"
new_version=$(curl -fsS -X POST -H "Authorization: Bearer $ADMIN" \\
  localhost:8080/v1/vaults/vault-alpha/key-rotations | jq -r '.newKeyVersion')
new_write=$(curl -sS -o /tmp/new-write.json -w '%{http_code}' \\
  -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \\
  -d @fixtures/note-v4.json localhost:8080/v1/vaults/vault-alpha/notes)
test "$new_write" = "201"
echo "old_share=$old_status new_key=$new_version write=$new_write"`,
    output: `old_share=403 new_key=4 write=201
旧分享无法取得密钥包，新 keyVersion 下仍可创建密文；测试同时覆盖拒绝路径和恢复路径。`,
  },
  '性能和容量测试': {
    title: 'k6：测量解密、保存与审计查询的 P95 延迟',
    language: 'JavaScript',
    code: `import http from 'k6/http';
import { check } from 'k6';
export const options = {
  scenarios: {
    decrypt_and_save: {
      executor: 'constant-vus', vus: 30, duration: '60s',
      thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<450'] },
    },
  },
};
export default function () {
  const list = http.get('http://localhost:8080/v1/vaults/vault-alpha/notes');
  check(list, { 'notes listed': (r) => r.status === 200 });
  const audit = http.get('http://localhost:8080/v1/audit-events?limit=50');
  check(audit, { 'audit readable': (r) => r.status === 200 });
}`,
    output: `$ k6 run load/securevault.js
http_req_duration........: avg=181ms p(95)=392ms
http_req_failed..........: 0.17%
checks.........................: 100.00% ✓ 6000
30 并发下查询 P95 未超预算，失败率和审计访问容量均有可比较基线。`,
  },
  '制品最小且无秘密': {
    title: 'Dockerfile：多阶段、非 root、只读运行且不含测试秘密',
    language: 'Dockerfile',
    code: `FROM golang:1.24 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
USER nonroot:nonroot
ENTRYPOINT ["/api"]
EXPOSE 8080`,
    output: `$ docker build -t securevault-api:test . && trivy image --scanners secret securevault-api:test
securevault-api:test (alpine 3.21.3)
No secrets found
最终镜像无 Go 编译器、测试数据和开发 KEK，并以非 root 用户运行。`,
  },
  'CI 安全门禁分层': {
    title: 'GitHub Actions：依赖、SAST、秘密和越权测试独立阻断',
    language: 'YAML',
    code: `jobs:
  dependencies:
    steps:
      - run: pnpm audit --audit-level high
      - run: govulncheck ./...
  source-security:
    steps:
      - run: gitleaks detect --source . --exit-code 1
      - run: semgrep ci --config p/owasp-top-ten
  authorization:
    steps:
      - run: go test ./test/security -run 'TestCrossTenant|TestRevoked'
      - run: pnpm test:contract
  publish:
    needs: [dependencies, source-security, authorization]`,
    output: `$ gh run watch 238197
✓ dependencies (1m 12s)
✓ source-security (48s)
✓ authorization (2m 03s)
✓ publish (skipped until all gates pass)
任何安全门禁失败，publish job 都不会获得 secrets 或发布权限。`,
  },
  '运行指标含安全事件': {
    title: 'PromQL：授权拒绝、KMS 超时和撤权传播一起告警',
    language: 'PromQL',
    code: `(
  sum(rate(securevault_authorization_denied_total[5m]))
  /
  clamp_min(sum(rate(securevault_requests_total{route=~".*notes.*"}[5m])), 0.001)
) > 0.3
or
sum(rate(securevault_kms_timeout_total[5m])) > 0
or
max(securevault_revocation_propagation_seconds) > 60`,
    output: `$ promtool query instant http://localhost:9090 \
  'sum(rate(securevault_kms_timeout_total[5m]))'
{__name__="sum(rate(securevault_kms_timeout_total[5m]))"} => 0.04 @[1720000000]
KMS 超时和撤权传播超过 60 秒会立刻告警，不隐藏在普通 HTTP 错误率里。`,
  },
  '发布保持密钥兼容': {
    title: 'Go：滚动发布期间同时读取两个密钥版本',
    language: 'Go',
    code: `func (s *VaultService) Open(ctx context.Context, envelope Envelope) (string, error) {
  switch envelope.KeyVersion {
  case 2, 3, 4:
    key, err := s.kms.Unwrap(ctx, envelope.WrappedKey)
    if err != nil { return "", fmt.Errorf("unwrap key v%d: %w", envelope.KeyVersion, err) }
    return s.cipher.Decrypt(key, envelope)
  default:
    s.metrics.Inc("unsupported_key_version_total")
    return "", ErrUnsupportedKeyVersion
  }
}`,
    output: `$ go test ./internal/vault -run TestReadsRollingKeyVersions -v
=== RUN   TestReadsRollingKeyVersions
--- PASS: TestReadsRollingKeyVersions (0.01s)
supported=2,3,4 writes=4
新版本先支持旧 keyVersion 读取，再切换写入版本；回滚窗口内密文仍可解释。`,
  },
  '发布后执行安全冒烟': {
    title: 'Shell：发布后执行双租户越权与撤权冒烟',
    language: 'Shell',
    code: `set -eu
BASE=https://securevault.example.test
ALICE=$(scripts/test-token.sh alice alpha)
BOB=$(scripts/test-token.sh bob beta)
test "$(curl -sS -o /tmp/cross.json -w '%{http_code}' \\
  -H "Authorization: Bearer $BOB" "$BASE/v1/notes/note-alpha")" = "404"
test "$(curl -sS -o /tmp/share.json -w '%{http_code}' \\
  -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \\
  -d '{"recipient":"bob"}' "$BASE/v1/notes/note-alpha/shares")" = "201"
curl -fsS "$BASE/health/security" | jq -e '.kms == "ready" and .audit == "ready"'
echo POST_RELEASE_SECURITY_SMOKE_OK`,
    output: `404
201
true
POST_RELEASE_SECURITY_SMOKE_OK
流量扩大前验证跨租户拒绝、合法分享和 KMS/审计健康，任一异常立即停止发布。`,
  },
  'KMS 故障演练失败关闭': {
    title: 'Go：KMS 超时下验证 503 且没有明文降级',
    language: 'Go',
    code: `func TestKMSOutageDoesNotReturnPlaintext(t *testing.T) {
  kms := &stubKMS{err: context.DeadlineExceeded}
  svc := NewVaultService(kms, newTestCipher(), newMetricsRecorder())
  _, err := svc.Open(context.Background(), Envelope{KeyVersion: 4, Ciphertext: "sealed"})
  if !errors.Is(err, ErrSecureUnavailable) {
    t.Fatalf("want ErrSecureUnavailable, got %v", err)
  }
  if got := svc.metrics.Count("kms_timeout_total"); got != 1 {
    t.Fatalf("timeout metric=%d", got)
  }
  if svc.plaintextFallbackCalled { t.Fatal("plaintext fallback must be unreachable") }
}`,
    output: `$ go test ./internal/vault -run TestKMSOutageDoesNotReturnPlaintext -v
=== RUN   TestKMSOutageDoesNotReturnPlaintext
--- PASS: TestKMSOutageDoesNotReturnPlaintext (0.00s)
PASS`,
  },
  '密钥泄露响应': {
    title: 'Shell：隔离旧密钥、建立事件证据并限制后续使用',
    language: 'Shell',
    code: `set -eu
INCIDENT=INC-2026-1117
mkdir -p "evidence/$INCIDENT"
curl -fsS -X POST -H "Authorization: Bearer $SECOPS_TOKEN" \\
  "$KMS_ADMIN/v1/keys/key-2026-11/disable" | tee "evidence/$INCIDENT/kms-disable.json"
cosign sign-blob --yes "evidence/$INCIDENT/kms-disable.json" > "evidence/$INCIDENT/evidence.sig"
jq -n --arg id "$INCIDENT" --arg at "$(date -u +%FT%TZ)" \\
  '{incident:$id,containedAt:$at,state:"shares-disabled",next:"rotate-and-rewrap"}' \\
  > "evidence/$INCIDENT/timeline.json"
jq -e '.state == "shares-disabled"' "evidence/$INCIDENT/timeline.json"`,
    output: `{"keyId":"key-2026-11","state":"disabled"}
true
旧 KMS 密钥已停用，证据文件已签名；下一步轮换 KEK、重封装允许内容并通知受影响租户。`,
  },
  '撤权延迟演练': {
    title: 'Shell：以无法解密作为撤权完成的唯一判据',
    language: 'Shell',
    code: `set -eu
start=$(date +%s)
curl -fsS -X DELETE -H "Authorization: Bearer $ADMIN" \\
  localhost:8080/v1/members/member-bob >/dev/null
for attempt in $(seq 1 20); do
  status=$(curl -sS -o /tmp/bob-key.json -w '%{http_code}' \\
    -H "Authorization: Bearer $BOB_OLD" \\
    localhost:8080/v1/vaults/vault-alpha/key-package)
  if [ "$status" = "403" ]; then
    echo "revocation_visible_seconds=$(( $(date +%s) - start ))"
    exit 0
  fi
  sleep 1
done
echo REVOCATION_TIMEOUT >&2
exit 1`,
    output: `revocation_visible_seconds=4

删除成员成功后仍持续探测旧会话；只有密钥包请求被拒绝，才认为撤权传播完成。`,
  },
  '备份与恢复演练': {
    title: 'PostgreSQL：恢复后核对密文、密钥版本与撤权状态',
    language: 'SQL',
    code: `BEGIN;
CREATE TEMP TABLE restored_notes AS
SELECT id, nonce, key_version, ciphertext
FROM notes_restore
WHERE tenant_id = 'alpha';
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE ciphertext IS NULL OR nonce IS NULL) AS malformed,
  count(DISTINCT key_version) AS key_versions
FROM restored_notes;
SELECT count(*) AS revoked_shares
FROM shares_restore
WHERE revoked_at IS NOT NULL;
ROLLBACK;`,
    output: ` total | malformed | key_versions
-------+-----------+--------------
   128 |         0 |            3
 revoked_shares
----------------
              2
恢复样本中密文结构完整且仍保留撤权状态，明文和旧权限都没有被备份回滚回来。`,
  },
  '答辩解释安全取舍': {
    title: 'Shell：从真实指标和攻击样本生成答辩证据',
    language: 'Shell',
    code: `set -eu
mkdir -p evidence/defense
go test ./test/security -run 'TestCrossTenant|TestRevoked|TestKMS' -json \\
  > evidence/defense/security-tests.jsonl
promtool query instant http://prometheus:9090 \\
  'securevault_authorization_denied_total' \\
  > evidence/defense/authz-denied.txt
jq -s '{passed: map(select(.Action == "pass")) | length, failed: map(select(.Action == "fail")) | length}' \\
  evidence/defense/security-tests.jsonl \\
  > evidence/defense/summary.json
jq -e '.passed >= 3 and .failed == 0' evidence/defense/summary.json`,
    output: `{"passed":3,"failed":0}
true
答辩证据包含真实越权测试、撤权测试、KMS 故障测试和授权拒绝指标，不只展示架构图。`,
  },
};

function withSecureVaultExamples(
  courses: readonly ProgrammingCourseSeed[],
): readonly ProgrammingCourseSeed[] {
  return courses.map((item) => ({
    ...item,
    steps: item.steps.map((step) => {
      const body = step[1].length >= 100
        ? step[1]
        : `${step[1]} 并保存“${step[2]}”对应的主体、权限、密文元数据和审计记录。`;
      const example = SECUREVAULT_EXAMPLES[step[0]];
      if (!example) throw new Error(`Missing SecureVault example: ${step[0]}`);
      return [step[0], body, step[2], example] as const;
    }),
  }));
}

export const PROGRAMMING_PROJECT_TRAINING_BATCH_10_COURSES =
  withSecureVaultExamples(SECUREVAULT_COURSES_BASE);
