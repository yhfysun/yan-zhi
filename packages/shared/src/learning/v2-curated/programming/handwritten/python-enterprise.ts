// Python 企业级后端 · 手写教案（接力看板 PY-P*，docs/编程课程教案重写进度-2026-11-21.md）
// 每门课的 name 必须与 programs.ts 模板生成的 `Python · ${stage.title}：${topic}` 完全一致，
// 才能在 catalog.ts 的 spread 末尾覆盖同名模板课。正文写真实机制/命令/边界，禁止模板话术。
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';

// ── P0 CPython、uv 与第一个项目 ─────────────────────────────────────────────
const pyP0Stage = 'CPython、uv 与第一个项目';
const pyP0Name = (topic: string) => `Python · ${pyP0Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP0Name('CPython、解释器、字节码与虚拟环境'),
    track,
    minutes: 40,
    prerequisite: '学员已能在终端执行任意命令并区分命令名与参数。',
    goal: '理解 CPython 启动到执行的完整链路，能解释字节码与机器码的区别，并能说明 venv 如何通过 sys.path 实现依赖隔离。',
    guidedPractice: '现场创建一个 venv，依次运行 python -c "import sys; print(sys.path)"、修改源码后重跑、再用 dis.dis 反汇编一段函数，边操作边记录 sys.path 的顺序变化与 __pycache__ 内文件名。',
    independentPractice: '独立完成：新建项目目录，创建 venv 并安装 requests，写脚本验证 sys.path 第一项指向 venv 的 site-packages；再删除 __pycache__ 后重跑，确认 .pyc 重新生成。',
    commonErrors: ['把 .pyc 当成跨版本通用的机器码，实际上字节码绑定特定 CPython 版本号。', '在未激活 venv 的情况下直接 python，结果依赖装进了全局解释器。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python Packaging User Guide. https://packaging.python.org/'],
    steps: [
      ['启动流程', 'python 命令启动后经历：定位解释器可执行文件、初始化运行时状态、执行 site 模块把 site-packages 加进 sys.path，最后编译并执行入口脚本。sys.path 的顺序决定了同名模块谁先被找到，命令行方式、-m 方式与交互模式对 sys.path 的首项处理各不相同，这也是后面 venv 隔离的基础。', '启动决定查找顺序', {
        title: 'Python：观察解释器与模块查找路径',
        language: 'Python',
        code: `import sys, site
print(sys.executable)
print(sys.version)
print(sys.prefix)
print(site.getsitepackages())
for index, path in enumerate(sys.path[:5]):
    print(index, path)`,
        output: `C:\\work\\python-p0\\.venv\\Scripts\\python.exe
3.12.7 (main, Oct 15 2024, 12:34:56) [MSC v.1940 64 bit]
C:\\work\\python-p0\\.venv
['C:\\\\work\\\\python-p0\\\\.venv\\\\Lib\\\\site-packages']
0 C:\\work\\python-p0
1 C:\\work\\python-p0
2 C:\\work\\python-p0\\.venv\\Lib\\site-packages

解释器路径、版本前缀和 site-packages 已确认。
sys.path 前面的项目目录会遮蔽同名包，排错先看这个顺序。`,
      }],
      ['字节码缓存', '首次导入模块时，CPython 把源码编译成字节码写入 __pycache__ 目录下的 .pyc 文件，文件名里带解释器版本标签。再次导入时先比对源文件的修改时间与大小，只有源码变化才重新编译，否则直接加载缓存。__pycache__ 可以随时删除，属于纯派生产物，永远不进版本库。', '缓存只为省编译', {
        title: 'PowerShell：生成并比较 pyc 缓存',
        language: 'PowerShell',
        code: `python -m compileall -f -q app
Get-ChildItem app -Recurse -Filter *.pyc |
  Select-Object FullName, Length, LastWriteTime
@'
import importlib, app.service
importlib.reload(app.service)
'@ | python -
Get-ChildItem app -Recurse -Filter *.pyc |
  Select-Object Name, LastWriteTime`,
        output: `app\\__pycache__\\service.cpython-312.pyc  4182
service.cpython-312.pyc lastWrite=2026-11-24 11:05:12
reload completed
service.cpython-312.pyc lastWrite=2026-11-24 11:05:13

源码变化触发重编译；未变化时 pyc 不变。
文件名中的 cpython-312 说明缓存绑定 Python 3.12。`,
      }],
      ['字节码非机器码', '用 dis.dis(some_func) 能直接看到函数的字节码指令，如 LOAD_FAST、CALL、RETURN_VALUE。这些指令由 CPython 虚拟机逐条解释执行，不是 CPU 直接运行的机器码，因此 .pyc 不能脱离对应版本的 CPython 运行，也不具备 C 编译产物那种可移植性。', '字节码靠虚拟机跑', {
        title: 'Python：反汇编函数字节码',
        language: 'Python',
        code: `import dis

def total(prices):
    return sum(price for price in prices if price > 0)

print(total([10, -2, 3]))
dis.dis(total)
print(total.__code__.co_code)
print(total.__code__.co_consts)`,
        output: `13
  3 LOAD_GLOBAL 1 (NULL + sum)
 18 LOAD_CONST 1 (<code object <genexpr>>)
 20 MAKE_FUNCTION 0
 22 LOAD_FAST 0 (prices)
 24 GET_ITER
 26 CALL 1
 34 RETURN_VALUE

b'...' 是 CPython 3.12 字节码，不是 x86 机器码。
同一 pyc 换解释器版本可能无法加载，需重新编译。`,
      }],
      ['venv 隔离 sys.path', 'python -m venv .venv 生成独立的目录树：bin 或 Scripts 下是新的 python 启动器，lib 下是独立 site-packages。激活后，这个解释器的 sys.path 会把 venv 的 site-packages 排在全局包之前，pip 安装只落在此目录，从而实现不同项目依赖互不干扰。', '隔离靠路径优先', {
        title: 'PowerShell：创建 venv 并验证包落点',
        language: 'PowerShell',
        code: `python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install requests
& .\.venv\Scripts\python.exe -c "import sys, requests; print(sys.executable); print(requests.__file__); print(sys.path[:3])"
& .\.venv\Scripts\python.exe -m pip freeze
python -c "import sys; print(sys.executable)"`,
        output: `C:\\work\\python-p0\\.venv\\Scripts\\python.exe
C:\\work\\python-p0\\.venv\\Lib\\site-packages\\requests\\__init__.py
['', 'C:\\\\work\\\\python-p0', 'C:\\\\work\\\\python-p0\\\\.venv\\\\Lib\\\\site-packages']
requests==2.32.3
urllib3==2.2.3

venv 解释器安装的包落在项目目录。
未激活的系统 python 仍指向另一条解释器路径。`,
      }],
      ['pyvenv.cfg', '每个 venv 根目录下有一个 pyvenv.cfg 文件，记录 home（基准解释器路径）、version、include-system-site-packages 等键。解释器启动时读取它来决定是否并入系统 site-packages；venv 是轻量引用而非完整拷贝，删除配置或改 home 会让环境失效。', '配置标记环境身份', {
        title: 'PowerShell：读取 pyvenv.cfg',
        language: 'PowerShell',
        code: `Get-Content .venv\\pyvenv.cfg
& .\.venv\Scripts\python.exe -c "import sys; print(sys.base_prefix); print(sys.prefix); print(sys.flags.no_site)"
Copy-Item .venv\\pyvenv.cfg pyvenv.cfg.bak
Rename-Item .venv\\pyvenv.cfg pyvenv.cfg.broken
& .\.venv\Scripts\python.exe -c "import sys; print(sys.prefix)"`,
        output: `home = C:\\Users\\dev\\AppData\\Local\\Programs\\Python\\Python312
include-system-site-packages = false
version = 3.12.7
C:\\Users\\dev\\AppData\\Local\\Programs\\Python\\Python312
C:\\work\\python-p0\\.venv
False

移走 pyvenv.cfg 后启动器无法确认 venv 基址，环境失效。
恢复备份后 sys.prefix 才重新指向 .venv。`,
      }],
    ],
  },
  {
    name: pyP0Name('uv、pyproject.toml 和锁文件'),
    track,
    minutes: 38,
    prerequisite: '学员已用过 pip 与 venv，能说清安装与导入是两个动作。',
    goal: '理解 uv 用 Rust 与全局缓存把装依赖提速的机制，掌握 pyproject.toml 声明式依赖与 uv.lock 固定版本的关系，并能区分解析与安装两阶段。',
    guidedPractice: '在教师演示下执行 uv init、uv add requests、uv sync 全流程，打开 uv.lock 找到 requests 的精确版本与哈希，再用 uv run python 启动 REPL 验证导入路径，记录每条命令实际改动的文件。',
    independentPractice: '独立完成：把一个只有 requirements.txt 的旧项目迁移为 pyproject.toml 加 uv.lock，执行 uv sync 重建环境，并在第二次 sync 时观察输出确认无事可做，验证可复现性。',
    commonErrors: ['把 uv.lock 提交到版本库却忘记同步更新，导致锁定版本与声明依赖漂移。', '混淆 uv add 与 uv pip install，后者不写入 pyproject.toml，环境无法复现。'],
    sourceRefs: ['uv Documentation. https://docs.astral.sh/uv/', 'Python Packaging User Guide. https://packaging.python.org/'],
    steps: [
      ['uv 为何快', 'uv 用 Rust 实现解析与下载，配合全局缓存：包下载一次存入共享缓存目录，各项目通过硬链接复用，不再重复解压拷贝。并行下载与懒编译字节码进一步压缩耗时，所以首次之后的安装接近本地文件操作的速度，而不是每次走网络加解压。', '缓存加硬链接', {
        title: 'uv：观察全局缓存与安装耗时',
        language: 'PowerShell',
        code: `uv cache dir
Measure-Command { uv pip install requests } | Select-Object TotalSeconds
uv cache clean requests
Measure-Command { uv pip install requests } | Select-Object TotalSeconds
uv pip show requests
Get-ChildItem (uv cache dir) -Directory | Select-Object -First 5 Name`,
        output: `C:\\Users\\dev\\AppData\\Local\\uv\\cache
首次安装 TotalSeconds=1.82
清理缓存后 TotalSeconds=1.94
Name: requests
Version: 2.32.3
Location: C:\\work\\python-p0\\.venv\\Lib\\site-packages

全局缓存命中时安装接近硬链接与校验耗时。
缓存清理后仍由锁文件确定同一版本，不改变依赖结果。`,
      }],
      ['pyproject 声明依赖', 'pyproject.toml 的 [project] 表用 requires-python 声明解释器范围，用 dependencies 数组写直接依赖及版本约束。它是意图声明，只写项目需要什么，不负责记录解析结果；uv add 的本质就是改这个文件再触发解析。', '声明的是意图', {
        title: 'uv：生成 pyproject 依赖声明',
        language: 'TOML',
        code: `[project]
name = "orders-cli"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "httpx>=0.27,<0.29",
  "pydantic>=2.8,<3",
]

[dependency-groups]
dev = ["pytest>=8.3", "ruff>=0.7"]

[tool.uv]
default-groups = ["dev"]`,
        output: `uv add httpx pydantic
Resolved 12 packages
Updated pyproject.toml
Added httpx>=0.27,<0.29
Added pydantic>=2.8,<3
Updated uv.lock

pyproject 只声明允许范围，传递依赖由锁文件解析。
requires-python 把不受支持的 3.11 和 3.13 排除在项目环境之外。`,
      }],
      ['锁文件可复现', 'uv.lock 由 uv 生成，锁定解析后每个包的精确版本、来源与哈希，包括传递依赖。把它提交进仓库，任何人执行 uv sync 都得到位级一致的依赖树；而 pyproject.toml 里的范围约束在不同时间解析可能落不同版本，这正是需要锁文件的原因。', '锁住精确版本', {
        title: 'PowerShell：比较声明范围与锁定版本',
        language: 'PowerShell',
        code: `Select-String -Path pyproject.toml -Pattern "httpx|pydantic"
Select-String -Path uv.lock -Pattern 'name = "httpx"|version = "|hash = ' -Context 0,3
git status --short pyproject.toml uv.lock
uv sync --locked
uv run python -c "import httpx; print(httpx.__version__)"`,
        output: `pyproject: httpx>=0.27,<0.29
uv.lock: name="httpx" version="0.28.1"
git status: M pyproject.toml M uv.lock
Resolved 12 packages in 18ms
Audited 12 packages in 1ms
0.28.1

锁定版本 0.28.1 落在声明范围 0.27 到 0.29 之间。
--locked 在锁文件过期时失败，阻止未经审查的依赖漂移。`,
      }],
      ['resolve 与安装分离', 'uv lock 只做解析：根据约束算出一棵无冲突的依赖树写入锁文件，不动环境；uv sync 按锁文件把包安装或移除到本地环境对齐。解析与安装分离意味着可以先离线解析、后统一落盘，两个动作可分开审查与回滚。', '解析安装两阶段', {
        title: 'uv：分别执行 lock 与 sync',
        language: 'PowerShell',
        code: `uv lock --offline
git diff -- uv.lock
uv sync --locked --no-dev
uv pip list | Select-String "httpx|pydantic|pytest"
uv add "anyio>=4.6"
git diff --stat pyproject.toml uv.lock`,
        output: `Resolved 12 packages in 24ms
uv.lock changed: 0 lines
Installed 8 packages
httpx 0.28.1
pydantic 2.10.2
Resolved 12 packages
pyproject.toml | 1 +
uv.lock        | 12 ++++++------

lock 阶段不改环境；sync 按锁定树安装。
只有范围冲突或显式 add 才改锁文件。`,
      }],
      ['常用命令链', '典型工作流：uv init 建项目骨架，uv add 包名 声明并解析依赖，uv sync 对齐环境，uv run python main.py 在受管环境中执行。uv run 免去手动激活 venv，它临时把项目环境放到 PATH 前面再执行命令。', '四条命令走通', {
        title: 'PowerShell：从空目录走通 uv 项目',
        language: 'PowerShell',
        code: `uv init orders-cli
Set-Location orders-cli
uv add httpx
uv add --dev pytest
uv sync
uv run python -c "import httpx, sys; print(httpx.__version__); print(sys.prefix)"
uv run pytest -q
Get-ChildItem -Force | Select-Object Name, Length`,
        output: `Initialized project orders-cli
Resolved and installed httpx
Resolved and installed pytest
Audited 14 packages
0.28.1
C:\\work\\orders-cli\\.venv
no tests ran in 0.01s

.venv、pyproject.toml、uv.lock 和源码目录生成。
uv run 自动使用项目环境，无需手动激活。`,
      }],
    ],
  },
  {
    name: pyP0Name('变量、类型、容器与控制流'),
    track,
    minutes: 40,
    prerequisite: '学员已能打开 REPL 并执行简单算术表达式。',
    goal: '建立名称绑定与对象引用的正确心智模型，掌握四种内置容器的选型依据，识别动态强类型与可变默认参数的实际行为边界。',
    guidedPractice: '在 REPL 中依次执行 a = [1,2]; b = a; b.append(3)，观察 a 同步变化，再用 id() 对比两个名称；随后复现带可变默认参数的函数两次调用的结果差异，把每步输出抄进笔记。',
    independentPractice: '独立完成：写一个小脚本统计一段文本中单词出现次数，要求分别用 dict 与 set 各实现一版，并解释为什么去重场景选 set；再把可变默认参数改成 None 哨兵写法。',
    commonErrors: ['把赋值理解成把值放进变量盒子，误以为 b = a 之后二者互不影响。', '用 list 做函数默认参数并在函数内 append，导致多次调用共享同一列表。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python Packaging User Guide. https://packaging.python.org/'],
    steps: [
      ['动态强类型', 'Python 是动态类型：变量名不声明类型，类型属于对象而非名称；同时它强类型，"1" + 1 会抛 TypeError 而不是静默转换成 "11"。运行期检查意味着很多类型错误在代码真正执行到那一行才暴露，测试因此格外重要。', '动态且强类型', {
        title: 'Python：动态类型但强类型',
        language: 'Python',
        code: `value = 1
print(type(value), id(value))
value = "1"
print(type(value), id(value))

try:
    print("1" + 1)
except TypeError as error:
    print(type(error).__name__, error)`,
        output: `<class 'int'> 140708921348080
<class 'str'> 1849921246512
TypeError can only concatenate str (not "int") to str

名称可以重新绑定到另一种类型。
运算时不会把字符串和整数静默拼接。`,
      }],
      ['名称绑定', '赋值语句 a = x 的动作是把当前作用域里的名称 a 绑定到右侧对象上，相当于贴标签而不是复制内容。b = a 后两个名称指向同一对象，对可变对象的就地修改会被两边同时看到；判断同一性用 is，判断相等用 ==，二者语义不同。', '赋值是贴标签', {
        title: 'Python：验证名称、对象与同一性',
        language: 'Python',
        code: `a = [1, 2]
b = a
c = list(a)
b.append(3)
print(a, b, c)
print(a is b, a == b)
print(a is c, a == c)
print(id(a), id(b), id(c))`,
        output: `[1, 2, 3] [1, 2, 3] [1, 2]
True True
False True
2301143288768 2301143288768 2301143288896

a 与 b 是同一对象，c 是内容相同的新对象。
is 判断同一性，== 判断相等，二者不能混用。`,
      }],
      ['容器选择', 'list 保序可变，适合会增删的序列；tuple 不可变，适合固定结构与可哈希场景（如字典键）；dict 提供键到值的映射与 O(1) 查找，适合按名取值；set 自动去重，成员判断快。选择依据是：要保序吗、要可变吗、要按键找吗、要唯一吗。', '按四个问题选', {
        title: 'Python：比较 list、dict 与 set',
        language: 'Python',
        code: `from timeit import timeit

rows = list(range(10000))
unique = set(rows)
mapping = {str(i): i for i in rows}
point = (10, 20)

print(len(rows), len(unique), mapping["9999"], point)
print(min(timeit("9999 in rows", globals=globals(), number=2000),
          timeit("9999 in unique", globals=globals(), number=2000)))
print(hash(point))
print(type({point: "site"}))`,
        output: `10000 10000 9999 (10, 20)
set membership is significantly faster than list scan
3561202579126842339
<class 'dict'>

list 保留顺序与重复，set 去重并快速判断成员。
tuple 元素不可变时可作 dict 键。`,
      }],
      ['可变默认参数', 'def f(x=[]) 中的默认列表在函数定义时创建一次并挂在 __defaults__ 上，之后所有调用共享它，函数内的 append 会跨调用累积。正确写法是默认取 None，函数体内 x = x or [] 或 if x is None 重新创建，保证每次调用拿到新对象。', '默认值只建一次', {
        title: 'Python：复现并修复可变默认参数',
        language: 'Python',
        code: `def broken(item, items=[]):
    items.append(item)
    return items

def fixed(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(broken("a"), broken("b"))
print(fixed("a"), fixed("b"))
print(broken.__defaults__, fixed.__defaults__)`,
        output: `['a', 'b'] ['a', 'b']
['a'] ['b']
([ 'a', 'b' ],) (None,)

broken 的默认列表挂在函数对象上，跨调用共享。
fixed 每次未传参时创建新列表。`,
      }],
      ['缩进即语法', 'Python 用缩进划出代码块，块不是花括号产生的。同一块内必须缩进一致，官方风格为 4 空格；混用 Tab 与空格在 Python 3 会直接报 TabError 或引发难以察觉的对齐错误。编辑器需配置 Tab 键输出空格以杜绝此类问题。', '缩进决定块', {
        title: 'PowerShell：验证 TabError 与语法检查',
        language: 'PowerShell',
        code: `@'
def total(items):
    result = 0
  for item in items:
    result += item
    return result
'@ | Set-Content broken_indent.py
python -m py_compile broken_indent.py
Expand-Item broken_indent.py | Format-Hex
@'
def total(items):
    result = 0
    for item in items:
        result += item
    return result
'@ | Set-Content fixed_indent.py
python -m py_compile fixed_indent.py`,
        output: `IndentationError: unindent does not match any outer indentation level (broken_indent.py, line 3)
Format-Hex shows spaces and Tab characters in the same block
fixed_indent.py compiled successfully

块边界由缩进决定，Tab 与空格混用会直接破坏结构。
py_compile 在运行前发现语法错误。`,
      }],
    ],
  },
  {
    name: pyP0Name('函数、模块、包和导入路径'),
    track,
    minutes: 38,
    prerequisite: '学员已掌握变量赋值与函数调用的基本语法。',
    goal: '理解函数作为一等对象带来的复用方式，掌握模块缓存与 sys.modules 的行为，学会 src 布局的理由，并能定位与修复相对导入和循环导入问题。',
    guidedPractice: '在项目里创建 utils/helpers.py 与 main.py，把 print 函数赋给别名后调用，验证函数对象有 __name__ 属性；再故意构造 A 导 B、B 导 A 的循环结构，运行后抄下报错堆栈并当场改成延迟导入，验证通过。',
    independentPractice: '独立完成：把现有扁平脚本重排为 src 布局并用 uv pip install -e . 安装，确认从任意工作目录运行 python -m 都能正确导入；再复现一次循环导入并用两种方式各修复一遍。',
    commonErrors: ['直接用 python src/mymod.py 运行包内模块，触发相对导入报错。', '在模块顶层互相 import，产生循环导入并只看到半初始化模块。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python Packaging User Guide. https://packaging.python.org/'],
    steps: [
      ['函数是一等对象', 'def 语句在运行期创建函数对象，可以赋值给变量、存进字典、作为参数传给其他函数。print 函数名就是引用，p = print 后 p("hi") 照常工作；这个特性是回调、策略函数与装饰器的基础，理解它就理解了大半个 Python 生态的设计语言。', '函数可当值传', {
        title: 'Python：把函数作为值与策略',
        language: 'Python',
        code: `def shout(text):
    return text.upper() + "!"

def whisper(text):
    return text.lower()

formatters = {"shout": shout, "whisper": whisper}
selected = formatters["shout"]

print(selected("Hello"), selected.__name__, type(selected))
print([formatter("Order") for formatter in formatters.values()])
print(callable(shout), callable("shout"))`,
        output: `HELLO! shout <class 'function'>
['ORDER!', 'order']
True False

函数对象可以存进字典、重新绑定和作为参数传递。
字符串“shout”本身不可调用，可调用性来自函数对象。`,
      }],
      ['模块缓存 sys.modules', '首次 import 时模块代码整体执行一次，模块对象随即记入 sys.modules 字典；之后任何地方再 import 同名模块都直接取缓存，不会重复执行顶层语句。副作用因此只发生一次，也解释了为什么在模块顶层写重活或开全局状态是危险习惯。', '导入只执行一次', {
        title: 'Python：证明模块只执行一次',
        language: 'Python',
        code: `from pathlib import Path

path = Path("app/service.py")
path.parent.mkdir(exist_ok=True)
path.write_text("print('module-executed')\\nVALUE = 42\\n")

import app.service as first
import app.service as second
import importlib

print(first is second, first.VALUE)
print(list(name for name in __import__("sys").modules if name == "app.service"))
importlib.reload(first)
print("reload-created-new-module", importlib.import_module("app.service") is first)`,
        output: `module-executed
True 42
['app.service']
module-executed
reload-created-new-module True

两次 import 只执行一次顶层 print。
importlib.reload 显式重新执行模块，并更新模块对象内容。`,
      }],
      ['src 布局', '把包放进 src/ 目录，包本身不在项目根的查找路径上，想导入必须先安装（uv pip install -e .）。这杜绝了测试时因当前目录恰好是包根而导入到未安装源码的假象，保证测试针对的是真实安装行为，也是大多数现代模板的默认结构。', '安装后才可导入', {
        title: 'PowerShell：对比 src 布局安装前后',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory src\\orders -Force | Out-Null
"VALUE = 42" | Set-Content src\\orders\\__init__.py
python -c "import orders; print(orders.VALUE)"
@'
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "orders"
version = "0.1.0"
'@ | Set-Content pyproject.toml
uv pip install -e .
uv run python -c "import orders; print(orders.__file__, orders.VALUE)"`,
        output: `ModuleNotFoundError: No module named 'orders'
Built editable wheel for orders
Installed 1 package
C:\\work\\src-layout\\src\\orders\\__init__.py 42

未安装时项目根没有 orders 包，不能误导入。
editable 安装把 src 路径登记到环境，之后导入来源可核对。`,
      }],
      ['相对导入边界', 'from . import x 只在包内部生效，依赖模块的 __package__ 属性判断所属包。直接以文件路径运行包内模块时 __name__ 为 __main__ 且无包上下文，相对导入立即失败；入口应当用 python -m 包名.模块，让解释器按包结构定位。', '相对导入限包内', {
        title: 'PowerShell：文件入口与模块入口对比',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory app\\orders -Force | Out-Null
"VALUE = 42" | Set-Content app\\orders\\service.py
@'
from .service import VALUE
print(VALUE)
'@ | Set-Content app\\orders\\__main__.py
python app\\orders\\__main__.py
python -m app.orders
python -m app.orders --help`,
        output: `ImportError: attempted relative import with no known parent package
42
usage: python -m app.orders

以文件路径运行时模块没有包上下文，相对导入失败。
python -m 让解释器按包结构加载，__package__ 指向 app.orders。`,
      }],
      ['循环导入成因', 'A 顶层 import B，B 顶层又 import A，后者会拿到尚未执行完的半初始化 A，访问其中名字便抛 ImportError。解法有二：把 import 移进函数体内延迟执行，或重构公共依赖到第三个模块。识别手段是看报错堆栈中出现互相引用的模块对。', '延迟导入破循环', {
        title: 'Python：复现并修复循环导入',
        language: 'Python',
        code: `from pathlib import Path

Path("a.py").write_text("import b\\nVALUE = 42\\ndef get_b(): return b.VALUE\\n")
Path("b.py").write_text("import a\\nVALUE = a.VALUE + 1\\n")
print("before-fix")
import subprocess, sys
result = subprocess.run([sys.executable, "-c", "import a"], capture_output=True, text=True)
print(result.returncode, result.stderr.splitlines()[-1])

Path("b.py").write_text("VALUE = 43\\ndef get_a():\\n    import a\\n    return a.VALUE\\n")
result = subprocess.run([sys.executable, "-c", "import a; print(a.VALUE)"], capture_output=True, text=True)
print(result.returncode, result.stdout.strip())`,
        output: `before-fix
1 ImportError: cannot import name 'VALUE' from partially initialized module 'a'
0 42

顶层互相 import 时，b 读取的是尚未执行完的 a。
把 import 移进函数后，调用发生在两个模块初始化完成之后。`,
      }],
    ],
  },
  {
    name: pyP0Name('REPL、调试器和第一组 pytest'),
    track,
    minutes: 40,
    prerequisite: '学员已能编写含函数与 if 分支的小脚本。',
    goal: '区分 REPL 与脚本执行模型，掌握 breakpoint() 进入 pdb 后的核心单步命令，理解 pytest 断言重写机制，并学会从失败输出反推问题位置。',
    guidedPractice: '教师在示例代码中埋一个 off-by-one 缺陷，学员用 breakpoint() 进入 pdb，依次执行 l、n、s、p 变量名 定位问题；随后写一个 test_*.py 故意断言失败，读 pytest 输出中的 E 行与左右值对比，记录完整调试过程。',
    independentPractice: '独立完成：为一个求平均值函数编写三个 pytest 用例（正常、空列表、负数），先让其中两个失败，根据失败输出修正实现到全绿，并解释 pytest 显示的中间值来自断言重写。',
    commonErrors: ['把交互式 REPL 里试验过的临时变量当成脚本环境的一部分，脚本运行报 NameError。', '在生产代码里遗留 breakpoint()，未设 PYTHONBREAKPOINT 导致线上执行时卡在调试器。'],
    sourceRefs: ['pytest Documentation. https://docs.pytest.org/', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['REPL 与脚本差异', 'REPL 逐条执行输入并把结果存入持久命名空间，上一条表达式的值可用 _ 取回，且文件不经过 __name__ 判断；脚本则从上到下一次执行完毕，顶层 if __name__ == "__main__" 才会触发入口逻辑。许多只在 REPL 复现不了的问题正源于两者初始化路径不同。', '两种执行两模型', {
        title: 'Python：观察 REPL 与脚本命名空间',
        language: 'PowerShell',
        code: `@'
print("script-name", __name__)
value = 3
print("script-value", value)
'@ | Set-Content demo.py
python demo.py
python -c "print('command-name', __name__)"
@'
value = 3
value * 2
_
__name__
exit()
'@ | python`,
        output: `script-name __main__
script-value 3
command-name __main__
6
3
'__main__'

脚本和 -c 都把顶层模块名设为 __main__。
REPL 保留上一条表达式结果，脚本执行完即退出。`,
      }],
      ['breakpoint 与 pdb', '在代码中插入 breakpoint()，程序运行到该行自动挂起并进入 pdb，环境变量 PYTHONBREAKPOINT 可整体禁用或替换它。核心命令：l 看上下文，n 单步跳过，s 进入函数内部，p 表达式 打印求值，c 继续到下一断点，q 退出。', '五命令走完调试', {
        title: 'pdb：定位 off-by-one 缺陷',
        language: 'Python',
        code: `def last_index(items):
    breakpoint()
    return len(items)

values = ["a", "b", "c"]
print(values[last_index(values)])`,
        output: `> C:\\work\\debug_demo.py(2)last_index()
-> return len(items)
(Pdb) p items
['a', 'b', 'c']
(Pdb) p len(items)
3
(Pdb) n
--Return--
(Pdb) c
IndexError: list index out of range

p 显示 items 长度为 3，却把 3 当最后一个索引。
改为 len(items) - 1 后断点命令可继续验证。`,
      }],
      ['pytest 断言重写', 'pytest 收集 test_ 开头的文件与 test_ 开头的函数，收集时对 assert 语句做源码级重写，把子表达式拆开记录中间值。失败时输出不再是干巴巴的 AssertionError，而是每个子表达式的实际取值，这就是它比裸 assert 好用的机制根源。', '重写让断言说话', {
        title: 'pytest：读取断言中间值',
        language: 'Python',
        code: `def average(values):
    return sum(values) / len(values)

def test_average():
    result = average([2, 4, 6])
    assert result == 5

def test_empty():
    assert average([]) == 0`,
        output: `FAILED test_stats.py::test_average
assert 4.0 == 5
FAILED test_stats.py::test_empty
ZeroDivisionError: division by zero

pytest 重写 assert，直接显示 result 实际为 4.0。
空列表失败来自实现边界，不是断言格式问题。`,
      }],
      ['读失败输出', 'pytest 失败报告分两段：短堆栈指向最近的测试内调用帧，E 开头的行给出断言两侧的实际值；对容器比较还会渲染出差异行。阅读顺序是先看 E 行确认期望与实际的差距，再顺堆栈回溯到出错代码，而不是凭感觉乱改实现。', '先读 E 行', {
        title: 'PowerShell：运行 pytest 并展开失败',
        language: 'PowerShell',
        code: `uv run pytest test_stats.py -vv
uv run pytest test_stats.py --showlocals
uv run pytest test_stats.py -x
uv run pytest test_stats.py::test_empty -vv`,
        output: `test_stats.py::test_average FAILED
E assert 4.0 == 5
test_stats.py:8: AssertionError
locals: result=4.0
1 failed in 0.18s

先读 E 行知道 4.0 与 5 的差异。
再用 --showlocals 和 ::test_empty 缩小到单个失败。`,
      }],
      ['组织第一批测试', '每个用例遵循准备、执行、断言三段：先构造输入对象，再调用被测函数拿到结果，最后用 assert 比对预期。用例之间不共享可变状态，不依赖执行顺序；固定输入用例放在参数化或独立函数里，保证任一用例可单独重跑复现。', '三段式互不依赖', {
        title: 'pytest：参数化正常与失败输入',
        language: 'Python',
        code: `import pytest

def normalize_name(value):
    if not value.strip():
        raise ValueError("name required")
    return " ".join(value.split()).title()

@pytest.mark.parametrize(("raw", "expected"), [
    ("alice", "Alice"),
    ("  bob   smith ", "Bob Smith"),
])
def test_normalize_name(raw, expected):
    assert normalize_name(raw) == expected

def test_empty_name_rejected():
    with pytest.raises(ValueError, match="name required"):
        normalize_name("   ")`,
        output: `test_users.py::test_normalize_name[alice-Alice] PASSED
test_users.py::test_normalize_name[  bob   smith -Bob Smith] PASSED
test_users.py::test_empty_name_rejected PASSED
3 passed in 0.03s

每个用例独立构造输入，不共享可变状态。
参数化覆盖正常空白整理，异常用例覆盖边界。`,
      }],
    ],
  },
  {
    name: pyP0Name('零基础命令行项目'),
    track,
    minutes: 38,
    prerequisite: '学员已会用 uv 建项目并编写包含函数与测试的模块。',
    goal: '掌握 argparse 的参数与子命令定义方法，理解退出码约定与调用方的关系，学会用 __main__.py 构造 python -m 入口，并打通从脚手架到可运行的最小闭环。',
    guidedPractice: '跟随演示用 argparse 搭建一个文件行数统计命令：定义必选位置参数与 --encoding 选项，实现非法输入时 sys.exit(2)，装好 __main__.py 后以 python -m 运行，把三种调用场景的输出与退出码抄进操作单。',
    independentPractice: '独立完成：从 uv init 开始建一个 greet 命令行工具，支持 --name 选项与非法名字退出码 1，编写两个 pytest 用例分别断言输出文本与退出码，最终 uv run 打通全链路并提交到版本库。',
    commonErrors: ['脚本失败后随手 return 而不设置非零退出码，调用方误判为执行成功。', '把入口逻辑直接写在包的 __init__.py 里，导致 import 包就执行命令逻辑。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'uv Documentation. https://docs.astral.sh/uv/'],
    steps: [
      ['参数解析', 'argparse.ArgumentParser 通过 add_argument 定义位置参数与 -- 开头的选项，type 约束转换，default 给默认值，help 生成 --help 文本；parser.parse_args() 返回 Namespace 对象，属性名即 dest。typer 用函数签名加类型注解生成同样的能力，参数即文档。', '参数解析成对象', {
        title: 'argparse：解析文件统计参数',
        language: 'Python',
        code: `import argparse

parser = argparse.ArgumentParser(prog="linecount")
parser.add_argument("path", type=str)
parser.add_argument("--encoding", default="utf-8")
args = parser.parse_args()
print(type(args).__name__, args)
print(args.path, args.encoding)`,
        output: `$ python linecount.py data.txt --encoding utf-8
Namespace path='data.txt' encoding='utf-8'
data.txt utf-8
$ python linecount.py --help
usage: linecount [-h] [--encoding ENCODING] path

parse_args 把字符串转换成 Namespace 属性。
--encoding 可省略并为默认值，位置参数必须提供。`,
      }],
      ['退出码约定', '进程退出码是给调用方看的协议：0 表示成功，非零表示失败，不同非零值可细分错误类别，如 2 常表示用法错误。argparse 参数错误自动 exit 2；代码里用 sys.exit(1) 上报业务失败。shell 里 $? 与 CI 平台都依赖这个约定决定流程走向。', '退出码是协议', {
        title: 'PowerShell：验证成功与失败退出码',
        language: 'PowerShell',
        code: `@'
import sys
path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as handle:
        print(sum(1 for _ in handle))
except FileNotFoundError:
    print(f"file not found: {path}", file=sys.stderr)
    raise SystemExit(1)
'@ | Set-Content linecount.py
python linecount.py README.md
Write-Output "success=$LASTEXITCODE"
python linecount.py missing.txt
Write-Output "missing=$LASTEXITCODE"
python linecount.py
Write-Output "usage=$LASTEXITCODE"`,
        output: `128
success=0
file not found: missing.txt
missing=1
usage: linecount.py [-h] path
usage=2

成功返回 0，业务失败返回 1，参数用法错误返回 2。
CI 可以据此区分失败类型而不是只解析文本。`,
      }],
      ['__main__.py 入口', '包目录下放 __main__.py，python -m 包名 就会执行它，等价于把包当成脚本运行。这样入口与包体同源，免去维护两套路径；内部用 if __name__ == "__main__" 包住启动调用，保证被 import 时不产生副作用，与前面模块缓存的行为一致。', '包当脚本跑', {
        title: 'Python：构建 python -m 入口',
        language: 'Python',
        code: `from pathlib import Path

package = Path("greet")
package.mkdir(exist_ok=True)
(package / "__init__.py").write_text("")
(package / "core.py").write_text("def greet(name):\\n    return f'hello {name}'\\n")
(package / "__main__.py").write_text(
    "import sys\\n"
    "from .core import greet\\n"
    "if __name__ == '__main__':\\n"
    "    print(greet(sys.argv[1]))\\n"
)

import subprocess, sys
print(subprocess.run([sys.executable, "-m", "greet", "Ada"], capture_output=True, text=True).stdout)`,
        output: `hello Ada

python -m greet 由 __main__.py 执行。
相对导入正常工作，import greet.core 本身不会打印或启动命令。`,
      }],
      ['从脚手架到运行', '最小闭环顺序：uv init 建项目，编写核心模块与 __main__.py，uv add argparse 不需要则跳过，pyproject.toml 声明项目元数据，最后 uv run python -m 项目名 验证可运行。每一步只引入一个新文件，保证任一报错都能立刻归因到刚做的动作。', '五步走通闭环', {
        title: 'PowerShell：从 uv init 到可运行命令',
        language: 'PowerShell',
        code: `uv init greet-cli
Set-Location greet-cli
New-Item -ItemType Directory src\\greet -Force | Out-Null
"" | Set-Content src\\greet\\__init__.py
@'
import argparse
def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="world")
    return parser
'@ | Set-Content src\\greet\\core.py
@'
from .core import build_parser
print("hello", build_parser().parse_args().name)
'@ | Set-Content src\\greet\\__main__.py
uv pip install -e .
uv run python -m greet --name Ada
uv run python -m greet --name ""`,
        output: `Built editable wheel for greet-cli
Installed 1 package
hello Ada
hello

uv init 建项目，editable 安装 src 包，python -m 执行入口。
每一步新增一个文件，失败时可以立刻定位到对应层。`,
      }],
      ['最小闭环验证', '可运行之后做三层验证：手动跑一次正常路径与一次错误参数路径，分别记录输出与退出码；把退出码写进 pytest（用 subprocess 或 sys.exit 包装断言）；再用 uv sync 在干净环境重建，确认他人克隆后同样可运行，闭环才算完成。', '三层验证收口', {
        title: 'pytest：断言命令行输出与退出码',
        language: 'Python',
        code: `import subprocess, sys
from pathlib import Path

def run(*args):
    return subprocess.run(
        [sys.executable, "-m", "greet", *args],
        cwd=Path(__file__).parent,
        capture_output=True,
        text=True,
    )

def test_greeting():
    result = run("--name", "Ada")
    assert result.returncode == 0
    assert result.stdout.strip() == "hello Ada"

def test_missing_name_value():
    result = run("--name")
    assert result.returncode == 2
    assert "expected one argument" in result.stderr`,
        output: `test_cli.py::test_greeting PASSED
test_cli.py::test_missing_name_value PASSED
2 passed in 0.19s

测试同时覆盖正常输出和 argparse 失败退出码。
干净环境执行 uv sync --locked 后同一测试仍通过，闭环完成。`,
      }],
    ],
  },
];

// ── P1 数据模型、OOP 与惯用法 ─────────────────────────────────────────────
const pyP1Stage = '数据模型、OOP 与惯用法';
const pyP1Name = (topic: string) => `Python · ${pyP1Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP1Name('对象、名称、引用和垃圾回收'),
    track,
    minutes: 38,
    prerequisite: '能在 Python 里写函数和 if、for，用过 print 和赋值语句。',
    goal: '能解释 Python 中名称与对象的关系，说清引用计数与分代回收各自负责什么，并用 id()、is、sys.getrefcount 做验证。',
    guidedPractice: '在 REPL 里给同一个列表绑定两个名称并就地 append，用 id() 和 is 验证两者指向同一对象；再用 del 递减引用计数，制造一次循环引用并用 gc.collect() 回收。',
    independentPractice: '写一个自引用的类实例，对比 gc.collect() 前后的 gc.get_count()，再改用 weakref 打破循环，写一份两条回收路径的差异说明。',
    commonErrors: ['把名称当成装值的盒子，以为赋值会复制对象内容。', '以为 Python 只靠引用计数回收，忽略了循环引用需要分代收集。'],
    sourceRefs: ['Python Data Model. https://docs.python.org/3/reference/datamodel.html', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['一切数据都是对象', 'CPython 里整数、字符串、函数、类本身都是 PyObject，每个对象带类型指针和引用计数头。变量不装值，只装指向对象的引用，type(x) 查类型，id(x) 在 CPython 中就是对象地址。', '值与类型都挂在对象上', {
        title: 'Python：检查对象类型与身份',
        language: 'Python',
        code: `import sys

values = [42, "42", [42], len, type]
for value in values:
    print(type(value).__name__, id(value), value)
print(sys.getsizeof(42), sys.getsizeof("42"), sys.getsizeof([42]))
print(hasattr(42, "__add__"), hasattr("42", "__add__"))`,
        output: `int 140708921348080 42
str 1849921686320 42
list 1849921888064 [42]
builtin_function_or_method ... <built-in function len>
type ... <class 'type'>
28 51 64
True True

每个值都有类型、身份和大小，函数与类也是对象。
int 和 str 都实现 __add__，但相加语义与类型约束不同。`,
      }],
      ['名称是绑定不是盒子', '赋值语句把名字放进当前命名空间并指向对象，x = y 不复制内容，只让两个名字指向同一个对象。对列表就地 append，x 和 y 同时看到新元素；重新给 y 赋值只是改它指向的对象，不影响 x。', '赋值改指向不复制', {
        title: 'Python：别名、就地修改与重新绑定',
        language: 'Python',
        code: `x = [1, 2]
y = x
print(x is y, id(x), id(y))
y.append(3)
print(x, y)
y = [9]
print(x, y)
print(x is y, id(x), id(y))`,
        output: `True 2030843651776 2030843651776
[1, 2, 3] [1, 2, 3]
[1, 2, 3] [9]
False 2030843651776 2030843651840

append 修改同一列表，两个名称都看到结果。
重新绑定 y 只改变 y 的指向，x 仍保持原列表。`,
      }],
      ['引用计数与分代回收', 'CPython 每个对象维护引用计数，引用建立加一、离开作用域或 del 减一，归零立即释放，延迟极低。但计数无法处理互相引用，gc 模块按 0、1、2 三代扫描容器对象，年轻代扫得频繁，老年代扫得少。', '计数即时循环靠 gc', {
        title: 'Python：观察引用计数与 GC 代数',
        language: 'Python',
        code: `import gc, sys

value = []
print(sys.getrefcount(value))
alias = value
print(sys.getrefcount(value))
del alias
print(sys.getrefcount(value))

a = {}
b = {"a": a}
a["b"] = b
print(gc.get_count())
print("unreachable", gc.collect())
print(gc.get_count())`,
        output: `2
3
2
(12, 1, 2)
unreachable 2
(0, 0, 0)

别名增加引用计数，del 后立即减一。
循环引用保留对象，gc.collect 扫描并报告回收数量。`,
      }],
      ['循环引用的成因与解除', 'a.b = b 且 b.a = a 时两个对象计数都不为零，引用计数永远无法归零，只能等分代收集扫描。标准做法是用 weakref 建立不增加计数的弱引用，缓存和观察者回调常用它避免把宿主对象钉在内存里。', '弱引用打破循环', {
        title: 'Python：weakref 打破引用环',
        language: 'Python',
        code: `import gc, weakref

class Node:
    pass

a = Node()
b = Node()
a.peer = b
b.peer = weakref.ref(a)
print(b.peer() is a)
del a
gc.collect()
print(b.peer())
print(gc.garbage)`,
        output: `True
None
[]

weakref 不增加 a 的引用计数。
强引用删除后弱引用变为 None，不会形成无法回收的环。`,
      }],
      ['id 与 is 的含义', 'is 比较两个名称是否指向同一对象，等价于 id(x) == id(y)；== 调用 __eq__ 比较值。判断单例必须用 is，如 x is None。小整数和短字符串因解释器缓存会出现 is 为真的巧合，不能当语义依赖。', '身份判断用 is', {
        title: 'Python：is 与 == 的语义差异',
        language: 'Python',
        code: `a = [1, 2]
b = [1, 2]
c = a
print(a == b, a is b)
print(a == c, a is c)

x = 257
y = 257
print(x == y, x is y)
print(None is None, [] is None)
print(a.__eq__(b), id(a) == id(b))`,
        output: `True False
True True
True True
True False
True False

== 比较列表内容，is 比较对象身份。
小整数缓存会让部分 is 结果看似正确，但不能作为判等规则。`,
      }],
    ],
  },
  {
    name: pyP1Name('类、实例、继承和组合'),
    track,
    minutes: 40,
    prerequisite: '理解课程一里名称与对象的关系，会定义带方法的简单类。',
    goal: '能画出属性查找顺序（实例字典、类字典、MRO），解释 super 的协作机制，并按组合优先原则对一段继承代码做重构判断。',
    guidedPractice: '定义两个各有同名方法的父类与子类，打印 Instance.__mro__ 观察顺序；把子类方法里的 super().f() 换成显式父类调用，用多继承例子对比两者结果差异。',
    independentPractice: '找一段使用多层继承的示例代码，判断哪些关系其实是拥有并改成组合字段，写一份重构前后调用链的对比说明。',
    commonErrors: ['以为 super 就是调用书写上的直接父类，不理解它沿 MRO 找下一个类。', '在类属性上放可变对象，导致所有实例共享同一份状态。'],
    sourceRefs: ['Python Data Model. https://docs.python.org/3/reference/datamodel.html', 'Fluent Python. https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/'],
    steps: [
      ['属性查找先实例后类', '读取 obj.attr 时先查实例的 __dict__，命中即返回；未命中再按 MRO 依次查各类的 __dict__。赋值 obj.attr = v 只写实例字典，不影响类属性。__slots__ 会去掉实例字典换取内存。', '读走实例再走类', {
        title: 'Python：观察实例字典与类属性',
        language: 'Python',
        code: `class Order:
    kind = "order"

one = Order()
two = Order()
one.kind = "priority"
print(one.kind, two.kind, Order.kind)
print(one.__dict__, two.__dict__)
Order.kind = "sales-order"
print(one.kind, two.kind, Order.kind)`,
        output: `priority order order
{'kind': 'priority'} {}
sales-order sales-order sales-order

one.kind 赋值写入实例字典，遮蔽类属性。
two 和 Order 仍共享类属性，类属性修改会反映到未遮蔽实例。`,
      }],
      ['MRO 由 C3 线性化决定', '多继承时查找顺序不是从左到右简单拼起来，而是 C3 算法算出的线性序列，保证子类总在父类之前、父类相对次序不变。用 cls.__mro__ 或 mro() 直接查看，菱形继承里公共基类只出现一次。', '顺序由 C3 决定', {
        title: 'Python：查看菱形继承的 MRO',
        language: 'Python',
        code: `class Root:
    pass

class Left(Root):
    pass

class Right(Root):
    pass

class Child(Left, Right):
    pass

print([cls.__name__ for cls in Child.__mro__])
print(Child.mro())
print(issubclass(Child, Root))`,
        output: `['Child', 'Left', 'Right', 'Root', 'object']
[<class '__main__.Child'>, <class '__main__.Left'>, <class '__main__.Right'>, <class '__main__.Root'>, <class 'object'>]
True

Left 在 Right 前，共同基类 Root 只出现一次。
查找顺序直接由 C3 线性化给出。`,
      }],
      ['super 的真实含义', 'super() 返回一个代理，沿当前实例的 MRO 从当前位置找下一个类，不一定是书写上的直接父类。菱形继承中各层 super().method() 会串成一条协作链，把显式父类名换成 super 才不会重复调用基类。', 'super 找下一个', {
        title: 'Python：super 沿 MRO 协作',
        language: 'Python',
        code: `class Root:
    def handle(self):
        print("Root")

class Left(Root):
    def handle(self):
        print("Left before")
        super().handle()

class Right(Root):
    def handle(self):
        print("Right before")
        super().handle()

class Child(Left, Right):
    def handle(self):
        print("Child")
        super().handle()

Child().handle()
print([cls.__name__ for cls in Child.__mro__])`,
        output: `Child
Left before
Right before
Root
['Child', 'Left', 'Right', 'Root', 'object']

Left 中 super() 找到 Right，不是直接父类 Root。
协作链沿同一 MRO 前进，Root 只执行一次。`,
      }],
      ['组合优先于继承的判断', '继承把子类绑定到父类的实现细节，父类改动会波及所有子类，这就是脆弱基类问题。只有满足是一个且有真实多态需求才用继承；拥有关系用字段持有另一个对象并转发调用，边界更清晰、替换更容易。', '是一个才继承', {
        title: 'Python：把脆弱继承改为组合',
        language: 'Python',
        code: `class FileLogger:
    def info(self, message):
        print("file", message)

class RetryLogger(FileLogger):
    def info(self, message):
        print("retry", message)

class OrderService:
    def __init__(self, logger):
        self.logger = logger
    def place(self, order_id):
        self.logger.info(f"placed {order_id}")

service = OrderService(RetryLogger())
service.place("O-1")
print(type(service).__name__, type(service.logger).__name__)
print(OrderService.__mro__)`,
        output: `retry placed O-1
OrderService RetryLogger
[<class '__main__.OrderService'>, <class 'object'>]

OrderService 通过字段拥有日志能力，不是日志器子类。
替换日志器无需改服务类继承树。`,
      }],
      ['类属性被所有实例共享', '类属性挂在类对象上，所有实例读到同一份。把列表或字典当类属性再就地修改，改动会出现在每个实例上，这是默认值踩坑的根源。需要每实例独立初值时，在 __init__ 里赋值而不是写在类体上。', '可变状态放实例里', {
        title: 'Python：复现共享类属性问题',
        language: 'Python',
        code: `class CartBroken:
    items = []
    def add(self, item):
        self.items.append(item)

class CartFixed:
    def __init__(self):
        self.items = []
    def add(self, item):
        self.items.append(item)

a = CartBroken(); b = CartBroken()
a.add("glass"); b.add("book")
print(a.items, b.items, a.items is b.items)
c = CartFixed(); d = CartFixed()
c.add("glass"); d.add("book")
print(c.items, d.items, c.items is d.items)`,
        output: `['glass', 'book'] ['glass', 'book'] True
['glass'] ['book'] False

CartBroken 的所有实例共享同一个类列表。
CartFixed 在构造时为每个实例创建独立列表。`,
      }],
    ],
  },
  {
    name: pyP1Name('特殊方法与协议对象'),
    track,
    minutes: 38,
    prerequisite: '理解属性查找顺序与名称绑定，能定义自己的类并实例化。',
    goal: '能说出 len()、for、+、== 各自调用哪个特殊方法，实现可迭代和可比较的类，并解释鸭子类型与协议的对应关系。',
    guidedPractice: '给一个自定义类补齐 __len__、__iter__、__repr__、__eq__，用 len()、for-in、== 逐个验证行为，再把一个特殊方法挂到实例上验证它不会被触发。',
    independentPractice: '实现一个支持 + 与 * 的向量类，在类型不匹配分支返回 NotImplemented，写一份常用运算符到特殊方法的映射表。',
    commonErrors: ['在实例上定义 __len__ 却不生效，不理解特殊方法在类型上查找。', '用 raise TypeError 处理不支持的运算，破坏了对方类型参与运算的机会。'],
    sourceRefs: ['Python Data Model. https://docs.python.org/3/reference/datamodel.html', 'Fluent Python. https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/'],
    steps: [
      ['特殊方法由解释器隐式调用', 'len(x) 调 x.__len__()，+ 调 __add__，in 调 __contains__，for 调 __iter__。它们由对应语法或内置函数触发，很少手写调用。查找发生在对象类型上而非实例字典，挂在实例上的特殊方法不生效。', '语法触发类型查找', {
        title: 'Python：从语法触发特殊方法',
        language: 'Python',
        code: `class Basket:
    def __init__(self, items):
        self.items = list(items)
    def __len__(self):
        return len(self.items)
    def __contains__(self, item):
        return item in self.items
    def __repr__(self):
        return f"Basket({self.items!r})"

basket = Basket(["apple", "book"])
print(len(basket), "book" in basket, basket)
basket.__len__ = lambda: 999
print(len(basket), basket.__len__())`,
        output: `2 True Basket(['apple', 'book'])
2 999

len 与 in 由类型上的特殊方法触发。
实例字典里的 __len__ 不参与 len() 查找，因此仍返回 2。`,
      }],
      ['迭代协议是 for 的引擎', 'for x in obj 先调 obj.__iter__() 拿迭代器，再反复调迭代器的 __next__()，直到 StopIteration 结束。迭代器耗尽即失效，重复遍历要靠容器每次返回新迭代器。生成器函数是写迭代器最省事的方式。', 'for 靠迭代器协议', {
        title: 'Python：手工驱动迭代器协议',
        language: 'Python',
        code: `values = [10, 20]
iterator = iter(values)
print(iterator is values)
print(next(iterator))
print(next(iterator))
try:
    next(iterator)
except StopIteration as error:
    print("exhausted", repr(error))
print(list(iterator))`,
        output: `False
10
20
exhausted StopIteration()
[]

iter(list) 返回独立迭代器，next 推进位置。
耗尽后继续 next 或转列表都得到空结果。`,
      }],
      ['判等与 repr 的分工', '__eq__ 定义值相等语义，默认实现是比较 id；定义它通常也要考虑 __hash__。__repr__ 面向调试，目标是回显出能重建对象的表达式；__str__ 面向用户展示，缺失时回退到 __repr__。', 'repr 给开发者看', {
        title: 'Python：实现判等与可重建 repr',
        language: 'Python',
        code: `class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)
    def __repr__(self):
        return f"Point({self.x!r}, {self.y!r})"

a = Point(1, 2)
b = Point(1, 2)
print(a == b, a is b, repr(a))
print(eval(repr(a)) == a)`,
        output: `True False Point(1, 2)
True

__eq__ 按坐标比较值，is 仍区分对象身份。
repr 返回可重建表达式，eval 后得到相等的新对象。`,
      }],
      ['运算符重载的约定', '__add__ 收到左侧操作数，无法处理返回 NotImplemented 而非抛异常，解释器试右侧的 __radd__。比较成对实现 __lt__ 与 __eq__，或用 functools.total_ordering 补齐其余比较。', '不能算就让位对方', {
        title: 'Python：NotImplemented 与反向加法',
        language: 'Python',
        code: `class Vector:
    def __init__(self, value):
        self.value = value
    def __add__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return Vector(self.value + other.value)
    def __radd__(self, other):
        if other == 0:
            return self
        return NotImplemented
    def __repr__(self):
        return f"Vector({self.value})"

print(Vector(2) + Vector(3))
print(sum([Vector(2), Vector(3)]))
try:
    print(Vector(2) + "x")
except TypeError as error:
    print(type(error).__name__, error)`,
        output: `Vector(5)
Vector(5)
TypeError unsupported operand type(s) for +: 'Vector' and 'str'

__add__ 无法处理时返回 NotImplemented，Python 再尝试 __radd__。
sum 从 0 开始，__radd__ 处理 0 + Vector。`,
      }],
      ['鸭子类型与协议的关系', 'Python 不看声明类型，只要求它有协议要求的方法，这就是鸭子类型。collections.abc 把协议形式化为可 isinstance 检查的抽象基类，typing.Protocol 让静态检查器也认结构匹配，违约在检查阶段就暴露。', '协议是显式的鸭子类型', {
        title: 'Python：ABC 与 Protocol 验证结构',
        language: 'Python',
        code: `from collections.abc import Sized
from typing import Protocol, runtime_checkable

@runtime_checkable
class Greeter(Protocol):
    def greet(self) -> str: ...

class English:
    def greet(self):
        return "hello"

class Basket:
    def __len__(self):
        return 2

print(isinstance(Basket(), Sized))
print(isinstance(English(), Greeter))
print(isinstance(object(), Greeter))`,
        output: `True
True
False

ABC 用结构化钩子识别 __len__。
runtime_checkable Protocol 只检查方法存在，不检查返回注解。
`,
      }],
    ],
  },
  {
    name: pyP1Name('property、descriptor 与属性校验'),
    track,
    minutes: 37,
    prerequisite: '理解属性查找顺序，会定义类和使用实例属性。',
    goal: '能解释 property 作为数据描述符如何改变查找优先级，会用 setter 集中简单校验，并判断哪些计算不该塞进 property。',
    guidedPractice: '写一个带 property 校验的类，赋非法值观察抛错；再用纯描述符实现同名校验，打印 __set_name__ 收到的名称，对比两种写法的类定义差异。',
    independentPractice: '找一段把重计算或 IO 放进 property 的代码，改成显式方法或 cached_property，写一份接口变化影响面说明。',
    commonErrors: ['在 setter 里做网络请求或磁盘 IO，让读取属性变成慢操作。', '以为实例字典里的同名属性会盖过 property，实际数据描述符优先。'],
    sourceRefs: ['Python Data Model. https://docs.python.org/3/reference/datamodel.html', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['property 的本质', 'property 实现了 __get__ 与 __set__，属于数据描述符。数据描述符在类上的优先级高于实例字典，所以即使实例 __dict__ 里有同名键，读取仍走 fget，赋值仍走 fset。这就是它能拦截赋值的原因。', '描述符优先于实例字典', {
        title: 'Python：property 拦截赋值',
        language: 'Python',
        code: `class Account:
    def __init__(self, balance):
        self._balance = balance
    @property
    def balance(self):
        print("getter")
        return self._balance
    @balance.setter
    def balance(self, value):
        print("setter", value)
        if value < 0:
            raise ValueError("negative")
        self._balance = value

account = Account(100)
print(account.balance)
account.balance = 50
account.__dict__["balance"] = 999
print(account.balance, account.__dict__)`,
        output: `getter 100
setter 50
getter 50
{'_balance': 50, 'balance': 999}

实例字典可以写入同名键，但数据描述符优先。
读取仍走 getter，balance=999 不参与属性查找。`,
      }],
      ['描述符协议与命名回调', '只定义 __get__ 的是非数据描述符，如函数与方法，实例字典可覆盖它；定义了 __set__ 或 __delete__ 的才是数据描述符。__set_name__ 在类创建时调用，把属性名传给它，描述符类可多处复用而无需手工传名。', '两种描述符优先级不同', {
        title: 'Python：__set_name__ 复用描述符',
        language: 'Python',
        code: `class Positive:
    def __set_name__(self, owner, name):
        self.name = name
    def __get__(self, instance, owner):
        if instance is None:
            return self
        return instance.__dict__[self.name]
    def __set__(self, instance, value):
        if value <= 0:
            raise ValueError(self.name)
        instance.__dict__[self.name] = value

class Product:
    price = Positive()
    stock = Positive()

product = Product()
product.price = 10
product.stock = 20
print(product.price, product.stock, Positive.__set_name__)
try:
    product.stock = 0
except ValueError as error:
    print("rejected", error)`,
        output: `10 20 <function Positive.__set_name__>
rejected stock

同一个描述符类在类创建时分别收到 price 与 stock。
两个字段共用校验逻辑，错误信息仍指出具体属性名。`,
      }],
      ['校验进 setter 的边界', '简单不变式如非空、范围、类型检查放进 setter 合理：赋值点立即抛 ValueError，对象不会处于非法状态。复杂校验依赖多个字段或需要查询外部数据时，应放在工厂函数或显式方法里，避免一句赋值隐式触发昂贵操作。', '轻校验进重校验出', {
        title: 'Python：赋值点立即校验',
        language: 'Python',
        code: `class Reservation:
    def __init__(self):
        self._guests = 1
    @property
    def guests(self):
        return self._guests
    @guests.setter
    def guests(self, value):
        if not isinstance(value, int):
            raise TypeError("guests must be int")
        if not 1 <= value <= 20:
            raise ValueError("guests outside 1..20")
        self._guests = value

reservation = Reservation()
reservation.guests = 4
print(reservation.guests)
for value in ("4", 0, 21):
    try:
        reservation.guests = value
    except (TypeError, ValueError) as error:
        print(type(error).__name__, error)`,
        output: `4
TypeError guests must be int
ValueError guests outside 1..20
ValueError guests outside 1..20

非法赋值立即失败，guests 始终保持在合法范围。
复杂跨字段或远程校验不应藏在同一次简单赋值里。`,
      }],
      ['属性里别做重活', '属性读取在调用方眼里是廉价操作，审查和调试都不会提防 obj.value 有开销。property 里做查询、构建大表或加锁，会让赋值变成性能陷阱。重计算用显式方法或 functools.cached_property，把成本写进名字。', '重活起个方法名', {
        title: 'Python：cached_property 缓存重计算',
        language: 'Python',
        code: `from functools import cached_property

class Report:
    def __init__(self, rows):
        self.rows = rows
        self.calls = 0
    @cached_property
    def summary(self):
        self.calls += 1
        return {"count": len(self.rows), "total": sum(self.rows)}
    def reload(self):
        self.__dict__.pop("summary", None)

report = Report([1, 2, 3])
print(report.summary, report.calls)
print(report.summary, report.calls)
report.reload()
print(report.summary, report.calls)`,
        output: `{'count': 3, 'total': 6} 1
{'count': 3, 'total': 6} 1
{'count': 3, 'total': 6} 2

cached_property 第一次计算后写入实例字典。
数据变化后必须显式失效缓存，否则会返回旧结果。`,
      }],
      ['只读属性的正确写法', '只定义 getter 不定义 setter，赋值会抛 AttributeError。内部仍可通过 _name 直接改，它提供接口约束不是深度防护。真不可变要配合 frozen dataclass 或自定义 __setattr__。', '只读靠接口不靠防护', {
        title: 'Python：只读 property 的边界',
        language: 'Python',
        code: `class Order:
    def __init__(self, order_id):
        self._order_id = order_id
    @property
    def order_id(self):
        return self._order_id

order = Order("O-1")
print(order.order_id)
try:
    order.order_id = "O-2"
except AttributeError as error:
    print(type(error).__name__, error)
order._order_id = "O-2"
print(order.order_id)`,
        output: `O-1
AttributeError property 'order_id' of 'Order' object has no setter
O-2

公开属性没有 setter，外部赋值被拒绝。
内部下划线字段仍可修改，接口约束不是不可变保证。`,
      }],
    ],
  },
  {
    name: pyP1Name('dataclass、enum 与不可变数据'),
    track,
    minutes: 39,
    prerequisite: '理解类与实例的属性机制，用过类型注解写函数签名。',
    goal: '能说明 dataclass 自动生成哪些方法、frozen 拦住什么拦不住什么，并用 enum 表达封闭集合，讲清成员唯一性与值语义。',
    guidedPractice: '用 @dataclass(frozen=True) 定义带 list 字段的模型，尝试改字段与改列表元素，对比两种操作的报错与结果；用 @enum.unique 检查一次重复值定义。',
    independentPractice: '把一个用字典传参的配置类改成 frozen dataclass，用 tuple 替换列表字段，写一份哪些位置真正不可变的核对清单。',
    commonErrors: ['给 dataclass 字段直接写默认值 []，触发可变默认值错误。', '以为 frozen=True 后整个对象深不可变，忽略列表元素仍可修改。'],
    sourceRefs: ['PEP 557 Data Classes. https://peps.python.org/pep-0557/', 'Python Data Model. https://docs.python.org/3/reference/datamodel.html'],
    steps: [
      ['样板方法自动生成', '@dataclass 读类体里的类型注解，生成 __init__ 和按字段元组比较的 __eq__，判等与打印不再手写。field(default_factory=list) 解决可变默认值：每次实例化调工厂造新列表，而非共享同一个。', '注解即字段声明', {
        title: 'dataclass：自动生成比较与默认工厂',
        language: 'Python',
        code: `from dataclasses import dataclass, field

@dataclass
class Order:
    order_id: str
    items: list[str] = field(default_factory=list)

a = Order("O-1")
b = Order("O-1")
a.items.append("book")
print(a)
print(a == b, a.items is b.items)
print(Order.__dataclass_fields__.keys())`,
        output: `Order(order_id='O-1', items=['book'])
False False
dict_keys(['order_id', 'items'])

dataclass 自动生成 __init__、__eq__ 和 __repr__。
default_factory 为每个实例创建独立列表，a 与 b 不共享。`,
      }],
      ['frozen 的边界', 'frozen=True 重写 __setattr__，字段赋值抛 FrozenInstanceError。它只挡绑定，字段是列表或字典时内部元素仍可改，这是假不可变。真不可变得把字段换成 tuple、frozenset 这类不可变类型。', '浅冻结不等于深不可变', {
        title: 'dataclass：frozen 只挡住重新绑定',
        language: 'Python',
        code: `from dataclasses import dataclass, FrozenInstanceError

@dataclass(frozen=True)
class Snapshot:
    tags: list[str]

snapshot = Snapshot(["new"])
snapshot.tags.append("paid")
print(snapshot.tags)
try:
    snapshot.tags = ["other"]
except FrozenInstanceError as error:
    print(type(error).__name__, error)

immutable = Snapshot(("new",))
print(immutable.tags)`,
        output: `['new', 'paid']
FrozenInstanceError cannot assign to field 'tags'
('new',)

frozen 阻止字段重新绑定，列表内部仍可修改。
换成 tuple 后元素层也拒绝 append。`,
      }],
      ['可哈希需要字段真的不可变', 'frozen dataclass 生成的 __hash__ 基于字段元组，字段含列表时实例放进 set 或当字典键会哈希报错。字段改 tuple 后可用。frozen=False 时 __hash__ 被置为 None，实例不可哈希。', '哈希跟着可变性走', {
        title: 'dataclass：列表字段破坏哈希',
        language: 'Python',
        code: `from dataclasses import dataclass

@dataclass(frozen=True)
class Broken:
    tags: list[str]

@dataclass(frozen=True)
class Fixed:
    tags: tuple[str, ...]

broken = Broken(["new"])
try:
    hash(broken)
except TypeError as error:
    print(type(error).__name__, error)

print(hash(Fixed(("new",))))
print(Fixed(("new",)) in {Fixed(("new",))})`,
        output: `TypeError unhashable type: 'list'
843245982350094621
True

哈希会读取字段元组，其中列表不可哈希。
tuple 字段可哈希，内容相同的 Fixed 能在 set 中命中原对象。`,
      }],
      ['enum 成员唯一且有值语义', 'enum 类体里每个名字绑定一个成员实例，成员是单例，加 @unique 后同值定义会报错。同值不同名是别名，指向同一成员。Color.RED 是 Color 的实例，== 比较同一成员为真；需要数值运算选 IntEnum。', '成员是单例不是字面量', {
        title: 'enum：成员、别名与唯一性',
        language: 'Python',
        code: `from enum import Enum, IntEnum, unique

class Color(Enum):
    RED = "red"
    CRIMSON = "red"

print(Color.RED is Color.CRIMSON)
print(Color.RED == "red", Color.RED.value)
print(list(Color))

@unique
class Status(Enum):
    PAID = 1
    REFUNDED = 2

class Code(IntEnum):
    OK = 200

print(Status.PAID.name, Code.OK + 1)`,
        output: `True
False red
[<Color.RED: 'red'>]
PAID 201

同值成员成为别名，遍历只出现主成员。
成员不等于原始字符串，IntEnum 才参与整数运算。`,
      }],
      ['选型：枚举还是记录', '取值范围固定且需要防止拼错字符串的状态、类别用 enum，非法值在定义层就被挡住。多字段组合的记录、配置、事件用 dataclass，得到比较与打印。二者可组合：dataclass 字段类型注解为某个 enum，静态检查器会拦下非法赋值。', '枚举管类别记录管数据', {
        title: 'dataclass + enum：订单事件模型',
        language: 'Python',
        code: `from dataclasses import dataclass
from enum import Enum

class OrderStatus(Enum):
    CREATED = "created"
    PAID = "paid"

@dataclass(frozen=True)
class OrderEvent:
    event_id: str
    order_id: str
    status: OrderStatus

event = OrderEvent("e-1", "O-1", OrderStatus.PAID)
print(event)
print(event.status.value)
try:
    OrderEvent("e-2", "O-2", "paid")
except Exception as error:
    print(type(error).__name__, error)`,
        output: `OrderEvent(event_id='e-1', order_id='O-1', status=<OrderStatus.PAID: 'paid'>)
paid

dataclass 承载多字段事件，enum 约束状态集合。
运行期 dataclass 不校验字段类型，入口仍需 Pydantic 或显式检查。`,
      }],
    ],
  },
  {
    name: pyP1Name('领域模型与协议实现'),
    track,
    minutes: 38,
    prerequisite: '理解 __eq__、__hash__ 与特殊方法机制，会写 dataclass。',
    goal: '能区分值对象与实体，按定义判等必须配对哈希的约束实现领域类型，并设计不依赖 IO、可单测的模型层。',
    guidedPractice: '实现 Money 值对象与 Order 实体：Money 按 (amount, currency) 判等且可入 set，Order 按 id 判等；用同一个 set 两种对象验证查找行为差异。',
    independentPractice: '给订单实体加一个状态迁移方法并内建合法状态表，把时间获取改成注入参数，写三条不碰数据库的状态机单测。',
    commonErrors: ['自定义 __eq__ 却不定义 __hash__，对象无法放入集合。', '让实体和值对象共用按值判等，导致两个不同订单被误判为同一笔。'],
    sourceRefs: ['Fluent Python. https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/', 'PEP 557 Data Classes. https://peps.python.org/pep-0557/'],
    steps: [
      ['值对象与实体的区分标准', '值对象没有身份，两个金额都为 100 元的 Money 就是相等的，替换比修改更自然；实体有身份，两个不同 Order 即使字段全同也不是同一笔，靠 id 区分。判等策略决定了 __eq__ 与 __hash__ 的写法，建模先分清这两类。', '先分类再定判等', {
        title: 'Python：值对象按值判等',
        language: 'Python',
        code: `from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str

one = Money(Decimal("100.00"), "CNY")
two = Money(Decimal("100.00"), "CNY")
other = Money(Decimal("100.00"), "USD")
print(one == two, hash(one) == hash(two))
print(one == other)
print({one, two, other})`,
        output: `True True
False
{Money(amount=Decimal('100.00'), currency='CNY'), Money(amount=Decimal('100.00'), currency='USD')}

金额与币种相同即为同一值，重复放入 set 会合并。
币种不同表示不同值对象。`,
      }],
      ['判等与哈希必须配对', '约束是 a == b 则 hash(a) == hash(b)，只定义 __eq__ 时会把 __hash__ 置为 None，实例进不了 set 和字典键。哈希要基于参与判等的字段，且字段不可变，否则对象在集合里会丢失。', '判等与哈希绑一组字段', {
        title: 'Python：实体按 id 判等与哈希',
        language: 'Python',
        code: `from dataclasses import dataclass, field

@dataclass(frozen=True)
class OrderId:
    value: str

@dataclass
class Order:
    order_id: OrderId
    status: str
    _hash: int = field(init=False, repr=False)

    def __post_init__(self):
        self._hash = hash(self.order_id)
    def __eq__(self, other):
        return isinstance(other, Order) and self.order_id == other.order_id
    def __hash__(self):
        return self._hash

a = Order(OrderId("O-1"), "CREATED")
b = Order(OrderId("O-1"), "PAID")
print(a == b, hash(a) == hash(b), len({a, b}))`,
        output: `True True 1

实体只按 order_id 判等，状态变化不产生新身份。
哈希基于不可变 OrderId，运行中状态变化不会破坏 set。`,
      }],
      ['不变式在构造期建立', '领域模型的规则应在 __init__ 或 __post_init__ 里校验，金额不能为负、状态只能迁到合法后继，违规立即抛异常。模型任何时刻处于合法状态，使用方就不必到处写防御判断。失败抛领域异常而非 None，让错误类型可分支处理。', '构造即合法状态', {
        title: 'Python：构造期校验金额与状态',
        language: 'Python',
        code: `from dataclasses import dataclass
from decimal import Decimal

class DomainError(ValueError):
    pass

@dataclass(frozen=True)
class Invoice:
    amount: Decimal
    status: str
    def __post_init__(self):
        if self.amount < 0:
            raise DomainError("amount must be non-negative")
        if self.status not in {"DRAFT", "ISSUED", "PAID"}:
            raise DomainError("invalid status")

print(Invoice(Decimal("10"), "DRAFT"))
try:
    Invoice(Decimal("-1"), "DRAFT")
except DomainError as error:
    print(type(error).__name__, error)`,
        output: `Invoice(amount=Decimal('10'), status='DRAFT')
DomainError amount must be non-negative

非法金额无法创建 Invoice。
调用方按具体领域错误分支，不再检查 None 或散落字段。`,
      }],
      ['模型层不碰 IO 才可测试', '模型方法只做纯计算和状态变换，不直接连数据库、发请求或读 datetime.now()。当前时间、随机数、外部服务从构造函数或方法参数注入，测试传固定值就能得到确定结果。无 IO 意味着单测不需要 mock 框架，构造对象即可断言。', '依赖注入换确定性', {
        title: 'Python：注入时钟测试状态迁移',
        language: 'Python',
        code: `from dataclasses import dataclass, replace
from datetime import datetime, timezone

@dataclass(frozen=True)
class Order:
    status: str
    paid_at: datetime | None

TRANSITIONS = {("CREATED", "PAID"): "PAID"}

def pay(order, now):
    next_status = TRANSITIONS[(order.status, "PAID")]
    return replace(order, status=next_status, paid_at=now)

clock = lambda: datetime(2026, 11, 24, tzinfo=timezone.utc)
order = pay(Order("CREATED", None), clock())
print(order.status, order.paid_at.isoformat())`,
        output: `PAID 2026-11-24T00:00:00+00:00

pay 不读取全局时间，测试传入固定 clock。
相同输入产生完全确定的结果，无需 mock。`,
      }],
      ['Protocol 隔离依赖', '定义 typing.Protocol 声明仓储或通知接口的方法签名，领域层只认协议，具体实现放适配器。结构化类型让测试替身无需继承基类，方法签名匹配即可替换。Protocol 是静态检查的鸭子类型，违反签名在类型检查阶段就报错。', '面向协议不面向实现', {
        title: 'Protocol：领域层只依赖接口',
        language: 'Python',
        code: `from dataclasses import dataclass
from typing import Protocol

@dataclass(frozen=True)
class Order:
    order_id: str

class OrderRepository(Protocol):
    def save(self, order: Order) -> None: ...

class InMemoryRepository:
    def __init__(self):
        self.rows = {}
    def save(self, order):
        self.rows[order.order_id] = order

def place_order(order, repository: OrderRepository):
    repository.save(order)
    return order.order_id

repo = InMemoryRepository()
print(place_order(Order("O-1"), repo), repo.rows)`,
        output: `O-1 {'O-1': Order(order_id='O-1')}

领域函数只依赖 save 方法签名，不导入数据库实现。
测试替身无需继承显式基类，结构匹配即可替换。`,
      }],
    ],
  },
];

// ── P2 异常、生成器、装饰器与上下文 ─────────────────────────────────────────────
const pyP2Stage = '异常、生成器、装饰器与上下文';
const pyP2Name = (topic: string) => `Python · ${pyP2Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP2Name('异常层次、异常链与自定义错误'),
    track,
    minutes: 38,
    prerequisite: '已掌握函数定义、try/except 基本语法与 traceback 阅读方法。',
    goal: '理解 Python 异常类层次与捕获范围的选择原则，会用 raise ... from 建立异常链并设计可维护的自定义错误类。',
    guidedPractice: '在交互式会话中依次触发 ValueError 与自定义的 ConfigMissingError，用 traceback.print_exc() 打印调用栈，再把一段普通 raise 改写为 raise ... from e，对比 __cause__ 与 __context__ 的差异并记录成笔记。',
    independentPractice: '为配置加载函数设计两层错误类（基类加两个子类），把文件读取与字段校验处的裸 except 改写为窄类型捕获，并用 raise ... from e 串联根因，跑通至少三个异常分支的单元测试。',
    commonErrors: ['用 except Exception 兜底导致 NameError 等拼写缺陷被悄悄吞掉。', 'except 块内重新抛错时漏写 from e，__cause__ 为空难以定位最初根因。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python typing. https://docs.python.org/3/library/typing.html'],
    steps: [
      ['认识异常类层次', 'BaseException 是所有异常的根，Exception 是常规业务异常的父类，KeyboardInterrupt 与 SystemExit 直接挂在 BaseException 下，所以 except Exception 不会吞掉用户按 Ctrl+C 的退出请求。IndentationError、TypeError 等具体异常都位于 Exception 分支内，课堂现场画出这棵继承树。', '先分层再捕获', {
        title: 'Python：查看异常继承层次',
        language: 'Python',
        code: `exceptions = [ValueError, TypeError, KeyboardInterrupt, SystemExit]
for error in exceptions:
    print(error.__name__, issubclass(error, Exception), issubclass(error, BaseException))

try:
    raise KeyboardInterrupt
except Exception:
    print("caught-by-exception")
except BaseException as error:
    print("caught-by-base", type(error).__name__)`,
        output: `ValueError True True
TypeError True True
KeyboardInterrupt False True
SystemExit False True
caught-by-base KeyboardInterrupt

普通业务错误继承 Exception。
KeyboardInterrupt 与 SystemExit 不能被 except Exception 捕获。`,
      }],
      ['窄化 except 范围', '捕获时优先写具体类型，例如 except (FileNotFoundError, PermissionError)；裸 except 或 except Exception 会把 NameError、拼写错误一并吞掉，掩盖真实缺陷。多个 except 分支要按从子类到父类排列，父类分支放在后面才不会提前截胡子类异常。', '捕获宁窄勿宽', {
        title: 'Python：窄捕获不会吞掉拼写错误',
        language: 'Python',
        code: `from pathlib import Path

for operation in [lambda: Path("missing.txt").read_text(), lambda: misspelled_name]:
    try:
        operation()
    except (FileNotFoundError, PermissionError) as error:
        print("file-error", type(error).__name__)
    except Exception as error:
        print("unexpected", type(error).__name__, error)`,
        output: `file-error FileNotFoundError
unexpected NameError name 'misspelled_name' is not defined

文件错误走预期分支。
拼写错误仍以 NameError 暴露，不被文件异常吞掉。`,
      }],
      ['显式建立异常链', '在 except 块内用 raise ValueError("解析失败") from e 重新抛出，解释器会把原异常对象存入新异常的 __cause__，traceback 会打印 direct cause 提示；只写 raise 新异常而不带 from，原异常只会出现在 __context__，链路语义更弱，排查时更难追溯。', '显式标出根因', {
        title: 'Python：raise from 保留根因',
        language: 'Python',
        code: `import traceback

def load_config(raw):
    try:
        return {"port": int(raw)}
    except ValueError as error:
        raise RuntimeError("config invalid") from error

try:
    load_config("not-a-port")
except RuntimeError as error:
    print(type(error.__cause__).__name__, error.__cause__)
    print("context", type(error.__context__).__name__)
    traceback.print_exception(error)`,
        output: `ValueError invalid literal for int() with base 10: 'not-a-port'
context ValueError
The above exception was the direct cause of the following exception:
RuntimeError: config invalid

__cause__ 指向显式根因，traceback 打印 direct cause。
调用方看到业务错误，同时保留原始 ValueError。`,
      }],
      ['设计自定义错误类', '为业务模块建立 errors.py，让 ModuleError 继承 Exception，再派生 ConfigMissingError、ParseFailureError 等子类，统一携带 message 与 code 字段。调用方可以用一次 except ModuleError 兜住整族错误，再按需细分处理，日志格式也随之统一。', '一族错误一个基类', {
        title: 'Python：统一配置错误族',
        language: 'Python',
        code: `class ConfigError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code

class ConfigMissing(ConfigError):
    pass

class ConfigParse(ConfigError):
    pass

def load(values):
    if "port" not in values:
        raise ConfigMissing("CONFIG_MISSING", "port required")
    try:
        return int(values["port"])
    except ValueError as error:
        raise ConfigParse("CONFIG_PARSE", "port must be int") from error

for values in [{}, {"port": "abc"}]:
    try:
        load(values)
    except ConfigError as error:
        print(type(error).__name__, error.code, str(error))`,
        output: `ConfigMissing CONFIG_MISSING port required
ConfigParse CONFIG_PARSE port must be int

两个子类共享 code 与日志处理方式。
调用方可根据子类型或 code 做具体提示。`,
      }],
      ['边界情况演练', 'finally 块中的 return 会覆盖 try 或 except 里的返回值，导致异常被静默丢弃；except 分支里再次抛错时若不加 from，调试时很难追到最初出错的位置。课堂用带 finally 的示例函数实测这两种行为，观察返回值与栈信息的变化并记录结论。', '边界行为要实测', {
        title: 'Python：finally return 覆盖异常',
        language: 'Python',
        code: `def broken():
    try:
        raise ValueError("lost")
    finally:
        return "finally-wins"

def safe():
    try:
        raise ValueError("visible")
    finally:
        print("cleanup")

print(broken())
try:
    safe()
except ValueError as error:
    print("propagated", error)`,
        output: `finally-wins
cleanup
propagated visible

return 放在 finally 会覆盖正在传播的异常。
清理放 finally 且不 return，异常仍会向外传播。`,
      }],
    ],
  },
  {
    name: pyP2Name('with、上下文管理器和资源释放'),
    track,
    minutes: 38,
    prerequisite: '已了解 try/finally 的执行顺序并写过基本的类定义与方法。',
    goal: '掌握 with 语句背后的 __enter__/__exit__ 协议，理解异常路径下的释放顺序与抑制语义，并会用 contextlib 编写轻量管理器。',
    guidedPractice: '实现一个 TimerContext 类，__enter__ 记录起始时间，__exit__ 打印耗时与是否发生异常；再把它封装成 @contextmanager 版本，两个版本分别嵌套两层使用，打印各自的释放顺序并对照截图留档。',
    independentPractice: '为一个模拟数据库连接类补全 __enter__/__exit__，保证异常路径下也能回滚并关闭连接，随后迁移到 contextmanager 写法，用 pytest 验证两种实现释放日志一致且异常均正常向外传播。',
    commonErrors: ['在 __exit__ 中随手返回 True，把块内异常静默吞掉且外层无感知。', 'contextmanager 的 yield 没有包 try/finally，异常发生时清理代码不执行。'],
    sourceRefs: ['PEP 343 with Statement. https://peps.python.org/pep-0343/', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['拆解 with 执行流程', 'with 后的表达式求值后立即调用对象的 __enter__，返回值绑定到 as 变量；无论块内是否抛异常，退出时都会调用 __exit__(exc_type, exc, tb)。__exit__ 返回 True 时异常被吞掉，返回 False 或 None 则继续向外传播，这正是异常发生时释放代码仍会执行的机制来源。', '进出各一次调用', {
        title: 'Python：追踪 with 的进出调用',
        language: 'Python',
        code: `class Resource:
    def __enter__(self):
        print("enter")
        return "resource"
    def __exit__(self, exc_type, exc, tb):
        print("exit", exc_type.__name__ if exc_type else None)
        return False

with Resource() as value:
    print("body", value)

try:
    with Resource():
        raise RuntimeError("boom")
except RuntimeError:
    print("propagated")`,
        output: `enter
body resource
exit None
enter
exit RuntimeError
propagated

正常与异常路径都调用 __exit__。
返回 False 让 RuntimeError 继续向外传播。`,
      }],
      ['异常路径实测', '在自定义管理器的 __exit__ 里打印 exc_type，分别运行块内正常 return 与抛出 ZeroDivisionError 两种情形：异常情形下 __exit__ 先拿到异常类型并完成释放，然后异常才继续向外传播；若此时返回 True，外层 except 将收不到该异常。用这段实验确认顺序与抑制语义。', '释放先于传播', {
        title: 'Python：__exit__ 抑制异常',
        language: 'Python',
        code: `class Suppress:
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        print("cleanup", exc_type.__name__)
        return True

try:
    with Suppress():
        print(1 / 0)
except ZeroDivisionError:
    print("outer caught")
else:
    print("outer not reached")`,
        output: `cleanup ZeroDivisionError
outer not reached

__exit__ 先拿到 ZeroDivisionError 并完成清理。
返回 True 后异常不再进入外层 except。`,
      }],
      ['借助 contextlib', '把类版管理器迁移到 contextlib.contextmanager：yield 之前的代码对应 __enter__，之后对应 __exit__，异常会在 yield 处抛出，必须用 try/finally 包住 yield 才能保证释放逻辑执行。课堂对比两种写法的代码量与错误处理位置，体会各自的适用场景。', 'yield 处接异常', {
        title: 'contextlib：生成器上下文管理器',
        language: 'Python',
        code: `from contextlib import contextmanager

@contextmanager
def transaction(events):
    events.append("begin")
    try:
        yield events
    except Exception:
        events.append("rollback")
        raise
    else:
        events.append("commit")
    finally:
        events.append("close")

events = []
with transaction(events) as current:
    current.append("update")
print(events)

events = []
try:
    with transaction(events):
        raise RuntimeError("fail")
except RuntimeError:
    print(events)`,
        output: `['begin', 'update', 'commit', 'close']
['begin', 'rollback', 'close']

yield 前是进入，yield 后根据正常或异常路径收尾。
finally 保证 close 在两路径都执行。`,
      }],
      ['嵌套 with 的释放顺序', '多层 with 按后进先出释放：内层 __exit__ 先执行，外层随后执行，等价于依次调用各对象的清理动作。写两层嵌套并在各自 __exit__ 打印序号，验证异常发生时内层先拿到异常对象、外层随后处理，模仿文件与锁组合使用的真实场景。', '内层先被释放', {
        title: 'Python：嵌套 with 后进先出',
        language: 'Python',
        code: `class Layer:
    def __init__(self, name):
        self.name = name
    def __enter__(self):
        print("enter", self.name)
        return self
    def __exit__(self, exc_type, exc, tb):
        print("exit", self.name, exc_type.__name__ if exc_type else None)
        return False

with Layer("outer"):
    with Layer("inner"):
        print("body")

try:
    with Layer("outer"):
        with Layer("inner"):
            raise ValueError("boom")
except ValueError:
    print("caught")`,
        output: `enter outer
enter inner
body
exit inner None
exit outer None
enter outer
enter inner
exit inner ValueError
exit outer ValueError
caught

退出顺序与进入相反，内层先清理。
异常依次经过两层 __exit__ 后再到外层 except。`,
      }],
      ['释放失败的边界', '若 __enter__ 自身抛异常，__exit__ 不会执行，因此资源获取要放在可能失败步骤的最后，例如先构造连接对象再登录校验；__exit__ 里再抛新错会替换原异常。结合文件对象 flush 失败的例子讨论，理解为什么写盘后要显式 close 并检查结果。', '获取放在最后', {
        title: 'Python：__enter__ 失败不调用 __exit__',
        language: 'Python',
        code: `class Connection:
    def __init__(self, fail):
        self.fail = fail
    def __enter__(self):
        print("enter")
        if self.fail:
            raise ConnectionError("login failed")
        return self
    def __exit__(self, exc_type, exc, tb):
        print("exit")

try:
    with Connection(True):
        print("unreachable")
except ConnectionError as error:
    print("caught", error)

with Connection(False):
    print("ready")`,
        output: `enter
caught login failed
enter
ready
exit

__enter__ 抛错时 with 块未建立，__exit__ 不会执行。
资源获取顺序要把可能失败的登录放在最后。`,
      }],
    ],
  },
  {
    name: pyP2Name('迭代器、生成器和惰性管道'),
    track,
    minutes: 38,
    prerequisite: '已熟悉 for 循环、列表推导式与函数返回值的基本机制。',
    goal: '理解迭代器协议与生成器的挂起恢复机制，能构建惰性求值的处理管道，并预判生成器一次性消费带来的典型错误。',
    guidedPractice: '把一段一次性读入整个日志文件的代码改写成 生成器读行、过滤关键字、汇总计数 的三段惰性管道，用 sys.getsizeof 与计时函数对比改造前后的内存占用和耗时，并把两组数据写进对比表。',
    independentPractice: '不借助现成容器，为一个自定义类手工实现 __iter__/__next__ 使其可被 for 遍历，再等价改写为生成器函数，用同一组断言测试两种实现行为一致，并验证二次遍历时两者同样表现耗尽。',
    commonErrors: ['把生成器对象存入变量后多次遍历，第二次遍历得到空结果。', '在生成器管道中途用 len() 或下标访问，触发 TypeError 而中断流程。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python typing. https://docs.python.org/3/library/typing.html'],
    steps: [
      ['迭代器协议拆解', 'iter(obj) 先查找 __iter__ 方法，找不到时回退到 __getitem__；for 循环等价于反复调用 next 并捕获 StopIteration。课堂上对一个列表手工调用 iter 与 next，观察耗尽后抛出的异常类型，确认 for 只是协议的语法糖而非独立机制。', 'for 循环是语法糖', {
        title: 'Python：手工驱动可迭代对象',
        language: 'Python',
        code: `class Countdown:
    def __init__(self, start):
        self.current = start
    def __iter__(self):
        return self
    def __next__(self):
        if self.current <= 0:
            raise StopIteration
        value = self.current
        self.current -= 1
        return value

counter = Countdown(3)
print(iter(counter) is counter)
print(next(counter), next(counter), next(counter))
try:
    next(counter)
except StopIteration:
    print("done")`,
        output: `True
3 2 1
done

迭代器返回自身并保存当前位置。
耗尽后 __next__ 抛 StopIteration，for 和 next 都依赖该协议。`,
      }],
      ['生成器挂起与恢复', '函数体出现 yield 即成为生成器函数，调用时不执行代码而返回生成器对象；每次 next 执行到 yield 处暂停并交出值，局部变量与执行位置全部保留，下次 next 从暂停点继续。用逐行打印的方式追踪一段完整的三次 next 过程，标出每次停驻的行。', '暂停点可续跑', {
        title: 'Python：观察生成器暂停与恢复',
        language: 'Python',
        code: `def steps():
    print("start")
    value = 10
    yield value
    print("middle", value)
    value += 5
    yield value
    print("end")
    return "finished"

generator = steps()
print(type(generator).__name__)
print(next(generator))
print(next(generator))
try:
    next(generator)
except StopIteration as error:
    print("stop", error.value)`,
        output: `<class 'generator'>
start
10
middle 10
15
end
stop finished

调用 steps 只创建生成器，不执行函数体。
局部变量 value 与执行位置跨 next 保留。`,
      }],
      ['惰性求值与管道', '生成器只有被消费时才计算：把读取文件、过滤、映射各写成一个生成器再串成管道，内存中同一时刻只有一行数据在流动。用 sys.getsizeof 对比列表推导式与生成器表达式持有同等数据时的占用差距，用数据说明惰性的价值。', '边消费边计算', {
        title: 'Python：构建逐行惰性管道',
        language: 'Python',
        code: `import sys

def lines():
    for number in range(100000):
        yield f"ERROR event={number}"

def only_errors(rows):
    for row in rows:
        if row.startswith("ERROR"):
            yield row

def event_ids(rows):
    for row in rows:
        yield row.split("=")[1]

pipeline = event_ids(only_errors(lines()))
print(sys.getsizeof(pipeline))
print([next(pipeline) for _ in range(3)])
materialized = [f"ERROR event={i}" for i in range(100000)]
print(sys.getsizeof(materialized))`,
        output: `200
['0', '1', '2']
5920120

生成器表达式对象只保存少量状态。
元素在被 next 消费时才逐行计算，内存不随十万行线性增长。`,
      }],
      ['只消费一次的陷阱', '生成器耗尽后再次 next 只会抛 StopIteration，不会自动重置；把同一个生成器先后传给两个 sum() 调用，第二个必然得到空结果，而列表可以反复遍历。排查一段把生成器赋给变量后又多次使用的代码，体会迭代器即一次性流的边界。', '耗尽即不能复用', {
        title: 'Python：证明生成器只能消费一次',
        language: 'Python',
        code: `numbers = (value for value in [1, 2, 3])
print(sum(numbers))
print(sum(numbers))

values = [1, 2, 3]
print(sum(values), sum(values))

generator = (value * 2 for value in values)
print(list(generator))
print(list(generator))`,
        output: `6
0
6 6
[2, 4, 6]
[]

生成器第一次 sum 后已耗尽。
列表可重复遍历，而同一个生成器第二次得到空序列。`,
      }],
      ['双向传值机制', '生成器还能通过 send 接收外部值、用 yield from 委托子生成器，这让它天然适合做协程骨架。课堂上演示一个累加器生成器，用 send 送入数字并打印返回值，说明 yield 表达式本身有值，暂停与通信是同一机制的两面。', '双向都能传值', {
        title: 'Python：generator.send 双向通信',
        language: 'Python',
        code: `def accumulator():
    total = 0
    while True:
        received = yield total
        if received is None:
            break
        total += received

generator = accumulator()
print(next(generator))
print(generator.send(5))
print(generator.send(7))
try:
    generator.send(None)
except StopIteration:
    print("completed")`,
        output: `0
5
12
completed

首次 next 执行到第一个 yield，返回 0。
send(5) 成为 yield 表达式的结果，再推进到下一次 yield。`,
      }],
    ],
  },
  {
    name: pyP2Name('装饰器、闭包和 functools'),
    track,
    minutes: 38,
    prerequisite: '已掌握函数作为参数传递、嵌套函数定义与 *args/**kwargs 用法。',
    goal: '理解闭包的 late binding 与装饰器的函数替换本质，能用 functools.wraps 保留元信息，并编写带参数的三层嵌套装饰器。',
    guidedPractice: '从零写一个 @timeit 装饰器统计函数耗时：先裸写 wrapper，再补上 functools.wraps，随后升级为 @timeit(label="排序") 的带参版本，三层嵌套各加一行打印并保存运行截图。',
    independentPractice: '为课程项目里的网络请求函数实现 @retry(times, delay) 带参装饰器，失败时按延迟重试并记录每次尝试日志，用 mock 让请求前两次失败、第三次成功，验证重试次数与日志内容完全吻合。',
    commonErrors: ['装饰器 wrapper 忘加 functools.wraps，被装饰函数的 __name__ 变成 wrapper。', '误以为装饰器逻辑在每次调用时重新执行，把初始化代码写在错误的时机。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'Python typing. https://docs.python.org/3/library/typing.html'],
    steps: [
      ['闭包与晚绑定', '内层函数引用外层变量时保存的是变量本身而非当时的值；循环里定义 lambda i: i*i 后立即调用，全部返回最终值，因为 i 是自由变量、循环结束时才求值。用默认参数 i=i 固定当前值做对照实验，两种写法并排打印结果差异。', '闭包晚绑定变量', {
        title: 'Python：复现闭包晚绑定',
        language: 'Python',
        code: `late = [lambda: i for i in range(3)]
fixed = [lambda i=i: i for i in range(3)]

print([fn() for fn in late])
print([fn() for fn in fixed])
print(late[0].__closure__)
print(late[0].__code__.co_freevars)`,
        output: `[2, 2, 2]
[0, 1, 2]
(<cell at 0x...: int object at ...>,)
('i',)

late 中所有闭包共享同一个自由变量 i。
默认参数 i=i 在定义时把当前值绑定进参数，避免晚绑定。`,
      }],
      ['装饰器即函数替换', '@decorator 只是 func = decorator(func) 的语法糖：原函数对象被返回的新函数覆盖，模块命名空间里的名字指向包装器。打印装饰前后的函数 id，再手动执行不带 @ 的等价赋值语句，验证两种写法产物完全一致，理解 @ 符号没有任何魔法。', '名字指向包装器', {
        title: 'Python：比较 @ 语法与手动替换',
        language: 'Python',
        code: `def uppercase(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs).upper()
    return wrapper

def greet(name):
    return f"hello {name}"

manual = uppercase(greet)

@uppercase
def decorate(name):
    return f"hello {name}"

print(manual("Ada"))
print(decorate("Ada"))
print(manual.__name__, decorate.__name__)
print(type(manual).__name__, type(decorate).__name__)`,
        output: `HELLO ADA
HELLO ADA
wrapper wrapper
function function

manual 与 @ 语法都生成 wrapper 函数对象。
原 greet/decorate 名称已被包装器替换，因此 __name__ 也变成 wrapper。`,
      }],
      ['wraps 保住元信息', '包装后 __name__、__doc__ 会变成 wrapper 自己的，help 输出与日志记录随之失真；在 wrapper 上加 @functools.wraps(func) 可把原函数的元数据拷贝回来。分别打印有无 wraps 时的 __name__ 与 __doc__，观察差异并说明它对调试与文档的意义。', '元数据要回填', {
        title: 'functools.wraps：恢复函数元信息',
        language: 'Python',
        code: `from functools import wraps

def without_wraps(fn):
    def wrapper(*args):
        return fn(*args)
    return wrapper

def with_wraps(fn):
    @wraps(fn)
    def wrapper(*args):
        return fn(*args)
    return wrapper

def charge(amount: int) -> str:
    """Charge one order."""
    return f"charged {amount}"

bare = without_wraps(charge)
kept = with_wraps(charge)
print(bare.__name__, bare.__doc__, bare.__annotations__)
print(kept.__name__, kept.__doc__, kept.__annotations__)`,
        output: `wrapper None {}
charge Charge one order. {'amount': <class 'int'>, 'return': <class 'str'>}

无 wraps 时元数据全部指向 wrapper。
wraps 拷贝名称、文档、注解和模块信息，调试与文档工具才能看到原函数。`,
      }],
      ['带参装饰器三层结构', '带参数的装饰器本质是工厂返回装饰器：外层收参数，中层收函数，内层收调用参数，共三层嵌套。写一个 @retry(times=3) 的骨架并逐层加 print，跑一次真实调用，看清三层各自的触发时机与执行顺序，画出调用关系图。', '三层各管一段', {
        title: 'Python：三层带参重试装饰器',
        language: 'Python',
        code: `def retry(times):
    print("outer", times)
    def decorate(fn):
        print("decorate", fn.__name__)
        def wrapper(*args):
            print("call", args)
            for attempt in range(1, times + 1):
                try:
                    return fn(*args)
                except ConnectionError:
                    if attempt == times:
                        raise
        return wrapper
    return decorate

@retry(times=3)
def fetch(order_id):
    raise ConnectionError(order_id)

try:
    fetch("O-1")
except ConnectionError as error:
    print("failed", error)`,
        output: `outer 3
decorate fetch
call ('O-1',)
failed O-1

外层创建参数，中层接收函数，内层接收每次调用参数。
重试逻辑位于内层 wrapper，共尝试三次。`,
      }],
      ['装饰器的副作用', '装饰器在导入时执行一次，若在其中做重活会拖慢启动；多层装饰器自下而上包裹、执行顺序自上而下。用两个 print 型装饰器叠加验证包裹方向，并讨论断点调试时如何穿过包装层找到原函数栈帧，避免调试时迷路。', '先包后执行倒序', {
        title: 'Python：验证装饰器包裹顺序',
        language: 'Python',
        code: `def first(fn):
    def wrapper():
        print("first-before")
        result = fn()
        print("first-after")
        return result
    return wrapper

def second(fn):
    def wrapper():
        print("second-before")
        result = fn()
        print("second-after")
        return result
    return wrapper

@first
@second
def target():
    print("target")
    return 42

print(target())`,
        output: `first-before
second-before
target
second-after
first-after
42

@second 先包裹 target，@first 再包裹结果。
调用时外层 first 进入，内层 second 再进入，返回顺序相反。`,
      }],
    ],
  },
  {
    name: pyP2Name('typing、Protocol 与泛型'),
    track,
    minutes: 38,
    prerequisite: '已掌握类定义、方法重写与 duck typing 的基本理念。',
    goal: '分清类型注解的静态检查与运行时边界，掌握 Protocol 结构化子类型与 TypeVar 泛型的写法，并建立 mypy 驱动的检查习惯。',
    guidedPractice: '给一段无注解的数据处理函数补全参数与返回值注解，引入一个含 read() 方法的 Source Protocol，再用 TypeVar 写出 first/last 两个泛型工具函数，全程运行 mypy 直到零错误并保存检查报告。',
    independentPractice: '为课程库的存储层定义 CacheProtocol（get/set/delete 三个方法），分别用字典与文件实现两个互不继承的满足类，用 mypy --strict 校验两者可互换传入，并补一个运行时 isinstance 判定的对比用例。',
    commonErrors: ['以为加了注解运行时就会校验类型，错误输入直到深处才崩溃。', '定义 Protocol 后直接用 isinstance 检查，未加 runtime_checkable 而直接报错。'],
    sourceRefs: ['Python typing. https://docs.python.org/3/library/typing.html', 'PEP 544 Protocols. https://peps.python.org/pep-0544/'],
    steps: [
      ['注解只是提示', '函数签名上的类型注解在运行时默认不做任何校验，传错类型照样执行，直到某一行的运算才崩溃；typing.get_type_hints 能读出注解内容，但解释器不会据此拦截调用。课堂演示给声明为 int 的参数传字符串，确认函数照常进入并在运算处报错。', '运行时不设防', {
        title: 'Python：注解不阻止错误调用',
        language: 'Python',
        code: `from typing import get_type_hints

def double(value: int) -> int:
    return value * 2

print(get_type_hints(double))
print(double("2"))
try:
    print(double(None))
except TypeError as error:
    print(type(error).__name__, error)`,
        output: `{'value': <class 'int'>, 'return': <class 'int'>}
22
TypeError unsupported operand type(s) for *: 'NoneType' and 'int'

传入字符串时函数照常执行，得到重复字符串。
类型注解可读取，但解释器不会在调用边界自动校验。`,
      }],
      ['静态检查的价值', 'mypy 在运行前扫描注解，把类型不匹配标成错误，弥补运行时不校验的空档。对同一份错误调用先直接跑 python，再跑 mypy，对比运行深处崩溃的堆栈与检查期即报错的行号定位，体会两者排查成本的差距，形成何时引入检查的判断。', '错误提前暴露', {
        title: 'mypy：在运行前发现错误',
        language: 'Python',
        code: `from typing import TypedDict

class Order(TypedDict):
    id: str
    total: int

def label(order: Order) -> str:
    return order["id"] + ":" + order["total"]

print(label({"id": "O-1", "total": "100"}))`,
        output: `$ python demo.py
TypeError: can only concatenate str (not "int") to str
$ mypy demo.py
demo.py:9: error: Unsupported operand types for + ("str" and "int")
Found 1 error in 1 file

运行时直到拼接才失败。
mypy 在调用和函数体内提前指出字段类型错误。`,
      }],
      ['协议与结构化子类型', 'PEP 544 的 Protocol 按对象有没有这些方法判定兼容，不要求继承声明：定义一个含 draw() 方法的 Drawable 协议，任何长出 draw 方法的类都自动满足该协议，鸭子类型从此有了静态检查层面的表达。现场新增一个满足类，验证 mypy 不再报错。', '看方法不看出处', {
        title: 'typing.Protocol：结构化接口',
        language: 'Python',
        code: `from typing import Protocol

class Exporter(Protocol):
    def export(self, rows: list[dict]) -> bytes: ...

class CsvExporter:
    def export(self, rows):
        return "\\n".join(",".join(row) for row in rows).encode()

class JsonExporter:
    def export(self, rows):
        import json
        return json.dumps(rows).encode()

def persist(exporter: Exporter, rows):
    payload = exporter.export(rows)
    print(type(exporter).__name__, payload[:20])

persist(CsvExporter(), [{"id": "1"}])
persist(JsonExporter(), [{"id": "1"}])`,
        output: `CsvExporter b'id'
JsonExporter b'[{"id": "1"}]'

两个类都没有继承 Exporter，mypy 仍按 export 方法识别。
Protocol 把鸭子类型变成静态可检查的接口。`,
      }],
      ['TypeVar 泛型约束', 'TypeVar("T") 让同一函数的入参与返回值保持同一类型：写成 def first(items: list[T]) -> T，传入 list[int] 则返回值被推断为 int。对比不加泛型时只能注解为 Any 而丢失推断的差别，两版都在 mypy 下复测，观察提示信息的具体程度变化。', '进出同一类型', {
        title: 'TypeVar：保持进出类型一致',
        language: 'Python',
        code: `from typing import TypeVar

T = TypeVar("T")

def first(items: list[T]) -> T:
    if not items:
        raise ValueError("empty")
    return items[0]

number = first([1, 2, 3])
text = first(["a", "b"])
print(number + 1)
print(text.upper())

# mypy 能看到 number 是 int、text 是 str；
# 若返回 Any，后续 +1 与 upper 都不会得到精确检查。`,
        output: `2
A

同一 TypeVar 让 list[int] 推断返回 int，list[str] 推断返回 str。
mypy 能继续检查 number + 1 与 text.upper 的类型正确性。`,
      }],
      ['协议与抽象基类取舍', 'ABC 需要显式继承，且可用 register 登记第三方类；Protocol 无侵入，但要在运行时配合 isinstance 需加 typing.runtime_checkable 装饰器。两种写法各实现一次同一接口，比较代码耦合度与 isinstance 支持的差异，总结选型依据。', '按场景选机制', {
        title: 'Python：ABC 与 Protocol 对比',
        language: 'Python',
        code: `from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

class SinkABC(ABC):
    @abstractmethod
    def write(self, data): ...

class FileSink(SinkABC):
    def write(self, data):
        print("write", len(data))

@runtime_checkable
class SinkProtocol(Protocol):
    def write(self, data): ...

class SocketSink:
    def write(self, data):
        print("socket", len(data))

print(isinstance(FileSink(), SinkABC))
print(isinstance(SocketSink(), SinkProtocol))
FileSink().write("abc")
SocketSink().write(b"abc")`,
        output: `True
True
write 3
socket 3

ABC 提供显式继承与抽象方法强制实现。
Protocol 不要求继承，runtime_checkable 后才支持 isinstance。`,
      }],
    ],
  },
  {
    name: pyP2Name('语言机制综合实验'),
    track,
    minutes: 38,
    prerequisite: '已完成本阶段前五课时并保留各自的练习代码文件。',
    goal: '把上下文管理器、生成器与装饰器三种机制组合成可复用组件，识别机制交互时的一次性消费与执行时机等边界问题。',
    guidedPractice: '两人一组把计时上下文、重试装饰器、惰性读取器三段已有代码拼成一个三十行以内的日志分析脚本：装饰器控制重试，with 管理文件，生成器做过滤管道，现场跑通并在代码注释里标记每处机制的作用。',
    independentPractice: '独立完成一个 @timed_retry(times=3, lazy=True) 组合组件：同步路径直接计时重试，传入生成器工厂时每次重试重建流，用 pytest 覆盖首次成功、重试后成功、重试耗尽抛错三条路径并输出覆盖率。',
    commonErrors: ['用重试装饰器包生成器后重复消费同一条已耗尽的流，重试得到空结果。', '在 __exit__ 里既抑制异常又吞掉返回值，导致外层逻辑误判为成功。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'PEP 343 with Statement. https://peps.python.org/pep-0343/'],
    steps: [
      ['组装计时重试装饰器', '把带参装饰器与上下文管理器组合：外层 @retry(times=3) 控制重试循环，循环体里用 with TimerContext() 计量每次尝试的耗时，异常时借助 __exit__ 拿到的 exc_type 决定是否继续下一轮。跑一个随机失败的模拟请求，观察耗时与重试次数的输出。', '装饰器外层驱动', {
        title: 'Python：计时上下文与重试装饰器',
        language: 'Python',
        code: `import time
from functools import wraps

class Timer:
    def __init__(self, attempt):
        self.attempt = attempt
    def __enter__(self):
        self.start = time.perf_counter()
        return self
    def __exit__(self, exc_type, exc, tb):
        elapsed = (time.perf_counter() - self.start) * 1000
        print("attempt", self.attempt, "ms", round(elapsed, 1), "error", exc_type.__name__ if exc_type else None)

def timed_retry(times):
    def decorate(fn):
        @wraps(fn)
        def wrapper(*args):
            for attempt in range(1, times + 1):
                with Timer(attempt):
                    try:
                        return fn(*args)
                    except ConnectionError:
                        if attempt == times:
                            raise
        return wrapper
    return decorate

calls = {"count": 0}
@timed_retry(3)
def fetch():
    calls["count"] += 1
    if calls["count"] < 3:
        raise ConnectionError("temporary")
    return "ok"

print(fetch())`,
        output: `attempt 1 ms 0.2 error ConnectionError
attempt 2 ms 0.1 error ConnectionError
attempt 3 ms 0.1 error None
ok

每次尝试由上下文管理器单独计时和记录异常。
装饰器只在成功后返回，前两次失败没有泄露结果。`,
      }],
      ['惰性行读取器实现', '写一个 read_lines(path) 生成器，用 with open(path) 保证异常时文件句柄释放，逐行 yield 并支持按前缀过滤参数；演示在读取一半时抛出 KeyboardInterrupt，确认 __exit__ 已经执行、句柄已关闭，用操作系统命令核对文件不再被占用。', '边读边保释放', {
        title: 'Python：生成器逐行读取并及时关闭',
        language: 'Python',
        code: `from pathlib import Path

def read_errors(path):
    with Path(path).open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            if line.startswith("ERROR"):
                yield number, line.rstrip()

Path("app.log").write_text("INFO start\\nERROR bad\\nINFO ok\\nERROR worse\\n", encoding="utf-8")
stream = read_errors("app.log")
print(next(stream))
stream.close()
print("closed", stream.gi_frame is None)
print(list(read_errors("app.log")))`,
        output: `(2, 'ERROR bad')
closed True
[(2, 'ERROR bad'), (4, 'ERROR worse')]

with 在生成器关闭或耗尽时退出，文件句柄释放。
重新调用生成器函数会得到新的流，从文件开头读取。`,
      }],
      ['机制交互的边界一', '装饰器包裹生成器函数时，wrapper 在调用瞬间就执行，而函数体要等到第一次 next 才运行；若在 wrapper 里统计整体耗时，测到的只是调用的那一瞬。用计时装饰器包一个生成器函数做实验，观察耗时读数与直觉预期的偏差并解释成因。', '先执行有错位', {
        title: 'Python：装饰器计时生成器创建',
        language: 'Python',
        code: `import time
from functools import wraps

def timed(fn):
    @wraps(fn)
    def wrapper(*args):
        start = time.perf_counter()
        result = fn(*args)
        elapsed = (time.perf_counter() - start) * 1000
        print("wrapper-ms", round(elapsed, 2), type(result).__name__)
        return result
    return wrapper

@timed
def rows():
    for i in range(3):
        time.sleep(0.1)
        yield i

stream = rows()
print("created", stream.gi_frame.f_lasti)
print(list(stream))`,
        output: `wrapper-ms 0.01 generator
created -1
[0, 1, 2]

装饰器只计量生成器对象创建，实际函数体尚未启动。
第一次 next 后才执行 sleep 和 yield，整体耗时不在 wrapper 统计内。`,
      }],
      ['机制交互的边界二', '重试装饰器内部直接 for line in 生成器时，第一次尝试耗尽流之后重试，第二次拿到的是空结果，一次性消费与重试逻辑直接冲突。改造方案是重试时重新调用工厂函数获取新生成器，实测两种写法的输出差异，记录这条边界结论。', '重试须重建流', {
        title: 'Python：重试时重建生成器工厂',
        language: 'Python',
        code: `def broken_retry(factory):
    stream = factory()
    for attempt in range(2):
        rows = list(stream)
        print("attempt", attempt, rows)

def fixed_retry(factory):
    for attempt in range(2):
        rows = list(factory())
        print("attempt", attempt, rows)

def source():
    yield from ["a", "b"]

broken_retry(source)
fixed_retry(source)`,
        output: `attempt 0 ['a', 'b']
attempt 1 []
attempt 0 ['a', 'b']
attempt 1 ['a', 'b']

broken 复用同一个已耗尽生成器，第二次为空。
fixed 在每次尝试时调用工厂，创建新的流。`,
      }],
      ['打包为可复用组件', '把计时、重试、惰性读取三件套整理进 utils.py：装饰器放顶层并带 functools.wraps，管理器与生成器各占一节，补上类型注解与 docstring，附一个最小使用示例，让后续 P3 项目可以直接 import 复用而不必重写。', '组件即取即用', {
        title: 'Python：打包可复用机制组件',
        language: 'Python',
        code: `from pathlib import Path

Path("utils.py").write_text('''
from contextlib import contextmanager
from functools import wraps
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    yield
    print(label, round((time.perf_counter() - start) * 1000, 1), "ms")

def retry(times):
    def decorate(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except OSError:
                    if attempt == times:
                        raise
        return wrapper
    return decorate

def read_lines(path):
    with open(path, encoding="utf-8") as handle:
        yield from handle
''')

from utils import timer, retry, read_lines

with timer("read"):
    print(len(list(read_lines("app.log"))))
print(read_lines.__annotations__)`,
        output: `read 0.1 ms
4
{}

timer、retry 与 read_lines 成为可导入组件。
下一步可补类型注解和单元测试，并在 P3 项目中复用。`,
      }],
    ],
  },
];

// ── P3 文件、网络、数据库与异步 ─────────────────────────────────────────────
const pyP3Stage = '文件、网络、数据库与异步';
const pyP3Name = (topic: string) => `Python · ${pyP3Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP3Name('pathlib、流、编码和文件边界'),
    track,
    minutes: 38,
    prerequisite: '已掌握 Python 基本数据结构与函数定义，能用命令行运行脚本。',
    goal: '能用 pathlib 完成跨平台路径操作，显式声明编码并区分文本与二进制模式，对流式读写建立缓冲语义认知，最终独立处理大文件而不撑爆内存。',
    guidedPractice: '现场用 Path.glob 扫描一个日志目录并统计每个文件的行数与编码类型，产出一个流式统计脚本和一份带失败记录的运行输出。',
    independentPractice: '编写脚本把一个混合编码目录批量转成 UTF-8，对解码失败的文件按 errors 策略记录清单，输出转换报告并验证无句柄泄漏。',
    commonErrors: ['用字符串拼接构造路径，反斜杠转义与平台分隔符差异导致跨机器运行报错。', '打开文件不显式传 encoding，依赖平台默认编码，换机器读出乱码或抛 UnicodeDecodeError。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'PEP 428 pathlib. https://peps.python.org/pep-0428/'],
    steps: [
      ['Path 对象与路径运算', 'pathlib、流、编码和文件边界先把路径对象化：Path("logs") / "app.log" 用 / 运算符拼接，分隔符随平台自动决定；resolve() 解析 .. 与符号链接，glob("*.log") 惰性枚举目录。', '对象化路径操作', {
        title: 'pathlib：构造、解析与枚举路径',
        language: 'Python',
        code: `from pathlib import Path

root = Path("data") / "logs"
root.mkdir(parents=True, exist_ok=True)
(root / "app.log").write_text("ok", encoding="utf-8")
(root / "worker.log").write_text("ok", encoding="utf-8")
(root / "notes.txt").write_text("skip", encoding="utf-8")

print((root / ".." / "logs" / "app.log").resolve())
print(sorted(path.name for path in root.glob("*.log")))
print((root / "app.log").suffix, (root / "app.log").stem)`,
        output: `C:\\work\\data\\logs\\app.log
['app.log', 'worker.log']
.log app

/ 运算自动选择平台分隔符，resolve 规范化 ..。
glob 只返回匹配文件，路径对象可继续取 stem、suffix 和父目录。`,
      }],
      ['文本与二进制模式', 'open 默认文本模式，编码随平台变化（Windows 常为 cp936），必须显式 encoding="utf-8"；换行归一成 \\n，传 newline="" 可关闭。"rb" 返回 bytes 不解码，图片与网络报文必须二进制。', '模式与编码声明', {
        title: 'Python：比较文本与二进制读取',
        language: 'Python',
        code: `from pathlib import Path

path = Path("message.txt")
path.write_bytes("你好\\r\\nworld".encode("utf-8"))

with path.open("r", encoding="utf-8") as handle:
    text = handle.read()
with path.open("rb") as handle:
    raw = handle.read()

print(repr(text), type(text).__name__)
print(raw[:12], type(raw).__name__)
print(text.startswith("你好"), raw.startswith("你".encode()))`,
        output: `'你好\\nworld' str
b'\\xe4\\xbd\\xa0\\xe5\\xa5\\xbd\\r\\nworld' bytes
True True

文本模式按 UTF-8 解码并做换行转换。
二进制模式保留 CRLF 与原始字节，不解码。`,
      }],
      ['with 块与缓冲语义', 'with open(...) as f 退出时自动 close()，把约 8KB 用户态缓冲刷进内核并释放描述符；close 前崩溃会丢最后不满一页的数据，关键写入要 flush()。不关闭只堆积句柄，进程退出才回收。', '缓冲与关闭语义', {
        title: 'Python：观察缓冲、flush 与 close',
        language: 'Python',
        code: `from pathlib import Path
import os

path = Path("buffered.log")
handle = path.open("w", encoding="utf-8", buffering=8192)
handle.write("first")
print("before-flush", path.read_text(encoding="utf-8") if path.exists() else "")
handle.flush()
os.fsync(handle.fileno())
print("after-flush", path.read_text(encoding="utf-8"))
handle.write("second")
handle.close()
print("after-close", path.read_text(encoding="utf-8"))
print("closed", handle.closed)`,
        output: `before-flush
after-flush first
after-close firstsecond
closed True

用户态缓冲未 flush 时另一个读取看不到内容。
flush 只推给内核，fsync 才要求落盘；close 会再执行一次 flush。`,
      }],
      ['大文件流式读取', '10GB 日志禁止一次 read()，全量加载是 OOM 主因；for line in f 逐行迭代，或 f.read(65536) 定长块循环，内存只占当前片段。文本模式 seek 只接受 tell() 返回过的位置。', '流式不占内存', {
        title: 'Python：逐行统计而不全量加载',
        language: 'Python',
        code: `from pathlib import Path
import tracemalloc

path = Path("large.log")
with path.open("w", encoding="utf-8") as handle:
    for number in range(200000):
        handle.write(f"{number},ok\\n")

tracemalloc.start()
errors = 0
with path.open(encoding="utf-8") as handle:
    for line in handle:
        if ",error" in line:
            errors += 1
current, peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
print("errors", errors, "peak_bytes", peak)
print("size_bytes", path.stat().st_size)`,
        output: `errors 0 peak_bytes 26718
size_bytes 1388890

文件约 1.3 MB，但逐行迭代峰值内存只有几十 KB。
内存不随文件总大小线性增长。`,
      }],
      ['编码错误与 BOM 边界', 'GBK 文件被按 utf-8 读就会抛 UnicodeDecodeError；errors=strict 抛出、replace 丢原文、ignore 跳过；带 BOM 文件用 utf-8-sig 读剥掉首部 \\ufeff，防止混进首个字段。', '编码边界策略', {
        title: 'Python：处理 BOM 与解码错误',
        language: 'Python',
        code: `from pathlib import Path

bom = Path("bom.csv")
bom.write_bytes("\\ufeffid,name\\n1, Ada\\n".encode("utf-8"))
print(bom.read_text(encoding="utf-8").splitlines()[0][:4])
print(bom.read_text(encoding="utf-8-sig").splitlines()[0])

gbk = Path("gbk.txt")
gbk.write_bytes("订单".encode("gbk"))
try:
    gbk.read_text(encoding="utf-8")
except UnicodeDecodeError as error:
    print("strict", error.start, error.end)
print(gbk.read_text(encoding="utf-8", errors="replace"))`,
        output: `\ufeffid
id,name
strict 0 2
����

utf-8 把 BOM 当普通字符，utf-8-sig 会剥离。
strict 明确报错并给字节范围，replace 只保留可读占位但已丢原文。`,
      }],
    ],
  },
  {
    name: pyP3Name('HTTP 客户端、超时和重试'),
    track,
    minutes: 38,
    prerequisite: '了解 TCP 连接与 HTTP 请求响应流程，会用 pip 安装并使用第三方库。',
    goal: '会用 httpx 显式设置连接与读取超时、复用客户端连接池，按幂等性区分重试策略并实现指数退避，对状态码做分类处理而不是一律当成功或失败。',
    guidedPractice: '用 httpx.Client 封装一个带超时、连接池与重试传输层的客户端类，产出一个对 429 和 5xx 自动指数退避的请求模块及调用示例。',
    independentPractice: '对两个真实公开 API 做对比压测：每次新建连接与复用 Session 的耗时和握手次数差异，输出含数据的对比结论报告。',
    commonErrors: ['调用 requests 或 httpx 时不传 timeout，网络抖动或对端挂起导致线程与协程永久阻塞。', '对非幂等的 POST 接口盲目自动重试，造成重复下单或重复写入等副作用。'],
    sourceRefs: ['HTTPX Documentation. https://www.python-httpx.org/', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['超时为什么必须显式', 'HTTP 客户端、超时和重试的坑在缺省值：requests 的 timeout 默认 None，对端不回包就永久挂起；正确写法 timeout=(connect, read) 分别限建连与两次字节到达的间隔，并非总时长。', '超时默认不存在', {
        title: 'httpx：连接与读取超时分离',
        language: 'Python',
        code: `import httpx, time

timeout = httpx.Timeout(
    connect=0.5,
    read=0.2,
    write=0.5,
    pool=1.0,
)
started = time.perf_counter()
try:
    with httpx.Client(timeout=timeout) as client:
        response = client.get("https://httpbin.org/delay/2")
        response.raise_for_status()
except httpx.ReadTimeout as error:
    print(type(error).__name__, round(time.perf_counter() - started, 2))`,
        output: `ReadTimeout 0.24

连接阶段在 0.5 秒内完成，读取超过 0.2 秒被取消。
timeout 是各阶段阈值，不是整个请求的单一总时长。`,
      }],
      ['连接池与客户端复用', '每次 requests.get 都新建 TCP 并做 TLS 握手，多付两三个 RTT；Session 与 httpx.Client 维护 keep-alive 连接池复用连接。客户端应只建一次并长期复用，勿每请求新建。', '连接复用省握手', {
        title: 'httpx：复用 Client 连接池',
        language: 'Python',
        code: `import httpx, time

url = "https://httpbin.org/get"
start = time.perf_counter()
for _ in range(5):
    httpx.get(url, timeout=3)
print("new-client", round(time.perf_counter() - start, 2))

start = time.perf_counter()
with httpx.Client(timeout=3, limits=httpx.Limits(max_keepalive_connections=5)) as client:
    for _ in range(5):
        client.get(url)
print("shared-client", round(time.perf_counter() - start, 2))
print(client.is_closed)`,
        output: `new-client 1.81
shared-client 0.63
False

每次 httpx.get 创建临时客户端，连接与 TLS 握手重复。
共享 Client 复用 keep-alive 连接，关闭 with 后资源释放。`,
      }],
      ['退避重试与幂等', '连接错误、超时和 5xx 可重试，策略是指数退避：间隔按 2 的 n 次方增长并加抖动，避免重试同时打向服务端形成雪崩；能否重试取决于幂等：GET/PUT/DELETE 可重试，POST 会重复下单，配 Idempotency-Key。', '退避与幂等区分', {
        title: 'httpx：指数退避重试',
        language: 'Python',
        code: `import httpx, random, time

def request_with_retry(client, method, url, **kwargs):
    for attempt in range(4):
        try:
            response = client.request(method, url, **kwargs)
            if response.status_code < 500 and response.status_code != 429:
                return response
        except (httpx.ConnectError, httpx.TimeoutException):
            if attempt == 3:
                raise
        delay = min(8, 0.2 * 2 ** attempt) * random.uniform(0.5, 1.5)
        print("retry", attempt + 1, "after", round(delay, 2))
        time.sleep(delay)
    raise RuntimeError("retry exhausted")

with httpx.Client(timeout=1) as client:
    print(request_with_retry(client, "GET", "http://127.0.0.1:8099/flaky").status_code)`,
        output: `retry 1 after 0.11
retry 2 after 0.43
retry 3 after 0.77
200

延迟按指数增长并带抖动，避免所有客户端同步重试。
POST 只有携带 Idempotency-Key 且服务端支持时才进入同一策略。`,
      }],
      ['状态码分类处理', '响应按类分治：2xx 消费结果；4xx 是客户端错误，重试无意义，该改参数或上报；429 先读 Retry-After 再等待；5xx 进重试通道。raise_for_status() 把 4xx/5xx 转成带状态码的异常。', '状态码分类响应', {
        title: 'httpx：按状态码分流',
        language: 'Python',
        code: `import httpx

requests = [
    ("http://127.0.0.1:8099/ok", None),
    ("http://127.0.0.1:8099/bad", None),
    ("http://127.0.0.1:8099/limited", "Retry-After"),
    ("http://127.0.0.1:8099/down", None),
]
with httpx.Client(timeout=1) as client:
    for url, header in requests:
        response = client.get(url)
        if response.is_success:
            print("success", response.status_code)
        elif response.status_code == 429:
            print("retry-after", response.headers.get(header))
        elif 500 <= response.status_code < 600:
            print("retryable", response.status_code)
        else:
            print("client-error", response.status_code, response.json()["code"])`,
        output: `success 200
client-error 400 INVALID_PARAMETER
retry-after 3
retryable 503

2xx 正常消费，400 立即上报，429 读 Retry-After，503 进入重试。
不同状态码不会共用同一粗暴处理分支。`,
      }],
      ['封装稳健的客户端', '组合成可复用模块：构造 Client 时固定 timeout 与 Limits，挂退避重试传输层；异常按 ConnectTimeout、ReadTimeout 分层捕获，日志带 URL、状态码与耗时；模拟 503 与超时，验证重试正确触发。', '封装稳健客户端', {
        title: 'Python：封装带超时和重试的客户端',
        language: 'Python',
        code: `import httpx, logging, time

log = logging.getLogger("orders-client")

class OrdersClient:
    def __init__(self, base_url):
        self.client = httpx.Client(
            base_url=base_url,
            timeout=httpx.Timeout(connect=0.5, read=2.0, write=1.0, pool=1.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    def get_order(self, order_id):
        started = time.perf_counter()
        response = self.client.get(f"/orders/{order_id}")
        log.info("GET %s status=%s ms=%.1f", response.request.url,
                 response.status_code, (time.perf_counter() - started) * 1000)
        response.raise_for_status()
        return response.json()
    def close(self):
        self.client.close()

client = OrdersClient("http://127.0.0.1:8099")
try:
    print(client.get_order("O-1"))
except httpx.HTTPError as error:
    print(type(error).__name__)
finally:
    client.close()`,
        output: `INFO GET http://127.0.0.1:8099/orders/O-1 status=200 ms=3.2
{'id': 'O-1', 'status': 'PAID'}
client closed

超时、连接池、基础 URL 和日志集中在一个客户端对象。
调用方只处理业务结果和标准化 httpx 异常。`,
      }],
    ],
  },
  {
    name: pyP3Name('SQL、连接、事务和参数化查询'),
    track,
    minutes: 38,
    prerequisite: '已会基本 SELECT 与 INSERT 语法，了解关系表的主键与外键约束。',
    goal: '理解参数化查询阻断注入的底层机制，能配置连接池并合理划定事务边界与隔离级别，用 with 语句保证提交与回滚语义正确，掌握批量写入的提交粒度。',
    guidedPractice: '用 SQLAlchemy 写参数化查询加事务批量转账的代码，现场演示拼接 SQL 被注入失败、参数化版本安全通过，产出对照用例与执行日志。',
    independentPractice: '对比逐行提交与整批事务写入一万行数据的耗时差异，再用 EXPLAIN 分析一条慢查询，输出优化前后的执行计划对比。',
    commonErrors: ['用字符串拼接构造 SQL，把用户输入直接嵌入语句，形成可被利用的注入点。', '在事务内部调用外部 HTTP 接口或长时间不提交，导致锁等待与连接池堆积耗尽。'],
    sourceRefs: ['SQLAlchemy Documentation. https://docs.sqlalchemy.org/', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['参数化查询防注入原理', 'SQL、连接、事务和参数化查询的注入根源是代码与数据不分：拼接 WHERE name=\'" + user + "\' 让输入变成代码；参数化把语句结构与值分开发送，驱动预编译占位符语句，值只作绑定参数，引号无法闭合表达式。', '注入被结构阻断', {
        title: 'SQLite：拼接 SQL 与参数化对比',
        language: 'Python',
        code: `import sqlite3

db = sqlite3.connect(":memory:")
db.execute("create table users(id integer primary key, name text)")
db.execute("insert into users(name) values ('Ada')")

payload = "' OR 1=1 --"
unsafe = f"select id, name from users where name = '{payload}'"
print("unsafe-sql", unsafe)
print("unsafe-rows", db.execute(unsafe).fetchall())
print("safe-rows", db.execute(
    "select id, name from users where name = ?", (payload,)
).fetchall())`,
        output: `unsafe-sql select id, name from users where name = '' OR 1=1 --'
unsafe-rows [(1, 'Ada')]
safe-rows []

拼接输入把后半句变成 SQL 条件，返回全部用户。
参数化把 payload 当纯值，找不到同名用户。`,
      }],
      ['连接池与池化复用', '新建连接要 TCP 握手加认证，几十毫秒起步，并发下还会撞 max_connections；连接池预先建连反复出借，pool_size 控制常驻、max_overflow 临时扩容、pool_pre_ping 出借前探活。', '池化复用连接', {
        title: 'SQLAlchemy：配置连接池',
        language: 'Python',
        code: `from sqlalchemy import create_engine, text

engine = create_engine(
    "postgresql+psycopg://app:secret@db/orders",
    pool_size=5,
    max_overflow=5,
    pool_timeout=2,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo_pool="debug",
)
with engine.connect() as conn:
    print(conn.execute(text("select 1")).scalar_one())
pool = engine.pool
print(pool.size(), pool.checkedin(), pool.checkedout(), pool.overflow())`,
        output: `1
Pool connect: db:5432
5 1 0 0

池大小 5，最多临时扩到 10，出借前 ping 探活。
连接回收到池中，不随每次请求重新认证。`,
      }],
      ['事务边界与隔离级别', '事务以 BEGIN 开始、COMMIT 或 ROLLBACK 结束；隔离级别从读未提交到串行化逐级加强，对应消除脏读、不可重复读与幻读，MySQL 默认可重复读，PostgreSQL 默认读已提交。事务短，开启越久锁越多。', '隔离级别决定可见', {
        title: 'SQLAlchemy：阅读隔离与事务窗口',
        language: 'Python',
        code: `from sqlalchemy import create_engine

engine = create_engine("postgresql+psycopg://app:secret@db/orders")
with engine.connect() as conn:
    level = conn.exec_driver_sql("show transaction isolation level").scalar_one()
    print("isolation", level)
    with conn.begin():
        conn.exec_driver_sql("update accounts set balance=balance-10 where id='A'")
        conn.exec_driver_sql("update accounts set balance=balance+10 where id='B'")
    print("committed")

print("pool checkedout", engine.pool.checkedout())`,
        output: `isolation READ COMMITTED
committed
pool checkedout 0

PostgreSQL 默认 READ COMMITTED。
两条更新在同一短事务内提交，提交后连接归还池。`,
      }],
      ['with conn 提交回滚', 'with engine.begin() as conn 正常结束自动 COMMIT，异常退出自动 ROLLBACK，等价于手写 try/except/finally 但不会漏；sqlite3 的 with conn 同语义。', '异常自动回滚', {
        title: 'SQLAlchemy：异常自动回滚',
        language: 'Python',
        code: `from sqlalchemy import create_engine, text

engine = create_engine("sqlite:///tx.db")
with engine.begin() as conn:
    conn.execute(text("create table if not exists account(id text primary key, balance int)"))
    conn.execute(text("insert or replace into account values ('A', 100)"))

try:
    with engine.begin() as conn:
        conn.execute(text("update account set balance=balance-10 where id='A'"))
        raise RuntimeError("payment failed")
except RuntimeError as error:
    print(type(error).__name__, error)

with engine.connect() as conn:
    print(conn.execute(text("select balance from account where id='A'")).scalar_one())`,
        output: `RuntimeError payment failed
100

异常退出 engine.begin 自动 ROLLBACK。
扣款更新未提交，余额仍是 100。`,
      }],
      ['批量写入与提交粒度', 'executemany 与批量语句把 N 次网络往返压成一次；每行 commit 让 fsync 次数线性爆炸，整批一个事务快几个数量级，代价是锁窗口变长；upsert 用 ON CONFLICT 幂等写入，EXPLAIN 确认命中索引。', '批量提交提速', {
        title: 'SQLite：批量插入与提交粒度',
        language: 'Python',
        code: `import sqlite3, time

rows = [(f"O-{i}", "CREATED") for i in range(20000)]
for mode in ["per-row", "batch"]:
    db = sqlite3.connect(f"{mode}.db")
    db.execute("create table orders(id text primary key, status text)")
    started = time.perf_counter()
    if mode == "per-row":
        for row in rows:
            db.execute("insert into orders values (?, ?)", row)
            db.commit()
    else:
        with db:
            db.executemany("insert into orders values (?, ?)", rows)
    print(mode, round(time.perf_counter() - started, 2), db.execute("select count(*) from orders").fetchone()[0])
    db.close()`,
        output: `per-row 8.41 20000
batch 0.06 20000

逐行 commit 触发两万次事务提交。
executemany 在一个事务中批量写入，速度快两个数量级。`,
      }],
    ],
  },
  {
    name: pyP3Name('asyncio 事件循环、任务和取消'),
    track,
    minutes: 38,
    prerequisite: '已理解函数调用栈与生成器概念，写过基本的同步网络或文件处理脚本。',
    goal: '能解释事件循环的单线程调度机制与 await 的控制权交接，正确区分协程与 Task，用 gather 管理并发与异常传播，并实现可被干净取消的协程。',
    guidedPractice: '用 asyncio.gather 并发抓取一组 URL，产出一个带超时、能逐任务收集异常的并发调度脚本，并打印每个任务的完成状态与耗时。',
    independentPractice: '实现一个可取消的下载器：被 cancel 后保留已下载分片、执行 finally 清理并输出日志，验证取消路径确实执行完整。',
    commonErrors: ['调用 async 函数后忘记 await，返回的协程对象被丢弃，里面的逻辑静默不执行。', '捕获 CancelledError 后不重新抛出，任务无法被取消，事件循环退出时卡在 pending 任务上。'],
    sourceRefs: ['Python asyncio. https://docs.python.org/3/library/asyncio.html', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['事件循环单线程调度', 'asyncio 事件循环、任务和取消的本质是单线程调度：循环维护就绪回调队列，靠 epoll 等多路复用等待网络事件，一个线程并发跑上万协程；协程是并发等待不是并行计算；循环一旦被阻塞，所有任务的定时器与回调全部停摆。', '单线程调度并发', {
        title: 'asyncio：单线程并发多个等待',
        language: 'Python',
        code: `import asyncio, time

async def wait(name, seconds):
    started = time.perf_counter()
    await asyncio.sleep(seconds)
    print(name, round(time.perf_counter() - started, 2))

async def main():
    started = time.perf_counter()
    await asyncio.gather(wait("a", 0.3), wait("b", 0.3), wait("c", 0.3))
    print("total", round(time.perf_counter() - started, 2))

asyncio.run(main())`,
        output: `a 0.3
b 0.3
c 0.3
total 0.31

三个等待在同一线程的事件循环中并发。
总耗时接近最慢协程，而不是三者相加。`,
      }],
      ['await 让出控制权', 'await 是唯一挂起点：协程在此把控制权交还事件循环，状态存成可恢复的状态机，事件就绪再排回队列继续；普通函数调用不经 await 就不切换，混入同步长循环同样阻塞全局；调用 async def 只返回协程对象，不执行函数体。', '挂起交还控制权', {
        title: 'asyncio：await 前后控制流',
        language: 'Python',
        code: `import asyncio, time

async def worker(name, delay):
    print("start", name)
    await asyncio.sleep(delay)
    print("end", name)

async def main():
    coroutine = worker("solo", 0.1)
    print(type(coroutine).__name__)
    await coroutine

    started = time.perf_counter()
    await asyncio.gather(worker("a", 0.2), worker("b", 0.2))
    print("gather", round(time.perf_counter() - started, 2))

asyncio.run(main())`,
        output: `<class 'coroutine'>
start solo
end solo
start a
start b
end a
end b
gather 0.2

创建协程对象不会执行函数体，await 后才进入。
sleep 挂起后事件循环切换执行另一个 worker。`,
      }],
      ['Task 与协程的区别', '裸协程必须被 await 才执行；create_task(coro) 把它包成 Task 立即排入循环调度；Task 有 pending/finished/cancelled 状态；asyncio.run(main) 启动循环并负责关闭。', '任务立即调度', {
        title: 'asyncio：比较协程与 Task 状态',
        language: 'Python',
        code: `import asyncio

async def work():
    await asyncio.sleep(0.1)
    return 42

async def main():
    coroutine = work()
    print("coroutine-created", coroutine.cr_await)
    task = asyncio.create_task(work())
    print("task-pending", task.done(), task.cancelled())
    await asyncio.sleep(0)
    value = await task
    print("task-done", task.done(), task.cancelled(), value)

asyncio.run(main())`,
        output: `coroutine-created None
task-pending False False
task-done True False 42

裸协程只有被 await 才真正运行。
create_task 立即排入循环，Task 可查询 pending、done 与 cancelled 状态。`,
      }],
      ['取消是协作式中断', 'task.cancel() 不强杀，只在下一个 await 点注入 CancelledError，取消因此是协作式的：协程必须把异常继续抛出才算真取消；捕获后吞掉会让任务无法终止；资源释放统一放 finally 或 __aexit__。', '取消依赖配合', {
        title: 'asyncio：取消在 await 点生效',
        language: 'Python',
        code: `import asyncio

async def download():
    try:
        print("start")
        await asyncio.sleep(10)
        print("unreachable")
    except asyncio.CancelledError:
        print("cancelled")
        raise
    finally:
        print("cleanup")

async def main():
    task = asyncio.create_task(download())
    await asyncio.sleep(0.1)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("task.cancelled", task.cancelled())

asyncio.run(main())`,
        output: `start
cancelled
cleanup
task.cancelled True

cancel 在 sleep 的 await 点注入 CancelledError。
捕获后重新 raise，finally 清理且 Task 最终标记 cancelled。`,
      }],
      ['gather 异常传播', 'gather 默认 return_exceptions=False，任一子任务抛异常立即向上传播，其余任务仍在运行但结果丢弃；传 True 则异常逐个收集便于处理；wait_for 超时会取消子任务并抛 TimeoutError。', '异常传播规则', {
        title: 'asyncio：gather 收集异常',
        language: 'Python',
        code: `import asyncio

async def ok():
    await asyncio.sleep(0.1)
    return "ok"

async def fail():
    await asyncio.sleep(0.2)
    raise ValueError("bad job")

async def main():
    results = await asyncio.gather(ok(), fail(), return_exceptions=True)
    print([type(item).__name__ if isinstance(item, Exception) else item for item in results])
    try:
        await asyncio.gather(ok(), fail())
    except ValueError as error:
        print("raised", error)

asyncio.run(main())`,
        output: `['ok', 'ValueError']
raised bad job

return_exceptions=True 把异常作为结果逐个返回。
默认模式任一异常立即向 gather 调用方传播。`,
      }],
    ],
  },
  {
    name: pyP3Name('阻塞调用、线程池和进程池'),
    track,
    minutes: 38,
    prerequisite: '已完成 asyncio 事件循环与任务管理一课，理解协程与 Task 的区别。',
    goal: '能识别阻塞调用对事件循环的冻结效应，会用 asyncio.to_thread 与执行器把阻塞代码下沉到线程或进程，并按 IO 与 CPU 密集正确选型线程池或进程池。',
    guidedPractice: '把一段同步 requests 与一段纯 Python 计算，分别迁移到 asyncio.to_thread 与 ProcessPoolExecutor，产出一组迁移前后的耗时对比数据表。',
    independentPractice: '给现有异步服务开启 debug 模式检测阻塞：记录执行超过 100 毫秒的回调，定位阻塞点并输出一份带证据的排查报告。',
    commonErrors: ['在协程里直接调用 time.sleep 或同步数据库驱动，阻塞事件循环使全部并发任务停摆。', '把大对象传给进程池，pickle 序列化开销反超计算本身，甚至因不可序列化抛 BrokenProcessPool。'],
    sourceRefs: ['Python asyncio. https://docs.python.org/3/library/asyncio.html', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['一次阻塞冻住全场', '阻塞调用、线程池和进程池从同一现象出发：协程里调用 time.sleep 或同步 requests，事件循环被卡住，所有任务与定时器停摆，表现为服务无响应而 CPU 占用极低；开 debug 模式可查超 100 毫秒的回调。', '阻塞冻结全场', {
        title: 'asyncio：同步 sleep 冻结所有任务',
        language: 'Python',
        code: `import asyncio, time

async def blocker():
    time.sleep(0.5)
    return "blocked"

async def heartbeat():
    for number in range(4):
        await asyncio.sleep(0.1)
        print("heartbeat", number, round(time.perf_counter() - start, 2))

async def main():
    global start
    start = time.perf_counter()
    await asyncio.gather(blocker(), heartbeat())

asyncio.run(main())`,
        output: `heartbeat 0 0.6
heartbeat 1 0.7
heartbeat 2 0.8
heartbeat 3 0.9

blocker 的 time.sleep 占住整个事件循环 0.5 秒。
heartbeat 直到阻塞结束才开始获得调度。`,
      }],
      ['阻塞下沉到执行器', '把阻塞函数移出循环：loop.run_in_executor(None, func) 丢进默认 ThreadPoolExecutor 并返回可 await 的 Future；3.9 起用 asyncio.to_thread 更省事。', '阻塞下沉线程', {
        title: 'asyncio.to_thread：隔离阻塞调用',
        language: 'Python',
        code: `import asyncio, threading, time

def blocking_read():
    time.sleep(0.5)
    return threading.current_thread().name

async def main():
    started = time.perf_counter()
    result, beat = await asyncio.gather(
        asyncio.to_thread(blocking_read),
        asyncio.sleep(0.1, result="heartbeat"),
    )
    print(result, beat, round(time.perf_counter() - started, 2))

asyncio.run(main())`,
        output: `asyncio_0 heartbeat 0.51

blocking_read 在默认线程池执行，事件循环保持可调度。
sleep 定时器在 0.1 秒触发，总等待由最慢线程决定。`,
      }],
      ['GIL 与 IO 密集线程池', 'CPython 的 GIL 保证同一时刻只有一个线程执行字节码，纯 Python 计算多线程不会更快；但线程等待 IO（网络、磁盘）时会释放 GIL，所以线程池适合 IO 密集并发，几十个线程同时挂起等 socket，吞吐随线程数提升。', 'GIL 限制并行', {
        title: 'Python：线程池执行阻塞 IO',
        language: 'Python',
        code: `from concurrent.futures import ThreadPoolExecutor
import time

def io_task(number):
    time.sleep(0.2)
    return number

def cpu_task(number):
    total = 0
    for value in range(3_000_000):
        total += value
    return number + total

for label, function in [("io", io_task), ("cpu", cpu_task)]:
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(function, range(8)))
    print(label, round(time.perf_counter() - started, 2))`,
        output: `io 0.42
cpu 1.74

8 个 sleep 任务以 4 线程并发等待，时间接近两轮 0.2 秒。
CPU 计算受 GIL 限制，多线程没有四倍加速。`,
      }],
      ['进程池与序列化代价', 'ProcessPoolExecutor 启动独立进程绕开 GIL，真正并行吃满多核，适合 CPU 密集；代价是参数与返回值经 pickle 跨进程拷贝，大对象序列化可能比计算还慢；lambda 不可 pickle，函数必须可导入。', '进程绕开 GIL', {
        title: 'ProcessPoolExecutor：CPU 计算并行',
        language: 'Python',
        code: `from concurrent.futures import ProcessPoolExecutor
import time

def cpu_task(limit):
    return sum(value * value for value in range(limit))

def run(pool_class, workers):
    started = time.perf_counter()
    with pool_class(max_workers=workers) as pool:
        values = list(pool.map(cpu_task, [2_000_000] * 4))
    return round(time.perf_counter() - started, 2), values[0] > 0

print("process", run(ProcessPoolExecutor, 4))
try:
    with ProcessPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda x: x * x, range(4)))
except Exception as error:
    print(type(error).__name__)`,
        output: `process (0.71, True)
PicklingError

四个 CPU 计算在独立进程并行执行。
lambda 不可 pickle，无法作为进程池任务提交。`,
      }],
      ['按负载选执行器', '选型顺序固定：优先换原生异步库（aiohttp、aiomysql）让等待天然不阻塞；遗留阻塞 IO 用 to_thread 承接；CPU 密集才上进程池，进程数约等于核数；轻量短任务别进进程池，建进程与序列化的固定开销可能超过任务本身。', '按负载选执行器', {
        title: 'Python：对比三种执行策略',
        language: 'Python',
        code: `import asyncio, time

async def native_io():
    await asyncio.sleep(0.2)
    return "native"

def blocking_io():
    time.sleep(0.2)
    return "thread"

async def main():
    started = time.perf_counter()
    await asyncio.gather(*(native_io() for _ in range(20)))
    print("native", round(time.perf_counter() - started, 2))

    started = time.perf_counter()
    await asyncio.gather(*(asyncio.to_thread(blocking_io) for _ in range(8)))
    print("thread", round(time.perf_counter() - started, 2))

asyncio.run(main())`,
        output: `native 0.21
thread 0.43

原生异步库没有额外线程切换，20 个等待并发。
遗留阻塞 IO 用 to_thread 有线程池固定开销，但仍避免冻结循环。`,
      }],
    ],
  },
  {
    name: pyP3Name('异步 IO 故障实验'),
    track,
    minutes: 38,
    prerequisite: '已完成 asyncio 事件循环与线程进程池两课，能独立编写并发协程脚本。',
    goal: '通过亲手制造吞吐塌方、取消风暴、静默协程与超时清理四类故障，建立异步事故的复现能力，并沉淀一份可挂进代码评审的防御清单。',
    guidedPractice: '按实验手册依次制造并修复四种异步故障，产出一套包含最小复现脚本、现象描述与防御手段的故障清单，以及每项的运行证据。',
    independentPractice: '给一个现成异步服务注入故障：埋入同步阻塞与未 await 协程，用压测数据和 RuntimeWarning 日志定位问题，输出复盘报告。',
    commonErrors: ['实验里用 time.sleep 模拟等待，把阻塞语义误当成异步并发，得出完全错误的性能结论。', '吞掉子任务的 CancelledError，批量取消后留下悬挂任务，循环退出时报 Task was destroyed but it is pending。'],
    sourceRefs: ['Python asyncio. https://docs.python.org/3/library/asyncio.html', 'Python Documentation. https://docs.python.org/3/'],
    steps: [
      ['同步 sleep 吞吐塌方', '异步 IO 故障实验第一组：同一接口两个版本，handler 分别写 time.sleep(1) 与 asyncio.sleep(1)；并发 100 请求时同步版总耗时接近 100 秒，因为循环被逐次卡住串行等待，异步版约 1 秒完成。', '阻塞对比实验', {
        title: 'asyncio：同步与异步 sleep 压测',
        language: 'Python',
        code: `import asyncio, time

async def blocking_handler():
    time.sleep(0.05)

async def async_handler():
    await asyncio.sleep(0.05)

async def measure(handler, count):
    started = time.perf_counter()
    await asyncio.gather(*(handler() for _ in range(count)))
    return round(time.perf_counter() - started, 2)

async def main():
    print("blocking", await measure(blocking_handler, 20))
    print("async", await measure(async_handler, 20))

asyncio.run(main())`,
        output: `blocking 1.03
async 0.06

20 个同步 sleep 串行占住唯一事件循环线程。
异步 sleep 在同一等待窗口并发完成。`,
      }],
      ['取消风暴传播链', '批量 create_task 启动上百个子任务，再对父任务 cancel，观察取消沿 await 链逐级传播形成风暴；吞掉异常不抛的协程导致取消不彻底，被取消任务必须继续抛出；关闭时留 pending 警告。', '取消传播观察', {
        title: 'asyncio：父任务取消传播到子任务',
        language: 'Python',
        code: `import asyncio

cancelled = []

async def child(number, swallow=False):
    try:
        await asyncio.sleep(10)
    except asyncio.CancelledError:
        cancelled.append(number)
        if not swallow:
            raise

async def parent(swallow=False):
    tasks = [asyncio.create_task(child(i, swallow)) for i in range(5)]
    try:
        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

async def main():
    task = asyncio.create_task(parent())
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    print(cancelled, task.cancelled())

asyncio.run(main())`,
        output: `[0, 1, 2, 3, 4] True

父任务取消后，五个子任务都收到 CancelledError。
子任务记录后继续抛出，父任务最终也标记 cancelled。`,
      }],
      ['未 await 的静默协程', '调用 async 函数不 await，协程对象被垃圾回收，只留 RuntimeWarning: never awaited，任务体无任何执行痕迹，接口看似成功实则什么都没做；防御是把警告升级为错误接入 CI。', '裸协程静默丢弃', {
        title: 'Python：把 never awaited 警告升级为错误',
        language: 'PowerShell',
        code: `@'
import asyncio, warnings
warnings.simplefilter("error", RuntimeWarning)

async def charge():
    print("charged")

def handler():
    charge()
    return {"ok": True}

print(handler())
'@ | Set-Content never_awaited.py
python never_awaited.py`,
        output: `{'ok': True}
RuntimeWarning: coroutine 'charge' was never awaited

接口先返回成功，但 charge 函数体从未执行。
把 RuntimeWarning 设成 error 后，CI 能阻止这类静默缺陷。`,
      }],
      ['超时触发的清理路径', 'asyncio.wait_for 超时触发时取消内部任务并抛 TimeoutError；验证被取消任务的 finally 与 __aexit__ 仍会执行，让任务写临时文件，超时后确认被清理；对比 shield 理清取消与清理分工。', '超时仍走清理', {
        title: 'asyncio.wait_for：超时清理临时文件',
        language: 'Python',
        code: `import asyncio
from pathlib import Path

async def download(path):
    path.write_text("partial", encoding="utf-8")
    try:
        await asyncio.sleep(10)
        return "complete"
    finally:
        if path.exists():
            path.unlink()
        print("cleaned", path.exists())

async def main():
    path = Path("partial.tmp")
    try:
        await asyncio.wait_for(download(path), timeout=0.1)
    except TimeoutError:
        print("timeout", path.exists())

asyncio.run(main())`,
        output: `cleaned False
timeout False

wait_for 超时先取消内部任务。
任务 finally 删除临时文件后才把 TimeoutError 抛给调用方。`,
      }],
      ['故障清单与防回归', '把四组实验收敛成清单：同步阻塞拖垮循环、取消泄漏留悬挂任务、裸协程静默不执行、超时后清理缺失；每项配最小复现脚本与防御：禁止吞 CancelledError、强制 await、清理只放 finally，挂进代码评审回归。', '清单固化防御', {
        title: 'pytest：异步故障回归检查',
        language: 'Python',
        code: `import asyncio
import pytest

@pytest.mark.asyncio
async def test_cancel_rethrows_and_cleans():
    state = {"cleanup": False}
    async def worker():
        try:
            await asyncio.sleep(10)
        finally:
            state["cleanup"] = True
    task = asyncio.create_task(worker())
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert task.cancelled()
    assert state["cleanup"]

@pytest.mark.asyncio
async def test_timeout_less_than_budget():
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(asyncio.sleep(1), timeout=0.01)`,
        output: `test_async_faults.py::test_cancel_rethrows_and_cleans PASSED
test_async_faults.py::test_timeout_less_than_budget PASSED
2 passed in 0.11s

取消、清理和超时行为进入 CI。
新增异步接口必须提供同类故障测试。`,
      }],
    ],
  },
];

// ── P4 FastAPI、Django、SQLAlchemy 与迁移 ─────────────────────────────────────────────
const pyP4Stage = 'FastAPI、Django、SQLAlchemy 与迁移';
const pyP4Name = (topic: string) => `Python · ${pyP4Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP4Name('FastAPI 路由、Pydantic 和依赖'),
    track,
    minutes: 38,
    prerequisite: '学员已能用 uvicorn 启动一个最小 FastAPI 应用，并理解 Python 类型注解的基本写法。',
    goal: '理解路由装饰器如何把 HTTP 请求映射到函数参数，掌握 Pydantic 校验与自动文档同源生成的机制，能搭建 Depends 依赖链并用响应模型收口输出字段。',
    guidedPractice: '在课堂上把订单查询接口从裸 dict 返回改造成 Pydantic 请求与响应模型，用 /docs 页面复现 422 校验错误，并抽出一个公共分页依赖供多个路由复用。',
    independentPractice: '独立为库存接口补齐字段约束、依赖注入与响应过滤，提交可通过 uvicorn 启动、附 Swagger 联调截图与字段裁剪说明的代码分支。',
    commonErrors: ['把 Pydantic 校验错误当成 500 返回，没有映射为 422 并在响应体里给出字段级定位信息。', '在多个依赖里重复建立数据库会话，忽略 Depends 在同一请求内对相同依赖默认有解析缓存。'],
    sourceRefs: ['FastAPI Documentation. https://fastapi.tiangolo.com/', 'SQLAlchemy Documentation. https://docs.sqlalchemy.org/'],
    steps: [
      ['路由装饰器与请求模型', '@app.get 与 @app.post 把函数注册进路由表，路径参数、查询参数与请求体由类型注解决定解析方式：路径里的 {item_id} 进入函数参数，带 Pydantic 模型注解的参数走请求体解析，有默认值的标量参数变成查询串。装饰器只做登记，真正的参数绑定发生在请求到达后。', '类型注解决定解析', {
        title: 'FastAPI：路径、查询与请求体绑定',
        language: 'Python',
        code: `from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

app = FastAPI()
class CreateOrder(BaseModel):
    sku: str
    quantity: int

@app.get("/orders/{order_id}")
def get_order(order_id: str, verbose: bool = False):
    return {"id": order_id, "verbose": verbose}

@app.post("/orders")
def create_order(body: CreateOrder):
    return {"sku": body.sku, "quantity": body.quantity}

client = TestClient(app)
print(client.get("/orders/O-1?verbose=true").json())
print(client.post("/orders", json={"sku": "SKU-1", "quantity": 2}).json())`,
        output: `{'id': 'O-1', 'verbose': True}
{'sku': 'SKU-1', 'quantity': 2}

路径参数绑定 order_id，带默认值标量绑定查询串。
Pydantic 注解的 body 从 JSON 请求体解析。`,
      }],
      ['Pydantic 校验即文档', '请求模型继承 BaseModel，用 Field 声明长度、范围与默认值，非法请求直接被 422 拦截并返回字段级错误明细。同一份模型自动生成 OpenAPI schema，/docs 页面的参数表单、必填标记与示例都从这里推导，改模型即改文档，不需要手工同步两份定义。', '校验即接口文档', {
        title: 'Pydantic：422 校验与 OpenAPI',
        language: 'Python',
        code: `from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

app = FastAPI()
class CreateOrder(BaseModel):
    sku: str = Field(min_length=3, max_length=20)
    quantity: int = Field(ge=1, le=99)

@app.post("/orders")
def create(body: CreateOrder):
    return body

client = TestClient(app)
response = client.post("/orders", json={"sku": "X", "quantity": 0})
print(response.status_code)
print(response.json()["detail"])
schema = client.get("/openapi.json").json()
print(schema["components"]["schemas"]["CreateOrder"]["required"])`,
        output: `422
[{'loc': ['body', 'sku'], 'msg': 'String should have at least 3 characters'},
 {'loc': ['body', 'quantity'], 'msg': 'Input should be greater than or equal to 1'}]
['sku', 'quantity']

非法字段在进入函数前被拦截，错误带字段位置。
OpenAPI schema 来自同一个 Pydantic 模型，文档与校验不漂移。`,
      }],
      ['Depends 依赖解析链', 'Depends 声明的依赖会在请求处理前按依赖树自顶向下解析，依赖自身还能再声明依赖别的函数，形成一条解析链。同一请求内相同依赖默认有缓存只执行一次，yield 写法的依赖可在 yield 之后做清理，适合放数据库会话的关闭与连接归还逻辑。', '依赖链一次解析', {
        title: 'FastAPI：依赖缓存与 yield 清理',
        language: 'Python',
        code: `from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

app = FastAPI()
events = []

def settings():
    events.append("settings")
    return {"db": "orders"}

def session(config=Depends(settings)):
    events.append("session-open")
    try:
        yield {"config": config}
    finally:
        events.append("session-close")

def repo(db=Depends(session)):
    events.append("repo")
    return {"db": db}

@app.get("/orders")
def list_orders(first=Depends(repo), second=Depends(repo)):
    return {"same": first is second}

print(TestClient(app).get("/orders").json())
print(events)`,
        output: `{'same': True}
['settings', 'session-open', 'repo', 'session-close']

同一请求里 repo 依赖只解析一次，first 与 second 是同一对象。
yield 之后执行 session-close，异常路径也能清理。`,
      }],
      ['响应模型过滤输出', '函数返回值先交给 response_model 指定的模型过滤，多余字段与内部字段如密码哈希会被裁掉，只输出模型声明过的字段。ORM 对象、数据库行都能直接作为返回值，只要字段名能对上模型签名，别名与排除规则用 model_config 控制。', '响应字段要收口', {
        title: 'FastAPI：response_model 裁剪字段',
        language: 'Python',
        code: `from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

class UserRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    password_hash: str

class UserOut(BaseModel):
    id: int
    email: str

app = FastAPI()
@app.get("/users/1", response_model=UserOut)
def user():
    return UserRow(id=1, email="ada@example.com", password_hash="secret")

print(TestClient(app).get("/users/1").json())`,
        output: `{'id': 1, 'email': 'ada@example.com'}

内部 password_hash 被 response_model 裁掉。
返回值可来自 ORM/对象，输出只包含 UserOut 声明字段。`,
      }],
      ['文档页联调验收', '启动 uvicorn 后打开 /docs 逐个接口发请求验证：缺字段、超长字符串应得到 422 与字段定位，正常请求应只返回响应模型声明过的字段。把每组用例的请求与响应记录进接口清单，作为后续阶段复用同一接口时的验收依据。', '文档即验收依据', {
        title: 'PowerShell：从 OpenAPI 生成接口样验',
        language: 'PowerShell',
        code: `uv run uvicorn app.main:app --port 8000
curl.exe -s http://127.0.0.1:8000/openapi.json > openapi.json
$schema = Get-Content openapi.json | ConvertFrom-Json
$schema.paths.'/orders'.post.requestBody.content.'application/json'.schema
curl.exe -s -o valid.json -w "valid=%{http_code}; " -X POST http://127.0.0.1:8000/orders -H "Content-Type: application/json" -d '{"sku":"SKU-1","quantity":2}'
curl.exe -s -o invalid.json -w "invalid=%{http_code}; " -X POST http://127.0.0.1:8000/orders -H "Content-Type: application/json" -d '{"sku":"X","quantity":0}'
Get-Content valid.json, invalid.json`,
        output: `valid=200; invalid=422;
{"sku":"SKU-1","quantity":2}
{"detail":[{"loc":["body","sku"],"msg":"String should have at least 3 characters"}]}

OpenAPI、实际路由与测试同一模型。
正常和非法请求都保存为接口验收证据。`,
      }],
    ],
  },
  {
    name: pyP4Name('Django ORM、视图、后台和中间件'),
    track,
    minutes: 38,
    prerequisite: '学员已用 startapp 创建过 Django 应用并跑通过一个最小页面视图，理解 Python 类继承的基本写法。',
    goal: '理解 Model 类如何映射为数据库表结构与约束，掌握 QuerySet 惰性求值与缓存行为，能描述中间件洋葱模型的执行顺序，并用 manage.py 命令维护后台与数据。',
    guidedPractice: '在 shell 里用 sqlmigrate 打印迁移将执行的建表 SQL，用两次遍历同一 QuerySet 的查询数对比验证缓存行为，并注册一个带 list_display 的 ModelAdmin。',
    independentPractice: '独立为文章应用补充 Model 字段、列表视图与后台注册，用 createsuperuser 建管理员账号，提交迁移文件与后台验收截图。',
    commonErrors: ['在循环里逐条访问外键触发 N+1 查询，没有用 select_related 或 prefetch_related 预加载关联数据。', '误以为切片后的 QuerySet 仍会缓存全部结果，在模板里对同一 QuerySet 重复求值导致查询次数成倍增加。'],
    sourceRefs: ['Django Documentation. https://docs.djangoproject.com/', 'SQLAlchemy Documentation. https://docs.sqlalchemy.org/'],
    steps: [
      ['Model到SQL的映射', '每个 Model 类对应一张表，CharField、IntegerField 等字段类型映射为具体数据库列型，null、default、unique 选项直接决定列约束。makemigrations 生成迁移文件，sqlmigrate app 0001 可打印它将执行的建表 SQL，模型定义就是表结构的唯一事实来源。', '模型即表结构', {
        title: 'Django：从 Model 查看建表 SQL',
        language: 'Python',
        code: `from django.db import models

class Order(models.Model):
    order_id = models.CharField(max_length=32, unique=True)
    status = models.CharField(max_length=16, default="CREATED")
    total = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "orders"
        indexes = [models.Index(fields=["status", "created_at"])]`,
        output: `python manage.py makemigrations orders
Migrations for 'orders': 0001_initial.py
python manage.py sqlmigrate orders 0001
CREATE TABLE "orders" (
  "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  "order_id" varchar(32) NOT NULL UNIQUE,
  "status" varchar(16) NOT NULL,
  "total" decimal NOT NULL,
  "created_at" datetime NOT NULL
);
CREATE INDEX "orders_status_created" ON "orders" ("status", "created_at");

字段类型、UNIQUE、默认值和索引都直接落到表结构。`,
      }],
      ['QuerySet 惰性与缓存', 'QuerySet 创建时不发 SQL，只有在迭代、list()、len() 等真正取值时才执行查询，结果随后缓存在 QuerySet 对象内，第二次遍历不再查库。filter 与切片返回新的 QuerySet 仍是惰性，exists() 与 count() 走专用 SQL，先拼好全部过滤条件再统一执行最省查询。', '惰性按需才触发', {
        title: 'Django：观察 QuerySet 求值与缓存',
        language: 'Python',
        code: `from django.db import connection
from django.test.utils import CaptureQueriesContext
from orders.models import Order

with CaptureQueriesContext(connection) as queries:
    qs = Order.objects.filter(status="PAID")
    print("after-build", len(queries))
    rows = list(qs)
    print("after-list", len(queries), len(rows))
    list(qs)
    print("after-second", len(queries))

with CaptureQueriesContext(connection) as queries:
    print(Order.objects.filter(status="PAID").count())
    print("count-sql", len(queries))`,
        output: `after-build 0
after-list 1 25
after-second 1
25
count-sql 1

创建 QuerySet 不发 SQL，list 第一次执行并缓存结果。
第二次遍历同对象不再查询；count 走独立聚合 SQL。`,
      }],
      ['中间件洋葱模型', 'MIDDLEWARE 列表按顺序组成洋葱：请求从最外层进入依次穿过每个中间件到达视图，响应再按相反顺序返回。SecurityMiddleware 在最外层发安全头，SessionMiddleware 靠里给 request 挂 session，顺序放错认证就会失效，新增中间件必须先确定它在洋葱里的层位。', '顺序即生命周期', {
        title: 'Django：验证中间件进出顺序',
        language: 'Python',
        code: `class OuterMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        print("outer-request")
        response = self.get_response(request)
        print("outer-response")
        return response

class InnerMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        print("inner-request")
        response = self.get_response(request)
        print("inner-response")
        return response

def view(request):
    print("view")
    return {"ok": True}

handler = OuterMiddleware(InnerMiddleware(view))
print(handler({}))`,
        output: `outer-request
inner-request
view
inner-response
outer-response
{'ok': True}

请求按 MIDDLEWARE 顺序向内，响应按相反方向返回。
认证、会话等依赖顺序的中间件放错层位会失效。`,
      }],
      ['manage.py 后台命令', 'manage.py 是项目运维入口：makemigrations 与 migrate 管表结构演进，createsuperuser 建管理员，shell 带着项目配置进交互环境调试 ORM。自定义命令放在 app 的 management/commands 目录下，用 call_command 能在测试与部署脚本里复用同一逻辑。', '命令行运维入口', {
        title: 'Django：迁移、检查与自定义命令',
        language: 'PowerShell',
        code: `python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py check --deploy
python manage.py shell -c "from orders.models import Order; print(Order.objects.count())"
New-Item -ItemType Directory orders\\management\\commands -Force | Out-Null
New-Item -ItemType File orders\\management\\__init__.py, orders\\management\\commands\\__init__.py -Force | Out-Null
@'
from django.core.management.base import BaseCommand
from orders.models import Order
class Command(BaseCommand):
    help = "Print paid order count"
    def handle(self, *args, **options):
        print(Order.objects.filter(status="PAID").count())
'@ | Set-Content orders\\management\\commands\\paid_count.py
python manage.py paid_count`,
        output: `No changes detected
Applying orders.0001_initial... OK
System check identified no issues
25
25

makemigrations --check 验证模型和迁移一致。
自定义 paid_count 命令复用项目配置和 ORM，可用于发布检查。`,
      }],
      ['Admin 后台注册', '把模型注册进 ModelAdmin，list_display、search_fields、list_filter 决定后台列表的展示与检索能力，运营人员不用写页面就能维护数据。注册后用管理员账号登录 /admin 验证增删改查与权限，后台可用性应纳入每次模型改动的验收清单。', '后台纳入验收', {
        title: 'Django Admin：注册与能力验证',
        language: 'Python',
        code: `from django.contrib import admin
from orders.models import Order

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_id", "status", "total", "created_at")
    search_fields = ("order_id",)
    list_filter = ("status", "created_at")
    ordering = ("-created_at",)
    readonly_fields = ("created_at",)
    actions = ("mark_paid",)
    @admin.action(description="Mark selected orders paid")
    def mark_paid(self, request, queryset):
        updated = queryset.filter(status="CREATED").update(status="PAID")
        self.message_user(request, f"updated {updated}")`,
        output: `python manage.py createsuperuser
python manage.py runserver
GET /admin/orders/order/ -> 200
search order_id=O-1 -> 1 row
filter status=CREATED -> 8 rows
action mark_paid -> updated 8

列表、搜索、过滤、只读字段和批量动作都由 ModelAdmin 提供。
运营人员无需另写页面即可完成订单维护。`,
      }],
    ],
  },
  {
    name: pyP4Name('SQLAlchemy Session 与查询模型'),
    track,
    minutes: 38,
    prerequisite: '学员已掌握关系型数据库的基本 SQL 写法，并用 pip 安装过 SQLAlchemy 2.0 及以上版本。',
    goal: '把 Session 理解为工作单元而不是数据库连接，掌握 identity map 与对象身份的关系、flush 与 commit 的先后语义，能用 select() 风格查询并定位修复 N+1。',
    guidedPractice: '在脚本里用两个 Session 操作同一主键的对象，打印 flush 前后发出的 SQL 与对象身份对比，再把懒加载关系改成 selectinload，统计修复前后的查询条数。',
    independentPractice: '独立把一段裸 SQL 报表改写为 select() 查询，修复其中的 N+1 并做查询数对比，提交附对比说明与 echo 日志摘录的 PR。',
    commonErrors: ['把 commit 当成保存的唯一步骤，跳过 flush 就想拿到数据库生成的自增主键或服务端默认值。', '在遍历结果集时逐行访问懒加载关系触发 N+1 查询，没有改用 selectinload 或 joinedload 预加载。'],
    sourceRefs: ['SQLAlchemy Documentation. https://docs.sqlalchemy.org/', 'FastAPI Documentation. https://fastapi.tiangolo.com/'],
    steps: [
      ['Session 是工作单元', 'Session 不是连接，而是一个工作单元：它跟踪本次业务中加载与修改的全部对象，把变更攒在内存里，到 flush 或 commit 时按依赖顺序统一发出 SQL。一个请求配一个 Session、用完即关，跨请求复用 Session 会让脏状态泄漏到下一段业务里。', '会话先攒后提交', {
        title: 'SQLAlchemy：Session 跟踪待写状态',
        language: 'Python',
        code: `from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from models import Base, Order

engine = create_engine("sqlite:///orders.db")
Base.metadata.create_all(engine)
session = Session(engine)
order = Order(order_id="O-1", status="CREATED")
session.add(order)
print("new", len(session.new), order.id)
session.flush()
print("after-flush", order.id, order in session.new)
session.commit()
print("after-commit", order.id, session.is_active)
session.close()`,
        output: `new 1 None
after-flush 1 False
after-commit 1 True

Session 先跟踪新增对象，flush 才发 INSERT 并拿自增主键。
commit 提交事务，close 结束后释放会话。`,
      }],
      ['对象身份映射机制', '同一 Session 内按主键查询同一行两次，拿到的是同一个 Python 对象，这就是 identity map：Session 内维护主键到对象的映射，避免重复加载与状态分裂。跨 Session 查询会得到两个独立对象，改动互不可见，合并状态需要显式调用 merge。', '同主键同对象', {
        title: 'SQLAlchemy：identity map 对比两个 Session',
        language: 'Python',
        code: `from sqlalchemy.orm import Session
from models import Order

with Session(engine) as one:
    first = one.get(Order, 1)
    second = one.get(Order, 1)
    print("same-session", first is second)

with Session(engine) as other:
    third = other.get(Order, 1)
    print("cross-session", first is third, first == third)
    third.status = "PAID"
    print("before-merge", first.status, third.status)
    merged = other.merge(first)
    print("after-merge", merged is third, merged.status)`,
        output: `same-session True
cross-session False True
before-merge CREATED PAID
after-merge True CREATED

同一 Session 按主键返回同一对象。
跨 Session 是不同实例，merge 把一方状态合并到另一方。`,
      }],
      ['flush 与 commit 的区别', 'flush 把内存中的待写变更翻译成 SQL 发给数据库但不提交事务，此时能拿到自增主键，后续查询也能看到这些未提交变更；commit 才真正提交事务，且默认先触发一次 flush。只 flush 不 commit 时其他连接看不到变更，回滚后全部消失。', '刷写不等于提交', {
        title: 'SQLAlchemy：flush 与 commit 可见性',
        language: 'Python',
        code: `from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from models import Order

engine = create_engine("sqlite:///visibility.db")
session = Session(engine)
order = Order(order_id="O-2", status="CREATED")
session.add(order)
session.flush()
with engine.connect() as other:
    count = other.execute(text("select count(*) from orders where order_id='O-2'")).scalar_one()
print("other-before-commit", count, "id", order.id)
session.commit()
with engine.connect() as other:
    count = other.execute(text("select count(*) from orders where order_id='O-2'")).scalar_one()
print("other-after-commit", count)`,
        output: `other-before-commit 0 id 2
other-after-commit 1

flush 后 Session 已拿到主键，但另一个连接看不到未提交行。
commit 后才对其他事务可见。`,
      }],
      ['select() 新查询风格', '2.0 风格用 select(User).where(User.email.like(...)) 构造语句，交由 session.execute 执行，再用 scalars().all() 取实体列表。写法与 SQL 子句一一对应，join、order_by、limit 都是显式方法调用，旧的 Query 接口仅为兼容保留，新项目统一走 select。', '统一查询入口', {
        title: 'SQLAlchemy 2.0：select 组合查询',
        language: 'Python',
        code: `from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Order

statement = (
    select(Order)
    .where(Order.status == "PAID", Order.total >= 100)
    .order_by(Order.created_at.desc())
    .limit(20)
)
print(str(statement))
with Session(engine) as session:
    rows = session.execute(statement).scalars().all()
    print(len(rows), [row.order_id for row in rows[:3]])

count_stmt = select(Order.id).where(Order.status == "PAID")
print(len(session.execute(count_stmt).scalars().all()))`,
        output: `SELECT orders.id, orders.order_id, ... FROM orders
WHERE orders.status = :status_1 AND orders.total >= :total_1
ORDER BY orders.created_at DESC LIMIT :param_1
20 ['O-19', 'O-18', 'O-17']

select 语句与 SQL 子句一一对应。
execute + scalars 返回实体对象，参数由 SQLAlchemy 绑定。`,
      }],
      ['N+1 查询与预加载', '遍历订单列表再逐行访问 user 关系时，每行触发一次额外查询就是 N+1。joinedload 用一条 LEFT JOIN 一次取回，适合多对一；selectinload 按主键分两批 IN 查询，适合一对多。开启 echo=True 统计 SQL 条数，把修复前后的条数写进对比记录。', '预加载消灭 N+1', {
        title: 'SQLAlchemy：selectinload 修复 N+1',
        language: 'Python',
        code: `from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import Order

lazy = select(Order).limit(20)
eager = select(Order).options(selectinload(Order.items)).limit(20)
print("lazy-options", lazy._with_options)
print("eager-options", eager._with_options)
with Session(engine) as session:
    orders = session.execute(eager).scalars().all()
    print("orders", len(orders), "items", sum(len(order.items) for order in orders))

# 修复前 1 条订单查询 + 20 条明细查询；修复后 1 + 1 条 IN 查询。`,
        output: `lazy-options ()
eager-options (ORMSelectINLoader(Order.items),)
orders 20 items 37

20 条订单明细从 20 次懒加载变成一次 IN 批量查询。
SQL 日志记录修复前 21 条、修复后 2 条。`,
      }],
    ],
  },
  {
    name: pyP4Name('Alembic 迁移、回填和回滚'),
    track,
    minutes: 38,
    prerequisite: '学员已能在项目里用 SQLAlchemy 定义模型并建表，理解数据库事务提交与回滚的基本语义。',
    goal: '理解 autogenerate 只比对表结构而检测不到数据变更的边界，掌握迁移脚本的线性历史与分叉处理，能对大表分批执行回填，并明确 downgrade 的能力与不可逆范围。',
    guidedPractice: '对同一批模型改动先后执行 autogenerate 与人工补写 data migration，记录哪些变更未被检测到，再写一个按主键分批的回填脚本在测试库完整跑通。',
    independentPractice: '独立为课程项目生成一条含数据回填的迁移，用 alembic downgrade 验证可回退范围，提交附回滚说明与耗时记录的迁移脚本。',
    commonErrors: ['以为 autogenerate 能连数据一起迁移，实际上它只对比表结构差异，数据变更必须手写 data migration。', '多人在各自分支上生成迁移导致历史分叉，合并前没有用 alembic history 检查 heads 就直接上线。'],
    sourceRefs: ['Alembic Documentation. https://alembic.sqlalchemy.org/', 'SQLAlchemy Documentation. https://docs.sqlalchemy.org/'],
    steps: [
      ['自动生成迁移的局限', 'alembic revision --autogenerate 只比对模型与数据库里的表结构差异，能生成建列、删列、改类型等 DDL，但检测不到任何数据变更：默认值回填、字段拆分、状态刷写都要人工补写 data migration。生成的脚本必须逐行审读后才能执行，autogenerate 只是草稿。', '只查结构不查数据', {
        title: 'Alembic：autogenerate 只生成结构 DDL',
        language: 'Python',
        code: `from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column("orders", sa.Column("payment_state", sa.String(24), nullable=True))
    # autogenerate 不会替历史 PAID 订单补值
    op.execute("""
        update orders
        set payment_state = case when status='PAID' then 'PAID' else 'UNPAID' end
        where payment_state is null
    """)

def downgrade():
    op.drop_column("orders", "payment_state")`,
        output: `alembic revision --autogenerate -m "add payment_state"
Detected added column orders.payment_state
Generated migration: 20261124_01_add_payment_state.py

生成的 upgrade 只有 add_column。
补值 UPDATE 必须人工加入，否则旧订单字段全为 NULL。`,
      }],
      ['迁移脚本线性历史', '每个迁移脚本带 revision 与 down_revision，串成一条链，alembic upgrade head 沿链依序执行。多人分支各自生成迁移会让链分叉并报 Multiple heads，需要用 alembic merge 合并或手工改写依赖。上线前用 history 与 current 核对历史确实线性。', '历史必须线性', {
        title: 'Alembic：检查 heads 与线性历史',
        language: 'PowerShell',
        code: `alembic heads
alembic history --verbose
alembic current
alembic merge -m "merge worker and order heads" head1 head2
alembic heads
alembic history -r -5:
alembic upgrade head`,
        output: `before merge:
20261124_02 (head)
20261124_03 (head)
after merge:
20261124_04 (head), merge worker and order heads
current: 20261123_12
Running upgrade 20261123_12 -> 20261124_01
Running upgrade -> 20261124_04

两个分支迁移被 merge 成一个 head。
history 与 current 证明升级链可线性执行。`,
      }],
      ['大表回填分批执行', '千万行表的回填绝不能写成一条 UPDATE，会长时间锁表并撑爆事务日志。正确做法是按主键分批：每批固定行数、独立事务，批间提交并记录进度点，失败从断点续跑。把批大小、每批耗时与索引维护策略写进脚本注释，方便评估上线窗口。', '分批小事务可控', {
        title: 'Alembic：按主键批次回填',
        language: 'Python',
        code: `from sqlalchemy import text

def backfill(bind, batch_size=1000):
    last_id = 0
    total = 0
    while True:
        with bind.begin() as conn:
            result = conn.execute(text("""
                update orders
                set payment_state = case when status='PAID' then 'PAID' else 'UNPAID' end
                where id > :last and payment_state is null
                  and id in (select id from orders where id > :last
                             and payment_state is null order by id limit :limit)
                returning id
            """), {"last": last_id, "limit": batch_size})
            ids = [row.id for row in result]
            if not ids:
                break
            last_id = ids[-1]
            total += len(ids)
            print("batch", last_id, len(ids), total)`,
        output: `batch 1000 1000 1000
batch 2000 1000 2000
batch 2500 500 2500
backfill complete total=2500

每批独立事务提交，last_id 是断点。
中断后从最后成功批次继续，不重复全表更新。`,
      }],
      ['downgrade 的边界', 'downgrade 能回退表结构，前提是对应脚本写了 downgrade 函数；被删除的列回滚后数据不可恢复，只能靠新建列加默认值或备份还原。数据迁移的 downgrade 通常写成空操作并注明不可逆，回滚演练必须在测试库先做，确认边界后才能上生产。', '回滚有明确边界', {
        title: 'Alembic：验证结构回滚与数据丢失',
        language: 'PowerShell',
        code: `alembic upgrade head
psql $env:DATABASE_URL -c "select count(*) from orders where payment_state is not null"
alembic downgrade -1
psql $env:DATABASE_URL -c "select column_name from information_schema.columns where table_name='orders' and column_name='payment_state'"
alembic upgrade head
psql $env:DATABASE_URL -c "select count(*) from orders where payment_state is null"
alembic current`,
        output: `upgrade head: payment_state non-null=2500
downgrade -1: column removed
column query: 0 rows
upgrade head again: payment_state null=2500
current: 20261124_02 (head)

downgrade 删列后原回填数据不可恢复。
再次 upgrade 只能重建空列，需要重跑回填或从备份恢复。`,
      }],
      ['迁移演练与验收', '在测试库完整跑一遍 upgrade、数据校验、downgrade、再 upgrade 的循环，比对回填后的行数与抽样字段值。验收记录包含每条迁移的执行耗时与回滚结果，作为上线窗口的评估材料，任何未经过演练的迁移不允许进入发布流程。', '演练过才可上线', {
        title: 'PowerShell：完整迁移演练与证据',
        language: 'PowerShell',
        code: `$db = "postgresql://app:secret@localhost:5433/orders_rehearsal"
$before = psql $db -Atc "select count(*) from orders"
$sw = [Diagnostics.Stopwatch]::StartNew()
$env:DATABASE_URL = $db
alembic upgrade head
$sw.Stop()
$after = psql $db -Atc "select count(*) from orders where payment_state is not null"
alembic downgrade -1
alembic upgrade head
$reapplied = psql $db -Atc "select count(*) from orders where payment_state is not null"
[pscustomobject]@{Before=$before;After=$after;Reapplied=$reapplied;UpgradeMs=$sw.ElapsedMilliseconds} | Tee-Object migration-rehearsal.txt
alembic current`,
        output: `Before After Reapplied UpgradeMs
2500   2500       2500        842
current: 20261124_02 (head)

升级、回退、再升级在测试库完整通过。
耗时与行数证据进入发布单，生产窗口按 842ms 加锁等待余量评估。`,
      }],
    ],
  },
  {
    name: pyP4Name('认证、对象级授权和审计'),
    track,
    minutes: 38,
    prerequisite: '学员已能在 FastAPI 或 Django 中实现基础接口，并理解 HTTP 请求头与 Cookie 的传递机制。',
    goal: '对比 JWT 与 Session 两种认证模式的状态与运维代价，区分接口级权限与对象级行归属校验，能设计统一注入的审计字段，并用不可变日志记录敏感操作。',
    guidedPractice: '给订单接口分别接上 JWT 与 Session 登录并对比注销行为，再补齐非本人订单返回 404 的行归属校验，写入操作者、时间、动作三项齐全的审计日志。',
    independentPractice: '独立审查一个含水平越权缺陷的接口分支，修复对象级授权并补齐审计日志，提交附越权复现步骤与修复对照说明的 PR。',
    commonErrors: ['只校验用户已登录就放行接口，没有校验资源行的归属关系，导致登录用户可越权读取他人数据。', '把审计日志写进会随业务事务回滚的同一张表，操作失败重试后丢失记录，或事后被业务代码篡改。'],
    sourceRefs: ['FastAPI Documentation. https://fastapi.tiangolo.com/', 'Django Documentation. https://docs.djangoproject.com/'],
    steps: [
      ['JWT/Session 权衡', 'JWT 把用户身份签进令牌，服务端无状态、适合多服务与移动端，代价是难以主动吊销，只能靠短有效期加刷新令牌缓解；Session 把状态放在服务端，可随时踢下线，但需要共享存储支撑水平扩展。按运维能力与注销需求取舍，不硬套单一答案。', '状态取舍看运维', {
        title: 'FastAPI：JWT 与 Session 吊销对比',
        language: 'Python',
        code: `from jose import jwt
from datetime import datetime, timedelta, timezone

secret = "dev-secret"
token = jwt.encode(
    {"sub": "u-1", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
    secret,
    algorithm="HS256",
)
claims = jwt.decode(token, secret, algorithms=["HS256"])
print("jwt", claims["sub"], claims["exp"] > 0)

server_sessions = {"sid-1": {"user": "u-1"}}
print("session-before", server_sessions.get("sid-1"))
server_sessions.pop("sid-1")
print("session-after", server_sessions.get("sid-1"))`,
        output: `jwt u-1 True
session-before {'user': 'u-1'}
session-after None

JWT 在有效期内服务端仍接受，除非维护额外吊销表。
Session 删除服务端记录后下一次请求立即失效。`,
      }],
      ['接口级与对象级权限', '接口级权限回答这个用户能不能调用此接口，用角色或权限位在依赖或中间件里判断；对象级权限回答能不能操作这一行数据，必须在拿到具体资源后校验行归属。只做接口级校验的系统，登录用户换一个 ID 就能读他人订单，是最常见的越权来源。', '登录不等于授权', {
        title: 'FastAPI：角色通过后仍校验资源归属',
        language: 'Python',
        code: `from dataclasses import dataclass

@dataclass
class Actor:
    user_id: str
    role: str

orders = {"O-1": {"owner": "u-1", "total": 100}}

def can_call(actor):
    if actor.role != "customer":
        raise PermissionError("ROLE_DENIED")

def get_order(actor, order_id):
    can_call(actor)
    row = orders.get(order_id)
    if not row or row["owner"] != actor.user_id:
        raise LookupError("ORDER_NOT_FOUND")
    return row

print(get_order(Actor("u-1", "customer"), "O-1"))
try:
    get_order(Actor("u-2", "customer"), "O-1")
except LookupError as error:
    print(type(error).__name__, error)`,
        output: `{'owner': 'u-1', 'total': 100}
LookupError ORDER_NOT_FOUND

u-2 也有 customer 角色，能调用接口。
对象级校验仍拒绝 u-2，并隐藏订单是否存在。`,
      }],
      ['行归属校验实现', '对象级授权落到查询条件上：查订单时把 user_id 等于当前用户写进 where，或取出资源后比对 owner 字段，不匹配时返回 404 而不是 403，避免向攻击者暴露资源是否存在。把校验封装成统一的取数依赖，所有按 ID 取资源的接口强制走它。', '非本人按不存在', {
        title: 'SQLAlchemy：租户与所有者写进 where',
        language: 'Python',
        code: `from sqlalchemy import select

def load_owned_order(session, actor, order_id):
    stmt = select(Order).where(
        Order.order_id == order_id,
        Order.owner_id == actor.user_id,
    )
    order = session.execute(stmt).scalar_one_or_none()
    if order is None:
        raise LookupError("ORDER_NOT_FOUND")
    return order

try:
    load_owned_order(session, Actor("u-2", "customer"), "O-1")
except LookupError as error:
    print(type(error).__name__, error)

print(load_owned_order(session, Actor("u-1", "customer"), "O-1").order_id)`,
        output: `LookupError ORDER_NOT_FOUND
O-1

租户与 owner_id 写入 SQL 条件，不依赖接口层再次过滤。
不匹配和不存在返回同一种业务错误。`,
      }],
      ['审计字段设计', '核心业务表内置 created_by、created_at、updated_by、updated_at 四个审计字段，由 ORM 层统一注入而不是依赖各接口手填，漏填即视为缺陷。审计要回答谁在何时对哪条数据做了什么，字段命名与填充口径全项目一致，报表与追责都以此为据。', '审计口径全统一', {
        title: 'SQLAlchemy：统一注入审计字段',
        language: 'Python',
        code: `from datetime import datetime, timezone
from sqlalchemy import event
from sqlalchemy.orm import Mapped, mapped_column

class AuditMixin:
    created_by: Mapped[str] = mapped_column()
    created_at: Mapped[datetime] = mapped_column()
    updated_by: Mapped[str] = mapped_column()
    updated_at: Mapped[datetime] = mapped_column()

@event.listens_for(Session, "before_flush")
def stamp(session, context, instances):
    now = datetime.now(timezone.utc)
    actor = context.info.get("actor", "system")
    for row in session.new:
        row.created_by = row.updated_by = actor
        row.created_at = row.updated_at = now
    for row in session.dirty:
        row.updated_by = actor
        row.updated_at = now`,
        output: `session.info["actor"] = "u-1"
insert order -> created_by=u-1 updated_by=u-1
change status -> created_by=u-1 updated_by=u-1 updated_at later

四个字段由统一 flush 监听器填充。
接口漏传 actor 时退化为 system，并进入审计告警。`,
      }],
      ['不可变日志与验收', '敏感操作的审计日志写入独立的追加表或日志服务，只允许 insert，业务事务回滚不吞掉日志，必要时先落日志再执行操作。验收时用两个账号互相访问对方资源，核对日志的完整性与顺序，越权尝试本身也必须留痕可查。', '日志只增不回滚', {
        title: 'PowerShell：跨账号越权与审计回归',
        language: 'PowerShell',
        code: `$base = "http://127.0.0.1:8000"
$u1 = (Invoke-RestMethod -Method Post "$base/login" -Body @{user="u-1";password="dev"}).token
$u2 = (Invoke-RestMethod -Method Post "$base/login" -Body @{user="u-2";password="dev"}).token
curl.exe -s -o owner.json -w "owner=%{http_code}; " -H "Authorization: Bearer $u1" "$base/orders/O-1"
curl.exe -s -o attacker.json -w "attacker=%{http_code}; " -H "Authorization: Bearer $u2" "$base/orders/O-1"
psql $env:DATABASE_URL -c "select actor, action, resource, result from audit.events where resource='O-1' order by occurred_at"
psql $env:DATABASE_URL -c "select count(*) from audit.events where result='DENIED'"`,
        output: `owner=200; attacker=404;
u-1 ORDER_VIEW O-1 SUCCESS
u-2 ORDER_VIEW O-1 DENIED
denied events=1

越权响应不泄露存在性，审计仍记录真实 actor 与结果。
业务事务回滚不会删除 append-only 审计事件。`,
      }],
    ],
  },
  {
    name: pyP4Name('框架企业服务对照实验'),
    track,
    minutes: 38,
    prerequisite: '学员已完成本阶段 FastAPI 与 Django 各自的实操任务，能独立跑通两套课程示例项目。',
    goal: '用同一套订单业务分别在 FastAPI 与 Django 中实现，逐项对比路由、校验、ORM 与迁移、后台能力，最终按团队技能与业务场景给出有依据的框架选型结论。',
    guidedPractice: '在对照表里逐行填写两套框架实现同一接口的代码行数、查询次数与迁移命令差异，并录制一段不超过五分钟的对比演示视频作为课堂产物。',
    independentPractice: '独立完成对照报告，从团队技能储备、迭代节奏与运维约束三个维度给出选型建议，提交报告与两套可运行代码的仓库链接。',
    commonErrors: ['把对比做成功能清单罗列，没有在同一业务与同一数据模型下测量，得出的结论缺乏可比性。', '脱离团队现状直接套用社区热度结论，忽略招聘难度、已有代码资产与运维约束等真实选型因素。'],
    sourceRefs: ['FastAPI Documentation. https://fastapi.tiangolo.com/', 'Django Documentation. https://docs.djangoproject.com/'],
    steps: [
      ['同一业务双实现', '选定同一个订单域：订单、明细、状态流转各一份定义，在 FastAPI 里用路由加 Pydantic 实现，在 Django 里用视图加 ModelAdmin 实现，两套代码共用同一数据库模式与验收标准。只有业务、数据、验收三者一致，后续每一项对比才有可比性。', '同题才有可比性', {
        title: 'SQL：为两套框架共用订单模式',
        language: 'SQL',
        code: `CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  order_id varchar(32) NOT NULL UNIQUE,
  status varchar(16) NOT NULL CHECK (status IN ('CREATED','PAID','CANCELLED')),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
  id bigserial PRIMARY KEY,
  order_id varchar(32) NOT NULL REFERENCES orders(order_id),
  sku varchar(32) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);`,
        output: `table orders created
table order_items created
index idx_orders_status_created created

FastAPI 与 Django 实例使用同一张订单、明细表和约束。
后续接口、SQL 条数和后台对比才有共同基线。`,
      }],
      ['路由与校验对比', 'FastAPI 的路由是装饰器加类型注解，校验模型与 OpenAPI 文档一体生成；Django 的 URLconf 是路径表，校验靠 Form 或 Serializer 另建一层。对比两边的接口定义行数、错误响应格式与文档维护成本，把每项差异逐条记进对照表并注明测量口径。', '胶水层各有取舍', {
        title: 'Python：同一订单接口双框架对照',
        language: 'Python',
        code: `from pydantic import BaseModel, Field

class OrderIn(BaseModel):
    sku: str = Field(min_length=3)
    quantity: int = Field(ge=1, le=99)

print("fastapi", list(OrderIn.model_json_schema()["properties"]))

from django import forms
class OrderForm(forms.Form):
    sku = forms.CharField(min_length=3)
    quantity = forms.IntegerField(min_value=1, max_value=99)

form = OrderForm({"sku": "X", "quantity": 0})
print("django-valid", form.is_valid())
print("django-errors", form.errors.as_json())`,
        output: `fastapi ['sku', 'quantity']
django-valid False
django-errors {"sku": [{"message": "Ensure this value has at least 3 characters."}], "quantity": [{"message": "Ensure this value is greater than or equal to 1."}]}

FastAPI 模型同时生成校验与 OpenAPI schema。
Django Form 独立定义校验，需要测试映射 HTTP 错误格式。`,
      }],
      ['ORM 与迁移对比', 'Django 自带 ORM 与迁移体系，Model、QuerySet、makemigrations 一条龙闭环；FastAPI 通常搭配 SQLAlchemy 加 Alembic，灵活但要自己拼装各层。用同一份报表查询在两边实现并统计 SQL 条数与写法差异，迁移命令与回滚体验也纳入对比项。', '数据层成熟度优先', {
        title: 'PowerShell：Django 与 Alembic 迁移对照',
        language: 'PowerShell',
        code: `python manage.py makemigrations --check --dry-run
alembic check
python manage.py showmigrations orders
alembic history -r -3:
Measure-Command { python manage.py migrate } | Select-Object TotalMilliseconds
Measure-Command { alembic upgrade head } | Select-Object TotalMilliseconds
python manage.py sqlmigrate orders 0002 | Select-Object -First 20
alembic downgrade -1
python manage.py migrate orders 0001`,
        output: `No changes detected
No new upgrade operations detected
Django migration 0002 applied
Alembic revision 20261124_02 applied
Django migrate 182ms
Alembic upgrade 96ms
Downgrade completed

Django 的模型、迁移历史和回滚命令一体化。
SQLAlchemy/Alembic 需显式组织模型元数据与迁移环境。`,
      }],
      ['后台与运维对比', 'Django Admin 开箱即用，运营后台接近零成本，中间件自带认证与安全头的成熟组合；FastAPI 没有内置后台，需要自建或引入第三方方案，但依赖注入让自定义横切逻辑更灵活。评估必须挂在业务方的真实需求上：到底需不需要运营后台。', '后台即管理成本', {
        title: 'YAML：后台需求对照清单',
        language: 'YAML',
        code: `same_order_domain:
  django:
    admin:
      built_in: true
      list_filter: true
      bulk_action: true
      permissions: group_and_model
      build_effort: "0.5 day"
    middleware:
      auth_ready: true
      security_headers: true
  fastapi:
    admin:
      built_in: false
      options: [custom_ui, sqladmin, react_admin]
      build_effort: "3-5 days"
    dependency_injection:
      custom_cross_cutting: high
      generated_openapi: true
requirements:
  ops_team_needs_backoffice: true
  api_is_primary_product: true`,
        output: `django ops effort=0.5 day
fastapi ops effort=3-5 days
requirements: backoffice=true, api-primary=true

Django 优势是现成后台与权限。
FastAPI 优势是轻 API 与依赖注入，但后台成本必须显式计入。`,
      }],
      ['选型结论输出', '选型结论必须绑定团队与场景：团队已熟悉 Django、业务重后台重管理则 Django 占优；服务边界小、强调异步与 API 文档则 FastAPI 更轻。把团队技能储备、迭代节奏、运维约束三项写成决策依据，并允许结论是两种框架按服务划分共存。', '结论绑定场景', {
        title: 'Markdown：框架选型 ADR',
        language: 'Markdown',
        code: `# ADR: FastAPI vs Django for Order Platform
## Context
- 3 backend engineers know Django; 1 knows FastAPI.
- Operations needs an order backoffice in 2 weeks.
- Public API traffic 200 req/s, async model calls expected later.

## Decision
- Backoffice and internal CRUD: Django.
- Public async streaming/API service: FastAPI.
- Shared PostgreSQL schema and contract tests.

## Consequences
- Two deploy units and two dependency sets.
- Admin delivered quickly; public API keeps OpenAPI and async support.

## Revisit Triggers
- If one team cannot operate both stacks, consolidate.
- If backoffice usage falls below weekly, remove Django surface.`,
        output: `decision: split by workload, not framework religion
backoffice -> Django
public async API -> FastAPI
shared schema -> contract-tested

结论绑定团队技能、两周后台期限和未来异步需求。
两种框架共存有明确运维代价与重新评估触发器。`,
      }],
    ],
  },
];

// ── P5 测试、打包、任务与工程质量 ─────────────────────────────────────────────
const pyP5Stage = '测试、打包、任务与工程质量';
const pyP5Name = (topic: string) => `Python · ${pyP5Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP5Name('pytest fixture、参数化和失败注入'),
    track,
    minutes: 38,
    prerequisite: '已掌握 pytest 基本断言与测试函数写法，能独立运行单个测试文件。',
    goal: '能设计带作用域与依赖链的 fixture，用参数化批量生成用例，并通过 monkeypatch 注入故障路径，同时识别 fixture 滥用带来的隐式耦合。',
    guidedPractice: '在练习仓库中为一个支付模块编写 session 级数据库 fixture 和 factory fixture，用 parametrize 展开至少 6 组边界用例，再用 monkeypatch 模拟接口超时，产出可运行的测试文件与通过记录。',
    independentPractice: '独立为既有模块补齐失败注入测试：替换第三方客户端让其抛出超时与限流异常，验证重试与降级逻辑，并用 --setup-show 梳理 fixture 执行顺序写成简短说明。',
    commonErrors: ['在 session 作用域的 fixture 中保存可变状态，导致用例间互相污染而难以定位。', 'autouse 大范围滥用，使测试依赖隐藏在 conftest 中，读用例时看不出前置条件。'],
    sourceRefs: ['pytest Documentation. https://docs.pytest.org/', 'Ruff Documentation. https://docs.astral.sh/ruff/'],
    steps: [
      ['fixture 作用域分层', '讲解 fixture 通过 scope 参数控制生命周期：function 每个用例重建，session 全程共享，module/package 介于两者之间。fixture 可以引用其他 fixture 形成依赖链，teardown 用 yield 之后的代码完成资源清理。演示 conftest.py 的自动发现机制，并用 --setup-show 观察实际执行顺序。', '作用域决定重建频率', {
        title: 'pytest：观察 fixture 作用域与清理',
        language: 'Python',
        code: `import pytest

events = []

@pytest.fixture(scope="session")
def database():
    events.append("db-open")
    yield {"rows": []}
    events.append("db-close")

@pytest.fixture
def factory(database):
    created = []
    def make(order_id):
        row = {"id": order_id}
        database["rows"].append(row)
        created.append(row)
        return row
    yield make
    print("function-cleanup", len(created))

def test_one(factory):
    assert factory("O-1")["id"] == "O-1"

def test_two(factory):
    assert factory("O-2")["id"] == "O-2"

def test_session_events(database):
    assert len(database["rows"]) == 2
    print(events)`,
        output: `pytest -q --setup-show
SETUP S database (fixtures used: none)
SETUP F factory (fixtures used: database)
function-cleanup 1
TEARDOWN F factory
function-cleanup 1
TEARDOWN F factory
['db-open']
TEARDOWN S database
['db-open', 'db-close']

database 整个 session 只建一次，factory 每个用例重建。
yield 之后执行清理，函数级临时对象不会泄漏到下一用例。`,
      }],
      ['参数化展开用例', '用 @pytest.mark.parametrize 传入多组参数，让一个测试函数生成多条独立用例，ids 参数给用例命名便于失败定位；多组 parametrize 叠加时按笛卡尔积展开。讲解何时该参数化、何时应拆成独立测试函数，避免一条用例失败掩盖其他组合的问题。', '一组数据一条用例', {
        title: 'pytest：参数化生成独立用例',
        language: 'Python',
        code: `import pytest

def discount(tier, amount):
    if tier == "vip" and amount >= 100:
        return 20
    if tier == "vip":
        return 5
    return 0

@pytest.mark.parametrize("tier", ["vip", "normal"])
@pytest.mark.parametrize("amount", [99, 100])
def test_discount(tier, amount):
    expected = 20 if tier == "vip" and amount >= 100 else (5 if tier == "vip" else 0)
    assert discount(tier, amount) == expected

@pytest.mark.parametrize(("raw", "expected"), [("  ADA ", "ADA"), ("", "")],
                         ids=["trim", "empty"])
def test_normalize(raw, expected):
    assert raw.strip().upper() == expected`,
        output: `test_price.py::test_discount[vip-99] PASSED
test_price.py::test_discount[vip-100] PASSED
test_price.py::test_discount[normal-99] PASSED
test_price.py::test_discount[normal-100] PASSED
test_price.py::test_normalize[trim] PASSED
test_price.py::test_normalize[empty] PASSED
6 passed

两层 parametrize 展开笛卡尔积，每条组合独立报告。
ids 让边界用例在失败列表中可读。`,
      }],
      ['monkeypatch 注入', 'monkeypatch.setattr 可在用例内临时替换函数、方法或环境变量，用例结束自动还原，适合模拟外部接口超时、抛异常等故障路径。演示对 requests.get 打桩抛出 Timeout 验证重试逻辑，并用 raises 断言异常类型，说明失败注入比真实造故障更可控。', '故障路径也要测', {
        title: 'pytest：monkeypatch 注入超时',
        language: 'Python',
        code: `import pytest, requests
from orders.client import fetch_order

def test_timeout_retries(monkeypatch):
    calls = {"count": 0}
    def fake_get(url, timeout):
        calls["count"] += 1
        if calls["count"] < 3:
            raise requests.Timeout("slow")
        return type("Response", (), {
            "status_code": 200,
            "json": lambda self: {"id": "O-1"},
            "raise_for_status": lambda self: None,
        })()

    monkeypatch.setattr(requests, "get", fake_get)
    assert fetch_order("O-1")["id"] == "O-1"
    assert calls["count"] == 3

def test_timeout_exhausted(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: (_ for _ in ()).throw(requests.Timeout()))
    with pytest.raises(requests.Timeout):
        fetch_order("O-2")`,
        output: `test_client.py::test_timeout_retries PASSED
test_client.py::test_timeout_exhausted PASSED
2 passed in 0.04s

前两次 Timeout 驱动重试，第三次返回成功。
monkeypatch 在用例结束自动恢复 requests.get。`,
      }],
      ['conftest 组织共享', '讲解 conftest.py 的层级查找规则：同目录及祖先目录里的 fixture 对其下的测试自动可见，无需 import。多个 conftest 存在同名 fixture 时就近覆盖。演示把数据库连接、临时目录等公共设施收敛到项目级 conftest，并提醒 autouse 只用于确有全局副作用的场景。', '就近覆盖要克制', {
        title: 'pytest：conftest 分层覆盖 fixture',
        language: 'Python',
        code: `from pathlib import Path

root = Path("tests")
(root / "unit").mkdir(parents=True, exist_ok=True)
(root / "conftest.py").write_text(
    "import pytest\\n"
    "@pytest.fixture\\ndef settings():\\n"
    "    return {'env': 'project', 'timeout': 10}\\n"
)
(root / "unit" / "conftest.py").write_text(
    "import pytest\\n"
    "@pytest.fixture\\ndef settings(settings):\\n"
    "    return {**settings, 'timeout': 1}\\n"
)
(root / "unit" / "test_settings.py").write_text(
    "def test_override(settings):\\n"
    "    assert settings == {'env': 'project', 'timeout': 1}\\n"
)`,
        output: `pytest tests/unit/test_settings.py -q --setup-show
SETUP F settings (fixtures used: none)
SETUP F settings (fixtures used: settings)
tests/unit/test_settings.py . [100%]
1 passed

子目录 fixture 继承父级结果并覆盖 timeout。
同名 fixture 就近生效，但依赖链仍然显式可见。`,
      }],
      ['fixture 滥用风险', '分析 fixture 滥用造成的隐式耦合：autouse 全局生效让用例依赖不可见，深层依赖链让执行顺序难以推理，session 作用域共享可变状态导致用例互相污染。给出治理方法：显式声明依赖、缩小作用域、用 factory fixture 代替全局单例，保持用例独立性。', '显式依赖可追踪', {
        title: 'pytest：拒绝共享可变 fixture',
        language: 'Python',
        code: `import pytest

@pytest.fixture(scope="session")
def shared_orders():
    return []

def test_polluted(shared_orders):
    shared_orders.append("O-1")
    assert len(shared_orders) == 1

def test_polluted_again(shared_orders):
    # 若独立运行为 0，整套运行却为 1
    assert len(shared_orders) == 0

@pytest.fixture
def order_factory():
    rows = []
    def make(order_id):
        rows.append(order_id)
        return order_id
    yield make
    assert rows  # 清理可见

def test_isolated(order_factory):
    order_factory("O-2")
    assert True`,
        output: `pytest -q
test_polluted PASSED
test_polluted_again FAILED
E assert 1 == 0

session fixture 的列表被第一个用例污染。
function-scope factory 每次新建状态，测试可独立重跑。`,
      }],
    ],
  },
  {
    name: pyP5Name('mypy/pyright 与运行时边界'),
    track,
    minutes: 38,
    prerequisite: '已了解 Python 类型标注基本语法，能读懂函数签名与泛型容器标注。',
    goal: '能区分静态检查与运行时校验的职责边界，堵住 Any 逃逸通道，并用 TypedDict、Literal 与 Pydantic 分层约束数据结构。',
    guidedPractice: '给一个接收 JSON 配置的模块补齐 TypedDict 与 Literal 标注，开启 mypy strict 模式修复全部报错，再用 Pydantic 模型包裹配置解析，产出类型检查通过报告与校验失败的错误示例。',
    independentPractice: '独立审计一段真实代码，找出隐式 Any 与缺 stub 的第三方调用，用 reveal_type 记录推断结果，为跨边界的消息载荷补上 Pydantic 校验并整理边界划分说明。',
    commonErrors: ['把函数参数悬空不标注，隐式 Any 让整条调用链逃过类型检查而不自知。', '以为加了类型标注就能拦截非法请求体，跳过运行时校验导致脏数据入库。'],
    sourceRefs: ['Python Packaging User Guide. https://packaging.python.org/', 'Ruff Documentation. https://docs.astral.sh/ruff/'],
    steps: [
      ['静态检查的能力', '讲解 mypy 与 pyright 的原理：基于类型标注做数据流分析，能在不运行代码时抓出属性拼写错误、None 传入、类型不匹配等问题。但它们无法覆盖运行时才确定的值，如外部接口返回的 JSON、用户输入，标注只约束代码内部约定。演示 strict 模式抓 None 漏判。', '标注只管代码内部', {
        title: 'mypy：strict 抓 None 漏判',
        language: 'Python',
        code: `def display(customer: dict[str, str] | None) -> str:
    return customer["name"]

def safe(customer: dict[str, str] | None) -> str:
    if customer is None:
        return "anonymous"
    return customer["name"]

print(display({"name": "Ada"}))
print(safe(None))`,
        output: `$ mypy --strict demo.py
demo.py:2: error: Value of type "dict[str, str] | None" is not indexable
Found 1 error in 1 file
$ python demo.py
Ada
anonymous

运行样例传了合法字典，未触发空值错误。
mypy 在运行前发现 display 未处理 None 分支。`,
      }],
      ['Any 的逃逸通道', '演示 Any 如何逃过检查：无标注函数参数默认隐式 Any、json.loads 返回 Any、第三方库缺 stub、cast 强转都会让类型信息丢失。开启 warn_return_any 与 disallow_untyped_defs 后这些通道会暴露警告，配合 reveal_type 观察推断结果。', 'Any 一处即失效', {
        title: 'mypy：reveal_type 追查 Any',
        language: 'Python',
        code: `import json

payload = json.loads('{"quantity": "2"}')
reveal_type(payload)
quantity = payload["quantity"]
reveal_type(quantity)
total = quantity + 1
reveal_type(total)`,
        output: `$ mypy demo.py
demo.py:4: note: Revealed type is "Any"
demo.py:6: note: Revealed type is "Any"
demo.py:8: note: Revealed type is "Any"
Success: no issues found

json.loads 返回 Any，后续字段和运算全部继承 Any。
代码能通过类型检查，但运行时 quantity 是字符串，quantity+1 会失败。`,
      }],
      ['TypedDict 收窄', '用 TypedDict 给字典结构命名，配合 Literal 限定取值集合，让静态检查器在分支中收窄类型。演示 total=False 表达可选键，联合类型在 if isinstance 分支中的收窄效果，对比裸 dict 标注在字段拼写错误时毫无提示的差距。', '字典也要有形状', {
        title: 'TypedDict + Literal：约束消息载荷',
        language: 'Python',
        code: `from typing import Literal, TypedDict, NotRequired

class OrderEvent(TypedDict):
    event_id: str
    status: Literal["CREATED", "PAID", "CANCELLED"]
    note: NotRequired[str]

def apply(event: OrderEvent) -> str:
    return f"{event['event_id']}:{event['status']}"

bad: OrderEvent = {
    "event_id": "e-1",
    "status": "SHIPPED",
}
print(apply(bad))`,
        output: `$ mypy demo.py
demo.py:12: error: Incompatible types (got "str", expected "Literal['CREATED', 'PAID', 'CANCELLED']")
Found 1 error

status 被限制为三个值，非法字符串在静态检查阶段失败。
note 使用 NotRequired，缺少该键仍然合法。`,
      }],
      ['运行时校验边界', '明确划分：静态检查管编译期，Pydantic 管运行时。请求体、配置文件、消息队列载荷等跨边界数据必须经 Pydantic 模型解析，字段类型、范围、默认值在实例化时强制校验并给出可读错误。说明静态标注不能替代这层校验，两者互补而非互斥。', '边界数据必校验', {
        title: 'Pydantic：运行时校验边界数据',
        language: 'Python',
        code: `from pydantic import BaseModel, Field, ValidationError

class OrderMessage(BaseModel):
    event_id: str = Field(min_length=3)
    quantity: int = Field(ge=1)
    status: str = "CREATED"

raw = '{"event_id":"e-1","quantity":"2"}'
message = OrderMessage.model_validate_json(raw)
print(message, type(message.quantity).__name__)

try:
    OrderMessage.model_validate_json('{"event_id":"x","quantity":0}')
except ValidationError as error:
    print(error.errors(include_url=False))`,
        output: `event_id='e-1' quantity=2 status='CREATED' int
[{'type': 'string_too_short', 'loc': ('event_id',), 'msg': 'String should have at least 3 characters', 'input': 'x'},
 {'type': 'greater_than_equal', 'loc': ('quantity',), 'msg': 'Input should be greater than or equal to 1', 'input': 0}]

运行时把字符串 "2" 强制转成 int 并校验范围。
静态注解无法处理外部 JSON，边界必须由 Pydantic 实际解析。`,
      }],
      ['渐进式接入策略', '演示在存量项目逐步启用：先从非 strict 模式跑全量基线，用 per-module 选项对新代码收紧、旧代码放宽，再配合 ignore_missing_imports 处理无 stub 依赖。给出在 CI 中只对增量改动报错的常见做法，避免一次性修复拖垮进度。', '从宽松到严格', {
        title: 'mypy：分模块逐步收紧',
        language: 'TOML',
        code: `[tool.mypy]
python_version = "3.12"
disallow_untyped_defs = false
warn_return_any = true
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "orders.new_*"
disallow_untyped_defs = true
warn_unused_ignores = true

[[tool.mypy.overrides]]
module = "legacy.*"
ignore_errors = true`,
        output: `mypy src
Success: no issues found in 182 source files
new orders code requires full annotations
legacy package hidden from baseline

新模块立即严格，旧模块先冻结错误。
每迁移一个 legacy 模块就从 overrides 中移除，再修到零错误。`,
      }],
    ],
  },
  {
    name: pyP5Name('Ruff、格式化、预提交和 CI'),
    track,
    minutes: 38,
    prerequisite: '已在团队项目中体验过 flake8 或 black 单独使用的痛点，了解 pyproject.toml 基本结构。',
    goal: '能用 Ruff 统一替代多个 lint 与格式化工具，通过规则分级消化存量问题，并用 pre-commit 与 CI 门禁保证本地和服务端检查结果一致。',
    guidedPractice: '在一个带存量问题的仓库中运行 ruff check --statistics 盘点问题分布，制定分级修复清单，执行安全修复并单独提交格式化改动，产出修复前后的问题数对比记录。',
    independentPractice: '独立为新仓库搭建完整的检查链：编写 pyproject.toml 的 Ruff 配置、.pre-commit-config.yaml 与 CI 步骤，故意提交一个违规文件验证钩子与门禁都能拦截，截图留存。',
    commonErrors: ['把全量格式化与功能改动混在同一个提交，评审时无法分辨实际逻辑变更。', '本地通过 pre-commit 但 CI 失败，原因是两端 Ruff 版本或规则配置不一致。'],
    sourceRefs: ['Ruff Documentation. https://docs.astral.sh/ruff/', 'pytest Documentation. https://docs.pytest.org/'],
    steps: [
      ['单工具替代组合', '讲解 Ruff 用 Rust 实现规则引擎，单二进制同时覆盖 flake8 的检查、isort 的导入排序与 black 的格式化能力，速度比 Python 实现快一个数量级。规则与插件生态通过 pyproject.toml 统一配置，减少多工具版本协调与输出冲突问题。', '一个工具一个配置', {
        title: 'Ruff：单配置覆盖 lint 与 format',
        language: 'TOML',
        code: `[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM"]
ignore = ["E501"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"`,
        output: `uv run ruff check .
uv run ruff format --check .
Found 12 errors
Would reformat: src/orders/service.py

Ruff 同时报告导入排序、未使用变量、代码简化和格式问题。
一个 pyproject.toml 固定版本、规则与输出风格。`,
      }],
      ['规则分级与修复', '演示规则分级：E/F 为正确性基础，B/UP 等按需开启；用 ruff check --statistics 先看存量问题分布，再以 --fix 自动修复安全项，--unsafe-fixes 需逐条确认。存量问题可用忽略清单冻结，避免全量重写污染 diff。', '先统计再修复', {
        title: 'Ruff：统计后分级修复',
        language: 'PowerShell',
        code: `uv run ruff check . --statistics
uv run ruff check . --fix
git diff --stat
uv run ruff check . --unsafe-fixes --fix --diff
uv run ruff check . --output-format concise
uv run ruff check . --statistics`,
        output: `184 F401 unused-import
72 I001 unsorted-imports
21 B006 mutable-argument-default
18 UP035 deprecated-import

Safe fixes applied: 256
Remaining errors: 39

先统计确认类型，再自动修复安全项。
B006 等语义改动通过 --diff 逐条审查，不盲目应用。`,
      }],
      ['格式化与纪律', '对比 Ruff format 与 black 的兼容关系，讲解 line-length、引号风格在 pyproject 中的配置。强调格式化提交必须与功能改动分离，避免评审被格式噪音淹没；演示对单个文件执行格式化并核对 git diff，确认无意外改动混入。', '格式单独提交', {
        title: 'Ruff format：格式化与功能提交分离',
        language: 'PowerShell',
        code: `git switch -c chore/format-python
uv run ruff format src/orders/service.py
git diff -- src/orders/service.py
uv run pytest tests/orders/test_service.py -q
git add src/orders/service.py
git commit -m "格式化订单服务"
git switch -c feature/retry-budget
uv run ruff format --check .`,
        output: `1 file reformatted
diff shows only quote style and line wrapping
12 passed in 0.08s
[chore/format-python] 格式化订单服务
All checks passed!

格式提交只含空白、引号与换行变化，测试仍通过。
功能分支基于格式提交，评审 diff 不被噪音淹没。`,
      }],
      ['pre-commit 钩子', '用 pre-commit 框架把 ruff check、ruff format 固化为本地提交前钩子，.pre-commit-config.yaml 锁定 rev 版本保证团队一致。说明钩子只检查暂存区文件，且提交时可绕过，因此不能替代服务端 CI 门禁，只能把反馈提前到提交前。', '钩子提前反馈', {
        title: 'pre-commit：锁定 Ruff 钩子版本',
        language: 'YAML',
        code: `repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.7.4
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-yaml`,
        output: `pre-commit install
pre-commit run --all-files
ruff-check................................Passed
ruff-format...............................Passed
end-of-file-fixer.........................Passed
check-yaml................................Passed

rev 固定钩子版本，所有开发者得到相同规则。
钩子只检查暂存文件，服务端 CI 仍然是最终门禁。`,
      }],
      ['CI 门禁一致性', '在 CI 中运行与本地完全相同的命令与配置文件，用缓存加速安装，失败即阻断合并。讲解本地与 CI 结果不一致的常见原因：版本漂移、跳过钩子、缓存差异，给出用任务脚本统一命令入口的做法，保证任何环境执行结果一致。', '同一命令跑两端', {
        title: 'GitHub Actions：运行同一 Ruff 门禁',
        language: 'YAML',
        code: `jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
        with: { enable-cache: true }
      - run: uv sync --locked
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src
      - run: uv run pytest -q
      - run: pre-commit run --all-files`,
        output: `uv sync --locked: audited 48 packages
ruff check: All checks passed
ruff format --check: 0 files would be reformatted
mypy: Success no issues
pytest: 214 passed
pre-commit: Passed

CI 直接执行 pyproject.toml 中同一 Ruff 版本与规则。
任何一步非零退出都阻断合并。`,
      }],
    ],
  },
  {
    name: pyP5Name('Celery、重试、幂等和死信'),
    track,
    minutes: 38,
    prerequisite: '已了解消息队列基本概念，能编写并运行普通的函数级单元测试。',
    goal: '能设计 acks_late、重试退避与幂等键协同的任务可靠性方案，建立死信处理与人工介入路径，理解每项配置对应的故障场景。',
    guidedPractice: '搭建 Redis broker 的本地 Celery 环境，编写一个发信任务并依次验证：kill worker 后消息重投、同一幂等键重复投递只执行一次、超过重试上限进入死信表，产出三种场景的验证记录。',
    independentPractice: '独立为账单生成任务补齐可靠性设计：配置指数退避重试、实现幂等键抢占、接入死信表与告警回调，并人为制造 broker 中断验证恢复后的任务不丢不重。',
    commonErrors: ['开启 acks_late 却未设计幂等，worker 重启后同一订单被重复处理。', '对所有异常一律无限重试，毒丸任务占满 worker 导致正常任务饥饿。'],
    sourceRefs: ['Celery Documentation. https://docs.celeryq.dev/', 'pytest Documentation. https://docs.pytest.org/'],
    steps: [
      ['队列异步解耦', '讲解 Celery 的组成：producer 发布任务到 broker（Redis/RabbitMQ），worker 消费执行，结果可回写 backend。对比 HTTP 同步调用，把发邮件、生成报表等慢操作移入队列后接口立即返回任务 ID，削峰且故障隔离。演示用 delay 发布与 get 轮询结果。', '慢操作移出请求', {
        title: 'Celery：把慢任务移出请求线程',
        language: 'Python',
        code: `from celery import Celery
import time

app = Celery("orders", broker="redis://redis:6379/0", backend="redis://redis:6379/1")

@app.task
def send_receipt(order_id):
    time.sleep(2)
    return f"sent:{order_id}"

result = send_receipt.delay("O-1")
print("task-id", result.id)
print("state", result.state)
print("result", result.get(timeout=5))
print("state-after", result.state)`,
        output: `task-id 7f21a-...
state PENDING
result sent:O-1
state-after SUCCESS

HTTP 请求只需发布任务并拿到 task ID。
邮件发送在 worker 中执行，不占请求线程。`,
      }],
      ['acks_late 与重投', '讲解确认语义：默认 early ack 在任务开始前就确认，worker 崩溃后任务丢失；设 acks_late=True 则完成后才确认，worker 被杀时消息重投给其他 worker。代价是任务可能被重复执行，因此必须配合幂等设计。', '晚确认换不丢', {
        title: 'Celery：acks_late 与崩溃重投',
        language: 'Python',
        code: `app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)

@app.task(bind=True, acks_late=True)
def generate_invoice(self, order_id):
    print("start", self.request.id, order_id)
    raise SystemExit("simulate worker crash")

# worker-a 取到任务后执行 kill -9
# broker 未收到 ACK，消息重投给 worker-b`,
        output: `worker-a start task=7f21 order=O-1
worker-a killed before ack
worker-b start task=7f21 order=O-1
worker-b generated invoice

任务完成后才 ACK，worker 崩溃后消息重新入队。
同一任务会执行两次，业务必须用幂等键吸收重复。`,
      }],
      ['幂等键防重复', '演示幂等实现：任务以业务唯一键（订单号、文件哈希）查询处理状态，已处理直接返回，未处理才执行，必要时用数据库唯一约束或 Redis SETNX 抢占。说明重试与重投都可能造成重复消费，任何写外部系统的任务必须先设计幂等，再考虑重试次数。', '先幂等再重试', {
        title: 'Celery：数据库唯一键保证幂等',
        language: 'Python',
        code: `@app.task(bind=True)
def generate_invoice(self, order_id):
    key = f"invoice:{order_id}"
    inserted = db.execute("""
        insert into task_runs(task_key, status)
        values (?, 'RUNNING')
        on conflict(task_key) do nothing
    """, (key,)).rowcount
    if inserted == 0:
        state = db.execute("select status from task_runs where task_key=?", (key,)).fetchone()[0]
        return {"skipped": True, "state": state}
    try:
        invoice = build_invoice(order_id)
        db.execute("update task_runs set status='DONE' where task_key=?", (key,))
        return invoice
    except Exception:
        db.execute("update task_runs set status='FAILED' where task_key=?", (key,))
        raise`,
        output: `first delivery: inserted=1 -> invoice generated
second delivery: inserted=0 -> skipped state=DONE
concurrent delivery: one RUNNING, one skipped

唯一键把重复投递收敛到一个执行者。
任务状态持久化，进程重启后仍可判断是否完成。`,
      }],
      ['重试策略设计', '讲解 autoretry_for 指定可重试异常，retry_backoff 指数退避并配 jitter 防止同时重试的雪崩，max_retries 限制次数。区分可重试错误（网络超时）与不可重试错误（参数非法），演示在任务内主动返回失败状态，避免无意义的重试拖垮队列。', '退避加抖动上限', {
        title: 'Celery：指数退避与异常分类',
        language: 'Python',
        code: `from requests import Timeout

class InvalidOrder(ValueError):
    pass

@app.task(
    bind=True,
    autoretry_for=(Timeout,),
    retry_backoff=2,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def sync_order(self, order_id):
    try:
        return client.fetch(order_id)
    except InvalidOrder as error:
        dead_letter.record(order_id, str(error))
        return {"permanent": True}
    except Timeout:
        raise

# 第 1 次约 2s，第 2 次约 4s，第 3 次约 8s，并加随机抖动`,
        output: `attempt 1 Timeout retry-in=1.72s
attempt 2 Timeout retry-in=4.38s
attempt 3 success
InvalidOrder -> dead_letter, no retry

超时按指数退避并加抖动，最多 5 次。
永久业务错误不进入重试队列，避免毒任务占满 worker。`,
      }],
      ['死信与人工介入', '讲解最终失败的处理路径：超过 max_retries 后进入 on_failure 回调，可写入死信表或发送告警，记录任务参数、异常栈与重试历史，供人工修复后重新入队。演示一个死信表的结构与后台查询思路，强调死信必须有兜底处理，不能只靠告警。', '失败要有出口', {
        title: 'Celery：失败写入死信表',
        language: 'Python',
        code: `class OrderTask(Task):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        dead_letter.execute("""
            insert into dead_letters(task_id, task_name, payload, error, traceback)
            values (?, ?, ?, ?, ?)
        """, (task_id, self.name, json.dumps(args), repr(exc), str(einfo)))
        alert.send("task-dead-letter", task_id=task_id, order=args[0])

@app.task(base=OrderTask, bind=True, max_retries=3)
def sync_order(self, order_id):
    raise RuntimeError("upstream rejected")

# 运维查询
# select task_id,payload,error from dead_letters where resolved_at is null order by created_at`,
        output: `retry 1/3, retry 2/3, retry 3/3
dead_letters row created task_id=7f21
alert task-dead-letter sent
unresolved dead letters=1

最终失败保留参数、异常与 traceback。
后台可按未解决状态查询，人工重放后标记 resolved_at。`,
      }],
    ],
  },
  {
    name: pyP5Name('wheel、版本和内部包发布'),
    track,
    minutes: 38,
    prerequisite: '已掌握 pip 安装与 requirements 的日常用法，了解虚拟环境隔离的基本原理。',
    goal: '能区分 wheel 与 sdist 的适用场景，执行私有 index 的内部包发布流程，并用版本锁定保证构建可复现，理解弃用策略对协作的影响。',
    guidedPractice: '用 python -m build 构建一个示例库的 sdist 与 wheel，对比两者的安装行为差异；将产物上传到本地 devpi，从另一虚拟环境安装并验证导入，记录版本号与哈希。',
    independentPractice: '独立为内部工具包建立发布流程：编写 pyproject 元数据、生成锁定文件、配置 twine check 与冒烟安装脚本，并为一个旧接口补上弃用警告与迁移说明。',
    commonErrors: ['用同一版本号反复覆盖发布产物，下游锁定哈希后安装直接失败。', '移除公开接口前未发弃用警告，下游升级主版本时大面积报错。'],
    sourceRefs: ['Python Packaging User Guide. https://packaging.python.org/', 'pytest Documentation. https://docs.pytest.org/'],
    steps: [
      ['wheel 与 sdist', '对比两种分发格式：sdist 是源码压缩包，安装时在用户机器执行构建；wheel 是预构建产物，安装直接解压，无需本地编译器，速度更快且结果确定。演示用 python -m build 同时产出两者，并指出带 C 扩展的包必须发布对应平台的 wheel。', '优先安装 wheel', {
        title: 'Python build：生成 wheel 与 sdist',
        language: 'PowerShell',
        code: `uv run python -m build
Get-ChildItem dist | Select-Object Name, Length
uv pip install dist\\orders_sdk-1.2.0-py3-none-any.whl
uv pip show orders-sdk
uv pip install --no-binary orders-sdk --force-reinstall dist\\orders_sdk-1.2.0.tar.gz
uv pip show orders-sdk`,
        output: `orders_sdk-1.2.0-py3-none-any.whl  18422
orders_sdk-1.2.0.tar.gz            9210
Installed orders-sdk 1.2.0 from wheel
wheel install 0.2s
sdist install runs build backend in 1.4s

wheel 直接解压安装，sdist 在本地触发构建。
带 C 扩展的项目要为每个平台/ABI 发布对应 wheel。`,
      }],
      ['SemVer 与弃用', '讲解语义化版本：主版本不兼容、次版本加功能、修订号修缺陷。弃用流程规范：先在变更日志与文档标注废弃、运行时发 DeprecationWarning，保留至少一个次版本的过渡期，再在主版本移除。演示用 warnings.warn 带栈级提示引导调用方迁移。', '先警告后移除', {
        title: 'Python：弃用警告与迁移路径',
        language: 'Python',
        code: `import warnings

def fetch_order(order_id):
    warnings.warn(
        "fetch_order() is deprecated since 1.3; use get_order()",
        DeprecationWarning,
        stacklevel=2,
    )
    return get_order(order_id)

def get_order(order_id):
    return {"id": order_id}

print(fetch_order("O-1"))
print(DeprecationWarning.__name__)`,
        output: `{'id': 'O-1'}
DeprecationWarning
__main__:7: DeprecationWarning: fetch_order() is deprecated since 1.3; use get_order()

旧接口仍工作，但调用方能看到迁移提示。
warning stacklevel=2 指回调用位置，1.x 保留兼容，2.0 再删除旧名。`,
      }],
      ['私有 index 搭建', '介绍 devpi 与 Artifactory 的定位：托管内部包上传并代理缓存外部源，pip 通过 index-url 与 extra-index-url 指向私有服务，凭据走环境变量或密钥管理而非明文。演示上传一个内部包并在另一项目安装，说明内部包命名与命名空间约定。', '内部包有仓库', {
        title: 'devpi：上传并从私有 index 安装',
        language: 'PowerShell',
        code: `docker run -d --name devpi -p 3141:3141 devpi/devpi:latest
uv run devpi use http://127.0.0.1:3141
uv run devpi login root --password ""
uv run devpi index -c internal bases=root/pypi
uv run devpi use internal
uv run twine upload --repository-url http://127.0.0.1:3141/root/internal dist/*
uv pip install --index-url http://127.0.0.1:3141/root/internal orders-sdk==1.2.0
uv pip show orders-sdk`,
        output: `internal index created
Uploading orders_sdk-1.2.0-py3-none-any.whl
Uploading orders_sdk-1.2.0.tar.gz
Installed orders-sdk 1.2.0
Home-page: https://packages.example/orders-sdk

内部包托管在私有 index，并代理缓存 root/pypi。
凭据通过环境变量或 .pypirc 安全配置，不写进项目文件。`,
      }],
      ['锁定与可复现', '讲解 pip freeze 与锁定文件的区别：requirements.txt 声明直接依赖，锁定文件记录整棵依赖树的精确版本与哈希。配合 pip-tools 或 uv 生成锁定文件，CI 与生产用锁定文件安装，保证任何时间重建环境得到相同的依赖集合与构建产物。', '锁定保证可复现', {
        title: 'uv lock：校验完整依赖树',
        language: 'PowerShell',
        code: `uv lock
uv export --format requirements-txt --no-hashes > requirements.lock.txt
Get-Content uv.lock | Select-String 'name = "orders-sdk"|version = "1.2.0"|hash = "sha256:' -Context 0,2
uv sync --locked
uv pip check
Get-FileHash requirements.lock.txt -Algorithm SHA256
uv pip install --no-deps -r requirements.lock.txt --dry-run`,
        output: `Resolved 58 packages
name = "orders-sdk" version = "1.2.0"
hash = "sha256:..."
Audited 58 packages in 0.02s
No broken requirements found
SHA256 7A31...

uv.lock 锁定直接与传递依赖、来源和哈希。
--locked 在锁文件过期时失败；pip check 验证环境一致。`,
      }],
      ['发布前的门禁', '演示发布流程串联：先跑测试与类型检查，构建产物后用 twine check 校验元数据，在测试环境从私有 index 安装做冒烟验证，再推正式版本并打 git tag。强调版本号只允许一次发布，失败需升版本重发，禁止同版本号覆盖已有产物。', '版本号不可覆盖', {
        title: 'PowerShell：内部包发布门禁',
        language: 'PowerShell',
        code: `uv run pytest -q
uv run mypy src
uv run python -m build
uv run twine check dist/*
$wheel = Get-ChildItem dist\\*.whl | Select-Object -First 1
$hash = (Get-FileHash $wheel.FullName -Algorithm SHA256).Hash
uv pip install --force-reinstall $wheel.FullName
uv run python -c "import orders_sdk; print(orders_sdk.__version__)"
uv run twine upload --repository internal dist/*
git tag v1.2.0
git push origin v1.2.0
"$($wheel.Name) sha256=$hash" | Tee-Object release-evidence.txt`,
        output: `214 passed
Success: no issues found
twine check: 2 distributions passed
orders-sdk 1.2.0 imported
Uploaded orders_sdk-1.2.0...
tag v1.2.0 pushed

测试、类型、构建、元数据、冒烟安装和哈希全部通过。
同一版本已上传，后续失败必须发布 1.2.1。`,
      }],
    ],
  },
  {
    name: pyP5Name('后台任务与质量门禁实验'),
    track,
    minutes: 38,
    prerequisite: '已完成 Celery 任务与 pytest 测试课程，能在本地跑通一条最小 CI 流水线。',
    goal: '能用 eager 模式把 Celery 任务纳入测试体系，为任务补上状态与重试的可观测手段，并串联类型、lint 与覆盖率阈值形成完整质量门禁。',
    guidedPractice: '在示例项目中把报表任务改为 eager 模式测试并断言失败路径，接入 update_state 上报进度，配置 pytest-cov 的 fail_under 阈值，产出本地全部门禁通过的执行记录。',
    independentPractice: '独立搭建从提交到合并的完整流水线：pre-commit、ruff、mypy、带阈值的 pytest-cov 依次执行，故意注入一处类型错误与一处低覆盖模块验证各门禁拦截效果。',
    commonErrors: ['只用 eager 模式测试任务就认为可靠，序列化异常与并发问题在上线后集中暴露。', '覆盖率阈值定得远高于现状，团队被迫写大量无断言的凑数测试来达标。'],
    sourceRefs: ['pytest Documentation. https://docs.pytest.org/', 'Celery Documentation. https://docs.celeryq.dev/'],
    steps: [
      ['eager 模式测试', '讲解 task_always_eager 配置让任务在当前进程内同步执行，绕开 broker，单测中直接调用任务函数验证业务逻辑与异常路径。说明 eager 模式不覆盖序列化、并发投递等真实行为，只适合逻辑层测试，集成测试仍需真实 broker。演示 pytest 中切换该配置。', '同步执行便于测', {
        title: 'Celery：eager 模式运行任务测试',
        language: 'Python',
        code: `from celery import Celery
import pytest

app = Celery("orders", broker="memory://", backend="cache+memory://")
app.conf.task_always_eager = True

@app.task
def calculate_total(items):
    return sum(item["price"] * item["qty"] for item in items)

@app.task
def reject_empty(items):
    if not items:
        raise ValueError("empty")
    return True

def test_total():
    result = calculate_total.delay([{"price": 10, "qty": 2}])
    assert result.get() == 20

def test_reject_empty():
    with pytest.raises(ValueError):
        reject_empty.delay([]).get()`,
        output: `test_tasks.py::test_total PASSED
test_tasks.py::test_reject_empty PASSED
2 passed in 0.03s

eager 在当前进程执行任务，无需 broker。
序列化、并发投递与 worker 崩溃仍需真实 Redis/RabbitMQ 集成测试。`,
      }],
      ['任务状态可观测', '演示通过 result.state 轮询 PENDING、STARTED、SUCCESS、FAILURE 状态，需开启 task_track_started 才能看到 STARTED。讲解在任务内用 self.update_state 上报自定义进度与重试计数，把任务 ID 返回给调用方供查询，形成最小观测闭环。', '状态可查可追', {
        title: 'Celery：update_state 上报进度',
        language: 'Python',
        code: `app.conf.task_track_started = True

@app.task(bind=True)
def build_report(self, rows):
    self.update_state(state="PROGRESS", meta={"step": "load", "percent": 10})
    loaded = load(rows)
    self.update_state(state="PROGRESS", meta={"step": "render", "percent": 70})
    output = render(loaded)
    return {"file": output, "rows": len(rows)}

result = build_report.delay(rows)
print(result.state)
print(result.info)
print(result.get(timeout=10))`,
        output: `STARTED
{'step': 'load', 'percent': 10}
{'step': 'render', 'percent': 70}
{'file': 'report.pdf', 'rows': 500}

task_track_started 让首状态可见。
update_state 的 meta 写入 backend，调用方按 task ID 查询进度。`,
      }],
      ['覆盖率阈值门禁', '用 pytest-cov 生成覆盖率报告，配置 fail_under 设置最低阈值，未达标即退出码非零。讲解阈值的合理定位：从现状出发逐步抬高，防止只追数字而写无效断言；排除 migrations 等不可测目录，把覆盖率与具体模块绑定而非全局一刀切。', '阈值守住底线', {
        title: 'pytest-cov：设置覆盖率失败阈值',
        language: 'TOML',
        code: `[tool.coverage.run]
branch = true
source = ["orders"]

[tool.coverage.report]
show_missing = true
skip_covered = true
fail_under = 85
exclude_also = [
  "if TYPE_CHECKING:",
  "raise NotImplementedError",
]

[tool.pytest.ini_options]
addopts = "--cov=orders --cov-report=term-missing --cov-fail-under=85"`,
        output: `pytest
orders/service.py 92%
orders/repository.py 81%  MISSING 42-50
TOTAL 85.3%
Required test coverage of 85% reached

分支覆盖与缺失行都显示。
低于 85% 时 pytest 以非零码退出，CI 阻断合并。`,
      }],
      ['门禁流水线串联', '演示 CI 中按序执行：ruff check 与格式校验先拦截低级问题，mypy 过类型关，pytest 带覆盖率跑测试，任一环节失败即终止并阻止合并。讲解环节顺序的设计逻辑：便宜的检查放前面快速失败，昂贵的集成测试放后面，并缓存依赖安装缩短反馈时间。', '便宜检查先跑', {
        title: 'GitHub Actions：Python 质量门禁顺序',
        language: 'YAML',
        code: `jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
        with: { enable-cache: true }
      - run: uv sync --locked
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src
      - run: uv run pytest --cov=orders --cov-fail-under=85
      - run: uv run pytest -m integration
        env:
          DATABASE_URL: postgresql://app:secret@db/orders_test
          REDIS_URL: redis://redis:6379/0`,
        output: `ruff check: 0 errors
format: 0 changed
mypy: 0 errors
unit+cov: 214 passed, 85.3%
integration: 18 passed

lint 与类型先快速失败，单元测试随后，集成测试最后。
任何一步非零退出，后续步骤不执行且合并被阻断。`,
      }],
      ['综合实验收口', '把本阶段能力合成一条链：提交含 eager 测试与可观测改造的任务代码，本地 pre-commit 通过后推送，CI 跑完 lint、类型、覆盖率门禁，全部通过才允许合并。复盘每个门禁在哪一步拦下了什么问题，形成对工程质量的量化感知。', '门禁环环相扣', {
        title: 'PowerShell：本地与 CI 同一门禁脚本',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory scripts -Force | Out-Null
@'
$ErrorActionPreference = "Stop"
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest --cov=orders --cov-fail-under=85
'@ | Set-Content scripts\\quality.ps1
pre-commit run --all-files
.\scripts\quality.ps1
git push origin feature/reliable-report
gh pr checks --watch
gh pr view --json statusCheckRollup`,
        output: `pre-commit: Passed
ruff: Passed
mypy: Passed
pytest: 216 passed, coverage 86.1%
CI quality: success
mergeStateStatus: CLEAN

本地脚本和 CI 执行同一组命令与锁文件。
门禁完整通过后才开放合并。`,
      }],
    ],
  },
];

// ── P6 CPython、性能与生产部署 ─────────────────────────────────────────────
const pyP6Stage = 'CPython、性能与生产部署';
const pyP6Name = (topic: string) => `Python · ${pyP6Stage}：${topic}`;

export const HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: pyP6Name('dis 字节码与代码对象'),
    track,
    minutes: 38,
    prerequisite: '学员已能用函数、类与模块组织代码，并了解解释器逐行执行脚本的基本流程。',
    goal: '能用 dis 反汇编函数字节码，读懂常见指令与代码对象的结构，并用字节码视角解释局部变量快于全局变量等性能差异。',
    guidedPractice: '在 REPL 中对同一函数执行 dis.dis，按行号记录 LOAD_FAST 与 LOAD_GLOBAL 等指令的出现位置，整理成一份指令与代码对象字段（co_consts、co_names）的对照笔记。',
    independentPractice: '把同一计算循环分别写成局部变量版与全局变量版，反汇编对比指令序列差异，再用计时实验验证结论并写出小结。',
    commonErrors: ['只数指令条数就断言性能，忽略每条指令的实际开销与解释器特化行为。', '把不同 Python 版本的反汇编结果直接混着比较，误判指令差异为代码问题。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'CPython source. https://github.com/python/cpython'],
    steps: [
      ['为什么需要 dis', 'Python 先把源码编译成字节码，再由虚拟机逐条执行，dis 模块把这个中间层摊开给人看。导入 dis 后调用 dis.dis(func)，会按源码行号打印指令、偏移量与操作数，这是观察解释器行为最直接的入口。', '先编译再逐条执行', {
        title: 'dis：查看函数字节码',
        language: 'Python',
        code: `import dis

def total(values):
    return sum(value for value in values if value > 0)

print(total([1, -2, 3]))
dis.dis(total)
print("constants", total.__code__.co_consts)
print("names", total.__code__.co_names)
print("varnames", total.__code__.co_varnames)`,
        output: `4
  2          0 LOAD_GLOBAL              1 (NULL + sum)
             12 LOAD_CONST               1 (<code object <genexpr>>)
             14 MAKE_FUNCTION            0
             16 LOAD_FAST                0 (values)
             18 GET_ITER
             20 CALL                     1
             28 RETURN_VALUE
constants (None, <code object <genexpr>>, 'total')
names ('sum',)
varnames ('values',)

反汇编按源码行、偏移和操作数展示执行步骤。
co_consts 与 co_names 能和操作数对应。`,
      }],
      ['读懂指令与代码对象', '每条指令由操作码与操作数构成，LOAD_FAST、LOAD_GLOBAL、CALL 各自对应不同的取值与调用路径；函数同时携带一个代码对象，保存常量元组、变量名与指令序列。用 func.__code__ 查看 co_consts 与 co_names，能把反汇编输出和对象字段一一对上。', '指令加代码对象', {
        title: 'Python：检查代码对象字段',
        language: 'Python',
        code: `import dis

limit = 10
def check(value):
    result = value + limit
    return max(result, 0)

code = check.__code__
print("varnames", code.co_varnames)
print("names", code.co_names)
print("consts", code.co_consts)
print("stack", code.co_stacksize, "bytes", len(code.co_code))
dis.dis(check)`,
        output: `varnames ('value', 'result')
names ('limit', 'max')
consts (None, 0)
stack 2 bytes 60
  3 LOAD_FAST                0 (value)
     LOAD_GLOBAL              1 (limit)
     BINARY_OP                0 (+)
     STORE_FAST               1 (result)
  4 LOAD_GLOBAL              3 (NULL + max)
    LOAD_FAST                1 (result)
    LOAD_CONST               1 (0)
    CALL                     2
    RETURN_VALUE

局部变量在 varnames，全局名在 names，常量在 consts。
操作数中的名称索引可和字段对应。`,
      }],
      ['常量折叠的边界', '编译器在生成字节码时会折叠常量表达式，比如把 3 * 7 直接换成 21，省掉运行时计算。但折叠只在编译期成立，涉及变量、函数调用或超长整数运算不会参与折叠。用 dis 对比含纯字面量表达式与含变量的两个函数，输出差异一目了然。', '折叠只发生在编译期', {
        title: 'dis：常量折叠与变量运算',
        language: 'Python',
        code: `import dis

def folded():
    return 3 * 7

value = 7
def runtime():
    return 3 * value

print(folded.__code__.co_consts)
dis.dis(folded)
print(runtime.__code__.co_consts)
dis.dis(runtime)`,
        output: `(None, 21)
  2 LOAD_CONST               1 (21)
     RETURN_VALUE
(None, 3)
  2 LOAD_CONST               1 (3)
     LOAD_GLOBAL              0 (value)
     BINARY_OP                5 (*)
     RETURN_VALUE

纯字面量 3*7 被编译成常量 21。
含变量的乘法保留 LOAD_GLOBAL 和 BINARY_OP。`,
      }],
      ['局部变量为何更快', 'LOAD_FAST 按数组下标直接取局部变量，LOAD_GLOBAL 则要查字典并可能沿外层作用域逐层回退，字节码层面的指令差异就是性能差异的来源之一。把同一循环分别写成局部引用与全局引用，反汇编对比指令类型，再用计时实验验证差距。', '指令路径决定快慢', {
        title: 'Python：局部引用与全局引用计时',
        language: 'Python',
        code: `import dis, timeit

def global_loop():
    total = 0
    for item in RANGE_VALUES:
        total += item
    return total

RANGE_VALUES = range(1000)

def local_loop():
    values = RANGE_VALUES
    total = 0
    for item in values:
        total += item
    return total

print("global", min(timeit.repeat(global_loop, number=2000, repeat=5)))
print("local", min(timeit.repeat(local_loop, number=2000, repeat=5)))
dis.dis(global_loop)
dis.dis(local_loop)`,
        output: `global 0.0641
local 0.0587
global_loop includes LOAD_GLOBAL (RANGE_VALUES)
local_loop includes LOAD_FAST (values)

局部引用少一次全局字典查找。
差距通常有限，必须用同机同版本计时验证。`,
      }],
      ['字节码看的限度', 'dis 显示的是逻辑指令序列，真实耗时还受解释器自适应特化、缓存与硬件影响，同一函数在不同 Python 版本下指令可能不同，因此字节码适合解释相对差异，不能直接当作耗时证明。结论要配合 profile 或计时实验交叉验证才可靠。', '字节码解释相对差异', {
        title: 'PowerShell：记录版本与性能证据',
        language: 'PowerShell',
        code: `python -VV
python -c "import dis; dis.dis(compile('sum(range(100))', '<bench>', 'eval'))" > bytecode.txt
python -m timeit -n 2000 "sum(range(100))"
python -X int_max_str_digits=640 -c "print(2**10000 % 97)"
Get-FileHash bytecode.txt -Algorithm SHA256
Get-Content bytecode.txt -TotalCount 20`,
        output: `Python 3.12.7 (main, Oct 15 2024)
2000 loops, best of 5: 1.14 usec per loop
45
SHA256 71A0...
  0 PUSH_NULL
  2 LOAD_NAME                0 (sum)
  4 LOAD_NAME                1 (range)

版本、反汇编、计时和哈希一起保存。
换 Python 版本后必须重新采样，不能直接比较旧指令。`,
      }],
    ],
  },
  {
    name: pyP6Name('引用计数、GC 和内存增长'),
    track,
    minutes: 38,
    prerequisite: '学员已了解 CPython 对象模型基础，会用 sys 与内置工具观察对象的生命周期行为。',
    goal: '能解释引用计数为主、分代 GC 兜底循环引用的回收机制，用 gc.set_debug 与 tracemalloc 定位内存增长点，并用 __slots__ 削减大量实例的内存占用。',
    guidedPractice: '构造相互引用的对象图触发循环引用，用 gc.collect 与 gc.set_debug(gc.DEBUG_LEAK) 观察回收日志，再用 tracemalloc 抓取前后两次快照，比对增长最高的分配点并记录到排查笔记。',
    independentPractice: '给一个百万级实例的数据类加 __slots__，记录改造前后的 RSS 与 tracemalloc 顶部分配条目，写出一份内存对比小结与适用边界说明。',
    commonErrors: ['以为 del 会立即释放对象，忽略仍被其他引用计数持有的残留引用。', '把 tracemalloc 快照当成常驻内存大小，混淆分配量与 RSS 两种统计口径。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'CPython source. https://github.com/python/cpython'],
    steps: [
      ['引用计数怎么工作', 'CPython 给每个对象维护引用计数字段，引用增减立即更新，计数归零马上调用析构归还内存，这是主回收路径，多数对象根本活不到 GC 介入。用 sys.getrefcount 观察一个字符串的引用数变化，注意传参本身会临时加一。', '计数归零立即释放', {
        title: 'Python：观察引用计数升降',
        language: 'Python',
        code: `import sys, weakref

class Order:
    pass

order = Order()
print(sys.getrefcount(order))
alias = order
print(sys.getrefcount(order))
ref = weakref.ref(order)
print(sys.getrefcount(order), ref() is order)
del alias
print(sys.getrefcount(order))
del order
print(ref())`,
        output: `2
3
3 True
2
None

getrefcount 参数本身贡献一次临时引用。
弱引用不增加计数，最后一个强引用删除后对象释放。`,
      }],
      ['分代 GC 兜循环引用', '两个对象互相持有引用时计数永不归零，分代 GC 通过扫描对象图找出不可达的循环并整体拆掉。GC 按存活次数分 0、1、2 三代，越老的代扫描越少以控制开销。用 gc.collect 的返回值与 gc.garbage 列表观察循环对象被回收的过程。', '分代扫描拆循环', {
        title: 'gc：回收不可达循环引用',
        language: 'Python',
        code: `import gc, weakref

class Node:
    pass

a = Node()
b = Node()
a.peer = b
b.peer = a
ref = weakref.ref(a)
print("before", ref() is not None, gc.get_count())
del a, b
print("before-collect", ref() is not None)
print("collected", gc.collect())
print("after", ref())
print("garbage", len(gc.garbage))`,
        output: `before True (12, 1, 2)
before-collect True
collected 2
after None
garbage 0

互相引用的对象计数不归零，del 后仍存活。
gc.collect 扫描并回收，报告 2 个不可达对象。`,
      }],
      ['gc 调试标志观测', 'gc.set_debug(gc.DEBUG_LEAK) 会让 GC 把不可回收对象保留在 gc.garbage 并打印详情，DEBUG_STATS 还输出各代触发时的统计信息。观测完毕要记得关掉调试标志并手动 collect，否则调试信息本身会干扰后续判断。', '调试标志用完要关', {
        title: 'gc：开启并关闭调试标志',
        language: 'Python',
        code: `import gc

class Node:
    pass

a = Node()
b = Node()
a.peer = b
b.peer = a
del a, b

gc.set_debug(gc.DEBUG_STATS | gc.DEBUG_SAVEALL)
print("collect", gc.collect())
print("garbage", len(gc.garbage))
gc.garbage.clear()
gc.set_debug(0)
print("debug", gc.get_debug())`,
        output: `gc: collecting generation 2...
gc: objects in each generation: 412 18 9
collect 2
garbage 2
debug 0

DEBUG_STATS 输出分代扫描统计。
DEBUG_SAVEALL 把回收对象保留在 garbage，观测后关闭标志并清空。`,
      }],
      ['快照对比定位泄漏', 'tracemalloc.start() 之后可在两个时点各取一次快照，用统计比较按文件与行号列出增长最高的分配，直接指向泄漏源头。注意开启追踪会拖慢整体运行，适合在排查环境临时启用，不适合长期挂在生产进程上收集数据。', '快照比对找泄漏点', {
        title: 'tracemalloc：比较两次快照',
        language: 'Python',
        code: `import tracemalloc
from orders.cache import cache

tracemalloc.start(25)
before = tracemalloc.take_snapshot()
for number in range(2000):
    cache[f"product:{number}"] = {"payload": "x" * 1024}
after = tracemalloc.take_snapshot()

for stat in after.compare_to(before, "lineno")[:5]:
    print(stat)
current, peak = tracemalloc.get_traced_memory()
print("current", current, "peak", peak)
tracemalloc.stop()`,
        output: `orders/cache.py:12: size=2112 KiB (+2112 KiB), count=2000 (+2000)
current 2163008 peak 2191120

增长最大分配定位到 cache 写入行。
快照描述 Python 分配量，不是进程 RSS；排查结束后停止追踪。`,
      }],
      ['__slots__ 省内存', '每个普通实例都带一个 __dict__ 存属性，字典本身就占几十到上百字节。在类里声明 __slots__ 后属性改用固定槽位存储，百万级实例能省下可观的内存。代价是不能随意新增属性，与依赖动态属性的场景不兼容，改造前要先确认用法。', '槽位换掉实例字典', {
        title: 'Python：__slots__ 内存对比',
        language: 'Python',
        code: `import tracemalloc

class Regular:
    def __init__(self, order_id, total):
        self.order_id = order_id
        self.total = total

class Slotted:
    __slots__ = ("order_id", "total")
    def __init__(self, order_id, total):
        self.order_id = order_id
        self.total = total

for cls in (Regular, Slotted):
    tracemalloc.start()
    rows = [cls(f"O-{i}", i) for i in range(100000)]
    size, _ = tracemalloc.get_traced_memory()
    print(cls.__name__, size, hasattr(rows[0], "__dict__"))
    tracemalloc.stop()

slotted = Slotted("O-1", 10)
try:
    slotted.extra = "x"
except AttributeError as error:
    print(type(error).__name__, error)`,
        output: `Regular 10900000 True
Slotted 6400000 False
AttributeError 'Slotted' object has no attribute 'extra'

十万实例减少约 4.5 MB。
固定字段才能用 slots，动态新增属性会失败。`,
      }],
    ],
  },
  {
    name: pyP6Name('GIL、自由线程与进程并发'),
    track,
    minutes: 38,
    prerequisite: '学员已掌握 threading 与 multiprocessing 的基本用法，能写出并运行简单的并发示例。',
    goal: '能说明 GIL 限制单线程执行字节码的原因与 IO 释放时机，了解 3.13 自由线程实验构建的取舍，并能按任务类型在多线程与多进程之间做出有依据的选型。',
    guidedPractice: '编写 CPU 密集与 IO 密集两组基准任务，分别在多线程与多进程下计时对比，记录 GIL 串行化与进程启动、pickle 序列化的开销差异，整理成一张并发选型结论表。',
    independentPractice: '把一个 CPU 密集脚本改造成 multiprocessing 版本，分别测量任务拆分成本与进程间传参耗时，计算总收益是否为正并写出选型依据。',
    commonErrors: ['给 CPU 密集任务换成多线程却看不到加速，未意识到字节码执行被 GIL 串行化。', '用多进程传大对象时忽略 pickle 序列化与 IPC 的开销，并行收益被传输成本吃掉。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'PEP 703 Free-threading. https://peps.python.org/pep-0703/'],
    steps: [
      ['GIL 到底锁什么', 'GIL 保证同一时刻只有一个线程在解释器内执行字节码，它简化了 CPython 的内存管理实现。线程切换由解释器按固定间隔调度，即使 8 核机器上的纯 Python 计算线程也无法真正并行推进。理解这一点是所有并发选型的前提。', '单线程执行字节码', {
        title: 'Python：CPU 任务多线程计时',
        language: 'Python',
        code: `from concurrent.futures import ThreadPoolExecutor
import time

def compute(number):
    total = 0
    for value in range(2_000_000):
        total += value
    return number + total

start = time.perf_counter()
list(map(compute, range(4)))
print("serial", round(time.perf_counter() - start, 2))

start = time.perf_counter()
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(compute, range(4)))
print("threads", round(time.perf_counter() - start, 2))`,
        output: `serial 0.82
threads 0.86

纯 Python 计算被 GIL 串行化。
四线程没有加速，额外调度甚至略慢。`,
      }],
      ['IO 时线程可并行', '线程进入网络收发、文件读写或 time.sleep 等阻塞调用时会主动释放 GIL，其他线程得以推进，所以多线程对 IO 密集任务依然有效。并发拉取多个网页的线程版往往接近线性加速，而纯计算循环则毫无收益。', 'IO 释放 GIL', {
        title: 'Python：IO 等待让线程并行',
        language: 'Python',
        code: `from concurrent.futures import ThreadPoolExecutor
import time

def fetch(number):
    time.sleep(0.2)
    return number

start = time.perf_counter()
list(map(fetch, range(8)))
print("serial", round(time.perf_counter() - start, 2))

start = time.perf_counter()
with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(fetch, range(8)))
print("threads", round(time.perf_counter() - start, 2))`,
        output: `serial 1.64
threads 0.21

sleep 阻塞时线程释放 GIL。
八个等待重叠，墙钟时间接近单个 0.2 秒。`,
      }],
      ['自由线程实验构建', 'PEP 703 推动的自由线程版本在 3.13 以实验构建提供，安装带 t 后缀的解释器后不再依赖 GIL，多线程计算可以真正并行。代价是单线程性能回退与部分 C 扩展不兼容，官方仍以独立构建隔离风险，尚不是默认选项。', '实验构建尚非默认', {
        title: 'Python：检查自由线程构建能力',
        language: 'Python',
        code: `import sys, sysconfig

print(sys.version)
print("gil-disabled-build", sysconfig.get_config_var("Py_GIL_DISABLED"))
print("free-threaded", hasattr(sys, "_is_gil_enabled") and not sys._is_gil_enabled())

from concurrent.futures import ThreadPoolExecutor
def burn(number):
    return sum(value * value for value in range(1_000_000))

with ThreadPoolExecutor(max_workers=4) as pool:
    print(list(pool.map(burn, range(4))))`,
        output: `3.13.1 experimental free-threading build
gil-disabled-build 1
free-threaded True
[333332833333500000, ...]

构建标记说明 GIL 已关闭。
部署前仍要验证单线程回退、C 扩展兼容与包 wheel 支持。`,
      }],
      ['多进程绕开 GIL', 'multiprocessing 为每个任务启用独立解释器进程，各自持有 GIL，天然适合 CPU 密集并行。开销集中在启动成本与 IPC：参数和返回值都要经过 pickle 序列化跨进程传递，对象越大、传递越频繁，收益越容易被吃掉。', '进程并行有传输税', {
        title: 'multiprocessing：CPU 并行与序列化',
        language: 'Python',
        code: `from concurrent.futures import ProcessPoolExecutor
import time, pickle

def compute(limit):
    return sum(value * value for value in range(limit))

if __name__ == "__main__":
    start = time.perf_counter()
    with ProcessPoolExecutor(max_workers=4) as pool:
        print(list(pool.map(compute, [2_000_000] * 4)))
    print("process", round(time.perf_counter() - start, 2))

    payload = [{"id": i, "blob": "x" * 1024} for i in range(50000)]
    encoded = pickle.dumps(payload)
    print("payload", len(payload), "pickle", len(encoded))`,
        output: `[2666666666666667000000, ...]
process 0.73
payload 50000 pickle 61000000

四进程各自执行 CPU 计算，绕开同一 GIL。
大对象跨进程会复制并 pickle，传输成本可能吃掉并行收益。`,
      }],
      ['按任务类型选型', '选型先分清任务性质：IO 密集优先线程或异步，CPU 密集走多进程或把热点交给 C 扩展；自由线程构建可作为前瞻试验但不能直接上生产。先用基准实测每种方案在目标机器上的耗时，再确定实现，不凭经验拍板。', '先实测再定并发方案', {
        title: 'Python：并发方案选型基准',
        language: 'PowerShell',
        code: `uv run python bench_concurrency.py --io
uv run python bench_concurrency.py --cpu
uv run python bench_concurrency.py --cpu --workers 4
uv run python -VV
Get-CimInstance Win32_Processor | Select-Object NumberOfCores, NumberOfLogicalProcessors
Get-Process python | Select-Object Id, WorkingSet64, CPU
python -c "import pickle,sys; print(pickle.DEFAULT_PROTOCOL, sys.implementation.name)"`,
        output: `io: serial=1.62 threads=0.21 async=0.20
cpu: serial=0.82 threads=0.86 processes=0.31
cores=8 logical=16
pickle protocol=5 implementation=cpython

IO 用 async/threads，CPU 用 processes。
选型报告同时保留机器、worker 数和传输对象大小。`,
      }],
    ],
  },
  {
    name: pyP6Name('py-spy、cProfile 与火焰图'),
    track,
    minutes: 38,
    prerequisite: '学员已能编写带明显性能差异的测试脚本，并了解函数调用栈的基本结构。',
    goal: '能区分 cProfile 插桩统计与 py-spy 采样的失真差异，用 py-spy 挂到运行中的进程抓取火焰图，并按热点定位、修复、复测的闭环完成一次性能优化。',
    guidedPractice: '对同一个脚本分别跑 cProfile 与 py-spy record，导出火焰图并对比两者热点排序的差异，标注各自的失真来源，形成一份剖析工具对比记录。',
    independentPractice: '用 py-spy dump 抓取一次模拟生产进程的调用栈，锁定最宽的栈帧并做一次小修复，之后重抓火焰图验证热点宽度收窄。',
    commonErrors: ['把 cProfile 的函数耗时直接当作真实占比，忽略插桩本身带来的开销与失真。', '只看火焰图颜色不看方块宽度，误把浅层小函数当成主要热点去优化。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'py-spy. https://github.com/benfred/py-spy'],
    steps: [
      ['插桩统计的失真', 'cProfile 通过钩子在每次函数进出时记录，能拿到调用次数与累计耗时，但探针本身增加开销，对调用频繁的小函数失真尤其明显。它适合观察调用结构与次数分布，绝对耗时需要另外的时间基准校准，不能把统计值直接当真实成本。', '插桩准结构失真耗时', {
        title: 'cProfile：查看调用次数与累计耗时',
        language: 'Python',
        code: `import cProfile, pstats

def parse_row(row):
    return row.strip().upper()

def process(rows):
    return [parse_row(row) for row in rows]

rows = [" a "] * 50000
profiler = cProfile.Profile()
profiler.enable()
process(rows)
profiler.disable()
profiler.dump_stats("profile.out")
pstats.Stats(profiler).sort_stats("cumtime").print_stats(10)`,
        output: `50002 function calls in 0.038 seconds
ncalls  tottime  percall  cumtime  function
 50000    0.022    0.000    0.022  parse_row
     1    0.016    0.016    0.038  process

parse_row 调用 5 万次，插桩本身增加函数进出记录。
调用次数与结构可靠，绝对耗时需用无插桩计时复核。`,
      }],
      ['采样无侵入挂进程', 'py-spy 以采样方式定期抓取目标进程调用栈，不需要改代码也不需要重启，py-spy record --pid 可直接挂到正在运行的服务上，dump 还能查看当前栈。采样开销极低，适合生产环境观察，但样本太少时热点结论会有随机波动。', '采样低开销可挂生产', {
        title: 'py-spy：挂到运行中的 Python 进程',
        language: 'PowerShell',
        code: `Get-Process python | Select-Object Id, ProcessName, WorkingSet64
py-spy dump --pid 4242
py-spy record --pid 4242 --duration 30 --rate 100 --format raw -o samples.txt
py-spy record --pid 4242 --duration 30 --format flamegraph -o flame.svg
Get-Content samples.txt | Select-Object -First 10
Get-Item flame.svg | Select-Object Length`,
        output: `Thread 4242 (idle)
  File "orders/api.py", line 88, in stream
  File "orders/repository.py", line 42, in list_open
  File "sqlalchemy/engine/base.py", line 1476, in execute
flame.svg 183422 bytes

无需改代码或重启，直接抓取当前栈。
长时间慢等待出现在 repository/execute，而非 CPU 热点。`,
      }],
      ['火焰图读宽与深', '火焰图横轴是采样占比，方块越宽表示该函数出现越多，纵轴是调用深度，从底到顶是一条栈路径。找热点先扫最宽的顶层方块，再顺着栈向下看是谁把它调用进来的；颜色通常只是暖色梯度装饰，并不代表耗时快慢。', '先看宽再顺着栈看', {
        title: 'Inferno：生成差异火焰图',
        language: 'PowerShell',
        code: `py-spy record --pid 4242 --duration 60 --format raw -o before.folded
py-spy record --pid 4242 --duration 60 --format raw -o after.folded
git diff --no-index before.folded after.folded
inferno-flamegraph before.folded > before.svg
inferno-flamegraph after.folded > after.svg
difffolded.pl before.folded after.folded | inferno-flamegraph > diff.svg
Get-Item before.svg, after.svg, diff.svg | Select-Object Name, Length`,
        output: `before.svg 204KB
after.svg 151KB
diff.svg 98KB
Diff: parse_json width 31% -> 4%
Diff: tokenize width 8% -> 7%

横轴宽度从 31% 降到 4%，说明 parse_json 热点显著收窄。
其他函数宽度基本不变，优化作用局限在目标路径。`,
      }],
      ['热点定位到修复', '锁定宽帧后回到源码核对循环体、序列化或锁等待等具体逻辑，做针对性修改，比如缓存重复计算或换成更快的数据结构。每处修改都应能对应火焰图上的一段宽度，说不清收益来源的改动宁可不做，避免凭感觉乱优化。', '每处修改对应宽度', {
        title: 'Python：按热点替换重复计算',
        language: 'Python',
        code: `def build_lookup(rows):
    lookup = {row["sku"]: row for row in rows}
    def get(sku):
        return lookup.get(sku)
    return get

rows = [{"sku": f"SKU-{i}", "price": i} for i in range(10000)]
get = build_lookup(rows)
print(get("SKU-9999"))

# 旧实现每次 get 都线性扫描 rows：
# def get(sku):
#     return next((row for row in rows if row["sku"] == sku), None)`,
        output: `{'sku': 'SKU-9999', 'price': 9999}

旧热点宽度来自每个 SKU 的线性扫描。
预建字典把单次查找从 O(n) 降为平均 O(1)。`,
      }],
      ['修复后验证闭环', '优化不是改完即止：重跑同一负载的剖析与火焰图，对比热点宽度与总耗时是否真的收窄，再用功能测试确认行为未变。把前后数据写进记录，形成基线、剖析、优化、回归的闭环，这一次的证据同时也是下一次优化的起点。', '重测对比才算完成', {
        title: 'PowerShell：性能修复前后同负载复测',
        language: 'PowerShell',
        code: `uv run pytest tests/orders -q
k6 run --summary-export before.json perf/order-list.js
git switch feature/lookup-index
uv run pytest tests/orders -q
k6 run --summary-export after.json perf/order-list.js
$before = Get-Content before.json | ConvertFrom-Json
$after = Get-Content after.json | ConvertFrom-Json
[pscustomobject]@{
  P99Before=$before.metrics.http_req_duration.values.'p(99)'
  P99After=$after.metrics.http_req_duration.values.'p(99)'
  Errors=$after.metrics.http_req_failed.values.rate
} | Format-List
py-spy record --pid 4242 --duration 30 -o after.svg`,
        output: `P99Before 1840ms
P99After   420ms
Errors     0.002
after.svg parse_json width 4%

同一数据集、负载和机器下 P99 下降 77%。
功能测试、错误率与火焰图全部通过，优化闭环成立。`,
      }],
    ],
  },
  {
    name: pyP6Name('Uvicorn/Gunicorn、worker 和优雅停机'),
    track,
    minutes: 38,
    prerequisite: '学员已能用 Uvicorn 或 Gunicorn 启动一个基础 Web 服务，并理解进程与端口监听的关系。',
    goal: '能说明 ASGI/WSGI worker 模型与 worker 数的配比原则，配置 SIGTERM 下的优雅停机与在途请求排空，并让健康检查配合滚动发布平滑完成。',
    guidedPractice: '本地起 Gunicorn 加 Uvicorn worker 的服务，调整 worker 数做压测对比吞吐与内存，再用 kill -TERM 触发停机，观察日志确认在途请求全部处理完成。',
    independentPractice: '给服务加上 /healthz 就绪探针，模拟一次滚动发布过程，记录新旧实例交替期间的失败请求数，并优化到接近零。',
    commonErrors: ['按 CPU 核数堆满 worker 却在 IO 密集场景浪费内存，配比没有结合任务类型。', '直接 kill -9 杀进程导致在途请求被切断，客户端收到大量连接中断错误。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'CPython source. https://github.com/python/cpython'],
    steps: [
      ['worker 模型与分工', 'Uvicorn 是 ASGI 服务器，支持异步请求处理；Gunicorn 作为进程管理器可拉起多个 Uvicorn worker，兼得进程隔离与异步吞吐。Gunicorn 负责监听端口、fork worker 与重启崩溃的子进程，worker 专心处理请求，职责分层清晰。', '进程管理与请求分离', {
        title: 'Gunicorn + UvicornWorker：启动与进程树',
        language: 'PowerShell',
        code: `uv add gunicorn uvicorn
uv run gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 4 --bind 0.0.0.0:8000 --access-logfile - --error-logfile -
Get-CimInstance Win32_Process | Where-Object CommandLine -like "*gunicorn*" | Select-Object ProcessId, ParentProcessId, CommandLine
curl.exe -s http://127.0.0.1:8000/healthz
Get-Process python | Select-Object Id, WorkingSet64, CPU`,
        output: `Starting gunicorn 23.0
Listening at http://0.0.0.0:8000
Booting worker with pid 4101
Booting worker with pid 4102
Booting worker with pid 4103
Booting worker with pid 4104
{"status":"ok"}

master 监听并管理四个 worker。
每个 worker 是独立 CPython 进程，崩溃后由 master 重启。`,
      }],
      ['worker 数怎么定', 'CPU 密集服务的 worker 数接近核数即可，IO 密集或异步服务可放大数倍，因为等待期不占 CPU。经验公式只能当起点，真正配比要靠压测在目标机器上扫描不同 worker 数的吞吐与延迟曲线。内存同样是约束，每个 worker 都是一份独立解释器。', '压测扫描定配比', {
        title: 'k6 + cgroup：扫描 worker 配比',
        language: 'PowerShell',
        code: `foreach ($workers in 2, 4, 8) {
  docker run -d --name api --cpus 2 --memory 1g -e WORKERS=$workers orders-api
  Start-Sleep -Seconds 5
  k6 run --summary-export "workers-$workers.json" perf/orders.js
  docker stats --no-stream api | Tee-Object -Append workers.csv
  docker rm -f api
}
Get-ChildItem workers-*.json | ForEach-Object {
  $m = (Get-Content $_.FullName | ConvertFrom-Json).metrics
  [pscustomobject]@{File=$_.Name;P99=$m.http_req_duration.values.'p(99)';RPS=$m.http_reqs.values.rate}
} | Format-Table -AutoSize`,
        output: `workers-2.json P99=380ms RPS=180
workers-4.json P99=220ms RPS=310
workers-8.json P99=410ms RPS=315
memory: worker2=320MB, worker4=510MB, worker8=910MB

4 worker 是吞吐拐点，8 worker 只增加内存与争用。
内存限制 1g 时 8 worker 已接近 OOM 风险。`,
      }],
      ['SIGTERM 优雅停机', '容器滚动更新时编排系统发送 SIGTERM，服务器收到后停止接收新连接，但继续处理已在途的请求直到排空，超过宽限期才强制退出。Uvicorn 和 Gunicorn 都内置该流程。注意排空窗口必须小于编排方的终止宽限期，否则仍会被强行杀掉。', '先停接入再排空', {
        title: 'Gunicorn：SIGTERM 排空在途请求',
        language: 'PowerShell',
        code: `$master = (Get-CimInstance Win32_Process | Where-Object CommandLine -like "*gunicorn*" | Select-Object -First 1).ProcessId
$slow = Start-Job { curl.exe -s --max-time 20 http://127.0.0.1:8000/slow }
Start-Sleep -Milliseconds 500
Stop-Process -Id $master -Force:$false -ErrorAction Stop
Wait-Job $slow | Receive-Job
Get-Content gunicorn.log -Tail 30
Get-Process python -ErrorAction SilentlyContinue`,
        output: `Handling signal: term
Shutting down: Master
Booting worker with pid ... already shutting down
/slow completed status=200 duration=4.9s
Worker exiting

SIGTERM 后 master 停止接新连接并通知 worker 排空。
在途 4.9 秒请求完成，宽限期 10 秒内进程正常退出。`,
      }],
      ['健康检查探针', '就绪探针在实例完成启动、可接受流量后才返回成功，存活探针判断进程是否僵死并触发重启。发布系统依据探针状态决定是否把流量切到新实例。探针路径应保持轻量，避免查库等重操作把检查本身变成新的瓶颈。', '探针决定流量切换', {
        title: 'FastAPI + Kubernetes：轻量探针',
        language: 'Python',
        code: `from fastapi import FastAPI, Response

app = FastAPI()
ready = {"value": False}

@app.on_event("startup")
async def startup():
    await warm_up_local_resources()
    ready["value"] = True

@app.get("/healthz/live")
def live():
    return {"status": "alive"}

@app.get("/healthz/ready")
def readiness(response: Response):
    if not ready["value"]:
        response.status_code = 503
        return {"status": "starting"}
    return {"status": "ready"}`,
        output: `GET /healthz/live -> 200 {"status":"alive"}
GET /healthz/ready before warmup -> 503
GET /healthz/ready after warmup -> 200

liveness 只检查进程响应。
readiness 在本地预热完成前阻止流量接入，不查远程数据库。`,
      }],
      ['滚动发布配合', '优雅停机加上就绪探针才构成完整的滚动发布：新实例探针通过后接入流量，旧实例收到 SIGTERM 排空在途请求再退出，全程零中断或接近零中断。演练时观察发布期间的错误率与 5xx 曲线，把失败请求压到接近零才算达标。', '排空加探针零中断', {
        title: 'Kubernetes：观察滚动发布错误率',
        language: 'PowerShell',
        code: `kubectl set image deployment/orders api=registry.example/orders@sha256:new
kubectl rollout status deployment/orders --timeout=180s
kubectl get pods -l app=orders -w
$query = 'sum(rate(http_requests_total{job="orders",status=~"5.."}[1m])) / sum(rate(http_requests_total{job="orders"}[1m]))'
Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=$([uri]::EscapeDataString($query))" |
  Select-Object -ExpandProperty data |
  Select-Object -ExpandProperty result
kubectl get events --sort-by=.lastTimestamp | Select-Object -Last 10`,
        output: `deployment "orders" successfully rolled out
new pods ready before old pods removed
5xx ratio during rollout: 0.0003
old pods terminated after 7s preStop + request drain

新实例 Ready 后才进入 Endpoints。
旧实例摘流并排空，滚动窗口错误率接近零。`,
      }],
    ],
  },
  {
    name: pyP6Name('Python 企业服务毕业项目与运行手册'),
    track,
    minutes: 38,
    prerequisite: '学员已完成本阶段前五门课时，能独立完成剖析、优化与优雅停机配置的单项操作。',
    goal: '综合运用本阶段能力，对一份真实服务完成基线测量、剖析、优化与回归的完整闭环，执行性能预算约束下的发布与回滚演练，交付可值班的运行手册与监控告警。',
    guidedPractice: '为毕业项目录制优化前的基线报告，跑通一次完整的发布与回滚演练，产出包含指标阈值、告警规则与操作步骤的运行手册文档。',
    independentPractice: '独立完成一轮剖析驱动的小优化，用回归测试与性能复测证明收益，把过程记录补进运行手册的排障章节。',
    commonErrors: ['只交付优化后的代码不留基线数据与复测记录，性能收益无法向团队证明。', '运行手册只写正常路径，缺少回滚步骤与告警阈值，线上出事时无从下手。'],
    sourceRefs: ['Python Documentation. https://docs.python.org/3/', 'py-spy. https://github.com/benfred/py-spy'],
    steps: [
      ['基线数据先行', '动手优化前先录制基线：固定负载、固定机器，记录延迟分位、吞吐与内存占用，存档剖析数据与火焰图。没有基线，后续任何改动都无法判断是真提升还是噪声波动。基线数据同时构成性能预算的起点与发布门槛。', '没有基线不谈优化', {
        title: 'PowerShell：录制毕业项目基线',
        language: 'PowerShell',
        code: `$commit = git rev-parse --short HEAD
$image = "registry.example/orders@sha256:4b91"
k6 run --summary-export baseline.json --out json=baseline.ndjson perf/orders.js
py-spy record --pid $pid --duration 60 --format raw -o baseline.folded
py-spy record --pid $pid --duration 60 --format flamegraph -o baseline.svg
curl.exe -s http://127.0.0.1:8000/metrics > baseline.prom
@"
commit=$commit
image=$image
workers=4
load=200-vus-10m
p99=$(Get-Content baseline.json | ConvertFrom-Json).metrics.http_req_duration.values.'p(99)'
"@ | Tee-Object baseline.txt`,
        output: `commit=1e3f3f5
image=sha256:4b91
workers=4
load=200-vus-10m
p99=840

基线绑定提交、镜像、worker 和固定负载。
rate、内存、火焰图与 Prometheus 快照一起归档。`,
      }],
      ['剖析定位优化回归', '按 py-spy 与 cProfile 的结论锁定热点，做小步修改，每步用同一负载复测并跑回归测试确认功能未变。闭环里最容易被跳过的是回归环节：优化破坏行为的案例远比想象多，测试通过才算这一轮优化结束。', '小步修改带回归验证', {
        title: 'Python：小步优化与回归测试',
        language: 'Python',
        code: `def build_index(rows):
    return {row["order_id"]: row for row in rows}

def query_with_index(index, order_id):
    return index.get(order_id)

rows = [{"order_id": f"O-{i}", "status": "PAID"} for i in range(10000)]
index = build_index(rows)
print(query_with_index(index, "O-9999"))

# 基线：每次 linear_search 扫描 10000 行
# 优化：启动时构建一次索引
# 回归：同一 order_id 结果一致，空 ID 返回 None`,
        output: `{'order_id': 'O-9999', 'status': 'PAID'}

单次查询从线性扫描改为字典查找。
回归覆盖存在、缺失和重复 ID，行为与旧实现一致。`,
      }],
      ['性能预算守门', '把延迟分位、内存上限、错误率写成明确的预算数值，放进发布检查流程：超出预算的版本不允许上线，预算调整需要评审并留痕。预算把性能从主观感受变成可执行的门禁，也让团队在排期压力下有拒绝劣化的依据。', '预算是发布门禁', {
        title: 'YAML：性能预算门禁',
        language: 'YAML',
        code: `performance_budget:
  p95_ms: 300
  p99_ms: 800
  error_rate: 0.005
  worker_rss_mb: 700
  first_event_ms: 500
release_gate:
  compare_against: baseline.json
  fail_if:
    p99_ms: "> 800"
    p99_regression_percent: "> 15"
    error_rate: "> 0.005"
    rss_mb: "> 700"
  approval_required_for_budget_change: true
  evidence:
    - k6-summary.json
    - prometheus-snapshot.txt
    - flamegraph.svg`,
        output: `candidate p99=740ms PASS
candidate error=0.003 PASS
worker rss=612MB PASS
regression vs baseline=+9% PASS

所有预算通过后发布任务继续。
若 p99 超 800ms 或相对基线劣化 15%，构建失败并保留证据。`,
      }],
      ['发布与回滚演练', '上线流程要包含真实的回滚演练：发一版带已知问题的构建，触发回滚，记录从发现问题到旧版本恢复服务的时间与每一步操作。没有演练过的回滚预案等于没有预案，演练产物直接整理进运行手册的应急章节。', '回滚要真演练过', {
        title: 'Kubernetes：缺陷版本回滚演练',
        language: 'PowerShell',
        code: `$bad = "registry.example/orders@sha256:bad91"
$good = "registry.example/orders@sha256:4b91"
kubectl set image deployment/orders api=$bad
kubectl rollout status deployment/orders --timeout=120s
$started = Get-Date
$error = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_error_ratio").data.result[0].value[1]
kubectl rollout undo deployment/orders
kubectl rollout status deployment/orders --timeout=120s
$recovered = Get-Date
$after = (Invoke-RestMethod "http://prometheus:9090/api/v1/query?query=orders_error_ratio").data.result[0].value[1]
[pscustomobject]@{BadImage=$bad;GoodImage=$good;ErrorBefore=$error;ErrorAfter=$after;RecoverySeconds=($recovered-$started).TotalSeconds} | Tee-Object rollback-drill.txt`,
        output: `ErrorBefore=0.183
deployment "orders" rolled back
ErrorAfter=0.002
RecoverySeconds=38

带缺陷版本产生 18.3% 错误，38 秒内恢复旧版本。
操作命令、指标和耗时写入运行手册应急章节。`,
      }],
      ['运行手册与告警交付', '毕业交付不止代码：运行手册要覆盖启动参数、worker 配比、优雅停机窗口、健康检查路径、常见告警的排查动作与升级路径，监控告警要给出指标、阈值与通知渠道。新人照手册能独立值班，才算达到企业交付标准。', '手册齐备才算交付', {
        title: 'Markdown：Python 服务运行手册',
        language: 'Markdown',
        code: `# Orders Python Service Runbook

## Start
- Image: registry.example/orders@sha256:4b91
- Command: gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4
- Ports: 8000 app, 9090 metrics

## Health
- Liveness: GET /healthz/live
- Readiness: GET /healthz/ready
- Metrics: GET /metrics

## Alerts
- OrdersP99High: p99 > 800ms for 10m
  Check: rollout history, DB pool waiting, py-spy dump
- OrdersErrorBudgetFastBurn: 5m error > 2%
  Action: stop canary, inspect trace, rollback digest

## Shutdown
- preStop 8s, SIGTERM drain 20s, grace 40s
- Confirm active requests -> 0 before exit

## Rollback
- kubectl rollout undo deployment/orders
- Verify readiness, p99, error ratio and outbox lag`,
        output: `new on-call can start service, query health and metrics
alert links name next diagnostic and rollback command
shutdown timeline fits within Kubernetes grace period

启动、探针、预算、告警、排空和回滚都有可执行命令。
新人照手册完成一次值班演练后才算交付。`,
      }],
    ],
  },
];

