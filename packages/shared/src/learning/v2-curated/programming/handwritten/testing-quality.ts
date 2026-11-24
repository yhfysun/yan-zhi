// 测试、调试与工程质量 · 手写教案（Q0–Q5）
// courseName 与 programs.ts 中 `测试与工程质量 · ${stage.title}：${topic}` 完全一致。
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';

const sources = {
  googleSizes: 'Google Testing Blog: Test Sizes. https://testing.googleblog.com/2010/12/test-sizes.html',
  googleBehavior: 'Google Testing Blog: Test Behavior, Not Implementation. https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html',
  practicalPyramid: 'Martin Fowler: The Practical Test Pyramid. https://martinfowler.com/articles/practical-test-pyramid.html',
  vitest: 'Vitest API. https://vitest.dev/api/',
  playwright: 'Playwright Test Documentation. https://playwright.dev/docs/test-intro',
  playwrightAssertions: 'Playwright Assertions. https://playwright.dev/docs/test-assertions',
  junit: 'JUnit 5 User Guide. https://junit.org/junit5/docs/current/user-guide/',
  pytest: 'pytest Documentation. https://docs.pytest.org/',
  fastCheck: 'fast-check Documentation. https://fast-check.dev/docs/introduction/',
  hypothesis: 'Hypothesis Documentation. https://hypothesis.readthedocs.io/',
  stryker: 'Stryker Mutator Documentation. https://stryker-mutator.io/docs/',
  pit: 'PIT Mutation Testing. https://pitest.org/',
  testcontainers: 'Testcontainers Documentation. https://testcontainers.com/guides/',
  postgres: 'PostgreSQL Documentation: Concurrency Control. https://www.postgresql.org/docs/current/transaction-iso.html',
  pact: 'Pact Documentation. https://docs.pact.io/',
  kafka: 'Apache Kafka Documentation. https://kafka.apache.org/documentation/',
  rabbitmq: 'RabbitMQ Documentation. https://www.rabbitmq.com/docs',
  testingLibrary: 'Testing Library Documentation. https://testing-library.com/docs/',
  wcag: 'W3C Web Content Accessibility Guidelines. https://www.w3.org/WAI/WCAG22/Understanding/',
  axe: 'axe-core Documentation. https://github.com/dequelabs/axe-core',
  k6: 'Grafana k6 Documentation. https://grafana.com/docs/k6/latest/',
  wstg: 'OWASP Web Security Testing Guide. https://owasp.org/www-project-web-security-testing-guide/',
  asvs: 'OWASP Application Security Verification Standard. https://owasp.org/www-project-application-security-verification-standard/',
  chaos: 'Principles of Chaos Engineering. https://principlesofchaos.org/',
  githubActions: 'GitHub Actions Documentation. https://docs.github.com/en/actions',
  opentelemetry: 'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
} as const;

type TestingExampleSpec = readonly [
  title: string,
  language: string,
  code: string,
  output: string,
];

function withTestingExamples(
  courses: readonly ProgrammingCourseSeed[],
  examplesByCourse: readonly (readonly TestingExampleSpec[])[],
): readonly ProgrammingCourseSeed[] {
  if (examplesByCourse.length !== courses.length) {
    throw new Error(`testing-quality example course count: ${examplesByCourse.length} != ${courses.length}`);
  }
  return courses.map((course, courseIndex) => {
    const examples = examplesByCourse[courseIndex];
    if (!examples || examples.length !== course.steps.length) {
      throw new Error(`${course.name} example count must match its step count`);
    }
    return {
      ...course,
      steps: course.steps.map(([title, body, note], stepIndex) => {
        const [exampleTitle, language, code, output] = examples[stepIndex]!;
        return [title, body, note, { title: exampleTitle, language, code, output }] as const;
      }),
    };
  });
}

// ── Q0 测试思维、可观察行为与第一组测试 ─────────────────────────────────────
const q0Stage = '测试思维、可观察行为与第一组测试';
const q0Name = (topic: string) => `测试与工程质量 · ${q0Stage}：${topic}`;

const q0Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['风险账本缺少恢复成本时让门禁失败', 'PowerShell', `@'
[
  {"id":"PRICE-01","loss":"金额舍入","probability":"high","impact":5000,"layer":"unit","recovery":500},
  {"id":"TENANT-02","loss":"跨租户读取","probability":"low","impact":500000,"layer":"integration"}
]
'@ | Set-Content artifacts/risk-matrix.json
node -e "const rows=require('./artifacts/risk-matrix.json'); const bad=rows.filter(r=>!r.layer||!r.recovery); console.log(rows.map(r=>r.id+':'+r.layer).join(' ')); if(bad.length) process.exit(1)"
Write-Output "mandatory_fields=$LASTEXITCODE"`, `PRICE-01:unit TENANT-02:integration
mandatory_fields=1

第二行缺少 recovery，脚本用非零退出码阻止不完整风险账本。`],
    ['三种测试尺寸分别计时', 'PowerShell', `pnpm exec vitest run tests/unit --reporter=json --outputFile=artifacts/unit.json
pnpm exec pytest -m integration --junitxml=artifacts/integration.xml
pnpm exec playwright test tests/e2e/checkout.spec.ts --reporter=json
node -e "for(const f of ['unit','integration']){const r=require('./artifacts/'+f+'.json'); console.log(f, r.numTotalTests, r.startTime)}"`, `unit 18 1763984000123
integration 4 1763984019210
1 passed (2.8s)

small 用例批量启动，medium 只保留数据库链路，large 只保留一条真实支付流程。`],
    ['风险编号到测试标题逐项映射', 'TypeScript', `import { describe, expect, it } from 'vitest';
const coverage = [
  ['PRICE-01', 'unit', 'rounds tax before currency conversion'],
  ['TENANT-02', 'integration', 'rejects another tenant order id'],
  ['PAY-03', 'e2e', 'keeps order unpaid after card decline'],
] as const;
describe('risk map', () => {
  it.each(coverage)('%s lives in %s', (_id, layer, title) => {
    expect(['unit', 'integration', 'e2e']).toContain(layer);
    expect(title.length).toBeGreaterThan(10);
  });
});`, `Test Files  1 passed (1)
Tests       3 passed (3)

每个风险编号都落到一个明确测试层和可搜索的测试标题。`],
    ['故意删除折扣上限后运行防线测试', 'PowerShell', `Copy-Item src/pricing.ts artifacts/pricing.ts.bak
(Get-Content src/pricing.ts -Raw).Replace('Math.min(discount, 100)', 'discount') | Set-Content src/pricing.ts
pnpm exec vitest run tests/pricing.test.ts --reporter=verbose
$exitCode = $LASTEXITCODE
Copy-Item artifacts/pricing.ts.bak src/pricing.ts
Write-Output "mutation_exit=$exitCode restored=1"`, `× rejects discounts above the configured maximum
AssertionError: expected 180 to be less than or equal to 100
mutation_exit=1 restored=1

测试在变异版本上变红，恢复源码后同一用例可再次通过。`],
    ['PR 只跑快速层并上传统一报告', 'GitHub Actions YAML', `name: quality
on: pull_request
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec vitest run tests/unit --reporter=junit --outputFile=unit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-report
          path: unit.xml`, `unit  job completed in 41s
artifact unit-report uploaded
unit.xml  tests="18" failures="0" skipped="0"

PR 门禁保持分钟级反馈，容器与真实浏览器检查留给主干或夜间。`],
  ],
  [
    ['把可访问按钮契约写成测试', 'TSX · Vitest', `import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CheckoutButton } from './CheckoutButton';

it('submits a payable order from the visible action', async () => {
  const onSubmit = vi.fn();
  render(<CheckoutButton status="payable" onSubmit={onSubmit} />);
  await screen.getByRole('button', { name: '提交订单' }).click();
  expect(onSubmit).toHaveBeenCalledOnce();
});`, `Test Files  1 passed (1)
Tests       1 passed (1)
Duration    312ms

断言使用角色、可访问名称和公开回调，没有引用 CSS class 或组件内部 state。`],
    ['角色查询在样式重构后仍通过', 'TSX · Testing Library', `import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { CouponForm } from './CouponForm';

test('keeps an accessible coupon input', () => {
  render(<CouponForm busy={false} />);
  expect(screen.getByRole('textbox', { name: '优惠券代码' })).toBeVisible();
  expect(screen.getByRole('button', { name: '应用优惠券' })).toBeEnabled();
});`, `✓ keeps an accessible coupon input
Test Files  1 passed (1)
Tests       1 passed (1)

把 CouponForm 的 wrapper class 改名后测试仍为绿，说明查询依赖的是用户语义。`],
    ['金额服务断言公开结果而非私有舍入函数', 'TypeScript · Vitest', `import { describe, expect, it } from 'vitest';
import { checkout } from './checkout';

describe('checkout observable result', () => {
  it('returns cents and a rejected coupon reason', () => {
    const result = checkout({ items: [{ cents: 1000, quantity: 1 }], coupon: 'EXPIRED' });
    expect(result).toEqual({ totalCents: 1000, couponStatus: 'rejected', discountCents: 0 });
  });
});`, `✓ checkout observable result > returns cents and a rejected coupon reason
Test Files  1 passed (1)
Tests       1 passed (1)

测试没有断言 roundMoney 的调用次数，内部重命名不会造成假失败。`],
    ['内部重构与库存校验回归做对照', 'PowerShell', `(Get-Content src/render.tsx -Raw).Replace('renderCouponForm', 'renderPromotionForm') | Set-Content src/render.tsx
pnpm exec vitest run tests/order-form.test.tsx
Write-Output "refactor_exit=$LASTEXITCODE"
(Get-Content src/inventory.ts -Raw).Replace('if (stock < quantity) throw new OutOfStock()', '') | Set-Content src/inventory.ts
pnpm exec vitest run tests/checkout.test.ts
Write-Output "behavior_exit=$LASTEXITCODE"`, `refactor_exit=0
× checkout rejects an order when stock is insufficient
behavior_exit=1

内部命名变化保持绿色，删除真实库存校验后测试变红，证明契约断言有效。`],
    ['支付前禁止触发短信副作用', 'TypeScript · Vitest', `import { expect, it, vi } from 'vitest';
import { refund } from './refund';

it('does not notify the customer when authorization fails', async () => {
  const sms = { send: vi.fn() };
  const result = await refund({ orderId: 'o-42', amount: 900 }, {
    authorize: async () => ({ ok: false, code: 'DECLINED' }),
    sms,
  });
  expect(result).toEqual({ status: 'rejected', code: 'DECLINED' });
  expect(sms.send).not.toHaveBeenCalled();
});`, `✓ does not notify the customer when authorization fails
Test Files  1 passed (1)
Tests       1 passed (1)

短信调用是资金协议中的不可逆副作用，因此这里保留交互断言并在测试名说明原因。`],
  ],
  [
    ['创建会议同时断言响应和数据库', 'Python · pytest', `def test_create_meeting_persists_active_row(api, db):
    response = api.post("/meetings", json={
        "title": "Release review",
        "startsAt": "2026-05-01T10:00:00Z",
        "durationMinutes": 30,
    })
    assert response.status_code == 201
    assert response.json()["status"] == "ACTIVE"
    row = db.one("select status, title from meetings where id = ?", response.json()["id"])
    assert row == ("ACTIVE", "Release review")`, `collected 1 item
tests/test_meeting.py .                                             [100%]
1 passed in 0.18s

只看到 201 不足以证明成功，数据库行也必须与响应属于同一订单。`],
    ['会议时长在阈值两侧各取一点', 'Python · pytest', `import pytest
@pytest.mark.parametrize("minutes,status", [(14, 400), (15, 201), (16, 400)])
def test_meeting_duration_boundary(api, minutes, status):
    response = api.post("/meetings", json={"title": "Boundary", "durationMinutes": minutes})
    assert response.status_code == status, response.text
    if status == 201:
        assert response.json()["durationMinutes"] == 15`, `tests/test_meeting.py ...                                       [100%]
3 passed in 0.21s

参数表同时覆盖阈值前一位、阈值本身和后一位，失败时会显示具体 minutes。`],
    ['重复时间段返回稳定冲突契约', 'PowerShell · curl', `$body = @{ title = 'Review'; startsAt = '2026-05-01T10:00:00Z'; durationMinutes = 30 } | ConvertTo-Json
$first = Invoke-WebRequest -Method Post -Uri http://localhost:8080/meetings -Body $body -ContentType 'application/json' -SkipHttpErrorCheck
$second = Invoke-WebRequest -Method Post -Uri http://localhost:8080/meetings -Body $body -ContentType 'application/json' -SkipHttpErrorCheck
Write-Output "first=$($first.StatusCode) second=$($second.StatusCode)"
$second.Content`, `first=201 second=409
{"code":"MEETING_CONFLICT","message":"time slot already booked","traceId":"trace-8f21"}

错误响应包含稳定业务码、可读消息和 traceId，不泄露数据库约束名。`],
    ['支付超时后验证库存补偿', 'Python · pytest', `def test_payment_timeout_releases_reserved_stock(db, checkout, broken_payment):
    db.execute("insert into stock(sku, available) values ('A-1', 2)")
    response = checkout(sku="A-1", quantity=1, payment=broken_payment.timeout)
    assert response.status_code == 503
    assert db.scalar("select available from stock where sku='A-1'") == 2
    assert db.scalar("select state from orders where sku='A-1'") == "PAYMENT_PENDING"


def test_payment_recovers_after_retry(db, checkout, broken_payment):
    broken_payment.fail_once("PAYMENT_TIMEOUT")
    response = checkout(sku="A-1", quantity=1, payment=broken_payment.retry_once)
    assert response.status_code == 201
    assert db.scalar("select available from stock where sku='A-1'") == 1`, `tests/test_checkout_recovery.py ..                               [100%]
2 passed in 0.64s

一次失败回到可用库存，一次可恢复重试成功扣减，两个结果都可独立重放。`],
    ['四象限报告拒绝空白分类', 'PowerShell', `@'
<testsuite tests="4" failures="0">
  <testcase classname="meeting.normal" name="creates valid meeting"/>
  <testcase classname="meeting.boundary" name="duration 15"/>
  <testcase classname="meeting.error" name="duplicate returns 409"/>
</testsuite>
'@ | Set-Content artifacts/results.xml
$xml = [xml](Get-Content artifacts/results.xml)
$classes = $xml.testsuite.testcase.classname
$missing = 'normal','boundary','error','recovery' | Where-Object { $classes -notlike "meeting.$_*" }
Write-Output "missing=$($missing -join ',')"
if ($missing) { exit 1 }`, `missing=recovery
exit=1

报告虽然显示 4 条通过，但恢复测试为空，质量脚本不会把它误判为四象限完成。`],
  ],
  [
    ['Arrange 只构造固定时钟和过期订阅', 'TypeScript · Vitest', `import { beforeEach, expect, it } from 'vitest';
let billing: BillingService;
let clock: FakeClock;
beforeEach(() => {
  clock = new FakeClock('2026-01-31T23:59:59Z');
  billing = new BillingService(new MemoryRepo([{ id: 42, trialEndsAt: '2026-01-31T23:59:59Z' }]), clock);
});
it('trial_endsAtDeadline_staysActive', () => {
  expect(billing.status(42)).toBe('active');
});`, `✓ trial_endsAtDeadline_staysActive
Test Files  1 passed (1)
Tests       1 passed (1)

Arrange 固定了时钟和初始仓储，没有提前执行 renew，也没有读取机器当前时间。`],
    ['每次动作只发一次续费请求', 'Python · pytest', `def test_renew_triggers_one_subscription_request(client, payment_spy):
    response = client.post("/subscriptions/42/renew", headers={"Idempotency-Key": "renew-42-1"})
    assert response.status_code == 202
    assert payment_spy.calls == [{"subscriptionId": 42, "amountCents": 1900}]

def test_repeated_renew_is_idempotent(client, payment_spy):
    headers = {"Idempotency-Key": "renew-42-2"}
    first = client.post("/subscriptions/42/renew", headers=headers)
    second = client.post("/subscriptions/42/renew", headers=headers)
    assert first.status_code == second.status_code == 202
    assert len(payment_spy.calls) == 1`, `tests/test_renew.py ..                                           [100%]
2 passed in 0.29s

单次触发与重复回调由两个测试表达，失败时能直接判断是首次请求还是幂等逻辑。`],
    ['续费响应、持久化与收据事件同时成立', 'Python · pytest', `def test_renew_observes_response_database_and_event(client, db, receipts):
    response = client.post("/subscriptions/42/renew", json={"paymentToken": "tok_visa"})
    assert response.status_code == 200
    assert response.json() == {"status": "active", "renewedAt": "2026-02-01T00:00:00Z"}
    row = db.one("select status, renewed_at from subscriptions where id = 42")
    assert row == ("active", "2026-02-01T00:00:00Z")
    assert receipts.only().event == "subscription.renewed"`, `tests/test_renew_effects.py .                                   [100%]
1 passed in 0.31s

响应、数据库和 fake 收据队列分别证明公开结果与副作用，而不是只看没有异常。`],
    ['用业务场景筛选单条边界测试', 'PowerShell', `pnpm exec pytest tests/test_billing.py -k trial_endsAtDeadline -vv
pnpm exec vitest run tests/billing.test.ts -t "trial_endsAtDeadline"
Write-Output "pytest=$LASTEXITCODE vitest=$LASTEXITCODE"`, `tests/test_billing.py::test_trial_endsAtDeadline_staysActive PASSED [100%]
✓ billing.test.ts > trial_endsAtDeadline_staysActive
pytest=0 vitest=0

测试名称直接包含场景和期望结果，报告可以按边界条件准确筛选。`],
    ['乱序运行暴露共享余额污染', 'PowerShell', `pnpm exec vitest run tests/billing.test.ts --sequence.shuffle --sequence.seed=42
pnpm exec vitest run tests/billing.test.ts --sequence.shuffle --sequence.seed=7
Write-Output "seed42=$LASTEXITCODE seed7=$LASTEXITCODE"`, `seed42=1
× renew_whenCardExpires_keepsPaymentPending
expected 80 to be 100 because previous test reused the shared balance
seed7=0

同一测试换种子后结果变化，证明存在顺序依赖；修复应让每个用例创建自己的余额。`],
  ],
  [
    ['退款结果按业务字段做对象断言', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { refund } from './refund';

it('refunds the full order without losing ledger identity', () => {
  const result = refund({ orderId: 'o-42', amountCents: 2500, reason: 'damaged' });
  expect(result).toEqual({
    status: 'refunded',
    refundedCents: 2500,
    ledgerEntryId: expect.stringMatching(/^ledger-/),
  });
});`, `✓ refunds the full order without losing ledger identity
Test Files  1 passed (1)
Tests       1 passed (1)

断言覆盖状态、金额和账本标识；金额为 0 或超过原订单时另有独立边界用例。`],
    ['失败消息携带订单与租户编号', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { calculateInvoice } from './invoice';

it('shows the business key when invoice cents differ', () => {
  const invoice = { id: 'inv-7', tenantId: 'tenant-a', lines: [{ cents: 1200 }] };
  expect(calculateInvoice(invoice), 'invoice=inv-7 tenant=tenant-a').toMatchObject({
    totalCents: 1200,
    currency: 'CNY',
  });
});`, `× shows the business key when invoice cents differ
AssertionError: invoice=inv-7 tenant=tenant-a: expected { totalCents: 0, ... } to match object

值班者无需打开源码即可知道失败对象是 inv-7，并看到实际金额。`],
    ['收紧过宽的任意对象匹配', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
type AuditEvent = { action: string; actorId: string; targetId: string; traceId: string };
const event: AuditEvent = { action: 'refund', actorId: 'u-3', targetId: 'o-42', traceId: 'tr-9' };

it('keeps stable audit fields explicit', () => {
  expect(event).toMatchObject({ action: 'refund', actorId: 'u-3', targetId: 'o-42' });
  expect(event.traceId).toMatch(/^tr-[0-9]+$/);
});`, `✓ keeps stable audit fields explicit
Test Files  1 passed (1)
Tests       1 passed (1)

删除 action 或 targetId 会让测试失败；只有 traceId 因运行期变化使用受控正则。`],
    ['失败摘要先展示参数再展示堆栈', 'PowerShell · pytest', `pnpm exec pytest tests/test_billing.py::test_invoice_boundary -vv --tb=short --no-header
Write-Output "exit=$LASTEXITCODE"`, `________________________ test_invoice_boundary[coupon-expired] ________________________
invoice_id = 'inv-19', tenant_id = 'tenant-a', cents = 1299
>       assert total == 1299
E       AssertionError: expected 1399, input={'coupon':'EXPIRED'}
short test summary info
FAILED tests/test_billing.py::test_invoice_boundary[coupon-expired]
exit=1

inv-19 和 coupon-expired 出现在堆栈前，评审无需翻 JSON 就能定位输入。`],
    ['Stryker 报告未捕获的金额变异', 'PowerShell', `pnpm exec stryker run --mutate "src/pricing.ts:1-40" --reporters clear-text,json --jsonReporter.fileName artifacts/mutation.json
$report = Get-Content artifacts/mutation.json -Raw | ConvertFrom-Json
$survived = $report.files.'src/pricing.ts'.mutants | Where-Object status -eq 'Survived'
$survived | ForEach-Object { Write-Output "$($_.mutatorName) line=$($_.location.start.line)" }`, `ConditionalExpression line=18
ArithmeticOperator line=22
survived=2 score=72.50%

两个变异体没有让测试失败，说明 discount > 100 与金额加法仍缺少精确断言。`],
  ],
  [
    ['把线上舍入现象缩成三条回归输入', 'TypeScript · Vitest', `import { expect, test } from 'vitest';
import { lineTotal } from './pricing';

test.each([
  { priceCents: 1998, quantity: 3, expected: 5994 },
  { priceCents: 1999, quantity: 3, expected: 5997 },
  { priceCents: 2000, quantity: 3, expected: 6000 },
])('regression: price=$priceCents quantity=$quantity', ({ priceCents, quantity, expected }) => {
  expect(lineTotal(priceCents, quantity)).toBe(expected);
});`, `✓ regression: price=1999 quantity=3
✓ regression: price=2000 quantity=3
Test Files  1 passed (1)
Tests       3 passed (3)

输入保留线上值并加上前后相邻值，避免修复只命中单个价格。`],
    ['在旧提交上保存稳定的红灯', 'PowerShell · Git worktree', `git worktree add ../bug-baseline a13f9c2
Push-Location ../bug-baseline
pnpm install --frozen-lockfile
pnpm exec vitest run tests/pricing-regression.test.ts --reporter=verbose
$exitCode = $LASTEXITCODE
Pop-Location
Write-Output "baseline_exit=$exitCode commit=$((git rev-parse --short HEAD))"`, `× regression: price=1999 quantity=3
expected 5997 but received 5994
baseline_exit=1 commit=a13f9c2

失败来自旧版本的业务断言，并能与提交哈希和锁文件一起归档。`],
    ['修复差异只触及最小货币单位计算', 'PowerShell · Git', `git diff -- src/pricing.ts | Set-Content artifacts/pricing-fix.diff
pnpm exec vitest run tests/pricing-regression.test.ts
git diff --stat
Write-Output "test_exit=$LASTEXITCODE"`, `✓ regression: price=1998 quantity=3
✓ regression: price=1999 quantity=3
✓ regression: price=2000 quantity=3
 src/pricing.ts | 4 ++--
test_exit=0

修复只把乘法前的元转换改为分运算，测试和一些正常值共同证明没有引入无关行为变化。`],
    ['冷缓存下跑完整套件与类型检查', 'PowerShell', `Remove-Item -Recurse -Force node_modules/.vite,dist -ErrorAction SilentlyContinue
pnpm --filter @yan-zhi/shared test
$testExit = $LASTEXITCODE
pnpm --filter @yan-zhi/shared typecheck
$typeExit = $LASTEXITCODE
Write-Output "tests=$testExit typecheck=$typeExit"`, `Test Files  214 passed (214)
Tests       1480 passed (1480)
tsc --noEmit completed
tests=0 typecheck=0

第二次使用缓存复跑仍应通过；冷启动结果证明依赖和生成产物没有掩盖问题。`],
    ['回归文件列入 PR 必需检查', 'PowerShell · GitHub CLI', `@'
name: regression
on: pull_request
jobs:
  pricing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec vitest run tests/pricing-regression.test.ts --reporter=junit --outputFile=artifacts/regression.xml
'@ | Set-Content .github/workflows/pricing-regression.yml
gh workflow view pricing-regression.yml
gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks`, `pricing-regression.yml  active
required checks: [unit, integration, pricing]
last run: success  1m 12s

工作流存在且 required checks 包含 pricing，才能证明回归用例真正阻断合并。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q0_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q0Name('测试目标、风险和测试金字塔'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已完成一个包含纯函数、HTTP 接口和持久化调用的基础项目，能读懂测试失败堆栈。',
    goal: '能把业务风险映射到单元、集成和端到端测试，解释测试金字塔为何按反馈速度与真实度分层，并为一次价格校验改动划出每层必须证明的行为。',
    guidedPractice: '为同一订单金额校验列出金额格式、折扣边界、租户隔离和支付失败四类风险，分别安排 Vitest 单元测试、带数据库的集成测试与 Playwright 支付路径；运行 `npx vitest run --reporter=json --outputFile=artifacts/vitest.json`，检查每层用例数量与耗时，故意把折扣上限写成 100%，观察断言失败时 expected 与 received 的差异。',
    independentPractice: '给一项准备上线的退款规则建立风险表，为纯计算、仓储事务和浏览器确认页各写至少一个用例；提交测试报告、失败输出、用例到风险的映射和一次修复前后的耗时对比。',
    commonErrors: [
      '把测试金字塔理解成固定比例，为了数字删除关键集成测试，却没有按故障模式和反馈成本解释取舍。',
      '所有场景都塞进浏览器端到端测试，单一选择器变化造成大片红灯，失败后无法判断是业务、接口还是页面问题。',
    ],
    sourceRefs: [sources.googleSizes, sources.practicalPyramid, sources.vitest],
    steps: [
      ['从故障损失划分风险', '测试范围先由故障损失决定：算错一分钱属于高概率核心逻辑，跨租户读到订单属于高风险权限问题，支付页按钮失效属于高可见用户流程。用风险表记录发生概率、影响面、可检测层和恢复成本，再选择测试尺寸；`npx vitest run --coverage` 只提供覆盖信息，不能替代损失判断。边界应包括零金额、最大折扣和已退款订单，失败时要保留断言差值、提交哈希和复现命令，作为后续分层证据。', '先写故障后果，再选用例尺寸'],
      ['认识三种测试尺寸', 'Google 的 small、medium、large 分类关注资源边界：small 不访问网络和真实数据库，medium 可连接本机服务，large 才覆盖真实浏览器与跨进程链路。执行 `vitest run tests/unit`、`pytest -m integration` 和 `npx playwright test` 时分别记录启动时间；若 small 测试等待端口或读写共享目录，说明边界已经泄漏。失败日志要保存所用配置、镜像版本和首条错误，证据目录才能支持他人按同一命令重放。', '尺寸由资源和进程边界定义'],
      ['画出风险到测试层', '把每项业务规则画成输入、状态变化和可观察输出，再连接最便宜的检测层：金额舍入停留在纯函数，唯一索引冲突放到数据库集成，登录跳转放到 Playwright。用 `it.each` 给同一规则准备正常值与临界值，并在测试清单里写明为何不放在更高层；若预期 HTTP 409 却收到 200，应保留请求体、响应头和服务日志。最终证据包含风险编号、测试文件、失败摘要和固定环境版本，能说明每一层各自的防线；边界值要按规则取值，证据还要与风险矩阵编号一一对应。', '每层只为对应风险负责'],
      ['用故障演练暴露空洞', '在分支副本中故意移除折扣上限校验、把数据库事务改成自动提交，再运行对应测试层，确认单元与集成测试是否真正拦截。命令可写为 `git diff > artifacts/mutation.patch` 后执行 `npx vitest run`，失败报告要指出哪个断言观察到异常，而不是只在控制台看到 exit code 1。边界覆盖负数、上限加一和并发提交，恢复代码后重跑同一命令；保存补丁、报告和前后结果，证明测试确实对真实缺陷有反应。', '能抓住故意缺陷才算防线'],
      ['把分层写进交付门禁', 'PR 阶段运行快速单元测试，主干运行容器集成测试，发布前运行关键 Playwright 流程，各层用 `--reporter=junit` 输出统一工件。为每层设最大耗时和失败重试规则，超过阈值时先定位慢依赖而不是无限增加超时；遇到基础设施失败要标记环境错误，避免误报业务回归。边界同时考虑空测试集、服务未就绪和报告上传失败，失败信息应链接到具体 job 与工件。最终留存风险矩阵、分层配置、运行时长和一次真实缺陷捕获记录。', '门禁速度与真实度一起设计'],
    ],
  },
  {
    name: q0Name('行为断言与实现细节'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能使用 Vitest 或 JUnit 编写基本断言，并理解组件、函数和 HTTP 响应之间的关系。',
    goal: '能区分用户可观察行为与内部实现细节，使用角色、返回值、状态和协议字段编写抗重构测试，同时知道何时必须对关键调用顺序做有限验证。',
    guidedPractice: '拿一个按钮组件和一个折扣服务，把测试从查询内部 class 名改为 `screen.getByRole("button", { name: "提交订单" })`，把 mock 私有 helper 改为断言返回的订单状态与公开事件。故意重命名 CSS 类并调整内部函数名，确认行为测试仍为绿色；再移除 disabled 条件，读取 Testing Library 输出的可访问树和失败断言。',
    independentPractice: '选择一个已有测试，列出其中三个实现耦合点并逐项改写；完成一次内部重构而测试不改，另做一次真实行为回归而测试变红，提交两轮报告和差异说明。',
    commonErrors: [
      '用 CSS 类、组件 state 或私有方法调用次数代替用户结果，导致重构时测试全面失败，真正行为破坏却仍可能漏掉。',
      '完全不验证任何交互边界，把第三方支付调用是否发生也当成实现细节，结果无法证明资金请求在失败时被阻止。',
    ],
    sourceRefs: [sources.googleBehavior, sources.testingLibrary, sources.vitest],
    steps: [
      ['定义可观察契约', '可观察契约包括返回值、抛出错误、公开事件、持久化状态和用户可见界面，私有变量与 helper 名称不属于契约。先写一句 `Given 已登录用户，When 提交无效优惠券，Then 页面显示错误且订单保持未支付`，再把它翻译成公开 API 断言；Testing Library 用 `getByRole` 查找控件，Vitest 用 `expect(result).toEqual` 检查值。边界要有空输入、重复点击和未登录状态，失败时保留可访问树与 React 错误栈，证据由断言快照和测试命令共同构成。', '契约必须能从外部观察'],
      ['用角色和文本查询界面', 'Testing Library 优先按角色、可访问名称和标签查询，因为这条路径接近辅助技术与真实用户；`getByRole("button", { name: /提交/ })` 比 `.submit-btn` 更能抵抗样式重构。运行 `npx vitest run tests/order-form.test.tsx` 时若找不到角色，失败会打印当前 DOM 结构，可据此判断是名称缺失还是元素被隐藏。边界包括重复文本和加载态，证据应保存测试名称、可访问名称和失败 DOM，而不是只截图一个局部。', '查询路径要接近用户语义'],
      ['验证输出而非私有实现', '服务测试应对公开方法传入订单与优惠券，再断言返回状态、金额和错误码；`expect(result.total).toBe(9000)` 与 `expect(result.status).toBe("rejected")` 描述业务结果，`expect(service.privateRound).toHaveBeenCalled()` 则把内部结构锁死。允许在安全、日志和外部副作用上有契约约束，但应验证协议字段或数据库记录。边界要包含最大金额和重复请求，失败报告中的 expected/received 必须能指向业务差异，证据附上原始输入和固定 locale，避免浮点格式误判。', '断言落点决定重构成本'],
      ['为重构做一次反向验证', '复制测试后重命名组件内部函数、拆分渲染节点、改变缓存键，再运行同一命令，行为测试应继续通过；随后删除服务端的库存校验，测试必须变红并指出库存不足结果。若两次结果都不变，说明测试没有绑定关键链路；若重构也失败，说明仍依赖实现。边界覆盖空库存和并发扣减，保存两次 git diff、命令输出与断言变化，这组对照就是测试抗噪能力的证据；可用 `npx vitest run --sequence.shuffle` 再验证一次顺序独立性。', '内部变结构，外部变行为'],
      ['处理必要的交互验证', '有时必须验证调用，例如支付前不能调用短信服务、审计事件必须写入；这时用 `expect(payment.authorize).not.toHaveBeenCalled()` 约束可观察协议，并在测试名中写清原因。为调用次数设边界：零次、一次、失败重试一次，避免把实现偶然次数固化；失败信息要展示调用参数和原始异常，证据保存 mock 调用表与业务输出。每次增加交互断言前先判断是否存在用户可见或数据可见的替代断言，保持测试对合理重构开放。', '只锁安全与协议必需的交互'],
    ],
  },
  {
    name: q0Name('正常、边界、错误和恢复'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '已能编写基础单元测试，并能在 HTTP 接口或命令行程序里观察成功与错误响应。',
    goal: '能围绕一项业务能力设计正常、边界、错误和恢复四类用例，验证系统在无效输入与依赖故障后仍返回明确结果，并能把失败复现成固定证据。',
    guidedPractice: '为创建会议功能准备四类输入：合法时间段、开始等于结束、结束早于开始、数据库唯一键冲突。用 `it.each` 运行服务测试，分别检查 201、400、409 和回滚后无残留记录；制造第二次提交失败，读取数据库查询结果和 HTTP 响应，保存命令、请求体、响应头与事务日志。',
    independentPractice: '为一个库存扣减接口补齐四类测试，并额外加入超时恢复场景；要求测试结束后能断言库存、订单和幂等记录的状态，提交全部失败输出与修复前后报告。',
    commonErrors: [
      '只写快乐路径，把空字符串、最大长度和重复提交都留给线上发现，错误响应也没有稳定结构。',
      '错误测试只断言抛异常，不检查资源是否释放或状态是否回滚，导致失败后数据库留下半完成数据。',
    ],
    sourceRefs: [sources.practicalPyramid, sources.pytest, sources.junit],
    steps: [
      ['正常路径先定义结果', '正常用例要明确前置状态、合法输入、公开输出和持久化结果，例如创建会议返回 201、Location 头与数据库中一条 ACTIVE 记录。用 `pytest -q tests/test_meeting.py::test_create_valid_meeting` 或 `./gradlew test --tests "*Meeting*"` 执行，断言状态码、响应字段和仓储查询结果；边界至少包含最短与最长标题。失败时读取断言值与响应体，证据保存固定时区、数据库版本和完整请求，避免只凭界面显示判断成功。', '成功必须同时验证响应与落库'],
      ['边界值要贴近规则', '边界不只测试 0 和 1，而是围绕业务阈值取前一位、阈值本身和后一位：会议时长 14、15、16 分钟，标题 1、80、81 个字符，分页偏移刚好越界。使用 `it.each([[14, true], [15, true], [16, false]])` 或 `@ParameterizedTest` 生成表格，失败报告应显示具体行参数。保存参数表、随机种子和环境变量，边界证据要能复现同一值；若框架只输出整体失败，应给每行命名或增加独立说明。', '阈值前后各取一个点'],
      ['错误路径检查契约', '错误测试要覆盖格式错误、业务冲突和依赖异常，例如 `POST /meetings` 缺字段返回 400 与字段级 detail，时间段冲突返回 409，数据库断开返回 503 且不泄露 SQL。命令可用 `curl -i -X POST` 保留状态码和响应头，测试里用 `expect(response.json()).toEqual` 校验稳定错误码。边界包括空 body、重复键和超长嵌套字段，失败输出要保存 traceId 与服务日志；只看到 500 而没有错误分类，说明错误契约和观测证据都不足。', '错误码、消息和日志要对齐'],
      ['恢复路径验证副作用', '恢复用例先让事务写入一半或让库存已扣减，再让支付调用超时，验证补偿任务恢复库存、订单回到待支付并释放幂等锁。可用 `toxiproxy` 注入 2 秒延迟或把数据库连接指向关闭端口，执行测试后查询库存、支付流水和任务表；边界是超时刚好等于和超过阈值。失败时要记录补偿任务退出码、重试次数与残留行，证据包含故障注入配置、前后状态快照和修复命令，才能证明恢复不是偶然。', '失败后状态必须可解释'],
      ['形成四象限报告', '把每个功能用例标为正常、边界、错误、恢复四栏，用 `--junitxml=artifacts/results.xml` 汇总，并检查是否有缺失象限。为每类设独立预期：正常关注业务结果，边界关注意外放行，错误关注契约，恢复关注资源与状态；若某栏只有接口 200，报告不完整。边界还要覆盖测试数据残留和重复运行，最终保存参数表、失败样本、修复提交、前后数据库快照，他人按报告命令即可重放四类场景。', '报告要展示四类覆盖而非总数'],
    ],
  },
  {
    name: q0Name('AAA 结构与测试命名'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能读懂测试函数体，并知道断言失败时如何定位被测函数和输入数据。',
    goal: '能用 Arrange、Act、Assert 划分测试准备、动作与观察，写出从名称即可理解场景和期望结果的测试，并避免共享状态把失败归因变复杂。',
    guidedPractice: '把一个同时创建用户、发送邮件、断言响应和清理数据库的长测试拆成三段，将对象构造放入 helper，动作只保留一次 API 调用，断言同时检查响应的 userId 与数据库记录。运行 `npx vitest run tests/user-register.test.ts --reporter=verbose`，故意让邮件模板抛错，观察失败行是否仍直接指向 `sendWelcomeMail`。',
    independentPractice: '为一个订阅续费函数写五个命名清晰的 AAA 测试，覆盖试用、正常续费、卡片过期、重复回调和时钟边界；提交命名清单、失败输出和每个 Arrange 使用的固定时钟说明。',
    commonErrors: [
      '把准备、动作和断言混在多段循环中，失败时无法判断是夹具构造问题还是业务动作错误。',
      '测试名只写 `test1` 或 `should work`，报告里出现十个同类失败时，无法从名称看出业务场景与预期。',
    ],
    sourceRefs: [sources.junit, sources.pytest, sources.vitest],
    steps: [
      ['准备阶段只造前置条件', 'Arrange 负责构造被测对象、固定时钟、用户权限和外部依赖返回值，不在这里提前调用被测动作。例如先创建 `FakeClock("2026-01-31T23:59:59Z")`、已过期订阅和内存仓储，再用 `new BillingService(...)` 组装；为每个输入设置最小差异，边界可采用试用最后一秒与过期第一秒。准备失败通常表现为 setup 异常，日志要区分 fixture 与断言错误。保存确定性种子和时区，证据使用 `--reporter=verbose` 输出，让读者看到每条前置数据。', '准备阶段不包含业务动作'],
      ['动作阶段保持单一触发', 'Act 应执行一次公开行为，例如 `POST /subscriptions/42/renew` 或 `billing.renew(subscriptionId)`，中间不插入日志断言和额外状态修改。若测试需要模拟重复回调，应把第二次 HTTP 请求作为独立用例，而不是在一次 Act 中连续调用两次。边界要覆盖同一支付回调重复到达，失败时记录请求 ID、响应码和首次调用时间；保存网络日志与动作耗时，证据才能说明究竟是第一次还是第二次触发产生了错误。', '一次动作只承载一个意图'],
      ['断言阶段观察公开结果', 'Assert 同时关注直接输出与持久化结果，如响应中的 `status="active"`、数据库的 `renewedAt`、发送的一次收据事件；断言失败时框架会展示 expected/received，避免只检查没有抛异常。为时间字段留出明确等值边界，使用固定时钟而不是 `Date.now()`。若需要验证外部邮件，优先检查 fake 中的消息字段，不查询真实邮箱。证据保存响应体、数据库行和 fake 调用记录，失败信息带业务 ID，便于从报告直接复现。', '断言要同时覆盖结果与副作用'],
      ['用名称表达场景和结果', '测试名采用 `场景_前置条件_期望结果` 的可搜索形式，例如 `renew_whenTrialEndsAtDeadline_keepsActive`，不用 `testBilling`。同一文件内测试应能单独运行，命令 `pytest tests/test_billing.py -k trial_ends` 可直接筛出边界场景；若名称依赖编号，失败报告难以表达含义。边界命名包含 `before`、`at`、`after`，异常场景说明依赖故障。把名称、行号和失败摘录写入证据目录，评审时能快速看出行为覆盖。', '名称就是最小的失败说明'],
      ['隔离共享状态与时钟', '共享可变 fixture 会让前一个测试的余额、缓存或 mock 调用影响后一个测试，失败顺序一变结论就失真。用 `beforeEach` 新建仓储，数据库使用唯一 schema 或事务回滚，时钟通过构造函数注入；命令 `npx vitest run --sequence.shuffle` 可检查顺序依赖。边界要覆盖连续执行与并行执行，失败信息应显示测试名和首次污染点。保存打乱顺序的运行报告、清理 SQL 和 fixture 创建日志，证明每条用例独立且可重放。', '独立运行与乱序运行都要通过'],
    ],
  },
  {
    name: q0Name('断言质量、失败信息和可读性'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已能写正常与错误测试，并能阅读 Vitest、JUnit 或 pytest 的断言失败输出。',
    goal: '能选择精确断言并补充必要上下文，让失败报告直接指出业务差异、输入和位置，而不是只显示一个布尔值或模糊异常。',
    guidedPractice: '把 `assert result` 改成对订单状态、总价和错误码的对象比较，给参数化用例增加业务 ID，并用 `expect(value, "订单 42 的应退金额")` 提供上下文。故意把含税总价改错，比较普通断言与结构化断言的输出，记录 expected、received、输入快照和失败文件行号。',
    independentPractice: '挑选三个模糊断言，分别改写成集合包含、对象部分匹配和异常类型加消息模式；提交失败截图或终端文本，说明每个断言为何能定位具体业务字段。',
    commonErrors: [
      '只断言状态码或真值为真，响应体字段、错误码和数据库副作用都未检查，测试绿了但业务仍可能错误。',
      '为了通过测试使用宽松的任意值匹配，连关键 ID、金额与错误消息也被模糊掉，回归时无法发现字段漂移。',
    ],
    sourceRefs: [sources.vitest, sources.pytest, sources.junit],
    steps: [
      ['选择匹配业务语义的断言', '精确断言要匹配业务边界：列表顺序使用 `toEqual([...])`，对象新增可选字段使用 `toMatchObject`，异常使用 `toThrowError` 并检查错误码，数值使用容差而非直接相等。比如退款结果应断言 `status`、`refundedCents` 和 `ledgerEntryId`，而不是只断言函数返回。边界包括零退款、全额退款和超出原订单金额，失败输出应包含实际对象。保存完整测试报告和输入 JSON，证据才能证明断言观察了哪些字段。', '断言粒度要贴近业务语义'],
      ['为失败补充业务上下文', '失败消息应让值班者不打开源码也知道哪笔业务出错。Vitest 可写 `expect(actual, `order=${order.id}`).toEqual(expected)`，JUnit 使用 `assertAll` 与 `assertEquals(expected, actual, "订单 42 金额")`，pytest 可用 `assert actual == expected, payload`。边界值命名也要带字段名；失败时保留订单 ID、租户 ID 与请求号。把终端输出中的 tested value 和 traceId 保存为工件，避免以后只能看到 `AssertionError`。实际值与业务规则的对应关系也要写清，失败后的处理责任人不能含糊。', '上下文要包含对象与业务键'],
      ['避免过度宽松匹配', '`expect.any(Object)`、`assertIsNotNone` 或只匹配正则前缀可能把真实回归藏起来；只在第三方字段天然变化时使用部分匹配，并把稳定字段单独断言。针对金额、权限和日期，使用明确值或范围；边界检查 0、最大值和时区边界。运行 `npx vitest run tests/security --reporter=verbose`，尝试删除错误码字段，确认测试会失败。提交宽松点清单、失败差值和环境数据，作为断言强度证据。', '模糊匹配必须说出受控范围'],
      ['组织可扫描的失败输出', '把长响应拆成命名变量，先断言状态与核心业务字段，再断言次要字段；使用参数化测试为每行提供 case id，报告按 id 排序。命令 `pytest -vv --tb=short` 或 `./gradlew test --info` 可保留业务上下文但减少无关堆栈，失败摘要应位于第一屏。边界样本要有独立标签，防止所有失败看起来相同。保存 stdout、JUnit XML 和失败用例 id，证据让 reviewer 能直接筛出具体输入。', '失败摘要要一眼定位输入'],
      ['用变异检验断言质量', '人为改坏返回值、删除错误码、把金额单位从分改成元，再运行同一批测试，观察哪些缺陷没有被断言捕获。Stryker 或 PIT 可自动生成这类变异并报告 survived mutant；边界重点看比较运算、空集合和条件反转。若测试只验证 HTTP 200 而漏掉响应体差异，报告会暴露空洞。最终保存变异配置、测试报告、未捕获清单和补强后的新断言，形成断言质量的可见证据；若有变异体存活，报告必须列出未失败的断言和对应业务风险。', '未被捕获的变异就是断言缺口'],
    ],
  },
  {
    name: q0Name('第一个自动化回归基线'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能在本地运行一个小型测试套件，并会查看 Git 差异与 CI 的失败输出。',
    goal: '能从一个真实缺陷建立可重复的回归测试，记录红灯、修复和绿灯三个阶段，并把命令、环境与工件连接起来形成第一个可靠质量基线。',
    guidedPractice: '选择一个已修复的舍入缺陷，先写最小输入复现：`npx vitest run tests/pricing-regression.test.ts` 得到红灯，保存 expected 1000、received 999；修复舍入顺序后重跑全绿，再执行 `--coverage` 与 `--reporter=junit --outputFile=artifacts/regression.xml`，把前后报告放入临时证据目录。',
    independentPractice: '独立挑一个近期缺陷，完成从用户现象到最小测试的复现，提交红灯日志、修复 diff、绿灯报告和一条防止重复提交的 CI 配置说明，但不改动本仓库配置文件。',
    commonErrors: [
      '直接写一个能通过的测试，没有先在旧代码上看到失败，无法证明用例真的覆盖了原缺陷。',
      '只保留修复后的绿色结果，缺少输入、版本和失败堆栈，几周后无法判断回归是否来自同一原因。',
    ],
    sourceRefs: [sources.googleBehavior, sources.vitest, sources.githubActions],
    steps: [
      ['从现象还原最小输入', '先记录用户看到的错误、发生版本和业务数据，再缩小到单一函数或请求，例如订单 19.99 元数量 3 出现 59.97 而非 59.97 后的税费差异。测试只加入导致缺陷的必要字段，使用 `test("regression: ...")` 命名；边界保留原 bug 值以及邻近的 19.98、20.00，防止只修一个点。保存旧版本提交哈希、原始响应和最小输入 JSON，后续任何人可据此判断复现是否等价；旧版本的失败输出和业务错误也要作为证据归档。', '先把现象缩成单一输入'],
      ['让旧代码稳定变红', '在旧实现上运行 `npx vitest run tests/pricing-regression.test.ts --reporter=verbose`，确认失败来自业务断言而不是导入错误；报告应显示期望值与实际值、源文件行号和测试名称。若测试第一次就绿，应检查断言是否过宽或输入没有命中分支。边界还用同一输入重跑三次，保存三次一致结果与退出码，说明红灯可复现；失败工件必须与当前提交、Node 版本和依赖锁文件对应。', '红灯证据必须来自旧代码'],
      ['修复只改变缺陷机制', '根据失败栈定位舍入发生在币种转换前，修复为按最小货币单位运算；保持测试输入与其他断言不变，执行 `npx vitest run tests/pricing-regression.test.ts` 得到绿灯。边界同时运行 19.98、19.99、20.00 三行，检查没有改变正常值；保存 `git diff --stat`、修复片段与测试报告，避免把无关重构混进证据。若其他测试变红，先定位行为变化而不是调整期望。', '修复范围与失败机制对应'],
      ['跑完整套件防连锁回归', '单元绿不等于项目安全，还需执行 `pnpm --filter @yan-zhi/shared test` 或项目等价全量命令，并运行类型检查。检查报告中的跳过、重试和耗时分位，边界覆盖无缓存冷启动与已有缓存热启动；若只有热启动通过，删除构建缓存重跑。失败时保留完整 JUnit XML、覆盖率摘要和受影响模块列表，证据目录还应记录 lockfile 哈希，防止依赖漂移掩盖问题。', '局部修复后验证全量链路'],
      ['把回归接入持续门禁', '在 CI 中把同一测试纳入 PR job，命令固定为锁文件安装后的 `npx vitest run --reporter=junit --outputFile=artifacts/regression.xml`，失败时上传报告，不分片过滤掉该文件。为基线和修复后各保留一个运行链接，边界模拟依赖缓存缺失与并发 job，确认仍能重跑。最终证据包含缺陷描述、红灯、修复提交、绿灯和 CI 运行 ID；若门禁只在主干运行，发布风险仍未前移。', '回归用例必须在合并前执行'],
    ],
  },
], q0Examples);

// ── Q1 单元测试、测试替身与属性测试 ─────────────────────────────────────────
const q1Stage = '单元测试、测试替身与属性测试';
const q1Name = (topic: string) => `测试与工程质量 · ${q1Stage}：${topic}`;

const q1Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['用固定时钟识别隐藏的时间输入', 'TypeScript · Vitest', `import { afterEach, expect, it, vi } from 'vitest';
import { couponIsUsable } from './coupon';

afterEach(() => vi.useRealTimers());
it('uses the injected time instead of Date.now', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  expect(couponIsUsable({ expiresAt: '2026-05-31T23:59:59Z' }, new Date('2026-05-31T23:59:58Z'))).toBe(true);
  expect(couponIsUsable({ expiresAt: '2026-05-31T23:59:59Z' }, new Date('2026-05-31T23:59:59Z'))).toBe(false);
});`, `✓ uses the injected time instead of Date.now
Test Files  1 passed (1)
Tests       1 passed (1)

控制时钟后，过期前一秒与到期瞬间都可重复运行，不依赖执行机器的当前日期。`],
    ['仓储端口用内存实现跑纯服务测试', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { CheckoutService, MemoryPriceRepository } from './checkout';

it('rejects a coupon from another tenant without opening a network port', async () => {
  const prices = new MemoryPriceRepository([{ code: 'SAVE10', tenantId: 'tenant-b', percent: 10 }]);
  const result = await new CheckoutService(prices).price({ tenantId: 'tenant-a', coupon: 'SAVE10' });
  expect(result).toEqual({ rejected: 'COUPON_NOT_FOUND', totalCents: 2000 });
});`, `✓ rejects a coupon from another tenant without opening a network port
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    184ms

PriceRepository 端口由内存实现替代，核心规则不需要 PostgreSQL 或 HTTP 服务。`],
    ['折扣上下限用表驱动纯函数测试', 'Python · pytest', `import pytest
@pytest.mark.parametrize("subtotal,discount,expected", [
    (0, 10_000, "EMPTY"),
    (10_000, 10_000, "MAX"),
    (10_000, 10_001, "INVALID"),
])
def test_discount_bounds(subtotal, discount, expected):
    result = apply_discount(subtotal_cents=subtotal, discount_bps=discount)
    assert result.status == expected`, `tests/test_discount.py ...                                        [100%]
3 passed in 0.03s

纯函数表同时锁定空购物车、最大折扣和超限输入，重复执行得到完全相同的业务结果。`],
    ['授权超时从构造注入并检查恢复状态', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { CheckoutService } from './checkout';

it('keeps an order pending after the injected gateway times out', async () => {
  const repository = new MemoryOrderRepository();
  const gateway = { authorize: async () => { throw new TimeoutError('gateway timeout'); } };
  const service = new CheckoutService(repository, gateway);
  await expect(service.pay('order-7')).resolves.toEqual({ status: 'PAYMENT_PENDING', retryable: true });
  expect(repository.find('order-7')).toMatchObject({ state: 'PAYMENT_PENDING', attempt: 1 });
});`, `✓ keeps an order pending after the injected gateway times out
Test Files  1 passed (1)
Tests       1 passed (1)

失败被限制在支付端口内，订单没有误记为已支付，仓储快照给出可恢复状态。`],
    ['比较改造前后的测试耗时与外部连接', 'PowerShell', `$before = Measure-Command { pnpm exec vitest run tests/legacy-checkout.test.ts --reporter=json --outputFile=artifacts/before.json }
$after = Measure-Command { pnpm exec vitest run tests/checkout-core.test.ts --reporter=json --outputFile=artifacts/after.json }
Write-Output ('before_ms={0} after_ms={1}' -f [int]$before.TotalMilliseconds, [int]$after.TotalMilliseconds)
Select-String -Path artifacts/after.json -Pattern 'ECONNREFUSED|localhost'`, `before_ms=1842 after_ms=91
after.json no network errors

改造后没有启动数据库或 HTTP 服务，耗时下降但生产调用仍通过同一仓储端口。`],
  ],
  [
    ['四种替身各自只证明一种契约', 'TypeScript · Vitest', `import { expect, it, vi } from 'vitest';
import { QuoteService } from './quote';

it('combines a rate stub, audit spy and in-memory quote repository', async () => {
  const rates = { lookup: async () => ({ rate: 0.15 }) };
  const audit = { record: vi.fn() };
  const repository = new MemoryQuoteRepository();
  const service = new QuoteService(rates, audit, repository);
  await service.create({ id: 'q-1', currency: 'USD', cents: 1000 });
  expect(repository.get('q-1')?.cnyCents).toBe(150);
  expect(audit.record).toHaveBeenCalledWith({ quoteId: 'q-1', action: 'created' });
});`, `✓ combines a rate stub, audit spy and in-memory quote repository
Test Files  1 passed (1)
Tests       1 passed (1)

stub 固定汇率，fake 保存报价，spy 观察审计事件；三者没有混成一个万能 mock。`],
    ['stub 返回空汇率时必须拒绝报价', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { QuoteService } from './quote';

it.each([null, 0, -1])('rejects a rate stub result of %s', async (rate) => {
  const service = new QuoteService({ lookup: async () => ({ rate }) }, { record() {} }, new MemoryQuoteRepository());
  const result = await service.create({ id: 'q-bad', currency: 'USD', cents: 1000 });
  expect(result).toEqual({ ok: false, code: 'RATE_UNAVAILABLE' });
});`, `✓ rejects a rate stub result of null
✓ rejects a rate stub result of 0
✓ rejects a rate stub result of -1
Tests  3 passed (3)

空值、零和负汇率都走同一拒绝契约，stub 没有掩盖金额计算本身。`],
    ['spy 断言退款审计参数与顺序', 'TypeScript · Vitest', `import { expect, it, vi } from 'vitest';
import { refund } from './refund';

it('records authorization before a refund audit event', async () => {
  const audit = { record: vi.fn() };
  await refund('order-42', audit, { authorize: async () => ({ ok: true }) });
  expect(audit.record.mock.calls).toEqual([
    [{ orderId: 'order-42', action: 'refund-authorized' }],
    [{ orderId: 'order-42', action: 'refunded' }],
  ]);
});`, `✓ records authorization before a refund audit event
Test Files  1 passed (1)
Tests       1 passed (1)

调用表包含参数和顺序；若审计被删除或提前写入，断言会给出完整实际调用。`],
    ['mock 锁定授权前不得扣库存', 'TypeScript · Vitest', `import { expect, it, vi } from 'vitest';
import { CheckoutService } from './checkout';

it('does not decrement stock before authorization succeeds', async () => {
  const payment = { authorize: vi.fn().mockResolvedValue({ ok: false }) };
  const inventory = { decrement: vi.fn() };
  await new CheckoutService(payment, inventory).place({ sku: 'A-1', quantity: 1 });
  expect(payment.authorize).toHaveBeenCalledOnce();
  expect(inventory.decrement).not.toHaveBeenCalled();
});`, `✓ does not decrement stock before authorization succeeds
Test Files  1 passed (1)
Tests       1 passed (1)

这条交互约束保护不可逆库存副作用；真正序列化与状态码另有支付适配器契约测试。`],
    ['fake 仓储也要通过同一契约套件', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import type { OrderRepository } from './ports';

export function orderRepositoryContract(makeRepo: () => Promise<OrderRepository>) {
  it('returns null for an unknown order and preserves a saved row', async () => {
    const repo = await makeRepo();
    await expect(repo.find('missing')).resolves.toBeNull();
    await repo.save({ id: 'o-1', status: 'paid' });
    await expect(repo.find('o-1')).resolves.toEqual({ id: 'o-1', status: 'paid' });
  });
}
orderRepositoryContract(async () => new MemoryOrderRepository());`, `✓ orderRepositoryContract > returns null for an unknown order and preserves a saved row
Test Files  1 passed (1)
Tests       1 passed (1)

同一契约套件可继续指向 PostgreSQL 适配器，防止 fake 偷偷形成另一套语义。`],
  ],
  [
    ['先按等价类压缩折扣参数表', 'Python · pytest', `import pytest
@pytest.mark.parametrize("subtotal,band", [
    (0, "empty"),
    (1, "positive"),
    (9999, "discount-eligible"),
    (10000, "discount-eligible"),
    (10001, "discount-eligible"),
])
def test_discount_equivalence_classes(subtotal, band):
    assert classify_discount(subtotal) == band`, `tests/test_discount.py .....                                    [100%]
5 passed in 0.03s

行为相同的金额合并在等价类中，只有空、正数、折扣门槛附近需要独立样本。`],
    ['额度阈值取前一位、本身和后一位', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { approvalBand } from './credit';

it.each([
  [4999, 'manual'],
  [5000, 'automatic'],
  [5001, 'automatic'],
])('credit=%i maps to %s', (amount, band) => {
  expect(approvalBand(amount)).toBe(band);
});`, `✓ credit=4999 maps to manual
✓ credit=5000 maps to automatic
✓ credit=5001 maps to automatic
Test Files  1 passed (1)
Tests       3 passed (3)

最小货币单位 4999/5000/5001 直接覆盖阈值两侧，不使用含糊的 4 千与 6 千。`],
    ['异常类型与业务码一起进入参数表', 'Python · pytest', `import pytest
@pytest.mark.parametrize("payload,error_code", [
    ({"amount": "abc"}, "AMOUNT_FORMAT"),
    ({"amount": -1}, "AMOUNT_RANGE"),
    ({"amount": 100, "currency": "XXX"}, "CURRENCY_UNSUPPORTED"),
])
def test_transfer_errors(client, payload, error_code):
    response = client.post("/transfers", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == error_code`, `tests/test_transfer_errors.py ...                                [100%]
3 passed in 0.08s

每一行同时锁定 HTTP 契约和稳定业务码，避免只断言“抛了异常”。`],
    ['用 case id 单独重放失败输入', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { transfer } from './transfer';

it.each([
  ['T-EMPTY', 0, 'AMOUNT_REQUIRED'],
  ['T-NEGATIVE', -1, 'AMOUNT_RANGE'],
  ['T-OVER-LIMIT', 5_000_001, 'LIMIT_EXCEEDED'],
])('%s: transfer amount %i', (caseId, cents, code) => {
  expect(transfer({ idempotencyKey: caseId, cents })).toMatchObject({ ok: false, code });
});`, `✓ T-EMPTY: transfer amount 0
✓ T-NEGATIVE: transfer amount -1
✓ T-LIMIT: transfer amount 5000001
Tests  3 passed (3)

报告首列就是稳定 case id，复制 T-NEGATIVE 可直接定位并重放对应输入。`],
    ['表格规模超过边界时拆成独立测试', 'PowerShell', `$rows = Import-Csv artifacts/parameter-cases.csv
$byBehavior = $rows | Group-Object behavior
$tooLarge = $byBehavior | Where-Object Count -gt 12
Write-Output "rows=$($rows.Count) groups=$($byBehavior.Count) oversized=$($tooLarge.Count)"
$tooLarge | ForEach-Object { Write-Output "$($_.Name):$($_.Count)" }
if ($tooLarge) { exit 1 }`, `rows=38 groups=4 oversized=1
refund-recovery:19
exit=1

恢复行为拥有 19 个不同前置状态，继续塞进同表会难读，应拆成独立场景组。`],
  ],
  [
    ['用属性验证发票总额等于行项目之和', 'TypeScript · fast-check', `import fc from 'fast-check';
import { expect, test } from 'vitest';
import { invoiceTotal } from './invoice';

test('total equals the sum of every positive line', () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: 1, maxLength: 20 }),
    (lines) => invoiceTotal(lines) === lines.reduce((sum, cents) => sum + cents, 0),
  ));
});`, `✓ total equals the sum of every positive line
Test Files  1 passed (1)
Tests       1 passed (1)
100 tests generated

这里证明所有生成的行集合都满足守恒关系，而不是只挑三条固定发票。`],
    ['生成器只产生业务允许的订单状态', 'TypeScript · fast-check', `import fc from 'fast-check';
import { expect, test } from 'vitest';
import { canRefund } from './order';

const paidOrder = fc.record({
  id: fc.uuid(),
  state: fc.constant('paid' as const),
  amountCents: fc.integer({ min: 1, max: 20_000 }),
  refundedCents: fc.integer({ min: 0, max: 19_999 }),
});
test('a paid order never exceeds its refundable amount', () => {
  fc.assert(fc.property(paidOrder, (order) => canRefund(order).maxCents <= order.amountCents));
});`, `✓ a paid order never exceeds its refundable amount
Test Files  1 passed (1)
Tests       1 passed (1)

生成器排除了 cancelled 与 amount=0，避免用无效业务数据制造无意义失败。`],
    ['读取收缩后的最小失败反例', 'TypeScript · fast-check', `import fc from 'fast-check';
import { test } from 'vitest';
import { discount } from './discount';

test('discount never exceeds subtotal', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 50_000 }),
    fc.integer({ min: 1, max: 50_000 }),
    (subtotal, percent) => discount(subtotal, percent) <= subtotal,
  ));
});`, `× discount never exceeds subtotal
Counterexample: [subtotal = 1, percent = 100]
Shrunk 17 time(s)
Seed: 173812991

收缩把随机失败压到最小金额，100% 折扣的边界一目了然。`],
    ['把反例固化成普通回归测试', 'TypeScript · Vitest', `import { expect, test } from 'vitest';
import { discount } from './discount';

test('regression: 100 percent discount cannot exceed one cent subtotal', () => {
  expect(discount(1, 100)).toBe(1);
  expect(discount(0, 100)).toBe(0);
});

test('property: discount stays within subtotal', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 50_000 }), (cents) => discount(cents, 100) <= cents));
});`, `✓ regression: 100 percent discount cannot exceed one cent subtotal
✓ property: discount stays within subtotal
Tests  2 passed (2)

最小反例成为快速固定测试，属性测试继续探索更大输入空间。`],
    ['固定随机种子并限制运行预算', 'PowerShell', `$env:FAST_CHECK_SEED='173812991'
$env:FAST_CHECK_NUM_RUNS='500'
pnpm exec vitest run tests/discount.property.test.ts --reporter=json --outputFile=artifacts/property.json
node -e "const r=require('./artifacts/property.json'); console.log('runs=500 seed=173812991 duration='+r.testResults[0].duration+'ms')"`, `runs=500 seed=173812991 duration=842ms
Test Files  1 passed (1)
Tests       1 passed (1)

失败可凭种子重放；500 次作为 PR 预算，更深的随机探索放入夜间任务。`],
  ],
  [
    ['先跑基准变异建立可解释分数', 'PowerShell', `@'
{
  "mutate": ["src/pricing.ts", "src/discount.ts"],
  "testRunner": "vitest",
  "reporters": ["clear-text", "json"],
  "jsonReporter": { "fileName": "artifacts/mutation.json" },
  "thresholds": { "high": 80, "low": 70, "break": 70 }
}
'@ | Set-Content stryker.config.json
pnpm exec stryker run`, `Mutation score: 76.19%
Killed: 32 Survived: 10 No coverage: 0
Tests passed: true
Threshold: low (score is between 70 and 80)

分数可复算，但下一步要逐条解释 10 个存活变异，而不是只追数字。`],
    ['定位金额比较被改成恒真后仍存活', 'PowerShell', `pnpm exec stryker run --mutate "src/pricing.ts:18" --reporters json --jsonReporter.fileName artifacts/survived.json
$report = Get-Content artifacts/survived.json -Raw | ConvertFrom-Json
$report.files.'src/pricing.ts'.mutants | Where-Object status -eq 'Survived' |
  ForEach-Object { Write-Output "$($_.mutatorName) line=$($_.location.start.line) replacement=$($_.replacement)" }`, `ConditionalExpression line=18 replacement=true
Survived: 1
Tests run: 24 passed

测试执行了该分支但没有断言错误结果，因此金额上限被删除时仍然全绿。`],
    ['用等价性论证排除无效条件变异', 'TypeScript · Vitest', `import { expect, test } from 'vitest';
import { normalizePort } from './server';

test('documents why > 0 and >= 1 are equivalent for a checked integer', () => {
  const valid = [1, 2, 8080, 65535];
  for (const port of valid) {
    expect(Number.isInteger(port)).toBe(true);
    expect(port > 0).toBe(port >= 1);
  }
  expect(() => normalizePort(0)).toThrow('PORT_RANGE');
});`, `✓ documents why > 0 and >= 1 are equivalent for a checked integer
Test Files  1 passed (1)
Tests       1 passed (1)

输入前置已保证整数且零被上层拒绝，这个存活体记录为等价变异并附证明。`],
    ['补断言后让存活变异体被捕获', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { discount } from './pricing';

it('rejects discounts above one hundred percent', () => {
  expect(discount({ subtotalCents: 1000, percent: 101 })).toEqual({
    ok: false,
    code: 'DISCOUNT_ABOVE_LIMIT',
  });
  expect(discount({ subtotalCents: 1000, percent: 100 })).toEqual({
    ok: true,
    totalCents: 0,
  });
});`, `✓ rejects discounts above one hundred percent
Test Files  1 passed (1)
Tests       1 passed (1)
Mutation score: 81.11%

新增 100 与 101 边界断言后，原存活体的 ConditionalExpression 已被杀死。`],
    ['PR 跑增量变异，夜间跑完整变异', 'Vitest and GitHub Actions YAML', `export default defineConfig({
  test: {
    coverage: { provider: 'v8' },
  },
});
// package scripts
// "mutation:changed": "stryker run --since main",
// "mutation:full": "stryker run"

name: mutation
on:
  pull_request:
  schedule:
    - cron: '0 18 * * *'
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm run mutation:changed
      - run: pnpm run mutation:full
        if: github.event_name == 'schedule'`, `pull_request  mutation:changed  score=84.2%  1m08s
schedule      mutation:full     score=79.6%  12m41s
nightly artifact mutation-2026-11-24.json uploaded

PR 只检查改动文件，夜间覆盖全仓并保留趋势，高成本任务没有阻塞每次提交。`],
  ],
  [
    ['读取行、分支和函数三种覆盖口径', 'PowerShell · Vitest', `pnpm exec vitest run --coverage --coverage.reporter=text --coverage.reporter=json-summary
node -e "const c=require('./coverage/coverage-summary.json').total; console.log({lines:c.lines.pct,branches:c.branches.pct,functions:c.functions.pct})"`, `{ lines: 91.4, branches: 72.8, functions: 88.1 }
Test Files  26 passed (26)
Tests       214 passed (214)

行覆盖高但分支只有 72.8%，说明不少条件路径只执行了主分支。`],
    ['风险表优先于全仓平均覆盖率', 'TypeScript', `const risks = [
  { id: 'PAY-01', severity: 5, coverage: 96, layer: 'integration' },
  { id: 'TENANT-02', severity: 5, coverage: 48, layer: 'integration' },
  { id: 'EXPORT-03', severity: 2, coverage: 88, layer: 'unit' },
] as const;
const gaps = risks
  .filter((risk) => risk.severity === 5 && risk.coverage < 90)
  .map((risk) => risk.id);
console.log({ average: 77.3, blockingGaps: gaps });`, `{ average: 77.3, blockingGaps: [ 'TENANT-02' ] }

全仓平均覆盖不是决策依据；高风险 TENANT-02 的 48% 才触发补测。`],
    ['高覆盖测试没有断言业务结果', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { refund } from './refund';

it('observes the stable refund contract', () => {
  const result = refund({ orderId: 'o-9', cents: 500 });
  expect(result).toEqual({ status: 'refunded', cents: 500, ledgerId: expect.stringMatching(/^ledger-/) });
});

it('rejects a refund above the captured amount', () => {
  expect(refund({ orderId: 'o-9', cents: 501 })).toMatchObject({ status: 'rejected', code: 'AMOUNT_TOO_HIGH' });
});`, `✓ observes the stable refund contract
✓ rejects a refund above the captured amount
Coverage: statements 100%, branches 100%

删除金额断言会被变异测试发现；覆盖率单独不能证明这些判断存在。`],
    ['补齐数据库断开后的恢复分支', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { loadOrders } from './orders';

it('returns a retryable error and releases the pool client on connection loss', async () => {
  const pool = new FakePool();
  pool.failNextQuery(new Error('connection reset'));
  const result = await loadOrders(pool, { tenantId: 't-1' });
  expect(result).toEqual({ ok: false, code: 'DB_UNAVAILABLE', retryable: true });
  expect(pool.acquireCount).toBe(1);
  expect(pool.releaseCount).toBe(1);
});`, `✓ returns a retryable error and releases the pool client on connection loss
Branches: 100% (8/8)

异常与清理两条分支都被执行，连接池 releaseCount 证明失败后没有泄漏。`],
    ['按目录设置阈值并保留豁免清单', 'Vitest config', `export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/pricing/**', 'src/auth/**'],
      exclude: ['src/generated/**'],
      thresholds: {
        'src/pricing/**': { lines: 90, branches: 85 },
        'src/auth/**': { lines: 95, branches: 90 },
        'src/generated/**': { lines: 0 },
      },
    },
  },
});`, `pricing  lines 92.1  branches 86.4  pass
auth     lines 96.8  branches 91.2  pass
generated excluded by reviewed policy: 3 files

生成代码只有明确豁免才排除；核心目录使用更高阈值，缺口与责任范围绑定。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q1_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q1Name('纯函数、依赖注入和可测设计'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能编写函数和服务类，并知道如何通过构造函数或参数传入数据库、时钟与 HTTP 客户端依赖。',
    goal: '能把随机时钟、网络和持久化副作用隔离到依赖边界，使核心规则成为可重复调用的纯函数，并能解释可测设计并不等于为了测试扭曲生产结构。',
    guidedPractice: '把 `checkout()` 里的 `Date.now()`、数据库查询和邮件发送拆成显式参数与端口，让 `calculateTotal(items, coupon, now)` 成为纯函数。用固定时钟和内存仓储运行 `npx vitest run tests/checkout-core.test.ts`，分别传入过期优惠券和空购物车，观察同一输入重复运行是否得到相同结果与失败差值。',
    independentPractice: '选一个直接 new 数据库客户端的服务，改造为构造函数注入，并为纯逻辑、依赖失败和重复调用各写测试；提交依赖图、改造前后测试耗时和一条无需启动网络的运行证据。',
    commonErrors: [
      '为了测试把业务逻辑全部搬进 mock 配置，生产代码仍依赖隐藏全局状态，测试只证明了测试替身能工作。',
      '把依赖注入理解成新增大量接口和工厂，却没有减少时钟、网络与数据库的不确定性，模块边界反而更难读。',
    ],
    sourceRefs: [sources.googleBehavior, sources.practicalPyramid, sources.vitest],
    steps: [
      ['识别隐藏输入与输出', '一个函数若读取全局时间、环境变量、随机数或数据库，就把额外输入藏在了调用栈外；若发送邮件或写日志，则产生不确定输出。用表格列出参数、读取项、返回值、副作用和失败类型，先把优惠计算改为 `calculateTotal(items, coupon, now)`，再用 `vi.setSystemTime` 对比固定时间结果。边界包含月末最后一秒和过期第一秒，失败时保存实际时钟值、输入对象和堆栈，证明结果是否可重复。', '所有不确定输入都要显式化'],
      ['把副作用推到端口后面', '数据库、支付网关和邮件发送可以定义成很小的端口，例如 `PriceRepository.findCoupon(code)`、`PaymentGateway.authorize(amount)`；核心服务只依赖公开方法，由生产适配器连接真实系统。测试时传入内存实现，命令 `pytest -q tests/test_checkout_service.py` 或 `./gradlew test --tests "*CheckoutService*"` 在无网络环境运行。边界要考虑端口抛超时与返回 null，失败日志保留适配器名称和参数。证据是依赖图、测试配置和零外部连接日志。', '核心规则只依赖必需端口'],
      ['让纯函数覆盖关键分支', '纯函数适合测试折扣、税额、状态机和权限矩阵，因为相同输入总能得到相同输出。用 `it.each` 或 `@CsvSource` 覆盖折扣上下限、零税额和不可叠加规则，断言完整结果对象而不是单个布尔值。边界取 0、最大折扣、刚好过期；失败输出应显示哪一行输入导致 expected/received 差异。保存测试表、固定种子和运行报告，后续优化实现时可做等价性对照，避免重写改变业务语义。', '纯逻辑先追求确定性覆盖'],
      ['用构造注入控制失败时机', '可测设计要能在不修改业务代码的情况下注入依赖失败，例如传入 `PaymentGateway` 的 stub，让 `authorize` 抛出 `TimeoutError`，观察订单是否保持待支付。测试命令和异常类必须固定，边界覆盖第一次超时后重试成功、连续超时进入熔断；失败信息要保留调用次数和补偿状态。证据保存内存仓储快照、异常栈与重试时间轴，证明依赖边界不会把半成品状态泄漏到调用方。', '依赖失败要从构造处注入'],
      ['评估可测改造的代价', '把核心逻辑抽成纯函数通常让测试更快，但过度拆分会增加对象数量与跨模块调用；用 `npx vitest run --reporter=verbose` 记录改造前后测试时间、覆盖风险与维护行数。边界比较单个优惠和批量订单，确认抽象没有改变排序或舍入。最终保留公开 API、依赖图、失败样例和回滚方案，若只在测试里方便却让生产调用链更复杂，应重新收窄抽象，而不是继续堆包装；测试耗时报告与依赖清单也要归档为证据。', '可测性要服务生产设计'],
    ],
  },
  {
    name: q1Name('stub、spy、mock 和 fake'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能通过依赖注入替换外部服务，并理解函数调用、返回值和异常在测试中的区别。',
    goal: '能根据协议需要选择 stub、spy、mock 或 fake，控制测试替身的返回值与调用记录，同时避免用过度模拟掩盖序列化、事务和真实网络行为。',
    guidedPractice: '为邮件服务分别建立返回固定值的 stub、记录调用参数的 spy 和只在内存中工作的 fake，给库存服务建立必须断言调用契约的 mock。运行 `npx vitest run tests/order-service.test.ts`，让 fake 在第二次发送时抛错，检查调用记录、余额状态和错误响应；再删除一个真实库存校验，确认 mock 测试是否变红。',
    independentPractice: '为一个短信验证码服务设计四种替身，说明每种替身替代的真实风险；补一条真实 HTTP 适配器测试，证明 mock 没有遗漏序列化和状态码处理。',
    commonErrors: [
      '把 mock 当成通用万能夹具，测试只验证内部方法被调用，却没有验证返回值、持久化结果和真实协议。',
      'fake 内部逻辑越来越复杂却没有测试，最后测试对象成了另一套难以维护的生产实现。',
    ],
    sourceRefs: [sources.vitest, sources.practicalPyramid, sources.testingLibrary],
    steps: [
      ['先分清替身职责', 'stub 只提供预设返回值，spy 保留真实或替代实现并记录调用，mock 把预期交互编码到断言，fake 提供可工作的轻量实现。支付查询适合 stub 返回 declined，审计网关适合 spy 检查事件，复杂仓储适合 fake 维护内存表；用 `vi.fn().mockResolvedValue` 与 `vi.spyOn` 明确职责。边界包含空响应、重复调用和异常，失败报告要显示调用的参数与次数。证据保存替身类型说明、调用记录和业务输出，防止只用一种手段套所有依赖。', '替身类型由要证明的契约决定'],
      ['用 stub 控制返回边界', 'stub 应只改变一个外部结果，让被测规则保留其他真实输入。例如汇率客户端返回 0.15，订单服务仍使用真实金额与舍入函数；边界分别返回 0、负数和 `null`，断言服务拒绝无汇率而不是静默按零计算。命令 `pytest tests/test_fx.py -q` 失败时应显示输入币种、汇率和错误码。把 stub 配置与请求参数写入报告，证据还应包括一次真实客户端契约测试，说明字段名和空响应没有被隐藏。', 'stub 一次只替代一个事实'],
      ['用 spy 观察公开调用', 'spy 适合验证安全审计、通知和外部协议是否发生，但断言应针对可观察参数与顺序，例如 `expect(audit.record).toHaveBeenCalledWith({orderId, action: "refunded"})`。对 `Date.now` 或私有 helper 的 spy 通常会把实现细节焊死；边界包括拒绝请求不应调用支付、成功请求只调用一次。失败时输出调用表和异常栈，保存调用记录工件。若业务存在返回值替代，优先断言结果，spy 只用于无法从结果观察的协议约束。', 'spy 记录协议，不窥探私有实现'],
      ['用 mock 锁定外部契约', 'mock 在测试开始前声明必须发生的交互，例如支付授权必须在扣库存前调用一次；可用 `expect(payment.authorize).toHaveBeenCalledTimes(1)` 与 `expect(inventory.decrement).not.toHaveBeenCalled()`。边界覆盖授权超时和重复回调，失败消息应标出预期顺序与实际调用序列。命令输出、调用参数和业务状态要一起归档，证据包含一张时序图。若测试只要有 mock 就绿，需要补一个集成测试连接测试支付服务，否则协议字段和网络错误可能被完全绕过。', 'mock 只覆盖明确的交互约束'],
      ['把 fake 当作受测基础设施', 'fake 仓储或消息总线应实现与真实适配器相同的公开接口，并有自己的测试覆盖插入、删除、唯一约束和并发；`InMemoryOrderRepository` 在重复 ID 上必须抛错，才能让业务测试看到真实失败。边界包含空表、重复键和事务回滚，执行 `npx vitest run tests/fakes` 与真实 Testcontainers 集成测试做对照。证据保存 fake 行为表、真实数据库 version 和两边结果差异，避免替身漂移成理想化世界。', '替身本身也要有契约与测试'],
    ],
  },
  {
    name: q1Name('参数化、表驱动和边界值'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能写带输入和期望值的单元测试，并知道业务规则中存在最小值、最大值和相邻阈值。',
    goal: '能用参数化与表驱动测试组织多组输入，按等价类、边界值和异常类别设计数据，让报告直接标出失败行而不是重复复制测试函数。',
    guidedPractice: '为折扣券有效期写表驱动用例，行包括开始前 1 毫秒、开始时刻、结束时刻、结束后 1 毫秒和空时间；分别用 `it.each` 与 `pytest.mark.parametrize` 输出 case id。修改一个比较运算符，运行 `pytest -q tests/test_coupon.py -vv` 或 `npx vitest run tests/coupon.test.ts --reporter=verbose`，读取失败行号、输入和期望值。',
    independentPractice: '为一个分页接口建立参数表，覆盖 offset 0、最大页大小、超过上限、负数和空结果；给每行加业务 ID，并保存完整失败报告与恢复后的绿色报告。',
    commonErrors: [
      '只复制测试函数并把输入放在匿名数组里，失败报告没有 case id，无法知道哪一组业务条件坏了。',
      '边界只取最小值和最大值，缺少阈值前后相邻值，导致 `<` 与 `<=` 的错误可能完全漏掉。',
    ],
    sourceRefs: [sources.junit, sources.pytest, sources.vitest],
    steps: [
      ['划分等价类减少重复', '先按业务规则把输入分成会走不同分支的等价类，例如未开始、进行中、已结束、时间缺失；同一类内选一个代表值，不同类别分别成行。用 `describe.each` 组织案例，表项包含 id、now、start、end、expected，避免只把输入拼成字符串。边界要有空值、非法日期和时区差，失败输出保存实际分支与 case id。证据用参数表和报告互相对照，证明不是只扩大了数量。', '先分等价类再扩行数'],
      ['围绕阈值取相邻值', '对折扣上限 100 元，应取 99.99、100.00、100.01；对最多 20 项购物车，取 19、20、21；对过期时间取截止前 1 毫秒、截止瞬间和之后 1 毫秒。`@ParameterizedTest` 的 `@ValueSource` 或 `it.each` 每行带明确名称，断言比较完整输出对象。边界浮点值要用最小单位表示，失败报告必须给出行号与 expected/received。保存 locale、货币和时区配置，避免平台差异把边界测试变成假失败。', '阈值前后一个最小单位都不能漏'],
      ['把异常纳入表格', '参数化不只处理返回成功值，也应按错误类别列出输入、异常类型、错误码和是否回滚。例如空租户抛 `TenantRequired`，非法折扣抛 `InvalidCoupon`，数据库冲突抛 409；用 `assertRaisesRegex` 或 `toThrowError` 检查稳定错误码。边界包括空字符串、超长字段和未知枚举，失败时输出异常消息与原输入。保存异常规范文档与测试报告，避免只看到 `Exception` 而不知道调用方应如何处理。', '每类异常都必须有稳定契约'],
      ['给每行建立可搜索标识', '表格行应包含 `caseId`、输入摘要和预期结果，pytest 可用 `pytest.param(..., id="at-expiry")`，Vitest 可传 `["at-expiry", input, expected]` 作为标题。命令 `pytest -k at-expiry` 或 `npx vitest run -t at-expiry` 能独立重放，失败报告也会显示同一 ID。边界 id 要写时间或数量条件，而不是 `case-1`；保存筛选命令、报告片段和环境版本，证据从失败行即可还原。筛选命令要能直接定位业务条件，不必再靠人工猜数组下标。', 'case id 要能独立重放输入'],
      ['控制表格规模与维护成本', '参数表适合同构规则，不适合把完全不同的业务流程塞进一个大数组；当每行需要特殊 preparer 时，应拆成独立测试或辅助函数。设阈值检查行数与运行时长，`npx vitest run --reporter=json` 可分析每组耗时；边界增加重复执行验证，确保表行之间不共享数据。最终保存表结构、测试报告、拆分理由和一次删除边界值的反向失败，证明用例仍能抓到规则变化。', '同构输入才适合共享一张表'],
    ],
  },
  {
    name: q1Name('属性测试和生成式输入'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能写参数化测试，理解不变量、边界值和随机输入之间的区别，并能保存随机测试种子。',
    goal: '能用属性测试验证解析、排序、序列化和金额运算的不变量，利用生成器覆盖人工样例难想到的组合，并通过收缩后的最小反例定位失败。',
    guidedPractice: '为“编码后再解码应得到等价对象”写 fast-check 属性测试，生成任意订单列表并设置最小长度 0、最大长度 50；故意把空数组编码成 null，运行 `npx vitest run tests/codec.property.test.ts`，观察 shrinking 输出、随机种子和最小失败样本并保存报告。Python 侧用 Hypothesis 生成空字符串与 Unicode 文本做对照。',
    independentPractice: '给一个排序函数建立三条属性：输出长度不变、相邻元素有序、元素多重集不变；再给金额加法加入交换律和零元性质，提交生成器参数、收缩反例与修复后重跑记录。',
    commonErrors: [
      '随机生成器没有约束就输入超大对象，测试时间被耗尽，失败后也没有保存 seed 和运行次数。',
      '只为随机样例补 if 分支，不维护通用不变量，属性测试最后变成不稳定的抽样测试。',
    ],
    sourceRefs: [sources.fastCheck, sources.hypothesis, sources.vitest],
    steps: [
      ['把断言改写为不变量', '属性测试不是随机跑一次普通用例，而是寻找所有合法输入都应满足的关系：解码后值相等、金额加法交换、排序结果元素集合不变、分页总数量不为负。用 `fc.assert(fc.property(...))` 或 `@given` 声明属性，边界从空集合、单元素、重复元素到最大长度逐层约束；失败报告至少包含 seed、shrunk input 和异常栈。保存生成器版本、运行次数和报告，才能重放随机序列。', '先找恒成立关系再生成输入'],
      ['设计有意义的生成器', '生成器要贴近业务域，商品数量可以是 0 到 100 的整数，金额用整数分，标题包含空白与 Unicode，时间限制在有效范围；避免 `fc.anything()` 生成不可达对象。`fc.array(fc.record({...}), {maxLength: 50})` 或 Hypothesis 的 `st.integers(min_value=0)` 都是边界声明。失败时报告会显示生成路径和样本大小，证据保存自定义生成器代码与一次极端输入结果，方便以后继续审查。', '生成空间必须来自业务约束'],
      ['观察 shrunk 最小反例', 'fast-check 和 Hypothesis 在发现失败后会缩小输入，保留最小且可读的反例；例如把 37 个订单缩成空列表，把长 Unicode 字符串缩成单个 surrogate 或空串。运行 `pytest --hypothesis-show-statistics` 可查看生成分布，Vitest 报告会包含 seed 与 shrink 次数。边界要检查最小反例是否仍合法，若缩小后越过领域约束，应调整生成器而不是忽略失败。保存完整反例、seed 和失败行号，作为修复输入。', '收缩样本比随机大样本更有诊断价值'],
      ['用反例驱动修复', '把最小反例固化成普通回归测试，再回到属性测试检查同类规律。修复空数组编码后，执行原命令和 `--seed` 重放，确认属性恢复；边界同时运行一次与一百次生成，防止只在默认样例通过。失败信息如果只显示“属性失败”，应在断言中附上输入与业务 ID。证据包含收缩样本、修复 diff、固定 seed 重放和全量报告，证明修复针对的是属性而不是偶发值。', '最小反例要固化成回归样例'],
      ['控制随机与运行成本', '随机测试需要设 runs、deadline 和大小上限，在 CI 中固定 seed 与运行次数，在夜间任务保留更多探索；边界比较 100 次 smoke 与 1000 次 nightly 的耗时。为生成器限制深度和递归，避免栈溢出；失败工件要保存 seed、平台和库版本。最终报告记录发现反例的比例、运行时间和未覆盖生成域，说明属性测试是补充参数化，而不是替代明确业务边界；`pytest --hypothesis-show-statistics` 可用于查看生成分布。', '随机探索也要有预算和种子'],
    ],
  },
  {
    name: q1Name('变异测试与断言强度'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '有一套快速单元测试，能运行覆盖率报告，并理解条件、常量、返回值和边界运算的基本结构。',
    goal: '能用变异分数识别断言空洞，读懂 survived、killed 和 timeout 变异体，并通过补强断言或删除等价变异提升测试对真实缺陷的敏感度。',
    guidedPractice: '对价格规则运行 Stryker 的 `mutate` 配置或 PIT 的 `mutationThreshold`，先观察把 `>=` 改成 `>` 的变异体是否存活；检查测试是否只覆盖 99 元正常值。补一个 100 元边界断言后重跑，保存 HTML/XML 报告、存活变异位置与修复前后分数，不把变异测试塞进每次提交的慢门禁。',
    independentPractice: '选一个权限判断或分页函数运行一次变异测试，为三个存活变异分别补强测试，记录哪些属于等价变异、哪些暴露真实缺口，并给出 PR 与夜间任务的执行建议。',
    commonErrors: [
      '把变异分数当成唯一目标，盲目添加断言或排除文件，直到数字好看但没有覆盖关键风险。',
      '变异测试直接放进每次 PR 全量运行，导致反馈时间过长，开发者开始忽略或绕过门禁。',
    ],
    sourceRefs: [sources.stryker, sources.pit, sources.googleBehavior],
    steps: [
      ['理解变异体与测试选择', '变异测试会修改常量、比较符、返回值和条件，例如把 `amount >= limit` 变成 `amount > limit`，再运行能覆盖该行的测试；killed 表示有测试变红，survived 表示行为变化未被发现。先用 `npx stryker run --mutate "src/pricing/**/*.ts"`，记录报告中的变异位置与测试名单。边界优先看阈值比较和默认值，失败报告保存原始/变异代码、执行命令和存活清单。', '变异体代表一种可能的真实缺陷'],
      ['用存活变异定位空洞', '当 100 元恰好等于限额的用例缺失时，`>=` 改成 `>` 的变异会存活；当错误码只断言真值，删除错误码字符串的变异也会存活。逐条打开报告，检查覆盖该行的测试为何没有变红，而不是先增加随机断言。边界补上 99.99、100、100.01 和异常分支，失败报告附变异 id。证据包含存活表、补丁和重跑命令，能解释每个分数变化来源。', '每个存活体都要解释原因'],
      ['区分等价与无效变异', '有些变异改变代码文本但不改变业务结果，例如日志字符串不影响逻辑，或两种排序对唯一元素等价；这类变异应记录理由并从强断言目标中排除，而不是为它写脆弱测试。对安全、金额和权限分支不允许轻易判等价，边界还要检查异常路径。保存被排除的变异 id、代码位置和评审原因，报告同时保留 timeout/compile error，避免把基础设施失败误当成 killed；`npx stryker run --dryRunOnly` 可先验证配置和范围。', '等价变异要有书面依据'],
      ['补强断言与回归样例', '补强优先观察业务结果，例如 `expect(response.body.code).toBe("LIMIT_EXCEEDED")`、数据库状态和排序顺序，而不是增加无意义调用次数。每条补强都应让至少一个变异从 survived 变 killed，边界覆盖阈值值与相邻值；执行 `npx stryker run --reporters clear-text,html` 保存前后分数。最终证据包含测试 diff、失败测试名、变异 id 和全量回归报告，说明断言提升对应具体风险。', '断言补强要改变变异结论'],
      ['建立分层运行策略', '变异测试成本高，适合夜间全模块、发布前高风险目录和 PR 中受影响文件；在配置里设 `thresholds.break` 与并发 worker，边界检查空测试集和超时。把分数与覆盖率分开汇报，覆盖率说明执行过哪些代码，变异分数说明测试能否识别变化。保存 CI job、执行时长、分数趋势和性能预算，若新增测试拖慢超过阈值，应缩小 target 或拆分慢测试；一旦超时或分数下降，失败报告也必须保留为证据。', '高成本检查分层运行'],
    ],
  },
  {
    name: q1Name('覆盖率误区与风险覆盖'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能运行覆盖率报告，并能读懂语句、分支、函数和行覆盖率字段。',
    goal: '能解释高覆盖率不等于高质量，区分行、分支与风险覆盖，使用覆盖率缺口补充异常和权限测试，而不是只为拉高数字写空洞断言。',
    guidedPractice: '对支付服务运行 `npx vitest run --coverage` 与 `pytest --cov=app --cov-report=term-missing`，找到数值 100% 但未断言错误消息的代码。删除一条关键断言后观察覆盖率仍 100%、变异或手工回归却失败；列出权限、金额和恢复三个高风险分支，为每个补一条可观察行为测试。',
    independentPractice: '为一个模块制作风险覆盖表，列出业务规则、分支、测试、失败模式与证据；要求覆盖率报告、断言质量和未覆盖原因同时存在，并提交一次覆盖率不升但风险覆盖提升的案例。',
    commonErrors: [
      '把全局 80% 覆盖率当作质量证明，忽略权限、金额与数据恢复等低覆盖高风险分支。',
      '为了提升数字在测试里只调用代码不检查输出，覆盖率上升但断言和失败诊断没有改善。',
    ],
    sourceRefs: [sources.googleSizes, sources.stryker, sources.pytest],
    steps: [
      ['读懂覆盖率统计口径', '行覆盖率表示某行执行过，分支覆盖率还会检查 `if`、三元表达式和异常处理的两侧；函数覆盖率只说明入口被调用。运行 `npx vitest run --coverage --coverage.reporter=html` 或 `pytest --cov=app --cov-branch`，打开报告查看未执行行号。边界包括空集合、异常和权限拒绝，失败时要区分未执行与执行后未断言。保存 HTML/lcov 报告、提交哈希和命令，避免只看终端总百分比。', '覆盖率说明执行，不说明判断'],
      ['把风险放在数字之前', '按金额错误、越权、数据丢失、恢复失败和普通展示划分风险等级，高风险模块要求分支与断言证据，低风险纯 DTO 可接受较低覆盖。为每个风险写测试映射，例如对象越权必须断言 403 且无数据泄漏；命令 `npx vitest run tests/security` 失败应显示角色与资源 ID。边界覆盖资源为空、跨租户和已删除对象，证据包含风险矩阵与覆盖率交集。', '先排风险顺序再分配覆盖预算'],
      ['识别高分低质的空洞', '一条测试只要调用服务就可能让行覆盖率变高，即使没有断言结果；检查测试源码中是否存在 `await service.run()` 后没有 expect 的情况。用 Stryker 的 survived mutant 或手工改坏错误码做反向验证，若覆盖率不变而测试仍绿，说明断言缺失。边界重点看默认值和异常消息，失败报告保存变异 id 与未捕获结果。证据把 coverage 与 mutation 两份报告并列。', '执行过不等于证明过'],
      ['补充未覆盖的异常与恢复', '覆盖率报告中红色分支常是超时、唯一键冲突和重试耗尽，应通过注入依赖故障到达，而不是用 `/* istanbul ignore */` 隐藏。用 Testcontainers 制造数据库错误、用 failpoint 或 fake 抛异常，执行测试后检查事务回滚和补偿任务；边界包括第一次失败、重试成功和重试耗尽。失败输出要有 SQLSTATE 或错误码，证据保存前后状态、分支报告与修复记录。', '异常和恢复分支最值得优先覆盖'],
      ['设置门禁并解释缺口', '在 CI 中设按目录的覆盖率阈值，对核心模块要求分支覆盖，同时允许生成代码显式排除；运行 `npx vitest run --coverage --coverage.thresholds.lines=80`，阈值为零或全仓库平均值都不够精确。边界检查新文件、删除文件和小样本是否让比例异常波动。保存趋势图、豁免清单、风险覆盖表和一次 false-positive 复盘，门禁应阻止关键缺口而不是制造数字游戏；阈值未通过时保留失败报告，豁免和趋势作为复算证据。', '阈值必须绑定目录与风险'],
    ],
  },
], q1Examples);

// ── Q2 集成、数据库与契约测试 ───────────────────────────────────────────────
const q2Stage = '集成、数据库与契约测试';
const q2Name = (topic: string) => `测试与工程质量 · ${q2Stage}：${topic}`;

const q2Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['集成层只保留仓储与服务真实边界', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { createPostgresOrderRepository } from './postgres-order-repository';
import { OrderService } from './order-service';

it('persists a paid order through the real repository', async () => {
  const database = await startPostgresDatabase();
  const service = new OrderService(createPostgresOrderRepository(database.pool), new StubPayment({ ok: true }));
  await service.pay({ id: 'o-7', cents: 1200 });
  expect(await database.one('select status from orders where id = $1', ['o-7'])).toEqual({ status: 'paid' });
  await database.stop();
});`, `✓ persists a paid order through the real repository
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    1.84s

支付 SDK 用可控 stub，数据库与 SQL 保持真实，只验证这两者之间的持久化契约。`],
    ['容器镜像固定版本和健康检查', 'Docker Compose YAML', `services:
  postgres:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: orders
    ports:
      - '55432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d orders']
      interval: 2s
      timeout: 2s
      retries: 15`, `Container testing-postgres-1  Healthy
postgres 16.4 on host port 55432
pg_isready -U postgres -d orders
accepting connections

版本与健康检查都在代码中声明，开发者不会因本机 PostgreSQL 版本不同得到另一套结果。`],
    ['就绪条件要求迁移表已可查询', 'PowerShell · Docker', `docker compose up -d postgres
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T postgres psql -U postgres -d orders -tAc "select count(*) = 1 from schema_migrations where version = 12" 2>$null
  if ($LASTEXITCODE -eq 0 -and $?) { $ready = $true; break }
  Start-Sleep -Milliseconds 500
}
Write-Output "business_ready=$ready"
if (-not $ready) { docker compose logs postgres; exit 1 }`, `business_ready=True
schema_migrations version=12 present

仅端口开放不算就绪，测试启动前已经能查询本次迁移版本。`],
    ['随机端口与独立 schema 支撑并行', 'TypeScript · Testcontainers', `import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { expect, it } from 'vitest';

it('isolates a parallel schema and releases the container', async () => {
  const container = await new PostgreSqlContainer('postgres:16.4-alpine').start();
  const schema = 'test_' + process.pid + '_' + Date.now();
  const client = await connect(container.getConnectionUri());
  await client.query('create schema ' + schema);
  await client.query('set search_path to ' + schema);
  await client.query('create table orders(id text primary key)');
  await client.query('insert into orders values ($1)', ['o-42']);
  expect((await client.query('select count(*)::int as count from orders')).rows[0].count).toBe(1);
  await container.stop();
});`, `container mapped to 127.0.0.1:53147
schema test_18420_1763984123102
count=1
container stopped and removed

每次测试拿到随机端口和独立 schema，并行 worker 不会互相清表。`],
    ['基础设施失败时上传容器诊断工件', 'GitHub Actions YAML', `- name: integration tests
  run: pnpm exec vitest run tests/integration --reporter=junit --outputFile=artifacts/integration.xml
- name: capture database diagnostics
  if: failure()
  run: |
    docker compose ps --format json > artifacts/containers.json
    docker compose logs --no-color postgres > artifacts/postgres.log
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: integration-\${{ github.run_id }}
    path: artifacts/`, `容器 ps 显示 postgres State=running Health=starting
postgres.log: database system is ready to accept connections
integration.xml: 8 tests, 1 error at beforeAll
artifact integration-198412 uploaded

业务断言未开始即失败，工件明确标记为环境错误，没有误归因为订单逻辑回归。`],
  ],
  [
    ['空库迁移与旧版本升级分别执行', 'PowerShell · Alembic', `Remove-Item -Recurse -Force .tmp/empty-db -ErrorAction SilentlyContinue
alembic -x database_url=sqlite:///.tmp/empty-db upgrade head
alembic -x database_url=sqlite:///.tmp/old-db upgrade 11
@'
insert into accounts(id, email) values ('a-1', 'user@example.test');
'@ | sqlite3 .tmp/old-db
alembic -x database_url=sqlite:///.tmp/old-db upgrade head
sqlite3 .tmp/old-db "select version_num from alembic_version; select count(*) from accounts;"`, `empty upgrade head: revision 18
old upgrade: 11 -> 18
version_num=18
accounts=1

空库验证全新安装，旧库验证已有数据能保留并升级到同一 head。`],
    ['事务失败时订单与流水同时回滚', 'Python · pytest', `def test_failed_payment_leaves_no_partial_rows(db, checkout):
    with pytest.raises(PaymentRejected):
        checkout.place(order_id="o-9", cents=1200, card="declined")
    assert db.scalar("select count(*) from orders where id = 'o-9'") == 0
    assert db.scalar("select count(*) from payment_attempts where order_id = 'o-9'") == 0
    assert db.scalar("select count(*) from inventory_reservations where order_id = 'o-9'") == 0`, `tests/test_checkout_transaction.py .                            [100%]
1 passed in 0.12s

订单、支付尝试和库存预留必须共享事务；任何一张表残留都说明原子性未成立。`],
    ['两个事务用锁等待制造真实并发冲突', 'psql SQL', `BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 500 WHERE id = 'A';
SELECT pg_sleep(1);
UPDATE accounts SET balance_cents = balance_cents + 500 WHERE id = 'B';
COMMIT;

-- 第二个连接在第一个事务 COMMIT 前执行
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 500 WHERE id = 'B';`,
`A balance 1000 -> 500
B connection waits on row lock for 986 ms
B balance 500 -> 0
sum before=1500 after=500

顺序执行的“并发测试”不会暴露锁竞争；第二条连接必须真实等待第一条提交。`],
    ['进程在提交前退出后由恢复任务清理', 'Python · pytest', `def test_worker_crash_after_reservation_is_recoverable(db, worker, crash_hook):
    crash_hook.exit_after = "RESERVATION_COMMITTED"
    run_killed(worker, order_id="o-13")
    row = db.one("select state from orders where id='o-13'")
    assert row.state == "RESERVING"
    recovery = run_recovery_once(db)
    assert recovery.cleaned == 1
    assert db.scalar("select count(*) from inventory_reservations where order_id='o-13'") == 0`, `worker exit code=137 signal=SIGKILL
order o-13 state=RESERVING
recovery cleaned=1
reservation rows=0

在提交与清理之间强杀进程，验证恢复任务能把半完成状态收敛。`],
    ['隔离级别行为由两个并发读取证明', 'psql SQL', `-- session 1
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance_cents FROM accounts WHERE id = 'A';

-- session 2
UPDATE accounts SET balance_cents = 900 WHERE id = 'A';
COMMIT;

-- session 1 再读
SELECT balance_cents FROM accounts WHERE id = 'A';
COMMIT;`, `session 1 first read=1000
session 2 committed=900
session 1 second read=1000
session 1 commit

相同读取在 REPEATABLE READ 下保持快照；把级别改为 READ COMMITTED 再跑会读到 900。`],
  ],
  [
    ['仓储测试直接执行目标数据库方言', 'SQL · PostgreSQL', `SELECT id, status
FROM orders
WHERE tenant_id = $1
  AND status = $2
ORDER BY created_at DESC, id DESC
LIMIT $3 OFFSET $4
FOR UPDATE SKIP LOCKED;`, `QUERY PLAN
Limit
  -> LockRows
       -> Index Scan using orders_tenant_status_created_idx
Rows Removed by Filter: 0
Execution Time: 0.184 ms

测试在 PostgreSQL 中执行 SKIP LOCKED 并断言计划使用索引；SQLite 替身无法证明这段方言。`],
    ['恶意查询参数只作为值保留', 'Python · psycopg', `def test_customer_name_cannot_change_sql_structure(db, repository):
    malicious = "O'Reilly'; DROP TABLE customers; --"
    repository.save_customer(name=malicious)
    row = db.one("select name from customers where name = %s", (malicious,))
    assert row == (malicious,)
    assert db.scalar("select to_regclass('public.customers') is not null") is True`, `tests/test_customer_sql.py .                                   [100%]
1 passed in 0.06s
table customers exists=True

特殊字符完整保存在 name 字段，customers 表仍存在，证明参数没有被拼为 SQL 语法。`],
    ['并列时间下分页不会重复或漏行', 'TypeScript · Vitest', `import { expect, it } from 'vitest';

it('uses id as a stable tie breaker for equal timestamps', async () => {
  const repository = await new PostgresOrderRepository().connect();
  await repository.insertMany([
    { id: 'o-3', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'o-1', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'o-2', createdAt: '2026-01-01T00:00:00Z' },
  ]);
  const first = await repository.page({ limit: 2, after: null });
  const second = await repository.page({ limit: 2, after: first.nextCursor });
  expect([...first.ids, ...second.ids]).toEqual(['o-3', 'o-2', 'o-1']);
});`, `✓ uses id as a stable tie breaker for equal timestamps
first=[o-3, o-2] second=[o-1]
duplicates=0 missing=0

三行时间完全相同，只有追加 id 排序才能保证游标分页稳定。`],
    ['查询计数断言防止 N+1 放大', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
import { createInstrumentedPool } from './testing-query-log';

it('loads twenty orders with at most two queries', async () => {
  const pool = createInstrumentedPool();
  const orders = await new OrderRepository(pool).listWithCustomers({ limit: 20 });
  expect(orders).toHaveLength(20);
  expect(pool.queries).toHaveLength(2);
  expect(pool.queries[1].sql).toContain('where customer_id = any($1)');
});`, `✓ loads twenty orders with at most two queries
queries=2 returned=20
1: select * from orders limit 20
2: select * from customers where customer_id = any($1)

若逐条查询客户，queries 会变成 21，测试直接暴露查询放大。`],
    ['租户与软删除条件必须出现在真实 SQL', 'SQL · PostgreSQL', `CREATE POLICY tenant_orders ON orders
USING (tenant_id = current_setting('app.tenant_id')::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

SELECT id
FROM orders
WHERE deleted_at IS NULL
  AND tenant_id = current_setting('app.tenant_id')::uuid;`, `set app.tenant_id='tenant-a';
selected=[o-a-1]
set app.tenant_id='tenant-b';
selected=[]
deleted row o-a-2 matched policy but hidden by deleted_at

真实 PostgreSQL 行策略先隔离租户，软删除条件再过滤，ORM 层绕过也读不到他租户数据。`],
  ],
  [
    ['消息包含稳定事件标识和确认条件', 'TypeScript · KafkaJS', `import { expect, it } from 'vitest';
import { publishOrderPaid } from './events';

it('publishes a keyed event with a stable id', async () => {
  const broker = await startKafka();
  const producer = broker.producer();
  const event = { id: 'evt-42', type: 'order.paid', occurredAt: '2026-03-01T10:00:00Z', orderId: 'o-42' };
  await publishOrderPaid(producer, event);
  const message = await broker.consumeOne('orders.events', { groupId: 'test-contract' });
  expect(message.key?.toString()).toBe('o-42');
  expect(JSON.parse(message.value.toString())).toEqual(event);
});`, `produced topic=orders.events partition=0 offset=17 key=o-42
consumed event id=evt-42 type=order.paid
ack committed group=test-contract

事件身份与分区键落入真实 broker，消费确认后才算链路成功。`],
    ['生产成功后等待消费者投影落库', 'TypeScript · Vitest', `import { expect, it, vi } from 'vitest';

it('feeds a producer test through the real topic into PostgreSQL', async () => {
  const stack = await startOrderStack();
  await stack.producer.publish({ id: 'evt-91', type: 'order.created', orderId: 'o-91' });
  await stack.consumer.waitForProjection('o-91', { timeoutMs: 5000 });
  const row = await stack.db.one('select status from order_views where order_id=$1', ['o-91']);
  expect(row.status).toBe('created');
  await stack.stop();
});`, `topic orders.events received 1 message
consumer group order-projector committed offset 0
order_views o-91 status=created
stack stopped

只断言 producer 返回不够，测试等待真实 consumer 完成投影后才检查数据库。`],
    ['重复发布同一事件只产生一次业务效果', 'TypeScript · KafkaJS', `import { expect, it } from 'vitest';

it('deduplicates redelivered evt-42 by consumer event id', async () => {
  const stack = await startOrderStack();
  const event = { id: 'evt-42', type: 'order.paid', orderId: 'o-42' };
  await stack.publish(event);
  await stack.publish(event);
  await stack.waitForOffset('order-projector', 2);
  const rows = await stack.db.query('select event_id from payment_events where order_id=$1', ['o-42']);
  expect(rows).toEqual([{ event_id: 'evt-42' }]);
});`, `partition offsets consumed=0,1
event evt-42 processed first=INSERT second=DUPLICATE_IGNORED
payment_events rows=1

broker 实际投递两次，消费者用 event_id 唯一键吸收重复，业务表仍只有一行。`],
    ['重试耗尽后死信保留原始负载和异常', 'TypeScript · Vitest', `import { expect, it } from 'vitest';

it('routes a poison message to the dead-letter topic with context', async () => {
  const broker = await startKafka();
  await broker.publish('orders.events', {
    key: 'o-bad',
    value: JSON.stringify({ id: 'evt-bad', type: 'order.paid', orderId: 'o-bad', amount: 'NaN' }),
    headers: { 'x-attempt': '1' },
  });
  await broker.waitForMessage('orders.events.dlq');
  const dead = await broker.consumeOne('orders.events.dlq');
  expect(dead.headers['x-error']?.toString()).toContain('AMOUNT_INVALID');
  expect(JSON.parse(dead.value.toString()).id).toBe('evt-bad');
});`, `orders.events attempts=3 consumer saw AMOUNT_INVALID
orders.events.dlq offset=0
x-error=AMOUNT_INVALID x-attempt=3
payload id=evt-bad preserved=true

死信保留事件标识、原始值、尝试次数和错误码，修复消费者后可以受控重放。`],
    ['每个测试使用独立主题前缀和消费组', 'TypeScript · Vitest', `import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it('isolates topics by test run', async () => {
  const runId = randomUUID().slice(0, 8);
  const input = 'orders.events.' + runId;
  const group = 'order-projector.' + runId;
  const broker = await startKafka();
  const consumer = await broker.consumer({ groupId: group });
  await consumer.subscribe({ topic: input });
  await broker.publish(input, { key: 'o-1', value: '{"id":"evt-1"}' });
  const message = await consumer.next(3000);
  expect(message.topic).toBe(input);
  await broker.deleteTopics([input]);
});`, `run_id=8f21ac90
topic=orders.events.8f21ac90 group=order-projector.8f21ac90
consumer received evt-1
deleted topics=1

独立前缀避免残留 offset 污染下一轮测试，结束后删除测试主题。`],
  ],
  [
    ['消费者只为实际读取的字段建立契约', 'Pact JS', `import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
const { like, string } = MatchersV3;
const provider = new PactV3({ consumer: 'checkout-web', provider: 'orders-api' });

describe('GET /orders/:id', () => {
  it('returns the fields needed by the confirmation page', async () => {
    provider
      .given('order 42 exists')
      .uponReceiving('a request for order 42')
      .withRequest({ method: 'GET', path: '/orders/42' })
      .willRespondWith({
        status: 200,
        body: { id: string('42'), status: like('paid'), totalCents: like(2500) },
      });
    await provider.executeTest(async (mock) => {
      const order = await fetchOrder(mock.url, '42');
      expect(order).toMatchObject({ id: '42', status: 'paid', totalCents: 2500 });
    });
  });
});`, `Pact contract generated: checkout-web-orders-api.json
interaction GET /orders/42
consumer test passed

契约只声明确认页使用的 id、status 和总价，没有把服务端内部字段全部冻结。`],
    ['精确字段与类型匹配各放在正确位置', 'YAML · Pact Contract', `consumer: checkout-web
provider: orders-api
interactions:
  - description: order status response
    request:
      method: GET
      path: /orders/42
    response:
      status: 200
      headers:
        content-type: application/json
      body:
        id: '42'
        status:
          matchers:
            - match: type
              value: paid
        totalCents:
          matchers:
            - match: integer
              value: 2500`, `contract validation passed
id exact="42"
status matcher=type value=paid
totalCents matcher=integer

id 是路径资源身份保持精确，状态与金额只约束协议类型，提供者可增加其他字段。`],
    ['提供者用真实路由验证契约', 'PowerShell · Pact CLI', `pact-verifier verify \
  --provider-base-url http://localhost:8080 \
  --pact-broker-base-url http://localhost:9292 \
  --provider orders-api \
  --provider-states-setup-url http://localhost:8080/_pact/state \
  --publish-verification-results \
  --provider-app-version 2.7.1
Write-Output "verify_exit=$LASTEXITCODE"`, `Verifying a pact between checkout-web and orders-api
Given order 42 exists
GET /orders/42 returns a response which
  has status code 200
  has a matching body
1 interaction verified
verify_exit=0

契约在真实订单路由和状态夹具上通过，并发布到 broker 作为发布证据。`],
    ['消息契约围绕可消费事件字段', 'Pact JS · Message', `provider
  .given('order 42 is paid')
  .uponReceiving('an order paid event')
  .withContent({ id: like('evt-42'), type: 'order.paid', orderId: like('o-42'), paidCents: like(2500) })
  .withMetadata({ contentType: 'application/json', 'kafka-key': like('o-42') })
  .verify(async (event) => {
    const projection = projectOrderPaid(event);
    expect(projection).toEqual({ orderId: 'o-42', state: 'paid', paidCents: 2500 });
  });`, `message interaction generated
consumer projection passed
event id=evt-42 key=o-42 state=paid

契约从消费端投影需求出发，验证消息键和 JSON 字段，而不是绑定生产者的类结构。`],
    ['发布前用 broker 判断兼容部署顺序', 'PowerShell · Pact Broker', `pact-broker can-i-deploy \
  --pacticipant checkout-web \
  --version 3.4.0 \
  --to-environment production
pact-broker can-i-deploy \
  --pacticipant orders-api \
  --version 2.7.1 \
  --to-environment production
Write-Output "consumer_exit=$LASTEXITCODE provider_exit=$LASTEXITCODE"`, `checkout-web 3.4.0 can deploy: true
orders-api 2.7.1 can deploy: true
verified against all recorded consumers
consumer_exit=0 provider_exit=0

门禁查询的是 broker 中真实验证矩阵，不再只检查仓库里是否存在契约文件。`],
  ],
  [
    ['测试数据统一带运行命名空间', 'TypeScript · Vitest', `import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it('marks every fixture with the current run id', async () => {
  const runId = 'run-' + randomUUID().slice(0, 8);
  const fixture = await createCustomerFixture({ email: 'buyer+' + runId + '@example.test' });
  expect(fixture.email).toContain(runId);
  expect(fixture.namespace).toBe(runId);
  await cleanupNamespace(fixture.namespace);
  expect(await countByNamespace(fixture.namespace)).toBe(0);
});`, `created customer id=cus-81 namespace=run-6e18f2ab
cleanup namespace=run-6e18f2ab deleted=3
remaining rows=0

邮箱和所有关联行都带同一运行标识，失败时能只清理本轮数据。`],
    ['需要提交语义的场景改用显式清理', 'TypeScript · Vitest', `import { afterEach, expect, it } from 'vitest';
const createdOrderIds: string[] = [];
afterEach(async () => {
  await db.query('delete from order_events where order_id = any($1)', [createdOrderIds]);
  await db.query('delete from orders where id = any($1)', [createdOrderIds]);
});

it('observes a committed row from another connection', async () => {
  const order = await placeOrderWithCommit({ id: 'o-commit-1' });
  createdOrderIds.push(order.id);
  const otherConnection = await db.connect();
  const visible = await otherConnection.one('select status from orders where id=$1', [order.id]);
  expect(visible.status).toBe('created');
  await otherConnection.end();
});`, `order o-commit-1 committed on connection A
connection B observed status=created
cleanup deleted events=1 orders=1

测试需要真实 COMMIT，不能用外事务回滚，因此 afterEach 按运行命名空间显式删除。`],
    ['固定种子与时区生成相同测试日', 'PowerShell · pytest', `$env:PYTHONHASHSEED='17'
$env:TZ='Asia/Shanghai'
$env:TEST_CLOCK='2026-03-29T01:30:00+08:00'
pnpm exec pytest tests/test_schedule_factory.py --junitxml=artifacts/schedule.xml
Write-Output "seed=17 tz=$env:TZ clock=$env:TEST_CLOCK exit=$LASTEXITCODE"`, `Python random seed=17 timezone=Asia/Shanghai
fixture first slots 2026-03-29T09:00:00+08:00 2026-03-29T10:00:00+08:00
seed=17 tz=Asia/Shanghai clock=2026-03-29T01:30:00+08:00 exit=0

换机器但保留相同种子和时区，日期、序号与周几仍保持一致。`],
    ['断言失败后仍清理锁和临时 schema', 'TypeScript · Vitest', `import { afterEach, expect, it } from 'vitest';
let schema: string | undefined;
afterEach(async () => {
  if (schema) await db.query('drop schema if exists ' + schema + ' cascade');
});

it('cleans exactly when the business assertion fails', async () => {
  schema = 'test_run_71';
  await db.query('create schema test_run_71');
  await db.query('create table test_run_71.accounts(id int primary key)');
  expect(await accountCount(schema)).toBe(1);
});`, `× cleans exactly when the business assertion fails
Expected: 1
Received: 0
afterEach drop schema test_run_71 cascade
schema exists=false locks=0

即使主体断言先失败，清理钩子仍执行，下一次运行不会撞到残留表。`],
    ['并行执行与同输入重跑都通过', 'PowerShell', `1..4 | ForEach-Object -Parallel {
  $env:TEST_RUN_ID = "parallel-$_"
  pnpm exec vitest run tests/integration --reporter=junit --outputFile="artifacts/parallel-$_.xml"
} -ThrottleLimit 4
pnpm exec vitest run tests/integration --reporter=junit --outputFile=artifacts/rerun.xml
Get-ChildItem artifacts/parallel-*.xml | ForEach-Object { [xml](Get-Content $_.FullName) }`, `parallel-1 tests=24 failures=0
parallel-2 tests=24 failures=0
parallel-3 tests=24 failures=0
parallel-4 tests=24 failures=0
rerun tests=24 failures=0

四个并发命名空间和一次顺序重跑都通过，隔离才具有工程证据。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q2_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q2Name('集成测试边界与容器依赖'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能运行单元测试，并知道本机端口、环境变量和外部服务启动顺序会影响测试结果。',
    goal: '能识别单元测试与集成测试的边界，用 Testcontainers 启停真实数据库或消息服务，等待健康状态并通过固定镜像、网络配置和日志证据保证可重复。',
    guidedPractice: '把一个连接本机 PostgreSQL 的仓储测试改为 `@Testcontainers` 或 Testcontainers for Node，让容器随机映射端口并注入连接串；启动时执行 `docker pull postgres:16.4-alpine` 并记录镜像 digest。故意在容器未就绪时连接，保存 `Connection refused`、容器日志和重试结果，再加入健康等待。',
    independentPractice: '为一个 HTTP 服务建立 PostgreSQL 与 Redis 双容器测试，验证数据库写入后缓存失效；提交容器启动配置、失败日志、健康检查命令和一次干净环境全绿报告。',
    commonErrors: [
      '继承一个在本机长期运行的数据库，测试依赖历史数据，换到 CI 就因表不存在或旧记录失败。',
      '只等待端口可连接就发请求，没有等待数据库接受查询，偶发 `the database system is starting up` 被当成业务回归。',
    ],
    sourceRefs: [sources.testcontainers, sources.postgres, sources.junit],
    steps: [
      ['划清真实依赖边界', '集成测试应验证代码与真实基础设施的协作，例如 SQL 方言、事务提交、序列化和连接池；纯业务分支仍留在单元层。用测试名或目录区分 `tests/integration`，命令 `./gradlew integrationTest` 或 `pnpm vitest run tests/integration` 只启动必要容器。边界包括冷启动、端口冲突和服务不可达，失败报告要说明连接的是容器还是外部地址。证据保存容器规格、环境变量键名与测试耗时，不把真实密码写进报告。', '集成层只承担基础设施契约'],
      ['用容器固定数据库版本', 'Testcontainers 为每个测试会话创建独立容器，`new PostgreSQLContainer<>("postgres:16.4-alpine")` 或 `GenericContainer` 获取随机端口，应用配置通过 `getJdbcUrl()` 注入。先执行 `docker image inspect` 记录 digest，边界考虑镜像不存在、拉取超时和 host Docker socket 不可用；失败时收集容器 state、端口映射与启动日志。证据应包含镜像 digest、Command 和容器日志，保证他人能启动同一环境，换机器也能复现同样的数据库行为。', '数据库版本和端口都要由代码声明'],
      ['等待真正的就绪信号', '端口打开不代表数据库能执行查询，Testcontainers 的 `waitingFor` 可等待日志、端口或健康检查；Java 可配置 `Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(60))`，Node 可轮询 `pg_isready`。边界把超时设为刚好触发与正常完成两档，失败日志要包含最后十行 stdout/stderr 与等待条件。保存启动时间轴、健康命令和容器事件，避免把启动慢误判为业务测试失败，这一区分对定位问题很重要。', '就绪条件是业务可执行而非仅端口开放'],
      ['隔离网络、卷和并行资源', '每个测试使用独立数据库名或 schema，容器端口随机分配，不能把 5432 写死；测试结束删除卷，避免上一次数据污染。并行运行时检查容器名冲突和连接池上限，边界覆盖两个 worker 同时启动与一个容器提前退出。失败时保存 `docker ps -a`、网络配置和数据库名，证据包含清理命令。若需要复用容器，必须证明表状态重置且测试之间没有顺序依赖。', '随机端口、独立 schema、结束清理'],
      ['把集成故障变成可读工件', '在 CI 中运行容器测试时，失败步骤应上传容器日志、测试 XML 和 `docker compose ps` 输出；命令 `npx vitest run --reporter=junit --outputFile=junit.xml` 保留单测结果。边界检查 Docker daemon 缺失、镜像拉取失败和内存不足三种状态，错误应明确标为基础设施而不是断言失败。最终证据包含固定镜像、启动等待、失败分类和重跑结果，让值班者能区分产品缺陷与环境故障。', '基础设施失败要和业务失败分开'],
    ],
  },
  {
    name: q2Name('数据库迁移、事务和隔离'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '会写基本 SQL 和事务，能通过迁移工具创建表，并理解提交、回滚与并发事务的差异。',
    goal: '能用真实数据库验证迁移、提交、回滚和隔离级别，复现唯一键冲突与并发更新，并通过日志、SQLSTATE 和数据库快照证明恢复行为。',
    guidedPractice: '在 Testcontainers PostgreSQL 中先执行 `alembic upgrade head` 或 Flyway migration，再写测试插入订单并触发重复唯一键，断言事务回滚后 `orders` 与 `ledger` 行数都不变。用两个连接同时更新同一行，观察 `40P01` 死锁或等待超时，保存 `pg_stat_activity` 与迁移版本。',
    independentPractice: '为一个账户余额迁移设计向前与回滚方案，测试大批量回填失败后的断点恢复，并记录隔离级别、锁等待、SQLSTATE 与最终一致性检查。',
    commonErrors: [
      '用内存数据库替代生产 PostgreSQL，忽略 JSONB、锁、隔离级别和迁移语法差异。',
      '测试只验证提交成功，没有验证异常时所有相关表都回滚，留下部分写入或迁移版本漂移。',
    ],
    sourceRefs: [sources.postgres, sources.testcontainers, sources.pytest],
    steps: [
      ['迁移先覆盖空库与旧库', '迁移测试至少走两条路径：空数据库执行全部版本，以及从上一个生产版本升级。用 `alembic upgrade head`、`flyway migrate` 或测试容器启动后读取 `schema_version`，断言表、索引和默认值。边界包括重复执行 migration、部分版本缺失和回填数据为空；失败日志保存 SQL、SQLSTATE、当前 revision 与容器版本。证据是可重复的空库快照和升级前后 schema diff，不只检查命令退出码。', '迁移必须覆盖空库和升级路径'],
      ['用真实事务验证原子性', '测试在一个事务中插入订单、扣减库存、写入流水，随后故意让第三步违反约束，观察异常后前两步是否消失。应用层可用 `BEGIN`、`COMMIT`、`ROLLBACK` 或 ORM transaction context，断言 orders、inventory、ledger 三表计数。边界要有嵌套事务或 savepoint 场景，失败信息保留 `SQLSTATE 23505`、约束名和回滚行数。证据包含异常栈、前后查询结果和事务隔离配置。', '原子性要检查所有相关表'],
      ['制造并发冲突而非顺序执行', '用两条独立连接同时执行更新，验证乐观锁 version 或悲观锁等待是否符合契约；可在 `READ COMMITTED` 和 `REPEATABLE READ` 下对照结果。命令可以是并行 pytest、Gradle executor 或 Node Promise，边界覆盖同时写入、后到请求和死锁订单。失败时收集阻塞查询、锁等待时长与 PostgreSQL 日志，不能只看到超时。证据保留 SQL、隔离级别、执行时序和最终行数据，解释系统在竞争下选择了何种结果。', '并发测试必须让两个事务真实重叠'],
      ['验证失败后的恢复路径', '让迁移在回填中途失败，例如在第二千行触发唯一键，再执行续跑或回滚；确认 revision 表、业务表和索引都处于可解释状态。应用恢复可测试重试任务是否会重复扣款，边界包括一次成功、重复调用和进程在提交后崩溃。失败日志要记录检查点、已处理数量与 SQLSTATE，证据保存数据库前后快照和恢复脚本。恢复完成后再跑一致性 SQL，证明没有孤儿记录。', '中断点决定恢复设计'],
      ['固定隔离级别与观测数据', '测试开始时显式设置 `transaction_isolation`，检查 `SELECT current_setting` 返回预期值；不同数据库默认值不能默默替代。为死锁与序列化失败设重试预算，边界检查首次冲突成功重试、超过次数返回稳定错误。失败输出保存事务 ID、锁对象和耗时，证据包含数据库配置、`EXPLAIN (ANALYZE, BUFFERS)` 与测试报告。门禁中保留迁移和事务测试，避免只跑纯 SQL 快照。', '隔离级别必须被测试看到'],
    ],
  },
  {
    name: q2Name('Repository 与真实 SQL'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会通过 ORM 或 SQL 访问数据库，能读懂查询计划并知道参数化查询与拼接字符串的安全差异。',
    goal: '能用真实 SQL 验证 Repository 的过滤、排序、分页和空值行为，检查参数绑定与查询计划，并定位 N+1、错误排序和越权读取。',
    guidedPractice: '为订单仓储准备包含空备注、已删除记录和不同租户的数据，执行 `findByCustomer(customerId, page, size)`，断言总数、排序和分页边界。打开 `EXPLAIN (ANALYZE, BUFFERS)` 查看索引使用，故意把 tenantId 条件删掉，观察跨租户数据泄漏与测试失败信息；保存查询 SQL、参数列表和执行计划。',
    independentPractice: '给一个列表接口补 Repository 集成测试，覆盖空结果、最大页大小、稳定排序、软删除和租户隔离；提交查询计划、N+1 日志、失败 SQL 与修复后的结果。',
    commonErrors: [
      '只用 mock 仓储验证 ORM 方法被调用，真实 SQL 的字段名、排序和 NULL 语义完全没有执行。',
      '测试只断言返回条数，不检查稳定排序和总数，分页在相同时间戳或空值时可能重复或漏数据。',
    ],
    sourceRefs: [sources.testcontainers, sources.postgres, sources.junit],
    steps: [
      ['用真实方言执行查询', 'Repository 测试应连接与生产同版本的 PostgreSQL，通过应用公开方法读取真实表，断言实体字段、总数和排序。测试先用 SQL 或 migration 插入固定数据，再调用 `repository.findPage(...)`；不要只 mock ORM。边界包含空表、单行、超过一页和重复排序键，失败时输出 SQL、参数与 SQLSTATE。证据保存容器版本、查询报告和结果快照，证明验证的是数据库方言而非替身。', '仓储契约必须由真实方言验证'],
      ['参数化查询阻断拼接', '测试输入包含单引号、`%`、反斜杠和超长字符串，确认 Repository 使用绑定参数，查询按字面值匹配而不改变 SQL 结构。可打开 `log_statement=all` 查看实际 SQL 与 `$1` 参数，边界还要覆盖空字符串与 Unicode。失败时保存最终 SQL、参数数组与数据库错误码，但证据要脱敏。若测试看到语法错误或全表返回，说明拼接或通配符转义有缺陷。', '特殊字符是 SQL 边界输入'],
      ['检查分页与稳定排序', '分页要求 `ORDER BY created_at DESC, id DESC` 这类稳定键，测试同一时间戳三条记录并取两页，合并后不能重复或缺失。执行 `EXPLAIN (ANALYZE, BUFFERS)` 观察排序与索引扫描，边界检查 page=0、最大 size、负 offset 和最后一页空白。失败报告要列出每页 id 顺序与 total，证据保存查询计划、分页结果和时区设置，避免只在开发机数据量小的情况下通过。', '没有稳定排序就没有可重复分页'],
      ['定位 N+1 与查询放大', '在一页包含多个订单和客户时，记录执行的 SQL 条数，预期为一条主查询或明确的批量查询；ORM 日志和 OpenTelemetry span 可用于计数。边界从 1 页 10 条扩到 100 条，若查询数随行数线性增长，保存每条 SQL、参数和耗时作为 N+1 证据。失败后改为 join 或批量加载，再对比查询数。报告同时记录索引与内存，避免只把多次查询藏进缓存。', '查询数量也要成为断言'],
      ['证明租户与软删除边界', '仓储测试要覆盖跨租户读取、已删除记录、空 tenantId 和超级管理员场景，断言业务查询返回 404/空集合而不是另一租户数据。SQL 中租户条件必须由公开接口提供，边界测试不能只在服务层补过滤。失败时保存请求租户、数据库 tenant_id 和响应体，证据包含最外层查询与数据库行。修复后运行全量集成测试并检查查询计划，确保隔离条件仍能命中复合索引。', '隔离条件要落在真实查询上'],
    ],
  },
  {
    name: q2Name('消息生产消费和重复投递'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能启动消息中间件客户端，理解确认、重试、消息键和幂等消费的基本概念。',
    goal: '能用真实 Kafka 或 RabbitMQ 验证发布、消费、确认与重复投递，构造重复消息和消费失败，检查幂等键、死信队列和可追溯的消息证据。',
    guidedPractice: '用 Testcontainers 启动 Kafka 或 RabbitMQ，生产一条 `OrderPaid` 消息并让消费者写入订单状态；把同一消息再投递一次，断言流水只增加一条。让消费者在第一次处理时抛错，观察重试次数、DLQ 消息和原始 headers，保存 topic、partition、offset 或 delivery tag。',
    independentPractice: '为一个库存消息消费者补四类测试：正常消费、重复投递、暂时失败后成功、持续失败进入死信；提交消息日志、幂等表、DLQ 内容和恢复命令。',
    commonErrors: [
      '生产消息后只断言 send 返回成功，没有等待消费者真正处理与提交位点。',
      '重复投递测试只调用两次消费函数，没有模拟 broker 的重新投递和确认语义，幂等键在真实链路仍可能失效。',
    ],
    sourceRefs: [sources.kafka, sources.rabbitmq, sources.testcontainers],
    steps: [
      ['固定消息和确认协议', '先定义消息键、payload schema、确认方式和失败策略，例如 `order.paid` 使用订单号作 partition key，消费者成功后手动 ack。测试启动真实 broker，发布一条带 `messageId` 的消息并用 `await consumer.waitFor(...)` 等待业务结果；边界包括空 payload、未知事件类型和重复 id。失败日志保存 topic、partition、offset、deliveryTag 与异常栈，证据让 broker 状态和数据库结果能对应，两者缺一不可，否则无法还原真实消费链路。', '确认前先定义消息身份'],
      ['验证生产者到消费者链路', '测试应通过真实 producer API 发送 JSON，确认 headers 不被丢失，再查询消费者写入的状态；Kafka 可读取 `records[0].offset`，RabbitMQ 可检查 routing key 和队列深度。边界覆盖空队列、消费者晚启动和消息键相同，失败时保存 producer 回调错误与 broker 日志。证据包含消息 id、offset/delivery tag、消费日志和最终数据库行，不能只看函数 mock 的调用，否则定位链路会断线。', '生产成功不等于消费成功'],
      ['制造重复投递与幂等', '用相同 messageId 发送两次，或在消费者提交前强制断开连接让 broker redeliver；幂等表应有唯一键，业务结果只生效一次。命令可重复 `pytest tests/test_consumer.py -k duplicate`，边界还测试同一业务 id 不同 messageId。失败输出显示插入冲突、已处理数量和重复流水，证据保存 broker 重投记录、幂等 SQL 与最终余额。若只是测试调用两次函数，无法证明确认窗口内的真实行为。', '重复消息必须由 broker 触发'],
      ['观察重试与死信', '让处理器在第一次调用时抛出临时异常，第二次成功；随后持续抛业务异常，确认达到 `max_retries` 后进入 DLQ，原始 headers 和异常原因仍可读取。边界包括重试耗尽、消息格式错误和消费者停机，失败日志保存重试计数、延迟与死信路由。证据包含消费者指标、DLQ 消息、业务表和重放命令，恢复时只重放已确认的坏消息，避免无限循环。', '死信要保留可重放上下文'],
      ['清理消息与测试隔离', '每个测试使用唯一 topic、队列或消费组，结束后删除，防止未消费消息影响下一次运行；并行时检查分区数和消费者组冲突。边界覆盖空 topic、已删除队列和测试中途 broker 重启，失败信息保存 broker 版本、topic 配置和残留消息数。最终工件包含消息轨迹、幂等表、DLQ 与一次从失败到恢复的报告，证明测试不是依赖本机长期运行的 MQ；清理阶段可用 `docker compose down -v` 删除临时卷。', '主题、组和队列必须按测试隔离'],
    ],
  },
  {
    name: q2Name('消费者驱动契约'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能描述 HTTP 或消息接口的请求、响应和状态码，并理解消费者与提供者分别维护代码的含义。',
    goal: '能用 Pact 等消费者驱动契约锁定请求字段、响应状态和可选字段边界，在提供者真实接口上验证契约，并解释契约测试与端到端测试的职责差异。',
    guidedPractice: '为订单查询客户端写 Pact 交互：`GET /orders/42` 必须返回 200、`status` 和 `totalCents`，可选 `coupon` 允许缺失；运行 `./gradlew pactVerify` 或 Pact 消费者测试生成 pact 文件。让提供者删掉 `totalCents`，读取验证失败的字段差异与请求路径，保存 pact 版本和 broker 发布记录。',
    independentPractice: '为一个创建订单 API 建立消费者契约，覆盖成功、字段校验失败和旧客户端兼容；让提供者故意新增必填字段，验证契约能否拦截破坏性变更并生成报告。',
    commonErrors: [
      '契约里写了所有内部响应字段并逐一严格匹配，消费者新增无关字段时测试误报，契约没有表达真正依赖。',
      '只生成 pact 文件而不在提供者端验证，契约停留在消费者自说自话，发布时仍可能破坏接口。',
    ],
    sourceRefs: [sources.pact, sources.googleBehavior, sources.junit],
    steps: [
      ['从消费者依赖写契约', '消费者契约只记录实际使用字段、请求方法和状态码，例如订单页面依赖 `id`、`status`、`totalCents`，不把服务端内部 `updatedBy` 写入。Pact 的 `given("order 42 exists").uponReceiving("get order").withRequest(...).willRespondWith(...)` 定义交互，边界包含可选 coupon 缺失和空列表。运行消费者测试后保存 pact JSON 与消费者版本，失败报告显示 matcher 不匹配字段。契约评审还须确认字段来源与兼容范围，避免消费方依赖了偶然出现的字段。', '契约只表达消费者真正依赖'],
      ['选择匹配器与兼容边界', '字符串可使用类型匹配，数字使用范围或类型，枚举状态需要精确集合；不要把 `like("")` 用在金额或权限字段上导致任意值通过。为新增可选字段记录向后兼容，为破坏性字段变更新增契约版本；运行测试后用 `jq` 检查 pact 文件中的 matchingRules。失败日志保存期望与实际响应差异，证据含契约文件、consumer version 和所属分支；边界清单还要明确哪些字段必填、哪些允许缺失。', '匹配器越宽，契约保护越弱'],
      ['在提供者端真实验证', '提供者启动后从 Pact Broker 拉取指定消费者版本，将 `given` 映射到测试数据，执行真实路由并核对响应。命令 `./gradlew pactVerify -Ppactbroker.url=...` 或 `npx pact-verifier` 输出每个交互结果；边界覆盖无数据、权限拒绝和空数组。失败时保存请求路径、响应体、provider state 与日志，证据包括 broker 发布版本和验证报告，并把结果回传契约平台保留版本链接。', '契约必须在提供者代码上执行'],
      ['处理消息契约', '消息消费者契约要固定事件类型、schema 版本、必填字段和幂等键，不把生产者的内部查询对象暴露给主题。用 Pact message provider 或 JSON Schema 验证序列化后的 payload，边界测试未知新增字段、缺失必填字段和旧版本。失败输出保留消息 id、schema 差异与 broker offset，证据保存 pact 文件、消息样例和消费者处理结果。消费者应忽略不依赖的新增字段，但对必填字段缺失明确失败；`npx pact-verifier` 可执行消息提供者验证。', '消息契约围绕事件而非内部对象'],
      ['把验证接入发布门禁', '在提供者 PR 中运行受影响消费者契约，发布前运行全部契约并发布 verification result；命令输出 `can-i-deploy` 或 broker 验证结果，边界检查 broker 不可达、消费者版本缺失和网络超时。失败要区分契约破坏与基础设施故障，保存 pact URL、版本、环境与日志。证据包含通过矩阵、失败交互和回滚版本，确保契约发现的是接口兼容风险而非替代全部 E2E。', '发布前验证兼容而非只生文件'],
    ],
  },
  {
    name: q2Name('测试数据、清理和可重复性'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能通过 SQL、ORM 或 API 创建测试数据，并理解唯一约束、事务回滚和并行测试之间的影响。',
    goal: '能设计带命名空间、固定标识和清理钩子的测试数据，让测试可重复、可并行且失败后可诊断，避免依赖生产快照或执行顺序。',
    guidedPractice: '为订单测试创建唯一 `test_run_id` 与租户前缀，使用工厂函数插入用户、订单和库存；在每个测试后用 `DELETE ... WHERE run_id = $1` 清理，并发运行两个 worker。故意留下一个跨测试依赖的余额，再执行 `pytest -n 2` 或 Vitest 多 worker，读取唯一键冲突和残留行证据。',
    independentPractice: '为一个包含数据库与消息的集成测试建立数据生命周期，覆盖正常清理、中途失败清理和并行隔离；提交种子、清理脚本、残留检查与并行报告。',
    commonErrors: [
      '每个测试都清空全库，导致并行 worker 互相删除数据，失败还表现为随机的查询为空。',
      '只清理主表不清理消息、流水和缓存，第二次运行时唯一约束冲突或读取到上次残留状态。',
    ],
    sourceRefs: [sources.postgres, sources.testcontainers, sources.pytest],
    steps: [
      ['给测试数据命名空间', '为每次运行生成 `run_id = crypto.randomUUID()`，所有用户、订单和消息键带此前缀，测试只查询本命名空间。用工厂函数 `createOrder(runId, {...})` 保证字段完整，命令 `npx vitest run tests/integration --poolOptions.threads.singleThread=false` 验证并行。边界包括空表、重复键和同一 run 内多租户，失败日志必须显示 run_id 与冲突键；证据保存 run_id、插入 SQL 和查询结果，清理时也只按该标识删除，不触碰其他测试的数据。', '所有测试数据必须可归属到一次运行'],
      ['选择事务或显式清理', '只测查询和回滚时可以在外层事务中执行并在 finally 回滚；需要测试真实提交、消息或异步任务时必须显式清理。边界测试提交后连接断开、清理脚本失败和服务重启，失败信息保存未删除表与约束名。证据包含清理 SQL、删除行数和残留检查，不能把“测试环境会自动清空”当假设。事务回滚不能覆盖 broker 消息和外部 HTTP 副作用。', '提交语义决定能否用事务包裹'],
      ['使用确定性种子与时区', '固定用户、金额、订单号和邮件内容，时间字段用显式 UTC 值或固定时钟，随机字段只允许 run_id 变化。数据库 seed 通过 SQL 文件或 factory 版本化，边界检查前一天、当天和时区切换点。运行两次相同测试，比较 result XML 中的用例名与数据；差异过大应保存二分后的字段。证据包括 seed 文件哈希、时区和两次执行结果；若结果不一致，要保留失败报告并对照 seed 排查。', '可重复数据要控制时间和随机源'],
      ['覆盖失败中的清理', '在测试执行到插入订单后主动抛异常，确认 `afterEach`、fixture finalizer 或 JUnit extension 仍能清理；若进程被强制终止，测试启动时执行按 run_id 的孤儿清扫。边界要覆盖数据库连接断开和清理语句超时，失败日志保留 run_id、事务状态和未清理行。证据包含故障注入配置、清理日志与一次全量残留查询，确保失败不会污染下一次。', '失败路径同样要回收资源'],
      ['做并行与重跑验收', '同一套测试至少执行单 worker、两 worker 和失败后立即重跑，检查唯一键、死锁与残留；命令 `pytest -n 2`、`npx vitest run --maxWorkers=2 --retry=0` 可暴露共享状态。边界加一条并发创建同业务键，确认系统按契约返回冲突而非随机崩溃。最终报告保存 run_id、并行日志、耗时、残留计数和修复 diff，证明数据生命周期独立于执行顺序。', '并行通过才说明隔离成立'],
    ],
  },
], q2Examples);

// ── Q3 浏览器 E2E、组件与可访问性 ───────────────────────────────────────────
const q3Stage = '浏览器 E2E、组件与可访问性';
const q3Name = (topic: string) => `测试与工程质量 · ${q3Stage}：${topic}`;

const q3Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['从可访问树渲染优惠券组件', 'TSX · Testing Library', `import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { CouponPanel } from './CouponPanel';

test('renders the user-facing coupon task', () => {
  render(<CouponPanel state="idle" />);
  expect(screen.getByRole('heading', { name: '优惠券' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: '优惠券代码' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '应用' })).toBeEnabled();
});`, `✓ renders the user-facing coupon task
Test Files  1 passed (1)
Tests       1 passed (1)

查询只依赖标题、输入框和按钮的可访问语义，没有读取组件内部 state 或 class。`],
    ['用 user-event 输入并点击真实按钮', 'TSX · Testing Library', `import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CouponPanel } from './CouponPanel';

it('submits the typed code from the visible action', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<CouponPanel state="idle" onSubmit={onSubmit} />);
  await user.type(screen.getByRole('textbox', { name: '优惠券代码' }), 'SAVE10');
  await user.click(screen.getByRole('button', { name: '应用' }));
  expect(onSubmit).toHaveBeenCalledWith({ code: 'SAVE10' });
});`, `✓ submits the typed code from the visible action
Test Files  1 passed (1)
Tests       1 passed (1)

事件经过输入、点击和公开回调，没有直接调用组件内部 submit 方法。`],
    ['呈现结果与公开回调共同构成契约', 'TSX · Testing Library', `import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CouponPanel } from './CouponPanel';

it('shows the discount and emits the accepted coupon', async () => {
  const user = userEvent.setup();
  const onAccepted = vi.fn();
  render(<CouponPanel state="idle" onAccepted={onAccepted} />);
  await user.type(screen.getByRole('textbox', { name: '优惠券代码' }), 'SAVE10');
  await user.click(screen.getByRole('button', { name: '应用' }));
  expect(screen.getByText('已减 10 元')).toBeVisible();
  expect(onAccepted).toHaveBeenCalledWith({ code: 'SAVE10', discountCents: 1000 });
});`, `✓ shows the discount and emits the accepted coupon
DOM text: 已减 10 元
onAccepted: { code: SAVE10, discountCents: 1000 }

用户看到的金额与父组件收到的事件同时验证，避免只测内部状态。`],
    ['异步失败后恢复按钮和错误提示', 'TSX · Testing Library', `import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

it('re-enables apply after a rejected coupon request', async () => {
  const user = userEvent.setup();
  const apply = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ ok: true });
  render(<CouponPanel state="idle" apply={apply} />);
  await user.type(screen.getByRole('textbox', { name: '优惠券代码' }), 'SAVE10');
  await user.click(screen.getByRole('button', { name: '应用' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法验证');
  expect(screen.getByRole('button', { name: '应用' })).toBeEnabled();
});`, `✓ re-enables apply after a rejected coupon request
alert text=暂时无法验证，请重试
button state=enabled

等待由 find/ByRole 观察错误出现，不靠固定 sleep；失败后用户仍能重试。`],
    ['组件测试与 E2E 各保留最小职责', 'PowerShell · Vitest and Playwright', `pnpm exec vitest run tests/components/CouponPanel.test.tsx --reporter=verbose
pnpm exec playwright test tests/e2e/coupon-checkout.spec.ts --project=chromium
Write-Output "component_exit=$LASTEXITCODE e2e_exit=$LASTEXITCODE"`, `components/CouponPanel.test.tsx  5 passed  214ms
e2e/coupon-checkout.spec.ts     1 passed  4.8s
component_exit=0 e2e_exit=0

组件层覆盖错误、键盘和回调，E2E 只保留登录到支付的一条真实集成流程。`],
  ],
  [
    ['按角色和可访问名称定位', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('opens the order detail from its visible name', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('link', { name: '订单 42，已支付' }).click();
  await expect(page.getByRole('heading', { name: '订单 42' })).toBeVisible();
});`, `Running 1 test using 1 worker
[chromium] › orders.spec.ts:2:1 › opens the order detail 1 passed (1.2s)

定位器描述用户看到的链接名称，CSS 结构调整不会让它失效。`],
    ['Web-first 断言代替固定等待', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('shows a saved confirmation without sleep', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('textbox', { name: '显示名称' }).fill('Alice');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('status')).toHaveText('已保存');
  await expect(page.getByRole('textbox', { name: '显示名称' })).toHaveValue('Alice');
});`, `[chromium] › profile.spec.ts:2:1 › shows a saved confirmation
expect.toHaveText retried for 184ms and passed
expect.toHaveValue passed
1 passed (1.6s)

Playwright 自动重试可观察状态；代码中没有 waitForTimeout(3000)。`],
    ['每个用例使用独立上下文和账号', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('two customers keep separate carts', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();
  await pageA.goto('/login?user=alice');
  await pageB.goto('/login?user=bob');
  await pageA.getByRole('button', { name: '加入购物车' }).click();
  await expect(pageA.getByLabel('购物车数量')).toHaveText('1');
  await expect(pageB.getByLabel('购物车数量')).toHaveText('0');
  await first.close();
  await second.close();
});`, `context id=ctx-a1 user=alice cart=1
context id=ctx-b2 user=bob cart=0
2 contexts closed
1 passed (2.1s)

独立 cookie、storage 和后端账号避免顺序污染，两个购物车可以安全并行。`],
    ['严格模式发现重复按钮语义', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('there is one primary submit action', async ({ page }) => {
  await page.goto('/checkout');
  const submit = page.getByRole('button', { name: '提交订单' });
  await expect(submit).toHaveCount(1);
  await expect(submit).toBeEnabled();
  await submit.click();
});`, `locator.getByRole('button', { name: '提交订单' })
strict mode resolved to 2 elements:
- button.checkout-submit
- button.mobile-submit
1 failed (1.1s)

两个满足同一语义的按钮暴露真实歧义，应该修复可访问名称或 DOM，而不是用 nth(0) 掩盖。`],
    ['固定浏览器、视口与重试配置', 'Playwright Config', `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: 'chromium-mobile', use: { ...devices['Pixel 7'] } }],
});`, `playwright 1.49.1 chromium 131.0.6778.33
project=chromium-mobile viewport=390x844 isMobile=true
trace=retain-on-failure screenshot=only-on-failure
replay command: pnpm exec playwright test --project=chromium-mobile

浏览器版本、设备、视口和重试策略都可由配置复现。`],
  ],
  [
    ['通过真实登录表单建立会话', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('logs in through the same form users submit', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '邮箱' }).fill('alice@example.test');
  await page.getByLabel('密码').fill('correct-horse');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByRole('heading', { name: '我的账户' })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'session' && cookie.httpOnly)).toBe(true);
});`, `POST /api/login 200
navigation /login -> /account
session cookie httpOnly=true secure=true
1 passed (1.7s)

测试没有直接注入 token，登录协议和 HttpOnly 会话属性都经过真实入口。`],
    ['刷新受保护页面后会话仍有效', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('keeps the protected invoice route after reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '邮箱' }).fill('alice@example.test');
  await page.getByLabel('密码').fill('correct-horse');
  await page.getByRole('button', { name: '登录' }).click();
  await page.goto('/invoices/42');
  await page.reload();
  await expect(page).toHaveURL('/invoices/42');
  await expect(page.getByRole('heading', { name: '发票 42' })).toBeVisible();
});`, `login response Set-Cookie session=...
GET /invoices/42 document 200
reload GET /api/session 200 role=owner
1 passed (2.4s)

刷新会重新走应用启动和会话恢复，比同一次内存导航更能证明受保护路由成立。`],
    ['隐藏菜单后 API 仍要拒绝越权', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('an editor cannot read another tenant invoice by direct URL', async ({ page }) => {
  await page.goto('/login?user=editor');
  await page.goto('/invoices/tenant-b-42');
  await expect(page.getByRole('heading', { name: '无权访问' })).toBeVisible();
  const response = await page.request.get('/api/invoices/tenant-b-42');
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
});`, `GET /invoices/tenant-b-42 document 200 shell
GET /api/invoices/tenant-b-42 403
{"code":"FORBIDDEN","traceId":"tr-77"}
1 passed (1.9s)

页面即使显示错误壳，直接调用 API 仍被 403 拒绝，证明权限在服务端。`],
    ['退出后三类认证载体全部清理', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('logout removes cookie, storage and protected access', async ({ page }) => {
  await page.goto('/login?user=alice');
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL('/login');
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'session')).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
  await page.goto('/account');
  await expect(page).toHaveURL('/login?next=%2Faccount');
});`, `DELETE /api/session 204
session cookie absent
localStorage access_token=null
/account -> /login?next=%2Faccount
1 passed (1.8s)

退出同时清 cookie、storage 与受保护页面访问，避免残留认证状态。`],
    ['跨页流程只保留业务关键步骤', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('registered buyer completes one payment', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '邮箱' }).fill('buyer@example.test');
  await page.getByLabel('密码').fill('secret123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByRole('link', { name: '年费套餐' }).click();
  await page.getByRole('button', { name: '购买' }).click();
  await expect(page.getByRole('heading', { name: '支付成功' })).toBeVisible();
});`, `login -> /pricing -> checkout -> /receipt
POST /api/payments 201 id=pay-52
payment confirmation visible
1 passed (5.3s)

登录、选品、支付、确认构成最短业务链；字段校验和样式细节留在组件层。`],
  ],
  [
    ['声明移动设备、触控与缩放能力', 'Playwright Config', `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2.625,
  },
});`, `project=chromium-mobile
viewport=390x844 hasTouch=true isMobile=true dpr=2.625
userAgent=Chromium Android

设备特性一起声明，测试既覆盖最小宽度也覆盖触控和移动视口行为。`],
    ['量化触控目标尺寸和横向溢出', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('mobile controls are large enough and do not widen the page', async ({ page }) => {
  await page.goto('/learning-v2');
  const button = page.getByRole('button', { name: '下一课' });
  const box = await button.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});`, `button=下一课 width=72 height=48
viewport width=390 document scrollWidth=390
overflow=0
1 passed (1.4s)

触控尺寸和文档宽度都用数值断言，避免只凭截图判断“看起来正常”。`],
    ['用真实 tap 和 swipe 验证移动交互', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('opens a lesson drawer with tap and closes it with swipe', async ({ page }) => {
  await page.goto('/learning-v2/lesson/42');
  await page.getByRole('button', { name: '课程目录' }).tap();
  await expect(page.getByRole('dialog', { name: '课程目录' })).toBeVisible();
  const box = await page.getByRole('dialog').boundingBox();
  if (!box) throw new Error('drawer missing');
  await page.touchscreen.tap(box.x + 10, box.y + 20);
  await page.mouse.move(380, 400);
  await page.mouse.down();
  await page.mouse.move(80, 400, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeHidden();
});`, `tap 课程目录 -> dialog visible
touch point=(10,20) inside drawer
swipe x=380 -> x=80 duration=96ms
dialog hidden
1 passed (2.1s)

模拟触控验证抽屉开关；手势歧义和真实设备差异仍应留给少量真机冒烟。`],
    ['断点前后像素检查内容重排', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
for (const width of [389, 390, 391]) {
  test('navigation at width ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/learning-v2');
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    const box = await page.getByTestId('session-step').boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}`, `✓ navigation at width 389
✓ navigation at width 390
✓ navigation at width 391
3 passed (2.8s)

在断点两侧各偏移一个像素，能发现只在 390px 临界值出现的挤压和横向溢出。`],
    ['CI 同时跑桌面和移动项目', 'Playwright Config', `projects: [
  { name: 'chromium-desktop', use: { viewport: { width: 1440, height: 900 } } },
  { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
]`, `pnpm exec playwright test --project=chromium-desktop --project=chromium-mobile
chromium-desktop  18 passed  42.1s
chromium-mobile   18 passed  51.7s
failed=0 flaky=0

移动项目是必需回归矩阵的一部分，而不是发布前手工补一张截图。`],
  ],
  [
    ['只用键盘完成搜索到打开结果', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('keyboard user searches and opens the first result', async ({ page }) => {
  await page.goto('/search');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('searchbox', { name: '搜索课程' })).toBeFocused();
  await page.keyboard.type('测试金字塔');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '测试金字塔' })).toBeVisible();
});`, `focus: body -> searchbox
typed text=测试金字塔
focus: searchbox -> first result link -> Enter
route=/lessons/test-pyramid
1 passed (1.8s)

整个任务不调用 click，证明焦点顺序、键盘操作和路由结果都可用。`],
    ['检查焦点可见样式和弹层返回位置', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('focus ring is visible and returns to the opener', async ({ page }) => {
  await page.goto('/learning-v2');
  const opener = page.getByRole('button', { name: '设置' });
  await opener.focus();
  const outline = await opener.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outline).not.toBe('none');
  await opener.press('Enter');
  await page.getByRole('button', { name: '关闭' }).press('Enter');
  await expect(opener).toBeFocused();
});`, `opener outline-style=solid outline-width=2px
dialog opened via Enter and closed via Enter
activeElement=button[name="设置"]
1 passed (1.3s)

焦点位置与浏览器计算样式同时验证，避免样式表写了 outline: none 却截图看不出来。`],
    ['模态打开后背景不可聚焦且 Esc 返回', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('modal traps focus and returns it on Escape', async ({ page }) => {
  await page.goto('/settings');
  const opener = page.getByRole('button', { name: '删除账号' });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '确认删除账号' });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});`, `dialog visible name=确认删除账号
8 Tab presses remain inside role=dialog
Escape closes dialog
focus returned to delete-account button
1 passed (1.7s)

反复 Tab 检查焦点没有逃到背景页面，关闭后回到触发按钮。`],
    ['axe 扫描并保留可定位违规节点', 'Playwright TypeScript', `import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
test('checkout has no serious accessibility violations', async ({ page }) => {
  await page.goto('/checkout');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(serious, JSON.stringify(serious.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })))).toEqual([]);
});`, `axe violations=2
label: form-field has no label target=[input#coupon]
color-contrast: text #aaa on #fff target=[.price-note]
1 failed (1.6s)
artifact axe-results.json uploaded

报告包含规则 id 与具体 DOM 目标，修复者能直接定位，不需要人工猜扫描结果。`],
    ['严重违规阻断合并并允许分级豁免', 'Playwright Config', `const seriousViolations = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
expect(seriousViolations).toEqual([]);
// reviewed exception
// rule=region impact=moderate owner=design-system expires=2026-12-31
// tests/a11y-exceptions.json records the selector and tracking issue`, `serious=0 critical=0
moderate region=1 exception=APP-214 expires=2026-12-31
accessibility gate=pass with reviewed exception

严重问题直接阻断，较低等级缺口必须有责任人和到期日，避免无限期忽略。`],
  ],
  [
    ['失败才保留截图、视频和 trace', 'Playwright Config', `export default defineConfig({
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'test-results',
});`, `passing test -> screenshot=0 video=0 trace=0
failing test -> screenshot=1 video=1 trace=1
storage used by suite=18.4 MB

成功路径不保留大文件，失败现场仍有可重放的多层证据。`],
    ['从 trace 重建动作、网络和断言', 'PowerShell · Playwright', `pnpm exec playwright show-trace test-results/checkout-chromium/trace.zip
pnpm exec playwright trace --help
Select-String -Path test-results/checkout-chromium/error-context.md -Pattern 'submit|expected|received'`, `trace actions:
  click button[name="提交订单"] at 1482ms
  POST /api/checkout -> 500 at 1621ms
  expect heading[name="支付成功"] retry 5s -> failed
error-context.md: expected payable, received failed

时间轴能看出按钮已点击、请求返回 500、页面显示失败，问题在服务端支付链路。`],
    ['request id 贯穿浏览器日志与服务端', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('preserves the request id from UI through the API', async ({ page }) => {
  const responsePromise = page.waitForResponse('**/api/checkout');
  await page.goto('/checkout');
  await page.getByRole('button', { name: '提交订单' }).click();
  const response = await responsePromise;
  const requestId = response.headers()['x-request-id'];
  expect(requestId).toMatch(/^req-[a-f0-9-]+$/);
  const serverLine = await readServerLogLine(requestId);
  expect(serverLine).toContain('payment gateway timeout');
});`, `response status=500 x-request-id=req-3f8a91
browser console traceId=req-3f8a91
server log req-3f8a91 payment gateway timeout after 2500ms
1 passed (2.6s)

同一 request id 连接浏览器响应、前端日志和后端异常，失败可以沿一条链路追踪。`],
    ['依据 trace 区分环境失败与产品失败', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('classifies a navigation timeout with captured network state', async ({ page }, testInfo) => {
  const response = await page.goto('/checkout').catch((error) => ({ error }));
  if ('error' in response) {
    await testInfo.attach('environment.json', {
      body: JSON.stringify(await page.context().request.get('/health').then((item) => item.json())),
      contentType: 'application/json',
    });
    throw new Error('ENVIRONMENT_UNAVAILABLE: app did not respond');
  }
  await expect(page.getByRole('heading', { name: '结算' })).toBeVisible();
});`, `navigation /checkout timed out after 30000ms
health endpoint status=503 database=down
classification=ENVIRONMENT_UNAVAILABLE
retry allowed=true

页面尚未加载且健康检查显示数据库不可用，应归为环境失败，不能自动记为业务回归。`],
    ['工件按失败策略保存并设置保留期', 'PowerShell · GitHub CLI', `gh run download 198412 --dir artifacts/run-198412
Get-ChildItem artifacts/run-198412 -Recurse | Measure-Object Length -Sum
gh api repos/{owner}/{repo}/actions/artifacts --jq '.artifacts[] | select(.name|startswith("playwright-")) | {name,expires_at,size_in_bytes}'`, `artifact playwright-198412 size=18.4MB expires_at=2026-12-24
failed tests=1 trace=1 video=1 screenshot=1
30-day retention policy applied

失败工件可按 run id 下载，保留期明确；敏感数据和成功视频不进入长期存储。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q3_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q3Name('组件测试与用户事件'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能渲染一个前端组件，并会使用 Testing Library 或框架测试工具查询页面元素。',
    goal: '能在隔离环境渲染组件，用真实用户事件驱动输入、点击与键盘行为，断言可见结果和公开事件，并区分组件测试与完整浏览器 E2E 的覆盖边界。',
    guidedPractice: '为一个带异步校验的登录表单写 Vitest + Testing Library 测试：`await userEvent.type(screen.getByLabelText("邮箱"), "a@example.com")`，点击提交后等待错误文本。让 axios stub 返回 500，检查按钮 loading、错误 alert 和提交回调次数；再改为 jsdom 缺失布局能力，记录它无法验证的视觉与真实浏览器行为。',
    independentPractice: '为购物车行组件写删除、数量加一、数量越界和网络失败四组组件测试，提交可访问查询、事件日志、失败 DOM 和与 Playwright 用例的分工说明。',
    commonErrors: [
      '直接调用组件内部方法或设置 state，而不是模拟用户点击与输入，导致交互事件绑定失效仍无法发现。',
      '把所有路由、后端和浏览器布局都塞进组件测试，测试环境缺失行为却把假失败归咎于业务。',
    ],
    sourceRefs: [sources.testingLibrary, sources.vitest, sources.playwright],
    steps: [
      ['按用户语义渲染组件', '组件测试先渲染最小依赖，查询应使用 `getByRole`、`getByLabelText` 和可见文本；`render(<LoginForm onSubmit={onSubmit} />)` 时只传入公开回调和必要 provider。边界包括空表单、禁用态和无可访问名称的按钮，失败时 Testing Library 会输出 DOM 与可访问提示。证据保存测试名、DOM 片段和依赖版本；若只能靠 class 找到元素，先修组件语义而不是测试选择器。', '查询顺序从用户语义开始'],
      ['用真实事件驱动交互', '`userEvent.type`、`userEvent.click` 和 `userEvent.keyboard` 会触发 focus、input、click 等浏览器事件，比 `fireEvent.change` 更接近用户。等待异步结果用 `await screen.findByRole("alert")`，不要用固定 `sleep`；边界包含快速双击、Tab 离开输入框和网络延迟。失败报告保存事件调用顺序、回调和响应值，证据用测试报告与组件 DOM 对照，证明事件绑定真的执行，也能区分未触发、重复触发和异步状态未完成。', '事件要经过用户路径而非内部状态'],
      ['断言呈现与公开回调', '组件测试关心用户看到什么、公开回调收到什么，例如 `expect(onSubmit).toHaveBeenCalledWith({email, password})` 和 `expect(screen.queryByText("提交中"))`。不要断言内部 hook 的 state；边界覆盖错误提示出现后又成功、按钮禁用和重复提交。失败时输出可访问角色、文本和调用参数，证据保存 DOM 快照与事件日志。异步断言应等待确定元素，超时日志要包含当前页面文本。', '呈现和公开回调才是组件契约'],
      ['处理异步与错误状态', '用 `msw` 或依赖注入 stub 让请求返回 503、延迟 2 秒或返回无效 JSON，测试按钮出现 loading、错误消息可读且可再次提交。边界检查第一次失败、第二次成功和组件卸载时请求未完成，失败信息要保留请求 URL、状态码与 React act 警告。证据包含网络处理记录、组件报告和错误边界截图；若卸载后仍更新状态，应把它作为真实资源生命周期缺陷。', '异步失败要验证恢复后的交互'],
      ['划清组件与 E2E 边界', '组件测试不验证真实字体布局、跨域 Cookie、Service Worker 或多页导航，这些交给 Playwright；组件层专注事件、条件渲染和状态呈现。用 `npx vitest run tests/components --reporter=verbose` 记录耗时，再选一个关键表单在真实浏览器执行相同路径，边界比较两者的失败信息。最终证据包含测试分工表、组件报告和一条 E2E 链接，避免重复测试造成维护成本。', '隔离环境验证逻辑，浏览器验证集成'],
    ],
  },
  {
    name: q3Name('Playwright 定位、等待和隔离'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能运行 Playwright 或类似浏览器测试，知道页面加载、网络请求和元素出现不是同一时刻。',
    goal: '能用角色和标签定位元素，依靠 Web-first 断言等待业务状态，隔离浏览器上下文与测试数据，并定位 strict mode 冲突和错误等待造成的 flaky。',
    guidedPractice: '把 `page.locator(".btn")` 改为 `page.getByRole("button", { name: "保存" })`，把 `waitForTimeout(3000)` 改为 `expect(page.getByText("已保存")).toBeVisible()`。制造两个同名按钮观察 strict mode 报错，再给测试使用独立 `browser.newContext()` 和固定账号；运行 `npx playwright test tests/order.spec.ts --trace=on`。',
    independentPractice: '给一个列表筛选页面写三条 Playwright 测试，覆盖加载、空结果和接口失败；要求没有固定延时、每例独立上下文，并提交定位日志、失败 trace 与网络 waterfall。',
    commonErrors: [
      '用 CSS 层级和 nth-child 定位会随布局变化的元素，页面小改就大面积失败。',
      '遇到偶发失败就加 `waitForTimeout`，测试既变慢仍然可能错过真实事件，超时信息也无法说明等待条件。',
    ],
    sourceRefs: [sources.playwright, sources.playwrightAssertions, sources.testingLibrary],
    steps: [
      ['优先使用可访问定位', '`getByRole`、`getByLabel` 和 `getByText` 把定位建立在用户可理解的名称上，例如 `page.getByRole("textbox", { name: "收货地址" })`；只有图表等没有语义元素时才用 `data-testid`。边界包括移动端隐藏文案、重复名称和动态加载，strict mode 发现多个匹配会直接失败并列出元素。保存定位器代码、失败页面 DOM 与截图，证据才能说明是名称变化还是业务流程错误。', '定位器要描述用户看到的对象'],
      ['使用 Web-first 等待断言', '`expect(locator).toBeVisible()`、`toHaveText`、`toHaveURL` 会自动重试直到超时，比固定 sleep 更可靠；等待业务结果而不是等待网络空闲，例如等待“支付完成”标题或订单状态。边界包括慢接口、空列表和最终错误提示，超时报告保存等待的选择器、当前 URL 和 trace。证据应包含动作时间轴与网络日志，失败时能看出页面停在哪个状态。', '等待可观察状态而非固定秒数'],
      ['隔离上下文与账号数据', '每个测试用独立 `context`、Cookie 和 storageState，账号或租户使用唯一前缀，避免并行用例互相覆盖。`test.describe.configure({ mode: "parallel" })` 下边界检查登录态、购物车和数据库订单不共享；失败日志保存 context 名称、账号和请求 ID。证据包括 worker 编号、创建和清理数据命令。若要复用登录，只复用生成后的状态文件，并验证过期后跳转而不是默认一直有效。', '上下文和业务数据都按用例隔离'],
      ['定位 strict mode 与竞态', '同一角色匹配两个按钮时，应通过可访问名称、所在 region 或 `filter({ hasText })` 缩小范围，不能简单 `.first()` 碰运气。边界测试列表渲染前后同名按钮共存，观察 `strict mode violation` 文本和可用 locator 列表。记录动作前后 DOM、请求顺序与 trace，证据帮助判断是 UI 设计歧义还是测试定位不准；修复优先给控件更清晰的语义，失败信息必须保留 strict mode 的冲突列表。', '歧义定位要修语义而非取第一个'],
      ['建立可重放浏览器配置', '`playwright.config.ts` 固定 baseURL、重试次数、trace、screenshot 和 video 策略，CI 使用同一浏览器版本；边界检查本地有头模式和 CI 无头模式，失败时 trace 可 `npx playwright show-trace` 打开。保存配置、浏览器 version、网络日志和失败附件，测试报告按项目与 shard 命名。只有固定等待的真实业务超时才能保留，并要说明触发条件；报告还要写清是否自动重试以及重试是否保留首次现场。', '配置和浏览器版本也是复现条件'],
    ],
  },
  {
    name: q3Name('登录、路由和跨页流程'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能在浏览器中完成登录并理解 Cookie、Local Storage、客户端路由和服务端重定向的差异。',
    goal: '能用 Playwright 覆盖登录、受保护路由、重定向、刷新恢复和退出清理，构造过期会话与无权限用户，并保留跨页请求和状态证据。',
    guidedPractice: '写一条从登录页到订单详情的流程：先 `page.goto("/login")`，输入账号后等待 `toHaveURL(/dashboard/)`，再进入订单页并刷新确认会话保留。修改 token 使接口返回 401，观察是否跳回登录并清除 storage；保存 network 日志、storageState 和最终 URL，区分前端守卫与服务端授权。',
    independentPractice: '为管理员和普通用户各建立一条跨页流程，覆盖无权限按钮、直接输入 URL、会话过期和退出登录；提交 trace、请求响应和你认为应由 E2E 承担的断言。',
    commonErrors: [
      '只断言点击后 URL 变化，没有等待页面数据加载，实际上用户看到的是错误页或无限加载。',
      '通过注入 localStorage token 绕过真实登录，却把测试当作认证链路验证，Cookie 属性和服务端拒绝都没有覆盖。',
    ],
    sourceRefs: [sources.playwright, sources.playwrightAssertions, sources.asvs],
    steps: [
      ['从真实登录入口开始', '关键认证流程从公开登录页开始，输入测试账号并点击提交，等待服务器响应与目标页面同时成立；命令 `npx playwright test tests/auth-login.spec.ts --trace=retain-on-failure`。边界包含空密码、错误密码、账号锁定和成功登录，失败日志保存 HTTP 状态、重定向链与页面错误文本。证据包括网络请求、storageState 和 trace，不能只用预先写入的 token 证明登录成功。', '认证入口必须走真实提交协议'],
      ['验证受保护路由与刷新', '登录后直接访问 `/orders/42`，再刷新页面，断言会话恢复、数据可见且未闪回登录页；用 `page.reload()` 和 `expect(page).toHaveURL` 检查状态。边界包括无 Cookie、过期 Cookie 和浏览器新 context，失败时保存 Set-Cookie 属性、401 响应和最终 URL。证据需区分客户端守卫和服务端 302/401，确保深链接不能靠隐藏按钮绕过授权；服务端也要在每次受保护请求上重新校验会话，不能只信任页面状态。', '刷新后仍可访问才证明会话有效'],
      ['覆盖角色和对象权限', '普通用户不应看到管理员菜单，直接访问管理路由必须得到 403 或安全重定向；对象越权测试用另一个账号的订单 ID，确认服务端不返回数据。边界包含角色变化、租户为空和已删除资源，失败日志保存用户 ID、资源 ID、状态码与响应体。证据包含两条账号轨迹和 API 请求，页面隐藏按钮只作为体验证据，不能替代服务器授权测试。', '隐藏入口不等于授权控制'],
      ['测试会话过期与退出', '使用短过期 token 或拦截刷新请求返回 401，确认页面显示会话过期提示并跳转登录；点击退出后检查 Cookie、IndexedDB 与受保护页面均失效。边界检查并发标签页、刷新和返回按钮，失败日志要保留旧 token 的最后一次请求与新状态。证据包含响应头、storage 快照和重定向 trace，证明旧会话不能通过历史缓存复活；`npx playwright test tests/session-expiry.spec.ts` 可独立复跑。', '退出要清理所有认证载体'],
      ['控制跨页流程稳定性', '流程测试只保留关键路由与业务检查，登录一次后通过 storageState 复用，但单独有一组测试验证登录本身；命令分 `--project=auth` 与 `--project=flows`，边界检查状态文件过期和并行用户。失败报告保存每一步 URL、网络错误和页面截图，证据按业务 ID 归档。不要把每个字段校验都放在跨页流程，避免关键路径测试又慢又脆。', '关键流程短而完整，细节分层'],
    ],
  },
  {
    name: q3Name('移动视口、触控和响应式'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 CSS 媒体查询、触控事件和移动浏览器视口，能运行 Playwright 项目配置。',
    goal: '能在 320px 等真实移动视口验证布局、触控目标、横向溢出和键盘遮挡，区分视口模拟与真机差异，并保留尺寸与交互证据。',
    guidedPractice: '在 Playwright 中配置 `devices["iPhone 13"]` 和 320×640 viewport，打开结算页执行 `page.setViewportSize({ width: 320, height: 640 })`，检查按钮是否至少 44px、页面 `scrollWidth` 是否超过视口。点击触控目标并用 `page.keyboard.press("Tab")` 验证焦点，保存截图、元素 boundingBox 和失败断言。',
    independentPractice: '为一个响应式导航写 320、390、768 三种视口测试，覆盖菜单展开、横屏、软键盘遮挡和横向溢出；提交尺寸数据、截图以及一条无法由桌面视口证明的真机风险。',
    commonErrors: [
      '只设置窄窗口宽度，却继续用鼠标 hover 触发菜单，移动设备没有 hover 的真实交互没有被覆盖。',
      '只断言截图看起来正常，不检查 scrollWidth、触控尺寸与焦点顺序，文字仍可能溢出或被固定按钮遮挡。',
    ],
    sourceRefs: [sources.playwright, sources.wcag, sources.testingLibrary],
    steps: [
      ['声明目标视口与设备特性', 'Playwright project 中设置 viewport、deviceScaleFactor、isMobile 和 hasTouch，边界至少覆盖 320×640、390×844 和横屏；命令 `npx playwright test --project=mobile-320`。用 `page.evaluate(() => ({innerWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth}))` 记录尺寸，失败时保存截图与 boundingBox。证据包含设备配置、浏览器版本和实际尺寸，说明测试模拟了哪类设备限制。固定这些条件后，本地与流水线才能重放同一移动场景；浏览器版本不同时还要注明差异，不能直接比较截图。', '视口、触控和缩放要一起声明'],
      ['检查触控目标与横溢', '对关键按钮、图标和导航项读取 `boundingBox()`，验证宽高达到 44px；页面横向溢出检查 `scrollWidth <= clientWidth`，边界包含最长标题和错误消息。用 `locator.tap()` 触发触控，失败日志保存坐标、元素尺寸和溢出元素选择器。证据包含 320px 截图、尺寸 JSON 与可滚动容器清单，不能只靠视觉判断；截图之外还要保留尺寸断言，才能防止视觉误判。', '触控尺寸与横向溢出要量化'],
      ['验证移动特有交互', '折叠菜单应通过 tap 打开，关闭按钮可通过触控命中，键盘弹出后固定提交按钮不遮挡输入框；边界包含安全区、横屏和软键盘高度变化。Playwright 可模拟 `hasTouch` 与 viewport，但它不能完全替代真机 IME，失败报告保存视口、元素位置和截图。证据还应注明哪些风险需要手动真机复核，避免把模拟结果说成完整验收。', '模拟能查布局，不能代替全部真机'],
      ['测试响应式内容重排', '使用同一断点在 319、320、321px 检查导航、表格和长单词是否重排，断言关键内容没有重叠；可用 `locator.evaluate(el => el.getBoundingClientRect())` 比较位置。边界覆盖超长邮箱和错误提示，失败截图保存页面顶部与目标元素区域。证据包含三档尺寸的截图和几何数据，若只测 390px，320px 的发版阻断问题会被漏掉，也会让断点回归失去可比性。', '断点前后各取一像素验证'],
      ['将移动检查接入回归', '为最关键的购买、登录和错误恢复流程配置移动项目，在 CI 运行 `npx playwright test --project=mobile-320 --reporter=junit` 并上传截图；边界设置屏幕超时、并发机器和字体差异。失败要区分横向溢出、触控命中和真机键盘，证据目录保留 HTML report、trace 和尺寸日志。定期在真机抽样验证，记录模拟与真机的差异，持续修正设备矩阵。', '移动门禁至少守住最小宽度'],
    ],
  },
  {
    name: q3Name('键盘、焦点和 axe 检查'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '了解 Tab 顺序、可访问名称和焦点管理，能运行 Playwright 并阅读 DOM 结构。',
    goal: '能用键盘完成关键任务，验证焦点顺序、可见焦点、模态框陷阱和错误提示，并结合 axe 自动检查与人工语义复核。',
    guidedPractice: '写一个从页头 Tab 到搜索框、结果链接和分页按钮的 Playwright 流程，断言 `document.activeElement` 与 `aria-label`。打开模态框后检查焦点进入对话框、按 Escape 返回触发按钮；运行 `@axe-core/playwright` 的 `AxeBuilder().analyze()`，保存 violations 的 id、impact 和 target。',
    independentPractice: '为一个表单和模态框完成键盘全流程与 axe 扫描，修复一个真实可访问性问题；提交焦点轨迹、违规节点、修复前后报告和仍需人工复核的说明。',
    commonErrors: [
      '只运行 axe 就宣称页面无障碍通过，键盘陷阱、阅读顺序和动态焦点错误没有被自动规则覆盖。',
      '模态框打开后焦点仍留在背景页面，关闭后没有返回触发元素，鼠标可用但键盘用户被困住。',
    ],
    sourceRefs: [sources.wcag, sources.axe, sources.playwright],
    steps: [
      ['建立纯键盘任务路径', '关键任务必须不用鼠标完成：按 Tab 进入搜索框，输入后按 Enter，再用 Tab 访问结果和分页。用 `page.keyboard.press("Tab")` 与 `page.evaluate(() => document.activeElement?.getAttribute("aria-label"))` 记录每步焦点，边界包括第一个可聚焦元素、跳转链接和空结果。失败报告保存焦点顺序与页面截图，证据应能重放从页面顶部到任务完成的完整路径，报告还应能直接重现这条键盘路径。', '键盘也要能完成真实任务'],
      ['验证焦点可见与返回', '每次焦点移动检查 `:focus-visible` 样式与元素 boundingBox，打开模态框后用 `expect(dialog).toBeFocused()` 或检查内部首元素，关闭后返回触发按钮。边界检查 Escape、背景遮罩点击和空对话框，失败时保存 activeElement、DOM 与截图。证据包含焦点时间轴和组件代码位置，只有 aria 属性而没有视觉焦点仍不满足键盘可用，截图与焦点元素要同时归档。', '焦点位置和可见样式同时验证'],
      ['防止模态与抽屉焦点逃逸', '模态框打开后，Tab 与 Shift+Tab 应在内部循环，背景元素设置为 inert 或不可聚焦；关闭时恢复原焦点并解除滚动锁。边界包括嵌套对话框、异步内容和浏览器回退，失败日志保存 Tab 序列、inert 状态与最终焦点。证据包含键盘 trace 和 DOM snapshot；若测试需要依赖插件，仍要手工验证 Escape 与屏幕阅读器语义，`npx playwright test tests/modal-focus.spec.ts` 可重放整条路径。', '模态焦点不能逃到背景页面'],
      ['运行 axe 并读懂违规', '在稳定页面状态执行 `new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()`，保存每条 violation 的 `id`、`impact`、`helpUrl` 和 CSS target；边界覆盖模态打开、错误提示和空列表。命令 `npx playwright test tests/a11y.spec.ts` 失败时不要只看数量，按严重级别和业务页面分组。证据包含 axe JSON、截图和修复 diff，自动规则未覆盖的阅读顺序需列入人工检查，自动扫描通过后仍要用键盘和阅读顺序复核关键任务。', 'axe 是辅助检查而非完整验收'],
      ['把可访问性接入回归门禁', '关键页面建立 axe 严重级阈值，动态状态单独扫描；键盘流程放入主分支测试，报告上传 axe JSON 与 Playwright trace。边界检查新增组件、主题切换和移动项目，失败信息包含页面 URL、规则 ID 和节点路径。对严重违规零容忍，对低风险项建清单并设修复期限。最终保存通过报告、豁免理由和人工复核记录，证明无障碍有持续运营而非一次性扫描；`npx playwright test tests/a11y.spec.ts` 应能直接复跑。', '严重违规要阻断合并'],
    ],
  },
  {
    name: q3Name('失败截图、Trace 和视频证据'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能运行 Playwright 失败用例，并会查看 HTML 报告和网络请求。',
    goal: '能配置截图、Trace、视频与日志保留策略，让失败现场包含时间轴、网络、控制台、DOM 和重试信息，并能从工件恢复到具体步骤。',
    guidedPractice: '在 `playwright.config.ts` 设置 `trace: "retain-on-failure"`、`screenshot: "only-on-failure"`、`video: "retain-on-failure"`，制造接口 500 与元素超时，运行 `npx playwright test tests/checkout.spec.ts --reporter=html`。下载 trace 后执行 `npx playwright show-trace trace.zip`，核对失败前请求、DOM 和动作时间点。',
    independentPractice: '为一个跨页支付失败流程配置最小证据集，区分重试前后的 trace；提交 HTML 报告、trace、截图、网络日志与一条仅凭工件即可写出的失败结论。',
    commonErrors: [
      '只上传最终截图，没有网络和控制台时间轴，无法知道失败发生在接口、渲染还是等待步骤。',
      '所有用例都开启视频和完整 trace，CI 工件巨大且上传慢，真正失败证据反而被清理或淹没。',
    ],
    sourceRefs: [sources.playwright, sources.playwrightAssertions, sources.opentelemetry],
    steps: [
      ['选择证据保留策略', '失败证据按成本分层：Trace 保留点击、DOM 快照、网络和控制台，截图保留最终视觉，视频适合偶发交互问题；配置 `trace: "retain-on-failure"` 可避免全量上传。边界检查重试成功、超时和浏览器崩溃，失败报告保存项目名、worker 和重试次数。证据目录以 run id 和测试 id 命名，便于从 HTML 报告定位，不把密钥或用户表单内容写入截图。', '证据按失败价值选择而非全量录制'],
      ['从 trace 重建时间轴', '打开 trace 查看每个 `action` 的起止时间、locator 解析、网络请求和控制台错误；例如点击提交后 API 500，页面仍在 loading，随后 `toBeVisible` 超时。命令 `npx playwright show-trace artifacts/trace.zip`，边界关注重试前后两次请求和最终 URL。保存 trace、失败行和请求 ID，证据应能回答失败前最后一个成功状态与首个异常事件；只有关联同一请求标识，才能把页面现象与服务端错误对应起来。', '时间轴要连起动作、网络与断言'],
      ['让日志与 request id 串联', '页面和服务端日志使用同一 request id 或 traceparent，测试失败时保存浏览器 console、network response 和服务日志摘录。边界覆盖跨域请求、超时后无响应和服务端 5xx，失败信息显示 URL、状态码与耗时。证据包含 Playwright trace、服务 traceId 和日志查询链接；没有业务标识的截图无法定位具体订单，查询结果也要保存时间窗口和过滤条件，防止只截取有利日志，日志 API 与 `rg` 都可用来核对同一标识。', '一次失败要能追到服务端链路'],
      ['区分产品失败与环境失败', '根据 trace 判断是断言不满足、网络断开、浏览器崩溃还是 CI 资源不足，报告中设不同状态；边界模拟服务未启动和字体加载失败，保存 `pageerror`、console 与进程日志。环境失败不应自动重试成业务成功，必须保留首次错误。证据目录附环境版本、Docker 日志和重跑结果，帮助评审者决定修复代码还是基础设施。', '失败分类先于自动重试'],
      ['建立工件留存与访问规范', '在 CI 上传 HTML report、trace、截图和日志，设置保留天数与大小上限；失败证据脱敏，限制未授权成员访问。边界检查工件上传失败、同名覆盖和存储配额，报告里要显示 artifact URL 与上传状态。最终留存一次真实故障的完整证据包和结论，证明新人无需开发者本机状态也能重放、定位和验证修复；下载后可用 `npx playwright show-trace` 打开并确认内容完整。', '工件要可访问、可重放、可清理'],
    ],
  },
], q3Examples);

// ── Q4 性能、安全与故障注入测试 ─────────────────────────────────────────────
const q4Stage = '性能、安全与故障注入测试';
const q4Name = (topic: string) => `测试与工程质量 · ${q4Stage}：${topic}`;

const q4Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['k6 脚本按真实用户组合施压', 'k6 JavaScript', `import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { scenarios: { journey: { executor: 'ramping-vus', stages: [
  { duration: '1m', target: 20 },
  { duration: '3m', target: 100 },
] } } };
export default function () {
  const browse = http.get('http://localhost:8080/catalog?page=1');
  check(browse, { 'catalog 200': (r) => r.status === 200 });
  const checkout = http.post('http://localhost:8080/checkout', JSON.stringify({ sku: 'SKU-42', quantity: 1 }), {
    headers: { 'content-type': 'application/json' },
  });
  check(checkout, { 'checkout 201': (r) => r.status === 201 });
  sleep(1);
}`, `catalog   2400 requests  0.82 req/s/vu
checkout  1100 requests  0.41 req/s/vu
journey think time=1s
status 2xx=98.9% 4xx=1.0% 5xx=0.1%

负载包含浏览与结算比例，单一 GET 压测无法代表真实工作负载。`],
    ['p95、p99 与错误率共同约束', 'k6 JavaScript', `import http from 'k6/http';
import { check } from 'k6';
export const options = {
  vus: 50,
  duration: '3m',
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<250', 'p(99)<600'],
    checks: ['rate>0.995'],
  },
};
export default function () {
  const response = http.get('http://localhost:8080/catalog');
  check(response, { 'catalog 200': (item) => item.status === 200 });
}`, `http_req_duration: avg=94ms p(95)=218ms p(99)=531ms max=1820ms
http_req_failed: rate=0.21%
checks: rate=99.79%
thresholds passed

均值 94ms 掩盖了尾部 531ms，分位与错误率同时满足才可作为预算。`],
    ['固定环境、数据和预热窗口', 'PowerShell · k6', `$env:K6_DATA_SIZE='100000-orders'
$env:TARGET_SHA='8e1c2a7'
kubectl apply -f deploy/perf/namespace.yaml
kubectl wait --for=condition=Available deployment/api -n perf --timeout=180s
k6 run --out json=artifacts/k6.json tests/perf/catalog.js
Write-Output "data=$env:K6_DATA_SIZE sha=$env:TARGET_SHA exit=$LASTEXITCODE"`, `cluster perf-ci nodes=3 cpu=12 memory=48Gi
database orders=100000 index=warm
warm-up discarded=60s measured=180s
data=100000-orders sha=8e1c2a7 exit=0

数据规模、提交和预热窗口都写入结果，换一台开发机不能直接与这组数字比较。`],
    ['慢请求从 trace 拆到数据库依赖', 'PowerShell · OpenTelemetry', `k6 run tests/perf/checkout.js --out json=artifacts/k6.json
$traceId = (Get-Content artifacts/k6.json | Select-String '"trace_id"').Line.Split('"')[3]
otel-cli span tree --trace-id $traceId --endpoint http://localhost:4318`, `POST /checkout p99=642ms
span checkout.route     642ms
span payment.authorize  511ms
span orders.insert       41ms
db.statement  insert into orders ...
slowest dependency=payment.authorize

尾延迟主要花在支付网关，而不是 API 或数据库，扩容应用实例不会解决根因。`],
    ['预算比较进入持续性能回归', 'GitHub Actions YAML', `- name: run performance budget
  run: k6 run tests/perf/catalog.js --summary-export artifacts/k6-summary.json
- name: compare baseline
  run: node tools/compare-perf.mjs --current artifacts/k6-summary.json --baseline perf/main.json --max-p95-regression 10
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: performance-\${{ github.run_id }}
    path: artifacts/`, `baseline p95=218ms current p95=241ms
regression=10.55% allowed=10%
budget failed by 1.2ms
performance-198412 uploaded

比较对象是同一环境的主干基线；超出 10% 会阻断，趋势与原始数据同时保留。`],
  ],
  [
    ['阶梯负载找到吞吐转折点', 'k6 JavaScript', `export const options = { scenarios: { ladder: { executor: 'ramping-arrival-rate', startRate: 20, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 400, stages: [
  { target: 20, duration: '2m' },
  { target: 80, duration: '3m' },
  { target: 160, duration: '3m' },
  { target: 320, duration: '3m' },
] } } };`, `20 rps  p95=61ms  errors=0.0%
80 rps  p95=104ms errors=0.0%
160 rps p95=238ms errors=0.3%
320 rps p95=984ms errors=8.7%
knee observed between 160 and 320 rps

饱和点来自阶梯曲线，不是凭经验猜一个并发数。`],
    ['超过容量时验证限流与快速失败', 'k6 JavaScript', `export const options = { scenarios: { spike: { executor: 'constant-arrival-rate', rate: 500, timeUnit: '1s', duration: '90s', preAllocatedVUs: 200 } }, thresholds: {
  'http_req_duration{expected_response:true}': ['p(99)<800'],
  http_req_failed: ['rate<0.2'],
  checks: ['rate>0.98'],
} };
export default function () {
  const response = http.get('http://localhost:8080/catalog');
  check(response, { 'bounded response': (r) => r.status === 200 || r.status === 429 });
  if (response.status === 429) sleep(0.2);
}`, `requests=45000 success=37000 throttled=7900 server_error=100
p99 success path=612ms
429 response includes Retry-After=1
thresholds passed

过载时系统用 429 快速拒绝并保留 200 请求延迟，而不是所有请求一起排到超时。`],
    ['两小时浸泡观察内存和连接漂移', 'k6 JavaScript', `export const options = {
  scenarios: { soak: { executor: 'constant-vus', vus: 80, duration: '2h' } },
  thresholds: {
    http_req_failed: ['rate<0.002'],
    http_req_duration: ['p(95)<300'],
    checks: ['rate>0.998'],
  },
};`, `00:10 rss=420MB db_connections=38 p95=118ms
01:00 rss=518MB db_connections=40 p95=124ms
02:00 rss=760MB db_connections=41 p95=131ms
heap after GC=560MB trend=rising 18MB/h

请求错误率稳定但 RSS 与堆内存持续上升，浸泡测试暴露了短测看不到的泄漏候选。`],
    ['同时观察队列、重试和下游延迟', 'k6 JavaScript', `export const options = {
  scenarios: {
    client: { executor: 'ramping-vus', stages: [{ duration: '1m', target: 120 }, { duration: '3m', target: 240 }] },
  },
};`, `rps=190 queue_depth=210 retry_rate=37% downstream_p95=1.9s
timeouts=4.1% circuit_state=closed
rps=210 queue_depth=860 retry_rate=62% downstream_p95=4.8s
timeouts=19.8% circuit_state=open
recovery started after retry amplification reduced

队列和重试放大共同导致雪崩；只看客户端 RPS 会误判为“服务还能接更多流量”。`],
    ['为压测设置自动中止与恢复开关', 'k6 JavaScript', `export const options = {
  scenarios: { bounded: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 200 }], gracefulStop: '30s' } },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};
export function handleSummary(data) {
  return { 'artifacts/summary.json': JSON.stringify(data, null, 2) };
}`, `WARN threshold crossed: http_req_failed rate=6.2%
test aborted by k6 at 03m41s
graceful stop completed in 18s
load generator 0 active VUs
target health=passing

失败阈值触发中止，暂停施压并等待健康恢复；不会继续用错误流量掩盖系统状态。`],
  ],
  [
    ['身份、资源与动作组成权限矩阵', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
const matrix = [
  ['anonymous', 'invoice:42', 'read', 401],
  ['owner', 'invoice:42', 'read', 200],
  ['editor', 'invoice:42', 'delete', 403],
  ['owner', 'invoice:99', 'read', 404],
] as const;
it.each(matrix)('%s %s %s -> %i', async (actor, resource, action, status) => {
  const response = await api.request({ actor, method: action === 'read' ? 'GET' : 'DELETE', path: '/invoices/42' });
  expect(response.status).toBe(status);
});`, `✓ anonymous invoice:42 read -> 401
✓ owner invoice:42 read -> 200
✓ editor invoice:42 delete -> 403
✓ owner invoice:99 read -> 404
Tests  4 passed (4)

每个身份、对象和动作组合都有明确结果，覆盖匿名、所有者、角色和不存在资源。`],
    ['认证缺失不能回退为匿名访问', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('rejects a protected route when the session cookie is absent', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/account' });
  expect(response.statusCode).toBe(401);
  expect(response.json()).toEqual({ code: 'AUTH_REQUIRED', message: 'authentication required' });
  expect(response.headers['cache-control']).toBe('no-store');
});`, `HTTP/1.1 401 Unauthorized
{"code":"AUTH_REQUIRED","message":"authentication required"}
cache-control: no-store
account service calls=0

没有会话时请求在认证层终止，不会以 guest 身份继续进入账户服务。`],
    ['服务端对象所有权挡住直接 API 调用', 'Python · pytest', `def test_owner_can_read_but_other_tenant_owner_cannot(client, tokens):
    own = client.get("/api/invoices/inv-a-1", headers=tokens["owner_a"])
    other = client.get("/api/invoices/inv-b-1", headers=tokens["owner_a"])
    assert own.status_code == 200
    assert other.status_code == 404
    assert other.json()["code"] == "NOT_FOUND"


def test_admin_role_still_requires_explicit_tenant_scope(client, tokens):
    response = client.get("/api/invoices/inv-b-1", headers=tokens["platform_admin"])
    assert response.status_code == 403`, `tests/test_invoice_authorization.py ..                           [100%]
2 passed in 0.18s

功能角色与对象所有权分开检查；隐藏菜单不能替代服务端租户范围。`],
    ['权限失败不泄露对象是否存在', 'Python · pytest', `def test_missing_and_forbidden_invoice_have_same_shape(client, token):
    existing_other_tenant = client.get("/api/invoices/inv-b-1", headers=token)
    missing = client.get("/api/invoices/inv-does-not-exist", headers=token)
    assert existing_other_tenant.status_code == missing.status_code == 404
    assert existing_other_tenant.json() == missing.json()
    assert not any(key in existing_other_tenant.text.lower() for key in ("tenant", "owner", "sql"))`, `tests/test_invoice_enumeration.py .                              [100%]
1 passed in 0.05s
both responses: 404 {"code":"NOT_FOUND","message":"invoice not found"}

其他租户已存在与完全不存在返回同一契约，无法据此枚举资源。`],
    ['越权矩阵进入 API 回归门禁', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
const denied = [
  ['anonymous', 'GET', '/api/invoices/inv-a-1'],
  ['viewer', 'DELETE', '/api/invoices/inv-a-1'],
  ['owner_a', 'GET', '/api/invoices/inv-b-1'],
] as const;
it.each(denied)('%s %s %s is denied by the real API', async (actor, method, url) => {
  const response = await api.as(actor).request({ method, url });
  expect([401, 403, 404]).toContain(response.status());
  expect(response.bodyText()).not.toContain('owner_a');
});`, `✓ anonymous GET /api/invoices/inv-a-1 is denied
✓ viewer DELETE /api/invoices/inv-a-1 is denied
✓ owner_a GET /api/invoices/inv-b-1 is denied
Tests  3 passed (3)

权限用例走真实 HTTP 与认证中间件，和功能测试一起作为合并必需检查。`],
  ],
  [
    ['从信任边界列出可攻击输入', 'TypeScript · Vitest', `const attackSurface = [
  { entry: 'invoice.search', data: 'q', boundary: 'web->db', cases: ['sql', 'unicode', 'length'] },
  { entry: 'avatar.upload', data: 'file', boundary: 'web->storage', cases: ['mime', 'path', 'size'] },
  { entry: 'webhook.test', data: 'url', boundary: 'server->network', cases: ['private-ip', 'redirect'] },
] as const;
test('every untrusted entry has an executable attack category', () => {
  expect(attackSurface.every((item) => item.cases.length >= 3)).toBe(true);
});`, `invoice.search  web->db       [sql, unicorn, length]
avatar.upload   web->storage  [mime, path, size]
webhook.test    server->net   [private-ip, redirect]
Tests  1 passed (1)

威胁模型列出数据从不可信输入流向哪里，每个边界都有可执行攻击类别。`],
    ['SQL 与命令参数不得变成语法', 'Python · pytest', `def test_invoice_search_sql_payload_is_only_text(client, db):
    payload = "%' OR 1=1; DROP TABLE invoices; --"
    response = client.get("/api/invoices", params={"q": payload})
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert db.scalar("select to_regclass('public.invoices') is not null") is True


def test_export_filename_rejects_shell_metacharacters(client):
    response = client.post("/api/exports", json={"name": "report; Invoke-WebRequest http://evil.test"})
    assert response.status_code == 422
    assert response.json()["code"] == "FILENAME_INVALID"`, `tests/test_input_injection.py ..                                 [100%]
2 passed in 0.09s
invoices table exists=True
process spawn count=0

数据库查询保持参数化，文件名按白名单校验，没有把输入拼进命令。`],
    ['上传同时校验内容、扩展名和存储路径', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('stores a valid png under a generated path and rejects a disguised html file', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const stored = await upload({ filename: '../../avatar.png', bytes: png, declaredType: 'image/png' });
  expect(stored.path).toMatch(/^avatars\/[a-f0-9-]+\.png$/);
  const rejected = await upload({ filename: 'avatar.png', bytes: Buffer.from('<script>alert(1)</script>'), declaredType: 'image/png' });
  expect(rejected).toEqual({ ok: false, code: 'CONTENT_TYPE_MISMATCH' });
});`, `stored path=avatars/6f91c2d8-....png
path traversal=0
magic bytes match image/png
disguised html rejected CONTENT_TYPE_MISMATCH

文件名不参与最终路径，魔数和媒体类型在服务端读取内容后校验。`],
    ['SSRF 在每次连接前解析并拒绝私网', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('blocks a hostname that resolves to the metadata address after first resolution', async () => {
  const resolver = new FakeDns({
    'safe.example.test': ['203.0.113.10'],
    'rebind.example.test': ['203.0.113.10', '169.254.169.254'],
  });
  const client = new WebhookClient({ resolver, allowHttp: false });
  await expect(client.test('https://safe.example.test/hook')).resolves.toMatchObject({ ok: true });
  await expect(client.test('https://rebind.example.test/hook')).resolves.toEqual({ ok: false, code: 'PRIVATE_ADDRESS' });
  expect(client.connectionAttempts).toBe(1);
});`, `safe.example.test -> 203.0.113.10 connect allowed
rebind.example.test first=203.0.113.10 second=169.254.169.254
private address rejected before socket connect
connectionAttempts=1

校验发生在实际连接使用的解析结果上，DNS 重绑定不会绕过。`],
    ['历史攻击输入永久进入回归语料', 'PowerShell · pytest', `@'
cases:
  - id: SQL-TAUTOLOGY
    route: /api/invoices
    payload: "%' OR 1=1 --"
    expected: 200-empty
  - id: SSRF-METADATA
    route: /api/webhooks/test
    payload: http://169.254.169.254/latest/meta-data
    expected: 422-PRIVATE_ADDRESS
'@ | Set-Content tests/security/corpus.yaml
pnpm exec pytest tests/security -m regression --junitxml=artifacts/security-regression.xml`, `collected 2 items
tests/security/test_corpus.py ..                                  [100%]
SQL-TAUTOLOGY status=200 items=0
SSRF-METADATA status=422 code=PRIVATE_ADDRESS
2 passed in 0.14s

修复过的攻击输入带 case id 固化，后续路由重构仍会执行同一安全回归。`],
  ],
  [
    ['总 deadline 约束每次重试', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('stops retrying when the two second deadline is exhausted', async () => {
  const gateway = new FakeGateway({ delayMs: 700 });
  const client = new RetryClient(gateway, { attempts: 3, retryDelayMs: 200, deadlineMs: 2000 });
  const result = await client.call({ requestId: 'r-1' }, new AbortController().signal);
  expect(result).toEqual({ ok: false, code: 'DEADLINE_EXCEEDED' });
  expect(gateway.timeline).toEqual([0, 900, 1800]);
});`, `attempt 1 start=0ms timeout=700ms
retry wait=200ms attempt 2 start=900ms
retry wait=200ms attempt 3 start=1800ms budget=200ms
deadline exhausted before fourth attempt
1 passed (2.1s)

最大尝试次数与总 deadline 同时生效，最后一轮不会获得新的完整超时。`],
    ['用真实代理注入延迟和连接拒绝', 'PowerShell · Toxiproxy', `docker compose up -d toxiproxy postgres
toxiproxy-cli create postgres-proxy --listen 0.0.0.0:5433 --upstream postgres:5432
toxiproxy-cli toxic add postgres-proxy --type latency --attribute latency=900 --toxicity 1.0
pnpm exec pytest tests/integration/test_db_timeout.py
toxiproxy-cli toxic remove postgres-proxy --toxicName latency_downstream
Write-Output "exit=$LASTEXITCODE"`, `pytest test_db_timeout.py . [100%]
pool acquire timeout=2500ms
HTTP response 503 code=DB_UNAVAILABLE retryable=true
latency toxic removed, health recovered
exit=0

延迟发生在 TCP 代理上，应用真实经历连接等待、超时和恢复，不依赖 mock 抛异常。`],
    ['不确定结果先查幂等记录再重试', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('recovers the committed payment before sending a second charge', async () => {
  const ledger = new MemoryLedger({ 'idem-42': { state: 'committed', paymentId: 'pay-9' } });
  const gateway = new SpyGateway();
  const result = await chargeWithRecovery({ idempotencyKey: 'idem-42', cents: 2500, ledger, gateway });
  expect(result).toEqual({ ok: true, paymentId: 'pay-9', recovered: true });
  expect(gateway.chargeCalls).toBe(0);
});`, `lookup idempotencyKey=idem-42 -> committed pay-9
recovered result=true
gateway chargeCalls=0

第一次请求结果不确定时先查询账本，已有成功记录直接返回，避免重复扣款。`],
    ['熔断器从 closed 到 open 再 half-open', 'TypeScript · Vitest', `import { expect, it } from 'vitest';
it('opens after three failures and permits one half-open probe', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 1000 });
  const failing = async () => { throw new Error('timeout'); };
  for (let index = 0; index < 3; index += 1) await breaker.call(failing);
  expect(breaker.state).toBe('open');
  await expect(breaker.call(failing)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
  breaker.advanceClock(1001);
  expect(breaker.state).toBe('half-open');
  await expect(breaker.probe(async () => 'ok')).resolves.toBe('ok');
  expect(breaker.state).toBe('closed');
});`, `failure 1/3 state=closed
failure 3/3 state=open
open call rejected CIRCUIT_OPEN
clock +1001ms state=half-open
probe success state=closed

状态机每个转换都有证据，而不只是看到某个请求返回 503。`],
    ['恢复后核对库存、订单与支付流水', 'Python · pytest', `def test_recovery_converges_after_gateway_returns(db, payment_gateway):
    order = create_pending_order(db, order_id="o-77", quantity=1)
    payment_gateway.timeout_once()
    run_checkout(order.id)
    payment_gateway.restore()
    run_recovery_once()
    assert db.scalar("select available from stock where sku='A-1'") == 0
    assert db.scalar("select state from orders where id='o-77'") == "paid"
    assert db.scalar("select count(*) from payment_ledger where order_id='o-77'") == 1`, `tests/test_payment_recovery.py .                                [100%]
1 passed in 0.38s
stock.A-1 available=0
order.o-77 state=paid
payment_ledger rows=1
reconciliation job errors=0

网络恢复后后台任务收敛到唯一一致状态，没有重复库存或重复扣款。`],
  ],
  [
    ['每项结论链接原始性能或安全证据', 'JSON · Evidence Manifest', `{
  "runId": "quality-2026-11-24-01",
  "commit": "8e1c2a7",
  "performance": {
    "summary": "artifacts/k6-summary.json",
    "trace": "artifacts/trace-3f8a91.json"
  },
  "security": {
    "corpus": "tests/security/corpus.yaml",
    "report": "artifacts/security.xml"
  },
  "environment": { "image": "sha256:21ac...", "database": "postgres:16.4" }
}`, `manifest schema validation=pass
performance.summary exists size=184KB
performance.trace exists size=2.1MB
security.report exists tests=42 failures=0
environment digest=sha256:21ac...

每条性能与安全结论都能追溯到原始文件、提交和环境指纹。`],
    ['性能报告写出分位、环境和比较基线', 'Markdown · Performance Report', `# Catalog latency regression

- Image: api@sha256:21ac...
- Database: postgres:16.4, 100000 orders
- Load: 80 rps for 3 minutes, 60s warm-up
- Baseline main: p95 218ms, p99 531ms, errors 0.21%
- Candidate: p95 241ms, p99 702ms, errors 0.43%
- Verdict: fail p99 budget (+32.2%)

Evidence: artifacts/k6-summary.json, trace trace-3f8a91.json`, `report=PERF-2026-11-24
p95 delta=+10.55% p99 delta=+32.20%
comparison environment=identical digest
verdict=failed
linked evidence=3 files

报告给出绝对分位、基线增量、数据和镜像版本，读者能判断能否比较。`],
    ['安全发现以最小请求和脱敏证据重放', 'Markdown · Security Finding', `# SEC-42: invoice search accepts tautology

Severity: high
Route: GET /api/invoices?q=...
Minimal input: redacted SQL tautology token
Expected: empty result and 200
Observed: all tenant invoices returned
Evidence: request id tr-4f2a, query count=1, no stack trace
Fix commit: 91c2da4
Regression: SEC-SQL-TAUTOLOGY`, `request id=tr-4f2a
tenant rows before=12 after=0
no credentials, tokens or customer names in report
replay corpus id=SEC-SQL-TAUTOLOGY

证据足够重放，却不包含真实用户数据或可直接滥用的完整载荷。`],
    ['修复报告对照原失败并列出剩余风险', 'Markdown · Remediation Report', `| Check | Before | After |
| --- | --- | --- |
| p99 catalog | 702ms | 486ms |
| error rate | 0.43% | 0.12% |
| SEC-SQL-TAUTOLOGY | returned all rows | returned zero |
| tenant isolation | manual only | API matrix in CI |

Residual risk: cache hit path not covered under 500 rps; owner APP-231 due 2026-12-06.`, `performance verdict=pass
security corpus=43 passed 0 failed
prior failure artifacts linked=2
residual risk owner=APP-231 due=2026-12-06

修复不是只写“已解决”，而是对照原失败、展示新证据并交代未覆盖边界。`],
    ['独立人员按命令重放并核对哈希', 'PowerShell', `git fetch origin 8e1c2a7
git worktree add ../replay-8e1c2a7 8e1c2a7
Push-Location ../replay-8e1c2a7
pnpm install --frozen-lockfile
pnpm exec k6 run tests/perf/catalog.js --summary-export artifacts/replay-summary.json
Get-FileHash artifacts/replay-summary.json -Algorithm SHA256
Pop-Location`, `replay operator=reviewer-b
commit=8e1c2a7 lockfile hash=72ab...
p95=224ms p99=539ms errors=0.23%
result within report tolerance=pass
sha256=4f2a9c... summary artifact stored

独立工作树、锁文件和报告容差使重放不依赖原执行者本地状态。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q4_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q4Name('性能基线、分位和错误预算'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能启动一个可压测的 HTTP 服务，理解平均延迟、p95、吞吐量和错误率的基本含义。',
    goal: '能定义固定负载下的性能基线，用 k6 采集 p95、p99、错误率和吞吐，设置可解释的预算阈值，并证明环境变化时报告仍能比较。',
    guidedPractice: '为订单查询写 k6 脚本，设置 20 VUs、持续 2 分钟，并用 `k6 run --summary-export=artifacts/summary.json tests/order-load.js` 采集数据。给 `http_req_duration` 设 `p(95)<300`、`http_req_failed<0.01`，故意把数据库索引删掉，观察阈值失败、错误率和慢请求分布，再恢复索引重跑。',
    independentPractice: '为核心 API 建立性能预算，包含正常响应、空结果和高并发三档；提交脚本、数据规模、机器规格、失败阈值与修复前后摘要。',
    commonErrors: [
      '只报告平均延迟，长尾请求被少数快请求掩盖，用户仍会在 p95 或 p99 上明显卡顿。',
      '前后两次压测使用不同数据量、机器或并发，看到数字变化就归因于代码，结论无法复现。',
    ],
    sourceRefs: [sources.k6, sources.opentelemetry, sources.googleSizes],
    steps: [
      ['定义负载与用户行为', '性能测试先写明虚拟用户、请求比例、思考时间、数据规模和执行时长，例如 80% 查订单、20% 查列表，每个 VU 等待 500ms。k6 的 `options.scenarios` 可设置 constant-vus，请求用 `http.get` 记录标签；边界包含冷缓存、20 VUs 与 100 VUs。失败输出保存 scenario、VU、请求标签和开始时间，证据附脚本版本与固定数据集，避免只给一个总耗时，这样才能比较不同版本。', '工作负载要描述真实用户组合'],
      ['固定分位与错误阈值', '阈值写成 `http_req_duration: ["p(95)<300", "p(99)<800"]` 与 `http_req_failed: ["rate<0.01"]`，吞吐则与错误率一起看；边界选择 200 条和接近超大数据，失败时 summary.json 会标出 breached threshold。保存每个 endpoint 的 count、mean、p95、p99 与 max，并记录请求数是否足够。证据包含原始 JSON 和阈值报告，解释预算是业务可接受延迟而非机器偶然结果；失败后还要先确认采样请求量是否足够，并复核。', '分位阈值比均值更能代表尾延迟'],
      ['控制环境与数据规模', '压测报告必须记录 CPU、内存、数据库版本、容器资源限制、网络位置和表行数；用 `docker compose` 的 cpus/memory 限制固定环境，执行前运行种子脚本。边界检查冷启动首分钟与稳定运行十分钟，失败日志保存容器 metrics 和连接池状态。证据包含机器规格、镜像 digest、数据统计和两次重复运行，只有同环境偏差足够小才允许比较优化结果。', '不同环境的数据不能直接比较'],
      ['把慢请求追到依赖', '当 p95 超预算时，用 OpenTelemetry trace、数据库 `EXPLAIN (ANALYZE, BUFFERS)` 和 k6 tags 关联慢请求，区分排队、SQL、序列化或垃圾回收。边界选最慢 1% 请求，检查连接池耗尽与重试放大；失败报告保存 traceId、SQL 与耗时分解。证据应能说明 300ms 超时中数据库占多少、应用占多少，修复后继续用同一采样条件和数据规模复测，避免把噪声当作改善。', '尾延迟必须拆到具体依赖'],
      ['形成预算与回归机制', '把性能脚本、数据种子和阈值提交到仓库，在发布前或夜间固定环境运行，结果与上一版本同负载比较；命令失败返回非零并保存 summary。边界检查服务未就绪、缺少数据与阈值刚好越线，失败分类为环境或回归。最终证据包含预算定义、基线提交、失败构建、修复报告和审批例外，性能结果不能只活在一次手工截图里；`k6 run --summary-export` 应作为固定入口。', '预算要进入持续回归而非一次性测试'],
    ],
  },
  {
    name: q4Name('负载、压力和浸泡测试'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已完成一次固定负载性能测试，能读取 k6 或类似工具的吞吐、错误率和资源指标。',
    goal: '能区分负载、压力和浸泡测试的假设，逐步提高并发探测饱和点，用长时运行检查内存泄漏和连接耗尽，并从时间序列识别故障前兆。',
    guidedPractice: '用 k6 stages 从 10 VUs 升到 200 VUs，再保持 10 分钟，记录吞吐、p95 与错误率转折点；收集 Node/Python/数据库进程内存和连接数。制造连接池上限为 10 的压力场景，观察排队、超时和恢复，保存时间序列 JSON、容器指标与失败日志。',
    independentPractice: '为一个文件上传服务设计压力与两小时浸泡测试，说明停止条件、资源上限和恢复步骤；提交饱和点、内存斜率、连接数曲线与一次故障后的恢复证据。',
    commonErrors: [
      '把压力测试当成不断加 VU 直到服务崩溃，没有设定业务错误率和恢复边界，测坏环境也无法定位首个失效环节。',
      '浸泡测试只看进程是否活着，不记录内存、连接和队列随时间变化的斜率，缓慢泄漏被短测掩盖。',
    ],
    sourceRefs: [sources.k6, sources.opentelemetry, sources.chaos],
    steps: [
      ['用阶梯负载找转折点', '负载测试保持请求类型不变，按 stages 逐步增加 VUs，例如 10、50、100、200，每档至少持续几分钟，观察 p95、错误率、吞吐和资源利用率是否出现拐点。k6 脚本用 `ramping-vus`，边界把拐点前后各保留一档；失败输出保存每档的 request count 和阈值。证据是时间序列与机器指标，不能只记录最终平均值，只有连续曲线才能支撑容量判断。', '饱和点来自曲线而非猜测'],
      ['压力测试验证过载保护', '压力阶段把并发推到超过容量，确认限流、队列上限、超时和降级按设计触发，而不是无界排队拖垮全部请求。边界包括刚好达到限流、超过一档和依赖同时变慢，使用 k6 custom metric 记录 429/503 比例。失败日志保存首错时间、队列长度与恢复耗时，证据包含服务指标和客户端 summary。过载下返回可解释错误也是正确行为，`k6 run tests/stress.js` 应记录每次阈值结果。', '超过容量时也要保持可控失败'],
      ['浸泡测试观察慢漂移', '浸泡测试以稳定但接近目标的负载运行数小时，监控 RSS、堆、goroutine/线程数、文件描述符、连接池和磁盘增长。命令 `k6 run --duration=2h tests/soak.js` 并每分钟采集指标，边界检查内存是否有不回落平台、连接是否只增不减。失败时保存开始与结束 heap profile、连接统计和日志，证据用斜率而不是单个峰值判断泄漏。', '短时正常不代表长时间稳定'],
      ['定位饱和后的雪崩链路', '当应用排队导致超时，重试又放大流量，应结合 trace、连接池指标和上游日志找出雪崩起点。边界模拟数据库延迟 100ms、500ms 和 2s，比较重试预算与熔断触发；失败报告保存请求 id、重试次数、排队时长和最终状态。证据应画出一次请求从入口到依赖的时间轴，证明限流和降级是否真正切断正反馈；可用 `k6 run` 与 OpenTelemetry trace API 对照。', '排队与重试必须一起观察'],
      ['规定停止与恢复条件', '压测脚本设置最大错误率、最大资源和最长持续时间，达到条件立即停止并保存快照；恢复后先降载 warmup，再确认队列清空、连接回落和错误率正常。边界检查进程重启后是否仍需手动清队列，证据保存停止原因、恢复命令和时间线。最终报告包含正常负载、过载保护、浸泡漂移和恢复四项，不以压垮服务作为成功；阈值触发失败时停止脚本，`k6 run` 报告作为证据。', '压测必须带安全停止开关'],
    ],
  },
  {
    name: q4Name('认证、授权和对象越权回归'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解登录会话、角色与资源所有权，能发送带认证头和参数的 HTTP 请求。',
    goal: '能建立匿名、普通用户、管理员和跨租户四类身份矩阵，用自动化请求验证认证失败、角色授权和对象级权限，确保响应不泄漏敏感数据。',
    guidedPractice: '为订单 API 准备四组令牌，分别请求自己的订单、他人的订单、管理员订单和不存在的订单。用 Playwright request 或 pytest `client.get` 断言 401、403、404 与响应中不含他人邮箱；修改处理器直接按 id 查询，观察越权测试变红并保存请求头、资源所有者和响应体。',
    independentPractice: '为一个文件下载接口写身份矩阵，覆盖匿名、同租户不同用户、同用户已删除和过期 token；要求断言状态码、响应体和审计事件，提交脱敏报告。',
    commonErrors: [
      '只测试未登录返回 401，不测试已登录用户访问他人资源，BOLA 对象越权会完全漏掉。',
      '用 403 响应暴露对象是否存在，或错误响应仍包含他人名称和邮箱，权限测试只检查状态码会漏掉数据泄漏。',
    ],
    sourceRefs: [sources.asvs, sources.wstg, sources.playwright],
    steps: [
      ['建立身份与资源矩阵', '列出匿名、用户 A、用户 B、租户管理员和平台管理员，行为列为读取自己、读取他人、修改、删除和列出。每个资源使用明确 owner_id、tenant_id 与状态，通过 fixture 创建；边界包含资源不存在、已删除和角色刚变更。失败报告保存 actor、action、resource、状态码和响应摘要，证据应脱敏 token 但保留用户与租户标识，防止矩阵缺失；`pytest -m authz` 要能覆盖全部组合。', '权限测试先覆盖身份与对象组合'],
      ['验证认证失败契约', '无 token、过期 token、错误签名和撤销会话应返回稳定 401，响应不包含资源数据；用 `curl -i` 或 Playwright `request.get` 保存 WWW-Authenticate 头和错误码。边界检查 token 在请求过程中过期、cookie 与 Authorization 同时存在，失败日志记录认证方式和时钟。证据包含请求头、状态、响应体和审计日志，不能只断言跳转登录页，报告还要标明测试时钟，避免过期判断时有时无。', '认证失败不能回退为匿名访问'],
      ['验证功能级与对象级授权', '功能级检查普通用户不能调用管理接口，对象级检查用户 A 不能读取用户 B 的订单；查询必须带 owner 或 tenant 条件，测试直接访问真实 id。边界覆盖修改 id、批量接口中混入他人 id 和导出全部记录，失败报告列出响应中泄漏的字段。证据包含数据库资源归属、请求与响应，服务器必须先授权再返回 404/403；`curl -i` 可保留原始请求和响应。', '对象所有权必须由服务端校验'],
      ['测试错误响应最小泄漏', '403 与 404 的业务选择要一致，响应体不返回 SQL、文件路径、他人邮箱和内部角色信息；边界输入不存在与存在但无权访问的对象，比较响应差异是否泄露存在性。失败报告保存响应头、请求 id 和服务日志，证据用脱敏后的 diff。审计日志应记录谁尝试访问哪个资源，不能记录完整 token。', '权限失败消息也要最小暴露'],
      ['把权限回归接入 API 门禁', '身份矩阵测试放在每次 API 变更的集成门禁，使用多个独立账号并清理数据；命令 `pytest -m authz` 或 `npx playwright test tests/api-authz.spec.ts --reporter=junit` 输出所有组合。边界检查并行用户、租户切换和 token 撤销，失败上传脱敏请求与报告。最终保存矩阵覆盖率、审计事件和最近一次真实越权修复，确认没有用页面按钮隐藏替代服务器授权。', '越权回归必须覆盖真实 API'],
    ],
  },
  {
    name: q4Name('输入、上传、SSRF 与注入测试'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '了解参数化 SQL、文件上传和 URL 抓取流程，能在授权的本地或测试环境发送恶意边界输入。',
    goal: '能按 OWASP 测试指南验证 SQL/命令注入、上传类型、路径穿越与 SSRF 防护，用安全边界输入证明服务拒绝危险目标且日志不泄漏敏感内容。',
    guidedPractice: '在授权测试服务上提交含单引号与注释符的搜索参数、伪装扩展名的 HTML 文件和指向 `169.254.169.254` 的抓取 URL，观察参数化查询、内容嗅探与目标白名单。保存 HTTP 状态、净化后日志和出站请求拒绝记录；只使用无害标记，不执行破坏性 payload。',
    independentPractice: '为上传和 URL 预览功能分别建立正负输入表，覆盖 MIME、大小、路径、内网地址和 DNS 重绑定；提交请求、响应、出站网络证据与修复建议。',
    commonErrors: [
      '只检查文件扩展名就允许上传，MIME、文件签名、存储路径和下载响应头都没有验证。',
      'SSRF 测试只屏蔽 `127.0.0.1`，忽略 IPv6、云元数据地址、重定向和 DNS 解析后地址变化。',
    ],
    sourceRefs: [sources.wstg, sources.asvs, sources.axe],
    steps: [
      ['从威胁模型选测试输入', '先确定入口、解析器、查询层和出站请求，再为每处选择无害边界：SQL 单引号、命令分隔符、超长 Unicode、双扩展名和私有网段 URL。测试只打在授权环境，使用 `curl -i` 或 API client 保存原始请求，边界包括合法值、拒绝值与编码变形。失败信息记录输入类别、响应状态和服务日志，证据脱敏且不执行系统命令或真实数据破坏。', '测试目标由数据流与信任边界决定'],
      ['验证 SQL 与命令注入边界', '输入 `O\'Reilly`、`%` 与带注释符的字符串，确认查询仍按字面量执行；查看应用日志中的参数化 SQL，边界覆盖搜索、排序字段和 LIKE 转义。命令执行如不可避免，应使用固定白名单与 argv 数组，测试分号、管道和换行均不产生新命令。失败报告保存最终 SQL、参数与退出码，证据证明用户输入没有进入解释器代码位置。', '参数值不得变成语法结构'],
      ['验证上传内容与路径', '上传测试覆盖合法 PNG、伪造 MIME、HTML 内容、超限文件、双扩展名和包含 `../` 的文件名；服务端应检查文件签名、大小、存储隔离并返回安全 Content-Type。边界检查压缩包与空文件，失败日志保存文件哈希、检测结果和对象存储 key，不保存真实敏感内容。证据包含请求头、响应头与隔离目录清单，下载时也必须强制安全处理。', '上传安全要检查内容与存储两端'],
      ['验证 SSRF 目标约束', 'URL 预览功能应解析主机、校验重定向后的地址并解析全部 A/AAAA 记录，拒绝 loopback、link-local、私网和云元数据网段；边界测试十进制 IP、IPv6、DNS 重绑定与 302 跳转。用网络代理或 eBPF/容器网络日志证明没有实际出站连接，失败报告保存解析地址与请求链路。证据包含允许列表、拒绝码和代理日志，不能只靠字符串包含 `localhost`。', 'SSRF 校验必须发生在连接前'],
      ['把安全输入变成持续回归', '把无害 payload 做成参数表接入 API 安全测试，按 OWASP ASVS 条目标记断言，失败时只输出脱敏摘要。边界检查编码、大小写和代理头，命令 `pytest -m security` 或 Playwright API 测试输出 JUnit；漏洞修复后保留旧 payload 作为回归。最终证据包含威胁编号、请求、拒绝证据、修复 diff 和复测报告，所有测试只在明确授权环境执行。', '修复过的攻击输入要永久回归'],
    ],
  },
  {
    name: q4Name('超时、重试、熔断和故障注入'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能配置 HTTP 客户端超时和重试，并理解依赖延迟、错误率与熔断状态之间的关系。',
    goal: '能用代理或故障注入工具制造延迟、断连、丢包和半开恢复，验证超时预算、指数退避、幂等重试和熔断器状态转换，并证明故障后系统可恢复。',
    guidedPractice: '用 Toxiproxy 在 API 与数据库之间注入 2 秒延迟和连接重置，给客户端设置 500ms timeout、最多 2 次指数退避重试和熔断阈值。运行订单测试，记录 504/503、重试间隔、断路器 open 时刻与恢复探测；保存 toxiproxy 配置、日志和服务指标。',
    independentPractice: '为一个调用支付和库存的服务设计三种故障：慢响应、持续 500、短时断网；验证只重试幂等请求、熔断快速失败、依赖恢复后自动闭合，并提交时间线和最终数据一致性。',
    commonErrors: [
      '在主线程里同步 sleep 重试，依赖未恢复时占满 worker，重试把局部故障放大成全局容量问题。',
      '对非幂等支付请求自动重试，没有幂等键和结果查询，网络超时后可能重复扣款。',
    ],
    sourceRefs: [sources.chaos, sources.opentelemetry, sources.k6],
    steps: [
      ['写清超时与重试预算', '为入口、服务调用和依赖定义总 deadline，例如页面 3 秒、订单服务 1.5 秒、支付 500ms，子调用不能超过父预算；重试次数、退避和 jitter 要写入配置。用 `curl -w` 与测试内计时断言总耗时，边界覆盖响应刚好 499ms 与 501ms、一次失败后成功及重试耗尽。失败日志保存 deadline、attempt、错误类型，证据包含时间线和配置版本。', '总 deadline 必须约束所有重试'],
      ['制造延迟与连接故障', 'Toxiproxy 的 `latency`、`timeout` 或 `reset_peer` 可在进程外注入故障，避免测试代码自己改业务逻辑；边界设置 100ms、1s 和断连，观察客户端错误分类与数据库连接池。命令启动 proxy、注册 toxic 后运行集成测试，失败报告保存 proxy 名称、毒性参数、请求 ID 与应用日志。证据应证明请求真实经过故障代理，而不只是 mock 方法抛异常。', '故障注入要发生在真实网络边界'],
      ['验证幂等重试与恢复查询', '只有带幂等键的创建、扣款等请求可重试；测试第一次请求在服务端已成功但客户端超时，再用相同 idempotency key 重试，结果必须返回同一业务对象。边界包含重复回调、不同请求体复用同一 key 和结果缓存过期，失败输出保存 key、业务 ID 与两次响应。证据包含服务端幂等记录、数据库行和网络时间线，证明没有双扣款；`pytest -k idempotency` 应能独立复跑。', '不确定结果先查询再重试'],
      ['观察熔断器状态变化', '持续注入 500 错误，断言熔断器从 closed 进入 open，请求快速失败且不继续打爆依赖；等待半开窗口后放少量探针，成功则 closed，失败则重新 open。边界检查阈值正好达到、并发探针和多个实例状态，失败日志记录 failure rate、window 和剩余冷却时间。证据包含熔断指标、请求量与依赖恢复日志，不能只看到异常消失就算通过；`toxiproxy-cli inspect` 可核对当前故障是否仍在。', '熔断要验证状态机而非只看 503'],
      ['验证故障后的数据一致性', '故障解除后检查订单、库存、支付与消息最终状态，运行对账查询或补偿任务；边界覆盖补偿重复执行和服务重启。命令 `pytest tests/test_resilience.py -k recovery` 后保存数据库前后快照、重试队列和 trace。最终证据包括故障配置、失败时间线、自动恢复时间与残留异常，若只能通过人工重启恢复，应把它写入运行边界。', '恢复后还要证明数据一致'],
    ],
  },
  {
    name: q4Name('性能与安全报告的可复现证据'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能运行性能压测和安全 API 测试，并知道一次结论需要哪些日志、配置和环境信息。',
    goal: '能整理性能与安全报告，使每项结论绑定命令、版本、阈值、失败证据和修复验证，区分风险事实、测试条件和未验证范围。',
    guidedPractice: '选择一个 p95 超标和一个对象越权问题，分别制作报告：性能段写 k6 脚本、数据集、机器规格、summary.json 与 trace；安全段写身份矩阵、请求、状态码、日志和 ASVS 条目。把敏感 token 和用户数据脱敏后归档，确保他人按命令能复现同一失败。',
    independentPractice: '为一个发布候选汇总性能与安全证据包，包含通过项、失败项、环境故障、修复前后对照和剩余风险，并让另一位同学根据报告独立重放一个失败。',
    commonErrors: [
      '报告只写“性能较差”或“存在越权”，没有请求、版本、阈值和原始工件，团队无法判断是否真的进入发布范围。',
      '把安全请求中的真实 token、密码和用户数据直接贴进工单，证据有了却造成二次泄漏。',
    ],
    sourceRefs: [sources.k6, sources.wstg, sources.opentelemetry],
    steps: [
      ['固定报告的证据模型', '每条结论包含问题 ID、环境、提交版本、命令、输入数据、阈值或安全要求、实际结果、原始工件和修复状态。性能用 `/artifacts/{runId}/summary.json`，安全用脱敏请求与响应，日志用 traceId 关联。边界包括通过、失败和环境阻塞三种状态，失败信息要指向具体指标或权限矩阵单元。证据目录结构统一后，报告才能被机器与人工共同检查。', '每项结论都要链接原始证据'],
      ['把性能数据写成可比较报告', '性能段落记录 k6 scenario、VUs、持续时间、数据行数、CPU/内存限制和 percentile，附 summary JSON 与 trace；边界与上一版本使用相同条件。命令、镜像 digest 和随机种子必须可复制，失败阈值显示实际值。证据包含 baseline、候选版本和差值，若环境变化过大则标记不可比较，而不是把噪声写成回归，报告应附原始导出文件而非只贴图片；`k6 run --summary-export` 应生成该文件。', '性能结论必须带可比环境'],
      ['把安全发现写成可重放用例', '安全段落记录资产、威胁类别、身份、资源所有者、请求步骤、预期拒绝和实际响应，附 ASVS 条款和脱敏日志；边界覆盖越权资源不存在和存在但无权。命令尽量写成可运行的 curl 或测试 id，证据包含网络请求、状态码和原始数据哈希。报告中明确授权范围，禁止包含破坏性 payload 与真实秘密；安全请求失败时保存 `curl -i` 响应作为证据。', '安全证据要最小披露且可复现'],
      ['分离失败、修复与剩余风险', '为每个问题建立时间线：首次发现、确认条件、修复提交、复测命令与结果；若未修复，写清风险、影响范围和负责人，不用“待观察”掩盖。边界检查修复版本在冷启动和真实依赖下重跑，性能与安全各自回归。证据保留失败与修复两套工件，避免只上传绿色结果，让复核者能确认修复针对原问题；`pytest -k regression` 要按报告复跑。', '修复报告必须对照原失败'],
      ['做一次独立重放验收', '让未参与修复的人只依据报告执行命令、找到失败、修复版本复测；边界记录缺少权限、镜像不可拉取和测试数据过期等阻塞。观察者需给出报告是否足够、哪一步信息缺失和实际重放结果，证据保存反馈与修订历史。最终报告达到他人无需口头补充即可复现，才算完成质量证据交付；复跑命令如 `npx playwright test` 必须写入证据索引。', '独立重放是报告质量的验收'],
    ],
  },
], q4Examples);

// ── Q5 CI 门禁、稳定性与质量运营 ────────────────────────────────────────────
const q5Stage = 'CI 门禁、稳定性与质量运营';
const q5Name = (topic: string) => `测试与工程质量 · ${q5Stage}：${topic}`;

const q5Examples: readonly (readonly TestingExampleSpec[])[] = [
  [
    ['四层流水线按反馈成本分层', 'GitHub Actions YAML', `name: quality-layers
on: [pull_request, push, schedule, release]
jobs:
  pr-fast:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps: [{ run: pnpm exec vitest run tests/unit --reporter=junit --outputFile=unit.xml }]
  main-full:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps: [{ run: pnpm exec vitest run --coverage }]
  nightly:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps: [{ run: pnpm exec playwright test --project=chromium-mobile }]
  release:
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    steps: [{ run: pnpm run verify:artifact }]`, `pull_request  pr-fast      48s
push          main-full    6m12s
schedule      nightly     24m40s
release       release      9m03s
four jobs, no duplicated expensive stage

PR 拿快速反馈，主干扩大单元范围，夜间覆盖浏览器，发布验证最终制品。`],
    ['必需状态检查真正阻断合并', 'PowerShell · GitHub CLI', `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '.contexts'
gh pr checks 418
Write-Output "checks_exit=$LASTEXITCODE"
gh pr view 418 --json mergeStateStatus,statusCheckRollup`, `contexts=["unit","typecheck","integration"]
PR #418 checks: unit pass, typecheck pass, integration fail
mergeStateStatus=BLOCKED
checks_exit=1

集成检查失败且属于 required contexts，分支保护会阻止合并。`],
    ['主干与夜间覆盖完整广度', 'PowerShell · GitHub CLI', `gh run list --workflow quality-layers.yml --branch main --limit 1 --json databaseId,conclusion
gh run view 198712 --log | Select-String 'tests='
gh run list --workflow nightly.yml --limit 1 --json databaseId,conclusion`, `main run 198712 conclusion=success
main tests=3188 skipped=4
nightly run 198040 conclusion=success
nightly browser=36 traces=0

主干保留完整测试广度，夜间增加跨浏览器与长时任务，未把任务从 PR 简单消失。`],
    ['发布门禁验证镜像而不是源码', 'PowerShell · Docker', `docker pull registry.example.test/orders@sha256:21ac
docker run --rm registry.example.test/orders@sha256:21ac --migrate --check
docker run --rm registry.example.test/orders@sha256:21ac --smoke
docker sbom registry.example.test/orders@sha256:21ac --format spdx-json > artifacts/orders.sbom.json
Write-Output "verify=$LASTEXITCODE"`, `image digest=sha256:21ac
migrations pending=0
smoke health=ok db=ok
sbom packages=184 artifact=orders.sbom.json
verify=0

门禁直接执行发布镜像，验证二进制、迁移和 SBOM，没有被本地源码的成功掩盖。`],
    ['月度审计门禁覆盖和绕过情况', 'PowerShell · GitHub CLI', `$runs = gh run list --workflow quality.yml --limit 100 --json conclusion,event,createdAt | ConvertFrom-Json
$failures = $runs | Where-Object conclusion -eq 'failure'
$retries = gh api repos/{owner}/{repo}/actions/runs --paginate | ConvertFrom-Json
$disabled = rg -n "\.skip|it\.skip|test\.skip|--passWithNoTests" .github tests --glob '!node_modules'
Write-Output "runs=$($runs.Count) failures=$($failures.Count) skipped_markers=$($disabled.Count)"`, `runs=100 failures=7 failure_rate=7%
pull_request failures=4 environment_failures=1 product_failures=3
skipped_markers=2 both reviewed with issue ids
gate audit next review=2026-12-24

审计同时查看失败、绕过标记和检查是否真的执行，门禁本身有持续复盘。`],
  ],
  [
    ['先证明资源隔离再开启并行', 'Vitest Config', `export default defineConfig({
  test: {
    pool: 'forks',
    maxWorkers: 4,
    sequence: { concurrent: true },
    setupFiles: ['./tests/setup/run-namespace.ts'],
    fileParallelism: true,
  },
});`, `workers=4 database_schemas=4 redis_prefixes=4 temp_dirs=4
parallel suite=214 tests passed
rerun same seed=214 passed
shared-state errors=0

每个 worker 有独立 schema、缓存前缀和临时目录，并行不是只改线程数。`],
    ['哈希分片无遗漏且无重复', 'TypeScript · Vitest', `import { expect, test } from 'vitest';
const files = ['auth.test.ts', 'billing.test.ts', 'cart.test.ts', 'checkout.test.ts', 'refund.test.ts'];
const shard = (file: string, count: number) => [...file].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % count;

test('four shards cover each file exactly once', () => {
  const assigned = files.flatMap((file) => [shard(file, 4)]);
  expect(assigned).toHaveLength(files.length);
  for (let index = 0; index < 4; index += 1) {
    expect(files.filter((file) => shard(file, 4) === index).length).toBeGreaterThan(0);
  }
});`, `shard 0: auth.test.ts checkout.test.ts
shard 1: billing.test.ts
shard 2: cart.test.ts
shard 3: refund.test.ts
covered=5 unique=5 missing=0

分片只按稳定文件名哈希，不依赖运行时长，重跑会落到相同 shard。`],
    ['缓存键包含锁文件、系统和工具版本', 'GitHub Actions YAML', `- uses: actions/cache@v4
  with:
    path: |
      ~/.local/share/pnpm/store
      ~/.cache/ms-playwright
    key: \${{ runner.os }}-node24-pnpm9-\${{ hashFiles('pnpm-lock.yaml') }}-playwright1.49.1
    restore-keys: |
      \${{ runner.os }}-node24-pnpm9-`, `cache key=Linux-node24-pnpm9-72ab91c2-playwright1.49.1
cache hit=false first run install=24.8s
cache hit=true second run install=3.1s
browser version mismatch=false

依赖升级会改变 lockfile 哈希，浏览器版本改变也会换 key，旧缓存不会悄悄污染。`],
    ['合并报告前验证所有分片均已到达', 'PowerShell · JUnit', `$expected = 1..4 | ForEach-Object { "shard-$_.xml" }
$actual = Get-ChildItem artifacts/unit -Filter 'shard-*.xml' | Select-Object -ExpandProperty Name
$missing = $expected | Where-Object { $_ -notin $actual }
Write-Output "expected=4 actual=$($actual.Count) missing=$($missing -join ',')"
if ($missing) { exit 1 }
junit-merge artifacts/unit -o artifacts/unit-merged.xml
[xml]$report = Get-Content artifacts/unit-merged.xml
Write-Output "tests=$($report.testsuites.tests) failures=$($report.testsuites.failures)"`, `expected=4 actual=3 missing=shard-4.xml
exit=1
merge skipped
no merged report uploaded

缺少一个分片时整体不会被误判为通过，即使已到达的三个报告全绿。`],
    ['提速指标与 flaky 指标一起比较', 'PowerShell', `pnpm exec vitest run --reporter=json --outputFile=artifacts/parallel.json
1..10 | ForEach-Object { pnpm exec vitest run tests/checkout --reporter=json --outputFile="artifacts/repeat-$_.json" }
node -e "const r=require('./artifacts/parallel.json'); const outcomes=[]; for(let i=1;i<=10;i++) outcomes.push(require('./artifacts/repeat-'+i+'.json').numFailedTests); console.log({duration:r.startTime,outcomes,flaky:new Set(outcomes).size>1})"`, `parallel duration=52s baseline=151s speedup=2.9x
repeat outcomes=[0,0,0,1,0,0,0,0,0,0]
flaky=true failing_runs=1
decision=do not adopt until isolated

三倍提速伴随 10% 不稳定率，优化必须先修复隔离再合并。`],
  ],
  [
    ['同提交同环境重复运行才叫 flaky', 'PowerShell · Playwright', `$sha = git rev-parse HEAD
1..20 | ForEach-Object -Parallel {
  pnpm exec playwright test tests/e2e/checkout.spec.ts --project=chromium-mobile --workers=1 --reporter=json --outputFile="artifacts/flaky-$_.json"
} -ThrottleLimit 4
Write-Output "commit=$sha runs=20 environment=image-21ac"`, `commit=8e1c2a7 runs=20 image=sha256:21ac
pass=17 fail=3
failure ids=[12,15,19]
first error: expect(status).toHaveText('已保存') after 5000ms

提交、镜像和测试命令相同，结果仍不一致，满足 flaky 证据条件。`],
    ['历史分布展示失败间隔和重试结果', 'PowerShell · GitHub CLI', `$runs = gh run list --workflow e2e.yml --limit 50 --json databaseId,conclusion,createdAt | ConvertFrom-Json
$runs | Group-Object conclusion | Select-Object Name,Count
$failed = $runs | Where-Object conclusion -eq 'failure' | Select-Object -First 5 databaseId
$failed | ForEach-Object { gh run view $_.databaseId --json attempt,conclusion,createdAt }`, `success=41 failure=9
first_failure=2026-11-03 last_failure=2026-11-22
same test=checkout.spec.ts Saved confirmation
retry pass=7 fail after retry=2
mean steps between failures=4.8

聚合展示失败频率与重试结果，单次绿灯不能掩盖历史不稳定。`],
    ['按根因拆分导航、数据和时序失败', 'TypeScript · Report Classifier', `const failures = [
  { test: 'navigation timeout', trace: 'open('/checkout') timed out', root: 'runner-network' },
  { test: 'cart count', fixture: 'stale user cart', root: 'shared-data' },
  { test: 'toast auto dismiss', waitMs: 100, root: 'strict-timing' },
] as const;
for (const failure of failures) {
  if ('trace' in failure) console.log(failure.test, '=> retry after runner health; do not retry product assertion');
  if ('fixture' in failure) console.log(failure.test, '=> unique namespace + fix fixture');
  if ('waitMs' in failure) console.log(failure.test, '=> web-first assertion');
}`, `navigation timeout => environment retry, max 1
cart count => shared data quarantine and fixture fix
toast auto dismiss => strict timing; remove fixed wait
retry policy applied per root cause

三类失败的处理动作不同，统一重试只会掩盖数据污染和错误等待。`],
    ['隔离清单必须有责任人、原因和到期日', 'YAML · Quarantine Manifest', `tests:
  - id: checkout-saved-toast
    file: tests/e2e/checkout.spec.ts
    owner: payments
    issue: APP-321
    reason: fixed 100ms wait races animation
    quarantinedAt: 2026-11-24
    expiresAt: 2026-12-08
    runIn: skip
  - id: cart-count-shared-user
    owner: growth
    issue: APP-327
    expiresAt: 2026-12-01`, `quarantined=2
expired=0
owner coverage=100%
issue coverage=100%
earliest expiry=2026-12-01
skipped tests appear in quality report

隔离测试仍被记录，带责任人和到期日，不会永久消失或被当作通过。`],
    ['连续通过后由流水线解除隔离', 'PowerShell · GitHub CLI', `1..30 | ForEach-Object -Parallel {
  pnpm exec playwright test tests/e2e/checkout.spec.ts --grep 'saved confirmation' --workers=1 --reporter=json --outputFile="artifacts/stable-$_.json"
} -ThrottleLimit 3
$failures = Get-ChildItem artifacts/stable-*.json | Where-Object { (Get-Content $_.FullName -Raw | ConvertFrom-Json).numFailedTests -gt 0 }
Write-Output "runs=30 failures=$($failures.Count)"
if ($failures.Count -eq 0) { gh pr create --title '解除 checkout 稳定测试隔离' --body '30/30 连续通过, APP-321' }`, `runs=30 failures=0
pass rate=100%
commit=fix-71c2da4 image=sha256:55be
quarantine removal PR opened

连续运行覆盖原始失败条件，解除隔离有固定提交、镜像和完整结果作为依据。`],
  ],
  [
    ['首次失败先上传现场再允许重试', 'GitHub Actions YAML', `- name: e2e
  run: pnpm exec playwright test --reporter=json --outputFile=artifacts/e2e.json
- name: upload first failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: first-failure-\${{ github.run_id }}
    path: |
      test-results/
      artifacts/e2e.json
- name: retry only once
  if: failure()
  run: pnpm exec playwright test --retries=1 --reporter=json --outputFile=artifacts/e2e-retry.json`, `attempt 1 failed at 02m17s
first-failure artifact uploaded before retry
attempt 2 passed at 03m44s
classification=flaky-candidate, attempt 1 evidence retained

重试不会覆盖第一次失败，失败 artifact 在再次执行前已经固定。`],
    ['request id 贯穿浏览器、API 与日志', 'Playwright TypeScript', `import { expect, test } from '@playwright/test';
test('returns one correlation id to every failure surface', async ({ page }) => {
  await page.goto('/checkout');
  const responsePromise = page.waitForResponse('**/api/checkout');
  await page.getByRole('button', { name: '提交订单' }).click();
  const response = await responsePromise;
  const id = response.headers()['x-request-id'];
  expect(id).toMatch(/^req-/);
  expect(response.status()).toBe(503);
  expect(await page.getByRole('alert').textContent()).toContain(id);
});`, `x-request-id=req-71ab
page alert: 暂时不可用，请求号 req-71ab
API log req-71ab gateway circuit open
UI trace req-71ab POST /api/checkout 503

同一标识可从页面错误、HTTP 响应和服务端日志三处定位。`],
    ['四类归因结论对应不同证据', 'TypeScript · Triage', `type Triage = { class: 'product' | 'environment' | 'infrastructure' | 'flaky'; evidence: string[] };
const cases: Triage[] = [
  { class: 'product', evidence: ['expected 201', 'received 422', 'valid payload'] },
  { class: 'environment', evidence: ['health 503 before navigation', 'no UI actions'] },
  { class: 'infrastructure', evidence: ['database not ready', 'all tests blocked'] },
  { class: 'flaky', evidence: ['same commit', '17 pass 3 fail', 'no product delta'] },
];
console.log(cases.map((item) => item.class + ':' + item.evidence.length).join(' '));`, `product:3 environment:2 infrastructure:2 flaky:3
retry policy: product=no environment=1 infrastructure=0 flaky=isolate
owner routed from first evidence

每类结论都有最低证据集合，重试与责任人由归因决定。`],
    ['日志定位事件，指标定位影响范围', 'PowerShell · Observability', `$requestId = 'req-71ab'
kubectl logs deploy/checkout --since=20m | Select-String $requestId
curl http://prometheus:9090/api/v1/query --data-urlencode 'query=rate(http_requests_total{status="503"}[5m])'
Write-Output "request_id=$requestId"`, `log req-71ab payment.authorize timeout 2500ms
metric checkout 503 rate=0.42/s baseline=0.01/s affected=api-gateway consumers
trace queue_wait=180ms gateway=2500ms
request_id=req-71ab

日志解释单次事件原因，指标说明 503 从何时扩散，trace 定位耗时阶段。`],
    ['重跑需要规则和最多一次授权', 'PowerShell · GitHub CLI', `$failed = gh pr checks 418 --json name,state | ConvertFrom-Json | Where-Object state -eq 'FAILURE'
if ($failed.name -eq 'e2e' -and (Test-Path 'test-results/first-failure')) {
  gh run rerun 198712 --failed
  Write-Output 'retry_allowed=1 reason=environment'
} else {
  Write-Output 'retry_allowed=0 manual_triage_required'
}`, `failed check=e2e
first-failure artifact present=true
classification=environment
retry_allowed=1 attempt=2 max_attempts=2

只有规则允许且首次现场存在时才重跑，最多一次，第三次失败进入人工归因。`],
  ],
  [
    ['指标先定义分子、分母和排除项', 'SQL · Quality Metrics', `SELECT
  count(*) FILTER (WHERE merged_at >= now() - interval '30 days') AS merged_prs,
  count(*) FILTER (
    WHERE merged_at >= now() - interval '30 days'
      AND hotfix = true
  ) AS hotfix_prs,
  round(
    100.0 * count(*) FILTER (WHERE merged_at >= now() - interval '30 days' AND hotfix = true)
    / nullif(count(*) FILTER (WHERE merged_at >= now() - interval '30 days'), 0),
    2
  ) AS hotfix_rate
FROM pull_requests;`, `merged_prs=184
hotfix_prs=7
hotfix_rate=3.80%
excluded=dependabot(22) generated(4)

分母和排除项明确写出，指标能从数据库原始行复算。`],
    ['反馈速度、稳定性和缺陷结果同屏', 'TypeScript · Quality Dashboard', `const snapshot = {
  feedback: { prP95Minutes: 18, mainMinutes: 7.4, nightlyMinutes: 31 },
  stability: { flakyRate: 1.8, quarantined: 2, expired: 0 },
  outcome: { escapedDefectRate: 0.6, rollbackRate: 0.9, incidentMttrMinutes: 42 },
} as const;
const regressed = snapshot.feedback.prP95Minutes > 20 || snapshot.stability.flakyRate > 2 || snapshot.outcome.escapedDefectRate > 1;
console.log({ ...snapshot, regressed });`, `pr_feedback_p95=18m
flaky_rate=1.8%
escaped_defect_rate=0.6%
rollback_rate=0.9%
regressed=false

更快的反馈如果没有稳定性和缺陷结果支撑，不会被当成质量提升。`],
    ['按影响、概率和恢复成本加权缺陷', 'SQL · Risk Weight', `SELECT id, severity, exposure, recovery_minutes,
  round(severity * exposure * (1 + least(recovery_minutes, 240) / 60.0), 2) AS risk_weight
FROM defects
WHERE discovered_at >= date '2026-11-01'
ORDER BY risk_weight DESC;`, `DEF-41 severity=5 exposure=0.8 recovery=180 risk_weight=20.00
DEF-39 severity=4 exposure=0.9 recovery=30 risk_weight=5.40
DEF-44 severity=2 exposure=1.0 recovery=10 risk_weight=2.33

两个“高严重度”缺陷因影响面和恢复成本不同获得不同行动优先级。`],
    ['阈值触发具体改进行动', 'YAML · Quality Policy', `metrics:
  escapedDefectRate:
    warning: 1.0
    action: review regression gaps within 3 business days
  changeFailureRate:
    warning: 15.0
    action: block release and run incident readiness review
  flakyRate:
    warning: 2.0
    action: freeze new quarantines and assign top two root causes
  prFeedbackMinutesP95:
    warning: 20
    action: profile CI slowest five jobs`, `escaped_defect_rate=1.2% -> warning
action owner=quality-lead due=2026-11-27 ticket=APP-341
change_failure_rate=8.4% -> normal
flaky_rate=2.4% -> warning ticket=APP-342

阈值输出责任人、期限和动作，不追求简单排行或排名惩罚。`],
    ['审计指标是否诱导禁测和宽泛重试', 'PowerShell', `rg -n "test\.skip|it\.skip|describe\.skip|test\.only|--retries=5|continue-on-error" tests .github
gh pr list --search 'label:quality-bypass' --state merged --limit 20 --json number,title
Write-Output 'metric_audit=2026-11'`, `skip markers=7 (6 linked issues, 1 expired)
test.only=0
retries>2=1 workflow e2e-legacy issue APP-355
quality-bypass merged=1 reviewed by CTO
metric_audit=2026-11

审计发现旧流程无限重试和一条绕过记录，指标没有奖励隐藏失败。`],
  ],
  [
    ['从业务风险形成毕业项目策略', 'Markdown · Quality Strategy', `# Checkout quality strategy

| Risk | Impact | Primary proof | Extra layer |
| --- | --- | --- | --- |
| wrong amount | high | unit property | integration ledger |
| duplicate charge | critical | idempotency contract | broker replay |
| mobile submit blocked | high | component interaction | Playwright Pixel 7 |
| gateway timeout | high | fault injection | recovery reconciliation |
| tenant leak | critical | API authorization matrix | real PostgreSQL policy |`, `risks=5 critical=2 high=3
pure rules -> unit
protocols -> integration
user journey -> one e2e
performance/security -> dedicated evidence
strategy review=approved

每个关键风险都有主测试层和额外证据，不是先列工具再硬凑课程。`],
    ['分层自动化各自执行可验证命令', 'PowerShell', `pnpm exec vitest run tests/checkout --coverage --reporter=junit --outputFile=artifacts/unit.xml
docker compose up -d --wait postgres kafka
pnpm exec vitest run tests/integration/checkout --reporter=junit --outputFile=artifacts/integration.xml
pnpm exec playwright test tests/e2e/checkout.spec.ts --project=chromium-mobile --reporter=junit --outputFile=artifacts/e2e.xml
Write-Output "unit=$LASTEXITCODE integration=$LASTEXITCODE e2e=$LASTEXITCODE"`, `unit        tests=42 failures=0 coverage.branches=91.2%
integration tests=11 failures=0 postgres=16.4 kafka=3.9
e2e         tests=1 failures=0 viewport=390x844
unit=0 integration=0 e2e=0

每层只证明自己的边界，真实容器和移动浏览器仅在需要处启动。`],
    ['性能和安全的工件可比较可重放', 'PowerShell', `k6 run --out json=artifacts/k6.json tests/perf/checkout.js
node tools/compare-perf.mjs --current artifacts/k6.json --baseline perf/main.json --max-p99-regression 10
pnpm exec pytest tests/security -m regression --junitxml=artifacts/security.xml
Write-Output "perf=$LASTEXITCODE security=$LASTEXITCODE"`, `checkout p95=184ms p99=431ms baseline p99=402ms
p99 regression=7.2% budget=10% verdict=pass
security corpus=43 passed=43 failed=0
perf=0 security=0

性能包含基线比较与环境字段，安全包含固定攻击语料和可重放结果。`],
    ['故意回归必须被门禁拦住', 'PowerShell · GitHub CLI', `(Get-Content src/pricing.ts -Raw).Replace('Math.min(percent, 100)', 'percent') | Set-Content src/pricing.ts
git add src/pricing.ts
git commit -m "故意引入折扣上限回归"
git push origin codex/deliberate-regression
gh pr checks --watch
Write-Output "push_exit=$LASTEXITCODE"`, `PR #442 opened
unit fail: rejects discounts above maximum
property fail: counterexample [subtotal=1, percent=101]
mergeStateStatus=BLOCKED
required checks failed=2

故意删除业务上限后，单测和属性测试同时变红，门禁阻止合并。`],
    ['复盘写出遗漏、边界与下一步', 'Markdown · Retrospective', `# Quality retrospective

- Proven: property tests caught amount overflow; mobile e2e caught bottom navigation overlap.
- Missed: Kafka broker upgrade exposed consumer lag under reconnect.
- Residual risk: 500 rps recovery path not exercised for payment gateway.
- Next: add reconnect soak test, owner APP-360, due 2026-12-10.
- Removed: two duplicate toast checks now covered at component layer.
- Replay: pnpm run verify:quality --run quality-2026-11-24-01`, `proven controls=2
missed incident=1
residual risks=1 owner=APP-360 due=2026-12-10
duplicate tests removed=2
replay command exit=0

复盘承认遗漏和未覆盖边界，每一步都有责任与到期时间。`],
  ],
];

export const HANDWRITTEN_TESTING_QUALITY_Q5_COURSES: readonly ProgrammingCourseSeed[] = withTestingExamples([
  {
    name: q5Name('PR、主干、夜间和发布门禁'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能在本地运行测试，并理解 CI job、触发条件、环境秘密和状态检查的基本概念。',
    goal: '能按反馈速度与风险设计 PR、主干、夜间和发布四层门禁，明确每层命令、超时、必需状态和失败责任，避免所有昂贵测试堆在每次提交。',
    guidedPractice: '在 GitHub Actions 中建立 `pull_request` 的 lint + unit + 受影响集成测试，`push main` 的全量集成，`schedule` 的 E2E、安全扫描和变异测试，以及 `release` 的发布候选验收。给每层固定 `timeout-minutes` 和 `concurrency`，故意让一个 PR 测试失败，检查必需检查阻止合并并保留日志。',
    independentPractice: '为一个全栈项目设计四层门禁表，说明每层命令、最长耗时、环境、工件和失败升级路径；提交一份 job 配置说明和一次夜间失败被归类为产品回归的报告。',
    commonErrors: [
      '把全部 E2E、压测和变异测试都放在每次 PR，反馈超过半小时后开发者开始批量合并或绕过门禁。',
      '只检查 job 是否绿色，没有设置必需状态、超时和工件上传，测试失败或进程卡住时无法阻止发布。',
    ],
    sourceRefs: [sources.githubActions, sources.googleSizes, sources.playwright],
    steps: [
      ['按反馈成本划分四层', 'PR 层运行语法、单元、类型和受影响集成测试，目标十分钟内；主干层运行全量集成和关键 E2E；夜间扩大浏览器矩阵、安全和变异；发布层验证候选制品、迁移和回滚。每层写触发条件、最长耗时和负责人，边界检查空变更与跨模块变更。失败日志保存 job、步骤和运行链接，证据是 workflow 配置与每层耗时报告；GitHub Actions API 可按 job 读取耗时。', '越昂贵的检查越靠后'],
      ['让 PR 门禁阻断合并', '在仓库保护规则中把类型检查、单元测试和必要集成设为 required status checks，job 名称与分支规则必须一致；命令使用锁文件安装并固定 runner。边界测试依赖缓存缺失、fork PR 无秘密和矩阵单项失败，失败报告保存退出码与第一步错误，禁止前面的通过掩盖后续失败。证据包含分支保护截图或 API 输出、失败 PR 和成功重跑链接。', '必需状态检查才真正形成门禁'],
      ['用主干和夜间覆盖广度', '主干 job 在合并后运行全量集成与核心 E2E，夜间增加多版本、移动视口、安全、性能和变异测试；定时任务失败要创建 issue 或通知责任人。边界检查仓库无提交、依赖服务维护和工件保留期，日志记录 schedule、commit 与镜像 digest。证据保存全量报告、慢测试列表和夜间告警记录，主干失败要能快速回退或修复；`gh run list` 可用于核对定时任务状态。', '主干完整性不能依赖 PR 子集'],
      ['发布门禁验收制品而非源码', '发布前从待发布镜像或包运行迁移、冒烟、契约和安全检查，校验制品 digest 与源代码提交一致；命令可使用 `docker run`、Playwright smoke 与 `cosign verify`。边界检查制品被替换、数据库版本落后和签名缺失，失败时保存 manifest、SBOM、响应状态与回滚版本。证据必须指向实际制品，避免源码测试通过但部署包不同。', '发布验证对象是最终制品'],
      ['定期审计门禁有效性', '统计每层拦截的缺陷、失败率、耗时和绕过次数，删除不再发现问题的重复检查，补充近期事故遗漏的测试。边界检查临时豁免、flaky 重试和跳过条件是否让门禁失真；失败日志保存豁免人、到期时间和原因。最终证据包含季度审计、门禁耗时趋势和一次根据事故调整的 workflow diff，门禁应随风险变化维护；`gh workflow view` 可检查实际配置。', '门禁需要像产品一样复盘'],
    ],
  },
  {
    name: q5Name('并行、分片、缓存和隔离'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能在 CI 中运行测试矩阵，并知道缓存命中、分片编号和并行 worker 会影响测试顺序与资源。',
    goal: '能用测试分片、矩阵和依赖缓存缩短流水线，通过唯一资源命名与确定性分片保证并行隔离，并验证缓存失效不会掩盖错误。',
    guidedPractice: '把 Playwright 用例用 `--shard=1/4` 到 `4/4` 分到四个 job，Vitest 用 `--maxWorkers=2`，并配置 lockfile 哈希作为缓存键。给每个 shard 分配独立数据库 schema 和上传带 shard 名称的报告；删除一个缓存后重跑，比较命中与冷启动耗时、失败分布和资源冲突。',
    independentPractice: '为一个 200 例测试套件设计分片与缓存策略，比较按文件数量与按历史耗时分配的结果；提交各 shard 时长、缓存键、冲突日志与总耗时改进。',
    commonErrors: [
      '只按文件数量平均分片，慢测试集中在一个 shard，其他 worker 空闲，总时长没有明显降低。',
      '并行测试共享同一个数据库或账号，偶发唯一键和覆盖失败被误判为产品问题，只能靠重试掩盖。',
    ],
    sourceRefs: [sources.githubActions, sources.playwright, sources.vitest],
    steps: [
      ['先证明并行是安全的', '并行前给测试数据加 worker 或 shard 前缀，数据库使用独立 schema，消息队列使用独立 topic，端口随机分配；命令 `npx vitest run --maxWorkers=4` 与 `npx playwright test --shard=1/4` 分别运行。边界检查两个 worker 同时创建同业务键、共享缓存和文件锁，失败日志保留 worker、shard 与冲突资源。证据包含并行报告和冲突清单，状态隔离不成立时先修测试，否则并行只会放大噪声。', '资源隔离是并行前提'],
      ['选择稳定分片算法', 'Playwright `--shard` 按测试文件分配，适合文件间独立；Vitest 可结合历史耗时把慢文件拆到不同 worker。边界检查新增文件、全量测试和某 shard 为空，记录每个 shard 用例数与耗时。失败报告带 shard 编号与合并后的总报告，证据对比顺序执行和分片结果，确保所有用例恰好运行一次，合并后还要核对总数。', '分片必须无遗漏且无重复'],
      ['缓存只保存可复用输入', 'CI 缓存包管理器和浏览器下载时，key 包含 lockfile 哈希、runner OS 与工具版本，例如 `${{ runner.os }}-pnpm-${{ hashFiles("pnpm-lock.yaml") }}`；不要缓存测试数据库和业务构建输出当作捷径。边界检查依赖升级、缓存损坏和冷启动，失败日志保存 cache key、hit/miss 与安装耗时。证据包含冷热两次运行和一次错误命中导致测试失败后才修复的案例。', '缓存键要覆盖所有影响依赖的输入'],
      ['合并报告并处理碎片', '每个 shard 上传独立 JUnit、截图和 trace，最后用 `playwright merge-reports` 或 CI 工具合并；边界检查一个 shard 取消、报告缺失和重试成功，合并任务必须标出缺口。命令输出总用例数、耗时和失败链接，证据包含各 shard 原始工件与合并报告。不能只看最终绿灯，遗漏整个分片的报告不能被当成成功，任何缺失报告都必须阻断。', '缺一片的报告不能合并为通过'],
      ['验证提速不牺牲稳定', '记录顺序执行、分片执行和缓存命中三种总时长，检查失败率、资源峰值和重跑次数；边界在高峰期与冷缓存各跑一次。若提速来自跳过测试或强重试，必须暴露并撤回。最终证据包含时长分位、shard 平衡度、缓存命中率和一周稳定性趋势，优化目标是更快且更可信；`npx vitest run` 与夜间报告要在同条件复跑。', '速度指标必须与稳定性一起看'],
    ],
  },
  {
    name: q5Name('flaky 测试识别与隔离策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能读取 CI 重跑记录和测试报告，理解同一提交在不同 worker、时间或环境下可能得到不同结果。',
    goal: '能通过重复运行、历史失败率和日志差异识别 flaky 测试，建立有期限的隔离与责任人，定位共享状态、竞态和等待问题而不是长期依靠自动重试。',
    guidedPractice: '选择一个偶发 E2E，不重试运行同一提交 20 次并收集失败率；比较失败 trace 的 URL、网络时序与 worker，检查是否共享账号或固定 sleep。把测试标记为 quarantine 并建 issue，要求保留失败工件和到期日；修复后解除隔离并连续运行 50 次验证。',
    independentPractice: '从一周 CI 记录筛出三个疑似 flaky 测试，分别判断是环境、产品竞态还是测试实现问题，提交复现次数、根因、隔离期限和修复后的稳定性报告。',
    commonErrors: [
      '看到偶发失败就自动重试三次，最终绿灯把真实间歇性产品缺陷藏起来，失败率也没有统计。',
      '隔离测试时直接从流水线删除或永久 skip，没有 owner、到期日和复现证据，问题从此消失。',
    ],
    sourceRefs: [sources.githubActions, sources.playwright, sources.googleSizes],
    steps: [
      ['定义 flaky 的判定证据', 'flaky 指同一代码、依赖和输入条件下出现不同结果，需保留提交、runner、浏览器、数据库与随机种子。对单测试执行 `npx playwright test tests/checkout.spec.ts --repeat-each=20 --retries=0`，记录通过/失败次数和首个差异；边界跨两个 worker、冷缓存和高峰时段。失败日志保存 trace、截图与时间线，不能只凭一次重跑成功就判定偶发；记录要按测试标识汇总，避免同名用例混淆。', '同条件下结果不一致才叫 flaky'],
      ['重复运行与历史聚合', '短期用 repeat-each、pytest 循环或 CI API 历史查询统计失败率，长期按测试 id 聚合最近 30 天运行；边界检查低频夜间用例和重试后的最终状态。命令输出 JSON 或 JUnit，报告至少包含总运行数、失败数、错误类型和受影响提交。证据保存查询语句、原始记录和时间窗口，避免团队凭印象选一个最响的测试。', '判定要基于次数与历史分布'],
      ['按根因分类而非统一重试', '比较成功与失败 trace，判断是元素竞态、端口冲突、共享账号、时间依赖、外部网络还是产品真实竞态；边界用单 worker 和固定时钟重放。失败日志保留首个异常、请求顺序与数据库残留，证据形成差异表。只有基础设施短暂失败才允许一次受控重试，产品竞态必须修复，不能把自动重试当根因处理；`npx playwright test --repeat-each=10` 可收集样本。', '先分类根因再决定重试'],
      ['执行有时限的隔离', '隔离测试保留在单独 job 或带标签运行，CI 主门禁可暂时不阻断但必须创建 issue、指定 owner、到期日和复现命令；边界包括隔离测试继续跑、到期提醒和绕过次数。失败报告保存 quarantine 原因与跟踪链接，证据含配置 diff 和每周失败率。到期后要么修复解除，要么明确接受风险并记录审批，不能无声消失；`npx playwright test --grep @quarantine` 要持续运行。', '隔离是临时措施而不是删除'],
      ['修复后证明稳定性', '针对根因改等待、隔离数据、固定时钟或修产品竞态，先在原失败环境连续运行至少 50 次，再恢复主门禁；边界覆盖并行、移动和慢网络。命令与修复前相同，报告对比失败率从多少降到多少。证据包含 trace 前后差异、连续运行结果和解除隔离的提交，说明稳定性来自修复而非运气；`npx playwright test --repeat-each=50` 应作为验收命令。', '解除隔离要给连续通过证据'],
    ],
  },
  {
    name: q5Name('失败归因、工件和可观测性'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能阅读 CI 日志和浏览器报告，并理解 trace、日志、指标和错误分类的区别。',
    goal: '能把 CI 失败归因为产品缺陷、测试缺陷、环境故障或容量问题，用统一 request id、工件和可观测性数据快速定位，并减少无关重跑。',
    guidedPractice: '制造一个接口 500 和一个测试选择器失效，分别检查 JUnit、Playwright trace、服务日志和 OpenTelemetry span。给请求加 `traceparent` 与 requestId，在 CI 工件中写失败分类、首个异常、受影响版本和服务端 trace 链接；重跑前先确认分类，记录两次结果是否一致。',
    independentPractice: '为一次流水线失败撰写归因报告，列出证据链、排除项、责任模块和下一步；要求另一位同学不看聊天记录，仅凭工件做出相同分类。',
    commonErrors: [
      '看到 CI 红就整体重跑，不保存第一次失败工件，间歇性问题被后续成功覆盖，也没有人知道最初错在哪里。',
      '只提供一段截断的控制台日志，没有请求 ID、测试名和环境信息，跨服务定位只能靠猜。',
    ],
    sourceRefs: [sources.opentelemetry, sources.githubActions, sources.playwright],
    steps: [
      ['先保存首次失败现场', 'CI 步骤无论成功失败都上传 JUnit、stdout、trace、截图和环境清单，失败后禁止先重跑覆盖；job 名称和 artifact 路径按 run id 固定。边界包括进程崩溃、超时和上传失败，日志记录退出码与上传状态。证据包含首次失败时间、提交、runner 和原始工件，后续重跑只能追加，不能替换第一次现场，留存目录也应带运行标识，GitHub Actions artifact API 可下载索引。', '第一次失败现场优先保留'],
      ['建立统一关联标识', '从浏览器请求、网关日志到服务 OpenTelemetry span 都携带同一 requestId 或 traceparent；测试在失败时读取响应头并打印，服务日志结构化输出 traceId。边界覆盖跨域、异步消息和重试，失败报告保存 URL、请求 id 与 span 链接。证据链能让一个按钮失败追到具体 SQL 或消息，而不是在多个系统里搜模糊时间，这样定位才能闭环。', '一个失败要有一条贯穿链路的标识'],
      ['按四类状态归因', '把失败分为 product、test、environment、capacity：业务断言错误指向 product，locator 与实际 DOM 不符指向 test，容器启动失败指向 environment，连接池排队和 p95 超限指向 capacity。边界检查同一失败在本地和 CI 是否一致，报告保存分类依据与排除项。分类是可修改的假设，必须有首个异常与证据支持，不能只写“网络问题”，分类结果也要写入报告供复核，OpenTelemetry API 可列出相关 span。', '归因结论要对应可验证证据'],
      ['从指标和日志缩小范围', '结合错误率、延迟、CPU、连接池和日志频率判断是否在失败时段出现异常，使用 OpenTelemetry span 分解依赖耗时；命令查询 observability 平台并保存时间窗口。边界覆盖单请求失败与整体错误率升高，失败时记录服务版本和配置变更。证据包含指标截图或查询链接、关键时刻日志和 trace，帮助区分单点缺陷与系统退化；OpenTelemetry API 可用于查询该时间窗口。', '日志讲事件，指标讲范围'],
      ['沉淀归因与重跑规则', '在 CI 模板中写明何种环境失败可自动重跑、产品失败禁止重跑、测试失败由 owner 修；重跑需要保留原 run 和分类。边界检查重试次数与预算，统计重跑成功是否掩盖 flaky。最终保存失败分类周报、平均定位时间与一次因证据不足升级调查的案例，让团队减少盲目重跑；GitHub Actions API 可统计重跑记录。', '重跑必须受规则约束'],
    ],
  },
  {
    name: q5Name('质量指标与缺陷趋势'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能读取测试报告、缺陷记录和 CI 历史，并知道指标需要稳定定义与时间窗口。',
    goal: '能选择缺陷逃逸率、flaky 率、测试时长、变更失败率和恢复时间等质量指标，计算趋势并避免用单一覆盖率或测试数量制造虚假进展。',
    guidedPractice: '从 CI 与缺陷系统取最近八周数据，按周计算 flaky 失败率、PR 测试 p95、主干失败率和发布后七天缺陷数；用 SQL 或 GitHub API 聚合并画趋势。检查一次发布缺陷是否因测试缺失、环境差异或需求变化，保存查询、分母定义与原始记录链接。',
    independentPractice: '为一个团队设计五项质量指标，定义分子分母、数据源、窗口、负责人和行动阈值；用历史数据做一次回看，指出一个数字改善但用户风险未降低的例子。',
    commonErrors: [
      '只汇报测试数量、覆盖率或自动化比例，没有与缺陷逃逸、用户影响和恢复时间关联，团队优化数字而不优化质量。',
      '不同周使用不同分母和数据源，趋势看似上升下降，实际只是统计口径变化，无法用于决策。',
    ],
    sourceRefs: [sources.githubActions, sources.opentelemetry, sources.googleSizes],
    steps: [
      ['定义指标与分母', '每个指标写清分子、分母、时间窗口和数据源，例如 flaky 率等于发生非确定性失败的测试运行数除以总失败运行数，发布逃逸率等于发布后七天确认的生产缺陷数除以发布数。边界包括零发布、测试被跳过和缺陷关闭重开，保存 SQL/API 查询与版本。证据是可复算的数据集，不能只放一张没有分母的折线图。', '指标先定义口径再计算'],
      ['连接测试反馈与交付结果', '同时观察 PR 测试 p95、主干失败率、变更失败率、部署频率和恢复时间，判断快速流水线是否掩盖逃逸缺陷；边界按服务、团队和风险模块拆分。失败趋势要标注发布、人员或基础设施变化，证据包含时间线、事故链接和测试覆盖变化。单个指标改善不能推出整体质量改善，GitHub Actions API 与监控 API 应作为可复算数据源。', '速度、稳定和缺陷结果要一起看'],
      ['按风险加权缺陷', '不同缺陷影响不同，支付越权和文案错字不能简单计数；给安全、数据丢失、核心流程和一般展示设权重，并保留原始严重级。边界检查未关闭 incident、潜在漏洞和可回滚故障，证据包含影响用户数、持续时间和客户影响。趋势报告同时显示加权分与原始数量，避免权重隐藏某一类严重问题；若 incident 尚未关闭，要保留失败分类与影响报告，GitHub Actions API 可复核关联发布。', '缺陷数量要结合影响与恢复成本'],
      ['设置行动阈值而非排名', '为 flaky 率、测试时长和逃逸缺陷设阈值，例如连续两周超过 2% 触发专项治理；边界检查小样本和节假日发布低峰，避免随机波动导致无效动作。失败报告指出触发指标、负责人和实验期限，证据保存阈值配置与处理记录。指标用于触发调查，不用于公开羞辱个人或只看团队排名，阈值查询也应通过 CI API 复算。', '阈值要触发改进动作'],
      ['复盘指标是否诱导错误行为', '定期问哪些测试被删除、哪些重试增加、哪些缺陷被拆小或延后关闭；边界检查豁免、skip 和数据缺失。若自动化比例上升但逃逸缺陷也上升，应解释测试是否只覆盖低风险路径。最终证据包括定义文档、八周趋势、一次指标失真复盘和调整后的决策，质量运营要防止数字游戏；指标查询失败时保留报表 API 响应作为证据。', '指标本身也需要被审计'],
    ],
  },
  {
    name: q5Name('质量工程毕业项目与复盘'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已完成本课程主要阶段，能为真实全栈功能分别编写单元、集成、端到端、安全或性能测试。',
    goal: '能为一个真实功能建立风险驱动的分层测试、故障注入、性能预算和 CI 门禁，交付可复现的质量证据包，并用复盘说明取舍、遗漏与下一步。',
    guidedPractice: '选择一个订单或账户功能，建立风险矩阵和测试金字塔：核心规则用单元/属性测试，数据库与消息用 Testcontainers，关键用户流程用 Playwright，另加对象越权和 p95 预算。接入 PR 快测、主干集成和夜间扩展门禁，制造一次回归让门禁拦截并保存完整工件。',
    independentPractice: '独立交付毕业项目的测试策略、代码目录、运行命令、失败样例、修复 diff、性能摘要、安全矩阵、CI 运行链接和复盘；确保另一位学习者能按说明重放，不修改本仓库其它文件。',
    commonErrors: [
      '毕业项目只堆很多测试文件，没有风险映射和失败演练，无法证明门禁拦住过真实缺陷。',
      '把所有测试都放在一个长命令里，局部失败后既不能快速反馈，也无法区分产品、测试和环境问题。',
    ],
    sourceRefs: [sources.practicalPyramid, sources.playwright, sources.githubActions],
    steps: [
      ['从业务风险设计策略', '选一个真实功能，列出金额、权限、持久化、消息、浏览器和依赖故障六类风险，为每类指定测试层、工具、预期失败和最长耗时。边界包括空数据、最大输入、越权、超时和重复投递，形成风险矩阵后再写代码。证据包含业务规则、风险编号与测试文件映射，避免先按工具堆测试再解释用途；`npx vitest run --reporter=verbose` 可核对映射。', '测试组合由业务故障决定'],
      ['完成分层自动化实现', '核心计算用纯函数和 `it.each`/属性测试，仓储与事务用 Testcontainers，消息重复投递用真实 broker，关键路径用 Playwright `getByRole`，安全用身份矩阵而非只隐藏按钮。每个测试使用独立数据与固定时钟，边界覆盖阈值、异常和恢复；运行报告保存 JUnit、trace、摘要和容器日志。证据链需从某个风险直达某条可复现测试，而不是只有总数；任一测试失败都要保留 trace 与容器日志。', '每一层只证明该层能证明的事'],
      ['建立性能与安全证据', '用 k6 固定场景记录 p95、p99、错误率和资源，用 OWASP 身份矩阵与输入边界验证 401、403、对象隔离和 SSRF 拒绝。边界选最大负载、慢依赖、跨租户和合法极端输入，失败时保存 summary、trace、请求与脱敏日志。性能和安全报告要写环境、阈值和未验证范围，证据可独立重放，不能只给一条“通过”结论；`k6 run` 与 `curl -i` 应能复跑。', '性能与安全都要有可比较工件'],
      ['把门禁和故障演练接好', 'PR 运行类型、单元与受影响集成，主干运行全量集成，夜间运行 E2E、性能、安全和变异；为每层设置 timeout、artifact 和失败分类。故意提交一个金额错误或越权缺陷，证明门禁在预期层失败并阻止合并，再保存首次失败与修复后运行。边界检查测试超时、依赖启动失败和工件上传，证据包含 workflow、失败 job 与拦截记录；`gh run view` 可核对失败 job。', '门禁必须拦住一次故意回归'],
      ['写复盘并交代边界', '复盘按事实写目标、风险、覆盖、失败证据、门禁结果、耗时和未解决项；说明哪些风险需要真机、人工安全测试或生产观测补充。边界明确测试数据、授权范围和不覆盖场景，失败事件给出根因与改进动作。最终交付运行命令、工件索引、修复记录和下一次迭代，让读者能重放并通过证据判断质量，而不是只看绿色徽章；报告附 `npx playwright test` 等复跑命令。', '复盘要暴露遗漏与下一步'],
    ],
  },
], q5Examples);
