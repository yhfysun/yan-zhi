// Go 云原生后端 · 手写教案（接力看板 GO-G*，docs/编程课程教案重写进度-2026-11-21.md）
// 每门课的 name 必须与 programs.ts 模板生成的 `Go · ${stage.title}：${topic}` 完全一致，
// 才能在 catalog.ts 的 spread 末尾覆盖同名模板课。正文写真实机制/命令/边界，禁止模板话术。
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';

// ── G0 Go 工具链、模块与第一个服务 ─────────────────────────────────────────────
const goG0Stage = 'Go 工具链、模块与第一个服务';
const goG0Name = (topic: string) => `Go · ${goG0Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG0Name('Go toolchain、GOPATH 与 module'),
    track,
    minutes: 38,
    prerequisite: '学员已在终端安装 Go 并用 go version 确认工具链可用。',
    goal: '理解 Go 从 GOPATH 到 module 的演进动因，掌握 go.mod 声明模块路径与 go 版本的方式，能说明 module path 如何决定导入路径前缀、go.sum 如何校验依赖完整性。',
    guidedPractice: '现场执行 go mod init demo/mymod，逐行讲解 go.mod 里 module 与 go 指令的含义；随后在源码里 import 一个新依赖，运行 go mod tidy 观察 go.mod 与 go.sum 同时落盘，把两份文件内容抄进笔记。',
    independentPractice: '独立完成：新建带 util 子目录的模块，在根包通过模块路径前缀导入子包并运行成功；再手动删除 go.sum 后执行 go mod tidy，确认它按 go.mod 重新生成校验数据。',
    commonErrors: ['把模块根目录的磁盘名当成导入路径，import 语句写成本地相对目录导致编译器找不到包。', '手动编辑 go.sum 增删哈希条目，结果校验失败反而把依赖解析彻底锁死。'],
    sourceRefs: ['Go Documentation. https://go.dev/doc/', 'Go Modules Reference. https://go.dev/ref/mod'],
    steps: [
      ['GOPATH 旧世界', 'module 出现前，所有代码必须放在 $GOPATH/src 之下，导入路径就是相对该目录的相对路径，想引用 github.com/user/repo 就得真的克隆到那个位置。go get 只拉默认分支最新提交，没有版本锁定，两个项目要同一库的不同版本只能来回切换，这正是 module 要解决的核心痛点。', '一切代码进 src', {
        title: 'Go：初始化模块并查看环境',
        language: 'PowerShell',
        code: `go version
go env GOPATH GOMODCACHE GOCACHE
go mod init demo/orders
Get-Content go.mod
go list -m
go env GOMOD`,
        output: `go version go1.23.4 windows/amd64
C:\\Users\\dev\\go
C:\\Users\\dev\\go\\pkg\\mod
demo/orders
module demo/orders

go 1.23.4

模块路径 demo/orders 与磁盘目录名无关。
GOMOD 指向当前模块的 go.mod，依赖缓存位于 GOMODCACHE。`,
      }],
      ['go.mod 两行声明', 'go mod init 模块路径 生成 go.mod：module 行声明模块身份，go 行声明该模块使用的语言版本，它决定哪些语言特性可用，例如泛型要求 1.18 及以上。这两行是模块的身份证与方言开关，文件必须位于模块根目录，位置移动会破坏整棵依赖树解析。', '两行定模块身份', {
        title: 'go.mod：声明模块与语言版本',
        language: 'Go',
        code: `module github.com/acme/orders

go 1.23

require github.com/google/uuid v1.6.0

// go 行决定可用语言特性与 go 命令兼容行为。
// require 只声明直接依赖版本下限。`,
        output: `go mod tidy
go list -m -json github.com/google/uuid
{
  "Path": "github.com/google/uuid",
  "Version": "v1.6.0",
  "GoVersion": "1.19"
}

module 行定义导入路径前缀。
go 行启用当前模块的语言与工具链行为。`,
      }],
      ['模块路径即导入前缀', '模块内每个子目录包的导入路径，等于模块路径拼接子目录名，不需要额外配置。模块路径通常取仓库地址如 github.com/user/repo，别人才能按路径定位并 go get；本地实验可用任意不冲突的名字，只要模块内部自洽即可，磁盘目录名与模块名没有强绑定。', '导入路径随模块', {
        title: 'Go：按模块路径导入子包',
        language: 'Go',
        code: `package main

import (
    "fmt"
    "github.com/acme/orders/internal/money"
)

func main() {
    total := money.New(1999, "CNY")
    fmt.Println(total.String())
}`,
        output: `go run .
CNY 19.99
go list -f '{{.ImportPath}}' ./internal/money
github.com/acme/orders/internal/money

导入路径由 module 路径加目录 internal/money 组成。
把磁盘目录改名不会改变模块内导入路径，除非目录本身变化。`,
      }],
      ['go.sum 记哈希', 'go.sum 逐条记录每个依赖模块特定版本的哈希，以及其 go.mod 文件的哈希。下载依赖时工具链用这些哈希比对实际内容，不一致立即报校验错误，防止镜像被篡改或同名版本内容漂移；首次遇到新模块时还会向 sum.golang.org 校验数据库求证来源。', '哈希锁死依赖', {
        title: 'Go：观察 go.sum 校验条目',
        language: 'PowerShell',
        code: `go get github.com/google/uuid@v1.6.0
Select-String go.sum -Pattern "google/uuid"
go mod verify
$env:GONOSUMDB="github.com/google/uuid"
go clean -modcache
go mod download
go mod verify`,
        output: `github.com/google/uuid v1.6.0 h1:NIvaJDMOsjHA8n1jAhLSgzrAzy1Hgr+hNrb57e+94F0=
github.com/google/uuid v1.6.0/go.mod h1:TIyPZe4MgqvfeYDBFedMoGGpEw/LqOeaOT+nhxU+yHo=
all modules verified

go.sum 同时记录模块内容和 go.mod 哈希。
下载内容不匹配时 go mod verify 失败并拒绝构建。`,
      }],
      ['go mod tidy', 'go mod tidy 扫描全部源码里的 import，把缺失的依赖按语义化版本补进 go.mod 并下载，同时删掉代码中已不再引用的条目。它只改声明文件与 go.sum，不动任何源码；提交前先 tidy 一遍，能保证协作者拉到与声明一致的依赖集合。', 'tidy 对齐声明', {
        title: 'PowerShell：tidy 清理未使用依赖',
        language: 'PowerShell',
        code: `go get github.com/google/uuid@v1.6.0
go mod tidy
Get-Content go.mod
Select-String go.sum -Pattern "google/uuid"
Remove-Item go.sum
go mod tidy
go mod verify
git diff --stat go.mod go.sum`,
        output: `go.mod contains require github.com/google/uuid v1.6.0
go.sum generated with two uuid hashes
all modules verified
go.mod | 3 +++
go.sum | 2 ++

tidy 根据实际 import 保留依赖并重建 go.sum。
提交前 tidy 后再 go mod verify，声明与缓存一致。`,
      }],
    ],
  },
  {
    name: goG0Name('变量、类型、常量与控制流'),
    track,
    minutes: 40,
    prerequisite: '学员已了解任意一门语言的变量赋值与 if、循环等基本语法。',
    goal: '掌握短变量声明的类型推断规则与零值语义，会用 const 与 iota 定义常量组，能写出带初始化语句的 if 与三种形态的 for，理解 Go 只保留一种循环关键字的取舍。',
    guidedPractice: '在同一个 main.go 里依次实验：var 声明后打印各类型零值、用 := 观察推断结果、写含 iota 的星期常量组、复现 if 初始化变量的作用域边界，把每段输出与报错逐条抄进笔记。',
    independentPractice: '独立完成：写一个用 for range 遍历切片求最大值的程序，要求用 if 初始化语句处理一次可能出错的函数返回，并给每种基础类型各声明一个未赋值变量、打印其零值做成对照表。',
    commonErrors: ['在 if 外继续使用 if 初始化语句里声明的变量，编译器报 undefined，因为作用域随分支结束。', '以为未赋值变量里是随机垃圾数据，实际 Go 每个类型都有确定零值，排查思路完全不同。'],
    sourceRefs: ['Go Documentation. https://go.dev/doc/', 'Effective Go. https://go.dev/doc/effective_go'],
    steps: [
      ['短声明与推断', 'x := expr 只能在函数内部使用，编译器按右侧表达式推断类型：整数字面量推成 int，含小数推成 float64。左侧必须至少有一个新变量，同一作用域重复声明同名变量会编译报错；包级变量不能用 :=，必须用 var 带类型或带初始值声明。', '类型由右侧推出', {
        title: 'Go：短声明与类型推断',
        language: 'Go',
        code: `package main

import "fmt"

var packageLevel = 10

func main() {
    count := 3
    price := 19.9
    name := "order"
    var total int
    fmt.Printf("%T %T %T %T\\n", count, price, name, total)
    count = 4
    fmt.Println(packageLevel, count)
}`,
        output: `int float64 string int
10 4

短声明在函数内推断类型。
包级变量必须用 var，未赋值的 total 是 int 零值 0。`,
      }],
      ['零值确定', 'Go 不存在未初始化的随机状态：数值类型零值为 0，字符串为空串，布尔为 false，指针、切片、map、通道与接口都是 nil，结构体零值等于每个字段取各自零值。变量声明后可直接参与运算，这是刻意设计；代价是编译器强制检查声明未使用并直接报错。', '未赋值也有值', {
        title: 'Go：打印各类型零值',
        language: 'Go',
        code: `package main

import "fmt"

type Order struct {
    ID string
    Total int
}

func main() {
    var number int
    var text string
    var ok bool
    var rows []string
    var index map[string]int
    var order Order
    fmt.Printf("%d %q %t %v %v %+v\\n", number, text, ok, rows, index, order)
    fmt.Println(rows == nil, index == nil)
}`,
        output: `0 "" false [] map[] {ID: Total:0}
true true

数值、字符串、布尔和结构体取明确零值。
切片与 map nil，打印为空形态，比较时等于 nil。`,
      }],
      ['常量与 iota', 'const 定义编译期常量，值在编译阶段确定且不可变，无法取地址也不能是运行期结果。在同一个 const 块中，iota 从 0 起按行递增，每行自动复用上一行的表达式，配合左移可生成权限标志位；常量默认无类型，未指定类型时可按上下文隐式转换成所需整数类型。', 'iota 按行递增', {
        title: 'Go：iota 生成状态与权限位',
        language: 'Go',
        code: `package main

import "fmt"

const (
    Created = iota
    Paid
    Shipped
)

type Permission uint8
const (
    Read Permission = 1 << iota
    Write
    Delete
)

func main() {
    fmt.Println(Created, Paid, Shipped)
    fmt.Println(Read, Write, Delete, Read|Write)
}`,
        output: `0 1 2
1 2 4 3

iota 在每个 const 行递增。
位移表达式生成互不重叠的权限位，按位或组合读写。`,
      }],
      ['if 带初始化', 'if 可以在条件前放一条简单语句，惯用形式是 if v, err := f(); err != nil。这样声明的变量只在整条 if 及其 else 分支里可见，分支结束后销毁，避免 err 泄漏污染外层作用域；若外层还要继续使用 err，就必须先 var 声明再赋值，不能走这种简写。', '变量限定分支内', {
        title: 'Go：if 初始化变量作用域',
        language: 'Go',
        code: `package main

import (
    "errors"
    "fmt"
)

func load() (int, error) { return 0, errors.New("db down") }

func main() {
    if value, err := load(); err != nil {
        fmt.Println("failed", err)
    } else {
        fmt.Println("value", value)
    }
    // fmt.Println(value, err) // undefined
    var value int
    var err error
    value, err = load()
    fmt.Println("outer", value, err)
}`,
        output: `failed db down
outer 0 db down

value 与 err 只在 if/else 分支内可见。
分支外复用需要先 var 声明再赋值。`,
      }],
      ['for 一统循环', 'Go 只有 for 一个循环关键字：for i := 0; i < n; i++ 是经典三段式，只写条件等价于其他语言的 while，条件也省掉就是死循环，靠 break 或 return 退出。切片、map、字符串与通道统一用 for range 遍历；没有 while 与 do-while，语法面收窄换来读代码时循环形态唯一。', '唯一关键字三形态', {
        title: 'Go：for 的三种循环形态',
        language: 'Go',
        code: `package main

import "fmt"

func main() {
    for i := 0; i < 3; i++ { fmt.Print(i) }
    n := 3
    for n > 0 { fmt.Print("w", n); n-- }
    for _, value := range []string{"a", "b"} { fmt.Print(value) }
    count := 0
    for { count++; if count == 2 { break } }
    fmt.Println(" done", count)
}`,
        output: `012w3w2w1ab done 2

三段式、条件循环、range 与无限循环都使用 for。
退出依赖条件或 break/return，没有 while 关键字。`,
      }],
    ],
  },
  {
    name: goG0Name('函数、多返回值、defer 和 panic'),
    track,
    minutes: 38,
    prerequisite: '学员已掌握 Go 的变量声明与基本控制流写法。',
    goal: '掌握 (val, err) 多返回值惯用法与错误检查时机，理解 defer 的栈序执行与参数求值时机，能区分 panic 与错误的适用边界，并写出位置正确的 recover。',
    guidedPractice: '现场写一个返回 (int, error) 的除法函数，故意传入零触发错误路径；再在同一函数放三条 defer 打印语句观察逆序输出，并把其中一条的参数写成函数调用，记录求值时机的差异。',
    independentPractice: '独立完成：实现读取文件并统计行数的函数，用 defer 保证 Close 在 return 之后执行，对不存在的路径返回错误而非 panic；再复现 defer 在循环中堆积句柄的问题并用匿名函数包裹修复。',
    commonErrors: ['把 defer 写在循环体里打开多个文件，句柄全部堆积到函数结束才关闭，资源很快耗尽。', '在普通业务代码里用 panic 代替返回错误，调用方无法用 if 判断失败，程序直接崩溃。'],
    sourceRefs: ['Effective Go. https://go.dev/doc/effective_go', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['多返回值惯用法', 'Go 函数可返回多个值，惯用法把结果放前、错误放末，即 (val, err)。调用后第一件事是 if err != nil，确认 err 为 nil 才安全使用结果；这种结构取代了其他语言的异常分支，把失败路径写进函数签名。编译器不强制检查，go vet 与代码评审会盯住遗漏。', '末位错误判 nil', {
        title: 'Go：结果与 error 多返回',
        language: 'Go',
        code: `package main

import (
    "errors"
    "fmt"
)

func divide(a, b int) (int, error) {
    if b == 0 { return 0, errors.New("division by zero") }
    return a / b, nil
}

func main() {
    value, err := divide(10, 2)
    if err != nil { panic(err) }
    fmt.Println(value)
    _, err = divide(10, 0)
    fmt.Println(err)
}`,
        output: `5
division by zero

成功时 error 为 nil，失败时结果无效。
调用方先检查 err 再使用值。`,
      }],
      ['defer 栈序与求值', 'defer 注册的调用在函数返回前按后进先出执行，无论正常 return 还是 panic 都会走到。参数在 defer 语句执行那一刻就求值固定，例如 defer fmt.Println(i) 记下的是当时的 i 值；想拿到最终值就改用 defer func() 闭包读取变量。收尾动作紧贴资源申请处书写，不易遗漏。', '先进后出先求参', {
        title: 'Go：defer 逆序与参数求值',
        language: 'Go',
        code: `package main

import "fmt"

func demo() {
    for i := 0; i < 3; i++ {
        defer fmt.Println("value", i)
    }
    final := 10
    defer func() { fmt.Println("closure", final) }()
    final = 20
}

func main() { demo() }`,
        output: `closure 20
value 2
value 1
value 0

defer 按后进先出执行。
直接参数在注册时固定，闭包读取函数结束时的变量值。`,
      }],
      ['panic 与 recover', 'panic 让当前 goroutine 开始栈展开，逐层向上传播，途中执行每一层已注册的 defer。recover 只有在被 panic 的那条 goroutine 的 defer 函数里直接调用才生效，返回 panic 值并终止展开；在其他位置调用永远得到 nil，跨 goroutine 的 panic 无法在对端拦截。', 'recover 只在 defer', {
        title: 'Go：defer 中 recover',
        language: 'Go',
        code: `package main

import "fmt"

func safe() (err error) {
    defer func() {
        if value := recover(); value != nil {
            err = fmt.Errorf("recovered: %v", value)
        }
    }()
    panic("boom")
}

func main() {
    fmt.Println(safe())
    fmt.Println(recover())
}`,
        output: `recovered: boom
<nil>

defer 函数直接调用 recover 捕获 panic 并转为 error。
普通函数体中 recover 返回 nil，无法拦截。`,
      }],
      ['错误与 panic 边界', '可预期的失败走错误返回：文件不存在、参数非法、网络超时，调用方要用分支逐一处理。panic 留给程序员的 bug，例如数组越界、不可达分支，它表示代码假设被破坏而非业务失败。库不应替调用方 panic，更不能把 panic/recover 当作 if else 的替代品来做流程控制。', '预期失败走错误', {
        title: 'Go：业务失败返回 error',
        language: 'Go',
        code: `package main

import (
    "errors"
    "fmt"
)

var ErrInvalidOrder = errors.New("invalid order")

func validate(quantity int) error {
    if quantity <= 0 { return fmt.Errorf("%w: quantity=%d", ErrInvalidOrder, quantity) }
    return nil
}

func mustConfigure() { panic("programmer error: missing config") }

func main() {
    err := validate(0)
    if errors.Is(err, ErrInvalidOrder) { fmt.Println("reject", err) }
    // mustConfigure() 仅用于不可恢复启动配置错误
}`,
        output: `reject invalid order: quantity=0

输入错误以可判别 error 返回，调用方可提示或重试。
panic 只保留给启动配置缺失等不可继续的程序错误。`,
      }],
      ['循环内 defer 陷阱', 'defer 的作用域是整个函数而非当前代码块，循环里写 defer f.Close() 会把所有关闭动作压到函数结束才执行，几百个文件同时处于打开状态。修复方式是每次迭代用匿名函数包裹：for 内写 func() { defer f.Close(); ... }()，把生命周期缩短到单次迭代。', '包裹一层再延迟', {
        title: 'Go：循环内 defer 生命周期',
        language: 'Go',
        code: `package main

import (
    "fmt"
    "os"
)

func handle(path string) {
    file, err := os.Open(path)
    if err != nil { return }
    defer file.Close()
    fmt.Println("opened", path)
}

func main() {
    for _, path := range []string{"a.txt", "b.txt", "c.txt"} {
        func() {
            file, err := os.Open(path)
            if err != nil { return }
            defer file.Close()
            fmt.Println("iteration", path)
        }()
    }
}`,
        output: `iteration a.txt
iteration b.txt
iteration c.txt

匿名函数每次迭代结束即执行 defer 关闭文件。
若直接在循环中 defer，句柄会堆积到 main 结束。`,
      }],
    ],
  },
  {
    name: goG0Name('包、可见性、目录和内部模块'),
    track,
    minutes: 38,
    prerequisite: '学员已能用 go mod init 建立模块并跑通最简单的 main 程序。',
    goal: '掌握大写导出与小写私有的可见性规则，理解 internal 目录的导入限制机制与循环导入禁止的成因，能区分 package main 与库包在工具链中的不同角色。',
    guidedPractice: '把程序拆成根包加 util 子包：先在 util 里定义小写函数并尝试跨包调用，观察编译报错；再改成大写后通过，然后新建 internal 子包验证外部模块导入被拒，把三次报错原文抄进操作单。',
    independentPractice: '独立完成：设计一个三包结构，人为构造 A 导 B、B 又导 A 的循环并记录编译器报错文本，随后抽出公共类型到第三个包消除循环；再确认 internal 包在本模块内可自由导入。',
    commonErrors: ['以为可见性按目录隔离，实际上同一个包内所有文件共享命名空间，小写标识符照样互相可见。', '在两个包的顶层互相 import 公共类型，触发 import cycle not allowed 的编译错误。'],
    sourceRefs: ['Effective Go. https://go.dev/doc/effective_go', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['大写即导出', '标识符首字母大写即对包外导出，小写则仅包内可见，这条规则同时作用于类型、函数、方法、结构体字段与接口方法，没有任何关键字参与。同一个包内的多个文件共享命名空间，小写名字在这些文件之间照常互访；可见性的边界是包，不是目录也不是文件。', '首字母定可见性', {
        title: 'Go：导出与未导出标识符',
        language: 'Go',
        code: `package money

type Amount struct {
    Value int
    currency string
}

func New(value int) Amount { return Amount{Value: value, currency: "CNY"} }
func (a Amount) Currency() string { return a.currency }

// 包外可访问 Amount 与 New，不能写 money.currency。`,
        output: `go build ./...
go test ./money
ok demo/money 0.003s
package main imports demo/money
amount := money.New(100)
fmt.Println(amount.Value, amount.Currency())
100 CNY

大写 Value、New、Currency 可跨包使用。
小写 currency 只在 money 包内可见。`,
      }],
      ['包是编译单位', '一个目录只能有一个包名，目录下所有 .go 文件同属一个包，一起编译并共享命名空间，包名可与目录名不同但惯例保持一致。每个包可含若干 init 函数，按文件与声明顺序在 main 之前执行，导入方会连带触发被导包的 init；包同时是最小复用单位与编译缓存单位。', '同目录一个包', {
        title: 'Go：包初始化顺序',
        language: 'Go',
        code: `package store

import "fmt"

var ready = initStore()

func initStore() bool {
    fmt.Println("var-init")
    return true
}

func init() {
    fmt.Println("init", ready)
}

package main
import "demo/store"
func main() { fmt.Println("main") }`,
        output: `var-init
init true
main

导入 store 先执行包级变量初始化，再按声明执行 init。
main 最后运行，包初始化只发生一次。`,
      }],
      ['internal 导入限制', 'go 工具链对 internal 目录有硬性约束：位于 internal 之下的包，只能被以该 internal 父目录为根的子树里的代码导入，树外代码导入会直接编译报错。这是编译器强制执行而非风格约定，适合把实现细节锁在模块内部，只把公开 API 暴露在顶层包里。', 'internal 对外封闭', {
        title: 'Go：internal 包导入边界',
        language: 'PowerShell',
        code: `go list ./...
go build ./...
@'
package main
import "github.com/other/project/internal/money"
func main() { _ = money.New(1) }
'@ | Set-Content C:\\temp\\outside\\main.go
Push-Location C:\\temp\\outside
go mod init outside
go build .
Pop-Location`,
        output: `demo/orders
demo/orders/internal/money
within module: build succeeded
outside module:
use of internal package github.com/other/project/internal/money not allowed

本模块子树可以导入 internal/money。
模块外代码被 Go 工具链硬性拒绝。`,
      }],
      ['main 与库包', 'package main 且含 func main 的包是可执行入口，go run 与 go build 对它产出进程或二进制；其余包是库，只能被导入复用，单独 build 只做编译检查不产出文件。main 包不能被别人 import，入口逻辑越薄越好，实际功能都应下沉到库包里，库包才方便写测试。', 'main 可跑库复用', {
        title: 'Go：main 只做装配',
        language: 'Go',
        code: `package main

import (
    "log"
    "net/http"
    "demo/orders"
)

func main() {
    service := orders.NewService(orders.NewMemoryRepo())
    handler := orders.NewHandler(service)
    log.Fatal(http.ListenAndServe(":8080", handler))
}

// orders 是普通库包，可单独测试 Service 与 Handler。`,
        output: `go build -o bin/orders .
ls bin/orders
bin/orders
go test ./orders
ok demo/orders 0.012s

main 只装配依赖和启动 HTTP。
业务逻辑位于 orders 库包，测试不需要启动进程。`,
      }],
      ['循环导入禁止', 'A 导入 B、B 又导入 A 会触发 import cycle not allowed，因为 Go 要求包的依赖图必须无环，编译按拓扑序进行，环会让初始化顺序无法确定。解法是把公共类型下沉到第三个底层包，或用接口把依赖方向反转；报错信息只给出环的位置，拆解结构要自己动手。', '依赖图必须无环', {
        title: 'Go：复现并消除循环导入',
        language: 'PowerShell',
        code: `@'
package a
import "demo/b"
type Order struct{ B b.Order }
'@ | Set-Content a/a.go
@'
package b
import "demo/a"
type Order struct{ A a.Order }
'@ | Set-Content b/b.go
go build ./...
go list -deps ./a`,
        output: `package demo/a
    imports demo/b
    imports demo/a: import cycle not allowed

go list -deps also reports the dependency cycle.
move shared types to demo/model and both packages import model.`,
      }],
    ],
  },
  {
    name: goG0Name('go run、go build、go install'),
    track,
    minutes: 40,
    prerequisite: '学员已能编写含 main 包的 Go 程序并理解模块的基本结构。',
    goal: '区分 go run、go build、go install 三者的产物去向与缓存行为，理解构建缓存的命中条件，掌握 GOBIN 与模块缓存的位置，并能用 GOOS/GOARCH 完成跨平台交叉编译。',
    guidedPractice: '对同一个 main 包依次执行三条命令，分别观察系统临时目录、当前目录与 GOBIN 中出现的产物；再连续执行两次 go build 对比第二次耗时，把三处产物路径与耗时差抄进记录表。',
    independentPractice: '独立完成：用 GOOS=windows GOARCH=amd64 交叉编译出 exe 并实际运行验证，再用 GOOS=darwin GOARCH=arm64 产出 mac 版本；删除构建缓存后重跑 go build，记录重新编译的耗时差。',
    commonErrors: ['在库包目录上执行 go install 却找不到二进制，因为 install 只对 main 包生成可执行文件。', '交叉编译时忘了设 CGO_ENABLED=0，默认启用 CGO 后找不到目标平台的 C 工具链而失败。'],
    sourceRefs: ['Go Documentation. https://go.dev/doc/', 'Effective Go. https://go.dev/doc/effective_go'],
    steps: [
      ['go run 先建后跑', 'go run 把编译产物写进系统临时目录后立即执行，进程结束后由系统清理，工作目录里不留任何文件。它适合脚本式试验与快速验证，每次源码变化都会重新编译；反复调试同一段代码时，用 go run 最省事，但启动速度比预编译后的二进制慢。', '产物进临时目录', {
        title: 'go run：临时构建并执行',
        language: 'PowerShell',
        code: `go run . -name Ada
Get-ChildItem . | Select-Object Name
go env GOTMPDIR
$env:GOTMPDIR = Join-Path $env:TEMP "go-run"
New-Item -ItemType Directory $env:GOTMPDIR -Force | Out-Null
go run .
Get-ChildItem $env:GOTMPDIR -ErrorAction SilentlyContinue`,
        output: `hello Ada
main.go go.mod go.sum
hello world

工作目录没有生成可执行文件。
go run 产物进入系统临时构建位置，执行后由工具链清理。`,
      }],
      ['go build 产物', '对 main 包执行 go build，会在当前目录生成以模块或目录命名的可执行文件，可用 -o 指定输出路径；对库包执行则只做类型检查并填充缓存，不产出任何文件。编译结果按输入哈希存入 GOCACHE，相同输入的重复构建直接命中，第二次几乎瞬时完成。', '库包无文件仅验型', {
        title: 'go build：输出二进制与库检查',
        language: 'PowerShell',
        code: `go build -o bin\\orders.exe .
Get-Item bin\\orders.exe | Select-Object Name, Length, LastWriteTime
.\\bin\\orders.exe
New-Item -ItemType Directory lib | Out-Null
@'
package lib
func Add(a, b int) int { return a + b }
'@ | Set-Content lib\\lib.go
go build ./lib
Get-ChildItem .\\lib`,
        output: `orders.exe 2478080
hello world
lib\\lib.go

main 包写出指定二进制并成功运行。
库包 build 只验证编译并填充缓存，不产出文件。`,
      }],
      ['go install 与 GOBIN', 'go install 编译后把 main 包的可执行文件安装到 GOBIN，未设置时落入 GOPATH 下的 go/bin，库包则只更新模块缓存里的构建产物。把 go/bin 加入 PATH 后，安装的命令行工具可在任意目录直接调用；模块时代还支持带 @版本 后缀安装，不动当前模块即可装工具。', '二进制落进 GOBIN', {
        title: 'go install：安装命令行工具',
        language: 'PowerShell',
        code: `$env:GOBIN = Join-Path $env:USERPROFILE "bin"
go install .
Get-ChildItem $env:GOBIN
$env:PATH = "$env:GOBIN;$env:PATH"
orders -name Ada
go install golang.org/x/tools/cmd/stringer@v0.28.0
stringer -help | Select-Object -First 3`,
        output: `orders.exe
hello Ada
stringer.exe
Usage of stringer:
  -type string

当前模块 main 安装到 GOBIN。
带 @版本 的工具安装不会修改当前项目 go.mod。`,
      }],
      ['构建缓存 GOCACHE', 'GOCACHE 默认在用户缓存目录下，以源码内容、编译器版本、构建标志等全部输入的哈希为键存储编译结果，任何一项不变就命中缓存跳过重编。go clean -cache 可整体清空，缓存损坏时由工具链自动重建；删掉它只会变慢不会出错，也不应提交进版本库。', '按输入哈希命中', {
        title: 'PowerShell：测量构建缓存命中',
        language: 'PowerShell',
        code: `go env GOCACHE
go clean -cache
Measure-Command { go build -o bin\\cold.exe . } | Select-Object TotalMilliseconds
Measure-Command { go build -o bin\\warm.exe . } | Select-Object TotalMilliseconds
go clean -cache
Measure-Command { go build -o bin\\cold2.exe . } | Select-Object TotalMilliseconds
Get-ChildItem bin | Select-Object Name, Length`,
        output: `C:\\Users\\dev\\AppData\\Local\\go-build
cold 842ms
warm 121ms
cold2 807ms

相同源码、工具链和 flags 命中缓存，第二次显著更快。
清空缓存只会重编，不会改变二进制行为。`,
      }],
      ['交叉编译', '设置 GOOS 与 GOARCH 两个环境变量即可面向其他平台编译，例如 GOOS=windows GOARCH=amd64 go build 产出 exe，全程无需目标机器参与。纯 Go 代码配合 CGO_ENABLED=0 得到静态二进制，拷贝即用；CI 里发布多平台产物就靠这一对变量逐组合遍历。', '两个变量换平台', {
        title: 'PowerShell：交叉编译多平台',
        language: 'PowerShell',
        code: `$env:CGO_ENABLED = "0"
$env:GOOS = "linux"; $env:GOARCH = "amd64"
go build -trimpath -o dist\\orders-linux-amd64 .
$env:GOOS = "windows"; $env:GOARCH = "amd64"
go build -trimpath -o dist\\orders-windows-amd64.exe .
$env:GOOS = "darwin"; $env:GOARCH = "arm64"
go build -trimpath -o dist\\orders-darwin-arm64 .
Get-ChildItem dist | Select-Object Name, Length
go version -m dist\\orders-linux-amd64`,
        output: `orders-darwin-arm64  2412448
orders-linux-amd64   2381920
orders-windows-amd64.exe 2457600
build GOOS=linux GOARCH=amd64 CGO_ENABLED=0

同一源码生成三个平台二进制。
CGO_ENABLED=0 让纯 Go 产物无需目标平台 C 库。`,
      }],
    ],
  },
  {
    name: goG0Name('第一组 go test 与基准'),
    track,
    minutes: 38,
    prerequisite: '学员已能编写函数与多返回值错误处理，并熟悉命令行编译运行流程。',
    goal: '掌握 _test.go 文件约定与 TestXxx 函数签名，会用 *testing.T 的错误报告方法组织表驱动测试，能读懂 go test -bench 输出中的 ns/op 指标并用它指导优化决策。',
    guidedPractice: '为字符串处理函数写一组表驱动测试，覆盖正常、空串与超界三种情形，故意写错一个期望值观察失败报告；再为同一函数写基准，执行 go test -bench . -benchmem，把报告逐字段抄进笔记并解释含义。',
    independentPractice: '独立完成：给上个课时实现的除法函数补齐表驱动测试与基准，用 -run=^$ 只跑基准，改动一版实现后以 -count=5 重测对比 ns/op，把前后两组数据整理成简短对比结论。',
    commonErrors: ['测试文件名漏掉 _test.go 后缀或函数名不以大写 Test 开头，go test 找不到任何用例。', '在基准循环里做初始化却忘了 b.ResetTimer，把准备工作耗时算进了每次操作的 ns/op。'],
    sourceRefs: ['Go Testing Documentation. https://pkg.go.dev/testing', 'Effective Go. https://go.dev/doc/effective_go'],
    steps: [
      ['_test.go 约定', '测试文件与被测代码放在同一目录同一包中，文件名以 _test.go 结尾；go build 会完全忽略它们，只有 go test 才编译并执行。测试函数签名固定为 func TestXxx(t *testing.T)，名字中 Xxx 部分首字母必须大写，否则不会被识别为用例。', '测试随包同目录', {
        title: 'Go：最小测试文件约定',
        language: 'Go',
        code: `package money

import "testing"

func Add(a, b int) int { return a + b }

func TestAdd(t *testing.T) {
    if got := Add(2, 3); got != 5 {
        t.Fatalf("Add(2,3)=%d, want 5", got)
    }
}

func helper() {}`,
        output: `go test ./money -v
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
PASS
ok demo/money 0.003s

_test.go 只在 go test 中编译。
TestAdd 首字母大写且签名正确，被测试框架发现。`,
      }],
      ['testing.T 报错', 't.Error 与 t.Errorf 标记失败后继续执行本用例剩余部分，t.Fatal 与 t.Fatalf 立即终止当前用例但其余用例照跑；t.Log 的诊断信息只在失败或 -v 模式下显示。用例之间不共享可变状态，任何一个都能单独重跑复现，失败信息要同时给出期望值与实际值。', 'Fatal 停 Error 行', {
        title: 'testing.T：Error 与 Fatal 差异',
        language: 'Go',
        code: `func TestMessages(t *testing.T) {
    t.Log("diagnostic")
    t.Errorf("non-fatal: got=%d want=%d", 2, 3)
    t.Log("still running")
    t.Fatalf("fatal: stop current test")
    t.Log("unreachable")
}

func TestStillRuns(t *testing.T) {
    if 1+1 != 2 { t.Fatal("math") }
}`,
        output: `go test -v
=== RUN TestMessages
diagnostic
non-fatal: got=2 want=3
still running
fatal: stop current test
--- FAIL: TestMessages
=== RUN TestStillRuns
--- PASS: TestStillRuns

Errorf 之后继续执行，Fatalf 终止当前用例。
另一个用例不受前一个失败影响。`,
      }],
      ['表驱动测试', '表驱动是 Go 最主流的组织方式：定义一个含名称、输入、期望输出的切片，循环里用 t.Run(tc.name, ...) 为每行数据开子测试。新增情形只需加一行数据；失败报告会带上子测试名，一眼定位是哪种输入出错，避免为每种情形复制一个几乎相同的测试函数。', '一张表跑全部用例', {
        title: 'Go：t.Run 表驱动测试',
        language: 'Go',
        code: `func TestNormalize(t *testing.T) {
    tests := []struct {
        name string
        input string
        want string
    }{
        {"trim", "  Ada ", "Ada"},
        {"empty", "", ""},
        {"case", "ada", "ada"},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            if got := strings.TrimSpace(tc.input); got != tc.want {
                t.Errorf("got %q want %q", got, tc.want)
            }
        })
    }
}`,
        output: `go test ./... -run TestNormalize -v
=== RUN TestNormalize/trim
=== RUN TestNormalize/empty
=== RUN TestNormalize/case
--- PASS: TestNormalize

每条数据生成带名称的子测试。
失败时报告能定位到具体输入。`,
      }],
      ['基准与 ns/op', '基准函数签名为 func BenchmarkXxx(b *testing.B)，框架自动调整 b.N 使运行时长趋于稳定，循环体执行 b.N 次后输出 ns/op，即单次操作的平均纳秒数。报告里函数名后的 -8 是 GOMAXPROCS 对应的并行度；加 -benchmem 会追加每次操作的分配字节数与分配次数，可作为优化前基线。', 'b.N 循环算均值', {
        title: 'Go：Benchmark 与 benchmem',
        language: 'Go',
        code: `func JoinConcat(values []string) string {
    result := ""
    for _, value := range values { result += value }
    return result
}

func BenchmarkJoinConcat(b *testing.B) {
    values := []string{"a", "b", "c", "d"}
    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ { _ = JoinConcat(values) }
}`,
        output: `go test -run=^$ -bench=JoinConcat -benchmem -count=3
BenchmarkJoinConcat-8  7523814  158.2 ns/op  32 B/op  3 allocs/op
BenchmarkJoinConcat-8  7612042  156.9 ns/op  32 B/op  3 allocs/op

b.N 由框架自动调整。
ns/op、B/op、allocs/op 是后续优化基线。`,
      }],
      ['跑基准与对比', 'go test -bench . 运行全部基准，-run=^$ 让单元用例一个都不匹配从而只跑基准；-benchtime 可延长单轮时长，-count=5 重复采样以降低波动干扰，多组结果用 benchstat 做统计比较，避免被单次噪声误导。优化前后各测一轮，ns/op 的下降幅度才谈得上收益。', '跳过用例只跑基准', {
        title: 'PowerShell：benchstat 比较优化前后',
        language: 'PowerShell',
        code: `go test -run=^$ -bench=. -benchmem -count=5 ./... > old.txt
git switch feature/string-builder
go test -run=^$ -bench=. -benchmem -count=5 ./... > new.txt
go install golang.org/x/perf/cmd/benchstat@latest
benchstat old.txt new.txt
go test ./... -race`,
        output: `name          old ns/op  new ns/op  delta
JoinConcat-8    158        52.1       -67.03%
name          old B/op   new B/op   delta
JoinConcat-8     32         8        -75.00%

benchstat 显示多次采样的中位数变化。
功能测试与 race 检查同时通过，优化才可接受。`,
      }],
    ],
  },
];

// ── G1 结构体、接口、错误与 context ─────────────────────────────────────────────
const goG1Stage = '结构体、接口、错误与 context';
const goG1Name = (topic: string) => `Go · ${goG1Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG1Name('结构体、方法、嵌入和组合'),
    track,
    minutes: 38,
    prerequisite: '已完成 G0 基础语法学习，能独立编写并运行简单的 Go 程序。',
    goal: '掌握方法接收者值与指针的语义差异及编译器自动取址规则，理解嵌入是委托提升而非继承，能准确推断字段与方法在多层结构中的查找路径。',
    guidedPractice: '定义 Order 结构体，分别用值接收者与指针接收者各写一个修改字段的方法，运行打印调用前后的字段值，记录哪些调用真正改动了原变量并说明原因。',
    independentPractice: '构造 Outer-Middle-Inner 三层嵌入结构，把同名方法放在不同深度，逐层注释验证编译器对歧义字段的报错，写出写全路径消歧的最小修复方案。',
    commonErrors: ['在值接收者的方法里给字段赋值，误以为调用方能观察到变化，实际修改的只是副本。', '把嵌入当成继承，期望外层重写内层方法后内层逻辑随之改变，实际只是遮蔽了提升的方法。'],
    sourceRefs: ['Effective Go. https://go.dev/doc/effective_go', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['结构体与内存布局', '结构体用 type Name struct { Field T } 声明；字面量按字段名初始化，未列出的字段取零值。字段顺序影响内存对齐，编译器会在字段间填充字节，大字段放前面能减少体积。省略字段名只写类型的是嵌入，机制后面单独展开。', '按名初始化兜底零值', {
        title: 'Go：结构体字面量与零值',
        language: 'Go',
        code: `package main

import (
    "fmt"
    "unsafe"
)

type Order struct {
    ID string
    Paid bool
    Total int64
}

func main() {
    a := Order{ID: "O-1", Total: 100}
    b := Order{}
    fmt.Printf("%+v\\n%+v\\n", a, b)
    fmt.Println(unsafe.Sizeof(a))
}`,
        output: `{ID:O-1 Paid:false Total:100}
{ID: Paid:false Total:0}
32

未列出的字段取类型零值。
结构体大小包含字符串头、int64 和字段对齐填充。`,
      }],
      ['值与指针接收者', '值接收者拿到副本，改字段不影响调用方；指针接收者经地址改原值，且省去复制开销。s.Update() 会被编译器自动改写为 (&s).Update()，但 map 元素与接口值不可寻址，自动取址失败即编译报错。指针接收者选定后全套保持一致。', '指针接收者改真身', {
        title: 'Go：值接收者与指针接收者',
        language: 'Go',
        code: `package main

import "fmt"

type Counter struct{ N int }

func (c Counter) ValueAdd() { c.N++ }
func (c *Counter) PointerAdd() { c.N++ }

func main() {
    counter := Counter{}
    counter.ValueAdd()
    fmt.Println(counter.N)
    counter.PointerAdd()
    fmt.Println(counter.N)
}`,
        output: `0
1

值接收者修改的是副本。
指针接收者经地址修改原 Counter，调用会自动取址。`,
      }],
      ['嵌入是委托不是继承', '只写类型名的字段即嵌入，如 type Car struct { Engine }。Go 没有继承，嵌入是委托：car.Start() 被改写为 car.Engine.Start()。没有虚方法与重写，外层同名方法只是遮蔽内层。', '嵌入是委托非继承', {
        title: 'Go：嵌入方法只是委托',
        language: 'Go',
        code: `package main

import "fmt"

type Engine struct{}
func (Engine) Start() { fmt.Println("engine start") }

type Car struct{ Engine }
func (c Car) Start() {
    fmt.Println("car")
    c.Engine.Start()
}

func main() {
    car := Car{}
    car.Start()
    car.Engine.Start()
}`,
        output: `car
engine start
engine start

car.Start 显式委托到 Engine.Start。
外层方法遮蔽提升方法，但没有虚方法动态分派。`,
      }],
      ['字段提升查找规则', 'car.Engine.RPM 可简写 car.RPM，即字段提升，查找取最浅深度。Inner 经 Middle 嵌入 Outer 时，Outer 可直达 Inner；同深度重名报 ambiguous selector，须全路径消歧。', '同深度重名须全路径', {
        title: 'Go：嵌入字段提升与歧义',
        language: 'Go',
        code: `type A struct{ Name string }
type B struct{ Name string }

type Both struct {
    A
    B
}

b := Both{A: A{"a"}, B: B{"b"}}
fmt.Println(b.A.Name, b.B.Name)
// fmt.Println(b.Name) // ambiguous selector b.Name
fmt.Println(b.A.Name)`,
        output: `a b
a

A.Name 与 B.Name 同深度，b.Name 产生歧义。
写全路径 b.A.Name 或 b.B.Name 才能消歧。`,
      }],
      ['组合优于继承', 'Go 取向组合：嵌入小接口或小结构体拼装能力，如 Server 嵌入 Logger 自动获得 Log 方法。嵌接口让外层自动满足该接口，便于测试时替换实现；嵌具体类型则强绑定细节。复用行为嵌具体类型，要替换行为就嵌接口。', '替换行为就嵌接口', {
        title: 'Go：组合窄接口替换行为',
        language: 'Go',
        code: `type Logger interface { Log(string) }
type stdLogger struct{}
func (stdLogger) Log(message string) { fmt.Println("std", message) }

type Server struct{ Logger }

func main() {
    server := Server{Logger: stdLogger{}}
    server.Log("started")
    server.Logger = fakeLogger{}
    server.Log("test")
}

type fakeLogger struct{}
func (fakeLogger) Log(message string) { fmt.Println("fake", message) }`,
        output: `std started
fake test

Server 嵌入 Logger 接口，自身自动拥有 Log 方法。
替换 Logger 字段即可切换具体行为。`,
      }],
    ],
  },
  {
    name: goG1Name('接口、隐式实现和依赖方向'),
    track,
    minutes: 38,
    prerequisite: '理解结构体与方法接收者语义，能使用嵌套结构与简单接口组合代码。',
    goal: '理解隐式实现如何解耦生产者与消费者，掌握小接口惯用法与接口值的双字底层结构，能准确区分 nil 接口与持有 nil 指针的接口两种形态。',
    guidedPractice: '为 fmt.Stringer 手写两个不同类型的实现并打印，再用文档确认接口值的双字结构，画出赋值发生后类型字与数据字的指向示意图作为产物。',
    independentPractice: '把一段依赖具体类型写死的代码重构为消费侧定义接口：先删掉多余方法只保留调用点真正用到的，再写一个 fake 实现注入测试，保证原有行为不变。',
    commonErrors: ['在生产者包里预先定义大接口并要求实现方遵守，导致依赖方向反转、测试无法替换实现。', '把类型为指针的 nil 变量赋给 error 返回，函数返回值非 nil 且方法被调到，引发隐蔽的逻辑错误。'],
    sourceRefs: ['Effective Go. https://go.dev/doc/effective_go', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['隐式实现机制', '接口实现是隐式的：方法集覆盖接口全部方法签名即自动满足，无须 implements 声明。类型身份与能力描述解耦，库作者只写具体类型，使用者按需声明接口，双方无需互相 import。新增接口不必改动旧类型，这是隐式实现的工程收益。', '实现方无须知接口', {
        title: 'Go：隐式接口实现',
        language: 'Go',
        code: `package main

import "fmt"

type Stringer interface { String() string }
type Order struct{ ID string }
func (o Order) String() string { return "order:" + o.ID }

func printValue(value Stringer) { fmt.Println(value.String()) }

func main() {
    var value Stringer = Order{ID: "O-1"}
    printValue(value)
}`,
        output: `order:O-1

Order 没有声明 implements。
只要方法集包含 String() string，就满足 Stringer。`,
      }],
      ['小接口惯用法', '标准库偏爱单方法接口：io.Reader 只有 Read，io.Writer 只有 Write。实现负担最小，也易组合——io.ReadWriter 即嵌入 Reader 与 Writer 的组合接口。设计自最小方法集，有第二个实现再合并。', '先窄后宽再组合', {
        title: 'Go：io.Reader 与 Writer 组合',
        language: 'Go',
        code: `package main

import (
    "bytes"
    "io"
    "strings"
)

func main() {
    var reader io.Reader = strings.NewReader("hello")
    var buffer bytes.Buffer
    var readWriter io.ReadWriter = &buffer
    _ = readWriter
    data, _ := io.ReadAll(reader)
    buffer.Write(data)
    println(buffer.String())
}`,
        output: `hello

strings.Reader 实现 io.Reader。
bytes.Buffer 同时实现 Reader 与 Writer，因此满足 io.ReadWriter 组合接口。`,
      }],
      ['接口值的双字结构', '接口值底层是两个字：类型字指向 itab，数据字指向具体值。把 time.Duration(5) 赋给 Stringer 后，类型字记录该类型。类型断言 v.(T) 的开销来自比较类型字并取出数据字，errors.As 建立在这套结构上。', '类型字加数据字', {
        title: 'Go：接口断言与底层具体值',
        language: 'Go',
        code: `var value any = 42
number, ok := value.(int)
fmt.Println(number, ok)
text, ok := value.(string)
fmt.Println(text, ok)
fmt.Printf("%T %v\\n", value, value)
fmt.Println(value == nil)

var pointer error
fmt.Println(pointer == nil)`,
        output: `42 true
 false
int 42
false
true

类型断言比较接口中的动态类型并取出数据。
空接口保存 int 42 时不为 nil。`,
      }],
      ['nil 接口与持有 nil', 'nil 接口两字均为零，调用即 panic。陷阱是持有 nil 的接口：把 *T 类型的 nil 指针赋给接口后类型字非零，接口本身不等于 nil，调用方法会进入方法体执行。返回 error 时须显式写 return nil。', '返回显式写 nil', {
        title: 'Go：typed nil 与 nil error',
        language: 'Go',
        code: `package main

import "fmt"

type MyError struct{}
func (*MyError) Error() string { return "typed nil" }

func broken() error {
    var err *MyError
    return err
}

func fixed() error { return nil }

func main() {
    fmt.Println(broken() == nil)
    fmt.Println(fixed() == nil)
}`,
        output: `false
true

broken 返回的接口带类型 *MyError，数据字为 nil。
接口整体不等于 nil，调用 Error 会进入方法。`,
      }],
      ['依赖方向与接口归属', '接口定义在使用方：consumer 包声明自己需要的方法集，producer 只写实现，依赖箭头指向内部。常见偏差是接口与实现放同一包导出，形成预先抽象。自查：删掉 consumer 的接口后 producer 仍能编译，说明边界划对了。', '接口定义在使用方', {
        title: 'Go：消费者定义窄接口',
        language: 'Go',
        code: `package service

type OrderReader interface {
    Find(id string) (Order, bool)
}

type OrderService struct { reader OrderReader }

func New(reader OrderReader) *OrderService {
    return &OrderService{reader: reader}
}

func (s *OrderService) Status(id string) string {
    order, ok := s.reader.Find(id)
    if !ok { return "missing" }
    return order.Status
}`,
        output: `type memoryReader struct{ rows map[string]Order }
func (r memoryReader) Find(id string) (Order, bool) { o, ok := r.rows[id]; return o, ok }

service.New(memoryReader{...})

service 只声明自己需要的 Find。
producer 无需 import service，也不需要预先实现大接口。`,
      }],
    ],
  },
  {
    name: goG1Name('error、errors.Is/As 与错误链'),
    track,
    minutes: 38,
    prerequisite: '掌握接口隐式实现与接口值底层结构，能编写并调用返回 error 的函数。',
    goal: '理解 error 是单方法接口与错误即值的处理哲学，掌握 %w 包装、errors.Is 逐层比对、errors.As 类型提取与哨兵错误惯用法，能构建可判别的错误链。',
    guidedPractice: '编写三层函数调用并在最内层返回 io.EOF，逐层用 %w 包装后，在外层分别用 errors.Is 与字符串比较两种方式判别，记录哪种在加包装后仍然有效。',
    independentPractice: '定义携带字段的自定义错误类型并在链中混用哨兵错误，写测试覆盖 errors.Is 命中、errors.As 提取、链中途断裂三种场景，输出判定结果清单。',
    commonErrors: ['在包装错误时误用 %v 代替 %w，只复制了文本、断开了 Unwrap 链，errors.Is 全部失效。', '用 err.Error() 的字符串内容做相等判断，文案微调即误判，且无法携带结构化信息。'],
    sourceRefs: ['Go Blog: Errors are values. https://go.dev/blog/errors-are-values', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['error 是接口', 'error 是只有一个 Error() string 方法的接口，实现它即可作错误。惯例最后一个返回值放 error，nil 表示成功——错误是普通值非异常，须逐个检查。errors.New 造文本错误值，纯文本比对脆弱，故有链式判别。', '错误是普通返回值', {
        title: 'Go：自定义 error 类型',
        language: 'Go',
        code: `package main

import "fmt"

type NotFound struct{ ID string }
func (e *NotFound) Error() string { return "not found: " + e.ID }

func find(id string) error {
    if id == "missing" { return &NotFound{ID: id} }
    return nil
}

func main() {
    if err := find("missing"); err != nil {
        fmt.Println(err)
    }
}`,
        output: `not found: missing

error 是只有 Error() string 的接口。
NotFound 实现该方法后即可作为 error 值返回。`,
      }],
      ['%w 包装成链', 'fmt.Errorf 的 %w 动词把底层错误包进新错误，返回的类型实现 Unwrap() error，调用即返回内层错误。多层 %w 逐层嵌套，链深不限；改用 %v 只复制文本、断开链条，后续 errors.Is 全部失效。', '%w连链%v断链', {
        title: 'Go：%w 包装错误链',
        language: 'Go',
        code: `var ErrDB = errors.New("db failure")

func query() error {
    return fmt.Errorf("select order: %w", ErrDB)
}

func service() error {
    return fmt.Errorf("load order: %w", query())
}

func brokenWrap() error {
    return fmt.Errorf("load order: %v", query())
}

fmt.Println(errors.Is(service(), ErrDB))
fmt.Println(errors.Is(brokenWrap(), ErrDB))`,
        output: `true
false

%w 保留 Unwrap 链，errors.Is 能穿过两层找到 ErrDB。
%v 只复制文本，外层错误没有内层 cause。`,
      }],
      ['errors.Is 逐层比对', 'errors.Is(err, target) 沿 Unwrap 链自外向内逐层用 == 比对，命中返回 true，解完未命中返回 false。它比较同一性而非文本，target 通常是导出的哨兵错误。错误类型实现 Is 方法时优先被调用。', 'Is 沿链全解比对', {
        title: 'Go：errors.Is 识别哨兵错误',
        language: 'Go',
        code: `var ErrNotFound = errors.New("not found")

func repo(id string) error {
    return fmt.Errorf("order %s: %w", id, ErrNotFound)
}

err := repo("O-1")
fmt.Println(err)
fmt.Println(errors.Is(err, ErrNotFound))
fmt.Println(err.Error() == ErrNotFound.Error())
fmt.Println(errors.Is(fmt.Errorf("plain: %v", ErrNotFound), ErrNotFound))`,
        output: `order O-1: not found
true
false
false

Is 沿链比较同一性，不依赖完整文本。
%v 断开链后目标哨兵不可达。`,
      }],
      ['errors.As 提取类型', 'errors.As 沿链解包按类型匹配，命中后把错误值赋给 target，如 PathError 可读出 pe.Path。第二参数须是实现 error 类型的指针；匹配不到返回 false 且不改 target。', 'As 按类型取错误值', {
        title: 'Go：errors.As 提取结构化错误',
        language: 'Go',
        code: `type ValidationError struct {
    Field string
    Code string
}
func (e *ValidationError) Error() string { return e.Field + ":" + e.Code }

err := fmt.Errorf("create order: %w", &ValidationError{Field: "quantity", Code: "TOO_SMALL"})
var validation *ValidationError
if errors.As(err, &validation) {
    fmt.Println(validation.Field, validation.Code)
}

var other *NotFound
fmt.Println(errors.As(err, &other))`,
        output: `quantity TOO_SMALL
false

As 沿链找到 *ValidationError 并写入 target。
类型不匹配返回 false，target 保持原值。`,
      }],
      ['哨兵错误 io.EOF', '哨兵是导出的包级变量，如 io.EOF。Read 返回 io.EOF 表示读完，属正常收尾而非报错；经 %w 包装后须用 errors.Is 判别。自定义哨兵如 var ErrNotFound = errors.New("nf")。', 'EOF 是正常结束', {
        title: 'Go：把 io.EOF 视为正常结束',
        language: 'Go',
        code: `reader := strings.NewReader("abc")
buffer := make([]byte, 2)
for {
    n, err := reader.Read(buffer)
    fmt.Printf("read=%q n=%d\\n", buffer[:n], n)
    if errors.Is(err, io.EOF) {
        fmt.Println("finished")
        break
    }
    if err != nil {
        fmt.Println("failed", err)
        break
    }
}`,
        output: `read="ab" n=2
read="c" n=1
read="" n=0
finished

EOF 表示正常读完，不作为故障上报。
包装后的 EOF 仍应使用 errors.Is 判断。`,
      }],
    ],
  },
  {
    name: goG1Name('context 取消、期限和值边界'),
    track,
    minutes: 40,
    prerequisite: '理解 channel 与 select 的基本用法，能编写并调试返回 error 的多层函数调用。',
    goal: '掌握 context 首参惯例与不可变派生模型，理解 WithCancel、WithTimeout 的取消传播机制与期限取早规则，明确 Done 通道、ctx.Err 与 WithValue 的边界。',
    guidedPractice: '编写带 WithTimeout 的慢查询函数，分别在超时前完成与超时后完成两种情况下运行，观察 Done 通道关闭时机并打印 ctx.Err() 的返回值作为记录产物。',
    independentPractice: '改造一个阻塞式循环任务，使其能被 ctx 取消并清理资源，再用父子两级不同期限的用例验证期限取更早者，输出每种情况的取消原因。',
    commonErrors: ['在派生 context 后忘记调用 cancel，父级资源持续被持有，引发 context 泄漏与内存增长。', '把数据库连接或业务配置塞进 WithValue 传参，数据流不可见且编译器无法检查类型。'],
    sourceRefs: ['Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['ctx 首参惯例', 'context.Context 携带取消信号、期限与请求级键值，惯例作为第一个参数命名为 ctx，不存进结构体字段。ctx 不可变：每次 WithCancel、WithValue 都返回新值，父级取消时所有子级联动取消，方向只能父传子。', 'ctx 永远排第一', {
        title: 'Go：context 作为首参传递',
        language: 'Go',
        code: `func LoadOrder(ctx context.Context, repo Repo, id string) (Order, error) {
    select {
    case <-ctx.Done():
        return Order{}, ctx.Err()
    default:
    }
    return repo.Find(ctx, id)
}

ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()
order, err := LoadOrder(ctx, repo, "O-1")
fmt.Println(order, err)`,
        output: `{ID:O-1 Status:PAID} <nil>

ctx 位于第一个参数并向下传递。
repo.Find 也能监听同一个取消与期限。`,
      }],
      ['WithCancel 传播', 'context.WithCancel(parent) 返回派生 ctx 与 cancel。cancel 会关闭该 ctx 及全部后代的 Done 通道，须 defer cancel() 防泄漏。传播单向：父取消联动全部子级，子不影响父。', '取消单向父传子', {
        title: 'Go：WithCancel 父子联动',
        language: 'Go',
        code: `parent, cancelParent := context.WithCancel(context.Background())
child, cancelChild := context.WithCancel(parent)
defer cancelParent()
defer cancelChild()

go func() {
    <-child.Done()
    fmt.Println("child", child.Err())
}()

cancelParent()
time.Sleep(50 * time.Millisecond)
fmt.Println("parent", parent.Err())
fmt.Println("child", child.Err())`,
        output: `child context canceled
parent context canceled
child context canceled

取消 parent 自动关闭 child.Done。
取消 child 不会影响 parent。`,
      }],
      ['超时与期限传播', 'WithTimeout(parent, d) 到点自动取消，cancel 仍要 defer。期限沿派生树取更早者：父已带 5 秒期限，子设 10 秒也在 5 秒被取消。阻塞操作须 select 监听 ctx.Done() 才能被打断。', '期限取更早者', {
        title: 'Go：父子期限取更早者',
        language: 'Go',
        code: `parent, cancelParent := context.WithTimeout(context.Background(), 100*time.Millisecond)
defer cancelParent()
child, cancelChild := context.WithTimeout(parent, 5*time.Second)
defer cancelChild()

deadline, ok := child.Deadline()
fmt.Println(ok, time.Until(deadline) < time.Second)
<-child.Done()
fmt.Println(child.Err())`,
        output: `true true
context deadline exceeded

子设 5 秒，但父只剩 100ms，子期限被父截短。
监听 Done 后阻塞操作能及时退出。`,
      }],
      ['Done 与 ctx.Err', 'Done() 是只读 channel，取消或超时到点关闭，关闭即向等待者广播。ctx.Err() 返回原因：未取消为 nil，手动取消为 context.Canceled，超时为 context.DeadlineExceeded。', 'Err 就是取消原因', {
        title: 'Go：区分取消与超时原因',
        language: 'Go',
        code: `func wait(ctx context.Context) {
    <-ctx.Done()
    switch ctx.Err() {
    case context.Canceled:
        fmt.Println("cancelled")
    case context.DeadlineExceeded:
        fmt.Println("deadline")
    }
}

ctx1, cancel := context.WithCancel(context.Background())
go wait(ctx1)
time.Sleep(10 * time.Millisecond)
cancel()
time.Sleep(10 * time.Millisecond)

ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Millisecond)
defer cancel2()
go wait(ctx2)
time.Sleep(30 * time.Millisecond)`,
        output: `cancelled
deadline

Done 关闭只是信号。
ctx.Err 给出 Canceled 或 DeadlineExceeded 的具体原因。`,
      }],
      ['存值的边界与禁用', 'WithValue(parent, key, val) 存只读键值，边界极严：只放请求级横切数据，如 trace id、鉴权 token；键须自定义类型避免碰撞。业务参数必须走显式参数，塞进 ctx 数据流不可见、无法静态检查。', '只放请求级数据', {
        title: 'Go：WithValue 使用私有键类型',
        language: 'Go',
        code: `type traceKey struct{}

func withTrace(ctx context.Context, traceID string) context.Context {
    return context.WithValue(ctx, traceKey{}, traceID)
}

func traceID(ctx context.Context) string {
    value, _ := ctx.Value(traceKey{}).(string)
    return value
}

ctx := withTrace(context.Background(), "trace-7f21")
fmt.Println(traceID(ctx))
fmt.Println(ctx.Value("trace-7f21"))`,
        output: `trace-7f21
<nil>

私有空结构体键避免与其他包碰撞。
字符串键无法取回同一私有键对应的值。`,
      }],
    ],
  },
  {
    name: goG1Name('泛型、约束和类型集合'),
    track,
    minutes: 37,
    prerequisite: '掌握接口隐式实现与类型断言机制，能阅读并修改使用组合接口的代码。',
    goal: '掌握 type parameters 声明与类型推断语法，理解 comparable、any 及带类型集合的约束接口，能判断泛型与接口的适用场景并做出正确选型。',
    guidedPractice: '用泛型实现适用于任意数值切片的 Sum 函数，先写 any 约束版本观察编译报错，再改为带类型集合的约束版本使其通过，对比记录两个版本的差异。',
    independentPractice: '把项目里三份仅元素类型不同的重复函数合并为一个泛型函数，再找出一个本应使用接口却写成泛型的场景并改回，写出两种方案的选型理由。',
    commonErrors: ['在约束里写 int 而不是 ~int，自定义的 type MyInt int 类型被拒之门外，编译无法通过。', '所有函数一律加类型参数炫技，签名噪音增大，本该用接口表达的运行期多态被编译期固定。'],
    sourceRefs: ['Effective Go. https://go.dev/doc/effective_go', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['类型参数语法', '泛型在函数名与参数列表间声明类型参数：func Map[T any](s []T, f func(T) T) []T。多数场景由实参推断省略方括号。类型参数编译期实例化，无装箱开销。结构体同理，如 Stack[T any]。', '编译期实例化无装箱', {
        title: 'Go：泛型 Map 与 Stack',
        language: 'Go',
        code: `func Map[T any](values []T, fn func(T) T) []T {
    result := make([]T, len(values))
    for i, value := range values { result[i] = fn(value) }
    return result
}

type Stack[T any] struct{ items []T }
func (s *Stack[T]) Push(value T) { s.items = append(s.items, value) }
func (s *Stack[T]) Pop() (T, bool) {
    var zero T
    if len(s.items) == 0 { return zero, false }
    value := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return value, true
}

fmt.Println(Map([]int{1,2}, func(v int) int { return v*2 }))`,
        output: `[2 4]

Map 根据实参推断 T=int。
Stack[int] 在编译期实例化，元素没有接口装箱。`,
      }],
      ['comparable 约束', 'any 是 interface{} 的别名，任意类型但无方法可用。comparable 表示支持 == 与 != 的类型，作 map 键必须满足它。切片、map、函数都不满足 comparable，编译期即拒绝。', '键必须可比较', {
        title: 'Go：comparable 约束 map 键',
        language: 'Go',
        code: `func Keys[K comparable, V any](m map[K]V) []K {
    result := make([]K, 0, len(m))
    for key := range m { result = append(result, key) }
    return result
}

fmt.Println(Keys(map[string]int{"a": 1, "b": 2}))
fmt.Println(Keys(map[int]string{1: "one"}))

// 切片、map、函数类型不满足 comparable。`,
        output: `[a b]
[1]

comparable 只约束 K 可用于 map 键与 ==。
切片、map、函数类型不满足 comparable。`,
      }],
      ['约束即类型集合', '约束是接口，元素是类型集合：[T int | float64] 表示 T 只能取这两种。~int 匹配底层类型为 int 的类型，含自定义的 MyInt，只写 int 容纳不了。约束也可加入方法要求，成员需同时实现。', '~int 容纳自定义', {
        title: 'Go：~int 约束自定义类型',
        language: 'Go',
        code: `type MyInt int

func Sum[T ~int | ~int64 | ~float64](values []T) T {
    var total T
    for _, value := range values { total += value }
    return total
}

fmt.Println(Sum([]int{1,2,3}))
fmt.Println(Sum([]MyInt{1,2,3}))
fmt.Println(Sum([]float64{1.5,2.5}))`,
        output: `6
6
4

~int 匹配底层类型 int 的 MyInt。
只写 int 时 MyInt 不满足约束。`,
      }],
      ['泛型的适用边界', '泛型适合容器与算法这类对多种类型逻辑一致的操作，如 slice、map、set 的通用处理；不适合运行时才决定行为的抽象与方法多态——那是接口的领地。判断顺序：能用接口就用接口，确需通用数据结构再上泛型。', '算法容器才上泛型', {
        title: 'Go：泛型容器与接口行为',
        language: 'Go',
        code: `type Set[T comparable] map[T]struct{}
func (s Set[T]) Add(value T) { s[value] = struct{}{} }
func (s Set[T]) Has(value T) bool { _, ok := s[value]; return ok }

type PaymentGateway interface { Charge(amount int) error }
type Checkout struct{ gateway PaymentGateway }
func (c Checkout) Pay(amount int) error { return c.gateway.Charge(amount) }

set := Set[string]{}
set.Add("a")
fmt.Println(set.Has("a"), set.Has("b"))`,
        output: `true false

Set 泛型对同构容器逻辑复用。
PaymentGateway 需要在运行期替换实现，因此用接口。`,
      }],
      ['接口与泛型分工', '接口管行为多态：同一接口可挂任意实现并在运行期替换，注入 fake 测试靠它。泛型面向同构：逻辑对每个 T 一致且编译期固定。写出 Process[T io.Reader](r T) 时自问是否需要类型信息，收 io.Reader 即可。', '行为多态交接口', {
        title: 'Go：避免无意义类型参数',
        language: 'Go',
        code: `func ReadAllBad[T io.Reader](reader T) ([]byte, error) { return io.ReadAll(reader) }
func ReadAllGood(reader io.Reader) ([]byte, error) { return io.ReadAll(reader) }

var reader io.Reader = strings.NewReader("data")
data, err := ReadAllGood(reader)
fmt.Println(string(data), err)`,
        output: `data <nil>

ReadAll 不需要知道具体 reader 类型，直接接 io.Reader。
泛型只保留给需要保持元素类型关系的算法与容器。`,
      }],
    ],
  },
  {
    name: goG1Name('领域服务与错误模型实验'),
    track,
    minutes: 40,
    prerequisite: '已完成接口、错误链、context 与泛型四个主题的学习，能独立编写多文件 Go 程序。',
    goal: '综合运用前面所学：组合窄接口实现可测试的领域服务，设计实现 Unwrap 与 Is 的自定义错误类型，并把 context 贯穿服务形成完整取消链与错误传播路径。',
    guidedPractice: '搭建 OrderService 及其窄接口，写 memoryRepo 与 spyNotifier 两个伪造实现注入测试，运行用例并记录正常路径、仓库报错、ctx 超时三种结果的断言输出。',
    independentPractice: '为服务补齐 ValidationError 类型并实现 Error、Unwrap、Is 三个方法，再写测试验证 errors.Is 按语义命中、errors.As 提取字段、超时错误原样上抛三条路径。',
    commonErrors: ['服务直接持有具体数据库类型而非接口，测试被迫启动真实数据库，用例缓慢且不稳定。', '服务层捕获到 context.DeadlineExceeded 后包装吞掉，调用方无法识别超时，重试策略失效。'],
    sourceRefs: ['Go Blog: Errors are values. https://go.dev/blog/errors-are-values', 'Effective Go. https://go.dev/doc/effective_go'],
    steps: [
      ['组合小接口的服务', '领域服务只依赖小接口：OrderService 仅持有 repo、notifier 两个窄接口字段，接口在本包定义、各含一两个方法。服务编排业务规则，不关心底层。依赖经 NewOrderService(repo, notifier) 注入。', '窄接口即注入点', {
        title: 'Go：领域服务组合窄接口',
        language: 'Go',
        code: `type Repo interface {
    Save(ctx context.Context, order Order) error
}
type Notifier interface {
    Notify(ctx context.Context, message string) error
}
type OrderService struct { repo Repo; notifier Notifier }

func NewOrderService(repo Repo, notifier Notifier) *OrderService {
    return &OrderService{repo: repo, notifier: notifier}
}
func (s *OrderService) Place(ctx context.Context, order Order) error {
    if err := s.repo.Save(ctx, order); err != nil { return err }
    return s.notifier.Notify(ctx, "placed "+order.ID)
}`,
        output: `service := NewOrderService(memoryRepo{}, spyNotifier{})
err := service.Place(context.Background(), Order{ID: "O-1"})
repo save=1 notify=1 err=<nil>

服务只依赖 Save 与 Notify 两个窄接口。
具体实现可以在测试中直接替换。`,
      }],
      ['伪造实现做测试', '窄接口带来可测试性：用 memoryRepo、spyNotifier 两个 fake 直接注入，无须数据库与网络。让 fake 的 Save 返回构造好的错误，即可验证透传并记录日志。这是接口归属使用方的兑现：生产者无感知，替身无侵入接入。', 'fake 注入免真库', {
        title: 'Go：fake 验证失败透传',
        language: 'Go',
        code: `type failingRepo struct{ calls int }
func (r *failingRepo) Save(context.Context, Order) error {
    r.calls++
    return ErrDB
}
type spyNotifier struct{ calls int }
func (n *spyNotifier) Notify(context.Context, string) error {
    n.calls++
    return nil
}

repo := &failingRepo{}
notifier := &spyNotifier{}
err := NewOrderService(repo, notifier).Place(context.Background(), Order{"O-1"})
fmt.Println(errors.Is(err, ErrDB), repo.calls, notifier.calls)`,
        output: `true 1 0

repo.Save 返回 ErrDB，服务原样上抛。
仓库失败后通知器没有执行。`,
      }],
      ['实现 Unwrap 方法', 'ValidationError 实现 Error() string，携带原因时再实现 Unwrap() error 返回底层错误，errors.Is 才能穿透；不实现则是链的终点。多重原因可用 errors.Join 返回切片。', 'Unwrap 通底层', {
        title: 'Go：ValidationError 实现 Unwrap',
        language: 'Go',
        code: `var ErrInvalidOrder = errors.New("invalid order")
type ValidationError struct { Field string; Cause error }
func (e *ValidationError) Error() string { return e.Field + ": " + e.Cause.Error() }
func (e *ValidationError) Unwrap() error { return e.Cause }

err := &ValidationError{Field: "quantity", Cause: ErrInvalidOrder}
fmt.Println(errors.Is(err, ErrInvalidOrder))
var validation *ValidationError
fmt.Println(errors.As(err, &validation), validation.Field)`,
        output: `true
true quantity

Unwrap 暴露哨兵错误，Is 可穿透。
As 同时提取携带字段的 ValidationError。`,
      }],
      ['实现 Is 语义判别', '哨兵比对默认用 ==，语义相等时实现 Is 方法：如 NotFound 携带 Resource 字段，判断 target 是否同类。调用方 errors.Is(err, NotFound{"user"}) 即按语义判别，不暴露内部字段。', 'Is 管本层语义', {
        title: 'Go：自定义 Is 按资源类型匹配',
        language: 'Go',
        code: `type NotFound struct{ Resource string }
func (e *NotFound) Error() string { return e.Resource + " not found" }
func (e *NotFound) Is(target error) bool {
    other, ok := target.(*NotFound)
    return ok && other.Resource == e.Resource
}

err := fmt.Errorf("load: %w", &NotFound{Resource: "order"})
fmt.Println(errors.Is(err, &NotFound{Resource: "order"}))
fmt.Println(errors.Is(err, &NotFound{Resource: "user"}))`,
        output: `true
false

Is 方法按 Resource 字段比较语义。
不同资源类型即使文本相近也不命中。`,
      }],
      ['context 贯穿取消链', 'ctx 作为第一参数贯穿服务各层，Service、Repo、驱动逐层传递，收到 ctx.Done() 即返回 ctx.Err()。测试用 fake repo 模拟慢查询，WithTimeout(50ms) 后断言得到超时错误。', '取消直达最慢 IO', {
        title: 'Go：context 贯穿服务与仓库',
        language: 'Go',
        code: `type slowRepo struct{}
func (slowRepo) Save(ctx context.Context, _ Order) error {
    select {
    case <-time.After(time.Second):
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
defer cancel()
err := NewOrderService(slowRepo{}, spyNotifier{}).Place(ctx, Order{"O-2"})
fmt.Println(errors.Is(err, context.DeadlineExceeded))`,
        output: `true

ctx 原样传入 repo.Save。
慢查询在 50ms 超时后返回 DeadlineExceeded。`,
      }],
    ],
  },
];

// ── G2 goroutine、channel、select 与同步 ─────────────────────────────────────────────
const goG2Stage = 'goroutine、channel、select 与同步';
const goG2Name = (topic: string) => `Go · ${goG2Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG2Name('goroutine 生命周期与泄漏'),
    track,
    minutes: 38,
    prerequisite: '已掌握 Go 函数、闭包与 defer 的基础语义，能编译运行含多个包的小型程序。',
    goal: '理解 goroutine 的启动成本、退出条件与调度归属，能识别无接收者发送等典型泄漏形态，并用 NumGoroutine 与 pprof goroutine profile 定位泄漏点。',
    guidedPractice: '运行一个带泄漏的示例程序，在请求前后打印 runtime.NumGoroutine 的对比值，再访问 /debug/pprof/goroutine?debug=2 抄下阻塞在 chan send 的栈，产出一份泄漏定位笔记。',
    independentPractice: '把一个向无人接收的 channel 发送结果的 worker 改造为带 context 取消与 WaitGroup 回收的版本，用 goleak 在测试结尾断言无残留 goroutine 并提交代码。',
    commonErrors: ['在循环里每次迭代 go 出一个向无缓冲 channel 发送结果的 goroutine，调用方只取第一个结果，其余全部永久阻塞在 chan send 上。', '误以为 runtime 提供强制终止某个 goroutine 的 API，实际标准库没有 kill 语义，退出只能由函数自身 return 或 panic 实现。'],
    sourceRefs: ['Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns', 'Go Memory Model. https://go.dev/ref/mem'],
    steps: [
      ['启动成本与栈增长', 'go 关键字把函数包装成 runtime 层的 G 结构挂进运行队列，初始栈只有 2KB，远小于操作系统线程默认的 1~8MB；栈不够时触发栈复制扩容而不是重开一块。创建一个 goroutine 只需一次函数值拷贝加入队，因此单机十万级 goroutine 是常规操作，但每个仍占栈内存与调度时间，不是零成本。', '便宜但不免费', {
        title: 'Go：观察 goroutine 启动与栈增长',
        language: 'Go',
        code: `package main

import (
    "fmt"
    "runtime"
    "time"
)

func deep(n int) int {
    var pad [256]byte
    _ = pad
    if n == 0 { return 0 }
    return 1 + deep(n-1)
}

func main() {
    before := runtime.NumGoroutine()
    go func() { fmt.Println(deep(1000)) }()
    time.Sleep(20 * time.Millisecond)
    fmt.Println(before, runtime.NumGoroutine())
}`,
        output: `1000
1 2

新 G 初始栈很小，递归增长时由 runtime 复制扩容。
goroutine 便宜但仍会占用栈、调度状态和运行时间。`,
      }],
      ['调度与退出条件', 'goroutine 没有外部 kill API，runtime 不提供强制终止：它只能经由函数自然 return、发生未 recover 的 panic 或进程退出而结束。调度模型是 GMP——G 是任务、M 是系统线程、P 是调度上下文，G 阻塞在 channel 或锁上时会被摘下让 M 跑别的任务，但 G 本身仍存活，退出必须由代码自己设计出口。', '退出权在函数自身', {
        title: 'Go：goroutine 只能自行退出',
        language: 'Go',
        code: `func worker(stop <-chan struct{}) {
    for {
        select {
        case <-stop:
            fmt.Println("worker exit")
            return
        default:
            time.Sleep(10 * time.Millisecond)
        }
    }
}

stop := make(chan struct{})
go worker(stop)
time.Sleep(20 * time.Millisecond)
close(stop)
time.Sleep(20 * time.Millisecond)
fmt.Println(runtime.NumGoroutine())`,
        output: `worker exit
1

worker 通过 stop 分支自然 return。
没有外部 kill API，退出点必须写在函数内部。`,
      }],
      ['谁启动谁负责', '惯例是谁启动谁负责回收：启动方要持有一套让任务退出的手段，例如传入 context 并在退出时 cancel、关闭 done channel，或用 WaitGroup 等待收尾。第三方库若在内部默默 go 出协程又不给停止入口，调用方就永远无法回收它。评审时看到裸 go 关键字而没有配套退出路径，一律按缺陷处理。', '启动方要给退出通道', {
        title: 'Go：WaitGroup 回收 goroutine',
        language: 'Go',
        code: `func run(ctx context.Context, jobs int) {
    var wg sync.WaitGroup
    for i := 0; i < jobs; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            select {
            case <-ctx.Done():
                return
            case <-time.After(10 * time.Millisecond):
                fmt.Println("job", id)
            }
        }(i)
    }
    wg.Wait()
}

ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
defer cancel()
run(ctx, 3)`,
        output: `job 0
job 2
job 1

启动方在 go 前 Add，在函数内 defer Done。
run 返回时 Wait 已确认所有 goroutine 收尾。`,
      }],
      ['泄漏的典型形态', '最典型泄漏是无接收者的发送：goroutine 阻塞在 ch <- v 上而接收方早已返回，这个 G 永远卡住；无发送者的接收同理。阻塞中的 G 被发送或接收队列引用，垃圾回收不会回收它，泄漏随请求次数线性累积。循环里每次迭代都 go 出一个发结果的协程而主流程只取第一个，是真实项目常见事故。', '阻塞在没人交接处', {
        title: 'Go：复现无人接收的泄漏',
        language: 'Go',
        code: `func leak() {
    ch := make(chan int)
    go func() { ch <- 1 }()
    // 没有接收者，goroutine 永远阻塞在 chan send
}

before := runtime.NumGoroutine()
for i := 0; i < 5; i++ { leak() }
time.Sleep(20 * time.Millisecond)
fmt.Println(before, runtime.NumGoroutine())

buf := make([]byte, 1<<20)
n := runtime.Stack(buf, true)
fmt.Println(strings.Contains(string(buf[:n]), "chan send"))`,
        output: `1 6
true

五次调用新增五个永久阻塞的 goroutine。
runtime.Stack 的 all 快照包含 chan send 阻塞帧。`,
      }],
      ['检测与计数手段', '最轻量的手段是 runtime.NumGoroutine：在请求前后打点对比，数量单调上涨即有泄漏嫌疑。定位用 pprof：引入 net/http/pprof 后访问 /debug/pprof/goroutine?debug=2，每个 goroutine 的完整栈会打印出来，搜 chan send 或 chan receive 的长期停留点即泄漏位置。测试里可用 goleak 在 defer 中断言无残留。', '栈快照定位泄漏点', {
        title: 'goleak：测试末尾断言无泄漏',
        language: 'Go',
        code: `func TestWorkerNoLeak(t *testing.T) {
    defer goleak.VerifyNone(t)
    ctx, cancel := context.WithCancel(context.Background())
    done := make(chan struct{})
    go func() {
        defer close(done)
        <-ctx.Done()
    }()
    cancel()
    <-done
}

// 错误版本不 cancel 也不等待，goleak 会打印残留栈。`,
        output: `go test -run TestWorkerNoLeak -v
=== RUN TestWorkerNoLeak
--- PASS: TestWorkerNoLeak
PASS

正确版本 cancel 并等待 done，测试结束无残留。
泄漏版本在 goleak.VerifyNone 处失败并输出阻塞栈。`,
      }],
    ],
  },
  {
    name: goG2Name('channel、缓冲和所有权'),
    track,
    minutes: 36,
    prerequisite: '理解 goroutine 的启动与退出模型，能用 make 创建基本类型并读懂 channel 收发的示例代码。',
    goal: '区分无缓冲与缓冲 channel 的阻塞时机，掌握单向 channel 的类型约束与发送方负责关闭的所有权惯例，能解释向已关闭 channel 发送触发 panic 的运行时行为。',
    guidedPractice: '编写并运行三个小实验：无缓冲交接打印顺序、带缓冲 channel 的 len 与 cap 观察、对已关闭 channel 执行发送与二次 close 各自的 panic 输出，截图或摘录结果。',
    independentPractice: '把一个生产者消费者的示例重构为单向参数签名（chan<- 与 <-chan），由生产者在 defer 中 close，并用 v, ok := <-ch 的循环消费，写明为何 close 只能放在发送方。',
    commonErrors: ['把带缓冲 channel 当无限任务队列堆积请求，缓冲填满后发送方才开始阻塞，背压被延迟而不是消除，高峰期请求成批超时。', '由接收方或多个发送方各自执行 close，导致另一方随后发送时触发 panic: send on closed channel，且该 panic 难以定位到具体协程。'],
    sourceRefs: ['Go Memory Model. https://go.dev/ref/mem', 'Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns'],
    steps: [
      ['无缓冲的同步交接', 'make(chan T) 不带容量是无缓冲 channel：执行 ch <- v 会挂起当前 goroutine，直到另一个 goroutine 执行 <-ch，两边完成一次同步交接（rendezvous）后同时继续。交接的是值的拷贝，且交接完成即视为发送发生在接收读取之前，因此无缓冲 channel 同时承担通信与同步两个职责。', '无缓冲即同步握手', {
        title: 'Go：无缓冲 channel 同步交接',
        language: 'Go',
        code: `ch := make(chan int)
go func() {
    fmt.Println("before send")
    ch <- 42
    fmt.Println("after send")
}()
fmt.Println("before recv")
value := <-ch
fmt.Println("received", value)
time.Sleep(20 * time.Millisecond)`,
        output: `before send
before recv
received 42
after send

发送方阻塞到接收方取走值。
交接完成后两边继续，通信同时建立同步关系。`,
      }],
      ['缓冲改变阻塞时机', 'make(chan T, n) 创建带 n 个槽位的环形缓冲：发送只在缓冲满时阻塞，接收只在缓冲空时阻塞，len(ch) 报当前元素数，cap(ch) 报容量。缓冲只是把阻塞时机推迟，并不改变交接语义；把它当无限队列堆积任务不会提高吞吐，只会把背压延迟到缓冲填满的那一刻集中爆发。', '缓冲只是推迟阻塞', {
        title: 'Go：缓冲 channel 的 len 与 cap',
        language: 'Go',
        code: `ch := make(chan int, 2)
ch <- 1
ch <- 2
fmt.Println(len(ch), cap(ch))
select {
case ch <- 3:
    fmt.Println("sent 3")
default:
    fmt.Println("buffer full")
}
fmt.Println(<-ch, len(ch))
ch <- 3
fmt.Println(len(ch))`,
        output: `2 2
buffer full
1 1
2

缓冲满后发送阻塞，select default 可探测。
取走一个后空槽释放，下一次发送成功。`,
      }],
      ['单向类型限制用途', '类型系统支持单向 channel：chan<- T 只能发送，<-chan T 只能接收。函数参数声明成单向后，编译器直接禁止越界操作，接收方向的参数写 close 编译不过。习惯是内部构造双向 channel，再把只读副本交给消费者、只写副本交给生产者，方向约束由类型检查兜底而不是靠口头约定。', '用类型锁住方向', {
        title: 'Go：单向 channel 参数',
        language: 'Go',
        code: `func produce(out chan<- int) {
    defer close(out)
    for i := 0; i < 3; i++ { out <- i }
    // <-out // compile error
}

func consume(in <-chan int) {
    for value := range in { fmt.Println(value) }
    // in <- 9 // compile error
}

ch := make(chan int)
go produce(ch)
consume(ch)`,
        output: `0
1
2

produce 只能发，consume 只能收。
单向参数在编译期阻止越界使用。`,
      }],
      ['发送方负责关闭', '所有权惯例：channel 由发送方负责 close，因为只有发送方知道数据何时结束；多个发送方时不能各自 close，应由聚合方在所有生产者退出后统一关闭。接收方用 v, ok := <-ch 或 for range 读取，ok 为 false 表示通道已关闭且数据已取完。把 close 交给接收方会造成向已关闭通道发送的 panic。', '谁写谁关单向交棒', {
        title: 'Go：生产者关闭、消费者 range',
        language: 'Go',
        code: `func producer() <-chan string {
    ch := make(chan string)
    go func() {
        defer close(ch)
        for _, value := range []string{"a", "b"} { ch <- value }
    }()
    return ch
}

for value := range producer() {
    fmt.Println(value)
}

value, ok := <-producer()
fmt.Println(value, ok)`,
        output: `a
b
a true

生产者持有写端并 defer close。
消费者只拿只读端，range 读到关闭后结束。`,
      }],
      ['向已关闭发送会崩', 'close 之后执行 ch <- v 立即触发 panic: send on closed channel，该 panic 只能在同一 goroutine 内被 recover，跨 goroutine 无法拦截。同理 close 一个已关闭的 channel 或 nil channel 也 panic。close 的语义是广播「不会再有值」，不是发一条终止消息，终止意图应交给单独的信号通道或 context。', '关闭是广播不是消息', {
        title: 'Go：向已关闭 channel 发送会 panic',
        language: 'Go',
        code: `ch := make(chan int)
close(ch)
func() {
    defer func() {
        fmt.Println("recovered", recover())
    }()
    ch <- 1
}()
tryReceive := func() { _, ok := <-ch; fmt.Println("recv", ok) }
tryReceive()`,
        output: `recovered send on closed channel
recv false

关闭后发送立即 panic。
接收仍可继续返回零值与 false，直到缓冲数据读完。`,
      }],
    ],
  },
  {
    name: goG2Name('select、超时和关闭协议'),
    track,
    minutes: 40,
    prerequisite: '能编写向 channel 收发的并发函数，理解 goroutine 泄漏的成因，知道如何用 pprof 查看阻塞栈。',
    goal: '掌握 select 的随机分支、default 非阻塞与 time.After 超时模式的实现细节，能设计多接收者的关闭广播协议，并用 nil channel 动态停用分支而不改动 select 结构。',
    guidedPractice: '实现一个同时监听数据 channel 与超时 channel 的消费者，故意让两个 case 同时就绪多次运行观察分支选择，再用 time.NewTimer 配 Reset 改写高频循环里的 time.After，输出两者定时器数量差异。',
    independentPractice: '为多 worker 服务设计 close(done) 广播退出协议：主流程关闭 done，每个 worker 用 select 监听 done 与任务 channel，收尾后再把数据源 channel 置 nil 收敛循环，用 pprof 验证无残留。',
    commonErrors: ['在循环里每次迭代调用 time.After 设置超时，未到期的定时器持续堆积，长运行服务的内存与调度压力随时间持续上涨。', '向退出信号 channel 发送一个值来通知多个 worker 结束，实际只有一个接收者拿到值，其余 worker 依旧阻塞在各自的 select 上。'],
    sourceRefs: ['Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns', 'Go Memory Model. https://go.dev/ref/mem'],
    steps: [
      ['随机分支防饿死', '当 select 的多个 case 同时就绪时，runtime 用伪随机均匀选择一个执行，避免写在前面的 case 每次都被抢走而饿死后面的分支。没有 default 且所有 case 都不就绪时 select 阻塞等待；语法上 select 必须至少有一个 case 或 default，空 select 会永久阻塞，有时被用来模拟永远等待。', '随机选路保公平', {
        title: 'Go：同时就绪的 select 随机选择',
        language: 'Go',
        code: `a := make(chan int, 1)
b := make(chan int, 1)
counts := map[string]int{}
for i := 0; i < 100; i++ {
    a <- 1
    b <- 2
    select {
    case <-a:
        counts["a"]++
    case <-b:
        counts["b"]++
    }
}
fmt.Println(counts)`,
        output: `map[a:47 b:53]

两个 case 同时就绪时 runtime 随机选择。
随机分支避免固定顺序造成饥饿。`,
      }],
      ['default 非阻塞探测', '带 default 的 select 是非阻塞探测：所有 case 不就绪时立即走 default 分支，等价于 try-send 或 try-recv。常见做法是探测失败后返回自定的 ErrWouldBlock，或短暂休眠后重试；但热路径上把 select 加 default 写成忙轮询会烧满一个核，需要指数退避或直接改回阻塞版本。', '非阻塞立即返回', {
        title: 'Go：select default 非阻塞探测',
        language: 'Go',
        code: `ch := make(chan int, 1)
trySend := func(value int) bool {
    select {
    case ch <- value:
        return true
    default:
        return false
    }
}
fmt.Println(trySend(1), trySend(2), len(ch))
fmt.Println(<-ch, len(ch))`,
        output: `true false 1
1 0

第一次发送成功，第二次缓冲满立即走 default。
非阻塞探测不会等待通道腾出空间。`,
      }],
      ['time.After 超时', 'select 里并列一个 case <-time.After(d) 是标准超时写法：time.After 返回 <-chan time.Time，底层 runtime 定时器到期后向它发送一个值。注意每次执行 time.After 都会新建定时器，未到期前不会被回收，在循环里反复调用会堆积大量待触发定时器；高频场景应改用 time.NewTimer 并复用 Reset。', '超时是一次性定时器', {
        title: 'Go：select 超时与 Timer.Reset',
        language: 'Go',
        code: `timer := time.NewTimer(time.Second)
defer timer.Stop()
for i := 0; i < 3; i++ {
    if !timer.Stop() {
        select { case <-timer.C: default: }
    }
    timer.Reset(50 * time.Millisecond)
    select {
    case value := <-make(chan int):
        fmt.Println(value)
    case <-timer.C:
        fmt.Println("timeout", i)
    }
}`,
        output: `timeout 0
timeout 1
timeout 2

每次循环复用 Timer，先 Stop 再清空旧信号。
相较每轮 time.After，没有堆积未到期定时器。`,
      }],
      ['多路关闭协议', '向多个接收者广播退出要用 close 而不是发值：done := make(chan struct{}) 后 close(done)，所有执行 case <-done 的 goroutine 同时解锁，因为关闭会让每个等待的接收者立即拿到零值。若改成向 done 发送一个值，只有一个接收者能取到，其余仍卡在原地。struct{} 是零尺寸类型，不占额外内存。', 'close 才是广播', {
        title: 'Go：close 广播多个 worker 退出',
        language: 'Go',
        code: `done := make(chan struct{})
var wg sync.WaitGroup
for i := 0; i < 3; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        <-done
        fmt.Println("stop", id)
    }(i)
}
time.Sleep(10 * time.Millisecond)
close(done)
wg.Wait()`,
        output: `stop 2
stop 0
stop 1

close 让三个 worker 的接收同时可继续。
发送一个值只能唤醒一个接收者。`,
      }],
      ['置 nil 停用分支', '对 nil channel 的发送和接收都永久阻塞，利用这一点可以在不改变 select 结构的情况下停用分支：生产者结束后把 ch 置为 nil，对应 case 就永远不就绪，循环其余分支照常工作。典型形态是两个数据源先后处理完毕各自置 nil，select 里只剩 done 分支可命中，随后自然退出循环。', 'nil 哑化不删除', {
        title: 'Go：nil channel 停用 select 分支',
        language: 'Go',
        code: `a := make(chan int, 1)
b := make(chan int, 1)
a <- 1
b <- 2
done := make(chan struct{})
go func() { time.Sleep(20 * time.Millisecond); close(done) }()
for a != nil || b != nil {
    select {
    case v := <-a:
        fmt.Println("a", v); a = nil
    case v := <-b:
        fmt.Println("b", v); b = nil
    case <-done:
        return
    }
}`,
        output: `a 1
b 2

每个源读完后置 nil，对应 case 永久阻塞。
循环无需改 select 结构即可收敛。`,
      }],
    ],
  },
  {
    name: goG2Name('sync、atomic 与内存模型'),
    track,
    minutes: 38,
    prerequisite: '熟悉 channel 与 select 的基本用法，见过共享变量在多 goroutine 下产生错误结果的现象。',
    goal: '掌握 Mutex 与 RWMutex 的适用场景和锁粒度取舍、WaitGroup 的配对纪律、atomic 的 CAS 语义与适用边界，并能用 happens-before 解释 channel 与锁建立的可见性保证。',
    guidedPractice: '实现读多写少配置表的两个版本（Mutex 与 RWMutex）并压测对比吞吐，再写一个把 wg.Add 挪进 goroutine 内部的反例复现 panic，记录两条基准数据与崩溃栈。',
    independentPractice: '把一个包含计数器与状态标志的结构分别用 Mutex 和 atomic 改写，对比 go test -bench 结果；再写一段无同步原语的双 goroutine 交错写示例，在 race 模式下验证可见性问题的报告。',
    commonErrors: ['把 wg.Add(1) 写进 goroutine 内部第一行，Add 与 Wait 并发竞争导致计数为负的 panic，或 Done 未用 defer 修饰而 panic 路径漏调用。', '用 atomic 保证两个字段联动的复合不变量，单个操作各自原子但组合不原子，并发下出现字段错配的中间状态。'],
    sourceRefs: ['Go Memory Model. https://go.dev/ref/mem', 'Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns'],
    steps: [
      ['Mutex 与锁粒度', 'sync.Mutex 互斥，sync.RWMutex 允许多个 RLock 并发、与写锁互斥，适合读多写少的 map 或配置表。Lock 与 Unlock 必须配对，惯用 defer mu.Unlock() 保证所有 return 路径都解锁。粒度上锁应保护具体共享数据而不是包住整个函数：粒度过粗把并发退化成串行，粒度过细则必须固定加锁顺序以防死锁。', '粒度在共享点收窄', {
        title: 'Go：RWMutex 保护配置表',
        language: 'Go',
        code: `type Config struct {
    mu sync.RWMutex
    values map[string]string
}
func (c *Config) Get(key string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.values[key]
}
func (c *Config) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.values[key] = value
}

config := &Config{values: map[string]string{}}
config.Set("mode", "prod")
fmt.Println(config.Get("mode"))`,
        output: `prod

RLock 允许多个并发读取，写锁独占。
defer Unlock 覆盖所有返回路径。`,
      }],
      ['WaitGroup 配对纪律', 'WaitGroup 的 Add 必须在 go 语句之前调用：若放进 goroutine 内部，Add 可能与 Wait 并发运行，出现计数变负的 panic；Done 用 defer wg.Done() 修饰，保证 panic 路径也会执行。Wait 阻塞到计数归零返回。复用同一个 WaitGroup 开启新一轮时，必须等上一轮 Wait 彻底返回后再 Add，否则计数混乱。', '计数增减必须配对', {
        title: 'Go：WaitGroup Add 放在 go 前',
        language: 'Go',
        code: `var wg sync.WaitGroup
for i := 0; i < 3; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        fmt.Println("work", id)
    }(i)
}
wg.Wait()
fmt.Println("all done")`,
        output: `work 2
work 0
work 1
all done

Add 在启动前完成，Wait 不会与 Add 竞争。
defer Done 保证正常和异常路径都减计数。`,
      }],
      ['atomic CAS 语义', 'atomic 包提供 CompareAndSwap(addr, old, new)：仅当当前值等于 old 时原子写入 new 并返回 true，失败返回 false 由调用方循环重试，这是无锁数据结构的核心循环。Load/Store/Add/Swap 都是单个机器字长度的原子操作，适合计数器、状态标志和指针发布；涉及两个字段联动的复合不变量 CAS 管不住。', 'CAS 只护一个字', {
        title: 'Go：原子计数器与 CAS',
        language: 'Go',
        code: `var counter atomic.Int64
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        counter.Add(1)
    }()
}
wg.Wait()
fmt.Println(counter.Load())

var state atomic.Int32
ok := state.CompareAndSwap(0, 1)
fmt.Println(ok, state.Load(), state.CompareAndSwap(0, 2))`,
        output: `100
true 1 false

Add/Load 对单个值原子更新。
CAS 只有当前值匹配时才写入。`,
      }],
      ['内存模型与可见性', 'Go 内存模型用 happens-before 定义可见性：channel 的发送 happens-before 对应的接收完成，Mutex 的 Unlock happens-before 后续的 Lock，启动一个 goroutine happens-before 它内部第一条语句。没有这些同步点时，编译器与 CPU 可以重排读写，另一个 goroutine 可能读到旧值，或看到与源码写序不一致的中间状态。', '无同步就无可见性', {
        title: 'Go：channel 建立可见性',
        language: 'Go',
        code: `type Result struct { value int }
ch := make(chan Result)
go func() {
    result := Result{value: 42}
    ch <- result
}()
result := <-ch
fmt.Println(result.value)

// 去掉 channel 改成共享变量并 sleep，无法建立保证
// go test -race 会报告数据竞争。`,
        output: `42

发送发生在对应接收之前，result 写入对主 goroutine 可见。
没有同步原语的共享读写只能靠运气。`,
      }],
      ['同步工具选型边界', '选型按被保护数据的形状决定：单一计数或标志用 atomic，省去调度介入，吞吐比锁高一个量级；多个字段组成不变量（如 map 与其长度）必须用 Mutex 包住整个临界区；在 goroutine 间移交数据所有权时用 channel，让同一时刻只有一个持有者。工具形状选错，race detector 会直接指出错配位置。', '按不变量选同步工具', {
        title: 'Go：atomic、Mutex、channel 选型',
        language: 'Go',
        code: `var hits atomic.Int64
hits.Add(1)

type Account struct {
    mu sync.Mutex
    balance int
    version int
}
func (a *Account) Update(delta int) {
    a.mu.Lock()
    defer a.mu.Unlock()
    a.balance += delta
    a.version++
}

jobs := make(chan int)
go func() { jobs <- 1; close(jobs) }()
fmt.Println(hits.Load(), <-jobs)`,
        output: `1 1

单计数用 atomic。
balance 与 version 的复合不变量用同一把锁。
任务所有权通过 channel 移交。`,
      }],
    ],
  },
  {
    name: goG2Name('errgroup、并发上限和取消传播'),
    track,
    minutes: 40,
    prerequisite: '掌握 WaitGroup 与 context 的基本用法，能在测试里启动多个 goroutine 并等待它们全部退出。',
    goal: '会用 errgroup 收集首个错误并联动 context 取消，用 SetLimit 限制并发度，并能手工用缓冲 channel 实现信号量与 worker pool，理清取消传播到哪些代码、以及取消不等于 Wait 返回。',
    guidedPractice: '用 errgroup.WithContext 并发抓取一组 URL，其中一个故意返回错误，观察其余请求因 ctx 取消而提前退出；再对比 SetLimit(4) 前后的实际并发数输出，记录首错与取消的时间线。',
    independentPractice: '不借助 errgroup，手工实现带信号量的 worker pool：jobs channel 分发任务、固定 N 个 worker 用 for range 消费、close(jobs) 收尾，并为每个下游调用传入 ctx，写测试验证取消后所有 worker 退出。',
    commonErrors: ['在 errgroup.WithContext 之后又把返回的 ctx 传给与 group 无关的长任务，取消信号无法到达该任务，它无视取消继续运行到底。', '以为 cancel 之后 Wait 会立即返回，实际 Wait 仍要等所有 goroutine 真正 return，忽略这一点会把取消当作同步完成处理。'],
    sourceRefs: ['errgroup Documentation. https://pkg.go.dev/golang.org/x/sync/errgroup', 'Go Blog: Go Concurrency Patterns. https://go.dev/blog/concurrency-patterns'],
    steps: [
      ['g.Go 与首个错误', 'errgroup.Group 在 WaitGroup 之上补齐错误传递：g.Go(fn) 启动 fn 并登记计数，fn 返回的第一个非 nil 错误被 group 记录，后续错误被丢弃，Wait 阻塞到全部 goroutine 结束后返回该错误。裸 WaitGroup 只能等待、不能带回失败原因，「任一失败即整体失败」的语义靠 errgroup 一处收口。', '等完还要带回错误', {
        title: 'errgroup：等待并返回首个错误',
        language: 'Go',
        code: `var g errgroup.Group
g.Go(func() error { return fmt.Errorf("first") })
g.Go(func() error {
    time.Sleep(10 * time.Millisecond)
    return fmt.Errorf("second")
})
if err := g.Wait(); err != nil { fmt.Println(err) }`,
        output: `first

g.Wait 等所有任务结束后返回第一个非 nil 错误。
后续错误不会覆盖首错。`,
      }],
      ['上下文联动取消', 'errgroup.WithContext(ctx) 返回派生 context 与 group：任一子任务出错时 group 内部立即调用 cancel，其余任务通过 ctx.Done() 感知并尽快退出；即使没有出错，Wait 返回时 context 也会被取消。返回的 cancel 由 group 内部管理，静态检查会拦截被丢弃的 cancel，外部若还要用 ctx 需自行保存引用。', '首错即取消全家', {
        title: 'errgroup.WithContext：首错取消其他任务',
        language: 'Go',
        code: `g, ctx := errgroup.WithContext(context.Background())
g.Go(func() error { return errors.New("stop") })
g.Go(func() error {
    select {
    case <-ctx.Done():
        fmt.Println("cancelled")
        return ctx.Err()
    case <-time.After(time.Second):
        return nil
    }
})
fmt.Println(g.Wait())`,
        output: `cancelled
stop

首个错误触发内部 cancel。
另一个任务通过 ctx.Done 提前退出，Wait 返回首错。`,
      }],
      ['SetLimit 有界并发', 'g.SetLimit(n)（Go 1.19 起提供）为 group 设定并发上限：内部用一把容量为 n 的信号量，g.Go 在拿不到名额时阻塞，多出的任务在提交点排队而不是同时运行。限制要放在任务提交层——goroutine 数不等于并发 IO 数。与手工信号量方案相比，它省去 acquire 与 release 的成对维护。', '限流拦在提交口', {
        title: 'errgroup：SetLimit 限制并发',
        language: 'Go',
        code: `var g errgroup.Group
g.SetLimit(2)
var active atomic.Int32
for i := 0; i < 6; i++ {
    g.Go(func() error {
        current := active.Add(1)
        fmt.Println("active", current)
        time.Sleep(20 * time.Millisecond)
        active.Add(-1)
        return nil
    })
}
fmt.Println(g.Wait())`,
        output: `active 1
active 2
active 2
active 2
active 2
active 1
<nil>

任意时刻最多两个任务运行，其余在提交点等待名额。`,
      }],
      ['手工 worker pool', '手工 worker pool 的骨架：jobs := make(chan Job) 作为任务入口，启动 N 个固定 worker 执行 for job := range jobs，全部任务提交完成后 close(jobs) 让 range 自然结束、worker 退出。另一形态用缓冲 channel 当信号量：sem := make(chan struct{}, n)，提交前 sem <- struct{}{} 占坑，完成后 <-sem 释放名额。', '信号量用缓冲通道', {
        title: 'Go：jobs channel 实现 worker pool',
        language: 'Go',
        code: `jobs := make(chan int)
results := make(chan int, 10)
var wg sync.WaitGroup
for worker := 0; worker < 3; worker++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        for job := range jobs { results <- job * 2 }
    }()
}
go func() {
    for i := 1; i <= 6; i++ { jobs <- i }
    close(jobs)
}()
wg.Wait()
close(results)
for result := range results { fmt.Println(result) }`,
        output: `2
4
6
8
10
12

三个固定 worker 消费 jobs，close 后 range 退出。
关闭 results 由等待全部 worker 的一方负责。`,
      }],
      ['取消传播的边界', '取消是协作式的：只有显式检查 ctx.Done()、在 select 里并列 ctx 分支、或把 ctx 传给下游（如 http.NewRequestWithContext、数据库的 QueryContext）的代码才会响应取消；纯 CPU 计算不看 ctx 就无法中断。另外 cancel 只是发出信号，Wait 仍要等所有 goroutine 真正 return 才返回，取消不等于立即完成。', '取消靠协作不靠强杀', {
        title: 'Go：取消传播需要下游配合',
        language: 'Go',
        code: `ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
defer cancel()
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error {
    req, _ := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:8099/slow", nil)
    _, err := http.DefaultClient.Do(req)
    return err
})
fmt.Println(g.Wait())`,
        output: `Get "http://127.0.0.1:8099/slow": context deadline exceeded

HTTP 请求通过 NewRequestWithContext 响应取消。
纯 CPU 循环若不检查 ctx，会继续跑到结束。`,
      }],
    ],
  },
  {
    name: goG2Name('并发任务与竞态回归实验'),
    track,
    minutes: 42,
    prerequisite: '完成本阶段前五课的并发练习，熟悉 go test 的运行方式与常用标志，能读写基准测试函数。',
    goal: '理解 go test -race 基于 happens-before 追踪的实现原理与采样边界，亲手复现无锁计数器的丢失更新，对比 mutex、atomic、channel 三种修法的语义与吞吐差异，并把 race 检测接入 CI 门禁。',
    guidedPractice: '写一个 100 个 goroutine 各自累加 1000 次的计数器实验，分别在普通模式与 -race 模式下运行，摘录 DATA RACE 报告的两处访问栈和最终计数值，作为本课的竞态证据材料。',
    independentPractice: '把计数器实验分别用 mutex 与 atomic 修复，用 go test -bench 对比吞吐并写成结论表格；再为仓库新增独立的 CI 步骤跑 go test -race ./...，本地验证插桩下内存与耗时开销并记录数值。',
    commonErrors: ['去掉 -race 后程序结果正确就认定无竞态，race 检测只覆盖实际执行到的路径，未触发的调度交错随时可能在线上爆出。', '把 -race 直接塞进原有测试 job 与全量用例混跑，插桩带来的数倍内存与 CPU 开销拖垮流水线资源配额。'],
    sourceRefs: ['Go Blog: Introducing the Go Race Detector. https://go.dev/blog/race-detector', 'Go Memory Model. https://go.dev/ref/mem'],
    steps: [
      ['竞态检测器的原理', 'go test -race 在编译期开启 ThreadSanitizer 插桩：每次内存读写都记录访问线程与向量时钟（happens-before 时钟），当某次访问与此前的相反访问没有同步关系交错时输出 DATA RACE 报告，附两处访问的完整栈。它检测的是实际执行到的路径而非静态证明，没跑到的分支不会报；插桩使内存与 CPU 开销增加数倍。', '插桩追踪向量时钟', {
        title: 'race：读取两段冲突访问栈',
        language: 'PowerShell',
        code: `go test -race -run TestCounter -count=1 . > race.txt 2>&1
Select-String -Path race.txt -Pattern "WARNING: DATA RACE|Write at|Previous write|Goroutine" -Context 0,3
Get-Content race.txt | Select-Object -First 80
Write-Output "exit=$LASTEXITCODE"`,
        output: `WARNING: DATA RACE
Write at 0x... by goroutine 12:
  demo.main.func1()
      main.go:8 +0x...
Previous write at 0x... by goroutine 11:
  demo.main.func1()
      main.go:8 +0x...
exit=1

两段栈都指向 counter++ 所在行。
goroutine 创建栈可继续定位启动位置。`,
      }],
      ['无锁计数器复现', '实验：启动 100 个 goroutine，每个对同一个 int 执行 1000 次 i++，WaitGroup 等待后打印结果。加 -race 必报 DATA RACE 并指出读与写各自的栈；最终计数几乎总是小于 100000，因为 i++ 是读、改、写三步，两个 goroutine 读到同一旧值时更新丢失。去掉 -race 结果仍可能错误，只是没被采样发现。', '自增不是原子操作', {
        title: 'Go：复现无锁计数器丢失更新',
        language: 'Go',
        code: `counter := 0
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        for j := 0; j < 1000; j++ { counter++ }
    }()
}
wg.Wait()
fmt.Println(counter)`,
        output: `$ go run main.go
98273
$ go run -race main.go
WARNING: DATA RACE
Read at ... main.go:8
Previous write at ... main.go:8
Found 1 data race(s)

最终值小于 100000，说明多个 goroutine 读到同一旧值。
race 报告同一行的读写冲突。`,
      }],
      ['mutex 修法', 'mutex 修法是 mu.Lock(); i++; mu.Unlock()，结果精确到 100000。代价在锁竞争：goroutine 数量多时大量时间耗在 Lock 排队与调度切换上，go test -bench 可见吞吐明显下降。它的优势是临界区可以包含多条语句和多个变量的联动更新，需要复合不变量时只能选它而不是原子操作。', '锁换正确性耗吞吐', {
        title: 'Go：mutex 修复计数与复合状态',
        language: 'Go',
        code: `type Counter struct {
    mu sync.Mutex
    value int
    version int
}
func (c *Counter) Add() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
    c.version++
}

var c Counter
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); for j := 0; j < 1000; j++ { c.Add() } }()
}
wg.Wait()
fmt.Println(c.value, c.version)`,
        output: `100000 100000

同一临界区保护 value 与 version。
两个字段的复合不变量保持一致。`,
      }],
      ['atomic 修法', 'atomic 修法把 i 改成 int64 并用 atomic.AddInt64(&i, 1)，x86 上最终落到 LOCK XADD 一条指令，无锁也无 goroutine 切换，吞吐远高于 mutex 方案。边界是它只保护这一个变量：一旦计数器要与 map、长度等其他状态联动，atomic 无法维持复合不变量，必须退回互斥锁包住临界区。', '单变量首选原子操作', {
        title: 'Go：atomic 修复单计数',
        language: 'Go',
        code: `var counter atomic.Int64
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        for j := 0; j < 1000; j++ { counter.Add(1) }
    }()
}
wg.Wait()
fmt.Println(counter.Load())`,
        output: `100000

atomic.Add 只保护一个机器字。
需要同时更新 value 与 version 时必须使用同一把锁。`,
      }],
      ['channel 修法与 CI', 'channel 修法启动一个唯一的 owner goroutine 持有计数器，其余 goroutine 通过请求 channel 发送加法请求，共享变量只剩一个访问者，从根上消除竞态。CI 接入：在流水线单独加一个 job 跑 go test -race ./...，因插桩开销大（内存与 CPU 数倍）不与普通 job 混跑；合入前 race 报错即阻断。', 'race 设为门禁', {
        title: 'GitHub Actions：单 goroutine owner 与 race 门禁',
        language: 'YAML',
        code: `jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.23" }
      - run: go test ./...
  race:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.23" }
      - run: go test -race -count=1 ./...`,
        output: `test job: ok demo/... 1.2s
race job: WARNING: DATA RACE
race job failed and blocked merge

owner goroutine 独占计数器，请求经 channel 串行处理。
普通测试与 race 插桩测试分 job 运行，race 失败阻断合并。`,
      }],
    ],
  },
];

// ── G3 GMP、GC、内存与运行时诊断 ─────────────────────────────────────────────
const goG3Stage = 'GMP、GC、内存与运行时诊断';
const goG3Name = (topic: string) => `Go · ${goG3Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG3Name('GMP 调度器和抢占'),
    track,
    minutes: 38,
    prerequisite: '已掌握 goroutine 与 channel 的基本用法，能独立编写并发程序。',
    goal: '能画出 G、M、P 三级结构并解释 work stealing 与 sysmon 的协作，说清 1.14 异步抢占解决了哪一类饿死问题。',
    guidedPractice: '运行 GODEBUG=schedtrace=1000 观察 P 本地队列与全局队列变化，画出 G/M/P 协作图并标注一次 work stealing 的完整路径。',
    independentPractice: '写一个不含函数调用的 for 死循环程序，分别在 1.13 与 1.14 语义下推理其余 G 的表现，产物为推理记录加一份验证用小程序。',
    commonErrors: ['把 GOMAXPROCS 等同于线程数上限，忽略 M 数量会因阻塞系统调用而多于 P。', '在死循环里手动加 runtime.Gosched 当成抢占机制，没意识到 1.14 起信号抢占已自动覆盖该场景。'],
    sourceRefs: ['Go Blog: Go execution tracer. https://go.dev/blog/execution-tracer', 'pprof Documentation. https://pkg.go.dev/net/http/pprof'],
    steps: [
      ['GMP 三级结构', 'G 是 goroutine 的执行体，自带栈、状态和调度元数据；M 是内核线程，真正执行代码；P 是逻辑处理器，持有本地运行队列，M 必须持有一个 P 才能运行 G。GOMAXPROCS 决定 P 的数量，也就决定了同一时刻执行 Go 代码的并发上限。', 'M 绑 P 才执行 G', {
        title: 'Go：输出 GOMAXPROCS 与调度状态',
        language: 'PowerShell',
        code: `go run scheduler.go
$env:GODEBUG="schedtrace=1000"
go run scheduler.go
go tool trace -http=127.0.0.1:8081 trace.out`,
        output: `GOMAXPROCS=8 CPUs=8
SCHED 1000ms: gomaxprocs=8 idleprocs=0 threads=11 spinningthreads=1
SCHED 2000ms: gomaxprocs=8 idleprocs=2 threads=11 runqueue=3 [1 0 2 ...]

P 数量等于 GOMAXPROCS。
M 线程数可高于 P，因为阻塞系统调用需要额外线程。`,
      }],
      ['本地队列与调度点', '新建 G 先进入当前 P 的本地队列，容量 256，满员时把一半移入全局队列；P 还会在周期性检查、阻塞前后等调度点去全局队列和网络轮询器取 G。channel 收发、锁竞争、函数序言的栈检查都是让出 CPU 的时机，阻塞点即让出点。', '阻塞点就是调度点', {
        title: 'Go：观察本地队列与调度点',
        language: 'Go',
        code: `runtime.GOMAXPROCS(2)
for i := 0; i < 1000; i++ {
    go func(id int) {
        time.Sleep(time.Duration(id%10) * time.Millisecond)
    }(i)
}
time.Sleep(100 * time.Millisecond)
fmt.Println(runtime.NumGoroutine())`,
        output: `SCHED 0ms: gomaxprocs=2 idleprocs=0 threads=6 runqueue=498
SCHED 1000ms: gomaxprocs=2 idleprocs=2 threads=6 runqueue=0
1

新 G 先进入本地/全局运行队列，sleep 时让出 P。
队列清空后 worker 退出，最终只剩 main。`,
      }],
      ['work stealing', '当某个 P 的本地队列空了，它先查全局队列，再查网络轮询器，都拿不到就随机选一个受害者 P，从其本地队列队尾偷走一半 G。偷一半而不是拿一个，是为了让负载快速摊平；偷不到时 P 自旋一小段时间再睡眠，避免频繁唤醒线程。', '偷一半摊平负载', {
        title: 'go tool trace：观察 work stealing 负载',
        language: 'PowerShell',
        code: `$env:GODEBUG="schedtrace=1000,scheddetail=1"
go run workload.go 2> sched.log
go tool trace -http=127.0.0.1:8081 trace.out
Select-String sched.log -Pattern "runqueue|steal|idleprocs" | Select-Object -First 20`,
        output: `P0 runqueue=128
P1 runqueue=0
P1 steal from P0 half=64
P0 runqueue=64 P1 runqueue=64

空队列 P 从繁忙 P 偷走约一半 G。
负载摊平后两个 P 并行消费本地队列。`,
      }],
      ['sysmon 与系统调用', 'sysmon 是不需要 P 就能独立运行的监控线程，以 20us 到 10ms 的间隔轮询。它发现某次系统调用超过 10ms 后，会把 M 与 P 解绑：P 交给空闲或新建的 M 继续跑队列里的 G，原 M 阻塞在系统调用上，避免一个慢调用占住一个 P 拖垮并行度。', '解绑换 M 不堵 P', {
        title: 'Go：阻塞系统调用不堵住 P',
        language: 'Go',
        code: `runtime.GOMAXPROCS(2)
go func() {
    time.Sleep(200 * time.Millisecond) // 模拟阻塞系统调用
}()
start := time.Now()
var wg sync.WaitGroup
for i := 0; i < 4; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); time.Sleep(20 * time.Millisecond) }()
}
wg.Wait()
fmt.Println(time.Since(start))`,
        output: `40ms

阻塞 sleep 占用一个任务等待，但不持续占 P。
其余 G 在 P 上继续运行，总耗时接近 40ms。`,
      }],
      ['基于信号的异步抢占', '1.14 之前，不含函数调用的 for 死循环没有任何调度点，一个 G 能饿死同 P 上的其他 G。1.14 起 sysmon 发现 G 连续运行超过约 10ms，就向对应 M 发 SIGURG 信号，信号处理函数把 G 标记为待抢占，G 在下一个安全点保存现场让出 CPU。', '信号抢占治饿死', {
        title: 'Go：死循环中的异步抢占',
        language: 'Go',
        code: `runtime.GOMAXPROCS(1)
done := make(chan struct{})
go func() {
    for {
        // 1.14+ 异步抢占会在安全点切走
    }
}()
go func() { close(done) }()
select {
case <-done:
    fmt.Println("other goroutine ran")
case <-time.After(time.Second):
    fmt.Println("starved")
}`,
        output: `other goroutine ran

无函数调用的循环仍会被 sysmon 信号抢占。
另一个 goroutine 在 1 秒内获得运行机会。`,
      }],
    ],
  },
  {
    name: goG3Name('栈增长、逃逸分析与对象分配'),
    track,
    minutes: 38,
    prerequisite: '了解 Go 编译流程，会使用 go build 与 go test 的基本命令。',
    goal: '能解释 goroutine 栈从 2KB 按需扩容的机制，用 -gcflags=-m 的输出作为证据判断对象分配在栈还是堆，并知道减少逃逸的写法及其适用边界。',
    guidedPractice: '对一份包含返回指针、闭包、interface 装箱的示例代码运行 go build -gcflags=-m，逐行核对每处 escapes to heap 与括号内的原因，产物为标注版编译输出。',
    independentPractice: '挑一个自己项目里分配密集的函数，先编译取证再改写减少逃逸，用 benchmark 加 -benchmem 对比改写前后的 allocs/op，产物为对比数据表。',
    commonErrors: ['看到 escapes to heap 就想全部消除，忽略非热点路径上的堆分配根本无感。', '以为 -gcflags=-m 对所有依赖包生效，实际它只作用于命令行列出的包，漏看其他包的逃逸。'],
    sourceRefs: ['Go GC Guide. https://go.dev/doc/gc-guide', 'pprof Documentation. https://pkg.go.dev/net/http/pprof'],
    steps: [
      ['栈 2KB 起步', '新建 goroutine 的栈只有 2KB（runtime 中的 _StackMin），对比线程默认动辄 1MB 到 8MB，这是 Go 能轻松开几十万 goroutine 的前提。栈随 G 分配在 g 结构上，创建销毁成本接近一次函数调用，调度切换也只需换寄存器和栈指针。', '小栈撑起海量 G', {
        title: 'Go：观察大量 goroutine 的栈成本',
        language: 'Go',
        code: `var m runtime.MemStats
runtime.ReadMemStats(&m)
before := m.StackInuse
for i := 0; i < 100000; i++ {
    go func() { <-time.After(time.Minute) }()
}
time.Sleep(100 * time.Millisecond)
runtime.ReadMemStats(&m)
fmt.Println("goroutines", runtime.NumGoroutine())
fmt.Println("stack-before", before, "after", m.StackInuse)`,
        output: `goroutines 100001
stack-before 327680 after 246415360

十万 goroutine 的栈总占用约 235 MiB。
单栈初始很小，但海量 G 仍会累积可观内存。`,
      }],
      ['栈扩容与复制', '编译器在函数序言插入栈检查：剩余栈不够时跳到 morestack 分配两倍大小的新栈，把旧栈整段复制过去，并修正所有指向旧栈的指针——这一步能成立是因为栈上指针的位置编译期全部可知。连续扩容带来复制开销，深层递归或超大局部变量会反复触发。', '扩容翻倍搬指针', {
        title: 'Go：递归触发栈增长',
        language: 'Go',
        code: `func depth(n int) int {
    var local [512]byte
    local[0] = byte(n)
    if n == 0 { return int(local[0]) }
    return depth(n-1) + 1
}

fmt.Println(depth(10000))
debug.SetTraceback("system")`,
        output: `10000

递归层数增加时 runtime 分配更大栈并复制旧栈。
指向栈对象的指针会被同步修正，程序语义不变。`,
      }],
      ['逃逸分析判定', '逃逸分析在编译期判定对象生命周期：取局部变量地址返回、赋给 interface、闭包捕获、大小不定或超过栈上限的对象都会逃逸到堆，其余留在栈上随函数返回自动回收。堆分配要走内存分配器和后续 GC，栈分配只是移动栈指针，两者成本差一个量级。', '生命周期定去留', {
        title: 'Go：比较栈对象与逃逸对象',
        language: 'Go',
        code: `type Point struct{ X, Y int }

func byValue() Point { return Point{1, 2} }
func byPointer() *Point { p := Point{1, 2}; return &p }
func boxed() any { p := Point{1, 2}; return p }

fmt.Println(byValue(), *byPointer(), boxed())
// go build -gcflags=-m ./...`,
        output: `{1 2} {1 2} {1 2}
./main.go:5:9: moved to heap: p
./main.go:6:9: p escapes to heap

返回值对象可留在栈上，返回地址或装箱会逃逸。
堆对象后续需要 GC，栈对象随函数返回直接回收。`,
      }],
      ['-gcflags=-m 取证', 'go build -gcflags=-m 会打印每个变量的判定：escapes to heap 表示逃逸，括号里给出原因，例如 moved to heap: x 或 leaking param。加 -l 关闭内联可以让结果更稳定。逐行对照源码核对每处逃逸，是判断优化是否生效的唯一证据，猜测不算数。', '用 -m 拿证据', {
        title: 'PowerShell：采集逃逸分析报告',
        language: 'PowerShell',
        code: `go build -gcflags="-m -m -l" ./... > escape.txt 2>&1
Select-String escape.txt -Pattern "escapes to heap|moved to heap|leaking param|cannot inline" -Context 0,1
go build -gcflags="-S" ./... > asm.txt 2>&1
Select-String asm.txt -Pattern "mallocgc|runtime.newobject" | Select-Object -First 10`,
        output: `main.go:5:9: moved to heap: point
main.go:6:14: p escapes to heap
main.go:12:17: leaking param: buf
asm: CALL runtime.newobject
asm: CALL runtime.mallocgc

-m -m 补出逃逸原因，-l 关闭内联减少干扰。
汇编中的 newobject/mallocgc 交叉证明堆分配。`,
      }],
      ['减逃逸写法与边界', '常见写法：返回值代替返回指针、预分配 slice 容量避免 append 重分配、避免把小对象装箱进 interface、用 sync.Pool 复用大 buffer。但为了消除逃逸把代码改得难读属于过度优化——先确认热点确实落在分配上，再动手改写。', '先测热点再优化', {
        title: 'Benchmark：预分配与 sync.Pool',
        language: 'Go',
        code: `var pool = sync.Pool{New: func() any { return make([]byte, 32*1024) }}

func withoutPool() []byte { return make([]byte, 32*1024) }
func withPool() []byte {
    buffer := pool.Get().([]byte)
    return buffer[:0]
}

func BenchmarkWithoutPool(b *testing.B) {
    for i := 0; i < b.N; i++ { _ = withoutPool() }
}
func BenchmarkWithPool(b *testing.B) {
    for i := 0; i < b.N; i++ { buffer := withPool(); pool.Put(buffer) }
}`,
        output: `BenchmarkWithoutPool-8   120000  9800 ns/op  32768 B/op  1 allocs/op
BenchmarkWithPool-8     3000000   420 ns/op      0 B/op  0 allocs/op

Pool 复用大 buffer，分配次数降为零。
但 Pool 可能在 GC 时清空，不能承载必须持久的状态。`,
      }],
    ],
  },
  {
    name: goG3Name('GC 标记、写屏障和 GOGC'),
    track,
    minutes: 38,
    prerequisite: '知道垃圾回收的基本概念，已学完 GMP 调度器一课。',
    goal: '能推演三色标记清除的完整过程，解释写屏障为什么必须存在，会用 GOGC 与 GOMEMLIMIT 调节堆行为，并理解 GC 是低延迟而非零开销。',
    guidedPractice: '用 GODEBUG=gctrace=1 观察一个分配密集程序在 GOGC=50、100、300 三档下的 GC 频率与峰值堆，记录各档的 gctrace 输出并标注存活堆与触发堆。',
    independentPractice: '在容器或本地限制内存的场景配置 GOMEMLIMIT，观察逼近上限时 GC 行为的变化，产物为一份参数对照表加各自的 gctrace 证据。',
    commonErrors: ['把 GOGC 设为 off 又不配 GOMEMLIMIT，堆无节制增长直到被系统杀掉。', '以为 GOMEMLIMIT 是硬上限、超出必然退出，实际它只是软目标，超大对象仍可能突破。'],
    sourceRefs: ['Go GC Guide. https://go.dev/doc/gc-guide', 'pprof Documentation. https://pkg.go.dev/net/http/pprof'],
    steps: [
      ['三色标记清除', '三色抽象把对象分为白（未访问）、灰（已访问待扫描）、黑（已扫描完）。GC 从栈和全局变量等根对象出发，把可达对象逐层染灰再染黑，标记结束后仍是白色的对象不可达、被清除。整个流程只有标记开始和结束两个极短 STW 窗口，其余与用户程序并发。', '三色标记定回收', {
        title: 'Go：用 gctrace 观察标记与清扫',
        language: 'PowerShell',
        code: `$env:GODEBUG="gctrace=1"
go run allocator.go
go tool trace -http=127.0.0.1:8081 trace.out`,
        output: `gc 1 @0.012s 0%: 0.006+0.42+0.003 ms clock
gc 2 @0.118s 0%: 0.005+0.31+0.002 ms clock
gc 3 @0.201s 0%: 0.004+0.28+0.003 ms clock

每行显示 GC 触发时间、各阶段耗时与堆规模。
标记大部分与用户代码并发，STW 窗口很短。`,
      }],
      ['写屏障防漏标', '并发标记期间用户程序还在改引用：黑色对象若新增指向白色对象的指针而不处理，该白色对象会被漏标、误回收。Go 1.8 起的混合写屏障在指针写入时把新旧值都染灰，保证活跃对象不丢；代价是堆上每次指针赋值多几条指令，这是并发 GC 换来的固定开销。', '写屏障堵漏标', {
        title: 'PowerShell：查看写屏障相关符号',
        language: 'PowerShell',
        code: `go build -gcflags="-S" ./... > asm.txt 2>&1
Select-String asm.txt -Pattern "wb|writebarrier|gcWriteBarrier" | Select-Object -First 20
$env:GODEBUG="gctrace=1"
go test -run=^$ -bench=BenchmarkPointers -benchmem .`,
        output: `CALL runtime.gcWriteBarrier2
CALL runtime.gcWriteBarrier
BenchmarkPointers-8  100000  1040 ns/op  0 B/op  0 allocs/op

汇编显示指针写入触发写屏障调用。
屏障保证并发标记时活跃对象不会被漏扫。`,
      }],
      ['GOGC 堆增长控制', 'GOGC 控制下次 GC 的触发时机：默认 100 表示新堆增长到上次存活堆的 2 倍时触发。调大（如 300）GC 更少、CPU 省但峰值内存高；调小则 GC 频繁、内存低但 CPU 涨。用 GODEBUG=gctrace=1 能看到每次 GC 的时间、存活量和各阶段耗时。', 'GOGC 控堆节奏', {
        title: 'PowerShell：比较 GOGC 档位',
        language: 'PowerShell',
        code: `foreach ($gogc in 50, 100, 300) {
  $env:GOGC = "$gogc"
  $env:GODEBUG = "gctrace=1"
  go run allocator.go 2> "gc-$gogc.log"
  $count = (Select-String "gc-" "gc-$gogc.log" -Pattern "^gc ").Count
  Write-Output "GOGC=$gogc collections=$count"
}
Remove-Item Env:GOGC,Env:GODEBUG`,
        output: `GOGC=50 collections=48
GOGC=100 collections=24
GOGC=300 collections=8

GOGC 越低触发越频繁，堆峰值通常更低。
GOGC 越高 CPU 更省，但峰值内存上升。`,
      }],
      ['GOMEMLIMIT 软上限', 'GOMEMLIMIT 是 1.19 引入的软上限，覆盖堆、栈和 runtime 自身的全部内存。逼近上限时 GC 提前启动、更努力回收，但不保证一定不超——单个超大对象仍可能突破。它适合容器场景防 OOM Kill，常配合调大 GOGC 使用，注意给非堆内存留余量。', '软上限防 OOM', {
        title: 'PowerShell：配置 GOMEMLIMIT 并观察',
        language: 'PowerShell',
        code: `$env:GOMEMLIMIT = "700MiB"
$env:GOGC = "200"
$env:GODEBUG = "gctrace=1"
go run allocator.go 2> gc-limit.log
Select-String gc-limit.log -Pattern "^gc |goal" | Select-Object -Last 15
go run memory.go`,
        output: `gc 12 @8.2s 0%: ... 1024->812->620 MB
gc 13 @9.1s 0%: ... 980->790->610 MB
heap goal adjusted toward GOMEMLIMIT

接近软上限后 GC 提前并降低堆目标。
单次超大分配仍可能暂时突破上限。`,
      }],
      ['低延迟非零开销', 'Go 的 GC 目标是低延迟而非零开销：写屏障拖慢每一次堆指针赋值，GC 后台线程默认最多占用 25% CPU，标记过程还可能让缓存变冷。多数服务不需要调参；真要调，先测清瓶颈是 GC 频率、标记耗时还是分配速率，再决定动 GOGC 还是减少分配。', '低延迟仍有代价', {
        title: 'Go：同时采集 GC 与 CPU 指标',
        language: 'PowerShell',
        code: `$env:GODEBUG="gctrace=1"
go test -bench=. -benchmem -cpuprofile cpu.out -memprofile mem.out . > bench.txt 2> gc.log
go tool pprof -top cpu.out
go tool pprof -sample_index=alloc_space -top mem.out
Select-String gc.log -Pattern "^gc " | Select-Object -Last 10`,
        output: `gc 20 @5.1s 0%: ... 640->420->300 MB
cpu profile top: runtime.gcBgMarkWorker 18%
cpu profile top: orders.Parse 42%
alloc_space top: orders.Parse 38%

GC 后台占用可见，但主热点仍是业务解析与分配。
调 GOGC 之前先减少分配或优化解析。`,
      }],
    ],
  },
  {
    name: goG3Name('race、mutex、goroutine profile'),
    track,
    minutes: 38,
    prerequisite: '能在本地运行 go test 并阅读报告，了解 net/http/pprof 端点的暴露方式。',
    goal: '能说明 -race 的插桩原理与开销边界，用 mutex profile 定位锁竞争，用 goroutine profile 按数量趋势定位泄漏，并区分 pprof goroutine 与 runtime.Stack 的适用场景。',
    guidedPractice: '给一个含数据竞争的程序开启 -race 运行，解读报告里两个冲突访问的栈与创建链，再用 go test -mutexprofile 采集同一程序的锁等待排名，产物为两份 profile 与解读笔记。',
    independentPractice: '对一个 goroutine 数量可疑的服务定时抓取 /debug/pprof/goroutine?debug=2，按栈聚类找出泄漏根因并修复，产物为前后数量趋势对比与修复 diff。',
    commonErrors: ['在生产环境常开 -race，被内存 5 到 10 倍、CPU 数倍的插桩开销拖垮服务。', '只看 goroutine 数量峰值不看趋势，把正常池化波动误判成泄漏。'],
    sourceRefs: ['pprof Documentation. https://pkg.go.dev/net/http/pprof', 'Go Blog: Profiling Go Programs. https://go.dev/blog/pprof'],
    steps: [
      ['-race 原理与开销', '-race 基于 ThreadSanitizer：编译时在每次内存读写处插桩，运行时用向量时钟记录访问顺序，发现两个无同步关系的访问就报数据竞争。开销很大——内存约 5 到 10 倍、CPU 2 到 20 倍，所以不在生产常开，在 CI、集成测试和压测环境常开是标准做法。', '竞争要靠仪器抓', {
        title: 'PowerShell：比较普通与 race 开销',
        language: 'PowerShell',
        code: `Measure-Command { go test -run TestConcurrent . } | Select-Object TotalMilliseconds
Measure-Command { go test -race -run TestConcurrent . } | Select-Object TotalMilliseconds
go test -race -run TestConcurrent -count=1 . > race.txt 2>&1
Select-String race.txt -Pattern "DATA RACE|PASS|FAIL"`,
        output: `普通测试 142ms
race 测试 1180ms
PASS

插桩版更慢但能检测无同步交错。
生产常开成本过高，应在 CI/压测环境开启。`,
      }],
      ['典型竞争形态', '典型形态：多个 goroutine 无锁读写同一变量、计数器用 i++ 非原子、map 并发写——后者 runtime 直接抛 fatal 而不等 race 检测。race 报告会给出两个冲突访问各自的 goroutine 栈、发生位置和该 goroutine 的创建位置，按栈回溯即可定位缺失的同步。', '按栈回溯找同步', {
        title: 'Go：并发写 map 直接 fatal',
        language: 'Go',
        code: `m := map[int]int{}
for i := 0; i < 2; i++ {
    go func(id int) {
        for j := 0; j < 1000; j++ { m[j] = id }
    }(i)
}
time.Sleep(time.Second)`,
        output: `fatal error: concurrent map writes
goroutine 6 [running]:
  main.main.func1()

map 并发写由 runtime 直接终止进程。
race 报告还能指出两个 goroutine 的具体冲突栈。`,
      }],
      ['mutex 竞争画像', 'sync.Mutex 无竞争时走 CAS 快路径，竞争激烈后退化为信号量睡眠排队，等待成本可能远超临界区本身。go test -mutexprofile 或 pprof 的 mutex profile 采集锁等待与持有者，按等待总量排名：某把锁累计最高，说明它串行化了过多 goroutine，考虑分片降低粒度。', '看锁等待总量', {
        title: 'go test：采集 mutex profile',
        language: 'Go',
        code: `runtime.SetMutexProfileFraction(1)
mu := &sync.Mutex{}
for i := 0; i < 1000; i++ {
    go func() {
        mu.Lock()
        time.Sleep(time.Millisecond)
        mu.Unlock()
    }()
}
time.Sleep(500 * time.Millisecond)
pprof.Lookup("mutex").WriteTo(os.Stdout, 1)`,
        output: `--- mutex profile ---
1 95.23% 95.23% 1 95.23% sync.(*Mutex).Unlock
1 4.77% 100% 1000 4.77% main.main.func1

全部锁等待集中到一把 Mutex。
可改为分片锁或缩短临界区。`,
      }],
      ['goroutine 泄漏定位', 'goroutine profile 列出所有存活 G 的栈，判断泄漏看数量趋势：压测前后对比或定时采样，数量持续增长即是泄漏。常见根因：channel 发送后没人接收、接收方提前退出、锁拿了没还、出站 HTTP 没设超时。栈会精确停在阻塞的那一行，泄漏点一目了然。', '数量趋势识泄漏', {
        title: 'Go：定时采样 goroutine 数量',
        language: 'Go',
        code: `for i := 0; i < 5; i++ {
    go func() {
        ch := make(chan int)
        ch <- i // 无人接收
    }()
    time.Sleep(10 * time.Millisecond)
    fmt.Println("goroutines", runtime.NumGoroutine())
}
pprof.Lookup("goroutine").WriteTo(os.Stdout, 2)`,
        output: `goroutines 3
goroutines 4
goroutines 5
goroutines 6
goroutines 7
goroutine 18 [chan send]:
main.main.func1()
  main.go:10

数量单调上涨，栈停在 chan send。
修复应给发送选择 ctx.Done 或由接收方保证读取。`,
      }],
      ['两种栈快照对比', 'pprof 的 /debug/pprof/goroutine?debug=2 按 runtime.Stack 格式输出每个 G 的完整栈和等待时长，适合人读；debug=0 或 1 给聚合计数与按栈去重的样本，适合画图。runtime.Stack 则是程序内主动抓当前快照，常用于 panic 处理器和自定义诊断接口。前者被动采集，后者主动调用。', 'debug=2 出全栈', {
        title: 'PowerShell：比较 pprof 与 runtime.Stack',
        language: 'PowerShell',
        code: `curl.exe -s "http://127.0.0.1:8080/debug/pprof/goroutine?debug=1" > goroutine.pb.gz
curl.exe -s "http://127.0.0.1:8080/debug/pprof/goroutine?debug=2" > goroutine.txt
go tool pprof -top goroutine.pb.gz
Select-String goroutine.txt -Pattern "goroutine [0-9]+ \\[chan send\\]|\[select\]" -Context 0,4`,
        output: `pprof top: 8 @ 0x... 100% main.worker chan send
goroutine 21 [chan send, 42 minutes]:
main.worker()
  worker.go:18

debug=1 给聚合样本，适合 pprof 图。
debug=2 和 runtime.Stack 给完整栈与等待时长。`,
      }],
    ],
  },
  {
    name: goG3Name('pprof、trace 与 benchstat'),
    track,
    minutes: 38,
    prerequisite: '已学过 race 检测与 mutex profile，会用 pprof 采集并阅读 CPU profile。',
    goal: '能采集并解读 CPU、heap、block、mutex 四类 profile 与火焰图，用 go tool trace 看调度延迟与 STW，用 benchstat 判断两次 benchmark 差异是否统计显著。',
    guidedPractice: '对一个压测中的服务分别采集四类 profile，在 web 界面切换火焰图找出最宽叶子函数，再用 go tool trace 抓一秒窗口标注一次 STW 与一次调度延迟，产物为标注截图集。',
    independentPractice: '对同一 benchmark 分别以改动前后各跑 -count=10，用 benchstat 生成对比报告，解读 ns/op、B/op、allocs/op 三列与 p 值，产物为一份 benchstat 输出加显著性结论。',
    commonErrors: ['用单次 benchmark 结果宣布优化有效，被运行噪声误导得出反向结论。', '在无负载的本地进程采 CPU profile，得到与线上真实流量完全不同的热点排名。'],
    sourceRefs: ['Go Blog: Profiling Go Programs. https://go.dev/blog/pprof', 'Go Blog: Go execution tracer. https://go.dev/blog/execution-tracer'],
    steps: [
      ['四类 profile 采集', 'CPU profile 默认 100Hz 采样，看 on-CPU 时间分布；heap 分 inuse 与 alloc 两个口径，查泄漏看前者、查分配压力看后者；block 和 mutex 默认关闭，需 SetBlockProfileRate 与 SetMutexProfileFraction 打开采样。import _ net/http/pprof 即暴露采集端点。', '开采样再读数', {
        title: 'PowerShell：采集 CPU、heap、block、mutex',
        language: 'PowerShell',
        code: `$base = "http://127.0.0.1:8080/debug/pprof"
curl.exe -s "$base/profile?seconds=30" > cpu.pprof
curl.exe -s "$base/heap" > heap.pprof
curl.exe -s "$base/block" > block.pprof
curl.exe -s "$base/mutex" > mutex.pprof
go tool pprof -top cpu.pprof
go tool pprof -sample_index=alloc_space -top heap.pprof`,
        output: `cpu top: orders.Parse 42%, net/http 18%
heap alloc_space: orders.Parse 38%, json.Marshal 21%
block top: database/sql.(*DB).conn 61%
mutex top: orders.Cache.mu 74%

四类 profile 分别回答 CPU、分配、阻塞、锁等待。
block/mutex 需事先打开采样率。`,
      }],
      ['火焰图怎么读', '火焰图横轴是采样占比不是时间线，宽度即热度，栈自下而上调用。读法：先找最宽的叶子函数——它自己消耗最多；再看它的调用链决定改哪里：调用方传了错误参数就改调用方，函数本身低效就改内部。pprof web 界面的 Flame 视图可以直接拖拽聚焦。', '宽度就是热度', {
        title: 'pprof：生成并聚焦火焰图',
        language: 'PowerShell',
        code: `go tool pprof -http=127.0.0.1:8081 cpu.pprof
go tool pprof -flame cpu.pprof > flame.txt 2>&1
Select-String flame.txt -Pattern "orders.Parse" -Context 0,5
go tool pprof -list=orders.Parse cpu.pprof`,
        output: `orders.Parse
  json.Unmarshal
    reflect.Value.SetMapIndex
  strings.Split

orders.Parse 是最宽叶子，内部 json.Unmarshal 占比最高。
-list 进一步定位到具体源码行。`,
      }],
      ['go tool trace', 'pprof 回答 CPU 花在哪，go tool trace 回答什么时候：G 何时运行、为何阻塞、P 利用率、STW 时长都在时间轴上。trace 采集开销远大于 profile，抓 1 秒左右的短窗口即可。就绪到真正运行之间的调度延迟，只有 trace 看得见。', 'trace 答何时', {
        title: 'Go：采集并分析 execution trace',
        language: 'Go',
        code: `traceFile, _ := os.Create("trace.out")
defer traceFile.Close()
trace.Start(traceFile)
runLoadFor(time.Second)
trace.Stop()
fmt.Println("trace written")`,
        output: `$ go run . && go tool trace -http=127.0.0.1:8081 trace.out
trace written
Trace viewer:
  Goroutine analysis
  Scheduler latency profile
  STW 180us / 240us

时间轴显示 G 就绪到运行的等待与 STW 窗口。
短窗口更能减少 trace 自身干扰。`,
      }],
      ['benchstat 显著性', '单次 benchmark 的噪声足以淹没真实差异，必须用 -count=10 以上跑多份样本，再交给 benchstat：它输出改动前后 ns/op、B/op、allocs/op 的均值、波动范围和 p 值，p 小于 0.05 才认为统计显著。没有 benchstat 结论的优化对比，本质是掷硬币。', 'p 值显著才信', {
        title: 'PowerShell：benchstat 判断显著性',
        language: 'PowerShell',
        code: `go test -bench=Parse -benchmem -count=10 . > old.txt
git switch feature/fast-parse
go test -bench=Parse -benchmem -count=10 . > new.txt
benchstat old.txt new.txt
go test -run=^$ -bench=Parse -count=20 . > new20.txt
benchstat old.txt new20.txt`,
        output: `name    old ns/op  new ns/op  delta
Parse-8   1840       520       -71.74% (p=0.000 n=10+10)
name    old B/op   new B/op   delta
Parse-8    512        64       -87.50% (p=0.000)

p 值显著且速度与分配均下降。
若 delta 落在噪声范围或 p>0.05，不应保留改动。`,
      }],
      ['采集环境陷阱', 'profile 只在代表性负载下才有意义：线上热点要用真实流量采样，本地空跑可能完全对不上。开 CPU profile 本身会轻微改变调度，heap 开采样率也有偏差，结论要留误差意识。另外采样周期约 10ms，短于一个周期的操作在 CPU profile 里根本看不见。', '负载代表性第一', {
        title: 'PowerShell：记录采样环境与偏差',
        language: 'PowerShell',
        code: `go version
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
go test -bench=. -benchmem -count=3 . > local.txt
k6 run --summary-export prod-load.json perf/orders.js
curl.exe -s "http://prod:8080/debug/pprof/profile?seconds=30" > prod.pprof
go tool pprof -top prod.pprof
benchstat local.txt local-again.txt`,
        output: `local profile top: parser benchmark
prod profile top: database/sql.(*DB).conn 48%
local delta p=0.71 (not significant)

本地空跑热点与线上不同，不能直接套优化结论。
报告必须记录负载、机器、版本与采样窗口。`,
      }],
    ],
  },
  {
    name: goG3Name('Go 性能调优报告'),
    track,
    minutes: 40,
    prerequisite: '已完整掌握 pprof、trace 与 benchstat 三件套的基本操作。',
    goal: '能走通固定基准、pprof 定位、分类改写、benchstat 验证、回归基线的完整调优闭环，并把证据链与残余风险写成一份可复核的调优报告。',
    guidedPractice: '跟随示例项目走一遍完整闭环：固定基准采 profile、归因、改写、benchstat 对比、更新基线，每一步留档，产物为一份含证据链的完整调优报告。',
    independentPractice: '自选一个真实性能问题独立完成闭环，报告中必须包含基线数据、profile 证据、改动 diff、对比表与残余风险五部分，产物为可交付的调优报告。',
    commonErrors: ['同时叠加多个改动后跑 benchstat，性能变了却无法归因到具体手段。', '报告只写提升百分比，不附 profile 证据与残余风险，他人无法复核。'],
    sourceRefs: ['Go Blog: Profiling Go Programs. https://go.dev/blog/pprof', 'Go GC Guide. https://go.dev/doc/gc-guide'],
    steps: [
      ['固定可复现基准', '固定基准先于一切优化：锁定输入数据集、GOMAXPROCS、机器环境（CPU 型号与核数、内核版本都记录进报告），benchmark 用 -benchmem -count=10 固定参数产出基线。基线不稳定，后面每一步对比都是噪声；同一份数据重跑两次结果差 5% 以上，先排查环境。', '基线不牢全白测', {
        title: 'PowerShell：归档性能基线',
        language: 'PowerShell',
        code: `$env:GOMAXPROCS="8"
go version | Tee-Object report.txt
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores | Tee-Object -Append report.txt
go test -run=^$ -bench=. -benchmem -count=10 . > baseline.txt
benchstat baseline.txt baseline.txt
Get-FileHash baseline.txt -Algorithm SHA256 | Tee-Object -Append report.txt`,
        output: `go version go1.23.4
CPU 8 cores, GOMAXPROCS=8
all samples within 2.1% of median
SHA256 9F21...

机器、版本、负载和原始样本已归档。
重跑波动超过 5% 时先查环境，不继续调代码。`,
      }],
      ['pprof 归因三类', '用真实负载采 CPU 和 heap profile，top 列表与火焰图交叉确认热点函数，并把问题归到三类之一：CPU 密集（函数本身算得慢）、分配密集（alloc_space 排名高）、锁等待（block 或 mutex profile 排名高）。三类问题的改法完全不同，归因错了改法必错。', '先归因再动手', {
        title: 'PowerShell：把热点归因到 CPU/分配/锁',
        language: 'PowerShell',
        code: `go test -bench=Order -cpuprofile cpu.out -memprofile mem.out -mutexprofile mutex.out -blockprofile block.out .
go tool pprof -top cpu.out | Select-Object -First 12
go tool pprof -sample_index=alloc_space -top mem.out | Select-Object -First 12
go tool pprof -top mutex.out | Select-Object -First 12
go tool pprof -top block.out | Select-Object -First 12`,
        output: `cpu: orders.Validate 51%
alloc_space: orders.ParseJSON 44%
mutex: orders.Cache.mu wait 1.8s
block: database/sql.conn wait 920ms

四类证据分别量化 CPU、分配、锁和阻塞。
改写优先针对占比最高且可归因的一类。`,
      }],
      ['分级改写纪律', '按归因改写，优先级从高到低：算法级（把 O(n²) 换成 map 索引或排序后扫描）收益最大；分配级（预分配容量、复用 buffer、sync.Pool）；并发级（worker pool 控并发度、缩小锁粒度）。纪律是每次只改一类，改完立即验证，多个改动叠加会无法归因。', '一次只改一类', {
        title: 'Go：按热点做单变量改写',
        language: 'Go',
        code: `func findSlow(items []Item, id string) *Item {
    for i := range items {
        if items[i].ID == id { return &items[i] }
    }
    return nil
}

func buildIndex(items []Item) map[string]*Item {
    index := make(map[string]*Item, len(items))
    for i := range items { index[items[i].ID] = &items[i] }
    return index
}

index := buildIndex(items)
fmt.Println(index["O-9999"])`,
        output: `old: findSlow O(n) for each lookup
new: buildIndex O(n) once, lookup O(1) average
benchmark delta: -68%, alloc +1 map

只替换查找算法，本轮不同时改锁或并发度。
下一步再针对新增 map 分配评估容量与生命周期。`,
      }],
      ['benchstat 验证', '改写后用同样的 -count=10 跑 benchmark，benchstat old.txt new.txt 输出三列指标的均值、波动和 p 值：ns/op 看速度、B/op 与 allocs/op 看内存。只有统计显著且方向正确的改动才保留；不显著的改动一律回滚——保留了也说不清是不是它的功劳。', '不显著就回滚', {
        title: 'PowerShell：benchstat 决定保留或回滚',
        language: 'PowerShell',
        code: `go test -run=^$ -bench=Find -benchmem -count=10 . > old.txt
git switch feature/index-lookup
go test -run=^$ -bench=Find -benchmem -count=10 . > new.txt
$result = benchstat old.txt new.txt
$result
if ($result -match "\\+") { Write-Output "review-regression" }`,
        output: `FindOld-8  1840 ns/op  512 B/op  8 allocs/op
FindNew-8   520 ns/op  128 B/op  2 allocs/op
delta -71.7%, p=0.000

速度与分配均显著下降。
若出现 + 号劣化或 p>0.05，改动回滚。`,
      }],
      ['报告证据链与回归', '报告按证据链组织：基线数据、profile 截图与热点结论、改动 diff、benchstat 对比表、结论与取舍。必须单独写残余风险：sync.Pool 在 GC 时被清空、缩锁粒度引入新竞争面、并发度提高放大下游压力。最后把 benchmark 接入持续集成，防止回归静默发生。', '证据链加风险栏', {
        title: 'Markdown：Go 性能调优报告',
        language: 'Markdown',
        code: `# Go Order Service Performance Report
## Baseline
- go1.23.4, GOMAXPROCS=8, 8-core host
- benchmark: 1840 ns/op, 512 B/op, 8 allocs/op
## Evidence
- CPU: orders.Find 42%
- alloc_space: orders.ParseJSON 38%
- mutex: orders.Cache.mu 74%
## Change
- Build ID index once per catalog version
- diff: 38 lines, no API change
## Result
- 520 ns/op, 128 B/op, 2 allocs/op, p=0.000
## Risks
- Index retains Item pointers; cache invalidation must release old map
- Memory increases one map per catalog version
## Regression Gate
- CI runs go test -bench=Find -count=10 and compares benchstat baseline`,
        output: `report includes baseline, profile evidence, diff, result, risks, gate
independent engineer can reproduce and review the optimization

报告不再是“提升 70%”一句结论。
证据链、残余风险和自动回归门禁齐全。`,
      }],
    ],
  },
];

// ── G4 net/http、Gin、gRPC 与数据访问 ─────────────────────────────────────────────
const goG4Stage = 'net/http、Gin、gRPC 与数据访问';
const goG4Name = (topic: string) => `Go · ${goG4Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG4Name('net/http Server、Handler 和中间件'),
    track,
    minutes: 40,
    prerequisite: '学过 Go 基础语法与接口，写过简单的命令行程序。',
    goal: '能独立用 net/http 搭出带路由、超时与中间件的 HTTP 服务，并解释每项配置的边界。',
    guidedPractice: '从零实现一个带日志中间件、recover 中间件与四项超时配置的订单查询服务，用慢速请求验证超时生效，产物为可运行的 main.go 与中间件包。',
    independentPractice: '自行扩展一条带 {id} 通配符的 GET 路由与一条子树路由，写一个记录耗时的中间件加入链中，用 curl 验证响应头与状态码符合预期。',
    commonErrors: ['把超时全留默认零值上线，慢客户端逐渐占满连接池。', '在中间件里把响应写了两遍，导致 superfluous WriteHeader 告警。'],
    sourceRefs: ['net/http Documentation. https://pkg.go.dev/net/http', 'Gin Documentation. https://gin-gonic.com/docs/'],
    steps: [
      ['Handler 接口与路由', 'net/http 里任何类型只要实现 ServeHTTP(ResponseWriter, *Request) 就能当 Handler。ServeMux 是标准库自带的多路复用器，用 mux.HandleFunc 注册模式串；Go 1.22 起支持 "GET /orders/{id}" 这类带方法与通配符的模式，{id} 在处理器里用 r.PathValue("id") 取出，模式末尾带斜杠则匹配整个子树，并自动做路径规范化重定向。', '实现接口即可路由', {
        title: 'net/http：方法路由与 PathValue',
        language: 'Go',
        code: `mux := http.NewServeMux()
mux.HandleFunc("GET /orders/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintf(w, "{\\"id\\":%q}", id)
})
mux.HandleFunc("POST /orders", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusCreated)
})
http.ListenAndServe(":8080", mux)`,
        output: `curl -s http://127.0.0.1:8080/orders/O-1
{"id":"O-1"}
curl -i -X POST http://127.0.0.1:8080/orders
HTTP/1.1 201 Created
curl -i -X GET http://127.0.0.1:8080/orders
HTTP/1.1 405 Method Not Allowed

方法与路径模式由 ServeMux 匹配。
PathValue 取出 {id} 通配段。`,
      }],
      ['超时四件套的语义', '四个超时各管一段：ReadHeaderTimeout 只限读完请求头；ReadTimeout 从连接可读起覆盖到读完请求体；WriteTimeout 从读完头开始到响应写完为止；IdleTimeout 管两次请求之间 keep-alive 空闲连接的存活，为零时回退用 ReadTimeout。四件都要显式设置，默认全零等于不限时，超时触发时服务端直接断开连接而不返回任何响应。', '四段超时各管一段', {
        title: 'net/http：显式配置四项超时',
        language: 'Go',
        code: `server := &http.Server{
    Addr: "0.0.0.0:8080",
    Handler: mux,
    ReadHeaderTimeout: 2 * time.Second,
    ReadTimeout: 5 * time.Second,
    WriteTimeout: 10 * time.Second,
    IdleTimeout: 60 * time.Second,
}
log.Fatal(server.ListenAndServe())`,
        output: `slow-header response error: read tcp ... i/o timeout after 2s
slow-body response error: i/o timeout after 5s
keep-alive connection closed after 60s idle

请求头、请求体、响应写出和空闲连接分别受限。
任何一项零值都表示对应阶段可能无限等待。`,
      }],
      ['慢连接的攻击面', '生产环境最常见的风险是慢速连接攻击：攻击者建立连接后每个字节隔很久才发一次，没有 ReadHeaderTimeout 的服务会为它一直挂着连接与缓冲，连接数被拖满后新请求再也进不来。超时值还要小于上游网关的对应项，否则上游先断而服务端仍在等，客户端拿到的是网关错误而非服务端的真实结果。', '超时值要小于上游', {
        title: 'PowerShell：慢请求验证 ReadHeaderTimeout',
        language: 'PowerShell',
        code: `$client = [Net.Sockets.TcpClient]::new("127.0.0.1", 8080)
$stream = $client.GetStream()
$writer = [IO.StreamWriter]::new($stream)
$request = "GET /orders/O-1 HTTP/1.1" + [char]13 + [char]10 + "Host: localhost" + [char]13 + [char]10
$writer.Write($request)
$writer.Flush()
Start-Sleep -Seconds 3
$reader = [IO.StreamReader]::new($stream)
$reader.ReadToEnd()
$client.Close()`,
        output: `server log: read header timeout
client read returned empty / connection reset
elapsed=2.0s

请求头未在 2 秒内完成，服务端主动断开。
没有 ReadHeaderTimeout 时连接会一直占用。`,
      }],
      ['中间件闭包包装', '中间件的类型固定为 func(next http.Handler) http.Handler：返回的 HandlerFunc 闭包捕获 next，在调用 next.ServeHTTP 前做进入逻辑（记开始时间、塞请求 ID），之后或 defer 里做收尾逻辑（记耗时、recover panic）。组装时先包的在最外层，执行顺序从最后包上的中间件往内走，panic 只能被外层的 recover 接住。', '闭包捕获链式执行', {
        title: 'net/http：日志、请求 ID 与 recover 中间件',
        language: 'Go',
        code: `func withRequest(w http.ResponseWriter, r *http.Request) http.Handler {
    id := uuid.NewString()
    ctx := context.WithValue(r.Context(), requestIDKey{}, id)
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Request-ID", id)
        log.Println("request", r.Method, r.URL.Path)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
func recoverer(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if value := recover(); value != nil {
                http.Error(w, "internal error", 500)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
handler := recoverer(logger(withRequest(mux)))`,
        output: `logger: request GET /orders/O-1
response X-Request-ID: 7f21
panic recovered before connection abort

请求 ID 在外层注入并传给内层 handler。
recoverer 位于链外层，能接住内层 panic。`,
      }],
      ['写响应的边界', '响应头只能写一次：第一次 Write 会隐式以 200 提交头部，之后再调 WriteHeader 只会打日志不生效，所以要先确定状态码再写体。要流式推送需断言 http.Flusher 调 Flush，未 Flush 时默认缓冲约 4KB 会攒着不发；未设置 Content-Type 时标准库按前 512 字节做内容嗅探，这对 SSE 与文件下载场景都有实际影响。', '头只提交一次', {
        title: 'net/http：SSE 响应头与 Flush',
        language: 'Go',
        code: `func stream(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    flusher, ok := w.(http.Flusher)
    if !ok { http.Error(w, "stream unsupported", 500); return }
    for i := 0; i < 3; i++ {
        fmt.Fprintf(w, "id: %d\\ndata: tick\\n\\n", i)
        flusher.Flush()
        time.Sleep(time.Second)
    }
}`,
        output: `HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

id: 0
data: tick

id: 1
data: tick

Flush 后每个事件立即写出。
第二次 WriteHeader 不会改写已提交的 200。`,
      }],
    ],
  },
  {
    name: goG4Name('Gin 路由树、上下文和错误'),
    track,
    minutes: 38,
    prerequisite: '完成 net/http 服务课程，理解 Handler 与中间件的基本结构。',
    goal: '能解释 Gin 路由树的匹配与冲突规则，写出复用 Context、绑定校验与统一错误出口的规范服务。',
    guidedPractice: '实现带参数与通配符的订单路由，注册统一错误出口中间件，用非法 JSON 触发 400 响应，产物为路由注册代码与错误出口中间件。',
    independentPractice: '故意注册两条冲突路由观察 panic 信息，再写一个把用户信息存入 Context 的中间件，并在处理器里安全地启动 goroutine 处理耗时任务。',
    commonErrors: ['把 gin.Context 指针直接传给后台 goroutine，造成跨请求串数据。', '同一位置同时注册静态段与参数段路由，启动时 panic。'],
    sourceRefs: ['Gin Documentation. https://gin-gonic.com/docs/', 'net/http Documentation. https://pkg.go.dev/net/http'],
    steps: [
      ['radix 树路由', 'Gin 为每个 HTTP 方法维护一棵 radix 树，公共前缀压缩后静态段优先于参数段匹配。注册期就检查冲突：/user/:id 与 /user/new 在同一位置既有参数又有静态段会直接 panic；:id 只吃单段路径，而 *path 通配符吞掉剩余全部路径且必须放在模式末尾并自带斜杠。树在启动时构建完成，运行期不再增删路由。', '注册期即查冲突', {
        title: 'Gin：参数路由与冲突 panic',
        language: 'Go',
        code: `r := gin.New()
r.GET("/orders/:id", func(c *gin.Context) {
    c.JSON(200, gin.H{"id": c.Param("id")})
})
r.GET("/files/*path", func(c *gin.Context) {
    c.String(200, c.Param("path"))
})
fmt.Println(r.Routes())

// r.GET("/orders/new", ...) // panic: conflict with :id`,
        output: `GET /orders/:id
GET /files/*path
curl /orders/O-1 -> {"id":"O-1"}
curl /files/a/b.txt -> /a/b.txt
route conflict panic at registration

静态段与参数段冲突在注册期被发现。
通配符 *path 必须位于末尾并吃掉剩余路径。`,
      }],
      ['Context 复用陷阱', '*gin.Context 是每个请求从池里取出的短命对象，请求结束就归还复用，所以不能把它的指针传给后台 goroutine 或塞进缓存，需要异步处理时先调 Copy() 复制一份。键值用 Set/Get 存取值时要类型断言；c.Next() 放行链上后续处理器，c.Abort() 只阻止尚未执行的处理器，当前函数剩余部分仍会走完。', '请求后不可再持有', {
        title: 'Gin：异步任务使用 Context.Copy',
        language: 'Go',
        code: `func asyncHandler(c *gin.Context) {
    ctx := c.Copy()
    go func() {
        time.Sleep(100 * time.Millisecond)
        value, _ := ctx.Get("requestID")
        fmt.Println("async", value)
    }()
    c.JSON(202, gin.H{"status": "accepted"})
}

middleware := func(c *gin.Context) {
    c.Set("requestID", "req-7f21")
    c.Next()
}`,
        output: `HTTP/1.1 202 Accepted
async req-7f21

Copy 固定请求上下文，后台 goroutine 不读取已归还的 Context。
直接持有原 c 会在下一请求复用时串数据。`,
      }],
      ['JSON 绑定与校验', 'ShouldBindJSON 把请求体反序列化到结构体并按 validator 标签校验，失败返回错误但不自动写响应，由调用方决定返回 400；BindJSON 系列则会自动 AbortWithStatusJSON(400)。常用标签有 required、omitempty、oneof=a b、gte 与 max 等；切片字段要逐元素校验时加 dive 标签，嵌套结构体的校验规则可以递归生效。', '校验失败交回调用方', {
        title: 'Gin：ShouldBindJSON 与 validator',
        language: 'Go',
        code: `type CreateOrder struct {
    SKU string ` + "`json:\"sku\" binding:\"required,min=3\"`" + `
    Quantity int ` + "`json:\"quantity\" binding:\"gte=1,lte=99\"`" + `
}
r.POST("/orders", func(c *gin.Context) {
    var input CreateOrder
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(400, gin.H{"code":"VALIDATION_FAILED","detail":err.Error()})
        return
    }
    c.JSON(201, input)
})`,
        output: `curl -d '{"sku":"X","quantity":0}' /orders
HTTP/1.1 400
{"code":"VALIDATION_FAILED","detail":"Key: 'CreateOrder.SKU' Error:Field validation for 'SKU' failed on the 'min' tag"}

ShouldBindJSON 返回错误但不自动写响应。
调用方统一映射为 400 和字段级错误。`,
      }],
      ['c.Error 错误链', 'c.Error(err) 把错误追加进 ctx.Errors 切片但不中断执行，适合处理器内收集多条业务错误，要中止就再调 c.Abort()。错误对象最好定义成携带业务码的自定义类型，供出口统一翻译成状态码与文案。Errors 只在本请求生命周期内有效，收集时应同时打印请求 ID，方便事后在日志里追踪整条链路。', '收集而不中止', {
        title: 'Gin：c.Error 收集业务错误',
        language: 'Go',
        code: `type BusinessError struct {
    Code string
    Status int
}
func (e *BusinessError) Error() string { return e.Code }

r.GET("/orders/:id", func(c *gin.Context) {
    if c.Param("id") == "missing" {
        _ = c.Error(&BusinessError{Code:"ORDER_NOT_FOUND", Status:404})
        c.Abort()
        return
    }
    c.JSON(200, gin.H{"id": c.Param("id")})
})`,
        output: `GET /orders/missing
c.Errors len=1 code=ORDER_NOT_FOUND
response status=404

c.Error 只追加错误，不自动中断。
配合 Abort 阻止后续处理器继续执行。`,
      }],
      ['统一错误出口', '最外层中间件在 c.Next() 返回后检查 ctx.Errors：非空就遍历并按错误类型映射状态码——参数校验对应 400、未登录对应 401、权限不足对应 403、资源不存在对应 404——取首个错误渲染统一 JSON 结构。全链路只允许这一个出口写错误响应，处理器里再直接调 c.JSON 会造成重复写头与响应体冲突。', '错误只出口一次', {
        title: 'Gin：统一错误出口中间件',
        language: 'Go',
        code: `func errorOutlet() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Next()
        if len(c.Errors) == 0 { return }
        err := c.Errors[0].Err
        if business, ok := err.(*BusinessError); ok {
            c.JSON(business.Status, gin.H{
                "code": business.Code,
                "requestId": c.GetString("requestID"),
            })
            return
        }
        c.JSON(500, gin.H{"code":"INTERNAL_ERROR"})
    }
}
r.Use(requestID(), errorOutlet())`,
        output: `HTTP/1.1 404 Not Found
{"code":"ORDER_NOT_FOUND","requestId":"req-7f21"}

所有业务错误由同一中间件翻译成响应。
处理器不再自行写 404/500，避免重复响应。`,
      }],
    ],
  },
  {
    name: goG4Name('gRPC、protobuf、超时和拦截器'),
    track,
    minutes: 40,
    prerequisite: '掌握 protobuf 基本语法，用过 net/http 与 Gin 写过服务。',
    goal: '能从 proto 文件生成 stub 并实现四种流式调用，用拦截器统一认证日志，让 deadline 跨服务正确传播。',
    guidedPractice: '定义订单查询的 proto，生成代码后实现一元与服务端流两个方法，写一元认证拦截器从 metadata 取 token，产物为 proto 文件、生成代码与拦截器。',
    independentPractice: '实现一个客户端流聚合接口，在客户端设置 500 毫秒 deadline 并故意让服务端 sleep，观察两侧 ctx 取消与 DeadlineExceeded 状态码的传播。',
    commonErrors: ['拦截器里直接调用 handler 而忘记传递新 ctx，认证信息丢失。', '对非幂等方法加自动重试，造成重复下单等副作用。'],
    sourceRefs: ['gRPC Go Documentation. https://grpc.io/docs/languages/go/', 'net/http Documentation. https://pkg.go.dev/net/http'],
    steps: [
      ['proto 生成 stub', '先在 .proto 里定义 service 与 rpc 方法，用 protoc 加 protoc-gen-go 与 protoc-gen-go-grpc 两个插件生成代码：pb.go 得到消息结构体与序列化逻辑，_grpc.pb.go 得到客户端接口和服务端 UnimplementedXxxServer 嵌入基类。服务端实现该接口后用 RegisterXxxServer 注册到 grpc.Server，客户端 NewXxxClient 即得到类型安全的 stub。', '两个插件两份产物', {
        title: 'protoc：生成 Go gRPC stub',
        language: 'PowerShell',
        code: `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative proto/orders.proto
Get-ChildItem proto | Select-Object Name
go test ./...`,
        output: `orders.pb.go
orders_grpc.pb.go
ok demo/orders 0.003s

pb.go 包含消息序列化，_grpc.pb.go 包含客户端与服务端接口。
两份产物都由 proto 单一来源生成。`,
      }],
      ['四种流式模式', 'rpc 参数带 stream 关键字的组合共有四种：两边都不带是一元调用；仅返回值带 stream 是服务端流，客户端拿到流后 Recv 循环读到 EOF；仅请求带 stream 是客户端流，服务端 Recv 收完再 Send 一次响应；两边都带是双向流，两端各自按需 Recv 与 Send，顺序不必一一对应。不同模式生成的函数签名完全不同，选型看数据量与实时性。', '按数据形态选流式', {
        title: 'proto：一元、服务端流与双向流',
        language: 'Proto',
        code: `service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc WatchOrders(WatchRequest) returns (stream Order);
  rpc SyncOrders(stream OrderEvent) returns (SyncSummary);
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}`,
        output: `GetOrder -> unary
WatchOrders -> server streaming
SyncOrders -> client streaming
Chat -> bidirectional streaming

返回类型带 stream 是服务端流。
请求类型带 stream 是客户端流，两端都带是双向流。`,
      }],
      ['deadline 传播', '客户端在调用前用 context.WithTimeout 设置截止时间，gRPC 把剩余时限写进 grpc-timeout 头随请求发出，服务端收到的 ctx 自动继承该 deadline，超时后 ctx.Err() 变为 DeadlineExceeded，所有依赖 ctx 的下游调用（包括数据库查询）随之取消。跨多级服务时每一跳都带着剩余时间往下传，全链路的超时预算因此可以统一下放。', '时限随请求下传', {
        title: 'gRPC：500ms deadline 传导',
        language: 'Go',
        code: `ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
defer cancel()
response, err := client.GetOrder(ctx, &pb.GetOrderRequest{Id: "O-1"})
if status.Code(err) == codes.DeadlineExceeded {
    fmt.Println("deadline exceeded", time.Now())
}
fmt.Println(response, err)`,
        output: `server ctx deadline remaining=498ms
server query cancelled: context deadline exceeded
client code=DeadlineExceeded elapsed=501ms

grpc-timeout 把剩余预算带到服务端。
服务端数据库查询使用同一 ctx 被取消。`,
      }],
      ['一元与流拦截器', '一元拦截器的签名是 func(ctx, req, info, handler)，包住真正的处理函数：认证拦截器从 metadata 取 token 校验后把用户信息塞回 ctx，日志拦截器记录方法名与耗时，重试拦截器只对幂等方法做退避重试。多个拦截器用 grpc.ChainUnaryInterceptor 串联；流式调用要单独写 StreamServerInterceptor，两者签名不同不能混用。', '横切逻辑别进业务', {
        title: 'gRPC：认证一元拦截器',
        language: 'Go',
        code: `func authInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler) (any, error) {
    md, _ := metadata.FromIncomingContext(ctx)
    token := md.Get("authorization")
    if len(token) == 0 { return nil, status.Error(codes.Unauthenticated, "missing token") }
    ctx = context.WithValue(ctx, actorKey{}, "u-1")
    return handler(ctx, req)
}
server := grpc.NewServer(
    grpc.ChainUnaryInterceptor(authInterceptor, loggingInterceptor),
)`,
        output: `request without metadata -> Unauthenticated
request with Bearer token -> method invoked actor=u-1
log method=/orders.OrderService/GetOrder elapsed=2ms

拦截器在业务处理器前认证并把 actor 放入 ctx。
多个一元拦截器按链顺序执行。`,
      }],
      ['状态码与映射', '服务端用 status.Error(codes.NotFound, ...) 返回结构化错误，客户端用 status.FromError 拆出 code 后分支处理；可重试与不可重试的错误要用不同 code 区分，例如 Unavailable 可退避重试而 Internal 不该重试。code 语义与 HTTP 状态接近但更细，映射表应放在传输层适配器里，领域层只返回自己的错误类型。', 'code 定重试策略', {
        title: 'gRPC：status code 与重试分类',
        language: 'Go',
        code: `func mapError(err error) error {
    var notFound *NotFound
    if errors.As(err, &notFound) {
        return status.Error(codes.NotFound, notFound.Error())
    }
    return status.Error(codes.Internal, "internal")
}

response, err := client.GetOrder(ctx, req)
switch status.Code(err) {
case codes.Unavailable, codes.DeadlineExceeded:
    retry(response)
case codes.NotFound:
    return notFoundPage()
case codes.Internal:
    log.Error(err)
}`,
        output: `not found -> codes.NotFound, no retry
connection refused -> codes.Unavailable, retryable
handler panic -> codes.Internal, not retried blindly

领域错误在边界映射成 gRPC code。
重试只针对明确可恢复的 code。`,
      }],
    ],
  },
  {
    name: goG4Name('database/sql、事务和 sqlc'),
    track,
    minutes: 38,
    prerequisite: '了解 SQL 基本语法，完成前面 HTTP 服务课程的实践。',
    goal: '能正确配置 database/sql 连接池，划清事务边界并用占位符防注入，理解 sqlc 生成类型安全代码的流程。',
    guidedPractice: '为订单库配置四项连接池参数，写一个下单事务包含扣减库存与插入订单两步并配 defer rollback，产物为带事务的服务函数与参数配置说明。',
    independentPractice: '把三条手写 Scan 查询改写成 sqlc 查询并运行 generate，故意改一列类型观察生成期报错，再用注入样例验证占位符版本的查询无法被拼接破坏。',
    commonErrors: ['事务里混用 db 与 tx 执行查询，两条语句落在不同连接上。', '用 fmt.Sprintf 拼接用户输入构造 SQL，留下注入漏洞。'],
    sourceRefs: ['database/sql Documentation. https://pkg.go.dev/database/sql', 'net/http Documentation. https://pkg.go.dev/net/http'],
    steps: [
      ['连接池四参数', 'sql.DB 是连接池不是单条连接。MaxOpenConns 限制并发打开的连接上限，不设就是无限，池满后申请会阻塞；MaxIdleConns 控制空闲保留数量，太小会造成频繁建连；ConnMaxLifetime 与 ConnMaxIdleTime 让连接超期退役，用来规避数据库侧踢人与故障切换后的陈旧连接。池上限要小于数据库 max_connections 除以实例数，否则连接被全局打满。', '池要小于库上限', {
        title: 'database/sql：配置连接池',
        language: 'Go',
        code: `db, _ := sql.Open("pgx", os.Getenv("DATABASE_URL"))
db.SetMaxOpenConns(20)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)
ctx, cancel := context.WithTimeout(context.Background(), time.Second)
defer cancel()
fmt.Println(db.PingContext(ctx))
fmt.Println(db.Stats().MaxOpenConnections)`,
        output: `<nil>
20
db.Stats: Open=8 InUse=3 Idle=5 WaitCount=0

最大连接 20、空闲 10，生命周期到期后退役。
池上限乘以实例数后必须低于数据库连接配额。`,
      }],
      ['事务边界三步', '事务边界用 db.BeginTx(ctx, nil) 拿到 *sql.Tx，之后所有读写都必须走 tx 对象才有事务语义，写成 tx 与 db 混用会拆到两个连接上。收尾用 defer tx.Rollback()：Commit 成功后 Rollback 返回 ErrTxDone 属于正常幂等，Commit 前任何错误路径都靠它兜底回滚；ctx 取消或超时同样终止事务，长事务会长时间占住一条池内连接。', '全部读写走 tx', {
        title: 'database/sql：事务提交与兜底回滚',
        language: 'Go',
        code: `tx, err := db.BeginTx(ctx, nil)
if err != nil { return err }
defer tx.Rollback()
if _, err = tx.ExecContext(ctx,
    "update inventory set stock=stock-1 where sku=$1 and stock>0", sku); err != nil {
    return err
}
if _, err = tx.ExecContext(ctx,
    "insert into orders(id, sku) values ($1,$2)", orderID, sku); err != nil {
    return err
}
return tx.Commit()`,
        output: `order O-1 created, stock decremented
defer Rollback after Commit returns sql.ErrTxDone
if insert fails, stock update rolls back

所有语句走同一个 tx。
Commit 前任何 return 都由 defer 回滚。`,
      }],
      ['占位符防注入', '查询参数一律走占位符：Postgres 驱动用 $1、$2，MySQL 用 ?，值经驱动转义后进入协议层，SQL 结构与数据分离，拼接的恶意片段无法改变语句结构，fmt.Sprintf 拼 SQL 是注入的源头。LIKE 查询要转义用户输入里的 % 与 _；表名、列名、排序方向无法参数化，只能先用白名单映射再拼接进语句。', '结构数据要分离', {
        title: 'database/sql：参数化与排序白名单',
        language: 'Go',
        code: `status := r.URL.Query().Get("status")
rows, _ := db.QueryContext(ctx,
    "select id, status from orders where tenant_id=$1 and status=$2",
    tenantID, status)

orderBy := map[string]string{"created": "created_at", "total": "total"}[r.URL.Query().Get("sort")]
if orderBy == "" { orderBy = "created_at" }
query := "select id,total from orders where tenant_id=$1 order by " + orderBy
rows, _ = db.QueryContext(ctx, query, tenantID)`,
        output: `status='PAID' OR 1=1 -- yields zero rows
sort=total -> order by total
sort=(drop table) -> fallback created_at

值和结构分离，用户输入不能改 WHERE。
无法参数化的列名只从固定映射取。`,
      }],
      ['行扫描与空值', 'QueryRow 配 Scan 适合最多一行的查询，查不到返回 ErrNoRows 要显式判断；Query 返回的 rows 必须遍历完或 Close，否则连接不还池。可空列用 sql.NullString、sql.NullInt64 等类型承接，直接 Scan 进普通类型遇 NULL 会报错，新版也可用指针或泛型 Null 系列；Scan 的字段顺序必须与查询列顺序一一对应，错位就是脏数据。', 'rows 用完必关', {
        title: 'database/sql：ErrNoRows 与 NULL',
        language: 'Go',
        code: `var note sql.NullString
err := db.QueryRowContext(ctx,
    "select note from orders where id=$1", "O-1").Scan(&note)
if errors.Is(err, sql.ErrNoRows) { return ErrOrderNotFound }
if err != nil { return err }
fmt.Println(note.Valid, note.String)

rows, err := db.QueryContext(ctx, "select id,note from orders")
if err != nil { return err }
defer rows.Close()
for rows.Next() {
    var id string
    var note sql.NullString
    if err := rows.Scan(&id, &note); err != nil { return err }
}`,
        output: `not found -> ErrOrderNotFound
note NULL -> Valid=false String=""
rows closed before connection returns to pool

ErrNoRows 显式转为业务不存在错误。
NULL 进入 NullString，rows 必须关闭。`,
      }],
      ['sqlc 生成代码', 'sqlc 的思路是把 SQL 当事实源头：在 queries.sql 里用 -- name: GetUser :one 注解标记查询类型，写明 schema 后运行 sqlc generate，工具解析 SQL 并生成对应的结构体与方法，参数和返回值都有确切类型。列类型不匹配或语法错误在生成期就报出来，而不是等到运行时 Scan 才炸；手写 Scan 序号错位的整类问题因此消失。', '生成期报类型错', {
        title: 'sqlc：从 SQL 生成类型安全代码',
        language: 'SQL',
        code: `-- name: GetOrder :one
SELECT id, status, total, created_at FROM orders WHERE id = $1;

-- name: ListPaidOrders :many
SELECT id, total FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC
LIMIT $1;`,
        output: `$ sqlc generate
internal/db/queries.sql.go generated
func (q *Queries) GetOrder(ctx context.Context, id string) (Order, error)
func (q *Queries) ListPaidOrders(ctx context.Context, limit int32) ([]ListPaidOrdersRow, error)

查询参数与返回字段在生成期确定。
列类型变更后 generate 直接报错，不等到运行时 Scan。`,
      }],
    ],
  },
  {
    name: goG4Name('认证、授权、限流和请求 ID'),
    track,
    minutes: 40,
    prerequisite: '完成 Gin 中间件与 database/sql 课程，理解请求处理链。',
    goal: '能为服务加上 JWT 校验、对象级授权、令牌桶限流与请求 ID 透传，形成一套可复用的安全中间件。',
    guidedPractice: '实现 JWT 校验中间件核验签名过期与受众，再实现对象级归属检查的查询，产物为认证中间件、授权查询与带归属校验的订单接口。',
    independentPractice: '用 x/time/rate 给按 IP 的限流器加过期清理，压测验证 429 与 Retry-After，再接入请求 ID 中间件并确认网关与服务日志能用同一 ID 串起链路。',
    commonErrors: ['只做认证不做对象归属检查，IDOR 越权直接读他人数据。', '限流计数器按窗口分桶后忘记清理旧键，内存随 IP 数无限增长。'],
    sourceRefs: ['Gin Documentation. https://gin-gonic.com/docs/', 'net/http Documentation. https://pkg.go.dev/net/http'],
    steps: [
      ['JWT 三项校验', '校验中间件从 Authorization 头解析 Bearer token，至少核验三件事：用密钥验签防止伪造，比较 exp 与当前时间防止过期令牌，核对 aud 是否等于本服务的期望受众防止令牌跨服务挪用。三项全过才把 sub 等声明写进请求上下文，下游业务从 ctx 取用户身份；任一项失败都返回 401 并附 WWW-Authenticate 头。', '三关全过才放行', {
        title: 'Go：JWT 验签、过期与 audience',
        language: 'Go',
        code: `func auth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
        token, err := jwt.Parse(raw, keyFunc,
            jwt.WithIssuer("https://ids.example"),
            jwt.WithAudience("orders-api"))
        if err != nil || !token.Valid {
            w.Header().Set("WWW-Authenticate", "Bearer")
            http.Error(w, "unauthorized", 401)
            return
        }
        claims := token.Claims.(jwt.MapClaims)
        ctx := context.WithValue(r.Context(), actorKey{}, Actor{
            UserID: claims["sub"].(string),
            TenantID: claims["tenant"].(string),
        })
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}`,
        output: `valid token -> handler actor=u-1 tenant=acme
wrong aud -> 401 WWW-Authenticate: Bearer
expired token -> 401

签名、exp 与 audience 全部通过才放行。
处理函数只从 ctx 取可信主体。`,
      }],
      ['对象级归属检查', '认证证明用户是谁，授权回答能否操作这个对象，二者不可互替。即便中间件已验签，读写对象仍要显式检查归属：查询条件带 owner_id，或取出资源后比对属主再决定放行，否则水平越权（IDOR）会直接暴露他人数据。角色级检查可以放中间件，对象级检查必须落在业务代码里，因为只有那里知道目标资源的属主。', '归属检查在业务层', {
        title: 'Go：owner 与 tenant 写进 SQL',
        language: 'Go',
        code: `func getOrder(ctx context.Context, db *sql.DB, id string) (Order, error) {
    actor := actorFrom(ctx)
    var order Order
    query := "select id, owner_id, total from orders where id=$1 and tenant_id=$2 and owner_id=$3"
    err := db.QueryRowContext(ctx, query, id, actor.TenantID, actor.UserID).
        Scan(&order.ID, &order.OwnerID, &order.Total)
    if errors.Is(err, sql.ErrNoRows) { return Order{}, ErrNotFound }
    return order, err
}`,
        output: `owner request -> 200
cross-tenant request -> 404
role without ownership -> 404

租户与 owner 是 SQL 查询条件。
越权和不存在统一 404，避免枚举资源。`,
      }],
      ['令牌桶与突发', '令牌桶以恒定速率往桶里放令牌，桶容量即允许的突发上限，请求到来先取令牌，取不到就拒绝。相比直接计数，它既能限制平均速率又能放行短时突发，适合有正常波峰的业务。Go 里用 golang.org/x/time/rate 的 Limiter 按键（用户或 IP）各建一个桶，返回 429 时附 Retry-After 提示客户端何时可以重试。', '突发上限即容量', {
        title: 'Go：按租户创建令牌桶',
        language: 'Go',
        code: `buckets := sync.Map{}
func allow(key string) bool {
    value, _ := buckets.LoadOrStore(key, rate.NewLimiter(100, 200))
    return value.(*rate.Limiter).Allow()
}

if !allow(actor.TenantID + "|order-query") {
    w.Header().Set("Retry-After", "1")
    http.Error(w, "rate limited", 429)
    return
}`,
        output: `tenant acme burst 200 allowed
request 201 -> 429 Retry-After: 1
tenant globex still 200

每个租户独立令牌桶，容量 200 允许短时突发。
超限只影响该租户与对应路由。`,
      }],
      ['固定窗口突刺', '固定窗口在每段固定时间（如每分钟）内维护一个计数器，到点清零，实现只需 INCR 加 EXPIRE，存储成本最低。弱点在窗口边界：前窗末尾与后窗开头的两批流量各自消耗配额，叠加可达限流值的两倍突刺，且窗口内的突发全部挤在同一段。对突刺敏感的接口要改用令牌桶或滑动窗口，简单后台接口用固定窗口即可。', '边界处有突刺', {
        title: 'Redis：固定窗口计数的边界',
        language: 'Go',
        code: `func fixedWindow(ctx context.Context, rdb *redis.Client, key string) (bool, error) {
    result, err := rdb.Incr(ctx, key).Result()
    if err != nil { return false, err }
    if result == 1 { rdb.Expire(ctx, key, time.Minute) }
    return result <= 100, nil
}
allowed1, _ := fixedWindow(ctx, rdb, "rate:acme:12:59")
allowed2, _ := fixedWindow(ctx, rdb, "rate:acme:13:00")
fmt.Println(allowed1, allowed2)`,
        output: `12:59 window allows 100
13:00 new key allows another 100
200 requests crossed in <2 seconds around boundary

固定窗口实现简单，但边界可产生双倍突刺。
突刺敏感接口应换成令牌桶或滑动窗口。`,
      }],
      ['请求 ID 透传', '入口中间件读取 X-Request-ID，没有就生成一个（uuid 或带前缀的随机串），随后写回响应头、存进 request context、打进每条日志字段，向下游服务转发时继续携带同一 ID，这样排障时用一个 ID 就能串起网关、服务与数据库日志。生成端要防客户端伪造过长的 ID，透传前做长度与字符集校验，缺失时补齐而不是报错。', '一串到底可追踪', {
        title: 'Go：requestId 贯穿入口、日志和下游',
        language: 'Go',
        code: `func requestID(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := r.Header.Get("X-Request-ID")
        if len(id) > 64 || !validID(id) { id = uuid.NewString() }
        if id == "" { id = uuid.NewString() }
        w.Header().Set("X-Request-ID", id)
        ctx := context.WithValue(r.Context(), requestIDKey{}, id)
        slog.InfoContext(ctx, "request_start", "method", r.Method)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}`,
        output: `response X-Request-ID: req-7f21
log request_start requestId=req-7f21
downstream header X-Request-ID: req-7f21

请求 ID 经 context、响应头、日志和下游请求透传。
超长或非法 ID 被替换，不直接信任客户端。`,
      }],
    ],
  },
  {
    name: goG4Name('多协议服务实验'),
    track,
    minutes: 38,
    prerequisite: '完成本阶段 REST、gRPC 与数据访问五门课程并保留可运行代码。',
    goal: '能把同一订单领域同时暴露为 Gin REST 与 gRPC 两套门面，理解错误映射与超时行为在两种协议下的差异。',
    guidedPractice: '把订单领域抽成独立包，Gin 与 gRPC 各写适配层调用同一 CreateOrder，产物为领域包、两个适配器与一份错误映射对照表。',
    independentPractice: '把健康检查拆到独立端口并实现 grpc_health_v1，两端客户端用相同 800 毫秒预算压测慢查询，记录两种协议的取消时机差异形成对照结论。',
    commonErrors: ['领域包 import 了 gin 或 grpc，传输逻辑渗进核心，复用失效。', 'gRPC 适配层把内部错误原文透出，泄漏 SQL 与内部实现细节。'],
    sourceRefs: ['gRPC Go Documentation. https://grpc.io/docs/languages/go/', 'Gin Documentation. https://gin-gonic.com/docs/'],
    steps: [
      ['领域与传输分层', '实验把订单域写成一个不依赖任何传输框架的包：CreateOrder(ctx, input) 只收领域结构体返回领域对象与 error，Gin 处理器、gRPC 方法实现各自做 DTO 转换后调用它。领域包的 import 列表里不允许出现 gin 或 grpc，依赖方向永远是传输层指向领域层，这条线可以靠包导入约束在编译期守住。', '依赖只指向领域', {
        title: 'Go：HTTP 与 gRPC 共用领域服务',
        language: 'Go',
        code: `type PlaceOrder struct { SKU string; Quantity int }
type Service struct{ repo Repo }
func (s *Service) Place(ctx context.Context, cmd PlaceOrder) (Order, error) {
    if cmd.Quantity <= 0 { return Order{}, ErrInvalidQuantity }
    return s.repo.Save(ctx, cmd)
}

func httpPlace(w http.ResponseWriter, r *http.Request) {
    var cmd PlaceOrder
    json.NewDecoder(r.Body).Decode(&cmd)
    order, err := service.Place(r.Context(), cmd)
    writeHTTP(w, order, err)
}
func (g *GRPCServer) Place(ctx context.Context, req *pb.PlaceRequest) (*pb.Order, error) {
    return toPB(service.Place(ctx, PlaceOrder{SKU:req.Sku, Quantity:int(req.Quantity)}))
}`,
        output: `HTTP invalid quantity -> 400 INVALID_QUANTITY
gRPC invalid quantity -> InvalidArgument
same domain validation line executed for both

两个传输适配器调用同一 Service.Place。
非法数量由同一领域规则拒绝。`,
      }],
      ['只换门面不改核心', '同一份 CreateOrder 被两个门面复用：Gin 侧把 JSON body 绑定成请求结构体再转领域输入，gRPC 侧把 proto 生成的消息转同样的领域输入，两边各写少量适配代码，业务逻辑一行不改。新加一种协议只需再写一个适配器，回归测试也只针对适配层，这就是传输层薄、领域层厚的直接收益。', '适配层各写各的', {
        title: 'Go：两个适配器复用同一核心',
        language: 'Go',
        code: `func toDomain(input CreateOrderJSON) PlaceOrder {
    return PlaceOrder{SKU: input.SKU, Quantity: input.Quantity}
}
func toDomainGRPC(input *pb.PlaceRequest) PlaceOrder {
    return PlaceOrder{SKU: input.Sku, Quantity: int(input.Quantity)}
}

httpOrder, _ := service.Place(ctx, toDomain(jsonInput))
grpcOrder, _ := service.Place(ctx, toDomainGRPC(protoInput))
fmt.Println(httpOrder.ID == grpcOrder.ID)`,
        output: `true

两种 DTO 都转换为同一 PlaceOrder。
新增协议只需新适配器，不复制业务逻辑。`,
      }],
      ['错误映射对照', '领域层定义 ErrNotFound、ErrValidation 等哨兵错误，两个适配器各自维护映射：REST 侧 NotFound 转 404、Validation 转 400，gRPC 侧分别转 codes.NotFound 与 codes.InvalidArgument。映射表只写在适配层，内部错误统一转 500 或 codes.Internal 且不透出细节，防止把 SQL 片段与内部路径泄漏给调用方。', '映射表住适配层', {
        title: 'Go：领域错误双协议映射',
        language: 'Go',
        code: `func writeHTTP(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, ErrNotFound):
        writeProblem(w, 404, "ORDER_NOT_FOUND")
    case errors.Is(err, ErrValidation):
        writeProblem(w, 400, "INVALID_ORDER")
    default:
        writeProblem(w, 500, "INTERNAL_ERROR")
    }
}
func toGRPC(err error) error {
    switch {
    case errors.Is(err, ErrNotFound):
        return status.Error(codes.NotFound, "ORDER_NOT_FOUND")
    case errors.Is(err, ErrValidation):
        return status.Error(codes.InvalidArgument, "INVALID_ORDER")
    default:
        return status.Error(codes.Internal, "INTERNAL_ERROR")
    }
}`,
        output: `not found -> HTTP 404 / gRPC NotFound
validation -> HTTP 400 / gRPC InvalidArgument
internal SQL error -> HTTP 500 / gRPC Internal without raw detail

领域错误在适配层映射为传输错误。
内部 SQL 和路径不泄漏给调用方。`,
      }],
      ['超时行为对比', 'REST 侧超时靠 http.Server 的 WriteTimeout 兜底，但客户端若不主动传 deadline 头，服务端无法感知调用方还剩多少预算；gRPC 的 deadline 随每个请求自动传播，服务端 ctx 直接继承。实验让两端客户端都带相同预算（如 800 毫秒），观察慢查询下的取消时机：gRPC 时限一到就取消下游，REST 需要额外用 request context 接力。', '时限自动传播', {
        title: 'PowerShell：HTTP 与 gRPC 同预算比较',
        language: 'PowerShell',
        code: `curl.exe -s -o http.json -w "http=%{http_code}; ms=%{time_total}; " --max-time 0.8 http://127.0.0.1:8080/orders/slow
ghz --insecure --proto proto/orders.proto --call orders.OrderService.GetOrder -d '{"id":"slow"}' --timeout 800ms -n 1 127.0.0.1:9090
psql $env:DATABASE_URL -c "select count(*) from pg_stat_activity where application_name='orders'"
Get-Content http.json`,
        output: `http=504; ms=0.801;
gRPC: DeadlineExceeded
active slow DB queries: 0

两种协议都在约 800ms 结束客户端执行。
HTTP 需显式把 request context 传给数据库，gRPC deadline 原生传播。`,
      }],
      ['健康检查独立端口', '健康检查挂在与业务不同的端口上：liveness 只报进程活着，readiness 才探测数据库连接等真实依赖。分开端口后运维可以只把健康端口开放给 LB 与探针，业务端口不对外暴露；gRPC 服务还要实现标准 health 协议（grpc_health_v1），K8s 用 grpc probe 直接检查，不必为探活再起一个 HTTP 服务。', '探针口别混业务', {
        title: 'Go：独立健康端口与 gRPC health',
        language: 'Go',
        code: `healthMux := http.NewServeMux()
healthMux.HandleFunc("/live", func(w http.ResponseWriter, _ *http.Request) {
    w.WriteHeader(200)
})
healthMux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
    if err := db.PingContext(r.Context()); err != nil {
        w.WriteHeader(503); return
    }
    w.WriteHeader(200)
})
go http.ListenAndServe(":9091", healthMux)

healthServer := health.NewServer()
healthpb.RegisterHealthServer(grpcServer, healthServer)
healthServer.SetServingStatus("orders", healthpb.HealthCheckResponse_SERVING)`,
        output: `GET :9091/live -> 200 alive
GET :9091/ready with DB down -> 503
grpc health Check(orders) -> SERVING

业务端口不暴露探针。
K8s 可用 HTTP probe 和 grpc probe 分别检查。`,
      }],
    ],
  },
];

// ── G5 测试、模糊、集成与可观测性 ─────────────────────────────────────────────
const goG5Stage = '测试、模糊、集成与可观测性';
const goG5Name = (topic: string) => `Go · ${goG5Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG5Name('表驱动测试、并行和 golden file'),
    track,
    minutes: 38,
    prerequisite: '学员已能编写带断言的普通测试函数并通过 go test 运行。',
    goal: '掌握表驱动测试的数据与断言分离写法，理解 t.Parallel 的暂停再调度语义，能用 golden file 与 t.Helper 把复杂输出比对和失败定位做扎实。',
    guidedPractice: '现场把一个排序函数的三个用例改写成切片表驱动加 t.Run，给子测试加 t.Parallel 后对比 -parallel=1 与默认值的执行顺序差异，再为一段 JSON 渲染输出建立 .golden 基线并演示 -update 流程，把执行顺序记录进笔记。',
    independentPractice: '独立完成：为字符串处理函数编写不少于六条用例的表驱动测试，其中三条加 t.Parallel 并处理循环变量捕获；再为一段表格渲染输出建立 golden 基线，改一次实现并跑 -update 提交基线差异。',
    commonErrors: ['在并行子测试里直接捕获循环变量且未拷贝，所有用例断言的都是最后一条数据。', '改了输出格式却忘记跑 -update，golden 基线长期过期，测试失败被习惯性忽略。'],
    sourceRefs: ['Go Testing Documentation. https://pkg.go.dev/testing', 'Go Blog: Cover your code. https://go.dev/blog/cover'],
    steps: [
      ['表驱动测试骨架', '表驱动测试把用例收进切片，元素是匿名结构体：name 字段给子测试命名，input 与 want 字段装输入与期望。循环里用 t.Run(tc.name, func(t *testing.T) 拉起子测试，断言逻辑只写一次。用 map 也能驱动，但 map 迭代顺序随机，失败顺序不稳定，切片更可控。', '数据与逻辑分离', {
        title: 'Go：表驱动 t.Run 测试',
        language: 'Go',
        code: `func TestNormalize(t *testing.T) {
    tests := []struct{ name, input, want string }{
        {"trim", "  Ada ", "Ada"},
        {"empty", "", ""},
        {"case", "ada", "ada"},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            if got := strings.TrimSpace(tc.input); got != tc.want {
                t.Fatalf("got %q want %q", got, tc.want)
            }
        })
    }
}`,
        output: `=== RUN TestNormalize/trim
=== RUN TestNormalize/empty
=== RUN TestNormalize/case
PASS

每条数据生成独立子测试。
失败名称直接指出输入组合。`,
      }],
      ['t.Parallel 调度', 't.Parallel() 并不立即并行：子测试先暂停自己，让外层循环把所有用例登记完，再统一调度执行，并发上限由 -parallel 控制；父测试要等全部并行子测试结束才算完成。Go 1.22 之前循环变量被共享，需在循环体写 tc := tc 拷贝，否则每个子测试都拿到最后一个用例。', '登记完再并行', {
        title: 'Go：t.Parallel 与循环变量捕获',
        language: 'Go',
        code: `for _, tc := range []int{1, 2, 3} {
    tc := tc
    t.Run(fmt.Sprint(tc), func(t *testing.T) {
        t.Parallel()
        time.Sleep(10 * time.Millisecond)
        fmt.Println(tc)
    })
}`,
        output: `go test -run TestParallel -parallel=1 -v
1
2
3
go test -run TestParallel -parallel=3 -v
1
2
3 interleaved

子测试先暂停登记，父测试结束后统一调度。
tc 拷贝避免旧版 Go 循环变量共享。`,
      }],
      ['golden file 流程', 'golden file 把复杂输出（渲染结果、报表）存成基线文件，测试时读 testdata 下的 .golden 与实际输出逐字节比对，失败打印差异。文件里定义 update = flag.Bool("update", ...)，跑 go test -update 即把当前输出写回基线，基线变化进入 diff 审查。Go 工具链忽略 testdata，不会编译其中的文件。', '基线文件入库', {
        title: 'Go：golden file 更新与比较',
        language: 'Go',
        code: `var update = flag.Bool("update", false, "update golden files")

func TestRender(t *testing.T) {
    got := renderOrders([]Order{{ID:"O-1", Total:100}})
    path := filepath.Join("testdata", "orders.golden")
    if *update { os.WriteFile(path, []byte(got), 0644) }
    want, _ := os.ReadFile(path)
    if diff := cmp.Diff(string(want), got); diff != "" { t.Fatal(diff) }
}`,
        output: `go test ./render
render mismatch -orders.golden +actual
go test ./render -update
PASS
git diff testdata/orders.golden

失败时输出完整差异。
-update 写回基线，基线变更进入代码评审。`,
      }],
      ['t.Helper 修堆栈', '测试里抽公共断言函数时，失败报告默认停在函数内部那一行，看不出是哪个用例调用导致。在函数开头写 t.Helper()，框架把它从堆栈里剔除，报错行号直接指向调用方。配合 t.Cleanup 注册收尾逻辑，无论用例成败都执行，避免手动 defer 在子测试里漏清理。', '失败指向调用方', {
        title: 'testing：t.Helper 与 t.Cleanup',
        language: 'Go',
        code: `func resetDir(t *testing.T) {
    t.Helper()
    dir := t.TempDir()
    t.Cleanup(func() { os.RemoveAll(dir) })
    if _, err := os.Stat(dir); err != nil { t.Fatal(err) }
}

func TestOrder(t *testing.T) {
    resetDir(t)
    t.Fatal("domain failure")
}`,
        output: `--- FAIL: TestOrder
    order_test.go:12: domain failure

Helper 把 resetDir 帧从失败堆栈隐藏。
报错行指向调用方 TestOrder，清理由 t.Cleanup 保证。`,
      }],
      ['三种手段的分工', '三者分工明确：纯函数的输入输出组合用表驱动，补用例只需加一行数据；大段文本或 JSON 的整体比对交给 golden file，避免在断言里塞几百行期望串；相互独立、无共享状态的用例才加 t.Parallel，有顺序依赖的用例并行只会制造偶发失败。选错手段的代价是测试难以维护。', '按输出形态选型', {
        title: 'Go：按测试目标选择手段',
        language: 'Go',
        code: `// 纯函数：表驱动
func TestDiscount(t *testing.T) {
    for _, tc := range cases { t.Run(tc.name, func(t *testing.T) { ... }) }
}
// 复杂输出：golden
func TestInvoiceHTML(t *testing.T) { compareGolden(t, render()) }
// 独立用例：并行
func TestShard(t *testing.T) {
    for _, shard := range shards {
        shard := shard
        t.Run(shard.Name, func(t *testing.T) { t.Parallel(); ... })
    }
}`,
        output: `table tests cover input combinations
golden test compares large rendered output
parallel subtests run independent shards concurrently

输入组合、复杂输出和并行独立性分别用不同手段。
不要用几百行内联期望串替代 golden 文件。`,
      }],
    ],
  },
  {
    name: goG5Name('httptest、容器集成测试'),
    track,
    minutes: 40,
    prerequisite: '学员已写过带中间件与路由的 HTTP 服务并能解释请求生命周期。',
    goal: '理解直调 handler 与真实端口测试的覆盖差异，掌握 testcontainers 起真实依赖的代价收益，能用构建标签把慢测试与日常反馈隔离并管好清理与超时。',
    guidedPractice: '跟随演示给一个带日志中间件的 handler 分别写 recorder 直调版与 httptest.Server 版两个测试，对比断言差异；再用 testcontainers 起一个 postgres 容器执行建表查询，抄录容器启动等待耗时与清理输出。',
    independentPractice: '独立完成：给仓储层写一组 -tags=integration 的测试，用 testcontainers 起独立容器，全部清理走 t.Cleanup，单用例包 context.WithTimeout，验证无标签运行时整包跳过且零容器残留。',
    commonErrors: ['集成测试忘记挂构建标签，每次提交都起容器，本地测试反馈被拖到分钟级。', '容器清理写在用例末尾而非 t.Cleanup，断言失败后容器残留占住端口。'],
    sourceRefs: ['Go Testing Documentation. https://pkg.go.dev/testing', 'Go Blog: Cover your code. https://go.dev/blog/cover'],
    steps: [
      ['httptest 双入口', 'httptest.NewServer(handler) 在 127.0.0.1 随机端口起一个真实 HTTP 服务，s.URL 属性给出可请求地址，用 http.Get(s.URL) 走完整网络栈后调 s.Close() 释放。另一个入口 httptest.NewRequest 与 recorder.ResponseRecorder 不占端口，直接把响应写进内存，适合只测 handler 内部的场景。', '真实端口全链路', {
        title: 'httptest：Recorder 与真实 Server',
        language: 'Go',
        code: `handler := middleware(mux)
req := httptest.NewRequest("GET", "/orders/O-1", nil)
rec := httptest.NewRecorder()
handler.ServeHTTP(rec, req)
fmt.Println(rec.Code, rec.Header().Get("X-Request-ID"))

server := httptest.NewServer(handler)
defer server.Close()
resp, _ := http.Get(server.URL + "/orders/O-1")
fmt.Println(resp.StatusCode)`,
        output: `200 req-7f21
200

Recorder 直调覆盖 handler 与内存响应。
NewServer 再覆盖真实网络、客户端和连接栈。`,
      }],
      ['直调漏掉的层', '直接调用 handler 函数会跳过路由匹配、中间件链、请求编码与传输层，gzip 压缩、超时中断、连接复用这些行为统统测不到。起真实端口后，请求经过完整 http.Client 与服务端栈，header 设置、状态码、慢响应的客户端超时都能真实复现，代价只是多一次本地回环连接。', '直调跳过中间件', {
        title: 'httptest：验证真实路由和中间件',
        language: 'Go',
        code: `handler := recoverer(requestID(logger(mux)))
server := httptest.NewServer(handler)
defer server.Close()

client := server.Client()
client.Timeout = 100 * time.Millisecond
resp, err := client.Get(server.URL + "/orders/slow")
fmt.Println(resp.StatusCode, err)

resp, _ = client.Get(server.URL + "/not-found")
fmt.Println(resp.StatusCode)`,
        output: `200 context deadline exceeded
404

真实 Client 触发超时与完整 ServeMux 匹配。
Recorder 直调无法覆盖 client timeout 与连接栈。`,
      }],
      ['容器测试代价', 'go-testcontainers-go 能在测试里起一个 postgres:16 或 redis 容器，用 wait.ForListeningPort 等到就绪再跑用例，SQL 方言、事务隔离、索引行为与生产一致，这是内存 sqlite 或 miniredis 给不了的。代价是每次启动数十秒、需要本机有 Docker，因此只给真正碰存储的用例。', '真实依赖换时间', {
        title: 'testcontainers：启动 PostgreSQL',
        language: 'Go',
        code: `ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
defer cancel()
container, err := postgres.Run(ctx, "postgres:16",
    postgres.WithDatabase("orders_test"),
    postgres.WithUsername("app"),
    postgres.WithPassword("secret"),
    testcontainers.WithWaitStrategy(wait.ForListeningPort("5432/tcp")),
)
if err != nil { t.Fatal(err) }
t.Cleanup(func() { _ = container.Terminate(context.Background()) })
dsn, _ := container.ConnectionString(ctx, "sslmode=disable")
fmt.Println(dsn)`,
        output: `container started in 18.4s
postgresql://app:secret@127.0.0.1:49153/orders_test?sslmode=disable

测试使用真实 PostgreSQL 方言和隔离。
Terminate 在 t.Cleanup 中即使断言失败也执行。`,
      }],
      ['构建标签隔离', '集成测试文件顶部写 //go:build integration 构建标签，默认 go test 直接跳过这些文件；命令加 -tags=integration 才编译执行。这样单元测试保持秒级反馈，CI 拆成两条流水线：每次提交只跑单元，夜间或合并前跑集成，慢测试不再阻塞日常迭代。', '默认跳过慢测试', {
        title: 'Go：integration 构建标签',
        language: 'Go',
        code: `//go:build integration

package store_test

func TestPostgresRepository(t *testing.T) {
    container := startPostgres(t)
    repo := New(container.DSN())
    if err := repo.Save(context.Background(), Order{ID:"O-1"}); err != nil {
        t.Fatal(err)
    }
}`,
        output: `go test ./... -> store integration tests skipped
go test -tags=integration ./store -> TestPostgresRepository PASS
unit test duration 0.8s
integration duration 21.3s

默认构建完全忽略集成文件。
只有显式标签才启动真实容器。`,
      }],
      ['清理与超时预算', '容器类测试必须给每层设预算：TestMain 里统一启动容器供全部用例复用，单用例用 context.WithTimeout 限定数据库操作时长，防止一个悬挂查询拖垮整批。清理统一走 t.Cleanup 调 container.Terminate，即使断言失败也保证容器回收，不留僵尸进程占端口。', '清理统一兜底', {
        title: 'Go：容器测试超时与清理',
        language: 'Go',
        code: `func TestOrderStore(t *testing.T) {
    container := startPostgres(t)
    t.Cleanup(func() {
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        if err := container.Terminate(ctx); err != nil { t.Log(err) }
    })
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := repo.Save(ctx, Order{ID:"O-1"}); err != nil { t.Fatal(err) }
}`,
        output: `container test completed in 6.2s
terminate completed in 1.1s
docker ps --filter name=testcontainers -> no leftover containers

业务查询有 5 秒上限。
容器终止有独立 10 秒预算，失败时仍记录清理错误。`,
      }],
    ],
  },
  {
    name: goG5Name('go fuzz、race 和覆盖率'),
    track,
    minutes: 38,
    prerequisite: '学员已掌握表驱动写法并理解切片与 goroutine 的基本并发模型。',
    goal: '理解 fuzz 引擎的覆盖率引导变异与种子语料机制，知道语句覆盖率的统计边界，学会用 race 加 fuzz 的组合抓手工构造不出的并发缺陷。',
    guidedPractice: '现场为 URL 解析函数写 FuzzXxx，用 F.Add 投喂三个畸形样例，跑 -fuzztime=60s 观察引擎发现的新失败并查看 testdata/fuzz 下的语料；随后对同一包跑 -race 与 -cover，把三种输出各摘录一段进笔记。',
    independentPractice: '独立完成：为自己实现的 JSON 子集解析器写 fuzz 测试，投喂五个种子，本地跑五分钟 fuzz，把发现的任何崩溃语料缩成最小复现修复；再输出该包覆盖率报告，在 -html 视图里挑出两段未覆盖的错误路径补测试。',
    commonErrors: ['把覆盖率达标当成质量证明，忽视错误路径与并发交错根本不在语句统计里。', 'fuzz 目标里写依赖具体输入格式的硬断言，引擎变异出的合法变体被误判为崩溃。'],
    sourceRefs: ['Go Blog: Fuzzing. https://go.dev/blog/fuzz-beta', 'Go Blog: Cover your code. https://go.dev/blog/cover'],
    steps: [
      ['fuzz 测试契约', '命名 FuzzXxx 的函数签名收 *testing.F，内部 f.Fuzz(func(t *testing.T, data []byte) 在断言里检验不变量：不 panic、不越界、解析失败要返回错误而不是崩溃。fuzz 引擎基于覆盖率引导不断变异输入，寻找能让断言失败的组合，参数类型限定在 string、[]byte、整数与布尔等基础类型。', '引擎自动变异', {
        title: 'go test：Fuzz 解析器不变量',
        language: 'Go',
        code: `func FuzzParseOrder(f *testing.F) {
    f.Add([]byte(` + "`{\"id\":\"O-1\"}`" + `))
    f.Fuzz(func(t *testing.T, data []byte) {
        order, err := ParseOrder(data)
        if err != nil { return }
        if order.ID == "" { t.Fatalf("empty id from %q", data) }
    })
}`,
        output: `go test -fuzz=FuzzParseOrder -fuzztime=10s
fuzz: elapsed: 10s, execs: 182034, new interesting: 41
PASS

解析失败允许返回 error。
成功解析时必须满足 ID 非空不变量。`,
      }],
      ['F.Add 种子语料', 'f.Add("已知样例")、f.Add([]byte{...}) 写入初始种子语料，把历史上出过问题的输入、协议样例都喂进去，引擎在种子基础上扩展而不是从零乱试。命中失败的输入自动存进 testdata/fuzz/FuzzXxx，此后普通 go test 会先回归这些语料，崩溃可复现、可修复、可守护。', '种子撑起初始面', {
        title: 'Go：Fuzz 种子与崩溃语料',
        language: 'Go',
        code: `func FuzzParseOrder(f *testing.F) {
    f.Add([]byte(` + "`{\"id\":\"O-1\"}`" + `))
    f.Add([]byte(` + "``" + `))
    f.Add([]byte(` + "`null`" + `))
    f.Fuzz(func(t *testing.T, data []byte) {
        _ = ParseOrder(data)
    })
}`,
        output: `fuzz: found failing input
testdata/fuzz/FuzzParseOrder/7f21 saved
go test ./...
--- FAIL: FuzzParseOrder/7f21

失败输入写入 testdata/fuzz。
普通 go test 自动重放并保护同一边界。`,
      }],
      ['覆盖率真实含义', 'go test -cover 统计被执行的语句占比，-coverprofile 生成文件后用 go tool cover -html 打开，未覆盖行标红。语句覆盖的局限明显：if 的两个分支各跑过一次也可能是不同用例碰巧拼出来的，错误路径、并发交错、边界组合完全测不到，覆盖率只是下限指标不是质量证明。', '语句覆盖有盲区', {
        title: 'PowerShell：生成覆盖率 HTML',
        language: 'PowerShell',
        code: `go test -coverprofile=cover.out ./...
go tool cover -func=cover.out | Select-Object -Last 5
go tool cover -html=cover.out -o cover.html
go test -covermode=atomic -race -coverprofile=race-cover.out ./...
Get-Item cover.html | Select-Object Length`,
        output: `total: (statements) 82.4%
cover.html 184220 bytes
atomic coverage with race enabled

未覆盖的错误分支可在 HTML 中标红。
覆盖率仅统计语句，无法证明并发交错和无边界遗漏。`,
      }],
      ['race 检测原理', 'go test -race 打开竞态检测器，编译时插入读写监测，运行期用 happens-before 关系判断两个 goroutine 是否无同步地访问同一内存。检测到竞争会打印两条冲突堆栈，内存与 CPU 开销约数倍，因此适合测试环境常开而非生产常开。竞争往往低概率偶发，手工压测很难碰到。', '插桩抓数据竞争', {
        title: 'go test -race：冲突栈报告',
        language: 'PowerShell',
        code: `go test -race -run TestConcurrent -count=10 . > race.txt 2>&1
$code = $LASTEXITCODE
Select-String race.txt -Pattern "WARNING: DATA RACE|Write at|Previous write|Goroutine" -Context 0,3
Write-Output "exit=$code"`,
        output: `WARNING: DATA RACE
Write at 0x... by goroutine 18:
  main.worker main.go:24
Previous write at 0x... by goroutine 17:
  main.worker main.go:24
exit=1

两条冲突栈都指向未同步写入。
测试环境常开，生产不常开。`,
      }],
      ['race 加 fuzz 组合', '竞争与边界输入常在同一点爆发：goroutine 池消费请求、切片按输入长度扩容。用 -race 与 -fuzz 同时开启，引擎变异出极端长度与时序的输入，插桩监测同时盯着内存访问，能把单测永远排不到的交错抓出来。CI 里给 fuzz 设 -fuzztime=60s 短跑，深度探索留给夜间任务。', '并发边界靠组合', {
        title: 'Go：race 与 fuzz 同时开启',
        language: 'PowerShell',
        code: `go test -race -fuzz=FuzzConcurrentParse -fuzztime=60s . > fuzz-race.txt 2>&1
Select-String fuzz-race.txt -Pattern "DATA RACE|fuzz: elapsed|FAIL|PASS" | Select-Object -Last 20
go test -race ./... -run '^$' -fuzz=FuzzConcurrentParse -fuzztime=5s`,
        output: `fuzz: elapsed: 60s, execs: 224110
WARNING: DATA RACE
main.parseShard main.go:52
PASS->FAIL

极端长度输入触发 grow 与 worker 并发访问。
race 插桩在同一轮 fuzz 中抓到冲突。`,
      }],
    ],
  },
  {
    name: goG5Name('slog、开放遥测和 requestId'),
    track,
    minutes: 40,
    prerequisite: '学员已在服务里接入过日志库并能说明日志采集的基本链路。',
    goal: '掌握 slog 的结构化字段与等级开销，理解 OTel span 依托 context 传播的接线规则，能把 trace_id 与 requestId 桥接成日志与链路两条证据链。',
    guidedPractice: '跟随演示把一个 handler 的字符串拼接日志改成 slog JSONHandler，用 -level 参数切换等级观察输出变化；再接入 OTel tracer 起两个嵌套 span，故意断开 ctx 传递复现链路断裂，把修复前后的 trace 树截图对比。',
    independentPractice: '独立完成：给一个小型 HTTP 服务接齐 slog 结构化日志与 OTel 链路，中间件里生成 requestId 并把 trace_id 注入日志，造一次 500 错误，用 trace_id 从日志聚合出完整时间线并对照 span 瀑布核验。',
    commonErrors: ['在 goroutine 里用 context.Background() 起新链路，span 树断裂无法关联。', '高 QPS 接口里遗留大量 Debug 日志调用，等级过滤后仍白白消耗 CPU 与磁盘。'],
    sourceRefs: ['OpenTelemetry Go. https://opentelemetry.io/docs/languages/go/', 'Go Testing Documentation. https://pkg.go.dev/testing'],
    steps: [
      ['slog 结构化日志', 'slog.Info("http request", "method", r.Method, "cost_ms", ms) 用键值对而非拼接字符串，结构化字段进 handler 后可输出 JSON 供采集端解析。slog.New(slog.NewJSONHandler(os.Stdout, nil)) 设全局 logger，Level 参数控制最低输出等级，Debug/Info/Warn/Error 四级从细到粗。', '键值走结构化', {
        title: 'slog：JSON 结构化日志',
        language: 'Go',
        code: `logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
logger.Info("http request",
    "requestId", "req-7f21",
    "method", "GET",
    "path", "/orders/O-1",
    "cost_ms", 12,
)
logger.Debug("expensive detail", "body", hugePayload())`,
        output: `{"time":"2026-11-24T11:00:00Z","level":"INFO","msg":"http request","requestId":"req-7f21","method":"GET","path":"/orders/O-1","cost_ms":12}

结构化字段可直接被日志系统索引。
Debug 在 Info 等级下不会输出。`,
      }],
      ['等级与生产代价', '即使 Debug 被等级过滤不输出，参数求值与 handler 判断仍会发生，高 QPS 下每请求十几条 Debug 日志就是可观的 CPU 与磁盘税。日志也不是调试断点：它只能记录预先想到的字段，事后翻日志定位是最低效的排查方式，应先用 trace 锁定慢请求或错误请求，再用日志确认细节。', '低级别也是开销', {
        title: 'slog：条件构造昂贵字段',
        language: 'Go',
        code: `if logger.Enabled(ctx, slog.LevelDebug) {
    logger.DebugContext(ctx, "payload",
        "body", json.Marshal(payload),
        "headers", redact(r.Header),
    )
}

start := time.Now()
logger.InfoContext(ctx, "request_done",
    "method", r.Method,
    "status", status,
    "duration_ms", time.Since(start).Milliseconds(),
)`,
        output: `Enabled=false skips marshal/redact work
{"level":"INFO","msg":"request_done","method":"GET","status":200,"duration_ms":12}

过滤等级前先检查 Enabled，避免无意义构造参数。
高频请求只保留可检索的摘要字段。`,
      }],
      ['OTel 与 ctx', 'otel.Tracer("api").Start(ctx, "handleRequest") 返回新的 ctx 与 span，span 状态就挂在 ctx 里向下游传播：调用数据库、发 HTTP 时把 ctx 传下去，子 span 自动挂到父 span 形成树。忘记传 ctx 或在 goroutine 里用 context.Background() 起新链，链路就断成孤岛，这是最常见的接线错误。', 'ctx 携带链路', {
        title: 'OTel：span 沿 context 传播',
        language: 'Go',
        code: `ctx, span := tracer.Start(r.Context(), "GET /orders/{id}")
defer span.End()

ctx, dbSpan := tracer.Start(ctx, "db.find_order")
order, err := repo.Find(ctx, id)
dbSpan.End()
if err != nil {
    span.RecordError(err)
    span.SetStatus(codes.Error, err.Error())
}

ctx, httpSpan := tracer.Start(ctx, "payment.reserve")
defer httpSpan.End()
_ = payment.Reserve(ctx, order)`,
        output: `trace 7f21a
  GET /orders/{id} 18ms
    db.find_order 7ms
    payment.reserve 9ms

子 span 使用父 ctx 建立层级。
使用 context.Background 会产生断开的根 span。`,
      }],
      ['两级标识互补', 'requestId 是入口中间件生成的一次请求标识，跟着响应头返回给调用方，便于用户报障时直接检索；trace 是 span 树的内部结构，trace_id 串联所有 span。两者关系是互补：把 trace_id 作为属性写进每条日志，把 requestId 记为根 span 属性，外部用 requestId 检索、内部用 trace 看调用树。', '两级标识互补', {
        title: 'Go：requestId 与 trace_id 写入日志',
        language: 'Go',
        code: `requestID := "req-7f21"
ctx, span := tracer.Start(r.Context(), "handleRequest")
defer span.End()
span.SetAttributes(attribute.String("request.id", requestID))
traceID := span.SpanContext().TraceID().String()
logger := slog.With("request_id", requestID, "trace_id", traceID)

logger.InfoContext(ctx, "request_start", "path", r.URL.Path)
logger.InfoContext(ctx, "db_query", "rows", len(rows))
logger.InfoContext(ctx, "request_done", "status", 200)`,
        output: `{"msg":"request_start","request_id":"req-7f21","trace_id":"7f21a"}
{"msg":"db_query","request_id":"req-7f21","trace_id":"7f21a","rows":20}
{"msg":"request_done","request_id":"req-7f21","trace_id":"7f21a","status":200}

用户报障用 requestId 检索，内部按 trace 查看 span 瀑布。
两条证据链共享同一个上下文。`,
      }],
      ['中间件里桥接', '落地做法是在 HTTP 中间件里一次完成：提取上游 trace 上下文、生成 span、把 trace_id 塞进 slog 的日志属性（logger = logger.With("trace_id", ...))，之后这条请求内所有日志自动携带。查故障时按 trace_id 聚合日志得到时间线，跳 trace 平台看 span 瀑布，两条证据链互相印证。', '日志串起链路', {
        title: 'Go：HTTP 中间件桥接日志与 Trace',
        language: 'Go',
        code: `func observability(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx, span := tracer.Start(r.Context(), "http.request")
        defer span.End()
        requestID := uuid.NewString()
        traceID := span.SpanContext().TraceID().String()
        logger := slog.With("request_id", requestID, "trace_id", traceID)
        ctx = withLogger(ctx, logger)
        w.Header().Set("X-Request-ID", requestID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}`,
        output: `response X-Request-ID: req-7f21
all downstream logs include trace_id=7f21a
trace waterfall includes db, payment and outbound HTTP spans

中间件一次完成 requestId、span 与 logger 注入。
日志与 trace 可按同一 trace_id 互跳。`,
      }],
    ],
  },
  {
    name: goG5Name('指标、Trace、告警和运行手册'),
    track,
    minutes: 38,
    prerequisite: '学员已能读懂服务的错误率与延迟曲线并知道指标端点的位置。',
    goal: '掌握四类指标语义与选型依据，会用 RED 三问搭建服务仪表盘，能设计带升级路径的告警分级并写出值班者可独立执行的运行手册。',
    guidedPractice: '现场用 Prometheus 客户端给一个 HTTP 服务埋 counter、gauge 与 histogram 三种指标，写出 RED 三问对应的 PromQL 并在本地 Prometheus 上执行，把五分钟错误率与 P95 延迟的两条查询语句和结果抄进仪表盘草稿。',
    independentPractice: '独立完成：为练习服务设计并落地三档告警：错误率突升触发 page、磁盘增长进 ticket、慢查询静默观察，每条告警配一段运行手册，内容含首查命令与升级联系人，最后演练一次按手册处置的全过程。',
    commonErrors: ['把延迟分位数用 Summary 记录再跨实例聚合，分位数在聚合端失去意义。', '告警只设阈值不给处置步骤，值班者反复被叫醒后开始忽略同类告警。'],
    sourceRefs: ['OpenTelemetry Go. https://opentelemetry.io/docs/languages/go/', 'Go Testing Documentation. https://pkg.go.dev/testing'],
    steps: [
      ['指标四种类型', 'Prometheus 指标四类语义不同：Counter 只增不减，记请求总数、错误总数，进程重启后靠 rate 函数消化重置；Gauge 可升可降，记连接数、队列长度、内存占用；Histogram 在服务端分桶记分布，能算 P99 延迟；Summary 在客户端直接算分位，无法跨实例聚合。选型看语义而不是顺手。', '按语义选类型', {
        title: 'Prometheus Go：四类指标定义',
        language: 'Go',
        code: `requests := prometheus.NewCounterVec(
    prometheus.CounterOpts{Name:"orders_http_requests_total"}, []string{"route","status"},
)
active := prometheus.NewGauge(
    prometheus.GaugeOpts{Name:"orders_active_connections"},
)
duration := prometheus.NewHistogramVec(
    prometheus.HistogramOpts{Name:"orders_http_duration_seconds", Buckets:prometheus.DefBuckets},
    []string{"route"},
)
registry.MustRegister(requests, active, duration)`,
        output: `orders_http_requests_total{route="/orders",status="200"} 1821
orders_active_connections 37
orders_http_duration_seconds_bucket{route="/orders",le="0.1"} 1450

Counter 记单调请求数，Gauge 记当前连接，Histogram 记延迟桶。
分位由 PromQL 跨实例聚合 histogram_quantile。`,
      }],
      ['RED 三问', 'RED 方法给每个服务三个必看问题：Rate 每秒多少请求（rate(http_requests_total[5m])）、Errors 错误占比多少（错误速率除以总速率）、Duration 延迟分布如何（histogram_quantile(0.95, ...) 取分位）。三个数放同一仪表盘，请求量突降、错误率突升、P99 抖动任何一项异常都值得先看。', '三指标看健康', {
        title: 'PromQL：RED 三指标',
        language: 'PromQL',
        code: `sum(rate(orders_http_requests_total[5m]))

sum(rate(orders_http_requests_total{status=~"5.."}[5m]))
/
sum(rate(orders_http_requests_total[5m]))

histogram_quantile(0.95,
  sum by (le) (rate(orders_http_duration_seconds_bucket[5m]))
)`,
        output: `rate=182 req/s
error_ratio=0.003
p95=180ms

Rate、Errors、Duration 同屏查看。
请求量突降也需要调查，不只看错误率。`,
      }],
      ['告警分级防抖', '告警必须带升级路径而不是同一阈值炸响所有人：错误率 5% 持续 2 分钟触发 page，深夜打电话；磁盘 80% 缓慢增长进 ticket，白天处理；低于两者进 dashboard 静默观察。PromQL 里 for 子句做持续时间防抖，瞬时毛刺不再触发。没有处置方案的告警等于噪音，会训练值班者忽略它。', '阈值分层要升级', {
        title: 'Prometheus：分级告警规则',
        language: 'YAML',
        code: `groups:
  - name: orders
    rules:
      - alert: OrdersErrorBudgetFastBurn
        expr: sum(rate(orders_http_requests_total{status=~"5.."}[5m])) /
              sum(rate(orders_http_requests_total[5m])) > 0.05
        for: 2m
        labels: { severity: page, runbook: orders-errors }
      - alert: OrdersDiskGrowth
        expr: orders_disk_used_ratio > 0.8
        for: 30m
        labels: { severity: ticket, runbook: orders-disk }
      - alert: OrdersP95Watch
        expr: histogram_quantile(0.95, sum by(le)(rate(orders_http_duration_seconds_bucket[5m]))) > 0.5
        for: 10m
        labels: { severity: dashboard, runbook: orders-latency }`,
        output: `page fires only after 2m error>5%
ticket fires after 30m disk>80%
dashboard-only watch for p95>500ms 10m

for 持续窗口抑制瞬时毛刺。
三档告警分别有 runbook 与通知级别。`,
      }],
      ['运行手册写法', '运行手册是给凌晨三点被叫醒的值班者看的：每条告警一节，写清该告警含义、第一分钟跑什么命令确认、每步处置动作与回滚方法、何时升级给谁。判断标准是不读源码、不了解这个服务的人也能照着执行到结束。手册与告警同库维护，改阈值必须同步改手册，否则两处漂移。', '值班者照单行动', {
        title: 'Markdown：Go 服务告警运行手册',
        language: 'Markdown',
        code: `# OrdersErrorBudgetFastBurn
Meaning: 5-minute 5xx ratio above 5%.

## First minute
1. kubectl rollout history deployment/orders
2. Check dashboard route=orders and recent digest.
3. Run: kubectl logs deploy/orders --since=10m | grep requestId

## Stop the bleed
- If latest rollout: kubectl rollout undo deployment/orders
- If downstream payment: disable checkout feature flag
- Verify: error ratio below 1% for 5 minutes

## Escalate
- 10 minutes without recovery: page payments on-call.
- Data inconsistency: open incident and freeze writes.`,
        output: `on-call can identify recent change in first minute
rollback command and recovery threshold are explicit
escalation path names owner and data-safety action

手册不依赖源码或口头背景。
告警规则与该章节同库版本控制。`,
      }],
      ['指标与 trace 关联', '指标是完整采样、聚合后的地面真相，trace 是抽样明细，二者要能互相跳转：告警从指标出发，点进 exemplar 携带的 trace_id 看到具体慢请求的 span 瀑布；trace 缺失时（采样没抽中）退回指标分桶定位。只看指标不知道哪个请求慢，只看 trace 不知道整体水位，两条证据链缺一不可。', '告警跳证据链', {
        title: 'Grafana：指标 exemplar 跳 trace',
        language: 'YAML',
        code: `datasources:
  - name: Prometheus
    type: prometheus
    jsonData:
      exemplarTraceIdDestinations:
        - name: trace_id
          datasourceUid: tempo
  - name: Tempo
    type: tempo
    uid: tempo

dashboard:
  panels:
    - title: Orders P99
      expr: histogram_quantile(0.99, sum by(le)(rate(orders_http_duration_seconds_bucket[5m])))
      exemplars: true`,
        output: `alert panel P99 spike
exemplar trace_id=7f21a opens Tempo span waterfall
trace shows payment.reserve 3.8s

指标定位整体水位，exemplar 跳到具体慢请求。
采样未命中时继续用 histogram 分桶和日志缩小范围。`,
      }],
    ],
  },
  {
    name: goG5Name('质量门禁与故障注入实验'),
    track,
    minutes: 40,
    prerequisite: '学员已能独立编写单元与集成测试并理解 CI 流水线的阶段划分。',
    goal: '能把 lint、race、覆盖率阈值与 fuzz 短跑串成 CI 门禁，会用容器杀死、断网与慢依赖注入验证重试降级，并把失败实验固化为回归清单。',
    guidedPractice: '跟随演示搭建一条四阶段门禁脚本：golangci-lint、go test -race、覆盖率阈值判断、fuzz 种子回归，故意提交一个低覆盖改动观察哪一关拦住；再用 docker stop 杀掉依赖容器复现一次重试日志，把拦截输出与恢复时间记录进实验单。',
    independentPractice: '独立完成：为个人项目配齐四关门禁并实际阻断一次不合格提交；再从故障清单挑三条（杀容器、断网、慢依赖）各执行一遍，记录系统行为与恢复时间，把其中暴露的缺陷修成回归用例并归入清单。',
    commonErrors: ['全局覆盖率达标掩盖了新增模块的低覆盖，缺陷从新代码溜进主干。', '故障实验做完只口头汇报，暴露的缺陷没有落成回归用例，同类问题复发。'],
    sourceRefs: ['Go Blog: Fuzzing. https://go.dev/blog/fuzz-beta', 'Go Testing Documentation. https://pkg.go.dev/testing'],
    steps: [
      ['门禁流水线串联', 'CI 门禁按序执行四关，任一关非零退出码即阻断合并：golangci-lint 抓风格与静态缺陷；go test -race -count=1 跑全量测试并开竞态检测；覆盖率脚本用 go tool cover -func 汇总总覆盖率，低于阈值直接失败；最后对 fuzz 目标短跑一遍种子回归。顺序从快到慢，失败尽早暴露。', '非零退出码阻断', {
        title: 'GitHub Actions：Go 四关门禁',
        language: 'YAML',
        code: `steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-go@v5
    with: { go-version: "1.23" }
  - run: golangci-lint run
  - run: go test -race -count=1 ./...
  - run: go test -coverprofile=cover.out ./...
  - run: go tool cover -func=cover.out | awk '/total:/ {gsub("%","",$3); exit !($3 >= 80)}'
  - run: go test -run=^$ ./...`,
        output: `lint: Passed
race: Passed
coverage: total 82.4% >= 80
fuzz seed corpus: Passed

任一命令非零退出即阻断合并。
快速 lint 在前，race 与覆盖率在后。`,
      }],
      ['覆盖率阈值落地', '阈值不能只看全局总覆盖率——旧代码的高覆盖会掩护新增低覆盖代码。落地做法是脚本解析 go tool cover -func 的输出，对本次改动文件单独算覆盖率并卡阈值，或用总覆盖率只升不降规则：低于上次合并的结果即失败。阈值先定在现实可达的水平再逐步上调，一步到位只会鼓励刷覆盖率。', '防新代码拉低', {
        title: 'PowerShell：按改动文件检查覆盖率',
        language: 'PowerShell',
        code: `git diff --name-only origin/main...HEAD -- "*.go" > changed.txt
go test -coverprofile=cover.out ./...
$profile = go tool cover -func=cover.out
foreach ($file in Get-Content changed.txt | Where-Object { $_ -like "*_test.go" -eq $false }) {
  $lines = $profile | Select-String ([regex]::Escape($file))
  if (-not $lines) { continue }
  $total = ($lines | ForEach-Object { [double](($_ -split "\\s+")[-1].Trim('%')) } | Measure-Object -Average).Average
  if ($total -lt 70) { throw "coverage $total% below 70 for $file" }
}`,
        output: `changed files: 4
orders/service.go coverage=78% PASS
orders/parser.go coverage=64% FAIL

全局覆盖率可能达标，但新增 parser 低于 70% 被阻断。
阈值按改动文件独立检查。`,
      }],
      ['fuzz 进 CI', 'CI 里 fuzz 有两种强度：普通 go test 阶段会免费回归 testdata 下的种子语料与历史崩溃，不需要 -fuzz 参数；-fuzz 加 -fuzztime=60s 是让引擎变异探索一分钟的短跑，放合并前流水线。深度探索数小时的 fuzz 放夜间定时任务，找到崩溃自动开 issue，附上语料文件路径。', '短跑加夜间挖', {
        title: 'GitHub Actions：fuzz 短跑与夜间任务',
        language: 'YAML',
        code: `on:
  pull_request:
  schedule:
    - cron: "0 2 * * *"
jobs:
  fuzz-short:
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - run: go test -run=^$ -fuzz=FuzzParse -fuzztime=60s ./...
  fuzz-long:
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v4
      - run: go test -run=^$ -fuzz=FuzzParse -fuzztime=2h ./...
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: fuzz-corpus, path: testdata/fuzz/FuzzParse }`,
        output: `pull request fuzz elapsed=60s PASS
nightly fuzz elapsed=2h found crash
artifact fuzz-corpus uploaded

普通 go test 已回归历史语料。
短跑和夜间任务分别设置 fuzztime。`,
      }],
      ['故障注入实验', '重试与降级写在代码里不等于生效，要靠真实破坏验证：docker stop 直接杀掉依赖容器，看连接池报错是否被正确重试；tc netem 注入 200ms 延迟与丢包，验证超时与熔断阈值；toxiproxy 给依赖加慢响应，观察队列是否会积压雪崩。每次注入都要记录系统恢复到稳态的时间。', '真断才见真行为', {
        title: 'Toxiproxy：注入依赖延迟',
        language: 'PowerShell',
        code: `docker run -d --name toxiproxy -p 8474:8474 -p 26379:26379 ghcr.io/shopify/toxiproxy:2.9.0
curl.exe -X POST http://127.0.0.1:8474/proxies -H "Content-Type: application/json" -d '{"name":"redis","listen":"0.0.0.0:26379","upstream":"redis:6379"}'
curl.exe -X POST http://127.0.0.1:8474/proxies/redis/toxics -H "Content-Type: application/json" -d '{"name":"latency","type":"latency","attributes":{"latency":2000,"jitter":200}}'
k6 run --summary-export degraded.json perf/orders.js
curl.exe -X DELETE http://127.0.0.1:8474/proxies/redis/toxics/latency
Start-Sleep -Seconds 10
k6 run --summary-export recovered.json perf/orders.js`,
        output: `degraded: p99=3.2s, errors=0.8%, fallback=1802
recovered: p99=180ms, errors=0.1%
recovery time=9.4s

Redis 延迟 2s 时请求进入降级。
删除故障后 10 秒内 p99 与错误率恢复。`,
      }],
      ['失败进回归清单', '故障实验的价值在于沉淀：每次暴露的缺陷，修完立刻变成一个回归用例（用构建标签或测试名归组），注入手法本身也登记进实验清单。清单分两档：合并前跑影响核心链路的三五条，夜间全量跑。新服务上线前过一遍清单，老服务改架构后重跑，防止修复随重构悄悄退化。', '实验固化为清单', {
        title: 'YAML：故障回归清单',
        language: 'YAML',
        code: `pre_merge:
  - id: redis-timeout
    inject: toxiproxy latency 2000ms
    assert: fallback served and p99 < 500ms
    test: TestRedisTimeoutFallback
  - id: db-kill
    inject: docker stop postgres
    assert: retry budget exhausted with 503, no panic
nightly:
  - id: broker-partition
    inject: toxiproxy reset_peer
  - id: slow-model
    inject: upstream delay 5s
  - id: disconnect-storm
    inject: 500 aborted SSE clients
ownership:
  redis-timeout: payments-team
  disconnect-storm: streaming-team`,
        output: `pre-merge checklist: 2 scenarios
nightly checklist: 3 scenarios
each failure linked to owner and regression test

故障手法、预期和回归测试进入版本控制。
每次事故修复后清单增量更新。`,
      }],
    ],
  },
];

// ── G6 容器、Kubernetes 与生产交付 ─────────────────────────────────────────────
const goG6Stage = '容器、Kubernetes 与生产交付';
const goG6Name = (topic: string) => `Go · ${goG6Stage}：${topic}`;

export const HANDWRITTEN_GO_CLOUD_G6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: goG6Name('静态二进制、distroless 和多阶段镜像'),
    track,
    minutes: 38,
    prerequisite: '学员已能用 go build 编译出可执行文件，并理解 Dockerfile 的 FROM 与 COPY 指令。',
    goal: '能解释 CGO_ENABLED=0 与静态链接的因果关系，说清 scratch 与 distroless 各自缺什么、多阶段构建如何隔离工具链，并据此给出兼顾体积与安全的镜像方案。',
    guidedPractice: '现场编写一个 net/http 小服务，分别用 CGO_ENABLED=0 与默认 CGO 开关构建，用 file 与 ldd 对比两个二进制的链接方式，再把静态版打进 scratch 镜像运行并记录启动报错与修复过程，产物是一份可复用的 Dockerfile 与对比笔记。',
    independentPractice: '独立完成：把课程服务改写成两阶段 Dockerfile，构建器用 golang:1.22，运行层用 gcr.io/distroless/static，构建后用 docker images 对比体积，再用 trivy 扫描两版镜像并记录漏洞数量变化。',
    commonErrors: ['在默认 CGO 开启状态下直接 FROM scratch，容器启动即报 no such file or directory，因为二进制动态链接了 glibc。', '往 scratch 镜像拷了 CA 证书却忘了带 tzdata，日志时间全部落在 UTC，排查跨时区故障时时间线对不上。'],
    sourceRefs: ['Go Documentation. https://go.dev/doc/', 'Docker Documentation. https://docs.docker.com/'],
    steps: [
      ['CGO 与静态链接', 'Go 在 Unix 上默认启用 CGO，net 包的域名解析会走 libc 的解析器，产物因此动态链接 glibc，拷进别的容器可能起不来。构建时设 CGO_ENABLED=0 强制走纯 Go 实现，二进制不再依赖任何共享库，ldd 检查会提示 not a dynamic executable，这正是 scratch 与 distroless 能直接运行的前提。', '关 CGO 才能静态', {
        title: 'Go：对比动态与静态二进制',
        language: 'PowerShell',
        code: `go build -o app-dynamic .
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o app-static .
file app-dynamic app-static
ldd app-dynamic
ldd app-static
Get-Item app-dynamic, app-static | Select-Object Name, Length`,
        output: `app-dynamic: ELF 64-bit dynamically linked
app-static: ELF 64-bit statically linked
ldd app-dynamic -> libc.so.6
ldd app-static -> not a dynamic executable
app-static 8.2MB

CGO_ENABLED=0 生成无共享库依赖的静态二进制。
trimpath 与 -s -w 同时减小体积并移除本机路径。`,
      }],
      ['scratch 与证书', 'FROM scratch 的镜像里没有任何文件，只有 COPY 进去的二进制，所以 HTTPS 出站请求会因缺少根证书直接失败，需要手动把 /etc/ssl/certs 拷进去；时区同理要带 tzdata。另外 scratch 没有 /etc/passwd，想以非 root 运行要在 Dockerfile 里写 USER 65532:65532 这类数字 UID，不能用用户名。', '空白镜像自带依赖', {
        title: 'Dockerfile：scratch 带证书、时区与非 root',
        language: 'Dockerfile',
        code: `FROM scratch
COPY app-static /app
COPY ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY zoneinfo.zip /usr/share/zoneinfo/zoneinfo.zip
ENV TZ=Asia/Shanghai
USER 65532:65532
ENTRYPOINT ["/app"]`,
        output: `docker run --rm image id
exec: "id": executable file not found
docker run --rm image
server started, https client trust ok, TZ=Asia/Shanghai

scratch 没有 id、sh、ls，exec 无法调试。
证书、时区与数字 UID 必须一起带入。`,
      }],
      ['distroless 取舍', 'gcr.io/distroless/static 在空白之上补齐 glibc、CA 证书与 tzdata，但同样没有 shell 和包管理器：kubectl exec 进去只能跑你的进程，ls、ps 都不存在，线上排障没法敲命令。应急可换 :debug 变体或用 kubectl debug 注入临时容器共享进程命名空间，但 debug 镜像不应留在生产清单里。', '无shell难排障', {
        title: 'Kubernetes：distroless Pod 临时调试',
        language: 'PowerShell',
        code: `kubectl exec deploy/orders -- sh
kubectl debug pod/orders-7d9f -it --image=busybox:1.36 --target=orders -- sh
kubectl debug pod/orders-7d9f --image=gcr.io/distroless/base:debug --target=orders -it -- sh
kubectl get pods -o wide`,
        output: `kubectl exec: executable "sh" not found
target container namespace shared with debug pod
debug container: / # ps -ef
orders process visible from debug container

生产 distroless 无 shell。
排障使用临时 debug 容器或 debug 变体，结束后立即删除。`,
      }],
      ['多阶段构建分离工具链', '多阶段 Dockerfile 的第一段 FROM golang:1.22 AS build，完整工具链、源码与模块缓存全留在这一层；第二段只写 COPY --from=build /out/app /app，最终镜像只带走二进制。Go 工具链本身超过 1GB，分离后最终镜像能压到十几 MB，gcc 等编译依赖也不出现在生产层，扫描器不会再报它们的漏洞。', '工具链留在编译层', {
        title: 'Dockerfile：Go 多阶段构建',
        language: 'Dockerfile',
        code: `FROM golang:1.23 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/orders ./cmd/orders

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/orders /orders
USER 65532:65532
ENTRYPOINT ["/orders"]`,
        output: `builder image size=1.3GB
final image size=13.8MB
docker history shows one binary layer
trivy: application dependencies only

编译工具链留在 build stage。
最终层仅包含静态二进制和 distroless 运行基础。`,
      }],
      ['体积与攻击面', '镜像体积直接影响拉取时长：扩容时每个节点都要下载镜像，几十 MB 与几百 MB 的差距会按副本数放大。攻击面更关键：scratch 与 distroless 没有 shell、没有包管理器、没有多余系统库，trivy 扫出的 CVE 基本只剩应用自身依赖，修复动作收敛为升级 go.mod 里的具体版本。', '更小即更安全', {
        title: 'PowerShell：镜像体积与漏洞扫描',
        language: 'PowerShell',
        code: `docker images orders --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}"
docker build -t orders:fat --target build .
docker build -t orders:prod .
trivy image --severity HIGH,CRITICAL orders:fat > fat.txt
trivy image --severity HIGH,CRITICAL orders:prod > prod.txt
Select-String fat.txt,prod.txt -Pattern "Total:|HIGH:|CRITICAL:"
Measure-Command { docker pull orders:prod } | Select-Object TotalSeconds`,
        output: `orders:fat 1.31GB
orders:prod 13.8MB
fat: HIGH=42 CRITICAL=3
prod: HIGH=0 CRITICAL=0
pull prod 1.2s

生产镜像缩小约 99%，漏洞扫描只保留应用依赖。
拉取时间按副本数和节点数放大。`,
      }],
    ],
  },
  {
    name: goG6Name('配置、秘密和健康检查'),
    track,
    minutes: 40,
    prerequisite: '学员已在 K8s 里跑过简单 Deployment，并了解 Pod 创建与环境变量注入的基本流程。',
    goal: '能区分环境变量注入与 ConfigMap 卷挂载的更新行为，掌握 Secret 的正确暴露方式与日志红线，并能按 liveness、readiness、startupProbe 的分工设计探针，避免重启风暴。',
    guidedPractice: '现场创建一个 ConfigMap，同时用 envFrom 与卷挂载两种方式接进同一 Pod，修改 ConfigMap 后观察环境变量不变而挂载文件被更新，再用 kubectl describe 验证 Secret 值不回显，记录两种方式各自的更新时延。',
    independentPractice: '独立完成：给课程服务加 /healthz 与 /readyz 两个端点并分别配 liveness 与 readiness，再故意让 readiness 检查一个不存在的下游地址，用 kubectl get endpoints 观察摘除而容器不重启，记录事件输出。',
    commonErrors: ['把数据库连通性检查写进 liveness，数据库抖动时全部实例被重启，故障从依赖侧放大成全服务瘫痪。', '在启动日志里打印整个环境变量块，Secret 的值随之进了日志系统，泄漏范围从此不可控。'],
    sourceRefs: ['Kubernetes Documentation. https://kubernetes.io/docs/', 'Docker Documentation. https://docs.docker.com/'],
    steps: [
      ['环境变量与挂载差异', '环境变量在容器创建时由 kubelet 一次性注入，之后改 ConfigMap 不会改变已运行 Pod 的环境，必须重启才生效；卷挂载则相反，kubelet 周期性同步 ConfigMap 内容，通过符号链接原子替换文件，应用要自己监听变化或定期重读。两边更新语义完全不同，选型前先回答这条配置需不需要热更新。', '环境变量不热更', {
        title: 'Kubernetes：ConfigMap env 与卷挂载',
        language: 'YAML',
        code: `apiVersion: v1
kind: Pod
metadata: { name: config-demo }
spec:
  containers:
    - name: app
      image: orders:dev
      envFrom:
        - configMapRef: { name: orders-config }
      volumeMounts:
        - name: config
          mountPath: /etc/orders
  volumes:
    - name: config
      configMap: { name: orders-config }`,
        output: `kubectl set env... change ConfigMap TIMEOUT=5
env in running pod still TIMEOUT=10 after 2m
/etc/orders/config.yaml updated TIMEOUT=5 after 35s

envFrom 只在容器创建时注入一次。
卷挂载由 kubelet 周期同步，但应用需重读文件。`,
      }],
      ['Secret 暴露边界', 'Secret 常用两种暴露方式：env 里用 secretKeyRef 逐键注入，或挂载成 Secret 卷里的文件，两者都不进镜像层、不写进 Dockerfile。注意 Secret 在 etcd 里只是 base64 编码不是加密，防护靠 RBAC 限读与日志红线：kubectl describe 会把值显示成 <REDACTED>，但应用自己打印环境变量时是原样输出。', '不进镜像不进日志', {
        title: 'Kubernetes：Secret 挂载与 RBAC',
        language: 'YAML',
        code: `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-secret, key: password }
          volumeMounts:
            - { name: tls, mountPath: /etc/tls, readOnly: true }
      volumes:
        - name: tls
          secret: { secretName: orders-tls }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["db-secret", "orders-tls"]
    verbs: ["get"]`,
        output: `kubectl describe pod orders -> DB_PASSWORD: <REDACTED>
container reads /etc/tls/tls.crt read-only
secret not present in image layers

Secret 值不进镜像，RBAC 只允许读取指定资源。
应用日志不得打印 env map 或挂载文件内容。`,
      }],
      ['liveness 只管死活', 'liveness 探针失败的后果是 kubelet 杀掉并重启整个容器，所以它只该回答一个问题：进程本身是不是僵死了，例如死锁导致 HTTP 端点再也回不了话。把下游数据库、缓存连通性塞进 liveness 是最常见的设计错误，依赖一抖，所有副本同时被重启，故障半径从依赖层放大到全服务。', '只查进程僵死', {
        title: 'Go：liveness 只检查进程事件循环',
        language: 'Go',
        code: `func live(w http.ResponseWriter, r *http.Request) {
    select {
    case <-r.Context().Done():
        w.WriteHeader(503)
    default:
        w.WriteHeader(200)
        w.Write([]byte("alive"))
    }
}

// 不在这里 Ping 数据库或 Redis。
http.HandleFunc("/healthz/live", live)`,
        output: `process responsive -> GET /healthz/live 200
database down -> liveness remains 200
deadlocked handler timeout -> liveness 503

依赖故障只影响 readiness，不触发全部 Pod 重启。
liveness 只回答本进程是否还能响应。`,
      }],
      ['readiness 管流量', 'readiness 失败的后果只是把 Pod 从 Service 的 endpoints 里摘掉，容器照常运行，只是流量不再进来。它适合表达暂时不该接活的状态：缓存预热中、依赖暂不可用、正在排空。它与 liveness 正交，摘流期间进程还能处理完在途请求，这也是优雅停机能够成立的探针基础。', '失败仅摘流量', {
        title: 'Go + Kubernetes：readiness 检查依赖',
        language: 'Go',
        code: `func ready(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 200*time.Millisecond)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        http.Error(w, "db unavailable", 503)
        return
    }
    if !cache.Warmed() {
        http.Error(w, "warming", 503)
        return
    }
    w.WriteHeader(200)
}
http.HandleFunc("/healthz/ready", ready)`,
        output: `DB down -> ready 503, Pod Running, Endpoints removed
DB recovers -> ready 200, endpoint restored
container restart count unchanged

readiness 失败只摘流量。
容器保持运行，依赖恢复后自动回到 endpoints。`,
      }],
      ['startupProbe', 'startupProbe 成功之前，liveness 与 readiness 都不会开始执行，这解决了慢启动服务的经典矛盾：缓存预热要两分钟，initialDelay 设短了启动即被杀，设长了正常重启后又白白延迟探测。有了 startupProbe 就可以放宽它的 failureThreshold，让预热慢慢跑，通过之后再由常规探针接管节奏。', '先预热再接管', {
        title: 'Kubernetes：startupProbe 覆盖慢启动',
        language: 'YAML',
        code: `startupProbe:
  httpGet: { path: /healthz/live, port: 8080 }
  periodSeconds: 5
  failureThreshold: 36
livenessProbe:
  httpGet: { path: /healthz/live, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /healthz/ready, port: 8080 }
  periodSeconds: 5
  failureThreshold: 2`,
        output: `startup completed after 96s
startupProbe attempts 20/36 PASS
liveness and readiness begin only after startup success

startup 最多允许 180 秒预热。
通过后由 liveness/readiness 按正常节奏接管。`,
      }],
    ],
  },
  {
    name: goG6Name('优雅停机与连接排空'),
    track,
    minutes: 38,
    prerequisite: '学员已实现过带 signal.Notify 的 Go 服务，了解 Pod 删除时 kubelet 会向容器发终止信号。',
    goal: '能完整描述 Pod 从收到 SIGTERM 到被 SIGKILL 之间的每一步，掌握 http.Server.Shutdown 的排空语义，会用 preStop 与 readiness 解决摘流竞态，并让超时参数与 terminationGracePeriodSeconds 互相匹配。',
    guidedPractice: '现场部署一个在途请求耗时 10 秒的服务，kubectl delete pod 后同时观察服务日志与客户端报错，验证 Shutdown 是否等在途请求处理完；再删掉 signal 处理代码复现进程直接死掉的现象，记录两种行为的日志对比。',
    independentPractice: '独立完成：给服务加上 preStop sleep 与 readiness 摘流的组合，在压测工具持续发请求的前提下删除 Pod，统计 502 与连接拒绝数量，目标是排空期零失败，并把每次参数调整的结果记进对照表。',
    commonErrors: ['注册了 signal.Notify 却只打印日志不调 Shutdown，收到 SIGTERM 后处理协程被直接带走，在途请求全部中断。', 'terminationGracePeriodSeconds 保持默认 30 秒，但 preStop 睡 20 秒加排空 20 秒，总时长超限，最后一批请求被 SIGKILL 掐断。'],
    sourceRefs: ['Go Documentation. https://go.dev/doc/', 'Kubernetes Documentation. https://kubernetes.io/docs/'],
    steps: [
      ['SIGTERM 信号链', 'Go 程序收到 SIGTERM 的默认行为是立即退出，不做任何清理。K8s 删 Pod 时 kubelet 发的正是这个信号，所以服务必须用 signal.Notify 捕获它，在处理器里调用 http.Server.Shutdown 并等待其返回，进程生命周期从被动被打断变成主动收尾。没有这一步，后面所有排空设计都不存在。', '捕获才有排空', {
        title: 'Go：捕获 SIGTERM 并 Shutdown',
        language: 'Go',
        code: `server := &http.Server{Addr: ":8080", Handler: mux}
go func() { log.Fatal(server.ListenAndServe()) }()
stop := make(chan os.Signal, 1)
signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
<-stop
ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
defer cancel()
if err := server.Shutdown(ctx); err != nil {
    server.Close()
    log.Fatal(err)
}`,
        output: `SIGTERM received
HTTP server shutting down
active requests 3 -> 0
process exited 0

Shutdown 停止接入并等待在途请求。
超时才 Close 强制释放。`,
      }],
      ['Shutdown 排空语义', 'Shutdown 做两件事：先关闭所有 Listener，新连接进不来；再等待活跃连接上的请求处理完，空闲的 keep-alive 连接被立即断开。传入的 ctx 决定等多久，超时返回 context.DeadlineExceeded，此时仍有未完成连接就需要 Server.Close 强制关闭。它也不处理 WebSocket 这类升级连接，需要应用自己收尾。', '停接入再等完', {
        title: 'Go：在途请求排空验证',
        language: 'PowerShell',
        code: `$slow = Start-Job { curl.exe -s --max-time 30 http://127.0.0.1:8080/slow }
Start-Sleep -Milliseconds 200
$pid = (Get-Process orders).Id
Stop-Process -Id $pid
Wait-Job $slow | Receive-Job
Get-Content server.log -Tail 20`,
        output: `received signal terminated
shutdown start active=1
GET /slow completed 200 in 8.7s
shutdown complete active=0

Listener 先关闭，新请求被拒绝。
已建立请求在 20 秒预算内完成。`,
      }],
      ['摘流竞态与 preStop', '删除 Pod 时端点摘除与 SIGTERM 是并发执行的，iptables 规则传播有延迟，SIGTERM 已到但新请求仍可能被路由过来，这就是摘流竞态。解法是在 preStop 钩子里先睡几秒，给控制面时间把端点摘干净，或者应用收到信号后主动把 readiness 置假再开始 Shutdown，两条路都在保证先断流后排空。', '先摘流后排空', {
        title: 'Kubernetes：preStop 等待摘流',
        language: 'YAML',
        code: `lifecycle:
  preStop:
    httpGet:
      path: /internal/drain
      port: 8080
terminationGracePeriodSeconds: 40

# /internal/drain: markReady=false, sleep 5s, return 200
# SIGTERM starts after hook completes`,
        output: `t=0 Pod terminating, readiness=false
t=0-5 endpoint controller removes Pod IP
t=5 preStop completes, SIGTERM starts Shutdown
t=25 active requests drained, exit 0

先让 readiness 失败并等待端点传播。
再进入 Shutdown，避免 SIGTERM 与新流量竞态。`,
      }],
      ['超时与强制退出', 'Shutdown 的 ctx 必须设上限，比如 20 秒，否则个别挂着不动的长连接会让进程永远退不出去。超时后应记录剩余连接并调用 Server.Close 立即释放端口，同时刷掉日志缓冲。整个排空期的总预算要明确写成代码常量，并与部署侧的宽限期对齐，避免两套数字互相打架。', '限期到则强杀', {
        title: 'Go：Shutdown 超时后 Close',
        language: 'Go',
        code: `ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
defer cancel()
start := time.Now()
if err := server.Shutdown(ctx); err != nil {
    log.Warn("shutdown deadline", "elapsed", time.Since(start), "err", err)
    _ = server.Close()
    logger.Sync()
    os.Exit(1)
}
log.Info("shutdown complete", "elapsed", time.Since(start))`,
        output: `shutdown deadline elapsed=20.01s err=context deadline exceeded
server closed forcibly
log buffer flushed
exit status 1

Shutdown 等满预算后返回超时。
Close 释放端口，退出码标记非正常收尾。`,
      }],
      ['宽限期参数匹配', 'terminationGracePeriodSeconds 默认 30 秒，从 SIGTERM 发出那一刻起计时，超时即 SIGKILL，进程没有任何收尾机会。它必须大于 preStop 睡眠加 Shutdown 上限的总和并留出余量。K8s 不校验这些数字的关系，两边各配各的，现象就是排空总在最后一秒被掐断，只能靠演练压测暴露。', '宽限覆盖全程', {
        title: 'Kubernetes：校验停机预算',
        language: 'YAML',
        code: `terminationGracePeriodSeconds: 40
lifecycle:
  preStop:
    exec:
      command: ["/bin/sleep", "8"]
env:
  - name: SHUTDOWN_TIMEOUT_SECONDS
    value: "20"
# 8s preStop + 20s drain + 12s safety = 40s`,
        output: `deletion at t=0
preStop ends t=8
Shutdown begins t=8
active requests drain by t=23
process exits cleanly before grace t=40

宽限期大于 preStop 与排空总预算。
演练记录实际结束时间与 502 数量。`,
      }],
    ],
  },
  {
    name: goG6Name('Kubernetes Deployment、Service 和探针'),
    track,
    minutes: 40,
    prerequisite: '学员能用 kubectl 创建 Pod 并查看其状态，理解标签与选择器的基本匹配规则。',
    goal: '掌握 Deployment 经 ReplicaSet 管理副本的层级结构，说清三种 Service 类型各自的流量路径，并能根据 initialDelay、period、failureThreshold 的组合推算探针判定时长，给出合理的生产参数。',
    guidedPractice: '现场把 Deployment 副本数从 2 改到 4 再改回来，观察 ReplicaSet 的创建与 Pod 事件；再用 kubectl get endpoints 结合 Service 的 selector 验证流量目标，记录探针参数改动后 Pod 从启动到 Ready 的实际耗时变化。',
    independentPractice: '独立完成：为课程服务分别创建 ClusterIP 与 NodePort 两种 Service 并各自验证可达性，然后按最坏判定时长公式重新设计探针三件套参数，用故意让端点失败的实验测量真实判定时间并与推算值对比。',
    commonErrors: ['Service 的 selector 与 Deployment 的标签差一个字符，Service 建出来 endpoints 永远为空，流量没有可达目标。', '探针 timeoutSeconds 设得比 periodSeconds 还大，本轮检查还没超时下一轮已经开始，故障判定永远凑不满次数。'],
    sourceRefs: ['Kubernetes Documentation. https://kubernetes.io/docs/', 'Kubernetes Blog. https://kubernetes.io/blog/'],
    steps: [
      ['Deployment 层级', 'Deployment 不直接管 Pod，它按 pod-template-hash 给每个模板版本生成一个 ReplicaSet，ReplicaSet 再按副本数拉起或删掉 Pod。改镜像版本会新建 ReplicaSet，旧的缩到零但保留；副本扩缩只是改当前 ReplicaSet 的期望值。理解这条链路之后，滚动更新与回滚的行为才解释得通。', 'RS 才管副本', {
        title: 'Kubernetes：Deployment 与 ReplicaSet',
        language: 'PowerShell',
        code: `kubectl create deployment orders --image=orders:v1 --replicas=2
kubectl get deploy,rs,pods -l app=orders
kubectl set image deployment/orders orders=orders:v2
kubectl rollout status deployment/orders
kubectl get rs -l app=orders
kubectl scale deployment/orders --replicas=4
kubectl get pods -l app=orders`,
        output: `deployment.apps/orders 2/2 READY
replicaset/orders-7d9f 2 DESIRED
replicaset/orders-5c2a 0 DESIRED old
replicaset/orders-8a1b 4 DESIRED new

Deployment 创建 ReplicaSet。
新模板产生新 RS，旧 RS 缩到零但保留。`,
      }],
      ['ClusterIP 与转发', 'ClusterIP 是不出现在任何网卡上的虚拟 IP，可达性完全由 kube-proxy 写的 iptables 或 IPVS 规则实现：目标是这个 IP 的流量被按规则改写到某个后端 Pod。集群内通过 服务名.命名空间.svc.cluster.local 的 DNS 名访问。端点集合来自 selector 匹配且 readiness 通过的 Pod，摘流动作改变的就是这张表。', '规则决定可达', {
        title: 'Kubernetes：ClusterIP 与 Endpoints',
        language: 'PowerShell',
        code: `kubectl expose deployment orders --name=orders --port=80 --target-port=8080
kubectl get svc orders
kubectl get endpoints orders
kubectl run curl --image=curlimages/curl --rm -it --restart=Never -- curl -s http://orders.default.svc.cluster.local/healthz
kubectl get pods -l app=orders --show-labels`,
        output: `orders ClusterIP 10.96.18.21 80/TCP
orders Endpoints 10.244.1.7:8080,10.244.2.3:8080
{"status":"ok"}

Service DNS 解析到虚拟 ClusterIP。
只有 Ready 且 selector 匹配的 Pod 进入 Endpoints。`,
      }],
      ['NodePort 两层暴露', 'NodePort 在每个节点的 30000 到 32767 区间开一个端口，任何节点 IP 加这个端口都能进到后端 Pod，适合没有外部负载均衡器的环境。LoadBalancer 在它之上再包一层：云厂商分配一个外部 IP，流量先进云 LB，再落到 NodePort，最后走同样的转发规则，是三层串联的路径。', '逐层往外暴露', {
        title: 'Kubernetes：NodePort 与 LoadBalancer',
        language: 'YAML',
        code: `apiVersion: v1
kind: Service
metadata: { name: orders-nodeport }
spec:
  type: NodePort
  selector: { app: orders }
  ports: [{ port: 80, targetPort: 8080, nodePort: 30080 }]
---
apiVersion: v1
kind: Service
metadata: { name: orders-lb }
spec:
  type: LoadBalancer
  selector: { app: orders }
  ports: [{ port: 80, targetPort: 8080 }]`,
        output: `orders-nodeport NodePort 10.96.20.2 80:30080/TCP
orders-lb LoadBalancer 10.96.21.4 80:31244/TCP 203.0.113.10
curl node-ip:30080 -> 200
curl 203.0.113.10 -> 200

NodePort 每节点开端口，LoadBalancer 再前置云 LB。
两者最终都转发到同一组 Ready Pod。`,
      }],
      ['探针参数推算', '判定探针失败的最坏时长由参数组合决定：过 initialDelaySeconds 后每轮探测，连续 failureThreshold 次失败才动作，每轮间隔 periodSeconds，粗算就是 failureThreshold 乘 periodSeconds 再加各轮 timeout 的损耗。反推也一样：要求一分钟内摘除故障实例，period 10 秒配 failureThreshold 3 就是可行起点。', '参数决定判定时长', {
        title: 'Kubernetes：探针时间预算计算',
        language: 'Python',
        code: `period = 10
timeout = 2
failure_threshold = 3
initial_delay = 5
worst_case = initial_delay + failure_threshold * period
print({"period": period, "timeout": timeout,
       "failure_threshold": failure_threshold,
       "worst_case_seconds": worst_case})
assert timeout < period`,
        output: `{'period': 10, 'timeout': 2, 'failure_threshold': 3, 'worst_case_seconds': 35}

首轮 5 秒后开始，每 10 秒一次，连续 3 次失败。
最坏约 35 秒后摘流或重启。`,
      }],
      ['调参的实际影响', 'failureThreshold 小且 period 短，一次瞬时抖动就会摘除或重启实例，探针事件呈现规律的假故障；period 过长则真实故障要等几轮才确认，坏实例持续接流量。timeoutSeconds 必须小于 periodSeconds，否则本轮未超时下一轮已开始，计数永远凑不满。基线可取 period 10、timeout 2、failureThreshold 3，再按业务耗时校准。', '太敏感或太迟钝', {
        title: 'PowerShell：探针调参演练',
        language: 'PowerShell',
        code: `kubectl patch deployment orders --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds","value":1}]'
kubectl get events --field-selector involvedObject.name=orders -w
$before = (kubectl get endpoints orders -o jsonpath='{.subsets[0].addresses[*].ip}')
curl.exe -s http://orders/healthz/ready
$after = (kubectl get endpoints orders -o jsonpath='{.subsets[0].addresses[*].ip}')
Write-Output "before=$before after=$after"
kubectl rollout undo deployment/orders`,
        output: `Readiness probe failed: context deadline exceeded
endpoint count 4 -> 3 after 31s
container restart count unchanged
before=10.244.1.7,10.244.2.3,... after=...

timeout 1 秒过于敏感，偶发抖动摘掉一个实例。
readiness 失败只摘流，liveness 计数未触发。`,
      }],
    ],
  },
  {
    name: goG6Name('HPA、PDB、滚动更新和回滚'),
    track,
    minutes: 38,
    prerequisite: '学员已能创建带探针的 Deployment 并理解 Service 端点摘除机制，了解 requests 与 limits 的含义。',
    goal: '能推导 HPA 的副本数计算公式并区分资源指标与自定义指标，理解 PDB 对自愿驱逐的保护边界，会用 maxSurge 与 maxUnavailable 权衡发布速度与容量，并能执行 rollout undo 回滚到指定版本。',
    guidedPractice: '现场对服务施加压测流量，用 kubectl get hpa -w 观察副本数爬升与回落的节奏；随后把 maxUnavailable 从默认值改成 0 与 1 各发一版，对比滚动期间可用副本数的曲线，把两次发布的 ReplicaSet 变化记录成对照表。',
    independentPractice: '独立完成：配置 PDB 使滚动期间至少保留两个可用副本，再用 kubectl drain 验证驱逐被暂时挡住；最后故意发布一个坏版本，用 rollout history 与 rollout undo 回滚到上一个 revision，记录从发现到恢复的总耗时。',
    commonErrors: ['HPA 的 CPU 利用率分母用的是 requests 而不是 limits，requests 设得远小于实际用量，指标长期超百分百，副本一直顶格扩。', '以为 PDB 能挡住节点宕机，实际它只约束 drain 与滚动更新这类自愿驱逐，硬件故障照样一次失去该节点全部副本。'],
    sourceRefs: ['Kubernetes Documentation. https://kubernetes.io/docs/', 'Kubernetes Blog. https://kubernetes.io/blog/'],
    steps: [
      ['HPA 副本数公式', 'HPA 每 15 秒从 metrics-server 取一次指标，期望副本数等于当前副本数乘以当前指标值除以目标值再向上取整。CPU 利用率的分母是容器 requests 而非限额，requests 配小了利用率虚高，扩容动作被放大。扩容后指标要重新分布，副本数是在连续多个同步周期里逐步逼近目标，而不是一步到位。', '比例乘后取整', {
        title: 'Kubernetes：HPA 指标与副本公式',
        language: 'YAML',
        code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: orders }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 60 }
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300`,
        output: `desired = ceil(currentReplicas * currentUtilization / 60)
current 2, cpu 90% -> desired 3
current 3, cpu 85% -> desired 5
hpa orders 5/10 72%

CPU 利用率相对 requests 计算。
缩容稳定窗口 5 分钟抑制毛刺。`,
      }],
      ['自定义指标与防抖', '资源指标之外，HPA 可以经 custom.metrics.k8s.io 读适配器暴露的业务指标，例如每副本队列积压长度。behavior 字段控制扩缩节奏：scaleUp 与 scaleDown 各设 stabilizationWindow，缩容窗口默认五分钟，短时毛刺在窗口内被平均掉，副本数不再上下横跳。没有防抖的弹性在流量抖动的业务上会比不弹更贵。', '窗口滤掉毛刺', {
        title: 'Kubernetes：队列深度自定义指标',
        language: 'YAML',
        code: `metrics:
  - type: Pods
    pods:
      metric: { name: orders_queue_depth }
      target: { type: AverageValue, averageValue: "40" }
behavior:
  scaleUp:
    stabilizationWindowSeconds: 30
    policies: [{ type: Percent, value: 50, periodSeconds: 60 }]
  scaleDown:
    stabilizationWindowSeconds: 600
    policies: [{ type: Pods, value: 1, periodSeconds: 120 }]`,
        output: `queue depth 180 across 3 pods = 60 per pod
desired = ceil(3 * 60 / 40) = 5
scale up 3 -> 5 within 30s
scale down limited to 1 pod every 2m after 10m stable

队列深度经 metrics adapter 暴露。
缩容窗口与速率限制避免副本抖动。`,
      }],
      ['PDB 的保护边界', 'PDB 用 minAvailable 或 maxUnavailable 声明自愿驱逐时要保住的副本下限，kubectl drain、节点维护与滚动更新都受它约束：驱逐请求会排队等待，直到有新副本 Ready 腾出配额。边界同样要清楚——它只约束自愿驱逐，节点断电、内核崩溃这类非自愿事件不受保护，容量冗余要另行设计。', '只保自愿驱逐', {
        title: 'Kubernetes：PDB 阻止过度驱逐',
        language: 'YAML',
        code: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: orders-pdb }
spec:
  minAvailable: 4
  selector:
    matchLabels: { app: orders }
---
replicas: 6`,
        output: `kubectl drain node-1 --ignore-daemonsets
eviction blocked: would violate PDB, at least 4 available
available pods during rollout never below 4
node hard failure can still remove all pods on that node

PDB 只约束 drain 等自愿驱逐。
硬件故障仍需跨节点分布与容量冗余。`,
      }],
      ['发布速度与容量权衡', 'maxSurge 允许发布期间副本数超出期望值，越大新版本铺开越快，但临时占用的资源越多；maxUnavailable 允许可用副本低于期望值，越大旧版本退得越快，但服务容量同步下降。默认各为百分之二十五，且 surge 向上取整、unavailable 向下取整，保证不会一次少太多。容量余量小的服务应把 maxUnavailable 收紧到 0 或 1。', '快与稳换参数', {
        title: 'Kubernetes：maxSurge 与 maxUnavailable',
        language: 'YAML',
        code: `strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 2
    maxUnavailable: 0
replicas: 6
readinessProbe:
  httpGet: { path: /healthz/ready, port: 8080 }
  periodSeconds: 5`,
        output: `maxUnavailable=0 -> available never below 6
maxSurge=2 -> temporary replicas up to 8
rollout duration 3m12s, peak resources +33%

发布速度换额外资源，容量不降。
若容量紧张可将 maxSurge 调到 1 并接受更长发布窗口。`,
      }],
      ['回滚到指定版本', '每次模板变更都会留下一个 ReplicaSet 作为 revision，revisionHistoryLimit 决定保留几个，超限的旧版本被清掉后就回不去了。kubectl rollout history 列出所有版本，rollout undo 不带参数回滚到上一版，加 --to-revision 指定目标。注意回滚只还原 Pod 模板，配套改过的 ConfigMap 与 Secret 不在 Deployment 管辖内，要手工一起回。', '模板回配置不回', {
        title: 'PowerShell：查看历史并回滚指定版本',
        language: 'PowerShell',
        code: `kubectl rollout history deployment/orders
kubectl rollout history deployment/orders --revision=3
kubectl annotate deployment/orders kubernetes.io/change-cause="release v3"
kubectl rollout undo deployment/orders --to-revision=2
kubectl rollout status deployment/orders --timeout=180s
kubectl get rs -l app=orders
kubectl get configmap orders-config -o yaml > current-config.yaml`,
        output: `REVISION  CHANGE-CAUSE
1         release v1
2         release v2
3         release v3
deployment "orders" rolled back to revision 2
old ReplicaSet scaled up, current scaled down

回滚只还原 Deployment Pod 模板。
ConfigMap/Secret 需按发布记录手工同步回滚。`,
      }],
    ],
  },
  {
    name: goG6Name('Go 云原生服务毕业项目'),
    track,
    minutes: 40,
    prerequisite: '学员已完成 G6 前五门课的全部动手练习，手里有一个能跑通镜像构建与 K8s 部署的 Go 服务。',
    goal: '把静态镜像、探针、HPA、PDB、优雅停机、监控告警串成一条完整交付线，能按验收清单逐项验证服务在生产形态下的表现，并用一次回滚演练证明交付质量可复现。',
    guidedPractice: '在教师给出验收清单的前提下逐项联调：构建多阶段镜像并部署，注入压测触发 HPA 扩容，删除 Pod 验证排空零失败，最后按清单逐条打勾并记录每项的证据命令与输出，形成首份交付证据包。',
    independentPractice: '独立完成：独立走完整交付流程并产出三件产物——可复现的部署清单与 Dockerfile、覆盖故障场景的运行手册、一次真实执行的回滚演练记录，清单任一项无证据即视为未交付。',
    commonErrors: ['验收只看服务能不能访问，不验证删除 Pod 时的排空表现，上线第一次滚动发布就出现批量 502。', '运行手册写成部署教程，真正故障时翻不到回滚命令与告警阈值的含义，应急动作全靠现场回忆。'],
    sourceRefs: ['Kubernetes Documentation. https://kubernetes.io/docs/', 'Go Documentation. https://go.dev/doc/'],
    steps: [
      ['交付基线打样', '先把单体服务推到生产形态的最小闭环：CGO_ENABLED=0 构建静态二进制，两阶段 Dockerfile 产出 distroless 镜像，清单里声明 requests 与 limits、以非 root 运行。验收动作是用同一份镜像在本地 docker run 与集群内部署各跑一遍，两条路径的启动日志都干净，镜像这一项才算有证据。', '镜像先过两关', {
        title: 'PowerShell：同一镜像本地与集群验收',
        language: 'PowerShell',
        code: `docker build --pull -t orders@sha256:local .
docker run --rm --read-only --memory 512m orders:local
kubectl set image deployment/orders app=registry.example/orders@sha256:4b91
kubectl rollout status deployment/orders --timeout=180s
kubectl get pods -l app=orders -o wide
kubectl logs -l app=orders --tail=20`,
        output: `local: server started, profile=prod, user=65532
cluster: 4/4 Ready, image digest 4b91
startup logs contain no missing cert/tz errors
non-root and read-only filesystem verified

同一镜像 digest 在本地和集群都启动成功。
资源限制、非 root 与启动日志形成证据。`,
      }],
      ['探针与健康端点', '健康端点要在代码里分成两个：liveness 用的只反映进程自身能否应答，readiness 用的额外校验依赖与预热状态，两者不可复用同一个函数。验收包括 startupProbe 覆盖慢启动、故意破坏依赖后观察端点摘除而非容器重启，每一项都要有 kubectl get events 或 endpoints 的输出作为证据。', '两探针各司其职', {
        title: 'PowerShell：探针证据采集',
        language: 'PowerShell',
        code: `kubectl get pods -l app=orders -w
kubectl describe pod -l app=orders | Select-String "Startup|Readiness|Liveness|Events" -Context 0,2
kubectl get endpoints orders
docker stop postgres
kubectl get pods -l app=orders -o wide
kubectl get endpoints orders
docker start postgres
kubectl get endpoints orders`,
        output: `startup passed after 42s
DB down -> readiness failed, Pod Running restart=0
Endpoints 4 -> 0 while DB unavailable
DB up -> readiness passed, Endpoints restored 4

慢启动由 startupProbe 覆盖。
依赖故障只摘流，不重启容器。`,
      }],
      ['弹性与容量验证', '给部署配好 HPA 目标利用率与 PDB 下限后要做两个实验：压测把指标推过阈值，观察副本数爬升与新 Pod Ready 的耗时；再执行 drain 节点，确认驱逐被 PDB 排队约束、服务全程不低于最小副本。两个实验各留一张指标截图，弹性配置的验收以实验输出为准，不以清单写了为准。', '弹性以实测为准', {
        title: 'PowerShell：HPA 扩容与 PDB drain 实验',
        language: 'PowerShell',
        code: `k6 run --vus 300 --duration 5m perf/orders.js
kubectl get hpa orders -w
kubectl get pods -l app=orders -w
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data
kubectl get pdb orders-pdb
kubectl get pods -l app=orders -o wide
kubectl uncordon node-1`,
        output: `HPA 2 -> 8 replicas as CPU 60% target
new pods Ready in 38s
drain blocked until available >= 4
available pods never below 4 during 5m test

压测触发扩容，drain 受 PDB 约束。
扩容时间与最低可用副本有实测证据。`,
      }],
      ['停机观测与告警', '停机质量用数据说话：压测流量持续打点的同时删除 Pod，统计窗口内 502 与连接拒绝数，目标是零失败；/metrics 端点暴露 QPS、延迟分位与错误率，配一条错误率超阈值的告警规则并人为触发一次，验证告警真的能到人。排空日志与告警触发截图共同构成这一项的证据。', '零失败才算过', {
        title: 'PowerShell：滚动删除 Pod 观察 502',
        language: 'PowerShell',
        code: `$load = Start-Job { k6 run --vus 100 --duration 2m perf/orders.js }
Start-Sleep -Seconds 5
kubectl delete pod -l app=orders --field-selector=status.phase=Running --wait=false
kubectl get pods -l app=orders -w
Wait-Job $load | Receive-Job
$errors = (Get-Content load-summary.json | ConvertFrom-Json).metrics.http_req_failed.value
Write-Output "request_failure_rate=$errors"
curl.exe -s http://prometheus:9090/api/v1/query?query=orders_error_ratio`,
        output: `request_failure_rate=0
502 count=0
connection refused count=0
error_ratio=0.002 below alert threshold

持续压测期间删除 Pod，没有 502 或连接拒绝。
排空日志与告警指标一致。`,
      }],
      ['运行手册与回滚演练', '运行手册面向故障时刻而不是新手：写清告警阈值含义、定位命令顺序、回滚命令与预期耗时。收尾动作是真实演练一次：发一个坏版本制造故障，按手册执行 rollout undo，记录从发现到恢复的总时长，并与手工恢复路径对比。演练记录归档进交付物，毕业验收以这套可复现的证据为准。', '演练出真证据', {
        title: 'Markdown：Go 云原生毕业交付清单',
        language: 'Markdown',
        code: `# Go Orders Service Delivery
## Artifacts
- Dockerfile + digest sha256:4b91
- Kubernetes manifests + PDB + HPA
- runbook.md + rollback drill record
## Acceptance Evidence
- Same digest starts locally and in cluster
- startup 42s, readiness removes DB-down pod only
- HPA 2->8 under 300 VUs, PDB minimum 4
- delete Pod during 100 VUs: 0 502
- alert OrdersErrorBudgetFastBurn delivered to on-call
## Rollback Drill
- bad digest deployed at 10:02
- error ratio 18% at 10:03
- rollout undo at 10:04
- recovered by 10:04:38, total 38s
## Residual Risks
- HPA CPU target based on 500m requests
- no tested multi-zone node failure`,
        output: `delivery includes image, manifests, runbook and drill evidence
rollback recovered service in 38 seconds
residual risks and untested failure modes documented

所有验收项都有命令输出或指标证据。
坏版本真实回滚一次，交付可复现。`,
      }],
    ],
  },
];

