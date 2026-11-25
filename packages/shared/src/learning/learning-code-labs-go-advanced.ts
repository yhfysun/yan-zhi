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
    '代码台只执行单个 main.go，不下载第三方模块。',
    '先按给定 stdin 运行跟做任务，再修改并运行独立实践。',
    '涉及框架名称的任务会明确区分标准库模拟与真实第三方运行时。',
  ],
  languages: ['go'],
} as const;

const GO_ADVANCED_CODE_LABS = {
  'programming:Go · goroutine、channel、select 与同步：errgroup、并发上限和取消传播': {
    title: 'Go 高级代码台 01 · 有界并发与首错取消',
    description:
      '不用第三方依赖实现 errgroup 的核心语义：信号量限制同时运行数，WaitGroup 建立完成边界，首个错误取消其余任务，所有结果按任务索引写回。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-errgroup-bounded-guided',
      title: '跟做：有界并发不靠猜',
      brief:
        'stdin 给出任务耗时和并发上限。补全最小 group，让任意时刻运行中的任务不超过 limit，并记录整个过程的峰值并发。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

type input struct {
	Jobs  []int
	Limit int
}

type group struct {
	sem  chan struct{}
	wg   sync.WaitGroup
	mu   sync.Mutex
	err  error
}

func newGroup(limit int) *group {
	return &group{sem: make(chan struct{}, limit)}
}

func (g *group) Go(task func() error) {
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		g.sem <- struct{}{}
		defer func() { <-g.sem }()
		if err := task(); err != nil {
			g.mu.Lock()
			if g.err == nil {
				g.err = err
			}
			g.mu.Unlock()
		}
	}()
}

func (g *group) Wait() error {
	g.wg.Wait()
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.err
}

func observePeak(current int64, peak *atomic.Int64) {
	for {
		previous := peak.Load()
		if current <= previous || peak.CompareAndSwap(previous, current) {
			return
		}
	}
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Limit < 1 || len(request.Jobs) == 0 {
		panic("limit and jobs must be non-empty")
	}

	results := make([]int, len(request.Jobs))
	var active atomic.Int64
	var peak atomic.Int64
	g := newGroup(request.Limit)
	for index, duration := range request.Jobs {
		index, duration := index, time.Duration(duration)*time.Millisecond
		g.Go(func() error {
			current := active.Add(1)
			observePeak(current, &peak)
			time.Sleep(duration)
			results[index] = index + 1
			active.Add(-1)
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		panic(err)
	}

	for index, value := range results {
		if value != index+1 {
			panic("concurrent result was not written by its owner goroutine")
		}
	}
	if peak.Load() > int64(request.Limit) {
		panic("semaphore limit was exceeded")
	}

	fmt.Printf("limit=%d peak=%d completed=%d\n", request.Limit, peak.Load(), len(results))
}
`,
      },
      stdin: '{"jobs":[30,10,20,15],"limit":2}\n',
      checkpoint:
        '输出必须含 limit=2、peak 不大于 2、completed=4，退出码为 0。把 semaphore 去掉后峰值可能变大，但短任务未必每次都能观察到；并发上限本身应靠结构约束，不能靠 sleep 碰运气。',
    },
    apply: {
      id: 'go-advanced-errgroup-first-error-independent',
      title: '独立实践：首个错误取消其余任务',
      brief:
        'stdin 给出多个任务，其中一个会失败。实现 group 的首错记录和广播取消，等待结束后验证失败任务只记录一次，未完成任务因 context 取消而退出。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"
)

type job struct {
	Name    string
	DelayMS int
	Fail    bool
}

type input struct {
	Jobs  []job
	Limit int
}

type group struct {
	ctx    context.Context
	cancel context.CancelCauseFunc
	sem    chan struct{}
	wg     sync.WaitGroup
	once   sync.Once
	err    error
}

func newGroup(parent context.Context, limit int) *group {
	ctx, cancel := context.WithCancelCause(parent)
	return &group{ctx: ctx, cancel: cancel, sem: make(chan struct{}, limit)}
}

func (g *group) Go(task func(context.Context) error) {
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		select {
		case g.sem <- struct{}{}:
			defer func() { <-g.sem }()
		case <-g.ctx.Done():
			return
		}
		if err := task(g.ctx); err != nil {
			g.once.Do(func() {
				g.err = err
				g.cancel(err)
			})
		}
	}()
}

func (g *group) Wait() error {
	g.wg.Wait()
	g.cancel(nil)
	return g.err
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}

	g := newGroup(context.Background(), request.Limit)
	var mu sync.Mutex
	completed := make([]string, 0)
	cancelled := 0
	for _, current := range request.Jobs {
		current := current
		g.Go(func(ctx context.Context) error {
			timer := time.NewTimer(time.Duration(current.DelayMS) * time.Millisecond)
			defer timer.Stop()
			select {
			case <-timer.C:
			case <-ctx.Done():
				mu.Lock()
				cancelled++
				mu.Unlock()
				return ctx.Err()
			}
			if current.Fail {
				return fmt.Errorf("job %s failed", current.Name)
			}
			mu.Lock()
			completed = append(completed, current.Name)
			mu.Unlock()
			return nil
		})
	}

	err := g.Wait()
	if err == nil || err.Error() != "job bad failed" {
		panic(fmt.Sprintf("unexpected first error: %v", err))
	}
	if !errors.Is(err, err) {
		panic("first error must remain observable")
	}
	if cancelled == 0 {
		panic("cancellation did not reach in-flight work")
	}

	fmt.Printf("first_error=%q completed=%v cancelled=%d\n", err, completed, cancelled)
}
`,
      },
      stdin:
        '{"jobs":[{"Name":"fast","DelayMS":10},{"Name":"bad","DelayMS":20,"Fail":true},{"Name":"slow","DelayMS":300},{"Name":"queued","DelayMS":10}],"limit":2}\n',
      checkpoint:
        '输出必须含 first_error="job bad failed"、至少一个 cancelled，且慢任务不会正常完成，退出码为 0。取消是协作式的：任务必须 select context、传递 ctx 或调用支持 ctx 的函数，单靠 cancel 不会杀死任意 goroutine。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：GMP 调度器和抢占': {
    title: 'Go 高级代码台 02 · GOMAXPROCS、运行队列与执行 trace',
    description:
      '从 stdin 控制 worker 数与循环规模，观察 GOMAXPROCS、生命周期和 execution trace。任务同时强调：goroutine 数量不等于 CPU 并行数，调度证据要来自 runtime 与 trace。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-gmp-workers-guided',
      title: '跟做：让多个 goroutine 排队执行',
      brief:
        '按 stdin 创建固定数量 worker，每个 worker 在 CPU 循环中定期 runtime.Gosched。运行前后读取 GOMAXPROCS 与 NumGoroutine，验证所有 worker 完成。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
)

type input struct {
	Workers    int
	Iterations int
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Workers < 1 || request.Iterations < 1 {
		panic("workers and iterations must be positive")
	}

	before := runtime.NumGoroutine()
	var completed atomic.Int64
	var group sync.WaitGroup
	for worker := 0; worker < request.Workers; worker++ {
		worker := worker
		group.Add(1)
		go func() {
			defer group.Done()
			total := uint64(worker + 1)
			for index := 0; index < request.Iterations; index++ {
				total = total*1664525 + 1013904223
				if index%256 == 0 {
					runtime.Gosched()
				}
			}
			if total == 0 {
				panic("very unlikely checksum collision")
			}
			completed.Add(1)
		}()
	}
	group.Wait()
	runtime.Gosched()
	after := runtime.NumGoroutine()

	fmt.Printf("gomaxprocs=%d workers=%d completed=%d goroutines_before=%d goroutines_after=%d\n",
		runtime.GOMAXPROCS(0), request.Workers, completed.Load(), before, after)
	if completed.Load() != int64(request.Workers) {
		panic("not all workers completed")
	}
	if runtime.GOMAXPROCS(0) < 1 {
		panic("invalid GOMAXPROCS")
	}
}
`,
      },
      stdin: '{"workers":6,"iterations":5000}\n',
      checkpoint:
        '输出必须含 completed=6、gomaxprocs 至少为 1，退出码为 0。GOMAXPROCS 是同时执行 Go 代码的 P 数量上限，不是 goroutine 数量；NumGoroutine 还会包含测试与运行时 goroutine。',
    },
    apply: {
      id: 'go-advanced-gmp-trace-independent',
      title: '独立实践：采集调度 trace 与 goroutine profile',
      brief:
        '按 stdin 临时调整 GOMAXPROCS，在 runtime/trace 中运行多轮生产者消费者，随后采集 goroutine profile。验证 trace 与 profile 都有字节，结束后恢复原 GOMAXPROCS。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"runtime/trace"
	"sync"
)

type input struct {
	Workers    int
	Iterations int
}

func runRound(workers, iterations int) int {
	jobs := make(chan int)
	var producers sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		producers.Add(1)
		go func() {
			defer producers.Done()
			for index := 0; index < iterations; index++ {
				jobs <- index
				runtime.Gosched()
			}
		}()
	}
	go func() {
		producers.Wait()
		close(jobs)
	}()

	var consumers sync.WaitGroup
	var mu sync.Mutex
	total := 0
	for worker := 0; worker < workers; worker++ {
		consumers.Add(1)
		go func() {
			defer consumers.Done()
			subtotal := 0
			for value := range jobs {
				subtotal += value
			}
			mu.Lock()
			total += subtotal
			mu.Unlock()
		}()
	}
	consumers.Wait()
	return total
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	old := runtime.GOMAXPROCS(request.Workers)
	defer runtime.GOMAXPROCS(old)

	var traceBuffer bytes.Buffer
	if err := trace.Start(&traceBuffer); err != nil {
		panic(err)
	}
	first := runRound(request.Workers, request.Iterations)
	second := runRound(request.Workers, request.Iterations)
	trace.Stop()

	var profile bytes.Buffer
	if err := pprof.Lookup("goroutine").WriteTo(&profile, 0); err != nil {
		panic(err)
	}

	fmt.Printf("gomaxprocs=%d trace_bytes=%d goroutine_profile_bytes=%d first=%d second=%d\n",
		runtime.GOMAXPROCS(0), traceBuffer.Len(), profile.Len(), first, second)
	if traceBuffer.Len() == 0 || profile.Len() == 0 {
		panic("trace or profile produced no evidence")
	}
	if first != second {
		panic("same input should produce the same checksum")
	}
}
`,
      },
      stdin: '{"workers":3,"iterations":400}\n',
      checkpoint:
        '输出必须含 gomaxprocs=3、非零 trace_bytes 与 goroutine_profile_bytes，退出码为 0。trace 展示一段时间线，goroutine profile 是某一时刻快照；两者用途不同，不能拿 profile 字节数证明调度公平。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：栈增长、逃逸分析与对象分配': {
    title: 'Go 高级代码台 03 · 逃逸、分配次数与预分配',
    description:
      '用 testing.AllocsPerRun 与 testing.Benchmark 测量分配，而不是凭“指针一定在堆上”的直觉判断。实验对比返回值逃逸和切片预分配的可观测差异。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-escape-allocs-guided',
      title: '跟做：用 AllocsPerRun 看逃逸',
      brief:
        '运行两个函数：一个只返回整数求和，另一个返回局部数组对象的指针。使用 testing.AllocsPerRun 多次测量每次调用的平均堆分配次数。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type node struct {
	Values [32]int
}

type input struct {
	Runs int
}

func stackSum(limit int) int {
	total := 0
	for value := 0; value < limit; value++ {
		total += value
	}
	return total
}

func escapedNode(seed int) *node {
	value := &node{}
	value.Values[0] = seed
	return value
}

var escapeSink any

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Runs < 1 {
		panic("runs must be positive")
	}

	stackAllocs := testing.AllocsPerRun(request.Runs, func() {
		if stackSum(1000) != 499500 {
			panic("sum mismatch")
		}
	})
	heapAllocs := testing.AllocsPerRun(request.Runs, func() {
		escapeSink = escapedNode(7)
		value := escapeSink.(*node)
		if value.Values[0] != 7 {
			panic("node mismatch")
		}
	})
	escapeSink = nil

	fmt.Printf("runs=%d stack_allocs_per_run=%.2f heap_allocs_per_run=%.2f\n",
		request.Runs, stackAllocs, heapAllocs)
	if heapAllocs <= stackAllocs {
		panic("returned local should expose a heap allocation")
	}
}
`,
      },
      stdin: '{"runs":100}\n',
      checkpoint:
        'heap_allocs_per_run 应明显大于 stack_allocs_per_run，退出码为 0。注释“可能逃逸”不是结论；最终应看编译器逃逸报告和 AllocsPerRun 实测。',
    },
    apply: {
      id: 'go-advanced-slice-preallocate-independent',
      title: '独立实践：预分配能否减少分配次数',
      brief:
        '按 stdin 的元素数量比较 append 不预分配与 make 预分配。使用 testing.Benchmark 输出两组的 AllocsPerOp，要求预分配严格更少。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type input struct {
	Items int
}

func appendWithoutCapacity(items int) []int {
	var values []int
	for index := 0; index < items; index++ {
		values = append(values, index)
	}
	return values
}

func appendWithCapacity(items int) []int {
	values := make([]int, 0, items)
	for index := 0; index < items; index++ {
		values = append(values, index)
	}
	return values
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Items < 1 {
		panic("items must be positive")
	}

	without := testing.Benchmark(func(b *testing.B) {
		for iteration := 0; iteration < b.N; iteration++ {
			values := appendWithoutCapacity(request.Items)
			if len(values) != request.Items {
				panic("length mismatch")
			}
		}
	})
	with := testing.Benchmark(func(b *testing.B) {
		for iteration := 0; iteration < b.N; iteration++ {
			values := appendWithCapacity(request.Items)
			if len(values) != request.Items {
				panic("length mismatch")
			}
		}
	})

	fmt.Printf("items=%d without_allocs=%d with_allocs=%d without_ns=%d with_ns=%d\n",
		request.Items,
		without.AllocsPerOp(),
		with.AllocsPerOp(),
		without.NsPerOp(),
		with.NsPerOp())
	if with.AllocsPerOp() >= without.AllocsPerOp() {
		panic("capacity hint did not reduce allocations")
	}
}
`,
      },
      stdin: '{"items":256}\n',
      checkpoint:
        'with_allocs 必须小于 without_allocs，退出码为 0。ns/op 会抖动，不应凭一次数字承诺固定加速倍数；分配次数的下降才是本实验稳定的结构证据。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：race、mutex、goroutine profile': {
    title: 'Go 高级代码台 04 · 锁竞争与运行时 profile',
    description:
      '用 mutex、block 和 goroutine profile 观察并发程序的运行态。每个 profile 都有采样边界，任务要求读取真实 profile 字节，同时说明 race 检测仍需独立 go test -race。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-mutex-profile-guided',
      title: '跟做：采集 mutex profile',
      brief:
        '按 stdin 创建多个 goroutine 竞争同一把锁。启用 mutex profiling，完成并发写入后写出 profile，并比较并发前后的 goroutine 数量。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"sync"
	"time"
)

type input struct {
	Workers int
	Rounds  int
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Workers < 2 || request.Rounds < 1 {
		panic("need at least two workers and one round")
	}

	runtime.SetMutexProfileFraction(1)
	defer runtime.SetMutexProfileFraction(0)
	before := runtime.NumGoroutine()

	var mu sync.Mutex
	total := 0
	var group sync.WaitGroup
	for worker := 0; worker < request.Workers; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for round := 0; round < request.Rounds; round++ {
				mu.Lock()
				total++
				time.Sleep(time.Millisecond)
				mu.Unlock()
			}
		}()
	}
	group.Wait()
	runtime.Gosched()
	after := runtime.NumGoroutine()

	var profile bytes.Buffer
	if profile.Len() == 0 {
		if err := pprof.Lookup("mutex").WriteTo(&profile, 0); err != nil {
			panic(err)
		}
	}

	fmt.Printf("workers=%d total=%d mutex_profile_bytes=%d goroutines_before=%d goroutines_after=%d\n",
		request.Workers, total, profile.Len(), before, after)
	if total != request.Workers*request.Rounds {
		panic("mutex-protected counter lost an update")
	}
	if profile.Len() == 0 {
		panic("mutex profile is empty")
	}
}
`,
      },
      stdin: '{"workers":4,"rounds":20}\n',
      checkpoint:
        'total 必须等于 workers*rounds，mutex_profile_bytes 必须大于 0，退出码为 0。mutex profile 依赖采样率和实际竞争；它不会替你发现所有数据竞争，发布前仍应在测试中运行 go test -race。',
    },
    apply: {
      id: 'go-advanced-block-goroutine-profile-independent',
      title: '独立实践：同时采集 block 与 goroutine profile',
      brief:
        '按 stdin 制造 channel 与 mutex 阻塞，开启 block profiling，结束后分别写出 block 和 goroutine profile。验证两份证据都非空，且等待组让所有 worker 已退出。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"sync"
	"time"
)

type input struct {
	Workers int
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Workers < 2 {
		panic("at least two workers are required")
	}

	runtime.SetBlockProfileRate(1)
	defer runtime.SetBlockProfileRate(0)
	var mu sync.Mutex
	var group sync.WaitGroup
	for worker := 0; worker < request.Workers; worker++ {
		group.Add(1)
		go func(worker int) {
			defer group.Done()
			time.Sleep(time.Duration(worker+1) * time.Millisecond)
			mu.Lock()
			time.Sleep(2 * time.Millisecond)
			mu.Unlock()
		}(worker)
	}
	group.Wait()

	var block bytes.Buffer
	var goroutines bytes.Buffer
	if err := pprof.Lookup("block").WriteTo(&block, 0); err != nil {
		panic(err)
	}
	if err := pprof.Lookup("goroutine").WriteTo(&goroutines, 0); err != nil {
		panic(err)
	}

	fmt.Printf("workers=%d block_profile_bytes=%d goroutine_profile_bytes=%d\n",
		request.Workers, block.Len(), goroutines.Len())
	if block.Len() == 0 || goroutines.Len() == 0 {
		panic("profile evidence missing")
	}
}
`,
      },
      stdin: '{"workers":6}\n',
      checkpoint:
        '两份 profile 字节都必须大于 0，退出码为 0。block profile 记录阻塞事件累计，goroutine profile 记录当前栈快照；先明确问题再选 profile，比盲抓所有文件更有效。',
    },
  },

  'programming:Go · GMP、GC、内存与运行时诊断：Go 性能调优报告': {
    title: 'Go 高级代码台 05 · 基准证据与调优结论',
    description:
      '把“更快”拆成可复现的基准、方差与结论边界。先比较两种查找策略，再运行多轮基准、取中位数并生成一份带原始指标和局限说明的性能报告。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-perf-lookup-guided',
      title: '跟做：比较线性扫描与 map 查找',
      brief:
        '按 stdin 构造固定数据，使用 testing.Benchmark 对比线性扫描与 map 查找。输出两组 ns/op 和分配次数，并确保两者结果一致。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type input struct {
	Items int
}

func linearContains(values []int, target int) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Items < 32 {
		panic("items must be at least 32")
	}

	values := make([]int, request.Items)
	index := make(map[int]struct{}, request.Items)
	for item := 0; item < request.Items; item++ {
		values[item] = item
		index[item] = struct{}{}
	}
	target := request.Items - 1
	if !linearContains(values, target) {
		panic("fixture mismatch")
	}
	if _, ok := index[target]; !ok {
		panic("map fixture mismatch")
	}

	linear := testing.Benchmark(func(b *testing.B) {
		for iteration := 0; iteration < b.N; iteration++ {
			if !linearContains(values, target) {
				panic("linear lookup failed")
			}
		}
	})
	mapped := testing.Benchmark(func(b *testing.B) {
		for iteration := 0; iteration < b.N; iteration++ {
			if _, ok := index[target]; !ok {
				panic("map lookup failed")
			}
		}
	})

	fmt.Printf("items=%d linear_ns=%d linear_allocs=%d map_ns=%d map_allocs=%d\n",
		request.Items,
		linear.NsPerOp(),
		linear.AllocsPerOp(),
		mapped.NsPerOp(),
		mapped.AllocsPerOp())
	if mapped.NsPerOp() >= linear.NsPerOp() {
		panic("map lookup should win for this middle-of-slice fixture")
	}
}
`,
      },
      stdin: '{"items":256}\n',
      checkpoint:
        'map_ns 应小于 linear_ns，退出码为 0。这个结果只说明固定 256 项、查找靠后位置的本机数据；不能外推成所有规模、所有命中位置都同样快。',
    },
    apply: {
      id: 'go-advanced-perf-median-report-independent',
      title: '独立实践：多轮基准中位数与调优报告',
      brief:
        '按 stdin 构造有序数据，分别测量线性查找和二分查找三次。取 ns/op 中位数，生成包含规模、两组中位数、胜出算法和适用边界的报告。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

type input struct {
	Items int
}

func linearSearch(values []int, target int) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}

func binarySearch(values []int, target int) int {
	low, high := 0, len(values)-1
	for low <= high {
		middle := low + (high-low)/2
		switch {
		case values[middle] < target:
			low = middle + 1
		case values[middle] > target:
			high = middle - 1
		default:
			return middle
		}
	}
	return -1
}

func median(values []int64) int64 {
	sort.Slice(values, func(left, right int) bool {
		return values[left] < values[right]
	})
	return values[len(values)/2]
}

func measure(iterations int, operation func()) int64 {
	for warmup := 0; warmup < 1000; warmup++ {
		operation()
	}
	start := time.Now()
	for iteration := 0; iteration < iterations; iteration++ {
		operation()
	}
	return time.Since(start).Nanoseconds() / int64(iterations)
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Items < 256 {
		panic("items must be at least 256")
	}

	values := make([]int, request.Items)
	for index := range values {
		values[index] = index
	}
	target := request.Items - 1
	if linearSearch(values, target) != binarySearch(values, target) {
		panic("fixture lookup mismatch")
	}

	linearRuns := make([]int64, 0, 3)
	binaryRuns := make([]int64, 0, 3)
	for run := 0; run < 3; run++ {
		linearRuns = append(linearRuns, measure(20000, func() {
			_ = linearSearch(values, target)
		}))
		binaryRuns = append(binaryRuns, measure(20000, func() {
			_ = binarySearch(values, target)
		}))
	}

	linearMedian := median(linearRuns)
	binaryMedian := median(binaryRuns)
	winner := "binary-search"
	if linearMedian <= binaryMedian {
		winner = "linear-search"
	}
	fmt.Printf("items=%d linear_ns_median=%d binary_ns_median=%d winner=%s\n",
		request.Items, linearMedian, binaryMedian, winner)
	fmt.Println("boundary=sorted-data,single-process,last-element-hit; validate other distributions before changing production")
	if winner != "binary-search" {
		panic("binary search should win for a large sorted fixture")
	}
}
`,
      },
      stdin: '{"items":4096}\n',
      checkpoint:
        'winner=binary-search，且报告同时打印样本边界，退出码为 0。中位数比单次 ns 值稳健，但仍需控制机器负载、输入规模和命中位置；生产结论还要看 CPU profile 与真实流量分布。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：database/sql、事务和 sqlc': {
    title: 'Go 高级代码台 06 · SQL 接口、事务边界与回滚',
    description:
      '用 memory store 模拟 database/sql 的 Queryer、Row、Tx 契约，不伪装成真实数据库驱动。重点学习参数边界、ErrNoRows 语义、事务快照和失败回滚。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-sql-queryer-guided',
      title: '跟做：Queryer 与 ErrNoRows',
      brief:
        '实现最小 Queryer/Row 接口，让内存存储按参数返回订单。查询包含 tenant 条件，不存在时返回 sql.ErrNoRows，调用方映射为稳定的业务错误。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

type input struct {
	OrderID string
	Tenant  string
}

type order struct {
	ID     string
	Tenant string
	Total  int
}

type row interface {
	Scan(dest ...any) error
}

type queryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) row
}

type scanRow struct {
	order order
	err   error
}

func (r scanRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*dest[0].(*string) = r.order.ID
	*dest[1].(*int) = r.order.Total
	return nil
}

type memoryDB struct {
	orders map[string]order
}

func (db memoryDB) QueryRowContext(_ context.Context, query string, args ...any) row {
	const expected = "select id,total from orders where id=$1 and tenant=$2"
	if query != expected || len(args) != 2 {
		panic("parameterized query contract violated")
	}
	id, okID := args[0].(string)
	tenant, okTenant := args[1].(string)
	if !okID || !okTenant {
		panic("query arguments must be strings")
	}
	value, found := db.orders[id]
	if !found || value.Tenant != tenant {
		return scanRow{err: sql.ErrNoRows}
	}
	return scanRow{order: value}
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	db := memoryDB{orders: map[string]order{
		"O-1": {ID: "O-1", Tenant: "acme", Total: 4200},
	}}

	var id string
	var total int
	err := db.QueryRowContext(context.Background(),
		"select id,total from orders where id=$1 and tenant=$2",
		request.OrderID, request.Tenant).Scan(&id, &total)
	if errors.Is(err, sql.ErrNoRows) {
		fmt.Println("order=not-found")
		if request.Tenant != "acme" {
			return
		}
		panic("known fixture should be found")
	}
	if err != nil {
		panic(err)
	}
	fmt.Printf("order=%s tenant=%s total=%d\n", id, request.Tenant, total)
}
`,
      },
      stdin: '{"OrderID":"O-1","Tenant":"acme"}\n',
      checkpoint:
        '必须输出 order=O-1 tenant=acme total=4200，退出码为 0。把 stdin 的 Tenant 改成 globex 后应输出 order=not-found；Queryer 是标准库的接口形状模拟，不是实际数据库连接。',
    },
    apply: {
      id: 'go-advanced-sql-transaction-independent',
      title: '独立实践：事务提交与失败回滚',
      brief:
        '实现 BeginTx、ExecContext、Commit 与 Rollback。按 stdin 执行转账，在扣款后模拟后续失败，验证内存快照回滚后双方余额都不变。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

type input struct {
	Balances        map[string]int
	From            string
	To              string
	Amount          int
	FailAfterDebit bool
}

type store struct {
	balances map[string]int
}

type tx struct {
	balances map[string]int
	done     bool
}

func (t *tx) ExecContext(_ context.Context, query string, args ...any) error {
	if t.done || query != "update accounts set balance=balance+$2 where id=$1" {
		return errors.New("invalid transaction state or query")
	}
	id, okID := args[0].(string)
	delta, okDelta := args[1].(int)
	if !okID || !okDelta {
		return errors.New("invalid transaction arguments")
	}
	next := t.balances[id] + delta
	if next < 0 {
		return errors.New("insufficient funds")
	}
	t.balances[id] = next
	return nil
}

func (t *tx) Commit() error {
	if t.done {
		return errors.New("transaction already finished")
	}
	t.done = true
	return nil
}

func (t *tx) Rollback() error {
	if !t.done {
		t.done = true
	}
	return nil
}

func (s *store) BeginTx(ctx context.Context) (*tx, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	snapshot := make(map[string]int, len(s.balances))
	for id, balance := range s.balances {
		snapshot[id] = balance
	}
	return &tx{balances: snapshot}, nil
}

func transfer(ctx context.Context, s *store, input input) (err error) {
	tx, err := s.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	const update = "update accounts set balance=balance+$2 where id=$1"
	if err = tx.ExecContext(ctx, update, input.From, -input.Amount); err != nil {
		return err
	}
	if input.FailAfterDebit {
		err = errors.New("simulated downstream failure")
		return err
	}
	if err = tx.ExecContext(ctx, update, input.To, input.Amount); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	s.balances = tx.balances
	return nil
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Amount <= 0 {
		panic("transfer amount must be positive")
	}
	database := &store{balances: request.Balances}
	err := transfer(context.Background(), database, request)
	if err == nil || err.Error() != "simulated downstream failure" {
		panic("expected injected failure")
	}
	if database.balances[request.From] != request.Balances[request.From] ||
		database.balances[request.To] != request.Balances[request.To] {
		panic("rollback did not restore balances")
	}
	fmt.Printf("rollback=%t from=%d to=%d error=%q\n",
		true,
		database.balances[request.From],
		database.balances[request.To],
		err)
}
`,
      },
      stdin:
        '{"Balances":{"A":100,"B":50},"From":"A","To":"B","Amount":30,"FailAfterDebit":true}\n',
      checkpoint:
        '必须输出 rollback=true from=100 to=50，并保留注入错误文本，退出码为 0。这是事务契约模拟；真实 database/sql 还要处理 context 取消、隔离级别、提交错误不确定性和连接池耗尽。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：认证、授权、限流和请求 ID': {
    title: 'Go 高级代码台 07 · HMAC 令牌、对象授权与限流',
    description:
      '只用标准库完成 HMAC-SHA256 令牌验签、audience 与过期检查，再在请求入口串联对象归属检查、按租户限流和请求 ID 清洗。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-auth-hmac-guided',
      title: '跟做：手工构造并验证 HMAC 令牌',
      brief:
        '按 stdin 的 secret、subject、audience 和 TTL 生成三段式令牌。验证签名、audience 与 exp，篡改 payload 后必须验签失败。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type input struct {
	Secret   string
	Subject  string
	Audience string
	TTL      int
}

type claims struct {
	Sub string
	Aud string
	Exp int64
}

func encode(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func signature(secret, unsigned string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func issue(secret, subject, audience string, ttl time.Duration) string {
	header := encode(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload := encode(claims{Sub: subject, Aud: audience, Exp: time.Now().Add(ttl).Unix()})
	unsigned := header + "." + payload
	return unsigned + "." + signature(secret, unsigned)
}

func verify(secret, audience, token string) (claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return claims{}, fmt.Errorf("invalid segments")
	}
	unsigned := parts[0] + "." + parts[1]
	expected := signature(secret, unsigned)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return claims{}, fmt.Errorf("signature mismatch")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims{}, err
	}
	var parsed claims
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return claims{}, err
	}
	if parsed.Aud != audience {
		return claims{}, fmt.Errorf("audience mismatch")
	}
	if time.Now().Unix() >= parsed.Exp {
		return claims{}, fmt.Errorf("token expired")
	}
	return parsed, nil
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Secret == "" || request.Audience == "" || request.TTL < 1 {
		panic("invalid token fixture")
	}
	token := issue(request.Secret, request.Subject, request.Audience, time.Duration(request.TTL)*time.Second)
	parsed, err := verify(request.Secret, request.Audience, token)
	if err != nil || parsed.Sub != request.Subject {
		panic(fmt.Sprintf("valid token rejected: %v", err))
	}

	parts := strings.Split(token, ".")
	parts[1] = encode(claims{Sub: "attacker", Aud: request.Audience, Exp: parsed.Exp})
	if _, err := verify(request.Secret, request.Audience, strings.Join(parts, ".")); err == nil {
		panic("tampered token passed verification")
	}
	fmt.Printf("subject=%s audience=%s segments=%d tamper_rejected=true\n",
		parsed.Sub, parsed.Aud, len(strings.Split(token, ".")))
}
`,
      },
      stdin:
        '{"Secret":"local-development-secret","Subject":"alice","Audience":"orders-api","TTL":60}\n',
      checkpoint:
        '必须输出 subject=alice、audience=orders-api、segments=3、tamper_rejected=true，退出码为 0。真实系统还要验证 issuer、允许算法、时钟偏差和密钥轮换；示例手写 JWT 是为了展示验签结构，不是推荐自研认证协议。',
    },
    apply: {
      id: 'go-advanced-authz-rate-limit-independent',
      title: '独立实践：对象授权、租户桶和请求 ID',
      brief:
        '按 stdin 处理订单请求：先清洗请求 ID，再检查订单归属，最后从对应租户桶取令牌。输出每步状态，验证越权与超限不会读取订单数据。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
)

type request struct {
	RequestID string
	Tenant    string
	Order     string
	Refill    int
}

type input struct {
	Owners   map[string]string
	Capacity int
	Requests []request
}

type bucket struct {
	tokens   int
	capacity int
}

var safeID = regexp.MustCompile("^[A-Za-z0-9._-]{1,32}$")

func sanitizeID(value string) string {
	value = strings.TrimSpace(value)
	if safeID.MatchString(value) {
		return value
	}
	return "generated-request"
}

func main() {
	var fixture input
	if err := json.NewDecoder(os.Stdin).Decode(&fixture); err != nil {
		panic(err)
	}
	if fixture.Capacity < 1 || len(fixture.Requests) == 0 {
		panic("capacity and requests must be non-empty")
	}
	buckets := make(map[string]*bucket)
	statuses := make([]string, 0, len(fixture.Requests))
	for _, request := range fixture.Requests {
		id := sanitizeID(request.RequestID)
		tenantBucket := buckets[request.Tenant]
		if tenantBucket == nil {
			tenantBucket = &bucket{tokens: fixture.Capacity, capacity: fixture.Capacity}
			buckets[request.Tenant] = tenantBucket
		}
		if request.Refill > 0 {
			tenantBucket.tokens += request.Refill
			if tenantBucket.tokens > tenantBucket.capacity {
				tenantBucket.tokens = tenantBucket.capacity
			}
		}
		if fixture.Owners[request.Order] != request.Tenant {
			statuses = append(statuses, "404:"+id)
			continue
		}
		if tenantBucket.tokens == 0 {
			statuses = append(statuses, "429:"+id)
			continue
		}
		tenantBucket.tokens--
		statuses = append(statuses, "200:"+id)
	}
	fmt.Printf("statuses=%s\n", strings.Join(statuses, ","))

	joined := strings.Join(statuses, ",")
	for _, expected := range []string{"404:req-2", "429:generated-request", "200:req-5"} {
		if !strings.Contains(joined, expected) {
			panic("missing status " + expected)
		}
	}
}
`,
      },
      stdin:
        '{"Owners":{"O-1":"acme"},"Capacity":2,"Requests":[{"RequestID":"req-1","Tenant":"acme","Order":"O-1"},{"RequestID":"req-2","Tenant":"globex","Order":"O-1"},{"RequestID":"req-3","Tenant":"acme","Order":"O-1"},{"RequestID":"bad id with spaces","Tenant":"acme","Order":"O-1"},{"RequestID":"req-5","Tenant":"acme","Order":"O-1","Refill":1}]}\n',
      checkpoint:
        'statuses 必须依次含 200:req-1、404:req-2、200:req-3、429:generated-request、200:req-5，退出码为 0。业务应先判断对象存在与归属，再把详情返回给调用方；限流键也要按租户和资源维度设计，避免一个租户耗尽所有桶。',
    },
  },

  'programming:Go · net/http、Gin、gRPC 与数据访问：gRPC、protobuf、超时和拦截器': {
    title: 'Go 高级代码台 08 · 帧协议、方法路由与 deadline 传播',
    description:
      '标准库没有 gRPC 运行时，本实验用长度前缀帧和 net.Pipe 模拟远程方法调用边界。重点验证方法路由、错误码与 deadline 如何跨进程边界传播。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-rpc-frame-routing-guided',
      title: '跟做：长度前缀帧与方法路由',
      brief:
        '通过 net.Pipe 发送一个四字节长度前缀加 JSON 负载的帧。服务端读取方法名并路由到 GetOrder，客户端验证响应负载。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
)

type request struct {
	Method string
	ID     string
}

type frame struct {
	Method  string
	Payload json.RawMessage
}

func writeFrame(writer io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(payload) > 1<<20 {
		return fmt.Errorf("frame too large")
	}
	if err := binary.Write(writer, binary.BigEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = writer.Write(payload)
	return err
}

func readFrame(reader io.Reader, target any) error {
	var length uint32
	if err := binary.Read(reader, binary.BigEndian, &length); err != nil {
		return err
	}
	if length == 0 || length > 1<<20 {
		return fmt.Errorf("invalid frame length %d", length)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return err
	}
	return json.Unmarshal(payload, target)
}

func main() {
	var stdinRequest request
	if err := json.NewDecoder(os.Stdin).Decode(&stdinRequest); err != nil {
		panic(err)
	}
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()

	go func() {
		var incoming frame
		if err := readFrame(server, &incoming); err != nil {
			panic(err)
		}
		if incoming.Method != "OrderService.GetOrder" {
			_ = writeFrame(server, map[string]string{"code": "Unimplemented"})
			return
		}
		var payload map[string]string
		if err := json.Unmarshal(incoming.Payload, &payload); err != nil {
			panic(err)
		}
		_ = writeFrame(server, map[string]string{"code": "OK", "id": payload["id"]})
	}()

	payload, _ := json.Marshal(map[string]string{"id": stdinRequest.ID})
	if err := writeFrame(client, frame{Method: stdinRequest.Method, Payload: payload}); err != nil {
		panic(err)
	}
	var response map[string]string
	if err := readFrame(client, &response); err != nil {
		panic(err)
	}
	fmt.Printf("method=%s code=%s id=%s\n",
		stdinRequest.Method, response["code"], response["id"])
	if response["code"] != "OK" || response["id"] != stdinRequest.ID {
		panic("rpc response mismatch")
	}
}
`,
      },
      stdin: '{"Method":"OrderService.GetOrder","ID":"O-1"}\n',
      checkpoint:
        '必须输出 method=OrderService.GetOrder code=OK id=O-1，退出码为 0。真实 gRPC 使用 HTTP/2、protobuf 和 grpc-status；这里是传输边界模拟，不声称兼容线协议。',
    },
    apply: {
      id: 'go-advanced-rpc-deadline-independent',
      title: '独立实践：服务端识别 deadline 并返回状态码',
      brief:
        '在自定义帧中传递绝对 deadline。服务端用 context.WithDeadline 执行慢任务，短预算请求返回 DeadlineExceeded，长预算请求返回 OK。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"time"
)

type input struct {
	DelayMS           int
	ShortDeadlineMS   int
	LongDeadlineMS    int
}

type request struct {
	Method           string
	DelayMS          int
	DeadlineUnixNano int64
}

type response struct {
	Code    string
	Message string
}

func writeFrame(writer io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := binary.Write(writer, binary.BigEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = writer.Write(payload)
	return err
}

func readFrame(reader io.Reader, target any) error {
	var length uint32
	if err := binary.Read(reader, binary.BigEndian, &length); err != nil {
		return err
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return err
	}
	return json.Unmarshal(payload, target)
}

func execute(ctx context.Context, delay time.Duration) response {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return response{Code: "OK", Message: "order returned"}
	case <-ctx.Done():
		return response{Code: "DeadlineExceeded", Message: ctx.Err().Error()}
	}
}

func main() {
	var fixture input
	if err := json.NewDecoder(os.Stdin).Decode(&fixture); err != nil {
		panic(err)
	}
	if fixture.DelayMS < 30 || fixture.ShortDeadlineMS >= fixture.DelayMS ||
		fixture.LongDeadlineMS <= fixture.DelayMS {
		panic("deadline fixture must straddle the work duration")
	}
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()

	go func() {
		for call := 0; call < 2; call++ {
			var incoming request
			if err := readFrame(server, &incoming); err != nil {
				panic(err)
			}
			ctx, cancel := context.WithDeadline(context.Background(), time.Unix(0, incoming.DeadlineUnixNano))
			result := execute(ctx, time.Duration(incoming.DelayMS)*time.Millisecond)
			cancel()
			if err := writeFrame(server, result); err != nil {
				panic(err)
			}
		}
	}()

	budgets := []int{fixture.ShortDeadlineMS, fixture.LongDeadlineMS}
	codes := make([]string, 0, len(budgets))
	for _, budget := range budgets {
		deadline := time.Now().Add(time.Duration(budget) * time.Millisecond)
		if err := writeFrame(client, request{
			Method:           "OrderService.GetOrder",
			DelayMS:          fixture.DelayMS,
			DeadlineUnixNano: deadline.UnixNano(),
		}); err != nil {
			panic(err)
		}
		var result response
		if err := readFrame(client, &result); err != nil {
			panic(err)
		}
		codes = append(codes, result.Code)
	}
	fmt.Printf("codes=%v\n", codes)
	if codes[0] != "DeadlineExceeded" || codes[1] != "OK" {
		panic("deadline propagation mismatch")
	}
}
`,
      },
      stdin: '{"DelayMS":80,"ShortDeadlineMS":20,"LongDeadlineMS":250}\n',
      checkpoint:
        'codes 必须为 [DeadlineExceeded OK]，退出码为 0。真实 gRPC 会把剩余预算编码到 grpc-timeout，并在服务端 ctx 上恢复 deadline；传播 deadline 只是第一步，下游数据库与 HTTP 调用也必须使用同一个 ctx。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：slog、开放遥测和 requestId': {
    title: 'Go 高级代码台 09 · 结构化日志、子 logger 与脱敏',
    description:
      '使用标准库 log/slog 输出稳定 JSON，让 request ID 成为日志字段；再对账号、令牌和密码做字段级脱敏，验证原始秘密没有进入日志流。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-slog-json-guided',
      title: '跟做：稳定 JSON 日志与请求字段',
      brief:
        '按 stdin 构造一条请求完成日志。替换时间字段保证输出可比较，写入 method、path、status、duration_ms 和 request_id，再解析 JSON 验证字段。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
)

type input struct {
	RequestID string
	Method    string
	Path      string
	Status    int
	DurationMS int64
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	var buffer bytes.Buffer
	handler := slog.NewJSONHandler(&buffer, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.TimeKey {
				return slog.String("ts", "fixed")
			}
			return attr
		},
	})
	logger := slog.New(handler).With(
		slog.String("request_id", request.RequestID),
	)
	logger.Info("request.completed",
		slog.String("method", request.Method),
		slog.String("path", request.Path),
		slog.Int("status", request.Status),
		slog.Int64("duration_ms", request.DurationMS),
	)

	fmt.Print(buffer.String())
	var fields map[string]any
	if err := json.Unmarshal(buffer.Bytes(), &fields); err != nil {
		panic(err)
	}
	if fields["request_id"] != request.RequestID || fields["status"] != float64(request.Status) {
		panic("structured field mismatch")
	}
}
`,
      },
      stdin:
        '{"RequestID":"req-7f21","Method":"GET","Path":"/orders/O-1","Status":200,"DurationMS":12}\n',
      checkpoint:
        '输出必须是可解析的 JSON，含固定 ts=fixed、request_id=req-7f21、status=200，退出码为 0。生产环境通常保留真实时间戳；这里固定时间是为了让实验输出可重复。',
    },
    apply: {
      id: 'go-advanced-slog-redaction-independent',
      title: '独立实践：秘密字段脱敏且不进入日志',
      brief:
        '按 stdin 接收用户、邮箱、密码、令牌和 Authorization。构造子 logger 与字段白名单，对敏感值统一替换为 [REDACTED]，验证日志文本不含原始秘密。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

type input struct {
	RequestID     string
	User          string
	Email         string
	Password      string
	Token         string
	Authorization string
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	var buffer bytes.Buffer
	handler := slog.NewJSONHandler(&buffer, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.TimeKey {
				return slog.String("ts", "fixed")
			}
			return attr
		},
	})
	logger := slog.New(handler).With(slog.String("request_id", request.RequestID))
	logger.Info("auth.attempt",
		slog.String("user", request.User),
		slog.String("email", request.Email),
		slog.String("password", "[REDACTED]"),
		slog.String("token", "[REDACTED]"),
		slog.String("authorization", "[REDACTED]"),
	)

	text := buffer.String()
	fmt.Print(text)
	for _, secret := range []string{request.Password, request.Token, request.Authorization} {
		if secret != "" && strings.Contains(text, secret) {
			panic("raw secret leaked into log")
		}
	}
	if !strings.Contains(text, "[REDACTED]") {
		panic("redaction marker missing")
	}
}
`,
      },
      stdin:
        '{"RequestID":"req-8a10","User":"alice","Email":"alice@example.com","Password":"p@ss-secret","Token":"tok_live_123","Authorization":"Bearer bearer-secret"}\n',
      checkpoint:
        '日志必须包含 [REDACTED]，且不包含 p@ss-secret、tok_live_123 或 bearer-secret，退出码为 0。脱敏应发生在构造字段白名单处；把整个请求对象直接 slog.Any 序列化时，嵌套秘密很容易绕过检查。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：指标、Trace、告警和运行手册': {
    title: 'Go 高级代码台 10 · RED 指标、告警与 trace 串接',
    description:
      '从请求样本计算 rate、errors、duration 分位数与告警判定，再用 context 和固定 span 关系串起三个服务。所有数据都来自 stdin，避免伪造随时间变化的监控输出。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-red-metrics-guided',
      title: '跟做：计算 RED 指标与告警',
      brief:
        '按 stdin 的延迟和状态码计算请求数、错误率、p95 与是否告警。阈值由输入给出，程序输出计数和判定，不依赖 Prometheus 或 Grafana。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type input struct {
	Latencies []int64
	Statuses  []int
	P95LimitMS int64
	ErrorLimit float64
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if len(request.Latencies) == 0 || len(request.Latencies) != len(request.Statuses) {
		panic("latencies and statuses must be non-empty and equal length")
	}
	errors := 0
	for _, status := range request.Statuses {
		if status >= 500 {
			errors++
		}
	}
	sort.Slice(request.Latencies, func(left, right int) bool {
		return request.Latencies[left] < request.Latencies[right]
	})
	index := int(float64(len(request.Latencies))*0.95+0.999999) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(request.Latencies) {
		index = len(request.Latencies) - 1
	}
	p95 := request.Latencies[index]
	errorRate := float64(errors) / float64(len(request.Statuses))
	p95Alert := p95 > request.P95LimitMS
	errorAlert := errorRate > request.ErrorLimit

	fmt.Printf("requests=%d errors=%d error_rate=%.3f p95_ms=%d p95_alert=%t error_alert=%t\n",
		len(request.Statuses), errors, errorRate, p95, p95Alert, errorAlert)
	if !p95Alert || !errorAlert {
		panic("fixture should trigger both alert rules")
	}
}
`,
      },
      stdin:
        '{"Latencies":[10,20,30,40,50,900],"Statuses":[200,200,200,200,500,503],"P95LimitMS":500,"ErrorLimit":0.1}\n',
      checkpoint:
        'requests=6、errors=2、p95_ms=900，两条告警都必须为 true，退出码为 0。分位数要明确窗口、样本量和算法；少量请求的 p95 很敏感，不能把一次短窗口结果当成长期容量结论。',
    },
    apply: {
      id: 'go-advanced-trace-propagation-independent',
      title: '独立实践：跨服务保持 trace 与 parent span',
      brief:
        '按 stdin 的 trace ID 与服务列表顺序模拟三次调用。context 携带父 span，每层生成确定性子 span，最终输出可检查的 parent 链。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

type input struct {
	TraceID    string
	RootSpanID string
	Services   []string
}

type spanKey struct{}

type span struct {
	TraceID  string
	SpanID   string
	ParentID string
	Service  string
}

func childID(parent, service string) string {
	sum := sha256.Sum256([]byte(parent + "|" + service))
	return hex.EncodeToString(sum[:8])
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.TraceID == "" || request.RootSpanID == "" || len(request.Services) == 0 {
		panic("trace fixture is incomplete")
	}
	ctx := context.WithValue(context.Background(), spanKey{}, span{
		TraceID: request.TraceID,
		SpanID:  request.RootSpanID,
	})
	spans := make([]span, 0, len(request.Services))
	parent := request.RootSpanID
	for _, service := range request.Services {
		incoming := ctx.Value(spanKey{}).(span)
		next := span{
			TraceID:  incoming.TraceID,
			SpanID:   childID(incoming.SpanID, service),
			ParentID: incoming.SpanID,
			Service:  service,
		}
		spans = append(spans, next)
		ctx = context.WithValue(ctx, spanKey{}, next)
		parent = next.SpanID
	}
	data, err := json.Marshal(spans)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(data))
	for index, current := range spans {
		if current.TraceID != request.TraceID {
			panic("trace id changed across service boundary")
		}
		if index == 0 && current.ParentID != request.RootSpanID {
			panic("first parent mismatch")
		}
		if index > 0 && current.ParentID != spans[index-1].SpanID {
			panic("parent chain broken")
		}
	}
	if spans[len(spans)-1].SpanID != parent {
		panic("last child id mismatch")
	}
}
`,
      },
      stdin:
        '{"TraceID":"4bf92f3577b34da6a3ce929d0e0e4736","RootSpanID":"00f067aa0ba902b7","Services":["gateway","orders","database"]}\n',
      checkpoint:
        '输出必须是三段 span 的 JSON，三者 TraceID 相同，第二段 parent 等于第一段 SpanID，第三段 parent 等于第二段 SpanID，退出码为 0。生产中应由 OpenTelemetry SDK 注入传播头；这里演示 context 与父子关系，不替代 OTel 协议实现。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：质量门禁与故障注入实验': {
    title: 'Go 高级代码台 11 · 可重复故障注入与测试门禁',
    description:
      '先让 HTTP 入口按确定规则注入 503，再在临时模块中运行真实 go test -cover，把测试结果和覆盖率合并成质量门禁。故障必须可复现，门禁必须能失败。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-fault-injection-guided',
      title: '跟做：每 N 次请求注入 503',
      brief:
        '按 stdin 的请求数和故障间隔启动 httptest 服务。每次请求递增序号，命中间隔时返回 503，其余返回 200，验证成功与失败计数。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
)

type input struct {
	Requests     int
	FailureEvery int
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Requests < 1 || request.FailureEvery < 1 {
		panic("requests and failure interval must be positive")
	}
	var sequence atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		current := sequence.Add(1)
		if current%int64(request.FailureEvery) == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(w, "{\"error\":\"injected\"}")
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok")
	}))
	defer server.Close()

	success, failure := 0, 0
	for index := 0; index < request.Requests; index++ {
		response, err := http.Get(server.URL)
		if err != nil {
			panic(err)
		}
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
		switch response.StatusCode {
		case http.StatusOK:
			success++
		case http.StatusServiceUnavailable:
			failure++
		default:
			panic(fmt.Sprintf("unexpected status %d", response.StatusCode))
		}
	}
	fmt.Printf("requests=%d success=%d failure=%d\n", request.Requests, success, failure)
	if sequence.Load() != int64(request.Requests) || failure != request.Requests/request.FailureEvery {
		panic("fault injection count mismatch")
	}
}
`,
      },
      stdin: '{"Requests":7,"FailureEvery":3}\n',
      checkpoint:
        '必须输出 requests=7 success=5 failure=2，退出码为 0。按序号注入可重复；按随机比例注入往往会让失败用例时过时不过，调试成本更高。',
    },
    apply: {
      id: 'go-advanced-quality-gate-independent',
      title: '独立实践：真实 go test 覆盖率门禁',
      brief:
        '按 stdin 的最低覆盖率创建临时 Go 模块，写入实现与测试，运行 go test -cover。只有测试 PASS 且覆盖率达标时门禁才输出 PASS。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type input struct {
	MinCoverage float64
}

var coveragePattern = regexp.MustCompile("coverage: ([0-9.]+)% of statements")

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.MinCoverage < 0 || request.MinCoverage > 100 {
		panic("coverage threshold must be in [0,100]")
	}
	directory, err := os.MkdirTemp("", "go-quality-gate-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(directory)

	files := map[string]string{
		"go.mod": "module lab.local/quality\n\ngo 1.22\n",
		"calc.go": "package quality\n\nfunc Add(left, right int) int {\n\treturn left + right\n}\n",
		"calc_test.go": "package quality\n\nimport \"testing\"\n\nfunc TestAdd(t *testing.T) {\n\tif got := Add(2, 3); got != 5 {\n\t\tt.Fatalf(\"Add(2,3)=%d\", got)\n\t}\n}\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0o600); err != nil {
			panic(err)
		}
	}
	command := exec.Command("go", "test", "-count=1", "-cover", ".")
	command.Dir = directory
	command.Env = append(os.Environ(), "GOWORK=off")
	output, err := command.CombinedOutput()
	text := strings.TrimSpace(string(output))
	if err != nil {
		panic(fmt.Sprintf("go test failed: %v\n%s", err, text))
	}
	match := coveragePattern.FindStringSubmatch(text)
	if len(match) != 2 {
		panic("coverage output missing")
	}
	coverage, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		panic(err)
	}
	passed := coverage >= request.MinCoverage
	fmt.Printf("gate=%s coverage=%.1f minimum=%.1f\n",
		map[bool]string{true: "PASS", false: "FAIL"}[passed],
		coverage,
		request.MinCoverage)
	if !passed {
		panic("quality gate did not pass")
	}
}
`,
      },
      stdin: '{"MinCoverage":90}\n',
      checkpoint:
        '必须输出 gate=PASS coverage=100.0 minimum=90.0，退出码为 0。把阈值改成 100.1 会在入口校验失败；把实现分支改成未覆盖分支则会看到真实覆盖率下降。门禁要能失败，否则只是装饰。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：配置、秘密和健康检查': {
    title: 'Go 高级代码台 12 · 配置校验、秘密摘要与就绪状态',
    description:
      '解析环境变量式配置，校验类型并避免把秘密原文输出；再用 atomic.Value 发布不可变配置快照，让 readiness 只在配置有效且依赖可用时成功。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-config-validation-guided',
      title: '跟做：解析 KEY=VALUE 并保护秘密',
      brief:
        '按 stdin 读取环境变量文本，校验 PORT、LOG_LEVEL 和必填 DATABASE_URL、JWT_SECRET。输出端口、日志级别与秘密 SHA-256 前缀，绝不输出原秘密。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func parseEnvironment() map[string]string {
	values := make(map[string]string)
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(key) == "" {
			panic("invalid environment line: " + line)
		}
		values[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
	return values
}

func main() {
	values := parseEnvironment()
	for _, required := range []string{"DATABASE_URL", "JWT_SECRET"} {
		if values[required] == "" {
			panic("missing required variable " + required)
		}
	}
	port, err := strconv.Atoi(values["PORT"])
	if err != nil || port < 1 || port > 65535 {
		panic("PORT must be in [1,65535]")
	}
	level := strings.ToLower(values["LOG_LEVEL"])
	allowed := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
	if !allowed[level] {
		panic("invalid LOG_LEVEL")
	}
	sum := sha256.Sum256([]byte(values["JWT_SECRET"]))
	fingerprint := hex.EncodeToString(sum[:])[:12]
	rendered := fmt.Sprintf("port=%d log_level=%s database_configured=%t secret_fingerprint=%s\n",
		port, level, values["DATABASE_URL"] != "", fingerprint)
	fmt.Print(rendered)
	if strings.Contains(rendered, values["JWT_SECRET"]) {
		panic("secret should not be part of rendered configuration")
	}
}
`,
      },
      stdin:
        'PORT=8080\nLOG_LEVEL=info\nDATABASE_URL=postgres://app@db/orders\nJWT_SECRET=local-secret-value\n',
      checkpoint:
        '输出必须含 port=8080、log_level=info、database_configured=true 和 12 位 secret_fingerprint，且不含 local-secret-value，退出码为 0。指纹用于关联轮换版本，不可被当成认证凭据。',
    },
    apply: {
      id: 'go-advanced-config-health-independent',
      title: '独立实践：原子配置快照与 readiness',
      brief:
        '按 stdin 依次加载两个候选配置。非法候选必须被拒绝且旧快照保留；合法候选发布后，readiness 还要检查数据库和缓存探针。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"time"
)

type config struct {
	Port       int
	DatabaseURL string
	CacheURL   string
	TimeoutMS  int
}

type input struct {
	Configs        []config
	RequiredChecks []string
}

type store struct {
	snapshot atomic.Value
}

func validate(value config) error {
	if value.Port < 1 || value.Port > 65535 {
		return errors.New("invalid port")
	}
	if value.DatabaseURL == "" || value.CacheURL == "" {
		return errors.New("dependency URL missing")
	}
	if value.TimeoutMS < 1 || value.TimeoutMS > 30000 {
		return errors.New("invalid timeout")
	}
	return nil
}

func (s *store) reload(next config) error {
	if err := validate(next); err != nil {
		return err
	}
	s.snapshot.Store(next)
	return nil
}

func (s *store) load() config {
	return s.snapshot.Load().(config)
}

func ready(current config, required []string, checks map[string]func(config) error) bool {
	for _, name := range required {
		check := checks[name]
		if check == nil || check(current) != nil {
			return false
		}
	}
	return true
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if len(request.Configs) != 2 {
		panic("fixture needs one rejected and one accepted config")
	}
	initial := config{Port: 8080, DatabaseURL: "db:5432", CacheURL: "cache:6379", TimeoutMS: 500}
	var configuration store
	configuration.snapshot.Store(initial)
	checks := map[string]func(config) error{
		"database": func(value config) error {
			if value.DatabaseURL == "" {
				return errors.New("db unavailable")
			}
			return nil
		},
		"cache": func(value config) error {
			if value.CacheURL == "" {
				return errors.New("cache unavailable")
			}
			return nil
		},
	}

	firstErr := configuration.reload(request.Configs[0])
	if firstErr == nil || configuration.load() != initial {
		panic("invalid config replaced the last known good snapshot")
	}
	if err := configuration.reload(request.Configs[1]); err != nil {
		panic(err)
	}
	current := configuration.load()
	isReady := ready(current, request.RequiredChecks, checks)
	fmt.Printf("first_reload=%q accepted_port=%d ready=%t\n",
		firstErr.Error(), current.Port, isReady)
	if !isReady {
		panic("valid config should be ready")
	}
	time.Sleep(time.Millisecond)
}
`,
      },
      stdin:
        '{"Configs":[{"Port":0,"DatabaseURL":"db:5432","CacheURL":"cache:6379","TimeoutMS":500},{"Port":9090,"DatabaseURL":"db:5432","CacheURL":"cache:6379","TimeoutMS":800}],"RequiredChecks":["database","cache"]}\n',
      checkpoint:
        '必须输出 first_reload="invalid port" accepted_port=9090 ready=true，退出码为 0。liveness 只回答进程是否可运行，readiness 才检查下游依赖；配置重载失败时保留最后一个合法快照是生产系统的基本边界。',
    },
  },

  'programming:Go · 容器、Kubernetes 与生产交付：优雅停机与连接排空': {
    title: 'Go 高级代码台 13 · 在途请求完成后再停机',
    description:
      '用 httptest 与 http.Server.Shutdown 建立真实连接生命周期。先验证 Shutdown 等待在途请求，再验证监听关闭后新请求被拒绝且所有已接收请求完成。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-shutdown-inflight-guided',
      title: '跟做：Shutdown 等待在途请求',
      brief:
        '服务处理一个会阻塞的请求。收到 Shutdown 后先确认它没有立即返回，再释放处理器。客户端应收到 200，Shutdown 随后成功结束。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"time"
)

type input struct {
	ShutdownTimeoutMS int
}

type responseResult struct {
	status int
	err    error
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "finished")
	}))
	server.Start()
	defer server.Close()

	responses := make(chan responseResult, 1)
	go func() {
		response, err := http.Get(server.URL)
		if err != nil {
			responses <- responseResult{err: err}
			return
		}
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
		responses <- responseResult{status: response.StatusCode}
	}()
	<-started

	shutdownDone := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(),
			time.Duration(request.ShutdownTimeoutMS)*time.Millisecond)
		defer cancel()
		shutdownDone <- server.Config.Shutdown(ctx)
	}()
	select {
	case err := <-shutdownDone:
		panic(fmt.Sprintf("shutdown returned before in-flight request completed: %v", err))
	case <-time.After(20 * time.Millisecond):
	}
	close(release)

	result := <-responses
	if result.err != nil || result.status != http.StatusOK {
		panic(fmt.Sprintf("in-flight response failed: status=%d err=%v", result.status, result.err))
	}
	if err := <-shutdownDone; err != nil {
		panic(err)
	}
	fmt.Printf("inflight_status=%d shutdown_completed=true\n", result.status)
}
`,
      },
      stdin: '{"ShutdownTimeoutMS":1000}\n',
      checkpoint:
        '必须输出 inflight_status=200 shutdown_completed=true，退出码为 0。Shutdown 会关闭监听并等待空闲或完成的连接；给出过短 context 时它会提前返回 deadline exceeded，调用方必须处理该错误。',
    },
    apply: {
      id: 'go-advanced-shutdown-drain-independent',
      title: '独立实践：并发在途请求与新连接拒绝',
      brief:
        '按 stdin 启动多个并发慢请求。发起 Shutdown 后确认新请求失败，再释放在途请求；所有已接收请求都必须完成 200，等待组与 HTTP 服务器都干净结束。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"time"
)

type input struct {
	Requests  int
	TimeoutMS int
}

type result struct {
	status int
	err    error
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.Requests < 1 || request.TimeoutMS < 100 {
		panic("invalid shutdown fixture")
	}
	started := make(chan struct{}, request.Requests)
	release := make(chan struct{})
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		started <- struct{}{}
		<-release
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok")
	}))
	server.Start()
	defer server.Close()

	results := make(chan result, request.Requests)
	var clients sync.WaitGroup
	for index := 0; index < request.Requests; index++ {
		clients.Add(1)
		go func() {
			defer clients.Done()
			response, err := http.Get(server.URL)
			if err != nil {
				results <- result{err: err}
				return
			}
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			results <- result{status: response.StatusCode}
		}()
	}
	for index := 0; index < request.Requests; index++ {
		<-started
	}

	shutdownDone := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(),
			time.Duration(request.TimeoutMS)*time.Millisecond)
		defer cancel()
		shutdownDone <- server.Config.Shutdown(ctx)
	}()
	time.Sleep(20 * time.Millisecond)

	httpClient := &http.Client{Timeout: 100 * time.Millisecond}
	if response, err := httpClient.Get(server.URL); err == nil {
		_ = response.Body.Close()
		panic("new connection succeeded after listener shutdown")
	}

	close(release)
	clients.Wait()
	close(results)
	completed := 0
	for result := range results {
		if result.err != nil || result.status != http.StatusOK {
			panic(fmt.Sprintf("in-flight request failed: status=%d err=%v", result.status, result.err))
		}
		completed++
	}
	if err := <-shutdownDone; err != nil {
		panic(err)
	}
	fmt.Printf("completed=%d new_connections_rejected=true shutdown_completed=true\n", completed)
	if completed != request.Requests {
		panic("drain lost an accepted request")
	}
}
`,
      },
      stdin: '{"Requests":3,"TimeoutMS":1500}\n',
      checkpoint:
        '必须输出 completed=3 new_connections_rejected=true shutdown_completed=true，退出码为 0。Kubernetes 场景还要先让 readiness 失败、等待负载均衡摘流，再调用 Shutdown；只调用 Shutdown 无法阻止摘流前的流量突刺。',
    },
  },

  'programming:Go · 测试、模糊、集成与可观测性：httptest、容器集成测试': {
    title: 'Go 高级代码台 14 · Recorder、真实 Server 与重试边界',
    description:
      '先用 httptest.ResponseRecorder 单测中间件与错误状态，再启动真实 httptest.Server 验证客户端对 503 的有界重试、请求头和响应体。',
    ...goRuntime,
    practice: {
      id: 'go-advanced-httptest-recorder-guided',
      title: '跟做：Recorder 驱动中间件链',
      brief:
        '按 stdin 构造 POST 请求。中间件检查 Content-Type，不合法时返回 415；Recorder 捕获状态码、请求 ID 和响应体，不需要占用网络端口。',
      defaultLanguage: 'go',
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
)

type input struct {
	ContentType string
	RequestID   string
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = "generated"
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

func jsonOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "unsupported media type", http.StatusUnsupportedMediaType)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	handler := requestID(jsonOnly(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("created"))
	})))
	req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader("{}"))
	req.Header.Set("Content-Type", request.ContentType)
	req.Header.Set("X-Request-ID", request.RequestID)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	fmt.Printf("status=%d request_id=%s body=%s\n",
		recorder.Code,
		recorder.Header().Get("X-Request-ID"),
		strings.TrimSpace(recorder.Body.String()))
	if recorder.Code != http.StatusUnsupportedMediaType ||
		recorder.Header().Get("X-Request-ID") != request.RequestID {
		panic("middleware recorder contract mismatch")
	}
}
`,
      },
      stdin: '{"ContentType":"text/plain","RequestID":"req-recorder-1"}\n',
      checkpoint:
        '必须输出 status=415 request_id=req-recorder-1 body=unsupported media type，退出码为 0。Recorder 适合处理器和中间件单测；真实监听、连接复用和超时行为仍需 httptest.Server 或容器级集成测试。',
    },
    apply: {
      id: 'go-advanced-httptest-retry-independent',
      title: '独立实践：真实 Server 上的有界重试',
      brief:
        '按 stdin 设置服务在第 N 次请求成功，客户端只对 503 做有限次重试。验证请求头透传、最终 200、重试次数和响应体，超出上限必须失败。',
      defaultLanguage: "go",
      starterCode: {
        go: String.raw`package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"time"
)

type input struct {
	SucceedAt int
	MaxRetries int
}

func main() {
	var request input
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	if request.SucceedAt < 1 || request.MaxRetries < 0 ||
		request.SucceedAt-1 > request.MaxRetries {
		panic("retry budget cannot reach success")
	}
	var attempts atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := int(attempts.Add(1))
		if current < request.SucceedAt {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(w, "retry")
			return
		}
		w.Header().Set("X-Request-ID", r.Header.Get("X-Request-ID"))
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "accepted")
	}))
	defer server.Close()

	client := &http.Client{Timeout: time.Second}
	status, body, requestID := 0, "", ""
	for retry := 0; retry <= request.MaxRetries; retry++ {
		req, err := http.NewRequest(http.MethodGet, server.URL+"/orders/O-1", nil)
		if err != nil {
			panic(err)
		}
		req.Header.Set("X-Request-ID", "req-7f21")
		response, err := client.Do(req)
		if err != nil {
			panic(err)
		}
		payload, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			panic(readErr)
		}
		status = response.StatusCode
		body = string(payload)
		requestID = response.Header.Get("X-Request-ID")
		if status != http.StatusServiceUnavailable {
			break
		}
	}
	fmt.Printf("status=%d body=%s request_id=%s attempts=%d\n",
		status, body, requestID, attempts.Load())
	if status != http.StatusOK || body != "accepted" ||
		requestID != "req-7f21" || attempts.Load() != int64(request.SucceedAt) {
		panic("retry integration contract mismatch")
	}
}
`,
      },
      stdin: '{"SucceedAt":3,"MaxRetries":3}\n',
      checkpoint:
        '必须输出 status=200 body=accepted request_id=req-7f21 attempts=3，退出码为 0。只应对 503、连接失败等可安全重试条件做有界退避；非幂等请求、4xx 和超预算重试都不应盲目重复。',
    },
  },
} satisfies Readonly<Record<string, GoCodeLab>>;

export const LEARNING_CODE_LABS_GO_ADVANCED: Readonly<
  Record<string, LearningV2CodeLab>
> = GO_ADVANCED_CODE_LABS as unknown as Readonly<
  Record<string, LearningV2CodeLab>
>;
