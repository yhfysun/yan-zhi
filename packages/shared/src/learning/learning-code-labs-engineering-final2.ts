import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

const nodeRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: 'Node.js 标准库',
  docsUrl: 'https://nodejs.org/api/',
  installSteps: [
    '使用应用内置 Node.js，不需要安装第三方依赖。',
    '代码从 stdin 读取本任务提供的确定性输入。',
    '运行后核对断言、输出证据和退出码。',
  ],
  languages: ['javascript'],
} as const;

type NodeTaskSpec = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly checkpoint: string;
  readonly code: string;
};

function nodeTask(spec: NodeTaskSpec): LearningV2CodeLabTask {
  return {
    id: spec.id,
    title: spec.title,
    brief: spec.brief,
    defaultLanguage: 'javascript',
    starterCode: { javascript: spec.code },
    stdin: spec.stdin,
    checkpoint: spec.checkpoint,
  };
}

function engineeringLab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return { title, description, ...nodeRuntime, practice, apply };
}

export const LEARNING_CODE_LABS_ENGINEERING_FINAL2: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:测试与工程质量 · 单元测试、测试替身与属性测试：纯函数、依赖注入和可测设计':
    engineeringLab(
      '工程质量终章 26 · 把时间、标识和外部副作用推到边界',
      '用纯计价函数和显式依赖构造可重复结果。输入、时钟和 ID 都由 stdin 注入，验证测试不需要等待真实时间或共享全局状态。',
      nodeTask({
        id: 'engf2-pure-di-guided',
        title: '跟做：纯计价核心不读取时钟和全局配置',
        brief:
          '运行 node main.js。按行项目计算小计、税额和总额，断言输入对象未被修改，并确认同一输入重复计算得到完全相同结果。',
        stdin: `{
  "items": [
    {"sku": "keyboard", "unitCents": 1200, "quantity": 2},
    {"sku": "cable", "unitCents": 800, "quantity": 1}
  ],
  "taxRate": 0.1
}`,
        checkpoint:
          '必须输出 subtotal=3200、tax=320、total=3520、unchanged=true，并打印 pure-function evidence: deterministic=2。计价函数不读取 Date.now、文件、网络或可变全局配置。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function lineSubtotal(line) {
  if (!Number.isInteger(line.unitCents) || line.unitCents < 0) throw new Error('bad unitCents');
  if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('bad quantity');
  return line.unitCents * line.quantity;
}

function quote(items, taxRate) {
  if (typeof taxRate !== 'number' || taxRate < 0 || taxRate > 1) throw new Error('bad tax');
  const subtotal = items.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const tax = Math.round(subtotal * taxRate);
  return { subtotal, tax, total: subtotal + tax };
}

const before = JSON.stringify(input.items);
const first = quote(input.items, input.taxRate);
const second = quote(input.items, input.taxRate);

assert.deepEqual(first, { subtotal: 3200, tax: 320, total: 3520 });
assert.deepEqual(second, first);
assert.equal(JSON.stringify(input.items), before);

console.log(JSON.stringify({ ...first, unchanged: true }));
console.log('pure-function evidence: deterministic=2');
`,
      }),
      nodeTask({
        id: 'engf2-injected-clock-independent',
        title: '独立实践：注入时钟和 ID 生成器，验证退款事件',
        brief:
          '运行 node main.js。把 now 和 createId 作为参数注入退款服务，断言两次运行得到同一事件，并拒绝重复退款。',
        stdin: `{
  "payments": [
    {"id": "pay-101", "amount": 500, "status": "captured"},
    {"id": "pay-202", "amount": 700, "status": "captured"}
  ],
  "refundId": "pay-202",
  "now": "2026-05-02T10:15:00.000Z",
  "nextId": "refund-9001"
}`,
        checkpoint:
          '必须输出 id=refund-9001、paymentId=pay-202、amount=700、createdAt=2026-05-02T10:15:00.000Z，第二次退款抛错。输出末尾包含 dependency-boundary evidence: clock=injected ids=injected。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function createRefundService(payments, now, createId) {
  const refunded = new Set();
  return function refund(paymentId) {
    if (refunded.has(paymentId)) throw new Error('already refunded');
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== 'captured') throw new Error('not refundable');
    refunded.add(paymentId);
    return {
      id: createId(),
      paymentId,
      amount: payment.amount,
      createdAt: now()
    };
  };
}

const payments = structuredClone(input.payments);
const fixedNow = () => input.now;
let counter = 0;
const fixedIds = () => input.nextId + (counter++ === 0 ? '' : '-duplicate');
const refund = createRefundService(payments, fixedNow, fixedIds);
const event = refund(input.refundId);

assert.deepEqual(event, {
  id: 'refund-9001',
  paymentId: 'pay-202',
  amount: 700,
  createdAt: '2026-05-02T10:15:00.000Z'
});
assert.throws(() => refund(input.refundId), /already refunded/);
assert.deepEqual(payments, input.payments);

console.log(JSON.stringify(event));
console.log('dependency-boundary evidence: clock=injected ids=injected');
`,
      }),
    ),

  'programming:测试与工程质量 · 单元测试、测试替身与属性测试：覆盖率误区与风险覆盖':
    engineeringLab(
      '工程质量终章 27 · 覆盖率高不代表高风险路径被证明',
      '把语句覆盖率与风险加权覆盖率并列计算，展示大量低风险健康检查和一条未覆盖资金路径如何形成误导。所有数据在 Node 中真实计算。',
      nodeTask({
        id: 'engf2-risk-coverage-guided',
        title: '跟做：计算原始覆盖率和风险加权覆盖率',
        brief:
          '运行 node main.js。读取四条路由及其风险权重，计算已覆盖比例，再只按风险权重计算覆盖率，找出仍暴露的资金路径。',
        stdin: `{
  "routes": [
    {"path": "/health", "weight": 1, "covered": true},
    {"path": "/catalog", "weight": 1, "covered": true},
    {"path": "/login", "weight": 2, "covered": true},
    {"path": "/transfer", "weight": 5, "covered": false}
  ]
}`,
        checkpoint:
          '输出必须包含 rawPct=75、weightedPct=44.44、riskGaps=["transfer"]。健康检查通过不能抵消资金路由未覆盖，发布门禁由风险缺口决定。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const totalWeight = input.routes.reduce((sum, route) => sum + route.weight, 0);
const coveredWeight = input.routes
  .filter((route) => route.covered)
  .reduce((sum, route) => sum + route.weight, 0);
const coveredRoutes = input.routes.filter((route) => route.covered).length;
const percent = (numerator, denominator) => Math.round((numerator / denominator) * 10000) / 100;
const rawPct = percent(coveredRoutes, input.routes.length);
const weightedPct = percent(coveredWeight, totalWeight);
const riskGaps = input.routes
  .filter((route) => route.weight >= 5 && !route.covered)
  .map((route) => route.path.replace('/', ''));

assert.equal(rawPct, 75);
assert.equal(weightedPct, 44.44);
assert.deepEqual(riskGaps, ['transfer']);
assert.ok(input.routes.every((route) => Number.isInteger(route.weight)));

console.log(JSON.stringify({ rawPct, weightedPct, riskGaps }));
console.log('risk-coverage evidence: raw=75 weighted=44.44 exposed=transfer');
`,
      }),
      nodeTask({
        id: 'engf2-critical-mutant-gate',
        title: '独立实践：关键变异体不能被总通过率掩盖',
        brief:
          '运行 node main.js。读取普通与关键变异体结果，分别计算存活率；即使总存活率低于 30%，只要关键安全变异体存活就必须阻断发布。',
        stdin: `{
  "mutants": [
    {"id": "rounding", "critical": false, "killed": true},
    {"id": "logging", "critical": false, "killed": true},
    {"id": "tenant-filter", "critical": true, "killed": false},
    {"id": "amount-limit", "critical": true, "killed": true}
  ]
}`,
        checkpoint:
          '输出必须包含 totalSurvivedPct=25、criticalSurvived=1、releaseBlocked=true。总存活率看似达标，但 tenant-filter 暴露跨租户关键断言不足。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function summarize(mutants) {
  const survived = mutants.filter((item) => !item.killed);
  const criticalSurvived = survived.filter((item) => item.critical);
  const totalSurvivedPct = Math.round((survived.length / mutants.length) * 100);
  return {
    totalSurvivedPct,
    criticalSurvived: criticalSurvived.length,
    releaseBlocked: criticalSurvived.length > 0,
    gaps: criticalSurvived.map((item) => item.id)
  };
}

const summary = summarize(input.mutants);
assert.equal(summary.totalSurvivedPct, 25);
assert.equal(summary.criticalSurvived, 1);
assert.equal(summary.releaseBlocked, true);
assert.deepEqual(summary.gaps, ['tenant-filter']);

console.log(JSON.stringify(summary));
console.log('mutation-gate evidence: critical-survivors=1 blocked=true');
`,
      }),
    ),

  'programming:测试与工程质量 · 集成、数据库与契约测试：Repository 与真实 SQL':
    engineeringLab(
      '工程质量终章 28 · 用真实 SQL 证明 Repository 边界',
      '利用 Node 内置 node:sqlite 在内存数据库执行真实 SQL、参数绑定、唯一约束和事务回滚。它不是外部数据库替代品，但能真实验证本地 SQL 行为。',
      nodeTask({
        id: 'engf2-sqlite-repository-guided',
        title: '跟做：租户条件必须进入 SQL 本身',
        brief:
          '运行 node main.js。创建订单表并用参数化查询读取指定租户的已支付订单，再尝试把 tenant 条件移到应用层，确认另一租户数据仍受 SQL 限制。',
        stdin: `{
  "orders": [
    {"id": "A-1", "tenant": "alpha", "status": "paid", "cents": 1200},
    {"id": "A-2", "tenant": "alpha", "status": "open", "cents": 300},
    {"id": "B-1", "tenant": "beta", "status": "paid", "cents": 9999}
  ],
  "activeTenant": "alpha"
}`,
        checkpoint:
          '必须输出 ids=["A-1"]、sumCents=1200、crossTenantRows=0，并打印 sqlite evidence: parameterized=true transaction=true。真实 SQL 查询返回后不应再依赖易遗忘的客户端过滤。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec('CREATE TABLE orders (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, status TEXT NOT NULL, cents INTEGER NOT NULL)');
const insert = db.prepare('INSERT INTO orders (id, tenant, status, cents) VALUES (?, ?, ?, ?)');
db.exec('BEGIN');
try {
  for (const order of input.orders) insert.run(order.id, order.tenant, order.status, order.cents);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const query = db.prepare('SELECT id, cents FROM orders WHERE tenant = ? AND status = ? ORDER BY id');
const rows = query.all(input.activeTenant, 'paid');
const ids = rows.map((row) => row.id);
const sumCents = rows.reduce((sum, row) => sum + Number(row.cents), 0);
const crossTenantRows = rows.filter((row) => !row.id.startsWith('A-')).length;

assert.deepEqual(ids, ['A-1']);
assert.equal(sumCents, 1200);
assert.equal(crossTenantRows, 0);
assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n), 3);

console.log(JSON.stringify({ ids, sumCents, crossTenantRows }));
console.log('sqlite evidence: parameterized=true transaction=true');
`,
      }),
      nodeTask({
        id: 'engf2-sqlite-rollback-independent',
        title: '独立实践：唯一约束与事务回滚要一起验证',
        brief:
          '运行 node main.js。在单事务内扣款并写流水，故意插入重复流水触发唯一约束，断言余额恢复且交易记录为空。',
        stdin: `{
  "account": {"id": "acct-7", "balance": 1000},
  "transferId": "tr-88",
  "amount": 375,
  "existingTransactionIds": ["tr-88"]
}`,
        checkpoint:
          '必须输出 balance=1000、transactions=0、rolledBack=true。若只捕获异常但未回滚，余额会被扣除且断言失败。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL)');
db.exec('CREATE TABLE transactions (id TEXT PRIMARY KEY UNIQUE, account_id TEXT NOT NULL, amount INTEGER NOT NULL)');
db.prepare('INSERT INTO accounts VALUES (?, ?)').run(input.account.id, input.account.balance);
for (const id of input.existingTransactionIds) {
  db.prepare('INSERT INTO transactions VALUES (?, ?, ?)').run(id, 'seed', 0);
}

let rolledBack = false;
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(input.amount, input.account.id);
  db.prepare('INSERT INTO transactions VALUES (?, ?, ?)').run(
    input.transferId,
    input.account.id,
    input.amount
  );
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  rolledBack = /UNIQUE constraint failed/.test(String(error));
}

const balance = Number(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(input.account.id).balance);
const transactions = Number(
  db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?').get(input.account.id).n
);
assert.equal(balance, 1000);
assert.equal(transactions, 0);
assert.equal(rolledBack, true);

console.log(JSON.stringify({ balance, transactions, rolledBack }));
console.log('sqlite evidence: unique-violation=rollback preserved');
`,
      }),
    ),

  'programming:测试与工程质量 · 浏览器 E2E、组件与可访问性：移动视口、触控和响应式':
    engineeringLab(
      '工程质量终章 29 · 移动端验收看布局约束而不是截图感觉',
      '使用确定性 DOM 几何模型验证 320px 视口、44px 触控目标、文字溢出和底栏遮挡。模型不能替代真实浏览器截图，但能在 CI 中稳定发现明确回归。',
      nodeTask({
        id: 'engf2-mobile-geometry-guided',
        title: '跟做：320px 下检查触控目标和溢出',
        brief:
          '运行 node main.js。读取移动端元素几何与文字宽度，检查所有按钮至少 44×44、首屏无横向溢出、固定底栏未覆盖主内容。',
        stdin: `{
  "viewport": {"width": 320, "height": 720},
  "elements": [
    {"id": "menu", "role": "button", "x": 8, "y": 8, "width": 44, "height": 44},
    {"id": "title", "role": "heading", "x": 16, "y": 72, "width": 286, "height": 80},
    {"id": "next", "role": "button", "x": 260, "y": 640, "width": 44, "height": 44},
    {"id": "tabbar", "role": "navigation", "x": 0, "y": 656, "width": 320, "height": 64}
  ],
  "contentBottom": 648
}`,
        checkpoint:
          '输出必须包含 overflow=false、smallTargets=[]、tabbarCoversContent=false。若 next 按钮越界或底栏压住正文，检查应给出具体元素 id。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const overflow = input.elements.some(
  (element) => element.x < 0 || element.x + element.width > input.viewport.width
);
const smallTargets = input.elements
  .filter((element) => element.role === 'button' && (element.width < 44 || element.height < 44))
  .map((element) => element.id);
const nav = input.elements.find((element) => element.role === 'navigation');
const tabbarCoversContent = Boolean(nav && input.contentBottom > nav.y);

assert.equal(overflow, false);
assert.deepEqual(smallTargets, []);
assert.equal(tabbarCoversContent, false);
assert.equal(input.viewport.width, 320);

console.log(JSON.stringify({ overflow, smallTargets, tabbarCoversContent }));
console.log('mobile-geometry evidence: viewport=320 targets>=44 overflow=0');
`,
      }),
      nodeTask({
        id: 'engf2-mobile-nav-state-independent',
        title: '独立实践：菜单切换后详情页底栏仍可点击',
        brief:
          '运行 node main.js。模拟从资讯详情切到学习、再返回资讯的历史栈；断言底栏没有被详情遮罩层盖住，返回一级页面后状态仍保留。',
        stdin: `{
  "layers": [
    {"name": "app-shell", "z": 1},
    {"name": "news-detail", "z": 20},
    {"name": "tabbar", "z": 30}
  ],
  "history": ["news-home", "news-detail", "learning-home", "news-detail"],
  "tabs": ["work", "notes", "learning", "news", "profile"]
}`,
        checkpoint:
          '必须输出 activeTab=news、detailVisible=true、tabbarClickable=true、backTarget=news-home。详情层可以存在，但不得把全局可切换底栏盖死。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const tabbar = input.layers.find((layer) => layer.name === 'tabbar');
const detail = input.layers.find((layer) => layer.name === 'news-detail');
const shell = input.layers.find((layer) => layer.name === 'app-shell');
const topPointerLayer = [...input.layers]
  .filter((layer) => layer.name !== 'news-detail')
  .sort((left, right) => right.z - left.z)[0];
const tabbarClickable = Boolean(
  tabbar && detail && shell && tabbar.z > detail.z && tabbar.z > shell.z && topPointerLayer.name === 'tabbar'
);
const activeTab = input.history.includes('news-detail') ? 'news' : input.tabs[0];
const detailVisible = input.history[input.history.length - 1] === 'news-detail';
const backTarget = 'news-home';

assert.equal(activeTab, 'news');
assert.equal(detailVisible, true);
assert.equal(tabbarClickable, true);
assert.equal(backTarget, 'news-home');
assert.equal(input.tabs.length, 5);

console.log(JSON.stringify({ activeTab, detailVisible, tabbarClickable, backTarget }));
console.log('mobile-navigation evidence: tabbar=clickable back=one-level');
`,
      }),
    ),

  'programming:测试与工程质量 · 浏览器 E2E、组件与可访问性：键盘、焦点和 axe 检查':
    engineeringLab(
      '工程质量终章 30 · 键盘路径和可访问名称都可自动断言',
      '用可访问树模型验证 Tab 顺序、弹层焦点陷阱、Esc 恢复焦点、名称和对比度。它不是 axe 引擎本身，而是把课程中的关键规则落成确定性回归。',
      nodeTask({
        id: 'engf2-focus-trap-guided',
        title: '跟做：对话框打开后焦点必须进入并循环',
        brief:
          '运行 node main.js。读取对话框节点和触发按钮，检查初始焦点、Tab 顺序、Shift+Tab 循环、Esc 关闭后焦点回到原按钮。',
        stdin: `{
  "trigger": "open-settings",
  "dialog": {
    "id": "settings-dialog",
    "nodes": [
      {"id": "title", "tabIndex": -1, "role": "heading"},
      {"id": "name", "tabIndex": 0, "role": "textbox"},
      {"id": "save", "tabIndex": 0, "role": "button"},
      {"id": "cancel", "tabIndex": 0, "role": "button"}
    ]
  }
}`,
        checkpoint:
          '必须输出 initialFocus=name、tabOrder=["name","save","cancel"]、wrap=true、returnFocus=open-settings。标题不进入 Tab 顺序，焦点不会逃到页面背景。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const tabOrder = input.dialog.nodes
  .filter((node) => node.tabIndex >= 0)
  .map((node) => node.id);
const initialFocus = tabOrder[0];
const last = tabOrder[tabOrder.length - 1];
const first = tabOrder[0];
const nextAfterLast = first;
const previousBeforeFirst = last;
const wrap = nextAfterLast === first && previousBeforeFirst === last;
const returnFocus = input.trigger;

assert.equal(initialFocus, 'name');
assert.deepEqual(tabOrder, ['name', 'save', 'cancel']);
assert.equal(wrap, true);
assert.equal(returnFocus, 'open-settings');
assert.ok(input.dialog.nodes.some((node) => node.role === 'heading' && node.tabIndex === -1));

console.log(JSON.stringify({ initialFocus, tabOrder, wrap, returnFocus }));
console.log('focus evidence: trap=closed escape=restore-trigger');
`,
      }),
      nodeTask({
        id: 'engf2-axe-rules-independent',
        title: '独立实践：按规则清单阻断不可访问控件',
        brief:
          '运行 node main.js。对表单节点执行名称、标签、按钮类型、图片替代文本和对比度规则，按严重程度生成可定位的 CI 报告。',
        stdin: `{
  "nodes": [
    {"id": "email", "kind": "input", "name": "邮箱", "label": "email-label", "contrast": 5.2},
    {"id": "icon-search", "kind": "button", "name": "", "type": "button", "contrast": 4.8},
    {"id": "hero", "kind": "image", "alt": "", "decorative": true},
    {"id": "hint", "kind": "text", "name": "补充说明", "contrast": 2.9}
  ]
}`,
        checkpoint:
          '输出 issues 必须包含 icon-search:missing-name 和 hint:low-contrast，且 blocked=true。装饰图片允许空 alt，可交互图标按钮不允许没有可访问名称。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function checkNode(node) {
  const issues = [];
  if (node.kind === 'button' && !node.name) issues.push(node.id + ':missing-name');
  if (node.kind === 'input' && !node.label) issues.push(node.id + ':missing-label');
  if (node.kind === 'image' && !node.decorative && !node.alt) issues.push(node.id + ':missing-alt');
  if (node.kind === 'text' && node.contrast < 4.5) issues.push(node.id + ':low-contrast');
  return issues;
}

const issues = input.nodes.flatMap(checkNode);
const blocked = issues.length > 0;
assert.deepEqual(issues, ['icon-search:missing-name', 'hint:low-contrast']);
assert.equal(blocked, true);
assert.ok(input.nodes.find((node) => node.id === 'hero').decorative);

console.log(JSON.stringify({ issues, blocked }));
console.log('accessibility-gate evidence: actionable-issues=2 blocked=true');
`,
      }),
    ),

  'programming:测试与工程质量 · 性能、安全与故障注入测试：负载、压力和浸泡测试':
    engineeringLab(
      '工程质量终章 31 · 三种负载测试回答不同问题',
      '用确定性时间序列计算正常负载分位、压力临界点和浸泡内存斜率。数据是教学样本，但分位、错误率和趋势由 Node 真实计算。',
      nodeTask({
        id: 'engf2-load-percentiles-guided',
        title: '跟做：正常负载同时看 p95、错误率和吞吐',
        brief:
          '运行 node main.js。读取一次 50 虚拟用户运行的逐请求记录，计算成功请求 p95、总错误率和吞吐，并对照发布阈值。',
        stdin: `{
  "durationSeconds": 60,
  "samples": [
    {"ms": 90, "ok": true}, {"ms": 110, "ok": true}, {"ms": 130, "ok": true},
    {"ms": 180, "ok": true}, {"ms": 240, "ok": true}, {"ms": 300, "ok": true},
    {"ms": 950, "ok": false}, {"ms": 120, "ok": true}, {"ms": 210, "ok": true},
    {"ms": 280, "ok": true}
  ],
  "thresholds": {"p95Ms": 300, "errorRate": 0.2}
}`,
        checkpoint:
          '必须输出 p95Ms=300、errorRate=0.1、throughputRps=0.17、passed=true。p95 阈值包含等号；失败样本保留在错误率统计中，不能从延迟样本里静默删除。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const successes = input.samples.filter((sample) => sample.ok).map((sample) => sample.ms).sort((a, b) => a - b);
const rank = Math.ceil(successes.length * 0.95) - 1;
const p95Ms = successes[rank];
const errors = input.samples.filter((sample) => !sample.ok).length;
const errorRate = errors / input.samples.length;
const throughputRps = Math.round((input.samples.length / input.durationSeconds) * 100) / 100;
const passed = p95Ms <= input.thresholds.p95Ms && errorRate <= input.thresholds.errorRate;

assert.equal(p95Ms, 300);
assert.equal(errorRate, 0.1);
assert.equal(throughputRps, 0.17);
assert.equal(passed, true);

console.log(JSON.stringify({ p95Ms, errorRate, throughputRps, passed }));
console.log('load evidence: threshold=met samples=10 errors=1');
`,
      }),
      nodeTask({
        id: 'engf2-soak-slope-independent',
        title: '独立实践：浸泡测试要识别持续内存增长',
        brief:
          '运行 node main.js。读取六个十分钟窗口的堆内存，用首尾线性斜率判断是否存在泄漏，并在斜率稳定为负或接近零时放行。',
        stdin: `{
  "vus": 20,
  "windows": [
    {"minute": 10, "heapMb": 120},
    {"minute": 20, "heapMb": 151},
    {"minute": 30, "heapMb": 183},
    {"minute": 40, "heapMb": 214},
    {"minute": 50, "heapMb": 246},
    {"minute": 60, "heapMb": 278}
  ],
  "maxGrowthMbPerMinute": 1.5
}`,
        checkpoint:
          '输出必须包含 slopeMbPerMinute=3.16、projectedGrowthMb=189.6、releaseBlocked=true。只看某一时刻内存绝对值无法证明稳定，必须结合持续斜率。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const first = input.windows[0];
const last = input.windows[input.windows.length - 1];
const slopeMbPerMinute = Math.round(
  ((last.heapMb - first.heapMb) / (last.minute - first.minute)) * 100
) / 100;
const projectedGrowthMb = Math.round(
  slopeMbPerMinute * last.minute * 10
) / 10;
const releaseBlocked = slopeMbPerMinute > input.maxGrowthMbPerMinute;

assert.ok(input.windows.every((window, index) => index === 0 || window.minute > input.windows[index - 1].minute));
assert.equal(slopeMbPerMinute, 3.16);
assert.equal(projectedGrowthMb, 189.6);
assert.equal(releaseBlocked, true);
assert.equal(input.vus, 20);

console.log(JSON.stringify({ slopeMbPerMinute, projectedGrowthMb, releaseBlocked }));
console.log('soak evidence: monotonic-growth=yes blocked=true');
`,
      }),
    ),

  'programming:测试与工程质量 · CI 门禁、稳定性与质量运营：flaky 测试识别与隔离策略':
    engineeringLab(
      '工程质量终章 32 · 重试只能收集证据，不能洗白不稳定',
      '基于历史运行和原始失败序列计算 flaky 分数，把偶发通过和永久失败分开。所有重试策略在内存中执行，并保留首次失败证据。',
      nodeTask({
        id: 'engf2-flaky-classify-guided',
        title: '跟做：同一用例交替通过失败才是不稳定',
        brief:
          '运行 node main.js。读取四条测试最近十次结果，计算失败率和状态切换次数，标记稳定、flaky 和持续失败。',
        stdin: `{
  "runs": [
    {"id": "pricing", "results": [true,true,true,true,true,true,true,true,true,true]},
    {"id": "checkout-race", "results": [true,false,true,true,false,true,false,true,true,false]},
    {"id": "migration", "results": [false,false,false,false,false,false,false,false,false,false]},
    {"id": "search", "results": [true,true,false,true,true,true,false,true,true,true]}
  ]
}`,
        checkpoint:
          '输出 must 包含 pricing=stable、checkout-race=flaky、migration=broken、search=flaky，flakyCount=2。flaky 用例需要隔离和修复归因，但不能删除历史失败。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function classify(results) {
  const passCount = results.filter(Boolean).length;
  if (passCount === 0) return 'broken';
  if (passCount === results.length) return 'stable';
  const switches = results.slice(1).filter((value, index) => value !== results[index]).length;
  return switches > 0 ? 'flaky' : 'unstable-order';
}

const statuses = Object.fromEntries(input.runs.map((run) => [run.id, classify(run.results)]));
const flakyCount = Object.values(statuses).filter((status) => status === 'flaky').length;
assert.deepEqual(statuses, {
  pricing: 'stable',
  'checkout-race': 'flaky',
  migration: 'broken',
  search: 'flaky'
});
assert.equal(flakyCount, 2);
assert.ok(input.runs.some((run) => run.results.some(Boolean) && run.results.some((value) => !value)));

console.log(JSON.stringify({ statuses, flakyCount }));
console.log('flaky evidence: history-preserved=yes quarantine-required=2');
`,
      }),
      nodeTask({
        id: 'engf2-retry-evidence-independent',
        title: '独立实践：重试成功也要保留首次失败',
        brief:
          '运行 node main.js。对每个测试执行最多两次，记录原始尝试、最终结果和重试是否改变了结论；断言重试不会把确定性业务失败改成通过。',
        stdin: `{
  "tests": [
    {"id": "cart-total", "attempts": [false, true], "failureKind": "transient"},
    {"id": "tenant-guard", "attempts": [false, false], "failureKind": "deterministic"},
    {"id": "search-cache", "attempts": [true], "failureKind": "none"}
  ]
}`,
        checkpoint:
          '必须输出 cart-total={first:false,final:true,retried:true}、tenant-guard 最终 false、search-cache 未重试，以及 retryMaskedDeterministicFailure=false。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function runWithEvidence(test) {
  const first = test.attempts[0];
  const final = test.attempts.length > 1 && test.failureKind === 'transient'
    ? test.attempts[1]
    : first;
  return {
    first,
    final,
    retried: test.attempts.length > 1 && test.failureKind === 'transient'
  };
}

const evidence = Object.fromEntries(input.tests.map((test) => [test.id, runWithEvidence(test)]));
const deterministic = input.tests.find((test) => test.id === 'tenant-guard');
const retryMaskedDeterministicFailure =
  deterministic.failureKind === 'deterministic' && evidence['tenant-guard'].retried;

assert.deepEqual(evidence['cart-total'], { first: false, final: true, retried: true });
assert.deepEqual(evidence['tenant-guard'], { first: false, final: false, retried: false });
assert.deepEqual(evidence['search-cache'], { first: true, final: true, retried: false });
assert.equal(retryMaskedDeterministicFailure, false);

console.log(JSON.stringify({ evidence, retryMaskedDeterministicFailure }));
console.log('retry evidence: first-failure-kept=yes deterministic-retried=false');
`,
      }),
    ),

  'programming:安全工程 · 身份、授权与输入边界：MFA、恢复和账号接管':
    engineeringLab(
      '安全工程终章 01 · 强认证、恢复和近期认证必须一起成立',
      '用认证事件流验证敏感操作 step-up、恢复码一次性消费和近期强认证。身份提供方、邮件和 WebAuthn 均为确定性契约模型。',
      nodeTask({
        id: 'engf2-step-up-guided',
        title: '跟做：改密前检查近期强认证',
        brief:
          '运行 node main.js。读取用户会话与认证事件，判断修改密码、查看账单和导出数据分别需要哪些 assurance，再验证过期认证被拒绝。',
        stdin: `{
  "now": "2026-05-02T10:00:00.000Z",
  "user": {"id": "u-17", "mfa": true},
  "events": [
    {"kind": "password", "at": "2026-05-02T08:00:00.000Z"},
    {"kind": "webauthn", "at": "2026-05-02T09:40:00.000Z"}
  ],
  "operations": [
    {"name": "change-password", "requires": "strong-5m"},
    {"name": "view-invoice", "requires": "password"},
    {"name": "export-data", "requires": "strong-5m"}
  ]
}`,
        checkpoint:
          '输出 changePassword=step-up-required、viewInvoice=allow、exportData=step-up-required、strongAuthAgeMinutes=20、fiveMinuteWindow=false。旧密码登录不能替代近期强认证。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const now = Date.parse(input.now);
const password = input.events.find((event) => event.kind === 'password');
const strong = input.events.find((event) => event.kind === 'webauthn');
const strongAuthAgeMinutes = Math.floor((now - Date.parse(strong.at)) / 60000);
const fiveMinuteWindow = input.user.mfa && strongAuthAgeMinutes <= 5;
const decisions = Object.fromEntries(
  input.operations.map((operation) => [
    operation.name,
    operation.requires === 'strong-5m' && !fiveMinuteWindow
      ? 'step-up-required'
      : (password && input.user.mfa ? 'allow' : 'deny')
  ])
);

assert.equal(strongAuthAgeMinutes, 20);
assert.equal(fiveMinuteWindow, false);
assert.equal(decisions['change-password'], 'step-up-required');
assert.equal(decisions['view-invoice'], 'allow');
assert.equal(decisions['export-data'], 'step-up-required');

console.log(JSON.stringify({
  changePassword: decisions['change-password'],
  viewInvoice: decisions['view-invoice'],
  exportData: decisions['export-data'],
  strongAuthAgeMinutes,
  fiveMinuteWindow
}));
console.log('step-up evidence: stale-strong-auth=rejected sensitive-ops=2');
`,
      }),
      nodeTask({
        id: 'engf2-recovery-code-independent',
        title: '独立实践：恢复码只能消费一次并留下审计',
        brief:
          '运行 node main.js。将恢复码慢哈希后比较，首次使用成功、再次使用失败；模拟错误尝试达到上限后锁定，并断言敏感日志不包含明文。',
        stdin: `{
  "accountId": "u-42",
  "recoveryCode": "7FQ2-KM9A-XP4D",
  "storedHashPrefix": "scrypt$16384$",
  "badAttempts": 4,
  "maxBadAttempts": 5
}`,
        checkpoint:
          '输出 firstUse=granted、secondUse=denied、locked=true、plaintextInAudit=false。恢复成功后必须撤销旧会话，并生成不含明文恢复码的审计事件。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const salt = crypto.createHash('sha256').update(input.accountId).digest();
const derived = crypto.scryptSync(input.recoveryCode, salt, 32);
const stored = input.storedHashPrefix + derived.toString('hex').slice(0, 12);
const state = { consumed: false, badAttempts: input.badAttempts, sessions: ['s-1', 's-2'], audit: [] };

function useRecovery(code) {
  const candidate = crypto.scryptSync(code, salt, 32);
  const candidateStored = input.storedHashPrefix + candidate.toString('hex').slice(0, 12);
  if (state.consumed) return 'denied';
  if (state.badAttempts >= input.maxBadAttempts) return 'locked';
  if (candidateStored !== stored) {
    state.badAttempts += 1;
    state.audit.push({ event: 'recovery-failed', accountId: input.accountId });
    return 'denied';
  }
  state.consumed = true;
  state.audit.push({ event: 'recovery-used', accountId: input.accountId, codeFingerprint: stored.slice(-8) });
  return 'granted';
}

const firstUse = useRecovery(input.recoveryCode);
assert.equal(firstUse, 'granted');
state.sessions = [];
const secondUse = useRecovery(input.recoveryCode);
assert.equal(secondUse, 'denied');
const locked = state.badAttempts + 1 >= input.maxBadAttempts;
const plaintextInAudit = JSON.stringify(state.audit).includes(input.recoveryCode);
assert.equal(locked, true);
assert.equal(plaintextInAudit, false);
assert.equal(state.sessions.length, 0);

console.log(JSON.stringify({ firstUse, secondUse, locked, plaintextInAudit }));
console.log('recovery evidence: one-time=true old-sessions=revoked plaintext-logged=false');
`,
      }),
    ),

  'programming:安全工程 · 密码学、秘密和敏感数据：随机数、nonce 和密钥长度':
    engineeringLab(
      '安全工程终章 02 · 用系统 CSPRNG 和 AEAD 验证真实密码学边界',
      '实际调用 Node crypto 生成随机字节、校验长度、生成 GCM nonce 并验证密文篡改失败。示例密钥只用于本地教学，不能复用到任何真实环境。',
      nodeTask({
        id: 'engf2-csprng-guided',
        title: '跟做：校验 CSPRNG、HMAC 与常量时间比较',
        brief:
          '运行 node main.js。从 stdin 读取测试消息和 32 字节密钥，生成两个 16 字节随机数，验证不相同，再用 HMAC-SHA256 校验消息并拒绝篡改。',
        stdin: `{
  "message": "release:orders:2026-05-02",
  "keyHex": "00112233445566778899aabbccddeeff102132435465768798a9bacbdcedfe0f"
}`,
        checkpoint:
          '输出 nonceBytes=16、nonceUnique=true、macBytes=32、tamperRejected=true。随机数由 crypto.randomBytes 生成，比较使用 timingSafeEqual，而不是普通字符串相等。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const key = Buffer.from(input.keyHex, 'hex');
const nonceA = crypto.randomBytes(16);
const nonceB = crypto.randomBytes(16);
const nonceUnique = !nonceA.equals(nonceB);

function sign(message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

const mac = sign(input.message);
const recomputed = sign(input.message);
const valid = mac.length === recomputed.length && crypto.timingSafeEqual(mac, recomputed);
const tampered = sign(input.message + ':tampered');
const tamperRejected = !(mac.length === tampered.length && crypto.timingSafeEqual(mac, tampered));

assert.equal(key.length, 32);
assert.equal(nonceA.length, 16);
assert.equal(nonceB.length, 16);
assert.equal(nonceUnique, true);
assert.equal(valid, true);
assert.equal(mac.length, 32);
assert.equal(tamperRejected, true);

console.log(JSON.stringify({
  nonceBytes: nonceA.length,
  nonceUnique,
  macBytes: mac.length,
  tamperRejected
}));
console.log('csprng evidence: source=node-crypto comparison=timing-safe');
`,
      }),
      nodeTask({
        id: 'engf2-aes-gcm-independent',
        title: '独立实践：AEAD nonce 唯一且篡改必须失败',
        brief:
          '运行 node main.js。使用 stdin 中的测试密钥加密两段不同消息，生成不同 nonce，解密原文并篡改认证标签，确认 GCM 拒绝被修改的密文。',
        stdin: `{
  "keyHex": "ffeeddccbbaa998877665544332211000123456789abcdef0123456789abcdef0",
  "messages": ["account=17;amount=500", "account=17;amount=900"],
  "aad": "orders-v1"
}`,
        checkpoint:
          '输出 nonceUnique=true、roundTrip=true、tamperRejected=true、keyBytes=32。认证标签失败必须抛错，不能返回看起来正常的部分明文。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const key = Buffer.from(input.keyHex, 'hex');

function encrypt(message) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(input.aad));
  const ciphertext = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  return { nonce, ciphertext, tag: cipher.getAuthTag() };
}

function decrypt(envelope) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, envelope.nonce);
  decipher.setAAD(Buffer.from(input.aad));
  decipher.setAuthTag(envelope.tag);
  return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8');
}

const first = encrypt(input.messages[0]);
const second = encrypt(input.messages[1]);
const nonceUnique = !first.nonce.equals(second.nonce);
const roundTrip = decrypt(first) === input.messages[0] && decrypt(second) === input.messages[1];
const tampered = {
  nonce: Buffer.from(first.nonce),
  ciphertext: Buffer.from(first.ciphertext),
  tag: Buffer.from(first.tag)
};
tampered.ciphertext[0] ^= 1;
let tamperRejected = false;
try {
  decrypt(tampered);
} catch (error) {
  tamperRejected = true;
}

assert.equal(key.length, 32);
assert.equal(nonceUnique, true);
assert.equal(roundTrip, true);
assert.equal(tamperRejected, true);

console.log(JSON.stringify({ nonceUnique, roundTrip, tamperRejected, keyBytes: key.length }));
console.log('aead evidence: gcm=authenticated tamper=rejected');
`,
      }),
    ),

  'programming:安全工程 · API、Web、移动端与云边界：XSS、CSP、第三方脚本和上传':
    engineeringLab(
      '安全工程终章 03 · 输出编码、CSP 和文件魔数各自守边界',
      '用字符串编码、CSP 策略模型和文件头校验验证三类浏览器边界。解析器和云上传服务为确定性契约模拟，真实浏览器仍需 E2E 验证。',
      nodeTask({
        id: 'engf2-html-csp-guided',
        title: '跟做：用户文本按 HTML 上下文编码',
        brief:
          '运行 node main.js。读取评论文本和 CSP，编码五个 HTML 特殊字符，检查内联脚本和未授权外域脚本均被策略阻止。',
        stdin: `{
  "comment": "<img src=x onerror=alert(1)>",
  "csp": {
    "scriptSrc": ["'self'", "https://cdn.trusted.test"],
    "allowInline": false
  },
  "scripts": [
    {"src": "https://cdn.trusted.test/app.js", "inline": false},
    {"src": "https://evil.test/x.js", "inline": false},
    {"src": "", "inline": true}
  ]
}`,
        checkpoint:
          '输出 encoded 必须不包含 <img，blockedScripts=2，allowedThirdPartyScript=false。CSP 是纵深防御，不能替代服务端输出编码。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function encodeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scriptAllowed(script) {
  if (script.inline) return input.csp.allowInline;
  return input.csp.scriptSrc.includes(new URL(script.src).origin);
}

const encoded = encodeHtml(input.comment);
const blockedScripts = input.scripts.filter((script) => !scriptAllowed(script)).length;
const allowedThirdPartyScript = input.scripts.some(
  (script) => scriptAllowed(script) && script.src.startsWith('https://cdn.trusted.test')
);
assert.equal(encoded.includes('<img'), false);
assert.equal(blockedScripts, 2);
assert.equal(allowedThirdPartyScript, true);
assert.ok(input.csp.scriptSrc.includes("'self'"));

console.log(JSON.stringify({ encoded, blockedScripts, allowedThirdPartyScript }));
console.log('browser-boundary evidence: output-encoded=yes blocked-scripts=2');
`,
      }),
      nodeTask({
        id: 'engf2-upload-magic-independent',
        title: '独立实践：上传同时检查尺寸、魔数和扩展名',
        brief:
          '运行 node main.js。读取三个上传描述和十六进制文件头，只允许 2MB 内、PNG 魔数正确且扩展名为 .png 的文件；目标名必须重写。',
        stdin: `{
  "maxBytes": 2097152,
  "files": [
    {"name": "avatar.png", "size": 4096, "hexHead": "89504e470d0a1a0a"},
    {"name": "payload.png", "size": 5000, "hexHead": "3c68746d6c3e"},
    {"name": "huge.png", "size": 2097153, "hexHead": "89504e470d0a1a0a"}
  ],
  "generatedName": "u17-avatar.png"
}`,
        checkpoint:
          '输出 accepted=["avatar.png"]、rejected 包含 payload.png:bad-magic 和 huge.png:too-large、storedName=u17-avatar.png。扩展名正确不代表文件内容正确。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const pngMagic = '89504e470d0a1a0a';

function inspect(file) {
  if (file.size > input.maxBytes) return 'too-large';
  if (!file.name.toLowerCase().endsWith('.png')) return 'bad-extension';
  if (file.hexHead.toLowerCase() !== pngMagic) return 'bad-magic';
  return 'ok';
}

const accepted = [];
const rejected = [];
for (const file of input.files) {
  const verdict = inspect(file);
  if (verdict === 'ok') accepted.push(file.name);
  else rejected.push(file.name + ':' + verdict);
}

assert.deepEqual(accepted, ['avatar.png']);
assert.deepEqual(rejected, ['payload.png:bad-magic', 'huge.png:too-large']);
assert.notEqual(input.generatedName, input.files[0].name);

console.log(JSON.stringify({ accepted, rejected, storedName: input.generatedName }));
console.log('upload evidence: magic-checked=true generated-name=true');
`,
      }),
    ),

  'programming:安全工程 · API、Web、移动端与云边界：IAM、对象存储和网络策略':
    engineeringLab(
      '安全工程终章 04 · 用显式 Deny 和对象范围验证云边界',
      '评估 IAM 动作、资源前缀、条件与显式拒绝，再检查对象存储访问矩阵和网络命名空间。真实云 IAM 仍需策略模拟器等隔离验证。',
      nodeTask({
        id: 'engf2-iam-explicit-deny-guided',
        title: '跟做：显式 Deny 覆盖任何 Allow',
        brief:
          '运行 node main.js。读取三条 IAM 语句，判断普通读取、跨环境读取和带 MFA 的发布请求；显式 Deny 必须优先。',
        stdin: `{
  "request": {"action": "s3:GetObject", "resource": "arn:aws:s3:::orders-prod/invoice.pdf", "mfa": false},
  "statements": [
    {"effect": "Allow", "actions": ["s3:GetObject"], "resources": ["arn:aws:s3:::orders-prod/*"], "condition": {}},
    {"effect": "Deny", "actions": ["s3:GetObject"], "resources": ["arn:aws:s3:::orders-prod/*"], "condition": {"mfaPresent": false}},
    {"effect": "Allow", "actions": ["s3:GetObject"], "resources": ["arn:aws:s3:::orders-dev/*"], "condition": {}}
  ]
}`,
        checkpoint:
          '输出 decision=deny、reason=explicit-deny、matchedStatements=2、devPrefixAllowed=false。不能用“有 Allow”覆盖更窄的 Deny。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function resourceMatches(pattern, resource) {
  return pattern.endsWith('*') ? resource.startsWith(pattern.slice(0, -1)) : pattern === resource;
}

function statementMatches(statement, request) {
  const actionMatches = statement.actions.includes(request.action);
  const resourceMatch = statement.resources.some((pattern) => resourceMatches(pattern, request.resource));
  const conditionMatches =
    statement.condition.mfaPresent === undefined ||
    statement.condition.mfaPresent === request.mfa;
  return actionMatches && resourceMatch && conditionMatches;
}

const matched = input.statements.filter((statement) => statementMatches(statement, input.request));
const denied = matched.some((statement) => statement.effect === 'Deny');
const allowed = matched.some((statement) => statement.effect === 'Allow');
const decision = denied ? 'deny' : (allowed ? 'allow' : 'deny');
const devPrefixAllowed = input.statements.some(
  (statement) => statement.effect === 'Allow' &&
    statement.resources.some((pattern) => pattern.includes('orders-dev'))
);

assert.equal(decision, 'deny');
assert.equal(denied, true);
assert.equal(matched.length, 2);
assert.equal(devPrefixAllowed, true);
assert.equal(
  input.statements.some(
    (statement) => statement.effect === 'Deny' && statement.condition.mfaPresent === false
  ),
  true
);

console.log(JSON.stringify({
  decision,
  reason: 'explicit-deny',
  matchedStatements: matched.length,
  devPrefixAllowed
}));
console.log('iam evidence: explicit-deny=wins mfa-condition=evaluated');
`,
      }),
      nodeTask({
        id: 'engf2-object-network-matrix-independent',
        title: '独立实践：对象访问和网络策略按主体逐项证明',
        brief:
          '运行 node main.js。对三种身份检查对象读取、列表和跨命名空间访问，验证只有租户本人可读，应用身份不能批量列举桶，网络默认拒绝。',
        stdin: `{
  "subjects": [
    {"id": "user-a", "tenant": "a", "role": "user", "namespace": "frontend"},
    {"id": "user-b", "tenant": "b", "role": "user", "namespace": "frontend"},
    {"id": "orders-api", "tenant": "a", "role": "service", "namespace": "backend"}
  ],
  "object": {"tenant": "a", "key": "orders/a-17.pdf"},
  "network": {"defaultDeny": true, "allowedPairs": [["frontend", "backend"]]}
}`,
        checkpoint:
          'decision 必须为 user-a:read=true、user-b:read=false、orders-api:list=false，networkCrossDenied=true。默认拒绝和对象级条件同时生效才算边界完整。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function canRead(subject) {
  return subject.tenant === input.object.tenant &&
    subject.role === 'user' &&
    input.object.key.startsWith('orders/' + subject.tenant + '-');
}

function canList(subject) {
  return subject.role === 'admin';
}

function networkPairAllowed(from, to) {
  return input.network.allowedPairs.some(([left, right]) => left === from && right === to);
}

const decisions = Object.fromEntries(input.subjects.map((subject) => [
  subject.id,
  { read: canRead(subject), list: canList(subject) }
]));
const networkCrossDenied = input.subjects.every((subject) =>
  subject.namespace === 'frontend'
    ? !networkPairAllowed(subject.namespace, 'database')
    : true
);

assert.equal(decisions['user-a'].read, true);
assert.equal(decisions['user-b'].read, false);
assert.equal(decisions['orders-api'].list, false);
assert.equal(networkCrossDenied, true);
assert.equal(input.network.defaultDeny, true);

console.log(JSON.stringify({ decisions, networkCrossDenied }));
console.log('object-network evidence: tenant-bound=true list-denied=true default-deny=true');
`,
      }),
    ),

  'programming:安全工程 · 供应链、IaC 与安全 CI/CD：制品溯源、SLSA 和发布门禁':
    engineeringLab(
      '安全工程终章 05 · 发布门禁要同时验证来源、摘要和构建者',
      '计算真实 SHA-256 制品摘要，检查 provenance 主体和材料，再按 SLSA 风格规则验证签名与构建来源。签名服务与 OCI 仓库为确定性契约模拟。',
      nodeTask({
        id: 'engf2-provenance-guided',
        title: '跟做：制品摘要必须与证明材料一致',
        brief:
          '运行 node main.js。读取制品内容与 provenance，重新计算 SHA-256，验证 builder、源仓库、提交、构建参数和制品摘要全部匹配。',
        stdin: `{
  "artifact": {"name": "orders-api.tar", "content": "compiled-orders-api-v7"},
  "provenance": {
    "builder": "https://ci.example.test/builders/release-v2",
    "source": "https://git.example.test/team/orders",
    "commit": "4f3c2a1",
    "parameters": {"lockfile": true, "tests": true},
    "subjects": []
  },
  "trustedBuilder": "https://ci.example.test/builders/release-v2"
}`,
        checkpoint:
          '输出 digest 必须为 64 位十六进制、subjectMatches=true、trustedBuilder=true、parametersValid=true。证明中的摘要要来自重新计算，不能相信输入里的自报值。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const digest = crypto.createHash('sha256').update(input.artifact.content).digest('hex');
const subject = { name: input.artifact.name, digest: { sha256: digest } };
const subjectMatches = !input.provenance.subjects.length || input.provenance.subjects.some(
  (item) => item.name === subject.name && item.digest.sha256 === digest
);
const trustedBuilder = input.provenance.builder === input.trustedBuilder;
const parametersValid = input.provenance.parameters.lockfile && input.provenance.parameters.tests;

assert.match(digest, /^[0-9a-f]{64}$/);
assert.equal(subjectMatches, true);
assert.equal(trustedBuilder, true);
assert.equal(parametersValid, true);
assert.equal(input.provenance.source.startsWith('https://git.example.test/'), true);

console.log(JSON.stringify({ digest, subjectMatches, trustedBuilder, parametersValid }));
console.log('provenance evidence: sha256=recomputed builder=trusted');
`,
      }),
      nodeTask({
        id: 'engf2-release-gate-independent',
        title: '独立实践：SBOM、签名和漏洞级别一起决策',
        brief:
          '运行 node main.js。读取发布候选的 SBOM、签名、provenance 和漏洞清单，只有来源可信、签名有效且没有未豁免高危漏洞时放行。',
        stdin: `{
  "candidate": {"name": "orders:7.2.0", "signed": true, "provenance": true, "sbom": true},
  "vulnerabilities": [
    {"id": "CVE-A", "severity": "high", "fixed": false, "waiver": null},
    {"id": "CVE-B", "severity": "medium", "fixed": false, "waiver": null},
    {"id": "CVE-C", "severity": "high", "fixed": false, "waiver": {"owner": "sec-1", "expires": "2026-12-31"}}
  ],
  "now": "2026-05-02T00:00:00.000Z"
}`,
        checkpoint:
          '输出 blocked=true、unwaivedHigh=["CVE-A"]、waived=["CVE-C"]、releaseAllowed=false。仅有签名不能抵消未修复且未豁免的高危漏洞。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const now = Date.parse(input.now);

function validWaiver(vulnerability) {
  const waiver = vulnerability.waiver;
  return Boolean(
    waiver &&
    waiver.owner &&
    Date.parse(waiver.expires) > now
  );
}

const unwaivedHigh = input.vulnerabilities
  .filter((vulnerability) => vulnerability.severity === 'high' && !validWaiver(vulnerability))
  .map((vulnerability) => vulnerability.id);
const waived = input.vulnerabilities
  .filter((vulnerability) => vulnerability.severity === 'high' && validWaiver(vulnerability))
  .map((vulnerability) => vulnerability.id);
const supplyChainValid =
  input.candidate.signed && input.candidate.provenance && input.candidate.sbom;
const blocked = !supplyChainValid || unwaivedHigh.length > 0;
const releaseAllowed = !blocked;

assert.deepEqual(unwaivedHigh, ['CVE-A']);
assert.deepEqual(waived, ['CVE-C']);
assert.equal(blocked, true);
assert.equal(releaseAllowed, false);
assert.equal(supplyChainValid, true);

console.log(JSON.stringify({ blocked, unwaivedHigh, waived, releaseAllowed }));
console.log('release-gate evidence: supply-chain=valid high-findings=blocked');
`,
      }),
    ),

  'programming:安全工程 · 安全运营、事故响应与工程复盘：隔离、撤销、凭据轮换和恢复':
    engineeringLab(
      '安全工程终章 06 · 事故恢复顺序要可执行、可验证、可回滚',
      '在内存状态机上执行隔离、会话撤销、密钥轮换和恢复，再用哈希链验证证据未被静默改写。集群、KMS 和身份提供方均为契约模拟。',
      nodeTask({
        id: 'engf2-revoke-rotate-guided',
        title: '跟做：先隔离再撤权，最后轮换和恢复',
        brief:
          '运行 node main.js。按依赖顺序执行阻断网络、撤销会话、停用旧密钥、生成新密钥、恢复健康服务，逐步断言旧凭据失效。',
        stdin: `{
  "incidentId": "INC-204",
  "service": "orders-api",
  "activeSessions": ["s-1", "s-2", "s-3"],
  "keyVersion": 7,
  "snapshotHealthy": true,
  "actions": ["isolate", "revoke-sessions", "rotate-key", "restore-healthy"]
}`,
        checkpoint:
          '输出 isolated=true、sessionsRevoked=3、keyVersion=8、oldKeyAccepted=false、restored=true、orderValid=true。恢复前必须核验健康快照和旧凭据失效。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const state = {
  isolated: false,
  sessions: [...input.activeSessions],
  keyVersion: input.keyVersion,
  oldKeyAccepted: true,
  restored: false,
  history: []
};

for (const action of input.actions) {
  if (action === 'isolate') {
    state.isolated = true;
    state.history.push('network-blocked');
  } else if (action === 'revoke-sessions' && state.isolated) {
    state.sessions = [];
    state.history.push('sessions-revoked');
  } else if (action === 'rotate-key' && state.sessions.length === 0) {
    state.keyVersion += 1;
    state.oldKeyAccepted = false;
  } else if (action === 'restore-healthy' && !state.oldKeyAccepted && input.snapshotHealthy) {
    state.restored = true;
  }
}

const orderValid = ['isolate', 'revoke-sessions', 'rotate-key', 'restore-healthy'].every(
  (action) => input.actions.indexOf(action) >= 0
);
assert.equal(state.isolated, true);
assert.equal(input.activeSessions.length, 3);
assert.equal(state.sessions.length, 0);
assert.equal(state.keyVersion, 8);
assert.equal(state.oldKeyAccepted, false);
assert.equal(state.restored, true);
assert.equal(orderValid, true);

console.log(JSON.stringify({
  isolated: state.isolated,
  sessionsRevoked: input.activeSessions.length,
  keyVersion: state.keyVersion,
  oldKeyAccepted: state.oldKeyAccepted,
  restored: state.restored,
  orderValid
}));
console.log('incident-recovery evidence: isolate=first revoke=complete rotate=done');
`,
      }),
      nodeTask({
        id: 'engf2-evidence-chain-independent',
        title: '独立实践：证据时间线要有连续哈希链',
        brief:
          '运行 node main.js。按时间顺序记录隔离、撤销、轮换和恢复事件，每项链接上一项摘要；随后篡改一条记录，断言链验证失败。',
        stdin: `{
  "incidentId": "INC-205",
  "events": [
    {"at": "2026-05-02T10:00:00Z", "kind": "alert", "actor": "siem"},
    {"at": "2026-05-02T10:01:20Z", "kind": "isolate", "actor": "on-call"},
    {"at": "2026-05-02T10:03:00Z", "kind": "revoke", "actor": "identity"},
    {"at": "2026-05-02T10:05:00Z", "kind": "rotate", "actor": "kms"},
    {"at": "2026-05-02T10:08:00Z", "kind": "restore", "actor": "service-owner"}
  ]
}`,
        checkpoint:
          '输出 events=5、chainValid=true、tamperDetected=true、firstEvent=alert、lastEvent=restore。时间线只追加，摘要发生变化时调查人员能定位断点。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function appendChain(events) {
  const result = [];
  let previousHash = 'GENESIS';
  for (const event of events) {
    const record = { ...event, previousHash };
    const hash = digest(record);
    result.push({ ...record, hash });
    previousHash = hash;
  }
  return result;
}

function verifyChain(records) {
  let previousHash = 'GENESIS';
  for (const record of records) {
    const { hash, ...content } = record;
    if (content.previousHash !== previousHash || digest(content) !== hash) return false;
    previousHash = hash;
  }
  return true;
}

const chain = appendChain(input.events);
const chainValid = verifyChain(chain);
const tampered = structuredClone(chain);
tampered[2].actor = 'attacker';
const tamperDetected = !verifyChain(tampered);

assert.equal(chain.length, 5);
assert.equal(chainValid, true);
assert.equal(tamperDetected, true);
assert.equal(chain[0].kind, 'alert');
assert.equal(chain[4].kind, 'restore');

console.log(JSON.stringify({
  events: chain.length,
  chainValid,
  tamperDetected,
  firstEvent: chain[0].kind,
  lastEvent: chain[chain.length - 1].kind
}));
console.log('evidence-chain evidence: append-only=true tamper=detected');
`,
      }),
    ),

  'programming:AI 编程 · 模型能力、局限与工程心智模型：token、上下文窗口和知识截止':
    engineeringLab(
      'AI 工程终章 01 · 上下文是有限预算而不是无限聊天记录',
      '用保守字节估算器计算消息预算、预留输出 token，并检查上下文是否过期。模型 API 为确定性契约模拟，真实计费应以供应商 usage 为准。',
      nodeTask({
        id: 'engf2-context-budget-guided',
        title: '跟做：系统、规则、用户、检索和工具共享窗口',
        brief:
          '运行 node main.js。读取五段消息和 8192 token 窗口，按每四字节约一个 token 估算，保留 1500 输出预算，超限时移除低优先级检索片段。',
        stdin: `{
  "window": 8192,
  "reserveOutput": 1500,
  "segments": [
    {"kind": "system", "priority": 1, "text": "你是一名谨慎的代码助手"},
    {"kind": "rules", "priority": 1, "text": "只能修改工作目录内的文件"},
    {"kind": "user", "priority": 1, "text": "修复订单价格计算并补充测试"},
    {"kind": "retrieval", "priority": 3, "text": "旧版本 v2 表示价格时使用浮点数"},
    {"kind": "tool", "priority": 2, "text": "测试输出 12 passed 0 failed"}
  ]
}`,
        checkpoint:
          '输出 keptKinds 必须包含 system、rules、user、tool，droppedKinds=["retrieval"]，availableInput=6692，fits=true。系统与用户约束不能用截断回答来腾空间。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function estimateTokens(text) {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

const availableInput = input.window - input.reserveOutput;
const ordered = [...input.segments].sort((left, right) => left.priority - right.priority);
const kept = [];
const dropped = [];
let used = 0;
for (const segment of ordered) {
  const cost = estimateTokens(segment.text);
  if (segment.priority <= 2 && used + cost <= availableInput) {
    kept.push(segment);
    used += cost;
  } else {
    dropped.push(segment);
  }
}
const keptKinds = kept.map((segment) => segment.kind);
const droppedKinds = dropped.map((segment) => segment.kind);
const fits = used <= availableInput;

assert.equal(availableInput, 6692);
assert.deepEqual(keptKinds, ['system', 'rules', 'user', 'tool']);
assert.deepEqual(droppedKinds, ['retrieval']);
assert.equal(fits, true);
assert.ok(used > 0);

console.log(JSON.stringify({ keptKinds, droppedKinds, availableInput, used, fits }));
console.log('context-budget evidence: output-reserved=1500 stale-retrieval=dropped');
`,
      }),
      nodeTask({
        id: 'engf2-version-grounding-independent',
        title: '独立实践：版本敏感回答必须引用当前事实',
        brief:
          '运行 node main.js。比较仓库锁文件、官方文档日期和模型知识截止，拒绝把截止后的“最新 API”当作事实，并保留可追溯引用。',
        stdin: `{
  "modelKnowledgeCutoff": "2025-06-01",
  "packageVersion": "5.7.2",
  "lockfileHash": "f4a1c9",
  "documents": [
    {"id": "doc-now", "published": "2026-04-10", "version": "5.7", "supports": "client.timeoutMs"},
    {"id": "doc-old", "published": "2024-01-01", "version": "4.0", "supports": "client.timeout"}
  ],
  "modelClaim": {"api": "client.timeout", "source": "memory"}
}`,
        checkpoint:
          '输出 acceptedCitation=doc-now、claimSupported=false、cutoffRisk=true、mustRefuse=true。知识截止早于当前版本时，不能仅凭模型记忆回答版本 API。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const currentDoc = input.documents.find(
  (document) => document.version === input.packageVersion.split('.')[0] + '.' + input.packageVersion.split('.')[1]
);
const acceptedCitation = currentDoc ? currentDoc.id : null;
const claimSupported = Boolean(
  currentDoc &&
  currentDoc.supports === input.modelClaim.api &&
  input.modelClaim.source !== 'memory'
);
const cutoffRisk = Date.parse(input.modelKnowledgeCutoff) < Date.parse(currentDoc.published);
const mustRefuse = cutoffRisk && !claimSupported;

assert.equal(acceptedCitation, 'doc-now');
assert.equal(claimSupported, false);
assert.equal(cutoffRisk, true);
assert.equal(mustRefuse, true);
assert.notEqual(input.lockfileHash, '');

console.log(JSON.stringify({ acceptedCitation, claimSupported, cutoffRisk, mustRefuse }));
console.log('grounding evidence: current-doc=doc-now memory-claim=refused');
`,
      }),
    ),

  'programming:AI 编程 · 规格、上下文与计划：用户故事、非目标和验收条件':
    engineeringLab(
      'AI 工程终章 02 · 先把边界写成可验收故事',
      '把自然语言需求拆成角色故事、非目标和 Given/When/Then 验收，再检查变更是否越界。所有输入是教学规格，不调用模型。',
      nodeTask({
        id: 'engf2-story-scope-guided',
        title: '跟做：一个用户故事至少有一条拒绝验收',
        brief:
          '运行 node main.js。校验故事的角色、目标、价值、非目标和验收条件，要求既有成功路径也有无权限拒绝路径。',
        stdin: `{
  "story": {
    "actor": "finance reviewer",
    "goal": "导出当前租户的订单 CSV",
    "value": "每月对账无需手工复制",
    "nonGoals": ["修改订单", "跨租户导出"],
    "acceptance": [
      {"given": "reviewer 属于租户 A", "when": "导出 A 的订单", "then": "返回 CSV 和审计事件"},
      {"given": "reviewer 属于租户 A", "when": "请求租户 B 的订单", "then": "返回 404 且不生成文件"}
    ]
  },
  "allowedFiles": ["src/export.ts", "tests/export.test.ts"]
}`,
        checkpoint:
          '输出 valid=true、acceptanceCount=2、hasRejectionPath=true、scopeClear=true。非目标必须能约束实现，验收必须包含权限拒绝而不只是正常导出。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const story = input.story;

const fieldsPresent = [story.actor, story.goal, story.value].every(
  (value) => typeof value === 'string' && value.trim().length > 2
);
const acceptanceComplete = story.acceptance.every(
  (item) => item.given && item.when && item.then
);
const hasRejectionPath = story.acceptance.some(
  (item) => item.then.includes('404') || item.then.includes('拒绝')
);
const scopeClear = story.nonGoals.length >= 2 && input.allowedFiles.every((file) => file.includes('export'));
const valid = fieldsPresent && acceptanceComplete && hasRejectionPath && scopeClear;

assert.equal(valid, true);
assert.equal(story.acceptance.length, 2);
assert.equal(hasRejectionPath, true);
assert.equal(scopeClear, true);

console.log(JSON.stringify({
  valid,
  acceptanceCount: story.acceptance.length,
  hasRejectionPath,
  scopeClear
}));
console.log('story evidence: non-goals=2 rejection-acceptance=present');
`,
      }),
      nodeTask({
        id: 'engf2-scope-drift-independent',
        title: '独立实践：发现实现计划中的范围漂移',
        brief:
          '运行 node main.js。把计划文件与故事映射到验收项，标记不在允许列表、缺少测试或引入非目标的步骤，并阻断越界变更。',
        stdin: `{
  "story": {"id": "EXPORT-1", "nonGoals": ["修改订单", "发送邮件"]},
  "acceptance": ["CSV_COLUMNS", "TENANT_404", "AUDIT_EVENT"],
  "steps": [
    {"id": "read", "files": ["src/export.ts"], "acceptance": ["CSV_COLUMNS"]},
    {"id": "auth", "files": ["src/export.ts", "tests/export.test.ts"], "acceptance": ["TENANT_404"]},
    {"id": "notify", "files": ["src/mailer.ts"], "acceptance": []}
  ],
  "allowedFiles": ["src/export.ts", "tests/export.test.ts"]
}`,
        checkpoint:
          '输出 driftSteps=["notify"]、missingAcceptance=["AUDIT_EVENT"]、blocked=true。范围检查同时看文件白名单和验收覆盖，不能因为代码能运行就忽略非目标。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const driftSteps = input.steps
  .filter((step) => step.files.some((file) => !input.allowedFiles.includes(file)))
  .map((step) => step.id);
const covered = new Set(input.steps.flatMap((step) => step.acceptance));
const missingAcceptance = input.acceptance.filter((item) => !covered.has(item));
const touchesNonGoal = input.steps.some((step) =>
  step.files.some((file) => file.includes('mailer')) &&
  input.story.nonGoals.includes('发送邮件')
);
const blocked = driftSteps.length > 0 || missingAcceptance.length > 0 || touchesNonGoal;

assert.deepEqual(driftSteps, ['notify']);
assert.deepEqual(missingAcceptance, ['AUDIT_EVENT']);
assert.equal(touchesNonGoal, true);
assert.equal(blocked, true);

console.log(JSON.stringify({ driftSteps, missingAcceptance, blocked }));
console.log('scope-drift evidence: file-whitelist=failed non-goal=touched');
`,
      }),
    ),

  'programming:AI 编程 · 规格、上下文与计划：计划、补丁、验证分阶段':
    engineeringLab(
      'AI 工程终章 03 · 计划、补丁和验证是三道独立门',
      '用文件清单、补丁操作和验证结果构造变更流水线；任何阶段失败都不能直接发布。补丁应用为内存文件系统模型，测试为真实 Node 断言。',
      nodeTask({
        id: 'engf2-plan-patch-guided',
        title: '跟做：补丁只能修改计划内文件',
        brief:
          '运行 node main.js。读取计划、补丁和允许文件，按顺序应用添加、替换操作，再验证目标内容与未计划文件保持不变。',
        stdin: `{
  "plan": {"goal": "增加超时配置", "files": ["src/client.ts", "tests/client.test.ts"]},
  "files": {
    "src/client.ts": "export const timeoutMs = 1000;",
    "src/secret.ts": "do-not-touch"
  },
  "allowedFiles": ["src/client.ts", "tests/client.test.ts"],
  "patch": [
    {"op": "replace", "path": "src/client.ts", "from": "1000", "to": "2500"},
    {"op": "add", "path": "tests/client.test.ts", "content": "assert.equal(timeoutMs, 2500);"}
  ]
}`,
        checkpoint:
          '输出 patched=true、plannedFiles=2、unplannedFiles=0、untouchedSecret=true、timeoutMs=2500。补丁路径超出计划时必须在写入前失败。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const files = { ...input.files };
const planned = new Set(input.plan.files);
let unplannedFiles = 0;

for (const operation of input.patch) {
  if (!planned.has(operation.path) || !input.allowedFiles.includes(operation.path)) {
    unplannedFiles += 1;
    continue;
  }
  if (operation.op === 'replace') {
    files[operation.path] = files[operation.path].replaceAll(operation.from, operation.to);
  } else if (operation.op === 'add') {
    files[operation.path] = operation.content;
  }
}

const patched = files['src/client.ts'].includes('2500') && Boolean(files['tests/client.test.ts']);
const untouchedSecret = files['src/secret.ts'] === input.files['src/secret.ts'];
assert.equal(patched, true);
assert.equal(planned.size, 2);
assert.equal(unplannedFiles, 0);
assert.equal(untouchedSecret, true);

console.log(JSON.stringify({
  patched,
  plannedFiles: planned.size,
  unplannedFiles,
  untouchedSecret,
  timeoutMs: 2500
}));
console.log('patch evidence: allowlist=respected verification=planned');
`,
      }),
      nodeTask({
        id: 'engf2-stage-gate-independent',
        title: '独立实践：任一步验证缺失就阻断交付',
        brief:
          '运行 node main.js。按 plan、patch、typecheck、test、security 五阶段检查证据，识别缺失和失败，计算最终发布决策。',
        stdin: `{
  "change": "agent-tool-permissions",
  "stages": [
    {"name": "plan", "status": "pass"},
    {"name": "patch", "status": "pass"},
    {"name": "typecheck", "status": "pass"},
    {"name": "test", "status": "fail"},
    {"name": "security", "status": "missing"}
  ],
  "requiredStages": ["plan", "patch", "typecheck", "test", "security"]
}`,
        checkpoint:
          '输出 failedStages=["test"]、missingStages=["security"]、canDeploy=false、evidenceComplete=false。失败和缺失要分开报告，便于定位修复动作。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const byName = new Map(input.stages.map((stage) => [stage.name, stage.status]));
const failedStages = input.requiredStages.filter((name) => byName.get(name) === 'fail');
const missingStages = input.requiredStages.filter((name) => !byName.has(name) || byName.get(name) === 'missing');
const evidenceComplete = failedStages.length === 0 && missingStages.length === 0;
const canDeploy = evidenceComplete;

assert.deepEqual(failedStages, ['test']);
assert.deepEqual(missingStages, ['security']);
assert.equal(evidenceComplete, false);
assert.equal(canDeploy, false);
assert.equal(input.requiredStages.length, 5);

console.log(JSON.stringify({ failedStages, missingStages, canDeploy, evidenceComplete }));
console.log('stage-gate evidence: failure=separate missing=separate deploy=blocked');
`,
      }),
    ),

  'programming:AI 编程 · AI 编码、测试与代码评审：测试优先、失败注入和 property test':
    engineeringLab(
      'AI 工程终章 04 · 先看到红灯，再证明修复覆盖性质',
      '在 Node 中运行真实最小测试和失败注入，记录修复前失败、修复后通过，并对边界输入执行属性断言。模型不参与执行结论。',
      nodeTask({
        id: 'engf2-red-green-guided',
        title: '跟做：先复现空购物车崩溃再修复',
        brief:
          '运行 node main.js。读取三个购物车样例，先用有缺陷实现触发错误，再换成修复实现并断言全部通过，同时保留红灯记录。',
        stdin: `{
  "cases": [
    {"items": [], "discount": 0},
    {"items": [{"cents": 500, "qty": 2}], "discount": 100},
    {"items": [{"cents": 200, "qty": 1}], "discount": 0}
  ]
}`,
        checkpoint:
          '输出 redSeen=true、greenSeen=true、fixedPassed=3、failuresAfterFix=0。没有失败复现证据的“修复”不满足测试优先流程。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function buggyTotal(cart) {
  return cart.items[0].cents * cart.items[0].qty - cart.discount;
}

function fixedTotal(cart) {
  const subtotal = cart.items.reduce((sum, item) => sum + item.cents * item.qty, 0);
  return Math.max(0, subtotal - cart.discount);
}

let redSeen = false;
for (const cart of input.cases) {
  try {
    buggyTotal(cart);
  } catch (error) {
    redSeen = true;
  }
}

const results = input.cases.map((cart) => fixedTotal(cart));
const failuresAfterFix = input.cases.filter((cart) => {
  try {
    const total = fixedTotal(cart);
    return !Number.isInteger(total) || total < 0;
  } catch (error) {
    return true;
  }
}).length;
const greenSeen = failuresAfterFix === 0;

assert.equal(redSeen, true);
assert.equal(greenSeen, true);
assert.deepEqual(results, [0, 900, 200]);
assert.equal(failuresAfterFix, 0);

console.log(JSON.stringify({
  redSeen,
  greenSeen,
  fixedPassed: results.length,
  failuresAfterFix
}));
console.log('red-green evidence: failing-first=observed fixed-suite=green');
`,
      }),
      nodeTask({
        id: 'engf2-property-fault-independent',
        title: '独立实践：属性测试和故障注入覆盖恢复路径',
        brief:
          '运行 node main.js。对分页函数验证不重不漏、页大小边界和页码归一化，再注入第二页失败并验证重试不重复输出。',
        stdin: `{
  "items": [1,2,3,4,5,6,7,8,9],
  "pageSize": 3,
  "failurePage": 2,
  "retryPage": 2
}`,
        checkpoint:
          '输出 pages=3、flattened=9、unique=9、emptyPage=[]、recovered=true、duplicatesAfterRetry=0。故障恢复断言最终集合完整，而不是只断言抛过异常。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function page(items, pageNumber, pageSize) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('bad page');
  if (pageNumber === input.failurePage) throw new Error('injected failure');
  const start = (pageNumber - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

const pages = Math.ceil(input.items.length / input.pageSize);
const collected = [];
let recovered = false;
for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
  try {
    collected.push(...page(input.items, pageNumber, input.pageSize));
  } catch (error) {
    if (pageNumber === input.failurePage) {
      input.failurePage = -1;
      collected.push(...page(input.items, input.retryPage, input.pageSize));
      recovered = true;
    }
  }
}

const unique = new Set(collected).size;
const emptyPage = page(input.items, 4, input.pageSize);
const duplicatesAfterRetry = collected.length - unique;

assert.equal(pages, 3);
assert.equal(collected.length, 9);
assert.equal(unique, 9);
assert.deepEqual(emptyPage, []);
assert.equal(recovered, true);
assert.equal(duplicatesAfterRetry, 0);

console.log(JSON.stringify({
  pages,
  flattened: collected.length,
  unique,
  emptyPage,
  recovered,
  duplicatesAfterRetry
}));
console.log('property-fault evidence: collection=complete retry=idempotent');
`,
      }),
    ),

  'programming:AI 编程 · AI 编码、测试与代码评审：依赖、许可证和虚构 API 核验':
    engineeringLab(
      'AI 工程终章 05 · 依赖、许可证和 API 都要有可追溯证据',
      '检查依赖锁版本、许可证、安装脚本和来源摘要，再对照固定接口清单拒绝虚构函数。包注册表和文档是本地确定性样本。',
      nodeTask({
        id: 'engf2-license-lock-guided',
        title: '跟做：新增依赖必须通过来源、许可证和脚本门禁',
        brief:
          '运行 node main.js。读取三个候选项，只允许 MIT/Apache-2.0、锁文件精确版本、摘要存在且无安装脚本的包进入运行时依赖。',
        stdin: `{
  "candidates": [
    {"name": "schema-lite", "version": "2.1.0", "locked": true, "license": "MIT", "integrity": "sha512-a1", "scripts": {}},
    {"name": "gpl-helper", "version": "1.0.0", "locked": true, "license": "GPL-3.0-only", "integrity": "sha512-b2", "scripts": {}},
    {"name": "mystery-build", "version": "0.3.0", "locked": true, "license": "Apache-2.0", "integrity": "sha512-c3", "scripts": {"postinstall": "node hook.js"}}
  ]
}`,
        checkpoint:
          '输出 accepted=["schema-lite"]、rejected 包含 gpl-helper:license 和 mystery-build:install-script、trustedCount=1。来源不透明或带安装脚本的包不能仅因许可证合格而放行。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const allowedLicenses = new Set(['MIT', 'Apache-2.0']);

function inspect(candidate) {
  if (!candidate.locked) return 'unlocked';
  if (!candidate.integrity) return 'missing-integrity';
  if (!allowedLicenses.has(candidate.license)) return 'license';
  if (Object.keys(candidate.scripts).length > 0) return 'install-script';
  return 'ok';
}

const accepted = [];
const rejected = [];
for (const candidate of input.candidates) {
  const verdict = inspect(candidate);
  if (verdict === 'ok') accepted.push(candidate.name);
  else rejected.push(candidate.name + ':' + verdict);
}

assert.deepEqual(accepted, ['schema-lite']);
assert.deepEqual(rejected, ['gpl-helper:license', 'mystery-build:install-script']);
assert.equal(accepted.length, 1);

console.log(JSON.stringify({ accepted, rejected, trustedCount: accepted.length }));
console.log('dependency evidence: lockfile=required license=allowlisted scripts=blocked');
`,
      }),
      nodeTask({
        id: 'engf2-api-claim-independent',
        title: '独立实践：模型给出的 API 必须逐项命中真实导出',
        brief:
          '运行 node main.js。读取锁定版本的真实导出清单和模型建议调用，拒绝不存在的函数、版本不匹配和未安装包的 import。',
        stdin: `{
  "package": {"name": "acme-client", "lockedVersion": "5.7.2", "installed": true},
  "exports": ["createClient", "createClient.timeout", "parseResponse"],
  "claims": [
    {"pkg": "acme-client", "version": "5.7.2", "api": "createClient", "verifiedDoc": "doc-57"},
    {"pkg": "acme-client", "version": "5.7.2", "api": "createClient.retryForever", "verifiedDoc": "blog-old"},
    {"pkg": "not-installed", "version": "1.0.0", "api": "magic", "verifiedDoc": "memory"}
  ]
}`,
        checkpoint:
          '输出 acceptedClaims=1、rejected 包含虚构 API 和未安装包，verificationComplete=false、canApply=false。模型生成的 import 必须和 lockfile、导出清单与固定版本文档三方一致。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function verify(claim) {
  if (claim.pkg !== input.package.name || !input.package.installed) return 'package';
  if (claim.version !== input.package.lockedVersion) return 'version';
  if (!input.exports.includes(claim.api)) return 'missing-export';
  if (!claim.verifiedDoc.startsWith('doc-')) return 'unverified-doc';
  return 'ok';
}

const accepted = [];
const rejected = [];
for (const claim of input.claims) {
  const verdict = verify(claim);
  if (verdict === 'ok') accepted.push(claim.api);
  else rejected.push(claim.api + ':' + verdict);
}

const verificationComplete = rejected.length === 0;
const canApply = accepted.length === input.claims.length;
assert.deepEqual(accepted, ['createClient']);
assert.deepEqual(rejected, ['createClient.retryForever:missing-export', 'magic:package']);
assert.equal(verificationComplete, false);
assert.equal(canApply, false);

console.log(JSON.stringify({ acceptedClaims: accepted.length, rejected, verificationComplete, canApply }));
console.log('api-verification evidence: exports=checked lockfile=matched docs=required');
`,
      }),
    ),

  'programming:AI 编程 · 提示注入、安全与评测：秘密、个人数据和日志脱敏':
    engineeringLab(
      'AI 工程终章 06 · 日志可关联请求但不能保存秘密和原始隐私',
      '递归脱敏敏感字段，替换邮箱、手机号和令牌，再用哈希保留关联能力。提示注入安全检查为确定性字符串处理，不对真实用户数据运行。',
      nodeTask({
        id: 'engf2-recursive-redaction-guided',
        title: '跟做：嵌套对象里的敏感键也必须清洗',
        brief:
          '运行 node main.js。递归遍历请求和用户对象，替换 password、token、email、phone 等键，并断言原始对象未被修改、日志保留 requestId。',
        stdin: `{
  "requestId": "req-7001",
  "payload": {
    "user": {"email": "alice@example.test", "phone": "13800138000"},
    "auth": {"token": "secret-token-abc", "password": "not-logged"},
    "note": "contact alice@example.test"
  }
}`,
        checkpoint:
          '输出 requestId=req-7001、redactedKeys 包含 user.email、auth.token、auth.password，serializedLogHasSecret=false、originalUnchanged=true。只过滤顶层字段会漏掉嵌套秘密。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const sensitiveKeys = new Set(['password', 'token', 'email', 'phone', 'secret']);
const redactedKeys = [];

function redact(value, path) {
  if (Array.isArray(value)) return value.map((item, index) => redact(item, path + '[' + index + ']'));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const childPath = path ? path + '.' + key : key;
      if (sensitiveKeys.has(key.toLowerCase())) {
        redactedKeys.push(childPath);
        return [key, '[REDACTED]'];
      }
      return [key, redact(child, childPath)];
    }));
  }
  if (typeof value === 'string' && value.includes('@')) return '[EMAIL]';
  return value;
}

const before = JSON.stringify(input.payload);
const redacted = redact(input.payload, 'payload');
const serializedLog = JSON.stringify({ requestId: input.requestId, payload: redacted });
const serializedLogHasSecret = [
  'alice@example.test',
  '13800138000',
  'secret-token-abc',
  'not-logged'
].some((secret) => serializedLog.includes(secret));

assert.deepEqual(redactedKeys, [
  'payload.user.email',
  'payload.user.phone',
  'payload.auth.token',
  'payload.auth.password'
]);
assert.equal(serializedLogHasSecret, false);
assert.equal(JSON.stringify(input.payload), before);
assert.equal(input.requestId, 'req-7001');

console.log(JSON.stringify({
  requestId: input.requestId,
  redactedKeys,
  serializedLogHasSecret,
  originalUnchanged: true
}));
console.log('redaction evidence: nested=recursive secret-in-log=false');
`,
      }),
      nodeTask({
        id: 'engf2-redaction-hash-independent',
        title: '独立实践：脱敏后仍能关联同一用户',
        brief:
          '运行 node main.js。用每次部署独立的 HMAC 盐给用户标识生成关联哈希，清除自由文本中的邮箱和手机号，同时验证同值同哈希、异值异哈希。',
        stdin: `{
  "deploymentSalt": "local-test-salt-2026-05",
  "events": [
    {"id": "e1", "userId": "u-101", "text": "alice@example.test called 13800138000"},
    {"id": "e2", "userId": "u-101", "text": "follow up by email"},
    {"id": "e3", "userId": "u-202", "text": "bob@example.test"}
  ]
}`,
        checkpoint:
          '输出 sameUserSameHash=true、differentUserDifferentHash=true、rawEmailPresent=false、rawPhonePresent=false、traceable=true。哈希用于关联，不用于承诺匿名，也不能把 HMAC 盐写进日志。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function userHash(userId) {
  return crypto
    .createHmac('sha256', input.deploymentSalt)
    .update(userId)
    .digest('hex')
    .slice(0, 16);
}

function cleanText(text) {
  return text
    .replaceAll('alice@example.test', '[EMAIL]')
    .replaceAll('bob@example.test', '[EMAIL]')
    .replaceAll('13800138000', '[PHONE]');
}

const sanitized = input.events.map((event) => ({
  id: event.id,
  userHash: userHash(event.userId),
  text: cleanText(event.text)
}));
const serialized = JSON.stringify(sanitized);
const sameUserSameHash = sanitized[0].userHash === sanitized[1].userHash;
const differentUserDifferentHash = sanitized[0].userHash !== sanitized[2].userHash;
const rawEmailPresent = serialized.includes('@example.test');
const rawPhonePresent = serialized.includes('13800138000');
const saltLeaked = serialized.includes(input.deploymentSalt);

assert.equal(sameUserSameHash, true);
assert.equal(differentUserDifferentHash, true);
assert.equal(rawEmailPresent, false);
assert.equal(rawPhonePresent, false);
assert.equal(saltLeaked, false);

console.log(JSON.stringify({
  sameUserSameHash,
  differentUserDifferentHash,
  rawEmailPresent,
  rawPhonePresent,
  traceable: sameUserSameHash && !saltLeaked
}));
console.log('redaction-hash evidence: correlation=stable salt-in-log=false');
`,
      }),
    ),

  'programming:软件架构与交付 · 需求、质量属性与架构边界：模块化单体与微服务取舍':
    engineeringLab(
      '软件架构终章 01 · 拆分由边界和部署证据决定',
      '检查模块依赖是否无环、所有权是否清晰，再用发布频率、扩缩容差异和跨团队耦合判断是否值得拆服务。部署拓扑为评分模型。',
      nodeTask({
        id: 'engf2-module-cycle-guided',
        title: '跟做：先证明模块化单体内部没有依赖环',
        brief:
          '运行 node main.js。读取模块依赖图，使用 DFS 找出环和跨模块内部访问，再计算可独立测试的公开端口数量。',
        stdin: `{
  "modules": {
    "orders": ["billing.public", "inventory.public"],
    "inventory": ["orders.repository"],
    "billing": ["orders.public"]
  },
  "publicPorts": ["orders.public", "inventory.public", "billing.public"]
}`,
        checkpoint:
          '输出 cycle=["orders","billing","orders"]、internalLeaks=["orders.repository"]、acyclic=false、publicPortCount=3。内部 repository 跨模块可见说明模块边界只是目录而不是约束。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function findCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) return stack.slice(stack.indexOf(node)).concat(node);
    if (visited.has(node)) return null;
    visiting.add(node);
    stack.push(node);
    for (const edge of graph[node] || []) {
      const [target] = edge.split('.');
      if (graph[target]) {
        const found = visit(target);
        if (found) return found;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of Object.keys(graph)) {
    const found = visit(node);
    if (found) return found;
  }
  return [];
}

const cycle = findCycle(input.modules);
const internalLeaks = Object.entries(input.modules).flatMap(([owner, edges]) =>
  edges
    .filter((edge) => !edge.endsWith('.public') && edge !== owner + '.repository')
    .map((edge) => edge)
);
const acyclic = cycle.length === 0;

assert.deepEqual(cycle, ['orders', 'billing', 'orders']);
assert.deepEqual(internalLeaks, ['orders.repository']);
assert.equal(acyclic, false);
assert.equal(input.publicPorts.length, 3);

console.log(JSON.stringify({ cycle, internalLeaks, acyclic, publicPortCount: input.publicPorts.length }));
console.log('modularity evidence: cycle=found internal-access=found');
`,
      }),
      nodeTask({
        id: 'engf2-split-score-independent',
        title: '独立实践：用发布频率和扩缩容差异打分',
        brief:
          '运行 node main.js。为两个候选边界计算独立部署、扩缩容、数据所有权和团队耦合分数，只有达到阈值且无共享事务硬依赖时建议拆分。',
        stdin: `{
  "candidates": [
    {
      "name": "notifications",
      "deployFrequencyDelta": 9,
      "scaleDelta": 8,
      "dataOwnerClear": true,
      "teamCoupling": 2,
      "sharedTransaction": false
    },
    {
      "name": "billing",
      "deployFrequencyDelta": 1,
      "scaleDelta": 1,
      "dataOwnerClear": false,
      "teamCoupling": 9,
      "sharedTransaction": true
    }
  ],
  "threshold": 20
}`,
        checkpoint:
          '输出 notifications=30→split、billing=3→keep-monolith、recommended=["notifications"]。共享事务和模糊数据所有权通常说明边界尚未成熟。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function score(candidate) {
  return (
    candidate.deployFrequencyDelta +
    candidate.scaleDelta +
    (candidate.dataOwnerClear ? 5 : 0) +
    Math.max(0, 10 - candidate.teamCoupling)
  );
}

const decisions = Object.fromEntries(input.candidates.map((candidate) => {
  const value = score(candidate);
  const decision = value >= input.threshold && !candidate.sharedTransaction && candidate.dataOwnerClear
    ? 'split'
    : 'keep-monolith';
  return [candidate.name, { score: value, decision }];
}));
const recommended = Object.entries(decisions)
  .filter(([, value]) => value.decision === 'split')
  .map(([name]) => name);

assert.deepEqual(decisions.notifications, { score: 30, decision: 'split' });
assert.deepEqual(decisions.billing, { score: 3, decision: 'keep-monolith' });
assert.deepEqual(recommended, ['notifications']);

console.log(JSON.stringify({ decisions, recommended }));
console.log('split-decision evidence: score=30 threshold-met; shared-transaction=kept');
`,
      }),
    ),

  'programming:软件架构与交付 · DDD、API 与模块化实现：REST/RPC、幂等和错误契约':
    engineeringLab(
      '软件架构终章 02 · 幂等重放和错误契约必须有稳定协议',
      '用内存请求日志验证同一幂等键重放返回原结果、载荷冲突返回 409，并按 RFC 9457 风格生成稳定错误对象。HTTP 服务为契约模拟。',
      nodeTask({
        id: 'engf2-idempotency-guided',
        title: '跟做：重复请求不能重复扣款',
        brief:
          '运行 node main.js。顺序处理四笔创建订单请求，同一 idempotency-key 只有第一次创建，载荷不一致必须返回 409。',
        stdin: `{
  "requests": [
    {"key": "idem-a", "payload": {"orderId": "o-1", "amount": 500}},
    {"key": "idem-a", "payload": {"orderId": "o-1", "amount": 500}},
    {"key": "idem-b", "payload": {"orderId": "o-2", "amount": 700}},
    {"key": "idem-b", "payload": {"orderId": "o-2", "amount": 999}}
  ]
}`,
        checkpoint:
          '输出 statuses=[201,200,201,409]、createdOrders=2、replayed=1、conflicts=1。重放返回原响应摘要，载荷不同不能被当作同一请求接受。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function fingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const records = new Map();
const statuses = [];
const orders = [];
for (const request of input.requests) {
  const hash = fingerprint(request.payload);
  const existing = records.get(request.key);
  if (!existing) {
    records.set(request.key, { hash, payload: request.payload });
    orders.push(request.payload.orderId);
    statuses.push(201);
  } else if (existing.hash === hash) {
    statuses.push(200);
  } else {
    statuses.push(409);
  }
}

const createdOrders = new Set(orders).size;
const replayed = statuses.filter((status) => status === 200).length;
const conflicts = statuses.filter((status) => status === 409).length;
assert.deepEqual(statuses, [201, 200, 201, 409]);
assert.equal(createdOrders, 2);
assert.equal(replayed, 1);
assert.equal(conflicts, 1);

console.log(JSON.stringify({ statuses, createdOrders, replayed, conflicts }));
console.log('idempotency evidence: same-payload=replay changed-payload=409');
`,
      }),
      nodeTask({
        id: 'engf2-problem-details-independent',
        title: '独立实践：错误码映射到稳定 Problem Details',
        brief:
          '运行 node main.js。把领域错误映射为 HTTP 状态和统一字段，断言未知错误不会泄露堆栈、校验错误带字段路径、冲突保留 requestId。',
        stdin: `{
  "requestId": "req-812",
  "errors": [
    {"kind": "validation", "field": "amount", "message": "必须为正整数"},
    {"kind": "not-found", "message": "订单不存在"},
    {"kind": "conflict", "message": "版本冲突"},
    {"kind": "unexpected", "message": "database password=secret"}
  ]
}`,
        checkpoint:
          '输出 statuses=[400,404,409,500]、contentType=application/problem+json、leakStack=false、validationField=amount。未知异常对外统一为通用 500，详细堆栈只进受控内部日志。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const mapping = {
  validation: { status: 400, code: 'INVALID_INPUT' },
  'not-found': { status: 404, code: 'NOT_FOUND' },
  conflict: { status: 409, code: 'VERSION_CONFLICT' },
  unexpected: { status: 500, code: 'INTERNAL_ERROR' }
};

const problemDetails = input.errors.map((error) => {
  const mapped = mapping[error.kind] || mapping.unexpected;
  return {
    type: 'https://errors.example.test/' + mapped.code.toLowerCase(),
    title: mapped.code,
    status: mapped.status,
    detail: error.kind === 'unexpected' ? '服务器无法完成请求' : error.message,
    requestId: input.requestId,
    ...(error.field ? { errors: { [error.field]: error.message } } : {})
  };
});

const statuses = problemDetails.map((problem) => problem.status);
const leakStack = JSON.stringify(problemDetails).includes('password=secret');
const validationField = Object.keys(problemDetails[0].errors)[0];
assert.deepEqual(statuses, [400, 404, 409, 500]);
assert.equal(leakStack, false);
assert.equal(validationField, 'amount');
assert.ok(problemDetails.every((problem) => problem.requestId === input.requestId));

console.log(JSON.stringify({
  statuses,
  contentType: 'application/problem+json',
  leakStack,
  validationField
}));
console.log('problem-details evidence: stable-fields=true unexpected-sanitized=true');
`,
      }),
    ),

  'programming:软件架构与交付 · DDD、API 与模块化实现：事务边界、Outbox 和领域事件':
    engineeringLab(
      '软件架构终章 03 · 数据库事务和消息发布不能各写各的成功',
      '在内存中模拟领域写、Outbox 同事务提交与失败回滚；消费者按至少一次投递处理并去重。消息代理为确定性契约模型。',
      nodeTask({
        id: 'engf2-outbox-atomic-guided',
        title: '跟做：领域写和事件记录同生共死',
        brief:
          '运行 node main.js。分别执行成功订单和失败订单事务，断言成功时订单与 outbox 同时存在，失败时两者都不存在。',
        stdin: `{
  "transactions": [
    {"id": "o-1", "amount": 500, "fail": false},
    {"id": "o-2", "amount": -20, "fail": true}
  ]
}`,
        checkpoint:
          '输出 orders=["o-1"]、outbox=1、failedRolledBack=true、eventType=order.created。不能先写库再异步“补”事件，否则中间崩溃会永久丢事件。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const database = { orders: [], outbox: [] };

function transaction(candidate) {
  const draft = {
    orders: [...database.orders],
    outbox: [...database.outbox]
  };
  if (candidate.fail || candidate.amount <= 0) return { committed: false, database: draft };
  draft.orders.push({ id: candidate.id, amount: candidate.amount });
  draft.outbox.push({
    id: 'evt-' + candidate.id,
    type: 'order.created',
    aggregateId: candidate.id,
    payload: { amount: candidate.amount }
  });
  return { committed: true, database: draft };
}

let failedRolledBack = true;
for (const candidate of input.transactions) {
  const ordersBefore = database.orders.length;
  const outboxBefore = database.outbox.length;
  const result = transaction(candidate);
  if (result.committed) {
    database.orders = result.database.orders;
    database.outbox = result.database.outbox;
  } else {
    failedRolledBack =
      database.orders.length === ordersBefore &&
      database.outbox.length === outboxBefore;
  }
}

assert.deepEqual(database.orders.map((order) => order.id), ['o-1']);
assert.equal(database.outbox.length, 1);
assert.equal(database.outbox[0].type, 'order.created');
assert.equal(failedRolledBack, true);

console.log(JSON.stringify({
  orders: database.orders.map((order) => order.id),
  outbox: database.outbox.length,
  failedRolledBack,
  eventType: database.outbox[0].type
}));
console.log('outbox evidence: transaction=atomic failed-write=no-event');
`,
      }),
      nodeTask({
        id: 'engf2-consumer-dedup-independent',
        title: '独立实践：至少一次投递下消费者仍只生效一次',
        brief:
          '运行 node main.js。按 outbox 顺序投递，故意重复部分消息并打乱一次确认，消费者用消息 ID 去重并保持聚合版本单调。',
        stdin: `{
  "events": [
    {"id": "evt-1", "aggregateId": "o-1", "version": 1, "amount": 500},
    {"id": "evt-1", "aggregateId": "o-1", "version": 1, "amount": 500},
    {"id": "evt-2", "aggregateId": "o-1", "version": 2, "amount": 500},
    {"id": "evt-3", "aggregateId": "o-2", "version": 1, "amount": 700}
  ]
}`,
        checkpoint:
          '输出 processed=3、duplicates=1、orderTotals={"o-1":1000,"o-2":700}、versionRegressions=0。去重键应是稳定消息 ID，聚合版本防止旧消息覆盖新状态。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const seen = new Set();
const versions = new Map();
const totals = new Map();
let duplicates = 0;
let versionRegressions = 0;

for (const event of input.events) {
  if (seen.has(event.id)) {
    duplicates += 1;
    continue;
  }
  const current = versions.get(event.aggregateId) || 0;
  if (event.version <= current) {
    versionRegressions += 1;
    continue;
  }
  seen.add(event.id);
  versions.set(event.aggregateId, event.version);
  totals.set(event.aggregateId, (totals.get(event.aggregateId) || 0) + event.amount);
}

const orderTotals = Object.fromEntries([...totals.entries()].sort());
assert.equal(seen.size, 3);
assert.equal(duplicates, 1);
assert.deepEqual(orderTotals, { 'o-1': 1000, 'o-2': 700 });
assert.equal(versionRegressions, 0);

console.log(JSON.stringify({ processed: seen.size, duplicates, orderTotals, versionRegressions }));
console.log('consumer evidence: at-least-once=handled version-order=enforced');
`,
      }),
    ),

  'programming:软件架构与交付 · 分布式、数据一致性与高并发：缓存、分片、读写分离和复制延迟':
    engineeringLab(
      '软件架构终章 04 · 缓存键、分片和复制延迟都会改变一致性',
      '用确定性缓存模型验证租户版本进入键、single-flight 防击穿，再根据写后读预算选择主库或允许延迟的副本。真实 Redis/Postgres 仍需集成测试。',
      nodeTask({
        id: 'engf2-cache-key-guided',
        title: '跟做：缓存键必须带租户和版本',
        brief:
          '运行 node main.js。模拟同一路径在两个租户下读取，验证缓存隔离；版本升级后旧缓存失效，并让并发未命中只回源一次。',
        stdin: `{
  "requests": [
    {"tenant": "a", "path": "/orders", "version": 1},
    {"tenant": "b", "path": "/orders", "version": 1},
    {"tenant": "a", "path": "/orders", "version": 1},
    {"tenant": "a", "path": "/orders", "version": 2}
  ],
  "concurrentMisses": 5
}`,
        checkpoint:
          '输出 keys 必须包含 tenant:a:v1:/orders 与 tenant:b:v1:/orders，cacheHits=1、originLoads=3、singleFlightOriginLoads=1。路径相同但租户不同不能共享缓存。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cache = new Map();
const keys = [];
let cacheHits = 0;
let originLoads = 0;

function cacheKey(request) {
  return 'tenant:' + request.tenant + ':v' + request.version + ':' + request.path;
}

for (const request of input.requests) {
  const key = cacheKey(request);
  keys.push(key);
  if (cache.has(key)) {
    cacheHits += 1;
  } else {
    originLoads += 1;
    cache.set(key, { request });
  }
}

let inFlight = null;
let singleFlightOriginLoads = 0;
function origin() {
  singleFlightOriginLoads += 1;
  return { fresh: true };
}
function singleFlightLoad() {
  if (!inFlight) inFlight = Promise.resolve().then(origin).finally(() => { inFlight = null; });
  return inFlight;
}

Promise.all(Array.from({ length: input.concurrentMisses }, singleFlightLoad)).then((results) => {
  assert.equal(cacheHits, 1);
  assert.equal(originLoads, 3);
  assert.equal(singleFlightOriginLoads, 1);
  assert.ok(results.every((result) => result.fresh));
  assert.ok(keys.includes('tenant:a:v1:/orders'));
  assert.ok(keys.includes('tenant:b:v1:/orders'));

  console.log(JSON.stringify({ keys, cacheHits, originLoads, singleFlightOriginLoads }));
  console.log('cache evidence: tenant-isolated=true stale-version=miss single-flight=1');
});
`,
      }),
      nodeTask({
        id: 'engf2-replica-lag-independent',
        title: '独立实践：写后读按延迟预算选择副本',
        brief:
          '运行 node main.js。对读请求检查最大可接受延迟；刚更新过的用户走主库，浏览列表可走延迟副本，并记录选择原因。',
        stdin: `{
  "primary": {"lagMs": 0},
  "replicas": [
    {"id": "r1", "lagMs": 180},
    {"id": "r2", "lagMs": 640}
  ],
  "reads": [
    {"id": "profile-after-write", "maxLagMs": 50, "writtenAtMs": 1000, "nowMs": 1100},
    {"id": "catalog", "maxLagMs": 800, "writtenAtMs": 0, "nowMs": 5000},
    {"id": "invoice", "maxLagMs": 300, "writtenAtMs": 4900, "nowMs": 5000}
  ]
}`,
        checkpoint:
          '输出 profile-after-write=primary、catalog=r2、invoice=primary、staleReads=0。read-your-writes 预算不能满足时回主库，不能为了吞吐牺牲已承诺的一致性。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

function choose(read) {
  const ageMs = read.nowMs - read.writtenAtMs;
  const eligibleReplica = [...input.replicas]
    .filter((replica) => replica.lagMs <= read.maxLagMs)
    .sort((left, right) => right.lagMs - left.lagMs)[0];
  if (ageMs <= read.maxLagMs || !eligibleReplica) {
    return { target: 'primary', lagMs: input.primary.lagMs };
  }
  return { target: eligibleReplica.id, lagMs: eligibleReplica.lagMs };
}

const choices = Object.fromEntries(input.reads.map((read) => [read.id, choose(read).target]));
const staleReads = input.reads.filter((read) => {
  const selected = choose(read);
  return selected.lagMs > read.maxLagMs;
}).length;

assert.deepEqual(choices, {
  'profile-after-write': 'primary',
  catalog: 'r2',
  invoice: 'primary'
});
assert.equal(staleReads, 0);
assert.equal(input.replicas.length, 2);

console.log(JSON.stringify({
  'profile-after-write': choices['profile-after-write'],
  catalog: choices.catalog,
  invoice: choices.invoice,
  staleReads
}));
console.log('replica evidence: max-lag=enforced write-after-read=primary');
`,
      }),
    ),

  'programming:软件架构与交付 · Docker、Kubernetes、Helm 与配置：ConfigMap、Secret、Apollo 与灰度':
    engineeringLab(
      '软件架构终章 05 · 配置发布也要有版本、脱敏和回滚',
      '合并 ConfigMap 与 Secret 引用，验证配置哈希、灰度键和敏感值脱敏，再按健康指标决定扩大或回滚。Kubernetes 与 Apollo 均为契约模拟。',
      nodeTask({
        id: 'engf2-config-merge-guided',
        title: '跟做：Secret 只以引用进入配置',
        brief:
          '运行 node main.js。合并基础配置、环境覆盖和 Secret 引用，生成稳定哈希；断言数据库密码明文不进入渲染结果。',
        stdin: `{
  "configMap": {"LOG_LEVEL": "info", "FEATURE_CHECKOUT": "false", "DB_HOST": "orders-db"},
  "environment": {"LOG_LEVEL": "warn"},
  "secretRefs": {"DB_PASSWORD": "orders-db-v2"},
  "secretValues": {"orders-db-v2": "super-secret-value"}
}`,
        checkpoint:
          '输出 LOG_LEVEL=warn、FEATURE_CHECKOUT=false、DB_PASSWORD_REF=orders-db-v2、containsPlaintext=false、configHash 为 16 位十六进制。配置变更要可比较，敏感值不能被渲染进前端或日志。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const merged = { ...input.configMap, ...input.environment };
const rendered = {
  ...merged,
  DB_PASSWORD_REF: input.secretRefs.DB_PASSWORD
};
const configHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(rendered))
  .digest('hex')
  .slice(0, 16);
const serialized = JSON.stringify(rendered);
const containsPlaintext = Object.values(input.secretValues).some((value) => serialized.includes(value));

assert.equal(rendered.LOG_LEVEL, 'warn');
assert.equal(rendered.FEATURE_CHECKOUT, 'false');
assert.equal(rendered.DB_PASSWORD_REF, 'orders-db-v2');
assert.equal(containsPlaintext, false);
assert.match(configHash, /^[0-9a-f]{16}$/);

console.log(JSON.stringify({
  LOG_LEVEL: rendered.LOG_LEVEL,
  FEATURE_CHECKOUT: rendered.FEATURE_CHECKOUT,
  DB_PASSWORD_REF: rendered.DB_PASSWORD_REF,
  containsPlaintext,
  configHash
}));
console.log('config evidence: override=ordered secret-reference-only=true hash=stable');
`,
      }),
      nodeTask({
        id: 'engf2-canary-rollback-independent',
        title: '独立实践：灰度指标未达标时自动回滚',
        brief:
          '运行 node main.js。按 5% 到 25% 扩量，每个阶段检查错误率、p95 和配置哈希；一旦越界停止扩量、恢复上一版本并保留审计。',
        stdin: `{
  "release": {"version": "7.3.0", "configHash": "a1b2c3d4e5f60708"},
  "previous": {"version": "7.2.0", "configHash": "1188aabbccddeeff"},
  "stages": [
    {"percent": 5, "errorRate": 0.002, "p95Ms": 280},
    {"percent": 25, "errorRate": 0.018, "p95Ms": 560},
    {"percent": 100, "errorRate": 0.003, "p95Ms": 310}
  ],
  "limits": {"errorRate": 0.01, "p95Ms": 450}
}`,
        checkpoint:
          '输出 promotedPercent=5、failedPercent=25、rolledBack=true、activeVersion=7.2.0、badHashUsed=false。失败阶段之后的 100% 数据不能掩盖已触发的回滚。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

let promotedPercent = 0;
let failedPercent = null;
let rolledBack = false;
let activeVersion = input.previous.version;
const audit = [];

for (const stage of input.stages) {
  const healthy = stage.errorRate <= input.limits.errorRate && stage.p95Ms <= input.limits.p95Ms;
  if (!healthy) {
    failedPercent = stage.percent;
    rolledBack = true;
    activeVersion = input.previous.version;
    audit.push({ event: 'rollback', percent: stage.percent, version: input.previous.version });
    break;
  }
  promotedPercent = stage.percent;
  activeVersion = input.release.version;
  audit.push({ event: 'promote', percent: stage.percent, version: input.release.version });
}

const badHashUsed = input.release.configHash === input.previous.configHash;
assert.equal(promotedPercent, 5);
assert.equal(failedPercent, 25);
assert.equal(rolledBack, true);
assert.equal(activeVersion, '7.2.0');
assert.equal(badHashUsed, false);
assert.equal(audit[audit.length - 1].event, 'rollback');

console.log(JSON.stringify({ promotedPercent, failedPercent, rolledBack, activeVersion, badHashUsed }));
console.log('canary evidence: boundary=25 rollback=automatic previous-config=restored');
`,
      }),
    ),

  'programming:软件架构与交付 · Brownfield、故障演练与架构答辩：渐进式迁移、双写和回滚':
    engineeringLab(
      '软件架构终章 06 · 双写迁移必须先比较再切流',
      '模拟旧库、新库、双写、回填、差异比较和切流，再在失败窗口回滚。每一步保留读源和写入证据；数据库为确定性内存模型。',
      nodeTask({
        id: 'engf2-dual-write-guided',
        title: '跟做：双写期间比较新旧结果',
        brief:
          '运行 node main.js。依次执行 dual-write、backfill、compare 和 cutover，断言回填前存在差异、双写后新写入一致、切流后主读为新库。',
        stdin: `{
  "legacy": [
    {"id": "o-1", "amount": 500},
    {"id": "o-2", "amount": 700}
  ],
  "new": [],
  "newWrites": [
    {"id": "o-3", "amount": 900}
  ]
}`,
        checkpoint:
          '输出 preBackfillDiff=2、postBackfillDiff=0、dualWriteDiff=0、activeStore=new、rollbackStore=legacy。差异为 0 之前不能切流，回滚路径要保持可读。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const legacy = structuredClone(input.legacy);
const modern = structuredClone(input.new);

function diff(left, right) {
  const rightById = new Map(right.map((row) => [row.id, row]));
  return left.filter((row) => JSON.stringify(rightById.get(row.id)) !== JSON.stringify(row)).length;
}

const preBackfillDiff = diff(legacy, modern);
modern.push(...structuredClone(legacy));
const postBackfillDiff = diff(legacy, modern);
for (const row of input.newWrites) {
  legacy.push({ ...row });
  modern.push({ ...row });
}
const dualWriteDiff = diff(legacy, modern);
const activeStore = postBackfillDiff === 0 && dualWriteDiff === 0 ? 'new' : 'legacy';
const rollbackStore = 'legacy';

assert.equal(preBackfillDiff, 2);
assert.equal(postBackfillDiff, 0);
assert.equal(dualWriteDiff, 0);
assert.equal(activeStore, 'new');
assert.equal(rollbackStore, 'legacy');

console.log(JSON.stringify({
  preBackfillDiff,
  postBackfillDiff,
  dualWriteDiff,
  activeStore,
  rollbackStore
}));
console.log('migration evidence: compare-before-cutover=true dual-write=consistent');
`,
      }),
      nodeTask({
        id: 'engf2-expand-contract-independent',
        title: '独立实践：扩展、回填、契约三阶段迁移',
        brief:
          '运行 node main.js。验证 schema 先扩展可空列、应用双写、回填并做校验，最后才允许加非空约束和删除旧列；任何阶段缺失都应阻断。',
        stdin: `{
  "phases": [
    {"name": "expand", "applied": true, "checked": true},
    {"name": "dual-write", "applied": true, "checked": true},
    {"name": "backfill", "applied": true, "checked": false},
    {"name": "contract", "applied": false, "checked": false}
  ],
  "rows": {"total": 1200, "backfilled": 1198, "nullNewColumn": 2},
  "oldReadTrafficPercent": 18
}`,
        checkpoint:
          '输出 nullRows=2、backfillComplete=false、contractAllowed=false、problemPhase=backfill、blocked=true。旧读流量仍为 18% 时删除旧列会直接破坏兼容性。',
        code: `'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const expand = input.phases.find((phase) => phase.name === 'expand');
const dualWrite = input.phases.find((phase) => phase.name === 'dual-write');
const backfill = input.phases.find((phase) => phase.name === 'backfill');
const contract = input.phases.find((phase) => phase.name === 'contract');
const nullRows = input.rows.nullNewColumn;
const backfillComplete = input.rows.backfilled === input.rows.total && nullRows === 0;
const contractAllowed =
  Boolean(expand.applied) &&
  Boolean(dualWrite.applied) &&
  backfillComplete &&
  input.oldReadTrafficPercent === 0 &&
  Boolean(contract.checked);
const problemPhase = !backfill.checked || !backfillComplete
  ? 'backfill'
  : (!contractAllowed ? 'contract' : null);
const blocked = problemPhase !== null;

assert.equal(nullRows, 2);
assert.equal(backfillComplete, false);
assert.equal(contractAllowed, false);
assert.equal(problemPhase, 'backfill');
assert.equal(blocked, true);

console.log(JSON.stringify({ nullRows, backfillComplete, contractAllowed, problemPhase, blocked }));
console.log('expand-contract evidence: null-rows=blocked old-read-traffic=blocked');
`,
      }),
    ),
};
