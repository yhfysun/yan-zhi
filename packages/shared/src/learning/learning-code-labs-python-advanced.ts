import type { LearningV2CodeLab, LearningV2CodeLabTask } from './v2-types.js';

/**
 * Python 企业级课程的进阶代码实验室。
 *
 * 所有任务只依赖 Python 标准库，并由单文件 main.py 执行。
 * Django、FastAPI、Celery、Ruff、Uvicorn/Gunicorn 等第三方运行时不在
 * 代码台中安装，相关任务通过明确的协议、状态机与契约模拟展示边界。
 */
const pythonRuntime = {
  requiredRuntime: 'python',
  runtimeLabel: 'Python 3.11+ / 标准库内置运行器',
  installSteps: [
    '确认代码台中的 Python 运行器可用；本组实验不安装第三方包。',
    '代码从 stdin 读取结构化输入，并在同一个 main.py 中完成断言与 checkpoint。',
    '框架类任务只模拟协议和运行边界，课程正文会明确哪些内容不是第三方框架的真实执行。',
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

export const LEARNING_CODE_LABS_PYTHON_ADVANCED: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:Python · 数据模型、OOP 与惯用法：property、descriptor 与属性校验': lab(
    'Python 进阶代码台 01 · 描述符把校验放回属性边界',
    '通过描述符实现可复用的数值范围校验，再与 property 组合出只读派生值。任务观察类访问与实例访问的差异，并验证非法赋值不会污染对象状态。',
    'https://docs.python.org/3/howto/descriptor.html',
    task({
      id: 'python-advanced-descriptor-guided',
      title: '跟做：用描述符约束报价行',
      brief:
        '从 stdin 读取 unit_cents 与 quantity，创建 QuoteLine。描述符负责类型、下界和上界校验；非法 quantity 必须被拒绝，合法赋值后才能计算金额。',
      stdin: '{"unit_cents":1250,"quantity":3}',
      checkpoint:
        '输出 class_access=ValidatedInt、unit_cents=1250、quantity=3、total=3750 和 checkpoint=descriptor-state-ok，且 exit 0。非法 quantity 的捕获信息也要打印。',
      code: `import json
import sys


class ValidatedInt:
    def __init__(self, minimum=0, maximum=None):
        self.minimum = minimum
        self.maximum = maximum

    def __set_name__(self, owner, name):
        self.private_name = "_" + name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return getattr(instance, self.private_name)

    def __set__(self, instance, value):
        if type(value) is not int:
            raise TypeError("value must be int")
        if value < self.minimum:
            raise ValueError("value below minimum")
        if self.maximum is not None and value > self.maximum:
            raise ValueError("value above maximum")
        setattr(instance, self.private_name, value)


class QuoteLine:
    unit_cents = ValidatedInt(1)
    quantity = ValidatedInt(0, 50)

    def __init__(self, unit_cents, quantity):
        self.unit_cents = unit_cents
        self.quantity = quantity

    @property
    def total_cents(self):
        return self.unit_cents * self.quantity


payload = json.loads(sys.stdin.read())
line = QuoteLine(payload["unit_cents"], payload["quantity"])
invalid = False
try:
    line.quantity = 51
except ValueError as error:
    invalid = True
    print(f"invalid_quantity={error}")

assert invalid
assert line.quantity == payload["quantity"]
assert line.total_cents == 3750
assert type(QuoteLine.unit_cents).__name__ == "ValidatedInt"
print(f"class_access={type(QuoteLine.unit_cents).__name__}")
print(f"unit_cents={line.unit_cents}")
print(f"quantity={line.quantity}")
print(f"total={line.total_cents}")
print("checkpoint=descriptor-state-ok")`,
    }),
    task({
      id: 'python-advanced-descriptor-property-independent',
      title: '独立实践：描述符与只读库存快照',
      brief:
        '实现两个 Bounded 描述符字段，并用 property 计算 available。任务先合法预留库存，再尝试把 total 写到范围外，确认原值保持不变。',
      stdin: '{"total":12,"reserved":3,"reserve":4}',
      checkpoint:
        '输出 reserved=7、available=5、blocked=True 和 checkpoint=descriptor-property-boundary-ok。若 property 允许直接赋值或描述符未守住范围，断言应失败。',
      code: `import json
import sys


class Bounded:
    def __init__(self, minimum, maximum):
        self.minimum = minimum
        self.maximum = maximum

    def __set_name__(self, owner, name):
        self.storage = "_" + name

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return getattr(instance, self.storage)

    def __set__(self, instance, value):
        if not isinstance(value, int):
            raise TypeError("inventory fields require int")
        if not self.minimum <= value <= self.maximum:
            raise ValueError("inventory field outside range")
        setattr(instance, self.storage, value)


class Inventory:
    total = Bounded(0, 100)
    reserved = Bounded(0, 100)

    def __init__(self, total, reserved):
        self.total = total
        self.reserved = reserved

    @property
    def available(self):
        return self.total - self.reserved

    def reserve(self, amount):
        if amount <= 0 or amount > self.available:
            raise ValueError("reservation exceeds available stock")
        self.reserved += amount


payload = json.loads(sys.stdin.read())
inventory = Inventory(payload["total"], payload["reserved"])
inventory.reserve(payload["reserve"])

blocked = False
try:
    inventory.total = 101
except ValueError:
    blocked = True

assert inventory.total == 12
assert inventory.reserved == 7
assert inventory.available == 5
assert blocked
try:
    inventory.available = 99
except AttributeError:
    pass
else:
    raise AssertionError("available must remain read-only")

print(f"reserved={inventory.reserved}")
print(f"available={inventory.available}")
print(f"blocked={blocked}")
print("checkpoint=descriptor-property-boundary-ok")`,
    }),
  ),

  'programming:Python · 异常、生成器、装饰器与上下文：typing、Protocol 与泛型': lab(
    'Python 进阶代码台 02 · Protocol 描述能力而不是继承树',
    '用 typing.Protocol 表达可分页数据源与可关闭资源，观察结构化子类型在静态工具和运行时检查中的不同严格程度。',
    'https://docs.python.org/3/library/typing.html#typing.Protocol',
    task({
      id: 'python-advanced-protocol-guided',
      title: '跟做：分页能力的结构化协议',
      brief:
        'MemoryPageSource 不继承任何基类，只实现 page(cursor, size)。read_all 接收 PageSource，并在运行时确认对象具备协议成员。',
      stdin: '{"rows":["A-1","A-2","A-3","A-4","A-5"],"page_size":2}',
      checkpoint:
        '输出 protocol_match=True、pages=3、rows=5、last_cursor=None 和 checkpoint=protocol-structural-ok。空页必须显式返回 next_cursor=None。',
      code: `import json
import sys
from typing import Protocol, runtime_checkable


@runtime_checkable
class PageSource(Protocol):
    def page(self, cursor: int | None, size: int) -> dict:
        ...


class MemoryPageSource:
    def __init__(self, rows):
        self.rows = rows

    def page(self, cursor, size):
        start = 0 if cursor is None else cursor
        stop = start + size
        next_cursor = stop if stop < len(self.rows) else None
        return {"items": self.rows[start:stop], "next_cursor": next_cursor}


def read_all(source: PageSource, size: int):
    assert isinstance(source, PageSource)
    collected = []
    pages = 0
    cursor = None
    while True:
        payload = source.page(cursor, size)
        collected.extend(payload["items"])
        pages += 1
        cursor = payload["next_cursor"]
        if cursor is None:
            return collected, pages, cursor


payload = json.loads(sys.stdin.read())
source = MemoryPageSource(payload["rows"])
rows, pages, last_cursor = read_all(source, payload["page_size"])

assert isinstance(source, PageSource)
assert rows == payload["rows"]
assert pages == 3
assert last_cursor is None
print(f"protocol_match={isinstance(source, PageSource)}")
print(f"pages={pages}")
print(f"rows={len(rows)}")
print(f"last_cursor={last_cursor}")
print("checkpoint=protocol-structural-ok")`,
    }),
    task({
      id: 'python-advanced-protocol-runtime-independent',
      title: '独立实践：运行时检查只验成员，不验签名',
      brief:
        '构造一个 close(force) 与协议 close() 签名不同的对象。runtime_checkable 的 isinstance 仍返回 True；真正调用时才暴露 TypeError。任务据此记录运行时边界。',
      stdin: '{"message":"finish","force":true}',
      checkpoint:
        '输出 member_check=True、call_boundary=TypeError、closed=finish 和 checkpoint=protocol-runtime-boundary-ok。代码不得把 isinstance 成功误写成类型完全正确。',
      code: `import json
import sys
from typing import Protocol, runtime_checkable


@runtime_checkable
class Closer(Protocol):
    def close(self) -> None:
        ...


class GoodCloser:
    def __init__(self, message):
        self.closed = None
        self.message = message

    def close(self):
        self.closed = self.message


class SignatureOnly:
    def close(self, force):
        self.force = force


def consume(resource: Closer):
    resource.close()


payload = json.loads(sys.stdin.read())
good = GoodCloser(payload["message"])
wrong = SignatureOnly()

assert isinstance(good, Closer)
assert isinstance(wrong, Closer)
try:
    consume(wrong)
except TypeError as error:
    boundary = type(error).__name__
    print(f"call_error={error}")
else:
    raise AssertionError("runtime protocol must not repair a wrong signature")

consume(good)
assert good.closed == payload["message"]
print(f"member_check={isinstance(wrong, Closer)}")
print(f"call_boundary={boundary}")
print(f"closed={good.closed}")
print("checkpoint=protocol-runtime-boundary-ok")`,
    }),
  ),

  'programming:Python · 异常、生成器、装饰器与上下文：语言机制综合实验': lab(
    'Python 进阶代码台 03 · 元类注册表与函数内省',
    '用元类在类创建时校验插件契约，再用 inspect.signature 从真实函数生成调用 schema。两段任务分别覆盖类创建边界和函数调用边界。',
    'https://docs.python.org/3/reference/datamodel.html#metaclasses',
    task({
      id: 'python-advanced-metaclass-guided',
      title: '跟做：元类在类创建时登记插件',
      brief:
        'RegisteredPlugin 在 __new__ 中检查 kind/run 并登记具体插件。抽象基类跳过登记，重复 kind 或缺方法会在类定义阶段失败。',
      stdin: '{"records":["alpha","beta"]}',
      checkpoint:
        '输出 registered=upper、result=ALPHA,BETA、missing_blocked=True、duplicate_blocked=True 和 checkpoint=metaclass-registry-ok。',
      code: `import json
import sys


class RegisteredPlugin(type):
    registry = {}

    def __new__(mcls, name, bases, namespace):
        cls = super().__new__(mcls, name, bases, namespace)
        if namespace.get("abstract", False):
            return cls
        for member in ("kind", "run"):
            if member not in namespace:
                raise TypeError(f"{name} missing {member}")
        if cls.kind in mcls.registry:
            raise ValueError(f"duplicate plugin kind: {cls.kind}")
        mcls.registry[cls.kind] = cls
        return cls


class Plugin(metaclass=RegisteredPlugin):
    abstract = True
    kind = None

    def run(self, records):
        raise NotImplementedError


class UpperPlugin(Plugin):
    kind = "upper"

    def run(self, records):
        return ",".join(value.upper() for value in records)


missing_blocked = False
try:
    class BrokenPlugin(Plugin):
        kind = "broken"
except TypeError as error:
    missing_blocked = True
    print(f"missing_error={error}")

duplicate_blocked = False
try:
    class SecondUpper(Plugin):
        kind = "upper"

        def run(self, records):
            return ""
except ValueError as error:
    duplicate_blocked = True
    print(f"duplicate_error={error}")

payload = json.loads(sys.stdin.read())
plugin = RegisteredPlugin.registry["upper"]()
result = plugin.run(payload["records"])
assert result == "ALPHA,BETA"
assert missing_blocked and duplicate_blocked
print(f"registered={plugin.kind}")
print(f"result={result}")
print(f"missing_blocked={missing_blocked}")
print(f"duplicate_blocked={duplicate_blocked}")
print("checkpoint=metaclass-registry-ok")`,
    }),
    task({
      id: 'python-advanced-inspect-independent',
      title: '独立实践：从函数签名生成调用契约',
      brief:
        '使用 inspect.signature、参数默认值和 __annotations__ 生成 required/optional schema，再校验 stdin 参数、补默认值并调用真实函数。',
      stdin: '{"customer_id":"C-17","amount_cents":2599,"priority":"high"}',
      checkpoint:
        '输出 required=customer_id,amount_cents、optional=priority、default=normal、result=high:C-17:2599 和 checkpoint=inspect-contract-ok。缺少必填参数时 bind 要失败。',
      code: `import inspect
import json
import sys


def create_order(customer_id: str, amount_cents: int, priority: str = "normal") -> dict:
    return {
        "label": f"{priority}:{customer_id}:{amount_cents}",
        "amount_cents": amount_cents,
    }


signature = inspect.signature(create_order)
required = [
    name
    for name, parameter in signature.parameters.items()
    if parameter.default is inspect.Parameter.empty
]
optional = [name for name in signature.parameters if name not in required]
schema = {
    name: {
        "annotation": signature.parameters[name].annotation.__name__,
        "required": name in required,
        "default": None
        if signature.parameters[name].default is inspect.Parameter.empty
        else signature.parameters[name].default,
    }
    for name in signature.parameters
}

payload = json.loads(sys.stdin.read())
bound = signature.bind(**payload)
bound.apply_defaults()
result = create_order(*bound.args, **bound.kwargs)

missing_blocked = False
try:
    signature.bind(amount_cents=10)
except TypeError:
    missing_blocked = True

assert schema["customer_id"]["required"]
assert schema["priority"]["default"] == "normal"
assert result["label"] == "high:C-17:2599"
assert missing_blocked
print("required=" + ",".join(required))
print("optional=" + ",".join(optional))
print(f"default={schema['priority']['default']}")
print(f"result={result['label']}")
print("checkpoint=inspect-contract-ok")`,
    }),
  ),

  'programming:Python · 文件、网络、数据库与异步：HTTP 客户端、超时和重试': lab(
    'Python 进阶代码台 04 · 用回环服务器验证 HTTP 客户端边界',
    '在 127.0.0.1 随机端口启动标准库 HTTP 服务器，用 urllib 客户端观察 503 重试、超时和错误分类。任务不访问外网。',
    'https://docs.python.org/3/library/urllib.request.html',
    task({
      id: 'python-advanced-http-retry-guided',
      title: '跟做：识别 503 并有界重试',
      brief:
        '本地 /flaky 端点第一次返回 503，第二次返回 200。客户端只对 503 重试，记录状态码序列并确认 Authorization 头确实到达服务器。',
      stdin: '{"token":"local-demo","max_attempts":3}',
      checkpoint:
        '输出 statuses=503,200、attempts=2、authorization=local-demo、body=ready 和 checkpoint=http-loopback-ok。服务器必须在 finally 中关闭。',
      code: `import json
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    attempts = 0
    authorization = None

    def do_GET(self):
        type(self).authorization = self.headers.get("Authorization")
        if self.path == "/flaky":
            type(self).attempts += 1
            status = 503 if type(self).attempts == 1 else 200
            body = b"retry" if status == 503 else b"ready"
        else:
            status = 404
            body = b"missing"
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass


payload = json.loads(sys.stdin.read())
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
statuses = []
body = None
try:
    url = f"http://127.0.0.1:{server.server_port}/flaky"
    for attempt in range(payload["max_attempts"]):
        request = urllib.request.Request(
            url,
            headers={"Authorization": payload["token"]},
        )
        try:
            with urllib.request.urlopen(request, timeout=1) as response:
                statuses.append(response.status)
                body = response.read().decode("utf-8")
                break
        except urllib.error.HTTPError as error:
            statuses.append(error.code)
            if error.code != 503:
                raise
            time.sleep(0.01)
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=1)

assert statuses == [503, 200]
assert body == "ready"
assert Handler.authorization == payload["token"]
print("statuses=" + ",".join(map(str, statuses)))
print(f"attempts={len(statuses)}")
print(f"authorization={Handler.authorization}")
print(f"body={body}")
print("checkpoint=http-loopback-ok")`,
    }),
    task({
      id: 'python-advanced-http-timeout-independent',
      title: '独立实践：超时后降级到快速端点',
      brief:
        '本地 /slow 延迟响应，客户端用很小的 timeout 主动放弃；随后请求 /fast 证明连接仍可继续工作。任务是超时分类，不是无限重试。',
      stdin: '{"timeout":0.05,"delay":0.25}',
      checkpoint:
        '输出 timed_out=True、fallback_status=200、fallback_body=fast 和 checkpoint=http-timeout-fallback-ok。若客户端等满延迟或回退失败，断言应失败。',
      code: `import json
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    delay = 0.0

    def do_GET(self):
        if self.path == "/slow":
            time.sleep(type(self).delay)
            status, body = 200, b"slow"
        elif self.path == "/fast":
            status, body = 200, b"fast"
        else:
            status, body = 404, b"missing"
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass


payload = json.loads(sys.stdin.read())
Handler.delay = payload["delay"]
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
root = f"http://127.0.0.1:{server.server_port}"
timed_out = False
fallback_status = None
fallback_body = None
try:
    try:
        urllib.request.urlopen(root + "/slow", timeout=payload["timeout"]).read()
    except (TimeoutError, urllib.error.URLError) as error:
        reason = getattr(error, "reason", error)
        timed_out = isinstance(error, TimeoutError) or isinstance(reason, TimeoutError)
        print(f"timeout_error={type(reason).__name__}")

    with urllib.request.urlopen(root + "/fast", timeout=1) as response:
        fallback_status = response.status
        fallback_body = response.read().decode("utf-8")
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=1)

assert timed_out
assert fallback_status == 200
assert fallback_body == "fast"
print(f"timed_out={timed_out}")
print(f"fallback_status={fallback_status}")
print(f"fallback_body={fallback_body}")
print("checkpoint=http-timeout-fallback-ok")`,
    }),
  ),

  'programming:Python · 文件、网络、数据库与异步：SQL、连接、事务和参数化查询': lab(
    'Python 进阶代码台 05 · 事务边界与参数化查询',
    '使用标准库 sqlite3 建立真实内存数据库，验证转账原子性、约束、回滚和参数化查询。所有 SQL 都是本地真实执行。',
    'https://docs.python.org/3/library/sqlite3.html',
    task({
      id: 'python-advanced-sql-transaction-guided',
      title: '跟做：转账事务要么全成，要么全退',
      brief:
        '创建账户表并执行一笔合法转账，再尝试制造负余额。第二次事务必须整体回滚，账户总额与两条余额都不能改变。',
      stdin: '{"from_id":1,"to_id":2,"amount":70}',
      checkpoint:
        '输出 balances=30,90、total=120、rollback_preserved=True 和 checkpoint=sql-transaction-ok。UPDATE 后遇到约束或业务异常都必须执行 rollback。',
      code: `import json
import sqlite3
import sys


payload = json.loads(sys.stdin.read())
connection = sqlite3.connect(":memory:")
connection.execute("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)")
connection.executemany(
    "INSERT INTO accounts (id, balance) VALUES (?, ?)",
    [(1, 100), (2, 20)],
)
connection.commit()


def transfer(from_id, to_id, amount):
    try:
        connection.execute("BEGIN")
        source = connection.execute(
            "SELECT balance FROM accounts WHERE id = ?",
            (from_id,),
        ).fetchone()[0]
        if source < amount:
            raise ValueError("insufficient funds")
        connection.execute(
            "UPDATE accounts SET balance = balance - ? WHERE id = ?",
            (amount, from_id),
        )
        connection.execute(
            "UPDATE accounts SET balance = balance + ? WHERE id = ?",
            (amount, to_id),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise


transfer(payload["from_id"], payload["to_id"], payload["amount"])
before = dict(connection.execute("SELECT id, balance FROM accounts ORDER BY id"))
rollback_preserved = False
try:
    transfer(payload["from_id"], payload["to_id"], 50)
except ValueError as error:
    after = dict(connection.execute("SELECT id, balance FROM accounts ORDER BY id"))
    rollback_preserved = before == after
    print(f"rejected={error}")

assert before == {1: 30, 2: 90}
assert rollback_preserved
assert sum(before.values()) == 120
print("balances=" + ",".join(str(before[key]) for key in (1, 2)))
print(f"total={sum(before.values())}")
print(f"rollback_preserved={rollback_preserved}")
print("checkpoint=sql-transaction-ok")
connection.close()`,
    }),
    task({
      id: 'python-advanced-sql-parameter-independent',
      title: '独立实践：参数化查询与幂等唯一约束',
      brief:
        '把 SQL 注入样式的输入当作普通参数查询，再以 idempotency_key 唯一约束重放同一请求。第二次写入必须失败，订单和流水数量都不能翻倍。',
      stdin: "{\"email\":\"' OR 1=1 --\",\"idempotency\":\"req-7\",\"amount\":250}",
      checkpoint:
        '输出 injection_rows=0、orders=1、ledger=1、duplicate_blocked=True 和 checkpoint=sql-parameter-idempotency-ok。不得把输入拼进 SQL 字符串。',
      code: `import json
import sqlite3
import sys


payload = json.loads(sys.stdin.read())
connection = sqlite3.connect(":memory:")
connection.executescript(
    """
    CREATE TABLE customers (email TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        amount INTEGER NOT NULL,
        FOREIGN KEY (email) REFERENCES customers(email)
    );
    CREATE TABLE ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key TEXT NOT NULL UNIQUE,
        amount INTEGER NOT NULL
    );
    """
)
connection.execute("INSERT INTO customers VALUES (?, ?)", ("real@example.com", "Real"))


def place_order(email, amount, idempotency_key):
    with connection:
        cursor = connection.execute(
            "INSERT INTO ledger (idempotency_key, amount) VALUES (?, ?)",
            (idempotency_key, amount),
        )
        connection.execute(
            "INSERT INTO orders (email, amount) VALUES (?, ?)",
            (email, amount),
        )
        return cursor.lastrowid


injection_rows = connection.execute(
    "SELECT email FROM customers WHERE email = ?",
    (payload["email"],),
).fetchall()
place_order("real@example.com", payload["amount"], payload["idempotency"])

duplicate_blocked = False
try:
    place_order("real@example.com", payload["amount"], payload["idempotency"])
except sqlite3.IntegrityError as error:
    duplicate_blocked = True
    print(f"duplicate_error={error}")

order_count = connection.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
ledger_count = connection.execute("SELECT COUNT(*) FROM ledger").fetchone()[0]
assert injection_rows == []
assert order_count == 1
assert ledger_count == 1
assert duplicate_blocked
print(f"injection_rows={len(injection_rows)}")
print(f"orders={order_count}")
print(f"ledger={ledger_count}")
print(f"duplicate_blocked={duplicate_blocked}")
print("checkpoint=sql-parameter-idempotency-ok")
connection.close()`,
    }),
  ),

  'programming:Python · 文件、网络、数据库与异步：异步 IO 故障实验': lab(
    'Python 进阶代码台 06 · asyncio 子进程的超时与故障隔离',
    '用 asyncio.create_subprocess_exec 启动独立 Python 子进程，验证超时终止、并发上限、退出码和失败隔离。任务不会伪造异步执行。',
    'https://docs.python.org/3/library/asyncio-subprocess.html',
    task({
      id: 'python-advanced-async-subprocess-guided',
      title: '跟做：超时后终止子进程',
      brief:
        '先启动一个快速子进程并解析 JSON 输出，再启动一个长任务，用 wait_for 超时后 kill 并 wait 回收，确认没有悬挂进程。',
      stdin: '{"job":"alpha","value":41,"timeout":0.05}',
      checkpoint:
        '输出 job=alpha、value=42、returncode=0、timeout_killed=True 和 checkpoint=async-subprocess-ok。终止后必须等待子进程回收。',
      code: `import asyncio
import json
import sys


payload = json.loads(sys.stdin.read())


async def main():
    quick_code = (
        "import json, sys; "
        "print(json.dumps({'job': sys.argv[1], 'value': int(sys.argv[2]) + 1}))"
    )
    quick = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        quick_code,
        payload["job"],
        str(payload["value"]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(quick.communicate(), timeout=1)
    result = json.loads(stdout.decode("utf-8"))
    assert quick.returncode == 0, stderr.decode("utf-8")
    assert result == {"job": "alpha", "value": 42}

    slow = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import time; time.sleep(2)",
        stdout=asyncio.subprocess.PIPE,
    )
    timeout_killed = False
    try:
        await asyncio.wait_for(slow.communicate(), timeout=payload["timeout"])
    except TimeoutError:
        timeout_killed = True
        slow.kill()
        await slow.wait()

    assert timeout_killed
    assert slow.returncode != 0
    print(f"job={result['job']}")
    print(f"value={result['value']}")
    print(f"returncode={quick.returncode}")
    print(f"timeout_killed={timeout_killed}")
    print("checkpoint=async-subprocess-ok")


asyncio.run(main())`,
    }),
    task({
      id: 'python-advanced-async-subprocess-independent',
      title: '独立实践：有界并发与失败任务隔离',
      brief:
        '用 Semaphore 限制同时运行的子进程数，gather 三个任务，其中一个以非零退出码结束。记录峰值并发，并证明失败不会取消其他任务。',
      stdin:
        '{"jobs":[{"name":"a","delay":0.02,"fail":false},{"name":"b","delay":0.02,"fail":false},{"name":"c","delay":0.01,"fail":true},{"name":"d","delay":0.02,"fail":false}],"limit":2}',
      checkpoint:
        '输出 peak=2、ok=a,b,d、failed=c、results=4 和 checkpoint=async-subprocess-failure-ok。peak 超过 limit 或失败扩散都应触发断言。',
      code: `import asyncio
import json
import sys


payload = json.loads(sys.stdin.read())
active = 0
peak = 0
guard = asyncio.Lock()


async def run_job(job, semaphore):
    global active, peak
    child_code = (
        "import sys, time; "
        "time.sleep(float(sys.argv[1])); "
        "print(sys.argv[2]); "
        "raise SystemExit(2 if sys.argv[3] == '1' else 0)"
    )
    async with semaphore:
        async with guard:
            active += 1
            peak = max(peak, active)
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                child_code,
                str(job["delay"]),
                job["name"],
                "1" if job["fail"] else "0",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=2)
            return {
                "name": job["name"],
                "ok": process.returncode == 0,
                "code": process.returncode,
                "stdout": stdout.decode("utf-8").strip(),
                "stderr": stderr.decode("utf-8").strip(),
            }
        finally:
            async with guard:
                active -= 1


async def main():
    semaphore = asyncio.Semaphore(payload["limit"])
    results = await asyncio.gather(
        *(run_job(job, semaphore) for job in payload["jobs"])
    )
    successful = [item["name"] for item in results if item["ok"]]
    failed = [item["name"] for item in results if not item["ok"]]
    assert peak <= payload["limit"]
    assert successful == ["a", "b", "d"]
    assert failed == ["c"]
    assert all(item["stdout"] == item["name"] for item in results)
    print(f"peak={peak}")
    print("ok=" + ",".join(successful))
    print("failed=" + ",".join(failed))
    print(f"results={len(results)}")
    print("checkpoint=async-subprocess-failure-ok")


asyncio.run(main())`,
    }),
  ),

  'programming:Python · FastAPI、Django、SQLAlchemy 与迁移：Django ORM、视图、后台和中间件':
    lab(
      'Python 进阶代码台 07 · Django 请求/ORM 契约模拟',
      'Django 未安装，本代码台用标准库显式模拟 QuerySet 惰性、租户过滤、中间件拒绝和事务回滚。目标是理解契约，而不是声称执行了 Django。',
      'https://docs.djangoproject.com/en/stable/topics/db/queries/',
      task({
        id: 'python-advanced-django-orm-guided',
        title: '跟做：QuerySet 从构链到求值',
        brief:
          '伪造一个最小 QuerySet：for_tenant/filter 只构造计划，不访问数据源；迭代时才执行一次查询。结果必须只包含当前租户。',
        stdin: '{"tenant":"acme","email":"ada@example.com"}',
        checkpoint:
          '输出 evaluated_before=0、evaluated_after=1、tenant=acme、email=ada@example.com 和 checkpoint=django-orm-contract-ok。',
        code: `import json
import sys


class Database:
    def __init__(self, rows):
        self.rows = rows
        self.calls = 0

    def execute(self):
        self.calls += 1
        return list(self.rows)


class QuerySet:
    def __init__(self, database, operations=()):
        self.database = database
        self.operations = operations

    def for_tenant(self, tenant):
        return QuerySet(self.database, self.operations + (("tenant", tenant),))

    def filter(self, field, value):
        return QuerySet(self.database, self.operations + ((field, value),))

    def __iter__(self):
        rows = self.database.execute()
        for operation in self.operations:
            if operation[0] == "tenant":
                tenant = operation[1]
                rows = [row for row in rows if row["tenant"] == tenant]
            elif operation[0] == "email":
                email = operation[1]
                rows = [row for row in rows if row["email"] == email]
        return iter(rows)


payload = json.loads(sys.stdin.read())
database = Database(
    [
        {"tenant": "acme", "email": "ada@example.com"},
        {"tenant": "acme", "email": "lin@example.com"},
        {"tenant": "globex", "email": "ada@example.com"},
    ]
)
queryset = QuerySet(database).for_tenant(payload["tenant"]).filter(
    "email", payload["email"]
)

before = database.calls
rows = list(queryset)
after = database.calls
assert before == 0
assert after == 1
assert rows == [{"tenant": "acme", "email": "ada@example.com"}]
print(f"evaluated_before={before}")
print(f"evaluated_after={after}")
print(f"tenant={rows[0]['tenant']}")
print(f"email={rows[0]['email']}")
print("checkpoint=django-orm-contract-ok")`,
      }),
      task({
        id: 'python-advanced-django-middleware-independent',
        title: '独立实践：中间件、对象授权和原子操作',
        brief:
          'Request 经过租户中间件和对象级授权后进入视图；视图写入后抛出异常，原子块必须回滚，中间件仍要记录拒绝/回滚结果。',
        stdin:
          '{"tenant":"acme","role":"manager","object_tenant":"acme","amount":120,"simulate_failure":true}',
        checkpoint:
          '输出 status=503、writes=0、audit=request,write-attempt,transaction-rollback,response 和 checkpoint=django-middleware-auth-contract-ok。',
        code: `import json
import sys


class Request:
    def __init__(self, payload):
        self.tenant = payload["tenant"]
        self.role = payload["role"]
        self.object_tenant = payload["object_tenant"]
        self.simulate_failure = payload["simulate_failure"]
        self.amount = payload["amount"]
        self.audit = ["request"]


class Atomic:
    def __init__(self, state):
        self.state = state
        self.snapshot = None

    def __enter__(self):
        self.snapshot = list(self.state["writes"])
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc_type is not None:
            self.state["writes"] = self.snapshot
            return False
        return False


class Middleware:
    def __call__(self, request, view):
        try:
            if request.role not in {"manager", "admin"}:
                raise PermissionError("role cannot write")
            if request.object_tenant != request.tenant:
                raise PermissionError("tenant boundary")
            response = view(request)
        except PermissionError as error:
            request.audit.append("permission-denied")
            response = {"status": 403, "detail": str(error)}
        except RuntimeError as error:
            request.audit.append("transaction-rollback")
            response = {"status": 503, "detail": str(error)}
        request.audit.append("response")
        return response


def view(request):
    state = request.__dict__["state"]
    with Atomic(state):
        request.audit.append("write-attempt")
        state["writes"].append({"tenant": request.tenant, "amount": request.amount})
        if request.simulate_failure:
            raise RuntimeError("downstream write failed")
    return {"status": 201}


payload = json.loads(sys.stdin.read())
request = Request(payload)
request.state = {"writes": []}
response = Middleware()(request, view)

assert response["status"] == 503
assert request.state["writes"] == []
assert request.audit == [
    "request",
    "write-attempt",
    "transaction-rollback",
    "response",
]
print(f"status={response['status']}")
print(f"writes={len(request.state['writes'])}")
print("audit=" + ",".join(request.audit))
print("checkpoint=django-middleware-auth-contract-ok")`,
      }),
    ),

  'programming:Python · FastAPI、Django、SQLAlchemy 与迁移：框架企业服务对照实验': lab(
    'Python 进阶代码台 08 · FastAPI 依赖与响应契约模拟',
    'FastAPI/Pydantic 未安装，代码台用标准库模拟认证依赖、请求校验、异常映射和 response_model 字段过滤，明确展示框架契约。',
    'https://fastapi.tiangolo.com/tutorial/dependencies/',
    task({
      id: 'python-advanced-fastapi-dependency-guided',
      title: '跟做：认证依赖先于业务校验',
      brief:
        '模拟 FastAPI 的依赖求值与请求校验：token 无效返回 401，数量非法返回 422，合法请求返回 201 和计算后的总价。',
      stdin: '{"sku":"SKU-9","quantity":3,"unit_cents":1200,"token":"valid-token"}',
      checkpoint:
        '输出 status=201、sku=SKU-9、total=3600、dependency=valid-token 和 checkpoint=fastapi-dependency-validation-ok。',
      code: `import json
import sys


class HTTPException(Exception):
    def __init__(self, status, detail):
        self.status = status
        self.detail = detail


def require_token(token):
    if token != "valid-token":
        raise HTTPException(401, "invalid token")
    return token


def validate_create(payload):
    sku = payload.get("sku")
    quantity = payload.get("quantity")
    unit_cents = payload.get("unit_cents")
    if not isinstance(sku, str) or not sku.startswith("SKU-"):
        raise HTTPException(422, "sku invalid")
    if type(quantity) is not int or quantity < 1:
        raise HTTPException(422, "quantity invalid")
    if type(unit_cents) is not int or unit_cents < 1:
        raise HTTPException(422, "unit_cents invalid")
    return {"sku": sku, "quantity": quantity, "unit_cents": unit_cents}


def endpoint(payload):
    dependency = require_token(payload.get("token"))
    request = validate_create(payload)
    return {
        "status": 201,
        "body": {
            "sku": request["sku"],
            "quantity": request["quantity"],
            "total_cents": request["quantity"] * request["unit_cents"],
        },
        "dependency": dependency,
    }


payload = json.loads(sys.stdin.read())
response = endpoint(payload)
bad_auth = False
try:
    endpoint({**payload, "token": "bad"})
except HTTPException as error:
    bad_auth = error.status == 401
bad_body = False
try:
    endpoint({**payload, "quantity": "three"})
except HTTPException as error:
    bad_body = error.status == 422

assert response["status"] == 201
assert response["body"] == {"sku": "SKU-9", "quantity": 3, "total_cents": 3600}
assert bad_auth and bad_body
print(f"status={response['status']}")
print(f"sku={response['body']['sku']}")
print(f"total={response['body']['total_cents']}")
print(f"dependency={response['dependency']}")
print("checkpoint=fastapi-dependency-validation-ok")`,
    }),
    task({
      id: 'python-advanced-fastapi-response-independent',
      title: '独立实践：异步路由、422 信封与响应字段过滤',
      brief:
        '异步路由接收合法 JSON 后只返回 response_model 声明的字段，内部字段不得泄漏；把 quantity 改成字符串时返回 422 错误信封。',
      stdin: '{"sku":"SKU-1","quantity":2,"unit_cents":500,"internal_cost":300}',
      checkpoint:
        '输出 status=201、keys=sku,quantity,total_cents、validation_status=422、internal_leaked=False 和 checkpoint=fastapi-response-contract-ok。',
      code: `import asyncio
import json
import sys


async def create_order(payload):
    if not isinstance(payload.get("sku"), str):
        return {"status": 422, "body": {"errors": [{"field": "sku", "type": "string"}]}}
    if type(payload.get("quantity")) is not int:
        return {
            "status": 422,
            "body": {"errors": [{"field": "quantity", "type": "integer"}]},
        }
    if type(payload.get("unit_cents")) is not int:
        return {
            "status": 422,
            "body": {"errors": [{"field": "unit_cents", "type": "integer"}]},
        }

    domain = {
        "sku": payload["sku"],
        "quantity": payload["quantity"],
        "total_cents": payload["quantity"] * payload["unit_cents"],
        "internal_cost": payload.get("internal_cost", 0),
    }
    response_model = ("sku", "quantity", "total_cents")
    public = {key: domain[key] for key in response_model}
    return {"status": 201, "body": public}


async def main():
    payload = json.loads(sys.stdin.read())
    valid = await create_order(payload)
    invalid = await create_order({**payload, "quantity": "two"})
    keys = ",".join(valid["body"].keys())
    assert valid["status"] == 201
    assert keys == "sku,quantity,total_cents"
    assert invalid["status"] == 422
    assert invalid["body"]["errors"][0]["field"] == "quantity"
    assert "internal_cost" not in valid["body"]
    print(f"status={valid['status']}")
    print(f"keys={keys}")
    print(f"validation_status={invalid['status']}")
    print("internal_leaked=False")
    print("checkpoint=fastapi-response-contract-ok")


asyncio.run(main())`,
    }),
  ),

  'programming:Python · 测试、打包、任务与工程质量：Ruff、格式化、预提交和 CI': lab(
    'Python 进阶代码台 09 · 近似 Ruff 规则与 CI 门禁',
    'Ruff 未安装。第一段用标准库 ast 演示未使用导入、裸 except 和行宽规则；第二段解析 pyproject/CI 契约并运行标准库 unittest 门禁。',
    'https://docs.astral.sh/ruff/configuration/',
    task({
      id: 'python-advanced-ruff-rules-guided',
      title: '跟做：用 AST 复现三条静态检查',
      brief:
        '从 stdin 读取 Python 源码，用 ast 找出未使用导入、裸 except 和超长行。实现只是教学近似，不宣称替代 Ruff。',
      stdin:
        '{"source":"import json\\nimport os\\n\\ntry:\\n    value = 1\\nexcept:\\n    value = 0\\nprint(json.dumps({\\"value\\": value, \\"padding\\": \\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\"}))\\n"}',
      checkpoint:
        '输出 unused=os、bare_except=1、long_lines=1、gate=False 和 checkpoint=ruff-ast-rules-ok。规则解释必须说明这是近似实现。',
      code: `import ast
import json
import sys


payload = json.loads(sys.stdin.read())
source = payload["source"]
tree = ast.parse(source)

imports = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            imports[alias.asname or alias.name.split(".")[0]] = node.lineno

used = {
    node.id
    for node in ast.walk(tree)
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
}
unused = sorted(name for name in imports if name not in used)
bare_except = sum(
    1
    for node in ast.walk(tree)
    if isinstance(node, ast.ExceptHandler) and node.type is None
)
long_lines = [
    number
    for number, line in enumerate(source.splitlines(), start=1)
    if len(line) > 88
]
findings = len(unused) + bare_except + len(long_lines)

assert unused == ["os"]
assert bare_except == 1
assert long_lines == [8]
assert findings == 3
print("unused=" + ",".join(unused))
print(f"bare_except={bare_except}")
print(f"long_lines={len(long_lines)}")
print(f"gate={findings == 0}")
print("checkpoint=ruff-ast-rules-ok")`,
    }),
    task({
      id: 'python-advanced-ruff-ci-independent',
      title: '独立实践：解析配置并执行 CI 门禁',
      brief:
        '解析 pyproject.toml 的 Python/Ruff 配置，检查 CI 是否包含三条规定命令，再运行一个标准库 unittest。配置缺口必须让 gate=False。',
      stdin: '{"changed":["src/orders.py","tests/test_orders.py"],"python":"3.11"}',
      checkpoint:
        '输出 python_range=>=3.11、line_length=100、commands=3、tests_ok=True、gate=True 和 checkpoint=ruff-ci-gate-ok。',
      code: `import io
import json
import sys
import tomllib
import unittest


PYPROJECT = """
[project]
name = "orders-service"
requires-python = ">=3.11"

[tool.ruff]
line-length = 100
target-version = "py311"
"""

CI = """
steps:
  - run: ruff check .
  - run: ruff format --check .
  - run: python -m unittest discover -s tests
"""


class GateTests(unittest.TestCase):
    def test_total(self):
        self.assertEqual(sum([1200, 800]), 2000)

    def test_invalid_quantity(self):
        with self.assertRaises(ValueError):
            int("not-an-int")


payload = json.loads(sys.stdin.read())
config = tomllib.loads(PYPROJECT)
required_commands = [
    "ruff check .",
    "ruff format --check .",
    "python -m unittest discover -s tests",
]
missing_commands = [command for command in required_commands if command not in CI]
python_range = config["project"]["requires-python"]
line_length = config["tool"]["ruff"]["line-length"]

stream = io.StringIO()
suite = unittest.defaultTestLoader.loadTestsFromTestCase(GateTests)
result = unittest.TextTestRunner(stream=stream, verbosity=0).run(suite)
gate = (
    result.wasSuccessful()
    and not missing_commands
    and line_length == 100
    and payload["python"] in python_range
)

assert payload["changed"][-1].startswith("tests/")
assert result.testsRun == 2
assert not missing_commands
assert gate
print(f"python_range={python_range}")
print(f"line_length={line_length}")
print(f"commands={len(required_commands)}")
print(f"tests_ok={result.wasSuccessful()}")
print(f"gate={gate}")
print("checkpoint=ruff-ci-gate-ok")`,
    }),
  ),

  'programming:Python · 测试、打包、任务与工程质量：Celery、重试、幂等和死信': lab(
    'Python 进阶代码台 10 · Celery 任务信封语义模拟',
    'Celery/Broker 未安装。任务用内存队列模拟任务消息、有限重试、指数退避、幂等副作用、late ack 与死信队列。',
    'https://docs.celeryq.dev/en/stable/userguide/tasks.html',
    task({
      id: 'python-advanced-celery-retry-guided',
      title: '跟做：有限重试不能重复业务副作用',
      brief:
        '模拟一个前两次连接失败、第三次成功的任务。重试延迟按 1、2 秒递增，但副作用只允许提交一次。',
      stdin: '{"fail_until_attempt":2,"max_retries":3,"idempotency_key":"receipt-7"}',
      checkpoint:
        '输出 attempts=3、delays=1,2、effects=1、status=succeeded 和 checkpoint=celery-retry-idempotency-ok。超过重试上限要失败。',
      code: `import json
import sys


payload = json.loads(sys.stdin.read())
effects = []
delays = []


def send_receipt(attempt):
    if attempt < payload["fail_until_attempt"]:
        raise ConnectionError(f"broker unavailable at attempt {attempt}")
    if payload["idempotency_key"] not in effects:
        effects.append(payload["idempotency_key"])
    return {"receipt": payload["idempotency_key"]}


status = "pending"
attempt = 0
while attempt <= payload["max_retries"]:
    try:
        result = send_receipt(attempt)
        status = "succeeded"
        attempt += 1
        break
    except ConnectionError as error:
        print(f"retry_reason={error}")
        if attempt == payload["max_retries"]:
            status = "failed"
            attempt += 1
            break
        delays.append(2**attempt)
        attempt += 1

assert attempt == 3
assert delays == [1, 2]
assert effects == [payload["idempotency_key"]]
assert status == "succeeded"
assert result["receipt"] == "receipt-7"
print(f"attempts={attempt}")
print("delays=" + ",".join(map(str, delays)))
print(f"effects={len(effects)}")
print(f"status={status}")
print("checkpoint=celery-retry-idempotency-ok")`,
    }),
    task({
      id: 'python-advanced-celery-deadletter-independent',
      title: '独立实践：late ack 与毒消息进入死信',
      brief:
        '消息只在任务成功后离开队列；毒消息重复投递到上限后进入 DLQ，健康消息正常确认。任务是 Broker 语义模拟。',
      stdin: '{"poison_until":99,"healthy":true,"max_deliveries":2}',
      checkpoint:
        '输出 deliveries=2、acknowledged=healthy、dead_letters=poison、queue_empty=True 和 checkpoint=celery-deadletter-ack-ok。',
      code: `import json
import sys
from collections import deque
from dataclasses import dataclass


@dataclass
class Message:
    message_id: str
    poison_until: int
    deliveries: int = 0


payload = json.loads(sys.stdin.read())
queue = deque(
    [
        Message("poison", payload["poison_until"]),
        Message("healthy", 0),
    ]
)
acknowledged = []
dead_letters = []

while queue:
    message = queue.popleft()
    message.deliveries += 1
    failed = message.deliveries <= message.poison_until
    if not failed:
        acknowledged.append(message.message_id)
        continue
    if message.deliveries >= payload["max_deliveries"]:
        dead_letters.append(
            {
                "id": message.message_id,
                "reason": "delivery-limit",
                "deliveries": message.deliveries,
            }
        )
    else:
        queue.append(message)

assert dead_letters == [
    {"id": "poison", "reason": "delivery-limit", "deliveries": 2}
]
assert acknowledged == ["healthy"]
assert not queue
print(f"deliveries={dead_letters[0]['deliveries']}")
print("acknowledged=" + ",".join(acknowledged))
print("dead_letters=" + ",".join(item["id"] for item in dead_letters))
print(f"queue_empty={not queue}")
print("checkpoint=celery-deadletter-ack-ok")`,
    }),
  ),

  'programming:Python · CPython、性能与生产部署：dis 字节码与代码对象': lab(
    'Python 进阶代码台 11 · 从字节码与签名理解调用',
    '用 dis.get_instructions 观察 LOAD_FAST/BINARY_OP，再用 inspect.signature 从函数生成命令分发契约。任务关注代码对象事实，不以指令条数武断性能。',
    'https://docs.python.org/3/library/dis.html',
    task({
      id: 'python-advanced-dis-guided',
      title: '跟做：读取字节码和 code object',
      brief:
        '对 quote_total 执行并读取指令、局部变量名与常量。输入决定运行结果；字节码中应出现 LOAD_FAST 与 BINARY_OP。',
      stdin: '{"base":10,"bonus":4}',
      checkpoint:
        '输出 result=28、load_fast=True、binary_op=True、locals=base,bonus,subtotal 和 checkpoint=dis-code-object-ok。',
      code: `import dis
import json
import sys


def quote_total(base, bonus):
    subtotal = base + bonus
    return subtotal * 2


payload = json.loads(sys.stdin.read())
result = quote_total(payload["base"], payload["bonus"])
instructions = list(dis.get_instructions(quote_total))
opnames = {instruction.opname for instruction in instructions}

assert result == 28
assert "LOAD_FAST" in opnames
assert "BINARY_OP" in opnames
assert quote_total.__code__.co_varnames[:3] == ("base", "bonus", "subtotal")
assert 2 in quote_total.__code__.co_consts
print(f"result={result}")
print(f"load_fast={'LOAD_FAST' in opnames}")
print(f"binary_op={'BINARY_OP' in opnames}")
print("locals=" + ",".join(quote_total.__code__.co_varnames[:3]))
print("checkpoint=dis-code-object-ok")`,
    }),
    task({
      id: 'python-advanced-inspect-dispatch-independent',
      title: '独立实践：由签名绑定参数并分派命令',
      brief:
        '维护命令表，用 inspect.signature 校验参数、补默认值，再通过绑定后的参数调用真实函数。缺参数和未知命令都必须被拒绝。',
      stdin: '{"command":"discount","args":{"amount":250,"percent":20}}',
      checkpoint:
        '输出 command=discount、result=200、required=amount、defaults_applied=False、blocked=missing,unknown 和 checkpoint=inspect-dispatch-ok。',
      code: `import inspect
import json
import sys


def discount(amount: int, percent: int = 10) -> int:
    return round(amount * (1 - percent / 100))


def shipping(amount: int, express: bool = False) -> int:
    return (900 if express else 300) + amount // 1000 * 50


COMMANDS = {"discount": discount, "shipping": shipping}
payload = json.loads(sys.stdin.read())
function = COMMANDS.get(payload["command"])
if function is None:
    raise AssertionError("unknown command should be tested below")
signature = inspect.signature(function)
bound = signature.bind(**payload["args"])
schema_bound = signature.bind(amount=100)
defaults_applied = "percent" not in schema_bound.arguments
bound.apply_defaults()
result = function(*bound.args, **bound.kwargs)

blocked = []
try:
    signature.bind()
except TypeError:
    blocked.append("missing")
if "missing" not in COMMANDS:
    blocked.append("unknown")

assert result == 200
assert "amount" in signature.parameters
assert defaults_applied
assert blocked == ["missing", "unknown"]
print(f"command={payload['command']}")
print(f"result={result}")
print("required=" + ",".join(
    name
    for name, parameter in signature.parameters.items()
    if parameter.default is inspect.Parameter.empty
))
print(f"defaults_applied={defaults_applied}")
print("blocked=" + ",".join(blocked))
print("checkpoint=inspect-dispatch-ok")`,
    }),
  ),

  'programming:Python · CPython、性能与生产部署：引用计数、GC 和内存增长': lab(
    'Python 进阶代码台 12 · 循环引用与对象内存账本',
    '通过弱引用观察循环引用在 GC 关闭/开启后的生命周期，再用 tracemalloc 与 __slots__ 比较大量对象的分配差异。',
    'https://docs.python.org/3/library/gc.html',
    task({
      id: 'python-advanced-gc-cycle-guided',
      title: '跟做：循环引用需要 GC 兜底',
      brief:
        '关闭自动 GC 创建多组相互引用对象，删除外部引用后弱引用仍存活；调用 gc.collect 后弱引用清空。结束后恢复原 GC 状态。',
      stdin: '{"cycles":4}',
      checkpoint:
        '输出 cycles=4、alive_before=4、collected>=4、alive_after=0 和 checkpoint=gc-cycle-collection-ok。',
      code: `import gc
import json
import sys
import weakref


class Node:
    def __init__(self, name):
        self.name = name
        self.peer = None


payload = json.loads(sys.stdin.read())
was_enabled = gc.isenabled()
gc.collect()
gc.disable()
refs = []
try:
    for index in range(payload["cycles"]):
        left = Node(f"left-{index}")
        right = Node(f"right-{index}")
        left.peer = right
        right.peer = left
        refs.append(weakref.ref(left))
    left = right = None
    alive_before = sum(reference() is not None for reference in refs)
    assert alive_before == payload["cycles"]
    collected = gc.collect()
    alive_after = sum(reference() is not None for reference in refs)
finally:
    if was_enabled:
        gc.enable()

assert collected >= payload["cycles"]
assert alive_after == 0
print(f"cycles={payload['cycles']}")
print(f"alive_before={alive_before}")
print(f"collected={collected}")
print(f"alive_after={alive_after}")
print("checkpoint=gc-cycle-collection-ok")`,
    }),
    task({
      id: 'python-advanced-memory-slots-independent',
      title: '独立实践：tracemalloc 比较普通类与 __slots__',
      brief:
        '分别创建普通实例和 __slots__ 实例，测量每对象大小与 tracemalloc 峰值。断言 slots 占用更低，同时说明结果只反映 Python 分配器视角。',
      stdin: '{"rows":4000}',
      checkpoint:
        '输出 plain_bytes>slots_bytes、plain_peak>slots_peak、dict_absent=True 和 checkpoint=memory-slots-tracemalloc-ok。',
      code: `import gc
import json
import sys
import tracemalloc


class PlainOrder:
    def __init__(self, order_id, amount):
        self.order_id = order_id
        self.amount = amount


class SlotOrder:
    __slots__ = ("order_id", "amount")

    def __init__(self, order_id, amount):
        self.order_id = order_id
        self.amount = amount


def allocation_peak(cls, count):
    gc.collect()
    tracemalloc.start()
    rows = [cls(f"O-{index}", index) for index in range(count)]
    current, peak = tracemalloc.get_traced_memory()
    assert len(rows) == count
    del rows
    tracemalloc.stop()
    gc.collect()
    return current, peak


payload = json.loads(sys.stdin.read())
plain_bytes, plain_peak = allocation_peak(PlainOrder, payload["rows"])
slots_bytes, slots_peak = allocation_peak(SlotOrder, payload["rows"])
assert slots_bytes < plain_bytes
assert slots_peak < plain_peak
assert not hasattr(SlotOrder("X", 1), "__dict__")
print(f"plain_bytes={plain_bytes}")
print(f"slots_bytes={slots_bytes}")
print(f"plain_peak={plain_peak}")
print(f"slots_peak={slots_peak}")
print("dict_absent=True")
print("checkpoint=memory-slots-tracemalloc-ok")`,
    }),
  ),

  'programming:Python · CPython、性能与生产部署：GIL、自由线程与进程并发': lab(
    'Python 进阶代码台 13 · GIL 能力探测与同步边界',
    '先读取当前解释器的 GIL/自由线程构建能力，再运行真实线程池 IO 任务与加锁计数器。标准构建不会被伪装成 free-threaded 版本。',
    'https://docs.python.org/3/library/sys.html#sys._is_gil_enabled',
    task({
      id: 'python-advanced-gil-runtime-guided',
      title: '跟做：按运行时能力选择并发模型',
      brief:
        '读取 sysconfig 的 Py_GIL_DISABLED，若解释器提供 _is_gil_enabled 则调用；随后用线程池运行 IO 型任务并验证结果顺序。',
      stdin:
        '{"delay":0.02,"jobs":["read-orders","read-users","read-inventory"],"workers":3}',
      checkpoint:
        '输出 gil_reported=True、free_threaded_build=False、results=3、mode=threads-for-io 和 checkpoint=gil-runtime-selection-ok。你的解释器若不同，能力字段应如实变化。',
      code: `import concurrent.futures
import json
import sys
import sysconfig
import time


def runtime_facts():
    free_threaded_build = bool(sysconfig.get_config_var("Py_GIL_DISABLED"))
    gil_detector = getattr(sys, "_is_gil_enabled", None)
    gil_enabled = gil_detector() if gil_detector is not None else None
    return free_threaded_build, gil_enabled


def io_job(name, delay):
    time.sleep(delay)
    return name


payload = json.loads(sys.stdin.read())
free_threaded_build, gil_enabled = runtime_facts()
with concurrent.futures.ThreadPoolExecutor(
    max_workers=payload["workers"]
) as executor:
    futures = [
        executor.submit(io_job, name, payload["delay"])
        for name in payload["jobs"]
    ]
    results = [future.result(timeout=2) for future in futures]

assert results == payload["jobs"]
assert gil_enabled is not False or free_threaded_build
print(f"version={sys.version_info.major}.{sys.version_info.minor}")
print(f"gil_reported={gil_enabled}")
print(f"free_threaded_build={free_threaded_build}")
print(f"results={len(results)}")
print("mode=threads-for-io")
print("checkpoint=gil-runtime-selection-ok")`,
    }),
    task({
      id: 'python-advanced-free-threading-lock-independent',
      title: '独立实践：锁保护共享计数器',
      brief:
        '多个线程在 Barrier 后同时递增共享计数器。使用 Lock 保证线性一致，并输出当前构建能力；这证明同步协议，不冒充自由线程压力测试。',
      stdin: '{"workers":4,"iterations":500}',
      checkpoint:
        '输出 counter=2000、workers=4、lock_held=True、free_threaded_build=False 和 checkpoint=free-threading-lock-boundary-ok。能力字段允许随解释器变化。',
      code: `import concurrent.futures
import json
import sys
import sysconfig
import threading


payload = json.loads(sys.stdin.read())
counter = 0
lock = threading.Lock()
barrier = threading.Barrier(payload["workers"])


def worker():
    global counter
    barrier.wait()
    for _ in range(payload["iterations"]):
        with lock:
            counter += 1
    return threading.current_thread().name


with concurrent.futures.ThreadPoolExecutor(
    max_workers=payload["workers"]
) as executor:
    names = list(executor.map(lambda _: worker(), range(payload["workers"])))

expected = payload["workers"] * payload["iterations"]
free_threaded_build = bool(sysconfig.get_config_var("Py_GIL_DISABLED"))
assert counter == expected
assert len(names) == payload["workers"]
assert lock.locked() is False
print(f"counter={counter}")
print(f"workers={len(names)}")
print(f"lock_held={lock.locked()}")
print(f"free_threaded_build={free_threaded_build}")
print("checkpoint=free-threading-lock-boundary-ok")`,
    }),
  ),

  'programming:Python · CPython、性能与生产部署：Uvicorn/Gunicorn、worker 和优雅停机':
    lab(
      'Python 进阶代码台 14 · worker 生命周期与优雅停机契约',
      'Uvicorn/Gunicorn 未安装，本代码台用状态机模拟 readiness、容量、draining、在途请求排空和滚动发布。',
      'https://docs.gunicorn.org/en/stable/signals.html',
      task({
        id: 'python-advanced-worker-drain-guided',
        title: '跟做：draining worker 不再接新请求',
        brief:
          '启动三个 worker，每个容量 1。健康检查先通过；进入 draining 后 readiness 变 False、新请求被拒绝，在途请求结束后 worker 才能停止。',
        stdin: '{"workers":3,"requests":5}',
        checkpoint:
          '输出 admitted=3、rejected=2、ready_during_drain=False、stopped=3 和 checkpoint=worker-drain-contract-ok。',
        code: `import json
import sys
from dataclasses import dataclass


@dataclass
class Worker:
    worker_id: int
    state: str = "ready"
    active: int = 0

    @property
    def ready(self):
        return self.state == "ready"

    def admit(self):
        if not self.ready or self.active >= 1:
            return False
        self.active += 1
        return True

    def finish(self):
        if self.active:
            self.active -= 1

    def begin_drain(self):
        self.state = "draining"

    def stop_if_idle(self):
        if self.state == "draining" and self.active == 0:
            self.state = "stopped"


payload = json.loads(sys.stdin.read())
workers = [Worker(index) for index in range(payload["workers"])]
admitted = 0
rejected = 0
for _ in range(payload["requests"]):
    target = next((worker for worker in workers if worker.admit()), None)
    if target is None:
        rejected += 1
    else:
        admitted += 1

for worker in workers:
    worker.begin_drain()
ready_during_drain = any(worker.ready for worker in workers)
new_admission_during_drain = any(worker.admit() for worker in workers)
for worker in workers:
    worker.finish()
    worker.stop_if_idle()

assert admitted == 3
assert rejected == 2
assert not ready_during_drain
assert not new_admission_during_drain
assert all(worker.state == "stopped" for worker in workers)
print(f"admitted={admitted}")
print(f"rejected={rejected}")
print(f"ready_during_drain={ready_during_drain}")
print(f"stopped={sum(worker.state == 'stopped' for worker in workers)}")
print("checkpoint=worker-drain-contract-ok")`,
      }),
      task({
        id: 'python-advanced-rolling-deploy-independent',
        title: '独立实践：滚动发布不接收未就绪实例',
        brief:
          '旧池承担全部流量，新池先只有启动中实例，路由不得命中；等新实例就绪、旧池 draining 后切流，整个过程不应出现 503。',
        stdin: '{"old_workers":2,"new_workers":2,"requests":6}',
        checkpoint:
          '输出 startup_rejected>=1、served=6、failures=0、old_state=draining、new_state=ready 和 checkpoint=rolling-deploy-contract-ok。',
        code: `import json
import sys
from itertools import cycle


class Worker:
    def __init__(self, version, ready):
        self.version = version
        self.ready = ready
        self.state = "ready" if ready else "starting"

    def serve(self):
        return self.version if self.ready else None


payload = json.loads(sys.stdin.read())
old = [Worker("1.0", True) for _ in range(payload["old_workers"])]
new = [Worker("1.1", False) for _ in range(payload["new_workers"])]
served = []
failures = 0
startup_rejected = 0

for _ in range(payload["requests"]):
    candidate = next(cycle(old))
    version = candidate.serve()
    if version is None:
        startup_rejected += 1
        failures += 1
    else:
        served.append(version)

if not new:
    startup_rejected += 1
else:
    startup_rejected += sum(1 for worker in new if not worker.ready)
for worker in new:
    worker.ready = True
    worker.state = "ready"
for worker in old:
    worker.ready = False
    worker.state = "draining"

pool = new
for _ in range(payload["requests"]):
    worker = pool[len(served) % len(pool)]
    version = worker.serve()
    if version is None:
        failures += 1
    else:
        served.append(version)

assert startup_rejected >= 1
assert served == ["1.0"] * payload["requests"] + ["1.1"] * payload["requests"]
assert failures == 0
assert old[0].state == "draining"
assert all(worker.state == "ready" for worker in new)
print(f"startup_rejected={startup_rejected}")
print(f"served={len(served)}")
print(f"failures={failures}")
print(f"old_state={old[0].state}")
print(f"new_state={new[0].state}")
print("checkpoint=rolling-deploy-contract-ok")`,
      }),
    ),

  'programming:Python · CPython、性能与生产部署：Python 企业服务毕业项目与运行手册':
    lab(
      'Python 进阶代码台 15 · 企业服务闭环与回滚演练',
      '用标准库完成订单落库、outbox 幂等发布、健康门禁和版本回滚演练。第三方消息系统与部署平台均由明确的内存适配器模拟。',
      'https://docs.python.org/3/library/sqlite3.html',
      task({
        id: 'python-advanced-graduation-outbox-guided',
        title: '跟做：订单状态与 outbox 同一事务',
        brief:
          '订单支付和 outbox 事件插入必须原子提交；同一幂等键重放返回 duplicate 且不产生第二次业务副作用。',
        stdin:
          '{"order_id":"O-9","amount":4999,"idempotency":"ship-9","p95_ms":420,"error_rate":0.002,"budget_ms":500}',
        checkpoint:
          '输出 order=paid、outbox=1、duplicate=True、gate=pass 和 checkpoint=graduation-outbox-ok。',
        code: `import json
import sqlite3
import sys


payload = json.loads(sys.stdin.read())
connection = sqlite3.connect(":memory:")
connection.executescript(
    """
    CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        state TEXT NOT NULL
    );
    CREATE TABLE outbox (
        idempotency_key TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        event_type TEXT NOT NULL
    );
    """
)
connection.execute(
    "INSERT INTO orders (id, amount, state) VALUES (?, ?, 'pending')",
    (payload["order_id"], payload["amount"]),
)
connection.commit()


def pay_and_publish(order_id, idempotency, amount):
    with connection:
        if amount != 4999:
            raise ValueError("amount mismatch")
        current = connection.execute(
            "SELECT state FROM orders WHERE id = ?", (order_id,)
        ).fetchone()
        if current is None:
            raise LookupError("order missing")
        if current[0] == "paid":
            return True
        connection.execute(
            "UPDATE orders SET state = 'paid' WHERE id = ?", (order_id,)
        )
        connection.execute(
            "INSERT INTO outbox (idempotency_key, order_id, event_type) VALUES (?, ?, ?)",
            (idempotency, order_id, "order.paid"),
        )
        return False


first_duplicate = pay_and_publish(
    payload["order_id"], payload["idempotency"], payload["amount"]
)
second_duplicate = pay_and_publish(
    payload["order_id"], payload["idempotency"], payload["amount"]
)
state = connection.execute(
    "SELECT state FROM orders WHERE id = ?", (payload["order_id"],)
).fetchone()[0]
outbox = connection.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
gate = (
    payload["p95_ms"] <= payload["budget_ms"]
    and payload["error_rate"] < 0.005
    and state == "paid"
    and outbox == 1
)

assert first_duplicate is False
assert second_duplicate is True
assert state == "paid"
assert outbox == 1
assert gate
print(f"order={state}")
print(f"outbox={outbox}")
print(f"duplicate={second_duplicate}")
print("gate=pass")
print("checkpoint=graduation-outbox-ok")
connection.close()`,
      }),
      task({
        id: 'python-advanced-graduation-rollback-independent',
        title: '独立实践：指标越线触发版本回滚',
        brief:
          '发布 2.4.0 后读取 p95 与错误率；超过预算时按运行手册执行冻结、切回 2.3.1、校验数据总量并记录证据。',
        stdin:
          '{"new_version":"2.4.0","previous_version":"2.3.1","p95_ms":820,"budget_ms":500,"error_rate":0.004,"error_budget":0.005}',
        checkpoint:
          '输出 active=2.3.1、rollback=True、data_preserved=True、runbook=freeze,rollback,verify,record 和 checkpoint=graduation-rollback-ok。',
        code: `import json
import sys
from dataclasses import dataclass, field


@dataclass
class Deployment:
    active_version: str
    ledger: list = field(default_factory=list)
    state: str = "released"
    evidence: list = field(default_factory=list)

    def deploy(self, version):
        self.active_version = version
        self.state = "canary"
        self.evidence.append(f"deploy:{version}")

    def metric_gate(self, p95_ms, budget_ms, error_rate, error_budget):
        return p95_ms <= budget_ms and error_rate <= error_budget

    def rollback(self, previous):
        self.evidence.append("freeze")
        self.active_version = previous
        self.state = "rolled-back"
        self.evidence.append("rollback")

    def verify_data(self):
        total = sum(item["amount"] for item in self.ledger)
        self.evidence.append("verify")
        return total

    def record(self):
        self.evidence.append("record")


payload = json.loads(sys.stdin.read())
deployment = Deployment(payload["previous_version"])
deployment.ledger.extend(
    [
        {"id": "O-1", "amount": 1999},
        {"id": "O-2", "amount": 3000},
    ]
)
total_before = sum(item["amount"] for item in deployment.ledger)
deployment.deploy(payload["new_version"])
healthy = deployment.metric_gate(
    payload["p95_ms"],
    payload["budget_ms"],
    payload["error_rate"],
    payload["error_budget"],
)
rollback = not healthy
if rollback:
    deployment.rollback(payload["previous_version"])
total_after = deployment.verify_data()
deployment.record()

assert rollback
assert deployment.active_version == payload["previous_version"]
assert total_after == total_before == 4999
assert deployment.state == "rolled-back"
assert deployment.evidence == [
    f"deploy:{payload['new_version']}",
    "freeze",
    "rollback",
    "verify",
    "record",
]
print(f"active={deployment.active_version}")
print(f"rollback={rollback}")
print(f"data_preserved={total_before == total_after}")
print("runbook=" + ",".join(deployment.evidence[1:]))
print("checkpoint=graduation-rollback-ok")`,
      }),
    ),
};
