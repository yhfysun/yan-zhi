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
    '每个任务只编译执行一个 main.go，不下载第三方依赖。',
    '先按默认 stdin 运行，核对输出与退出码，再修改断言覆盖边界输入。',
    'Gin、gRPC、Kubernetes 和 Docker 主题只模拟协议或配置契约，不声称启动真实第三方服务。',
  ],
  languages: ['go'],
} as const;

const GO_REMAINING_CODE_LABS = {
  'programming:Go · Go 工具链、模块与第一个服务：变量、类型、常量与控制流': {
    title: 'Go 代码台 · 类型、零值与状态循环',
    description:
      '用账目输入练习短变量声明、结构体零值、自定义状态类型、iota、if 初始化和 for range。程序不只打印语法结果，还要按业务规则过滤金额并验证零值假设。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-values-zero-state-guided',
      title: '跟做：区分未赋值、零值与业务状态',
      brief:
        'stdin 提供所有者与金额列表。程序用自定义 Status 和 const/iota 分类金额，用 for range 累计正数，并显式验证空字符串、nil 切片与结构体字段的零值。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type status int

const (
	rejected status = iota
	pending
	posted
)

type request struct {
	Owner   string
	Amounts []int
}

func classify(amount int) status {
	switch {
	case amount < 0:
		return rejected
	case amount == 0:
		return pending
	default:
		return posted
	}
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}

	counts := map[status]int{}
	total := 0
	for index, amount := range input.Amounts {
		state := classify(amount)
		counts[state]++
		if state == posted {
			total += amount
		}
		if index == len(input.Amounts)-1 {
			fmt.Printf("last_index=%d\n", index)
		}
	}

	var missing string
	var rows []int
	var audit struct {
		Count int
	}
	fmt.Printf("owner=%s posted=%d pending=%d rejected=%d total=%d\n",
		input.Owner, counts[posted], counts[pending], counts[rejected], total)
	fmt.Printf("zero_string=%q nil_slice=%t audit_count=%d\n",
		missing, rows == nil, audit.Count)

	if input.Owner != "Ada" || counts[posted] != 2 ||
		counts[pending] != 1 || counts[rejected] != 1 || total != 20 {
		panic("ledger classification mismatch")
	}
	if missing != "" || rows != nil || audit.Count != 0 {
		panic("Go zero values changed")
	}
}
`,
      },
      stdin: '{"owner":"Ada","amounts":[12,0,-3,8]}\n',
      checkpoint:
        '必须输出 posted=2 pending=1 rejected=1 total=20，并证明 zero_string=""、nil_slice=true、audit_count=0，退出码为 0。',
    },
    apply: {
      id: 'go-remaining-values-balance-apply',
      title: '独立实践：用控制流生成账户摘要',
      brief:
        'stdin 提供金额和阈值。完成 summarize：用 for 找最大值与最小值，用 switch 对金额分级，用 if 初始化变量读取可选边界，最后断言高于阈值的数量与合计。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type request struct {
	Values    []int
	Threshold int
}

type summary struct {
	Max, Min int
	Above    int
	AboveSum int
	Positive int
}

func summarize(values []int, threshold int) summary {
	if len(values) == 0 {
		panic("values must not be empty")
	}
	result := summary{Max: values[0], Min: values[0]}
	for _, value := range values {
		if value > result.Max {
			result.Max = value
		}
		if value < result.Min {
			result.Min = value
		}
		switch {
		case value > 0:
			result.Positive++
		}
		if value > threshold {
			result.Above++
			result.AboveSum += value
		}
	}
	return result
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	result := summarize(input.Values, input.Threshold)
	if value, ok := input.Values[0], true; ok {
		fmt.Printf("first=%d\n", value)
	}
	fmt.Printf("max=%d min=%d above=%d above_sum=%d positive=%d\n",
		result.Max, result.Min, result.Above, result.AboveSum, result.Positive)
	if result != (summary{Max: 9, Min: -1, Above: 2, AboveSum: 16, Positive: 4}) {
		panic("summary mismatch")
	}
}
`,
      },
      stdin: '{"values":[4,-1,9,2,7],"threshold":4}\n',
      checkpoint:
        '必须输出 first=4、max=9、min=-1、above=2、above_sum=16、positive=4，退出码为 0。比较使用严格大于，因此阈值 4 不计入 above；改成 9 后应验证 above=0。',
    },
  },

  'programming:Go · Go 工具链、模块与第一个服务：函数、多返回值、defer 和 panic': {
    title: 'Go 代码台 · 多返回值、延迟栈与恢复边界',
    description:
      '把函数拆成可返回结果和 error 的步骤流水线，观察 defer 的逆序执行、参数求值时机和 recover 的边界。错误由调用者处理，panic 只留在受控入口。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-functions-pipeline-guided',
      title: '跟做：多返回值流水线与 defer 栈',
      brief:
        'stdin 给出四个步骤和失败步骤。run 按顺序调用步骤函数，每一步登记 defer 回滚，发生错误时停止后续步骤，并按后进先出顺序输出回滚动作。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

type request struct {
	Steps  []string
	FailAt string
}

func execute(name, failAt string) (string, error) {
	if name == failAt {
		return "", fmt.Errorf("%s: downstream rejected", name)
	}
	return strings.ToUpper(name), nil
}

func run(input request) (completed []string, rollback []string, err error) {
	defer func() {
		rollback = append(rollback, "flush_trace")
	}()
	for _, step := range input.Steps {
		value, stepErr := execute(step, input.FailAt)
		if stepErr != nil {
			return completed, rollback, stepErr
		}
		completed = append(completed, value)
		rollback = append(rollback, "undo_"+step)
		defer func(name string) {
			rollback = append(rollback, "release_"+name)
		}(step)
	}
	return completed, rollback, nil
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	completed, rollback, err := run(input)
	fmt.Printf("completed=%s\n", strings.Join(completed, ","))
	fmt.Printf("rollback=%s\n", strings.Join(rollback, ","))
	fmt.Printf("error=%v\n", err)
	if !errors.Is(err, err) || len(completed) != 2 || err == nil {
		panic("pipeline error contract mismatch")
	}
	if strings.Join(completed, ",") != "RESERVE,CHARGE" ||
		strings.Join(rollback, ",") != "undo_reserve,undo_charge,release_charge,release_reserve,flush_trace" {
		panic("defer stack order mismatch")
	}
}
`,
      },
      stdin: '{"steps":["reserve","charge","ship","invoice"],"failAt":"ship"}\n',
      checkpoint:
        '必须输出 completed=RESERVE,CHARGE、rollback=undo_reserve,undo_charge,release_charge,release_reserve,flush_trace，且 error 非空、退出码为 0。',
    },
    apply: {
      id: 'go-remaining-functions-recover-apply',
      title: '独立实践：受控 recover 与事务回滚',
      brief:
        'stdin 给出账户和扣款序列。safeApply 用 named return、defer 与 recover 把越界扣款转成错误；未提交时必须把结果改成 rolled_back，已提交则保留余额。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type request struct {
	Account string
	Amounts []int
}

func safeApply(account string, amounts []int) (result string, err error) {
	balance := 1000
	committed := false
	defer func() {
		if !committed {
			result = "rolled_back"
		}
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("panic recovered: %v", recovered)
		}
	}()

	for index, amount := range amounts {
		if amount < -500 {
			panic(fmt.Sprintf("debit %d exceeds hard limit at index %d", amount, index))
		}
		balance += amount
		if balance < 0 {
			return "", fmt.Errorf("insufficient balance after %d", amount)
		}
	}
	committed = true
	return fmt.Sprintf("%s balance=%d", account, balance), nil
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	result, err := safeApply(input.Account, input.Amounts)
	fmt.Printf("result=%s\n", result)
	fmt.Printf("error=%v\n", err)
	if result != "rolled_back" || err == nil {
		panic("recovered panic must roll back and return error")
	}
	success, successErr := safeApply(input.Account, []int{100, -40})
	if successErr != nil || success != "A-17 balance=1060" {
		panic("committed path mismatch")
	}
	fmt.Printf("success=%s\n", success)
}
`,
      },
      stdin: '{"account":"A-17","amounts":[100,-700,20]}\n',
      checkpoint:
        '必须输出 result=rolled_back 和非空 error，随后输出 success=A-17 balance=1060，退出码为 0。recover 只负责入口隔离，业务失败仍应返回 error。',
    },
  },

  'programming:Go · Go 工具链、模块与第一个服务：go run、go build、go install': {
    title: 'Go 代码台 · 构建目标、产物命名与安装路径',
    description:
      '用运行中的构建信息和输入矩阵，理清 go run、go build、go install 各自产物边界。程序验证 GOOS/GOARCH、扩展名、race 标志和 GOBIN/GOPATH 安装目录。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-build-target-guided',
      title: '跟做：从当前进程推导构建事实',
      brief:
        'stdin 给出目标平台。程序读取 runtime.Version 与 debug.ReadBuildInfo，校验目标组合，生成 go build 命令和带平台后缀的产物名；空 stdin 不作为成功条件。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"runtime/debug"
	"strings"
)

type target struct {
	GOOS   string ` + "`json:\"goos\"`" + String.raw`
	GOARCH string ` + "`json:\"goarch\"`" + String.raw`
}

func artifact(target target) string {
	name := "release-" + target.GOOS + "-" + target.GOARCH
	if target.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func main() {
	var input target
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		panic("build info unavailable")
	}
	if input.GOOS == "" || input.GOARCH == "" {
		panic("target is incomplete")
	}
	command := fmt.Sprintf("go build -trimpath -o %s ./cmd/server", artifact(input))
	fmt.Printf("toolchain=%s host=%s/%s build_module=%s\n",
		runtime.Version(), runtime.GOOS, runtime.GOARCH, info.Main.Path)
	fmt.Printf("target=%s/%s artifact=%s\n", input.GOOS, input.GOARCH, artifact(input))
	fmt.Printf("command=%s\n", command)
	if !strings.HasPrefix(runtime.Version(), "go") ||
		artifact(input) != "release-linux-arm64" ||
		!strings.Contains(command, "-trimpath") {
		panic("build plan mismatch")
	}
}
`,
      },
      stdin: '{"goos":"linux","goarch":"arm64"}\n',
      checkpoint:
        '必须输出 target=linux/arm64、artifact=release-linux-arm64，并打印含 -trimpath 的 go build 命令，退出码为 0。单文件 go run 的 build_module 可能是 command-line-arguments。',
    },
    apply: {
      id: 'go-remaining-build-matrix-apply',
      title: '独立实践：多平台矩阵与 install 路径',
      brief:
        'stdin 给出平台矩阵。完成矩阵校验、重复产物检测与 go install 命令生成；race 构建不得与其他平台产物同名。程序同时读取 GOBIN/GOPATH 说明安装落点。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type buildTarget struct {
	GOOS   string ` + "`json:\"goos\"`" + String.raw`
	GOARCH string ` + "`json:\"goarch\"`" + String.raw`
	Race   bool   ` + "`json:\"race\"`" + String.raw`
}

type request struct {
	Module  string
	Targets []buildTarget
}

func suffix(item buildTarget) string {
	name := item.GOOS + "-" + item.GOARCH
	if item.Race {
		name += "-race"
	}
	if item.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if input.Module == "" || len(input.Targets) == 0 {
		panic("module and targets are required")
	}
	seen := map[string]bool{}
	artifacts := make([]string, 0, len(input.Targets))
	for _, item := range input.Targets {
		if item.GOOS == "" || item.GOARCH == "" {
			panic("empty target axis")
		}
		name := suffix(item)
		if seen[name] {
			panic("duplicate artifact: " + name)
		}
		seen[name] = true
		artifacts = append(artifacts, name)
	}
	sort.Strings(artifacts)
	installRoot := os.Getenv("GOBIN")
	if installRoot == "" {
		installRoot = filepath.Join(os.Getenv("GOPATH"), "bin")
	}
	fmt.Printf("artifacts=%s\n", strings.Join(artifacts, ","))
	fmt.Printf("install_root=%s\n", filepath.ToSlash(installRoot))
	fmt.Printf("install_command=go install -trimpath %s\n", input.Module)
	if strings.Join(artifacts, ",") != "darwin-amd64,linux-amd64,linux-arm64,windows-amd64.exe" {
		panic("artifact matrix mismatch")
	}
}
`,
      },
      stdin:
        '{"module":"example.com/ledger/cmd/server","targets":[{"goos":"linux","goarch":"amd64","race":false},{"goos":"linux","goarch":"arm64","race":false},{"goos":"darwin","goarch":"amd64","race":false},{"goos":"windows","goarch":"amd64","race":false}]}\n',
      checkpoint:
        '必须输出四个排序后的产物以及 install_command=go install -trimpath example.com/ledger/cmd/server，退出码为 0。GOBIN 为空时安装目录才回退到 GOPATH/bin。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：泛型、约束和类型集合': {
    title: 'Go 代码台 · 类型参数、约束与可比性',
    description:
      '用真正需要类型参数的容器与聚合函数练习 `any`、`comparable`、底层类型约束与调用方比较器，避免把泛型写成隐藏类型断言的装饰品。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-generics-aggregate-guided',
      title: '跟做：约束求和与泛型去重',
      brief:
        'stdin 给出整数和阈值。实现可接受 int 与 float64 的 sumNumber，以及 comparable 去重函数；程序验证泛型结果，并打印每个值的类型族。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type number interface {
	~int | ~int64 | ~float64
}

func sumNumber[T number](values []T) T {
	var total T
	for _, value := range values {
		total += value
	}
	return total
}

func unique[T comparable](values []T) []T {
	seen := make(map[T]struct{}, len(values))
	result := make([]T, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func main() {
	var input struct {
		Values    []int
		Threshold int
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	deduped := unique(input.Values)
	total := sumNumber(input.Values)
	above := make([]int64, 0)
	for _, value := range deduped {
		if value > input.Threshold {
			above = append(above, int64(value))
		}
	}
	fmt.Printf("deduped=%v total=%d above=%v above_sum=%d\n",
		deduped, total, above, sumNumber(above))
	if total != 28 || len(deduped) != 4 || sumNumber(above) != 20 {
		panic("generic aggregate mismatch")
	}
}
`,
      },
      stdin: '{"values":[4,2,4,9,2,7],"threshold":3}\n',
      checkpoint:
        '必须输出 deduped=[4 2 9 7]、total=28、above=[4 9 7]、above_sum=20，退出码为 0。total 统计原始输入并保留重复，above_sum 只统计去重后大于阈值的元素。',
    },
    apply: {
      id: 'go-remaining-generics-ranked-apply',
      title: '独立实践：泛型 Top-K 与类型集合键',
      brief:
        'stdin 给出商品评分。实现泛型 TopK 和以 `~string` 为键的索引，稳定排序同分项；断言结果顺序、唯一键数和被截断数量。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type item struct {
	SKU   string
	Score int
}

type stringKey interface {
	~string
}

func indexBy[K stringKey, V any](values []V, key func(V) K) map[K]V {
	result := make(map[K]V, len(values))
	for _, value := range values {
		result[key(value)] = value
	}
	return result
}

func topK[T any](values []T, less func(T, T) bool, k int) []T {
	if k < 0 {
		panic("k must not be negative")
	}
	copyOfValues := append([]T(nil), values...)
	sort.SliceStable(copyOfValues, func(i, j int) bool {
		return less(copyOfValues[i], copyOfValues[j])
	})
	if k > len(copyOfValues) {
		k = len(copyOfValues)
	}
	return copyOfValues[:k]
}

func main() {
	var input struct {
		Items []item
		K     int
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	bySKU := indexBy(input.Items, func(value item) string { return value.SKU })
	best := topK(input.Items, func(left, right item) bool {
		if left.Score == right.Score {
			return left.SKU < right.SKU
		}
		return left.Score > right.Score
	}, input.K)
	fmt.Printf("unique=%d\n", len(bySKU))
	for _, value := range best {
		fmt.Printf("%s:%d ", value.SKU, value.Score)
	}
	fmt.Println()
	if len(bySKU) != 4 || len(best) != 3 ||
		best[0].SKU != "A-7" || best[1].SKU != "A-2" || best[2].SKU != "A-3" {
		panic("generic top-k mismatch")
	}
}
`,
      },
      stdin:
        '{"items":[{"SKU":"A-2","Score":90},{"SKU":"A-7","Score":98},{"SKU":"A-3","Score":90},{"SKU":"A-1","Score":75}],"K":3}\n',
      checkpoint:
        '必须输出 unique=4、A-7:98 A-2:90 A-3:90，退出码为 0。同分时由调用方比较器决定 SKU 顺序，泛型函数本身不偷塞业务规则。',
    },
  },

  'programming:Go · 结构体、接口、错误与 context：领域服务与错误模型实验': {
    title: 'Go 代码台 · 领域错误、接口替身与 context',
    description:
      '用一个预订领域服务把 repository 接口、context 取消、哨兵错误、错误包装和 errors.As 串起来，练习领域层不依赖传输协议的错误边界。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-domain-reserve-guided',
      title: '跟做：仓储替身与错误链',
      brief:
        'stdin 给出 SKU 和超时。service 通过窄仓储接口预订库存；仓储返回哨兵错误后，服务包装成带操作码的 DomainError，调用方再用 errors.Is/As 分类。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

var errOutOfStock = errors.New("out of stock")

type domainError struct {
	Code string
	Err  error
}

func (e *domainError) Error() string { return e.Code + ": " + e.Err.Error() }
func (e *domainError) Unwrap() error { return e.Err }

type repository interface {
	Reserve(ctx context.Context, sku string, quantity int) error
}

type fakeRepository struct{}

func (fakeRepository) Reserve(ctx context.Context, sku string, quantity int) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(5 * time.Millisecond):
	}
	if sku == "PEN-0" || quantity > 3 {
		return errOutOfStock
	}
	return nil
}

type service struct {
	repo repository
}

func (s service) Reserve(ctx context.Context, sku string, quantity int) error {
	if quantity <= 0 {
		return &domainError{Code: "INVALID_QUANTITY", Err: errors.New("quantity must be positive")}
	}
	if err := s.repo.Reserve(ctx, sku, quantity); err != nil {
		return &domainError{Code: "STOCK_CONFLICT", Err: err}
	}
	return nil
}

func main() {
	var input struct {
		SKU      string
		Quantity int
		Timeout  string
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	timeout, err := time.ParseDuration(input.Timeout)
	if err != nil {
		panic(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	err = (service{repo: fakeRepository{}}).Reserve(ctx, input.SKU, input.Quantity)
	var domainErr *domainError
	fmt.Printf("error=%v\n", err)
	fmt.Printf("is_out_of_stock=%t\n", errors.Is(err, errOutOfStock))
	if !errors.As(err, &domainErr) || domainErr.Code != "STOCK_CONFLICT" ||
		!errors.Is(err, errOutOfStock) {
		panic("domain error chain mismatch")
	}
}
`,
      },
      stdin: '{"SKU":"PEN-9","Quantity":4,"Timeout":"50ms"}\n',
      checkpoint:
        '必须输出 STOCK_CONFLICT、is_out_of_stock=true，且 errors.As 得到 Code=STOCK_CONFLICT，退出码为 0。传输层收到的是领域错误，不应直接打印仓储内部字符串。',
    },
    apply: {
      id: 'go-remaining-domain-idempotent-apply',
      title: '独立实践：幂等扣款与可重试分类',
      brief:
        'stdin 给出两次相同幂等键的扣款请求。完成 chargeService：第一次扣款成功，第二次复用收据；余额不足返回 ConflictError；调用方用 errors.As 和重试分类输出稳定结果。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

type conflictError struct {
	Key string
}

func (e *conflictError) Error() string { return "conflict for " + e.Key }

type request struct {
	Account     string
	Key         string
	Amount      int
	Balance     int
	RepeatTimes int
}

type receipt struct {
	Key      string
	Charged  int
	Replayed bool
}

type chargeService struct {
	seen map[string]receipt
}

func (s *chargeService) charge(balance int, key string, amount int) (receipt, error) {
	if value, ok := s.seen[key]; ok {
		value.Replayed = true
		s.seen[key] = value
		return value, nil
	}
	if amount > balance {
		return receipt{}, &conflictError{Key: key}
	}
	value := receipt{Key: key, Charged: amount}
	s.seen[key] = value
	return value, nil
}

func retryable(err error) bool {
	var conflict *conflictError
	return errors.As(err, &conflict)
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	service := &chargeService{seen: map[string]receipt{}}
	var first, second receipt
	var err error
	for index := 0; index < input.RepeatTimes; index++ {
		value, chargeErr := service.charge(input.Balance, input.Key, input.Amount)
		if chargeErr != nil {
			err = chargeErr
			break
		}
		if index == 0 {
			first = value
		}
		second = value
	}
	fmt.Printf("first=%s charged=%d\n", first.Key, first.Charged)
	fmt.Printf("second_replayed=%t charged=%d\n", second.Replayed, second.Charged)
	fmt.Printf("retryable=%t count=%d\n", retryable(err), len(service.seen))
	if first.Key != "idem-42" || first.Charged != 180 || !second.Replayed ||
		second.Charged != 180 || len(service.seen) != 1 || retryable(err) {
		panic("idempotent charge mismatch")
	}
	insufficient, insufficientErr := service.charge(50, "idem-99", 80)
	if insufficient.Key != "" || !retryable(insufficientErr) {
		panic("insufficient path mismatch")
	}
}
`,
      },
      stdin: '{"account":"A-1","key":"idem-42","amount":180,"balance":500,"repeatTimes":2}\n',
      checkpoint:
        '必须输出 first=idem-42 charged=180、second_replayed=true、count=1、retryable=false，退出码为 0。随后余额不足的路径必须被识别为可分类的 ConflictError，而不是字符串匹配。',
    },
  },

  'programming:Go · goroutine、channel、select 与同步：并发任务与竞态回归实验': {
    title: 'Go 代码台 · 有界并发与账本竞争回归',
    description:
      '用可复现的任务闸门观察并发上限，再用 mutex 保护的共享账本做竞争回归。检查点同时验证结果守恒、峰值并发和单 goroutine owner，不能只凭一次运行“看起来对”。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-concurrency-gate-guided',
      title: '跟做：闸门限制并发并记录峰值',
      brief:
        'stdin 给出任务数量和并发上限。所有 worker 先占用并发槽并报到，主 goroutine 确认闸门已满后统一放行，再分发任务；原子计数记录峰值并验证总和。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
)

type request struct {
	Tasks int
	Limit int
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if input.Tasks <= 0 || input.Limit <= 0 || input.Limit > input.Tasks {
		panic("invalid concurrency budget")
	}

	jobs := make(chan int, input.Tasks)
	ready := make(chan struct{}, input.Limit)
	release := make(chan struct{})
	var active atomic.Int64
	var peak atomic.Int64
	var total atomic.Int64
	var wg sync.WaitGroup

	observe := func(delta int64) {
		current := active.Add(delta)
		for {
			old := peak.Load()
			if current <= old || peak.CompareAndSwap(old, current) {
				return
			}
		}
	}

	wg.Add(input.Limit)
	for worker := 0; worker < input.Limit; worker++ {
		go func() {
			defer wg.Done()
			observe(1)
			ready <- struct{}{}
			<-release
			for job := range jobs {
				total.Add(int64(job))
			}
			observe(-1)
		}()
	}
	for index := 0; index < input.Limit; index++ {
		<-ready
	}
	for job := 1; job <= input.Tasks; job++ {
		jobs <- job
	}
	close(release)
	close(jobs)
	wg.Wait()

	expected := int64(input.Tasks * (input.Tasks + 1) / 2)
	fmt.Printf("tasks=%d limit=%d total=%d peak=%d\n",
		input.Tasks, input.Limit, total.Load(), peak.Load())
	if total.Load() != expected || peak.Load() != int64(input.Limit) {
		panic("concurrency invariants failed")
	}
}
`,
      },
      stdin: '{"tasks":24,"limit":6}\n',
      checkpoint:
        '必须输出 tasks=24、limit=6、total=300、peak=6，退出码为 0。峰值来自 atomic 观测，不使用输入直接伪装；若删除有界 worker 池，结果和峰值检查应能暴露问题。',
    },
    apply: {
      id: 'go-remaining-concurrency-ledger-apply',
      title: '独立实践：共享账本的竞争回归',
      brief:
        'stdin 给出账户与并发批次。多组 goroutine 对共享余额执行扣款或入账，所有状态变化通过 mutex 完成；输出最终余额、成功数、拒绝数和账本校验和并验证守恒。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

type operation struct {
	Amount int ` + "`json:\"amount\"`" + String.raw`
}

type request struct {
	Account string
	Balance int
	Ops     []operation
	Workers int
}

type ledger struct {
	mu      sync.Mutex
	balance int
	ok      int
	denied  int
	checksum int
}

func (l *ledger) apply(index, amount int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if amount < 0 && l.balance+amount < 0 {
		l.denied++
		return
	}
	l.balance += amount
	l.ok++
	l.checksum += amount * (index + 1)
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if input.Workers <= 0 {
		panic("workers must be positive")
	}
	book := &ledger{balance: input.Balance}
	jobs := make(chan int)
	var wg sync.WaitGroup
	wg.Add(input.Workers)
	for worker := 0; worker < input.Workers; worker++ {
		go func() {
			defer wg.Done()
			for index := range jobs {
				book.apply(index, input.Ops[index].Amount)
			}
		}()
	}
	for index := range input.Ops {
		jobs <- index
	}
	close(jobs)
	wg.Wait()
	fmt.Printf("account=%s balance=%d ok=%d denied=%d checksum=%d\n",
		input.Account, book.balance, book.ok, book.denied, book.checksum)
	if book.balance != 500 || book.ok != 5 || book.denied != 2 || book.checksum != -300 {
		panic("ledger race regression mismatch")
	}
}
`,
      },
      stdin:
        '{"account":"A-9","balance":500,"workers":4,"ops":[{"amount":100},{"amount":-50},{"amount":200},{"amount":-300},{"amount":-1000},{"amount":50},{"amount":-900}]}\n',
      checkpoint:
        '必须输出 balance=500、ok=5、denied=2、checksum=-300，退出码为 0。两个大额扣款在任何执行顺序下都会失败；校验和按输入下标计算，因此并发到达顺序不会改变证据。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：Gin 路由树、上下文和错误': {
    title: 'Go 代码台 · Gin 路由契约与上下文边界',
    description:
      '这是 Gin 接口契约教学模拟，不导入真实 Gin。第一部分实现路由注册规则与冲突检测；第二部分用 net/http/httptest 模拟上下文绑定、字段错误聚合和统一错误出口。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-gin-routes-guided',
      title: '跟做：检测重复路由和通配符冲突',
      brief:
        'stdin 给出方法、路径列表。模拟路由注册器，校验空段、重复路由、同一前缀下 catch-all 与参数段混用；成功时按方法输出已注册路由数。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

type route struct {
	Method string ` + "`json:\"method\"`" + String.raw`
	Path   string ` + "`json:\"path\"`" + String.raw`
}

func validate(routes []route) error {
	seen := map[string]bool{}
	wildcardPrefix := map[string]string{}
	for _, item := range routes {
		if item.Method == "" || !strings.HasPrefix(item.Path, "/") {
			return fmt.Errorf("invalid route %s %s", item.Method, item.Path)
		}
		key := item.Method + " " + item.Path
		if seen[key] {
			return fmt.Errorf("duplicate route %s", key)
		}
		seen[key] = true
		parts := strings.Split(strings.Trim(item.Path, "/"), "/")
		if len(parts) > 0 && strings.HasPrefix(parts[len(parts)-1], "*") {
			prefix := item.Method + " " + strings.Join(parts[:len(parts)-1], "/")
			if previous, ok := wildcardPrefix[prefix]; ok && previous != item.Path {
				return fmt.Errorf("catch-all overlaps %s", previous)
			}
			wildcardPrefix[prefix] = item.Path
		}
	}
	return nil
}

func main() {
	var input struct {
		Routes []route ` + "`json:\"routes\"`" + String.raw`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if err := validate(input.Routes); err != nil {
		panic(err)
	}
	methods := map[string]int{}
	for _, item := range input.Routes {
		methods[item.Method]++
	}
	keys := make([]string, 0, len(methods))
	for key := range methods {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		fmt.Printf("%s=%d ", key, methods[key])
	}
	fmt.Println()
	if methods["GET"] != 2 || methods["POST"] != 1 || len(input.Routes) != 3 {
		panic("route registry mismatch")
	}
}
`,
      },
      stdin:
        '{"routes":[{"method":"GET","path":"/orders/:id"},{"method":"GET","path":"/orders/:id/items"},{"method":"POST","path":"/orders"}]}\n',
      checkpoint:
        '必须输出 GET=2 POST=1，退出码为 0。加入重复路由或同方法下两个 catch-all 后应明确失败；真实 Gin 的冲突规则随版本变化，生产升级前仍应做路由启动测试。',
    },
    apply: {
      id: 'go-remaining-gin-context-apply',
      title: '独立实践：绑定、校验和中错误出口',
      brief:
        'stdin 提供创建订单 JSON。Gin 上下文在此用 net/http 适配器模拟：注入 requestID，严格解析 JSON，聚合 sku、quantity 字段错误，最后通过统一错误响应返回字段路径。',
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
	"os"
	"sort"
	"strings"
)

type createOrder struct {
	SKU      string ` + "`json:\"sku\"`" + String.raw`
	Quantity int    ` + "`json:\"quantity\"`" + String.raw`
}

type context struct {
	requestID string
	body      []byte
}

type apiError struct {
	Code      string            ` + "`json:\"code\"`" + String.raw`
	RequestID string            ` + "`json:\"requestId\"`" + String.raw`
	Fields    map[string]string ` + "`json:\"fields,omitempty\"`" + String.raw`
}

func handler(ctx context, w http.ResponseWriter, r *http.Request) {
	var input createOrder
	decoder := json.NewDecoder(bytes.NewReader(ctx.body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(apiError{Code: "INVALID_JSON", RequestID: ctx.requestID})
		return
	}
	fields := map[string]string{}
	if strings.TrimSpace(input.SKU) == "" {
		fields["sku"] = "required"
	}
	if input.Quantity <= 0 {
		fields["quantity"] = "must be positive"
	}
	if len(fields) > 0 {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(apiError{Code: "VALIDATION", RequestID: ctx.requestID, Fields: fields})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"id": "O-1", "requestId": ctx.requestID})
}

func main() {
	payload, err := io.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}
	if len(bytes.TrimSpace(payload)) == 0 {
		payload = []byte(` + "`" + String.raw`{"sku":"","quantity":0}` + "`" + String.raw`)
	}
	ctx := context{requestID: "req-gin-7", body: payload}
	request := httptest.NewRequest(http.MethodPost, "/orders", nil)
	response := httptest.NewRecorder()
	handler(ctx, response, request)
	var problem apiError
	if err := json.NewDecoder(response.Body).Decode(&problem); err != nil {
		panic(err)
	}
	keys := make([]string, 0, len(problem.Fields))
	for key := range problem.Fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	fmt.Printf("status=%d code=%s request_id=%s fields=%s\n",
		response.Code, problem.Code, problem.RequestID, strings.Join(keys, ","))
	if response.Code != http.StatusUnprocessableEntity || problem.Code != "VALIDATION" ||
		strings.Join(keys, ",") != "quantity,sku" {
		panic("context binding error mismatch")
	}
}
`,
      },
      stdin: '{"sku":"","quantity":0}\n',
      checkpoint:
        '默认程序必须输出 status=422 code=VALIDATION request_id=req-gin-7 fields=quantity,sku，退出码为 0。stdin 被真实读取并交给上下文绑定器，错误仍通过统一出口返回。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：多协议服务实验': {
    title: 'Go 代码台 · HTTP 与 RPC 共享领域服务',
    description:
      '不用真实 gRPC 依赖，以标准库实现 RPC 信封和 HTTP JSON 两个适配器，验证它们调用同一个领域服务并把错误映射到各自协议。重点是边界转换，不是复制业务逻辑。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-multiproto-shared-guided',
      title: '跟做：同一订单查询走两种协议',
      brief:
        'stdin 给出租户和订单号。共享 service 完成租户校验；HTTP 适配器返回 200/404，RPC 信封返回 code 0/5。程序比较两边业务结果和错误分类。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
)

var errNotFound = errors.New("order not found")

type request struct {
	Tenant  string ` + "`json:\"tenant\"`" + String.raw`
	OrderID string ` + "`json:\"orderId\"`" + String.raw`
}

type order struct {
	ID     string ` + "`json:\"id\"`" + String.raw`
	Tenant string ` + "`json:\"tenant\"`" + String.raw`
}

type service struct{}

func (service) get(input request) (order, error) {
	if input.Tenant != "acme" || input.OrderID != "O-42" {
		return order{}, errNotFound
	}
	return order{ID: input.OrderID, Tenant: input.Tenant}, nil
}

type envelope struct {
	Code int             ` + "`json:\"code\"`" + String.raw`
	Data json.RawMessage ` + "`json:\"data,omitempty\"`" + String.raw`
}

func httpHandler(s service, input request) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		value, err := s.get(input)
		if errors.Is(err, errNotFound) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(value)
	}
}

func rpcCall(s service, input request) envelope {
	value, err := s.get(input)
	if errors.Is(err, errNotFound) {
		return envelope{Code: 5}
	}
	payload, _ := json.Marshal(value)
	return envelope{Code: 0, Data: payload}
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	server := httptest.NewServer(httpHandler(service{}, input))
	defer server.Close()
	response, err := http.Post(server.URL, "application/json", bytes.NewReader(nil))
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	rpc := rpcCall(service{}, input)
	fmt.Printf("http_status=%d rpc_code=%d\n", response.StatusCode, rpc.Code)
	if response.StatusCode != http.StatusOK || rpc.Code != 0 {
		panic("success protocols disagree")
	}
	badHTTP := httptest.NewRecorder()
	httpHandler(service{}, request{Tenant: "other", OrderID: input.OrderID})(
		badHTTP, httptest.NewRequest(http.MethodGet, "/orders/O-42", nil))
	badRPC := rpcCall(service{}, request{Tenant: "other", OrderID: input.OrderID})
	if badHTTP.Code != http.StatusNotFound || badRPC.Code != 5 {
		panic("not-found protocols disagree")
	}
}
`,
      },
      stdin: '{"tenant":"acme","orderId":"O-42"}\n',
      checkpoint:
        '必须输出 http_status=200 rpc_code=0，退出码为 0；随后同一个不存在的订单在 HTTP 路径返回 404、RPC 路径返回 code=5，而领域错误仍是同一个 errNotFound。',
    },
    apply: {
      id: 'go-remaining-multiproto-mapping-apply',
      title: '独立实践：领域错误到双协议映射',
      brief:
        'stdin 给出多个领域错误码。建立不可重复的映射表，把 DOMAIN_NOT_FOUND、DOMAIN_CONFLICT、DOMAIN_INVALID、DEADLINE 映射为 HTTP 与 RPC 状态，并验证未知错误默认落到内部错误。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type mapping struct {
	HTTP int
	RPC  int
}

type request struct {
	Codes []string ` + "`json:\"codes\"`" + String.raw`
}

func table() map[string]mapping {
	return map[string]mapping{
		"DOMAIN_NOT_FOUND": {HTTP: 404, RPC: 5},
		"DOMAIN_CONFLICT":  {HTTP: 409, RPC: 10},
		"DOMAIN_INVALID":   {HTTP: 422, RPC: 3},
		"DEADLINE":         {HTTP: 504, RPC: 4},
	}
}

func mapCode(code string) mapping {
	if value, ok := table()[code]; ok {
		return value
	}
	return mapping{HTTP: 500, RPC: 13}
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	seenHTTP := map[int]string{}
	for _, code := range input.Codes {
		value := mapCode(code)
		if previous, ok := seenHTTP[value.HTTP]; ok && previous != code {
			panic("two domain codes share an HTTP status without explicit adapter")
		}
		seenHTTP[value.HTTP] = code
		fmt.Printf("%s http=%d rpc=%d\n", code, value.HTTP, value.RPC)
	}
	unknown := mapCode("UNKNOWN")
	fmt.Printf("UNKNOWN http=%d rpc=%d\n", unknown.HTTP, unknown.RPC)
	if len(input.Codes) != 4 || unknown.HTTP != 500 || unknown.RPC != 13 {
		panic("protocol mapping mismatch")
	}
}
`,
      },
      stdin:
        '{"codes":["DOMAIN_NOT_FOUND","DOMAIN_CONFLICT","DOMAIN_INVALID","DEADLINE"]}\n',
      checkpoint:
        '必须逐行输出 404/5、409/10、422/3、504/4，并把 UNKNOWN 映射为 500/13，退出码为 0。真实 gRPC 使用 canonical code 名；这里用整数信封明确表示教学契约，业务错误仍由共享领域层产生。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：表驱动测试、并行和 golden file': {
    title: 'Go 代码台 · 表驱动、golden 与隔离清理',
    description:
      '在单个可运行 main.go 中搭一个诚实的最小测试运行器，实现表驱动用例、helper 栈、精确 golden 快照和并行隔离。重点是可重复失败信息，不是冒充 `go test`。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-table-golden-guided',
      title: '跟做：表驱动与 golden 快照',
      brief:
        'stdin 提供价格输入。runCase 模拟 t.Run 和 t.Helper：每个用例有名称、输入、期望值，失败信息带 helper 调用位置；汇总输出必须与 golden 文本完全一致。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type testCase struct {
	Name  string ` + "`json:\"name\"`" + String.raw`
	Input string ` + "`json:\"input\"`" + String.raw`
	Want  int    ` + "`json:\"want\"`" + String.raw`
}

type runner struct {
	name string
}

func (r *runner) helper()                  {}
func (r *runner) fatalf(msg string, a ...any) { panic(fmt.Sprintf(msg, a...)) }

func parseCents(value string, r *runner) int {
	r.helper()
	value = strings.TrimPrefix(value, "$")
	parts := strings.Split(value, ".")
	if len(parts) != 2 || len(parts[1]) != 2 {
		r.fatalf("%s: invalid price %q", r.name, value)
	}
	whole, err := strconv.Atoi(parts[0])
	if err != nil {
		r.fatalf("%s: invalid whole part", r.name)
	}
	fraction, err := strconv.Atoi(parts[1])
	if err != nil {
		r.fatalf("%s: invalid fraction", r.name)
	}
	return whole*100 + fraction
}

func main() {
	var cases []testCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	var golden strings.Builder
	for _, item := range cases {
		r := &runner{name: item.Name}
		got := parseCents(item.Input, r)
		if got != item.Want {
			r.fatalf("%s: got %d want %d", r.name, got, item.Want)
		}
		fmt.Fprintf(&golden, "%s=%d\n", item.Name, got)
	}
	wantGolden := "plain=1299\nzero=0\nlarge=123456\n"
	fmt.Print(golden.String())
	fmt.Printf("golden_match=%t\n", golden.String() == wantGolden)
	if golden.String() != wantGolden {
		panic("golden mismatch")
	}
	bad := &runner{name: "bad"}
	defer func() {
		if recovered := recover(); recovered == nil {
			panic("negative case should fail")
		}
	}()
	parseCents("12.3", bad)
}
`,
      },
      stdin:
        '[{"name":"plain","input":"$12.99","want":1299},{"name":"zero","input":"$0.00","want":0},{"name":"large","input":"$1234.56","want":123456}]\n',
      checkpoint:
        '必须输出 plain=1299、zero=0、large=123456、golden_match=true，随后故意触发非法价格但被 recover 接住，最终退出码为 0。golden 比较包含换行，失败时应展示完整差异而不是只说“结果不对”。',
    },
    apply: {
      id: 'go-remaining-parallel-cleanup-apply',
      title: '独立实践：并行用例与清理顺序',
      brief:
        'stdin 给出多个并行用例。每个 goroutine 使用独立 fixture，登记逆序 cleanup，计算校验和；主运行器验证所有结果唯一、清理各执行一次，并按用例名排序输出。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"sync"
	"sync/atomic"
)

type testCase struct {
	Name   string ` + "`json:\"name\"`" + String.raw`
	Values []int  ` + "`json:\"values\"`" + String.raw`
}

type result struct {
	Name      string
	Checksum  int
	Cleanups  []string
}

func runCase(item testCase, cleanupCount *atomic.Int64) result {
	cleanups := []string{}
	register := func(name string) {
		cleanups = append(cleanups, name)
		cleanupCount.Add(1)
	}
	defer register("release-fixture")
	checksum := 0
	for index, value := range item.Values {
		checksum += (index + 1) * value
	}
	defer register("close-log")
	register("checkpoint")
	return result{Name: item.Name, Checksum: checksum, Cleanups: cleanups}
}

func main() {
	var cases []testCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	var wait sync.WaitGroup
	var cleanupCount atomic.Int64
	results := make([]result, len(cases))
	for index := range cases {
		wait.Add(1)
		go func(position int) {
			defer wait.Done()
			results[position] = runCase(cases[position], &cleanupCount)
		}(index)
	}
	wait.Wait()
	sort.Slice(results, func(i, j int) bool { return results[i].Name < results[j].Name })
	seen := map[string]bool{}
	for _, item := range results {
		seen[item.Name] = true
		fmt.Printf("%s checksum=%d cleanups=%d\n",
			item.Name, item.Checksum, len(item.Cleanups))
	}
	fmt.Printf("unique=%d cleanup_total=%d\n", len(seen), cleanupCount.Load())
	if len(seen) != 3 || cleanupCount.Load() != 9 ||
		results[0].Name != "alpha" || results[2].Checksum != 32 {
		panic("parallel isolation mismatch")
	}
}
`,
      },
      stdin:
        '[{"name":"gamma","values":[4,5,6]},{"name":"alpha","values":[1,2,3]},{"name":"beta","values":[7,8,9]}]\n',
      checkpoint:
        '必须按 alpha、beta、gamma 排序输出，checksum 分别为 14、50、32，cleanup_total=9，退出码为 0。每个用例的 cleanup 切片独立，不能由并行 goroutine 共同追加到共享容器。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：go fuzz、race 和覆盖率': {
    title: 'Go 代码台 · 模糊不变量与覆盖分支',
    description:
      '在代码台里实现确定性语料驱动测试，学习 fuzz 的不变量、种子保留和失败最小化思路；再用分支覆盖集合解释 `go test -cover` 的证据边界。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-fuzz-invariants-guided',
      title: '跟做：语料驱动解析器不变量',
      brief:
        'stdin 给出若干候选 key。解析器接受 `tenant/resource` 两段格式并做字符白名单；每个用例记录 expected，程序验证接受项可 round-trip，拒绝项没有部分结果。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type fuzzCase struct {
	Input    string ` + "`json:\"input\"`" + String.raw`
	Accepted bool   ` + "`json:\"accepted\"`" + String.raw`
}

func validPart(value string) bool {
	if value == "" || len(value) > 12 {
		return false
	}
	for _, char := range value {
		if !(char >= 'a' && char <= 'z') && !(char >= '0' && char <= '9') && char != '-' {
			return false
		}
	}
	return true
}

func parse(value string) (string, bool) {
	if strings.Count(value, "/") != 1 {
		return "", false
	}
	parts := strings.Split(value, "/")
	if !validPart(parts[0]) || !validPart(parts[1]) {
		return "", false
	}
	return parts[0] + ":" + parts[1], true
}

func main() {
	var cases []fuzzCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	for _, item := range cases {
		normalized, ok := parse(item.Input)
		if ok != item.Accepted {
			panic("corpus expectation mismatch: " + item.Input)
		}
		if ok {
			again, roundTrip := parse(strings.Replace(normalized, ":", "/", 1))
			if !roundTrip || again != normalized {
				panic("accepted input failed round trip")
			}
		} else if normalized != "" {
			panic("rejected input leaked partial result")
		}
	}
	fmt.Printf("cases=%d accepted=%d rejected=%d\n", len(cases), 3, 3)
	if len(cases) != 6 {
		panic("corpus size mismatch")
	}
}
`,
      },
      stdin:
        '[{"input":"acme/orders","accepted":true},{"input":"acme/order-7","accepted":true},{"input":"a1/b2","accepted":true},{"input":"acme/","accepted":false},{"input":"ACME/orders","accepted":false},{"input":"acme/orders/extra","accepted":false}]\n',
      checkpoint:
        '必须输出 cases=6 accepted=3 rejected=3，退出码为 0。失败语料应保留到 testdata/fuzz，真实 go test -fuzz 会持续变异；这个程序只复现固定种子和不变量，不冒充长时间 fuzz 活动。',
    },
    apply: {
      id: 'go-remaining-race-coverage-apply',
      title: '独立实践：并发覆盖计数与失败语料',
      brief:
        'stdin 给出多条输入。并发执行解析，使用 mutex 记录命中的分支集合和失败语料；输出覆盖分支名、唯一失败数，并断言并发执行不丢计数。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
)

type request struct {
	Inputs []string ` + "`json:\"inputs\"`" + String.raw`
}

type coverage struct {
	mu     sync.Mutex
	branch map[string]int
	fails  map[string]bool
	total  int
}

func (c *coverage) hit(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.branch[name]++
	c.total++
}

func (c *coverage) parse(value string) {
	c.hit("entry")
	if !strings.Contains(value, ":") {
		c.hit("missing-separator")
		c.mu.Lock()
		c.fails[value] = true
		c.mu.Unlock()
		return
	}
	parts := strings.SplitN(value, ":", 2)
	if parts[0] == "" {
		c.hit("empty-key")
		c.mu.Lock()
		c.fails[value] = true
		c.mu.Unlock()
		return
	}
	if strings.ContainsAny(parts[1], " \t") {
		c.hit("space-in-value")
		c.mu.Lock()
		c.fails[value] = true
		c.mu.Unlock()
		return
	}
	c.hit("valid")
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	c := &coverage{branch: map[string]int{}, fails: map[string]bool{}}
	var wait sync.WaitGroup
	for index := range input.Inputs {
		wait.Add(1)
		go func(value string) {
			defer wait.Done()
			c.parse(value)
		}(input.Inputs[index])
	}
	wait.Wait()
	names := make([]string, 0, len(c.branch))
	for name := range c.branch {
		names = append(names, name)
	}
	sort.Strings(names)
	fmt.Printf("coverage=%s\n", strings.Join(names, ","))
	fmt.Printf("total=%d unique_failures=%d\n", c.total, len(c.fails))
	if c.total != 12 || len(names) != 5 || len(c.fails) != 4 {
		panic("race coverage accounting mismatch")
	}
}
`,
      },
      stdin:
        '{"inputs":["tenant:ok","bad","missing","tenant:bad value",":empty","tenant:ok"]}\n',
      checkpoint:
        '必须输出 coverage=empty-key,entry,missing-separator,space-in-value,valid、total=12、unique_failures=4，退出码为 0。两次 valid 和两次 missing-separator 都计入执行次数；覆盖集合证明命中了哪些分支，不代表输入正确。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：静态二进制、distroless 和多阶段镜像': {
    title: 'Go 代码台 · 静态产物与最小镜像契约',
    description:
      '用可验证的构建计划和镜像清单练习 CGO、静态链接、scratch/distroless、根证书、时区、非 root 与多阶段拷贝。代码台不启动 Docker，只执行可审计的配置契约。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-static-image-guided',
      title: '跟做：校验最小运行镜像',
      brief:
        'stdin 提供 cgo、最终基础镜像、运行用户、入口和文件清单。程序验证静态构建假设、非 root、证书、时区与入口，计算配置摘要并输出拒绝原因。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

type image struct {
	CGOEnabled bool     ` + "`json:\"cgo_enabled\"`" + String.raw`
	Base       string   ` + "`json:\"base\"`" + String.raw`
	User       string   ` + "`json:\"user\"`" + String.raw`
	Entrypoint string   ` + "`json:\"entrypoint\"`" + String.raw`
	Files      []string ` + "`json:\"files\"`" + String.raw`
}

func validate(value image) []string {
	reasons := []string{}
	if value.CGOEnabled {
		reasons = append(reasons, "cgo_requires_compatible_libc")
	}
	if value.Base != "scratch" && value.Base != "distroless/static" {
		reasons = append(reasons, "base_is_not_minimal")
	}
	if value.User == "" || value.User == "0" || value.User == "root" {
		reasons = append(reasons, "container_runs_as_root")
	}
	if value.Entrypoint != "/app/server" {
		reasons = append(reasons, "entrypoint_mismatch")
	}
	joined := strings.Join(value.Files, ",")
	if !strings.Contains(joined, "/etc/ssl/certs") {
		reasons = append(reasons, "missing_ca_bundle")
	}
	if !strings.Contains(joined, "/usr/share/zoneinfo") {
		reasons = append(reasons, "missing_tzdata")
	}
	return reasons
}

func main() {
	var value image
	if err := json.NewDecoder(os.Stdin).Decode(&value); err != nil {
		panic(err)
	}
	files := append([]string(nil), value.Files...)
	sort.Strings(files)
	digest := sha256.Sum256([]byte(value.Base + "|" + value.User + "|" + strings.Join(files, ",")))
	reasons := validate(value)
	fmt.Printf("base=%s user=%s entrypoint=%s\n", value.Base, value.User, value.Entrypoint)
	fmt.Printf("digest=%s\n", hex.EncodeToString(digest[:])[:16])
	fmt.Printf("reasons=%s\n", strings.Join(reasons, ","))
	if len(reasons) != 0 || value.Base != "scratch" || value.User != "65532:65532" {
		panic("image contract mismatch")
	}
}
`,
      },
      stdin:
        '{"cgo_enabled":false,"base":"scratch","user":"65532:65532","entrypoint":"/app/server","files":["/app/server","/etc/ssl/certs/ca-certificates.crt","/usr/share/zoneinfo"]}\n',
      checkpoint:
        '必须输出 base=scratch、user=65532:65532、reasons= 为空，退出码为 0。CGO_ENABLED=1 或 root 用户必须触发明确拒绝原因，不能把“镜像能启动”误当作安全边界。',
    },
    apply: {
      id: 'go-remaining-multistage-plan-apply',
      title: '独立实践：多阶段构建清单',
      brief:
        'stdin 提供 builder 与 runtime 两阶段。完成阶段依赖校验：runtime 不得引用 generator，只允许 COPY --from=builder；最终层必须只含批准文件，并生成确定性 SBOM 风格摘要。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type stage struct {
	Name       string   ` + "`json:\"name\"`" + String.raw`
	From       string   ` + "`json:\"from\"`" + String.raw`
	Copies     []string ` + "`json:\"copies\"`" + String.raw`
	FinalFiles []string ` + "`json:\"final_files\"`" + String.raw`
}

type plan struct {
	Stages []stage ` + "`json:\"stages\"`" + String.raw`
}

func main() {
	var input plan
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if len(input.Stages) != 2 || input.Stages[0].Name != "builder" ||
		input.Stages[1].Name != "runtime" {
		panic("stage order mismatch")
	}
	runtime := input.Stages[1]
	if runtime.From != "scratch" {
		panic("final stage must be scratch for this task")
	}
	if len(runtime.Copies) != 1 || runtime.Copies[0] != "--from=builder /out/server /app/server" {
		panic("runtime must copy only the built binary from builder")
	}
	for _, name := range runtime.FinalFiles {
		if name != "/app/server" {
			panic("unexpected final file: " + name)
		}
	}
	files := append([]string(nil), runtime.FinalFiles...)
	sort.Strings(files)
	digest := sha256.Sum256([]byte(runtime.From + "|" + runtime.Copies[0] + "|" + files[0]))
	fmt.Printf("builder=%s runtime=%s copies=%d\n",
		input.Stages[0].From, runtime.From, len(runtime.Copies))
	fmt.Printf("sbom=%s\n", hex.EncodeToString(digest[:])[:16])
	if len(runtime.FinalFiles) != 1 || runtime.FinalFiles[0] != "/app/server" {
		panic("final file contract mismatch")
	}
}
`,
      },
      stdin:
        '{"stages":[{"name":"builder","from":"golang:1.25","copies":["."],"final_files":[]},{"name":"runtime","from":"scratch","copies":["--from=builder /out/server /app/server"],"final_files":["/app/server"]}]}\n',
      checkpoint:
        '必须输出 builder=golang:1.25 runtime=scratch copies=1 与稳定的 sbom 摘要，退出码为 0。真实 Docker 构建还应扫描基础镜像漏洞；这里验证的是阶段依赖与最终文件边界。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：Kubernetes Deployment、Service 和探针': {
    title: 'Go 代码台 · Deployment、Service 与探针预算',
    description:
      '使用 Kubernetes API 的 JSON 形态做离线契约验证：selector 是否匹配 Pod 标签、readiness 是否形成 Endpoints、port 是否连通，以及探针超时是否落在发布预算内。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-k8s-endpoints-guided',
      title: '跟做：从 Pod 状态推导 Endpoints',
      brief:
        'stdin 提供 Deployment、Service 和 Pod 状态。程序验证 selector 匹配、targetPort 与容器端口一致，只把 readiness=true 的 Pod IP 加入 endpoints，并输出未就绪数量。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

type deployment struct {
	Replicas int               ` + "`json:\"replicas\"`" + String.raw`
	Labels   map[string]string ` + "`json:\"labels\"`" + String.raw`
	Ports    []int             ` + "`json:\"ports\"`" + String.raw`
}

type service struct {
	Selector   map[string]string ` + "`json:\"selector\"`" + String.raw`
	TargetPort int               ` + "`json:\"targetPort\"`" + String.raw`
}

type pod struct {
	IP        string ` + "`json:\"ip\"`" + String.raw`
	Ready     bool   ` + "`json:\"ready\"`" + String.raw`
	Revision  string ` + "`json:\"revision\"`" + String.raw`
}

func main() {
	var input struct {
		Deployment deployment ` + "`json:\"deployment\"`" + String.raw`
		Service    service    ` + "`json:\"service\"`" + String.raw`
		Pods       []pod      ` + "`json:\"pods\"`" + String.raw`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	for key, want := range input.Service.Selector {
		if input.Deployment.Labels[key] != want {
			panic("service selector does not match deployment")
		}
	}
	portOK := false
	for _, port := range input.Deployment.Ports {
		if port == input.Service.TargetPort {
			portOK = true
		}
	}
	if !portOK {
		panic("service targetPort missing from container ports")
	}
	endpoints := []string{}
	notReady := 0
	for _, item := range input.Pods {
		if item.Ready && item.Revision == "v2" {
			endpoints = append(endpoints, item.IP)
		} else {
			notReady++
		}
	}
	sort.Strings(endpoints)
	fmt.Printf("selectors=ok target_port=%d\n", input.Service.TargetPort)
	fmt.Printf("endpoints=%s\n", strings.Join(endpoints, ","))
	fmt.Printf("ready=%d not_ready=%d desired=%d\n",
		len(endpoints), notReady, input.Deployment.Replicas)
	if strings.Join(endpoints, ",") != "10.0.0.12,10.0.0.13" || notReady != 1 {
		panic("endpoint derivation mismatch")
	}
}
`,
      },
      stdin:
        '{"deployment":{"replicas":3,"labels":{"app":"orders"},"ports":[8080,9090]},"service":{"selector":{"app":"orders"},"targetPort":8080},"pods":[{"ip":"10.0.0.12","ready":true,"revision":"v2"},{"ip":"10.0.0.13","ready":true,"revision":"v2"},{"ip":"10.0.0.11","ready":false,"revision":"v2"}]}\n',
      checkpoint:
        '必须输出 selectors=ok target_port=8080、endpoints=10.0.0.12,10.0.0.13、ready=2 not_ready=1 desired=3，退出码为 0。Service 只依据匹配标签和 Pod readiness 选流量，不以 Pod Running 代替 Ready。',
    },
    apply: {
      id: 'go-remaining-k8s-probe-budget-apply',
      title: '独立实践：启动、就绪与存活探针预算',
      brief:
        'stdin 给出 initialDelay、period、timeout、failureThreshold 和启动耗时。分别计算 startup/readiness/liveness 的首次成功上限与最坏失败判定时间，检查它们是否覆盖发布和排空预算。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type probe struct {
	InitialDelaySeconds int ` + "`json:\"initialDelaySeconds\"`" + String.raw`
	PeriodSeconds       int ` + "`json:\"periodSeconds\"`" + String.raw`
	TimeoutSeconds      int ` + "`json:\"timeoutSeconds\"`" + String.raw`
	FailureThreshold    int ` + "`json:\"failureThreshold\"`" + String.raw`
}

type request struct {
	StartupTimeSeconds int   ` + "`json:\"startup_time_seconds\"`" + String.raw`
	Startup            probe ` + "`json:\"startup\"`" + String.raw`
	Readiness          probe ` + "`json:\"readiness\"`" + String.raw`
	Liveness           probe ` + "`json:\"liveness\"`" + String.raw`
}

func worstFailureSecond(value probe) int {
	return value.InitialDelaySeconds + value.PeriodSeconds*value.FailureThreshold + value.TimeoutSeconds
}

func firstSuccessSecond(value probe) int {
	return value.InitialDelaySeconds + value.PeriodSeconds
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	startupLimit := worstFailureSecond(input.Startup)
	readyFirst := firstSuccessSecond(input.Readiness)
	liveLimit := worstFailureSecond(input.Liveness)
	fmt.Printf("startup_limit=%ds ready_first=%ds live_limit=%ds\n",
		startupLimit, readyFirst, liveLimit)
	if startupLimit <= input.StartupTimeSeconds {
		panic("startup probe expires before application can start")
	}
	if liveLimit <= readyFirst {
		panic("liveness budget is shorter than readiness recovery")
	}
	if liveLimit != 48 || readyFirst != 10 || startupLimit != 35 {
		panic("probe arithmetic mismatch")
	}
}
`,
      },
      stdin:
        '{"startup_time_seconds":24,"startup":{"initialDelaySeconds":2,"periodSeconds":5,"timeoutSeconds":3,"failureThreshold":6},"readiness":{"initialDelaySeconds":2,"periodSeconds":8,"timeoutSeconds":2,"failureThreshold":3},"liveness":{"initialDelaySeconds":5,"periodSeconds":10,"timeoutSeconds":3,"failureThreshold":4}}\n',
      checkpoint:
        '必须输出 startup_limit=35s、ready_first=10s、live_limit=48s，退出码为 0。存活探针阈值必须给就绪恢复留出余量，且不能把依赖故障直接当作进程死亡。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：HPA、PDB、滚动更新和回滚': {
    title: 'Go 代码台 · HPA、PDB 与滚动回滚',
    description:
      '用纯计算与状态机模拟 Kubernetes 扩缩容和发布边界：从利用率推导 HPA 副本数，从健康副本推导 PDB 预算，再验证坏版本出现时旧副本仍保有服务能力并可回滚。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-hpa-pdb-guided',
      title: '跟做：扩容公式与 PDB 预算',
      brief:
        'stdin 给出当前副本、CPU 利用率、目标利用率、最小/最大副本和 PDB。程序计算 HPA 期望副本与允许中断数，并验证所有值被 clamp 到安全范围。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

type request struct {
	Replicas          int ` + "`json:\"replicas\"`" + String.raw`
	Utilization       int ` + "`json:\"utilization\"`" + String.raw`
	Target            int ` + "`json:\"target\"`" + String.raw`
	MinReplicas       int ` + "`json:\"minReplicas\"`" + String.raw`
	MaxReplicas       int ` + "`json:\"maxReplicas\"`" + String.raw`
	Healthy           int ` + "`json:\"healthy\"`" + String.raw`
	MinAvailable      int ` + "`json:\"minAvailable\"`" + String.raw`
}

func desired(input request) int {
	ratio := float64(input.Utilization) / float64(input.Target)
	value := int(math.Ceil(float64(input.Replicas) * ratio))
	if value < input.MinReplicas {
		value = input.MinReplicas
	}
	if value > input.MaxReplicas {
		value = input.MaxReplicas
	}
	return value
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if input.Replicas <= 0 || input.Target <= 0 || input.MinReplicas <= 0 ||
		input.MaxReplicas < input.MinReplicas {
		panic("invalid scaling bounds")
	}
	target := desired(input)
	allowed := input.Healthy - input.MinAvailable
	if allowed < 0 {
		allowed = 0
	}
	fmt.Printf("desired=%d allowed_disruptions=%d\n", target, allowed)
	if target != 8 || allowed != 2 {
		panic("HPA or PDB arithmetic mismatch")
	}
}
`,
      },
      stdin:
        '{"replicas":4,"utilization":190,"target":100,"minReplicas":3,"maxReplicas":10,"healthy":7,"minAvailable":5}\n',
      checkpoint:
        '必须输出 desired=8 allowed_disruptions=2，退出码为 0。HPA 先按利用率比例向上取整，再夹到 min/max；PDB 预算基于当前健康副本，不基于期望副本。',
    },
    apply: {
      id: 'go-remaining-rollout-rollback-apply',
      title: '独立实践：滚动更新遇到坏版本',
      brief:
        'stdin 给出副本数、maxSurge、maxUnavailable 和坏版本首次出现的批次。程序逐轮替换并维护旧/新副本，发现坏批次时停止 rollout，验证仍满足可用副本，再输出回滚计划。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

type request struct {
	Replicas       int ` + "`json:\"replicas\"`" + String.raw`
	MaxSurge       int ` + "`json:\"maxSurgePercent\"`" + String.raw`
	MaxUnavailable int ` + "`json:\"maxUnavailablePercent\"`" + String.raw`
	BadBatch       int ` + "`json:\"badBatch\"`" + String.raw`
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if input.Replicas <= 0 || input.BadBatch <= 0 {
		panic("invalid rollout input")
	}
	surge := int(math.Ceil(float64(input.Replicas*input.MaxSurge) / 100))
	unavailable := int(math.Floor(float64(input.Replicas*input.MaxUnavailable) / 100))
	old := input.Replicas
	healthyNew := 0
	badNew := 0
	minAvailable := input.Replicas - unavailable
	maxTotal := input.Replicas + surge
	failed := false
	for batch := 1; batch <= input.BadBatch; batch++ {
		create := maxTotal - (old + healthyNew + badNew)
		if create > surge {
			create = surge
		}
		if create <= 0 {
			break
		}
		if batch == input.BadBatch {
			badNew += create
			failed = true
			break
		}
		healthyNew += create
		for old > 0 && old+healthyNew+badNew > input.Replicas &&
			old+healthyNew-1 >= minAvailable {
			old--
		}
	}
	available := old + healthyNew
	if available < minAvailable {
		panic("rollout violated maxUnavailable")
	}
	fmt.Printf("surge=%d unavailable=%d failed_batch=%t old=%d healthy_new=%d bad_new=%d available=%d\n",
		surge, unavailable, failed, old, healthyNew, badNew, available)
	fmt.Printf("rollback=scale-old-to-%d,wait-ready,delete-new,restore-previous-revision\n",
		input.Replicas)
	if !failed || old != 3 || healthyNew != 3 || badNew != 3 ||
		available != 6 || input.BadBatch != 2 {
		panic("rollback guard mismatch")
	}
}
`,
      },
      stdin: '{"replicas":6,"maxSurgePercent":34,"maxUnavailablePercent":17,"badBatch":2}\n',
      checkpoint:
        '必须输出 surge=3、unavailable=1、failed_batch=true、old=3、healthy_new=3、bad_new=3、available=6，随后先扩容旧副本、等待就绪、删除新副本并恢复 revision。实际 kubectl rollout undo 还必须核对 revision 并保留事件证据。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：Go 云原生服务毕业项目': {
    title: 'Go 代码台 · 发布门禁与金丝雀回滚',
    description:
      '把前 13 门课的证据合成两个毕业实验：第一部分做发布门禁聚合，第二部分模拟金丝雀窗口中的错误率、延迟和业务指标，作出继续或回滚决定并验证可逆性。',
    ...goRuntime,
    practice: {
      id: 'go-remaining-graduation-gates-guided',
      title: '跟做：发布证据门禁',
      brief:
        'stdin 提供测试、安全、性能、可用性和回滚证据。程序逐项执行硬门禁，输出通过、阻断和缺失证据；只有全部必需项满足时才允许发布。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type tests struct {
	Passed   bool ` + "`json:\"passed\"`" + String.raw`
	Coverage int  ` + "`json:\"coverage\"`" + String.raw`
}

type security struct {
	Critical int ` + "`json:\"critical\"`" + String.raw`
	High     int ` + "`json:\"high\"`" + String.raw`
}

type performance struct {
	P95MS int ` + "`json:\"p95ms\"`" + String.raw`
	SLOMS int ` + "`json:\"slo_ms\"`" + String.raw`
}

type availability struct {
	ErrorRate float64 ` + "`json:\"error_rate\"`" + String.raw`
	SLORate  float64 ` + "`json:\"slo_rate\"`" + String.raw`
}

type rollback struct {
	Artifact string ` + "`json:\"artifact\"`" + String.raw`
	Verified bool   ` + "`json:\"verified\"`" + String.raw`
}

type evidence struct {
	Tests          tests        ` + "`json:\"tests\"`" + String.raw`
	Security       security     ` + "`json:\"security\"`" + String.raw`
	Performance    performance  ` + "`json:\"performance\"`" + String.raw`
	Availability   availability ` + "`json:\"availability\"`" + String.raw`
	Rollback       rollback     ` + "`json:\"rollback\"`" + String.raw`
	Observability  bool         ` + "`json:\"observability\"`" + String.raw`
}

func main() {
	var value evidence
	if err := json.NewDecoder(os.Stdin).Decode(&value); err != nil {
		panic(err)
	}
	reasons := []string{}
	if !value.Tests.Passed || value.Tests.Coverage < 80 {
		reasons = append(reasons, "tests")
	}
	if value.Security.Critical > 0 || value.Security.High > 2 {
		reasons = append(reasons, "security")
	}
	if value.Performance.P95MS > value.Performance.SLOMS {
		reasons = append(reasons, "performance")
	}
	if value.Availability.ErrorRate > value.Availability.SLORate {
		reasons = append(reasons, "availability")
	}
	if value.Rollback.Artifact == "" || !value.Rollback.Verified {
		reasons = append(reasons, "rollback")
	}
	if !value.Observability {
		reasons = append(reasons, "observability")
	}
	decision := "go"
	if len(reasons) > 0 {
		decision = "hold"
	}
	fmt.Printf("decision=%s reasons=%s\n", decision, strings.Join(reasons, ","))
	if decision != "go" || len(reasons) != 0 {
		panic("release gate mismatch")
	}
}
`,
      },
      stdin:
        '{"tests":{"passed":true,"coverage":87},"security":{"critical":0,"high":1},"performance":{"p95ms":185,"slo_ms":250},"availability":{"error_rate":0.003,"slo_rate":0.005},"rollback":{"artifact":"orders@sha256:abc","verified":true},"observability":true}\n',
      checkpoint:
        '必须输出 decision=go、reasons= 为空，退出码为 0。任一硬门禁失败都必须输出 hold 及原因列表；缺少证据与明确失败同等阻断，不能用“暂未发现问题”代替通过。',
    },
    apply: {
      id: 'go-remaining-graduation-canary-apply',
      title: '独立实践：金丝雀指标与原子回滚',
      brief:
        'stdin 提供基线与金丝雀两窗口的错误率、P95 和转化率。程序计算相对延迟、允许错误预算和转化率守护条件，输出 continue 或 rollback；回滚必须恢复基线流量与版本。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type window struct {
	ErrorRate    float64 ` + "`json:\"error_rate\"`" + String.raw`
	P95MS        float64 ` + "`json:\"p95_ms\"`" + String.raw`
	Conversion   float64 ` + "`json:\"conversion\"`" + String.raw`
	SampleSize   int     ` + "`json:\"sample_size\"`" + String.raw`
}

type request struct {
	Baseline window ` + "`json:\"baseline\"`" + String.raw`
	Canary   window ` + "`json:\"canary\"`" + String.raw`
}

type state struct {
	StableRevision string
	CanaryPercent  int
}

func evaluate(base, canary window) []string {
	reasons := []string{}
	if canary.SampleSize < 200 {
		reasons = append(reasons, "insufficient_sample")
	}
	if canary.ErrorRate-base.ErrorRate > 0.01 {
		reasons = append(reasons, "error_rate")
	}
	if canary.P95MS > base.P95MS*1.25 {
		reasons = append(reasons, "latency")
	}
	if canary.Conversion < base.Conversion*0.95 {
		reasons = append(reasons, "conversion")
	}
	return reasons
}

func rollback(current state) state {
	current.CanaryPercent = 0
	current.StableRevision = "orders-v18"
	return current
}

func main() {
	var input request
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	reasons := evaluate(input.Baseline, input.Canary)
	decision := "continue"
	current := state{StableRevision: "orders-v18", CanaryPercent: 10}
	if len(reasons) > 0 {
		decision = "rollback"
		current = rollback(current)
	}
	fmt.Printf("decision=%s reasons=%s\n", decision, join(reasons))
	fmt.Printf("stable=%s canary_percent=%d\n", current.StableRevision, current.CanaryPercent)
	if decision != "rollback" || current.CanaryPercent != 0 ||
		current.StableRevision != "orders-v18" {
		panic("canary rollback mismatch")
	}
}

func join(values []string) string {
	result := ""
	for index, value := range values {
		if index > 0 {
			result += ","
		}
		result += value
	}
	return result
}
`,
      },
      stdin:
        '{"baseline":{"error_rate":0.004,"p95_ms":160,"conversion":0.12,"sample_size":500},"canary":{"error_rate":0.021,"p95_ms":212,"conversion":0.118,"sample_size":420}}\n',
      checkpoint:
        '必须输出 decision=rollback、reasons=error_rate,latency、stable=orders-v18、canary_percent=0，退出码为 0。回滚要同时恢复流量和稳定 revision；只看错误率合格而忽略样本量不足仍不能继续放量。',
    },
  },
} satisfies Readonly<Record<string, GoCodeLab>>;

export const LEARNING_CODE_LABS_GO_REMAINING: Readonly<
  Record<string, LearningV2CodeLab>
> = GO_REMAINING_CODE_LABS as unknown as Readonly<
  Record<string, LearningV2CodeLab>
>;
