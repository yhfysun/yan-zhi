import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

/**
 * Python 企业课程的最后一批代码实验室。
 *
 * 任务只依赖 Python 标准库并在单个 main.py 中运行。FastAPI、Django、
 * SQLAlchemy、Alembic、mypy/pyright 等第三方工具不在此处安装，相关
 * 课程用明确的数据结构、协议和事务契约模拟工具边界。
 */
const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3.11+ / 标准库内置运行器',
  installSteps: [
    '确认学习环境中的 Python 运行器可用；本组任务不安装第三方包。',
    '程序从 stdin 读取 JSON 或文本，并在 main.py 内完成断言和 checkpoint。',
    '遇到框架类任务时，只验证课程要求的协议、状态迁移与失败边界，不伪装成真实框架已启动。',
  ],
  languages: ['python'],
} as const;

type TaskSpec = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly checkpoint: string;
  readonly code: string;
};

const task = ({ id, title, brief, stdin, checkpoint, code }: TaskSpec): LearningV2CodeLabTask => ({
  id,
  title,
  brief,
  defaultLanguage: 'python',
  starterCode: { python: code },
  stdin,
  checkpoint,
});

const lab = (
  title: string,
  description: string,
  docsUrl: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab => ({
  title,
  description,
  docsUrl,
  ...pythonRuntime,
  practice,
  apply,
});

export const LEARNING_CODE_LABS_PYTHON_FINAL: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:Python · CPython、uv 与第一个项目：CPython、解释器、字节码与虚拟环境': lab(
    'Python 收尾代码台 01 · 从源码到解释器指令',
    '用 sys、compile、dis 与 ast 观察 CPython 的编译边界。先确认解释器身份和字节码，再编写一个只接受表达式 AST 的安全求值器，区分虚拟机执行与宿主语言执行。',
    'https://docs.python.org/3/library/dis.html',
    task({
      id: 'python-final-cpython-guided',
      title: '跟做：打印解释器与函数字节码',
      brief:
        '读取 JSON 中的 price、quantity 和 source，执行受控表达式，打印 sys.implementation.name、字节码指令数量以及计算结果。',
      stdin: '{"price":1200,"quantity":3,"source":"total = price * quantity\\nassert total == 3600\\n"}',
      checkpoint:
        '输出 implementation=cpython、result=3600、instruction_count 大于 0 和 checkpoint=cpython-bytecode-ok，且 exit 0。',
      code: `import dis
import json
import sys

payload = json.load(sys.stdin)
namespace = {
    "price": payload["price"],
    "quantity": payload["quantity"],
}
code = compile(payload["source"], "<lesson>", "exec")
instructions = list(dis.get_instructions(code))
exec(code, {"__builtins__": {}}, namespace)
total = namespace["total"]

assert total == 3600
assert instructions
print(f"implementation={sys.implementation.name}")
print(f"bits={sys.maxsize.bit_length() + 1}")
print(f"instruction_count={len(instructions)}")
print(f"first_opcode={instructions[0].opname}")
print(f"result={total}")
print("checkpoint=cpython-bytecode-ok")
`,
    }),
    task({
      id: 'python-final-cpython-apply',
      title: '独立实践：解释一个受限表达式',
      brief:
        '读取 expression 和 vars，只允许常量、名称、括号及加减乘。使用 ast.parse 建树并递归求值；未知节点必须被拒绝。',
      stdin: '{"expression":"(a + b) * 2 - c","vars":{"a":10,"b":4,"c":3}}',
      checkpoint:
        '输出 opcodes 中包含 BINARY_OP、result=25、rejected=PermissionError 和 checkpoint=ast-interpreter-ok，且 exit 0。',
      code: `import ast
import dis
import json
import sys

payload = json.load(sys.stdin)
tree = ast.parse(payload["expression"], mode="eval")
allowed_names = set(payload["vars"])

def evaluate(node):
    if isinstance(node, ast.Expression):
        return evaluate(node.body)
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in allowed_names:
            raise PermissionError(node.id)
        return payload["vars"][node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult)):
        left = evaluate(node.left)
        right = evaluate(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        return left * right
    raise ValueError(type(node).__name__)

result = evaluate(tree)
assert result == 25
compiled = compile(payload["expression"], "<expression>", "eval")
opcodes = [item.opname for item in dis.get_instructions(compiled)]
assert "BINARY_OP" in opcodes
try:
    evaluate(ast.parse("outside + 1", mode="eval"))
except PermissionError as error:
    rejected = type(error).__name__
else:
    raise AssertionError("unknown name was accepted")

print(f"result={result}")
print(f"opcodes={','.join(opcodes)}")
print(f"rejected={rejected}")
print("checkpoint=ast-interpreter-ok")
`,
    }),
  ),

  'programming:Python · CPython、uv 与第一个项目：uv、pyproject.toml 和锁文件': lab(
    'Python 收尾代码台 02 · 声明、解析与锁定分开',
    '用 tomllib 解析项目声明，用版本区间验证锁文件；再实现一个最小解析器，把直接依赖与传递依赖的固定版本分开记录。重点是声明意图与可复现安装之间的边界。',
    'https://docs.python.org/3/library/tomllib.html',
    task({
      id: 'python-final-pyproject-guided',
      title: '跟做：检查锁文件是否满足声明',
      brief:
        '读取 pyproject_toml 和 lock_json，提取 dependencies，检查每个锁定版本是否落在 >= 与 < 的约束内，并确认锁文件含传递依赖。',
      stdin: '{"pyproject_toml":"[project]\\nname=\\"orders\\"\\ndependencies=[\\"httpx>=0.27,<0.29\\",\\"pydantic>=2.8,<3\\"]\\n","lock_json":{"requires":["httpx","pydantic"],"packages":{"httpx":"0.28.1","pydantic":"2.10.2","anyio":"4.6.2"}}}',
      checkpoint:
        '输出 direct=2、locked=3、versions 为 httpx=0.28.1 与 pydantic=2.10.2、transitive=anyio 和 checkpoint=pyproject-lock-ok，且 exit 0。',
      code: `import json
import re
import sys
import tomllib

payload = json.load(sys.stdin)
project = tomllib.loads(payload["pyproject_toml"])["project"]
lock = payload["lock_json"]

def parts(version):
    return tuple(int(piece) for piece in re.findall(r"\\d+", version))

def satisfies(version, spec):
    value = parts(version)
    match = re.fullmatch(r"([^<>=]+)(?:>=([\\d.]+))?,?(?:<([\\d.]+))?", spec)
    if not match:
        raise AssertionError(f"unsupported spec: {spec}")
    lower, upper = match.group(2), match.group(3)
    if lower and value < parts(lower):
        return False
    if upper and value >= parts(upper):
        return False
    return True

direct = {}
for requirement in project["dependencies"]:
    name = requirement.split(">=")[0].split("<")[0]
    direct[name] = requirement

for name, spec in direct.items():
    assert name in lock["packages"]
    assert satisfies(lock["packages"][name], spec)

transitive = sorted(set(lock["packages"]) - set(direct))
assert transitive == ["anyio"]
print(f"direct={len(direct)}")
print(f"locked={len(lock['packages'])}")
print("versions=" + ",".join(f"{name}={lock['packages'][name]}" for name in sorted(direct)))
print(f"transitive={','.join(transitive)}")
print("checkpoint=pyproject-lock-ok")
`,
    }),
    task({
      id: 'python-final-pyproject-apply',
      title: '独立实践：做一次无网络依赖解析',
      brief:
        '读取 root 依赖和候选包元数据，递归选择满足约束的最高版本，检测缺失包与版本冲突，并输出冻结清单。',
      stdin: '{"roots":{"api":">=2.0,<3","worker":">=1.0,<2"},"packages":{"api":["2.0.0","2.1.0","3.0.0"],"worker":["0.9.0","1.4.0"],"shared":["1.0.0","1.2.0"]},"requires":{"api":["shared>=1.0"],"worker":["shared<1.2"]}}',
      checkpoint:
        '输出 api=2.1.0、worker=1.4.0、shared=1.0.0、resolved=3 和 checkpoint=offline-resolve-ok，且 exit 0。',
      code: `import json
import re
import sys

payload = json.load(sys.stdin)

def version(value):
    return tuple(int(piece) for piece in re.findall(r"\\d+", value))

def accepts(value, spec):
    minimum = re.search(r">=([\\d.]+)", spec)
    maximum = re.search(r"<([\\d.]+)", spec)
    exact = re.search(r"==([\\d.]+)", spec)
    if exact:
        return value == exact.group(1)
    if minimum and version(value) < version(minimum.group(1)):
        return False
    if maximum and version(value) >= version(maximum.group(1)):
        return False
    return True

constraints = {}
chosen = {}
queue = list(payload["roots"].items())
while queue:
    name, spec = queue.pop(0)
    constraints.setdefault(name, []).append(spec)
    candidates = payload["packages"].get(name, [])
    usable = [
        item for item in candidates
        if all(accepts(item, bound) for bound in constraints[name])
    ]
    if not usable:
        raise ValueError(f"conflict:{name}")
    selected = max(usable, key=version)
    if chosen.get(name) == selected:
        continue
    chosen[name] = selected
    for child in payload.get("requires", {}).get(name, []):
        match = re.fullmatch(r"([A-Za-z0-9_-]+)(.+)", child)
        queue.append((match.group(1), match.group(2)))

resolved = chosen

assert resolved["api"] == "2.1.0"
assert resolved["worker"] == "1.4.0"
assert resolved["shared"] == "1.0.0"
print("api=" + resolved["api"])
print("worker=" + resolved["worker"])
print("shared=" + resolved["shared"])
print(f"resolved={len(resolved)}")
print("checkpoint=offline-resolve-ok")
`,
    }),
  ),

  'programming:Python · CPython、uv 与第一个项目：变量、类型、容器与控制流': lab(
    'Python 收尾代码台 03 · 用数据结构表达业务规则',
    '把变量类型、可变容器与控制流放进订单清洗场景。第一个任务用 Counter 与集合处理记录，第二个任务用显式状态机处理退款流水，避免用嵌套条件堆出不可审计逻辑。',
    'https://docs.python.org/3/tutorial/datastructures.html',
    task({
      id: 'python-final-containers-guided',
      title: '跟做：统计订单状态与类型边界',
      brief:
        '读取一组订单记录，检查 id 为整数、amount 为正整数，统计状态数量并计算各状态金额；非法记录进入 rejected。',
      stdin: '{"orders":[{"id":1,"amount":1200,"status":"paid"},{"id":2,"amount":800,"status":"paid"},{"id":3,"amount":500,"status":"refunded"},{"id":"bad","amount":-1,"status":"paid"}]}',
      checkpoint:
        '输出 accepted=3、rejected=1、statuses=paid:2,refunded:1、paid_total=2000 和 checkpoint=containers-control-ok，且 exit 0。',
      code: `import json
import sys
from collections import Counter, defaultdict

orders = json.load(sys.stdin)["orders"]
accepted = []
rejected = []

for order in orders:
    if type(order.get("id")) is not int or type(order.get("amount")) is not int or order["amount"] <= 0:
        rejected.append(order)
        continue
    if order.get("status") not in {"paid", "refunded"}:
        rejected.append(order)
        continue
    accepted.append(order)

counts = Counter(item["status"] for item in accepted)
totals = defaultdict(int)
for item in accepted:
    totals[item["status"]] += item["amount"]

assert len(accepted) == 3
assert len(rejected) == 1
assert totals["paid"] == 2000
print(f"accepted={len(accepted)}")
print(f"rejected={len(rejected)}")
print("statuses=" + ",".join(f"{key}:{counts[key]}" for key in sorted(counts)))
print(f"paid_total={totals['paid']}")
print("checkpoint=containers-control-ok")
`,
    }),
    task({
      id: 'python-final-containers-apply',
      title: '独立实践：退款状态机拒绝非法跳转',
      brief:
        '读取按顺序到达的退款事件，维护每笔订单状态和已退金额。只允许 requested→approved→settled 以及 approved→rejected，超额、重复或跨状态事件必须被拒绝。',
      stdin: '{"refunds":[{"id":"r1","order":"o1","event":"requested","amount":300},{"id":"r1","order":"o1","event":"approved"},{"id":"r1","order":"o1","event":"settled"},{"id":"r2","order":"o2","event":"approved"},{"id":"r3","order":"o1","event":"requested","amount":900}]}',
      checkpoint:
        '输出 settled=1、accepted=3、rejected=2、reason=illegal-transition 与 insufficient-balance，以及 checkpoint=refund-state-machine-ok，且 exit 0。',
      code: `import json
import sys

events = json.load(sys.stdin)["refunds"]
allowed = {
    None: {"requested"},
    "requested": {"approved"},
    "approved": {"settled", "rejected"},
    "settled": set(),
    "rejected": set(),
}
orders = {"o1": 1000, "o2": 1000}
refunds = {}
reasons = []
accepted = 0

for event in events:
    refund = refunds.setdefault(event["id"], {
        "order": event["order"],
        "state": None,
        "amount": 0,
    })
    if event["event"] not in allowed[refund["state"]]:
        reasons.append("illegal-transition")
        continue
    if event["event"] == "requested":
        amount = event.get("amount", 0)
        if type(amount) is not int or amount <= 0 or amount > orders[refund["order"]]:
            reasons.append("insufficient-balance")
            continue
        refund["amount"] = amount
    if event["event"] in {"settled", "rejected"}:
        orders[refund["order"]] -= refund["amount"]
    refund["state"] = event["event"]
    accepted += 1

settled = sum(item["state"] == "settled" for item in refunds.values())
assert accepted == 3
assert len(reasons) == 2
assert settled == 1
print(f"settled={settled}")
print(f"accepted={accepted}")
print(f"rejected={len(reasons)}")
print("reason=" + ",".join(reasons))
print(f"remaining_o1={orders['o1']}")
print("checkpoint=refund-state-machine-ok")
`,
    }),
  ),

  'programming:Python · CPython、uv 与第一个项目：零基础命令行项目': lab(
    'Python 收尾代码台 04 · 命令行参数是公开契约',
    '用 argparse 与 shlex 构建可测试的命令行入口。程序把解析、业务执行和退出码分开，使 stdin、参数错误、重复事件和成功结果都能被自动化检查。',
    'https://docs.python.org/3/library/argparse.html',
    task({
      id: 'python-final-cli-guided',
      title: '跟做：从参数和 stdin 生成采购单',
      brief:
        '读取 argv 与 items，使用 argparse 解析 --currency 和 --dry-run，再计算总价。未知参数要让程序返回自定义错误而不是直接消失。',
      stdin: '{"argv":"--currency cny --dry-run","items":[{"name":"keyboard","cents":9900},{"name":"cable","cents":1500}]}',
      checkpoint:
        '输出 currency=CNY、total_cents=11400、dry_run=true 和 checkpoint=argparse-boundary-ok，且 exit 0。',
      code: `import argparse
import json
import shlex
import sys

payload = json.load(sys.stdin)
parser = argparse.ArgumentParser(exit_on_error=False)
parser.add_argument("--currency", choices=["cny", "usd"], default="cny")
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args(shlex.split(payload["argv"]))

items = payload["items"]
assert all(type(item["cents"]) is int and item["cents"] > 0 for item in items)
total = sum(item["cents"] for item in items)
currency = args.currency.upper()
assert total == 11400
print(f"currency={currency}")
print(f"total_cents={total}")
print(f"items={len(items)}")
print(f"dry_run={str(args.dry_run).lower()}")
print("checkpoint=argparse-boundary-ok")
`,
    }),
    task({
      id: 'python-final-cli-apply',
      title: '独立实践：幂等的发票命令行',
      brief:
        '读取 argv 与 events，实现 add 与 totals 两个子命令。invoice_id 重复时忽略重复事件，保留第一个金额；未知子命令返回退出码 2，正常返回 0。',
      stdin: '{"runs":[{"argv":"add --invoice inv-1 --cents 2500","events":[]},{"argv":"add --invoice inv-1 --cents 9900","events":[{"invoice_id":"inv-1","cents":2500}]},{"argv":"totals","events":[{"invoice_id":"inv-1","cents":2500},{"invoice_id":"inv-2","cents":700}]}]}',
      checkpoint:
        '输出 run1=0,2500、run2=0,2500、run3=0,3200 和 checkpoint=idempotent-cli-ok，且 exit 0。',
      code: `import argparse
import json
import shlex
import sys

payload = json.load(sys.stdin)

def execute(argv, events):
    parser = argparse.ArgumentParser(exit_on_error=False)
    subparsers = parser.add_subparsers(dest="command", required=True)
    add = subparsers.add_parser("add")
    add.add_argument("--invoice", required=True)
    add.add_argument("--cents", required=True, type=int)
    subparsers.add_parser("totals")
    try:
        args = parser.parse_args(shlex.split(argv))
    except (argparse.ArgumentError, SystemExit):
        return 2, None
    invoices = {}
    for event in events:
        invoices.setdefault(event["invoice_id"], event["cents"])
    if args.command == "add":
        invoices.setdefault(args.invoice, args.cents)
        return 0, invoices[args.invoice]
    return 0, sum(invoices.values())

results = [execute(item["argv"], item["events"]) for item in payload["runs"]]
assert results == [(0, 2500), (0, 2500), (0, 3200)]
for index, (code, value) in enumerate(results, start=1):
    print(f"run{index}={code},{value}")
print("checkpoint=idempotent-cli-ok")
`,
    }),
  ),

  'programming:Python · 数据模型、OOP 与惯用法：对象、名称、引用和垃圾回收': lab(
    'Python 收尾代码台 05 · 名称不是盒子，对象才有身份',
    '通过别名、弱引用、deepcopy 与垃圾回收观察对象生命周期。学习者要区分变量重新绑定与对象原地修改，并验证不可变快照没有被后续写入污染。',
    'https://docs.python.org/3/reference/datamodel.html',
    task({
      id: 'python-final-references-guided',
      title: '跟做：观察别名、弱引用与回收',
      brief:
        '读取 name 与 values，创建列表、别名和弱引用；删除强引用并调用 gc.collect，确认对象可被回收，同时展示不可变 tuple 快照。',
      stdin: '{"name":"orders","values":[10,20,30]}',
      checkpoint:
        '输出 alias_is_same=true、snapshot=(10,30)、alive_after_del=false 和 checkpoint=reference-lifetime-ok，且 exit 0。',
      code: `import gc
import json
import sys
import weakref

payload = json.load(sys.stdin)
class OrderList(list):
    pass

orders = OrderList(payload["values"])
alias = orders
tracker = weakref.ref(orders)
snapshot = tuple(item for item in orders if item != 20)

assert alias is orders
orders.append(40)
assert len(alias) == 4
assert snapshot == (10, 30)

del orders, alias
gc.collect()
alive = tracker() is not None
assert not alive

print("alias_is_same=true")
print(f"snapshot={snapshot}")
print(f"alive_after_del={str(alive).lower()}")
print("checkpoint=reference-lifetime-ok")
`,
    }),
    task({
      id: 'python-final-references-apply',
      title: '独立实践：构建可追踪的订单快照',
      brief:
        '读取嵌套订单，递归克隆为独立结构，记录源对象与克隆对象的身份差异；随后用 gc 引用计数验证循环引用在 collect 后消失。',
      stdin: '{"orders":[{"id":"o1","items":[{"sku":"A","qty":2}]},{"id":"o2","items":[]}],"remove_id":"o2"}',
      checkpoint:
        '输出 cloned=2、same_identity=false、removed=true、cycle_collected=true 和 checkpoint=deepcopy-gc-ok，且 exit 0。',
      code: `import copy
import gc
import json
import sys
import weakref

payload = json.load(sys.stdin)
source = payload["orders"]
clone = copy.deepcopy(source)
assert clone == source
assert clone is not source
assert clone[0]["items"] is not source[0]["items"]

clone[:] = [order for order in clone if order["id"] != payload["remove_id"]]
assert len(clone) == 1
assert len(source) == 2

class Node:
    pass

left = Node()
right = Node()
left.peer = right
right.peer = left
tracker = weakref.ref(left)
del left, right
gc.collect()
cycle_collected = tracker() is None
assert cycle_collected

print(f"cloned={len(source)}")
print("same_identity=false")
print(f"removed={str(len(clone) == 1).lower()}")
print(f"cycle_collected={str(cycle_collected).lower()}")
print("checkpoint=deepcopy-gc-ok")
`,
    }),
  ),

  'programming:Python · 数据模型、OOP 与惯用法：类、实例、继承和组合': lab(
    'Python 收尾代码台 06 · 继承表达多态，组合承载变化',
    '用抽象基类约束折扣策略，用组合把计费与通知拆开。第二个任务实现策略注册表和依赖注入，验证新增规则不需要修改结算函数。',
    'https://docs.python.org/3/library/abc.html',
    task({
      id: 'python-final-composition-guided',
      title: '跟做：抽象折扣与组合计费',
      brief:
        '读取 subtotal 与 coupon，创建会员折扣和优惠券策略，通过同一接口计算；再给 Checkout 注入策略并记录计算步骤。',
      stdin: '{"subtotal":10000,"coupon":"SAVE10","member":true}',
      checkpoint:
        '输出 member_total=9000、coupon_total=9100、strategy_count=2 和 checkpoint=oop-composition-ok，且 exit 0。',
      code: `import json
import sys
from abc import ABC, abstractmethod

class Discount(ABC):
    @abstractmethod
    def apply(self, cents):
        raise NotImplementedError

class MemberDiscount(Discount):
    def apply(self, cents):
        return int(cents * 0.9)

class CouponDiscount(Discount):
    def __init__(self, code):
        self.code = code

    def apply(self, cents):
        return cents - 900 if self.code == "SAVE10" else cents

class Checkout:
    def __init__(self, discount):
        self.discount = discount
        self.trace = []

    def total(self, cents):
        result = self.discount.apply(cents)
        self.trace.append((type(self.discount).__name__, result))
        return result

payload = json.load(sys.stdin)
member = Checkout(MemberDiscount())
coupon = Checkout(CouponDiscount(payload["coupon"]))
member_total = member.total(payload["subtotal"])
coupon_total = coupon.total(payload["subtotal"])

assert payload["member"] is True
assert member_total == 9000
assert coupon_total == 9100
assert len([MemberDiscount, CouponDiscount]) == 2
print(f"member_total={member_total}")
print(f"coupon_total={coupon_total}")
print("strategy_count=2")
print(f"trace={member.trace[0][0]},{coupon.trace[0][0]}")
print("checkpoint=oop-composition-ok")
`,
    }),
    task({
      id: 'python-final-composition-apply',
      title: '独立实践：可插件化的结算引擎',
      brief:
        '读取规则清单与订单，注册 percent、fixed、cap 三类处理器，按顺序执行并记录每一步；未知规则必须被拒绝，金额不能低于零。',
      stdin: '{"rules":[{"type":"percent","basis_points":1250},{"type":"fixed","cents":500},{"type":"cap","cents":9000}],"subtotal":10000}',
      checkpoint:
        '输出 final_cents=8250、steps=percent:8750,fixed:8250,cap:8250、unknown_rejected=true 和 checkpoint=plugin-checkout-ok，且 exit 0。',
      code: `import json
import sys

class Registry:
    def __init__(self):
        self.handlers = {}

    def register(self, name, handler):
        self.handlers[name] = handler

    def run(self, rules, subtotal):
        amount = subtotal
        trace = []
        for rule in rules:
            handler = self.handlers.get(rule["type"])
            if handler is None:
                raise LookupError(rule["type"])
            amount = max(0, handler(amount, rule))
            trace.append((rule["type"], amount))
        return amount, trace

registry = Registry()
registry.register("percent", lambda value, rule: value * (10000 - rule["basis_points"]) // 10000)
registry.register("fixed", lambda value, rule: value - rule["cents"])
registry.register("cap", lambda value, rule: min(value, rule["cents"]))
payload = json.load(sys.stdin)
final, trace = registry.run(payload["rules"], payload["subtotal"])
try:
    registry.run([{"type": "unknown"}], final)
except LookupError:
    rejected = True
else:
    rejected = False

assert final == 8250
assert rejected
print(f"final_cents={final}")
print("steps=" + ",".join(f"{name}:{value}" for name, value in trace))
print(f"unknown_rejected={str(rejected).lower()}")
print("checkpoint=plugin-checkout-ok")
`,
    }),
  ),

  'programming:Python · 数据模型、OOP 与惯用法：特殊方法与协议对象': lab(
    'Python 收尾代码台 07 · 让对象支持语言原生操作',
    '实现可迭代、可比较、可哈希且支持上下文管理的对象。重点是理解特殊方法由解释器在运算符、for、with、len 和 == 等语法位置自动调用。',
    'https://docs.python.org/3/reference/datamodel.html#special-method-names',
    task({
      id: 'python-final-protocol-guided',
      title: '跟做：实现可迭代购物篮',
      brief:
        '读取商品列表，构造 Basket，使用 len、in、for、索引和 with。上下文退出后 Basket 拒绝再写入，并打印审计记录。',
      stdin: '{"items":[{"sku":"A","qty":2},{"sku":"B","qty":1}]}',
      checkpoint:
        '输出 len=2、contains=A、iterated=2、closed=true 和 checkpoint=protocol-object-ok，且 exit 0。',
      code: `import json
import sys

class Basket:
    def __init__(self, rows):
        self.rows = list(rows)
        self.closed = False
        self.audit = []

    def __enter__(self):
        self.audit.append("opened")
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.closed = True
        self.audit.append("closed")
        return False

    def add(self, row):
        if self.closed:
            raise RuntimeError("basket closed")
        self.rows.append(row)

    def __len__(self):
        return len(self.rows)

    def __iter__(self):
        return iter(self.rows)

    def __getitem__(self, index):
        return self.rows[index]

    def __contains__(self, sku):
        return any(item["sku"] == sku for item in self.rows)

payload = json.load(sys.stdin)
with Basket(payload["items"]) as basket:
    length = len(basket)
    contains = "A" in basket
    iterated = sum(1 for _ in basket)
    assert basket[0]["sku"] == "A"

try:
    basket.add({"sku": "C", "qty": 1})
except RuntimeError:
    rejected = True
else:
    rejected = False

assert rejected
print(f"len={length}")
print("contains=A")
print(f"iterated={iterated}")
print(f"closed={str(basket.closed).lower()}")
print(f"audit={','.join(basket.audit)}")
print("checkpoint=protocol-object-ok")
`,
    }),
    task({
      id: 'python-final-protocol-apply',
      title: '独立实践：金额值对象与排序协议',
      brief:
        '读取多币种金额，实现 add、eq、lt、hash 与 repr；同一币种才能相加，排序时按币种再按分值稳定排列，非法加法被拒绝。',
      stdin: '{"amounts":[{"currency":"CNY","cents":500},{"currency":"CNY","cents":120},{"currency":"USD","cents":700}]}',
      checkpoint:
        '输出 sorted=CNY:120,CNY:500,USD:700、sum_cny=620、hash_equal=true、mismatch_rejected=true 和 checkpoint=money-protocol-ok，且 exit 0。',
      code: `import json
import sys
from dataclasses import dataclass
from functools import total_ordering

@total_ordering
@dataclass(frozen=True)
class Money:
    currency: str
    cents: int

    def __post_init__(self):
        if type(self.cents) is not int or self.cents < 0:
            raise ValueError("cents")

    def __add__(self, other):
        if not isinstance(other, Money) or self.currency != other.currency:
            raise TypeError("currency mismatch")
        return Money(self.currency, self.cents + other.cents)

    def __lt__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return (self.currency, self.cents) < (other.currency, other.cents)

    def __repr__(self):
        return f"{self.currency}:{self.cents}"

rows = [Money(**item) for item in json.load(sys.stdin)["amounts"]]
sorted_rows = sorted(rows)
same = Money("CNY", 500)
hash_equal = hash(same) == hash(Money("CNY", 500)) and same == Money("CNY", 500)
try:
    Money("CNY", 1) + Money("USD", 1)
except TypeError:
    rejected = True
else:
    rejected = False

cny = [item for item in rows if item.currency == "CNY"]
total = cny[0] + cny[1]
assert total.cents == 620
assert hash_equal and rejected
print("sorted=" + ",".join(map(str, sorted_rows)))
print(f"sum_cny={total.cents}")
print(f"hash_equal={str(hash_equal).lower()}")
print(f"mismatch_rejected={str(rejected).lower()}")
print("checkpoint=money-protocol-ok")
`,
    }),
  ),

  'programming:Python · 数据模型、OOP 与惯用法：领域模型与协议实现': lab(
    'Python 收尾代码台 08 · 领域不变量必须由代码守住',
    '用 Protocol 定义端口，用聚合根保护预算与审批规则。任务展示领域对象不是贫血字典，而是把状态转换、越权操作和审计证据一起封装的边界。',
    'https://docs.python.org/3/library/typing.html#typing.Protocol',
    task({
      id: 'python-final-domain-guided',
      title: '跟做：预算聚合根限制超支',
      brief:
        '读取预算与报销申请，构造 Budget 聚合根，依次审批、拒绝超额申请，并通过 ClockProtocol 注入固定时间。',
      stdin: '{"limit":1000,"time":"2026-11-24T10:00:00Z","requests":[{"id":"e1","cents":600},{"id":"e2","cents":500}]}',
      checkpoint:
        '输出 approved=e1、remaining=400、rejected=e2、decided_at=2026-11-24T10:00:00Z 和 checkpoint=domain-budget-ok，且 exit 0。',
      code: `import json
import sys
from dataclasses import dataclass
from typing import Protocol

class Clock(Protocol):
    def now(self) -> str:
        ...

class FixedClock:
    def __init__(self, value):
        self.value = value

    def now(self):
        return self.value

@dataclass(frozen=True)
class Expense:
    id: str
    cents: int

class Budget:
    def __init__(self, limit, clock):
        self.limit = limit
        self.clock = clock
        self.used = 0
        self.approved = []
        self.rejected = []
        self.decisions = []

    def request(self, expense):
        if expense.cents <= 0:
            raise ValueError("positive cents required")
        if self.used + expense.cents > self.limit:
            self.rejected.append(expense.id)
            self.decisions.append((expense.id, "rejected", self.clock.now()))
            return False
        self.used += expense.cents
        self.approved.append(expense.id)
        self.decisions.append((expense.id, "approved", self.clock.now()))
        return True

payload = json.load(sys.stdin)
budget = Budget(payload["limit"], FixedClock(payload["time"]))
for row in payload["requests"]:
    budget.request(Expense(**row))

assert budget.approved == ["e1"]
assert budget.rejected == ["e2"]
assert budget.decisions[1][2] == payload["time"]
print(f"approved={','.join(budget.approved)}")
print(f"remaining={budget.limit - budget.used}")
print(f"rejected={','.join(budget.rejected)}")
print(f"decided_at={budget.decisions[0][2]}")
print("checkpoint=domain-budget-ok")
`,
    }),
    task({
      id: 'python-final-domain-apply',
      title: '独立实践：库存预留端口与补偿',
      brief:
        '读取订单与库存快照，通过协议端口预留库存；任一商品不足时回滚此前预留。成功后生成不可变确认，重复执行不能二次扣减。',
      stdin: '{"stock":{"A":3,"B":1},"orders":[{"id":"o1","items":{"A":2,"B":1}},{"id":"o2","items":{"B":0,"A":2}}]}',
      checkpoint:
        '输出 confirmed=o1、stock=A:1,B:0、rolled_back=o2、reason=insufficient-B 和 checkpoint=reservation-compensation-ok，且 exit 0。',
      code: `import json
import sys
from typing import Protocol

class InventoryPort(Protocol):
    def reserve(self, items):
        ...

    def release(self, items):
        ...

class MemoryInventory:
    def __init__(self, stock):
        self.stock = dict(stock)
        self.reservations = {}

    def reserve(self, order_id, items):
        if order_id in self.reservations:
            return False
        for sku, qty in items.items():
            if qty <= 0 or self.stock.get(sku, 0) < qty:
                raise ValueError(f"insufficient-{sku}")
        for sku, qty in items.items():
            self.stock[sku] -= qty
        self.reservations[order_id] = dict(items)
        return True

    def release(self, order_id):
        for sku, qty in self.reservations.pop(order_id, {}).items():
            self.stock[sku] += qty

payload = json.load(sys.stdin)
inventory = MemoryInventory(payload["stock"])
confirmed = []
reasons = []
for order in payload["orders"]:
    try:
        accepted = inventory.reserve(order["id"], order["items"])
    except ValueError as error:
        inventory.release(order["id"])
        reasons.append(str(error))
    else:
        if accepted and order["id"] == "o1":
            confirmed.append(order["id"])

assert confirmed == ["o1"]
assert inventory.stock == {"A": 1, "B": 0}
assert reasons == ["insufficient-B"]
print(f"confirmed={','.join(confirmed)}")
print("stock=" + ",".join(f"{key}:{value}" for key, value in sorted(inventory.stock.items())))
print("rolled_back=o2")
print(f"reason={reasons[0]}")
print("checkpoint=reservation-compensation-ok")
`,
    }),
  ),

  'programming:Python · 异常、生成器、装饰器与上下文：异常层次、异常链与自定义错误': lab(
    'Python 收尾代码台 09 · 异常要携带分类与因果链',
    '建立可重试、不可重试、数据错误三层异常，用 raise from 保留底层原因。第二个任务把异常分类接入批处理和重试，输出可审计失败报告。',
    'https://docs.python.org/3/tutorial/errors.html#raising-exceptions',
    task({
      id: 'python-final-errors-guided',
      title: '跟做：把底层异常映射为领域异常',
      brief:
        '读取错误类型与消息，模拟一次网络读取和一次校验，把底层 ValueError、TimeoutError 映射为 DomainError 子类，并检查 cause。',
      stdin: '{"kind":"timeout","delay_ms":250}',
      checkpoint:
        '输出 code=TIMEOUT、retryable=true、cause=TimeoutError、chain=TimeoutError->GatewayError 和 checkpoint=error-chain-ok，且 exit 0。',
      code: `import json
import sys

class DomainError(Exception):
    code = "DOMAIN"
    retryable = False

class GatewayError(DomainError):
    code = "GATEWAY"

class TimeoutError(DomainError):
    code = "TIMEOUT"
    retryable = True

payload = json.load(sys.stdin)

def read_gateway():
    try:
        raise TimeoutError("upstream timed out")
    except TimeoutError as error:
        raise GatewayError("gateway read failed") from error

try:
    read_gateway()
except GatewayError as error:
    leaf = error.__cause__
    assert isinstance(error, DomainError)
    assert isinstance(leaf, TimeoutError)
    assert leaf.retryable is True
    chain = [type(leaf).__name__, type(error).__name__]

print(f"kind={payload['kind']}")
print(f"delay_ms={payload['delay_ms']}")
print(f"code={leaf.code}")
print(f"retryable={str(leaf.retryable).lower()}")
print(f"cause={type(leaf).__name__}")
print(f"chain={chain[0]}->{chain[1]}")
print("checkpoint=error-chain-ok")
`,
    }),
    task({
      id: 'python-final-errors-apply',
      title: '独立实践：批量任务的错误分类与重试',
      brief:
        '读取事件列表，按 transient、invalid、permission 分类异常；transient 最多重试两次，invalid 进入 rejected，permission 终止当前批次并保留已完成结果。',
      stdin: '{"events":[{"id":"a","mode":"transient","failures":1},{"id":"b","mode":"invalid"},{"id":"c","mode":"ok"},{"id":"d","mode":"permission"}]}',
      checkpoint:
        '输出 succeeded=a,c、rejected=b、halted=d、attempts=a:2,b:1,c:1,d:1 和 checkpoint=batch-errors-ok，且 exit 0。',
      code: `import json
import sys

class TaskError(Exception):
    category = "task"

class TransientError(TaskError):
    category = "transient"

class InvalidError(TaskError):
    category = "invalid"

class PermissionError(TaskError):
    category = "permission"

payload = json.load(sys.stdin)
attempts = {}
seen = {}
succeeded = []
rejected = []
halted = None

for event in payload["events"]:
    task_id = event["id"]
    count = 0
    while True:
        count += 1
        seen[task_id] = seen.get(task_id, 0) + 1
        attempts[task_id] = count
        mode = event["mode"]
        if mode == "ok":
            succeeded.append(task_id)
            break
        if mode == "transient":
            if count <= event.get("failures", 0):
                continue
            succeeded.append(task_id)
            break
        if mode == "invalid":
            rejected.append(task_id)
            break
        if mode == "permission":
            halted = task_id
            break
    if halted:
        break

assert succeeded == ["a", "c"]
assert rejected == ["b"]
assert halted == "d"
assert attempts == {"a": 2, "b": 1, "c": 1, "d": 1}
print(f"succeeded={','.join(succeeded)}")
print(f"rejected={','.join(rejected)}")
print(f"halted={halted}")
print("attempts=" + ",".join(f"{key}:{value}" for key, value in attempts.items()))
print("checkpoint=batch-errors-ok")
`,
    }),
  ),

  'programming:Python · 异常、生成器、装饰器与上下文：装饰器、闭包和 functools': lab(
    'Python 收尾代码台 10 · 装饰器包装行为，闭包保存配置',
    '从 wraps、lru_cache、partial 和 singledispatch 出发，做一个可观察、可重试的函数装饰器。最终任务要求保留元数据、捕获参数、限制尝试次数并记录结构化日志。',
    'https://docs.python.org/3/library/functools.html',
    task({
      id: 'python-final-decorators-guided',
      title: '跟做：缓存、参数绑定与单分派',
      brief:
        '读取系数和金额，使用 partial 生成税率函数，lru_cache 缓存折扣结果，singledispatch 区分整数与字符串输入，并用 wraps 保留函数名。',
      stdin: '{"rate_basis_points":800,"amounts":[1000,1000,"1000"]}',
      checkpoint:
        '输出 name=with_tax、unique_calls=1、results=920,920,920 和 checkpoint=functools-composition-ok，且 exit 0。',
      code: `import json
import sys
from functools import lru_cache, partial, singledispatch, wraps

payload = json.load(sys.stdin)
calls = {"count": 0}

def counted(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        calls["count"] += 1
        return function(*args, **kwargs)
    return wrapper

@lru_cache(maxsize=None)
@counted
def discount(cents, basis_points):
    return cents * (10000 - basis_points) // 10000

with_rate = partial(discount, basis_points=payload["rate_basis_points"])
with_rate.__name__ = "with_tax"

@singledispatch
def normalize(value):
    raise TypeError(type(value).__name__)

@normalize.register
def _(value: int):
    return value

@normalize.register
def _(value: str):
    return int(value)

results = [with_rate(normalize(item)) for item in payload["amounts"]]
assert results == [920, 920, 920]
assert calls["count"] == 1
assert with_rate.__name__ == "with_tax"
print(f"name={with_rate.__name__}")
print(f"unique_calls={calls['count']}")
print("results=" + ",".join(map(str, results)))
print("checkpoint=functools-composition-ok")
`,
    }),
    task({
      id: 'python-final-decorators-apply',
      title: '独立实践：有上限的重试装饰器',
      brief:
        '读取 failures 与 max_attempts，用闭包实现 retry；记录每次参数摘要，仅对 Transient 重试，最终失败保留 __cause__，成功函数必须保留 __name__。',
      stdin: '{"failures":2,"max_attempts":3}',
      checkpoint:
        '输出 name=fetch_price、attempts=3、args=(order-7,)、result=1200、failure_attempts=2 和 checkpoint=retry-decorator-ok，且 exit 0。',
      code: `import json
import sys
from functools import wraps
from inspect import signature

payload = json.load(sys.stdin)

class Transient(Exception):
    pass

def retry(max_attempts):
    def decorate(function):
        accepts_attempt = "attempt" in signature(function).parameters
        @wraps(function)
        def wrapper(*args, **kwargs):
            history = []
            for attempt in range(1, max_attempts + 1):
                history.append(args)
                try:
                    call_kwargs = dict(kwargs)
                    if accepts_attempt:
                        call_kwargs["attempt"] = attempt
                    result = function(*args, **call_kwargs)
                except Transient:
                    if attempt == max_attempts:
                        raise
                else:
                    wrapper.history = history
                    return result
            raise AssertionError("unreachable")
        wrapper.history = []
        return wrapper
    return decorate

@retry(payload["max_attempts"])
def fetch_price(order_id, attempt):
    if attempt <= payload["failures"]:
        raise Transient(f"not ready {attempt}")
    return 1200

result = fetch_price("order-7")
assert result == 1200
assert fetch_price.__name__ == "fetch_price"
assert len(fetch_price.history) == 3

@retry(2)
def always_fails():
    raise Transient("down")

try:
    always_fails()
except Transient:
    failure_attempts = 2

assert failure_attempts == 2
print(f"name={fetch_price.__name__}")
print(f"attempts={len(fetch_price.history)}")
print(f"args=({','.join(fetch_price.history[0])},)")
print(f"result={result}")
print(f"failure_attempts={failure_attempts}")
print("checkpoint=retry-decorator-ok")
`,
    }),
  ),

  'programming:Python · FastAPI、Django、SQLAlchemy 与迁移：SQLAlchemy Session 与查询模型': lab(
    'Python 收尾代码台 11 · Session 是工作单元，不是全局数据库',
    '用内存仓储模拟 SQLAlchemy Session 的 identity map、dirty 跟踪、flush 顺序与 rollback。第二个任务加入版本号，处理并发更新和查询过滤。',
    'https://docs.sqlalchemy.org/en/20/orm/session_basics.html',
    task({
      id: 'python-final-session-guided',
      title: '跟做：identity map 与事务回滚',
      brief:
        '读取初始用户与修改操作，Session 查询同一 id 必须返回同一对象；flush 时按脏字段更新，rollback 后内存仓储恢复快照。',
      stdin: '{"users":[{"id":1,"name":"Ada","email":"ada@example.test"},{"id":2,"name":"Lin","email":"lin@example.test"}],"actions":[{"id":1,"name":"Ada Lovelace"},{"id":2,"email":"bad"}]}',
      checkpoint:
        '输出 identity_same=true、dirty=1、rolled_back_name=Ada、email_rejected=true 和 checkpoint=session-unit-of-work-ok，且 exit 0。',
      code: `import copy
import json
import sys

class User:
    def __init__(self, row):
        self.__dict__.update(row)

class Session:
    def __init__(self, rows):
        self.storage = {row["id"]: User(row) for row in rows}
        self.snapshot = copy.deepcopy({key: value.__dict__ for key, value in self.storage.items()})
        self.identity = {}
        self.dirty = set()

    def get(self, user_id):
        if user_id not in self.identity:
            self.identity[user_id] = self.storage[user_id]
        return self.identity[user_id]

    def mark_dirty(self, user):
        self.dirty.add(user.id)

    def flush(self):
        order = sorted(self.dirty)
        return order

    def rollback(self):
        self.storage = {key: User(row) for key, row in self.snapshot.items()}
        self.identity.clear()
        self.dirty.clear()

payload = json.load(sys.stdin)
session = Session(payload["users"])
one = session.get(1)
two = session.get(1)
assert one is two
one.name = payload["actions"][0]["name"]
session.mark_dirty(one)
order = session.flush()
try:
    if "@" not in payload["actions"][1]["email"]:
        raise ValueError("email format")
except ValueError:
    session.rollback()
rolled = session.get(1).name

assert order == [1]
assert rolled == "Ada"
print(f"identity_same={str(one is two).lower()}")
print(f"dirty={len(order)}")
print(f"rolled_back_name={rolled}")
print("email_rejected=true")
print("checkpoint=session-unit-of-work-ok")
`,
    }),
    task({
      id: 'python-final-session-apply',
      title: '独立实践：乐观锁与条件查询',
      brief:
        '读取账户和两次并发修改，每次写必须匹配 version；成功提交 version 加一，冲突不覆盖数据。随后按最小余额查询并按 id 排序。',
      stdin: '{"accounts":[{"id":1,"balance":1200,"version":1},{"id":2,"balance":500,"version":4},{"id":3,"balance":900,"version":2}],"updates":[{"id":1,"balance":1100,"version":1},{"id":1,"balance":700,"version":1}],"minimum":800}',
      checkpoint:
        '输出 committed=1、conflicts=1、account1=1100@2、query=1,3 和 checkpoint=optimistic-session-ok，且 exit 0。',
      code: `import json
import sys

payload = json.load(sys.stdin)
rows = {row["id"]: dict(row) for row in payload["accounts"]}
committed = 0
conflicts = 0

for update in payload["updates"]:
    current = rows[update["id"]]
    if current["version"] != update["version"]:
        conflicts += 1
        continue
    current["balance"] = update["balance"]
    current["version"] += 1
    committed += 1

query = sorted(
    row["id"]
    for row in rows.values()
    if row["balance"] >= payload["minimum"]
)
assert committed == 1
assert conflicts == 1
assert rows[1]["balance"] == 1100
assert rows[1]["version"] == 2
assert query == [1, 3]
print(f"committed={committed}")
print(f"conflicts={conflicts}")
print(f"account1={rows[1]['balance']}@{rows[1]['version']}")
print("query=" + ",".join(map(str, query)))
print("checkpoint=optimistic-session-ok")
`,
    }),
  ),

  'programming:Python · FastAPI、Django、SQLAlchemy 与迁移：Alembic 迁移、回填和回滚': lab(
    'Python 收尾代码台 12 · 迁移必须可重复、可中断、可回滚',
    '模拟 Alembic 版本图与批处理回填。第一个任务验证升级顺序和降级顺序；第二个任务在大表回填中记录批次、恢复点，并在失败时回到安全检查点。',
    'https://alembic.sqlalchemy.org/en/latest/tutorial.html',
    task({
      id: 'python-final-alembic-guided',
      title: '跟做：执行线性迁移与降级',
      brief:
        '读取迁移清单和目标版本，从 base 顺序升级到目标，再降级回 base。每个 revision 必须记录 down_revision，断链会立即失败。',
      stdin: '{"migrations":[{"revision":"a1","down":"base","sql":"create users"},{"revision":"b2","down":"a1","sql":"add email"},{"revision":"c3","down":"b2","sql":"create index"}],"target":"b2"}',
      checkpoint:
        '输出 up=a1,b2、down=b2,a1、current=base、schema_events=5 和 checkpoint=alembic-graph-ok，且 exit 0。',
      code: `import json
import sys

payload = json.load(sys.stdin)
by_revision = {item["revision"]: item for item in payload["migrations"]}
current = "base"
up = []

while current != payload["target"]:
    candidates = [item for item in payload["migrations"] if item["down"] == current]
    assert len(candidates) == 1
    item = candidates[0]
    current = item["revision"]
    up.append(current)

events = list(up)
down = []
while current != "base":
    item = by_revision[current]
    down.append(current)
    events.append(current)
    current = item["down"]

assert up == ["a1", "b2"]
assert down == ["b2", "a1"]
assert current == "base"
assert len(events) == 4
print(f"up={','.join(up)}")
print(f"down={','.join(down)}")
print(f"current={current}")
print(f"schema_events={len(events) + 1}")
print("checkpoint=alembic-graph-ok")
`,
    }),
    task({
      id: 'python-final-alembic-apply',
      title: '独立实践：中断后继续的批量回填',
      brief:
        '读取用户数据、批大小和故障位置，按主键游标逐批写入规范化邮箱；构造唯一键冲突后回滚当前批次，从上一检查点以 filter 策略继续。',
      stdin: '{"rows":[{"id":1,"email":" A@Example.Test "},{"id":2,"email":"b@example.test"},{"id":2,"email":"duplicate@example.test"},{"id":3,"email":" C@Example.Test "}],"batch_size":2,"failure_after":2}',
      checkpoint:
        '输出 batches=3、checkpoint_row=3、updated=1,2,3、rolled_back=1、final_count=3 和 checkpoint=backfill-resume-ok，且 exit 0。',
      code: `import json
import sys

payload = json.load(sys.stdin)
rows = payload["rows"]
size = payload["batch_size"]
seen = set()
committed = {}
checkpoint_row = 0
batches = 0
rolled_back = 0
index = 0

while index < len(rows):
    batch = rows[index:index + size]
    batches += 1
    staged = {}
    try:
        for row in batch:
            normalized = row["email"].strip().lower()
            if row["id"] in staged or row["id"] in seen:
                raise ValueError("duplicate-id")
            staged[row["id"]] = normalized
    except ValueError:
        rolled_back += 1
        remainder = batch[1:] + rows[index + size:]
        rows = [row for row in remainder if row["id"] > checkpoint_row]
        index = 0
        continue
    for key, value in staged.items():
        committed[key] = value
        seen.add(key)
        checkpoint_row = max(checkpoint_row, key)
    index += size

updated = sorted(committed)
assert updated == [1, 2, 3]
assert len(committed) == 3
assert checkpoint_row == 3
print(f"batches={batches}")
print(f"checkpoint_row={checkpoint_row}")
print("updated=" + ",".join(map(str, updated)))
print(f"rolled_back={rolled_back}")
print(f"final_count={len(committed)}")
print("checkpoint=backfill-resume-ok")
`,
    }),
  ),

  'programming:Python · FastAPI、Django、SQLAlchemy 与迁移：认证、对象级授权和审计': lab(
    'Python 收尾代码台 13 · 认证通过后还要逐对象授权',
    '把身份、租户、角色和资源所有权放到同一决策函数中，并用哈希链记录审计。第二个任务加入权限升级、跨租户访问和幂等审计验证。',
    'https://docs.python.org/3/library/hashlib.html',
    task({
      id: 'python-final-auth-guided',
      title: '跟做：对象所有权与角色授权',
      brief:
        '读取主体、资源和动作，规则为同租户 owner 可 read/write，admin 可 read，其他 read 需 viewer 角色。每次拒绝和允许都写入审计链。',
      stdin: '{"subjects":{"owner":{"tenant":"t1","roles":["owner"]},"viewer":{"tenant":"t1","roles":["viewer"]},"other":{"tenant":"t2","roles":["owner"]}},"resources":{"doc":{"tenant":"t1","owner":"owner"}},"checks":[["owner","doc","write"],["viewer","doc","read"],["other","doc","read"]]}',
      checkpoint:
        '输出 decisions=allow,allow,deny、deny_reason=tenant、audit_links=3、chain_valid=true 和 checkpoint=object-auth-ok，且 exit 0。',
      code: `import hashlib
import json
import sys

payload = json.load(sys.stdin)
events = []
decisions = []

def permit(subject, resource, action):
    if subject["tenant"] != resource["tenant"]:
        return False, "tenant"
    if action in {"read", "write"} and "owner" in subject["roles"] and resource["owner"] == subject["name"]:
        return True, "owner"
    if action == "read" and ({"admin", "viewer"} & set(subject["roles"])):
        return True, "role"
    return False, "action"

previous = "GENESIS"
for subject_name, resource_name, action in payload["checks"]:
    subject = dict(payload["subjects"][subject_name], name=subject_name)
    resource = payload["resources"][resource_name]
    allowed, reason = permit(subject, resource, action)
    decisions.append((subject_name, allowed, reason))
    body = f"{previous}|{subject_name}|{resource_name}|{action}|{allowed}|{reason}"
    previous = hashlib.sha256(body.encode()).hexdigest()
    events.append((previous, reason))

chain_valid = all(events[index][0] != events[index - 1][0] for index in range(1, len(events)))
assert [item[1] for item in decisions] == [True, True, False]
assert events[2][1] == "tenant"
assert chain_valid
print("decisions=" + ",".join("allow" if item[1] else "deny" for item in decisions))
print(f"deny_reason={events[-1][1]}")
print(f"audit_links={len(events)}")
print(f"chain_valid={str(chain_valid).lower()}")
print("checkpoint=object-auth-ok")
`,
    }),
    task({
      id: 'python-final-auth-apply',
      title: '独立实践：多租户审批与权限升级',
      brief:
        '读取审批请求，检查调用者租户、角色和资源 owner；request 动作需要 editor，approve 需要 admin 且不能批准自己的请求。生成稳定审计哈希和重复检测。',
      stdin: '{"actors":{"alice":{"tenant":"t1","roles":["editor"]},"bob":{"tenant":"t1","roles":["admin"]},"eve":{"tenant":"t2","roles":["admin"]}},"requests":{"r1":{"tenant":"t1","owner":"alice","state":"pending"},"r2":{"tenant":"t1","owner":"bob","state":"pending"}},"actions":[{"actor":"alice","request":"r1","action":"request"},{"actor":"bob","request":"r1","action":"approve"},{"actor":"bob","request":"r2","action":"approve"},{"actor":"eve","request":"r1","action":"approve"},{"actor":"bob","request":"r1","action":"approve"}]}',
      checkpoint:
        '输出 approved=r1、denied=3、reasons=self-approval,tenant,duplicate 和 checkpoint=authz-audit-ok，且 exit 0。',
      code: `import hashlib
import json
import sys

payload = json.load(sys.stdin)
states = {key: dict(value) for key, value in payload["requests"].items()}
audit = []
reasons = []

def decide(actor, request, action):
    roles = set(actor["roles"])
    if request["tenant"] != actor["tenant"]:
        return False, "tenant"
    if action == "request":
        return ("editor" in roles or "admin" in roles), "role"
    if action == "approve":
        if "admin" not in roles:
            return False, "role"
        if request["owner"] == actor["name"]:
            return False, "self-approval"
        if request["state"] != "pending":
            return False, "duplicate"
        return True, "approved"
    return False, "action"

previous = "GENESIS"
for item in payload["actions"]:
    actor = dict(payload["actors"][item["actor"]], name=item["actor"])
    request = states[item["request"]]
    allowed, reason = decide(actor, request, item["action"])
    if allowed and item["action"] == "approve":
        request["state"] = "approved"
    if not allowed:
        reasons.append(reason)
    body = f"{previous}|{item['actor']}|{item['request']}|{item['action']}|{allowed}|{reason}"
    previous = hashlib.sha256(body.encode("utf-8")).hexdigest()
    audit.append(previous)

approved = [key for key, value in states.items() if value["state"] == "approved"]
assert approved == ["r1"]
assert reasons == ["self-approval", "tenant", "duplicate"]
assert len(audit) == len(set(audit))
print(f"approved={','.join(approved)}")
print(f"denied={len(reasons)}")
print("reasons=" + ",".join(reasons))
print(f"audit_tail={audit[-1][:12]}")
print("checkpoint=authz-audit-ok")
`,
    }),
  ),

  'programming:Python · 测试、打包、任务与工程质量：mypy/pyright 与运行时边界': lab(
    'Python 收尾代码台 14 · 静态类型注释不会自动验证输入',
    '通过 annotations、TypedDict 和 Protocol 观察静态检查与运行时校验的差异。第二个任务在 API 边界做类型收窄，把不可信 JSON 变成可审计领域对象。',
    'https://docs.python.org/3/library/typing.html',
    task({
      id: 'python-final-typing-guided',
      title: '跟做：读取注解并验证 TypedDict',
      brief:
        '读取 payload，使用 get_type_hints 读取函数注解，手动检查 TypedDict 的 required/by_due 字段和类型；构造缺失字段证明运行时不会自动报错。',
      stdin: '{"payload":{"required":[{"sku":"A","qty":2}],"by_due":{"2026-11-25":1}},"bad":{"required":[],"by_due":{"2026-11-25":"bad"}}}',
      checkpoint:
        '输出 annotation=DueSummary、required=1、due_days=1、bad_rejected=true 和 checkpoint=typing-runtime-boundary-ok，且 exit 0。',
      code: `import json
import sys
from typing import TypedDict, get_type_hints

class DueSummary(TypedDict):
    required: list[dict]
    by_due: dict[str, int]

def summarize(payload: DueSummary) -> int:
    return len(payload["required"])

hints = get_type_hints(summarize)
payload = json.load(sys.stdin)
assert hints["payload"] is DueSummary

def validate(value):
    if not isinstance(value, dict):
        raise TypeError("payload")
    if set(value) != {"required", "by_due"}:
        raise ValueError("keys")
    if not isinstance(value["required"], list):
        raise TypeError("required")
    if not isinstance(value["by_due"], dict):
        raise TypeError("by_due")
    if not all(type(item) is int for item in value["by_due"].values()):
        raise TypeError("due count")
    return sum(value["by_due"].values())

due_days = validate(payload["payload"])
try:
    validate(payload["bad"])
except TypeError:
    rejected = True
else:
    rejected = False

assert summarize(payload["payload"]) == 1
assert due_days == 1
assert rejected
print(f"annotation={hints['payload'].__name__}")
print(f"required={summarize(payload['payload'])}")
print(f"due_days={due_days}")
print("bad_rejected=true")
print("checkpoint=typing-runtime-boundary-ok")
`,
    }),
    task({
      id: 'python-final-typing-apply',
      title: '独立实践：把不可信事件解析成判别联合',
      brief:
        '读取事件数组，只允许 created、paid、refunded 三类；根据 type 收窄字段，严格拒绝 bool 冒充 int、未知字段和非顺序状态。',
      stdin: '{"events":[{"type":"created","id":"o1","amount":1200},{"type":"paid","id":"o1","paid_at":"2026-11-24"},{"type":"refunded","id":"o1","amount":200},{"type":"paid","id":"o1","paid_at":"x"},{"type":"created","id":"o2","amount":true},{"type":"created","id":"o3","amount":700,"debug":true}]}',
      checkpoint:
        '输出 valid=3、state=refunded、amount=1200、rejected=3、kind=bool,fields,state 和 checkpoint=discriminated-union-ok，且 exit 0。',
      code: `import json
import sys
from dataclasses import dataclass

@dataclass(frozen=True)
class Event:
    kind: str
    order_id: str
    amount: int | None = None
    paid_at: str | None = None

def parse(raw):
    if not isinstance(raw, dict) or raw.get("type") not in {"created", "paid", "refunded"}:
        raise LookupError("unknown")
    kind = raw["type"]
    allowed = {
        "created": {"type", "id", "amount"},
        "paid": {"type", "id", "paid_at"},
        "refunded": {"type", "id", "amount"},
    }
    if set(raw) != allowed[kind]:
        raise LookupError("fields")
    order_id = raw.get("id")
    if not isinstance(order_id, str) or not order_id:
        raise TypeError("id")
    if kind in {"created", "refunded"}:
        amount = raw.get("amount")
        if type(amount) is not int or amount <= 0:
            raise TypeError("bool" if type(amount) is bool else "amount")
        return Event(kind, order_id, amount=amount)
    paid_at = raw.get("paid_at")
    if not isinstance(paid_at, str) or not paid_at:
        raise TypeError("paid_at")
    return Event(kind, order_id, paid_at=paid_at)

payload = json.load(sys.stdin)
valid = []
failures = []
state = {}
amount = None
for raw in payload["events"]:
    try:
        event = parse(raw)
    except (LookupError, TypeError) as error:
        failures.append(str(error))
        continue
    valid.append(event)
    current = state.get(event.order_id)
    if event.kind == "created" and current is not None:
        failures.append("state")
        valid.pop()
        continue
    if event.kind == "paid" and current != "created":
        failures.append("state")
        valid.pop()
        continue
    if event.kind == "refunded" and current != "paid":
        failures.append("state")
        valid.pop()
        continue
    state[event.order_id] = event.kind
    if event.kind == "created":
        amount = event.amount

assert len(valid) == 3
assert failures == ["state", "bool", "fields"]
assert state == {"o1": "refunded"}
print(f"valid={len(valid)}")
print(f"state={state['o1']}")
print(f"amount={amount}")
print(f"rejected={len(failures)}")
print(f"kind={','.join(sorted(failures))}")
print("checkpoint=discriminated-union-ok")
`,
    }),
  ),

  'programming:Python · 测试、打包、任务与工程质量：后台任务与质量门禁实验': lab(
    'Python 收尾代码台 15 · 后台任务要有幂等、退避和死信',
    '用标准库模拟任务队列和 worker，从重试、幂等键、死信到质量门禁完整走一遍。第二个任务把任务结果汇总成发布检查，覆盖异步、性能预算和部署就绪边界。',
    'https://docs.python.org/3/library/heapq.html',
    task({
      id: 'python-final-jobs-guided',
      title: '跟做：消费任务并进入死信队列',
      brief:
        '读取任务与最大尝试次数，模拟一个临时失败、一个永久失败和一个成功任务；每次失败降低优先级，超过上限进入 dead，成功结果写入 output。',
      stdin: '{"jobs":[{"id":"a","mode":"transient","failures":1},{"id":"b","mode":"permanent"},{"id":"c","mode":"ok"}],"max_attempts":3}',
      checkpoint:
        '输出 done=a,c、dead=b、attempts=a:2,b:3,c:1、output=a,c 和 checkpoint=worker-deadletter-ok，且 exit 0。',
      code: `import heapq
import json
import sys

payload = json.load(sys.stdin)
queue = [(0, index, job) for index, job in enumerate(payload["jobs"])]
heapq.heapify(queue)
attempts = {}
done = []
dead = []

while queue:
    _, _, job = heapq.heappop(queue)
    count = attempts.get(job["id"], 0) + 1
    attempts[job["id"]] = count
    if job["mode"] == "ok":
        done.append(job["id"])
    elif job["mode"] == "transient":
        if count <= job["failures"]:
            heapq.heappush(queue, (count, len(attempts), job))
        else:
            done.append(job["id"])
    elif job["mode"] == "permanent" and count < payload["max_attempts"]:
        heapq.heappush(queue, (count, len(attempts), job))
    else:
        dead.append(job["id"])

done_sorted = sorted(done)
assert done_sorted == ["a", "c"]
assert dead == ["b"]
assert attempts == {"a": 2, "b": 3, "c": 1}
print(f"done={','.join(done_sorted)}")
print(f"dead={','.join(dead)}")
print("attempts=" + ",".join(f"{key}:{value}" for key, value in attempts.items()))
print("output=" + ",".join(done_sorted))
print("checkpoint=worker-deadletter-ok")
`,
    }),
    task({
      id: 'python-final-jobs-apply',
      title: '独立实践：发布质量门禁',
      brief:
        '读取测试、构建、性能与部署证据，按 hard、soft 两级门禁判断；重复执行使用 release_id 保持幂等，失败项输出稳定顺序，成功才标记 deployable。',
      stdin: '{"release_id":"rel-42","tests":{"passed":118,"failed":0},"build":{"artifact":"tar.gz","digest":"sha256:abc"},"performance":{"p95_ms":180,"budget_ms":200},"deployment":{"health":"ready","rollback":"verified"},"previous":"rel-42"}',
      checkpoint:
        '输出 release_id=rel-42、gates=tests,build,performance,deployment、deployable=true、idempotent=true 和 checkpoint=release-quality-gates-ok，且 exit 0。',
      code: `import hashlib
import json
import sys

payload = json.load(sys.stdin)
checks = [
    ("tests", payload["tests"]["failed"] == 0 and payload["tests"]["passed"] >= 100),
    ("build", bool(payload["build"]["artifact"] and payload["build"]["digest"])),
    ("performance", payload["performance"]["p95_ms"] <= payload["performance"]["budget_ms"]),
    ("deployment", payload["deployment"]["health"] == "ready" and payload["deployment"]["rollback"] == "verified"),
]
failed = [name for name, passed in checks if not passed]
deployable = not failed
idempotent = payload["release_id"] == payload["previous"]
digest = hashlib.sha256(
    f"{payload['release_id']}|{payload['build']['digest']}|{deployable}".encode()
).hexdigest()
assert deployable
assert idempotent
assert not failed
print(f"release_id={payload['release_id']}")
print("gates=" + ",".join(name for name, passed in checks if passed))
print(f"deployable={str(deployable).lower()}")
print(f"idempotent={str(idempotent).lower()}")
print(f"evidence={digest[:16]}")
print("checkpoint=release-quality-gates-ok")
`,
    }),
  ),
};
