import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

type GoCodeLabTask = Omit<
  LearningV2CodeLabTask,
  'defaultLanguage' | 'starterCode' | 'stdin'
> & {
  readonly defaultLanguage: 'go';
  readonly starterCode: Readonly<{ go: string }>;
  readonly stdin: string;
};

type GoCodeLab = Omit<
  LearningV2CodeLab,
  'requiredRuntime' | 'languages' | 'practice' | 'apply'
> & {
  readonly requiredRuntime: 'go';
  readonly languages: readonly ['go'];
  readonly practice: GoCodeLabTask;
  readonly apply: GoCodeLabTask;
};

const goRuntime = {
  requiredRuntime: 'go',
  runtimeLabel: 'Go 1.22+ / 标准库',
  docsUrl: 'https://go.dev/doc/',
  installSteps: [
    '应用直接执行 main.go，环境无需创建第三方依赖或下载模块。',
    '先运行跟做任务核对输出和退出码，再按 brief 修改并重新运行。',
    '所有实验只使用 Go 标准库；stdin 显式提供，不读取宿主环境的隐式数据。',
  ],
  languages: ['go'],
} as const;

const GO_CODE_LABS = {
  'programming:Go · Go 工具链、模块与第一个服务：Go toolchain、GOPATH 与 module': {
    title: 'Go 代码台 01 · 模块路径、导入路径与依赖声明',
    description:
      '先在当前 Go 进程中读取工具链与构建信息，再解析一份 modfile 形态的输入，验证模块路径、语言版本和依赖版本如何共同决定可复现构建。',
    ...goRuntime,
    practice: {
      id: 'go-toolchain-module-runtime-guided',
      title: '跟做：从运行进程读取工具链事实',
      brief:
        '运行 main.go，stdin 留空。程序从 runtime 与 debug.ReadBuildInfo 读取真实版本、目标平台和构建模块信息，再用 path.Join 推导现有模块内的导入路径。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"path"
	"runtime"
	"runtime/debug"
	"strings"
)

func main() {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		panic("build info is unavailable")
	}

	modulePath := "example.com/orders"
	importPath := path.Join(modulePath, "internal", "money")
	moduleSource := info.Main.Path
	if moduleSource == "" {
		moduleSource = "command-line-arguments"
	}

	fmt.Printf("go=%s\n", runtime.Version())
	fmt.Printf("target=%s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Printf("build_module=%s\n", moduleSource)
	fmt.Printf("derived_import=%s\n", importPath)

	if !strings.HasPrefix(runtime.Version(), "go") {
		panic("runtime version must start with go")
	}
	if runtime.GOOS == "" || runtime.GOARCH == "" {
		panic("target platform must be known")
	}
	if importPath != "example.com/orders/internal/money" {
		panic("module path and directory must form the import path")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '输出必须包含真实的 go 版本、GOOS/GOARCH 和 derived_import=example.com/orders/internal/money，退出码为 0。build_module 在 go run 单文件模式下可显示 command-line-arguments；这表示构建目标而非磁盘目录名。',
    },
    apply: {
      id: 'go-toolchain-module-parse-independent',
      title: '独立实践：解析并校验最小 go.mod',
      brief:
        'stdin 提供 module、go 和 require 三行。完成 parseModfile，把声明读入结构体；程序必须校验模块路径、语言版本、依赖版本前缀，并验证包导入位于模块前缀之下。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
)

type requirement struct {
	Path    string
	Version string
}

type modfile struct {
	Module   string
	Go       string
	Requires []requirement
}

func parseModfile(r io.Reader) (modfile, error) {
	var result modfile
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		fields := strings.Fields(line)
		switch fields[0] {
		case "module":
			if len(fields) != 2 {
				return result, fmt.Errorf("invalid module line")
			}
			result.Module = fields[1]
		case "go":
			if len(fields) != 2 {
				return result, fmt.Errorf("invalid go line")
			}
			result.Go = fields[1]
		case "require":
			if len(fields) != 3 {
				return result, fmt.Errorf("invalid require line")
			}
			result.Requires = append(result.Requires, requirement{
				Path: fields[1], Version: fields[2],
			})
		default:
			return result, fmt.Errorf("unsupported directive %q", fields[0])
		}
	}
	if err := scanner.Err(); err != nil {
		return result, err
	}
	return result, nil
}

func main() {
	mod, err := parseModfile(os.Stdin)
	if err != nil {
		panic(err)
	}
	importPath := mod.Module + "/internal/money"

	fmt.Printf("module=%s go=%s imported=%s\n", mod.Module, mod.Go, importPath)
	for _, dep := range mod.Requires {
		fmt.Printf("require=%s@%s\n", dep.Path, dep.Version)
	}

	if mod.Module == "" || !strings.Contains(strings.Split(mod.Module, "/")[0], ".") {
		panic("module path should be globally addressable")
	}
	if !strings.HasPrefix(importPath, mod.Module+"/") {
		panic("internal package import must stay under module path")
	}
	for _, dep := range mod.Requires {
		if !strings.HasPrefix(dep.Version, "v") {
			panic("dependency version must start with v")
		}
	}
}
`,
      },
      stdin:
        'module example.com/orders\ngo 1.22\nrequire github.com/google/uuid v1.6.0\n',
      checkpoint:
        '程序必须输出 module=example.com/orders、go=1.22、imported=example.com/orders/internal/money，以及 require=github.com/google/uuid@v1.6.0，退出码为 0。删除 module 行或把依赖版本改成 1.6.0 后，应触发对应校验失败。',
    },
  },

  'programming:Go · Go 工具链、模块与第一个服务：包、可见性、目录和内部模块': {
    title: 'Go 代码台 02 · 导出规则与 internal 边界',
    description:
      '用 go/parser 检查标识符大小写和导出状态，再模拟 Go 的 internal 目录导入判定，区分“文件放在某个目录”和“导入路径是否合法”。',
    ...goRuntime,
    practice: {
      id: 'go-packages-visibility-ast-guided',
      title: '跟做：让 AST 判定导出性',
      brief:
        '运行 main.go。程序解析一段包含 Order 与 validate 的 Go 源码，使用 ast.Ident.IsExported 区分包外可见名称，并打印文件包名。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
)

const source = ` + '`' + String.raw`package orders

type Order struct {
	ID string
}

func (o Order) Total() int { return 0 }
func validate(order Order) error {
	if order.ID == "" {
		return nil
	}
	return nil
}
` + '`' + String.raw`

func main() {
	file, err := parser.ParseFile(token.NewFileSet(), "orders.go", source, 0)
	if err != nil {
		panic(err)
	}

	var declarations []string
	ast.Inspect(file, func(node ast.Node) bool {
		decl, ok := node.(*ast.FuncDecl)
		if !ok {
			return true
		}
		declarations = append(declarations, decl.Name.Name)
		return true
	})

	fmt.Printf("package=%s\n", file.Name.Name)
	for _, name := range declarations {
		fmt.Printf("func=%s exported=%t\n", name, ast.IsExported(name))
	}

	if file.Name.Name != "orders" {
		panic("package name mismatch")
	}
	if len(declarations) != 2 ||
		!ast.IsExported(declarations[0]) ||
		ast.IsExported(declarations[1]) {
		panic("unexpected package-level functions")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '输出必须含 package=orders、func=Total exported=true 与 func=validate exported=false，退出码为 0。Total 是导出方法，validate 是小写未导出包级函数；若把 Total 改成 total，应观察 exported=false。',
    },
    apply: {
      id: 'go-packages-internal-boundary-independent',
      title: '独立实践：实现 internal 导入判定',
      brief:
        'stdin 三行依次为模块路径、导入方包、目标包。补全 mayImportInternal：目标路径含 /internal/ 时，导入方必须与目标共享 internal 之前的前缀，否则拒绝。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func readLines() []string {
	scanner := bufio.NewScanner(os.Stdin)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, strings.TrimSpace(scanner.Text()))
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
	return lines
}

func mayImportInternal(importer, target string) bool {
	marker := "/internal/"
	index := strings.Index(target, marker)
	if index < 0 {
		return true
	}
	boundary := target[:index]
	return importer == boundary || strings.HasPrefix(importer, boundary+"/")
}

func main() {
	lines := readLines()
	if len(lines) != 3 {
		panic("expected module, importer, target")
	}
	module, importer, target := lines[0], lines[1], lines[2]
	allowed := mayImportInternal(importer, target)

	fmt.Printf("module=%s\n", module)
	fmt.Printf("importer=%s\n", importer)
	fmt.Printf("target=%s\n", target)
	fmt.Printf("allowed=%t\n", allowed)

	if !strings.HasPrefix(importer, module+"/") {
		panic("importer must belong to module")
	}
	if !allowed {
		panic("legal module-internal import was rejected")
	}
}
`,
      },
      stdin:
        'example.com/shop\nexample.com/shop/orders\nexample.com/shop/internal/money\n',
      checkpoint:
        '必须输出 allowed=true，退出码为 0。把 importer 换成 example.com/other/orders，合法共享前缀不存在，应得到 allowed=false；这正是在模块根之外不能导入 internal 包的原因。',
    },
  },

  'programming:Go · Go 工具链、模块与第一个服务：第一组 go test 与基准': {
    title: 'Go 代码台 03 · 真正的 go test 与基准命令',
    description:
      '在临时模块中生成客户端包、表驱动测试和基准函数，调用真实 go test 执行，再从输出判断测试通过与基准测量是否都发生。',
    ...goRuntime,
    practice: {
      id: 'go-testing-first-suite-guided',
      title: '跟做：启动一次真实测试进程',
      brief:
        '运行 main.go。程序创建临时 Go 模块，写入实现、表驱动测试和 BenchmarkNormalize，再执行 go test -run TestNormalize -bench BenchmarkNormalize -benchtime=20x。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const implementation = ` + '`' + String.raw`package textutil

import "strings"

func Normalize(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(value)), " ")
}
` + '`' + String.raw`

const testSource = ` + '`' + String.raw`package textutil

import "testing"

func TestNormalize(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"spaces", "  Go   SERVER ", "go server"},
		{"empty", "\t\n", ""},
		{"case", "API Gateway", "api gateway"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Normalize(tc.in); got != tc.want {
				t.Fatalf("Normalize(%q)=%q want %q", tc.in, got, tc.want)
			}
		})
	}
}

func BenchmarkNormalize(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = Normalize("  Go   Runtime  ")
	}
}
` + '`' + String.raw`

func write(path, content string) {
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		panic(err)
	}
}

func main() {
	dir, err := os.MkdirTemp("", "go-test-lab-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)

	write(filepath.Join(dir, "go.mod"), "module lab.local/tests\n\ngo 1.22\n")
	write(filepath.Join(dir, "normalize.go"), implementation)
	write(filepath.Join(dir, "normalize_test.go"), testSource)

	cmd := exec.Command("go", "test", "-count=1", "-run", "TestNormalize", "-bench", "BenchmarkNormalize", "-benchtime=20x", ".")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		panic(fmt.Sprintf("go test failed: %v\n%s", err, output))
	}

	text := string(output)
	fmt.Print(text)
	if !strings.Contains(text, "PASS") || !strings.Contains(text, "BenchmarkNormalize") {
		panic("test or benchmark did not run")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '输出必须含 TestNormalize 子测试结果、PASS、BenchmarkNormalize-* 和每轮基准 ns/op，退出码为 0。修改一条 want 后 go test 应失败；这说明这些结果来自真实进程，不是伪造字符串。',
    },
    apply: {
      id: 'go-testing-benchmark-compare-independent',
      title: '独立实践：用基准比较字符串拼接',
      brief:
        '生成同一个模块中的 Concatenate 与 BuilderJoin 两个实现，分别写测试与基准。运行 go test -bench=. -benchmem，断言两个基准都出现、测试通过，并打印真实内存分配列。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const source = ` + '`' + String.raw`package joinlab

import "strings"

func Concatenate(parts []string) string {
	result := ""
	for _, part := range parts {
		result += part
	}
	return result
}

func BuilderJoin(parts []string) string {
	var builder strings.Builder
	for _, part := range parts {
		builder.WriteString(part)
	}
	return builder.String()
}
` + '`' + String.raw`

const tests = ` + '`' + String.raw`package joinlab

import "testing"

var fixture = []string{"GET", " ", "/orders", "?", "page=2"}

func TestImplementationsAgree(t *testing.T) {
	want := "GET /orders?page=2"
	if got := Concatenate(fixture); got != want {
		t.Fatalf("Concatenate=%q", got)
	}
	if got := BuilderJoin(fixture); got != want {
		t.Fatalf("BuilderJoin=%q", got)
	}
}

func BenchmarkConcatenate(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = Concatenate(fixture)
	}
}

func BenchmarkBuilderJoin(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = BuilderJoin(fixture)
	}
}
` + '`' + String.raw`

func main() {
	dir, err := os.MkdirTemp("", "go-bench-compare-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)
	files := map[string]string{
		"go.mod":      "module lab.local/join\n\ngo 1.22\n",
		"join.go":     source,
		"join_test.go": tests,
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			panic(err)
		}
	}
	cmd := exec.Command("go", "test", "-count=1", "-bench=.", "-benchmem", "-benchtime=100x", ".")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		panic(fmt.Sprintf("go test failed: %v\n%s", err, output))
	}
	text := string(output)
	fmt.Print(text)
	for _, marker := range []string{"PASS", "BenchmarkConcatenate", "BenchmarkBuilderJoin", "B/op"} {
		if !strings.Contains(text, marker) {
			panic("missing benchmark evidence: " + marker)
		}
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须看到两个 Benchmark 都执行、PASS 与 B/op 分配列，退出码为 0。单次 ns/op 会波动，不能据此宣布性能提升；至少用 -count=5 保存输出，再用 benchstat 比较中位数。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：结构体、方法、嵌入和组合': {
    title: 'Go 代码台 04 · 接收者、字段布局与方法提升',
    description:
      '先观察值和指针接收者对状态的影响，再比较结构体字段排列造成的填充，并用嵌入组合复用能力而不伪造继承。',
    ...goRuntime,
    practice: {
      id: 'go-struct-receiver-layout-guided',
      title: '跟做：值副本和指针修改',
      brief:
        '运行 main.go。Counter 的 AddValue 使用值接收者，AddPointer 使用指针接收者；然后再打印两个字段顺序不同但字段集合相同的结构体大小。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"unsafe"
)

type Counter struct {
	Value int
}

func (c Counter) AddValue(delta int) {
	c.Value += delta
}

func (c *Counter) AddPointer(delta int) {
	c.Value += delta
}

type Padded struct {
	Flag byte
	ID   int64
	Code byte
}

type Packed struct {
	ID   int64
	Flag byte
	Code byte
}

func main() {
	counter := Counter{Value: 10}
	counter.AddValue(5)
	fmt.Printf("after_value=%d\n", counter.Value)
	counter.AddPointer(5)
	fmt.Printf("after_pointer=%d\n", counter.Value)
	fmt.Printf("padded=%d packed=%d\n", unsafe.Sizeof(Padded{}), unsafe.Sizeof(Packed{}))

	if counter.Value != 15 {
		panic("value receiver must only modify a copy")
	}
	if unsafe.Sizeof(Padded{}) <= unsafe.Sizeof(Packed{}) {
		panic("alignment example should expose padding")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 after_value=10、after_pointer=15，且 padded 大于 packed（在 64 位目标上通常为 24 与 16），退出码为 0。大小依赖架构与对齐规则，应报告实际数字而不是背固定值。',
    },
    apply: {
      id: 'go-struct-embedding-composition-independent',
      title: '独立实践：组合订单能力并显式消歧',
      brief:
        '运行 main.go。Base 提供 ID 与 Describe，Auditable 提供 Describe，Order 同时嵌入两者。程序必须显式调用 Base.Describe 与 Auditable.Describe，并打印提升字段 ID。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import "fmt"

type Base struct {
	ID int
}

func (b Base) Describe() string {
	return fmt.Sprintf("order:%d", b.ID)
}

type Auditable struct {
	Actor string
}

func (a Auditable) Describe() string {
	return "actor:" + a.Actor
}

type Order struct {
	Base
	Auditable
}

func (o Order) Summary() string {
	return o.Base.Describe() + " " + o.Auditable.Describe()
}

func main() {
	order := Order{
		Base:      Base{ID: 42},
		Auditable: Auditable{Actor: "alice"},
	}
	fmt.Printf("id=%d\n", order.ID)
	fmt.Printf("summary=%s\n", order.Summary())

	if order.ID != order.Base.ID {
		panic("promoted field must resolve to embedded Base.ID")
	}
	if order.Summary() != "order:42 actor:alice" {
		panic("shadowed methods must be called explicitly")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 id=42 和 summary=order:42 actor:alice，退出码为 0。若只写 order.Describe()，两个同深度嵌入方法冲突而无法编译；组合解决的是能力复用，不是父类覆盖。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：接口、隐式实现和依赖方向': {
    title: 'Go 代码台 05 · 消费方接口与静态适配器',
    description:
      '把接口声明放在使用方而不是实现方，用最小方法集连接领域服务和基础设施，并通过编译期断言固定适配器契约。',
    ...goRuntime,
    practice: {
      id: 'go-interfaces-consumer-boundary-guided',
      title: '跟做：让业务只依赖 Notifier',
      brief:
        '运行 main.go。Service 只持有消费方定义的 notifier；memoryNotifier 隐式实现它。代码注入替身并打印调用记录，证明实现者不需要 import 接口所在包。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import "fmt"

type notifier interface {
	Notify(message string) error
}

type memoryNotifier struct {
	messages []string
}

func (m *memoryNotifier) Notify(message string) error {
	m.messages = append(m.messages, message)
	return nil
}

type Service struct {
	outbox notifier
}

func (s Service) MarkReady(orderID int) string {
	message := fmt.Sprintf("order %d ready", orderID)
	if err := s.outbox.Notify(message); err != nil {
		return "failed"
	}
	return message
}

var _ notifier = (*memoryNotifier)(nil)

func main() {
	fake := &memoryNotifier{}
	service := Service{outbox: fake}
	result := service.MarkReady(17)

	fmt.Printf("result=%s\n", result)
	fmt.Printf("notifications=%d payload=%s\n", len(fake.messages), fake.messages[0])

	if len(fake.messages) != 1 || fake.messages[0] != "order 17 ready" {
		panic("consumer-defined interface was not called")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 result=order 17 ready、notifications=1 payload=order 17 ready，退出码为 0。接口里只放 Service 真正使用的方法；让实现方反向依赖领域包会把接口扩大到业务不需要的能力。',
    },
    apply: {
      id: 'go-interfaces-optional-capability-independent',
      title: '独立实践：基础接口加可选能力',
      brief:
        '运行 main.go。syncStore 只要求 Write，flushStore 额外提供 Flush。saver 通过类型断言探测可选 Flush，分别处理普通存储与可刷新存储，并输出真实动作顺序。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"strings"
)

type store interface {
	Write(string)
}

type flusher interface {
	Flush() string
}

type plainStore struct {
	data []string
}

func (s *plainStore) Write(value string) {
	s.data = append(s.data, value)
}

type bufferedStore struct {
	buffer []string
	flushed int
}

func (s *bufferedStore) Write(value string) {
	s.buffer = append(s.buffer, value)
}

func (s *bufferedStore) Flush() string {
	out := strings.Join(s.buffer, ",")
	s.buffer = nil
	s.flushed++
	return out
}

func save(target store, value string) string {
	target.Write(value)
	if optional, ok := target.(flusher); ok {
		return optional.Flush()
	}
	return "not flushed"
}

func main() {
	plain := &plainStore{}
	buffered := &bufferedStore{}
	fmt.Printf("plain=%s\n", save(plain, "a"))
	fmt.Printf("buffered=%s\n", save(buffered, "b"))
	fmt.Printf("plain_data=%v flushed=%d\n", plain.data, buffered.flushed)

	if save(plain, "c") != "not flushed" {
		panic("plain store must not pretend to flush")
	}
	if buffered.flushed != 1 || len(buffered.buffer) != 0 {
		panic("optional flusher was not invoked")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 plain=not flushed、buffered=b，且 plain_data 最终包含 a 与 c，flushed=1，退出码为 0。可选能力不要塞进基础 store 接口，否则普通实现被迫返回无意义结果。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：error、errors.Is/As 与错误链': {
    title: 'Go 代码台 06 · 可判别错误与错误链',
    description:
      '用哨兵错误表达稳定分类，用自定义错误携带字段上下文，再通过 errors.Is 和 errors.As 穿透多层 fmt.Errorf 包装，建立调用方可处理的失败协议。',
    ...goRuntime,
    practice: {
      id: 'go-errors-is-as-guided',
      title: '跟做：从错误链取出稳定身份',
      brief:
        '运行 main.go。loadOrder 把 JSON 错误包装为 ValidationError，再在服务层继续包装。main 同时用 errors.Is 判断 ErrInvalidOrder、用 errors.As 取字段名，并打印完整错误文本。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"errors"
	"fmt"
)

var ErrInvalidOrder = errors.New("invalid order")

type ValidationError struct {
	Field string
}

func (e *ValidationError) Error() string {
	return "validation failed for " + e.Field
}

func loadOrder(sku string) error {
	if sku == "" {
		return fmt.Errorf("decode order: %w", &ValidationError{Field: "sku"})
	}
	return nil
}

func service(sku string) error {
	if err := loadOrder(sku); err != nil {
		return fmt.Errorf("%w: load catalog item: %w", ErrInvalidOrder, err)
	}
	return nil
}

func main() {
	err := service("")
	fmt.Printf("error=%v\n", err)
	fmt.Printf("is_invalid=%t\n", errors.Is(err, ErrInvalidOrder))

	var validation *ValidationError
	found := errors.As(err, &validation)
	fmt.Printf("as_validation=%t field=%s\n", found, validation.Field)

	if !errors.Is(err, ErrInvalidOrder) || !found || validation.Field != "sku" {
		panic("wrapped error lost classification or typed context")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 is_invalid=true、as_validation=true field=sku，且错误文本保留 load catalog item 与 decode order 两层上下文，退出码为 0。若把任一层 %w 改成 %v，后面对应错误的 Is/As 识别会中断。',
    },
    apply: {
      id: 'go-errors-temporary-retry-independent',
      title: '独立实践：只重试临时错误',
      brief:
        '运行 main.go。临时调用第一次返回实现 Temporary 的超时错误，第二次成功；普通调用始终返回被 errors.Join 包装的 permanentError。retry 必须通过 errors.As 判断临时性并在永久失败时立刻停止。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"errors"
	"fmt"
)

type temporaryError struct {
	attempt int
}

func (e *temporaryError) Error() string   { return fmt.Sprintf("timeout on attempt %d", e.attempt) }
func (e *temporaryError) Temporary() bool { return true }

type permanentError struct{}

func (e *permanentError) Error() string { return "payload rejected" }

func shouldRetry(err error) bool {
	var temporary interface{ Temporary() bool }
	return errors.As(err, &temporary) && temporary.Temporary()
}

func temporaryCall(attempt int) error {
	if attempt == 1 {
		return fmt.Errorf("remote call: %w", &temporaryError{attempt: attempt})
	}
	return nil
}

func permanentCall(int) error {
	return errors.Join(errors.New("request closed"), &permanentError{})
}

func retry(limit int, operation func(int) error) (int, error) {
	var attempts []error
	for attempt := 1; attempt <= limit; attempt++ {
		err := operation(attempt)
		if err == nil {
			return attempt, nil
		}
		attempts = append(attempts, err)
		if !shouldRetry(err) {
			return attempt, errors.Join(attempts...)
		}
	}
	return limit, errors.Join(attempts...)
}

func main() {
	successAt, err := retry(4, temporaryCall)
	fmt.Printf("success_attempt=%d err=%v\n", successAt, err)
	failureAt, joined := retry(3, permanentCall)
	fmt.Printf("failure_attempt=%d retryable=%t err=%v\n", failureAt, shouldRetry(joined), joined)

	if err != nil || successAt != 2 {
		panic("temporary failure should be retried once")
	}
	if failureAt != 1 || shouldRetry(joined) {
		panic("permanent failure should stop retry")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 success_attempt=2 err=<nil>、failure_attempt=1 retryable=false，退出码为 0。不要按错误字符串匹配分类；errors.Is/As 才能穿透 wrap 和 Join 保留稳定语义。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：context 取消、期限和值边界': {
    title: 'Go 代码台 07 · 截止时间、取消传播与类型化值',
    description:
      '先让超时在阻塞函数内取消，再用 WithCancel 构建任务树并携带私有 key 的请求元数据，观察取消沿 goroutine 传播而业务参数不被塞进 context。',
    ...goRuntime,
    practice: {
      id: 'go-context-deadline-guided',
      title: '跟做：让 deadline 终止等待',
      brief:
        '运行 main.go。waitForJob 只在 ctx.Done 与结果通道之间 select；父 context 20 毫秒后超时，程序用 errors.Is 判断 DeadlineExceeded 并打印耗时区间。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

func waitForJob(ctx context.Context) error {
	result := make(chan string)
	select {
	case value := <-result:
		fmt.Printf("unexpected_result=%s\n", value)
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func main() {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	err := waitForJob(ctx)
	elapsed := time.Since(start)
	fmt.Printf("error=%v\n", err)
	fmt.Printf("deadline_exceeded=%t elapsed_at_least_15ms=%t\n",
		errors.Is(err, context.DeadlineExceeded), elapsed >= 15*time.Millisecond)

	if !errors.Is(err, context.DeadlineExceeded) {
		panic("blocked work must observe deadline")
	}
	if elapsed < 15*time.Millisecond {
		panic("context returned before its deadline")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 error=context deadline exceeded、deadline_exceeded=true、elapsed_at_least_15ms=true，退出码为 0。接收方必须在 select 中监听 Done；只把 ctx 存进结构体而不检查，超时不会自动中断任何工作。',
    },
    apply: {
      id: 'go-context-cancellation-tree-independent',
      title: '独立实践：类型化值与取消传播',
      brief:
        '运行 main.go。父 context 携带 requestID；两个 worker 通过 WithCancel 派生任务树并每毫秒产生一个结果。凑齐四个结果后取消，程序核对 worker 都退出且 requestID 未被字符串 key 覆盖。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type requestIDKey struct{}

func worker(ctx context.Context, id int, output chan<- string) {
	for index := 0; ; index++ {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Millisecond):
			message := fmt.Sprintf("worker=%d item=%d request=%s", id, index,
				ctx.Value(requestIDKey{}))
			select {
			case <-ctx.Done():
				return
			case output <- message:
			}
		}
	}
}

func main() {
	parent, cancel := context.WithCancel(context.Background())
	parent = context.WithValue(parent, requestIDKey{}, "req-42")

	output := make(chan string)
	var workers sync.WaitGroup
	for id := 1; id <= 2; id++ {
		workers.Add(1)
		go func(workerID int) {
			defer workers.Done()
			worker(parent, workerID, output)
		}(id)
	}

	results := make([]string, 0, 4)
	for len(results) < 4 {
		results = append(results, <-output)
	}
	cancel()
	workers.Wait()

	for _, result := range results {
		fmt.Println(result)
	}
	fmt.Printf("worker_count=2 cancelled=true request=%s\n", parent.Value(requestIDKey{}))

	if len(results) != 4 || parent.Value(requestIDKey{}) != "req-42" {
		panic("request metadata or result count mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出四条 worker 结果，每条都带 request=req-42，最后输出 worker_count=2 cancelled=true request=req-42，退出码为 0。request ID 使用未导出结构体 key 防冲突；业务查询条件仍应作为显式函数参数。',
    },
  },

  'programming:Go · goroutine、channel、select 与同步：goroutine 生命周期与泄漏': {
    title: 'Go 代码台 08 · 活跃 worker 计数与可等待退出',
    description:
      '用原子计数和 WaitGroup 记录 goroutine 生命周期，先验证有界并发，再构造可取消 worker，确保调用方在返回前收到退出完成信号。',
    ...goRuntime,
    practice: {
      id: 'go-goroutine-lifecycle-guided',
      title: '跟做：测量并发上限',
      brief:
        '运行 main.go。三个 worker 在启动时增加 active，在 defer 中减少；主 goroutine 用 WaitGroup 等待，并记录 max_active，检查峰值没有超过设定并发数。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	var active atomic.Int32
	var maximum atomic.Int32
	var workers sync.WaitGroup

	for id := 1; id <= 3; id++ {
		workers.Add(1)
		go func(workerID int) {
			defer workers.Done()
			current := active.Add(1)
			defer active.Add(-1)
			for {
				seen := maximum.Load()
				if current <= seen || maximum.CompareAndSwap(seen, current) {
					break
				}
			}
			time.Sleep(time.Duration(workerID) * time.Millisecond)
		}(id)
	}
	workers.Wait()

	fmt.Printf("max_active=%d active_after_wait=%d\n", maximum.Load(), active.Load())
	if maximum.Load() != 3 || active.Load() != 0 {
		panic("worker lifecycle accounting mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 max_active=3、active_after_wait=0，退出码为 0。峰值可能小于 3 只能说明调度未重叠，不能据此证明并发限制；这里的三个 worker 恰好会启动，但仍应以计数逻辑而非 sleep 保证正确性。',
    },
    apply: {
      id: 'go-goroutine-cancellable-worker-independent',
      title: '独立实践：等待 worker 真正退出',
      brief:
        '运行 main.go。startWorker 返回 stop 与 done 两个通道；stop 触发后 worker 必须关闭 done。主程序分别演示“等待 done”的安全路径和“只发 stop 不等待”的风险标记。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"sync/atomic"
	"time"
)

func startWorker(work func(int), active *atomic.Int32) (chan<- struct{}, <-chan struct{}) {
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		active.Add(1)
		defer active.Add(-1)
		for index := 0; ; index++ {
			select {
			case <-stop:
				return
			default:
				work(index)
				time.Sleep(time.Millisecond)
			}
		}
	}()
	return stop, done
}

func main() {
	var active atomic.Int32
	stop, done := startWorker(func(index int) {}, &active)
	time.Sleep(3 * time.Millisecond)
	close(stop)
	<-done
	fmt.Printf("safe_worker_stopped=true active=%d\n", active.Load())

	if active.Load() != 0 {
		panic("done must close only after active worker leaves")
	}

	fmt.Printf("leak_risk=ignoring_done_or_stop_without_ownership\n")
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 safe_worker_stopped=true active=0，退出码为 0。done 必须在 goroutine 退出路径中关闭；只关闭 stop 或只等待超时，都不能证明 goroutine 已完成清理。',
    },
  },

  'programming:Go · goroutine、channel、select 与同步：channel、缓冲和所有权': {
    title: 'Go 代码台 09 · 缓冲区容量与关闭所有权',
    description:
      '先观察 len、cap 和阻塞边界，再实现由生产者负责关闭、汇合器负责关闭汇总通道的 fan-in 管线，避免任意一方对通道重复关闭。',
    ...goRuntime,
    practice: {
      id: 'go-channel-buffer-guided',
      title: '跟做：缓冲区不是队列无上限',
      brief:
        '运行 main.go。创建容量为 3 的缓冲通道，发送三个值后读取 len 与 cap，用非阻塞发送证明第四次发送会失败，再关闭并 range 接收。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import "fmt"

func main() {
	queue := make(chan int, 3)
	queue <- 10
	queue <- 20
	queue <- 30
	fmt.Printf("filled len=%d cap=%d\n", len(queue), cap(queue))

	var fourthSent bool
	select {
	case queue <- 40:
		fourthSent = true
	default:
		fourthSent = false
	}
	fmt.Printf("fourth_sent=%t\n", fourthSent)
	close(queue)

	total := 0
	count := 0
	for value := range queue {
		total += value
		count++
	}
	fmt.Printf("received=%d total=%d\n", count, total)
	if fourthSent || count != 3 || total != 60 {
		panic("buffered channel contract mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 filled len=3 cap=3、fourth_sent=false、received=3 total=60，退出码为 0。缓冲满时发送阻塞；close 之后仍可读完已缓冲元素，但任何发送都会 panic。',
    },
    apply: {
      id: 'go-channel-fanin-ownership-independent',
      title: '独立实践：两级归属的 fan-in',
      brief:
        '运行 main.go。两个生产者各自拥有并关闭自己的通道；merge 用 WaitGroup 等待后关闭输出通道；主程序排序汇总结果，检查元素没有任何丢失或重复。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"sort"
	"sync"
)

func producer(values ...int) <-chan int {
	output := make(chan int)
	go func() {
		defer close(output)
		for _, value := range values {
			output <- value
		}
	}()
	return output
}

func merge(inputs ...<-chan int) <-chan int {
	var readers sync.WaitGroup
	output := make(chan int)
	for _, input := range inputs {
		readers.Add(1)
		go func(channel <-chan int) {
			defer readers.Done()
			for value := range channel {
				output <- value
			}
		}(input)
	}
	go func() {
		readers.Wait()
		close(output)
	}()
	return output
}

func main() {
	merged := merge(producer(1, 3, 5), producer(2, 4, 6))
	var received []int
	for value := range merged {
		received = append(received, value)
	}
	sort.Ints(received)
	fmt.Printf("received=%v\n", received)

	want := []int{1, 2, 3, 4, 5, 6}
	if fmt.Sprint(received) != fmt.Sprint(want) {
		panic("fan-in lost or duplicated values")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 received=[1 2 3 4 5 6]，退出码为 0。输出顺序本来就不保证；正确性靠排序后的集合验证。只有发送方关闭自己的通道，只有 merge 在全部 reader 退出后关闭汇总通道。',
    },
  },

  'programming:Go · goroutine、channel、select 与同步：select、超时和关闭协议': {
    title: 'Go 代码台 10 · 可抢占等待与停机优先',
    description:
      '用 nil channel 禁用分支，用 timer 与就绪通道竞争，再建立停止信号优先的消费循环，明确关闭通道只表示不再发送而不等于自动停止 worker。',
    ...goRuntime,
    practice: {
      id: 'go-select-ready-timeout-guided',
      title: '跟做：就绪、超时与禁用分支',
      brief:
        '运行 main.go。第一轮就绪通道已有值，select 选择数据；第二轮使用 15 毫秒 timer 且无数据；第三轮把 nil 通道加入 select，证明 nil 分支永远无法就绪。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"time"
)

func main() {
	ready := make(chan string, 1)
	ready <- "result-17"

	select {
	case value := <-ready:
		fmt.Printf("selected=value payload=%s\n", value)
	default:
		panic("ready channel should be selected")
	}

	timer := time.NewTimer(15 * time.Millisecond)
	defer timer.Stop()
	start := time.Now()
	select {
	case value := <-ready:
		panic("ready channel was already drained: " + value)
	case <-timer.C:
		fmt.Printf("selected=timeout elapsed_at_least_10ms=%t\n",
			time.Since(start) >= 10*time.Millisecond)
	}

	var never <-chan int
	select {
	case value := <-never:
		panic(fmt.Sprintf("nil channel produced %d", value))
	default:
		fmt.Println("nil_channel_disabled=true")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 selected=value payload=result-17、selected=timeout elapsed_at_least_10ms=true、nil_channel_disabled=true，退出码为 0。nil channel 永远阻塞，因此放进 select 可暂时禁用某个分支。',
    },
    apply: {
      id: 'go-select-shutdown-priority-independent',
      title: '独立实践：停止优先的 worker 协议',
      brief:
        '运行 main.go。drain 每次循环先在非阻塞 select 中检查 stop，再等待 jobs 或 stop。关闭 stop 后 worker 必须立即返回 stopped=true；正常消费到 closed jobs 则返回 stopped=false。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import "fmt"

func drain(stop <-chan struct{}, jobs <-chan int) (count int, stopped bool) {
	for {
		select {
		case <-stop:
			return count, true
		default:
		}
		select {
		case <-stop:
			return count, true
		case _, ok := <-jobs:
			if !ok {
				return count, false
			}
			count++
		}
	}
}

func buffered(values ...int) <-chan int {
	channel := make(chan int, len(values))
	for _, value := range values {
		channel <- value
	}
	close(channel)
	return channel
}

func main() {
	stop := make(chan struct{})
	close(stop)
	stoppedCount, stopped := drain(stop, buffered(1, 2, 3))
	fmt.Printf("stopped_count=%d stopped=%t\n", stoppedCount, stopped)

	normalCount, normalStopped := drain(make(chan struct{}), buffered(4, 5, 6))
	fmt.Printf("normal_count=%d stopped=%t\n", normalCount, normalStopped)

	if !stopped || stoppedCount != 0 || normalStopped || normalCount != 3 {
		panic("select shutdown protocol mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 stopped_count=0 stopped=true 和 normal_count=3 stopped=false，退出码为 0。第二层 select 保证 jobs 与 stop 同时就绪时不随机吞任务；停机信号因此获得明确优先级。',
    },
  },

  'programming:Go · goroutine、channel、select 与同步：sync、atomic 与内存模型': {
    title: 'Go 代码台 11 · 互斥计数与原子快照',
    description:
      '比较 Mutex 保护复合状态和 atomic.Value 发布不可变配置的写法，观察 WaitGroup 建立完成边界，避免多个 goroutine 对同一 map 做无锁写。',
    ...goRuntime,
    practice: {
      id: 'go-sync-mutex-counter-guided',
      title: '跟做：用 Mutex 保护计数',
      brief:
        '运行 main.go。四个 goroutine 各执行 250 次自增，所有写入都由同一把 Mutex 串行化；WaitGroup 让主程序只在全部写完后读取 total。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"sync"
)

type counter struct {
	mu    sync.Mutex
	total int
}

func (c *counter) increment() {
	c.mu.Lock()
	c.total++
	c.mu.Unlock()
}

func (c *counter) value() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.total
}

func main() {
	c := &counter{}
	var workers sync.WaitGroup
	for id := 1; id <= 4; id++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := 0; index < 250; index++ {
				c.increment()
			}
		}()
	}
	workers.Wait()
	fmt.Printf("total=%d\n", c.value())
	if c.value() != 1000 {
		panic("mutex-protected counter lost updates")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 total=1000，退出码为 0。把 Lock 与 Unlock 去掉并用 go test -race 运行，通常会报告数据竞争；没有报错的一次普通运行不能证明并发安全。',
    },
    apply: {
      id: 'go-sync-atomic-config-independent',
      title: '独立实践：原子发布不可变配置',
      brief:
        '运行 main.go。六个 writer 保存六份合法配置，atomic.Int64 分配并记录版本，atomic.Value 发布完整结构体快照；读者只能看到合法配置且最终版本为 6。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

type config struct {
	Limit int
	Mode  string
}

func valid(c config) bool {
	return c.Limit > 0 && (c.Mode == "safe" || c.Mode == "fast")
}

func main() {
	var snapshot atomic.Value
	var version atomic.Int64
	snapshot.Store(config{Limit: 10, Mode: "safe"})

	var writers sync.WaitGroup
	for index := 1; index <= 6; index++ {
		writers.Add(1)
		go func() {
			defer writers.Done()
			sequence := int(version.Add(1))
			candidate := config{Limit: 10 + sequence, Mode: "safe"}
			if sequence%3 == 0 {
				candidate.Mode = "fast"
			}
			snapshot.Store(candidate)
		}()
	}
	writers.Wait()

	final := snapshot.Load().(config)
	fmt.Printf("version=%d limit=%d mode=%s valid=%t\n",
		version.Load(), final.Limit, final.Mode, valid(final))
	if version.Load() != 6 || !valid(final) {
		panic("atomic snapshot or version mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 version=6 valid=true，limit 为正数且 mode 为 safe 或 fast，退出码为 0。atomic.Value 发布的是完整不可变快照；若在发布后继续原地修改结构体，读者仍可能观察到撕裂状态。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：GC 标记、写屏障和 GOGC': {
    title: 'Go 代码台 12 · GOGC 阈值与可达性',
    description:
      '用 debug.SetGCPercent 控制下一次回收的堆增长阈值，读取 MemStats 证明实际分配发生，再检查显式丢弃引用后的对象可达性和 finalizer 观察窗口。',
    ...goRuntime,
    practice: {
      id: 'go-gc-gogc-memstats-guided',
      title: '跟做：改变 GOGC 并观察回收',
      brief:
        '运行 main.go。程序临时把 GOGC 设为 10，分配一组 256 KiB 数据，执行 runtime.GC 并读取 NumGC、TotalAlloc 与 HeapAlloc，最后 defer 恢复原值。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"runtime"
	"runtime/debug"
)

var retained [][]byte

func main() {
	oldPercent := debug.SetGCPercent(10)
	defer debug.SetGCPercent(oldPercent)

	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	for index := 0; index < 16; index++ {
		retained = append(retained, make([]byte, 256*1024))
	}
	runtime.GC()
	runtime.KeepAlive(retained)

	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	allocated := after.TotalAlloc - before.TotalAlloc
	fmt.Printf("gogc=10 num_gc_before=%d num_gc_after=%d\n", before.NumGC, after.NumGC)
	fmt.Printf("total_alloc_delta=%d heap_alloc=%d\n", allocated, after.HeapAlloc)

	if allocated < 4*1024*1024 || after.NumGC <= before.NumGC {
		panic("allocation or garbage collection was not observed")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须看到 gogc=10、NumGC 增加、total_alloc_delta 至少 4 MiB，退出码为 0。GOGC 是下一次堆目标比例，不是定时器；TotalAlloc 累计所有分配，HeapAlloc 只统计当前仍可达的堆对象。',
    },
    apply: {
      id: 'go-gc-reachability-finalizer-independent',
      title: '独立实践：断开最后引用后观察 finalizer',
      brief:
        '运行 main.go。payload 先由全局变量持有，打印 heap-held=true；随后清空引用并多次 runtime.GC，等待 finalizer 将其标记为已终结。GC 只回收不可达对象。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"fmt"
	"runtime"
	"sync/atomic"
	"time"
)

type payload struct {
	Bytes []byte
}

var held *payload
var finalized atomic.Int32

func main() {
	held = &payload{Bytes: make([]byte, 2*1024*1024)}
	runtime.SetFinalizer(held, func(*payload) {
		finalized.Add(1)
	})
	fmt.Printf("heap_held=%t finalizers=%d\n", held != nil, finalized.Load())

	held = nil
	runtime.KeepAlive(held)
	deadline := time.Now().Add(2 * time.Second)
	for finalized.Load() == 0 && time.Now().Before(deadline) {
		runtime.GC()
		time.Sleep(10 * time.Millisecond)
	}

	fmt.Printf("heap_held=%t finalizers=%d\n", held != nil, finalized.Load())
	if held != nil || finalized.Load() == 0 {
		panic("unreachable object was not observed as finalized")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '第一行必须是 heap_held=true finalizers=0；末行必须是 heap_held=false finalizers=1，退出码为 0。finalizer 执行时机由 GC 与调度决定，本实验最多等待两秒；生产代码不应依靠 finalizer 及时释放关键资源。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：pprof、trace 与 benchstat': {
    title: 'Go 代码台 13 · CPU profile、执行 trace 与基准测量',
    description:
      '分别采集 runtime/pprof CPU 样本并检查 gzip 头，采集 runtime/trace 确认二进制非空，再用 testing.Benchmark 生成可重复的 ns/op 证据。',
    ...goRuntime,
    practice: {
      id: 'go-pprof-cpu-profile-guided',
      title: '跟做：采集真实 CPU profile',
      brief:
        '运行 main.go。StartCPUProfile 写入 bytes.Buffer，程序执行 120 毫秒哈希计算后 StopCPUProfile，检查输出非空且具有 gzip 标记 1f 8b。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"fmt"
	"runtime/pprof"
	"time"
)

func cpuWork() uint64 {
	var value uint64 = 1
	for value < 50_000_000 {
		value = value*1664525 + 1013904223
	}
	return value
}

func main() {
	var profile bytes.Buffer
	if err := pprof.StartCPUProfile(&profile); err != nil {
		panic(err)
	}
	deadline := time.Now().Add(120 * time.Millisecond)
	var checksum uint64
	for time.Now().Before(deadline) {
		checksum ^= cpuWork()
	}
	pprof.StopCPUProfile()
	data := profile.Bytes()

	gzipHeader := len(data) >= 2 && data[0] == 0x1f && data[1] == 0x8b
	fmt.Printf("profile_bytes=%d gzip=%t checksum=%d\n", len(data), gzipHeader, checksum)
	if !gzipHeader || len(data) < 100 {
		panic("CPU profile is empty or malformed")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 gzip=true、profile_bytes 大于 100，checksum 非零，退出码为 0。CPU profile 的 gzip 只是容器格式；真正分析可把字节写入文件后运行 go tool pprof。',
    },
    apply: {
      id: 'go-trace-benchmark-independent',
      title: '独立实践：执行 trace 加基准函数',
      brief:
        '运行 main.go。程序在 runtime/trace 中执行两轮不同规模的并发任务，随后用 testing.Benchmark 测量字符串拼接，并输出 trace 字节与 NsPerOp。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"fmt"
	"runtime"
	"runtime/trace"
	"sync"
	"testing"
)

func parallelWork(workers int) {
	var group sync.WaitGroup
	for id := 0; id < workers; id++ {
		group.Add(1)
		go func(worker int) {
			defer group.Done()
			var value uint64 = uint64(worker + 1)
			for index := 0; index < 250_000; index++ {
				value = value*6364136223846793005 + 1442695040888963407
			}
			if value == 0 {
				panic("impossible")
			}
		}(id)
	}
	group.Wait()
}

func main() {
	var output bytes.Buffer
	if err := trace.Start(&output); err != nil {
		panic(err)
	}
	parallelWork(runtime.GOMAXPROCS(0))
	parallelWork(2)
	trace.Stop()

	result := testing.Benchmark(func(b *testing.B) {
		for index := 0; index < b.N; index++ {
			_ = fmt.Sprintf("order:%d", index)
		}
	})
	fmt.Printf("trace_bytes=%d\n", output.Len())
	fmt.Printf("benchmark_ns_per_op=%d allocs_per_op=%d\n",
		result.NsPerOp(), result.AllocsPerOp())

	if output.Len() == 0 || result.NsPerOp() <= 0 {
		panic("trace or benchmark produced no evidence")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出大于零的 trace_bytes、benchmark_ns_per_op 与 allocs_per_op，退出码为 0。单次 NsPerOp 只用于本机观察；比较版本时应多次采样并用 benchstat，trace 则用于看调度与阻塞时间线。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：net/http Server、Handler 和中间件': {
    title: 'Go 代码台 14 · 请求 ID 中间件与 JSON API',
    description:
      '先用 httptest 驱动带 Request ID 的 Handler，再实现只接受 POST 与 application/json 的订单接口，验证成功、业务校验和未知字段三种响应。',
    ...goRuntime,
    practice: {
      id: 'go-http-middleware-request-id-guided',
      title: '跟做：在响应与上下文传递请求 ID',
      brief:
        '运行 main.go。requestID 中间件优先保留合法 X-Request-ID，否则生成新值；下游 Handler 从类型化 context key 读取并回写响应头。httptest 发起真实 HTTP 请求。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
)

type requestIDKey struct{}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = "generated-1"
		}
		ctx := context.WithValue(r.Context(), requestIDKey{}, id)
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func handler(w http.ResponseWriter, r *http.Request) {
	id, _ := r.Context().Value(requestIDKey{}).(string)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprintf(w, "request=%s path=%s", id, r.URL.Path)
}

func main() {
	server := httptest.NewServer(requestID(http.HandlerFunc(handler)))
	defer server.Close()

	req, err := http.NewRequest(http.MethodGet, server.URL+"/healthz", nil)
	if err != nil {
		panic(err)
	}
	req.Header.Set("X-Request-ID", "req-42")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}

	fmt.Printf("status=%d request_id=%s body=%s\n",
		response.StatusCode, response.Header.Get("X-Request-ID"), body)
	if response.StatusCode != http.StatusOK ||
		response.Header.Get("X-Request-ID") != "req-42" ||
		!strings.Contains(string(body), "path=/healthz") {
		panic("middleware or handler contract mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 status=200 request_id=req-42 body=request=req-42 path=/healthz，退出码为 0。外部请求 ID 应限制长度与字符集；示例为了聚焦传播链路保留请求头值。',
    },
    apply: {
      id: 'go-http-json-validation-independent',
      title: '独立实践：JSON 请求边界与错误响应',
      brief:
        '运行 main.go。接口只接受 POST /orders 和 application/json，使用 DisallowUnknownFields 拒绝多余字段，校验 quantity 为正；测试成功 201、数量非法 422、未知字段 400。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
)

type createOrder struct {
	SKU      string ` + '`' + String.raw`json:"sku"` + '`' + String.raw`
	Quantity int    ` + '`' + String.raw`json:"quantity"` + '`' + String.raw`
}

type orderResult struct {
	ID       string ` + '`' + String.raw`json:"id"` + '`' + String.raw`
	Accepted bool   ` + '`' + String.raw`json:"accepted"` + '`' + String.raw`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		panic(err)
	}
}

func orders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method"})
		return
	}
	if r.Header.Get("Content-Type") != "application/json" {
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "content type"})
		return
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input createOrder
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if input.SKU == "" || input.Quantity <= 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "invalid order"})
		return
	}
	writeJSON(w, http.StatusCreated, orderResult{ID: "ord-1001", Accepted: true})
}

func post(serverURL, body string) (int, string) {
	req, err := http.NewRequest(http.MethodPost, serverURL+"/orders", bytes.NewBufferString(body))
	if err != nil {
		panic(err)
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		panic(err)
	}
	return response.StatusCode, string(payload)
}

func main() {
	server := httptest.NewServer(http.HandlerFunc(orders))
	defer server.Close()

	okStatus, okBody := post(server.URL, ` + '`' + String.raw`{"sku":"PEN","quantity":2}` + '`' + String.raw`)
	badStatus, badBody := post(server.URL, ` + '`' + String.raw`{"sku":"PEN","quantity":0}` + '`' + String.raw`)
	unknownStatus, _ := post(server.URL, ` + '`' + String.raw`{"sku":"PEN","quantity":1,"extra":true}` + '`' + String.raw`)

	fmt.Printf("ok_status=%d ok_body=%s", okStatus, okBody)
	fmt.Printf("bad_status=%d bad_body=%s", badStatus, badBody)
	fmt.Printf("unknown_status=%d\n", unknownStatus)

	if okStatus != http.StatusCreated || unknownStatus != http.StatusBadRequest ||
		badStatus != http.StatusUnprocessableEntity {
		panic("JSON API status contract mismatch")
	}
}
`,
      },
      stdin: '',
      checkpoint:
        '必须输出 ok_status=201、bad_status=422、unknown_status=400，成功响应体含 accepted:true，退出码为 0。Content-Type 必须精确校验；若生产允许带 charset 的头部，应使用 mime.ParseMediaType 后比较媒体类型。',
    },
  },
} satisfies Readonly<Record<string, GoCodeLab>>;

export const LEARNING_CODE_LABS_GO: Readonly<
  Record<string, LearningV2CodeLab>
> = GO_CODE_LABS as unknown as Readonly<Record<string, LearningV2CodeLab>>;
